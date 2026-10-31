import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Editor } from '../editor/useProject';
import type { VideoClip } from '../editor/model';
import { clipFrame, keyframeInterval, setKeyframeEasing } from '../editor/keyframes';
import type { AnimatedProperty, Easing, Keyframe } from '../editor/keyframes';
import { t } from '../i18n/core';
import type { TranslationKey } from '../i18n/core';
import { Play } from './icons';

const EPS = 1e-6;
const PRESETS: { easing: Easing; name: TranslationKey; hint: TranslationKey; curve: string }[] = [
  { easing: 'linear', name: 'easingLinear', hint: 'easingLinearHint', curve: 'M3 21 L21 3' },
  { easing: 'ease-in', name: 'easingEaseIn', hint: 'easingEaseInHint', curve: 'M3 21 C10.6 21 21 3 21 3' },
  { easing: 'ease-out', name: 'easingEaseOut', hint: 'easingEaseOutHint', curve: 'M3 21 C3 21 13.4 3 21 3' },
  { easing: 'ease-in-out', name: 'easingEaseInOut', hint: 'easingEaseInOutHint', curve: 'M3 21 C10.6 21 13.4 3 21 3' },
];
const preset = (easing: Easing | undefined) => PRESETS.find(p => p.easing === (easing ?? 'linear'))!;

function EasingCurve({ curve }: { curve: string }) {
  return <svg className="easing-curve" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
    <path className="easing-curve-grid" d="M3 21 H21 M3 21 V3" />
    <path className="easing-curve-line" d={curve} />
  </svg>;
}

/** Keys stay in source time, so trims and splits can leave either end outside the visible clip. */
function frameLabel(clip: VideoClip, key: Keyframe, fps: number) {
  if (key.time < clip.inS - EPS) return t('easingBeforeClip');
  if (key.time >= clip.outS - EPS) return t('easingAfterClip');
  return t('easingFrame', { frame: Math.round((key.time - clip.inS) * fps) + 1 });
}

export function KeyframeEasing({ editor, clip, property, label, keys, sourceTime }: {
  editor: Editor; clip: VideoClip; property: AnimatedProperty; label: string; keys: readonly Keyframe[]; sourceTime: number;
}) {
  const fps = editor.project.output.fps;
  const [open, setOpen] = useState(false);
  const [browsed, setBrowsed] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const titleId = useId();
  const followed = keyframeInterval(keys, sourceTime);
  // While open the user browses freely; playing an interval moves the playhead but must not move the selection.
  const index = open ? Math.min(browsed, keys.length - 2) : followed;
  const start = keys[index], end = keys[index + 1];
  const current = preset(start?.easing);
  const summary = `${t('keyframeCount', { count: keys.length })} · ${t(current.name)}`;
  const clipEnd = clip.start + clip.outS - clip.inS;
  const playFrom = Math.max(clip.start, clip.start + (start?.time ?? 0) - clip.inS);
  const playTo = Math.min(clipFrame(clip, clipEnd, fps).timelineTime, clip.start + (end?.time ?? 0) - clip.inS);
  const playable = playTo - playFrom > EPS;

  const close = (refocus: boolean) => { setOpen(false); if (refocus) trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const box = trigger.current!.getBoundingClientRect();
      const { width, height } = popover.current!.getBoundingClientRect();
      const below = box.bottom + 6, above = box.top - height - 6;
      setPosition({
        top: Math.max(8, below + height + 8 > window.innerHeight && above >= 8 ? above : Math.min(below, window.innerHeight - height - 8)),
        left: Math.max(8, Math.min(box.left, window.innerWidth - width - 8)),
      });
    };
    place();
    popover.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
    const outside = (e: PointerEvent) => {
      if (!trigger.current?.contains(e.target as Node) && !popover.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close(true);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  if (keys.length < 2) {
    if (open) setOpen(false);
    return null;
  }

  const choose = (easing: Easing) => {
    if (easing !== (start.easing ?? 'linear')) editor.updateVideoClip(clip.id, { keyframes: setKeyframeEasing(clip, property, start.time, easing) });
  };
  const radioKeys = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    const at = PRESETS.indexOf(current);
    const next = step ? (at + step + PRESETS.length) % PRESETS.length : e.key === 'Home' ? 0 : e.key === 'End' ? PRESETS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    choose(PRESETS[next].easing);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };
  const trapTab = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const focusable = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)')].filter(b => b.tabIndex >= 0);
    const edge = e.shiftKey ? focusable[0] : focusable.at(-1);
    if (document.activeElement === edge) { e.preventDefault(); close(true); }
  };

  return <>
    <button ref={trigger} type="button" className="keyframe-easing-trigger"
      aria-haspopup="dialog" aria-expanded={open}
      aria-label={t('propertyEasingButton', { summary, property: label })}
      title={`${t('propertyEasingTitle', { property: label })} · ${summary}`}
      onClick={() => { if (!open) setBrowsed(followed); setOpen(v => !v); }}>
      <EasingCurve curve={current.curve} />
      <span className="keyframe-easing-summary">{summary}</span>
      <svg className="keyframe-easing-caret" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" /></svg>
    </button>
    {open && createPortal(<div ref={popover} role="dialog" aria-labelledby={titleId} className="keyframe-easing-popover" style={position} onKeyDown={trapTab}>
      <div className="keyframe-easing-head">
        <span id={titleId} className="keyframe-easing-title">{t('propertyEasingTitle', { property: label })}</span>
        <button type="button" className="ib keyframe-easing-close" aria-label={t('close')} onClick={() => close(true)}>
          <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M2.5 2.5 9.5 9.5 M9.5 2.5 2.5 9.5" /></svg>
        </button>
      </div>
      <div className="keyframe-easing-interval">
        {keys.length > 2 && <button type="button" className="ib" aria-label={t('previousEasingInterval')} disabled={index === 0} onClick={() => setBrowsed(index - 1)}>‹</button>}
        <div className="keyframe-easing-range" aria-live="polite">
          <strong>{t('easingInterval', { start: frameLabel(clip, start, fps), end: frameLabel(clip, end, fps) })}</strong>
          {keys.length > 2 && <small>{t('easingIntervalPosition', { current: index + 1, total: keys.length - 1 })}</small>}
        </div>
        {keys.length > 2 && <button type="button" className="ib" aria-label={t('nextEasingInterval')} disabled={index === keys.length - 2} onClick={() => setBrowsed(index + 1)}>›</button>}
      </div>
      <div role="radiogroup" aria-label={t('easingPresets')} className="keyframe-easing-presets" onKeyDown={radioKeys}>
        {PRESETS.map(p => <button key={p.easing} type="button" role="radio" aria-checked={p === current} tabIndex={p === current ? 0 : -1}
          className="keyframe-easing-preset" onClick={() => choose(p.easing)}>
          <EasingCurve curve={p.curve} />
          <span><strong>{t(p.name)}</strong><small>{t(p.hint)}</small></span>
        </button>)}
      </div>
      <button type="button" className="keyframe-action keyframe-easing-play" disabled={!playable}
        onClick={() => editor.playKeyframeInterval(playFrom, playTo)}>
        <Play size={11} />{t('playEasingInterval')}
      </button>
      {!playable && <span className="hint keyframe-hint">{t('easingIntervalHidden')}</span>}
    </div>, document.body)}
  </>;
}
