import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newId } from '../src/editor/model.ts';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('generates UUIDs with the native secure-context API', () => {
  assert.match(newId(), uuidV4);
});

test('generates distinct UUIDs when HTTP does not expose randomUUID', (t) => {
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  t.mock.getter(globalThis, 'crypto', () => ({ getRandomValues }));
  const ids = Array.from({ length: 1000 }, () => newId());
  for (const id of ids) assert.match(id, uuidV4);
  assert.equal(new Set(ids).size, ids.length);
});
