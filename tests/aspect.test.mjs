import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASPECTS, TEXT_CLIP_DEFAULTS, VIDEO_CLIP_DEFAULTS, aspectOf, exportSize, frameSize, setAspect } from '../src/editor/model.ts';

const aspect = (key) => ASPECTS.find((a) => a.key === key);
const project = (output = { width: 1920, height: 1080, fps: 30 }) => ({ name: 'Test', output, media: {}, tracks: [
  { kind: 'text', id: 't', name: 'T', label: '', hidden: false, clips: [{ ...TEXT_CLIP_DEFAULTS, id: 'a', start: 0, x: 96, y: -54 }] },
  { kind: 'video', id: 'v', name: 'V1', label: '', hidden: false, magnetic: true, clips: [
    { ...VIDEO_CLIP_DEFAULTS, id: 'c', mediaId: 'm', start: 0, inS: 0, outS: 4, linkId: null, linked: false, fit: 'custom', x: 480, y: -270 },
  ] },
] });

test('the short side sets the frame size for every preset', () => {
  const sizes = Object.fromEntries(ASPECTS.map((a) => [a.key, frameSize(a.w, a.h, 1080)]));
  assert.deepEqual(sizes, {
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '1:1': { width: 1080, height: 1080 },
    '4:5': { width: 1080, height: 1350 },
    '4:3': { width: 1440, height: 1080 },
    '21:9': { width: 2520, height: 1080 },
  });
});

test('export resolutions are the short side and keep the project ratio', () => {
  assert.deepEqual(exportSize({ width: 1080, height: 1920 }, 1080), { width: 1080, height: 1920 });
  assert.deepEqual(exportSize({ width: 1080, height: 1920 }, 720), { width: 720, height: 1280 });
  assert.deepEqual(exportSize({ width: 1080, height: 1080 }, 720), { width: 720, height: 720 });
  assert.deepEqual(exportSize({ width: 1920, height: 1080 }, 720), { width: 1280, height: 720 });
  assert.deepEqual(exportSize({ width: 1080, height: 1350 }, 720), { width: 720, height: 900 });
});

test('export sizes are always even for H.264', () => {
  for (const a of ASPECTS) for (const short of [720, 1080]) {
    const { width, height } = frameSize(a.w, a.h, short);
    assert.equal(width % 2 + height % 2, 0, `${a.key} at ${short}`);
  }
});

test('the output matches its preset', () => {
  assert.equal(aspectOf({ width: 1920, height: 1080 }).key, '16:9');
  assert.equal(aspectOf({ width: 1080, height: 1920 }).key, '9:16');
  assert.equal(aspectOf({ width: 720, height: 720 }).key, '1:1');
  assert.equal(aspectOf({ width: 1000, height: 300 }), null);
});

test('switching to vertical keeps the short side and moves offsets with the frame', () => {
  const p = setAspect(project(), aspect('9:16'));
  assert.deepEqual(p.output, { width: 1080, height: 1920, fps: 30 });
  assert.deepEqual([p.tracks[0].clips[0].x, p.tracks[0].clips[0].y], [54, -96]);
  assert.deepEqual([p.tracks[1].clips[0].x, p.tracks[1].clips[0].y], [270, -480]);
  const back = setAspect(p, aspect('16:9'));
  assert.deepEqual(back.output, project().output);
  assert.deepEqual([back.tracks[1].clips[0].x, back.tracks[1].clips[0].y], [480, -270]);
});

test('switching to square or the current ratio', () => {
  assert.deepEqual(setAspect(project(), aspect('1:1')).output, { width: 1080, height: 1080, fps: 30 });
  const p = project();
  assert.equal(setAspect(p, aspect('16:9')), p);
});
