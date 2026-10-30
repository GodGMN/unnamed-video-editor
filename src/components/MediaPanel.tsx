import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { codecFamily, fmtShortDuration, videoTracks } from '../editor/model';
import type { Media, Project } from '../editor/model';
import { Convert, Plus, Trash, Warning } from './icons';

import { importMedia, regeneratePreview } from '../media/import';
import { readMediaFile, removeLegacyCopy } from '../media/files';
import { pickFiles, requestSourcePermission, sourceKind } from '../media/links';
import type { PickedFile } from '../media/links';
import { reconnectMedia } from '../projects/portable';
import { PreviewStrip } from '../media/PreviewStrip';
import { MEDIA_MIME, mediaDrag } from '../media/drag';

const TRANSITIONS = [
  { type: 'crossfade', name: 'Cross dissolve', swatch: 'linear-gradient(90deg, #35503F, #4A5B6E)' },
  { type: 'fade', name: 'Fade to black', swatch: 'linear-gradient(90deg, #35503F, #0B0D0C)' },
];

interface Props {
  onBusy: (busy: boolean) => void;
  onReconnect: () => void;
  project: Project;
  onConvert: (media: Media) => void;
  onImport: (media: Media) => void;
  /** The source playing in the preview on its own, if any. */
  previewing: string | null;
  /** Plays a source in the preview on its own. */
  onPreview: (mediaId: string) => void;
  onRemove: (mediaId: string) => void;
}

interface MediaMenu { id: string; left: number; top: number }

const TIMES = ['', 'once', 'twice', 'three times'];

/** The one-line summary under a media item's name. */
function mediaMeta(project: Project, m: Media): string {
  const v = m.video;
  if (!m.decodable) return `${v ? codecFamily(v.codec) : 'This format'} isn’t supported by this browser.`;
  if (!v) return m.audio ? `Audio · ${codecFamily(m.audio.codec)}` : m.container;

  const tracks = videoTracks(project);
  const uses = tracks.flatMap((t) => t.clips.filter((c) => c.mediaId === m.id).map(() => t));
  const { width: ow, height: oh } = project.output;
  const main = tracks.find((t) => t.magnetic);
  const note =
    uses.length > 1 ? `used ${TIMES[uses.length] ?? `${uses.length} times`}`
    : v.width > ow || v.height > oh ? 'scaled to output'
    : uses.length === 1 && uses[0] !== main ? `on ${uses[0].name}`
    : m.still ? m.container : codecFamily(v.codec);
  return `${v.width}×${v.height} · ${m.animation ? 'Animated' : m.still ? 'Image' : `${Math.round(v.fps)} fps`} · ${note}`;
}

/** How many timeline clips (video and audio) play this source. */
function clipCount(project: Project, mediaId: string): number {
  return project.tracks.reduce((n, t) => n + (t.kind === 'text' ? 0 : t.clips.filter((c) => c.mediaId === mediaId).length), 0);
}

/** Whether a drag carries files from outside the page (not a media item or transition). */
const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files');

export function MediaPanel({ onBusy, onReconnect, project, onConvert, onImport, onPreview, onRemove, previewing }: Props) {
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
  const queue = useRef(Promise.resolve());
  const [pending, setPending] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  const [sourceKinds, setSourceKinds] = useState<Record<string, string>>({});
  const [revision, setRevision] = useState(0);
  const mediaIds = Object.keys(project.media).join(',');
  useEffect(() => { const refresh = () => setRevision(n => n + 1); window.addEventListener('media-source-change', refresh); return () => window.removeEventListener('media-source-change', refresh); }, []);
  useEffect(() => {
    let live = true;
    void Promise.all(mediaIds.split(',').filter(Boolean).map(async id => ({ id, available: !!await readMediaFile(id).catch(() => null), kind: await sourceKind(id) })))
      .then(items => { if (live) { setAvailable(Object.fromEntries(items.map(m => [m.id, m.available]))); setSourceKinds(Object.fromEntries(items.map(m => [m.id, m.kind]))); } }).catch(failed);
    return () => { live = false; };
  }, [mediaIds, revision]);
  useEffect(() => { onBusy(pending > 0); }, [pending, onBusy]);
  useEffect(() => {
    if (!pending) return;
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [pending]);
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
    const batch = files;
    setPending((n) => n + batch.length);
    for (const { file, handle } of batch) queue.current = queue.current.then(async () => {
      try { onImport(await importMedia(file, handle)); }
      catch (error) { setErrors((items) => [...items, `${file.name}: ${error instanceof Error ? error.message : 'Import failed'}`]); }
      finally { setPending((n) => n - 1); }
    });
  };

  return (
    <aside className="panel media"
      onDragEnter={(e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current++; setDragOver(true); }}
      onDragOver={(e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDragLeave={(e) => { if (hasFiles(e) && --dragDepth.current === 0) setDragOver(false); }}
      onDrop={(e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current = 0; setDragOver(false); ingest(Array.from(e.dataTransfer.files, file => ({ file }))); }}>
      {dragOver && <div className="media-drop">Drop to import</div>}
      <div className="media-head">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="panel-title">Media</span>
          <span className="count">{media.length}</span>
        </div>
        <input ref={input} type="file" multiple accept="video/*,audio/*,image/*,.mov,.mkv" aria-label="Import media files" hidden onChange={(e) => { if (e.target.files) ingest(Array.from(e.target.files, file => ({ file }))); e.target.value = ''; }} />
        <button onClick={() => {
          if (!window.showOpenFilePicker) input.current?.click();
          else void pickFiles().then(ingest).catch(failed);
        }} className="ib outlined" style={{ height: 30, padding: '0 10px', fontSize: 12, fontWeight: 500 }}>
          <Plus size={13} strokeWidth={2.2} />
          Import
        </button>
      </div>
      <div role="status" aria-live="polite">
        {pending > 0 && <p className="media-meta media-status">Importing {pending} file{pending === 1 ? '' : 's'}…</p>}
        {errors.map((error, i) => <p key={i} className="media-meta error media-status">{error}</p>)}
      </div>
      <p className="hint" style={{ padding: '0 16px 10px' }}>{window.showOpenFilePicker ? 'Import links originals. Dropped files need reconnecting after reload.' : 'Files stay on your disk. Reconnect them after reopening this page.'}</p>
      <div className="media-list">
        {media.map((m) => (
          <div key={m.id} className={'media-item' + (m.decodable ? ' playable' : '') + (previewing === m.id ? ' active' : '')} draggable={m.decodable}
            title={m.decodable ? 'Click to preview · drag onto the timeline' : undefined}
            onClick={() => { if (m.decodable) onPreview(m.id); }}
            onDragStart={(e) => { e.dataTransfer.setData(MEDIA_MIME, m.id); e.dataTransfer.effectAllowed = 'copy'; mediaDrag.id = m.id; }}
            onDragEnd={() => { mediaDrag.id = null; }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ id: m.id, left: Math.min(e.clientX + 4, window.innerWidth - 240), top: Math.min(e.clientY + 4, window.innerHeight - 110) });
            }}>
            <div className="media-thumb" style={{ background: m.tone }}>
              <PreviewStrip media={m} width={100} />
              {!m.decodable && <div className="warn"><Warning stroke="var(--warn-icon)" /></div>}
              <span className="media-dur">{m.animation ? `${m.animation.toFixed(1)}s loop` : m.still ? 'Still' : m.decodable ? fmtShortDuration(m.duration) : '—'}</span>
            </div>
            <div className="media-text">
              <span className="media-name">{m.name}</span>
              <span className={'media-meta' + (m.decodable ? '' : ' error')}>{mediaMeta(project, m)}</span>
              <span className="hint">{available[m.id] === false ? 'Reconnect needed' : sourceKinds[m.id] === 'linked' ? 'Linked original' : sourceKinds[m.id] === 'session' ? 'Session only' : sourceKinds[m.id] === 'legacy' ? 'Stored copy' : 'Checking source'}</span>
              <div className="media-reconnect" onClick={e => e.stopPropagation()}>
                {window.showOpenFilePicker ? <button className="gb" onClick={() => void pickFiles().then(files => { if (files[0]) return reconnect(m, files[0]); }).catch(failed)}>{available[m.id] ? 'Relink original' : 'Reconnect'}</button> : <label className="gb">{available[m.id] ? 'Relink original' : 'Reconnect'}<input aria-label={`Reconnect ${m.name}`} type="file" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void reconnect(m, { file: f }); e.target.value = ''; }} /></label>}
                {available[m.id] === false && sourceKinds[m.id] === 'linked' && <button className="gb" onClick={() => void requestSourcePermission(m.id).then(granted => { if (!granted) throw new Error('Select the original file with Reconnect.'); setRevision(n => n + 1); onReconnect(); }).catch(failed)}>Restore access</button>}
              </div>
              {available[m.id] && <button className="convert-btn" onClick={e => { e.stopPropagation(); setPending(n => n + 1); void readMediaFile(m.id).then(async f => { if (f) await regeneratePreview(m, f); setRevision(n => n + 1); onReconnect(); }).catch(failed).finally(() => setPending(n => n - 1)); }}>Rebuild previews</button>}
              {!m.decodable && (
                <button className="convert-btn" onClick={() => onConvert(m)}>
                  <Convert size={12} strokeWidth={2.2} />
                  Convert to MP4
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {menu && project.media[menu.id] && (() => {
        const clips = clipCount(project, menu.id);
        return (
          <div role="menu" aria-label={project.media[menu.id].name} className="menu" style={{ position: 'fixed', left: menu.left, top: menu.top }}
            onPointerDown={(e) => e.stopPropagation()}>
            <span className="menu-label">{project.media[menu.id].name}</span>
            <button role="menuitem" className="ib danger" autoFocus onClick={() => { onRemove(menu.id); setMenu(null); }}>
              <Trash size={14} />
              <span>Delete from project</span>
            </button>
            {clips > 0 && <span className="menu-label menu-note">Also removes {clips} clip{clips === 1 ? '' : 's'} from the timeline.</span>}
          </div>
        );
      })()}
      <div className="transitions">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span className="panel-title">Transitions</span>
          <span className="count">{TRANSITIONS.length}</span>
        </div>
        <div className="transition-grid">
          {TRANSITIONS.map((t) => (
            // A div, not a button: Firefox won't start a drag from a button.
            <div key={t.name} className="transition-card" draggable title="Drag onto an overlap between two clips"
              onDragStart={e => { e.dataTransfer.setData('application/x-timeline-transition', t.type); e.dataTransfer.effectAllowed = 'copy'; document.body.classList.add('dragging-transition'); }}
              onDragEnd={() => document.body.classList.remove('dragging-transition')}>
              <span style={{ background: t.swatch }} />
              {t.name}
            </div>
          ))}
        </div>
        <span className="hint" style={{ lineHeight: 1.4 }}>Overlap two clips, then drag a transition onto their overlap.</span>
      </div>
    </aside>
  );
}
