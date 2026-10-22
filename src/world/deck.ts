import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { DeckMaterial } from '@/core/brand/materials';
import { DEG, ISLAND, PATHS, ZONE_PLOTS, PADS, bearingDir, outlineRadius, polar } from './layout';
import type { IslandTextures } from './textures';
import { circleProfile, outlineSamples, polarMesh, sweep, type PolarRing } from './geometry';
import { annulus, groundStrip, merge } from './util';
import { HALL_RECT, INTAKES, INTAKE_RIM, inHallRect } from './landscape/plan';
import { arcPts, flatRing, flatStrip, paint, rbox, sharedBatch } from './landscape/batch';
import { markStatic } from './statics';
import { cullTinyText } from './detail';

/**
 * The walkable top (ART-V2 §4.2): one composite deck (3 × 1.5 m staggered panels) over the whole
 * outline, paths in the darker "runway" tone with flush alu kerbs, the plaza as a turbine disc,
 * teal light channels (T0 by day, T1 at dusk) in carbon reveals: Allee ±3.3, spokes, plaza rings
 * r 32 / 21.9, and a zone-boundary ring r 21.6 in every lobe. The deck opens over the cooling-air
 * intake pits (landscape/intakes.ts). Rim band in ceramic panels with an alu coping and a teal
 * line; Landedeck with docking rings and chevrons; Glasbalkon and Kanzeln on alu frames;
 * ceramic bollards with warm slots (dark by day, T1 at dusk).
 */
export interface DeckHandles {
  /** spoke inlay meshes by zone id (material swapped for the objective) */
  spokeInlays: Map<string, THREE.Mesh>;
  inlayTeal: THREE.Material;
  inlayOrange: THREE.Material;
  /** bollard lamp slots (own material): off by day, warm white at dusk (dusk.ts) */
  lampHeads: THREE.MeshStandardMaterial;
}

const Y_PATH = 0.02;
const Y_SPOKE = 0.03;
const Y_INLAY = 0.045;
const TEAL = 0x2dd4bf;

/** The deck top with holes over the intake pits (discarded in the shader; the collider stays: you walk on the grille). */
class HoledDeckMaterial extends DeckMaterial {
  readonly holes = { value: INTAKES.map((f) => new THREE.Vector3(f.x, f.z, f.r + INTAKE_RIM - 0.01)) };
  override onBeforeCompile(sh: THREE.WebGLProgramParametersWithUniforms): void {
    super.onBeforeCompile(sh);
    sh.uniforms.uHoles = this.holes;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uHoles[${INTAKES.length}];`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
for (int i = 0; i < ${INTAKES.length}; i++) { vec2 hd = vTpW.xz - uHoles[i].xy; if (dot(hd, hd) < uHoles[i].z * uHoles[i].z) discard; }`,
      );
  }
  override customProgramCacheKey(): string {
    return 'emai-deck-holes';
  }
}

/**
 * W6: async with an optional `step` (the island passes `ctx.yield`): the main thread is handed back
 * between the deck's sections, so the deck is no single 280 ms task at 4× CPU.
 */
export async function buildDeck(ctx: ZoneContext, tex: IslandTextures, step: () => Promise<void> = () => Promise.resolve()): Promise<DeckHandles> {
  const M = ctx.materials;
  const root = ctx.root;
  const batch = sharedBatch(ctx);
  const teal = M.light(TEAL);

  // ── deck top (visual + collider) ──────────────────────────────────────────
  const fixed = (r: number) => () => r;
  const lerpOut = (r0: number, t: number) => (b: number) => r0 + (outlineRadius(b) - r0) * t;
  const rings: PolarRing[] = [
    { r: fixed(2.05), n: 90 },
    { r: fixed(5), n: 90 },
    { r: fixed(9), n: 180 },
    { r: fixed(14), n: 180 },
    { r: fixed(20), n: 360 },
    { r: fixed(27), n: 360 },
    { r: fixed(34), n: 720 },
    { r: fixed(42), n: 720 },
    { r: fixed(50), n: 720 },
    { r: fixed(58), n: 720 },
    { r: fixed(66), n: 720 },
    { r: fixed(74), n: 720 },
    { r: lerpOut(74, 0.5), n: 1440 },
    { r: lerpOut(74, 1), n: 1440 },
  ];
  const d = M.deckPanel;
  const deckMat = new HoledDeckMaterial(d.map, d.normal, { color: 0xc3beb8, roughness: 0.82, metalness: 0.05 });
  deckMat.name = 'island:deck';
  ctx.onDispose(() => deckMat.dispose());
  const top = new THREE.Mesh(polarMesh(rings, 0, 24), deckMat);
  top.name = 'island:deck-top';
  top.receiveShadow = true;
  root.add(top);
  ctx.freezeStatic(top);
  ctx.physics.addStaticTrimesh(top, { surface: 'concrete', fixInternalEdges: true });

  await step();
  // ── rim band: ceramic panels, alu coping, a teal line in a carbon reveal ──
  const N = 1440;
  const ol = outlineSamples(N);
  {
    const pos: number[] = [],
      idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const p = ol[i % N];
      pos.push(p.x, -0.02, p.z, p.x, -ISLAND.deckThickness, p.z);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2,
        b = a + 1,
        c = a + 2,
        e = a + 3;
      idx.push(a, b, c, c, b, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const fn = new THREE.Vector3().subVectors(new THREE.Vector3(pos[3], pos[4], pos[5]), new THREE.Vector3(pos[0], pos[1], pos[2])).cross(new THREE.Vector3(pos[6] - pos[0], pos[7] - pos[1], pos[8] - pos[2]));
    if (fn.x * ol[0].nx + fn.z * ol[0].nz < 0) {
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      g.setIndex(idx);
      g.computeVertexNormals();
    }
    const rim = new THREE.Mesh(g, M.hullWarm);
    rim.name = 'island:rim-band';
    rim.castShadow = true;
    rim.receiveShadow = true;
    root.add(markStatic(rim));
    // alu coping on the edge and a carbon reveal with a teal line 0.4 m down
    const loop = (inset: number, y: number): THREE.Vector3[] => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < N; i += 2) pts.push(new THREE.Vector3(ol[i].x - ol[i].nx * inset, y, ol[i].z - ol[i].nz * inset));
      return pts;
    };
    batch.add(M.brushedAlu, sweep(loop(0.03, -0.04), [[-0.05, -0.05], [0.05, -0.05], [0.05, 0.035], [-0.05, 0.035]], true), { name: 'alu' });
    batch.add(M.carbon, sweep(loop(-0.015, -0.42), [[-0.02, -0.07], [0.02, -0.07], [0.02, 0.07], [-0.02, 0.07]], true), { name: 'carbon' });
    batch.add(teal, sweep(loop(-0.03, -0.42), [[-0.012, -0.03], [0.012, -0.03], [0.012, 0.03], [-0.012, 0.03]], true), { name: 'teal-lines' });
  }

  await step();
  // ── keel ceiling (y −4, r 2 … 31: seen from the Kielraum) and the oculus shaft ──
  {
    const ceil = polarMesh(
      [
        { r: fixed(2.05), n: 48 },
        { r: fixed(16), n: 96 },
        { r: fixed(31), n: 192 },
      ],
      -ISLAND.deckThickness,
      12,
      true,
    );
    const m = new THREE.Mesh(ceil, M.hullWarm);
    m.name = 'island:keel-ceiling';
    root.add(markStatic(m));
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.05, ISLAND.deckThickness, 40, 1, true), M.standard({ color: 0x1c1917, roughness: 0.6, metalness: 0.3, side: THREE.BackSide }));
    shaft.position.y = -ISLAND.deckThickness / 2;
    root.add(markStatic(shaft));
  }

  await step();
  // ── paths: runway tone, flush alu kerbs ─────────────────────────────────
  const pathMat = M.deckTone(0x8f8a84, 0.8, { polygonOffset: 1 });
  const pathTop = M.deckTone(0x8f8a84, 0.8, { polygonOffset: 2 });
  {
    const ring = new THREE.Mesh(annulus(PATHS.ring.inner, PATHS.ring.outer, 0, 360, Y_PATH, 360, 4, 1, true), pathMat);
    ring.receiveShadow = true;
    ring.name = 'island:ring-path';
    root.add(markStatic(ring));
    const strips: THREE.BufferGeometry[] = [];
    const stripB = (b: number, r0: number, r1: number, w: number): THREE.BufferGeometry => {
      const [dx, dz] = bearingDir(b);
      return groundStrip(dx * r0, dz * r0, dx * r1, dz * r1, w, Y_SPOKE, 4);
    };
    for (const p of ZONE_PLOTS) strips.push(stripB(p.bearing, PATHS.plazaRadius - 0.5, PATHS.spoke.to + 0.6, PATHS.spoke.width));
    strips.push(stripB(0, PATHS.plazaRadius - 0.5, PATHS.northSpoke.to, PATHS.northSpoke.width));
    strips.push(stripB(180, PATHS.plazaRadius - 0.5, PATHS.avenue.to + 1.5, PATHS.avenue.width));
    for (const b of ISLAND.kanzeln.bearings) strips.push(stripB(b, PATHS.kanzelStub.from - 0.3, PATHS.kanzelStub.to, PATHS.kanzelStub.width));
    const spokes = new THREE.Mesh(merge(strips), pathTop);
    spokes.receiveShadow = true;
    spokes.name = 'island:spokes';
    root.add(markStatic(spokes));
  }
  {
    const kerbMat = M.standard({ color: 0xb4aea8, roughness: 0.58, metalness: 0.75, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    const kerbs: THREE.BufferGeometry[] = [];
    const edge = (b: number, r0: number, r1: number, w: number): void => {
      const [dx, dz] = bearingDir(b);
      const [tx, tz] = bearingDir(b + 90);
      for (const s of [-1, 1]) {
        const o = s * (w / 2 - 0.06);
        kerbs.push(groundStrip(dx * r0 + tx * o, dz * r0 + tz * o, dx * r1 + tx * o, dz * r1 + tz * o, 0.12, Y_SPOKE + 0.003, 1));
      }
    };
    for (const p of ZONE_PLOTS) {
      edge(p.bearing, PATHS.plazaRadius, PATHS.ring.inner, PATHS.spoke.width);
      edge(p.bearing, PATHS.ring.outer, PATHS.spoke.to, PATHS.spoke.width);
    }
    edge(0, PATHS.plazaRadius, PATHS.ring.inner, PATHS.northSpoke.width);
    edge(0, PATHS.ring.outer, PATHS.northSpoke.to - 0.5, PATHS.northSpoke.width);
    edge(180, PATHS.plazaRadius, PATHS.ring.inner, PATHS.avenue.width);
    edge(180, PATHS.ring.outer, PATHS.avenue.to, PATHS.avenue.width);
    for (const b of ISLAND.kanzeln.bearings) edge(b, PATHS.kanzelStub.from, PATHS.kanzelStub.to - 1, PATHS.kanzelStub.width);
    kerbs.push(annulus(PATHS.ring.inner, PATHS.ring.inner + 0.12, 0, 360, Y_PATH + 0.003, 360));
    kerbs.push(annulus(PATHS.ring.outer - 0.12, PATHS.ring.outer, 0, 360, Y_PATH + 0.003, 360));
    const kerbMesh = new THREE.Mesh(merge(kerbs), kerbMat);
    kerbMesh.name = 'island:kerbs';
    kerbMesh.receiveShadow = true;
    root.add(markStatic(kerbMesh));
  }

  await step();
  // ── plaza (r 8.6 … 32): turbine disc ──────────────────────────────────────
  {
    const g = annulus(8.6, PATHS.plazaRadius, 0, 360, Y_PATH + 0.002, 240, 1, 6);
    const p = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 64 + 0.5, -p.getZ(i) / 64 + 0.5);
    const plaza = new THREE.Mesh(
      g,
      M.standard({ map: tex.plaza, normalMap: tex.plazaN, normalScale: new THREE.Vector2(0.7, 0.7), color: 0xd2cdc7, roughness: 0.8, metalness: 0.02, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
    );
    plaza.name = 'island:plaza';
    plaza.receiveShadow = true;
    root.add(plaza);
    ctx.freezeStatic(plaza);
    // teal rings at the plaza edge (r 32) and inside the bench ring (r 21.9), in carbon reveals
    for (const r of [PATHS.plazaRadius - 0.35, 21.9]) {
      batch.add(M.carbon, flatRing(0, 0, r - 0.08, r + 0.08, Y_PATH + 0.006, 240), { name: 'carbon' });
      batch.add(teal, flatRing(0, 0, r - 0.035, r + 0.035, Y_PATH + 0.012, 240), { name: 'teal-lines' });
    }
  }

  await step();
  // ── light channels: spokes (objective = orange), Allee ±3.3, north spoke ──
  const inlayTeal = teal;
  const inlayOrange = M.light(0xff6700);
  const spokeInlays = new Map<string, THREE.Mesh>();
  for (const p of ZONE_PLOTS) {
    const [dx, dz] = bearingDir(p.bearing);
    const r0 = PADS.hubRadius + PADS.diameter / 2 + 0.2;
    const g = groundStrip(dx * r0, dz * r0, dx * (PATHS.spoke.to - 0.4), dz * (PATHS.spoke.to - 0.4), 0.09, Y_INLAY, 1);
    const m = new THREE.Mesh(g, inlayTeal);
    m.name = `island:inlay:${p.id}`;
    // merged with the light lines; the objective swaps `material` on the detached source, which
    // recolours its range of the merged mesh (statics.ts recolour proxy)
    m.userData.recolor = true;
    root.add(markStatic(m));
    spokeInlays.set(p.id, m);
    batch.add(M.carbon, groundStrip(dx * r0, dz * r0, dx * (PATHS.spoke.to - 0.4), dz * (PATHS.spoke.to - 0.4), 0.2, Y_INLAY - 0.006, 1), { name: 'carbon' });
  }
  {
    const lines: [number, number, number, number][] = [];
    for (const o of [-3.3, 3.3]) {
      lines.push([o, PATHS.plazaRadius + 0.5, o, PATHS.ring.inner - 0.3]);
      lines.push([o, PATHS.ring.outer + 0.3, o, PATHS.avenue.to - 0.5]);
    }
    const [dx, dz] = bearingDir(0);
    lines.push([dx * 33, dz * 33, dx * (PATHS.ring.inner - 0.3), dz * (PATHS.ring.inner - 0.3)]);
    // Phase 7 (WP12, §2.3): the north spoke runs through the Schauhalle's central aisle: no inlay inside its rect
    lines.push([dx * (PATHS.ring.outer + 0.3), dz * (PATHS.ring.outer + 0.3), dx * (-HALL_RECT.z1 - 0.6), dz * (-HALL_RECT.z1 - 0.6)]);
    lines.push([dx * (-HALL_RECT.z0 + 0.6), dz * (-HALL_RECT.z0 + 0.6), dx * 84.5, dz * 84.5]);
    for (const [x0, z0, x1, z1] of lines) {
      batch.add(M.carbon, groundStrip(x0, z0, x1, z1, 0.2, Y_INLAY - 0.006, 1), { name: 'carbon' });
      batch.add(teal, groundStrip(x0, z0, x1, z1, 0.09, Y_INLAY, 1), { name: 'teal-lines' });
    }
  }

  await step();
  // ── plot pads: lighter composite, alu kerb, zone-boundary teal ring r 21.6, lobe seam ──
  {
    const pads: THREE.BufferGeometry[] = [];
    for (const p of ZONE_PLOTS) {
      pads.push(new THREE.CircleGeometry(p.radius - 0.4, 96).rotateX(-Math.PI / 2).translate(p.anchor[0], Y_PATH - 0.006, p.anchor[2]));
      batch.add(M.standard({ color: 0xb4aea8, roughness: 0.58, metalness: 0.75, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }), flatRing(p.anchor[0], p.anchor[2], p.radius - 0.32, p.radius - 0.2, Y_PATH + 0.002, 160), { name: 'kerb-ring' });
      batch.add(M.carbon, flatRing(p.anchor[0], p.anchor[2], 21.6 - 0.07, 21.6 + 0.07, Y_PATH + 0.004, 160), { name: 'carbon' });
      batch.add(teal, flatRing(p.anchor[0], p.anchor[2], 21.6 - 0.04, 21.6 + 0.04, Y_PATH + 0.01, 160), { name: 'teal-lines' });
      // the seam where the lobe joins the main disc (r 85 arc inside the lobe)
      const half = Math.asin(21.9 / 85) / DEG;
      batch.add(M.carbon, annulus(ISLAND.radius - 0.06, ISLAND.radius + 0.06, p.bearing - half, p.bearing + half, Y_PATH + 0.003, 48), { name: 'carbon' });
    }
    const padMesh = new THREE.Mesh(merge(pads), M.deckTone(0xcac5bf, 0.84, { polygonOffset: 2 }));
    padMesh.name = 'island:plot-pads';
    padMesh.receiveShadow = true;
    root.add(markStatic(padMesh));
  }

  await step();
  // ── Landedeck: composite, teal docking rings r 8.4 / 8.7, white chevrons at the dock ──
  {
    const ld = ISLAND.landedeck;
    const disc = new THREE.CircleGeometry(ld.radius - 0.25, 72).rotateX(-Math.PI / 2).translate(ld.center[0], Y_SPOKE + 0.002, ld.center[2]);
    const m = new THREE.Mesh(disc, M.deckTone(0xd0cbc5, 0.84, { polygonOffset: 3 }));
    m.receiveShadow = true;
    m.name = 'island:landing-floor';
    root.add(markStatic(m));
    for (const r of [8.4, 8.7]) {
      batch.add(M.carbon, flatRing(ld.center[0], ld.center[2], r - 0.06, r + 0.06, Y_SPOKE + 0.006, 120, -Math.PI * 0.95, Math.PI * 0.95), { name: 'carbon' });
      batch.add(teal, flatRing(ld.center[0], ld.center[2], r - 0.025, r + 0.025, Y_SPOKE + 0.011, 120, -Math.PI * 0.95, Math.PI * 0.95), { name: 'teal-lines' });
    }
    // chevrons pointing from the dock (east, the pod) into the deck
    const chev = M.standard({ color: 0xf2efeb, roughness: 0.78, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    for (let k = 0; k < 3; k++) {
      const cx = 5.6 - k * 0.9;
      for (const s of [-1, 1]) {
        const g = new THREE.PlaneGeometry(0.75, 0.16).rotateX(-Math.PI / 2).rotateY(s * 0.62).translate(cx, Y_SPOKE + 0.012, ld.center[2] + 2.0 + s * 0.24);
        batch.add(chev, g, { name: 'chevrons' });
      }
    }
  }

  await step();
  // ── Glasbalkon (N): glass floor on an alu frame grid (1.5 m), neck, ceramic underside ──
  {
    const gb = ISLAND.glasbalkon;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(gb.radius - 0.3, gb.radius - 0.3, 0.06, 64), M.standard({ color: 0xd6d3d1, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.14, depthWrite: false, envMapIntensity: 0.9 }));
    glass.position.set(gb.center[0], -0.04, gb.center[2]);
    glass.renderOrder = 2;
    root.add(markStatic(glass));
    ctx.physics.addStaticCylinder({ radius: gb.radius, height: 0.1, position: [gb.center[0], -0.05, gb.center[2]], surface: 'glass' });
    const R = gb.radius - 0.3;
    batch.add(M.brushedAlu, new THREE.TorusGeometry(gb.radius - 0.15, 0.13, 8, 72).rotateX(Math.PI / 2).translate(gb.center[0], -0.08, gb.center[2]), { name: 'alu' });
    for (let x = -R + 1.5; x < R; x += 1.5) {
      const l = 2 * Math.sqrt(Math.max(0, R * R - x * x));
      batch.add(M.brushedAlu, new THREE.BoxGeometry(0.06, 0.12, l).translate(gb.center[0] + x, -0.13, gb.center[2]), { name: 'alu' });
      batch.add(M.brushedAlu, new THREE.BoxGeometry(l, 0.12, 0.06).translate(gb.center[0], -0.13, gb.center[2] + x), { name: 'alu' });
    }
    batch.add(M.hull, new THREE.CylinderGeometry(0.55, 0.55, 0.16, 24).translate(gb.center[0], -0.14, gb.center[2]), { name: 'hull' });
    batch.add(M.deckTone(0x8f8a84, 0.8), new THREE.BoxGeometry(4.6, 0.12, 3.2).translate(0, Y_PATH - 0.05, -85.6), { name: 'neck' });
    ctx.physics.addStaticBox({ size: [4.6, 0.2, 3.2], position: [0, -0.1, -85.6] });
    batch.add(M.hull, rbox(4.6, 1.2, 3.2).translate(0, -0.72, -85.6), { name: 'hull' });
  }

  await step();
  // ── Aussichtskanzeln: glass floors on an alu ring girder over the trim rotors ──
  {
    const glassMat = M.standard({ color: 0xd6d3d1, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.12, depthWrite: false, envMapIntensity: 0.9 });
    const glass: THREE.BufferGeometry[] = [];
    const R = ISLAND.kanzeln.radius;
    const up = new THREE.Vector3(0, 1, 0);
    const beam = (p: THREE.Vector3, q: THREE.Vector3, w: number, h: number, mat: THREE.Material): void => {
      const len = p.distanceTo(q);
      const bx = rbox(w, h, len);
      bx.applyMatrix4(new THREE.Matrix4().lookAt(p, q, up));
      bx.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
      batch.add(mat, bx, { name: 'kanzel' });
    };
    for (const b of ISLAND.kanzeln.bearings) {
      const c = polar(b, ISLAND.kanzeln.ring);
      glass.push(new THREE.CylinderGeometry(R - 0.25, R - 0.25, 0.06, 48).translate(c[0], -0.04, c[2]));
      batch.add(M.brushedAlu, new THREE.TorusGeometry(R - 0.12, 0.12, 8, 64).rotateX(Math.PI / 2).translate(c[0], -0.08, c[2]), { name: 'alu' });
      batch.add(M.hull, new THREE.CylinderGeometry(R + 0.05, R + 0.05, 0.42, 64, 1, true).translate(c[0], -0.3, c[2]), { name: 'hull' });
      batch.add(M.brushedAlu, new THREE.TorusGeometry(R - 0.05, 0.08, 6, 64).rotateX(Math.PI / 2).translate(c[0], -0.52, c[2]), { name: 'alu' });
      // floor grid under the glass (1.5 m)
      for (const o of [-1.5, 0, 1.5]) {
        const l = 2 * Math.sqrt(Math.max(0, (R - 0.25) ** 2 - o * o));
        batch.add(M.brushedAlu, new THREE.BoxGeometry(0.05, 0.1, l).translate(c[0] + o, -0.12, c[2]), { name: 'alu' });
        batch.add(M.brushedAlu, new THREE.BoxGeometry(l, 0.1, 0.05).translate(c[0], -0.12, c[2] + o), { name: 'alu' });
      }
      const [dx, dz] = bearingDir(b);
      const [tx, tz] = bearingDir(b + 90);
      const at = (radial: number, lateral: number, y: number): THREE.Vector3 => new THREE.Vector3(dx * radial + tx * lateral, y, dz * radial + tz * lateral);
      for (const sgn of [-1, 1]) {
        const o = sgn * (R + 0.12);
        beam(at(84.5, o, -0.32), at(ISLAND.kanzeln.ring + 0.4, o, -0.32), 0.24, 0.42, M.hull);
        beam(at(84.7, o, -3.4), at(ISLAND.kanzeln.ring, o, -0.5), 0.16, 0.24, M.brushedAlu);
      }
      ctx.physics.addStaticCylinder({ radius: R, height: 0.12, position: [c[0], -0.06, c[2]], surface: 'metal' });
      // floor plaque at the entrance: dark glass with an alu frame
      const tn = ISLAND.kanzeln.bearings.indexOf(b) + 1;
      const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.03, 0.44), M.darkGlass);
      plaque.position.copy(at(85.9, 0, 0.015));
      plaque.rotation.y = Math.atan2(dx, dz) + Math.PI;
      plaque.userData.noCollide = true;
      root.add(markStatic(plaque));
      batch.add(M.brushedAlu, new THREE.BoxGeometry(1.78, 0.025, 0.52).rotateY(plaque.rotation.y).translate(plaque.position.x, 0.008, plaque.position.z), { name: 'alu' });
      const lineA = ctx.text3d.create({ text: { de: `TRIMMROTOR T${tn} · UNTER DIR`, en: `TRIM ROTOR T${tn} · BELOW YOU` }, font: 'mono-medium', size: 0.068, color: 0xe7e5e4, anchorX: 'center', anchorY: 'middle', letterSpacing: 0.06, position: [0, 0.02, -0.08] }, plaque);
      lineA.rotation.x = -Math.PI / 2;
      cullTinyText(ctx, lineA);
      const lineB = ctx.text3d.create({ text: { de: 'Feinregelung der Lage, neben M1–M6 · FIKTION', en: 'Fine attitude control, beside M1–M6 · FICTION' }, font: 'mono', size: 0.043, color: 0xa8a29e, anchorX: 'center', anchorY: 'middle', letterSpacing: 0.02, position: [0, 0.02, 0.1] }, plaque);
      lineB.rotation.x = -Math.PI / 2;
      cullTinyText(ctx, lineB);
    }
    const gm = new THREE.Mesh(merge(glass), glassMat);
    gm.renderOrder = 2;
    root.add(markStatic(gm));
  }

  await step();
  // ── bollards: tapered ceramic posts with a warm slot (dark by day, T1 at dusk) ──
  const lampHeads = new THREE.MeshStandardMaterial({ color: 0x151312, emissive: 0xffe9cc, emissiveIntensity: 0, roughness: 0.25, metalness: 0.1 });
  lampHeads.name = 'island:lamp-heads';
  lampHeads.userData.noEnrich = true; // dusk.ts drives it
  ctx.onDispose(() => lampHeads.dispose());
  {
    const spots = bollardSpots();
    const post = merge([
      paint(new THREE.CylinderGeometry(0.12, 0.14, 0.06, 12).translate(0, 0.03, 0), 0x1c1917),
      paint(new THREE.CylinderGeometry(0.075, 0.105, 0.84, 12).translate(0, 0.48, 0), 0xd6d3d1),
      paint(new THREE.CylinderGeometry(0.082, 0.078, 0.04, 12).translate(0, 0.92, 0), 0xc9c4bf),
    ]);
    const slot = new THREE.BoxGeometry(0.03, 0.26, 0.17).translate(0, 0.66, 0);
    const posts = new THREE.InstancedMesh(post, M.standard({ vertexColors: true, roughness: 0.45, metalness: 0.12 }), spots.length);
    const heads = new THREE.InstancedMesh(slot, lampHeads, spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      // the slot faces the path it lights
      m4.makeRotationY(Math.atan2(x, z)).setPosition(x, 0, z);
      posts.setMatrixAt(i, m4);
      heads.setMatrixAt(i, m4);
    });
    posts.computeBoundingSphere();
    heads.computeBoundingSphere();
    posts.name = 'island:bollards';
    root.add(markStatic(posts), heads);
    ctx.freezeStatic(heads);
  }

  void circleProfile;
  void arcPts;
  void flatStrip;
  return { spokeInlays, inlayTeal, inlayOrange, lampHeads };
}

/** Path bollard positions (x, z): spokes, north spoke, Kanzel stubs and the outer edge of the ring path. */
export function bollardSpots(): [number, number][] {
  const spots: [number, number][] = [];
  const along = (b: number, r0: number, r1: number, w: number, step: number): void => {
    const [dx, dz] = bearingDir(b);
    const [tx, tz] = bearingDir(b + 90);
    for (let r = r0; r <= r1 + 0.01; r += step)
      for (const s of [-1, 1]) {
        const o = s * (w / 2 + 0.45);
        spots.push([dx * r + tx * o, dz * r + tz * o]);
      }
  };
  for (const p of ZONE_PLOTS) {
    along(p.bearing, 35, 41, PATHS.spoke.width, 6);
    along(p.bearing, 51.5, 55.5, PATHS.spoke.width, 4);
  }
  along(0, 36, 41, PATHS.northSpoke.width, 5);
  along(0, 52, 82, PATHS.northSpoke.width, 7.5);
  // Phase 7 (WP12, §2.3): none inside the Schauhalle's rect (it stands on the north spoke)
  for (let i = spots.length - 1; i >= 0; i--) if (inHallRect(spots[i][0], spots[i][1], 0.6)) spots.splice(i, 1);
  for (const b of ISLAND.kanzeln.bearings) along(b, 54, 80, PATHS.kanzelStub.width, 8.5);
  const crossings = [...ZONE_PLOTS.map((p) => p.bearing), 0, 180, ...ISLAND.kanzeln.bearings];
  for (let b = 3.75; b < 360; b += 7.5) {
    if (crossings.some((c) => Math.abs(((b - c + 540) % 360) - 180) < 6)) continue;
    const p = polar(b, PATHS.ring.outer + 0.5);
    spots.push([p[0], p[2]]);
  }
  return spots;
}
