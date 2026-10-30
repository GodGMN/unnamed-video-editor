// Run Vite, then PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs TEST_URL=http://127.0.0.1:5217 node scripts/verify-preview-cache.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const dir = mkdtempSync(join(tmpdir(), 'preview-cache-'));
const file = join(dir, 'cuts.mp4');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=red:size=320x180:rate=60:duration=1', '-f', 'lavfi', '-i', 'color=blue:size=320x180:rate=60:duration=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-map', '2:a', '-c:a', 'aac', '-c:v', 'libx264', '-g', '60', '-pix_fmt', 'yuv420p', '-y', file]);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5217');
  const result = await page.evaluate(async (bytes) => {
    const { PlaybackEngine } = await import('/src/playback/engine.ts');
    const { VIDEO_CLIP_DEFAULTS, AUDIO_CLIP_DEFAULTS } = await import('/src/editor/model.ts');
    const { writeMediaFile } = await import('/src/media/files.ts');
    const file = new File([new Uint8Array(bytes)], 'cuts.mp4', { type: 'video/mp4' });
    await writeMediaFile('cache-test', file);
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
    document.body.replaceChildren(canvas);
    const statuses = [];
    const engine = new PlaybackEngine(canvas, (s) => { if (s) statuses.push(s); });
    const clip = (id, start, inS, outS) => ({ ...VIDEO_CLIP_DEFAULTS, id, mediaId: 'cache-test', start, inS, outS, linkId: null });
    const project = { name: 'Cache test', output: { width: 320, height: 180, fps: 60 }, media: { 'cache-test': { id: 'cache-test', name: 'cuts.mp4', video: { width: 320, height: 180 } } }, tracks: [{ id: 'v', kind: 'video', hidden: false, clips: [clip('red', 0, 0, 1), clip('blue', 1, 1, 2)] }] };
    const pixel = () => Array.from(canvas.getContext('2d').getImageData(160, 90, 1, 1).data).slice(0, 3);
    const wait = async (fn, message) => { const until = performance.now() + 10000; while (!fn()) { if (performance.now() > until) throw Error(message); await new Promise((r) => setTimeout(r, 10)); } };
    const update = (time, playing = false) => engine.update({ project, time, playing, volume: 0 });
    update(0);
    await wait(() => pixel()[0] > 240, 'first red frame');
    // Check actual prepared frames: the cut must draw blue synchronously, with no async loading at the boundary.
    await wait(() => engine.entries.get('blue')?.frames?.frame(1, false), 'next clip preroll');
    update(1);
    const cut = pixel();
    project.tracks[0].clips[0].transitionOut = { type: 'crossfade', duration: 0.5 };
    project.tracks[0].clips[1].start = 0.5;
    update(0.75);
    await wait(() => { const p = pixel(); return p[0] > 110 && p[0] < 140 && p[2] > 110 && p[2] < 140; }, 'decoded crossfade midpoint');
    const crossfade = pixel();
    project.tracks[0].clips[0].transitionOut = null;
    project.tracks[0].clips[1].start = 1;
    update(0.2); update(1.4); update(0.1); update(1.2);
    await wait(() => pixel()[2] > 240, 'latest rapid seek wins');
    const seek = pixel();
    update(0.123);
    await wait(() => pixel()[0] > 240, 'seek back');
    // A completed decoder must restart when an idle scrub moves backward outside its frame window.
    const { FrameCache } = await import('/src/playback/frameCache.ts');
    const isolated = new FrameCache(file, canvas, () => {}, (e) => { throw e; });
    isolated.request(1.7, false);
    await wait(() => isolated.frame(1.7, false), 'isolated forward seek');
    isolated.request(0.1, false);
    await wait(() => isolated.frame(0.1, false), 'idle backward seek');
    isolated.dispose();
    const exact = engine.entries.get('red').frames;
    await wait(() => exact.frame(0.123, false), 'frame containing a non-boundary timestamp');
    // Exercise real high-fps sequential decode, checking that prefetch never evicts the current frame.
    let misses = 0;
    for (let i = 10; i < 55; i++) {
      update(i / 60, true);
      await new Promise((r) => setTimeout(r, 17));
      if (pixel()[0] < 200) misses++;
    }
    // A deliberately slow audio seek must not hold up a prepared video frame.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { ...descriptor, set(value) { setTimeout(() => descriptor.set.call(this, value), 300); } });
    project.tracks.push({ id: 'a', kind: 'audio', muted: false, clips: [{ ...AUDIO_CLIP_DEFAULTS, id: 'audio', mediaId: 'cache-test', start: 0, inS: 0.5, outS: 2, linkId: null }] });
    update(1.1);
    await wait(() => engine.entries.get('audio')?.audio?.busy, 'slow audio seek started');
    update(1.1);
    const duringAudioSeek = pixel();
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', descriptor);
    project.tracks.pop();
    // Move through a long timeline and inspect live resources, not cumulative allocation counts.
    project.tracks[0].clips = Array.from({ length: 24 }, (_, i) => clip(`long-${i}`, i, 0, 1));
    let maxEntries = 0, maxFrames = 0;
    for (let i = 0; i < 24; i++) {
      update(i + 0.2);
      await wait(() => pixel()[0] > 240, `long timeline frame ${i}: ${JSON.stringify(statuses)}`);
      maxEntries = Math.max(maxEntries, engine.entries.size);
      maxFrames = Math.max(maxFrames, ...[...engine.entries.values()].map((e) => e.frames?.frames.length ?? 0));
    }
    const frames = [...engine.entries.values()].flatMap((e) => e.frames?.frames ?? []).map((f) => f.canvas);
    engine.dispose();
    return { cut, crossfade, seek, misses, duringAudioSeek, maxEntries, maxFrames, entriesAfterDispose: engine.entries.size, releasedCanvases: frames.every((c) => c.width === 0 && c.height === 0), statuses };
  }, [...readFileSync(file)]);
  assert.ok(result.cut[2] > 240, 'preloaded cut draws synchronously');
  assert.ok(result.crossfade[0] > 110 && result.crossfade[2] > 110, 'decoded clips crossfade together');
  assert.ok(result.seek[2] > 240, 'latest seek wins');
  assert.equal(result.misses, 0, '60fps prefetch keeps current frames');
  assert.ok(result.duringAudioSeek[2] > 240, 'video does not await audio seeking');
  assert.ok(result.maxEntries <= 3, 'one active and at most two inactive clip resources');
  assert.ok(result.maxFrames <= 12, 'bounded frame window');
  assert.equal(result.entriesAfterDispose, 0);
  assert.equal(result.releasedCanvases, true);
  assert.deepEqual(result.statuses, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', ...result }, null, 2));
} finally { await browser.close(); }
