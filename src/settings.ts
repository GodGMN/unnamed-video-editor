import { useSyncExternalStore } from 'react';

/** The preview's short side in pixels, or the project's full output size. */
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

/** The preview canvas size: never larger than the output, with `resolution` as its short side. */
export function previewSize(output: { width: number; height: number }, resolution: PreviewResolution) {
  const long = Math.max(output.width, output.height), short = Math.min(output.width, output.height);
  const side = resolution === 'full' ? short : Math.min(resolution, short);
  const scale = side / short;
  return output.width < output.height ? { width: side, height: Math.round(long * scale) } : { width: Math.round(long * scale), height: side };
}
