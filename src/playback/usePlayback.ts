import { t as translate } from '../i18n/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor, PlayRange } from '../editor/useProject';
import { PlaybackEngine } from './engine';

/** `width`×`height` is the canvas size; decoders follow it. */
export function usePlayback(editor: Editor, volume: number, transparent: boolean, { width, height }: { width: number; height: number }) {
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

  const sized = useRef(`${width}×${height}`);
  useEffect(() => {
    if (sized.current === `${width}×${height}`) return;
    sized.current = `${width}×${height}`;
    engine.current?.resize();
  }, [width, height]);

  const clock = useRef({ time: editor.ui.playhead, started: performance.now() });
  const position = useRef(editor.ui.playhead);
  const published = useRef(editor.ui.playhead);
  const interval = useRef<PlayRange | null>(null);

  useEffect(() => {
    // UI publications acknowledge the clock; external seeks re-anchor it.
    if (!playing || editor.ui.playhead !== published.current) {
      if (playing && interval.current) { interval.current = null; setPlaying(false); }
      position.current = editor.ui.playhead;
      clock.current = { time: editor.ui.playhead, started: performance.now() };
    }
    engine.current?.update({ project: editor.project, time: position.current, playing, volume, transparent });
  }, [editor.project, editor.ui.playhead, playing, volume, transparent]);

  // A source previewing from the Media panel takes over the player and its Space key.
  const source = editor.ui.source;
  useEffect(() => { if (source) { interval.current = null; setPlaying(false); } }, [source]);

  const intervalRequest = editor.intervalPlaybackRequest;
  useEffect(() => {
    if (!intervalRequest) return;
    let cancelled = false;
    const play = async () => {
      try {
        await engine.current?.resumeAudio();
        if (cancelled) return;
        interval.current = intervalRequest;
        position.current = intervalRequest.start;
        published.current = intervalRequest.start;
        clock.current = { time: intervalRequest.start, started: performance.now() };
        setPlaying(true);
      } catch (error) { if (!cancelled) setStatus(error instanceof Error ? error.message : translate('audioCouldNotStart')); }
    };
    void play();
    return () => { cancelled = true; };
  }, [intervalRequest]);

  useEffect(() => {
    if (!playing) return;
    clock.current = { time: position.current, started: performance.now() };
    let lastPublished = 0;
    let frame = 0;
    const tick = (now: number) => {
      const { editor, volume, transparent } = current.current;
      const range = interval.current ?? editor.range;
      const next = Math.max(range.start, Math.min(range.end, clock.current.time + (now - clock.current.started) / 1000));
      position.current = next;
      engine.current?.update({ project: editor.project, time: next, playing: next < range.end, volume, transparent });
      if (now - lastPublished >= 100 || next >= range.end) {
        lastPublished = now;
        published.current = next;
        editor.setPlayhead(next);
      }
      if (next >= range.end) { interval.current = null; setPlaying(false); }
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const toggle = useCallback(async () => {
    const { editor, playing } = current.current;
    interval.current = null;
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
      if (document.querySelector('[aria-modal=true]') || event.code !== 'Space' || event.repeat || target.closest('input, textarea, select, button, [contenteditable=true]')) return;
      event.preventDefault(); void toggle();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [source, toggle]);

  const seek = (time: number) => {
    interval.current = null;
    setPlaying(false);
    editor.setPlayhead(time);
  };
  const sample = useCallback((clipId: string, x: number, y: number) => engine.current?.sample(clipId, x, y) ?? null, []);
  return { canvas, playing, status, toggle, seek, sample };
}
