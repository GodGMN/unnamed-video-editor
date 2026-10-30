import { openEditor, ensureSource } from './browser-helpers.mjs';
// Run Vite, then PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs TEST_URL=http://127.0.0.1:5269 node scripts/verify-chroma-key.mjs
// Optional ARTIFACT_DIR keeps the screenshots.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const dir = process.env.ARTIFACT_DIR ?? mkdtempSync(join(tmpdir(), 'chroma-key-'));
mkdirSync(dir, { recursive: true });
const url = process.env.TEST_URL ?? 'http://127.0.0.1:5269';
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y']);
// A red square in front of a green screen, and a backdrop to key it over.
const fg = join(dir, 'greenscreen.mp4'), bg = join(dir, 'backdrop.mp4');
ffmpeg('-f', 'lavfi', '-i', 'color=0x00B140:size=320x180:rate=30:duration=2', '-f', 'lavfi', '-i', 'color=0xE04030:size=100x100:rate=30:duration=2',
  '-filter_complex', '[0:v][1:v]overlay=110:40', fg);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', bg]);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { window.showOpenFilePicker = undefined; });
  await page.goto(url);
  await openEditor(page);
  await page.waitForSelector('canvas[aria-label="Timeline preview"]');

  // Compositor, engine sampling and export renderer, outside the UI.
  const engine = await page.evaluate(async ([fgBytes, bgBytes]) => {
    const { importMedia } = await import('/src/media/import.ts');
    const { PlaybackEngine } = await import('/src/playback/engine.ts');
    const { VIDEO_CLIP_DEFAULTS, NO_KEY, layoutTimeline } = await import('/src/editor/model.ts');
    const { exportSource } = await import('/src/editor/exportSource.ts');
    const fgMedia = await importMedia(new File([new Uint8Array(fgBytes)], 'greenscreen.mp4', { type: 'video/mp4' }));
    const bgMedia = await importMedia(new File([new Uint8Array(bgBytes)], 'backdrop.mp4', { type: 'video/mp4' }));
    const clip = (id, media, extra = {}) => ({ ...VIDEO_CLIP_DEFAULTS, id, mediaId: media.id, start: 0, inS: 0, outS: 2, linkId: null, linked: false, ...extra });
    const key = { ...NO_KEY, enabled: true };
    const keyed = clip('fg', fgMedia, { key });
    const project = { name: 'Key test', output: { width: 320, height: 180, fps: 30 }, media: { [fgMedia.id]: fgMedia, [bgMedia.id]: bgMedia }, tracks: [
      { id: 'V2', name: 'V2', label: '', kind: 'video', hidden: false, magnetic: false, clips: [keyed] },
      { id: 'V1', name: 'V1', label: '', kind: 'video', hidden: false, magnetic: false, clips: [clip('bg', bgMedia)] },
    ] };
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
    const e = new PlaybackEngine(canvas, () => {});
    const px = (x, y, c = canvas) => Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data);
    const wait = async (fn, message) => { const until = performance.now() + 10000; while (!fn()) { if (performance.now() > until) throw Error(message); await new Promise((r) => setTimeout(r, 20)); } };
    const update = (p, transparent) => e.update({ project: p, time: 0.5, playing: false, volume: 0, transparent });
    update(project, false);
    await wait(() => e.entries.get('fg')?.frames?.frame(0.5, false) && e.entries.get('bg')?.frames?.frame(0.5, false), 'decoded frames');
    update(project, false);
    // testsrc2 is not green where the backdrop shows through.
    const over = { corner: px(10, 170), subject: px(160, 90) };
    const alone = { ...project, tracks: [project.tracks[0]] };
    update(alone, true);
    const transparent = { corner: px(10, 170), subject: px(160, 90) };
    update(alone, false);
    const black = px(10, 170);
    const sampled = { backdrop: e.sample('fg', 10, 170), subject: e.sample('fg', 160, 90), outside: e.sample('fg', -50, 90) };
    update({ ...alone, tracks: [{ ...alone.tracks[0], clips: [{ ...keyed, key: { ...key, enabled: false } }] }] }, false);
    const off = px(10, 170);
    e.dispose();

    const prepared = await exportSource(project, layoutTimeline(project)).prepare(320, 180, 48000, new AbortController().signal);
    const out = await prepared.renderFrame({ index: 15, time: 0.5 });
    const exported = { corner: px(10, 170, out), subject: px(160, 90, out) };
    prepared.dispose();
    const preparedAlone = await exportSource(alone, layoutTimeline(alone)).prepare(320, 180, 48000, new AbortController().signal);
    const exportedAlone = px(10, 170, await preparedAlone.renderFrame({ index: 15, time: 0.5 }));
    preparedAlone.dispose();
    return { over, transparent, black, sampled, off, exported, exportedAlone, fgId: fgMedia.id, bgId: bgMedia.id, fgMedia, bgMedia };
  }, [[...readFileSync(fg)], [...readFileSync(bg)]]);

  const isGreen = ([r, g, b]) => g > 150 && r < 40 && b < 90;
  const isRed = ([r, g, b]) => r > 200 && g < 90 && b < 80;
  assert.ok(!isGreen(engine.over.corner), `backdrop shows through the key: ${engine.over.corner}`);
  assert.ok(isRed(engine.over.subject), `subject stays: ${engine.over.subject}`);
  assert.equal(engine.transparent.corner[3], 0, 'keyed area is transparent with the grid on');
  assert.equal(engine.transparent.subject[3], 255, 'subject stays opaque');
  assert.deepEqual(engine.black, [0, 0, 0, 255], 'keyed area over nothing is black with the grid off');
  assert.ok(isGreen(engine.off), `key off shows the green screen: ${engine.off}`);
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  // Decoding shifts the colour a little, so check what it reads as.
  assert.ok(isGreen(rgb(engine.sampled.backdrop)), `eyedropper reads the unkeyed backdrop: ${engine.sampled.backdrop}`);
  assert.ok(isRed(rgb(engine.sampled.subject)), `eyedropper on the subject: ${engine.sampled.subject}`);
  assert.equal(engine.sampled.outside, null, 'eyedropper outside the clip');
  assert.ok(!isGreen(engine.exported.corner) && isRed(engine.exported.subject), `export keys too: ${JSON.stringify(engine.exported)}`);
  assert.deepEqual(engine.exportedAlone.slice(0, 3), [0, 0, 0], 'MP4 export flattens transparency onto black');

  // The UI: pick the key colour from the preview, then look at it with and without the grid.
  await page.evaluate(async ({ fgMedia, bgMedia }) => {
    const { VIDEO_CLIP_DEFAULTS } = await import('/src/editor/model.ts');
    const { saveProject } = await import('/src/editor/storage.ts');
    const { seedProject } = await import('/src/editor/seed.ts');
    const p = seedProject();
    // The editor opens with the playhead at 12.4 s.
    const clip = (id, m) => ({ ...VIDEO_CLIP_DEFAULTS, id, mediaId: m.id, start: 11.5, inS: 0, outS: 2, linkId: null, linked: false });
    p.output = { width: 1920, height: 1080, fps: 30 };
    p.media = { [fgMedia.id]: fgMedia, [bgMedia.id]: bgMedia };
    p.tracks = [
      { id: 'V2', name: 'V2', label: 'Key', kind: 'video', hidden: false, magnetic: false, clips: [clip('fg', fgMedia)] },
      { id: 'V1', name: 'V1', label: 'Main', kind: 'video', hidden: false, magnetic: false, clips: [clip('bg', bgMedia)] },
      { id: 'A1', name: 'A1', label: 'Audio', kind: 'audio', muted: false, clips: [] },
    ];
    await saveProject(p);
  }, engine);
  await page.reload();
  await openEditor(page);
  for (const [name, path] of [['greenscreen.mp4', fg], ['backdrop.mp4', bg]]) {
    await ensureSource(page, name, path);
  }
  const stage = page.locator('canvas[aria-label="Timeline preview"]');
  await stage.waitFor();
  // Select the keyed clip on V2.
  await page.locator('button.clip', { hasText: 'greenscreen' }).click();
  await page.getByRole('button', { name: 'Pick' }).click();
  const box = await stage.boundingBox();
  const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  await page.waitForTimeout(800);
  const corner = at(0.08, 0.85);
  await page.mouse.move(corner.x, corner.y);
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(dir, '1-picking.png') });
  const loupe = await page.locator('.key-loupe').textContent();
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(500);
  const hex = await page.getByRole('textbox', { name: 'Hex color' }).inputValue();
  const on = await page.getByRole('button', { name: 'On', exact: true }).count();
  await page.screenshot({ path: join(dir, '2-keyed.png') });
  await page.getByRole('button', { name: 'Hide track V1' }).click();
  await page.getByRole('button', { name: 'Transparency grid' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(dir, '3-grid.png') });
  assert.equal(loupe?.trim(), engine.sampled.backdrop, 'loupe shows the backdrop colour');
  assert.equal(hex, loupe.trim(), 'the picked colour becomes the key colour');
  assert.equal(on, 1, 'picking turns the key on');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ...engine, loupe, hex, screenshots: dir }, null, 1));
} finally {
  await browser.close();
}
