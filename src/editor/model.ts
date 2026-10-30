/*
 * Project model. Everything in `Project` is plain, structured-clone-safe data (no class
 * instances, Maps or functions) so it can be persisted to IndexedDB and posted to the
 * compositor and export workers as-is. All times are in seconds.
 */

export type FitMode = 'fit' | 'fill' | 'custom';
export type TransitionType = 'cut' | 'fade' | 'crossfade';
export type Tool = 'select' | 'split' | 'text';
export type TextAnchor = `${'t' | 'c' | 'b'}${'l' | 'c' | 'r'}`;

export interface VideoStream {
  /** WebCodecs codec string, e.g. `avc1.640028`, `vp09.00.40.08`, `hvc1.2.4.L150.B0`. */
  codec: string;
  width: number;
  height: number;
  fps: number;
}

export interface AudioStream {
  /** WebCodecs codec string, e.g. `mp4a.40.2`, `opus`. */
  codec: string;
  sampleRate: number;
  channels: number;
}

/** An imported source file. The file bytes live outside the project, keyed by `id`. */
export interface Media {
  id: string;
  name: string;
  /** Container format label, e.g. `MP4`, `WebM`, `MOV`. */
  container: string;
  duration: number;
  /** File size in bytes. */
  size: number;
  /** Overall bitrate in bits per second. */
  bitrate: number;
  video: VideoStream | null;
  audio: AudioStream | null;
  /** Whether this browser can decode every stream; if not, the file needs converting first. */
  decodable: boolean;
  /** Thumbnail background colour; also the clip colour on the timeline. */
  tone: string;
  /** Seed for the placeholder filmstrip and waveform until real ones are generated. */
  seed: number;
}

export interface Transition {
  type: TransitionType;
  duration: number;
}

interface ClipBase {
  id: string;
  mediaId: string;
  /** Timeline position of the clip's first frame. */
  start: number;
  /** Source in/out points. */
  inS: number;
  outS: number;
  /** Video and audio clips cut from the same source together share a link id. */
  linkId: string | null;
  /** Linked clips trim together. Kept in sync across every clip sharing `linkId`. */
  linked: boolean;
}

export interface VideoClip extends ClipBase {
  /** Output-pixel offset from centre. */
  x: number;
  y: number;
  /** Percent. */
  scale: number;
  /** Degrees. */
  rot: number;
  fit: FitMode;
  /** Source pixels cropped from each edge. */
  cropT: number;
  cropR: number;
  cropB: number;
  cropL: number;
  /** Transition into the next adjacent clip on the same track; `null` is a plain cut. */
  transitionOut: Transition | null;
}

export interface AudioClip extends ClipBase {
  /** Percent. */
  vol: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  /** -1 (exponential) … 0 (linear) … 1 (logarithmic). */
  curveIn: number;
  curveOut: number;
}

export interface TextItem {
  id: string;
  content: string;
  /** Font size in output pixels. */
  size: number;
  color: string;
  pos: TextAnchor;
  start: number;
  duration: number;
}

interface TrackBase {
  id: string;
  /** Short name shown in the track header, e.g. `V1`. */
  name: string;
  /** Secondary header label, e.g. `Main`. */
  label: string;
}

export interface VideoTrack extends TrackBase {
  kind: 'video';
  hidden: boolean;
  /**
   * Clips sit back to back with no gaps, and crossfades overlap neighbours. Edits that
   * change a clip's length ripple the clips after it (and their linked clips).
   */
  magnetic: boolean;
  /** Sorted by `start`. */
  clips: VideoClip[];
}

export interface AudioTrack extends TrackBase {
  kind: 'audio';
  muted: boolean;
  /** Sorted by `start`. */
  clips: AudioClip[];
}

export interface TextTrack extends TrackBase {
  kind: 'text';
  hidden: boolean;
  items: TextItem[];
}

export type Track = VideoTrack | AudioTrack | TextTrack;
export type Clip = VideoClip | AudioClip;

export interface Project {
  name: string;
  output: { width: number; height: number; fps: number };
  /** Imported sources keyed by id. */
  media: Record<string, Media>;
  /** In display order, top to bottom: each video track draws over the video tracks below it. */
  tracks: Track[];
}

/* ---------- Editor UI state (not persisted) ---------- */

export type Selection =
  | { kind: 'clip' | 'audio'; id: string }
  /** The transition after the given video clip. */
  | { kind: 'trans'; id: string }
  | { kind: 'text'; id: string };

export interface MenuState {
  kind: 'clip' | 'audio';
  id: string;
  left: number;
  top: number;
}

export interface EditorUi {
  sel: Selection | null;
  /** The clip shown in the trim scrubber: the last selected video or audio clip. */
  focusClip: string | null;
  tool: Tool;
  menu: MenuState | null;
  /** Trim scrubber position, in source seconds. */
  scrub: number;
  /** Timeline playhead position, in sequence seconds. */
  playhead: number;
}

/* ---------- Constants ---------- */

export const PPS = 30; // timeline pixels per second
export const DEFAULT_TRANSITION: Transition = { type: 'cut', duration: 0.5 };

type ClipDefaults<C> = Omit<C, 'id' | 'mediaId' | 'start' | 'inS' | 'outS' | 'linkId'>;
/** Property values of a fresh clip; also what the properties panel's reset buttons restore. */
export const VIDEO_CLIP_DEFAULTS: ClipDefaults<VideoClip> = {
  linked: true, x: 0, y: 0, scale: 100, rot: 0, fit: 'fit', cropT: 0, cropR: 0, cropB: 0, cropL: 0, transitionOut: null,
};
export const AUDIO_CLIP_DEFAULTS: ClipDefaults<AudioClip> = {
  linked: true, vol: 100, muted: false, fadeIn: 0, fadeOut: 0, curveIn: 0, curveOut: 0,
};

export const TRANSITION_NAMES: Record<TransitionType, string> = { cut: 'Cut', fade: 'Fade', crossfade: 'Crossfade' };
export const TRANSITION_HELP: Record<TransitionType, string> = {
  cut: 'Instant switch to the next clip. Default for new clips.',
  fade: 'Fades the outgoing clip to black, then the next clip in from black. Audio dips with it.',
  crossfade: 'Overlaps both clips and blends their opacity and audio. Shortens the sequence by the overlap.',
};

/** Stands in for a clip's media when its id isn't in `Project.media`. */
export const MISSING_MEDIA: Media = {
  id: '', name: 'Missing media', container: '—', duration: 0, size: 0, bitrate: 0,
  video: null, audio: null, decodable: false, tone: '#24262B', seed: 0,
};

/* ---------- Queries ---------- */

export const clipDuration = (c: { inS: number; outS: number }) => c.outS - c.inS;
export const clipEnd = (c: ClipBase) => c.start + clipDuration(c);

export const videoTracks = (p: Project) => p.tracks.filter((t): t is VideoTrack => t.kind === 'video');
export const audioTracks = (p: Project) => p.tracks.filter((t): t is AudioTrack => t.kind === 'audio');
export const textTracks = (p: Project) => p.tracks.filter((t): t is TextTrack => t.kind === 'text');

export function findClip(p: Project, id: string | null | undefined): { clip: Clip; track: VideoTrack | AudioTrack } | null {
  for (const track of p.tracks) {
    if (track.kind === 'text') continue;
    const clip = (track.clips as Clip[]).find((c) => c.id === id);
    if (clip) return { clip, track };
  }
  return null;
}

export function findVideoClip(p: Project, id: string | null | undefined) {
  const f = findClip(p, id);
  return f && f.track.kind === 'video' ? (f.clip as VideoClip) : null;
}

export function findAudioClip(p: Project, id: string | null | undefined) {
  const f = findClip(p, id);
  return f && f.track.kind === 'audio' ? (f.clip as AudioClip) : null;
}

export function findTextItem(p: Project, id: string | null | undefined) {
  for (const t of textTracks(p)) {
    const item = t.items.find((x) => x.id === id);
    if (item) return item;
  }
  return null;
}

/** Clips on other tracks that share this clip's link id. */
export function partnersOf(p: Project, clip: Clip): Clip[] {
  if (!clip.linkId) return [];
  const out: Clip[] = [];
  for (const t of p.tracks) {
    if (t.kind === 'text') continue;
    for (const c of t.clips as Clip[]) if (c.linkId === clip.linkId && c.id !== clip.id) out.push(c);
  }
  return out;
}

/** The audio clip that plays a clip's sound: itself for audio clips, else its linked audio partner. */
export function audioFor(p: Project, id: string): AudioClip | null {
  const own = findAudioClip(p, id);
  if (own) return own;
  const f = findClip(p, id);
  const partner = f && partnersOf(p, f.clip).find((c) => findAudioClip(p, c.id));
  return partner ? (partner as AudioClip) : null;
}

/** Seconds two adjacent clips overlap: crossfades overlap by their duration, capped by either clip. */
export function overlapAfter(clip: VideoClip, next: Clip) {
  const tr = clip.transitionOut;
  if (!tr || tr.type !== 'crossfade') return 0;
  return Math.max(0, Math.min(tr.duration, clipDuration(clip), clipDuration(next)));
}

/* ---------- Layout ---------- */

export interface ClipLayout {
  start: number;
  end: number;
  /** Visible start/end: overlapping neighbours (crossfades) meet mid-overlap. */
  vs: number;
  ve: number;
  /** The next clip when it touches or overlaps this one; transitions sit on this boundary. */
  nextId: string | null;
  /** Display name: the media name, numbered when the same source is used more than once. */
  name: string;
}

export interface TimelineLayout {
  clips: Record<string, ClipLayout>;
  /** End of the last clip or text item. */
  end: number;
}

const EPS = 1e-6;

export function layoutTimeline(p: Project): TimelineLayout {
  const clips: Record<string, ClipLayout> = {};
  const uses: Record<string, number> = {};
  let end = 0;

  for (const track of p.tracks) {
    if (track.kind === 'text') {
      for (const x of track.items) end = Math.max(end, x.start + x.duration);
      continue;
    }
    const list = [...(track.clips as Clip[])].sort((a, b) => a.start - b.start);
    list.forEach((c, i) => {
      const prev = list[i - 1];
      const next = list[i + 1];
      const s = c.start;
      const e = clipEnd(c);
      const prevEnd = prev ? clipEnd(prev) : -Infinity;
      const key = track.kind + ':' + c.mediaId;
      uses[key] = (uses[key] ?? 0) + 1;
      const stem = p.media[c.mediaId]?.name.replace(/\.[^.]+$/, '') ?? 'Missing media';
      clips[c.id] = {
        start: s,
        end: e,
        vs: prevEnd > s ? (s + prevEnd) / 2 : s,
        ve: next && next.start < e ? (next.start + e) / 2 : e,
        nextId: next && next.start <= e + EPS ? next.id : null,
        name: uses[key] > 1 ? `${stem} (${uses[key]})` : stem,
      };
      end = Math.max(end, e);
    });
  }
  return { clips, end };
}

/* ---------- Edits ---------- */

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/**
 * Restores the model's invariants after an edit: packs magnetic tracks back to back
 * (honouring crossfade overlaps) and moves each shifted clip's linked partners by the same
 * amount, so audio stays in sync with its video.
 */
export function settle(p: Project): Project {
  const shift = new Map<string, number>();
  const moved = new Set<string>();
  let tracks = p.tracks.map((t) => {
    if (t.kind === 'text') return t;
    if (t.kind === 'audio' || !t.magnetic) return { ...t, clips: [...t.clips].sort((a, b) => a.start - b.start) } as Track;
    if (t.clips.length === 0) return t;
    let at = t.clips[0].start;
    const clips = t.clips.map((c, i) => {
      const start = round6(at);
      const next = t.clips[i + 1];
      at = start + clipDuration(c) - (next ? overlapAfter(c, next) : 0);
      if (start === c.start) return c;
      if (c.linkId) shift.set(c.linkId, start - c.start);
      moved.add(c.id);
      return { ...c, start };
    });
    return { ...t, clips };
  });
  if (shift.size) {
    tracks = tracks.map((t) => {
      if (t.kind === 'text') return t;
      const clips = (t.clips as Clip[]).map((c) => {
        const d = c.linkId != null && !moved.has(c.id) ? shift.get(c.linkId) : undefined;
        return d ? { ...c, start: round6(c.start + d) } : c;
      }).sort((a, b) => a.start - b.start);
      return { ...t, clips } as Track;
    });
  }
  return { ...p, tracks };
}

/** Clip fields that apply to every linked partner when `linked` is on. */
const LINKED_KEYS = ['inS', 'outS', 'start'] as const;

/** Patches one clip. Trims carry over to linked partners, and `linked` itself always does. */
export function patchClip<C extends Clip>(p: Project, id: string, patch: Partial<C>): Project {
  const f = findClip(p, id);
  if (!f) return p;
  const linked = patch.linked ?? f.clip.linked;
  const shared: Partial<Clip> = {};
  if (linked) for (const k of LINKED_KEYS) if (k in patch) shared[k] = patch[k as keyof C] as number;
  if ('linked' in patch) shared.linked = linked;
  const partners = new Set(partnersOf(p, f.clip).map((c) => c.id));

  const tracks = p.tracks.map((t) => {
    if (t.kind === 'text') return t;
    const clips = (t.clips as Clip[]).map((c) =>
      c.id === id ? { ...c, ...patch } : partners.has(c.id) ? { ...c, ...shared } : c);
    return { ...t, clips } as Track;
  });
  return { ...p, tracks };
}

export function patchTextItem(p: Project, id: string, patch: Partial<TextItem>): Project {
  return {
    ...p,
    tracks: p.tracks.map((t) => (t.kind === 'text'
      ? { ...t, items: t.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) }
      : t)),
  };
}

export function patchTrack(p: Project, id: string, patch: Partial<{ hidden: boolean; muted: boolean }>): Project {
  return { ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...patch } as Track : t)) };
}

export const newId = () => crypto.randomUUID();

/* ---------- Formatting ---------- */

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const x = s - m * 60;
  return String(m).padStart(2, '0') + ':' + x.toFixed(2).padStart(5, '0');
};

/** Parses `mm:ss.xx`, `ss.xx` or `h:mm:ss`; returns null when the text isn't a time. */
export function parseTime(text: string): number | null {
  const parts = text.trim().split(':');
  if (parts.length > 3 || parts.some((x) => !/^\d+(\.\d+)?$/.test(x))) return null;
  return parts.reduce((acc, x) => acc * 60 + Number(x), 0);
}

/** `m:ss`, as shown on media thumbnails. */
export const fmtShortDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const curveName = (c: number) =>
  Math.abs(c) < 0.05 ? 'linear' : (c > 0 ? 'logarithmic' : 'exponential') + ' ' + Math.round(Math.abs(c) * 100) + '%';

const H264_PROFILES: Record<string, string> = {
  '42': 'Baseline', '4d': 'Main', '58': 'Extended', '64': 'High', '6e': 'High 10', '7a': 'High 4:2:2', 'f4': 'High 4:4:4',
};

/** Human-readable name for a WebCodecs codec string, e.g. `avc1.640028` → `H.264 High`. */
export function codecName(codec: string): string {
  const [tag, a] = codec.toLowerCase().split('.');
  switch (tag) {
    case 'avc1': case 'avc3': {
      const profile = H264_PROFILES[(a ?? '').slice(0, 2)];
      return profile ? `H.264 ${profile}` : 'H.264';
    }
    case 'hvc1': case 'hev1': return a === '2' ? 'HEVC Main 10' : a === '1' ? 'HEVC Main' : 'HEVC';
    case 'vp8': return 'VP8';
    case 'vp09': return 'VP9';
    case 'av01': return 'AV1';
    case 'mp4a': return a === '6b' || a === '69' ? 'MP3' : 'AAC';
    case 'mp3': return 'MP3';
    case 'opus': return 'Opus';
    case 'vorbis': return 'Vorbis';
    case 'flac': return 'FLAC';
    default: return tag.startsWith('pcm') ? 'PCM' : codec;
  }
}

/** Codec family without profile, e.g. `H.264`. */
export const codecFamily = (codec: string) => codecName(codec).split(' ')[0];

export const fmtFps = (fps: number) => `${Number(fps.toFixed(2))} fps`;
export const fmtBitrate = (bps: number) => `${(bps / 1e6).toFixed(1)} Mb/s`;
export const fmtSize = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`);
export const fmtAudio = (a: AudioStream) =>
  `${codecName(a.codec)} · ${a.sampleRate / 1000} kHz ${a.channels === 1 ? 'mono' : a.channels === 2 ? 'stereo' : `${a.channels} ch`}`;

/** Placeholder filmstrip: one cell per ~44px with varying brightness. */
export const filmstrip = (width: number, seed: number) => {
  const n = Math.max(1, Math.round(width / 44));
  return Array.from({ length: n }, (_, i) => 0.03 + 0.07 * Math.abs(Math.sin(i * 1.3 + seed)));
};
