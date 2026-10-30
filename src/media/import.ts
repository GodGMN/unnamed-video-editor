import { t as translate } from '../i18n/core';
import { ALL_FORMATS, AudioBufferSink, BlobSource, CanvasSink, Input } from 'mediabunny';
import { STILL_DURATION, animationDuration, newId } from '../editor/model';
import type { Media } from '../editor/model';
import { removeMediaFiles, writePreview, readPreview } from './files';
import type { MediaPreview } from './files';
import { fingerprint, linkFile } from './links';
import type { ReadHandle } from './links';
import { imageType, openAnimation } from './animation';

const FORMAT_LABELS: Record<string, string> = { jpg: 'JPEG', apng: 'APNG', 'x-icon': 'ICO', 'vnd.microsoft.icon': 'ICO', 'x-ms-bmp': 'BMP' };
const IMAGE_EXTENSIONS = /\.(a?png|jpe?g|webp|gif|avif|bmp|ico)$/i;
/** Most thumbnails kept across one loop of an animation. */
const ANIMATION_THUMBNAILS = 12;

const isImageFile = (file: File) => file.type.startsWith('image/') || IMAGE_EXTENSIONS.test(file.name);

/** Draws a letterboxed JPEG at thumbnail or project-cover resolution. */
function thumbnail(image: CanvasImageSource, width: number, height: number, target = 160) {
  const canvas = document.createElement('canvas');
  canvas.width = target; canvas.height = Math.round(target * 9 / 16);
  const scale = Math.min(canvas.width / width, canvas.height / height);
  canvas.getContext('2d')!.drawImage(image, (canvas.width - width * scale) / 2, (canvas.height - height * scale) / 2, width * scale, height * scale);
  return canvas.toDataURL('image/jpeg', 0.7);
}

async function importStill(file: File, handle?: ReadHandle): Promise<Media> {
  const image = await createImageBitmap(file).catch(() => { throw new Error(translate('thisImageCouldNotBeDecoded')); });
  const id = newId();
  try {
    const format = (file.type.startsWith('image/') ? file.type.slice(6) : file.name.split('.').pop() ?? '').toLowerCase();
    const container = FORMAT_LABELS[format] ?? format.toUpperCase();
    const thumbnails: string[] = [];
    const animation = await openAnimation(file, imageType(container), (frame, i, count) => {
      if (Math.floor(i * ANIMATION_THUMBNAILS / count) !== Math.floor((i - 1) * ANIMATION_THUMBNAILS / count))
        thumbnails.push(thumbnail(frame, frame.displayWidth, frame.displayHeight));
    }).catch(() => null);
    animation?.decoder.close();
    const media: Media = {
      id, fingerprint: await fingerprint(file), lastModified: file.lastModified, name: file.name, container,
      duration: animation ? animationDuration(animation.loop) : STILL_DURATION, size: file.size, bitrate: 0,
      video: { codec: 'image', width: image.width, height: image.height, fps: animation ? animation.starts.length / animation.loop : 0 }, audio: null,
      decodable: true, tone: '#4A4433', seed: 0, still: true, ...(animation && { animation: animation.loop }),
    };
    if (!animation) thumbnails.push(thumbnail(image, image.width, image.height));
    await linkFile(id, file, handle);
    try { await writePreview(id, { thumbnails, peaks: [], cover: thumbnail(image, image.width, image.height, 960) }); }
    catch (error) { await removeMediaFiles(id).catch(() => undefined); throw error; }
    return media;
  } finally { image.close(); }
}



export async function importMedia(file: File, handle?: ReadHandle): Promise<Media> {
  if (isImageFile(file)) return importStill(file, handle);
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const id = newId();
  let stored = false;
  try {
    const [video, audio, duration, format] = await Promise.all([
      input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack(), input.computeDuration(), input.getFormat(),
    ]);
    if ((!video && !audio) || !Number.isFinite(duration) || duration <= 0) throw new Error(translate('noPlayableMediaStreamsWereFound'));
    const [videoOk, audioOk, stats] = await Promise.all([
      video ? video.canDecode() : true, audio ? audio.canDecode() : true, video?.computePacketStats(120),
    ]);
    const media: Media = {
      id, fingerprint: await fingerprint(file), lastModified: file.lastModified, name: file.name, container: format.name, duration, size: file.size, bitrate: file.size * 8 / duration,
      video: video ? { codec: await video.getCodecParameterString() ?? video.codec ?? 'unknown', width: video.displayWidth, height: video.displayHeight, fps: stats?.averagePacketRate ?? 0 } : null,
      audio: audio ? { codec: await audio.getCodecParameterString() ?? audio.codec ?? 'unknown', sampleRate: audio.sampleRate, channels: audio.numberOfChannels } : null,
      decodable: videoOk && audioOk, tone: '#35503F', seed: 0,
    };
    await linkFile(id, file, handle);
    stored = true;
    await generatePreview(media, video, audio, videoOk, audioOk);
    return media;
  } catch (error) {
    if (stored) await removeMediaFiles(id).catch(() => undefined);
    throw error;
  } finally { input.dispose(); }
}

async function generatePreview(media: Media, video: Awaited<ReturnType<Input['getPrimaryVideoTrack']>>, audio: Awaited<ReturnType<Input['getPrimaryAudioTrack']>>, videoOk: boolean, audioOk: boolean) {
  const { duration, id } = media;
  const preview: MediaPreview = { thumbnails: [], peaks: [] };
  if (video && videoOk) {
    const cover = await new CanvasSink(video, { width: 960, height: 540, fit: 'contain' }).getCanvas(0);
    if (cover) preview.cover = thumbnail(cover.canvas, 960, 540, 960);
    const sink = new CanvasSink(video, { width: 160, height: 90, fit: 'contain' });
    const count = Math.min(40, Math.max(2, Math.ceil(duration)));
    const times = Array.from({ length: count }, (_, i) => i * duration / count);
    for await (const frame of sink.canvasesAtTimestamps(times)) {
      if (!frame) continue;
      const canvas = document.createElement('canvas');
      canvas.width = 160; canvas.height = 90;
      canvas.getContext('2d')!.drawImage(frame.canvas, 0, 0);
      preview.thumbnails.push(canvas.toDataURL('image/jpeg', 0.7));
    }
  }
  if (audio && audioOk) {
    const count = Math.min(20000, Math.max(100, Math.ceil(duration * 30)));
    preview.peaks = Array(count).fill(0);
    for await (const { buffer, timestamp } of new AudioBufferSink(audio).buffers()) {
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const samples = buffer.getChannelData(channel);
        for (let i = 0; i < samples.length; i++) {
          const bin = Math.floor((timestamp + i / buffer.sampleRate) / duration * count);
          if (bin >= 0 && bin < count) preview.peaks[bin] = Math.max(preview.peaks[bin], Math.abs(samples[i]));
        }
      }
    }
  }
  await writePreview(id, preview);
}
export async function regeneratePreview(media: Media, file: File) {
  if (media.still) {
    const generated = await importStill(file);
    try { const preview = await readPreview(generated.id); if (preview) await writePreview(media.id, preview); } finally { await removeMediaFiles(generated.id); }
    window.dispatchEvent(new Event('media-preview-change')); return;
  }
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    await generatePreview(media, video, audio, video ? await video.canDecode() : false, audio ? await audio.canDecode() : false);
    window.dispatchEvent(new Event('media-preview-change'));
  } finally { input.dispose(); }
}
