import { useT } from '../i18n';
import { t as translate } from '../i18n/core';
import { Reset } from './icons';

// Small inline button that puts a field back to its default; renders nothing while the value is already the default.
export function ResetButton({ value, defaultValue, onReset }: { value: number; defaultValue?: number; onReset: (v: number) => void }) {
  useT();
  if (defaultValue === undefined || value === defaultValue) return null;
  return (
    <button type="button" className="reset-btn" aria-label={translate('resetTo', { value1: defaultValue })} title={translate('resetTo', { value1: defaultValue })}
      onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReset(defaultValue); }}>
      <Reset size={12} strokeWidth={2.2} />
    </button>
  );
}
