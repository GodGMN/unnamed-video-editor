import { upgrade } from '../editor/storage';
import { clipEnd, videoTracks } from '../editor/model';
import type { Media, Project, VideoClip } from '../editor/model';
import { loopTime } from '../media/animation';
import { readMediaFile, readPreview } from '../media/files';
import type { MediaPreview } from '../media/files';
import { regeneratePreview } from '../media/import';
import { renderFrame } from '../playback/compositor';

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
/** Previews are letterboxed into 16:9. Returns just the picture, at its own aspect. */
async function unboxed(src: string, media: Media) {
  const image = new Image();
  image.src = src;
  await image.decode();
  const { width, height } = media.video!;
  const scale = Math.min(image.naturalWidth / width, image.naturalHeight / height);
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(image, (image.naturalWidth - w) / 2, (image.naturalHeight - h) / 2, w, h, 0, 0, w, h);
  return canvas;
}

/**
 * The project's opening frame as composed in the editor, drawn from the cached media previews
 * so no source is decoded. Null when the project has no video, or none of it is cached yet. A
 * clip whose preview is missing is left out, and its preview is rebuilt in the background when
 * the source can be read without asking; that announces `media-preview-change`.
 */
export async function renderPoster(saved: Project, width: number): Promise<string | null> {
  // Library entries are stored as saved, possibly by an older version.
  const project = upgrade(saved);
  const clips = visibleClips(project);
  if (!clips.length) return null;
  const time = posterTime(clips);
  const showing = clips.filter(c => time >= c.start && time < clipEnd(c));
  const frames = new Map<string, HTMLCanvasElement>();
  await Promise.all(showing.map(async clip => {
    const media = project.media[clip.mediaId];
    const preview = await readPreview(media.id);
    const src = preview && previewImage(media, preview, clip.inS + time - clip.start, width > 320);
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
  return canvas.toDataURL('image/jpeg', 0.85);
}
