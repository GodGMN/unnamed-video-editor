import { useT } from '../i18n';
import { t as translate, formatNumber } from '../i18n/core';
import { PreviewStrip, useMediaPreview } from '../media/PreviewStrip';
import type { DragEvent, KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_TRANSITION, GAIN_MAX_DB, GAIN_MIN_DB, MIN_SPLIT_PIECE, MISSING_MEDIA, PPS, STILL_DURATION, TRANSITION_NAMES, acceptsMedia, audioFor, canRemoveTrack, clipKind, curveName, dbToFader, dbToGain, faderToDb, fmtDb, edgeTargets, findClip, findMediaClip, isLinked, isMediaClip, movingGroup, partnersOf, pickedPair, removeTrack as removeTrackModel, clipDuration, clipEnd, mediaDropStart, snapClipStart, snapEdge, trimClipEdge } from '../editor/model';
import type { AudioClip, Clip, ClipKind, Fades, ClipSelection, MediaClip, Project, TextClip, TransitionType, Track, VideoClip } from '../editor/model';
import type { Editor } from '../editor/useProject';
import { useDrag } from '../editor/useProject';
import { MEDIA_MIME, mediaDrag } from '../media/drag';
import type { PickedFile } from '../media/links';
import type { Placement } from '../media/useImports';
import { Dialog } from './Dialog';
import { CutLine, Crossfade, Duplicate, Eye, FadeBlack, Link, Magnet, Mute, Plus, Scissors, TextT, Trash, Unlink, Volume } from './icons';

const TEXT_TRACK_H = 44;
const VIDEO_TRACK_H = 56;
const AUDIO_TRACK_H = 64;
const VIDEO_CLIP_H = 44;
const AUDIO_CLIP_H = 52;

/** Screen pixels within which a split snaps to the playhead, like the magnet's snap radius. */
const SPLIT_SNAP_PX = 8;

const TRACK_H = { text: TEXT_TRACK_H, video: VIDEO_TRACK_H, audio: AUDIO_TRACK_H };

/** Clips cancel pointerdown for dragging, so a properties field would keep focus (and eat Delete) without this. */
const blurField = () => {
  const el = document.activeElement;
  if (el instanceof HTMLElement && el.matches('input, textarea, select, [contenteditable=true]')) el.blur();
};

const isOff = (t: Track) => (t.kind === 'audio' ? t.muted : t.hidden);

interface Overlap { from: MediaClip; to: MediaClip; start: number; end: number }

/** Overlapping regions between neighbouring clips of one track, in start order. */
function overlapsOf<C extends MediaClip>(clips: C[]): Overlap[] {
  const sorted = [...clips].sort((a, b) => a.start - b.start);
  const out: Overlap[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const end = Math.min(clipEnd(sorted[i]), clipEnd(sorted[i + 1]));
    if (end - sorted[i + 1].start > 1e-6) out.push({ from: sorted[i], to: sorted[i + 1], start: sorted[i + 1].start, end });
  }
  return out;
}

/** Seconds of each clip covered by a neighbour at its head and at its tail. */
function overlapInsets(clips: MediaClip[]) {
  const insets = new Map<string, { head: number; tail: number }>();
  const get = (id: string) => insets.get(id) ?? insets.set(id, { head: 0, tail: 0 }).get(id)!;
  for (const o of overlapsOf(clips)) {
    get(o.to.id).head = o.end - o.start;
    get(o.from.id).tail = o.end - o.start;
  }
  return insets;
}

const TRANSITION_MIME = 'application/x-timeline-transition';
const isTransitionDrag = (e: { dataTransfer: DataTransfer }) => e.dataTransfer.types.includes(TRANSITION_MIME);
/** Whether a drag carries files from outside the page. */
const isFileDrag = (e: { dataTransfer: DataTransfer }) => e.dataTransfer.types.includes('Files');

/**
 * The video clip whose outgoing transition a drop at `time` on `track` sets, or null. Audio overlaps
 * stand in for their linked video clips' overlap; `slop` widens narrow overlaps so they're easy to hit.
 */
function transitionTargetAt(project: Project, track: Track, time: number, slop: number): string | null {
  if (track.kind === 'text') return null;
  const hit = overlapsOf<MediaClip>(track.clips).find((o) => time >= o.start - slop && time <= o.end + slop);
  if (!hit) return null;
  if (track.kind === 'video') return hit.from.id;
  const video = partnersOf(project, hit.from).map((c) => findMediaClip(project, c.id)!).find((f) => f.track.kind === 'video');
  return video && overlapsOf<MediaClip>(video.track.clips).some((o) => o.from.id === video.clip.id) ? video.clip.id : null;
}

/** `onDropFiles` imports files dropped on a track and places them there. */
export function Timeline({ editor, onDropFiles }: { editor: Editor; onDropFiles: (files: PickedFile[], place: Placement) => void }) {
  useT();
  const { project, ui, layout, select, setTool, setPlayhead, unlock, toggleTrack, openMenu, closeMenu, deleteSelection } = editor;
  const focus = ui.lockClip ? layout.clips[ui.lockClip] : undefined;
  const focused = !!focus;
  const rootRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(PPS);
  const scaleRef = useRef(PPS);
  const pendingScroll = useRef<number | null>(null);
  const [viewW, setViewW] = useState(0);
  const [trackMenu, setTrackMenu] = useState<{ id: string; left: number; top: number } | null>(null);
  const [confirmTrack, setConfirmTrack] = useState<string | null>(null);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const ro = new ResizeObserver(() => setViewW(scroll.clientWidth));
    ro.observe(scroll);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const scroll = scrollRef.current;
      if (!scroll || event.deltaY === 0) return;
      const oldScale = scaleRef.current;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientWidth : 1);
      const nextScale = Math.max(8, Math.min(320, oldScale * Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.002)));
      if (nextScale === oldScale) return;
      const anchor = Math.max(0, Math.min(scroll.clientWidth, event.clientX - scroll.getBoundingClientRect().left));
      const left = pendingScroll.current ?? scroll.scrollLeft;
      pendingScroll.current = (left + anchor) * nextScale / oldScale - anchor;
      scaleRef.current = nextScale;
      setPps(nextScale);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  useLayoutEffect(() => {
    if (scrollRef.current && pendingScroll.current !== null) {
      scrollRef.current.scrollLeft = pendingScroll.current;
      pendingScroll.current = null;
    }
  }, [pps]);

  // Delete or Backspace removes the selection, unless the key is meant for a text field or a dialog.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable=true]') || document.querySelector('[role=dialog]')) return;
      event.preventDefault();
      closeMenu();
      deleteSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeMenu, deleteSelection]);

  const startDrag = useDrag();
  const [snapping, setSnapping] = useState(true);
  // The time a trimmed edge is snapped to, drawn as a dashed line across every track.
  const [snapGuide, setSnapGuide] = useState<number | null>(null);
  // The video clip whose transition a dragged transition would replace, for drop highlighting.
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Where a clip dragged in from the media panel would land.
  const [ghost, setGhost] = useState<{ trackId: string; start: number; duration: number; name: string; insert: boolean } | null>(null);
  useEffect(() => {
    const clear = () => { setDropTarget(null); setGhost(null); };
    window.addEventListener('dragend', clear);
    return () => window.removeEventListener('dragend', clear);
  }, []);
  const splitting = ui.tool === 'split';
  // Where a click would cut in split mode, and the tracks the cut reaches.
  const [cut, setCut] = useState<{ time: number; trackIds: string[] } | null>(null);
  useEffect(() => { if (!splitting) setCut(null); }, [splitting]);

  // S toggles the scissors, T adds text at the playhead, Esc puts the scissors away, Ctrl+D duplicates.
  const keys = useRef({ editor, splitting });
  keys.current = { editor, splitting };
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.repeat || e.altKey || target.closest('input, textarea, select, [contenteditable=true]') || document.querySelector('[aria-modal=true]')) return;
      const { editor, splitting } = keys.current;
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key !== 'd' || e.shiftKey) return;
        e.preventDefault();
        for (const x of editor.ui.picked) editor.duplicateClip(x.id);
      } else if (key === 's') editor.setTool(splitting ? 'select' : 'split');
      else if (key === 't') editor.addText(editor.ui.playhead);
      else if (key === 'escape' && splitting) editor.setTool('select');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** What a split-mode click at the pointer would cut on track `t`: the topmost clip under it. */
  const cutTarget = (e: PointerEvent<HTMLDivElement>, t: Track) => {
    let time = Math.max(0, (e.clientX - e.currentTarget.getBoundingClientRect().left) / pps);
    if (snapping && Math.abs(time - ui.playhead) * pps <= SPLIT_SNAP_PX) time = ui.playhead;
    const inside = (c: Clip) => time - c.start >= MIN_SPLIT_PIECE && clipEnd(c) - time >= MIN_SPLIT_PIECE;
    const clip = [...t.clips as Clip[]].reverse().find(inside);
    if (!clip) return null;
    const partners = isLinked(clip) ? partnersOf(project, clip).filter(inside) : [];
    return { time, id: clip.id, trackIds: [t.id, ...partners.map((c) => findClip(project, c.id)!.track.id)] };
  };
  const onSplitMove = (e: PointerEvent<HTMLDivElement>, t: Track) => {
    const target = cutTarget(e, t);
    setCut(target ? { time: target.time, trackIds: target.trackIds } : null);
  };
  // Captured so the click cuts instead of grabbing a clip, trim handle or gain line underneath.
  const onSplitDown = (e: PointerEvent<HTMLDivElement>, t: Track) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const target = cutTarget(e, t);
    if (!target) return;
    editor.splitClip(target.id, target.time);
    setCut(null);
  };

  // Ticks run past the content and on to the right edge of the viewport when zoomed out.
  const lastTick = Math.max(Math.ceil(layout.end) + 2, Math.ceil(viewW / pps));
  const tlWidth = (Math.ceil(layout.end) + 2) * pps + 20;

  /** Where a context menu opened at the pointer goes, kept inside the timeline. */
  const menuSpot = (e: MouseEvent, height: number) => {
    e.preventDefault();
    e.stopPropagation();
    const root = rootRef.current;
    if (!root) return null;
    const r = root.getBoundingClientRect();
    return {
      left: Math.max(8, Math.min(e.clientX - r.left + 4, root.offsetWidth - 244)),
      top: Math.max(8, Math.min(e.clientY - r.top + 4, root.offsetHeight - height)),
    };
  };
  const onContextMenu = (kind: ClipKind, id: string) => (e: MouseEvent) => {
    const spot = menuSpot(e, 290);
    if (!spot) return;
    setTrackMenu(null);
    openMenu({ kind, id, ...spot });
  };
  const onTrackMenu = (id: string) => (e: MouseEvent) => {
    const spot = menuSpot(e, 120);
    if (!spot) return;
    closeMenu();
    setTrackMenu({ id, ...spot });
  };

  // Press anywhere on the ruler to jump the playhead there, then drag to scrub. While a clip
  // is locked the playhead stays inside it; double-click the ruler to release it.
  const onRulerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    editor.closeSource();
    const left = e.currentTarget.getBoundingClientRect().left;
    const seek = (clientX: number) => setPlayhead((clientX - left) / pps);
    const x0 = e.clientX;
    seek(x0);
    startDrag(e, (dx) => seek(x0 + dx));
  };

  // Drag on empty timeline space to draw a box; every clip it touches is picked.
  // Ctrl, Cmd or Shift adds the boxed clips to the current selection; a plain click without a drag clears it.
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const onMarqueeDown = (e: PointerEvent<HTMLDivElement>) => {
    const content = contentRef.current;
    const target = e.target as Element;
    if (e.button !== 0 || ui.tool !== 'select' || !content) return;
    if (target !== e.currentTarget && target !== content && !target.classList.contains('track')) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const base = additive(e) || e.shiftKey ? ui.picked : [];
    const snapshot = project;
    const at = (ev: { clientX: number; clientY: number }) => {
      const r = content.getBoundingClientRect();
      return { x: Math.max(0, Math.min(r.width, ev.clientX - r.left)), y: Math.max(0, Math.min(r.height, ev.clientY - r.top)) };
    };
    const p0 = at(e);
    let dragging = false;
    let lastKey = '';
    const move = (ev: globalThis.PointerEvent) => {
      const p = at(ev);
      if (!dragging && Math.hypot(p.x - p0.x, p.y - p0.y) < 3) return;
      dragging = true;
      const box = { left: Math.min(p0.x, p.x), top: Math.min(p0.y, p.y), right: Math.max(p0.x, p.x), bottom: Math.max(p0.y, p.y) };
      setMarquee({ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top });
      const scale = scaleRef.current;
      const top = content.getBoundingClientRect().top;
      const picked = [...base];
      for (const row of content.querySelectorAll<HTMLElement>('.track')) {
        const r = row.getBoundingClientRect();
        const t = snapshot.tracks.find((x) => x.id === row.dataset.trackId);
        if (!t || r.bottom - top <= box.top || r.top - top >= box.bottom) continue;
        for (const c of t.clips as Clip[]) {
          if (c.start * scale < box.right && clipEnd(c) * scale > box.left && !picked.some((x) => x.id === c.id))
            picked.push({ kind: clipKind(t.kind), id: c.id });
        }
      }
      const key = picked.map((x) => x.id).join();
      if (key !== lastKey) { lastKey = key; editor.pickClips(picked); }
    };
    const end = (ev: globalThis.PointerEvent) => {
      // A plain click on empty space (no box drawn) deselects everything.
      if (!dragging && ev.type === 'pointerup' && !base.length) editor.pickClips([]);
      setMarquee(null);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };

  // Media drops place a clip; transition drops land anywhere over an overlap, including its trim handles.
  const transitionTarget = (e: DragEvent<HTMLDivElement>, t: Track) =>
    transitionTargetAt(project, t, (e.clientX - e.currentTarget.getBoundingClientRect().left) / pps, 6 / pps);
  const onTrackDragOver = (e: DragEvent<HTMLDivElement>, t: Track) => {
    if (isTransitionDrag(e)) {
      const target = transitionTarget(e, t);
      setDropTarget(target);
      if (target) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
    } else if (e.dataTransfer.types.includes(MEDIA_MIME)) {
      const media = mediaDrag.id ? project.media[mediaDrag.id] : undefined;
      if (t.kind === 'text' || !acceptsMedia(t, media)) { setGhost(null); return; }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const insert = t.kind === 'video' && t.magnetic;
      const start = mediaDropStart(t, mediaTime(e, t, media.duration));
      if (ghost?.trackId !== t.id || ghost.start !== start || ghost.duration !== media.duration)
        setGhost({ trackId: t.id, start, duration: media.duration, name: media.name, insert });
    } else if (isFileDrag(e)) {
      // A file's length is only known once it's dropped and read, so the ghost shows a still's.
      if (t.kind === 'text') { setGhost(null); return; }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const count = e.dataTransfer.items.length;
      const name = translate('importDroppedFiles', { count: Math.max(1, count) });
      const start = mediaDropStart(t, mediaTime(e, t, STILL_DURATION));
      if (ghost?.trackId !== t.id || ghost.start !== start || ghost.name !== name)
        setGhost({ trackId: t.id, start, duration: STILL_DURATION, name, insert: t.kind === 'video' && t.magnetic });
    }
  };
  const pointerTime = (e: DragEvent<HTMLDivElement>) => Math.max(0, (e.clientX - e.currentTarget.getBoundingClientRect().left) / pps);
  const mediaTime = (e: DragEvent<HTMLDivElement>, t: Track, duration: number) => snapDrop(pointerTime(e), t, duration);
  // Off magnetic tracks a dropped clip snaps to nearby edges and the playhead.
  const snapDrop = (time: number, t: Track, duration: number) => {
    if (!snapping || (t.kind === 'video' && t.magnetic)) return time;
    const targets = [0, ui.playhead];
    for (const track of project.tracks) for (const clip of track.clips as Clip[]) targets.push(clip.start, clipEnd(clip));
    return snapClipStart(time, duration, targets, pps);
  };
  const onTrackDrop = (e: DragEvent<HTMLDivElement>, t: Track) => {
    e.preventDefault();
    setDropTarget(null);
    if (isTransitionDrag(e)) {
      const type = e.dataTransfer.getData(TRANSITION_MIME);
      const target = transitionTarget(e, t);
      if (!target || !Object.hasOwn(TRANSITION_NAMES, type)) return;
      editor.updateTransition(target, { type: type as TransitionType });
      select({ kind: 'trans', id: target });
      return;
    }
    setGhost(null);
    if (!e.dataTransfer.types.includes(MEDIA_MIME) && isFileDrag(e)) {
      // The clip snaps once the file is read and its length known.
      const time = pointerTime(e);
      if (t.kind !== 'text') onDropFiles(Array.from(e.dataTransfer.files, (file) => ({ file })), { trackId: t.id, timeFor: (duration) => snapDrop(time, t, duration) });
      return;
    }
    const media = project.media[e.dataTransfer.getData(MEDIA_MIME)];
    if (t.kind !== 'text' && acceptsMedia(t, media)) editor.placeMedia(media.id, t.id, mediaTime(e, t, media.duration));
  };

  const ticks = [];
  for (let s = 0; s <= lastTick; s++) {
    const major = s % (pps < 16 ? 10 : pps < 40 ? 5 : pps < 100 ? 2 : 1) === 0;
    ticks.push(
      <div key={s}>
        <div className="tick" style={{ left: s * pps, height: major ? 10 : 5 }} />
        {major && <span className="tick-label" style={{ left: s * pps + 4 }}>{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>}
      </div>,
    );
  }

  return (
    <section ref={rootRef} className={'panel timeline' + (splitting ? ' splitting' : '')} onClick={() => { closeMenu(); setTrackMenu(null); }} onPointerDownCapture={blurField}>
      <div className="tl-tools">
        <div className="toolbar" role="toolbar" aria-label={translate('timelineTools')}>
          <button aria-pressed={splitting} title={translate('splitSClickClipsToCutThem')} onClick={() => setTool(splitting ? 'select' : 'split')}>
            <Scissors size={14} />{translate('split')}<span className="kbd">{"S"}</span>
          </button>
          <button title={translate('addTextAtThePlayheadT')} onClick={() => editor.addText(ui.playhead)}>
            <TextT size={14} />{translate('text')}<span className="kbd">{"T"}</span>
          </button>
          <span className="tool-separator" role="separator" aria-orientation="vertical" />
          <button aria-label={translate('snapClips')} aria-pressed={snapping} title={translate('snapClips')} onClick={() => setSnapping(v => !v)}><Magnet size={16} /></button>
        </div>
        {(splitting || focused) && <span className="hint">{splitting ? translate('clickAClipToCutItCutsSnapTo') : translate('playheadLockedToAClipDoubleClickTheTime')}</span>}
        <div className="spacer" />
        <button className="ib outlined chip"><Plus size={12} strokeWidth={2.4} />{translate('videoTrack')}</button>
        <button className="ib outlined chip"><Plus size={12} strokeWidth={2.4} />{translate('audioTrack')}</button>
        <button className="ib outlined chip">{translate('fit')}</button>
      </div>

      <div className="tl-body">
        <div className="track-heads">
          <div style={{ height: 28, borderBottom: '1px solid var(--line)' }} />
          {project.tracks.map((t) => {
            const off = isOff(t);
            return (
              <div key={t.id} className="track-head" style={{ height: TRACK_H[t.kind] }} onContextMenu={onTrackMenu(t.id)}>
                <span className="track-head-label"><span>{t.name}</span><span>{t.label}</span></span>
                <button className="ib" style={{ width: 28, ['--h' as string]: '28px', color: off ? 'var(--warn)' : 'var(--text-muted)' }}
                  aria-label={translate('track', { value1: t.kind === 'audio' ? (off ? translate('uiUnmute') : translate('uiMute')) : (off ? translate('uiShow') : translate('uiHide')), value2: t.name })}
                  aria-pressed={off} onClick={() => toggleTrack(t.id)}>
                  {t.kind === 'audio' ? <Volume size={14} /> : <Eye size={14} />}
                </button>
              </div>
            );
          })}
        </div>

        <div ref={scrollRef} className="tl-scroll" onPointerDown={onMarqueeDown}>
          <div ref={contentRef} style={{ position: 'relative', width: tlWidth, minWidth: '100%' }}>
            <div className="ruler" onPointerDown={onRulerDown} onDoubleClick={unlock}
              title={focused ? translate('doubleClickToReleaseTheLockedClip') : undefined}>
              {ticks}
              {focus && (
                <div className="focus-band" style={{ left: focus.start * pps, width: (focus.end - focus.start) * pps }} aria-hidden="true">
                  <span className="focus-handle start"><span className="grip" /></span>
                  <span className="focus-handle end"><span className="grip" /></span>
                </div>
              )}
            </div>

            {project.tracks.map((t) => {
              const insets = t.kind === 'text' ? null : overlapInsets(t.clips);
              return (
              <div key={t.id} className='track' onDragOver={(e) => onTrackDragOver(e, t)} onDrop={(e) => onTrackDrop(e, t)}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { setDropTarget(null); setGhost(null); } }}
                onPointerDownCapture={splitting ? (e) => onSplitDown(e, t) : undefined}
                onClickCapture={splitting ? (e) => e.stopPropagation() : undefined}
                onDoubleClickCapture={splitting ? (e) => e.stopPropagation() : undefined}
                onPointerMove={splitting ? (e) => onSplitMove(e, t) : undefined}
                onPointerLeave={splitting ? () => setCut(null) : undefined}
                data-track-id={t.id} style={{ height: TRACK_H[t.kind], ['--track-h' as string]: `${TRACK_H[t.kind]}px`, opacity: isOff(t) ? 0.35 : 1 }}>
                {t.kind === 'text' && (
                  <>
                    {t.clips.map((c) => <TextClipView key={c.id} editor={editor} pps={pps} snapping={snapping} clip={c} onMenu={onContextMenu('text', c.id)} />)}
                    <TrimHandles pps={pps} editor={editor} clips={t.clips} snapping={snapping} onGuide={setSnapGuide} />
                  </>
                )}
                {t.kind === 'video' && (
                  <>
                    {t.clips.map((c) => <VideoClipView key={c.id} editor={editor} pps={pps} snapping={snapping} clip={c} inset={insets!.get(c.id)} onMenu={onContextMenu('clip', c.id)} />)}
                    <Transitions pps={pps} editor={editor} clips={t.clips} dropTarget={dropTarget} />
                    <TrimHandles pps={pps} editor={editor} clips={t.clips} snapping={snapping} onGuide={setSnapGuide} />
                  </>
                )}
                {t.kind === 'audio' && (
                  <>
                    {t.clips.map((c) => (
                      <AudioClipView key={c.id} editor={editor} pps={pps} snapping={snapping} clip={c} inset={insets!.get(c.id)} onMenu={onContextMenu('audio', c.id)} />
                    ))}
                    {overlapsOf(t.clips).map((o) => (
                      <span key={o.from.id} className="overlap-band audio" style={{ left: o.start * pps + 1, width: (o.end - o.start) * pps - 2 }} aria-hidden="true" />
                    ))}
                    <TrimHandles pps={pps} editor={editor} clips={t.clips} snapping={snapping} onGuide={setSnapGuide} />
                  </>
                )}
                {cut?.trackIds.includes(t.id) && <span className="split-guide" style={{ left: cut.time * pps }} aria-hidden="true" />}
                {ghost?.trackId === t.id && (
                  <div className={'drop-ghost' + (ghost.insert ? ' insert' : '')} aria-hidden="true"
                    style={{ left: ghost.start * pps, width: Math.max(2, ghost.duration * pps) }}>
                    <span>{ghost.name}</span>
                  </div>
                )}
              </div>
              );
            })}

            {focus && (
              <>
                <div className="focus-dim" style={{ left: 0, width: focus.start * pps }} aria-hidden="true" />
                <div className="focus-dim" style={{ left: focus.end * pps, right: 0 }} aria-hidden="true" />
              </>
            )}
            <div className="playhead" style={{ left: ui.playhead * pps }} />
            {snapGuide !== null && <div className="snap-guide" style={{ left: snapGuide * pps }} aria-hidden="true" />}
            {marquee && <div className="marquee" style={marquee} aria-hidden="true" />}
          </div>
        </div>
      </div>

      {ui.menu && <ClipMenu editor={editor} />}
      {trackMenu && <TrackMenu editor={editor} {...trackMenu} onClose={() => setTrackMenu(null)} onConfirm={setConfirmTrack} />}
      {confirmTrack && <DeleteTrackDialog editor={editor} id={confirmTrack} onClose={() => setConfirmTrack(null)} />}
    </section>
  );
}

/** Ctrl (or Cmd) adds a clip to the selection instead of replacing it. */
const additive = (e: { ctrlKey: boolean; metaKey: boolean }) => e.ctrlKey || e.metaKey;

/** Click handler for a clip: plain clicks select it alone, Ctrl-clicks toggle it in the selection. */
const clickClip = (editor: Editor, clip: ClipSelection) => (e: MouseEvent) =>
  additive(e) ? editor.togglePick(clip) : editor.select(clip);

/** Double-clicking a clip locks the playhead to it. */
const lockClip = (editor: Editor, id: string) => (e: MouseEvent) => {
  if (editor.ui.tool === 'select' && !additive(e)) editor.lockTo(id);
};

const isPicked = ({ ui }: Editor, id: string) => ui.picked.some((x) => x.id === id);

/**
 * Dragging a clip moves it with its linked partners. Dragging one of several picked clips moves
 * the whole selection; a plain click on it (no drag) still selects it alone.
 */
function useClipMove(editor: Editor, clip: Clip, kind: ClipKind, snapping: boolean) {
  const startDrag = useDrag();
  const dragged = useRef(false);
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    dragged.current = false;
    if (e.button !== 0 || editor.ui.tool !== 'select' || additive(e)) return;
    const snapshot = editor.project;
    const others = isPicked(editor, clip.id) ? editor.ui.picked.map(x => x.id).filter(id => id !== clip.id) : [];
    const moving = new Set(movingGroup(snapshot, [clip.id, ...others]).map(c => c.id));
    const targets = [0];
    for (const track of snapshot.tracks) for (const c of track.clips as Clip[]) if (!moving.has(c.id)) targets.push(c.start, clipEnd(c));
    const element = e.currentTarget;
    const pps = ((element.closest('.audio-clip') ?? element).getBoundingClientRect().width + 3) / clipDuration(clip);
    // Vertical bands of the tracks the clip can move between, measured once at drag start.
    const laneIds = snapshot.tracks.filter(t => clipKind(t.kind) === kind).map(t => t.id);
    const lanes = laneIds.map(tid => element.closest('.tl-scroll')?.querySelector(`.track[data-track-id="${tid}"]`)?.getBoundingClientRect());
    const from = laneIds.findIndex(tid => (snapshot.tracks.find(t => t.id === tid)!.clips as Clip[]).some(c => c.id === clip.id));
    const laneAt = (y: number) => {
      let best = from;
      let distance = Infinity;
      lanes.forEach((r, i) => {
        if (!r) return;
        const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
        if (d < distance) { best = i; distance = d; }
      });
      return best;
    };
    const y0 = e.clientY;
    if (!others.length) editor.select({ kind, id: clip.id });
    startDrag(e, (dx, dy) => {
      if (!dragged.current && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      dragged.current = true;
      const start = Math.max(0, clip.start + dx / pps);
      editor.moveClip(snapshot, clip.id, snapping ? snapClipStart(start, clipDuration(clip), targets, pps) : start, others, laneAt(y0 + dy) - from);
    });
  };
  // The click that ends a drag keeps the selection as it is.
  const onClick = (e: MouseEvent) => {
    if (!dragged.current) clickClip(editor, { kind, id: clip.id })(e);
  };
  return { onPointerDown, onClick };
}

interface ClipProps<C> {
  editor: Editor;
  pps: number;
  snapping: boolean;
  clip: C;
  /** Seconds hidden under neighbouring clips at the head and tail. */
  inset?: { head: number; tail: number };
  onMenu: (e: MouseEvent) => void;
}

/** Whether the selection is a linked partner of `clip` (of the given selection kind). */
function partnerSelected({ project, ui }: Editor, clip: MediaClip, kind: 'clip' | 'audio') {
  const sel = ui.sel;
  return !!sel && sel.kind === kind && clip.linked && clip.linkId !== null && findMediaClip(project, sel.id)?.clip.linkId === clip.linkId;
}

function VideoClipView({ editor, pps, snapping, clip: cs, inset, onMenu }: ClipProps<VideoClip>) {
  useT();
  const { project } = editor;
  const move = useClipMove(editor, cs, 'clip', snapping);
  const id = cs.id;
  const src = project.media[cs.mediaId] ?? MISSING_MEDIA;
  const width = clipDuration(cs) * pps - 3;
  const dur = cs.outS - cs.inS;
  const selected = isPicked(editor, id);
  const partner = partnerSelected(editor, cs, 'audio');

  return (
    <button className={'clip' + (partner ? ' partner' : '') + (src.importing ? ' importing' : '')}
      style={{ left: cs.start * pps + 1, width, background: src.tone }}
      aria-label={translate('seconds', { value1: src.still ? translate('uiImage') : translate('uiVideo'), value2: src.name, value3: formatNumber(dur, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), value4: (cs.linked ? translate('uiLinkedToAudio') : '') + (src.importing ? translate('uiImporting') : '') })}
      aria-pressed={selected}
      onPointerDown={move.onPointerDown}
      onClick={move.onClick}
      onDoubleClick={lockClip(editor, id)}
      onContextMenu={onMenu}>
      <PreviewStrip media={src} width={width} inS={cs.inS} outS={cs.outS} />
      <span className="clip-label" style={inset && { paddingLeft: 12 + inset.head * pps, paddingRight: 12 + inset.tail * pps }}>
        <span>
          {cs.linked && <Link size={11} stroke="#D8DED9" strokeWidth={2.4} style={{ flex: 'none' }} />}
          <span className="name">{src.name}</span>
        </span>
        <span className="mono">{src.importing ? translate('importing') : translate('s', { value1: formatNumber(dur, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}</span>
      </span>
      <FadeRamps clip={cs} width={width} height={VIDEO_CLIP_H} />
    </button>
  );
}

function TextClipView({ editor, pps, snapping, clip: cs, onMenu }: ClipProps<TextClip>) {
  useT();
  const move = useClipMove(editor, cs, 'text', snapping);
  return (
    <button className="text-clip" style={{ left: cs.start * pps + 1, width: cs.duration * pps - 3 }}
      aria-label={translate('textOverlaySeconds', { value1: cs.content, value2: formatNumber(cs.duration, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}
      aria-pressed={isPicked(editor, cs.id)}
      onPointerDown={move.onPointerDown}
      onClick={move.onClick}
      onDoubleClick={lockClip(editor, cs.id)}
      onContextMenu={onMenu}>
      <span className="text-clip-name"><TextT size={12} strokeWidth={2.2} /><span>{cs.content}</span></span>
      <span className="mono">{translate('s3', { value1: formatNumber(cs.duration, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}</span>
    </button>
  );
}

interface TrimProps {
  editor: Editor;
  pps: number;
  snapping: boolean;
  /** Reports the time a dragged edge snapped to, or null when it is not snapped. */
  onGuide: (time: number | null) => void;
}

/** Edges a trimmed clip can snap to: every other clip, minus its linked partners that trim with it. */
function trimTargets(project: Project, clip: Clip) {
  const skip = new Set([clip.id]);
  if (isLinked(clip)) for (const p of partnersOf(project, clip)) skip.add(p.id);
  return edgeTargets(project, skip);
}

/**
 * Trim and fade handles for the selected clip on a track. They sit in their own layer above every clip and
 * transition chip, so where clips touch or overlap the active clip's handles win.
 */
function TrimHandles({ editor, clips, pps, snapping, onGuide }: TrimProps & { clips: Clip[] }) {
  useT();
  const { project, ui, trimEdge, updateVideoClip, updateAudioClip } = editor;
  const startDrag = useDrag();
  const sel = ui.sel;
  const cs = sel && sel.kind !== 'trans' ? clips.find((c) => c.id === sel.id) : undefined;
  if (!cs) return null;
  const left = cs.start * pps + 1;
  const right = left + clipDuration(cs) * pps - 3;

  // Moves the edge to the pointer's time; media clips stop at the ends of their source.
  const edgeDown = (which: 'in' | 'out') => (e: PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    const t0 = which === 'in' ? cs.start : clipEnd(cs);
    const targets = trimTargets(project, cs);
    startDrag(e, (dx) => {
      const snap = snapping ? snapEdge(t0 + dx / pps, targets, pps) : null;
      const time = snap ?? Math.round((t0 + dx / pps) * 100) / 100;
      trimEdge(cs.id, which, time);
      // Only show the guide when the edge really lands there, not when a limit holds it back.
      const trimmed = findClip(trimClipEdge(project, cs.id, which, time), cs.id)!.clip;
      onGuide(snap !== null && Math.abs((which === 'in' ? trimmed.start : clipEnd(trimmed)) - snap) < 1e-6 ? snap : null);
    }, () => onGuide(null));
  };

  return (
    <>
      <span className="clip-edge in" style={{ left }} title={translate('dragToTrimTheStart')} onPointerDown={edgeDown('in')}><span /></span>
      <span className="clip-edge out" style={{ left: right - 8 }} title={translate('dragToTrimTheEnd')} onPointerDown={edgeDown('out')}><span /></span>
      {sel?.kind === 'clip' && (
        <div className="fade-layer" style={{ left, width: right - left, height: VIDEO_CLIP_H }}>
          <FadeHandles clip={cs as VideoClip} width={right - left} height={VIDEO_CLIP_H} update={(patch) => updateVideoClip(cs.id, patch)} />
        </div>
      )}
      {sel?.kind === 'audio' && (
        <div className="fade-layer" style={{ left, width: right - left, height: AUDIO_CLIP_H }}>
          <FadeHandles clip={cs as AudioClip} width={right - left} height={AUDIO_CLIP_H} update={(patch) => updateAudioClip(cs.id, patch)} />
        </div>
      )}
    </>
  );
}

/** A chip on every boundary between adjacent clips; a full-height band where they overlap. */
function Transitions({ editor, clips, pps, dropTarget }: { editor: Editor; clips: VideoClip[]; pps: number; dropTarget: string | null }) {
  useT();
  const { ui, layout, select } = editor;
  return (
    <>
      {[...clips].sort((a, b) => a.start - b.start).map((c, i, sorted) => {
        const next = sorted[i + 1];
        if (!next) return null;
        const overlapStart = next.start;
        const overlapEnd = Math.min(clipEnd(c), clipEnd(next));
        const overlap = overlapEnd - overlapStart;
        if (overlap < -1e-6) return null;
        const tt = c.transitionOut ?? DEFAULT_TRANSITION;
        const w = overlap > 0 ? overlap * pps - 2 : 26;
        return (
          <button key={c.id} className={overlap > 0 ? 'overlap-band' + (dropTarget === c.id ? ' drop-target' : '') : 'trans-chip'}
            style={{ left: overlap > 0 ? overlapStart * pps + 1 : overlapStart * pps - w / 2, width: w }}
            aria-label={translate('transitionBetweenAnd', { value1: TRANSITION_NAMES[tt.type], value2: layout.clips[c.id].name, value3: layout.clips[next.id].name })}
            title={overlap > 0 ? translate('sOverlapDropATransitionHere', { value1: formatNumber(overlap, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }) : translate('overlapClipsToAddATransition')}
            aria-pressed={ui.sel?.kind === 'trans' && ui.sel.id === c.id}
            onClick={() => select({ kind: 'trans', id: c.id })}>
            {(overlap <= 0 || w >= 22) && (
              <span className="trans-icon">
                {tt.type === 'crossfade' && <Crossfade size={14} />}
                {tt.type === 'fade' && <FadeBlack size={14} />}
                {tt.type === 'cut' && <CutLine size={14} />}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

const f1 = (x: number) => formatNumber(x, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function AudioClipView({ editor, pps, snapping, clip: cs, inset, onMenu }: ClipProps<AudioClip>) {
  useT();
  const { project, select, togglePick, updateAudioClip: updateClip } = editor;
  const startDrag = useDrag();
  const move = useClipMove(editor, cs, 'audio', snapping);
  const id = cs.id;
  const src = project.media[cs.mediaId] ?? MISSING_MEDIA;
  const span = clipDuration(cs) || 1;
  const width = clipDuration(cs) * pps - 3;
  const H = AUDIO_CLIP_H;
  const picked = isPicked(editor, id);
  const partner = partnerSelected(editor, cs, 'clip');

  const preview = useMediaPreview(src);
  const bars = [];
  for (let k = 0, n = Math.max(0, Math.floor((width - 24) / 4)); k < n; k++) {
    const n = Math.max(1, Math.floor((width - 24) / 4));
    const time = cs.inS + k / n * span;
    const v = preview?.peaks[Math.min(preview.peaks.length - 1, Math.floor(time / src.duration * preview.peaks.length))] ?? 0;
    bars.push(cs.muted ? 2 : Math.max(2, Math.min(40, Math.round((4 + v * 34) * Math.min(2, dbToGain(cs.gainDb))))));
  }

  // Gain line: the clip's height is a fader from −∞ to +12 dB, the line sits at the level and follows the pointer.
  const volY = Math.round(H * (1 - dbToFader(cs.gainDb)));
  const level = translate('db2', { value1: fmtDb(cs.gainDb) });
  const volDown = (e: PointerEvent<HTMLButtonElement>) => {
    // The gain line spans the clip, so Ctrl-clicks on it pick the clip too.
    if (additive(e)) { e.preventDefault(); togglePick({ kind: 'audio', id }); return; }
    select({ kind: 'audio', id });
    const pos0 = dbToFader(cs.gainDb);
    startDrag(e, (_dx, dy) => updateClip(id, { gainDb: faderToDb(pos0 - dy / H) }));
  };
  const volKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 6 : 1;
    const d = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0;
    if (!d) return;
    e.preventDefault();
    updateClip(id, { gainDb: Math.round(Math.max(GAIN_MIN_DB, Math.min(GAIN_MAX_DB, cs.gainDb + d)) * 10) / 10 });
  };

  return (
    <div className={'audio-clip' + (picked ? ' selected' : partner ? ' partner' : '') + (cs.linked ? '' : ' unlinked') + (src.importing ? ' importing' : '')}
      style={{ left: cs.start * pps + 1, width }}>
      <button className="audio-wave"
        aria-label={translate('audioVolume', { value1: src.name, value2: level, value3: cs.muted ? translate('uiMuted') : '', value4: (cs.linked ? '' : translate('uiUnlinked')) + (src.importing ? translate('uiImporting') : '') })}
        aria-pressed={picked}
        onPointerDown={move.onPointerDown}
        onClick={move.onClick}
        onDoubleClick={lockClip(editor, id)}
        onContextMenu={onMenu}>
        {bars.map((h, i) => (
          <span key={i} style={{ height: h, background: cs.muted ? 'rgba(241,244,240,0.22)' : 'rgba(198,240,191,0.7)' }} />
        ))}
      </button>
      <button className={'vol-line' + (cs.muted ? ' muted' : '')} style={{ top: volY - 6 }}
        aria-label={translate('volumeDragUpOrDownToAdjust', { value1: level })} title={translate('volumeDragToAdjust', { value1: level })}
        onPointerDown={volDown} onKeyDown={volKey} />
      {/* Drawn apart from the line's hit area so the clip's rounded corners can clip it at −∞ and +12 dB. */}
      <div className="vol-clip" aria-hidden="true">
        <span className="vol-headroom" style={{ height: volY }} />
        <FadeRamps clip={cs} width={width} height={H} />
        <span className="vol-mark" style={{ top: Math.max(0, Math.min(H - 2, volY - 1)) }} />
      </div>
      <span className="audio-badge" style={inset && { right: 8 + inset.tail * pps }}>
        {cs.muted && <Mute size={11} stroke='var(--warn)' strokeWidth={2.4} />}
        {level}
      </span>
    </div>
  );
}

/**
 * Where a clip's fade ramps sit in a box the clip's size. Ramps are quadratic curves; the control point slides
 * along the diagonal with the curve amount.
 */
function fadeGeometry(clip: MediaClip, width: number, H: number) {
  const pxs = width / (clipDuration(clip) || 1);
  const fiW = Math.max(0, Math.min(width / 2, clip.fadeIn * pxs));
  const foW = Math.max(0, Math.min(width / 2, clip.fadeOut * pxs));
  const ci = { cx: fiW / 2 - clip.curveIn * fiW / 2, cy: H / 2 - clip.curveIn * H / 2 };
  const co = { cx: foW / 2 + clip.curveOut * foW / 2, cy: H / 2 - clip.curveOut * H / 2 };
  return {
    fiW, foW, ci, co,
    ciM: { x: 0.5 * ci.cx + 0.25 * fiW, y: H / 4 + 0.5 * ci.cy },
    coM: { x: 0.5 * co.cx + 0.25 * foW, y: 0.5 * co.cy + H / 4 },
  };
}

/** The darkened fade-in and fade-out ramps drawn over a clip. */
function FadeRamps({ clip, width, height: H }: { clip: MediaClip; width: number; height: number }) {
  useT();
  const { fiW, foW, ci, co } = fadeGeometry(clip, width, H);
  return (
    <>
      <svg width={f1(fiW)} height={H} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} aria-hidden="true">
        <path d={`M0,0 L${f1(fiW)},0 Q${f1(ci.cx)},${f1(ci.cy)} 0,${H} Z`} fill="rgba(12,14,13,0.62)" />
        <path d={`M0,${H} Q${f1(ci.cx)},${f1(ci.cy)} ${f1(fiW)},0`} fill='none' stroke="var(--accent)" strokeWidth={1.5} />
      </svg>
      <svg width={f1(foW)} height={H} style={{ position: 'absolute', right: 0, top: 0, pointerEvents: 'none' }} aria-hidden="true">
        <path d={`M0,0 Q${f1(co.cx)},${f1(co.cy)} ${f1(foW)},${H} L${f1(foW)},0 Z`} fill="rgba(12,14,13,0.62)" />
        <path d={`M0,0 Q${f1(co.cx)},${f1(co.cy)} ${f1(foW)},${H}`} fill='none' stroke="var(--accent)" strokeWidth={1.5} />
      </svg>
    </>
  );
}

/** Corner handles that set a clip's fade lengths, and round handles that shape each ramp. Placed in a box the clip's size. */
function FadeHandles({ clip: cs, width, height: H, update }: { clip: MediaClip; width: number; height: number; update: (patch: Partial<Fades>) => void }) {
  useT();
  const startDrag = useDrag();
  const span = clipDuration(cs) || 1;
  const half = (cs.outS - cs.inS) / 2;
  const { fiW, foW, ciM, coM } = fadeGeometry(cs, width, H);

  const fadeDown = (which: 'fadeIn' | 'fadeOut', sign: 1 | -1) => (e: PointerEvent<HTMLButtonElement>) => {
    const pps = e.currentTarget.parentElement!.getBoundingClientRect().width / span;
    const v0 = cs[which];
    startDrag(e, (dx) => {
      const v = v0 + sign * dx / pps;
      update({ [which]: Math.round(Math.max(0, Math.min(half, v)) * 10) / 10 });
    });
  };
  const curveDown = (which: 'curveIn' | 'curveOut') => (e: PointerEvent<HTMLButtonElement>) => {
    const ppy = e.currentTarget.parentElement!.getBoundingClientRect().height / 2;
    const v0 = cs[which];
    startDrag(e, (_dx, dy) => {
      const c = Math.max(-1, Math.min(1, v0 - dy / ppy));
      update({ [which]: Math.round(c * 20) / 20 });
    });
  };

  return (
    <>
      {fiW >= 14 && (
        <button className="curve-handle" style={{ left: ciM.x - 9, top: ciM.y - 9 }}
          aria-label={translate('fadeInCurveDragUpOrDownToAdjust', { value1: curveName(cs.curveIn) })}
          title={translate('dragUpOrDownToShapeTheFadeIn')} onPointerDown={curveDown('curveIn')}>
          <span />
        </button>
      )}
      {foW >= 14 && (
        <button className="curve-handle" style={{ left: width - foW + coM.x - 9, top: coM.y - 9 }}
          aria-label={translate('fadeOutCurveDragUpOrDownToAdjust', { value1: curveName(cs.curveOut) })}
          title={translate('dragUpOrDownToShapeTheFadeOut')} onPointerDown={curveDown('curveOut')}>
          <span />
        </button>
      )}
      <button className={`fade-handle in${cs.fadeIn ? '' : ' flush'}`} style={{ left: fiW - 10 }}
        aria-label={translate('fadeInSecondsDragToAdjust', { value1: formatNumber(cs.fadeIn, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })} title={translate('dragToSetTheFadeIn')}
        onPointerDown={fadeDown('fadeIn', 1)}>
        <span />
      </button>
      <button className={`fade-handle out${cs.fadeOut ? '' : ' flush'}`} style={{ right: foW - 10 }}
        aria-label={translate('fadeOutSecondsDragToAdjust', { value1: formatNumber(cs.fadeOut, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })} title={translate('dragToSetTheFadeOut')}
        onPointerDown={fadeDown('fadeOut', -1)}>
        <span />
      </button>
    </>
  );
}

/** Track header menu. Deleting a track that holds anything asks first, through `onConfirm`. */
function TrackMenu({ editor, id, left, top, onClose, onConfirm }: {
  editor: Editor; id: string; left: number; top: number; onClose: () => void; onConfirm: (id: string) => void;
}) {
  useT();
  const { project, removeTrack } = editor;
  const track = project.tracks.find((t) => t.id === id);
  if (!track) return null;
  const removable = canRemoveTrack(project, id);
  const empty = track.clips.length === 0;
  const remove = (e: MouseEvent) => {
    e.stopPropagation();
    onClose();
    if (empty) removeTrack(id); else onConfirm(id);
  };
  return (
    <div role="menu" aria-label={translate('track2', { value1: track.name })} className="menu" style={{ left, top }} onClick={(e) => e.stopPropagation()}>
      <span className="menu-label">{translate('track5', { value1: track.name })}</span>
      <button role="menuitem" className="ib danger" disabled={!removable} onClick={remove}>
        <Trash size={14} /><span>{translate('deleteTrack')}</span>
      </button>
      {!removable && <span className="menu-label menu-note">{translate('theTimelineKeepsAtLeastOneTrack', { value1: translate(track.kind === 'text' ? 'textKind' : track.kind === 'audio' ? 'audioKind' : 'videoKind') })}</span>}
    </div>
  );
}

function DeleteTrackDialog({ editor, id, onClose }: { editor: Editor; id: string; onClose: () => void }) {
  useT();
  const { project, removeTrack } = editor;
  const track = project.tracks.find((t) => t.id === id);
  if (!track) return null;
  const own = track.clips.length;
  const clipCount = (p: Project) => p.tracks.reduce((n, t) => n + t.clips.length, 0);
  // Linked partners on other tracks go too.
  const linked = clipCount(project) - clipCount(removeTrackModel(project, id)) - own;
  const subtitle = translate(track.kind === 'text' ? 'removeTextClips' : 'removeClips', { count: own })
    + (linked ? translate('linkedClips', { count: linked }) : '.');
  return (
    <Dialog id="del-track-title" title={translate('delete2', { value1: track.name })} subtitle={subtitle} warn width={440} onClose={onClose}>
      <div className="dialog-body">
        <div className="dialog-actions">
          <button className="gb" onClick={onClose}>{translate('cancel')}</button>
          <button className="primary danger" autoFocus onClick={() => { removeTrack(id); onClose(); }}>{translate('deleteTrack')}</button>
        </div>
      </div>
    </Dialog>
  );
}

function ClipMenu({ editor }: { editor: Editor }) {
  useT();
  const { project, ui, updateVideoClip, updateAudioClip, linkClips, closeMenu, deleteSelection } = editor;
  const m = ui.menu!;
  const found = findClip(project, m.id);
  if (!found) return null;
  const cs = found.clip;
  const audio = audioFor(project, m.id);
  const label = ui.picked.length > 1 ? translate('clipsSelected', { value1: ui.picked.length })
    : isMediaClip(cs) ? `${m.kind === 'audio' ? translate('audio2') : translate('video2')} · ${(project.media[cs.mediaId] ?? MISSING_MEDIA).name}`
    : translate('text2', { value1: cs.content });
  // Linking needs exactly one video and one audio clip selected; unlinking works from either side of a linked pair.
  const pair = pickedPair(project, ui.picked);
  const pairLinked = !!pair && pair.video.linked && pair.video.linkId !== null && pair.video.linkId === pair.audio.linkId;
  const unlinkId = pair ? (pairLinked ? pair.video.id : null)
    : ui.picked.length === 1 && isLinked(cs) && partnersOf(project, cs).length > 0 ? cs.id : null;
  const updateClip = findClip(project, unlinkId)?.track.kind === 'audio' ? updateAudioClip : updateVideoClip;
  // The selected clips the playhead crosses.
  const splittable = ui.picked.map((x) => findClip(project, x.id)?.clip)
    .filter((c) => !!c && ui.playhead - c.start >= MIN_SPLIT_PIECE && clipEnd(c) - ui.playhead >= MIN_SPLIT_PIECE).map((c) => c!.id);
  const act = (fn?: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn?.(); closeMenu(); };

  return (
    <div role="menu" aria-label={label} className="menu" style={{ left: m.left, top: m.top }} onClick={(e) => e.stopPropagation()}>
      <span className="menu-label">{label}</span>
      <button role="menuitem" className="ib" disabled={!splittable.length} onClick={act(() => splittable.forEach((id) => editor.splitClip(id, ui.playhead)))}>
        <Scissors size={14} stroke="#C8CEC9" /><span>{translate('splitAtPlayhead')}</span>
      </button>
      <button role="menuitem" className="ib" onClick={act(() => ui.picked.forEach((x) => editor.duplicateClip(x.id)))}>
        <Duplicate size={14} stroke="#C8CEC9" /><span>{translate('duplicate')}</span><span className="kbd">{"Ctrl D"}</span>
      </button>
      <div className="menu-sep" />
      {unlinkId ? (
        <button role="menuitem" className="ib" onClick={act(() => updateClip(unlinkId, { linked: false }))}>
          <Unlink size={14} stroke='var(--warn)' /><span>{translate('unlinkAudioAndVideo')}</span><span className="kbd">{"Ctrl L"}</span>
        </button>
      ) : pair && (
        <button role="menuitem" className="ib" onClick={act(() => linkClips(pair.video.id, pair.audio.id))}>
          <Link size={14} stroke="var(--accent)" /><span>{translate('linkAudioAndVideo')}</span><span className="kbd">{"Ctrl L"}</span>
        </button>
      )}
      {audio && (
        <button role="menuitem" className="ib" onClick={act(() => updateAudioClip(audio.id, { muted: !audio.muted }))}>
          <Mute size={14} stroke="#C8CEC9" /><span>{audio.muted ? translate('unmuteAudio') : translate('muteAudio')}</span><span className="kbd">{"M"}</span>
        </button>
      )}
      <div className="menu-sep" />
      <button role="menuitem" className="ib danger" onClick={act(deleteSelection)}>
        <Trash size={14} /><span>{'Delete'}</span><span className="kbd">{"Del"}</span>
      </button>
    </div>
  );
}
