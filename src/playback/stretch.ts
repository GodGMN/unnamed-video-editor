import { clipSpeed } from '../editor/model';
import type { AudioClip } from '../editor/model';

/**
 * Signalsmith Stretch: a phase vocoder that keeps partials in phase and transients sharp. Simpler
 * overlap-add stretchers (the browser's `preservesPitch`, ffmpeg's `atempo`) sound metallic and robotic.
 */
export interface StretchNode extends AudioWorkletNode {
  /**
   * From context time `output` on, plays input time `input` onwards at `rate`. Each call drops
   * every change scheduled at or after the current time, so only one change can be queued ahead.
   */
  schedule(change: { output: number; active?: boolean; input?: number; rate?: number; semitones?: number }): Promise<unknown>;
  addBuffers(channels: Float32Array[]): Promise<number>;
  latency(): Promise<number>;
}

/** Loaded on first use: only projects with a changed speed need it. */
const create = async (context: BaseAudioContext, options?: AudioWorkletNodeOptions) =>
  (await (await import('signalsmith-stretch')).default(context, options)) as StretchNode;

/** Whether an audio clip plays through the stretcher: sped up or slowed down, keeping its pitch. */
export const stretches = (clip: AudioClip) => clipSpeed(clip) !== 1 && clip.keepPitch !== false;

/** Semitones that undo the pitch shift of playing `speed` times as fast. */
export const pitchCorrection = (speed: number) => -12 * Math.log2(speed);

/** A node that pitch-shifts whatever is connected to it, for a media element playing at a changed rate. */
export const liveStretch = (context: AudioContext) => create(context);

/** A node that plays the buffers added to it at a scheduled rate, keeping their pitch. Works offline. */
export const bufferStretch = (context: BaseAudioContext) =>
  create(context, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
