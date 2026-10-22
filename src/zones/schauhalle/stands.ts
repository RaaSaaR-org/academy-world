/**
 * The Datenblatt stands (plan §4.9, R4 §7.3): a waist-high stand like a car's price sign beside every
 * plinth, facing the aisle — name, status chip, 4 key numbers with their chips, the price band with its
 * basis and date. Three 1024² atlases (8 plates each, ≤ 4 MB per upload) and one carbon mesh for all
 * stand bodies: 4 draws for 21 stands. The plates redraw on a language change.
 */
import * as THREE from 'three';
import type { Lang, RobotId, RobotManifestEntry, ZoneContext } from '@/core/zones';
import { buildAtlas, type AtlasQuad, type AtlasRegion, type TextAtlas } from './atlas';
import { HALL_ROBOTS, PLINTH, type HallRobot } from './data/robots';
import { box, merge, type CanvasTex } from './geo';
import { FONT } from './geo';
import { chipPill, fitText, INK, plate } from './look';
import { chipLabel, sheet } from './sheet';

export interface Stand {
  robot: HallRobot;
  /** stand foot (local) and the plate's yaw (it faces the reader) */
  at: THREE.Vector3;
  yaw: number;
  /** the interaction proxy (invisible): the plate + the robot's volume */
  proxy: THREE.Group;
}

export interface Stands {
  readonly list: readonly Stand[];
  of(id: RobotId): Stand | null;
  redraw(): void;
  /** the plate texts as drawn (tools/hall-check: every number chipped, a basis and date on every plate) */
  plates(): { id: RobotId; lines: string[] }[];
}

const FACE: [number, number] = [510, 254];
const PLATE_W = 0.62;
const PLATE_H = 0.31;
const TILT = THREE.MathUtils.degToRad(-32);

/** where a robot's stand goes: on the aisle side of its plinth */
export function standPose(r: HallRobot): { x: number; z: number; yaw: number } {
  const p = PLINTH[r.plinth];
  const d = p.standAt;
  if (r.cat === 'bauen' || r.arrival.kind === 'h2') return { x: r.at[0], z: r.at[1] + d, yaw: 0 };
  if (r.id === 'fanuc-r2000ic-165f') return { x: r.at[0] - d, z: r.at[1] - 0.6, yaw: -Math.PI / 2 };
  const west = r.at[0] < 0;
  return { x: r.at[0] + (west ? d : -d), z: r.at[1], yaw: west ? Math.PI / 2 : -Math.PI / 2 };
}

export function buildStands(ctx: ZoneContext, infos: ReadonlyMap<RobotId, RobotManifestEntry>): Stands {
  const det = ctx.groups.detail;
  const lines = new Map<RobotId, string[]>();
  const lang = (): Lang => ctx.i18n.lang;

  const draw = (r: HallRobot) => (g: CanvasRenderingContext2D, w: number, h: number): void => {
    const L = lang();
    const sh = sheet(r, L, infos.get(r.id) ?? null);
    const out: string[] = [];
    plate(g, w, h);
    // eyebrow + status chip
    g.textBaseline = 'alphabetic';
    fitText(g, `${sh.cat} · ${sh.kind.toUpperCase()}`, 22, 34, 300, 15, (px) => FONT.mono(px, 500), INK.text2);
    g.font = FONT.mono(14, 500);
    const sw = g.measureText(sh.status).width + 16;
    chipPill(g, sh.status, w - 22 - sw, 30, 14, r.status === 'lieferbar' ? INK.teal : r.status === 'pilot' || r.status === 'angekuendigt' ? INK.amber : INK.text2);
    g.textBaseline = 'alphabetic';
    fitText(g, sh.name, 22, 78, w - 44, 36, (px) => FONT.display(px), INK.text);
    out.push(sh.name, sh.status);
    // four key numbers with their chips
    const rows: [string, string | null, string | null][] = [];
    const s = sh.head[0];
    const wgt = sh.more.find((x) => x.key === 'weight')!;
    const pay = sh.head[1];
    rows.push([s.label, s.value, s.chip ? chipLabel(s.chip, L) : null]);
    rows.push([wgt.label, wgt.value, wgt.chip ? chipLabel(wgt.chip, L) : null]);
    rows.push([pay.label, pay.value ? (pay.cond ? `${pay.value} · ${pay.cond}` : pay.value) : null, pay.chip ? chipLabel(pay.chip, L) : null]);
    const pr = sh.price;
    rows.push([sh.head[2].label, sh.head[2].value, r.id && sh.head[2].chip ? chipLabel('quelle', L) : null]);
    let y = 112;
    for (const [label, value, chip] of rows) {
      g.textBaseline = 'alphabetic';
      fitText(g, label.toUpperCase(), 22, y + 4, 110, 13, (px) => FONT.mono(px, 500), INK.muted);
      const v = value ?? (L === 'en' ? 'not stated' : 'k. A.');
      let cw = 0;
      if (chip && value) {
        g.font = FONT.mono(10.5, 500);
        cw = g.measureText(chip).width + 14;
        chipPill(g, chip, w - 22 - cw, y, 10.5, INK.text2);
      }
      g.textBaseline = 'alphabetic';
      fitText(g, v, 138, y + 6, w - 22 - 138 - cw - 8, 20, (px) => FONT.sans(px, 500), value ? INK.text : INK.muted);
      out.push(`${label}: ${v}${chip && value ? ` [${chip}]` : ''}`);
      y += 30;
    }
    // footer: price basis and date (plan §4.9: „a price basis and date on every plate“), the clip chip
    g.fillStyle = INK.line;
    g.fillRect(22, h - 40, w - 44, 1);
    const foot = `${pr.basis.toUpperCase()} · ${L === 'en' ? 'as of' : 'Stand'} ${pr.date}`;
    fitText(g, foot, 22, h - 16, 300, 13, (px) => FONT.mono(px, 500), INK.text2);
    out.push(foot);
    if (sh.animated) {
      const t = L === 'en' ? 'MOTION ANIMATED' : 'BEWEGUNG ANIMIERT';
      g.font = FONT.mono(11, 500);
      const tw = g.measureText(t).width + 14;
      chipPill(g, t, w - 22 - tw, h - 21, 11, INK.teal);
      out.push(t);
    }
    lines.set(r.id, out);
  };

  // ── stands, plates and proxies ───────────────────────────────────────────
  const list: Stand[] = [];
  const bodies: THREE.BufferGeometry[] = [];
  const groups: { regions: AtlasRegion[]; quads: AtlasQuad[] }[] = [];
  HALL_ROBOTS.forEach((r, i) => {
    const { x, z, yaw } = standPose(r);
    const gi = Math.floor(i / 8);
    groups[gi] ??= { regions: [], quads: [] };
    const G = groups[gi];
    G.regions.push({ id: r.id, w: FACE[0], h: FACE[1], draw: draw(r) });
    // body: foot plate, post, a carbon frame for the plate (tilted back 32°)
    const post = box(0.05, 0.84, 0.05, 0, 0.42, -0.04);
    const foot = box(0.36, 0.02, 0.26, 0, 0.01, 0);
    const frame = box(PLATE_W + 0.04, PLATE_H + 0.04, 0.025, 0, 0, -0.016);
    frame.rotateX(TILT).translate(0, 0.98, 0.02);
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
    for (const gg of [post, foot, frame]) bodies.push(gg.applyMatrix4(m));
    // plate quad: tilted like the frame, 3 mm in front of its face
    const pm4 = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z).multiply(new THREE.Matrix4().makeTranslation(0, 0.98, 0.02)).multiply(new THREE.Matrix4().makeRotationX(TILT)).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.003));
    G.quads.push({ region: r.id, w: PLATE_W, h: PLATE_H, at: [0, 0, 0], matrix: pm4 });
    // proxy: the plate and the robot's volume (one interactable per robot)
    const proxy = new THREE.Group();
    proxy.name = `schauhalle:proxy:${r.id}`;
    const pm = new THREE.Mesh(new THREE.BoxGeometry(PLATE_W + 0.1, 0.9, 0.3), proxyMat);
    pm.position.set(x, 0.75, z);
    pm.rotation.y = yaw;
    pm.visible = false;
    const pr = PLINTH[r.plinth];
    const vol = new THREE.Mesh(new THREE.CylinderGeometry(pr.r * 0.85, pr.r * 0.85, 1.6, 12), proxyMat);
    vol.position.set(r.at[0], pr.h + 0.8, r.at[1]);
    vol.visible = false;
    proxy.add(pm, vol);
    det.add(proxy);
    list.push({ robot: r, at: new THREE.Vector3(x, 0, z), yaw, proxy });
  });
  const body = new THREE.Mesh(merge(bodies), ctx.materials.carbon);
  body.name = 'schauhalle:stands';
  body.matrixAutoUpdate = false;
  body.updateMatrix();
  body.receiveShadow = true;
  det.add(body);
  const atlases: TextAtlas[] = groups.map((G, i) => buildAtlas(`stands-${i}`, [1024, 1024], G.regions, G.quads));
  for (const a of atlases) det.add(a.mesh);
  ctx.onDispose(() => {
    atlases.forEach((a) => a.dispose());
    body.geometry.dispose();
    for (const s of list) s.proxy.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  });
  ctx.i18n.onChange(() => atlases.forEach((a) => a.redraw()));
  // the web fonts may arrive after the first draw: draw once more when they are in
  void (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(() => atlases.forEach((a) => a.redraw()));

  const byId = new Map(list.map((s) => [s.robot.id, s]));
  return {
    list,
    of: (id) => byId.get(id) ?? null,
    redraw: () => atlases.forEach((a) => a.redraw()),
    plates: () => HALL_ROBOTS.map((r) => ({ id: r.id, lines: lines.get(r.id) ?? [] })),
  };
}

const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
proxyMat.name = 'schauhalle:proxy';
export type { CanvasTex };
