import { t as translate } from '../i18n/core';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import type { Media, Project } from '../editor/model';
import { readMediaFile } from '../media/files';
import { fingerprint, linkFile, copyLinks, forgetLink } from '../media/links';
import type { PickedFile } from '../media/links';
import { parseDocument, projectDocument, remapMedia } from './document';

const MAGIC = new TextEncoder().encode('UVEPACK1');
const MAX_DOCUMENT = 16 * 1024 * 1024;
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function downloadProject(project: Project) {
  download(new Blob([JSON.stringify(projectDocument(project))], { type: 'application/json' }), `${project.name}.uve.json`);
}
export async function packageProject(project: Project, signal?: AbortSignal) {
  // Invoke the picker before awaiting media reads, while user activation is available.
  const handle = await window.showSaveFilePicker?.({ suggestedName: `${project.name}.uvepack` });
  const sources: File[] = [];
  const copy = structuredClone(project);
  for (const media of Object.values(copy.media)) {
    signal?.throwIfAborted();
    const file = await readMediaFile(media.id);
    if (!file) throw new Error(translate('portableReconnectBeforePackaging', { name: media.name }));
    media.fingerprint = await fingerprint(file);
    sources.push(file);
  }
  const manifest = new TextEncoder().encode(JSON.stringify(projectDocument(copy)));
  if (manifest.byteLength > MAX_DOCUMENT) throw new Error(translate('portableDocumentTooLarge'));
  const header = new Uint8Array(12); header.set(MAGIC);
  new DataView(header.buffer).setUint32(8, manifest.length, true);
  const parts = [new Blob([header, manifest]), ...sources];
  signal?.throwIfAborted();
  if (!handle) { download(new Blob(parts, { type: 'application/octet-stream' }), `${project.name}.uvepack`); return; }
  const writer = await handle.createWritable();
  try {
    for (const part of parts) {
      const reader = part.stream().getReader();
      try { while (true) { const { done, value } = await reader.read(); if (done) break; signal?.throwIfAborted(); await writer.write(value); } }
      finally { reader.releaseLock(); }
    }
    await writer.close();
  } catch (error) { await writer.abort(); throw error; }
}
export async function openProjectFile({ file, handle }: PickedFile): Promise<Project> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const packed = head.length === 12 && MAGIC.every((byte, i) => head[i] === byte);
  let project: Project;
  let offset = 0;
  if (packed) {
    const length = new DataView(head.buffer).getUint32(8, true);
    if (length > MAX_DOCUMENT || length + 12 > file.size) throw new Error(translate('portableInvalidHeader'));
    offset = 12 + length;
    project = parseDocument(JSON.parse(await file.slice(12, offset).text()));
    const total = Object.values(project.media).reduce((sum, m) => sum + m.size, offset);
    if (!Number.isSafeInteger(total) || total !== file.size) throw new Error(translate('portableSizeMismatch'));
  } else {
    if (file.size > MAX_DOCUMENT) throw new Error(translate('portableDocumentExceeds'));
    project = parseDocument(JSON.parse(await file.text()));
  }
  const imported = remapMedia(project);
  if (packed) {
    const pending: { id: string; media: Media; source: File; offset: number }[] = [];
    for (const media of Object.values(project.media)) {
      const source = new File([file.slice(offset, offset + media.size)], media.name, { lastModified: media.lastModified ?? file.lastModified });
      if (media.fingerprint && await fingerprint(source) !== media.fingerprint) throw new Error(translate('portableMediaDamaged', { name: media.name }));
      pending.push({ id: imported.mapping.get(media.id)!, media, source, offset }); offset += media.size;
    }
    const stored: string[] = [];
    try {
      for (const item of pending) {
        await linkFile(item.id, item.source, handle, { offset: item.offset, size: item.media.size });
        stored.push(item.id);
      }
    } catch (error) {
      await Promise.all(stored.map(id => forgetLink(id)));
      throw error;
    }
  }
  return imported.project;
}
export async function reconnectMedia(media: Media, picked: PickedFile) {
  const { file, handle } = picked;
  if (file.size !== media.size) throw new Error(translate('portableDifferentSize'));
  if (media.fingerprint) {
    if (await fingerprint(file) !== media.fingerprint) throw new Error(translate('portableNotOriginal'));
  } else {
    // Legacy projects lack a signature. Probe streams and duration rather than accepting a name alone.
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const [duration, video, audio] = await Promise.all([input.computeDuration(), input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]);
      if (file.name !== media.name || Math.abs(duration - media.duration) > 0.1 ||
        !!video !== !!media.video || !!audio !== !!media.audio ||
        (media.video && video && (video.displayWidth !== media.video.width || video.displayHeight !== media.video.height))) throw new Error(translate('portableMetadataMismatch'));
    } finally { input.dispose(); }
  }
  await linkFile(media.id, file, handle);
}

export async function reconnectPackage(project: Project, picked: PickedFile) {
  const restored = await openProjectFile(picked);
  try {
    const matches: { from: string; to: string }[] = [];
    for (const media of Object.values(project.media)) {
      const candidate = Object.values(restored.media).find(m => m.size === media.size &&
        (media.fingerprint ? media.fingerprint === m.fingerprint : m.name === media.name && Math.abs(m.duration - media.duration) < 0.1));
      if (!candidate || !await readMediaFile(candidate.id)) throw new Error(translate('portableMissingInPackage', { name: media.name }));
      matches.push({ from: candidate.id, to: media.id });
    }
    await copyLinks(matches);
  } finally {
    for (const id of Object.keys(restored.media)) await forgetLink(id);
  }
}
