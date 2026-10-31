import { t as translate, getLocale } from '../i18n/core';
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';
import type { ExportSource } from '../components/ExportDialog';
import { GAIN_MIN_DB, audioTracks, clipEnd, clipSpeed, toSource, videoTracks } from './model';
import type { Project, TimelineLayout } from './model';
import { readMediaFile } from '../media/files';
import { AnimationReader, imageType, openAnimation } from '../media/animation';
import { audioGain, renderFrame } from '../playback/compositor';
import { bufferStretch, stretches } from '../playback/stretch';
import type { RenderReply, RenderRequest } from './renderProtocol';
import type { ExportTrace } from '../export/trace';

export function exportSource(project: Project, layout: TimelineLayout): ExportSource {
  return {
    duration: layout.end,
    fps: project.output.fps,
    output: project.output,
    async prepare(width, height, sampleRate, signal, trace) {
      const p = structuredClone(project);
      const ids = new Set([
        ...videoTracks(p).filter((t) => !t.hidden).flatMap((t) => t.clips.map((c) => c.mediaId)),
        ...audioTracks(p).filter((t) => !t.muted).flatMap((t) => t.clips.filter((c) => !c.muted && c.gainDb > GAIN_MIN_DB).map((c) => c.mediaId)),
      ]);
      const importing = [...ids].find((id) => p.media[id]?.importing);
      if (importing) throw new Error(translate('stillImportingExportOnceItFinishes', { value1: p.media[importing].name }));
      const files: Record<string, File> = {};
      for (const [i, id] of [...ids].entries()) {
        signal.throwIfAborted();
        trace.step(translate('exportStepReadingFiles'), p.media[id]?.name ?? id, `${i + 1} / ${ids.size}`);
        const file = await readMediaFile(id);
        if (!file) throw new Error(translate('sourceFileIsMissingImportItBeforeExporting', { value1: p.media[id]?.name ?? id }));
        files[id] = file;
      }
      // Composite on the main thread so text uses the same loaded fonts as preview.
      trace.step(translate('exportStepLoadingFonts'));
      await document.fonts.load('700 72px Figtree');
      signal.throwIfAborted();
      const stills = new Map<string, ImageBitmap>();
      // One reader per clip, so overlapping clips of the same animation don't fight over its frame.
      const animations = new Map<string, AnimationReader>();
      const worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
      let pending: { resolve: (reply: RenderReply) => void; reject: (error: Error) => void } | null = null;
      const dispose = () => {
        worker.terminate();
        stills.forEach((image) => image.close());
        stills.clear();
        animations.forEach((reader) => reader.dispose());
        animations.clear();
        pending?.reject(new DOMException(translate('exportStopped2'), 'AbortError'));
        pending = null;
        signal.removeEventListener('abort', dispose);
      };
      signal.addEventListener('abort', dispose, { once: true });
      worker.onmessage = ({ data }: MessageEvent<RenderReply>) => {
        if (data.type === 'error') pending?.reject(new Error(data.message));
        else pending?.resolve(data);
        pending = null;
      };
      worker.onerror = (e) => { pending?.reject(new Error(e.message || translate('videoDecoderFailed'))); pending = null; };
      const request = (message: RenderRequest) => new Promise<RenderReply>((resolve, reject) => {
        signal.throwIfAborted();
        pending = { resolve, reject };
        worker.postMessage({ ...message, locale: getLocale() });
      });
      try {
        trace.step(translate('exportStepStartingRenderer'));
        await request({ type: 'init', project: p, files });
        trace.step(translate('exportStepDecodingImages'));
        for (const track of videoTracks(p)) for (const clip of track.clips) {
          const media = p.media[clip.mediaId];
          if (track.hidden || !media?.animation) continue;
          const animation = await openAnimation(files[clip.mediaId], imageType(media.container));
          if (!animation) throw new Error(translate('cannotDecodeTheAnimationInThisBrowser', { value1: media.name }));
          if (signal.aborted) { animation.decoder.close(); signal.throwIfAborted(); }
          animations.set(clip.id, new AnimationReader(animation));
        }
        for (const id of ids) {
          if (!p.media[id]?.still || p.media[id].animation) continue;
          const image = await createImageBitmap(files[id]).catch(() => { throw new Error(translate('cannotDecodeTheImage', { value1: p.media[id].name })); });
          if (signal.aborted) { image.close(); signal.throwIfAborted(); }
          stills.set(id, image);
        }
        const audio = await mixdown(p, layout.end, files, sampleRate, signal, trace);
        trace.end();
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        return {
          audio,
          async renderFrame({ time }) {
            const reply = await request({ type: 'frame', time });
            if (reply.type !== 'frame') throw new Error(translate('unexpectedDecoderReply'));
            try {
              signal.throwIfAborted();
              const images = new Map<string, CanvasImageSource>(reply.frames.map((f) => [f.clipId, f.image]));
              for (const [id, reader] of animations) {
                const clip = videoTracks(p).flatMap((t) => t.clips).find((c) => c.id === id)!;
                if (time >= clip.start && time < clipEnd(clip)) images.set(id, await reader.at(toSource(clip, time)));
              }
              renderFrame(p, time, ctx, (clip) => images.get(clip.id) ?? stills.get(clip.mediaId) ?? null);
              return canvas;
            } finally { reply.frames.forEach((f) => f.image.close()); }
          },
          dispose,
        };
      } catch (error) { dispose(); throw error; }
    },
  };
}

async function mixdown(p: Project, duration: number, files: Record<string, File>, sampleRate: number, signal: AbortSignal, trace: ExportTrace) {
  const clips = audioTracks(p).filter((t) => !t.muted).flatMap((t) => t.clips)
    .filter((c) => !c.muted && c.gainDb > GAIN_MIN_DB && clipEnd(c) > 0 && c.start < duration);
  if (!clips.length) return null;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  for (const clip of clips) {
    signal.throwIfAborted();
    const name = p.media[clip.mediaId]?.name ?? clip.mediaId;
    trace.step(translate('exportStepDecodingAudio'), name);
    const input = new Input({ source: new BlobSource(files[clip.mediaId]), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track || !await track.canDecode()) throw new Error(translate('cannotDecodeAudioFromConvertItToMP4First', { value1: p.media[clip.mediaId]?.name }));
      const start = Math.max(0, clip.start), end = Math.min(duration, clipEnd(clip));
      const gain = ctx.createGain();
      // Web Audio interpolates gain values between these 1 ms control points.
      const count = Math.max(2, Math.ceil((end - start) * 1000) + 1);
      const curve = Float32Array.from({ length: count }, (_, i) =>
        audioGain(p, clip, Math.min(end - 1 / sampleRate, start + i / (count - 1) * (end - start))));
      gain.gain.setValueCurveAtTime(curve, start, end - start);
      gain.connect(ctx.destination);
      const sourceStart = toSource(clip, start), sourceEnd = toSource(clip, end);
      const length = `${Math.round(sourceEnd - sourceStart)} s`;
      trace.progress(`0 / ${length}`);
      // Copy the decoded chunks into one buffer per clip: a source node per chunk (thousands for a long clip)
      // makes the offline render crawl, since it visits every scheduled node on each 128-sample block.
      let joined: AudioBuffer | null = null;
      for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers(sourceStart, sourceEnd)) {
        signal.throwIfAborted();
        const from = Math.max(sourceStart, timestamp), to = Math.min(sourceEnd, timestamp + buffer.duration);
        trace.progress(`${Math.round(Math.max(0, to - sourceStart))} / ${length}`);
        if (to <= from) continue;
        const rate = buffer.sampleRate;
        joined ??= new AudioBuffer({ length: Math.ceil((sourceEnd - sourceStart) * rate), numberOfChannels: buffer.numberOfChannels, sampleRate: rate });
        const offset = Math.round((from - sourceStart) * rate), skip = Math.round((from - timestamp) * rate);
        const samples = Math.max(0, Math.min(Math.round((to - from) * rate), buffer.length - skip, joined.length - offset));
        for (let ch = 0; ch < joined.numberOfChannels; ch++) {
          const data = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1));
          joined.copyToChannel(data.subarray(skip, skip + samples), ch, offset);
        }
      }
      if (joined && stretches(clip)) {
        const node = await bufferStretch(ctx);
        const input = await resampled(joined, sampleRate);
        await node.addBuffers(Array.from({ length: input.numberOfChannels }, (_, ch) => input.getChannelData(ch)));
        // The buffer holds just this clip's audio, so the node reads silence before and after it.
        await node.schedule({ output: start, active: true, input: 0, rate: clipSpeed(clip) });
        // Its analysis window still rings briefly past both ends; keep that out of the neighbours.
        if (start > 0) gain.gain.setValueAtTime(0, 0);
        gain.gain.setValueAtTime(0, end);
        node.connect(gain);
      } else if (joined) {
        const source = ctx.createBufferSource();
        // Without keep pitch, the changed rate shifts pitch like tape.
        source.buffer = joined; source.playbackRate.value = clipSpeed(clip); source.connect(gain);
        source.start(start, 0, sourceEnd - sourceStart);
      }
    } finally { input.dispose(); }
  }
  signal.throwIfAborted();
  trace.step(translate('exportStepRenderingMix'), '', '0%');
  watchRendering(ctx, duration, (fraction) => trace.progress(`${Math.round(fraction * 100)}%`));
  const result = await ctx.startRendering();
  signal.throwIfAborted();
  return result;
}

/** `buffer` at `rate`: the stretcher reads samples at its context's rate. */
async function resampled(buffer: AudioBuffer, rate: number): Promise<AudioBuffer> {
  if (buffer.sampleRate === rate) return buffer;
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, Math.ceil(buffer.duration * rate), rate);
  const source = ctx.createBufferSource();
  source.buffer = buffer; source.connect(ctx.destination); source.start();
  return ctx.startRendering();
}

/** Pauses the offline render every few seconds of audio to report how far it got. */
function watchRendering(ctx: OfflineAudioContext, duration: number, onProgress: (fraction: number) => void) {
  // Not every browser can suspend an offline context; the step just shows no percentage there.
  if (typeof ctx.suspend !== 'function') return;
  const every = Math.max(5, duration / 50);
  for (let at = every; at < duration; at += every) {
    ctx.suspend(at).then(() => { onProgress(at / duration); return ctx.resume(); }).catch(() => {});
  }
}
