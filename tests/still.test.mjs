import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_CLIP_DEFAULTS, VIDEO_CLIP_DEFAULTS, animationDuration, linkClips, pickedPair, placeMedia, trimClipEdge } from '../src/editor/model.ts';
import { frameAt } from '../src/media/animation.ts';

const still = { id: 's', name: 'logo.png', container: 'PNG', duration: 5, size: 1, bitrate: 0, video: { codec: 'image', width: 800, height: 600, fps: 0 }, audio: null, decodable: true, tone: '#000', seed: 0, still: true };
const project = (clips = []) => ({ name: 'Test', output: { width: 1920, height: 1080, fps: 30 }, media: { s: still },
  tracks: [
    { kind: 'video', id: 'v', name: 'V1', label: '', hidden: false, magnetic: false, clips },
    { kind: 'audio', id: 'a', name: 'A1', label: '', muted: false, clips: [{ ...AUDIO_CLIP_DEFAULTS, id: 'au', mediaId: 'x', start: 0, inS: 0, outS: 5, linkId: null, linked: false }] },
  ] });
const clip = (extra = {}) => ({ ...VIDEO_CLIP_DEFAULTS, id: 'c', mediaId: 's', start: 2, inS: 0, outS: 5, linkId: null, linked: false, ...extra });

test('a dropped still lasts its default length and brings no audio', () => {
  const p = placeMedia(project(), 's', 'v', 3, 'c');
  assert.deepEqual(p.tracks[0].clips.map((c) => [c.start, c.inS, c.outS, c.linkId]), [[3, 0, 5, null]]);
  assert.equal(p.tracks[1].clips.length, 1);
});

test('a still stretches past its default length from either edge', () => {
  let p = trimClipEdge(project([clip()]), 'c', 'out', 20);
  assert.deepEqual([p.tracks[0].clips[0].start, p.tracks[0].clips[0].outS], [2, 18]);
  p = trimClipEdge(p, 'c', 'in', 0);
  assert.deepEqual([p.tracks[0].clips[0].start, p.tracks[0].clips[0].inS, p.tracks[0].clips[0].outS], [0, 0, 20]);
});

test('a still keeps its end in place when its start is trimmed, and stays at least the minimum length', () => {
  let p = trimClipEdge(project([clip({ inS: 1.5, outS: 6.5 })]), 'c', 'in', 6.9);
  const c = p.tracks[0].clips[0];
  assert.deepEqual([c.start, c.start + c.outS - c.inS], [6.5, 7]);
  p = trimClipEdge(p, 'c', 'out', 0);
  assert.equal(p.tracks[0].clips[0].outS - p.tracks[0].clips[0].inS, 0.5);
});

test('stills cannot be linked to audio', () => {
  const p = project([clip()]);
  assert.equal(linkClips(p, 'c', 'au', 'L'), p);
  assert.equal(pickedPair(p, [{ kind: 'clip', id: 'c' }, { kind: 'audio', id: 'au' }]), null);
});

test('an animation drops in as whole loops lasting at least five seconds', () => {
  assert.equal(animationDuration(0.6), 5.4);
  assert.equal(animationDuration(1), 5);
  assert.equal(animationDuration(7.5), 7.5);
});

test('animation frames loop past the end and before the start', () => {
  const timing = { starts: [0, 0.2, 0.4], loop: 0.6 };
  assert.deepEqual([0, 0.1, 0.2, 0.5, 0.6, 0.7, 1.3, -0.1].map((t) => frameAt(timing, t)), [0, 0, 1, 2, 0, 0, 0, 2]);
});
