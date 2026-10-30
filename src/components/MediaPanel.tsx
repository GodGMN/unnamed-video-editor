import { useState } from 'react';
import type { MediaItem } from '../editor/model';
import { Convert, Plus, Warning } from './icons';

const TRANSITIONS = [
  { name: 'Cross dissolve', swatch: 'linear-gradient(90deg, #35503F, #4A5B6E)' },
  { name: 'Fade to black', swatch: 'linear-gradient(90deg, #35503F, #0B0D0C)' },
  { name: 'Wipe', swatch: 'linear-gradient(90deg, #35503F 50%, #4A5B6E 50%)' },
  { name: 'Slide', swatch: 'linear-gradient(90deg, #35503F 30%, #4A5B6E 30%)' },
];

interface Props {
  media: MediaItem[];
  onConvert: (item: MediaItem) => void;
}

export function MediaPanel({ media, onConvert }: Props) {
  const [dragOver, setDragOver] = useState(false);

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
          <div key={m.name} className="media-item">
            <div className="media-thumb" style={{ background: m.tone }}>
              {m.error && <div className="warn"><Warning stroke="var(--warn-icon)" /></div>}
              <span className="media-dur">{m.dur}</span>
            </div>
            <div className="media-text">
              <span className="media-name">{m.name}</span>
              <span className={'media-meta' + (m.error ? ' error' : '')}>{m.meta}</span>
              {m.error && (
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
