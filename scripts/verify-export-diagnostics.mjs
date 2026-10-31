import { openEditor, ensureSource } from './browser-helpers.mjs';
// Start Vite, then run with PLAYWRIGHT_MODULE and optional TEST_URL / ARTIFACT_DIR.
// Hangs the audio mix on purpose and checks the export dialog names the stuck step and copies diagnostics.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const dir = process.env.ARTIFACT_DIR ?? mkdtempSync(join(tmpdir(), 'editor-export-diagnostics-'));
mkdirSync(dir, { recursive: true });
const file = join(dir, 'source.mp4');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', file]);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.text().startsWith('[export]')) logs.push(m.text()); });
  await page.addInitScript(() => {
    window.showOpenFilePicker = undefined;
    // Never finish the offline audio render, like the reported hang.
    OfflineAudioContext.prototype.startRendering = () => new Promise(() => {});
  });
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5212');
  await openEditor(page);
  await page.evaluate(async (bytes) => {
    const { importMedia } = await import('/src/media/import.ts');
    const { seedProject } = await import('/src/editor/seed.ts');
    const { VIDEO_CLIP_DEFAULTS, AUDIO_CLIP_DEFAULTS } = await import('/src/editor/model.ts');
    const media = await importMedia(new File([new Uint8Array(bytes)], 'source.mp4', { type: 'video/mp4' }));
    const p = seedProject();
    p.name = 'Export diagnostics'; p.output = { width: 320, height: 180, fps: 30 }; p.media = { [media.id]: media };
    const clip = { ...VIDEO_CLIP_DEFAULTS, id: 'v1', mediaId: media.id, start: 0, inS: 0, outS: 3, linkId: 'l', linked: true };
    p.tracks = [
      { id: 'v', name: 'V1', label: '', kind: 'video', hidden: false, clips: [clip] },
      { id: 'a', name: 'A1', label: '', kind: 'audio', muted: false, clips: [{ ...AUDIO_CLIP_DEFAULTS, id: 'a1', mediaId: media.id, start: 0, inS: 0, outS: 3, linkId: 'l', linked: true }] },
    ];
    await (await import('/src/editor/storage.ts')).saveProject(p);
  }, [...(await import('node:fs')).readFileSync(file)]);
  await page.reload();
  await openEditor(page);
  await ensureSource(page, 'source.mp4', file);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: '720p', exact: false }).click();
  await page.getByRole('button', { name: 'Start export', exact: true }).click();

  await page.getByText('Rendering mix', { exact: false }).first().waitFor({ timeout: 20000 });
  await page.getByText(/No progress for \d+ s/).waitFor({ timeout: 25000 });
  await page.getByText('Stuck on: Rendering mix', { exact: false }).waitFor();
  await page.screenshot({ path: join(dir, 'stalled.png') });

  await page.getByRole('button', { name: 'Copy diagnostics', exact: true }).click();
  await page.getByRole('button', { name: 'Copied', exact: true }).waitFor();
  const report = await page.evaluate(() => navigator.clipboard.readText());
  for (const step of ['Reading files', 'Loading fonts', 'Starting renderer', 'Decoding audio · source.mp4 · 3 / 3 s', 'Rendering mix']) {
    assert.ok(report.includes(step), `diagnostics missing "${step}":\n${report}`);
  }
  assert.match(report, /Rendering mix · 0% \(running [\d.]+s, idle [\d.]+s\)$/);
  assert.match(report, /^browser: /);
  assert.ok(logs.some((l) => l.includes('Decoding audio')), logs.join('\n'));
  assert.ok(logs.some((l) => l.startsWith('[export] no progress for 15s')), logs.join('\n'));

  await page.getByRole('button', { name: 'Cancel export', exact: true }).click();
  await page.getByRole('button', { name: 'Start export', exact: true }).waitFor();
  console.log(JSON.stringify({ result: 'PASS', report, artifacts: dir }, null, 2));
} finally { await browser.close(); }
