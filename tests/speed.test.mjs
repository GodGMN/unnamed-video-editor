import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_CLIP_DEFAULTS, VIDEO_CLIP_DEFAULTS, clipDuration, clipEnd, setClipSpeed, splitClip, toSource, toTimeline, trimClipEdge } from '../src/editor/model.ts';
import { clipFrame, evaluateVideoClip } from '../src/editor/keyframes.ts';
import { validateProject } from '../src/projects/document.ts';
import { pitchCorrection } from '../src/playback/stretch.ts';

const media = { m: { id: 'm', name: 'm.mp4', container: 'MP4', duration: 20, size: 1, bitrate: 1, video: { codec: 'avc1', width: 1920, height: 1080, fps: 30 }, audio: null, decodable: true, tone: '#000000', seed: 1 } };
const video = (id, start, extra = {}) => ({ ...VIDEO_CLIP_DEFAULTS, id, start, mediaId: 'm', inS: 2, outS: 6, linkId: 'L', linked: true, ...extra });
const audio = (id, start, extra = {}) => ({ ...AUDIO_CLIP_DEFAULTS, id, start, mediaId: 'm', inS: 2, outS: 6, linkId: 'L', linked: true, ...extra });
const project = (v = [video('v', 10)], a = [audio('a', 10)]) => ({ name: 'Test', media, output: { width: 1920, height: 1080, fps: 30 }, tracks: [
  { kind: 'video', id: 'V1', name: 'V1', label: '', hidden: false, magnetic: false, clips: v },
  { kind: 'audio', id: 'A1', name: 'A1', label: '', muted: false, clips: a },
] });
const clip = (p, track, i = 0) => p.tracks[track].clips[i];

test('a clip without a speed plays at 1×', () => {
  const c = video('v', 10);
  assert.equal(clipDuration(c), 4);
  assert.equal(toSource(c, 11), 3);
  assert.equal(toTimeline(c, 3), 11);
});

test('speed maps sequence time to source time both ways', () => {
  const fast = video('v', 10, { speed: 2 }), slow = video('v', 10, { speed: 0.5 });
  assert.equal(clipDuration(fast), 2);
  assert.equal(clipDuration(slow), 8);
  assert.equal(toSource(fast, 11), 4);
  assert.equal(toSource(slow, 12), 3);
  assert.equal(toTimeline(fast, 4), 11);
  assert.equal(toTimeline(slow, 3), 12);
});

test('setting the speed keeps the source range, changes the length, and moves linked audio too', () => {
  const p = setClipSpeed(project(), 'v', 2);
  assert.deepEqual([clip(p, 0).speed, clip(p, 0).inS, clip(p, 0).outS, clip(p, 0).start], [2, 2, 6, 10]);
  assert.equal(clip(p, 1).speed, 2);
  assert.equal(clipEnd(clip(p, 1)), 12);
});

test('an unlinked partner keeps its speed', () => {
  const p = setClipSpeed(project([video('v', 10, { linked: false })], [audio('a', 10, { linked: false })]), 'v', 2);
  assert.equal(clip(p, 0).speed, 2);
  assert.equal(clip(p, 1).speed, undefined);
});

test('speed is clamped and stills have none', () => {
  assert.equal(clip(setClipSpeed(project(), 'v', 100), 0).speed, 4);
  assert.equal(clip(setClipSpeed(project(), 'v', 0), 0).speed, 0.25);
  const still = { ...project(), media: { m: { ...media.m, still: true } } };
  assert.equal(setClipSpeed(still, 'v', 2), still);
});

test('later clips follow the end, with their partners, so nothing overlaps or leaves a gap', () => {
  const v = [video('v', 10), video('w', 14, { linkId: 'W' }), video('x', 20, { linkId: 'X' })];
  const a = [audio('a', 10), audio('b', 14, { linkId: 'W' })];
  const slow = setClipSpeed(project(v, a), 'v', 0.5);
  assert.deepEqual(slow.tracks[0].clips.map((c) => c.start), [10, 18, 24]);
  assert.deepEqual(slow.tracks[1].clips.map((c) => c.start), [10, 18]);
  const fast = setClipSpeed(project(v, a), 'v', 2);
  assert.deepEqual(fast.tracks[0].clips.map((c) => c.start), [10, 12, 18]);
});

test('earlier clips stay put', () => {
  const p = setClipSpeed(project([video('u', 0, { linkId: 'U' }), video('v', 10)]), 'v', 0.5);
  assert.equal(clip(p, 0, 0).start, 0);
});

test('splitting a sped-up clip cuts at the source time under the playhead', () => {
  const p = splitClip(project([video('v', 10, { speed: 2, fadeIn: 0.5, fadeOut: 0.5 })], [audio('a', 10, { speed: 2 })]), 'v', 11, 'r');
  const [l, r] = p.tracks[0].clips;
  assert.deepEqual([l.inS, l.outS, clipEnd(l), l.fadeIn], [2, 4, 11, 0.5]);
  assert.deepEqual([r.start, r.inS, r.outS, r.speed, clipEnd(r), r.fadeOut], [11, 4, 6, 2, 12, 0.5]);
});

test('trimming a slowed clip moves its edges in sequence time', () => {
  const p = project([video('v', 10, { speed: 0.5 })], [audio('a', 10, { speed: 0.5 })]);
  const out = trimClipEdge(p, 'v', 'out', 16);
  assert.deepEqual([clip(out, 0).outS, clipEnd(clip(out, 0))], [5, 16]);
  const inn = trimClipEdge(p, 'v', 'in', 12);
  assert.deepEqual([clip(inn, 0).start, clip(inn, 0).inS, clipEnd(clip(inn, 0))], [12, 3, 18]);
  // The in point can't go before the source start: 2 s of source is 4 s of sequence.
  assert.deepEqual([clip(trimClipEdge(p, 'v', 'in', 0), 0).start, clip(trimClipEdge(p, 'v', 'in', 0), 0).inS], [6, 0]);
});

test('keyframes stay on the same source frames at a different speed', () => {
  const keys = { x: [{ time: 2, value: 0 }, { time: 6, value: 100 }] };
  const c = video('v', 10, { speed: 2, keyframes: keys });
  assert.equal(evaluateVideoClip(c, 11).x, 50);
  const frame = clipFrame(c, 11, 30);
  assert.deepEqual([frame.index, frame.count, frame.sourceTime], [30, 60, 4]);
});

test('saved projects accept speeds in range and reject others', () => {
  validateProject(project([video('v', 10, { speed: 2 })], [audio('a', 10, { speed: 2, keepPitch: false })]));
  assert.throws(() => validateProject(project([video('v', 10, { speed: 10 })])));
  assert.throws(() => validateProject(project(undefined, [audio('a', 10, { keepPitch: 'yes' })])));
});

test('pitch correction undoes the rate change', () => {
  assert.equal(pitchCorrection(2), -12);
  assert.equal(pitchCorrection(0.5), 12);
  assert.equal(pitchCorrection(1), -0);
});
