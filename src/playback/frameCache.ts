import { t as translate } from '../i18n/core';
import { ALL_FORMATS, BlobSource, CanvasSink, EncodedPacketSink, Input } from 'mediabunny';
import type { WrappedCanvas } from 'mediabunny';
import { frameAt, openAnimation } from '../media/animation';
import type { Animation } from '../media/animation';

const FRAME_LIMIT = 12;
const LOOKAHEAD = 0.25;
/** Faster clips can't decode every frame while playing, so they show key frames only. */
const SKIM_ABOVE = 4;
/** Most pictures a second a skimming clip shows; all-intra footage would otherwise decode every frame. */
const SKIM_FPS = 30;
const METADATA = { metadataOnly: true };

/** Preview-sized frames of one clip's source, decoded ahead of the playhead. */
export interface Frames {
  /** `rate` is source seconds per second of playback: the clip's speed. */
  request(time: number, playing: boolean, rate?: number): void;
  frame(time: number, playing: boolean): CanvasImageSource | null;
  /** Whether playback can show `time` now, or will never get a frame for it. */
  ready(time: number): boolean;
  dispose(): void;
}

/** The preview canvas: frames decode no larger than it needs. */
export interface Size { width: number; height: number }

/** Caps both dimensions at `size` while preserving the source aspect ratio. Export keeps the original resolution. */
const previewWidth = (width: number, height: number, size: Size) => Math.max(1, Math.round(Math.min(width, size.width, size.height * width / height)));

/** A still image decoded once at preview size; every time shows the same frame. */
export class StillFrame implements Frames {
  private image: ImageBitmap | null = null;
  private disposed = false;

  constructor(file: File, size: Size, changed: () => void, failed: (error: unknown) => void) {
    createImageBitmap(file).then(async (full) => {
      try { return await createImageBitmap(full, { resizeWidth: previewWidth(full.width, full.height, size), resizeQuality: 'high' }); }
      finally { full.close(); }
    }).then((image) => {
      if (this.disposed) { image.close(); return; }
      this.image = image;
      changed();
    }, (error: unknown) => { if (!this.disposed) failed(error); });
  }

  request() {}
  frame() { return this.image; }
  ready() { return !!this.image; }
  dispose() {
    this.disposed = true;
    this.image?.close();
    this.image = null;
  }
}

/** Most memory an animation's preview frames may take; bigger ones decode at a smaller size. */
const ANIMATION_BYTES = 256 * 1024 * 1024;

/** An animated image decoded once at preview size, looping forever. */
export class AnimatedFrame implements Frames {
  private images: ImageBitmap[] = [];
  private timing: Pick<Animation, 'starts' | 'loop'> | null = null;
  private disposed = false;

  constructor(file: File, type: string, size: Size, changed: () => void, failed: (error: unknown) => void) {
    const images: ImageBitmap[] = [];
    openAnimation(file, type, async (frame, _, count) => {
      if (this.disposed) return;
      const { displayWidth: w, displayHeight: h } = frame;
      const fit = Math.min(1, Math.sqrt(ANIMATION_BYTES / (count * w * h * 4)));
      const resizeWidth = Math.max(1, Math.round(Math.min(previewWidth(w, h, size), w * fit)));
      images.push(await createImageBitmap(frame, { resizeWidth, resizeHeight: Math.max(1, Math.round(resizeWidth * h / w)), resizeQuality: 'high' }));
    }).then((animation) => {
      animation?.decoder.close();
      if (this.disposed || !animation) { images.forEach((i) => i.close()); if (!this.disposed) failed(new Error(translate('thisAnimationCouldNotBeDecoded'))); return; }
      this.images = images;
      this.timing = animation;
      changed();
    }, (error: unknown) => { images.forEach((i) => i.close()); if (!this.disposed) failed(error); });
  }

  request() {}
  frame(time: number) { return this.timing ? this.images[frameAt(this.timing, time)] : null; }
  ready() { return !!this.timing; }
  dispose() {
    this.disposed = true;
    this.images.forEach((i) => i.close());
    this.images = [];
  }
}

/** A sequential decoder with a small preview-sized frame window. CanvasSink closes its VideoSamples. */
export class FrameCache implements Frames {
  private input: Input;
  private sink: Promise<CanvasSink>;
  private frames: WrappedCanvas[] = [];
  private iterator: AsyncGenerator<WrappedCanvas | null, void, unknown> | null = null;
  private packets: Promise<EncodedPacketSink>;
  /** While playing faster than `SKIM_ABOVE`, the rate it plays at; otherwise 0 and every frame decodes. */
  private skim = 0;
  /** The key frame showing when skimming stopped, kept on screen until the exact frame decodes. */
  private held: WrappedCanvas | null = null;
  private wanted = 0;
  private through = 0;
  private generation = 0;
  private iteratorGeneration = -1;
  private busy = false;
  private disposed = false;
  private ended = false;
  private lastTarget = -Infinity;

  constructor(file: File, size: Size, private changed: () => void, private failed: (error: unknown) => void) {
    this.input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const track = this.input.getPrimaryVideoTrack().then(async (track) => {
      if (!track || !await track.canDecode()) throw new Error(translate('thisVideoCouldNotBeDecoded'));
      return track;
    });
    this.sink = track.then((track) => new CanvasSink(track, { width: previewWidth(track.displayWidth, track.displayHeight, size), alpha: true, poolSize: 0 }));
    this.packets = track.then((track) => new EncodedPacketSink(track));
    void this.packets.catch(() => undefined);
    // The first request attaches the operational error handler; avoid an unhandled rejection during preload.
    void this.sink.catch(() => undefined);
  }

  request(time: number, playing: boolean, rate = 1) {
    const skim = playing && rate > SKIM_ABOVE ? rate : 0;
    const backwards = time < this.lastTarget - 1e-5;
    const jump = Math.abs(time - this.lastTarget) > 0.5 * Math.max(1, skim);
    this.lastTarget = time;
    this.wanted = time;
    this.through = time + (playing ? LOOKAHEAD * Math.max(1, skim) : 0);
    if (skim !== this.skim || ((backwards || jump) && !(skim ? this.skimmed(time) : this.exact(time)))) {
      this.release();
      const shown = this.skim && !skim ? this.skimmed(time) : undefined;
      if (shown) { this.frames.splice(this.frames.indexOf(shown), 1); this.held = shown; }
      this.skim = skim;
      this.generation++;
      this.ended = false;
    }
    if (!this.busy && !this.ended) void this.fill();
  }

  private exact(time: number) {
    return this.frames.find((f) => time + 1e-6 >= f.timestamp && time + 1e-6 < f.timestamp + f.duration);
  }

  frame(time: number, playing: boolean): CanvasImageSource | null {
    if (this.skim) return this.skimmed(time)?.canvas ?? null;
    const exact = this.exact(time);
    if (exact) return exact.canvas;
    if (this.held) return this.held.canvas;
    // During playback retain only a nearby preceding frame. Paused seeks never show the wrong frame.
    const previous = [...this.frames].reverse().find((f) => f.timestamp <= time);
    return playing && previous && time - previous.timestamp < 0.25 ? previous.canvas : null;
  }

  /** A key frame shows until the next one. Past the newest decoded one, only briefly: decoding may be behind. */
  private skimmed(time: number) {
    let index = this.frames.length - 1;
    while (index >= 0 && this.frames[index].timestamp > time + 1e-6) index--;
    const shown = this.frames[index];
    if (shown && (index < this.frames.length - 1 || this.ended || time - shown.timestamp < this.skim * LOOKAHEAD)) return shown;
  }

  ready(time: number) { return this.ended || this.frame(time, true) !== null; }

  private async fill() {
    this.busy = true;
    let generation = this.iteratorGeneration;
    try {
      const sink = await this.sink;
      while (!this.disposed && !this.ended) {
        if (!this.iterator || generation !== this.generation) {
          await this.iterator?.return();
          if (this.disposed) break;
          generation = this.generation;
          this.iteratorGeneration = generation;
          this.clear();
          if (this.skim) {
            this.iterator = sink.canvasesAtTimestamps(this.keyTimes(await this.packets, this.wanted, this.skim / SKIM_FPS));
            continue;
          }
          // getCanvas returns the frame containing a timestamp, including a seek between frame boundaries.
          const first = await sink.getCanvas(this.wanted);
          if (this.disposed || generation !== this.generation) { if (first) this.drop(first); continue; }
          if (first) this.add(first);
          this.iterator = sink.canvases(first ? first.timestamp + Math.max(first.duration, 1e-6) : this.wanted);
        }
        const last = this.frames.at(-1);
        if (last && (this.skim ? last.timestamp : last.timestamp + last.duration) > this.through + 1e-6) break;
        // Never evict the displayed frame just to decode farther ahead on high-frame-rate footage.
        if (this.frames.length >= FRAME_LIMIT) {
          const shownUntil = this.skim ? this.frames[1].timestamp : this.frames[0].timestamp + this.frames[0].duration;
          if (shownUntil > this.wanted + 1e-6) break;
          this.drop(this.frames.shift()!);
        }
        const result = await this.iterator.next();
        if (this.disposed || generation !== this.generation) { if (!result.done && result.value) this.drop(result.value); continue; }
        if (result.done) { this.ended = true; break; }
        if (result.value) this.add(result.value);
      }
    } catch (error) {
      if (!this.disposed) { this.ended = true; this.failed(error); }
    } finally {
      this.busy = false;
      if (!this.disposed && !this.ended && generation !== this.generation) void this.fill();
    }
  }

  /** Key frame times from the one showing at `from` on, at least `gap` seconds apart. */
  private async *keyTimes(packets: EncodedPacketSink, from: number, gap: number) {
    let packet = await packets.getKeyPacket(from, METADATA) ?? await packets.getFirstKeyPacket(METADATA);
    let last = -Infinity;
    while (packet && !this.disposed) {
      if (packet.timestamp >= last + gap - 1e-6) { last = packet.timestamp; yield packet.timestamp; }
      packet = await packets.getNextKeyPacket(packet, METADATA);
    }
  }

  private add(frame: WrappedCanvas) {
    this.release();
    this.frames.push(frame);
    while (this.frames.length > FRAME_LIMIT) this.drop(this.frames.shift()!);
    this.changed();
  }
  private release() { if (this.held) { this.drop(this.held); this.held = null; } }
  private drop(frame: WrappedCanvas) { frame.canvas.width = 0; frame.canvas.height = 0; }
  private clear() { this.frames.forEach((f) => this.drop(f)); this.frames = []; }
  dispose() {
    this.disposed = true;
    this.clear();
    this.release();
    this.input.dispose();
    void this.iterator?.return().catch(() => undefined);
  }
}
