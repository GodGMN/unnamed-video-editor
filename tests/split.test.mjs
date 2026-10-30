import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_CLIP_DEFAULTS, VIDEO_CLIP_DEFAULTS, addTextItem, duplicateClip, splitClip, splitTextItem } from '../src/editor/model.ts';

const video = (id, start, extra = {}) => ({ ...VIDEO_CLIP_DEFAULTS, id, start, mediaId: 'm', inS: 1, outS: 6, linkId: 'L', linked: true, ...extra });
const audio = (id, start, extra = {}) => ({ ...AUDIO_CLIP_DEFAULTS, id, start, mediaId: 'm', inS: 1, outS: 6, linkId: 'L', linked: true, fadeIn: 1, fadeOut: 2, ...extra });
const project = (v = [video('v', 10)], a = [audio('a', 10)]) => ({ name: 'Test', media: {}, output: { width: 1920, height: 1080, fps: 30 }, tracks: [
  { kind: 'text', id: 't', name: 'Text', label: '', hidden: false, items: [{ id: 'x', content: 'Hi', size: 72, color: '#FFFFFF', pos: 'bc', start: 2, duration: 4 }] },
  { kind: 'video', id: 'V1', name: 'V1', label: '', hidden: false, magnetic: false, clips: v },
  { kind: 'audio', id: 'A1', name: 'A1', label: '', muted: false, clips: a },
] });

test('splitting a linked clip cuts both halves and links the right pieces', () => {
  const p = splitClip(project([video('v', 10, { transitionOut: { type: 'fade', duration: 1 } })]), 'v', 12, 'r');
  const [l, r] = p.tracks[1].clips;
  assert.deepEqual([l.id, l.start, l.inS, l.outS, l.transitionOut], ['v', 10, 1, 3, null]);
  assert.deepEqual([r.id, r.start, r.inS, r.outS, r.linkId, r.linked], ['r', 12, 3, 6, 'r', true]);
  assert.equal(r.transitionOut.type, 'fade');
  const [al, ar] = p.tracks[2].clips;
  assert.deepEqual([al.id, al.outS, al.fadeIn, al.fadeOut, al.linkId], ['a', 3, 1, 0, 'L']);
  assert.deepEqual([ar.id, ar.inS, ar.fadeIn, ar.fadeOut, ar.linkId], ['r-1', 3, 0, 2, 'r']);
});

test('splitting an unlinked clip leaves its partner alone', () => {
  const p = splitClip(project([video('v', 10, { linked: false })], [audio('a', 10, { linked: false })]), 'v', 12, 'r');
  assert.equal(p.tracks[1].clips.length, 2);
  assert.equal(p.tracks[2].clips.length, 1);
  assert.equal(p.tracks[1].clips[1].linkId, null);
});

test('splitting outside a clip or at its edge does nothing', () => {
  const p = project();
  assert.equal(splitClip(p, 'v', 9, 'r'), p);
  assert.equal(splitClip(p, 'v', 10.01, 'r'), p);
  assert.equal(splitClip(p, 'v', 15, 'r'), p);
});

test('splitting a text item', () => {
  const [l, r] = splitTextItem(project(), 'x', 3.5, 'y').tracks[0].items;
  assert.deepEqual([l.start, l.duration, r.id, r.start, r.duration, r.content], [2, 1.5, 'y', 3.5, 2.5, 'Hi']);
});

test('adding text uses the top text track with room, or creates one', () => {
  const p = addTextItem(project(), 7, 'n');
  assert.deepEqual(p.tracks[0].items.map((x) => [x.id, x.start]), [['x', 2], ['n', 7]]);
  const busy = addTextItem(project(), 3, 'n');
  assert.deepEqual([busy.tracks[0].name, busy.tracks[0].items.map((x) => x.id), busy.tracks[1].items.length], ['Text 2', ['n'], 1]);
  const bare = { ...project(), tracks: project().tracks.slice(1) };
  const q = addTextItem(bare, 7, 'n');
  assert.equal(q.tracks[0].kind, 'text');
  assert.equal(q.tracks[0].items[0].id, 'n');
});

test('duplicating goes right after the clip, or after the last clip when that spot is taken', () => {
  const p = duplicateClip(project(), 'v', 'c');
  assert.deepEqual(p.tracks[1].clips.map((c) => [c.id, c.start, c.linkId]), [['v', 10, 'L'], ['c', 15, 'c']]);
  assert.deepEqual(p.tracks[2].clips.map((c) => [c.id, c.start, c.linkId]), [['a', 10, 'L'], ['c-1', 15, 'c']]);
  const busy = duplicateClip(project([video('v', 10), video('w', 17, { linkId: null, linked: false })]), 'v', 'c');
  assert.deepEqual(busy.tracks[1].clips.map((c) => [c.id, c.start]), [['v', 10], ['w', 17], ['c', 22]]);
});
