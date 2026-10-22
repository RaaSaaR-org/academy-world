import type { Lang, Mode, ModeString, Text } from '@/core/types';

/** Nested string table. Leaves are strings or `{ entdecker, entscheider }` variants. */
export interface StringTable {
  [key: string]: ModeString | StringTable;
}

export interface LocalizedTables {
  de: StringTable;
  en?: StringTable;
}

/** A node is a mode variant only if it has exactly the two STRING leaves entdecker + entscheider. */
function isModeVariant(v: unknown): v is { entdecker: string; entscheider: string } {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.entdecker === 'string' && typeof o.entscheider === 'string' && Object.keys(o).length === 2;
}

/**
 * i18n with namespaces. Keys are `namespace.path.to.key`.
 * Resolution order: current language → German → visible `⟦key⟧` marker (and a console warning once).
 * Interpolation: `{name}` placeholders are replaced from `params`.
 */
export class I18n {
  private tables: Record<Lang, Map<string, ModeString>> = { de: new Map(), en: new Map() };
  private listeners = new Set<(lang: Lang) => void>();
  private warned = new Set<string>();
  private numberFormats = new Map<string, Intl.NumberFormat>();

  constructor(
    public lang: Lang,
    private getMode: () => Mode,
  ) {}

  /** Register a namespaced table. Re-registering a namespace overwrites keys. */
  registerStrings(ns: string, tables: LocalizedTables): void {
    this.flatten(ns, tables.de, this.tables.de);
    if (tables.en) this.flatten(ns, tables.en, this.tables.en);
  }

  private flatten(prefix: string, table: StringTable, into: Map<string, ModeString>): void {
    for (const [k, v] of Object.entries(table)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string' || isModeVariant(v)) into.set(key, v);
      else this.flatten(key, v as StringTable, into);
    }
  }

  has(key: string): boolean {
    return this.tables.de.has(key) || this.tables.en.has(key);
  }

  /** Translate a key for the current language + mode. */
  t(key: string, params?: Record<string, string | number>): string {
    const raw = this.tables[this.lang].get(key) ?? this.tables.de.get(key);
    if (raw === undefined) {
      if (!this.warned.has(key)) {
        this.warned.add(key);
        console.warn(`[i18n] missing key "${key}"`);
      }
      return `⟦${key}⟧`;
    }
    return interpolate(this.pickMode(raw), params);
  }

  /** Resolve any `Text` value (literal, {de,en}, {key}, or function). */
  resolve(text: Text | null | undefined, params?: Record<string, string | number>): string {
    if (text == null) return '';
    if (typeof text === 'string') return params ? interpolate(text, params) : text;
    if (typeof text === 'function') return text(this.lang, this.getMode());
    if ('key' in text) return this.t(text.key, { ...(text.params ?? {}), ...(params ?? {}) });
    const v = (this.lang === 'en' ? text.en : undefined) ?? text.de;
    return interpolate(this.pickMode(v), params);
  }

  private pickMode(v: ModeString): string {
    if (typeof v === 'string') return v;
    return v[this.getMode()] ?? v.entdecker;
  }

  setLang(lang: Lang): void {
    if (lang === this.lang) return;
    this.lang = lang;
    document.documentElement.lang = lang;
    for (const fn of [...this.listeners]) {
      try {
        fn(lang);
      } catch (err) {
        console.error('[i18n] listener threw', err);
      }
    }
  }

  /** Called on language change (and by the engine on mode change). Returns unsubscribe. */
  onChange(fn: (lang: Lang) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Re-notify listeners without changing language (used when the audience mode changes). */
  refresh(): void {
    for (const fn of [...this.listeners]) {
      try {
        fn(this.lang);
      } catch (err) {
        console.error('[i18n] listener threw', err);
      }
    }
  }

  /** Locale-aware number: `num(12.5, 1)` → "12,5" (de) / "12.5" (en). */
  num(value: number, digits = 0): string {
    const k = `${this.lang}:${digits}`;
    let f = this.numberFormats.get(k);
    if (!f) {
      f = new Intl.NumberFormat(this.lang === 'de' ? 'de-DE' : 'en-GB', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
      this.numberFormats.set(k, f);
    }
    return f.format(value);
  }
}

export function interpolate(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}
