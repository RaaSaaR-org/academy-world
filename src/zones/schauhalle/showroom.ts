/**
 * The robots on their plinths (plan §4.9): the real models through ctx.robots, the LOD governor
 * [C1 m2], turntables (one turn per 40 s, still under reduced motion and while inspected), the
 * Vorführung on approach [C2 M8], crates for robots not delivered yet (the visible placeholder while a
 * GLB streams in, §5.8), the line-up slices as far silhouettes, and the exterior's one merged draw.
 *
 * The governor (every 0.2 s): ≤ 2 robots at LOD0 (the inspected or compared ones first, else the
 * nearest within 5.5 m), ≤ 8 at LOD1 within 12 m, every other delivered robot as its line-up slice.
 * Models are untracked (the hall drives their LOD) and „posed once“: a frozen model's skeleton is not
 * updated and its bind inverse stays at the pose it was frozen in, so a turntable turns it as a rigid
 * body with no skinning work (plan: „no skinning updates except the ≤ 2 playing a Vorführung“). A model
 * that leaves the set is disposed after 4 s; its parsed GLB stays in an LRU of 3 and is released after
 * that (§5.9, ctx.robots.release).
 *
 * Ledger: every robot mesh of the hall carries userData.ledger = 'schauhalle', so the hall's ≤ 80 draws
 * and ≤ 300 k triangles count its robots (the plan's budget includes them: „near robots 1 draw each“).
 */
import * as THREE from 'three';
import type { RobotClip, RobotId, RobotModel, ZoneContext } from '@/core/zones';
import { CLIPS, LEKIWI_ARM_CLIP } from './data/clips';
import { HALL_ROBOTS, PLINTH, type HallRobot } from './data/robots';
import { STAGES } from './layout';
import { sliceLineup, type Slice } from './lineup';
import { GOVERNOR, LIGHT, TURNTABLE, VORFUEHRUNG } from './tuning';
import { box, cyl, merge } from './geo';
import type { HallMats } from './hall';

export type Tier = 0 | 1 | 'sil' | 'none';
export type Where = 'plinth' | 'a' | 'b';

/** One robot shown somewhere in the hall: on its plinth, or a second instance on Bühne A / B. */
export interface Spot {
  readonly key: string;
  readonly robot: HallRobot;
  where: Where;
  /** plinth top centre (local) and the robot's resting yaw */
  readonly base: THREE.Vector3;
  readonly yaw: number;
  readonly spin: boolean;
  /** holder (at the plinth top) → spinner (turntable yaw) → model / slice */
  readonly holder: THREE.Group;
  readonly spinner: THREE.Group;
  /** shown at all (delivered and not under a cover) */
  shown: boolean;
  tier: Tier;
  model: RobotModel | null;
  /** the SO-101 on top of LeKiwi */
  arm: RobotModel | null;
  loading: boolean;
  sil: THREE.Mesh | null;
  lastWanted: number;
  frozen: boolean;
  armed: boolean;
  playing: { until: number; stop(): void } | null;
  /** inspected or on the compare stage: LOD0 first, the turntable stops */
  focus: boolean;
  /** placement offset of the model in the spinner (cached per robot id) */
  fit: THREE.Vector3 | null;
  /** the last load failed at this game time: no new request for 30 s unless retried */
  failedAt: number;
}

export interface ShowroomStats {
  lod0: number;
  lod1: number;
  sil: number;
  models: number;
  skinnedUpdates: number;
  playing: number;
  maxLod0Seen: number;
  maxLod1Seen: number;
  vorfuehrungen: Record<string, number>;
  loaded: string[];
  /** parsed GLBs released by the LRU, and the LRU now */
  released: number;
  lru: string[];
}

export interface Showroom {
  readonly spots: readonly Spot[];
  plinth(id: RobotId): Spot | null;
  stage(slot: 'a' | 'b'): Spot | null;
  /** put a second instance of `id` on Bühne A or B (null clears it) */
  setStage(slot: 'a' | 'b', id: RobotId | null, o?: { focus?: boolean }): Spot | null;
  /** shown on its plinth (delivered); `false` shows the crate */
  setShown(id: RobotId, shown: boolean): void;
  /** the inspected robot: LOD0, turntable still */
  setFocus(spot: Spot | null): void;
  /** world-independent view data: the robot's centre (local) and radius */
  frame(spot: Spot, out?: THREE.Vector3): { center: THREE.Vector3; radius: number; height: number };
  /** play the robot's Vorführung now (Inspektion's [V]); false when it has none or is not loaded */
  play(spot: Spot): boolean;
  /** a promise for the spot's model at LOD0 (Inspektion, deliveries): resolves when it is shown */
  ensure(spot: Spot): Promise<RobotModel | null>;
  /** the crate instance of a plinth (deliveries take the crate's look) */
  readonly crateMesh: THREE.InstancedMesh;
  /** the joint-axis rings of „Gelenke zeigen“ */
  showJoints(spot: Spot | null): void;
  readonly lineupReady: Promise<boolean>;
  readonly slices: ReadonlyMap<RobotId, Slice>;
  stats(): ShowroomStats;
  update(dt: number): void;
  updateFar(dt: number): void;
  /** loading progress of the nearest robot that is still loading (the loading card) */
  loadingNow(): { id: RobotId; name: string } | null;
  /** robots whose last load failed (the loading card's „Erneut laden“) */
  failed(): RobotId[];
  /** load the failed ones again */
  retry(): void;
  dispose(): void;
}

const LEDGER = 'schauhalle';
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m4 = new THREE.Matrix4();

function tag(o: THREE.Object3D): void {
  o.userData.ledger = LEDGER;
}

/** crate size for a robot (m): it hides the robot's footprint and height */
function crateSize(r: HallRobot, heightM: number): [number, number, number] {
  const p = PLINTH[r.plinth];
  const w = Math.min(p.r * 1.45, Math.max(0.5, p.r * 1.1));
  return [w, Math.max(0.45, Math.min(2.1, heightM * 1.06 + 0.1)), w];
}

export function buildShowroom(ctx: ZoneContext, mats: HallMats): Showroom {
  const det = ctx.groups.detail;
  const ext = ctx.groups.exterior;
  const owned: { dispose(): void }[] = [];
  const now = (): number => ctx.time.elapsed;

  // ── spots: one per plinth robot (the H2's plinth is the Tresor's) ─────────
  const spots: Spot[] = [];
  const makeSpot = (r: HallRobot, where: Where, at: readonly [number, number], topY: number, yawDeg: number, spin: boolean): Spot => {
    const holder = new THREE.Group();
    holder.name = `schauhalle:${where}:${r.id}`;
    holder.position.set(at[0], topY, at[1]);
    holder.rotation.y = THREE.MathUtils.degToRad(yawDeg);
    tag(holder);
    const spinner = new THREE.Group();
    holder.add(spinner);
    det.add(holder);
    return {
      key: `${where}:${r.id}`,
      robot: r,
      where,
      base: new THREE.Vector3(at[0], topY, at[1]),
      yaw: THREE.MathUtils.degToRad(yawDeg),
      spin,
      holder,
      spinner,
      shown: false,
      tier: 'none',
      model: null,
      arm: null,
      loading: false,
      sil: null,
      lastWanted: -1e9,
      frozen: false,
      armed: true,
      playing: null,
      focus: false,
      fit: null,
      failedAt: -1e9,
    };
  };
  for (const r of HALL_ROBOTS) {
    const p = PLINTH[r.plinth];
    spots.push(makeSpot(r, 'plinth', r.at, p.h, r.yawDeg, p.spin));
  }
  const byId = new Map<RobotId, Spot>(spots.map((s) => [s.robot.id, s]));
  const stages: Record<'a' | 'b', Spot | null> = { a: null, b: null };

  // ── static plinth bases (ceramic; exterior: seen through the glass) ───────
  {
    const base: THREE.BufferGeometry[] = [];
    for (const r of HALL_ROBOTS) {
      const p = PLINTH[r.plinth];
      const [x, z] = r.at;
      if (r.plinth === 'column') base.push(cyl(p.r, p.r + 0.04, p.h, 28, x, p.h / 2, z));
      else base.push(cyl(p.r + 0.08, p.r + 0.12, p.h - 0.05, 48, x, (p.h - 0.05) / 2, z));
    }
    for (const at of [STAGES.a, STAGES.b]) base.push(cyl(STAGES.r + 0.1, STAGES.r + 0.14, STAGES.h - 0.05, 56, at[0], (STAGES.h - 0.05) / 2, at[1]));
    const m = new THREE.Mesh(merge(base), mats.ceramic);
    m.name = 'schauhalle:plinths';
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    ext.add(m);
    owned.push(m.geometry);
    // keep-out colliders: you walk round a robot, not through it
    for (const r of HALL_ROBOTS) {
      const p = PLINTH[r.plinth];
      const h = r.plinth === 'column' ? 1.25 : r.cat === 'gehen' && r.plinth !== 'low' ? 2.0 : 1.4;
      ctx.physics.addStaticCylinder({ radius: p.r + 0.12, height: h, position: [r.at[0], h / 2, r.at[1]], surface: 'metal' });
    }
    for (const at of [STAGES.a, STAGES.b]) ctx.physics.addStaticCylinder({ radius: STAGES.r + 0.14, height: 2.0, position: [at[0], 1.0, at[1]], surface: 'metal' });
  }

  // ── turntable tops and their ring lights (instanced: 2 draws for all) ─────
  const discs: { x: number; z: number; y: number; r: number }[] = [];
  for (const r of HALL_ROBOTS) {
    const p = PLINTH[r.plinth];
    if (r.plinth === 'column') continue;
    discs.push({ x: r.at[0], z: r.at[1], y: p.h, r: p.r });
  }
  for (const at of [STAGES.a, STAGES.b]) discs.push({ x: at[0], z: at[1], y: STAGES.h, r: STAGES.r });
  const discGeo = cyl(1, 1, 0.05, 48, 0, -0.025, 0);
  const ringGeo = new THREE.TorusGeometry(1, 0.012, 6, 64).rotateX(Math.PI / 2);
  owned.push(discGeo, ringGeo);
  const discMesh = new THREE.InstancedMesh(discGeo, mats.turntable, discs.length);
  const ringMat = ctx.materials.light(0xfff1e0, 'line');
  const ringMesh = new THREE.InstancedMesh(ringGeo, ringMat, discs.length);
  discMesh.name = 'schauhalle:turntables';
  ringMesh.name = 'schauhalle:ringlights';
  discs.forEach((d, i) => {
    _m4.compose(_v.set(d.x, d.y, d.z), new THREE.Quaternion(), _w.set(d.r, 1, d.r));
    discMesh.setMatrixAt(i, _m4);
    _m4.compose(_v.set(d.x, d.y - 0.03, d.z), new THREE.Quaternion(), _w.set(d.r + 0.02, 1, d.r + 0.02));
    ringMesh.setMatrixAt(i, _m4);
  });
  discMesh.receiveShadow = true;
  for (const m of [discMesh, ringMesh]) {
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.frustumCulled = false;
    det.add(m);
  }

  // ── fake light cones from the ceiling (one additive instanced draw, R4 §7.3; with fog, so they share the
  // instanced transparent program the island already has: WP17) ──
  {
    const coneGeo = new THREE.CylinderGeometry(0.12, 1, 1, 24, 1, true).translate(0, -0.5, 0);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff3e2, transparent: true, opacity: LIGHT.cone, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide, name: 'schauhalle:cones' });
    owned.push(coneGeo, coneMat);
    const list = HALL_ROBOTS.filter((r) => r.plinth !== 'column');
    const cones = new THREE.InstancedMesh(coneGeo, coneMat, list.length + 2);
    cones.name = 'schauhalle:cones';
    const top = 8.7;
    const put = (i: number, x: number, z: number, y: number, r: number): void => {
      _m4.compose(_v.set(x, top, z), new THREE.Quaternion(), _w.set(r * 0.85, top - y, r * 0.85));
      cones.setMatrixAt(i, _m4);
    };
    list.forEach((r, i) => put(i, r.at[0], r.at[1], PLINTH[r.plinth].h, PLINTH[r.plinth].r));
    put(list.length, STAGES.a[0], STAGES.a[1], STAGES.h, STAGES.r);
    put(list.length + 1, STAGES.b[0], STAGES.b[1], STAGES.h, STAGES.r);
    cones.instanceMatrix.needsUpdate = true;
    cones.frustumCulled = false;
    cones.renderOrder = 5;
    det.add(cones);
  }

  // ── crates (one instanced draw): a closed crate on every plinth not delivered yet ──
  const crateGeo = box(1, 1, 1, 0, 0.5, 0);
  owned.push(crateGeo);
  const crateMesh = new THREE.InstancedMesh(crateGeo, ctx.materials.crate, spots.length + 8);
  crateMesh.name = 'schauhalle:crates';
  crateMesh.castShadow = false;
  crateMesh.receiveShadow = true;
  crateMesh.frustumCulled = false;
  crateMesh.count = 0;
  det.add(crateMesh);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const crateSlots = new Map<string, number>();
  spots.forEach((s, i) => crateSlots.set(s.key, i));
  for (let i = 0; i < crateMesh.instanceMatrix.count; i++) crateMesh.setMatrixAt(i, zero);
  crateMesh.count = crateMesh.instanceMatrix.count;
  const setCrate = (s: Spot, on: boolean, heightM: number): void => {
    const i = crateSlots.get(s.key);
    if (i === undefined) return;
    if (!on) crateMesh.setMatrixAt(i, zero);
    else {
      const [w, h, d] = crateSize(s.robot, heightM);
      _m4.compose(_v.copy(s.base), new THREE.Quaternion().setFromAxisAngle(_w.set(0, 1, 0), s.yaw), _w.set(w, h, d));
      crateMesh.setMatrixAt(i, _m4);
    }
    crateMesh.instanceMatrix.needsUpdate = true;
  };

  // ── line-up slices: the far silhouettes and the exterior's merged draw ─────
  const paint = ctx.robots.paint;
  let slices = new Map<RobotId, Slice>();
  // empty until the line-up is in, but with the merged draw's attributes: the zone warm-up compiles hidden
  // meshes too, and a bare geometry would link a paint program of its own (WP17)
  const emptyGeo = (): THREE.BufferGeometry => {
    const g = new THREE.BufferGeometry();
    for (const n of ['position', 'normal', 'color']) g.setAttribute(n, new THREE.Float32BufferAttribute([], 3));
    return g;
  };
  const extSil = new THREE.Mesh(emptyGeo(), paint);
  extSil.name = 'schauhalle:exterior-robots';
  extSil.userData.ledger = LEDGER;
  extSil.matrixAutoUpdate = false;
  extSil.visible = false;
  ext.add(extSil);
  let extDirty = true;
  const rebuildExterior = (): void => {
    extDirty = false;
    if (!slices.size) return;
    const list: THREE.BufferGeometry[] = [];
    const local = new THREE.Matrix4();
    for (const s of spots) {
      const sl = slices.get(s.robot.id);
      if (!sl || !s.shown) continue;
      const g = sl.geometry.clone();
      if (g.getAttribute('uv')) g.deleteAttribute('uv');
      // base · yaw · the slice's own offset in its spinner (arms: their bounds centre)
      const sp = s.sil?.position ?? _w.set(0, 0, 0);
      g.applyMatrix4(_m4.makeRotationY(s.yaw).setPosition(s.base.x, s.base.y, s.base.z).multiply(local.makeTranslation(sp.x, sp.y, sp.z)));
      list.push(g);
    }
    extSil.geometry.dispose();
    extSil.geometry = list.length ? (merge(list) ?? emptyGeo()) : emptyGeo();
  };
  const lineupReady: Promise<boolean> = (async () => {
    try {
      const [m, info] = await Promise.all([ctx.robots.lineup(), ctx.robots.lineupInfo()]);
      if (!info) return false;
      slices = sliceLineup(m, info);
      for (const s of spots) attachSlice(s);
      // the crates take the real heights now
      for (const s of spots) if (!s.shown) setCrate(s, s.robot.arrival.kind !== 'h2', slices.get(s.robot.id)?.heightM ?? 1.2);
      extDirty = true;
      return true;
    } catch (err) {
      console.warn('[schauhalle] line-up failed: plinths stay crates until their models load', err);
      return false;
    }
  })();
  function attachSlice(s: Spot): void {
    const sl = slices.get(s.robot.id);
    if (!sl || s.sil) return;
    const m = new THREE.Mesh(sl.geometry, paint);
    m.name = `schauhalle:sil:${s.robot.id}`;
    m.userData.ledger = LEDGER;
    m.castShadow = false;
    m.receiveShadow = true;
    m.visible = false;
    s.sil = m;
    s.spinner.add(m);
    applyFit(s);
  }


  // ── placement: stand the model on its plinth (floor y = 0 of the model frame), centred where it walks ──
  const fits = new Map<RobotId, THREE.Vector3>();
  const centred = (r: HallRobot): boolean => r.plinth === 'turntable' || r.plinth === 'low' || r.plinth === 'column';
  const measureFit = (r: HallRobot, model: RobotModel): THREE.Vector3 => {
    const known = fits.get(r.id);
    if (known) return known;
    const mesh = findSkinned(model.object);
    const out = new THREE.Vector3();
    if (mesh) {
      model.object.position.set(0, 0, 0);
      model.object.rotation.set(0, 0, 0);
      model.object.updateMatrixWorld(true);
      mesh.skeleton.update();
      mesh.computeBoundingBox();
      const b = mesh.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
      out.set(centred(r) ? -(b.min.x + b.max.x) / 2 : 0, -b.min.y, centred(r) ? -(b.min.z + b.max.z) / 2 : 0);
      // a model that stands on its own floor needs no lift (rounding noise of the bounds)
      if (Math.abs(out.y) < 0.004) out.y = 0;
    }
    fits.set(r.id, out);
    return out;
  };
  function applyFit(s: Spot): void {
    const f = fits.get(s.robot.id) ?? null;
    s.fit = f;
    if (s.model && f) s.model.object.position.copy(f);
    if (s.sil) {
      // the slice is centred on its bounds in x and z with its floor at 0; match the model's bounds
      const bb = s.sil.geometry.boundingBox;
      if (f && bb && !centred(s.robot)) {
        const cx = (bb.min.x + bb.max.x) / 2;
        const cz = (bb.min.z + bb.max.z) / 2;
        s.sil.position.set(modelCentre.get(s.robot.id)?.x ?? cx, 0, modelCentre.get(s.robot.id)?.z ?? cz);
      } else s.sil.position.set(0, 0, 0);
    }
  }

  /** the model's bounds centre (x, z) in its own frame after the fit, for arms whose origin is the base */
  const modelCentre = new Map<RobotId, THREE.Vector3>();

  // ── models ─────────────────────────────────────────────────────────────
  const lru: RobotId[] = [];
  let creates = 0;
  let released = 0;
  const statsAcc = { maxLod0Seen: 0, maxLod1Seen: 0, vorf: {} as Record<string, number> };

  function freeze(s: Spot): void {
    const m = s.model;
    if (!m) return;
    for (const x of [m, s.arm]) {
      if (!x) continue;
      const mesh = findSkinned(x.object);
      if (!mesh) continue;
      x.object.updateMatrixWorld(true);
      thawMesh(mesh);
      mesh.updateMatrixWorld(true);
      mesh.skeleton.update();
      freezeMesh(mesh);
    }
    s.frozen = true;
  }
  function thaw(s: Spot): void {
    for (const x of [s.model, s.arm]) {
      const mesh = x ? findSkinned(x.object) : null;
      if (mesh) thawMesh(mesh);
    }
    s.frozen = false;
  }

  async function loadModel(s: Spot, lod: 0 | 1): Promise<void> {
    if (s.loading || s.model) return;
    s.loading = true;
    try {
      // shadows: only the walking robots at LOD0 (the hall's shadow pass stays small)
      const tall = s.robot.cat === 'gehen';
      const model = await ctx.robots.load(s.robot.id, { priority: 'now', lod, castShadow: false });
      ctx.robots.untrack(model);
      // another spot may have asked meanwhile; a spot that no longer wants it lets it go
      if (s.model || (!s.shown && s.where === 'plinth') || (now() - s.lastWanted > GOVERNOR.keepS && !s.focus)) {
        model.dispose();
        return;
      }
      tag(model.object);
      const f = measureFit(s.robot, model);
      if (!modelCentre.has(s.robot.id)) {
        const mesh = findSkinned(model.object);
        if (mesh?.boundingBox) {
          const b = mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
          modelCentre.set(s.robot.id, new THREE.Vector3((b.min.x + b.max.x) / 2, 0, (b.min.z + b.max.z) / 2));
        }
      }
      model.object.position.copy(f);
      model.castShadow = lod === 0 && !!tall;
      s.spinner.add(model.object);
      s.model = model;
      applyFit(s);
      // LeKiwi carries an SO-101 arm on its mount (manifest mounts.arm): the real arm, not a rebuild
      if (s.robot.id === 'lekiwi-base') void mountArm(s);
      freeze(s);
      const i = lru.indexOf(s.robot.id);
      if (i >= 0) lru.splice(i, 1);
      ctx.events.emit('schauhalle:model', { id: s.robot.id, where: s.where, lod });
    } catch (err) {
      s.failedAt = now();
      console.warn(`[schauhalle] ${s.robot.id} failed to load`, err);
    } finally {
      s.loading = false;
    }
  }

  async function mountArm(s: Spot): Promise<void> {
    try {
      const info = await ctx.robots.info('lekiwi-base');
      const link = info.mounts?.arm;
      const arm = await ctx.robots.load('so101', { priority: 'now', lod: 1, castShadow: false });
      ctx.robots.untrack(arm);
      if (!s.model || s.arm || !link || !s.model.hasLink(link)) {
        arm.dispose();
        return;
      }
      tag(arm.object);
      // the mount link's position in the base's own frame; the arm stands upright on it (y up, like
      // every model frame), facing the base's front
      s.model.object.updateMatrixWorld(true);
      const w = s.model.getLinkWorldPosition(link, new THREE.Vector3());
      if (!w) {
        arm.dispose();
        return;
      }
      s.model.object.worldToLocal(w);
      arm.object.position.copy(w);
      s.model.object.add(arm.object);
      s.arm = arm;
      freeze(s);
    } catch (err) {
      console.warn('[schauhalle] LeKiwi arm failed', err);
    }
  }

  function dropModel(s: Spot): void {
    if (s.playing) {
      s.playing.stop();
      s.playing = null;
    }
    s.arm?.dispose();
    s.arm = null;
    if (!s.model) return;
    const id = s.robot.id;
    s.model.dispose();
    s.model = null;
    s.frozen = false;
    // LRU of parsed files beyond the visible set (§5.9): the oldest beyond 3 is released
    if (!spots.some((x) => x.model && x.robot.id === id) && !(['a', 'b'] as const).some((k) => stages[k]?.model && stages[k]!.robot.id === id)) {
      lru.push(id);
      while (lru.length > GOVERNOR.lruFiles) {
        const old = lru.shift()!;
        if (ctx.robots.release?.(old)) released++;
      }
    }
  }

  // ── the governor ────────────────────────────────────────────────────────
  let govT = 0;
  const all = (): Spot[] => [...spots, ...(stages.a ? [stages.a] : []), ...(stages.b ? [stages.b] : [])];
  const dist = new Map<Spot, number>();
  function govern(): void {
    const cam = ctx.camera.getWorldPosition(_v);
    const local = ctx.toLocal(cam, _w);
    const visible = det.visible;
    const list = all().filter((s) => s.shown);
    for (const s of list) dist.set(s, Math.hypot(local.x - s.base.x, local.z - s.base.z, (local.y - s.base.y - 0.8) * 0.5));
    const H = GOVERNOR.hysteresisM;
    const order = list
      .filter(() => visible)
      .sort((a, b) => (a.focus === b.focus ? dist.get(a)! - dist.get(b)! : a.focus ? -1 : 1));
    let n0 = 0;
    let n1 = 0;
    const want = new Map<Spot, Tier>();
    for (const s of order) {
      const d = dist.get(s)!;
      let t: Tier = 'sil';
      if (n0 < GOVERNOR.maxLod0 && (s.focus || d < GOVERNOR.lod0M + (s.tier === 0 ? H : 0))) {
        t = 0;
        n0++;
      } else if (n1 < GOVERNOR.maxLod1 && d < GOVERNOR.lod1M + (s.tier === 1 || s.tier === 0 ? H : 0)) {
        t = 1;
        n1++;
      }
      want.set(s, t);
    }
    for (const s of all()) {
      const t: Tier = !s.shown ? 'none' : want.get(s) ?? (visible ? 'sil' : 'none');
      if (t === 0 || t === 1) s.lastWanted = now();
      setTier(s, t);
    }
    statsAcc.maxLod0Seen = Math.max(statsAcc.maxLod0Seen, all().filter((s) => s.model && s.tier === 0).length);
    statsAcc.maxLod1Seen = Math.max(statsAcc.maxLod1Seen, all().filter((s) => s.model && s.tier === 1).length);
  }
  function setTier(s: Spot, t: Tier): void {
    s.tier = t;
    if (t === 0 || t === 1) {
      if (!s.model && !s.loading && creates < GOVERNOR.createsPerFrame && now() - s.failedAt > 30) {
        creates++;
        void loadModel(s, t);
      }
      if (s.model) {
        s.model.lod = t;
        s.model.castShadow = t === 0 && s.robot.cat === 'gehen';
      }
    } else if (s.model && now() - s.lastWanted > GOVERNOR.keepS && !s.focus) dropModel(s);
    // what shows: the model at LOD0/1 when it is in, else the slice (also while a model loads)
    const modelOn = !!s.model && (t === 0 || t === 1);
    if (s.model) s.model.object.visible = modelOn;
    if (s.sil) s.sil.visible = s.shown && !modelOn && t !== 'none';
  }

  // ── the Vorführung on approach (≤ 6 m, once per approach, ≤ 2 at once) ─────
  function play(s: Spot): boolean {
    const clip: RobotClip | undefined = CLIPS[s.robot.id];
    if (!clip || !s.model) return false;
    if (s.playing) s.playing.stop();
    thaw(s);
    const a = ctx.robots.animate(s.model, clip);
    const b = s.arm ? ctx.robots.animate(s.arm, LEKIWI_ARM_CLIP) : null;
    const rm = ctx.settings.reducedMotion;
    s.playing = {
      until: now() + (rm ? 0 : clip.duration) + 0.1,
      stop() {
        a.stop();
        b?.stop();
      },
    };
    statsAcc.vorf[s.key] = (statsAcc.vorf[s.key] ?? 0) + 1;
    ctx.events.emit('schauhalle:vorfuehrung', { id: s.robot.id, where: s.where });
    return true;
  }
  function vorfuehrung(): void {
    const p = ctx.player.positionLocal(_v);
    const playing = all().filter((s) => s.playing).length;
    let slots = VORFUEHRUNG.maxPlaying - playing;
    const cands = spots
      .filter((s) => s.shown && s.model && (s.tier === 0 || s.tier === 1))
      .map((s) => ({ s, d: Math.hypot(p.x - s.base.x, p.z - s.base.z) }))
      .sort((a, b) => a.d - b.d);
    for (const { s, d } of cands) {
      if (d > VORFUEHRUNG.rearmM) s.armed = true;
      if (slots <= 0 || !s.armed || s.playing || d > VORFUEHRUNG.triggerM) continue;
      s.armed = false;
      if (play(s)) slots--;
    }
    // walked away (≥ rearm distance, whatever tier the robot is at now): the next approach plays again
    for (const s of spots) if (s.shown && !s.playing && Math.hypot(p.x - s.base.x, p.z - s.base.z) > VORFUEHRUNG.rearmM) s.armed = true;
  }

  // ── turntables ──────────────────────────────────────────────────────────
  const spinT = new Map<Spot, number>();
  function spin(dt: number): void {
    const rm = ctx.settings.reducedMotion;
    const w = (Math.PI * 2) / TURNTABLE.periodS;
    for (const s of all()) {
      if (!s.spin || !s.shown) continue;
      if (rm || s.focus) continue;
      const t = (spinT.get(s) ?? 0) + dt * w;
      spinT.set(s, t);
      s.spinner.rotation.y = t;
    }
  }

  // ── „Gelenke zeigen“: an orange ring at every moving joint of the inspected robot ──
  const jointGeo = new THREE.TorusGeometry(0.045, 0.008, 6, 24);
  owned.push(jointGeo);
  const jointMesh = new THREE.InstancedMesh(jointGeo, ctx.materials.forInstancing(ctx.materials.orangePaint), 64);
  jointMesh.name = 'schauhalle:joints';
  jointMesh.count = 0;
  jointMesh.frustumCulled = false;
  jointMesh.userData.ledger = LEDGER;
  det.add(jointMesh);
  let jointsOf: Spot | null = null;
  const _q = new THREE.Quaternion();
  const _z = new THREE.Vector3(0, 0, 1);
  function updateJoints(): void {
    const s = jointsOf;
    if (!s || !s.model) {
      jointMesh.count = 0;
      return;
    }
    let n = 0;
    const toLocal = new THREE.Matrix4().copy(ctx.root.matrixWorld).invert();
    for (const j of s.model.joints) {
      if (n >= 64) break;
      const node = s.model.jointNode(j.name);
      if (!node) continue;
      node.updateWorldMatrix(true, false);
      _m4.multiplyMatrices(toLocal, node.matrixWorld);
      const pos = new THREE.Vector3().setFromMatrixPosition(_m4);
      const q = new THREE.Quaternion().setFromRotationMatrix(_m4);
      const axis = j.axis.clone().applyQuaternion(q).normalize();
      _q.setFromUnitVectors(_z, axis);
      const k = THREE.MathUtils.clamp(s.robot.cat === 'gehen' ? 1.3 : s.robot.id === 'fanuc-r2000ic-165f' ? 3 : 1, 0.6, 3);
      _m4.compose(pos, _q, _w.set(k, k, k));
      jointMesh.setMatrixAt(n++, _m4);
    }
    jointMesh.count = n;
    jointMesh.instanceMatrix.needsUpdate = true;
  }

  // ── the stage instances (Bühne A / B): deliveries and the compare stage ───
  function setStage(slot: 'a' | 'b', id: RobotId | null, o: { focus?: boolean } = {}): Spot | null {
    const cur = stages[slot];
    if (cur && (!id || cur.robot.id !== id)) {
      dropModel(cur);
      cur.sil?.removeFromParent();
      det.remove(cur.holder);
      stages[slot] = null;
    }
    if (!id) return null;
    if (stages[slot]) {
      stages[slot]!.focus = !!o.focus;
      return stages[slot];
    }
    const r = HALL_ROBOTS.find((x) => x.id === id);
    if (!r) return null;
    const at = slot === 'a' ? STAGES.a : STAGES.b;
    const s = makeSpot(r, slot, at, STAGES.h, 0, true);
    s.shown = true;
    s.focus = !!o.focus;
    stages[slot] = s;
    attachSlice(s);
    return s;
  }

  // ── public ──────────────────────────────────────────────────────────────
  const api: Showroom = {
    spots,
    plinth: (id) => byId.get(id) ?? null,
    stage: (slot) => stages[slot],
    setStage,
    setShown(id, shown) {
      const s = byId.get(id);
      if (!s) return;
      const h = slices.get(id)?.heightM ?? 1.2;
      setCrate(s, !shown && s.robot.arrival.kind !== 'h2', h);
      if (s.shown === shown) return;
      s.shown = shown;
      if (!shown) dropModel(s);
      extDirty = true;
    },
    setFocus(spot) {
      for (const s of all()) if (s.where === 'plinth') s.focus = false;
      if (spot) spot.focus = true;
      govT = GOVERNOR.everyS;
    },
    frame(spot, out = new THREE.Vector3()) {
      const sl = slices.get(spot.robot.id);
      const h = sl?.heightM ?? 1.2;
      const bb = sl?.geometry.boundingBox;
      const rad = bb ? Math.max(0.25, Math.hypot(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) / 2) : 0.8;
      out.copy(spot.base).add(_v.set(0, Math.min(h * 0.55, 1.4), 0));
      return { center: out, radius: rad, height: h };
    },
    play,
    async ensure(spot) {
      spot.lastWanted = now();
      const prevFocus = spot.focus;
      spot.focus = true;
      if (!spot.model) {
        await loadModel(spot, 0);
      }
      spot.focus = prevFocus;
      return spot.model;
    },
    crateMesh,
    showJoints(spot) {
      jointsOf = spot;
      if (!spot) jointMesh.count = 0;
    },
    lineupReady,
    get slices() {
      return slices;
    },
    stats() {
      const list = all();
      let skinned = 0;
      for (const s of list) for (const x of [s.model, s.arm]) if (x && x.object.visible && !isFrozen(x)) skinned++;
      return {
        lod0: list.filter((s) => s.model && s.model.object.visible && s.tier === 0).length,
        lod1: list.filter((s) => s.model && s.model.object.visible && s.tier === 1).length,
        sil: list.filter((s) => s.sil?.visible).length,
        models: list.filter((s) => s.model).length,
        skinnedUpdates: skinned,
        playing: list.filter((s) => s.playing).length,
        maxLod0Seen: statsAcc.maxLod0Seen,
        maxLod1Seen: statsAcc.maxLod1Seen,
        vorfuehrungen: { ...statsAcc.vorf },
        loaded: list.filter((s) => s.model).map((s) => `${s.key}@${s.tier}`),
        released,
        lru: [...lru],
      };
    },
    update(dt) {
      creates = 0;
      govT += dt;
      if (govT >= GOVERNOR.everyS) {
        govT = 0;
        govern();
        vorfuehrung();
      }
      spin(dt);
      for (const s of all())
        if (s.playing && now() >= s.playing.until) {
          s.playing = null;
          freeze(s);
        }
      if (jointsOf) updateJoints();
      if (extDirty) rebuildExterior();
      extSil.visible = !det.visible && extSil.geometry.getAttribute('position').count > 0;
    },
    updateFar() {
      if (extDirty) rebuildExterior();
      extSil.visible = !det.visible && extSil.geometry.getAttribute('position').count > 0;
      // far away: let the models go (the governor also does it while active)
      govT += 0.016;
      if (govT > 1) {
        govT = 0;
        for (const s of all()) if (s.model && now() - s.lastWanted > GOVERNOR.keepS && !s.focus) dropModel(s);
      }
    },
    loadingNow() {
      const p = ctx.player.positionLocal(_v);
      let best: Spot | null = null;
      let bd = Infinity;
      for (const s of all()) {
        if (!s.loading) continue;
        const d = Math.hypot(p.x - s.base.x, p.z - s.base.z);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      return best ? { id: best.robot.id, name: best.robot.short } : null;
    },
    failed() {
      return all()
        .filter((s) => now() - s.failedAt <= 30 && !s.model)
        .map((s) => s.robot.id);
    },
    retry() {
      for (const s of all()) s.failedAt = -1e9;
      govT = GOVERNOR.everyS;
    },
    dispose() {
      for (const s of all()) dropModel(s);
      for (const sl of slices.values()) sl.geometry.dispose();
      extSil.geometry.dispose();
      owned.forEach((o) => o.dispose());
    },
  };
  ctx.onDispose(() => api.dispose());
  return api;
}

// ── skinning freeze (see the header) ─────────────────────────────────────────

export function findSkinned(o: THREE.Object3D): THREE.SkinnedMesh | null {
  let out: THREE.SkinnedMesh | null = null;
  o.traverse((n) => {
    if (!out && (n as THREE.SkinnedMesh).isSkinnedMesh) out = n as THREE.SkinnedMesh;
  });
  return out;
}

const FROZEN = Symbol('schauhalle:frozen');
const noop = (): void => undefined;
function freezeMesh(mesh: THREE.SkinnedMesh): void {
  const sk = mesh.skeleton as THREE.Skeleton & { [FROZEN]?: true };
  if (sk[FROZEN]) return;
  sk[FROZEN] = true;
  // the bone matrices keep this pose; the bind inverse stays the inverse of THIS world matrix, so the
  // shader's mesh-local result stays exact while the mesh's world transform (the turntable) changes
  (sk as unknown as { update: () => void }).update = noop;
  (mesh as unknown as { updateMatrixWorld: (f?: boolean) => void }).updateMatrixWorld = function (this: THREE.SkinnedMesh, force?: boolean) {
    THREE.Object3D.prototype.updateMatrixWorld.call(this, force);
  };
}
function thawMesh(mesh: THREE.SkinnedMesh): void {
  const sk = mesh.skeleton as THREE.Skeleton & { [FROZEN]?: true };
  if (!sk[FROZEN]) return;
  delete sk[FROZEN];
  delete (sk as unknown as { update?: unknown }).update;
  delete (mesh as unknown as { updateMatrixWorld?: unknown }).updateMatrixWorld;
}
function isFrozen(m: RobotModel): boolean {
  const mesh = findSkinned(m.object);
  return !!mesh && !!(mesh.skeleton as THREE.Skeleton & { [FROZEN]?: true })[FROZEN];
}
