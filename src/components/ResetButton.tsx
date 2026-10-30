import { Reset } from './icons';

// Small inline button that puts a field back to its default; renders nothing while the value is already the default.
export function ResetButton({ value, defaultValue, onReset }: { value: number; defaultValue?: number; onReset: (v: number) => void }) {
  if (defaultValue === undefined || value === defaultValue) return null;
  return (
    <button type="button" className="reset-btn" aria-label={`Reset to ${defaultValue}`} title={`Reset to ${defaultValue}`}
      onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReset(defaultValue); }}>
      <Reset size={12} strokeWidth={2.2} />
    </button>
  );
}
