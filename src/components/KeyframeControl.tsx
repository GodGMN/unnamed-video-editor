import type { ReactNode } from 'react';
import type { Editor } from '../editor/useProject';
import type { VideoClip } from '../editor/model';
import { clipFrame, evaluateVideoClip, keyframeAt, removeKeyframe, saveKeyframe } from '../editor/keyframes';
import type { AnimatedProperty } from '../editor/keyframes';
import { t } from '../i18n/core';
import { KeyframeEasing } from './KeyframeEasing';

export function ClipFrameCounter({ editor, clip }: { editor: Editor; clip: VideoClip }) {
  const fps = editor.project.output.fps;
  const frame = clipFrame(clip, editor.ui.playhead, fps);
  const outside = editor.ui.playhead < clip.start || editor.ui.playhead >= clip.start + clip.outS - clip.inS;
  const seek = (index: number) => { editor.closeSource(); editor.setPlayhead(clip.start + index / fps); };
  return <div className="clip-frame-counter">
    <button className="ib" aria-label={t('previousFrame')} disabled={frame.index === 0 && !outside} onClick={() => seek(Math.max(0, frame.index - 1))}>‹</button>
    <span>{t('clipFrameCounter', { current: frame.index + 1, total: frame.count })}{outside && <small>{t('playheadOutsideClip')}</small>}</span>
    <button className="ib" aria-label={t('nextFrame')} disabled={frame.index === frame.count - 1 && !outside} onClick={() => seek(Math.min(frame.count - 1, frame.index + 1))}>›</button>
  </div>;
}

export function KeyframeControl({ editor, clip, property, label, unit, children }: {
  editor: Editor; clip: VideoClip; property: AnimatedProperty; label: string; unit: string;
  children: ReactNode;
}) {
  const fps = editor.project.output.fps;
  const frame = clipFrame(clip, editor.ui.playhead, fps);
  const keys = clip.keyframes?.[property] ?? [];
  const sourceTime = clip.inS + editor.ui.playhead - clip.start;
  const key = keyframeAt(keys, sourceTime) ?? keyframeAt(keys, frame.sourceTime);
  const keyTime = key?.time ?? frame.sourceTime;
  const outside = editor.ui.playhead < clip.start || editor.ui.playhead >= clip.start + clip.outS - clip.inS;
  const visible = keys.filter(k => k.time >= clip.inS - 1e-6 && k.time < clip.outS - 1e-6);
  const prev = visible.filter(k => k.time < sourceTime - 1e-6).at(-1);
  const next = visible.find(k => k.time > sourceTime + 1e-6);
  const seek = (time: number) => { editor.closeSource(); editor.setPlayhead(clip.start + time - clip.inS); };
  const current = evaluateVideoClip(clip, editor.ui.playhead)[property];
  const toggleLabel = key ? `${t('removeKeyframe')} · ${label}` : t('addPropertyKeyframe', { property: label });
  return <div className="keyframe-control" data-property={property}>
    <span className="keyframe-base-label">{t('baseValue')}</span>
    {children}
    <div className="keyframe-tools">
      <button className="ib" aria-label={t('previousPropertyKeyframe', { property: label })} disabled={!prev} onClick={() => prev && seek(prev.time)}>‹</button>
      <button className={`ib keyframe-diamond${key ? ' saved' : ''}`} disabled={outside}
        aria-label={toggleLabel}
        aria-pressed={!!key}
        title={toggleLabel}
        onClick={() => editor.updateVideoClip(clip.id, { keyframes: key
          ? removeKeyframe(clip, property, keyTime)
          : saveKeyframe(clip, property, keyTime, clip[property]) })}>
        <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M10 2 18 10 10 18 2 10Z" /></svg>
      </button>
      <button className="ib" aria-label={t('nextPropertyKeyframe', { property: label })} disabled={!next} onClick={() => next && seek(next.time)}>›</button>
      <span className="keyframe-current" title={t('valueAtPlayhead')}>{Number(current.toFixed(2))}{unit}</span>
    </div>
    <KeyframeEasing editor={editor} clip={clip} property={property} label={label} keys={keys} sourceTime={key?.time ?? sourceTime} />
  </div>;
}
