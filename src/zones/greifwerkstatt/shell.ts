/**
 * Workshop shell: dark riveted floor islands under the stations (one merged mesh, 1 m tiles via
 * planar UVs), hazard-tape rings where the giant arm works and round the test cabinet (one merged
 * mesh), teal wayfinding inlays from the gate to the three stations, and the entrance sign.
 */
import * as THREE from 'three';
import { ARM_BASE, CRADLE } from './giantArm';
import { mulberry32 } from '@/core/zones';
import { type Ctx, merge, planarUv } from './shared';
import { metreUv, type Look } from './look';

/** flat ring (annulus) in the x/z plane with hazard UVs: u = arc length / band width (square stripes) */
function hazardRing(cx: number, cz: number, r0: number, r1: number, y: number, seg = 64): THREE.BufferGeometry {
  const pos: number[] = [],
    uv: number[] = [],
    nor: number[] = [],
    idx: number[] = [];
  const band = r1 - r0;
  const circ = 2 * Math.PI * ((r0 + r1) / 2);
  const tiles = Math.round(circ / band / 2) * 2;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const c = Math.cos(a),
      s = Math.sin(a);
    pos.push(cx + c * r0, y, cz + s * r0, cx + c * r1, y, cz + s * r1);
    nor.push(0, 1, 0, 0, 1, 0);
    uv.push((i / seg) * tiles, 0, (i / seg) * tiles, 1);
    if (i < seg) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** straight hazard strip from (x0, z0) to (x1, z1) */
function hazardStrip(x0: number, z0: number, x1: number, z1: number, w: number, y: number): THREE.BufferGeometry {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const g = new THREE.PlaneGeometry(len, w).rotateX(-Math.PI / 2);
  const uvs = g.getAttribute('uv');
  for (let i = 0; i < uvs.count; i++) uvs.setX(i, uvs.getX(i) * Math.round(len / w));
  g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  return g;
}

/** thin inlay strip along a polyline */
function inlay(points: [number, number][], w: number, y: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i],
      [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.BoxGeometry(len + w, 0.012, w);
    g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    out.push(g);
  }
  return out;
}

/** height and radius of the raised workshop floor (m) */
export const FLOOR_H = 0.08;
export const FLOOR_R = 19.4;
const HZ_Y = FLOOR_H + 0.004;

export function buildShell(ctx: Ctx, look: Look): void {
  const M = ctx.materials;

  // ── one workshop floor (exterior: it shapes the plot from the hub) ──────────
  // a raised 8 cm disc of deck composite (ART-V2 §6.0), carbon work-cell plates with alu edges under
  // the stations, an alu rim ring
  const floorTex = M.canvasTexture(512, 512, drawDeckFloor, { anisotropy: 8 });
  ctx.onDispose(() => floorTex.dispose());
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.82, metalness: 0.05 });
  ctx.onDispose(() => floorMat.dispose());
  const floor = new THREE.Mesh(planarUv(new THREE.CylinderGeometry(FLOOR_R, FLOOR_R, FLOOR_H, 120).translate(0, FLOOR_H / 2, 0), 1 / 6), floorMat);
  floor.receiveShadow = true;
  ctx.groups.exterior.add(floor);
  ctx.physics.addStaticCylinder({ radius: FLOOR_R, height: FLOOR_H, position: [0, FLOOR_H / 2, 0] });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(FLOOR_R + 0.02, 0.055, 6, 160).rotateX(Math.PI / 2).translate(0, FLOOR_H - 0.03, 0), look.alu);
  rim.receiveShadow = true;
  ctx.groups.exterior.add(rim);
  // carbon work-cell plates (1 cm proud) with alu edges: station A stage, B bench, C cabinet, giant arm
  {
    const y = FLOOR_H + 0.006;
    const plates: THREE.BufferGeometry[] = [];
    const edges: THREE.BufferGeometry[] = [];
    const rect = (x0: number, z0: number, x1: number, z1: number): void => {
      plates.push(new THREE.BoxGeometry(x1 - x0, 0.012, z1 - z0).translate((x0 + x1) / 2, y, (z0 + z1) / 2));
      const w = 0.05;
      edges.push(
        new THREE.BoxGeometry(x1 - x0 + w, 0.02, w).translate((x0 + x1) / 2, y + 0.002, z0),
        new THREE.BoxGeometry(x1 - x0 + w, 0.02, w).translate((x0 + x1) / 2, y + 0.002, z1),
        new THREE.BoxGeometry(w, 0.02, z1 - z0).translate(x0, y + 0.002, (z0 + z1) / 2),
        new THREE.BoxGeometry(w, 0.02, z1 - z0).translate(x1, y + 0.002, (z0 + z1) / 2),
      );
    };
    const disc = (x: number, z: number, r: number): void => {
      plates.push(new THREE.CylinderGeometry(r, r, 0.012, 64).translate(x, y, z));
      edges.push(new THREE.TorusGeometry(r, 0.03, 4, 96).rotateX(Math.PI / 2).translate(x, y + 0.006, z));
    };
    rect(2.6, -7.2, 13.4, -3.6); // A: the stage under the screen wall
    rect(-9.0, 2.9, -5.0, 5.4); // B: the bench
    rect(4.2, 3.95, 9.8, 8.05); // C: the test cabinet
    disc(ARM_BASE.x, ARM_BASE.z, 3.0); // the giant arm
    disc(CRADLE.x, CRADLE.z, 2.15); // its cradle
    const pm = new THREE.Mesh(merge(plates.map((g) => (g.index ? g.toNonIndexed() : g))), look.carbon);
    pm.receiveShadow = true;
    ctx.groups.exterior.add(pm);
    const em = new THREE.Mesh(merge(edges.map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; })), look.alu);
    ctx.groups.exterior.add(em);
  }
  buildCanopy(ctx, look);

  // floor stencil at the entrance: worn paint, read from the gate
  const stencilTex = M.canvasTexture(1024, 256, (g, w, h) => drawStencil(g, w, h, ctx.t('sign.stencil')), { anisotropy: 8 });
  stencilTex.wrapS = stencilTex.wrapT = THREE.ClampToEdgeWrapping;
  ctx.onDispose(() => stencilTex.dispose());
  ctx.i18n.onChange(() => {
    drawStencil(stencilTex.image.getContext('2d') as CanvasRenderingContext2D, 1024, 256, ctx.t('sign.stencil'));
    stencilTex.needsUpdate = true;
  });
  const stencilMat = new THREE.MeshStandardMaterial({ map: stencilTex, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  ctx.onDispose(() => stencilMat.dispose());
  const stencil = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.8).rotateX(-Math.PI / 2), stencilMat);
  stencil.position.set(0, FLOOR_H + 0.002, 17.3);
  stencil.receiveShadow = true;
  // detail tier: it is read at the gate (inside the detail ring); from the plaza it would be one more
  // exterior draw (plan §5.5: each lobe exterior ≤ 10 at the plaza)
  ctx.groups.detail.add(stencil);

  // ── hazard tape (orange stays small: two thin rings + the cabinet border) ──
  const hz: THREE.BufferGeometry[] = [
    hazardRing(ARM_BASE.x, ARM_BASE.z, 2.5, 2.72, HZ_Y),
    hazardRing(CRADLE.x, CRADLE.z, 1.72, 1.92, HZ_Y),
  ];
  const cx0 = 4.55,
    cx1 = 9.45,
    cz0 = 4.3,
    cz1 = 7.7,
    hw = 0.18;
  hz.push(hazardStrip(cx0, cz0, cx1, cz0, hw, HZ_Y), hazardStrip(cx0, cz1, cx1, cz1, hw, HZ_Y));
  hz.push(hazardStrip(cx0, cz0 - hw / 2, cx0, cz1 + hw / 2, hw, HZ_Y), hazardStrip(cx1, cz0 - hw / 2, cx1, cz1 + hw / 2, hw, HZ_Y));
  const hazard = new THREE.Mesh(merge(hz), M.hazard(1));
  hazard.receiveShadow = true;
  ctx.groups.exterior.add(hazard);

  // ── teal wayfinding inlays (gate → EMI → stations): unlit T0 lines, below the bloom band ─
  const y = FLOOR_H + 0.006;
  const lines = [
    ...inlay([[0, 19.1], [0, 15.6]], 0.04, y),
    ...inlay([[0, 12.4], [3.4, 7.2], [6.6, 1.6]], 0.04, y),
    ...inlay([[0, 12.4], [-3.6, 9.4], [-5.2, 8.6]], 0.04, y),
    ...inlay([[0, 12.4], [5.2, 10.8], [9.8, 9.4]], 0.04, y),
    ...inlay([[-0.6, 12.6], [-4.4, 4.4], [-6.0, -6.6]], 0.03, y),
  ];
  const inl = new THREE.Mesh(merge(lines), look.light('teal', 0));
  ctx.groups.detail.add(inl);

  // ── entrance sign: the core board re-dressed (ART-V2 §6.0): dark-glass face, alu side rails, alu post,
  // carbon foot — no black slab on a stick ─────────────────────────────────
  const sign = ctx.text3d.sign(
    {
      eyebrow: ctx.i18n.text('sign.eyebrow'),
      title: ctx.i18n.text('sign.title'),
      body: ctx.i18n.text('sign.body'),
      width: 3.2,
      stand: true,
      position: [-4.6, 0, 18.2],
      rotationY: 0.42,
    },
    ctx.groups.detail,
  );
  let panelDone = false;
  for (const c of sign.children) {
    const m = c as THREE.Mesh;
    if (!m.isMesh) continue;
    const geo = m.geometry as THREE.BufferGeometry & { parameters?: { width?: number; height?: number; depth?: number } };
    if (geo.type === 'BoxGeometry' && !panelDone) {
      panelDone = true;
      m.material = look.darkGlass;
      const W = geo.parameters?.width ?? 3.2,
        D = geo.parameters?.depth ?? 0.08;
      for (const sx of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1, D + 0.03).translate(sx * (W / 2 + 0.03), 0.5, 0), look.alu);
        ctx.onDispose(() => rail.geometry.dispose());
        m.add(rail);
      }
    } else if (geo.type === 'CylinderGeometry') m.material = (geo.parameters?.height ?? 1) < 0.1 ? look.carbon : look.alu;
  }
}

/** deck composite: one 512² tile = 6 × 6 m, 3 × 1.5 m staggered panels, ±3 % panel albedo, one hatch */
function drawDeckFloor(g: CanvasRenderingContext2D, w: number, h: number): void {
  const px = w / 6;
  const rnd = mulberry32(303);
  g.fillStyle = '#c3beb8';
  g.fillRect(0, 0, w, h);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 1.5 : 0;
    for (let x = -off; x < 6; x += 3) {
      const v = Math.round((rnd() - 0.5) * 12);
      g.fillStyle = `rgb(${195 + v},${190 + v},${184 + v})`;
      g.fillRect(Math.round(x * px) + 1, Math.round(row * 1.5 * px) + 1, Math.round(3 * px) - 2, Math.round(1.5 * px) - 2);
    }
  }
  g.fillStyle = 'rgba(70,64,58,0.55)';
  for (let row = 0; row < 4; row++) {
    const y = Math.round(row * 1.5 * px);
    g.fillRect(0, y - 1, w, 2);
    const off = row % 2 ? 1.5 : 0;
    for (let x = -off; x <= 6; x += 3) g.fillRect(Math.round(x * px) - 1, y, 2, Math.round(1.5 * px));
  }
  g.strokeStyle = 'rgba(70,64,58,0.5)';
  g.lineWidth = 1;
  g.strokeRect(Math.round(4.2 * px), Math.round(3.4 * px), Math.round(0.4 * px), Math.round(0.4 * px));
}

/**
 * Curved ceramic canopy (ART-V2 §6.3): a half-vault band shell along the back rim behind the giant
 * arm, open toward the hub. Plan: an arc at r 20.6 from bearing −52° to −8° (0 = local −z, negative =
 * toward −x), section: vertical to 4.5 m, then a quarter circle (r 3) curving 3 m forward to 7.5 m.
 * Clearances (checked against giantArm.ts): ≥ 6 m from the arm base at the foot, ≥ 2.7 m behind the
 * seated / raised egg at the cradle (−1, −16), the arm works on the hub side of its base. No collider:
 * it stands outside the walkable floor (FLOOR_R 19.4). 2 draw calls (hull shell, alu/carbon trims merged).
 */
function buildCanopy(ctx: Ctx, look: Look): void {
  const R0 = 20.6,
    VERT = 4.5,
    LIP = 3.0,
    a0 = THREE.MathUtils.degToRad(-52),
    a1 = THREE.MathUtils.degToRad(-8);
  const prof: [number, number][] = [];
  prof.push([R0, 0], [R0, VERT * 0.5], [R0, VERT]);
  for (let i = 1; i <= 8; i++) {
    const t = (i / 8) * (Math.PI / 2);
    prof.push([R0 - LIP + LIP * Math.cos(t), VERT + LIP * Math.sin(t)]);
  }
  const SEG = 36;
  const pos: number[] = [],
    idx: number[] = [];
  // two skins (outer and inner, 0.18 m apart along the profile normal) + end caps → a solid shell
  const T = 0.18;
  const n2: [number, number][] = prof.map((p, i) => {
    const a = prof[Math.max(0, i - 1)],
      b = prof[Math.min(prof.length - 1, i + 1)];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dy / l, -dx / l]; // outward (away from the zone centre)
  });
  const P = prof.length;
  const vert = (r: number, y: number, ang: number): void => {
    pos.push(Math.sin(ang) * r, y, -Math.cos(ang) * r);
  };
  for (const skin of [0, 1])
    for (let k = 0; k <= SEG; k++) {
      const ang = a0 + ((a1 - a0) * k) / SEG;
      prof.forEach(([r, y], i) => {
        const off = skin ? -T : 0;
        vert(r + n2[i][0] * off, y + n2[i][1] * off, ang);
      });
    }
  const at = (skin: number, k: number, i: number): number => skin * (SEG + 1) * P + k * P + i;
  for (let k = 0; k < SEG; k++)
    for (let i = 0; i < P - 1; i++) {
      // outer skin faces out, inner skin faces the zone
      idx.push(at(0, k, i), at(0, k + 1, i), at(0, k, i + 1), at(0, k + 1, i), at(0, k + 1, i + 1), at(0, k, i + 1));
      idx.push(at(1, k, i), at(1, k, i + 1), at(1, k + 1, i), at(1, k + 1, i), at(1, k, i + 1), at(1, k + 1, i + 1));
    }
  for (const k of [0, SEG])
    for (let i = 0; i < P - 1; i++) {
      const f = k === 0;
      if (f) idx.push(at(0, k, i), at(0, k, i + 1), at(1, k, i), at(1, k, i), at(0, k, i + 1), at(1, k, i + 1));
      else idx.push(at(0, k, i), at(1, k, i), at(0, k, i + 1), at(1, k, i), at(1, k, i + 1), at(0, k, i + 1));
    }
  // lip edge
  for (let k = 0; k < SEG; k++) idx.push(at(0, k, P - 1), at(0, k + 1, P - 1), at(1, k, P - 1), at(1, k, P - 1), at(0, k + 1, P - 1), at(1, k + 1, P - 1));
  // two tones: the outer skin and edges in hull, the inner (hub-facing) skin a darker ceramic, so the
  // white giant arm reads against it (two draw calls via geometry groups would cost the same)
  const nOuter = SEG * (P - 1) * 6;
  const outerIdx = idx.filter((_, i) => Math.floor(i / 6) % 2 === 0 && i < nOuter * 2);
  const innerIdx = idx.filter((_, i) => Math.floor(i / 6) % 2 === 1 && i < nOuter * 2);
  const edgeIdx = idx.slice(nOuter * 2);
  const build = (ix: number[]): THREE.BufferGeometry => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(ix);
    const ng = g.toNonIndexed();
    g.dispose();
    ng.computeVertexNormals();
    return metreUv(ng);
  };
  const outerMat = look.hull.clone();
  outerMat.side = THREE.DoubleSide;
  outerMat.shadowSide = THREE.DoubleSide;
  const innerMat = look.hull.clone();
  innerMat.color.set(0x8f8a84);
  innerMat.side = THREE.DoubleSide;
  innerMat.shadowSide = THREE.DoubleSide;
  ctx.onDispose(() => {
    outerMat.dispose();
    innerMat.dispose();
  });
  const outerGeo = merge([build(outerIdx), build(edgeIdx)]);
  const shell = new THREE.Mesh(outerGeo, outerMat);
  shell.castShadow = true;
  shell.receiveShadow = true;
  shell.name = 'greifwerkstatt:canopy';
  ctx.groups.exterior.add(shell);
  const innerShell = new THREE.Mesh(build(innerIdx), innerMat);
  innerShell.receiveShadow = true;
  ctx.groups.exterior.add(innerShell);
  // trims: carbon reveal at the foot, alu lip, a teal T0 line under the lip (one carbon/alu merge, one line)
  const trims: THREE.BufferGeometry[] = [];
  const arc = (r: number, y: number, rad: number): THREE.BufferGeometry =>
    new THREE.TorusGeometry(r, rad, 6, 72, a1 - a0).rotateX(Math.PI / 2).rotateY(Math.PI / 2 - a0);
  trims.push(arc(R0 - LIP, VERT + LIP + 0.01, 0.07).translate(0, 0, 0));
  const alu = new THREE.Mesh(merge(trims.map((t) => t.toNonIndexed())), look.alu);
  ctx.groups.exterior.add(alu);
  const reveal = new THREE.Mesh(arc(R0 - T / 2, 0.12, 0.16), look.carbon);
  ctx.groups.exterior.add(reveal);
  const line = new THREE.Mesh(arc(R0 - LIP + 0.06, VERT + LIP - 0.21, 0.02), look.light('teal', 0));
  ctx.groups.exterior.add(line);
}

/** big worn floor stencil at the entrance */
function drawStencil(g: CanvasRenderingContext2D, w: number, h: number, text: string): void {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(28,25,23,0.62)';
  g.font = '700 150px "Space Grotesk", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 8);
  // wear: punch random holes into the paint
  const rnd = mulberry32(77);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    g.globalAlpha = 0.25 + rnd() * 0.6;
    g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 5, 1 + rnd() * 3);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
}
