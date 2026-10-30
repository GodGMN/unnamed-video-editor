import { useState } from 'react';
import type { CSSProperties } from 'react';
import { StorageSettings } from './StorageSettings';
import { previewSize, updateSettings, useSettings } from '../settings';
import type { PreviewResolution } from '../settings';
import { Choice, Dialog, Note } from './Dialog';
import { GitHub } from './icons';

type Key = `${PreviewResolution}`;

export function SettingsDialog({ output, onClose }: { output: { width: number; height: number }; onClose: () => void }) {
  const [tab, setTab] = useState<'playback' | 'storage'>('playback');
  const { previewResolution } = useSettings();
  const full = previewSize(output, 'full').height;
  const options: { key: Key; label: string; sub: string }[] = [
    { key: '360', label: '360p', sub: 'Fastest' },
    { key: '540', label: '540p', sub: 'Default' },
    { key: '720', label: '720p', sub: 'Sharper' },
    { key: 'full', label: 'Full', sub: `${full}p · slowest` },
  ];
  return (
    <Dialog id="settings-title" title="Settings" subtitle="Saved in this browser for every project." width={520} onClose={onClose}>
      <div className="dialog-body">
        <div className="settings-tabs" role="tablist" aria-label="Settings sections" onKeyDown={e => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          const next = e.key === 'Home' ? 'playback' : e.key === 'End' ? 'storage' : tab === 'playback' ? 'storage' : 'playback';
          setTab(next); document.getElementById(`${next}-tab`)?.focus();
        }}><button id="playback-tab" role="tab" tabIndex={tab === 'playback' ? 0 : -1} aria-selected={tab === 'playback'} aria-controls="playback-settings" onClick={() => setTab('playback')}>Playback</button><button id="storage-tab" role="tab" tabIndex={tab === 'storage' ? 0 : -1} aria-selected={tab === 'storage'} aria-controls="storage-settings" onClick={() => setTab('storage')}>Storage</button></div>
        {tab === 'playback' ? <div className="settings-panel" role="tabpanel" id="playback-settings" aria-labelledby="playback-tab">
        <Choice label="Preview resolution" options={options} value={`${previewResolution}`}
          onChange={(k) => updateSettings({ previewResolution: k === 'full' ? 'full' : Number(k) as PreviewResolution })} />
        <Note>Lower resolutions keep playback smooth on slower machines. Export always renders at the full output size.</Note>
        </div> : <div role="tabpanel" id="storage-settings" aria-labelledby="storage-tab"><StorageSettings /></div>}
      </div>
      <footer className="dialog-foot">
        <span className="made-by">
          Made by
          <a className="gimeno" href="https://gimeno.dev" target="_blank" rel="noreferrer" aria-label="gimeno.dev">
            {[...'GIMENO.DEV'].map((ch, i) => (
              <span key={i} className={i >= 6 ? 'tld' : undefined} style={{ '--i': i } as CSSProperties} aria-hidden="true">{ch}</span>
            ))}
          </a>
        </span>
        <a className="ib square" href="https://github.com/GodGMN/unnamed-video-editor" target="_blank" rel="noreferrer"
          aria-label="Source code on GitHub" title="Source code on GitHub">
          <GitHub fill="#C8CEC9" />
        </a>
      </footer>
    </Dialog>
  );
}
