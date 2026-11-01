import { useSyncExternalStore } from 'react';

/** Sizes in pixels the user dragged the editor's panels to. A missing one keeps the layout's default. */
export interface PanelSizes {
  media?: number;
  props?: number;
  timeline?: number;
}

const KEY = 'panel-sizes';
const NAMES: (keyof PanelSizes)[] = ['media', 'props', 'timeline'];

function read(): PanelSizes {
  try {
    const saved: Record<string, unknown> = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const sizes: PanelSizes = {};
    for (const name of NAMES) {
      const value = saved[name];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) sizes[name] = Math.round(value);
    }
    return sizes;
  } catch { return {}; }
}

let current = read();
const listeners = new Set<() => void>();

export function setPanelSize(name: keyof PanelSizes, size: number | undefined) {
  current = { ...current };
  if (size === undefined) delete current[name];
  else current[name] = Math.round(size);
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage full or blocked */ }
  listeners.forEach((l) => l());
}

export function usePanelSizes() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
}
