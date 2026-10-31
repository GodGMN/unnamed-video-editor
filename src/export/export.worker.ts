import { t as translate, setLocale } from '../i18n/core';
// Encodes frames and audio posted by `exportMp4` into an in-memory MP4 (H.264 + AAC).
// Messages are handled strictly in order; see protocol.ts for the shapes.

import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSample,
  VideoSampleSource,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import type {
  AacEncoderKind,
  EncodeSettings,
  ExportErrorCode,
  FromWorker,
  PlanarAudio,
  SupportQuery,
  ToWorker,
} from './protocol';

// The project compiles against the DOM lib, so describe just the worker scope we use.
const scope = self as unknown as {
  postMessage(msg: FromWorker, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker & { locale?: string }>) => void) | null;
};

class WorkerError extends Error {
  constructor(readonly code: ExportErrorCode, message: string) {
    super(message);
  }
}

interface Job {
  settings: EncodeSettings;
  output: Output<Mp4OutputFormat, BufferTarget>;
  video: VideoSampleSource;
  audio: { source: AudioSampleSource; data: PlanarAudio; written: number; total: number } | null;
}

let job: Job | null = null;
let failed = false;
let queue = Promise.resolve();
let wasmAacRegistered = false;

const post = (msg: FromWorker, transfer: Transferable[] = []) => scope.postMessage(msg, transfer);

scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.locale) setLocale(msg.locale);
  if (failed) {
    if (msg.type === 'frame') msg.frame.close();
    return;
  }
  queue = queue.then(() => handle(msg)).catch((err: unknown) => {
    failed = true;
    if (msg.type === 'frame') msg.frame.close();
    const code = err instanceof WorkerError ? err.code : 'encode-failed';
    post({ type: 'error', code, message: err instanceof Error ? err.message : String(err) });
    void job?.output.cancel();
  });
};

async function handle(msg: ToWorker) {
  switch (msg.type) {
    case 'probe': return post({ type: 'probe', report: await probe(msg.query) });
    case 'start': return start(msg.settings, msg.audio);
    case 'frame': return addFrame(msg.index, msg.frame);
    case 'finish': return finish();
  }
}

async function probe({ width, height, fps, audio }: SupportQuery) {
  const webCodecs = typeof VideoEncoder !== 'undefined';
  const h264 = webCodecs && await canEncodeVideo('avc', { width, height, frameRate: fps });
  const aac = audio ? await resolveAac(audio.sampleRate, audio.numberOfChannels) : await resolveAac(48000, 2);
  return { webCodecs, h264, aac };
}

/** Prefers the browser's AAC encoder and falls back to the WASM build of FFmpeg's. */
async function resolveAac(sampleRate: number, numberOfChannels: number): Promise<AacEncoderKind | null> {
  const opts = { sampleRate, numberOfChannels };
  if (!wasmAacRegistered && await canEncodeAudio('aac', opts)) return 'native';
  if (!wasmAacRegistered) {
    const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
    registerAacEncoder();
    wasmAacRegistered = true;
  }
  return await canEncodeAudio('aac', opts) ? 'wasm' : null;
}

async function start(settings: EncodeSettings, audio: PlanarAudio | null) {
  const { width, height, fps } = settings;
  if (typeof VideoEncoder === 'undefined') {
    throw new WorkerError('unsupported-video', translate('thisBrowserHasNoWebCodecsVideoEncoder'));
  }
  const videoQuality = new Quality(settings.videoQuality);
  post({ type: 'status', status: 'video-check' });
  if (!await canEncodeVideo('avc', { width, height, frameRate: fps, quality: videoQuality })) {
    throw new WorkerError('unsupported-video', translate('thisBrowserCanTEncodeH264At', { value1: width, value2: height }));
  }

  let aac: AacEncoderKind | null = null;
  if (audio) {
    post({ type: 'status', status: 'audio-encoder' });
    aac = await resolveAac(audio.sampleRate, audio.channels.length);
    if (!aac) {
      throw new WorkerError('unsupported-audio',
        translate('thisBrowserCanTEncodeAACAtHzWith', { value1: audio.sampleRate, value2: audio.channels.length }));
    }
  }

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });
  const video = new VideoSampleSource({ codec: 'avc', quality: videoQuality, keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: fps });

  let audioJob: Job['audio'] = null;
  if (audio) {
    const source = new AudioSampleSource({ codec: 'aac', quality: new Quality(settings.audioQuality) });
    output.addAudioTrack(source);
    // Audio past the end of the video is dropped.
    const total = Math.min(audio.channels[0].length, Math.round(settings.frameCount / fps * audio.sampleRate));
    audioJob = { source, data: audio, written: 0, total };
  }

  post({ type: 'status', status: 'muxer' });
  await output.start();
  job = { settings, output, video, audio: audioJob };
  post({ type: 'ready', aac });
}

async function addFrame(index: number, frame: VideoFrame) {
  if (!job) throw new Error(translate('frameReceivedBeforeStart'));
  const { fps } = job.settings;
  const sample = new VideoSample(frame, { timestamp: index / fps, duration: 1 / fps });
  try {
    await job.video.add(sample);
  } finally {
    sample.close();
    frame.close();
  }
  // Keep audio in step with video so the muxer can interleave without buffering a whole track.
  await addAudioUntil((index + 1) / fps);
  post({ type: 'frame', index });
}

async function addAudioUntil(seconds: number) {
  const audio = job?.audio;
  if (!audio) return;
  const { data, written } = audio;
  const end = Math.min(audio.total, Math.round(seconds * data.sampleRate));
  if (end <= written) return;

  const length = end - written;
  const planes = new Float32Array(length * data.channels.length);
  data.channels.forEach((ch, i) => planes.set(ch.subarray(written, end), i * length));
  const sample = new AudioSample({
    data: planes,
    format: 'f32-planar',
    numberOfChannels: data.channels.length,
    sampleRate: data.sampleRate,
    timestamp: written / data.sampleRate,
  });
  audio.written = end;
  try {
    await audio.source.add(sample);
  } finally {
    sample.close();
  }
}

async function finish() {
  if (!job) throw new Error(translate('finishReceivedBeforeStart'));
  await addAudioUntil(Infinity);
  post({ type: 'finalizing' });
  await job.output.finalize();
  const buffer = job.output.target.buffer!;
  const mimeType = await job.output.getMimeType();
  post({ type: 'done', buffer, mimeType }, [buffer]);
}
