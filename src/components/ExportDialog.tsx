import { useT } from '../i18n';
import { t as translate, formatNumber } from '../i18n/core';
import { useEffect, useRef, useState } from 'react';
import { exportSize, fmtTime } from '../editor/model';
import { ExportError, exportMp4, probeExportSupport } from '../export';
import type { ExportErrorCode, ExportOptions, ExportResult, StartStatus, SupportReport } from '../export';
import { ExportTrace } from '../export/trace';
import { Download } from './icons';
import { Alert, CheckRow, Choice, Dialog, Progress, ResultCard } from './Dialog';
import type { StageStatus } from './Dialog';
import { reportError } from '../toast/store';

type Step = 'settings' | 'rendering' | 'done';
type Res = '720' | '1080';

/** What the editor hands the dialog: a frame renderer and an audio mixdown for the current timeline. */
export interface ExportSource {
  /** Sequence length in seconds. */
  duration: number;
  fps: number;
  /** The project's frame; export sizes keep its ratio. */
  output: { width: number; height: number };
  /** Reports each preparation step to `trace`, so a hang shows where it stopped. */
  prepare: (width: number, height: number, sampleRate: number, signal: AbortSignal, trace: ExportTrace) => Promise<{
    renderFrame: ExportOptions['renderFrame'];
    audio: AudioBuffer | null;
    dispose: () => void;
  }>;
}

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
/** Seconds without any step or progress before the dialog warns that the export looks stuck. */
const STALL_SECONDS = 15;

const START_STATUS: Record<StartStatus, () => string> = {
  'video-check': () => translate('exportStatusVideoCheck'),
  'audio-encoder': () => translate('exportStatusAudioEncoder'),
  muxer: () => translate('exportStatusMuxer'),
};

const COPY: Record<Step, [string, string]> = {
  get settings(): [string, string] { return [translate('exportVideo'), translate('renderedOnThisDeviceNothingIsUploaded')]; },
  get rendering(): [string, string] { return [translate('rendering'), translate('encodingFramesAndMixingAudioLocally')]; },
  get done(): [string, string] { return [translate('yourVideoIsReady'), translate('savedInMemoryDownloadItBeforeClosingTheTab')]; },
};

const ERROR_TITLES: Record<ExportErrorCode | 'unknown', string> = {
  get 'unsupported-video'() { return translate('thisBrowserCanTEncodeH264Video'); },
  get 'unsupported-audio'() { return translate('thisBrowserCanTEncodeAACAudio'); },
  get 'invalid-options'() { return translate('theseExportSettingsArenTValid'); },
  get 'invalid-frame'() { return translate('aFrameCouldnTBeRendered'); },
  get 'encode-failed'() { return translate('encodingFailed'); },
  get unknown() { return translate('exportFailed'); },
};

interface RenderState {
  phase: 'mixing' | 'encoding' | 'finalizing';
  framesDone: number;
  fraction: number;
  /** When encoding started, for the time-left estimate. */
  t0: number;
}

interface Props {
  projectSlug: string;
  source: ExportSource;
  onClose: () => void;
}

export function ExportDialog({ projectSlug, source, onClose }: Props) {
  useT();
  const { fps, output } = source;
  /** Each resolution is the short side of the frame, so 1080p at 9:16 is 1080×1920. */
  const size = (r: Res) => exportSize(output, Number(r));
  const [step, setStep] = useState<Step>('settings');
  const [res, setRes] = useState<Res>('1080');
  const [support, setSupport] = useState<SupportReport | 'failed' | null>(null);
  const [progress, setProgress] = useState<RenderState | null>(null);
  const [result, setResult] = useState<{ res: Res; out: ExportResult; url: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const trace = useRef<ExportTrace | null>(null);
  const [, setTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const [title, subtitle] = COPY[step];
  const { width, height } = size(res);
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

  // Re-render every second while rendering, so the stall warning appears even when nothing else changes.
  useEffect(() => {
    if (step !== 'rendering') return;
    let warned = false;
    const id = setInterval(() => {
      setTick((n) => n + 1);
      const t = trace.current;
      if (!warned && t && t.idleSeconds() >= STALL_SECONDS) {
        warned = true;
        console.warn(`[export] no progress for ${STALL_SECONDS}s\n${diagnostics(t)}`);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  const diagnostics = (t: ExportTrace) => t.report({
    browser: navigator.userAgent,
    output: `${width}×${height} @ ${fps} fps, ${totalFrames} frames, ${source.duration.toFixed(2)} s`,
    encoders: support && support !== 'failed' ? `h264 ${support.h264}, aac ${support.aac}` : String(support),
  });

  const copyDiagnostics = async () => {
    if (!trace.current) return;
    await navigator.clipboard.writeText(diagnostics(trace.current));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const start = async () => {
    const ctl = new AbortController();
    controller.current = ctl;
    const t = new ExportTrace();
    trace.current = t;
    setResult(null);
    setProgress({ phase: 'mixing', framesDone: 0, fraction: 0, t0: 0 });
    setStep('rendering');
    let prepared: Awaited<ReturnType<ExportSource['prepare']>> | undefined;
    try {
      prepared = await source.prepare(width, height, SAMPLE_RATE, ctl.signal, t);
      ctl.signal.throwIfAborted();
      t.step(translate('exportStepStartingEncoder'));
      const t0 = performance.now();
      const out = await exportMp4({
        width, height, fps, duration: source.duration,
        renderFrame: prepared.renderFrame,
        audio: prepared.audio ?? undefined,
        signal: ctl.signal,
        onStatus: (status) => t.step(translate('exportStepStartingEncoder'), '', START_STATUS[status]()),
        onProgress: (p) => {
          const label = p.phase === 'encoding' ? translate('composingAndEncodingFrames') : translate('writingMP4');
          if (t.current?.label !== label) t.step(label);
          t.progress(`${p.framesDone} / ${p.totalFrames}`);
          setProgress({ phase: p.phase, framesDone: p.framesDone, fraction: p.fraction, t0 });
        },
      });
      t.end();
      ctl.signal.throwIfAborted();
      setResult({ res, out, url: URL.createObjectURL(out.blob) });
      setStep('done');
    } catch (err) {
      if (ctl.signal.aborted) return;
      console.error(`[export] failed\n${diagnostics(t)}`, err);
      const code = err instanceof ExportError ? err.code : 'unknown';
      reportError(ERROR_TITLES[code], err, code === 'unsupported-video' && res === '1080'
        ? { label: translate('try720p'), run: () => setRes('720') }
        : undefined);
      setStep('settings');
    } finally {
      prepared?.dispose();
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
    <Dialog id="exp-title" title={title} subtitle={subtitle} width={520} onClose={onClose}>
      {step === 'settings' && (
        <div className="dialog-body" style={{ paddingTop: 22 }}>
          <Choice label={translate('resolution')} value={res} onChange={setRes} options={[
            { key: '720', label: '720p', sub: dims(size('720')) },
            { key: '1080', label: '1080p', sub: dims(size('1080')) },
          ]} />
          <div className="rows">
            <div><span className="k">{translate('format')}</span><span className="v">{"MP4 · H.264 + AAC"}</span></div>
            <div><span className="k">{translate('frameRate')}</span><span className="v">{translate('fps2', { value1: fps })}</span></div>
            <div><span className="k">{translate('duration')}</span><span className="mono">{fmtTime(source.duration)}</span></div>
            <div><span className="k">{translate('frames')}</span><span className="mono">{totalFrames}</span></div>
          </div>
          <BrowserCheck support={support} width={width} height={height} fps={fps} />
          <div className="dialog-actions" style={{ paddingTop: 4 }}>
            <button className="gb" onClick={onClose}>{translate('cancel')}</button>
            <button className="primary" onClick={start} disabled={!supported}>{translate('startExport')}</button>
          </div>
        </div>
      )}

      {step === 'rendering' && progress && (
        <div className="dialog-body" style={{ paddingTop: 24 }}>
          <Progress pct={progress.fraction * 100} detail={translate('frame', { value1: progress.framesDone, value2: totalFrames })} label={translate('exportProgress')}
            stages={stages(progress, totalFrames, trace.current)} note={translate('keepThisTabOpenRenderingHappensOnYourDevice', { value1: timeLeft(progress) })} />
          {trace.current && trace.current.idleSeconds() >= STALL_SECONDS && (
            <Alert title={translate('exportLooksStuck', { value1: Math.round(trace.current.idleSeconds()) })}>
              {translate('exportStuckOn', { value1: stepText(trace.current, true) })}
            </Alert>
          )}
          <div className="dialog-actions split">
            <button className="link-btn" onClick={copyDiagnostics}>{copied ? translate('diagnosticsCopied') : translate('copyDiagnostics')}</button>
            <button className="gb" onClick={cancel}>{translate('cancelExport')}</button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="dialog-body" style={{ paddingTop: 22 }}>
          <ResultCard tone="#35503F" name={`${projectSlug}-${result.res}p.mp4`}
            meta={translate('h264AAC', { value1: dims(size(result.res)), value2: fmtTime(result.out.frameCount / fps), value3: fmtBytes(result.out.blob.size) })}
            extra={<span className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>{codecLine(result.out)}</span>} />
          <div className="dialog-actions split">
            <button className="link-btn" onClick={() => setStep('settings')}>{translate('exportAgain')}</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="gb" onClick={onClose}>{translate('backToEditor')}</button>
              <button className="primary" onClick={download}><Download size={15} strokeWidth={2.4} />{translate('download')}</button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function BrowserCheck({ support, width, height, fps }: { support: SupportReport | 'failed' | null; width: number; height: number; fps: number }) {
  useT();
  const rows = support === null
    ? [{ label: translate('checkingEncoders'), status: 'pending' as const, note: '' }]
    : support === 'failed'
      ? [{ label: translate('encoderCheckFailed'), status: 'fail' as const, note: translate('exportUnavailable') }]
      : [
        { label: 'WebCodecs', status: support.webCodecs ? 'ok' as const : 'fail' as const, note: support.webCodecs ? translate('uiAvailable') : translate('notAvailable') },
        { label: translate('h264VideoEncoder'), status: support.h264 ? 'ok' as const : 'fail' as const, note: support.h264 ? translate('fps3', { value1: width, value2: height, value3: fps }) : translate('notAt', { value1: width, value2: height }) },
        {
          label: translate('aacAudioEncoder'), status: support.aac ? 'ok' as const : 'fail' as const,
          note: support.aac === 'native' ? translate('builtIn48KHzStereo') : support.aac === 'wasm' ? translate('bundledFallback48KHzStereo') : translate('notAvailable'),
        },
      ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{translate('browserCheck')}</span>
      {rows.map((r) => <CheckRow key={r.label} {...r} />)}
    </div>
  );
}

function stages(p: RenderState, totalFrames: number, trace: ExportTrace | null): { label: string; status: StageStatus; note: string }[] {
  const order = ['mixing', 'encoding', 'finalizing'] as const;
  const at = order.indexOf(p.phase);
  const status = (i: number): StageStatus => (i < at ? 'done' : i === at ? 'active' : 'wait');
  return [
    { label: translate('mixingAudio'), status: status(0), note: p.phase === 'mixing' && trace?.current ? stepText(trace, false) : '48 kHz stereo' },
    { label: translate('composingAndEncodingFrames'), status: status(1), note: `${p.framesDone} / ${totalFrames}` },
    { label: translate('writingMP4'), status: status(2), note: p.phase === 'finalizing' ? translate('uiFinishing') : '—' },
  ];
}

/** The running step, e.g. "Decoding audio 42 / 132 s", optionally with what it works on. */
function stepText(trace: ExportTrace, withSubject: boolean) {
  const step = trace.current;
  if (!step) return '';
  return [step.label, withSubject && step.subject ? `(${step.subject})` : '', step.progress].filter(Boolean).join(' ');
}

function timeLeft(p: RenderState) {
  if (p.phase === 'mixing' || p.fraction < 0.02) return translate('estimatingTimeLeft');
  if (p.phase === 'finalizing') return translate('almostDone');
  const elapsed = (performance.now() - p.t0) / 1000;
  return translate('aboutSLeft', { value1: Math.max(1, Math.round(elapsed / p.fraction - elapsed)) });
}

const dims = ({ width, height }: { width: number; height: number }) => `${width}×${height}`;
const fmtBytes = (n: number) => (n >= 1e6 ? translate('mb', { value1: formatNumber((n / 1e6), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }) : translate('kb', { value1: Math.max(1, Math.round(n / 1e3)) }));

/** e.g. `avc1.640028 · mp4a.40.2 (bundled encoder)`. */
function codecLine({ mimeType, aacEncoder }: ExportResult) {
  const codecs = /codecs="([^"]+)"/.exec(mimeType)?.[1].split(/,\s*/).join(' · ') ?? mimeType;
  return aacEncoder === 'wasm' ? translate('bundledAACEncoder', { value1: codecs }) : codecs;
}
