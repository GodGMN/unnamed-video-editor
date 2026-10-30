import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '../editor/useProject';
import { PlaybackEngine } from './engine';

export function usePlayback(editor: Editor, volume: number) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<PlaybackEngine | null>(null);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');
  const current = useRef({ editor, playing, volume });
  current.current = { editor, playing, volume };

  useEffect(() => {
    const instance = new PlaybackEngine(canvas.current!, setStatus);
    engine.current = instance;
    return () => { instance.dispose(); engine.current = null; };
  }, []);

  useEffect(() => {
    if (editor.ui.playhead > editor.layout.end) editor.setPlayhead(editor.layout.end);
  }, [editor.ui.playhead, editor.layout.end, editor.setPlayhead]);

  useEffect(() => {
    engine.current?.update({ project: editor.project, time: editor.ui.playhead, playing, volume });
  }, [editor.project, editor.ui.playhead, playing, volume]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const { editor } = current.current;
      const next = Math.min(editor.layout.end, editor.ui.playhead + (now - last) / 1000);
      last = now;
      editor.setPlayhead(next);
      if (next >= editor.layout.end) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const toggle = useCallback(async () => {
    const { editor, playing } = current.current;
    if (playing) { setPlaying(false); return; }
    try {
      await engine.current?.resumeAudio();
      if (editor.ui.playhead >= editor.layout.end) editor.setPlayhead(0);
      setPlaying(true);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Audio could not start.'); }
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.code !== 'Space' || event.repeat || target.closest('input, textarea, select, button, [contenteditable=true]')) return;
      event.preventDefault(); void toggle();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [toggle]);

  const seek = (time: number) => {
    setPlaying(false);
    editor.setPlayhead(Math.max(0, Math.min(editor.layout.end, time)));
  };
  return { canvas, playing, status, toggle, seek };
}
