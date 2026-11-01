import { t as translate } from '../i18n/core';
import type { KeyboardEvent, PointerEvent } from 'react';

interface Props {
  /** `x` drags sideways to set a width, `y` drags up and down to set a height. */
  axis: 'x' | 'y';
  label: string;
  /** The panel being sized. */
  panel: () => HTMLElement | null;
  /** 1 when dragging right or down makes the panel bigger, -1 when it makes it smaller. */
  grow: 1 | -1;
  min: number;
  /** How many pixels the panel can take from its neighbours right now. */
  room: () => number;
  /** The saved size, or undefined while the panel keeps its default. */
  size: number | undefined;
  onResize: (size: number | undefined) => void;
}

const STEP = 16;

/** The draggable border between two panels. Double-click puts the panel back to its default size. */
export function Splitter({ axis, label, panel, grow, min, room, size, onResize }: Props) {
  function bounds() {
    const el = panel();
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const start = axis === 'x' ? rect.width : rect.height;
    return { start, max: Math.max(min, start + room()) };
  }
  const clamp = (value: number, max: number) => Math.min(max, Math.max(min, value));

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const b = bounds();
    if (!b) return;
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const origin = axis === 'x' ? e.clientX : e.clientY;
    document.documentElement.classList.add(axis === 'x' ? 'resizing-x' : 'resizing-y');
    const move = (ev: globalThis.PointerEvent) => onResize(clamp(b.start + grow * ((axis === 'x' ? ev.clientX : ev.clientY) - origin), b.max));
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      document.documentElement.classList.remove('resizing-x', 'resizing-y');
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys = axis === 'x' ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 };
    const sign = keys[e.key as keyof typeof keys];
    if (e.key === 'Enter') { e.preventDefault(); onResize(undefined); return; }
    if (!sign) return;
    const b = bounds();
    if (!b) return;
    e.preventDefault();
    onResize(clamp(b.start + grow * sign * (e.shiftKey ? STEP * 4 : STEP), b.max));
  }

  return (
    <div className={'splitter ' + axis} role="separator" tabIndex={0} aria-label={label} aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-valuenow={size} title={translate('dragToResizeDoubleClickToReset')}
      onPointerDown={onPointerDown} onKeyDown={onKeyDown} onDoubleClick={() => onResize(undefined)} />
  );
}
