import { useEffect, useState } from 'react';

/** Which editor layout fits the window: the full desktop one, the same one squeezed, or the phone one. */
export type LayoutMode = 'desktop' | 'tablet' | 'phone';

export const DESKTOP_MIN_WIDTH = 1280;
export const TABLET_MIN_WIDTH = 768;
/** Below this height even a wide window (a phone on its side) can't fit the timeline under the preview. */
export const TABLET_MIN_HEIGHT = 520;

export function layoutMode(width: number, height: number): LayoutMode {
  if (width < TABLET_MIN_WIDTH || height < TABLET_MIN_HEIGHT) return 'phone';
  return width < DESKTOP_MIN_WIDTH ? 'tablet' : 'desktop';
}

export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState(() => layoutMode(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const onResize = () => setMode(layoutMode(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return mode;
}
