import { useT } from '../i18n';
import { t as translate } from '../i18n/core';
import { useState } from 'react';
import { Brand } from './Brand';
import { Cog, Download, LibraryGrid, Maximize, Minimize, Pencil, Redo, Undo } from './icons';
import { useFullscreen } from './useFullscreen';
import type { SaveState } from '../editor/useProject';
import { progressPercent, useConversionJob } from '../convert/job';

const page = () => document.documentElement;

interface Props {
  onProjects: () => void;
  saveState: SaveState;
  onSave: () => void;
  projectName: string;
  onRename: (name: string) => void;
  clipCount: number;
  totalTime: string;
  onExport: () => void;
  onSettings: () => void;
  /** Reopens the Convert dialog for the conversion running in the background. */
  onShowConversion: (mediaId: string, fileName: string) => void;
}

function ConversionProgress({ onShow }: { onShow: Props['onShowConversion'] }) {
  useT();
  const job = useConversionJob();
  if (!job) return null;
  const p = job.state.status === 'running' ? Math.round(progressPercent(job.state.progress, job.source.duration)) : 100;
  const label = job.state.status === 'running' ? translate('converting2', { value1: job.sourceName }) : translate('saveConverted', { name: job.sourceName });
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
  useT();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const next = draft?.trim();
    if (next && next !== name) onRename(next);
    setDraft(null);
  };
  if (draft === null) {
    return (
      <button className="ib project-name" onClick={() => setDraft(name)} aria-label={translate('renameProject', { value1: name })} title={translate('renameProject2')}>
        <span className="project-name-text">{name}</span>
        <Pencil size={13} stroke="#8C948E" />
      </button>
    );
  }
  return (
    <input className="fld project-name-field" type="text" aria-label={translate('projectName')} spellCheck={false} maxLength={80}
      autoFocus onFocus={(e) => e.target.select()}
      value={draft} size={Math.max(draft.length, 8)} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') setDraft(null);
      }} />
  );
}

function saveStatus({ status }: SaveState) {
  if (status === 'saved') return translate('saveSaved');
  if (status === 'saving') return translate('saveSaving');
  return translate('saveFailed');
}

export function TopBar({ onProjects, saveState, onSave, projectName, onRename, clipCount, totalTime, onExport, onSettings, onShowConversion }: Props) {
  useT();
  const [fullscreen, toggleFullscreen] = useFullscreen(page);
  return (
    <header className="topbar">
      <Brand />
      <div className="vsep" />
      <button className="ib outlined project-home-link" onClick={onProjects}>
        <LibraryGrid size={15} />
        {translate('projectHomeProjects')}
      </button>
      <ProjectName name={projectName} onRename={onRename} />
      <span className="count">{translate('clipCount', { count: clipCount, time: totalTime })}</span>
      <span className={saveState.status === 'failed' ? 'error save-status' : 'save-status'} role="status">{saveStatus(saveState)}</span>
      {saveState.status === 'failed' && <button className="gb" onClick={onSave}>{translate('projectHomeRetrySave')}</button>}
      <div className="spacer" />
      <ConversionProgress onShow={onShowConversion} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button className="ib square" aria-label={translate('undoCtrlZ')} title={translate('undoCtrlZ2')}><Undo stroke="#C8CEC9" /></button>
        <button className="ib square" aria-label={translate('redoCtrlShiftZ')} title={translate('redoCtrlShiftZ2')}><Redo stroke="#C8CEC9" /></button>
        <button className="ib square" onClick={toggleFullscreen} aria-pressed={fullscreen}
          aria-label={fullscreen ? translate('exitFullScreenF11') : translate('fullScreenF11')} title={fullscreen ? translate('exitFullScreenF112') : translate('fullScreenF112')}>
          {fullscreen ? <Minimize stroke="#C8CEC9" /> : <Maximize stroke="#C8CEC9" />}
        </button>
        <button className="ib square" onClick={onSettings} aria-label={translate('settings')} title={translate('settings')}>
          <Cog stroke="#C8CEC9" />
        </button>
      </div>
      <button className="export-btn" onClick={onExport}>
        <Download size={15} strokeWidth={2.2} />
        {translate('export')}</button>
    </header>
  );
}
