import { linkedFile, forgetLink, mediaTransaction } from './links';
/** Source bytes and generated previews are keyed by media id: in OPFS when the origin is secure, else IndexedDB. */
interface Store {
  read(id: string, name: string): Promise<File | null>;
  remove(id: string): Promise<void>;
}

async function directory(id: string, create = false) {
  const root = await navigator.storage.getDirectory();
  const media = await root.getDirectoryHandle('media', { create });
  return media.getDirectoryHandle(id, { create });
}
function notFound(error: unknown) {
  return error instanceof DOMException && error.name === 'NotFoundError';
}
const opfs: Store = {
  async read(id, name) {
    try { return await (await (await directory(id)).getFileHandle(name)).getFile(); }
    catch (error) { if (notFound(error)) return null; throw error; }
  },
  async remove(id) {
    const root = await navigator.storage.getDirectory();
    await (await root.getDirectoryHandle('media')).removeEntry(id, { recursive: true });
  },
};

// Plain-HTTP origins (e.g. a LAN address) are not secure contexts, so navigator.storage is undefined there.
let database: Promise<IDBDatabase> | null = null;
function request<T>(r: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  database ??= new Promise((resolve, reject) => {
    const open = indexedDB.open('media', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('files');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => { database = null; reject(open.error); };
  });
  const tx = (await database).transaction('files', mode);
  const result = await request(run(tx.objectStore('files')));
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error); });
  return result;
}
const idb: Store = {
  async read(id, name) {
    const blob: Blob | undefined = await transaction('readonly', (s) => s.get(`${id}/${name}`));
    return blob ? new File([blob], name, { type: blob.type }) : null;
  },
  async remove(id) { await transaction('readwrite', (s) => s.delete(IDBKeyRange.bound(`${id}/`, `${id}/￿`))); },
};

const store = () => typeof navigator.storage?.getDirectory === 'function' ? opfs : idb;

export async function readMediaFile(id: string): Promise<File | null> {
  const linked = await linkedFile(id);
  return linked.linked ? linked.file : store().read(id, 'source');
}
export interface MediaPreview { thumbnails: string[]; peaks: number[] }
export const PREVIEW_BUDGET = 128 * 1024 * 1024;
interface CachedPreview { id: string; blob: Blob; used: number }
export async function writePreview(id: string, preview: MediaPreview): Promise<void> {
  const blob = new Blob([JSON.stringify(preview)], { type: 'application/json' });
  if (blob.size > PREVIEW_BUDGET) return;
  try {
    await mediaTransaction('previews', 'readwrite', store => {
      const request = store.getAll();
      request.onsuccess = () => {
        const entries: CachedPreview[] = request.result;
        const others = entries.filter(e => e.id !== id).sort((a, b) => a.used - b.used);
        let size = others.reduce((n, e) => n + e.blob.size, blob.size);
        for (const entry of others) {
          if (size <= PREVIEW_BUDGET) break;
          store.delete(entry.id); size -= entry.blob.size;
        }
        store.put({ id, blob, used: Date.now() } satisfies CachedPreview, id);
      };
      return request;
    });
  } catch (error) { if (!(error instanceof DOMException && error.name === 'QuotaExceededError')) throw error; }
}
export async function readPreview(id: string): Promise<MediaPreview | null> {
  const entry = await mediaTransaction<CachedPreview | undefined>('previews', 'readonly', s => s.get(id));
  return entry ? JSON.parse(await entry.blob.text()) : null;
}
export async function previewCacheBytes(): Promise<number> {
  const entries = await mediaTransaction<CachedPreview[]>('previews', 'readonly', s => s.getAll());
  return entries.reduce((n, e) => n + e.blob.size, 0);
}
export async function clearPreviewCache(): Promise<void> {
  await mediaTransaction('previews', 'readwrite', s => s.clear());
}
export async function removeMediaFiles(id: string) {
  await forgetLink(id);
  await mediaTransaction('previews', 'readwrite', s => s.delete(id));
  try { await store().remove(id); } catch (error) { if (!notFound(error)) throw error; }
}

export async function removeLegacyCopy(id: string) {
  try { await store().remove(id); } catch (error) { if (!notFound(error)) throw error; }
}
