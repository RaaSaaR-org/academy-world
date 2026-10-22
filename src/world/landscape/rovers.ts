import * as THREE from 'three';
import type { KinematicHandle, ZoneContext } from '@/core/zones';
import { ALLEE_LANE, ROVER_ROUTES } from './plan';
import { paint, rbox } from './batch';
import { Markings, drawMarkings, followDetour, safeRobot, safetyStep, type SafeRobot } from '../life/reactive';
import { SAFETY } from '../life/tuning';

/**
 * Service rovers (ART-V2 §4.1): eight small unbranded maintenance robots driving closed loops on the
 * ring path and along the Allee edges at 0.8 m/s. Kinematic colliders (no walking through them).
 * Three instanced meshes: body, wheels, eye. They keep driving on the low tier.
 * Phase 7 (WP15, plan §4.12 L5, egg 5): they react to you. The first meeting is an eye blink and a
 * chirp; within 5.5 m a flat safety ring shows (teal, amber inside 1.9 m), they slow down and stop,
 * and if you stay in their way they replan around you with A*: the teal search frontier spreads over
 * the deck (life/reactive.ts), they drive the detour and rejoin their loop — never more than 2 s of
 * waiting. Three replans you cause find egg 5 „Der Wackelige“. At a rotor beat or the lift-off they
 * stop and blink. The rings and the frontier are one instanced draw, ledger 'life'.
 */
export interface Rovers {
  update(dt: number, player: THREE.Vector3): void;
}

const SPEED = 0.8;
const LOOK_R = 2.5;
const BODY = { w: 0.7, l: 1.0, h: 0.6 };
/** how far ahead on its loop a detour rejoins (m) */
const REJOIN_M = 4.2;

interface RoverState {
  route: (typeof ROVER_ROUTES)[number];
  /** ring: bearing (rad); allee: z */
  s: number;
  dir: number;
  pos: THREE.Vector3;
  heading: number;
  look: number;
  /** allee: remaining turn time */
  turning: number;
  wheel: number;
  col: KinematicHandle;
  safe: SafeRobot;
  /** a rotor beat or the lift-off: stopped and blinking */
  pause: number;
  /** the safety events of this rover (made once: no closure per frame) */
  on: (e: 'greet' | 'replan' | 'rejoin') => void;
}

/** The rc4 service rover's parts (shared with the Hofladen's crate rovers, life/farm.ts). */
export interface RoverParts {
  body: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  eye: THREE.BufferGeometry;
  bodyMat: THREE.Material;
  wheelMat: THREE.Material;
  eyeMat: THREE.Material;
  wheelOff: readonly THREE.Vector3[];
  size: typeof BODY;
}

export function roverParts(ctx: ZoneContext): RoverParts {
  const M = ctx.materials;
  const body = (() => {
    const parts: THREE.BufferGeometry[] = [];
    parts.push(paint(rbox(BODY.w, BODY.h - 0.14, BODY.l).translate(0, 0.14 + (BODY.h - 0.14) / 2 + 0.06, 0), 0xe7e5e4));
    parts.push(paint(rbox(BODY.w + 0.02, 0.1, BODY.l + 0.02).translate(0, 0.27, 0), 0x1c1917));
    // eye bar housing (dark glass) at the front (−z)
    parts.push(paint(new THREE.BoxGeometry(0.5, 0.1, 0.04).translate(0, 0.52, -BODY.l / 2 - 0.005), 0x0f0e0d));
    // tiny mast with a puck
    parts.push(paint(new THREE.CylinderGeometry(0.015, 0.02, 0.32, 6).translate(0.22, 0.86, 0.3), 0x1c1917));
    parts.push(paint(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12).translate(0.22, 1.03, 0.3), 0xe7e5e4));
    // tool tray on the back (alu)
    parts.push(paint(new THREE.BoxGeometry(0.5, 0.04, 0.3).translate(0, BODY.h + 0.08, 0.22), 0xc9c4bf));
    const geos = parts.map((g) => (g.index ? g.toNonIndexed() : g));
    for (const g of geos) if (g.getAttribute('uv')) g.deleteAttribute('uv');
    return concat(geos);
  })();
  return {
    body,
    wheel: new THREE.CylinderGeometry(0.13, 0.13, 0.09, 14).rotateZ(Math.PI / 2),
    eye: new THREE.BoxGeometry(0.42, 0.035, 0.012).translate(0, 0.52, -BODY.l / 2 - 0.03),
    bodyMat: M.standard({ vertexColors: true, roughness: 0.4, metalness: 0.15 }),
    wheelMat: M.rubber,
    eyeMat: M.light(0x2dd4bf, 'T1'),
    wheelOff: [new THREE.Vector3(-0.36, 0.13, -0.32), new THREE.Vector3(0.36, 0.13, -0.32), new THREE.Vector3(-0.36, 0.13, 0.32), new THREE.Vector3(0.36, 0.13, 0.32)],
    size: BODY,
  };
}

export function buildRovers(ctx: ZoneContext): Rovers {
  const P = roverParts(ctx);
  const n = ROVER_ROUTES.length;
  const body = new THREE.InstancedMesh(P.body, P.bodyMat, n);
  const wheels = new THREE.InstancedMesh(P.wheel, P.wheelMat, n * 4);
  const eyes = new THREE.InstancedMesh(P.eye, P.eyeMat, n);
  body.name = 'island:rovers';
  body.castShadow = true;
  for (const m of [body, wheels, eyes]) {
    m.frustumCulled = false;
    ctx.root.add(m);
    ctx.freezeStatic(m);
  }
  // the safety rings and the A* frontier (WP15): ledger 'life', the robots' shared paint (no new program)
  const lifeG = new THREE.Group();
  lifeG.name = 'life:deck-markings';
  lifeG.userData.ledger = 'life';
  lifeG.userData.noMerge = true;
  lifeG.userData.noEnrich = true;
  ctx.root.add(lifeG);
  const markMat = ctx.robots?.paint ?? ctx.materials.standard({ vertexColors: true, roughness: 0.55, metalness: 0 });
  const marks = new Markings(lifeG, markMat, 260, 'life:rover-markings');

  const proxyGeo = new THREE.BoxGeometry(BODY.w + 0.04, BODY.h + 0.1, BODY.l + 0.04).translate(0, (BODY.h + 0.1) / 2, 0);
  ctx.onDispose(() => proxyGeo.dispose());
  const rovers: RoverState[] = ROVER_ROUTES.map((route) => {
    const proxy = new THREE.Mesh(proxyGeo);
    proxy.visible = false;
    const s = route.kind === 'ring' ? (route.start * Math.PI) / 180 : route.start;
    const pos = new THREE.Vector3();
    const st: RoverState = { route, s, dir: route.kind === 'ring' ? route.dir ?? 1 : 1, pos, heading: 0, look: 0, turning: 0, wheel: 0, col: null as unknown as KinematicHandle, safe: safeRobot(pos), pause: 0, on: () => {} };
    st.on = (e) => onSafety(st, e);
    pose(st, 0);
    proxy.position.copy(pos);
    proxy.rotation.y = st.heading;
    st.col = ctx.physics.addKinematic(proxy, { shape: 'box' });
    return st;
  });

  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    qw = new THREE.Quaternion(),
    qs = new THREE.Quaternion(),
    one = new THREE.Vector3(1, 1, 1),
    blink = new THREE.Vector3(1, 0.12, 1),
    v = new THREE.Vector3(),
    Y = new THREE.Vector3(0, 1, 0),
    X = new THREE.Vector3(1, 0, 0);
  const wheelOff = P.wheelOff;

  function pose(r: RoverState, _dt: number): void {
    if (r.route.kind === 'ring') {
      const R = r.route.r ?? 46;
      r.pos.set(Math.sin(r.s) * R, 0, -Math.cos(r.s) * R);
      // tangent of increasing bearing = (cos, sin); facing (−z local) along the travel direction
      const tx = Math.cos(r.s) * r.dir,
        tz = Math.sin(r.s) * r.dir;
      r.heading = Math.atan2(-tx, -tz);
    } else {
      r.pos.set(r.route.x ?? 0, 0, r.s);
      if (r.turning <= 0) r.heading = r.dir > 0 ? Math.PI : 0;
    }
    r.safe.heading = r.heading;
  }

  /** the point a detour rejoins: REJOIN_M ahead on the loop (and its route parameter) */
  const rejoin = new THREE.Vector3();
  const rejoinS = (r: RoverState): number => {
    if (r.route.kind === 'ring') {
      const R = r.route.r ?? 46;
      const s = r.s + (REJOIN_M / R) * r.dir;
      rejoin.set(Math.sin(s) * R, 0, -Math.cos(s) * R);
      return s;
    }
    const s = THREE.MathUtils.clamp(r.s + REJOIN_M * r.dir, ALLEE_LANE.z0, ALLEE_LANE.z1);
    rejoin.set(r.route.x ?? 0, 0, s);
    return s;
  };
  // where a detour may run: the ring path's band, the Allee
  const onRing = (x: number, z: number): boolean => Math.abs(Math.hypot(x, z) - 46) < 2.55;
  const onAllee = (x: number, z: number): boolean => Math.abs(x) < 3.9 && z > ALLEE_LANE.z0 - 3 && z < ALLEE_LANE.z1 + 2;

  const write = (): void => {
    for (let i = 0; i < rovers.length; i++) {
      const r = rovers[i];
      q.setFromAxisAngle(Y, r.heading + r.look);
      body.setMatrixAt(i, m4.compose(r.pos, q, one));
      // the eye bar blinks twice on the first meeting and at a beat
      const b = r.safe.blinkT > 0 && Math.floor(r.safe.blinkT / 0.13) % 2 === 0;
      eyes.setMatrixAt(i, b ? m4.compose(r.pos, q, blink) : m4);
      for (let k = 0; k < 4; k++) {
        v.copy(wheelOff[k]).applyQuaternion(q).add(r.pos);
        qw.copy(q).multiply(qs.setFromAxisAngle(X, r.wheel));
        wheels.setMatrixAt(i * 4 + k, m4.compose(v, qw, one));
      }
    }
    body.instanceMatrix.needsUpdate = true;
    wheels.instanceMatrix.needsUpdate = true;
    eyes.instanceMatrix.needsUpdate = true;
  };
  write();
  body.computeBoundingSphere();

  // egg 5 „Der Wackelige“ (R9 §5): replans you cause, this session
  let replansByYou = 0;
  let firstPopup = false;
  const chirp = (at: THREE.Vector3, up: boolean): void => {
    ctx.audio.tone({ freq: up ? 1320 : 990, to: up ? 1760 : 1320, dur: 0.07, type: 'sine', volume: 0.32, at: [at.x, 0.6, at.z] });
    ctx.after(0.09, () => ctx.audio.tone({ freq: up ? 1760 : 1180, to: up ? 2100 : 990, dur: 0.06, type: 'sine', volume: 0.28, at: [at.x, 0.6, at.z] }));
  };
  function onSafety(r: RoverState, e: 'greet' | 'replan' | 'rejoin'): void {
    if (e === 'greet') chirp(r.pos, true);
    else if (e === 'replan') {
      chirp(r.pos, false);
      if (r.safe.byPlayer) replannedByYou([r.pos.x, 0.6, r.pos.z]);
    }
  }
  /** egg 5: every replan you cause, here or at the farm's crate rovers ('life:replan', life/farm.ts) */
  function replannedByYou(at: [number, number, number]): void {
    replansByYou++;
    if (!firstPopup) {
      firstPopup = true;
      ctx.game.juice.popup([at[0], at[1] + 0.75, at[2]], { de: 'A* · neue Route', en: 'A* · new route' }, { tone: 'teal', seconds: 2.2 });
    }
    if (replansByYou >= SAFETY.eggReplans) ctx.game.secrets.find('wackelig', at);
  }
  ctx.events.on('life:replan', (p?: { byPlayer?: boolean; at?: [number, number, number] }) => {
    if (p?.byPlayer && p.at) replannedByYou(p.at);
  });
  // one input object for every rover's safety step (no allocation per frame)
  const INP = { dt: 0, player: new THREE.Vector3(), playerOn: false, others: [] as THREE.Vector3[], rejoin, walkable: onRing };
  const inp = (dt: number, player: THREE.Vector3, on: boolean, walkable: (x: number, z: number) => boolean): typeof INP => {
    INP.dt = dt;
    INP.player.copy(player);
    INP.playerOn = on;
    INP.walkable = walkable;
    return INP;
  };
  // the region reacts (WP12's rotor beats, WP13's lift-off): every rover stops and blinks
  ctx.events.on('life:react', (p?: { kind?: string }) => {
    if (p?.kind !== 'rotor' && p?.kind !== 'liftoff') return;
    for (const r of rovers) {
      r.pause = 1.6;
      r.safe.blinkT = 0.8;
    }
  });

  // tools: the rovers' state, and a spot 2.6 m in front of rover i (to stand in its way)
  ctx.debug.register('life-rovers', () => ({
    replansByYou,
    rovers: rovers.map((r) => ({ pos: [r.pos.x, r.pos.y, r.pos.z].map((v) => Math.round(v * 100) / 100), state: r.safe.state, heading: Math.round(r.heading * 100) / 100 })),
  }));
  for (let i = 0; i < rovers.length; i++)
    ctx.debug.register(`life-rover-front-${i}`, () => {
      const r = rovers[i];
      return [r.pos.x - Math.sin(r.heading) * 2.6, 0, r.pos.z - Math.cos(r.heading) * 2.6];
    });
  const _wq = new THREE.Quaternion();
  return {
    update(dt, player) {
      const h = Math.min(dt, 0.05);
      const playerOn = Math.abs(player.y) < 1.6;
      marks.begin();
      for (const r of rovers) {
        const dx = player.x - r.pos.x,
          dz = player.z - r.pos.z;
        const pd = Math.hypot(dx, dz);
        if (r.pause > 0) {
          r.pause -= h;
          r.safe.blinkT = Math.max(r.safe.blinkT - h, 0);
          r.col.setPose(r.pos, _wq.setFromAxisAngle(Y, r.heading + r.look));
          continue;
        }
        const sNext = rejoinS(r);
        const k = safetyStep(r.safe, inp(h, player, playerOn, r.route.kind === 'ring' ? onRing : onAllee), r.on);
        if (r.safe.state === 'detour') {
          r.look *= Math.exp(-h * 4);
          r.wheel -= (SPEED / 0.13) * h;
          if (followDetour(r.safe, h, SPEED * 0.8)) {
            // back on the loop at the rejoin point
            r.s = sNext;
            r.turning = 0;
            pose(r, h);
          } else r.heading = r.safe.heading;
        } else {
          const near = pd < LOOK_R && playerOn;
          if (k <= 0) {
            // stopped: turn the whole body toward you (slow, damped), then the replan (≤ 2 s)
            if (near) {
              const want = Math.atan2(-dx, -dz) - r.heading;
              const d = Math.atan2(Math.sin(want - r.look), Math.cos(want - r.look));
              r.look += d * (1 - Math.exp(-h * 3));
            }
          } else {
            r.look *= Math.exp(-h * 2);
            if (Math.abs(r.look) < 0.05) {
              const sp = SPEED * k;
              if (r.route.kind === 'ring') {
                r.s += (sp / (r.route.r ?? 46)) * r.dir * h;
                r.wheel -= (sp / 0.13) * h;
              } else if (r.turning > 0) {
                r.turning -= h;
                r.heading += (Math.PI / 2.4) * h;
              } else {
                r.s += sp * r.dir * h;
                r.wheel -= (sp / 0.13) * h;
                if (r.s > ALLEE_LANE.z1 || r.s < ALLEE_LANE.z0) {
                  r.s = THREE.MathUtils.clamp(r.s, ALLEE_LANE.z0, ALLEE_LANE.z1);
                  r.dir = -r.dir;
                  r.turning = 2.4;
                }
              }
            }
            pose(r, h);
          }
        }
        r.safe.heading = r.heading;
        drawMarkings(marks, r.safe, 0.026, playerOn ? pd : Infinity);
        r.col.setPose(r.pos, _wq.setFromAxisAngle(Y, r.heading + r.look));
      }
      marks.end();
      write();
    },
  };
}

function concat(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const total = geos.reduce((a, g) => a + g.getAttribute('position').count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const arr = new Float32Array(total * 3);
    let o = 0;
    for (const g of geos) {
      arr.set(g.getAttribute(name).array as Float32Array, o);
      o += g.getAttribute(name).count * 3;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return out;
}
