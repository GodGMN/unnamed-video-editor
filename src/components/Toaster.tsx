import { useT } from '../i18n';
import { t as translate } from '../i18n/core';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { dismissError, getErrorToasts, reportError, subscribeToasts } from '../toast/store';
import type { ErrorToast } from '../toast/store';
import { Close, Warning } from './icons';

const EMPTY: ErrorToast[] = [];

/** The app's only error surface: persistent Ember toasts, bottom centre. */
export function Toaster() {
  useT();
  const toasts = useSyncExternalStore(subscribeToasts, getErrorToasts, () => EMPTY);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[role="dialog"]')) return;
      const newest = getErrorToasts()[0];
      if (newest) dismissError(newest.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!toasts.length) return null;
  return (
    <div className="toaster" role="region" aria-label={translate('toastErrors')}>
      {toasts.map((toast) => <ErrorToastCard key={toast.id} toast={toast} />)}
    </div>
  );
}

function ErrorToastCard({ toast }: { toast: ErrorToast }) {
  const [leaving, setLeaving] = useState(false);
  const dismiss = () => {
    setLeaving(true);
    setTimeout(() => dismissError(toast.id), 160);
  };
  const act = () => {
    const action = toast.action;
    if (!action) return;
    dismiss();
    // Actions usually report their own failures; this keeps a rejected retry from going silent.
    void Promise.resolve().then(action.run).catch((error) => reportError(translate('toastActionFailed'), error));
  };
  return (
    <article className={`toast${leaving ? ' leaving' : ''}`} role="alert" aria-atomic="true">
      <span className="toast-icon" aria-hidden="true">
        <Warning size={13} stroke="#fff" strokeWidth={2.4} />
      </span>
      <div className="toast-text">
        <strong className="toast-title">{toast.title}</strong>
        {toast.message && <span className="toast-message" title={toast.message}>{toast.message}</span>}
      </div>
      {toast.action && <button className="toast-action" onClick={act}>{toast.action.label}</button>}
      <button className="toast-close" onClick={dismiss} aria-label={translate('projectHomeDismissError')}>
        <Close size={13} strokeWidth={2.2} />
      </button>
    </article>
  );
}
