import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  lead?: ReactNode;
  unit?: string;
  className?: string;
  'aria-label'?: string;
}

const PX_PER_STEP = 4;

// Number input with a jog ruler: drag sideways to scrub, click to type, ↑/↓ to step (Shift ×10).
export function NumberField({ value, onChange, step = 1, min = -Infinity, max = Infinity, lead, unit, className, ...aria }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const ticks = useRef<HTMLSpanElement>(null);
  const decimals = (String(step).split('.')[1] ?? '').length;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const commit = (v: number) => onChange(clamp(Number((Math.round(v / step) * step).toFixed(decimals))));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || document.activeElement === input.current) return;
    e.preventDefault();
    const el = e.currentTarget;
    const x0 = e.clientX;
    const v0 = value;
    let moved = false;
    const listening = new AbortController();
    el.setPointerCapture(e.pointerId);
    el.classList.add('drag');
    const move = (ev: globalThis.PointerEvent) => {
      const dx = ev.clientX - x0;
      if (Math.abs(dx) > 2) moved = true;
      if (!moved) return;
      commit(v0 + Math.round(dx / PX_PER_STEP) * step);
      ticks.current?.style.setProperty('--jog', `${dx}px`);
    };
    const up = () => {
      listening.abort();
      el.classList.remove('drag');
      if (!moved) { input.current?.focus(); input.current?.select(); }
    };
    el.addEventListener('pointermove', move, { signal: listening.signal });
    el.addEventListener('pointerup', up, { signal: listening.signal });
    el.addEventListener('pointercancel', up, { signal: listening.signal });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    commit(value + step * (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
  };

  return (
    <div className={`nf${lead ? ' nf-lead' : ''}${className ? ` ${className}` : ''}`} onPointerDown={onPointerDown}
      onMouseDown={(e) => { if (document.activeElement !== input.current) e.preventDefault(); }}
      onClick={(e) => e.preventDefault()}>
      {lead}
      <input ref={input} type="number" step={step} min={min} max={max} value={value} {...aria}
        onChange={(e) => {
          const v = e.target.valueAsNumber;
          if (v >= min && v <= max) onChange(v);
        }}
        onBlur={(e) => {
          const v = Number.isNaN(e.target.valueAsNumber) ? value : clamp(e.target.valueAsNumber);
          e.target.value = String(v);
          if (v !== value) onChange(v);
        }}
        onKeyDown={onKeyDown} />
      {unit && <span>{unit}</span>}
      <span ref={ticks} className="nf-ticks" aria-hidden="true" />
    </div>
  );
}
