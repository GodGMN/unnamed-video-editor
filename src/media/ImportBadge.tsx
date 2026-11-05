import { useT } from '../i18n';
import { formatNumber } from '../i18n/core';
import type { TranslationKey } from '../i18n/core';
import { secondsLeft, useImportProgress } from './importProgress';
import type { ImportProgress, ImportStep } from './importProgress';

const STEP_LABELS: Record<ImportStep, TranslationKey> = { store: 'importStepStore', thumbnails: 'importStepThumbnails', waveform: 'importStepWaveform' };
const percent = (p: ImportProgress) => formatNumber(p.fraction, { style: 'percent', maximumFractionDigits: 0 });

/** Over an importing source's thumbnail: the current step's percentage and a bar, or that it waits its turn. */
export function ImportBadge({ id }: { id: string }) {
  const t = useT();
  const p = useImportProgress(id);
  return <>
    <span className="media-importing">{p ? percent(p) : t('importWaiting')}</span>
    {p && <span className="import-bar" role="progressbar" aria-label={t(STEP_LABELS[p.step])}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.fraction * 100)}>
      <span style={{ width: `${p.fraction * 100}%` }} />
    </span>}
  </>;
}

/** An importing source's step, percentage and time left, as one line of text. */
export function ImportDetail({ id }: { id: string }) {
  const t = useT();
  const p = useImportProgress(id);
  if (!p) return <span className="media-meta">{t('importWaiting')}</span>;
  const left = secondsLeft(p);
  const label = p.steps > 1 ? t('importStepOf', { index: p.index + 1, steps: p.steps, label: t(STEP_LABELS[p.step]) }) : t(STEP_LABELS[p.step]);
  const eta = left === null ? null : left < 90 ? t('importSecondsLeft', { count: left < 10 ? Math.ceil(left) : Math.round(left / 5) * 5 }) : t('importMinutesLeft', { count: Math.round(left / 60) });
  return <span className="media-meta import-detail">{[label, percent(p), eta].filter(Boolean).join(' · ')}</span>;
}
