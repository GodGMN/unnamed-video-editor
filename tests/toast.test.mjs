import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearErrors, dismissError, getErrorToasts, pushError, reportError, subscribeToasts } from '../src/toast/store.ts';

test('errors stack newest first, dedupe by content and keep the newest four', () => {
  clearErrors();
  const ids = ['A', 'B', 'C', 'D', 'E'].map((title) => pushError({ title }));
  assert.deepEqual(getErrorToasts().map((toast) => toast.title), ['E', 'D', 'C', 'B']);
  assert.equal(getErrorToasts().length, 4);
  assert.ok(!getErrorToasts().some((toast) => toast.id === ids[0]));

  const again = pushError({ title: 'C' });
  assert.equal(again, ids[2]);
  assert.equal(getErrorToasts()[2].title, 'C');

  dismissError(ids[2]);
  assert.deepEqual(getErrorToasts().map((toast) => toast.title), ['E', 'D', 'B']);
  clearErrors();
});

test('reportError turns a caught value into the detail line', () => {
  clearErrors();
  const id = reportError('Import failed', new Error('bad file'));
  const [toast] = getErrorToasts();
  assert.equal(toast.id, id);
  assert.equal(toast.title, 'Import failed');
  assert.equal(toast.message, 'bad file');

  reportError('Same text', 'Same text');
  assert.equal(getErrorToasts()[0].message, undefined);
  clearErrors();
});

test('subscribers are notified and can unsubscribe', () => {
  clearErrors();
  let calls = 0;
  const off = subscribeToasts(() => calls++);
  pushError({ title: 'x' });
  dismissError(getErrorToasts()[0].id);
  off();
  pushError({ title: 'y' });
  assert.equal(calls, 2);
  clearErrors();
});
