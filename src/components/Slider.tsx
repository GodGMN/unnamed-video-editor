import { useRef, useState } from 'react';
import { ResetButton } from './ResetButton';

interface Props {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  hideLabel?: boolean;
  className?: string;
  /** Maps the value to a 0–1 track position and back, for non-linear controls such as a gain fader. */
  taper?: { toPos: (v: number) => number; fromPos: (pos: number) => number };
  /** Readout for the value; the text box still edits the plain number. */
  format?: (v: number) => string;
  onChange: (v: number) => void;
}

// Scrub field: a field-shaped range input that fills as you drag. The native input sits on top, invisible, for pointer and keyboard.
// The value readout sits above it and turns into a text box on click, so a number can be typed in.
export function Slider({ label, value, unit, min, max, step = 1, defaultValue, hideLabel, className, taper, format, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const pos = taper ? taper.toPos(value) : (value - min) / (max - min);
  const shown = draft ?? (format ? format(value) : String(value));
  const commit = (text: string) => {
    const v = Number(text.replace(',', '.'));
    setDraft(null);
    if (text.trim() && Number.isFinite(v) && v !== value) onChange(Math.min(max, Math.max(min, v)));
  };
  return (
    <label className={className ? `slider ${className}` : 'slider'}>
      {taper
        ? <input type="range" min={0} max={1} step={0.005} value={pos} aria-valuetext={`${shown} ${unit}`}
            onChange={(e) => onChange(taper.fromPos(Number(e.target.value)))} />
        : <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />}
      <span className="slider-fill" style={{ width: `${pos * 100}%` }} aria-hidden="true" />
      <span className={hideLabel ? 'sr-only' : 'slider-label'}>{label}</span>
      <ResetButton value={value} defaultValue={defaultValue} onReset={onChange} />
      <span className="slider-value" onMouseDown={(e) => { if (e.target !== field.current) { e.preventDefault(); field.current?.focus(); } }}
        onClick={(e) => e.preventDefault()}>
        <input ref={field} type="text" inputMode="decimal" aria-label={`${label} value`} value={shown}
          style={{ width: `${Math.max(1, shown.length)}ch` }}
          onFocus={(e) => { setDraft(String(value)); e.target.select(); }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            else if (e.key === 'Escape') { e.currentTarget.value = String(value); setDraft(null); e.currentTarget.blur(); }
          }} />
        <span aria-hidden="true">{unit}</span>
      </span>
    </label>
  );
}
