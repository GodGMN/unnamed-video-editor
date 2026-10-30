import type { MouseEvent, PointerEvent, ReactNode } from 'react';
import { useRef } from 'react';
import { MAIN_IDS, PPS, SOURCES, TRANSITION_BETWEEN, TRANSITION_NAMES, curveName, filmstrip } from '../editor/model';
import type { ClipId, Tool, TrackKey } from '../editor/model';
import type { Project } from '../editor/useProject';
import { useDrag } from '../editor/useProject';
import { CutLine, Crossfade, Cursor, Duplicate, Eye, FadeBlack, Link, Mute, Plus, Scissors, TextT, Trash, Unlink, Volume } from './icons';

const TEXT_TRACK_H = 44;
const VIDEO_TRACK_H = 56;
const AUDIO_TRACK_H = 64;
const AUDIO_CLIP_H = 52;

const TOOLS: { k: Tool; label: string; key: string; icon: ReactNode }[] = [
  { k: 'select', label: 'Select', key: 'V', icon: <Cursor size={14} /> },
  { k: 'split', label: 'Split', key: 'S', icon: <Scissors size={14} /> },
  { k: 'text', label: 'Text', key: 'T', icon: <TextT size={14} /> },
];

const HEADERS: { key: TrackKey | 'T1'; label: string; sub: string; h: number; type: 'text' | 'video' | 'audio' }[] = [
  { key: 'T1', label: 'Text', sub: '', h: TEXT_TRACK_H, type: 'text' },
  { key: 'V2', label: 'V2', sub: 'Overlay', h: VIDEO_TRACK_H, type: 'video' },
  { key: 'V1', label: 'V1', sub: 'Main', h: VIDEO_TRACK_H, type: 'video' },
  { key: 'A1', label: 'A1', sub: 'Clip audio', h: AUDIO_TRACK_H, type: 'audio' },
  { key: 'A2', label: 'A2', sub: 'Overlay audio', h: AUDIO_TRACK_H, type: 'audio' },
];

export function Timeline({ project }: { project: Project }) {
  const { state, layout, select, setTool, setPlayhead, toggleTrack, openMenu, closeMenu } = project;
  const rootRef = useRef<HTMLElement>(null);
  const startDrag = useDrag();
  const hid = state.hidden;
  const tlWidth = (Math.ceil(layout.seqEnd) + 2) * PPS + 20;

  const onContextMenu = (kind: 'clip' | 'audio', id: ClipId) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const root = rootRef.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    const left = Math.max(8, Math.min(e.clientX - r.left + 4, root.offsetWidth - 244));
    const top = Math.max(8, Math.min(e.clientY - r.top + 4, root.offsetHeight - 290));
    openMenu({ kind, id, left, top });
  };

  // Press anywhere on the ruler to jump the playhead there, then drag to scrub.
  const onRulerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const left = e.currentTarget.getBoundingClientRect().left;
    const seek = (clientX: number) => setPlayhead(Math.max(0, Math.min(layout.seqEnd, (clientX - left) / PPS)));
    const x0 = e.clientX;
    seek(x0);
    startDrag(e, (dx) => seek(x0 + dx));
  };

  const ticks = [];
  for (let s = 0; s <= 120; s++) {
    const major = s % 5 === 0;
    ticks.push(
      <div key={s}>
        <div className="tick" style={{ left: s * PPS, height: major ? 10 : 5 }} />
        {major && <span className="tick-label" style={{ left: s * PPS + 4 }}>00:{String(s).padStart(2, '0')}</span>}
      </div>,
    );
  }

  const texts = [
    { key: 't1' as const, start: 10, dur: Number(state.text.dur) || 5, label: state.text.content },
    { key: 't2' as const, start: 19, dur: 4, label: state.text2.content },
  ];

  return (
    <section ref={rootRef} className="panel timeline" onClick={closeMenu}>
      <div className="tl-tools">
        <div className="toolbar" role="toolbar" aria-label="Timeline tools">
          {TOOLS.map((o) => (
            <button key={o.k} aria-pressed={state.tool === o.k} title={`${o.label} · ${o.key}`} onClick={() => setTool(o.k)}>
              {o.icon}
              {o.label}<span className="kbd">{o.key}</span>
            </button>
          ))}
        </div>
        <span className="hint">Right-click a clip for more</span>
        <div className="spacer" />
        <button className="ib outlined chip"><Plus size={12} strokeWidth={2.4} />Video track</button>
        <button className="ib outlined chip"><Plus size={12} strokeWidth={2.4} />Audio track</button>
        <button className="ib outlined chip">Fit</button>
      </div>

      <div className="tl-body">
        <div className="track-heads">
          <div style={{ height: 28, borderBottom: '1px solid var(--line)' }} />
          {HEADERS.map((h) => {
            const off = h.type !== 'text' && !!hid[h.key as TrackKey];
            return (
              <div key={h.key} className="track-head" style={{ height: h.h }}>
                <span className="track-head-label"><span>{h.label}</span><span>{h.sub}</span></span>
                {h.type !== 'text' && (
                  <button className="ib" style={{ width: 28, height: 28, color: off ? 'var(--warn)' : 'var(--text-muted)' }}
                    aria-label={`${h.type === 'audio' ? (off ? 'Unmute' : 'Mute') : (off ? 'Show' : 'Hide')} track ${h.label}`}
                    aria-pressed={off} onClick={() => toggleTrack(h.key as TrackKey)}>
                    {h.type === 'video' ? <Eye size={14} /> : <Volume size={14} />}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="tl-scroll">
          <div style={{ position: 'relative', width: tlWidth, minWidth: '100%' }}>
            <div className="ruler" onPointerDown={onRulerDown}>{ticks}</div>

            <div className="track" style={{ height: TEXT_TRACK_H }}>
              {texts.map((x) => (
                <button key={x.key} className="text-clip" style={{ left: x.start * PPS + 1, width: x.dur * PPS - 2 }}
                  aria-label={`Text overlay: ${x.label}`}
                  aria-pressed={state.sel.kind === 'text' && state.sel.id === x.key}
                  onClick={() => select({ kind: 'text', id: x.key })}>
                  <TextT size={12} strokeWidth={2.2} />
                  <span>{x.label}</span>
                </button>
              ))}
            </div>

            <div className="track" style={{ height: VIDEO_TRACK_H, opacity: hid.V2 ? 0.35 : 1 }}>
              <VideoClip project={project} id="e" onMenu={onContextMenu('clip', 'e')} />
            </div>
            <div className="track" style={{ height: VIDEO_TRACK_H, opacity: hid.V1 ? 0.35 : 1 }}>
              {MAIN_IDS.map((id) => <VideoClip key={id} project={project} id={id} onMenu={onContextMenu('clip', id)} />)}
              <Transitions project={project} />
            </div>
            <div className="track" style={{ height: AUDIO_TRACK_H, opacity: hid.A1 ? 0.35 : 1 }}>
              {MAIN_IDS.map((id) => <AudioClip key={id} project={project} id={id} onMenu={onContextMenu('audio', id)} />)}
            </div>
            <div className="track" style={{ height: AUDIO_TRACK_H, opacity: hid.A2 ? 0.35 : 1 }}>
              <AudioClip project={project} id="e" onMenu={onContextMenu('audio', 'e')} />
            </div>

            <div className="playhead" style={{ left: state.playhead * PPS }} />
          </div>
        </div>
      </div>

      {state.menu && <ClipMenu project={project} />}
    </section>
  );
}

interface ClipProps {
  project: Project;
  id: ClipId;
  onMenu: (e: MouseEvent) => void;
}

function VideoClip({ project, id, onMenu }: ClipProps) {
  const { state, layout, select } = project;
  const src = SOURCES[id];
  const cs = state.clips[id];
  const l = layout.lay[id];
  const width = (l.ve - l.vs) * PPS - 3;
  const dur = cs.outS - cs.inS;
  const selected = state.sel.kind === 'clip' && state.sel.id === id;
  const partner = state.sel.kind === 'audio' && state.sel.id === id && cs.linked;

  return (
    <button className={'clip' + (partner ? ' partner' : '')}
      style={{ left: l.vs * PPS + 1, width, background: src.tone, cursor: state.tool === 'split' ? 'crosshair' : 'pointer' }}
      aria-label={`Video: ${src.name}, ${dur.toFixed(1)} seconds${cs.linked ? ', linked to audio' : ''}`}
      aria-pressed={selected}
      onClick={() => select({ kind: 'clip', id })}
      onContextMenu={onMenu}>
      <span className="strip" aria-hidden="true">
        {filmstrip(width, src.seed).map((a, i) => <span key={i} style={{ background: `rgba(255,255,255,${a.toFixed(3)})` }} />)}
      </span>
      <span className="clip-label">
        <span>
          {cs.linked && <Link size={11} stroke="#D8DED9" strokeWidth={2.4} style={{ flex: 'none' }} />}
          <span className="name">{src.name}</span>
        </span>
        <span className="mono">{dur.toFixed(1)}s</span>
      </span>
      {selected && (
        <>
          <span className="clip-edge" style={{ left: 0 }}><span /></span>
          <span className="clip-edge" style={{ right: 0 }}><span /></span>
        </>
      )}
    </button>
  );
}

function Transitions({ project }: { project: Project }) {
  const { state, layout, select } = project;
  return (
    <>
      {state.trans.map((tt, i) => {
        const w = tt.type === 'cut' ? 26 : Math.max(26, tt.dur * PPS);
        const at = layout.lay[MAIN_IDS[i]].ve;
        const [from, to] = TRANSITION_BETWEEN[i];
        return (
          <button key={i} className="trans-chip" style={{ left: at * PPS - w / 2, width: w }}
            aria-label={`${TRANSITION_NAMES[tt.type]} transition between ${from} and ${to}`}
            aria-pressed={state.sel.kind === 'trans' && state.sel.id === i}
            onClick={() => select({ kind: 'trans', id: i })}>
            {tt.type === 'crossfade' && <Crossfade size={14} />}
            {tt.type === 'fade' && <FadeBlack size={14} />}
            {tt.type === 'cut' && <CutLine size={14} />}
          </button>
        );
      })}
    </>
  );
}

const f1 = (x: number) => x.toFixed(1);

function AudioClip({ project, id, onMenu }: ClipProps) {
  const { state, layout, select, updateClip } = project;
  const startDrag = useDrag();
  const src = SOURCES[id];
  const cs = state.clips[id];
  const l = layout.lay[id];
  const span = (l.ve - l.vs) || 1;
  const width = (l.ve - l.vs) * PPS - 3;
  const pxs = width / span;
  const selected = state.sel.kind === 'audio' && state.sel.id === id;
  const partner = state.sel.kind === 'clip' && state.sel.id === id && cs.linked;
  const half = (cs.outS - cs.inS) / 2;

  const bars = [];
  for (let k = 0, n = Math.max(0, Math.floor((width - 24) / 4)); k < n; k++) {
    const v = Math.abs(Math.sin(k * 0.61 + src.seed) * Math.cos(k * 0.17 + src.seed * 2.3));
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

  return (
    <div className={'audio-clip' + (selected ? ' selected' : partner ? ' partner' : '') + (cs.linked ? '' : ' unlinked')}
      style={{ left: l.vs * PPS + 1, width }}>
      <button className="audio-wave" style={{ cursor: state.tool === 'split' ? 'crosshair' : 'pointer' }}
        aria-label={`Audio: ${src.name}, volume ${cs.vol}%${cs.muted ? ', muted' : ''}${cs.linked ? '' : ', unlinked'}`}
        aria-pressed={selected}
        onClick={() => select({ kind: 'audio', id })}
        onContextMenu={onMenu}>
        {bars.map((h, i) => (
          <span key={i} style={{ height: h, background: cs.muted ? 'rgba(241,244,240,0.22)' : 'rgba(198,240,191,0.7)' }} />
        ))}
      </button>
      <svg width={f1(fiW)} height={H} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', borderRadius: '8px 0 0 8px' }} aria-hidden="true">
        <path d={`M0,0 L${f1(fiW)},0 Q${f1(ci.cx)},${f1(ci.cy)} 0,${H} Z`} fill="rgba(12,14,13,0.62)" />
        <path d={`M0,${H} Q${f1(ci.cx)},${f1(ci.cy)} ${f1(fiW)},0`} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
      </svg>
      <svg width={f1(foW)} height={H} style={{ position: 'absolute', right: 0, top: 0, pointerEvents: 'none' }} aria-hidden="true">
        <path d={`M0,0 Q${f1(co.cx)},${f1(co.cy)} ${f1(foW)},${H} L${f1(foW)},0 Z`} fill="rgba(12,14,13,0.62)" />
        <path d={`M0,0 Q${f1(co.cx)},${f1(co.cy)} ${f1(foW)},${H}`} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
      </svg>
      {fiW >= 14 && (
        <button className="curve-handle" style={{ left: ciM.x - 9, top: ciM.y - 9 }}
          aria-label={`Fade-in curve ${curveName(cs.curveIn)}, drag up or down to adjust`}
          title="Drag up or down to shape the fade-in curve" onPointerDown={curveDown('curveIn')}>
          <span />
        </button>
      )}
      {foW >= 14 && (
        <button className="curve-handle" style={{ left: width - foW + coM.x - 9, top: coM.y - 9 }}
          aria-label={`Fade-out curve ${curveName(cs.curveOut)}, drag up or down to adjust`}
          title="Drag up or down to shape the fade-out curve" onPointerDown={curveDown('curveOut')}>
          <span />
        </button>
      )}
      <span className="audio-badge">
        {!cs.linked && <span className="unlinked">unlinked</span>}
        {cs.muted && <Mute size={11} stroke="var(--warn)" strokeWidth={2.4} />}
        {cs.vol}%
      </span>
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
    </div>
  );
}

function ClipMenu({ project }: { project: Project }) {
  const { state, updateClip, closeMenu } = project;
  const m = state.menu!;
  const cs = state.clips[m.id];
  const label = `${m.kind === 'audio' ? 'Audio' : 'Video'} · ${SOURCES[m.id].name}`;
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
      <button role="menuitem" className="ib" onClick={act(() => updateClip(m.id, { linked: !cs.linked }))}>
        {cs.linked ? <Unlink size={14} stroke="var(--warn)" /> : <Link size={14} stroke="var(--accent)" />}
        <span>{cs.linked ? 'Unlink audio and video' : 'Link audio and video'}</span><span className="kbd">Ctrl L</span>
      </button>
      <button role="menuitem" className="ib" onClick={act(() => updateClip(m.id, { muted: !cs.muted }))}>
        <Mute size={14} stroke="#C8CEC9" /><span>{cs.muted ? 'Unmute audio' : 'Mute audio'}</span><span className="kbd">M</span>
      </button>
      <div className="menu-sep" />
      <button role="menuitem" className="ib danger" onClick={act()}>
        <Trash size={14} /><span>Delete</span><span className="kbd">Del</span>
      </button>
    </div>
  );
}
