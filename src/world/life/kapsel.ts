/**
 * WP15 — the Tomatenkapsel aboard (plan §4.10, R9 §2 Q2 (c)): in pod 240 the real SO-101 (WP0's model
 * through ctx.robots, Apache-2.0) picks cherry tomatoes at the research pace — one fruit per ≈ 33 s, two
 * in three grips succeed (the mean of 50 research projects, Bac et al. 2014, R9 S37) — and puts them
 * into the crate beside it; a miss stays on the vine and is tried again later, a picked truss regrows.
 * So the Sonnenacker's lesson flies with the island. The pod's extra grow lights come on with the T3
 * trim (the Sonnenacker's ◆; plan §1.3 step 2). At a rotor beat and at the lift-off the arm waves 2 s.
 * Draws: the fruit 1 (life), the lit bars 1 while T3 is on (life), the arm 1 (robots).
 */
import * as THREE from 'three';
import type { Text, ZoneContext } from '@/core/zones';
import type { RobotModel } from '@/core/zones';
import type { Director } from './director';
import type { ReactKind } from './types';
import { KAPSEL } from './tuning';
import { PAL, col } from './geo';
import { KAPSEL_LOCAL, KAPSEL_POD, kapselWorld } from '../landscape/pods';
import { POD } from '../landscape/plan';

const JOINTS = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'] as const;
type Pose = Float64Array;
const OPEN = 1.15;
const SHUT = 0.04;

/** Writes joint angles straight onto the model's nodes (no allocation per frame; RobotModel.setJoint boxes its return). */
class JointDriver {
  private nodes: THREE.Object3D[] = [];
  private axes: THREE.Vector3[] = [];
  private rest: THREE.Quaternion[] = [];
  private ref: number[] = [];
  private lo: number[] = [];
  private hi: number[] = [];
  private readonly q = new THREE.Quaternion();
  constructor(readonly model: RobotModel) {
    for (const name of JOINTS) {
      const n = model.jointNode(name)!;
      const j = model.joints.find((x) => x.name === name)!;
      this.nodes.push(n);
      this.axes.push(model.jointAxis(name)!.clone());
      this.rest.push(n.quaternion.clone());
      this.ref.push(model.getJoint(name));
      this.lo.push(j.lower);
      this.hi.push(j.upper);
    }
  }
  /** the model's current pose (after setJoint / solveIK) */
  read(out: Pose): Pose {
    JOINTS.forEach((n, i) => (out[i] = this.model.getJoint(n)));
    return out;
  }
  write(p: Pose): void {
    for (let i = 0; i < JOINTS.length; i++) {
      const v = Math.min(this.hi[i], Math.max(this.lo[i], p[i]));
      this.nodes[i].quaternion.copy(this.rest[i]).multiply(this.q.setFromAxisAngle(this.axes[i], v - this.ref[i]));
    }
  }
  /** set through the model (IK precompute, not per frame) */
  apply(p: Pose): void {
    JOINTS.forEach((n, i) => this.model.setJoint(n, p[i]));
  }
}

type Step = 'scan' | 'reach' | 'grip' | 'pull' | 'carry' | 'drop' | 'home' | 'wave';

export function buildKapsel(ctx: ZoneContext, h: { director: Director; paint: THREE.Material }): { setLit(on: boolean): void } {
  const D = h.director;
  const T = (de: string, en: string): Text => ({ de, en });
  const center = kapselWorld([0, 0, 0]);
  D.area('kapsel', { center: [center.x, 1, center.z], radius: POD.radius, frame: 'island' });

  // ── the fruit: on the vine in front of the arm, the crate's fill, the one in the gripper ──
  const N = KAPSEL_LOCAL.fruits.length;
  const CRATE = 8;
  const geo = col(new THREE.IcosahedronGeometry(0.5, 1), 0xffffff);
  ctx.onDispose(() => geo.dispose());
  const fruit = new THREE.InstancedMesh(geo, h.paint, N + CRATE + 1);
  fruit.name = 'life:kapsel-fruit';
  fruit.castShadow = false;
  fruit.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  D.roots.island.add(fruit);
  D.track(fruit);
  const vine = KAPSEL_LOCAL.fruits.map((l) => kapselWorld(l));
  /** 0 picked … 1 ripe; it regrows green and ripens red */
  const ripe = new Float32Array(N).fill(1);
  const regrow = new Float32Array(N);
  let crateN = 3;
  const HELD = N + CRATE;
  let held = false;
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _c = new THREE.Color();
  const green = new THREE.Color(PAL.tomatoUnripe);
  const red = new THREE.Color(PAL.tomato);
  const crateAt = kapselWorld(KAPSEL_LOCAL.crate);
  const draw = (): void => {
    for (let i = 0; i < N; i++) {
      const k = ripe[i];
      const r = k <= 0 ? 0 : 0.022 + 0.008 * Math.min(1, k * 1.4);
      _m.compose(vine[i], _q.identity(), _s.setScalar(r * 2));
      fruit.setMatrixAt(i, _m);
      fruit.setColorAt(i, _c.copy(green).lerp(red, THREE.MathUtils.smoothstep(k, 0.55, 0.95)));
    }
    for (let i = 0; i < CRATE; i++) {
      const on = i < crateN;
      _p.set(crateAt.x + ((i % 4) - 1.5) * 0.055, crateAt.y + 0.13 + Math.floor(i / 4) * 0.035, crateAt.z + (Math.floor(i / 2) % 2 ? 0.03 : -0.03));
      _m.compose(_p, _q.identity(), _s.setScalar(on ? 0.05 : 0));
      fruit.setMatrixAt(N + i, _m);
      fruit.setColorAt(N + i, red);
    }
    fruit.instanceMatrix.needsUpdate = true;
    if (fruit.instanceColor) fruit.instanceColor.needsUpdate = true;
  };
  const tip = new THREE.Vector3();
  const drawHeld = (): void => {
    _m.compose(tip, _q.identity(), _s.setScalar(held ? 0.052 : 0));
    fruit.setMatrixAt(HELD, _m);
    fruit.setColorAt(HELD, red);
    fruit.instanceMatrix.needsUpdate = true;
  };
  draw();
  drawHeld();

  // ── the T3 light: three brighter bars over the troughs while the Sonnenacker's trim is on ──
  const bars: THREE.BufferGeometry[] = [];
  const yaw = (-KAPSEL_POD.bearing * Math.PI) / 180;
  for (let row = -1; row <= 1; row++) {
    const len = 2 * Math.sqrt(Math.max(0, (POD.radius - 0.55) ** 2 - (row * 1.35) ** 2));
    bars.push(new THREE.BoxGeometry(len * 0.8, 0.055, 0.09).translate(0, POD.base + 1.945, row * 1.35).rotateY(yaw).translate(KAPSEL_POD.x, 0, KAPSEL_POD.z));
  }
  const barGeo = mergeBars(bars);
  ctx.onDispose(() => barGeo.dispose());
  const lit = new THREE.Mesh(barGeo, ctx.materials.light(0xfff4e2, 'T1'));
  lit.name = 'life:kapsel-t3-light';
  lit.visible = false;
  D.roots.island.add(lit);
  D.track(lit);

  // ── the arm ─────────────────────────────────────────────────────────────────
  let arm: { model: RobotModel; drv: JointDriver; home: Pose; scan: Pose[]; reachP: Pose[]; above: Pose; cur: Pose; from: Pose; to: Pose } | null = null;
  const armAt = kapselWorld(KAPSEL_LOCAL.arm);
  void ctx.robots
    ?.load('so101', { priority: 'idle' })
    .then((model) => {
      model.object.position.copy(armAt);
      // the vines are at the trough (pod-local −z of the arm); the model's front is +z
      model.object.rotation.y = yaw + Math.PI;
      model.object.name = 'life:kapsel-arm';
      ctx.root.add(model.object);
      model.object.updateMatrixWorld(true);
      const drv = new JointDriver(model);
      const pose = (): Pose => new Float64Array(JOINTS.length);
      const home = drv.read(pose());
      home[1] = -0.55;
      home[2] = 1.25;
      home[3] = 0.75;
      home[5] = OPEN * 0.4;
      // IK once per fruit (position only), from the home pose
      const solve = (target: THREE.Vector3): Pose => {
        drv.apply(home);
        model.object.updateMatrixWorld(true);
        model.solveIK('arm', target, { iterations: 40, tolerance: 0.004 });
        const p = drv.read(pose());
        p[5] = OPEN;
        return p;
      };
      const reachP = vine.map((v) => solve(v));
      const above = solve(_p.copy(crateAt).setY(crateAt.y + 0.24));
      const scan = [-0.35, 0.05, 0.4].map((dx) => {
        const p = Float64Array.from(home);
        p[0] += dx;
        p[3] += 0.2;
        return p;
      });
      drv.apply(home);
      arm = { model, drv, home, scan, reachP, above, cur: Float64Array.from(home), from: Float64Array.from(home), to: Float64Array.from(home) };
      drv.write(home);
    })
    .catch((err: unknown) => console.warn('[life] the Tomatenkapsel arm did not load', err));

  // ── the cycle: scan, reach, grip, pull (2 in 3 succeed), carry, drop, home ≈ 33 s ──
  let step: Step = 'scan';
  let t = 0;
  let dur = 4;
  let target = -1;
  let success = false;
  let scanI = 0;
  let waveT = 0;
  const DUR: Record<Exclude<Step, 'scan' | 'wave'>, number> = { reach: 2.6, grip: 0.7, pull: 1.1, carry: 2.6, drop: 0.8, home: 2.0 };
  const go = (s: Step, to: Pose | null, d: number): void => {
    if (!arm) return;
    step = s;
    t = 0;
    dur = d;
    arm.from.set(arm.cur);
    if (to) arm.to.set(to);
    else arm.to.set(arm.cur);
  };
  const pickTarget = (): number => {
    let best = -1;
    for (let i = 0; i < N; i++) if (ripe[i] >= 1 && (best < 0 || Math.random() < 0.35)) best = i;
    return best;
  };
  const ease = (x: number): number => x * x * (3 - 2 * x);
  const tick = (dt: number): void => {
    // fruit regrows
    let dirty = false;
    for (let i = 0; i < N; i++)
      if (ripe[i] < 1) {
        regrow[i] += dt;
        if (regrow[i] > KAPSEL.regrowS) {
          ripe[i] = Math.min(1, ripe[i] + dt / 30);
          dirty = true;
        }
      }
    if (dirty) draw();
    if (!arm) return;
    const a = arm;
    t += dt;
    const k = Math.min(1, t / dur);
    const e = ease(k);
    for (let i = 0; i < JOINTS.length; i++) a.cur[i] = a.from[i] + (a.to[i] - a.from[i]) * e;
    if (step === 'wave') {
      waveT += dt;
      a.cur[0] = a.home[0] + Math.sin(waveT * 5.5) * 0.45;
      a.cur[2] = 0.35;
      a.cur[3] = -0.4 + Math.sin(waveT * 11) * 0.3;
      a.cur[5] = OPEN * (0.5 + 0.5 * Math.sin(waveT * 9));
    }
    // the gripper closes during the grip, opens at the drop
    if (step === 'grip') a.cur[5] = OPEN + (SHUT - OPEN) * e;
    else if (step === 'pull' || step === 'carry') a.cur[5] = success ? SHUT : OPEN * e;
    else if (step === 'drop') a.cur[5] = SHUT + (OPEN - SHUT) * e;
    a.drv.write(a.cur);
    if (held) {
      a.model.getLinkWorldPosition('gripper_frame_link', tip);
      drawHeld();
    }
    if (k < 1) return;
    switch (step) {
      case 'wave':
        go('home', a.home, 1.4);
        break;
      case 'scan':
        // the wrist camera looks along the vines; after ≈ 23 s of looking it commits to a fruit
        if (t >= dur) {
          scanI++;
          if (scanI >= 6) {
            scanI = 0;
            target = pickTarget();
            if (target >= 0) go('reach', a.reachP[target], DUR.reach);
            else go('scan', a.scan[1], 3.8);
          } else go('scan', a.scan[scanI % 3], 3.8);
        }
        break;
      case 'reach':
        go('grip', null, DUR.grip);
        break;
      case 'grip':
        success = Math.random() < KAPSEL.success;
        if (success) {
          ripe[target] = 0;
          regrow[target] = 0;
          held = true;
          draw();
        }
        // pull back 4 cm toward home
        a.to.set(a.reachP[target]);
        a.to[2] += 0.12;
        go('pull', a.to, DUR.pull);
        break;
      case 'pull':
        if (success) go('carry', a.above, DUR.carry);
        else go('home', a.home, DUR.home);
        break;
      case 'carry':
        go('drop', null, DUR.drop);
        break;
      case 'drop':
        held = false;
        drawHeld();
        crateN = crateN >= CRATE ? 2 : crateN + 1;
        draw();
        go('home', a.home, DUR.home);
        break;
      case 'home':
        go('scan', a.scan[0], 3.8);
        break;
    }
  };
  D.register({
    id: 'kapsel:arm',
    area: 'kapsel',
    job: T('Kirschtomaten pflücken', 'Pick cherry tomatoes'),
    kind: 'arm',
    near: tick,
    // from further away it keeps its rhythm at 15 Hz
    mid: tick,
    react: (kind: ReactKind) => {
      if ((kind === 'rotor' || kind === 'liftoff' || kind === 'wave') && arm && !held) {
        waveT = 0;
        go('wave', arm.home, 2);
      }
    },
  });

  // ── the lesson hook (WP9's 'sonnenacker:kapsel' { …, lesson }): a card at the pod's plaque ──
  let lesson: Text | null = null;
  ctx.events.on('sonnenacker:kapsel', (e?: { lesson?: Text }) => {
    if (e?.lesson) lesson = e.lesson;
  });
  const out = Math.atan2(-KAPSEL_POD.x, -KAPSEL_POD.z);
  const probe = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.4), h.paint);
  probe.position.set(KAPSEL_POD.x + Math.sin(out) * (POD.radius + 0.3), 0.3, KAPSEL_POD.z + Math.cos(out) * (POD.radius + 0.3));
  probe.rotation.y = out;
  probe.visible = false;
  D.roots.island.add(probe);
  ctx.onDispose(() => probe.geometry.dispose());
  ctx.addInteractable({
    object: probe,
    label: T('Tomatenkapsel ansehen', 'Look at the tomato capsule'),
    range: 2.8,
    highlight: false,
    onInteract: () =>
      void ctx.hud.openInfoCard({
        eyebrow: T('// TOMATENKAPSEL', '// TOMATO CAPSULE'),
        title: T('Vom Sonnenacker. Diese Kapsel fliegt mit.', 'From the Sun Field. This capsule flies with us.'),
        chips: [{ type: 'quelle', source: T('Bac et al. (2014), Journal of Field Robotics: 50 Projekte in 30 Jahren · Stand 2026-10', 'Bac et al. (2014), Journal of Field Robotics: 50 projects in 30 years · as of 2026-10') }],
        body: [
          T(
            'Der Arm hier pflückt im Tempo der Forschung: alle 33 Sekunden ein Griff, zwei von drei gelingen. Das ist der Mittelwert aus 50 Forschungsprojekten. Unten auf dem Sonnenacker arbeiten zwölf solche Arme in Hochbeeten, die für sie gebaut sind.',
            'The arm here picks at the research pace: one grip every 33 seconds, two in three succeed. That is the mean of 50 research projects. Down on the Sun Field, twelve arms like it work in raised beds built for them.',
          ),
          lesson ?? T('Vollautomatisch heißt nicht menschenleer.', 'Fully automated does not mean nobody.'),
        ],
      }),
  });

  return {
    setLit(on) {
      lit.visible = on;
    },
  };
}

function mergeBars(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n.getAttribute('uv')) n.deleteAttribute('uv');
    return n;
  });
  const total = parts.reduce((a, g) => a + g.getAttribute('position').count, 0);
  const pos = new Float32Array(total * 3),
    nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}
