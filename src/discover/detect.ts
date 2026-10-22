/**
 * The stills fork's session state and the frame probe (WP-D0, founder decision 3). Game-free.
 *
 * sessionStorage only (never localStorage), the keys the index.html gate reads:
 *   emai-academy-island/v1:discover-mode   'stills' | '3d'  the choice for this session
 *   emai-academy-island/v1:discover-alive  { stop, t }      while a 3D session runs; cleared on pagehide,
 *                                                           so finding it at boot = the tab was killed
 * The probe: frame intervals over 3 s after the start card; p90 > 50 ms offers the picture tour,
 * p90 > 80 ms switches to it (a reload into the stills path, remembered for the session).
 */
import type { CrashMarker } from './types';

const P = 'emai-academy-island/v1:';
export const MODE_KEY = P + 'discover-mode';
export const ALIVE_KEY = P + 'discover-alive';

export const PROBE = { ms: 3000, offerP90: 50, switchP90: 80, minFrames: 20 };

function ss(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Remember 'stills' or '3d' for this session (null forgets the choice). */
export function setSessionMode(mode: 'stills' | '3d' | null): void {
  try {
    if (mode) ss()?.setItem(MODE_KEY, mode);
    else ss()?.removeItem(MODE_KEY);
  } catch {
    /* storage blocked: the choice lasts this page only */
  }
}

/** The 3D session is running (at this stop). */
export function markAlive(stop: string | null): void {
  try {
    ss()?.setItem(ALIVE_KEY, JSON.stringify({ stop, t: Date.now() } satisfies CrashMarker));
  } catch {
    /* ignore */
  }
}

export function clearAlive(): void {
  try {
    ss()?.removeItem(ALIVE_KEY);
  } catch {
    /* ignore */
  }
}

/** Keep the marker while the 3D page lives; a normal leave (pagehide, also a reload) clears it. */
export function watchAlive(stop: () => string | null): void {
  markAlive(stop());
  window.addEventListener('pagehide', clearAlive);
  // bfcache: coming back is a live session again
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) markAlive(stop());
  });
}

/** Reload into the stills path (the probe's switch, the offer's button). */
export function switchToStills(): void {
  setSessionMode('stills');
  clearAlive();
  location.reload();
}

/** Reload into 3D from the stills path (the session's choice becomes '3d'; ?stills=1 is dropped). */
export function switchTo3d(): void {
  setSessionMode('3d');
  const u = new URL(location.href);
  u.searchParams.delete('stills');
  if (!u.searchParams.has('discover')) u.searchParams.set('discover', '1');
  location.replace(u.toString());
}

const pct = (a: number[], q: number): number => {
  const s = a.slice().sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
};

export interface ProbeResult {
  frames: number;
  p50: number;
  p90: number;
  verdict: 'ok' | 'offer' | 'switch';
}

/** Judge frame intervals (ms) of the probe window. */
export function judgeProbe(intervals: number[]): ProbeResult {
  const p90 = pct(intervals, 0.9);
  const verdict = intervals.length < PROBE.minFrames ? (intervals.length ? 'switch' : 'ok') : p90 > PROBE.switchP90 ? 'switch' : p90 > PROBE.offerP90 ? 'offer' : 'ok';
  return { frames: intervals.length, p50: Math.round(pct(intervals, 0.5) * 10) / 10, p90: Math.round(p90 * 10) / 10, verdict };
}
