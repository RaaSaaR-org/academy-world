/**
 * Sonnenacker — the static site (plan §4.10, §2.7; R8 §2.1): the planar terrain fit, the ground
 * decals (grass under the roofs, wood-chip paths, the gravel yard), the Hochbeete of Sonnendach A and
 * B and the three Referenzbeete, the rails, the roof frames, the bed-end chutes and crates, the
 * Hofladen with the dashboard wall's frame, the Tagesmodell's table, the cistern with its reed and
 * downpipe, the bumblebee boxes, the hedge and flower strips, the east gate and the LeKiwi depot;
 * plus the far tier (the farm as the island sees it: dark PV stripes and their analytic shadows,
 * C1 m7) and the colliders. Everything here is static: index.ts bakes the exterior with mergeStatic.
 *
 * The site rect is a planar fit in the terrain bake (WP3 plan.ts FIELDS, 18 m shoulder), so every
 * part stands on `plane.at(x, z)` and reaches a little into the ground (no gap on a gentle slope).
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { BEDS, ROOFS, SITE } from './tuning';
import { TOK, box, merge, part, post, rng, tube, type Look } from './look';

/** The site's terrain plane in zone-local metres: y = h0 + gx·x + gz·z. */
export interface Plane {
  h0: number;
  gx: number;
  gz: number;
  at(x: number, z: number): number;
}

/** Least-squares plane through the terrain over the rect, inside the bake's shoulders. */
export function fitPlane(ctx: ZoneContext): Plane {
  const xs: number[] = [],
    zs: number[] = [],
    hs: number[] = [];
  const w = new THREE.Vector3();
  for (let i = 0; i <= 6; i++)
    for (let j = 0; j <= 8; j++) {
      const x = -36 + (72 * i) / 6;
      const z = -60 + (120 * j) / 8;
      ctx.toWorld([x, 0, z], w);
      const h = ctx.frames.heightAt(w.x, w.z) - ctx.layout.anchor.y;
      if (!Number.isFinite(h)) continue;
      xs.push(x);
      zs.push(z);
      hs.push(h);
    }
  // normal equations of h = a + b·x + c·z (x and z are centred, so they decouple)
  const n = hs.length || 1;
  const mx = xs.reduce((a, b) => a + b, 0) / n,
    mz = zs.reduce((a, b) => a + b, 0) / n,
    mh = hs.reduce((a, b) => a + b, 0) / n;
  let sxx = 0,
    szz = 0,
    sxz = 0,
    sxh = 0,
    szh = 0;
  for (let k = 0; k < hs.length; k++) {
    const dx = xs[k] - mx,
      dz = zs[k] - mz,
      dh = hs[k] - mh;
    sxx += dx * dx;
    szz += dz * dz;
    sxz += dx * dz;
    sxh += dx * dh;
    szh += dz * dh;
  }
  const det = sxx * szz - sxz * sxz || 1;
  const gx = (sxh * szz - szh * sxz) / det;
  const gz = (szh * sxx - sxh * sxz) / det;
  const h0 = mh - gx * mx - gz * mz;
  return { h0, gx, gz, at: (x, z) => h0 + gx * x + gz * z };
}

/** Geometries grouped by material parameters, flushed into one mesh each. */
class Batch {
  private buckets = new Map<string, { color: number; rough: number; metal: number; geos: THREE.BufferGeometry[]; cast: boolean }>();
  constructor(private look: Look) {}
  add(color: number, geo: THREE.BufferGeometry, o: { rough?: number; metal?: number; cast?: boolean } = {}): void {
    const rough = o.rough ?? 0.86,
      metal = o.metal ?? 0,
      cast = o.cast ?? true;
    const key = `${color}|${rough}|${metal}|${cast}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { color, rough, metal, geos: [], cast }));
    b.geos.push(geo);
  }
  flush(parent: THREE.Object3D, name: string): void {
    for (const b of this.buckets.values()) {
      if (!b.geos.length) continue;
      parent.add(part(merge(b.geos), this.look.mat(b.color, { rough: b.rough, metal: b.metal }), name, { cast: b.cast }));
    }
    this.buckets.clear();
  }
}

/** What the rest of the zone needs from the static site. */
export interface Site {
  plane: Plane;
  /** the dashboard screen's frame: centre (local), facing +x */
  dashboard: { x: number; y: number; z: number; w: number; h: number };
  /** the Tagesmodell's top (local), its model origin and the lamp arc */
  table: { x: number; y: number; z: number };
}

/** A flat decal on the plane (+ lift), as an x/z rect, subdivided so it follows the plane. */
function decal(plane: Plane, x0: number, x1: number, z0: number, z1: number, lift: number): THREE.BufferGeometry {
  const sx = Math.max(1, Math.ceil((x1 - x0) / 12)),
    sz = Math.max(1, Math.ceil((z1 - z0) / 12));
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, sx, sz).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, plane.at(p.getX(i), p.getZ(i)) + lift);
  g.computeVertexNormals();
  return g;
}

/** Build the static site under `ext` (exterior tier) and `far`; add the colliders. */
export function buildSite(ctx: ZoneContext, look: Look, ext: THREE.Object3D, far: THREE.Object3D): Site {
  const plane = fitPlane(ctx);
  const gy = (x: number, z: number): number => plane.at(x, z);
  const B = new Batch(look);
  const D = new Batch(look); // decals: receive only
  const rnd = rng(902611);
  const P = ctx.physics;

  // ── ground decals: grass under the roofs, wood chips on the bed paths, the gravel yard and tracks ──
  for (const r of [ROOFS.a, ROOFS.b]) {
    D.add(TOK.grassGreen, decal(plane, ROOFS.x0 - 1.8, ROOFS.x1 + 1.8, r.z0 - 1.2, r.z1 + 1.2, 0.03), { cast: false });
    // the paths between the beds and along the outer edges: wood chips
    const xs = [ROOFS.x0 - 1.3, ...BEDS.xs.slice(0, -1).map((x, i) => (x + BEDS.xs[i + 1]) / 2), ROOFS.x1 + 1.3];
    for (const x of xs) D.add(TOK.chips, decal(plane, x - 0.62, x + 0.62, r.z0 + 1.4, r.z1 - 1.4, 0.045), { cast: false });
  }
  const y = SITE.yard;
  D.add(TOK.gravel, decal(plane, y.x0, y.x1, y.z0, y.z1, 0.04), { cast: false });
  // the gate track into the yard, the rover lane along Sonnendach A's south side to B, the path to the Referenzbeete
  D.add(TOK.gravel, decal(plane, SITE.gate[0] - 1.75, SITE.gate[0] + 1.75, y.z1 - 0.5, 75.5, 0.042), { cast: false });
  D.add(TOK.gravel, decal(plane, -9.9, -8.1, ROOFS.b.z0 - 1, y.z0 + 0.5, 0.042), { cast: false });
  D.add(TOK.gravel, decal(plane, ROOFS.x1 + 1.8, 21, 46.5, 48.3, 0.042), { cast: false });
  D.add(TOK.gravel, decal(plane, 11.6, 13.4, 21, 47.5, 0.044), { cast: false });
  D.add(TOK.grassDry, decal(plane, 11.8, 19.4, 20.6, 35.4, 0.035), { cast: false });

  // the open field south of the roofs: low crop rows (managed green, §2.7 rule 2), lettuce and beans
  for (let x = -46; x <= -14; x += 1.25) {
    const c = rnd() < 0.5 ? TOK.crop : 0x67784a;
    // 7 m pieces with gaps, each on the plane (the site's slope is gentle, but 112 m of it is not)
    for (let z = -70; z < 42; z += 7) {
      if (rnd() < 0.08) continue;
      const h = 0.05 + rnd() * 0.06;
      D.add(c, box(0.62, h + 0.25, 6.4 + rnd() * 0.5, x, 0, z + 3.5).translate(0, gy(x, z + 3.5) + h / 2 - 0.12, 0), { cast: false });
    }
  }
  D.add(TOK.soilDark, decal(plane, -46.8, -13.2, -70, 42, 0.02), { cast: false });

  // ── Hochbeete (weathered larch planks, corner posts, a fresh cap rail, soil, drip lines, moisture stakes) ──
  const bed = (cx: number, z0: number, z1: number, seed: number): void => {
    const L = z1 - z0,
      zc = (z0 + z1) / 2,
      W = BEDS.width,
      H = BEDS.height;
    const g0 = gy(cx, zc);
    const planks = 3;
    for (const s of [-1, 1]) {
      for (let k = 0; k < planks; k++) {
        const h = (H + 0.25) / planks;
        const yy = g0 - 0.25 + h * (k + 0.5);
        B.add(k % 2 ? TOK.timberSilver : TOK.timberDark, box(0.045, h - 0.012, L, cx + (s * W) / 2, yy, zc), { rough: 0.92 });
      }
      // the cap rail and posts every 3 m (the rail's brackets hang on them)
      B.add(TOK.timberFresh, box(0.12, 0.05, L + 0.06, cx + s * (W / 2 - 0.01), g0 + H + 0.005, zc), { rough: 0.8 });
      for (let z = z0 + 0.06; z <= z1 - 0.05; z += L / Math.round(L / 3)) B.add(TOK.timberDark, box(0.09, H + 0.24, 0.09, cx + s * (W / 2 + 0.035), g0 + H / 2 - 0.12, z), { rough: 0.95 });
    }
    for (const e of [z0, z1]) B.add(TOK.timberSilver, box(W, H + 0.25, 0.045, cx, g0 + H / 2 - 0.125, e), { rough: 0.92 });
    // soil (a slightly domed top) and the two drip lines along the tomato rows
    B.add(TOK.soil, box(W - 0.06, 0.06, L - 0.06, cx, g0 + BEDS.soilY - 0.02, zc), { rough: 1, cast: false });
    for (const s of [-1, 1]) B.add(TOK.servo, tube(0.008, L - 0.2, 'z', cx + s * (W / 2 - BEDS.rowInset - 0.05), g0 + BEDS.soilY + 0.02, zc, 5), { rough: 0.6, cast: false });
    // soil-moisture stakes with teal tips (teal = data, §2.7 rule 6)
    const r = rng(seed);
    for (let z = z0 + 3 + r() * 2; z < z1 - 2; z += 7 + r() * 2) {
      B.add(TOK.ceramic, post(0.012, 0.32, cx, g0 + BEDS.soilY - 0.05, z, 6), { rough: 0.5 });
      ext.add(part(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 8).translate(cx, g0 + BEDS.soilY + 0.285, z), look.teal, 'stake-tips', { cast: false, receive: false }));
    }
    P.addStaticBox({ size: [W + 0.1, H, L], position: [cx, g0 + H / 2, zc], surface: 'wood' });
  };
  for (const r of [ROOFS.a, ROOFS.b]) {
    const z0 = (r.z0 + r.z1) / 2 - BEDS.length / 2;
    BEDS.xs.forEach((x, i) => bed(x, z0, z0 + BEDS.length, 77 + i + r.z0));
  }
  SITE.referenz.xs.forEach((x, i) => bed(x, SITE.referenz.z0, SITE.referenz.z1, 300 + i));

  // ── rails on both long edges of the Sonnendach beds, on brackets ────────────────────────────
  for (const r of [ROOFS.a, ROOFS.b]) {
    const z0 = (r.z0 + r.z1) / 2 - BEDS.length / 2,
      zc = z0 + BEDS.length / 2;
    for (const bx of BEDS.xs)
      for (const s of [-1, 1]) {
        const x = bx + s * BEDS.railOffset;
        const g0 = gy(x, zc);
        B.add(TOK.alu, box(0.05, 0.06, BEDS.length + 0.2, x, g0 + BEDS.railY, zc), { rough: 0.5, metal: 0.5 });
        for (let z = z0 + 0.3; z <= z0 + BEDS.length - 0.2; z += 1.5) B.add(TOK.carbon, box(0.11, 0.035, 0.05, x - s * 0.04, g0 + BEDS.railY - 0.04, z), { rough: 0.5, cast: false });
      }
  }

  // ── roof frames: posts at the row ends and in the middle path, eave beams, slew-drive housings ──
  for (const r of [ROOFS.a, ROOFS.b]) {
    for (const off of ROOFS.rowOffsets) {
      const z = r.z0 + off;
      for (const x of [ROOFS.x0, 0, ROOFS.x1]) {
        const g0 = gy(x, z);
        B.add(TOK.ceramic, post(0.085, ROOFS.pivotY - 0.06 + 0.3, x, g0 - 0.3, z, 12), { rough: 0.5 });
        B.add(TOK.carbon, post(0.17, 0.06, x, g0 - 0.02, z, 14), { rough: 0.7, cast: false });
        // bearing housing around the torque tube (dark, matte: no glints that read as lamps)
        B.add(0x55524e, box(0.22, 0.2, 0.2, x, g0 + ROOFS.pivotY, z), { rough: 0.75, metal: 0.2 });
        P.addStaticBox({ size: [0.22, ROOFS.pivotY, 0.22], position: [x, g0 + ROOFS.pivotY / 2, z], surface: 'metal' });
      }
      // the slew drive on the middle post: a ceramic housing under the tube, one teal status slit per side
      const g0 = gy(0, z);
      B.add(TOK.ceramic, box(0.34, 0.42, 0.3, 0, g0 + ROOFS.pivotY - 0.44, z), { rough: 0.5 });
      for (const s of [-1, 1]) ext.add(part(box(0.012, 0.024, 0.15, s * 0.176, g0 + ROOFS.pivotY - 0.36, z), look.teal, 'drive-slits', { cast: false, receive: false }));
    }
    // two eave beams along the roof's long sides tie the posts (alu, under the tables' swing)
    for (const x of [ROOFS.x0, ROOFS.x1]) {
      const zc = (r.z0 + r.z1) / 2;
      B.add(TOK.alu, box(0.08, 0.14, r.z1 - r.z0 - 3.4, x, gy(x, zc) + ROOFS.pivotY - 0.42, zc), { rough: 0.62, metal: 0.35 });
    }
  }

  // ── bed ends of Sonnendach A: a timber chute into a crate (the tray's last stop, the „tock“) ──
  {
    const zEnd = (ROOFS.a.z0 + ROOFS.a.z1) / 2 + BEDS.length / 2;
    for (const bx of BEDS.xs) {
      const g0 = gy(bx, zEnd + 1);
      const chute = new THREE.BoxGeometry(0.42, 0.04, 1.0).rotateX(0.42).translate(bx, g0 + 0.66, zEnd + 0.52);
      B.add(TOK.timberFresh, chute, { rough: 0.8 });
      for (const s of [-1, 1]) B.add(TOK.timberFresh, new THREE.BoxGeometry(0.03, 0.08, 1.0).rotateX(0.42).translate(bx + s * 0.21, g0 + 0.7, zEnd + 0.52), { rough: 0.8 });
      // the crate (larch slats) with the day's tomatoes in it
      B.add(TOK.timberFresh, box(0.6, 0.32, 0.42, bx, g0 + 0.16, zEnd + 1.25), { rough: 0.85 });
      B.add(TOK.tomato, box(0.54, 0.04, 0.36, bx, g0 + 0.3, zEnd + 1.25), { rough: 0.45 });
      P.addStaticBox({ size: [0.6, 0.35, 0.42], position: [bx, g0 + 0.17, zEnd + 1.25], surface: 'wood' });
    }
  }

  // ── the Hofladen: a timber shed, open to the yard, clay roof, counter, crates, the dashboard wall ──
  const H = SITE.hofladen;
  const hx0 = H.x - H.w / 2,
    hx1 = H.x + H.w / 2,
    hz0 = H.z - H.d / 2,
    hz1 = H.z + H.d / 2;
  const hg = gy(H.x, H.z);
  {
    B.add(TOK.gravel, box(H.w + 1.2, 0.3, H.d + 1.2, H.x, hg - 0.1, H.z), { rough: 0.95, cast: false });
    // walls: south, west, east full; the north front (to the yard) has the dashboard on its east half, an opening in the west half
    B.add(TOK.timberSilver, box(0.16, H.h, H.d, hx0 + 0.08, hg + H.h / 2, H.z), { rough: 0.9 });
    B.add(TOK.timberSilver, box(H.w, H.h, 0.16, H.x, hg + H.h / 2, hz0 + 0.08), { rough: 0.9 });
    B.add(TOK.timberSilver, box(H.w, H.h, 0.16, H.x, hg + H.h / 2, hz1 - 0.08), { rough: 0.9 });
    B.add(TOK.timberSilver, box(0.16, H.h, H.d * 0.55, hx1 - 0.08, hg + H.h / 2, hz1 - H.d * 0.275), { rough: 0.9 });
    // vertical boards (battens) on the walls: weathered larch rhythm
    for (let z = hz0 + 0.4; z < hz1; z += 0.55) B.add(TOK.timberDark, box(0.04, H.h - 0.1, 0.06, hx0 - 0.01, hg + H.h / 2, z), { rough: 0.95 });
    for (let x = hx0 + 0.4; x < hx1; x += 0.55)
      for (const z of [hz0 - 0.01, hz1 + 0.01]) B.add(TOK.timberDark, box(0.06, H.h - 0.1, 0.04, x, hg + H.h / 2, z), { rough: 0.95 });
    // the open front: two glulam posts and a lintel
    for (const z of [hz0 + 0.12, H.z - 0.6]) B.add(TOK.timberFresh, box(0.2, H.h, 0.2, hx1 - 0.1, hg + H.h / 2, z), { rough: 0.75 });
    B.add(TOK.timberFresh, box(0.22, 0.26, H.d * 0.45, hx1 - 0.1, hg + H.h - 0.13, hz0 + H.d * 0.225), { rough: 0.75 });
    // the clay roof: two slopes, ridge along z, eaves over the front
    const pitch = Math.atan2(H.ridge - H.h, H.w / 2 + 0.5);
    const slope = (H.w / 2 + 0.7) / Math.cos(pitch);
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(slope, 0.1, H.d + 1.0).translate((s * slope) / 2, 0, 0).rotateZ(s * -pitch);
      B.add(TOK.clay, g.translate(H.x, hg + H.ridge, H.z), { rough: 0.78 });
    }
    // tile courses (a few darker clay lines) and the ridge cap
    B.add(0x8e6d5a, box(0.2, 0.14, H.d + 1.05, H.x, hg + H.ridge + 0.05, H.z), { rough: 0.7 });
    // the counter, the honesty shelf and crates of tomatoes inside the open front
    B.add(TOK.timberFresh, box(0.7, 1.0, 3.6, hx1 - 1.2, hg + 0.5, hz0 + 2.6), { rough: 0.7 });
    B.add(TOK.timberSilver, box(0.4, 1.7, 2.8, hx0 + 0.45, hg + 0.85, H.z - 1.4), { rough: 0.85 });
    for (let k = 0; k < 4; k++) {
      const z = hz0 + 1.2 + k * 0.75;
      B.add(TOK.timberFresh, box(0.5, 0.22, 0.6, hx1 - 1.2, hg + 1.11, z), { rough: 0.85 });
      B.add(k === 2 ? 0xc79a3e : TOK.tomato, box(0.44, 0.05, 0.54, hx1 - 1.2, hg + 1.2, z), { rough: 0.45 });
    }
    for (let k = 0; k < 3; k++)
      for (let l = 0; l < 3; l++) B.add(l === 1 ? 0xc94b35 : TOK.tomato, box(0.32, 0.06, 0.5, hx0 + 0.45, hg + 0.45 + l * 0.55, H.z - 2.4 + k * 0.85), { rough: 0.5 });
    P.addStaticBox({ size: [H.w, H.h, 0.2], position: [H.x, hg + H.h / 2, hz0 + 0.08], surface: 'wood' });
    P.addStaticBox({ size: [H.w, H.h, 0.2], position: [H.x, hg + H.h / 2, hz1 - 0.08], surface: 'wood' });
    P.addStaticBox({ size: [0.2, H.h, H.d], position: [hx0 + 0.08, hg + H.h / 2, H.z], surface: 'wood' });
    P.addStaticBox({ size: [0.2, H.h, H.d * 0.55], position: [hx1 - 0.08, hg + H.h / 2, hz1 - H.d * 0.275], surface: 'wood' });
    P.addStaticBox({ size: [0.7, 1.0, 3.6], position: [hx1 - 1.2, hg + 0.5, hz0 + 2.6], surface: 'wood' });
  }
  // the dashboard wall's frame on the closed east half of the north front (the screen is index.ts's)
  const dash = { x: hx1 + 0.05, y: hg + 1.95, z: hz1 - H.d * 0.3, w: 3.4, h: 1.75 };
  B.add(TOK.carbon, box(0.08, dash.h + 0.16, dash.w + 0.16, dash.x - 0.02, dash.y, dash.z), { rough: 0.5, metal: 0.3 });
  B.add(TOK.timberFresh, box(0.1, 0.08, dash.w + 0.4, dash.x, dash.y - dash.h / 2 - 0.16, dash.z), { rough: 0.8 });

  // ── the Tagesmodell's table (station B): larch top on four legs; the model sits on it (index/stationB) ──
  const T = SITE.tagesmodell;
  const tg = gy(T.x, T.z);
  {
    B.add(TOK.timberFresh, box(T.w, 0.06, T.d, T.x, tg + T.h - 0.03, T.z), { rough: 0.7 });
    B.add(TOK.timberSilver, box(T.w - 0.1, 0.05, T.d - 0.1, T.x, tg + T.h - 0.08, T.z), { rough: 0.85 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add(TOK.timberDark, box(0.07, T.h - 0.06, 0.07, T.x + sx * (T.w / 2 - 0.08), tg + (T.h - 0.06) / 2, T.z + sz * (T.d / 2 - 0.08)), { rough: 0.9 });
    // the lamp's arc: an alu half-ring over the model, east → west (the sun's path of the model day)
    const arc = new THREE.TorusGeometry(1.05, 0.012, 6, 40, Math.PI).rotateY(Math.PI / 2).translate(T.x, tg + T.h + 0.05, T.z);
    B.add(TOK.alu, arc, { rough: 0.3, metal: 0.8, cast: false });
    P.addStaticBox({ size: [T.w, T.h, T.d], position: [T.x, tg + T.h / 2, T.z], surface: 'wood' });
  }

  // ── the cistern (gutters → cistern → drip lines), its reed bed and the downpipe from Sonnendach A ──
  {
    const C = SITE.cistern;
    const cg = gy(C.x, C.z);
    B.add(0xa89d8d, new THREE.CylinderGeometry(C.r, C.r * 1.06, C.h + 0.3, 28).translate(C.x, cg + C.h / 2 - 0.15, C.z), { rough: 0.8 });
    B.add(TOK.timberSilver, new THREE.CylinderGeometry(C.r + 0.08, C.r + 0.08, 0.1, 28).translate(C.x, cg + C.h + 0.05, C.z), { rough: 0.85 });
    B.add(0x9b7a63, new THREE.CylinderGeometry(C.r + 0.012, C.r + 0.012, 0.08, 28, 1, true).translate(C.x, cg + C.h * 0.4, C.z), { rough: 0.7, cast: false });
    // reed clumps around it (managed green: the cistern's overflow bed)
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * Math.PI * 2 + rnd() * 0.2,
        rr = C.r + 0.5 + rnd() * 0.9;
      const h = 0.45 + rnd() * 0.4;
      const x = C.x + Math.cos(a) * rr,
        z = C.z + Math.sin(a) * rr;
      B.add(k % 3 ? TOK.reed : TOK.grassGreen, new THREE.ConeGeometry(0.28 + rnd() * 0.12, h, 6).translate(x, gy(x, z) + h / 2 - 0.05, z), { rough: 1, cast: false });
    }
    // the downpipe: from the east eave beam of Sonnendach A, along the ground to the cistern
    const zE = ROOFS.a.z1 - 1.7;
    const g1 = gy(ROOFS.x1, zE);
    B.add(TOK.alu, tube(0.05, ROOFS.pivotY - 0.4, 'x', 0, 0, 0).rotateZ(Math.PI / 2).translate(ROOFS.x1 + 0.12, g1 + (ROOFS.pivotY - 0.4) / 2, zE), { rough: 0.35, metal: 0.7 });
    const run = Math.hypot(C.x - (ROOFS.x1 + 0.12), C.z - zE);
    const yaw = Math.atan2(C.x - (ROOFS.x1 + 0.12), C.z - zE);
    B.add(TOK.carbon, new THREE.BoxGeometry(0.14, 0.06, run).translate(0, 0, run / 2).rotateY(yaw).translate(ROOFS.x1 + 0.12, gy(ROOFS.x1, zE) + 0.02, zE), { rough: 0.7, cast: false });
    P.addStaticCylinder({ radius: C.r + 0.05, height: C.h, position: [C.x, cg + C.h / 2, C.z], surface: 'concrete' });
  }

  // ── the two bumblebee boxes (Hummelkästen) on posts at the bed ends ─────────────────────────
  for (const [bx, bz] of SITE.bees) {
    const g0 = gy(bx, bz);
    B.add(TOK.timberDark, post(0.045, 1.0, bx, g0 - 0.2, bz, 8), { rough: 0.9 });
    B.add(TOK.timberFresh, box(0.42, 0.3, 0.34, bx, g0 + 0.95, bz), { rough: 0.75 });
    B.add(TOK.clay, box(0.5, 0.05, 0.42, bx, g0 + 1.13, bz), { rough: 0.7 });
    B.add(TOK.servo, box(0.12, 0.025, 0.02, bx, g0 + 0.9, bz + 0.17), { rough: 0.9, cast: false });
  }

  // ── hedges along the north and west edges, a flower strip inside them ─────────────────────
  {
    const seg = (x: number, z: number, along: 'x' | 'z'): void => {
      const len = 3.6 + rnd() * 1.2,
        h = 1.5 + rnd() * 0.6,
        d = 1.3 + rnd() * 0.3;
      const g = along === 'z' ? box(d, h + 0.3, len, x, 0, z) : box(len, h + 0.3, d, x, 0, z);
      B.add(rnd() < 0.5 ? TOK.hedge : 0x56623f, g.translate(0, gy(x, z) + (h - 0.3) / 2, 0), { rough: 1 });
    };
    for (let z = -72; z <= 70; z += 3.8) seg(SITE.hedge.north, z, 'z');
    for (let x = -47; x <= 45; x += 3.8) seg(x, SITE.hedge.west, 'x');
    P.addStaticBox({ size: [1.4, 2.2, 144], position: [SITE.hedge.north, gy(SITE.hedge.north, 0) + 1.1, -1], surface: 'grass' });
    P.addStaticBox({ size: [94, 2.2, 1.4], position: [-1, gy(0, SITE.hedge.west) + 1.1, SITE.hedge.west], surface: 'grass' });
    // flower strip: low clumps in muted colours (no rainbow, §2.7 rule 4)
    const clump = (x: number, z: number): void => {
      const c = TOK.flowers[Math.floor(rnd() * TOK.flowers.length)];
      const r = 0.22 + rnd() * 0.18;
      B.add(rnd() < 0.35 ? TOK.grassGreen : c, new THREE.OctahedronGeometry(r, 0).scale(1, 0.55, 1).translate(x, gy(x, z) + r * 0.35, z), { rough: 1, cast: false });
    };
    for (let z = -70; z <= 70; z += 0.95) clump(SITE.hedge.north - 1.4 - rnd() * 0.8, z + rnd() * 0.4);
    for (let x = -46; x <= 44; x += 0.95) clump(x + rnd() * 0.4, SITE.hedge.west + 1.4 + rnd() * 0.8);
  }

  // ── a row of fruit trees along the east fence (managed green; they shade the bench by the yard) ──
  for (let x = 4; x <= 40; x += 6.5) {
    const z = 70.5 + rnd() * 1.2;
    const g0 = gy(x, z);
    B.add(TOK.timberDark, post(0.09, 1.8, x, g0 - 0.2, z, 7), { rough: 0.95 });
    const m = new THREE.IcosahedronGeometry(1, 1).scale(1.5 + rnd() * 0.3, 1.25 + rnd() * 0.2, 1.5 + rnd() * 0.3).translate(x, g0 + 2.55, z);
    B.add(rnd() < 0.5 ? 0x55663c : 0x5f6f42, m, { rough: 1 });
    P.addStaticCylinder({ radius: 0.15, height: 2, position: [x, g0 + 1, z], surface: 'wood' });
  }
  D.add(TOK.gravel, decal(plane, -9, -5, 46.4, 52, 0.041), { cast: false });

  // ── the east gate (glulam frame) and the LeKiwi depot behind the Hofladen ───────────────────
  {
    const [gx, gz] = SITE.gate;
    const g0 = gy(gx, gz);
    for (const s of [-1, 1]) {
      B.add(TOK.timberFresh, box(0.24, 3.1, 0.24, gx + s * 2.2, g0 + 1.4, gz - 0.4), { rough: 0.75 });
      P.addStaticBox({ size: [0.26, 3, 0.26], position: [gx + s * 2.2, g0 + 1.5, gz - 0.4], surface: 'wood' });
    }
    B.add(TOK.timberFresh, box(4.9, 0.3, 0.3, gx, g0 + 3.05, gz - 0.4), { rough: 0.75 });
    // a low larch fence either side of the gate, along the site's east edge
    for (const [a, b] of [
      [-48, gx - 2.5],
      [gx + 2.5, 44],
    ]) {
      const L = b - a;
      for (let x = a; x <= b; x += 2.4) B.add(TOK.timberDark, box(0.09, 1.1, 0.09, x, gy(x, gz) + 0.4, gz), { rough: 0.95 });
      for (const hh of [0.45, 0.85]) B.add(TOK.timberSilver, box(L, 0.08, 0.04, (a + b) / 2, gy((a + b) / 2, gz) + hh, gz), { rough: 0.9 });
    }
    const [dx, dz] = SITE.depot;
    const dg = gy(dx, dz);
    B.add(0xb3aea8, box(2.2, 0.06, 1.6, dx, dg + 0.02, dz), { rough: 0.9, cast: false });
    B.add(TOK.ceramic, box(0.32, 0.6, 0.22, dx - 1.0, dg + 0.3, dz - 0.6), { rough: 0.5 });
    ext.add(part(box(0.18, 0.02, 0.012, dx - 1.0, dg + 0.48, dz - 0.488), look.teal, 'depot-led', { cast: false, receive: false }));
  }

  D.flush(ext, 'ground');
  B.flush(ext, 'site');

  // ── the far tier: the farm as the island sees it (≤ 2 draws with roof.ts's far tables) ─────
  {
    const F = new Batch(look);
    for (const r of [ROOFS.a, ROOFS.b]) {
      // under-roof grass with the beds as darker stripes; the tables' analytic shadows fall east (+z) of each row
      F.add(TOK.grassGreen, decal(plane, ROOFS.x0 - 1.8, ROOFS.x1 + 1.8, r.z0 - 1.2, r.z1 + 1.2, 0.05), { cast: false });
      for (const bx of BEDS.xs) F.add(TOK.leafDark, box(BEDS.width, 1.0, BEDS.length, bx, gy(bx, (r.z0 + r.z1) / 2) + 0.55, (r.z0 + r.z1) / 2), { cast: false });
      for (const off of ROOFS.rowOffsets) F.add(0x3c3f33, decal(plane, ROOFS.x0, ROOFS.x1, r.z0 + off + 1.2, r.z0 + off + 1.2 + 2.6, 0.09), { cast: false });
    }
    for (const x of SITE.referenz.xs) F.add(TOK.leafDark, box(BEDS.width, 1.0, SITE.referenz.z1 - SITE.referenz.z0, x, gy(x, 28) + 0.55, 28), { cast: false });
    F.add(TOK.timberSilver, box(H.w, H.h, H.d, H.x, hg + H.h / 2, H.z), { cast: false });
    F.add(TOK.clay, box(H.w + 1.2, 1.6, H.d + 1.0, H.x, hg + H.h + 0.8, H.z), { cast: false });
    F.add(TOK.hedge, box(1.4, 1.8, 144, SITE.hedge.north, gy(SITE.hedge.north, 0) + 0.9, -1), { cast: false });
    F.add(TOK.hedge, box(94, 1.8, 1.4, -1, gy(0, SITE.hedge.west) + 0.9, SITE.hedge.west), { cast: false });
    F.add(TOK.clay, new THREE.CylinderGeometry(SITE.cistern.r, SITE.cistern.r, SITE.cistern.h, 10).translate(SITE.cistern.x, gy(SITE.cistern.x, SITE.cistern.z) + SITE.cistern.h / 2, SITE.cistern.z), { cast: false });
    F.flush(far, 'far');
  }
  return { plane, dashboard: dash, table: { x: T.x, y: tg + T.h, z: T.z } };
}
