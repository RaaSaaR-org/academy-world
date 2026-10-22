/**
 * The hall's furniture (plan §4.9, R4 §7.2–7.3): reception desk with the Lastenheft terminal, the three
 * category pylons GEHEN / GREIFEN & FAHREN / SELBST BAUEN, the Kistenwaage rack and its load posts, the
 * compare console between Bühne A and B, the Pannen-Wand board and the Fundvitrine cabinet, the „Danke“
 * room's shell, the three Kurzlauf consoles, the entrance plaque with the disclaimer, the FANUC's note and
 * the Tresor's plate. Static parts merge into one draw per material; every label is one region of the
 * signs atlas (one draw for all of them).
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { buildAtlas, type AtlasQuad, type AtlasRegion, type TextAtlas } from './atlas';
import { box, boxMM, cyl, mesh, FONT } from './geo';
import { DANKE, DOORS, HALL, KISTEN, KURZLAUF, PANNEN, PYLONS, RECEPTION, STAGES, TRESOR, VITRINE } from './layout';
import { fitText, INK, para, plate } from './look';
import type { HallMats } from './hall';
import { zs } from './sheet';

export interface Furniture {
  readonly signs: TextAtlas;
  /** interaction targets (invisible proxies or real meshes) */
  readonly terminal: THREE.Object3D;
  readonly compareConsole: THREE.Object3D;
  readonly pannen: THREE.Object3D;
  readonly vitrine: THREE.Object3D;
  readonly dankeWall: THREE.Object3D;
  readonly plaque: THREE.Object3D;
  readonly bauen: THREE.Object3D;
  readonly kurzlauf: Record<'belohnung' | 'erntetag' | 'traumdaten', THREE.Object3D>;
  /** screen spots (local) of the Kurzlauf consoles, their screens face north (−z) */
  readonly screens: Record<'belohnung' | 'erntetag' | 'traumdaten', { at: THREE.Vector3; w: number; h: number }>;
  /** the vitrine's 25 compartment centres (local), row-major from the top */
  readonly cells: readonly THREE.Vector3[];
  /** the Pannen-Wand's exhibit slots (local), plaques face east (+x) */
  readonly pannenSlots: readonly THREE.Vector3[];
}

const proxyMat = new THREE.MeshBasicMaterial({ visible: false });

function proxy(ctx: ZoneContext, name: string, size: [number, number, number], at: [number, number, number], ry = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), proxyMat);
  m.name = `schauhalle:proxy:${name}`;
  m.position.set(...at);
  m.rotation.y = ry;
  m.visible = false;
  ctx.groups.detail.add(m);
  ctx.onDispose(() => m.geometry.dispose());
  return m;
}

export function buildFurniture(ctx: ZoneContext, mats: HallMats): Furniture {
  const det = ctx.groups.detail;
  const carbon: THREE.BufferGeometry[] = [];
  const alu: THREE.BufferGeometry[] = [];
  const ceramic: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const frost: THREE.BufferGeometry[] = [];
  const statics = (x0: number, x1: number, z0: number, z1: number, h: number): void => {
    ctx.physics.addStaticBox({ size: [x1 - x0, h, z1 - z0], position: [(x0 + x1) / 2, h / 2, (z0 + z1) / 2], surface: 'metal' });
  };
  const L = (): 'de' | 'en' => ctx.i18n.lang;
  const regions: AtlasRegion[] = [];
  const quads: AtlasQuad[] = [];
  const sign = (id: string, px: [number, number], m: [number, number], at: [number, number, number], ry: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, rx = 0): void => {
    regions.push({ id, w: px[0], h: px[1], draw });
    quads.push({ region: id, w: m[0], h: m[1], at, ry, rx });
  };

  // ── reception desk with the Lastenheft terminal (west of the entrance) ─────
  const [rx, rz] = RECEPTION.at;
  ceramic.push(boxMM(rx - RECEPTION.w / 2, 0, rz - RECEPTION.d / 2, rx + RECEPTION.w / 2, RECEPTION.h, rz + RECEPTION.d / 2));
  carbon.push(boxMM(rx - RECEPTION.w / 2 - 0.03, RECEPTION.h, rz - RECEPTION.d / 2 - 0.03, rx + RECEPTION.w / 2 + 0.03, RECEPTION.h + 0.04, rz + RECEPTION.d / 2 + 0.03));
  statics(rx - RECEPTION.w / 2, rx + RECEPTION.w / 2, rz - RECEPTION.d / 2, rz + RECEPTION.d / 2, RECEPTION.h);
  const [tx, tz] = RECEPTION.terminalAt;
  // the terminal: a slanted screen on a carbon foot, facing east toward the aisle
  carbon.push(box(0.12, 0.3, 0.12, tx, RECEPTION.h + 0.19, tz));
  const tScreen = new THREE.Matrix4().makeTranslation(tx + 0.02, RECEPTION.h + 0.46, tz).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)).multiply(new THREE.Matrix4().makeRotationX(-0.42));
  carbon.push(box(0.74, 0.46, 0.04, 0, 0, -0.025).applyMatrix4(tScreen));
  regions.push({
    id: 'terminal',
    w: 360,
    h: 224,
    draw: (g, w, h) => {
      plate(g, w, h);
      g.textBaseline = 'alphabetic';
      fitText(g, zs(L(), 'lh.eyebrow'), 20, 40, w - 40, 17, (px) => FONT.mono(px, 500), INK.orange);
      fitText(g, zs(L(), 'lh.title'), 20, 92, w - 40, 38, (px) => FONT.display(px), INK.text);
      para(g, zs(L(), 'lh.intro'), 20, 118, w - 40, 17, 22, INK.text2);
      fitText(g, '[E]', 20, h - 18, 60, 16, (px) => FONT.mono(px, 600), INK.teal);
    },
  });
  quads.push({ region: 'terminal', w: 0.7, h: 0.435, at: [0, 0, 0], matrix: tScreen.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.0)) });
  const terminal = proxy(ctx, 'terminal', [0.9, 0.7, 0.9], [tx, RECEPTION.h + 0.35, tz]);
  // the desk's front label (toward the entrance)
  sign('empfang', [280, 64], [0.86, 0.2], [rx, 0.78, rz + RECEPTION.d / 2 + 0.006], 0, (g, w, h) => {
    plate(g, w, h, { hairline: false });
    fitText(g, L() === 'en' ? 'RECEPTION · REQUIREMENTS' : 'EMPFANG · LASTENHEFT', w / 2, h / 2 + 7, w - 24, 20, (px) => FONT.mono(px, 500), INK.text, 'center');
  });

  // ── entrance plaque + disclaimer (plan §4.9 „Disclaimer“, R4 §10) ─────────
  const pz = DOORS.south.z - 0.5;
  carbon.push(box(0.06, 1.25, 0.06, DOORS.south.x1 + 0.7, 0.625, pz));
  sign('plaque', [480, 280], [0.78, 0.45], [DOORS.south.x1 + 0.7, 1.45, pz + 0.04], Math.PI, (g, w, h) => {
    plate(g, w, h);
    g.textBaseline = 'alphabetic';
    fitText(g, zs(L(), 'sign.title') + ' · ' + zs(L(), 'sign.sub'), 22, 40, w - 44, 18, (px) => FONT.mono(px, 500), INK.text2);
    let y = para(g, zs(L(), 'plaque'), 22, 58, w - 44, 21, 27, INK.text);
    y += 10;
    g.fillStyle = INK.line;
    g.fillRect(22, y, w - 44, 1);
    para(g, zs(L(), 'disclaimer'), 22, y + 12, w - 44, 15, 20, INK.text2);
  });
  const plaque = proxy(ctx, 'plaque', [0.9, 0.7, 0.2], [DOORS.south.x1 + 0.7, 1.45, pz]);
  // the disclaimer again outside, on the glass beside the door, for passers-by (R4 §6)
  sign('disclaimer-out', [480, 104], [0.95, 0.22], [DOORS.south.x0 - 1.1, 1.55, HALL.z1 + 0.035], 0, (g, w, h) => {
    plate(g, w, h, { hairline: false });
    para(g, zs(L(), 'disclaimer'), 18, 18, w - 36, 17, 22, INK.text2);
  });

  // ── category pylons ─────────────────────────────────────────────────────
  const pyl = (key: 'gehen' | 'greifen' | 'bauen'): void => {
    const [x, z] = PYLONS[key];
    const [w, h, d] = PYLONS.size;
    ceramic.push(box(w, h, d, x, h / 2, z));
    alu.push(box(w + 0.03, 0.06, d + 0.03, x, h + 0.03, z), box(w + 0.03, 0.04, d + 0.03, x, 0.02, z));
    statics(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h);
    // two faces with the vertical label: toward the aisle and toward the entrance
    const draw = (g: CanvasRenderingContext2D, W: number, H: number): void => {
      g.fillStyle = INK.bg;
      g.fillRect(0, 0, W, H);
      g.fillStyle = key === 'bauen' ? INK.teal : INK.orange;
      g.fillRect(0, 0, W, 6);
      g.save();
      g.translate(W / 2 + 12, H - 30);
      g.rotate(-Math.PI / 2);
      fitText(g, zs(L(), `pylon.${key}`), 0, 0, H - 60, 44, (px) => FONT.display(px), INK.text);
      g.restore();
    };
    regions.push({ id: `pylon-${key}`, w: 80, h: 520, draw });
    quads.push({ region: `pylon-${key}`, w: w * 0.86, h: h * 0.84, at: [x, h * 0.53, z + d / 2 + 0.003], ry: 0 });
    quads.push({ region: `pylon-${key}`, w: w * 0.86, h: h * 0.84, at: [x + (x < 0 ? w / 2 + 0.003 : -w / 2 - 0.003), h * 0.53, z], ry: x < 0 ? Math.PI / 2 : -Math.PI / 2 });
  };
  pyl('gehen');
  pyl('greifen');
  pyl('bauen');

  // ── FANUC note on its fixed plinth, the Tresor plate ───────────────────────
  carbon.push(box(1.0, 0.1, 0.2, 6.2 - 1.2, 0.35, 3.8 + 1.5));
  sign('fanuc', [400, 76], [0.9, 0.17], [6.2 - 1.2, 0.43, 3.8 + 1.56], 0, (g, w, h) => {
    plate(g, w, h, { hairline: false });
    fitText(g, zs(L(), 'fanuc'), 16, h / 2 + 8, w - 32 - 130, 20, (px) => FONT.sans(px, 500), INK.text);
    fitText(g, zs(L(), 'chip.ha'), w - 16, h / 2 + 6, 120, 13, (px) => FONT.mono(px, 500), INK.text2, 'right');
  }, -0.9);
  const [hx, hz] = TRESOR.at;
  carbon.push(box(1.02, 0.36, 0.22, hx, 0.18, hz + 1.52));
  sign('tresor', [480, 100], [0.95, 0.2], [hx, 0.4, hz + 1.56], 0, (g, w, h) => {
    plate(g, w, h);
    para(g, zs(L(), 'tresor.plate'), 18, 22, w - 36, 20, 26, INK.text, FONT.sans, 3);
  }, -0.9);

  // ── Kistenwaage: the rack in the aisle and one post per load point ─────────
  {
    const [kx, kz] = KISTEN.rack;
    for (const y of [0.05, 0.5, 0.95]) alu.push(box(0.5, 0.03, 1.4, kx, y, kz));
    for (const [dx, dz] of [
      [-0.22, -0.66],
      [0.22, -0.66],
      [-0.22, 0.66],
      [0.22, 0.66],
    ])
      alu.push(box(0.04, 1.0, 0.04, kx + dx, 0.5, kz + dz));
    statics(kx - 0.25, kx + 0.25, kz - 0.7, kz + 0.7, 0.07);
    sign('rack', [330, 108], [0.62, 0.21], [kx - 0.27, 1.2, kz], -Math.PI / 2, (g, w, h) => {
      plate(g, w, h);
      g.textBaseline = 'alphabetic';
      fitText(g, zs(L(), 'kiste.title'), 16, 44, w - 32, 26, (px) => FONT.display(px), INK.text);
      fitText(g, zs(L(), 'kiste.rack'), 16, 84, w - 32, 17, (px) => FONT.mono(px, 500), INK.text2);
    });
    carbon.push(box(0.04, 1.3, 0.04, kx - 0.27, 0.6, kz));
    for (const [id, [px, pz]] of Object.entries(KISTEN.posts)) {
      alu.push(box(0.06, KISTEN.plateY, 0.06, px, KISTEN.plateY / 2, pz));
      carbon.push(box(0.56, 0.04, 0.56, px, KISTEN.plateY, pz));
      statics(px - 0.04, px + 0.04, pz - 0.04, pz + 0.04, KISTEN.plateY);
      ctx.physics.addStaticBox({ size: [0.56, 0.04, 0.56], position: [px, KISTEN.plateY, pz], surface: 'metal' });
      void id;
    }
  }

  // ── compare console between Bühne A and B ─────────────────────────────────
  const [cx, cz] = STAGES.console;
  carbon.push(box(0.1, 0.9, 0.1, cx, 0.45, cz));
  const cScreen = new THREE.Matrix4().makeTranslation(cx, 1.02, cz).multiply(new THREE.Matrix4().makeRotationX(-0.55));
  carbon.push(box(0.6, 0.36, 0.035, 0, 0, -0.02).applyMatrix4(cScreen));
  regions.push({
    id: 'compare',
    w: 300,
    h: 176,
    draw: (g, w, h) => {
      plate(g, w, h);
      g.textBaseline = 'alphabetic';
      fitText(g, zs(L(), 'compare.eyebrow'), 16, 34, w - 32, 15, (px) => FONT.mono(px, 500), INK.text2);
      fitText(g, zs(L(), 'compare.title'), 16, 76, w - 32, 30, (px) => FONT.display(px), INK.text);
      para(g, zs(L(), 'compare.line'), 16, 96, w - 32, 15, 20, INK.text2);
    },
  });
  quads.push({ region: 'compare', w: 0.56, h: 0.33, at: [0, 0, 0], matrix: cScreen.clone() });
  const compareConsole = proxy(ctx, 'compare', [0.8, 1.2, 0.6], [cx, 0.7, cz]);

  // ── Pannen-Wand (album exhibits) and the Fundvitrine (25 compartments) ─────
  const pannenSlots: THREE.Vector3[] = [];
  {
    const { x, z0, z1, y1 } = PANNEN;
    carbon.push(boxMM(x - 0.06, 0.0, z1, x + 0.06, y1 + 0.5, z0));
    sign('pannen', [400, 100], [1.6, 0.4], [x + 0.065, y1 + 0.3, (z0 + z1) / 2], Math.PI / 2, (g, w, h) => {
      plate(g, w, h);
      g.textBaseline = 'alphabetic';
      fitText(g, zs(L(), 'pannen.title'), 18, 52, w - 36, 34, (px) => FONT.display(px), INK.text);
      fitText(g, zs(L(), 'pannen.sub'), 18, 90, w - 36, 17, FONT.sans, INK.text2);
    });
  }
  const pannen = proxy(ctx, 'pannen', [0.6, 1.6, Math.abs(PANNEN.z0 - PANNEN.z1)], [PANNEN.x + 0.3, 1.5, (PANNEN.z0 + PANNEN.z1) / 2]);
  const cells: THREE.Vector3[] = [];
  {
    const { x, z0, z1, depth, cols, rows, y0, y1 } = VITRINE;
    const x0 = x - depth / 2,
      x1 = x + depth / 2;
    ceramic.push(boxMM(x0, 0, z1, x1, y0, z0));
    carbon.push(boxMM(x0 - 0.02, y1, z1 - 0.02, x1 + 0.02, y1 + 0.08, z0 + 0.02), boxMM(x0, y0, z1, x0 + 0.03, y1, z0));
    glass.push(boxMM(x1 - 0.01, y0, z1, x1 + 0.01, y1, z0), boxMM(x0, y0, z0 - 0.01, x1, y1, z0 + 0.01), boxMM(x0, y0, z1 - 0.01, x1, y1, z1 + 0.01));
    const cw = (z0 - z1) / cols,
      ch = (y1 - y0) / rows;
    for (let r = 0; r <= rows; r++) alu.push(boxMM(x0 + 0.03, y0 + r * ch - 0.008, z1, x1 - 0.02, y0 + r * ch + 0.008, z0));
    for (let c = 0; c <= cols; c++) alu.push(boxMM(x0 + 0.03, y0, z1 + c * cw - 0.008, x1 - 0.02, y1, z1 + c * cw + 0.008));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push(new THREE.Vector3(x + 0.05, y1 - (r + 0.5) * ch - ch * 0.25, z0 - (c + 0.5) * cw));
    statics(x0, x1, z1, z0, y1 + 0.08);
    sign('vitrine', [400, 100], [1.4, 0.35], [x1 + 0.02, y1 + 0.4, (z0 + z1) / 2], Math.PI / 2, (g, w, h) => {
      plate(g, w, h);
      g.textBaseline = 'alphabetic';
      fitText(g, zs(L(), 'vitrine.title'), 18, 52, w - 36, 34, (px) => FONT.display(px), INK.text);
      fitText(g, L() === 'en' ? 'Every find of the world lands here' : 'Jeder Fund der Welt landet hier', 18, 90, w - 36, 17, FONT.sans, INK.text2);
    });
  }
  const vitrine = proxy(ctx, 'vitrine', [1.1, 1.7, Math.abs(VITRINE.z0 - VITRINE.z1)], [VITRINE.x + 0.2, 1.35, (VITRINE.z0 + VITRINE.z1) / 2]);

  // ── the „Danke“ room shell (egg 15 „Werkbank der Offenen“, R9 §5 #15) ──────
  let dankeWall: THREE.Object3D;
  {
    const { x0, x1, z0, z1, door } = DANKE;
    const H = 3.1;
    // inner walls (west and south, the hall's glass and frosted walls close the rest) and a ceiling
    frost.push(boxMM(x0 - 0.04, 0, z0, x0 + 0.04, H, z1));
    ceramic.push(boxMM(x0, 0, z1 - 0.06, door.x0, H, z1 + 0.06), boxMM(door.x1, 0, z1 - 0.06, x1, H, z1 + 0.06), boxMM(door.x0, door.h, z1 - 0.06, door.x1, H, z1 + 0.06));
    carbon.push(boxMM(x0, H, z0, x1, H + 0.08, z1 + 0.06));
    alu.push(boxMM(door.x0 - 0.05, 0, z1 - 0.07, door.x0, door.h, z1 + 0.07), boxMM(door.x1, 0, z1 - 0.07, door.x1 + 0.05, door.h, z1 + 0.07), boxMM(door.x0 - 0.05, door.h, z1 - 0.07, door.x1 + 0.05, door.h + 0.05, z1 + 0.07));
    statics(x0 - 0.05, x0 + 0.05, z0, z1, H);
    statics(x0, door.x0, z1 - 0.07, z1 + 0.07, H);
    statics(door.x1, x1, z1 - 0.07, z1 + 0.07, H);
    // the long workbench along the east wall: every real model as a small cast (the line-up, 1:4)
    ceramic.push(boxMM(x1 - 0.9, 0, z0 + 0.4, x1 - 0.15, 0.82, z1 - 0.5));
    carbon.push(boxMM(x1 - 0.92, 0.82, z0 + 0.38, x1 - 0.13, 0.86, z1 - 0.48));
    statics(x1 - 0.9, x1 - 0.15, z0 + 0.4, z1 - 0.5, 0.86);
    sign('danke-door', [240, 72], [0.95, 0.29], [(door.x0 + door.x1) / 2, door.h + 0.3, z1 + 0.065], 0, (g, w, h) => {
      plate(g, w, h);
      fitText(g, zs(L(), 'danke.door'), w / 2, h / 2 + 12, w - 30, 38, (px) => FONT.display(px), INK.text, 'center');
    });
    // the credits board on the room's back (north) wall, inside
    dankeWall = proxy(ctx, 'danke', [3.2, 2.0, 0.4], [(x0 + x1) / 2, 1.6, z0 + 0.35]);
  }

  // ── the three Kurzlauf consoles (screens facing north, into the hall) ──────
  const screens = {} as Furniture['screens'];
  const kurzlauf = {} as Furniture['kurzlauf'];
  for (const key of ['belohnung', 'erntetag', 'traumdaten'] as const) {
    const [x, z] = KURZLAUF[key];
    const w = KURZLAUF.w;
    carbon.push(box(w, 0.08, 0.6, x, 0.04, z), box(0.12, 1.05, 0.12, x, 0.55, z + 0.1));
    carbon.push(box(w + 0.06, 0.92, 0.05, x, 1.55, z + 0.05));
    statics(x - w / 2, x + w / 2, z - 0.3, z + 0.3, 1.0);
    screens[key] = { at: new THREE.Vector3(x, 1.55, z + 0.02), w: w - 0.06, h: 0.84 };
    kurzlauf[key] = proxy(ctx, `kurzlauf-${key}`, [w, 1.6, 0.8], [x, 1.1, z - 0.2]);
  }
  // a low table in front of the reward console: the mini test track for the duck recording
  ceramic.push(box(1.7, 0.62, 0.62, KURZLAUF.belohnung[0], 0.31, KURZLAUF.belohnung[1] - 0.95));
  statics(KURZLAUF.belohnung[0] - 0.85, KURZLAUF.belohnung[0] + 0.85, KURZLAUF.belohnung[1] - 1.26, KURZLAUF.belohnung[1] - 0.64, 0.62);

  // ── SELBST BAUEN: the parts-cost plate at its pylon ────────────────────────
  const [bx, bz] = PYLONS.bauen;
  const bauen = proxy(ctx, 'bauen', [0.7, 3.4, 0.7], [bx, 1.7, bz]);

  // ── merge and add ──────────────────────────────────────────────────────
  det.add(mesh(carbon, ctx.materials.carbon, 'schauhalle:carbon'));
  det.add(mesh(alu, ctx.materials.brushedAlu, 'schauhalle:alu-in'));
  det.add(mesh(ceramic, mats.ceramic, 'schauhalle:ceramic'));
  det.add(mesh(glass, ctx.materials.glassClear, 'schauhalle:glass-in', { receive: false }));
  det.add(mesh(frost, mats.frost, 'schauhalle:frost-in', { receive: false }));
  const signs = buildAtlas('signs', [1024, 1024], regions, quads);
  det.add(signs.mesh);
  ctx.i18n.onChange(() => signs.redraw());
  void (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(() => signs.redraw());
  ctx.onDispose(() => signs.dispose());
  void cyl;
  return { signs, terminal, compareConsole, pannen, vitrine, dankeWall, plaque, bauen, kurzlauf, screens, cells, pannenSlots };
}
