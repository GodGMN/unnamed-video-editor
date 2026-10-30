export type ClipId = 'a' | 'b' | 'c' | 'd' | 'e';
export type FitMode = 'fit' | 'fill' | 'custom';
export type TransitionType = 'cut' | 'fade' | 'crossfade';
export type Tool = 'select' | 'split' | 'text';
export type TrackKey = 'V1' | 'V2' | 'A1' | 'A2';
export type TextAnchor = `${'t' | 'c' | 'b'}${'l' | 'c' | 'r'}`;

export interface SourceInfo {
  container: string;
  video: string;
  w: number;
  h: number;
  fps: string;
  rate: string;
  audio: string;
  size: string;
}

export interface MediaSource {
  name: string;
  tone: string;
  /** Source duration in seconds. */
  src: number;
  /** Seed for the placeholder filmstrip and waveform. */
  seed: number;
  info: SourceInfo;
}

export interface ClipState {
  inS: number;
  outS: number;
  vol: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  /** -1 (exponential) … 0 (linear) … 1 (logarithmic). */
  curveIn: number;
  curveOut: number;
  linked: boolean;
  x: number;
  y: number;
  scale: number;
  rot: number;
  fit: FitMode;
  cropT: number;
  cropR: number;
  cropB: number;
  cropL: number;
}

export interface Transition {
  type: TransitionType;
  dur: number;
}

export interface TextOverlay {
  content: string;
  size: number;
  color: string;
  pos: TextAnchor;
  start: string;
  dur: number;
}

export type Selection =
  | { kind: 'clip' | 'audio'; id: ClipId }
  | { kind: 'trans'; id: number }
  | { kind: 'text'; id: 't1' | 't2' };

export interface MenuState {
  kind: 'clip' | 'audio';
  id: ClipId;
  left: number;
  top: number;
}

export interface MediaItem {
  name: string;
  dur: string;
  tone: string;
  meta: string;
  error?: boolean;
}

export const PPS = 30; // timeline pixels per second
export const MAIN_IDS: ClipId[] = ['a', 'b', 'c', 'd'];
export const OVERLAY_START = 27;

const toast: SourceInfo = {
  container: 'MP4', video: 'H.264 Main', w: 1920, h: 1080, fps: '59.94 fps', rate: '16.0 Mb/s',
  audio: 'AAC · 44.1 kHz stereo', size: '63.6 MB',
};

export const SOURCES: Record<ClipId, MediaSource> = {
  a: { name: 'intro_beach.mp4', tone: '#2C4756', src: 12.0, seed: 1, info: { container: 'MP4', video: 'H.264 High', w: 1920, h: 1080, fps: '30 fps', rate: '12.4 Mb/s', audio: 'AAC · 48 kHz stereo', size: '18.6 MB' } },
  b: { name: 'drone_coast.mp4', tone: '#35503F', src: 24.6, seed: 2, info: { container: 'MP4', video: 'H.264 High', w: 3840, h: 2160, fps: '29.97 fps', rate: '45.1 Mb/s', audio: 'AAC · 48 kHz stereo', size: '138.7 MB' } },
  c: { name: 'dinner_toast.mp4', tone: '#5A4530', src: 31.8, seed: 3, info: toast },
  d: { name: 'dinner_toast.mp4', tone: '#5A4530', src: 31.8, seed: 4, info: toast },
  e: { name: 'sunset_timelapse.webm', tone: '#4A3A52', src: 18.0, seed: 5, info: { container: 'WebM', video: 'VP9', w: 1920, h: 1080, fps: '30 fps', rate: '6.2 Mb/s', audio: 'Opus · 48 kHz stereo', size: '14.0 MB' } },
};

export const MEDIA: MediaItem[] = [
  { name: 'intro_beach.mp4', dur: '0:12', tone: '#2C4756', meta: '1920×1080 · 30 fps · H.264' },
  { name: 'drone_coast.mp4', dur: '0:24', tone: '#35503F', meta: '3840×2160 · 30 fps · scaled to output' },
  { name: 'dinner_toast.mp4', dur: '0:31', tone: '#5A4530', meta: '1920×1080 · 60 fps · used twice' },
  { name: 'sunset_timelapse.webm', dur: '0:18', tone: '#4A3A52', meta: '1920×1080 · VP9 · on V2' },
  { name: 'screen_rec.mov', dur: '—', tone: '#24262B', meta: 'HEVC isn’t supported by this browser.', error: true },
];

export const TRANSITION_NAMES: Record<TransitionType, string> = { cut: 'Cut', fade: 'Fade', crossfade: 'Crossfade' };
export const TRANSITION_HELP: Record<TransitionType, string> = {
  cut: 'Instant switch to the next clip. Default for new clips.',
  fade: 'Fades the outgoing clip to black, then the next clip in from black. Audio dips with it.',
  crossfade: 'Overlaps both clips and blends their opacity and audio. Shortens the sequence by the overlap.',
};
export const TRANSITION_BETWEEN: [string, string][] = [
  ['intro_beach', 'drone_coast'],
  ['drone_coast', 'dinner_toast'],
  ['dinner_toast', 'dinner_toast (2)'],
];

export const CLIP_DEFAULTS: ClipState = {
  inS: 0, outS: 0, vol: 100, muted: false, fadeIn: 0, fadeOut: 0, curveIn: 0, curveOut: 0, linked: true,
  x: 0, y: 0, scale: 100, rot: 0, fit: 'fit', cropT: 0, cropR: 0, cropB: 0, cropL: 0,
};
const mk = (o: Partial<ClipState>): ClipState => ({ ...CLIP_DEFAULTS, ...o });

export interface ProjectState {
  sel: Selection;
  tool: Tool;
  menu: MenuState | null;
  hidden: Partial<Record<TrackKey, boolean>>;
  clips: Record<ClipId, ClipState>;
  scrub: number;
  /** Timeline playhead position, in sequence seconds. */
  playhead: number;
  trans: Transition[];
  text: TextOverlay;
  text2: { content: string };
}

export const initialProject: ProjectState = {
  sel: { kind: 'clip', id: 'b' },
  tool: 'select',
  menu: null,
  hidden: {},
  clips: {
    a: mk({ fadeIn: 1.2, curveIn: 0.6, inS: 2.0, outS: 10.4 }),
    b: mk({ vol: 80, fadeOut: 1.5, curveOut: -0.5, inS: 3.2, outS: 14.0, fit: 'custom', scale: 110, y: -20, cropB: 120 }),
    c: mk({ inS: 0, outS: 7.4 }),
    d: mk({ muted: true, fadeOut: 1, inS: 9.8, outS: 19.0, linked: false }),
    e: mk({ vol: 60, fadeIn: 0.6, fadeOut: 0.6, inS: 4.0, outS: 10.0, fit: 'custom', scale: 35, x: 560, y: -280 }),
  },
  scrub: 7.6,
  playhead: 12.4,
  trans: [{ type: 'crossfade', dur: 0.8 }, { type: 'cut', dur: 0.5 }, { type: 'fade', dur: 0.5 }],
  text: { content: 'Summer ’26', size: 72, color: '#FFFFFF', pos: 'bc', start: '00:10.00', dur: 5 },
  text2: { content: 'Dinner on the terrace' },
};

export interface ClipLayout {
  start: number;
  end: number;
  /** Visible start/end: crossfades overlap neighbours, and the boundary sits mid-overlap. */
  vs: number;
  ve: number;
  ov: number;
}

export function layoutTimeline(st: ProjectState) {
  const lay = {} as Record<ClipId, ClipLayout>;
  let t = 0;
  MAIN_IDS.forEach((id, i) => {
    const cs = st.clips[id];
    const end = t + cs.outS - cs.inS;
    const tr = st.trans[i];
    const ov = tr && tr.type === 'crossfade' ? tr.dur : 0;
    lay[id] = { start: t, end, ov, vs: 0, ve: 0 };
    t = end - ov;
  });
  MAIN_IDS.forEach((id, i) => {
    const l = lay[id];
    const p = i > 0 ? lay[MAIN_IDS[i - 1]] : null;
    l.vs = p ? p.end - p.ov / 2 : 0;
    l.ve = i === MAIN_IDS.length - 1 ? l.end : l.end - l.ov / 2;
  });
  const eDur = st.clips.e.outS - st.clips.e.inS;
  lay.e = { start: OVERLAY_START, end: OVERLAY_START + eDur, vs: OVERLAY_START, ve: OVERLAY_START + eDur, ov: 0 };
  const seqEnd = Math.max(lay.d.end, lay.e.end);
  return { lay, seqEnd };
}

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const x = s - m * 60;
  return String(m).padStart(2, '0') + ':' + x.toFixed(2).padStart(5, '0');
};

export const curveName = (c: number) =>
  Math.abs(c) < 0.05 ? 'linear' : (c > 0 ? 'logarithmic' : 'exponential') + ' ' + Math.round(Math.abs(c) * 100) + '%';

/** Placeholder filmstrip: one cell per ~44px with varying brightness. */
export const filmstrip = (width: number, seed: number) => {
  const n = Math.max(1, Math.round(width / 44));
  return Array.from({ length: n }, (_, i) => 0.03 + 0.07 * Math.abs(Math.sin(i * 1.3 + seed)));
};
