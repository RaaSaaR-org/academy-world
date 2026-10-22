/**
 * WP15 (life and easter eggs) — the LifeDirector contract (Phase 7 plan §5.2, §4.12; R9 §4.5). Island
 * module only: zones never import src/world, they talk to life through events ('sonnenacker:shift',
 * 'life:react', 'flight:phase', 'quest:system'). The fields of §5.2 are kept as committed; the ones marked
 * „additive“ are WP15's own additions (optional, so a def written against §5.2 still compiles).
 */
import type * as THREE from 'three';
import type { Text } from '@/core/zones';
import type { Vec3Tuple } from '../layout';

/** area id or 'deck' | 'werft' | 'revier' (and life's own groups: 'bridgehead', 'apron', 'hof', 'ausguck') */
export type AreaId = string;
/** near ≤ 40 m at 60 Hz · mid 40–150 m at 15 Hz round robin · far 150–1,500 m at 2 Hz as one proxy draw · hidden */
export type LifeTier = 'near' | 'mid' | 'far' | 'hidden';
/** the four phases of the 8-minute Hof-Takt (R9 §4.2) */
export type HofPhase = 'ernte' | 'abtransport' | 'wartung' | 'bewaesserung';
export type ReactKind = 'greet' | 'rotor' | 'liftoff' | 'flush' | 'wave' | 'gather';

export interface LifeClock {
  /** seconds on the farm clock (game time; it stops while the game is paused) */
  readonly t: number;
  /** completed Hof-Takt loops */
  readonly loop: number;
  readonly phase: HofPhase;
  /** seconds into the phase */
  readonly phaseT: number;
}

export interface LifeAgentDef {
  id: string;
  area: AreaId;
  job: Text;
  kind: 'arm' | 'rover' | 'person' | 'animal' | 'vehicle' | 'drone' | 'machine';
  /** 60 Hz within 40 m */
  near?(dt: number, clock: LifeClock): void;
  /** 15 Hz round robin (dt is the time since this agent's last mid call) */
  mid?(dt: number, clock: LifeClock): void;
  /** one instanced draw for all far agents („Spielfiguren“), updated at 2 Hz */
  far?: { proxy: 'figure' | 'vehicle' | 'animal'; at(out: THREE.Vector3): THREE.Vector3 };
  /** additive: a 'life:react' reached the agent's area (or every area when `at` is not given) */
  react?(kind: ReactKind, at: Vec3Tuple | null): void;
  /** additive: the agent's area changed tier (show or hide its meshes; 'hidden' = draw nothing) */
  tier?(tier: LifeTier): void;
}

/** additive: one life area (a group of agents tiered together; R9 §4.5 „distance from the camera to the agent's group“) */
export interface LifeAreaDef {
  /** world centre at h = 0 */
  center: Vec3Tuple;
  /** the group's radius (m): the tier distance is measured from this sphere */
  radius: number;
  /** 'ground' areas ride the ground root (altitude h) and hide airborne above 300 m */
  frame: 'island' | 'ground';
}

export interface LifeDirector {
  readonly clock: LifeClock;
  register(def: LifeAgentDef): { remove(): void };
  react(kind: ReactKind, at?: Vec3Tuple): void;
  onPhase(cb: (phase: HofPhase) => void): () => void;
  tierOf(area: AreaId): LifeTier;
  /** __academy.ext('life') */
  stats(): { agents: number; near: number; draws: number; ms: number };
  /** additive: define (or move) a life area */
  area(id: AreaId, def: LifeAreaDef): void;
  /** additive: a mesh that counts as one life draw while it is visible (stats().draws) */
  track(mesh: THREE.Object3D): void;
}
