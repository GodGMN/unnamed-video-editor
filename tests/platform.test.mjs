import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Loads a fresh copy of the module with a given `navigator`, since the platform is read at import time. */
async function shortcutOn(platform, tag) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { platform, userAgent: '' }, configurable: true });
  try {
    const { shortcut } = await import(`../src/platform.ts?${tag}`);
    return shortcut('K');
  } finally {
    if (saved) Object.defineProperty(globalThis, 'navigator', saved); else delete globalThis.navigator;
  }
}

test('Apple platforms print the Command key', async () => {
  assert.equal(await shortcutOn('MacIntel', 'mac'), '⌘ K');
});

test('everything else prints Ctrl', async () => {
  assert.equal(await shortcutOn('Linux x86_64', 'linux'), 'Ctrl K');
  assert.equal(await shortcutOn('Win32', 'win'), 'Ctrl K');
});
