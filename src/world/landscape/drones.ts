import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { DRONE_DOCKS, INTAKES, SENSOR_MASTS } from './plan';
import { type Batch, flatRing, paint, rbox } from './batch';
import { merge } from '../util';
import { ZONE_PLOTS, polar, type Vec3Tuple } from '../layout';

/**
 * Wartungsdrohnen (phase 5): four maintenance quadcopters, one per rim gap, each with a charging
 * dock (ceramic plinth, carbon landing pad, teal ring, alu guides). A drone charges for 9–16 s,
 * lifts off, flies a slow inspection round to the two nearest cooling-air intakes and a sensor mast,
 * hovers over each, comes back and lands. Purpose you can see: the island inspects itself.
 * One instanced body mesh, one for the rotor blur discs, one for the status lights (+3 calls).
 * They keep flying on the low tier (motion is information, not decoration).
 * Phase 7 (WP15): missions. A drone can be sent somewhere and back (`droneMissions.dispatch`): to the
 * rotor duct of a zone that just earned its first stamp (plan §3.3 „a maintenance drone visits its
 * duct“, on 'quest:system' → 'arbeit'), or down to the Hofladen with a spare gripper finger (R9 §4.3
 * „Ersatzfinger per Drohne“, life/farm.ts). A drone on a mission flies on its own loop, so it keeps
 * flying while the camera is far from the deck.
 */
export interface Drones {
  update(dt: number): void;
}

/** A trip: up, over to `to` (world, h = 0) at `cruise` height, down to it, hover (or sit) for `stayS`, back. */
export interface DroneMission {
  to: Vec3Tuple;
  cruise: number;
  stayS: number;
  /** horizontal speed on the way (m/s) */
  speed?: number;
  /** a waypoint before the descent (e.g. the slot beside a lobe tip on the way to a duct) */
  via?: Vec3Tuple;
  /** vertical speed (m/s, default 2.4) */
  vspeed?: number;
  /** leave the stay early once this is true */
  until?(): boolean;
  onArrive?(): void;
  onLeave?(): void;
  onHome?(): void;
}

/** WP15: set by buildDrones; life and the duct visits send drones out through it (false: none free). */
export const droneMissions: { dispatch: ((m: DroneMission) => boolean) | null } = { dispatch: null };

const PAD_H = 0.5;
const CRUISE = 6.2;
const SPEED = 3.2;

type Phase = 'dock' | 'up' | 'fly' | 'hover' | 'down';
type MissionStep = 'up' | 'out' | 'via' | 'down' | 'stay' | 'rise' | 'climb' | 'back' | 'home';
interface DroneState {
  mission: DroneMission | null;
  mstep: MissionStep;
  dock: THREE.Vector3;
  targets: THREE.Vector3[];
  next: number;
  phase: Phase;
  t: number;
  wait: number;
  pos: THREE.Vector3;
  from: THREE.Vector3;
  to: THREE.Vector3;
  yaw: number;
  spin: number;
}

export function buildDrones(ctx: ZoneContext, batch: Batch): Drones {
  const M = ctx.materials;
  const teal = M.light(0x2dd4bf);

  // ── docks (static) ─────────────────────────────────────────────────────────
  for (const d of DRONE_DOCKS) {
    batch.add(M.carbon, new THREE.CylinderGeometry(1.32, 1.36, 0.12, 6).translate(d.x, 0.06, d.z), { name: 'carbon' });
    batch.add(M.hull, new THREE.CylinderGeometry(1.36, 1.48, PAD_H - 0.12, 6).translate(d.x, 0.12 + (PAD_H - 0.12) / 2, d.z), { name: 'hull', cast: true });
    batch.add(M.brushedAlu, new THREE.CylinderGeometry(1.39, 1.37, 0.04, 6).translate(d.x, PAD_H - 0.01, d.z), { name: 'alu' });
    batch.add(M.carbon, new THREE.CylinderGeometry(1.22, 1.22, 0.02, 6).translate(d.x, PAD_H + 0.01, d.z), { name: 'carbon' });
    batch.add(teal, flatRing(d.x, d.z, 0.86, 0.93, PAD_H + 0.024, 48), { name: 'teal-lines' });
    // alignment cross (light paint) and four alu guide blocks at the corners
    const paintMat = M.standard({ color: 0xe7e5e4, roughness: 0.74, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    for (const a of [0, Math.PI / 2]) batch.add(paintMat, new THREE.PlaneGeometry(0.06, 0.9).rotateX(-Math.PI / 2).rotateY(a).translate(d.x, PAD_H + 0.023, d.z), { name: 'lane-paint' });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      batch.add(M.brushedAlu, rbox(0.16, 0.08, 0.3).rotateY(-a).translate(d.x + Math.cos(a) * 1.08, PAD_H + 0.05, d.z + Math.sin(a) * 1.08), { name: 'alu' });
    }
    ctx.physics.addStaticCylinder({ radius: 1.42, height: PAD_H, position: [d.x, PAD_H / 2, d.z], surface: 'metal' });
  }

  // ── drones ─────────────────────────────────────────────────────────────────
  const bodyGeo = (() => {
    const parts: THREE.BufferGeometry[] = [];
    parts.push(paint(rbox(0.42, 0.14, 0.56).translate(0, 0.16, 0), 0xe7e5e4));
    parts.push(paint(new THREE.BoxGeometry(0.3, 0.05, 0.4).translate(0, 0.08, 0), 0x1c1917));
    parts.push(paint(new THREE.SphereGeometry(0.075, 10, 6).translate(0, 0.07, -0.24), 0x0f0e0d));
    for (const [x, z] of [
      [0.42, 0.42],
      [-0.42, 0.42],
      [0.42, -0.42],
      [-0.42, -0.42],
    ]) {
      parts.push(paint(new THREE.BoxGeometry(Math.hypot(x, z) * 1.0, 0.04, 0.06).rotateY(-Math.atan2(z, x)).translate(x / 2, 0.17, z / 2), 0x292524));
      parts.push(paint(new THREE.TorusGeometry(0.2, 0.032, 6, 18).rotateX(Math.PI / 2).translate(x, 0.2, z), 0xd6d3d1));
      parts.push(paint(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 8).translate(x, 0.2, z), 0x292524));
    }
    // landing skids
    for (const x of [-0.18, 0.18]) {
      parts.push(paint(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6).rotateX(Math.PI / 2).translate(x, 0.0, 0), 0xa8a29e));
      for (const z of [-0.15, 0.15]) parts.push(paint(new THREE.CylinderGeometry(0.01, 0.01, 0.1, 5).translate(x, 0.05, z), 0xa8a29e));
    }
    return merge(parts);
  })();
  const n = DRONE_DOCKS.length;
  const body = new THREE.InstancedMesh(bodyGeo, M.standard({ vertexColors: true, roughness: 0.4, metalness: 0.3 }), n);
  body.name = 'island:maintenance-drones';
  body.castShadow = true;
  body.frustumCulled = false;
  ctx.root.add(body);
  ctx.freezeStatic(body);
  // flat rotor discs: one pass shows the same faces (W1)
  const discMat = new THREE.MeshBasicMaterial({ color: 0x57534e, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, fog: true, forceSinglePass: true });
  ctx.onDispose(() => discMat.dispose());
  const discs = new THREE.InstancedMesh(new THREE.CircleGeometry(0.17, 18).rotateX(-Math.PI / 2), discMat, n * 4);
  discs.frustumCulled = false;
  ctx.root.add(discs);
  ctx.freezeStatic(discs);
  const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.02, 0.03), M.light(0x2dd4bf, 'T1'), n);
  lights.frustumCulled = false;
  ctx.root.add(lights);
  ctx.freezeStatic(lights);

  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const states: DroneState[] = DRONE_DOCKS.map((d, i) => {
    const near = [...INTAKES].sort((a, b) => Math.hypot(a.x - d.x, a.z - d.z) - Math.hypot(b.x - d.x, b.z - d.z)).slice(0, 2);
    const mast = [...SENSOR_MASTS].sort((a, b) => Math.hypot(a.x - d.x, a.z - d.z) - Math.hypot(b.x - d.x, b.z - d.z))[0];
    const targets = [...near.map((f) => v(f.x, 3.2, f.z)), v(mast.x, mast.h + 2.2, mast.z)];
    const dock = v(d.x, PAD_H + 0.03, d.z);
    return { mission: null, mstep: 'up', dock, targets, next: i % targets.length, phase: 'dock', t: 0, wait: 3 + i * 3.5, pos: dock.clone(), from: dock.clone(), to: dock.clone(), yaw: i, spin: 0 };
  });

  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    qt = new THREE.Quaternion(),
    e = new THREE.Euler(),
    one = new THREE.Vector3(1, 1, 1),
    p = new THREE.Vector3();
  const rotorOff = [v(0.42, 0.2, 0.42), v(-0.42, 0.2, 0.42), v(0.42, 0.2, -0.42), v(-0.42, 0.2, -0.42)];
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const ease = (x: number): number => x * x * (3 - 2 * x);

  const write = (): void => {
    states.forEach((s, i) => {
      // bank into the direction of travel while flying
      const flying = s.phase === 'fly' || (!!s.mission && (s.mstep === 'out' || s.mstep === 'back' || s.mstep === 'via'));
      const bank = flying ? 0.12 : 0;
      e.set(-bank, s.yaw, 0, 'YXZ');
      q.setFromEuler(e);
      body.setMatrixAt(i, m4.compose(s.pos, q, one));
      lights.setMatrixAt(i, m4.compose(p.set(0, 0.05, 0.12).applyQuaternion(q).add(s.pos), q, one));
      for (let k = 0; k < 4; k++) {
        if (s.phase === 'dock') discs.setMatrixAt(i * 4 + k, hidden);
        else discs.setMatrixAt(i * 4 + k, m4.compose(p.copy(rotorOff[k]).applyQuaternion(q).add(s.pos), qt.copy(q), one));
      }
    });
    body.instanceMatrix.needsUpdate = true;
    lights.instanceMatrix.needsUpdate = true;
    discs.instanceMatrix.needsUpdate = true;
  };
  write();
  body.computeBoundingSphere();

  const go = (s: DroneState, phase: Phase, to: THREE.Vector3): void => {
    s.phase = phase;
    s.t = 0;
    s.from.copy(s.pos);
    s.to.copy(to);
  };
  const dur = (s: DroneState): number => (s.phase === 'fly' ? Math.max(1.5, s.from.distanceTo(s.to) / SPEED) : 2.6);
  const tmp = new THREE.Vector3();

  // ── missions (WP15): their own loop, so they fly on while the deck loop sleeps ────────────────
  const mv = new THREE.Vector3();
  const goM = (s: DroneState, step: MissionStep, to: THREE.Vector3): void => {
    s.mstep = step;
    s.t = 0;
    s.from.copy(s.pos);
    s.to.copy(to);
  };
  const missionStep = (s: DroneState, h: number): void => {
    const m = s.mission!;
    s.t += h;
    if (s.mstep === 'stay') {
      s.pos.y = s.to.y + Math.sin(s.t * 1.7) * 0.05;
      s.yaw += Math.sin(s.t * 0.8) * 0.3 * h;
      if (s.t >= m.stayS || (s.t > 1.5 && m.until?.())) {
        try {
          m.onLeave?.();
        } catch (err) {
          console.error('[drones] mission onLeave threw', err);
        }
        // back the way it came: out to the waypoint (if any), then up to the cruise height
        if (m.via) goM(s, 'rise', mv.set(m.via[0], m.via[1], m.via[2]));
        else goM(s, 'climb', mv.set(s.pos.x, m.cruise, s.pos.z));
      }
      return;
    }
    const horiz = s.mstep === 'out' || s.mstep === 'back' || (s.mstep === 'rise' && !!m.via) || (s.mstep === 'down' && !!m.via);
    const D = horiz ? Math.max(1.5, Math.hypot(s.to.x - s.from.x, s.to.z - s.from.z) / (m.speed ?? 8)) : Math.max(1.6, Math.abs(s.to.y - s.from.y) / (m.vspeed ?? 2.4));
    const k = Math.min(1, s.t / D);
    s.pos.lerpVectors(s.from, s.to, ease(k));
    if (horiz) {
      const dx = s.to.x - s.from.x,
        dz = s.to.z - s.from.z;
      if (dx * dx + dz * dz > 0.01) {
        const want = Math.atan2(-dx, -dz);
        s.yaw += Math.atan2(Math.sin(want - s.yaw), Math.cos(want - s.yaw)) * (1 - Math.exp(-h * 2.5));
      }
    }
    if (k < 1) return;
    const [tx, ty, tz] = m.to;
    switch (s.mstep) {
      case 'up':
        goM(s, 'out', mv.set(m.via ? m.via[0] : tx, m.cruise, m.via ? m.via[2] : tz));
        break;
      case 'out':
        if (m.via) goM(s, 'via', mv.set(m.via[0], m.via[1], m.via[2]));
        else goM(s, 'down', mv.set(tx, ty, tz));
        break;
      case 'via':
        goM(s, 'down', mv.set(tx, ty, tz));
        break;
      case 'down':
        s.mstep = 'stay';
        s.t = 0;
        try {
          m.onArrive?.();
        } catch (err) {
          console.error('[drones] mission onArrive threw', err);
        }
        break;
      case 'rise':
        goM(s, 'climb', mv.set(s.pos.x, m.cruise, s.pos.z));
        break;
      case 'climb':
        goM(s, 'back', mv.set(s.dock.x, m.cruise, s.dock.z));
        break;
      case 'back':
        goM(s, 'home', s.dock);
        break;
      case 'home':
        s.mission = null;
        s.phase = 'dock';
        s.t = 0;
        s.wait = 6 + Math.random() * 6;
        s.pos.copy(s.dock);
        try {
          m.onHome?.();
        } catch (err) {
          console.error('[drones] mission onHome threw', err);
        }
        break;
    }
  };
  let missionLast = ctx.time.elapsed;
  ctx.every(1 / 60, () => {
    const now = ctx.time.elapsed;
    const h = Math.min(0.05, Math.max(0, now - missionLast));
    missionLast = now;
    let any = false;
    for (const s of states)
      if (s.mission) {
        any = true;
        missionStep(s, h);
      }
    if (any) write();
  });
  droneMissions.dispatch = (m) => {
    // the docked drone nearest to the target
    let best: DroneState | null = null;
    let bd = Infinity;
    for (const s of states) {
      if (s.mission || s.phase !== 'dock') continue;
      const d = Math.hypot(s.dock.x - m.to[0], s.dock.z - m.to[2]);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (!best) return false;
    best.mission = m;
    goM(best, 'up', mv.set(best.dock.x, Math.min(m.cruise, CRUISE + 2), best.dock.z));
    return true;
  };
  ctx.onDispose(() => (droneMissions.dispatch = null));

  // plan §3.3: a zone's first stamp (its rotor turns „in Arbeit“) → a drone inspects that rotor's duct
  ctx.events.on('quest:system', (e?: { id?: string; to?: string; from?: string }) => {
    if (!e?.id || e.to !== 'arbeit' || !/^M[1-6]$/.test(e.id)) return;
    const z = ZONE_PLOTS[Number(e.id.slice(1)) - 1];
    if (!z) return;
    // down the slot beside the lobe tip, then in under the lobe to the duct's rim
    const via = polar(z.bearing, 104, -8.5);
    const to = polar(z.bearing, 93.5, -10.4);
    const mission: DroneMission = { to, via, cruise: 7, stayS: 5.5, speed: 7 };
    if (!droneMissions.dispatch?.(mission)) ctx.after(6, () => droneMissions.dispatch?.(mission));
  });

  return {
    update(dt) {
      const h = Math.min(dt, 0.05);
      for (const s of states) {
        if (s.mission) continue;
        s.t += h;
        if (s.phase === 'dock') {
          if (s.t > s.wait) go(s, 'up', tmp.set(s.dock.x, CRUISE, s.dock.z));
        } else if (s.phase === 'hover') {
          s.yaw += Math.sin(s.t * 0.9) * 0.4 * h;
          s.pos.y = s.to.y + Math.sin(s.t * 1.7) * 0.06;
          if (s.t > 4.2) {
            // next target, or home after the round
            s.next++;
            if (s.next % (s.targets.length + 1) === 0) go(s, 'fly', tmp.set(s.dock.x, CRUISE, s.dock.z));
            else go(s, 'fly', s.targets[(s.next - 1) % s.targets.length]);
          }
        } else {
          const D = dur(s);
          const k = Math.min(1, s.t / D);
          const kk = ease(k);
          s.pos.lerpVectors(s.from, s.to, kk);
          if (s.phase === 'fly') {
            // cruise height in the middle of a leg, a gentle arc
            s.pos.y += Math.sin(k * Math.PI) * 0.8;
            const dx = s.to.x - s.from.x,
              dz = s.to.z - s.from.z;
            if (dx * dx + dz * dz > 0.01) {
              const want = Math.atan2(-dx, -dz);
              const d = Math.atan2(Math.sin(want - s.yaw), Math.cos(want - s.yaw));
              s.yaw += d * (1 - Math.exp(-h * 2.5));
            }
          }
          if (k >= 1) {
            if (s.phase === 'up') {
              s.next = 1;
              go(s, 'fly', s.targets[0]);
            } else if (s.phase === 'fly') {
              if (s.to.x === s.dock.x && s.to.z === s.dock.z) go(s, 'down', s.dock);
              else {
                s.phase = 'hover';
                s.t = 0;
              }
            } else if (s.phase === 'down') {
              s.phase = 'dock';
              s.t = 0;
              s.wait = 9 + Math.random() * 7;
              s.pos.copy(s.dock);
            }
          }
        }
      }
      write();
    },
  };
}
