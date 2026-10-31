import { useT } from '../../i18n';
import { t as translate } from '../../i18n/core';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ASPECTS, MIN_SPLIT_PIECE, aspectOf, audioFor, clipEnd, findClip, fmtTime, videoTracks } from '../../editor/model';
import type { Media } from '../../editor/model';
import type { Editor } from '../../editor/useProject';
import type { PickedFile } from '../../media/links';
import type { Placement } from '../../media/useImports';
import { PreviewPanel } from '../PreviewPanel';
import { PropertiesPanel } from '../PropertiesPanel';
import type { VideoTab } from '../PropertiesPanel';
import { ProjectName } from '../TopBar';
import { Check, ChevronLeft, Close, Cog, Crop, Crossfade, Download, Dropper, Duplicate, FadeRamp, Frame, LibraryGrid, Move, Music, Pencil, Scissors, TextT, Trash, Volume } from '../icons';
import { PhoneTimeline } from './PhoneTimeline';
import { MediaSheet } from './MediaSheet';
import { FadesSheet } from './FadesSheet';

type Sheet =
  | { kind: 'props'; tab?: VideoTab }
  | { kind: 'fades' }
  | { kind: 'media'; audio: boolean }
  | { kind: 'format' };

interface Props {
  editor: Editor;
  totalTime: string;
  onLeave: () => void;
  onExport: () => void;
  onSettings: () => void;
  onImport: (files: PickedFile[], place?: Placement) => void;
  importing: number;
  onConvert: (media: Pick<Media, 'id' | 'name'>) => void;
}

/**
 * The editor on a phone: preview on top, a timeline with a fixed centre playhead underneath, and
 * a tool bar that follows the selection. Clip settings and the media library open as a sheet in
 * place of the timeline, so the preview stays in view.
 */
export function PhoneEditor({ editor, totalTime, onLeave, onExport, onSettings, onImport, importing, onConvert }: Props) {
  useT();
  const { project, ui } = editor;
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [videoTab, setVideoTab] = useState<VideoTab>('transform');

  // Leaving mid-import would lose the files still being stored.
  useEffect(() => {
    if (!importing) return;
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [importing]);

  // A sheet about a clip closes when the clip goes (deleted, undone).
  const sel = ui.sel;
  const selected = sel && findClip(project, sel.id);
  useEffect(() => {
    if (!selected && (sheet?.kind === 'props' || sheet?.kind === 'fades') && !ui.source) setSheet(null);
  }, [selected, sheet, ui.source]);

  const openProps = (tab?: VideoTab) => {
    if (tab) setVideoTab(tab);
    setSheet({ kind: 'props', tab });
  };

  const sheetTitle = !sheet ? '' : sheet.kind === 'media' ? (sheet.audio ? translate('audio2') : translate('media'))
    : sheet.kind === 'format' ? translate('format') : sheet.kind === 'fades' ? translate('fades')
    : sel?.kind === 'trans' ? translate('transition') : sel?.kind === 'text' ? translate('textOverlay') : sel?.kind === 'audio' ? translate('volume') : translate('mobileEdit');

  return (
    <div className="editor phone">
      <header className="phone-top">
        <button className="ib square" onClick={onLeave} aria-label={translate('projectHomeProjects')}><ChevronLeft size={18} strokeWidth={2.2} /></button>
        <ProjectName name={project.name} onRename={editor.renameProject} />
        {editor.saveState.status === 'failed' && <button className="gb" onClick={() => { void editor.flush().catch(() => undefined); }}>{translate('projectHomeRetrySave')}</button>}
        <div className="spacer" />
        <button className="ib square" onClick={onSettings} aria-label={translate('settings')}><Cog stroke="#C8CEC9" /></button>
        <button className="export-btn" onClick={onExport}><Download size={15} strokeWidth={2.2} />{translate('export')}</button>
      </header>

      <PreviewPanel editor={editor} totalTime={totalTime} compact />

      {sheet ? (
        <section className="phone-sheet" aria-label={sheetTitle}>
          <div className="phone-sheet-head">
            <span className="panel-title">{sheetTitle}</span>
            <button className="ib outlined" onClick={() => setSheet(null)}><Check size={14} strokeWidth={2.4} />{translate('mobileDone')}</button>
          </div>
          <div className="phone-sheet-body">
            {sheet.kind === 'props' && <PropertiesPanel editor={editor} tab={videoTab} onTab={setVideoTab} />}
            {sheet.kind === 'fades' && <FadesSheet editor={editor} />}
            {sheet.kind === 'media' && <MediaSheet editor={editor} audio={sheet.audio} onImport={onImport} importing={importing} onConvert={onConvert} onDone={() => setSheet(null)} />}
            {sheet.kind === 'format' && <FormatSheet editor={editor} />}
          </div>
        </section>
      ) : <>
        <PhoneTimeline editor={editor} onAdd={() => setSheet({ kind: 'media', audio: false })}
          onTransition={(id) => { editor.select({ kind: 'trans', id }); openProps(); }} />
        <Toolbar editor={editor} onSheet={setSheet} onProps={openProps} />
      </>}
    </div>
  );
}

function Tool({ icon, label, onClick, disabled, danger }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button className={'phone-tool' + (danger ? ' danger' : '')} onClick={onClick} disabled={disabled}>
      {icon}<span>{label}</span>
    </button>
  );
}

/** The bottom bar: things to add when nothing is selected, the selected clip's tools otherwise. */
function Toolbar({ editor, onSheet, onProps }: { editor: Editor; onSheet: (sheet: Sheet) => void; onProps: (tab?: VideoTab) => void }) {
  useT();
  const { project, ui, layout } = editor;
  const sel = ui.sel;
  const found = sel && sel.kind !== 'trans' ? findClip(project, sel.id) : null;

  if (!found || !sel || ui.picked.length > 1) {
    // The transition nearest the playhead on the main track, if two clips meet there.
    const main = videoTracks(project).find((t) => t.magnetic) ?? videoTracks(project)[0];
    const cut = main && [...main.clips].map((c) => ({ c, l: layout.clips[c.id] }))
      .filter(({ l }) => l?.nextId)
      .sort((a, b) => Math.abs(a.l.end - ui.playhead) - Math.abs(b.l.end - ui.playhead))[0];
    const near = cut && Math.abs(cut.l.end - ui.playhead) < 2 ? cut.c.id : null;
    return (
      <nav className="phone-bar" aria-label={translate('mobileEditTools')}>
        {ui.picked.length > 1 && <Tool icon={<Trash size={18} />} label={translate('clipsSelected', { value1: ui.picked.length })} danger onClick={editor.deleteSelection} />}
        <Tool icon={<LibraryGrid size={18} />} label={translate('media')} onClick={() => onSheet({ kind: 'media', audio: false })} />
        <Tool icon={<Music size={18} />} label={translate('audio2')} onClick={() => onSheet({ kind: 'media', audio: true })} />
        <Tool icon={<TextT size={18} />} label={translate('text')} onClick={() => { editor.addText(ui.playhead); onProps(); }} />
        <Tool icon={<Crossfade size={18} />} label={translate('transition')} disabled={!near}
          onClick={() => { if (near) { editor.select({ kind: 'trans', id: near }); onProps(); } }} />
        <Tool icon={<Frame size={18} />} label={translate('format')} onClick={() => onSheet({ kind: 'format' })} />
      </nav>
    );
  }

  const { clip, track } = found;
  const name = layout.clips[clip.id]?.name ?? '';
  const canSplit = ui.playhead - clip.start >= MIN_SPLIT_PIECE && clipEnd(clip) - ui.playhead >= MIN_SPLIT_PIECE;
  const split = <Tool icon={<Scissors size={18} />} label={translate('split')} disabled={!canSplit} onClick={() => editor.splitClip(clip.id, ui.playhead)} />;
  const tail = <>
    <Tool icon={<Duplicate size={18} />} label={translate('duplicate')} onClick={() => editor.duplicateClip(clip.id)} />
    <Tool icon={<Trash size={18} />} label={translate('mobileDelete')} danger onClick={editor.deleteSelection} />
  </>;
  const sound = track.kind === 'video' ? audioFor(project, clip.id) : null;
  return <>
    <div className="phone-context">
      <button className="ib square" onClick={() => editor.pickClips([])} aria-label={translate('mobileClearSelection')}><Close size={14} strokeWidth={2.4} /></button>
      <strong>{name}</strong>
      <span className="mono">{track.name} · {fmtTime(clipEnd(clip) - clip.start)}</span>
    </div>
    <nav className="phone-bar scroll" aria-label={translate('mobileEditTools')}>
      {track.kind === 'video' && <>
        {split}
        <Tool icon={<Move size={18} />} label={translate('transformTab')} onClick={() => onProps('transform')} />
        <Tool icon={<Crop size={18} />} label={translate('crop')} onClick={() => onProps('crop')} />
        <Tool icon={<FadeRamp size={18} />} label={translate('fades')} onClick={() => onSheet({ kind: 'fades' })} />
        {sound && <Tool icon={<Volume size={18} />} label={translate('volume')} onClick={() => { editor.select({ kind: 'audio', id: sound.id }); onProps(); }} />}
        <Tool icon={<Dropper size={18} />} label={translate('key')} onClick={() => onProps('key')} />
        {tail}
      </>}
      {track.kind === 'audio' && <>
        {split}
        <Tool icon={<Volume size={18} />} label={translate('volume')} onClick={() => onProps()} />
        <Tool icon={<FadeRamp size={18} />} label={translate('fades')} onClick={() => onSheet({ kind: 'fades' })} />
        {tail}
      </>}
      {track.kind === 'text' && <>
        <Tool icon={<Pencil size={18} />} label={translate('mobileEdit')} onClick={() => onProps()} />
        {split}
        {tail}
      </>}
    </nav>
  </>;
}

/** The output frame's shape, as big buttons. */
function FormatSheet({ editor }: { editor: Editor }) {
  useT();
  const current = aspectOf(editor.project.output);
  return (
    <div className="props-section" style={{ borderTop: 0 }}>
      <span className="hint">{translate('outputFrameShape')}</span>
      <div className="format-grid" role="group" aria-label={translate('format')}>
        {ASPECTS.map((a) => {
          const scale = 26 / Math.max(a.w, a.h);
          return (
            <button key={a.key} aria-pressed={a === current} onClick={() => editor.setAspect(a)}>
              <span className="aspect-icon" aria-hidden="true"><span style={{ width: a.w * scale, height: a.h * scale }} /></span>
              <strong>{a.key}</strong>
              <span className="hint">{a.use}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
