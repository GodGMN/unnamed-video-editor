import { t as translate } from '../i18n/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Media } from '../editor/model';
import { readMediaFile } from '../media/files';

/** Plays one source file on its own in a `<video>`, outside the timeline. */
export function useSourcePlayer(media: Media | null, volume: number) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [status, setStatus] = useState('');
  const id = media?.id ?? null;
  const name = media?.name ?? '';

  useEffect(() => {
    const element = video.current;
    setPlaying(false); setTime(0); setStatus('');
    if (!element || !id) return;
    let url: string | null = null;
    let cancelled = false;
    readMediaFile(id).then((file) => {
      if (cancelled) return;
      if (!file) { setStatus(translate('sourceFileIsMissingImportYourOwnMediaTo2', { value1: name })); return; }
      url = URL.createObjectURL(file);
      element.src = url;
    }, (error: unknown) => { if (!cancelled) setStatus(error instanceof Error ? error.message : translate('mediaCouldNotBeLoaded')); });
    const onError = () => setStatus(element.error?.message || translate('thisFileCouldNotBeDecoded'));
    const onEnded = () => setPlaying(false);
    element.addEventListener('error', onError);
    element.addEventListener('ended', onEnded);
    return () => {
      cancelled = true;
      element.removeEventListener('error', onError);
      element.removeEventListener('ended', onEnded);
      element.pause();
      element.removeAttribute('src'); element.load();
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, name]);

  useEffect(() => { if (video.current) video.current.volume = volume; }, [volume, id]);

  // Follow the element's clock every frame while playing; `seeked` covers paused seeks.
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const sync = () => setTime(element.currentTime);
    element.addEventListener('seeked', sync);
    let frame = 0;
    const tick = () => { sync(); frame = requestAnimationFrame(tick); };
    if (playing) frame = requestAnimationFrame(tick);
    return () => { element.removeEventListener('seeked', sync); cancelAnimationFrame(frame); };
  }, [playing, id]);

  const duration = media?.duration ?? 0;
  const toggle = useCallback(async () => {
    const element = video.current;
    if (!element || !id) return;
    if (!element.paused) { element.pause(); setPlaying(false); return; }
    try {
      if (element.ended || element.currentTime >= element.duration) element.currentTime = 0;
      await element.play();
      setPlaying(true);
    } catch (error) { setStatus(error instanceof Error ? error.message : translate('playbackCouldNotStart')); }
  }, [id]);

  const seek = useCallback((to: number) => {
    const element = video.current;
    if (!element) return;
    element.pause(); setPlaying(false);
    const clamped = Math.max(0, Math.min(duration, to));
    element.currentTime = clamped;
    setTime(clamped);
  }, [duration]);

  useEffect(() => {
    if (!id) return;
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (document.querySelector('[aria-modal=true]') || event.code !== 'Space' || event.repeat || target.closest('input, textarea, select, button, [contenteditable=true]')) return;
      event.preventDefault(); void toggle();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [id, toggle]);

  return { video, playing, time, duration, status, toggle, seek };
}

/** An object URL for a still image previewing on its own, and why it can't show, if it can't. */
export function useStillSource(media: Media | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const id = media?.id ?? null;
  const name = media?.name ?? '';

  useEffect(() => {
    setUrl(null); setStatus('');
    if (!id) return;
    let created: string | null = null;
    let cancelled = false;
    readMediaFile(id).then((file) => {
      if (cancelled) return;
      if (!file) { setStatus(translate('sourceFileIsMissingImportYourOwnMediaTo2', { value1: name })); return; }
      created = URL.createObjectURL(file);
      setUrl(created);
    }, (error: unknown) => { if (!cancelled) setStatus(error instanceof Error ? error.message : translate('mediaCouldNotBeLoaded')); });
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created); };
  }, [id, name]);

  return { url, status, setStatus };
}
