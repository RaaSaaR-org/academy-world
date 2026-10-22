/**
 * The Traumhangar building (plan §4.8, §2.7): a 48 × 32 × 12 m glulam portal-frame hall in the Werft,
 * clad in weathered larch, PV glass on the roof, the big doors open toward the island (local +z), a
 * light concrete test floor with four lanes — one per robot, running from its charging dock on the
 * Messlatte wall to the doors. Solarpunk but believable: real timber, real PV, robots at work; the only
 * light lines are the docks' status rings and the data teal of the dream screens.
 *
 * Everything static here is merged at the end of the zone's init (ctx.mergeStatic): the shell in the
 * exterior tier (seen from the Werft and the Kanzel), the interior in the detail tier. Text goes into
 * canvas textures (one draw each), never into one troika mesh per label.
 */
import * as THREE from 'three';
import type { Text, ZoneContext } from '@/core/zones';
import { A, DOCKS, HALL, ROBOTS, ROSTER, type RosterKey } from './tuning';

/** §2.7 ground tokens and the hall's own materials. */
export const COLORS = {
  timberSilver: 0x9a9188,
  timberFresh: 0xb9a68a,
  clay: 0xb08a72,
  floor: 0xb3ada3,
  floorLane: 0xa9a399,
  wallInner: 0xe2dfda,
  panel: 0xd6d3d1,
  alu: 0xc4c7ca,
  steel: 0x5b5b5e,
  rubber: 0x2a2a2c,
  pv: 0x1f2328,
  line: 0xf5f5f4,
  teal: 0x2dd4bf,
  orange: 0xff6700,
  amber: 0xfbbf24,
} as const;

export interface HallHandle {
  /** the pilot plates (aim + E), the dock status rings (per robot), the roof mast's teal line (0…1) */
  plates: Record<RosterKey, THREE.Mesh>;
  setDockLight(k: RosterKey, state: 'off' | 'ready' | 'active' | 'ghost'): void;
  setMast(t: number): void;
  /** re-draw the Messlatte labels (language change) */
  redraw(): void;
  /** where the mast line starts (the dream wall's top) and ends (the mast top), zone-local */
  mastFrom: THREE.Vector3;
  mastTo: THREE.Vector3;
  /** the H2 dock's mastery ring (a canvas the zone draws into) */
  ring: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; mesh: THREE.Mesh };
}

type V3 = [number, number, number];

/** A box mesh (centre, size) with a material, added to a group. Geometry disposed with the zone. */
function boxIn(ctx: ZoneContext, g: THREE.Object3D, size: V3, at: V3, mat: THREE.Material, o: { rot?: V3; cast?: boolean; receive?: boolean; name?: string } = {}): THREE.Mesh {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  ctx.onDispose(() => geo.dispose());
  const m = new THREE.Mesh(geo, mat);
  m.position.set(at[0], at[1], at[2]);
  if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
  m.castShadow = o.cast ?? false;
  m.receiveShadow = o.receive ?? true;
  if (o.name) m.name = o.name;
  g.add(m);
  return m;
}

export function buildHall(ctx: ZoneContext, t: (k: string) => Text): HallHandle {
  const M = ctx.materials;
  const ext = ctx.groups.exterior;
  const det = ctx.groups.detail;
  const mat = {
    larch: M.standard({ color: COLORS.timberSilver, roughness: 0.92, metalness: 0 }),
    glulam: M.standard({ color: COLORS.timberFresh, roughness: 0.78, metalness: 0 }),
    floor: M.standard({ color: COLORS.floor, roughness: 0.86, metalness: 0 }),
    lane: M.standard({ color: COLORS.floorLane, roughness: 0.9, metalness: 0 }),
    wall: M.standard({ color: COLORS.wallInner, roughness: 0.82, metalness: 0 }),
    alu: M.standard({ color: COLORS.alu, roughness: 0.42, metalness: 0.65 }),
    steel: M.standard({ color: COLORS.steel, roughness: 0.55, metalness: 0.6 }),
    rubber: M.standard({ color: COLORS.rubber, roughness: 0.95, metalness: 0 }),
    pv: M.standard({ color: COLORS.pv, roughness: 0.28, metalness: 0.35 }),
    roof: M.standard({ color: 0x6f6a64, roughness: 0.8, metalness: 0.2 }),
    line: M.standard({ color: COLORS.line, roughness: 0.7, metalness: 0 }),
    clay: M.standard({ color: COLORS.clay, roughness: 0.85, metalness: 0 }),
  };
  const W = HALL.w / 2,
    D = HALL.d / 2;

  // ── floor (detail) and its markings ──────────────────────────────────────────────────────────
  const floor = boxIn(ctx, det, [HALL.w, 0.04, HALL.d], [0, -0.014, 0], mat.floor, { name: 'traum:floor' });
  floor.receiveShadow = true;
  // the four lanes: a slightly darker strip each, edged by white lines (merged later)
  for (const k of ROSTER) {
    const x = DOCKS.x[k];
    boxIn(ctx, det, [6.6, 0.01, 27.4], [x, 0.008, -1.8], mat.lane);
    for (const s of [-1, 1]) boxIn(ctx, det, [0.06, 0.012, 27.4], [x + s * 3.3, 0.01, -1.8], mat.line);
  }
  // the A lane's finish line and B's rover lane are drawn by their stations; the entry apron line
  boxIn(ctx, det, [28, 0.012, 0.08], [0, 0.01, 11.6], mat.line);

  // ── shell (exterior): long walls, gable walls, the front with its door opening ──────────────
  const eaves = HALL.eaves,
    ridge = HALL.ridge;
  // back wall (z = −D): inner face light, outer larch
  boxIn(ctx, ext, [HALL.w, eaves, 0.3], [0, eaves / 2, -D - 0.15], mat.larch, { cast: true });
  boxIn(ctx, det, [HALL.w - 0.6, eaves - 0.4, 0.04], [0, eaves / 2, -D + 0.02], mat.wall);
  // side walls (x = ±W)
  for (const s of [-1, 1]) {
    boxIn(ctx, ext, [0.3, eaves, HALL.d], [s * (W + 0.15), eaves / 2, 0], mat.larch, { cast: true });
    boxIn(ctx, det, [0.04, eaves - 0.4, HALL.d - 0.6], [s * (W - 0.02), eaves / 2, 0], mat.wall);
    // the clerestory: a translucent band under the eaves (it lights the hall from both sides)
    boxIn(ctx, det, [0.05, 1.4, HALL.d - 1], [s * (W - 0.05), eaves - 1.3, 0], M.standard({ color: 0xf2efe9, emissive: 0xf7f3ea, emissiveIntensity: 0.55, roughness: 0.6 }));
  }
  // front wall (z = +D): the opening x0…x1 up to the door height, larch around it
  const d0 = HALL.door.x0,
    d1 = HALL.door.x1,
    dh = HALL.door.h;
  for (const [a, b] of [
    [-W, d0],
    [d1, W],
  ]) {
    boxIn(ctx, ext, [b - a, eaves, 0.3], [(a + b) / 2, eaves / 2, D + 0.15], mat.larch, { cast: true });
    boxIn(ctx, det, [b - a - 0.3, eaves - 0.4, 0.04], [(a + b) / 2, eaves / 2, D - 0.02], mat.wall);
  }
  boxIn(ctx, ext, [d1 - d0, eaves - dh, 0.3], [(d0 + d1) / 2, (eaves + dh) / 2, D + 0.15], mat.larch, { cast: true });
  // the door beam: a long-span glulam beam over the opening (it carries the rafters there), and the
  // two sliding door leaves parked open outside the opening
  boxIn(ctx, ext, [d1 - d0 + 1.2, 1.1, 0.6], [(d0 + d1) / 2, dh + 0.55, D - 0.3], mat.glulam, { cast: true });
  for (const s of [-1, 1]) {
    const cx = s * (d1 + (d1 - d0) / 4 + 0.3);
    boxIn(ctx, ext, [(d1 - d0) / 2, dh, 0.16], [cx, dh / 2, D + 0.5], mat.alu, { cast: true });
    // vertical alu ribs on the leaves
    for (let k = -2; k <= 2; k++) boxIn(ctx, ext, [0.08, dh - 0.2, 0.06], [cx + k * 1.9, dh / 2, D + 0.6], mat.steel);
    // the door rail
    boxIn(ctx, ext, [d1 - d0 + 2, 0.18, 0.18], [s * d1 + s * ((d1 - d0) / 2 - 1), dh + 0.1, D + 0.55], mat.steel);
  }
  // gable triangles (front and back) up to the ridge, and the two roof planes
  const gable = new THREE.Shape([new THREE.Vector2(-D, 0), new THREE.Vector2(D, 0), new THREE.Vector2(0, ridge - eaves)]);
  const gableGeo = new THREE.ShapeGeometry(gable);
  ctx.onDispose(() => gableGeo.dispose());
  for (const s of [-1, 1]) {
    const gm = new THREE.Mesh(gableGeo, mat.larch);
    gm.rotation.y = (s * Math.PI) / 2;
    gm.position.set(s * (W + 0.3), eaves, 0);
    gm.castShadow = true;
    ext.add(gm);
  }
  // roof planes span along x; the pitch runs across z (ridge on z = 0)
  const slope = Math.atan2(ridge - eaves, D);
  const rlen = Math.hypot(D, ridge - eaves) + 0.6;
  for (const s of [-1, 1]) {
    const r = boxIn(ctx, ext, [HALL.w + 1.2, 0.25, rlen], [0, (eaves + ridge) / 2 + 0.12, (s * D) / 2], mat.roof, { cast: true, receive: true });
    r.rotation.x = s * slope;
    // PV on the slope that faces away from the island (south-west sun): modules in rows, alu frames
    if (s === -1) {
      const rows = 6,
        cols = 14;
      for (let i = 0; i < rows; i++)
        for (let j = 0; j < cols; j++) {
          const u = -D + 1.2 + (i + 0.5) * ((D - 2.4) / rows);
          const x = -W + 1.6 + (j + 0.5) * ((HALL.w - 3.2) / cols);
          const y = eaves + (ridge - eaves) * (1 - Math.abs(u) / D) + 0.3;
          boxIn(ctx, ext, [(HALL.w - 3.2) / cols - 0.12, 0.05, (D - 2.4) / rows - 0.1], [x, y, u], mat.pv, { rot: [-slope, 0, 0] });
        }
    }
  }
  // the ridge light: a glazed strip along the ridge (north light into the hall)
  boxIn(ctx, ext, [HALL.w - 2, 0.3, 1.2], [0, ridge + 0.18, 0], M.standard({ color: 0xdfe6e4, roughness: 0.25, metalness: 0.1 }));

  // ── glulam portal frames (interior signature: warm timber every 6 m) ─────────────────────────
  for (let x = -W; x <= W + 0.01; x += HALL.bay) {
    const xx = Math.max(-W + 0.4, Math.min(W - 0.4, x));
    for (const s of [-1, 1]) {
      // no column in the door opening: the long-span door beam carries those rafters
      if (s === 1 && xx > d0 - 0.5 && xx < d1 + 0.5) continue;
      boxIn(ctx, det, [0.32, eaves, 0.55], [xx, eaves / 2, s * (D - 0.42)], mat.glulam, { cast: false });
      // the rafter halves: from the column top to the ridge
      const r = boxIn(ctx, det, [0.3, 0.75, Math.hypot(D, ridge - eaves)], [xx, (eaves + ridge) / 2 - 0.4, (s * D) / 2], mat.glulam);
      r.rotation.x = s * slope;
    }
  }
  // purlins along the hall (a few) and the ceiling light bars (warm work light)
  for (const z of [-11, -5.5, 0, 5.5, 11]) {
    const y = eaves + (ridge - eaves) * (1 - Math.abs(z) / D) - 0.95;
    boxIn(ctx, det, [HALL.w - 1, 0.22, 0.22], [0, y, z], mat.glulam);
    if (z !== 0) boxIn(ctx, det, [HALL.w - 6, 0.08, 0.3], [0, y - 0.35, z], M.standard({ color: 0xfff5e6, emissive: 0xffe9cc, emissiveIntensity: 1.3, roughness: 0.5 }));
  }

  // ── the Messlatte wall: dock frames, the height board (canvas), EMI's silhouette, eye line ──
  const docks: Record<RosterKey, { ring: THREE.Mesh }> = {} as never;
  const plates = {} as Record<RosterKey, THREE.Mesh>;
  const ringMats: Record<'off' | 'ready' | 'active' | 'ghost', THREE.MeshBasicMaterial> = {
    off: M.basic(0x3a3a3a),
    ready: M.basic(COLORS.teal),
    active: M.basic(COLORS.orange),
    ghost: M.basic(0x1c6f66),
  };
  for (const k of ROSTER) {
    const x = DOCKS.x[k];
    const h = ROBOTS[k].heightM;
    // back plate with the charging connector, two alu posts, a head beam just above the robot
    boxIn(ctx, det, [2.2, h + 0.55, 0.12], [x, (h + 0.55) / 2, -D + 0.22], mat.alu);
    for (const s of [-1, 1]) boxIn(ctx, det, [0.1, h + 0.7, 0.1], [x + s * 1.05, (h + 0.7) / 2, -D + 0.6], mat.steel, { cast: true });
    boxIn(ctx, det, [2.2, 0.1, 0.42], [x, h + 0.7, -D + 0.45], mat.steel, { cast: true });
    boxIn(ctx, det, [0.34, 0.2, 0.14], [x, h * 0.62, -D + 0.33], mat.rubber);
    // floor pad of the dock and its status ring (one ring per dock: off → teal when ready)
    boxIn(ctx, det, [2.0, 0.03, 1.6], [x, 0.02, DOCKS.robotZ + 0.2], mat.rubber);
    const ringGeo = new THREE.RingGeometry(0.62, 0.7, 48).rotateX(-Math.PI / 2);
    ctx.onDispose(() => ringGeo.dispose());
    const ring = new THREE.Mesh(ringGeo, ringMats.off);
    ring.position.set(x, 0.045, DOCKS.robotZ + 0.1);
    ring.userData.noMerge = true;
    det.add(ring);
    docks[k] = { ring };
    // the pilot plate in front of the dock (aim + E)
    const px = x + DOCKS.plateDx;
    const pl = boxIn(ctx, det, [0.9, 0.05, 0.9], [px, 0.03, DOCKS.plateZ], M.standard({ color: 0x3d3d3d, roughness: 0.6, metalness: 0.3 }), { name: `traum:plate-${k}` });
    pl.userData.noMerge = true;
    plates[k] = pl;
    // its orange rim (the interactable signal) and a small console post with the robot's head camera icon
    boxIn(ctx, det, [0.94, 0.012, 0.94], [px, 0.058, DOCKS.plateZ], M.basic(COLORS.orange));
    boxIn(ctx, det, [0.8, 0.014, 0.8], [px, 0.06, DOCKS.plateZ], M.standard({ color: 0x3d3d3d, roughness: 0.6, metalness: 0.3 }));
    boxIn(ctx, det, [0.12, 1.05, 0.12], [px + 0.55, 0.525, DOCKS.plateZ - 0.3], mat.steel);
    boxIn(ctx, det, [0.34, 0.22, 0.06], [px + 0.55, 1.1, DOCKS.plateZ - 0.3], M.standard({ color: 0x1f1f1f, roughness: 0.4 }));
  }

  // the height board: one canvas across the back wall (ticks every 10 cm, numbers every 50 cm, the
  // robots' names and heights MODELL, EMI's 1,55 m silhouette, the eye line at 1,70 m)
  const board = { w: 34, h: 2.6, x0: -17 };
  const cv = document.createElement('canvas');
  cv.width = 2048;
  cv.height = 160;
  const g = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const boardMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  ctx.onDispose(() => (tex.dispose(), boardMat.dispose()));
  const boardGeo = new THREE.PlaneGeometry(board.w, board.h);
  ctx.onDispose(() => boardGeo.dispose());
  const boardMesh = new THREE.Mesh(boardGeo, boardMat);
  boardMesh.position.set(board.x0 + board.w / 2, board.h / 2, -D + 0.05);
  boardMesh.renderOrder = 2;
  boardMesh.userData.noMerge = true;
  det.add(boardMesh);
  const draw = (): void => {
    const pxm = cv.width / board.w;
    const py = (y: number): number => cv.height - (y / board.h) * cv.height;
    const X = (x: number): number => (x - board.x0) * pxm;
    g.clearRect(0, 0, cv.width, cv.height);
    // ticks at the left edge (a ruler) and faint lines across
    g.fillStyle = 'rgba(41,37,36,0.55)';
    for (let c = 0; c <= 24; c++) {
      const y = py(c / 10);
      const long = c % 5 === 0;
      g.fillRect(X(-16.8), y - 1, long ? 34 : 18, 2);
      g.fillRect(X(11.6), y - 1, long ? 34 : 18, 2);
      if (long && c > 0) {
        g.font = '600 15px "Geist Mono", monospace';
        g.fillText(ctx.i18n.num(c / 10, 1), X(-16.8) + 38, y + 5);
      }
    }
    // the eye line (teal = data): the player's eye height
    g.fillStyle = 'rgba(45,212,191,0.9)';
    g.fillRect(X(-16.8), py(DOCKS.eye) - 1.5, X(12) - X(-16.8), 3);
    g.font = '600 14px "Geist Mono", monospace';
    g.fillText(ctx.i18n.resolve(t('board.eye')), X(-14.2), py(DOCKS.eye) - 7);
    // EMI's silhouette (1,55 m): base, column, torso, head (EMI design parameters, ART-V2)
    const ex = DOCKS.emiX;
    g.fillStyle = 'rgba(41,37,36,0.78)';
    const r = (x0: number, y0: number, w: number, h: number): void => void g.fillRect(X(ex + x0), py(y0 + h), w * pxm, h * (cv.height / board.h));
    r(-0.22, 0.02, 0.44, 0.26);
    r(-0.07, 0.28, 0.14, 0.55);
    r(-0.2, 0.83, 0.4, 0.45);
    r(-0.32, 0.95, 0.1, 0.36);
    r(0.22, 0.95, 0.1, 0.36);
    r(-0.08, 1.28, 0.16, 0.06);
    r(-0.11, 1.34, 0.22, 0.21);
    g.font = '600 15px "Geist Mono", monospace';
    g.fillText(`EMI · ${ctx.i18n.num(1.55, 2)} m`, X(ex - 0.55), py(1.55) - 8);
    // each robot: its height line and name over the dock
    for (const k of ROSTER) {
      const x = DOCKS.x[k];
      const h = ROBOTS[k].heightM;
      g.fillStyle = k === 'h2' ? 'rgba(45,212,191,0.9)' : 'rgba(255,103,0,0.95)';
      g.fillRect(X(x - 1.0), py(h) - 1.5, 2.0 * pxm, 3);
      g.fillStyle = 'rgba(28,25,23,0.9)';
      g.font = '700 17px "Space Grotesk", sans-serif';
      const name = ctx.i18n.resolve(t(`robot.${k}`));
      g.fillText(name, X(x - 1.0), py(h) - 22);
      g.font = '500 14px "Geist Mono", monospace';
      g.fillText(`${ctx.i18n.num(h, 2)} m · ${ctx.i18n.resolve(t('chip.modell'))}`, X(x - 1.0), py(h) - 7);
    }
    tex.needsUpdate = true;
  };
  draw();

  // ── the H2's mastery ring (a canvas disc on the floor around its dock) ───────────────────────
  const ringCv = document.createElement('canvas');
  ringCv.width = ringCv.height = 512;
  const ringTex = new THREE.CanvasTexture(ringCv);
  ringTex.colorSpace = THREE.SRGBColorSpace;
  const ringMat = new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, toneMapped: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  ctx.onDispose(() => (ringTex.dispose(), ringMat.dispose()));
  const ringGeo = new THREE.PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2);
  ctx.onDispose(() => ringGeo.dispose());
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.position.set(DOCKS.x.h2, 0.05, DOCKS.robotZ + 1.0);
  ringMesh.renderOrder = 3;
  ringMesh.userData.noMerge = true;
  det.add(ringMesh);

  // ── the roof mast (the upload beat climbs it) ──────────────────────────────────────────────
  const mastX = HALL.mast.x,
    mastZ = HALL.mast.z;
  const roofY = eaves + (ridge - eaves) * (1 - Math.abs(mastZ) / D);
  boxIn(ctx, ext, [0.16, HALL.mast.h, 0.16], [mastX, roofY + HALL.mast.h / 2, mastZ], mat.steel, { cast: true });
  for (let k = 1; k <= 3; k++) boxIn(ctx, ext, [0.9 - k * 0.15, 0.05, 0.05], [mastX, roofY + k * 2.4, mastZ], mat.steel);
  boxIn(ctx, ext, [0.3, 0.3, 0.3], [mastX, roofY + HALL.mast.h + 0.15, mastZ], M.basic(COLORS.orange));
  // the teal line: a thin box scaled from 0 to the full mast (one draw, dynamic)
  const lineGeo = new THREE.BoxGeometry(0.07, 1, 0.07).translate(0, 0.5, 0);
  ctx.onDispose(() => lineGeo.dispose());
  const mastFrom = new THREE.Vector3(23.4, 6.2, -6);
  const mastTo = new THREE.Vector3(mastX + 0.12, roofY + HALL.mast.h, mastZ);
  const mastLine = new THREE.Mesh(lineGeo, M.basic(COLORS.teal));
  mastLine.position.set(mastX + 0.12, roofY, mastZ + 0.12);
  mastLine.scale.y = 0.0001;
  mastLine.visible = false;
  mastLine.userData.noMerge = true;
  mastLine.name = 'traum:mast-line';
  ext.add(mastLine);

  // ── far tier: one box and its roof for the Revier and the island ────────────────────────────
  {
    const farGeo = new THREE.BoxGeometry(HALL.w, eaves, HALL.d).translate(0, eaves / 2, 0);
    const farRoof = new THREE.CylinderGeometry(0.01, D * 1.02, HALL.w, 4, 1, false, Math.PI / 4).rotateZ(Math.PI / 2).scale(1, (ridge - eaves) / D, 1).translate(0, eaves, 0);
    ctx.onDispose(() => (farGeo.dispose(), farRoof.dispose()));
    ctx.groups.far.add(new THREE.Mesh(farGeo, mat.larch), new THREE.Mesh(farRoof, mat.roof));
  }

  // ── colliders: walls (the doors stay open), the dock frames ───────────────────────────────
  ctx.physics.addStaticBox({ size: [HALL.w, eaves, 0.4], position: [0, eaves / 2, -D - 0.1] });
  for (const s of [-1, 1]) ctx.physics.addStaticBox({ size: [0.4, eaves, HALL.d], position: [s * (W + 0.1), eaves / 2, 0] });
  ctx.physics.addStaticBox({ size: [W + d0, eaves, 0.4], position: [(-W + d0) / 2, eaves / 2, D + 0.1] });
  ctx.physics.addStaticBox({ size: [W - d1, eaves, 0.4], position: [(W + d1) / 2, eaves / 2, D + 0.1] });
  for (const k of ROSTER) ctx.physics.addStaticBox({ size: [2.3, 2.2, 0.7], position: [DOCKS.x[k], 1.1, -D + 0.4] });

  // the A lane's start and finish marks (the lane's own lines are above)
  boxIn(ctx, det, [3.4, 0.012, 0.1], [A.x, 0.011, A.startZ - 0.3], mat.line);
  boxIn(ctx, det, [3.4, 0.014, 0.18], [A.x, 0.012, A.endZ + 0.2], M.standard({ color: 0x1c1917, roughness: 0.8 }));

  return {
    plates,
    setDockLight(k, state) {
      docks[k].ring.material = ringMats[state];
    },
    setMast(tt) {
      mastLine.visible = tt > 0.001;
      mastLine.scale.y = Math.max(0.0001, tt * (mastTo.y - roofY));
    },
    redraw: draw,
    mastFrom,
    mastTo,
    ring: { canvas: ringCv, texture: ringTex, mesh: ringMesh },
  };
}
