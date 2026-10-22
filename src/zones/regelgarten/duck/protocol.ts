/**
 * Messages between the duck station (mujoco.ts, main thread) and its worker (duck.worker.ts).
 * Types only. Poses: Int16 (core.ts POS_SCALE / QUAT_SCALE), duck × sample × link × POSE_STRIDE,
 * in MuJoCo's world (z up, the duck walks along +x); the hero stream is Float32 (link poses, then
 * qpos: 7 root values + 14 joints in ACTUATORS order).
 */
import type { GroupStats, World } from './core';
import type { HackId } from '../tuning';

export type DuckIn =
  | { t: 'init'; wasmUrl: string; links: string[] }
  | { t: 'links'; links: string[] }
  | {
      t: 'gen';
      id: number;
      /** run id: the CEM state lives in the worker per run */
      run: string;
      restart?: boolean;
      gen: number;
      pop: number;
      deck: Record<string, number>;
      curriculum: boolean;
      worlds: 'one' | 'train';
      seed: number;
      mu?: number[] | null;
      sd?: number[] | null;
      /** run this gait 64× (C1) instead of sampling */
      fixed?: number[] | null;
    }
  | { t: 'track'; id: number; params: number[]; n: number; seed: number }
  | { t: 'cancel'; run: string }
  | { t: 'hero'; on: boolean; params: number[] | null; world?: World; idle?: boolean }
  /** a force on the hero's trunk (N, MuJoCo world), held for 0.15 s unless renewed (the F tug) */
  | { t: 'push'; f: [number, number, number] }
  | { t: 'pause'; on: boolean }
  | { t: 'ping'; id: number }
  | { t: 'bench'; id: number; steps: number }
  /** tools: emulate a CPU `factor`× slower (CDP throttling does not reach dedicated workers) */
  | { t: 'slow'; factor: number };

export interface GenOut {
  t: 'gen';
  id: number;
  run: string;
  gen: number;
  pop: number;
  samples: number;
  links: number;
  dist: Float32Array;
  /** fall time (s) per duck, −1 = did not fall */
  fallT: Float32Array;
  friction: Float32Array;
  elite: number[];
  stats: GroupStats;
  eliteStats: GroupStats;
  hack: HackId | null;
  mu: number[];
  sd: number[];
  rec: Int16Array;
  /** ducks recorded in rec when fewer than pop (the recordings' C1 copies): the rest stand */
  recDucks?: number;
  /** wall time from the request's start (incl. waiting slices) and pure work time (ms) */
  ms: number;
  workMs: number;
}

export interface TrackRunOut {
  world: World;
  dist: number;
  fell: boolean;
  t: number;
  success: boolean;
}

export interface TrackOut {
  t: 'track';
  id: number;
  runs: TrackRunOut[];
  rec: Int16Array;
  /** qpos per run and sample (QPOS_STRIDE floats): the hero lane */
  qrec: Float32Array;
  samples: number;
  links: number;
  ms: number;
}

export type DuckOut =
  | { t: 'ready'; wasmMs: number; modelMs: number; bodies: number; timestep: number }
  | GenOut
  | TrackOut
  | { t: 'pose'; pose: Float32Array; time: number; fell: boolean; dist: number }
  | { t: 'hero-fell'; at: number; dist: number }
  | { t: 'pong'; id: number }
  | { t: 'bench'; id: number; usPerStep: number; usPerStepGait: number; homeDrift: number; homeFell: boolean }
  | { t: 'error'; where: string; message: string };
