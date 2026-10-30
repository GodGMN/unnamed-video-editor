import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_CLIP_DEFAULTS, VIDEO_CLIP_DEFAULTS, removeMedia } from '../src/editor/model.ts';

const base = (id, mediaId, start) => ({ id, mediaId, start, inS: 0, outS: 5, linkId: null, linked: false });
const project = () => ({ name: 'Test', output: { width: 1920, height: 1080, fps: 30 },
  media: { a: { id: 'a', name: 'a.mp4' }, b: { id: 'b', name: 'b.mp4' } },
  tracks: [
    { kind: 'video', id: 'v', name: 'V1', label: '', hidden: false, magnetic: true,
      clips: [{ ...VIDEO_CLIP_DEFAULTS, ...base('va', 'a', 0) }, { ...VIDEO_CLIP_DEFAULTS, ...base('vb', 'b', 5) }] },
    { kind: 'audio', id: 'au', name: 'A1', label: '', muted: false, clips: [{ ...AUDIO_CLIP_DEFAULTS, ...base('aa', 'a', 0) }] },
    { kind: 'text', id: 't', name: 'T1', label: '', hidden: false, clips: [] },
  ] });

test('removing media drops the source and every clip that plays it', () => {
  const p = removeMedia(project(), 'a');
  assert.deepEqual(Object.keys(p.media), ['b']);
  assert.deepEqual(p.tracks[0].clips.map(c => c.id), ['vb']);
  assert.deepEqual(p.tracks[1].clips, []);
});
