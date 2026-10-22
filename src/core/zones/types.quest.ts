/**
 * WP1 (quest spine): ctx.quest (QuestApi), ctx.game.secrets, ctx.game.unattended and the stamp
 * scopes (Phase 7 plan §5.2). Contract committed by WPS in wave 0; WP1 owns the file from wave 1.
 * Re-exported by src/core/zones/index.ts.
 */
import type * as THREE from 'three';
import type { Text, Vec3Input } from '../types';
import type { InfoCardSpec } from '@/ui/Modals';
import type { QuestApi } from '../quest/types';

export type {
  StampScope,
  StartSystem,
  ReadyState,
  RotorState,
  SystemState,
  CrewReason,
  BeatId,
  FlightStateName,
  FlightState,
  SystemDef,
  CoreStatus,
  StartSystems,
  MasteryStatus,
  QuestSnapshot,
  QuestEvent,
  QuestApi,
  QuestBusEvents,
} from '../quest/types';

/** An easter egg (R9 §5; plan §4.13): never gates, gives no stars. */
export interface SecretDef {
  id: string;
  /** area id or 'deck' | 'werft' | 'revier' */
  area: string;
  level: 0 | 1 | 2 | 3;
  title: Text;
  hint: Text;
  card: () => InfoCardSpec;
  radio?: Text;
  reward: { kind: 'vitrine'; object: string } | { kind: 'album'; albumId: string };
  /** where the secret sits (world), for nearestHint (EMI-01's hint after the lift-off) and the find's popup */
  at?: Vec3Input;
}

/** ctx.game.secrets */
export interface ZoneSecrets {
  register(def: SecretDef): void;
  /** WP15 at island init (≤ 300 triangles each) */
  registerObject(objectId: string, make: () => THREE.Object3D): void;
  /** WP11 places it in the Fundvitrine */
  object(objectId: string): THREE.Object3D | null;
  /** idempotent; emits 'secret:found' { id, n, total } */
  find(id: string, at?: Vec3Input): boolean;
  has(id: string): boolean;
  found(): string[];
  total(): number;
  nearestHint(fromWorld: Vec3Input, maxLevel?: 0 | 1 | 2): { id: string; bearing: number; distance: number } | null;
}

declare module './ext' {
  interface ZoneContextExtensions {
    /** WP1: the quest spine — systems, the three start systems, flight, mastery (plan §3.1, D23) */
    readonly quest: QuestApi;
  }
}

declare module './types' {
  interface ZoneGame {
    /**
     * ★ of a scope (plan §3.4): 'island' (default, the 18 island stations) or 'all' (every area with
     * registered stamps). `stars(zoneId)` stays the rc4 per-zone form; the H2 pool is ctx.quest's mastery.
     */
    stars(o: { scope?: import('../quest/types').StampScope }): { stars: number; max: number; byStation: Record<string, import('./types').Stars> };
    readonly secrets: ZoneSecrets;
    /** marks an input-free stretch for watch-audit (no behaviour; plan §4 watching rule) */
    unattended(on: boolean, label?: string): void;
    /**
     * The one loading card (plan §4.1, §5.8) in the HUD column, for what this area waits on (a robot, a
     * recording): name, „{x} von {y} MB“, progress, „Erneut laden“, the Bodencrew offer. Removed with the area.
     * The engine shows it on its own for area code that is loading or failed ('zones:failed', 'robots:failed').
     */
    loadingCard(spec: import('@/ui/Kit').LoadingCardSpec): import('@/ui/Kit').LoadingCardHandle;
    /** The Bodencrew offer for this area's ◆ system (§5.8; a rotor, AKKU or NAV), or null when it is bereit or a trim. */
    crewOffer(): { system: Text; accept(): void } | null;
  }
}
