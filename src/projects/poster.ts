import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { upgrade } from '../editor/storage';
import { clipEnd, videoTracks } from '../editor/model';
import type { Media, Project, VideoClip } from '../editor/model';
import { loopTime } from '../media/animation';
import { readMediaFile, readPreview, writePreview } from '../media/files';
import type { MediaPreview } from '../media/files';
import { regeneratePreview } from '../media/import';
import { renderFrame } from '../playback/compositor';

/** Largest side a hero frame decodes at, so zoomed clips stay sharp without decoding 4K. */
const SOURCE_LIMIT = 1920;

/** Media whose missing previews were already rebuilt this session, so a failing source is tried once. */
const rebuilt = new Set<string>();

function visibleClips(project: Project) {
  return videoTracks(project).filter(t => !t.hidden).flatMap(t => t.clips).filter(c => project.media[c.mediaId]?.video);
}
/** The opening frame, once the first clip has faded in. */
function posterTime(clips: VideoClip[]) {
  const first = clips.reduce((a, b) => b.start < a.start ? b : a);
  return Math.max(0, first.start + Math.min(first.fadeIn, (clipEnd(first) - first.start) / 2));
}
function previewImage(media: Media, preview: MediaPreview, sourceTime: number, large: boolean) {
  const { thumbnails, cover } = preview;
  const at = media.animation ? loopTime(sourceTime, media.animation) / media.animation : sourceTime / media.duration;
  const index = Math.min(thumbnails.length - 1, Math.max(0, Math.floor(at * thumbnails.length)));
  // The cover is the first frame in higher resolution.
  return (large || !thumbnails.length) && cover && index === 0 ? cover : thumbnails[index] ?? cover;
}
async function decoded(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}
function jpeg(frame: CanvasImageSource & { width: number; height: number }) {
  const canvas = document.createElement('canvas');
  canvas.width = frame.width; canvas.height = frame.height;
  canvas.getContext('2d')!.drawImage(frame, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}
/** Previews are letterboxed into 16:9. Returns just the picture, at its own aspect. */
async function unboxed(src: string, media: Media) {
  const image = await decoded(src);
  const { width, height } = media.video!;
  const scale = Math.min(image.naturalWidth / width, image.naturalHeight / height);
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(image, (image.naturalWidth - w) / 2, (image.naturalHeight - h) / 2, w, h, 0, 0, w, h);
  return canvas;
}
/** A frame decoded from the source itself, for artwork larger than the cached previews. Null if unreadable. */
async function sourceFrame(media: Media, file: File, sourceTime: number): Promise<ImageBitmap | HTMLCanvasElement | OffscreenCanvas | null> {
  const { width, height } = media.video!;
  const scale = Math.min(1, SOURCE_LIMIT / Math.max(width, height));
  const size = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  if (media.still) return createImageBitmap(file, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high' });
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !await track.canDecode()) return null;
    const frame = await new CanvasSink(track, { ...size, fit: 'fill', poolSize: 0 }).getCanvas(Math.min(sourceTime, media.duration - 1e-3));
    return frame?.canvas ?? null;
  } finally { input.dispose(); }
}

/**
 * The project's opening frame as composed in the editor. Small artwork draws from the cached media
 * previews so no source is decoded. Large artwork decodes each source frame once, when the source
 * is readable without asking, and keeps it with the previews. Null when the project has no video,
 * or none of it is cached yet. A clip whose preview is missing is left out, and its preview is rebuilt in the background when
 * the source can be read without asking; that announces `media-preview-change`.
 */
export async function renderPoster(saved: Project, width: number): Promise<string | null> {
  // Library entries are stored as saved, possibly by an older version.
  const project = upgrade(saved);
  const clips = visibleClips(project);
  if (!clips.length) return null;
  const time = posterTime(clips);
  const showing = clips.filter(c => time >= c.start && time < clipEnd(c));
  const large = width > 320;
  const frames = new Map<string, CanvasImageSource>();
  await Promise.all(showing.map(async clip => {
    const media = project.media[clip.mediaId];
    const sourceTime = clip.inS + time - clip.start;
    const preview = await readPreview(media.id);
    if (large && !media.animation) {
      if (preview?.poster?.time === sourceTime) { frames.set(clip.id, await decoded(preview.poster.src)); return; }
      const file = await readMediaFile(media.id).catch(() => null);
      const frame = file && await sourceFrame(media, file, sourceTime).catch(() => null);
      if (frame) {
        frames.set(clip.id, frame);
        if (preview) void writePreview(media.id, { ...preview, poster: { time: sourceTime, src: jpeg(frame) } }).catch(console.warn);
        return;
      }
    }
    const src = preview && previewImage(media, preview, sourceTime, large);
    if (src) { frames.set(clip.id, await unboxed(src, media)); return; }
    if (rebuilt.has(media.id)) return;
    rebuilt.add(media.id);
    const file = await readMediaFile(media.id).catch(() => null);
    if (file) void regeneratePreview(media, file).catch(console.warn);
  }));
  if (!frames.size) return null;
  await document.fonts.load('700 72px Figtree');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.max(1, Math.round(width * project.output.height / project.output.width));
  renderFrame(project, time, canvas.getContext('2d')!, clip => frames.get(clip.id) ?? null);
  frames.forEach(frame => { if (frame instanceof ImageBitmap) frame.close(); });
  return canvas.toDataURL('image/jpeg', 0.85);
}
