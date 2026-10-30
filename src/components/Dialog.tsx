import { useT } from '../i18n';
import { t as translate } from '../i18n/core';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Clock, Close, Info, Play, Warning } from './icons';

interface DialogProps {
  id: string;
  className?: string;
  title: string;
  subtitle: string;
  /** The title's trailing dot turns amber when something went wrong. */
  warn?: boolean;
  width: number;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ id, className, title, subtitle, warn, width, onClose, children }: DialogProps) {
  useT();
  const modal = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [opener] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useLayoutEffect(() => {
    const element = modal.current!;
    element.showModal();
    const field = [...element.querySelectorAll<HTMLElement>('input:not([type="hidden"]), textarea')]
      .find(el => !el.matches(':disabled') && !el.closest('[inert]') && el.getClientRects().length > 0);
    (field ?? heading.current)?.focus();
    return () => {
      element.close();
      queueMicrotask(() => {
        if (opener?.isConnected && !opener.closest('[inert]')) opener.focus();
      });
    };
  }, [opener]);

  return (
    <dialog ref={modal} className="scrim" aria-labelledby={id} onKeyDown={e => {
      if (e.key !== 'Tab' || e.defaultPrevented || (e.target as Element).closest('dialog') !== e.currentTarget) return;
      const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
        .filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[inert]') && el.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || (e.shiftKey ? document.activeElement === first || !controls.includes(document.activeElement as HTMLElement) : document.activeElement === last)) {
        e.preventDefault();
        (e.shiftKey ? last : first)?.focus();
      }
    }} onCancel={e => { e.preventDefault(); e.stopPropagation(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={['dialog', className].filter(Boolean).join(' ')} style={{ maxWidth: width }}>
        <div className="dialog-head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h2 ref={heading} tabIndex={-1} id={id}>{title}<span style={{ color: warn ? 'var(--warn)' : 'var(--accent)' }}>.</span></h2>
            <span className="dialog-sub">{subtitle}</span>
          </div>
          <button className="ib square" style={{ flex: 'none' }} aria-label={translate('close')} onClick={onClose}>
            <Close stroke="#C8CEC9" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function Choice<K extends string>({ label, options, value, onChange }: {
  label: string;
  options: { key: K; label: string; sub: string }[];
  value: K;
  onChange: (k: K) => void;
}) {
  useT();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{label}</span>
      <div className="seg choice" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.key} aria-pressed={value === o.key} onClick={() => onChange(o.key)}>
            <span>{o.label}</span>
            <span>{o.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export type StageStatus = 'done' | 'active' | 'wait';

export function Progress({ pct, detail, label, stages, note }: {
  pct: number;
  detail: string;
  label: string;
  stages: { label: string; status: StageStatus; note: string }[];
  note: string;
}) {
  useT();
  const p = Math.round(pct);
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span className="progress-big">{p}<span>%</span></span>
        <span className="mono" style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>{detail}</span>
      </div>
      <div role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="progress">
        <div style={{ width: `${p}%` }} />
      </div>
      <div className="stages">
        {stages.map((s) => (
          <div key={s.label} className={'stage-row ' + s.status}>
            <i />
            <span>{s.label}</span>
            <span className="mono">{s.note}</span>
          </div>
        ))}
      </div>
      <Note icon={<Clock size={15} stroke="#C8CEC9" />}>{note}</Note>
    </>
  );
}

export function Note({ icon = <Info size={15} stroke="#C8CEC9" />, children }: { icon?: ReactNode; children: ReactNode }) {
  useT();
  return <div className="note">{icon}<span>{children}</span></div>;
}

export function Alert({ title, children }: { title: string; children: ReactNode }) {
  useT();
  return (
    <div className="alert">
      <Warning size={18} stroke='var(--warn)' />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

export function ResultCard({ tone, name, meta, extra }: { tone: string; name: string; meta: string; extra?: ReactNode }) {
  useT();
  return (
    <div className="result">
      <div className="result-thumb" style={{ background: tone }}><Play size={18} fill="var(--text)" /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span style={{ fontWeight: 700 }}>{name}</span>
        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{meta}</span>
        {extra}
      </div>
    </div>
  );
}

export function CheckRow({ label, note, status = 'ok' }: { label: string; note: string; status?: 'ok' | 'fail' | 'pending' }) {
  useT();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span className={'check-dot ' + status}>
        {status === 'ok' && <Check size={11} stroke="var(--bg)" strokeWidth={3.5} />}
        {status === 'fail' && <Close size={11} stroke="var(--bg)" strokeWidth={3.5} />}
      </span>
      <span>{label}</span>
      <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', fontSize: 12 }}>{note}</span>
    </div>
  );
}

/** Advances 0→100 over `ms` while `running`, then calls `onDone`. Stands in for real encoder progress. */
export function useSimulatedProgress(running: boolean, ms: number, onDone: () => void) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (!running) { setPct(0); return; }
    const t0 = performance.now();
    const timer = setInterval(() => {
      const p = Math.min(100, (performance.now() - t0) / ms * 100);
      setPct(p);
      if (p >= 100) { clearInterval(timer); onDone(); }
    }, 100);
    return () => clearInterval(timer);
  }, [running, ms, onDone]);
  return pct;
}
