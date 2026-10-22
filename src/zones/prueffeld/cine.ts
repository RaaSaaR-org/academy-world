/**
 * Short scripted camera moves for the two big beats (Rolltor reveal, sign flip). Starts either
 * from a known operate pose (blend 1, no jump) or blends in from the player's view; locks the
 * controls (about 6 s, not skippable), ends with a blend back to the player. Skipped entirely with
 * reduced motion (the beat's events still happen).
 */
import * as THREE from 'three';
import type { Shared } from './state';

type V3 = [number, number, number];
export interface Shot {
  t: number;
  pos: V3;
  look: V3;
}

const P = new THREE.Vector3();
const L = new THREE.Vector3();
const PA = new THREE.Vector3();
const PB = new THREE.Vector3();
const LA = new THREE.Vector3();
const LB = new THREE.Vector3();

export function installCine(S: Shared): (shots: Shot[], o?: { fromPose?: boolean; events?: { t: number; fn: () => void }[]; onDone?: () => void }) => void {
  const ctx = S.ctx;
  let active: {
    shots: Shot[];
    t: number;
    fromPose: boolean;
    cam: ReturnType<typeof ctx.player.cinematic>;
    unlock: () => void;
    events: { t: number; fn: () => void; done?: boolean }[];
    onDone?: () => void;
    out: number;
  } | null = null;

  const finish = (): void => {
    const a = active;
    if (!a) return;
    active = null;
    for (const e of a.events) if (!e.done) e.fn();
    a.cam.end();
    a.unlock();
    a.onDone?.();
  };

  S.onUpdate((dt) => {
    const a = active;
    if (!a) return;
    a.t += dt;
    for (const e of a.events)
      if (!e.done && a.t >= e.t) {
        e.done = true;
        e.fn();
      }
    const last = a.shots[a.shots.length - 1];
    let i = 1;
    while (i < a.shots.length - 1 && a.shots[i].t < a.t) i++;
    const s0 = a.shots[i - 1],
      s1 = a.shots[i];
    const u = THREE.MathUtils.clamp((a.t - s0.t) / Math.max(1e-3, s1.t - s0.t), 0, 1);
    const e = u * u * (3 - 2 * u);
    P.lerpVectors(PA.fromArray(s0.pos), PB.fromArray(s1.pos), e);
    L.lerpVectors(LA.fromArray(s0.look), LB.fromArray(s1.look), e);
    let blend = a.fromPose ? 1 : Math.min(1, a.t / 0.8);
    if (a.t >= last.t && a.out < 0) a.out = 0;
    if (a.out >= 0) {
      a.out += dt;
      blend *= Math.max(0, 1 - a.out / 0.8);
    }
    a.cam.set(P, L, blend);
    if (a.out >= 0.8) finish();
  });

  return (shots, o = {}) => {
    const events = (o.events ?? []).map((e) => ({ ...e, done: false }));
    if (ctx.settings.reducedMotion || shots.length < 2) {
      for (const e of events) e.fn();
      o.onDone?.();
      return;
    }
    if (active) finish();
    active = {
      shots,
      t: 0,
      fromPose: !!o.fromPose,
      cam: ctx.player.cinematic(),
      unlock: ctx.player.lockControls({ look: true }),
      events,
      onDone: o.onDone,
      out: -1,
    };
    active.cam.set(shots[0].pos, shots[0].look, o.fromPose ? 1 : 0);
  };
}
