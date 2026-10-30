import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_CLIP_DEFAULTS, VIDEO_CLIP_DEFAULTS, canRemoveTrack, removeTrack } from '../src/editor/model.ts';

const base = (id, linkId) => ({ id, start: 0, mediaId: 'm', inS: 0, outS: 5, linkId, linked: !!linkId });
const project = () => ({ name: 'Test', media: {}, output: { width: 1920, height: 1080, fps: 30 }, tracks: [
  { kind: 'text', id: 't2', name: 'Text 2', label: '', hidden: false, items: [{ id: 'x2' }] },
  { kind: 'text', id: 't1', name: 'Text', label: '', hidden: false, items: [{ id: 'x1' }] },
  { kind: 'video', id: 'v2', name: 'V2', label: '', hidden: false, magnetic: false, clips: [{ ...VIDEO_CLIP_DEFAULTS, ...base('c2', 'l2') }] },
  { kind: 'video', id: 'v1', name: 'V1', label: '', hidden: false, magnetic: false, clips: [{ ...VIDEO_CLIP_DEFAULTS, ...base('c1', 'l1') }] },
  { kind: 'audio', id: 'a1', name: 'A1', label: '', muted: false, clips: [{ ...AUDIO_CLIP_DEFAULTS, ...base('d1', 'l1') }, { ...AUDIO_CLIP_DEFAULTS, ...base('d2', 'l2') }] },
] });
const ids = (p) => p.tracks.map((t) => t.id + ':' + (t.items ?? t.clips).map((c) => c.id).join(','));

test('removes an extra text track with its items', () => {
  assert.deepEqual(ids(removeTrack(project(), 't2')), ['t1:x1', 'v2:c2', 'v1:c1', 'a1:d1,d2']);
});

test('removing a video track takes linked audio with its clips', () => {
  assert.deepEqual(ids(removeTrack(project(), 'v2')), ['t2:x2', 't1:x1', 'v1:c1', 'a1:d1']);
});

test('keeps the last track of each kind', () => {
  const p = project();
  assert.equal(canRemoveTrack(p, 'a1'), false);
  assert.equal(removeTrack(p, 'a1'), p);
  const q = removeTrack(p, 'v2');
  assert.equal(canRemoveTrack(q, 'v1'), false);
  assert.equal(canRemoveTrack(p, 'v1'), true);
});
