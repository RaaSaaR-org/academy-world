/**
 * WP15 — the gather and the lift-off reactions (plan §4.12 apron crowd [C2 M2, m11], §4.15 22–42 s).
 *  - Gather: when the lift-off is armed (quest armed: Startklar + F3 signed) and you are on the Ausguck,
 *    or when WP13 says so ('life:react' { kind: 'gather' }), the Werft mechanic, the two visitors and the
 *    people of a stamped Sonnenacker walk to the apron edge in the foreground of the outside shot C1,
 *    and the dock crew member rides up to the Ausguck rail (people.ts). Docked again after a flight
 *    („Zurück ins Dock“, „Start wiederholen“ ends), or no longer armed while grounded: everyone goes home.
 *  - The lift-off: WP13 sends 'life:react' { kind: 'liftoff' } at the region beat; if only its
 *    'flight:phase' arrives, life reacts on its own a moment later (so every SO-101 of life waves 2 s,
 *    people wave, the flocks flush). The farm's own arms wave on WP9's side of the same event.
 */
import type { ZoneContext } from '@/core/zones';
import type { Director } from './director';
import type { People } from './people';
import { TOWER } from '../layout';

export function buildGather(ctx: ZoneContext, h: { director: Director; people: People }): { state(): Record<string, unknown> } {
  const D = h.director;
  let byEvent = false;
  let wasAirborne = ctx.flight.state === 'airborne';
  let lastLiftoffReact = -1e9;
  const siteStamped = (): boolean => ctx.zones.stamps('sonnenacker') > 0 || (ctx.quest.snapshot().start.energy.by === 'player');
  const onAusguck = (): boolean => {
    const p = ctx.player.position;
    return p.y > TOWER.ausguck.y - 2.5 && p.y < TOWER.ausguck.y + 6 && Math.hypot(p.x, p.z) < TOWER.ausguck.outer + 0.5;
  };
  const want = (): boolean => {
    if (byEvent) return true;
    const s = ctx.quest.snapshot();
    return s.armed && s.flight.state === 'ground' && onAusguck();
  };
  const sync = (): void => {
    const w = want();
    if (w && !h.people.gathered) h.people.gather(true, { siteStamped: siteStamped() });
  };
  // checked a few times a second (game time: not while paused)
  ctx.every(0.4, sync);
  ctx.events.on('life:react', (p?: { kind?: string }) => {
    if (p?.kind === 'gather') {
      byEvent = true;
      sync();
    } else if (p?.kind === 'liftoff') lastLiftoffReact = ctx.time.elapsed;
  });
  // WP13's phases: the region beat at the lift-off (fallback when no 'life:react' liftoff comes with it)
  ctx.events.on('flight:phase', (p?: { name?: string }) => {
    if (p?.name !== 'liftoff' && p?.name !== 'downwash') return;
    ctx.after(0.6, () => {
      if (ctx.time.elapsed - lastLiftoffReact > 4) {
        lastLiftoffReact = ctx.time.elapsed;
        D.react('liftoff');
      }
    });
  });
  // home again: docked after a flight, or the gather's reason is gone while grounded
  ctx.events.on('flight:state', (p?: { state?: string }) => {
    if (p?.state === 'airborne') wasAirborne = true;
    else if (p?.state === 'ground' && wasAirborne) {
      wasAirborne = false;
      byEvent = false;
      h.people.gather(false, { siteStamped: false });
    }
  });
  ctx.every(2, () => {
    if (!h.people.gathered || byEvent) return;
    const s = ctx.quest.snapshot();
    if (s.flight.state === 'ground' && !s.armed) h.people.gather(false, { siteStamped: false });
  });
  // tools: put the crowd on the apron now (life-check), and home again
  ctx.debug.register('life-gather', () => {
    byEvent = true;
    h.people.gather(true, { siteStamped: siteStamped() });
    return h.people.crowdState();
  });
  ctx.debug.register('life-ungather', () => {
    byEvent = false;
    h.people.gather(false, { siteStamped: false });
    return h.people.crowdState();
  });
  return {
    state: () => ({ gathered: h.people.gathered, byEvent, armed: ctx.quest.snapshot().armed, onAusguck: onAusguck() }),
  };
}
