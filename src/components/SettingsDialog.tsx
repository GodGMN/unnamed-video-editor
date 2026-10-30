import { useState } from 'react';
import { locales, setLocale } from '../i18n';
import { getLocale } from '../i18n/core';
import { useT } from '../i18n';
import { t as translate } from '../i18n/core';
import type { CSSProperties } from 'react';
import { StorageSettings } from './StorageSettings';
import { previewSize, updateSettings, useSettings } from '../settings';
import type { PreviewResolution } from '../settings';
import { Choice, Dialog, Note } from './Dialog';
import { GitHub } from './icons';

type Key = `${PreviewResolution}`;

export function SettingsDialog({ output, onClose }: { output: { width: number; height: number }; onClose: () => void }) {
  const [tab, setTab] = useState<'playback' | 'storage'>('playback');
  useT();
  const { previewResolution } = useSettings();
  const { width, height } = previewSize(output, 'full');
  const full = Math.min(width, height);
  const options: { key: Key; label: string; sub: string }[] = [
    { key: '360', label: '360p', sub: translate('fastest') },
    { key: '540', label: '540p', sub: translate('default') },
    { key: '720', label: '720p', sub: translate('sharper') },
    { key: 'full', label: translate('full'), sub: translate('pSlowest', { value1: full }) },
  ];
  return (
    <Dialog id="settings-title" title={translate('settings')} subtitle={translate('savedInThisBrowserForEveryProject')} width={520} onClose={onClose}>
      <div className="dialog-body">
        <label className="field-label">{translate('language')}
          <select aria-label={translate('language')} className="fld" value={getLocale()} onChange={(event) => setLocale(event.target.value)}>
            {Object.entries(locales).map(([code, entry]) => <option key={code} value={code}>{entry.name}</option>)}
          </select>
        </label>
        <div className="settings-tabs" role="tablist" aria-label={translate('projectHomeSettingsSections')} onKeyDown={e => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          const next = e.key === 'Home' ? 'playback' : e.key === 'End' ? 'storage' : tab === 'playback' ? 'storage' : 'playback';
          setTab(next); document.getElementById(`${next}-tab`)?.focus();
        }}><button id="playback-tab" role="tab" tabIndex={tab === 'playback' ? 0 : -1} aria-selected={tab === 'playback'} aria-controls="playback-settings" onClick={() => setTab('playback')}>{translate('projectHomePlayback')}</button><button id="storage-tab" role="tab" tabIndex={tab === 'storage' ? 0 : -1} aria-selected={tab === 'storage'} aria-controls="storage-settings" onClick={() => setTab('storage')}>{translate('projectHomeStorage')}</button></div>
        {tab === 'playback' ? <div className="settings-panel" role="tabpanel" id="playback-settings" aria-labelledby="playback-tab">
        <Choice label={translate('previewResolution')} options={options} value={`${previewResolution}`}
          onChange={(k) => updateSettings({ previewResolution: k === 'full' ? 'full' : Number(k) as PreviewResolution })} />
        <Note>{translate('lowerResolutionsKeepPlaybackSmoothOnSlowerMachinesExport')}</Note>
        </div> : <div role="tabpanel" id="storage-settings" aria-labelledby="storage-tab"><StorageSettings /></div>}
      </div>
      <footer className="dialog-foot">
        <span className="made-by">
          {translate('madeBy')}<a className="gimeno" href="https://gimeno.dev" target="_blank" rel="noreferrer" aria-label={"gimeno.dev"}>
            {[...'GIMENO.DEV'].map((ch, i) => (
              <span key={i} className={i >= 6 ? 'tld' : undefined} style={{ '--i': i } as CSSProperties} aria-hidden="true">{ch}</span>
            ))}
          </a>
        </span>
        <a className="ib square" href="https://github.com/GodGMN/unnamed-video-editor" target="_blank" rel="noreferrer"
          aria-label={translate('sourceCodeOnGitHub')} title={translate('sourceCodeOnGitHub')}>
          <GitHub fill="#C8CEC9" />
        </a>
      </footer>
    </Dialog>
  );
}
