import { useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { filmstrip, findClip, fmtTime, textTracks, videoTracks } from '../editor/model';
import type { Clip, Media, Project, TimelineLayout, VideoClip } from '../editor/model';
import type { Editor } from '../editor/useProject';
import { useDrag } from '../editor/useProject';
import { ChevronLeft, ChevronRight, Mute, Play, SkipEnd, SkipStart, Volume } from './icons';
import { Slider } from './Slider';

const ALIGN: Record<string, CSSProperties['alignItems']> = { t: 'flex-start', c: 'center', b: 'flex-end', l: 'flex-start', r: 'flex-end' };

interface Props {
  editor: Editor;
  totalTime: string;
}

/** The topmost visible video clip under the playhead. */
function clipAt(project: Project, layout: TimelineLayout, t: number): VideoClip | null {
  for (const track of videoTracks(project)) {
    if (track.hidden) continue;
    const c = track.clips.find((x) => layout.clips[x.id].vs <= t && t < layout.clips[x.id].ve);
    if (c) return c;
  }
  return null;
}

export function PreviewPanel({ editor, totalTime }: Props) {
  const { project, ui, layout } = editor;
  const [volume, setVolume] = useState(70);
  const [muted, setMuted] = useState(false);
  const silent = muted || volume === 0;
  const accent = 'var(--accent)';
  const { width: ow, height: oh } = project.output;

  // Stage
  const pb = clipAt(project, layout, ui.playhead);
  const pm = pb && project.media[pb.mediaId];
  const pct = (v: number, of: number) => (v / of * 100).toFixed(1) + '%';
  const stageSelected = !!pb && ui.sel?.kind === 'clip' && ui.sel.id === pb.id;
  const texts = textTracks(project).filter((t) => !t.hidden)
    .flatMap((t) => t.items.filter((x) => x.start <= ui.playhead && ui.playhead < x.start + x.duration));

  const focus = findClip(project, ui.focusClip);
  const focusMedia = focus && project.media[focus.clip.mediaId];

  return (
    <section className="panel preview">
      <div className="preview-head">
        <span className="panel-title">Preview</span>
        <div className="preview-pills">
          <span className="pill">Preview at 540p</span>
          <span className="pill">{`Export ${oh}p · ${project.output.fps} fps`}</span>
        </div>
      </div>

      <div className="stage-wrap">
        <div className="stage-fit">
          <div className="stage">
            {pb && pm?.video && (() => {
              const transform = `translate(${pct(pb.x, ow)}, ${pct(pb.y, oh)}) scale(${pb.scale / 100}) rotate(${pb.rot}deg)`;
              const { width: sw, height: sh } = pm.video;
              const crop = { top: pct(pb.cropT, sh), right: pct(pb.cropR, sw), bottom: pct(pb.cropB, sh), left: pct(pb.cropL, sw) };
              const sourceTime = pb.inS + ui.playhead - pb.start;
              return (
                <>
                  <div className="layer" style={{ transform, clipPath: `inset(${crop.top} ${crop.right} ${crop.bottom} ${crop.left})` }}>
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '58%', background: '#4B6470' }} />
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '42%', background: '#2F4A44' }} />
                  </div>
                  <div className="layer" style={{ transform, pointerEvents: 'none' }} aria-hidden="true">
                    <div style={{ position: 'absolute', ...crop, outline: `1px dashed ${stageSelected ? accent : 'transparent'}` }} />
                  </div>
                  <div className="frame-label">[frame] {pm.name} @ {fmtTime(sourceTime)}</div>
                </>
              );
            })()}
            {texts.map((text) => (
              <div key={text.id} className="overlay-box" style={{ alignItems: ALIGN[text.pos[0]], justifyContent: ALIGN[text.pos[1]] }}>
                <div className="overlay-text" style={{
                  fontSize: Math.round(text.size * 0.4), color: text.color,
                  outline: `1px dashed ${ui.sel?.kind === 'text' && ui.sel.id === text.id ? accent : 'transparent'}`,
                }}>
                  {text.content}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {focus && focusMedia ? <Trim editor={editor} clip={focus.clip} src={focusMedia} /> : <div className="trim" />}

      <div className="transport-bar">
        <span className="mono" style={{ fontSize: 13, fontWeight: 500, minWidth: 160 }}>
          {fmtTime(ui.playhead)}<span style={{ color: 'var(--text-muted)' }}> / {totalTime}</span>
        </span>
        <div style={{ flex: '1 1 auto', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
          <button className="ib transport" aria-label="Go to start"><SkipStart fill="#C8CEC9" /></button>
          <button className="ib transport" aria-label="Back one frame"><ChevronLeft stroke="#C8CEC9" strokeWidth={2.2} /></button>
          <button className="play-btn" aria-label="Play (Space)" title="Play · Space"><Play fill="var(--bg)" /></button>
          <button className="ib transport" aria-label="Forward one frame"><ChevronRight stroke="#C8CEC9" strokeWidth={2.2} /></button>
          <button className="ib transport" aria-label="Go to end"><SkipEnd fill="#C8CEC9" /></button>
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

/** Trim scrubber for the focused clip. */
function Trim({ editor, clip: cs, src }: { editor: Editor; clip: Clip; src: Media }) {
  const { ui, trimClip, setScrub } = editor;
  const startDrag = useDrag();
  const accent = 'var(--accent)';
  const clipId = cs.id;
  const scrub = Math.max(cs.inS, Math.min(cs.outS, ui.scrub));
  const p = (s: number) => (s / src.duration * 100).toFixed(2) + '%';
  const usePct = p(cs.outS - cs.inS);
  const round = (x: number) => Math.round(x * 100) / 100;

  const dragHandle = (which: 'in' | 'out') => (e: PointerEvent<HTMLButtonElement>) => {
    const bar = e.currentTarget.parentElement!.getBoundingClientRect();
    const pps = bar.width / src.duration;
    const v0 = which === 'in' ? cs.inS : cs.outS;
    const { inS, outS } = cs;
    startDrag(e, (dx) => {
      const v = v0 + dx / pps;
      if (which === 'in') trimClip(clipId, { inS: round(Math.max(0, Math.min(outS - 0.5, v))) });
      else trimClip(clipId, { outS: round(Math.min(src.duration, Math.max(inS + 0.5, v))) });
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
          <div className="strip" style={{ borderRadius: 8 }} aria-hidden="true">
            {filmstrip(560, src.seed).map((a, i) => <span key={i} style={{ background: `rgba(255,255,255,${a.toFixed(3)})` }} />)}
          </div>
          <div className="trim-shade" style={{ left: 0, width: p(cs.inS), borderRadius: '8px 0 0 8px' }} aria-hidden="true" />
          <div className="trim-shade" style={{ left: p(cs.outS), right: 0, borderRadius: '0 8px 8px 0' }} aria-hidden="true" />
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: p(cs.inS), width: usePct, borderTop: `2px solid ${accent}`, borderBottom: `2px solid ${accent}`, pointerEvents: 'none' }} aria-hidden="true" />
          <input
            type="range" min={cs.inS} max={cs.outS} step={0.01} value={scrub}
            onChange={(e) => setScrub(Number(e.target.value))}
            aria-label="Playhead within the trimmed clip"
            style={{ position: 'absolute', top: 0, height: '100%', left: p(cs.inS), width: usePct, opacity: 0, cursor: 'pointer', zIndex: 2 }}
          />
          <div className="scrub-line" style={{ left: p(scrub) }} aria-hidden="true" />
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
        Playhead <span className="mono" style={{ color: 'var(--text)' }}>{fmtTime(scrub)}</span>
      </div>
    </div>
  );
}
