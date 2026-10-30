import { t as translate } from '../i18n/core';
import { clipEnd, findVideoClip } from '../editor/model';
import type { AudioClip, MediaClip, Project } from '../editor/model';
import { readMediaFile } from '../media/files';
import { imageSize, sampleColor } from './chromaKey';
import { audioGain, renderFrame, sourcePoint } from './compositor';
import { imageType } from '../media/animation';
import { AnimatedFrame, FrameCache, StillFrame } from './frameCache';
import type { Frames } from './frameCache';

interface Player { element: HTMLAudioElement; url: string; gain: GainNode | null; source: MediaElementAudioSourceNode | null; ready: boolean; busy: boolean; wantedPlaying: boolean }
interface Entry { mediaId: string; used: number; frames: Frames | null; audio: Player | null; disposed: boolean; abort: AbortController }
/** `transparent` leaves uncovered and keyed-out pixels clear, so the stage's transparency grid shows through. */
interface Request { project: Project; time: number; playing: boolean; volume: number; transparent: boolean }
/** Why a source can't play: its file is gone, or it failed to decode. */
type Unavailable = { missing: true } | { missing: false; error: string };

function quoted(names: string[]) { return names.map((n) => `"${n}"`).join(', '); }

/** One status line naming every source that can't play right now. */
function unavailableMessage(problems: Map<string, Unavailable>, project: Project) {
  const name = (mediaId: string) => project.media[mediaId]?.name ?? translate('missingMedia');
  const missing: string[] = [];
  const errors: string[] = [];
  for (const [mediaId, problem] of problems) {
    if (problem.missing) missing.push(name(mediaId));
    else errors.push(translate('couldNotBeLoaded', { value1: name(mediaId), value2: problem.error }));
  }
  if (missing.length === 1) errors.unshift(translate('sourceFileIsMissingImportYourOwnMediaTo', { value1: quoted(missing) }));
  if (missing.length > 1) errors.unshift(translate('sourceFilesAreMissingImportYourOwnMediaTo', { value1: quoted(missing) }));
  return errors.join(' ');
}

function waitFor(element: HTMLMediaElement, event: string, action: () => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(translate('mediaDecodingTimedOut'))), 8000);
    const loaded = () => finish();
    const aborted = () => finish(new DOMException(translate('mediaPreparationCancelled'), 'AbortError'));
    const failed = () => finish(new Error(element.error?.message || translate('thisFileCouldNotBeDecoded')));
    function finish(error?: Error) {
      clearTimeout(timer);
      element.removeEventListener(event, loaded);
      element.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
      if (error) reject(error); else resolve();
    }
    element.addEventListener(event, loaded, { once: true });
    element.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted(); else action();
  });
}

/** Preparation runs independently for each clip. Drawing never awaits a load, seek, or play promise. */
export class PlaybackEngine {
  private entries = new Map<string, Entry>();
  private unavailable = new Map<string, Unavailable>();
  private context: AudioContext | null = null;
  private latest: Request | null = null;
  private disposed = false;
  private serial = 0;
  private redraw = 0;
  constructor(private canvas: HTMLCanvasElement, private status: (message: string) => void) {}

  async resumeAudio() {
    this.context ??= new AudioContext();
    await this.context.resume();
  }

  update(request: Request) {
    this.latest = request;
    const { project, time, playing } = request;
    const active = new Set<string>();
    const upcoming: { clip: MediaClip; audio: boolean }[] = [];
    for (const track of project.tracks) {
      if (track.kind === 'text' || (track.kind === 'video' ? track.hidden : track.muted)) continue;
      for (const clip of track.clips) {
        if (time >= clip.start && time < clipEnd(clip)) {
          active.add(clip.id);
          this.prepare(clip, track.kind === 'audio', time, playing);
        } else if (clip.start > time && clip.start <= time + 2) upcoming.push({ clip, audio: track.kind === 'audio' });
      }
    }
    // Keep the next video and audio pair warm, without opening every decoder on a long timeline.
    upcoming.sort((a, b) => a.clip.start - b.clip.start);
    const warm = new Set<string>();
    for (const { clip, audio } of upcoming.slice(0, 2)) {
      warm.add(clip.id);
      this.prepare(clip, audio, clip.start, false);
    }
    for (const [id, entry] of this.entries) {
      if (!active.has(id) && entry.audio) { entry.audio.wantedPlaying = false; entry.audio.element.pause(); }
      if (!project.media[entry.mediaId]) this.release(id);
    }
    // Active clips are pinned. Keep at most two inactive entries, preferring upcoming clips over old ones.
    const idle = [...this.entries].filter(([id]) => !active.has(id))
      .sort(([a, x], [b, y]) => Number(warm.has(b)) - Number(warm.has(a)) || y.used - x.used);
    for (const [id] of idle.slice(2)) this.release(id);
    this.draw();
  }

  private prepare(clip: MediaClip, audio: boolean, time: number, playing: boolean) {
    if (this.unavailable.has(clip.mediaId)) return;
    let entry = this.entries.get(clip.id);
    if (entry && entry.mediaId !== clip.mediaId) { this.release(clip.id); entry = undefined; }
    if (!entry) {
      entry = { mediaId: clip.mediaId, used: ++this.serial, frames: null, audio: null, disposed: false, abort: new AbortController() };
      this.entries.set(clip.id, entry);
      const created = entry;
      void this.load(created, audio).then(() => {
        if (!created.disposed && this.latest) this.update(this.latest);
      });
    }
    entry.used = ++this.serial;
    const target = Math.max(0, clip.inS + time - clip.start);
    entry.frames?.request(target, playing);
    if (entry.audio?.ready) this.syncAudio(entry, clip as AudioClip, target, playing);
  }

  private async load(entry: Entry, audio: boolean) {
    try {
      const file = await readMediaFile(entry.mediaId);
      if (entry.disposed) return;
      if (!file) { this.unavailable.set(entry.mediaId, { missing: true }); return; }
      if (!audio) {
        const media = this.latest?.project.media[entry.mediaId];
        const changed = () => this.scheduleDraw(), failed = (error: unknown) => this.fail(entry, error);
        const size = this.canvas;
        entry.frames = media?.animation ? new AnimatedFrame(file, imageType(media.container), size, changed, failed)
          : media?.still ? new StillFrame(file, size, changed, failed) : new FrameCache(file, size, changed, failed);
      } else {
        const element = document.createElement('audio');
        const url = URL.createObjectURL(file);
        const player: Player = { element, url, gain: null, source: null, ready: false, busy: false, wantedPlaying: false };
        entry.audio = player;
        element.preload = 'auto'; element.muted = true;
        await waitFor(element, 'loadeddata', () => { element.src = url; element.load(); }, entry.abort.signal);
        if (!entry.disposed) player.ready = true;
      }
    } catch (error) { if (!entry.disposed) this.fail(entry, error); }
  }

  private fail(entry: Entry, error: unknown) {
    if (entry.audio) { entry.audio.wantedPlaying = false; entry.audio.element.pause(); }
    this.unavailable.set(entry.mediaId, { missing: false, error: error instanceof Error ? error.message : translate('unknownError') });
    this.scheduleDraw();
  }

  private syncAudio(entry: Entry, clip: AudioClip, target: number, playing: boolean) {
    const player = entry.audio!;
    const { element } = player;
    player.wantedPlaying = playing;
    if (!playing) element.pause();
    const context = this.context;
    if (context && !player.gain) {
      player.source = context.createMediaElementSource(element);
      player.gain = context.createGain();
      player.source.connect(player.gain).connect(context.destination);
    }
    const request = this.latest!;
    if (context && player.gain) {
      player.gain.gain.setTargetAtTime(playing ? request.volume * audioGain(request.project, clip, request.time) : 0, context.currentTime, 0.01);
    }
    element.muted = !context;
    if (player.busy) return;
    const drift = Math.abs(element.currentTime - target);
    if (drift > (playing && !element.paused ? 0.25 : 0.002)) {
      player.busy = true;
      void waitFor(element, 'seeked', () => { element.currentTime = Math.min(element.duration - 0.001, target); }, entry.abort.signal)
        .then(async () => {
          // Start from the prepared position rather than chasing a moving target while still paused.
          if (!entry.disposed && player.wantedPlaying) {
            await element.play();
            if (entry.disposed || !player.wantedPlaying) element.pause();
          }
        }).catch((error: unknown) => { if (!entry.disposed) this.fail(entry, error); })
        .finally(() => {
          player.busy = false;
          if (!entry.disposed && this.latest) this.update(this.latest);
        });
      return;
    }
    if (playing && element.paused) {
      player.busy = true;
      void element.play().then(() => {
        const latest = this.latest;
        if (entry.disposed || !player.wantedPlaying || !latest?.playing || latest.time < clip.start || latest.time >= clipEnd(clip)) element.pause();
      }, (error) => { if (!entry.disposed) this.fail(entry, error); }).finally(() => { player.busy = false; });
    }
  }

  /** The canvas changed size: decoders reopen at the new resolution. */
  resize() {
    for (const [id, entry] of this.entries) if (entry.frames) this.release(id);
    if (this.latest) this.update(this.latest);
  }

  private scheduleDraw() {
    if (this.disposed || this.redraw) return;
    this.redraw = requestAnimationFrame(() => { this.redraw = 0; this.draw(); });
  }
  private draw() {
    if (this.disposed || !this.latest) return;
    const { project, time, playing, transparent } = this.latest;
    const ctx = this.canvas.getContext('2d');
    if (ctx) renderFrame(project, time, ctx, (clip, sourceTime) => this.entries.get(clip.id)?.frames?.frame(sourceTime, playing) ?? null, transparent ? null : '#000');
    const problems = new Map<string, Unavailable>();
    for (const track of project.tracks) {
      if (track.kind === 'text' || (track.kind === 'video' ? track.hidden : track.muted)) continue;
      for (const clip of track.clips) {
        const problem = this.unavailable.get(clip.mediaId);
        if (problem && time >= clip.start && time < clipEnd(clip)) problems.set(clip.mediaId, problem);
      }
    }
    this.status(unavailableMessage(problems, project));
  }
  /**
   * The unkeyed colour of video clip `clipId` under output pixel (`x`, `y`) in the frame on
   * screen, or null when the clip isn't there or its frame hasn't decoded yet.
   */
  sample(clipId: string, x: number, y: number): string | null {
    if (!this.latest) return null;
    const { project, time, playing } = this.latest;
    const clip = findVideoClip(project, clipId);
    const video = clip && project.media[clip.mediaId]?.video;
    if (!clip || !video || time < clip.start || time >= clipEnd(clip)) return null;
    const point = sourcePoint(project, clip, x, y);
    const frame = point && this.entries.get(clipId)?.frames?.frame(clip.inS + time - clip.start, playing);
    if (!point || !frame) return null;
    // Preview frames are decoded smaller than the source.
    const size = imageSize(frame);
    return sampleColor(frame, point.x * size.width / video.width, point.y * size.height / video.height);
  }
  private release(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.disposed = true;
    entry.abort.abort();
    entry.frames?.dispose();
    if (entry.audio) {
      const { element, source, gain, url } = entry.audio;
      element.pause(); source?.disconnect(); gain?.disconnect();
      element.removeAttribute('src'); element.load(); URL.revokeObjectURL(url);
    }
    this.entries.delete(id);
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.redraw);
    for (const id of this.entries.keys()) this.release(id);
    void this.context?.close();
  }
}
