import { useSyncExternalStore } from 'react';

export type ImportStep = 'store' | 'thumbnails' | 'waveform';
/** How far one file's import is: its current step, that step's done fraction, and when the step began. */
export interface ImportProgress { step: ImportStep; index: number; steps: number; fraction: number; since: number }

const progress = new Map<string, ImportProgress>();
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** How often a step's progress is published at most, so long decodes don't re-render on every buffer. */
const INTERVAL = 200;

/**
 * Publishes `id`'s progress through `steps`. The returned function takes a step and its done
 * fraction; call `clear` once the import ends.
 */
export function trackImport(id: string, steps: ImportStep[]) {
  let current: ImportProgress | null = null;
  let published = 0;
  const report = (step: ImportStep, fraction: number) => {
    const index = steps.indexOf(step);
    const now = Date.now();
    const value = Math.min(1, Math.max(0, fraction));
    const changed = !current || current.step !== step;
    if (!changed && value < 1 && now - published < INTERVAL) return;
    current = { step, index: Math.max(0, index), steps: steps.length, fraction: value, since: changed ? now : current!.since };
    published = now;
    progress.set(id, current);
    emit();
  };
  const clear = () => { if (progress.delete(id)) emit(); };
  return { report, clear };
}

export const useImportProgress = (id: string) => useSyncExternalStore(subscribe, () => progress.get(id) ?? null);

/** Seconds left in the current step at its pace so far, once there is enough of it to tell. */
export function secondsLeft(p: ImportProgress, now = Date.now()): number | null {
  const elapsed = (now - p.since) / 1000;
  if (p.fraction < 0.02 || elapsed < 2 || p.fraction >= 1) return null;
  return elapsed * (1 - p.fraction) / p.fraction;
}
