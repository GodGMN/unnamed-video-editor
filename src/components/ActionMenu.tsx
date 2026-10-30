import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { More } from './icons';
import type { ReactNode } from 'react';

export interface MenuAction { label: string; run: () => void; danger?: boolean; separator?: boolean }
export function ActionMenu({ label, actions, disabled, children }: {
  label: string; actions: MenuAction[]; disabled?: boolean; children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!open) return;
    const box = anchor.current!.getBoundingClientRect();
    const height = menu.current!.getBoundingClientRect().height;
    setPosition({ top: Math.max(8, box.bottom + height + 8 > window.innerHeight ? box.top - height - 8 : box.bottom + 8), left: Math.max(8, Math.min(window.innerWidth - 236, box.right - 228)) });
    menu.current?.querySelector('button')?.focus();
    const close = (e: PointerEvent) => { if (!anchor.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); trigger.current?.focus(); } };
    const scrolled = () => setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', scrolled);
    window.addEventListener('scroll', scrolled, true);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); window.removeEventListener('resize', scrolled); window.removeEventListener('scroll', scrolled, true); };
  }, [open, actions.length]);
  return <div className="action-menu" ref={anchor}>
    <button ref={trigger} className={children ? 'home-new-more' : 'project-more'} aria-label={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(v => !v)}>{children ?? <More size={20} />}</button>
    {open && createPortal(<div ref={menu} role="menu" aria-label={label} className="project-actions" style={position} onKeyDown={e => {
      const buttons = [...e.currentTarget.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
      if (e.key === 'Tab') setOpen(false);
      if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); buttons[e.key === 'Home' ? 0 : buttons.length - 1]?.focus(); }
    }}>{actions.map(a => <button key={a.label} role="menuitem" className={`${a.danger ? 'danger' : ''} ${a.separator ? 'separated' : ''}`} onClick={() => { setOpen(false); trigger.current?.focus(); a.run(); }}>{a.label}</button>)}</div>, document.body)}
  </div>;
}
