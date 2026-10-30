import { useEffect, useState } from 'react';
import { Brand } from './Brand';
import { Download, Maximize, Minimize, Pencil, Redo, Undo } from './icons';

function useFullscreen() {
  const [on, setOn] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggle = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  return [on, toggle] as const;
}

interface Props {
  projectName: string;
  clipCount: number;
  totalTime: string;
  onExport: () => void;
}

export function TopBar({ projectName, clipCount, totalTime, onExport }: Props) {
  const [fullscreen, toggleFullscreen] = useFullscreen();
  return (
    <header className="topbar">
      <Brand />
      <div className="vsep" />
      <button className="ib" style={{ height: 32, padding: '0 10px', gap: 8, fontWeight: 500 }} aria-label="Rename project">
        {projectName}
        <Pencil size={13} stroke="#8C948E" />
      </button>
      <span className="count">{clipCount} clips · {totalTime}</span>
      <div className="spacer" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button className="ib square" aria-label="Undo (Ctrl+Z)" title="Undo · Ctrl+Z"><Undo stroke="#C8CEC9" /></button>
        <button className="ib square" aria-label="Redo (Ctrl+Shift+Z)" title="Redo · Ctrl+Shift+Z"><Redo stroke="#C8CEC9" /></button>
      </div>
      <button className="export-btn" onClick={onExport}>
        <Download size={15} strokeWidth={2.2} />
        Export
      </button>
      <button className="ib square" onClick={toggleFullscreen} aria-pressed={fullscreen}
        aria-label={fullscreen ? 'Exit full screen (F11)' : 'Full screen (F11)'} title={fullscreen ? 'Exit full screen · F11' : 'Full screen · F11'}>
        {fullscreen ? <Minimize stroke="#C8CEC9" /> : <Maximize stroke="#C8CEC9" />}
      </button>
    </header>
  );
}
