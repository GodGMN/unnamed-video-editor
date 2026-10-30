import { t as translate } from '../i18n/core';
import { newId, VIDEO_CLIP_DEFAULTS, AUDIO_CLIP_DEFAULTS, NO_KEY, NO_FADES, gainToDb } from '../editor/model';
import type { Project } from '../editor/model';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(translate('documentInvalid'));
  return value as Record<string, unknown>;
}
function text(value: unknown): asserts value is string {
  if (typeof value !== 'string') throw new Error(translate('documentInvalidText'));
}
function number(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(translate('documentInvalidNumber'));
}
function positive(value: unknown): asserts value is number { number(value); if (value <= 0) throw new Error(translate('documentExpectedPositive')); }
function bool(value: unknown): asserts value is boolean { if (typeof value !== 'boolean') throw new Error(translate('documentInvalidFlag')); }
function fields(value: Record<string, unknown>, template: Record<string, unknown>) {
  for (const [key, sample] of Object.entries(template)) {
    if (typeof sample === 'number') number(value[key]);
    if (typeof sample === 'string') text(value[key]);
    if (typeof sample === 'boolean') bool(value[key]);
  }
}
export function validateProject(value: unknown): asserts value is Project {
  const p = object(value);
  text(p.name);
  if (!p.name.trim() || p.name.length > 200) throw new Error(translate('documentInvalidName'));
  const out = object(p.output);
  for (const key of ['width', 'height', 'fps']) positive(out[key]);
  if (Number(out.width) > 16384 || Number(out.height) > 16384 || Number(out.fps) > 240) throw new Error(translate('documentOutputLimits'));
  const media = object(p.media);
  for (const [id, value] of Object.entries(media)) {
    const m = object(value);
    text(m.id); if (!id || id !== m.id) throw new Error(translate('documentInvalidMediaId'));
    for (const k of ['name', 'container', 'tone']) text(m[k]);
    for (const k of ['duration', 'size', 'bitrate', 'seed']) number(m[k]);
    positive(m.duration); if (!Number.isSafeInteger(m.size) || Number(m.size) < 0) throw new Error(translate('documentInvalidMediaSize'));
    bool(m.decodable);
    if (m.still !== undefined) bool(m.still);
    if (m.fingerprint !== undefined) text(m.fingerprint);
    if (m.lastModified !== undefined) number(m.lastModified);
    for (const kind of ['video', 'audio']) {
      if (m[kind] === null) continue;
      const stream = object(m[kind]); text(stream.codec);
      for (const key of kind === 'video' ? ['width', 'height', 'fps'] : ['sampleRate', 'channels']) number(stream[key]);
    }
  }
  if (!Array.isArray(p.tracks)) throw new Error(translate('documentMissingTracks'));
  const ids = new Set<string>();
  const unique = (id: unknown) => { text(id); if (!id || ids.has(id)) throw new Error(translate('documentDuplicateId')); ids.add(id); };
  for (const value of p.tracks) {
    const t = object(value); unique(t.id); text(t.name); text(t.label);
    if (!['video', 'audio', 'text'].includes(String(t.kind)) || !Array.isArray(t.clips)) throw new Error(translate('documentInvalidTrack'));
    if (t.kind === 'audio') bool(t.muted); else bool(t.hidden);
    if (t.kind === 'video') bool(t.magnetic);
    for (const value of t.clips) {
      const c = object(value); unique(c.id); number(c.start);
      if (Number(c.start) < 0) throw new Error(translate('documentInvalidClipStart'));
      if (t.kind === 'text') {
        for (const k of ['content', 'color', 'pos']) text(c[k]);
        if (!/^[tcb][lcr]$/.test(String(c.pos))) throw new Error(translate('documentInvalidAnchor'));
        for (const k of ['size', 'x', 'y', 'duration']) number(c[k]);
        positive(c.duration); positive(c.size);
      } else {
        text(c.mediaId); if (!Object.hasOwn(media, c.mediaId)) throw new Error(translate('documentMissingMedia'));
        number(c.inS); number(c.outS);
        if (Number(c.inS) < 0 || Number(c.outS) <= Number(c.inS)) throw new Error(translate('documentInvalidRange'));
        const source = object(media[c.mediaId]);
        // Still images and their animations extend indefinitely on video tracks.
        // Allow one microsecond of rounding at the end of finite sources.
        if (!(t.kind === 'video' && source.still === true) && Number(c.outS) - Number(source.duration) > 1e-6) {
          throw new Error(translate('documentInvalidRange'));
        }
        if (c.linkId !== null) text(c.linkId); bool(c.linked);
        fields(c, t.kind === 'video' ? VIDEO_CLIP_DEFAULTS : AUDIO_CLIP_DEFAULTS);
        if (t.kind === 'video') {
          const key = object(c.key); bool(key.enabled); text(key.color);
          for (const field of ['tolerance', 'softness', 'spill']) number(key[field]);
          if (!['fit', 'fill', 'custom'].includes(String(c.fit))) throw new Error(translate('documentInvalidFit'));
          if (c.transitionOut !== null) {
            const tr = object(c.transitionOut);
            if (!['cut', 'fade', 'crossfade'].includes(String(tr.type))) throw new Error(translate('documentInvalidTransition'));
            number(tr.duration);
          }
        }
      }
    }
  }
}
export interface ProjectDocument { format: 'unnamed-video-editor'; version: 1; project: Project }
export function projectDocument(project: Project): ProjectDocument { return { format: 'unnamed-video-editor', version: 1, project }; }
export function parseDocument(value: unknown): Project {
  const doc = object(value);
  if (doc.format !== 'unnamed-video-editor' || doc.version !== 1) throw new Error(translate('documentUnsupported'));
  // Version-one downloads predate video keys and decibel gain. Upgrade those fields before validation.
  const original = object(doc.project);
  if (!Array.isArray(original.tracks)) throw new Error(translate('documentMissingTracks'));
  const project = { ...original, tracks: original.tracks.map(value => {
    const track = object(value);
    if (!Array.isArray(track.clips)) return track;
    return { ...track, clips: track.clips.map(value => {
      const clip = object(value);
      if (track.kind === 'video') return { ...NO_FADES, ...clip, key: clip.key ?? NO_KEY };
      if (track.kind === 'audio' && 'vol' in clip) {
        number(clip.vol);
        const { vol, ...rest } = clip;
        return { ...rest, gainDb: gainToDb(vol / 100) };
      }
      return clip;
    }) };
  }) };
  validateProject(project);
  return project;
}
export function remapMedia(project: Project) {
  const mapping = new Map(Object.keys(project.media).map(id => [id, newId()]));
  return { mapping, project: {
    ...project,
    media: Object.fromEntries(Object.values(project.media).map(m => { const id = mapping.get(m.id)!; return [id, { ...m, id }]; })),
    tracks: project.tracks.map(t => {
      if (t.kind === 'text') return t;
      if (t.kind === 'audio') return { ...t, clips: t.clips.map(c => ({ ...c, mediaId: mapping.get(c.mediaId)! })) };
      return { ...t, clips: t.clips.map(c => ({ ...c, mediaId: mapping.get(c.mediaId)! })) };
    }),
  } satisfies Project };
}
