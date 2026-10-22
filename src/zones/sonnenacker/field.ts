/**
 * Sonnenacker — the living crop (plan §4.10, R8 §2.1; R9 L3): staked cherry-tomato plants in two rows
 * per Hochbeet („planted for the robot“: 0,25 m in from each long edge, the fruit on the outer side
 * where the arm reaches), the fruit that ripens through the six USDA colour classes [S24] and is
 * picked, the loose fruit in the arms' grippers and trays, and the old lower leaves of the Messbeet
 * that you strip in „Erntetag“ (the human's job).
 *
 * Draws: plants 1 · hanging fruit 1 · loose fruit 1 · old leaves 1, all on the robots' shared paint
 * (instanced vertex colours, compiled at boot). Instance buffers are uploaded by range, so a pick
 * moves a few bytes, not the field.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { BEDS, PICK, RIPE, ROOFS, SITE } from './tuning';
import { rng, type Look } from './look';
import type { Plane } from './site';
import { clusterOf, messbeet, type Vis } from './model';

/** A tomato row: the arm that works it, the fruit slots in z order. */
export interface Row {
  /** 'a' / 'b' Sonnendach rows (one arm each), 'ref' the Referenzbeete */
  roof: 'a' | 'b' | 'ref';
  bed: number;
  /** −1 south edge, +1 north edge */
  side: -1 | 1;
  /** the row's x and the outer fruit line's x */
  x: number;
  fruitX: number;
  z0: number;
  z1: number;
  /** fruit slot indices sorted by z */
  slots: number[];
}

/** One hanging tomato. */
export interface Fruit {
  x: number;
  y: number;
  z: number;
  row: number;
  /** USDA class 0…5 (float while it ripens) */
  ripe: number;
  /** 0 hanging · 1 taken (in a gripper, a tray or gone) · 2 regrowing (scale ramps up) */
  state: 0 | 1 | 2;
  grow: number;
  /** the Messbeet's sample (index 0…59) or −1 */
  sample: number;
  /** claimed by an arm */
  claimed: boolean;
  /** seconds until a picked slot sets fruit again (−1: not waiting) */
  wait: number;
}

export interface Field {
  readonly rows: readonly Row[];
  readonly fruit: readonly Fruit[];
  /** the Messbeet: its two rows' indices into `rows`, the sample slots (row-major, 2 × 30) and their leaf state */
  readonly mess: { rows: [number, number]; sample: number[]; vis: [Vis[], Vis[]]; stem: [number, number]; clusters: THREE.Vector3[][] };
  /** hide a hanging fruit (picked), let it regrow later (ambient) */
  take(i: number, regrow: boolean): void;
  /** colour a fruit (class 0…5, fractional blends) */
  setRipe(i: number, cls: number): void;
  /** the next ripe, unclaimed fruit of a row ahead of z (direction +1/−1), within maxDz; −1 if none */
  nextRipe(row: number, z: number, dir: 1 | -1, maxDz: number, minClass?: number): number;
  /** loose fruit (grippers, trays): slot k at a matrix (null hides it) */
  loose(k: number, m: THREE.Matrix4 | null, cls?: number): void;
  readonly looseCount: number;
  /** strip one old leaf cluster of the Messbeet (row 0/1, cluster); true if it was there */
  deleaf(row: 0 | 1, cluster: number): boolean;
  /** all Messbeet leaves back (a new season), the sample ripe again */
  resetMessbeet(): void;
  /** the Messbeet's sample hangs ripe again (a new day; the leaves stay as they are) */
  resetSample(): void;
  /** the Messbeet's sample fruit visible as `free` (the stem call) */
  setVis(row: 0 | 1, fruit: number, v: Vis): void;
  readonly meshes: { plants: THREE.InstancedMesh; fruit: THREE.InstancedMesh; loose: THREE.InstancedMesh; leaves: THREE.InstancedMesh };
  /** Sonnendach B seen from far (≥ 55 m): its plants and fruit are not drawn (an honest distance LOD) */
  setFarB(farB: boolean): void;
  /** slow ripening and regrowth (call a few times per second) */
  tick(dt: number): void;
  /** flush changed instance ranges (once per frame) */
  flush(): void;
}

const CLASS_COLOURS = RIPE.colours.map((c) => new THREE.Color(c));
const _c = new THREE.Color();
/** a fruit colour for a fractional class */
export function ripeColour(cls: number, out = _c): THREE.Color {
  const k = Math.max(0, Math.min(5, cls));
  const i = Math.min(4, Math.floor(k));
  return out.copy(CLASS_COLOURS[i]).lerp(CLASS_COLOURS[i + 1], k - i);
}

/** A cherry tomato: a six-sided ball (two latitude rings, smooth normals, 24 triangles), flattened at the stem. */
export function tomatoGeometry(r: number): THREE.BufferGeometry {
  const pos: number[] = [0, r * 0.86, 0];
  const rings: [number, number][] = [
    [0.42, 0.88],
    [-0.42, 0.9],
  ];
  for (const [y, rr] of rings)
    for (let k = 0; k < 6; k++) {
      const a = ((k + (y > 0 ? 0 : 0.5)) / 6) * Math.PI * 2;
      pos.push(Math.cos(a) * r * rr, y * r, Math.sin(a) * r * rr);
    }
  pos.push(0, -r, 0);
  const idx: number[] = [];
  for (let k = 0; k < 6; k++) {
    const a = 1 + k,
      b = 1 + ((k + 1) % 6),
      c = 7 + k,
      d = 7 + ((k + 1) % 6);
    idx.push(0, b, a);
    idx.push(a, b, c, b, d, c);
    idx.push(13, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // sphere normals (round shading on a few triangles)
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const n = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    n.set([v.x, v.y, v.z], i * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(p.count * 3).fill(1), 3));
  return g;
}

/**
 * The foliage of a staked cherry-tomato plant, painted once into a canvas (stem, larch stake, compound
 * leaves of serrated leaflets, darker low, younger and lighter at the top, a few yellow flowers). The
 * plants are crossed cards of this texture (alpha-tested), so a lush row costs 6 triangles a plant.
 */
function plantTexture(seed: number): THREE.CanvasTexture {
  const W = 256,
    H = 512;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const r = rng(seed);
  g.clearRect(0, 0, W, H);
  // the larch stake (behind) and the main stem
  g.fillStyle = '#8a7a62';
  g.fillRect(W / 2 + 10, 40, 7, H - 40);
  g.strokeStyle = '#3f5a2c';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(W / 2, H);
  g.bezierCurveTo(W / 2 - 10, H * 0.7, W / 2 + 12, H * 0.35, W / 2 - 2, 18);
  g.stroke();
  const leafCols = ['#41552d', '#4a6032', '#557039', '#5e7a40', '#6b8849', '#79954f'];
  // a leaflet: a pointed oval with a few teeth and a lighter vein
  const leaflet = (x: number, y: number, a: number, len: number, col: string): void => {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, 0);
    const w = len * 0.42;
    const teeth = 4;
    for (let k = 0; k <= teeth; k++) {
      const t = k / teeth;
      const ww = Math.sin(t * Math.PI) * w * (k % 2 ? 1.08 : 0.94);
      g.lineTo(t * len, -ww);
    }
    for (let k = teeth; k >= 0; k--) {
      const t = k / teeth;
      const ww = Math.sin(t * Math.PI) * w * (k % 2 ? 0.94 : 1.08);
      g.lineTo(t * len, ww);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(190,210,140,0.35)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(len * 0.1, 0);
    g.lineTo(len * 0.85, 0);
    g.stroke();
    g.restore();
  };
  // compound leaves alternating up the stem
  const N = 15;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const y = H - 30 - t * (H - 70) + (r() - 0.5) * 18;
    const side = i % 2 ? 1 : -1;
    const x0 = W / 2 + (r() - 0.5) * 10;
    const reach = (70 + r() * 40) * (1 - t * 0.35);
    const lift = -0.35 - r() * 0.5 + t * 0.2;
    const col = leafCols[Math.min(leafCols.length - 1, Math.floor(t * 4 + r() * 2.2))];
    // the petiole
    const ang = side > 0 ? lift : Math.PI - lift;
    const ex = x0 + Math.cos(ang) * reach,
      ey = y + Math.sin(ang) * reach * 0.55;
    g.strokeStyle = '#46632f';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x0, y);
    g.quadraticCurveTo((x0 + ex) / 2, y - 12, ex, ey);
    g.stroke();
    // leaflets in pairs along it, the largest at the tip
    const pairs = 3;
    for (let k = 1; k <= pairs; k++) {
      const f = k / (pairs + 0.6);
      const px = x0 + (ex - x0) * f,
        py = y + (ey - y) * f - 6 * Math.sin(f * Math.PI);
      const len = 20 + 10 * f + r() * 6;
      for (const s of [-1, 1]) leaflet(px, py, ang + s * (0.9 + r() * 0.3) * side, len, col);
    }
    leaflet(ex, ey, ang + (r() - 0.5) * 0.3, 30 + r() * 8, col);
  }
  // a few yellow flowers at the trusses (bumblebees' work)
  for (let k = 0; k < 5; k++) {
    const x = W / 2 + (r() - 0.5) * 120,
      y = 120 + r() * 260;
    g.fillStyle = '#d8c24a';
    for (let p = 0; p < 5; p++) {
      g.beginPath();
      g.ellipse(x + Math.cos(p * 1.256) * 4, y + Math.sin(p * 1.256) * 4, 3.2, 1.6, p * 1.256, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Three crossed cards (60° apart), 0,56 × 1,25 m, with outward-up normals so the foliage shades soft. */
function plantCards(width = 0.56, height = 1.25): THREE.BufferGeometry {
  const pos: number[] = [],
    nrm: number[] = [],
    uv: number[] = [],
    col: number[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3;
    const cx = Math.cos(a) * (width / 2),
      cz = Math.sin(a) * (width / 2);
    const quad = [
      [-cx, 0, -cz, 0, 0],
      [cx, 0, cz, 1, 0],
      [cx, height, cz, 1, 1],
      [-cx, 0, -cz, 0, 0],
      [cx, height, cz, 1, 1],
      [-cx, height, -cz, 0, 1],
    ];
    for (const [x, y, z, u, v] of quad) {
      pos.push(x, y, z);
      // a soft normal: outward from the stem and up, so the cards do not flash flat
      const n = new THREE.Vector3(x, 0.55 + y / height, z).normalize();
      nrm.push(n.x, n.y, n.z);
      uv.push(u, v);
      const k2 = 0.82 + 0.25 * (y / height);
      col.push(k2, k2, k2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

const LOOSE = 18 + 18 * 12 + 40;

export function buildField(ctx: ZoneContext, look: Look, plane: Plane, detail: THREE.Object3D): Field {
  const rows: Row[] = [];
  const fruit: Fruit[] = [];
  const plantMats: THREE.Matrix4[] = [];
  const plantMatsB: THREE.Matrix4[] = [];
  const rnd = rng(4711);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();

  /** one row of plants and fruit trusses: plants every `pStep`, a truss of 2–5 every `tStep` on the outer side */
  const addRow = (roof: Row['roof'], bed: number, bx: number, side: -1 | 1, z0: number, z1: number, pStep: number, tStep: number): void => {
    const x = bx + side * (BEDS.width / 2 - BEDS.rowInset);
    const row: Row = { roof, bed, side, x, fruitX: x + side * 0.2, z0, z1, slots: [] };
    const ri = rows.length;
    rows.push(row);
    const mats = roof === 'b' ? plantMatsB : plantMats;
    for (let z = z0 + pStep / 2; z < z1; z += pStep) {
      const gy = plane.at(x, z) + BEDS.soilY - 0.01;
      const k = 0.9 + rnd() * 0.22;
      q.setFromAxisAngle(Y, rnd() * Math.PI * 2);
      mats.push(new THREE.Matrix4().compose(v.set(x + (rnd() - 0.5) * 0.04, gy, z + (rnd() - 0.5) * 0.1), q, s.set(0.95 + rnd() * 0.2, k, 0.95 + rnd() * 0.2)));
    }
    for (let z = z0 + tStep / 2; z < z1 - 0.1; z += tStep) {
      const gy = plane.at(x, z) + BEDS.soilY;
      const n = 4 + Math.floor(rnd() * 3.4);
      const ty = gy + 0.3 + rnd() * 0.45;
      const tz = z + (rnd() - 0.5) * tStep * 0.5;
      // a truss ripens from the stem out: the first fruit is the ripest
      const base = rnd();
      for (let k = 0; k < n; k++) {
        const ripe = Math.max(0, Math.min(5.3, (base < 0.55 ? 4.2 : base < 0.8 ? 2.4 : 0.6) + (rnd() - 0.5) * 1.2 - k * 0.35));
        fruit.push({
          // a hanging truss: a short zig-zag down and along the row
          x: row.fruitX + side * (0.01 + (k % 2) * 0.025 + rnd() * 0.015),
          y: ty - k * 0.03 - rnd() * 0.012,
          z: tz + (k - (n - 1) / 2) * 0.034 + (rnd() - 0.5) * 0.012,
          row: ri,
          ripe,
          state: 0,
          grow: 1,
          sample: -1,
          claimed: false,
          wait: -1,
        });
        row.slots.push(fruit.length - 1);
      }
    }
  };
  const zA0 = (ROOFS.a.z0 + ROOFS.a.z1) / 2 - BEDS.length / 2;
  const zB0 = (ROOFS.b.z0 + ROOFS.b.z1) / 2 - BEDS.length / 2;
  // Sonnendach A: rows ordered by arm index (bed 1 south, bed 1 north, bed 2 south, …)
  BEDS.xs.forEach((bx, b) => {
    for (const sd of [-1, 1] as const) addRow('a', b, bx, sd, zA0, zA0 + BEDS.length, 0.62, 1.5);
  });
  SITE.referenz.xs.forEach((bx, b) => {
    for (const sd of [-1, 1] as const) addRow('ref', b, bx, sd, SITE.referenz.z0, SITE.referenz.z1, 0.62, 1.7);
  });
  const nearFruit = fruit.length;
  BEDS.xs.forEach((bx, b) => {
    for (const sd of [-1, 1] as const) addRow('b', b, bx, sd, zB0, zB0 + BEDS.length, 0.8, 3.0);
  });
  for (const r of rows) r.slots.sort((a, b) => fruit[a].z - fruit[b].z);

  // ── the Messbeet (bed PICK.bed of A): one sample fruit per metre in each row, ripe ─────────
  const mb = messbeet();
  const messRows: [number, number] = [2 * PICK.bed, 2 * PICK.bed + 1];
  const sample: number[] = [];
  const clusters: THREE.Vector3[][] = [[], []];
  messRows.forEach((ri, r) => {
    const row = rows[ri];
    for (let j = 0; j < PICK.perRow; j++) {
      const zc = row.z0 + (j + 0.5) * (BEDS.length / PICK.perRow);
      // the slot nearest to the metre's centre becomes the sample fruit
      let best = row.slots[0];
      for (const sl of row.slots) if (Math.abs(fruit[sl].z - zc) < Math.abs(fruit[best].z - zc)) best = sl;
      const f = fruit[best];
      f.sample = r * PICK.perRow + j;
      f.ripe = 4.4 + ((j * 7) % 10) * 0.12;
      f.z = zc;
      f.y = plane.at(row.x, zc) + BEDS.soilY + 0.28 + ((j * 5) % 7) * 0.05;
      sample.push(best);
    }
    for (let c = 0; c < PICK.clustersPerRow; c++) {
      const zc = row.z0 + ((c + 0.5) * BEDS.length) / PICK.clustersPerRow;
      clusters[r].push(new THREE.Vector3(row.fruitX + row.side * 0.07, plane.at(row.x, zc) + BEDS.soilY + 0.42, zc));
    }
  });

  // ── meshes ──────────────────────────────────────────────────────────────────────
  const paintMat = look.paint;
  // the foliage: crossed alpha-tested cards (compiled with the zone's warm-up; no shadows)
  const plantTex = plantTexture(11);
  const plantMat = new THREE.MeshStandardMaterial({ map: plantTex, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.8, metalness: 0 });
  plantMat.name = 'sonnenacker:foliage';
  const plantGeo = plantCards();
  const plantGeoB = plantGeo;
  const pc = new THREE.Color();
  const mkPlants = (geo: THREE.BufferGeometry, mats: THREE.Matrix4[], name: string): THREE.InstancedMesh => {
    const m = new THREE.InstancedMesh(geo, plantMat, mats.length);
    m.name = name;
    mats.forEach((mm, i) => m.setMatrixAt(i, mm));
    for (let i = 0; i < mats.length; i++) m.setColorAt(i, pc.setRGB(0.9 + rnd() * 0.2, 0.92 + rnd() * 0.16, 0.86 + rnd() * 0.18));
    m.castShadow = false;
    m.receiveShadow = true;
    m.computeBoundingSphere();
    detail.add(m);
    return m;
  };
  const plants = mkPlants(plantGeo, plantMats, 'sonnenacker:plants');
  const plantsB = mkPlants(plantGeoB, plantMatsB, 'sonnenacker:plants-b');

  const fruitGeo = tomatoGeometry(0.024);
  const fm = new THREE.InstancedMesh(fruitGeo, paintMat, fruit.length);
  fm.name = 'sonnenacker:fruit';
  fm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fm.castShadow = false;
  fm.receiveShadow = true;
  const loose = new THREE.InstancedMesh(fruitGeo, paintMat, LOOSE);
  loose.name = 'sonnenacker:loose-fruit';
  loose.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  loose.castShadow = false;
  loose.frustumCulled = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let k = 0; k < LOOSE; k++) {
    loose.setMatrixAt(k, zero);
    loose.setColorAt(k, CLASS_COLOURS[5]);
  }
  const leafGeo = plantCards(0.42, 0.42);
  const leaves = new THREE.InstancedMesh(leafGeo, plantMat, 2 * PICK.clustersPerRow);
  const yellowing = new THREE.Color(1.35, 1.25, 0.62);
  for (let k = 0; k < 2 * PICK.clustersPerRow; k++) leaves.setColorAt(k, yellowing);
  leaves.name = 'sonnenacker:old-leaves';
  leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  leaves.castShadow = false;
  leaves.receiveShadow = true;
  detail.add(fm, loose, leaves);
  ctx.onDispose(() => {
    for (const g of [plantGeo, fruitGeo, leafGeo]) g.dispose();
    plantTex.dispose();
    plantMat.dispose();
    for (const m of [plants, plantsB, fm, loose, leaves]) m.dispose();
  });

  const writeFruit = (i: number): void => {
    const f = fruit[i];
    const sc = f.state === 1 ? 0 : f.state === 2 ? Math.max(0.05, f.grow) : 1;
    // a slight size step with ripeness: cherry tomatoes swell as they turn
    const k = sc * (0.82 + Math.min(1, f.ripe / 4) * 0.22);
    m4.makeScale(k, k, k).setPosition(f.x, f.y, f.z);
    fm.setMatrixAt(i, m4);
  };
  for (let i = 0; i < fruit.length; i++) {
    writeFruit(i);
    fm.setColorAt(i, ripeColour(fruit[i].ripe));
  }
  fm.computeBoundingSphere();
  const vis: [Vis[], Vis[]] = [mb.vis[0].slice(), mb.vis[1].slice()];
  const leafOn: boolean[][] = [0, 1].map(() => Array.from({ length: PICK.clustersPerRow }, () => true));
  const writeLeaf = (r: 0 | 1, c: number): void => {
    const p = clusters[r][c];
    const on = leafOn[r][c];
    // a cluster covers only where its fruit was hidden behind leaves (a free stretch has none)
    const any = [0, 1, 2].some((k) => {
      const j = c * 3 + k;
      return j < PICK.perRow && mb.vis[r][j] !== 'free' && j !== mb.stem[r];
    });
    if (!on || !any) m4.copy(zero);
    else {
      q.setFromAxisAngle(Y, r ? 0.4 : -0.4);
      m4.compose(v.copy(p).setY(p.y - 0.28), q, s.set(1, 1, 1));
    }
    leaves.setMatrixAt(r * PICK.clustersPerRow + c, m4);
  };
  for (let r = 0; r < 2; r++) for (let c = 0; c < PICK.clustersPerRow; c++) writeLeaf(r as 0 | 1, c);
  leaves.computeBoundingSphere();

  // ── dirty ranges ────────────────────────────────────────────────────────────────
  let fLo = Infinity,
    fHi = -1,
    cLo = Infinity,
    cHi = -1,
    looseDirty = false,
    leavesDirty = false;
  const dirtyM = (i: number): void => {
    fLo = Math.min(fLo, i);
    fHi = Math.max(fHi, i);
  };
  const dirtyC = (i: number): void => {
    cLo = Math.min(cLo, i);
    cHi = Math.max(cHi, i);
  };

  let tickAcc = 0;
  return {
    rows,
    fruit,
    mess: { rows: messRows, sample, vis, stem: mb.stem, clusters },
    meshes: { plants, fruit: fm, loose, leaves },
    setFarB(farB) {
      if (plantsB.visible === !farB) return;
      plantsB.visible = !farB;
      // Sonnendach B's fruit is the tail of the buffer: far away it is simply not drawn
      fm.count = farB ? nearFruit : fruit.length;
    },
    looseCount: LOOSE,
    take(i, regrow) {
      const f = fruit[i];
      f.state = regrow ? 2 : 1;
      f.grow = 0;
      f.claimed = false;
      if (regrow) {
        f.ripe = 0;
        fm.setColorAt(i, ripeColour(0));
        dirtyC(i);
        f.state = 1;
        // a new truss sets fruit again after a while (the regrowth is slow and quiet)
        f.wait = 20 + (i % 13) * 3;
      }
      writeFruit(i);
      dirtyM(i);
    },
    setRipe(i, cls) {
      fruit[i].ripe = cls;
      fm.setColorAt(i, ripeColour(cls));
      dirtyC(i);
      writeFruit(i);
      dirtyM(i);
    },
    nextRipe(ri, z, dir, maxDz, minClass = 4) {
      const row = rows[ri];
      let best = -1,
        bd = Infinity;
      for (const i of row.slots) {
        const f = fruit[i];
        if (f.state !== 0 || f.claimed || f.ripe < minClass || f.sample >= 0) continue;
        const d = (f.z - z) * dir;
        if (d < -0.05 || d > maxDz) continue;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return best;
    },
    loose(k, m, cls) {
      if (k < 0 || k >= LOOSE) return;
      loose.setMatrixAt(k, m ?? zero);
      if (cls != null) {
        loose.setColorAt(k, ripeColour(cls));
        if (loose.instanceColor) loose.instanceColor.needsUpdate = true;
      }
      looseDirty = true;
    },
    deleaf(r, c) {
      if (!leafOn[r][c]) return false;
      leafOn[r][c] = false;
      writeLeaf(r, c);
      leavesDirty = true;
      for (let k = 0; k < 3; k++) {
        const j = c * 3 + k;
        if (j < PICK.perRow && j !== mb.stem[r] && clusterOf(j) === c) vis[r][j] = 'free';
      }
      return true;
    },
    resetMessbeet() {
      for (let r = 0; r < 2; r++) for (let j = 0; j < PICK.perRow; j++) vis[r][j] = mb.vis[r][j];
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < PICK.clustersPerRow; c++) {
          leafOn[r][c] = true;
          writeLeaf(r as 0 | 1, c);
        }
      leavesDirty = true;
      for (const i of sample) {
        const f = fruit[i];
        f.state = 0;
        f.grow = 1;
        f.claimed = false;
        f.ripe = 4.4 + ((f.sample * 7) % 10) * 0.12;
        fm.setColorAt(i, ripeColour(f.ripe));
        dirtyC(i);
        writeFruit(i);
        dirtyM(i);
      }
    },
    resetSample() {
      for (const i of sample) {
        const f = fruit[i];
        f.state = 0;
        f.grow = 1;
        f.claimed = false;
        f.wait = -1;
        f.ripe = 4.4 + ((f.sample * 7) % 10) * 0.12;
        fm.setColorAt(i, ripeColour(f.ripe));
        dirtyC(i);
        writeFruit(i);
        dirtyM(i);
      }
    },
    setVis(r, j, val) {
      vis[r][j] = val;
    },
    tick(dt) {
      tickAcc += dt;
      if (tickAcc < 0.5) return;
      const step = tickAcc;
      tickAcc = 0;
      for (let i = 0; i < fruit.length; i++) {
        const f = fruit[i];
        if (f.sample >= 0) continue;
        if (f.state === 1 && f.wait >= 0) {
          f.wait -= step;
          if (f.wait <= 0) {
            f.wait = -1;
            f.state = 2;
            f.grow = 0.05;
          }
          continue;
        }
        if (f.state === 2) {
          f.grow = Math.min(1, f.grow + step / 30);
          if (f.grow >= 1) f.state = 0;
          writeFruit(i);
          dirtyM(i);
        }
        // ripening: green → red over a few minutes of play (the farm clock compressed)
        if (f.state !== 1 && f.ripe < 5.3) {
          const before = Math.floor(f.ripe * 4);
          f.ripe = Math.min(5.3, f.ripe + step * 0.012);
          if (Math.floor(f.ripe * 4) !== before) {
            fm.setColorAt(i, ripeColour(f.ripe));
            dirtyC(i);
            writeFruit(i);
            dirtyM(i);
          }
        }
      }
    },
    flush() {
      if (fHi >= 0) {
        fm.instanceMatrix.clearUpdateRanges();
        fm.instanceMatrix.addUpdateRange(fLo * 16, (fHi - fLo + 1) * 16);
        fm.instanceMatrix.needsUpdate = true;
        fLo = Infinity;
        fHi = -1;
      }
      if (cHi >= 0 && fm.instanceColor) {
        fm.instanceColor.clearUpdateRanges();
        fm.instanceColor.addUpdateRange(cLo * 3, (cHi - cLo + 1) * 3);
        fm.instanceColor.needsUpdate = true;
        cLo = Infinity;
        cHi = -1;
      }
      if (looseDirty) {
        loose.instanceMatrix.needsUpdate = true;
        looseDirty = false;
      }
      if (leavesDirty) {
        leaves.instanceMatrix.needsUpdate = true;
        leavesDirty = false;
      }
    },
  };
}
