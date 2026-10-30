import { usePlayback } from '../playback/usePlayback';
import { useSourcePlayer } from '../playback/useSourcePlayer';
import { PreviewStrip } from '../media/PreviewStrip';
import { useState } from 'react';
import type { PointerEvent } from 'react';
import { findMediaClip, fmtTime } from '../editor/model';
import type { Media, MediaClip } from '../editor/model';
import type { Editor } from '../editor/useProject';
import { useDrag } from '../editor/useProject';
import { ChevronLeft, ChevronRight, Close, Mute, Pause, Play, SkipEnd, SkipStart, Volume, Warning } from './icons';
import { Slider } from './Slider';

interface Props {
  editor: Editor;
  totalTime: string;
}

export function PreviewPanel({ editor, totalTime }: Props) {
  const { project, ui } = editor;
  const [volume, setVolume] = useState(70);
  const [muted, setMuted] = useState(false);
  const silent = muted || volume === 0;
  const playback = usePlayback(editor, silent ? 0 : volume / 100);
  const source = ui.source ? project.media[ui.source] ?? null : null;
  const sourcePlayer = useSourcePlayer(source, silent ? 0 : volume / 100);
  const { height: oh } = project.output;

  const focus = findMediaClip(project, ui.focusClip);
  const focusMedia = focus && project.media[focus.clip.mediaId];

  // The transport drives whichever is showing: a Media item on its own, or the timeline.
  const frame = 1 / (source ? source.video?.fps ?? 30 : project.output.fps);
  const transport = source
    ? { time: sourcePlayer.time, total: fmtTime(source.duration), playing: sourcePlayer.playing, toggle: sourcePlayer.toggle,
        seek: sourcePlayer.seek, start: 0, end: source.duration, status: sourcePlayer.status }
    : { time: ui.playhead, total: totalTime, playing: playback.playing, toggle: playback.toggle,
        seek: playback.seek, start: editor.range.start, end: editor.range.end, status: playback.status };

  return (
    <section className="panel preview">
      <div className="preview-head">
        <span className="panel-title">Preview</span>
        {source ? (
          <div className="preview-pills">
            <span className="pill source-pill">Source · {source.name}</span>
            <button className="ib outlined back-btn" onClick={editor.closeSource} title="Show the timeline in the preview again">
              <Close size={12} strokeWidth={2.2} />
              Back to timeline
            </button>
          </div>
        ) : (
          <div className="preview-pills">
            <span className="pill">Preview at 540p</span>
            <span className="pill">{`Export ${oh}p · ${project.output.fps} fps`}</span>
          </div>
        )}
      </div>

      <div className="stage-wrap">
        <div className="stage-fit">
          <div className="stage" style={{ aspectRatio: `${project.output.width} / ${oh}` }}>
            <canvas ref={playback.canvas} width={960} height={Math.round(960 * oh / project.output.width)} aria-label="Timeline preview" style={{ width: '100%', height: '100%', display: 'block' }} />
            <video ref={sourcePlayer.video} className="source-video" hidden={!source} playsInline preload="auto" aria-label={source ? `Source preview: ${source.name}` : undefined} />
            {transport.status && (
              <div role="alert" className="stage-alert">
                <Warning size={18} strokeWidth={2.2} />
                <span>{transport.status}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {source ? <SourceScrub src={source} time={sourcePlayer.time} seek={sourcePlayer.seek} />
        : focus && focusMedia ? <Trim editor={editor} clip={focus.clip} src={focusMedia} /> : <div className="trim" />}

      <div className="transport-bar">
        <span className="mono" style={{ fontSize: 13, fontWeight: 500, minWidth: 160 }}>
          {fmtTime(transport.time)}<span style={{ color: 'var(--text-muted)' }}> / {transport.total}</span>
        </span>
        <div style={{ flex: '1 1 auto', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
          <button className="ib transport" onClick={() => transport.seek(transport.start)} aria-label="Go to start"><SkipStart fill="#C8CEC9" /></button>
          <button className="ib transport" onClick={() => transport.seek(transport.time - frame)} aria-label="Back one frame"><ChevronLeft stroke="#C8CEC9" strokeWidth={2.2} /></button>
          <button className="play-btn" onClick={() => void transport.toggle()} aria-label={transport.playing ? 'Pause (Space)' : 'Play (Space)'} title="Play / pause · Space">{transport.playing ? <Pause fill="var(--bg)" /> : <Play fill="var(--bg)" />}</button>
          <button className="ib transport" onClick={() => transport.seek(transport.time + frame)} aria-label="Forward one frame"><ChevronRight stroke="#C8CEC9" strokeWidth={2.2} /></button>
          <button className="ib transport" onClick={() => transport.seek(transport.end)} aria-label="Go to end"><SkipEnd fill="#C8CEC9" /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160, justifyContent: 'flex-end' }}>
          <button className="ib transport" aria-label={silent ? 'Unmute preview' : 'Mute preview'} aria-pressed={silent}
            onClick={() => { setMuted(!silent); if (silent && volume === 0) setVolume(70); }}>
            {silent ? <Mute stroke="var(--warn)" /> : <Volume stroke="#C8CEC9" />}
          </button>
          <div style={{ width: 110 }}>
            <Slider label="Preview volume" hideLabel className="compact" value={muted ? 0 : volume} unit="%" min={0} max={100}
              onChange={(v) => { setVolume(v); setMuted(false); }} />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Scrubber across a whole source previewing on its own. */
function SourceScrub({ src, time, seek }: { src: Media; time: number; seek: (time: number) => void }) {
  const p = (s: number) => (s / src.duration * 100).toFixed(2) + '%';
  return (
    <div className="trim">
      <div className="trim-head">
        <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
          <span style={{ fontWeight: 700 }}>Source</span>
          <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{src.name}</span>
        </span>
        <span className="mono" style={{ fontWeight: 500, color: 'var(--text-dim)', flex: 'none' }}>{fmtTime(src.duration)}</span>
      </div>
      <div className="trim-row">
        <span className="trim-time">{fmtTime(0)}</span>
        <div className="trim-bar" style={{ background: src.tone }}>
          <PreviewStrip media={src} width={560} />
          <input type="range" min={0} max={src.duration} step={0.01} value={Math.min(time, src.duration)}
            onChange={(e) => seek(Number(e.target.value))} aria-label="Playhead within the source"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'pointer', zIndex: 2 }} />
          <div className="scrub-line" style={{ left: p(Math.min(time, src.duration)) }} aria-hidden="true" />
        </div>
        <span className="trim-time" style={{ textAlign: 'right' }}>{fmtTime(src.duration)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
        Previewing the source on its own · the timeline is unchanged
      </div>
    </div>
  );
}

/** Trim scrubber for the focused clip. */
function Trim({ editor, clip: cs, src }: { editor: Editor; clip: MediaClip; src: Media }) {
  const { ui, trimClip, setScrub, setPlayhead } = editor;
  const startDrag = useDrag();
  const accent = 'var(--accent)';
  const clipId = cs.id;
  const at = cs.inS + ui.playhead - cs.start;
  // Where the timeline playhead sits relative to this clip; outside it there's no scrub position to show.
  const outside = at < cs.inS - 1e-6 ? 'before' : at > cs.outS + 1e-6 ? 'after' : null;
  const scrub = Math.max(cs.inS, Math.min(cs.outS, at));
  const p = (s: number) => (s / src.duration * 100).toFixed(2) + '%';
  const usePct = p(cs.outS - cs.inS);
  const round = (x: number) => Math.round(x * 100) / 100;
  const seek = (time: number) => { setScrub(time); setPlayhead(cs.start + time - cs.inS); };

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
          <span style={{ fontWeight: 700 }}>Trim</span>
          <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{src.name}</span>
        </span>
        <span className="mono" style={{ fontWeight: 500, color: 'var(--text-dim)', flex: 'none' }}>
          {(cs.outS - cs.inS).toFixed(2)} s of {fmtTime(src.duration)}
        </span>
      </div>
      <div className="trim-row">
        <span className="trim-time">{fmtTime(cs.inS)}</span>
        <div className="trim-bar" style={{ background: src.tone }}>
          <PreviewStrip media={src} width={560} />
          <div className="trim-shade" style={{ left: 0, width: p(cs.inS), borderRadius: '8px 0 0 8px' }} aria-hidden="true" />
          <div className="trim-shade" style={{ left: p(cs.outS), right: 0, borderRadius: '0 8px 8px 0' }} aria-hidden="true" />
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: p(cs.inS), width: usePct, borderTop: `2px solid ${accent}`, borderBottom: `2px solid ${accent}`, pointerEvents: 'none' }} aria-hidden="true" />
          <input
            type="range" min={cs.inS} max={cs.outS} step={0.01} value={scrub}
            onChange={(e) => seek(Number(e.target.value))}
            // A click on the edge the playhead is clamped to changes nothing, so it wouldn't fire onChange.
            onClick={(e) => outside && seek(Number(e.currentTarget.value))}
            aria-label="Playhead within the trimmed clip"
            style={{ position: 'absolute', top: 0, height: '100%', left: p(cs.inS), width: usePct, opacity: 0, cursor: 'pointer', zIndex: 2 }}
          />
          {!outside && <div className="scrub-line" style={{ left: p(scrub) }} aria-hidden="true" />}
          <button className="trim-handle" aria-label="Trim in point, drag to adjust" title="Drag to set the in point"
            onPointerDown={dragHandle('in')}
            style={{ left: p(cs.inS), marginLeft: -14, borderRadius: '6px 0 0 6px' }}>
            <span className="grip" />
          </button>
          <button className="trim-handle" aria-label="Trim out point, drag to adjust" title="Drag to set the out point"
            onPointerDown={dragHandle('out')}
            style={{ left: p(cs.outS), borderRadius: '0 6px 6px 0' }}>
            <span className="grip" />
          </button>
        </div>
        <span className="trim-time" style={{ textAlign: 'right' }}>{fmtTime(cs.outS)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
        {outside
          ? `Playhead is ${outside} this clip · click the bar to jump in`
          : <>Playhead <span className="mono" style={{ color: 'var(--text)' }}>{fmtTime(scrub)}</span></>}
      </div>
    </div>
  );
}
