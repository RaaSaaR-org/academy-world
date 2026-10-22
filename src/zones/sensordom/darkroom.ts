/**
 * Station B "Dunkelkammer" (Verstehen): 12 × 12 × 3 m box (x −6…6, z −18…−6), maze on a 2 m grid,
 * LiDAR only. Glass G1 blocks the obvious corridor (player collider, invisible to the laser);
 * the first contact turns the lights on for 6 s, then Fusion adds ultrasound. A mirror at the end
 * of a corridor makes a phantom corridor (album). Reaching the exit door stamps the station.
 *
 *  cells (c 0…5 → x −6…6, r 0…5 → z −6…−18), entry at x 0 on the front wall, exit east at z −16
 *
 *        c0   c1   c2   c3   c4   c5
 *   r0   ── ─ ── ─ [entry] ──────────
 *        ·    ·    ·    ·  | ▓    ▓
 *   r1   ·  | ·  | ▓  | ·  | ▓    ▓
 *   r2   · G3 ·  | ▓  | ·  | ▓    ▓
 *        ─    ─    ─   G1    ─    ─
 *   r3   ·  | ·  | ·    ·  | ▓    ▓
 *        ─  MIRROR ─        ─    ─
 *   r4   ·  | ▓  | ·  | ·    ·    · → exit
 *   r5   ·    ·    · G2 ·    ·    ·
 */
import * as THREE from 'three';
import type { InfoCardSpec, WorldLabelHandle } from '@/core/zones';
import { css } from '@/core/zones';
import { placed } from './kit';
import { G_GLASS, G_MIRROR } from './lidar';
import { fresnelGlass, mirrorMaterial, own } from './materials';
import type { Sd } from './types';
import { canvasSign } from './signs';
import { mergeAll } from './labor';

type Cell = [number, number];
const OPEN: [Cell, Cell][] = [
  [[0, 0], [1, 0]], [[1, 0], [2, 0]], [[2, 0], [3, 0]],
  [[3, 0], [3, 1]], [[3, 1], [3, 2]], [[3, 2], [3, 3]], [[3, 3], [3, 4]], [[3, 4], [4, 4]], [[4, 4], [5, 4]], [[5, 4], [5, 5]],
  [[0, 0], [0, 1]], [[0, 1], [0, 2]], [[0, 2], [0, 3]], [[0, 3], [0, 4]], [[0, 4], [0, 5]], [[0, 5], [1, 5]], [[1, 5], [2, 5]], [[2, 5], [3, 5]], [[3, 5], [4, 5]], [[4, 5], [5, 5]],
  [[2, 5], [2, 4]], [[2, 4], [2, 3]], [[2, 3], [3, 3]],
  [[1, 0], [1, 1]], [[1, 1], [1, 2]], [[1, 2], [1, 3]],
  [[0, 2], [1, 2]],
];
/** glass panes on these (open) edges */
const GLASS: [Cell, Cell][] = [
  [[3, 2], [3, 3]], // G1 — the obvious corridor
  [[2, 5], [3, 5]], // G2
  [[0, 2], [1, 2]], // G3 — a "window" between two corridors
];
const key = (a: Cell, b: Cell): string => {
  const [p, q] = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? [a, b] : [b, a];
  return `${p[0]},${p[1]}|${q[0]},${q[1]}`;
};
const openSet = new Set(OPEN.map(([a, b]) => key(a, b)));

export const ROOM = { x0: -6, x1: 6, z0: -18, z1: -6, h: 3, wall: 2.6 } as const;
const MIRROR_Z = -13.88;

export interface Darkroom {
  update(dt: number): void;
  enter(): void;
  leave(): void;
  /** visor lock: LiDAR only (true while inside, except during the light reveal) */
  readonly locked: boolean;
  readonly fusion: boolean;
  readonly revealing: boolean;
  solve(): void;
  /** test hook: a ★★★ run (38 s, no glass contact) */
  stars3(): void;
  album(): void;
}

export function buildDarkroom(sd: Sd): Darkroom {
  const { ctx, B, lidar } = sd;
  const M = ctx.materials;
  const wallMat = M.panel;

  // ── outer box: a carbon „black box" with alu corner posts and rim (the room inside stays as it was) ──
  const T = 0.2;
  const H = ROOM.h;
  const outerMat = sd.look.carbon;
  for (const [cx, cz] of [
    [ROOM.x0, ROOM.z0],
    [ROOM.x0, ROOM.z1],
    [ROOM.x1, ROOM.z0],
    [ROOM.x1, ROOM.z1],
  ] as [number, number][])
    B.geo(placed(new THREE.CylinderGeometry(0.11, 0.13, H + 0.2, 12), [cx, (H + 0.2) / 2, cz]), { mat: sd.look.alu, seg: 'struktur' });
  B.geo(placed(new THREE.BoxGeometry(ROOM.x1 - ROOM.x0 + 0.5, 0.06, 0.06), [0, H + 0.17, ROOM.z1 + 0.2]), { mat: sd.look.alu, seg: 'struktur' });
  B.geo(placed(new THREE.BoxGeometry(0.06, 0.06, ROOM.z1 - ROOM.z0 + 0.5), [ROOM.x1 + 0.2, H + 0.17, (ROOM.z0 + ROOM.z1) / 2]), { mat: sd.look.alu, seg: 'struktur' });
  B.geo(placed(new THREE.BoxGeometry(0.06, 0.06, ROOM.z1 - ROOM.z0 + 0.5), [ROOM.x0 - 0.2, H + 0.17, (ROOM.z0 + ROOM.z1) / 2]), { mat: sd.look.alu, seg: 'struktur' });
  // front wall (z −6) with the 1.2 m door
  for (const [x0, x1] of [[ROOM.x0 - T / 2, -0.6], [0.6, ROOM.x1 + T / 2]] as [number, number][])
    B.box({ size: [x1 - x0, H, T], pos: [(x0 + x1) / 2, H / 2, ROOM.z1], mat: outerMat, seg: 'struktur', castShadow: true });
  B.box({ size: [1.2, H - 2.3, T], pos: [0, (H + 2.3) / 2, ROOM.z1], mat: outerMat, seg: 'struktur' });
  B.box({ size: [ROOM.x1 - ROOM.x0 + T, H, T], pos: [0, H / 2, ROOM.z0], mat: outerMat, seg: 'struktur', castShadow: true });
  B.box({ size: [T, H, ROOM.z1 - ROOM.z0], pos: [ROOM.x0, H / 2, (ROOM.z0 + ROOM.z1) / 2], mat: outerMat, seg: 'struktur', castShadow: true });
  // east wall with the exit door at z −16
  for (const [z0, z1] of [[ROOM.z0, -16.6], [-15.4, ROOM.z1]] as [number, number][])
    B.box({ size: [T, H, z1 - z0], pos: [ROOM.x1, H / 2, (z0 + z1) / 2], mat: outerMat, seg: 'struktur', castShadow: true });
  B.box({ size: [T, H - 2.3, 1.2], pos: [ROOM.x1, (H + 2.3) / 2, -16], mat: outerMat, seg: 'struktur' });
  // roof
  B.box({ size: [ROOM.x1 - ROOM.x0 + 0.4, 0.15, ROOM.z1 - ROOM.z0 + 0.4], pos: [0, H + 0.075, (ROOM.z0 + ROOM.z1) / 2], mat: outerMat, seg: 'struktur', castShadow: true });
  // exterior trims: teal line along the top, hazard frame at the doors
  B.geo(placed(new THREE.BoxGeometry(12.3, 0.05, 0.04), [0, H - 0.18, ROOM.z1 + 0.13]), { mat: sd.look.light('teal', 0), seg: 'struktur' });
  B.geo(placed(new THREE.BoxGeometry(0.04, 0.05, 12.3), [ROOM.x1 + 0.13, H - 0.18, (ROOM.z0 + ROOM.z1) / 2]), { mat: sd.look.light('teal', 0), seg: 'struktur' });
  for (const s of [-1, 1]) B.geo(placed(new THREE.BoxGeometry(0.08, 2.3, 0.03), [s * 0.66, 1.15, ROOM.z1 + 0.115]), { mat: M.hazard(2), seg: 'struktur' });
  B.geo(placed(new THREE.BoxGeometry(1.4, 0.08, 0.03), [0, 2.34, ROOM.z1 + 0.115]), { mat: M.hazard(4), seg: 'struktur' });
  for (const s of [-1, 1]) B.geo(placed(new THREE.BoxGeometry(0.03, 2.3, 0.08), [ROOM.x1 + 0.115, 1.15, -16 + s * 0.66]), { mat: M.hazard(2), seg: 'struktur' });

  // ── maze walls ───────────────────────────────────────────────────────────
  const W = ROOM.wall;
  for (let r = 0; r < 6; r++)
    for (let c = 1; c < 6; c++) {
      if (openSet.has(key([c - 1, r], [c, r]))) continue;
      B.box({ size: [T, W, 2 + T], pos: [ROOM.x0 + 2 * c, W / 2, ROOM.z1 - 2 * r - 1], mat: wallMat, seg: 'struktur' });
    }
  for (let r = 1; r < 6; r++)
    for (let c = 0; c < 6; c++) {
      if (openSet.has(key([c, r - 1], [c, r]))) continue;
      B.box({ size: [2 + T, W, T], pos: [ROOM.x0 + 2 * c + 1, W / 2, ROOM.z1 - 2 * r], mat: wallMat, seg: 'struktur' });
    }

  // ── glass panes ──────────────────────────────────────────────────────────
  const glassMat = fresnelGlass({ edges: true, base: 0.05, tint: 0x44403c, rim: 0xfafaf9 });
  const panes: { pos: THREE.Vector3; label: string }[] = [];
  let lastBump = -10;
  let contacts = 0;
  const paneGeos: THREE.BufferGeometry[] = [];
  GLASS.forEach(([a, b], i) => {
    const vertical = a[1] === b[1]; // same row → boundary is a vertical (x = const) line
    const x = vertical ? ROOM.x0 + 2 * Math.max(a[0], b[0]) : ROOM.x0 + 2 * a[0] + 1;
    const z = vertical ? ROOM.z1 - 2 * a[1] - 1 : ROOM.z1 - 2 * Math.max(a[1], b[1]);
    const size: [number, number, number] = vertical ? [0.02, W, 1.8] : [1.8, W, 0.02];
    const g = new THREE.PlaneGeometry(1.8, W);
    if (vertical) g.rotateY(Math.PI / 2);
    paneGeos.push(g.translate(x, W / 2, z));
    const coll: [number, number, number] = vertical ? [0.06, W, 1.9] : [1.9, W, 0.06];
    ctx.physics.addStaticBoxSensorIgnore({ size: coll, position: [x, W / 2, z], surface: 'glass' });
    lidar.addBox(size, [x, W / 2, z], null, G_GLASS, { seg: 'unsichtbar', depth: 'none' });
    panes.push({ pos: new THREE.Vector3(x, 1.6, z), label: `G${i + 1}` });
    ctx.physics.addTrigger({
      shape: 'box',
      size: vertical ? [0.2, 2, 1.8] : [1.8, 2, 0.2],
      position: [x, 1, z],
      onEnter: () => bump(i, x, z),
    });
  });

  const panes3 = B.mesh(mergeAll(paneGeos), { mat: glassMat, seg: 'unsichtbar', depth: 'none', lidarVis: 'hide' });
  panes3.renderOrder = 3;

  // ── mirror at the end of the column-1 corridor ───────────────────────────
  const mx = ROOM.x0 + 3;
  const mirror = B.mesh(new THREE.PlaneGeometry(1.8, 2.5), { mat: mirrorMaterial(ctx), seg: 'unbekannt', depth: 'mirror' });
  mirror.position.set(mx, 1.3, MIRROR_Z);
  lidar.addBox([1.8, 2.5, 0.02], [mx, 1.3, MIRROR_Z], null, G_MIRROR, { seg: 'unbekannt', depth: 'mirror', normal: new THREE.Vector3(0, 0, 1) });

  // ── ceiling lights (off; the reveal ramps them) ──────────────────────────
  const ceilMat = own(new THREE.MeshStandardMaterial({ name: 'sensordom:ceiling', color: 0x1c1917, emissive: 0xfff1dc, emissiveIntensity: 0, roughness: 0.6 }));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) B.geo(placed(new THREE.BoxGeometry(1.4, 0.04, 1.4), [-4 + 4 * i, H - 0.03, -8 - 4 * j]), { mat: ceilMat, seg: 'struktur', key: 'ceiling' });

  // ── signage ──────────────────────────────────────────────────────────────
  canvasSign(sd, { eyebrow: sd.text('sign.bEyebrow'), title: sd.text('sign.bTitle'), body: sd.text('sign.bBody'), width: 1.8, height: 0.95, position: [-2.6, 0.95, ROOM.z1 + 0.16] });
  const exitSign = ctx.text3d.create({ text: sd.text('sign.exit'), font: 'mono-medium', size: 0.16, color: 0x2dd4bf, glow: 1.3, letterSpacing: 0.18, anchorX: 'center', position: [ROOM.x1 + 0.14, 2.62, -16], rotationY: Math.PI / 2 }, ctx.groups.detail);
  sd.rgbOnly(exitSign);

  // ── sonar cone overlay (Fusion) ──────────────────────────────────────────
  const coneGroup = new THREE.Group();
  const conePts: number[] = [];
  const coneCol: number[] = [];
  const half = THREE.MathUtils.degToRad(15);
  const dim = [0, 0, 0],
    lit = [0.36, 0.34, 0.32];
  for (const off of [0, Math.PI / 6, -Math.PI / 6]) {
    const tip = (a: number, e: number, r: number): number[] => [-Math.sin(off + a) * Math.cos(e) * r, Math.sin(e) * r, -Math.cos(off + a) * Math.cos(e) * r];
    // the two horizontal edges fade in from the sensor, plus the 3 m range arc
    for (const a of [half, -half]) {
      conePts.push(...tip(a, -0.05, 0.6), ...tip(a, -0.05, 3));
      coneCol.push(...dim, ...lit);
    }
    for (let k = 0; k < 12; k++) {
      const a0 = -half + (k / 12) * 2 * half,
        a1 = -half + ((k + 1) / 12) * 2 * half;
      conePts.push(...tip(a0, -0.05, 3), ...tip(a1, -0.05, 3));
      coneCol.push(...lit, ...lit);
    }
  }
  const coneGeo = new THREE.BufferGeometry();
  coneGeo.setAttribute('position', new THREE.Float32BufferAttribute(conePts, 3));
  coneGeo.setAttribute('color', new THREE.Float32BufferAttribute(coneCol, 3));
  const cones = new THREE.LineSegments(coneGeo, own(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false })));
  cones.renderOrder = 11;
  cones.frustumCulled = false;
  coneGroup.add(cones);
  coneGroup.visible = false;
  ctx.groups.detail.add(coneGroup);

  // ── state ────────────────────────────────────────────────────────────────
  let inside = false;
  let running = false;
  let t0 = 0;
  const reveal = { active: false, t: 0 }; // t < 0: waiting, 0…8 s: lights up, on, down
  let revealedOnce = ctx.progress.get('revealed', false);
  let fusion = revealedOnce;
  let exitAmbient: (() => void) | null = null;
  let labels: WorldLabelHandle[] = [];
  let done = ctx.pass.has('dunkelkammer');
  let albumDone = false;
  let lastTime = 0;
  let lastContacts = 0;
  const lightAnchorHome = sd.light2.anchor.position.clone();

  function bump(i: number, x: number, z: number): void {
    const now = ctx.time.elapsed;
    if (now - lastBump < 1.2) return;
    lastBump = now;
    contacts++;
    sd.sound.glassThud([x, 1.4, z]);
    ctx.player.shake(0.05, 0.1);
    // the funny-informative failure: a popup at the pane and a red edge pulse (FUN-PLAN S2)
    // in front of the face (the pane itself is too close to read a label at)
    const eye = ctx.toLocal(ctx.camera.getWorldPosition(_eye), _eye);
    const fwd = ctx.toLocal(ctx.camera.getWorldDirection(_dir).multiplyScalar(3).add(ctx.camera.getWorldPosition(_tmp)), _dir);
    ctx.game.juice.popup([fwd.x, eye.y - 0.75, fwd.z], sd.text('game.b.glass'), { tone: 'bad', seconds: 2.2 });
    void x;
    void z;
    ctx.game.juice.pulse('bad', 0.8);
    live();
    void i;
    if (!revealedOnce && !reveal.active) startReveal(0.6);
  }

  function startReveal(delay: number): void {
    reveal.active = true;
    reveal.t = -delay;
    revealedOnce = true;
    ctx.progress.set('revealed', true);
    ctx.after(delay, () => {
      if (!reveal.active) return;
      if (inside) {
        sd.say('emi.glass');
        exitAmbient?.();
        exitAmbient = ctx.env.enterInterior({ ambient: 0.6, background: '#0c0a09' });
        sd.setMode('rgb', true);
        ctx.ui.status(sd.text('status.lights'));
      }
      labels = panes.map((p) => ctx.hud.worldLabel(p.pos, sd.text('dark.glass'), { eyebrow: `// ${p.label}`, kind: 'accent', maxDistance: 14 }));
      labels.push(ctx.hud.worldLabel([mx, 2.2, MIRROR_Z + 0.1], sd.text('dark.mirror'), { eyebrow: '// M', kind: 'accent', maxDistance: 14 }));
      sd.light2.anchor.position.set(0, 2.6, -12);
      sd.light2.setColor(0xfff1dc);
    });
  }

  function endReveal(): void {
    reveal.active = false;
    exitAmbient?.();
    exitAmbient = null;
    for (const l of labels) l.remove();
    labels = [];
    ceilMat.emissiveIntensity = 0;
    sd.light2.anchor.position.copy(lightAnchorHome);
    sd.light2.setIntensity(sd.region() === 'darkroom' ? 0 : 24);
    sd.light2.setColor(0xffd2a8);
    fusion = true;
    if (inside) {
      sd.setMode('lidar', true);
      ctx.ui.status(sd.text('status.fusion'));
      ctx.ui.hint(sd.text('hint.fusion'), 5);
      ctx.after(0.8, () => sd.say('emi.fusion'));
    }
  }

  // „Blindflug" time trial (FUN-PLAN S2): ★ exit (the stamp) · ★★ ≤ 60 s · ★★★ ≤ 45 s with no glass contact
  const ch = ctx.game.challenge({
    id: 'dunkelkammer',
    title: sd.text('game.b.title'),
    metric: { label: sd.text('game.b.metric'), unit: 's', better: 'lower', digits: 0 },
    goals: [{ text: sd.text('game.b.g1') }, { text: sd.text('game.b.g2'), at: 60 }, { text: sd.text('game.b.g3'), at: 45 }],
    lesson: sd.text('game.b.lesson'),
    why: () => cardB(sd, lastTime, lastContacts),
    retry: () => retry(),
    emi: sd.emi,
  });
  const live = (): void => {
    if (!running) return;
    const t = Math.floor(ctx.time.elapsed - t0);
    ch.live(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}${contacts ? ` · ${contacts} ✗` : ''}`);
  };
  let liveSec = -1;
  const retry = (): void => {
    if (reveal.active) endReveal();
    running = false;
    ch.live(null);
    // back to the door: lights off, LiDAR (+ fusion once revealed) from the start; the clock starts at the door
    ctx.player.teleport([0, 0, ROOM.z1 + 1.5], { yawDeg: 0, pitchDeg: -2, fade: true });
  };
  // Z3: R = retry; a run with progress (> 3 s) asks once („Nochmal R zum Neustart“)
  let rAsked = -10;
  ctx.input.onKey('KeyR', () => {
    if (!inside || !running || reveal.active) return;
    const now = ctx.time.elapsed;
    if (now - t0 > 3 && now - rAsked > 2.5) {
      rAsked = now;
      ctx.ui.hint(ctx.i18n.text('core.game.fail.confirmRestart'), 2.5);
      return;
    }
    rAsked = -10;
    retry();
  });

  const complete = (): void => {
    const t = Math.max(1, Math.round(ctx.time.elapsed - t0));
    lastTime = t;
    lastContacts = contacts;
    running = false;
    const k = (lang: 'de' | 'en'): string => (contacts === 1 ? (lang === 'de' ? 'Glaskontakt' : 'glass contact') : lang === 'de' ? 'Glaskontakte' : 'glass contacts');
    if (!done) {
      done = true;
      ctx.pass.award('dunkelkammer', { value: { de: `Ausgang in ${t} s · ${contacts} ${k('de')}`, en: `Exit in ${t} s · ${contacts} ${k('en')}` }, curve: [t, contacts] });
      ctx.after(2.5, () => void sd.emi.driveTo([5.2, 0, 7.4], { speed: 1.1 }));
      sd.refreshObjective();
    }
    ctx.pass.setBest('sensordom.darkroomTime', t, 'lower');
    const stars = (1 + (t <= 60 ? 1 : 0) + (t <= 45 && contacts === 0 ? 1 : 0)) as 1 | 2 | 3;
    const n = contacts;
    ch.submit(t, { stars, detail: { de: `${n} ${k('de')}`, en: `${n} ${k('en')}` } });
    ctx.game.juice.burst([ROOM.x1 + 0.8, 1.3, -16], { tone: 'teal', count: 70, spread: 1.0 });
    ctx.game.juice.cue('great');
    if (contacts === 0 && !revealedOnce) {
      sd.say('emi.noBump');
      startReveal(0.4);
    } else if (stars < 3) sd.say('emi.bDone');
  };

  return {
    get locked() {
      return inside && !(reveal.active && reveal.t >= 0);
    },
    get fusion() {
      return fusion;
    },
    get revealing() {
      return reveal.active;
    },
    enter() {
      inside = true;
      if (!running) {
        running = true;
        t0 = ctx.time.elapsed;
        contacts = 0;
        liveSec = -1;
        void ch.begin();
      }
      if (!reveal.active) {
        sd.setMode('lidar', true);
        ctx.ui.status(sd.text(fusion ? 'status.fusion' : 'status.darkroom'));
      }
      if (!ctx.progress.get('darkroomGreeted', false)) {
        ctx.progress.set('darkroomGreeted', true);
        sd.say('emi.darkroom');
      }
      sd.light2.setIntensity(0);
      sd.refreshObjective();
    },
    leave() {
      inside = false;
      coneGroup.visible = false;
      const p = ctx.player.positionLocal();
      if (running && p.x > ROOM.x1 - 0.2 && p.z < -14.5) complete();
      else {
        running = false;
        ch.live(null);
      }
      if (!reveal.active) sd.light2.setIntensity(24);
      sd.refreshObjective();
    },
    update(dt) {
      if (running && Math.floor(ctx.time.elapsed - t0) !== liveSec) {
        liveSec = Math.floor(ctx.time.elapsed - t0);
        live();
      }
      // reveal animation
      if (reveal.active) {
        reveal.t += dt;
        if (reveal.t >= 0) {
          const up = THREE.MathUtils.clamp(reveal.t / 1.0, 0, 1);
          const down = THREE.MathUtils.clamp((reveal.t - 7.0) / 1.0, 0, 1);
          const k = up * (1 - down);
          ceilMat.emissiveIntensity = 2.2 * k;
          sd.light2.setIntensity(40 * k);
          if (reveal.t >= 8.0) endReveal();
        }
      }
      // sonar cones follow the eye
      const scanning = inside && fusion && !reveal.active && sd.visor.mode === 'lidar';
      coneGroup.visible = scanning;
      if (scanning) {
        const eye = sd.ctx.toLocal(ctx.camera.getWorldPosition(_eye), _eye);
        coneGroup.position.set(eye.x, eye.y - 0.45, eye.z);
        ctx.camera.getWorldDirection(_dir);
        const fwd = sd.ctx.toLocal(_dir.add(ctx.camera.getWorldPosition(_tmp)), _dir).sub(eye);
        coneGroup.rotation.y = Math.atan2(-fwd.x, -fwd.z);
      }
      // album: walking into the phantom corridor until 0.5 m from the mirror (capsule r 0.35)
      if (inside && !albumDone && sd.visor.mode === 'lidar' && !reveal.active) {
        const p = ctx.player.positionLocal(_tmp);
        if (p.x > mx - 0.95 && p.x < mx + 0.95 && p.z < MIRROR_Z + 0.9 && p.z > MIRROR_Z - 0.5) this.album();
      }
    },
    album() {
      if (albumDone) return;
      albumDone = true;
      if (ctx.pass.unlockAlbum('spiegel-geisterpunkte')) sd.say('emi.album');
    },
    solve() {
      t0 = ctx.time.elapsed - 72;
      contacts = 1;
      revealedOnce = true;
      fusion = true;
      ctx.progress.set('revealed', true);
      complete();
    },
    stars3() {
      t0 = ctx.time.elapsed - 38;
      contacts = 0;
      revealedOnce = true;
      fusion = true;
      ctx.progress.set('revealed', true);
      complete();
    },
  };
}

const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();

function cardB(sd: Sd, t: number, contacts: number): InfoCardSpec {
  return {
    eyebrow: sd.text('card.b.eyebrow'),
    title: sd.text('card.b.title'),
    body: [sd.text('card.b.body'), sd.text('card.b.mirror')],
    // Entscheider: the body already names the ghost points; the diagram shows the geometry
    entdecker: { forDecisionMakers: undefined },
    entscheider: { body: [sd.text('card.b.body')] },
    metrics: [
      { label: sd.text('card.b.metricTime'), value: t, unit: 's' },
      { label: sd.text('card.b.metricContacts'), value: contacts },
    ],
    forDecisionMakers: { title: sd.text('card.b.dmTitle'), bullets: [sd.text('card.b.dm1'), sd.text('card.b.dm2')] },
    diagram: {
      aspect: 16 / 9,
      animate: true,
      caption: sd.text('card.b.caption'),
      draw(g, w, h, time) {
        // top view: sensor → mirror → wall; the scanner plots the return along the original ray
        g.clearRect(0, 0, w, h);
        const mxp = w * 0.5;
        const slope = 0.2;
        const sx = w * 0.08,
          sy = h * 0.49;
        // walls
        g.strokeStyle = css.border;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(w * 0.05, h * 0.2);
        g.lineTo(mxp, h * 0.2);
        g.moveTo(w * 0.05, h * 0.9);
        g.lineTo(mxp, h * 0.9);
        g.stroke();
        // mirror
        g.strokeStyle = css.text;
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(mxp, h * 0.12);
        g.lineTo(mxp, h * 0.98);
        g.stroke();
        // phantom corridor
        g.setLineDash([5, 5]);
        g.strokeStyle = css.textMuted;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(mxp, h * 0.2);
        g.lineTo(w * 0.97, h * 0.2);
        g.moveTo(mxp, h * 0.9);
        g.lineTo(w * 0.97, h * 0.9);
        g.stroke();
        g.setLineDash([]);
        // ray: sensor → mirror (d1) → wall (d2); ghost at d1 + d2 along the original ray
        const hitY = sy - (mxp - sx) * slope;
        const wallY = h * 0.2;
        const back = (hitY - wallY) / slope;
        const wallX = mxp - back;
        const ghostX = mxp + back,
          ghostY = wallY;
        const p = (time * 0.45) % 1.4;
        const seg = (x0: number, y0: number, x1: number, y1: number, t: number, col: string, dash = false): void => {
          if (t <= 0) return;
          const k = Math.min(1, t);
          g.strokeStyle = col;
          g.lineWidth = 2;
          g.setLineDash(dash ? [4, 4] : []);
          g.beginPath();
          g.moveTo(x0, y0);
          g.lineTo(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k);
          g.stroke();
          g.setLineDash([]);
        };
        seg(sx, sy, mxp, hitY, p / 0.5, css.teal);
        seg(mxp, hitY, wallX, wallY, (p - 0.5) / 0.4, css.teal);
        seg(mxp, hitY, ghostX, ghostY, (p - 0.9) / 0.35, css.orange, true);
        if (p > 1.25) {
          g.fillStyle = css.orange;
          g.beginPath();
          g.arc(ghostX, ghostY + 4, 5, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = css.teal;
        g.beginPath();
        g.arc(sx, sy, 6, 0, Math.PI * 2);
        g.fill();
        g.font = '11px "Geist Mono", monospace';
        g.fillStyle = css.textSecondary;
        g.fillText('LiDAR', sx - 14, sy + 20);
        g.fillText('d₁', (sx + mxp) / 2, (sy + hitY) / 2 + 16);
        g.fillText('d₂', (mxp + wallX) / 2 - 18, (hitY + wallY) / 2);
        g.fillStyle = css.orange;
        g.fillText('d₁ + d₂', ghostX - 20, ghostY + 22);
      },
    },
  };
}
