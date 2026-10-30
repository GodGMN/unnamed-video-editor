import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIDEO_CLIP_DEFAULTS, AUDIO_CLIP_DEFAULTS, moveClip } from '../src/editor/model.ts';

const clip = (id, start, linkId = null) => ({ ...VIDEO_CLIP_DEFAULTS, id, start, mediaId: 'm', inS: 0, outS: 5, linkId, linked: !!linkId });
const project = () => ({ name: 'Test', media: {}, output: { width: 1920, height: 1080, fps: 30 }, tracks: [
  { kind: 'text', id: 't', name: 'T1', label: '', hidden: false, clips: [] },
  { kind: 'video', id: 'v2', name: 'V2', label: '', hidden: false, magnetic: false, clips: [clip('c', 20)] },
  { kind: 'video', id: 'v1', name: 'V1', label: '', hidden: false, magnetic: false, clips: [clip('a', 0, 'a'), clip('b', 5)] },
  { kind: 'audio', id: 'a1', name: 'A1', label: '', muted: false, clips: [{ ...AUDIO_CLIP_DEFAULTS, ...clip('a-audio', 0, 'a'), linked: true }] },
] });
const ids = (p, id) => p.tracks.find((t) => t.id === id).clips.map((c) => `${c.id}@${c.start}`);

test('a clip moves up to another video track; its linked audio stays on its track and keeps in sync', () => {
  const p = moveClip(project(), 'a', 2, [], -1);
  assert.deepEqual(ids(p, 'v2'), ['a@2', 'c@20']);
  assert.deepEqual(ids(p, 'v1'), ['b@5']);
  assert.deepEqual(ids(p, 'a1'), ['a-audio@2']);
});

test('the track shift is clamped to the existing video tracks', () => {
  assert.deepEqual(ids(moveClip(project(), 'b', 5, [], -5), 'v2'), ['b@5', 'c@20']);
  assert.deepEqual(ids(moveClip(project(), 'b', 5, [], 3), 'v1'), ['a@0', 'b@5']);
});

test('picked clips move tracks together, and the group stops at the edge track', () => {
  const p = moveClip(project(), 'b', 5, ['c'], 1);
  assert.deepEqual(ids(p, 'v2'), ['c@20']);
  assert.deepEqual(ids(p, 'v1'), ['a@0', 'b@5']);
  const up = moveClip(project(), 'b', 6, ['a'], -1);
  assert.deepEqual(ids(up, 'v2'), ['a@1', 'b@6', 'c@20']);
  assert.deepEqual(ids(up, 'a1'), ['a-audio@1']);
});

test('a text clip moves to another text track and stays out of the video tracks', () => {
  const text = (id, start) => ({ id, content: id, size: 72, color: '#FFFFFF', pos: 'bc', x: 0, y: 0, start, duration: 3 });
  const p = project();
  p.tracks.unshift({ kind: 'text', id: 't0', name: 'T0', label: '', hidden: false, clips: [] });
  p.tracks[1].clips.push(text('x', 4));
  const q = moveClip(p, 'x', 6, ['b'], -1);
  assert.deepEqual(ids(q, 't0'), ['x@6']);
  assert.deepEqual(ids(q, 't'), []);
  assert.deepEqual(ids(q, 'v1'), ['a@0', 'b@7']);
  assert.deepEqual(ids(moveClip(p, 'x', 4, [], 5), 't'), ['x@4']);
});
