import { t as translate } from './i18n/core';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { fmtTime, videoTracks } from './editor/model';
import type { Media, Project } from './editor/model';
import { exportSource } from './editor/exportSource';
import { useProject } from './editor/useProject';
import type { Editor } from './editor/useProject';
import { useConversionJob } from './convert/job';
import { importMedia } from './media/import';
import { useImports } from './media/useImports';
import type { PickedFile } from './media/links';
import { ConvertDialog } from './components/ConvertDialog';
import { ExportDialog } from './components/ExportDialog';
import { MediaPanel } from './components/MediaPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Timeline } from './components/Timeline';
import { TopBar } from './components/TopBar';
import { ProjectLibrary } from './components/ProjectLibrary';
import { PhoneEditor } from './components/phone/PhoneEditor';
import { LibraryGrid, TextT } from './components/icons';
import { Splitter } from './components/Splitter';
import { useLayoutMode } from './components/useLayoutMode';
import { setPanelSize, usePanelSizes } from './panelSizes';
import { activeProjectId, listProjects, loadProject, selectProject } from './editor/storage';
import { reportError } from './toast/store';

const imported = new WeakSet<File>();
// Smallest sizes a drag can leave: the panels' own minimums, and enough preview to keep editing.
const MEDIA_MIN = 200, PROPS_MIN = 240, PREVIEW_MIN = 360, TIMELINE_MIN = 160, WORKSPACE_MIN = 380;

/** Puts each finished conversion into the Media library, and at the end of V1 if the user asked for that. */
function useConvertedMedia(editor: Editor | null) {
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const job = useConversionJob();
  const output = job?.state.status === 'done' ? job.state.output : null;
  const addToTimeline = job?.addToTimeline ?? false;
  const add = editor?.addMedia;
  const place = editor?.placeMedia;
  const main = editor?.project.tracks.find((t) => t.kind === 'video' && t.magnetic)?.id;
  useEffect(() => {
    if (!output || !add || !place || imported.has(output)) return;
    imported.add(output);
    const file = output;
    const addMedia = add;
    const placeMedia = place;
    function attempt() {
      if (!mounted.current) return;
      setPending(true);
      importMedia(file).then((media) => {
        if (!mounted.current) return;
        addMedia(media);
        // V1 is magnetic, so the clip goes after its last clip whatever time is passed.
        if (addToTimeline && main) placeMedia(media.id, main, 0);
      }, (error: unknown) => {
        imported.delete(file);
        reportError(translate('couldNotAddTheConvertedVideo'), error, { label: translate('projectHomeRetry'), run: attempt });
      }).finally(() => setPending(false));
    }
    attempt();
  }, [output, add, place, addToTimeline, main]);
  return { pending };
}

/** `files` were dropped on the project library to start this project; they are imported once and placed on V1. */
function EditorApp({ id, initial, draft, files, onHome }: { id: string; initial: Project; draft: boolean; files?: PickedFile[]; onHome: (project: Project) => void }) {
  const mode = useLayoutMode();
  const sizes = usePanelSizes();
  const editorRoot = useRef<HTMLDivElement>(null);
  const editor = useProject(id, initial, draft);
  const [pendingImports, setPendingImports] = useState(false);
  const [mediaRevision, setMediaRevision] = useState(0);
  const job = useConversionJob();
  const [exporting, setExporting] = useState(false);
  const [settings, setSettings] = useState(false);
  const [converting, setConverting] = useState<Pick<Media, 'id' | 'name'> | null>(null);
  const converted = useConvertedMedia(editor);
  const imports = useImports(editor);
  // Tablets keep the media library in a drawer over the preview, opened from a rail.
  const [library, setLibrary] = useState(false);
  const ready = !!editor;
  const dropped = useRef(files);
  useEffect(() => {
    const batch = dropped.current, main = editor?.project.tracks.find((t) => t.kind === 'video' && t.magnetic)?.id;
    if (!ready || !batch || !main) return;
    dropped.current = undefined;
    void imports.ingest(batch, { trackId: main, timeFor: () => 0 });
  }, [ready]);

  if (!editor) return null;

  const { project } = editor;
  const current = editor;
  const totalTime = fmtTime(editor.layout.end);
  const clipCount = videoTracks(project).reduce((n, t) => n + t.clips.length, 0);

  function leave() {
    if (pendingImports || imports.pending || converted.pending || job) {
      reportError(translate('cannotLeaveTheEditorYet'), translate('finishBeforeLeavingEditor'));
      return;
    }
    void current.flush().then(() => onHome(current.project), (error) => {
      reportError(translate('couldNotSaveTheProject'), error, { label: translate('projectHomeRetry'), run: leave }, 'save-project');
    });
  }

  const dialogs = <>
    {exporting && (
      <ExportDialog projectSlug={project.name.toLowerCase().replace(/\s+/g, '-')} source={exportSource(project, editor.layout)}
        onClose={() => setExporting(false)} />
    )}
    {settings && <SettingsDialog output={project.output} onClose={() => setSettings(false)} />}
    {converting && <ConvertDialog mediaId={converting.id} fileName={converting.name} onClose={() => setConverting(null)} />}
  </>;

  if (mode === 'phone') {
    return <>
      <PhoneEditor key={mediaRevision} editor={editor} totalTime={totalTime} onLeave={leave} onExport={() => setExporting(true)} onSettings={() => setSettings(true)}
        onImport={imports.ingest} importing={imports.pending} onConvert={setConverting} />
      {dialogs}
    </>;
  }

  const part = (selector: string) => () => editorRoot.current?.querySelector<HTMLElement>(selector) ?? null;
  const spare = (selector: string, keep: number, axis: 'x' | 'y') => () => {
    const el = editorRoot.current?.querySelector<HTMLElement>(selector);
    if (!el) return 0;
    return (axis === 'x' ? el.getBoundingClientRect().width : el.getBoundingClientRect().height) - keep;
  };
  const sized = (['media', 'props', 'timeline'] as const).filter((name) => sizes[name] !== undefined && (name !== 'media' || mode === 'desktop'));
  const media = <MediaPanel onBusy={setPendingImports} onReconnect={() => setMediaRevision(n => n + 1)} onImport={imports.ingest} importing={imports.pending} onPreview={editor.previewSource} previewing={editor.ui.source} onRemove={editor.removeMedia} project={project} onConvert={setConverting}
    onAdd={mode === 'tablet' ? (id) => editor.appendMedia([id]) : undefined} />;
  return (
    <div ref={editorRoot} className={'editor' + (mode === 'tablet' ? ' tablet' : '') + sized.map((name) => ' sized-' + name).join('')}
      style={{ '--media-w': sizes.media + 'px', '--props-w': sizes.props + 'px', '--timeline-h': sizes.timeline + 'px' } as CSSProperties}>
      <TopBar onUndo={editor.undo} onRedo={editor.redo} canUndo={editor.canUndo} canRedo={editor.canRedo} onProjects={leave} onSettings={() => setSettings(true)} saveState={editor.saveState} onSave={() => { void editor.flush().catch(() => undefined); }} projectName={project.name} onRename={editor.renameProject} clipCount={clipCount} totalTime={totalTime} onExport={() => setExporting(true)}
        onShowConversion={(id, name) => setConverting({ id, name })} />
      <div className="workspace">
        {mode === 'tablet' ? <>
          <nav className="rail" aria-label={translate('library')}>
            <button className="ib square" aria-pressed={library} aria-label={translate('library')} title={translate('library')} onClick={() => setLibrary(!library)}><LibraryGrid size={18} /></button>
            <button className="ib square" aria-label={translate('addTextAtThePlayheadT')} title={translate('addTextAtThePlayheadT')} onClick={() => editor.addText(editor.ui.playhead)}><TextT size={18} /></button>
          </nav>
          {/* Kept mounted while closed so imports and source checks carry on. */}
          <div className="library-drawer" hidden={!library}>{media}</div>
        </> : <>
          {media}
          <Splitter axis="x" label={translate('resizeLibrary')} panel={part('.media')} grow={1} min={MEDIA_MIN} room={spare('.preview', PREVIEW_MIN, 'x')}
            size={sizes.media} onResize={(size) => setPanelSize('media', size)} />
        </>}
        <PreviewPanel key={mediaRevision} editor={editor} totalTime={totalTime} />
        <Splitter axis="x" label={translate('resizeProperties')} panel={part('.props')} grow={-1} min={PROPS_MIN} room={spare('.preview', PREVIEW_MIN, 'x')}
          size={sizes.props} onResize={(size) => setPanelSize('props', size)} />
        <PropertiesPanel editor={editor} />
      </div>
      <Splitter axis="y" label={translate('resizeTimeline')} panel={part('.timeline')} grow={-1} min={TIMELINE_MIN} room={spare('.workspace', WORKSPACE_MIN, 'y')}
        size={sizes.timeline} onResize={(size) => setPanelSize('timeline', size)} />
      <Timeline key={mediaRevision} editor={editor} onDropFiles={imports.ingest} />
      {dialogs}
    </div>
  );
}

let initialProject: Promise<{ id: string; project: Project } | null> | undefined;
async function initialize() {
  const id = await activeProjectId();
  const saved = id ? await loadProject(id) : null;
  if (saved && id) return { id, project: saved };
  const entries = await listProjects();
  if (entries[0]) {
    const project = await loadProject(entries[0].id);
    if (project) { await selectProject(entries[0].id); return { id: entries[0].id, project }; }
  }
  return null;
}
export function App() {
  const [active, setActive] = useState<{ id: string; project: Project; draft?: boolean; files?: PickedFile[] } | null>(null);
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [screen, setScreen] = useState<'home' | 'editor'>('home');
  useEffect(() => {
    let live = true;
    initialProject ??= initialize();
    initialProject.then(p => { if (live) { setActive(p); setInitialized(true); } }, e => { initialProject = undefined; if (live) setError(String(e)); });
    return () => { live = false; };
  }, []);
  if (error) return <div role="alert" className="startup-error">{translate('projectHomeCouldNotOpenProjectStorage')}{error}<button className="gb" onClick={() => location.reload()}>{translate('projectHomeRetry')}</button></div>;
  if (!initialized) return <p role="status">{translate('projectHomeOpeningProjects')}</p>;
  return screen === 'home' || !active
    ? <ProjectLibrary lastOpenedId={active?.id ?? ''} onOpen={(id, project, draft, files) => { setActive({ id, project, draft, files }); setScreen('editor'); }} />
    : <EditorApp key={active.id} id={active.id} initial={active.project} draft={!!active.draft} files={active.files} onHome={project => { setActive({ id: active.id, project }); setScreen('home'); }} />;
}
