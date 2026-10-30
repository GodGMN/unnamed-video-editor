import { useCallback, useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { initialProject, layoutTimeline } from './model';
import type { ClipId, ClipState, MenuState, ProjectState, Selection, TextOverlay, TrackKey, Transition, Tool } from './model';

export function useProject() {
  const [state, setState] = useState<ProjectState>(initialProject);

  const actions = useMemo(() => ({
    select: (sel: Selection) => setState((s) => ({ ...s, sel, menu: null })),
    setTool: (tool: Tool) => setState((s) => ({ ...s, tool })),
    setScrub: (scrub: number) => setState((s) => ({ ...s, scrub })),
    setPlayhead: (playhead: number) => setState((s) => ({ ...s, playhead })),
    updateClip: (id: ClipId, patch: Partial<ClipState>) =>
      setState((s) => ({ ...s, clips: { ...s.clips, [id]: { ...s.clips[id], ...patch } } })),
    updateText: (patch: Partial<TextOverlay>) => setState((s) => ({ ...s, text: { ...s.text, ...patch } })),
    updateTransition: (i: number, patch: Partial<Transition>) =>
      setState((s) => ({ ...s, trans: s.trans.map((t, j) => (j === i ? { ...t, ...patch } : t)) })),
    toggleTrack: (key: TrackKey) => setState((s) => ({ ...s, hidden: { ...s.hidden, [key]: !s.hidden[key] } })),
    openMenu: (menu: MenuState) => setState((s) => ({ ...s, menu, sel: { kind: menu.kind, id: menu.id } })),
    closeMenu: () => setState((s) => (s.menu ? { ...s, menu: null } : s)),
  }), []);

  const layout = useMemo(() => layoutTimeline(state), [state]);
  return { state, layout, ...actions };
}

export type Project = ReturnType<typeof useProject>;

/**
 * Pointer-capture drag: returns handlers for a draggable element. `onMove` receives the
 * pointer delta from where the drag started.
 */
export function useDrag() {
  const start = useCallback((e: ReactPointerEvent<HTMLElement>, onMove: (dx: number, dy: number) => void) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const x0 = e.clientX;
    const y0 = e.clientY;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => onMove(ev.clientX - x0, ev.clientY - y0);
    const end = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }, []);
  return start;
}
