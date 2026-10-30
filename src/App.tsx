import { useEffect, useState } from 'react';
import { MAIN_IDS, MEDIA, fmtTime } from './editor/model';
import type { ClipId, MediaItem } from './editor/model';
import { exportSource } from './editor/exportSource';
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
const PROJECT_NAME = 'Weekend trip';

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
  const project = useProject();
  const [exporting, setExporting] = useState(false);
  const [converting, setConverting] = useState<MediaItem | null>(null);

  if (width < MIN_WIDTH) return <DesktopOnly width={width} />;

  const { sel } = project.state;
  // Clip and audio selections share the trim scrubber and clip panels; other selections keep the last clip.
  const clipId: ClipId = sel.kind === 'clip' || sel.kind === 'audio' ? sel.id : 'b';
  const totalTime = fmtTime(project.layout.seqEnd);

  return (
    <div className="editor">
      <TopBar projectName={PROJECT_NAME} clipCount={MAIN_IDS.length} totalTime={totalTime} onExport={() => setExporting(true)} />
      <div className="workspace">
        <MediaPanel media={MEDIA} onConvert={setConverting} />
        <PreviewPanel project={project} clipId={clipId} totalTime={totalTime} />
        <PropertiesPanel project={project} clipId={clipId} />
      </div>
      <Timeline project={project} />
      {exporting && (
        <ExportDialog projectSlug={PROJECT_NAME.toLowerCase().replace(/\s+/g, '-')} source={exportSource(project.state, project.layout)}
          onClose={() => setExporting(false)} />
      )}
      {converting && <ConvertDialog fileName={converting.name} onClose={() => setConverting(null)} />}
    </div>
  );
}
