/**
 * WP12 (rotors and start flow, the island owner) — the APIs other packages use (Phase 7 plan §5.2,
 * §6.2, §3.3), committed by WPS in wave 0: the per-rotor rate and air API (WP13's lift-off), the radio
 * (zones and the finale), the 'objective:changed' payload, and the Libelle panel states (WP13's
 * console mirrors them). WP12 owns src/world/start/** from wave 1.
 */
import type { Text } from '@/core/zones';
import type { CoreStatus, QuestSnapshot, ReadyState, StartSystems, SystemId, SystemState } from '@/core/quest/types';
import type { Vec3Tuple } from '../layout';

/** M1–M6 in the order of ZONE_PLOTS and underside.ts */
export type RotorIndex = 0 | 1 | 2 | 3 | 4 | 5;

/** island.rotors (WP12) — driven by WP13 during the lift-off. */
export interface RotorRates {
  /** spin rate 0 (still) … 1 (take-off); drives the blur, the drone pitch and the duct glow */
  setRate(i: RotorIndex, r: number): void;
  /** downwash strength 0…1 under that rotor (spray, dust, the dock's wind) */
  setAir(i: RotorIndex, s: number): void;
  readonly rates: readonly number[];
  /** WP12 addition: hand every rotor back to its state-driven rate and air (cold still, bereit idle, airborne hover) */
  reset(): void;
}

/**
 * 'island:ignition' (WP12 addition, plan §3.3): the island side of a system's beat. `phase: 'start'`
 * when the beat begins (lamps, spray, sound), `'line'` after its radio line has played: a zone whose
 * ◆ is station B points back in then („Jetzt die Ente …“) if it still has an open station.
 */
export interface IgnitionEvent {
  id: SystemId;
  areaId: string;
  phase: 'start' | 'line';
}

/** 'island:beat' (WP12 addition): a beat of the three systems played (6/6, Startklar, Revier, KIEL). */
export interface StartBeatEvent {
  id: '6of6' | 'startklar' | 'revier' | 'kiel' | 'probestart' | 'crew';
}

/** radio.say (WP12's radio): EMI-01 on the radio, queued, never interrupting a zone EMI. */
export interface RadioApi {
  say(owner: string, line: Text, o?: { delay?: number }): void;
}

/** Zone code reaches the island's radio by this event (zones never import src/world). */
export interface RadioSayEvent {
  owner: string;
  line: Text;
  /** seconds before it may play (default 1.2) */
  delay?: number;
}

/** 'objective:changed' (WP12): rc4's fields plus `areaId` (= zone). */
export interface ObjectiveChangedEvent {
  areaId: string | null;
  zone: string | null;
  manual: boolean;
  target: Vec3Tuple | null;
  lift: Vec3Tuple | null;
}

/** One lamp of the Libelle panel, the crown or the needle light (§3.3 states; colours of §4 conventions). */
export type SystemLamp = 'dark' | 'red' | 'amber' | 'teal' | 'teal-halo' | 'crew';

/** The Libelle panel: six rotor lamps, the 10-segment Startakku bar, the nav lamp (17 instances, one draw). */
export interface LibellePanelState {
  lamps: [SystemLamp, SystemLamp, SystemLamp, SystemLamp, SystemLamp, SystemLamp];
  bar: { lamp: SystemLamp; segments: number };
  nav: SystemLamp;
}

/**
 * §3.3: dark → red after the Probestart (the empty bar: a red outline) → amber (in Arbeit) → teal
 * (bereit) → teal with a steady halo (geprüft). A system the Bodencrew supplies is 'crew' (teal with the
 * BODENCREW plate, never a halo).
 */
export function lampOf(state: ReadyState | SystemState, probestart: boolean, crew = false): SystemLamp {
  if (crew && (state === 'bereit' || state === 'geprueft')) return 'crew';
  if (state === 'geprueft') return 'teal-halo';
  if (state === 'bereit' || state === 'an') return 'teal';
  if (state === 'arbeit') return 'amber';
  return probestart ? 'red' : 'dark';
}

/** The panel from a quest snapshot (pure; WP12 draws it, WP13's launch console repeats it). */
export function libellePanel(s: Pick<QuestSnapshot, 'systems' | 'probestart' | 'groundCrew'> & { start: StartSystems }): LibellePanelState {
  const crewOf = (id: string): boolean => s.groundCrew.some((c) => c.id === id);
  const rotor = (k: number): SystemLamp => lampOf(s.systems[`M${k + 1}` as 'M1'], s.probestart, crewOf(`M${k + 1}`));
  const core = (c: CoreStatus): SystemLamp => lampOf(c.state, s.probestart, c.by === 'crew');
  return {
    lamps: [rotor(0), rotor(1), rotor(2), rotor(3), rotor(4), rotor(5)],
    bar: { lamp: core(s.start.energy), segments: Math.round(s.start.energy.charge * 10) },
    nav: core(s.start.nav),
  };
}

/** A stub of island.rotors: it only remembers the rates (WP12 drives the visuals and the sound). */
export function createRotorRates(): RotorRates {
  const rates = [0, 0, 0, 0, 0, 0];
  const air = [0, 0, 0, 0, 0, 0];
  return {
    setRate: (i, r) => void (rates[i] = Math.max(0, Math.min(1, r))),
    setAir: (i, s) => void (air[i] = Math.max(0, Math.min(1, s))),
    rates,
    reset: () => {
      rates.fill(0);
      air.fill(0);
    },
  };
}

/**
 * WP12 addition: the island module's live handles for the other island packages (WP13's lift-off,
 * WP14, WP15): `island.rotors.setRate(i, r)` / `setAir(i, s)` / `reset()`, `island.radio.say(owner, line)`.
 * Until the island's init has run they are the stubs (rates remembered, lines dropped); zones never
 * import src/world and use the 'radio:say' event instead.
 */
export const island: { rotors: RotorRates; radio: RadioApi } = {
  rotors: createRotorRates(),
  radio: { say() {} },
};
