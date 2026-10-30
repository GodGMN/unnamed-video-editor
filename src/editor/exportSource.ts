/*
 * Feeds the current timeline to the MP4 export. The mixdown is real (clip timing, trims, volume, mute, fades
 * and their curves, muted tracks), and so are video fades to and from black, but there is no decoded media or
 * shared compositor yet, so sources are stand-ins: each clip renders as its tone colour with a source timecode,
 * and sounds as a steady sine tone.
 * Swap `placeholderFrames` and `placeholderAudio` for the compositor and decoded audio once they exist.
 */

import type { ExportSource } from '../components/ExportDialog';
import { fadeLevel } from '../playback/compositor';
import { MISSING_MEDIA, audioTracks, fmtTime, videoTracks } from './model';
import type { Media, Project, TimelineLayout } from './model';

export function exportSource(p: Project, layout: TimelineLayout): ExportSource {
  return {
    duration: layout.end,
    fps: p.output.fps,
    frames: (width, height) => placeholderFrames(p, layout, width, height),
    mixAudio: (sampleRate) => mixdown(p, layout, sampleRate),
  };
}

/** Draws only the bottom (main) video track: overlays need the real compositor's transforms. */
function placeholderFrames(p: Project, layout: TimelineLayout, width: number, height: number) {
  const main = videoTracks(p).at(-1);
  const canvas = new OffscreenCanvas(width, height);
  const g = canvas.getContext('2d')!;
  const k = height / 1080;
  return ({ time: t }: { time: number }) => {
    // Layout boundaries are sums of floats (7.6 + 10.8 = 18.400000000000002); nudge so a frame on a cut lands after it.
    const time = t + 1e-6;
    g.fillStyle = '#000';
    g.fillRect(0, 0, width, height);
    const clip = main && !main.hidden
      ? main.clips.find((c) => time >= layout.clips[c.id].vs && time < layout.clips[c.id].ve)
      : undefined;
    if (clip) {
      const l = layout.clips[clip.id];
      g.globalAlpha = fadeLevel(clip, time);
      g.fillStyle = (p.media[clip.mediaId] ?? MISSING_MEDIA).tone;
      g.fillRect(0, 0, width, height);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.font = `500 ${Math.round(40 * k)}px ui-monospace, monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(`${l.name} @ ${fmtTime(clip.inS + time - l.start)}`, width / 2, height / 2);
      g.globalAlpha = 1;
    }
    return canvas;
  };
}

/** Mixes every audible clip into one stereo buffer covering the whole sequence. */
async function mixdown(p: Project, layout: TimelineLayout, sampleRate: number) {
  const ctx = new OfflineAudioContext(2, Math.ceil(layout.end * sampleRate), sampleRate);
  const buffers = new Map<string, AudioBuffer>();
  let audible = 0;
  for (const track of audioTracks(p)) {
    if (track.muted) continue;
    for (const clip of track.clips) {
      const media = p.media[clip.mediaId];
      const l = layout.clips[clip.id];
      // Audio clips span the clip's visible range on the timeline, same as the video.
      const dur = l.ve - l.vs;
      if (!media?.audio || clip.muted || clip.vol <= 0 || dur <= 0) continue;
      audible++;
      if (!buffers.has(media.id)) buffers.set(media.id, placeholderAudio(ctx, media));
      const src = ctx.createBufferSource();
      src.buffer = buffers.get(media.id)!;
      const gain = ctx.createGain();
      scheduleEnvelope(gain.gain, l.vs, dur, clip.vol / 100, clip.fadeIn, clip.curveIn, clip.fadeOut, clip.curveOut);
      src.connect(gain).connect(ctx.destination);
      src.start(l.vs, clip.inS + l.vs - l.start, dur);
    }
  }
  return audible ? ctx.startRendering() : null;
}

function scheduleEnvelope(p: AudioParam, start: number, dur: number, vol: number,
  fadeIn: number, curveIn: number, fadeOut: number, curveOut: number) {
  const fi = Math.min(fadeIn, dur / 2);
  const fo = Math.min(fadeOut, dur / 2);
  if (fi > 0) p.setValueCurveAtTime(fadeCurve(curveIn, vol, false), start, fi);
  else p.setValueAtTime(vol, start);
  if (fo > 0) p.setValueCurveAtTime(fadeCurve(curveOut, vol, true), start + dur - fo, fo);
}

/**
 * Samples the timeline's fade shape: a quadratic Bézier from silence to full volume whose control point sits at
 * (0.5 − c/2, 0.5 + c/2), so c = 0 is linear, c > 0 rises early (logarithmic), c < 0 rises late (exponential).
 * A fade-out is the same shape mirrored in time.
 */
function fadeCurve(c: number, vol: number, out: boolean, n = 128) {
  const cx = 0.5 - c / 2;
  const cy = 0.5 + c / 2;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = out ? 1 - i / (n - 1) : i / (n - 1);
    // Solve x = (1 − 2cx)s² + 2cx·s for the Bézier parameter s, then evaluate y(s).
    const a = 1 - 2 * cx;
    const s = Math.abs(a) < 1e-6 ? x / (2 * cx) : (-2 * cx + Math.sqrt(4 * cx * cx + 4 * a * x)) / (2 * a);
    curve[i] = vol * (2 * s * (1 - s) * cy + s * s);
  }
  return curve;
}

/** Stand-in for a source's decoded audio: a sine tone per source, as long as the source. */
function placeholderAudio(ctx: BaseAudioContext, { duration, seed }: Media) {
  const buf = ctx.createBuffer(2, Math.ceil(duration * ctx.sampleRate), ctx.sampleRate);
  const freq = 220 * (1 + seed * 0.25);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = 0.25 * Math.sin(2 * Math.PI * freq * i / ctx.sampleRate);
  buf.copyToChannel(data, 1);
  return buf;
}
