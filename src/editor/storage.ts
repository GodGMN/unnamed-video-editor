import { NO_FADES } from './model';
import type { Project } from './model';

/*
 * Persists the current project to IndexedDB. Only the project document is stored here;
 * media file bytes are stored separately by the import code.
 */

const DB_NAME = 'unnamed-video-editor';
const STORE = 'projects';
const KEY = 'current';
/** Bump when `Project` changes shape; older saves are then ignored and the seed loads instead. */
const SCHEMA = 1;

interface Saved {
  schema: number;
  project: Project;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const req = op(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

/** The saved project, or null when there is none (or it's from an older schema). */
export async function loadProject(): Promise<Project | null> {
  const saved = await run<Saved | undefined>('readonly', (s) => s.get(KEY));
  return saved?.schema === SCHEMA ? upgrade(saved.project) : null;
}

/** Saves from before text items had an x/y offset get a zero offset, and video clips from before video fades get none. */
function upgrade(p: Project): Project {
  return { ...p, tracks: p.tracks.map((t) => t.kind === 'text'
    ? { ...t, items: t.items.map((x) => ({ ...x, x: x.x ?? 0, y: x.y ?? 0 })) }
    : t.kind === 'video' ? { ...t, clips: t.clips.map((c) => ({ ...NO_FADES, ...c })) }
    : t) };
}

export function saveProject(project: Project): Promise<void> {
  const saved: Saved = { schema: SCHEMA, project };
  return run('readwrite', (s) => s.put(saved, KEY)).then(() => undefined);
}

export function clearProject(): Promise<void> {
  return run('readwrite', (s) => s.delete(KEY));
}
