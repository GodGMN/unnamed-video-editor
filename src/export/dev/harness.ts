// Dev-only test page for the export pipeline, served at /dev/export.html.
// Renders a synthetic A/V sync pattern, exports it, then parses the result back with Mediabunny.
// `window.exportHarness.run(...)` drives the same path for scripted browser checks.

import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { exportMp4, probeExportSupport } from '..';
import type { ExportProgress, ExportResult, SupportReport } from '..';
import '@fontsource/jetbrains-mono/500.css';

interface RunOptions {
  width: number;
  height: number;
  fps: number;
  duration: number;
  audio: boolean;
}

interface RunSummary {
  ok: boolean;
  error?: string;
  elapsedMs: number;
  bytes?: number;
  mimeType?: string;
  aacEncoder?: string | null;
  parsed?: Awaited<ReturnType<typeof inspect>>;
}

const SAMPLE_RATE = 48000;
const BEEP_SECONDS = 0.08;

document.title = 'Export harness';
document.body.innerHTML = `
  <style>
    :root { color-scheme: dark; font: 14px/1.5 'JetBrains Mono', ui-monospace, monospace; }
    body { margin: 0; background: #14161a; color: #e6e6e6; }
    main { max-width: 980px; margin: 0 auto; padding: 28px; display: grid; gap: 20px; }
    h1 { margin: 0; font-size: 18px; }
    h1 small { color: #8a8f98; font-weight: 400; }
    section { background: #1d2026; border: 1px solid #2c3038; border-radius: 10px; padding: 16px; }
    h2 { margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #8a8f98; }
    form { display: flex; flex-wrap: wrap; gap: 14px; align-items: end; }
    label { display: grid; gap: 4px; font-size: 12px; color: #8a8f98; }
    select, input, button { font: inherit; background: #262a31; color: inherit; border: 1px solid #3a3f49; border-radius: 6px; padding: 6px 10px; }
    input[type=number] { width: 80px; }
    button { cursor: pointer; }
    button.primary { background: #3d6b4f; border-color: #4f8a66; }
    button:disabled { opacity: .45; cursor: default; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 18px; margin: 0; }
    dt { color: #8a8f98; }
    dd { margin: 0; word-break: break-all; }
    .yes { color: #7fd69b; } .no { color: #ff8a80; } .meh { color: #f2c46d; }
    progress { width: 100%; height: 10px; accent-color: #4f8a66; }
    video { width: 100%; border-radius: 6px; background: #000; }
    .row { display: flex; gap: 16px; align-items: center; justify-content: space-between; }
    a { color: #8fc1ff; }
  </style>
  <main>
    <h1>MP4 export harness <small>src/export · dev only</small></h1>
    <section>
      <h2>Settings</h2>
      <form id="settings">
        <label>Resolution
          <select name="res">
            <option value="1920x1080">1080p · 1920×1080</option>
            <option value="1280x720">720p · 1280×720</option>
            <option value="640x360">360p · 640×360</option>
            <option value="1080x1920">1080p vertical · 1080×1920</option>
            <option value="1080x1080">1080p square · 1080×1080</option>
          </select>
        </label>
        <label>Frame rate
          <select name="fps"><option>30</option><option>60</option><option>24</option></select>
        </label>
        <label>Duration (s) <input name="duration" type="number" min="1" max="600" value="10" /></label>
        <label>Audio
          <select name="audio"><option value="1">Beeps + tone</option><option value="0">None</option></select>
        </label>
        <button class="primary" id="start" type="submit">Start export</button>
        <button id="cancel" type="button" disabled>Cancel</button>
      </form>
    </section>
    <section>
      <h2>Browser support</h2>
      <dl id="support"></dl>
    </section>
    <section>
      <h2>Progress</h2>
      <progress id="bar" max="1" value="0"></progress>
      <div class="row"><span id="status">Idle</span><span id="rate"></span></div>
    </section>
    <section id="result" hidden>
      <h2>Result</h2>
      <video id="video" controls playsinline></video>
      <dl id="facts" style="margin-top: 14px"></dl>
    </section>
  </main>
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('settings');
const startBtn = $<HTMLButtonElement>('start');
const cancelBtn = $<HTMLButtonElement>('cancel');
let controller: AbortController | null = null;
let objectUrl: string | null = null;

function readForm(): RunOptions {
  const data = new FormData(form);
  const [width, height] = String(data.get('res')).split('x').map(Number);
  return {
    width, height,
    fps: Number(data.get('fps')),
    duration: Number(data.get('duration')),
    audio: data.get('audio') === '1',
  };
}

function setFacts(el: HTMLElement, facts: [string, string, string?][]) {
  el.replaceChildren(...facts.flatMap(([k, v, cls]) => {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = k;
    dd.textContent = v;
    if (cls) dd.className = cls;
    return [dt, dd];
  }));
}

async function showSupport() {
  const { width, height, fps } = readForm();
  let report: SupportReport;
  try {
    report = await probeExportSupport({ width, height, fps, audio: { sampleRate: SAMPLE_RATE, numberOfChannels: 2 } });
  } catch (err) {
    setFacts($('support'), [['Probe failed', String(err), 'no']]);
    return;
  }
  const yn = (ok: boolean): [string, string] => ok ? ['yes', 'yes'] : ['no', 'no'];
  setFacts($('support'), [
    ['User agent', navigator.userAgent],
    ['WebCodecs VideoEncoder', ...yn(report.webCodecs)],
    [`H.264 at ${width}×${height}`, ...yn(report.h264)],
    ['AAC 48 kHz stereo', report.aac === 'native' ? 'native WebCodecs encoder'
      : report.aac === 'wasm' ? 'WASM fallback (@mediabunny/aac-encoder)' : 'unavailable',
      report.aac === 'native' ? 'yes' : report.aac === 'wasm' ? 'meh' : 'no'],
  ]);
}

/** Offline-renders a low tone plus a short beep at every whole second, matching the white flash in the video. */
async function makeAudio(duration: number) {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  const hum = new OscillatorNode(ctx, { frequency: 220 });
  const humGain = new GainNode(ctx, { gain: 0.08 });
  hum.connect(humGain).connect(ctx.destination);
  hum.start();
  for (let t = 0; t < duration; t++) {
    const beep = new OscillatorNode(ctx, { frequency: 1000 });
    const gain = new GainNode(ctx, { gain: 0.5 });
    beep.connect(gain).connect(ctx.destination);
    beep.start(t);
    beep.stop(t + BEEP_SECONDS);
  }
  return ctx.startRendering();
}

/** Draws the test pattern for one frame onto a reused canvas. */
function makeRenderer(width: number, height: number, fps: number) {
  const canvas = new OffscreenCanvas(width, height);
  const g = canvas.getContext('2d')!;
  const s = Math.min(width, height) / 1080;
  return ({ index, time }: { index: number; time: number }) => {
    g.fillStyle = `hsl(${(time * 36) % 360} 35% 18%)`;
    g.fillRect(0, 0, width, height);

    const x = width / 2 + Math.sin(time * 1.3) * width * 0.35;
    const y = height / 2 + Math.cos(time * 2.1) * height * 0.3;
    g.fillStyle = '#4f8a66';
    g.beginPath();
    g.arc(x, y, 90 * s, 0, Math.PI * 2);
    g.fill();

    if (time % 1 < BEEP_SECONDS) {
      g.fillStyle = '#fff';
      g.fillRect(width - 220 * s, 60 * s, 160 * s, 160 * s);
    }

    const secs = Math.floor(time);
    const ff = String(index % fps).padStart(2, '0');
    g.fillStyle = '#fff';
    g.font = `500 ${120 * s}px 'JetBrains Mono', monospace`;
    g.fillText(`${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}:${ff}`,
      80 * s, height - 160 * s);
    g.font = `500 ${40 * s}px 'JetBrains Mono', monospace`;
    g.fillStyle = '#c9ccd2';
    g.fillText(`frame ${index}  ·  ${width}×${height} @ ${fps} fps`, 84 * s, height - 90 * s);
    return canvas;
  };
}

/** Parses the exported file back with Mediabunny to confirm what was written. */
async function inspect(blob: Blob) {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    const videoStats = video && await video.computePacketStats();
    return {
      format: (await input.getFormat()).name,
      duration: await input.computeDuration(),
      video: video && {
        codec: await video.getCodecParameterString(),
        width: await video.getDisplayWidth(),
        height: await video.getDisplayHeight(),
        frames: videoStats!.packetCount,
        fps: videoStats!.averagePacketRate,
      },
      audio: audio && {
        codec: await audio.getCodecParameterString(),
        sampleRate: await audio.getSampleRate(),
        channels: await audio.getNumberOfChannels(),
      },
    };
  } finally {
    input.dispose();
  }
}

let lastBlob: Blob | null = null;

async function run(opts: RunOptions): Promise<RunSummary> {
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;
  startBtn.disabled = true;
  cancelBtn.disabled = false;
  $('result').hidden = true;
  const bar = $<HTMLProgressElement>('bar');
  const status = $('status');
  const rate = $('rate');
  const t0 = performance.now();

  const onProgress = (p: ExportProgress) => {
    bar.value = p.fraction;
    const secs = (performance.now() - t0) / 1000;
    status.textContent = p.phase === 'finalizing' ? 'Writing MP4…' : `Encoding frame ${p.framesDone} / ${p.totalFrames}`;
    rate.textContent = secs > 0 ? `${(p.framesDone / secs).toFixed(1)} fps · ${secs.toFixed(1)} s` : '';
  };

  try {
    status.textContent = opts.audio ? 'Rendering audio…' : 'Starting…';
    const audio = opts.audio ? await makeAudio(opts.duration) : undefined;
    const result: ExportResult = await exportMp4({
      ...opts,
      audio,
      renderFrame: makeRenderer(opts.width, opts.height, opts.fps),
      onProgress,
      signal,
    });
    const elapsedMs = performance.now() - t0;
    const parsed = await inspect(result.blob);
    lastBlob = result.blob;
    showResult(result, parsed, elapsedMs, opts);
    status.textContent = `Done in ${(elapsedMs / 1000).toFixed(1)} s`;
    return {
      ok: true, elapsedMs, bytes: result.blob.size, mimeType: result.mimeType, aacEncoder: result.aacEncoder, parsed,
    };
  } catch (err) {
    const aborted = signal.aborted;
    status.textContent = aborted ? 'Canceled' : `Failed: ${String(err)}`;
    bar.value = 0;
    return { ok: false, error: aborted ? 'canceled' : String(err), elapsedMs: performance.now() - t0 };
  } finally {
    startBtn.disabled = false;
    cancelBtn.disabled = true;
  }
}

function showResult(result: ExportResult, parsed: Awaited<ReturnType<typeof inspect>>, elapsedMs: number, opts: RunOptions) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(result.blob);
  $<HTMLVideoElement>('video').src = objectUrl;
  const name = `export-${opts.height}p-${opts.fps}fps.mp4`;
  const v = parsed.video;
  const a = parsed.audio;
  setFacts($('facts'), [
    ['File', `${name} · ${(result.blob.size / 1e6).toFixed(2)} MB`],
    ['MIME type', result.mimeType],
    ['Container', `${parsed.format} · ${parsed.duration.toFixed(3)} s`],
    ['Video', v ? `${v.codec} · ${v.width}×${v.height} · ${v.frames} frames · ${v.fps.toFixed(2)} fps` : 'none'],
    ['Audio', a ? `${a.codec} · ${a.sampleRate} Hz · ${a.channels} ch` : 'none'],
    ['AAC encoder', result.aacEncoder ?? '—'],
    ['Encode time', `${(elapsedMs / 1000).toFixed(2)} s · ${(result.frameCount / (elapsedMs / 1000)).toFixed(1)} fps`],
  ]);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = name;
  link.textContent = 'Download';
  const dt = document.createElement('dt');
  dt.textContent = 'Save';
  const dd = document.createElement('dd');
  dd.append(link);
  $('facts').append(dt, dd);
  $('result').hidden = false;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  void run(readForm());
});
form.addEventListener('change', () => void showSupport());
cancelBtn.addEventListener('click', () => controller?.abort());
void showSupport();

declare global {
  interface Window {
    exportHarness: {
      run: (opts: RunOptions) => Promise<RunSummary>;
      cancel: () => void;
      /** The last exported file as base64, for pulling it out of a scripted browser. */
      lastFileBase64: () => Promise<string | null>;
    };
  }
}

window.exportHarness = {
  run,
  cancel: () => controller?.abort(),
  lastFileBase64: async () => {
    if (!lastBlob) return null;
    const bytes = new Uint8Array(await lastBlob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  },
};
