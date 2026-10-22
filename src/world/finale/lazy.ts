import type { ZoneContext } from '@/core/zones';
import { registerDebugExt } from '@/core/DebugApi';
import type { Lift, LiftStop } from '../lift';
import type { Masts } from '../masts';
import type { GroundHandle } from '../ground';
import type { Sky } from '../sky';
import { applyDocked, liftoffLock } from './dock';
import { AUSGUCK } from './tuning';
import { TOWER, polar } from '../layout';
import type { Finale } from './index';

/**
 * W6 (PL-16): the finale (Kielraum, F1–F3, the lift-off, ending, certificate) is its own chunk.
 * This stand-in is all the island's boot needs:
 *  - after a reload in the air past the first flight, the evening (or the day the player chose) is back
 *    at once (Phase 7: dusk exists only airborne, §5.7);
 *  - the dock switch: a flight state set to ground from outside the lift-off (the title's „Im Dock
 *    weiterspielen“, a progress reset) puts the island back in its dock (dock.ts), also before the chunk;
 *  - the title's „Abheben ansehen“ ('liftoff:replay') and `?liftoff=1` (all conditions met, at the console);
 *  - KIEL −36 stays open once the finale was reached (same rule as the finale's own);
 *  - the lift's KIEL button, the finale's debug hooks and its tool hooks (__academy.ext) load the
 *    module on first use.
 * The module itself is loaded in idle time once the title is up (`game:ready`), at Start at the
 * latest, and at once when KIEL opens (4 rotors bereit), the lift-off is armed, or the stored state needs it.
 */
export interface LazyFinale {
  /** the built finale, or null while its chunk is still on the way */
  readonly current: Finale | null;
  load(): Promise<Finale | null>;
}

export interface FinaleDeps {
  lift: Lift;
  masts?: Masts | null;
  /** WP2's sky (the reveal of the sky dressing); WP3's dock (arms, bridge, spray, the outside shots) */
  sky?: Sky | null;
  ground?: GroundHandle | null;
}

/** the debug hooks buildFinale() registers (window.__academy.solve('world', name)) */
const HOOKS = [
  'finale-goto',
  'finale-f1',
  'finale-f1-bot',
  'finale-f1-bot-slow',
  'finale-f1-solve',
  'finale-f2',
  'finale-f2-solve',
  'finale-f3-solve',
  'finale-ending',
  'finale-certificate',
  'finale-reset',
  'finale-state',
  // Phase 7 (WP13): the lift-off and the dock switch (tools: playtest, ending-check, liftoff-check, memory-lap, hitches)
  'liftoff',
  'liftoff-skip',
  'liftoff-replay',
  'liftoff-dock',
  'liftoff-state',
  'liftoff-goto',
];
/** the tool hooks buildFinale() provides (__academy.ext(name)) */
const EXTS = ['sequence:liftoff', 'view:climb', 'view:kielraum-f1', 'liftoff:throttle', 'liftoff', 'finale:certificate'];

interface StoredFinale {
  visited?: boolean;
  ended?: boolean;
  f1?: unknown;
}

export function lazyFinale(ctx: ZoneContext, deps: FinaleDeps): LazyFinale {
  const stored = (): StoredFinale => ctx.progress.get<StoredFinale | null>('finale', null) ?? {};
  const q = (): ReturnType<ZoneContext['quest']['snapshot']> => ctx.quest.snapshot();
  const flown = (): boolean => {
    const f = q().flight;
    return f.firstFlightAt != null || f.liftoffSeen;
  };
  const dockDeps = { ground: () => deps.ground ?? null, sky: () => deps.sky ?? null };
  // evening.ts does the same once it is built; the sky must not flash the day look meanwhile
  if (ctx.flight.state === 'airborne' && flown() && ctx.progress.get<'dusk' | 'day'>('sky', 'dusk') !== 'day') ctx.events.emit('finale:dusk', { t: 1 });
  // airborne after a reload: the arms are stowed and the bridge is in (the ground waits 570 m below)
  if (ctx.flight.state === 'airborne') {
    deps.ground?.setArms(1);
    deps.ground?.setBridge(1);
  }
  deps.lift.setKielOpen(() => {
    const s = stored();
    return !!(s.visited || s.ended || s.f1);
  });

  let current: Finale | null = null;
  let pending: Promise<Finale | null> | null = null;
  const load = (): Promise<Finale | null> =>
    (pending ??= import('./index')
      .then((m) => {
        current = m.buildFinale(ctx, deps);
        // the room's, the console's and the ghost horizon's programs and textures are new to the renderer
        // (the boot's warm-up ran before): they compile in the background now, before anything shows them
        ctx.events.emit('world:late-build', { what: 'finale' });
        return current;
      })
      .catch((err: unknown) => {
        console.error('[world] the finale failed to load', err);
        pending = null;
        return null;
      }));

  deps.lift.setKielHandler((to: LiftStop) => void load().then((f) => f?.kiel(to)));
  for (const name of HOOKS) ctx.debug.register(name, async () => (await load())?.debug(name));
  for (const name of EXTS)
    ctx.onDispose(
      registerDebugExt(name, (async (...a: unknown[]) => {
        const f = await load();
        const fn = f?.ext(name);
        return fn ? fn(...a) : null;
      }) as never),
    );

  // ── the flight state from outside the lift-off (D25, §3.6) ──────────────────────────────────────
  ctx.events.on('flight:state', (p?: { state?: string }) => {
    if (liftoffLock.running) return;
    if (p?.state === 'ground' && ctx.flight.altitude > 0) {
      applyDocked(ctx, dockDeps);
      current?.syncFlight();
    } else current?.syncFlight();
  });
  // the title's „Abheben ansehen“ (WP1: after Start): play the lift-off on the Ausguck, end airborne
  ctx.events.on('liftoff:replay', () => void load().then((f) => f?.replay('title')));
  // ?liftoff=1 (plan §3.6): every lift-off condition met, at the console
  const liftoffParam = /[?&]liftoff=1(&|$)/.test(location.search);
  ctx.events.once('game:start', () => {
    if (!liftoffParam) return;
    const [x, , z] = polar(AUSGUCK.stand.bearing, AUSGUCK.stand.r);
    ctx.player.teleport([x, TOWER.ausguck.y + 0.05, z], { yawDeg: 360 - AUSGUCK.facing, pitchDeg: -4 });
  });

  // when to load: idle time after the title, Start at the latest, at once when KIEL opens or the lift-off is armed
  const needNow = (): boolean => {
    const s = stored();
    const snap = q();
    return !!(s.visited || s.ended || s.f1) || snap.kielOpen || snap.armed || liftoffParam || ctx.flight.state === 'airborne';
  };
  const idle = (): void => {
    const ric = (globalThis as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(() => void load(), { timeout: 2500 });
    else window.setTimeout(() => void load(), 600);
  };
  ctx.events.once('game:ready', idle);
  ctx.events.once('game:start', () => void load());
  for (const ev of ['quest:kiel-open', 'quest:armed']) ctx.events.on(ev, () => void load());
  if (needNow()) idle();

  return {
    get current() {
      return current;
    },
    load,
  };
}
