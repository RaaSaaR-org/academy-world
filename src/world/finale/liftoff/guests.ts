import type { RobotId, RobotModel, ZoneContext } from '@/core/zones';
import { passSnapshot } from '@/core/quest/values';
import { AREA_MANIFESTS } from '@/core/zones/ZoneManager';
import { DEG, polar } from '../../layout';
import { AUSGUCK } from '../tuning';

/**
 * Earned robots ride along on the Ausguck ring (plan §1.5, §4.15 console row, D36, §4.3 „Lift-off“): the
 * Unitree R1, G1 and H1-2 once their Traumhangar steps are stamped, the H2 once the Meisterprüfung is
 * passed, and the trained Open Duck Mini once 02 C is stamped. The real models from the WP0 library
 * through ctx.robots (never a look-alike), at LOD 'auto' (LOD1 from a few metres), loaded when the
 * lift-off is armed and you reach the Ausguck, so they are in before the spin-up (a guest that is not
 * ready by then just stays home). Cosmetic: they never gate anything.
 */
export interface Guests {
  /** load and place the earned guests (idempotent; resolves when the loads settle) */
  prepare(): Promise<number>;
  readonly count: number;
  /** shown only up on the Ausguck (the deck views keep their draw budget) */
  setVisible(on: boolean): void;
}

/** which guest comes for which stamp (station ids from the manifests) */
const LADDER: { id: RobotId; area: string; station: string | null }[] = [
  { id: 'unitree-r1', area: 'traumhangar', station: 'erster-schritt' },
  { id: 'unitree-g1', area: 'traumhangar', station: 'voraustraeumen' },
  { id: 'unitree-h1-2', area: 'traumhangar', station: 'traumdaten' },
  { id: 'open-duck-mini-v2', area: 'regelgarten', station: 'lauf-ente' },
];

export function buildGuests(ctx: ZoneContext): Guests {
  const placed = new Map<RobotId, RobotModel>();
  let pending: Promise<number> | null = null;
  let visible = true;

  const earned = (): RobotId[] => {
    const view = passSnapshot(ctx, { scope: 'all', manifests: [...AREA_MANIFESTS.values()] });
    const has = (area: string, station: string): boolean => view.stamps.some((s) => s.zone === area && s.station === station && s.earned);
    const out = LADDER.filter((g) => g.station && AREA_MANIFESTS.get(g.area)?.stations.some((s) => s.id === g.station) && has(g.area, g.station)).map((g) => g.id);
    if (ctx.quest.snapshot().mastery.h2Earned) out.splice(Math.min(3, out.length), 0, 'unitree-h2');
    return out;
  };

  return {
    get count() {
      return placed.size;
    },
    setVisible(on) {
      if (on === visible) return;
      visible = on;
      for (const m of placed.values()) m.object.visible = on;
    },
    prepare() {
      const want = earned().filter((id) => !placed.has(id));
      if (!want.length) return Promise.resolve(placed.size);
      pending ??= Promise.all(
        want.map(async (id) => {
          try {
            const m = await ctx.robots.load(id, { lod: 'auto', priority: 'now' });
            const i = placed.size;
            const b = AUSGUCK.guests.bearings[i % AUSGUCK.guests.bearings.length];
            const [x, , z] = polar(b, AUSGUCK.guests.r);
            m.object.position.set(x, AUSGUCK.exit[1], z);
            // facing outward, toward the view (the model's front is +z)
            m.object.rotation.y = Math.PI - b * DEG;
            m.object.name = `liftoff:guest:${id}`;
            m.object.visible = visible;
            ctx.root.add(m.object);
            placed.set(id, m);
          } catch {
            /* a guest that does not load stays home (cosmetic) */
          }
        }),
      )
        .then(() => placed.size)
        .finally(() => (pending = null));
      return pending;
    },
  };
}
