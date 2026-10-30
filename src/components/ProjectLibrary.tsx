import { useEffect, useRef, useState } from 'react';
import type { Project } from '../editor/model';
import { clearProject, createProject, listProjects, loadProject, selectProject } from '../editor/storage';
import type { ProjectEntry } from '../editor/storage';
import { clearPreviewCache, PREVIEW_BUDGET, previewCacheBytes, removeMediaFiles } from '../media/files';
import { pickFiles } from '../media/links';
import { downloadProject, openProjectFile, packageProject, reconnectPackage } from '../projects/portable';
import { Dialog } from './Dialog';

export function ProjectLibrary({ id, project, flush, onOpen, onClose, blocked, onReconnect }: {
  id: string; project: Project; flush: () => Promise<void>;
  onReconnect: () => void; onOpen: (id: string, project: Project) => void; onClose: () => void; blocked: boolean;
}) {
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bytes, setBytes] = useState(0);
  const packaging = useRef<AbortController | null>(null);
  const refresh = async () => { setEntries(await listProjects()); setBytes(await previewCacheBytes()); };
  useEffect(() => { void refresh().catch(e => setError(String(e))); }, []);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const open = async (key: string, p: Project) => { await selectProject(key); onOpen(key, p); };
  const create = async (p: Project) => { await flush(); await open(await createProject(p), p); };
  const importFile = (file: File) => run(async () => { await create(await openProjectFile({ file })); });
  const remove = async (entry: ProjectEntry) => {
    await flush();
    await clearProject(entry.id);
    const remaining = await listProjects();
    // Shared media IDs belong to the remaining documents. Never delete an original on disk.
    const referenced = new Set(remaining.flatMap(e => Object.keys(e.project.media)));
    for (const mediaId of Object.keys(entry.project.media)) if (!referenced.has(mediaId)) await removeMediaFiles(mediaId).catch(error => console.warn('Could not clean up unreferenced media', error));
    if (entry.id === id) {
      const next = remaining[0];
      const p = next ? await loadProject(next.id) : { ...project, name: 'Untitled project', media: {}, tracks: project.tracks.map(t => ({ ...t, clips: [] })) };
      if (p) await open(next?.id ?? await createProject(p), p);
    } else await refresh();
  };
  return <Dialog id="projects-title" title="Projects" subtitle="Edits stay in this browser. Your original files stay where you keep them." width={760} onClose={() => { if (!busy) onClose(); }}>
    <div className="dialog-body project-library">
      <fieldset disabled={busy || blocked}>
        <div className="library-toolbar">
          <button className="primary" onClick={() => void run(() => create({ ...project, name: 'Untitled project', media: {}, tracks: project.tracks.map(t => ({ ...t, clips: [] })) }))}>New project</button>
          <button className="gb" onClick={() => void run(() => create({ ...structuredClone(project), name: `${project.name} copy` }))}>Duplicate current</button>
          {window.showOpenFilePicker ? <button className="gb" onClick={() => void run(async () => {
            const picked = await pickFiles(); if (picked[0]) await create(await openProjectFile(picked[0]));
          })}>Open project file</button> : <label className="gb">Open project file<input aria-label="Open project file" type="file" accept=".json,.uvepack" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} /></label>}
        </div>
        <div className="project-list">
          {entries.map(entry => <div className="project-row" key={entry.id}>
            <div><strong>{entry.id === id ? project.name : entry.project.name}</strong><small>{entry.id === id ? 'Current project' : `Updated ${new Date(entry.updatedAt).toLocaleString()}`}</small></div>
            <button className="gb" disabled={entry.id === id} onClick={() => void run(async () => { await flush(); const p = await loadProject(entry.id); if (p) await open(entry.id, p); })}>Open</button>
            <button className="gb danger" onClick={() => { if (window.confirm(`Delete project "${entry.project.name}"? Download a backup first if you want to keep its edits. Original files will stay on disk.`)) void run(() => remove(entry)); }}>Delete</button>
          </div>)}
        </div>
        <div className="library-toolbar">
          {window.showOpenFilePicker ? <button className="gb" onClick={() => void run(async () => { const files = await pickFiles(); if (files[0]) { await reconnectPackage(project, files[0]); onReconnect(); } })}>Reconnect package</button> : <label className="gb">Reconnect package<input aria-label="Reconnect package" type="file" accept=".uvepack" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void run(async () => { await reconnectPackage(project, { file }); onReconnect(); }); e.target.value = ''; }} /></label>}
          <button className="gb" onClick={() => downloadProject(project)}>Download project</button>
          <button className="gb" onClick={() => void run(async () => { const controller = new AbortController(); packaging.current = controller; try { await packageProject(project, controller.signal); } finally { packaging.current = null; } })}>Package with media</button>
        </div>
        <p className="hint">Project downloads contain edits and media identifiers. Packages include the source files too. Reopen a package to link its contents without copying them into browser storage.</p>
      </fieldset>
      {blocked && <p role="status">Finish importing or finish/cancel the conversion before switching projects.</p>}
      <div className="cache-settings"><span>Preview cache · {(bytes / 1048576).toFixed(1)} / {PREVIEW_BUDGET / 1048576} MiB</span><button disabled={busy} className="gb" onClick={() => void run(async () => { await clearPreviewCache(); await refresh(); window.dispatchEvent(new Event('media-preview-change')); })}>Clear cache</button></div>
      <p className="hint">The preview cache has a fixed limit and can be regenerated. Existing media copies from older versions are retained until their projects are deleted or you reconnect them to originals.</p>
      {busy && <p role="status">Working… {packaging.current && <button className="gb" onClick={() => packaging.current?.abort()}>Cancel package</button>}</p>}{error && <p role="alert" className="error">{error}</p>}
    </div>
  </Dialog>;
}
