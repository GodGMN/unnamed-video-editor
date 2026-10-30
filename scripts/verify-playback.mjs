// Start Vite, then run with PLAYWRIGHT_MODULE and optional TEST_URL.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const dir = mkdtempSync(join(tmpdir(), 'editor-playback-'));
const file = join(dir, 'playback.mp4');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', file]);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
 const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
 const errors = [];
 page.on('pageerror', (error) => errors.push(error.message));
 await page.addInitScript(() => {
   window.testGains = [];
   const original = AudioContext.prototype.createGain;
   AudioContext.prototype.createGain = function () {
     const gain = original.call(this), analyser = this.createAnalyser();
     gain.connect(analyser); window.testGains.push({ gain, analyser }); return gain;
   };
 });
 await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5213');
 await page.locator('input[type=file]').setInputFiles(file);
 await page.locator('.media-item').filter({ hasText: 'playback.mp4' }).waitFor();
 await page.evaluate(async () => {
   const { loadProject, saveProject } = await import('/src/editor/storage.ts');
   const { placeMedia } = await import('/src/editor/model.ts');
   let p;
   for (let i = 0; i < 50; i++) {
     p = await loadProject();
     if (p && Object.values(p.media).some((m) => m.name === 'playback.mp4')) break;
     await new Promise((r) => setTimeout(r, 100));
   }
   if (!p) throw new Error('Project did not persist');
   const m = Object.values(p.media).find((m) => m.name === 'playback.mp4');
   p.tracks = [{ id: 'v', name: 'V1', label: 'Main', kind: 'video', hidden: false, magnetic: true, clips: [] }];
   p = placeMedia(p, m.id, 'v', 0, 'real');
   await saveProject(p);
 });
 await page.reload();
 await page.getByRole('button', { name: 'Go to start', exact: true }).click();
 await page.waitForFunction(() => {
   const c = document.querySelector('canvas');
   return c && Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data).some((v, i) => i % 4 !== 3 && v > 50);
 });
 const before = await page.locator('canvas').evaluate((c) => c.toDataURL());
 await page.getByRole('button', { name: 'Forward one frame', exact: true }).click();
 assert.match(await page.locator('.transport-bar').innerText(), /00:00.03/);
 // Count actual engine ticks separately from React's visible time updates.
 await page.evaluate(async () => {
   const engineUrl = performance.getEntriesByType('resource').map((r) => r.name).filter((url) => new URL(url).pathname === '/src/playback/engine.ts').at(-1);
   const { PlaybackEngine } = await import(engineUrl);
   const update = PlaybackEngine.prototype.update;
   window.playbackTicks = [];
   PlaybackEngine.prototype.update = function (request) {
     if (request.playing) window.playbackTicks.push({ wall: performance.now(), time: request.time });
     return update.call(this, request);
   };
   window.transportChanges = 0;
   window.transportObserver = new MutationObserver(() => window.transportChanges++);
   window.transportObserver.observe(document.querySelector('.transport-bar'), { childList: true, subtree: true, characterData: true });
 });
 await page.getByRole('button', { name: 'Play (Space)', exact: true }).click();
 await page.waitForFunction(() => {
   const text = document.querySelector('.transport-bar').textContent;
   return /00:0[12]\./.test(text.split('/')[0]);
 });
 const clock = await page.evaluate(() => {
   window.transportObserver.disconnect();
   const ticks = window.playbackTicks;
   const first = ticks[0], last = ticks.at(-1);
   return { ticks: ticks.length, uiUpdates: window.transportChanges, elapsed: (last.wall - first.wall) / 1000, advanced: last.time - first.time };
 });
 assert.ok(clock.ticks > clock.uiUpdates * 2, 'engine updates independently of throttled React time display');
 assert.ok(Math.abs(clock.elapsed - clock.advanced) < 0.1, 'timeline follows elapsed clock time');
 const audio = await page.evaluate(() => window.testGains.map(({ gain, analyser }) => {
   const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
   return { gain: gain.gain.value, rms: Math.sqrt(samples.reduce((s, x) => s + x * x, 0) / samples.length) };
 }));
 assert.ok(audio.some((a) => a.gain > 0 && a.rms > 0.005), 'Actual audible samples pass through gain graph');
 await page.getByRole('button', { name: 'Mute preview', exact: true }).click();
 await page.waitForFunction(() => window.testGains.every(({ gain }) => gain.gain.value < 0.001));
 await page.getByRole('button', { name: 'Pause (Space)', exact: true }).click();
 const paused = await page.locator('.transport-bar').innerText();
 await page.waitForTimeout(150);
 assert.equal(await page.locator('.transport-bar').innerText(), paused);
 assert.notEqual(await page.locator('canvas').evaluate((c) => c.toDataURL()), before, 'Actual moving frames rendered');
 await page.getByRole('button', { name: 'Go to start', exact: true }).click();
 await page.getByRole('button', { name: 'Back one frame', exact: true }).click();
 assert.match(await page.locator('.transport-bar').innerText(), /^00:00.00/);
 await page.getByRole('button', { name: 'Go to end', exact: true }).click();
 assert.match(await page.locator('.transport-bar').innerText(), /^00:03.00/);
 // Scrub and change properties through the UI, then inspect the actual preview.
 await page.getByRole('button', { name: 'Go to start', exact: true }).click();
 await page.locator('.ruler').click({ position: { x: 30, y: 8 } });
 assert.match(await page.locator('.transport-bar').innerText(), /^00:01.00/);
 await page.getByRole('slider', { name: 'Playhead within the trimmed clip' }).fill('0.5');
 assert.match(await page.locator('.transport-bar').innerText(), /^00:00.50/);
 await page.locator('.crop-grid label').filter({ hasText: 'Left' }).locator('input').fill('320');
 await page.waitForFunction(() => {
   const c = document.querySelector('canvas'); const data = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data;
   return data[0] === 0 && data[1] === 0 && data[2] === 0;
 });
 await page.locator('.crop-grid label').filter({ hasText: 'Left' }).locator('input').fill('0');
 // Compositor and envelopes use the same functions as preview/export, with real canvas pixels.
 const compositor = await page.evaluate(async () => {
   const { renderFrame, audioGain, fadeCurve } = await import('/src/playback/compositor.ts');
   const { VIDEO_CLIP_DEFAULTS, AUDIO_CLIP_DEFAULTS } = await import('/src/editor/model.ts');
   const red = new OffscreenCanvas(100, 100), blue = new OffscreenCanvas(100, 100);
   red.getContext('2d').fillStyle = 'red'; red.getContext('2d').fillRect(0, 0, 100, 100);
   blue.getContext('2d').fillStyle = 'blue'; blue.getContext('2d').fillRect(0, 0, 100, 100);
   const c = new OffscreenCanvas(100, 100), ctx = c.getContext('2d');
   const base = { ...VIDEO_CLIP_DEFAULTS, mediaId: 'm', inS: 0, outS: 2, linkId: null, linked: false };
   const a = { ...base, id: 'a', start: 0, transitionOut: { type: 'crossfade', duration: 1 } };
   const b = { ...base, id: 'b', start: 1 };
   const track = { id: 'v', name: 'V', label: '', kind: 'video', hidden: false, magnetic: true, clips: [a, b] };
   const p = { name: 'test', output: { width: 100, height: 100, fps: 30 }, media: { m: { video: { width: 100, height: 100 } } }, tracks: [track] };
   const pixel = () => Array.from(ctx.getImageData(50, 50, 1, 1).data);
   renderFrame(p, 1.5, ctx, (clip) => clip.id === 'a' ? red : blue);
   const crossfade = pixel();
   a.transitionOut = { type: 'fade', duration: 1 };
   renderFrame(p, 1.5, ctx, (clip) => clip.id === 'a' ? red : blue);
   const black = pixel();
   a.transitionOut = null; track.clips = [{ ...a, fit: 'custom', scale: 50 }];
   renderFrame(p, 0.5, ctx, () => red);
   const edge = Array.from(ctx.getImageData(5, 5, 1, 1).data);
   track.clips = [{ ...a, cropL: 60 }];
   renderFrame(p, 0.5, ctx, () => red); const cropped = pixel();
   track.hidden = true; renderFrame(p, 0.5, ctx, () => red); const hidden = pixel();
   const ac = { ...AUDIO_CLIP_DEFAULTS, id: 'audio', mediaId: 'm', start: 0, inS: 0, outS: 2, linkId: null, vol: 80, fadeIn: 1 };
   return { crossfade, black, edge, cropped, hidden, gain: audioGain(p, ac, 0.5), mutedGain: audioGain(p, { ...ac, muted: true }, 0.5), curves: [-1, 0, 1].map((v) => fadeCurve(0.25, v)) };
 });
 assert.ok(Math.abs(compositor.crossfade[0] - 127) <= 1 && Math.abs(compositor.crossfade[2] - 128) <= 1);
 for (const key of ['black', 'edge', 'cropped', 'hidden']) assert.deepEqual(compositor[key].slice(0, 3), [0, 0, 0], key);
 assert.ok(Math.abs(compositor.gain - 0.4) < 0.001);
 assert.equal(compositor.mutedGain, 0);
 assert.ok(compositor.curves[0] < compositor.curves[1] && compositor.curves[1] < compositor.curves[2]);
 const workerPixel = await page.evaluate(async () => {
   const source = `import { renderFrame } from '${location.origin}/src/playback/compositor.ts';
     onmessage = () => { const canvas = new OffscreenCanvas(8, 8); renderFrame({ output: { width: 8, height: 8 }, tracks: [] }, 0, canvas.getContext('2d'), () => null); postMessage(Array.from(canvas.getContext('2d').getImageData(0, 0, 1, 1).data)); };`;
   const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
   const worker = new Worker(url, { type: 'module' });
   try { return await new Promise((resolve, reject) => { worker.onmessage = (e) => resolve(e.data); worker.onerror = (e) => reject(new Error(e.message)); worker.postMessage(null); }); }
   finally { worker.terminate(); URL.revokeObjectURL(url); }
 });
 assert.deepEqual(workerPixel, [0, 0, 0, 255]);
 // Playback that starts in a gap must show the clip once the playhead reaches it.
 await page.evaluate(async () => {
   const { loadProject, saveProject } = await import('/src/editor/storage.ts');
   const p = await loadProject();
   p.tracks[0].clips[0].start = 1;
   await saveProject(p);
 });
 await page.reload();
 await page.getByRole('button', { name: 'Go to start', exact: true }).click();
 // Seeks in real 1080p footage outlast a frame. Delay them so that holds for this tiny test file too.
 await page.evaluate(() => {
   const { get, set } = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
   Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { get, set(value) { setTimeout(() => set.call(this, value), 50); } });
 });
 await page.getByRole('button', { name: 'Play (Space)', exact: true }).click();
 await page.waitForFunction(() => /^00:0[23]\./.test(document.querySelector('.transport-bar').textContent));
 assert.ok(await page.locator('canvas').evaluate((c) => Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data).some((v, i) => i % 4 !== 3 && v > 50)), 'Clip entered during playback is drawn');
 await page.getByRole('button', { name: 'Pause (Space)', exact: true }).click();
 await page.getByRole('button', { name: 'Go to start', exact: true }).click();
 await page.waitForTimeout(150);
 await page.screenshot({ path: process.env.SCREENSHOT_PATH ?? '/tmp/editor-media-check/playback.png' });
 assert.deepEqual(errors, []);
 console.log(JSON.stringify({ result: 'PASS', clock, audio, compositor, checks: ['rendered real media', 'play/pause', 'audio samples', 'preview mute', 'frame stepping', 'transport limits', 'crossfade pixels', 'fade-to-black pixels', 'transform', 'crop', 'hidden track', 'fade curves', 'play into clip', 'ruler scrub', 'trim scrub', 'properties update', 'worker render'] }, null, 2));
} finally { await browser.close(); }
