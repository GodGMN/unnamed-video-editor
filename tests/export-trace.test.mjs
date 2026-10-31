import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExportTrace } from '../src/export/trace.ts';

test('steps end each other and the report shows timings and the running step', () => {
  let now = 1000;
  const logged = [];
  const trace = new ExportTrace(() => now, (line) => logged.push(line));
  trace.step('Reading files', 'a.mkv', '1 / 1');
  now += 500;
  trace.step('Decoding audio', 'a.mkv');
  now += 2000;
  trace.progress('42 / 132 s');
  now += 20000;

  assert.equal(trace.steps[0].endedAt, 500);
  assert.equal(trace.current.label, 'Decoding audio');
  assert.equal(trace.current.progress, '42 / 132 s');
  assert.equal(trace.idleSeconds(), 20);
  assert.deepEqual(logged, ['[export] +0.0s Reading files · a.mkv · 1 / 1', '[export] +0.5s Decoding audio · a.mkv']);

  const report = trace.report({ browser: 'test' }).split('\n');
  assert.equal(report[0], 'browser: test');
  assert.equal(report.at(-2), '  +0.0s Reading files · a.mkv · 1 / 1 (0.5s)');
  assert.equal(report.at(-1), '  +0.5s Decoding audio · a.mkv · 42 / 132 s (running 22.0s, idle 20.0s)');

  trace.end();
  assert.equal(trace.current, null);
});
