/**
 * Traumhangar — the toy world model's pure math (plan §4.8, R3 §5.3–§5.5): no imports at run time, no
 * three.js, no DOM, so the zone and the Node tools (tools/traum/kurzlauf.mjs, tools/traum-check.mjs) run
 * the same code (Node strips the types itself). Every number here is ILLUSTRATIV: a toy model whose
 * failures look like real world models' failures, not a measurement of one.
 *
 *  - B's lite planner: a 2D model-predictive planner on the station's geometry. It dreams its
 *    candidate plans (around left, straight, around right, wait) H seconds ahead with the toy model's
 *    errors (a √t position random walk; the rover forgotten after 1 s behind the pillar; the rover
 *    predicted at constant velocity, so the dream never sees it turn) and acts 1 s on the best. The
 *    Messlauf runs it 20 times per horizon: 0,5 s walks into the nook, 8 s blurs and meets the rover,
 *    2 s gets through most often (the hump).
 *  - C's mixes: offline errors and closed-loop rates, the tiles with their physics errors, the
 *    Prüfzelle's n = 20 draws (stratified, so the ordering the lesson needs never flips by chance).
 *  - Wilson and Newcombe intervals.
 */
import type { B as BTuning, C as CTuning, A as ATuning } from './tuning';

// ── random numbers and intervals ────────────────────────────────────────────────────────────────

/** mulberry32: a small seeded generator (the same as the engine's textures use). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ≈ standard normal from the sum of three uniforms (cheap, bounded: |x| ≤ 3). */
export function gauss(r: () => number): number {
  return (r() + r() + r() - 1.5) * 2;
}

/** Wilson score interval (95 %) for k of n → [p, lo, hi]. */
export function wilson(k: number, n: number, z = 1.96): [number, number, number] {
  if (n <= 0) return [0, 0, 1];
  const p = k / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / den;
  const h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return [p, Math.max(0, c - h), Math.min(1, c + h)];
}

/** Newcombe's hybrid score interval (95 %) for the difference p1 − p2 → [d, lo, hi]. */
export function newcombe(k1: number, n1: number, k2: number, n2: number): [number, number, number] {
  const [p1, l1, u1] = wilson(k1, n1);
  const [p2, l2, u2] = wilson(k2, n2);
  const d = p1 - p2;
  return [d, d - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2), d + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)];
}

/** Fisher–Yates with a seeded generator. */
export function shuffle<T>(a: T[], r: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── station A: the Weichen ──────────────────────────────────────────────────────────────────────

export type PatchKind = 'train' | 'ice' | 'glass' | 'grating';

/**
 * The six Weichen of one attempt: the first is training floor (it teaches what the dream knows), the
 * three unknown floors sit at one of a few spread-out patterns (one of them always among the first
 * three, never all at the end), their order shuffled.
 */
export function weichen(T: typeof ATuning, seed: number): PatchKind[] {
  const r = rng(seed * 7919 + 13);
  const patterns = [
    [1, 3, 5],
    [1, 2, 4],
    [2, 3, 5],
    [1, 4, 5],
    [2, 4, 5],
    [1, 3, 4],
  ];
  const at = patterns[Math.floor(r() * patterns.length) % patterns.length];
  const unknown = shuffle(T.kinds.filter((k) => k !== 'train') as PatchKind[], r);
  const out: PatchKind[] = Array.from({ length: T.kinds.length }, () => 'train' as PatchKind);
  at.forEach((i, j) => (out[i] = unknown[j]));
  return out;
}

/** A's call: trust on the training floor, probe on anything the dream has never seen. */
export function correctCall(kind: PatchKind, call: 'trust' | 'probe'): boolean {
  return kind === 'train' ? call === 'trust' : call === 'probe';
}

// ── station B: the lite planner ─────────────────────────────────────────────────────────────────

export type Cand = 'left' | 'straight' | 'right' | 'wait';
export const CANDS: readonly Cand[] = ['left', 'straight', 'right', 'wait'];

export interface BState {
  x: number;
  z: number;
  /** sim time (s) */
  t: number;
}

/** The rover's x at time t (it shuttles between x0 and x1; phase 0…1 picks where it starts). */
export function roverX(T: typeof BTuning, t: number, phase: number): number {
  const L = T.rover.x1 - T.rover.x0;
  const s = (phase * 2 * L + t * T.rover.speed) % (2 * L);
  return s < L ? T.rover.x0 + s : T.rover.x1 - (s - L);
}
/** its velocity (m/s along x) at time t */
export function roverV(T: typeof BTuning, t: number, phase: number): number {
  const L = T.rover.x1 - T.rover.x0;
  const s = (phase * 2 * L + t * T.rover.speed) % (2 * L);
  return s < L ? T.rover.speed : -T.rover.speed;
}

/** The B obstacles as segments (the nook's three walls) and the pillar circle. */
function obstacles(T: typeof BTuning): { segs: [number, number, number, number][]; pillar: [number, number, number] } {
  const n = T.nook;
  return {
    segs: [
      [n.x0, n.z0, n.x0, n.z1],
      [n.x1, n.z0, n.x1, n.z1],
      [n.x0, n.z1, n.x1, n.z1],
      [n.x0, n.z0, n.x0 + n.lip, n.z0],
      [n.x1 - n.lip, n.z0, n.x1, n.z0],
    ],
    pillar: [T.pillar.x, T.pillar.z, T.pillar.r],
  };
}

function segDist(px: number, pz: number, s: [number, number, number, number]): number {
  const [ax, az, bx, bz] = s;
  const dx = bx - ax,
    dz = bz - az;
  const L2 = dx * dx + dz * dz || 1;
  const u = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(ax + dx * u - px, az + dz * u - pz);
}

/** Does a robot of radius r at (x, z) touch a wall or the pillar? */
export function blockedB(T: typeof BTuning, x: number, z: number, r = T.radius): boolean {
  const o = obstacles(T);
  if (Math.hypot(x - o.pillar[0], z - o.pillar[1]) < o.pillar[2] + r) return true;
  for (const s of o.segs) if (segDist(x, z, s) < r + T.nook.t / 2) return true;
  // the lane's own edges (x −7 … 0)
  return x < T.laneX - 3.5 + r * 0.5 || x > T.laneX + 3.5 - r * 0.5;
}

/** Line of sight from the robot's head to a point: the pillar (and the nook's back wall) hide it. */
export function seesB(T: typeof BTuning, ex: number, ez: number, x: number, z: number): boolean {
  const ax = x - ex,
    az = z - ez;
  const L2 = ax * ax + az * az || 1;
  const u = Math.max(0, Math.min(1, ((T.pillar.x - ex) * ax + (T.pillar.z - ez) * az) / L2));
  if (Math.hypot(ex + ax * u - T.pillar.x, ez + az * u - T.pillar.z) < T.pillar.r + 0.05) return false;
  // the nook's back wall is 1.1 m tall: it hides the rover (0.45 m) from the G1's eyes only when close
  return true;
}

/**
 * Is a point at box height hidden from an eye at (ex, ez)? The pillar hides everything behind it, the
 * nook's 1.1 m walls hide the carried box (≈ 0.95 m). The dream forgets what it has not seen for 1 s.
 */
export function hiddenB(T: typeof BTuning, ex: number, ez: number, x: number, z: number): boolean {
  if (!seesB(T, ex, ez, x, z)) return true;
  const o = obstacles(T);
  for (const s of o.segs) if (crosses(ex, ez, x, z, s)) return true;
  return false;
}

function crosses(ax: number, az: number, bx: number, bz: number, s: [number, number, number, number]): boolean {
  const [cx, cz, dx, dz] = s;
  const d1 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx);
  const d2 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  const d3 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  const d4 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** The waypoints of a candidate from the state (pure pursuit target list). */
export function waypoints(T: typeof BTuning, c: Cand): (readonly [number, number])[] {
  if (c === 'left') return [...T.via.left, T.goal];
  if (c === 'right') return [...T.via.right, T.goal];
  if (c === 'straight') return [T.goal];
  return [];
}

/** A walker on the floor plan: position, heading (rad, 0 = +z, + toward +x) and the waypoint it heads to. */
export interface Walker {
  x: number;
  z: number;
  psi: number;
  i: number;
}

/**
 * One step of pure pursuit along `wps`: the walker turns toward its waypoint by at most `w` rad/s and
 * walks forward at `v` (slower while it turns, on the spot when the waypoint is behind it: a humanoid turns
 * on its feet, it does not slide sideways).
 * A waypoint counts as reached within 0.45 m. Returns the new pose (the walker is not changed).
 */
export function pursue(wps: readonly (readonly [number, number])[], o: Walker, v: number, w: number, dt: number): Walker {
  let i = o.i;
  while (i < wps.length - 1 && Math.hypot(wps[i][0] - o.x, wps[i][1] - o.z) < 0.45) i++;
  if (i >= wps.length) return { ...o, i };
  const [tx, tz] = wps[i];
  const d = Math.hypot(tx - o.x, tz - o.z);
  if (d < 0.05) return { ...o, i };
  const want = Math.atan2(tx - o.x, tz - o.z);
  let e = want - o.psi;
  e = Math.atan2(Math.sin(e), Math.cos(e));
  const psi = o.psi + Math.max(-w * dt, Math.min(w * dt, e));
  const s = Math.min(d, v * dt * Math.max(0, Math.min(1, (Math.cos(e) - 0.5) / 0.5)));
  return { x: o.x + Math.sin(psi) * s, z: o.z + Math.cos(psi) * s, psi, i };
}

/** What the dream remembers of the rover when it starts: its position and velocity, or nothing. */
export interface RoverMemory {
  x: number;
  v: number;
}

/**
 * One dreamt rollout of a candidate over `h` seconds from the walker's pose: the toy model (μ̂
 * everywhere, the √t random walk, the remembered rover at constant velocity: the dream never sees it
 * turn). Returns the end point, whether the dream predicts a collision, and the samples (every 0.5 s).
 */
export function dreamB(T: typeof BTuning, c: Cand, from: Walker, h: number, rover: RoverMemory | null, r: () => number, noise: number, agentNoise = 0, forgetS = Infinity): { x: number; z: number; i: number; hit: boolean; wall: boolean; boxLost: boolean; trail: number[] } {
  const wps = waypoints(T, c);
  const dt = T.dt;
  const steps = Math.max(3, Math.round(h / dt));
  let p: Walker = { ...from };
  let hit = false;
  let wall = false;
  let nx = 0,
    nz = 0,
    na = 0,
    hidden = 0;
  let boxLost = false;
  const trail: number[] = [p.x, p.z];
  const sq = Math.sqrt(dt);
  for (let s = 1; s <= steps; s++) {
    if (c !== 'wait' && !hit) {
      const q = pursue(wps, p, T.speed, T.turn, dt);
      if (blockedB(T, q.x, q.z)) hit = wall = true;
      else p = q;
    }
    // the model's uncertainty grows with every step it dreams (σ·√t)
    nx += gauss(r) * noise * sq;
    nz += gauss(r) * noise * sq;
    const x = p.x + nx,
      z = p.z + nz;
    if (rover) {
      // the dream extrapolates the rover at its remembered velocity (it never sees it turn), blurring with t
      na += gauss(r) * agentNoise * sq;
      const rx = rover.x + rover.v * s * dt + na;
      if (Math.abs(rx - x) < T.rover.w / 2 + T.radius && Math.abs(T.rover.z - z) < T.rover.d / 2 + T.radius) hit = true;
    }
    // object permanence: the box the dreamt robot carries, hidden from where the dream started for
    // longer than forgetS, drops out of the dream („Hinter der Säule hat er die Kiste vergessen.“)
    hidden = hiddenB(T, from.x, from.z, x, z) ? hidden + dt : 0;
    if (hidden > forgetS) boxLost = true;
    if (s % 5 === 0) trail.push(x, z);
  }
  return { x: p.x + nx, z: p.z + nz, i: p.i, hit, wall, boxLost, trail };
}

/** The way still to go from a point along a candidate's remaining waypoints from index i (m): the planner's cost-to-go. */
export function toGoB(T: typeof BTuning, c: Cand, x: number, z: number, i = 0): number {
  const wps = waypoints(T, c);
  let d = 0;
  let px = x,
    pz = z;
  for (let k = Math.min(i, Math.max(0, wps.length - 1)); k < wps.length; k++) {
    d += Math.hypot(wps[k][0] - px, wps[k][1] - pz);
    px = wps[k][0];
    pz = wps[k][1];
  }
  return d;
}

/**
 * The planner (MPC with a committed route): it dreams its current route H seconds ahead and keeps it
 * while the dream sees no collision. When the dream does, it dreams the alternatives (the other routes
 * from their first waypoint, and waiting) and picks the least way to go along its route (a predicted
 * collision costs `hitCost` m, waiting `waitCost`). A wall it cannot reach within H it never sees: that
 * is the short horizon's dead end. Waiting keeps the route; the planner walks on when the dream is clear.
 */
export function planB(T: typeof BTuning, from: Walker, h: number, rover: RoverMemory | null, r: () => number, noise: number, route: Exclude<Cand, 'wait'> = 'straight', agentNoise = 0, forgetS = Infinity): { cand: Cand; route: Exclude<Cand, 'wait'>; cost: Record<Cand, number>; dreams: Partial<Record<Cand, ReturnType<typeof dreamB>>> } {
  const cost = { left: Infinity, straight: Infinity, right: Infinity, wait: Infinity } as Record<Cand, number>;
  const dreams: Partial<Record<Cand, ReturnType<typeof dreamB>>> = {};
  const mine = dreamB(T, route, from, h, rover, r, noise, agentNoise, forgetS);
  dreams[route] = mine;
  cost[route] = toGoB(T, route, mine.x, mine.z, mine.i) + (mine.hit ? T.hitCost : 0) + (mine.boxLost ? T.boxCost : 0);
  if (!mine.hit && !mine.boxLost) return { cand: route, route, cost, dreams };
  let best: Cand = route;
  for (const c of CANDS) {
    // waiting helps against the rover, never against a wall
    if (c === route || (c === 'wait' && mine.wall)) continue;
    const d = dreamB(T, c, c === 'wait' ? from : { ...from, i: 0 }, h, rover, r, noise, agentNoise, forgetS);
    dreams[c] = d;
    cost[c] = c === 'wait' ? toGoB(T, route, from.x, from.z, from.i) + T.waitCost + (d.hit ? T.hitCost : 0) : toGoB(T, c, d.x, d.z, d.i) + (d.hit ? T.hitCost : 0) + (d.boxLost ? T.boxCost : 0);
    if (cost[c] < cost[best]) best = c;
  }
  return { cand: best, route: best === 'wait' ? route : best, cost, dreams };
}

export type BOutcome = 'deliver' | 'nook' | 'rover' | 'timeout';

export interface BRun {
  horizon: number;
  ok: boolean;
  outcome: BOutcome;
  /** sim seconds until the outcome */
  t: number;
  /** robot path (x, z every 0.2 s) and the rover's x at the same times */
  path: number[];
  rover: number[];
  /** dreams the planner needed */
  dreams: number;
  /** the start offset and the rover phase of this run (stratified) */
  dx: number;
  phase: number;
}

/**
 * One autonomous run of the MPC loop at horizon `h`: dream, act `act` s on the best plan, dream again.
 * `dx` shifts the start sideways, `phase` places the rover; `seed` drives the dream noise.
 */
export function runB(T: typeof BTuning, h: number, o: { dx: number; phase: number; seed: number; noise: number; agentNoise: number; forgetS: number }): BRun {
  const r = rng(o.seed);
  let p: Walker = { x: T.start[0] + o.dx, z: T.start[1], psi: 0, i: 0 };
  let t = 0;
  let lastSeen = -1e9;
  let seenX = 0;
  let seenV = 0;
  let plan: Cand = 'wait';
  let route: Exclude<Cand, 'wait'> = 'straight';
  let wps: (readonly [number, number])[] = [];
  let nextPlan = 0;
  let dreams = 0;
  let still = 0;
  let px = p.x,
    pz = p.z;
  const path: number[] = [p.x, p.z];
  const rov: number[] = [roverX(T, 0, o.phase)];
  const dt = T.dt;
  let outcome: BOutcome = 'timeout';
  for (let step = 0; t < T.timeout; step++) {
    const rx = roverX(T, t, o.phase);
    if (seesB(T, p.x, p.z, rx, T.rover.z)) {
      lastSeen = t;
      seenX = rx;
      seenV = roverV(T, t, o.phase);
    }
    if (t >= nextPlan - 1e-9) {
      const mem = t - lastSeen <= o.forgetS ? { x: seenX + seenV * (t - lastSeen), v: seenV } : null;
      const pl = planB(T, p, h, mem, r, o.noise, route, o.agentNoise, o.forgetS);
      if (pl.route !== route) p = { ...p, i: 0 };
      route = pl.route;
      plan = pl.cand;
      wps = waypoints(T, route);
      dreams++;
      nextPlan = t + T.act;
    }
    if (plan !== 'wait') {
      const q = pursue(wps, p, T.speed, T.turn, dt);
      if (!blockedB(T, q.x, q.z)) p = q;
      else p = { ...p, psi: q.psi };
    }
    t += dt;
    // reality: the rover is where it really is (it turns at the lane ends)
    const rx2 = roverX(T, t, o.phase);
    if (Math.abs(rx2 - p.x) < T.rover.w / 2 + T.radius * 0.8 && Math.abs(T.rover.z - p.z) < T.rover.d / 2 + T.radius * 0.8) {
      outcome = 'rover';
      break;
    }
    if (Math.hypot(p.x - T.goal[0], p.z - T.goal[1]) < 0.35) {
      outcome = 'deliver';
      break;
    }
    // stuck in the dead end: no progress for 4 s inside the nook
    const inNook = p.x > T.nook.x0 && p.x < T.nook.x1 && p.z > T.nook.z0 - 0.4 && p.z < T.nook.z1;
    still = Math.hypot(p.x - px, p.z - pz) < 0.03 && inNook ? still + dt : 0;
    px = p.x;
    pz = p.z;
    if (still >= 4) {
      outcome = 'nook';
      break;
    }
    if (step % 2 === 1) {
      path.push(p.x, p.z);
      rov.push(rx2);
    }
  }
  if (outcome === 'timeout' && p.x > T.nook.x0 - 0.3 && p.x < T.nook.x1 + 0.3 && p.z > T.nook.z0 - 0.6 && p.z < T.nook.z1) outcome = 'nook';
  path.push(p.x, p.z);
  rov.push(roverX(T, t, o.phase));
  return { horizon: h, ok: outcome === 'deliver', outcome, t, path, rover: rov, dreams, dx: o.dx, phase: o.phase };
}

/**
 * The Messlauf's runs (plan §4.8): `runs` autonomous runs per horizon with stratified start offsets and
 * rover phases (run i of every horizon meets the same situation), the dream noise seeded per attempt.
 * The hangar computes them in time slices from this list; messlaufB runs them all at once (the tools).
 */
export function messlaufJobs(T: typeof BTuning, seed: number, horizons: readonly number[]): { h: number; i: number; dx: number; phase: number; seed: number }[] {
  const n = T.runs;
  const r = rng(seed * 104729 + 7);
  const offsets = Array.from({ length: n }, (_, i) => (((i + 0.5) / n) * 2 - 1) * T.startSpread);
  const phases = shuffle(Array.from({ length: n }, (_, i) => (i + r()) / n), r);
  const out: { h: number; i: number; dx: number; phase: number; seed: number }[] = [];
  for (const h of horizons) for (let i = 0; i < n; i++) out.push({ h, i, dx: offsets[i], phase: phases[i], seed: seed * 1000 + i * 31 + Math.round(h * 10) });
  return out;
}

export function messlaufB(T: typeof BTuning, o: { seed: number; noise: number; agentNoise: number; forgetS: number; horizons: readonly number[] }): { horizon: number; k: number; n: number; runs: BRun[] }[] {
  const out = o.horizons.map((h) => ({ horizon: h, k: 0, n: T.runs, runs: [] as BRun[] }));
  for (const j of messlaufJobs(T, o.seed, o.horizons)) {
    const run = runB(T, j.h, { dx: j.dx, phase: j.phase, seed: j.seed, noise: o.noise, agentNoise: o.agentNoise, forgetS: o.forgetS });
    const row = out[o.horizons.indexOf(j.h)];
    row.runs.push(run);
    if (run.ok) row.k++;
  }
  return out;
}

/** The horizon with the most successes (ties: the shorter one). */
export function bestHorizon(rows: { horizon: number; k: number }[]): number {
  let best = rows[0];
  for (const r of rows) if (r.k > best.k) best = r;
  return best.horizon;
}

// ── station C: the dream data ───────────────────────────────────────────────────────────────────

export type Mix = 'echt' | 'alle' | 'geprueft';
export const MIXES: readonly Mix[] = ['echt', 'alle', 'geprueft'];
export type ErrorKind = 'schwebt' | 'durchgriff' | 'verschwindet' | 'gleiten';
export const ERROR_KINDS: readonly ErrorKind[] = ['schwebt', 'durchgriff', 'verschwindet', 'gleiten'];
/** a tile that is fine shows one of these near-misses (they look odd, the physics is right) */
export type DecoyKind = 'ok' | 'kippt' | 'nah' | 'schnell';

export interface Tile {
  /** the error the tile shows, or null for a physically fine dream */
  error: ErrorKind | null;
  decoy: DecoyKind;
  /** loop phase offset (0…1), the task shown (crate lift or cart push) */
  phase: number;
  task: 'kiste' | 'wagen';
}

/** The 8 sample tiles of one attempt: 3 with physics errors (3 of the 4 kinds), 5 fine (some odd-looking). */
export function tiles(T: typeof CTuning, seed: number): Tile[] {
  const r = rng(seed * 6151 + 3);
  const kinds = shuffle([...ERROR_KINDS], r).slice(0, T.errors);
  const decoys: DecoyKind[] = ['ok', 'kippt', 'nah', 'schnell', 'ok'];
  const list: Tile[] = [
    ...kinds.map((k) => ({ error: k, decoy: 'ok' as DecoyKind, phase: r(), task: (r() < 0.5 ? 'kiste' : 'wagen') as Tile['task'] })),
    ...decoys.slice(0, T.tiles - T.errors).map((d) => ({ error: null, decoy: d, phase: r(), task: (r() < 0.5 ? 'kiste' : 'wagen') as Tile['task'] })),
  ];
  return shuffle(list, r);
}

/** Offline error per bar (lower looks better). The hidden fourth bar „Stillstand“ always wins offline. */
export function offlineBars(T: typeof CTuning): { mix: Mix | 'stillstand'; error: number }[] {
  return [
    { mix: 'echt', error: T.offline.echt },
    { mix: 'alle', error: T.offline.alle },
    { mix: 'geprueft', error: T.offline.geprueft },
    { mix: 'stillstand', error: T.offline.stillstand },
  ];
}

/** The offline winner among the bars shown (Stillstand when it is shown, else the best real mix). */
export function offlineWinner(T: typeof CTuning, withStillstand: boolean): Mix | 'stillstand' {
  const bars = offlineBars(T).filter((b) => withStillstand || b.mix !== 'stillstand');
  return bars.reduce((a, b) => (b.error < a.error ? b : a)).mix;
}

/** Closed-loop success rate of a mix: the checked dreams get better with every error class you filtered out. */
export function closedRate(T: typeof CTuning, mix: Mix | 'stillstand', found: number = T.errors, falseFlags = 0): number {
  if (mix === 'stillstand') return T.closed.stillstand;
  if (mix === 'echt') return T.closed.echt;
  if (mix === 'alle') return T.closed.alle;
  return Math.max(T.closed.alle + 0.05, T.closed.geprueftBase + T.closed.perFound * found - T.closed.perFalse * falseFlags);
}

export interface PruefRow {
  mix: Mix | 'stillstand';
  k: number;
  n: number;
  /** each lane's result (true = the cart is on the lift) */
  lanes: boolean[];
}

/**
 * The Prüfzelle: n closed-loop trials per mix (+ Stillstand, which never moves the cart). Stratified
 * draws (k = the rate × n, ± 1 by the seed) keep the toy model's order — geprüft > alle > echt — for every
 * seed, so the installed Flugmodell is never the offline winner by chance (traum-check proves it).
 */
export function pruefzelle(T: typeof CTuning, o: { seed: number; found: number; falseFlags: number; withStillstand?: boolean }): PruefRow[] {
  const r = rng(o.seed * 2909 + 11);
  const n = T.n;
  const k = (p: number): number => Math.max(0, Math.min(n, Math.round(p * n) + (Math.floor(r() * 3) - 1)));
  // the real-only baseline is the 20 real demos' own number: it does not move between attempts
  const ke = Math.round(T.closed.echt * n);
  let ka = k(T.closed.alle);
  let kg = k(closedRate(T, 'geprueft', o.found, o.falseFlags));
  // the order the lesson rests on (toy model): never let a draw flip it
  ka = Math.max(ka, ke + 1);
  kg = Math.max(kg, ka + 2);
  const lanes = (kk: number): boolean[] => shuffle(Array.from({ length: n }, (_, i) => i < kk), r);
  const rows: PruefRow[] = [
    { mix: 'echt', k: ke, n, lanes: lanes(ke) },
    { mix: 'alle', k: ka, n, lanes: lanes(ka) },
    { mix: 'geprueft', k: kg, n, lanes: lanes(kg) },
  ];
  if (o.withStillstand !== false) rows.push({ mix: 'stillstand', k: 0, n, lanes: lanes(0) });
  return rows;
}

/**
 * The mix installed as the island's Flugmodell (D23): the best closed-loop result among the real mixes
 * the player measured (never „Stillstand“, never the offline winner of the real mixes).
 */
export function installedMix(rows: PruefRow[]): Mix | null {
  let best: PruefRow | null = null;
  for (const row of rows) if (row.mix !== 'stillstand' && (!best || row.k > best.k)) best = row;
  return best ? (best.mix as Mix) : null;
}

/** The measured value of the ◆ (plan §4.8): the checked dreams against real-only, in pp with Newcombe's interval. */
export function gainPp(rows: PruefRow[], mix: Mix = 'geprueft', base: Mix = 'echt'): { pp: number; lo: number; hi: number; n: number } {
  const a = rows.find((x) => x.mix === mix)!;
  const b = rows.find((x) => x.mix === base)!;
  const [d, lo, hi] = newcombe(a.k, a.n, b.k, b.n);
  return { pp: Math.round(d * 100), lo: Math.round(lo * 100), hi: Math.round(hi * 100), n: a.n };
}

// ── Entscheider: the Traumdaten-Deal (R3 §5.6) ──────────────────────────────────────────────────

/** Offer A: 10.000 Träume, offline +40 % (all dreams, no check); offer B: 1.000 checked dreams + a closed-loop measurement. */
export function dealOutcome(T: typeof CTuning, offer: 'a' | 'b', seed: number): { offline: number; closed: PruefRow } {
  const rows = pruefzelle(T, { seed, found: T.errors, falseFlags: 0 });
  return offer === 'a' ? { offline: T.offline.alle, closed: rows.find((x) => x.mix === 'alle')! } : { offline: T.offline.geprueft, closed: rows.find((x) => x.mix === 'geprueft')! };
}
