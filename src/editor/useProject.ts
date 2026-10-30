import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { newId, placeMedia, linkClips, addTextClip, deleteClips, duplicateClip, splitClip, DEFAULT_TRANSITION, clipEnd, clipKind, findClip, findMediaClip, findVideoClip, layoutTimeline, moveClip, patchClip, patchTrack, removeMedia, removeTrack, setAspect, settle, trimClipEdge, videoTracks } from './model';
import type { Aspect, AudioClip, ClipSelection, EditorUi, Media, MenuState, Project, Selection, TextClip, Tool, Transition, VideoClip } from './model';
import { removeMediaFiles } from '../media/files';
import { SEED_SELECTION } from './seed';
import { saveProject, listProjects } from './storage';

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
  keyPick: null,
};

/** The trim scrubber shows media, so only video and audio clips take the focus. */
const focusOf = (sel: Selection | null, focusClip: string | null) => (sel?.kind === 'clip' || sel?.kind === 'audio' ? sel.id : focusClip);

/** Drops references to clips that aren't in the project (e.g. after loading a saved one). */
function reconcileUi(p: Project, ui: EditorUi): EditorUi {
  const first = videoTracks(p).flatMap((t) => t.clips)[0]?.id ?? null;
  const focusClip = findMediaClip(p, ui.focusClip) ? ui.focusClip : first;
  const s = ui.sel;
  const sel: Selection | null = !s ? null : findClip(p, s.id) ? s : focusClip ? { kind: 'clip', id: focusClip } : null;
  const picked = ui.picked.filter((x) => findClip(p, x.id));
  if (!picked.length && sel && sel.kind !== 'trans') picked.push(sel);
  const lockClip = findClip(p, ui.lockClip) ? ui.lockClip : null;
  const source = ui.source && p.media[ui.source] ? ui.source : null;
  const keyPick = findVideoClip(p, ui.keyPick) ? ui.keyPick : null;
  return { ...ui, sel, picked, focusClip, lockClip, source, keyPick, menu: null };
}

export type SaveState = { status: 'saved' | 'saving' | 'failed'; error?: string };

function usePersistentProject(id: string, initial: Project) {
  const [project, setProject] = useState(initial);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'saved' });
  const latest = useRef(project);
  latest.current = project;
  const save = useCallback(async () => {
    const snapshot = latest.current;
    setSaveState({ status: 'saving' });
    try {
      await saveProject(snapshot, id);
      if (snapshot === latest.current) setSaveState({ status: 'saved' });
    } catch (error) {
      setSaveState({ status: 'failed', error: error instanceof Error ? error.message : undefined });
      throw error;
    }
  }, [id]);
  useEffect(() => {
    setSaveState({ status: 'saving' });
    const timer = setTimeout(() => { void save().catch(() => undefined); }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [project, save]);
  useEffect(() => {
    if (saveState.status === 'saved') return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [saveState]);
  return { project, setProject, saveState, flush: save };
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

export function useProject(id: string, initial: Project) {
  const [ui, setUi] = useState<EditorUi>(() => reconcileUi(initial, initialUi));
  const { project, setProject, saveState, flush } = usePersistentProject(id, initial);
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
      renameProject: (name: string) => edit((p) => ({ ...p, name })),
      setAspect: (aspect: Aspect) => edit((p) => setAspect(p, aspect)),
      addMedia: (media: Media) => edit((p) => ({ ...p, media: { ...p.media, [media.id]: media } })),
      /** Deletes a source, its clips on the timeline, and its stored files. */
      removeMedia: (mediaId: string) => {
        const p = projectRef.current;
        if (!p) return;
        const next = removeMedia(p, mediaId);
        setProject(next);
        setUi((u) => reconcileUi(next, u));
        void saveProject(next, id).then(async () => {
          const entries = await listProjects();
          if (!entries.some(e => Object.hasOwn(e.project.media, mediaId))) await removeMediaFiles(mediaId);
        }).catch(error => console.warn('Could not remove unused media', error));
      },
      /** Deletes the selected clips, with their linked partners. */
      deleteSelection: () => {
        const p = projectRef.current;
        const ids = uiRef.current.picked.map((x) => x.id);
        if (!p || !ids.length) return;
        const next = deleteClips(p, ids);
        setProject(next);
        setUi((u) => reconcileUi(next, { ...u, sel: null, picked: [] }));
      },
      placeMedia: (mediaId: string, trackId: string, time: number) => {
        const id = newId();
        edit((p) => placeMedia(p, mediaId, trackId, time, id));
        setUi((u) => ({ ...u, source: null, focusClip: id, sel: { kind: 'clip', id }, picked: [{ kind: 'clip', id }] }));
      },
      select: (sel: Selection) => setUi((u) => ({
        ...u, sel, menu: null, source: null, picked: sel.kind === 'trans' ? [] : [sel], focusClip: focusOf(sel, u.focusClip),
        keyPick: u.keyPick === sel.id ? u.keyPick : null,
      })),
      /** Ctrl-click: adds a clip to the selection, or removes it if it's already there. */
      togglePick: (clip: ClipSelection) => setUi((u) => {
        u = { ...u, source: null };
        if (!u.picked.some((x) => x.id === clip.id)) return { ...u, sel: clip, picked: [...u.picked, clip], menu: null, focusClip: focusOf(clip, u.focusClip) };
        const picked = u.picked.filter((x) => x.id !== clip.id);
        if (u.sel?.id !== clip.id) return { ...u, picked, menu: null };
        const last = picked.at(-1) ?? null;
        return { ...u, sel: last, picked, menu: null, focusClip: focusOf(last, u.focusClip) };
      }),
      /** Box selection: the picked clips become exactly `clips`, keeping the primary selection if it's among them. */
      pickClips: (clips: ClipSelection[]) => setUi((u) => {
        const kept = clips.find((x) => x.kind === u.sel?.kind && x.id === u.sel.id);
        const sel = kept ?? clips.at(-1) ?? null;
        return { ...u, sel, picked: clips, menu: null, focusClip: focusOf(sel, u.focusClip) };
      }),
      /** Moves clip `id` to `start`, `trackShift` tracks down; `others` shift by the same amount. */
      moveClip: (snapshot: Project, id: string, start: number, others: string[] = [], trackShift = 0) =>
        setProject(moveClip(snapshot, id, start, others, trackShift)),
      setTool: (tool: Tool) => setUi((u) => ({ ...u, tool })),
      setScrub: (scrub: number) => setUi((u) => ({ ...u, scrub })),
      setPlayhead: (playhead: number) => setUi((u) => ({ ...u, playhead: rangeRef.current ? clamp(playhead, rangeRef.current) : playhead })),
      /** Double-click: locks the playhead to a clip's range. */
      lockTo: (id: string) => setUi((u) => ({ ...u, lockClip: id, source: null, menu: null })),
      /** Plays a Media item in the preview on its own, without touching the timeline. */
      previewSource: (mediaId: string) => setUi((u) => ({ ...u, source: mediaId, keyPick: null })),
      /** Arms the preview eyedropper for video clip `id`'s key colour; null disarms it. */
      pickKey: (id: string | null) => setUi((u) => ({ ...u, keyPick: id, source: id ? null : u.source })),
      /** Puts the timeline back in the preview. */
      closeSource: () => setUi((u) => (u.source ? { ...u, source: null } : u)),
      /** Releases the locked clip so the playhead can roam the whole sequence again. */
      unlock: () => setUi((u) => ({ ...u, lockClip: null, menu: null })),
      /** Right-clicking a clip outside the selection selects just that clip. */
      openMenu: (menu: MenuState) => setUi((u) => ({
        ...u, menu, source: null, sel: { kind: menu.kind, id: menu.id }, focusClip: focusOf(menu, u.focusClip),
        picked: u.picked.some((x) => x.id === menu.id) ? u.picked : [{ kind: menu.kind, id: menu.id }],
      })),
      closeMenu: () => setUi((u) => (u.menu ? { ...u, menu: null } : u)),

      /** Moves a clip's source in/out points; linked partners follow. */
      trimClip: (id: string, patch: Partial<Pick<VideoClip | AudioClip, 'start' | 'inS' | 'outS'>>) => edit((p) => patchClip(p, id, patch)),
      updateVideoClip: (id: string, patch: Partial<VideoClip>) => edit((p) => patchClip(p, id, patch)),
      updateAudioClip: (id: string, patch: Partial<AudioClip>) => edit((p) => patchClip(p, id, patch)),
      /** Updates the transition after video clip `id`, creating it from the default cut if needed. */
      updateTransition: (id: string, patch: Partial<Transition>) => edit((p) => {
        const clip = findVideoClip(p, id);
        return clip ? patchClip<VideoClip>(p, id, { transitionOut: { ...(clip.transitionOut ?? DEFAULT_TRANSITION), ...patch } }) : p;
      }),
      /** Links a video and an audio clip so they move and trim together. */
      linkClips: (videoId: string, audioId: string) => edit((p) => linkClips(p, videoId, audioId, newId())),
      updateText: (id: string, patch: Partial<TextClip>) => edit((p) => patchClip(p, id, patch)),
      /** Cuts a clip, and its linked partners, at a sequence time. */
      splitClip: (id: string, time: number) => edit((p) => splitClip(p, id, time, newId())),
      /** Adds a text clip at `time` and selects it so it opens in the properties panel. */
      addText: (time: number) => {
        const id = newId();
        edit((p) => addTextClip(p, time, id));
        setUi((u) => ({ ...u, sel: { kind: 'text', id }, picked: [{ kind: 'text', id }], menu: null }));
      },
      /** Copies a clip, and its linked partners, and selects the copy. */
      duplicateClip: (id: string) => {
        const copyId = newId();
        const track = projectRef.current && findClip(projectRef.current, id)?.track;
        if (!track) return;
        const copy: ClipSelection = { kind: clipKind(track.kind), id: copyId };
        edit((p) => duplicateClip(p, id, copyId));
        setUi((u) => ({ ...u, sel: copy, picked: [copy], focusClip: focusOf(copy, u.focusClip), menu: null }));
      },
      /** Moves a clip's start or end edge to sequence time `time`; the other edge stays put. */
      trimEdge: (id: string, edge: 'in' | 'out', time: number) => edit((p) => trimClipEdge(p, id, edge, time)),
      /** Deletes a track and its clips, clearing any selection that pointed into it. */
      removeTrack: (id: string) => {
        const p = projectRef.current;
        if (!p) return;
        const next = removeTrack(p, id);
        if (next === p) return;
        setProject(next);
        setUi((u) => reconcileUi(next, u));
      },
      toggleTrack: (id: string) => edit((p) => {
        const t = p.tracks.find((x) => x.id === id);
        if (!t) return p;
        return t.kind === 'audio' ? patchTrack(p, id, { muted: !t.muted }) : patchTrack(p, id, { hidden: !t.hidden });
      }),
    };
  }, [id, setProject]);

  if (!project || !layout || !range) return null;
  return { project, ui, layout, range, saveState, flush, ...actions };
}

export type Editor = NonNullable<ReturnType<typeof useProject>>;

/**
 * Pointer-capture drag: returns handlers for a draggable element. `onMove` receives the
 * pointer delta from where the drag started.
 */
export function useDrag() {
  const start = useCallback((e: ReactPointerEvent<HTMLElement>, onMove: (dx: number, dy: number) => void, onEnd?: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const id = e.pointerId;
    el.setPointerCapture(id);
    // Listening on window keeps the drag alive if the element remounts, e.g. a clip moving to another track.
    const move = (ev: PointerEvent) => { if (ev.pointerId === id) onMove(ev.clientX - x0, ev.clientY - y0); };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      onEnd?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }, []);
  return start;
}
