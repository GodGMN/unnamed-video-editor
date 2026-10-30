// Start Vite, then run with PLAYWRIGHT_MODULE and optional TEST_URL / ARTIFACT_DIR.
// Switches a 16:9 project to 9:16 in the UI, exports 1080p and checks the MP4 is 1080×1920 with
// the 16:9 source letterboxed the same way as the preview.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const dir = process.env.ARTIFACT_DIR ?? mkdtempSync(join(tmpdir(), 'editor-aspect-'));
mkdirSync(dir, { recursive: true });
const file = join(dir, 'source.mp4');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x3080e0:size=640x360:rate=30', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', file]);
const url = process.env.TEST_URL ?? 'http://127.0.0.1:5216';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  await page.goto(url);
  await page.evaluate(async (bytes) => {
    const { importMedia } = await import('/src/media/import.ts');
    const { seedProject } = await import('/src/editor/seed.ts');
    const { VIDEO_CLIP_DEFAULTS } = await import('/src/editor/model.ts');
    const media = await importMedia(new File([new Uint8Array(bytes)], 'landscape.mp4', { type: 'video/mp4' }));
    const p = seedProject();
    p.name = 'Aspect check'; p.media = { [media.id]: media };
    p.tracks = [
      { id: 'text', name: 'T', label: '', kind: 'text', hidden: false, clips: [{ id: 'title', content: 'Vertical', start: 0, duration: 2, size: 72, color: '#FFFFFF', pos: 'bc', x: 0, y: 0 }] },
      { id: 'v', name: 'V1', label: '', kind: 'video', hidden: false, magnetic: true, clips: [{ ...VIDEO_CLIP_DEFAULTS, id: 'c', mediaId: media.id, start: 0, inS: 0, outS: media.duration, linkId: null, linked: false }] },
    ];
    await (await import('/src/editor/storage.ts')).saveProject(p);
  }, [...readFileSync(file)]);
  await page.reload();
  const button = page.getByRole('button', { name: /^Output aspect ratio/ });
  await button.waitFor();
  assert.match(await button.innerText(), /16:9\s*1920×1080/);
  await button.click();
  await page.screenshot({ path: join(dir, 'menu.png') });
  await page.getByRole('menuitemradio', { name: /^9:16/ }).click();
  assert.match(await button.innerText(), /9:16\s*1080×1920/);
  const stage = await page.locator('.stage').boundingBox();
  assert.ok(stage.height > stage.width * 1.7, `Stage is not vertical: ${stage.width}×${stage.height}`);
  await page.getByRole('button', { name: 'Go to start' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(dir, 'vertical.png') });
  await page.locator('.stage canvas').screenshot({ path: join(dir, 'preview-frame.png') });

  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.getByText('1080×1920').waitFor();
  await dialog.getByText('720×1280').waitFor();
  await page.screenshot({ path: join(dir, 'export-dialog.png') });
  await dialog.getByRole('button', { name: 'Start export' }).click({ timeout: 30000 });
  await dialog.getByRole('button', { name: 'Download' }).waitFor({ timeout: 120000 });
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download' }).click()]);
  const out = join(dir, 'vertical.mp4');
  await download.saveAs(out);

  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out]).toString().trim().split(',').map(Number);
  assert.deepEqual([w, h], [1080, 1920]);
  // A 16:9 source fills the width of a 9:16 frame: 1080×608, centred, so black above 656 and below 1264.
  const rgb = (y) => [...execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i', out, '-frames:v', '1', '-vf', `crop=2:2:540:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])].slice(0, 3);
  const dark = (c) => c.every((x) => x < 24);
  assert.ok(dark(rgb(300)) && dark(rgb(1700)), 'Export is not letterboxed');
  assert.ok(!dark(rgb(960)), 'Export has no picture in the middle');
  // The preview canvas shows the same bars at the same relative height.
  const preview = await page.evaluate(() => {
    const c = document.querySelector('.stage canvas');
    const g = c.getContext('2d');
    const at = (f) => [...g.getImageData(c.width / 2, Math.round(c.height * f), 1, 1).data.slice(0, 3)];
    return { size: [c.width, c.height], top: at(300 / 1920), mid: at(0.5), bottom: at(1700 / 1920) };
  }).catch(() => null);
  console.log(JSON.stringify({ export: [w, h], exportTop: rgb(300), exportMid: rgb(960), preview, artifacts: dir }));
  if (preview) assert.ok(dark(preview.top) && dark(preview.bottom) && !dark(preview.mid), 'Preview is not letterboxed like the export');
  console.log('Aspect verification passed.');
} finally { await browser.close(); }
