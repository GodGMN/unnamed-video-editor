import { ALL_FORMATS, AudioBufferSink, BlobSource, CanvasSink, Input } from 'mediabunny';
import { STILL_DURATION, newId } from '../editor/model';
import type { Media } from '../editor/model';
import { removeMediaFiles, writeMediaFile, writePreview } from './files';
import type { MediaPreview } from './files';

const FORMAT_LABELS: Record<string, string> = { jpg: 'JPEG', 'x-icon': 'ICO', 'vnd.microsoft.icon': 'ICO', 'x-ms-bmp': 'BMP' };
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|avif|bmp|ico)$/i;

const isImageFile = (file: File) => file.type.startsWith('image/') || IMAGE_EXTENSIONS.test(file.name);

/** Draws `image` into a 160×90 JPEG thumbnail, letterboxed like the video ones. */
function thumbnail(image: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 160; canvas.height = 90;
  const scale = Math.min(160 / width, 90 / height);
  canvas.getContext('2d')!.drawImage(image, (160 - width * scale) / 2, (90 - height * scale) / 2, width * scale, height * scale);
  return canvas.toDataURL('image/jpeg', 0.7);
}

async function importStill(file: File): Promise<Media> {
  const image = await createImageBitmap(file).catch(() => { throw new Error('This image could not be decoded.'); });
  const id = newId();
  try {
    const format = (file.type.startsWith('image/') ? file.type.slice(6) : file.name.split('.').pop() ?? '').toLowerCase();
    const media: Media = {
      id, name: file.name, container: FORMAT_LABELS[format] ?? format.toUpperCase(),
      duration: STILL_DURATION, size: file.size, bitrate: 0,
      video: { codec: 'image', width: image.width, height: image.height, fps: 0 }, audio: null,
      decodable: true, tone: '#4A4433', seed: 0, still: true,
    };
    await writeMediaFile(id, file);
    try { await writePreview(id, { thumbnails: [thumbnail(image, image.width, image.height)], peaks: [] }); }
    catch (error) { await removeMediaFiles(id).catch(() => undefined); throw error; }
    return media;
  } finally { image.close(); }
}

export async function importMedia(file: File): Promise<Media> {
  if (isImageFile(file)) return importStill(file);
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const id = newId();
  let stored = false;
  try {
    const [video, audio, duration, format] = await Promise.all([
      input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack(), input.computeDuration(), input.getFormat(),
    ]);
    if ((!video && !audio) || !Number.isFinite(duration) || duration <= 0) throw new Error('No playable media streams were found.');
    const [videoOk, audioOk, stats] = await Promise.all([
      video ? video.canDecode() : true, audio ? audio.canDecode() : true, video?.computePacketStats(120),
    ]);
    const media: Media = {
      id, name: file.name, container: format.name, duration, size: file.size, bitrate: file.size * 8 / duration,
      video: video ? { codec: await video.getCodecParameterString() ?? video.codec ?? 'unknown', width: video.displayWidth, height: video.displayHeight, fps: stats?.averagePacketRate ?? 0 } : null,
      audio: audio ? { codec: await audio.getCodecParameterString() ?? audio.codec ?? 'unknown', sampleRate: audio.sampleRate, channels: audio.numberOfChannels } : null,
      decodable: videoOk && audioOk, tone: '#35503F', seed: 0,
    };
    await writeMediaFile(id, file);
    stored = true;
    const preview: MediaPreview = { thumbnails: [], peaks: [] };
    if (video && videoOk) {
      const sink = new CanvasSink(video, { width: 160, height: 90, fit: 'contain' });
      const count = Math.min(40, Math.max(2, Math.ceil(duration)));
      const times = Array.from({ length: count }, (_, i) => i * duration / count);
      for await (const frame of sink.canvasesAtTimestamps(times)) {
        if (frame) preview.thumbnails.push(thumbnail(frame.canvas, 160, 90));
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
    return media;
  } catch (error) {
    if (stored) await removeMediaFiles(id).catch(() => undefined);
    throw error;
  } finally { input.dispose(); }
}
