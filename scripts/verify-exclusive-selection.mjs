// Run Vite, then TEST_URL=http://127.0.0.1:5288 node scripts/verify-exclusive-selection.mjs.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { openEditor } from './browser-helpers.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const artifacts = process.env.ARTIFACT_DIR ?? '/tmp/task98-evidence';
mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5288');
  await page.evaluate(async () => {
    const { seedProject } = await import('/src/editor/seed.ts');
    const { saveProject } = await import('/src/editor/storage.ts');
    await saveProject(seedProject());
  });
  await page.reload();
  await openEditor(page);
  const clip = page.locator('button.clip').first();
  const props = page.locator('.props');
  await clip.click({ position: { x: 40, y: 16 } });
  assert.equal(await clip.getAttribute('aria-pressed'), 'true');
  await props.getByRole('textbox', { name: 'Rotation value', exact: true }).waitFor();
  await page.locator('.media-item').filter({ hasText: 'drone_coast.mp4' }).click();
  await props.locator('.info-list').waitFor();
  assert.equal(await page.locator('button.clip[aria-pressed=true], .audio-clip.selected, .text-clip[aria-pressed=true]').count(), 0);
  assert.equal(await props.getByRole('textbox', { name: 'Rotation value', exact: true }).count(), 0);
  assert.match(await props.innerText(), /drone_coast.mp4/);
  assert.match(await props.innerText(), /3840×2160/);
  await page.screenshot({ path: `${artifacts}/media-selected.png` });
  await clip.click({ position: { x: 40, y: 16 } });
  await props.getByRole('textbox', { name: 'Rotation value', exact: true }).waitFor();
  assert.equal(await page.locator('.media-item.active').count(), 0);
  assert.equal(await clip.getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: `${artifacts}/timeline-selected.png` });
  console.log('PASS: timeline → media clears timeline selection and shows source metadata; media → timeline restores clip controls and clears media highlight.');
} finally { await browser.close(); }
