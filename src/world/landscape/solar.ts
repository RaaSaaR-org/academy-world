import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { HALL_RECT, PV, PV_FIELDS, PV_ROWS, type PvRowDef } from './plan';
import { type Batch, flatRing, paint, rbox } from './batch';
import { groundStrip, merge } from '../util';

/**
 * PV tracker rows (phase 5, replacing the "solar trees": the founder read them as trees). Phase 7
 * (WP12): the two north fields stand on the Schauhalle's roof frame; every row stows flat on WP13's
 * 'flight:phase' 'downwash' (plan §6.5 WP12 „Provides“). Low
 * single-axis trackers on machined frames: a carbon torque tube on tapered ceramic piles with alu
 * bearing housings, one slew drive per segment (ceramic housing, teal status slit), and a table of
 * PV modules that turns about the north–south axis toward the sun (limited to ±50°; at full dusk the
 * rows stow flat). All rows run parallel to the Allee and the north spoke, so they line both and
 * point at the tower. Each sits in a darker composite field with an alu kerb.
 *
 * Control-loop life (ART-V2 §2.1 rule 5): every 6–10 s a row gets a new sun estimate and its table
 * follows as a damped second-order step (8 % overshoot, 2 % settling in 1.2 s).
 * Static parts → island batch; modules = ONE InstancedMesh with two groups (PV top, frame/back),
 * the only shadow casters here. Low tier: static tables, no table shadows.
 */
export interface SolarRows {
  update(dt: number, t: number, animate: boolean): void;
  readonly rows: readonly PvRowDef[];
  /** knock row i off its aim; resolves with the measured settle time (s), −1 if superseded */
  kick(i: number, deg?: number): Promise<number>;
  /** world position of row i's drive unit (its service panel) */
  drive(i: number): THREE.Vector3;
  setShadows(on: boolean): void;
}

/** ζ for 8 % overshoot, ωn for a 2 % settling time of 1.2 s */
const ZETA = 0.627;
const WN = 4 / (ZETA * 1.2);
const CARBON = 0x1c1917,
  ALU = 0xc9c4bf,
  HULL = 0xd6d3d1;

export function buildSolarRows(ctx: ZoneContext, batch: Batch): SolarRows {
  const M = ctx.materials;
  const H = PV.pivot;
  const frameMat = M.standard({ vertexColors: true, roughness: 0.42, metalness: 0.28 });
  const teal = M.light(0x2dd4bf);
  const drives: THREE.Vector3[] = [];

  // ── fields: darker composite pad, alu kerb, teal corner ticks ──────────────
  const fieldMat = M.deckTone(0x9d9892, 0.84, { polygonOffset: 2 });
  for (const f of PV_FIELDS) {
    const rows = PV_ROWS.filter((r) => PV_FIELDS[r.field] === f);
    if (!rows.length || f.roof != null) continue;
    const xs = rows.map((r) => r.x);
    const x0 = Math.min(...xs) - 1.75,
      x1 = Math.max(...xs) + 1.75;
    const z0 = Math.min(...rows.map((r) => r.z0)) - 1.2,
      z1 = Math.max(...rows.map((r) => r.z1)) + 1.2;
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2;
    batch.add(fieldMat, new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate(cx, 0.012, cz), { name: 'pv-fields' });
    // alu kerb all round (flush strips)
    const kerb = M.brushedAlu;
    for (const [ax, az, bx, bz] of [
      [x0, z0, x1, z0],
      [x1, z0, x1, z1],
      [x1, z1, x0, z1],
      [x0, z1, x0, z0],
    ])
      batch.add(kerb, groundStrip(ax, az, bx, bz, 0.1, 0.016, 1), { name: 'alu' });
    // a flush cable channel under every row (carbon) with a teal line: the row's power and data run
    for (const r of rows) {
      batch.add(M.carbon, groundStrip(r.x, r.z0 - 0.4, r.x, r.z1 + 0.4, 0.22, 0.018, 1), { name: 'carbon' });
      batch.add(teal, groundStrip(r.x, r.z0 - 0.35, r.x, r.z1 + 0.35, 0.06, 0.022, 1), { name: 'teal-lines' });
    }
  }

  buildRoofFrame(ctx, batch);

  // ── per segment: piles, bearings, torque tube, slew drive ──────────────────
  PV_ROWS.forEach((r) => {
    const len = r.z1 - r.z0;
    const zc = (r.z0 + r.z1) / 2;
    const parts: THREE.BufferGeometry[] = [];
    const y0 = r.y;
    // piles every ~3.2 m (always one at each end and one at the drive in the middle)
    const nBays = Math.max(2, Math.round(len / 3.2));
    const piles: number[] = [];
    for (let k = 0; k <= nBays; k++) piles.push(r.z0 + 0.25 + ((len - 0.5) * k) / nBays);
    if (nBays % 2) piles.push(zc);
    for (const z of piles) {
      parts.push(paint(new THREE.CylinderGeometry(0.16, 0.18, 0.05, 12).translate(r.x, 0.025, z), CARBON));
      parts.push(paint(new THREE.CylinderGeometry(0.1, 0.11, 0.04, 12).translate(r.x, 0.07, z), ALU));
      parts.push(paint(new THREE.CylinderGeometry(0.048, 0.07, H - 0.17, 10).translate(r.x, 0.09 + (H - 0.17) / 2, z), HULL));
      // bearing housing: alu block around the tube
      parts.push(paint(rbox(0.2, 0.2, 0.12).translate(r.x, H - 0.02, z), ALU));
    }
    // torque tube (carbon; it turns, but it is round) and alu end caps
    parts.push(paint(new THREE.CylinderGeometry(0.055, 0.055, len + 0.1, 14).rotateX(Math.PI / 2).translate(r.x, H, zc), CARBON));
    for (const z of [r.z0 - 0.05, r.z1 + 0.05]) parts.push(paint(new THREE.CylinderGeometry(0.068, 0.068, 0.025, 14).rotateX(Math.PI / 2).translate(r.x, H, z), ALU));
    // slew drive at the middle pile: alu gear ring around the tube, ceramic motor housing below it
    parts.push(paint(new THREE.CylinderGeometry(0.17, 0.17, 0.11, 20).rotateX(Math.PI / 2).translate(r.x, H, zc), ALU));
    parts.push(paint(rbox(0.36, 0.46, 0.3).translate(r.x, H - 0.47, zc), HULL));
    parts.push(paint(new THREE.BoxGeometry(0.38, 0.05, 0.32).translate(r.x, H - 0.72, zc), CARBON));
    for (const s of [-1, 1]) parts.push(paint(new THREE.BoxGeometry(0.012, 0.2, 0.2).translate(r.x + s * 0.181, H - 0.44, zc), 0x0f0e0d));
    batch.add(frameMat, merge(parts).translate(0, y0, 0), { name: 'pv-frames' });
    // status slits on both faces of the drive housing (T0 by day, T1 at dusk)
    for (const s of [-1, 1]) batch.add(teal, new THREE.BoxGeometry(0.012, 0.025, 0.16).translate(r.x + s * 0.188, y0 + H - 0.36, zc), { name: 'teal-lines' });
    drives.push(new THREE.Vector3(r.x, y0 + H - 0.47, zc));
    // collider: the row's volume up to the tube (covers the tilted table's footprint; nobody walks under a row; nobody reaches the roof)
    if (y0 === 0) ctx.physics.addStaticBox({ size: [1.3, H + 0.15, len + 0.1], position: [r.x, (H + 0.15) / 2, zc], surface: 'metal' });
  });
  // a teal foot ring at each drive pile (reads at dusk from the Allee)
  for (const d of drives) batch.add(teal, flatRing(d.x, d.z, 0.2, 0.235, d.y - (H - 0.47) + 0.024, 24), { name: 'teal-lines' });

  // ── modules: PV top + alu frame, light backsheet, purlins and a junction box ──
  const pvTex = M.canvasTexture(512, 256, (g, w, h) => drawModule(g, w, h));
  pvTex.anisotropy = 8;
  ctx.onDispose(() => pvTex.dispose());
  const pvMat = new THREE.MeshPhysicalMaterial({ map: pvTex, roughness: 0.3, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.9 });
  pvMat.name = 'island:pv-cells';
  ctx.onDispose(() => pvMat.dispose());
  const W = PV.width,
    L = PV.module;
  // glass–glass (bifacial) modules: the cells show on both faces, so a row reads as PV from every side
  const top = mergeSimple([
    new THREE.PlaneGeometry(W - 0.06, L - 0.06).rotateX(-Math.PI / 2).translate(0, 0.135, 0),
    new THREE.PlaneGeometry(W - 0.06, L - 0.06).rotateX(Math.PI / 2).translate(0, 0.105, 0),
  ]);
  const rest: THREE.BufferGeometry[] = [];
  // frame: four alu rails
  rest.push(paint(new THREE.BoxGeometry(W, 0.045, 0.035).translate(0, 0.12, L / 2 - 0.0175), ALU));
  rest.push(paint(new THREE.BoxGeometry(W, 0.045, 0.035).translate(0, 0.12, -L / 2 + 0.0175), ALU));
  rest.push(paint(new THREE.BoxGeometry(0.035, 0.045, L - 0.07).translate(W / 2 - 0.0175, 0.12, 0), ALU));
  rest.push(paint(new THREE.BoxGeometry(0.035, 0.045, L - 0.07).translate(-W / 2 + 0.0175, 0.12, 0), ALU));
  // edge seal between the glass panes, and a slim junction box at the module end
  for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) rest.push(paint(new THREE.BoxGeometry(0.012, 0.03, L - 0.07).translate(x, 0.12, 0), 0x2b2725));
  rest.push(paint(new THREE.BoxGeometry(0.1, 0.02, 0.07).translate(0.62, 0.092, L / 2 - 0.12), 0x8f8a84));
  // purlins across the tube, clamps on the tube
  for (const z of [-0.28, 0.28]) {
    rest.push(paint(new THREE.BoxGeometry(W - 0.12, 0.04, 0.045).translate(0, 0.08, z), 0xa8a29e));
    rest.push(paint(new THREE.BoxGeometry(0.14, 0.05, 0.07).translate(0, 0.055, z), CARBON));
  }
  const restGeo = merge(rest);
  const topGeo = top.clone();
  topGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(topGeo.getAttribute('position').count * 3).fill(1), 3));
  const moduleGeo = mergeWithGroups(topGeo, restGeo);
  const modZ: number[] = [],
    modRow: number[] = [];
  PV_ROWS.forEach((r, ri) => {
    for (let z = r.z0 + L / 2; z < r.z1; z += L + PV.gap) {
      modZ.push(z);
      modRow.push(ri);
    }
  });
  const n = modZ.length;
  const modules = new THREE.InstancedMesh(moduleGeo, [pvMat, frameMat], n);
  modules.name = 'island:pv-modules';
  modules.castShadow = true;
  modules.receiveShadow = true;
  ctx.root.add(modules);
  ctx.freezeStatic(modules);

  // ── per-row controller: angle offset from the sun setpoint (rad), velocity, setpoint jitter ──
  const R = PV_ROWS.length;
  const off = new Float32Array(R),
    vel = new Float32Array(R),
    set = new Float32Array(R);
  const timers = PV_ROWS.map((r) => r.phase % r.period);
  const kicks: (null | { t: number; res: (s: number) => void; settled: number; deg: number })[] = PV_ROWS.map(() => null);
  let rs = 1234567;
  const rnd = (): number => {
    rs = (rs * 1103515245 + 12345) & 0x7fffffff;
    return rs / 0x7fffffff;
  };
  for (let i = 0; i < R; i++) off[i] = set[i] = (rnd() - 0.5) * 0.02;

  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    p = new THREE.Vector3(),
    one = new THREE.Vector3(1, 1, 1),
    Z = new THREE.Vector3(0, 0, 1);
  let sunTheta = 0,
    lastEnv = -1;
  const MAX = (PV.maxTilt * Math.PI) / 180;
  // Phase 7 (WP12 → WP13): the rows stow flat in the lift-off's downwash ('flight:phase' 'downwash')
  // and track the sun again once the island has climbed away (any later phase, or 40 s)
  let stow = 0,
    stowTarget = 0,
    stowUntil = -1;
  ctx.events.on('flight:phase', (p: { name?: string } | undefined) => {
    if (p?.name === 'downwash') {
      stowTarget = 1;
      stowUntil = ctx.time.elapsed + 40;
    } else if (stowTarget === 1 && p?.name) stowTarget = 0;
  });
  const readSun = (): void => {
    const e = ctx.env.params;
    const az = (e.sunAzimuthDeg * Math.PI) / 180,
      el = (e.sunElevationDeg * Math.PI) / 180;
    const sx = Math.cos(el) * Math.sin(az),
      sy = Math.sin(el);
    // rotation about +z: the table normal (0,1,0) → (−sin θ, cos θ, 0) faces the sun's x
    const ideal = THREE.MathUtils.clamp(Math.atan2(-sx, sy), -MAX, MAX);
    // full dusk: the rows stow flat for the night; the lift-off's downwash stows them too
    sunTheta = ideal * (1 - THREE.MathUtils.smoothstep(M.dusk, 0.7, 1.0)) * (1 - stow);
  };
  readSun();
  const place = (): void => {
    for (let i = 0; i < n; i++) {
      const ri = modRow[i];
      q.setFromAxisAngle(Z, sunTheta + off[ri]);
      p.set(PV_ROWS[ri].x, PV_ROWS[ri].y + H, modZ[i]);
      modules.setMatrixAt(i, m4.compose(p, q, one));
    }
    modules.instanceMatrix.needsUpdate = true;
  };
  place();
  modules.computeBoundingSphere();

  return {
    rows: PV_ROWS,
    drive: (i) => drives[i].clone(),
    setShadows(on) {
      modules.castShadow = on;
    },
    kick(i, deg = 24) {
      return new Promise((res) => {
        off[i] += ((deg * Math.PI) / 180) * (sunTheta > 0 ? -1 : 1);
        vel[i] = 0;
        kicks[i]?.res(-1);
        kicks[i] = { t: 0, res, settled: 0, deg };
      });
    },
    update(dt, t, animate) {
      if (stowUntil > 0 && ctx.time.elapsed > stowUntil) {
        stowTarget = 0;
        stowUntil = -1;
      }
      if (stow !== stowTarget) {
        // the stow drive: ≈ 3 s from tracking to flat (a slew drive's pace); reduced motion (WP13 request,
        // plan §4.15 „no tracker wave animation, rows shown stowed“): the rows are simply there
        stow = ctx.settings.reducedMotion ? stowTarget : THREE.MathUtils.clamp(stow + Math.sign(stowTarget - stow) * Math.min(dt, 0.1) * 0.35, 0, 1);
        readSun();
      }
      if (t - lastEnv > 0.5) {
        lastEnv = t;
        readSun();
      }
      if (!animate) {
        place();
        return;
      }
      const h = Math.min(dt, 1 / 30);
      for (let i = 0; i < R; i++) {
        timers[i] += h;
        const k = kicks[i];
        if (k) k.t += h;
        if (timers[i] >= PV_ROWS[i].period) {
          timers[i] = 0;
          // a new sun estimate: the setpoint moves by a fraction of a degree
          set[i] = (rnd() - 0.5) * 0.03;
        }
        const acc = WN * WN * (set[i] - off[i]) - 2 * ZETA * WN * vel[i];
        vel[i] += acc * h;
        off[i] += vel[i] * h;
        // kicked rows: report the 2 % settling time once the table stays inside the band
        if (k) {
          if (Math.abs(off[i] - set[i]) > (0.02 * k.deg * Math.PI) / 180) k.settled = k.t;
          if (k.t - k.settled > 0.6 || k.t > 5) {
            kicks[i] = null;
            k.res(k.settled);
          }
        }
      }
      place();
    },
  };
}

function mergeSimple(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return merge(list.map((g) => (g.index ? g.toNonIndexed() : g)));
}

/** Two geometries → one with groups 0 (a) and 1 (b); same attributes (position, normal, uv?, color). */
function mergeWithGroups(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const A = a.index ? a.toNonIndexed() : a,
    B = b.index ? b.toNonIndexed() : b;
  const out = new THREE.BufferGeometry();
  const na = A.getAttribute('position').count,
    nb = B.getAttribute('position').count;
  for (const name of ['position', 'normal', 'color']) {
    const arr = new Float32Array((na + nb) * 3);
    arr.set(A.getAttribute(name).array as Float32Array, 0);
    arr.set(B.getAttribute(name).array as Float32Array, na * 3);
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  const uv = new Float32Array((na + nb) * 2);
  const ua = A.getAttribute('uv');
  if (ua) uv.set(ua.array as Float32Array, 0);
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.addGroup(0, na, 0);
  out.addGroup(na, nb, 1);
  return out;
}

/** One module face: 12 × 6 mono cells (0.16 m), light cell gaps, three silver busbars per cell, fine fingers. */
function drawModule(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#4b4744';
  g.fillRect(0, 0, w, h);
  const cw = w / 12,
    ch = h / 6;
  let seed = 97;
  const r = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let j = 0; j < 6; j++)
    for (let i = 0; i < 12; i++) {
      const x = i * cw + 1,
        y = j * ch + 1,
        a = cw - 2,
        b = ch - 2;
      const v = 22 + Math.round((r() - 0.5) * 5);
      g.fillStyle = `rgb(${v},${v + 1},${v + 4})`;
      g.beginPath();
      const c = 4;
      g.moveTo(x + c, y);
      g.lineTo(x + a - c, y);
      g.lineTo(x + a, y + c);
      g.lineTo(x + a, y + b - c);
      g.lineTo(x + a - c, y + b);
      g.lineTo(x + c, y + b);
      g.lineTo(x, y + b - c);
      g.lineTo(x, y + c);
      g.closePath();
      g.fill();
      // fingers (faint) across, busbars (silver) along the module
      g.fillStyle = 'rgba(190,186,180,0.07)';
      for (let k = 3; k < b; k += 4) g.fillRect(x, y + k, a, 1);
      g.fillStyle = 'rgba(200,196,190,0.32)';
      for (let k = 1; k <= 3; k++) g.fillRect(x + (a * k) / 4 - 0.5, y, 1, b);
    }
}

/**
 * Phase 7 (WP12, plan §2.3): the Schauhalle's roof frame at y 9.3 that carries the two north tracker
 * fields — an alu ring beam on the hall's outline, two carbon cable trays with teal lines under the
 * rows and six slim columns (corners and long sides) that stand inside the hall's future glass
 * walls. Island geometry, static batch (no draw of its own). WP11 confirms the frame on wave-2 day 2.
 * No part casts: one casting part puts the island's whole merged static mesh into the shadow pass
 * (≈ +230 k triangles at the plaza); the tracker tables on it cast their own shadows.
 */
function buildRoofFrame(ctx: ZoneContext, batch: Batch): void {
  const M = ctx.materials;
  const { x0, x1, z0, z1, roofY: y } = HALL_RECT;
  const beam = (ax: number, az: number, bx: number, bz: number, w = 0.32, h = 0.42): THREE.BufferGeometry => {
    const len = Math.hypot(bx - ax, bz - az);
    return new THREE.BoxGeometry(w, h, len + w).rotateY(Math.atan2(bx - ax, bz - az)).translate((ax + bx) / 2, y - h / 2, (az + bz) / 2);
  };
  // ring beam and cross beams every ~5.6 m
  for (const [ax, az, bx, bz] of [
    [x0, z0, x1, z0],
    [x1, z0, x1, z1],
    [x1, z1, x0, z1],
    [x0, z1, x0, z0],
  ])
    batch.add(M.brushedAlu, beam(ax, az, bx, bz), { name: 'alu' });
  for (let k = 1; k < 5; k++) {
    const z = z0 + ((z1 - z0) * k) / 5;
    batch.add(M.brushedAlu, beam(x0, z, x1, z, 0.22, 0.3), { name: 'alu' });
  }
  // cable trays under the rows (carbon, a teal line on top)
  for (const x of [-11.1, 11.1]) {
    batch.add(M.carbon, beam(x, z0 + 0.6, x, z1 - 0.6, 4.6, 0.12), { name: 'carbon' });
    batch.add(M.light(0x2dd4bf), new THREE.BoxGeometry(0.06, 0.02, z1 - z0 - 1.6).translate(x, y + 0.01, (z0 + z1) / 2), { name: 'teal-lines' });
  }
  // six slim columns down to the deck (inside the hall's walls)
  for (const [x, z] of [
    [x0 + 0.2, z0 + 0.2],
    [x1 - 0.2, z0 + 0.2],
    [x0 + 0.2, z1 - 0.2],
    [x1 - 0.2, z1 - 0.2],
    [x0 + 0.2, (z0 + z1) / 2],
    [x1 - 0.2, (z0 + z1) / 2],
  ]) {
    batch.add(M.brushedAlu, new THREE.CylinderGeometry(0.16, 0.2, y - 0.42, 12).translate(x, (y - 0.42) / 2, z), { name: 'alu' });
    batch.add(M.carbon, new THREE.CylinderGeometry(0.3, 0.32, 0.08, 14).translate(x, 0.04, z), { name: 'carbon' });
    ctx.physics.addStaticCylinder({ radius: 0.22, height: y, position: [x, y / 2, z], surface: 'metal' });
  }
}
