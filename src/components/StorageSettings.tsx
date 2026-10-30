import { t as translate } from '../i18n/core';
import { useEffect, useState } from 'react';
import { clearPreviewCache, PREVIEW_BUDGET, previewCacheBytes } from '../media/files';

export function StorageSettings() {
  const [bytes, setBytes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { void previewCacheBytes().then(setBytes, e => setError(String(e))); }, []);
  return <div className="storage-dialog">
      <div><h3>{translate('projectHomePreviewCache')}</h3><p>{translate('projectHomeThumbnailsAndWaveformsHelpYouBrowseYourEditsYouCanClearThemAtAnyTimeAndRebuildThemFromYourMedia')}</p></div>
      <div className="storage-meter-label"><span>{bytes === null ? 'Checking usage…' : `${(bytes / 1048576).toFixed(1)} MiB used`}</span><span>{PREVIEW_BUDGET / 1048576}{' '}{translate('projectHomeMiBLimit')}</span></div>
      <meter min={0} max={PREVIEW_BUDGET} value={bytes ?? 0} aria-label={translate('projectHomePreviewCacheUsage')} />
      <button className="gb" disabled={busy || bytes === null || bytes === 0} onClick={() => {
        setBusy(true); setError('');
        void clearPreviewCache().then(async () => { setBytes(await previewCacheBytes()); setMessage('Preview cache cleared. Your projects and source files are safe.'); window.dispatchEvent(new Event('media-preview-change')); }).catch(e => setError(String(e))).finally(() => setBusy(false));
      }}>{busy ? 'Clearing…' : 'Clear preview cache'}</button>
      <p className="storage-note">{translate('projectHomeProjectEditsAndMediaLinksAreSavedInThisBrowserKeepADownloadedProjectOrAPackageAsABackup')}</p>
      <p role="status">{message}</p>{error && <p role="alert" className="error">{error}</p>}
    </div>;
}
