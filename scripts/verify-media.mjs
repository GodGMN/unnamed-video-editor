import { openEditor } from './browser-helpers.mjs';
// Run with PLAYWRIGHT_MODULE pointing at playwright-core's index.mjs; start Vite on TEST_URL first.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const dir = mkdtempSync(join(tmpdir(), 'editor-import-'));
const file = join(dir, 'sample.mp4');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', file]);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5212');
  await openEditor(page);
  await page.locator('input[aria-label="Import media files"]').setInputFiles(file);
  const item = page.locator('.media-item').filter({ hasText: 'sample.mp4' });
  await item.waitFor();
  assert.match(await item.innerText(), /320×180/);
  await item.locator('img').first().waitFor();
  assert.ok(await item.locator('img').count() > 0, 'Real thumbnail generated');
  const drag = await page.evaluateHandle(() => new DataTransfer());
  await item.dispatchEvent('dragstart', { dataTransfer: drag });
  const track = page.locator('.track[data-track-id="V1"]');
  await track.dispatchEvent('drop', { dataTransfer: drag, clientX: 400 });
  await page.getByRole('button', { name: /Video: sample.mp4/ }).waitFor();
  const media = await page.evaluate(async () => {
    const { loadProject } = await import('/src/editor/storage.ts');
    for (let i = 0; i < 30; i++) {
      const p = await loadProject();
      if (p && Object.values(p.media).some((m) => m.name === 'sample.mp4') && p.tracks.some((t) => t.kind === 'video' && t.clips.some((c) => p.media[c.mediaId].name === 'sample.mp4'))) return p;
      await new Promise((r) => setTimeout(r, 100));
    }
  });
  assert.ok(media, 'Imported source and timeline clip saved');
  const imported = Object.values(media.media).find((m) => m.name === 'sample.mp4');
  assert.equal(imported.decodable, true);
  const videoClip = media.tracks.filter((t) => t.kind === 'video').flatMap((t) => t.clips).find((c) => c.mediaId === imported.id);
  assert.ok(media.tracks.filter((t) => t.kind === 'audio').flatMap((t) => t.clips).some((c) => c.linkId === videoClip.linkId && c.start === videoClip.start), 'Linked audio stays aligned');
  assert.ok(Math.abs(imported.duration - 3) < 0.1);
  const stored = await page.evaluate(async (id) => {
    const { readMediaFile, readPreview } = await import('/src/media/files.ts');
    const f = await readMediaFile(id); const p = await readPreview(id);
    return { size: f.size, thumbnails: p.thumbnails.length, peak: Math.max(...p.peaks) };
  }, imported.id);
  assert.equal(stored.size, imported.size);
  assert.ok(stored.thumbnails > 0 && stored.peak > 0.01);
  await page.reload();
  await openEditor(page);
  await page.getByRole('button', { name: /Video: sample.mp4/ }).waitFor();
  const restored = await page.evaluate(async (id) => {
    const { readMediaFile } = await import('/src/media/files.ts');
    const file = await readMediaFile(id);
    if (!file) return null;
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    try {
      video.src = url;
      await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
      return { size: file.size, width: video.videoWidth, height: video.videoHeight };
    } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
  }, imported.id);
  assert.deepEqual(restored, { size: imported.size, width: 320, height: 180 }, 'Reload restores decodable source bytes');
  assert.doesNotMatch(await page.locator('.media-item').filter({ hasText: 'sample.mp4' }).innerText(), /Reconnect needed/);
  await page.locator('input[aria-label="Import media files"]').setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a movie') });
  await page.getByRole('status').filter({ hasText: 'broken.mp4' }).waitFor();
  await page.locator('.media-item').filter({ hasText: 'sample.mp4' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: process.env.SCREENSHOT_PATH ?? '/tmp/editor-media-check/import.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', metadata: imported, stored, checks: ['real import', 'metadata', 'thumbnail', 'waveform', 'timeline drop', 'linked audio', 'reload', 'corrupt-file error'] }, null, 2));
} finally { await browser.close(); }
