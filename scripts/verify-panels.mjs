// Run against Vite with TEST_URL and PLAYWRIGHT_MODULE pointing to playwright-core.
// Drags the panel splitters, checks the sizes clamp, persist across a reload, follow the keyboard
// and reset on double-click, and that the preview grows when the timeline shrinks.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openEditor } from './browser-helpers.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const out = process.env.EVIDENCE_DIR ?? '/tmp';
const dir = mkdtempSync(join(tmpdir(), 'panels-'));
const clip = join(dir, 'bars.mp4');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip, '-y']);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5233');
  await page.evaluate(() => localStorage.removeItem('panel-sizes'));
  await openEditor(page);
  await page.locator('input[aria-label="Import media files"]').setInputFiles(clip);
  await page.locator('.media-item[data-source="ready"]').waitFor();
  await page.locator('.media-item').dblclick().catch(() => undefined);
  await page.waitForTimeout(500);

  const box = (selector) => page.locator(selector).first().boundingBox();
  async function drag(name, dx, dy) {
    const b = await page.getByRole('separator', { name }).boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2);
    await page.mouse.move(x + dx, y + dy);
    await page.mouse.up();
  }

  const before = { stage: await box('.stage'), timeline: await box('.timeline'), media: await box('.media'), props: await box('.props') };
  await page.screenshot({ path: join(out, 'panels-before.png') });

  await drag('Resize timeline', 0, 400);
  const timeline = await box('.timeline');
  assert.equal(Math.round(timeline.height), 160, 'the timeline stops at its minimum height');
  await drag('Resize library', -200, 0);
  assert.equal(Math.round((await box('.media')).width), 200, 'the library stops at its minimum width');
  await drag('Resize properties', 40, 0);
  assert.equal(Math.round((await box('.props')).width), Math.round(before.props.width) - 40);
  const after = await box('.stage');
  assert.ok(after.height > before.stage.height + 100, `the preview grows (${before.stage.height} -> ${after.height})`);
  await page.screenshot({ path: join(out, 'panels-after.png') });

  await drag('Resize timeline', 0, -2000);
  const workspace = await box('.workspace');
  assert.ok(workspace.height >= 379, 'the workspace keeps its minimum height');
  await drag('Resize timeline', 0, 2000);

  await page.reload();
  await openEditor(page);
  assert.equal(Math.round((await box('.timeline')).height), 160, 'sizes persist across a reload');
  assert.equal(Math.round((await box('.media')).width), 200);

  const props = page.getByRole('separator', { name: 'Resize properties' });
  const width = (await box('.props')).width;
  await props.focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(Math.round((await box('.props')).width), Math.round(width) + 16, 'arrow keys move the splitter');

  await props.dblclick();
  await page.getByRole('separator', { name: 'Resize timeline' }).dblclick();
  await page.getByRole('separator', { name: 'Resize library' }).dblclick();
  for (const name of ['props', 'timeline', 'media']) {
    const now = await box('.' + name), was = before[name];
    assert.ok(Math.abs(now.width - was.width) < 2 && Math.abs(now.height - was.height) < 2, `double-click resets the ${name} panel`);
  }
  assert.equal(await page.evaluate(() => localStorage.getItem('panel-sizes')), '{}');

  const tablet = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await tablet.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5233');
  await openEditor(tablet);
  assert.equal(await tablet.getByRole('separator', { name: 'Resize library' }).count(), 0, 'no library splitter while the library is a drawer');
  assert.equal(await tablet.locator('.splitter').count(), 2);
  console.log('PASS: drag clamps, preview growth, persistence, keyboard, double-click reset, tablet splitters.');
} finally { await browser.close(); }
