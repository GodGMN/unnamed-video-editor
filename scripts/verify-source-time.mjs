// Run against Vite with TEST_URL and PLAYWRIGHT_MODULE pointing to playwright-core.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const dir = mkdtempSync(join(tmpdir(), 'source-time-'));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => { window.showOpenFilePicker = undefined; localStorage.setItem('editor-locale', 'en'); });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5291');
  const results = await page.evaluate(async () => {
    const { seedProject } = await import('/src/editor/seed.ts');
    const { parseDocument, projectDocument } = await import('/src/projects/document.ts');
    const results = [];
    const check = (name, kind, range, expected, mediaPatch = {}) => {
      const p = structuredClone(seedProject());
      const track = p.tracks.find(t => t.kind === kind);
      const clip = track.clips[0];
      Object.assign(clip, range);
      Object.assign(p.media[clip.mediaId], mediaPatch);
      let accepted = false;
      try { parseDocument(projectDocument(p)); accepted = true; } catch {}
      results.push({ name, accepted, expected });
    };
    for (const kind of ['video', 'audio']) {
      const p = seedProject(); const c = p.tracks.find(t => t.kind === kind).clips[0];
      const end = p.media[c.mediaId].duration;
      check(`${kind}: trimmed`, kind, { inS: 1, outS: end - 1 }, true);
      check(`${kind}: exact end`, kind, { inS: 1, outS: end }, true);
      check(`${kind}: rounding tolerance`, kind, { inS: 1, outS: end + 5e-7 }, true);
      check(`${kind}: outside tolerance`, kind, { inS: 1, outS: end + 1e-4 }, false);
      check(`${kind}: beyond-end out`, kind, { inS: 1, outS: end + 1000 }, false);
      check(`${kind}: beyond-end in and out`, kind, { inS: end + 1, outS: end + 2 }, false);
      check(`${kind}: negative in`, kind, { inS: -1, outS: 1 }, false);
      check(`${kind}: empty range`, kind, { inS: 1, outS: 1 }, false);
      check(`${kind}: reversed range`, kind, { inS: 2, outS: 1 }, false);
    }
    check('extended still', 'video', { inS: 100, outS: 200 }, true, { still: true });
    check('looping animation', 'video', { inS: 100, outS: 200 }, true, { still: true, animation: 0.6 });
    check('still does not exempt audio', 'audio', { inS: 100, outS: 200 }, false, { still: true });
    check('false still flag', 'video', { inS: 100, outS: 200 }, false, { still: false });
    check('malformed still flag', 'video', { inS: 100, outS: 200 }, false, { still: 'false' });
    return results;
  });
  for (const r of results) assert.equal(r.accepted, r.expected, r.name);
  console.log(`PASS ${results.length} source-range cases`);

  const fixture = join(dir, 'source.mp4');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', fixture]);
  const bytes = readFileSync(fixture);
  const valid = await page.evaluate(async bytes => {
    const { importMedia } = await import('/src/media/import.ts');
    const { VIDEO_CLIP_DEFAULTS } = await import('/src/editor/model.ts');
    const { createProject, selectProject } = await import('/src/editor/storage.ts');
    const media = await importMedia(new File([new Uint8Array(bytes)], 'source.mp4', { type: 'video/mp4' }));
    const project = { name: 'Keep my saved edit', output: { width: 160, height: 90, fps: 30 }, media: { [media.id]: media }, tracks: [{ kind: 'video', id: 'v', name: 'V1', label: '', hidden: false, magnetic: false, clips: [{ ...VIDEO_CLIP_DEFAULTS, id: 'c', mediaId: media.id, start: 0, inS: 0, outS: media.duration, linkId: null, linked: false }] }] };
    await selectProject(await createProject(project));
    return (await import('/src/projects/document.ts')).projectDocument(project);
  }, [...bytes]);
  await page.reload();
  await page.getByRole('button', { name: 'Open Keep my saved edit', exact: true }).waitFor();
  const snapshot = () => page.evaluate(async () => {
    const storage = await import('/src/editor/storage.ts');
    const { mediaTransaction } = await import('/src/media/links.ts');
    const { readMediaFile } = await import('/src/media/files.ts');
    const projects = await storage.listProjects();
    const mediaId = Object.keys(projects[0].project.media)[0];
    return { projects, active: await storage.activeProjectId(), sources: await mediaTransaction('sources', 'readonly', s => s.getAllKeys()), bytes: [...new Uint8Array(await (await readMediaFile(mediaId)).arrayBuffer())] };
  });
  const before = await snapshot();
  const invalid = structuredClone(valid);
  invalid.project.name = 'Invalid import';
  invalid.project.tracks[0].clips[0].outS += 1000;
  const manifest = Buffer.from(JSON.stringify(invalid));
  const header = Buffer.alloc(12); header.write('UVEPACK1'); header.writeUInt32LE(manifest.length, 8);
  for (const [name, buffer] of [['invalid.uve.json', manifest], ['invalid.uvepack', Buffer.concat([header, manifest, bytes])]]) {
    const dismiss = page.getByRole('button', { name: 'Dismiss error', exact: true });
    if (await dismiss.count()) await dismiss.click();
    await page.locator('input[aria-label="Import project file"]').setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
    await page.getByRole('alert').filter({ hasText: 'Invalid source range.' }).waitFor();
    assert.deepEqual(await snapshot(), before, `${name} preserves projects, active selection, and linked source bytes`);
    assert.equal(await page.locator('.home-project-row').count(), 1);
    console.log(`PASS ${name} rejected through UI without changing saved work or media links`);
  }
  const screenshot = join(dir, 'rejected-import.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Open Keep my saved edit', exact: true }).click();
  await page.getByRole('button', { name: 'Rename project Keep my saved edit', exact: true }).waitFor();
  assert.deepEqual((await page.evaluate(async () => (await (await import('/src/editor/storage.ts')).loadProject()).tracks)), valid.project.tracks);
  assert.deepEqual(errors, []);
  console.log(`PASS saved edit reopens after rejected imports and reload\nEvidence: ${screenshot}`);
} finally { await browser.close(); }
