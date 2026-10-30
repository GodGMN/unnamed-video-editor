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
   * Legacy saved-track flag. Placement is always controlled by clip start times.
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

export interface ClipSelection { kind: 'clip' | 'audio'; id: string }

export type Selection =
  | ClipSelection
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
  /** Video and audio clips in the selection; Ctrl-click adds or removes one. */
  picked: ClipSelection[];
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
  fade: 'Fades through black across the existing overlap. Drag clips to change the overlap.',
  crossfade: 'Blends the two clips across their existing overlap. Drag clips to change the overlap.',
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

/** Actual intersection of two clips, independent of the selected effect. */
export function overlapAfter(clip: VideoClip, next: Clip) {
  return Math.max(0, Math.min(clipEnd(clip), clipEnd(next)) - Math.max(clip.start, next.start));
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

/** Keep track order deterministic without changing user-authored positions. */
export function settle(p: Project): Project {
  return { ...p, tracks: p.tracks.map(t => t.kind === 'text' ? t : {
    ...t, clips: [...t.clips].sort((a, b) => a.start - b.start),
  } as Track) };
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

/** Links a video and an audio clip as a fresh pair, detaching each from any earlier partner. */
export function linkClips(p: Project, videoId: string, audioId: string, linkId: string): Project {
  if (!findVideoClip(p, videoId) || !findAudioClip(p, audioId)) return p;
  return { ...p, tracks: p.tracks.map(t => t.kind === 'text' ? t : {
    ...t, clips: t.clips.map(c => c.id === videoId || c.id === audioId ? { ...c, linkId, linked: true } : c),
  } as Track) };
}

/** The picked clips as a video and audio pair, when they are exactly one of each. */
export function pickedPair(p: Project, picked: ClipSelection[]): { video: VideoClip; audio: AudioClip } | null {
  if (picked.length !== 2) return null;
  const video = findVideoClip(p, picked.find((x) => x.kind === 'clip')?.id);
  const audio = findAudioClip(p, picked.find((x) => x.kind === 'audio')?.id);
  return video && audio ? { video, audio } : null;
}

/** Move linked clips by a common delta without packing away the user's placement. */
export function moveClip(p: Project, id: string, start: number): Project {
  const found = findClip(p, id);
  if (!found) return p;
  const group = [found.clip, ...(found.clip.linked ? partnersOf(p, found.clip) : [])];
  const ids = new Set(group.map(c => c.id));
  const delta = Math.max(start - found.clip.start, -Math.min(...group.map(c => c.start)));
  return { ...p, tracks: p.tracks.map(t => {
    if (t.kind === 'text') return t;
    const clips = t.clips.map(c => ids.has(c.id) ? { ...c, start: round6(c.start + delta) } : c)
      .sort((a, b) => a.start - b.start);
    return { ...t, clips } as Track;
  }) };
}

/** Both edges can snap; the radius stays constant in screen pixels at every zoom. */
export function snapClipStart(start: number, duration: number, targets: number[], pixelsPerSecond: number): number {
  let result = start;
  let distance = 8 / pixelsPerSecond;
  for (const target of targets) for (const edge of [0, duration]) {
    const candidate = target - edge;
    const d = Math.abs(candidate - start);
    if (candidate >= 0 && d < distance) { result = candidate; distance = d; }
  }
  return result;
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

export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  // getRandomValues is also available on HTTP origins.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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

/** Places a source on a compatible track, keeping its audio linked on a separate track. */
export function placeMedia(p: Project, mediaId: string, trackId: string, time: number, id: string): Project {
  const media = p.media[mediaId];
  const track = p.tracks.find((t) => t.id === trackId);
  if (!media?.decodable || !track || track.kind === 'text' || (track.kind === 'video' ? !media.video : !media.audio)) return p;
  const start = track.kind === 'video' && track.magnetic
    ? Math.max(0, ...track.clips.map(clipEnd)) : Math.max(0, time);
  const base = { id, mediaId, start, inS: 0, outS: media.duration, linkId: null, linked: false };
  if (track.kind === 'audio') return { ...p, tracks: p.tracks.map((t) => t.id === trackId ? { ...track, clips: [...track.clips, { ...AUDIO_CLIP_DEFAULTS, ...base }].sort((a, b) => a.start - b.start) } : t) };
  const audioTrack = media.audio ? p.tracks.find((t): t is AudioTrack => t.kind === 'audio' && t.clips.every((c) => clipEnd(c) <= start || c.start >= start + media.duration)) : undefined;
  const audioId = `${id}-audio`;
  const linkId = media.audio ? id : null;
  const videoClip: VideoClip = { ...VIDEO_CLIP_DEFAULTS, ...base, linkId, linked: !!linkId };
  const audioClip: AudioClip = { ...AUDIO_CLIP_DEFAULTS, ...base, id: audioId, linkId, linked: true };
  const tracks = p.tracks.map((t): Track => {
    if (t.id === trackId) return { ...track, clips: [...track.clips, videoClip].sort((a, b) => a.start - b.start) };
    if (t === audioTrack) return { ...audioTrack, clips: [...audioTrack.clips, audioClip].sort((a, b) => a.start - b.start) };
    return t;
  });
  if (media.audio && !audioTrack) tracks.push({ id: `${id}-track`, name: `A${p.tracks.filter((t) => t.kind === 'audio').length + 1}`, label: 'Audio', kind: 'audio', muted: false, clips: [audioClip] });
  return settle({ ...p, tracks });
}
