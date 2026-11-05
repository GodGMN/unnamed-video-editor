import { t as translate } from '../i18n/core';
export interface ReadHandle extends FileSystemFileHandle {
  queryPermission(options: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'read' }): Promise<PermissionState>;
}
interface SaveHandle extends FileSystemFileHandle {}
declare global {
  interface Window {
    showOpenFilePicker?: (options?: { multiple?: boolean }) => Promise<ReadHandle[]>;
    showSaveFilePicker?: (options: { suggestedName: string }) => Promise<SaveHandle>;
  }
}
export interface PickedFile { file: File; handle?: ReadHandle }
export async function pickFiles(): Promise<PickedFile[]> {
  if (!window.showOpenFilePicker) throw new Error(translate('linksChooseWithFileInput'));
  const handles = await window.showOpenFilePicker({ multiple: true });
  return Promise.all(handles.map(async handle => ({ handle, file: await handle.getFile() })));
}
export async function fingerprint(file: Blob): Promise<string> {
  const length = 65536;
  const offsets = [0, Math.max(0, Math.floor(file.size / 2) - length / 2), Math.max(0, file.size - length)];
  const data = await new Blob([String(file.size), ...offsets.map(offset => file.slice(offset, offset + length))]).arrayBuffer();
  // SubtleCrypto is unavailable on plain HTTP LAN origins. This deterministic sampled signature works there too.
  let a = 2166136261, b = 5381;
  for (const byte of new Uint8Array(data)) { a = Math.imul(a ^ byte, 16777619); b = Math.imul(b, 33) ^ byte; }
  return `${file.size}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}
export interface LinkedSource {
  handle?: ReadHandle;
  file?: File;
  size: number;
  lastModified: number;
  name: string;
  type: string;
  range?: { offset: number; size: number };
  /** Large sources are stored as this many parts instead of `file`, so each write can be counted. */
  parts?: number;
}
/** Bytes per stored part: small enough that progress moves often, big enough to keep writes few. */
export const PART_SIZE = 32 * 1024 * 1024;
const partKey = (id: string, i: number) => `${id}/part/${String(i).padStart(6, '0')}`;
const partRange = (id: string) => IDBKeyRange.bound(`${id}/part/`, `${id}/part/\uffff`);
const removeParts = (id: string) => mediaTransaction('sources', 'readwrite', s => s.delete(partRange(id)));
/** The stored parts as one file, or null when some are missing. */
async function readParts(id: string, source: LinkedSource): Promise<File | null> {
  const parts = await mediaTransaction<Blob[]>('sources', 'readonly', s => s.getAll(partRange(id)));
  if (parts.length !== source.parts) return null;
  return new File(parts, source.name, { type: source.type, lastModified: source.lastModified });
}
let db: Promise<IDBDatabase> | undefined;
export async function mediaTransaction<T>(store: 'sources' | 'previews', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  db ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('editor-media-links', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('sources'); request.result.createObjectStore('previews'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { db = undefined; reject(request.error); };
  });
  const tx = (await db).transaction(store, mode);
  return new Promise<T>((resolve, reject) => {
    const request = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? new Error(translate('linksMediaStorageFailed')));
  }).catch(error => {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error(translate('linksStorageQuotaExceeded'), { cause: error });
    }
    throw error;
  });
}
const session = new Map<string, File>();
/** Stores `file` under `id`, calling `onProgress` with the bytes written so far. */
export async function linkFile(id: string, file: File, handle?: ReadHandle, range?: LinkedSource['range'], onProgress?: (written: number, total: number) => void) {
  const source: LinkedSource = { handle, range, file, size: file.size, lastModified: file.lastModified, name: file.name, type: file.type };
  onProgress?.(0, file.size);
  await removeParts(id);
  if (file.size > PART_SIZE) {
    const parts = Math.ceil(file.size / PART_SIZE);
    try {
      for (let i = 0; i < parts; i++) {
        await mediaTransaction('sources', 'readwrite', s => s.put(file.slice(i * PART_SIZE, (i + 1) * PART_SIZE), partKey(id, i)));
        onProgress?.(Math.min(file.size, (i + 1) * PART_SIZE), file.size);
      }
    } catch (error) { await removeParts(id).catch(() => undefined); throw error; }
    delete source.file; source.parts = parts;
  }
  // Keep the imported bytes so reloads do not depend on external file permissions.
  if (range && handle) {
    const archive = await handle.getFile();
    source.size = archive.size; source.lastModified = archive.lastModified;
  }
  try {
    try { await mediaTransaction('sources', 'readwrite', s => s.put(source, id)); }
    catch (error) {
      if (!handle || !(error instanceof DOMException) || error.name !== 'DataCloneError') throw error;
      await mediaTransaction('sources', 'readwrite', s => s.put({ ...source, handle: undefined }, id));
    }
  } catch (error) {
    if (source.parts) await removeParts(id).catch(() => undefined);
    throw error;
  }
  onProgress?.(file.size, file.size);
  session.set(id, file);
}
export async function linkedFile(id: string): Promise<{ linked: boolean; file: File | null }> {
  if (session.has(id)) return { linked: true, file: session.get(id)! };
  const source = await mediaTransaction<LinkedSource | undefined>('sources', 'readonly', s => s.get(id));
  if (!source) return { linked: false, file: null };
  if (source.file) return { linked: true, file: source.file };
  if (source.parts) return { linked: true, file: await readParts(id, source) };
  if (!source.handle) return { linked: true, file: null };
  try {
    if (await source.handle.queryPermission({ mode: 'read' }) !== 'granted') return { linked: true, file: null };
    const file = await source.handle.getFile();
    if (file.size !== source.size || file.lastModified !== source.lastModified) return { linked: true, file: null };
    return { linked: true, file: source.range ? new File([file.slice(source.range.offset, source.range.offset + source.range.size)], source.name, { type: source.type, lastModified: source.lastModified }) : file };
  } catch { return { linked: true, file: null }; }
}
export async function requestSourcePermission(id: string) {
  const source = await mediaTransaction<LinkedSource | undefined>('sources', 'readonly', s => s.get(id));
  return source?.handle ? await source.handle.requestPermission({ mode: 'read' }) === 'granted' : false;
}
export async function forgetLink(id: string) {
  session.delete(id);
  await mediaTransaction('sources', 'readwrite', s => { s.delete(partRange(id)); return s.delete(id); });
}

export async function sourceKind(id: string): Promise<'stored' | 'linked' | 'session' | 'legacy'> {
  const source = await mediaTransaction<LinkedSource | undefined>('sources', 'readonly', s => s.get(id));
  return source ? source.file || source.parts ? 'stored' : source.handle ? 'linked' : 'session' : 'legacy';
}

export async function copyLinks(matches: { from: string; to: string }[]) {
  await mediaTransaction('sources', 'readwrite', store => {
    for (const match of matches) {
      store.delete(partRange(match.to));
      const request = store.get(match.from);
      request.onsuccess = () => {
        if (!request.result) { store.transaction.abort(); return; }
        store.put(request.result, match.to);
      };
      const parts = store.getAll(partRange(match.from));
      parts.onsuccess = () => parts.result.forEach((part: Blob, i) => store.put(part, partKey(match.to, i)));
    }
    return store.get(matches[0]?.from ?? '');
  });
  for (const match of matches) {
    const file = session.get(match.from);
    if (file) session.set(match.to, file); else session.delete(match.to);
  }
}
