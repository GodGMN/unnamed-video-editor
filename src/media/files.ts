/** Source bytes and generated previews share an OPFS directory keyed by media id. */
async function directory(id: string, create = false) {
  const root = await navigator.storage.getDirectory();
  const media = await root.getDirectoryHandle('media', { create });
  return media.getDirectoryHandle(id, { create });
}
export async function writeMediaFile(id: string, file: File) {
  const dir = await directory(id, true);
  const handle = await dir.getFileHandle('source', { create: true });
  const writer = await handle.createWritable();
  try { await writer.write(file); await writer.close(); }
  catch (error) { await writer.abort(); throw error; }
}
export async function readMediaFile(id: string): Promise<File | null> {
  try { return await (await (await directory(id)).getFileHandle('source')).getFile(); }
  catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null;
    throw error;
  }
}
export interface MediaPreview { thumbnails: string[]; peaks: number[] }
export async function writePreview(id: string, preview: MediaPreview) {
  const handle = await (await directory(id)).getFileHandle('preview.json', { create: true });
  const writer = await handle.createWritable();
  await writer.write(JSON.stringify(preview));
  await writer.close();
}
export async function readPreview(id: string): Promise<MediaPreview | null> {
  try { return JSON.parse(await (await (await (await directory(id)).getFileHandle('preview.json')).getFile()).text()); }
  catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null;
    throw error;
  }
}
export async function removeMediaFiles(id: string) {
  const root = await navigator.storage.getDirectory();
  await (await root.getDirectoryHandle('media')).removeEntry(id, { recursive: true });
}
