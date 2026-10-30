// Run with PLAYWRIGHT_MODULE pointing at playwright-core's index.mjs; start Vite on TEST_URL first.
// SCREENSHOTS=<dir> also saves the timeline while the file imports and once it has.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const dir = mkdtempSync(join(tmpdir(), 'editor-drop-'));
const file = join(dir, 'long-take.mp4');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', file]);
const shots = process.env.SCREENSHOTS;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${process.env.TEST_URL ?? 'http://127.0.0.1:5212'}/?reset`);
  await page.locator('.track .clip').first().waitFor();
  // Slow the page down so the import is still running when the timeline is checked.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 12 });

  // A DataTransfer holding a real file, as the desktop would hand it over.
  await page.evaluate(() => { const input = document.createElement('input'); input.type = 'file'; input.id = 'drop-source'; input.hidden = true; document.body.append(input); });
  await page.locator('#drop-source').setInputFiles(file);
  const drop = await page.evaluateHandle(() => { const dt = new DataTransfer(); dt.items.add(document.querySelector('#drop-source').files[0]); return dt; });
  const v1 = page.locator('.track[data-track-id]').filter({ has: page.locator('.clip') }).first();
  const box = await v1.boundingBox();
  await v1.dispatchEvent('dragover', { dataTransfer: drop, clientX: box.x + 5, clientY: box.y + 20 });
  await page.locator('.drop-ghost').filter({ hasText: 'Import file' }).waitFor();
  await v1.dispatchEvent('drop', { dataTransfer: drop, clientX: box.x + 5, clientY: box.y + 20 });

  const clip = page.getByRole('button', { name: /Video: long-take\.mp4, 12\.0 seconds, linked to audio, importing/ });
  await clip.waitFor({ timeout: 10000 });
  assert.equal(await page.locator('.drop-ghost').count(), 0, 'The ghost goes once the file is dropped');
  assert.match(await page.locator('.media-item.importing').innerText(), /Importing…/);
  assert.ok(await page.getByRole('button', { name: /Audio: long-take\.mp4.*importing/ }).count() === 1, 'Linked audio is reserved too');
  const pps = await page.evaluate(() => {
    const ticks = [...document.querySelectorAll('.tick')].map((t) => parseFloat(t.style.left));
    return ticks[1] - ticks[0];
  });
  const width = (await clip.boundingBox()).width;
  assert.ok(Math.abs(width + 3 - 12 * pps) < 2, `Clip is reserved at its real length (${width}px at ${pps}px/s)`);
  if (shots) await page.screenshot({ path: join(shots, 'importing.png') });

  await page.getByRole('button', { name: /Video: long-take\.mp4, 12\.0 seconds, linked to audio$/ }).waitFor({ timeout: 120000 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.locator('.media-item:not(.importing)').filter({ hasText: 'long-take.mp4' }).waitFor();
  await page.locator('.clip').filter({ hasText: 'long-take.mp4' }).locator('img').first().waitFor();
  if (shots) await page.screenshot({ path: join(shots, 'imported.png') });
  assert.deepEqual(errors, []);
  console.log('Timeline file drop verified');
} finally {
  await browser.close();
}
