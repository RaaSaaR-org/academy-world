/**
 * WP14 (the Revier, plan §2.2–§2.8, §4.11, §5.6) — the eager part of the region: it decides WHEN the region
 * chunk loads, and keeps the region going when that chunk cannot be fetched. Everything visible lives in the
 * lazy chunk (src/world/region/index.ts → `region-<hash>.js`, ≤ 120 KB brotli): the sites' far impostors, the
 * Grubenrand with the retired bucket-wheel excavator and the Revier-Chronik, the wayfinding at the pads, the
 * sound beds and the map layer.
 *
 * When (plan §5.6, §3.6, C1 m11):
 *  - a start on the ground (a resume into a ground area while docked, a deep link `?zone=` / `?area=` /
 *    `?only=` to one, a `?pos=` beyond the yard): the chunk loads and builds before the title;
 *  - otherwise in an idle slot once the title is up (first load +0 bytes).
 * A failed fetch retries 1, 3, 9 s (plan §5.8); then the wayfinding at the ground pads shows the loading card
 * with „Erneut laden“. Nothing the player needs depends on the region (the sites have their own chunks, the
 * tracks and their colliders are WP3's), so there is no Bodencrew offer here.
 *
 * Tool hook: `__academy.ext('region')()` → { state, when, builtAtMs, … the chunk's stats }.
 */
import type { ZoneContext, ZoneManifest } from '@/core/zones';
import { registerDebugExt } from '@/core/DebugApi';
import { AREA_RETRY_DELAYS, importRetry } from '@/core/retry';
import type { GroundHandle } from '../ground';
import { GROUND_PADS } from '../layout';
import { PLATEAU } from '../ground/plan';
import { R } from './tuning';

/** what the island module hands the world packages (src/world/index.ts `P7`) */
export interface RegionDeps {
  step: () => Promise<void>;
  manifests: ZoneManifest[];
  ground: GroundHandle;
}

/** what the region chunk returns (src/world/region/index.ts) */
export interface RegionChunk {
  stats(): Record<string, unknown>;
}

export interface Region {
  /** 'idle' (waiting for the title), 'loading', 'built' or 'failed' */
  readonly state: 'idle' | 'loading' | 'built' | 'failed';
  /** load (or retry) the chunk; resolves once it is built or has failed */
  load(): Promise<void>;
}

/** A start on the ground needs the region before the title (plan §3.6 C1 m11; the same rule as WP3's ring). */
function groundStart(ctx: ZoneContext): boolean {
  const p = new URLSearchParams(location.search);
  const ground = new Set(ctx.zones.list({ kind: 'all' }).filter((m) => m.frame === 'ground').map((m) => m.id));
  const links = [p.get('zone'), p.get('area'), ...(p.get('only') ?? '').split(',')].filter((s): s is string => !!s);
  if (links.some((id) => ground.has(id))) return true;
  // a returning visitor resumes at the gate of the area entered last (D26): on the ground only while docked
  const resume = ctx.quest?.resumeArea?.() ?? null;
  if (resume && ground.has(resume) && ctx.quest.snapshot().flight.state === 'ground') return true;
  const pos = (p.get('pos') ?? '').split(',').map(Number);
  return pos.length >= 3 && pos.every(Number.isFinite) && Math.hypot(pos[0], pos[2]) > PLATEAU.flat - 10;
}

export async function buildRegion(ctx: ZoneContext, deps: RegionDeps): Promise<Region> {
  let state: Region['state'] = 'idle';
  let when: 'boot' | 'idle' | 'retry' | null = null;
  let builtAtMs: number | null = null;
  let attempts = 0;
  let chunk: RegionChunk | null = null;
  let pending: Promise<void> | null = null;

  const load = (why: 'boot' | 'idle' | 'retry'): Promise<void> =>
    (pending ??= (async () => {
      state = 'loading';
      attempts++;
      try {
        const m = await importRetry(() => import('./index'), AREA_RETRY_DELAYS);
        chunk = await m.build(ctx, deps);
        state = 'built';
        when = why;
        builtAtMs = Math.round(performance.now());
        failCard?.remove();
        failCard = null;
      } catch (err) {
        console.error('[region] the region chunk failed to load', err);
        state = 'failed';
        pending = null;
      }
    })());

  // ── the failure path (plan §5.8): the loading card at the ground pads, „Erneut laden“ ──
  let failCard: ReturnType<ZoneContext['game']['loadingCard']> | null = null;
  ctx.every(0.5, () => {
    if (state !== 'failed') return;
    const p = ctx.player.position;
    const nearPad = ctx.flight.docked && GROUND_PADS.some((g) => Math.hypot(p.x - g.position[0], p.z - g.position[2]) < 28);
    if (nearPad && !failCard)
      failCard = ctx.game.loadingCard({
        name: ctx.i18n.text('region.card'),
        state: () => (state === 'failed' ? 'failed' : 'loading'),
        retry: () => {
          failCard?.update();
          void load('retry').then(() => failCard?.update());
        },
      });
    else if (!nearPad && failCard) {
      failCard.remove();
      failCard = null;
    }
  });
  ctx.i18n.register({ de: { region: { card: 'Das Revier' } }, en: { region: { card: 'The Revier' } } });

  ctx.onDispose(
    registerDebugExt('region', () => ({ state, when, builtAtMs, attempts, ...(chunk?.stats() ?? {}) })),
  );

  if (groundStart(ctx)) await load('boot');
  else
    ctx.after(R.load.afterTitle, () => {
      const ric = (globalThis as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric(() => void load('idle'), { timeout: R.load.idleTimeoutMs });
      else window.setTimeout(() => void load('idle'), 50);
    });

  return {
    get state() {
      return state;
    },
    load: () => load('retry'),
  };
}
