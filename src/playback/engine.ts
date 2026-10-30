import { clipEnd } from '../editor/model';
import type { Clip, Project } from '../editor/model';
import { readMediaFile } from '../media/files';
import { audioGain, renderFrame } from './compositor';

interface Player { element: HTMLVideoElement; url: string; gain: GainNode | null; source: MediaElementAudioSourceNode | null; audio: boolean }
interface Request { project: Project; time: number; playing: boolean; volume: number }
/** Why a source can't play: its file is gone, or it failed to decode. */
type Unavailable = { missing: true } | { missing: false; error: string };

function quoted(names: string[]) { return names.map((n) => `"${n}"`).join(', '); }

/** One status line naming every source that can't play right now. */
function unavailableMessage(problems: Map<string, Unavailable>, project: Project) {
  const name = (mediaId: string) => project.media[mediaId]?.name ?? 'Missing media';
  const missing: string[] = [];
  const errors: string[] = [];
  for (const [mediaId, problem] of problems) {
    if (problem.missing) missing.push(name(mediaId));
    else errors.push(`"${name(mediaId)}" could not be loaded: ${problem.error}`);
  }
  if (missing.length === 1) errors.unshift(`Source file ${quoted(missing)} is missing. Import your own media to preview it.`);
  if (missing.length > 1) errors.unshift(`Source files ${quoted(missing)} are missing. Import your own media to preview them.`);
  return errors.join(' ');
}

function waitFor(element: HTMLMediaElement, event: string, action: () => void) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Media decoding timed out.')), 8000);
    const loaded = () => finish();
    const failed = () => finish(new Error(element.error?.message || 'This file could not be decoded.'));
    function finish(error?: Error) {
      clearTimeout(timer);
      element.removeEventListener(event, loaded);
      element.removeEventListener('error', failed);
      if (error) reject(error); else resolve();
    }
    element.addEventListener(event, loaded, { once: true });
    element.addEventListener('error', failed, { once: true });
    action();
  });
}

/** Owns media elements, URLs, and the Web Audio graph for this preview only. */
export class PlaybackEngine {
  private players = new Map<string, Player>();
  private unavailable = new Map<string, Unavailable>();
  private context: AudioContext | null = null;
  private latest: Request | null = null;
  private busy = false;
  private disposed = false;
  constructor(private canvas: HTMLCanvasElement, private status: (message: string) => void) {}

  async resumeAudio() {
    this.context ??= new AudioContext();
    await this.context.resume();
  }

  update(request: Request) {
    this.latest = request;
    // Pause immediately, even when an old seek is still pending.
    if (!request.playing) for (const p of this.players.values()) p.element.pause();
    if (!this.busy) void this.flush();
  }

  private async player(clip: Clip, audio: boolean): Promise<Player | null> {
    if (this.players.has(clip.id)) return this.players.get(clip.id)!;
    if (this.unavailable.has(clip.mediaId)) return null;
    const file = await readMediaFile(clip.mediaId);
    if (this.disposed) return null;
    if (!file) {
      this.unavailable.set(clip.mediaId, { missing: true });
      return null;
    }
    const element = document.createElement('video');
    const url = URL.createObjectURL(file);
    const player: Player = { element, url, gain: null, source: null, audio };
    element.preload = 'auto'; element.playsInline = true; element.muted = !audio;
    // Register before loading so disposal also releases an in-flight decoder.
    this.players.set(clip.id, player);
    try {
      await waitFor(element, 'loadeddata', () => { element.src = url; element.load(); });
      return this.disposed ? null : player;
    } catch (error) {
      this.release(clip.id);
      if (!this.disposed) this.unavailable.set(clip.mediaId, { missing: false, error: error instanceof Error ? error.message : 'Unknown error.' });
      return null;
    }
  }

  /** A newer pause supersedes async work. Playback queues a request every frame, so those must not. */
  private get superseded() { return !!this.latest && !this.latest.playing; }

  private async flush() {
    this.busy = true;
    try {
      while (this.latest && !this.disposed) {
        const request = this.latest;
        this.latest = null;
        const { project, time, playing, volume } = request;
        const active = new Set<string>();
        const ready = new Map<string, HTMLVideoElement>();
        const problems = new Map<string, Unavailable>();
        await Promise.all(project.tracks.flatMap((track) => {
          if (track.kind === 'text' || (track.kind === 'video' ? track.hidden : track.muted)) return [];
          return track.clips.filter((clip) => time >= clip.start && time < clipEnd(clip)).map(async (clip) => {
            active.add(clip.id);
            const audio = track.kind === 'audio';
            const player = await this.player(clip, audio);
            if (!player || this.disposed) {
              const problem = this.unavailable.get(clip.mediaId);
              if (problem) problems.set(clip.mediaId, problem);
              return;
            }
            const element = player.element;
            const target = Math.min(element.duration - 0.001, Math.max(0, clip.inS + time - clip.start));
            const drift = Math.abs(element.currentTime - target);
            if (drift > (playing && !element.paused ? 0.15 : 0.002)) {
              await waitFor(element, 'seeked', () => { element.currentTime = target; });
            }
            if (this.disposed) return;
            if (this.superseded) return;
            if (audio && this.context) {
              if (!player.gain) {
                player.source = this.context.createMediaElementSource(element);
                player.gain = this.context.createGain();
                player.source.connect(player.gain).connect(this.context.destination);
              }
              const clipGain = audioGain(project, clip as import('../editor/model').AudioClip, time);
              player.gain.gain.setTargetAtTime(playing ? volume * clipGain : 0, this.context.currentTime, 0.01);
            }
            // No browser-default audio may bypass the gain graph.
            element.muted = !audio || !this.context;
            if (playing) await element.play(); else element.pause();
            if (!audio && element.readyState >= 2) ready.set(clip.id, element);
          });
        }));
        for (const [id, player] of this.players) if (!active.has(id)) { player.element.pause(); this.release(id); }
        if (this.disposed || this.superseded) continue;
        const ctx = this.canvas.getContext('2d');
        if (ctx) renderFrame(project, time, ctx, (clip) => ready.get(clip.id) ?? null);
        this.status(unavailableMessage(problems, project));
      }
    } catch (error) {
      if (!this.disposed) this.status(error instanceof Error ? error.message : 'Playback failed.');
    } finally {
      this.busy = false;
      if (this.latest && !this.disposed) void this.flush();
    }
  }

  private release(id: string) {
    const player = this.players.get(id);
    if (!player) return;
    player.element.pause();
    player.source?.disconnect(); player.gain?.disconnect();
    player.element.removeAttribute('src'); player.element.load();
    URL.revokeObjectURL(player.url);
    this.players.delete(id);
  }
  dispose() {
    this.disposed = true;
    this.latest = null;
    for (const id of this.players.keys()) this.release(id);
    void this.context?.close();
  }
}
