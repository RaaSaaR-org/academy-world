import type * as THREE from 'three';
import type { Text, ZoneContext } from '@/core/zones';
import type { ZoneSound } from './audio';
import type { Look } from './look';

/** Services the zone index hands to every station module. */
export interface Shared {
  readonly ctx: ZoneContext;
  readonly sound: ZoneSound;
  /** Flugmaschine materials and light tiers (ART-V2) */
  readonly look: Look;
  /** which station currently owns operate mode / keys */
  stationActive: 'a' | 'b' | 'c' | null;
  /** EMI-03 line. `now`: a reaction to what just happened replaces queued lines (no subtitle pile-up). */
  emiSay(text: Text, now?: boolean): void;
  emiDrive(to: [number, number, number]): void;
  refreshObjective(): void;
  /** horizontal player distance to the zone anchor ≤ d */
  playerNear(d: number): boolean;
  /** winch whirr on/off (pendulum righting) */
  winch(on: boolean, at: THREE.Object3D): void;
  /** debug time scale for replays / transfer runs (1 = real time) */
  speed: number;
}
