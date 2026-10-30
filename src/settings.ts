import { useSyncExternalStore } from 'react';

/** Preview height in pixels, or the project's output height. */
export type PreviewResolution = 360 | 540 | 720 | 'full';

export interface Settings {
  previewResolution: PreviewResolution;
}

const KEY = 'settings';
const DEFAULTS: Settings = { previewResolution: 540 };
const RESOLUTIONS: PreviewResolution[] = [360, 540, 720, 'full'];

function read(): Settings {
  try {
    const saved: Partial<Settings> = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { previewResolution: RESOLUTIONS.includes(saved.previewResolution!) ? saved.previewResolution! : DEFAULTS.previewResolution };
  } catch { return DEFAULTS; }
}

let current = read();
const listeners = new Set<() => void>();

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage full or blocked */ }
  listeners.forEach((l) => l());
}

export function useSettings() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
}

/** The preview canvas size: never larger than the output. */
export function previewSize(output: { width: number; height: number }, resolution: PreviewResolution) {
  const height = resolution === 'full' ? output.height : Math.min(resolution, output.height);
  return { width: Math.round(height * output.width / output.height), height };
}
