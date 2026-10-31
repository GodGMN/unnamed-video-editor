import { useT } from '../i18n';
import { t as translate, formatNumber } from '../i18n/core';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight } from './icons';
import { Choice, Dialog, Note, Progress, ResultCard } from './Dialog';
import type { StageStatus } from './Dialog';
import { outputSpec } from '../convert/convert';
import type { ConvertOptions } from '../convert/convert';
import { cancelConversion, progressPercent, startConversion, useConversionJob } from '../convert/job';
import type { Job } from '../convert/job';
import type { SourceInfo } from '../convert/probe';
import { readMediaFile } from '../media/files';
import { reportError } from '../toast/store';

type Res = 'keep' | '1080' | '720';
const SHORT_SIDE: Record<Res, number | null> = { keep: null, '1080': 1080, '720': 720 };
const PROJECT_FPS = 30;

interface Props {
  /** The Media library item to convert; its source is read from local storage. */
  mediaId: string;
  fileName: string;
  onClose: () => void;
}

const mmss = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const mb = (bytes: number) => translate('mb', { value1: formatNumber((bytes / 1e6), { minimumFractionDigits: bytes < 1e7 ? 1 : 0, maximumFractionDigits: bytes < 1e7 ? 1 : 0 }) });
const fpsLabel = (fps: number) => translate('fps', { value1: Math.round(fps * 100) / 100 });
const outName = (name: string) => name.replace(/\.[^.]+$/, '') + '.mp4';

export function ConvertDialog({ mediaId, fileName, onClose }: Props) {
  useT();
  const job = useConversionJob();
  const hadJob = useRef(!!job);
  useEffect(() => {
    if (job) { hadJob.current = true; return; }
    if (hadJob.current) { hadJob.current = false; onClose(); }
  }, [job, onClose]);
  // Reopened during a background job: cancelling should land back on the same file and settings.
  const [file, setFile] = useState<File | null>(job?.file ?? null);
  // The library keeps imported sources; only media without a stored copy (the demo project) needs picking.
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (file) return;
    let live = true;
    readMediaFile(mediaId).then(
      (stored) => { if (live) { if (stored) setFile(new File([stored], fileName, { type: stored.type })); else setMissing(true); } },
      (error: unknown) => { if (live) { setMissing(true); reportError(translate('couldNotReadThisMediaFile'), error); } },
    );
    return () => { live = false; };
  }, [mediaId, fileName, file]);
  const [probe, setProbe] = useState<{ file: File; info?: SourceInfo; error?: string } | null>(null);
  const [res, setRes] = useState<Res>(() => {
    const short = job?.options.shortSide;
    return short === undefined ? '1080' : short === null ? 'keep' : short === 720 ? '720' : '1080';
  });
  const [matchFps, setMatchFps] = useState(job ? job.options.fps !== null : true);
  const [addToTimeline, setAddToTimeline] = useState(job?.addToTimeline ?? false);

  useEffect(() => {
    if (!file) return;
    let live = true;
    setProbe({ file });
    // Mediabunny is only needed here, so it stays out of the main bundle too.
    import('../convert/probe').then(({ probeSource }) => probeSource(file)).then(
      (info) => { if (live) setProbe({ file, info }); },
      (e: unknown) => { if (live) setProbe({ file, error: e instanceof Error ? e.message : String(e) }); },
    );
    return () => { live = false; };
  }, [file]);

  const probeError = probe?.file === file ? probe?.error : undefined;
  useEffect(() => {
    if (probeError) reportError(translate('couldnTReadThisFile'), probeError);
  }, [probeError]);

  const info = probe?.file === file ? probe?.info : undefined;
  const resOptions = (() => {
    if (!info) return [];
    const short = Math.min(info.width, info.height);
    const opts: { key: Res; label: string; sub: string }[] = [{ key: 'keep', label: translate('original'), sub: `${info.width}×${info.height}` }];
    if (short > 1080) opts.push({ key: '1080', label: '1080p', sub: translate('recommended') });
    if (short > 720) opts.push({ key: '720', label: '720p', sub: translate('fastest') });
    return opts;
  })();
  const activeRes = resOptions.some((o) => o.key === res) ? res : 'keep';
  const options: ConvertOptions = { shortSide: SHORT_SIDE[activeRes], fps: matchFps ? PROJECT_FPS : null };

  const start = (f: File, src: SourceInfo, opts: ConvertOptions) => startConversion(mediaId, f, src, opts, addToTimeline);
  const cancel = () => cancelConversion();
  const finish = () => { cancelConversion(); onClose(); };

  if (job) return <JobView job={job} onClose={onClose} onCancel={cancel} onFinish={finish} />;

  const name = file?.name ?? fileName;
  const error = probeError;
  const subtitle = error
    ? translate('chooseAnotherFile')
    : info?.decodable
    ? translate('thisBrowserCanAlreadyPlayThisFileButAn')
    : translate('thisBrowserCanTPlayVideoWeCanMake', { value1: info?.videoCodec.split(' ')[0] ?? translate('uiThis') });

  return (
    <Dialog id="cv-title" title={translate('convert', { value1: name })} subtitle={subtitle} warn={!!error} width={560} onClose={onClose}>
      <div className="dialog-body">
        {!file && !missing && <Note>{translate('reading2', { value1: fileName })}</Note>}

        {!file && missing && (
          <>
            <Note>{translate('thisProjectHasNoStoredCopyOf')}{' '}<strong>{fileName}</strong>{translate('chooseItOnThisComputerToConvertItIt')}</Note>
            <FilePicker onPick={setFile} label={translate('chooseFile')} />
          </>
        )}

        {file && error && <FilePicker onPick={setFile} label={translate('chooseAnotherFile')} />}

        {file && !info && !error && <Note>{translate('reading3', { value1: file.name })}</Note>}

        {file && info && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 28px minmax(0, 1fr)', gap: 8 }}>
              <div className="file-card source">
                <span className="eyebrow">{translate('source')}</span>
                <span style={{ fontWeight: 700 }}>{file.name}</span>
                <span>{info.container} · {info.videoCodec}<br />{info.width}×{info.height} · {fpsLabel(info.fps)}<br />{mmss(info.duration)} · {mb(file.size)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
                <ArrowRight size={18} stroke='var(--text-muted)' />
              </div>
              <OutputCard name={outName(file.name)} info={info} options={options} />
            </div>

            {resOptions.length > 1 && <Choice label={translate('resolution')} value={activeRes} onChange={setRes} options={resOptions} />}

            <div className="rows">
              {info.fps > PROJECT_FPS + 0.5 && (
                <Toggle title={translate('matchProjectFrameRate')} sub={translate('fpsSmallerFileFasterToConvert', { value1: Math.round(info.fps), value2: PROJECT_FPS })} checked={matchFps} onChange={setMatchFps} />
              )}
              <Toggle title={translate('addToTimelineWhenDone')} sub={translate('placedAtTheEndOfV1')} checked={addToTimeline} onChange={setAddToTimeline} />
            </div>

            <Note>
              {translate('runsOnThisDeviceNothingIsUploadedTheFirst')}</Note>
          </>
        )}

        <div className="dialog-actions">
          <button className="gb" onClick={onClose}>{translate('cancel')}</button>
          <button className="primary" disabled={!file || !info} onClick={() => file && info && start(file, info, options)}>{translate('convert2')}</button>
        </div>
      </div>
    </Dialog>
  );
}

function OutputCard({ name, info, options }: { name: string; info: SourceInfo; options: ConvertOptions }) {
  useT();
  const out = outputSpec(info, options);
  return (
    <div className="file-card">
      <span className="eyebrow">{translate('newCopy')}</span>
      <span style={{ fontWeight: 700 }}>{name}</span>
      <span>{"MP4 · H.264"}{info.hasAudio ? ' + AAC' : ''}<br />{out.width}×{out.height} · {fpsLabel(out.fps)}<br />{mmss(info.duration)}</span>
    </div>
  );
}

function JobView({ job, onClose, onCancel, onFinish }: {
  job: Job;
  onClose: () => void;
  onCancel: () => void;
  onFinish: () => void;
}) {
  useT();
  const { state, source, out } = job;
  const name = outName(job.sourceName);
  const codecs = `H.264${source.hasAudio ? ' + AAC' : ''}`;
  const [url, setUrl] = useState<string | null>(null);
  const output = state.status === 'done' ? state.output : null;
  useEffect(() => {
    if (!output) return;
    const u = URL.createObjectURL(output);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [output]);

  if (state.status === 'running') {
    const { stage, mediaTime, speed } = state.progress;
    const pct = progressPercent(state.progress, source.duration);
    const conv: StageStatus = stage === 'load' ? 'wait' : stage === 'convert' ? 'active' : 'done';
    const stages: { label: string; status: StageStatus; note: string }[] = [
      { label: translate('loadConverter'), status: stage === 'load' ? 'active' : 'done', note: stage === 'load' ? translate('uiLoading') : translate('uiReady') },
      { label: translate('convertVideoAndAudio'), status: conv, note: conv === 'wait' ? '—' : `${Math.round(pct)}%` },
      { label: translate('saveMP4'), status: stage === 'save' ? 'active' : 'wait', note: '—' },
    ];
    const left = speed > 0 ? (source.duration - mediaTime) / speed : null;
    const leftText = left === null ? translate('workingOutHowLongThisWillTake')
      : left < 60 ? translate('lessThanAMinuteLeft') : translate('aboutMinLeft', { value1: Math.round(left / 60) });
    return (
      <Dialog id="cv-title" title={translate('converting')} subtitle={translate('makingOnYourDevice', { value1: name })} width={560} onClose={onClose}>
        <div className="dialog-body" style={{ paddingTop: 24 }}>
          <Progress pct={pct} label={translate('conversionProgress')} stages={stages}
            detail={`${mmss(mediaTime)} / ${mmss(source.duration)}${speed > 0 ? translate('speed', { value1: formatNumber(speed, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }) : ''}`}
            note={translate('youCanKeepEditingConversionRunsInTheBackground', { value1: leftText })} />
          <div className="dialog-actions">
            <button className="gb" onClick={onCancel}>{translate('cancel')}</button>
            <button className="gb" onClick={onClose}>{translate('keepEditing')}</button>
          </div>
        </div>
      </Dialog>
    );
  }

  if (state.status === 'done') {
    return (
      <Dialog id="cv-title" title={translate('readyToEdit')} subtitle={translate('projectHomeTheMP4IsAvailableForThisSessionSaveItToYourComputerToKeepIt')} width={560} onClose={onClose}>
        <div className="dialog-body">
          <ResultCard tone="#2E3A45" name={name}
            meta={`${out.width}×${out.height} · ${fpsLabel(out.fps)} · ${mmss(source.duration)} · ${mb(state.output.size)} · ${codecs}`}
            extra={<span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{translate('convertedInSpeed', { value1: mmss(state.elapsed), value2: formatNumber((source.duration / state.elapsed), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}</span>} />
          <div className="dialog-actions split">
            {url ? <a className="link-btn" href={url} download={name}>{translate('projectHomeSaveMP4ToMyComputer')}</a> : <span />}
            <button className="primary" onClick={onFinish}>{translate('backToEditing')}</button>
          </div>
        </div>
      </Dialog>
    );
  }
}

function FilePicker({ onPick, label }: { onPick: (f: File) => void; label: string }) {
  useT();
  return (
    <label className="gb" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
      {label}
      <input type="file" accept="video/*,.mov,.mkv,.mts,.m2ts,.avi" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
    </label>
  );
}

function Toggle({ title, sub, checked, onChange }: { title: string; sub: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  useT();
  return (
    <label style={{ cursor: 'pointer', padding: '12px 14px' }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
    </label>
  );
}
