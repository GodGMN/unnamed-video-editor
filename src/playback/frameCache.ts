import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import type { WrappedCanvas } from 'mediabunny';

const FRAME_LIMIT = 12;
const LOOKAHEAD = 0.25;

/** A sequential decoder with a small preview-sized frame window. CanvasSink closes its VideoSamples. */
export class FrameCache {
  private input: Input;
  private sink: Promise<CanvasSink>;
  private frames: WrappedCanvas[] = [];
  private iterator: AsyncGenerator<WrappedCanvas, void, unknown> | null = null;
  private wanted = 0;
  private through = 0;
  private generation = 0;
  private busy = false;
  private disposed = false;
  private ended = false;
  private lastTarget = -Infinity;

  constructor(file: File, private changed: () => void, private failed: (error: unknown) => void) {
    this.input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    this.sink = this.input.getPrimaryVideoTrack().then(async (track) => {
      if (!track || !await track.canDecode()) throw new Error('This video could not be decoded.');
      // Cap both dimensions while preserving the source aspect ratio. Export keeps the original resolution.
      const width = Math.max(1, Math.round(Math.min(track.displayWidth, 960, 540 * track.displayWidth / track.displayHeight)));
      return new CanvasSink(track, { width, alpha: true, poolSize: 0 });
    });
    // The first request attaches the operational error handler; avoid an unhandled rejection during preload.
    void this.sink.catch(() => undefined);
  }

  request(time: number, playing: boolean) {
    const backwards = time < this.lastTarget - 1e-5;
    const jump = Math.abs(time - this.lastTarget) > 0.5;
    this.lastTarget = time;
    this.wanted = time;
    this.through = time + (playing ? LOOKAHEAD : 0);
    if ((backwards || jump) && !this.exact(time)) {
      this.generation++;
      this.ended = false;
    }
    if (!this.busy && !this.ended) void this.fill();
  }

  private exact(time: number) {
    return this.frames.find((f) => time + 1e-6 >= f.timestamp && time + 1e-6 < f.timestamp + f.duration);
  }

  frame(time: number, playing: boolean): CanvasImageSource | null {
    const exact = this.exact(time);
    if (exact) return exact.canvas;
    // During playback retain only a nearby preceding frame. Paused seeks never show the wrong frame.
    const previous = [...this.frames].reverse().find((f) => f.timestamp <= time);
    return playing && previous && time - previous.timestamp < 0.25 ? previous.canvas : null;
  }

  private async fill() {
    this.busy = true;
    let generation = this.generation;
    try {
      const sink = await this.sink;
      while (!this.disposed && !this.ended) {
        if (!this.iterator || generation !== this.generation) {
          await this.iterator?.return();
          if (this.disposed) break;
          generation = this.generation;
          this.clear();
          // getCanvas returns the frame containing a timestamp, including a seek between frame boundaries.
          const first = await sink.getCanvas(this.wanted);
          if (this.disposed || generation !== this.generation) { if (first) this.drop(first); continue; }
          if (first) this.add(first);
          this.iterator = sink.canvases(first ? first.timestamp + Math.max(first.duration, 1e-6) : this.wanted);
        }
        const last = this.frames.at(-1);
        if (last && last.timestamp + last.duration > this.through + 1e-6) break;
        // Never evict the displayed frame just to decode farther ahead on high-frame-rate footage.
        if (this.frames.length >= FRAME_LIMIT) {
          if (this.frames[0].timestamp + this.frames[0].duration > this.wanted + 1e-6) break;
          this.drop(this.frames.shift()!);
        }
        const result = await this.iterator.next();
        if (this.disposed || generation !== this.generation) { if (!result.done) this.drop(result.value); continue; }
        if (result.done) { this.ended = true; break; }
        this.add(result.value);
      }
    } catch (error) {
      if (!this.disposed) { this.ended = true; this.failed(error); }
    } finally {
      this.busy = false;
      if (!this.disposed && generation !== this.generation) void this.fill();
    }
  }

  private add(frame: WrappedCanvas) {
    this.frames.push(frame);
    while (this.frames.length > FRAME_LIMIT) this.drop(this.frames.shift()!);
    this.changed();
  }
  private drop(frame: WrappedCanvas) { frame.canvas.width = 0; frame.canvas.height = 0; }
  private clear() { this.frames.forEach((f) => this.drop(f)); this.frames = []; }
  dispose() {
    this.disposed = true;
    this.clear();
    this.input.dispose();
    void this.iterator?.return().catch(() => undefined);
  }
}
