import type { ChromaKey } from '../editor/model';

/*
 * Colour keying on the CPU. Distance is measured mostly in chroma (Cb/Cr) divided by brightness,
 * so shadows and creases on a backdrop key out with it; luma counts a little, so a grey key
 * colour doesn't take out every other grey.
 */

const LUMA_WEIGHT = 0.4;
/** Below this brightness chroma isn't scaled up any further, so dark noise doesn't read as colour. */
const DARK = 0.2;
/** Tolerance and softness at 100%, as a distance in normalised YCbCr. */
const TOLERANCE_RANGE = 0.3;
const SOFTNESS_RANGE = 0.2;
/** How far past the soft edge spill suppression still reaches. */
const SPILL_RANGE = 0.3;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

/** Keys RGBA pixels (not premultiplied) in place: alpha drops near the key colour, its tint is pulled from the rest. */
export function keyPixels(data: Uint8ClampedArray, key: ChromaKey) {
  const [kr, kg, kb] = hexRgb(key.color);
  const ky = 0.299 * kr + 0.587 * kg + 0.114 * kb;
  const kcb = (kb - ky) * 0.564, kcr = (kr - ky) * 0.713;
  const kn = Math.max(DARK, kr, kg, kb);
  const klen = Math.hypot(kcb, kcr);
  // A key colour with no hue has no tint to suppress.
  const ux = klen > 0.02 ? kcb / klen : 0, uy = klen > 0.02 ? kcr / klen : 0;
  const t0 = key.tolerance / 100 * TOLERANCE_RANGE;
  const t1 = t0 + key.softness / 100 * SOFTNESS_RANGE + 1e-4;
  const spill = key.spill / 100;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    let cb = (b - y) * 0.564, cr = (r - y) * 0.713;
    const n = Math.max(DARK, r, g, b);
    const d = Math.hypot(cb / n - kcb / kn, cr / n - kcr / kn, (y - ky) * LUMA_WEIGHT);
    const alpha = smoothstep(t0, t1, d);
    data[i + 3] *= alpha;
    if (alpha === 0) continue;
    const proj = cb * ux + cr * uy;
    const s = spill * (1 - smoothstep(t1, t1 + SPILL_RANGE, d));
    if (proj <= 0 || s === 0) continue;
    cb -= ux * proj * s; cr -= uy * proj * s;
    const nr = y + cr / 0.713, nb = y + cb / 0.564;
    data[i] = nr * 255;
    data[i + 1] = (y - 0.299 * nr - 0.114 * nb) / 0.587 * 255;
    data[i + 2] = nb * 255;
  }
}

type Keyable = Exclude<CanvasImageSource, SVGImageElement>;

export function imageSize(image: CanvasImageSource): { width: number; height: number } {
  if (typeof VideoFrame !== 'undefined' && image instanceof VideoFrame) return { width: image.displayWidth, height: image.displayHeight };
  if (typeof HTMLVideoElement !== 'undefined' && image instanceof HTMLVideoElement) return { width: image.videoWidth, height: image.videoHeight };
  const { width, height } = image as Exclude<Keyable, VideoFrame | HTMLVideoElement>;
  return { width, height };
}

const signature = (key: ChromaKey) => `${key.color}|${key.tolerance}|${key.softness}|${key.spill}`;
/** Preview redraws the same decoded frame many times while paused; key each one once per setting. */
const keyed = new WeakMap<object, { signature: string; canvas: OffscreenCanvas }>();

/** The frame with `key` applied, as a new image. */
export function keyFrame(frame: CanvasImageSource, key: ChromaKey): CanvasImageSource {
  const sig = signature(key);
  const hit = keyed.get(frame);
  if (hit?.signature === sig) return hit.canvas;
  const { width, height } = imageSize(frame);
  if (!width || !height) return frame;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(frame, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height);
  keyPixels(pixels.data, key);
  ctx.putImageData(pixels, 0, 0);
  keyed.set(frame, { signature: sig, canvas });
  return canvas;
}

/** Average colour of the pixels around (`x`, `y`) in `frame`, as `#RRGGBB`. */
export function sampleColor(frame: CanvasImageSource, x: number, y: number, radius = 2): string | null {
  const { width, height } = imageSize(frame);
  const x0 = Math.max(0, Math.floor(x) - radius), y0 = Math.max(0, Math.floor(y) - radius);
  const w = Math.min(width, Math.floor(x) + radius + 1) - x0, h = Math.min(height, Math.floor(y) + radius + 1) - y0;
  if (w <= 0 || h <= 0) return null;
  const ctx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(frame, x0, y0, w, h, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const sum = [0, 0, 0];
  let weight = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    for (let c = 0; c < 3; c++) sum[c] += data[i + c] * a;
    weight += a;
  }
  if (!weight) return null;
  return '#' + sum.map((v) => Math.round(v / weight).toString(16).padStart(2, '0')).join('').toUpperCase();
}
