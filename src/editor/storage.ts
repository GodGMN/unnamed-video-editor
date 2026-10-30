import { t as translate } from '../i18n/core';
import { NO_FADES, NO_KEY, gainToDb, newId } from './model';
import type { Project } from './model';

export interface ProjectEntry {
  id: string;
  schema: number;
  project: Project;
  createdAt: number;
  updatedAt: number;
  favorite?: boolean;
}
let database: Promise<IDBDatabase> | undefined;
function openDb() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('unnamed-video-editor', 2);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects');
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
      const tx = request.transaction!;
      const projects = tx.objectStore('projects');
      const old = projects.get('current');
      old.onsuccess = () => {
        if (!old.result) return;
        const id = newId();
        projects.put({ ...old.result, id, createdAt: Date.now(), updatedAt: Date.now() }, id);
        projects.delete('current');
        tx.objectStore('settings').put(id, 'active');
      };
    };
    request.onblocked = () => { blocked = true; database = undefined; reject(new Error(translate('storageCloseOtherTabs'))); };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
    request.onerror = () => { database = undefined; reject(request.error); };
  });
}
async function run<T>(store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const tx = (await openDb()).transaction(store, mode);
  return new Promise((resolve, reject) => {
    const req = op(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error(translate('storageProjectFailed')));
  });
}
export async function listProjects(): Promise<ProjectEntry[]> {
  const entries = await run<ProjectEntry[]>('projects', 'readonly', s => s.getAll());
  return entries.sort((a, b) => b.updatedAt - a.updatedAt);
}
export function activeProjectId(): Promise<string | undefined> {
  return run('settings', 'readonly', s => s.get('active'));
}
export async function selectProject(id: string): Promise<void> {
  await run('settings', 'readwrite', s => s.put(id, 'active'));
}
export async function loadProject(id?: string): Promise<Project | null> {
  const key = id ?? await activeProjectId();
  if (!key) return null;
  const saved = await run<ProjectEntry | undefined>('projects', 'readonly', s => s.get(key));
  if (saved && saved.schema !== 1) throw new Error(translate('storageNeedsNewerVersion'));
  return saved ? upgrade(saved.project) : null;
}
export async function createProject(project: Project, id = newId()): Promise<string> {
  await run('projects', 'readwrite', s => s.put({ id, schema: 1, project, createdAt: Date.now(), updatedAt: Date.now() } satisfies ProjectEntry, id));
  return id;
}
export async function saveProject(project: Project, id?: string): Promise<void> {
  const key = id ?? await activeProjectId();
  if (!key) { await selectProject(await createProject(project)); return; }
  const tx = (await openDb()).transaction('projects', 'readwrite');
  await new Promise<void>((resolve, reject) => {
    const store = tx.objectStore('projects');
    const req = store.get(key);
    req.onsuccess = () => {
      if (!req.result) { tx.abort(); return; }
      store.put({ ...req.result, project, updatedAt: Date.now() }, key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error(translate('projectNoLongerExists')));
  });
}
export async function updateProjectDetails(id: string, patch: { name?: string; favorite?: boolean }): Promise<void> {
  const tx = (await openDb()).transaction('projects', 'readwrite');
  await new Promise<void>((resolve, reject) => {
    const store = tx.objectStore('projects');
    const req = store.get(id);
    req.onsuccess = () => {
      const entry: ProjectEntry | undefined = req.result;
      if (!entry) { tx.abort(); return; }
      store.put({ ...entry, ...(patch.favorite !== undefined && { favorite: patch.favorite }), project: { ...entry.project, ...(patch.name !== undefined && { name: patch.name }) } }, id);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error(translate('projectNoLongerExists')));
  });
}
export async function clearProject(id?: string): Promise<void> {
  const key = id ?? await activeProjectId();
  if (key) await run('projects', 'readwrite', s => s.delete(key));
}
/**
 * Older saves keep text tracks' clips in `items`, and the oldest have text without an x/y
 * offset; those get a zero offset. Video clips from before video fades or keys get none. Audio
 * clips from before dB gain store volume as a linear percent.
 */
export function upgrade(p: Project): Project {
  return { ...p, tracks: p.tracks.map((t) => {
    if (t.kind === 'video') return { ...t, clips: t.clips.map((c) => ({ ...NO_FADES, ...c, key: c.key ?? NO_KEY })) };
    if (t.kind === 'audio') return { ...t, clips: t.clips.map((c) => {
      if (!('vol' in c)) return c;
      const { vol, ...clip } = c as typeof c & { vol: number };
      return { ...clip, gainDb: gainToDb(vol / 100) };
    }) };
    if (t.kind !== 'text') return t;
    const { items, ...track } = t as typeof t & { items?: typeof t.clips };
    const clips = (track.clips ?? items ?? []).map((x) => ({ ...x, x: x.x ?? 0, y: x.y ?? 0 }));
    return { ...track, clips: clips.sort((a, b) => a.start - b.start) };
  }) };
}
