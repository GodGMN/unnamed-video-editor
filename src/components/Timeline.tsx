import { PreviewStrip, useMediaPreview } from '../media/PreviewStrip';
import type { DragEvent, KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_TRANSITION, MISSING_MEDIA, PPS, TRANSITION_NAMES, audioFor, curveName, findClip, partnersOf, pickedPair, clipDuration, clipEnd, snapClipStart } from '../editor/model';
import type { AudioClip, ClipSelection, Project, TextItem, TransitionType, Tool, Track, VideoClip } from '../editor/model';
import type { Editor } from '../editor/useProject';
import { useDrag } from '../editor/useProject';
import { CutLine, Crossfade, Cursor, Duplicate, Eye, FadeBlack, Link, Magnet, Mute, Plus, Scissors, TextT, Trash, Unlink, Volume } from './icons';

const TEXT_TRACK_H = 44;
const VIDEO_TRACK_H = 56;
const AUDIO_TRACK_H = 64;
const AUDIO_CLIP_H = 52;

const TOOLS: { k: Tool; label: string; key: string; icon: ReactNode }[] = [
  { k: 'select', label: 'Select', key: 'V', icon: <Cursor size={14} /> },
  { k: 'split', label: 'Split', key: 'S', icon: <Scissors size={14} /> },
  { k: 'text', label: 'Text', key: 'T', icon: <TextT size={14} /> },
];

const TRACK_H = { text: TEXT_TRACK_H, video: VIDEO_TRACK_H, audio: AUDIO_TRACK_H };

const isOff = (t: Track) => (t.kind === 'audio' ? t.muted : t.hidden);

interface Overlap { from: VideoClip | AudioClip; to: VideoClip | AudioClip; start: number; end: number }

/** Overlapping regions between neighbouring clips of one track, in start order. */
function overlapsOf<C extends VideoClip | AudioClip>(clips: C[]): Overlap[] {
  const sorted = [...clips].sort((a, b) => a.start - b.start);
  const out: Overlap[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const end = Math.min(clipEnd(sorted[i]), clipEnd(sorted[i + 1]));
    if (end - sorted[i + 1].start > 1e-6) out.push({ from: sorted[i], to: sorted[i + 1], start: sorted[i + 1].start, end });
  }
  return out;
}

/** Seconds of each clip covered by a neighbour at its head and at its tail. */
function overlapInsets(clips: (VideoClip | AudioClip)[]) {
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

/**
 * The video clip whose outgoing transition a drop at `time` on `track` sets, or null. Audio overlaps
 * stand in for their linked video clips' overlap; `slop` widens narrow overlaps so they're easy to hit.
 */
function transitionTargetAt(project: Project, track: Track, time: number, slop: number): string | null {
  if (track.kind === 'text') return null;
  const hit = overlapsOf<VideoClip | AudioClip>(track.clips).find((o) => time >= o.start - slop && time <= o.end + slop);
  if (!hit) return null;
  if (track.kind === 'video') return hit.from.id;
  const video = partnersOf(project, hit.from).map((c) => findClip(project, c.id)!).find((f) => f.track.kind === 'video');
  return video && overlapsOf<VideoClip | AudioClip>(video.track.clips).some((o) => o.from.id === video.clip.id) ? video.clip.id : null;
}

export function Timeline({ editor }: { editor: Editor }) {
  const { project, ui, layout, select, setTool, setPlayhead, clearFocus, toggleTrack, openMenu, closeMenu } = editor;
  const focus = ui.focusClip ? layout.clips[ui.focusClip] : undefined;
  const focused = !!focus;
  const rootRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(PPS);
  const scaleRef = useRef(PPS);
  const pendingScroll = useRef<number | null>(null);
  const [viewW, setViewW] = useState(0);

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

  const startDrag = useDrag();
  const [snapping, setSnapping] = useState(true);
  // The video clip whose transition a dragged transition would replace, for drop highlighting.
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  useEffect(() => {
    const clear = () => setDropTarget(null);
    window.addEventListener('dragend', clear);
    return () => window.removeEventListener('dragend', clear);
  }, []);
  // Ticks run past the content and on to the right edge of the viewport when zoomed out.
  const lastTick = Math.max(Math.ceil(layout.end) + 2, Math.ceil(viewW / pps));
  const tlWidth = (Math.ceil(layout.end) + 2) * pps + 20;

  const onContextMenu = (kind: 'clip' | 'audio', id: string) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const root = rootRef.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    const left = Math.max(8, Math.min(e.clientX - r.left + 4, root.offsetWidth - 244));
    const top = Math.max(8, Math.min(e.clientY - r.top + 4, root.offsetHeight - 290));
    openMenu({ kind, id, left, top });
  };

  // Press anywhere on the ruler to jump the playhead there, then drag to scrub. While a clip
  // is focused the playhead stays inside it; double-click the ruler to release it.
  const onRulerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const left = e.currentTarget.getBoundingClientRect().left;
    const seek = (clientX: number) => setPlayhead((clientX - left) / pps);
    const x0 = e.clientX;
    seek(x0);
    startDrag(e, (dx) => seek(x0 + dx));
  };

  // Media drops place a clip; transition drops land anywhere over an overlap, including its trim handles.
  const transitionTarget = (e: DragEvent<HTMLDivElement>, t: Track) =>
    transitionTargetAt(project, t, (e.clientX - e.currentTarget.getBoundingClientRect().left) / pps, 6 / pps);
  const onTrackDragOver = (e: DragEvent<HTMLDivElement>, t: Track) => {
    if (isTransitionDrag(e)) {
      const target = transitionTarget(e, t);
      setDropTarget(target);
      if (target) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
    } else if (t.kind !== 'text' && e.dataTransfer.types.includes('application/x-editor-media')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
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
    const id = e.dataTransfer.getData('application/x-editor-media');
    if (id) editor.placeMedia(id, t.id, (e.clientX - e.currentTarget.getBoundingClientRect().left) / pps);
  };

  const onTextDown = (item: TextItem) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || ui.tool !== 'select') return;
    select({ kind: 'text', id: item.id });
    const targets = [0];
    for (const track of project.tracks) {
      if (track.kind === 'text') {
        for (const other of track.items) if (other.id !== item.id) targets.push(other.start, other.start + other.duration);
      } else for (const clip of track.clips) targets.push(clip.start, clipEnd(clip));
    }
    let dragging = false;
    startDrag(e, dx => {
      if (!dragging && Math.abs(dx) < 3) return;
      dragging = true;
      const start = Math.max(0, item.start + dx / pps);
      editor.updateText(item.id, { start: snapping ? snapClipStart(start, item.duration, targets, pps) : start });
    });
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
    <section ref={rootRef} className="panel timeline" onClick={closeMenu}>
      <div className="tl-tools">
        <div className="toolbar" role="toolbar" aria-label="Timeline tools">
          {TOOLS.map((o) => (
            <button key={o.k} aria-pressed={ui.tool === o.k} title={`${o.label} · ${o.key}`} onClick={() => setTool(o.k)}>
              {o.icon}
              {o.label}<span className="kbd">{o.key}</span>
            </button>
          ))}
          <span className="tool-separator" role="separator" aria-orientation="vertical" />
          <button aria-label="Snap clips" aria-pressed={snapping} title="Snap clips" onClick={() => setSnapping(v => !v)}><Magnet size={16} /></button>
        </div>
        <span className="hint">{focused ? 'Playhead locked to the selected clip · Double-click the time bar to release' : 'Drag a transition onto an overlap'}</span>
        <div className="spacer" />
        <button className="ib outlined chip"><Plus size={12} strokeWidth={2.4} />Video track</button>
        <button className="ib outlined chip"><Plus size={12} strokeWidth={2.4} />Audio track</button>
        <button className="ib outlined chip">Fit</button>
      </div>

      <div className="tl-body">
        <div className="track-heads">
          <div style={{ height: 28, borderBottom: '1px solid var(--line)' }} />
          {project.tracks.map((t) => {
            const off = isOff(t);
            return (
              <div key={t.id} className="track-head" style={{ height: TRACK_H[t.kind] }}>
                <span className="track-head-label"><span>{t.name}</span><span>{t.label}</span></span>
                {t.kind !== 'text' && (
                  <button className="ib" style={{ width: 28, height: 28, color: off ? 'var(--warn)' : 'var(--text-muted)' }}
                    aria-label={`${t.kind === 'audio' ? (off ? 'Unmute' : 'Mute') : (off ? 'Show' : 'Hide')} track ${t.name}`}
                    aria-pressed={off} onClick={() => toggleTrack(t.id)}>
                    {t.kind === 'video' ? <Eye size={14} /> : <Volume size={14} />}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div ref={scrollRef} className="tl-scroll">
          <div style={{ position: 'relative', width: tlWidth, minWidth: '100%' }}>
            <div className="ruler" onPointerDown={onRulerDown} onDoubleClick={clearFocus}
              title={focused ? 'Double-click to release the selected clip' : undefined}>
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
              <div key={t.id} className="track" onDragOver={(e) => onTrackDragOver(e, t)} onDrop={(e) => onTrackDrop(e, t)}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null); }}
                data-track-id={t.id} style={{ height: TRACK_H[t.kind], opacity: t.kind !== 'text' && isOff(t) ? 0.35 : 1 }}>
                {t.kind === 'text' && t.items.map((x) => (
                  <button key={x.id} className="text-clip" style={{ left: x.start * pps + 1, width: x.duration * pps - 2 }}
                    aria-label={`Text overlay: ${x.content}`}
                    aria-pressed={ui.sel?.kind === 'text' && ui.sel.id === x.id}
                    onPointerDown={onTextDown(x)}
                    onClick={() => select({ kind: 'text', id: x.id })}>
                    <TextT size={12} strokeWidth={2.2} />
                    <span>{x.content}</span>
                  </button>
                ))}
                {t.kind === 'video' && (
                  <>
                    {t.clips.map((c) => <VideoClipView key={c.id} editor={editor} pps={pps} snapping={snapping} clip={c} inset={insets!.get(c.id)} onMenu={onContextMenu('clip', c.id)} />)}
                    <Transitions pps={pps} editor={editor} clips={t.clips} dropTarget={dropTarget} />
                    <TrimHandles pps={pps} editor={editor} clips={t.clips} />
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
                  </>
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
          </div>
        </div>
      </div>

      {ui.menu && <ClipMenu editor={editor} />}
    </section>
  );
}

/** Ctrl (or Cmd) adds a clip to the selection instead of replacing it. */
const additive = (e: { ctrlKey: boolean; metaKey: boolean }) => e.ctrlKey || e.metaKey;

/** Click handler for a clip: plain clicks select it alone, Ctrl-clicks toggle it in the selection. */
const clickClip = (editor: Editor, clip: ClipSelection) => (e: MouseEvent) =>
  additive(e) ? editor.togglePick(clip) : editor.select(clip);

const isPicked = ({ ui }: Editor, id: string) => ui.picked.some((x) => x.id === id);

function useClipMove(editor: Editor, clip: VideoClip | AudioClip, snapping: boolean) {
  const startDrag = useDrag();
  return (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || editor.ui.tool !== 'select' || additive(e)) return;
    const snapshot = editor.project;
    const moving = new Set([clip.id, ...(clip.linked ? partnersOf(snapshot, clip).map(c => c.id) : [])]);
    const targets = [0];
    for (const track of snapshot.tracks) {
      if (track.kind === 'text') {
        for (const item of track.items) targets.push(item.start, item.start + item.duration);
      } else for (const c of track.clips) if (!moving.has(c.id)) targets.push(c.start, clipEnd(c));
    }
    const element = e.currentTarget;
    const pps = ((element.closest('.audio-clip') ?? element).getBoundingClientRect().width + 3) / clipDuration(clip);
    editor.select({ kind: findClip(snapshot, clip.id)!.track.kind === 'video' ? 'clip' : 'audio', id: clip.id });
    let dragging = false;
    startDrag(e, dx => {
      if (!dragging && Math.abs(dx) < 3) return;
      dragging = true;
      const start = Math.max(0, clip.start + dx / pps);
      editor.moveClip(snapshot, clip.id, snapping ? snapClipStart(start, clipDuration(clip), targets, pps) : start);
    });
  };
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
function partnerSelected({ project, ui }: Editor, clip: VideoClip | AudioClip, kind: 'clip' | 'audio') {
  const sel = ui.sel;
  return !!sel && sel.kind === kind && clip.linked && clip.linkId !== null && findClip(project, sel.id)?.clip.linkId === clip.linkId;
}

function VideoClipView({ editor, pps, snapping, clip: cs, inset, onMenu }: ClipProps<VideoClip>) {
  const { project, ui } = editor;
  const dragClip = useClipMove(editor, cs, snapping);
  const id = cs.id;
  const src = project.media[cs.mediaId] ?? MISSING_MEDIA;
  const width = clipDuration(cs) * pps - 3;
  const dur = cs.outS - cs.inS;
  const selected = isPicked(editor, id);
  const partner = partnerSelected(editor, cs, 'audio');

  return (
    <button className={'clip' + (partner ? ' partner' : '')}
      style={{ left: cs.start * pps + 1, width, background: src.tone, cursor: ui.tool === 'split' ? 'crosshair' : 'pointer' }}
      aria-label={`Video: ${src.name}, ${dur.toFixed(1)} seconds${cs.linked ? ', linked to audio' : ''}`}
      aria-pressed={selected}
      onPointerDown={dragClip}
      onClick={clickClip(editor, { kind: 'clip', id })}
      onContextMenu={onMenu}>
      <PreviewStrip media={src} width={width} inS={cs.inS} outS={cs.outS} />
      <span className="clip-label" style={inset && { paddingLeft: 12 + inset.head * pps, paddingRight: 12 + inset.tail * pps }}>
        <span>
          {cs.linked && <Link size={11} stroke="#D8DED9" strokeWidth={2.4} style={{ flex: 'none' }} />}
          <span className="name">{src.name}</span>
        </span>
        <span className="mono">{dur.toFixed(1)}s</span>
      </span>
    </button>
  );
}

/**
 * Trim handles for the selected clip on a track. They sit in their own layer above every clip and
 * transition chip, so where clips touch or overlap the active clip's handles win.
 */
function TrimHandles({ editor, clips, pps }: { editor: Editor; clips: VideoClip[]; pps: number }) {
  const { project, ui, trimClip } = editor;
  const startDrag = useDrag();
  const cs = ui.sel?.kind === 'clip' ? clips.find((c) => c.id === ui.sel!.id) : undefined;
  if (!cs) return null;
  const src = project.media[cs.mediaId] ?? MISSING_MEDIA;
  const left = cs.start * pps + 1;
  const right = left + clipDuration(cs) * pps - 3;

  // Trims the clip's source in/out points, clamped to the media like the trim scrubber.
  const edgeDown = (which: 'in' | 'out') => (e: PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    const { id, inS, outS } = cs;
    const minDuration = Math.min(0.5, src.duration);
    const round = (x: number) => Math.round(x * 100) / 100;
    startDrag(e, (dx) => {
      if (which === 'in') trimClip(id, { inS: round(Math.max(0, Math.min(outS - minDuration, inS + dx / pps))) });
      else trimClip(id, { outS: round(Math.min(src.duration, Math.max(inS + minDuration, outS + dx / pps))) });
    });
  };

  return (
    <>
      <span className="clip-edge in" style={{ left }} title="Drag to trim the start" onPointerDown={edgeDown('in')}><span /></span>
      <span className="clip-edge out" style={{ left: right - 8 }} title="Drag to trim the end" onPointerDown={edgeDown('out')}><span /></span>
    </>
  );
}

/** A chip on every boundary between adjacent clips; a full-height band where they overlap. */
function Transitions({ editor, clips, pps, dropTarget }: { editor: Editor; clips: VideoClip[]; pps: number; dropTarget: string | null }) {
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
            aria-label={`${TRANSITION_NAMES[tt.type]} transition between ${layout.clips[c.id].name} and ${layout.clips[next.id].name}`}
            title={overlap > 0 ? `${overlap.toFixed(2)}s overlap · drop a transition here` : 'Overlap clips to add a transition'}
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

const f1 = (x: number) => x.toFixed(1);

function AudioClipView({ editor, pps, snapping, clip: cs, inset, onMenu }: ClipProps<AudioClip>) {
  const { project, ui, select, togglePick, updateAudioClip: updateClip } = editor;
  const startDrag = useDrag();
  const dragClip = useClipMove(editor, cs, snapping);
  const id = cs.id;
  const src = project.media[cs.mediaId] ?? MISSING_MEDIA;
  const span = clipDuration(cs) || 1;
  const width = clipDuration(cs) * pps - 3;
  const pxs = width / span;
  const picked = isPicked(editor, id);
  // Fade and curve handles only show on the primary selection.
  const selected = ui.sel?.kind === 'audio' && ui.sel.id === id;
  const partner = partnerSelected(editor, cs, 'clip');
  const half = (cs.outS - cs.inS) / 2;

  const preview = useMediaPreview(src.id);
  const bars = [];
  for (let k = 0, n = Math.max(0, Math.floor((width - 24) / 4)); k < n; k++) {
    const n = Math.max(1, Math.floor((width - 24) / 4));
    const time = cs.inS + k / n * span;
    const v = preview?.peaks[Math.min(preview.peaks.length - 1, Math.floor(time / src.duration * preview.peaks.length))] ?? 0;
    bars.push(cs.muted ? 2 : Math.max(2, Math.min(40, Math.round((4 + v * 34) * Math.min(2, cs.vol / 100)))));
  }

  // Fade ramps are quadratic curves; the control point slides along the diagonal with the curve amount.
  const H = AUDIO_CLIP_H;
  const fiW = Math.max(0, Math.min(width / 2, cs.fadeIn * pxs));
  const foW = Math.max(0, Math.min(width / 2, cs.fadeOut * pxs));
  const ci = { cx: fiW / 2 - cs.curveIn * fiW / 2, cy: H / 2 - cs.curveIn * H / 2 };
  const ciM = { x: 0.5 * ci.cx + 0.25 * fiW, y: H / 4 + 0.5 * ci.cy };
  const co = { cx: foW / 2 + cs.curveOut * foW / 2, cy: H / 2 - cs.curveOut * H / 2 };
  const coM = { x: 0.5 * co.cx + 0.25 * foW, y: 0.5 * co.cy + H / 4 };

  const fadeDown = (which: 'fadeIn' | 'fadeOut', sign: 1 | -1) => (e: PointerEvent<HTMLButtonElement>) => {
    const pps = e.currentTarget.parentElement!.getBoundingClientRect().width / span;
    const v0 = cs[which];
    startDrag(e, (dx) => {
      const v = v0 + sign * dx / pps;
      updateClip(id, { [which]: Math.round(Math.max(0, Math.min(half, v)) * 10) / 10 });
    });
  };
  const curveDown = (which: 'curveIn' | 'curveOut') => (e: PointerEvent<HTMLButtonElement>) => {
    const ppy = e.currentTarget.parentElement!.getBoundingClientRect().height / 2;
    const v0 = cs[which];
    startDrag(e, (_dx, dy) => {
      const c = Math.max(-1, Math.min(1, v0 - dy / ppy));
      updateClip(id, { [which]: Math.round(c * 20) / 20 });
    });
  };

  // Gain line: the clip's height spans 0–200%, the line sits at the level and follows the pointer.
  const volY = Math.round(H * (1 - Math.min(200, cs.vol) / 200));
  const volDown = (e: PointerEvent<HTMLButtonElement>) => {
    // The gain line spans the clip, so Ctrl-clicks on it pick the clip too.
    if (additive(e)) { e.preventDefault(); togglePick({ kind: 'audio', id }); return; }
    select({ kind: 'audio', id });
    const v0 = cs.vol;
    startDrag(e, (_dx, dy) => updateClip(id, { vol: Math.round(Math.max(0, Math.min(200, v0 - dy * 200 / H))) }));
  };
  const volKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 10 : 1;
    const d = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0;
    if (!d) return;
    e.preventDefault();
    updateClip(id, { vol: Math.max(0, Math.min(200, cs.vol + d)) });
  };

  return (
    <div className={'audio-clip' + (picked ? ' selected' : partner ? ' partner' : '') + (cs.linked ? '' : ' unlinked')}
      style={{ left: cs.start * pps + 1, width }}>
      <button className="audio-wave" style={{ cursor: ui.tool === 'split' ? 'crosshair' : 'pointer' }}
        aria-label={`Audio: ${src.name}, volume ${cs.vol}%${cs.muted ? ', muted' : ''}${cs.linked ? '' : ', unlinked'}`}
        aria-pressed={picked}
        onPointerDown={dragClip}
        onClick={clickClip(editor, { kind: 'audio', id })}
        onContextMenu={onMenu}>
        {bars.map((h, i) => (
          <span key={i} style={{ height: h, background: cs.muted ? 'rgba(241,244,240,0.22)' : 'rgba(198,240,191,0.7)' }} />
        ))}
      </button>
      <span className="vol-headroom" style={{ height: volY }} aria-hidden="true" />
      <svg width={f1(fiW)} height={H} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', borderRadius: '8px 0 0 8px' }} aria-hidden="true">
        <path d={`M0,0 L${f1(fiW)},0 Q${f1(ci.cx)},${f1(ci.cy)} 0,${H} Z`} fill="rgba(12,14,13,0.62)" />
        <path d={`M0,${H} Q${f1(ci.cx)},${f1(ci.cy)} ${f1(fiW)},0`} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
      </svg>
      <svg width={f1(foW)} height={H} style={{ position: 'absolute', right: 0, top: 0, pointerEvents: 'none' }} aria-hidden="true">
        <path d={`M0,0 Q${f1(co.cx)},${f1(co.cy)} ${f1(foW)},${H} L${f1(foW)},0 Z`} fill="rgba(12,14,13,0.62)" />
        <path d={`M0,0 Q${f1(co.cx)},${f1(co.cy)} ${f1(foW)},${H}`} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
      </svg>
      <button className={'vol-line' + (cs.muted ? ' muted' : '')} style={{ top: volY - 6 }}
        aria-label={`Volume ${cs.vol}%, drag up or down to adjust`} title={`Volume ${cs.vol}% · drag to adjust`}
        onPointerDown={volDown} onKeyDown={volKey} />
      {selected && fiW >= 14 && (
        <button className="curve-handle" style={{ left: ciM.x - 9, top: ciM.y - 9 }}
          aria-label={`Fade-in curve ${curveName(cs.curveIn)}, drag up or down to adjust`}
          title="Drag up or down to shape the fade-in curve" onPointerDown={curveDown('curveIn')}>
          <span />
        </button>
      )}
      {selected && foW >= 14 && (
        <button className="curve-handle" style={{ left: width - foW + coM.x - 9, top: coM.y - 9 }}
          aria-label={`Fade-out curve ${curveName(cs.curveOut)}, drag up or down to adjust`}
          title="Drag up or down to shape the fade-out curve" onPointerDown={curveDown('curveOut')}>
          <span />
        </button>
      )}
      <span className="audio-badge" style={inset && { right: 8 + inset.tail * pps }}>
        {!cs.linked && <span className="unlinked">unlinked</span>}
        {cs.muted && <Mute size={11} stroke="var(--warn)" strokeWidth={2.4} />}
        {cs.vol}%
      </span>
      {selected && (
        <>
          <button className="fade-handle" style={{ left: fiW - 10 }}
            aria-label={`Fade in ${cs.fadeIn.toFixed(1)} seconds, drag to adjust`} title="Drag to set the fade in"
            onPointerDown={fadeDown('fadeIn', 1)}>
            <span />
          </button>
          <button className="fade-handle" style={{ right: foW - 10 }}
            aria-label={`Fade out ${cs.fadeOut.toFixed(1)} seconds, drag to adjust`} title="Drag to set the fade out"
            onPointerDown={fadeDown('fadeOut', -1)}>
            <span />
          </button>
        </>
      )}
    </div>
  );
}

function ClipMenu({ editor }: { editor: Editor }) {
  const { project, ui, updateVideoClip, updateAudioClip, linkClips, closeMenu } = editor;
  const m = ui.menu!;
  const found = findClip(project, m.id);
  if (!found) return null;
  const cs = found.clip;
  const audio = audioFor(project, m.id);
  const label = ui.picked.length > 1
    ? `${ui.picked.length} clips selected`
    : `${m.kind === 'audio' ? 'Audio' : 'Video'} · ${(project.media[cs.mediaId] ?? MISSING_MEDIA).name}`;
  // Linking needs exactly one video and one audio clip selected; unlinking works from either side of a linked pair.
  const pair = pickedPair(project, ui.picked);
  const pairLinked = !!pair && pair.video.linked && pair.video.linkId !== null && pair.video.linkId === pair.audio.linkId;
  const unlinkId = pair ? (pairLinked ? pair.video.id : null)
    : ui.picked.length === 1 && cs.linked && partnersOf(project, cs).length > 0 ? cs.id : null;
  const updateClip = findClip(project, unlinkId)?.track.kind === 'audio' ? updateAudioClip : updateVideoClip;
  const act = (fn?: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn?.(); closeMenu(); };

  return (
    <div role="menu" aria-label={label} className="menu" style={{ left: m.left, top: m.top }} onClick={(e) => e.stopPropagation()}>
      <span className="menu-label">{label}</span>
      <button role="menuitem" className="ib" onClick={act()}>
        <Scissors size={14} stroke="#C8CEC9" /><span>Split at playhead</span><span className="kbd">S</span>
      </button>
      <button role="menuitem" className="ib" onClick={act()}>
        <Duplicate size={14} stroke="#C8CEC9" /><span>Duplicate</span><span className="kbd">Ctrl D</span>
      </button>
      <div className="menu-sep" />
      {unlinkId ? (
        <button role="menuitem" className="ib" onClick={act(() => updateClip(unlinkId, { linked: false }))}>
          <Unlink size={14} stroke="var(--warn)" /><span>Unlink audio and video</span><span className="kbd">Ctrl L</span>
        </button>
      ) : pair && (
        <button role="menuitem" className="ib" onClick={act(() => linkClips(pair.video.id, pair.audio.id))}>
          <Link size={14} stroke="var(--accent)" /><span>Link audio and video</span><span className="kbd">Ctrl L</span>
        </button>
      )}
      {audio && (
        <button role="menuitem" className="ib" onClick={act(() => updateAudioClip(audio.id, { muted: !audio.muted }))}>
          <Mute size={14} stroke="#C8CEC9" /><span>{audio.muted ? 'Unmute audio' : 'Mute audio'}</span><span className="kbd">M</span>
        </button>
      )}
      <div className="menu-sep" />
      <button role="menuitem" className="ib danger" onClick={act()}>
        <Trash size={14} /><span>Delete</span><span className="kbd">Del</span>
      </button>
    </div>
  );
}
