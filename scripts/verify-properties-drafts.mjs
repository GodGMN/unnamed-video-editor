// Run Vite, then PLAYWRIGHT_MODULE=/tmp/pw11/node_modules/playwright-core/index.mjs TEST_URL=http://127.0.0.1:5270 node scripts/verify-properties-drafts.mjs
// Set SELECTION_WITHOUT_BLUR=0 to exercise the full editor's timeline instead of the focus-retaining fixture.
// ARTIFACT_DIR controls screenshot output; each run uses an isolated browser profile.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openEditor } from './browser-helpers.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const artifacts = process.env.ARTIFACT_DIR ?? '/tmp/task50-evidence';
mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5270');
  await page.locator('.project-home').waitFor();
  await page.evaluate(async () => {
    const { seedProject } = await import('/src/editor/seed.ts');
    const { saveProject } = await import('/src/editor/storage.ts');
    const p = seedProject();
    p.name = 'Properties draft regression';
    p.tracks = p.tracks.filter(t => ['V1', 'A1', 'T1'].includes(t.id));
    for (const t of p.tracks) {
      t.clips = t.clips.slice(0, 2);
      t.clips.forEach((c, i) => {
        c.start = i * 6;
        if (t.kind === 'video') { c.rot = 0; c.x = 0; c.inS = 0; c.outS = 5; }
        if (t.kind === 'audio') { c.gainDb = 0; c.inS = 0; c.outS = 5; }
      });
    }
    const text = p.tracks.find(t => t.kind === 'text');
    text.clips.forEach((c, i) => { c.content = `Draft text ${i + 1}`; c.start = 0; c.duration = 5; c.size = 72; });
    const second = text.clips.pop();
    p.tracks.unshift({ ...text, id: 'T2', clips: [second] });
    await saveProject(p);
  });
  await page.reload();
  await openEditor(page);
  // Selection can change without a DOM blur. Exercise the real panel and editor hook
  // with pointer controls that deliberately retain focus, independently of Timeline's blur guard.
  if (process.env.SELECTION_WITHOUT_BLUR !== '0') {
    await page.evaluate(async () => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const { PropertiesPanel } = await import('/src/components/PropertiesPanel.tsx');
      const { useProject } = await import('/src/editor/useProject.ts');
      const { I18nProvider } = await import('/src/i18n/index.tsx');
      const { loadProject, activeProjectId } = await import('/src/editor/storage.ts');
      const initial = await loadProject(), id = await activeProjectId();
      const h = React.createElement;
      document.querySelector('#root').style.display = 'none';
      const container = document.body.appendChild(document.createElement('div'));
      container.style.cssText = 'display:flex; gap:24px; padding:24px; height:950px';
      function Fixture() {
        const editor = useProject(id, initial);
        return h(React.Fragment, null,
          h('div', { style: { width: 500 } }, editor.project.tracks.flatMap(t => t.clips.map(c => h('button', {
            key: c.id, className: t.kind === 'text' ? 'text-clip' : t.kind === 'video' ? 'clip' : 'audio-clip',
            style: { position: 'relative', display: 'block', width: 300, height: 50, margin: 12 },
            onPointerDown: e => { e.preventDefault(); editor.select({ kind: t.kind === 'video' ? 'clip' : t.kind, id: c.id }); },
          }, c.content ?? c.id)))),
          h(PropertiesPanel, { editor }));
      }
      createRoot(container).render(h(React.StrictMode, null, h(I18nProvider, null, h(Fixture))));
    });
  }
  const props = page.locator('.props:visible');
  const video = i => page.locator('button.clip:visible').nth(i);
  const text = name => page.locator('button.text-clip:visible').filter({ hasText: name });
  const rotation = () => props.getByRole('textbox', { name: 'Rotation value', exact: true });
  const select = async locator => { await locator.click({ position: { x: 45, y: 15 } }); };
  const value = async (locator, expected) => {
    const deadline = Date.now() + 3000;
    while (await locator.inputValue() !== String(expected) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(await locator.inputValue(), String(expected));
  };
  const saved = async (id, key, expected) => {
    const read = () => page.evaluate(async ([id, key]) => {
      const { loadProject } = await import('/src/editor/storage.ts');
      return (await loadProject()).tracks.flatMap(t => t.clips).find(c => c.id === id)?.[key];
    }, [id, key]);
    const deadline = Date.now() + 5000;
    while (await read() !== expected && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(await read(), expected, `saved ${id}.${key}`);
  };
  const fill = async (locator, text) => { await locator.focus(); await locator.fill(text); };
  await select(video(0));
  await fill(rotation(), '37');
  await select(video(1));
  await value(rotation(), 0);
  await rotation().press('Enter');
  await props.locator('.panel-title').click();
  await saved('intro-v', 'rot', 37);
  await select(video(0));
  await value(rotation(), 37);
  await select(video(1));
  await value(rotation(), 0);
  await page.screenshot({ path: join(artifacts, 'video-selection.png') });
  console.log('PASS: equal-valued video selection commits rotation only to original clip');

  // NumberField commits valid values while typing, but unfinished text must not survive a selection change.
  const x = () => props.getByRole('spinbutton', { name: 'X position', exact: true });
  await select(video(0));
  await fill(x(), '');
  await select(video(1));
  await value(x(), 0);
  await x().press('Enter');
  await props.locator('.panel-title').click();
  await saved('drone-v', 'x', 0);
  console.log('PASS: empty NumberField draft resets across equal-valued clips');

  await select(text('Draft text 1'));
  const start = () => props.locator('label').filter({ hasText: 'Starts at' }).locator('input');
  await fill(start(), '00:02.50');
  await select(text('Draft text 2'));
  await value(start(), '00:00.00');
  await start().press('Enter');
  await props.locator('.panel-title').click();
  await saved('title', 'start', 2.5);
  await select(text('Draft text 1'));
  await value(start(), '00:02.50');
  await select(text('Draft text 2'));
  await value(start(), '00:00.00');
  await page.screenshot({ path: join(artifacts, 'text-selection.png') });
  console.log('PASS: equal-valued text start times keep selection identity after Enter and blur');
  // Cancelled and invalid drafts must never be resurrected by unmount cleanup.
  await fill(start(), '00:04.00');
  await start().press('Escape');
  await select(text('Draft text 1'));
  await select(text('Draft text 2'));
  await value(start(), '00:00.00');
  await fill(start(), 'not a time');
  await select(video(0));
  await fill(rotation(), '91');
  await rotation().press('Escape');
  await select(video(1));
  await select(video(0));
  await value(rotation(), 37);
  await fill(rotation(), 'invalid');
  await select(video(1));
  await select(video(0));
  await value(rotation(), 37);
  await fill(rotation(), '999');
  await select(video(1));
  await saved('intro-v', 'rot', 180);
  await value(rotation(), 0);
  await fill(rotation(), '12,5');
  await rotation().press('Enter');
  await select(video(0));
  await saved('drone-v', 'rot', 12.5);
  await props.getByRole('tab', { name: 'Crop', exact: true }).click();
  await select(video(1));
  assert.equal(await props.locator('[role=tab][aria-selected=true]').textContent(), 'Crop');
  console.log('PASS: Escape, invalid drafts, clamping, decimal comma, and video tab retention');

  const audio = i => page.locator('.audio-clip:visible').nth(i);
  const volume = () => props.getByRole('textbox', { name: 'Volume value', exact: true });
  await select(audio(0));
  await fill(volume(), '-6');
  await select(audio(1));
  await value(volume(), '0.0');
  await volume().press('Enter');
  await props.locator('.panel-title').click();
  await saved('intro-a', 'gainDb', -6);
  await select(audio(0));
  await value(volume(), '-6.0');
  await select(audio(1));
  await value(volume(), '0.0');
  await saved('drone-a', 'gainDb', 0);
  await saved('caption', 'start', 0);
  console.log('PASS: audio drafts commit only to original clip; invalid/cancelled text stays unchanged');
  assert.deepEqual(errors, []);
  console.log(`Evidence: ${artifacts}`);
} finally { await browser.close(); }
