/**
 * C12d: a failed dynamic import (flaky network, a deploy swapping chunks) is retried. Boot imports
 * (Rapier, the island module) retry once after 1.5 s, so the boot error with „Erneut versuchen“
 * comes quickly; area code retries with AREA_RETRY_DELAYS (plan §5.8).
 *
 * A browser keeps a failed module fetch in its module map: importing the same URL again fails at
 * once without a request (measured in Chromium: one network hit for four attempts). So a retry
 * imports the chunk under a fresh URL (`?retry=n`) when the error names it (Chromium, Firefox); the
 * chunk's own imports still resolve to the shared chunks. Where the error has no URL (WebKit), the
 * loader is called again.
 */
/** fresh query tokens across calls (a manual „Erneut laden“ must not reuse a URL that already failed) */
let retryToken = 0;

export async function importRetry<T>(load: () => Promise<T>, delays: number | readonly number[] = 1500): Promise<T> {
  const waits = typeof delays === 'number' ? [delays] : delays;
  let attempt: () => Promise<T> = load;
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (err) {
      if (i >= waits.length) throw err;
      const url = failedModuleUrl(err);
      if (url) {
        const base = url.replace(/[?&]retry=\d+$/, '');
        const fresh = `${base}${base.includes('?') ? '&' : '?'}retry=${++retryToken}`;
        attempt = () => import(/* @vite-ignore */ fresh) as Promise<T>;
      }
      console.warn(`[load] import failed — retry ${i + 1}/${waits.length} in ${waits[i] / 1000} s`, err);
      await new Promise((r) => window.setTimeout(r, waits[i]));
    }
  }
}

/** The module URL a failed dynamic import names in its error (Chromium: „…module: <url>“, Firefox: „…module: <url>“), else null. */
export function failedModuleUrl(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/(https?:\/\/[^\s'"]+?\.(?:m?js|ts))(?:\?[^\s'"]*)?(?=[\s'"]|$)/);
  if (!m) return null;
  try {
    return new URL(m[1]).origin === window.location.origin ? m[1] : null;
  } catch {
    return null;
  }
}

/** Plan §5.8: 3 automatic retries with backoff (1, 3, 9 s) for area code; then the loading card offers „Erneut laden“. */
export const AREA_RETRY_DELAYS: readonly number[] = [1000, 3000, 9000];
