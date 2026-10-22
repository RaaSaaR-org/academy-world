import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { ISLAND, PADS, PATHS, ZONE_PLOTS, bearingDir, polar } from '../layout';
import { DRONE_DOCKS, FIN_BANKS, HALL_RECT, featureDistance, freeDistance, inHallRect } from './plan';
import { type Batch, flatRing, paint } from './batch';

/**
 * The deck as a working machine (phase 5, landscape):
 *  - data pulses: short teal packets run along the light channels (Allee, spokes, north spoke)
 *    INTO the tower; on the spoke to the current objective they run OUT, in orange, toward the zone,
 *  - flush edge studs along the paths (runway lights): dark lenses by day, teal T1 at dusk,
 *  - rover lanes painted on the ring path (dashed centre line, direction chevrons),
 *  - deck hardware with a job: a ring-frame band with access hatches, vent grates at the fin banks,
 *    tie-down points at the drone docks.
 * Pulses = 1 draw call, studs = 1 (instanced), everything else goes to the island batch.
 */
export interface Lanes {
  update(t: number): void;
}

const Y_INLAY = 0.045;
const TEAL = new THREE.Color(0x2dd4bf),
  ORANGE = new THREE.Color(0xff6700);

export function buildLanes(ctx: ZoneContext, batch: Batch): Lanes {
  const pulses = buildPulses(ctx);
  buildStuds(ctx, batch);
  buildMarkings(ctx, batch);
  buildFurniture(ctx, batch);
  return pulses;
}

// ── data pulses ───────────────────────────────────────────────────────────────

function buildPulses(ctx: ZoneContext): Lanes {
  const M = ctx.materials;
  const pos: number[] = [],
    sAt: number[] = [],
    spoke: number[] = [],
    idx: number[] = [];
  /** a straight channel (x0,z0)→(x1,z1), width w; s0/s1 = distance to the tower along the flow */
  const strip = (x0: number, z0: number, x1: number, z1: number, w: number, s0: number, s1: number, k: number): void => {
    const dx = x1 - x0,
      dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const nx = (-dz / len) * (w / 2),
      nz = (dx / len) * (w / 2);
    const b = pos.length / 3;
    pos.push(x0 + nx, Y_INLAY + 0.004, z0 + nz, x0 - nx, Y_INLAY + 0.004, z0 - nz, x1 + nx, Y_INLAY + 0.004, z1 + nz, x1 - nx, Y_INLAY + 0.004, z1 - nz);
    sAt.push(s0, s0, s1, s1);
    spoke.push(k, k, k, k);
    idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  };
  // Allee ±3.3 (two runs each side, around the ring crossing)
  for (const o of [-3.3, 3.3]) {
    strip(o, PATHS.avenue.to - 0.5, o, PATHS.ring.outer + 0.3, 0.09, PATHS.avenue.to - 0.5, PATHS.ring.outer + 0.3, -1);
    strip(o, PATHS.ring.inner - 0.3, o, PATHS.plazaRadius + 0.5, 0.09, PATHS.ring.inner - 0.3, PATHS.plazaRadius + 0.5, -1);
  }
  // north spoke centre line (Phase 7: not inside the Schauhalle's rect, §2.3)
  strip(0, -84.5, 0, HALL_RECT.z0 - 0.6, 0.09, 84.5, -HALL_RECT.z0 + 0.6, -1);
  strip(0, HALL_RECT.z1 + 0.6, 0, -(PATHS.ring.outer + 0.3), 0.09, -HALL_RECT.z1 - 0.6, PATHS.ring.outer + 0.3, -1);
  strip(0, -(PATHS.ring.inner - 0.3), 0, -33, 0.09, PATHS.ring.inner - 0.3, 33, -1);
  // zone spokes (one inlay each, r 28.7 → 57.6)
  ZONE_PLOTS.forEach((p, k) => {
    const [dx, dz] = bearingDir(p.bearing);
    const r0 = PADS.hubRadius + PADS.diameter / 2 + 0.2,
      r1 = PATHS.spoke.to - 0.4;
    strip(dx * r1, dz * r1, dx * r0, dz * r0, 0.09, r1, r0, k);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(sAt, 1));
  g.setAttribute('aSpoke', new THREE.Float32BufferAttribute(spoke, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();

  const u = {
    uTime: { value: 0 },
    uObj: { value: -1 },
    uBaseT: { value: new THREE.Color() },
    uPulseT: { value: new THREE.Color() },
    uBaseO: { value: new THREE.Color() },
    uPulseO: { value: new THREE.Color() },
  };
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  mat.name = 'island:pulses';
  mat.userData.noEnrich = true;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aS;\nattribute float aSpoke;\nvarying float vS;\nvarying float vSpoke;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvS = aS;\nvSpoke = aSpoke;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uTime; uniform float uObj; uniform vec3 uBaseT; uniform vec3 uPulseT; uniform vec3 uBaseO; uniform vec3 uPulseO;\nvarying float vS;\nvarying float vSpoke;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  bool obj = abs(vSpoke - uObj) < 0.5;
  // packets every 14 m at 5 m/s: into the tower, or out toward the objective
  float u = (obj ? -vS : vS) + uTime * 5.0;
  float ph = fract(u / 14.0);
  float k = exp(-ph * 14.0 * 0.9);
  if (k < 0.03) discard;
  vec3 base = obj ? uBaseO : uBaseT;
  vec3 pulse = obj ? uPulseO : uPulseT;
  diffuseColor.rgb = mix(base, pulse, k);
}`,
      );
  };
  mat.customProgramCacheKey = () => 'emai-pulses';
  ctx.onDispose(() => mat.dispose());
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'island:pulses';
  mesh.matrixAutoUpdate = false;
  ctx.root.add(mesh);

  const paintColors = (): void => {
    u.uBaseT.value.copy(TEAL).multiplyScalar(M.tierScale(TEAL, 'line'));
    u.uPulseT.value.copy(TEAL).multiplyScalar(M.tierScale(TEAL, 'T1'));
    u.uBaseO.value.copy(ORANGE).multiplyScalar(M.tierScale(ORANGE, 'line'));
    u.uPulseO.value.copy(ORANGE).multiplyScalar(M.tierScale(ORANGE, 'T1'));
  };
  paintColors();
  ctx.onDispose(M.onDusk(paintColors));
  ctx.events.on('objective:changed', (e: { zone?: string | null } | undefined) => {
    u.uObj.value = ZONE_PLOTS.findIndex((p) => p.id === e?.zone);
  });
  return {
    update(t) {
      // reduced motion: the packets stand still (a dashed channel)
      if (!ctx.settings.reducedMotion) u.uTime.value = t % 1000;
    },
  };
}

// ── edge studs (runway lights) ───────────────────────────────────────────────

function buildStuds(ctx: ZoneContext, batch: Batch): void {
  const M = ctx.materials;
  const spots: [number, number][] = [];
  const crossings = [...ZONE_PLOTS.map((p) => ({ b: p.bearing, w: PATHS.spoke.width })), { b: 0, w: PATHS.northSpoke.width }, { b: 180, w: PATHS.avenue.width }, ...ISLAND.kanzeln.bearings.map((b) => ({ b, w: PATHS.kanzelStub.width }))];
  // ring path: both edges every 3 m, gaps at the crossings
  for (const r of [PATHS.ring.inner + 0.32, PATHS.ring.outer - 0.32]) {
    const n = Math.round((2 * Math.PI * r) / 3);
    for (let i = 0; i < n; i++) {
      const b = (i / n) * 360;
      const clear = crossings.every((c) => {
        const d = Math.abs(((b - c.b + 540) % 360) - 180) * (Math.PI / 180) * r;
        return d > c.w / 2 + 0.6;
      });
      if (!clear) continue;
      const p = polar(b, r);
      spots.push([p[0], p[2]]);
    }
  }
  // spokes, north spoke and Kanzel stubs: both edges every 3 m, outside the ring crossing
  const along = (bear: number, r0: number, r1: number, half: number): void => {
    const [dx, dz] = bearingDir(bear);
    const [tx, tz] = bearingDir(bear + 90);
    for (let r = r0; r <= r1; r += 3) {
      if (r > PATHS.ring.inner - 0.8 && r < PATHS.ring.outer + 0.8) continue;
      for (const s of [-1, 1]) spots.push([dx * r + tx * s * half, dz * r + tz * s * half]);
    }
  };
  for (const p of ZONE_PLOTS) along(p.bearing, PATHS.plazaRadius + 1.5, PATHS.spoke.to - 1, PATHS.spoke.width / 2 - 0.32);
  along(0, PATHS.plazaRadius + 1.5, 83, PATHS.northSpoke.width / 2 - 0.3);
  for (const b of ISLAND.kanzeln.bearings) along(b, PATHS.kanzelStub.from + 1.5, PATHS.kanzelStub.to - 2, PATHS.kanzelStub.width / 2 - 0.28);
  // Phase 7 (WP12, §2.3): none inside the Schauhalle's rect
  for (let i = spots.length - 1; i >= 0; i--) if (inHallRect(spots[i][0], spots[i][1], 0.4)) spots.splice(i, 1);

  for (const [x, z] of spots) batch.add(M.brushedAlu, flatRing(x, z, 0.055, 0.085, 0.034, 14), { name: 'alu' });
  const lens = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.056, 0.06, 0.03, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }), spots.length);
  lens.name = 'island:edge-studs';
  (lens.material as THREE.Material).userData.noEnrich = true;
  ctx.onDispose(() => (lens.material as THREE.Material).dispose());
  const m4 = new THREE.Matrix4();
  spots.forEach(([x, z], i) => lens.setMatrixAt(i, m4.makeTranslation(x, 0.022, z)));
  lens.computeBoundingSphere();
  ctx.root.add(lens);
  ctx.freezeStatic(lens);
  const DAY = new THREE.Color(0x1d2a28);
  const on = new THREE.Color();
  const paintLens = (t: number): void => {
    const k = THREE.MathUtils.smoothstep(t, 0.3, 0.6);
    on.copy(TEAL).multiplyScalar(M.tierScale(TEAL, 'T1'));
    (lens.material as THREE.MeshBasicMaterial).color.copy(DAY).lerp(on, k);
  };
  paintLens(M.dusk);
  ctx.onDispose(M.onDusk(paintLens));
}

// ── lane markings ───────────────────────────────────────────────────────────

function buildMarkings(ctx: ZoneContext, batch: Batch): void {
  const M = ctx.materials;
  const paintMat = M.standard({ color: 0xe7e5e4, roughness: 0.74, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  const Y = 0.026;
  const crossing = (b: number, r: number): boolean =>
    [...ZONE_PLOTS.map((p) => ({ b: p.bearing, w: PATHS.spoke.width })), { b: 0, w: PATHS.northSpoke.width }, { b: 180, w: PATHS.avenue.width }, ...ISLAND.kanzeln.bearings.map((bb) => ({ b: bb, w: PATHS.kanzelStub.width }))].some(
      (c) => Math.abs(((b - c.b + 540) % 360) - 180) * (Math.PI / 180) * r < c.w / 2 + 1.2,
    );
  // ring path: dashed centre line r 46 (1.6 m dash, 1.6 m gap)
  const rc = (PATHS.ring.inner + PATHS.ring.outer) / 2;
  const nd = Math.round((2 * Math.PI * rc) / 3.2);
  for (let i = 0; i < nd; i++) {
    const b0 = (i / nd) * 360,
      b1 = b0 + (1.6 / (2 * Math.PI * rc)) * 360;
    if (crossing(b0, rc) || crossing(b1, rc)) continue;
    const a0 = (b0 * Math.PI) / 180,
      a1 = (b1 * Math.PI) / 180;
    batch.add(paintMat, new THREE.RingGeometry(rc - 0.05, rc + 0.05, 3, 1, Math.PI / 2 - a1, a1 - a0).rotateX(-Math.PI / 2).translate(0, Y, 0), { name: 'lane-paint' });
  }
  // direction chevrons in both lanes every 15° (outer lane clockwise, inner lane anticlockwise: the rovers' loops)
  const chevron = (x: number, z: number, heading: number): void => {
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(0.09, 0.62).rotateX(-Math.PI / 2).rotateY(s * 0.75).translate(s * 0.2, 0, 0.2).rotateY(heading).translate(x, Y + 0.001, z);
      batch.add(paintMat, g, { name: 'lane-paint' });
    }
  };
  for (let b = 7.5; b < 360; b += 15) {
    for (const [r, dir] of [
      [47.2, 1],
      [44.8, -1],
    ] as const) {
      const bb = b + (dir > 0 ? 0 : 7.5);
      if (crossing(bb, r)) continue;
      const p = polar(bb, r);
      // heading of travel: tangent of increasing bearing = (cos b, sin b) in (x, z)
      const a = (bb * Math.PI) / 180;
      const tx = Math.cos(a) * dir,
        tz = Math.sin(a) * dir;
      chevron(p[0], p[2], Math.atan2(tx, tz) + Math.PI);
    }
  }
}

// ── deck furniture: a structural band with access hatches, vent grates at the fin banks ──

/**
 * Hardware where it has a job, in rhythms you can read from the air: a darker composite band over
 * the deck's ring frame (r 52.6–55.4, between the paths) with a flush access hatch every 7.5°,
 * vent grates along the outer side of each heat-exchanger bank (the banks draw air through the
 * deck there), and tie-down points around the drone docks.
 */
function buildFurniture(ctx: ZoneContext, batch: Batch): void {
  const M = ctx.materials;
  const hatchMat = M.standard({ vertexColors: true, roughness: 0.6, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  const bandMat = M.deckTone(0xb0aba5, 0.84, { polygonOffset: 2 });
  const y = 0.024;
  const quad = (w: number, d: number, ox: number, oz: number, col: number, dy = 0): THREE.BufferGeometry => paint(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(ox, y + dy, oz), col);
  const place = (parts: THREE.BufferGeometry[], x: number, z: number, yaw: number): void => {
    for (const g of parts) batch.add(hatchMat, g.rotateY(yaw).translate(x, 0, z), { name: 'hatches' });
  };
  const hatch = (): THREE.BufferGeometry[] => {
    const parts: THREE.BufferGeometry[] = [];
    for (const [w, d, ox, oz] of [
      [1.6, 0.07, 0, -0.765],
      [1.6, 0.07, 0, 0.765],
      [0.07, 1.46, -0.765, 0],
      [0.07, 1.46, 0.765, 0],
    ])
      parts.push(quad(w, d, ox, oz, 0xbdb7b1, 0.001));
    parts.push(quad(1.46, 1.46, 0, 0, 0x8a857f));
    parts.push(quad(0.04, 1.46, 0, 0, 0x6f6a65, 0.0005));
    parts.push(quad(0.42, 0.07, 0.35, 0.5, 0x45403c, 0.0008));
    for (const [bx, bz] of [
      [-0.64, -0.64],
      [0.64, -0.64],
      [-0.64, 0.64],
      [0.64, 0.64],
      [-0.64, 0],
      [0.64, 0],
    ])
      parts.push(paint(new THREE.CircleGeometry(0.03, 8).rotateX(-Math.PI / 2).translate(bx, y + 0.0012, bz), 0xd6d3d1));
    return parts;
  };
  const grate = (): THREE.BufferGeometry[] => {
    const parts: THREE.BufferGeometry[] = [quad(0.7, 2.6, 0, 0, 0x2b2725)];
    for (let k = 0; k < 14; k++) parts.push(quad(0.6, 0.06, 0, -1.17 + k * 0.18, 0x7c7671, 0.0006));
    for (const [w, d, ox, oz] of [
      [0.8, 0.05, 0, -1.325],
      [0.8, 0.05, 0, 1.325],
      [0.05, 2.6, -0.375, 0],
      [0.05, 2.6, 0.375, 0],
    ])
      parts.push(quad(w, d, ox, oz, 0xbdb7b1, 0.001));
    return parts;
  };

  // (a) the ring-frame band, 1° steps, only where the deck is free, with a hatch every 7.5°
  const R0 = 52.6,
    R1 = 55.4,
    RM = (R0 + R1) / 2;
  const freeAt = (b: number): boolean => {
    for (const r of [R0 - 0.3, RM, R1 + 0.3]) {
      const p = polar(b, r);
      if (freeDistance(p[0], p[2]) < 0.4 || featureDistance(p[0], p[2]) < 0.2 || inHallRect(p[0], p[2], 0.5)) return false;
    }
    return true;
  };
  let runStart = -1;
  const flushBand = (b0: number, b1: number): void => {
    if (b1 - b0 < 3) return;
    const a0 = (b0 * Math.PI) / 180,
      a1 = (b1 * Math.PI) / 180;
    batch.add(bandMat, new THREE.RingGeometry(R0, R1, Math.max(4, Math.round(b1 - b0) * 2), 1, Math.PI / 2 - a1, a1 - a0).rotateX(-Math.PI / 2).translate(0, 0.014, 0), { name: 'deck-band' });
    for (const [b, r] of [
      [b0, R0],
      [b1, R0],
    ]) {
      // alu end strips where the band stops at a path
      const p0 = polar(b, r),
        p1 = polar(b, R1);
      batch.add(M.brushedAlu, groundStripXZ(p0[0], p0[2], p1[0], p1[2], 0.08, 0.017), { name: 'alu' });
    }
    for (let b = Math.ceil(b0 / 7.5) * 7.5 + 3.75; b < b1 - 1.5; b += 7.5) {
      const p = polar(b, RM);
      place(hatch(), p[0], p[2], (-b * Math.PI) / 180);
    }
  };
  for (let b = 0; b <= 360; b += 1) {
    const ok = b < 360 && freeAt(b);
    if (ok && runStart < 0) runStart = b;
    if (!ok && runStart >= 0) {
      flushBand(runStart, b - 1);
      runStart = -1;
    }
  }
  // (b) vent grates along the outer side of each fin bank
  for (const fb of FIN_BANKS) {
    const r = fb.r + 1.75;
    const n = Math.max(2, Math.floor(((fb.b1 - fb.b0) * Math.PI * r) / 180 / 3.0));
    for (let k = 0; k < n; k++) {
      const b = fb.b0 + ((fb.b1 - fb.b0) * (k + 0.5)) / n;
      const p = polar(b, r);
      if (freeDistance(p[0], p[2]) < -0.5) continue;
      place(grate(), p[0], p[2], (-b * Math.PI) / 180 + Math.PI / 2);
    }
  }
  // (c) tie-down points around each drone dock
  for (const d of DRONE_DOCKS)
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const x = d.x + Math.cos(a) * 2.3,
        z = d.z + Math.sin(a) * 2.3;
      place([paint(new THREE.RingGeometry(0.07, 0.11, 14).rotateX(-Math.PI / 2).translate(0, y + 0.001, 0), 0x6f6a65), paint(new THREE.CircleGeometry(0.07, 14).rotateX(-Math.PI / 2).translate(0, y + 0.0005, 0), 0x2b2725), quad(0.12, 0.025, 0, 0, 0xa8a29e, 0.0012)], x, z, a);
    }
}

function groundStripXZ(x0: number, z0: number, x1: number, z1: number, w: number, y: number): THREE.BufferGeometry {
  const len = Math.hypot(x1 - x0, z1 - z0);
  return new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2).rotateY(Math.atan2(x1 - x0, z1 - z0)).translate((x0 + x1) / 2, y, (z0 + z1) / 2);
}
