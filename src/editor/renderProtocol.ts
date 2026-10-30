import type { Project } from './model';

export type RenderRequest =
  | { type: 'init'; project: Project; files: Record<string, File> }
  | { type: 'frame'; time: number };
export type RenderReply =
  | { type: 'ready' }
  | { type: 'frame'; frames: { clipId: string; image: ImageBitmap }[] }
  | { type: 'error'; message: string };
