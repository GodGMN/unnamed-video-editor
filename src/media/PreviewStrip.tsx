import { useEffect, useState } from 'react';
import type { Media } from '../editor/model';
import { readMediaFile, readPreview } from './files';
import type { MediaPreview } from './files';
import { loopTime } from './animation';
import { regeneratePreview } from './import';

const pendingPreviews = new Map<string, Promise<MediaPreview | null>>();

async function loadPreview(media: Media): Promise<MediaPreview | null> {
  const cached = await readPreview(media.id);
  if (cached) return cached;
  let pending = pendingPreviews.get(media.id);
  if (!pending) {
    pending = (async () => {
      const file = await readMediaFile(media.id);
      if (!file) return null;
      await regeneratePreview(media, file);
      return readPreview(media.id);
    })();
    pendingPreviews.set(media.id, pending);
    pending.finally(() => pendingPreviews.delete(media.id)).catch(() => {});
  }
  return pending;
}

/** The stored previews of `media`, once its import has written them. */
export function useMediaPreview(media: Media) {
  const { id, importing } = media;
  const [revision, setRevision] = useState(0);
  useEffect(() => { const refresh = () => setRevision(n => n + 1); window.addEventListener('media-preview-change', refresh); return () => window.removeEventListener('media-preview-change', refresh); }, []);
  const [preview, setPreview] = useState<MediaPreview | null>(null);
  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    if (!importing) loadPreview(media).then((value) => { if (!cancelled) setPreview(value); }).catch(console.warn);
    return () => { cancelled = true; };
  }, [id, importing, revision]);
  return preview;
}
export function PreviewStrip({ media, width, inS = 0, outS = media.duration }: { media: Media; width: number; inS?: number; outS?: number }) {
  const preview = useMediaPreview(media);
  const n = Math.max(1, Math.ceil(width / 70));
  return <span className="strip" aria-hidden="true">{preview?.thumbnails.length ? Array.from({ length: n }, (_, i) => {
    const time = inS + (outS - inS) * i / n;
    // Thumbnails of an animation span one loop.
    const at = media.animation ? loopTime(time, media.animation) / media.animation : time / media.duration;
    const index = Math.min(preview.thumbnails.length - 1, Math.max(0, Math.floor(at * preview.thumbnails.length)));
    return <img key={i} src={preview.thumbnails[index]} alt="" style={{ height: '100%', width: `${100 / n}%`, objectFit: 'cover', flex: '1 1 0', minWidth: 0 }} />;
  }) : null}</span>;
}
