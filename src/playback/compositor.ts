import { clipEnd, dbToGain, overlapAfter, findVideoClip, partnersOf, videoTracks } from '../editor/model';
import type { AudioClip, MediaClip, Project, VideoClip, VideoStream } from '../editor/model';
import { keyFrame } from './chromaKey';

export type RenderContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type FrameSource = (clip: VideoClip, sourceTime: number) => CanvasImageSource | null;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Matches the quadratic fade ramp shown in the timeline. */
export function fadeCurve(progress: number, curve: number): number {
  const x = clamp(progress);
  const control = (1 - curve) / 2;
  // Invert the Bezier's x coordinate before evaluating y.
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) {
    const u = (lo + hi) / 2;
    const bx = 2 * (1 - u) * u * control + u * u;
    if (bx < x) lo = u; else hi = u;
  }
  const u = (lo + hi) / 2;
  return 2 * (1 - u) * u * (1 - control) + u * u;
}

/** A clip's level from its own fade in and fade out: opacity for video, a gain factor for audio. */
export function fadeLevel(clip: MediaClip, time: number): number {
  let level = 1;
  if (clip.fadeIn > 0) level *= fadeCurve((time - clip.start) / clip.fadeIn, clip.curveIn);
  if (clip.fadeOut > 0) level *= fadeCurve((clipEnd(clip) - time) / clip.fadeOut, clip.curveOut);
  return level;
}

/** Incoming opacity for crossfade; outgoing stays opaque underneath it. `shape` maps crossfade progress to a level. */
export function videoOpacity(p: Project, clip: VideoClip, time: number, shape = (t: number) => t): number {
  const track = videoTracks(p).find((t) => t.clips.some((c) => c.id === clip.id));
  if (!track) return 1;
  const i = track.clips.findIndex((c) => c.id === clip.id);
  const prev = track.clips[i - 1], next = track.clips[i + 1];
  let alpha = 1;
  if (prev && prev.transitionOut?.type === 'crossfade') {
    const overlap = overlapAfter(prev, clip);
    if (overlap > 0) alpha *= shape(clamp((time - clip.start) / overlap));
  }
  if (prev?.transitionOut?.type === 'fade') {
    const overlap = overlapAfter(prev, clip);
    if (overlap > 0) alpha *= clamp(((time - clip.start) / overlap - 0.5) * 2);
  }
  if (next && clip.transitionOut?.type === 'fade') {
    const overlap = overlapAfter(clip, next);
    if (overlap > 0) alpha *= clamp(1 - (time - next.start) / overlap * 2);
  }
  return alpha;
}

/** Equal-power crossfade level: the two sides' powers sum to one, so the overlap has no dip in loudness. */
const equalPower = (t: number) => Math.sin(t * Math.PI / 2);

export function audioGain(p: Project, clip: AudioClip, time: number): number {
  if (clip.muted || time < clip.start || time >= clipEnd(clip)) return 0;
  let gain = dbToGain(clip.gainDb) * fadeLevel(clip, time);
  const partner = partnersOf(p, clip).map((c) => findVideoClip(p, c.id)).find((c) => !!c);
  if (partner) {
    gain *= videoOpacity(p, partner, time, equalPower);
    const track = videoTracks(p).find((t) => t.clips.some((c) => c.id === partner.id));
    const next = track?.clips[track.clips.findIndex((c) => c.id === partner.id) + 1];
    if (next && partner.transitionOut?.type === 'crossfade') {
      const overlap = overlapAfter(partner, next);
      if (overlap > 0) gain *= equalPower(clamp((Math.min(clipEnd(partner), clipEnd(next)) - time) / overlap));
    }
  }
  return gain;
}

/** Source pixels to output pixels for a clip's frame. */
function clipScale(p: Project, clip: VideoClip, video: VideoStream) {
  const { width, height } = p.output;
  const sw = video.width, sh = video.height;
  return (clip.fit === 'fill' ? Math.max(width / sw, height / sh) : Math.min(width / sw, height / sh)) * (clip.fit === 'custom' ? clip.scale / 100 : 1);
}

/**
 * The source pixel of `clip` drawn at output pixel (`x`, `y`), undoing its position, rotation and
 * scale. Null when that point is outside the clip's cropped frame.
 */
export function sourcePoint(p: Project, clip: VideoClip, x: number, y: number): { x: number; y: number } | null {
  const video = p.media[clip.mediaId]?.video;
  if (!video) return null;
  const scale = clipScale(p, clip, video);
  const dx = x - (p.output.width / 2 + clip.x), dy = y - (p.output.height / 2 + clip.y);
  const a = clip.rot * Math.PI / 180;
  const sx = (dx * Math.cos(a) + dy * Math.sin(a)) / scale + video.width / 2;
  const sy = (-dx * Math.sin(a) + dy * Math.cos(a)) / scale + video.height / 2;
  if (sx < clip.cropL || sx >= video.width - clip.cropR || sy < clip.cropT || sy >= video.height - clip.cropB) return null;
  return { x: sx, y: sy };
}

/**
 * Shared preview/export renderer. Has no React, DOM creation, or playback state. With a null
 * `background`, whatever no clip covers (or a key removed) is left transparent.
 */
export function renderFrame(p: Project, time: number, ctx: RenderContext, frameSource: FrameSource, background: string | null = '#000') {
  const { width, height } = p.output;
  ctx.save();
  ctx.resetTransform();
  ctx.globalAlpha = 1;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  } else ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.scale(ctx.canvas.width / width, ctx.canvas.height / height);
  // Tracks are listed top first. Draw bottom first, including text tracks.
  for (const track of [...p.tracks].reverse()) {
    if (track.kind === 'audio' || track.hidden) continue;
    if (track.kind === 'text') {
      for (const text of track.clips) {
        if (time < text.start || time >= text.start + text.duration) continue;
        const horizontal = text.pos[1], vertical = text.pos[0];
        ctx.save();
        ctx.fillStyle = text.color;
        ctx.font = `700 ${text.size}px Figtree, sans-serif`;
        ctx.textAlign = horizontal === 'l' ? 'left' : horizontal === 'r' ? 'right' : 'center';
        ctx.textBaseline = vertical === 't' ? 'top' : vertical === 'b' ? 'bottom' : 'middle';
        const x = (horizontal === 'l' ? 64 : horizontal === 'r' ? width - 64 : width / 2) + text.x;
        const y = (vertical === 't' ? 64 : vertical === 'b' ? height - 64 : height / 2) + text.y;
        const lines = text.content.split('\n');
        lines.forEach((line, i) => ctx.fillText(line, x, y + (i - (vertical === 'b' ? lines.length - 1 : vertical === 'c' ? (lines.length - 1) / 2 : 0)) * text.size * 1.2));
        ctx.restore();
      }
      continue;
    }
    for (const clip of track.clips) {
      if (time < clip.start || time >= clipEnd(clip)) continue;
      const media = p.media[clip.mediaId];
      const video = media?.video;
      if (!video) continue;
      const raw = frameSource(clip, clip.inS + time - clip.start);
      if (!raw) continue;
      const frame = clip.key.enabled ? keyFrame(raw, clip.key) : raw;
      const sw = video.width, sh = video.height;
      const scale = clipScale(p, clip, video);
      ctx.save();
      // The clip's own fades and key go through whatever is underneath: the background on the main track.
      ctx.globalAlpha = videoOpacity(p, clip, time) * fadeLevel(clip, time);
      ctx.translate(width / 2 + clip.x, height / 2 + clip.y);
      ctx.rotate(clip.rot * Math.PI / 180);
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.rect(-sw / 2 + clip.cropL, -sh / 2 + clip.cropT, Math.max(0, sw - clip.cropL - clip.cropR), Math.max(0, sh - clip.cropT - clip.cropB));
      ctx.clip();
      ctx.drawImage(frame, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
    }
  }
  ctx.restore();
}
