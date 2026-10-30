import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { newId, placeMedia, linkClips, DEFAULT_TRANSITION, findClip, findTextItem, findVideoClip, layoutTimeline, moveClip, patchClip, patchTextItem, patchTrack, settle, videoTracks } from './model';
import type { AudioClip, ClipSelection, EditorUi, Media, MenuState, Project, Selection, TextItem, Tool, Transition, VideoClip } from './model';
import { SEED_SELECTION, seedProject } from './seed';
import { clearProject, loadProject, saveProject } from './storage';

const SAVE_DELAY_MS = 250;

const initialUi: EditorUi = {
  sel: { kind: 'clip', id: SEED_SELECTION },
  picked: [{ kind: 'clip', id: SEED_SELECTION }],
  focusClip: SEED_SELECTION,
  tool: 'select',
  menu: null,
  scrub: 7.6,
  playhead: 12.4,
};

/** Drops references to clips or items that aren't in the project (e.g. after loading a saved one). */
function reconcileUi(p: Project, ui: EditorUi): EditorUi {
  const first = videoTracks(p).flatMap((t) => t.clips)[0]?.id ?? null;
  const focusClip = findClip(p, ui.focusClip) ? ui.focusClip : first;
  const s = ui.sel;
  const valid = !!s && (s.kind === 'text' ? !!findTextItem(p, s.id) : !!findClip(p, s.id));
  const sel: Selection | null = valid ? s : focusClip ? { kind: 'clip', id: focusClip } : null;
  const picked = ui.picked.filter((x) => findClip(p, x.id));
  if (!picked.length && sel && (sel.kind === 'clip' || sel.kind === 'audio')) picked.push(sel);
  return { ...ui, sel, picked, focusClip, menu: null };
}

/** Loads the saved project (or the seed) and saves it back after every change. */
function usePersistentProject(onLoad: (p: Project) => void) {
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    let cancelled = false;
    // `?reset` discards the saved project and starts over from the seed.
    const url = new URL(window.location.href);
    const reset = url.searchParams.has('reset');
    if (reset) {
      url.searchParams.delete('reset');
      history.replaceState(null, '', url);
    }
    (reset ? clearProject().then(() => null) : loadProject())
      .catch((err) => { console.warn('Could not load the saved project', err); return null; })
      .then((saved) => {
        if (cancelled) return;
        const p = saved ?? seedProject();
        setProject(p);
        onLoad(p);
      });
    return () => { cancelled = true; };
  }, [onLoad]);

  useEffect(() => {
    if (!project) return;
    const t = setTimeout(() => saveProject(project).catch((err) => console.warn('Could not save the project', err)), SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [project]);

  return [project, setProject] as const;
}

export function useProject() {
  const [ui, setUi] = useState<EditorUi>(initialUi);
  const onLoad = useCallback((p: Project) => setUi((u) => reconcileUi(p, u)), []);
  const [project, setProject] = usePersistentProject(onLoad);

  const actions = useMemo(() => {
    const edit = (fn: (p: Project) => Project) => setProject((p) => (p ? settle(fn(p)) : p));
    return {
      addMedia: (media: Media) => edit((p) => ({ ...p, media: { ...p.media, [media.id]: media } })),
      placeMedia: (mediaId: string, trackId: string, time: number) => {
        const id = newId();
        edit((p) => placeMedia(p, mediaId, trackId, time, id));
        setUi((u) => ({ ...u, focusClip: id, sel: { kind: 'clip', id }, picked: [{ kind: 'clip', id }] }));
      },
      select: (sel: Selection) => setUi((u) => {
        const clip = sel.kind === 'clip' || sel.kind === 'audio';
        return { ...u, sel, menu: null, picked: clip ? [sel] : [], focusClip: clip ? sel.id : u.focusClip };
      }),
      /** Ctrl-click: adds a clip to the selection, or removes it if it's already there. */
      togglePick: (clip: ClipSelection) => setUi((u) => {
        if (!u.picked.some((x) => x.id === clip.id)) return { ...u, sel: clip, picked: [...u.picked, clip], menu: null, focusClip: clip.id };
        const picked = u.picked.filter((x) => x.id !== clip.id);
        if (u.sel?.id !== clip.id) return { ...u, picked, menu: null };
        const last = picked.at(-1) ?? null;
        return { ...u, sel: last, picked, menu: null, focusClip: last?.id ?? u.focusClip };
      }),
      moveClip: (snapshot: Project, id: string, start: number) => setProject(moveClip(snapshot, id, start)),
      setTool: (tool: Tool) => setUi((u) => ({ ...u, tool })),
      setScrub: (scrub: number) => setUi((u) => ({ ...u, scrub })),
      setPlayhead: (playhead: number) => setUi((u) => ({ ...u, playhead })),
      /** Right-clicking a clip outside the selection selects just that clip. */
      openMenu: (menu: MenuState) => setUi((u) => ({
        ...u, menu, sel: { kind: menu.kind, id: menu.id }, focusClip: menu.id,
        picked: u.picked.some((x) => x.id === menu.id) ? u.picked : [{ kind: menu.kind, id: menu.id }],
      })),
      closeMenu: () => setUi((u) => (u.menu ? { ...u, menu: null } : u)),

      /** Moves a clip's in/out points; linked partners follow. */
      trimClip: (id: string, patch: Partial<Pick<VideoClip | AudioClip, 'inS' | 'outS'>>) => edit((p) => patchClip(p, id, patch)),
      updateVideoClip: (id: string, patch: Partial<VideoClip>) => edit((p) => patchClip(p, id, patch)),
      updateAudioClip: (id: string, patch: Partial<AudioClip>) => edit((p) => patchClip(p, id, patch)),
      /** Updates the transition after video clip `id`, creating it from the default cut if needed. */
      updateTransition: (id: string, patch: Partial<Transition>) => edit((p) => {
        const clip = findVideoClip(p, id);
        return clip ? patchClip<VideoClip>(p, id, { transitionOut: { ...(clip.transitionOut ?? DEFAULT_TRANSITION), ...patch } }) : p;
      }),
      /** Links a video and an audio clip so they move and trim together. */
      linkClips: (videoId: string, audioId: string) => edit((p) => linkClips(p, videoId, audioId, newId())),
      updateText: (id: string, patch: Partial<TextItem>) => edit((p) => patchTextItem(p, id, patch)),
      toggleTrack: (id: string) => edit((p) => {
        const t = p.tracks.find((x) => x.id === id);
        if (!t) return p;
        return t.kind === 'audio' ? patchTrack(p, id, { muted: !t.muted }) : patchTrack(p, id, { hidden: !t.hidden });
      }),
    };
  }, [setProject]);

  const layout = useMemo(() => (project ? layoutTimeline(project) : null), [project]);

  if (!project || !layout) return null;
  return { project, ui, layout, ...actions };
}

export type Editor = NonNullable<ReturnType<typeof useProject>>;

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
