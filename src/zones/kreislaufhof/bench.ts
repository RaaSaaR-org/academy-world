/**
 * Scene 2 of the Kreislaufhof (plan §4.11; R8 §3.1): the repair bench. Two cordless vacuums of the same kind:
 * A is screwed together, B is glued. The real SO-101 (WP0's model through ctx.robots, never rebuilt) holds
 * the screwdriver and turns A's four screws out; then you take the parts (F, the grab verb) to their crates:
 * the battery to the battery collection, the motor to reuse, the board to electronics, the housing to
 * plastics. B has no screw and no gap: the arm gives up, and B goes whole into the shredder. Lesson in the
 * hands: „Was geschraubt ist, lässt sich reparieren.“ (the site's takeaway, §2.8).
 *
 * If the arm is not loaded (yet, or it failed after its retries), you turn the screws out yourself (E per
 * screw): the scene never waits on a download (§5.8). Grab props are the only dynamic bodies (§4.11).
 */
import * as THREE from 'three';
import type { DynamicHandle, RobotModel, Text, ZoneContext } from '@/core/zones';
import type { Hall } from './hall';
import { K } from './tuning';

export type PartId = 'akku' | 'motor' | 'pcb' | 'housing';
const CRATE_OF: Record<PartId, 'reuse' | 'akku' | 'pcb' | 'plastic'> = { akku: 'akku', motor: 'reuse', pcb: 'pcb', housing: 'plastic' };

export interface BenchShared {
  emiSay(t: Text, now?: boolean): void;
  refreshObjective(): void;
  /** scene 2 is complete (A's four parts sorted, B shredded) */
  onDone(): void;
}

export interface Bench {
  update(dt: number): void;
  readonly state: { aOpen: boolean; sorted: Record<PartId, boolean>; bTried: boolean; bShredded: boolean; done: boolean; screws: number; wrong: number };
  readonly anchors: { deviceA: THREE.Object3D; deviceB: THREE.Object3D; plaque: THREE.Object3D };
  /** the SO-101's name and attribution line (WP0's manifest), once known */
  armInfo(): { name: Text; attribution: Text } | null;
  /** finish the scene at once (solve hooks) */
  solve(): void;
  stats(): Record<string, unknown>;
}

export function buildBench(ctx: ZoneContext, hall: Hall, S: BenchShared): Bench {
  const B = K.bench;
  const F = hall.floor;
  const det = ctx.groups.detail;
  const m = hall.mat;
  const M = ctx.materials;
  const T = (k: string, p?: Record<string, string | number>): Text => ctx.i18n.text(k, p);
  const geos: THREE.BufferGeometry[] = [];
  const G = <T2 extends THREE.BufferGeometry>(g: T2): T2 => (geos.push(g), g);
  ctx.onDispose(() => geos.forEach((g) => g.dispose()));
  const topY = F + B.top;

  // ── the bench, a tool wall behind it, the crates, the shredder ──
  hall.box(det, [B.w, 0.06, B.d], [B.x, B.top - 0.03, B.z], m.timber, { collide: true });
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    hall.box(det, [0.07, B.top - 0.06, 0.07], [B.x + dx * (B.w / 2 - 0.1), (B.top - 0.06) / 2, B.z + dz * (B.d / 2 - 0.1)], m.steel);
  hall.box(det, [B.w, 1.1, 0.04], [B.x, B.top + 0.55, B.z - B.d / 2 - 0.02], m.timberSilver);
  for (let i = 0; i < 6; i++) hall.box(det, [0.03, 0.18 + (i % 3) * 0.05, 0.03], [B.x - 1.3 + i * 0.5, B.top + 0.75, B.z - B.d / 2 + 0.01], i % 2 ? m.steel : m.dark);
  // a small tray for the screws
  hall.box(det, [0.14, 0.02, 0.09], [B.x - 0.75, B.top + 0.01, B.z + 0.3], m.alu);
  const crateAt = new Map<string, THREE.Vector3>();
  for (const c of B.crates) {
    const w = 0.7,
      d = 0.5,
      h = 0.42;
    hall.box(det, [w, 0.04, d], [c.x, 0.02, c.z], m.crate);
    for (const [ww, dd, dx, dz] of [
      [w, 0.04, 0, d / 2],
      [w, 0.04, 0, -d / 2],
      [0.04, d, w / 2, 0],
      [0.04, d, -w / 2, 0],
    ])
      hall.box(det, [ww, h, dd], [c.x + dx, h / 2, c.z + dz], m.crate, { collide: true });
    crateAt.set(c.id, new THREE.Vector3(c.x, F + 0.2, c.z));
    ctx.hud.worldLabel([c.x, F + 0.75, c.z], T(`bench.crate.${c.id}`), { maxDistance: 9 });
  }
  {
    const s = B.shredder;
    hall.box(det, [0.9, 0.95, 0.9], [s.x, 0.475, s.z], m.dark, { collide: true });
    for (const [ww, dd, dx, dz] of [
      [1.1, 0.05, 0, 0.53],
      [1.1, 0.05, 0, -0.53],
      [0.05, 1.1, 0.53, 0],
      [0.05, 1.1, -0.53, 0],
    ])
      hall.box(det, [ww, 0.32, dd], [s.x + dx, 1.08, s.z + dz], m.steel);
    hall.box(det, [0.96, 0.05, 0.12], [s.x, 0.96, s.z + 0.47], M.hazard?.(3) ?? m.dark);
    ctx.hud.worldLabel([s.x, F + 1.5, s.z], T('bench.shredder'), { maxDistance: 9 });
  }

  // ── the devices: A screwed (lid, four screws, four parts inside), B glued (one piece) ──
  const plastic = M.standard({ color: 0x8e979b, roughness: 0.55, metalness: 0.05 });
  const plasticB = M.standard({ color: 0x9a9286, roughness: 0.55, metalness: 0.05 });
  const deviceA = new THREE.Group();
  deviceA.name = 'kreislaufhof:deviceA';
  deviceA.position.set(B.deviceA[0], topY, B.deviceA[1]);
  hall.live.add(deviceA);
  const shellA = new THREE.Mesh(G(new THREE.BoxGeometry(0.32, 0.075, 0.14)), plastic);
  shellA.position.y = 0.0375;
  const lid = new THREE.Mesh(G(new THREE.BoxGeometry(0.32, 0.03, 0.14)), plastic);
  lid.position.y = 0.09;
  // the four screws in one draw (a removed screw scales to nothing)
  const screwMesh = new THREE.InstancedMesh(G(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 8)), m.steel, 4);
  const screws = [
    [-0.12, -0.045],
    [0.12, -0.045],
    [-0.12, 0.045],
    [0.12, 0.045],
  ].map(([x, z]) => ({ position: new THREE.Vector3(x, 0.111, z), visible: true }));
  const writeScrews = (): void => {
    const mm = new THREE.Matrix4();
    screws.forEach((s, i) => screwMesh.setMatrixAt(i, s.visible ? mm.makeTranslation(s.position.x, s.position.y, s.position.z) : mm.makeScale(0, 0, 0)));
    screwMesh.instanceMatrix.needsUpdate = true;
  };
  writeScrews();
  deviceA.add(shellA, lid, screwMesh);
  for (const o of [shellA, lid]) o.castShadow = o.receiveShadow = true;
  const deviceB = new THREE.Group();
  deviceB.name = 'kreislaufhof:deviceB';
  deviceB.position.set(B.deviceB[0], topY, B.deviceB[1]);
  hall.live.add(deviceB);
  const bodyB = new THREE.Mesh(G(new THREE.BoxGeometry(0.32, 0.105, 0.14)), plasticB);
  bodyB.position.y = 0.0525;
  bodyB.castShadow = bodyB.receiveShadow = true;
  // the glue seam: a lighter line round the middle
  const seam = new THREE.Mesh(G(new THREE.BoxGeometry(0.324, 0.006, 0.144)), M.standard({ color: 0xd8d2c4, roughness: 0.7, metalness: 0 }));
  seam.position.y = 0.075;
  deviceB.add(bodyB, seam);
  ctx.hud.worldLabel([B.deviceA[0], topY + 0.35, B.deviceA[1]], T('bench.deviceA'), { eyebrow: T('hint.deviceA'), maxDistance: 6 });
  ctx.hud.worldLabel([B.deviceB[0], topY + 0.35, B.deviceB[1]], T('bench.deviceB'), { eyebrow: T('hint.deviceB'), maxDistance: 6 });
  // the plaque with the card
  const plaque = hall.box(det, [0.22, 0.14, 0.02], [B.x + 1.05, B.top + 0.09, B.z + 0.38], m.dark, { name: 'kreislaufhof:bench-plaque' });
  plaque.rotation.x = -1.0;

  // the parts inside A (hidden until it is open): grab props once it is
  const partLook: Record<PartId, { geo: THREE.BufferGeometry; mat: THREE.Material; at: [number, number, number]; mass: number }> = {
    akku: { geo: G(new THREE.BoxGeometry(0.13, 0.06, 0.08)), mat: M.standard({ color: 0x3f4a44, roughness: 0.6, metalness: 0.1 }), at: [-0.2, 0.05, 0.3], mass: 0.4 },
    motor: { geo: G(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 14).rotateZ(Math.PI / 2)), mat: M.standard({ color: 0xa2774f, roughness: 0.4, metalness: 0.6 }), at: [-0.02, 0.05, 0.32], mass: 0.3 },
    pcb: { geo: G(new THREE.BoxGeometry(0.13, 0.014, 0.09)), mat: M.standard({ color: 0x2f4f45, roughness: 0.55, metalness: 0.2 }), at: [0.16, 0.02, 0.32], mass: 0.05 },
    housing: { geo: G(new THREE.BoxGeometry(0.32, 0.075, 0.14)), mat: plastic, at: [0, 0.04, 0], mass: 0.25 },
  };
  const parts = new Map<PartId, { mesh: THREE.Mesh; body: DynamicHandle | null }>();

  const st = {
    aOpen: false,
    sorted: { akku: false, motor: false, pcb: false, housing: false } as Record<PartId, boolean>,
    bTried: false,
    bShredded: false,
    done: false,
    screws: 0,
    wrong: 0,
  };
  let bBody: DynamicHandle | null = null;

  // ── the arm: the real SO-101 on the bench, loaded through the queue (never blocking the scene) ──
  let arm: RobotModel | null = null;
  const armBase = new THREE.Vector3(B.arm[0], topY, B.arm[1]);
  const loadArm = (): void => {
    void ctx.robots
      .load('so101', { priority: 'route' })
      .then((r) => {
        arm = r;
        r.object.position.copy(armBase);
        // face the devices (local +z toward the player's side of the bench)
        r.object.rotation.y = Math.PI;
        det.add(r.object);
      })
      .catch((err) => console.warn('[kreislaufhof] SO-101 not loaded: the screws are turned by hand', err));
  };
  loadArm();
  ctx.events.on('robots:retry', (p?: { id?: string; area?: string }) => {
    if (p?.id === 'so101' && (!p.area || p.area === ctx.id) && !arm) loadArm();
  });
  // the real robot by its name (D32), its attribution on the bench's card
  let armInfo: { name: Text; attribution: Text } | null = null;
  ctx.robots
    .info('so101')
    .then((info) => {
      armInfo = { name: info.name, attribution: info.attribution };
      ctx.hud.worldLabel([B.arm[0] - 0.3, topY + 0.5, B.arm[1]], info.name, { eyebrow: T('bench.armEyebrow'), maxDistance: 5 });
    })
    .catch(() => undefined);

  // the arm's job: a sequence of world targets for its gripper, with a wrist roll (unscrewing) or a jitter (prying)
  interface Move {
    to: THREE.Vector3;
    dur: number;
    roll?: number;
    jitter?: boolean;
    then?: () => void;
  }
  let job: Move[] = [];
  let jobT = 0;
  let jobFrom = new THREE.Vector3();
  const rest = (): THREE.Vector3 => armBase.clone().add(new THREE.Vector3(0, 0.22, 0.12));
  let tip = rest();
  const tipW = new THREE.Vector3();
  const runJob = (moves: Move[]): void => {
    job = moves;
    jobT = 0;
    jobFrom = tip.clone();
  };
  const stepArm = (dt: number): void => {
    if (!arm) return;
    const mv = job[0];
    if (mv) {
      jobT += dt;
      const k = Math.min(1, jobT / mv.dur);
      const e = k * k * (3 - 2 * k);
      tip.lerpVectors(jobFrom, mv.to, e);
      if (mv.jitter && !ctx.settings.reducedMotion) tip.x += Math.sin(jobT * 40) * 0.004;
      if (k >= 1) {
        job.shift();
        jobFrom = tip.clone();
        jobT = 0;
        mv.then?.();
      }
    }
    // the solver works in world coordinates (the plot's local frame is turned toward the hub)
    arm.solveIK('arm', ctx.toWorld(tip, tipW), { iterations: 10, tolerance: 0.002 });
    if (mv?.roll != null) arm.setJoint('wrist_roll', Math.sin((jobT / mv.dur) * Math.PI * 3) * mv.roll);
  };

  // ── E on A: unscrew (the arm, or you), then open ──
  const screwOut = (i: number): void => {
    const s = screws[i];
    s.visible = false;
    writeScrews();
    st.screws++;
    ctx.game.juice.popup([B.deviceA[0] + s.position.x, topY + 0.2, B.deviceA[1] + s.position.z], T('bench.arm', { n: st.screws }), { tone: 'muted', seconds: 0.9 });
    ctx.audio.tone({ freq: 640, to: 820, dur: 0.12, type: 'triangle', volume: 0.08, at: [B.deviceA[0], topY + 0.1, B.deviceA[1]] });
    if (st.screws >= 4) openA();
  };
  const openA = (): void => {
    if (st.aOpen) return;
    st.aOpen = true;
    // the lid comes off and lands beside the device
    lid.position.set(-0.1, 0.02, -0.28);
    lid.rotation.z = 0.1;
    shellA.visible = false;
    for (const id of Object.keys(partLook) as PartId[]) {
      const p = partLook[id];
      const mesh = new THREE.Mesh(p.geo, p.mat);
      mesh.name = `kreislaufhof:part-${id}`;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.position.set(B.deviceA[0] + p.at[0], topY + p.at[1], B.deviceA[1] + p.at[2]);
      det.add(mesh);
      const body = ctx.physics.addDynamic(mesh, { mass: p.mass, label: T(`bench.part.${id}`), friction: 0.8 });
      parts.set(id, { mesh, body });
    }
    ctx.game.juice.burst([B.deviceA[0], topY + 0.15, B.deviceA[1]], { tone: 'stone', count: 24, spread: 0.25 });
    ctx.audio.play('drop', { at: [B.deviceA[0], topY + 0.1, B.deviceA[1]], volume: 0.6 });
    S.emiSay(T('emi.opened'), true);
    S.refreshObjective();
  };
  const startA = (): void => {
    if (st.aOpen || job.length) return;
    if (arm) {
      S.emiSay(T('emi.bench'), true);
      const moves: Move[] = [];
      screws.forEach((s, i) => {
        if (!s.visible) return;
        const at = new THREE.Vector3(B.deviceA[0] + s.position.x, topY + 0.16, B.deviceA[1] + s.position.z);
        moves.push({ to: at.clone().add(new THREE.Vector3(0, 0.05, 0)), dur: 0.35 });
        moves.push({ to: at, dur: K.bench.screwS * 0.55, roll: 1.4 });
        moves.push({ to: at.clone().add(new THREE.Vector3(0, 0.06, 0)), dur: K.bench.screwS * 0.3, then: () => screwOut(i) });
      });
      moves.push({ to: rest(), dur: 0.5 });
      runJob(moves);
    } else {
      // by hand: one screw per E
      if (st.screws === 0) S.emiSay(T('emi.benchNoArm'), true);
      const i = screws.findIndex((s) => s.visible);
      if (i >= 0) screwOut(i);
    }
  };
  // ── E on B: the arm tries a gap that is not there, then B is a grab prop for the shredder ──
  const tryB = (): void => {
    if (st.bTried || job.length) return;
    const give = (): void => {
      st.bTried = true;
      ctx.game.juice.popup([B.deviceB[0], topY + 0.3, B.deviceB[1]], T('bench.stuck'), { tone: 'bad', seconds: 1.6 });
      ctx.game.juice.cue('oops', { at: [B.deviceB[0], topY + 0.2, B.deviceB[1]] });
      S.emiSay(T('emi.glued'), true);
      bBody = ctx.physics.addDynamic(deviceB, { mass: 1.2, label: T('bench.deviceB'), friction: 0.8, shape: 'box' });
      S.refreshObjective();
    };
    if (arm) {
      const at = new THREE.Vector3(B.deviceB[0] - 0.1, topY + 0.1, B.deviceB[1] + 0.09);
      runJob([
        { to: at.clone().add(new THREE.Vector3(0, 0.06, 0.03)), dur: 0.4 },
        { to: at, dur: 1.4, jitter: true },
        { to: rest(), dur: 0.5, then: give },
      ]);
    } else give();
  };
  const eA = ctx.addInteractable({ object: deviceA, label: T('act.deviceA'), hint: T('hint.deviceA'), range: 2.4, isEnabled: () => !st.aOpen, onInteract: startA });
  const eB = ctx.addInteractable({ object: deviceB, label: T('act.deviceB'), hint: T('hint.deviceB'), range: 2.4, isEnabled: () => !st.bTried, onInteract: tryB });
  void eA;
  void eB;

  // ── the crates and the shredder: triggers that judge what you drop in ──
  for (const c of B.crates) {
    ctx.physics.addTrigger({
      shape: 'box',
      size: [0.62, 0.4, 0.42],
      position: [c.x, F + 0.22, c.z],
      filter: 'dynamic',
      onEnter: ({ body }) => {
        if (!body) return;
        const id = [...parts.entries()].find(([, p]) => p.body === body)?.[0];
        if (!id || st.sorted[id]) return;
        const at: [number, number, number] = [c.x, F + 0.9, c.z];
        if (CRATE_OF[id] === c.id) {
          st.sorted[id] = true;
          body.setGrabbable(false);
          ctx.game.juice.cue('good', { at });
          ctx.game.juice.popup(at, T('bench.right', { part: ctx.t(`bench.part.${id}`), crate: ctx.t(`bench.crate.${c.id}`) }), { tone: 'good', seconds: 1.4 });
          ctx.game.juice.burst(at, { tone: 'teal', count: 16, spread: 0.3 });
          if (Object.values(st.sorted).every(Boolean)) S.emiSay(T('emi.partsDone'), true);
          check();
        } else {
          st.wrong++;
          ctx.game.juice.cue('oops', { at });
          ctx.game.juice.popup(at, T(`bench.wrong.${id}`), { tone: 'bad', seconds: 2 });
          ctx.after(0.7, () => body.reset());
        }
        S.refreshObjective();
      },
    });
  }
  ctx.physics.addTrigger({
    shape: 'box',
    size: [0.8, 0.5, 0.8],
    position: [B.shredder.x, F + 1.0, B.shredder.z],
    filter: 'dynamic',
    onEnter: ({ body }) => {
      if (!body) return;
      if (body === bBody && !st.bShredded) {
        shred(body);
        return;
      }
      // a good part does not belong in the shredder: back to the bench
      const id = [...parts.entries()].find(([, p]) => p.body === body)?.[0];
      if (id && !st.sorted[id]) {
        st.wrong++;
        ctx.game.juice.popup([B.shredder.x, F + 1.6, B.shredder.z], T(`bench.wrong.${id}`), { tone: 'bad', seconds: 2 });
        ctx.after(0.5, () => body.reset());
      }
    },
  });
  const shred = (body: DynamicHandle): void => {
    st.bShredded = true;
    const at: [number, number, number] = [B.shredder.x, F + 1.1, B.shredder.z];
    body.remove();
    deviceB.visible = false;
    ctx.game.juice.burst(at, { tone: 'stone', count: 60, spread: 0.5 });
    ctx.audio.tone({ freq: 70, to: 45, dur: 1.4, type: 'sawtooth', volume: 0.12, at });
    ctx.audio.tone({ freq: 140, to: 95, dur: 1.1, type: 'square', volume: 0.04, at });
    S.emiSay(T('emi.shredded'), true);
    check();
    S.refreshObjective();
  };
  const check = (): void => {
    if (st.done || !st.bShredded || !Object.values(st.sorted).every(Boolean)) return;
    st.done = true;
    S.onDone();
  };

  return {
    update(dt) {
      stepArm(dt);
    },
    state: st,
    anchors: { deviceA, deviceB, plaque },
    armInfo: () => armInfo,
    solve() {
      if (!st.aOpen) {
        for (let i = 0; i < 4; i++) if (screws[i].visible) screwOut(i);
      }
      for (const [id, p] of parts) {
        if (st.sorted[id]) continue;
        st.sorted[id] = true;
        const at = crateAt.get(CRATE_OF[id])!;
        p.body?.setPosition([at.x + (Math.random() - 0.5) * 0.2, at.y + 0.1, at.z]);
        p.body?.setGrabbable(false);
      }
      st.bTried = true;
      if (!st.bShredded) {
        st.bShredded = true;
        bBody?.remove();
        deviceB.visible = false;
      }
      check();
    },
    stats: () => ({ ...st, sorted: { ...st.sorted }, arm: arm ? 'ready' : ctx.robots.state('so101'), job: job.length }),
  };
}

