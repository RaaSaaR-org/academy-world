/**
 * Sonnenacker — the tracking PV roofs (plan §4.10, §4.15; R8 §2.1): six single-axis rows per
 * Sonnendach, axis north–south, turning east–west to the sun at 2,6 m clearance and more (DIN SPEC
 * 91434 Cat. I). Each row is a control loop (ART-V2 §2.1 rule 5, like the island's rows): a new sun
 * estimate every 6–10 s, a damped step that settles in ≈ 1,2 s. Modes:
 *  - track      the fixed golden-hour sun (WNW, 16°): the tables lean west to their 50° limit;
 *  - shelter    „Schutzstellung“: flat over the beds (the hail front of station B, FIKTION);
 *  - stow       the lift-off's downwash front (WP13 'flight:phase' 'downwash'): every row turns flat
 *               over ≥ 2 s as the front passes, a single ramp each (flash-safe); the farm emits
 *               'flight:phase' { name: 'trackers:farm' } when the front reaches its first row.
 * The world's sun never moves: the farm's day plays on the Tagesmodell (station B's six mini tables
 * are extra instances of the same mesh, scaled 1:20).
 *
 * Draws: the tables (PV top + frame) 2 · the far tables 1 (the stripes the island sees, C1 m7; they
 * keep moving through the stow wave while the area is suspended above h = 1 m).
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { ROOFS, SITE } from './tuning';
import { TOK, box, merge, paint, type Look } from './look';
import type { Plane } from './site';

export type RoofMode = 'track' | 'shelter' | 'stow';

export interface Roof {
  /** set the real rows' mode (rows of both roofs; `which` limits to one) */
  setMode(mode: RoofMode, which?: 'a' | 'b'): void;
  readonly mode: RoofMode;
  /** the mini rows of the Tagesmodell: tilt in degrees (+ west) and their world placement root */
  setMini(tiltDeg: number): void;
  /** current tilt of a real row (deg, + west) */
  tilt(i: number): number;
  /** a row of A is moving (sound, the hail sequence) */
  readonly slewing: boolean;
  /** the lift-off stow wave state (tools) */
  readonly wave: { started: number; farmAt: number; rows: number };
  update(dt: number): void;
  /** the far tier keeps the stow wave going while the area is suspended */
  readonly farMesh: THREE.InstancedMesh;
}

const ZETA = 0.627;

export function buildRoof(ctx: ZoneContext, look: Look, plane: Plane, ext: THREE.Object3D, far: THREE.Object3D, mini: { x: number; y: number; z: number }): Roof {
  const L = ROOFS.x1 - ROOFS.x0,
    W = ROOFS.tableW,
    N = ROOFS.modules;
  const ml = L / N;
  // ── one table: twelve bifacial modules over a carbon torque tube, alu frame rails, the slew ring ──
  const tops: THREE.BufferGeometry[] = [];
  for (let k = 0; k < N; k++) {
    const x = -L / 2 + (k + 0.5) * ml;
    tops.push(new THREE.PlaneGeometry(ml - 0.04, W - 0.06).rotateX(-Math.PI / 2).translate(x, 0.13, 0));
    tops.push(new THREE.PlaneGeometry(ml - 0.04, W - 0.06).rotateX(Math.PI / 2).translate(x, 0.105, 0));
  }
  const top = merge(tops);
  top.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(top.getAttribute('position').count * 3).fill(1), 3));
  const rest: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) rest.push(paint(box(L + 0.04, 0.045, 0.035, 0, 0.118, s * (W / 2 - 0.0175)), TOK.alu));
  for (let k = 0; k <= N; k++) rest.push(paint(box(0.03, 0.04, W - 0.04, -L / 2 + k * ml, 0.118, 0), TOK.alu));
  rest.push(paint(new THREE.CylinderGeometry(0.06, 0.06, L + 0.3, 12).rotateZ(Math.PI / 2), TOK.carbon));
  for (const s of [-0.55, 0.55]) rest.push(paint(box(L - 0.2, 0.04, 0.05, 0, 0.07, s), 0xa8a29e));
  // the slew ring at the middle drive turns with the table: it may carry the orange (GDD §9.2, ≤ 5 %)
  rest.push(paint(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 18).rotateZ(Math.PI / 2), TOK.orange));
  const frame = merge(rest);
  const geo = merge([top, frame].map((g) => (g.index ? g.toNonIndexed() : g)));
  // two groups: the cells (pvCell) and the rest (vertex-coloured frame)
  geo.clearGroups();
  const nTop = merge([new THREE.PlaneGeometry(1, 1)]).getAttribute('position').count; // 6 vertices per quad
  geo.addGroup(0, 2 * N * nTop, 0);
  geo.addGroup(2 * N * nTop, Infinity, 1);
  const rowsZ: { z: number; roof: 'a' | 'b' }[] = [];
  for (const off of ROOFS.rowOffsets) rowsZ.push({ z: ROOFS.a.z0 + off, roof: 'a' });
  for (const off of ROOFS.rowOffsets) rowsZ.push({ z: ROOFS.b.z0 + off, roof: 'b' });
  const R = rowsZ.length;
  const MINI = ROOFS.rowOffsets.length;
  const tables = new THREE.InstancedMesh(geo, [look.pv, look.frame], R + MINI);
  tables.name = 'sonnenacker:tables';
  tables.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tables.castShadow = true;
  tables.receiveShadow = true;
  ext.add(tables);

  // the far tier: one dark slab per row (the stripes seen from the island and in the lift-off)
  const farGeo = paint(new THREE.BoxGeometry(L, 0.06, W), TOK.pv);
  const farMesh = new THREE.InstancedMesh(farGeo, look.paint, R);
  farMesh.name = 'sonnenacker:far-tables';
  farMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  farMesh.castShadow = false;
  far.add(farMesh);
  ctx.onDispose(() => {
    geo.dispose();
    farGeo.dispose();
    tables.dispose();
    farMesh.dispose();
  });

  // ── the sun's angle in the farm's E–W plane: the tables turn about local x ─────────────────
  const sunTheta = (): number => {
    const e = ctx.env.params;
    const az = THREE.MathUtils.degToRad(e.sunAzimuthDeg),
      el = THREE.MathUtils.degToRad(e.sunElevationDeg);
    const d = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).applyAxisAngle(new THREE.Vector3(0, 1, 0), -ctx.layout.facing);
    // rotation about +x by θ turns the table normal (0, 1, 0) to (0, cos θ, sin θ): face the sun's (y, z)
    return Math.atan2(d.z, d.y);
  };
  const MAX = THREE.MathUtils.degToRad(ROOFS.maxTiltDeg);
  const clampT = (t: number): number => Math.max(-MAX, Math.min(MAX, t));

  // per-row loop: angle, velocity, setpoint, retarget timer, stow ramp
  const ang = new Float32Array(R),
    vel = new Float32Array(R),
    set = new Float32Array(R),
    timer = new Float32Array(R),
    stowAt = new Float32Array(R).fill(-1);
  let sun = clampT(sunTheta());
  let seed = 98761;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < R; i++) {
    ang[i] = set[i] = sun + (rnd() - 0.5) * 0.02;
    timer[i] = ROOFS.retargetS[0] + rnd() * (ROOFS.retargetS[1] - ROOFS.retargetS[0]);
  }
  const modeOf: RoofMode[] = new Array(R).fill('track');
  let miniTilt = 0;
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    p = new THREE.Vector3(),
    one = new THREE.Vector3(1, 1, 1),
    X = new THREE.Vector3(1, 0, 0);
  const write = (i: number): void => {
    const r = rowsZ[i];
    p.set(0, plane.at(0, r.z) + ROOFS.pivotY, r.z);
    q.setFromAxisAngle(X, ang[i]);
    m4.compose(p, q, one);
    tables.setMatrixAt(i, m4);
    farMesh.setMatrixAt(i, m4);
  };
  const writeMini = (): void => {
    const s = 1 / 20;
    for (let k = 0; k < MINI; k++) {
      const z = mini.z + (ROOFS.rowOffsets[k] - 18) * s;
      p.set(mini.x, mini.y + ROOFS.pivotY * s + 0.01, z);
      q.setFromAxisAngle(X, THREE.MathUtils.degToRad(-miniTilt));
      m4.compose(p, q, new THREE.Vector3(s, s, s));
      tables.setMatrixAt(R + k, m4);
    }
  };
  for (let i = 0; i < R; i++) write(i);
  writeMini();
  tables.computeBoundingSphere();
  farMesh.computeBoundingSphere();

  // ── the lift-off's stow wave (plan §4.15; WP13 'flight:phase' 'downwash', r = front radius) ──
  const wave = { started: -1, farmAt: -1, rows: 0, r0: 0, t0: 0, lastT: 0, lastName: '' };
  const distOf = rowsZ.map((r) => ctx.toWorld([0, 0, r.z]).length());
  const nearest = Math.min(...distOf);
  let emitted = false;
  let waveTimer: (() => void) | null = null;
  const startWave = (r0: number, tSeq: number): void => {
    wave.started = ctx.time.elapsed;
    wave.r0 = r0;
    wave.t0 = tSeq;
    emitted = false;
    waveTimer?.();
    // the area is suspended above h = 1 m (no update): a timer drives the far tables meanwhile
    waveTimer = ctx.every(1 / 20, () => stepWave(1 / 20));
  };
  const stepWave = (dt: number): void => {
    if (wave.started < 0) return;
    const r = wave.r0 + (ctx.time.elapsed - wave.started) * ROOFS.waveSpeed;
    let moving = false;
    for (let i = 0; i < R; i++) {
      if (stowAt[i] < 0 && r >= distOf[i]) {
        stowAt[i] = ctx.time.elapsed;
        modeOf[i] = 'stow';
        wave.rows++;
        if (!emitted) {
          emitted = true;
          wave.farmAt = ctx.time.elapsed;
          ctx.events.emit('flight:phase', { name: 'trackers:farm', t: wave.t0 + (ctx.time.elapsed - wave.started), h: ctx.flight.altitude, r: Math.round(distOf[i]) });
        }
      }
      if (modeOf[i] === 'stow') moving = slewTo(i, 0, dt) || moving;
    }
    if (ctx.time.elapsed - wave.started > ROOFS.waveHoldS + 10 && !moving) {
      waveTimer?.();
      waveTimer = null;
    }
    farMesh.instanceMatrix.needsUpdate = true;
    tables.instanceMatrix.needsUpdate = true;
  };
  /** a single ramp toward `target` in ROOFS.slewS (flash-safe); true while moving */
  const slewTo = (i: number, target: number, dt: number): boolean => {
    const d = target - ang[i];
    if (Math.abs(d) < 1e-4) {
      vel[i] = 0;
      return false;
    }
    const rate = (MAX * 2) / ROOFS.slewS;
    ang[i] += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    write(i);
    return true;
  };
  ctx.events.on('flight:phase', (e: { name?: string; t?: number; r?: number } | undefined) => {
    if (!e?.name || e.name === 'trackers:farm') return;
    wave.lastName = e.name;
    wave.lastT = e.t ?? 0;
    if (e.name === 'downwash' && wave.started < 0) {
      if (ctx.settings.reducedMotion) {
        // reduced motion: no wave animation, the rows are shown stowed (§4.15)
        for (let i = 0; i < R; i++) {
          ang[i] = 0;
          modeOf[i] = 'stow';
          stowAt[i] = ctx.time.elapsed;
          write(i);
        }
        farMesh.instanceMatrix.needsUpdate = tables.instanceMatrix.needsUpdate = true;
        wave.started = ctx.time.elapsed;
        wave.farmAt = ctx.time.elapsed;
        wave.rows = R;
        ctx.events.emit('flight:phase', { name: 'trackers:farm', t: e.t ?? 0, h: ctx.flight.altitude, r: Math.round(nearest) });
        return;
      }
      startWave(Math.max(0, e.r ?? 0), e.t ?? 0);
    } else if (e.name === 'downwash' && typeof e.r === 'number' && wave.started >= 0) {
      // a later 'downwash' with the front's radius: follow WP13's front instead of our speed
      wave.r0 = e.r;
      wave.started = ctx.time.elapsed;
    }
  });
  /** back at the dock (resume): every row tracks again */
  const resetWave = (): void => {
    waveTimer?.();
    waveTimer = null;
    wave.started = wave.farmAt = -1;
    wave.rows = 0;
    for (let i = 0; i < R; i++) {
      stowAt[i] = -1;
      if (modeOf[i] === 'stow') modeOf[i] = 'track';
    }
  };
  ctx.events.on('zone:resume', (e: { id?: string } | undefined) => {
    if (e?.id === ctx.id) resetWave();
  });

  let anyMoving = false;
  return {
    get mode() {
      return modeOf[0];
    },
    get slewing() {
      return anyMoving;
    },
    wave,
    farMesh,
    setMode(mode, which) {
      for (let i = 0; i < R; i++) if (!which || rowsZ[i].roof === which) modeOf[i] = mode;
    },
    setMini(t) {
      miniTilt = t;
      writeMini();
      tables.instanceMatrix.needsUpdate = true;
    },
    tilt: (i) => -THREE.MathUtils.radToDeg(ang[i]),
    update(dt) {
      // the sun is fixed, but read it now and then (a TAG ↔ ABEND switch airborne, a debug sun)
      sun = clampT(sunTheta());
      const rm = ctx.settings.reducedMotion;
      const wn = 4 / (ZETA * ROOFS.settleS);
      anyMoving = false;
      for (let i = 0; i < R; i++) {
        const m = modeOf[i];
        if (m === 'stow') {
          if (wave.started < 0) anyMoving = slewTo(i, 0, dt) || anyMoving;
          continue;
        }
        if (m === 'shelter') {
          anyMoving = (rm ? ((ang[i] = 0), write(i), false) : slewTo(i, 0, dt)) || anyMoving;
          continue;
        }
        timer[i] -= dt;
        if (timer[i] <= 0) {
          timer[i] = ROOFS.retargetS[0] + rnd() * (ROOFS.retargetS[1] - ROOFS.retargetS[0]);
          set[i] = clampT(sun + (rnd() - 0.5) * 0.03);
        }
        if (rm) {
          if (ang[i] !== set[i]) {
            ang[i] = set[i];
            vel[i] = 0;
            write(i);
          }
          continue;
        }
        // returning from shelter or stow: a single ramp first, then the control loop
        if (Math.abs(set[i] - ang[i]) > 0.2) {
          anyMoving = slewTo(i, set[i], dt) || anyMoving;
          continue;
        }
        const a = wn * wn * (set[i] - ang[i]) - 2 * ZETA * wn * vel[i];
        vel[i] += a * dt;
        ang[i] += vel[i] * dt;
        if (Math.abs(vel[i]) > 1e-5) write(i);
      }
      tables.instanceMatrix.needsUpdate = true;
      farMesh.instanceMatrix.needsUpdate = true;
    },
  };
  void SITE;
}
