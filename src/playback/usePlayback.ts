import { t as translate } from '../i18n/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '../editor/useProject';
import { PlaybackEngine } from './engine';

/** `resolution` is the canvas height; decoders follow it. */
export function usePlayback(editor: Editor, volume: number, transparent: boolean, resolution: number) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<PlaybackEngine | null>(null);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');
  const current = useRef({ editor, playing, volume, transparent });
  current.current = { editor, playing, volume, transparent };

  useEffect(() => {
    const instance = new PlaybackEngine(canvas.current!, setStatus);
    engine.current = instance;
    return () => { instance.dispose(); engine.current = null; };
  }, []);

  const sized = useRef(resolution);
  useEffect(() => {
    if (sized.current === resolution) return;
    sized.current = resolution;
    engine.current?.resize();
  }, [resolution]);

  const clock = useRef({ time: editor.ui.playhead, started: performance.now() });
  const position = useRef(editor.ui.playhead);
  const published = useRef(editor.ui.playhead);

  useEffect(() => {
    // UI publications acknowledge the clock; external seeks re-anchor it.
    if (!playing || editor.ui.playhead !== published.current) {
      position.current = editor.ui.playhead;
      clock.current = { time: editor.ui.playhead, started: performance.now() };
    }
    engine.current?.update({ project: editor.project, time: position.current, playing, volume, transparent });
  }, [editor.project, editor.ui.playhead, playing, volume, transparent]);

  // A source previewing from the Media panel takes over the player and its Space key.
  const source = editor.ui.source;
  useEffect(() => { if (source) setPlaying(false); }, [source]);

  useEffect(() => {
    if (!playing) return;
    clock.current = { time: position.current, started: performance.now() };
    let lastPublished = 0;
    let frame = 0;
    const tick = (now: number) => {
      const { editor, volume, transparent } = current.current;
      const next = Math.max(editor.range.start, Math.min(editor.range.end, clock.current.time + (now - clock.current.started) / 1000));
      position.current = next;
      engine.current?.update({ project: editor.project, time: next, playing: next < editor.range.end, volume, transparent });
      if (now - lastPublished >= 100 || next >= editor.range.end) {
        lastPublished = now;
        published.current = next;
        editor.setPlayhead(next);
      }
      if (next >= editor.range.end) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const toggle = useCallback(async () => {
    const { editor, playing } = current.current;
    if (playing) { published.current = position.current; editor.setPlayhead(position.current); setPlaying(false); return; }
    try {
      await engine.current?.resumeAudio();
      if (editor.ui.playhead >= editor.range.end) editor.setPlayhead(editor.range.start);
      setPlaying(true);
    } catch (error) { setStatus(error instanceof Error ? error.message : translate('audioCouldNotStart')); }
  }, []);

  useEffect(() => {
    if (source) return;
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.code !== 'Space' || event.repeat || target.closest('input, textarea, select, button, [contenteditable=true]')) return;
      event.preventDefault(); void toggle();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [source, toggle]);

  const seek = (time: number) => {
    setPlaying(false);
    editor.setPlayhead(time);
  };
  const sample = useCallback((clipId: string, x: number, y: number) => engine.current?.sample(clipId, x, y) ?? null, []);
  return { canvas, playing, status, toggle, seek, sample };
}
