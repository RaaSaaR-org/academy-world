/**
 * Station A „Gelenke" (Probieren → IK), GDD §7.3.
 *
 * A planar 3-link arm (2,0 / 1,6 / 1,0 m, ±160°) on a 1 m pedestal at local (8, 0, −7), moving in the
 * x-y plane in front of a 10 × 7 m backdrop. Phase 1 (joint mode): 1/2/3 select, A/D · ◀ ▶ · drag
 * rotate at ≤ 60°/s — the tip trail shows what forward kinematics does. Phase 2 (target mode, after
 * one ring or 45 s, key T): click the wall → CCD (≤ 12 iterations, joint limits) with every
 * iteration shown as a fading ghost, then the arm moves in joint space in 0.8 s. Out of reach and
 * singularities are reported honestly. Stamp: all three rings threaded, in any mode.
 */
import * as THREE from 'three';
import type { InfoCardSpec } from '@/core/zones';
import { COL, type Ctx, axle, box, clamp, h, kLabel, merge, paint, panelRoot, seg, setShadow, smoother } from './shared';
import { rbox, type Look } from './look';
import { type Angles, JOINT_LIMIT, LINKS, REACH, RING_HIT, SINGULAR_SIGMA, collides, fk, manipulability, segmentPointDistance, solveIk } from './kinematics';
import type { Sfx } from './sfx';
import { FLOOR_H } from './shell';

const BX = 8,
  BY = 1.0;
const ZL = [-7.0, -6.86, -6.74]; // link planes (front-most = link 3 = the tip plane)
const RING_Z = ZL[2];
const BACK_Z = -7.45; // close behind the arm plane: little parallax between grid and arm
const TRUSS_Y = 7.35;
export const RINGS: [number, number][] = [
  [2.2, 3.2],
  [-1.5, 2.4],
  [3.6, -0.2],
];
const OMEGA = Math.PI / 3; // 60°/s
const SND_ARM = { x: BX, y: BY + 1.8, z: RING_Z };
const SND_FLOOR = { x: BX, y: 0.3, z: RING_Z };
const GHOSTS = 12;
const TRAIL = 96;
const DEG = 180 / Math.PI;

export interface StationA {
  update(dt: number, elapsed: number): void;
  readonly done: boolean;
  /** debug: thread all rings via the real IK path (no shortcuts) */
  debugSolve(): Promise<void>;
  /** debug: simulate a target click at base-relative (x, y) */
  debugTarget(x: number, y: number): void;
  /** debug: drive joint mode with keys toward an angle set (servo path, 60°/s) */
  debugJoints(target: Angles): Promise<void>;
  debugEnterTargetMode(): void;
  /** debug: a joint-mode run in 48 s (★★★) */
  debugStars3(): void;
  readonly state: () => Record<string, unknown>;
}

export function buildStationA(ctx: Ctx, sfx: Sfx, look: Look, hooks: { onStamp(): void; say(key: string): void; onUse(): void }): StationA {
  const M = ctx.materials;
  const det = ctx.groups.detail;
  const vc = M.standard({ vertexColors: true, metalness: 0.35, roughness: 0.6 });

  // ── backdrop: 10 × 7 m board with grid, axes, workspace, formula (exterior: reads from the hub) ──
  const BW = 1024,
    BH = 717,
    PPM = 102.4;
  const bx = (x: number): number => (x - 3) * PPM;
  const by = (y: number): number => (7 - y) * PPM;
  const drawBoard = (g: CanvasRenderingContext2D): void => {
    g.fillStyle = '#171514';
    g.fillRect(0, 0, BW, BH);
    // grid 0.25 m / 1 m
    for (let k = 0; k <= 40; k++) {
      const x = 3 + k * 0.25,
        major = k % 4 === 0;
      g.fillStyle = major ? '#302d2b' : '#211f1d';
      g.fillRect(bx(x) - (major ? 1 : 0.5), 0, major ? 2 : 1, BH);
    }
    for (let k = 0; k <= 28; k++) {
      const y = k * 0.25,
        major = k % 4 === 0;
      g.fillStyle = major ? '#302d2b' : '#211f1d';
      g.fillRect(0, by(y) - (major ? 1 : 0.5), BW, major ? 2 : 1);
    }
    // axes through the base joint
    g.strokeStyle = '#57534e';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(bx(3.2), by(BY));
    g.lineTo(bx(12.8), by(BY));
    g.moveTo(bx(BX), by(0.1));
    g.lineTo(bx(BX), by(6.8));
    g.stroke();
    g.fillStyle = '#78716c';
    g.font = '500 17px "Geist Mono", monospace';
    for (let k = -4; k <= 4; k++) if (k) g.fillText(`${k}`, bx(BX + k) - (k < 0 ? 9 : 5), by(BY) + 22);
    for (let k = 1; k <= 5; k++) g.fillText(`${k}`, bx(BX) - 20, by(BY + k) + 6);
    g.fillText('x [m]', bx(12.5) - 26, by(BY) - 10);
    g.fillText('y [m]', bx(BX) + 10, by(6.6));
    // the workspace arc itself is a 3D ribbon in the arm plane (exact from every viewpoint); label only
    g.fillStyle = '#2dd4bf';
    g.font = '500 19px "Geist Mono", monospace';
    g.save();
    g.translate(bx(BX - 3.6), by(BY + 3.05));
    g.rotate(-0.86);
    g.fillText(ctx.t('a.reach'), 0, 0);
    g.restore();
    // title + formula
    g.fillStyle = '#ff6700';
    g.font = '500 26px "Geist Mono", monospace';
    g.fillText(ctx.t('a.backdropTitle').toUpperCase(), 34, 52);
    g.fillStyle = '#e7e5e4';
    g.font = '700 34px "Space Grotesk", sans-serif';
    g.fillText(ctx.t('a.backdropSub'), 34, 92);
    // formula block top right (clear of the arm's sweep near the base)
    g.fillStyle = '#a8a29e';
    g.font = '400 16px "Geist Mono", monospace';
    const fx = BW - 34;
    g.textAlign = 'right';
    g.fillText('x = L₁·cos θ₁ + L₂·cos(θ₁+θ₂) + L₃·cos(θ₁+θ₂+θ₃)', fx, 132);
    g.fillText('y = L₁·sin θ₁ + L₂·sin(θ₁+θ₂) + L₃·sin(θ₁+θ₂+θ₃)', fx, 156);
    g.fillStyle = '#78716c';
    g.fillText(`L₁ ${ctx.i18n.num(2, 1)} m · L₂ ${ctx.i18n.num(1.6, 1)} m · L₃ ${ctx.i18n.num(1, 1)} m · ±160°`, fx, 180);
    g.textAlign = 'left';
  };
  const boardTex = M.canvasTexture(BW, BH, drawBoard, { anisotropy: 8 });
  boardTex.wrapS = boardTex.wrapT = THREE.ClampToEdgeWrapping;
  ctx.onDispose(() => boardTex.dispose());
  ctx.i18n.onChange(() => {
    drawBoard(boardTex.image.getContext('2d') as CanvasRenderingContext2D);
    boardTex.needsUpdate = true;
  });
  const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, emissiveMap: boardTex, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.9, metalness: 0 });
  ctx.onDispose(() => boardMat.dispose());
  const board = new THREE.Mesh(new THREE.PlaneGeometry(10, 7), boardMat);
  board.position.set(BX, 3.5, BACK_Z + 0.07);
  ctx.groups.exterior.add(board);
  // KINEMATIK screen wall (ART-V2 §6.3): carbon back, alu frame, legs and ring truss
  const wallBack = new THREE.Mesh(rbox(10.3, 7.25, 0.12, 0.04).translate(BX, 3.6, BACK_Z), look.carbon);
  setShadow(wallBack, true);
  ctx.groups.exterior.add(wallBack);
  // ceramic rear cladding: no black slab seen from the back of the plot
  const wallRear = new THREE.Mesh(rbox(10.2, 7.1, 0.08, 0.03).translate(BX, 3.6, BACK_Z - 0.1), look.hullWarm);
  wallRear.receiveShadow = true;
  ctx.groups.exterior.add(wallRear);
  const frame = new THREE.Mesh(
    merge([
      box(10.36, 0.08, 0.16, BX, 7.25, BACK_Z + 0.02),
      box(10.36, 0.08, 0.16, BX, 0.0 + 0.04 + 0.0, BACK_Z + 0.02),
      box(0.22, 7.6, 0.4, BX - 5.2, 3.8, BACK_Z - 0.1),
      box(0.22, 7.6, 0.4, BX + 5.2, 3.8, BACK_Z - 0.1),
      box(10.8, 0.24, 0.24, BX, TRUSS_Y, RING_Z),
      box(10.8, 0.08, 0.08, BX, TRUSS_Y + 0.35, RING_Z),
      box(0.16, 0.5, 1.9, BX - 5.2, TRUSS_Y + 0.1, (RING_Z + BACK_Z) / 2),
      box(0.16, 0.5, 1.9, BX + 5.2, TRUSS_Y + 0.1, (RING_Z + BACK_Z) / 2),
      ...Array.from({ length: 11 }, (_, i) => box(0.06, 0.4, 0.06, BX - 5 + i, TRUSS_Y + 0.17, RING_Z, 0, 0, i % 2 ? 0.7 : -0.7)),
    ]),
    look.alu,
  );
  setShadow(frame, true);
  ctx.groups.exterior.add(frame);
  ctx.physics.addStaticBox({ size: [10.6, 7.3, 0.5], position: [BX, 3.65, BACK_Z - 0.1] });

  // pedestal (detail) + collider; the arm itself has no collider (it moves in the stage volume)
  const pedestal = new THREE.Mesh(
    merge([
      paint(new THREE.CylinderGeometry(0.34, 0.38, 0.12, 32).translate(0, FLOOR_H + 0.06, 0), COL.chassis),
      paint(new THREE.CylinderGeometry(0.28, 0.34, BY - FLOOR_H - 0.12, 24).translate(0, (BY + FLOOR_H + 0.12) / 2, 0), COL.structure),
      paint(box(0.5, 0.18, 0.44, 0, BY - 0.12, 0), COL.chassis),
    ]),
    vc,
  );
  pedestal.position.set(BX, 0, ZL[0]);
  det.add(pedestal);
  setShadow(pedestal, true);
  ctx.physics.addStaticCylinder({ radius: 0.4, height: BY, position: [BX, BY / 2, ZL[0]] });
  // workspace: r = 4.6 m around the base joint, above the deck — a teal ribbon right behind the links
  const a0 = Math.asin(Math.min(1, (BY - FLOOR_H) / REACH));
  const arc = new THREE.Mesh(new THREE.TorusGeometry(REACH, 0.022, 6, 120, Math.PI + 2 * a0).rotateZ(-a0), M.emissive(COL.teal, 1.1));
  arc.position.set(BX, BY, ZL[0] - 0.13);
  ctx.groups.exterior.add(arc);
  // keep the walking player out of the swing volume (a low rail with hazard caps)
  ctx.physics.addStaticBox({ size: [10.2, 1.1, 0.12], position: [BX, 0.55, -4.0] });
  const rail = new THREE.Mesh(
    merge([
      box(10.2, 0.06, 0.06, BX, 1.05, -4.0),
      box(10.2, 0.05, 0.05, BX, 0.55, -4.0),
      ...[-5, -2.5, 0, 2.5, 5].map((dx) => box(0.07, 1.05, 0.07, BX + dx, 0.53, -4.0)),
    ]),
    look.alu,
  );
  det.add(rail);

  // ── the arm: three links (vertex colours, 1 draw call each) + joint rings (instanced) ──
  const linkGeo = [
    merge([
      paint(box(LINKS[0], 0.17, 0.14, LINKS[0] / 2, 0, 0), COL.shell),
      paint(box(LINKS[0] * 0.8, 0.03, 0.145, LINKS[0] / 2, 0.06, 0), COL.shellShadow),
      paint(axle(0.17, 0.3, 24, 0, 0, 0), COL.chassis),
      paint(axle(0.13, 0.22, 20, LINKS[0], 0, 0), COL.chassis),
    ]),
    merge([
      paint(box(LINKS[1], 0.14, 0.12, LINKS[1] / 2, 0, 0), COL.shell),
      paint(box(LINKS[1] * 0.8, 0.026, 0.125, LINKS[1] / 2, 0.05, 0), COL.shellShadow),
      paint(axle(0.14, 0.24, 20, 0, 0, 0), COL.chassis),
      paint(axle(0.11, 0.2, 18, LINKS[1], 0, 0), COL.chassis),
    ]),
    merge([
      paint(box(LINKS[2] - 0.12, 0.11, 0.1, (LINKS[2] - 0.12) / 2, 0, 0), COL.shell),
      paint(axle(0.12, 0.2, 18, 0, 0, 0), COL.chassis),
      paint(box(0.08, 0.16, 0.1, LINKS[2] - 0.1, 0, 0), COL.chassis),
      paint(box(0.14, 0.025, 0.06, LINKS[2] + 0.0, 0.055, 0), COL.carbon),
      paint(box(0.14, 0.025, 0.06, LINKS[2] + 0.0, -0.055, 0), COL.carbon),
    ]),
  ];
  const links = linkGeo.map((g, i) => {
    const m = new THREE.Mesh(g, vc);
    m.castShadow = i === 0;
    det.add(m);
    return m;
  });
  const tcp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 10), M.accentTeal);
  det.add(tcp);
  const jointRingMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  ctx.onDispose(() => jointRingMat.dispose());
  const jointRings = new THREE.InstancedMesh(new THREE.TorusGeometry(0.2, 0.03, 8, 32), jointRingMat, 3);
  jointRings.frustumCulled = false;
  det.add(jointRings);
  const ringColor = new THREE.Color();

  // target rings R1–R3 on cables from the truss (instanced, orange → teal when threaded)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  ctx.onDispose(() => ringMat.dispose());
  // the ring's inner edge is the hit radius (RING_HIT 0.15 m): a tip that looks inside counts (it was 0.3 m)
  const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(RING_HIT + 0.02, 0.022, 10, 56), ringMat, 3);
  rings.frustumCulled = false;
  det.add(rings);
  const cables = new THREE.Mesh(
    merge(
      RINGS.flatMap(([x, y]) => {
        const top = TRUSS_Y - 0.12,
          bot = BY + y + RING_HIT + 0.05;
        return [box(0.012, top - bot, 0.012, BX + x, (top + bot) / 2, RING_Z), box(0.05, 0.06, 0.05, BX + x, bot, RING_Z)];
      }),
    ),
    M.metalDark,
  );
  det.add(cables);
  const threaded = [false, false, false];
  const ringPop = [0, 0, 0];
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    sv = new THREE.Vector3(),
    pv = new THREE.Vector3();
  const paintRings = (): void => {
    RINGS.forEach(([x, y], i) => {
      const s = 1 + 0.35 * Math.sin(Math.min(1, ringPop[i]) * Math.PI);
      m4.compose(pv.set(BX + x, BY + y, RING_Z), q.identity(), sv.set(s, s, s));
      rings.setMatrixAt(i, m4);
      rings.setColorAt(i, threaded[i] ? ringColor.setHex(COL.teal).multiplyScalar(1.6) : ringColor.setHex(COL.orange).multiplyScalar(1.1));
    });
    rings.instanceMatrix.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
  };
  paintRings();

  // ghosts (CCD iterations): one dynamic mesh of camera-facing quads with RGBA vertex colours
  const QUADS = GHOSTS * 6; // 3 links + 3 joint diamonds
  const gPos = new Float32Array(QUADS * 4 * 3);
  const gCol = new Float32Array(QUADS * 4 * 4);
  const gIdx: number[] = [];
  for (let k = 0; k < QUADS; k++) gIdx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
  const ghostGeo = new THREE.BufferGeometry();
  ghostGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3).setUsage(THREE.DynamicDrawUsage));
  ghostGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 4).setUsage(THREE.DynamicDrawUsage));
  ghostGeo.setIndex(gIdx);
  ghostGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(BX, BY + 1, RING_Z), 7);
  const ghostMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  ctx.onDispose(() => ghostMat.dispose());
  const ghosts = new THREE.Mesh(ghostGeo, ghostMat);
  ghosts.frustumCulled = false;
  ghosts.renderOrder = 2;
  det.add(ghosts);
  const ghostData: { th: Angles; t0: number }[] = [];
  const gp = new Float64Array(8);
  const writeGhost = (slot: number, th: Angles): void => {
    fk(th, gp);
    const z = RING_Z + 0.09;
    for (let k = 0; k < 3; k++) {
      const x0 = BX + gp[k * 2],
        y0 = BY + gp[k * 2 + 1],
        x1 = BX + gp[k * 2 + 2],
        y1 = BY + gp[k * 2 + 3];
      const len = Math.hypot(x1 - x0, y1 - y0) || 1;
      const w = 0.05 - k * 0.008;
      const nx = (-(y1 - y0) / len) * w,
        ny = ((x1 - x0) / len) * w;
      let o = (slot * 6 + k) * 12;
      gPos.set([x0 + nx, y0 + ny, z, x1 + nx, y1 + ny, z, x1 - nx, y1 - ny, z, x0 - nx, y0 - ny, z], o);
      // joint diamond
      const r = 0.085 - k * 0.012;
      o = (slot * 6 + 3 + k) * 12;
      gPos.set([x0, y0 + r, z, x0 + r, y0, z, x0, y0 - r, z, x0 - r, y0, z], o);
    }
  };
  const setGhostAlpha = (slot: number, a: number, tealish: boolean): void => {
    const r = tealish ? 0.18 : 0.6,
      gg = tealish ? 0.65 : 0.56,
      b = tealish ? 0.6 : 0.52;
    for (let v = 0; v < 24; v++) {
      const o = (slot * 24 + v) * 4;
      gCol[o] = r;
      gCol[o + 1] = gg;
      gCol[o + 2] = b;
      gCol[o + 3] = a * (v >= 12 ? 0.9 : 0.55);
    }
  };
  for (let s = 0; s < GHOSTS; s++) setGhostAlpha(s, 0, false);

  // tip trail: what forward kinematics draws (a fading ribbon, 1 draw call)
  const trailPts = new Float32Array(TRAIL * 2);
  const trailPos = new Float32Array((TRAIL - 1) * 4 * 3);
  const trailCol = new Float32Array((TRAIL - 1) * 4 * 4);
  const trailIdx: number[] = [];
  for (let k = 0; k < TRAIL - 1; k++) {
    trailIdx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
    const a0t = k / (TRAIL - 1),
      a1t = (k + 1) / (TRAIL - 1);
    trailCol.set([0.18, 0.83, 0.75, a0t * a0t * 0.8, 0.18, 0.83, 0.75, a1t * a1t * 0.8, 0.18, 0.83, 0.75, a1t * a1t * 0.8, 0.18, 0.83, 0.75, a0t * a0t * 0.8], k * 16);
  }
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 4));
  trailGeo.setIndex(trailIdx);
  trailGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(BX, BY + 1, RING_Z), 7);
  const trailMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  ctx.onDispose(() => trailMat.dispose());
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.frustumCulled = false;
  trail.renderOrder = 1;
  det.add(trail);
  const rebuildTrail = (): void => {
    const z = RING_Z + 0.05,
      w = 0.022;
    for (let k = 0; k < TRAIL - 1; k++) {
      const x0 = trailPts[k * 2],
        y0 = trailPts[k * 2 + 1],
        x1 = trailPts[k * 2 + 2],
        y1 = trailPts[k * 2 + 3];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const nx = len > 1e-6 ? (-(y1 - y0) / len) * w : 0,
        ny = len > 1e-6 ? ((x1 - x0) / len) * w : 0;
      const o = k * 12;
      trailPos[o] = x0 + nx;
      trailPos[o + 1] = y0 + ny;
      trailPos[o + 2] = z;
      trailPos[o + 3] = x1 + nx;
      trailPos[o + 4] = y1 + ny;
      trailPos[o + 5] = z;
      trailPos[o + 6] = x1 - nx;
      trailPos[o + 7] = y1 - ny;
      trailPos[o + 8] = z;
      trailPos[o + 9] = x0 - nx;
      trailPos[o + 10] = y0 - ny;
      trailPos[o + 11] = z;
    }
    (trailGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  };

  // IK target marker + reach line
  const marker = new THREE.Mesh(
    merge([new THREE.TorusGeometry(0.13, 0.018, 8, 32), box(0.42, 0.018, 0.018), box(0.018, 0.42, 0.018)]),
    M.emissiveTeal,
  );
  marker.visible = false;
  det.add(marker);
  const reachLineGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const reachMat = new THREE.LineDashedMaterial({ color: 0x2dd4bf, dashSize: 0.12, gapSize: 0.08 });
  ctx.onDispose(() => reachMat.dispose());
  const reachLine = new THREE.Line(reachLineGeo, reachMat);
  reachLine.visible = false;
  reachLine.frustumCulled = false;
  det.add(reachLine);

  // ── console (lectern) ──────────────────────────────────────────────────────
  const lectern = new THREE.Mesh(
    merge([
      // console (ART-V2 §6.0): ceramic body on a carbon foot, alu trim, carbon top
      paint(box(0.42, 0.08, 0.28, 0, 0.04 + FLOOR_H, 0), COL.carbon),
      paint(box(0.5, 0.8, 0.36, 0, 0.48 + FLOOR_H, 0), 0xd6d3d1),
      paint(box(0.52, 0.03, 0.38, 0, 0.895 + FLOOR_H, 0), 0xc9c4bf),
      paint(box(0.62, 0.06, 0.46, 0, 0.95 + FLOOR_H, 0.03, -0.42), COL.carbon),
      paint(box(0.44, 0.012, 0.28, 0, 0.985 + FLOOR_H, 0.04, -0.42), COL.teal),
    ]),
    vc,
  );
  lectern.position.set(BX - 2.2, 0, -2.4);
  det.add(lectern);
  ctx.physics.addStaticBox({ size: [0.55, 1.0, 0.45], position: [BX - 2.2, 0.5, -2.4] });
  // the glowing knob is what players aim at: make it part of the lectern (same interactable + highlight)
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.04, 20), M.accentOrange);
  knob.position.set(0.2, 1.06 + FLOOR_H, 0.04);
  knob.rotation.x = -0.42;
  lectern.add(knob);

  // ── state ─────────────────────────────────────────────────────────────────
  const th: Angles = [1.45, -0.55, -0.45];
  const p = new Float64Array(8);
  let selected = 0;
  let mode: 'joint' | 'target' = 'joint';
  let targetUnlocked = false;
  let operating = false;
  let firstOperateAt: number | null = null;
  let operateTime = 0;
  // which input the player used (kept for the debug state; the run itself tracks IK use)
  let usedJoint = false,
    usedTarget = false;
  const used = (): string => (usedJoint && usedTarget ? 'both' : usedTarget ? 'target' : usedJoint ? 'joint' : 'none');
  // a skipped stamp (Entscheider) can still be earned for real later; then the record is replaced
  let done = ctx.pass.has('gelenke') && !ctx.progress.get('aSkipped', false);
  if (done) threaded.fill(true), paintRings(), (targetUnlocked = true);
  let hold: -1 | 0 | 1 = 0; // ◀ ▶ buttons
  let wheelLeft = 0; // mouse wheel: 5° per notch, executed by the 60°/s servo
  let dragging = false;
  const drag = new THREE.Vector2();
  let floorHintAt = -10;
  let lastOmega = 0;
  let prevTipX = 0,
    prevTipY = 0;
  // IK animation
  let ik: null | { from: Angles; to: Angles; t: number; startAt: number; dur: number; snap: boolean } = null;
  let pendingTarget: [number, number] | null = null;
  let ikInfo: { iters: number; err: number; sigma: number; out: boolean; blocked: boolean; dist: number; sens: number } | null = null;
  let saidJoint = false,
    saidGhosts = false,
    saidOut = false,
    saidSing = false;

  // ── „Ringe-Rennen" (FUN-PLAN G1) ──────────────────────────────────────────
  // ★ 3 rings in any mode (the stamp) · ★★ 3 rings in joint mode ≤ 120 s · ★★★ ≤ 60 s. The run clock counts
  // operate time from LOS; target mode (IK) unlocks after the first finish, and an IK run is timed for the
  // comparison („Gelenke 1:42 · IK 0:09") but earns ★ only — that comparison is the lesson.
  const HOME: Angles = [1.45, -0.55, -0.45];
  const att = { t0: null as number | null, ik: false, lastSec: -1 };
  let usedTargetInRun = false;
  let bestJoint: number | null = ctx.progress.get<number | null>('aBestJoint', null);
  const runTime = (): number => (att.t0 == null ? 0 : Math.max(0, operateTime - att.t0));
  const clock = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  // plan §4.4 (R6): the contrast „Gelenke 1:42 · IK 0:04“ is the lesson, so after an IK run it is the
  // banner's big line (the banner shows the title when there is no value) and a large row in the panel
  let contrast: { j: string; ik: string } | null = null;
  let contrastUntil = 0;
  const baseTitle = ctx.i18n.text('game.a.title');
  const ch = ctx.game.challenge({
    id: 'gelenke',
    title: (lang) => (contrast && ctx.time.elapsed < contrastUntil ? `${lang === 'de' ? 'Gelenke' : 'Joints'} ${contrast.j} · IK ${contrast.ik}` : ctx.i18n.resolve(baseTitle)),
    metric: { label: ctx.i18n.text('game.a.metric'), unit: 's', better: 'lower', digits: 0 },
    goals: [{ text: ctx.i18n.text('game.a.g1') }, { text: ctx.i18n.text('game.a.g2'), at: 120 }, { text: ctx.i18n.text('game.a.g3'), at: 60 }],
    lesson: ctx.i18n.text('game.a.lesson'),
    why: () => cardSpec(),
    retry: () => retryRun(),
  });
  const startRun = (): void => {
    att.t0 = null;
    att.ik = mode === 'target';
    usedTargetInRun = false;
    att.lastSec = -1;
    void ch.begin({ countdown: true }).then(() => {
      if (att.t0 == null) att.t0 = operateTime;
    });
  };
  const retryRun = (): void => {
    threaded.fill(false);
    ringPop.fill(0);
    paintRings();
    ik = null;
    pendingTarget = null;
    th[0] = HOME[0];
    th[1] = HOME[1];
    th[2] = HOME[2];
    fk(th, p);
    prevTipX = p[6];
    prevTipY = p[7];
    ch.live(null);
    refreshPanel(true);
    if (operating) startRun();
    else att.t0 = null;
  };

  fk(th, p);
  prevTipX = p[6];
  prevTipY = p[7];
  for (let i = 0; i < TRAIL; i++) trailPts.set([BX + p[6], BY + p[7]], i * 2);
  rebuildTrail();

  // ── panel ─────────────────────────────────────────────────────────────────
  let ui: null | {
    rings: HTMLElement;
    time: HTMLElement;
    modeSeg: { el: HTMLElement; set(v: 'joint' | 'target'): void };
    jointBox: HTMLElement;
    targetBox: HTMLElement;
    rows: { row: HTMLElement; val: HTMLElement; bar: HTMLElement }[];
    tip: HTMLElement;
    ikLine: HTMLElement;
    sigmaVal: HTMLElement;
    sigmaBar: HTMLElement;
    warn: HTMLElement;
    help: HTMLElement;
    skip: HTMLElement;
    contrast: HTMLElement;
  } = null;

  const buildPanel = (el: HTMLElement, exit: () => void): (() => void) => {
    const root = panelRoot(el);
    const render = (): void => {
      root.replaceChildren();
      const rings = h('span', { class: 'gw-big' });
      const time = h('span', { class: 'gw-mono gw-muted' });
      const goalChips = ch.chips();
      goalChips.style.margin = '8px 0 2px';
      root.append(
        // ≤ 35 words at open (plan §4): the operate bar names the station; the head keeps the chip
        h('div', { class: 'gw-head', style: 'justify-content:flex-end' }, ctx.ui.chip('sim')),
        goalChips,
        h('div', { class: 'gw-row' }, h('span', { class: 'gw-k' }, ctx.t('a.rings')), rings, h('span', { style: 'flex:1' }), time),
      );
      // the lesson as two numbers, large, once both kinds of run exist (data-chip: the player's own times)
      const contrastEl = h('div', { class: 'gw-contrast', 'data-chip': 'ui' });
      root.append(contrastEl);
      const modeSeg = seg<'joint' | 'target'>(
        [
          { value: 'joint', label: ctx.t('a.modeJoint') },
          { value: 'target', label: ctx.t('a.modeTarget'), disabled: !targetUnlocked, title: targetUnlocked ? '' : ctx.t('a.targetLocked') },
        ],
        mode,
        (v) => setMode(v),
      );
      const help = h('div', { class: 'gw-help' });
      root.append(h('div', { class: 'gw-row' }, modeSeg.el), help);
      const jointBox = h('div', {});
      const rows = [0, 1, 2].map((j) => {
        const val = h('span', { class: 'gw-mono' });
        const bar = h('i', {});
        const left = h('button', { class: 'btn gw-mini' }, '◀');
        const right = h('button', { class: 'btn gw-mini' }, '▶');
        const press = (d: -1 | 1) => (e: PointerEvent): void => {
          e.preventDefault();
          select(j);
          hold = d;
        };
        left.onpointerdown = press(1);
        right.onpointerdown = press(-1);
        for (const b of [left, right]) b.onpointerup = b.onpointerleave = () => (hold = 0);
        const row = h('div', { class: 'gw-joint' }, h('span', { class: 'gw-jn' }, `θ${'₁₂₃'[j]}`), val, h('div', { class: 'gw-bar' }, h('b', {}), bar), left, right);
        row.onclick = () => select(j);
        jointBox.append(row);
        return { row, val, bar };
      });
      const tip = h('div', { class: 'gw-mono', style: 'margin-top:8px' });
      jointBox.append(tip);
      const targetBox = h('div', {});
      const ikLine = h('div', { class: 'gw-mono' });
      const sigmaVal = h('span', { class: 'gw-mono' });
      const sigmaBar = h('i', { style: 'left:0' });
      const warn = h('div', { class: 'gw-result' });
      targetBox.append(
        ikLine,
        h('div', { class: 'gw-row' }, kLabel(ctx.t('a.sigma'), 'σ_min'), h('div', { class: 'gw-bar', style: 'flex:1' }, sigmaBar), sigmaVal),
        warn,
      );
      const leave = h('button', { class: 'btn ghost' }, 'Esc');
      leave.onclick = exit;
      const info = h('button', { class: 'btn ghost' }, 'ⓘ');
      info.title = ctx.t('a.cardTitle');
      info.onclick = () => void openCard();
      // Entscheider: a Probieren station may be skipped after 30 s; the stamp then honestly says so
      const skip = h('button', { class: 'btn ghost', style: 'display:none' }, ctx.t('a.skip'));
      skip.onclick = () => {
        if (done || ctx.pass.has('gelenke')) return;
        ctx.progress.set('aSkipped', true);
        ctx.pass.award('gelenke', { skipped: true, value: { de: `übersprungen · ${threaded.filter(Boolean).length}/3 Ringe`, en: `skipped · ${threaded.filter(Boolean).length}/3 rings` } });
        hooks.onStamp();
        skip.style.display = 'none';
      };
      root.append(jointBox, targetBox, h('div', { class: 'gw-row' }, skip, h('span', { style: 'flex:1' }), info, leave));
      ui = { rings, time, modeSeg, jointBox, targetBox, rows, tip, ikLine, sigmaVal, sigmaBar, warn, help, skip, contrast: contrastEl };
      refreshPanel(true);
    };
    render();
    const off = (): void => {
      ui = null;
    };
    rerender = render;
    return off;
  };
  let rerender: (() => void) | null = null;
  ctx.i18n.onChange(() => operating && rerender?.());

  const fmtDeg = (r: number): string => `${Math.round(r * DEG)}°`.replace('-', '−');
  const refreshPanel = (structure = false): void => {
    if (!ui) return;
    ui.rings.textContent = threaded.map((t) => (t ? '●' : '○')).join(' ');
    ui.rings.style.color = threaded.every(Boolean) ? 'var(--teal)' : 'var(--text)';
    ui.time.textContent = clock(runTime());
    ui.time.title = ctx.t('a.time');
    ui.skip.style.display = ctx.mode === 'entscheider' && !done && !ctx.pass.has('gelenke') && operateTime > 30 ? '' : 'none';
    if (structure) {
      const c = ctx.progress.get<{ j: string; ik: string } | null>('aContrast', null);
      ui.contrast.style.display = c ? '' : 'none';
      if (c) ui.contrast.replaceChildren(h('span', {}, `${ctx.t('a.cJoints')} ${c.j}`), h('b', {}, '·'), h('span', { class: 'gw-teal' }, `IK ${c.ik}`));
      ui.modeSeg.set(mode);
      ui.jointBox.style.display = mode === 'joint' ? '' : 'none';
      ui.targetBox.style.display = mode === 'target' ? '' : 'none';
      // the mode's sentence is a hint when it opens (≤ 35 words at open, plan §4)
      ui.help.textContent = '';
      ui.help.style.display = 'none';
    }
    if (mode === 'joint') {
      ui.rows.forEach((r, j) => {
        r.row.classList.toggle('on', j === selected);
        r.val.textContent = fmtDeg(th[j]);
        r.bar.style.left = `${50 + (th[j] / JOINT_LIMIT) * 50}%`;
      });
      ui.tip.textContent = `→ ${ctx.i18n.num(p[6], 2)} · ${ctx.i18n.num(p[7], 2)} m`;
      ui.tip.title = 'x · y';
    } else if (ikInfo) {
      ui.ikLine.textContent = `${ctx.t('a.ccd')} · ${ikInfo.iters}× · ${ctx.i18n.num(ikInfo.err * 100, 1)} cm`;
      ui.ikLine.title = `${ctx.t('a.iterations', { n: ikInfo.iters })} · ${ctx.t('a.error', { e: ctx.i18n.num(ikInfo.err * 100, 1) })}`;
      ui.sigmaVal.textContent = `${ctx.i18n.num(ikInfo.sigma, 2)} ${ctx.t('a.sigmaUnit')}`;
      ui.sigmaBar.style.width = `${clamp(ikInfo.sigma / 1.2, 0, 1) * 100}%`;
      ui.sigmaBar.style.background = ikInfo.sigma < SINGULAR_SIGMA ? 'var(--warning)' : 'var(--teal)';
      ui.sigmaBar.style.marginLeft = '0';
      let msg = '';
      let cls = 'gw-result good';
      if (ikInfo.blocked) (msg = ctx.t('a.blocked')), (cls = 'gw-result bad');
      else if (ikInfo.out) (msg = `${ctx.t('a.outOfReach')} · ${ctx.t('a.outOfReachHint', { d: ctx.i18n.num(ikInfo.dist, 2) })}`), (cls = 'gw-result bad');
      else if (ikInfo.sigma < SINGULAR_SIGMA) (msg = `${ctx.t('a.singular')} · ${ctx.t('a.singularHint', { d: ctx.i18n.num(ikInfo.sens, 1) })}`), (cls = 'gw-result bad');
      else msg = `→ ${ctx.i18n.num(p[6], 2)} · ${ctx.i18n.num(p[7], 2)} m`;
      ui.warn.className = cls;
      ui.warn.textContent = msg;
    } else {
      ui.ikLine.textContent = ctx.t('a.targetHelp');
      ui.warn.textContent = '';
      ui.warn.className = 'gw-result';
    }
  };

  const select = (j: number): void => {
    if (selected !== j) ctx.audio.play('click', { volume: 0.6 });
    selected = j;
    wheelLeft = 0;
    refreshPanel();
  };
  const setMode = (m: 'joint' | 'target'): void => {
    if (m === 'target' && !targetUnlocked) return;
    if (m === 'target' && mode !== 'target') ctx.ui.hint(ctx.i18n.text('a.targetHelp'), 4);
    mode = m;
    if (m === 'target' && att.t0 != null) att.ik = true;
    hold = 0;
    wheelLeft = 0;
    dragging = false;
    if (m === 'joint') {
      marker.visible = false;
      reachLine.visible = false;
    }
    ctx.audio.play('click');
    refreshPanel(true);
  };

  const unlockTarget = (): void => {
    if (targetUnlocked) return;
    targetUnlocked = true;
    ctx.ui.hint(ctx.i18n.text('a.targetUnlocked'), 5);
    hooks.say('emi.aTarget');
    rerender?.();
  };

  // ── IK ────────────────────────────────────────────────────────────────────
  /** radial sensitivity: degrees of joint travel (min-norm) per 1 cm of radial tip motion */
  const sensitivity = (a: Readonly<Angles>): number => {
    const [l1, l2, l3] = LINKS;
    const a1 = a[0],
      a2 = a1 + a[1],
      a3 = a2 + a[2];
    const j = [
      [-(l1 * Math.sin(a1) + l2 * Math.sin(a2) + l3 * Math.sin(a3)), -(l2 * Math.sin(a2) + l3 * Math.sin(a3)), -l3 * Math.sin(a3)],
      [l1 * Math.cos(a1) + l2 * Math.cos(a2) + l3 * Math.cos(a3), l2 * Math.cos(a2) + l3 * Math.cos(a3), l3 * Math.cos(a3)],
    ];
    const tx = j[1][0],
      ty = -j[0][0]; // tip position from the Jacobian's first column
    const r = Math.hypot(tx, ty) || 1;
    const u = [tx / r, ty / r];
    const A = j[0][0] ** 2 + j[0][1] ** 2 + j[0][2] ** 2,
      B = j[0][0] * j[1][0] + j[0][1] * j[1][1] + j[0][2] * j[1][2],
      D = j[1][0] ** 2 + j[1][1] ** 2 + j[1][2] ** 2;
    const det = A * D - B * B || 1e-9;
    const y0 = (D * u[0] - B * u[1]) / det,
      y1 = (-B * u[0] + A * u[1]) / det;
    const dq = [0, 1, 2].map((i) => j[0][i] * y0 + j[1][i] * y1);
    const v = Math.hypot(dq[0], dq[1], dq[2]) * 0.01 * DEG;
    return Number.isFinite(v) ? Math.min(99, v) : 99;
  };

  const setTarget = (x: number, y: number): void => {
    y = Math.max(y, -0.82);
    if (ik) {
      pendingTarget = [x, y];
      return;
    }
    usedTarget = true;
    usedTargetInRun = true;
    marker.position.set(BX + x, BY + y, RING_Z + 0.06);
    marker.visible = true;
    const res = solveIk(th, x, y);
    const dist = Math.hypot(x, y);
    ikInfo = { iters: res.iterations.length, err: res.error, sigma: res.manipulability, out: res.outOfReach, blocked: res.blocked, dist, sens: sensitivity(res.final) };
    const now = ctx.time.elapsed;
    const n = Math.min(GHOSTS, res.iterations.length);
    ghostData.length = 0;
    for (let i = 0; i < n; i++) {
      ghostData.push({ th: res.iterations[i], t0: now + (i * 0.8) / Math.max(1, n) });
      writeGhost(i, res.iterations[i]);
    }
    for (let i = n; i < GHOSTS; i++) setGhostAlpha(i, 0, false);
    (ghostGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    ctx.audio.play('beep', { volume: 0.5, pitch: 1.4, at: [BX, BY + 2, RING_Z] });
    if (!saidGhosts && n > 0) {
      saidGhosts = true;
      hooks.say('emi.ikGhosts');
    }
    const singular = !res.blocked && !res.outOfReach && res.manipulability < SINGULAR_SIGMA;
    if (res.blocked) {
      ctx.audio.play('error');
      refreshPanel();
      return;
    }
    ik = { from: [th[0], th[1], th[2]], to: res.final, t: 0, startAt: now + 0.8 + 0.1, dur: singular ? 0.32 : 0.8, snap: singular };
    reachLine.visible = res.outOfReach;
    if (res.outOfReach) {
      if (!saidOut) (saidOut = true), hooks.say('emi.aOut');
      ctx.hud.toast(ctx.i18n.text('a.outOfReach'), { kind: 'warn', duration: 3 });
    }
    if (singular) {
      ctx.ui.hint(`${ctx.t('a.singular')} · ${ctx.t('a.singularHint', { d: ctx.i18n.num(ikInfo.sens, 1) })}`, 3.5);
      if (!saidSing) (saidSing = true), hooks.say('emi.aSing');
      if (dist > 4.4 && dist <= REACH) ctx.pass.unlockAlbum('singularitaet');
    }
    refreshPanel();
  };

  // ── operate ───────────────────────────────────────────────────────────────
  const planeHit = (o: THREE.Vector3, d: THREE.Vector3): [number, number] | null => {
    if (Math.abs(d.z) < 1e-4) return null;
    const t = (RING_Z - o.z) / d.z;
    if (t <= 0) return null;
    return [o.x + d.x * t - BX, o.y + d.y * t - BY];
  };
  const operate = (): void => {
    hooks.onUse();
    operating = true;
    if (firstOperateAt == null) firstOperateAt = ctx.time.elapsed;
    // 3-2-1-LOS when operate mode opens (any key skips); a finished course restarts with R
    if (att.t0 == null && threaded.some((t) => !t)) startRun();
    if (!saidJoint) (saidJoint = true), hooks.say('emi.aJoint');
    ctx.player.enterOperate({
      title: ctx.i18n.text('a.opTitle'),
      cameraPose: { position: [BX + 2.2, 3.15, 0.35], lookAt: [BX + 2.2, 2.85, -7] },
      panelPosition: 'right',
      panel: buildPanel,
      onPointer: (e) => {
        const hit = planeHit(e.origin, e.direction);
        if (e.type === 'down' && e.button === 0) {
          if (!hit) return;
          if (mode === 'target') return setTarget(hit[0], hit[1]);
          // joint mode: click near a joint selects it; then dragging points that link at the cursor
          fk(th, p);
          let best = -1,
            bd = 0.45;
          for (let j = 0; j < 3; j++) {
            const dd = Math.hypot(hit[0] - p[j * 2], hit[1] - p[j * 2 + 1]);
            if (dd < bd) (bd = dd), (best = j);
          }
          if (best >= 0) select(best);
          dragging = true;
          drag.set(hit[0], hit[1]);
          usedJoint = true;
        } else if (e.type === 'move' && dragging && hit) drag.set(hit[0], hit[1]);
        else if (e.type === 'up') dragging = false;
        else if (e.type === 'wheel' && mode === 'joint' && e.deltaY) {
          // GDD §7.3: wheel turns the selected joint, 5° per notch (wheel up = counter-clockwise, like A)
          const notches = clamp(-e.deltaY / 100, -3, 3);
          wheelLeft = clamp(wheelLeft + notches * THREE.MathUtils.degToRad(5), -Math.PI / 2, Math.PI / 2);
          usedJoint = true;
        }
      },
      onExit: () => {
        operating = false;
        hold = 0;
        dragging = false;
      },
    });
  };
  ctx.addInteractable({ object: lectern, label: ctx.i18n.text('a.console'), hint: ctx.i18n.text('a.consoleHint'), onInteract: operate, range: 2.8 });
  ctx.input.onKey(['Digit1', 'Digit2', 'Digit3'], (code) => operating && mode === 'joint' && select(Number(code.slice(5)) - 1), { whileOperating: true });
  ctx.input.onKey('KeyT', () => operating && setMode(mode === 'joint' ? 'target' : 'joint'), { whileOperating: true });
  // Z3: R = retry; a run with a ring already threaded asks once („Nochmal R zum Neustart“)
  let rAsked = -10;
  ctx.input.onKey('KeyR', () => {
    if (!operating) return;
    const now = ctx.time.elapsed;
    if (threaded.some(Boolean) && !threaded.every(Boolean) && now - rAsked > 2.5) {
      rAsked = now;
      ctx.ui.hint(ctx.i18n.text('core.game.fail.confirmRestart'), 2.5);
      return;
    }
    rAsked = -10;
    retryRun();
  }, { whileOperating: true });

  // ── stamp ─────────────────────────────────────────────────────────────────
  const threadRing = (i: number): void => {
    threaded[i] = true;
    ringPop[i] = 0.001;
    const n = threaded.filter(Boolean).length;
    if (att.t0 == null) att.t0 = operateTime; // the countdown was skipped by moving
    const at: [number, number, number] = [BX + RINGS[i][0], BY + RINGS[i][1], RING_Z];
    sfx.tick({ x: at[0], y: at[1], z: at[2] }, n - 1);
    ctx.game.juice.burst(at, { tone: 'teal', count: 30, spread: 0.45 });
    ctx.game.juice.popup([at[0], at[1] - 0.6, at[2] + 0.4], ctx.i18n.text('game.a.ring', { n, t: clock(runTime()) }), { tone: 'teal' });
    ctx.game.juice.cue('good', { at, pitch: 1 + (n - 1) * 0.12 });
    refreshPanel();
    if (n === 3) finishRun();
  };

  const finishRun = (): void => {
    const secs = Math.max(1, Math.round(runTime()));
    const ikRun = att.ik || usedTargetInRun;
    ch.live(null);
    const firstFinish = !targetUnlocked;
    if (!done) {
      done = true;
      const mm = Math.floor(secs / 60),
        ss = Math.round(secs % 60);
      const how = ikRun ? { de: 'Ziel', en: 'target' } : { de: 'Gelenk', en: 'joint' };
      const t = `${mm}:${String(ss).padStart(2, '0')} min`;
      ctx.pass.award('gelenke', { value: { de: `3/3 Ringe · ${t} · ${how.de}`, en: `3/3 rings · ${t} · ${how.en}` }, curve: [0, 1, 2, 3] });
      ctx.progress.set('aSkipped', false);
      hooks.onStamp();
      hooks.say('emi.aDone');
    }
    let stars: 1 | 2 | 3 = 1;
    let detail: { de: string; en: string } | undefined;
    if (!ikRun) {
      stars = (1 + (secs <= 120 ? 1 : 0) + (secs <= 60 ? 1 : 0)) as 1 | 2 | 3;
      if (bestJoint == null || secs < bestJoint) bestJoint = secs;
      ctx.progress.set('aBestJoint', bestJoint);
      ctx.pass.setBest('ringTime', secs, 'lower');
      if (firstFinish) detail = { de: 'Jetzt mit Zielmodus [T]', en: 'Now in target mode [T]' };
    } else {
      const j = bestJoint != null ? clock(bestJoint) : '–';
      contrast = { j, ik: clock(secs) };
      contrastUntil = ctx.time.elapsed + 12;
      ctx.progress.set('aContrast', contrast);
      detail = { de: 'Vorwärts gekurbelt, rückwärts gerechnet', en: 'Cranked forward, calculated backward' };
      refreshPanel(true);
    }
    ch.submit(ikRun ? null : secs, { stars, detail });
    ctx.game.juice.burst([BX, BY + 2.2, RING_Z], { tone: 'teal', count: 80, spread: 2.2 });
    ctx.game.juice.cue('great');
    unlockTarget();
    att.t0 = null;
  };

  const openCard = (): Promise<void> => ctx.ui.card(cardSpec());
  const cardSpec = (): InfoCardSpec => ({
      eyebrow: ctx.i18n.text('a.cardEyebrow'),
      title: ctx.i18n.text('a.cardTitle'),
      body: [ctx.i18n.text('a.cardBody')],
      bullets: [ctx.i18n.text('a.cardB1')],
      metrics: [
        { label: ctx.i18n.text('a.mLinks'), value: `${ctx.i18n.num(2, 1)}·${ctx.i18n.num(1.6, 1)}·${ctx.i18n.num(1, 1)}`, unit: 'm' }, // one line in the metric box (720p fit)
        { label: ctx.i18n.text('a.mReach'), value: ctx.i18n.num(REACH, 1), unit: 'm' },
        { label: ctx.i18n.text('a.mTime'), value: bestJoint != null ? clock(bestJoint) : '–', unit: bestJoint != null ? 'min' : undefined },
      ],
      // Entdecker: the idea + formula (≤ 60 words); Entscheider: the decision box on top (≤ 80 words)
      entdecker: { body: [ctx.i18n.text('a.cardBody'), ctx.i18n.text('a.curious')], forDecisionMakers: undefined },
      // decision makers: the reach is the one number that matters here (the card must fit without scrolling)
      entscheider: { metrics: [{ label: ctx.i18n.text('a.mReach'), value: ctx.i18n.num(REACH, 1), unit: 'm' }] },
      forDecisionMakers: { title: ctx.i18n.text('a.dfmTitle'), bullets: [ctx.i18n.text('a.dfm1'), ctx.i18n.text('a.dfm2'), ctx.i18n.text('a.dfm3')] },
      diagram: {
        aspect: 16 / 9,
        animate: true,
        caption: ctx.i18n.text('a.ccdCaption'),
        draw: (g, w, hh, t) => drawCcdDiagram(g, w, hh, t),
      },
  });

  // ── per frame ─────────────────────────────────────────────────────────────
  const cand: Angles = [0, 0, 0];
  const jointPos = new THREE.Vector3();
  const update = (dt: number, elapsed: number): void => {
    if (operating) {
      operateTime += dt;
      // a safety valve: nobody stays stuck in joint mode for ever
      if (!targetUnlocked && operateTime > 150) unlockTarget();
      if (att.t0 != null && threaded.some((t) => !t) && Math.floor(runTime()) !== att.lastSec) {
        att.lastSec = Math.floor(runTime());
        ch.live(`${threaded.filter(Boolean).length}/3 · ${clock(runTime())}`);
      }
    }
    let omega = 0;
    if (ik) {
      if (elapsed >= ik.startAt) {
        ik.t += dt / ik.dur;
        const u = Math.min(1, ik.t);
        let e = smoother(u);
        if (ik.snap) e = u < 1 ? 1 + 2.7 * Math.pow(u - 1, 3) + 1.7 * Math.pow(u - 1, 2) : 1; // easeOutBack: the servos overshoot
        for (let j = 0; j < 3; j++) {
          const nv = ik.from[j] + (ik.to[j] - ik.from[j]) * e;
          omega = Math.max(omega, Math.abs(nv - th[j]) / Math.max(dt, 1e-4));
          th[j] = nv;
        }
        if (ik.snap && u > 0 && u - dt / ik.dur <= 0) sfx.clack('a-snap', SND_ARM, 0.8, 1.2);
        if (u >= 1) {
          ik = null;
          if (ikInfo?.sigma != null && ikInfo.sigma < SINGULAR_SIGMA) sfx.clack('a-snap', SND_ARM, 0.6, 1);
          refreshPanel();
          if (pendingTarget) {
            const [x, y] = pendingTarget;
            pendingTarget = null;
            setTarget(x, y);
          }
        }
      }
    } else if (operating && mode === 'joint') {
      // keys / buttons / drag → joint velocity, servo limited to 60°/s, blocked by floor and pedestal
      let dir = hold as number;
      if (ctx.input.isDown('KeyA')) dir = 1;
      if (ctx.input.isDown('KeyD')) dir = -1;
      let dth = 0;
      if (dir) {
        dth = dir * OMEGA * dt;
        usedJoint = true;
        wheelLeft = 0;
      } else if (wheelLeft) {
        dth = clamp(wheelLeft, -OMEGA * dt, OMEGA * dt);
        wheelLeft -= dth;
        if (Math.abs(wheelLeft) < 1e-5) wheelLeft = 0;
      } else if (dragging) {
        fk(th, p);
        const jx = p[selected * 2],
          jy = p[selected * 2 + 1];
        const ex = p[6] - jx,
          ey = p[7] - jy;
        const want = Math.atan2(drag.y - jy, drag.x - jx) - Math.atan2(ey, ex);
        dth = clamp(Math.atan2(Math.sin(want), Math.cos(want)), -OMEGA * dt, OMEGA * dt);
        if (Math.abs(dth) < 1e-4) dth = 0;
      }
      if (dth) {
        cand[0] = th[0];
        cand[1] = th[1];
        cand[2] = th[2];
        cand[selected] = clamp(th[selected] + dth, -JOINT_LIMIT, JOINT_LIMIT);
        if (cand[selected] !== th[selected]) {
          if (collides(cand)) {
            wheelLeft = 0;
            if (elapsed - floorHintAt > 1.2) {
              floorHintAt = elapsed;
              ctx.ui.hint(ctx.i18n.text('a.floor'), 1.5);
              sfx.clack('a-floor', SND_FLOOR, 0.5, 1);
            }
          } else {
            omega = Math.abs(cand[selected] - th[selected]) / Math.max(dt, 1e-4);
            th[selected] = cand[selected];
          }
        }
      }
    }
    lastOmega += (omega - lastOmega) * (1 - Math.exp(-dt * 12));
    sfx.servo('a-servo', SND_ARM, lastOmega);

    // pose links
    fk(th, p);
    let abs = 0;
    for (let k = 0; k < 3; k++) {
      abs += th[k];
      links[k].position.set(BX + p[k * 2], BY + p[k * 2 + 1], ZL[k]);
      links[k].rotation.z = abs;
    }
    tcp.position.set(BX + p[6], BY + p[7], RING_Z + 0.02);
    for (let j = 0; j < 3; j++) {
      const sel = operating && mode === 'joint' && j === selected;
      m4.compose(jointPos.set(BX + p[j * 2], BY + p[j * 2 + 1], ZL[j] + (j === 0 ? 0.16 : 0.13)), q.identity(), sv.set(1, 1, 1));
      jointRings.setMatrixAt(j, m4);
      jointRings.setColorAt(j, ringColor.setHex(COL.orange).multiplyScalar(sel ? 2.6 + 0.6 * Math.sin(elapsed * 8) : 1.05));
    }
    jointRings.instanceMatrix.needsUpdate = true;
    if (jointRings.instanceColor) jointRings.instanceColor.needsUpdate = true;

    // trail (shift by one when the tip moved)
    const tx = BX + p[6],
      ty = BY + p[7];
    if (Math.hypot(p[6] - prevTipX, p[7] - prevTipY) > 0.004) {
      trailPts.copyWithin(0, 2);
      trailPts[(TRAIL - 1) * 2] = tx;
      trailPts[(TRAIL - 1) * 2 + 1] = ty;
      rebuildTrail();
    }

    // rings: tip path (previous → current) within 15 cm of a ring centre
    for (let i = 0; i < 3; i++) {
      if (!threaded[i] && segmentPointDistance(prevTipX, prevTipY, p[6], p[7], RINGS[i][0], RINGS[i][1]) <= RING_HIT) threadRing(i);
      if (ringPop[i] > 0 && ringPop[i] < 1) ringPop[i] = Math.min(1, ringPop[i] + dt * 2.5);
    }
    if (ringPop.some((r) => r > 0 && r < 1) || ctx.time.frame % 30 === 0) paintRings();
    prevTipX = p[6];
    prevTipY = p[7];

    // ghosts: appear in sequence over 0.8 s, each fades over 0.8 s
    if (ghostData.length) {
      let any = false;
      for (let i = 0; i < ghostData.length; i++) {
        const gd = ghostData[i];
        const age = elapsed - gd.t0;
        const a = age < 0 ? 0 : age < 0.08 ? age / 0.08 : Math.max(0, 1 - (age - 0.08) / 0.8);
        const last = i === ghostData.length - 1;
        setGhostAlpha(i, last ? Math.max(a, age >= 0 && ik ? 0.5 : a) : a, last);
        if (a > 0 || age < 0 || (last && ik)) any = true;
      }
      (ghostGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
      if (!any) ghostData.length = 0;
    }
    if (reachLine.visible) {
      const a = reachLineGeo.getAttribute('position') as THREE.BufferAttribute;
      a.setXYZ(0, tx, ty, RING_Z + 0.05);
      a.setXYZ(1, marker.position.x, marker.position.y, RING_Z + 0.05);
      a.needsUpdate = true;
      reachLine.computeLineDistances();
    }
    if (operating && ctx.time.frame % 4 === 0) refreshPanel();
  };

  const waitUntil = (cond: () => boolean, timeout = 20): Promise<void> =>
    new Promise((res) => {
      const t0 = ctx.time.elapsed;
      const tick = (): void => {
        if (cond() || ctx.time.elapsed - t0 > timeout) res();
        else ctx.after(0.05, tick);
      };
      tick();
    });

  return {
    update,
    get done() {
      return done;
    },
    async debugSolve() {
      if (!operating) operate();
      if (threaded.every(Boolean)) retryRun();
      unlockTarget();
      setMode('target');
      for (const [x, y] of RINGS) {
        setTarget(x, y);
        await waitUntil(() => !ik);
      }
    },
    /** debug: a joint-mode run finished in 48 s (★★★) */
    debugStars3() {
      if (!operating) operate();
      retryRun();
      mode = 'joint';
      att.ik = false;
      usedTargetInRun = false;
      att.t0 = operateTime - 48;
      for (let i = 0; i < 3; i++) threaded[i] = i < 2;
      threadRing(2);
    },
    debugTarget(x, y) {
      if (!operating) operate();
      unlockTarget();
      setMode('target');
      setTarget(x, y);
    },
    async debugJoints(target) {
      if (!operating) operate();
      setMode('joint');
      for (let j = 0; j < 3; j++) {
        select(j);
        await waitUntil(() => {
          const d = target[j] - th[j];
          hold = Math.abs(d) < 0.02 ? 0 : d > 0 ? 1 : -1;
          return hold === 0;
        }, 12);
        hold = 0;
      }
    },
    debugEnterTargetMode() {
      unlockTarget();
      setMode('target');
    },
    state: () => ({
      th: th.map((v) => Math.round(v * DEG)),
      tip: [Math.round(p[6] * 100) / 100, Math.round(p[7] * 100) / 100],
      threaded: [...threaded],
      mode,
      targetUnlocked,
      operating,
      ik: ikInfo,
      sigma: Math.round(manipulability(th) * 100) / 100,
      used: used(),
      run: { t: Math.round(runTime()), ik: att.ik || usedTargetInRun, bestJoint },
    }),
  };
}

/** small animated CCD explainer for the info card */
function drawCcdDiagram(g: CanvasRenderingContext2D, w: number, hh: number, t: number): void {
  g.fillStyle = '#141414';
  g.fillRect(0, 0, w, hh);
  const s = hh / 6.2,
    ox = w * 0.32,
    oy = hh * 0.86;
  const X = (x: number): number => ox + x * s,
    Y = (y: number): number => oy - y * s;
  const tx = 2.6,
    ty = 3.0;
  const res = solveIk([0.2, 0.3, 0.3], tx, ty, 12, 0.005);
  const n = res.iterations.length;
  const k = Math.min(n, Math.floor((t % (n * 0.5 + 1.5)) / 0.5) + 1);
  const pp = new Float64Array(8);
  for (let i = 0; i < k; i++) {
    fk(res.iterations[i], pp);
    g.strokeStyle = i === k - 1 ? '#2dd4bf' : `rgba(168,162,158,${0.15 + (0.5 * (i + 1)) / k})`;
    g.lineWidth = i === k - 1 ? 3 : 1.5;
    g.beginPath();
    g.moveTo(X(0), Y(0));
    for (let j = 1; j < 4; j++) g.lineTo(X(pp[j * 2]), Y(pp[j * 2 + 1]));
    g.stroke();
  }
  g.strokeStyle = '#ff6700';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(X(tx), Y(ty), 8, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#a8a29e';
  g.font = '12px "Geist Mono", monospace';
  g.fillText(`CCD ${k}/${n}`, 10, 18);
}
