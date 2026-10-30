import { useCallback, useState } from 'react';
import { Download } from './icons';
import { Alert, CheckRow, Choice, Dialog, Progress, ResultCard, useSimulatedProgress } from './Dialog';
import type { StageStatus } from './Dialog';

type Step = 'settings' | 'rendering' | 'done' | 'error';
type Res = '720' | '1080';

const COPY: Record<Step, [string, string]> = {
  settings: ['Export video', 'Rendered on this device. Nothing is uploaded.'],
  rendering: ['Rendering', 'Encoding frames and mixing audio locally.'],
  done: ['Your video is ready', 'Saved in memory — download it before closing the tab.'],
  error: ['Export stopped', 'Your browser is missing a codec we need.'],
};

const TOTAL_FRAMES = 1050;

interface Props {
  projectSlug: string;
  duration: string;
  onClose: () => void;
}

export function ExportDialog({ projectSlug, duration, onClose }: Props) {
  const [step, setStep] = useState<Step>('settings');
  const [res, setRes] = useState<Res>('1080');
  const finish = useCallback(() => setStep('done'), []);
  const pct = useSimulatedProgress(step === 'rendering', 4000, finish);
  const [title, subtitle] = COPY[step];

  const start = () => setStep('VideoEncoder' in window ? 'rendering' : 'error');
  const frame = Math.round(pct / 100 * TOTAL_FRAMES);
  const stages: { label: string; status: StageStatus; note: string }[] = [
    { label: 'Decoding sources', status: 'done', note: '4 / 4' },
    { label: 'Composing frames', status: pct < 100 ? 'active' : 'done', note: `${frame} / ${TOTAL_FRAMES}` },
    { label: 'Mixing audio', status: pct < 100 ? 'active' : 'done', note: 'AAC 48 kHz' },
    { label: 'Writing MP4', status: 'wait', note: '—' },
  ];
  const secondsLeft = Math.max(0, Math.round((100 - pct) / 100 * 37));

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
            <div><span className="k">Frame rate</span><span className="v">30 fps</span></div>
            <div><span className="k">Duration</span><span className="mono">{duration}</span></div>
            <div><span className="k">Estimated size</span><span className="v">{res === '1080' ? '≈ 18 MB' : '≈ 9 MB'}</span></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Browser check</span>
            <CheckRow label="H.264 video encoder" note="hardware" />
            <CheckRow label="AAC audio encoder" note="48 kHz stereo" />
            <CheckRow label={`Enough memory for ${res}p`} note="~420 MB peak" />
          </div>
          <div className="dialog-actions" style={{ paddingTop: 4 }}>
            <button className="gb" onClick={onClose}>Cancel</button>
            <button className="primary" onClick={start}>Start export</button>
          </div>
        </div>
      )}

      {step === 'rendering' && (
        <div className="dialog-body" style={{ paddingTop: 24 }}>
          <Progress pct={pct} detail={`frame ${frame} / ${TOTAL_FRAMES}`} label="Export progress" stages={stages}
            note={`About ${secondsLeft} s left. Keep this tab open — rendering happens on your device.`} />
          <div className="dialog-actions">
            <button className="gb" onClick={() => setStep('settings')}>Cancel export</button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="dialog-body" style={{ paddingTop: 22 }}>
          <ResultCard tone="#35503F" name={`${projectSlug}-${res}p.mp4`}
            meta={`${res === '1080' ? '1920×1080' : '1280×720'} · ${duration} · ${res === '1080' ? '18.4' : '9.2'} MB · H.264 + AAC`} />
          <div className="dialog-actions split">
            <button className="link-btn" onClick={() => setStep('settings')}>Export again</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="gb" onClick={onClose}>Back to editor</button>
              <button className="primary"><Download size={15} strokeWidth={2.4} />Download</button>
            </div>
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="dialog-body" style={{ paddingTop: 22 }}>
          <Alert title="This browser can’t encode H.264 video">
            VideoEncoder rejected avc1 at {res === '1080' ? '1920×1080' : '1280×720'}. Your timeline is safe — nothing was lost. WebM (VP9 + Opus) is supported here.
          </Alert>
          <div className="dialog-actions">
            <button className="gb" onClick={() => { setRes('720'); setStep('settings'); }}>Try 720p</button>
            <button className="primary" onClick={() => setStep('rendering')}>Export as WebM</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
