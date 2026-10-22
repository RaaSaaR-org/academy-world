/**
 * WP1 — the quest spine's derivations (plan §3.1, §3.3, D23), pure: everything the snapshot says is
 * computed from the stamps, the challenge stars, the manifests, the mode and the few stored facts
 * (`p7.quest`, §3.5) that no event can recompute. QuestSpine feeds it from Progress; the tools run it
 * in Node (tools/quest-derive.mjs). No zone code is needed: it works before any area has loaded.
 */
import type { Mode } from '../types';
import type { AreaManifest, CoreId, RotorId, SystemId } from '../zones/manifest';
import { masteryStatus } from './mastery';
import { systemDefs } from './systems';
import type { BeatId, CoreStatus, CrewReason, FlightState, FlightStateName, QuestEvent, QuestSnapshot, ReadyState, SystemDef, SystemState } from './types';

/** The stored part of the spine: zoneData.world['p7.quest'] (plan §3.5; written through ctx.quest only). */
export interface QuestStore {
  flight: FlightState;
  start: { glideSeen: boolean; probestart: boolean };
  /** beats already played (markBeat) */
  seenBeats: BeatId[];
  /** the Bodencrew entries the game stored ('route' is derived, never stored) */
  groundCrew: { id: RotorId | CoreId; reason: 'asset' | 'timing' }[];
  mastery: { h2Unveiled: boolean };
}

export const QUEST_KEY = 'p7.quest';

export function emptyQuestStore(): QuestStore {
  return {
    flight: { state: 'ground', firstFlightAt: null, liftoffSeen: false },
    start: { glideSeen: false, probestart: false },
    seenBeats: [],
    groundCrew: [],
    mastery: { h2Unveiled: false },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const CREW_IDS = new Set<string>(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'AKKU', 'NAV']);

/** A stored p7.quest value (or anything) → a valid QuestStore; unknown or malformed parts fall back to the defaults. */
export function readQuestStore(raw: unknown): QuestStore {
  const s = emptyQuestStore();
  if (!isObj(raw)) return s;
  const f = raw.flight;
  if (isObj(f)) {
    s.flight = {
      state: f.state === 'airborne' ? 'airborne' : 'ground',
      firstFlightAt: typeof f.firstFlightAt === 'number' && Number.isFinite(f.firstFlightAt) ? f.firstFlightAt : null,
      liftoffSeen: f.liftoffSeen === true,
    };
  }
  if (isObj(raw.start)) s.start = { glideSeen: raw.start.glideSeen === true, probestart: raw.start.probestart === true };
  if (Array.isArray(raw.seenBeats)) s.seenBeats = [...new Set(raw.seenBeats.filter((b): b is BeatId => typeof b === 'string'))];
  if (Array.isArray(raw.groundCrew))
    for (const c of raw.groundCrew)
      if (isObj(c) && typeof c.id === 'string' && CREW_IDS.has(c.id) && (c.reason === 'asset' || c.reason === 'timing') && !s.groundCrew.some((x) => x.id === c.id))
        s.groundCrew.push({ id: c.id as RotorId | CoreId, reason: c.reason });
  if (isObj(raw.mastery)) s.mastery = { h2Unveiled: raw.mastery.h2Unveiled === true };
  return s;
}

/** What the derivation reads. */
export interface DeriveInput {
  manifests: readonly AreaManifest[];
  /** the system table (default: systemDefs(manifests)) */
  defs?: readonly SystemDef[];
  /** a stamp record ('<area>.<station>') or null; a skipped stamp is not earned */
  stamp(key: string): { skipped?: boolean } | null;
  /** best stars of a challenge ('<area>.<station>', 'world.f1') */
  stars(key: string): number;
  mode: Mode;
  store: QuestStore;
  /** the rc4 finale state (zoneData.world.finale) */
  finale: { visited?: boolean; f3?: unknown } | null;
  /** ?flight= for this session (never stored) */
  flightOverride?: FlightStateName | null;
  /** ?liftoff=1: every lift-off condition met (never stored) */
  liftoff?: boolean;
  /** the rc4 island flag 'ascentSeen' (a complete ascent counts as the glide seen until WP12 retires it) */
  ascentSeen?: boolean;
  /** §5.8 the Entscheider timing fallback (tuning.ts): rotors the Bodencrew starts in Entscheider mode after the Probestart */
  timingCrew?: readonly RotorId[];
}

const RANK: Record<ReadyState, number> = { kalt: 0, arbeit: 1, bereit: 2, geprueft: 3 };
export const isReady = (s: SystemState | undefined): boolean => s === 'bereit' || s === 'geprueft';

/**
 * The Bodencrew reason for a system that is not earned: a stored asset/timing entry, else the
 * Entscheider route supply after the Probestart (AKKU, NAV), else the Entscheider timing fallback of
 * tuning.ts (rotors). Both Entscheider supplies follow the current mode and are never stored.
 */
export function crewReason(d: SystemDef, store: QuestStore, mode: Mode, timingCrew: readonly RotorId[] = []): CrewReason | null {
  const stored = store.groundCrew.find((c) => c.id === d.id);
  if (stored) return stored.reason;
  if (!store.start.probestart) return null;
  if (d.crewIn?.includes(mode)) return 'route';
  return mode === 'entscheider' && timingCrew.includes(d.id as RotorId) ? 'timing' : null;
}

/** Everything §3.1 derives, as one snapshot. */
export function deriveQuest(i: DeriveInput): QuestSnapshot {
  const defs = i.defs ?? systemDefs(i.manifests);
  const byId = new Map(i.manifests.map((m) => [m.id, m]));
  const earned = (key: string): boolean => {
    const r = i.stamp(key);
    return !!r && !r.skipped;
  };
  const systems = {} as Record<SystemId, SystemState>;
  const status = new Map<SystemId, CoreStatus & { n: number; of: number }>();
  const groundCrew: QuestSnapshot['groundCrew'] = [];
  for (const d of defs) {
    const m = byId.get(d.areaId);
    if (!m) continue;
    // the stations that count: the Traumhangar's Generalprobe (mastery: false) never does
    const counted = m.stations.filter((s) => s.mastery !== false);
    const n = counted.filter((s) => earned(`${d.areaId}.${s.id}`)).length;
    const star = earned(`${d.areaId}.${d.station}`);
    if (d.group === 'trim') {
      systems[d.id] = star ? 'an' : 'aus';
      continue;
    }
    const crew = star ? null : crewReason(d, i.store, i.mode, i.timingCrew);
    if (crew) groundCrew.push({ id: d.id as RotorId | CoreId, reason: crew });
    // geprüft only with every counted stamp (so only by the player: a crew-supplied system never gets the halo)
    const state: ReadyState = n === counted.length && n > 0 ? 'geprueft' : star || crew ? 'bereit' : n > 0 ? 'arbeit' : 'kalt';
    systems[d.id] = state;
    status.set(d.id, { state, by: RANK[state] >= RANK.bereit ? (star ? 'player' : 'crew') : null, n, of: counted.length });
  }
  // ?liftoff=1: every gating system at least bereit (the Bodencrew fills the gaps), F3 signed
  if (i.liftoff)
    for (const d of defs) {
      if (d.group === 'trim' || isReady(systems[d.id])) continue;
      systems[d.id] = 'bereit';
      const st = status.get(d.id);
      if (st) status.set(d.id, { ...st, state: 'bereit', by: 'crew' });
    }
  const core = (id: CoreId): CoreStatus & { n: number; of: number } => status.get(id) ?? { state: 'kalt', by: null, n: 0, of: 0 };
  const akku = core('AKKU');
  const nav = core('NAV');
  const lift = defs.filter((d) => d.group === 'lift' && isReady(systems[d.id])).length;
  // the Startakku bar: ⅓ per earned Sonnenacker stamp, 1 once AKKU is bereit (the ◆, or the Bodencrew)
  const charge = RANK[akku.state] >= RANK.bereit ? 1 : akku.of ? akku.n / akku.of : 0;
  const lifts = defs.filter((d) => d.group === 'lift').length;
  const startklar = lifts > 0 && lift === lifts && isReady(akku.state) && isReady(nav.state);
  const f3Signed = !!i.finale?.f3 || !!i.liftoff;
  const flight: FlightState = { ...i.store.flight, ...(i.flightOverride ? { state: i.flightOverride } : {}) };
  return {
    systems,
    start: { lift, energy: { state: akku.state, by: akku.by, charge }, nav: { state: nav.state, by: nav.by }, startklar },
    groundCrew,
    kielOpen: lift >= 4 || !!i.finale?.visited || !!i.liftoff,
    regionOpen: lift >= 1 && flight.state === 'ground',
    f3Signed,
    armed: startklar && f3Signed,
    probestart: i.store.start.probestart,
    glideSeen: i.store.start.glideSeen || !!i.ascentSeen,
    flight,
    mastery: masteryStatus({ manifests: i.manifests, stars: i.stars, earned, h2Unveiled: i.store.mastery.h2Unveiled }),
  };
}

/** What changed between two snapshots, in the order the beats want them (systems first, then the gates). */
export function diffQuest(prev: QuestSnapshot, next: QuestSnapshot, defs: readonly SystemDef[]): QuestEvent[] {
  const out: QuestEvent[] = [];
  for (const d of defs) if (prev.systems[d.id] !== next.systems[d.id]) out.push({ kind: 'system', id: d.id, from: prev.systems[d.id], to: next.systems[d.id] });
  if (prev.start.energy.charge !== next.start.energy.charge) out.push({ kind: 'charge', charge: next.start.energy.charge });
  if (!prev.regionOpen && next.regionOpen) out.push({ kind: 'region-open' });
  if (!prev.kielOpen && next.kielOpen) out.push({ kind: 'kiel-open' });
  if (!prev.start.startklar && next.start.startklar) out.push({ kind: 'startklar' });
  if (!prev.armed && next.armed) out.push({ kind: 'armed' });
  if (prev.flight.state !== next.flight.state) out.push({ kind: 'flight', state: next.flight.state });
  if (!prev.mastery.open && next.mastery.open) out.push({ kind: 'mastery-open' });
  if (!prev.mastery.h2Earned && next.mastery.h2Earned) out.push({ kind: 'h2-earned' });
  return out;
}

/** The lift systems that are not bereit yet, in rotor order (the Probestart's „Auftrieb fehlt noch: …“). */
export function missingRotors(s: QuestSnapshot, defs: readonly SystemDef[]): RotorId[] {
  return defs.filter((d) => d.group === 'lift' && !isReady(s.systems[d.id])).map((d) => d.id as RotorId);
}
