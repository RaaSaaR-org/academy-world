/**
 * The ways through the Revier (plan §2.2, §2.4, §2.7): WP3 laid the tracks (their beds, the fences and the
 * colliders); the region tells you where they go and makes them a place.
 *  - A larch signpost at every ground pad (G60, G120, G240, G300) with blades toward the sites and the
 *    distances along the track (all blade texts on one canvas atlas: one draw for every signpost).
 *  - Managed green along the tracks (§2.7 rule 2): an orchard row (Streuobst) beside the farm track, a hedge
 *    along the track to the Kreislaufhof, young trees on the way to the Unkrautacker, outside the fences.
 * Draws: the green 1 (ground program, also the far tier: the Ausguck sees the rows), the posts 1 and the
 * blades 1 (both near only).
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { css } from '@/core/zones';
import { GROUND_PADS } from '../layout';
import { PATHS } from '../ground/plan';
import { outsideCamera } from '../ground/camera';
import { BOX, CYL6, GroundBatch, ICO, box, mat4, place, rng, type RegionLook } from './look';
import { FONT, canvasTexture } from './canvas';
import { R } from './tuning';

const C = R.color;

/** The blades: pad, the key of the destination's name, the track it follows (WP3's PATHS id) or a fixed bearing. */
const SIGNS: { pad: string; blades: { name: string; track?: string; to?: [number, number] }[] }[] = [
  { pad: 'G240', blades: [{ name: 'hofladen', track: 'sonnenacker' }, { name: 'grubenrand', track: 'sonnenacker', to: [-195, 87.5] }] },
  { pad: 'G300', blades: [{ name: 'unkrautacker', track: 'unkrautacker' }] },
  { pad: 'G60', blades: [{ name: 'kreislaufhof', track: 'kreislaufhof' }] },
  { pad: 'G120', blades: [{ name: 'traumhangar', to: [122.6, 110.4] }, { name: 'werft', to: [135, 0] }] },
];

export interface Ways {
  /** cluster centres (world xz) of the near parts */
  readonly clusters: { at: [number, number]; group: THREE.Object3D }[];
  stats(): Record<string, unknown>;
}

/** length of a polyline from its first point up to the point nearest `to` (or its end) */
function along(pts: [number, number][], to?: [number, number]): number {
  let len = 0;
  let best = Infinity,
    bestLen = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i],
      [bx, bz] = pts[i + 1];
    const seg = Math.hypot(bx - ax, bz - az);
    if (to) {
      const t = Math.max(0, Math.min(1, ((to[0] - ax) * (bx - ax) + (to[1] - az) * (bz - az)) / (seg * seg || 1)));
      const d = Math.hypot(ax + (bx - ax) * t - to[0], az + (bz - az) * t - to[1]);
      if (d < best) {
        best = d;
        bestLen = len + seg * t;
      }
    }
    len += seg;
  }
  return to ? bestLen : len;
}

export function buildWays(ctx: ZoneContext, parent: THREE.Object3D, look: RegionLook): Ways {
  const y = look.y;
  const root = new THREE.Group();
  root.name = 'region:ways';
  parent.add(root);
  const r = rng(240603);

  // ── green along the tracks (outside the corridor fences at ± 6 m) ──
  const green = new GroundBatch();
  const track = (id: string): [number, number][] => PATHS.find((p) => p.id === id)!.pts;
  const alongTrack = (pts: [number, number][], every: number, side: number, fn: (x: number, z: number, i: number) => void): void => {
    let carry = every * 0.5;
    let i = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, az] = pts[k],
        [bx, bz] = pts[k + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / L,
        nz = (bx - ax) / L;
      for (let s = carry; s < L; s += every) {
        const t = s / L;
        fn(ax + (bx - ax) * t + nx * side, az + (bz - az) * t + nz * side, i++);
      }
      carry = (carry - L) % every;
      if (carry < 0) carry += every;
    }
  };
  const tree = (x: number, z: number, crown: number, h: number, color: number): void => {
    const g = y(x, z);
    green.add(CYL6, look.s(0x5f5348, 0.95, 0, 0.6), mat4(x, g + h * 0.35, z, 0, 0.32, h * 0.7, 0.32));
    green.add(ICO, look.s(color, 1, 0, 0.8), mat4(x, g + h * 0.62 + crown * 0.4, z, r() * 3, crown, crown * 0.85, crown));
  };
  // the lift-off's drone shot C1 hovers over this track: no crown within 32 m of its path fills the frame (WP17)
  const [c1a, c1b] = [outsideCamera('C1', 0, 24).position, outsideCamera('C1', 0, 32).position];
  const nearC1 = (x: number, z: number): boolean => {
    const ex = c1b[0] - c1a[0],
      ez = c1b[2] - c1a[2];
    const t = Math.max(0, Math.min(1, ((x - c1a[0]) * ex + (z - c1a[2]) * ez) / (ex * ex + ez * ez)));
    return Math.hypot(x - c1a[0] - ex * t, z - c1a[2] - ez * t) < 32;
  };
  // Streuobst along the farm track, both sides; the Grubenrand's cut stays open (the excavator is the view)
  for (const side of [-7.5, 7.5])
    alongTrack(track('sonnenacker').slice(0, 3), 11, side, (x, z) => {
      if (Math.hypot(x + 129.9, z - 75) < 12) return;
      const crown = 2.1 + r() * 0.7,
        h = 3.6 + r() * 0.8,
        color = r() < 0.5 ? C.leaf : C.crop;
      // (a skipped tree still draws its yaw, so every other tree keeps its look)
      if (!nearC1(x, z)) tree(x, z, crown, h, color);
      else r();
    });
  // a hedge along the track to the Kreislaufhof (north side), a few field maples in it
  alongTrack(track('kreislaufhof'), 4, -7.2, (x, z, i) => {
    if (i < 3) return;
    green.add(BOX, look.s(C.hedge, 1, 0, 1), mat4(x, y(x, z) + 0.95, z, r() * 3, 4.2, 1.9 * (0.85 + r() * 0.3), 1.6));
    if (i % 9 === 4) tree(x, z, 2.6, 6.5, C.leaf);
  });
  // young trees on the way to the Unkrautacker (east side)
  alongTrack(track('unkrautacker'), 13, 7.5, (x, z, i) => {
    if (i < 1) return;
    tree(x, z, 1.6 + r() * 0.4, 4.4 + r() * 0.6, C.grassGreen);
  });
  const greenMesh = place(root, green, look, 'region:ways:green', { cast: true });

  // ── signposts at the pads (near only) ──
  const near = new THREE.Group();
  near.name = 'region:ways:near';
  root.add(near);
  const posts = new GroundBatch();
  const blades: { m: THREE.Matrix4; row: number }[] = [];
  const rows: { name: string; metres: number | null }[] = [];
  const clusters: Ways['clusters'] = [];
  for (const s of SIGNS) {
    const pad = GROUND_PADS.find((g) => g.id === s.pad)!;
    const [px, , pz] = pad.position;
    // the post stands 4 m from the pad toward its first destination, a bit to the side
    const first = s.blades[0];
    const firstTo = first.track ? track(first.track)[1] : first.to!;
    const dirX = firstTo[0] - px,
      dirZ = firstTo[1] - pz;
    const dl = Math.hypot(dirX, dirZ) || 1;
    const sx = px + (dirX / dl) * 4.5 + (-dirZ / dl) * 3.2,
      sz = pz + (dirZ / dl) * 4.5 + (dirX / dl) * 3.2;
    const sy = y(sx, sz);
    posts.add(BOX, look.s(C.timberSilver, 0.88, 0, 0.9), box(sx, sy + 1.35, sz, 0.16, 2.7, 0.16));
    posts.add(BOX, look.s(C.timberSilver, 0.88, 0, 0.9), box(sx, sy + 2.76, sz, 0.26, 0.12, 0.26));
    s.blades.forEach((bl, k) => {
      const to = bl.to ?? track(bl.track!)[1];
      const yaw = Math.atan2(-(to[1] - sz), to[0] - sx);
      const metres = bl.track ? Math.round(along(track(bl.track), bl.to) / 5) * 5 : null;
      rows.push({ name: bl.name, metres });
      // a blade 1.5 × 0.32 m, its arrow end toward the destination
      const m = new THREE.Matrix4().compose(new THREE.Vector3(sx, sy + 2.3 - k * 0.42, sz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(0.8, 0, 0));
      blades.push({ m, row: rows.length - 1 });
      posts.add(BOX, look.s(C.timberFresh, 0.85, 0, 0.6), m.clone().multiply(new THREE.Matrix4().makeScale(1.52, 0.34, 0.05)));
    });
    clusters.push({ at: [sx, sz], group: near });
  }
  place(near, posts, look, 'region:ways:posts', { cast: true });

  // the blade texts: one canvas atlas, two rows per blade (the front reads toward the destination, the back
  // too: its arrow sits on the left, where the destination is for a reader behind the blade)
  const ROWS = 16;
  const atlas = canvasTexture(1024, 64 * ROWS, (g) => {
    rows.forEach((row, i) => {
      for (const back of [false, true]) {
        const y0 = (i * 2 + (back ? 1 : 0)) * 64;
        g.fillStyle = '#b9a68a';
        g.fillRect(0, y0, 1024, 64);
        g.fillStyle = '#2b2a2c';
        g.textBaseline = 'middle';
        const text = ctx.t(`region.way.${row.name}`);
        const dist = row.metres != null ? `${row.metres} m` : '';
        g.font = FONT.display(40, 700);
        g.textAlign = back ? 'right' : 'left';
        g.fillText(text, back ? 988 : 36, y0 + 34);
        if (dist) {
          g.font = FONT.mono(30, 500);
          g.textAlign = back ? 'left' : 'right';
          g.fillText(dist, back ? 96 : 928, y0 + 35);
        }
        g.textAlign = 'left';
        // the arrow head at the destination end
        g.fillStyle = css.base;
        g.beginPath();
        if (back) {
          g.moveTo(72, y0 + 14);
          g.lineTo(24, y0 + 32);
          g.lineTo(72, y0 + 50);
        } else {
          g.moveTo(952, y0 + 14);
          g.lineTo(1000, y0 + 32);
          g.lineTo(952, y0 + 50);
        }
        g.closePath();
        g.fill();
      }
    });
  });
  ctx.i18n.onChange(() => atlas.redraw());
  void document.fonts?.ready.then(() => atlas.redraw());
  const pos: number[] = [],
    uv: number[] = [],
    nor: number[] = [];
  const quad = (m: THREE.Matrix4, row: number, back: boolean): void => {
    const z = back ? -0.027 : 0.027;
    const r0 = row * 2 + (back ? 1 : 0);
    const v0 = 1 - (r0 + 1) / ROWS,
      v1 = 1 - r0 / ROWS;
    const corners: [number, number, number, number][] = [
      [-0.74, -0.16, 0, v0],
      [0.74, -0.16, 1, v0],
      [0.74, 0.16, 1, v1],
      [-0.74, 0.16, 0, v1],
    ];
    const n = new THREE.Vector3(0, 0, back ? -1 : 1).transformDirection(m);
    const idx = back ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const i of idx) {
      const [x, yy, u, v] = corners[i];
      const p = new THREE.Vector3(x, yy, z).applyMatrix4(m);
      pos.push(p.x, p.y, p.z);
      // seen from behind, local +x is on the reader's left: the back row is laid out mirrored, so u flips
      uv.push(back ? 1 - u : u, v);
      nor.push(n.x, n.y, n.z);
    }
  };
  for (const bl of blades) {
    quad(bl.m, bl.row, false);
    quad(bl.m, bl.row, true);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const bladeMat = new THREE.MeshStandardMaterial({ map: atlas.tex, roughness: 0.85, metalness: 0 });
  const bladeMesh = new THREE.Mesh(geo, bladeMat);
  bladeMesh.name = 'region:ways:blades';
  near.add(bladeMesh);
  ctx.onDispose(() => {
    geo.dispose();
    bladeMat.dispose();
    atlas.tex.dispose();
  });

  return {
    clusters,
    stats: () => ({ greenTriangles: greenMesh ? (greenMesh.geometry.getAttribute('position').count / 3) | 0 : 0, signs: rows.length }),
  };
}
