/**
 * The bridge, the bridge head, the Revier gate and the sign (plan WP3 build 2, §2.3, §1.2, §3.3):
 *
 *  - the bridge: 13 m from the Landedeck edge (z 101) to the bridge head (z 114), 4 m wide, a steel box
 *    girder with hazard tape on its edges (orange stays the signal there, §2.7 rule 5) and rails. It sits
 *    in the widened notch of the dock wall. `setBridge(t)`: it drops below the apron, then slides south
 *    into its pocket under the bridge head (t 0 extended … 1 retracted). Its collider exists only at t 0.
 *  - the bridge head pen (x ±9, z 104…121): fences east and west, the Revier gate at z 121 (two leaves
 *    that slide behind the fixed panels). `setGate(open)`; the leaves' colliders exist only while closed.
 *  - the sign pylon east of the notch, turned to the spawn: „SCHWEBEWERK · INSEL 17 / TROCKENDOCK 3 /
 *    ROTOREN m/6“ (`setSign(m)`); the first goal display (R5 §3.1), the view of the tower stays clear.
 */
import * as THREE from 'three';
import type { Text as TroikaText } from 'troika-three-text';
import type { StaticHandle, ZoneContext } from '@/core/zones';
import { REVIER } from '../layout';
import { T } from './tuning';
import { GroundBatch, beamGeo, mat4, type GroundMaterial } from './material';

export interface Bridge {
  readonly bridge: THREE.Mesh;
  readonly gate: THREE.InstancedMesh;
  setBridge(t: number): void;
  setGate(open: boolean): void;
  setSign(m: number): void;
  update(dt: number): void;
  /** colliders: bridge deck (at t 0) and the gate leaves (while closed) */
  readonly state: { bridge: number; gateOpen: boolean; rotors: number };
}

const BR = REVIER.bridge;
const GATE_Z = REVIER.bridgeHead.gateZ;
/** the sign pylon on the yard east of the notch (≈ 36° right of the spawn's view, 9 m away) */
const SIGN = { x: 5.3, z: 107.1 };
const PEN = { half: 9, north: 104.2 };
/** the gate opening (the bridge-head road is 8 m wide) and one leaf's width */
const GATE_HALF = 4;

export function buildBridge(ctx: ZoneContext, parent: THREE.Object3D, mat: GroundMaterial, rim: GroundBatch): Bridge {
  // ── the bridge (its own mesh: it moves) ──
  const z0 = BR.fromZ - 0.12,
    z1 = BR.toZ;
  const L = z1 - z0;
  const W = BR.width;
  const B = new GroundBatch();
  const s = { noShade: true };
  // deck plate (anti-slip steel), girder sides, the tape along both edges
  B.add(new THREE.BoxGeometry(W, 0.12, L), { color: 0x5a5550, rough: 0.82, metal: 0.25, grain: 0.6, ...s }, mat4(0, -0.06, L / 2));
  B.add(new THREE.BoxGeometry(W - 0.6, 0.62, L), { color: 0x3f3a36, rough: 0.5, metal: 0.4, ...s }, mat4(0, -0.43, L / 2));
  for (const side of [-1, 1]) {
    B.add(new THREE.BoxGeometry(0.18, 0.02, L), { color: 0xff6700, rough: 0.6, ...s }, mat4(side * (W / 2 - 0.12), 0.005, L / 2));
    for (let k = 0; k < Math.floor(L / 0.6); k += 2) B.add(new THREE.BoxGeometry(0.18, 0.022, 0.3), { color: 0x141414, rough: 0.6, ...s }, mat4(side * (W / 2 - 0.12), 0.006, 0.3 + k * 0.6));
    // rails: posts every 1.6 m, top and mid rail
    for (let z = 0.4; z < L; z += 1.6) B.add(new THREE.BoxGeometry(0.06, 1.1, 0.06), { color: 0x9c968f, rough: 0.36, metal: 0.75, ...s }, mat4(side * (W / 2 - 0.03), 0.55, z));
    for (const y of [0.6, 1.1]) B.add(beamGeo(new THREE.Vector3(side * (W / 2 - 0.03), y, 0.3), new THREE.Vector3(side * (W / 2 - 0.03), y, L - 0.2), 0.05), { color: 0x9c968f, rough: 0.36, metal: 0.75, ...s });
  }
  const bridge = B.build(mat, 'ground:bridge')!;
  bridge.matrixAutoUpdate = true;
  bridge.position.set(0, 0, z0);
  parent.add(bridge);
  ctx.onDispose(() => bridge.geometry.dispose());

  // the pocket under the bridge head (dark faces seen only through the portal) and its portal frame
  const pocket = { color: 0x2f2c29, rough: 0.9, sun: () => 0.15 };
  rim.add(new THREE.BoxGeometry(W + 0.8, 0.3, 15), pocket, mat4(0, -2.05, z1 + 7.4));
  // (its walls stop 8 cm under the yard: never coplanar with it)
  for (const side of [-1, 1]) rim.add(new THREE.BoxGeometry(0.3, 1.92, 15), pocket, mat4(side * (W / 2 + 0.55), -1.04, z1 + 7.4));
  rim.add(new THREE.BoxGeometry(W + 1.4, 0.4, 0.5), { color: 0x6f6963, rough: 0.6, metal: 0.3 }, mat4(0, -2.0, z1 + 0.2));

  // ── the pen: fences east and west (x ±9 from the dock rail to the gate line), fixed gate panels ──
  const fence = { color: 0x9c968f, rough: 0.4, metal: 0.7 };
  for (const side of [-1, 1]) {
    const x = side * PEN.half;
    // railings like the dock's (see-through): posts every 2.4 m, four rails
    for (let z = PEN.north; z <= GATE_Z + 0.01; z += 2.4) rim.add(new THREE.BoxGeometry(0.08, 1.6, 0.08), fence, mat4(x, 0.8, z));
    for (const y of [0.3, 0.72, 1.14, 1.56]) rim.add(beamGeo(new THREE.Vector3(x, y, PEN.north), new THREE.Vector3(x, y, GATE_Z), 0.05), fence);
    // fixed gate panels from the pen corner to the gate posts, and the posts
    const xa = side * GATE_HALF;
    for (const y of [0.3, 0.72, 1.14, 1.56]) rim.add(beamGeo(new THREE.Vector3(xa, y, GATE_Z), new THREE.Vector3(x, y, GATE_Z), 0.05), fence);
    for (const f of [0.33, 0.66]) rim.add(new THREE.BoxGeometry(0.06, 1.5, 0.06), fence, mat4(xa + (x - xa) * f, 0.78, GATE_Z));
    rim.add(new THREE.BoxGeometry(0.22, 1.9, 0.22), { color: 0x3f3a36, rough: 0.5, metal: 0.4 }, mat4(xa, 0.95, GATE_Z));
  }

  // ── the gate: two leaves (one instanced draw), sliding outward behind the fixed panels ──
  const G = new GroundBatch();
  const leaf = GATE_HALF - 0.1;
  G.add(new THREE.BoxGeometry(leaf, 0.08, 0.08), { color: 0x3f3a36, rough: 0.5, metal: 0.4, ...s }, mat4(0, 0.2, 0));
  G.add(new THREE.BoxGeometry(leaf, 0.08, 0.08), { color: 0x3f3a36, rough: 0.5, metal: 0.4, ...s }, mat4(0, 1.62, 0));
  for (const x of [-leaf / 2, 0, leaf / 2]) G.add(new THREE.BoxGeometry(0.08, 1.5, 0.08), { color: 0x3f3a36, rough: 0.5, metal: 0.4, ...s }, mat4(x, 0.91, 0));
  G.add(new THREE.BoxGeometry(leaf, 1.38, 0.02), { color: 0x8a847d, rough: 0.5, metal: 0.6, ...s }, mat4(0, 0.91, 0));
  // a band of hazard tape at hand height: the gate is the closed way into the Revier
  G.add(new THREE.BoxGeometry(leaf, 0.12, 0.03), { color: 0xff6700, rough: 0.6, ...s }, mat4(0, 1.15, 0.03));
  const leafGeo = G.build(mat, 'ground:gate')!;
  const gate = new THREE.InstancedMesh(leafGeo.geometry, mat, 2);
  gate.name = 'ground:gate';
  gate.castShadow = gate.receiveShadow = true;
  parent.add(gate);
  ctx.onDispose(() => leafGeo.geometry.dispose());

  // ── the sign: a pylon on the yard east of the notch, turned to the spawn (in view, the tower stays clear) ──
  const fmt = (m: number): { de: string; en: string } => ({ de: `ROTOREN ${m}/6`, en: `ROTORS ${m}/6` });
  const st = { bridge: 0, gateOpen: false, rotors: 0 };
  const signAt = new THREE.Vector3(SIGN.x, 0, SIGN.z);
  const [spx, , spz] = REVIER.spawn.position;
  const signYaw = Math.atan2(spx - SIGN.x, spz - SIGN.z);
  const signM = new THREE.Matrix4().compose(signAt, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), signYaw), new THREE.Vector3(1, 1, 1));
  const local = (x: number, y: number, z: number, sx = 1, sy2 = 1, sz2 = 1): THREE.Matrix4 => signM.clone().multiply(mat4(x, y, z, 0, sx, sy2, sz2));
  const SW = 3.4,
    SH = 2.5,
    sy = 0.95;
  const frameC = { color: 0xe7e5e4, rough: 0.42, metal: 0.1 };
  rim.add(new THREE.BoxGeometry(1, 1, 1), { color: 0x262422, rough: 0.62, metal: 0.12 }, local(0, sy + SH / 2, 0, SW, SH, 0.16));
  rim.add(new THREE.BoxGeometry(1, 1, 1), frameC, local(0, sy + SH + 0.06, 0, SW + 0.16, 0.12, 0.24));
  rim.add(new THREE.BoxGeometry(1, 1, 1), frameC, local(0, sy - 0.06, 0, SW + 0.16, 0.12, 0.24));
  for (const side of [-1, 1]) {
    rim.add(new THREE.BoxGeometry(1, 1, 1), frameC, local(side * (SW / 2 + 0.08), sy + SH / 2, 0, 0.12, SH + 0.24, 0.24));
    rim.add(new THREE.BoxGeometry(1, 1, 1), { color: 0x3f3a36, rough: 0.5, metal: 0.4 }, local(side * (SW / 2 - 0.3), sy / 2, 0, 0.18, sy, 0.18));
  }
  {
    // the brand hairline (orange → teal) along the top: vertex colours, kept out of the sun (a light line)
    const hair = new THREE.PlaneGeometry(SW, 0.035, 16, 1);
    hair.translate(0, sy + SH - 0.08, 0.085);
    const tint = new GroundBatch();
    tint.add(hair, { color: 0xffffff, noShade: true });
    const g = tint.build(mat, 'tmp')!.geometry;
    const p = g.getAttribute('position'),
      c = g.getAttribute('color');
    const o = new THREE.Color(0xff6700),
      t = new THREE.Color(0x2dd4bf),
      k = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      k.copy(o).lerp(t, (p.getX(i) + SW / 2) / SW);
      c.setXYZ(i, k.r * 2.2, k.g * 2.2, k.b * 2.2);
    }
    const rm = g.getAttribute('aRM');
    for (let i = 0; i < rm.count; i++) rm.setXYZW(i, 1, 0, 0, 0);
    g.applyMatrix4(signM);
    rim.addPainted(g);
    g.dispose();
  }
  const signG = new THREE.Group();
  signG.name = 'ground:sign';
  signG.position.copy(signAt);
  signG.rotation.y = signYaw;
  parent.add(signG);
  const x0 = -SW / 2 + 0.22;
  const make = (text: Parameters<typeof ctx.text3d.create>[0]['text'], o: Partial<Parameters<typeof ctx.text3d.create>[0]>, y: number): TroikaText =>
    ctx.text3d.create({ text, anchorX: 'left', anchorY: 'top', position: [x0, y, 0.09], maxWidth: SW - 0.4, ...o }, signG);
  make({ de: 'SCHWEBEWERK · INSEL 17', en: 'SCHWEBEWERK · ISLAND 17' }, { font: 'mono-medium', size: 0.14, color: 0xff6700, glow: 1.25, letterSpacing: 0.12 }, sy + SH - 0.2);
  make({ de: 'TROCKENDOCK 3', en: 'DRY DOCK 3' }, { font: 'display', size: 0.33 }, sy + SH - 0.46);
  const body = make((lang) => fmt(st.rotors)[lang], { font: 'mono-medium', size: 0.28, color: 0x2dd4bf, glow: 1.3, letterSpacing: 0.06 }, sy + 0.6);
  ctx.frames.adopt(ctx.physics.addStaticBox({ size: [SW + 0.3, sy + SH + 0.2, 0.4], position: [SIGN.x, (sy + SH) / 2, SIGN.z], rotation: [0, signYaw, 0], surface: 'metal' }));

  // ── colliders: the bridge deck (spans the slot) and the gate leaves ──
  let deck: StaticHandle | null = null;
  const leaves: StaticHandle[] = [];
  // all of them in the ground frame (ctx.frames.adopt: on only while docked)
  const addDeck = (): void => {
    if (deck) return;
    deck = ctx.physics.addStaticBox({ size: [W, 0.3, L + 0.4], position: [0, -0.15, z0 + L / 2], surface: 'metal' });
    ctx.frames.adopt(deck);
  };
  const addLeaves = (): void => {
    if (leaves.length) return;
    const h = ctx.physics.addStaticBox({ size: [GATE_HALF * 2, 1.9, 0.2], position: [0, 0.95, GATE_Z], surface: 'metal' });
    ctx.frames.adopt(h);
    leaves.push(h);
  };
  for (const side of [-1, 1]) {
    ctx.frames.adopt(ctx.physics.addStaticBox({ size: [0.2, 1.7, GATE_Z - PEN.north + 0.2], position: [side * PEN.half, 0.85, (GATE_Z + PEN.north) / 2], surface: 'metal' }));
    ctx.frames.adopt(ctx.physics.addStaticBox({ size: [PEN.half - GATE_HALF + 0.2, 1.9, 0.2], position: [side * ((PEN.half + GATE_HALF) / 2), 0.95, GATE_Z], surface: 'metal' }));
  }
  addDeck();
  addLeaves();

  let gateT = 0;
  const writeGate = (): void => {
    const m = new THREE.Matrix4();
    const off = gateT * T.gate.slide;
    gate.setMatrixAt(0, m.makeTranslation(-(GATE_HALF / 2 + off), 0, GATE_Z - 0.18));
    gate.setMatrixAt(1, m.makeTranslation(GATE_HALF / 2 + off, 0, GATE_Z - 0.18));
    gate.instanceMatrix.needsUpdate = true;
    gate.computeBoundingSphere();
  };
  writeGate();

  return {
    bridge,
    gate,
    state: st,
    setBridge(t) {
      const k = THREE.MathUtils.clamp(t, 0, 1);
      // juice: the hydraulics start, the bridge locks into its pocket (or back onto the Landedeck)
      if (st.bridge === 0 && k > 0) ctx.audio.play('whoosh', { volume: 0.3, pitch: 0.45, at: [0, -0.5, 108] });
      if ((st.bridge < 1 && k === 1) || (st.bridge > 0 && k === 0)) ctx.audio.play('thud', { volume: 0.4, pitch: 0.6, at: [0, -0.5, k === 1 ? 120 : 102] });
      st.bridge = k;
      // drop first (the rails clear the apron), then slide south into the pocket
      const drop = Math.min(1, k / 0.15);
      const slide = Math.max(0, (k - 0.15) / 0.85);
      bridge.position.set(0, -drop * (1.25 + T.bridge.drop), z0 + slide * T.bridge.retract);
      bridge.updateMatrix();
      if (k <= 0.001) addDeck();
      else if (deck) {
        deck.remove();
        deck = null;
      }
    },
    setGate(open) {
      if (open === st.gateOpen) return;
      st.gateOpen = open;
      ctx.audio.play('thud', { volume: 0.3, pitch: 0.7, at: [0, 1, GATE_Z] });
      if (!open) addLeaves();
      else {
        for (const h of leaves.splice(0)) h.remove();
      }
    },
    setSign(m) {
      const n = THREE.MathUtils.clamp(Math.round(m), 0, 6);
      if (n === st.rotors) return;
      st.rotors = n;
      body.text = ctx.i18n.resolve(fmt(n));
      body.sync();
    },
    update(dt) {
      const target = st.gateOpen ? 1 : 0;
      if (gateT === target) return;
      const step = dt / (ctx.settings.reducedMotion ? 0.4 : T.gate.seconds);
      gateT = target > gateT ? Math.min(target, gateT + step) : Math.max(target, gateT - step);
      // ease: cosine
      writeGate();
    },
  };
}
