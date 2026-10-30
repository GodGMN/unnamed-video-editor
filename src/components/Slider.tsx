interface Props {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step?: number;
  hideLabel?: boolean;
  className?: string;
  onChange: (v: number) => void;
}

// Scrub field: a field-shaped range input that fills as you drag. The native input sits on top, invisible, for pointer and keyboard.
export function Slider({ label, value, unit, min, max, step = 1, hideLabel, className, onChange }: Props) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className={className ? `slider ${className}` : 'slider'}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="slider-fill" style={{ width: `${pct}%` }} aria-hidden="true" />
      <span className={hideLabel ? 'sr-only' : 'slider-label'}>{label}</span>
      <span className="slider-value" aria-hidden="true">{value}{unit}</span>
    </label>
  );
}
