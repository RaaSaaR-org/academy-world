/**
 * The Größenwand (plan §4.9, R4 §7.3, R6): every hall robot at true scale in one row — the merged
 * line-up (`lineup.l2.glb`, WP0 R6, one draw) — in front of a 0–2.5 m scale with 10 cm ticks along the
 * west wall, sorted by height from the entrance north. Two fixed figures before the small end, „Du“
 * 1.75 m and EMI 1.55 m, a „Du“ mark on the floor, and a laser line that follows your eye height while
 * you are near the wall. Names and the heights measured on the models (MODELL) run along the foot.
 */
import * as THREE from 'three';
import type { RobotLineup, ZoneContext } from '@/core/zones';
import { buildAtlas, type TextAtlas } from './atlas';
import { HALL_ROBOTS } from './data/robots';
import { box, canvasTex, FONT, mesh } from './geo';
import { WALL } from './layout';
import { fitText, INK } from './look';
import { zs } from './sheet';
import { GROESSE } from './tuning';

export interface Groessenwand {
  update(dt: number): void;
  /** the player stands on the „Du“ mark */
  readonly onMark: boolean;
  /** first time on the mark (the first-visit step, the Schaufenster step) */
  onFirstMark(fn: () => void): void;
  readonly markAt: THREE.Vector3;
  readonly lineupReady: Promise<boolean>;
}

const PX_PER_M = 256;

export function buildGroessenwand(ctx: ZoneContext): Groessenwand {
  const det = ctx.groups.detail;
  const L = (): 'de' | 'en' => ctx.i18n.lang;
  const len = WALL.z0 - WALL.z1;
  const H = WALL.height;
  const owned: { dispose(): void }[] = [];
  ctx.onDispose(() => owned.forEach((o) => o.dispose()));

  // ── the scale board: a 2 m tile with 10 cm ticks, repeated along the wall (lit, 1 draw) ──
  const tile = canvasTex(2 * PX_PER_M, Math.round(H * PX_PER_M));
  const drawTile = (): void => {
    const { g, w, h } = tile;
    g.fillStyle = '#ece9e4';
    g.fillRect(0, 0, w, h);
    const yOf = (m: number): number => h - m * PX_PER_M;
    for (let k = 0; k <= 25; k++) {
      const y = yOf(k / 10);
      const major = k % 5 === 0;
      g.fillStyle = major ? '#57534e' : '#a8a29e';
      g.fillRect(0, Math.round(y) - (major ? 1 : 0), w, major ? 2 : 1);
      if (major && k > 0) {
        g.font = FONT.mono(22, 500);
        g.fillStyle = '#44403c';
        g.textBaseline = 'bottom';
        const t = `${(k / 10).toFixed(1).replace('.', L() === 'de' ? ',' : '.')} m`;
        g.fillText(t, 10, y - 4);
        g.fillText(t, w / 2 + 10, y - 4);
      }
    }
    // the „Du“ 1.75 m and EMI 1.55 m lines, marked once per tile
    for (const [m, c] of [
      [1.75, INK.orange],
      [1.55, INK.teal],
    ] as const) {
      g.fillStyle = c;
      g.globalAlpha = 0.55;
      g.fillRect(0, yOf(m) - 1, w, 2);
      g.globalAlpha = 1;
    }
    tile.tex.needsUpdate = true;
  };
  drawTile();
  tile.tex.wrapS = THREE.RepeatWrapping;
  const boardGeo = new THREE.PlaneGeometry(len, H);
  const uv = boardGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 2));
  boardGeo.rotateY(Math.PI / 2).translate(WALL.boardX + 0.05, H / 2, (WALL.z0 + WALL.z1) / 2);
  const boardMat = new THREE.MeshStandardMaterial({ map: tile.tex, roughness: 0.85, metalness: 0, name: 'schauhalle:wall-board' });
  const board = new THREE.Mesh(boardGeo, boardMat);
  board.name = 'schauhalle:wall-board';
  board.receiveShadow = true;
  board.matrixAutoUpdate = false;
  det.add(board);
  owned.push(boardGeo, boardMat, tile.tex);
  ctx.physics.addStaticBox({ size: [0.1, H, len], position: [WALL.boardX, H / 2, (WALL.z0 + WALL.z1) / 2], surface: 'metal' });
  // a carbon frame round the board
  det.add(
    mesh(
      [box(0.08, 0.08, len + 0.1, WALL.boardX + 0.04, H + 0.04, (WALL.z0 + WALL.z1) / 2), box(0.08, 0.1, len + 0.1, WALL.boardX + 0.04, 0.05, (WALL.z0 + WALL.z1) / 2)],
      ctx.materials.carbon,
      'schauhalle:wall-frame',
    ),
  );

  // ── the two figures before the small end: „Du“ 1.75 m (eye 1.65) and EMI 1.55 m ──
  const figs: THREE.BufferGeometry[] = [];
  const capsule = (h: number, r: number, z: number): void => {
    const g = new THREE.CapsuleGeometry(r, h - 2 * r, 6, 16).toNonIndexed();
    g.scale(1, 1, 0.25).translate(WALL.figureX, h / 2, z);
    figs.push(g);
  };
  capsule(1.75, 0.22, WALL.duZ);
  // EMI: a rover base, a slim body and a round head (a silhouette, no body in the hall: plan §4.9)
  {
    const z = WALL.emiZ;
    const base = new THREE.CylinderGeometry(0.26, 0.3, 0.32, 20).toNonIndexed().scale(1, 1, 0.3).translate(WALL.figureX, 0.16, z);
    const torso = new THREE.CylinderGeometry(0.14, 0.18, 0.78, 16).toNonIndexed().scale(1, 1, 0.3).translate(WALL.figureX, 0.71, z);
    const head = new THREE.SphereGeometry(0.2, 18, 12).toNonIndexed().scale(1, 1, 0.3).translate(WALL.figureX, 1.35, z);
    for (const g of [base, torso, head]) {
      g.deleteAttribute('uv');
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
      figs.push(g);
    }
  }
  for (const g of figs) if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  det.add(mesh(figs, ctx.materials.standard({ color: 0xc9c4bf, roughness: 0.5, metalness: 0.05 }), 'schauhalle:wall-figures'));

  // ── labels: title, the two figures, the „Du“ floor mark (one atlas, lit) ──────
  const labels: TextAtlas = buildAtlas(
    'wall',
    [1024, 512],
    [
      {
        id: 'title',
        w: 760,
        h: 120,
        draw: (g, w, h) => {
          g.fillStyle = INK.bg;
          g.fillRect(0, 0, w, h);
          g.fillStyle = INK.orange;
          g.fillRect(0, 0, w, 4);
          g.textBaseline = 'alphabetic';
          fitText(g, zs(L(), 'wall.title'), 20, 56, w - 40, 40, (px) => FONT.display(px), INK.text);
          fitText(g, zs(L(), 'wall.line'), 20, 98, w - 40, 22, FONT.sans, INK.text2);
        },
      },
      { id: 'du', w: 200, h: 60, draw: (g, w, h) => figLabel(g, w, h, zs(L(), 'wall.du'), INK.orange) },
      { id: 'emi', w: 200, h: 60, draw: (g, w, h) => figLabel(g, w, h, zs(L(), 'wall.emi'), INK.teal) },
      {
        id: 'mark',
        w: 256,
        h: 256,
        draw: (g, w, h) => {
          g.clearRect(0, 0, w, h);
          g.strokeStyle = INK.orange;
          g.lineWidth = 10;
          g.beginPath();
          g.arc(w / 2, h / 2, w / 2 - 12, 0, Math.PI * 2);
          g.stroke();
          fitText(g, zs(L(), 'wall.mark'), w / 2, h / 2 + 22, w - 60, 64, (px) => FONT.display(px), INK.orange, 'center');
        },
      },
    ],
    [
      { region: 'title', w: 2.6, h: 0.41, at: [WALL.boardX + 0.07, H + 0.36, WALL.z0 - 1.6], ry: Math.PI / 2 },
      { region: 'du', w: 0.6, h: 0.18, at: [WALL.figureX + 0.06, 1.95, WALL.duZ], ry: Math.PI / 2 },
      { region: 'emi', w: 0.6, h: 0.18, at: [WALL.figureX + 0.06, 1.72, WALL.emiZ], ry: Math.PI / 2 },
      { region: 'mark', w: 1.0, h: 1.0, at: [WALL.markAt[0], 0.016, WALL.markAt[1]], ry: 0, rx: -Math.PI / 2 },
    ],
    { lit: true, transparent: true },
  );
  det.add(labels.mesh);
  owned.push(labels);
  ctx.i18n.onChange(() => {
    drawTile();
    labels.redraw();
  });

  // ── the line-up (one draw) and its name strip (MODELL heights) ─────────────
  let strip: THREE.Mesh | null = null;
  const lineupReady = (async (): Promise<boolean> => {
    try {
      const [m, info] = await Promise.all([ctx.robots.lineup(), ctx.robots.lineupInfo()]);
      if (!info) return false;
      m.userData.ledger = 'schauhalle';
      m.rotation.y = Math.PI / 2;
      m.position.set(WALL.lineupX, 0, WALL.lineupZ0);
      m.castShadow = false;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      det.add(m);
      ctx.onDispose(() => m.removeFromParent());
      strip = buildStrip(ctx, info);
      det.add(strip);
      // keep-out: you stand at the wall, not inside the row
      ctx.physics.addStaticBox({ size: [2.3, 2.2, info.lengthM + 0.6], position: [WALL.lineupX - 0.2, 1.1, WALL.lineupZ0 - info.lengthM / 2], surface: 'metal' });
      return true;
    } catch (err) {
      console.warn('[schauhalle] Größenwand line-up failed', err);
      return false;
    }
  })();

  // ── laser line at your eye height (orange = the signal, a thin line only) ──
  const laserGeo = box(0.012, 0.012, len, 0, 0, 0);
  owned.push(laserGeo);
  const laser = new THREE.Mesh(laserGeo, ctx.materials.light(0xff6700, 'line'));
  laser.name = 'schauhalle:laser';
  laser.position.set(WALL.boardX + 0.07, 1.65, (WALL.z0 + WALL.z1) / 2);
  laser.visible = false;
  det.add(laser);
  const dot = new THREE.Object3D();
  det.add(dot);
  const eyeLabel = ctx.hud.worldLabel(dot, (lang) => `${zs(lang, 'wall.eye')}`, { maxDistance: 6, kind: 'accent' });
  eyeLabel.setVisible(false);

  // ── the „Du“ mark ────────────────────────────────────────────────────────
  const markAt = new THREE.Vector3(WALL.markAt[0], 0, WALL.markAt[1]);
  let onMark = false;
  let marked = false;
  const firsts: (() => void)[] = [];
  ctx.physics.addTrigger({
    shape: 'cylinder',
    radius: GROESSE.markR,
    height: 2,
    position: [markAt.x, 1, markAt.z],
    onEnter: (e) => {
      if (!e.isPlayer) return;
      onMark = true;
      ctx.game.juice.cue('tick', { at: [markAt.x, 1.2, markAt.z] });
      if (!marked) {
        marked = true;
        for (const f of firsts) f();
      }
    },
    onExit: (e) => {
      if (e.isPlayer) onMark = false;
    },
  });

  const _p = new THREE.Vector3();
  return {
    update() {
      const p = ctx.player.positionLocal(_p);
      const near = p.x < WALL.boardX + GROESSE.laserM && p.z < WALL.z0 + 0.5 && p.z > WALL.z1 - 0.5 && p.y > -0.5 && p.y < 3;
      laser.visible = near;
      eyeLabel.setVisible(near);
      if (near) {
        const eye = ctx.player.eye.y - ctx.layout.groundY;
        laser.position.y = eye;
        laser.updateMatrix();
        dot.position.set(WALL.boardX + 0.1, eye + 0.06, p.z);
      }
    },
    get onMark() {
      return onMark;
    },
    onFirstMark(fn) {
      firsts.push(fn);
      if (marked) fn();
    },
    markAt,
    lineupReady,
  };
}

function figLabel(g: CanvasRenderingContext2D, w: number, h: number, text: string, color: string): void {
  g.fillStyle = INK.bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = color;
  g.fillRect(0, 0, 6, h);
  fitText(g, text, 18, h / 2 + 9, w - 28, 26, (px) => FONT.mono(px, 600), INK.text);
}

/** names and model heights along the foot of the wall, in two staggered rows */
function buildStrip(ctx: ZoneContext, info: RobotLineup): THREE.Mesh {
  const len = info.lengthM;
  const pxm = 160;
  const t = canvasTex(Math.ceil(len * pxm), 96);
  const draw = (): void => {
    const { g, w, h } = t;
    g.fillStyle = INK.bg;
    g.fillRect(0, 0, w, h);
    const L = ctx.i18n.lang;
    info.entries.forEach((e, i) => {
      const r = HALL_ROBOTS.find((x) => x.id === e.id);
      const mid = ((e.x[0] + e.x[1]) / 2) * pxm;
      const row = i % 2;
      const hm = e.heightM.toFixed(2);
      const text = `${r?.short ?? e.id} ${L === 'de' ? hm.replace('.', ',') : hm} m`;
      g.fillStyle = INK.line;
      g.fillRect(mid, 0, 1, row ? 54 : 22);
      fitText(g, text, mid, row ? 76 : 44, 2.2 * (e.x[1] - e.x[0]) * pxm + 70, 17, (px) => FONT.mono(px, 500), INK.text, 'center');
    });
    // the chip of these heights
    fitText(g, `${zs(L, 'row.model')} · ${zs(L, 'chip.mo')}`, w - 10, h - 8, 520, 14, (px) => FONT.mono(px, 500), INK.text2, 'right');
    t.tex.needsUpdate = true;
  };
  draw();
  ctx.i18n.onChange(draw);
  const geo = new THREE.PlaneGeometry(len, 0.3);
  // the strip lies on the floor in front of the row, readable from the hall (+x side)
  geo.rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(WALL.lineupX + 1.35, 0.018, WALL.lineupZ0 - len / 2);
  const mat = new THREE.MeshStandardMaterial({ map: t.tex, roughness: 0.7, metalness: 0, name: 'schauhalle:wall-strip' });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'schauhalle:wall-strip';
  m.matrixAutoUpdate = false;
  ctx.onDispose(() => {
    geo.dispose();
    mat.dispose();
    t.tex.dispose();
  });
  return m;
}
