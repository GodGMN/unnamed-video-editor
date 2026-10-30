import { MAIN_IDS, SOURCES, TRANSITION_BETWEEN, TRANSITION_HELP, TRANSITION_NAMES, curveName, fmtTime } from '../editor/model';
import type { ClipId, ClipState, FitMode, TextAnchor, TransitionType } from '../editor/model';
import type { Project } from '../editor/useProject';
import { Mute, Waveform } from './icons';
import { NumberField } from './NumberField';
import { Slider } from './Slider';

interface Props {
  project: Project;
  clipId: ClipId;
}

const TITLES = { clip: 'Video clip', audio: 'Audio clip', trans: 'Transition', text: 'Text overlay' } as const;

export function PropertiesPanel({ project, clipId }: Props) {
  const kind = project.state.sel.kind;
  return (
    <aside className="panel props">
      <div className="props-head"><span className="panel-title">{TITLES[kind]}</span></div>
      {kind === 'clip' && <VideoClipProps project={project} id={clipId} />}
      {kind === 'audio' && <AudioClipProps project={project} id={clipId} />}
      {kind === 'trans' && <TransitionProps project={project} />}
      {kind === 'text' && <TextProps project={project} />}
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="stat"><span>{label}</span><span>{value}</span></div>;
}

/** Fade readout: length up top, curve shape underneath. */
function FadeStat({ label, len, curve }: { label: string; len: number; curve: number }) {
  const [shape, amount] = curveName(curve).split(' ');
  return (
    <div className="stat fade-stat">
      <span>{label}</span>
      <span className="fade-stat-len">{len > 0 ? `${len.toFixed(1)} s` : 'Off'}</span>
      <span className="fade-stat-curve">
        <span style={{ textTransform: 'capitalize' }}>{shape}</span>
        {amount && <span className="mono">{amount}</span>}
      </span>
    </div>
  );
}

function VideoClipProps({ project, id }: { project: Project; id: ClipId }) {
  const { state, layout, updateClip } = project;
  const src = SOURCES[id];
  const cs = state.clips[id];
  const inf = src.info;
  const upd = (patch: Partial<ClipState>) => updateClip(id, patch);
  const num = (k: 'x' | 'y') => (v: number) => upd({ [k]: v, fit: 'custom' });
  const crop = (k: 'cropT' | 'cropR' | 'cropB' | 'cropL') => (v: number) => upd({ [k]: v });
  const cropPct = (v: number, of: number) => (v / of * 100).toFixed(1) + '%';
  const fits: [FitMode, string][] = [['fit', 'Fit'], ['fill', 'Fill'], ['custom', 'Custom']];
  const dur = cs.outS - cs.inS;

  return (
    <div className="props-body">
      <div className="props-clip">
        <div className="props-swatch" style={{ background: src.tone }} />
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="media-name" style={{ fontSize: 13 }}>{src.name}</span>
          <span className="hint" style={{ lineHeight: 1.4 }}>Starts at {fmtTime(layout.lay[id].start)} on the timeline</span>
        </div>
      </div>

      <div className="props-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="eyebrow">Position &amp; scale</span>
          <button className="ib" style={{ height: 26, padding: '0 8px', fontSize: 11, color: 'var(--text-dim)' }}
            onClick={() => upd({ fit: 'fit', x: 0, y: 0, scale: 100, rot: 0, cropT: 0, cropR: 0, cropB: 0, cropL: 0 })}>
            Reset
          </button>
        </div>
        <div className="seg" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }} role="group" aria-label="Frame fit">
          {fits.map(([k, label]) => (
            <button key={k} aria-pressed={cs.fit === k}
              onClick={() => upd(k === 'custom' ? { fit: 'custom' } : { fit: k, x: 0, y: 0, scale: 100, rot: 0 })}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <NumberField lead="X" unit="px" aria-label="X position" value={cs.x} onChange={num('x')} />
          <NumberField lead="Y" unit="px" aria-label="Y position" value={cs.y} onChange={num('y')} />
        </div>
        <Slider label="Scale" value={cs.scale} unit="%" min={25} max={300} onChange={(v) => upd({ scale: v, fit: 'custom' })} />
        <Slider label="Rotation" value={cs.rot} unit="°" min={-180} max={180} onChange={(v) => upd({ rot: v, fit: 'custom' })} />
      </div>

      <div className="props-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="eyebrow">Crop</span>
          <span className="hint">px of source</span>
        </div>
        <div className="crop-grid">
          <span />
          <label>Top<NumberField min={0} step={2} value={cs.cropT} onChange={crop('cropT')} /></label>
          <span />
          <label>Left<NumberField min={0} step={2} value={cs.cropL} onChange={crop('cropL')} /></label>
          <div style={{ position: 'relative', width: '100%', maxWidth: 112, aspectRatio: '16 / 9', background: src.tone, borderRadius: 4, overflow: 'hidden' }} aria-hidden="true">
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(12,14,13,0.7)' }} />
            <div style={{
              position: 'absolute', background: src.tone, outline: '1.5px solid var(--accent)',
              top: cropPct(cs.cropT, inf.h), right: cropPct(cs.cropR, inf.w), bottom: cropPct(cs.cropB, inf.h), left: cropPct(cs.cropL, inf.w),
            }} />
          </div>
          <label>Right<NumberField min={0} step={2} value={cs.cropR} onChange={crop('cropR')} /></label>
          <span />
          <label>Bottom<NumberField min={0} step={2} value={cs.cropB} onChange={crop('cropB')} /></label>
          <span />
        </div>
      </div>

      <div className="props-section" style={{ gap: 10 }}>
        <span className="eyebrow">Timing</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <Stat label="In" value={fmtTime(cs.inS)} />
          <Stat label="Out" value={fmtTime(cs.outS)} />
          <Stat label="Length" value={dur.toFixed(2) + ' s'} />
        </div>
      </div>

      <div className="props-section" style={{ gap: 8 }}>
        <span className="eyebrow">Source info</span>
        <dl className="info-list">
          {[
            ['File', src.name], ['Container', inf.container], ['Video', inf.video], ['Resolution', `${inf.w}×${inf.h}`],
            ['Frame rate', inf.fps], ['Bitrate', inf.rate], ['Audio', inf.audio], ['Duration', fmtTime(src.src)], ['Size', inf.size],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function AudioClipProps({ project, id }: { project: Project; id: ClipId }) {
  const { state, updateClip } = project;
  const src = SOURCES[id];
  const cs = state.clips[id];
  return (
    <div className="props-body">
      <div className="props-clip">
        <div className="props-swatch" style={{ background: '#22302A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Waveform stroke="var(--accent)" />
        </div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="media-name" style={{ fontSize: 13 }}>{src.name}</span>
          <span className="hint" style={{ lineHeight: 1.4 }}>{src.info.audio}</span>
        </div>
      </div>
      <div className="props-section" style={{ paddingTop: 4, borderTop: 0, borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="eyebrow">Level</span>
          <button className="ib outlined" style={{ height: 28, padding: '0 9px', fontSize: 12, color: cs.muted ? 'var(--warn)' : 'var(--text-soft)' }}
            aria-pressed={cs.muted} onClick={() => updateClip(id, { muted: !cs.muted })}>
            <Mute size={13} />
            {cs.muted ? 'Muted' : 'Mute'}
          </button>
        </div>
        <Slider label="Volume" value={cs.vol} unit="%" min={0} max={200} onChange={(v) => updateClip(id, { vol: v })} />
      </div>
      <div className="props-section" style={{ borderTop: 0, gap: 10, paddingTop: 14 }}>
        <span className="eyebrow">Fades</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <FadeStat label="Fade in" len={cs.fadeIn} curve={cs.curveIn} />
          <FadeStat label="Fade out" len={cs.fadeOut} curve={cs.curveOut} />
        </div>
        <span className="hint">Drag the corner handles on the audio clip to set length, and the round handle on each ramp up or down to shape its curve.</span>
      </div>
    </div>
  );
}

function TransitionProps({ project }: { project: Project }) {
  const { state, updateTransition } = project;
  const i = state.sel.kind === 'trans' ? state.sel.id : 0;
  const tr = state.trans[i];
  const [from, to] = TRANSITION_BETWEEN[i] ?? [SOURCES[MAIN_IDS[i]].name, SOURCES[MAIN_IDS[i + 1]].name];
  const types: TransitionType[] = ['cut', 'fade', 'crossfade'];
  return (
    <div className="props-body" style={{ padding: 14, gap: 16 }}>
      <span style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'pre' }}>{from}  →  {to}</span>
      <div className="seg" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }} role="group" aria-label="Transition type">
        {types.map((k) => (
          <button key={k} style={{ height: 32 }} aria-pressed={tr.type === k} onClick={() => updateTransition(i, { type: k })}>
            {TRANSITION_NAMES[k]}
          </button>
        ))}
      </div>
      <span className="hint" style={{ fontSize: 12 }}>{TRANSITION_HELP[tr.type]}</span>
      {tr.type !== 'cut' && (
        <Slider label="Duration" value={tr.dur} unit=" s" min={0.1} max={2} step={0.1} onChange={(v) => updateTransition(i, { dur: v })} />
      )}
    </div>
  );
}

const SWATCHES = [['White', '#FFFFFF'], ['Ink', '#171918'], ['Sand', '#F2D7A6'], ['Coral', '#F0907A'], ['Accent', '#C6F0BF']] as const;
const V_NAMES = { t: 'Top', c: 'Middle', b: 'Bottom' } as const;
const H_NAMES = { l: 'left', c: 'center', r: 'right' } as const;

function TextProps({ project }: { project: Project }) {
  const { state, updateText } = project;
  const tx = state.text;
  return (
    <div className="props-body" style={{ padding: 14, gap: 14 }}>
      <label className="field-label" style={{ gap: 6 }}>Text
        <textarea
          style={{ background: 'var(--inset)', border: '1px solid var(--control)', borderRadius: 8, color: 'var(--text)', font: '500 13px var(--sans)', padding: '8px 10px', minHeight: 64, resize: 'vertical' }}
          value={tx.content} onChange={(e) => updateText({ content: e.target.value })} />
      </label>
      <Slider label="Font size" value={tx.size} unit=" px" min={24} max={160} step={2} onChange={(v) => updateText({ size: v })} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Color</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {SWATCHES.map(([name, hex]) => (
            <button key={name} className="swatch" style={{ background: hex }} aria-label={name}
              aria-pressed={tx.color === hex} onClick={() => updateText({ color: hex })} />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Position</span>
        <div className="anchor-grid" role="group" aria-label="Text position">
          {(['t', 'c', 'b'] as const).flatMap((v) => (['l', 'c', 'r'] as const).map((h) => {
            const k: TextAnchor = `${v}${h}`;
            return (
              <button key={k} aria-label={`${V_NAMES[v]} ${H_NAMES[h]}`} aria-pressed={tx.pos === k} onClick={() => updateText({ pos: k })}>
                <span />
              </button>
            );
          }))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <label className="field-label">Starts at<input className="fld" type="text" value={tx.start} onChange={(e) => updateText({ start: e.target.value })} /></label>
        <label className="field-label">Duration (s)<NumberField min={0.5} step={0.5} value={tx.dur} onChange={(dur) => updateText({ dur })} /></label>
      </div>
    </div>
  );
}
