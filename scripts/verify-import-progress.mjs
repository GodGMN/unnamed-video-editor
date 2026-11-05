import { openEditor } from './browser-helpers.mjs';
// Imports a source bigger than one stored part and checks the progress shown while it imports,
// then that the parts read back as the whole file after a reload.
// Run with PLAYWRIGHT_MODULE pointing at playwright-core's index.mjs; start Vite on TEST_URL first.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const file = process.env.BIG_FILE ?? join(mkdtempSync(join(tmpdir(), 'editor-progress-')), 'big.mp4');
if (!existsSync(file)) execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '600', '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '1500k', '-c:a', 'aac', '-shortest', '-y', file]);
const name = file.split('/').pop();
const shots = process.env.SHOTS ?? tmpdir();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5212');
  await openEditor(page);
  await page.locator('input[aria-label="Import media files"]').setInputFiles(file);
  const item = page.locator('.media-item').filter({ hasText: name });
  const detail = item.locator('.import-detail');
  const seen = new Map();
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    if (!await item.evaluate((el) => el.classList.contains('importing')).catch(() => true)) break;
    const text = await detail.innerText({ timeout: 500 }).catch(() => null);
    const step = text?.match(/Step (\d) of 3/)?.[1];
    // Keep each step's latest sample until one also estimates the time left.
    if (step && !/left/.test(seen.get(step) ?? '')) {
      seen.set(step, text);
      await page.locator('.panel.media').screenshot({ path: join(shots, `import-progress-step${step}.png`) });
    }
    await page.waitForTimeout(100);
  }
  console.log([...seen.entries()]);
  assert.ok(seen.has('1') && /Saving to browser · \d+\s?%/.test(seen.get('1')), 'Storing step shows a percentage');
  assert.ok(seen.has('3') && /Reading audio · \d+\s?%/.test(seen.get('3')), 'Waveform step shows a percentage');
  assert.equal(await item.locator('.import-bar').count(), 0, 'Bar goes once imported');
  const stored = await page.evaluate(async (id) => {
    const { readMediaFile } = await import('/src/media/files.ts');
    const { sourceKind } = await import('/src/media/links.ts');
    return { kind: await sourceKind(id) };
  }, await page.evaluate(async (n) => { const { loadProject } = await import('/src/editor/storage.ts'); const p = await loadProject(); return Object.values(p.media).find((m) => m.name === n).id; }, name));
  assert.equal(stored.kind, 'stored');
  assert.ok(await page.evaluate(async (n) => {
    const { loadProject } = await import('/src/editor/storage.ts');
    for (let i = 0; i < 100; i++) {
      const m = Object.values((await loadProject())?.media ?? {}).find((m) => m.name === n);
      if (m && !m.importing) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
  }, name), 'Finished import saved');
  await page.reload();
  await openEditor(page);
  await page.locator('.media-item[data-source="ready"]').filter({ hasText: name }).waitFor().catch(async (error) => {
    console.log(await page.evaluate(async () => {
      const { mediaTransaction } = await import('/src/media/links.ts');
      const keys = await mediaTransaction('sources', 'readonly', s => s.getAllKeys());
      return { keys, items: [...document.querySelectorAll('.media-item')].map(e => [e.dataset.source, e.className, e.innerText]) };
    }));
    throw error;
  });
  const size = await page.evaluate(async (n) => {
    const { loadProject } = await import('/src/editor/storage.ts');
    const { readMediaFile } = await import('/src/media/files.ts');
    const p = await loadProject();
    const f = await readMediaFile(Object.values(p.media).find((m) => m.name === n).id);
    const tail = new Uint8Array(await f.slice(f.size - 16).arrayBuffer());
    return { size: f.size, tail: Array.from(tail) };
  }, name);
  assert.equal(size.size, statSync(file).size, 'Parts read back as the whole file after reload');
  await page.locator('.media-panel, .panel.media').first().screenshot({ path: join(shots, 'import-progress-done.png') });
  assert.deepEqual(errors, []);
  console.log('PASS: import shows step, percentage and progress bar; parts reassemble after reload.');
} finally { await browser.close(); }
