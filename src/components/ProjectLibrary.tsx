import { useT } from '../i18n';
import { t as translate } from '../i18n/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../editor/model';
import { fmtShortDuration, layoutTimeline, newId } from '../editor/model';
import { seedProject } from '../editor/seed';
import { clearProject, createProject, listProjects, loadProject, selectProject, updateProjectDetails } from '../editor/storage';
import type { ProjectEntry } from '../editor/storage';
import { removeMediaFiles } from '../media/files';
import { useMediaPreview } from '../media/PreviewStrip';
import { pickFiles } from '../media/links';
import type { PickedFile } from '../media/links';
import { downloadProject, openProjectFile, packageProject, reconnectPackage } from '../projects/portable';
import { ActionMenu } from './ActionMenu';
import { Brand } from './Brand';
import { Dialog } from './Dialog';
import { SettingsDialog } from './SettingsDialog';
import { ChevronDown, ChevronRight, Clock, Film, LibraryGrid, Play, Plus, Search, Cog, Star } from './icons';

type Filter = 'all' | 'recent' | 'favorites';
function artworkId(project: Project) {
  return project.tracks.flatMap(t => t.kind === 'video' ? t.clips.map(c => c.mediaId) : []).find(id => project.media[id]?.video) ?? Object.values(project.media).find(m => m.video)?.id ?? '';
}
function ProjectArtwork({ project, hero = false }: { project: Project; hero?: boolean }) {
  const preview = useMediaPreview(artworkId(project));
  const thumbnail = hero ? preview?.cover ?? preview?.thumbnails[0] : preview?.thumbnails[0];
  return <div className={`project-artwork ${hero ? 'hero-artwork' : ''}`}>
    {thumbnail ? <img src={thumbnail} alt="" /> : <div className="project-artwork-placeholder" aria-hidden="true"><span className="artwork-orbit" /><Film size={hero ? 56 : 24} strokeWidth={1} /><span className="artwork-lines"><i /><i /><i /><i /></span></div>}
  </div>;
}
function dateLabel(time: number) {
  const date = new Date(time), now = new Date();
  if (date.toDateString() === now.toDateString()) return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }) });
}
function blankProject(): Project {
  const project = seedProject();
  return { ...project, name: 'Untitled project', media: {}, tracks: project.tracks.map(t => ({ ...t, clips: [] })) };
}

export function ProjectLibrary({ lastOpenedId, onOpen }: { lastOpenedId: string; onOpen: (id: string, project: Project, draft?: boolean) => void }) {
  useT();
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('updated');
  const [settings, setSettings] = useState(false);
  const [rename, setRename] = useState<ProjectEntry | null>(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<ProjectEntry | null>(null);
  const operation = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const reconnectInput = useRef<HTMLInputElement>(null);
  const reconnectTarget = useRef<ProjectEntry | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const refresh = async () => { setEntries(await listProjects()); };
  useEffect(() => {
    let live = true;
    void listProjects().then(items => { if (live) { setEntries(items); setLoading(false); } }, e => { if (live) { setError(String(e)); setLoading(false); } });
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.current?.focus(); } };
    window.addEventListener('keydown', key);
    return () => { live = false; window.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [busy]);
  const run = async (label: string, action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true; setBusy(label); setError('');
    try { await action(); } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e)); }
    finally { operation.current = false; setBusy(''); }
  };
  const open = async (id: string) => {
    const project = await loadProject(id);
    if (!project) throw new Error('This project is no longer available.');
    await selectProject(id); onOpen(id, project);
  };
  const create = async (project: Project) => { const id = await createProject(project); await selectProject(id); onOpen(id, project); };
  const importFile = async (picked: PickedFile) => { await create(await openProjectFile(picked)); };
  const importProject = () => {
    if (!window.showOpenFilePicker) { importInput.current?.click(); return; }
    void run('Opening project…', async () => { const files = await pickFiles(); if (files[0]) await importFile(files[0]); });
  };
  const reconnect = (entry: ProjectEntry) => {
    if (!window.showOpenFilePicker) { reconnectTarget.current = entry; reconnectInput.current?.click(); return; }
    void run('Reconnecting media…', async () => { const files = await pickFiles(); if (files[0]) { await reconnectPackage(entry.project, files[0]); await refresh(); } });
  };
  const remove = async (entry: ProjectEntry) => {
    await clearProject(entry.id);
    const remaining = await listProjects(); setEntries(remaining); setDeleting(null);
    const referenced = new Set(remaining.flatMap(e => Object.keys(e.project.media)));
    for (const id of Object.keys(entry.project.media)) if (!referenced.has(id)) await removeMediaFiles(id).catch(e => console.warn('Could not clean up unreferenced media', e));
  };
  const actions = (entry: ProjectEntry) => [
    { label: translate('projectHomeRename'), run: () => { setName(entry.project.name); setRename(entry); } },
    { label: entry.favorite ? 'Remove from favorites' : 'Add to favorites', run: () => void run('Updating favorite…', async () => { await updateProjectDetails(entry.id, { favorite: !entry.favorite }); await refresh(); }) },
    { label: translate('duplicate'), run: () => void run('Duplicating project…', async () => { const p = await loadProject(entry.id); if (!p) throw new Error('Project no longer exists.'); await create({ ...p, name: `${p.name} copy` }); }) },
    { label: translate('projectHomeDownloadProject'), separator: true, run: () => downloadProject(entry.project) },
    { label: translate('projectHomePackageWithMedia'), run: () => void run('Packaging media…', async () => { const c = new AbortController(); controller.current = c; try { await packageProject(entry.project, c.signal); } finally { controller.current = null; } }) },
    { label: translate('projectHomeReconnectPackage'), run: () => reconnect(entry) },
    { label: translate('projectHomeDeleteProject2'), separator: true, danger: true, run: () => setDeleting(entry) },
  ];
  const favoriteCount = entries.filter(e => e.favorite).length;
  const last = entries.find(e => e.id === lastOpenedId) ?? entries[0];
  const durations = useMemo(() => new Map(entries.map(e => [e.id, layoutTimeline(e.project).end])), [entries]);
  const filtered = useMemo(() => {
    const subset = filter === 'favorites' ? entries.filter(e => e.favorite) : filter === 'recent' ? entries.slice(0, 8) : entries;
    const matching = subset.filter(e => e.project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    return [...matching].sort((a, b) => sort === 'name' ? a.project.name.localeCompare(b.project.name) : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt);
  }, [entries, filter, query, sort]);
  const filterName = filter === 'favorites' ? translate('projectHomeFavorites') : filter === 'recent' ? 'Recently edited' : translate('projectHomeAllProjects');

  return <div className="project-home">
    <aside className="home-sidebar">
      <Brand />
      <div className="home-nav-label">{translate('projectHomeLibrary')}</div>
      <nav aria-label={translate('projectHomeProjectLibrary')}>
        {([{ key: 'all', label: translate('projectHomeAllProjects'), icon: LibraryGrid, count: entries.length }, { key: 'recent', label: translate('recent'), icon: Clock, count: Math.min(entries.length, 8) }, { key: 'favorites', label: translate('projectHomeFavorites'), icon: Star, count: favoriteCount }] as const).map(item => <button key={item.key} className={`home-nav ${filter === item.key ? 'active' : ''}`} aria-current={filter === item.key ? 'page' : undefined} onClick={() => { setFilter(item.key); setQuery(''); }}><item.icon size={18} /><span>{item.label}</span><small>{item.count}</small></button>)}
      </nav>
      <div className="home-sidebar-bottom"><button className="home-nav" onClick={() => setSettings(true)}><Cog size={18} /><span>{translate('settings')}</span></button><p><i />{translate('projectHomeSavedOnThisDevice')}</p></div>
    </aside>
    <main className="home-main">
      <div className="home-content">
        <header className="home-heading"><div><h1>{translate('projectHomeWelcomeBack')}<span>.</span></h1><p>{translate('projectHomePickUpYourEditOrStartSomethingNew')}</p></div><div className="home-create"><button className="home-primary" disabled={!!busy || loading} onClick={() => onOpen(newId(), blankProject(), true)}><Plus size={17} />{translate('projectHomeNewProject')}</button><ActionMenu label={translate('projectHomeMoreCreationOptions')} disabled={!!busy || loading} actions={[{ label: translate('projectHomeImportProjectFile'), run: importProject }]}><ChevronDown size={17} /></ActionMenu></div></header>
        {last && <section className="home-resume" aria-label={translate('projectHomeLastOpenedProject')}>
          <ProjectArtwork project={last.project} hero />
          <div className="resume-details"><span className="home-eyebrow">{translate('projectHomeLastOpened')}</span><h2 title={last.project.name}>{last.project.name}</h2><p>{durations.get(last.id) ? `${fmtShortDuration(durations.get(last.id)!)} · ` : ''}{translate('projectHomeEdited')}{' '}{dateLabel(last.updatedAt).toLocaleLowerCase()}</p><button className="home-primary" disabled={!!busy} onClick={() => void run('Opening project…', () => open(last.id))}><Play size={15} />{translate('projectHomeContinueEditing')}</button></div>
          <div className="resume-menu"><ActionMenu label={`Actions for ${last.project.name}`} actions={actions(last)} disabled={!!busy} /></div>
        </section>}
        {!loading && !entries.length && <section className="home-first-project"><Film size={44} strokeWidth={1} /><h2>{translate('projectHomeAFreshStart')}</h2><p>{translate('projectHomeCreateAProjectToStartEditingOrImportAProjectFileFromTheNewProjectMenu')}</p></section>}
        <section className="home-projects" aria-labelledby="project-list-title">
          <div className="home-list-heading"><h2 id="project-list-title">{filterName}<span>{filtered.length}</span></h2><div className="home-search"><Search size={17} /><input ref={search} aria-label={translate('projectHomeSearchProjects')} placeholder={`Search ${entries.length} projects…`} value={query} onChange={e => setQuery(e.target.value)} /><kbd>⌘ K</kbd></div><select aria-label={translate('projectHomeSortProjects')} value={sort} onChange={e => setSort(e.target.value)}><option value="updated">{translate('projectHomeLastEdited')}</option><option value="name">{translate('projectHomeNameAZ')}</option><option value="created">{translate('projectHomeDateCreated')}</option></select></div>
          <div className="home-project-list" role="list" aria-label={translate('projectHomeProjects')}>
            {filtered.map(entry => <article key={entry.id} className="home-project-row" role="listitem">
              <button className="project-open" disabled={!!busy} aria-label={`Open ${entry.project.name}`} onClick={() => void run('Opening project…', () => open(entry.id))}>
                <ProjectArtwork project={entry.project} /><span className="project-row-name"><strong><span>{entry.project.name}</span>{entry.favorite && <Star size={12} fill="currentColor" />}</strong><small>{durations.get(entry.id) ? `${fmtShortDuration(durations.get(entry.id)!)} · ${entry.project.output.width} × ${entry.project.output.height}` : 'Empty project'}</small></span><time dateTime={new Date(entry.updatedAt).toISOString()}>{dateLabel(entry.updatedAt)}</time><ChevronRight size={16} />
              </button>
              <ActionMenu label={`Actions for ${entry.project.name}`} actions={actions(entry)} disabled={!!busy} />
            </article>)}
            {loading && <div className="home-empty" role="status">{translate('projectHomeLoadingYourProjects')}</div>}
            {!loading && !filtered.length && entries.length > 0 && <div className="home-empty"><Search size={28} strokeWidth={1} /><h3>{query ? 'No matching projects' : 'No favorites yet'}</h3><p>{query ? 'Try a different name or clear your search.' : 'Add a project to favorites from its menu to find it here.'}</p>{query && <button className="home-text-button" onClick={() => setQuery('')}>{translate('projectHomeClearSearch')}</button>}</div>}
          </div>
          <footer className="home-list-footer"><span>{query ? `${filtered.length} matching ${filtered.length === 1 ? 'project' : 'projects'}` : `${entries.length} ${entries.length === 1 ? 'project' : 'projects'} on this device`}</span><span>{translate('projectHomeYourOriginalsStayWhereYouKeepThem')}</span></footer>
        </section>
        {error && <div role="alert" className="home-error">{error}<button onClick={() => setError('')} aria-label={translate('projectHomeDismissError')}>×</button></div>}
        {busy && <div role="status" className="home-operation">{busy}{controller.current && <button className="home-text-button" onClick={() => controller.current?.abort()}>{translate('cancel')}</button>}</div>}
      </div>
    </main>
    <input ref={importInput} aria-label={translate('projectHomeImportProjectFile')} type="file" accept=".json,.uvepack" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void run('Opening project…', () => importFile({ file })); e.target.value = ''; }} />
    <input ref={reconnectInput} aria-label={translate('projectHomeReconnectPackage')} type="file" accept=".uvepack" hidden onChange={e => { const file = e.target.files?.[0], target = reconnectTarget.current; if (file && target) void run('Reconnecting media…', async () => { await reconnectPackage(target.project, { file }); await refresh(); }); e.target.value = ''; }} />
    {settings && <SettingsDialog output={last?.project.output ?? { width: 1920, height: 1080 }} onClose={() => setSettings(false)} />}
    {rename && <Dialog id="rename-project" title={translate('renameProject2')} subtitle={translate('projectHomeChooseANameYouCanFindLater')} width={440} onClose={() => { if (!busy) setRename(null); }}><form className="dialog-body" onSubmit={e => { e.preventDefault(); const next = name.trim(); if (next) void run('Renaming project…', async () => { await updateProjectDetails(rename.id, { name: next }); await refresh(); setRename(null); }); }}><label className="field-label">{translate('projectName')}<input className="fld" aria-label={translate('projectName')} autoFocus onFocus={e => e.target.select()} maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>{error && <p role="alert" className="error">{error}</p>}<div className="dialog-actions"><button type="button" className="gb" disabled={!!busy} onClick={() => setRename(null)}>{translate('cancel')}</button><button className="primary" disabled={!!busy || !name.trim()}>{translate('projectHomeSaveName')}</button></div></form></Dialog>}
    {deleting && <Dialog id="delete-project" title={translate('projectHomeDeleteProject')} subtitle={deleting.project.name} warn width={450} onClose={() => { if (!busy) setDeleting(null); }}><div className="dialog-body"><p>{translate('projectHomeThisRemovesTheSavedEditFromThisBrowserYourOriginalMediaStaysOnDiskDownloadABackupFirstIfYouWantToKeepTheProject')}</p>{error && <p role="alert" className="error">{error}</p>}<div className="dialog-actions"><button className="gb" disabled={!!busy} onClick={() => setDeleting(null)}>{translate('projectHomeKeepProject')}</button><button className="home-delete" disabled={!!busy} onClick={() => void run('Deleting project…', () => remove(deleting))}>{translate('projectHomeDeleteProject2')}</button></div></div></Dialog>}
  </div>;
}
