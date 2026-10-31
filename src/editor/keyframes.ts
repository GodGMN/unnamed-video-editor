import { clipDuration, clipEnd, toSource } from './model';
import type { VideoClip } from './model';

export const ANIMATED_PROPERTIES = ['x', 'y', 'scale', 'rot', 'cropT', 'cropR', 'cropB', 'cropL'] as const;
export type AnimatedProperty = typeof ANIMATED_PROPERTIES[number];
export const EASINGS = ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const;
export type Easing = typeof EASINGS[number];
/** Source seconds keep motion attached to the same content through trims and splits. */
export interface Keyframe { time: number; value: number; easing?: Easing }
export type KeyframeTracks = Partial<Record<AnimatedProperty, Keyframe[]>>;

const EPS = 1e-6;

export function clipFrame(clip: VideoClip, time: number, fps: number) {
  const count = Math.max(1, Math.ceil(clipDuration(clip) * fps - EPS));
  const index = Math.max(0, Math.min(count - 1, Math.floor((time - clip.start) * fps + EPS)));
  const timelineTime = clip.start + index / fps;
  return { index, count, sourceTime: toSource(clip, timelineTime), timelineTime };
}

export function keyframeAt(keys: readonly Keyframe[], time: number) {
  return keys.find(k => Math.abs(k.time - time) < EPS);
}

export function saveKeyframe(clip: VideoClip, property: AnimatedProperty, time: number, value: number): KeyframeTracks {
  const original = clip.keyframes?.[property] ?? [];
  const previous = keyframeAt(original, time);
  const keys = original.filter(k => Math.abs(k.time - time) >= EPS);
  return { ...clip.keyframes, [property]: [...keys, { ...previous, time, value }].sort((a, b) => a.time - b.time) };
}


/** The first diamond opts a clip into automatic keying for subsequent property edits. */
export function autoKeyframePatch(clip: VideoClip, patch: Partial<VideoClip>, timelineTime: number, fps: number): Partial<VideoClip> {
  if (patch.keyframes || timelineTime < clip.start || timelineTime >= clipEnd(clip) ||
      !ANIMATED_PROPERTIES.some(property => (clip.keyframes?.[property]?.length ?? 0) > 0)) return patch;
  const frame = clipFrame(clip, timelineTime, fps);
  const sourceTime = toSource(clip, timelineTime);
  let next = clip;
  for (const property of ANIMATED_PROPERTIES) {
    const value = patch[property];
    if (value === undefined) continue;
    const keys = next.keyframes?.[property] ?? [];
    const existing = keyframeAt(keys, sourceTime) ?? keyframeAt(keys, frame.sourceTime);
    next = { ...next, keyframes: saveKeyframe(next, property, existing?.time ?? frame.sourceTime, value) };
  }
  return next === clip ? patch : { ...patch, keyframes: next.keyframes };
}

export function removeKeyframe(clip: VideoClip, property: AnimatedProperty, time: number): KeyframeTracks {
  return { ...clip.keyframes, [property]: (clip.keyframes?.[property] ?? []).filter(k => Math.abs(k.time - time) >= EPS) };
}

/** Easing belongs to the interval leaving a keyframe, not to its numeric value. */
export function setKeyframeEasing(clip: VideoClip, property: AnimatedProperty, startTime: number, easing: Easing): KeyframeTracks {
  const keys = clip.keyframes?.[property] ?? [];
  return { ...clip.keyframes, [property]: keys.map((key, index) =>
    index < keys.length - 1 && Math.abs(key.time - startTime) < EPS ? { ...key, easing } : key) };
}

export function keyframeInterval(keys: readonly Keyframe[], sourceTime: number): number {
  if (keys.length < 2) return -1;
  const next = keys.findIndex(key => key.time > sourceTime + EPS);
  return next < 0 ? keys.length - 2 : Math.max(0, next - 1);
}

export function easingProgress(easing: Easing, progress: number): number {
  const x = Math.max(0, Math.min(1, progress));
  if (easing === 'linear' || x === 0 || x === 1) return x;
  const [x1, x2] = easing === 'ease-in' ? [0.42, 1] : easing === 'ease-out' ? [0, 0.58] : [0.42, 0.58];
  let lo = 0, hi = 1;
  // Invert the curve's time axis before evaluating its value axis. These match the preset illustrations.
  for (let i = 0; i < 28; i++) {
    const u = (lo + hi) / 2;
    const time = 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u ** 2 * x2 + u ** 3;
    if (time < x) lo = u; else hi = u;
  }
  const u = (lo + hi) / 2;
  return 3 * (1 - u) * u ** 2 + u ** 3;
}

export function evaluateProperty(base: number, keys: readonly Keyframe[], sourceTime: number): number {
  if (keys.length < 2) return base;
  if (sourceTime <= keys[0].time) return keys[0].value;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (sourceTime <= b.time) return a.value + (b.value - a.value) * easingProgress(a.easing ?? 'linear', (sourceTime - a.time) / (b.time - a.time));
  }
  return keys[keys.length - 1].value;
}

export function evaluateVideoClip(clip: VideoClip, timelineTime: number): VideoClip {
  if (!clip.keyframes) return clip;
  const resolved = { ...clip };
  for (const property of ANIMATED_PROPERTIES) {
    const keys = clip.keyframes[property] ?? [];
    resolved[property] = evaluateProperty(clip[property], keys, toSource(clip, timelineTime));
    if (keys.length >= 2 && (property === 'scale' || property === 'x' || property === 'y' || property === 'rot')) resolved.fit = 'custom';
  }
  return resolved;
}
