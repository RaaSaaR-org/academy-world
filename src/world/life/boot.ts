/**
 * WP15 — life and easter eggs, the island's eager part (plan §6.2: one `await buildLife(ctx, P7)` line in
 * the Phase 7 packages block of src/world/index.ts). At island init it
 *  - registers the eggs with ctx.game.secrets (the Pass „Funde“ slots and the zones' finds need them from
 *    the first frame) and their Fundvitrine objects (WP11 places them by id);
 *  - registers the tool hooks __academy.ext('life'), ('life:crowd') and ('secrets:audit');
 *  - loads the life runtime (its own lazy chunk, ≤ 40 KB, plan §5.6) in idle time after the title, at
 *    Start at the latest, and builds it: the LifeDirector, the people, the farm, the birds, the bees, the
 *    Tomatenkapsel arm and the island's own eggs.
 * The deck rovers' reactions (L5, egg 5) live in landscape/rovers.ts, the Tomatenkapseln in pods.ts and the
 * drones' duct visits in drones.ts (eager rc4 landscape, WP15's files).
 */
import type { ZoneContext } from '@/core/zones';
import { registerDebugExt } from '@/core/DebugApi';
import type { GroundHandle } from '../ground';
import { auditRows, registerEggs } from '../eggs/defs';
import { registerVitrineObjects, vitrineTriangles } from '../eggs/objects';
import type { LifeRuntime } from './index';

/** What the island's Phase 7 block shares with its packages (src/world/index.ts `P7`). */
export interface LifeDeps {
  step: () => Promise<void>;
  ground: GroundHandle;
}

export interface LifeBoot {
  /** the runtime once its chunk is in (null before) */
  readonly current: LifeRuntime | null;
  load(): Promise<LifeRuntime | null>;
}

export async function buildLife(ctx: ZoneContext, P7: LifeDeps): Promise<LifeBoot> {
  registerEggs(ctx);
  registerVitrineObjects(ctx);

  let current: LifeRuntime | null = null;
  let pending: Promise<LifeRuntime | null> | null = null;
  const load = (): Promise<LifeRuntime | null> =>
    (pending ??= import('./index')
      .then((m) => (current = m.startLife(ctx, { ground: P7.ground })))
      .catch((err: unknown) => {
        console.error('[life] the life chunk failed to load', err);
        pending = null;
        return null;
      }));

  // tool hooks (plan §5.10): the director's numbers, the apron crowd, the eggs for secret-audit
  ctx.onDispose(registerDebugExt('life', () => current?.stats() ?? { pending: 'the life chunk is not loaded yet' }));
  ctx.onDispose(registerDebugExt('life:crowd', () => current?.crowd() ?? null));
  ctx.onDispose(registerDebugExt('life:people', () => current?.peopleState() ?? null));
  ctx.onDispose(registerDebugExt('life:load', () => load().then((r) => !!r)));
  ctx.onDispose(registerDebugExt('secrets:audit', () => auditRows()));
  ctx.onDispose(registerDebugExt('secrets:objects', () => vitrineTriangles()));

  // when: idle time after the title (like the finale chunk), Start at the latest; a deep link at once
  const idle = (): void => {
    const ric = (globalThis as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(() => void load(), { timeout: 2000 });
    else window.setTimeout(() => void load(), 500);
  };
  ctx.events.once('game:ready', idle);
  ctx.events.once('game:start', () => void load());
  await P7.step();
  return {
    get current() {
      return current;
    },
    load,
  };
}
