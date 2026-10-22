/**
 * WP1 (quest spine) — contract types of plan §5.2 and §3.1 (D23: the three systems LIFT, ENERGY,
 * NAVIGATION). Committed by WPS in wave 0 so the wave-1 packages build against them; WP1 owns the
 * file from wave 1. `ctx.quest` is a QuestApi (src/core/zones/types.quest.ts).
 */
import type { Mode } from '../types';
import type { CoreId, RotorId, SystemId } from '../zones/manifest';
import type { Stars } from '../zones/types';

// System ids live with the manifests, so the wave-0 stubs can name them (D23)
export type { RotorId, CoreId, TrimId, SystemId } from '../zones/manifest';

/** Which stamps an aggregate counts: 'island' = areas of kind 'lobe' (the default everywhere, the rc4 meaning); 'all' = every area. */
export type StampScope = 'island' | 'all';

/** The three systems of the Probestart and the lift-off gate. */
export type StartSystem = 'lift' | 'energy' | 'nav';
/** Rotors, AKKU and NAV: kalt → in Arbeit → bereit → geprüft (§3.1). */
export type ReadyState = 'kalt' | 'arbeit' | 'bereit' | 'geprueft';
/** name kept for the rotor consumers */
export type RotorState = ReadyState;
/** trims: aus | an */
export type SystemState = ReadyState | 'aus' | 'an';
/** 'route': the Entscheider supply of AKKU and NAV (derived, never stored) */
export type CrewReason = 'asset' | 'timing' | 'route';
/** markBeat ids (each beat plays once) */
export type BeatId = SystemId | '6of6' | 'startklar';
export type FlightStateName = 'ground' | 'airborne';

export interface FlightState {
  state: FlightStateName;
  firstFlightAt: number | null;
  liftoffSeen: boolean;
}

/** One row of the system table (src/core/quest/systems.ts, §3.1). */
export interface SystemDef {
  id: SystemId;
  areaId: string;
  /** the ◆ station that brings it to bereit (from the area's manifest) */
  station: string;
  /** lift: M1–M6 · energy: AKKU · nav: NAV · trim: T1–T4 (never gates) */
  group: StartSystem | 'trim';
  /** modes in which the Bodencrew supplies it after the Probestart (AKKU, NAV: ['entscheider']) */
  crewIn?: readonly Mode[];
}

/** by: who made it bereit (null below bereit) */
export interface CoreStatus {
  state: ReadyState;
  by: 'player' | 'crew' | null;
}

/** D23: what the Libelle panel, the console and the gate read. */
export interface StartSystems {
  /** rotors bereit 0…6, ground crew included (Revier at 1, KIEL at 4) */
  lift: number;
  /** the Startakku bar 0…1: ⅓ per earned Sonnenacker stamp, 1 at bereit */
  energy: CoreStatus & { charge: number };
  /** the nav lamp and the needle light */
  nav: CoreStatus;
  /** lift === 6 and energy and nav at least bereit */
  startklar: boolean;
}

export interface MasteryStatus {
  /** best stars of traumhangar A, B, C */
  ladder: { r1: Stars; g1: Stars; h12: Stars };
  stars: number;
  pool: number;
  /** Math.ceil(0.75 * pool); MUST build 84 → 63 */
  need: number;
  open: boolean;
  h2Earned: boolean;
  h2Unveiled: boolean;
}

export interface QuestSnapshot {
  systems: Record<SystemId, SystemState>;
  /** the three systems (D23); replaces the second pass's readyRequired */
  start: StartSystems;
  /** stored asset/timing entries + the derived 'route' entries */
  groundCrew: { id: RotorId | CoreId; reason: CrewReason }[];
  kielOpen: boolean;
  regionOpen: boolean;
  f3Signed: boolean;
  /** start.startklar && f3Signed */
  armed: boolean;
  probestart: boolean;
  glideSeen: boolean;
  flight: FlightState;
  mastery: MasteryStatus;
}

export type QuestEvent =
  | { kind: 'system'; id: SystemId; from: SystemState; to: SystemState }
  | { kind: 'charge'; charge: number }
  | { kind: 'kiel-open' }
  | { kind: 'region-open' }
  | { kind: 'startklar' }
  | { kind: 'armed' }
  | { kind: 'flight'; state: FlightStateName }
  | { kind: 'mastery-open' }
  | { kind: 'h2-earned' };

/** ctx.quest */
export interface QuestApi {
  snapshot(): QuestSnapshot;
  system(id: SystemId): SystemState;
  onChange(cb: (s: QuestSnapshot, e: QuestEvent) => void): () => void;
  /** the area the next Start resumes at (WP14: load the region first) */
  resumeArea(): string | null;
  /** WP12 */
  markProbestart(): void;
  markGlideSeen(): void;
  /**
   * WP12 only: true only the first time. WP9 and WP10 play their local part of the AKKU / NAV beat
   * (dashboard lock, dream tiles) when their ◆ stamp is first earned.
   */
  markBeat(id: BeatId): boolean;
  /** WP1's failure card (§5.8); the Entscheider timing fallback */
  groundCrew(id: RotorId | CoreId, reason: 'asset' | 'timing'): void;
  /** WP13 only */
  setFlight(state: FlightStateName, o?: { liftoffSeen?: boolean }): void;
  /** WP11 (the Tresor cover, once) */
  unveilH2(): void;
}

/**
 * EventBus mirrors of QuestEvent (and the neighbouring events of §5.2), name → payload. Packages
 * listen with ctx.events.on(name, …).
 */
export interface QuestBusEvents {
  'quest:system': { id: SystemId; from: SystemState; to: SystemState };
  'quest:charge': { charge: number };
  'quest:kiel-open': Record<string, never>;
  'quest:region-open': Record<string, never>;
  'quest:startklar': Record<string, never>;
  'quest:armed': Record<string, never>;
  'quest:mastery-open': Record<string, never>;
  'quest:h2': Record<string, never>;
  'flight:state': { state: FlightStateName };
  /** WP13 */
  'flight:phase': { name: string; t: number; h: number; r?: number };
  /** WP12: the objective moved (rc4 fields kept; `areaId` = `zone`) */
  'objective:changed': { areaId: string | null; zone: string | null; manual: boolean; target: [number, number, number] | null; lift: [number, number, number] | null };
  /** anyone */
  'life:react': { kind: 'greet' | 'rotor' | 'liftoff' | 'flush' | 'wave' | 'gather'; at?: [number, number, number] };
}
