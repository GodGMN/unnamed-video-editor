import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipFrame, evaluateVideoClip, saveKeyframe, removeKeyframe } from '../src/editor/keyframes.ts';
import { VIDEO_CLIP_DEFAULTS, splitClip, duplicateClip, trimClipEdge } from '../src/editor/model.ts';
import { seedProject } from '../src/editor/seed.ts';
import { parseDocument, projectDocument } from '../src/projects/document.ts';
const clip = (extra = {}) => ({ ...VIDEO_CLIP_DEFAULTS, id: 'v', mediaId: 'intro', start: 10, inS: 1, outS: 6, linkId: null, linked: false, ...extra });
const project = c => ({ ...seedProject(), tracks: [{ kind: 'video', id: 'V1', name: 'V1', label: '', hidden: false, magnetic: false, clips: [c] }] });
const animated = () => {
  let c = clip({ scale: 150 });
  c = { ...c, keyframes: saveKeyframe(c, 'scale', 1, 100) };
  return { ...c, keyframes: saveKeyframe(c, 'scale', 5, 200) };
};

test('one keyframe never overrides the ordinary base property', () => {
  let c = clip({ cropL: 20 });
  c = { ...c, keyframes: saveKeyframe(c, 'cropL', 1, 80) };
  assert.equal(evaluateVideoClip(c, 12).cropL, 20);
  c = { ...c, cropL: 40 };
  assert.equal(evaluateVideoClip(c, 12).cropL, 40);
  assert.deepEqual(c.keyframes.cropL, [{ time: 1, value: 80 }]);
});

test('two keys interpolate, hold endpoints, and leave other properties static', () => {
  const c = animated();
  assert.equal(evaluateVideoClip(c, 9).scale, 100);
  assert.equal(evaluateVideoClip(c, 12).scale, 150);
  assert.equal(evaluateVideoClip(c, 14).scale, 200);
  assert.equal(evaluateVideoClip(c, 14.5).scale, 200);
  assert.equal(evaluateVideoClip(c, 12).cropL, 0);
  assert.equal(evaluateVideoClip(c, 12).fit, 'custom');
});

test('separate properties each need two keys; update replaces and delete restores base', () => {
  let c = clip({ x: 10, cropL: 20 });
  c = { ...c, keyframes: saveKeyframe(c, 'x', 1, 100) };
  c = { ...c, keyframes: saveKeyframe(c, 'cropL', 2, 80) };
  assert.deepEqual([evaluateVideoClip(c, 11).x, evaluateVideoClip(c, 11).cropL], [10, 20]);
  c = { ...c, keyframes: saveKeyframe(c, 'x', 3, 300) };
  c = { ...c, keyframes: saveKeyframe(c, 'x', 1, 200) };
  assert.deepEqual(c.keyframes.x, [{ time: 1, value: 200 }, { time: 3, value: 300 }]);
  assert.equal(evaluateVideoClip(c, 11).x, 250);
  c = { ...c, keyframes: removeKeyframe(c, 'x', 3) };
  assert.equal(evaluateVideoClip(c, 11).x, 10);
});

test('frame counter uses clip time and project fps, including fractional rates and short clips', () => {
  assert.deepEqual(clipFrame(clip(), 12, 30), { index: 60, count: 150, sourceTime: 3, timelineTime: 12 });
  assert.equal(clipFrame(clip(), 99, 30).index, 149);
  assert.equal(clipFrame(clip(), 0, 30).index, 0);
  assert.equal(clipFrame(clip(), 10 + 29 / 29.97, 29.97).index, 29);
  assert.equal(clipFrame(clip({ outS: 1.01 }), 10, 30).count, 1);
});

test('moving, duplicating, trimming and splitting preserve motion at the same source time', () => {
  const c = animated();
  assert.equal(evaluateVideoClip({ ...c, start: 20 }, 22).scale, 150);
  const dup = duplicateClip(project(c), 'v', 'copy').tracks[0].clips.find(c => c.id === 'copy');
  assert.equal(evaluateVideoClip(dup, dup.start + 2).scale, 150);
  const trimmed = trimClipEdge(project(c), 'v', 'in', 11).tracks[0].clips[0];
  assert.equal(evaluateVideoClip(trimmed, 12).scale, 150);
  const [left, right] = splitClip(project(c), 'v', 12, 'right').tracks[0].clips;
  assert.equal(evaluateVideoClip(left, 11).scale, 125);
  assert.equal(evaluateVideoClip(right, 12).scale, 150);
  assert.equal(evaluateVideoClip(right, 13).scale, 175);
});

test('project documents retain keyframes and accept old projects without tracks', () => {
  const restored = parseDocument(JSON.parse(JSON.stringify(projectDocument(project(animated())))));
  assert.equal(evaluateVideoClip(restored.tracks[0].clips[0], 12).scale, 150);
  assert.equal(parseDocument(projectDocument(project(clip()))).tracks[0].clips[0].scale, 100);
});

test('import rejects duplicate times, unknown properties, and invalid values', () => {
  for (const keyframes of [
    { scale: [{ time: 1, value: 100 }, { time: 1, value: 200 }] },
    { opacity: [{ time: 1, value: 1 }] },
    { cropL: [{ time: 1, value: -2 }] },
    { scale: [{ time: 1, value: NaN }] },
  ]) assert.throws(() => parseDocument(projectDocument(project(clip({ keyframes })))));
  assert.equal(evaluateVideoClip(parseDocument(projectDocument(project(animated()))).tracks[0].clips[0], 11).scale, 125);
});


test('easing presets follow their illustrated curves and keep exact endpoints', async () => {
  const { easingProgress } = await import('../src/editor/keyframes.ts');
  assert.equal(easingProgress('linear', 0.25), 0.25);
  assert.equal(Number(easingProgress('ease-in', 0.5).toFixed(6)), 0.315357);
  assert.equal(Number(easingProgress('ease-out', 0.5).toFixed(6)), 0.684643);
  assert.equal(Number(easingProgress('ease-in-out', 0.25).toFixed(6)), 0.129162);
  for (const easing of ['linear', 'ease-in', 'ease-out', 'ease-in-out']) {
    assert.equal(easingProgress(easing, 0), 0);
    assert.equal(easingProgress(easing, 1), 1);
  }
});

test('each interval has its own easing without changing other properties or key values', async () => {
  const { setKeyframeEasing } = await import('../src/editor/keyframes.ts');
  let c = clip({ keyframes: { x: [{ time: 1, value: 0 }, { time: 3, value: 100 }, { time: 5, value: 200 }] } });
  c = { ...c, keyframes: setKeyframeEasing(c, 'x', 1, 'ease-in') };
  c = { ...c, keyframes: setKeyframeEasing(c, 'x', 3, 'ease-out') };
  assert.equal(Number(evaluateVideoClip(c, 11).x.toFixed(6)), 31.535681);
  assert.equal(Number(evaluateVideoClip(c, 13).x.toFixed(6)), 168.464319);
  assert.equal(evaluateVideoClip(c, 12).x, 100);
  assert.equal(evaluateVideoClip(c, 11).scale, 100);
  assert.deepEqual(c.keyframes.x.map(({ time, value }) => [time, value]), [[1, 0], [3, 100], [5, 200]]);
  c = { ...c, keyframes: saveKeyframe(c, 'x', 1, 20) };
  assert.equal(c.keyframes.x[0].easing, 'ease-in');
  assert.equal(Number(evaluateVideoClip(c, 11).x.toFixed(6)), 45.228545);
});

test('interval selection follows the playhead, selects outgoing keys and clamps at endpoints', async () => {
  const { keyframeInterval } = await import('../src/editor/keyframes.ts');
  const keys = [{ time: 1, value: 0 }, { time: 3, value: 100 }, { time: 5, value: 200 }];
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(time => keyframeInterval(keys, time)), [0, 0, 0, 1, 1, 1, 1]);
  assert.equal(keyframeInterval(keys.slice(0, 1), 1), -1);
});

test('easing persists through documents, trims, splits and duplication', () => {
  const c = clip({ keyframes: { x: [{ time: 1, value: 0, easing: 'ease-in' }, { time: 5, value: 100 }] } });
  const p = parseDocument(JSON.parse(JSON.stringify(projectDocument(project(c)))));
  assert.equal(Number(evaluateVideoClip(p.tracks[0].clips[0], 12).x.toFixed(6)), 31.535681);
  const [l, r] = splitClip(p, 'v', 12, 'r').tracks[0].clips;
  assert.equal(Number(evaluateVideoClip(l, 11).x.toFixed(6)), 9.346465);
  assert.equal(Number(evaluateVideoClip(r, 12).x.toFixed(6)), 31.535681);
  const dup = duplicateClip(p, 'v', 'copy').tracks[0].clips.find(c => c.id === 'copy');
  assert.equal(Number(evaluateVideoClip(dup, dup.start + 2).x.toFixed(6)), 31.535681);
  const trimmed = trimClipEdge(p, 'v', 'in', 11).tracks[0].clips[0];
  assert.equal(Number(evaluateVideoClip(trimmed, 12).x.toFixed(6)), 31.535681);
  assert.throws(() => parseDocument(projectDocument(project(clip({ keyframes: { x: [{ time: 1, value: 1, easing: 'surprise' }] } })))));
});

test('first manual key opts a clip into automatic keys on property edits', async () => {
  const { autoKeyframePatch } = await import('../src/editor/keyframes.ts');
  let c = clip();
  assert.deepEqual(autoKeyframePatch(c, { x: 100 }, 11, 30), { x: 100 });
  c = { ...c, keyframes: saveKeyframe(c, 'x', 1, 0) };
  c = { ...c, ...autoKeyframePatch(c, { x: 100 }, 11, 30) };
  assert.deepEqual(c.keyframes.x, [{ time: 1, value: 0 }, { time: 2, value: 100 }]);
  assert.equal(evaluateVideoClip(c, 10.5).x, 50);
  c = { ...c, ...autoKeyframePatch(c, { x: 200 }, 11, 30) };
  assert.deepEqual(c.keyframes.x, [{ time: 1, value: 0 }, { time: 2, value: 200 }]);
  c = { ...c, ...autoKeyframePatch(c, { y: 80, cropL: 20 }, 12, 30) };
  assert.deepEqual(c.keyframes.y, [{ time: 3, value: 80 }]);
  assert.deepEqual(c.keyframes.cropL, [{ time: 3, value: 20 }]);
});

test('auto-keying keeps easing, respects trimmed source time and stops when all keys are removed', async () => {
  const { autoKeyframePatch } = await import('../src/editor/keyframes.ts');
  let c = clip({ inS: 1.01, keyframes: { x: [{ time: 2, value: 100, easing: 'ease-out' }] } });
  c = { ...c, ...autoKeyframePatch(c, { x: 150 }, 10.99, 30) };
  assert.deepEqual(c.keyframes.x, [{ time: 2, value: 150, easing: 'ease-out' }]);
  assert.deepEqual(autoKeyframePatch(c, { x: 500 }, 9, 30), { x: 500 });
  const explicit = { keyframes: removeKeyframe(c, 'x', 2) };
  assert.equal(autoKeyframePatch(c, explicit, 11, 30), explicit);
  c = { ...c, ...explicit };
  assert.deepEqual(autoKeyframePatch(c, { x: 300 }, 11, 30), { x: 300 });
});
