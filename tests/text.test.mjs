import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trimTextItem } from '../src/editor/model.ts';

const project = () => ({ name: 'Test', media: {}, output: { width: 1920, height: 1080, fps: 30 }, tracks: [
  { kind: 'text', id: 't', name: 'T', label: '', hidden: false, items: [
    { id: 'a', content: 'Hi', size: 72, color: '#FFFFFF', pos: 'bc', x: 0, y: 0, start: 10, duration: 5 },
  ] },
] });
const item = (p) => p.tracks[0].items[0];

test('trimming the start keeps the end in place', () => {
  assert.deepEqual([item(trimTextItem(project(), 'a', 'in', 8)).start, item(trimTextItem(project(), 'a', 'in', 8)).duration], [8, 7]);
  const p = trimTextItem(project(), 'a', 'in', 12);
  assert.equal(item(p).start + item(p).duration, 15);
});
test('trimming the end changes only the duration', () => {
  const p = trimTextItem(project(), 'a', 'out', 18);
  assert.deepEqual([item(p).start, item(p).duration], [10, 8]);
});
test('trims keep a minimum length and never start before zero', () => {
  assert.equal(item(trimTextItem(project(), 'a', 'in', 20)).duration, 0.5);
  assert.equal(item(trimTextItem(project(), 'a', 'out', 2)).duration, 0.5);
  assert.equal(item(trimTextItem(project(), 'a', 'in', -3)).start, 0);
});
