#!/usr/bin/env node
// Bakes the Revier's terrain heights (Phase 7 plan WP3 build 4, §5.6, C1 M13) into
//   public/world/ground/heights-core.bin  the 300 m core at 2 m + a 16 m preview of the near grid + the far land at 32 m (±3.2 km)
//                                         (loaded before the title; cap 20 KB brotli)
//   public/world/ground/heights-ring.bin  the near grid at 2 m to ±672 m (after the title; cap 100 KB brotli)
// from the geography in src/world/ground/plan.ts (imported with Node's type stripping): the flat dock
// yard, seeded value-noise relief, the wind rise N, the hills E, the far ring, the site rects and the
// track beds flattened, the Grubenrand cut and the excavator's lay-by, the mining benches down to the
// pit lake, the pit's far and lateral banks and the wooded spoil heap (G-LOOK fixes 2 and 3, D42).
//
//   node tools/ground/bake.mjs [--check]     --check: bake in memory, compare with the committed files, exit 1 on a difference
//
// Both modes also check that every plot, pad, path, flat and the yard keep the wave-1 (p7-w1) heights
// exactly: the G-LOOK terrain changes (the pit, the heap, the benches, the cut) must never touch them
// (layout.ts is frozen, WP9/WP14 build on ctx.frames.heightAt), and that the lay-by is level.
//
// Format (little-endian; src/world/ground/heights.ts decodes it): 'EGH1', u16 version, u16 blocks, then per
// block a 28-byte header { u8 kind (1 core, 2 preview, 3 far, 4 near), u8 0, u16 n, f32 x0, f32 z0, f32 step,
// f32 base, f32 quantum, u16 first, u16 0 } and n × n Uint16 residuals, rows along +z, columns along +x.
// Heights are q = round((h − base) / quantum); a residual is q minus the plane prediction left + up − up-left,
// zigzag-coded, so the smooth land is mostly zeros and brotli shrinks it to a few KB.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// src/ imports are extensionless (Vite); let Node find the .ts files
register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(s, c, next) {
  if ((s.startsWith('./') || s.startsWith('../')) && !/\\.[cm]?[jt]s$/.test(s)) { try { return await next(s + '.ts', c); } catch {} }
  return next(s, c);
}`),
);
const P = await import(path.join(ROOT, 'src/world/ground/plan.ts'));
const L = await import(path.join(ROOT, 'src/world/layout.ts'));
const { PLATEAU, GRID, SHORE, RELIEF, PATHS, FLATS, FIELDS, GRUBENRAND, PIT, HALDE } = P;

// the wave-1 (p7-w1) terrain, only for the protected-heights check below: its bench profile and its cut
const LEGACY = {
  benches: [
    [-92, 0],
    [-78, -4.5],
    [-62, -5.2],
    [-50, -9.8],
    [-34, -10.4],
    [-22, -15.0],
    [-8, -15.6],
    [0, -18.7],
  ],
  grubenrand: [-195, 101],
};

const check = process.argv.includes('--check');
const OUT = path.join(ROOT, 'public', 'world', 'ground');
const DEG = Math.PI / 180;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

// ── seeded value noise (deterministic, smooth: quintic fade) ──────────────────
function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, z, seed) {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const fx = x - ix,
    fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10),
    uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash2(ix, iz, seed),
    b = hash2(ix + 1, iz, seed),
    c = hash2(ix, iz + 1, seed),
    d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz) * 2 - 1;
}

const bearing = (x, z) => {
  const b = Math.atan2(x, -z) / DEG;
  return b < 0 ? b + 360 : b;
};
/** 1 inside the bearing window [a, b] (clockwise, may wrap), soft over 20° */
function window(bdeg, [a, b]) {
  const span = (b - a + 360) % 360;
  const off = (bdeg - a + 360) % 360;
  if (off <= span) return smooth(0, 20, off) * smooth(0, 20, span - off);
  return 0;
}
const proj = (x, z, b) => x * Math.sin(b * DEG) - z * Math.cos(b * DEG);

// ── the shore (mining benches down to the pit lake) ───────────────────────────
function shoreOffset(x, z) {
  const perp = proj(x, z, SHORE.bearing - 90);
  let o = 0;
  for (const [a, l, ph] of SHORE.wave) o += a * Math.sin(perp / l + ph);
  return proj(x, z, SHORE.bearing) - (SHORE.line + o); // > 0: lakeward of the waterline
}
/** absolute height of the shore profile at a lakeward offset p (null far inland) */
function shoreProfile(p, B = SHORE.benches) {
  if (p < B[0][0]) return null;
  for (let i = 1; i < B.length; i++) if (p <= B[i][0]) return lerp(B[i - 1][1], B[i][1], (p - B[i - 1][0]) / (B[i][0] - B[i - 1][0]));
  const last = B[B.length - 1];
  if (p <= SHORE.drop.at) return lerp(last[1], SHORE.drop.y, smooth(0, 1, (p - last[0]) / (SHORE.drop.at - last[0])));
  if (p <= SHORE.bed.at) return lerp(SHORE.drop.y, SHORE.bed.y, smooth(SHORE.drop.at, SHORE.bed.at, p));
  return SHORE.bed.y;
}

// ── the pit's far and lateral banks (G-LOOK fix 2) ────────────────────────────
const lakeU = (x, z) => proj(x, z, SHORE.bearing);
const lakeV = (x, z) => proj(x, z, SHORE.bearing - 90);
/** q: how far inside the far/lateral rim (> 0 in the water, < 0 outward); the near side lies far inland */
function pitQ(x, z) {
  const u = lakeU(x, z),
    v = lakeV(x, z);
  const u0 = -4000;
  const cu = (PIT.far + u0) / 2,
    cv = (PIT.north + PIT.south) / 2;
  const R = PIT.round;
  const dx = Math.abs(u - cu) - (PIT.far - u0) / 2 + R,
    dy = Math.abs(v - cv) - (PIT.south - PIT.north) / 2 + R;
  const sd = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - R;
  let w = 0;
  for (const [a, l] of PIT.wave) w += a * vnoise(x / l, z / l, 4242 + l);
  return -sd + w;
}
/** absolute height of the far/lateral bank at q (inside: the same drop and bed as the near shore) */
function pitProfile(q) {
  if (q >= 0) {
    if (q <= SHORE.drop.at) return lerp(PIT.benches[0][1], SHORE.drop.y, smooth(0, 1, q / SHORE.drop.at));
    if (q <= SHORE.bed.at) return lerp(SHORE.drop.y, SHORE.bed.y, smooth(SHORE.drop.at, SHORE.bed.at, q));
    return SHORE.bed.y;
  }
  const B = PIT.benches;
  for (let i = 1; i < B.length; i++) if (q >= B[i][0]) return lerp(B[i - 1][1], B[i][1], (q - B[i - 1][0]) / (B[i][0] - B[i - 1][0]));
  const last = B[B.length - 1];
  return last[1] + (last[0] - q) * PIT.faceGrade;
}

/** a smooth maximum (the basin's corners where the near shore meets a lateral bank: no crease at the waterline) */
function smax(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + (h * h * k) / 4;
}

// ── the spoil heap (G-LOOK fix 3) ─────────────────────────────────────────────
const haldeAxis = [Math.sin(HALDE.axis * DEG), -Math.cos(HALDE.axis * DEG)];
function halde(x, z) {
  const dx = x - HALDE.at[0],
    dz = z - HALDE.at[1];
  const a = dx * haldeAxis[0] + dz * haldeAxis[1],
    c = -dx * haldeAxis[1] + dz * haldeAxis[0];
  const R = HALDE.round;
  const qx = Math.abs(a) - HALDE.half[0] + R,
    qy = Math.abs(c) - HALDE.half[1] + R;
  const inside = -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R);
  if (inside <= 0) return 0;
  const B = HALDE.profile;
  let h = B[B.length - 1][1];
  for (let i = 1; i < B.length; i++)
    if (inside <= B[i][0]) {
      // each flank segment eased, so the berms read as steps and the faces stay planar
      const t = (inside - B[i - 1][0]) / (B[i][0] - B[i - 1][0]);
      h = lerp(B[i - 1][1], B[i][1], t);
      break;
    }
  // the plateau is not a table: a gentle swell
  return h + 1.6 * vnoise(x / 110, z / 110, 77) * smooth(B[B.length - 1][0], B[B.length - 1][0] + 60, inside);
}

// ── layer 1: relief, the rise N, the hills E, the far ring, the plateau ──────
function relief(x, z, legacy = false) {
  let h = 0;
  for (const [amp, wl] of RELIEF.octaves) h += amp * vnoise(x / wl, z / wl, RELIEF.seed + wl);
  const r = Math.hypot(x, z);
  const b = bearing(x, z);
  h += RELIEF.rise.height * smooth(RELIEF.rise.from, RELIEF.rise.to, -z) * window(b, RELIEF.rise.bearings) * (0.75 + 0.25 * vnoise(x / 260, z / 260, 7));
  h += RELIEF.hills.height * smooth(RELIEF.hills.from, RELIEF.hills.to, r) * window(b, RELIEF.hills.bearings) * (0.6 + 0.4 * vnoise(x / 300, z / 300, 11));
  // the far ring: hills on the horizon, fading out toward the lake (and back in beyond its far banks)
  const lakeward = legacy ? smooth(-500, 0, shoreOffset(x, z)) : smooth(-500, 0, shoreOffset(x, z)) * smooth(-PIT.hillsFade, 0, pitQ(x, z));
  h += RELIEF.far.height * smooth(RELIEF.far.from, RELIEF.far.to, r) * (0.55 + 0.45 * vnoise(x / 700, z / 700, 13)) * (1 - lakeward);
  // the flat dock yard
  return h * smooth(PLATEAU.flat, PLATEAU.blend, r);
}

// ── layer 2: the site rects (planar fit), the concrete flats ─────────────────
function rectLocal(x, z, at, yawDeg = 0) {
  const c = Math.cos(yawDeg * DEG),
    s = Math.sin(yawDeg * DEG);
  const dx = x - at[0],
    dz = z - at[1];
  return [dx * c - dz * s, dx * s + dz * c];
}
/** signed distance to a rect (negative inside) */
function rectSdf(x, z, at, size, yawDeg) {
  const [u, v] = rectLocal(x, z, at, yawDeg);
  const qx = Math.abs(u) - size[0] / 2,
    qz = Math.abs(v) - size[1] / 2;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}
const flattenRects = [];
for (const f of FIELDS) if (f.flatten) flattenRects.push({ at: f.at, size: f.size, yaw: f.yawDeg ?? 0, shoulder: f.flatten });
for (const f of FLATS) {
  const size = f.size ?? [f.radius * 2, f.radius * 2];
  if (Math.hypot(...f.at) + Math.hypot(...size) / 2 > PLATEAU.flat) flattenRects.push({ at: f.at, size, yaw: f.yawDeg ?? 0, shoulder: 10 });
}
// planar fit of the relief over each rect (least squares on a 12 × 12 sample grid)
for (const R of flattenRects) {
  let n = 0,
    su = 0,
    sv = 0,
    sh = 0,
    suu = 0,
    svv = 0,
    suh = 0,
    svh = 0;
  const c = Math.cos(R.yaw * DEG),
    s = Math.sin(R.yaw * DEG);
  for (let i = 0; i < 12; i++)
    for (let j = 0; j < 12; j++) {
      const u = ((i + 0.5) / 12 - 0.5) * R.size[0],
        v = ((j + 0.5) / 12 - 0.5) * R.size[1];
      const x = R.at[0] + u * c + v * s,
        z = R.at[1] - u * s + v * c;
      const h = relief(x, z);
      n++;
      su += u;
      sv += v;
      sh += h;
      suu += u * u;
      svv += v * v;
      suh += u * h;
      svh += v * h;
    }
  const mh = sh / n;
  // a gentle tilt is fine for fields (≤ 1.5 %), the halls get it too (their pads level themselves)
  const gu = Math.max(-0.015, Math.min(0.015, (suh - (su * sh) / n) / Math.max(1e-6, suu - (su * su) / n)));
  const gv = Math.max(-0.015, Math.min(0.015, (svh - (sv * sh) / n) / Math.max(1e-6, svv - (sv * sv) / n)));
  R.plane = (x, z) => {
    const [u, v] = rectLocal(x, z, R.at, R.yaw);
    return mh + gu * u + gv * v;
  };
}
function sites(x, z, h) {
  for (const R of flattenRects) {
    const d = rectSdf(x, z, R.at, R.size, R.yaw);
    if (d > R.shoulder) continue;
    h = lerp(R.plane(x, z), h, smooth(0, R.shoulder, d));
  }
  return h;
}
const layer2 = (x, z) => sites(x, z, relief(x, z));

// ── layer 3: the track beds (flat across, smoothed along) ─────────────────────
function densify(pts, closed, step = 2) {
  const out = [];
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i],
      b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j < k; j++) out.push([lerp(a[0], b[0], j / k), lerp(a[1], b[1], j / k)]);
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}
const beds = PATHS.map((p) => {
  const pts = densify(p.pts, !!p.closed);
  // centreline heights from layer 2, smoothed over ±16 m and limited to an 8 % grade
  const raw = pts.map(([x, z]) => layer2(x, z));
  const k = 8;
  let hs = raw.map((_, i) => {
    let s = 0,
      w = 0;
    for (let j = -k; j <= k; j++) {
      const q = p.closed ? (i + j + raw.length) % raw.length : Math.min(raw.length - 1, Math.max(0, i + j));
      const ww = 1 - Math.abs(j) / (k + 1);
      s += raw[q] * ww;
      w += ww;
    }
    return s / w;
  });
  for (let pass = 0; pass < 2; pass++)
    for (let i = 1; i < hs.length; i++) {
      const g = 0.08 * 2;
      hs[i] = Math.max(hs[i - 1] - g, Math.min(hs[i - 1] + g, hs[i]));
    }
  const xs = pts.map((q) => q[0]),
    zs = pts.map((q) => q[1]);
  const reach = p.width / 2 + 10;
  return { path: p, pts, hs, reach, box: [Math.min(...xs) - reach, Math.min(...zs) - reach, Math.max(...xs) + reach, Math.max(...zs) + reach] };
});
function tracks(x, z, h) {
  for (const B of beds) {
    if (x < B.box[0] || z < B.box[1] || x > B.box[2] || z > B.box[3]) continue;
    let best = Infinity,
      hc = 0;
    const n = B.pts.length;
    const segs = B.path.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = B.pts[i],
        b = B.pts[(i + 1) % n];
      const ex = b[0] - a[0],
        ez = b[1] - a[1];
      const l2 = ex * ex + ez * ez || 1;
      const t = Math.min(1, Math.max(0, ((x - a[0]) * ex + (z - a[1]) * ez) / l2));
      const d = Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t);
      if (d < best) {
        best = d;
        hc = lerp(B.hs[i], B.hs[(i + 1) % n], t);
      }
    }
    if (best < B.reach) h = lerp(hc, h, smooth(B.path.width / 2 + 0.5, B.reach, best));
  }
  return h;
}

// ── layer 4: the Grubenrand cut, the shore, the yard clamp ────────────────────
function grubenrand(x, z, h, at = GRUBENRAND.at) {
  const G = GRUBENRAND;
  const [u, v] = rectLocal(x, z, at);
  const hu = G.size[0] / 2,
    hv = G.size[1] / 2;
  if (Math.abs(u) > hu + G.shoulder || Math.abs(v) > hv + G.shoulder) return h;
  // benches step down toward the north (−v): the south edge is the track side
  const t = (hv - v) / G.size[1]; // 0 at the south edge … 1 at the north edge
  let depth = 0;
  for (let i = 1; i <= G.benches; i++) depth += G.rise * smooth((i - 0.5) / (G.benches + 0.6) - 0.03, (i - 0.5) / (G.benches + 0.6) + 0.03, t);
  // the north side ramps back up (an old haul ramp), the ends are steep cut faces
  depth *= 1 - smooth(0.82, 1.0 + G.shoulder / G.size[1], t);
  depth *= 1 - smooth(hu - 2, hu + 1.5, Math.abs(u));
  if (v > hv) depth *= 1 - smooth(hv, hv + 1.5, v);
  return h - depth;
}
// the excavator's lay-by (LANDMARKS.grubenrand): the Sonnenacker track's bed height carried across a level rect
const padBed = beds.find((b) => b.path.id === 'sonnenacker');
function bedAt(B, x, z) {
  let best = Infinity,
    hc = 0;
  const n = B.pts.length;
  const segs = B.path.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = B.pts[i],
      b = B.pts[(i + 1) % n];
    const ex = b[0] - a[0],
      ez = b[1] - a[1];
    const l2 = ex * ex + ez * ez || 1;
    const t = Math.min(1, Math.max(0, ((x - a[0]) * ex + (z - a[1]) * ez) / l2));
    const d = Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t);
    if (d < best) {
      best = d;
      hc = lerp(B.hs[i], B.hs[(i + 1) % n], t);
    }
  }
  return { d: best, hc };
}
const PAD = GRUBENRAND.pad;
// the pad's level: the mean of the bed along the pad (the bed itself, a path, keeps its own gentle grade)
const padH = (() => {
  let s = 0,
    n = 0;
  for (let x = PAD.at[0] - PAD.size[0] / 2; x <= PAD.at[0] + PAD.size[0] / 2; x += 1) {
    s += bedAt(padBed, x, PAD.at[1] - PAD.size[1] / 2).hc;
    n++;
  }
  return s / n;
})();
function layby(x, z, h) {
  const d = rectSdf(x, z, PAD.at, PAD.size, 0);
  if (d > PAD.shoulder) return h;
  // the bed itself keeps its own height (a path: exact)
  if (bedAt(padBed, x, z).d <= padBed.path.width / 2 + 0.5) return h;
  return lerp(padH, h, smooth(0, PAD.shoulder, d));
}
function height(x, z, legacy = false) {
  let h = tracks(x, z, legacy ? sites(x, z, relief(x, z, true)) : layer2(x, z));
  h = grubenrand(x, z, h, legacy ? LEGACY.grubenrand : GRUBENRAND.at);
  if (!legacy) {
    h = layby(x, z, h);
    h += halde(x, z);
  }
  const so = shoreOffset(x, z);
  const sp = shoreProfile(so, legacy ? LEGACY.benches : SHORE.benches);
  // the basin: the near shore's benches, and (since G-LOOK) the far and lateral banks; the water lies inside both
  const basin = legacy || sp === null ? sp : smax(sp, pitProfile(pitQ(x, z)), 1.5);
  if (basin !== null) h = Math.min(h, basin);
  // the yard stays exactly flat (the dock wall, the apron trimesh and the bridge head sit at y 0)
  if (Math.hypot(x, z) <= PLATEAU.flat) h = 0;
  return h;
}

// ── grids, quantisation, encoding ─────────────────────────────────────────────
function bakeGrid({ half, step }, fn = height) {
  const n = Math.round((half * 2) / step) + 1;
  const h = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = fn(-half + i * step, -half + j * step);
  return { n, x0: -half, z0: -half, step, h };
}
function quantise(g, quantum) {
  const q = new Uint16Array(g.n * g.n);
  for (let k = 0; k < q.length; k++) q[k] = Math.max(0, Math.min(65535, Math.round((g.h[k] - GRID.base) / quantum)));
  return q;
}
function encode(kind, g, quantum = GRID.quantum) {
  const q = quantise(g, quantum);
  const n = g.n;
  const res = new Uint16Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      let pred;
      if (i === 0 && j === 0) pred = q[0];
      else if (j === 0) pred = q[k - 1];
      else if (i === 0) pred = q[k - n];
      else pred = q[k - 1] + q[k - n] - q[k - n - 1];
      const r = q[k] - pred;
      if (r > 32767 || r < -32768) throw new Error(`residual ${r} out of range in block ${kind} at ${i},${j}`);
      res[k] = ((r << 1) ^ (r >> 31)) & 0xffff;
    }
  const head = Buffer.alloc(28);
  head.writeUInt8(kind, 0);
  head.writeUInt8(0, 1);
  head.writeUInt16LE(n, 2);
  head.writeFloatLE(g.x0, 4);
  head.writeFloatLE(g.z0, 8);
  head.writeFloatLE(g.step, 12);
  head.writeFloatLE(GRID.base, 16);
  head.writeFloatLE(quantum, 20);
  head.writeUInt16LE(q[0], 24);
  head.writeUInt16LE(0, 26);
  return { buf: Buffer.concat([head, Buffer.from(res.buffer)]), q };
}
function file(blocks) {
  const head = Buffer.alloc(8);
  head.write('EGH1', 0, 'latin1');
  head.writeUInt16LE(1, 4);
  head.writeUInt16LE(blocks.length, 6);
  return Buffer.concat([head, ...blocks.map((b) => b.buf)]);
}
const br = (b) => zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_GENERIC, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: b.length } }).length;

const t0 = performance.now();
const near = bakeGrid(GRID.near);
// the preview and the core are exact subsamples of the near grid, so nothing shifts when the ring arrives
function sub(src, { half, step }) {
  const k = Math.round(step / src.step);
  const off = Math.round((half + src.x0) / -src.step);
  const n = Math.round((half * 2) / step) + 1;
  const h = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = src.h[(off + j * k) * src.n + off + i * k];
  return { n, x0: -half, z0: -half, step, h };
}
const core = sub(near, GRID.core);
const preview = sub(near, GRID.preview);
const far = bakeGrid(GRID.far);
const ms = performance.now() - t0;

// the preview and the far land are seen from afar: coarser quanta (GRID.coarse) keep the core file small
const coreFile = file([encode(1, core), encode(2, preview, GRID.coarse.preview), encode(3, far, GRID.coarse.far)]);
const ringFile = file([encode(4, near)]);

// ── checks: the yard is flat, the water stays ≥ 1 m below near-flat shore ground (C1 m6) ─────
const fails = [];
let flatBad = 0,
  wet = 0;
for (let j = 1; j < near.n - 1; j++)
  for (let i = 1; i < near.n - 1; i++) {
    const x = near.x0 + i * near.step,
      z = near.z0 + j * near.step;
    const h = near.h[j * near.n + i];
    if (Math.hypot(x, z) <= PLATEAU.flat && h !== 0) flatBad++;
    const gx = (near.h[j * near.n + i + 1] - near.h[j * near.n + i - 1]) / (2 * near.step);
    const gz = (near.h[(j + 1) * near.n + i] - near.h[(j - 1) * near.n + i]) / (2 * near.step);
    if (h > SHORE.water && h < SHORE.water + 1 && Math.hypot(gx, gz) < 0.6) wet++;
  }
if (flatBad) fails.push(`${flatBad} yard samples are not at y 0`);
if (wet) fails.push(`${wet} near-flat samples lie within 1 m above the water`);
// ── the protected heights: every plot, pad, path, flat, landmark spot and the yard keep the wave-1 heights ──
{
  const pts = [];
  const rectPts = (at, size, yawDeg = 0, step = 2) => {
    const c = Math.cos(yawDeg * DEG),
      s = Math.sin(yawDeg * DEG);
    for (let u = -size[0] / 2; u <= size[0] / 2 + 1e-6; u += step)
      for (let v = -size[1] / 2; v <= size[1] / 2 + 1e-6; v += step) pts.push([at[0] + u * c + v * s, at[1] - u * s + v * c]);
  };
  const discPts = (at, r, step = 2) => {
    for (let u = -r; u <= r + 1e-6; u += step) for (let v = -r; v <= r + 1e-6; v += step) if (Math.hypot(u, v) <= r) pts.push([at[0] + u, at[1] + v]);
  };
  for (const B of beds) {
    const d = densify(B.path.pts, !!B.path.closed, 1);
    for (let i = 0; i < d.length; i++) {
      const a = d[Math.max(0, i - 1)],
        b = d[Math.min(d.length - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / l,
        nz = (b[0] - a[0]) / l;
      for (const k of [-1, -0.5, 0, 0.5, 1]) pts.push([d[i][0] + nx * k * (B.path.width / 2), d[i][1] + nz * k * (B.path.width / 2)]);
    }
  }
  for (const f of FLATS) if (f.radius) discPts(f.at, f.radius);
  else rectPts(f.at, f.size, f.yawDeg ?? 0);
  for (const f of FIELDS) rectPts(f.at, f.size, f.yawDeg ?? 0, 4);
  for (const g of L.GROUND_PADS) discPts([g.position[0], g.position[2]], 8, 1);
  const LM = L.LANDMARKS;
  discPts([LM.hofladen[0], LM.hofladen[2]], 8, 1);
  rectPts([LM.dorf.position[0], LM.dorf.position[2]], LM.dorf.size, 0, 4);
  discPts([LM.bahnhof[0], LM.bahnhof[2]], 20);
  discPts([LM.holzbau.position[0], LM.holzbau.position[2]], LM.holzbau.diameter / 2 + 5);
  discPts([LM.seeblick[0], LM.seeblick[2]], 9, 1);
  for (const t of LM.turbines) discPts([t[0], t[2]], 12);
  for (const c of LM.cranes) discPts([c[0], c[2]], 20);
  for (let r = 0; r <= PLATEAU.flat; r += 25) for (let b = 0; b < 360; b += 5) pts.push([Math.sin(b * DEG) * r, -Math.cos(b * DEG) * r]);
  let worst = 0,
    at = null;
  for (const [x, z] of pts) {
    const d = Math.abs(height(x, z) - height(x, z, true));
    if (d > worst) {
      worst = d;
      at = [x, z];
    }
  }
  console.log(`protected heights: ${pts.length} samples on the plots, pads, paths, flats, landmark spots and the yard; max change ${worst.toExponential(1)} m`);
  if (worst > 1e-6) fails.push(`a protected height changed by ${worst.toFixed(3)} m at (${at[0].toFixed(1)}, ${at[1].toFixed(1)})`);
  // the excavator's lay-by is level (WP14 places the bucket-wheel excavator on it, D42)
  let lo = Infinity,
    hi = -Infinity,
    bedLo = Infinity,
    bedHi = -Infinity;
  const P0 = GRUBENRAND.pad;
  for (let u = -P0.size[0] / 2; u <= P0.size[0] / 2; u += 1)
    for (let v = -P0.size[1] / 2; v <= P0.size[1] / 2; v += 1) {
      const x = P0.at[0] + u,
        z = P0.at[1] + v;
      const h = height(x, z);
      bedLo = Math.min(bedLo, h);
      bedHi = Math.max(bedHi, h);
      // the track's bed crosses the pad's north edge and keeps its own grade (a path)
      if (bedAt(padBed, x, z).d <= padBed.path.width / 2 + 0.5) continue;
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
  console.log(`lay-by at (${P0.at.join(', ')}): ${P0.size.join(' × ')} m level at ${lo.toFixed(2)} … ${hi.toFixed(2)} m (with the track bed across it ${bedLo.toFixed(2)} … ${bedHi.toFixed(2)} m)`);
  if (hi - lo > 0.05) fails.push(`the lay-by is not level (${(hi - lo).toFixed(3)} m)`);
}
const coreBr = br(coreFile),
  ringBr = br(ringFile);
// BAKE_DEBUG=1: the brotli size of each block of the core file
if (process.env.BAKE_DEBUG) for (const [n, b] of [['core', encode(1, core)], ['preview', encode(2, preview, GRID.coarse.preview)], ['far', encode(3, far, GRID.coarse.far)]]) console.log(n, (br(b.buf) / 1024).toFixed(1), 'KB br');
if (coreBr > 20 * 1024) fails.push(`heights-core ${(coreBr / 1024).toFixed(1)} KB brotli > 20 KB`);
if (ringBr > 100 * 1024) fails.push(`heights-ring ${(ringBr / 1024).toFixed(1)} KB brotli > 100 KB`);

let hmin = Infinity,
  hmax = -Infinity;
for (const v of near.h) {
  hmin = Math.min(hmin, v);
  hmax = Math.max(hmax, v);
}
console.log(`baked in ${(ms / 1000).toFixed(1)} s: near ${near.n}² (${hmin.toFixed(1)} … ${hmax.toFixed(1)} m), core ${core.n}², preview ${preview.n}², far ${far.n}²`);
console.log(`heights-core.bin  ${(coreFile.length / 1024).toFixed(1)} KB raw · ${(coreBr / 1024).toFixed(1)} KB brotli (cap 20)`);
console.log(`heights-ring.bin  ${(ringFile.length / 1024).toFixed(1)} KB raw · ${(ringBr / 1024).toFixed(1)} KB brotli (cap 100)`);

if (check) {
  for (const [name, buf] of [
    ['heights-core.bin', coreFile],
    ['heights-ring.bin', ringFile],
  ]) {
    const p = path.join(OUT, name);
    if (!fs.existsSync(p) || !fs.readFileSync(p).equals(buf)) fails.push(`${name} differs from the bake (run node tools/ground/bake.mjs)`);
  }
} else {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'heights-core.bin'), coreFile);
  fs.writeFileSync(path.join(OUT, 'heights-ring.bin'), ringFile);
  console.log(`wrote ${path.relative(ROOT, OUT)}/heights-core.bin and heights-ring.bin`);
}
if (fails.length) {
  console.log(`FAIL  ${fails.join(' · ')}`);
  process.exitCode = 1;
} else console.log('PASS  yard flat, shore ≥ 1 m above the water, caps held');
