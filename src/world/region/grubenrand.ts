/**
 * The Grubenrand (plan §2.3, §2.8, §4.11; D42 fix 3, D43): the Revier's landmark of the mining past, by the
 * track from the G240 pad to the Hofladen.
 *  - A retired bucket-wheel excavator (generic, FIKTION: no specific machine, C2 M4): crawlers, the slewing
 *    house, the pylon with its stays, the bucket-wheel boom reaching into the 30 m terrace cut (WP3's bake)
 *    and the counterweight boom. Wheel Ø 12 m, weathered steel and chalky old paint (§2.7 rule 3, never
 *    rusty steampunk). It still has a job (rule 10): the Sonnenacker's weather mast on its pylon (a teal
 *    sensor tip, rule 6), and the storks' nest. The Ausguck sees it at ≈ 225 m, side on.
 *  - The Revier-Chronik board on the cut's edge, facing the track: three FIKTION panels, Grube → See →
 *    Acker (§2.8 touchpoint 1), drawn on a canvas (no image files); E opens the same story as a card.
 * Draws: the steel and the board's frame 1 (ground program), the sensor tip 1, the board's face 1 (near only).
 */
import * as THREE from 'three';
import type { InfoCardSpec, ZoneContext } from '@/core/zones';
import { css } from '@/core/zones';
import { BOX, CYL, CYL6, DEG, GroundBatch, beam, box, mat4, place, type RegionLook } from './look';
import { FONT, canvasTexture, chip, spaced, wrap } from './canvas';
import { GRUBENRAND } from '../ground/plan';
import { R } from './tuning';

const C = R.color;
const G = R.grubenrand;

export interface Grubenrand {
  /** the near parts (the board's face) show while the player is close */
  setNear(on: boolean): void;
  /** world positions for tools and the map: the board, its reading spot, the excavator */
  readonly board: THREE.Vector3;
  readonly readAt: THREE.Vector3;
  readonly excavator: THREE.Vector3;
  /** the board's face mesh (region-check measures it on screen) */
  readonly face: THREE.Mesh;
  /** the card the board opens */
  card(): InfoCardSpec;
}

export function buildGrubenrand(ctx: ZoneContext, parent: THREE.Object3D, look: RegionLook): Grubenrand {
  const root = new THREE.Group();
  root.name = 'region:grubenrand';
  parent.add(root);
  const T = (k: string): string => ctx.t(`region.chronik.${k}`);

  // ── the excavator, in its own frame: origin at the slewing centre on the lay-by, +z along the wheel boom ──
  // (WP3/WPF lay the lay-by and the cut, plan.ts GRUBENRAND; the boom points from the lay-by to the cut)
  const pad = GRUBENRAND.pad.at,
    cut = GRUBENRAND.at;
  const toCut = Math.atan2(cut[0] - pad[0], -(cut[1] - pad[1]));
  const bx = pad[0] + Math.sin(toCut) * G.bodyOffset,
    bz = pad[1] - Math.cos(toCut) * G.bodyOffset;
  const by = look.y(bx, bz);
  const yaw = Math.PI - toCut;
  const reach = Math.min(22, Math.hypot(cut[0] - bx, cut[1] - bz));
  const F = new THREE.Matrix4().compose(new THREE.Vector3(bx, by, bz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
  const W = (m: THREE.Matrix4): THREE.Matrix4 => F.clone().multiply(m);
  const toWorld = (v: THREE.Vector3): THREE.Vector3 => v.clone().applyMatrix4(F);
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  // the wheel rests in the cut: its lowest point `wheelSink` below the terrain under the hub
  const R0 = G.wheelDiameter / 2;
  const hubL = V(1.9, 0, reach);
  const hubW = toWorld(hubL);
  hubL.y = look.y(hubW.x, hubW.z) - by - G.wheelSink + R0;

  const b = new GroundBatch();
  const steel = look.s(C.steelOld, 0.72, 0.35, 0.85);
  const dark = look.s(C.steelDark, 0.7, 0.4, 0.8);
  const paint = look.s(C.paintOld, 0.8, 0.1, 0.9);
  const add = (geo: THREE.BufferGeometry, st: ReturnType<RegionLook['s']>, m: THREE.Matrix4): void => void b.add(geo, st, W(m));
  const addBeam = (a: THREE.Vector3, c: THREE.Vector3, w: number, st: ReturnType<RegionLook['s']>, h = w): void => {
    const bm = beam(a, c, w, h);
    add(bm.geo, st, bm.m);
  };
  // crawlers (across the boom: they run along the lay-by, clear of the track) and the undercarriage
  for (const sz of [-3.8, 3.8]) {
    add(BOX, dark, box(0, 1.25, sz, 11, 2.5, 2.6));
    for (let k = 0; k < 5; k++) add(CYL, dark, new THREE.Matrix4().compose(V(-4 + k * 2, 0.85, sz + Math.sign(sz) * 1.4), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2), V(1.2, 0.3, 1.2)));
  }
  add(BOX, dark, box(0, 2.7, 0, 7.2, 1.2, 6.6));
  add(CYL, steel, mat4(0, 3.75, 0, 0, 7.2, 0.7, 7.2));
  // the slewing house, its roof, the operator's cab with a dark window band
  add(BOX, paint, box(0, 6.6, -1, 9, 5, 12));
  add(BOX, steel, box(0, 9.3, -1, 9.4, 0.4, 12.4));
  add(BOX, paint, box(4.9, 7.4, 4.2, 2.4, 2.4, 2.6));
  add(BOX, look.s(C.dark, 0.25, 0.3), box(4.9, 7.9, 4.2, 2.46, 0.9, 2.66));
  // the pylon (two A-frames to one apex) and the weather mast on it
  const apex = V(0, 23, -2.5);
  // an A-frame across the house (seen from the side: one upright) and a rear strut
  for (const sx of [-3.6, 3.6]) addBeam(V(sx, 9.4, -2), apex, 0.7, paint);
  addBeam(V(0, 9.4, -7.2), apex, 0.5, steel);
  addBeam(V(-2.4, 14, -2.2), V(2.4, 14, -2.2), 0.35, steel);
  addBeam(apex, V(0, 26.6, -2.5), 0.12, steel);
  addBeam(V(-0.5, 26.4, -2.5), V(0.5, 26.4, -2.5), 0.06, steel);
  addBeam(V(0, 26.4, -3), V(0, 26.4, -2), 0.06, steel);
  // the storks' nest on the apex (twigs: a flat drum)
  add(CYL6, look.s(0x5b5146, 1, 0, 1), mat4(0.9, 23.35, -1.9, 0.3, 1.9, 0.55, 1.9));
  // the bucket-wheel boom: a box girder from the pivot to the wheel head, a belt on top
  const p0 = V(0, 9.6, 4.5);
  const p1 = V(0, hubL.y + 0.6, 20.6);
  const corners: [number, number][] = [
    [-1.1, -1],
    [1.1, -1],
    [-1.1, 1],
    [1.1, 1],
  ];
  for (const [cx, cy] of corners) addBeam(V(cx, p0.y + cy, p0.z), V(cx, p1.y + cy, p1.z), 0.36, paint);
  const N = 8;
  for (let i = 0; i < N; i++)
    for (const cx of [-1.1, 1.1]) {
      const t0 = i / N,
        t1 = (i + 1) / N;
      const a = p0.clone().lerp(p1, t0),
        c = p0.clone().lerp(p1, t1);
      addBeam(V(cx, a.y + (i % 2 ? 1 : -1), a.z), V(cx, c.y + (i % 2 ? -1 : 1), c.z), 0.16, steel);
    }
  addBeam(V(0, p0.y + 1.15, p0.z), V(0, p1.y + 1.15, p1.z), 0.9, dark, 0.12);
  add(BOX, paint, box(-0.1, p1.y, p1.z + 1.4, 2.6, 2.6, 2.8));
  // the wheel (Ø 12 m): two rims, eight spokes, twelve buckets, the hub
  const ring = new THREE.TorusGeometry(R0 - 0.45, 0.22, 6, 32).rotateY(Math.PI / 2);
  for (const dx of [-0.7, 0.7]) add(ring, steel, new THREE.Matrix4().makeTranslation(hubL.x + dx, hubL.y, hubL.z));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    addBeam(V(hubL.x, hubL.y, hubL.z), V(hubL.x, hubL.y + Math.sin(a) * (R0 - 0.5), hubL.z + Math.cos(a) * (R0 - 0.5)), 0.22, steel);
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + 0.13;
    const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -a);
    add(BOX, dark, new THREE.Matrix4().compose(V(hubL.x, hubL.y + Math.sin(a) * R0, hubL.z + Math.cos(a) * R0), q, V(1.7, 1.1, 1.4)));
  }
  add(CYL, dark, new THREE.Matrix4().compose(hubL.clone(), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.PI / 2), V(1.8, 2.2, 1.8)));
  // the counterweight boom and its weight
  const q0 = V(0, 9.8, -6.5),
    q1 = V(0, 13.6, -19);
  addBeam(q0, q1, 1.8, steel, 1.6);
  add(BOX, dark, box(0, 12.4, -19.6, 5, 3.2, 3.6));
  // the stays: apex → wheel boom (two) and → counterweight (two)
  const stay = look.s(0x5d5750, 0.6, 0.5, 0.4);
  for (const sx of [-0.45, 0.45]) {
    addBeam(V(sx, apex.y - 0.3, apex.z), V(sx, p1.y + 1.3, p1.z - 0.6), 0.07, stay);
    addBeam(V(sx, apex.y - 0.3, apex.z), p0.clone().lerp(p1, 0.55).add(V(sx, 1.2, 0)), 0.07, stay);
    addBeam(V(sx, apex.y - 0.3, apex.z), V(sx, q1.y + 1.7, q1.z + 0.4), 0.07, stay);
  }

  // ── the Revier-Chronik board: larch posts, an alu frame, a small roof; the face is the canvas ──
  const qx = pad[0] + G.board[0],
    qz = pad[1] + G.board[1];
  const qy = look.y(qx, qz);
  const fyaw = Math.PI - G.boardFaces * DEG; // local +z = the face's normal (toward the reader)
  const Bf = new THREE.Matrix4().compose(new THREE.Vector3(qx, qy, qz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), fyaw), new THREE.Vector3(1, 1, 1));
  const BW = (m: THREE.Matrix4): THREE.Matrix4 => Bf.clone().multiply(m);
  const [fw, fh] = G.boardSize;
  const faceY = 1.55;
  for (const sx of [-fw / 2 - 0.12, fw / 2 + 0.12]) b.add(BOX, look.s(C.timberSilver, 0.88, 0, 0.9), BW(box(sx, 1.35, -0.08, 0.15, 2.7, 0.15)));
  b.add(BOX, look.s(C.alu, 0.45, 0.6), BW(box(0, faceY, -0.045, fw + 0.12, fh + 0.12, 0.06)));
  b.add(BOX, look.s(C.timberSilver, 0.88, 0, 0.9), BW(new THREE.Matrix4().compose(new THREE.Vector3(0, faceY + fh / 2 + 0.32, 0.05), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.32), new THREE.Vector3(fw + 0.7, 0.06, 0.75))));
  // a bench to sit and look at the old machine (benches are for people: rule 10)
  b.add(BOX, look.s(C.timberFresh, 0.85, 0, 0.7), BW(box(-1.2, 0.45, 2.6, 1.8, 0.08, 0.45)));
  for (const sx of [-1.95, -0.45]) b.add(BOX, look.s(C.timberSilver, 0.88, 0, 0.9), BW(box(sx, 0.22, 2.6, 0.12, 0.44, 0.4)));

  const steelMesh = place(root, b, look, 'region:grubenrand:static', { cast: true });
  if (steelMesh) steelMesh.receiveShadow = true;

  // the weather mast's sensor tip (teal = data)
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6), look.teal);
  tip.name = 'region:grubenrand:sensor';
  tip.position.copy(toWorld(V(0, 26.85, -2.5)));
  root.add(tip);
  ctx.onDispose(() => tip.geometry.dispose());

  // the board's face: three panels on a canvas, redrawn on a language change
  const board = canvasTexture(G.boardPx[0], G.boardPx[1], (g, w, h) => drawChronik(g, w, h, T));
  ctx.i18n.onChange(() => board.redraw());
  // fonts can arrive after the first paint (a slow first load): draw again once they are in
  void document.fonts?.ready.then(() => board.redraw());
  // printed enamel: lit by the low warm sun, plus a little of its own colour (emissive from the same canvas) so the
  // panels stay neutral and the text reads whatever the light (region-check measures it)
  const faceMat = new THREE.MeshStandardMaterial({ map: board.tex, emissive: 0xffffff, emissiveMap: board.tex, emissiveIntensity: 0.22, roughness: 0.92, metalness: 0 });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), faceMat);
  face.name = 'region:grubenrand:board';
  face.applyMatrix4(BW(new THREE.Matrix4().makeTranslation(0, faceY, 0.002)));
  face.receiveShadow = true;
  root.add(face);
  ctx.onDispose(() => {
    face.geometry.dispose();
    faceMat.dispose();
    board.tex.dispose();
  });

  const card = (): InfoCardSpec => ({
    eyebrow: ctx.i18n.text('region.chronik.eyebrow'),
    title: ctx.i18n.text('region.chronik.title'),
    body: [ctx.i18n.text('region.chronik.p1'), ctx.i18n.text('region.chronik.p2'), ctx.i18n.text('region.chronik.p3')],
    chips: [{ type: 'fiktion', source: ctx.i18n.text('region.chronik.fiktion') }],
  });
  ctx.addInteractable({
    object: face,
    label: ctx.i18n.text('region.chronik.read'),
    range: 4.5,
    // a sign to read: no orange rim over the whole face while you look at it
    highlight: false,
    onInteract: () => void ctx.ui.card(card()),
  });

  // colliders: the crawlers and the slewing house, the wheel in the cut, the board's posts (ground frame)
  const solid = (size: [number, number, number], local: THREE.Vector3, ry = yaw): void => {
    const p = toWorld(local);
    ctx.frames.adopt(ctx.physics.addStaticBox({ size, position: [p.x, p.y, p.z], rotation: [0, ry, 0], surface: 'metal' }));
  };
  solid([11, 2.6, 10.2], V(0, 1.3, 0));
  solid([9, 6.4, 12], V(0, 6, -1));
  solid([1.8, G.wheelDiameter, G.wheelDiameter], V(hubL.x, hubL.y, hubL.z));
  const postL = new THREE.Vector3(0, 1.35, -0.08).applyMatrix4(Bf);
  ctx.frames.adopt(ctx.physics.addStaticBox({ size: [fw + 0.5, 2.7, 0.3], position: [postL.x, postL.y, postL.z], rotation: [0, fyaw, 0], surface: 'wood' }));

  const readAt = new THREE.Vector3(0, 0, G.readAt).applyMatrix4(Bf);
  readAt.y = look.y(readAt.x, readAt.z);
  return {
    setNear(on) {
      if (face.visible !== on) face.visible = on;
    },
    board: new THREE.Vector3(qx, qy + faceY, qz),
    readAt,
    excavator: new THREE.Vector3(bx, by, bz),
    face,
    card,
  };
}

/** The board: an enamel panel with three FIKTION panels, Grube → See → Acker (§2.8). */
function drawChronik(g: CanvasRenderingContext2D, w: number, h: number, T: (k: string) => string): void {
  // enamel, cooler than the brand panel: the low golden sun and the grade warm it back to a neutral dark
  g.fillStyle = '#26282a';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#3d3d3d';
  g.lineWidth = 4;
  g.strokeRect(10, 10, w - 20, h - 20);
  // the hairline from orange to teal (the brand's sign rule) under the head
  const grad = g.createLinearGradient(56, 0, w - 56, 0);
  grad.addColorStop(0, css.orange);
  grad.addColorStop(1, css.teal);
  g.fillStyle = grad;
  g.fillRect(56, 150, w - 112, 4);
  g.textBaseline = 'alphabetic';
  g.fillStyle = css.orange;
  g.font = FONT.mono(30, 500);
  spaced(g, T('eyebrow'), 58, 72, 4);
  g.fillStyle = css.text;
  g.font = FONT.display(64, 700);
  g.fillText(T('title'), 56, 132);
  chip(g, w - 300, 50, T('chip'), 28);

  const top = 182,
    pw = (w - 56 * 2 - 2 * 70) / 3,
    ph = 300;
  const titles = [T('t1'), T('t2'), T('t3')];
  const bodies = [T('b1'), T('b2'), T('b3')];
  for (let i = 0; i < 3; i++) {
    const x = 56 + i * (pw + 70);
    g.save();
    g.beginPath();
    g.roundRect(x, top, pw, ph, 16);
    g.clip();
    PANELS[i](g, x, top, pw, ph);
    g.restore();
    g.strokeStyle = '#57534e';
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(x, top, pw, ph, 16);
    g.stroke();
    g.fillStyle = css.text;
    g.font = FONT.display(46, 700);
    g.fillText(titles[i], x, top + ph + 62);
    g.fillStyle = '#d6d3d1';
    g.font = FONT.sans(32, 400);
    wrap(g, bodies[i], pw).slice(0, 3).forEach((line, k) => g.fillText(line, x, top + ph + 108 + k * 40));
    if (i < 2) {
      g.fillStyle = css.textSecondary;
      g.font = FONT.display(60, 500);
      g.fillText('→', x + pw + 12, top + ph / 2 + 20);
    }
  }
}

/** the three panel illustrations (cross-sections of the same ground) */
const PANELS: ((g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void)[] = [
  // 1 · Grube: strata, a coal seam, the stepped pit, the excavator on a bench
  (g, x, y, w, h) => {
    sky(g, x, y, w, h);
    strata(g, x, y, w, h);
    g.fillStyle = '#d9cbb0';
    pit(g, x, y, w, h, 0.62);
    g.fill();
    // the excavator (a silhouette): wheel, boom, house, crawler
    const ex = x + w * 0.33,
      ey = y + h * 0.5;
    g.fillStyle = '#a89a7c';
    g.strokeStyle = '#a89a7c';
    g.lineWidth = 5;
    g.fillRect(ex - 18, ey - 26, 44, 20);
    g.fillRect(ex - 24, ey - 6, 56, 8);
    g.beginPath();
    g.moveTo(ex + 20, ey - 20);
    g.lineTo(ex + 72, ey + 10);
    g.moveTo(ex + 4, ey - 26);
    g.lineTo(ex + 4, ey - 64);
    g.lineTo(ex + 72, ey + 4);
    g.stroke();
    g.beginPath();
    g.arc(ex + 78, ey + 16, 20, 0, Math.PI * 2);
    g.stroke();
  },
  // 2 · See: the deepest pit has filled with water, reed at the edge
  (g, x, y, w, h) => {
    sky(g, x, y, w, h);
    strata(g, x, y, w, h);
    pit(g, x, y, w, h, 0.62);
    g.fillStyle = '#5e6b66';
    g.fill();
    g.fillStyle = 'rgba(214,211,209,0.45)';
    g.fillRect(x + w * 0.2, y + h * 0.56, w * 0.6, 3);
    g.strokeStyle = '#6f7a50';
    g.lineWidth = 3;
    for (let k = 0; k < 9; k++) {
      const rx = x + w * 0.16 + k * 6;
      g.beginPath();
      g.moveTo(rx, y + h * 0.55);
      g.lineTo(rx + 3, y + h * 0.45 - (k % 3) * 6);
      g.stroke();
    }
  },
  // 3 · Acker: levelled fields, solar roofs over raised beds, ripe tomatoes, the lake behind
  (g, x, y, w, h) => {
    sky(g, x, y, w, h);
    const gy = y + h * 0.58;
    g.fillStyle = '#5e6b66';
    g.fillRect(x, gy - 10, w * 0.28, 12);
    g.fillStyle = '#857a6c';
    g.fillRect(x, gy, w, h - (gy - y));
    g.fillStyle = '#6f7a50';
    g.fillRect(x, gy, w, 14);
    for (let k = 0; k < 3; k++) {
      const rx = x + w * 0.36 + k * w * 0.2;
      g.fillStyle = '#b9b6b0';
      g.fillRect(rx + 20, gy - 70, 5, 70);
      g.fillStyle = '#23262b';
      g.save();
      g.translate(rx, gy - 72);
      g.rotate(-0.28);
      g.fillRect(0, 0, w * 0.17, 10);
      g.restore();
      g.fillStyle = '#9a9188';
      g.fillRect(rx - 4, gy - 22, w * 0.15, 22);
      g.fillStyle = '#5f7046';
      g.fillRect(rx, gy - 40, w * 0.14, 18);
      g.fillStyle = '#b5332a';
      for (let t = 0; t < 5; t++) {
        g.beginPath();
        g.arc(rx + 10 + t * 18, gy - 30 + (t % 2) * 6, 5, 0, Math.PI * 2);
        g.fill();
      }
    }
  },
];

function sky(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const s = g.createLinearGradient(0, y, 0, y + h);
  s.addColorStop(0, '#d8d2c6');
  s.addColorStop(1, '#ebe3d2');
  g.fillStyle = s;
  g.fillRect(x, y, w, h);
}
function strata(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const bands: [number, string][] = [
    [0.36, '#6f7a50'],
    [0.4, '#857a6c'],
    [0.56, '#b9a68a'],
    [0.7, '#9a8270'],
    [0.8, '#3a3632'],
    [0.9, '#9a8270'],
  ];
  for (let i = 0; i < bands.length; i++) {
    const [t, c] = bands[i];
    const t1 = i + 1 < bands.length ? bands[i + 1][0] : 1;
    g.fillStyle = c;
    g.fillRect(x, y + h * t, w, h * (t1 - t) + 1);
  }
}
/** the stepped pit outline (path only) */
function pit(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, depth: number): void {
  const top = y + h * 0.36;
  const steps = 4;
  g.beginPath();
  g.moveTo(x + w * 0.12, top);
  for (let i = 1; i <= steps; i++) {
    g.lineTo(x + w * (0.12 + i * 0.055), top + (i - 1) * ((h * depth) / steps) * 0.8);
    g.lineTo(x + w * (0.12 + i * 0.055), top + i * ((h * depth) / steps) * 0.8);
  }
  for (let i = steps; i >= 1; i--) {
    g.lineTo(x + w * (0.88 - i * 0.055), top + i * ((h * depth) / steps) * 0.8);
    g.lineTo(x + w * (0.88 - i * 0.055), top + (i - 1) * ((h * depth) / steps) * 0.8);
  }
  g.lineTo(x + w * 0.88, top);
  g.closePath();
}
