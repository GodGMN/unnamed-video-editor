import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight } from './icons';
import { Alert, Choice, Dialog, Note, Progress, ResultCard } from './Dialog';
import type { StageStatus } from './Dialog';
import { outputSpec } from '../convert/convert';
import type { ConvertOptions } from '../convert/convert';
import { cancelConversion, progressPercent, startConversion, useConversionJob } from '../convert/job';
import type { Job } from '../convert/job';
import type { SourceInfo } from '../convert/probe';
import { readMediaFile } from '../media/files';

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
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;
const fpsLabel = (fps: number) => `${Math.round(fps * 100) / 100} fps`;
const outName = (name: string) => name.replace(/\.[^.]+$/, '') + '.mp4';

export function ConvertDialog({ mediaId, fileName, onClose }: Props) {
  const job = useConversionJob();
  // Reopened during a background job: cancelling should land back on the same file and settings.
  const [file, setFile] = useState<File | null>(job?.file ?? null);
  // The library keeps imported sources; only media without a stored copy (the demo project) needs picking.
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (file) return;
    let live = true;
    readMediaFile(mediaId).then(
      (stored) => { if (live) { if (stored) setFile(new File([stored], fileName, { type: stored.type })); else setMissing(true); } },
      () => { if (live) setMissing(true); },
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

  const info = probe?.file === file ? probe?.info : undefined;
  const resOptions = useMemo(() => {
    if (!info) return [];
    const short = Math.min(info.width, info.height);
    const opts: { key: Res; label: string; sub: string }[] = [{ key: 'keep', label: 'Original', sub: `${info.width}×${info.height}` }];
    if (short > 1080) opts.push({ key: '1080', label: '1080p', sub: 'Recommended' });
    if (short > 720) opts.push({ key: '720', label: '720p', sub: 'Fastest' });
    return opts;
  }, [info]);
  const activeRes = resOptions.some((o) => o.key === res) ? res : 'keep';
  const options: ConvertOptions = { shortSide: SHORT_SIDE[activeRes], fps: matchFps ? PROJECT_FPS : null };

  const start = (f: File, src: SourceInfo, opts: ConvertOptions) => startConversion(mediaId, f, src, opts, addToTimeline);
  const cancel = () => cancelConversion();
  const finish = () => { cancelConversion(); onClose(); };

  if (job) {
    const retry = () => startConversion(job.mediaId, job.file, job.source, { ...job.options, shortSide: 720 }, job.addToTimeline);
    return <JobView job={job} onClose={onClose} onCancel={cancel} onFinish={finish} onRetry720={retry} />;
  }

  const name = file?.name ?? fileName;
  const error = probe?.file === file ? probe?.error : undefined;
  const subtitle = info?.decodable
    ? 'This browser can already play this file, but an MP4 copy still works everywhere.'
    : `This browser can’t play ${info?.videoCodec.split(' ')[0] ?? 'this'} video. We can make an MP4 copy it can edit.`;

  return (
    <Dialog id="cv-title" title={`Convert ${name}`} subtitle={subtitle} warn={!!error} width={560} onClose={onClose}>
      <div className="dialog-body">
        {!file && !missing && <Note>Reading {fileName}…</Note>}

        {!file && missing && (
          <>
            <Note>This project has no stored copy of <strong>{fileName}</strong>. Choose it on this computer to convert it. It is read in place and never uploaded.</Note>
            <FilePicker onPick={setFile} label="Choose file…" />
          </>
        )}

        {file && error && (
          <>
            <Alert title="Couldn’t read this file">{error}</Alert>
            <FilePicker onPick={setFile} label="Choose another file…" />
          </>
        )}

        {file && !info && !error && <Note>Reading {file.name}…</Note>}

        {file && info && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 28px minmax(0, 1fr)', gap: 8 }}>
              <div className="file-card source">
                <span className="eyebrow">Source</span>
                <span style={{ fontWeight: 700 }}>{file.name}</span>
                <span>{info.container} · {info.videoCodec}<br />{info.width}×{info.height} · {fpsLabel(info.fps)}<br />{mmss(info.duration)} · {mb(file.size)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
                <ArrowRight size={18} stroke="var(--text-muted)" />
              </div>
              <OutputCard name={outName(file.name)} info={info} options={options} />
            </div>

            {resOptions.length > 1 && <Choice label="Resolution" value={activeRes} onChange={setRes} options={resOptions} />}

            <div className="rows">
              {info.fps > PROJECT_FPS + 0.5 && (
                <Toggle title="Match project frame rate" sub={`${Math.round(info.fps)} → ${PROJECT_FPS} fps. Smaller file, faster to convert.`} checked={matchFps} onChange={setMatchFps} />
              )}
              <Toggle title="Add to timeline when done" sub="Placed at the end of V1." checked={addToTimeline} onChange={setAddToTimeline} />
            </div>

            <Note>
              Runs on this device; nothing is uploaded. The first conversion downloads the converter once (about 32 MB).
              Expect it to take several times the clip’s length. Your original file stays as it is.
            </Note>
          </>
        )}

        <div className="dialog-actions">
          <button className="gb" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!file || !info} onClick={() => file && info && start(file, info, options)}>Convert</button>
        </div>
      </div>
    </Dialog>
  );
}

function OutputCard({ name, info, options }: { name: string; info: SourceInfo; options: ConvertOptions }) {
  const out = outputSpec(info, options);
  return (
    <div className="file-card">
      <span className="eyebrow">New copy</span>
      <span style={{ fontWeight: 700 }}>{name}</span>
      <span>MP4 · H.264{info.hasAudio ? ' + AAC' : ''}<br />{out.width}×{out.height} · {fpsLabel(out.fps)}<br />{mmss(info.duration)}</span>
    </div>
  );
}

function JobView({ job, onClose, onCancel, onFinish, onRetry720 }: {
  job: Job;
  onClose: () => void;
  onCancel: () => void;
  onFinish: () => void;
  onRetry720: () => void;
}) {
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
      { label: 'Load converter', status: stage === 'load' ? 'active' : 'done', note: stage === 'load' ? 'loading' : 'ready' },
      { label: 'Convert video and audio', status: conv, note: conv === 'wait' ? '—' : `${Math.round(pct)}%` },
      { label: 'Save MP4', status: stage === 'save' ? 'active' : 'wait', note: '—' },
    ];
    const left = speed > 0 ? (source.duration - mediaTime) / speed : null;
    const leftText = left === null ? 'Working out how long this will take.'
      : left < 60 ? 'Less than a minute left.' : `About ${Math.round(left / 60)} min left.`;
    return (
      <Dialog id="cv-title" title="Converting" subtitle={`Making ${name} on your device.`} width={560} onClose={onClose}>
        <div className="dialog-body" style={{ paddingTop: 24 }}>
          <Progress pct={pct} label="Conversion progress" stages={stages}
            detail={`${mmss(mediaTime)} / ${mmss(source.duration)}${speed > 0 ? ` · ${speed.toFixed(2)}× speed` : ''}`}
            note={`${leftText} You can keep editing — conversion runs in the background.`} />
          <div className="dialog-actions">
            <button className="gb" onClick={onCancel}>Cancel</button>
            <button className="gb" onClick={onClose}>Keep editing</button>
          </div>
        </div>
      </Dialog>
    );
  }

  if (state.status === 'done') {
    return (
      <Dialog id="cv-title" title="Ready to edit" subtitle="The MP4 is available for this session. Save it to your computer to keep it." width={560} onClose={onClose}>
        <div className="dialog-body">
          <ResultCard tone="#2E3A45" name={name}
            meta={`${out.width}×${out.height} · ${fpsLabel(out.fps)} · ${mmss(source.duration)} · ${mb(state.output.size)} · ${codecs}`}
            extra={<span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Converted in {mmss(state.elapsed)} · {(source.duration / state.elapsed).toFixed(2)}× speed</span>} />
          <div className="dialog-actions split">
            {url ? <a className="link-btn" href={url} download={name}>Save MP4 to my computer</a> : <span />}
            <button className="primary" onClick={onFinish}>Back to editing</button>
          </div>
        </div>
      </Dialog>
    );
  }

  const oom = state.outOfMemoryAt !== undefined;
  return (
    <Dialog id="cv-title" title="Conversion stopped" subtitle={oom ? 'Your browser ran out of memory.' : 'Something went wrong while converting.'} warn width={560} onClose={onClose}>
      <div className="dialog-body">
        {oom ? (
          <Alert title={`Ran out of memory at ${mmss(state.outOfMemoryAt!)}`}>
            Converting {out.height}p at {fpsLabel(out.fps)} needs more memory than this tab has. A smaller resolution usually works. Nothing in your project changed.
          </Alert>
        ) : (
          <Alert title="The converter couldn’t finish">{state.message} Nothing in your project changed.</Alert>
        )}
        <div className="dialog-actions">
          <button className="gb" onClick={onCancel}>Close</button>
          {oom && Math.min(out.width, out.height) > 720 && (
            <button className="primary" onClick={onRetry720}>Try again at 720p</button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function FilePicker({ onPick, label }: { onPick: (f: File) => void; label: string }) {
  return (
    <label className="gb" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
      {label}
      <input type="file" accept="video/*,.mov,.mkv,.mts,.m2ts,.avi" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
    </label>
  );
}

function Toggle({ title, sub, checked, onChange }: { title: string; sub: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
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
