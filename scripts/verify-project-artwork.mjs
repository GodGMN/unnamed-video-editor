// Start Vite first. Project artwork shows the composed opening frame, and a placeholder without video.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const url = process.env.TEST_URL ?? 'http://127.0.0.1:5212';
const dir = process.env.ARTIFACT_DIR ?? '/tmp/editor-project-artwork';
mkdirSync(dir, { recursive: true });
const clip = (name, size) => {
  const file = join(dir, name);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30`, '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', file]);
  return readFileSync(file).toString('base64');
};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  await page.evaluate(async ({ landscape, portrait }) => {
    const { createProject, clearProject, listProjects, selectProject } = await import('/src/editor/storage.ts');
    const { seedProject } = await import('/src/editor/seed.ts');
    const { placeMedia, setAspect, addTextClip, patchClip, newId } = await import('/src/editor/model.ts');
    const { importMedia } = await import('/src/media/import.ts');
    for (const entry of await listProjects()) await clearProject(entry.id);
    const file = (b64, name) => new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], name, { type: 'video/mp4' });
    const blank = (name) => { const p = seedProject(); return { ...p, name, media: {}, tracks: p.tracks.map(t => ({ ...t, clips: [] })) }; };
    const withVideo = async (project, media) => {
      const p = { ...project, media: { [media.id]: media } };
      return placeMedia(p, media.id, p.tracks.find(t => t.kind === 'video').id, 0, newId());
    };
    await createProject(blank('Empty project'));
    let tall = setAspect(await withVideo(blank('Portrait with title'), await importMedia(file(portrait, 'tall.mp4'))), { w: 9, h: 16 });
    const textId = newId();
    tall = addTextClip(tall, 0, textId);
    tall = patchClip(tall, textId, { content: 'HELLO', size: 160 });
    await createProject(tall);
    const id = await createProject(await withVideo(blank('Landscape clip'), await importMedia(file(landscape, 'wide.mp4'))));
    await selectProject(id);
  }, { landscape: clip('wide.mp4', '640x360'), portrait: clip('tall.mp4', '360x640') });
  await page.reload();
  const row = name => page.locator('.home-project-row').filter({ hasText: name }).locator('.project-artwork');
  for (const name of ['Landscape clip', 'Portrait with title']) await row(name).locator('img:not(.artwork-backdrop)').waitFor();
  await page.locator('.hero-artwork img:not(.artwork-backdrop)').waitFor();
  await row('Empty project').locator('.project-artwork-placeholder').waitFor();
  const size = await row('Portrait with title').locator('img:not(.artwork-backdrop)').evaluate(img => [img.naturalWidth, img.naturalHeight]);
  assert.deepEqual(size, [240, 427]);
  // The portrait frame is testsrc2 colour, not the black letterbox of its 16:9 preview.
  const centre = await row('Portrait with title').locator('img:not(.artwork-backdrop)').evaluate(img => {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const edge = ctx.getImageData(10, 300, 1, 1).data;
    return edge[0] + edge[1] + edge[2];
  });
  assert.ok(centre > 60, `portrait frame fills the width (edge brightness ${centre})`);
  await page.screenshot({ path: `${dir}/home.png` });
  await page.locator('.home-project-list').screenshot({ path: `${dir}/rows.png` });
  await page.evaluate(async () => {
    const { listProjects, selectProject } = await import('/src/editor/storage.ts');
    await selectProject((await listProjects()).find(e => e.project.name === 'Portrait with title').id);
  });
  await page.reload();
  await page.locator('.home-resume').filter({ hasText: 'Portrait with title' }).locator('.hero-artwork img:not(.artwork-backdrop)').waitFor();
  assert.deepEqual(await page.locator('.hero-artwork img:not(.artwork-backdrop)').evaluate(img => [img.naturalWidth, img.naturalHeight]), [960, 1707]);
  await page.locator('.home-resume').screenshot({ path: `${dir}/hero-portrait.png` });
  assert.deepEqual(errors, []);
  console.log(`ok · screenshots in ${dir}`);
} finally { await browser.close(); }
