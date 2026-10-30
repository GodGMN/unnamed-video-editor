import { useEffect, useState } from 'react';
import { clearPreviewCache, PREVIEW_BUDGET, previewCacheBytes } from '../media/files';
import { Dialog } from './Dialog';

export function ProjectStorage({ onClose }: { onClose: () => void }) {
  const [bytes, setBytes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { void previewCacheBytes().then(setBytes, e => setError(String(e))); }, []);
  return <Dialog id="storage-title" title="Settings" subtitle="Storage on this device" width={520} onClose={onClose}>
    <div className="dialog-body storage-dialog">
      <div><h3>Preview cache</h3><p>Thumbnails and waveforms help you browse your edits. You can clear them at any time and rebuild them from your media.</p></div>
      <div className="storage-meter-label"><span>{bytes === null ? 'Checking usage…' : `${(bytes / 1048576).toFixed(1)} MiB used`}</span><span>{PREVIEW_BUDGET / 1048576} MiB limit</span></div>
      <meter min={0} max={PREVIEW_BUDGET} value={bytes ?? 0} aria-label="Preview cache usage" />
      <button className="gb" disabled={busy || bytes === null || bytes === 0} onClick={() => {
        setBusy(true); setError('');
        void clearPreviewCache().then(async () => { setBytes(await previewCacheBytes()); setMessage('Preview cache cleared. Your projects and source files are safe.'); window.dispatchEvent(new Event('media-preview-change')); }).catch(e => setError(String(e))).finally(() => setBusy(false));
      }}>{busy ? 'Clearing…' : 'Clear preview cache'}</button>
      <p className="storage-note">Project edits and media links are saved in this browser. Keep a downloaded project or a package as a backup.</p>
      <p role="status">{message}</p>{error && <p role="alert" className="error">{error}</p>}
    </div>
  </Dialog>;
}
