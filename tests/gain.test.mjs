import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAIN_MAX_DB, GAIN_MIN_DB, dbToFader, dbToGain, faderToDb, gainToDb } from '../src/editor/model.ts';

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('dB converts to an amplitude gain, with the floor as silence', () => {
  close(dbToGain(0), 1);
  close(dbToGain(-6), 0.501);
  close(dbToGain(12), 3.981);
  assert.equal(dbToGain(GAIN_MIN_DB), 0);
  assert.deepEqual([gainToDb(0.5), gainToDb(2), gainToDb(0), gainToDb(100)], [-6, 6, GAIN_MIN_DB, GAIN_MAX_DB]);
});

test('the fader puts 0 dB three quarters up and round-trips', () => {
  assert.deepEqual([dbToFader(GAIN_MIN_DB), dbToFader(0), dbToFader(GAIN_MAX_DB)], [0, 0.75, 1]);
  for (const db of [-60, -45.5, -24, -12, -3.2, 0, 4.8, 12]) close(faderToDb(dbToFader(db)), db, 0.051);
  for (let pos = 0; pos < 1; pos += 0.05) assert.ok(faderToDb(pos + 0.05) > faderToDb(pos), 'monotonic');
  assert.deepEqual([faderToDb(-1), faderToDb(2)], [GAIN_MIN_DB, GAIN_MAX_DB]);
});
