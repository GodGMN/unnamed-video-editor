import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
// Phone and tablet layouts: import, scroll to scrub, trim, hold to move, pinch to zoom, split, sheets.
const dir = process.env.SCREENSHOTS ?? '/tmp/editor-mobile-check';
mkdirSync(dir, { recursive: true });
const clip = (name, src, tone) => {
  const file = `${dir}/${name}`;
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `${src}=size=640x360:rate=30`, '-f', 'lavfi', '-i', `sine=frequency=${tone}:sample_rate=48000`, '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', file]);
  return file;
};
const files = [clip('beach.mp4', 'testsrc2', 440), clip('city.mp4', 'smptehdbars', 660)];
const song = `${dir}/song.mp3`;
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000', '-t', '6', '-c:a', 'libmp3lame', '-y', song]);

const url = process.env.TEST_URL ?? 'http://127.0.0.1:5288';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [];
async function open(viewport) {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  return page;
}
try {
  const page = await open({ width: 390, height: 844 });
  await page.locator('.editor.phone').waitFor();
  const lanes = page.locator('.ptl-lane.main .ptl-clip');
  await page.getByRole('button', { name: 'Add media', exact: true }).click();
  await page.locator('input[aria-label="Import media files"]').setInputFiles(files);
  await lanes.nth(1).waitFor();
  await page.waitForFunction(() => !document.querySelector('.ptl-clip.importing'));

  // Scrolling the tracks moves the playhead.
  await page.locator('.ptl-scroll').evaluate((el) => { el.scrollLeft = 80; });
  await page.waitForFunction(() => document.querySelector('.transport-time')?.textContent?.startsWith('00:02.00'));

  // Tap selects and swaps the tool bar; Split cuts at the playhead.
  await lanes.first().click();
  await page.locator('.phone-context').filter({ hasText: 'beach' }).waitFor();
  await page.locator('.phone-tool', { hasText: 'Split' }).click();
  assert.equal(await lanes.count(), 3);
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
  assert.equal(await lanes.count(), 2);

  // Dragging the end handle trims.
  await lanes.first().click();
  const w0 = (await lanes.first().boundingBox()).width;
  const edge = await page.locator('.ptl-edge.out').boundingBox();
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down(); await page.mouse.move(edge.x - 30, edge.y + edge.height / 2, { steps: 5 }); await page.mouse.up();
  assert.ok((await lanes.first().boundingBox()).width < w0 - 20, 'trim shortens the clip');

  // Holding a clip, then dragging, moves it.
  const cdp = await page.context().newCDPSession(page);
  const b = await lanes.nth(1).boundingBox();
  const at = (x) => [{ x, y: b.y + b.height / 2, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(b.x + 20) });
  await page.waitForTimeout(500);
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(b.x + 20 + i * 8) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok((await lanes.nth(1).boundingBox()).x > b.x + 30, 'hold and drag moves the clip');

  // Pinching zooms.
  const scroll = await page.locator('.ptl-scroll').boundingBox();
  const cx = scroll.x + scroll.width / 2, cy = scroll.y + 100;
  const wide = (await page.locator('.ptl-lane.main').boundingBox()).width;
  const pinch = (d) => [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pinch(40) });
  for (let d = 50; d <= 100; d += 10) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pinch(d) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok((await page.locator('.ptl-lane.main').boundingBox()).width > wide * 2, 'pinch zooms in');

  // Clip settings open as a sheet with the preview still in view.
  await page.locator('.phone-tool', { hasText: 'Transform' }).click();
  await page.getByRole('tab', { name: 'Transform', exact: true, selected: true }).waitFor();
  assert.ok(await page.locator('.stage canvas').isVisible());
  await page.screenshot({ path: `${dir}/phone-transform.png` });
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  // Music goes on an audio track that's free at the playhead.
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await page.locator('.phone-tool', { hasText: 'Audio' }).click();
  await page.locator('input[aria-label="Import media files"]').setInputFiles(song);
  await page.locator('.media-tile:not(.import)').first().click();
  await page.getByRole('button', { name: 'Add at playhead', exact: true }).click();
  await page.locator('.ptl-lane.audio .ptl-clip', { hasText: 'song' }).waitFor();
  assert.equal(await page.locator('.ptl-lane.audio').count(), 2, 'music gets its own lane instead of covering clip audio');

  // Picking media in order appends it to the main track.
  await page.locator('.ptl-add').click();
  await page.locator('.media-tile:not(.import)').nth(1).click();
  await page.locator('.media-tile:not(.import)').nth(0).click();
  await page.getByRole('button', { name: 'Add 2 to timeline', exact: true }).click();
  assert.equal(await lanes.count(), 4);
  await page.screenshot({ path: `${dir}/phone-edit.png` });

  const tablet = await open({ width: 1024, height: 768 });
  await tablet.locator('.editor.tablet').waitFor();
  await tablet.getByRole('button', { name: 'Library', exact: true }).click();
  await tablet.locator('input[aria-label="Import media files"]').setInputFiles(files[0]);
  await tablet.getByRole('button', { name: 'Add beach.mp4 to the timeline', exact: true }).click();
  await tablet.locator('.track[data-track-id] .clip').first().waitFor();
  await tablet.screenshot({ path: `${dir}/tablet.png` });

  assert.deepEqual(errors, []);
  console.log(`PASS: phone and tablet layouts. Screenshots in ${dir}`);
} finally { await browser.close(); }
