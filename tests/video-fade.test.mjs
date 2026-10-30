import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIDEO_CLIP_DEFAULTS, splitClip } from '../src/editor/model.ts';

const video = (extra = {}) => ({ ...VIDEO_CLIP_DEFAULTS, id: 'v', start: 10, mediaId: 'm', inS: 1, outS: 6, linkId: null, linked: false, ...extra });
const project = (v) => ({ name: 'Test', media: {}, output: { width: 1920, height: 1080, fps: 30 }, tracks: [
  { kind: 'video', id: 'V1', name: 'V1', label: '', hidden: false, magnetic: false, clips: [v] },
] });

test('new video clips have no fades', () => {
  const c = video();
  assert.deepEqual([c.fadeIn, c.fadeOut, c.curveIn, c.curveOut], [0, 0, 0, 0]);
});

test('splitting a video clip keeps each fade on its outer end', () => {
  const p = splitClip(project(video({ fadeIn: 1, fadeOut: 2, curveIn: 0.5 })), 'v', 12, 'r');
  const [l, r] = p.tracks[0].clips;
  assert.deepEqual([l.fadeIn, l.fadeOut, l.curveIn], [1, 0, 0.5]);
  assert.deepEqual([r.fadeIn, r.fadeOut], [0, 2]);
});
