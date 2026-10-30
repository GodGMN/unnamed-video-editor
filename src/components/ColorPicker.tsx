import { useT } from '../i18n';
import { t as translate } from '../i18n/core';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { NumberField } from './NumberField';

type Rgb = [number, number, number];
interface Hsv { h: number; s: number; v: number }

const RING = 168;
const RING_W = 18;
/** The tone square is inscribed in the ring's hole. */
const PAD = Math.floor((RING - 2 * RING_W) / Math.SQRT2) - 2;
const POP_W = 312;
const GAP = 8;
const RECENT_KEY = 'unnamed-video-editor:recent-colors';
const RECENT_MAX = 8;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return [f(5), f(3), f(1)];
}

export function rgbToHsv([r, g, b]: Rgb): Hsv {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const d = max - Math.min(rr, gg, bb);
  let h = 0;
  if (d) h = max === rr ? ((gg - bb) / d) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

export const rgbToHex = (rgb: Rgb) => '#' + rgb.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();

/** `#RGB` or `#RRGGBB`, with or without the `#`; null when it isn't a hex color. */
export function hexToRgb(hex: string): Rgb | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const full = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

/** Pointer-capture drag that reports the pointer position relative to the element. */
function trackPointer(e: PointerEvent<HTMLElement>, onMove: (x: number, y: number, rect: DOMRect) => void) {
  if (e.button !== 0) return;
  e.preventDefault();
  const el = e.currentTarget;
  el.setPointerCapture(e.pointerId);
  const at = (ev: { clientX: number; clientY: number }) => {
    const r = el.getBoundingClientRect();
    onMove(ev.clientX - r.left, ev.clientY - r.top, r);
  };
  at(e);
  const end = () => {
    el.removeEventListener('pointermove', at);
    el.removeEventListener('pointerup', end);
    el.removeEventListener('pointercancel', end);
  };
  el.addEventListener('pointermove', at);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/** Colors picked in earlier sessions, newest first. Shared by every project in this browser. */
function loadRecent(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string' && !!hexToRgb(x)).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(hex: string) {
  const list = [hex, ...loadRecent().filter((x) => x !== hex)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ }
}

/** A `#RRGGBB` text field that commits when the typed text is a valid hex color. */
export function HexField({ value, onChange, style }: { value: string; onChange: (v: string) => void; style?: CSSProperties }) {
  useT();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const rgb = draft === null ? null : hexToRgb(draft);
    if (rgb) onChange(rgbToHex(rgb));
    setDraft(null);
  };
  return (
    <input className="fld mono" type="text" aria-label={translate('hexColor')} spellCheck={false} style={style}
      value={draft ?? value.toUpperCase()} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }} />
  );
}

interface Props {
  /** The swatch that opened the picker; the popover sits under it and ignores clicks on it. */
  anchor: RefObject<HTMLElement | null>;
  value: string;
  onChange: (hex: string) => void;
  onClose: () => void;
}

/** Hue ring with a tone square inside, plus hex and RGB fields. Floats over the page below its anchor. */
export function ColorPopover({ anchor, value, onChange, onClose }: Props) {
  useT();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; caret: number; above: boolean } | null>(null);
  // Hue survives greys and black, where the hex value alone can't say what it was.
  const [hsv, setHsv] = useState(() => rgbToHsv(hexToRgb(value) ?? [255, 255, 255]));
  const current = rgbToHex(hsvToRgb(hsv));
  if (current !== value.toUpperCase()) {
    const rgb = hexToRgb(value);
    if (rgb) {
      const next = rgbToHsv(rgb);
      setHsv(next.s && next.v ? next : { ...next, h: hsv.h });
    }
  }
  const rgb = hsvToRgb(hsv);
  const [recent] = useState(loadRecent);
  // On close, remember the final color if this session changed it.
  const opened = useRef(current);
  const latest = useRef(current);
  latest.current = current;
  useEffect(() => () => { if (latest.current !== opened.current) pushRecent(latest.current); }, []);
  const set = (patch: Partial<Hsv>) => {
    const next = { ...hsv, ...patch };
    setHsv(next);
    onChange(rgbToHex(hsvToRgb(next)));
  };

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 0;
      if (!a) return;
      const left = Math.max(GAP, Math.min(window.innerWidth - POP_W - GAP, a.right - POP_W + 24));
      const above = a.bottom + GAP + h > window.innerHeight - GAP && a.top - GAP - h >= GAP;
      setPos({ left, top: above ? a.top - GAP - h : a.bottom + GAP, caret: a.left + a.width / 2 - left, above });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);

  useEffect(() => {
    const down = (e: globalThis.PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('keydown', key);
    };
  }, [anchor, onClose]);

  const onRingDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.tone-pad')) return;
    trackPointer(e, (x, y, r) => set({ h: (Math.atan2(y - r.height / 2, x - r.width / 2) * 180 / Math.PI + 360) % 360 }));
  };
  const onPadDown = (e: PointerEvent<HTMLDivElement>) =>
    trackPointer(e, (x, y, r) => set({ s: clamp01(x / r.width), v: 1 - clamp01(y / r.height) }));

  const angle = hsv.h * Math.PI / 180;
  const radius = RING / 2 - RING_W / 2;
  const pure = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));
  const setChannel = (i: number) => (n: number) => {
    const next = [...rgb] as Rgb;
    next[i] = n;
    onChange(rgbToHex(next));
  };

  return createPortal(
    <div ref={ref} className={'color-pop' + (pos?.above ? translate('above') : '')} role="dialog" aria-label={translate('customColor')}
      style={{ width: POP_W, left: pos?.left ?? -9999, top: pos?.top ?? 0, ['--caret' as string]: `${pos?.caret ?? 0}px` }}>
      <div className="color-pop-main">
        <div className="hue-ring" style={{ width: RING, height: RING }} onPointerDown={onRingDown}
          role="slider" aria-label={translate('hue')} aria-valuemin={0} aria-valuemax={359} aria-valuenow={Math.round(hsv.h)} tabIndex={0}
          onKeyDown={(e) => {
            const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
            if (d) { e.preventDefault(); set({ h: (hsv.h + d * (e.shiftKey ? 10 : 1) + 360) % 360 }); }
          }}>
          <span className="hue-ring-hole" style={{ inset: RING_W }} />
          <span className="picker-knob" style={{ left: RING / 2 + Math.cos(angle) * radius, top: RING / 2 + Math.sin(angle) * radius, background: pure }} />
          <div className="tone-pad" style={{ width: PAD, height: PAD, background: pure }} onPointerDown={onPadDown}
            role="slider" aria-label={translate('saturationAndBrightness')} aria-valuetext={translate('saturationBrightness', { value1: Math.round(hsv.s * 100), value2: Math.round(hsv.v * 100) })}>
            <span className="picker-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: current }} />
          </div>
        </div>
        <div className="color-pop-fields">
          <span className="color-pop-chip" style={{ background: current }} />
          <HexField value={current} onChange={onChange} />
          {(['R', 'G', 'B'] as const).map((k, i) => (
            <NumberField key={k} lead={k} aria-label={translate('channel', { value1: k === 'R' ? translate('uiRed') : k === 'G' ? translate('uiGreen') : translate('uiBlue') })}
              min={0} max={255} value={rgb[i]} onChange={setChannel(i)} />
          ))}
        </div>
      </div>
      {recent.length > 0 && (
        <div className="color-pop-recent">
          <span className="eyebrow">{translate('recent')}</span>
          <div role="group" aria-label={translate('recentColors')}>
            {recent.map((hex) => (
              <button key={hex} style={{ background: hex }} aria-label={hex} title={hex}
                aria-pressed={hex === current} onClick={() => onChange(hex)} />
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
