/**
 * Scene 1 of the Kreislaufhof (plan §4.11, R8 §3.1, C2 M6): the sorting line. 100 pieces of packaging ride
 * the belt under a camera arch; the camera scores each one („how sure is it aluminium?“, a teal number:
 * data, rule 6) and a generic delta picker (three arms, parallelogram rods, a suction cup; real delta
 * kinematics, no product) grabs every piece at or above YOUR threshold into the aluminium bin. The
 * threshold is a live slider while the belt runs: purity and recovery move under your hand. After 100
 * pieces you set the threshold you stand by; the result is judged at it over all 100 (sim.ts).
 *
 * Draws while the line is in view: the belt slats 1, the pieces 2 (cylinders, boxes), the picker 3 (upper
 * arms, rods, effector), the scan bar 1; the frame and the bins are merged with the hall's statics.
 */
import * as THREE from 'three';
import { css, type LoopHandle, type Text, type ZoneContext } from '@/core/zones';
import type { Hall } from './hall';
import { K } from './tuning';
import { countsAt, crossing, curves, judge, makeStream, solvable, type Kind, type Piece, type SortResult } from './sim';

export interface LineShared {
  emiSay(t: Text, now?: boolean): void;
  /** the station challenge's goal chips (for the console's top row) */
  chips(): HTMLElement;
  /** a run was judged at the player's threshold */
  onRun(r: SortResult): void;
  refreshObjective(): void;
}

export interface Line {
  update(dt: number): void;
  /** enter operate mode at the console */
  open(): void;
  /** leave operate mode (if the console is open) */
  close(): void;
  /** finish a run at once (the solve hooks): ★★★ when `best` */
  solve(best: boolean): SortResult;
  readonly last: SortResult | null;
  readonly phase: 'idle' | 'running' | 'measured' | 'judged';
  readonly console: THREE.Object3D;
  stats(): Record<string, unknown>;
}

type SlotState = 'wait' | 'drop' | 'belt' | 'held' | 'fly' | 'bin' | 'rest';
interface Slot {
  state: SlotState;
  p: THREE.Vector3;
  /** decided at the camera: picked or not */
  decided: boolean;
  pick: boolean;
  arrival: number;
  fly: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; into: 'bin' | 'rest' } | null;
  yaw: number;
  mesh: 0 | 1;
  inst: number;
}

/** how a kind looks: mesh (0 cylinder lying across the belt, 1 box), size (m) and colour; × SCALE for legibility */
const SCALE = 1.35;
const LOOK: Record<Kind, { mesh: 0 | 1; size: [number, number, number]; color: number }> = {
  alu: { mesh: 0, size: [0.033, 0.122, 0.033], color: 0xdfe2e4 },
  'alu-crushed': { mesh: 0, size: [0.036, 0.085, 0.03], color: 0xbfc2c3 },
  tin: { mesh: 0, size: [0.038, 0.11, 0.038], color: 0xa7adb0 },
  pet: { mesh: 0, size: [0.034, 0.24, 0.034], color: 0xb4c8cc },
  cup: { mesh: 0, size: [0.042, 0.075, 0.042], color: 0xf0eee8 },
  carton: { mesh: 1, size: [0.18, 0.066, 0.074], color: 0xe2dccf },
  film: { mesh: 1, size: [0.16, 0.022, 0.13], color: 0xc9c4bb },
};

const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _qa = new THREE.Quaternion(),
  _s = new THREE.Vector3(),
  _v = new THREE.Vector3(),
  _w = new THREE.Vector3(),
  _r0 = new THREE.Vector3(),
  _r1 = new THREE.Vector3(),
  X = new THREE.Vector3(1, 0, 0),
  Zv = new THREE.Vector3(0, 0, 1),
  Y = new THREE.Vector3(0, 1, 0),
  ZERO = new THREE.Vector3(0, 0, 0);

export function buildLine(ctx: ZoneContext, hall: Hall, S: LineShared): Line {
  const L = K.line;
  const F = hall.floor;
  const det = ctx.groups.detail;
  const T = (k: string, p?: Record<string, string | number>): Text => ctx.i18n.text(k, p);
  const num = (v: number, d = 2): string => ctx.i18n.num(v, d);
  const geos: THREE.BufferGeometry[] = [];
  const G = <T2 extends THREE.BufferGeometry>(g: T2): T2 => (geos.push(g), g);
  ctx.onDispose(() => geos.forEach((g) => g.dispose()));
  const m = hall.mat;
  const by = F + L.y;

  // ── the static line: belt frame and bed, hopper, camera arch, picker frame, bins, the console ──
  const len = L.x1 - L.x0;
  const cx = (L.x0 + L.x1) / 2;
  hall.box(det, [len + 1.2, 0.18, L.width + 0.16], [cx, L.y - 0.12, L.z], m.steel, { collide: true });
  hall.box(det, [len + 1.0, 0.05, L.width], [cx, L.y - 0.025, L.z], m.rubber);
  for (const s of [-1, 1]) hall.box(det, [len + 1.2, 0.07, 0.05], [cx, L.y + 0.02, L.z + s * (L.width / 2 + 0.05)], m.alu);
  for (let x = L.x0; x <= L.x1 + 0.01; x += 2) for (const s of [-1, 1]) hall.box(det, [0.07, L.y - 0.2, 0.07], [x, (L.y - 0.2) / 2, L.z + s * 0.38], m.steel);
  // the hopper at the infeed
  for (const [w, d, dx, dz] of [
    [1.0, 0.05, 0, 0.5],
    [1.0, 0.05, 0, -0.5],
    [0.05, 1.0, 0.5, 0],
    [0.05, 1.0, -0.5, 0],
  ])
    hall.box(det, [w, 0.6, d], [L.x0 + dx, L.y + 0.55, L.z + dz], m.steel);
  // the camera arch (teal = data: its scan bar on the belt)
  for (const s of [-1, 1]) hall.box(det, [0.08, 1.15, 0.08], [L.camX, L.y + 0.55, L.z + s * 0.55], m.alu);
  hall.box(det, [0.16, 0.08, 1.2], [L.camX, L.y + 1.1, L.z], m.alu);
  hall.box(det, [0.22, 0.16, 0.26], [L.camX, L.y + 1.0, L.z], m.dark);
  const scanMat = new THREE.MeshBasicMaterial({ color: css.teal, transparent: true, opacity: 0.25, depthWrite: false });
  ctx.onDispose(() => scanMat.dispose());
  const scan = new THREE.Mesh(G(new THREE.PlaneGeometry(0.05, L.width).rotateX(-Math.PI / 2)), scanMat);
  scan.position.set(L.camX, by + 0.004, L.z);
  scan.name = 'kreislaufhof:scan';
  hall.live.add(scan);
  // the picker's frame: four legs, the top plate, three motor housings with their (orange: moving) joint rings
  const P = K.picker;
  const top = new THREE.Vector3(P.top[0], F + P.top[1], P.top[2]);
  for (const [dx, dz] of [
    [-0.85, -0.7],
    [0.85, -0.7],
    [-0.85, 0.7],
    [0.85, 0.7],
  ])
    hall.box(det, [0.08, P.top[1] + 0.1, 0.08], [P.top[0] + dx, (P.top[1] + 0.1) / 2, P.top[2] + dz], m.steel, { collide: dz > 0 });
  for (const dz of [-0.7, 0.7]) hall.box(det, [1.78, 0.08, 0.08], [P.top[0], P.top[1] + 0.12, P.top[2] + dz], m.steel);
  hall.box(det, [0.9, 0.07, 0.9], [P.top[0], P.top[1] + 0.07, P.top[2]], m.alu);
  const arms = [0, 1, 2].map((i) => {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const rho = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const tan = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    const base = top.clone().addScaledVector(rho, P.rb);
    hall.box(det, [0.2, 0.16, 0.2], [base.x, base.y - F + 0.0, base.z], m.dark);
    return { rho, tan, base, theta: 0.6 };
  });
  {
    const ring = G(new THREE.TorusGeometry(0.07, 0.018, 6, 16));
    for (const a of arms) {
      const r = new THREE.Mesh(ring, ctx.materials.accentOrange);
      r.position.copy(a.base).addScaledVector(Y, -0.09);
      r.lookAt(r.position.clone().add(a.tan));
      det.add(r);
    }
  }
  // the aluminium bin behind the belt, the rest container at the end
  const crateBox = (c: { x: number; z: number; w: number; d: number; h: number }, mat: THREE.Material): void => {
    hall.box(det, [c.w, 0.05, c.d], [c.x, 0.025, c.z], mat);
    for (const [w, d, dx, dz] of [
      [c.w, 0.05, 0, c.d / 2],
      [c.w, 0.05, 0, -c.d / 2],
      [0.05, c.d, c.w / 2, 0],
      [0.05, c.d, -c.w / 2, 0],
    ])
      hall.box(det, [w, c.h, d], [c.x + dx, c.h / 2, c.z + dz], mat, { collide: true });
  };
  crateBox(L.bin, m.alu);
  crateBox(L.rest, m.crate);
  // the console: a lectern facing the line
  hall.box(det, [0.9, 1.0, 0.5], [L.console.x, 0.5, L.console.z], m.timber, { collide: true });
  const consoleTop = hall.box(det, [1.0, 0.06, 0.62], [L.console.x, 1.06, L.console.z - 0.02], m.dark, { name: 'kreislaufhof:console', ry: 0 });
  consoleTop.rotation.x = 0.35;

  // ── moving parts: the belt's slats, the pieces, the picker's arms and effector ──
  const SLATS = 24,
    pitch = (len + 0.8) / SLATS;
  const slats = new THREE.InstancedMesh(G(new THREE.BoxGeometry(0.04, 0.012, L.width - 0.04)), m.dark, SLATS);
  slats.name = 'kreislaufhof:slats';
  hall.live.add(slats);
  let beltS = 0;
  const writeSlats = (): void => {
    for (let i = 0; i < SLATS; i++) {
      const x = L.x0 - 0.4 + ((i * pitch + beltS) % (len + 0.8));
      slats.setMatrixAt(i, _m.makeTranslation(x, by + 0.002, L.z));
    }
    slats.instanceMatrix.needsUpdate = true;
  };
  writeSlats();
  slats.computeBoundingSphere();
  slats.frustumCulled = false;

  const pieceMat = ctx.materials.standard({ color: 0xffffff, roughness: 0.42, metalness: 0.35 });
  const meshes = [
    new THREE.InstancedMesh(G(new THREE.CylinderGeometry(1, 1, 1, 10, 1)), pieceMat, 100),
    new THREE.InstancedMesh(G(new THREE.BoxGeometry(1, 1, 1)), pieceMat, 100),
  ];
  meshes.forEach((mesh, i) => {
    mesh.name = `kreislaufhof:pieces-${i}`;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    hall.live.add(mesh);
  });
  const color = new THREE.Color();

  const upper = new THREE.InstancedMesh(G(new THREE.BoxGeometry(0.06, 0.06, 1)), m.alu, 3);
  const rods = new THREE.InstancedMesh(G(new THREE.CylinderGeometry(0.012, 0.012, 1, 6)), m.steel, 6);
  const eff = new THREE.Group();
  {
    const plate = new THREE.Mesh(G(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16)), m.alu);
    const cup = new THREE.Mesh(G(new THREE.CylinderGeometry(0.05, 0.035, 0.08, 12)), m.rubber);
    cup.position.y = -0.065;
    eff.add(plate, cup);
  }
  for (const o of [upper, rods]) {
    o.frustumCulled = false;
    o.castShadow = true;
    hall.live.add(o);
  }
  eff.name = 'kreislaufhof:effector';
  hall.live.add(eff);

  // delta kinematics: the upper arm angle θ (down from horizontal) that puts the rods' ends on the effector
  const solveArm = (a: (typeof arms)[number], pe: THREE.Vector3): number => {
    const pi = _v.copy(pe).addScaledVector(a.rho, P.re).sub(a.base);
    const rp = pi.dot(a.rho),
      tp = pi.dot(a.tan),
      zp = pi.y;
    const A = -2 * P.l1 * rp,
      B = 2 * P.l1 * zp,
      C = P.l2 * P.l2 - P.l1 * P.l1 - rp * rp - tp * tp - zp * zp;
    const Rn = Math.hypot(A, B);
    if (Rn < 1e-6 || Math.abs(C / Rn) > 1) return a.theta;
    const base = Math.atan2(B, A),
      d = Math.acos(C / Rn);
    const t1 = base + d,
      t2 = base - d;
    return Math.cos(t1) > Math.cos(t2) ? t1 : t2;
  };
  const effP = new THREE.Vector3(L.pickX - 0.5, F + P.hoverY, L.z);
  const writePicker = (): void => {
    eff.position.copy(effP);
    arms.forEach((a, i) => {
      a.theta = solveArm(a, effP);
      const elbow = _w.copy(a.base).addScaledVector(a.rho, P.l1 * Math.cos(a.theta)).addScaledVector(Y, -P.l1 * Math.sin(a.theta));
      // upper arm: a box from the base to the elbow
      _v.copy(a.base).add(elbow).multiplyScalar(0.5);
      _q.setFromUnitVectors(Zv, _s.copy(elbow).sub(a.base).normalize());
      upper.setMatrixAt(i, _m.compose(_v, _q, _s.set(1, 1, P.l1)));
      // the two rods of the parallelogram, from the elbow to the effector's joint
      for (const side of [-1, 1]) {
        _r0.copy(elbow).addScaledVector(a.tan, side * 0.07);
        _r1.copy(effP).addScaledVector(a.rho, P.re).addScaledVector(a.tan, side * 0.07);
        _v.copy(_r0).add(_r1).multiplyScalar(0.5);
        _q.setFromUnitVectors(Y, _s.copy(_r1).sub(_r0).normalize());
        rods.setMatrixAt(i * 2 + (side < 0 ? 0 : 1), _m.compose(_v, _q, _s.set(1, _r0.distanceTo(_r1), 1)));
      }
    });
    upper.instanceMatrix.needsUpdate = true;
    rods.instanceMatrix.needsUpdate = true;
  };
  writePicker();

  // ── the run ──
  type Phase = 'idle' | 'running' | 'measured' | 'judged';
  const st = {
    phase: 'idle' as Phase,
    seed: Math.floor(Math.random() * 1e6),
    pieces: [] as Piece[],
    slots: [] as Slot[],
    t: 0,
    speed: 1,
    th: ctx.progress.get<number>('th', 0.5),
    seen: 0,
    inBin: 0,
    inRest: 0,
    job: null as null | { i: number; phase: 'track' | 'grab' | 'carry' | 'back'; t: number; from: THREE.Vector3 },
    queue: [] as number[],
    lastRemark: -99,
    scanT: 0,
    last: null as SortResult | null,
    introduced: false,
  };
  const binSlot = (k: number): THREE.Vector3 => {
    const c = L.bin;
    const layer = Math.floor(k / 20),
      r = k % 20;
    return new THREE.Vector3(c.x - c.w / 2 + 0.2 + (r % 5) * 0.22 + (layer % 2) * 0.08, F + 0.1 + layer * 0.075, c.z - c.d / 2 + 0.2 + Math.floor(r / 5) * 0.2);
  };
  const restSlot = (k: number): THREE.Vector3 => {
    const c = L.rest;
    const layer = Math.floor(k / 25),
      r = k % 25;
    return new THREE.Vector3(c.x - c.w / 2 + 0.2 + (r % 5) * 0.25 + (layer % 2) * 0.1, F + 0.1 + layer * 0.07, c.z - c.d / 2 + 0.2 + Math.floor(r / 5) * 0.25);
  };
  const newRun = (seed: number): void => {
    st.seed = seed;
    st.pieces = makeStream(seed);
    const counts = [0, 0];
    let t = 0.6;
    const rnd = mulberry(seed ^ 0x5bd1e995);
    st.slots = st.pieces.map((pc) => {
      const look = LOOK[pc.kind];
      const slot: Slot = { state: 'wait', p: new THREE.Vector3(), decided: false, pick: false, arrival: t, fly: null, yaw: (rnd() - 0.5) * 0.5, mesh: look.mesh, inst: counts[look.mesh]++ };
      t += L.gap[0] + rnd() * (L.gap[1] - L.gap[0]);
      return slot;
    });
    meshes.forEach((mesh, i) => (mesh.count = counts[i]));
    st.slots.forEach((s, i) => meshes[s.mesh].setColorAt(s.inst, color.setHex(LOOK[st.pieces[i].kind].color)));
    meshes.forEach((mesh) => {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    st.t = 0;
    st.seen = 0;
    st.inBin = 0;
    st.inRest = 0;
    st.job = null;
    st.queue = [];
    writePieces();
  };
  const writePieces = (): void => {
    st.slots.forEach((s, i) => {
      const look = LOOK[st.pieces[i].kind];
      if (s.state === 'wait') {
        meshes[s.mesh].setMatrixAt(s.inst, _m.compose(ZERO, _q.identity(), _s.set(0, 0, 0)));
        return;
      }
      const [a, b, c] = look.size;
      if (look.mesh === 0) {
        // a cylinder lying across the belt (its axis along z), turned a little
        _q.setFromAxisAngle(Y, s.yaw).multiply(_qa.setFromAxisAngle(X, Math.PI / 2));
        _s.set(a * SCALE, b * SCALE, c * SCALE);
        _v.copy(s.p).setY(s.p.y + a * SCALE);
      } else {
        _q.setFromAxisAngle(Y, s.yaw);
        _s.set(a * SCALE, b * SCALE, c * SCALE);
        _v.copy(s.p).setY(s.p.y + (b * SCALE) / 2);
      }
      meshes[s.mesh].setMatrixAt(s.inst, _m.compose(_v, _q, _s));
    });
    meshes.forEach((mesh) => (mesh.instanceMatrix.needsUpdate = true));
  };
  newRun(st.seed);

  let beltLoop: LoopHandle | null = null;
  const setBelt = (on: boolean): void => {
    if (on && !beltLoop) beltLoop = ctx.audio.loop('conveyor', { at: [cx, F + 1, L.z], volume: 0.8 });
    else if (!on && beltLoop) {
      beltLoop.stop();
      beltLoop = null;
    }
  };
  ctx.onDispose(() => beltLoop?.stop());

  const seenPieces = (): Piece[] => st.pieces.filter((_, i) => st.slots[i].decided);
  const decide = (i: number): void => {
    const s = st.slots[i];
    const pc = st.pieces[i];
    s.decided = true;
    s.pick = pc.score >= st.th;
    st.seen++;
    if (s.pick) st.queue.push(i);
    st.scanT = 0.22;
    // the camera's score over the piece: teal when it will be picked
    ctx.game.juice.popup([s.p.x, by + 0.45, s.p.z], num(pc.score), { tone: s.pick ? 'teal' : 'muted', seconds: K.juice.scorePopupS });
    ctx.audio.tone({ freq: s.pick ? 1320 : 990, dur: 0.05, type: 'sine', volume: 0.05, at: [s.p.x, by + 1, s.p.z] });
    uiDirty = true;
    remark();
  };
  const remark = (): void => {
    if (st.seen < 15 || st.t - st.lastRemark < K.juice.remarkEveryS) return;
    const c = countsAt(seenPieces(), st.th);
    if (c.purity < 0.75) S.emiSay(T('emi.lowPurity'));
    else if (c.recovery < 0.6) S.emiSay(T('emi.lowRecovery'));
    else return;
    st.lastRemark = st.t;
  };
  const land = (i: number, into: 'bin' | 'rest'): void => {
    const s = st.slots[i];
    const pc = st.pieces[i];
    const to = into === 'bin' ? binSlot(st.inBin++) : restSlot(st.inRest++);
    s.fly = { from: s.p.clone(), to, t: 0, dur: into === 'bin' ? 0.32 : 0.42, into };
    s.state = 'fly';
    if (into === 'bin') {
      if (pc.target) ctx.game.juice.cue('tick', { at: [to.x, to.y + 0.3, to.z], pitch: 1 + Math.min(0.6, st.inBin * 0.012), volume: 0.55 });
      else {
        ctx.game.juice.cue('oops', { at: [to.x, to.y + 0.3, to.z], volume: 0.7 });
        ctx.game.juice.popup([to.x, F + 1.2, to.z], T(`pop.wrong.${pc.kind}`), { tone: 'bad', seconds: 1.4 });
      }
    } else if (pc.target) {
      ctx.game.juice.cue('bad', { at: [to.x, to.y + 0.3, to.z], volume: 0.4 });
      ctx.game.juice.popup([to.x, F + 1.3, to.z], T('pop.missed'), { tone: 'bad', seconds: 1.4 });
    }
  };

  const step = (dt: number): void => {
    if (st.phase !== 'running') return;
    const h = dt * st.speed;
    st.t += h;
    beltS = (beltS + h * L.speed) % (len + 0.8);
    let settled = 0;
    for (let i = 0; i < st.slots.length; i++) {
      const s = st.slots[i];
      if (s.state === 'wait') {
        if (st.t >= s.arrival) {
          s.state = 'drop';
          s.p.set(L.x0, by + 0.45, L.z + (Math.random() - 0.5) * 0.3);
        }
        continue;
      }
      if (s.state === 'drop') {
        s.p.y -= h * 2.4;
        s.p.x += h * L.speed;
        if (s.p.y <= by) {
          s.p.y = by;
          s.state = 'belt';
        }
        continue;
      }
      if (s.state === 'belt') {
        s.p.x += h * L.speed;
        if (!s.decided && s.p.x >= L.camX) decide(i);
        if (s.p.x >= L.x1 + 0.3) land(i, 'rest');
        continue;
      }
      if (s.state === 'fly' && s.fly) {
        s.fly.t += h;
        const k = Math.min(1, s.fly.t / s.fly.dur);
        s.p.lerpVectors(s.fly.from, s.fly.to, k);
        s.p.y += Math.sin(k * Math.PI) * 0.25;
        if (k >= 1) {
          s.p.copy(s.fly.to);
          s.state = s.fly.into;
          s.fly = null;
        }
        continue;
      }
      if (s.state === 'bin' || s.state === 'rest') settled++;
    }
    stepPicker(h);
    if (settled === st.slots.length) {
      st.phase = 'measured';
      setBelt(false);
      ctx.game.juice.cue('go');
      S.emiSay(T('emi.runDone'), true);
      uiDirty = true;
    }
  };

  const wait = (): THREE.Vector3 => _w.set(L.pickX - 0.5, F + P.hoverY, L.z);
  const stepPicker = (h: number): void => {
    const C = P.cycle;
    if (!st.job) {
      // the next queued piece within reach
      while (st.queue.length) {
        const i = st.queue[0];
        const s = st.slots[i];
        if (s.state !== 'belt') {
          st.queue.shift();
          continue;
        }
        if (s.p.x >= L.pickX - 1.0) {
          st.queue.shift();
          st.job = { i, phase: 'track', t: 0, from: effP.clone() };
        }
        break;
      }
      if (!st.job) {
        effP.lerp(wait(), Math.min(1, h * 6));
        writePicker();
        return;
      }
    }
    const j = st.job;
    const s = st.slots[j.i];
    j.t += h;
    if (j.phase === 'track') {
      const k = Math.min(1, j.t / C.track);
      // meet the piece where it will be at the end of the move
      const meetX = s.p.x + (C.track - j.t) * L.speed;
      _v.set(meetX, F + P.grabY, s.p.z);
      effP.lerpVectors(j.from, _v, smooth(k));
      if (k >= 1) {
        j.phase = 'grab';
        j.t = 0;
        s.state = 'held';
        ctx.audio.tone({ freq: 220, to: 330, dur: 0.08, type: 'triangle', volume: 0.08, at: [s.p.x, s.p.y + 0.3, s.p.z] });
      }
    } else if (j.phase === 'grab') {
      effP.x += h * L.speed;
      s.p.set(effP.x, effP.y - 0.1 - 0.05, effP.z);
      if (j.t >= C.grab) {
        j.phase = 'carry';
        j.t = 0;
        j.from = effP.clone();
      }
    } else if (j.phase === 'carry') {
      const k = Math.min(1, j.t / C.carry);
      _v.set(L.bin.x + (Math.random() - 0.5) * 0.02, F + P.binY, L.bin.z);
      effP.lerpVectors(j.from, _v, smooth(k));
      effP.y += Math.sin(k * Math.PI) * 0.12;
      s.p.set(effP.x, effP.y - 0.15, effP.z);
      if (k >= 1) {
        land(j.i, 'bin');
        j.phase = 'back';
        j.t = 0;
        j.from = effP.clone();
      }
    } else {
      const k = Math.min(1, j.t / C.back);
      effP.lerpVectors(j.from, wait(), smooth(k));
      if (k >= 1) st.job = null;
    }
    writePicker();
  };

  // ── the console (operate mode): the slider, purity and recovery live, the Kennlinie, start / commit ──
  let uiDirty = true;
  let ui: null | { th: HTMLInputElement; thVal: HTMLElement; pur: HTMLElement; rec: HTMLElement; count: HTMLElement; status: HTMLElement; start: HTMLButtonElement; fast: HTMLButtonElement; commit: HTMLButtonElement; kl: ReturnType<ZoneContext['ui']['kennlinie']> } = null;
  let klT = 0;
  const kSpec = (): import('@/core/zones').KennlinieSpec => {
    const seen = seenPieces();
    const cv = seen.length ? curves(seen).filter((_, k) => k % 2 === 0) : [];
    const cross = seen.length >= 10 ? crossing(seen) : null;
    return {
      title: T('panel.kTitle'),
      xLabel: T('panel.kx'),
      yLabel: T('panel.ky'),
      chip: 'sim',
      percent: true,
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
      keyValue: cross != null && (st.phase === 'measured' || st.phase === 'judged') ? ctx.t('panel.cross', { th: num(cross) }) : undefined,
      series: [
        { id: 'p', label: T('panel.purity'), line: cv.map((c) => [c.th, c.purity] as [number, number]), color: css.teal },
        { id: 'r', label: T('panel.recovery'), line: cv.map((c) => [c.th, c.recovery] as [number, number]), color: css.text },
        { id: 'th', line: [[st.th, 0], [st.th, 1]] as [number, number][], color: css.orange, dashed: true },
        ...(cross != null && (st.phase === 'measured' || st.phase === 'judged') ? [{ id: 'x', points: [[cross, countsAt(seen, cross).purity]] as [number, number][], color: css.orange }] : []),
      ],
    };
  };
  const refreshUi = (): void => {
    if (!ui) return;
    uiDirty = false;
    const seen = seenPieces();
    const c = countsAt(seen, st.th);
    ui.thVal.textContent = num(st.th);
    ui.pur.textContent = c.picked ? `${ctx.ui.formatRate(c.tp, c.picked).replace(/ · n = \d+$/, '')} · ${c.tp}/${c.picked}` : '–';
    ui.rec.textContent = c.targets ? `${ctx.ui.formatRate(c.tp, c.targets).replace(/ · n = \d+$/, '')} · ${c.tp}/${c.targets}` : '–';
    ui.count.textContent = ctx.t('panel.count', { n: st.seen });
    ui.start.style.display = st.phase === 'idle' || st.phase === 'judged' ? '' : 'none';
    ui.start.textContent = ctx.t(st.phase === 'judged' ? 'panel.again' : 'panel.start');
    ui.fast.style.display = st.phase === 'running' ? '' : 'none';
    ui.fast.textContent = ctx.t(st.speed > 1 ? 'panel.slow' : 'panel.fast');
    ui.commit.style.display = st.phase === 'measured' ? '' : 'none';
    // (after a judged run the readouts and the chart's crossing say it all: ≤ 35 words at open, §4)
    ui.status.textContent = st.phase === 'measured' ? ctx.t('panel.done') : '';
  };
  const commit = (): void => {
    if (st.phase !== 'measured') return;
    const r = judge(st.pieces, st.th);
    st.last = r;
    st.phase = 'judged';
    ctx.progress.set('th', st.th);
    if (r.cross != null && Math.abs(r.th - r.cross) <= 0.05) S.emiSay(T('emi.cross'), true);
    S.onRun(r);
    uiDirty = true;
    ui?.kl.update(kSpec());
  };
  const start = (): void => {
    if (st.phase === 'running' || st.phase === 'measured') return;
    if (st.phase === 'judged') newRun(Math.floor(Math.random() * 1e6));
    st.phase = 'running';
    st.speed = 1;
    st.lastRemark = -99;
    setBelt(true);
    ctx.game.juice.cue('go');
    uiDirty = true;
  };

  let exitOperate: (() => void) | null = null;
  const open = (): void => {
    if (ctx.player.operating) return;
    if (!st.introduced) {
      st.introduced = true;
      S.emiSay(T('emi.console'), true);
    }
    exitOperate = ctx.player.enterOperate({
      title: T('panel.eyebrow'),
      cameraPose: { position: [L.console.x + 0.2, F + 2.15, L.console.z + 1.2], lookAt: [L.console.x - 1.4, F + 1.0, L.z - 0.5] },
      panelPosition: 'right',
      panel: (root) => {
        root.dataset.kh = 'panel';
        const el = <K2 extends keyof HTMLElementTagNameMap>(tag: K2, cls?: string, text?: string, style?: string): HTMLElementTagNameMap[K2] => {
          const e = document.createElement(tag);
          if (cls) e.className = cls;
          if (text != null) e.textContent = text;
          if (style) e.style.cssText = style;
          return e;
        };
        const head = el('div', '', undefined, 'display:flex;justify-content:space-between;align-items:center;gap:8px');
        head.append(el('div', 'eyebrow', ctx.t('panel.eyebrow')), ctx.ui.chip('sim', T('panel.chipSrc')));
        const goals = S.chips();
        goals.style.margin = '8px 0 4px';
        root.append(head, goals);
        // the slider (a setting, not a claim: data-chip="ui")
        const row = el('div', '', undefined, 'display:grid;grid-template-columns:auto 1fr 52px;gap:10px;align-items:center;margin-top:8px');
        const th = el('input') as HTMLInputElement;
        th.type = 'range';
        th.min = '0';
        th.max = '1';
        th.step = '0.01';
        th.value = String(st.th);
        th.style.cssText = 'width:100%;accent-color:var(--orange)';
        th.dataset.kh = 'th';
        th.addEventListener('keydown', (e) => e.stopPropagation());
        const thVal = el('span', 'mono', num(st.th), 'font-size:15px;text-align:right;color:var(--text)');
        thVal.dataset.chip = 'ui';
        th.addEventListener('input', () => {
          st.th = Number(th.value);
          uiDirty = true;
          klT = 0;
        });
        row.append(el('span', 'mono', ctx.t('panel.th'), 'font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3)'), th, thVal);
        root.append(row);
        // purity and recovery at this threshold over the pieces seen so far (SIM · LIVE in the section's header)
        const sec = el('section', '', undefined, 'margin-top:10px');
        const sh = el('header', '', undefined, 'display:none');
        sh.append(ctx.ui.chip('sim', T('panel.chipSrc')));
        sec.append(sh);
        const stat = (label: string): HTMLElement => {
          const r = el('div', 'row', undefined, 'display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-top:4px');
          const v = el('span', 'mono', '–', 'font-size:15px;color:var(--text)');
          r.append(el('span', '', label, 'font-size:13px;color:var(--text-2)'), v);
          sec.append(r);
          return v;
        };
        const pur = stat(ctx.t('panel.purity'));
        const rec = stat(ctx.t('panel.recovery'));
        root.append(sec);
        const kl = ctx.ui.kennlinie(kSpec(), { target: 'panel', parent: root, width: 340, height: 150 });
        const count = el('div', 'mono', '', 'font-size:12px;color:var(--text-3);margin-top:4px');
        const status = el('div', '', '', 'font-size:13px;color:var(--text-2);min-height:18px;margin-top:2px');
        const btns = el('div', 'op-row', undefined, 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap');
        const mk = (label: string, cls: string, fn: () => void, id: string): HTMLButtonElement => {
          const b = el('button', cls, label);
          b.type = 'button';
          b.dataset.kh = id;
          b.onclick = (e) => {
            e.stopPropagation();
            ctx.audio.play('click');
            fn();
            b.blur();
          };
          return b;
        };
        const startB = mk(ctx.t('panel.start'), 'btn', start, 'start');
        const fast = mk(ctx.t('panel.fast'), 'btn ghost', () => {
          st.speed = st.speed > 1 ? 1 : L.fast;
          uiDirty = true;
        }, 'fast');
        const commitB = mk(ctx.t('panel.commit'), 'btn', commit, 'commit');
        btns.append(startB, fast, commitB);
        root.append(count, status, btns);
        ui = { th, thVal, pur, rec, count, status, start: startB, fast, commit: commitB, kl };
        refreshUi();
        return () => {
          kl.remove();
          ui = null;
        };
      },
      onExit: () => {
        ui = null;
        exitOperate = null;
      },
    });
  };

  return {
    update(dt) {
      step(dt);
      if (st.phase === 'running' || st.scanT > 0) {
        st.scanT = Math.max(0, st.scanT - dt);
        scanMat.opacity = 0.22 + (st.scanT > 0 ? 0.6 * (st.scanT / 0.22) : 0);
      }
      if (st.phase === 'running') {
        writeSlats();
        writePieces();
      }
      if (ui) {
        if (uiDirty) refreshUi();
        klT -= dt;
        if (klT <= 0) {
          klT = 0.3;
          ui.kl.update(kSpec());
        }
      }
    },
    open,
    close: () => exitOperate?.(),
    solve(best) {
      // a finished run at once: the solve hooks (★ at a loose threshold, ★★★ at the crossing of a run that allows it)
      const pick = best ? solvable(1 + Math.floor(Math.random() * 1000)) : { seed: st.seed, th: 0.4 };
      newRun(pick.seed);
      st.th = pick.th;
      st.slots.forEach((s, i) => {
        const pc = st.pieces[i];
        s.decided = true;
        s.pick = pc.score >= st.th;
        s.p.copy(s.pick ? binSlot(st.inBin++) : restSlot(st.inRest++));
        s.state = s.pick ? 'bin' : 'rest';
      });
      st.seen = st.pieces.length;
      writePieces();
      st.phase = 'measured';
      commit();
      return st.last!;
    },
    get last() {
      return st.last;
    },
    get phase() {
      return st.phase;
    },
    console: consoleTop,
    stats: () => ({ phase: st.phase, seen: st.seen, th: st.th, inBin: st.inBin, inRest: st.inRest, seed: st.seed, last: st.last ? { th: st.last.th, purity: st.last.counts.purity, recovery: st.last.counts.recovery, cross: st.last.cross, star2: st.last.star2, star3: st.last.star3 } : null }),
  };
}

const smooth = (k: number): number => k * k * (3 - 2 * k);

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
