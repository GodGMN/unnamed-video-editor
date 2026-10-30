import { useEffect, useState } from 'react';

/** Whether `target` is the fullscreen element, and a toggle for it. Other fullscreen elements stay underneath. */
export function useFullscreen(target: () => Element | null) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement && document.fullscreenElement === target());
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [target]);
  const toggle = () => {
    const el = target();
    if (!el) return;
    void (document.fullscreenElement === el ? document.exitFullscreen() : el.requestFullscreen());
  };
  return [on, toggle] as const;
}
