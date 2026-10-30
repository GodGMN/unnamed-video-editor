import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIDEO_CLIP_DEFAULTS, moveClip, patchClip, settle, overlapAfter } from '../src/editor/model.ts';

const clip = (id, start) => ({ ...VIDEO_CLIP_DEFAULTS, id, start, mediaId: 'media', inS: 0, outS: 5, linkId: null });
const project = () => ({ name: 'Test', media: {}, output: { width: 1920, height: 1080, fps: 30 }, tracks: [
  { kind: 'video', id: 'v', name: 'V1', label: '', hidden: false, magnetic: true, clips: [clip('a', 0), clip('b', 4)] },
] });

test('changing any transition never changes clip placement or overlap', () => {
  for (const type of ['cut', 'fade', 'crossfade']) {
    const p = settle(patchClip(project(), 'a', { transitionOut: { type, duration: 2 } }));
    assert.deepEqual(p.tracks[0].clips.map(c => c.start), [0, 4]);
    assert.equal(overlapAfter(...p.tracks[0].clips), 1);
  }
});
test('moving a clip controls overlap independently of its transition', () => {
  const p = settle(moveClip(project(), 'b', 3));
  assert.equal(overlapAfter(...p.tracks[0].clips), 2);
  assert.equal(p.tracks[0].clips[0].transitionOut, null);
  const separated = settle(moveClip(p, 'b', 8));
  assert.equal(overlapAfter(...separated.tracks[0].clips), 0);
  assert.deepEqual(separated.tracks[0].clips.map(c => c.start), [0, 8]);
});

test('moving a clip with others shifts them all by the same delta', () => {
  const p = project();
  p.tracks[0].clips.push(clip('c', 12));
  const moved = moveClip(p, 'b', 6, ['c']);
  assert.deepEqual(moved.tracks[0].clips.map(c => [c.id, c.start]), [['a', 0], ['b', 6], ['c', 14]]);
});

test('a group move stops when its earliest clip reaches 0', () => {
  const p = project();
  p.tracks[0].clips.push(clip('c', 12));
  const moved = moveClip(p, 'c', 0, ['b']);
  assert.deepEqual(moved.tracks[0].clips.map(c => [c.id, c.start]), [['a', 0], ['b', 0], ['c', 8]]);
});
