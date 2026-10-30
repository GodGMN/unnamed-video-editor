import { previewSize, updateSettings, useSettings } from '../settings';
import type { PreviewResolution } from '../settings';
import { Choice, Dialog, Note } from './Dialog';

type Key = `${PreviewResolution}`;

export function SettingsDialog({ output, onClose }: { output: { width: number; height: number }; onClose: () => void }) {
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
        <Choice label="Preview resolution" options={options} value={`${previewResolution}`}
          onChange={(k) => updateSettings({ previewResolution: k === 'full' ? 'full' : Number(k) as PreviewResolution })} />
        <Note>Lower resolutions keep playback smooth on slower machines. Export always renders at the full output size.</Note>
      </div>
    </Dialog>
  );
}
