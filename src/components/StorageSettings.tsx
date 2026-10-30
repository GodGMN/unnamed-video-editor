import { useT } from '../i18n';
import { t as translate, formatNumber } from '../i18n/core';
import { useEffect, useState } from 'react';
import { clearPreviewCache, PREVIEW_BUDGET, previewCacheBytes } from '../media/files';

export function StorageSettings() {
  useT();
  const [bytes, setBytes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { void previewCacheBytes().then(setBytes, e => setError(String(e))); }, []);
  return <div className="storage-dialog">
      <div><h3>{translate('projectHomePreviewCache')}</h3><p>{translate('projectHomeThumbnailsAndWaveformsHelpYouBrowseYourEditsYouCanClearThemAtAnyTimeAndRebuildThemFromYourMedia')}</p></div>
      <div className="storage-meter-label"><span>{bytes === null ? translate('storageCheckingUsage') : translate('storageMiBUsed', { value1: formatNumber(bytes / 1048576, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}</span><span>{PREVIEW_BUDGET / 1048576}{' '}{translate('projectHomeMiBLimit')}</span></div>
      <meter min={0} max={PREVIEW_BUDGET} value={bytes ?? 0} aria-label={translate('projectHomePreviewCacheUsage')} />
      <button className="gb" disabled={busy || bytes === null || bytes === 0} onClick={() => {
        setBusy(true); setError('');
        void clearPreviewCache().then(async () => { setBytes(await previewCacheBytes()); setMessage(translate('storageCacheCleared')); window.dispatchEvent(new Event('media-preview-change')); }).catch(e => setError(String(e))).finally(() => setBusy(false));
      }}>{busy ? translate('storageClearing') : translate('storageClearPreviewCache')}</button>
      <p className="storage-note">{translate('projectHomeProjectEditsAndMediaLinksAreSavedInThisBrowserKeepADownloadedProjectOrAPackageAsABackup')}</p>
      <p role="status">{message}</p>{error && <p role="alert" className="error">{error}</p>}
    </div>;
}
