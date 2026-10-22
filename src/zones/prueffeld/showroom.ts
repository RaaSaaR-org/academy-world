/**
 * Station A „Die Vorführung“ (Probieren): the vendor's glossy showroom — deliberately the one
 * off-brand, vendor-aesthetic place on the island (GDD §9.1). Stage, LED wall, truss gantry
 * with the split-flap sign „100 % ERFOLG“, three fake volumetric spots, the vendor arm picking
 * 5 of 5 on a scripted loop, the terminal „Frag den Hersteller“ with nine card slots, caveat
 * tags under the sign, and the hidden Take-Board (album „bester-von-40“).
 */
import * as THREE from 'three';
import { createArm, evalKeys, GRIP_CLOSED, GRIP_OPEN, newKey, type ArmRig, type Key } from './arm';
import { createFlapSign } from './flapSign';
import { atlasQuads, coneMaterial, fitText, FONT_DISPLAY, FONT_MONO, FONT_SANS, glowMaterial, makeCanvas, Painter, patchInstancedUv, place, rrect, ZERO } from './geom';
import { CARD_ZONE } from './strings';
import type { Shared } from './state';
import type { ChallengeHandle, InfoCardSpec } from '@/core/zones';

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();
const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();

/** Stage and rig layout (zone-local). */
const STAGE = { x0: -12, x1: -2, z0: -8, z1: 0, h: 0.4 };
const SIGN = { x: -7, z: -8, y: 6.2, w: 8.4, h: 1.78, d: 0.34 };
const RIG = { xL: -12.8, xR: -1.2, zB: -8, zF: -1.0, top: 8.55, frontY: 7.7 };
const ARM_BASE = new THREE.Vector3(-7, 0.9, -4.45);
const FIXTURE = new THREE.Vector3(-5.95, 1.025, -4.0);
const CRATE = new THREE.Vector3(-8.05, 0.885, -4.0);
const SLOTS: [number, number][] = [
  [-0.11, -0.07],
  [0, -0.07],
  [0.11, -0.07],
  [-0.055, 0.075],
  [0.055, 0.075],
];
const TAKES = { x: -7.7, z: -11.4, y0: 0.35, w: 4.2, h: 2.3 };

export interface Showroom {
  /** spots die, LED wall dims, demo stops (shutter opened) */
  lightsOut(instant?: boolean): void;
  /** debug: play two cards and award A */
  solve(): void;
  solveAlbum(): void;
  /** debug: pretend the terminal was opened 31 s ago (Entscheider skip test) */
  ageTerminal(): void;
  armObject: THREE.Object3D;
  /** debug: all nine cards played (★★★) */
  stars3(): void;
  readonly challenge: ChallengeHandle;
  /** on every return (plan §4.7): stars follow the cards played so far; unplayed cards get one EMI line */
  reevaluate(): void;
}

export function buildShowroom(S: Shared): Showroom {
  const ctx = S.ctx;
  const M = ctx.materials;
  const ext = ctx.groups.exterior;
  const det = ctx.groups.detail;
  // cards the player holds (engine Pass, read-only) + live awards
  const held = new Set<number>(ctx.pass.questions());
  ctx.events.on('question:awarded', (p: { n: number }) => {
    held.add(p.n);
    renderTerminalScreen();
    refreshPanel?.();
  });
  ctx.events.on('progress:reset', () => {
    held.clear();
    S.cardsPlayed.length = 0;
    renderTerminalScreen();
    S.updateSign();
  });
  S.cardsPlayed = (ctx.progress.get<number[]>('cards', []) ?? []).filter((n) => typeof n === 'number');
  for (const n of S.cardsPlayed) held.add(n);

  // ── stage, audience floor (exterior) ─────────────────────────────────────
  const gloss = M.standard({ color: 0xfafaf9, roughness: 0.14, metalness: 0.0 });
  const sw = STAGE.x1 - STAGE.x0,
    sd = STAGE.z1 - STAGE.z0;
  const scx = (STAGE.x0 + STAGE.x1) / 2,
    scz = (STAGE.z0 + STAGE.z1) / 2;
  const stageTop = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.04, sd), gloss);
  stageTop.position.set(scx, STAGE.h - 0.02, scz);
  stageTop.receiveShadow = true;
  ext.add(stageTop);
  const body = new Painter()
    .box(sw, STAGE.h - 0.04, sd, [scx, (STAGE.h - 0.04) / 2, scz], 0xd6d3d1)
    .box(sw, 0.2, 0.45, [scx, 0.1, STAGE.z1 + 0.225], 0xe7e5e4)
    // audience runway: glossy tiles in front of the stage
    .box(12.4, 0.03, 4.2, [scx, 0.035, STAGE.z1 + 2.55], 0xf5f5f4);
  const stageBody = body.mesh(M.standard({ vertexColors: true, roughness: 0.18, metalness: 0.02, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }), { cast: true });
  ext.add(stageBody);
  ctx.physics.addStaticBox({ size: [sw, STAGE.h, sd], position: [scx, STAGE.h / 2, scz], surface: 'metal' });
  ctx.physics.addStaticBox({ size: [sw, 0.2, 0.45], position: [scx, 0.1, STAGE.z1 + 0.225], surface: 'metal' });
  // warm LED edge lines (vendor glam)
  const edge = new Painter()
    .box(sw, 0.025, 0.025, [scx, STAGE.h + 0.004, STAGE.z1 - 0.02], 0xffffff)
    .box(sw, 0.02, 0.02, [scx, 0.2 + 0.004, STAGE.z1 + 0.44], 0xffffff)
    .box(0.025, 0.025, sd, [STAGE.x0 + 0.02, STAGE.h + 0.004, scz], 0xffffff)
    .box(0.025, 0.025, sd, [STAGE.x1 - 0.02, STAGE.h + 0.004, scz], 0xffffff);
  const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1dc).multiplyScalar(1.6) });
  const edgeMesh = edge.mesh(edgeMat);
  edgeMesh.receiveShadow = false;
  ext.add(edgeMesh);
  ctx.onDispose(() => edgeMat.dispose());

  // ── LED backdrop (exterior) ──────────────────────────────────────────────
  const led = makeCanvas(1024, 448);
  ctx.onDispose(() => led.tex.dispose());
  let ledOn = true;
  const drawLed = (): void => {
    const g = led.g,
      w = 1024,
      h = 448;
    g.fillStyle = '#0b0a0a';
    g.fillRect(0, 0, w, h);
    if (ledOn) {
      const grd = g.createRadialGradient(w * 0.62, h * 0.4, 10, w * 0.62, h * 0.4, w * 0.7);
      grd.addColorStop(0, 'rgba(250,250,249,0.30)');
      grd.addColorStop(0.45, 'rgba(214,211,209,0.10)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      // glossy product swoosh
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = 3;
      for (let i = 0; i < 7; i++) {
        g.beginPath();
        g.moveTo(-20, h * 0.86 - i * 9);
        g.bezierCurveTo(w * 0.35, h * 0.55 - i * 14, w * 0.65, h * 0.98 - i * 6, w + 20, h * 0.52 - i * 12);
        g.stroke();
      }
      g.fillStyle = '#FAFAF9';
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.font = `500 22px ${FONT_MONO}`;
      g.fillText(ctx.t('backdrop.brand').split('').join(' '), 72, 96);
      g.font = `700 70px ${FONT_DISPLAY}`;
      g.fillText(ctx.t('backdrop.line1'), 66, 200);
      g.font = `300 70px ${FONT_SANS}`;
      g.fillText(ctx.t('backdrop.line2'), 66, 278);
      g.font = `500 18px ${FONT_MONO}`;
      g.fillStyle = 'rgba(245,245,244,0.55)';
      g.fillText(ctx.t('fiction'), 72, 400);
    } else {
      // switched off (Phase 5): charcoal hardware, not a hole — the 11 × 8 cabinet seams, a sky sheen,
      // the claim faintly burnt in, an orange standby dot
      g.fillStyle = '#161514';
      g.fillRect(0, 0, w, h);
      const sheen = g.createLinearGradient(0, 0, w * 0.6, h);
      sheen.addColorStop(0, 'rgba(231,229,228,0.09)');
      sheen.addColorStop(0.5, 'rgba(231,229,228,0.02)');
      sheen.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sheen;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(231,229,228,0.07)';
      for (let i = 1; i < 11; i++) g.fillRect(Math.round((i * w) / 11) - 1, 0, 2, h);
      for (let j = 1; j < 8; j++) g.fillRect(0, Math.round((j * h) / 8) - 1, w, 2);
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.fillStyle = 'rgba(250,250,249,0.04)';
      g.font = `700 70px ${FONT_DISPLAY}`;
      g.fillText(ctx.t('backdrop.line1'), 66, 200);
      g.fillStyle = '#ff6700';
      g.beginPath();
      g.arc(w - 26, h - 22, 4, 0, Math.PI * 2);
      g.fill();
    }
    // LED pixel grid
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
    for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
    led.tex.needsUpdate = true;
  };
  drawLed();
  // ART-V2 §6.6: the LED wall glows (T1: the white claim blooms a little, the dark pixels stay dark)
  const ledMat = new THREE.MeshBasicMaterial({ map: led.tex, toneMapped: true, color: new THREE.Color(1.55, 1.55, 1.55) });
  ctx.onDispose(() => ledMat.dispose());
  const ledW = 10.6,
    ledH = 4.62;
  const ledScreen = new THREE.Mesh(new THREE.PlaneGeometry(ledW, ledH), ledMat);
  ledScreen.position.set(-5.95, STAGE.h + 0.25 + ledH / 2, -8.38);
  ext.add(ledScreen);
  const ledFrame = new Painter()
    .box(ledW + 0.24, ledH + 0.24, 0.22, [-5.95, STAGE.h + 0.25 + ledH / 2, -8.5], 0xd6d3d1)
    .box(0.18, STAGE.h + 0.25, 0.3, [-5.95 - ledW / 2 + 0.4, (STAGE.h + 0.25) / 2, -8.5], 0xd6d3d1)
    .box(0.18, STAGE.h + 0.25, 0.3, [-5.95 + ledW / 2 - 0.4, (STAGE.h + 0.25) / 2, -8.5], 0xd6d3d1)
    .mesh(M.standard({ vertexColors: true, roughness: 0.26, metalness: 0.88 }), { cast: true });
  ext.add(ledFrame);
  ctx.physics.addStaticBox({ size: [ledW + 0.24, ledH + 0.5, 0.3], position: [-5.95, STAGE.h + (ledH + 0.5) / 2, -8.5] });
  ctx.i18n.onChange(drawLed);
  // backstage (Phase 5): the rear of a rented LED wall — dark cabinet modules with handles, cable runs
  // to a distro box and two braces on ballast (it was one flat grey slab seen from the Take-Board)
  {
    const back = new Painter();
    const bz = -8.61,
      cy0 = STAGE.h + 0.25 + ledH / 2,
      gw = ledW + 0.24,
      gh = ledH + 0.24,
      cols = 11,
      rows = 8;
    const cw = gw / cols,
      chh = gh / rows;
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++) {
        const x = -5.95 - gw / 2 + cw * (c + 0.5),
          y = cy0 - gh / 2 + chh * (r + 0.5);
        back.box(cw - 0.035, chh - 0.035, 0.12, [x, y, bz - 0.06], (c + r) % 5 === 0 ? 0x292524 : 0x1c1917);
        back.box(0.26, 0.03, 0.04, [x, y + chh * 0.32, bz - 0.14], 0xa8a29e);
        back.box(0.05, 0.05, 0.03, [x + cw * 0.34, y - chh * 0.3, bz - 0.135], 0x0c0a09);
      }
    // data/power daisy chain: a cable tray along the bottom, three drops to the distro box
    back.box(gw - 0.2, 0.06, 0.12, [-5.95, cy0 - gh / 2 - 0.08, bz - 0.12], 0x0c0a09);
    for (const x of [-10.2, -5.95, -1.7]) back.cyl(0.025, 0.025, cy0 - gh / 2, [x, (cy0 - gh / 2) / 2, bz - 0.16], 0x0c0a09, undefined, 8);
    back.rbox(0.9, 0.55, 0.45, 0.03, [-3.9, 0.275, -9.25], 0x292524);
    back.box(0.5, 0.06, 0.02, [-3.9, 0.4, -9.03], 0xa8a29e);
    back.cyl(0.03, 0.03, 2.2, [-2.8, 0.03, -9.0], 0x0c0a09, [0, 0, Math.PI / 2], 8);
    // two rear braces on ballast (clear of the Take-Board and the capsule)
    for (const x of [-10.6, -1.3]) {
      const top = new THREE.Vector3(x, cy0 + gh / 2 - 0.4, bz - 0.15),
        foot = new THREE.Vector3(x, 0.32, -10.05);
      const d = new THREE.Vector3().subVectors(top, foot);
      const g = new THREE.CylinderGeometry(0.045, 0.045, d.length(), 10);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
      const m = top.clone().add(foot).multiplyScalar(0.5);
      back.add(g, 0xd6d3d1, [m.x, m.y, m.z]);
      back.rbox(0.62, 0.32, 0.5, 0.03, [x, 0.16, -10.1], 0x292524);
      back.box(0.64, 0.05, 0.52, [x, 0.335, -10.1], 0x44403c);
      ctx.physics.addStaticBox({ size: [0.62, 0.36, 0.5], position: [x, 0.18, -10.1] });
    }
    ext.add(back.mesh(M.standard({ vertexColors: true, roughness: 0.6, metalness: 0.35 }), { cast: true }));
  }

  // ── truss gantry (exterior): alpha-tested lattice texture on boxes ─────────
  const truss = ctx.materials.canvasTexture(64, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#e7e5e4';
    g.fillRect(0, 0, 7, h);
    g.fillRect(w - 7, 0, 7, h);
    g.lineWidth = 5;
    g.strokeStyle = '#e7e5e4';
    for (let y = 0; y < h; y += 64) {
      g.beginPath();
      g.moveTo(4, y);
      g.lineTo(w - 4, y + 32);
      g.lineTo(4, y + 64);
      g.stroke();
      g.fillRect(0, y, w, 4);
    }
  });
  truss.wrapS = truss.wrapT = THREE.RepeatWrapping;
  ctx.onDispose(() => truss.dispose());
  // clean silver trade-fair truss (it read as unfinished black steel)
  const trussMat = new THREE.MeshStandardMaterial({ map: truss, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, color: 0xe7e5e4, metalness: 0.9, roughness: 0.26 });
  ctx.onDispose(() => trussMat.dispose());
  const trussBox = (len: number, axis: 'x' | 'y' | 'z', p: [number, number, number]): THREE.BufferGeometry => {
    const t = 0.34;
    const g = new THREE.BoxGeometry(axis === 'x' ? len : t, axis === 'y' ? len : t, axis === 'z' ? len : t);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
    const k = len / (t * 4); // lattice repeats every 4 truss widths… along the canvas v axis
    // BoxGeometry face UVs: ±x faces u↔z v↔y · ±y faces u↔x v↔z · ±z faces u↔x v↔y
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(nrm.getX(i)) > 0.5,
        ny = Math.abs(nrm.getY(i)) > 0.5;
      const u = uv.getX(i),
        v = uv.getY(i);
      const alongIsU = (axis === 'x' && !nx) || (axis === 'z' && nx);
      const alongIsV = (axis === 'y' && !ny) || (axis === 'z' && ny);
      if (alongIsU) uv.setXY(i, v, u * k);
      else if (alongIsV) uv.setXY(i, u, v * k);
    }
    return place(g, p);
  };
  const tg: THREE.BufferGeometry[] = [];
  const postH = RIG.top;
  for (const x of [RIG.xL, RIG.xR]) {
    tg.push(trussBox(postH, 'y', [x, postH / 2, RIG.zB]));
    tg.push(trussBox(RIG.frontY, 'y', [x, RIG.frontY / 2, RIG.zF]));
    tg.push(trussBox(RIG.zF - RIG.zB, 'z', [x, RIG.frontY + 0.17, (RIG.zB + RIG.zF) / 2]));
  }
  tg.push(trussBox(RIG.xR - RIG.xL + 0.34, 'x', [(RIG.xL + RIG.xR) / 2, RIG.top + 0.17, RIG.zB]));
  tg.push(trussBox(RIG.xR - RIG.xL + 0.34, 'x', [(RIG.xL + RIG.xR) / 2, RIG.frontY + 0.17, RIG.zF]));
  const trussGeo = mergeAll(tg);
  const trussMesh = new THREE.Mesh(trussGeo, trussMat);
  trussMesh.castShadow = true;
  ext.add(trussMesh);
  for (const [x, z, hh] of [
    [RIG.xL, RIG.zB, postH],
    [RIG.xR, RIG.zB, postH],
    [RIG.xL, RIG.zF, RIG.frontY],
    [RIG.xR, RIG.zF, RIG.frontY],
  ] as const) {
    ctx.physics.addStaticBox({ size: [0.34, hh, 0.34], position: [x, hh / 2, z] });
  }
  // base plates of the posts + spot fixtures + sign hangers (merged, dark)
  const rigParts = new Painter();
  for (const [x, z] of [
    [RIG.xL, RIG.zB],
    [RIG.xR, RIG.zB],
    [RIG.xL, RIG.zF],
    [RIG.xR, RIG.zF],
  ] as const)
    rigParts.box(0.7, 0.05, 0.7, [x, 0.025 + (x > STAGE.x0 && x < STAGE.x1 ? STAGE.h : 0), z], 0x1c1917);
  for (const x of [SIGN.x - SIGN.w * 0.38, SIGN.x + SIGN.w * 0.38]) rigParts.box(0.04, RIG.top - (SIGN.y + SIGN.h), 0.04, [x, (RIG.top + SIGN.y + SIGN.h) / 2, SIGN.z], 0x292524);
  const SPOTS: { at: THREE.Vector3; target: THREE.Vector3 }[] = [
    { at: new THREE.Vector3(-9.7, RIG.frontY - 0.25, RIG.zF), target: new THREE.Vector3(-8.35, STAGE.h, -4.05) },
    { at: new THREE.Vector3(-7.0, RIG.frontY - 0.25, RIG.zF), target: new THREE.Vector3(-7.0, STAGE.h, -4.55) },
    { at: new THREE.Vector3(-4.3, RIG.frontY - 0.25, RIG.zF), target: new THREE.Vector3(-5.75, STAGE.h, -4.05) },
  ];
  for (const s of SPOTS) {
    V.copy(s.target).sub(s.at).normalize();
    Q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), V);
    E.setFromQuaternion(Q);
    rigParts.add(new THREE.CylinderGeometry(0.17, 0.22, 0.42, 16), 0x1c1917, [s.at.x, s.at.y, s.at.z], [E.x, E.y, E.z]);
    rigParts.add(new THREE.BoxGeometry(0.06, 0.32, 0.06), 0x292524, [s.at.x, s.at.y + 0.3, s.at.z]);
  }
  ext.add(rigParts.mesh(M.standard({ vertexColors: true, roughness: 0.5, metalness: 0.5 })));
  // lenses (emissive warm white) + cones + light pools
  const lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff4e6).multiplyScalar(2.2) });
  ctx.onDispose(() => lensMat.dispose());
  const lensGeo: THREE.BufferGeometry[] = [];
  const coneGeo: THREE.BufferGeometry[] = [];
  const poolGeo: THREE.BufferGeometry[] = [];
  for (const s of SPOTS) {
    V.copy(s.target).sub(s.at);
    const len = V.length();
    V.normalize();
    Q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), V);
    E.setFromQuaternion(Q);
    const lens = new THREE.CircleGeometry(0.15, 20).rotateX(Math.PI / 2);
    lens.translate(0, -0.215, 0);
    lensGeo.push(place(lens, [s.at.x, s.at.y, s.at.z], [E.x, E.y, E.z]));
    const cone = new THREE.CylinderGeometry(0.13, 1.25, 1, 40, 1, true).translate(0, -0.5, 0);
    const pos = cone.getAttribute('position');
    const at = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) at[i] = -pos.getY(i);
    cone.setAttribute('aT', new THREE.BufferAttribute(at, 1));
    cone.deleteAttribute('uv');
    cone.scale(1, len, 1);
    cone.computeVertexNormals();
    coneGeo.push(place(cone, [s.at.x, s.at.y - 0.2, s.at.z], [E.x, E.y, E.z]));
    const pool = new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2);
    poolGeo.push(place(pool, [s.target.x, STAGE.h + 0.006, s.target.z]));
  }
  ext.add(new THREE.Mesh(mergeAll(lensGeo), lensMat));
  const coneMat = coneMaterial(0xfff1e0, 0.34);
  coneMat.vertexShader = coneMat.vertexShader.replace('varying float vT;', 'attribute float aT;\n      varying float vT;').replace('vT = clamp(-position.y, 0.0, 1.0);', 'vT = aT;');
  ctx.onDispose(() => coneMat.dispose());
  const cones = new THREE.Mesh(mergeAll(coneGeo), coneMat);
  cones.renderOrder = 5;
  ext.add(cones);
  const poolMat = glowMaterial(0xfff1e0, 0.55);
  ctx.onDispose(() => poolMat.dispose());
  const pools = new THREE.Mesh(mergeAll(poolGeo), poolMat);
  pools.renderOrder = 4;
  ext.add(pools);

  // ── split-flap sign (exterior landmark) ──────────────────────────────────
  const sign = createFlapSign(
    [
      { modules: 13, w: 0.56, h: 0.86, gap: 0.05, y: 1.18 },
      { modules: 20, w: 0.36, h: 0.5, gap: 0.035, y: 0.42 },
    ],
    SIGN.d,
  );
  sign.group.position.set(SIGN.x, SIGN.y, SIGN.z);
  sign.group.userData.noMerge = true; // Z1: the flaps turn
  ext.add(sign.group);
  S.sign = sign;
  ctx.onDispose(() => sign.dispose());
  const housing = new Painter()
    .box(SIGN.w, SIGN.h, SIGN.d, [0, SIGN.h / 2, 0], 0x0c0a09)
    .box(SIGN.w + 0.1, 0.07, SIGN.d + 0.06, [0, SIGN.h + 0.035, 0], 0x292524)
    .box(SIGN.w + 0.1, 0.07, SIGN.d + 0.06, [0, -0.035, 0], 0x292524)
    .box(0.07, SIGN.h + 0.14, SIGN.d + 0.06, [-SIGN.w / 2 - 0.035, SIGN.h / 2, 0], 0x292524)
    .box(0.07, SIGN.h + 0.14, SIGN.d + 0.06, [SIGN.w / 2 + 0.035, SIGN.h / 2, 0], 0x292524)
    .mesh(M.standard({ vertexColors: true, roughness: 0.4, metalness: 0.5 }), { cast: true });
  sign.group.add(housing);
  // the vendor's claim is fiction: say so on the sign itself
  ctx.text3d.create({ text: ctx.i18n.text('fiction'), font: 'mono-medium', size: 0.075, color: 0x78716c, anchorX: 'right', letterSpacing: 0.14, position: [SIGN.w / 2 - 0.08, 0.03, SIGN.d / 2 + 0.035] }, sign.group);
  // warm light bar above the claim
  const bar = new THREE.Mesh(new THREE.BoxGeometry(SIGN.w * 0.96, 0.03, 0.05), edgeMat);
  bar.position.set(0, SIGN.h + 0.09, SIGN.d / 2 + 0.06);
  sign.group.add(bar);
  S.updateSign(true);
  ctx.i18n.onChange(() => S.updateSign());

  // ── vendor arm + props (detail) ──────────────────────────────────────────
  const armMat = M.standard({ vertexColors: true, roughness: 0.26, metalness: 0.12 });
  const arm: ArmRig = createArm(armMat);
  arm.object.position.copy(ARM_BASE);
  det.add(arm.object);
  ctx.onDispose(() => arm.dispose());
  const props = new Painter()
    // pedestal
    .rbox(0.62, 0.5, 0.62, 0.04, [ARM_BASE.x, STAGE.h + 0.25, ARM_BASE.z], 0xf5f5f4)
    // fixture plinth + hard stop + feeder chute
    .rbox(0.34, FIXTURE.y - 0.025 - STAGE.h, 0.5, 0.03, [FIXTURE.x, (FIXTURE.y - 0.025 + STAGE.h) / 2, FIXTURE.z - 0.12], 0xf5f5f4)
    .box(0.16, 0.06, 0.03, [FIXTURE.x, FIXTURE.y + 0.005, FIXTURE.z + 0.06], 0x1c1917)
    .box(0.03, 0.05, 0.12, [FIXTURE.x - 0.065, FIXTURE.y, FIXTURE.z], 0x44403c)
    .box(0.03, 0.05, 0.12, [FIXTURE.x + 0.065, FIXTURE.y, FIXTURE.z], 0x44403c)
    .box(0.13, 0.015, 0.42, [FIXTURE.x, FIXTURE.y - 0.03, FIXTURE.z - 0.25], 0xa8a29e, [0.0, 0, 0])
    // crate plinth + crate (open box)
    .rbox(0.56, CRATE.y - 0.025 - 0.035 - STAGE.h, 0.46, 0.03, [CRATE.x, (CRATE.y - 0.06 + STAGE.h) / 2, CRATE.z], 0xf5f5f4)
    .box(0.42, 0.02, 0.32, [CRATE.x, CRATE.y - 0.035, CRATE.z], 0x292524)
    .box(0.42, 0.11, 0.015, [CRATE.x, CRATE.y + 0.01, CRATE.z - 0.16], 0x292524)
    .box(0.42, 0.11, 0.015, [CRATE.x, CRATE.y + 0.01, CRATE.z + 0.16], 0x292524)
    .box(0.015, 0.11, 0.32, [CRATE.x - 0.21, CRATE.y + 0.01, CRATE.z], 0x292524)
    .box(0.015, 0.11, 0.32, [CRATE.x + 0.21, CRATE.y + 0.01, CRATE.z], 0x292524)
    // flight cases backstage
    .box(1.2, 0.8, 0.8, [-13.0, 0.4, -9.6], 0x1c1917)
    .box(1.2, 0.8, 0.8, [-13.0, 1.2, -9.62], 0x292524)
    .box(1.0, 0.7, 0.9, [-13.1, 0.35, -10.6], 0x292524);
  det.add(props.mesh(M.standard({ vertexColors: true, roughness: 0.3, metalness: 0.15 }), { cast: true }));
  ctx.physics.addStaticBox({ size: [0.62, 0.5, 0.62], position: [ARM_BASE.x, STAGE.h + 0.25, ARM_BASE.z] });
  ctx.physics.addStaticBox({ size: [0.34, 0.6, 0.5], position: [FIXTURE.x, 0.7, FIXTURE.z - 0.12] });
  ctx.physics.addStaticBox({ size: [0.56, 0.45, 0.46], position: [CRATE.x, 0.62, CRATE.z] });
  ctx.physics.addStaticBox({ size: [1.3, 1.6, 2.0], position: [-13.05, 0.8, -10.1] });

  // parts (hex nuts): 0 = fixture/gripper, 1–5 = crate, 6 = feeder
  const partGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.05, 6);
  const parts = new THREE.InstancedMesh(partGeo, M.steel, 7);
  parts.castShadow = false;
  parts.frustumCulled = false; // moving instances (see geom.atlasQuads)
  parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  det.add(parts);
  ctx.onDispose(() => partGeo.dispose());
  const setPart = (i: number, p: THREE.Vector3 | null, s = 1): void => {
    if (!p) {
      parts.setMatrixAt(i, ZERO);
      return;
    }
    M4.compose(p, Q.identity(), V2.set(s, s, s));
    parts.setMatrixAt(i, M4);
  };

  // demo loop: 5 picks of 3.4 s, then 2.8 s of applause pose, crate empties, repeat
  const CYCLE = 3.4,
    PAUSE = 2.8;
  const keysFor = (slot: number): Key[] => {
    const [dx, dz] = SLOTS[slot];
    const H = { x: -7.0, y: 1.6, z: -3.65 };
    const k = (t: number, x: number, y: number, z: number, grip: number): Key => ({ t, x, y, z, yaw: 0, grip });
    return [
      k(0, H.x, H.y, H.z, GRIP_OPEN),
      k(0.75, FIXTURE.x, FIXTURE.y + 0.2, FIXTURE.z, GRIP_OPEN),
      k(1.05, FIXTURE.x, FIXTURE.y, FIXTURE.z, GRIP_OPEN),
      k(1.25, FIXTURE.x, FIXTURE.y, FIXTURE.z, GRIP_CLOSED),
      k(1.5, FIXTURE.x, FIXTURE.y + 0.26, FIXTURE.z, GRIP_CLOSED),
      k(2.3, CRATE.x + dx, CRATE.y + 0.3, CRATE.z + dz, GRIP_CLOSED),
      k(2.62, CRATE.x + dx, CRATE.y + 0.012, CRATE.z + dz, GRIP_CLOSED),
      k(2.78, CRATE.x + dx, CRATE.y + 0.012, CRATE.z + dz, GRIP_OPEN),
      k(3.02, CRATE.x + dx, CRATE.y + 0.22, CRATE.z + dz, GRIP_OPEN),
      k(CYCLE, H.x, H.y, H.z, GRIP_OPEN),
    ];
  };
  const cycles = SLOTS.map((_, i) => keysFor(i));
  const bowKeys: Key[] = [
    { t: 0, x: -7.0, y: 1.6, z: -3.65, yaw: 0, grip: GRIP_OPEN },
    { t: 0.8, x: -7.0, y: 2.05, z: -3.95, yaw: 0.6, grip: GRIP_OPEN },
    { t: 1.6, x: -7.0, y: 1.55, z: -3.6, yaw: -0.4, grip: GRIP_OPEN },
    { t: PAUSE, x: -7.0, y: 1.6, z: -3.65, yaw: 0, grip: GRIP_OPEN },
  ];
  const key = newKey();
  let demoT = 0;
  let demoOn = true;
  let lastCycle = -1;
  const tcp = new THREE.Vector3();
  const slotPos = (i: number, out: THREE.Vector3): THREE.Vector3 => out.set(CRATE.x + SLOTS[i][0], CRATE.y, CRATE.z + SLOTS[i][1]);
  const demo = (dt: number): void => {
    if (!demoOn) return;
    demoT += dt;
    const loop = CYCLE * 5 + PAUSE;
    if (demoT >= loop) demoT -= loop;
    const ci = Math.floor(demoT / CYCLE);
    if (ci < 5) {
      const t = demoT - ci * CYCLE;
      evalKeys(cycles[ci], t, key);
      arm.reach(key.x, key.y, key.z, key.yaw);
      arm.setGrip(key.grip);
      // crate parts placed so far
      for (let i = 0; i < 5; i++) setPart(1 + i, i < ci || (i === ci && t >= 2.78) ? slotPos(i, V) : null);
      // part in the gripper or in the fixture
      if (t < 1.25) setPart(0, FIXTURE);
      else if (t < 2.78) setPart(0, arm.tcpLocal(tcp));
      else setPart(0, null);
      // feeder: next part slides against the stop
      if (ci < 4 && t > 1.55) {
        const u = Math.min(1, (t - 1.55) / 0.5);
        setPart(6, V.set(FIXTURE.x, FIXTURE.y, FIXTURE.z - 0.38 * (1 - u * u * (3 - 2 * u))));
      } else setPart(6, null);
      if (ci !== lastCycle) {
        lastCycle = ci;
        if (ci === 0 && ctx.playerDistance < 34) sfxJingle();
      }
      if (t >= 2.78 && t - dt < 2.78 && ctx.playerDistance < 30) S.sfx.chime([CRATE.x, CRATE.y, CRATE.z]);
    } else {
      const t = demoT - 5 * CYCLE;
      evalKeys(bowKeys, t, key);
      arm.reach(key.x, key.y, key.z, key.yaw);
      arm.setGrip(key.grip);
      const fade = Math.max(0, 1 - Math.max(0, t - (PAUSE - 0.5)) / 0.5);
      for (let i = 0; i < 5; i++) setPart(1 + i, fade > 0 ? slotPos(i, V) : null, fade);
      setPart(0, FIXTURE);
      setPart(6, null);
      lastCycle = 5;
    }
    parts.instanceMatrix.needsUpdate = true;
  };
  const sfxJingle = (): void => {
    if (!S.shutterOpen) S.sfx.jingle([-7, 3, -4]);
  };
  const servo = ctx.audio.loop('servo', { at: arm.object, volume: 0.25 });

  // ── caveat tags under the sign (detail) ──────────────────────────────────
  const tagAtlas = makeCanvas(1024, 512);
  ctx.onDispose(() => tagAtlas.tex.dispose());
  const drawTags = (): void => {
    const g = tagAtlas.g;
    g.clearRect(0, 0, 1024, 512);
    for (let n = 1; n <= 9; n++) {
      const cx = ((n - 1) % 3) * 341,
        cy = Math.floor((n - 1) / 3) * 170;
      g.fillStyle = '#f5f5f4';
      rrect(g, cx + 6, cy + 6, 329, 158, 10);
      g.fill();
      g.fillStyle = '#ff6700';
      g.fillRect(cx + 6, cy + 6, 329, 6);
      g.fillStyle = '#57534e';
      g.font = `500 16px ${FONT_MONO}`;
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.fillText(`#${n}`, cx + 18, cy + 34);
      g.textAlign = 'right';
      g.fillStyle = '#a8a29e';
      g.fillText(ctx.t('fiction'), cx + 322, cy + 34);
      g.textAlign = 'left';
      g.fillStyle = '#141414';
      const txt = ctx.t(`q.${n}.tag`);
      const words = txt.split(' ');
      const one = fitText(g, txt, 300, 58, '700', FONT_DISPLAY);
      if (one >= 44 || words.length < 2) {
        g.font = `700 ${one}px ${FONT_DISPLAY}`;
        g.fillText(txt, cx + 18, cy + 100 + one * 0.3);
      } else {
        // two lines, balanced
        let best = 1,
          bestW = Infinity;
        for (let k = 1; k < words.length; k++) {
          const w = Math.max(g.measureText(words.slice(0, k).join(' ')).width, g.measureText(words.slice(k).join(' ')).width);
          if (w < bestW) {
            bestW = w;
            best = k;
          }
        }
        const l1 = words.slice(0, best).join(' '),
          l2 = words.slice(best).join(' ');
        const s2 = Math.min(fitText(g, l1, 300, 50, '700', FONT_DISPLAY), fitText(g, l2, 300, 50, '700', FONT_DISPLAY));
        g.font = `700 ${s2}px ${FONT_DISPLAY}`;
        g.fillText(l1, cx + 18, cy + 84);
        g.fillText(l2, cx + 18, cy + 84 + s2 + 6);
      }
    }
    tagAtlas.tex.needsUpdate = true;
  };
  drawTags();
  ctx.i18n.onChange(drawTags);
  const tagMat = new THREE.MeshStandardMaterial({ map: tagAtlas.tex, emissiveMap: tagAtlas.tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.85, metalness: 0, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
  patchInstancedUv(tagMat, 'prueffeld-tag');
  ctx.onDispose(() => tagMat.dispose());
  const tagQuads = atlasQuads(9, tagMat);
  tagQuads.mesh.castShadow = false;
  det.add(tagQuads.mesh);
  const stringGeo = new THREE.BoxGeometry(0.012, 1, 0.012).translate(0, -0.5, 0);
  const strings = new THREE.InstancedMesh(stringGeo, M.metalDark, 9);
  strings.frustumCulled = false;
  strings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  det.add(strings);
  ctx.onDispose(() => stringGeo.dispose());
  const TAG_W = 1.9,
    TAG_H = 0.94;
  interface TagState {
    pivot: THREE.Vector3;
    len: number;
    on: boolean;
    drop: number;
    th: number;
    om: number;
  }
  const tags: TagState[] = [];
  // slots fill from the centre outward in play order; rows B and C hang over the LED wall's claim
  const SLOT_X = [0, -2.1, 2.1, -1.05, 1.05, -3.15, 3.15, -2.1, 2.1].map((k) => SIGN.x + k);
  const SLOT_LEN = [0.1, 0.1, 0.1, 1.15, 1.15, 1.15, 1.15, 2.2, 2.2];
  for (let n = 1; n <= 9; n++) {
    tags.push({ pivot: new THREE.Vector3(SIGN.x, SIGN.y - 0.02, SIGN.z + SIGN.d / 2 + 0.1), len: 0.12, on: false, drop: 1, th: 0, om: 0 });
    const cx = ((n - 1) % 3) / 3,
      cy = Math.floor((n - 1) / 3);
    tagQuads.uv.setXYZW(n - 1, cx + 6 / 1024, 1 - (cy * 170 + 164) / 512, 329 / 1024, 158 / 512);
  }
  const assignSlots = (): void => {
    S.cardsPlayed.forEach((n, k) => {
      const t = tags[n - 1];
      t.pivot.x = SLOT_X[k];
      t.len = SLOT_LEN[k];
    });
  };
  tagQuads.uv.needsUpdate = true;
  const placeTags = (dt: number): void => {
    for (let i = 0; i < 9; i++) {
      const tg2 = tags[i];
      if (!tg2.on) {
        tagQuads.mesh.setMatrixAt(i, ZERO);
        strings.setMatrixAt(i, ZERO);
        continue;
      }
      // drop-in, then a damped pendulum (ω = √(g/L))
      if (tg2.drop < 1) tg2.drop = Math.min(1, tg2.drop + dt / 0.35);
      const L = tg2.len + TAG_H / 2;
      const alpha = -(9.81 / L) * Math.sin(tg2.th) - 1.1 * tg2.om;
      tg2.om += alpha * dt;
      tg2.th += tg2.om * dt;
      const yDrop = (1 - tg2.drop * tg2.drop) * 1.2;
      E.set(0, 0, tg2.th);
      Q.setFromEuler(E);
      M4.compose(V.set(tg2.pivot.x, tg2.pivot.y + yDrop, tg2.pivot.z), Q, V2.set(1, tg2.len, 1));
      strings.setMatrixAt(i, M4);
      // tag hangs below the string end, rotated with it
      V2.set(0, -tg2.len - TAG_H, 0).applyQuaternion(Q);
      M4.compose(V.set(tg2.pivot.x + V2.x, tg2.pivot.y + yDrop + V2.y, tg2.pivot.z), Q, V2.set(TAG_W, TAG_H, 1));
      tagQuads.mesh.setMatrixAt(i, M4);
    }
    tagQuads.mesh.instanceMatrix.needsUpdate = true;
    strings.instanceMatrix.needsUpdate = true;
  };
  const showTag = (n: number, animate: boolean): void => {
    const tg2 = tags[n - 1];
    tg2.on = true;
    tg2.drop = animate ? 0 : 1;
    tg2.th = animate ? (n % 2 ? 0.32 : -0.28) : 0;
    tg2.om = 0;
  };
  assignSlots();
  for (const n of S.cardsPlayed) showTag(n, false);
  placeTags(0);
  ctx.island.onGust(({ strength }) => {
    for (const tg2 of tags) if (tg2.on) tg2.om += (Math.random() - 0.3) * strength * 1.6;
  });

  // ── vendor terminal (detail) ─────────────────────────────────────────────
  const T = S.targets.terminal;
  const kiosk = new Painter()
    .rbox(0.66, 1.0, 0.42, 0.06, [T[0], 0.5, T[2]], 0xf5f5f4)
    .rbox(0.84, 0.06, 0.6, 0.02, [T[0], 0.03, T[2]], 0xd6d3d1)
    .box(0.7, 0.5, 0.06, [T[0], 1.24, T[2] - 0.02], 0xf5f5f4, [-0.5, 0, 0])
    .mesh(M.standard({ vertexColors: true, roughness: 0.2, metalness: 0.05 }), { cast: true });
  det.add(kiosk);
  ctx.physics.addStaticBox({ size: [0.66, 1.0, 0.42], position: [T[0], 0.5, T[2]] });
  const termScreen = makeCanvas(512, 352);
  ctx.onDispose(() => termScreen.tex.dispose());
  const renderTerminalScreen = (): void => {
    const g = termScreen.g;
    g.fillStyle = '#0c0a09';
    g.fillRect(0, 0, 512, 352);
    const grd = g.createLinearGradient(0, 0, 512, 352);
    grd.addColorStop(0, 'rgba(250,250,249,0.10)');
    grd.addColorStop(1, 'rgba(250,250,249,0.0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 352);
    g.fillStyle = '#fafaf9';
    g.font = `500 18px ${FONT_MONO}`;
    g.textAlign = 'left';
    g.fillText(ctx.t('backdrop.brand').split('').join(' '), 28, 44);
    g.font = `700 40px ${FONT_DISPLAY}`;
    fitText(g, ctx.t('vendorScreen.title'), 456, 40, '700', FONT_DISPLAY);
    g.fillText(ctx.t('vendorScreen.title'), 28, 100);
    for (let n = 1; n <= 9; n++) {
      const x = 28 + ((n - 1) % 5) * 92,
        y = 140 + Math.floor((n - 1) / 5) * 96;
      const played = S.cardsPlayed.includes(n),
        has = held.has(n);
      g.lineWidth = 3;
      g.strokeStyle = played ? '#fafaf9' : has ? '#2dd4bf' : '#3d3d3d';
      g.fillStyle = played ? '#fafaf9' : 'rgba(0,0,0,0)';
      rrect(g, x, y, 76, 80, 8);
      if (played) g.fill();
      g.stroke();
      g.fillStyle = played ? '#141414' : has ? '#2dd4bf' : '#57534e';
      g.font = `700 34px ${FONT_DISPLAY}`;
      g.textAlign = 'center';
      g.fillText(`#${n}`, x + 38, y + 52);
      g.textAlign = 'left';
    }
    g.fillStyle = '#a8a29e';
    g.font = `500 16px ${FONT_MONO}`;
    g.fillText(ctx.t('vendorScreen.sub'), 28, 336);
    termScreen.tex.needsUpdate = true;
  };
  renderTerminalScreen();
  ctx.i18n.onChange(renderTerminalScreen);
  const screenMat = new THREE.MeshBasicMaterial({ map: termScreen.tex, toneMapped: true });
  ctx.onDispose(() => screenMat.dispose());
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.44), screenMat);
  screenMesh.position.set(T[0], 1.255, T[2] + 0.015);
  screenMesh.rotation.x = -0.5;
  det.add(screenMesh);

  // ── terminal operate panel ───────────────────────────────────────────────
  let refreshPanel: (() => void) | null = null;
  let answerFor = 0;
  let enteredAt = -1;
  const playCard = (n: number): void => {
    if (S.cardsPlayed.includes(n)) {
      answerFor = n;
      refreshPanel?.();
      return;
    }
    if (!held.has(n)) {
      S.sfx.denied([T[0], 1.2, T[2]]);
      S.react('emi.missing', { z: ctx.t(`zone.${CARD_ZONE[n]}`) });
      return;
    }
    S.cardsPlayed.push(n);
    assignSlots();
    ctx.progress.set('cards', S.cardsPlayed);
    answerFor = n;
    showTag(n, true);
    ctx.audio.play('type', { at: T });
    // juice: the tag slaps onto the sign with a thud and a small burst
    ctx.after(0.25, () => {
      const pv = tags[n - 1].pivot;
      ctx.audio.play('drop', { at: [pv.x, 5.5, pv.z], pitch: 1.3 });
      ctx.game.juice.cue('tick', { at: [pv.x, 5.5, pv.z] });
      ctx.game.juice.burst([pv.x, 5.0, pv.z], { tone: 'stone', count: 14, spread: 0.6 });
      ctx.game.juice.popup([pv.x, 4.6, pv.z], ctx.i18n.text('game.a.tagPop', { n }), { tone: 'accent', seconds: 1.4 });
    });
    S.updateSign();
    ctx.after(0.15, () => S.sfx.clatter([SIGN.x, SIGN.y + 1, SIGN.z], 0.9, 0.5));
    renderTerminalScreen();
    S.react(`emi.card.${n}`);
    const k = S.cardsPlayed.length;
    if (k >= 2) {
      const isNew = ctx.pass.award('vorfuehrung', { value: stampValueA() });
      // one banner per star (2, 5, 9 cards), not per card
      if (k === 2 || k === 5 || k === 9 || isNew) {
        ch.submit(k, { detail: ctx.i18n.text('game.a.detail', { k }) });
        ctx.game.juice.cue('great');
      }
      if (isNew) {
        ctx.after(4.5, () => {
          S.say('emi.a', undefined, 'shrug');
          if (!S.shutterOpen) ctx.after(5.5, () => !S.shutterOpen && S.say('emi.revealHint', undefined, 'point'));
        });
        ctx.after(1.2, () => S.refreshObjective());
      }
    }
    refreshPanel?.();
  };
  const stampValueA = (): { de: string; en: string } => {
    const k = S.cardsPlayed.length;
    return { de: `${k} Fragen · ${k} Einschränkungen gefunden`, en: `${k} questions · ${k} caveats found` };
  };
  const cardSpecA = (): InfoCardSpec => {
    const k = S.cardsPlayed.length;
    return {
      eyebrow: ctx.i18n.text('cardA.eyebrow'),
      title: ctx.i18n.text('cardA.title'),
      body: [ctx.i18n.text('cardA.body'), ctx.i18n.text('cardA.fiction')],
      metrics: [
        { label: ctx.i18n.text('cardA.m1'), value: '5/5', unit: '', note: { de: 'Hersteller X · FIKTION', en: 'Vendor X · FICTION' } },
        { label: ctx.i18n.text('cardA.m2'), value: '57–100', unit: '%', note: { de: 'Wilson, n = 5', en: 'Wilson, n = 5' } },
        { label: ctx.i18n.text('cardA.m3'), value: k, unit: '/ 9' },
      ],
      // the decision box only for Entscheider: Entdecker cards stay short
      entscheider: { forDecisionMakers: { title: ctx.i18n.text('cardA.fdmTitle'), bullets: [ctx.i18n.text('cardA.fdm1'), ctx.i18n.text('cardA.fdm2')] } },
    };
  };
  const openCardA = (): Promise<void> => ctx.ui.card(cardSpecA());
  // the challenge (FUN-PLAN P1 „Zettelwirtschaft“): cards played, ★ 2 (the stamp), ★★ 5, ★★★ all 9
  const ch: ChallengeHandle = ctx.game.challenge({
    id: 'vorfuehrung',
    title: ctx.i18n.text('game.a.title'),
    metric: { label: ctx.i18n.text('game.a.metric'), better: 'higher', digits: 0 },
    goals: [
      { text: ctx.i18n.text('game.a.g1'), at: 2 },
      { text: ctx.i18n.text('game.a.g2'), at: 5 },
      { text: ctx.i18n.text('game.a.g3'), at: 9 },
    ],
    lesson: ctx.i18n.text('game.a.lesson'),
    why: cardSpecA,
    retry: () => {
      if (S.operating !== 'terminal') operateTerminal();
    },
    emi: S.emi ?? undefined,
  });
  const operateTerminal = (): void => {
    if (enteredAt < 0) enteredAt = ctx.time.elapsed;
    answerFor = 0; // a fresh visit: no stale answer (≤ 70 words at open)
    S.operating = 'terminal';
    S.exitOp = ctx.player.enterOperate({
      title: ctx.i18n.text('term.eyebrow'),
      cameraPose: { position: [-5.4, 2.55, 2.0], lookAt: [-6.4, 4.4, -8] },
      panelPosition: 'right',
      panel: (el) => {
        el.style.width = '420px';
        const head = document.createElement('div');
        const list = document.createElement('div');
        list.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px';
        const answer = document.createElement('div');
        answer.style.cssText = 'margin-top:8px;padding:8px 10px;border:1px solid var(--border-subtle);border-radius:10px;background:rgba(250,250,249,0.04)';
        const foot = document.createElement('div');
        foot.className = 'op-row';
        el.append(head, list, answer, foot);
        const render = (): void => {
          // ≤ 70 visible words at open (◆ decision panel): goal chips, the title, the cards you hold;
          // the intro sentence sits behind ⓘ
          head.replaceChildren(ch.chips());
          const ttl = document.createElement('div');
          ttl.style.cssText = 'display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:7px 0 2px';
          // the title is the operate bar's (≤ 35 words at open); ⓘ keeps the intro
          ttl.innerHTML = `<span title="${esc(ctx.t('term.intro'))}" style="cursor:help;color:var(--text-3);font-size:13px">ⓘ ${esc(ctx.t('term.keys'))}</span>`;
          // Hersteller X and its answers are fiction (the chip carries it; the questions are real)
          ttl.append(ctx.ui.chip('fiktion', ctx.i18n.text('term.fiction')));
          head.append(ttl);
          // the nine cards as a 3 × 3 hand (≤ 70 visible words even with all nine held): a held card shows
          // its key and topic, an asked one its caveat tag (the Zettel on the sign), a missing one its zone;
          // the full question appears with the vendor's answer (and as the tooltip)
          list.replaceChildren(
            ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
              const played = S.cardsPlayed.includes(n),
                has = held.has(n);
              const tile = document.createElement('button');
              const sel = answerFor === n;
              const border = sel ? 'rgba(255,103,0,0.75)' : played ? 'rgba(45,212,191,0.45)' : has ? 'var(--border)' : 'var(--border-subtle)';
              tile.style.cssText = `all:unset;box-sizing:border-box;cursor:${has || played ? 'pointer' : 'help'};display:flex;flex-direction:column;gap:3px;min-height:58px;padding:7px 8px;border-radius:9px;border:1px ${has || played ? 'solid' : 'dashed'} ${border};background:${sel ? 'rgba(255,103,0,0.08)' : played ? 'rgba(45,212,191,0.06)' : has ? 'rgba(250,250,249,0.045)' : 'transparent'}`;
              tile.title = has || played ? ctx.t(`q.${n}.q`) : ctx.t('term.missing', { z: String(CARD_ZONE[n]).padStart(2, '0') });
              const top = document.createElement('span');
              top.className = 'mono';
              top.style.cssText = `display:flex;justify-content:space-between;font-size:11px;color:${played ? 'var(--teal)' : has ? 'var(--orange-light)' : 'var(--text-3)'}`;
              top.innerHTML = `<span>#${n}</span><span>${played ? '✓' : ''}</span>`;
              // ≤ 35 visible words at open (plan §4): a held card shows its topic, an asked one only its ✓
              // (the caveat hangs on the sign and in the tooltip), a missing one only its number
              const lab = document.createElement('span');
              lab.style.cssText = `font-size:12.5px;line-height:1.2;color:${has ? 'var(--text)' : 'var(--text-3)'}`;
              lab.textContent = has && !played ? ctx.t(`q.${n}.k`) : '';
              if (played) tile.title = `${ctx.t(`q.${n}.q`)} → ${ctx.t(`q.${n}.tag`)}`;
              tile.append(top, lab);
              tile.onclick = () => playCard(n);
              return tile;
            }),
          );
          if (answerFor) {
            answer.style.display = '';
            answer.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="eyebrow muted">#${answerFor} · ${esc(ctx.t(`q.${answerFor}.q`))}</span></div><div style="margin-top:4px;font-size:14px;color:var(--text);line-height:1.35">${ctx.lang === 'de' ? '„' : '“'}${esc(ctx.t(`q.${answerFor}.a`))}${ctx.lang === 'de' ? '“' : '”'}</div>`;
            answer.querySelector('div')!.append(ctx.ui.chip('fiktion', ctx.i18n.text('term.fiction')));
          } else if ([...held].some((n) => !S.cardsPlayed.includes(n))) {
            answer.style.display = '';
            answer.innerHTML = `<div style="color:var(--text-3);font-size:13px">${esc(ctx.t('term.none'))}</div>`;
          } else answer.style.display = 'none';
          foot.replaceChildren();
          const prog = document.createElement('span');
          prog.className = 'mono';
          prog.style.cssText = 'font-size:11.5px;color:var(--text-2);margin-right:auto';
          prog.textContent = ctx.t('term.progress', { k: S.cardsPlayed.length });
          foot.append(prog);
          if (S.cardsPlayed.length >= 1) {
            const info = document.createElement('button');
            info.className = 'btn ghost';
            info.style.cssText = 'font-size:12.5px;padding:6px 10px';
            info.textContent = 'ⓘ';
            info.title = ctx.t('term.info');
            info.onclick = () => void openCardA();
            foot.append(info);
          }
          if (ctx.pass.has('vorfuehrung') && !S.shutterOpen) {
            const rv = document.createElement('button');
            rv.className = 'btn primary';
            rv.style.cssText = 'font-size:12.5px;padding:7px 12px;flex-basis:100%;justify-content:center;margin-top:4px';
            rv.textContent = ctx.t('term.reveal');
            rv.onclick = () => S.reveal?.('terminal');
            foot.append(rv);
          }
          if (ctx.mode === 'entscheider' && !ctx.pass.has('vorfuehrung') && ctx.time.elapsed - enteredAt > 30) {
            const skip = document.createElement('button');
            skip.className = 'btn ghost';
            skip.style.cssText = 'font-size:12.5px;padding:6px 10px';
            skip.textContent = ctx.t('term.skip');
            skip.onclick = () => {
              ctx.pass.award('vorfuehrung', { skipped: true, value: { de: 'übersprungen', en: 'skipped' } });
              S.refreshObjective();
              render();
            };
            foot.append(skip);
          }
        };
        refreshPanel = render;
        render();
        const timer = ctx.every(5, () => render());
        const offKeys = ctx.input.onKey(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'], (code) => playCard(Number(code.slice(5))), { whileOperating: true });
        return () => {
          refreshPanel = null;
          timer();
          offKeys();
        };
      },
      onExit: () => {
        // the card no longer opens by itself: it is the challenge's why() ([H] in the banner, the Pass)
        S.operating = null;
      },
    });
  };
  ctx.addInteractable({ object: screenMesh, label: ctx.i18n.text('ia.terminal'), hint: ctx.i18n.text('ia.terminalHint'), onInteract: operateTerminal, range: 2.8 });

  // ── Take-Board (detail; hidden behind the LED wall) ───────────────────────
  const tb = makeCanvas(1024, 560);
  ctx.onDispose(() => tb.tex.dispose());
  const drawTakes = (): void => {
    const g = tb.g;
    g.fillStyle = '#1c1917';
    g.fillRect(0, 0, 1024, 560);
    g.fillStyle = '#e7e5e4';
    g.font = `500 20px ${FONT_MONO}`;
    g.textAlign = 'left';
    g.fillText(ctx.t('takes.title'), 28, 40);
    g.textAlign = 'right';
    g.fillStyle = '#a8a29e';
    g.fillText(ctx.t('takes.used'), 996, 40);
    g.textAlign = 'left';
    const cw = 120,
      ch = 98;
    for (let i = 0; i < 40; i++) {
      const x = 28 + (i % 8) * (cw + 3),
        y = 62 + Math.floor(i / 8) * (ch + 0);
      // clapperboard
      g.fillStyle = '#0c0a09';
      g.fillRect(x, y + 18, cw - 8, ch - 26);
      g.fillStyle = '#f5f5f4';
      for (let s = 0; s < 6; s++) {
        g.save();
        g.beginPath();
        g.rect(x, y + 4, cw - 8, 14);
        g.clip();
        g.fillRect(x + s * 22 - 6, y + 4, 11, 14);
        g.restore();
      }
      g.fillStyle = '#d6d3d1';
      g.font = `500 14px ${FONT_MONO}`;
      g.fillText(`TAKE ${String(i + 1).padStart(2, '0')}`, x + 8, y + 42);
      g.fillStyle = '#78716c';
      g.font = `500 11px ${FONT_MONO}`;
      g.fillText(i === 26 ? '5/5' : `${[3, 4, 2, 4, 3, 1, 4, 3][i % 8]}/5`, x + 8, y + 62);
      if (i !== 26) {
        // marker cross
        g.strokeStyle = 'rgba(214,211,209,0.85)';
        g.lineWidth = 4;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x + 6 + (i % 3), y + 22);
        g.lineTo(x + cw - 14, y + ch - 12 - (i % 4));
        g.moveTo(x + cw - 14, y + 22 + (i % 2) * 3);
        g.lineTo(x + 8, y + ch - 12);
        g.stroke();
      } else {
        g.strokeStyle = '#ff6700';
        g.lineWidth = 4;
        g.beginPath();
        g.ellipse(x + cw / 2 - 4, y + ch / 2 + 4, cw / 2 + 2, ch / 2 - 4, -0.05, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = '#ff8534';
        g.font = `700 14px ${FONT_MONO}`;
        g.fillText(`✓ ${ctx.t('takes.video')}`, x + 40, y + 62);
      }
    }
    tb.tex.needsUpdate = true;
  };
  drawTakes();
  ctx.i18n.onChange(drawTakes);
  const tbMat = new THREE.MeshStandardMaterial({ map: tb.tex, roughness: 0.8, metalness: 0, emissiveMap: tb.tex, emissive: 0xffffff, emissiveIntensity: 0.25 });
  ctx.onDispose(() => tbMat.dispose());
  const board = new THREE.Mesh(new THREE.PlaneGeometry(TAKES.w, TAKES.h), tbMat);
  board.position.set(TAKES.x, TAKES.y0 + TAKES.h / 2, TAKES.z + 0.04);
  det.add(board);
  det.add(
    new Painter()
      .box(TAKES.w + 0.12, TAKES.h + 0.12, 0.06, [TAKES.x, TAKES.y0 + TAKES.h / 2, TAKES.z], 0x292524)
      .box(0.08, TAKES.y0 + 0.2, 0.08, [TAKES.x - TAKES.w / 2 + 0.3, (TAKES.y0 + 0.2) / 2, TAKES.z - 0.05], 0x292524)
      .box(0.08, TAKES.y0 + 0.2, 0.08, [TAKES.x + TAKES.w / 2 - 0.3, (TAKES.y0 + 0.2) / 2, TAKES.z - 0.05], 0x292524)
      .mesh(M.standard({ vertexColors: true, roughness: 0.7, metalness: 0.2 }), { cast: true }),
  );
  ctx.physics.addStaticBox({ size: [TAKES.w + 0.12, TAKES.h + 0.4, 0.12], position: [TAKES.x, (TAKES.h + 0.4) / 2, TAKES.z] });
  const takesCenter = new THREE.Vector3(TAKES.x, TAKES.y0 + TAKES.h / 2, TAKES.z);
  let lookT = 0;
  const pl = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const albumCheck = (dt: number): void => {
    if (ctx.progress.get('album', false)) return;
    ctx.player.positionLocal(pl);
    if (Math.hypot(pl.x - takesCenter.x, pl.z - takesCenter.z) > 3 || pl.z > -8.6) {
      lookT = 0;
      return;
    }
    ctx.camera.getWorldPosition(eye);
    ctx.camera.getWorldDirection(camDir);
    ctx.toWorld(takesCenter, V);
    V.sub(eye).normalize();
    if (camDir.dot(V) > 0.82) lookT += dt;
    else lookT = Math.max(0, lookT - dt);
    if (lookT >= 1) unlockAlbum();
  };
  const unlockAlbum = (): void => {
    if (ctx.progress.get('album', false)) return;
    ctx.progress.set('album', true);
    ctx.pass.unlockAlbum('bester-von-40');
    ctx.hud.toast(ctx.i18n.text('toastAlbum'), { kind: 'success' });
    S.sfx.chime([TAKES.x, 1.5, TAKES.z]);
    S.say('emi.album');
  };
  ctx.hud.worldLabel([TAKES.x, TAKES.y0 + TAKES.h + 0.3, TAKES.z], ctx.i18n.text('labelTakes'), { eyebrow: '// FAILURE-MODE', maxDistance: 5, kind: 'muted' });

  // ── per-frame ────────────────────────────────────────────────────────────
  let coneFade = 1;
  let coneTarget = 1;
  S.onUpdate((dt) => {
    demo(dt);
    placeTags(dt);
    albumCheck(dt);
    sign.update(dt);
    if (coneFade !== coneTarget) {
      coneFade = Math.max(coneTarget, coneFade - dt * 3.5);
      const flick = coneFade > 0.05 ? (Math.sin(ctx.time.elapsed * 90) > 0.2 ? 1 : 0.35) : 0;
      coneMat.uniforms.uStrength.value = 0.34 * coneFade * flick;
      poolMat.uniforms.uStrength.value = 0.55 * coneFade * flick;
      lensMat.color.setRGB(1, 0.957, 0.902).multiplyScalar(0.12 + 2.1 * coneFade * flick);
      edgeMat.color.setRGB(1, 0.945, 0.863).multiplyScalar(0.15 + 1.45 * coneFade * flick);
      if (coneFade <= 0) {
        cones.visible = false;
        pools.visible = false;
      }
    }
  });

  return {
    armObject: arm.object,
    lightsOut(instant = false) {
      if (coneTarget === 0) return;
      coneTarget = 0;
      if (instant) coneFade = 0.0001;
      ledOn = false;
      drawLed();
      demoOn = false;
      servo.setVolume(0, 0.3);
      if (!instant) S.sfx.clunk([-7, 7.5, -1], true);
      // arm parks at home, crate keeps what it has
      arm.reach(-7.0, 1.6, -3.65, 0);
      arm.setGrip(GRIP_OPEN);
      setPart(0, FIXTURE);
      setPart(6, null);
      parts.instanceMatrix.needsUpdate = true;
    },
    solve() {
      for (const n of [1, 3]) if (!held.has(n)) held.add(n);
      for (const n of [1, 3]) if (!S.cardsPlayed.includes(n)) playCard(n);
    },
    solveAlbum: unlockAlbum,
    challenge: ch,
    reevaluate() {
      const k = S.cardsPlayed.length;
      const want = k >= 9 ? 3 : k >= 5 ? 2 : k >= 2 ? 1 : 0;
      if (want > ch.stars && ctx.pass.has('vorfuehrung')) ch.submit(k, { detail: ctx.i18n.text('game.a.detail', { k }) });
      // cards won in other zones since the last visit: one line, not a card
      const fresh = [...held].filter((n) => !S.cardsPlayed.includes(n));
      const announced = ctx.progress.get<number>('cardsAnnounced', 0);
      if (ctx.pass.has('vorfuehrung') && fresh.length && held.size > announced) {
        ctx.progress.set('cardsAnnounced', held.size);
        ctx.after(2.4, () => S.say('emi.newCards', { n: fresh.length }, 'point'));
      }
    },
    stars3() {
      for (let n = 1; n <= 9; n++) held.add(n);
      for (let n = 1; n <= 9; n++) if (!S.cardsPlayed.includes(n)) playCard(n);
    },
    ageTerminal() {
      enteredAt = ctx.time.elapsed - 31;
      refreshPanel?.();
    },
  };
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const p = new Painter();
  for (const g of list) p.parts.push(g);
  return p.merge();
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}
