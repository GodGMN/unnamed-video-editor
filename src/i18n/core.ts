import { en } from './locales/en';
import { es } from './locales/es';

export type TranslationKey = keyof typeof en;
export type Message = string | Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Dictionary = Partial<Record<TranslationKey, Message>>;
export const locales: Record<string, { name: string; messages: Dictionary }> = {
  en: { name: 'English', messages: en },
  es: { name: 'Español', messages: es },
};
export const LOCALE_KEY = 'editor-locale';
// Other languages of Spain fall back to Spanish until they get a dictionary of their own.
const SPANISH_FALLBACK = new Set(['ca', 'eu', 'gl', 'ast', 'an', 'ext']);
function matchLocale(language: string): string | null {
  const code = language.toLowerCase();
  const base = code.split('-')[0];
  if (Object.hasOwn(locales, code)) return code;
  if (Object.hasOwn(locales, base)) return base;
  if (SPANISH_FALLBACK.has(base) || code === 'oc-es') return 'es';
  return null;
}
// The first language the app can show, in the user's order of preference; English otherwise.
export function resolveLocale(...languages: readonly string[]): string {
  for (const language of languages) {
    const match = matchLocale(language);
    if (match) return match;
  }
  return 'en';
}
export function browserLocale(): string {
  if (typeof navigator === 'undefined') return 'en';
  return resolveLocale(...(navigator.languages?.length ? navigator.languages : [navigator.language]));
}
export function initialLocale(): string {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    return stored ? resolveLocale(stored) : browserLocale();
  } catch { return browserLocale(); }
}
let locale = initialLocale();
const listeners = new Set<() => void>();
export const getLocale = () => locale;
export function setLocale(value: string) {
  locale = resolveLocale(value);
  try { localStorage.setItem(LOCALE_KEY, locale); } catch { /* Browser storage may be disabled. */ }
  listeners.forEach((listener) => listener());
}
export function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
const warned = new Set<string>();
export function translate(language: string, key: TranslationKey, params: Record<string, string | number> = {}): string {
  const selected = resolveLocale(language);
  const message = locales[selected]?.messages[key];
  if (message === undefined && import.meta.env.DEV && !warned.has(`${selected}:${key}`)) {
    warned.add(`${selected}:${key}`);
    console.warn(`[i18n] Missing ${selected} translation: ${key}`);
  }
  const value: Message = message ?? en[key];
  const text = typeof value === 'string' ? value : value[new Intl.PluralRules(message === undefined ? 'en' : selected).select(Number(params.count ?? 0))] ?? value.other;
  return text.replace(/\{(\w+)\}/g, (token, name: string) => params[name] === undefined ? token : typeof params[name] === 'number' ? new Intl.NumberFormat(selected).format(params[name]) : params[name]);
}
export const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params);
export const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, options).format(value);
export const formatDateTime = (value: Date | number, options?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, options).format(value);
