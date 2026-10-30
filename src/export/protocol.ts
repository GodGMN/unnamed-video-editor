// Messages exchanged between `exportMp4` (main thread) and `export.worker.ts`.

/** A Mediabunny quality level, or an explicit bitrate in bits per second. */
export type QualitySetting = 'very-low' | 'low' | 'medium' | 'high' | 'very-high' | number;

export type AacEncoderKind = 'native' | 'wasm';

export type ExportErrorCode =
  | 'invalid-options'
  | 'invalid-frame'
  | 'unsupported-video'
  | 'unsupported-audio'
  | 'encode-failed';

export interface PlanarAudio {
  sampleRate: number;
  /** One Float32Array per channel, all the same length, samples in [-1, 1]. */
  channels: Float32Array[];
}

export interface EncodeSettings {
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  videoQuality: QualitySetting;
  audioQuality: QualitySetting;
}

export interface SupportQuery {
  width: number;
  height: number;
  fps: number;
  audio: { sampleRate: number; numberOfChannels: number } | null;
}

export interface SupportReport {
  /** WebCodecs `VideoEncoder` exists in the worker. */
  webCodecs: boolean;
  /** The browser can encode H.264 at the requested size. */
  h264: boolean;
  /** How AAC will be encoded: the browser's own encoder, the bundled WASM one, or not at all. */
  aac: AacEncoderKind | null;
}

export type ToWorker =
  | { type: 'probe'; query: SupportQuery }
  | { type: 'start'; settings: EncodeSettings; audio: PlanarAudio | null }
  | { type: 'frame'; index: number; frame: VideoFrame }
  | { type: 'finish' };

export type FromWorker =
  | { type: 'probe'; report: SupportReport }
  | { type: 'ready'; aac: AacEncoderKind | null }
  | { type: 'frame'; index: number }
  | { type: 'finalizing' }
  | { type: 'done'; buffer: ArrayBuffer; mimeType: string }
  | { type: 'error'; code: ExportErrorCode; message: string };
