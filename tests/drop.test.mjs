import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIDEO_CLIP_DEFAULTS, AUDIO_CLIP_DEFAULTS, acceptsMedia, magneticCut, placeMedia } from '../src/editor/model.ts';

const clip = (id, start, linkId = null) => ({ ...VIDEO_CLIP_DEFAULTS, id, start, mediaId: 'old', inS: 0, outS: 5, linkId, linked: !!linkId });
const media = (id, extra = {}) => ({ id, name: id, duration: 3, decodable: true, video: { width: 320, height: 180 }, audio: { channels: 2 }, ...extra });
const project = (magnetic = true) => ({ name: 'Test', output: { width: 1920, height: 1080, fps: 30 },
  media: { old: media('old'), new: media('new'), silent: media('silent', { audio: null }), sound: media('sound', { video: null }) },
  tracks: [
    { kind: 'video', id: 'v', name: 'V1', label: '', hidden: false, magnetic, clips: [clip('a', 0, 'a'), clip('b', 5, 'b')] },
    { kind: 'audio', id: 'au', name: 'A1', label: '', muted: false, clips: [
      { ...AUDIO_CLIP_DEFAULTS, ...clip('a-audio', 0, 'a'), linked: true },
      { ...AUDIO_CLIP_DEFAULTS, ...clip('b-audio', 5, 'b'), linked: true },
    ] },
  ] });
const starts = (p, i) => Object.fromEntries(p.tracks[i].clips.map((c) => [c.id, c.start]));

test('magnetic drops go to the nearest cut', () => {
  const clips = project().tracks[0].clips;
  assert.deepEqual(magneticCut(clips, 1), { index: 0, start: 0 });
  assert.deepEqual(magneticCut(clips, 4), { index: 1, start: 5 });
  assert.deepEqual(magneticCut(clips, 9), { index: 2, start: 10 });
});

test('a magnetic insert pushes later clips and their linked audio right', () => {
  const p = placeMedia(project(), 'new', 'v', 4.2, 'n');
  assert.deepEqual(starts(p, 0), { a: 0, n: 5, b: 8 });
  assert.equal(starts(p, 1)['b-audio'], 8);
  assert.equal(starts(p, 1)['a-audio'], 0);
  assert.ok(p.tracks.some((t) => t.clips?.some((c) => c.id === 'n-audio' && c.start === 5)));
});

test('a magnetic insert keeps unlinked partners in sync too', () => {
  const p = project();
  p.tracks[0].clips[1].linked = false;
  p.tracks[1].clips[1].linked = false;
  assert.equal(starts(placeMedia(p, 'new', 'v', 4.2, 'n'), 1)['b-audio'], 8);
});

test('appending to a magnetic track moves nothing', () => {
  const p = placeMedia(project(), 'new', 'v', 30, 'n');
  assert.deepEqual(starts(p, 0), { a: 0, b: 5, n: 10 });
});

test('free tracks place the clip at the drop time', () => {
  const p = placeMedia(project(false), 'new', 'v', 2.5, 'n');
  assert.deepEqual(starts(p, 0), { a: 0, n: 2.5, b: 5 });
});

test('tracks only take media they can play', () => {
  const p = project();
  const [v, a] = p.tracks;
  assert.equal(acceptsMedia(v, p.media.silent), true);
  assert.equal(acceptsMedia(v, p.media.sound), false);
  assert.equal(acceptsMedia(a, p.media.sound), true);
  assert.equal(acceptsMedia(a, p.media.silent), false);
  assert.equal(acceptsMedia({ kind: 'text', clips: [] }, p.media.new), false);
  assert.equal(placeMedia(p, 'sound', 'v', 0, 'n'), p);
});
