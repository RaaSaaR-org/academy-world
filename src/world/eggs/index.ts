/**
 * WP15 — the island's own eggs at runtime (built by the life chunk; their SecretDefs are eager, defs.ts):
 * 13 Winke-Arm (bridge head), 3 Robota (the night-shift locker), 14 Fotopunkt (the Ausguck), 15 Werkbank
 * der Offenen (the Danke door), 1 Die nächste Zahl (the Allee console). Egg 5 lives with the rovers
 * (landscape/rovers.ts); eggs 10 and 11 are found in WP5's duck station, 12 in WP10's hangar and 24 on
 * WP9's farm (each calls ctx.game.secrets.find with the id of defs.ts).
 */
import type * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import type { GroundHandle } from '../ground';
import type { Director } from '../life/director';
import type { LifeSounds } from '../life/sound';
import { buildWinke } from './winke';
import { buildFotopunkt } from './fotopunkt';
import { buildDankeDoor, buildLocker, buildNaechsteZahl } from './props';
import { EGGS } from './defs';

export function buildEggs(ctx: ZoneContext, h: { director: Director; paint: THREE.Material; ground: GroundHandle; sounds: LifeSounds }): { stats(): Record<string, unknown> } {
  const winke = buildWinke(ctx, h);
  const locker = buildLocker(ctx, h);
  const foto = buildFotopunkt(ctx, h);
  buildDankeDoor(ctx, h);
  const zahl = buildNaechsteZahl(ctx, h);
  // tools: every egg's own trigger (playtest --secrets all uses secrets.find; these press the real thing)
  ctx.debug.register('eggs-state', () => ({ found: ctx.game.secrets.found(), total: ctx.game.secrets.total() }));
  return {
    stats: () => ({
      found: EGGS.filter((e) => ctx.game.secrets.has(e.id)).map((e) => e.id),
      total: EGGS.length,
      winke: winke.stats(),
      locker: locker.found(),
      foto: foto.stats(),
      zahl: zahl.stats(),
    }),
  };
}
