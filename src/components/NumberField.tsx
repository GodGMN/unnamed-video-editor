import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { ResetButton } from './ResetButton';

interface Props {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  defaultValue?: number;
  lead?: ReactNode;
  unit?: string;
  className?: string;
  'aria-label'?: string;
}

const PX_PER_STEP = 4;

// Number input with a jog ruler: drag sideways to scrub, click to type, ↑/↓ to step (Shift ×10).
export function NumberField({ value, onChange, step = 1, min = -Infinity, max = Infinity, defaultValue, lead, unit, className, ...aria }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const ticks = useRef<HTMLSpanElement>(null);
  // Typed text that isn't a number yet (e.g. a lone `-`), so the controlled input doesn't snap it back.
  const [draft, setDraft] = useState<string | null>(null);
  const decimals = (String(step).split('.')[1] ?? '').length;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const commit = (v: number) => onChange(clamp(Number((Math.round(v / step) * step).toFixed(decimals))));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || document.activeElement === input.current) return;
    e.preventDefault();
    const el = e.currentTarget;
    const x0 = e.clientX;
    const v0 = value;
    let dx = 0;
    let travel = 0;
    let lastX = x0;
    let cursorY = e.clientY;
    let moved = false;
    // Locking warps the OS cursor to the screen center, which arrives as one huge delta. Drop events until the
    // lock lands, and any later locked jump too big to be a real hand movement.
    let settling = false;
    let cursor: HTMLDivElement | null = null;
    const listening = new AbortController();
    el.setPointerCapture(e.pointerId);
    el.classList.add('drag');
    // Once scrubbing starts, lock the pointer and draw a stand-in cursor that wraps across the window edges,
    // so the drag never runs out of screen.
    const lock = () => {
      settling = true;
      Promise.resolve(el.requestPointerLock()).catch(() => { settling = false; });
      cursor = document.body.appendChild(document.createElement('div'));
      cursor.className = 'scrub-cursor';
      cursor.hidden = true;
    };
    const move = (ev: globalThis.PointerEvent) => {
      const locked = document.pointerLockElement === el;
      if (settling) {
        lastX = ev.clientX;
        if (locked) settling = false;
        return;
      }
      if (locked && Math.abs(ev.movementX) > window.innerWidth / 4) return;
      const delta = locked ? ev.movementX : ev.clientX - lastX;
      dx += delta;
      travel += Math.abs(delta);
      // Stop accumulating past min/max, so reversing the drag moves the value straight away.
      dx = Math.min((max - v0) / step * PX_PER_STEP, Math.max((min - v0) / step * PX_PER_STEP, dx));
      lastX = ev.clientX;
      if (!moved && travel > 2) { moved = true; lock(); }
      if (!moved) return;
      commit(v0 + Math.round(dx / PX_PER_STEP) * step);
      ticks.current?.style.setProperty('--jog', `${dx}px`);
      if (!cursor) return;
      cursor.hidden = !locked;
      const w = window.innerWidth;
      cursorY = Math.min(window.innerHeight - 1, Math.max(0, cursorY + ev.movementY));
      cursor.style.translate = `${(((x0 + dx) % w) + w) % w}px ${cursorY}px`;
    };
    const up = () => {
      listening.abort();
      el.classList.remove('drag');
      cursor?.remove();
      if (document.pointerLockElement === el) document.exitPointerLock();
      if (!moved) { input.current?.focus(); input.current?.select(); }
    };
    el.addEventListener('pointermove', move, { signal: listening.signal });
    el.addEventListener('pointerup', up, { signal: listening.signal });
    el.addEventListener('pointercancel', up, { signal: listening.signal });
    document.addEventListener('pointerlockerror', () => { settling = false; }, { signal: listening.signal });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    setDraft(null);
    commit(value + step * (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
  };

  return (
    <div className={`nf${lead ? ' nf-lead' : ''}${className ? ` ${className}` : ''}`} onPointerDown={onPointerDown}
      onMouseDown={(e) => { if (document.activeElement !== input.current) e.preventDefault(); }}
      onClick={(e) => e.preventDefault()}>
      {lead}
      <ResetButton value={value} defaultValue={defaultValue} onReset={onChange} />
      <input ref={input} type="number" step={step} min={min} max={max} value={draft ?? value} {...aria}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = e.target.valueAsNumber;
          if (v >= min && v <= max) onChange(v);
        }}
        onBlur={(e) => {
          const v = Number.isNaN(e.target.valueAsNumber) ? value : clamp(e.target.valueAsNumber);
          setDraft(null);
          e.target.value = String(v);
          if (v !== value) onChange(v);
        }}
        onKeyDown={onKeyDown} />
      {unit && <span>{unit}</span>}
      <span ref={ticks} className="nf-ticks" aria-hidden="true" />
    </div>
  );
}
