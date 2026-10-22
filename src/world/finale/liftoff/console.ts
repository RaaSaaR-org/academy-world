import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Lang, ZoneContext } from '@/core/zones';
import type { QuestSnapshot } from '@/core/quest/types';
import { DEG, bearingDir, polar, type Vec3Tuple } from '../../layout';
import { buildSystemPanel, type SystemPanel } from '../../start/panel';
import { libellePanel, type LibellePanelState } from '../../start/contract';
import { TOWER } from '../../layout';
import { AUSGUCK } from '../tuning';
import { L } from './strings';

/**
 * The launch console on the Ausguck (plan §4.15, D23): a pedestal in front of the lift exit, its board
 * slanted toward you, the sun (bearing 295) behind it. It repeats the three systems of the Libelle
 * panel with WP12's buildSystemPanel (17 instanced lamps, one label text, the BODENCREW plates when the
 * crew supplied AKKU or NAV): six teal rotor lamps, the full Startakku bar (stepping down one segment per
 * rotor in the spin-up, FIKTION) and the nav lamp on standby, which ramps to active at h 280. Draws:
 * the body (one merged mesh, the certificate stand's material) + the lamps + the labels + the status
 * line (+ the crew plates). Interactables: the main key (Abheben / Start wiederholen) and the dial
 * („Zurück ins Dock“, airborne only); the finale wires what they do.
 */
export type NavLook = 'off' | 'standby' | 'active';

export interface LaunchConsole {
  readonly group: THREE.Group;
  /** the main key and the dial (interactable anchors, world) */
  readonly key: THREE.Object3D;
  readonly dial: THREE.Object3D;
  /** where you stand to use it (feet, world) and the yaw (deg) that faces the sun over it */
  readonly stand: Vec3Tuple;
  readonly standYawDeg: number;
  /** EMI-01's spot beside it (world feet) */
  readonly emiSpot: Vec3Tuple;
  /** paint the quest's state; `o.bar` overrides the bar's segments (the spin-up), `o.nav` the nav lamp's look */
  paint(snap: QuestSnapshot, o?: { segments?: number; nav?: NavLook; navK?: number }): void;
  /** the status line under the board */
  setStatus(text: ((lang: Lang) => string) | null): void;
  readonly panel: SystemPanel;
  /** what it shows now (tools: liftoff-check's „the console shows the three systems ready“) */
  shown(): { lamps: string[]; bar: { lamp: string; segments: number }; nav: string; navLook: NavLook; crew: { akku: boolean; nav: boolean }; status: string };
}

/** Where you stand to use the console (feet, world; the Ausguck deck) and the yaw (deg) that faces the sun. */
export function standPose(): { position: Vec3Tuple; yawDeg: number } {
  const [x, , z] = polar(AUSGUCK.stand.bearing, AUSGUCK.stand.r);
  return { position: [x, TOWER.ausguck.y + 0.05, z], yawDeg: 360 - AUSGUCK.facing };
}

/** The console's place: AUSGUCK.consoleDist ahead of the stand toward the sun; `rotY` turns its face (local +Z) back to you. */
export function consolePose(): { at: THREE.Vector3; rotY: number } {
  const [sx, , sz] = standPose().position;
  const [dx, dz] = bearingDir(AUSGUCK.facing);
  const at = new THREE.Vector3(sx + dx * AUSGUCK.consoleDist, TOWER.ausguck.y, sz + dz * AUSGUCK.consoleDist);
  // +Z → back toward the stand: rotation.y θ with (sin θ, cos θ) = the facing's (x, z)
  const face = bearingDir(AUSGUCK.facing - 180);
  return { at, rotY: Math.atan2(face[0], face[1]) };
}

export function buildLaunchConsole(ctx: ZoneContext): LaunchConsole {
  const M = ctx.materials;
  const { at, rotY } = consolePose();
  const group = new THREE.Group();
  group.name = 'liftoff:console';
  group.position.copy(at);
  group.rotation.y = rotY;
  ctx.root.add(group);

  // ── the body: pedestal, slanted board, the dial housing (one merged mesh) ─────────────────────
  const TILT = 32 * DEG;
  const boardW = 1.36,
    boardD = 0.5;
  /** the board's centre and its top's normal (the panel lies on it) */
  const boardY = 1.0,
    boardZ = 0.02;
  const parts: THREE.BufferGeometry[] = [];
  const flat = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    const f = g.index ? g.toNonIndexed() : g;
    if (f.getAttribute('uv')) f.deleteAttribute('uv');
    return f;
  };
  parts.push(flat(new RoundedBoxGeometry(0.46, 0.92, 0.34, 2, 0.05).translate(0, 0.46, -0.02)));
  parts.push(flat(new RoundedBoxGeometry(0.8, 0.06, 0.52, 2, 0.02).translate(0, 0.03, 0)));
  const board = new RoundedBoxGeometry(boardW, 0.05, boardD, 2, 0.018);
  board.rotateX(TILT);
  board.translate(0, boardY, boardZ);
  parts.push(flat(board));
  // the dial housing on the right of the board, and the key's collar on the left
  const dialBox = new RoundedBoxGeometry(0.2, 0.09, 0.2, 2, 0.02);
  dialBox.rotateX(TILT);
  dialBox.translate(0.58, boardY + 0.04, boardZ + 0.03);
  parts.push(flat(dialBox));
  const keyCollar = new THREE.CylinderGeometry(0.075, 0.085, 0.04, 20);
  keyCollar.rotateX(TILT);
  keyCollar.translate(-0.58, boardY + 0.035, boardZ + 0.04);
  parts.push(flat(keyCollar));
  const merged = mergeGeometries(parts, false)!;
  merged.computeVertexNormals();
  for (const p of parts) p.dispose();
  const body = new THREE.Mesh(merged, M.standard({ color: 0x24211f, roughness: 0.5, metalness: 0.6 }));
  body.name = 'liftoff:console-body';
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // ── the three systems (WP12's panel build, no board of its own: the console carries it) ───────
  const mount = new THREE.Group();
  mount.position.set(0, boardY + 0.027 * Math.cos(TILT), boardZ + 0.027 * Math.sin(TILT));
  mount.rotation.x = TILT - Math.PI / 2;
  group.add(mount);
  // the panel's local +z is out of its face: it lies on the board, a few mm above it
  const panel = buildSystemPanel(ctx, mount, { width: 0.86, name: 'liftoff:console-panel', board: false });
  panel.group.position.set(0, 0, 0.004);

  // the key (left) and the dial (right): interactable anchors and their small moving parts
  const key = new THREE.Object3D();
  key.position.set(-0.58, boardY + 0.07, boardZ + 0.06);
  group.add(key);
  const dial = new THREE.Object3D();
  dial.position.set(0.58, boardY + 0.1, boardZ + 0.05);
  group.add(dial);

  // ── the status line under the board (one text) ─────────────────────────────────────────────────
  let status: ((lang: Lang) => string) | null = null;
  const statusText = ctx.text3d.create(
    {
      text: (lang) => `${lang === 'de' ? L.consoleTitle.de : L.consoleTitle.en}\n${status ? status(lang) : ''}`,
      font: 'mono-medium',
      size: 0.034,
      color: 0xd6d3d1,
      anchorX: 'center',
      anchorY: 'middle',
      textAlign: 'center',
      lineHeight: 1.5,
      position: [0, 0.76, 0.19],
    },
    group,
  );
  statusText.name = 'liftoff:console-status';
  ctx.onDispose(() => merged.dispose());

  const stand = standPose().position;
  const left = bearingDir(AUSGUCK.facing - 90);
  const emiSpot: Vec3Tuple = [at.x + left[0] * AUSGUCK.emiSide, at.y, at.z + left[1] * AUSGUCK.emiSide];

  const panelState = (snap: QuestSnapshot, segments: number | undefined): LibellePanelState => {
    const p = libellePanel(snap);
    if (segments != null) p.bar = { ...p.bar, segments };
    return p;
  };
  let lastStatus = '';
  let last: ReturnType<LaunchConsole['shown']> = { lamps: [], bar: { lamp: 'dark', segments: 0 }, nav: 'dark', navLook: 'standby', crew: { akku: false, nav: false }, status: '' };
  return {
    group,
    key,
    dial,
    stand,
    standYawDeg: standPose().yawDeg,
    emiSpot,
    panel,
    paint(snap, o = {}) {
      const p = panelState(snap, o.segments);
      // the nav lamp: standby dim, active bright (a steady ramp is the caller's navK)
      const navK = o.nav === 'active' ? (o.navK ?? 1) : o.nav === 'standby' ? 0.45 : 1;
      if (o.nav === 'off') p.nav = 'dark';
      const crew = { akku: snap.start.energy.by === 'crew', nav: snap.start.nav.by === 'crew' };
      panel.set(p, { nav: navK, crew });
      last = { lamps: [...p.lamps], bar: { ...p.bar }, nav: p.nav, navLook: o.nav ?? 'standby', crew, status: lastStatus };
    },
    shown: () => ({ ...last, status: lastStatus }),
    setStatus(text) {
      status = text;
      const s = text ? text(ctx.lang) : '';
      if (s === lastStatus) return;
      lastStatus = s;
      statusText.text = `${ctx.lang === 'de' ? L.consoleTitle.de : L.consoleTitle.en}\n${s}`;
      statusText.sync();
    },
  };
}
