// Run against Vite with TEST_URL and PLAYWRIGHT_MODULE; uses an isolated browser profile.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { openEditor } from './browser-helpers.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const artifacts = process.env.ARTIFACT_DIR ?? '/tmp/task99-evidence';
mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.TEST_URL ?? 'http://localhost:5199');
  await page.locator('.project-home').waitFor();
  const pixels = await page.evaluate(async () => {
    const { importMedia } = await import('/src/media/import.ts');
    const { seedProject } = await import('/src/editor/seed.ts');
    const { saveProject } = await import('/src/editor/storage.ts');
    const { VIDEO_CLIP_DEFAULTS, layoutTimeline } = await import('/src/editor/model.ts');
    const { renderFrame, sourcePoint } = await import('/src/playback/compositor.ts');
    const { exportSource } = await import('/src/editor/exportSource.ts');
    const source = document.createElement('canvas'); source.width = 200; source.height = 100;
    source.getContext('2d').fillStyle = '#ff0000'; source.getContext('2d').fillRect(0, 0, 200, 100);
    const blob = await new Promise(resolve => source.toBlob(resolve));
    const media = await importMedia(new File([blob], 'keyframes.png', { type: 'image/png' }));
    const c = { ...VIDEO_CLIP_DEFAULTS, id: 'keyframe-test', mediaId: media.id, start: 0, inS: 0, outS: 3, linkId: null, linked: false };
    const p = seedProject(); p.name = 'Keyframe verification'; p.output = { width: 200, height: 100, fps: 30 }; p.media = { [media.id]: media };
    p.tracks = [{ kind: 'video', id: 'V1', name: 'V1', label: '', hidden: false, magnetic: false, clips: [c] }];
    const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 100;
    const ctx = canvas.getContext('2d');
    const sample = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
    c.keyframes = { cropL: [{ time: 0, value: 0 }, { time: 1, value: 100 }] };
    renderFrame(p, 0.5, ctx, () => source);
    const crop = [sample(25, 50), sample(75, 50)];
    const point = sourcePoint(p, c, 25, 50, 0.5);
    const prepared = await exportSource(p, layoutTimeline(p)).prepare(200, 100, 48000, new AbortController().signal);
    let exported;
    try {
      const image = await prepared.renderFrame({ index: 15, time: 0.5 });
      exported = [[...image.getContext('2d').getImageData(25, 50, 1, 1).data], [...image.getContext('2d').getImageData(75, 50, 1, 1).data]];
    } finally { prepared.dispose(); }
    c.keyframes = { scale: [{ time: 0, value: 100 }, { time: 1, value: 50 }], x: [{ time: 0, value: 0 }, { time: 1, value: 20 }] };
    renderFrame(p, 0.5, ctx, () => source);
    const transform = [sample(20, 50), sample(40, 50), sample(190, 50)];
    delete c.keyframes;
    await saveProject(p);
    return { crop, point, exported, transform };
  });
  assert.deepEqual(pixels.crop, [[0, 0, 0, 255], [255, 0, 0, 255]]);
  assert.equal(pixels.point, null);
  assert.deepEqual(pixels.exported, pixels.crop);
  assert.deepEqual(pixels.transform, [[0, 0, 0, 255], [255, 0, 0, 255], [0, 0, 0, 255]]);
  await page.reload(); await openEditor(page);
  await page.locator('button.clip').click({ position: { x: 30, y: 16 } });
  await page.getByRole('button', { name: 'Previous clip frame', exact: true }).click();
  // Initial UI playhead is outside this short fixture; stepping returns to its last frame.
  while (!(await page.getByRole('button', { name: 'Previous clip frame', exact: true }).isDisabled())) {
    await page.getByRole('button', { name: 'Previous clip frame', exact: true }).click();
  }
  const scale = page.locator('.keyframe-control[data-property="scale"]');
  const base = scale.getByRole('textbox', { name: 'Scale value', exact: true });
  const setBase = async value => { await base.fill(String(value)); await base.press('Enter'); };
  const scaleDiamond = scale.locator('.keyframe-diamond');
  const markers = page.locator('.clip-keyframe-indicator');
  const keyTimes = async () => markers.evaluateAll(els => els.map(el => Number(el.dataset.keyframeTime)).sort((a, b) => a - b));
  const nextFrame = () => page.getByRole('button', { name: 'Next clip frame', exact: true }).click();
  await setBase(100);
  assert.equal(await scaleDiamond.getAttribute('aria-pressed'), 'false');
  assert.equal(await markers.count(), 0);
  await scaleDiamond.click();
  assert.equal(await scaleDiamond.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.keyframe-edit').count(), 0);
  assert.doesNotMatch(await page.locator('.props').innerText(), /Add another keyframe|Preview edit|Saved frame value/);
  assert.deepEqual(await keyTimes(), [0]);
  for (let i = 0; i < 30; i++) await nextFrame();
  await setBase(200);
  assert.equal(await scaleDiamond.getAttribute('aria-pressed'), 'true');
  assert.match(await scale.innerText(), /2 keyframes/);
  assert.deepEqual(await keyTimes(), [0, 1]);
  await scale.getByRole('button', { name: 'Previous Scale keyframe', exact: true }).click();
  for (let i = 0; i < 15; i++) await nextFrame();
  assert.equal(await scale.locator('.keyframe-current').innerText(), '150%');
  await setBase(250);
  assert.equal(await scale.locator('.keyframe-current').innerText(), '250%');
  assert.match(await scale.innerText(), /3 keyframes/);
  await setBase(180);
  assert.match(await scale.innerText(), /3 keyframes/);
  assert.deepEqual(await keyTimes(), [0, 0.5, 1]);
  // A filled diamond immediately removes the key; the next click restores it without a panel.
  await scaleDiamond.click();
  assert.equal(await scaleDiamond.getAttribute('aria-pressed'), 'false');
  assert.equal(await scale.locator('.keyframe-current').innerText(), '150%');
  assert.deepEqual(await keyTimes(), [0, 1]);
  await scaleDiamond.click();
  assert.equal(await scaleDiamond.getAttribute('aria-pressed'), 'true');
  assert.equal(await scale.locator('.keyframe-current').innerText(), '180%');
  assert.deepEqual(await keyTimes(), [0, 0.5, 1]);
  const toggle = page.getByRole('button', { name: 'Toggle keyframe indicators', exact: true });
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(await toggle.evaluate(el => el.previousElementSibling?.getAttribute('aria-label')), 'Snap clips');
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
  assert.equal(await markers.count(), 0);
  assert.equal(await scale.locator('.keyframe-current').innerText(), '180%');
  await toggle.click();
  assert.deepEqual(await keyTimes(), [0, 0.5, 1]);
  assert.equal(await markers.first().evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  await page.screenshot({ path: `${artifacts}/auto-keys-and-timeline.png` });
  await page.locator('.save-status').filter({ hasText: /^Saved$/ }).waitFor();
  const saved = await page.evaluate(async () => (await (await import('/src/editor/storage.ts')).loadProject()).tracks[0].clips[0]);
  assert.deepEqual(saved.keyframes.scale, [{ time: 0, value: 100 }, { time: 0.5, value: 180 }, { time: 1, value: 200 }]);
  await page.reload(); await openEditor(page);
  await page.locator('button.clip').click({ position: { x: 30, y: 16 } });
  assert.deepEqual(await keyTimes(), [0, 0.5, 1]);
  for (let i = 0; i < 3; i++) {
    await scale.getByRole('button', { name: 'Previous Scale keyframe', exact: true }).click();
    await scaleDiamond.click();
  }
  assert.equal(await markers.count(), 0);
  await setBase(50);
  assert.equal(await markers.count(), 0);
  await page.getByRole('tab', { name: 'Crop', exact: true }).click();
  const crop = page.locator('.keyframe-control[data-property="cropL"]');
  await crop.getByRole('spinbutton').fill('20');
  assert.equal(await markers.count(), 0);
  await page.getByRole('tab', { name: 'Transform', exact: true }).click();
  const x = page.locator('.keyframe-control[data-property="x"]');
  const xBase = x.getByRole('spinbutton', { name: 'X position', exact: true });
  await xBase.fill('0');
  await x.locator('.keyframe-diamond').click();
  for (let i = 0; i < 15; i++) await nextFrame();
  await xBase.fill('20');
  for (let i = 0; i < 15; i++) await nextFrame();
  await xBase.fill('45');
  const waitPixel = async (px, red) => page.waitForFunction(({ px, red }) => {
    const canvas = document.querySelector('canvas[aria-label="Timeline preview"]');
    const pixel = canvas.getContext('2d').getImageData(Math.floor(px / 200 * canvas.width), Math.floor(canvas.height / 2), 1, 1).data;
    return pixel[0] === (red ? 255 : 0);
  }, { px, red });
  await waitPixel(110, true);
  await xBase.fill('70');
  await waitPixel(110, false);
  assert.equal(await x.locator('.keyframe-current').innerText(), '70px');
  assert.deepEqual(await keyTimes(), [0, 0.5, 1]);
  // Keys on another property share one timeline marker at the same time.
  await page.locator('.keyframe-control[data-property="y"]').getByRole('spinbutton').fill('5');
  assert.deepEqual(await keyTimes(), [0, 0.5, 1]);
  await page.locator('.save-status').filter({ hasText: /^Saved$/ }).waitFor();
  const exportResult = await page.evaluate(async () => {
    const { loadProject } = await import('/src/editor/storage.ts');
    const { layoutTimeline } = await import('/src/editor/model.ts');
    const { exportSource } = await import('/src/editor/exportSource.ts');
    const p = await loadProject();
    const source = await exportSource(p, layoutTimeline(p)).prepare(200, 100, 48000, new AbortController().signal);
    try {
      const image = await source.renderFrame({ index: 30, time: 1 });
      return { pixel: [...image.getContext('2d').getImageData(110, 50, 1, 1).data], keys: p.tracks[0].clips[0].keyframes };
    } finally { source.dispose(); }
  });
  assert.deepEqual(exportResult.pixel, [0, 0, 0, 255]);
  assert.deepEqual(exportResult.keys.x, [{ time: 0, value: 0 }, { time: 0.5, value: 20 }, { time: 1, value: 70 }]);
  assert.deepEqual(exportResult.keys.y, [{ time: 1, value: 5 }]);
  await x.getByRole('button', { name: 'Previous X position keyframe', exact: true }).click();
  assert.equal(await x.locator('.keyframe-current').innerText(), '20px');
  await nextFrame();
  assert.equal(await x.locator('.keyframe-current').innerText(), '23.33px');
  await waitPixel(110, true);
  // Auto-keying and its timeline marker participate in the main branch's undo history.
  await xBase.fill('40');
  assert.equal(await x.locator('.keyframe-current').innerText(), '40px');
  assert.equal(await markers.count(), 4);
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
  assert.equal(await x.locator('.keyframe-current').innerText(), '23.33px');
  assert.equal(await markers.count(), 3);
  await page.getByRole('button', { name: 'Redo (Ctrl+Shift+Z)', exact: true }).click();
  assert.equal(await x.locator('.keyframe-current').innerText(), '40px');
  assert.equal(await markers.count(), 4);
  assert.deepEqual(errors, []);
  console.log('PASS: first manual key, automatic second/third keys, same-frame updates, direct diamond toggles with no editor/hints, timeline markers/deduplication/toggle, save/reload, live pixels, export and undo/redo.');
} finally { await browser.close(); }
