import type * as THREE from 'three';
import type { RobotId, RobotIkChain } from '@/robots/manifest';

export type { RobotId, RobotIkChain };

/** A movable joint of a loaded robot (rad, or m for prismatic). */
export interface RobotJoint {
  readonly name: string;
  readonly type: 'revolute' | 'continuous' | 'prismatic';
  /** child link (the glTF node the joint moves) */
  readonly link: string;
  /** joint axis in the child link frame */
  readonly axis: THREE.Vector3;
  /** −Infinity / Infinity when unlimited */
  readonly lower: number;
  readonly upper: number;
  /** follows another joint: value = master · multiplier + offset */
  readonly mimic: { readonly joint: string; readonly multiplier: number; readonly offset: number } | null;
}

/**
 * 'auto' picks by distance; 0 / 1 / 2 force a mesh LOD (2: the articulated low LOD where the model has
 * one, else 1); 'silhouette' forces the static far mesh (if loaded).
 */
export type RobotLod = 'auto' | 0 | 1 | 2 | 'silhouette';

/** One body of a robot (a link that moves, fixed links folded in), unskinned, in its link frame: for crowds. */
export interface RobotBody {
  /** the link (glTF node) this body follows: place an instance with getLinkWorldMatrix(link) of a template model */
  link: string;
  geometry: THREE.BufferGeometry;
}

export interface RobotLoadOptions {
  /** default: true for robots of 1 m or more (ARCHITECTURE §9) */
  castShadow?: boolean;
  receiveShadow?: boolean;
  lod?: RobotLod;
  /** also load the static far silhouette and use it beyond its switch distance in 'auto' */
  silhouette?: boolean;
  /** start in this pose instead of the model's default pose */
  pose?: Readonly<Record<string, number>>;
}

export interface RobotIkOptions {
  /** CCD sweeps (default 24) */
  iterations?: number;
  /** stop when the tip is this close (m, default 1 mm) */
  tolerance?: number;
  /** a point in the tip link's frame to move instead of its origin */
  tipOffset?: THREE.Vector3;
  /**
   * Also turn `axis` (tip frame) towards `direction` (world), e.g. jaws pointing down; `weight`
   * 0…1 blends it into the last `joints` joints of the chain (default 0.5, 2 joints).
   */
  orient?: { axis: THREE.Vector3; direction: THREE.Vector3; weight?: number; joints?: number };
}

export interface RobotIkResult {
  /** remaining distance tip → target (m) */
  error: number;
  iterations: number;
  reached: boolean;
}
