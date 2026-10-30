import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight } from './icons';
import { Alert, Choice, Dialog, Note, Progress, ResultCard, useSimulatedProgress } from './Dialog';
import type { StageStatus } from './Dialog';

type Step = 'ready' | 'converting' | 'done' | 'error';
type Res = 'keep' | '1080' | '720';

const RES: Record<Res, { dims: string; size: string; eta: string }> = {
  keep: { dims: '2560×1440', size: '≈ 160 MB', eta: '6–9 minutes' },
  '1080': { dims: '1920×1080', size: '≈ 96 MB', eta: '3–5 minutes' },
  '720': { dims: '1280×720', size: '≈ 48 MB', eta: '2–3 minutes' },
};

interface Props {
  fileName: string;
  onClose: () => void;
}

export function ConvertDialog({ fileName, onClose }: Props) {
  const [step, setStep] = useState<Step>('ready');
  const [res, setRes] = useState<Res>('1080');
  const [matchFps, setMatchFps] = useState(true);
  const [addToTimeline, setAddToTimeline] = useState(false);
  const finish = useCallback(() => setStep('done'), []);
  const pct = useSimulatedProgress(step === 'converting', 5000, finish);

  const outName = fileName.replace(/\.[^.]+$/, '') + '.mp4';
  const outFps = matchFps ? '30 fps' : '60 fps';
  const copy: Record<Step, [string, string]> = {
    ready: [`Convert ${fileName}`, 'This browser can’t play HEVC (H.265) video. We can make an MP4 copy it can edit.'],
    converting: ['Converting', `Making ${outName} on your device.`],
    done: ['Ready to edit', 'The MP4 copy is in your Media library.'],
    error: ['Conversion stopped', 'Your browser ran out of memory.'],
  };
  const [title, subtitle] = copy[step];

  const SOURCE_SECONDS = 134;
  const done = Math.round(pct / 100 * SOURCE_SECONDS);
  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const stages: { label: string; status: StageStatus; note: string }[] = [
    { label: 'Load converter', status: 'done', note: 'cached' },
    { label: 'Convert video and audio', status: pct < 100 ? 'active' : 'done', note: `${Math.round(pct)}%` },
    { label: 'Save MP4', status: 'wait', note: '—' },
  ];

  return (
    <Dialog id="cv-title" title={title} subtitle={subtitle} warn={step === 'error'} width={560} onClose={onClose}>
      {step === 'ready' && (
        <div className="dialog-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 28px minmax(0, 1fr)', gap: 8 }}>
            <div className="file-card source">
              <span className="eyebrow">Source</span>
              <span style={{ fontWeight: 700 }}>{fileName}</span>
              <span>MOV · HEVC Main 10<br />2560×1440 · 60 fps<br />02:14 · 412 MB</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
              <ArrowRight size={18} stroke="var(--text-muted)" />
            </div>
            <div className="file-card">
              <span className="eyebrow">New copy</span>
              <span style={{ fontWeight: 700 }}>{outName}</span>
              <span>MP4 · H.264 + AAC<br />{RES[res].dims} · {outFps}<br />{RES[res].size} estimated</span>
            </div>
          </div>

          <Choice label="Resolution" value={res} onChange={setRes} options={[
            { key: 'keep', label: 'Original', sub: '2560×1440' },
            { key: '1080', label: '1080p', sub: 'Recommended' },
            { key: '720', label: '720p', sub: 'Fastest' },
          ]} />

          <div className="rows">
            <Toggle title="Match project frame rate" sub="60 → 30 fps. Smaller file, faster to convert." checked={matchFps} onChange={setMatchFps} />
            <Toggle title="Add to timeline when done" sub="Placed at the end of V1." checked={addToTimeline} onChange={setAddToTimeline} />
          </div>

          <Note>
            Runs on this device; nothing is uploaded. The first conversion downloads the converter once (about 31 MB).
            This file should take {RES[res].eta}. Your original file stays as it is.
          </Note>

          <div className="dialog-actions">
            <button className="gb" onClick={onClose}>Cancel</button>
            <button className="primary" onClick={() => setStep('converting')}>Convert</button>
          </div>
        </div>
      )}

      {step === 'converting' && (
        <div className="dialog-body" style={{ paddingTop: 24 }}>
          <Progress pct={pct} detail={`${mmss(done)} / ${mmss(SOURCE_SECONDS)} · 0.7× speed`} label="Conversion progress" stages={stages}
            note="About 3 min left. You can keep editing — conversion runs in the background." />
          <div className="dialog-actions">
            <button className="gb" onClick={() => setStep('ready')}>Cancel</button>
            <button className="gb" onClick={onClose}>Keep editing</button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="dialog-body">
          <ResultCard tone="#2E3A45" name={outName} meta={`${RES[res].dims} · ${outFps} · 02:14 · 96 MB · H.264 + AAC`}
            extra={<span style={{ color: 'var(--accent)', fontSize: 12 }}>Added to Media{addToTimeline ? ' and the end of V1' : ''}</span>} />
          <div className="dialog-actions split">
            <button className="link-btn">Save a copy to my computer</button>
            <button className="primary" onClick={onClose}>Back to editing</button>
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="dialog-body">
          <Alert title="Ran out of memory at 01:22">
            Converting {RES[res].dims.split('×')[1]}p at {outFps} needs more memory than this tab has. A smaller resolution usually works. Nothing in your project changed.
          </Alert>
          <div className="dialog-actions">
            <button className="gb" onClick={onClose}>Close</button>
            <button className="primary" onClick={() => { setRes('720'); setStep('converting'); }}>Try again at 720p</button>
          </div>
        </div>
      )}
    </Dialog>
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
