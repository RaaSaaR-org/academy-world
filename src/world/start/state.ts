/**
 * WP12: the island's view of the three systems (plan §3.1, §3.3, D23). The quest spine (ctx.quest,
 * WP1) derives the states; this display decides what the island SHOWS, because a beat changes the
 * look later than the stamp changes the state:
 *  - a system whose beat is pending keeps its old look until the beat plays (`hold`),
 *  - the Entscheider supply of AKKU and NAV appears during EMI-01's second Probestart line (`hideCrew`),
 *  - the first Probestart turns the three groups red one after the other (`reveal`),
 *  - the 6/6 and Startklar beats pulse the lamps (`pulse`, steady sine ramps, flash-safe).
 * Every lamp of the island (Libelle panel, crown beacons, needle light, duct rings, foyer board,
 * bridge sign) reads `panel()` / `shown()` and repaints on `onChange`.
 */
import type { ZoneContext } from '@/core/zones';
import type { CoreStatus, QuestSnapshot, ReadyState, SystemState } from '@/core/quest/types';
import { ROTOR_IDS, type RotorId, type SystemId, type TrimId } from '@/core/zones/manifest';
import { lampOf, type LibellePanelState, type SystemLamp } from './contract';
import { BEATS } from './tuning';

/** what a pulse lights: the Libelle panel's rotor lamps, its bar, its nav lamp, the crown, the needle light */
export type PulseTarget = 'lamps' | 'bar' | 'nav' | 'crown' | 'needle';

export const ROTORS: readonly RotorId[] = ROTOR_IDS;
export const TRIMS: readonly TrimId[] = ['T1', 'T2', 'T3', 'T4'];

const RANK: Record<string, number> = { kalt: 0, aus: 0, arbeit: 1, bereit: 2, an: 2, geprueft: 3 };
/** bereit or better (trims: an) */
export const isReady = (s: SystemState | undefined): boolean => !!s && RANK[s] >= 2;

export interface StartDisplay {
  /** the quest's latest snapshot */
  readonly snap: QuestSnapshot;
  /** the state the island shows for a system (a held system keeps its old one) */
  shown(id: SystemId): SystemState;
  /** rotors shown bereit (bridge sign, board) */
  liftShown(): number;
  /** the Startakku charge shown (0…1) */
  chargeShown(): number;
  /** the Libelle panel (and through it the crown and the needle light) as shown */
  panel(): LibellePanelState;
  /** is this core system (AKKU/NAV) shown as supplied by the Bodencrew? */
  crewShown(id: 'AKKU' | 'NAV'): boolean;
  /** keep `id` at its current look until release (a beat is pending) */
  hold(id: SystemId, look?: SystemState): void;
  release(id: SystemId): void;
  /** the shown charge while the charge beat is pending (null: follow the quest) */
  holdCharge(c: number | null): void;
  /** hide the Entscheider route supply of these core systems (until the Probestart's second line shows it) */
  hideCrew(ids: readonly ('AKKU' | 'NAV')[]): void;
  /**
   * How far the first Probestart has turned the panel red ('all' outside that sequence): the six rotor
   * lamps are items 1–6, the Startakku bar 7, the nav lamp 8.
   */
  reveal(level: number | 'all'): void;
  /** pulse `targets` three times (6/6, Startklar); resolves when done */
  pulse(targets: readonly PulseTarget[]): Promise<void>;
  /** brightness factor of a pulse target now (1 = none) */
  pulseK(t: PulseTarget): number;
  /** tools only (flash-check): show this panel instead of the quest's (null: back to the quest) */
  override(p: LibellePanelState | null): void;
  /** the look changed (also every frame of a pulse) */
  onChange(fn: () => void): () => void;
  /** the quest moved: previous and next snapshot (coalesced per refresh) */
  onQuest(fn: (prev: QuestSnapshot, next: QuestSnapshot) => void): () => void;
  /** recompute now (a mode switch, a debug seed) */
  refresh(): void;
}

export function buildStartDisplay(ctx: ZoneContext): StartDisplay {
  const quest = ctx.quest;
  let snap = quest.snapshot();
  let prev = snap;
  const held = new Map<SystemId, SystemState>();
  let heldCharge: number | null = null;
  let crewHidden = new Set<'AKKU' | 'NAV'>();
  let forced: LibellePanelState | null = null;
  let revealed: number | 'all' = 'all';
  const looks = new Set<() => void>();
  const quests = new Set<(p: QuestSnapshot, n: QuestSnapshot) => void>();
  const changed = (): void => {
    for (const fn of looks) {
      try {
        fn();
      } catch (err) {
        console.error('[start] display listener threw', err);
      }
    }
  };

  // the spine reports once per QuestEvent with the same next snapshot: coalesce to one diff
  let pending = false;
  const flush = (): void => {
    pending = false;
    const p = prev;
    prev = snap;
    for (const fn of quests) {
      try {
        fn(p, snap);
      } catch (err) {
        console.error('[start] quest listener threw', err);
      }
    }
    changed();
  };
  const off = quest.onChange((s) => {
    snap = s;
    if (!pending) {
      pending = true;
      queueMicrotask(flush);
    }
  });
  ctx.onDispose(off);
  // a mode switch changes the Bodencrew supply at once (§3.1); the spine re-derives on 'mode:changed'
  // but only reports changed systems, so re-read for the `by` fields too
  const reread = (): void => {
    snap = quest.snapshot();
    if (!pending) {
      pending = true;
      queueMicrotask(flush);
    }
  };
  for (const ev of ['mode:changed', 'progress:reset']) ctx.events.on(ev, reread);

  /** the reveal item of a system (rotor lamps 1–6, the bar 7, the nav lamp 8), 0 for the trims */
  const itemOf = (id: SystemId): number => (id === 'AKKU' ? 7 : id === 'NAV' ? 8 : id.startsWith('M') ? Number(id.slice(1)) : 0);
  const probestartFor = (id: SystemId): boolean => snap.probestart && (revealed === 'all' || itemOf(id) <= revealed);
  const crewOf = (id: SystemId): boolean => snap.groundCrew.some((c) => c.id === id);
  const coreStatus = (id: 'AKKU' | 'NAV'): CoreStatus => (id === 'AKKU' ? snap.start.energy : snap.start.nav);
  /** the crew supply is hidden: a crewed core system looks as it would without the crew */
  const crewMasked = (id: 'AKKU' | 'NAV'): boolean => {
    if (!crewHidden.has(id)) return false;
    const c = coreStatus(id);
    return c.by === 'crew' && snap.groundCrew.some((g) => g.id === id && g.reason === 'route');
  };

  const shown = (id: SystemId): SystemState => {
    const h = held.get(id);
    if (h) return h;
    if ((id === 'AKKU' || id === 'NAV') && crewMasked(id)) return 'kalt';
    return snap.systems[id] ?? 'kalt';
  };
  const crewShown = (id: 'AKKU' | 'NAV'): boolean => !held.has(id) && !crewMasked(id) && coreStatus(id).by === 'crew' && isReady(shown(id));
  const lamp = (id: SystemId, crew: boolean): SystemLamp => lampOf(shown(id) as ReadyState, probestartFor(id), crew);
  const chargeShown = (): number => {
    if (heldCharge != null) return heldCharge;
    if (crewMasked('AKKU') || held.has('AKKU')) return 0;
    return snap.start.energy.charge;
  };

  // ── pulses ─────────────────────────────────────────────────────────────────
  let pulseT0 = -1;
  let pulseTargets = new Set<PulseTarget>();
  let pulseDone: (() => void) | null = null;
  let stopTick: (() => void) | null = null;
  const pulseLen = BEATS.pulses * BEATS.pulseS;
  const pulseK = (t: PulseTarget): number => {
    if (pulseT0 < 0 || !pulseTargets.has(t)) return 1;
    const u = ctx.time.elapsed - pulseT0;
    if (u < 0 || u > pulseLen) return 1;
    // three steady ramps: sin² per pulse (no step anywhere, ≤ 1 rise and 1 fall per pulseS)
    const s = Math.sin((Math.PI * u) / BEATS.pulseS);
    return 1 + BEATS.pulseGain * s * s;
  };

  return {
    get snap() {
      return snap;
    },
    shown,
    liftShown: () => ROTORS.filter((r) => isReady(shown(r))).length,
    chargeShown,
    crewShown,
    panel() {
      if (forced) return forced;
      const rot = (k: number): SystemLamp => lamp(ROTORS[k], crewOf(ROTORS[k]) && !held.has(ROTORS[k]));
      const akku = lamp('AKKU', crewShown('AKKU'));
      const nav = lamp('NAV', crewShown('NAV'));
      return {
        lamps: [rot(0), rot(1), rot(2), rot(3), rot(4), rot(5)],
        bar: { lamp: akku, segments: Math.round(chargeShown() * 10) },
        nav,
      };
    },
    hold(id, look) {
      held.set(id, look ?? shown(id));
      changed();
    },
    release(id) {
      if (held.delete(id)) changed();
    },
    holdCharge(c) {
      heldCharge = c;
      changed();
    },
    hideCrew(ids) {
      crewHidden = new Set(ids);
      changed();
    },
    reveal(level) {
      revealed = level;
      changed();
    },
    pulse(targets) {
      pulseDone?.();
      pulseTargets = new Set(targets);
      pulseT0 = ctx.time.elapsed;
      stopTick?.();
      return new Promise<void>((resolve) => {
        pulseDone = resolve;
        stopTick = ctx.every(1 / 30, () => {
          changed();
          if (ctx.time.elapsed - pulseT0 > pulseLen) {
            stopTick?.();
            stopTick = null;
            pulseT0 = -1;
            changed();
            const d = pulseDone;
            pulseDone = null;
            d?.();
          }
        });
      });
    },
    pulseK,
    override(p) {
      forced = p;
      changed();
    },
    onChange(fn) {
      looks.add(fn);
      return () => void looks.delete(fn);
    },
    onQuest(fn) {
      quests.add(fn);
      return () => void quests.delete(fn);
    },
    refresh: reread,
  };
}
