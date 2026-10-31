import { useT } from '../i18n';
import { t as translate, formatNumber } from '../i18n/core';
import { usePlayback } from '../playback/usePlayback';
import { useSourcePlayer, useStillSource } from '../playback/useSourcePlayer';
import { PreviewStrip, SourceFrameStrip } from '../media/PreviewStrip';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, PointerEvent } from 'react';
import { ASPECTS, aspectOf, clipEnd, findMediaClip, findVideoClip, fmtTime, toSource, toTimeline } from '../editor/model';
import type { Media, MediaClip } from '../editor/model';
import type { Editor } from '../editor/useProject';
import { useDrag } from '../editor/useProject';
import { Check, Checker, ChevronDown, ChevronLeft, ChevronRight, Close, Dropper, Maximize, Minimize, Mute, Pause, Play, Redo, SkipEnd, SkipStart, Undo, Volume } from './icons';
import { NumberField } from './NumberField';
import { Slider } from './Slider';
import { previewSize, useSettings } from '../settings';
import { useFullscreen } from './useFullscreen';
import { reportError } from '../toast/store';

interface Props {
  editor: Editor;
  totalTime: string;
  /** The phone layout: no panel header or trim strip, and a transport with undo and redo around play. */
  compact?: boolean;
}

export function PreviewPanel({ editor, totalTime, compact }: Props) {
  useT();
  const { project, ui } = editor;
  const [volume, setVolume] = useState(70);
  const [muted, setMuted] = useState(false);
  const [grid, setGrid] = useState(false);
  const silent = muted || volume === 0;
  const preview = previewSize(project.output, useSettings().previewResolution);
  const playback = usePlayback(editor, silent ? 0 : volume / 100, grid, preview);
  const source = ui.source ? project.media[ui.source] ?? null : null;
  const still = source?.still ? source : null;
  const sourcePlayer = useSourcePlayer(still ? null : source, silent ? 0 : volume / 100);
  const stillSource = useStillSource(still);
  const panel = useRef<HTMLElement>(null);
  const [fullscreen, toggleFullscreen] = useFullscreen(useCallback(() => panel.current, []));
  const onFullscreen = (e: MouseEvent<HTMLButtonElement>) => {
    // A focused button would swallow Space, which should keep playing and pausing.
    if (e.detail) e.currentTarget.blur();
    toggleFullscreen();
  };

  const focus = findMediaClip(project, ui.focusClip);
  const focusMedia = focus && project.media[focus.clip.mediaId];

  // The transport drives whichever is showing: a Media item on its own, or the timeline.
  const frame = 1 / (source ? source.video?.fps ?? 30 : project.output.fps);
  const transport = still
    ? { time: 0, total: fmtTime(0), playing: false, toggle: async () => {}, seek: () => {}, start: 0, end: 0, status: stillSource.status }
    : source
    ? { time: sourcePlayer.time, total: fmtTime(source.duration), playing: sourcePlayer.playing, toggle: sourcePlayer.toggle,
        seek: sourcePlayer.seek, start: 0, end: source.duration, status: sourcePlayer.status }
    : { time: ui.playhead, total: totalTime, playing: playback.playing, toggle: playback.toggle,
        seek: playback.seek, start: editor.range.start, end: editor.range.end, status: playback.status };

  // Playback and source errors used to sit over the stage; they go to the toast queue now.
  const previewStatus = transport.status;
  useEffect(() => {
    if (!previewStatus) return;
    reportError(source ? translate('couldNotPreviewThisSource') : translate('previewProblem'), previewStatus, undefined, 'preview');
  }, [previewStatus, source]);

  return (
    <section className={'panel preview' + (compact ? ' compact' : '')} ref={panel}>
      {(!compact || source) && <div className="preview-head">
        <span className="panel-title">{translate('preview')}</span>
        <div className="preview-pills">
          {source && <>
            <span className="pill source-pill">{translate('source3', { value1: source.name })}</span>
            <button className="ib outlined back-btn" onClick={editor.closeSource} title={translate('showTheTimelineInThePreviewAgain')}>
              <Close size={12} strokeWidth={2.2} />
              {translate('backToTimeline')}
            </button>
          </>}
          {!compact && <AspectMenu editor={editor} />}
        </div>
      </div>}

      <div className="stage-wrap">
        <div className="stage-fit">
          <div className={grid && !source ? 'stage grid' : 'stage'} style={{ '--ar': project.output.width / project.output.height } as CSSProperties}>
            <canvas ref={playback.canvas} width={preview.width} height={preview.height} aria-label={translate('timelinePreview')} style={{ width: '100%', height: '100%', display: 'block' }} />
            {!source && ui.keyPick && <KeyPicker editor={editor} clipId={ui.keyPick} sample={playback.sample} />}
            <video ref={sourcePlayer.video} className="source-video" hidden={!source || !!still} playsInline preload="auto" aria-label={source && !still ? translate('sourcePreview', { value1: source.name }) : undefined} />
            {still && stillSource.url && (
              <img className="source-video" src={stillSource.url} alt={translate('sourcePreview', { value1: still.name })}
                onError={() => stillSource.setStatus(translate('couldNotBeDecoded', { value1: still.name }))} />
            )}
          </div>
        </div>
      </div>

      {compact ? null : still ? <StillInfo src={still} />
        : source ? <SourceScrub src={source} time={sourcePlayer.time} seek={sourcePlayer.seek} />
        : focus && focusMedia?.still ? <StillTrim editor={editor} clip={focus.clip} src={focusMedia} />
        : focus && focusMedia ? <Trim editor={editor} clip={focus.clip} src={focusMedia} /> : <div className="trim" />}

      {compact ? (
        <div className="transport-bar">
          <span className="mono transport-time">
            {fmtTime(transport.time)}<span style={{ color: 'var(--text-muted)' }}> / {transport.total}</span>
          </span>
          <div className="transport-main">
            <button className="ib transport" onClick={editor.undo} disabled={!editor.canUndo} aria-label={translate('undoCtrlZ')}><Undo stroke="#C8CEC9" /></button>
            <button className="play-btn" onClick={() => void transport.toggle()} aria-label={transport.playing ? translate('pauseSpace') : translate('playSpace')}>{transport.playing ? <Pause fill="var(--bg)" /> : <Play fill="var(--bg)" />}</button>
            <button className="ib transport" onClick={editor.redo} disabled={!editor.canRedo} aria-label={translate('redoCtrlShiftZ')}><Redo stroke="#C8CEC9" /></button>
          </div>
          <button className="ib transport" onClick={onFullscreen} aria-pressed={fullscreen}
            aria-label={fullscreen ? translate('exitFullScreenPreview') : translate('fullScreenPreview')}>
            {fullscreen ? <Minimize stroke='#C8CEC9' /> : <Maximize stroke='#C8CEC9' />}
          </button>
        </div>
      ) : (
        <div className="transport-bar">
          <span className="mono" style={{ fontSize: 13, fontWeight: 500, minWidth: 160 }}>
            {fmtTime(transport.time)}<span style={{ color: 'var(--text-muted)' }}> / {transport.total}</span>
          </span>
          <div style={{ flex: '1 1 auto', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
            <button className="ib transport" onClick={() => transport.seek(transport.start)} aria-label={translate('goToStart')}><SkipStart fill='#C8CEC9' /></button>
            <button className="ib transport" onClick={() => transport.seek(transport.time - frame)} aria-label={translate('backOneFrame')}><ChevronLeft stroke='#C8CEC9' strokeWidth={2.2} /></button>
            <button className="play-btn" onClick={() => void transport.toggle()} aria-label={transport.playing ? translate('pauseSpace') : translate('playSpace')} title={translate('playPauseSpace')}>{transport.playing ? <Pause fill="var(--bg)" /> : <Play fill="var(--bg)" />}</button>
            <button className="ib transport" onClick={() => transport.seek(transport.time + frame)} aria-label={translate('forwardOneFrame')}><ChevronRight stroke='#C8CEC9' strokeWidth={2.2} /></button>
            <button className="ib transport" onClick={() => transport.seek(transport.end)} aria-label={translate('goToEnd')}><SkipEnd fill='#C8CEC9' /></button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160, justifyContent: 'flex-end' }}>
            <button className="ib transport" aria-pressed={grid} disabled={!!source} onClick={() => setGrid(!grid)}
              aria-label={translate('transparencyGrid')} title={grid ? translate('showTransparentAreasAsBlackLikeTheExport') : translate('showTransparentAreasAsACheckerboard')}>
              <Checker stroke={grid ? 'var(--accent)' : '#C8CEC9'} />
            </button>
            <button className="ib transport" aria-label={silent ? translate('unmutePreview') : translate('mutePreview')} aria-pressed={silent}
              onClick={() => { setMuted(!silent); if (silent && volume === 0) setVolume(70); }}>
              {silent ? <Mute stroke="var(--warn)" /> : <Volume stroke='#C8CEC9' />}
            </button>
            <div style={{ width: 110 }}>
              <Slider label={translate('previewVolume')} hideLabel className="compact" value={muted ? 0 : volume} unit={'%'} min={0} max={100}
                onChange={(v) => { setVolume(v); setMuted(false); }} />
            </div>
            <button className="ib transport" onClick={onFullscreen} aria-pressed={fullscreen}
              aria-label={fullscreen ? translate('exitFullScreenPreview') : translate('fullScreenPreview')} title={fullscreen ? translate('exitFullScreenPreviewEsc') : translate('fullScreenPreview')}>
              {fullscreen ? <Minimize stroke='#C8CEC9' /> : <Maximize stroke='#C8CEC9' />}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** The output frame's shape. Sources with another shape follow each clip's fit, which letterboxes by default. */
function AspectMenu({ editor }: { editor: Editor }) {
  useT();
  const { width, height } = editor.project.output;
  const current = aspectOf(editor.project.output);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
    };
  }, [open]);
  return (
    <div className="aspect" ref={root}>
      <button className="ib outlined aspect-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        aria-label={translate('outputAspectDescription', { ratio: current?.key ?? translate('custom'), width: String(width), height: String(height) })} title={translate('outputAspectRatio')}>
        {current?.key ?? translate('custom')}<span className="mono">{width}×{height}</span>
        <ChevronDown size={12} strokeWidth={2.2} />
      </button>
      {open && (
        <div role="menu" aria-label={translate('outputAspectRatio')} className="menu">
          <span className="menu-label">{translate('outputFrameShape')}</span>
          {ASPECTS.map((a) => {
            const scale = 14 / Math.max(a.w, a.h);
            return (
              <button key={a.key} role="menuitemradio" aria-checked={a === current} className="ib"
                onClick={() => { editor.setAspect(a); setOpen(false); }}>
                <span className="aspect-icon" aria-hidden="true"><span style={{ width: a.w * scale, height: a.h * scale }} /></span>
                <span className="aspect-label">{a.key}<span className="aspect-use">{a.use}</span></span>
                {a === current && <Check size={14} stroke="var(--accent)" strokeWidth={2.4} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Eyedropper over the stage while a clip's key colour is being picked. It samples the clip's own
 * unkeyed frame, so it works with the key already on and with other tracks drawn over the clip.
 */
function KeyPicker({ editor, clipId, sample }: { editor: Editor; clipId: string; sample: (clipId: string, x: number, y: number) => string | null }) {
  useT();
  const { project, ui, pickKey, updateVideoClip } = editor;
  const clip = findVideoClip(project, clipId);
  const [hover, setHover] = useState<{ left: number; top: number; color: string | null } | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') pickKey(null); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [pickKey]);
  if (!clip) return null;
  const onScreen = ui.playhead >= clip.start && ui.playhead < clipEnd(clip);
  const at = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const left = e.clientX - r.left, top = e.clientY - r.top;
    return { left, top, color: sample(clipId, left / r.width * project.output.width, top / r.height * project.output.height) };
  };
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const { color } = at(e);
    if (!color) return;
    updateVideoClip(clipId, { key: { ...clip.key, enabled: true, color } });
    pickKey(null);
  };
  const message = !onScreen ? translate('moveThePlayheadOverThisClipToPickFrom')
    : hover && !hover.color ? translate('pointAtTheSelectedClip') : translate('clickTheColourToRemove');
  return (
    <div className="key-picker" onPointerMove={(e) => setHover(at(e))} onPointerLeave={() => setHover(null)} onPointerUp={pick}>
      <div className="key-picker-banner" role="status">
        <Dropper size={14} />
        <span>{message}</span>
        <span style={{ color: 'var(--text-muted)' }}>{translate('escToCancel')}</span>
      </div>
      {hover?.color && (
        <div className="key-loupe" style={{ left: hover.left, top: hover.top }} aria-hidden="true">
          <span style={{ background: hover.color }} />
          <span className="mono">{hover.color}</span>
        </div>
      )}
    </div>
  );
}

/** Scrubber across a whole source previewing on its own. */
function SourceScrub({ src, time, seek }: { src: Media; time: number; seek: (time: number) => void }) {
  useT();
  const p = (s: number) => (s / src.duration * 100).toFixed(2) + '%';
  return (
    <div className="trim">
      <div className="trim-head">
        <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
          <span style={{ fontWeight: 700 }}>{translate('source')}</span>
          <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{src.name}</span>
        </span>
        <span className="mono" style={{ fontWeight: 500, color: 'var(--text-dim)', flex: 'none' }}>{fmtTime(src.duration)}</span>
      </div>
      <div className="trim-row">
        <span className="trim-time">{fmtTime(0)}</span>
        <div className="trim-bar" style={{ background: src.tone }}>
          <SourceFrameStrip media={src} />
          <input type="range" min={0} max={src.duration} step={0.01} value={Math.min(time, src.duration)}
            onChange={(e) => seek(Number(e.target.value))} aria-label={translate('playheadWithinTheSource')}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'pointer', zIndex: 2 }} />
          <div className="scrub-line" style={{ left: p(Math.min(time, src.duration)) }} aria-hidden="true" />
        </div>
        <span className="trim-time" style={{ textAlign: 'right' }}>{fmtTime(src.duration)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
        {translate('previewingTheSourceOnItsOwnTheTimelineIs')}</div>
    </div>
  );
}

/** A still image previewing on its own: it has no time to scrub through. */
function StillInfo({ src }: { src: Media }) {
  useT();
  return (
    <div className="trim">
      <div className="trim-head">
        <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
          <span style={{ fontWeight: 700 }}>{translate('source')}</span>
          <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{src.name}</span>
        </span>
        <span className="mono" style={{ fontWeight: 500, color: 'var(--text-dim)', flex: 'none' }}>{src.video && `${src.video.width}×${src.video.height}`}</span>
      </div>
      <div className="trim-row">
        <div className="trim-bar" style={{ background: src.tone }}>
          <PreviewStrip media={src} width={560} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
        {src.animation
          ? translate('animationSLoopDragItOntoAVideoTrack', { value1: formatNumber(src.animation, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })
          : translate('stillImageDragItOntoAVideoTrackIt', { value1: src.duration })}
      </div>
    </div>
  );
}

/** A still clip has no source in and out points, only a length. */
function StillTrim({ editor, clip: cs, src }: { editor: Editor; clip: MediaClip; src: Media }) {
  useT();
  const length = Math.round((cs.outS - cs.inS) * 100) / 100;
  return (
    <div className="trim">
      <div className="trim-head">
        <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
          <span style={{ fontWeight: 700 }}>{translate('length')}</span>
          <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{src.name}</span>
        </span>
        <span className="mono" style={{ fontWeight: 500, color: 'var(--text-dim)', flex: 'none' }}>
          {fmtTime(cs.start)} – {fmtTime(cs.start + length)}
        </span>
      </div>
      <div className="trim-row">
        <div className="trim-bar" style={{ background: src.tone }}>
          <PreviewStrip media={src} width={560} />
        </div>
        <div style={{ width: 120, flex: 'none' }}>
          <NumberField aria-label={translate('stillImageLengthInSeconds')} min={0.5} step={0.5} unit={"s"} value={length}
            onChange={(v) => editor.trimEdge(cs.id, 'out', cs.start + v)} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>{translate('dragEitherEdgeOnTheTimelineToShowItFor', { value1: src.animation ? `Animation · loops every ${formatNumber(src.animation, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s` : translate('stillImage') })}</div>
    </div>
  );
}

/** Trim scrubber for the focused clip. */
function Trim({ editor, clip: cs, src }: { editor: Editor; clip: MediaClip; src: Media }) {
  useT();
  const { ui, trimClip, setScrub, setPlayhead } = editor;
  const startDrag = useDrag();
  const accent = 'var(--accent)';
  const clipId = cs.id;
  const at = toSource(cs, ui.playhead);
  // Where the timeline playhead sits relative to this clip; outside it there's no scrub position to show.
  const outside = at < cs.inS - 1e-6 ? 'before' : at > cs.outS + 1e-6 ? 'after' : null;
  const scrub = Math.max(cs.inS, Math.min(cs.outS, at));
  const p = (s: number) => (s / src.duration * 100).toFixed(2) + '%';
  const usePct = p(cs.outS - cs.inS);
  const round = (x: number) => Math.round(x * 100) / 100;
  const seek = (time: number) => { setScrub(time); setPlayhead(toTimeline(cs, time)); };

  const dragHandle = (which: 'in' | 'out') => (e: PointerEvent<HTMLButtonElement>) => {
    const bar = e.currentTarget.parentElement!.getBoundingClientRect();
    const pps = bar.width / src.duration;
    const v0 = which === 'in' ? cs.inS : cs.outS;
    const { inS, outS } = cs;
    const minDuration = Math.min(0.5, src.duration);
    startDrag(e, (dx) => {
      const v = v0 + dx / pps;
      if (which === 'in') trimClip(clipId, { inS: round(Math.max(0, Math.min(outS - minDuration, v))) });
      else trimClip(clipId, { outS: round(Math.min(src.duration, Math.max(inS + minDuration, v))) });
    });
  };

  return (
    <div className="trim">
      <div className="trim-head">
        <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
          <span style={{ fontWeight: 700 }}>{translate('trim')}</span>
          <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{src.name}</span>
        </span>
        <span className="mono" style={{ fontWeight: 500, color: 'var(--text-dim)', flex: 'none' }}>{translate('sOf2', { value1: formatNumber((cs.outS - cs.inS), { minimumFractionDigits: 2, maximumFractionDigits: 2 }), value2: fmtTime(src.duration) })}</span>
      </div>
      <div className="trim-row">
        <span className="trim-time">{fmtTime(cs.inS)}</span>
        <div className="trim-bar" style={{ background: src.tone }}>
          <PreviewStrip media={src} width={560} />
          <div className="trim-shade in" style={{ left: 0, width: p(cs.inS) }} aria-hidden="true" />
          <div className="trim-shade out" style={{ left: p(cs.outS), right: 0 }} aria-hidden="true" />
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: p(cs.inS), width: usePct, borderTop: `2px solid ${accent}`, borderBottom: `2px solid ${accent}`, pointerEvents: 'none' }} aria-hidden="true" />
          <input
            type="range" min={cs.inS} max={cs.outS} step={0.01} value={scrub}
            onChange={(e) => seek(Number(e.target.value))}
            // A click on the edge the playhead is clamped to changes nothing, so it wouldn't fire onChange.
            onClick={(e) => outside && seek(Number(e.currentTarget.value))}
            aria-label={translate('playheadWithinTheTrimmedClip')}
            style={{ position: 'absolute', top: 0, height: '100%', left: p(cs.inS), width: usePct, opacity: 0, cursor: 'pointer', zIndex: 2 }}
          />
          {!outside && <div className="scrub-line" style={{ left: p(scrub) }} aria-hidden="true" />}
          <button className="trim-handle in" aria-label={translate('trimInPointDragToAdjust')} title={translate('dragToSetTheInPoint')}
            onPointerDown={dragHandle('in')}
            style={{ left: p(cs.inS), marginLeft: -14 }}>
            <span className="grip" />
          </button>
          <button className="trim-handle out" aria-label={translate('trimOutPointDragToAdjust')} title={translate('dragToSetTheOutPoint')}
            onPointerDown={dragHandle('out')}
            style={{ left: p(cs.outS) }}>
            <span className="grip" />
          </button>
        </div>
        <span className="trim-time" style={{ textAlign: 'right' }}>{fmtTime(cs.outS)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
        {outside
          ? translate('playheadIsThisClipClickTheBarToJump', { value1: translate(outside === 'before' ? 'uiBefore' : 'uiAfter') })
          : <>{translate('playhead')}<span className="mono" style={{ color: 'var(--text)' }}>{fmtTime(scrub)}</span></>}
      </div>
    </div>
  );
}
