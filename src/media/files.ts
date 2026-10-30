/** Source bytes and generated previews are keyed by media id: in OPFS when the origin is secure, else IndexedDB. */
interface Store {
  write(id: string, name: string, data: Blob): Promise<void>;
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
  async write(id, name, data) {
    const handle = await (await directory(id, true)).getFileHandle(name, { create: true });
    const writer = await handle.createWritable();
    try { await writer.write(data); await writer.close(); }
    catch (error) { await writer.abort(); throw error; }
  },
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
  async write(id, name, data) { await transaction('readwrite', (s) => s.put(data, `${id}/${name}`)); },
  async read(id, name) {
    const blob: Blob | undefined = await transaction('readonly', (s) => s.get(`${id}/${name}`));
    return blob ? new File([blob], name, { type: blob.type }) : null;
  },
  async remove(id) { await transaction('readwrite', (s) => s.delete(IDBKeyRange.bound(`${id}/`, `${id}/￿`))); },
};

const store = () => typeof navigator.storage?.getDirectory === 'function' ? opfs : idb;

export async function writeMediaFile(id: string, file: File) {
  await store().write(id, 'source', file);
}
export function readMediaFile(id: string): Promise<File | null> {
  return store().read(id, 'source');
}
export interface MediaPreview { thumbnails: string[]; peaks: number[] }
export async function writePreview(id: string, preview: MediaPreview) {
  await store().write(id, 'preview.json', new Blob([JSON.stringify(preview)], { type: 'application/json' }));
}
export async function readPreview(id: string): Promise<MediaPreview | null> {
  const file = await store().read(id, 'preview.json');
  return file ? JSON.parse(await file.text()) : null;
}
export function removeMediaFiles(id: string) {
  return store().remove(id);
}
