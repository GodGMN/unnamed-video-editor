import { useEffect, useRef, useState } from 'react';
import { Brand } from './Brand';
import { Download, Maximize, Minimize, Pencil, Redo, Undo } from './icons';
import { useFullscreen } from './useFullscreen';
import { progressPercent, useConversionJob } from '../convert/job';

const page = () => document.documentElement;

interface Props {
  onProjects: () => void;
  saveState: string;
  onSave: () => void;
  projectName: string;
  onRename: (name: string) => void;
  clipCount: number;
  totalTime: string;
  onExport: () => void;
  /** Reopens the Convert dialog for the conversion running in the background. */
  onShowConversion: (mediaId: string, fileName: string) => void;
}

function ConversionProgress({ onShow }: { onShow: Props['onShowConversion'] }) {
  const job = useConversionJob();
  if (!job) return null;
  const p = job.state.status === 'running' ? Math.round(progressPercent(job.state.progress, job.source.duration)) : job.state.status === 'done' ? 100 : 0;
  const label = job.state.status === 'running' ? `Converting ${job.sourceName}` : job.state.status === 'done' ? `Save ${job.sourceName}` : 'Conversion stopped';
  return (
    <>
      <button className="ib conversion" onClick={() => onShow(job.mediaId, job.sourceName)} title={`${label} · ${p}%`}>
        <span className="conversion-name">{label}</span>
        <span role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="progress">
          <span style={{ width: `${p}%` }} />
        </span>
        <span className="mono conversion-pct">{p}%</span>
      </button>
      <div className="vsep" role="separator" aria-orientation="vertical" />
    </>
  );
}

/** Click to edit the name in place; Enter or leaving the field saves, Escape cancels. */
function ProjectName({ name, onRename }: { name: string; onRename: Props['onRename'] }) {
  const [draft, setDraft] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const commit = () => {
    const next = draft?.trim();
    if (next && next !== name) onRename(next);
    setDraft(null);
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const editing = draft !== null;
  // Buttons never take focus in this app, so clicking one wouldn't blur the field.
  useEffect(() => {
    if (!editing) return;
    const press = (event: PointerEvent) => {
      if (event.target !== field.current) commitRef.current();
    };
    document.addEventListener('pointerdown', press, { capture: true });
    return () => document.removeEventListener('pointerdown', press, { capture: true });
  }, [editing]);
  if (draft === null) {
    return (
      <button className="ib project-name" onClick={() => setDraft(name)} aria-label={`Rename project ${name}`} title="Rename project">
        <span className="project-name-text">{name}</span>
        <Pencil size={13} stroke="#8C948E" />
      </button>
    );
  }
  return (
    <input ref={field} className="fld project-name-field" type="text" aria-label="Project name" spellCheck={false} maxLength={80}
      autoFocus onFocus={(e) => e.target.select()}
      value={draft} size={Math.max(draft.length, 8)} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') setDraft(null);
      }} />
  );
}

export function TopBar({ onProjects, saveState, onSave, projectName, onRename, clipCount, totalTime, onExport, onShowConversion }: Props) {
  const [fullscreen, toggleFullscreen] = useFullscreen(page);
  return (
    <header className="topbar">
      <Brand />
      <div className="vsep" />
      <button className="ib project-home-link" onClick={onProjects}>Projects</button>
      <ProjectName name={projectName} onRename={onRename} />
      <span className="count">{clipCount} clips · {totalTime}</span>
      <span className={saveState.startsWith('Save failed') ? 'error save-status' : 'save-status'} role="status">{saveState}</span>
      {saveState.startsWith('Save failed') && <button className="gb" onClick={onSave}>Retry save</button>}
      <div className="spacer" />
      <ConversionProgress onShow={onShowConversion} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button className="ib square" aria-label="Undo (Ctrl+Z)" title="Undo · Ctrl+Z"><Undo stroke="#C8CEC9" /></button>
        <button className="ib square" aria-label="Redo (Ctrl+Shift+Z)" title="Redo · Ctrl+Shift+Z"><Redo stroke="#C8CEC9" /></button>
        <button className="ib square" onClick={toggleFullscreen} aria-pressed={fullscreen}
          aria-label={fullscreen ? 'Exit full screen (F11)' : 'Full screen (F11)'} title={fullscreen ? 'Exit full screen · F11' : 'Full screen · F11'}>
          {fullscreen ? <Minimize stroke="#C8CEC9" /> : <Maximize stroke="#C8CEC9" />}
        </button>
      </div>
      <button className="export-btn" onClick={onExport}>
        <Download size={15} strokeWidth={2.2} />
        Export
      </button>
    </header>
  );
}
