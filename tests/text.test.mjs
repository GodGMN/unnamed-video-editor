import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIDEO_CLIP_DEFAULTS, trimClipEdge } from '../src/editor/model.ts';

const project = () => ({ name: 'Test', media: { m: { id: 'm', duration: 8 } }, output: { width: 1920, height: 1080, fps: 30 }, tracks: [
  { kind: 'text', id: 't', name: 'T', label: '', hidden: false, clips: [
    { id: 'a', content: 'Hi', size: 72, color: '#FFFFFF', pos: 'bc', x: 0, y: 0, start: 10, duration: 5 },
  ] },
  { kind: 'video', id: 'v', name: 'V1', label: '', hidden: false, magnetic: false, clips: [
    { ...VIDEO_CLIP_DEFAULTS, id: 'c', mediaId: 'm', start: 4, inS: 2, outS: 6, linkId: null, linked: false },
  ] },
] });
const text = (p) => p.tracks[0].clips[0];
const clip = (p) => p.tracks[1].clips[0];

test('trimming the start keeps the end in place', () => {
  assert.deepEqual([text(trimClipEdge(project(), 'a', 'in', 8)).start, text(trimClipEdge(project(), 'a', 'in', 8)).duration], [8, 7]);
  const p = trimClipEdge(project(), 'a', 'in', 12);
  assert.equal(text(p).start + text(p).duration, 15);
  const q = trimClipEdge(project(), 'c', 'in', 5);
  assert.deepEqual([clip(q).start, clip(q).inS, clip(q).outS], [5, 3, 6]);
});
test('trimming the end changes only the duration', () => {
  const p = trimClipEdge(project(), 'a', 'out', 18);
  assert.deepEqual([text(p).start, text(p).duration], [10, 8]);
  const q = trimClipEdge(project(), 'c', 'out', 9);
  assert.deepEqual([clip(q).start, clip(q).inS, clip(q).outS], [4, 2, 7]);
});
test('trims keep a minimum length and never start before zero', () => {
  assert.equal(text(trimClipEdge(project(), 'a', 'in', 20)).duration, 0.5);
  assert.equal(text(trimClipEdge(project(), 'a', 'out', 2)).duration, 0.5);
  assert.equal(text(trimClipEdge(project(), 'a', 'in', -3)).start, 0);
});
test('media clips stop at the ends of their source; text clips do not', () => {
  const p = trimClipEdge(project(), 'c', 'in', 0);
  assert.deepEqual([clip(p).start, clip(p).inS], [2, 0]);
  assert.equal(clip(trimClipEdge(project(), 'c', 'out', 30)).outS, 8);
  assert.equal(text(trimClipEdge(project(), 'a', 'out', 60)).duration, 50);
});
