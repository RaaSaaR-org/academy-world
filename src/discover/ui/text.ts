/**
 * A TextResolver without the game's I18n (the stills path, WP-D0). It resolves literal strings,
 * `{ de, en }` texts (mode variants → the Entscheider leg, as Discover's 3D save) and functions; a
 * `{ key }` text has no table here and shows as ⟦key⟧ (use generated `{ de, en }` content instead).
 */
import type { Lang, Text } from '@/core/types';
import type { TextResolver } from '../types';

const interpolate = (s: string, params?: Record<string, string | number>): string =>
  params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;

export class PlainText implements TextResolver {
  private listeners = new Set<(l: Lang) => void>();
  private formats = new Map<string, Intl.NumberFormat>();
  constructor(public lang: Lang) {}

  resolve(text: Text | null | undefined, params?: Record<string, string | number>): string {
    if (text == null) return '';
    if (typeof text === 'string') return interpolate(text, params);
    if (typeof text === 'function') return text(this.lang, 'entscheider');
    if ('key' in text) return `⟦${text.key}⟧`;
    const v = (this.lang === 'en' ? text.en : undefined) ?? text.de;
    return interpolate(typeof v === 'string' ? v : (v.entscheider ?? v.entdecker), params);
  }

  num(value: number, digits = 0): string {
    const k = `${this.lang}:${digits}`;
    let f = this.formats.get(k);
    if (!f) this.formats.set(k, (f = new Intl.NumberFormat(this.lang === 'de' ? 'de-DE' : 'en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits })));
    return f.format(value);
  }

  setLang(lang: Lang): void {
    if (lang === this.lang) return;
    this.lang = lang;
    document.documentElement.lang = lang;
    for (const fn of [...this.listeners]) fn(lang);
  }

  onChange(fn: (lang: Lang) => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
}

/** The language a Discover page starts in: ?lang=, the saved setting (read only), the browser. */
export function startLang(): Lang {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'de' || q === 'en') return q;
    const s = JSON.parse(localStorage.getItem('emai-academy-island/v1:settings') || 'null') as { lang?: unknown } | null;
    if (s && (s.lang === 'de' || s.lang === 'en')) return s.lang;
    return /^de\b/i.test(navigator.language || 'de') ? 'de' : 'en';
  } catch {
    return 'de';
  }
}
