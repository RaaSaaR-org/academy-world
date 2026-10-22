/**
 * WP15 — reactive robots (plan §4.12 L5; R9 §4 L5, egg 5): a robot that meets you greets you once (eye
 * blink, chirp), shows a flat safety ring (teal; amber inside the protective separation distance), slows
 * down, stops, and — when you stay in its way — replans around you on a coarse grid with A*. The search
 * frontier spreads over the floor in teal for about a second, then the detour runs and the robot rejoins
 * its route: it never waits more than 2 s (R9 §3 rule 5). Speed and separation monitoring is one of the
 * collaborative techniques of ISO 10218 / ISO/TS 15066 (R9 S9, S10); A* is Hart, Nilsson and Raphael
 * (1968, R9 S6) — egg 5 „Der Wackelige“ counts the replans you cause.
 *
 * Eager (the deck rovers are rc4 landscape): no allocation per frame; a replan allocates nothing either
 * (typed arrays sized once).
 */
import * as THREE from 'three';
import { SAFETY } from './tuning';
import { PAL, unitTile } from './geo';

// ── A* on a small grid, recording the expansion order (the visible frontier) ─────────────────────────

const N = Math.ceil(SAFETY.window / SAFETY.cell);
const CELLS = N * N;
const gScore = new Float32Array(CELLS);
const fScore = new Float32Array(CELLS);
const came = new Int32Array(CELLS);
const state = new Uint8Array(CELLS); // 0 new, 1 open, 2 closed, 3 blocked
const heap = new Int32Array(CELLS);
let heapN = 0;

function push(i: number): void {
  let k = heapN++;
  heap[k] = i;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (fScore[heap[p]] <= fScore[heap[k]]) break;
    const t = heap[p];
    heap[p] = heap[k];
    heap[k] = t;
    k = p;
  }
}
function pop(): number {
  const top = heap[0];
  heap[0] = heap[--heapN];
  let k = 0;
  for (;;) {
    const l = k * 2 + 1,
      r = l + 1;
    let m = k;
    if (l < heapN && fScore[heap[l]] < fScore[heap[m]]) m = l;
    if (r < heapN && fScore[heap[r]] < fScore[heap[m]]) m = r;
    if (m === k) break;
    const t = heap[m];
    heap[m] = heap[k];
    heap[k] = t;
    k = m;
  }
  return top;
}

/** The result of a search: the expansion order and the path, as cell centres (x, z) in the caller's frame. */
export interface SearchResult {
  /** expanded cells in order (x, z pairs), at most CELLS */
  expanded: Float32Array;
  expandedN: number;
  /** the path from start to goal (x, z pairs) */
  path: Float32Array;
  pathN: number;
  ok: boolean;
}
const RESULT: SearchResult = { expanded: new Float32Array(CELLS * 2), expandedN: 0, path: new Float32Array(CELLS * 2), pathN: 0, ok: false };

/**
 * A* from (sx, sz) to (gx, gz) on a grid of SAFETY.cell around their midpoint, avoiding discs (x, z, r)
 * and cells where `walkable` is false. 8-connected, octile heuristic. The result is shared: copy what
 * you keep.
 */
export function astar(sx: number, sz: number, gx: number, gz: number, discs: Float32Array, discN: number, walkable: (x: number, z: number) => boolean): SearchResult {
  const cell = SAFETY.cell;
  const ox = (sx + gx) / 2 - (N * cell) / 2;
  const oz = (sz + gz) / 2 - (N * cell) / 2;
  const cx = (i: number): number => ox + ((i % N) + 0.5) * cell;
  const cz = (i: number): number => oz + (Math.floor(i / N) + 0.5) * cell;
  const idx = (x: number, z: number): number => {
    const ix = Math.floor((x - ox) / cell),
      iz = Math.floor((z - oz) / cell);
    if (ix < 0 || iz < 0 || ix >= N || iz >= N) return -1;
    return iz * N + ix;
  };
  for (let i = 0; i < CELLS; i++) {
    state[i] = 0;
    const x = cx(i),
      z = cz(i);
    let blocked = !walkable(x, z);
    for (let k = 0; k < discN && !blocked; k++) {
      const dx = x - discs[k * 3],
        dz = z - discs[k * 3 + 1];
      if (dx * dx + dz * dz < discs[k * 3 + 2] * discs[k * 3 + 2]) blocked = true;
    }
    if (blocked) state[i] = 3;
  }
  RESULT.expandedN = 0;
  RESULT.pathN = 0;
  RESULT.ok = false;
  const s = idx(sx, sz),
    g = idx(gx, gz);
  if (s < 0 || g < 0) return RESULT;
  state[s] = 0;
  state[g] = 0;
  const h = (i: number): number => {
    const dx = Math.abs((i % N) - (g % N)),
      dz = Math.abs(Math.floor(i / N) - Math.floor(g / N));
    return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)) * cell;
  };
  heapN = 0;
  gScore[s] = 0;
  fScore[s] = h(s);
  came[s] = -1;
  state[s] = 1;
  push(s);
  while (heapN > 0) {
    const cur = pop();
    if (state[cur] === 2) continue;
    state[cur] = 2;
    RESULT.expanded[RESULT.expandedN * 2] = cx(cur);
    RESULT.expanded[RESULT.expandedN * 2 + 1] = cz(cur);
    RESULT.expandedN++;
    if (cur === g) {
      RESULT.ok = true;
      break;
    }
    const x = cur % N,
      z = Math.floor(cur / N);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx,
          nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const n = nz * N + nx;
        if (state[n] === 3 || state[n] === 2) continue;
        // no corner cutting past a blocked cell
        if (dx && dz && (state[z * N + nx] === 3 || state[nz * N + x] === 3)) continue;
        const ng = gScore[cur] + (dx && dz ? Math.SQRT2 : 1) * cell;
        if (state[n] === 1 && ng >= gScore[n]) continue;
        gScore[n] = ng;
        fScore[n] = ng + h(n);
        came[n] = cur;
        state[n] = 1;
        push(n);
      }
  }
  if (RESULT.ok) {
    let n = 0;
    for (let i = g; i >= 0; i = came[i]) n++;
    RESULT.pathN = n;
    let k = n - 1;
    for (let i = g; i >= 0; i = came[i], k--) {
      RESULT.path[k * 2] = cx(i);
      RESULT.path[k * 2 + 1] = cz(i);
    }
  }
  return RESULT;
}

// ── the floor markings: safety rings and A* tiles, one instanced draw per frame of reference ─────────

const RING_SEG = 20;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const TEAL = new THREE.Color(PAL.teal).multiplyScalar(1.25);
const TEAL_DIM = new THREE.Color(PAL.teal).multiplyScalar(0.55);
const AMBER = new THREE.Color(PAL.amber).multiplyScalar(1.15);

/** One InstancedMesh of flat tiles (the shared paint, tinted); rebuilt every frame from what is shown. */
export class Markings {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  constructor(parent: THREE.Object3D, material: THREE.Material, capacity: number, name: string) {
    const geo = unitTile();
    this.mesh = new THREE.InstancedMesh(geo, material, capacity);
    this.mesh.name = name;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(1, 1, 1));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }
  begin(): void {
    this.n = 0;
  }
  private add(x: number, y: number, z: number, yaw: number, sx: number, sz: number, color: THREE.Color): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(_up, yaw), _s.set(sx, 1, sz));
    this.mesh.setMatrixAt(this.n, _m);
    this.mesh.setColorAt(this.n, color);
    this.n++;
  }
  /** a dashed ring of radius r around (x, z); amber = inside the stop distance */
  ring(x: number, y: number, z: number, r: number, amber: boolean, k = 1): void {
    const c = amber ? AMBER : TEAL;
    const len = ((2 * Math.PI * r) / RING_SEG) * 0.62;
    for (let i = 0; i < RING_SEG; i++) {
      const a = (i / RING_SEG) * Math.PI * 2;
      this.add(x + Math.sin(a) * r, y, z + Math.cos(a) * r, a + Math.PI / 2, len * k, 0.07 * k, c);
    }
  }
  /** one A* tile (k = 0…1 its grow-in, bright = on the final path) */
  tile(x: number, y: number, z: number, k: number, bright: boolean): void {
    const s = SAFETY.cell * 0.84 * k;
    this.add(x, y, z, 0, s, s, bright ? TEAL : TEAL_DIM);
  }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }
}

// ── the safety behaviour of one robot ────────────────────────────────────────────────────────────────

export type SafetyState = 'drive' | 'slow' | 'stop' | 'search' | 'detour';

/** What a robot with this behaviour exposes to the shared logic. */
export interface SafeRobot {
  pos: THREE.Vector3;
  /** facing (rad; 0 = −z, as the rovers) */
  heading: number;
  state: SafetyState;
  /** seconds stopped with something in the way */
  stopT: number;
  /** the search: its result copied, the time since it began */
  frontier: Float32Array;
  frontierN: number;
  path: Float32Array;
  pathN: number;
  pathI: number;
  searchT: number;
  /** the obstacle that caused the replan was the player */
  byPlayer: boolean;
  /** greeted the player already */
  greeted: boolean;
  blinkT: number;
  /** search now, with nothing in the way (the rover that backed out of the puddle) */
  forceReplan: boolean;
  /** the ring is amber (hysteresis: no colour flicker at the stop distance, WCAG 2.3.1) */
  amber: boolean;
}

export function safeRobot(pos: THREE.Vector3, heading = 0): SafeRobot {
  return { pos, heading, state: 'drive', stopT: 0, frontier: new Float32Array(N * N * 2), frontierN: 0, path: new Float32Array(N * N * 2), pathN: 0, pathI: 0, searchT: 0, byPlayer: false, greeted: false, blinkT: 0, forceReplan: false, amber: false };
}

const discs = new Float32Array(3 * 16);
let bestD = Infinity;
let bestPlayer = false;
/** an obstacle in the swept corridor ahead (half width 0.95 m) or right beside the robot */
function consider(r: SafeRobot, fx: number, fz: number, o: THREE.Vector3, isPlayer: boolean): void {
  const dx = o.x - r.pos.x,
    dz = o.z - r.pos.z;
  const along = dx * fx + dz * fz;
  const side = Math.abs(dx * fz - dz * fx);
  const d = Math.hypot(dx, dz);
  if (((along > -0.3 && side < 0.95) || d < 1.1) && d < bestD) {
    bestD = d;
    bestPlayer = isPlayer;
  }
}

export interface SafetyInput {
  dt: number;
  /** the player's feet in the robot's frame (and whether the player counts: on the same level) */
  player: THREE.Vector3;
  playerOn: boolean;
  /** other obstacles (people), same frame */
  others: readonly THREE.Vector3[];
  /** the point on the route a few metres ahead where a detour rejoins it */
  rejoin: THREE.Vector3;
  walkable: (x: number, z: number) => boolean;
  /** extra discs (x, z, r) the search avoids but the corridor ignores (the puddle) */
  searchDiscs?: Float32Array;
  searchDiscN?: number;
}

/**
 * One step of the safety behaviour. Returns the speed factor along the route (1 drive … 0 stop) while
 * on the route; in 'detour' the robot follows `path` instead (the caller moves it with followDetour).
 * Events: 'greet' (the first meeting), 'replan' (a search began; byPlayer tells who caused it).
 */
export function safetyStep(r: SafeRobot, inp: SafetyInput, on: (e: 'greet' | 'replan' | 'rejoin') => void): number {
  const dt = inp.dt;
  if (r.blinkT > 0) r.blinkT -= dt;
  const fx = -Math.sin(r.heading),
    fz = -Math.cos(r.heading);
  // nearest obstacle ahead (the player first); module-level scratch, no closure per frame
  bestD = Infinity;
  bestPlayer = false;
  if (inp.playerOn) consider(r, fx, fz, inp.player, true);
  for (let i = 0; i < inp.others.length; i++) consider(r, fx, fz, inp.others[i], false);
  const best = bestD;
  const byPlayer = bestPlayer;
  const pd = inp.playerOn ? Math.hypot(inp.player.x - r.pos.x, inp.player.z - r.pos.z) : Infinity;
  if (!r.greeted && pd < 3.2) {
    r.greeted = true;
    r.blinkT = 0.5;
    on('greet');
  }
  if (r.state === 'search') {
    r.searchT += dt;
    if (r.searchT >= SAFETY.frontierS) {
      r.state = r.pathN > 1 ? 'detour' : 'drive';
      r.pathI = 0;
    }
    return 0;
  }
  if (r.state === 'detour') return 0;
  // blocked: inside the stop distance (it stops), or crept up in the slow zone for a while — then it
  // plans around you, so nobody waits more than about 2 s (R9 §3 rule 5)
  const blocked = best < SAFETY.stopM;
  if (blocked || r.forceReplan || (best < SAFETY.slowM && r.stopT >= SAFETY.replanAfterS + 0.5)) {
    r.state = 'stop';
    r.stopT += dt;
    if (r.stopT >= SAFETY.replanAfterS || r.forceReplan) {
      r.stopT = 0;
      const forced = r.forceReplan;
      r.forceReplan = false;
      // the search: the player and the people as discs (their radius plus the robot's half width)
      let n = 0;
      if (inp.playerOn && n < 16) {
        discs[n * 3] = inp.player.x;
        discs[n * 3 + 1] = inp.player.z;
        discs[n * 3 + 2] = 1.15;
        n++;
      }
      for (const o of inp.others) {
        if (n >= 16) break;
        if (Math.hypot(o.x - r.pos.x, o.z - r.pos.z) > SAFETY.window) continue;
        discs[n * 3] = o.x;
        discs[n * 3 + 1] = o.z;
        discs[n * 3 + 2] = 1.0;
        n++;
      }
      for (let k = 0; k < (inp.searchDiscN ?? 0) && n < 16; k++, n++) {
        discs[n * 3] = inp.searchDiscs![k * 3];
        discs[n * 3 + 1] = inp.searchDiscs![k * 3 + 1];
        discs[n * 3 + 2] = inp.searchDiscs![k * 3 + 2];
      }
      const res = astar(r.pos.x, r.pos.z, inp.rejoin.x, inp.rejoin.z, discs, n, inp.walkable);
      r.frontier.set(res.expanded.subarray(0, res.expandedN * 2));
      r.frontierN = res.expandedN;
      r.path.set(res.path.subarray(0, res.pathN * 2));
      r.pathN = res.ok ? res.pathN : 0;
      r.searchT = 0;
      r.state = 'search';
      r.byPlayer = !forced && byPlayer;
      on('replan');
    }
    return 0;
  }
  if (best < SAFETY.slowM) {
    // creeping toward something in its way counts toward the replan as well
    r.stopT += dt;
    r.state = 'slow';
    return THREE.MathUtils.clamp((best - SAFETY.stopM) / (SAFETY.slowM - SAFETY.stopM), 0.3, 1);
  }
  r.stopT = Math.max(0, r.stopT - dt * 2);
  r.state = 'drive';
  return 1;
}

/** Move along the detour path at `speed`; returns true when it has rejoined (the caller snaps to its route). */
export function followDetour(r: SafeRobot, dt: number, speed: number): boolean {
  if (r.state !== 'detour') return false;
  let left = speed * dt;
  while (left > 0 && r.pathI < r.pathN) {
    const tx = r.path[r.pathI * 2],
      tz = r.path[r.pathI * 2 + 1];
    const dx = tx - r.pos.x,
      dz = tz - r.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) {
      r.pathI++;
      continue;
    }
    const s = Math.min(d, left);
    r.pos.x += (dx / d) * s;
    r.pos.z += (dz / d) * s;
    left -= s;
    const want = Math.atan2(-dx, -dz);
    r.heading += Math.atan2(Math.sin(want - r.heading), Math.cos(want - r.heading)) * (1 - Math.exp(-dt * 7));
    if (s >= d) r.pathI++;
  }
  if (r.pathI >= r.pathN) {
    r.state = 'drive';
    return true;
  }
  return false;
}

/** Draw a robot's markings: its ring while something is close, its frontier while it searches and detours. */
export function drawMarkings(m: Markings, r: SafeRobot, y: number, nearest: number): void {
  // amber inside the stop distance; back to teal only 0.4 m further out (no flicker at the edge)
  if (r.state === 'stop' || nearest < SAFETY.stopM) r.amber = true;
  else if (nearest > SAFETY.stopM + 0.4) r.amber = false;
  if (nearest < SAFETY.showM || r.state === 'stop' || r.state === 'search') {
    // it grows in from nothing over the last 1.2 m (a single ramp, never a pop)
    const k = r.state === 'stop' || r.state === 'search' ? 1 : THREE.MathUtils.clamp((SAFETY.showM - nearest) / 1.2, 0, 1);
    if (k > 0.02) m.ring(r.pos.x, y, r.pos.z, SAFETY.stopM, r.amber, k);
  }
  if (r.state === 'search' || r.state === 'detour') {
    const t = r.state === 'search' ? r.searchT / SAFETY.frontierS : 1;
    const shown = Math.floor(r.frontierN * Math.min(1, t));
    // the detour fades the frontier out while it drives
    const fade = r.state === 'detour' ? Math.max(0, 1 - r.pathI / Math.max(1, r.pathN)) : 1;
    for (let i = 0; i < shown; i++) {
      const age = Math.min(1, (t * r.frontierN - i) / 6);
      m.tile(r.frontier[i * 2], y, r.frontier[i * 2 + 1], Math.max(0, age) * fade, false);
    }
    if (r.state === 'detour') for (let i = r.pathI; i < r.pathN; i++) m.tile(r.path[i * 2], y + 0.002, r.path[i * 2 + 1], 0.7, true);
  }
}
