// Run against Vite with TEST_URL and PLAYWRIGHT_MODULE pointing to playwright-core.
// Exports sped-up and slowed-down clips through the real export path, and checks their length,
// pitch and video frames. Writes WAVs for a listening comparison to the evidence folder.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const dir = mkdtempSync(join(tmpdir(), 'speed-'));
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args, '-y']);

// 2 s of a 440 Hz tone over a frame counter, and a spoken sentence.
const tone = join(dir, 'tone.mp4');
ffmpeg('-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', tone);
const speech = join(dir, 'speech.m4a');
ffmpeg('-f', 'lavfi', '-i', 'flite=text=The quick brown fox jumps over the lazy dog. Testing slow motion audio.:voice=slt', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', speech);

function wav(path, channels, rate) {
  const n = channels[0].length, data = Buffer.alloc(44 + n * channels.length * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * channels.length * 2, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(channels.length, 22); data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * channels.length * 2, 28); data.writeUInt16LE(channels.length * 2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(n * channels.length * 2, 40);
  for (let i = 0; i < n; i++) channels.forEach((c, ch) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(c[i] * 32767))), 44 + (i * channels.length + ch) * 2));
  writeFileSync(path, data);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5212');
  await page.evaluate(async files => {
    const { importMedia } = await import('/src/media/import.ts');
    window.speedMedia = {};
    for (const [name, type, bytes] of files) window.speedMedia[name] = await importMedia(new File([new Uint8Array(bytes)], name, { type }));
  }, [['tone.mp4', 'video/mp4', [...readFileSync(tone)]], ['speech.m4a', 'audio/mp4', [...readFileSync(speech)]]]);

  // Exports one clip of `name` at `speed`, returning the mix and, for video, the frame at each time in `frames`.
  const exportClip = (name, speed, keepPitch, frames = [], start = 0) => page.evaluate(async ({ name, speed, keepPitch, frames, start }) => {
    const { AUDIO_CLIP_DEFAULTS, VIDEO_CLIP_DEFAULTS, layoutTimeline } = await import('/src/editor/model.ts');
    const { exportSource } = await import('/src/editor/exportSource.ts');
    const { ExportTrace } = await import('/src/export/trace.ts');
    const media = window.speedMedia[name];
    const base = { mediaId: media.id, start, inS: 0, outS: media.duration, linkId: 'L', linked: true, speed };
    const tracks = [{ kind: 'audio', id: 'A1', name: 'A1', label: '', muted: false, clips: [{ ...AUDIO_CLIP_DEFAULTS, ...base, id: 'a', keepPitch }] }];
    if (media.video) tracks.unshift({ kind: 'video', id: 'V1', name: 'V1', label: '', hidden: false, magnetic: false, clips: [{ ...VIDEO_CLIP_DEFAULTS, ...base, id: 'v' }] });
    const project = { name: 'Speed', output: { width: 160, height: 90, fps: 30 }, media: { [media.id]: media }, tracks };
    // A silent clip after it, so the mix runs on past its end.
    if (start) tracks[tracks.length - 1].clips.push({ ...AUDIO_CLIP_DEFAULTS, ...base, id: 'b', linkId: null, start: start + 1 + media.duration / speed, speed: 1, muted: true });
    const layout = layoutTimeline(project);
    const prepared = await exportSource(project, layout).prepare(160, 90, 48000, new AbortController().signal, new ExportTrace(() => 0, () => {}));
    const shots = {};
    // Every frame, so slowed clips ask the decoder for repeated timestamps.
    if (media.video) for (let i = 0; i < Math.round(layout.end * 30); i++) {
      const canvas = await prepared.renderFrame({ time: i / 30 });
      const t = Math.round(i / 30 * 1000) / 1000;
      if (frames.includes(t)) shots[t] = [...canvas.getContext('2d').getImageData(0, 0, 160, 90).data];
    }
    prepared.dispose();
    const channel = prepared.audio.getChannelData(0);
    return { end: layout.end, rate: prepared.audio.sampleRate, samples: [...channel], shots };
  }, { name, speed, keepPitch, frames, start });

  // Pitch from zero crossings in the steady middle, and how long the sound lasts.
  const measure = ({ samples, rate }) => {
    const mid = samples.slice(Math.floor(samples.length * 0.3), Math.floor(samples.length * 0.7));
    let crossings = 0;
    for (let i = 1; i < mid.length; i++) if ((mid[i - 1] < 0) !== (mid[i] < 0)) crossings++;
    const loud = samples.map(Math.abs);
    let last = loud.length - 1; while (last > 0 && loud[last] < 0.02) last--;
    return { hz: crossings / 2 / (mid.length / rate), seconds: last / rate };
  };
  const close = (actual, expected, tolerance, what) => assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual.toFixed(2)}, expected ${expected} ± ${tolerance}`);

  for (const [speed, keepPitch, hz] of [[0.5, true, 440], [2, true, 440], [0.5, false, 220], [2, false, 880], [1, true, 440]]) {
    const result = await exportClip('tone.mp4', speed, keepPitch);
    const m = measure(result);
    close(result.end, 2 / speed, 0.01, `${speed}× timeline length`);
    close(m.seconds, 2 / speed, 0.1, `${speed}× keepPitch=${keepPitch} audio length`);
    close(m.hz, hz, hz * 0.02, `${speed}× keepPitch=${keepPitch} pitch`);
    console.log(`PASS tone at ${speed}× ${keepPitch ? 'keeping pitch' : 'tape-style'}: ${m.seconds.toFixed(2)} s at ${m.hz.toFixed(1)} Hz`);
  }

  // Nothing of a stretched clip sounds outside it.
  const placed = await exportClip('speech.m4a', 0.5, true, [], 1);
  const peak = (from, to) => placed.samples.slice(Math.round(from * placed.rate), Math.round(to * placed.rate)).reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  const speechEnd = 1 + (await page.evaluate(() => window.speedMedia['speech.m4a'].duration)) / 0.5;
  assert.equal(peak(0, 1), 0, 'silent before the clip');
  assert.equal(peak(speechEnd, placed.samples.length / placed.rate), 0, 'silent after the clip');
  console.log('PASS a stretched clip stays inside its own span');

  // At half speed, sequence time 2 s shows the source frame from 1 s.
  const normal = await exportClip('tone.mp4', 1, true, [1]);
  const slow = await exportClip('tone.mp4', 0.5, true, [2]);
  const fast = await exportClip('tone.mp4', 2, true, [0.5]);
  assert.deepEqual(slow.shots[2], normal.shots[1], 'half speed shows the source frame from half the sequence time');
  assert.deepEqual(fast.shots[0.5], normal.shots[1], 'double speed shows the source frame from twice the sequence time');
  console.log('PASS video frames follow the speed, and every frame of a slowed clip decodes');

  // Preview: a media element at 2× plays an octave up, and the live stretcher brings it back down.
  for (const [speed, hz] of [[2, 880], [0.5, 220]]) {
    const live = await page.evaluate(async ({ speed, hz }) => {
      const { liveStretch, pitchCorrection } = await import('/src/playback/stretch.ts');
      const rate = 48000, ctx = new OfflineAudioContext(2, rate * 2, rate);
      const node = await liveStretch(ctx);
      await node.schedule({ output: 0, active: true, semitones: pitchCorrection(speed) });
      const osc = new OscillatorNode(ctx, { frequency: hz });
      osc.connect(node).connect(ctx.destination); osc.start();
      return { samples: [...(await ctx.startRendering()).getChannelData(0)], rate };
    }, { speed, hz });
    close(measure(live).hz, 440, 9, `live correction of ${hz} Hz at ${speed}×`);
    console.log(`PASS preview pitch correction: ${hz} Hz played at ${speed}× comes out at ${measure(live).hz.toFixed(1)} Hz`);
  }

  for (const [speed, keepPitch] of [[0.5, true], [0.5, false], [0.75, true], [1.5, true], [2, true]]) {
    const result = await exportClip('speech.m4a', speed, keepPitch);
    wav(join(dir, `speech-${speed}x-${keepPitch ? 'stretch' : 'tape'}.wav`), [result.samples], result.rate);
  }
  // The method that sounds robotic, for comparison.
  for (const speed of [0.5, 0.75]) ffmpeg('-i', speech, '-filter:a', `atempo=${speed}`, join(dir, `speech-${speed}x-atempo.wav`));
  ffmpeg('-i', speech, join(dir, 'speech-1x-original.wav'));

  // The editor: set 2× from the properties panel on a linked clip with another clip after it.
  await page.evaluate(async () => {
    const { AUDIO_CLIP_DEFAULTS, VIDEO_CLIP_DEFAULTS } = await import('/src/editor/model.ts');
    const { createProject, selectProject } = await import('/src/editor/storage.ts');
    const media = window.speedMedia['tone.mp4'];
    const pair = (id, start) => ({ mediaId: media.id, start, inS: 0, outS: 2, linkId: id, linked: true });
    await selectProject(await createProject({ name: 'Speed', output: { width: 1920, height: 1080, fps: 30 }, media: { [media.id]: media }, tracks: [
      { kind: 'video', id: 'V1', name: 'V1', label: '', hidden: false, magnetic: false, clips: [{ ...VIDEO_CLIP_DEFAULTS, ...pair('one', 0), id: 'one' }, { ...VIDEO_CLIP_DEFAULTS, ...pair('two', 2), id: 'two' }] },
      { kind: 'audio', id: 'A1', name: 'A1', label: '', muted: false, clips: [{ ...AUDIO_CLIP_DEFAULTS, ...pair('one', 0), id: 'one-a' }, { ...AUDIO_CLIP_DEFAULTS, ...pair('two', 2), id: 'two-a' }] },
    ] }));
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.reload();
  await page.getByRole('button', { name: 'Open Speed', exact: true }).click();
  await page.getByRole('button', { name: 'Projects', exact: true }).waitFor();
  const clips = page.locator('button.clip');
  await clips.first().click();
  await page.getByRole('tab', { name: 'Timing', exact: true }).click();
  const presets = page.getByRole('group', { name: 'Speed presets', exact: true });
  await presets.getByRole('button', { name: '0.5×', exact: true }).click();
  await page.locator('.clip .clip-speed').filter({ hasText: '0.5×' }).waitFor();
  await page.locator('.audio-clip .clip-speed').filter({ hasText: '0.5×' }).waitFor();
  const box = async (i) => clips.nth(i).boundingBox();
  const [one, two] = [await box(0), await box(1)];
  assert.ok(Math.abs(two.x - (one.x + one.width + 3)) < 2, 'the next clip follows the slowed clip without a gap');
  assert.match(await clips.first().getAttribute('aria-label'), /4\.0 seconds/);
  await page.getByText('Below 0.5×').waitFor({ state: 'hidden' });
  await presets.getByRole('button', { name: '0.25×', exact: true }).click();
  await page.getByText(/^Below 0\.5×/).waitFor();
  await presets.getByRole('button', { name: '0.5×', exact: true }).click();
  await page.getByRole('button', { name: 'Keep pitch', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Keep pitch', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: join(dir, 'editor-half-speed.png') });
  // Play through the slowed clip: the stretcher loads and routes the audio without errors.
  await page.keyboard.press('Escape');
  await page.locator('.timeline').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  console.log('PASS editor sets the speed, badges both clips, ripples the next clip, warns below 0.5× and plays');

  assert.deepEqual(errors, []);
  console.log(`PASS no page errors\nEvidence: ${dir}`);
} finally { await browser.close(); }
