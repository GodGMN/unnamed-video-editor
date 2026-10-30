import { useT } from '../i18n';
import { t as translate, formatNumber } from '../i18n/core';
import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { codecFamily, fmtShortDuration, videoTracks } from '../editor/model';
import type { Media, Project } from '../editor/model';
import { Convert, Plus, Trash, Warning } from './icons';

import { regeneratePreview } from '../media/import';
import { readMediaFile, removeLegacyCopy } from '../media/files';
import { pickFiles, requestSourcePermission, sourceKind } from '../media/links';
import type { PickedFile } from '../media/links';
import { reconnectMedia } from '../projects/portable';
import { PreviewStrip } from '../media/PreviewStrip';
import { MEDIA_MIME, mediaDrag } from '../media/drag';
import { Tabs } from './Tabs';

const TRANSITIONS = () => ([
  { type: 'crossfade', name: translate('crossDissolve'), swatch: 'linear-gradient(90deg, #35503F, #4A5B6E)' },
  { type: 'fade', name: translate('fadeToBlack'), swatch: 'linear-gradient(90deg, #35503F, #0B0D0C)' },
]);

interface Props {
  onBusy: (busy: boolean) => void;
  onReconnect: () => void;
  project: Project;
  onConvert: (media: Media) => void;
  /** Imports files into the library. */
  onImport: (files: PickedFile[]) => void;
  /** Files still being imported. */
  importing: number;
  /** Imports that failed, as `name: reason`. */
  importErrors: string[];
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

export function MediaPanel({ onBusy, onReconnect, project, onConvert, onImport, importing, importErrors, onPreview, onRemove, previewing }: Props) {
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
  // Relinks and preview rebuilds; imports are counted in `importing`.
  const [pending, setPending] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [tab, setTab] = useState<'media' | 'transitions'>('media');
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  const [sourceKinds, setSourceKinds] = useState<Record<string, string>>({});
  const [revision, setRevision] = useState(0);
  const mediaIds = Object.keys(project.media).join(',');
  // A source's link is only written when its import finishes, so check again then.
  const importingIds = media.filter((m) => m.importing).map((m) => m.id).join(',');
  useEffect(() => { const refresh = () => setRevision(n => n + 1); window.addEventListener('media-source-change', refresh); return () => window.removeEventListener('media-source-change', refresh); }, []);
  useEffect(() => {
    let live = true;
    void Promise.all(mediaIds.split(',').filter(Boolean).map(async id => ({ id, available: !!await readMediaFile(id).catch(() => null), kind: await sourceKind(id) })))
      .then(items => { if (live) { setAvailable(Object.fromEntries(items.map(m => [m.id, m.available]))); setSourceKinds(Object.fromEntries(items.map(m => [m.id, m.kind]))); } }).catch(failed);
    return () => { live = false; };
  }, [mediaIds, importingIds, revision]);
  const busy = pending + importing;
  useEffect(() => { onBusy(busy > 0); }, [busy, onBusy]);
  useEffect(() => {
    if (!busy) return;
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [busy]);
  const failed = (error: unknown) => { if (!(error instanceof DOMException && error.name === 'AbortError')) setErrors(items => [...items, error instanceof Error ? error.message : String(error)]); };
  const reconnect = async (m: Media, picked: PickedFile) => {
    setPending(n => n + 1);
    try {
      await reconnectMedia(m, picked);
      await removeLegacyCopy(m.id);
      setRevision(n => n + 1); onReconnect();
      await regeneratePreview(m, picked.file);
    } catch (error) { failed(error); }
    finally { setPending(n => n - 1); }
  };
  const ingest = (files: PickedFile[]) => {
    setTab('media');
    onImport(files);
  };

  return (
    <aside className="panel media"
      onDragEnter={(e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current++; setDragOver(true); }}
      onDragOver={(e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDragLeave={(e) => { if (hasFiles(e) && --dragDepth.current === 0) setDragOver(false); }}
      onDrop={(e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current = 0; setDragOver(false); ingest(Array.from(e.dataTransfer.files, file => ({ file }))); }}>
      {dragOver && <div className="media-drop">{translate('dropToImport')}</div>}
      <Tabs value={tab} onChange={setTab} label={translate('library')} className="media-tab" tabs={[
        { id: 'media', label: <>{translate('media')}<span className="count">{media.length}</span></> },
        { id: 'transitions', label: <>{translate('transitions')}<span className="count">{TRANSITIONS().length}</span></> },
      ]} actions={<>
        <input ref={input} type="file" multiple accept="video/*,audio/*,image/*,.mov,.mkv" aria-label={translate('importMediaFiles')} hidden onChange={(e) => { if (e.target.files) ingest(Array.from(e.target.files, file => ({ file }))); e.target.value = ''; }} />
        <button onClick={() => {
          if (!window.showOpenFilePicker) input.current?.click();
          else void pickFiles().then(ingest).catch(failed);
        }} className="ib outlined" aria-label={translate('import')} title={translate('importMediaFiles')}
          style={{ ['--h' as string]: '30px', width: 30, padding: 0, justifyContent: 'center', flex: 'none' }}>
          <Plus size={14} strokeWidth={2.2} />
        </button>
      </>}>
      {tab === 'media' && <>
      <div role="status" aria-live="polite">
        {busy > 0 && <p className="media-meta media-status">{translate('importingFiles', { count: busy })}</p>}
        {[...importErrors, ...errors].map((error, i) => <p key={i} className="media-meta error media-status">{error}</p>)}
      </div>
      <p className="hint" style={{ padding: '0 16px 10px' }}>{window.showOpenFilePicker ? translate('mediaImportLinksOriginals') : translate('mediaFilesStayOnDisk')}</p>
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
              {!m.importing && <>
              <span className="hint">{available[m.id] === false ? translate('mediaReconnectNeeded') : sourceKinds[m.id] === 'linked' ? translate('mediaLinkedOriginal') : sourceKinds[m.id] === 'session' ? translate('mediaSessionOnly') : sourceKinds[m.id] === 'legacy' ? translate('mediaStoredCopy') : translate('mediaCheckingSource')}</span>
              <div className="media-reconnect" onClick={e => e.stopPropagation()}>
                {window.showOpenFilePicker ? <button className="gb" onClick={() => void pickFiles().then(files => { if (files[0]) return reconnect(m, files[0]); }).catch(failed)}>{available[m.id] ? translate('mediaRelinkOriginal') : translate('mediaReconnect')}</button> : <label className="gb">{available[m.id] ? translate('mediaRelinkOriginal') : translate('mediaReconnect')}<input aria-label={translate('mediaReconnectName', { name: m.name })} type="file" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void reconnect(m, { file: f }); e.target.value = ''; }} /></label>}
                {available[m.id] === false && sourceKinds[m.id] === 'linked' && <button className="gb" onClick={() => void requestSourcePermission(m.id).then(granted => { if (!granted) throw new Error(translate('mediaSelectOriginalWithReconnect')); setRevision(n => n + 1); onReconnect(); }).catch(failed)}>{translate('projectHomeRestoreAccess')}</button>}
              </div>
              {available[m.id] && <button className="convert-btn" onClick={e => { e.stopPropagation(); setPending(n => n + 1); void readMediaFile(m.id).then(async f => { if (f) await regeneratePreview(m, f); setRevision(n => n + 1); onReconnect(); }).catch(failed).finally(() => setPending(n => n - 1)); }}>{translate('projectHomeRebuildPreviews')}</button>}
              {!m.decodable && (
                <button className="convert-btn" onClick={() => onConvert(m)}>
                  <Convert size={12} strokeWidth={2.2} />
                  {translate('convertToMP4')}</button>
              )}
              </>}
            </div>
          </div>
          );
        })}
      </div>
      </>}
      {tab === 'transitions' && <div className="transitions">
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
      </div>}
      </Tabs>
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
    </aside>
  );
}
