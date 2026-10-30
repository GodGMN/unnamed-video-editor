import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeTargets, snapEdge } from '../src/editor/model.ts';

const project = () => ({ name: 'Test', media: {}, output: { width: 1920, height: 1080, fps: 30 }, tracks: [
  { kind: 'text', id: 't', name: 'T', label: '', hidden: false, items: [
    { id: 'x', content: 'Hi', size: 72, color: '#FFFFFF', pos: 'bc', x: 0, y: 0, start: 10, duration: 13.6 },
  ] },
  { kind: 'video', id: 'v', name: 'V', label: '', hidden: false, magnetic: false, clips: [
    { id: 'a', mediaId: 'm', start: 2, inS: 0, outS: 7.6, linked: false, linkId: null },
  ] },
  { kind: 'audio', id: 'au', name: 'A', label: '', muted: false, clips: [
    { id: 'b', mediaId: 'm', start: 20, inS: 1, outS: 6, linked: false, linkId: null },
  ] },
] });

test('targets collect every edge on every track except the skipped items', () => {
  assert.deepEqual(edgeTargets(project(), new Set(['x'])).sort((a, b) => a - b), [0, 2, 9.6, 20, 25]);
});
test('an edge snaps to the closest target within 8 pixels', () => {
  const targets = [0, 9.6, 20, 25];
  assert.equal(snapEdge(24.9, targets, 40), 25);
  assert.equal(snapEdge(24.5, targets, 40), null);
  assert.equal(snapEdge(20.05, [20, 20.1], 40), 20);
});
