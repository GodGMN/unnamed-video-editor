import type { KeyboardEvent, ReactNode } from 'react';
import { useId, useRef } from 'react';

export interface Tab<T extends string> { id: T; label: ReactNode }

/** A row of tabs over one panel. The caller renders the selected tab's content inside `children`; `actions` sit at the row's end. */
export function Tabs<T extends string>({ tabs, value, onChange, label, children, className, actions }: {
  tabs: Tab<T>[]; value: T; onChange: (id: T) => void; label: string; children: ReactNode; className?: string; actions?: ReactNode;
}) {
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  // Arrow keys move between tabs and select as they go, like a native tab strip.
  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value);
    const next = ({ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 } as Record<string, number>)[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const n = (next + tabs.length) % tabs.length;
    onChange(tabs[n].id);
    list.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[n]?.focus();
  };
  return <>
    <div className="tabs">
      <div ref={list} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((t) => (
          <button key={t.id} id={`${id}-${t.id}`} role="tab" aria-selected={t.id === value} aria-controls={`${id}-panel`}
            tabIndex={t.id === value ? 0 : -1} onClick={() => onChange(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {actions}
    </div>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${value}`} className={className}>{children}</div>
  </>;
}
