import type { Project } from './model';

export interface History {
  past: Project[];
  present: Project;
  future: Project[];
  group: object | null;
}

export function createHistory(present: Project): History {
  return { past: [], present, future: [], group: null };
}

export function record(history: History, present: Project, group: object | null = null): History {
  if (JSON.stringify(history.present) === JSON.stringify(present)) return history;
  const grouped = group !== null && group === history.group;
  return { past: grouped ? history.past : [...history.past, history.present].slice(-100), present, future: [], group };
}

export function travel(history: History, direction: 'undo' | 'redo'): History {
  if (direction === 'undo') {
    const present = history.past.at(-1);
    return present ? { past: history.past.slice(0, -1), present, future: [history.present, ...history.future], group: null } : history;
  }
  const present = history.future[0];
  return present ? { past: [...history.past, history.present], present, future: history.future.slice(1), group: null } : history;
}

/** Import completion and cancellation must also update snapshots that can be restored. */
export function amend(history: History, update: (project: Project) => Project): History {
  return { ...history, past: history.past.map(update), present: update(history.present), future: history.future.map(update) };
}
