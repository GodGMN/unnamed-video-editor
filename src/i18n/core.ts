import type { FlagCode } from '../components/Flag';
import { en } from './locales/en';

export type TranslationKey = keyof typeof en;
export type Message = string | Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Dictionary = Partial<Record<TranslationKey, Message>>;
export const locales: Record<string, { name: string; flag?: FlagCode; messages: Dictionary }> = { en: { name: 'English', flag: 'gb', messages: en } };
export const LOCALE_KEY = 'editor-locale';
export function resolveLocale(language: string): string {
  return Object.hasOwn(locales, language.toLowerCase()) ? language.toLowerCase() : Object.hasOwn(locales, language.toLowerCase().split('-')[0]) ? language.toLowerCase().split('-')[0] : 'en';
}
export function initialLocale(): string {
  try { return resolveLocale(localStorage.getItem(LOCALE_KEY) ?? navigator.language); }
  catch { return typeof navigator === 'undefined' ? 'en' : resolveLocale(navigator.language); }
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
