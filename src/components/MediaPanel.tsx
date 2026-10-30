import { useT } from '../i18n';
import { t as translate, formatNumber } from '../i18n/core';
import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { codecFamily, fmtShortDuration, videoTracks } from '../editor/model';
import type { Media, Project } from '../editor/model';
import { Convert, Plus, Trash, Warning } from './icons';

import { PreviewStrip } from '../media/PreviewStrip';
import { MEDIA_MIME, mediaDrag } from '../media/drag';

const TRANSITIONS = () => ([
  { type: 'crossfade', name: translate('crossDissolve'), swatch: 'linear-gradient(90deg, #35503F, #4A5B6E)' },
  { type: 'fade', name: translate('fadeToBlack'), swatch: 'linear-gradient(90deg, #35503F, #0B0D0C)' },
]);

interface Props {
  project: Project;
  onConvert: (media: Media) => void;
  /** Imports files into the library. */
  onImport: (files: FileList) => void;
  /** Files still being imported. */
  pending: number;
  /** Imports that failed, as `name: reason`. */
  errors: string[];
  /** The source playing in the preview on its own, if any. */
  previewing: string | null;
  /** Plays a source in the preview on its own. */
  onPreview: (mediaId: string) => void;
  onRemove: (mediaId: string) => void;
}

interface MediaMenu { id: string; left: number; top: number }


/** The one-line summary under a media item's name. */
function mediaMeta(project: Project, m: Media): string {
  const v = m.video;
  if (!m.decodable) return translate('isnTSupportedByThisBrowser', { value1: v ? codecFamily(v.codec) : translate('uiThisFormat') });
  if (!v) return m.audio ? translate('audio', { value1: codecFamily(m.audio.codec) }) : m.container;

  const tracks = videoTracks(project);
  const uses = tracks.flatMap((t) => t.clips.filter((c) => c.mediaId === m.id).map(() => t));
  const { width: ow, height: oh } = project.output;
  const main = tracks.find((t) => t.magnetic);
  const note =
    uses.length > 1 ? translate('usedTimes', { count: uses.length })
    : v.width > ow || v.height > oh ? translate('scaledToOutput')
    : uses.length === 1 && uses[0] !== main ? translate('on', { value1: uses[0].name })
    : m.still ? m.container : codecFamily(v.codec);
  return `${v.width}×${v.height} · ${m.animation ? translate('animated') : m.still ? translate('image') : translate('fps', { value1: Math.round(v.fps) })} · ${note}`;
}

/** How many timeline clips (video and audio) play this source. */
function clipCount(project: Project, mediaId: string): number {
  return project.tracks.reduce((n, t) => n + (t.kind === 'text' ? 0 : t.clips.filter((c) => c.mediaId === mediaId).length), 0);
}

/** Whether a drag carries files from outside the page (not a media item or transition). */
const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files');

export function MediaPanel({ project, onConvert, onImport, pending, errors, onPreview, onRemove, previewing }: Props) {
  useT();
  const [menu, setMenu] = useState<MediaMenu | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
    };
  }, [menu]);
  const [dragOver, setDragOver] = useState(false);
  // dragenter/dragleave fire for every child crossed, so count them.
  const dragDepth = useRef(0);
  const media = Object.values(project.media);
  const input = useRef<HTMLInputElement>(null);

  return (
    <aside className="panel media"
      onDragEnter={(e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current++; setDragOver(true); }}
      onDragOver={(e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDragLeave={(e) => { if (hasFiles(e) && --dragDepth.current === 0) setDragOver(false); }}
      onDrop={(e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current = 0; setDragOver(false); onImport(e.dataTransfer.files); }}>
      {dragOver && <div className="media-drop">{translate('dropToImport')}</div>}
      <div className="media-head">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="panel-title">{translate('media')}</span>
          <span className="count">{media.length}</span>
        </div>
        <input ref={input} type="file" multiple accept="video/*,audio/*,image/*,.mov,.mkv" aria-label={translate('importMediaFiles')} hidden onChange={(e) => { if (e.target.files) onImport(e.target.files); e.target.value = ''; }} />
        <button onClick={() => input.current?.click()} className="ib outlined" style={{ ['--h' as string]: '30px', padding: '0 10px', fontSize: 12, fontWeight: 500 }}>
          <Plus size={13} strokeWidth={2.2} />
          {translate('import')}</button>
      </div>
      <div role="status" aria-live="polite">
        {pending > 0 && <p className="media-meta media-status">{translate('importingFiles', { count: pending })}</p>}
        {errors.map((error, i) => <p key={i} className="media-meta error media-status">{error}</p>)}
      </div>
      <div className="media-list">
        {media.map((m) => {
          // A source still importing can't be previewed or dragged yet.
          const ready = m.decodable && !m.importing;
          return (
          <div key={m.id} className={'media-item' + (ready ? ' playable' : '') + (m.importing ? ' importing' : '') + (previewing === m.id ? ' active' : '')} draggable={ready}
            title={ready ? translate('clickToPreviewDragOntoTheTimeline') : m.importing ? translate('importing') : undefined}
            onClick={() => { if (ready) onPreview(m.id); }}
            onDragStart={(e) => { e.dataTransfer.setData(MEDIA_MIME, m.id); e.dataTransfer.effectAllowed = 'copy'; mediaDrag.id = m.id; }}
            onDragEnd={() => { mediaDrag.id = null; }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ id: m.id, left: Math.min(e.clientX + 4, window.innerWidth - 240), top: Math.min(e.clientY + 4, window.innerHeight - 110) });
            }}>
            <div className="media-thumb" style={{ background: m.tone }}>
              <PreviewStrip media={m} width={100} />
              {!m.decodable && <div className="warn"><Warning stroke="var(--warn-icon)" /></div>}
              {m.importing && <span className="media-importing">{translate('importing')}</span>}
              <span className="media-dur">{m.animation ? translate('sLoop', { value1: formatNumber(m.animation, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }) : m.still ? translate('still') : m.decodable ? fmtShortDuration(m.duration) : '—'}</span>
            </div>
            <div className="media-text">
              <span className="media-name">{m.name}</span>
              <span className={'media-meta' + (m.decodable ? '' : ' error')}>{mediaMeta(project, m)}</span>
              {!m.decodable && !m.importing && (
                <button className="convert-btn" onClick={() => onConvert(m)}>
                  <Convert size={12} strokeWidth={2.2} />
                  {translate('convertToMP4')}</button>
              )}
            </div>
          </div>
          );
        })}
      </div>
      {menu && project.media[menu.id] && (() => {
        const clips = clipCount(project, menu.id);
        return (
          <div role="menu" aria-label={project.media[menu.id].name} className="menu" style={{ position: 'fixed', left: menu.left, top: menu.top }}
            onPointerDown={(e) => e.stopPropagation()}>
            <span className="menu-label">{project.media[menu.id].name}</span>
            <button role="menuitem" className="ib danger" autoFocus onClick={() => { onRemove(menu.id); setMenu(null); }}>
              <Trash size={14} />
              <span>{translate('deleteFromProject')}</span>
            </button>
            {clips > 0 && <span className="menu-label menu-note">{translate('alsoRemovesClips', { count: clips })}</span>}
          </div>
        );
      })()}
      <div className="transitions">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span className="panel-title">{translate('transitions')}</span>
          <span className="count">{TRANSITIONS().length}</span>
        </div>
        <div className="transition-grid">
          {TRANSITIONS().map((t) => (
            // A div, not a button: Firefox won't start a drag from a button.
            <div key={t.name} className="transition-card" draggable title={translate('dragOntoAnOverlapBetweenTwoClips')}
              onDragStart={e => { e.dataTransfer.setData('application/x-timeline-transition', t.type); e.dataTransfer.effectAllowed = 'copy'; document.body.classList.add('dragging-transition'); }}
              onDragEnd={() => document.body.classList.remove('dragging-transition')}>
              <span style={{ background: t.swatch }} />
              {t.name}
            </div>
          ))}
        </div>
        <span className="hint" style={{ lineHeight: 1.4 }}>{translate('overlapTwoClipsThenDragATransitionOntoTheir')}</span>
      </div>
    </aside>
  );
}
