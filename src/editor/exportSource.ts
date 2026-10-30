import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';
import type { ExportSource } from '../components/ExportDialog';
import { audioTracks, clipEnd, videoTracks } from './model';
import type { Project, TimelineLayout } from './model';
import { readMediaFile } from '../media/files';
import { audioGain, renderFrame } from '../playback/compositor';
import type { RenderReply, RenderRequest } from './renderProtocol';

export function exportSource(project: Project, layout: TimelineLayout): ExportSource {
  return {
    duration: layout.end,
    fps: project.output.fps,
    async prepare(width, height, sampleRate, signal) {
      const p = structuredClone(project);
      const ids = new Set([
        ...videoTracks(p).filter((t) => !t.hidden).flatMap((t) => t.clips.map((c) => c.mediaId)),
        ...audioTracks(p).filter((t) => !t.muted).flatMap((t) => t.clips.filter((c) => !c.muted && c.vol > 0).map((c) => c.mediaId)),
      ]);
      const files: Record<string, File> = {};
      for (const id of ids) {
        signal.throwIfAborted();
        const file = await readMediaFile(id);
        if (!file) throw new Error(`Source file "${p.media[id]?.name ?? id}" is missing. Import it before exporting.`);
        files[id] = file;
      }
      // Composite on the main thread so text uses the same loaded fonts as preview.
      await document.fonts.load('700 72px Figtree');
      signal.throwIfAborted();
      const worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
      let pending: { resolve: (reply: RenderReply) => void; reject: (error: Error) => void } | null = null;
      const dispose = () => {
        worker.terminate();
        pending?.reject(new DOMException('Export stopped.', 'AbortError'));
        pending = null;
        signal.removeEventListener('abort', dispose);
      };
      signal.addEventListener('abort', dispose, { once: true });
      worker.onmessage = ({ data }: MessageEvent<RenderReply>) => {
        if (data.type === 'error') pending?.reject(new Error(data.message));
        else pending?.resolve(data);
        pending = null;
      };
      worker.onerror = (e) => { pending?.reject(new Error(e.message || 'Video decoder failed.')); pending = null; };
      const request = (message: RenderRequest) => new Promise<RenderReply>((resolve, reject) => {
        signal.throwIfAborted();
        pending = { resolve, reject };
        worker.postMessage(message);
      });
      try {
        await request({ type: 'init', project: p, files });
        const audio = await mixdown(p, layout.end, files, sampleRate, signal);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        return {
          audio,
          async renderFrame({ time }) {
            const reply = await request({ type: 'frame', time });
            if (reply.type !== 'frame') throw new Error('Unexpected decoder reply.');
            try {
              signal.throwIfAborted();
              const images = new Map(reply.frames.map((f) => [f.clipId, f.image]));
              renderFrame(p, time, ctx, (clip) => images.get(clip.id) ?? null);
              return canvas;
            } finally { reply.frames.forEach((f) => f.image.close()); }
          },
          dispose,
        };
      } catch (error) { dispose(); throw error; }
    },
  };
}

async function mixdown(p: Project, duration: number, files: Record<string, File>, sampleRate: number, signal: AbortSignal) {
  const clips = audioTracks(p).filter((t) => !t.muted).flatMap((t) => t.clips)
    .filter((c) => !c.muted && c.vol > 0 && clipEnd(c) > 0 && c.start < duration);
  if (!clips.length) return null;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  for (const clip of clips) {
    signal.throwIfAborted();
    const input = new Input({ source: new BlobSource(files[clip.mediaId]), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track || !await track.canDecode()) throw new Error(`Cannot decode audio from "${p.media[clip.mediaId]?.name}". Convert it to MP4 first.`);
      const start = Math.max(0, clip.start), end = Math.min(duration, clipEnd(clip));
      const gain = ctx.createGain();
      // Web Audio interpolates gain values between these 1 ms control points.
      const count = Math.max(2, Math.ceil((end - start) * 1000) + 1);
      const curve = Float32Array.from({ length: count }, (_, i) =>
        audioGain(p, clip, Math.min(end - 1 / sampleRate, start + i / (count - 1) * (end - start))));
      gain.gain.setValueCurveAtTime(curve, start, end - start);
      gain.connect(ctx.destination);
      const sourceStart = clip.inS + start - clip.start, sourceEnd = clip.inS + end - clip.start;
      for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers(sourceStart, sourceEnd)) {
        signal.throwIfAborted();
        const from = Math.max(sourceStart, timestamp), to = Math.min(sourceEnd, timestamp + buffer.duration);
        if (to <= from) continue;
        const source = ctx.createBufferSource();
        source.buffer = buffer; source.connect(gain);
        source.start(clip.start + from - clip.inS, from - timestamp, to - from);
      }
    } finally { input.dispose(); }
  }
  signal.throwIfAborted();
  const result = await ctx.startRendering();
  signal.throwIfAborted();
  return result;
}
