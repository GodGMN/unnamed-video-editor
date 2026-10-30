import { clipEnd, overlapAfter, findVideoClip, partnersOf, videoTracks } from '../editor/model';
import type { AudioClip, Project, VideoClip } from '../editor/model';

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

/** Incoming opacity for crossfade; outgoing stays opaque underneath it. */
export function videoOpacity(p: Project, clip: VideoClip, time: number): number {
  const track = videoTracks(p).find((t) => t.clips.some((c) => c.id === clip.id));
  if (!track) return 1;
  const i = track.clips.findIndex((c) => c.id === clip.id);
  const prev = track.clips[i - 1], next = track.clips[i + 1];
  let alpha = 1;
  if (prev && prev.transitionOut?.type === 'crossfade') {
    const overlap = overlapAfter(prev, clip);
    if (overlap > 0) alpha *= clamp((time - clip.start) / overlap);
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

export function audioGain(p: Project, clip: AudioClip, time: number): number {
  if (clip.muted || time < clip.start || time >= clipEnd(clip)) return 0;
  let gain = clip.vol / 100;
  if (clip.fadeIn > 0) gain *= fadeCurve((time - clip.start) / clip.fadeIn, clip.curveIn);
  if (clip.fadeOut > 0) gain *= fadeCurve((clipEnd(clip) - time) / clip.fadeOut, clip.curveOut);
  const partner = partnersOf(p, clip).map((c) => findVideoClip(p, c.id)).find((c) => !!c);
  if (partner) {
    gain *= videoOpacity(p, partner, time);
    const track = videoTracks(p).find((t) => t.clips.some((c) => c.id === partner.id));
    const next = track?.clips[track.clips.findIndex((c) => c.id === partner.id) + 1];
    if (next && partner.transitionOut?.type === 'crossfade') {
      const overlap = overlapAfter(partner, next);
      if (overlap > 0) gain *= clamp((Math.min(clipEnd(partner), clipEnd(next)) - time) / overlap);
    }
  }
  return gain;
}

/** Shared preview/export renderer. Has no React, DOM creation, or playback state. */
export function renderFrame(p: Project, time: number, ctx: RenderContext, frameSource: FrameSource) {
  const { width, height } = p.output;
  ctx.save();
  ctx.resetTransform();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
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
      const frame = frameSource(clip, clip.inS + time - clip.start);
      if (!frame) continue;
      const sw = video.width, sh = video.height;
      const scale = (clip.fit === 'fill' ? Math.max(width / sw, height / sh) : Math.min(width / sw, height / sh)) * (clip.fit === 'custom' ? clip.scale / 100 : 1);
      ctx.save();
      ctx.globalAlpha = videoOpacity(p, clip, time);
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
