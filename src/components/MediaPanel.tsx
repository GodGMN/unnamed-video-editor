import { useRef, useState } from 'react';
import { codecFamily, fmtShortDuration, videoTracks } from '../editor/model';
import type { Media, Project } from '../editor/model';
import { Convert, Plus, Warning } from './icons';

import { importMedia } from '../media/import';
import { PreviewStrip } from '../media/PreviewStrip';

const TRANSITIONS = [
  { type: 'crossfade', name: 'Cross dissolve', swatch: 'linear-gradient(90deg, #35503F, #4A5B6E)' },
  { type: 'fade', name: 'Fade to black', swatch: 'linear-gradient(90deg, #35503F, #0B0D0C)' },
];

interface Props {
  project: Project;
  onConvert: (media: Media) => void;
  onImport: (media: Media) => void;
}

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
    : codecFamily(v.codec);
  return `${v.width}×${v.height} · ${Math.round(v.fps)} fps · ${note}`;
}

export function MediaPanel({ project, onConvert, onImport }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const media = Object.values(project.media);
  const input = useRef<HTMLInputElement>(null);
  const queue = useRef(Promise.resolve());
  const [pending, setPending] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const ingest = (files: FileList | File[]) => {
    const batch = Array.from(files);
    setPending((n) => n + batch.length);
    for (const file of batch) queue.current = queue.current.then(async () => {
      try { onImport(await importMedia(file)); }
      catch (error) { setErrors((items) => [...items, `${file.name}: ${error instanceof Error ? error.message : 'Import failed'}`]); }
      finally { setPending((n) => n - 1); }
    });
  };

  return (
    <aside className="panel media">
      <div className="media-head">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="panel-title">Media</span>
          <span className="count">{media.length}</span>
        </div>
        <input ref={input} type="file" multiple accept="video/*,audio/*,.mov,.mkv" aria-label="Import media files" hidden onChange={(e) => { if (e.target.files) ingest(e.target.files); e.target.value = ''; }} />
        <button onClick={() => input.current?.click()} className="ib outlined" style={{ height: 30, padding: '0 10px', fontSize: 12, fontWeight: 500 }}>
          <Plus size={13} strokeWidth={2.2} />
          Import
        </button>
      </div>
      <div
        className={'dropzone' + (dragOver ? ' over' : '')}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); ingest(e.dataTransfer.files); }}
      >
        {pending ? `Importing ${pending} file${pending === 1 ? '' : 's'}…` : 'Drop video or audio files here'}
      </div>
      <div role="status" aria-live="polite">{errors.map((error, i) => <p key={i} className="media-meta error">{error}</p>)}</div>
      <div className="media-list">
        {media.map((m) => (
          <div key={m.id} className="media-item" draggable={m.decodable}
            onDragStart={(e) => { e.dataTransfer.setData('application/x-editor-media', m.id); e.dataTransfer.effectAllowed = 'copy'; }}>
            <div className="media-thumb" style={{ background: m.tone }}>
              <PreviewStrip media={m} width={100} />
              {!m.decodable && <div className="warn"><Warning stroke="var(--warn-icon)" /></div>}
              <span className="media-dur">{m.decodable ? fmtShortDuration(m.duration) : '—'}</span>
            </div>
            <div className="media-text">
              <span className="media-name">{m.name}</span>
              <span className={'media-meta' + (m.decodable ? '' : ' error')}>{mediaMeta(project, m)}</span>
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
      <div className="transitions">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span className="panel-title">Transitions</span>
          <span className="count">{TRANSITIONS.length}</span>
        </div>
        <div className="transition-grid">
          {TRANSITIONS.map((t) => (
            <button key={t.name} className="transition-card" draggable
              onDragStart={e => { e.dataTransfer.setData('application/x-timeline-transition', t.type); e.dataTransfer.effectAllowed = 'copy'; }}>
              <span style={{ background: t.swatch }} />
              {t.name}
            </button>
          ))}
        </div>
        <span className="hint" style={{ lineHeight: 1.4 }}>Overlap two clips, then drag a transition onto their overlap.</span>
      </div>
    </aside>
  );
}
