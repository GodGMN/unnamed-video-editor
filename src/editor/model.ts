import type { KeyframeTracks } from './keyframes';
import { t as translate, formatNumber } from '../i18n/core';
/*
 * Project model. Everything in `Project` is plain, structured-clone-safe data (no class
 * instances, Maps or functions) so it can be persisted to IndexedDB and posted to the
 * compositor and export workers as-is. All times are in seconds.
 */

export type FitMode = 'fit' | 'fill' | 'custom';
export type TransitionType = 'cut' | 'fade' | 'crossfade';
/** `split` turns the pointer into scissors that cut clips where they're clicked. */
export type Tool = 'select' | 'split';
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
  fingerprint?: string;
  lastModified?: number;
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
  /**
   * A still image: `video` holds its size, and `duration` is only how long a new clip of it lasts.
   * Its clips can be trimmed to any length.
   */
  still?: boolean;
  /** For an animated still, the length of one loop in seconds; its clips repeat it to fill their length. */
  animation?: number;
  /** Still being stored and previewed: its clips can be edited but don't play or export yet. */
  importing?: boolean;
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
  /** Playback rate, from SPEED_MIN to SPEED_MAX; missing means 1. Source seconds per timeline second. */
  speed?: number;
  /** Video and audio clips cut from the same source together share a link id. */
  linkId: string | null;
  /** Linked clips trim together. Kept in sync across every clip sharing `linkId`. */
  linked: boolean;
}

/** Fade lengths in seconds at each end of a clip, and the shape of each ramp. */
export interface Fades {
  fadeIn: number;
  fadeOut: number;
  /** -1 (exponential) … 0 (linear) … 1 (logarithmic). */
  curveIn: number;
  curveOut: number;
}

/** Makes pixels near one colour transparent, e.g. a green screen. */
export interface ChromaKey {
  enabled: boolean;
  /** `#RRGGBB` colour to remove. */
  color: string;
  /** Percent: how far from `color` a pixel may be and still be removed completely. */
  tolerance: number;
  /** Percent: width of the partly transparent edge beyond `tolerance`. */
  softness: number;
  /** Percent: how much of the key colour's tint is taken out of the pixels that stay. */
  spill: number;
}

export interface VideoClip extends ClipBase, Fades {
  keyframes?: KeyframeTracks;
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
  key: ChromaKey;
}

export interface AudioClip extends ClipBase, Fades {
  /** Decibels, from GAIN_MIN_DB (silence) to GAIN_MAX_DB. */
  gainDb: number;
  muted: boolean;
  /** Whether a sped-up or slowed-down clip keeps its pitch (time-stretch) or shifts it like tape; missing means true. */
  keepPitch?: boolean;
}

export interface TextClip {
  id: string;
  content: string;
  /** Font size in output pixels. */
  size: number;
  color: string;
  pos: TextAnchor;
  /** Output-pixel offset from the anchor point. */
  x: number;
  y: number;
  /** Timeline position of the text's first frame. */
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
  /** Sorted by `start`. */
  clips: TextClip[];
}

export type Track = VideoTrack | AudioTrack | TextTrack;
/** A clip cut from imported media. */
export type MediaClip = VideoClip | AudioClip;
/** Anything that sits on a track. */
export type Clip = MediaClip | TextClip;

export interface Project {
  name: string;
  output: { width: number; height: number; fps: number };
  /** Imported sources keyed by id. */
  media: Record<string, Media>;
  /** In display order, top to bottom: each video track draws over the video tracks below it. */
  tracks: Track[];
}

/* ---------- Editor UI state (not persisted) ---------- */

/** A clip on a video (`clip`), audio or text track. */
export interface ClipSelection { kind: ClipKind; id: string }
export type ClipKind = 'clip' | 'audio' | 'text';

export type Selection =
  | ClipSelection
  /** The transition after the given video clip. */
  | { kind: 'trans'; id: string };

export interface MenuState {
  kind: ClipKind;
  id: string;
  left: number;
  top: number;
}

export interface EditorUi {
  sel: Selection | null;
  /** Clips in the selection; Ctrl-click adds or removes one. */
  picked: ClipSelection[];
  /** The clip shown in the trim scrubber: the last selected video or audio clip. */
  focusClip: string | null;
  /** The clip the playhead is locked to (double-click a clip to set it), or null for the whole sequence. */
  lockClip: string | null;
  /** The Media item playing in the preview on its own, or null when the preview shows the timeline. */
  source: string | null;
  tool: Tool;
  menu: MenuState | null;
  /** Trim scrubber position, in source seconds. */
  scrub: number;
  /** Timeline playhead position, in sequence seconds. */
  playhead: number;
  /** The video clip whose key colour the next click on the preview picks, or null. */
  keyPick: string | null;
}

/* ---------- Constants ---------- */

export const PPS = 30; // timeline pixels per second
/** How long a still image shows when dropped on the timeline, in seconds. */
export const STILL_DURATION = 5;
/** How long an animation dropped on the timeline lasts: whole loops, at least `STILL_DURATION`. */
export const animationDuration = (loop: number) => Math.round(Math.ceil(STILL_DURATION / loop - 1e-9) * loop * 1e6) / 1e6;
export const DEFAULT_TRANSITION: Transition = { type: 'cut', duration: 0.5 };
export const SPEED_MIN = 0.25;
export const SPEED_MAX = 4;
export const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 4];
/** Below this speed even good time-stretching audibly smears the sound. */
export const SPEED_AUDIO_WARNING = 0.5;

type ClipDefaults<C> = Omit<C, 'id' | 'mediaId' | 'start' | 'inS' | 'outS' | 'linkId'>;
/** Property values of a fresh clip; also what the properties panel's reset buttons restore. */
export const NO_FADES: Fades = { fadeIn: 0, fadeOut: 0, curveIn: 0, curveOut: 0 };
export const NO_KEY: ChromaKey = { enabled: false, color: '#00B140', tolerance: 25, softness: 20, spill: 50 };
export const VIDEO_CLIP_DEFAULTS: ClipDefaults<VideoClip> = {
  linked: true, x: 0, y: 0, scale: 100, rot: 0, fit: 'fit', cropT: 0, cropR: 0, cropB: 0, cropL: 0, transitionOut: null, key: NO_KEY, ...NO_FADES,
};
export const AUDIO_CLIP_DEFAULTS: ClipDefaults<AudioClip> = {
  linked: true, gainDb: 0, muted: false, ...NO_FADES,
};

export const TRANSITION_NAMES: Record<TransitionType, string> = { get cut() { return translate('cut'); }, get fade() { return translate('fade'); }, get crossfade() { return translate('crossfade'); } };
export const TRANSITION_HELP: Record<TransitionType, string> = {
  get cut() { return translate('instantSwitchToTheNextClipDefaultForNew'); },
  get fade() { return translate('fadesThroughBlackAcrossTheExistingOverlapDragClips'); },
  get crossfade() { return translate('blendsTheTwoClipsAcrossTheirExistingOverlapDrag'); },
};

/** Stands in for a clip's media when its id isn't in `Project.media`. */
export const MISSING_MEDIA: Media = {
  id: '', get name() { return translate('missingMedia'); }, container: '—', duration: 0, size: 0, bitrate: 0,
  video: null, audio: null, decodable: false, tone: '#24262B', seed: 0,
};

/* ---------- Queries ---------- */

export const isMediaClip = (c: Clip): c is MediaClip => 'mediaId' in c;
export const clipSpeed = (c: MediaClip) => c.speed ?? 1;
export const clipDuration = (c: Clip) => (isMediaClip(c) ? (c.outS - c.inS) / clipSpeed(c) : c.duration);
/** The source time a clip shows at sequence time `time`. */
export const toSource = (c: MediaClip, time: number) => c.inS + (time - c.start) * clipSpeed(c);
/** The sequence time at which a clip shows source time `source`. */
export const toTimeline = (c: MediaClip, source: number) => c.start + (source - c.inS) / clipSpeed(c);
export const clipEnd = (c: Clip) => c.start + clipDuration(c);
/** The selection kind for clips on a track of this kind. */
export const clipKind = (track: Track['kind']): ClipKind => (track === 'video' ? 'clip' : track);
/** Whether `c` follows its link partners' moves and trims. */
export const isLinked = (c: Clip) => isMediaClip(c) && c.linked;

export const videoTracks = (p: Project) => p.tracks.filter((t): t is VideoTrack => t.kind === 'video');
export const audioTracks = (p: Project) => p.tracks.filter((t): t is AudioTrack => t.kind === 'audio');
export const textTracks = (p: Project) => p.tracks.filter((t): t is TextTrack => t.kind === 'text');

export function findClip(p: Project, id: string | null | undefined): { clip: Clip; track: Track } | null {
  for (const track of p.tracks) {
    const clip = (track.clips as Clip[]).find((c) => c.id === id);
    if (clip) return { clip, track };
  }
  return null;
}

/** Like `findClip`, but only clips cut from media. */
export function findMediaClip(p: Project, id: string | null | undefined): { clip: MediaClip; track: VideoTrack | AudioTrack } | null {
  const f = findClip(p, id);
  return f && f.track.kind !== 'text' ? f as { clip: MediaClip; track: VideoTrack | AudioTrack } : null;
}

export function findVideoClip(p: Project, id: string | null | undefined) {
  const f = findClip(p, id);
  return f && f.track.kind === 'video' ? (f.clip as VideoClip) : null;
}

export function findAudioClip(p: Project, id: string | null | undefined) {
  const f = findClip(p, id);
  return f && f.track.kind === 'audio' ? (f.clip as AudioClip) : null;
}

export function findTextClip(p: Project, id: string | null | undefined) {
  const f = findClip(p, id);
  return f && f.track.kind === 'text' ? (f.clip as TextClip) : null;
}

/** Clips on other tracks that share this clip's link id. Text clips are never linked. */
export function partnersOf(p: Project, clip: Clip): MediaClip[] {
  if (!isMediaClip(clip) || !clip.linkId) return [];
  const out: MediaClip[] = [];
  for (const t of p.tracks) {
    if (t.kind === 'text') continue;
    for (const c of t.clips as MediaClip[]) if (c.linkId === clip.linkId && c.id !== clip.id) out.push(c);
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
export function overlapAfter(clip: VideoClip, next: MediaClip) {
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
  /** Display name: the media name, numbered when the same source is used more than once, or the text. */
  name: string;
}

export interface TimelineLayout {
  clips: Record<string, ClipLayout>;
  /** End of the last clip. */
  end: number;
}

const EPS = 1e-6;

export function layoutTimeline(p: Project): TimelineLayout {
  const clips: Record<string, ClipLayout> = {};
  const uses: Record<string, number> = {};
  let end = 0;

  for (const track of p.tracks) {
    const list = [...(track.clips as Clip[])].sort((a, b) => a.start - b.start);
    list.forEach((c, i) => {
      const prev = list[i - 1];
      const next = list[i + 1];
      const s = c.start;
      const e = clipEnd(c);
      const prevEnd = prev ? clipEnd(prev) : -Infinity;
      let name = isMediaClip(c) ? '' : c.content;
      if (isMediaClip(c)) {
        const key = track.kind + ':' + c.mediaId;
        uses[key] = (uses[key] ?? 0) + 1;
        const stem = p.media[c.mediaId]?.name.replace(/\.[^.]+$/, '') ?? translate('missingMedia');
        name = uses[key] > 1 ? `${stem} (${uses[key]})` : stem;
      }
      clips[c.id] = {
        start: s,
        end: e,
        vs: prevEnd > s ? (s + prevEnd) / 2 : s,
        ve: next && next.start < e ? (next.start + e) / 2 : e,
        nextId: next && next.start <= e + EPS ? next.id : null,
        name,
      };
      end = Math.max(end, e);
    });
  }
  return { clips, end };
}

/* ---------- Edits ---------- */

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** Rebuilds every track's clip list with `fn`. */
const mapClips = (p: Project, fn: (clips: Clip[], t: Track) => Clip[]): Project =>
  ({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: fn(t.clips as Clip[], t) }) as Track) });

/** Removes a source from the project along with every clip that uses it. */
export function removeMedia(p: Project, mediaId: string): Project {
  const media = { ...p.media };
  delete media[mediaId];
  return mapClips({ ...p, media }, (clips) => clips.filter((c) => !isMediaClip(c) || c.mediaId !== mediaId));
}

/** Removes clips, with their linked partners, by id. */
export function deleteClips(p: Project, ids: string[]): Project {
  const gone = new Set([...ids, ...movingGroup(p, ids).map((c) => c.id)]);
  return mapClips(p, (clips) => clips.filter((c) => !gone.has(c.id)));
}

/** Whether `id` may be removed: every kind keeps at least one track. */
export function canRemoveTrack(p: Project, id: string): boolean {
  const t = p.tracks.find((x) => x.id === id);
  return !!t && p.tracks.some((x) => x.kind === t.kind && x.id !== id);
}

/** Removes a track with its clips, and their linked partners, unless it is the last of its kind. */
export function removeTrack(p: Project, id: string): Project {
  const t = p.tracks.find((x) => x.id === id);
  if (!t || !canRemoveTrack(p, id)) return p;
  const next = deleteClips(p, t.clips.map((c) => c.id));
  return { ...next, tracks: next.tracks.filter((x) => x.id !== id) };
}

/** Keep track order deterministic without changing user-authored positions. */
export function settle(p: Project): Project {
  return mapClips(p, (clips) => [...clips].sort((a, b) => a.start - b.start));
}

/** Clip fields that apply to every linked partner when `linked` is on. */
const LINKED_KEYS = ['inS', 'outS', 'start', 'speed'] as const;

/** Patches one clip. Trims carry over to linked partners, and `linked` itself always does. */
export function patchClip<C extends Clip>(p: Project, id: string, patch: Partial<C>): Project {
  const f = findClip(p, id);
  if (!f) return p;
  const linked = (patch as Partial<MediaClip>).linked ?? isLinked(f.clip);
  const shared: Partial<MediaClip> = {};
  if (linked) for (const k of LINKED_KEYS) if (k in patch) shared[k] = patch[k as keyof C] as number;
  if ('linked' in patch) shared.linked = linked;
  const partners = new Set(partnersOf(p, f.clip).map((c) => c.id));
  return mapClips(p, (clips) => clips.map((c) =>
    c.id === id ? { ...c, ...patch } : partners.has(c.id) ? { ...c, ...shared } : c));
}

/** Links a video and an audio clip as a fresh pair, detaching each from any earlier partner. */
export function linkClips(p: Project, videoId: string, audioId: string, linkId: string): Project {
  if (!canLink(p, findVideoClip(p, videoId)) || !findAudioClip(p, audioId)) return p;
  return mapClips(p, (clips) => clips.map((c) => c.id === videoId || c.id === audioId ? { ...c, linkId, linked: true } : c));
}

/** Stills can't be linked: their trims don't move a source in point that audio could follow. */
const canLink = (p: Project, video: VideoClip | null): video is VideoClip => !!video && !p.media[video.mediaId]?.still;

/** The picked clips as a video and audio pair, when they are exactly one of each. */
export function pickedPair(p: Project, picked: ClipSelection[]): { video: VideoClip; audio: AudioClip } | null {
  if (picked.length !== 2) return null;
  const video = findVideoClip(p, picked.find((x) => x.kind === 'clip')?.id);
  const audio = findAudioClip(p, picked.find((x) => x.kind === 'audio')?.id);
  return canLink(p, video) && audio ? { video, audio } : null;
}

/** Clips that move with these: the clips themselves plus their linked partners. */
export function movingGroup(p: Project, ids: string[]): Clip[] {
  const group = new Map<string, Clip>();
  for (const id of ids) {
    const found = findClip(p, id);
    if (!found) continue;
    for (const c of [found.clip, ...(isLinked(found.clip) ? partnersOf(p, found.clip) : [])]) group.set(c.id, c);
  }
  return [...group.values()];
}

/**
 * Moves clip `id` to `start` and shifts `others` (plus everyone's linked partners) by the same
 * delta, without packing away the user's placement. No clip goes before 0.
 *
 * `trackShift` also moves `id` and those of `others` on the same kind of track that many tracks
 * down (or up, when negative) among the tracks of that kind; linked partners stay on their tracks.
 * The shift is clamped so every moved clip lands on an existing track.
 */
export function moveClip(p: Project, id: string, start: number, others: string[] = [], trackShift = 0): Project {
  const found = findClip(p, id);
  if (!found) return p;
  const group = movingGroup(p, [id, ...others]);
  const ids = new Set(group.map(c => c.id));
  const delta = Math.max(start - found.clip.start, -Math.min(...group.map(c => c.start)));

  // Index of each vertically moving clip's track among the tracks of its kind.
  const lanes = p.tracks.filter(t => t.kind === found.track.kind);
  const lane = new Map<string, number>();
  for (const x of [id, ...others]) {
    const i = lanes.findIndex(t => (t.clips as Clip[]).some(c => c.id === x));
    if (i >= 0) lane.set(x, i);
  }
  const shift = Math.max(-Math.min(...lane.values()), Math.min(lanes.length - 1 - Math.max(...lane.values()), Math.round(trackShift)));

  const moved = new Map<string, Clip>();
  const tracks = p.tracks.map(t => {
    const clips = (t.clips as Clip[]).flatMap(c => {
      const next = ids.has(c.id) ? { ...c, start: round6(c.start + delta) } : c;
      if (!shift || !lane.has(c.id)) return [next];
      moved.set(c.id, next);
      return [];
    });
    return { ...t, clips } as Track;
  });
  if (shift) for (const [x, i] of lane) {
    const dest = lanes[i + shift].id;
    const k = tracks.findIndex(t => t.id === dest);
    tracks[k] = { ...tracks[k], clips: [...tracks[k].clips, moved.get(x)!] } as Track;
  }
  return settle({ ...p, tracks });
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

/** Every clip start and end on the timeline, plus 0, skipping the clips in `skip`. */
export function edgeTargets(p: Project, skip: Set<string>): number[] {
  const targets = [0];
  for (const track of p.tracks) for (const c of track.clips as Clip[]) if (!skip.has(c.id)) targets.push(c.start, clipEnd(c));
  return targets;
}

/** The target closest to `time` within the snap radius (8 screen pixels), or null if none is that close. */
export function snapEdge(time: number, targets: number[], pixelsPerSecond: number): number | null {
  let result: number | null = null;
  let distance = 8 / pixelsPerSecond;
  for (const target of targets) {
    const d = Math.abs(target - time);
    if (d < distance) { result = target; distance = d; }
  }
  return result;
}

/** Shortest piece a split may leave on either side of the cut, in seconds. */
export const MIN_SPLIT_PIECE = 0.05;

const cuts = (start: number, end: number, time: number) => time - start >= MIN_SPLIT_PIECE && end - time >= MIN_SPLIT_PIECE;

/**
 * Cuts clip `id` at sequence time `time`; the left piece keeps the id and the right piece gets
 * `rightId`. Linked partners are cut too, and their right pieces link up under `rightId`. Fades
 * and the outgoing transition stay on the outer ends. No-op when `time` isn't inside the clip.
 */
export function splitClip(p: Project, id: string, time: number, rightId: string): Project {
  const found = findClip(p, id);
  if (!found || !cuts(found.clip.start, clipEnd(found.clip), time)) return p;
  const group = [found.clip, ...(isLinked(found.clip) ? partnersOf(p, found.clip) : [])]
    .filter((c) => cuts(c.start, clipEnd(c), time));
  const linkId = group.length > 1 ? rightId : null;
  const ids = new Map(group.map((c, i) => [c.id, i === 0 ? rightId : `${rightId}-${i}`]));
  return mapClips(p, (clips, t) => {
    if (!clips.some((c) => ids.has(c.id))) return clips;
    return clips.flatMap((c): Clip[] => {
      const newId = ids.get(c.id);
      if (!newId) return [c];
      if (!isMediaClip(c)) {
        const left = round6(time - c.start);
        return [{ ...c, duration: left }, { ...c, id: newId, start: round6(time), duration: round6(c.duration - left) }];
      }
      const cut = round6(toSource(c, time));
      const left = { ...c, outS: cut };
      const right = { ...c, id: newId, start: round6(time), inS: cut, linkId, linked: !!linkId && c.linked };
      // Fades are in sequence seconds.
      return [
        { ...left, fadeIn: Math.min(c.fadeIn, time - c.start), fadeOut: 0, ...(t.kind === 'video' && { transitionOut: null }) },
        { ...right, fadeIn: 0, fadeOut: Math.min(c.fadeOut, clipEnd(c) - time) },
      ];
    });
  });
}

/** Property values of a text clip added from the timeline toolbar. */
export const TEXT_CLIP_DEFAULTS: Omit<TextClip, 'id' | 'start'> = { get content() { return translate('title'); }, size: 72, color: '#FFFFFF', pos: 'bc', x: 0, y: 0, duration: 3 };

/** Adds a default text clip at `time` to the top text track with room for it, or to a new text track on top. */
export function addTextClip(p: Project, time: number, id: string): Project {
  const clip: TextClip = { ...TEXT_CLIP_DEFAULTS, id, start: round6(Math.max(0, time)) };
  const end = clipEnd(clip);
  const tracks = textTracks(p);
  const track = tracks.find((t) => t.clips.every((x) => clipEnd(x) <= clip.start + EPS || x.start >= end - EPS));
  if (!track) {
    const name = tracks.length ? translate('text3', { value1: tracks.length + 1 }) : translate('text');
    return { ...p, tracks: [{ kind: 'text', id: `${id}-track`, name, label: '', hidden: false, clips: [clip] }, ...p.tracks] };
  }
  return settle({ ...p, tracks: p.tracks.map((t) => t === track ? { ...track, clips: [...track.clips, clip] } : t) });
}

/**
 * Copies clip `id`, and its linked partners, as `copyId`. The copy goes right after the original
 * when that spot is free on every track involved, otherwise after the last clip on those tracks.
 */
export function duplicateClip(p: Project, id: string, copyId: string): Project {
  const found = findClip(p, id);
  if (!found) return p;
  const group = [found.clip, ...(isLinked(found.clip) ? partnersOf(p, found.clip) : [])];
  const duration = clipDuration(found.clip);
  const others = p.tracks.map((t) => t.clips as Clip[]).filter((clips) => clips.some((c) => group.includes(c))).flat();
  const after = clipEnd(found.clip);
  const free = others.every((c) => clipEnd(c) <= after + EPS || c.start >= after + duration - EPS);
  const start = free ? after : Math.max(...others.map(clipEnd));
  const linkId = group.length > 1 ? copyId : null;
  const ids = new Map(group.map((c, i) => [c.id, i === 0 ? copyId : `${copyId}-${i}`]));
  return settle(mapClips(p, (clips, t) => [...clips, ...clips.filter((c) => ids.has(c.id)).map((c): Clip => {
    const copy = { ...c, id: ids.get(c.id)!, start: round6(start + c.start - found.clip.start) };
    if (!isMediaClip(c)) return copy;
    return { ...copy, linkId, linked: !!linkId && c.linked, ...(t.kind === 'video' ? { transitionOut: null } : {}) } as MediaClip;
  })]));
}

/** Shortest a trim may leave a clip, in seconds (or the whole source when it's shorter). */
export const MIN_TRIM_DURATION = 0.5;

/**
 * Moves one edge of clip `id` to sequence time `time`, keeping the other edge where it is. Media
 * clips can't reach past either end of their source; text clips and stills can be any length.
 */
export function trimClipEdge(p: Project, id: string, edge: 'in' | 'out', time: number): Project {
  const found = findClip(p, id);
  if (!found) return p;
  const c = found.clip;
  const end = clipEnd(c);
  if (!isMediaClip(c)) {
    if (edge === 'out') return patchClip<TextClip>(p, id, { duration: round6(Math.max(MIN_TRIM_DURATION, time - c.start)) });
    const start = round6(Math.max(0, Math.min(end - MIN_TRIM_DURATION, time)));
    return patchClip<TextClip>(p, id, { start, duration: round6(end - start) });
  }
  const media = p.media[c.mediaId] ?? MISSING_MEDIA;
  if (media.still) {
    if (edge === 'out') return patchClip<MediaClip>(p, id, { outS: round6(c.inS + Math.max(MIN_TRIM_DURATION, time - c.start)) });
    const start = round6(Math.max(0, Math.min(end - MIN_TRIM_DURATION, time)));
    return patchClip<MediaClip>(p, id, { start, outS: round6(c.outS + c.start - start) });
  }
  const source = media.duration;
  const speed = clipSpeed(c);
  // In source seconds.
  const min = Math.min(MIN_TRIM_DURATION * speed, source);
  if (edge === 'out') return patchClip<MediaClip>(p, id, { outS: round6(Math.min(source, Math.max(c.inS + min, c.outS + (time - end) * speed))) });
  // The start edge moves the clip's start along with its in point; `d` is in sequence seconds.
  const d = Math.max(-c.inS / speed, -c.start, Math.min((c.outS - min - c.inS) / speed, time - c.start));
  return patchClip<MediaClip>(p, id, { inS: round6(c.inS + d * speed), start: round6(c.start + d) });
}

/**
 * Sets the speed of clip `id`, and of its linked partners, keeping its source range and start.
 * The clip grows or shrinks at its end, and the clips after it on each changed track move by
 * the same amount, so nothing ends up overlapping. Stills have no speed.
 */
export function setClipSpeed(p: Project, id: string, speed: number): Project {
  const found = findMediaClip(p, id);
  if (!found || p.media[found.clip.mediaId]?.still) return p;
  const next = round6(Math.max(SPEED_MIN, Math.min(SPEED_MAX, speed)));
  const group = [found.clip, ...(isLinked(found.clip) ? partnersOf(p, found.clip) : [])];
  const changed = new Map(group.map((c) => [c.id, c]));
  const shifts = new Map<string, number>();
  // A clip pushed from several tracks moves by the largest push, and takes its partners along.
  const push = (c: Clip, delta: number) => {
    for (const x of [c, ...partnersOf(p, c)]) {
      if (changed.has(x.id)) continue;
      const prev = shifts.get(x.id) ?? 0;
      if (Math.abs(delta) > Math.abs(prev)) shifts.set(x.id, delta);
    }
  };
  for (const track of p.tracks) {
    const own = (track.clips as Clip[]).find((c) => changed.has(c.id)) as MediaClip | undefined;
    if (!own) continue;
    const end = clipEnd(own);
    const delta = (own.outS - own.inS) / next - (end - own.start);
    // Later clips keep their distance from the end, so crossfade overlaps survive.
    for (const c of track.clips as Clip[]) if (c.start > own.start + EPS) push(c, delta);
  }
  return settle(mapClips(p, (clips) => clips.map((c) => {
    if (changed.has(c.id)) return { ...c, speed: next };
    const shift = shifts.get(c.id);
    return shift ? { ...c, start: round6(Math.max(0, c.start + shift)) } : c;
  })));
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

/* ---------- Audio gain ---------- */

/** Clip gain range. The floor is treated as −∞: silence. */
export const GAIN_MIN_DB = -60;
export const GAIN_MAX_DB = 12;

export const dbToGain = (db: number) => db <= GAIN_MIN_DB ? 0 : 10 ** (db / 20);
export const gainToDb = (gain: number) =>
  gain <= 0 ? GAIN_MIN_DB : Math.max(GAIN_MIN_DB, Math.min(GAIN_MAX_DB, Math.round(200 * Math.log10(gain)) / 10));

/** Fader taper as [position, dB] points: 0 dB sits three quarters up and the quiet end is squeezed, like a mixing console. */
const TAPER: [number, number][] = [[0, GAIN_MIN_DB], [0.15, -40], [0.3, -24], [0.5, -12], [0.75, 0], [1, GAIN_MAX_DB]];

function interpolate(x: number, from: 0 | 1, to: 0 | 1) {
  const i = Math.max(1, TAPER.findIndex((pt) => pt[from] >= x));
  const a = TAPER[i - 1], b = TAPER[i];
  return a[to] + (b[to] - a[to]) * (x - a[from]) / (b[from] - a[from]);
}

/** Fader position (0–1) for a gain in dB. */
export const dbToFader = (db: number) => interpolate(Math.max(GAIN_MIN_DB, Math.min(GAIN_MAX_DB, db)), 1, 0);
/** Gain in dB, to 0.1 dB, for a fader position (0–1). */
export const faderToDb = (pos: number) => Math.round(interpolate(Math.max(0, Math.min(1, pos)), 0, 1) * 10) / 10;

/* ---------- Formatting ---------- */

/** A gain without its unit: `+3.0`, `-6.0`, `−∞`. */
export const fmtDb = (db: number) => db <= GAIN_MIN_DB ? '−∞' : `${db > 0 ? '+' : ''}${db.toFixed(1)}`;

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
  Math.abs(c) < 0.05 ? translate('linear') : (c > 0 ? translate('logarithmic') : translate('exponential')) + ' ' + Math.round(Math.abs(c) * 100) + '%';

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

export const fmtFps = (fps: number) => translate('fps', { value1: Number(fps.toFixed(2)) });
export const fmtBitrate = (bps: number) => translate('bitrateValue', { value1: formatNumber(bps / 1e6, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
export const fmtSize = (bytes: number) => (bytes >= 1e9 ? translate('gb', { value1: formatNumber(bytes / 1e9, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }) : translate('mb', { value1: formatNumber(bytes / 1e6, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }));
export const fmtAudio = (a: AudioStream) =>
  translate('khz', { value1: codecName(a.codec), value2: a.sampleRate / 1000, value3: a.channels === 1 ? translate('mono') : a.channels === 2 ? translate('stereo') : translate('channels', { value1: a.channels }) });

/** Placeholder filmstrip: one cell per ~44px with varying brightness. */
export const filmstrip = (width: number, seed: number) => {
  const n = Math.max(1, Math.round(width / 44));
  return Array.from({ length: n }, (_, i) => 0.03 + 0.07 * Math.abs(Math.sin(i * 1.3 + seed)));
};

/** Places a source on a compatible track, keeping its audio linked on a separate track. */
/** Whether `media` can be dropped on `track`: video tracks need a picture, audio tracks need sound. */
export function acceptsMedia(track: Track, media: Media | undefined): media is Media {
  return !!media?.decodable && track.kind !== 'text' && !!(track.kind === 'video' ? media.video : media.audio);
}

/**
 * Where media dropped at `time` on a magnetic track goes: the cut nearest `time` (the start of
 * clip `index`, or the end of the track). It starts once every earlier clip has ended.
 */
export function magneticCut(clips: MediaClip[], time: number): { index: number; start: number } {
  const sorted = [...clips].sort((a, b) => a.start - b.start);
  const cutAt = (i: number) => (i < sorted.length ? sorted[i].start : Math.max(0, ...sorted.map(clipEnd)));
  let index = 0;
  for (let i = 1; i <= sorted.length; i++) if (Math.abs(cutAt(i) - time) < Math.abs(cutAt(index) - time)) index = i;
  return { index, start: Math.max(0, ...sorted.slice(0, index).map(clipEnd)) };
}

/** Where media dropped at `time` on `track` starts. */
export function mediaDropStart(track: VideoTrack | AudioTrack, time: number): number {
  return track.kind === 'video' && track.magnetic ? magneticCut(track.clips, time).start : Math.max(0, time);
}

/**
 * Pushes clip `index` and every later clip on a track right by `delta` seconds. Partners move too,
 * even unlinked ones, so an insert never knocks audio out of sync.
 */
function ripple(p: Project, track: VideoTrack | AudioTrack, index: number, delta: number): Project {
  if (delta <= 0) return p;
  const later = [...track.clips].sort((a, b) => a.start - b.start).slice(index) as MediaClip[];
  const ids = new Set(later.flatMap((c) => [c.id, ...partnersOf(p, c).map((x) => x.id)]));
  return mapClips(p, (clips) => clips.map((c) => ids.has(c.id) ? { ...c, start: round6(c.start + delta) } : c));
}

/** Adds a clip of `mediaId` at `time`. Magnetic tracks insert it at the nearest cut and push later clips right. */
export function placeMedia(p: Project, mediaId: string, trackId: string, time: number, id: string): Project {
  const media = p.media[mediaId];
  let track = p.tracks.find((t) => t.id === trackId);
  if (!track || !acceptsMedia(track, media) || track.kind === 'text') return p;
  let start = Math.max(0, time);
  if (track.kind === 'video' && track.magnetic) {
    const cut = magneticCut(track.clips, time);
    const next = [...track.clips].sort((a, b) => a.start - b.start)[cut.index];
    start = cut.start;
    if (next) p = ripple(p, track, cut.index, start + media.duration - next.start);
    track = p.tracks.find((t) => t.id === trackId) as VideoTrack;
  }
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
  if (media.audio && !audioTrack) tracks.push({ id: `${id}-track`, name: `A${p.tracks.filter((t) => t.kind === 'audio').length + 1}`, label: translate('audio2'), kind: 'audio', muted: false, clips: [audioClip] });
  return settle({ ...p, tracks });
}

/** The first audio track with nothing between `start` and `end`, adding a new one at the bottom when none is free. */
export function freeAudioTrack(p: Project, start: number, end: number, newTrackId: string): { project: Project; trackId: string } {
  const free = audioTracks(p).find((t) => t.clips.every((c) => clipEnd(c) <= start || c.start >= end));
  if (free) return { project: p, trackId: free.id };
  const track: AudioTrack = { id: newTrackId, name: `A${audioTracks(p).length + 1}`, label: translate('audio2'), kind: 'audio', muted: false, clips: [] };
  return { project: { ...p, tracks: [...p.tracks, track] }, trackId: newTrackId };
}

/**
 * Adds `media` to the project and places each one at `time` on `trackId`, back to back, or on the
 * first track that takes it when that one can't. Returns the id of each media's clip, or null
 * when no track takes it.
 */
export function dropMedia(p: Project, media: Media[], trackId: string, time: number): { project: Project; clipIds: (string | null)[] } {
  const clipIds: (string | null)[] = [];
  for (const m of media) {
    p = { ...p, media: { ...p.media, [m.id]: m } };
    const track = [p.tracks.find((t) => t.id === trackId), ...p.tracks].find((t) => !!t && acceptsMedia(t, m));
    if (!track || track.kind === 'text') { clipIds.push(null); continue; }
    const id = newId();
    const start = mediaDropStart(track, time);
    p = placeMedia(p, m.id, track.id, start, id);
    clipIds.push(id);
    time = start + m.duration;
  }
  return { project: p, clipIds };
}

/* ---------- Output frame ---------- */

export interface Aspect { key: string; w: number; h: number; use: string }
export const ASPECTS: Aspect[] = [
  { key: '16:9', w: 16, h: 9, get use() { return translate('landscapeUse'); } },
  { key: '9:16', w: 9, h: 16, get use() { return translate('verticalUse'); } },
  { key: '1:1', w: 1, h: 1, get use() { return translate('squareUse'); } },
  { key: '4:5', w: 4, h: 5, get use() { return translate('portraitUse'); } },
  { key: '4:3', w: 4, h: 3, get use() { return translate('classicUse'); } },
  { key: '21:9', w: 21, h: 9, get use() { return translate('cinemaUse'); } },
];

/** H.264 needs even dimensions. */
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** A `w`:`h` frame whose short side is `short` pixels. */
export function frameSize(w: number, h: number, short: number): { width: number; height: number } {
  return w >= h ? { width: even(short * w / h), height: even(short) } : { width: even(short), height: even(short * h / w) };
}

/** The output frame resized so its short side is `short` pixels, keeping its ratio. */
export const exportSize = (output: { width: number; height: number }, short: number) => frameSize(output.width, output.height, short);

/** The preset the output matches, if any. */
export function aspectOf(output: { width: number; height: number }): Aspect | null {
  const r = output.width / output.height;
  return ASPECTS.find((a) => Math.abs(a.w / a.h - r) < 0.01) ?? null;
}

/**
 * Switches the output to `aspect`, keeping its short side. Clip and text offsets are pixels from
 * the centre or an edge, so they scale with the frame and stay in the same relative place.
 */
export function setAspect(p: Project, aspect: Aspect): Project {
  const { width, height } = frameSize(aspect.w, aspect.h, Math.min(p.output.width, p.output.height));
  if (width === p.output.width && height === p.output.height) return p;
  const sx = width / p.output.width, sy = height / p.output.height;
  const move = <C extends { x: number; y: number }>(c: C): C => ({ ...c, x: Math.round(c.x * sx), y: Math.round(c.y * sy) });
  return {
    ...p,
    output: { ...p.output, width, height },
    tracks: p.tracks.map((t) => t.kind === 'video' ? { ...t, clips: t.clips.map(move) } : t.kind === 'text' ? { ...t, clips: t.clips.map(move) } : t),
  };
}
