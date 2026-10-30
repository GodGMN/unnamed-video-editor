import { t as translate } from '../i18n/core';
import { useCallback, useRef, useState } from 'react';
import type { Editor } from '../editor/useProject';
import { removeMediaFiles } from './files';
import { probeMedia } from './import';
import type { Probe } from './import';

/** Where dropped files go on the timeline: a track, and where a first clip of `duration` seconds starts. */
export interface Placement { trackId: string; timeFor: (duration: number) => number }

const message = (file: File, error: unknown) => `${file.name}: ${error instanceof Error ? error.message : translate('importFailed')}`;

/**
 * Imports files in two steps. Every file is probed straight away, which only reads its header, and
 * shows up in the Media panel; with a placement its clips go on the timeline at their real length
 * too. Then the files are stored and previewed one at a time, and their clips start playing.
 */
export function useImports(editor: Editor | null) {
  const ref = useRef(editor);
  ref.current = editor;
  const queue = useRef(Promise.resolve());
  const [pending, setPending] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const ingest = useCallback(async (files: FileList | File[], place?: Placement) => {
    const batch = Array.from(files);
    if (!batch.length) return;
    setPending((n) => n + batch.length);
    const fail = (file: File, error: unknown) => setErrors((items) => [...items, message(file, error)]);
    const probes = await Promise.all(batch.map((file) => probeMedia(file).catch((error: unknown): Probe | null => {
      fail(file, error);
      setPending((n) => n - 1);
      return null;
    })));
    const media = probes.flatMap((probe) => (probe ? [probe.media] : []));
    if (place && media.length) ref.current?.dropMedia(media, place.trackId, place.timeFor(media[0].duration));
    else for (const m of media) ref.current?.addMedia(m);
    probes.forEach((probe, i) => {
      if (!probe) return;
      queue.current = queue.current.then(async () => {
        try {
          const media = await probe.finish();
          if (!ref.current?.finishMedia(media)) await removeMediaFiles(media.id).catch(() => undefined);
        } catch (error) {
          ref.current?.cancelMedia(probe.media.id);
          fail(batch[i], error);
        } finally { setPending((n) => n - 1); }
      });
    });
  }, []);

  return { ingest, pending, errors };
}
