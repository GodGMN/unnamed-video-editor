import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { newId, placeMedia, linkClips, DEFAULT_TRANSITION, clipEnd, deleteItems, findClip, findTextItem, findVideoClip, layoutTimeline, moveClip, patchClip, patchTextItem, patchTrack, removeMedia, settle, trimTextItem, videoTracks } from './model';
import type { AudioClip, ClipSelection, EditorUi, Media, MenuState, Project, Selection, TextItem, Tool, Transition, VideoClip } from './model';
import { SEED_SELECTION, seedProject } from './seed';
import { clearProject, loadProject, saveProject } from './storage';
import { removeMediaFiles } from '../media/files';

const SAVE_DELAY_MS = 250;

const initialUi: EditorUi = {
  sel: { kind: 'clip', id: SEED_SELECTION },
  picked: [{ kind: 'clip', id: SEED_SELECTION }],
  focusClip: SEED_SELECTION,
  lockClip: null,
  source: null,
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
  const sel: Selection | null = !s ? null : valid ? s : focusClip ? { kind: 'clip', id: focusClip } : null;
  const picked = ui.picked.filter((x) => findClip(p, x.id));
  if (!picked.length && sel && (sel.kind === 'clip' || sel.kind === 'audio')) picked.push(sel);
  const lockClip = findClip(p, ui.lockClip) ? ui.lockClip : null;
  const source = ui.source && p.media[ui.source] ? ui.source : null;
  return { ...ui, sel, picked, focusClip, lockClip, source, menu: null };
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

export interface PlayRange {
  start: number;
  end: number;
}

const clamp = (t: number, r: PlayRange) => Math.max(r.start, Math.min(r.end, t));

/**
 * Where the playhead may go: the whole sequence, or only the locked clip while one is
 * locked. The range ends on the clip's last frame so the preview never shows its neighbour.
 */
function playRange(p: Project, end: number, lockClip: string | null): PlayRange {
  const clip = findClip(p, lockClip)?.clip;
  if (!clip) return { start: 0, end };
  return { start: clip.start, end: Math.max(clip.start, clipEnd(clip) - 1 / p.output.fps) };
}

export function useProject() {
  const [ui, setUi] = useState<EditorUi>(initialUi);
  const onLoad = useCallback((p: Project) => setUi((u) => reconcileUi(p, u)), []);
  const [project, setProject] = usePersistentProject(onLoad);
  const projectRef = useRef(project);
  projectRef.current = project;
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const layout = useMemo(() => (project ? layoutTimeline(project) : null), [project]);
  const range = useMemo(() => (project && layout ? playRange(project, layout.end, ui.lockClip) : null), [project, layout, ui.lockClip]);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  // Pull the playhead into range when the lock changes or the locked clip is trimmed.
  useLayoutEffect(() => {
    if (range) setUi((u) => (u.playhead === clamp(u.playhead, range) ? u : { ...u, playhead: clamp(u.playhead, range) }));
  }, [range]);

  const actions = useMemo(() => {
    const edit = (fn: (p: Project) => Project) => setProject((p) => (p ? settle(fn(p)) : p));
    return {
      addMedia: (media: Media) => edit((p) => ({ ...p, media: { ...p.media, [media.id]: media } })),
      /** Deletes a source, its clips on the timeline, and its stored files. */
      removeMedia: (mediaId: string) => {
        const p = projectRef.current;
        if (!p) return;
        const next = removeMedia(p, mediaId);
        setProject(next);
        setUi((u) => reconcileUi(next, u));
        removeMediaFiles(mediaId).catch(() => undefined);
      },
      /** Deletes the selected clips (with their linked partners) or text item. */
      deleteSelection: () => {
        const p = projectRef.current;
        const { sel, picked } = uiRef.current;
        const ids = [...picked.map((x) => x.id), ...(sel?.kind === 'text' ? [sel.id] : [])];
        if (!p || !ids.length) return;
        const next = deleteItems(p, ids);
        setProject(next);
        setUi((u) => reconcileUi(next, { ...u, sel: null, picked: [] }));
      },
      placeMedia: (mediaId: string, trackId: string, time: number) => {
        const id = newId();
        edit((p) => placeMedia(p, mediaId, trackId, time, id));
        setUi((u) => ({ ...u, source: null, focusClip: id, sel: { kind: 'clip', id }, picked: [{ kind: 'clip', id }] }));
      },
      select: (sel: Selection) => setUi((u) => {
        const clip = sel.kind === 'clip' || sel.kind === 'audio';
        return { ...u, sel, menu: null, source: null, picked: clip ? [sel] : [], focusClip: clip ? sel.id : u.focusClip };
      }),
      /** Ctrl-click: adds a clip to the selection, or removes it if it's already there. */
      togglePick: (clip: ClipSelection) => setUi((u) => {
        u = { ...u, source: null };
        if (!u.picked.some((x) => x.id === clip.id)) return { ...u, sel: clip, picked: [...u.picked, clip], menu: null, focusClip: clip.id };
        const picked = u.picked.filter((x) => x.id !== clip.id);
        if (u.sel?.id !== clip.id) return { ...u, picked, menu: null };
        const last = picked.at(-1) ?? null;
        return { ...u, sel: last, picked, menu: null, focusClip: last?.id ?? u.focusClip };
      }),
      /** Box selection: the picked clips become exactly `clips`, keeping the primary selection if it's among them. */
      pickClips: (clips: ClipSelection[]) => setUi((u) => {
        const kept = clips.find((x) => x.kind === u.sel?.kind && x.id === u.sel.id);
        const sel = kept ?? clips.at(-1) ?? null;
        return { ...u, sel, picked: clips, menu: null, focusClip: sel?.id ?? u.focusClip };
      }),
      /** Moves clip `id` to `start`; `others` shift by the same amount. */
      moveClip: (snapshot: Project, id: string, start: number, others: string[] = []) => setProject(moveClip(snapshot, id, start, others)),
      setTool: (tool: Tool) => setUi((u) => ({ ...u, tool })),
      setScrub: (scrub: number) => setUi((u) => ({ ...u, scrub })),
      setPlayhead: (playhead: number) => setUi((u) => ({ ...u, playhead: rangeRef.current ? clamp(playhead, rangeRef.current) : playhead })),
      /** Double-click: locks the playhead to a clip's range. */
      lockTo: (id: string) => setUi((u) => ({ ...u, lockClip: id, source: null, menu: null })),
      /** Plays a Media item in the preview on its own, without touching the timeline. */
      previewSource: (mediaId: string) => setUi((u) => ({ ...u, source: mediaId })),
      /** Puts the timeline back in the preview. */
      closeSource: () => setUi((u) => (u.source ? { ...u, source: null } : u)),
      /** Releases the locked clip so the playhead can roam the whole sequence again. */
      unlock: () => setUi((u) => ({ ...u, lockClip: null, menu: null })),
      /** Right-clicking a clip outside the selection selects just that clip. */
      openMenu: (menu: MenuState) => setUi((u) => ({
        ...u, menu, source: null, sel: { kind: menu.kind, id: menu.id }, focusClip: menu.id,
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
      /** Moves a text item's start or end edge to `time`; the other edge stays put. */
      trimText: (id: string, edge: 'in' | 'out', time: number) => edit((p) => trimTextItem(p, id, edge, time)),
      toggleTrack: (id: string) => edit((p) => {
        const t = p.tracks.find((x) => x.id === id);
        if (!t) return p;
        return t.kind === 'audio' ? patchTrack(p, id, { muted: !t.muted }) : patchTrack(p, id, { hidden: !t.hidden });
      }),
    };
  }, [setProject]);

  if (!project || !layout || !range) return null;
  return { project, ui, layout, range, ...actions };
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
