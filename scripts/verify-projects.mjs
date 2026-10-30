// Start Vite on TEST_URL. PLAYWRIGHT_MODULE can point to a local playwright-core/index.mjs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const dir = mkdtempSync(join(tmpdir(), 'editor-projects-'));
const fixture = join(dir, 'original.mp4');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', fixture]);
const bytes = [...readFileSync(fixture)];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const checks = [];
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  await context.addInitScript(() => { window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5262');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByRole('button', { name: 'Rename project Untitled project' }).waitFor();
  await page.locator('input[aria-label="Import media files"]').setInputFiles(fixture);
  const item = page.locator('.media-item').filter({ hasText: 'original.mp4' });
  await item.waitFor();
  await item.locator('img').first().waitFor();
  await page.getByRole('status').filter({ hasText: /^Saved$/ }).waitFor();
  const source = await page.evaluate(async () => {
    const { loadProject } = await import('/src/editor/storage.ts');
    const { readMediaFile } = await import('/src/media/files.ts');
    const p = await loadProject(); const m = Object.values(p.media)[0];
    const root = await navigator.storage.getDirectory();
    let copied = false; try { await root.getDirectoryHandle('media'); copied = true; } catch {}
    return { media: m, size: (await readMediaFile(m.id)).size, copied };
  });
  assert.equal(source.copied, false); assert.equal(source.size, bytes.length); checks.push('UI imports source without OPFS copy');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Package with media', exact: true }).click();
  const packageFile = await download; const packagePath = join(dir, packageFile.suggestedFilename()); await packageFile.saveAs(packagePath);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await page.locator(`input[aria-label="Reconnect original.mp4"]`).waitFor({ state: 'attached' });
  const missing = await page.evaluate(async id => (await import('/src/media/files.ts')).readMediaFile(id), source.media.id);
  assert.equal(missing, null); checks.push('Session imports require reconnect after reload');
  await page.locator('input[aria-label="Reconnect original.mp4"]').setInputFiles({ name: 'original.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(bytes.length) });
  await page.getByRole('status').filter({ hasText: /does not match/ }).waitFor();
  checks.push('Rejects same-name same-size wrong source');
  await page.locator('input[aria-label="Reconnect original.mp4"]').setInputFiles(fixture);
  await item.getByRole('button', { name: 'Rebuild previews' }).waitFor();
  checks.push('Reconnect restores source and previews');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate current', exact: true }).click();
  await page.getByRole('button', { name: 'Rename project Untitled project copy' }).waitFor();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.project-row').length === 3);
  assert.equal(await page.locator('.project-row').count(), 3);
  const originalRow = page.locator('.project-row').filter({ has: page.locator('strong', { hasText: /^Untitled project$/ }) });
  page.once('dialog', d => d.accept()); await originalRow.getByRole('button', { name: 'Delete' }).click();
  await originalRow.waitFor({ state: 'detached' });
  const retained = await page.evaluate(async id => !!await (await import('/src/media/files.ts')).readMediaFile(id), source.media.id);
  assert.equal(retained, true); checks.push('Duplicate shares source and deletion preserves references');
  await page.locator('input[aria-label="Open project file"]').setInputFiles(packagePath);
  await page.getByRole('button', { name: 'Rename project Untitled project', exact: true }).waitFor();
  const restored = await page.evaluate(async () => {
    const p = await (await import('/src/editor/storage.ts')).loadProject();
    const m = Object.values(p.media)[0]; return { id: m.id, size: (await (await import('/src/media/files.ts')).readMediaFile(m.id)).size };
  });
  assert.notEqual(restored.id, source.media.id); assert.equal(restored.size, bytes.length); checks.push('Portable package roundtrip remaps media and reads slices without copying');
  await page.reload();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.locator('input[aria-label="Reconnect package"]').setInputFiles(packagePath);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.media-item').filter({ hasText: 'original.mp4' }).getByText('Session only', { exact: true }).waitFor();
  assert.equal(await page.evaluate(async id => (await (await import('/src/media/files.ts')).readMediaFile(id))?.size, restored.id), bytes.length);
  checks.push('Reconnect package restores current project media after reload');
  // Genuine serializable browser handles, using an OPFS fixture as the controlled picker source.
  const linked = await page.evaluate(async bytes => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle('linked-fixture.mp4', { create: true });
    const writer = await handle.createWritable(); await writer.write(new Uint8Array(bytes)); await writer.close();
    const { importMedia } = await import('/src/media/import.ts');
    const media = await importMedia(await handle.getFile(), handle);
    return media.id;
  }, bytes);
  await page.reload();
  assert.equal(await page.evaluate(async id => (await (await import('/src/media/files.ts')).readMediaFile(id))?.size, linked), bytes.length);
  checks.push('Stored FileSystemFileHandle survives reload');
  const changed = await page.evaluate(async id => {
    const handle = await (await navigator.storage.getDirectory()).getFileHandle('linked-fixture.mp4');
    const writer = await handle.createWritable(); await writer.write(new Uint8Array([1, 2, 3])); await writer.close();
    return await (await import('/src/media/files.ts')).readMediaFile(id);
  }, linked);
  assert.equal(changed, null); checks.push('Changed linked source requires reconnect');
  const validation = await page.evaluate(async () => {
    const { parseDocument, projectDocument } = await import('/src/projects/document.ts');
    const { seedProject } = await import('/src/editor/seed.ts');
    const good = projectDocument(seedProject()); parseDocument(good);
    const bad = structuredClone(good); bad.project.tracks.find(t => t.kind === 'video').clips[0].inS = 'broken';
    let rejected = false; try { parseDocument(bad); } catch { rejected = true; }
    const future = structuredClone(good); future.version = 999;
    let futureRejected = false; try { parseDocument(future); } catch { futureRejected = true; }
    return { rejected, futureRejected };
  });
  assert.deepEqual(validation, { rejected: true, futureRejected: true }); checks.push('Rejects malformed documents and future schema versions');
  const cache = await page.evaluate(async () => {
    const { writePreview, previewCacheBytes, clearPreviewCache, PREVIEW_BUDGET } = await import('/src/media/files.ts');
    await clearPreviewCache();
    const big = { thumbnails: ['x'.repeat(45 * 1024 * 1024)], peaks: [] };
    for (const id of ['cache-a', 'cache-b', 'cache-c']) await writePreview(id, big);
    const used = await previewCacheBytes(); await clearPreviewCache();
    return { used, budget: PREVIEW_BUDGET, cleared: await previewCacheBytes() };
  });
  assert.ok(cache.used > 0 && cache.used <= cache.budget); assert.equal(cache.cleared, 0); checks.push('Preview cache evicts within 128 MiB and clears');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  const evidence = process.env.SCREENSHOT_PATH ?? join(dir, 'project-library.png'); mkdirSync(join(evidence, '..'), { recursive: true });
  await page.screenshot({ path: evidence });
  // Seed a version-one database in a separate browser profile to verify the real upgrade path.
  const migrationContext = await browser.newContext(); const migrationPage = await migrationContext.newPage();
  await migrationPage.route('**/migration-setup', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Migration fixture</body></html>' }));
  await migrationPage.goto(`${process.env.TEST_URL ?? 'http://127.0.0.1:5262'}/migration-setup`);
  await migrationPage.evaluate(async () => {
    const { seedProject } = await import('/src/editor/seed.ts');
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('unnamed-video-editor', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('projects');
      request.onsuccess = () => { const db = request.result; const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put({ schema: 1, project: { ...seedProject(), name: 'Legacy project' } }, 'current'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    });
  });
  await migrationPage.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5262');
  await migrationPage.getByRole('button', { name: 'Rename project Legacy project' }).waitFor();
  assert.equal(await migrationPage.evaluate(async () => (await (await import('/src/editor/storage.ts')).listProjects()).length), 1);
  checks.push('Migrates single-project v1 save without losing edits');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', checks, cache, evidence, packagePath }, null, 2));
} finally { await browser.close(); }
