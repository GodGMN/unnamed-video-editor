import { useT } from '../i18n';
import { t as translate, formatNumber } from '../i18n/core';
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
  prepare: (width: number, height: number, sampleRate: number, signal: AbortSignal) => Promise<{
    renderFrame: ExportOptions['renderFrame'];
    audio: AudioBuffer | null;
    dispose: () => void;
  }>;
}

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const SIZES: Record<Res, [number, number]> = { '720': [1280, 720], '1080': [1920, 1080] };

const COPY: Record<Step, [string, string]> = {
  get settings(): [string, string] { return [translate('exportVideo'), translate('renderedOnThisDeviceNothingIsUploaded')]; },
  get rendering(): [string, string] { return [translate('rendering'), translate('encodingFramesAndMixingAudioLocally')]; },
  get done(): [string, string] { return [translate('yourVideoIsReady'), translate('savedInMemoryDownloadItBeforeClosingTheTab')]; },
  get error(): [string, string] { return [translate('exportStopped'), translate('nothingWasSavedYourTimelineIsUnchanged')]; },
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
  useT();
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
    let prepared: Awaited<ReturnType<ExportSource['prepare']>> | undefined;
    try {
      prepared = await source.prepare(width, height, SAMPLE_RATE, ctl.signal);
      ctl.signal.throwIfAborted();
      const t0 = performance.now();
      const out = await exportMp4({
        width, height, fps, duration: source.duration,
        renderFrame: prepared.renderFrame,
        audio: prepared.audio ?? undefined,
        signal: ctl.signal,
        onProgress: (p) => setProgress({ phase: p.phase, framesDone: p.framesDone, fraction: p.fraction, t0 }),
      });
      ctl.signal.throwIfAborted();
      setResult({ res, out, url: URL.createObjectURL(out.blob) });
      setStep('done');
    } catch (err) {
      if (ctl.signal.aborted) return;
      setFailure(err instanceof ExportError
        ? { code: err.code, message: err.message }
        : { code: 'unknown', message: err instanceof Error ? err.message : String(err) });
      setStep('error');
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
    <Dialog id="exp-title" title={title} subtitle={subtitle} warn={step === 'error'} width={520} onClose={onClose}>
      {step === 'settings' && (
        <div className="dialog-body" style={{ paddingTop: 22 }}>
          <Choice label={translate('resolution')} value={res} onChange={setRes} options={[
            { key: '720', label: '720p', sub: '1280×720' },
            { key: '1080', label: '1080p', sub: '1920×1080' },
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
            stages={stages(progress, totalFrames)} note={translate('keepThisTabOpenRenderingHappensOnYourDevice', { value1: timeLeft(progress) })} />
          <div className="dialog-actions">
            <button className="gb" onClick={cancel}>{translate('cancelExport')}</button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="dialog-body" style={{ paddingTop: 22 }}>
          <ResultCard tone="#35503F" name={`${projectSlug}-${result.res}p.mp4`}
            meta={translate('h264AAC', { value1: SIZES[result.res].join('×'), value2: fmtTime(result.out.frameCount / fps), value3: fmtBytes(result.out.blob.size) })}
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

      {step === 'error' && failure && (
        <div className="dialog-body" style={{ paddingTop: 22 }}>
          <Alert title={ERROR_TITLES[failure.code]}>{failure.message}</Alert>
          <div className="dialog-actions">
            {failure.code === 'unsupported-video' && res === '1080' && (
              <button className="gb" onClick={() => { setRes('720'); setStep('settings'); }}>{translate('try720p')}</button>
            )}
            <button className="primary" onClick={() => setStep('settings')}>{translate('backToSettings')}</button>
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

function stages(p: RenderState, totalFrames: number): { label: string; status: StageStatus; note: string }[] {
  const order = ['mixing', 'encoding', 'finalizing'] as const;
  const at = order.indexOf(p.phase);
  const status = (i: number): StageStatus => (i < at ? 'done' : i === at ? 'active' : 'wait');
  return [
    { label: translate('mixingAudio'), status: status(0), note: '48 kHz stereo' },
    { label: translate('composingAndEncodingFrames'), status: status(1), note: `${p.framesDone} / ${totalFrames}` },
    { label: translate('writingMP4'), status: status(2), note: p.phase === 'finalizing' ? translate('uiFinishing') : '—' },
  ];
}

function timeLeft(p: RenderState) {
  if (p.phase === 'mixing' || p.fraction < 0.02) return translate('estimatingTimeLeft');
  if (p.phase === 'finalizing') return translate('almostDone');
  const elapsed = (performance.now() - p.t0) / 1000;
  return translate('aboutSLeft', { value1: Math.max(1, Math.round(elapsed / p.fraction - elapsed)) });
}

const fmtBytes = (n: number) => (n >= 1e6 ? translate('mb', { value1: formatNumber((n / 1e6), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }) : translate('kb', { value1: Math.max(1, Math.round(n / 1e3)) }));

/** e.g. `avc1.640028 · mp4a.40.2 (bundled encoder)`. */
function codecLine({ mimeType, aacEncoder }: ExportResult) {
  const codecs = /codecs="([^"]+)"/.exec(mimeType)?.[1].split(/,\s*/).join(' · ') ?? mimeType;
  return aacEncoder === 'wasm' ? translate('bundledAACEncoder', { value1: codecs }) : codecs;
}
