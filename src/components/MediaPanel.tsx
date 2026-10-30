import { useState } from 'react';
import { codecFamily, fmtShortDuration, videoTracks } from '../editor/model';
import type { Media, Project } from '../editor/model';
import { Convert, Plus, Warning } from './icons';

const TRANSITIONS = [
  { name: 'Cross dissolve', swatch: 'linear-gradient(90deg, #35503F, #4A5B6E)' },
  { name: 'Fade to black', swatch: 'linear-gradient(90deg, #35503F, #0B0D0C)' },
  { name: 'Wipe', swatch: 'linear-gradient(90deg, #35503F 50%, #4A5B6E 50%)' },
  { name: 'Slide', swatch: 'linear-gradient(90deg, #35503F 30%, #4A5B6E 30%)' },
];

interface Props {
  project: Project;
  onConvert: (media: Media) => void;
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

export function MediaPanel({ project, onConvert }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const media = Object.values(project.media);

  return (
    <aside className="panel media">
      <div className="media-head">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="panel-title">Media</span>
          <span className="count">{media.length}</span>
        </div>
        <button className="ib outlined" style={{ height: 30, padding: '0 10px', fontSize: 12, fontWeight: 500 }}>
          <Plus size={13} strokeWidth={2.2} />
          Import
        </button>
      </div>
      <div
        className={'dropzone' + (dragOver ? ' over' : '')}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); }}
      >
        Drop MP4 or WebM files here
      </div>
      <div className="media-list">
        {media.map((m) => (
          <div key={m.id} className="media-item">
            <div className="media-thumb" style={{ background: m.tone }}>
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
            <button key={t.name} className="transition-card" draggable>
              <span style={{ background: t.swatch }} />
              {t.name}
            </button>
          ))}
        </div>
        <span className="hint" style={{ lineHeight: 1.4 }}>Drag onto the cut between two clips.</span>
      </div>
    </aside>
  );
}
