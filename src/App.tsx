import { t as translate } from './i18n/core';
import { useEffect, useState } from 'react';
import { fmtTime, videoTracks } from './editor/model';
import type { Media, Project } from './editor/model';
import { exportSource } from './editor/exportSource';
import { useProject } from './editor/useProject';
import type { Editor } from './editor/useProject';
import { useConversionJob } from './convert/job';
import { importMedia } from './media/import';
import { useImports } from './media/useImports';
import { ConvertDialog } from './components/ConvertDialog';
import { DesktopOnly } from './components/DesktopOnly';
import { ExportDialog } from './components/ExportDialog';
import { MediaPanel } from './components/MediaPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Timeline } from './components/Timeline';
import { TopBar } from './components/TopBar';
import { ProjectLibrary } from './components/ProjectLibrary';
import { activeProjectId, listProjects, loadProject, selectProject } from './editor/storage';

const MIN_WIDTH = 1280;

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

const imported = new WeakSet<File>();

/** Puts each finished conversion into the Media library, and at the end of V1 if the user asked for that. */
function useConvertedMedia(editor: Editor | null) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const job = useConversionJob();
  const output = job?.state.status === 'done' ? job.state.output : null;
  const addToTimeline = job?.addToTimeline ?? false;
  const add = editor?.addMedia;
  const place = editor?.placeMedia;
  const main = editor?.project.tracks.find((t) => t.kind === 'video' && t.magnetic)?.id;
  useEffect(() => {
    if (!output || !add || !place || imported.has(output)) return;
    imported.add(output);
    setPending(true); setError('');
    importMedia(output).then((media) => {
      add(media);
      // V1 is magnetic, so the clip goes after its last clip whatever time is passed.
      if (addToTimeline && main) place(media.id, main, 0);
    }, (error: unknown) => setError(error instanceof Error ? error.message : 'Could not import converted media.')).finally(() => setPending(false));
  }, [output, add, place, addToTimeline, main]);
  return { pending, error };
}

function EditorApp({ id, initial, draft, onHome }: { id: string; initial: Project; draft: boolean; onHome: (project: Project) => void }) {
  const width = useWindowWidth();
  const editor = useProject(id, initial, draft);
  const [navigationError, setNavigationError] = useState('');
  const [pendingImports, setPendingImports] = useState(false);
  const [mediaRevision, setMediaRevision] = useState(0);
  const job = useConversionJob();
  const [exporting, setExporting] = useState(false);
  const [settings, setSettings] = useState(false);
  const [converting, setConverting] = useState<Pick<Media, 'id' | 'name'> | null>(null);
  const converted = useConvertedMedia(editor);
  const imports = useImports(editor);

  if (width < MIN_WIDTH) return <DesktopOnly width={width} />;
  if (!editor) return null;

  const { project } = editor;
  const totalTime = fmtTime(editor.layout.end);
  const clipCount = videoTracks(project).reduce((n, t) => n + t.clips.length, 0);

  return (
    <div className="editor">
      <TopBar onProjects={() => {
        if (pendingImports || converted.pending || job) { setNavigationError('Finish importing or finish/cancel the conversion before leaving the editor.'); return; }
        void editor.flush().then(() => onHome(editor.project), e => setNavigationError(String(e)));
      }} onSettings={() => setSettings(true)} saveState={editor.saveState} onSave={() => { void editor.flush().catch(() => undefined); }} projectName={project.name} onRename={editor.renameProject} clipCount={clipCount} totalTime={totalTime} onExport={() => setExporting(true)}
        onShowConversion={(id, name) => setConverting({ id, name })} />
      {navigationError && <div role="alert" className="editor-navigation-error">{navigationError}<button onClick={() => setNavigationError('')} aria-label={translate('projectHomeDismissError')}>×</button></div>}
      {converted.error && <p role="alert" className="error">{converted.error}</p>}
      <div className="workspace">
        <MediaPanel onBusy={setPendingImports} onReconnect={() => setMediaRevision(n => n + 1)} onImport={imports.ingest} importing={imports.pending} importErrors={imports.errors} onPreview={editor.previewSource} previewing={editor.ui.source} onRemove={editor.removeMedia} project={project} onConvert={setConverting} />
        <PreviewPanel key={mediaRevision} editor={editor} totalTime={totalTime} />
        <PropertiesPanel editor={editor} />
      </div>
      <Timeline key={mediaRevision} editor={editor} onDropFiles={imports.ingest} />
      {exporting && (
        <ExportDialog projectSlug={project.name.toLowerCase().replace(/\s+/g, '-')} source={exportSource(project, editor.layout)}
          onClose={() => setExporting(false)} />
      )}
      {settings && <SettingsDialog output={project.output} onClose={() => setSettings(false)} />}
      {converting && <ConvertDialog mediaId={converting.id} fileName={converting.name} onClose={() => setConverting(null)} />}
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
  const [active, setActive] = useState<{ id: string; project: Project; draft?: boolean } | null>(null);
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [screen, setScreen] = useState<'home' | 'editor'>('home');
  const width = useWindowWidth();
  useEffect(() => {
    let live = true;
    initialProject ??= initialize();
    initialProject.then(p => { if (live) { setActive(p); setInitialized(true); } }, e => { initialProject = undefined; if (live) setError(String(e)); });
    return () => { live = false; };
  }, []);
  if (error) return <div role="alert" className="startup-error">{translate('projectHomeCouldNotOpenProjectStorage')}{error}<button className="gb" onClick={() => location.reload()}>{translate('projectHomeRetry')}</button></div>;
  if (width < MIN_WIDTH) return <DesktopOnly width={width} />;
  if (!initialized) return <p role="status">{translate('projectHomeOpeningProjects')}</p>;
  return screen === 'home' || !active
    ? <ProjectLibrary lastOpenedId={active?.id ?? ''} onOpen={(id, project, draft) => { setActive({ id, project, draft }); setScreen('editor'); }} />
    : <EditorApp key={active.id} id={active.id} initial={active.project} draft={!!active.draft} onHome={project => { setActive({ id: active.id, project }); setScreen('home'); }} />;
}
