import { useEffect, useState } from 'react';
import { fmtTime, videoTracks } from './editor/model';
import type { Media } from './editor/model';
import { useProject } from './editor/useProject';
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

export function App() {
  const width = useWindowWidth();
  const editor = useProject();
  const [exporting, setExporting] = useState(false);
  const [converting, setConverting] = useState<Media | null>(null);

  if (width < MIN_WIDTH) return <DesktopOnly width={width} />;
  // The saved project loads from IndexedDB in a few milliseconds.
  if (!editor) return null;

  const { project } = editor;
  const totalTime = fmtTime(editor.layout.end);
  const clipCount = videoTracks(project).reduce((n, t) => n + t.clips.length, 0);

  return (
    <div className="editor">
      <TopBar projectName={project.name} clipCount={clipCount} totalTime={totalTime} onExport={() => setExporting(true)} />
      <div className="workspace">
        <MediaPanel project={project} onConvert={setConverting} />
        <PreviewPanel editor={editor} totalTime={totalTime} />
        <PropertiesPanel editor={editor} />
      </div>
      <Timeline editor={editor} />
      {exporting && (
        <ExportDialog projectSlug={project.name.toLowerCase().replace(/\s+/g, '-')} duration={totalTime} onClose={() => setExporting(false)} />
      )}
      {converting && <ConvertDialog fileName={converting.name} onClose={() => setConverting(null)} />}
    </div>
  );
}
