import { useT } from '../../i18n';
import { t as translate } from '../../i18n/core';
import { useRef, useState } from 'react';
import { clipEnd, fmtShortDuration, videoTracks } from '../../editor/model';
import type { Media } from '../../editor/model';
import type { Editor } from '../../editor/useProject';
import type { PickedFile } from '../../media/links';
import type { Placement } from '../../media/useImports';
import { PreviewStrip } from '../../media/PreviewStrip';
import { ConversionProgress } from '../TopBar';
import { Convert, Plus, Warning } from '../icons';

interface Props {
  editor: Editor;
  /** Music and sound only, added at the playhead on an audio track. */
  audio: boolean;
  onImport: (files: PickedFile[], place?: Placement) => void;
  importing: number;
  onConvert: (media: Pick<Media, 'id' | 'name'>) => void;
  onDone: () => void;
}

/**
 * The media library on a phone. Tap sources to pick them, numbered in order, then add them all
 * at once: to the end of the main track, or over it at the playhead. Nothing is dragged.
 */
export function MediaSheet({ editor, audio, onImport, importing, onConvert, onDone }: Props) {
  useT();
  const { project, ui } = editor;
  const [picked, setPicked] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const media = Object.values(project.media).filter((m) => (audio ? m.audio && !m.video : true));
  const main = videoTracks(project).find((t) => t.magnetic) ?? videoTracks(project)[0];
  const overlay = videoTracks(project).find((t) => t !== main);
  const chosen = picked.map((id) => project.media[id]).filter((m): m is Media => !!m);

  const toggle = (m: Media) => {
    if (!m.decodable) { onConvert(m); return; }
    setPicked((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]));
  };
  // Video goes straight to the end of the main track. Sound stays in the library to be picked,
  // since where it lands depends on the playhead and what's free there.
  const importFiles = (files: File[]) => {
    if (!files.length) return;
    const picked = files.map((file) => ({ file }));
    if (audio || !main) { onImport(picked); return; }
    onImport(picked, { trackId: main.id, timeFor: () => Math.max(0, ...main.clips.map(clipEnd)) });
    onDone();
  };

  return (
    <div className="media-sheet">
      <ConversionProgress onShow={(id, name) => onConvert({ id, name })} />
      <input ref={input} type="file" multiple hidden aria-label={translate('importMediaFiles')}
        accept={audio ? 'audio/*' : 'video/*,audio/*,image/*,.mov,.mkv'}
        onChange={(e) => { importFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      <div className="media-grid">
        <button className="media-tile import" onClick={() => input.current?.click()}>
          <Plus size={20} strokeWidth={2.4} />
          <span>{translate('mobileFromDevice')}</span>
        </button>
        {media.map((m) => {
          const n = picked.indexOf(m.id);
          return (
            <button key={m.id} className={'media-tile' + (n >= 0 ? ' picked' : '') + (m.importing ? ' importing' : '')}
              style={{ background: m.tone }} aria-pressed={n >= 0} aria-label={m.name} onClick={() => toggle(m)}>
              {m.video ? <PreviewStrip media={m} width={120} /> : <span className="media-tile-name">{m.name}</span>}
              {!m.decodable && <span className="media-tile-warn"><Warning stroke="var(--warn-icon)" /><Convert size={12} />{translate('convertToMP4')}</span>}
              {m.importing && <span className="media-importing">{translate('importing')}</span>}
              <span className="media-dur">{m.still ? translate('still') : fmtShortDuration(m.duration)}</span>
              {n >= 0 && <span className="media-tile-order">{n + 1}</span>}
            </button>
          );
        })}
      </div>
      {!media.length && <p className="hint">{audio ? translate('mobileNoAudio') : translate('mobileNoMedia')}</p>}
      {importing > 0 && <p className="hint" role="status">{translate('importingFiles', { count: importing })}</p>}
      <div className="media-sheet-actions">
        {audio ? (
          <button className="primary" disabled={!chosen.length} onClick={() => { editor.addAudio(picked, ui.playhead); onDone(); }}>
            {translate('mobileAddAtPlayhead')}
          </button>
        ) : <>
          {overlay && (
            <button className="gb" disabled={!chosen.some((m) => m.video)}
              onClick={() => { editor.dropMedia(chosen.filter((m) => m.video), overlay.id, ui.playhead); onDone(); }}>
              {translate('mobileAddAsOverlay')}
            </button>
          )}
          <button className="primary" disabled={!chosen.length} onClick={() => { editor.appendMedia(picked); onDone(); }}>
            {chosen.length ? translate('mobileAddCount', { value1: chosen.length }) : translate('mobileAddToTimeline')}
          </button>
        </>}
      </div>
    </div>
  );
}
