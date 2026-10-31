import { projectAction, returnHome } from './browser-helpers.mjs';
// Run with PLAYWRIGHT_MODULE pointing at playwright-core's index.mjs; start Vite on TEST_URL first.
// SCREENSHOTS=<dir> also saves the drop overlay and the project started from dropped media.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const dir = mkdtempSync(join(tmpdir(), 'editor-library-drop-'));
const video = join(dir, 'beach-trip.mp4'), still = join(dir, 'logo.png'), notes = join(dir, 'notes.pdf');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', video]);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=orange:size=320x320', '-frames:v', '1', '-y', still]);
writeFileSync(notes, '%PDF-1.4');
const shots = process.env.SCREENSHOTS;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5212');
  await page.locator('.project-home').waitFor();
  await page.evaluate(() => { const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.id = 'drop-source'; input.hidden = true; document.body.append(input); });
  /** Drops `files` on the project library the way the desktop hands them over. */
  async function drop(files, { overlay = false } = {}) {
    await page.locator('#drop-source').setInputFiles(files);
    const data = await page.evaluateHandle(() => { const dt = new DataTransfer(); for (const f of document.querySelector('#drop-source').files) dt.items.add(f); return dt; });
    const home = page.locator('.project-home');
    await home.dispatchEvent('dragenter', { dataTransfer: data });
    await home.dispatchEvent('dragover', { dataTransfer: data });
    await page.locator('.home-drop').filter({ hasText: 'Drop to open or start a project' }).waitFor();
    if (overlay && shots) await page.screenshot({ path: join(shots, 'overlay.png') });
    await home.dispatchEvent('drop', { dataTransfer: data });
    assert.equal(await page.locator('.home-drop').count(), 0, 'The overlay goes once the files are dropped');
  }
  const rows = (n) => page.waitForFunction((n) => document.querySelectorAll('.home-project-row').length === n, n);

  // Media starts a new project named after the first file, with the media on the timeline.
  await drop([video, still, notes], { overlay: true });
  await page.getByRole('button', { name: 'Projects', exact: true }).waitFor();
  await page.getByText('Not a project or media file: notes.pdf').waitFor();
  await page.getByRole('button', { name: /^Video: beach-trip\.mp4, 4\.0 seconds, linked to audio$/ }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: /^image: logo\.png, 5\.0 seconds$/ }).waitFor({ timeout: 60000 });
  await page.locator('.clip').filter({ hasText: 'beach-trip.mp4' }).locator('img').first().waitFor({ timeout: 60000 });
  assert.match(await page.locator('.editor').innerText(), /beach-trip/, 'The project is named after the first file');
  if (shots) await page.screenshot({ path: join(shots, 'new-project.png') });
  await returnHome(page);
  await rows(1);

  // One project file opens; several are all added to the library without opening.
  const download = page.waitForEvent('download');
  await projectAction(page, 'beach-trip', 'Download project');
  const json = join(dir, 'beach-trip.json');
  await (await download).saveAs(json);
  await drop([json]);
  await page.getByRole('button', { name: 'Projects', exact: true }).waitFor();
  await returnHome(page);
  await rows(2);
  await drop([json, json]);
  await rows(4);
  assert.equal(await page.locator('.editor').count(), 0, 'Several project files stay in the library');

  // A project file with media opens the project and skips the media.
  await drop([json, video]);
  await page.getByRole('button', { name: 'Projects', exact: true }).waitFor();
  await page.getByText('Media isn’t added when you drop a project file with it: beach-trip.mp4').waitFor();
  await returnHome(page);
  await rows(5);
  assert.deepEqual(errors, []);
  console.log('Library drop verified');
} finally {
  await browser.close();
}
