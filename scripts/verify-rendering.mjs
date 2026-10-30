import { openEditor, ensureSource } from './browser-helpers.mjs';
// Start Vite, then run with PLAYWRIGHT_MODULE and optional TEST_URL / ARTIFACT_DIR.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const dir = process.env.ARTIFACT_DIR ?? mkdtempSync(join(tmpdir(), 'editor-render-'));
mkdirSync(dir, { recursive: true });
const file = join(dir, 'source.mp4');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', file]);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript(() => { window.showOpenFilePicker = undefined; });
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5216');
  await openEditor(page);
  const result = await page.evaluate(async (bytes) => {
    const { importMedia } = await import('/src/media/import.ts');
    const { seedProject } = await import('/src/editor/seed.ts');
    const { VIDEO_CLIP_DEFAULTS, AUDIO_CLIP_DEFAULTS, layoutTimeline } = await import('/src/editor/model.ts');
    const { exportSource } = await import('/src/editor/exportSource.ts');
    const { exportMp4 } = await import('/src/export/index.ts');
    const { renderFrame } = await import('/src/playback/compositor.ts');
    const { ALL_FORMATS, Input, BlobSource, CanvasSink, AudioBufferSink } = await import('/node_modules/.vite/deps/mediabunny.js');
    const media = await importMedia(new File([new Uint8Array(bytes)], 'source.mp4', { type: 'video/mp4' }));
    const p = seedProject();
    p.name = 'Rendering verification'; p.output = { width: 320, height: 180, fps: 30 }; p.media = { [media.id]: media };
    const first = { ...VIDEO_CLIP_DEFAULTS, id: 'first', mediaId: media.id, start: 0.2, inS: 0.4, outS: 1.9, linkId: 'first', linked: true, transitionOut: { type: 'crossfade', duration: 0.5 } };
    const second = { ...first, id: 'second', start: 1.2, inS: 0.9, outS: 2.4, linkId: 'second', transitionOut: null };
    const overlay = { ...first, id: 'overlay', start: 0.5, inS: 0.7, outS: 1.2, linkId: null, fit: 'custom', scale: 35, x: 70, rot: 15, cropL: 30, transitionOut: null };
    const sound = (v) => ({ ...AUDIO_CLIP_DEFAULTS, id: `${v.id}-audio`, mediaId: media.id, start: v.start, inS: v.inS, outS: v.outS, linkId: v.linkId, linked: true, gainDb: -4.4, fadeIn: 0.25, fadeOut: 0.25, curveIn: 0, curveOut: 0 });
    p.tracks = [
      { id: 'text', name: 'T', label: '', kind: 'text', hidden: false, clips: [{ id: 'title', content: 'Real export', start: 0.3, duration: 2, size: 24, color: '#FFFFFF', pos: 'cc', x: 0, y: 0 }] },
      { id: 'overlay', name: 'V2', label: '', kind: 'video', hidden: false, clips: [overlay] },
      { id: 'v', name: 'V1', label: '', kind: 'video', hidden: false, clips: [first, second] },
      { id: 'a', name: 'A1', label: '', kind: 'audio', muted: false, clips: [sound(first), sound(second)] },
      { id: 'muted', name: 'A2', label: '', kind: 'audio', muted: true, clips: [{ ...sound(first), mediaId: 'missing' }] },
      { id: 'hidden', name: 'V3', label: '', kind: 'video', hidden: true, clips: [{ ...first, mediaId: 'missing' }] },
    ];
    const source = exportSource(p, layoutTimeline(p));
    const ctl = new AbortController();
    const prepared = await source.prepare(320, 180, 48000, ctl.signal);
    const mixed = prepared.audio;
    const rms = (t) => {
      const a = mixed.getChannelData(0), start = Math.round(t * 48000);
      let sum = 0; for (let i = start; i < start + 480; i++) sum += a[i] ** 2;
      return Math.sqrt(sum / 480);
    };
    const audio = { gap: rms(0.05), earlyFade: rms(0.22), steady: rms(0.7), fadeOut: rms(2.67), overlap: rms(1.45) };
    // Compare worker-decoded/composited frames against independent main-thread decoding.
    const input = new Input({ source: new BlobSource(new File([new Uint8Array(bytes)], 'source.mp4')), formats: ALL_FORMATS });
    const sink = new CanvasSink(await input.getPrimaryVideoTrack());
    const expected = document.createElement('canvas'); expected.width = 320; expected.height = 180;
    const g = expected.getContext('2d');
    const frameErrors = [];
    const sampled = new Map();
    const out = await exportMp4({ width: 320, height: 180, fps: 30, duration: source.duration, audio: mixed, renderFrame: async (request) => {
      const canvas = await prepared.renderFrame(request);
      if ([0, 9, 18, 43, 60, 79].includes(request.index)) {
        const images = new Map();
        for (const c of [first, second, overlay]) {
          if (request.time >= c.start && request.time < c.start + c.outS - c.inS) {
            const frame = await sink.getCanvas(c.inS + request.time - c.start);
            const copy = document.createElement('canvas'); copy.width = 320; copy.height = 180;
            copy.getContext('2d').drawImage(frame.canvas, 0, 0); images.set(c.id, copy);
          }
        }
        renderFrame(p, request.time, g, (clip) => images.get(clip.id) ?? null);
        const actual = canvas.getContext('2d').getImageData(0, 0, 320, 180).data;
        const reference = g.getImageData(0, 0, 320, 180).data;
        let error = 0; for (let i = 0; i < actual.length; i++) error += Math.abs(actual[i] - reference[i]);
        frameErrors.push(error / actual.length); sampled.set(request.index, actual.slice());
      }
      return canvas;
    } });
    let trimError = 0, trimSamples = 0;
    const originalAudio = await input.getPrimaryAudioTrack();
    for await (const { buffer, timestamp } of new AudioBufferSink(originalAudio).buffers(0.9, 0.91)) {
      const raw = buffer.getChannelData(0);
      for (let i = 0; i < raw.length; i++) {
        const sourceTime = timestamp + i / buffer.sampleRate;
        if (sourceTime < 0.9 || sourceTime >= 0.91) continue;
        const actualIndex = Math.round((sourceTime - first.inS + first.start) * 48000);
        trimError += Math.abs(mixed.getChannelData(0)[actualIndex] - raw[i] * 0.6);
        trimSamples++;
      }
    }
    trimError /= trimSamples;
    prepared.dispose(); input.dispose();
    const encoded = new Input({ source: new BlobSource(out.blob), formats: ALL_FORMATS });
    const decoded = new CanvasSink(await encoded.getPrimaryVideoTrack());
    const encodedErrors = [];
    for (const [index, reference] of sampled) {
      const image = await decoded.getCanvas(index / 30);
      g.resetTransform(); g.drawImage(image.canvas, 0, 0);
      const actual = g.getImageData(0, 0, 320, 180).data;
      let error = 0; for (let i = 0; i < actual.length; i++) error += Math.abs(actual[i] - reference[i]);
      encodedErrors.push(error / actual.length);
    }
    const encodedAudio = await encoded.getPrimaryAudioTrack();
    let energy = 0;
    for await (const { buffer } of new AudioBufferSink(encodedAudio).buffers(0.6, 0.8)) {
      energy += buffer.getChannelData(0).reduce((sum, x) => sum + x * x, 0);
    }
    encoded.dispose();
    const cancelled = new AbortController();
    const partial = await source.prepare(320, 180, 48000, cancelled.signal);
    const pending = partial.renderFrame({ index: 0, time: 0 }); cancelled.abort();
    let aborted = false; try { await pending; } catch (e) { aborted = e.name === 'AbortError'; } finally { partial.dispose(); }
    const missing = structuredClone(p); missing.tracks[2].clips[0].mediaId = 'missing';
    let missingError = ''; try { await exportSource(missing, layoutTimeline(missing)).prepare(320, 180, 48000, new AbortController().signal); } catch (e) { missingError = e.message; }
    const retry = await source.prepare(320, 180, 48000, new AbortController().signal);
    await retry.renderFrame({ index: 0, time: 0 }); retry.dispose();
    const base64 = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result.split(',')[1]); r.readAsDataURL(out.blob); });
    await (await import('/src/editor/storage.ts')).saveProject(p);
    return { frameErrors, encodedErrors, audio, trimError, trimSamples, energy, aborted, missingError, frameCount: out.frameCount, base64 };
  }, [...readFileSync(file)]);
  writeFileSync(join(dir, 'rendered.mp4'), Buffer.from(result.base64, 'base64'));
  delete result.base64;
  assert.equal(result.frameCount, 81);
  assert.ok(result.frameErrors.every((x) => x < 0.15), `Compositor mismatch: ${result.frameErrors}`);
  assert.ok(result.encodedErrors.every((x) => x < 8), `Encoded mismatch: ${result.encodedErrors}`);
  assert.equal(result.audio.gap, 0);
  assert.ok(result.audio.steady > 0.03 && result.audio.steady < 0.08);
  assert.ok(result.audio.earlyFade < result.audio.steady / 3);
  assert.ok(result.audio.fadeOut < result.audio.steady / 3);
  // Both sides are the same in-phase tone, so the equal-power crossfade sums to √2 at the midpoint.
  assert.ok(Math.abs(result.audio.overlap / result.audio.steady - Math.SQRT2) < 0.1, `overlap ratio ${result.audio.overlap / result.audio.steady}`);
  assert.ok(result.trimSamples > 400 && result.trimError < 0.002, `Audio trim mismatch: ${result.trimError}`);
  assert.ok(result.energy > 0);
  assert.ok(result.aborted);
  assert.match(result.missingError, /missing/);
  // Exercise the actual dialog and its downloadable file too.
  await page.reload();
  await openEditor(page);
  await ensureSource(page, 'source.mp4', file);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: '720p', exact: false }).click();
  await page.getByRole('button', { name: 'Start export', exact: true }).click();
  await page.getByRole('button', { name: 'Download', exact: true }).waitFor({ timeout: 90000 });
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), 'rendering-verification-720p.mp4');
  await download.saveAs(join(dir, download.suggestedFilename()));
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', join(dir, download.suggestedFilename())]));
  assert.ok(probe.streams.some((s) => s.codec_name === 'h264' && s.width === 1280 && s.height === 720));
  assert.ok(probe.streams.some((s) => s.codec_name === 'aac'));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', '1.433333', '-i', join(dir, download.suggestedFilename()), '-frames:v', '1', '-y', join(dir, 'rendered-frame.png')]);
  console.log(JSON.stringify({ result: 'PASS', ...result, artifacts: dir }, null, 2));
} finally { await browser.close(); }
