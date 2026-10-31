import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, record, travel, amend } from '../src/editor/history.ts';
const p = name => ({ name, media: {}, tracks: [], output: { width: 1920, height: 1080, fps: 30 } });
test('undo and redo restore edits and a new edit discards redo', () => {
  let h = record(record(createHistory(p('a')), p('b')), p('c'));
  h = travel(h, 'undo'); assert.equal(h.present.name, 'b');
  assert.equal(travel(h, 'redo').present.name, 'c');
  h = record(h, p('d')); assert.equal(travel(h, 'redo').present.name, 'd');
  assert.equal(travel(travel(h, 'undo'), 'undo').present.name, 'a');
});
test('a drag is one undo and unchanged edits do not consume history', () => {
  const group = {};
  let h = record(record(createHistory(p('a')), p('b'), group), p('c'), group);
  h = record(h, p('c'));
  assert.equal(h.past.length, 1);
  assert.equal(travel(h, 'undo').present.name, 'a');
  assert.equal(travel(travel(h, 'undo'), 'redo').present.name, 'c');
});
test('import completion updates redo snapshots and failed imports cannot return', () => {
  let h = travel(record(createHistory(p('a')), { ...p('b'), media: { m: { importing: true } } }), 'undo');
  h = amend(h, p => p.media.m ? { ...p, media: { m: { importing: false } } } : p);
  assert.equal(travel(h, 'redo').present.media.m.importing, false);
  h = amend(h, p => ({ ...p, media: {} }));
  assert.deepEqual(travel(h, 'redo').present.media, {});
});
test('history retains at most 100 edits', () => {
  let h = createHistory(p('0'));
  for (let i = 1; i <= 150; i++) h = record(h, p(String(i)));
  assert.equal(h.past.length, 100);
  assert.equal(h.past[0].name, '50');
});
