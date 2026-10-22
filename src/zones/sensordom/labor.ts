/**
 * Interior (floor, LED ring, guide inlays) and Station A "Messbrille" (Probieren):
 * EMI-02 needs five things tagged for its gripper. An object can be tagged only in a visor mode
 * in which that sensor really returns it (GDD matrix below). The crosshair readout shows what the
 * current sensor measures at the centre of the view.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { InfoCardSpec, WorldLabelHandle } from '@/core/zones';
import { css } from '@/core/zones';
import { placed, type V3 } from './kit';
import { G_MIRROR, G_SOLID, G_THIN, G_GLASS } from './lidar';
import { fresnelGlass, inlayMaterial, mirrorMaterial, own } from './materials';
import { rbox } from './look';
import { DOME, PORTAL, domeHeightAt } from './dome';
import { MODES, type VisorMode } from './visor';
import type { Sd } from './types';
import { canvasSign } from './signs';
import { GAG } from './tuning';

export type TargetId = 'becher' | 'flasche' | 'samt' | 'kabel' | 'spiegel';
/** GDD §7.1 matrix: ✓ = taggable, '~' = faint (not enough), ✗ = not seen */
export const MATRIX: Record<TargetId, Record<VisorMode, '✓' | '~' | '✗'>> = {
  becher: { rgb: '~', tiefe: '✓', lidar: '✓', seg: '✓' },
  flasche: { rgb: '✓', tiefe: '✗', lidar: '✗', seg: '✗' },
  samt: { rgb: '✗', tiefe: '✗', lidar: '✓', seg: '✓' },
  kabel: { rgb: '✓', tiefe: '✗', lidar: '✗', seg: '✓' },
  spiegel: { rgb: '✓', tiefe: '~', lidar: '~', seg: '✗' },
};
const NOTES: Record<TargetId, Record<VisorMode, { de: string; en: string }>> = {
  becher: { rgb: { de: 'schwach', en: 'faint' }, tiefe: { de: 'Form', en: 'shape' }, lidar: { de: 'Punkte', en: 'points' }, seg: { de: 'Klasse', en: 'class' } },
  flasche: { rgb: { de: 'Kanten', en: 'edges' }, tiefe: { de: 'Loch', en: 'hole' }, lidar: { de: 'Luft', en: 'air' }, seg: { de: 'fehlt', en: 'missing' } },
  samt: { rgb: { de: 'zu dunkel', en: 'too dark' }, tiefe: { de: 'kein Echo', en: 'no return' }, lidar: { de: 'Punkte', en: 'points' }, seg: { de: 'Klasse', en: 'class' } },
  kabel: { rgb: { de: 'sichtbar', en: 'visible' }, tiefe: { de: 'zu dünn', en: 'too thin' }, lidar: { de: 'Lücke', en: 'gap' }, seg: { de: 'Klasse', en: 'class' } },
  spiegel: { rgb: { de: 'Rahmen', en: 'frame' }, tiefe: { de: 'zu tief', en: 'too deep' }, lidar: { de: 'Geister', en: 'ghosts' }, seg: { de: 'fehlt', en: 'missing' } },
};
export const TARGET_IDS: TargetId[] = ['becher', 'flasche', 'samt', 'kabel', 'spiegel'];

/** shelf frame: position, yaw; local +z = front */
export const SHELF = { x: -11, z: -1, ry: 1.22 };
export const shelfPt = (lx: number, ly: number, lz: number): V3 => {
  const c = Math.cos(SHELF.ry),
    s = Math.sin(SHELF.ry);
  return [SHELF.x + lx * c + lz * s, ly, SHELF.z - lx * s + lz * c];
};
const TABLE = { x: -7, z: 3 };

export interface Labor {
  update(dt: number): void;
  solve(): void;
  readonly done: boolean;
  /** called every frame while in the dome (attempt clock, Entscheider skip timer) */
  tickDome(dt: number): void;
  /** test hook: a ★★★ result (1 view switch, 42 s) */
  stars3(): void;
  /** the player pressed a visor key (1–4 / V): the Sensor-Suche clock starts */
  /** a visor key in the dome (changed = the view really switched) */
  visorKey(changed: boolean): void;
}

export function buildLabor(sd: Sd): Labor {
  const { ctx, B, visor, lidar, look } = sd;
  const M = ctx.materials;

  // ── floor, LED ring, inlays ──────────────────────────────────────────────
  // carbon-composite floor with a 1 m seam grid at 6 % (a dim interior: ART-V2 §6.0)
  const floor = new THREE.CircleGeometry(DOME.R - 0.1, 64).rotateX(-Math.PI / 2);
  B.geo(placed(floor, [0, 0.05, DOME.cz]), { mat: domeFloorMaterial(ctx), seg: 'boden' });
  // walkable collider = the island deck (y 0); a second floor 5 cm above it makes the KCC snag on deck edges
  lidar.addBox([34, 0.1, 34], [0, 0.0, DOME.cz], null, G_SOLID, { seg: 'boden', depth: 'normal' });
  const ring = new THREE.TorusGeometry(15.6, 0.02, 6, 120, Math.PI * 2 - 0.3).rotateX(Math.PI / 2).rotateY(Math.PI / 2 + 0.15);
  B.geo(placed(ring, [0, 0.32, DOME.cz]), { mat: look.light('teal', 0), seg: 'struktur' });
  // light pools: additive floor decals under the lamps and the doors (no extra lights) + ceiling discs
  lightPools(sd, [
    [TABLE.x, TABLE.z, 3.2, 0.42],
    [7.2, 4.4, 3.0, 0.36],
    [0, -5.6, 2.4, 0.28],
    [0, 9.4, 2.6, 0.28],
    [-3, 6.9, 1.6, 0.2],
  ]);
  // guide inlays from the portal to the three stations
  const inlay = (pts: [number, number][]): void => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i],
        [x1, z1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      B.geo(placed(new THREE.BoxGeometry(0.07, 0.008, len), [(x0 + x1) / 2, 0.056, (z0 + z1) / 2], [0, Math.atan2(x1 - x0, z1 - z0), 0]), { mat: inlayMaterial(), seg: 'boden' });
    }
  };
  inlay([[0, PORTAL.z0 - 0.2], [0, 6.2], [-3.8, 4.6]]);
  inlay([[0, 6.2], [0, -5.3]]);
  inlay([[0, 6.2], [4.6, 8.6]]);

  // lamp over the scan table (fixture + virtual light #1)
  const lampMat = look.light('warm', 1, { dusk: false });
  for (const [x, z] of [[TABLE.x, TABLE.z]] as [number, number][]) {
    B.geo(placed(new THREE.CylinderGeometry(0.012, 0.012, 2.4, 6), [x, 4.6, z]), { mat: look.alu, seg: 'struktur' });
    B.geo(placed(new THREE.CylinderGeometry(0.22, 0.46, 0.34, 24, 1, true), [x, 3.25, z]), { mat: look.hull, seg: 'struktur' });
    B.geo(placed(new THREE.CircleGeometry(0.43, 24).rotateX(Math.PI / 2), [x, 3.09, z]), { mat: lampMat, seg: 'struktur' });
  }
  ctx.lights.point([TABLE.x, 2.95, TABLE.z], { color: 0xffd2a8, intensity: 32, distance: 11 });

  // ── scan table + gantry + clutter ────────────────────────────────────────
  const tx = TABLE.x,
    tz = TABLE.z;
  B.box({ size: [1.5, 0.06, 3.0], pos: [tx, 0.87, tz], mat: look.hull, seg: 'moebel', round: 0.025 });
  B.geo(placed(new THREE.BoxGeometry(1.52, 0.02, 3.02), [tx, 0.835, tz]), { mat: look.alu, seg: 'moebel' });
  // light scan mat with a 10 cm grid (objects read against it)
  const matTex = own(
    M.canvasTexture(256, 512, (g: CanvasRenderingContext2D, w: number, h: number) => {
      g.fillStyle = '#a8a29e';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(41,37,36,0.35)';
      g.lineWidth = 1;
      for (let i = 0; i <= 13; i++) {
        g.beginPath();
        g.moveTo((i / 13) * w, 0);
        g.lineTo((i / 13) * w, h);
        g.stroke();
      }
      for (let i = 0; i <= 26; i++) {
        g.beginPath();
        g.moveTo(0, (i / 26) * h);
        g.lineTo(w, (i / 26) * h);
        g.stroke();
      }
      g.fillStyle = '#2dd4bf';
      g.fillRect(0, 0, w, 3);
      g.fillRect(0, h - 3, w, 3);
    }),
  );
  B.geo(placed(new THREE.PlaneGeometry(1.3, 2.6).rotateX(-Math.PI / 2), [tx, 0.902, tz]), { mat: own(new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.8, metalness: 0, name: 'sensordom:scanmat' })), seg: 'moebel' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box({ size: [0.07, 0.84, 0.07], pos: [tx + sx * 0.68, 0.42, tz + sz * 1.42], mat: look.alu, seg: 'moebel', collide: false });
  B.box({ size: [1.4, 0.03, 2.9], pos: [tx, 0.25, tz], mat: look.carbon, seg: 'moebel' });
  for (const z of [tz - 1.45, tz + 1.45]) B.box({ size: [0.08, 2.3, 0.08], pos: [tx - 0.72, 1.15, z], mat: look.alu, seg: 'geraet' });
  B.box({ size: [0.12, 0.12, 3.0], pos: [tx - 0.72, 2.3, tz], mat: look.alu, seg: 'geraet', collide: false });
  B.geo(placed(new THREE.BoxGeometry(0.8, 0.06, 0.06), [tx - 0.34, 2.24, tz - 0.4]), { mat: look.alu, seg: 'geraet' });
  B.geo(placed(rbox(0.2, 0.12, 0.16, 0.02), [tx + 0.05, 2.16, tz - 0.4]), { mat: look.shell, seg: 'geraet' });
  B.geo(placed(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 16), [tx + 0.0, 2.095, tz - 0.4]), { mat: look.light('teal', 1), seg: 'geraet' });
  B.geo(placed(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 16), [tx + 0.1, 2.095, tz - 0.4]), { mat: look.light('teal', 1), seg: 'geraet' });
  // clutter (boxes, a tablet, a spare gripper)
  B.box({ size: [0.34, 0.22, 0.28], pos: [tx - 0.25, 1.01, tz + 0.55], mat: M.crate, seg: 'kiste' });
  B.box({ size: [0.22, 0.14, 0.2], pos: [tx + 0.15, 0.97, tz + 1.05], mat: M.crate, seg: 'kiste' });
  B.box({ size: [0.3, 0.015, 0.22], pos: [tx + 0.32, 0.908, tz + 0.1], rot: [0, 0.3, 0], mat: M.panel, seg: 'geraet' });
  B.box({ size: [0.12, 0.08, 0.16], pos: [tx - 0.15, 0.94, tz + 1.3], mat: M.steel, seg: 'geraet' });
  for (const s of [-1, 1]) B.geo(placed(new THREE.BoxGeometry(0.025, 0.14, 0.03), [tx - 0.15 + s * 0.04, 1.05, tz + 1.36]), { mat: M.steel, seg: 'geraet' });
  B.box({ size: [0.6, 0.3, 0.4], pos: [tx + 0.2, 0.42, tz - 0.7], mat: M.crate, seg: 'kiste', collide: false });

  // ── shelf with the stone niche ───────────────────────────────────────────
  const ry = SHELF.ry;
  const shelfBox = (size: V3, l: V3, mat: THREE.Material, seg: 'moebel' | 'kiste' = 'moebel', collide = true): void =>
    B.box({ size, pos: shelfPt(l[0], l[1], l[2]), rot: [0, ry, 0], mat, seg, collide: collide ? 'solid' : false });
  // carbon shelf (the dark corner stays dark: the velvet box must not stand out in RGB) with alu edges
  for (const sx of [-1, 1]) shelfBox([0.04, 2.0, 0.5], [sx * 1.23, 1.0, 0], look.alu);
  shelfBox([2.5, 2.0, 0.02], [0, 1.0, -0.24], look.carbon);
  for (const y of [0.04, 0.5, 1.0, 1.5, 1.98]) shelfBox([2.46, 0.03, 0.48], [0, y, 0], look.carbon);
  const nicheMat = M.standard({ color: 0xd6d3d1, roughness: 0.85, metalness: 0 });
  for (const sx of [-1, 1]) shelfBox([0.02, 0.47, 0.46], [sx * 0.27, 1.25, 0], nicheMat, 'moebel', false);
  shelfBox([0.56, 0.47, 0.02], [0, 1.25, -0.22], nicheMat, 'moebel', false);
  shelfBox([0.56, 0.02, 0.46], [0, 1.026, 0], nicheMat, 'moebel', false);
  shelfBox([0.56, 0.02, 0.46], [0, 1.474, 0], nicheMat, 'moebel', false);
  // shelf clutter
  shelfBox([0.4, 0.3, 0.32], [-0.75, 0.66, 0.02], M.crate, 'kiste', false);
  shelfBox([0.3, 0.2, 0.3], [0.7, 0.61, 0.0], M.crate, 'kiste', false);
  shelfBox([0.5, 0.36, 0.34], [0.75, 1.69, 0.0], M.crate, 'kiste', false);
  shelfBox([0.26, 0.18, 0.26], [-0.8, 1.11, 0.0], M.crate, 'kiste', false);

  // ── the five targets ─────────────────────────────────────────────────────
  const front = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
  const objects: Record<TargetId, THREE.Object3D> = {} as Record<TargetId, THREE.Object3D>;
  const centers: Record<TargetId, THREE.Vector3> = {} as Record<TargetId, THREE.Vector3>;

  // Becher: stone-300 cup in the stone-300 niche (0.3 m in front of the niche back)
  const cupProfile = [
    [0, 0],
    [0.036, 0],
    [0.04, 0.006],
    [0.046, 0.105],
    [0.042, 0.106],
    [0.036, 0.012],
    [0, 0.012],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const cupGeo = new THREE.LatheGeometry(cupProfile, 24);
  const cupHandle = new THREE.TorusGeometry(0.03, 0.006, 6, 16, Math.PI).rotateZ(-Math.PI / 2).translate(0.046, 0.055, 0);
  const cupMesh = B.mesh(mergeTwo(cupGeo, cupHandle), { mat: nicheMat, seg: 'becher', depth: 'normal' });
  const cp = shelfPt(0, 1.037, 0.06);
  cupMesh.position.set(cp[0], cp[1], cp[2]);
  cupMesh.rotation.y = ry + 0.6;
  objects.becher = cupMesh;
  centers.becher = new THREE.Vector3(cp[0], cp[1] + 0.06, cp[2]);
  lidar.addCylinder(0.046, 0.106, [cp[0], cp[1] + 0.053, cp[2]], G_SOLID, { seg: 'becher', depth: 'normal', contrast: 4, target: 'becher' });

  // Glasflasche on the table
  const bottleProfile = [
    [0, 0],
    [0.04, 0],
    [0.044, 0.008],
    [0.044, 0.19],
    [0.036, 0.235],
    [0.015, 0.27],
    [0.015, 0.31],
    [0.018, 0.315],
    [0, 0.318],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bottle = B.mesh(new THREE.LatheGeometry(bottleProfile, 28), { mat: fresnelGlass({ base: 0.14, tint: 0x78716c, rim: 0x1c1917, streak: true }), seg: 'unsichtbar', depth: 'none', lidarVis: 'hide' });
  bottle.position.set(tx + 0.25, 0.904, tz - 0.75);
  bottle.renderOrder = 2;
  objects.flasche = bottle;
  centers.flasche = new THREE.Vector3(tx + 0.25, 1.06, tz - 0.75);
  ctx.physics.addStaticBoxSensorIgnore({ size: [0.09, 0.32, 0.09], position: [tx + 0.25, 1.06, tz - 0.75], surface: 'glass' });
  lidar.addCylinder(0.044, 0.318, [tx + 0.25, 1.059, tz - 0.75], G_GLASS, { seg: 'unsichtbar', depth: 'none', contrast: 31, target: 'flasche' });

  // Schwarze Samtkiste in the dark corner at the foot of the shelf
  const velvetMat = M.standard({ color: 0x050505, roughness: 1, metalness: 0 });
  const sp = shelfPt(1.55, 0.24, 0.62);
  const velvet = B.mesh(new THREE.BoxGeometry(0.55, 0.38, 0.42), { mat: velvetMat, seg: 'kiste', depth: 'none' });
  velvet.position.set(sp[0], sp[1], sp[2]);
  velvet.rotation.y = ry + 0.15;
  objects.samt = velvet;
  centers.samt = new THREE.Vector3(sp[0], 0.35, sp[2]);
  ctx.physics.addStaticBox({ size: [0.55, 0.38, 0.42], position: sp, rotation: [0, ry + 0.15, 0], surface: 'rubber' });
  lidar.addBox([0.55, 0.38, 0.42], sp, [0, ry + 0.15, 0], G_SOLID, { seg: 'kiste', depth: 'none', contrast: 1, target: 'samt' });

  // Kabel am Boden, Ø 16 mm, from the table to a floor socket
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(tx + 0.66, 0.055, tz + 1.35),
    new THREE.Vector3(-5.7, 0.055, 4.95),
    new THREE.Vector3(-4.95, 0.055, 4.6),
    new THREE.Vector3(-4.25, 0.055, 5.25),
    new THREE.Vector3(-3.86, 0.055, 5.78),
  ]);
  const cableGroup = new THREE.Group();
  ctx.groups.detail.add(cableGroup);
  // 16 mm power cable (was 8 mm: under 2 px from 3 m, the fresh-eyes playtest could not find it in any view)
  B.mesh(new THREE.TubeGeometry(curve, 80, 0.008, 8, false), { mat: M.standard({ color: 0xf5f5f4, roughness: 0.5, metalness: 0 }), seg: 'kabel', depth: 'normal', lidarVis: 'hide' }, cableGroup);
  const proxy = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.07, 4, false), M.basic(0x000000));
  proxy.visible = false;
  cableGroup.add(proxy);
  objects.kabel = cableGroup;
  centers.kabel = curve.getPoint(0.5);
  for (let i = 0; i < 8; i++) {
    const a = curve.getPoint(i / 8),
      b = curve.getPoint((i + 1) / 8);
    lidar.addBox([0.05, 0.012, a.distanceTo(b)], [(a.x + b.x) / 2, 0.059, (a.z + b.z) / 2], [0, Math.atan2(b.x - a.x, b.z - a.z), 0], G_THIN, { seg: 'kabel', depth: 'normal', contrast: 46, target: 'kabel' });
  }
  B.box({ size: [0.22, 0.32, 0.22], pos: [-3.76, 0.16, 5.86], mat: look.hull, seg: 'geraet', round: 0.02 });
  B.geo(placed(new THREE.BoxGeometry(0.1, 0.03, 0.01), [-3.76, 0.26, 5.75]), { mat: look.light('teal', 1), seg: 'geraet' });

  // Spiegel: standing mirror beside the shelf, angled at the table
  const mp = shelfPt(-1.95, 0, 0.55);
  const mry = ry - 0.05;
  const mirrorGroup = new THREE.Group();
  mirrorGroup.position.set(mp[0], 0.05, mp[2]);
  mirrorGroup.rotation.y = mry;
  ctx.groups.detail.add(mirrorGroup);
  const mirror = B.mesh(new THREE.PlaneGeometry(0.8, 1.6), { mat: mirrorMaterial(ctx), seg: 'unbekannt', depth: 'mirror' }, mirrorGroup);
  mirror.position.set(0, 1.08, 0.018);
  const frame = B.mesh(
    mergeAll([
      placed(new THREE.BoxGeometry(0.9, 0.05, 0.04), [0, 1.9, 0]),
      placed(new THREE.BoxGeometry(0.9, 0.05, 0.04), [0, 0.26, 0]),
      placed(new THREE.BoxGeometry(0.05, 1.7, 0.04), [-0.43, 1.08, 0]),
      placed(new THREE.BoxGeometry(0.05, 1.7, 0.04), [0.43, 1.08, 0]),
      placed(new THREE.BoxGeometry(0.03, 0.26, 0.03), [-0.3, 0.13, -0.02]),
      placed(new THREE.BoxGeometry(0.03, 0.26, 0.03), [0.3, 0.13, -0.02]),
      placed(new THREE.BoxGeometry(0.7, 0.03, 0.34), [0, 0.015, -0.04]),
    ]),
    { mat: look.alu, seg: 'moebel' },
    mirrorGroup,
  );
  void frame;
  objects.spiegel = mirrorGroup;
  centers.spiegel = new THREE.Vector3(mp[0], 1.08, mp[2]);
  const mn = new THREE.Vector3(Math.sin(mry), 0, Math.cos(mry));
  ctx.physics.addStaticBox({ size: [0.9, 1.9, 0.06], position: [mp[0], 0.95, mp[2]], rotation: [0, mry, 0], surface: 'glass' });
  lidar.addBox([0.8, 1.6, 0.02], [mp[0] + mn.x * 0.018, 1.08, mp[2] + mn.z * 0.018], [0, mry, 0], G_MIRROR, { seg: 'unbekannt', depth: 'mirror', normal: mn, target: 'spiegel' });
  lidar.addBox([0.9, 1.9, 0.04], [mp[0] - mn.x * 0.01, 0.95, mp[2] - mn.z * 0.01], [0, mry, 0], G_SOLID, { seg: 'moebel', depth: 'normal' });
  void front;

  // ── station sign ─────────────────────────────────────────────────────────
  canvasSign(sd, { eyebrow: sd.text('sign.aEyebrow'), title: sd.text('sign.aTitle'), body: sd.text('sign.aBody'), width: 1.9, height: 1.05, stand: true, position: [-4.5, 0, 7.2], rotationY: 1.0 });

  // ── tagging: „Sensor-Suche" (FUN-PLAN S1) ─────────────────────────────────
  // ★ all 5 tagged (the stamp) · ★★ ≤ 6 view switches · ★★★ ≤ 6 switches and ≤ 90 s. Phase 7 (plan §4.2,
  // R6 #8): E on an object the active view does not return is a harmless gag again — EMI-02 grabs thin
  // air and a popup names the blind spot („Glasflasche · LiDAR: Luft“); no star cost (no clock start, no
  // switch counted). Time runs from the first visor key or tag in the dome (after a retry: from the next
  // visor key) to the 5th tag.
  const SWITCH_BUDGET = 6;
  const G = ctx.game;
  const tagged = new Map<TargetId, VisorMode>(ctx.progress.get<[TargetId, VisorMode][]>('tags', []));
  const labels = new Map<TargetId, WorldLabelHandle>();
  const modeName = (m: VisorMode): string => ctx.t(`mode.${m}`);
  const nameOf = (id: TargetId): string => ctx.t(`obj.${id}`);
  const panel = ctx.hud.panel({ eyebrow: '', rows: [] });
  panel.setVisible(false);
  let bump: TargetId | null = null;
  const refreshPanel = (): void => {
    panel.setEyebrow(ctx.t('list.eyebrow', { n: tagged.size }));
    panel.setRows(
      TARGET_IDS.map((id) => {
        const m = tagged.get(id);
        return { k: nameOf(id), v: m ? `✓ ${modeName(m)}` : ctx.t('list.open'), tone: id === bump ? 'accent' : m ? 'teal' : 'default' };
      }),
    );
  };
  ctx.i18n.onChange(() => {
    refreshPanel();
    for (const [id, l] of labels) l.setText(`✓ ${nameOf(id)}`);
  });
  const showLabel = (id: TargetId): void => {
    if (labels.has(id)) return;
    labels.set(id, ctx.hud.worldLabel(centers[id].clone().setY(centers[id].y + 0.25), () => `✓ ${nameOf(id)}`, { eyebrow: () => `// ${modeName(tagged.get(id) ?? 'rgb')}`, kind: 'accent', maxDistance: 9 }));
  };
  for (const id of tagged.keys()) showLabel(id);
  refreshPanel();

  let done = ctx.pass.has('messbrille');
  // the current attempt
  const run = { start: null as number | null, armed: false, switches: 0, lastLive: -1 };
  const elapsedRun = (): number => (run.start == null ? 0 : ctx.time.elapsed - run.start);
  const fmtClock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const live = (): void => {
    if (run.start == null || tagged.size >= TARGET_IDS.length) return;
    // another station's operate panel owns the screen: no Messbrille chip over it
    if (ctx.player.operating) return void ch.live(null);
    const sw = run.switches ? ` · ${ctx.t('game.a.switches', { n: run.switches })}` : '';
    ch.live(`${tagged.size}/5 · ${fmtClock(elapsedRun())}${sw}`);
  };
  const startRun = (): void => {
    if (run.start != null || tagged.size >= TARGET_IDS.length) return;
    run.start = ctx.time.elapsed;
    run.armed = false;
    void ch.begin();
    live();
  };

  const ch = G.challenge({
    id: 'messbrille',
    title: sd.text('game.a.title'),
    metric: { label: sd.text('game.a.metric'), unit: 's', better: 'lower', digits: 0 },
    goals: [{ text: sd.text('game.a.g1') }, { text: sd.text('game.a.g2') }, { text: sd.text('game.a.g3'), at: 90 }],
    lesson: sd.text('game.a.lesson'),
    why: () => cardA(sd, tagged),
    retry: () => retry(),
    emi: sd.emi,
    lines: { fail: [sd.text('game.a.fail1'), sd.text('game.a.fail2')] },
  });
  const chips = ch.chips();
  chips.style.margin = '8px 0 2px';
  panel.el.append(chips);

  const complete = (): void => {
    const t = Math.max(1, Math.round(elapsedRun()));
    const sw = run.switches;
    run.start = null;
    const stars = (1 + (sw <= SWITCH_BUDGET ? 1 : 0) + (sw <= SWITCH_BUDGET && t <= 90 ? 1 : 0)) as 1 | 2 | 3;
    const detail = sd.text('game.a.detail', { n: sw });
    const firstStamp = !done;
    if (firstStamp) {
      done = true;
      const n = Math.max(new Set(tagged.values()).size, sd.modesSeen.size);
      ctx.pass.award('messbrille', { value: { de: `5/5 · ${n} Sensorbilder genutzt`, en: `5/5 · ${n} sensor views used` }, curve: MODES.map((m) => [...tagged.values()].filter((x) => x === m).length) });
      ctx.after(3.2, () => void sd.emi.driveTo([-1.4, 0, -3.6], { speed: 1.1 }));
      sd.refreshObjective();
    }
    ch.submit(t, { stars, detail });
    G.juice.burst(sd.emi.object, { tone: 'teal', count: 60, spread: 1.2 });
    G.juice.cue('great');
    void sd.emi.gesture('nod');
  };

  let lastTagLine = -20;
  let firstTag = !tagged.size;
  // the gag: EMI-02 reaches for the object and closes its hand on air (≈ 1,3 s), the popup names the blind spot
  let gagUntil = 0;
  let gags = 0;
  const gag = (id: TargetId): void => {
    const now = ctx.time.elapsed;
    if (now < gagUntil) return;
    gagUntil = now + GAG.cooldownS;
    const mode = visor.mode;
    const at = popupAnchor(ctx, centers[id]);
    G.juice.popup(at, (lang) => `${nameOf(id)} · ${modeName(mode)}: ${NOTES[id][mode][lang === 'en' ? 'en' : 'de']}`, { tone: 'muted', seconds: GAG.popupS });
    G.juice.cue('oops', { at: centers[id] });
    ctx.audio.tone({ freq: 640, to: 210, dur: 0.22, type: 'sine', volume: 0.22, at: centers[id] });
    // EMI-02's empty grab: the right arm swings out, the hand closes on nothing, back
    const emi = sd.emi;
    emi.lookAt(ctx.toWorld(centers[id]));
    if (!ctx.settings.reducedMotion) {
      emi.setJoint('shoulder_pitch_r', -1.35);
      emi.setJoint('elbow_r', -0.15);
      ctx.after(GAG.closeAtS, () => emi.setJoint('wrist_roll_r', 0.6));
      ctx.after(GAG.returnAtS, () => {
        for (const j of ['shoulder_pitch_r', 'elbow_r', 'wrist_roll_r']) emi.releaseJoint(j);
        void emi.gesture('shrug');
      });
    } else void emi.gesture('shrug');
    ctx.after(GAG.lookS, () => emi.lookAt(null));
    // the first two misses get a line (≤ 18 words), the rest only the popup
    if (gags++ < GAG.linesMax) sd.say(gags === 1 ? 'emi.gag1' : 'emi.gag2', { m: modeName(mode) });
  };
  const tag = (id: TargetId): void => {
    if (tagged.has(id) || tagged.size >= TARGET_IDS.length) return;
    if (sd.region() !== 'dome') return;
    const mode = visor.mode;
    // a view that does not return the object: the gag (no clock start, no star lost)
    if (MATRIX[id][mode] !== '✓') return gag(id);
    startRun();
    // popups rise ≈ 1.25 m: anchor them on the line of sight ≤ 3 m away, below eye height
    const at = popupAnchor(ctx, centers[id]);
    tagged.set(id, mode);
    ctx.progress.set('tags', [...tagged.entries()]);
    G.juice.burst(centers[id], { tone: 'teal', count: 28, spread: 0.35 });
    G.juice.popup(at, () => `✓ ${nameOf(id)} · ${modeName(mode)}`, { tone: 'teal' });
    G.juice.cue('good', { at: centers[id], pitch: 1 + tagged.size * 0.06 });
    lidar.splash(centers[id], 0.18, 120, ctx.time.elapsed);
    showLabel(id);
    bump = id;
    refreshPanel();
    ctx.after(0.8, () => {
      if (bump === id) bump = null;
      refreshPanel();
    });
    const left = TARGET_IDS.length - tagged.size;
    if (left > 0) {
      // the second EMI line comes after the first action (≤ 25 words before the first input)
      if (firstTag) {
        firstTag = false;
        lastTagLine = ctx.time.elapsed;
        sd.say('emi.task');
      } else if (ctx.time.elapsed - lastTagLine > 14 && left <= 2) {
        lastTagLine = ctx.time.elapsed;
        sd.say('emi.tagged', { n: left });
      }
      sd.emi.lookAt(ctx.toWorld(centers[id]));
      ctx.after(2.5, () => sd.emi.lookAt(null));
      live();
    } else complete();
  };

  const retry = (): void => {
    tagged.clear();
    ctx.progress.set('tags', []);
    for (const l of labels.values()) l.remove();
    labels.clear();
    run.start = null;
    run.switches = 0;
    run.armed = true; // the clock restarts at the next visor key
    firstTag = false;
    ch.live(null);
    refreshPanel();
    ctx.ui.hint(sd.text('game.a.retryHint'), 3);
  };
  // the clock starts with the first visor key (or the first tag) in the dome: the first input of the toy
  // (forced mode changes — leaving the darkroom, operate mode — don't count; see visorKey())

  // the prompt shows in every view; in a view that falls short its hint says so, and E is the gag
  const sees = (id: TargetId): boolean => MATRIX[id][visor.mode] === '✓';
  for (const id of TARGET_IDS) {
    ctx.addInteractable({
      object: objects[id],
      label: () => ctx.t('tag.label', { name: nameOf(id) }),
      hint: () => (sees(id) ? ctx.t('tag.hint') : ctx.t('tag.wrong', { name: nameOf(id), mode: modeName(visor.mode) })),
      range: 3.2,
      onInteract: () => tag(id),
      isEnabled: () => tagged.size < TARGET_IDS.length && !tagged.has(id) && sd.region() === 'dome' && !ctx.player.operating,
    });
  }

  // ── Entscheider: skip after 30 s ─────────────────────────────────────────
  let domeTime = 0;
  let skipHinted = false;
  const skipBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.04, 20), M.accentOrange);
  skipBtn.position.set(tx + 0.62, 0.92, tz + 1.3);
  ctx.groups.detail.add(skipBtn);
  skipBtn.visible = false;
  ctx.addInteractable({
    object: skipBtn,
    label: sd.text('skip.label'),
    hint: sd.text('skip.hint'),
    isEnabled: () => skipBtn.visible && !done,
    onInteract: () => {
      if (done) return;
      done = true;
      skipBtn.visible = false;
      run.start = null;
      ch.live(null);
      ctx.pass.award('messbrille', { skipped: true, value: { de: 'übersprungen', en: 'skipped' } });
      sd.refreshObjective();
      ctx.after(1.5, () => void sd.emi.driveTo([-1.4, 0, -3.6], { speed: 1.1 }));
    },
  });

  return {
    get done() {
      return done;
    },
    update() {
      const inDome = sd.region() === 'dome';
      const active = tagged.size < TARGET_IDS.length;
      panel.setVisible(inDome && (active || !done) && !ctx.player.operating);
      if (run.start != null && Math.floor(elapsedRun()) !== run.lastLive) {
        run.lastLive = Math.floor(elapsedRun());
        live();
      }
    },
    visorKey(changed) {
      if (sd.region() !== 'dome' || ctx.player.operating) return;
      startRun();
      if (changed && run.start != null && tagged.size < TARGET_IDS.length) {
        run.switches++;
        live();
      }
    },
    tickDome(dt) {
      if (done) return;
      domeTime += dt;
      const canSkip = ctx.mode === 'entscheider' && domeTime > 30;
      skipBtn.visible = canSkip;
      if (canSkip && !skipHinted) {
        skipHinted = true;
        ctx.ui.hint(sd.text('hint.skip'), 5);
      }
    },
    solve() {
      const modes: Record<TargetId, VisorMode> = { becher: 'tiefe', flasche: 'rgb', samt: 'lidar', kabel: 'seg', spiegel: 'rgb' };
      for (const m of MODES) sd.modesSeen.add(m);
      startRun();
      run.switches = SWITCH_BUDGET + 3; // a plain ★ (stamp) result
      for (const id of TARGET_IDS) if (!tagged.has(id)) tagged.set(id, modes[id]);
      ctx.progress.set('tags', [...tagged.entries()]);
      for (const id of tagged.keys()) showLabel(id);
      refreshPanel();
      complete();
    },
    stars3() {
      retry();
      const modes: Record<TargetId, VisorMode> = { becher: 'tiefe', flasche: 'rgb', samt: 'lidar', kabel: 'seg', spiegel: 'rgb' };
      startRun();
      run.start = ctx.time.elapsed - 42;
      run.switches = 1;
      for (const id of TARGET_IDS) tagged.set(id, modes[id]);
      ctx.progress.set('tags', [...tagged.entries()]);
      for (const id of tagged.keys()) showLabel(id);
      refreshPanel();
      complete();
    },
  };
}

function cardA(sd: Sd, tagged: Map<TargetId, VisorMode>): InfoCardSpec {
  const { ctx } = sd;
  const used = new Set<VisorMode>([...sd.modesSeen, ...tagged.values()]);
  return {
    eyebrow: sd.text('card.a.eyebrow'),
    title: sd.text('card.a.title'),
    body: sd.text('card.a.body'),
    // Entdecker: concept + „Für Neugierige“; Entscheider: concept + decision box (GDD §3)
    entdecker: { bullets: [sd.text('card.a.curious')], forDecisionMakers: undefined },
    forDecisionMakers: { title: sd.text('card.a.dmTitle'), bullets: [sd.text('card.a.dm1'), sd.text('card.a.dm2')] },
    diagram: {
      aspect: 16 / 9,
      caption: sd.text('card.a.caption'),
      draw(g, w, h) {
        const lang = ctx.lang;
        const nameW = 104;
        const colW = (w - nameW) / 4,
          rowH = (h - 34) / 5;
        g.font = '600 11px "Geist Mono", monospace';
        g.textBaseline = 'middle';
        MODES.forEach((m, j) => {
          const x = nameW + j * colW;
          g.fillStyle = used.has(m) ? css.tealMuted : 'rgba(255,255,255,0.03)';
          g.fillRect(x + 2, 0, colW - 4, h);
          g.fillStyle = used.has(m) ? css.teal : css.textMuted;
          g.textAlign = 'center';
          g.fillText(ctx.t(`mode.${m}`).slice(0, 7), x + colW / 2, 14);
        });
        TARGET_IDS.forEach((id, i) => {
          const y = 34 + i * rowH + rowH / 2;
          g.textAlign = 'left';
          g.fillStyle = css.text;
          g.font = '500 12px "Geist", sans-serif';
          g.fillText(ctx.t(`obj.${id}`), 6, y);
          MODES.forEach((m, j) => {
            const x = nameW + j * colW + colW / 2;
            const v = MATRIX[id][m];
            const mine = tagged.get(id) === m;
            if (mine) {
              g.strokeStyle = css.orange;
              g.lineWidth = 1.5;
              g.strokeRect(x - colW / 2 + 6, y - rowH / 2 + 4, colW - 12, rowH - 8);
            }
            g.textAlign = 'center';
            g.font = '600 15px "Geist Mono", monospace';
            g.fillStyle = v === '✓' ? css.teal : v === '~' ? css.warning : css.error;
            g.fillText(v, x, y - 6);
            g.font = '9.5px "Geist Mono", monospace';
            g.fillStyle = css.textSecondary;
            g.fillText(NOTES[id][m][lang], x, y + 9);
          });
        });
      },
    },
  };
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  return mergeAll([a, b]);
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [],
    nor: number[] = [],
    uv: number[] = [];
  for (const p0 of parts) {
    const p = p0.index ? p0.toNonIndexed() : p0;
    const a = p.getAttribute('position'),
      n = p.getAttribute('normal'),
      u = p.getAttribute('uv');
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      nor.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export { mergeAll };

/** dome hall floor: dark composite, 1 m seams at 6 %, polygon offset over the island's plot pad */
function domeFloorMaterial(ctx: Sd['ctx']): THREE.MeshStandardMaterial {
  const tex = own(
    ctx.materials.canvasTexture(256, 256, (g: CanvasRenderingContext2D, w: number, h: number) => {
      g.fillStyle = '#56514d';
      g.fillRect(0, 0, w, h);
      // faint panel variation (two 1 m panels per tile edge)
      g.fillStyle = 'rgba(255,255,255,0.025)';
      g.fillRect(0, 0, w / 2, h / 2);
      g.fillRect(w / 2, h / 2, w / 2, h / 2);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(0, 0, w, 2);
      g.fillRect(0, h / 2, w, 2);
      g.fillRect(0, 0, 2, h);
      g.fillRect(w / 2, 0, 2, h);
    }),
  );
  tex.repeat.set(16, 16); // 32 m disc, 2 m per tile
  const m = own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.1, name: 'sensordom:floor', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
  return m;
}

/** additive warm floor pools [x, z, radius, strength] + emissive ceiling discs on the cap above them */
function lightPools(sd: Sd, pools: [number, number, number, number][]): void {
  const { ctx, B, look } = sd;
  const tex = own(
    ctx.materials.canvasTexture(128, 128, (g: CanvasRenderingContext2D, w: number, h: number) => {
      const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(255,233,204,1)');
      r.addColorStop(0.45, 'rgba(255,233,204,0.45)');
      r.addColorStop(1, 'rgba(255,233,204,0)');
      g.clearRect(0, 0, w, h);
      g.fillStyle = r;
      g.fillRect(0, 0, w, h);
    }),
  );
  const geos: THREE.BufferGeometry[] = [];
  const disc: THREE.BufferGeometry[] = [];
  for (const [x, z, r, k] of pools) {
    const q = new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2).translate(x, 0.062, z);
    const col = new Float32Array(q.getAttribute('position').count * 3).fill(k);
    q.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(q);
    const y = domeHeightAt(x, z);
    if (y > 4.5) disc.push(placed(new THREE.CircleGeometry(0.34, 24).rotateX(Math.PI / 2), [x, y - 0.12, z]));
  }
  const mat = own(new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, name: 'sensordom:pools', polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16 }));
  const mesh = new THREE.Mesh(mergeGeometries(geos, false)!, mat);
  mesh.renderOrder = 1;
  ctx.groups.detail.add(mesh);
  sd.visor.register(mesh, { seg: 'unsichtbar', lidar: 'hide' });
  for (const g of disc) B.geo(g, { mat: look.light('warm', 1, { dusk: false }), seg: 'struktur' });
}

const _pe = new THREE.Vector3();
const _pt = new THREE.Vector3();
/** a readable popup anchor toward `target` (local): on the line of sight, ≤ 3 m out, 0.75 m below the eye */
export function popupAnchor(ctx: Sd['ctx'], target: THREE.Vector3): THREE.Vector3 {
  const eye = ctx.toLocal(ctx.camera.getWorldPosition(_pe), _pe);
  _pt.copy(target).sub(eye);
  const d = _pt.length();
  _pt.multiplyScalar(Math.min(d, 3) / Math.max(d, 1e-3)).add(eye);
  _pt.y = Math.min(target.y, eye.y) - 0.75;
  return _pt.clone();
}
