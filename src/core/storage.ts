/**
 * Safe localStorage access. Every read/write is wrapped in try/catch so a private
 * window, blocked storage or a quota error never breaks the game.
 */
const PREFIX = 'emai-academy-island/v1:';

let works: boolean | null = null;

/**
 * UXA-12: can this browser keep the progress? false in a private window that refuses storage, with
 * blocked site data or a full quota (the title and the first minute say so). Tested once.
 */
export function storageWorks(): boolean {
  if (works != null) return works;
  try {
    const k = PREFIX + '__probe';
    window.localStorage.setItem(k, '1');
    works = window.localStorage.getItem(k) === '1';
    window.localStorage.removeItem(k);
  } catch {
    works = false;
  }
  return works;
}

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — progress simply isn't persisted */
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

/**
 * C12c: remove every key of the game (local and session storage) except `keep` (the settings: the
 * language and the volumes survive a reset).
 */
export function clearGameStorage(keep: string[] = ['settings']): void {
  for (const store of ['localStorage', 'sessionStorage'] as const) {
    try {
      const s = window[store];
      const keys: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && k.startsWith(PREFIX) && !keep.includes(k.slice(PREFIX.length))) keys.push(k);
      }
      for (const k of keys) s.removeItem(k);
    } catch {
      /* storage unavailable: nothing to clear */
    }
  }
}

export function sessionLoad<T>(key: string, fallback: T): T {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function sessionSave(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
