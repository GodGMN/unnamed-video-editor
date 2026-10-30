/*
 * Animated images (GIF, animated WebP, APNG, AVIF sequences) through WebCodecs' ImageDecoder.
 * Where the browser has no ImageDecoder, or the image has a single frame, it imports as a still.
 */

/** Browsers show GIF frames of 10 ms or less for 100 ms; do the same so they don't race. */
const frameMicros = (us: number | null) => us && us > 10_000 ? us : 100_000;

export interface Animation {
  decoder: ImageDecoder;
  /** Start time of each frame within one loop, in seconds. */
  starts: number[];
  /** Length of one loop, in seconds. */
  loop: number;
}

/**
 * Opens `data` as an animation, decoding every frame once to learn its timing. `onFrame` sees each
 * frame (with the frame count) before it is closed. Null when the image isn't animated here.
 */
export async function openAnimation(data: Blob, type: string, onFrame?: (frame: VideoFrame, index: number, count: number) => unknown): Promise<Animation | null> {
  if (typeof ImageDecoder === 'undefined' || !await ImageDecoder.isTypeSupported(type).catch(() => false)) return null;
  const decoder = new ImageDecoder({ data: await data.arrayBuffer(), type });
  try {
    await decoder.tracks.ready;
    await decoder.completed;
    const track = decoder.tracks.selectedTrack;
    if (!track?.animated || track.frameCount < 2) { decoder.close(); return null; }
    const starts: number[] = [];
    // Whole microseconds, so the loop adds up without float drift.
    let micros = 0;
    for (let i = 0; i < track.frameCount; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      try {
        starts.push(micros / 1e6);
        micros += frameMicros(image.duration);
        await onFrame?.(image, i, track.frameCount);
      } finally { image.close(); }
    }
    return { decoder, starts, loop: micros / 1e6 };
  } catch (error) { decoder.close(); throw error; }
}

/** Where `time` falls in a looping animation: positive modulo of the loop length. */
export const loopTime = (time: number, loop: number) => ((time % loop) + loop) % loop;

/** Index of the frame showing at `time` (any time; it loops). */
export function frameAt({ starts, loop }: Pick<Animation, 'starts' | 'loop'>, time: number): number {
  const t = loopTime(time, loop);
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= t + 1e-9) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** The MIME type of an imported image, from its format label. */
export const imageType = (container: string) => container === 'APNG' ? 'image/png' : `image/${container.toLowerCase()}`;

/** Decodes frames of an animation on demand, keeping only the latest. For export, at full size. */
export class AnimationReader {
  private index = -1;
  private frame: VideoFrame | null = null;
  private animation: Animation;
  constructor(animation: Animation) { this.animation = animation; }

  async at(time: number): Promise<VideoFrame> {
    const index = frameAt(this.animation, time);
    if (index !== this.index || !this.frame) {
      const { image } = await this.animation.decoder.decode({ frameIndex: index });
      this.frame?.close();
      this.frame = image;
      this.index = index;
    }
    return this.frame;
  }

  dispose() {
    this.frame?.close();
    this.frame = null;
    this.animation.decoder.close();
  }
}
