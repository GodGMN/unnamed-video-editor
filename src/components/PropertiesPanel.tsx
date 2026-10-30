import { useT } from '../i18n';
import { t as translate, formatNumber } from '../i18n/core';
import type { CSSProperties } from 'react';
import { useRef, useState } from 'react';
import { AUDIO_CLIP_DEFAULTS, DEFAULT_TRANSITION, GAIN_MAX_DB, GAIN_MIN_DB, dbToFader, faderToDb, fmtDb, MISSING_MEDIA, NO_KEY, VIDEO_CLIP_DEFAULTS, TRANSITION_HELP, TRANSITION_NAMES, curveName, findAudioClip, findTextClip, findVideoClip, fmtAudio, fmtBitrate, fmtFps, fmtSize, fmtTime, codecName, parseTime } from '../editor/model';
import type { AudioClip, ChromaKey, Fades, FitMode, TextAnchor, TextClip, TransitionType, VideoClip } from '../editor/model';
import type { Editor } from '../editor/useProject';
import { Dropper, Mute, Waveform } from './icons';
import { ColorPopover, HexField } from './ColorPicker';
import { NumberField } from './NumberField';
import { Slider } from './Slider';

const TITLES = () => ({ clip: translate('videoClip'), audio: translate('audioClip'), trans: translate('transition'), text: translate('textOverlay') } as const);

export function PropertiesPanel({ editor }: { editor: Editor }) {
  useT();
  const { project, ui } = editor;
  const sel = ui.sel;
  const video = sel?.kind === 'clip' || sel?.kind === 'trans' ? findVideoClip(project, sel.id) : null;
  const audio = sel?.kind === 'audio' ? findAudioClip(project, sel.id) : null;
  const text = sel?.kind === 'text' ? findTextClip(project, sel.id) : null;
  return (
    <aside className="panel props">
      <div className="props-head"><span className="panel-title">{sel ? TITLES()[sel.kind] : translate('properties')}</span></div>
      {sel?.kind === 'clip' && video && <VideoClipProps editor={editor} clip={video} />}
      {audio && <AudioClipProps editor={editor} clip={audio} />}
      {sel?.kind === 'trans' && video && <TransitionProps editor={editor} clip={video} />}
      {text && <TextProps editor={editor} item={text} />}
    </aside>
  );
}


function Stat({ label, value }: { label: string; value: string }) {
  useT();
  return <div className="stat"><span>{label}</span><span>{value}</span></div>;
}

/** Fade readout: length up top, curve shape underneath. */
function FadeStat({ label, len, curve }: { label: string; len: number; curve: number }) {
  useT();
  const [shape, amount] = curveName(curve).split(' ');
  return (
    <div className="stat fade-stat">
      <span>{label}</span>
      <span className="fade-stat-len">{len > 0 ? translate('s2', { value1: formatNumber(len, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }) : translate('off')}</span>
      <span className="fade-stat-curve">
        <span style={{ textTransform: 'capitalize' }}>{shape}</span>
        {amount && <span className="mono">{amount}</span>}
      </span>
    </div>
  );
}

/** Fade readouts for a clip; the lengths and curves are set on the timeline. */
function FadesSection({ clip: cs, what, style }: { clip: Fades; what: 'video' | 'audio'; style?: CSSProperties }) {
  useT();
  return (
    <div className="props-section" style={{ gap: 10, ...style }}>
      <span className="eyebrow">{translate('fades')}</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <FadeStat label={translate('fadeIn')} len={cs.fadeIn} curve={cs.curveIn} />
        <FadeStat label={translate('fadeOut')} len={cs.fadeOut} curve={cs.curveOut} />
      </div>
      <span className="hint">{translate('dragTheCornerHandlesOnTheClipToSetLength', { value1: translate(what === 'audio' ? 'audioKind' : 'videoKind') })}</span>
    </div>
  );
}

function VideoClipProps({ editor, clip: cs }: { editor: Editor; clip: VideoClip }) {
  useT();
  const { project, layout, updateVideoClip } = editor;
  const id = cs.id;
  const src = project.media[cs.mediaId] ?? MISSING_MEDIA;
  const inf = src.video ?? { codec: '', width: project.output.width, height: project.output.height, fps: 0 };
  const upd = (patch: Partial<VideoClip>) => updateVideoClip(id, patch);
  const num = (k: 'x' | 'y') => (v: number) => upd({ [k]: v, fit: 'custom' });
  const crop = (k: 'cropT' | 'cropR' | 'cropB' | 'cropL') => (v: number) => upd({ [k]: v });
  const cropPct = (v: number, of: number) => (v / of * 100).toFixed(1) + '%';
  const fits: [FitMode, string][] = [['fit', translate('fit')], ['fill', translate('fill')], ['custom', translate('custom')]];
  const dur = cs.outS - cs.inS;

  return (
    <div className="props-body">
      <div className="props-clip">
        <div className="props-swatch" style={{ background: src.tone }} />
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="media-name" style={{ fontSize: 13 }}>{src.name}</span>
          <span className="hint" style={{ lineHeight: 1.4 }}>{translate('startsAtOnTheTimeline', { value1: fmtTime(layout.clips[id].start) })}</span>
        </div>
      </div>

      <div className="props-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="eyebrow">{translate('positionScale')}</span>
          <button className="ib" style={{ ['--h' as string]: '26px', padding: '0 8px', fontSize: 11, color: 'var(--text-dim)' }}
            onClick={() => upd({ fit: 'fit', x: 0, y: 0, scale: 100, rot: 0, cropT: 0, cropR: 0, cropB: 0, cropL: 0 })}>
            {translate('reset')}</button>
        </div>
        <div className="seg" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }} role="group" aria-label={translate('frameFit')}>
          {fits.map(([k, label]) => (
            <button key={k} aria-pressed={cs.fit === k}
              onClick={() => upd(k === 'custom' ? { fit: 'custom' } : { fit: k, x: 0, y: 0, scale: 100, rot: 0 })}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <NumberField lead={"X"} unit={"px"} aria-label={translate('xPosition')} value={cs.x} defaultValue={VIDEO_CLIP_DEFAULTS.x} onChange={num('x')} />
          <NumberField lead={"Y"} unit={"px"} aria-label={translate('yPosition')} value={cs.y} defaultValue={VIDEO_CLIP_DEFAULTS.y} onChange={num('y')} />
        </div>
        <Slider label={translate('scale')} value={cs.scale} unit={'%'} defaultValue={VIDEO_CLIP_DEFAULTS.scale} min={25} max={300} onChange={(v) => upd({ scale: v, fit: 'custom' })} />
        <Slider label={translate('rotation')} value={cs.rot} unit={"°"} defaultValue={VIDEO_CLIP_DEFAULTS.rot} min={-180} max={180} onChange={(v) => upd({ rot: v, fit: 'custom' })} />
      </div>

      <div className="props-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="eyebrow">{translate('crop')}</span>
          <span className="hint">{translate('pxOfSource')}</span>
        </div>
        <div className="crop-grid">
          <span />
          <label>{translate('top')}<NumberField min={0} step={2} value={cs.cropT} defaultValue={VIDEO_CLIP_DEFAULTS.cropT} onChange={crop('cropT')} /></label>
          <span />
          <label>{translate('left')}<NumberField min={0} step={2} value={cs.cropL} defaultValue={VIDEO_CLIP_DEFAULTS.cropL} onChange={crop('cropL')} /></label>
          <div style={{ position: 'relative', width: '100%', maxWidth: 112, aspectRatio: '16 / 9', background: src.tone, borderRadius: 'calc(var(--corner) * 900% / 16) / calc(var(--corner) * 100%)', overflow: 'hidden' }} aria-hidden="true">
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(12,14,13,0.7)' }} />
            <div style={{
              position: 'absolute', background: src.tone, outline: '1.5px solid var(--accent)',
              top: cropPct(cs.cropT, inf.height), right: cropPct(cs.cropR, inf.width), bottom: cropPct(cs.cropB, inf.height), left: cropPct(cs.cropL, inf.width),
            }} />
          </div>
          <label>{translate('right')}<NumberField min={0} step={2} value={cs.cropR} defaultValue={VIDEO_CLIP_DEFAULTS.cropR} onChange={crop('cropR')} /></label>
          <span />
          <label>{translate('bottom')}<NumberField min={0} step={2} value={cs.cropB} defaultValue={VIDEO_CLIP_DEFAULTS.cropB} onChange={crop('cropB')} /></label>
          <span />
        </div>
      </div>

      <KeySection editor={editor} clip={cs} />

      <FadesSection clip={cs} what={'video'} />

      <div className="props-section" style={{ gap: 10 }}>
        <span className="eyebrow">{translate('timing')}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {src.still ? <>
            <Stat label={translate('start')} value={fmtTime(cs.start)} />
            <Stat label={translate('end')} value={fmtTime(cs.start + dur)} />
          </> : <>
            <Stat label={translate('in')} value={fmtTime(cs.inS)} />
            <Stat label={translate('out')} value={fmtTime(cs.outS)} />
          </>}
          <Stat label={translate('length')} value={formatNumber(dur, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' s'} />
        </div>
      </div>

      <div className="props-section" style={{ gap: 8 }}>
        <span className="eyebrow">{translate('sourceInfo')}</span>
        <dl className="info-list">
          {(src.still ? [
            [translate('file2'), src.name], [translate('format'), `${src.container} ${src.animation ? translate('uiAnimation') : translate('uiImage')}`], [translate('resolution'), `${inf.width}×${inf.height}`],
            ...(src.animation ? [[translate('loop'), translate('sFrames', { value1: formatNumber(src.animation, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), value2: Math.round(src.animation * inf.fps) })]] : []), [translate('size'), fmtSize(src.size)],
          ] : [
            [translate('file2'), src.name], [translate('container'), src.container], [translate('video2'), src.video ? codecName(src.video.codec) : '—'],
            [translate('resolution'), src.video ? `${inf.width}×${inf.height}` : '—'], [translate('frameRate'), src.video ? fmtFps(inf.fps) : '—'],
            [translate('bitrate'), fmtBitrate(src.bitrate)], [translate('audio2'), src.audio ? fmtAudio(src.audio) : translate('none')],
            [translate('duration'), fmtTime(src.duration)], [translate('size'), fmtSize(src.size)],
          ]).map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** Chroma key: removes one colour so the tracks underneath show through. */
function KeySection({ editor, clip: cs }: { editor: Editor; clip: VideoClip }) {
  useT();
  const { ui, pickKey, updateVideoClip } = editor;
  const key = cs.key;
  const set = (patch: Partial<ChromaKey>) => updateVideoClip(cs.id, { key: { ...key, ...patch } });
  const swatch = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const picking = ui.keyPick === cs.id;
  return (
    <div className="props-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="eyebrow">{translate('key')}</span>
        <button className="ib outlined" style={{ ['--h' as string]: '26px', padding: '0 9px', fontSize: 11, color: key.enabled ? 'var(--accent)' : 'var(--text-dim)' }}
          aria-pressed={key.enabled} onClick={() => set({ enabled: !key.enabled })}>
          {key.enabled ? translate('on2') : translate('off')}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button ref={swatch} className="swatch" style={{ background: key.color, flex: 'none' }} aria-label={translate('keyColor')} title={translate('editTheKeyColor')}
          aria-expanded={editing} onClick={() => setEditing((v) => !v)} />
        <HexField value={key.color} onChange={(color) => set({ color, enabled: true })} style={{ flex: '1 1 0', minWidth: 0 }} />
        <button className="ib outlined" style={{ ['--h' as string]: '30px', padding: '0 10px', fontSize: 12, flex: 'none', color: picking ? 'var(--accent)' : 'var(--text-soft)' }}
          aria-pressed={picking} onClick={() => pickKey(picking ? null : cs.id)} title={translate('clickAColourOnThisClipInThePreview')}>
          <Dropper size={13} />
          {picking ? translate('picking') : translate('pick')}
        </button>
      </div>
      {editing && <ColorPopover anchor={swatch} value={key.color} onChange={(color) => set({ color, enabled: true })} onClose={() => setEditing(false)} />}
      <Slider label={translate('tolerance')} value={key.tolerance} unit={'%'} defaultValue={NO_KEY.tolerance} min={0} max={100} onChange={(v) => set({ tolerance: v })} />
      <Slider label={translate('softness')} value={key.softness} unit={'%'} defaultValue={NO_KEY.softness} min={0} max={100} onChange={(v) => set({ softness: v })} />
      <Slider label={translate('spill')} value={key.spill} unit={'%'} defaultValue={NO_KEY.spill} min={0} max={100} onChange={(v) => set({ spill: v })} />
      <span className="hint">{translate('pickAColourFromThePreviewToMakeIt')}</span>
    </div>
  );
}

function AudioClipProps({ editor, clip: cs }: { editor: Editor; clip: AudioClip }) {
  useT();
  const { project, updateAudioClip: updateClip } = editor;
  const id = cs.id;
  const src = project.media[cs.mediaId] ?? MISSING_MEDIA;
  return (
    <div className="props-body">
      <div className="props-clip">
        <div className="props-swatch" style={{ background: '#22302A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Waveform stroke='var(--accent)' />
        </div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="media-name" style={{ fontSize: 13 }}>{src.name}</span>
          <span className="hint" style={{ lineHeight: 1.4 }}>{src.audio ? fmtAudio(src.audio) : translate('noAudio')}</span>
        </div>
      </div>
      <div className="props-section" style={{ paddingTop: 4, borderTop: 0, borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="eyebrow">{translate('level')}</span>
          <button className="ib outlined" style={{ ['--h' as string]: '28px', padding: '0 9px', fontSize: 12, color: cs.muted ? 'var(--warn)' : 'var(--text-soft)' }}
            aria-pressed={cs.muted} onClick={() => updateClip(id, { muted: !cs.muted })}>
            <Mute size={13} />
            {cs.muted ? translate('muted') : translate('mute')}
          </button>
        </div>
        <Slider label={translate('volume')} value={cs.gainDb} unit={"dB"} defaultValue={AUDIO_CLIP_DEFAULTS.gainDb} min={GAIN_MIN_DB} max={GAIN_MAX_DB}
          taper={{ toPos: dbToFader, fromPos: faderToDb }} format={fmtDb} onChange={(v) => updateClip(id, { gainDb: Math.round(v * 10) / 10 })} />
      </div>
      <FadesSection clip={cs} what={'audio'} style={{ borderTop: 0, paddingTop: 14 }} />
    </div>
  );
}

function TransitionProps({ editor, clip }: { editor: Editor; clip: VideoClip }) {
  useT();
  const { layout, updateTransition } = editor;
  const tr = clip.transitionOut ?? DEFAULT_TRANSITION;
  const l = layout.clips[clip.id];
  const from = l.name;
  const to = l.nextId ? layout.clips[l.nextId].name : '—';
  const set = (patch: Parameters<typeof updateTransition>[1]) => updateTransition(clip.id, patch);
  const types: TransitionType[] = ['cut', 'fade', 'crossfade'];
  return (
    <div className="props-body" style={{ padding: 14, gap: 16 }}>
      <span style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'pre' }}>{from}  →  {to}</span>
      <div className="seg" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }} role="group" aria-label={translate('transitionType')}>
        {types.map((k) => (
          <button key={k} style={{ height: 32 }} aria-pressed={tr.type === k} onClick={() => set({ type: k })}>
            {TRANSITION_NAMES[k]}
          </button>
        ))}
      </div>
      <span className="hint" style={{ fontSize: 12 }}>{TRANSITION_HELP[tr.type]}</span>
      <span className="hint">{translate('overlapSDragTheClipsToAdjust', { value1: l.nextId ? formatNumber(Math.max(0, Math.min(l.end, layout.clips[l.nextId].end) - layout.clips[l.nextId].start), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00' })}</span>
    </div>
  );
}

const SWATCHES = () => ([[translate('white'), '#FFFFFF'], [translate('ink'), '#171918'], [translate('sand'), '#F2D7A6'], [translate('coral'), '#F0907A'], [translate('accent'), '#C6F0BF']] as const);
const V_NAMES = () => ({ t: translate('top'), c: translate('middle'), b: translate('bottom') } as const);
const H_NAMES = { get l() { return translate('leftAnchor'); }, get c() { return translate('centerAnchor'); }, get r() { return translate('rightAnchor'); } } as const;

/** A `mm:ss.xx` text field that commits when the typed text parses as a time. */
function TimeField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  useT();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const v = draft === null ? null : parseTime(draft);
    if (v !== null) onChange(v);
    setDraft(null);
  };
  return (
    <input className="fld" type='text' value={draft ?? fmtTime(value)}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }} />
  );
}

function TextProps({ editor, item: tx }: { editor: Editor; item: TextClip }) {
  useT();
  const updateText = (patch: Partial<TextClip>) => editor.updateText(tx.id, patch);
  const custom = !SWATCHES().some(([, hex]) => hex === tx.color.toUpperCase());
  const pickerAnchor = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);
  return (
    <div className="props-body" style={{ padding: 14, gap: 14 }}>
      <label className="field-label" style={{ gap: 6 }}>{translate('text')}<textarea
          style={{ background: 'var(--inset)', border: '1px solid var(--control)', borderRadius: 'var(--radius-sm)', color: 'var(--text)', font: '500 13px var(--sans)', padding: '8px 10px', minHeight: 64, resize: 'vertical' }}
          value={tx.content} onChange={(e) => updateText({ content: e.target.value })} />
      </label>
      <Slider label={translate('fontSize')} value={tx.size} unit={" px"} min={24} max={160} step={2} onChange={(v) => updateText({ size: v })} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{translate('color')}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {SWATCHES().map(([name, hex]) => (
            <button key={name} className="swatch" style={{ background: hex }} aria-label={name}
              aria-pressed={tx.color.toUpperCase() === hex} onClick={() => updateText({ color: hex })} />
          ))}
          <button ref={pickerAnchor} className="swatch custom" aria-label={translate('customColor')} title={translate('customColor')}
            aria-pressed={custom} aria-expanded={picking} onClick={() => setPicking((v) => !v)}>
            <Dropper size={14} stroke={custom ? tx.color : 'var(--text-soft)'} />
          </button>
        </div>
        {picking && <ColorPopover anchor={pickerAnchor} value={tx.color} onChange={(color) => updateText({ color })} onClose={() => setPicking(false)} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{translate('position')}</span>
          <button className="ib" style={{ ['--h' as string]: '24px', padding: '0 8px', fontSize: 11, color: 'var(--text-dim)' }}
            onClick={() => updateText({ x: 0, y: 0 })} disabled={!tx.x && !tx.y}>
            {translate('resetOffset')}</button>
        </div>
        <div className="anchor-grid" style={{ alignSelf: 'center' }} role="group" aria-label={translate('textPosition')}>
          {(['t', 'c', 'b'] as const).flatMap((v) => (['l', 'c', 'r'] as const).map((h) => {
            const k: TextAnchor = `${v}${h}`;
            return (
              <button key={k} aria-label={`${V_NAMES()[v]} ${H_NAMES[h]}`} aria-pressed={tx.pos === k} onClick={() => updateText({ pos: k, x: 0, y: 0 })}>
                <span />
              </button>
            );
          }))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <NumberField lead={"X"} unit={"px"} aria-label={translate('xOffset')} value={tx.x} defaultValue={0} onChange={(x) => updateText({ x })} />
          <NumberField lead={"Y"} unit={"px"} aria-label={translate('yOffset')} value={tx.y} defaultValue={0} onChange={(y) => updateText({ y })} />
        </div>
        <span className="hint">{translate('offsetInPixelsFromTheChosenAnchor')}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <label className="field-label">{translate('startsAt')}<TimeField value={tx.start} onChange={(start) => updateText({ start })} /></label>
        <label className="field-label">{translate('durationS')}<NumberField min={0.5} step={0.5} value={tx.duration} onChange={(duration) => updateText({ duration })} /></label>
      </div>
    </div>
  );
}
