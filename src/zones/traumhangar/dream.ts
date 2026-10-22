import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { DREAM } from './tuning';

/** A static of the dream world (zone-local): a box (centre, half sizes) or an upright cylinder. */
export type DreamStatic = { kind: 'box'; x: number; y: number; z: number; hx: number; hy: number; hz: number } | { kind: 'cyl'; x: number; z: number; r: number; h: number };

/** A dynamic object the dream may remember (created once, disabled until a dream remembers it). */
export interface DreamObjectDef {
  id: string;
  hx: number;
  hy: number;
  hz: number;
  mass: number;
  kinematic: boolean;
}

/** How the dreamt robot moves: the pilot's held command, or a route (MPC plan) it pursues. */
export type DreamDrive = { kind: 'cmd'; v: number; w: number } | { kind: 'route'; wps: readonly (readonly [number, number])[]; v: number; turn: number };

/** What the dream starts from: reality now, as far as the robot remembers it. */
export interface DreamState {
  /** root position (zone-local) and velocity; heading (rad, 0 = +z, + toward +x) */
  x: number;
  z: number;
  vx: number;
  vz: number;
  head: number;
  drive: DreamDrive;
  /** a box carried at the chest: the dream forgets it when it stays hidden from the start eye too long */
  carrying: boolean;
  /** dynamic objects still remembered (hidden ≤ forgetS): position, velocity, half size, mass, kinematic */
  objects: { id: string; x: number; y: number; z: number; vx: number; vz: number; hx: number; hy: number; hz: number; mass: number; kinematic: boolean }[];
}

/** One head's prediction: the root path, where everything ends, and the poses at the sample times. */
export interface DreamResult {
  trail: Float32Array;
  n: number;
  x: number;
  z: number;
  head: number;
  /** the dreamt robot ran into a static (it stopped there) */
  hit: boolean;
  /** the carried box dropped out of the dream (object permanence) */
  boxLost: boolean;
  /** dream time (s) when the box was lost, or −1 */
  lostAt: number;
  objects: Map<string, { x: number; y: number; z: number }>;
  /** poses at `samples` times (s): [x, z, head] each */
  at: { t: number; x: number; z: number; head: number; boxLost: boolean }[];
}

interface Head {
  robot: RAPIER_NS.RigidBody;
  objects: Map<string, RAPIER_NS.RigidBody>;
  groups: number;
  mu: number;
  head: number;
  wi: number;
  rng: () => number;
  trail: Float32Array;
  n: number;
  nx: number;
  nz: number;
  /** the noise as the trail draws it (low-passed: a blur, not a scribble; the end point is exact) */
  sx: number;
  sz: number;
  hit: boolean;
  /** this step's commanded speed (m/s) */
  want: number;
  hidden: number;
  boxLost: boolean;
  lostAt: number;
  at: DreamResult['at'];
}

/**
 * The toy world model (plan §4.8, R3 §5.3), moved in from WP2's spike: K „Traumköpfe“ stepped ahead with
 * the learned assumptions — μ̂ = 0.8 everywhere (the training floor), labelled masses, no gusts — plus a
 * position random walk, so the K endings spread ∝ √t and drift off where reality is not the training
 * floor (ice). Objects the robot has not seen for > 1 s are left out (object permanence); a carried box
 * that stays hidden from where the dream started for > 1 s drops out of the dream too.
 *
 * Spike findings kept: the K heads share ONE private Rapier world separated by collision groups (each
 * head collides with the statics and its own bodies only; one step for all K heads costs a fraction of K
 * worlds); every body is created up front (a body made inside a dream rebuilds the broad phase); stepping
 * is time-boxed per frame (`budgetMs`); longer horizons step coarser (`stepFor`).
 */
export class DreamEnsemble {
  private heads: Head[] = [];
  private R: typeof RAPIER_NS;
  private world: RAPIER_NS.World;
  private total = 0;
  private done = 0;
  private dt = 1 / 60;
  running = false;
  horizon: number = 2;
  readonly results: DreamResult[] = [];
  /** per-dream cost (ms of stepping) and the frames it took */
  lastMs = 0;
  lastFrames = 0;
  private ms = 0;
  private frames = 0;
  /** the smoothed cost of one step (ms), for the budget check before the next */
  private stepMs = 0.1;
  private state: DreamState | null = null;
  private samples: readonly number[] = [];
  private occluded: ((ex: number, ez: number, x: number, z: number) => boolean) | null = null;

  constructor(
    R: typeof RAPIER_NS,
    statics: readonly DreamStatic[],
    objects: readonly DreamObjectDef[] = [],
    o: { k?: number; radius?: number; seed?: number } = {},
  ) {
    this.R = R;
    const world = (this.world = new R.World({ x: 0, y: -9.81, z: 0 }));
    const K = o.k ?? DREAM.k;
    const radius = o.radius ?? 0.2;
    // statics: group bit 0, collide with every head
    const sg = (0x0001 << 16) | 0xffff;
    const fb = world.createRigidBody(R.RigidBodyDesc.fixed());
    world.createCollider(R.ColliderDesc.cuboid(60, 0.1, 60).setTranslation(0, -0.1, 0).setFriction(DREAM.muHat).setCollisionGroups(sg), fb);
    for (const s of statics) {
      const d = s.kind === 'box' ? R.ColliderDesc.cuboid(s.hx, s.hy, s.hz).setTranslation(s.x, s.y, s.z) : R.ColliderDesc.cylinder(s.h / 2, s.r).setTranslation(s.x, s.h / 2, s.z);
      world.createCollider(d.setCollisionGroups(sg), fb);
    }
    for (let k = 0; k < K; k++) {
      const bit = 1 << (k + 1);
      const groups = (bit << 16) | 0x0001 | bit;
      const mu = DREAM.muHat + (k - (K - 1) / 2) * (DREAM.muJitter / ((K - 1) / 2 || 1));
      // the robot: an upright capsule (its velocity driven by the traction model)
      const robot = world.createRigidBody(R.RigidBodyDesc.dynamic().lockRotations().setTranslation(k * 4, 0.65, -40).setCanSleep(false));
      // frictionless against the floor (Min rule): the traction model below is the only grip — the 10 Hz
      // step of the 8 s dream would otherwise brake the capsule to a stop every step
      world.createCollider(R.ColliderDesc.capsule(0.45, radius).setFriction(0).setFrictionCombineRule(R.CoefficientCombineRule.Min).setMass(35).setCollisionGroups(groups), robot);
      let s = ((o.seed ?? 7) * 9301 + k * 49297) % 233280;
      const rng = (): number => (s = (s * 9301 + 49297) % 233280) / 233280;
      const head: Head = { robot, objects: new Map(), groups, mu, head: 0, wi: 0, rng, trail: new Float32Array(0), n: 0, nx: 0, nz: 0, sx: 0, sz: 0, hit: false, want: 0, hidden: 0, boxLost: false, lostAt: -1, at: [] };
      for (const ob of objects) {
        const b = world.createRigidBody((ob.kinematic ? R.RigidBodyDesc.kinematicVelocityBased() : R.RigidBodyDesc.dynamic()).setTranslation(k * 4, -20, -40).setEnabled(false));
        world.createCollider(R.ColliderDesc.cuboid(ob.hx, ob.hy, ob.hz).setFriction(mu).setMass(ob.mass).setCollisionGroups(groups), b);
        head.objects.set(ob.id, b);
      }
      this.heads.push(head);
    }
    world.step();
  }

  get k(): number {
    return this.heads.length;
  }

  /**
   * The step of a horizon (spike finding, 4× CPU, ≤ 8 ms per dream): 60 Hz for the 0.5 s dream, 30 Hz
   * up to 2.5 s, 10 Hz beyond (the 8 s dream blurs anyway).
   */
  static stepFor(horizon: number): number {
    return horizon <= 0.6 ? 1 / 60 : horizon <= 2.5 ? 1 / 30 : 1 / 10;
  }

  /**
   * Start a dream from `state` over `horizon` s; frames then advance it with `tick()`. `samples`: dream
   * times (s) whose poses are recorded (B shows 0,5 / 2 / 8 s in parallel). `occluded(eye, point)`:
   * whether a point is hidden from the start eye (the carried box's object permanence).
   */
  start(state: DreamState, horizon: number, o: { samples?: readonly number[]; occluded?: (ex: number, ez: number, x: number, z: number) => boolean } = {}): void {
    const R = this.R;
    this.horizon = horizon;
    this.state = state;
    this.samples = o.samples ?? [];
    this.occluded = o.occluded ?? null;
    this.dt = DreamEnsemble.stepFor(horizon);
    this.world.timestep = this.dt;
    this.total = Math.round(horizon / this.dt);
    this.done = 0;
    this.ms = 0;
    this.frames = 0;
    this.results.length = 0;
    const per = Math.max(1, Math.round(DREAM.sampleEvery / 60 / this.dt));
    const samples = Math.ceil(this.total / per) + 3;
    for (const h of this.heads) {
      h.robot.setTranslation({ x: state.x, y: 0.65, z: state.z }, true);
      h.robot.setLinvel({ x: state.vx, y: 0, z: state.vz }, true);
      h.head = state.head;
      h.wi = 0;
      h.nx = h.nz = h.sx = h.sz = 0;
      h.hit = false;
      h.hidden = 0;
      h.boxLost = false;
      h.lostAt = -1;
      h.at = [];
      if (h.trail.length < samples * 2) h.trail = new Float32Array(samples * 2);
      h.n = 0;
      // the remembered objects: enable what is needed, park what is forgotten
      const keep = new Set(state.objects.map((ob) => ob.id));
      for (const [id, b] of h.objects) if (!keep.has(id)) b.setEnabled(false);
      for (const ob of state.objects) {
        let b = h.objects.get(ob.id);
        if (!b) {
          // an object nobody announced: created late (the first step after it is expensive)
          b = this.world.createRigidBody(ob.kinematic ? R.RigidBodyDesc.kinematicVelocityBased() : R.RigidBodyDesc.dynamic());
          this.world.createCollider(R.ColliderDesc.cuboid(ob.hx, ob.hy, ob.hz).setFriction(h.mu).setMass(ob.mass).setCollisionGroups(h.groups), b);
          h.objects.set(ob.id, b);
        }
        b.setEnabled(true);
        b.setTranslation({ x: ob.x, y: ob.y, z: ob.z }, true);
        b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        b.setLinvel({ x: ob.vx, y: 0, z: ob.vz }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
    this.running = true;
  }

  /** Step the shared world for at most `budgetMs`; true when the dream is complete. */
  tick(budgetMs: number = DREAM.budgetMs): boolean {
    if (!this.running || !this.state) return false;
    const st = this.state;
    const t0 = performance.now();
    this.frames++;
    const dt = this.dt;
    const sq = Math.sqrt(dt);
    const per = Math.max(1, Math.round(DREAM.sampleEvery / 60 / dt));
    const lp = 1 - Math.exp(-dt / 0.6);
    let steps = 0;
    while (this.done < this.total) {
      // stay inside the budget: no step that would run past it (one step per frame at least)
      if (steps > 0 && performance.now() - t0 + this.stepMs > budgetMs) break;
      const s0 = performance.now();
      steps++;
      const tNow = (this.done + 1) * dt;
      for (const h of this.heads) {
        const lv = h.robot.linvel();
        const p = h.robot.translation();
        let wx = 0,
          wz = 0;
        const dr = st.drive;
        if (dr.kind === 'cmd') {
          h.head += dr.w * dt;
          wx = Math.sin(h.head) * dr.v;
          wz = Math.cos(h.head) * dr.v;
        } else if (!h.hit) {
          // pursue the route (the planner's waypoints), turning at most dr.turn rad/s
          while (h.wi < dr.wps.length - 1 && Math.hypot(dr.wps[h.wi][0] - p.x, dr.wps[h.wi][1] - p.z) < 0.45) h.wi++;
          const w = dr.wps[Math.min(h.wi, dr.wps.length - 1)];
          if (w && Math.hypot(w[0] - p.x, w[1] - p.z) > 0.05) {
            let e = Math.atan2(w[0] - p.x, w[1] - p.z) - h.head;
            e = Math.atan2(Math.sin(e), Math.cos(e));
            h.head += Math.max(-dr.turn * dt, Math.min(dr.turn * dt, e));
            const v = dr.v * Math.max(0, Math.min(1, (Math.cos(e) - 0.5) / 0.5));
            wx = Math.sin(h.head) * v;
            wz = Math.cos(h.head) * v;
          }
        }
        h.want = Math.hypot(wx, wz);
        // traction μ̂·g: the dream knows only the training floor
        let dx = wx - lv.x,
          dz = wz - lv.z;
        const lim = h.mu * 9.81 * dt;
        const n = Math.hypot(dx, dz);
        if (n > lim) {
          dx *= lim / n;
          dz *= lim / n;
        }
        h.robot.setLinvel({ x: lv.x + dx, y: lv.y, z: lv.z + dz }, true);
        // the model's uncertainty: a position random walk (σ·√t; sum of 3 uniforms ≈ normal)
        const g1 = (h.rng() + h.rng() + h.rng() - 1.5) * 2,
          g2 = (h.rng() + h.rng() + h.rng() - 1.5) * 2;
        h.nx += g1 * DREAM.noise * sq;
        h.nz += g2 * DREAM.noise * sq;
        const x = p.x + h.nx,
          z = p.z + h.nz;
        // object permanence of the carried box (from where the dream started)
        if (st.carrying && !h.boxLost && this.occluded) {
          h.hidden = this.occluded(st.x, st.z, x, z) ? h.hidden + dt : 0;
          if (h.hidden > DREAM.forgetS) {
            h.boxLost = true;
            h.lostAt = tNow;
          }
        }
        h.sx += (h.nx - h.sx) * lp;
        h.sz += (h.nz - h.sz) * lp;
        if (this.done % per === 0) {
          h.trail[h.n * 2] = p.x + h.sx;
          h.trail[h.n * 2 + 1] = p.z + h.sz;
          h.n++;
        }
        for (const ts of this.samples) if (Math.abs(tNow - ts) < dt / 2 + 1e-6) h.at.push({ t: ts, x, z, head: h.head, boxLost: h.boxLost });
      }
      this.world.step();
      // a head that walked into a static stops trying (it hit the wall in its dream)
      // (judged against this step's command: turning in place is not a hit)
      for (const h of this.heads) {
        const lv = h.robot.linvel();
        if (!h.hit && h.want > 0.1 && Math.hypot(lv.x, lv.z) < h.want * 0.15 && this.done * dt > 0.4) h.hit = true;
      }
      this.done++;
      // the cost of one step (all heads + the world), smoothed: the next frame's budget check uses it
      this.stepMs += (performance.now() - s0 - this.stepMs) * 0.3;
    }
    this.ms += performance.now() - t0;
    if (this.done < this.total) return false;
    for (const h of this.heads) {
      const p = h.robot.translation();
      const x = p.x + h.nx,
        z = p.z + h.nz;
      h.trail[h.n * 2] = x;
      h.trail[h.n * 2 + 1] = z;
      h.n++;
      const objects = new Map<string, { x: number; y: number; z: number }>();
      for (const [id, b] of h.objects) if (b.isEnabled()) objects.set(id, { ...b.translation() });
      for (const ts of this.samples) if (!h.at.some((a) => a.t === ts)) h.at.push({ t: ts, x, z, head: h.head, boxLost: h.boxLost });
      this.results.push({ trail: h.trail, n: h.n, x, z, head: h.head, hit: h.hit, boxLost: h.boxLost, lostAt: h.lostAt, objects, at: h.at });
    }
    this.running = false;
    this.lastMs = this.ms;
    this.lastFrames = this.frames;
    return true;
  }

  /** Stop a dream that is running (the pilot let go, the station reset). */
  cancel(): void {
    this.running = false;
    this.results.length = 0;
  }

  /** the spread of the K endings (m, RMS around their mean) */
  spread(): number {
    const r = this.results;
    if (!r.length) return 0;
    let mx = 0,
      mz = 0;
    for (const x of r) {
      mx += x.x / r.length;
      mz += x.z / r.length;
    }
    let s = 0;
    for (const x of r) s += (x.x - mx) ** 2 + (x.z - mz) ** 2;
    return Math.sqrt(s / r.length);
  }

  /** the mean ending (x, z, head) */
  mean(): { x: number; z: number; head: number } {
    const r = this.results;
    let x = 0,
      z = 0,
      sx = 0,
      cz = 0;
    for (const e of r) {
      x += e.x / r.length;
      z += e.z / r.length;
      sx += Math.sin(e.head);
      cz += Math.cos(e.head);
    }
    return { x, z, head: Math.atan2(sx, cz) };
  }

  dispose(): void {
    this.world.free();
    this.heads = [];
    this.running = false;
  }
}
