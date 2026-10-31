import { useT } from '../i18n';
import { t as translate, formatDateTime } from '../i18n/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { Project } from '../editor/model';
import { fmtShortDuration, layoutTimeline, newId } from '../editor/model';
import { seedProject } from '../editor/seed';
import { clearProject, createProject, listProjects, loadProject, selectProject, updateProjectDetails } from '../editor/storage';
import type { ProjectEntry } from '../editor/storage';
import { removeMediaFiles } from '../media/files';
import { pickFiles } from '../media/links';
import type { PickedFile } from '../media/links';
import { renderPoster } from '../projects/poster';
import { classifyDrop, projectNameFor } from '../projects/drop';
import { downloadProject, openProjectFile, packageProject, reconnectPackage } from '../projects/portable';
import { shortcut } from '../platform';
import { ActionMenu } from './ActionMenu';
import { Brand } from './Brand';
import { Dialog } from './Dialog';
import { SettingsDialog } from './SettingsDialog';
import { ChevronDown, ChevronRight, Clock, Film, LibraryGrid, Play, Plus, Search, Cog, Star } from './icons';
import { errorMessage, pushError, reportError } from '../toast/store';

type Filter = 'all' | 'recent' | 'favorites';
function ProjectArtwork({ project, hero = false }: { project: Project; hero?: boolean }) {
  const [poster, setPoster] = useState<string | null>();
  const [revision, setRevision] = useState(0);
  useEffect(() => { const refresh = () => setRevision(n => n + 1); window.addEventListener('media-preview-change', refresh); return () => window.removeEventListener('media-preview-change', refresh); }, []);
  useEffect(() => {
    let live = true;
    renderPoster(project, hero ? 960 : 240).then(src => { if (live) setPoster(src); }, error => { console.warn(error); if (live) setPoster(null); });
    return () => { live = false; };
  }, [project, hero, revision]);
  return <div className={`project-artwork ${hero ? 'hero-artwork' : ''}`}>
    {poster ? <><img className="artwork-backdrop" src={poster} alt="" /><img src={poster} alt="" /></> : poster === null && <div className="project-artwork-placeholder" aria-hidden="true"><span className="artwork-orbit" /><Film size={hero ? 56 : 24} strokeWidth={1} /><span className="artwork-lines"><i /><i /><i /><i /></span></div>}
  </div>;
}
function dateLabel(time: number) {
  const date = new Date(time), now = new Date();
  if (date.toDateString() === now.toDateString()) return translate('projectHomeToday', { time: formatDateTime(date, { hour: '2-digit', minute: '2-digit' }) });
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return translate('projectHomeYesterday');
  return formatDateTime(date, { month: 'short', day: 'numeric', ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }) });
}
function blankProject(): Project {
  const project = seedProject();
  return { ...project, name: translate('projectHomeUntitledProject'), media: {}, tracks: project.tracks.map(t => ({ ...t, clips: [] })) };
}

export function ProjectLibrary({ lastOpenedId, onOpen }: { lastOpenedId: string; onOpen: (id: string, project: Project, draft?: boolean, files?: PickedFile[]) => void }) {
  useT();
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
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
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  const refresh = async () => { setEntries(await listProjects()); };
  useEffect(() => {
    let live = true;
    setLoading(true);
    void listProjects().then(
      items => { if (live) { setEntries(items); setLoadFailed(false); } },
      e => {
        if (!live) return;
        setLoadFailed(true);
        reportError(translate('couldNotLoadYourProjects'), e, { label: translate('projectHomeRetry'), run: () => setReload(n => n + 1) });
      },
    ).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [reload]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.current?.focus(); } };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [busy]);
  async function run(label: string, action: () => Promise<void>, title = translate('projectActionFailed')) {
    if (!live.current || operation.current) return;
    operation.current = true; setBusy(label);
    try { await action(); } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        reportError(title, e, { label: translate('projectHomeRetry'), run: () => void run(label, action, title) });
      }
    } finally { operation.current = false; setBusy(''); }
  }
  const open = async (id: string) => {
    const project = await loadProject(id);
    if (!project) throw new Error(translate('projectHomeNoLongerAvailable'));
    await selectProject(id); onOpen(id, project);
  };
  const create = async (project: Project) => { const id = await createProject(project); await selectProject(id); onOpen(id, project); };
  const importFile = async (picked: PickedFile) => { await create(await openProjectFile(picked)); };
  const importProject = () => {
    if (!window.showOpenFilePicker) { importInput.current?.click(); return; }
    void run(translate('projectHomeOpeningProject'), async () => { const files = await pickFiles(); if (files[0]) await importFile(files[0]); }, translate('couldNotImportTheProject'));
  };
  /** Opens dropped project files, or starts a new project with dropped media. Project files win over media. */
  const drop = (files: File[]) => {
    if (busy || loading) return;
    const { projects, media, unsupported } = classifyDrop(files);
    if (unsupported.length) pushError({ title: translate('dropSkippedFiles'), message: translate('dropUnsupportedFiles', { value1: unsupported.map(f => f.name).join(', ') }) });
    if (projects.length && media.length) pushError({ title: translate('dropSkippedFiles'), message: translate('dropMediaWithProject', { value1: media.map(f => f.name).join(', ') }) });
    if (projects.length === 1) void run(translate('projectHomeOpeningProject'), () => importFile({ file: projects[0] }), translate('couldNotImportTheProject'));
    else if (projects.length) void run(translate('projectHomeOpeningProject'), async () => {
      for (const file of projects) {
        try { await createProject(await openProjectFile({ file })); }
        catch (e) { pushError({ title: translate('couldNotImportTheProject'), message: `${file.name}: ${errorMessage(e)}` }); }
      }
      await refresh();
    }, translate('couldNotImportTheProject'));
    else if (media.length) onOpen(newId(), { ...blankProject(), name: projectNameFor(media[0]) }, true, media.map(file => ({ file })));
  };
  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files');
  const reconnect = (entry: ProjectEntry) => {
    if (!window.showOpenFilePicker) { reconnectTarget.current = entry; reconnectInput.current?.click(); return; }
    void run(translate('projectHomeReconnectingMedia'), async () => { const files = await pickFiles(); if (files[0]) { await reconnectPackage(entry.project, files[0]); await refresh(); } }, translate('couldNotReconnectTheProjectMedia'));
  };
  const remove = async (entry: ProjectEntry) => {
    await clearProject(entry.id);
    const remaining = await listProjects(); setEntries(remaining); setDeleting(null);
    const referenced = new Set(remaining.flatMap(e => Object.keys(e.project.media)));
    for (const id of Object.keys(entry.project.media)) if (!referenced.has(id)) await removeMediaFiles(id).catch(e => console.warn('Could not clean up unreferenced media', e));
  };
  const actions = (entry: ProjectEntry) => [
    { label: translate('projectHomeRename'), run: () => { setName(entry.project.name); setRename(entry); } },
    { label: entry.favorite ? translate('projectHomeRemoveFromFavorites') : translate('projectHomeAddToFavorites'), run: () => void run(translate('projectHomeUpdatingFavorite'), async () => { await updateProjectDetails(entry.id, { favorite: !entry.favorite }); await refresh(); }, translate('couldNotUpdateTheProject')) },
    { label: translate('duplicate'), run: () => void run(translate('projectHomeDuplicatingProject'), async () => { const p = await loadProject(entry.id); if (!p) throw new Error(translate('projectNoLongerExists')); await create({ ...p, name: translate('projectHomeCopyName', { name: p.name }) }); }, translate('couldNotDuplicateTheProject')) },
    { label: translate('projectHomeDownloadProject'), separator: true, run: () => void run(translate('projectHomeDownloadProject'), async () => { downloadProject(entry.project); }, translate('couldNotDownloadTheProject')) },
    { label: translate('projectHomePackageWithMedia'), run: () => void run(translate('projectHomePackagingMedia'), async () => { const c = new AbortController(); controller.current = c; try { await packageProject(entry.project, c.signal); } finally { controller.current = null; } }, translate('couldNotPackageTheProject')) },
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
  const filterName = filter === 'favorites' ? translate('projectHomeFavorites') : filter === 'recent' ? translate('projectHomeRecentlyEdited') : translate('projectHomeAllProjects');

  return <div className="project-home"
    onDragEnter={e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current++; setDragOver(true); }}
    onDragOver={e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = busy || loading ? 'none' : 'copy'; }}
    onDragLeave={e => { if (hasFiles(e) && --dragDepth.current === 0) setDragOver(false); }}
    onDrop={e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current = 0; setDragOver(false); drop(Array.from(e.dataTransfer.files)); }}>
    {dragOver && !busy && !loading && <div className="home-drop"><div><Plus size={28} strokeWidth={1.5} /><strong>{translate('dropOnLibrary')}</strong><span>{translate('dropOnLibraryHint')}</span></div></div>}
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
          <div className="resume-details"><span className="home-eyebrow">{translate('projectHomeLastOpened')}</span><h2 title={last.project.name}>{last.project.name}</h2><p>{durations.get(last.id) ? `${fmtShortDuration(durations.get(last.id)!)} · ` : ''}{translate('projectHomeEdited')}{' '}{dateLabel(last.updatedAt).toLocaleLowerCase()}</p><button className="home-primary" disabled={!!busy} onClick={() => void run(translate('projectHomeOpeningProject'), () => open(last.id), translate('couldNotOpenTheProject'))}><Play size={15} />{translate('projectHomeContinueEditing')}</button></div>
          <div className="resume-menu"><ActionMenu label={translate('projectHomeActionsFor', { name: last.project.name })} actions={actions(last)} disabled={!!busy} /></div>
        </section>}
        {!loading && !loadFailed && !entries.length && <section className="home-first-project"><Film size={44} strokeWidth={1} /><h2>{translate('projectHomeAFreshStart')}</h2><p>{translate('projectHomeCreateAProjectToStartEditingOrImportAProjectFileFromTheNewProjectMenu')}</p></section>}
        <section className="home-projects" aria-labelledby="project-list-title">
          <div className="home-list-heading"><h2 id="project-list-title">{filterName}<span>{filtered.length}</span></h2><div className="home-search"><Search size={17} /><input ref={search} aria-label={translate('projectHomeSearchProjects')} placeholder={translate('projectHomeSearchCount', { count: entries.length })} value={query} onChange={e => setQuery(e.target.value)} /><kbd>{shortcut('K')}</kbd></div><select aria-label={translate('projectHomeSortProjects')} value={sort} onChange={e => setSort(e.target.value)}><option value="updated">{translate('projectHomeLastEdited')}</option><option value="name">{translate('projectHomeNameAZ')}</option><option value="created">{translate('projectHomeDateCreated')}</option></select></div>
          <div className="home-project-list" role="list" aria-label={translate('projectHomeProjects')}>
            {filtered.map(entry => <article key={entry.id} className="home-project-row" role="listitem">
              <button className="project-open" disabled={!!busy} aria-label={translate('projectHomeOpen', { name: entry.project.name })} onClick={() => void run(translate('projectHomeOpeningProject'), () => open(entry.id), translate('couldNotOpenTheProject'))}>
                <ProjectArtwork project={entry.project} /><span className="project-row-name"><strong><span>{entry.project.name}</span>{entry.favorite && <Star size={12} fill="currentColor" />}</strong><small>{durations.get(entry.id) ? `${fmtShortDuration(durations.get(entry.id)!)} · ${entry.project.output.width} × ${entry.project.output.height}` : translate('projectHomeEmptyProject')}</small></span><time dateTime={new Date(entry.updatedAt).toISOString()}>{dateLabel(entry.updatedAt)}</time><ChevronRight size={16} />
              </button>
              <ActionMenu contextMenuOnParent label={translate('projectHomeActionsFor', { name: entry.project.name })} actions={actions(entry)} disabled={!!busy} />
            </article>)}
            {loading && <div className="home-empty" role="status">{translate('projectHomeLoadingYourProjects')}</div>}
            {!loading && !filtered.length && entries.length > 0 && <div className="home-empty"><Search size={28} strokeWidth={1} /><h3>{query ? translate('projectHomeNoMatchingProjects') : translate('projectHomeNoFavoritesYet')}</h3><p>{query ? translate('projectHomeTryADifferentName') : translate('projectHomeAddFavoritesHint')}</p>{query && <button className="home-text-button" onClick={() => setQuery('')}>{translate('projectHomeClearSearch')}</button>}</div>}
          </div>
          <footer className="home-list-footer"><span>{query ? translate('projectHomeMatchingCount', { count: filtered.length }) : translate('projectHomeDeviceCount', { count: entries.length })}</span><span>{translate('projectHomeYourOriginalsStayWhereYouKeepThem')}</span></footer>
        </section>
        {busy && <div role="status" className="home-operation">{busy}{controller.current && <button className="home-text-button" onClick={() => controller.current?.abort()}>{translate('cancel')}</button>}</div>}
      </div>
    </main>
    <input ref={importInput} aria-label={translate('projectHomeImportProjectFile')} type="file" accept=".json,.uvepack" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void run(translate('projectHomeOpeningProject'), () => importFile({ file }), translate('couldNotImportTheProject')); e.target.value = ''; }} />
    <input ref={reconnectInput} aria-label={translate('projectHomeReconnectPackage')} type="file" accept=".uvepack" hidden onChange={e => { const file = e.target.files?.[0], target = reconnectTarget.current; if (file && target) void run(translate('projectHomeReconnectingMedia'), async () => { await reconnectPackage(target.project, { file }); await refresh(); }, translate('couldNotReconnectTheProjectMedia')); e.target.value = ''; }} />
    {settings && <SettingsDialog output={last?.project.output ?? { width: 1920, height: 1080 }} onClose={() => setSettings(false)} />}
    {rename && <Dialog id="rename-project" title={translate('renameProject2')} subtitle={translate('projectHomeChooseANameYouCanFindLater')} width={440} onClose={() => { if (!busy) setRename(null); }}><form className="dialog-body" onSubmit={e => { e.preventDefault(); const next = name.trim(); if (next) void run(translate('projectHomeRenamingProject'), async () => { await updateProjectDetails(rename.id, { name: next }); await refresh(); setRename(null); }, translate('couldNotRenameTheProject')); }}><label className="field-label">{translate('projectName')}<input className="fld" aria-label={translate('projectName')} autoFocus onFocus={e => e.target.select()} maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label><div className="dialog-actions"><button type="button" className="gb" disabled={!!busy} onClick={() => setRename(null)}>{translate('cancel')}</button><button className="primary" disabled={!!busy || !name.trim()}>{translate('projectHomeSaveName')}</button></div></form></Dialog>}
    {deleting && <Dialog id="delete-project" title={translate('projectHomeDeleteProject')} subtitle={deleting.project.name} warn width={450} onClose={() => { if (!busy) setDeleting(null); }}><div className="dialog-body"><p>{translate('projectHomeThisRemovesTheSavedEditFromThisBrowserYourOriginalMediaStaysOnDiskDownloadABackupFirstIfYouWantToKeepTheProject')}</p><div className="dialog-actions"><button className="gb" disabled={!!busy} onClick={() => setDeleting(null)}>{translate('projectHomeKeepProject')}</button><button className="home-delete" disabled={!!busy} onClick={() => void run(translate('projectHomeDeletingProject'), () => remove(deleting), translate('couldNotDeleteTheProject'))}>{translate('projectHomeDeleteProject2')}</button></div></div></Dialog>}
  </div>;
}
