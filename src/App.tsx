import { useEffect, useState } from 'react';
import { fmtTime, videoTracks } from './editor/model';
import type { Media } from './editor/model';
import { exportSource } from './editor/exportSource';
import { useProject } from './editor/useProject';
import type { Editor } from './editor/useProject';
import { useConversionJob } from './convert/job';
import { importMedia } from './media/import';
import { ConvertDialog } from './components/ConvertDialog';
import { DesktopOnly } from './components/DesktopOnly';
import { ExportDialog } from './components/ExportDialog';
import { MediaPanel } from './components/MediaPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Timeline } from './components/Timeline';
import { TopBar } from './components/TopBar';

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
  const job = useConversionJob();
  const output = job?.state.status === 'done' ? job.state.output : null;
  const addToTimeline = job?.addToTimeline ?? false;
  const add = editor?.addMedia;
  const place = editor?.placeMedia;
  const main = editor?.project.tracks.find((t) => t.kind === 'video' && t.magnetic)?.id;
  useEffect(() => {
    if (!output || !add || !place || imported.has(output)) return;
    imported.add(output);
    importMedia(output).then((media) => {
      add(media);
      // V1 is magnetic, so the clip goes after its last clip whatever time is passed.
      if (addToTimeline && main) place(media.id, main, 0);
    }, (error: unknown) => console.error('[convert] could not add the copy to the Media library', error));
  }, [output, add, place, addToTimeline, main]);
}

export function App() {
  const width = useWindowWidth();
  const editor = useProject();
  const [exporting, setExporting] = useState(false);
  const [converting, setConverting] = useState<Pick<Media, 'id' | 'name'> | null>(null);
  useConvertedMedia(editor);

  if (width < MIN_WIDTH) return <DesktopOnly width={width} />;
  // The saved project loads from IndexedDB in a few milliseconds.
  if (!editor) return null;

  const { project } = editor;
  const totalTime = fmtTime(editor.layout.end);
  const clipCount = videoTracks(project).reduce((n, t) => n + t.clips.length, 0);

  return (
    <div className="editor">
      <TopBar projectName={project.name} clipCount={clipCount} totalTime={totalTime} onExport={() => setExporting(true)}
        onShowConversion={(id, name) => setConverting({ id, name })} />
      <div className="workspace">
        <MediaPanel onImport={editor.addMedia} onPreview={editor.previewSource} previewing={editor.ui.source} onRemove={editor.removeMedia} project={project} onConvert={setConverting} />
        <PreviewPanel editor={editor} totalTime={totalTime} />
        <PropertiesPanel editor={editor} />
      </div>
      <Timeline editor={editor} />
      {exporting && (
        <ExportDialog projectSlug={project.name.toLowerCase().replace(/\s+/g, '-')} source={exportSource(project, editor.layout)}
          onClose={() => setExporting(false)} />
      )}
      {converting && <ConvertDialog mediaId={converting.id} fileName={converting.name} onClose={() => setConverting(null)} />}
    </div>
  );
}
