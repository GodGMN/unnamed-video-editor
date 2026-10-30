import type { SourceInfo } from './probe';

export interface ConvertOptions {
  /** Target short-side length in pixels; `null` keeps the source size. Never upscales. */
  shortSide: number | null;
  /** Target frame rate; `null` keeps the source rate. Never raises it. */
  fps: number | null;
}

export interface ConvertProgress {
  stage: 'load' | 'convert' | 'save';
  /** Seconds of source media converted so far. */
  mediaTime: number;
  /** Media seconds converted per wall-clock second. */
  speed: number;
}

export interface OutputSpec { width: number; height: number; fps: number }

export class OutOfMemoryError extends Error {
  /** Media time reached before the converter ran out of memory. */
  constructor(readonly at: number) { super('The converter ran out of memory.'); }
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function outputSpec(src: SourceInfo, opts: ConvertOptions): OutputSpec {
  const short = Math.min(src.width, src.height);
  const scale = opts.shortSide && opts.shortSide < short ? opts.shortSide / short : 1;
  return {
    width: even(src.width * scale),
    height: even(src.height * scale),
    fps: opts.fps && opts.fps < src.fps ? opts.fps : src.fps,
  };
}

/**
 * Loads ffmpeg.wasm (single-threaded core, so no cross-origin isolation needed).
 * The wrapper, core and 32 MB wasm are only fetched when this runs, keeping them out of the main bundle.
 */
async function loadFFmpeg() {
  const [{ FFmpeg, FFFSType }, { default: coreURL }, { default: wasmURL }] = await Promise.all([
    import('@ffmpeg/ffmpeg'),
    import('@ffmpeg/core?url'),
    import('@ffmpeg/core/wasm?url'),
  ]);
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({ coreURL, wasmURL });
  return { ffmpeg, WORKERFS: FFFSType.WORKERFS };
}

const parseTime = (s: string) => {
  const m = /time=(-?)(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
  return m && !m[1] ? +m[2] * 3600 + +m[3] * 60 + +m[4] : null;
};

/** Converts any file ffmpeg can read to H.264 + AAC MP4. Rejects with an AbortError when `signal` aborts. */
export async function convertToMp4(
  file: File,
  src: SourceInfo,
  opts: ConvertOptions,
  onProgress: (p: ConvertProgress) => void,
  signal: AbortSignal,
): Promise<Blob> {
  onProgress({ stage: 'load', mediaTime: 0, speed: 0 });
  const { ffmpeg, WORKERFS } = await loadFFmpeg();
  const abort = () => ffmpeg.terminate();
  signal.addEventListener('abort', abort);
  try {
    signal.throwIfAborted();
    const out = outputSpec(src, opts);
    const filters = [];
    if (out.width !== src.width || out.height !== src.height) filters.push(`scale=${out.width}:${out.height}:flags=bicubic`);
    if (out.fps !== src.fps) filters.push(`fps=${out.fps}`);

    let mediaTime = 0;
    let log = '';
    const t0 = performance.now();
    ffmpeg.on('log', ({ message }) => {
      log = (log + message + '\n').slice(-4000);
      const t = parseTime(message);
      if (t === null) return;
      mediaTime = Math.min(t, src.duration);
      onProgress({ stage: 'convert', mediaTime, speed: mediaTime / ((performance.now() - t0) / 1000) });
    });

    // WORKERFS reads the File lazily instead of copying it into the wasm heap.
    await ffmpeg.createDir('/in');
    await ffmpeg.mount(WORKERFS, { files: [file] }, '/in');
    onProgress({ stage: 'convert', mediaTime: 0, speed: 0 });
    let code: number;
    try {
      code = await ffmpeg.exec([
        '-hide_banner', '-nostdin', '-stats_period', '0.5',
        '-i', `/in/${file.name}`,
        '-map', '0:v:0', '-map', '0:a:0?',
        ...(filters.length ? ['-vf', filters.join(',')] : []),
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '21', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '160k',
        '-movflags', '+faststart',
        '/out.mp4',
      ]);
    } catch (e) {
      if (signal.aborted) throw signal.reason;
      throw /memory|OOM|Aborted|out of bounds/i.test(String(e)) ? new OutOfMemoryError(mediaTime) : e;
    }
    if (/out of memory|Cannot allocate/i.test(log)) throw new OutOfMemoryError(mediaTime);
    if (code !== 0) throw new Error(log.trim().split('\n').at(-1) || `ffmpeg exited with code ${code}`);

    onProgress({ stage: 'save', mediaTime: src.duration, speed: src.duration / ((performance.now() - t0) / 1000) });
    const data = await ffmpeg.readFile('/out.mp4');
    if (typeof data === 'string') throw new Error('Unexpected text output from ffmpeg.');
    return new Blob([data as Uint8Array<ArrayBuffer>], { type: 'video/mp4' });
  } finally {
    signal.removeEventListener('abort', abort);
    // Each job gets a fresh instance; terminating frees the wasm heap (often >1 GB after a large file).
    ffmpeg.terminate();
  }
}
