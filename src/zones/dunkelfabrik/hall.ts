/**
 * The Dunkelfabrik hall (GDD §7.5 Structures): the windowless monolith with its single
 * orange status slit, the hazard-taped door and roller shutter, forecourt, gallery + stair,
 * Verladebucht with deck lift and Ladetor, ceiling strips, wall clock, furnace and the
 * two local lights (furnace; hall light → orange work lamp at "Licht aus").
 */
import * as THREE from 'three';
import type { StaticHandle, ZoneContext } from '@/core/zones';
import { box, boxMM, canvasTex, cyl, merge, mesh, place, plane, radialTex, torus, type CanvasTex } from './geo';
import { look } from './look';
import { RAILING_GAP } from './manifest';

export const HALL = { x0: -15, x1: 15, z0: -14, z1: 6, h: 18, wall: 0.4 } as const;
export const DOOR = { x0: -3, x1: 3, h: 5 } as const;
export const BACK_OPENING = { x0: 9, x1: 11, h: 2.6 } as const;
export const GALLERY = { x0: 9, x1: 14.6, z0: -5, z1: 4, y: 5.5, landingX: 13.4 } as const;
export const STAIR = { x0: 3.5, x1: 13.4, z0: 4.05, z1: 5.55 } as const;
export const LEITSTAND = { x: 11.5, y: 5.5, z: -4 } as const;
export const FURNACE = { x0: -15, x1: -11, z0: -11, z1: -5, h: 5, mouthZ: -8, mouthY0: 0.85, mouthY1: 2.05, mouthHalfW: 0.8 } as const;
export const LIFT = { x: 10, z: -16.6, size: 2.0 } as const;
/** island railing gap centred on the Verladebucht: declared once in the eager manifest (the island reads it before this code loads) */
export { RAILING_GAP };
export const CLOCK = { x: -3, y: 7.4, z: -13.55, r: 1.5 } as const;
/** interior floor top (lifted above the island pad and its seam arc) */
export const FLOOR_Y = 0.05;

export interface Hall {
  /** 0…1 per ceiling strip row (6 rows, one per relay) */
  setStrip(k: number, v: number): void;
  setShutter(closed: boolean): void;
  readonly shutterClosed: boolean;
  setFurnaceNight(night: boolean): void;
  /** plant clock: minutes since midnight */
  setClock(minutes: number): void;
  /** hall light: day (high warm) or reassigned to a work lamp position (null = off) */
  setHallLight(mode: 'day' | 'off' | THREE.Vector3): void;
  /** dim the day hall light 0…1 (relay by relay) */
  setHallLightLevel(f: number): void;
  /** lift platform sink 0…1 */
  setLift(t: number): void;
  /** 0 = day … 1 = lights out: the machines' own light (fill, guide lines, task lights) takes over */
  setNight(level: number): void;
  readonly liftTop: THREE.Object3D;
  /** player inside the hall volume */
  readonly playerInside: boolean;
  update(dt: number, t: number): void;
  updateFar(t: number): void;
  onInside(fn: (inside: boolean) => void): void;
}

export function buildHall(ctx: ZoneContext): Hall {
  const M = ctx.materials;
  const LK = look(ctx);
  const ext = ctx.groups.exterior;
  const det = ctx.groups.detail;
  const far = ctx.groups.far;
  const owned: { dispose(): void }[] = [];
  ctx.onDispose(() => owned.forEach((o) => o.dispose()));

  // ── materials ────────────────────────────────────────────────────────────
  const panelTex = canvasTex(256, 256);
  drawPanels(panelTex);
  panelTex.tex.wrapS = panelTex.tex.wrapT = THREE.RepeatWrapping;
  panelTex.tex.needsUpdate = true;
  owned.push(panelTex.tex);
  // the monolith stays dark (it IS the dark factory) but reads as engineered composite: a satin
  // clearcoat picks up the sky, the panel joints come from the map (ART-V2 §6.5)
  // (a stronger clearcoat mirrored the golden sky as a bronze sheen: "no brown")
  const monolith = new THREE.MeshPhysicalMaterial({ color: 0x1c1b1a, map: panelTex.tex, roughness: 0.62, metalness: 0.1, clearcoat: 0.18, clearcoatRoughness: 0.4, envMapIntensity: 0.7, name: 'dunkelfabrik:monolith' });
  // inner lining: mid-grey ceramic panels (was stone-700: the hall read as a black box by day and
  // swallowed every bit of night light)
  const lining = new THREE.MeshStandardMaterial({ color: 0x8a857f, map: panelTex.tex, roughness: 0.82, metalness: 0.05, name: 'dunkelfabrik:lining' });
  owned.push(monolith, lining);

  // ── shell: outer monolith layer + inner lining (two draws) ───────────────
  const { x0, x1, z0, z1, h } = HALL;
  const T = 0.2; // each layer
  const outer: THREE.BufferGeometry[] = [];
  const inner: THREE.BufferGeometry[] = [];
  const colliders: StaticHandle[] = [];
  const wallCol = (ax0: number, ay0: number, az0: number, ax1: number, ay1: number, az1: number): void => {
    colliders.push(ctx.physics.addStaticBox({ size: [ax1 - ax0, ay1 - ay0, az1 - az0], position: [(ax0 + ax1) / 2, (ay0 + ay1) / 2, (az0 + az1) / 2], surface: 'metal' }));
  };
  // front wall z 5.6…6.0 with the door
  const front = (layerZ0: number, layerZ1: number, out: THREE.BufferGeometry[]): void => {
    out.push(boxMM(x0, 0, layerZ0, DOOR.x0, h, layerZ1, 1.5));
    out.push(boxMM(DOOR.x1, 0, layerZ0, x1, h, layerZ1, 1.5));
    out.push(boxMM(DOOR.x0, DOOR.h, layerZ0, DOOR.x1, h, layerZ1, 1.5));
  };
  front(z1 - T, z1, outer);
  front(z1 - 2 * T, z1 - T, inner);
  wallCol(x0, 0, z1 - 2 * T, DOOR.x0, h, z1);
  wallCol(DOOR.x1, 0, z1 - 2 * T, x1, h, z1);
  // back wall z −14…−13.6 with the AMR opening to the Verladebucht
  const back = (lz0: number, lz1: number, out: THREE.BufferGeometry[]): void => {
    out.push(boxMM(x0, 0, lz0, BACK_OPENING.x0, h, lz1, 1.5));
    out.push(boxMM(BACK_OPENING.x1, 0, lz0, x1, h, lz1, 1.5));
    out.push(boxMM(BACK_OPENING.x0, BACK_OPENING.h, lz0, BACK_OPENING.x1, h, lz1, 1.5));
  };
  back(z0, z0 + T, outer);
  back(z0 + T, z0 + 2 * T, inner);
  wallCol(x0, 0, z0, BACK_OPENING.x0, h, z0 + 2 * T);
  wallCol(BACK_OPENING.x1, 0, z0, x1, h, z0 + 2 * T);
  // side walls
  outer.push(boxMM(x0, 0, z0, x0 + T, h, z1, 1.5), boxMM(x1 - T, 0, z0, x1, h, z1, 1.5));
  inner.push(boxMM(x0 + T, 0, z0 + 2 * T, x0 + 2 * T, h, z1 - 2 * T, 1.5), boxMM(x1 - 2 * T, 0, z0 + 2 * T, x1 - T, h, z1 - 2 * T, 1.5));
  wallCol(x0, 0, z0, x0 + 2 * T, h, z1);
  wallCol(x1 - 2 * T, 0, z0, x1, h, z1);
  // roof (outer top + inner ceiling)
  outer.push(boxMM(x0, h - T, z0, x1, h, z1, 1.5));
  inner.push(boxMM(x0 + 2 * T, h - 2 * T, z0 + 2 * T, x1 - 2 * T, h - T, z1 - 2 * T, 1.5));
  // façade ribs (shallow pilasters that catch the low golden-hour sun); the sides carry the fin banks
  const RIB = 0.24;
  const aluRibs: THREE.BufferGeometry[] = [];
  for (const rx of [-12, -6.5, 6.5, 12]) aluRibs.push(boxMM(rx - 0.2, 0.3, z1, rx + 0.2, h - 0.35, z1 + RIB, 1.5));
  // alu belt course at 2.5 m (the fin banks start there on the sides)
  aluRibs.push(boxMM(x0, 2.42, z1, DOOR.x0 - 0.4, 2.58, z1 + 0.16), boxMM(DOOR.x1 + 0.4, 2.42, z1, x1, 2.58, z1 + 0.16));
  for (const rx of [-10, -5, 0, 5]) outer.push(boxMM(rx - 0.25, 0.3, z0 - RIB, rx + 0.25, h - 0.35, z0, 1.5));
  // plinth band
  outer.push(boxMM(x0 - 0.06, 0, z1, DOOR.x0 - 0.35, 0.3, z1 + 0.08, 1.5), boxMM(DOOR.x1 + 0.35, 0, z1, x1 + 0.06, 0.3, z1 + 0.08, 1.5));
  const shellMesh = mesh(merge(outer), monolith, { cast: true, receive: true, name: 'df:shell' });
  ext.add(shellMesh);
  const liningMesh = mesh(merge(inner), lining, { cast: false, receive: true, name: 'df:lining' });
  ext.add(liningMesh);

  // trims: alu coping band (one alu trim on every large body, ART-V2 §2.5), shutter housing
  const trims: THREE.BufferGeometry[] = [];
  trims.push(boxMM(x0 - 0.12, h - 0.35, z1 - 0.1, x1 + 0.12, h + 0.05, z1 + 0.12));
  trims.push(boxMM(x0 - 0.12, h - 0.35, z0 - 0.12, x1 + 0.12, h + 0.05, z0 + 0.1));
  trims.push(boxMM(x0 - 0.12, h - 0.35, z0, x0 + 0.1, h + 0.05, z1));
  trims.push(boxMM(x1 - 0.1, h - 0.35, z0, x1 + 0.12, h + 0.05, z1));
  // slit recess frame (dark, around the orange slit)
  // shutter housing (inside, above the door)
  trims.push(boxMM(DOOR.x0 - 0.65, DOOR.h + 0.3, z1 - 0.95, DOOR.x1 + 0.65, DOOR.h + 0.95, z1 - 0.4));
  // the four vertical edges are rounded off by carbon corner posts (r 0.45: "no hard 90° edges")
  for (const [cx, cz] of [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ] as const) {
    trims.push(cyl(0.45, 0.45, h - 0.35, 16, cx, (h - 0.35) / 2, cz));
    ctx.physics.addStaticCylinder({ radius: 0.45, height: h, position: [cx, h / 2, cz], surface: 'metal' });
  }
  // satin alu for the long façade members: the shared brushed alu (roughness 0.3) caught the 16° sun
  // along the 17 m ribs and the coping as blooming hot lines
  const satinAlu = (LK.alu as THREE.MeshStandardMaterial).clone();
  satinAlu.roughness = 0.62;
  satinAlu.metalness = 0.55;
  satinAlu.name = 'dunkelfabrik:satin-alu';
  owned.push(satinAlu);
  const trimMesh = mesh(merge([...trims.slice(0, 5), ...aluRibs]), satinAlu, { cast: false, name: 'df:trims' });
  ext.add(trimMesh);
  // carbon: corner posts, slit reveal, roof equipment band
  const carbonParts: THREE.BufferGeometry[] = trims.slice(5);

  // ── heat-exchanger fin banks on both side façades: the 41 °C have to go somewhere ──
  // alu 0.05 × 0.6 m every 0.5 m, from 2.6 m up (above head height: no collider needed), 1 draw call
  const FIN_Y0 = 2.6,
    FIN_Y1 = h - 1.1;
  const finGeo = new THREE.BoxGeometry(0.6, FIN_Y1 - FIN_Y0, 0.05);
  owned.push(finGeo);
  const finZ: number[] = [];
  for (let z = z0 + 1.0; z <= z1 - 1.0 + 1e-6; z += 0.5) finZ.push(z);
  // dark anodised fin packs (#4A4643, like the deck's fin banks since Phase 5): polished alu mirrored the
  // low sun-side sky at a grazing angle and the whole bank blew out to a white rectangle from the east deck
  const finMat = new THREE.MeshStandardMaterial({ color: 0x4a4643, roughness: 0.72, metalness: 0.45, name: 'dunkelfabrik:fins' });
  owned.push(finMat);
  const fins = new THREE.InstancedMesh(finGeo, finMat, finZ.length * 2);
  fins.name = 'df:fins';
  {
    let i = 0;
    for (const side of [-1, 1])
      for (const fz of finZ) fins.setMatrixAt(i++, new THREE.Matrix4().makeTranslation(side * (x1 + 0.3), (FIN_Y0 + FIN_Y1) / 2, fz));
    fins.instanceMatrix.needsUpdate = true;
    fins.computeBoundingSphere();
  }
  fins.castShadow = true;
  ext.add(fins);
  // fin bank headers / footers (carbon manifolds)
  for (const side of [-1, 1]) {
    const fx = side * (x1 + 0.3);
    carbonParts.push(boxMM(fx - 0.34, FIN_Y0 - 0.22, z0 + 0.7, fx + 0.34, FIN_Y0, z1 - 0.7), boxMM(fx - 0.34, FIN_Y1, z0 + 0.7, fx + 0.34, FIN_Y1 + 0.22, z1 - 0.7));
  }

  // ── roof equipment band: four exhaust fans (orange hub rings) turning slowly ──
  const FANS: [number, number][] = [
    [-7, -3.2],
    [-1.6, -3.2],
    [3.8, -3.2],
    [9.2, -3.2],
  ];
  const FAN_R = 1.55;
  const fanAlu: THREE.BufferGeometry[] = [];
  const fanHub: THREE.BufferGeometry[] = [];
  for (const [fx, fz] of FANS) {
    fanAlu.push(cyl(FAN_R + 0.12, FAN_R + 0.22, 0.95, 32, fx, h + 0.475, fz, 0, 0, 0, true));
    carbonParts.push(cyl(FAN_R + 0.26, FAN_R + 0.26, 0.16, 32, fx, h + 0.08, fz), cyl(0.32, 0.32, 0.5, 14, fx, h + 0.45, fz));
    for (let k = 0; k < 4; k++) carbonParts.push(box(FAN_R * 2 + 0.2, 0.05, 0.05, fx, h + 0.92, fz, 0, (k * Math.PI) / 4, 0));
    fanHub.push(torus(0.36, 0.05, 6, 24, fx, h + 0.72, fz, Math.PI / 2));
  }
  ext.add(mesh(merge(fanAlu), LK.alu, { cast: true, name: 'df:fan-housings' }));
  ext.add(mesh(merge(fanHub), M.orangePaint, { receive: false, name: 'df:fan-hubs' }));
  const bladeGeo = merge([0, 1, 2, 3, 4].map((k) => box(FAN_R - 0.35, 0.025, 0.42, (FAN_R - 0.35) / 2 + 0.32, 0, 0, 0.32, (k * Math.PI * 2) / 5, 0)));
  owned.push(bladeGeo);
  const blades = new THREE.InstancedMesh(bladeGeo, M.metalDark, FANS.length);
  blades.name = 'df:fan-blades';
  blades.frustumCulled = false;
  blades.userData.noMerge = true; // Z1: spun per frame (setMatrixAt)
  ext.add(blades);
  const _bm = new THREE.Matrix4();
  const _bq = new THREE.Quaternion();
  const _bp = new THREE.Vector3();
  const _bs = new THREE.Vector3(1, 1, 1);
  const _up = new THREE.Vector3(0, 1, 0);
  const spinFans = (t: number): void => {
    if (ctx.settings.reducedMotion || ctx.settings.quality === 'low') t = 0;
    FANS.forEach(([fx, fz], i) => {
      blades.setMatrixAt(i, _bm.compose(_bp.set(fx, h + 0.6, fz), _bq.setFromAxisAngle(_up, t * (0.9 + i * 0.07) + i), _bs));
    });
    blades.instanceMatrix.needsUpdate = true;
  };
  spinFans(0);

  // ── the single orange status slit: vertical, right of the door (a horizontal bar high on the
  //    façade read as a stray HUD progress bar from the gate, QA-27) + a scanner travelling in it ──
  const SLIT = { x: 9.25, y0: 1.8, y1: 15.2, w: 0.3 } as const;
  const slitMat = new THREE.MeshBasicMaterial({ color: LK.tierColor(0xff6700, 0), name: 'dunkelfabrik:slit' });
  owned.push(slitMat);
  const slit = mesh(plane(SLIT.w, SLIT.y1 - SLIT.y0, SLIT.x, (SLIT.y0 + SLIT.y1) / 2, z1 + 0.012), slitMat, { receive: false, name: 'df:slit' });
  ext.add(slit);
  // carbon reveal around it (2 cm proud, 12 cm deep look)
  carbonParts.push(
    boxMM(SLIT.x - SLIT.w / 2 - 0.14, SLIT.y0 - 0.14, z1, SLIT.x - SLIT.w / 2, SLIT.y1 + 0.14, z1 + 0.14),
    boxMM(SLIT.x + SLIT.w / 2, SLIT.y0 - 0.14, z1, SLIT.x + SLIT.w / 2 + 0.14, SLIT.y1 + 0.14, z1 + 0.14),
    boxMM(SLIT.x - SLIT.w / 2, SLIT.y1, z1, SLIT.x + SLIT.w / 2, SLIT.y1 + 0.14, z1 + 0.14),
    boxMM(SLIT.x - SLIT.w / 2, SLIT.y0 - 0.14, z1, SLIT.x + SLIT.w / 2, SLIT.y0, z1 + 0.14),
  );
  const scanMat = new THREE.MeshBasicMaterial({ color: LK.tierColor(0xff7a1a, 1), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true });
  owned.push(scanMat);
  const scanner = mesh(plane(SLIT.w, 1.6, SLIT.x, (SLIT.y0 + SLIT.y1) / 2, z1 + 0.02), scanMat, { receive: false, name: 'df:slit-scan' });
  scanner.userData.noMerge = true; // Z1: travels up and down the slit
  ext.add(scanner);
  const scanY = (t: number): number => (SLIT.y0 + SLIT.y1) / 2 + Math.sin(t * 0.21) * ((SLIT.y1 - SLIT.y0) / 2 - 0.8);

  // ── door: hazard-taped frame + roller shutter ────────────────────────────
  const hz = M.hazard(1);
  const jambs = merge([
    box(0.32, DOOR.h + 0.32, 0.18, DOOR.x0 - 0.16, (DOOR.h + 0.32) / 2, z1 + 0.06, 0, 0, 0, 0.64),
    box(0.32, DOOR.h + 0.32, 0.18, DOOR.x1 + 0.16, (DOOR.h + 0.32) / 2, z1 + 0.06, 0, 0, 0, 0.64),
    box(DOOR.x1 - DOOR.x0, 0.32, 0.18, 0, DOOR.h + 0.16, z1 + 0.06, 0, 0, 0, 0.64),
  ]);
  ext.add(mesh(jambs, hz, { name: 'df:door-frame' }));
  // floor threshold strip (hazard) inside the door
  ext.add(mesh(box(DOOR.x1 - DOOR.x0, 0.02, 0.3, 0, 0.035, z1 - 0.2, 0, 0, 0, 0.6), hz, { name: 'df:threshold' }));

  const slatTex = canvasTex(64, 128);
  {
    const g = slatTex.g;
    g.fillStyle = '#2b2725';
    g.fillRect(0, 0, 64, 128);
    for (let y = 0; y < 128; y += 16) {
      g.fillStyle = '#1a1817';
      g.fillRect(0, y, 64, 3);
      g.fillStyle = '#3a3532';
      g.fillRect(0, y + 3, 64, 1);
    }
    slatTex.tex.wrapS = slatTex.tex.wrapT = THREE.RepeatWrapping;
    slatTex.tex.repeat.set(6, 5 / 0.8);
    slatTex.tex.needsUpdate = true;
  }
  owned.push(slatTex.tex);
  const shutterMat = new THREE.MeshStandardMaterial({ map: slatTex.tex, roughness: 0.6, metalness: 0.5, name: 'dunkelfabrik:shutter' });
  owned.push(shutterMat);
  // the shutter overlaps the opening by 0.5 m per side: the low sun enters at ~35° and would
  // otherwise slip past its edge as a thin stripe across the dark floor
  const SH_H = DOOR.h + 0.5;
  const shutterGeo = new THREE.BoxGeometry(DOOR.x1 - DOOR.x0 + 1.0, SH_H, 0.12);
  shutterGeo.translate(0, -SH_H / 2, 0);
  const shutter = new THREE.Mesh(shutterGeo, shutterMat);
  shutter.position.set(0, SH_H, z1 - 0.5);
  shutter.castShadow = true;
  shutter.scale.y = 0.001;
  shutter.visible = false;
  ext.add(shutter);
  let shutterTarget = 0;
  let shutterNow = 0;
  let shutterCol: StaticHandle | null = null;

  // ── façade lettering beside the door, on the alu belt course (QA-27): on the lintel (5.4 m) it
  //    crossed the top of the screen — the HUD compass chip and the zone card — for the last 10 m of the
  //    walk-in; here it stays right of centre at eye level (the left holds the HUD's objective and zone
  //    cards). Between the door and the first rib (x 6.5), the orange slit beyond the rib. ──
  const LX = DOOR.x1 + 0.75;
  ctx.text3d.create({ text: ctx.i18n.text('hall.facadeName'), font: 'mono-medium', size: 0.27, color: 0xd6d3d1, letterSpacing: 0.12, uppercase: true, anchorX: 'left', anchorY: 'bottom', position: [LX, 2.95, z1 + 0.03] }, ext);
  // the small teal sub-line reads only up close: detail tier (Z1, one draw less from the bridge head)
  ctx.text3d.create({ text: ctx.i18n.text('hall.facadeSub'), font: 'mono-medium', size: 0.15, color: 0x2dd4bf, letterSpacing: 0.12, uppercase: true, anchorX: 'left', anchorY: 'bottom', position: [LX, 2.7, z1 + 0.03] }, ctx.groups.detail);

  // ── exhaust stack from the furnace: a round alu stack with carbon collars ────
  const stack = merge([cyl(0.62, 0.7, 6.2, 24, -13, h + 3.1, -9.5)]);
  ext.add(mesh(stack, LK.alu, { cast: true, name: 'df:stack' }));
  carbonParts.push(cyl(0.9, 0.9, 0.4, 24, -13, h + 0.2, -9.5), cyl(0.68, 0.68, 0.22, 24, -13, h + 6.1, -9.5), cyl(0.72, 0.72, 0.12, 24, -13, h + 3.2, -9.5));
  ext.add(mesh(merge(carbonParts), LK.carbon, { cast: false, name: 'df:carbon' }));

  // ── forecourt: a carbon loading lane from the gate to the door with teal guide lines ──
  const laneMat = (LK.carbon as THREE.MeshPhysicalMaterial).clone();
  laneMat.roughness = 0.8;
  laneMat.clearcoat = 0.1;
  laneMat.polygonOffset = true;
  laneMat.polygonOffsetFactor = -6;
  laneMat.polygonOffsetUnits = -12;
  owned.push(laneMat);
  ext.add(mesh(boxMM(-3.2, 0.006, z1 + 0.3, 3.2, 0.02, 20.8), laneMat, { name: 'df:lane' }));
  const guideMat = LK.duskLight(0x2dd4bf); // fresh instance (owned by look): T0 by day, T1 at dusk
  guideMat.polygonOffset = true;
  guideMat.polygonOffsetFactor = -10;
  guideMat.polygonOffsetUnits = -20;
  const guides: THREE.BufferGeometry[] = [];
  for (const wx of [-3.05, 3.05]) guides.push(boxMM(wx - 0.03, 0.02, z1 + 0.5, wx + 0.03, 0.026, 20.6));
  for (let z = z1 + 1.4; z < 20.4; z += 1.8) guides.push(boxMM(-0.5, 0.02, z, 0.5, 0.026, z + 0.06));
  ext.add(mesh(merge(guides), guideMat, { receive: false, name: 'df:lane-guides' }));

  // ── interior floor (detail) ──────────────────────────────────────────────
  // own material with a stronger polygon offset than the island's seam arc (level 4) underneath
  const floorMat = M.concreteGridSized(29, 19).clone();
  floorMat.polygonOffset = true;
  floorMat.polygonOffsetFactor = -8;
  floorMat.polygonOffsetUnits = -16;
  owned.push(floorMat);
  const floor = mesh(boxMM(x0 + 0.4, 0, z0 + 0.4, x1 - 0.4, FLOOR_Y, z1 - 0.4), floorMat, { receive: true, name: 'df:floor' });
  det.add(floor);
  // painted walkway lines (stone) + the line-zone boundary
  const lines: THREE.BufferGeometry[] = [];
  const ly0 = FLOOR_Y + 0.001,
    ly1 = FLOOR_Y + 0.004;
  lines.push(boxMM(-14.4, ly0, -6.6, 4.3, ly1, -6.45)); // walkway edge along the line
  lines.push(boxMM(-2.9, ly0, -6.45, -2.75, ly1, 5.4), boxMM(2.75, ly0, -6.45, 2.9, ly1, 5.4)); // door aisle
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -24 });
  owned.push(lineMat);
  det.add(mesh(merge(lines), lineMat, { name: 'df:floor-lines' }));

  // ── ceiling trusses (merged, structure) ──────────────────────────────────
  const truss: THREE.BufferGeometry[] = [];
  for (const tx of [-11.5, -6, -0.5, 5, 10.5]) {
    truss.push(boxMM(tx - 0.12, 16.9, z0 + 0.4, tx + 0.12, 17.15, z1 - 0.4));
    truss.push(boxMM(tx - 0.1, 15.75, z0 + 0.4, tx + 0.1, 15.95, z1 - 0.4));
    const n = 10;
    const len = z1 - z0 - 0.8;
    for (let i = 0; i < n; i++) {
      const za = z0 + 0.4 + (len * i) / n;
      const zb = za + len / n;
      const diag = Math.hypot(zb - za, 1.1);
      const ang = Math.atan2(1.1, zb - za) * (i % 2 ? 1 : -1);
      truss.push(box(0.08, 0.08, diag, tx, 16.45, (za + zb) / 2, ang, 0, 0));
    }
  }
  for (const tz of [-9, -2, 4]) truss.push(boxMM(x0 + 0.4, 16.95, tz - 0.08, x1 - 0.4, 17.1, tz + 0.08));
  // overhead crane: runway girders along x on corbels, a bridge across z, a hoist with its hook block
  for (const rz of [-12.9, 4.1]) {
    truss.push(boxMM(x0 + 0.4, 12.6, rz - 0.22, x1 - 0.4, 13.2, rz + 0.22));
    for (let cx = x0 + 2; cx < x1 - 1; cx += 6) truss.push(boxMM(cx - 0.2, 12.0, rz - 0.25, cx + 0.2, 12.6, rz + 0.25));
  }
  truss.push(boxMM(-4.4, 13.2, -12.9, -3.6, 14.0, 4.1), boxMM(-4.3, 12.7, -5.2, -3.7, 13.2, -4.2));
  truss.push(box(0.03, 6.2, 0.03, -4, 9.6, -4.7), box(0.42, 0.5, 0.3, -4, 6.3, -4.7));
  ext.add(mesh(merge(truss), M.structure, { name: 'df:truss' }));

  // ── ceiling strips: 6 rows (one per relay), instanced, HDR unlit ─────────
  // warm T1 (ART-V2 §6.5: was ×2.4, which sat above the glow tier)
  const stripMat = new THREE.MeshBasicMaterial({ color: LK.tierColor(0xfff1dc, 1), name: 'dunkelfabrik:strips' });
  owned.push(stripMat);
  const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(25, 0.06, 0.32), stripMat, 6);
  strips.name = 'df:strips';
  const stripZ = [-12, -9.3, -6.6, -3.9, -1.2, 1.5];
  const _mm = new THREE.Matrix4();
  const _c = new THREE.Color();
  stripZ.forEach((sz, i) => {
    strips.setMatrixAt(i, _mm.makeTranslation(0, 15.6, sz));
    strips.setColorAt(i, _c.setScalar(1));
  });
  strips.instanceMatrix.needsUpdate = true;
  if (strips.instanceColor) strips.instanceColor.needsUpdate = true;
  det.add(strips);
  // strip housings (dark)
  det.add(mesh(merge(stripZ.map((sz) => box(25.2, 0.12, 0.44, 0, 15.69, sz))), M.metalDark, { name: 'df:strip-housing' }));

  // ── plant clock on the back wall (faces +z): dial + teal hands ──────────
  const dialParts: THREE.BufferGeometry[] = [cyl(CLOCK.r, CLOCK.r, 0.12, 40, CLOCK.x, CLOCK.y, CLOCK.z + 0.06, Math.PI / 2, 0, 0)];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const long = k % 3 === 0;
    const rr = CLOCK.r - (long ? 0.27 : 0.2);
    dialParts.push(box(long ? 0.09 : 0.05, long ? 0.34 : 0.18, 0.03, CLOCK.x + Math.sin(a) * rr, CLOCK.y + Math.cos(a) * rr, CLOCK.z + 0.14, 0, 0, -a));
  }
  det.add(mesh(merge(dialParts.slice(0, 1)), M.panel, { name: 'df:clock-dial' }));
  // ticks and an outer ring are light lines (T0): the face still reads as a clock with the lights out
  det.add(mesh(merge(dialParts.slice(1)), LK.light(0xffe9cc, 0), { receive: false, name: 'df:clock-ticks' }));
  det.add(mesh(torus(CLOCK.r + 0.02, 0.025, 6, 64, CLOCK.x, CLOCK.y, CLOCK.z + 0.13), LK.light(0x2dd4bf, 0), { receive: false, name: 'df:clock-ring' }));
  const handMat = M.emissiveTeal;
  const hourHand = new THREE.Mesh(place(new THREE.BoxGeometry(0.1, 0.8, 0.04), 0, 0.32, 0), handMat);
  const minHand = new THREE.Mesh(place(new THREE.BoxGeometry(0.06, 1.2, 0.04), 0, 0.5, 0), handMat);
  hourHand.position.set(CLOCK.x, CLOCK.y, CLOCK.z + 0.18);
  minHand.position.set(CLOCK.x, CLOCK.y, CLOCK.z + 0.2);
  det.add(hourHand, minHand);
  const setClock = (minutes: number): void => {
    // seen from +z: clockwise = negative rotation about +z
    const m = ((minutes % 720) + 720) % 720;
    hourHand.rotation.z = -(m / 720) * Math.PI * 2;
    minHand.rotation.z = -((m % 60) / 60) * Math.PI * 2;
  };
  setClock(16 * 60 + 40);

  // ── gallery, stair, railings, columns ────────────────────────────────────
  const G = GALLERY;
  const gal: THREE.BufferGeometry[] = [];
  const galAlu: THREE.BufferGeometry[] = [];
  // gallery deck: riveted floor plates on top, dark steel edges (UV in metres, 1 m plates)
  det.add(mesh(merge([boxMM(G.x0, G.y - 0.22, G.z0, G.x1, G.y, G.z1, 1), boxMM(G.landingX, G.y - 0.22, G.z1, G.x1, G.y, STAIR.z1 + 0.02, 1)]), M.floorPlate(1, 1), { name: 'df:gallery-deck' }));
  ctx.physics.addStaticBox({ size: [G.x1 - G.x0, 0.22, G.z1 - G.z0], position: [(G.x0 + G.x1) / 2, G.y - 0.11, (G.z0 + G.z1) / 2], surface: 'metal' });
  ctx.physics.addStaticBox({ size: [G.x1 - G.landingX, 0.22, STAIR.z1 + 0.02 - G.z1], position: [(G.landingX + G.x1) / 2, G.y - 0.11, (G.z1 + STAIR.z1 + 0.02) / 2], surface: 'metal' });
  // columns
  for (const [cx, cz] of [
    [G.x0 + 0.15, G.z0 + 0.15],
    [G.x0 + 0.15, G.z1 - 0.15],
  ] as const) {
    // alu column with a carbon foot (ART-V2 §6.5 "alu column trims")
    galAlu.push(cyl(0.11, 0.13, G.y - 0.22 - 0.16, 18, cx, 0.16 + (G.y - 0.22 - 0.16) / 2, cz));
    gal.push(cyl(0.17, 0.17, 0.16, 18, cx, 0.08, cz));
    ctx.physics.addStaticBox({ size: [0.24, G.y - 0.22, 0.24], position: [cx, (G.y - 0.22) / 2, cz], surface: 'metal' });
  }
  // stair: 30 steps of 0.183 m, visual steps + one sloped collider (wedge hull)
  const steps = 30;
  const run = (STAIR.x1 - STAIR.x0) / steps;
  const rise = G.y / steps;
  for (let i = 0; i < steps; i++) {
    const sx = STAIR.x0 + i * run;
    gal.push(boxMM(sx, (i + 1) * rise - 0.06, STAIR.z0, sx + run + 0.02, (i + 1) * rise, STAIR.z1));
  }
  // stringer (closed side under the stair)
  const stringer = new THREE.Shape();
  stringer.moveTo(STAIR.x0, 0);
  stringer.lineTo(STAIR.x1, G.y - 0.06);
  stringer.lineTo(STAIR.x1, G.y - 0.28);
  stringer.lineTo(STAIR.x0 + 0.4, 0);
  const strGeo = new THREE.ExtrudeGeometry(stringer, { depth: 0.06, bevelEnabled: false });
  place(strGeo, 0, 0, STAIR.z0 - 0.06);
  gal.push(strGeo);
  // colliders: one solid block per step (flat treads → the character controller auto-steps 0.183 m)
  for (let i = 0; i < steps; i++) {
    const sx = STAIR.x0 + i * run;
    const top = (i + 1) * rise;
    ctx.physics.addStaticBox({ size: [run + 0.02, top, STAIR.z1 - STAIR.z0 + 0.12], position: [sx + run / 2, top / 2, (STAIR.z0 + STAIR.z1) / 2 - 0.06], surface: 'metal' });
  }
  // guard along the open side of the stair (the handrail is visual only): the capsule must not
  // slide off the 1.5 m wide flight. It ends at x 11.5: from there on the gallery slab itself closes
  // the side, and a guard reaching the landing pinched the landing → gallery opening to ~0.6 m.
  {
    const run = STAIR.x1 - STAIR.x0;
    const slope = Math.atan2(G.y, run);
    const s0 = -0.3;
    const s1 = (11.5 - STAIR.x0) / Math.cos(slope);
    const sc = (s0 + s1) / 2;
    ctx.physics.addStaticBox({ size: [s1 - s0, 1.3, 0.1], position: [STAIR.x0 + sc * Math.cos(slope), sc * Math.sin(slope) + 0.55, STAIR.z0 - 0.17], rotation: [0, 0, slope], surface: 'metal' });
  }
  const galMesh = mesh(merge(gal), M.darkMetal, { cast: false, name: 'df:gallery' });
  det.add(galMesh);
  det.add(mesh(merge(galAlu), LK.alu, { cast: false, name: 'df:gallery-columns' }));
  // railings: gallery edge x = 9 and z = −5, stairwell edge z = 4, stair side z = 4.05
  const rail: THREE.BufferGeometry[] = [];
  const railRun = (ax: number, az: number, bx: number, bz: number, y0: number, y1: number, col = true): void => {
    const len = Math.hypot(bx - ax, bz - az);
    const ang = Math.atan2(bz - az, bx - ax);
    const mx = (ax + bx) / 2,
      mz = (az + bz) / 2;
    const slope = Math.atan2(y1 - y0, len);
    const ym = (y0 + y1) / 2;
    const L = Math.hypot(len, y1 - y0);
    rail.push(place(new THREE.BoxGeometry(L, 0.05, 0.05), mx, ym + 1.08, mz, 0, -ang, slope));
    rail.push(place(new THREE.BoxGeometry(L, 0.03, 0.03), mx, ym + 0.55, mz, 0, -ang, slope));
    const posts = Math.max(2, Math.ceil(len / 1.4) + 1);
    for (let i = 0; i < posts; i++) {
      const t = i / (posts - 1);
      rail.push(box(0.05, 1.1, 0.05, ax + (bx - ax) * t, y0 + (y1 - y0) * t + 0.55, az + (bz - az) * t));
    }
    if (col) {
      const ry = (y0 + y1) / 2 + 0.55;
      ctx.physics.addStaticBox({ size: [len, 1.1 + Math.abs(y1 - y0), 0.08], position: [mx, ry, mz], rotation: [0, -ang, 0], surface: 'metal' });
    }
  };
  railRun(G.x0 + 0.03, G.z0 + 0.03, G.x0 + 0.03, G.z1, G.y, G.y);
  railRun(G.x0, G.z0 + 0.03, G.x1, G.z0 + 0.03, G.y, G.y);
  railRun(G.x0, G.z1 - 0.03, G.landingX, G.z1 - 0.03, G.y, G.y, false); // stairwell edge: visual (the flight runs right below)
  // stair handrail (no collider: the stringer + wedge hull close the side)
  railRun(STAIR.x0 + 0.3, STAIR.z0 - 0.02, STAIR.x1, STAIR.z0 - 0.02, 0.1, G.y, false);
  det.add(mesh(merge(rail), M.railing, { cast: false, name: 'df:railings' }));

  // ── Verladebucht: platform, deck lift (depth-mask pit), Ladetor ─────────
  const vb: THREE.BufferGeometry[] = [];
  ext.add(mesh(boxMM(8.5, 0, -18.2, 11.5, 0.05, z0, 1), M.floorPlate(1, 1), { name: 'df:verladebucht-deck' }));
  // lift frame (hazard edge drawn separately)
  vb.push(boxMM(LIFT.x - LIFT.size / 2 - 0.15, 0.05, LIFT.z - LIFT.size / 2 - 0.15, LIFT.x + LIFT.size / 2 + 0.15, 0.08, LIFT.z - LIFT.size / 2));
  vb.push(boxMM(LIFT.x - LIFT.size / 2 - 0.15, 0.05, LIFT.z + LIFT.size / 2, LIFT.x + LIFT.size / 2 + 0.15, 0.08, LIFT.z + LIFT.size / 2 + 0.15));
  // cantilever brackets under the platform edge (read from the side)
  vb.push(box(0.2, 0.5, 4.2, 8.6, -0.2, -16.1), box(0.2, 0.5, 4.2, 11.4, -0.2, -16.1));
  // Ladetor: steel gate frame across the railing gap (chord at r 21.8 from 21° to 35°)
  const ga = THREE.MathUtils.degToRad(RAILING_GAP.fromDeg),
    gb = THREE.MathUtils.degToRad(RAILING_GAP.toDeg);
  const R = 21.75;
  const pa = new THREE.Vector2(R * Math.sin(ga), -R * Math.cos(ga));
  const pb = new THREE.Vector2(R * Math.sin(gb), -R * Math.cos(gb));
  const mid = pa.clone().add(pb).multiplyScalar(0.5);
  const chord = pa.distanceTo(pb);
  const chordAng = Math.atan2(pb.y - pa.y, pb.x - pa.x);
  vb.push(place(new THREE.BoxGeometry(chord, 0.08, 0.08), mid.x, 1.12, mid.y, 0, -chordAng, 0));
  vb.push(place(new THREE.BoxGeometry(chord, 0.06, 0.06), mid.x, 0.12, mid.y, 0, -chordAng, 0));
  for (const t of [0, 0.5, 1]) vb.push(box(0.1, 1.16, 0.1, pa.x + (pb.x - pa.x) * t, 0.58, pa.y + (pb.y - pa.y) * t));
  ext.add(mesh(merge(vb), M.darkMetal, { name: 'df:verladebucht' }));
  // hazard band on the Ladetor and the lift edge
  ext.add(
    mesh(
      merge([
        place(new THREE.BoxGeometry(chord, 0.22, 0.1), mid.x, 0.75, mid.y, 0, -chordAng, 0),
        boxMM(LIFT.x - LIFT.size / 2 - 0.15, 0.08, LIFT.z - LIFT.size / 2 - 0.15, LIFT.x - LIFT.size / 2, 0.085, LIFT.z + LIFT.size / 2 + 0.15, 0.6),
        boxMM(LIFT.x + LIFT.size / 2, 0.08, LIFT.z - LIFT.size / 2 - 0.15, LIFT.x + LIFT.size / 2 + 0.15, 0.085, LIFT.z + LIFT.size / 2 + 0.15, 0.6),
      ]),
      hz,
      { name: 'df:ladetor-tape' },
    ),
  );
  ctx.physics.addStaticBox({ size: [chord, 1.2, 0.2], position: [mid.x, 0.6, mid.y], rotation: [0, -chordAng, 0], surface: 'metal' });
  // the lift pit: a depth mask clears depth inside the hatch so the shaft below the deck shows
  const maskMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'out vec4 fc; void main(){ fc = vec4(0.0); gl_FragDepth = 1.0; }',
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
  });
  owned.push(maskMat);
  const mask = new THREE.Mesh(new THREE.PlaneGeometry(LIFT.size, LIFT.size).rotateX(-Math.PI / 2), maskMat);
  mask.position.set(LIFT.x, 0.07, LIFT.z);
  mask.renderOrder = 5;
  mask.frustumCulled = false;
  // the mask and the shaft draw only while the lift is down: at the top its plate covers the hatch (Z1)
  const pitGroup = new THREE.Group();
  pitGroup.userData.noMerge = true;
  pitGroup.visible = false;
  ext.add(pitGroup);
  pitGroup.add(mask);
  const pitMat = new THREE.MeshStandardMaterial({ color: 0x1a1817, roughness: 0.9, metalness: 0.2, side: THREE.BackSide, name: 'dunkelfabrik:pit' });
  owned.push(pitMat);
  const pit = new THREE.Mesh(new THREE.BoxGeometry(LIFT.size, 3, LIFT.size).translate(0, -1.45, 0), pitMat);
  pit.position.set(LIFT.x, 0.06, LIFT.z);
  pit.renderOrder = 6;
  pitGroup.add(pit);
  const liftTop = new THREE.Group();
  liftTop.position.set(LIFT.x, 0.05, LIFT.z);
  liftTop.userData.noMerge = true; // Z1: the deck lift sinks
  ext.add(liftTop);
  const liftPlat = mesh(box(LIFT.size - 0.06, 0.08, LIFT.size - 0.06, 0, -0.04, 0, 0, 0, 0, 0.5), M.floorPlate(2, 2), { name: 'df:lift' });
  liftPlat.renderOrder = 7;
  liftTop.add(liftPlat);
  const setLift = (t: number): void => {
    liftTop.position.y = 0.05 - 2.6 * Math.max(0, Math.min(1, t));
    pitGroup.visible = t > 0.001;
  };

  // ── furnace (detail; landmark inside) ────────────────────────────────────
  const F = FURNACE;
  const fur: THREE.BufferGeometry[] = [];
  const ix0 = x0 + 0.4;
  fur.push(boxMM(ix0, 0, F.z0, F.x1, F.mouthY0, F.z1, 1)); // below mouth
  fur.push(boxMM(ix0, F.mouthY1, F.z0, F.x1, F.h, F.z1, 1)); // above mouth
  fur.push(boxMM(ix0, F.mouthY0, F.z0, F.x1, F.mouthY1, F.mouthZ - F.mouthHalfW, 1));
  fur.push(boxMM(ix0, F.mouthY0, F.mouthZ + F.mouthHalfW, F.x1, F.mouthY1, F.z1, 1));
  // hood + plinth + side cabinet + duct to the roof
  fur.push(boxMM(F.x1, F.mouthY1 + 0.25, F.mouthZ - 1.3, F.x1 + 0.9, F.mouthY1 + 0.55, F.mouthZ + 1.3));
  fur.push(boxMM(ix0, 0, F.z0 - 0.15, F.x1 + 0.15, 0.25, F.z1 + 0.15));
  fur.push(boxMM(F.x1, 0, F.z1 - 1.4, F.x1 + 0.6, 1.9, F.z1 - 0.3));
  fur.push(cyl(0.55, 0.55, h - F.h - 0.4, 16, -13, F.h + (h - F.h - 0.4) / 2, -9.5));
  // refractory ribs on the front face
  for (let i = 0; i < 6; i++) fur.push(boxMM(F.x1, F.mouthY1 + 0.6 + i * 0.42, F.z0 + 0.2, F.x1 + 0.06, F.mouthY1 + 0.7 + i * 0.42, F.z1 - 0.2));
  det.add(mesh(merge(fur), M.darkMetal, { cast: false, name: 'df:furnace' }));
  ctx.physics.addStaticBox({ size: [F.x1 + 0.6 - ix0, F.h, F.z1 - F.z0 + 0.3], position: [(ix0 + F.x1 + 0.6) / 2, F.h / 2, (F.z0 + F.z1) / 2], surface: 'metal' });
  // glowing mouth interior (#FFB347, light not a brand surface)
  const mouthTex = canvasTex(128, 96);
  {
    const g = mouthTex.g;
    const gr = g.createRadialGradient(64, 62, 4, 64, 54, 78);
    gr.addColorStop(0, '#fff3d6');
    gr.addColorStop(0.25, '#ffc46b');
    gr.addColorStop(0.6, '#ff8a26');
    gr.addColorStop(1, '#7a2a08');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 96);
    mouthTex.tex.needsUpdate = true;
  }
  owned.push(mouthTex.tex);
  const glowMat = new THREE.MeshBasicMaterial({ map: mouthTex.tex, color: new THREE.Color(1, 1, 1).multiplyScalar(1.5), name: 'dunkelfabrik:furnace-glow' });
  owned.push(glowMat);
  // recessed glowing back plate + dark-red reveal walls (reads as depth)
  const mouth = mesh(plane((F.mouthHalfW - 0.02) * 2, F.mouthY1 - F.mouthY0 - 0.04, F.x1 - 0.6, (F.mouthY0 + F.mouthY1) / 2, F.mouthZ, 0, Math.PI / 2, 0), glowMat, { receive: false, name: 'df:furnace-mouth' });
  det.add(mouth);
  const revealMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8a3210).multiplyScalar(1.1), side: THREE.DoubleSide });
  owned.push(revealMat);
  det.add(
    mesh(
      merge([
        plane(0.6, F.mouthY1 - F.mouthY0, F.x1 - 0.3, (F.mouthY0 + F.mouthY1) / 2, F.mouthZ - F.mouthHalfW + 0.01, 0, 0, 0),
        plane(0.6, F.mouthY1 - F.mouthY0, F.x1 - 0.3, (F.mouthY0 + F.mouthY1) / 2, F.mouthZ + F.mouthHalfW - 0.01, 0, 0, 0),
        plane(0.6, F.mouthHalfW * 2, F.x1 - 0.3, F.mouthY1 - 0.01, F.mouthZ, Math.PI / 2, 0, Math.PI / 2),
      ]),
      revealMat,
      { receive: false, name: 'df:furnace-reveal' },
    ),
  );
  // floor glow in front of the mouth (additive decal)
  const glowTex = radialTex(128, 0, 1.8);
  owned.push(glowTex);
  const floorGlowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(0xffa040), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -24 });
  owned.push(floorGlowMat);
  const floorGlow = mesh(plane(5, 5, F.x1 + 1.6, FLOOR_Y + 0.006, F.mouthZ, -Math.PI / 2), floorGlowMat, { receive: false, name: 'df:furnace-floorglow' });
  det.add(floorGlow);
  // furnace door (slides down at night, leaves a glowing slit)
  const door = mesh(box(0.14, F.mouthY1 - F.mouthY0 + 0.3, F.mouthHalfW * 2 + 0.4, 0, 0, 0), M.metalDark, { name: 'df:furnace-door' });
  const doorOpenY = F.mouthY1 + 0.9;
  const doorClosedY = (F.mouthY0 + F.mouthY1) / 2 + 0.22;
  door.position.set(F.x1 + 0.1, doorOpenY, F.mouthZ);
  det.add(door);
  let doorTarget = doorOpenY;

  // ── lights (GDD: 2 local lights) ─────────────────────────────────────────
  const furnaceLight = ctx.lights.point([F.x1 + 0.8, 1.5, F.mouthZ], { color: 0xffa94d, intensity: 42, distance: 15 });
  const hallPos = new THREE.Vector3(0, 13, -4);
  // the hall light follows an anchor so "Licht aus" can move it to the work lamp
  const lightAnchor = new THREE.Object3D();
  lightAnchor.position.copy(hallPos);
  det.add(lightAnchor);
  const hallLight = ctx.lights.point(lightAnchor, { color: 0xfff0dc, intensity: 380, distance: 36 });
  let furnaceBase = 42;
  const setHallLight = (mode: 'day' | 'off' | THREE.Vector3): void => {
    if (mode === 'day') {
      lightAnchor.position.copy(hallPos);
      hallLight.setColor(0xfff0dc);
      hallLight.setIntensity(380);
    } else if (mode === 'off') hallLight.setIntensity(0);
    else {
      lightAnchor.position.copy(mode);
      hallLight.setColor(0xffa463);
      hallLight.setIntensity(9);
    }
  };

  // ── night kit (ART-V2 §6.5): with the lights out the machines carry their own light ──
  // floor guide dots every 2 m along the walkways (teal T0: an inlay by day, wayfinding at night)
  const dotGeo = new THREE.CircleGeometry(0.075, 16).rotateX(-Math.PI / 2);
  owned.push(dotGeo);
  const dotPts: [number, number][] = [];
  // inside the painted aisle / walkway lines (not on them: no z-fight with their decal)
  for (let z = 4.6; z > -6.2; z -= 2) for (const x of [-2.5, 2.5]) dotPts.push([x, z]);
  for (let x = -13.6; x < 2.4; x += 2) dotPts.push([x, -6.2]);
  for (let x = 4.2; x < 13; x += 2) dotPts.push([x, 3.6]);
  const dotMat = LK.light(0x2dd4bf, 0).clone();
  dotMat.polygonOffset = true;
  dotMat.polygonOffsetFactor = -12;
  dotMat.polygonOffsetUnits = -24;
  owned.push(dotMat);
  const dots = new THREE.InstancedMesh(dotGeo, dotMat, dotPts.length);
  dots.name = 'df:guide-dots';
  dotPts.forEach(([x, z], i) => dots.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, FLOOR_Y + 0.004, z)));
  dots.instanceMatrix.needsUpdate = true;
  dots.computeBoundingSphere();
  dots.receiveShadow = false;
  det.add(dots);
  // gallery nosing + stair nosing: a teal line in a 2 cm carbon channel (T0 → T1 with the lights out)
  const nightLineMat = LK.light(0x2dd4bf, 0).clone();
  owned.push(nightLineMat);
  const nosing: THREE.BufferGeometry[] = [boxMM(G.x0 - 0.02, G.y - 0.07, G.z0, G.x0 + 0.005, G.y - 0.035, G.z1)];
  for (let i = 2; i < steps; i += 3) {
    const sx = STAIR.x0 + i * run;
    nosing.push(boxMM(sx - 0.005, (i + 1) * rise - 0.045, STAIR.z0 + 0.05, sx + 0.025, (i + 1) * rise - 0.015, STAIR.z1 - 0.05));
  }
  det.add(mesh(merge(nosing), nightLineMat, { receive: false, name: 'df:nosing' }));
  det.add(mesh(boxMM(G.x0 - 0.035, G.y - 0.085, G.z0, G.x0 - 0.015, G.y - 0.02, G.z1), LK.carbon, { name: 'df:nosing-channel' }));
  // two virtual lights that only exist at night: a cool fill off the line's LED edges, the gallery task light
  const lineFill = ctx.lights.point([-2.5, 3.2, -7.4], { color: 0xa9ddd6, intensity: 0, distance: 20 });
  // the gallery task light: warm, from above the Leitstand (the console screens are its visible source)
  const taskLight = ctx.lights.point([G.x0 + 1.6, G.y + 3.0, -3.2], { color: 0xffd9a8, intensity: 0, distance: 7 });
  let nightLevel = 0;
  const setNight = (f: number): void => {
    nightLevel = Math.max(0, Math.min(1, f));
    const k = nightLevel;
    nightLineMat.color.copy(LK.tierColor(0x2dd4bf, k));
    lineFill.setIntensity(48 * k);
    taskLight.setIntensity(3.5 * k);
  };

  // ── player-inside trigger (interior lighting) ────────────────────────────
  const insideFns: ((v: boolean) => void)[] = [];
  let inside = false;
  ctx.physics.addTrigger({
    shape: 'box',
    size: [x1 - x0 - 0.8, h - 0.6, z1 - z0 - 0.8],
    position: [0, (h - 0.6) / 2, (z0 + z1) / 2],
    filter: 'player',
    onEnter: () => {
      inside = true;
      insideFns.forEach((f) => f(true));
    },
    onExit: () => {
      inside = false;
      insideFns.forEach((f) => f(false));
    },
  });

  // ── far silhouette (> 130 m): one box + the slit ─────────────────────────
  const farBox = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0).translate(0, h / 2, (z0 + z1) / 2), M.standard({ color: 0x161514, roughness: 0.8, metalness: 0.3 }));
  far.add(farBox);
  far.add(new THREE.Mesh(new THREE.PlaneGeometry(0.5, SLIT.y1 - SLIT.y0).translate(SLIT.x, (SLIT.y0 + SLIT.y1) / 2, z1 + 0.02), slitMat));
  far.add(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 6.2, 8).translate(-13, h + 3.1, -9.5), LK.alu));

  return {
    setStrip(k, v) {
      strips.setColorAt(k, _c.setScalar(Math.max(0, v)));
      if (strips.instanceColor) strips.instanceColor.needsUpdate = true;
    },
    setShutter(closed) {
      shutterTarget = closed ? 1 : 0;
      if (closed) shutter.visible = true;
    },
    get shutterClosed() {
      return shutterNow > 0.98;
    },
    setFurnaceNight(night) {
      doorTarget = night ? doorClosedY : doorOpenY;
      furnaceBase = night ? 14 : 42;
      floorGlowMat.opacity = night ? 0.24 : 0.55;
    },
    setClock,
    setHallLight,
    setHallLightLevel(f) {
      hallLight.setIntensity(380 * Math.max(0, Math.min(1, f)));
    },
    setLift,
    setNight,
    liftTop,
    get playerInside() {
      return inside;
    },
    onInside(fn) {
      insideFns.push(fn);
    },
    update(dt, t) {
      // shutter (roller door)
      if (shutterNow !== shutterTarget) {
        const sp = dt / 2.2;
        shutterNow = shutterTarget > shutterNow ? Math.min(shutterTarget, shutterNow + sp) : Math.max(shutterTarget, shutterNow - sp * 1.4);
        shutter.scale.y = Math.max(0.001, shutterNow);
        shutter.visible = shutterNow > 0.002;
        if (shutterNow > 0.95 && !shutterCol) shutterCol = ctx.physics.addStaticBox({ size: [DOOR.x1 - DOOR.x0, DOOR.h, 0.3], position: [0, DOOR.h / 2, z1 - 0.5], surface: 'metal' });
        if (shutterNow < 0.95 && shutterCol) {
          shutterCol.remove();
          shutterCol = null;
        }
      }
      // furnace door + flicker
      door.position.y += (doorTarget - door.position.y) * Math.min(1, dt * 1.6);
      const flick = 0.82 + 0.1 * Math.sin(t * 7.3) + 0.08 * Math.sin(t * 17.1 + 1.3) + 0.05 * Math.sin(t * 3.1);
      furnaceLight.setIntensity(furnaceBase * flick);
      glowMat.color.setScalar(1.5 * (0.88 + 0.12 * flick));
      // slit scanner + roof fans
      scanner.position.y = scanY(t) - (SLIT.y0 + SLIT.y1) / 2;
      spinFans(t);
    },
    updateFar(t) {
      scanner.position.y = scanY(t) - (SLIT.y0 + SLIT.y1) / 2;
      spinFans(t);
    },
  };
}

/** monolith cladding: horizontal sandwich-panel joints every 1 m, vertical joints every 3 m (tile = 1.5 m) */
function drawPanels(c: CanvasTex): void {
  const { g, w, h } = c;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  // subtle tonal variation per panel
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const shade = 236 + ((r * 7) % 3) * 6;
    g.fillStyle = `rgb(${shade},${shade - 2},${shade - 4})`;
    g.fillRect(0, (r * h) / rows, w, h / rows);
  }
  g.fillStyle = '#7d7874';
  for (let r = 0; r < rows; r++) g.fillRect(0, (r * h) / rows, w, 2);
  g.fillStyle = '#8f8a85';
  g.fillRect(0, 0, 2, h);
  g.fillStyle = 'rgba(255,255,255,0.6)';
  for (let r = 0; r < rows; r++) g.fillRect(0, (r * h) / rows + 2, w, 1);
}
