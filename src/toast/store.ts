/**
 * The one place errors are surfaced. Kept outside React so plain modules (storage, workers,
 * playback, conversion) can report an error without a hook.
 */
export interface ErrorToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface ErrorToast {
  id: number;
  key: string;
  title: string;
  message?: string;
  action?: ErrorToastAction;
}

export interface ErrorToastInput {
  title: string;
  message?: string;
  action?: ErrorToastAction;
  /** Reuse a live toast with this key instead of stacking a duplicate. */
  key?: string;
}

let toasts: ErrorToast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
/** Keep the stack short enough to stay out of the way; the newest errors win. */
const MAX_TOASTS = 4;

function emit() { for (const listener of listeners) listener(); }

export const getErrorToasts = () => toasts;

export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Adds an error toast, or updates the live one with the same key. Returns its id. */
export function pushError(input: ErrorToastInput): number {
  const key = input.key ?? `${input.title}\u0000${input.message ?? ''}`;
  const existing = toasts.find((toast) => toast.key === key);
  if (existing) {
    toasts = toasts.map((toast) => toast.id === existing.id
      ? { ...toast, title: input.title, message: input.message, action: input.action }
      : toast);
    emit();
    return existing.id;
  }
  const toast: ErrorToast = { id: nextId++, key, title: input.title, message: input.message, action: input.action };
  toasts = [toast, ...toasts].slice(0, MAX_TOASTS);
  emit();
  return toast.id;
}

export function dismissError(id: number) {
  const next = toasts.filter((toast) => toast.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

export function clearErrors() {
  if (!toasts.length) return;
  toasts = [];
  emit();
}

/** A readable message for anything a `catch` can receive. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return error === undefined || error === null ? '' : String(error);
}

/** Convenience wrapper for caught errors. */
export function reportError(title: string, error: unknown, action?: ErrorToastAction, key?: string): number {
  const message = errorMessage(error).trim();
  return pushError({ title, message: message && message !== title ? message : undefined, action, key });
}
