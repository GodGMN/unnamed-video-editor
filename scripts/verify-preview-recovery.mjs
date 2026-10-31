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

  await page.evaluate(async () => {
    const { loadProject, saveProject } = await import('/src/editor/storage.ts');
    const p = await loadProject();
    for (const t of p.tracks) for (const c of t.clips) { c.fadeIn = 1.123; c.fadeOut = 0.7; }
    await saveProject(p);
    const { clearPreviewCache } = await import('/src/media/files.ts');
    await clearPreviewCache();
    const { setLocale } = await import('/src/i18n/core.ts'); setLocale('es');
  });
  await page.reload();
  await page.locator('.project-home').waitFor();
  await page.locator('.home-resume button').first().click();
  await page.waitForFunction(() => [...document.querySelectorAll('.audio-wave > span')].some(s => parseFloat(s.style.height) > 5));
  const geometry = await page.locator('.clip svg[aria-hidden][style] path').evaluateAll(paths => paths.filter(p => p.parentNode.style.position === 'absolute').map(p => ({ d: p.getAttribute('d'), width: p.parentNode.getAttribute('width') })));
  assert.ok(geometry.length > 0);
  for (const p of geometry) assert.match(p.width, /^\d+\.\d$/);
  assert.equal(await item.getByRole('button', {name: 'Relink original', exact:true}).count(), 0);
  const png = await page.evaluate(() => { const c=document.createElement('canvas'); c.width=80; c.height=60; c.getContext('2d').fillRect(0,0,80,60); return c.toDataURL().split(',')[1]; });
  await page.locator('input[type=file][multiple]').setInputFiles({name:'still.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.locator('.media-item').filter({hasText:'still.png'}).locator('img').first().waitFor();
  await page.evaluate(async () => { const { clearPreviewCache }=await import('/src/media/files.ts'); await clearPreviewCache(); window.dispatchEvent(new Event('media-preview-change')); });
  await page.waitForFunction(() => [...document.querySelectorAll('.media-item')].filter(x=>/still.png|sample.mp4/.test(x.textContent)).every(x=>x.querySelector('img')));
  await page.waitForFunction(() => [...document.querySelectorAll('.audio-wave > span')].some(s => parseFloat(s.style.height) > 5));
  await page.screenshot({path:'/tmp/96-regressions.png'});
  assert.deepEqual(errors, []);
  console.log('PASS: cache eviction restores thumbnails and waveform; Spanish SVG widths remain numeric; media actions stay in menu');
} finally { await browser.close(); }
