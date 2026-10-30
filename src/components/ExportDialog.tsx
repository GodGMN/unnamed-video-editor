import { useEffect, useRef, useState } from 'react';
import { fmtTime } from '../editor/model';
import { ExportError, exportMp4, probeExportSupport } from '../export';
import type { ExportErrorCode, ExportOptions, ExportResult, SupportReport } from '../export';
import { Download } from './icons';
import { Alert, CheckRow, Choice, Dialog, Progress, ResultCard } from './Dialog';
import type { StageStatus } from './Dialog';

type Step = 'settings' | 'rendering' | 'done' | 'error';
type Res = '720' | '1080';

/** What the editor hands the dialog: a frame renderer and an audio mixdown for the current timeline. */
export interface ExportSource {
  /** Sequence length in seconds. */
  duration: number;
  fps: number;
  /** Returns the frame callback for one export at the given output size. */
  frames: (width: number, height: number) => ExportOptions['renderFrame'];
  /** Mixes the timeline's audio to a single buffer starting at 0 s, or `null` for a silent export. */
  mixAudio: (sampleRate: number) => Promise<AudioBuffer | null>;
}

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const SIZES: Record<Res, [number, number]> = { '720': [1280, 720], '1080': [1920, 1080] };

const COPY: Record<Step, [string, string]> = {
  settings: ['Export video', 'Rendered on this device. Nothing is uploaded.'],
  rendering: ['Rendering', 'Encoding frames and mixing audio locally.'],
  done: ['Your video is ready', 'Saved in memory — download it before closing the tab.'],
  error: ['Export stopped', 'Nothing was saved. Your timeline is unchanged.'],
};

const ERROR_TITLES: Record<ExportErrorCode | 'unknown', string> = {
  'unsupported-video': 'This browser can’t encode H.264 video',
  'unsupported-audio': 'This browser can’t encode AAC audio',
  'invalid-options': 'These export settings aren’t valid',
  'invalid-frame': 'A frame couldn’t be rendered',
  'encode-failed': 'Encoding failed',
  unknown: 'Export failed',
};

interface RenderState {
  phase: 'mixing' | 'encoding' | 'finalizing';
  framesDone: number;
  fraction: number;
  /** When encoding started, for the time-left estimate. */
  t0: number;
}

interface Failure {
  code: ExportErrorCode | 'unknown';
  message: string;
}

interface Props {
  projectSlug: string;
  source: ExportSource;
  onClose: () => void;
}

export function ExportDialog({ projectSlug, source, onClose }: Props) {
  const { fps } = source;
  const [step, setStep] = useState<Step>('settings');
  const [res, setRes] = useState<Res>('1080');
  const [support, setSupport] = useState<SupportReport | 'failed' | null>(null);
  const [progress, setProgress] = useState<RenderState | null>(null);
  const [result, setResult] = useState<{ res: Res; out: ExportResult; url: string } | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [title, subtitle] = COPY[step];
  const [width, height] = SIZES[res];
  const totalFrames = Math.max(1, Math.round(source.duration * fps));

  useEffect(() => {
    let live = true;
    setSupport(null);
    probeExportSupport({ width, height, fps, audio: { sampleRate: SAMPLE_RATE, numberOfChannels: CHANNELS } })
      .then((r) => { if (live) setSupport(r); }, () => { if (live) setSupport('failed'); });
    return () => { live = false; };
  }, [width, height, fps]);

  // Closing the dialog mid-export stops it.
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const start = async () => {
    const ctl = new AbortController();
    controller.current = ctl;
    setResult(null);
    setProgress({ phase: 'mixing', framesDone: 0, fraction: 0, t0: 0 });
    setStep('rendering');
    try {
      const audio = await source.mixAudio(SAMPLE_RATE);
      ctl.signal.throwIfAborted();
      const t0 = performance.now();
      const out = await exportMp4({
        width, height, fps, duration: source.duration,
        renderFrame: source.frames(width, height),
        audio: audio ?? undefined,
        signal: ctl.signal,
        onProgress: (p) => setProgress({ phase: p.phase, framesDone: p.framesDone, fraction: p.fraction, t0 }),
      });
      setResult({ res, out, url: URL.createObjectURL(out.blob) });
      setStep('done');
    } catch (err) {
      if (ctl.signal.aborted) return;
      setFailure(err instanceof ExportError
        ? { code: err.code, message: err.message }
        : { code: 'unknown', message: err instanceof Error ? err.message : String(err) });
      setStep('error');
    } finally {
      if (controller.current === ctl) controller.current = null;
    }
  };

  const cancel = () => {
    controller.current?.abort();
    setStep('settings');
  };

  const download = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.url;
    a.download = `${projectSlug}-${result.res}p.mp4`;
    a.click();
  };

  const supported = support !== null && support !== 'failed' && support.h264 && support.aac !== null;

  return (
    <Dialog id="exp-title" title={title} subtitle={subtitle} warn={step === 'error'} width={520} onClose={onClose}>
      {step === 'settings' && (
        <div className="dialog-body" style={{ paddingTop: 22 }}>
          <Choice label="Resolution" value={res} onChange={setRes} options={[
            { key: '720', label: '720p', sub: '1280×720' },
            { key: '1080', label: '1080p', sub: '1920×1080' },
          ]} />
          <div className="rows">
            <div><span className="k">Format</span><span className="v">MP4 · H.264 + AAC</span></div>
            <div><span className="k">Frame rate</span><span className="v">{fps} fps</span></div>
            <div><span className="k">Duration</span><span className="mono">{fmtTime(source.duration)}</span></div>
            <div><span className="k">Frames</span><span className="mono">{totalFrames}</span></div>
          </div>
          <BrowserCheck support={support} width={width} height={height} fps={fps} />
          <div className="dialog-actions" style={{ paddingTop: 4 }}>
            <button className="gb" onClick={onClose}>Cancel</button>
            <button className="primary" onClick={start} disabled={!supported}>Start export</button>
          </div>
        </div>
      )}

      {step === 'rendering' && progress && (
        <div className="dialog-body" style={{ paddingTop: 24 }}>
          <Progress pct={progress.fraction * 100} detail={`frame ${progress.framesDone} / ${totalFrames}`} label="Export progress"
            stages={stages(progress, totalFrames)} note={`${timeLeft(progress)} Keep this tab open — rendering happens on your device.`} />
          <div className="dialog-actions">
            <button className="gb" onClick={cancel}>Cancel export</button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="dialog-body" style={{ paddingTop: 22 }}>
          <ResultCard tone="#35503F" name={`${projectSlug}-${result.res}p.mp4`}
            meta={`${SIZES[result.res].join('×')} · ${fmtTime(result.out.frameCount / fps)} · ${fmtBytes(result.out.blob.size)} · H.264 + AAC`}
            extra={<span className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>{codecLine(result.out)}</span>} />
          <div className="dialog-actions split">
            <button className="link-btn" onClick={() => setStep('settings')}>Export again</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="gb" onClick={onClose}>Back to editor</button>
              <button className="primary" onClick={download}><Download size={15} strokeWidth={2.4} />Download</button>
            </div>
          </div>
        </div>
      )}

      {step === 'error' && failure && (
        <div className="dialog-body" style={{ paddingTop: 22 }}>
          <Alert title={ERROR_TITLES[failure.code]}>{failure.message}</Alert>
          <div className="dialog-actions">
            {failure.code === 'unsupported-video' && res === '1080' && (
              <button className="gb" onClick={() => { setRes('720'); setStep('settings'); }}>Try 720p</button>
            )}
            <button className="primary" onClick={() => setStep('settings')}>Back to settings</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function BrowserCheck({ support, width, height, fps }: { support: SupportReport | 'failed' | null; width: number; height: number; fps: number }) {
  const rows = support === null
    ? [{ label: 'Checking encoders…', status: 'pending' as const, note: '' }]
    : support === 'failed'
      ? [{ label: 'Encoder check failed', status: 'fail' as const, note: 'export unavailable' }]
      : [
        { label: 'WebCodecs', status: support.webCodecs ? 'ok' as const : 'fail' as const, note: support.webCodecs ? 'available' : 'not available' },
        { label: 'H.264 video encoder', status: support.h264 ? 'ok' as const : 'fail' as const, note: support.h264 ? `${width}×${height} · ${fps} fps` : `not at ${width}×${height}` },
        {
          label: 'AAC audio encoder', status: support.aac ? 'ok' as const : 'fail' as const,
          note: support.aac === 'native' ? 'built in · 48 kHz stereo' : support.aac === 'wasm' ? 'bundled fallback · 48 kHz stereo' : 'not available',
        },
      ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Browser check</span>
      {rows.map((r) => <CheckRow key={r.label} {...r} />)}
    </div>
  );
}

function stages(p: RenderState, totalFrames: number): { label: string; status: StageStatus; note: string }[] {
  const order = ['mixing', 'encoding', 'finalizing'] as const;
  const at = order.indexOf(p.phase);
  const status = (i: number): StageStatus => (i < at ? 'done' : i === at ? 'active' : 'wait');
  return [
    { label: 'Mixing audio', status: status(0), note: '48 kHz stereo' },
    { label: 'Composing and encoding frames', status: status(1), note: `${p.framesDone} / ${totalFrames}` },
    { label: 'Writing MP4', status: status(2), note: p.phase === 'finalizing' ? 'finishing' : '—' },
  ];
}

function timeLeft(p: RenderState) {
  if (p.phase === 'mixing' || p.fraction < 0.02) return 'Estimating time left.';
  if (p.phase === 'finalizing') return 'Almost done.';
  const elapsed = (performance.now() - p.t0) / 1000;
  return `About ${Math.max(1, Math.round(elapsed / p.fraction - elapsed))} s left.`;
}

const fmtBytes = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`);

/** e.g. `avc1.640028 · mp4a.40.2 (bundled encoder)`. */
function codecLine({ mimeType, aacEncoder }: ExportResult) {
  const codecs = /codecs="([^"]+)"/.exec(mimeType)?.[1].split(/,\s*/).join(' · ') ?? mimeType;
  return aacEncoder === 'wasm' ? `${codecs} (bundled AAC encoder)` : codecs;
}
