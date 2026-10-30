import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_KEY } from '../src/editor/model.ts';
import { keyPixels } from '../src/playback/chromaKey.ts';

const GREEN = [0, 177, 64];
const key = (extra = {}) => ({ ...NO_KEY, enabled: true, ...extra });
const run = (pixels, k = key()) => {
  const data = new Uint8ClampedArray(pixels.flatMap((p) => [...p, 255]));
  keyPixels(data, k);
  return Array.from({ length: pixels.length }, (_, i) => [...data.slice(i * 4, i * 4 + 4)]);
};

test('the key colour itself becomes fully transparent', () => {
  assert.equal(run([GREEN])[0][3], 0);
});

test('a darker, shadowed patch of the backdrop keys out too', () => {
  assert.equal(run([[0, 120, 45]])[0][3], 0);
});

test('colours far from the key stay opaque', () => {
  for (const p of run([[230, 180, 150], [255, 255, 255], [20, 20, 20], [200, 30, 30], [40, 60, 220]])) assert.equal(p[3], 255);
});

test('softness gives a partly transparent edge between the key and the subject', () => {
  const [hard] = run([[60, 160, 80]], key({ softness: 0 }));
  const [soft] = run([[60, 160, 80]], key({ softness: 100 }));
  assert.ok(soft[3] > 0 && soft[3] < 255, `alpha ${soft[3]}`);
  assert.notEqual(hard[3], soft[3]);
});

test('zero tolerance and softness remove only the exact colour', () => {
  const [exact, near] = run([GREEN, [10, 170, 70]], key({ tolerance: 0, softness: 0 }));
  assert.equal(exact[3], 0);
  assert.equal(near[3], 255);
});

test('spill suppression pulls the green tint out of pixels that stay', () => {
  const tinted = [150, 200, 150];
  const [off] = run([tinted], key({ spill: 0 }));
  const [on] = run([tinted], key({ spill: 100 }));
  assert.deepEqual(off, [...tinted, 255]);
  assert.ok(on[1] < tinted[1], `green ${on[1]}`);
  assert.equal(on[3], 255);
});

test('existing transparency is kept', () => {
  const data = new Uint8ClampedArray([255, 0, 0, 100]);
  keyPixels(data, key());
  assert.equal(data[3], 100);
});

test('a grey key colour leaves other greys alone', () => {
  const [same, darker] = run([[128, 128, 128], [40, 40, 40]], key({ color: '#808080' }));
  assert.equal(same[3], 0);
  assert.equal(darker[3], 255);
});
