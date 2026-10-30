import { openEditor, projectAction, returnHome } from './browser-helpers.mjs';
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
  assert.equal(source.copied, false); assert.equal(source.size, bytes.length); checks.push('UI persists source in IndexedDB without legacy OPFS copy');
  const download = page.waitForEvent('download');
  await returnHome(page);
  await projectAction(page, 'Untitled project', 'Package with media');
  const packageFile = await download; const packagePath = join(dir, packageFile.suggestedFilename()); await packageFile.saveAs(packagePath);
  await openEditor(page);
  await page.reload();
  await openEditor(page);
  const playback = await page.evaluate(async id => {
    const file = await (await import('/src/media/files.ts')).readMediaFile(id);
    const url = URL.createObjectURL(file);
    const video = document.createElement('video'); video.muted = true; video.src = url;
    try {
      document.body.append(video);
      const frame = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Reloaded source did not decode a video frame')), 10000);
        video.requestVideoFrameCallback(() => { clearTimeout(timer); resolve(); });
      });
      await video.play();
      await frame;
      return { size: file.size, width: video.videoWidth, height: video.videoHeight };
    } finally { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); URL.revokeObjectURL(url); }
  }, source.media.id);
  assert.deepEqual(playback, { size: bytes.length, width: 320, height: 180 });
  checks.push('Real imported MP4 survives reload and decodes video during playback');
  try {
    // Picker-backed Files may not consume new blob quota in Chromium. Inject the
    // boundary failure for the UI, then exercise a real quota abort below.
    await page.evaluate(() => {
      window.originalSourcePut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'sources') throw new DOMException('UI quota fixture', 'QuotaExceededError');
        return window.originalSourcePut.apply(this, args);
      };
    });
    await page.locator('input[aria-label="Import media files"]').setInputFiles(fixture);
    await page.locator('.media-status').filter({ hasText: /Browser storage is full/ }).waitFor({ timeout: 15000 });
    await page.locator('.media-item.importing').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.media-item').count(), 1);
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalSourcePut; delete window.originalSourcePut; });
    await page.screenshot({ path: join(dir, 'quota-error.png') });
    const retained = await page.evaluate(async id => {
      const project = await (await import('/src/editor/storage.ts')).loadProject();
      const { mediaTransaction } = await import('/src/media/links.ts');
      return { ids: Object.keys(project.media), sources: await mediaTransaction('sources', 'readonly', s => s.getAllKeys()), size: (await (await import('/src/media/files.ts')).readMediaFile(id))?.size };
    }, source.media.id);
    assert.deepEqual(retained, { ids: [source.media.id], sources: [source.media.id], size: bytes.length });
    checks.push('Injected quota failure is actionable in the UI and preserves existing project/source');
    const quotaContext = await browser.newContext();
    const quotaPage = await quotaContext.newPage();
    await quotaPage.route('**/quota-check', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await quotaPage.goto(new URL('/quota-check', page.url()).href);
    const cdp = await quotaContext.newCDPSession(quotaPage);
    await cdp.send('Storage.overrideQuotaForOrigin', { origin: new URL(page.url()).origin, quotaSize: 1 });
    const handleQuota = await quotaPage.evaluate(async ({ id, bytes }) => {
      const handle = {};
      const original = IDBObjectStore.prototype.put;
      let attempts = 0;
      IDBObjectStore.prototype.put = function (...args) { if (this.name === 'sources') attempts++; return original.apply(this, args); };
      let message;
      try { await (await import('/src/media/links.ts')).linkFile(id, new File([new Uint8Array(4 * 1024 * 1024)], 'replacement.mp4'), handle); }
      catch (error) { message = error.message; }
      finally { IDBObjectStore.prototype.put = original; }
      return { attempts, message, size: (await (await import('/src/media/files.ts')).readMediaFile(id))?.size };
    }, { id: source.media.id, bytes });
    assert.equal(handleQuota.attempts, 1);
    assert.match(handleQuota.message, /Browser storage is full/);
    assert.equal(handleQuota.size, undefined);
    await quotaContext.close();
    checks.push('Real IndexedDB quota abort with an optional handle makes one attempt and stores no source');
  } finally { await page.evaluate(() => { if (window.originalSourcePut) { IDBObjectStore.prototype.put = window.originalSourcePut; delete window.originalSourcePut; } }); }

  await page.locator('.media-item[data-source="ready"]').filter({ hasText: 'original.mp4' }).waitFor();
  checks.push('Imports stay available after reload');
  const relink = async file => {
    await item.click({ button: 'right' });
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: 'Relink original' }).click();
    await (await chooser).setFiles(file);
  };
  await relink({ name: 'original.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(bytes.length) });
  await page.getByRole('status').filter({ hasText: /does not match/ }).waitFor();
  checks.push('Rejects same-name same-size wrong source');
  await relink(fixture);
  await page.locator('.media-item[data-source="ready"]').filter({ hasText: 'original.mp4' }).waitFor();
  checks.push('Relink from the media menu restores source and previews');
  await returnHome(page);
  await projectAction(page, 'Untitled project', 'Duplicate');
  await page.getByRole('button', { name: 'Rename project Untitled project copy' }).waitFor();
  await returnHome(page);
  await page.waitForFunction(() => document.querySelectorAll('.home-project-row').length === 2);
  assert.equal(await page.locator('.home-project-row').count(), 2);
  const originalRow = page.locator('.home-project-row').filter({ has: page.locator('strong', { hasText: /^Untitled project$/ }) });
  await projectAction(page, 'Untitled project', 'Delete project');
  await page.getByRole('dialog').getByRole('button', { name: 'Delete project', exact: true }).click();
  await originalRow.waitFor({ state: 'detached' });
  const retained = await page.evaluate(async id => !!await (await import('/src/media/files.ts')).readMediaFile(id), source.media.id);
  assert.equal(retained, true); checks.push('Duplicate shares source and deletion preserves references');
  await projectAction(page, 'Untitled project copy', 'Delete project');
  await page.getByRole('dialog').getByRole('button', { name: 'Delete project', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.home-project-row').length === 0);
  assert.equal(await page.evaluate(async id => (await import('/src/media/files.ts')).readMediaFile(id), source.media.id), null);
  assert.equal(readFileSync(fixture).length, bytes.length);
  checks.push('Deleting the last shared reference removes browser source and preserves the external original');
  await page.locator('input[aria-label="Import project file"]').setInputFiles(packagePath);
  await page.getByRole('button', { name: 'Rename project Untitled project', exact: true }).waitFor();
  const restored = await page.evaluate(async () => {
    const p = await (await import('/src/editor/storage.ts')).loadProject();
    const m = Object.values(p.media)[0]; return { id: m.id, size: (await (await import('/src/media/files.ts')).readMediaFile(m.id)).size };
  });
  assert.notEqual(restored.id, source.media.id); assert.equal(restored.size, bytes.length); checks.push('Portable package roundtrip remaps media and persists source slices');
  await page.reload();
  await openEditor(page);
  assert.equal(await page.evaluate(async id => (await (await import('/src/media/files.ts')).readMediaFile(id))?.size, restored.id), bytes.length);
  checks.push('Package source persists across reload');
  await returnHome(page);
  await projectAction(page, 'Untitled project', 'Reconnect package');
  await page.locator('input[aria-label="Reconnect package"]').setInputFiles(packagePath);
  await openEditor(page);
  await page.locator('.media-item[data-source="ready"]').filter({ hasText: 'original.mp4' }).waitFor();
  assert.equal(await page.evaluate(async id => (await (await import('/src/media/files.ts')).readMediaFile(id))?.size, restored.id), bytes.length);
  checks.push('Reconnect package restores current project media after reload');
  const rollback = await page.evaluate(async bytes => {
    const { mediaTransaction, linkFile, linkedFile, forgetLink } = await import('/src/media/links.ts');
    const { loadProject } = await import('/src/editor/storage.ts');
    const { projectDocument } = await import('/src/projects/document.ts');
    const { openProjectFile } = await import('/src/projects/portable.ts');
    const project = await loadProject();
    const media = Object.values(project.media)[0];
    const doc = projectDocument({ ...project, media: { [media.id]: media, second: { ...media, id: 'second' } } });
    const manifest = new TextEncoder().encode(JSON.stringify(doc));
    const header = new Uint8Array(12); header.set(new TextEncoder().encode('UVEPACK1'));
    new DataView(header.buffer).setUint32(8, manifest.length, true);
    const file = new File([header, manifest, new Uint8Array(bytes), new Uint8Array(bytes)], 'two.uvepack');
    const before = await mediaTransaction('sources', 'readonly', s => s.getAllKeys());
    const original = IDBObjectStore.prototype.put;
    let attempts = 0, message;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'sources' && ++attempts === 2) throw new DOMException('Injected package quota', 'QuotaExceededError');
      return original.apply(this, args);
    };
    try { await openProjectFile({ file }); }
    catch (error) { message = error.message; }
    finally { IDBObjectStore.prototype.put = original; }
    const after = await mediaTransaction('sources', 'readonly', s => s.getAllKeys());
    // A non-cloneable handle must still fall back to persisting the File bytes.
    await linkFile('clone-fallback', new File([new Uint8Array(bytes)], 'original.mp4'), { nonCloneable() {} });
    const fallback = await linkedFile('clone-fallback');
    await forgetLink('clone-fallback');
    return { before, after, attempts, message, fallbackSize: fallback.file?.size };
  }, bytes);
  assert.deepEqual(rollback.after, rollback.before);
  assert.equal(rollback.attempts, 2); assert.match(rollback.message, /Browser storage is full/);
  assert.equal(rollback.fallbackSize, bytes.length);
  checks.push('Partial package failure cleans only new sources; non-cloneable handle still stores bytes');
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
  await openEditor(page);
  assert.equal(await page.evaluate(async id => (await (await import('/src/media/files.ts')).readMediaFile(id))?.size, linked), bytes.length);
  checks.push('Stored FileSystemFileHandle survives reload');
  const changed = await page.evaluate(async id => {
    const handle = await (await navigator.storage.getDirectory()).getFileHandle('linked-fixture.mp4');
    const writer = await handle.createWritable(); await writer.write(new Uint8Array([1, 2, 3])); await writer.close();
    return (await (await import('/src/media/files.ts')).readMediaFile(id))?.size;
  }, linked);
  assert.equal(changed, bytes.length); checks.push('Stored source survives external original changes');
  const validation = await page.evaluate(async () => {
    const { parseDocument, projectDocument } = await import('/src/projects/document.ts');
    const { seedProject } = await import('/src/editor/seed.ts');
    const good = projectDocument(seedProject()); parseDocument(good);
    const bad = structuredClone(good); bad.project.tracks.find(t => t.kind === 'video').clips[0].inS = 'broken';
    let rejected = false; try { parseDocument(bad); } catch { rejected = true; }
    const future = structuredClone(good); future.version = 999;
    let futureRejected = false; try { parseDocument(future); } catch { futureRejected = true; }
    const legacy = structuredClone(good);
    for (const track of legacy.project.tracks) for (const clip of track.clips) {
      if (track.kind === 'video') delete clip.key;
      if (track.kind === 'audio') { delete clip.gainDb; clip.vol = 80; }
    }
    const upgraded = parseDocument(legacy);
    const legacyAccepted = upgraded.tracks.filter(t => t.kind === 'audio').every(t => t.clips.every(c => Number.isFinite(c.gainDb))) && upgraded.tracks.filter(t => t.kind === 'video').every(t => t.clips.every(c => c.key.enabled === false));
    return { rejected, futureRejected, legacyAccepted };
  });
  assert.deepEqual(validation, { rejected: true, futureRejected: true, legacyAccepted: true }); checks.push('Rejects malformed documents and future schema versions');
  const cache = await page.evaluate(async () => {
    const { writePreview, previewCacheBytes, clearPreviewCache, PREVIEW_BUDGET } = await import('/src/media/files.ts');
    await clearPreviewCache();
    const big = { thumbnails: ['x'.repeat(45 * 1024 * 1024)], peaks: [] };
    for (const id of ['cache-a', 'cache-b', 'cache-c']) await writePreview(id, big);
    const used = await previewCacheBytes(); await clearPreviewCache();
    return { used, budget: PREVIEW_BUDGET, cleared: await previewCacheBytes() };
  });
  assert.ok(cache.used > 0 && cache.used <= cache.budget); assert.equal(cache.cleared, 0); checks.push('Preview cache evicts within 128 MiB and clears');
  await returnHome(page);
  const documentDownload = page.waitForEvent('download');
  await projectAction(page, 'Untitled project', 'Download project');
  const projectFile = await documentDownload;
  const documentPath = join(dir, projectFile.suggestedFilename()); await projectFile.saveAs(documentPath);
  const document = JSON.parse(readFileSync(documentPath, 'utf8'));
  assert.equal(document.format, 'unnamed-video-editor'); assert.equal(document.version, 1);
  assert.ok(readFileSync(documentPath).length < bytes.length);
  const documentImport = await page.evaluate(async doc => {
    const { openProjectFile } = await import('/src/projects/portable.ts');
    const p = await openProjectFile({ file: new File([JSON.stringify(doc)], 'project.uve.json') });
    return { name: p.name, count: Object.keys(p.media).length };
  }, document);
  assert.equal(documentImport.name, document.project.name); assert.equal(documentImport.count, 1);
  checks.push('Small project download opens as a validated document without embedded media');
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
  await openEditor(migrationPage);
  await migrationPage.getByRole('button', { name: 'Rename project Legacy project' }).waitFor();
  assert.equal(await migrationPage.evaluate(async () => (await (await import('/src/editor/storage.ts')).listProjects()).length), 1);
  checks.push('Migrates single-project v1 save without losing edits');
  await migrationPage.evaluate(async () => { await (await import('/src/editor/storage.ts')).clearProject(); });
  await migrationPage.getByRole('button', { name: 'Rename project Legacy project' }).click();
  await migrationPage.getByRole('textbox', { name: 'Project name' }).fill('Unsaved edit');
  await migrationPage.getByRole('textbox', { name: 'Project name' }).press('Enter');
  await migrationPage.getByRole('status').filter({ hasText: /^Save failed:/ }).waitFor();
  await migrationPage.getByRole('button', { name: 'Projects', exact: true }).click();
  await migrationPage.getByRole('alert').filter({ hasText: 'Project no longer exists' }).waitFor();
  await migrationPage.getByRole('button', { name: 'Rename project Unsaved edit' }).waitFor();
  assert.equal(await migrationPage.evaluate(async () => (await (await import('/src/editor/storage.ts')).listProjects()).length), 0);
  checks.push('Failed save stays visible and prevents switching away from unsaved edits');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', checks, cache, evidence, packagePath }, null, 2));
} finally { await browser.close(); }
