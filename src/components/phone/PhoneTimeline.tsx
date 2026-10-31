import { useT } from '../../i18n';
import { t as translate } from '../../i18n/core';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { DEFAULT_TRANSITION, MISSING_MEDIA, TRANSITION_NAMES, clipEnd, clipKind, isMediaClip } from '../../editor/model';
import type { AudioClip, Clip, ClipKind, Media, Track, VideoClip } from '../../editor/model';
import type { Editor } from '../../editor/useProject';
import { useDrag } from '../../editor/useProject';
import { PreviewStrip, useMediaPreview } from '../../media/PreviewStrip';
import { Crossfade, CutLine, FadeBlack, Plus } from '../icons';

const MIN_PPS = 8;
const MAX_PPS = 320;
const RULER_H = 22;
/** How long a finger rests on a clip before it can be dragged along the track. */
const HOLD_MS = 350;
/** Movement that turns a press into a scroll rather than a hold. */
const HOLD_SLOP_PX = 8;

/** The main video track is the big filmstrip; everything else is a thin lane. */
function laneHeight(t: Track, main: string | undefined) {
  if (t.id === main) return 56;
  return t.kind === 'video' ? 36 : t.kind === 'audio' ? 30 : 26;
}

/** Seconds between labelled ticks, so labels sit at least ~64 px apart. */
function tickStep(pps: number) {
  return [0.5, 1, 2, 5, 10, 15, 30, 60, 120].find((s) => s * pps >= 64) ?? 300;
}

const fmtTick = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}${s % 1 ? '.5' : ''}`;

/**
 * The phone timeline. The playhead stays in the middle and the tracks scroll under it, so
 * scrolling is scrubbing. Pinch (or Ctrl+wheel) zooms. Tap a clip to select it, drag its
 * handles to trim it, or hold it and drag to move it.
 */
export function PhoneTimeline({ editor, onAdd, onTransition }: { editor: Editor; onAdd: () => void; onTransition: (clipId: string) => void }) {
  useT();
  const { project, ui, layout } = editor;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(40);
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  const [viewW, setViewW] = useState(0);
  const half = viewW / 2;
  const main = project.tracks.find((t) => t.kind === 'video' && t.magnetic)?.id ?? project.tracks.find((t) => t.kind === 'video')?.id;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The scroll position is the playhead. Our own scrolls are remembered so their scroll events don't seek.
  const ownScroll = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !viewW) return;
    const x = ui.playhead * pps;
    if (Math.abs(el.scrollLeft - x) < 1) return;
    ownScroll.current = x;
    el.scrollLeft = x;
  }, [ui.playhead, pps, viewW]);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (ownScroll.current !== null && Math.abs(el.scrollLeft - ownScroll.current) < 1.5) return;
    ownScroll.current = null;
    editor.closeSource();
    editor.setPlayhead(el.scrollLeft / ppsRef.current);
  };

  // Two fingers zoom around the playhead; Ctrl+wheel does the same with a mouse or trackpad.
  const moving = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let pinch: { dist: number; pps: number } | null = null;
    const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const start = (e: TouchEvent) => { if (e.touches.length === 2) pinch = { dist: dist(e), pps: ppsRef.current }; };
    const move = (e: TouchEvent) => {
      // A clip being moved owns the finger, so the tracks must not scroll under it.
      if (moving.current) { e.preventDefault(); return; }
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      setPps(Math.max(MIN_PPS, Math.min(MAX_PPS, pinch.pps * dist(e) / pinch.dist)));
    };
    const end = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null; };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setPps((v) => Math.max(MIN_PPS, Math.min(MAX_PPS, v * Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * 0.004))));
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
      el.removeEventListener('wheel', wheel);
    };
  }, []);

  const width = layout.end * pps;
  const step = tickStep(pps);
  const ticks = [];
  for (let s = 0; s <= layout.end + step; s += step) ticks.push(s);

  // Empty lanes stay out of the way; the main track always shows, so there's somewhere to add to.
  let top = RULER_H;
  const lanes = project.tracks.filter((t) => t.id === main || t.clips.length).map((t) => {
    const lane = { track: t, top, height: laneHeight(t, main) };
    top += lane.height + 6;
    return lane;
  });
  const mainLane = lanes.find((l) => l.track.id === main);

  return (
    <div className="ptl" role="region" aria-label={translate('mobileTimeline')}>
      <div ref={scrollRef} className="ptl-scroll" onScroll={onScroll}
        onClick={(e) => { if ((e.target as Element).closest('.ptl-clip, .ptl-trans, .ptl-edge')) return; editor.pickClips([]); }}>
        <div className="ptl-content" style={{ width: width + 2 * half, height: top, paddingLeft: half }}>
          <div className="ptl-ruler" style={{ left: half, width }} aria-hidden="true">
            {ticks.map((s) => <span key={s} style={{ left: s * pps }}>{fmtTick(s)}</span>)}
          </div>
          {lanes.map(({ track: t, top, height }) => (
            <div key={t.id} className={'ptl-band' + (t.id === main ? ' main' : '')} style={{ top, height }} aria-hidden="true">
              {/* Sticks to the left edge while the tracks scroll. */}
              <span className="ptl-name">{t.name}</span>
            </div>
          ))}
          {lanes.map(({ track: t, top, height }) => (
            <div key={t.id} className={'ptl-lane ' + t.kind + (t.id === main ? ' main' : '')} data-track-id={t.id}
              style={{ top, height, left: half, width: Math.max(width, 1) }}>
              {(t.clips as Clip[]).map((c) => <LaneClip key={c.id} editor={editor} clip={c} kind={clipKind(t.kind)} pps={pps} height={height} moving={moving} />)}
              {t.kind === 'video' && <Transitions editor={editor} clips={t.clips} pps={pps} onOpen={onTransition} />}
            </div>
          ))}
        </div>
      </div>
      <div className="ptl-playhead" aria-hidden="true" />
      {mainLane && (
        <button className={'ptl-add' + (layout.end ? '' : ' empty')} style={{ top: mainLane.top + mainLane.height / 2 - 18 }} onClick={onAdd} aria-label={translate('mobileAddMedia')}>
          <Plus size={18} strokeWidth={2.6} />{!layout.end && <span>{translate('mobileAddMedia')}</span>}
        </button>
      )}
    </div>
  );
}

function LaneClip({ editor, clip, kind, pps, height, moving }: { editor: Editor; clip: Clip; kind: ClipKind; pps: number; height: number; moving: { current: boolean } }) {
  useT();
  const { project, ui, layout } = editor;
  const selected = ui.picked.some((x) => x.id === clip.id);
  const only = selected && ui.picked.length === 1;
  const media = isMediaClip(clip) ? project.media[clip.mediaId] ?? MISSING_MEDIA : null;
  const left = clip.start * pps;
  const w = Math.max(4, (clipEnd(clip) - clip.start) * pps - 2);
  const name = layout.clips[clip.id]?.name ?? '';
  const startDrag = useDrag();
  const [held, setHeld] = useState(false);

  // Hold still to pick the clip up; moving first lets the press scroll the tracks instead.
  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
    const snapshot = project, start0 = clip.start;
    let timer = 0;
    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', early);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
    };
    const early = (ev: PointerEvent) => { if (ev.pointerId === id && Math.hypot(ev.clientX - x0, ev.clientY - y0) > HOLD_SLOP_PX) cleanup(); };
    timer = window.setTimeout(() => {
      cleanup();
      moving.current = true;
      setHeld(true);
      navigator.vibrate?.(10);
      editor.select({ kind, id: clip.id });
      el.setPointerCapture(id);
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        editor.moveClip(snapshot, clip.id, Math.max(0, start0 + (ev.clientX - x0) / pps));
      };
      const end = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        moving.current = false;
        setHeld(false);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    }, HOLD_MS);
    window.addEventListener('pointermove', early);
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
  };

  const edgeDown = (edge: 'in' | 'out') => (e: ReactPointerEvent<HTMLSpanElement>) => {
    const t0 = edge === 'in' ? clip.start : clipEnd(clip);
    moving.current = true;
    startDrag(e, (dx) => editor.trimEdge(clip.id, edge, t0 + dx / pps), () => { moving.current = false; });
  };

  return <>
    <button className={'ptl-clip ' + kind + (selected ? ' selected' : '') + (held ? ' held' : '') + (media?.importing ? ' importing' : '')}
      style={{ left, width: w, height }} aria-pressed={selected} aria-label={name}
      onPointerDown={onPointerDown} onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (!held) editor.select({ kind, id: clip.id }); }}>
      {kind === 'clip' && media && <PreviewStrip media={media} width={w} inS={(clip as VideoClip).inS} outS={(clip as VideoClip).outS} />}
      {kind === 'audio' && media && <Peaks clip={clip as AudioClip} media={media} width={w} height={height} />}
      <span className="ptl-label">{name}</span>
    </button>
    {only && <>
      <span className="ptl-edge in" style={{ left: left - 14 }} onPointerDown={edgeDown('in')} role="slider" aria-label={translate('mobileTrimStart', { name })} aria-valuenow={clip.start} />
      <span className="ptl-edge out" style={{ left: left + w - 10 }} onPointerDown={edgeDown('out')} role="slider" aria-label={translate('mobileTrimEnd', { name })} aria-valuenow={clipEnd(clip)} />
    </>}
  </>;
}

/** The clip's slice of its source's loudness, as bars. */
function Peaks({ clip, media, width, height }: { clip: AudioClip; media: Media; width: number; height: number }) {
  const preview = useMediaPreview(media);
  const peaks = preview?.peaks;
  const n = Math.max(1, Math.floor(width / 3));
  const span = clip.outS - clip.inS || 1;
  const bars = [];
  for (let k = 0; k < n; k++) {
    const time = clip.inS + k / n * span;
    const v = peaks?.length && media.duration ? peaks[Math.min(peaks.length - 1, Math.floor(time / media.duration * peaks.length))] ?? 0 : 0;
    bars.push(<span key={k} style={{ height: clip.muted ? 2 : Math.max(2, Math.round(v * (height - 8))) }} />);
  }
  return <span className="ptl-peaks" aria-hidden="true">{bars}</span>;
}

/** A tappable marker where two clips meet or overlap; tapping opens the transition. */
function Transitions({ editor, clips, pps, onOpen }: { editor: Editor; clips: VideoClip[]; pps: number; onOpen: (clipId: string) => void }) {
  useT();
  const { ui, layout } = editor;
  const sorted = [...clips].sort((a, b) => a.start - b.start);
  return <>
    {sorted.map((c, i) => {
      const next = sorted[i + 1];
      if (!next || next.start > clipEnd(c) + 1e-6) return null;
      const tt = c.transitionOut ?? DEFAULT_TRANSITION;
      const at = (next.start + Math.min(clipEnd(c), clipEnd(next))) / 2;
      return (
        <button key={c.id} className={'ptl-trans' + (tt.type === 'cut' ? '' : ' on')} style={{ left: at * pps - 14 }}
          aria-label={translate('transitionBetweenAnd', { value1: TRANSITION_NAMES[tt.type], value2: layout.clips[c.id]?.name ?? '', value3: layout.clips[next.id]?.name ?? '' })}
          aria-pressed={ui.sel?.kind === 'trans' && ui.sel.id === c.id} onClick={() => onOpen(c.id)}>
          {tt.type === 'crossfade' ? <Crossfade size={13} /> : tt.type === 'fade' ? <FadeBlack size={13} /> : <CutLine size={13} />}
        </button>
      );
    })}
  </>;
}
