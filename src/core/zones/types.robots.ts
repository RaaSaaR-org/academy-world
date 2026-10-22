/**
 * WP4 (engine): ctx.robots, the adapter (src/core/zones/ext/robots.ts) over WP0's runtime (Phase 7 plan
 * §5.2, §5.5, §5.6, §5.8, §5.9). Contract committed by WPS in wave 0; WP4 owns the file from wave 1.
 * Zones never import the robots runtime: these are TYPE-only re-exports. Re-exported by
 * src/core/zones/index.ts.
 *
 * The queue (§5.6): every GLB fetch waits for
 *   1. reachability — no 'site' area before the Revier is open (regionOpen), except the resume or
 *      deep-link area (?zone=, ?area=);
 *   2. the objective area, or the player ≤ 60 m from the area's plot edge (priority 'route', the
 *      default), or nothing more for priority 'now' (the player is at the station);
 *   3. a free slot: ≤ 2 fetches at once; prefetch one at a time, in idle slots, never during a
 *      cinematic(), F1 or the lift-off.
 * A fetch that fails is retried 3 times (1, 3, 9 s); then the robot is 'failed', its promises reject
 * and 'robots:failed' { id, area, error } goes out (WP1's loading card offers „Erneut laden“: calling
 * load() again queues it afresh). Models are LOD-tracked per frame while their area is live (built,
 * not suspended; clips play while it is active), and
 * disposed (their GLBs released) when the area is disposed. On suspend the tracking and clips pause
 * and GLBs no model uses any more are released: an area that wants its memory back disposes its
 * models in onSuspend and loads them again in onResume (§5.9).
 */
import type * as THREE from 'three';
import type { RobotId, RobotLoadOptions, RobotModel } from '../robots';
import type { RobotLineup, RobotManifestEntry } from '@/robots/manifest';

export type { RobotId, RobotLod, RobotLoadOptions, RobotIkOptions, RobotIkResult, RobotJoint, RobotModel, RobotBody } from '../robots';
export type { RobotManifestEntry, RobotLineup } from '@/robots/manifest';
import type { RobotBody } from '../robots';

/** A keyframed joint clip (Vorführung, waving): joint name → [t (s), value] pairs, sorted by t. */
export interface RobotClip {
  duration: number;
  loop?: boolean;
  tracks: Readonly<Record<string, ReadonlyArray<readonly [t: number, value: number]>>>;
}

export type RobotFetchState = 'idle' | 'queued' | 'loading' | 'ready' | 'failed';

/** Queue priority: 'now' skips the distance gate (the player is at the station), 'route' (default) waits for the objective or ≤ 60 m, 'idle' comes last. */
export type RobotPriority = 'now' | 'route' | 'idle';

/** ctx.robots */
export interface ZoneRobots {
  /** queued (see above); LOD tracked per frame while the area is live; released on dispose/suspend */
  load(id: RobotId, o?: RobotLoadOptions & { priority?: RobotPriority }): Promise<RobotModel>;
  /** the static far mesh (.l2.glb, ≤ 30 KB); queued like a GLB */
  loadSilhouette(id: RobotId): Promise<THREE.Mesh>;
  /** crowds: one InstancedMesh per body, FK from one template RobotModel; queued with the robot's GLB */
  bodies(id: RobotId, lod: 0 | 1 | 2): Promise<readonly RobotBody[]>;
  /** fetch + parse + RobotLibrary.prewarm, one at a time in idle slots (paused in cinematics, F1, the lift-off) */
  prefetch(ids: readonly RobotId[], o?: { priority?: 'route' | 'idle' }): void;
  info(id: RobotId): Promise<RobotManifestEntry>;
  state(id: RobotId): RobotFetchState;
  /** bytes (brotli) for the loading card: `loaded` is 0 until the file is in, then `total`; null before the manifest is known */
  progress(id: RobotId): { loaded: number; total: number } | null;
  /**
   * Vorführung, waving: plays the clip on the model's joints while its area is active (no allocation
   * per frame). Under reduced motion it shows the end pose of a clip that does not loop, the first
   * pose of one that does, and stops.
   */
  animate(model: RobotModel, clip: RobotClip, o?: { speed?: number; loop?: boolean }): { stop(): void };
  /** the area drives updateLod itself (Schauhalle governor) */
  untrack(model: RobotModel): void;
  /**
   * additive (WP11, Request(WP4)): drop the parsed GLB of a robot as soon as no model of it is live and
   * no request for it waits (RobotLibrary.release, plan §5.9) — the Schauhalle's LRU of 3 parsed files
   * beyond its visible set. Returns false when it is still in use (nothing happens then).
   */
  release?(id: RobotId): boolean;
  /**
   * additive (WP4, for WP11's Größenwand): every hall robot in its default pose as ONE static mesh at
   * true scale (`lineup.l2.glb`, WP0 R6), queued; its rows (x range per robot) from lineupInfo().
   */
  lineup(): Promise<THREE.Mesh>;
  lineupInfo(): Promise<RobotLineup | null>;
  /**
   * additive (WP4): the robots' one shared paint material (vertex colours). Give it to crowd
   * InstancedMeshes (castShadow and receiveShadow true, with or without per-instance colours): those
   * variants are compiled in the boot warm-up (§5.5), so a crowd links no program when it appears.
   */
  readonly paint: THREE.MeshStandardMaterial;
  /** additive (WP4): the one transparent teal ghost material for dream ghosts (skinned clones, castShadow false); compiled at boot */
  readonly ghost: THREE.MeshStandardMaterial;
}

/** 'robots:failed': a GLB failed after its retries; WP1's loading card listens. */
export interface RobotsFailedEvent {
  id: RobotId;
  area: string;
  error: string;
}

declare module './ext' {
  interface ZoneContextExtensions {
    /** WP4: real robot models through a reachability-aware queue (plan §5.6) */
    readonly robots: ZoneRobots;
  }
}
