import type { MouseEvent, PointerEvent, ReactNode } from 'react';
import { useRef } from 'react';
import { DEFAULT_TRANSITION, MISSING_MEDIA, PPS, TRANSITION_NAMES, audioFor, curveName, filmstrip, findClip, partnersOf } from '../editor/model';
import type { AudioClip, Tool, Track, VideoClip } from '../editor/model';
import type { Editor } from '../editor/useProject';
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

const TRACK_H = { text: TEXT_TRACK_H, video: VIDEO_TRACK_H, audio: AUDIO_TRACK_H };

const isOff = (t: Track) => (t.kind === 'audio' ? t.muted : t.hidden);

export function Timeline({ editor }: { editor: Editor }) {
  const { project, ui, layout, select, setTool, setPlayhead, toggleTrack, openMenu, closeMenu } = editor;
  const rootRef = useRef<HTMLElement>(null);
  const startDrag = useDrag();
  const tlWidth = (Math.ceil(layout.end) + 2) * PPS + 20;

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

  // Press anywhere on the ruler to jump the playhead there, then drag to scrub.
  const onRulerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const left = e.currentTarget.getBoundingClientRect().left;
    const seek = (clientX: number) => setPlayhead(Math.max(0, Math.min(layout.end, (clientX - left) / PPS)));
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

        <div className="tl-scroll">
          <div style={{ position: 'relative', width: tlWidth, minWidth: '100%' }}>
            <div className="ruler" onPointerDown={onRulerDown}>{ticks}</div>

            {project.tracks.map((t) => (
              <div key={t.id} className="track" style={{ height: TRACK_H[t.kind], opacity: t.kind !== 'text' && isOff(t) ? 0.35 : 1 }}>
                {t.kind === 'text' && t.items.map((x) => (
                  <button key={x.id} className="text-clip" style={{ left: x.start * PPS + 1, width: x.duration * PPS - 2 }}
                    aria-label={`Text overlay: ${x.content}`}
                    aria-pressed={ui.sel?.kind === 'text' && ui.sel.id === x.id}
                    onClick={() => select({ kind: 'text', id: x.id })}>
                    <TextT size={12} strokeWidth={2.2} />
                    <span>{x.content}</span>
                  </button>
                ))}
                {t.kind === 'video' && (
                  <>
                    {t.clips.map((c) => <VideoClipView key={c.id} editor={editor} clip={c} onMenu={onContextMenu('clip', c.id)} />)}
                    <Transitions editor={editor} clips={t.clips} />
                  </>
                )}
                {t.kind === 'audio' && t.clips.map((c) => (
                  <AudioClipView key={c.id} editor={editor} clip={c} onMenu={onContextMenu('audio', c.id)} />
                ))}
              </div>
            ))}

            <div className="playhead" style={{ left: ui.playhead * PPS }} />
          </div>
        </div>
      </div>

      {ui.menu && <ClipMenu editor={editor} />}
    </section>
  );
}

interface ClipProps<C> {
  editor: Editor;
  clip: C;
  onMenu: (e: MouseEvent) => void;
}

/** Whether the selection is a linked partner of `clip` (of the given selection kind). */
function partnerSelected({ project, ui }: Editor, clip: VideoClip | AudioClip, kind: 'clip' | 'audio') {
  const sel = ui.sel;
  return !!sel && sel.kind === kind && clip.linked && clip.linkId !== null && findClip(project, sel.id)?.clip.linkId === clip.linkId;
}

function VideoClipView({ editor, clip: cs, onMenu }: ClipProps<VideoClip>) {
  const { project, ui, layout, select } = editor;
  const id = cs.id;
  const src = project.media[cs.mediaId] ?? MISSING_MEDIA;
  const l = layout.clips[id];
  const width = (l.ve - l.vs) * PPS - 3;
  const dur = cs.outS - cs.inS;
  const selected = ui.sel?.kind === 'clip' && ui.sel.id === id;
  const partner = partnerSelected(editor, cs, 'audio');

  return (
    <button className={'clip' + (partner ? ' partner' : '')}
      style={{ left: l.vs * PPS + 1, width, background: src.tone, cursor: ui.tool === 'split' ? 'crosshair' : 'pointer' }}
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

/** A chip on every boundary between adjacent clips. */
function Transitions({ editor, clips }: { editor: Editor; clips: VideoClip[] }) {
  const { ui, layout, select } = editor;
  return (
    <>
      {clips.map((c) => {
        const l = layout.clips[c.id];
        if (!l.nextId) return null;
        const tt = c.transitionOut ?? DEFAULT_TRANSITION;
        const w = tt.type === 'cut' ? 26 : Math.max(26, tt.duration * PPS);
        return (
          <button key={c.id} className="trans-chip" style={{ left: l.ve * PPS - w / 2, width: w }}
            aria-label={`${TRANSITION_NAMES[tt.type]} transition between ${l.name} and ${layout.clips[l.nextId].name}`}
            aria-pressed={ui.sel?.kind === 'trans' && ui.sel.id === c.id}
            onClick={() => select({ kind: 'trans', id: c.id })}>
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

function AudioClipView({ editor, clip: cs, onMenu }: ClipProps<AudioClip>) {
  const { project, ui, layout, select, updateAudioClip: updateClip } = editor;
  const startDrag = useDrag();
  const id = cs.id;
  const src = project.media[cs.mediaId] ?? MISSING_MEDIA;
  const l = layout.clips[id];
  const span = (l.ve - l.vs) || 1;
  const width = (l.ve - l.vs) * PPS - 3;
  const pxs = width / span;
  const selected = ui.sel?.kind === 'audio' && ui.sel.id === id;
  const partner = partnerSelected(editor, cs, 'clip');
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
      <button className="audio-wave" style={{ cursor: ui.tool === 'split' ? 'crosshair' : 'pointer' }}
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
      <span className="audio-badge">
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
  const { project, ui, updateVideoClip, updateAudioClip, closeMenu } = editor;
  const m = ui.menu!;
  const found = findClip(project, m.id);
  if (!found) return null;
  const cs = found.clip;
  const audio = audioFor(project, m.id);
  const label = `${m.kind === 'audio' ? 'Audio' : 'Video'} · ${(project.media[cs.mediaId] ?? MISSING_MEDIA).name}`;
  const canLink = cs.linkId !== null && partnersOf(project, cs).length > 0;
  const updateClip = m.kind === 'audio' ? updateAudioClip : updateVideoClip;
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
      {canLink && (
        <button role="menuitem" className="ib" onClick={act(() => updateClip(m.id, { linked: !cs.linked }))}>
          {cs.linked ? <Unlink size={14} stroke="var(--warn)" /> : <Link size={14} stroke="var(--accent)" />}
          <span>{cs.linked ? 'Unlink audio and video' : 'Link audio and video'}</span><span className="kbd">Ctrl L</span>
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
