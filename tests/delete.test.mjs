import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_CLIP_DEFAULTS, VIDEO_CLIP_DEFAULTS, deleteItems } from '../src/editor/model.ts';

const base = (id, linkId, linked = !!linkId) => ({ id, start: 0, mediaId: 'm', inS: 0, outS: 5, linkId, linked });
const project = () => ({ name: 'Test', media: {}, output: { width: 1920, height: 1080, fps: 30 }, tracks: [
  { kind: 'text', id: 't', name: 'T1', label: '', hidden: false, items: [{ id: 'x1' }, { id: 'x2' }] },
  { kind: 'video', id: 'v', name: 'V1', label: '', hidden: false, magnetic: false, clips: [{ ...VIDEO_CLIP_DEFAULTS, ...base('v1', 'l1') }, { ...VIDEO_CLIP_DEFAULTS, ...base('v2', 'l2', false) }] },
  { kind: 'audio', id: 'a', name: 'A1', label: '', muted: false, clips: [{ ...AUDIO_CLIP_DEFAULTS, ...base('a1', 'l1') }, { ...AUDIO_CLIP_DEFAULTS, ...base('a2', 'l2', false) }] },
] });
const ids = (p) => p.tracks.map((t) => (t.items ?? t.clips).map((c) => c.id));

test('deleting a linked clip takes its partner with it', () => {
  assert.deepEqual(ids(deleteItems(project(), ['v1'])), [['x1', 'x2'], ['v2'], ['a2']]);
});

test('deleting an unlinked clip leaves its old partner', () => {
  assert.deepEqual(ids(deleteItems(project(), ['a2'])), [['x1', 'x2'], ['v1', 'v2'], ['a1']]);
});

test('deletes text items and several clips at once', () => {
  assert.deepEqual(ids(deleteItems(project(), ['x2', 'v2', 'a2'])), [['x1'], ['v1'], ['a1']]);
});
