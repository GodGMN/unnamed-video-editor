import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { getLocale, setLocale, subscribe, t } from './core';
export { t, formatNumber, formatDateTime, locales, setLocale } from './core';
const LocaleContext = createContext(getLocale());
export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getLocale, () => 'en');
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === 'editor-locale') setLocale(event.newValue ?? navigator.language); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}
export function useT() { useContext(LocaleContext); return t; }
