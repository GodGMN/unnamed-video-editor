// Run against Vite with TEST_URL and PLAYWRIGHT_MODULE; uses an isolated browser profile.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { openEditor } from './browser-helpers.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const artifacts = process.env.ARTIFACT_DIR ?? '/tmp/task99-easing-evidence';
mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.TEST_URL ?? 'http://localhost:5199');
  await page.locator('.project-home').waitFor();
  await page.evaluate(async () => {
    const { importMedia } = await import('/src/media/import.ts');
    const { seedProject } = await import('/src/editor/seed.ts');
    const { saveProject } = await import('/src/editor/storage.ts');
    const { VIDEO_CLIP_DEFAULTS } = await import('/src/editor/model.ts');
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
    const g = canvas.getContext('2d'); g.fillStyle = '#ff0000'; g.fillRect(0, 0, 640, 360);
    const media = await importMedia(new File([await new Promise(r => canvas.toBlob(r))], 'easing.png', { type: 'image/png' }));
    const p = seedProject(); p.name = 'Easing verification'; p.output = { width: 640, height: 360, fps: 24 }; p.media = { [media.id]: media };
    p.tracks = [{ kind: 'video', id: 'V1', name: 'V1', label: '', hidden: false, magnetic: false, clips: [{
      ...VIDEO_CLIP_DEFAULTS, id: 'easing-test', mediaId: media.id, start: 0, inS: 0, outS: 4, linkId: null,
      linked: false, fit: 'custom', scale: 50,
      keyframes: { x: [{ time: 0, value: 0 }, { time: 1.5, value: 160 }, { time: 3, value: 0 }] },
    }] }];
    await saveProject(p);
  });
  await page.reload(); await openEditor(page);
  await page.locator('button.clip').click({ position: { x: 30, y: 16 } });
  const x = page.locator('.keyframe-control[data-property="x"]');
  const trigger = x.getByRole('button', { name: /Change X position easing/ });
  const dialog = page.getByRole('dialog', { name: 'X position easing', exact: true });
  const preset = name => dialog.getByRole('radio').filter({ has: page.getByText(name, { exact: true }) });
  for (let i = 0; i < 3; i++) await x.getByRole('button', { name: 'Previous X position keyframe', exact: true }).click();
  for (let i = 0; i < 18; i++) await page.getByRole('button', { name: 'Next clip frame', exact: true }).click();
  assert.equal(await x.locator('.keyframe-current').innerText(), '80px');
  const waitPixel = async red => page.waitForFunction(red => {
    const canvas = document.querySelector('canvas[aria-label="Timeline preview"]');
    return canvas.getContext('2d').getImageData(Math.floor(225 / 640 * canvas.width), Math.floor(canvas.height / 2), 1, 1).data[0] === (red ? 255 : 0);
  }, red);
  await waitPixel(false);
  await trigger.click();
  assert.match(await dialog.innerText(), /Frame 1 → Frame 37/);
  assert.equal(await preset('Linear').getAttribute('aria-checked'), 'true');
  await preset('Ease in').click();
  assert.equal(await x.locator('.keyframe-current').innerText(), '50.46px');
  await waitPixel(true);
  await page.screenshot({ path: `${artifacts}/ease-in.png` });
  await preset('Ease out').click();
  assert.equal(await x.locator('.keyframe-current').innerText(), '109.54px');
  await waitPixel(false);
  await preset('Ease in/out').click();
  assert.equal(await x.locator('.keyframe-current').innerText(), '80px');
  await preset('Ease in').click();
  await dialog.getByRole('button', { name: 'Next interval', exact: true }).click();
  assert.match(await dialog.innerText(), /Frame 37 → Frame 73/);
  assert.equal(await preset('Linear').getAttribute('aria-checked'), 'true');
  await preset('Ease out').click();
  await page.locator('.save-status').filter({ hasText: /^Saved$/ }).waitFor();
  const stored = await page.evaluate(async () => (await (await import('/src/editor/storage.ts')).loadProject()).tracks[0].clips[0]);
  assert.deepEqual(stored.keyframes.x, [{ time: 0, value: 0, easing: 'ease-in' }, { time: 1.5, value: 160, easing: 'ease-out' }, { time: 3, value: 0 }]);
  assert.equal(stored.scale, 50);
  // Export and preview agree at a point where eased motion visibly differs from linear motion.
  const exported = await page.evaluate(async () => {
    const { loadProject } = await import('/src/editor/storage.ts');
    const { layoutTimeline } = await import('/src/editor/model.ts');
    const { exportSource } = await import('/src/editor/exportSource.ts');
    const p = await loadProject();
    const renderer = await exportSource(p, layoutTimeline(p)).prepare(640, 360, 48000, new AbortController().signal);
    try {
      const image = await renderer.renderFrame({ index: 18, time: 0.75 });
      return [...image.getContext('2d').getImageData(225, 180, 1, 1).data];
    } finally { renderer.dispose(); }
  });
  assert.deepEqual(exported, [255, 0, 0, 255]);
  await dialog.getByRole('button', { name: 'Play this interval', exact: true }).click();
  await page.getByRole('button', { name: 'Pause (Space)', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Play (Space)', exact: true }).waitFor();
  assert.match(await page.locator('.clip-frame-counter').innerText(), /Frame 73 \/ 96/);
  assert.match(await dialog.innerText(), /Frame 37 → Frame 73/);
  assert.equal(await x.locator('.keyframe-current').innerText(), '0px');
  await dialog.getByRole('button', { name: 'Play this interval', exact: true }).click();
  await page.getByRole('button', { name: 'Pause (Space)', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Next clip frame', exact: true }).click();
  await page.getByRole('button', { name: 'Play (Space)', exact: true }).waitFor();
  await trigger.click();
  await preset('Ease out').focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await preset('Ease in').getAttribute('aria-checked'), 'true');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
  await page.locator('.save-status').filter({ hasText: /^Saved$/ }).waitFor();
  await page.reload(); await openEditor(page);
  await page.locator('button.clip').click({ position: { x: 30, y: 16 } });
  await trigger.click();
  assert.equal(await preset('Ease in').getAttribute('aria-checked'), 'true');
  await page.screenshot({ path: `${artifacts}/intervals.png` });
  assert.equal(await dialog.evaluate(el => el.getBoundingClientRect().right <= innerWidth && el.getBoundingClientRect().bottom <= innerHeight), true);
  await page.keyboard.press('Escape');
  // Source-time keys survive trimming; hidden intervals cannot play past the visible clip.
  await page.evaluate(async () => {
    const { loadProject, saveProject } = await import('/src/editor/storage.ts');
    const p = await loadProject(), c = p.tracks[0].clips[0];
    c.inS = 2; c.outS = 2.75;
    await saveProject(p);
  });
  await page.reload(); await openEditor(page);
  await x.waitFor();
  assert.equal(await page.locator('.clip-keyframe-indicator').count(), 0);
  await trigger.click();
  assert.match(await dialog.innerText(), /Before clip → After clip/);
  await dialog.getByRole('button', { name: 'Previous interval', exact: true }).click();
  assert.equal(await dialog.getByRole('button', { name: 'Play this interval', exact: true }).isDisabled(), true);
  assert.match(await dialog.innerText(), /outside the trimmed clip/);
  await dialog.getByRole('button', { name: 'Next interval', exact: true }).click();
  await dialog.getByRole('button', { name: 'Play this interval', exact: true }).click();
  await page.getByRole('button', { name: 'Pause (Space)', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Play (Space)', exact: true }).waitFor();
  assert.match(await page.locator('.clip-frame-counter').innerText(), /Frame 18 \/ 18/);
  assert.doesNotMatch(await page.locator('.clip-frame-counter').innerText(), /outside/);
  assert.deepEqual(errors, []);
  console.log('PASS: easing presets, per-interval selection, rendered preview/export pixels, bounded interval playback, seek cancellation, keyboard navigation, focus return, reload, popover fit and trimmed/hidden intervals.');
} finally { await browser.close(); }
