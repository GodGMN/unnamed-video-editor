// Browser-only MP4 export: frames come from a callback on the calling thread, encoding (WebCodecs) and
// muxing (Mediabunny) run in a worker, and the result is an H.264 + AAC MP4 Blob.

import type {
  AacEncoderKind,
  EncodeSettings,
  ExportErrorCode,
  FromWorker,
  PlanarAudio,
  QualitySetting,
  SupportReport,
  ToWorker,
} from './protocol';

export type { AacEncoderKind, ExportErrorCode, PlanarAudio, QualitySetting, SupportReport };

export interface FrameRequest {
  /** Zero-based frame number. */
  index: number;
  /** Presentation time of the frame, in seconds. */
  time: number;
}

/**
 * What `renderFrame` may return. Images are copied immediately, so a single canvas can be redrawn for every frame.
 * A returned `VideoFrame` is transferred to the encoder and closed by it.
 */
export type FrameImage = VideoFrame | Exclude<CanvasImageSource, SVGImageElement> | OffscreenCanvas;

export interface ExportProgress {
  phase: 'encoding' | 'finalizing';
  /** Frames the encoder has accepted. */
  framesDone: number;
  totalFrames: number;
  /** 0–1 across the whole export. */
  fraction: number;
}

export interface ExportOptions {
  /** Output size in pixels. H.264 needs both to be even. */
  width: number;
  height: number;
  fps: number;
  /** Length of the export, in seconds. */
  duration: number;
  /** Called once per frame, in order. Must return an image of exactly `width`×`height`. */
  renderFrame: (frame: FrameRequest) => FrameImage | Promise<FrameImage>;
  /** Mixed-down audio for the whole export, starting at 0 s. Omit for a silent MP4 with no audio track. */
  audio?: AudioBuffer | PlanarAudio;
  /** Defaults to `'high'`. A number is a bitrate in bits per second. */
  videoQuality?: QualitySetting;
  /** Defaults to `'high'`. A number is a bitrate in bits per second. */
  audioQuality?: QualitySetting;
  onProgress?: (progress: ExportProgress) => void;
  /** Aborting stops the export, tears down the worker and rejects with the signal's reason. */
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  /** Full MIME type including codec strings, e.g. `video/mp4; codecs="avc1.640028, mp4a.40.2"`. */
  mimeType: string;
  frameCount: number;
  /** Which AAC encoder was used, or `null` when there is no audio track. */
  aacEncoder: AacEncoderKind | null;
}

export class ExportError extends Error {
  readonly code: ExportErrorCode;

  constructor(code: ExportErrorCode, message: string) {
    super(message);
    this.name = 'ExportError';
    this.code = code;
  }
}

/** Frames sent to the worker but not yet accepted by the encoder. Bounds GPU memory held by pending frames. */
const MAX_FRAMES_IN_FLIGHT = 4;

const spawnWorker = () =>
  new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module', name: 'mp4-export' });

/**
 * Reports whether this browser can export at the given size, and which AAC encoder it would use.
 * Runs in a short-lived worker so the answer matches the context that does the encoding.
 */
export async function probeExportSupport(query: {
  width: number;
  height: number;
  fps: number;
  audio?: { sampleRate: number; numberOfChannels: number };
}): Promise<SupportReport> {
  const worker = spawnWorker();
  try {
    return await new Promise<SupportReport>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<FromWorker>) => {
        if (e.data.type === 'probe') resolve(e.data.report);
        else if (e.data.type === 'error') reject(new ExportError(e.data.code, e.data.message));
      };
      worker.onerror = (e) => reject(new ExportError('encode-failed', e.message || 'Export worker failed to load.'));
      send(worker, { type: 'probe', query: { ...query, audio: query.audio ?? null } });
    });
  } finally {
    worker.terminate();
  }
}

export async function exportMp4(options: ExportOptions): Promise<ExportResult> {
  const { width, height, fps, duration, renderFrame, onProgress, signal } = options;
  validate(options);
  signal?.throwIfAborted();

  const frameCount = Math.max(1, Math.round(duration * fps));
  const settings: EncodeSettings = {
    width, height, fps, frameCount,
    videoQuality: options.videoQuality ?? 'high',
    audioQuality: options.audioQuality ?? 'high',
  };
  const audio = options.audio ? toPlanar(options.audio) : null;

  // Worker events land in this state; `waitUntil` re-checks it after every event.
  let ready: { aac: AacEncoderKind | null } | null = null;
  let framesDone = 0;
  let finalizing = false;
  let done: { buffer: ArrayBuffer; mimeType: string } | null = null;
  let failure: Error | null = null;
  let wake: (() => void) | null = null;

  const report = () => onProgress?.({
    phase: finalizing ? 'finalizing' : 'encoding',
    framesDone,
    totalFrames: frameCount,
    fraction: finalizing ? (done ? 1 : 0.99) : 0.99 * framesDone / frameCount,
  });

  const worker = spawnWorker();
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    switch (msg.type) {
      case 'ready': ready = { aac: msg.aac }; break;
      case 'frame': framesDone = msg.index + 1; report(); break;
      case 'finalizing': finalizing = true; report(); break;
      case 'done': done = msg; break;
      case 'error': failure = new ExportError(msg.code, msg.message); break;
    }
    wake?.();
  };
  worker.onerror = (e) => {
    failure ??= new ExportError('encode-failed', e.message || 'Export worker crashed.');
    wake?.();
  };
  const onAbort = () => wake?.();
  signal?.addEventListener('abort', onAbort);

  const waitUntil = async (condition: () => boolean) => {
    for (;;) {
      signal?.throwIfAborted();
      if (failure) throw failure;
      if (condition()) return;
      await new Promise<void>((resolve) => { wake = resolve; });
      wake = null;
    }
  };

  try {
    send(worker, { type: 'start', settings, audio }, audio ? audio.channels.map((c) => c.buffer as ArrayBuffer) : []);
    await waitUntil(() => ready !== null);
    report();

    for (let index = 0; index < frameCount; index++) {
      await waitUntil(() => index - framesDone < MAX_FRAMES_IN_FLIGHT);
      const frame = toVideoFrame(await renderFrame({ index, time: index / fps }), index, fps);
      if (frame.displayWidth !== width || frame.displayHeight !== height) {
        const got = `${frame.displayWidth}×${frame.displayHeight}`;
        frame.close();
        throw new ExportError('invalid-frame', `Frame ${index} is ${got}, expected ${width}×${height}.`);
      }
      send(worker, { type: 'frame', index, frame }, [frame]);
    }

    send(worker, { type: 'finish' });
    await waitUntil(() => done !== null);
    report();
    const result = done!;
    return {
      blob: new Blob([result.buffer], { type: 'video/mp4' }),
      mimeType: result.mimeType,
      frameCount,
      aacEncoder: ready!.aac,
    };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    worker.terminate();
  }
}

function send(worker: Worker, msg: ToWorker, transfer: Transferable[] = []) {
  worker.postMessage(msg, transfer);
}

function validate({ width, height, fps, duration, audio }: ExportOptions) {
  const fail = (message: string) => { throw new ExportError('invalid-options', message); };
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    fail(`Size must be positive whole pixels, got ${width}×${height}.`);
  }
  if (width % 2 || height % 2) fail(`H.264 needs an even width and height, got ${width}×${height}.`);
  if (!(fps > 0)) fail(`Frame rate must be positive, got ${fps}.`);
  if (!(duration > 0) || !Number.isFinite(duration)) fail(`Duration must be positive, got ${duration}.`);
  if (audio && !isAudioBuffer(audio)) {
    const lengths = new Set(audio.channels.map((c) => c.length));
    if (!audio.channels.length || lengths.size !== 1) fail('Audio channels must be non-empty and equally long.');
  }
}

const isAudioBuffer = (audio: AudioBuffer | PlanarAudio): audio is AudioBuffer =>
  typeof AudioBuffer !== 'undefined' && audio instanceof AudioBuffer;

/** Copies the samples so they can be transferred to the worker without detaching the caller's buffers. */
function toPlanar(audio: AudioBuffer | PlanarAudio): PlanarAudio {
  if (isAudioBuffer(audio)) {
    const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => {
      const data = new Float32Array(audio.length);
      audio.copyFromChannel(data, i);
      return data;
    });
    return { sampleRate: audio.sampleRate, channels };
  }
  return { sampleRate: audio.sampleRate, channels: audio.channels.map((c) => c.slice()) };
}

function toVideoFrame(image: FrameImage, index: number, fps: number) {
  if (image instanceof VideoFrame) return image;
  return new VideoFrame(image, { timestamp: Math.round(index * 1e6 / fps), duration: Math.round(1e6 / fps) });
}
