/**
 * WP1 — the player's own values for the checklist, the certificate and the lift-off (plan §5.2 [C1 M11]):
 * passSnapshot() and zoneValue(), moved out of the lazy finale chunk (src/world/finale/pass.ts keeps its
 * rc4 copy until WP13 switches to this one), with the stamp scopes of §3.4 and the takeaways of §2.8.
 */
import type { ZoneContext } from '../zones/types';
import type { AreaManifest } from '../zones/manifest';
import type { Text } from '../types';
import type { StampScope } from './types';

export interface StampView {
  /** full id '<area>.<station>' */
  id: string;
  zone: string;
  station: string;
  star: boolean;
  title: string;
  earned: boolean;
  skipped: boolean;
  value: string | null;
  curve: number[] | null;
  /** best stars of the station's challenge (0–3) */
  stars: number;
}

export interface PassView {
  stamps: StampView[];
  questions: number[];
  prognoseGuete: number | null;
  /** best values whose key names trials (gripTrials, trialsMeasured, …), summed: „Versuche gemessen“ */
  trialsBest: number;
  starsTotal: number;
  starsMax: number;
  capsules: number;
  capsulesTotal: number;
}

/** The island zones in their GDD §4.3 order (the 18 stamps of the tower). */
export const ISLAND_ORDER = ['sensordom', 'regelgarten', 'greifwerkstatt', 'lern-dojo', 'dunkelfabrik', 'prueffeld'] as const;

/**
 * A read-only view of the Pass from ctx.pass.snapshot(). Scope 'island' (default): the six island zones
 * in rc4 order, three stations each; 'all' adds every other area with registered stamps, in the order of
 * `manifests` when given (else by id).
 */
export function passSnapshot(ctx: Pick<ZoneContext, 'pass' | 'i18n'>, o: { scope?: StampScope; manifests?: readonly AreaManifest[] } = {}): PassView {
  const snap = ctx.pass.snapshot();
  const scope = o.scope ?? 'island';
  const out: StampView[] = [];
  const order: string[] = [...ISLAND_ORDER];
  if (scope === 'all') {
    const others = o.manifests ? o.manifests.map((m) => m.id) : [...new Set(snap.stamps.map((s) => s.zoneId))].sort();
    for (const id of others) if (!order.includes(id) && !id.startsWith('_')) order.push(id);
  }
  for (const zone of order) {
    const list = snap.stamps.filter((st) => st.zoneId === zone && !st.extra);
    for (const st of ISLAND_ORDER.includes(zone as (typeof ISLAND_ORDER)[number]) ? list.slice(0, 3) : list) {
      const rec = st.record;
      out.push({
        id: st.id,
        zone,
        station: st.stationId,
        star: st.star,
        title: safeResolve(ctx, st.title) || prettify(st.stationId),
        earned: !!rec && !rec.skipped,
        skipped: !!rec?.skipped,
        value: rec?.value != null ? safeResolve(ctx, rec.value) : null,
        curve: Array.isArray(rec?.curve) && rec!.curve!.length > 1 ? rec!.curve!.filter((x) => Number.isFinite(x)) : null,
        stars: st.stars ?? 0,
      });
    }
  }
  let trialsBest = 0;
  for (const [k, v] of Object.entries(snap.best)) if (/trials/i.test(k) && Number.isFinite(v)) trialsBest += v;
  return {
    stamps: out,
    questions: snap.questions,
    prognoseGuete: snap.prognoseGuete,
    trialsBest,
    starsTotal: snap.starsTotal ?? 0,
    starsMax: snap.starsMax ?? 54,
    capsules: snap.capsules ?? 0,
    capsulesTotal: snap.capsulesTotal ?? 0,
  };
}

/** Best "own measurement" line of a zone: the ◆ station's value, else the latest earned value. */
export function zoneValue(view: PassView, zone: string): { title: string; value: string } | null {
  const list = view.stamps.filter((s) => s.zone === zone && s.earned);
  const pick = list.find((s) => s.star && s.value) ?? list.find((s) => s.value) ?? list[0];
  if (!pick) return null;
  return { title: pick.title, value: pick.value ?? '✓' };
}

/** §2.8 (D43): the certificate's back side „Was du unten gesehen hast“ — one takeaway per area with an earned stamp. */
export function takeaways(view: PassView, manifests: readonly AreaManifest[]): { area: string; title: Text; line: Text }[] {
  const stamped = new Set(view.stamps.filter((s) => s.earned).map((s) => s.zone));
  return manifests.filter((m) => m.takeaway && stamped.has(m.id)).map((m) => ({ area: m.id, title: m.title, line: m.takeaway! }));
}

function safeResolve(ctx: Pick<ZoneContext, 'i18n'>, t: Text): string {
  try {
    return ctx.i18n.resolve(t);
  } catch {
    return '';
  }
}

function prettify(id: string): string {
  return id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
