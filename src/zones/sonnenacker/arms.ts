/**
 * Sonnenacker — the 12 + 6 real SO-101 arms on rail carriages and their work (plan §4.10, R8 §2.1;
 * C1 m1, m11). WP9 owns the arms and the shift; WP15's life director only listens ('sonnenacker:shift',
 * 'sonnenacker:pick').
 *
 * How they are drawn: ONE template RobotModel (never in the scene) gives the forward kinematics; every
 * arm is one instance in one InstancedMesh per SO-101 body at LOD2 (`ctx.robots.bodies('so101', 2)`,
 * ≈ 7 draws for all 18). The arms nearest to the camera are real RobotModels instead (≤ 1 at LOD0
 * within 6 m, ≤ 2 at LOD1 within 12 m); their crowd instances hide. Carriages, lift masts and status
 * lamps are three more instanced draws on the robots' shared paint.
 *
 * What they do: each arm rides its bed edge and picks cherry tomatoes from its row: travel → approach
 * → close → twist → retract → drop into the tray → nod (a good pick) or a slow head shake (a miss: the
 * fruit stays on the vine). Ambient pace and rate are the research average (one attempt per 33 s, 66 %;
 * Bac et al. 2014 [S17], R9 L2); station C drives the Messbeet's two arms with scripted jobs at the
 * time-lapse of the automated day. Full trays roll down the chute at the bed end. An arm stops while you
 * stand within reach (amber lamp), jams when station C says so, waves on 'life:react' 'liftoff'.
 */
import * as THREE from 'three';
import type { RobotBody, RobotModel, ZoneContext } from '@/core/zones';
import { ARMS, BEDS } from './tuning';
import { TOK, box, merge, paint, post, type Look } from './look';
import type { Field } from './field';
import type { Plane } from './site';

export const JOINTS = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'] as const;
const NJ = JOINTS.length;
/** gripper values (rad): open for the approach, closed on a cherry tomato */
const GRIP_OPEN = 0.95;
const GRIP_SHUT = 0.08;

export type ArmPhase = 'idle' | 'travel' | 'approach' | 'close' | 'twist' | 'retract' | 'drop' | 'home' | 'nod' | 'shake' | 'unload' | 'jammed' | 'parked' | 'wave' | 'hesitate';

/** A scripted pick (station C): the fruit, its decided outcome, the speed of the time-lapse. */
export interface PickJob {
  fruit: number;
  ok: boolean;
  damaged: boolean;
  /** motion speed factor (1 = ambient pace) */
  speed: number;
  /** called when the outcome is visible (after the twist) */
  onResult?: (ok: boolean, damaged: boolean) => void;
}

export interface Arm {
  readonly id: number;
  /** „Arm 1“ … „Arm 18“ */
  readonly label: number;
  readonly roof: 'a' | 'b';
  readonly row: number;
  readonly side: -1 | 1;
  /** the carriage's z on the rail and its lift (0…1) */
  z: number;
  lift: number;
  phase: ArmPhase;
  readonly q: Float32Array;
  /** fruits in the tray */
  tray: number;
  jammed: boolean;
  paused: boolean;
  /** the arm's next fruit (for E „Kamera ansehen“), −1 none */
  next: number;
  /** placement of the arm base (zone-local) */
  readonly base: THREE.Matrix4;
}

export interface Arms {
  readonly list: readonly Arm[];
  /** robots loaded (crowd and template) */
  readonly ready: boolean;
  readonly failed: boolean;
  /** retry loading (robots:retry) */
  retry(): void;
  /** 'ambient' (the farm's shift) or 'day' (station C's time-lapse: the Messbeet's arms take jobs only) */
  setMode(mode: 'ambient' | 'day' | 'pause'): void;
  /** queue a scripted pick for an arm (station C); the arm travels there first */
  job(arm: number, job: PickJob): void;
  /** jobs still queued or running for an arm */
  busy(arm: number): boolean;
  jam(arm: number, on: boolean): void;
  /** park an arm at z in a camera pose looking down at `look` (zone-local; station A), or release it (null) */
  park(arm: number, z: number | null, look?: THREE.Vector3): void;
  /** every arm raises its gripper and waves (life:react 'liftoff') */
  wave(): void;
  /** world position of an arm's carriage (labels, calls) */
  carriageWorld(arm: number, out?: THREE.Vector3): THREE.Vector3;
  /** zone-local position of an arm's gripper tip */
  tipLocal(arm: number, out?: THREE.Vector3): THREE.Vector3;
  /** the heart-shaped tomato (egg 24): its z on row 0 while it lies there, else null */
  setHeart(z: number | null): void;
  /** on picks (ambient and scripted): ok, damaged, where (zone-local) */
  onPick(fn: (arm: Arm, ok: boolean, damaged: boolean, at: THREE.Vector3, sample: number) => void): () => void;
  /** trays rolling into a crate */
  onUnload(fn: (arm: Arm, n: number, at: THREE.Vector3) => void): () => void;
  update(dt: number): void;
  /** the hit boxes of the carriages (interactables „Kamera ansehen“) */
  readonly hits: THREE.Mesh[];
  /** Sonnendach B seen from far: its six arms are not drawn (the crowd's tail instances) */
  setFarB(farB: boolean): void;
  /** stats (tools): crowd draws, near models, ms */
  stats(): { draws: number; near: number; crowd: number; bodies: number; ready: boolean };
}

interface ArmState extends Arm {
  dir: 1 | -1;
  t: number;
  dur: number;
  from: Float32Array;
  to: Float32Array;
  /** solutions for the current fruit: before it and at it */
  pre: Float32Array;
  at: Float32Array;
  target: number;
  jobs: PickJob[];
  job: PickJob | null;
  /** ambient: seconds left of the current cycle, the outcome sequence position */
  cycle: number;
  seq: number;
  ok: boolean;
  damaged: boolean;
  wave: number;
  hesitated: boolean;
  parkZ: number | null;
  /** tray positions taken */
  liftTarget: number;
  zTarget: number;
  acc: number;
  nearModel: RobotModel | null;
  carried: boolean;
  /** motion speed of the current pick (1 ambient; the day's time-lapse is faster) */
  speedNow: number;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

export function buildArms(ctx: ZoneContext, look: Look, field: Field, plane: Plane, detail: THREE.Object3D): Arms {
  const group = new THREE.Group();
  group.name = 'sonnenacker:arms';
  detail.add(group);
  const rowsA = field.rows.map((r, i) => ({ r, i })).filter((x) => x.r.roof === 'a');
  const rowsB = field.rows.map((r, i) => ({ r, i })).filter((x) => x.r.roof === 'b' && x.r.side === -1);
  const list: ArmState[] = [];
  const mk = (ri: number, roof: 'a' | 'b'): void => {
    const r = field.rows[ri];
    const id = list.length;
    const q = new Float32Array(NJ);
    list.push({
      id,
      label: id + 1,
      roof,
      row: ri,
      side: r.side,
      z: r.z0 + 1 + ((id * 7.3) % (r.z1 - r.z0 - 2)),
      lift: 0.4,
      phase: 'idle',
      q,
      tray: 0,
      jammed: false,
      paused: false,
      next: -1,
      base: new THREE.Matrix4(),
      dir: id % 2 ? 1 : -1,
      t: 0,
      dur: 1,
      from: new Float32Array(NJ),
      to: new Float32Array(NJ),
      pre: new Float32Array(NJ),
      at: new Float32Array(NJ),
      target: -1,
      jobs: [],
      job: null,
      cycle: (id * 4.1) % ARMS.ambientCycleS,
      seq: id * 3,
      ok: false,
      damaged: false,
      wave: 0,
      hesitated: false,
      parkZ: null,
      liftTarget: 0.4,
      zTarget: 0,
      acc: 0,
      nearModel: null,
      carried: false,
      speedNow: 1,
    });
  };
  for (const { i } of rowsA) mk(i, 'a');
  for (const { i } of rowsB) mk(i, 'b');
  const NA = list.length;

  // ── the base placement: on the lift mast, outside the bed edge, facing the bed ──────────────
  const Y = new THREE.Vector3(0, 1, 0);
  const qYaw = [new THREE.Quaternion().setFromAxisAngle(Y, Math.PI / 2), new THREE.Quaternion().setFromAxisAngle(Y, -Math.PI / 2)];
  const baseX = (a: ArmState): number => {
    const r = field.rows[a.row];
    const bedX = r.x - r.side * (BEDS.width / 2 - BEDS.rowInset);
    return bedX + a.side * (BEDS.width / 2 + ARMS.baseOut);
  };
  const baseY = (a: ArmState): number => plane.at(baseX(a), a.z) + ARMS.liftY[0] + (ARMS.liftY[1] - ARMS.liftY[0]) * a.lift;
  const _p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const placeBase = (a: ArmState): void => {
    _p.set(baseX(a), baseY(a), a.z);
    // side −1 (south edge): the bed is north (+x) → model +z to local +x
    a.base.compose(_p, a.side === -1 ? qYaw[0] : qYaw[1], one);
  };
  for (const a of list) placeBase(a);

  // ── carriages, lift masts with the tray, status lamps (instanced paint) ─────────────────────
  // a low alu carriage on the rail (carbon wheels), the telescopic lift: a sleeve on the carriage, the mast
  // that rides up to the base plate, and the small tray on a bracket at the path side
  const carGeo = merge([
    paint(box(0.2, 0.07, 0.3, 0, 0, 0), TOK.alu),
    paint(box(0.06, 0.05, 0.32, 0.07, -0.055, 0), TOK.carbon),
    paint(box(0.06, 0.05, 0.32, -0.07, -0.055, 0), TOK.carbon),
    paint(box(0.07, 0.3, 0.07, 0, 0.18, 0), TOK.carbon),
  ]);
  const mastGeo = merge([
    paint(post(0.022, 0.66, 0, -0.66, 0, 8), TOK.alu),
    paint(box(0.13, 0.025, 0.13, 0, -0.0125, 0), TOK.carbon),
    paint(box(0.03, 0.015, 0.16, 0, -0.06, -0.14), TOK.alu),
    paint(box(0.17, 0.03, 0.13, 0, -0.06, -0.28), TOK.timberFresh),
  ]);
  const lampGeo = paint(new THREE.SphereGeometry(0.026, 10, 6), 0xffffff);
  const carriages = new THREE.InstancedMesh(carGeo, look.paint, NA);
  const masts = new THREE.InstancedMesh(mastGeo, look.paint, NA);
  const lamps = new THREE.InstancedMesh(lampGeo, look.paint, NA);
  carriages.name = 'sonnenacker:carriages';
  masts.name = 'sonnenacker:masts';
  lamps.name = 'sonnenacker:lamps';
  for (const m of [carriages, masts, lamps]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = m !== lamps;
    m.receiveShadow = true;
    m.frustumCulled = false;
    group.add(m);
  }
  const lampTeal = new THREE.Color(TOK.teal).multiplyScalar(1.15);
  const lampAmber = new THREE.Color(TOK.amber);
  for (let k = 0; k < NA; k++) lamps.setColorAt(k, lampTeal);
  // invisible hit boxes on the carriages: „Kamera ansehen“ (station C) and the help calls
  const hitGeo = new THREE.BoxGeometry(0.5, 0.9, 0.6);
  const hits: THREE.Mesh[] = list.map((a) => {
    const m = new THREE.Mesh(hitGeo, look.mat(TOK.white));
    m.visible = false;
    m.name = `sonnenacker:arm-hit-${a.label}`;
    m.userData.noMerge = true;
    group.add(m);
    return m;
  });
  ctx.onDispose(() => {
    for (const g of [carGeo, mastGeo, lampGeo, hitGeo]) g.dispose();
    for (const m of [carriages, masts, lamps]) m.dispose();
  });

  // ── the robots: template, crowd bodies, near models ─────────────────────────────────────────
  let template: RobotModel | null = null;
  let bodies: readonly RobotBody[] = [];
  let crowd: THREE.InstancedMesh[] = [];
  let links: THREE.Object3D[] = [];
  const near: { model: RobotModel; lod: 0 | 1; arm: number }[] = [];
  let ready = false;
  let failed = false;
  /** instances drawn (Sonnendach B's six are the tail) */
  let drawn = NA;
  let loading = false;
  const load = (): void => {
    if (loading || ready) return;
    loading = true;
    failed = false;
    ctx.robots.prefetch(['so101']);
    void Promise.all([ctx.robots.load('so101', { castShadow: true }), ctx.robots.bodies('so101', 2)])
      .then(async ([tpl, b]) => {
        template = tpl;
        ctx.robots.untrack(tpl);
        bodies = b;
        crowd = b.map((body) => {
          const m = new THREE.InstancedMesh(body.geometry, look.paint, NA);
          m.name = `sonnenacker:so101-${body.link}`;
          m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          m.castShadow = true;
          m.receiveShadow = true;
          m.frustumCulled = false;
          m.count = drawn;
          group.add(m);
          return m;
        });
        links = b.map((body) => tpl.linkNode(body.link) ?? tpl.object);
        solveRest();
        ready = true;
        loading = false;
        // the near models: one at LOD0, two at LOD1 (plan §4.10); they appear once loaded
        const want: (0 | 1)[] = [...Array(ARMS.maxLod0).fill(0), ...Array(ARMS.maxLod1).fill(1)];
        for (const lod of want) {
          const m = await ctx.robots.load('so101', { castShadow: true, lod });
          ctx.robots.untrack(m);
          m.lod = lod;
          m.object.visible = false;
          group.add(m.object);
          near.push({ model: m, lod, arm: -1 });
        }
      })
      .catch((err) => {
        loading = false;
        failed = true;
        console.warn('[sonnenacker] SO-101 not loaded', err);
      });
  };
  load();

  // ── IK in the template's frame (the template stands at the origin, never in the scene) ──────
  const inv = new THREE.Matrix4();
  const tgt = new THREE.Vector3();
  const READY = new Float32Array(NJ);
  const TRAY = new Float32Array(NJ);
  const UP = new Float32Array(NJ);
  const CAM = new Float32Array(NJ);
  const solve = (target: THREE.Vector3, out: Float32Array, seed: Float32Array): boolean => {
    const t = template;
    if (!t) {
      out.set(seed);
      return false;
    }
    for (let j = 0; j < NJ; j++) t.setJoint(JOINTS[j], seed[j]);
    const r = t.solveIK('arm', target, { iterations: 28, tolerance: 0.004 });
    for (let j = 0; j < NJ; j++) out[j] = t.getJoint(JOINTS[j]);
    out[5] = seed[5];
    return r.reached || r.error < 0.03;
  };
  /** the fixed poses in the model frame (y up, the bed in front = +z) */
  const solveRest = (): void => {
    const z = new Float32Array(NJ);
    z[5] = GRIP_OPEN;
    solve(new THREE.Vector3(0, 0.26, 0.12), READY, z);
    READY[5] = GRIP_OPEN;
    // the tray sits behind-left of the base (the path side, model −z, slightly −x)
    solve(new THREE.Vector3(-0.05, 0.12, -0.2), TRAY, READY);
    TRAY[5] = GRIP_SHUT;
    solve(new THREE.Vector3(0, 0.42, 0.02), UP, READY);
    UP[5] = GRIP_OPEN;
    solve(new THREE.Vector3(0, 0.16, 0.24), CAM, READY);
    CAM[5] = GRIP_OPEN;
    for (const a of list) a.q.set(READY);
  };
  /** IK for a fruit (zone-local): the grasp and a point 7 cm before it */
  const fruitPos = new THREE.Vector3();
  const solveFruit = (a: ArmState, fi: number): boolean => {
    const f = field.fruit[fi];
    placeBase(a);
    inv.copy(a.base).invert();
    fruitPos.set(f.x, f.y, f.z);
    tgt.copy(fruitPos).applyMatrix4(inv);
    const okAt = solve(tgt, a.at, READY);
    // the approach: back along the line base → fruit and a little higher
    const back = tgt.clone().multiplyScalar(0.78).add(new THREE.Vector3(0, 0.03, 0));
    solve(back, a.pre, a.at);
    a.pre[5] = GRIP_OPEN;
    a.at[5] = GRIP_OPEN;
    return okAt;
  };

  const go = (a: ArmState, to: Float32Array, dur: number, phase: ArmPhase): void => {
    a.from.set(a.q);
    a.to.set(to);
    a.t = 0;
    a.dur = Math.max(0.05, dur);
    a.phase = phase;
  };

  // ── loose fruit: the one in the gripper (slot = arm) and the tray (18 + arm·12 + n) ──────────
  const tipM = new THREE.Matrix4();
  const trayM = new THREE.Matrix4();
  const tipOf = (a: ArmState, out: THREE.Vector3): THREE.Vector3 => {
    if (!template) return out.set(baseX(a), baseY(a) + 0.2, a.z);
    const n = template.linkNode('gripper_frame_link');
    if (!n) return out.set(baseX(a), baseY(a), a.z);
    tipM.multiplyMatrices(a.base, n.matrixWorld);
    return out.setFromMatrixPosition(tipM);
  };
  const traySlot = (a: ArmState, n: number, out: THREE.Matrix4): THREE.Matrix4 => {
    const tx = ((n % 4) - 1.5) * 0.04,
      tz = (Math.floor(n / 4) - 1) * 0.04;
    // the tray on the mast (model −z), in the base's frame
    out.makeTranslation(tx, -0.03, -0.3 + tz);
    return out.premultiply(a.base);
  };

  // ── per-frame pose → instance matrices ─────────────────────────────────────────────────────
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const mm = new THREE.Matrix4();
  const rotS = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  const rotN = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
  const carM = new THREE.Matrix4();
  const tv = new THREE.Vector3();
  const pose = (a: ArmState, showCrowd: boolean): void => {
    placeBase(a);
    // carriage on the rail, the mast to the base height
    const r = field.rows[a.row];
    const railX = r.x - r.side * (BEDS.width / 2 - BEDS.rowInset) + a.side * BEDS.railOffset;
    const g0 = plane.at(railX, a.z);
    carM.makeTranslation(railX + a.side * 0.05, g0 + BEDS.railY + 0.02, a.z);
    carriages.setMatrixAt(a.id, carM);
    mm.makeTranslation(baseX(a), baseY(a), a.z);
    masts.setMatrixAt(a.id, mm.multiply(a.side === -1 ? rotS : rotN));
    mm.makeTranslation(railX + a.side * 0.05, g0 + BEDS.railY + 0.13, a.z + 0.19);
    lamps.setMatrixAt(a.id, mm);
    hits[a.id].position.set(baseX(a), baseY(a) - 0.2, a.z);
    hits[a.id].updateMatrixWorld();
    if (!template || !ready) return;
    for (let j = 0; j < NJ; j++) template.setJoint(JOINTS[j], a.q[j]);
    template.object.updateMatrixWorld(true);
    if (showCrowd) for (let b = 0; b < crowd.length; b++) crowd[b].setMatrixAt(a.id, mm.multiplyMatrices(a.base, links[b].matrixWorld));
    else for (let b = 0; b < crowd.length; b++) crowd[b].setMatrixAt(a.id, zero);
    // the fruit in the gripper follows the tip
    if (a.carried) {
      tipOf(a, tv);
      field.loose(a.id, mm.makeTranslation(tv.x, tv.y - 0.012, tv.z));
    }
  };

  // ── listeners ────────────────────────────────────────────────────────────────────────────
  const pickFns = new Set<(arm: Arm, ok: boolean, damaged: boolean, at: THREE.Vector3, sample: number) => void>();
  const unloadFns = new Set<(arm: Arm, n: number, at: THREE.Vector3) => void>();
  const at = new THREE.Vector3();

  let mode: 'ambient' | 'day' | 'pause' = 'ambient';
  let heartZ: number | null = null;
  const playerLocal = new THREE.Vector3();
  const camW = new THREE.Vector3();
  const camL = new THREE.Vector3();

  /** an arm's next ambient fruit: the nearest ripe one ahead, else turn round */
  const seek = (a: ArmState): number => {
    const reachZ = 5;
    let fi = field.nextRipe(a.row, a.z, a.dir, reachZ);
    if (fi < 0) {
      a.dir = (a.dir * -1) as 1 | -1;
      fi = field.nextRipe(a.row, a.z, a.dir, reachZ);
    }
    return fi;
  };

  /** start a pick of fruit fi (the outcome is decided now: a.ok / a.damaged) */
  const startPick = (a: ArmState, fi: number, speed: number): void => {
    a.speedNow = speed;
    a.target = fi;
    field.fruit[fi].claimed = true;
    a.next = fi;
    a.zTarget = field.fruit[fi].z;
    const f = field.fruit[fi];
    a.liftTarget = THREE.MathUtils.clamp((f.y - 0.1 - plane.at(baseX(a), f.z) - ARMS.liftY[0]) / (ARMS.liftY[1] - ARMS.liftY[0]), 0, 1);
    go(a, READY, Math.max(0.2, Math.min(1.2, Math.abs(a.z - a.zTarget) / (speed > 1 ? ARMS.railSpeedDay : ARMS.railSpeed))), 'travel');
  };

  const ambientDraw = (a: ArmState): boolean => {
    // a low-discrepancy draw per arm: the farm hits the research average without luck streaks
    a.seq++;
    const u = (0.31 + a.seq * 0.6180339887 + a.id * 0.137) % 1;
    return u < ARMS.ambientSuccess;
  };

  const finishResult = (a: ArmState): void => {
    const fi = a.target;
    const f = field.fruit[fi];
    at.set(f.x, f.y, f.z);
    for (const fn of pickFns) fn(a, a.ok, a.damaged, at, f.sample);
    a.job?.onResult?.(a.ok, a.damaged);
  };

  const stepArm = (a: ArmState, dt: number): void => {
    // nothing moves before the SO-101 is in (the carriages wait on their rails)
    if (!ready || !template) return;
    // the player within reach: the arm holds still (robots yield to people, R9 L5)
    const dx = playerLocal.x - baseX(a),
      dz = playerLocal.z - a.z;
    const wasPaused = a.paused;
    a.paused = !a.jammed && a.phase !== 'parked' && Math.hypot(dx, dz) < ARMS.yieldM && Math.abs(playerLocal.y - baseY(a)) < 2.2;
    if (a.paused !== wasPaused) lamps.setColorAt(a.id, a.paused ? lampAmber : lampTeal);
    if (a.paused) return;
    if (a.wave > 0) {
      a.wave -= dt;
      const w = Math.sin((ARMS.waveS - a.wave) * 9) * 0.7;
      a.q.set(UP);
      a.q[4] = UP[4] + w;
      if (a.wave <= 0) go(a, READY, 0.6, 'home');
      return;
    }
    if (a.jammed) {
      // stuck: the gripper twitches against the fruit (a small, slow tremor; no flashing)
      a.q[3] = a.to[3] + Math.sin(ctx.time.elapsed * 6 + a.id) * 0.03;
      return;
    }
    const speed = a.speedNow;
    const M = ARMS.motion;
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    const e = smooth(k);
    switch (a.phase) {
      case 'parked':
        a.z += (a.zTarget - a.z) * Math.min(1, dt * 3);
        a.lift += (0.55 - a.lift) * Math.min(1, dt * 3);
        for (let j = 0; j < NJ; j++) a.q[j] = a.from[j] + (a.to[j] - a.from[j]) * e;
        return;
      case 'idle': {
        // scan: the wrist camera looks along the row
        a.q[0] = READY[0] + Math.sin(ctx.time.elapsed * 0.7 + a.id) * 0.25;
        a.q[3] = READY[3] + Math.sin(ctx.time.elapsed * 0.9 + a.id * 2) * 0.12;
        if (a.jobs.length) {
          a.job = a.jobs.shift()!;
          startPick(a, a.job.fruit, a.job.speed);
          return;
        }
        if (mode !== 'ambient' && !(mode === 'day' && !isMess(a))) return;
        a.cycle -= dt * (mode === 'day' ? 12 : 1);
        if (a.cycle > 0) return;
        a.cycle = ARMS.ambientCycleS;
        const fi = seek(a);
        if (fi < 0) {
          a.cycle = 4;
          return;
        }
        a.job = null;
        a.ok = ambientDraw(a);
        a.damaged = false;
        startPick(a, fi, mode === 'day' ? 8 : 1);
        return;
      }
      case 'travel': {
        const d = a.zTarget - a.z;
        a.z += Math.sign(d) * Math.min(Math.abs(d), dt * (a.speedNow > 1 ? ARMS.railSpeedDay : ARMS.railSpeed));
        a.lift += (a.liftTarget - a.lift) * Math.min(1, dt * 3 * a.speedNow);
        for (let j = 0; j < NJ; j++) a.q[j] = a.from[j] + (a.to[j] - a.from[j]) * e;
        // egg 24: an arm of row 0 passing the heart-shaped tomato hesitates once (out of distribution)
        if (heartZ != null && a.id === 0 && !a.hesitated && Math.abs(a.z - heartZ) < 0.35) {
          a.hesitated = true;
          go(a, CAM, 1.6, 'hesitate');
          return;
        }
        if (k >= 1 && Math.abs(a.zTarget - a.z) < 1e-3) {
          if (a.job) {
            a.ok = a.job.ok;
            a.damaged = a.job.damaged;
          }
          const reachable = solveFruit(a, a.target);
          if (!reachable && !a.job) {
            field.fruit[a.target].claimed = false;
            go(a, READY, 0.4, 'home');
            return;
          }
          go(a, a.pre, M.approach / speed, 'approach');
        }
        return;
      }
      case 'hesitate':
        a.q[4] = CAM[4] + Math.sin(a.t * 5) * 0.35 * Math.min(1, a.t);
        if (a.t >= a.dur) go(a, READY, 0.8, 'travel');
        return;
      case 'approach':
        for (let j = 0; j < NJ; j++) a.q[j] = a.from[j] + (a.to[j] - a.from[j]) * e;
        if (k >= 1) go(a, a.at, (M.approach * 0.35) / speed, 'close');
        return;
      case 'close': {
        for (let j = 0; j < 5; j++) a.q[j] = a.from[j] + (a.to[j] - a.from[j]) * e;
        a.q[5] = GRIP_OPEN + (GRIP_SHUT - GRIP_OPEN) * smooth(Math.max(0, (k - 0.55) / 0.45));
        if (k >= 1) {
          // take the fruit into the gripper (also on a miss: it slips at the twist)
          field.take(a.target, false);
          field.loose(a.id, null, field.fruit[a.target].ripe);
          a.carried = true;
          go(a, a.q, M.twist / speed, 'twist');
          a.to.set(a.q);
        }
        return;
      }
      case 'twist':
        a.q[4] = a.to[4] + Math.sin(k * Math.PI * 2) * 0.7;
        if (k >= 1) {
          a.q[4] = a.to[4];
          if (!a.ok) {
            // the fruit slips back onto the vine: a miss stays for the people (Nachlese)
            a.carried = false;
            field.loose(a.id, null);
            const f = field.fruit[a.target];
            f.state = 0;
            f.claimed = false;
            field.setRipe(a.target, f.ripe);
          }
          finishResult(a);
          go(a, a.pre, M.retract / speed, 'retract');
        }
        return;
      case 'retract':
        for (let j = 0; j < NJ; j++) a.q[j] = a.from[j] + (a.to[j] - a.from[j]) * e;
        if (k >= 1) {
          if (a.ok) go(a, TRAY, M.drop / speed, 'drop');
          else {
            go(a, READY, ARMS.shakeS / speed, 'shake');
          }
        }
        return;
      case 'drop':
        for (let j = 0; j < 5; j++) a.q[j] = a.from[j] + (a.to[j] - a.from[j]) * e;
        if (k >= 1) {
          a.carried = false;
          field.loose(a.id, null);
          if (!a.damaged) {
            const slot = field.looseCount > 18 + a.id * 12 + a.tray ? 18 + a.id * 12 + Math.min(11, a.tray) : -1;
            if (slot >= 0) field.loose(slot, traySlot(a, a.tray, trayM), field.fruit[a.target].ripe);
            a.tray++;
          }
          // a picked slot regrows later (the ambient farm); the Messbeet's sample does not
          if (field.fruit[a.target].sample < 0) field.take(a.target, true);
          a.q[5] = GRIP_OPEN;
          go(a, READY, ARMS.nodS / speed + 0.25, 'nod');
        }
        return;
      case 'nod':
        for (let j = 0; j < NJ; j++) a.q[j] = a.from[j] + (a.to[j] - a.from[j]) * e;
        a.q[3] += Math.sin(k * Math.PI) * 0.22;
        if (k >= 1) endCycle(a);
        return;
      case 'shake':
        for (let j = 0; j < NJ; j++) a.q[j] = a.from[j] + (a.to[j] - a.from[j]) * e;
        a.q[0] += Math.sin(k * Math.PI * 4) * 0.12 * (1 - k);
        if (k >= 1) endCycle(a);
        return;
      case 'home':
        for (let j = 0; j < NJ; j++) a.q[j] = a.from[j] + (a.to[j] - a.from[j]) * e;
        if (k >= 1) endCycle(a);
        return;
      case 'unload': {
        // ride to the bed's east end, tip the tray into the chute
        const r = field.rows[a.row];
        const zEnd = r.z1 - 0.3;
        a.z += Math.sign(zEnd - a.z) * Math.min(Math.abs(zEnd - a.z), dt * (speed > 1 ? ARMS.railSpeedDay : ARMS.railSpeed * 2));
        if (Math.abs(zEnd - a.z) < 0.02 && a.t > 0.3) {
          for (let n = 0; n < 12; n++) field.loose(18 + a.id * 12 + n, null);
          at.set(baseX(a), baseY(a), zEnd + 0.8);
          for (const fn of unloadFns) fn(a, a.tray, at);
          a.tray = 0;
          a.phase = 'idle';
        } else for (let n = 0; n < Math.min(12, a.tray); n++) field.loose(18 + a.id * 12 + n, traySlot(a, n, trayM));
        return;
      }
      default:
        return;
    }
  };
  const isMess = (a: ArmState): boolean => a.roof === 'a' && (a.row === field.mess.rows[0] || a.row === field.mess.rows[1]);
  const endCycle = (a: ArmState): void => {
    a.job = null;
    a.target = -1;
    a.next = -1;
    a.cycle = mode === 'day' ? 0.4 : Math.max(2, ARMS.ambientCycleS - 6);
    if (a.tray >= ARMS.trayFruits) {
      a.phase = 'unload';
      a.t = 0;
    } else a.phase = 'idle';
  };

  // ── update tiers: within ARMS.nearM every frame, else round robin ───────────────────────────
  let rr = 0;
  const nearOf = new Int8Array(NA).fill(-1);
  const dist = new Float32Array(NA);
  const order = list.map((_, i) => i);
  return {
    list,
    get ready() {
      return ready;
    },
    get failed() {
      return failed;
    },
    hits,
    retry() {
      if (!ready) load();
    },
    setMode(m) {
      mode = m;
    },
    job(arm, j) {
      const a = list[arm];
      a.jobs.push(j);
    },
    busy(arm) {
      const a = list[arm];
      return a.jobs.length > 0 || !!a.job;
    },
    jam(arm, on) {
      const a = list[arm];
      a.jammed = on;
      lamps.setColorAt(a.id, on ? lampAmber : lampTeal);
      if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
    },
    park(arm, z, look) {
      const a = list[arm];
      if (z == null) {
        if (a.phase === 'parked') go(a, READY, 0.6, 'home');
        a.parkZ = null;
        return;
      }
      a.parkZ = z;
      a.zTarget = z;
      if (a.target >= 0 && field.fruit[a.target]) field.fruit[a.target].claimed = false;
      a.carried = false;
      field.loose(a.id, null);
      a.job = null;
      a.jobs.length = 0;
      let pose = CAM;
      if (look && template && ready) {
        // the wrist camera over the point: IK to 18 cm above it, in the base's frame at the parked z
        const z0 = a.z;
        a.z = z;
        a.lift = 0.55;
        placeBase(a);
        tgt.copy(look).add(new THREE.Vector3(0, 0.2, 0)).applyMatrix4(inv.copy(a.base).invert());
        a.z = z0;
        pose = new Float32Array(NJ);
        solve(tgt, pose, CAM);
        pose[5] = GRIP_OPEN;
      }
      go(a, pose, 0.8, 'parked');
    },
    wave() {
      if (ctx.settings.reducedMotion) return;
      for (const a of list) if (!a.jammed && a.phase !== 'parked') a.wave = ARMS.waveS;
    },
    carriageWorld(arm, out = new THREE.Vector3()) {
      const a = list[arm];
      return ctx.toWorld([baseX(a), baseY(a), a.z], out);
    },
    tipLocal(arm, out = new THREE.Vector3()) {
      const a = list[arm];
      if (template && ready) {
        for (let j = 0; j < NJ; j++) template.setJoint(JOINTS[j], a.q[j]);
        template.object.updateMatrixWorld(true);
      }
      return tipOf(a, out);
    },
    setHeart(z) {
      heartZ = z;
      list[0].hesitated = false;
    },
    onPick(fn) {
      pickFns.add(fn);
      return () => pickFns.delete(fn);
    },
    onUnload(fn) {
      unloadFns.add(fn);
      return () => unloadFns.delete(fn);
    },
    update(dt) {
      ctx.player.positionLocal(playerLocal);
      ctx.camera.getWorldPosition(camW);
      ctx.toLocal(camW, camL);
      // which arms are near: distance from the camera to the base
      for (let i = 0; i < NA; i++) {
        const a = list[i];
        dist[i] = Math.hypot(camL.x - baseX(a), camL.y - baseY(a), camL.z - a.z);
      }
      // assign the near models: the nearest within lod0M gets LOD0, the next within lod1M LOD1
      nearOf.fill(-1);
      if (near.length) {
        order.sort((x, y) => dist[x] - dist[y]);
        let o = 0;
        // (near is LOD0 first: an arm beyond lod0M can still take a LOD1 model)
        for (const n of near) {
          const arm = o < order.length && dist[order[o]] <= (n.lod === 0 ? ARMS.lod0M : ARMS.lod1M) ? order[o++] : -1;
          n.arm = arm;
          if (arm >= 0) nearOf[arm] = near.indexOf(n);
          n.model.object.visible = arm >= 0;
        }
      }
      const midDt = 1 / ARMS.midHz;
      for (let i = 0; i < NA; i++) {
        const a = list[i];
        const isNear = dist[i] < ARMS.nearM || a.job != null || a.jobs.length > 0;
        if (isNear) {
          stepArm(a, Math.min(dt, 0.1));
          a.acc = 0;
        } else {
          a.acc += dt;
          if ((i + rr) % 3 !== 0 || a.acc < midDt) continue;
          stepArm(a, Math.min(a.acc, 0.25));
          a.acc = 0;
        }
        const n = nearOf[i];
        pose(a, n < 0);
        if (n >= 0) {
          const nm = near[n].model;
          nm.object.position.setFromMatrixPosition(a.base);
          nm.object.quaternion.setFromRotationMatrix(a.base);
          for (let j = 0; j < NJ; j++) nm.setJoint(JOINTS[j], a.q[j]);
        }
      }
      rr++;
      carriages.instanceMatrix.needsUpdate = true;
      masts.instanceMatrix.needsUpdate = true;
      lamps.instanceMatrix.needsUpdate = true;
      if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
      for (const c of crowd) c.instanceMatrix.needsUpdate = true;
      field.flush();
    },
    setFarB(farB) {
      drawn = farB ? list.filter((a) => a.roof === 'a').length : NA;
      for (const m of [...crowd, carriages, masts, lamps]) m.count = drawn;
    },
    stats: () => ({ draws: crowd.length + 3 + near.filter((n) => n.arm >= 0).length, near: near.filter((n) => n.arm >= 0).length, crowd: NA, bodies: bodies.length, ready }),
  };
}
