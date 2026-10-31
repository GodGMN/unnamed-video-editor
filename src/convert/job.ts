import { useSyncExternalStore } from 'react';
import { t as translate } from '../i18n/core';
import { OutOfMemoryError, convertToMp4, outputSpec } from './convert';
import type { ConvertOptions, ConvertProgress, OutputSpec } from './convert';
import type { SourceInfo } from './probe';
import { pushError } from '../toast/store';

export type JobState =
  | { status: 'running'; progress: ConvertProgress }
  | { status: 'done'; output: File; elapsed: number };

export interface Job {
  /** The Media library item being converted, so the dialog can be reopened from elsewhere. */
  mediaId: string;
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

const mmss = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const fpsLabel = (fps: number) => translate('fps', { value1: Math.round(fps * 100) / 100 });

export function startConversion(mediaId: string, file: File, source: SourceInfo, options: ConvertOptions, addToTimeline: boolean) {
  controller?.abort();
  const ctrl = controller = new AbortController();
  const base = { mediaId, file, sourceName: file.name, source, options, addToTimeline, out: outputSpec(source, options) };
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
      const oom = e instanceof OutOfMemoryError;
      pushError({
        key: `convert:${mediaId}`,
        title: translate('conversionStopped'),
        message: oom
          ? translate('conversionOutOfMemoryToast', { time: mmss(e.at), height: base.out.height, fps: fpsLabel(base.out.fps) })
          : translate('nothingInYourProjectChanged2', { value1: e instanceof Error ? e.message : String(e) }),
        action: oom && Math.min(base.out.width, base.out.height) > 720 ? {
          label: translate('tryAgainAt720p'),
          run: () => { startConversion(mediaId, file, source, { ...options, shortSide: 720 }, addToTimeline); },
        } : undefined,
      });
      cancelConversion();
    },
  );
}

export function progressPercent({ stage, mediaTime }: ConvertProgress, duration: number) {
  return stage === 'load' ? 0 : stage === 'save' ? 100 : mediaTime / duration * 100;
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
