import { useSyncExternalStore } from 'react';
import { OutOfMemoryError, convertToMp4, outputSpec } from './convert';
import type { ConvertOptions, ConvertProgress, OutputSpec } from './convert';
import type { SourceInfo } from './probe';

export type JobState =
  | { status: 'running'; progress: ConvertProgress }
  | { status: 'done'; output: File; elapsed: number }
  | { status: 'error'; message: string; outOfMemoryAt?: number };

export interface Job {
  file: File;
  sourceName: string;
  source: SourceInfo;
  options: ConvertOptions;
  /** Whether the finished copy also goes at the end of V1 once it is in the Media library. */
  addToTimeline: boolean;
  out: OutputSpec;
  state: JobState;
}

/**
 * One conversion at a time, kept outside React so it survives the dialog closing ("Keep editing").
 * Running two would double the memory, which is the usual way these fail.
 */
let job: Job | null = null;
let controller: AbortController | null = null;
const listeners = new Set<() => void>();

function set(next: Job | null) {
  job = next;
  listeners.forEach((l) => l());
}

export function startConversion(file: File, source: SourceInfo, options: ConvertOptions, addToTimeline: boolean) {
  controller?.abort();
  const ctrl = controller = new AbortController();
  const base = { file, sourceName: file.name, source, options, addToTimeline, out: outputSpec(source, options) };
  const update = (state: JobState) => { if (controller === ctrl) set({ ...base, state }); };
  const t0 = performance.now();
  update({ status: 'running', progress: { stage: 'load', mediaTime: 0, speed: 0 } });

  convertToMp4(file, source, options, (progress) => update({ status: 'running', progress }), ctrl.signal).then(
    (blob) => {
      const output = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.mp4', { type: 'video/mp4' });
      update({ status: 'done', output, elapsed: (performance.now() - t0) / 1000 });
    },
    (e: unknown) => {
      if (ctrl.signal.aborted) return;
      console.error('[convert]', e);
      update(e instanceof OutOfMemoryError
        ? { status: 'error', message: e.message, outOfMemoryAt: e.at }
        : { status: 'error', message: e instanceof Error ? e.message : String(e) });
    },
  );
}

/** Stops a running conversion and forgets the job. */
export function cancelConversion() {
  controller?.abort();
  controller = null;
  set(null);
}

export function useConversionJob(): Job | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => job);
}
