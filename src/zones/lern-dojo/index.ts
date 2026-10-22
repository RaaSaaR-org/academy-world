/**
 * Zone 04 · LERNEN · Lern-Dojo (plan §4.5, R1 §10–§11): the real SO-101 learns from you.
 *
 * An open pavilion with a workbench, the real SO-101 leader and follower (WP0's models through
 * ctx.robots), and three stations:
 *   A Vormachen (Probieren)   — guide the leader, the follower copies; demos end by themselves when the
 *                                cube rests in the Kiste; different start fields teach more
 *   B Befehlen ◆ (Verstehen)  — train, command in words, predict, disturb (Neue Lage, Anderes Wort;
 *                                hidden: Abendlicht, Kamera), rescue with two-colour demos → M4
 *   C Prüfen (Messen)          — 250 SO-101 episodes: dead block, shifted cameras, wrong labels;
 *                                measure per condition (bekannte / neue Lagen), n = 50 each
 * Every demo hangs in the sky as a teal ribbon, every policy run as an orange one (the Demo-Wolke);
 * the Gehirn-Fenster shows SEHEN → VERSTEHEN → HANDELN live.
 *
 * Debug hooks: __academy.solve('lern-dojo', 'solve-a' | 'solve-b' | 'solve-c' | 'album' | 'stars3-a|b|c'),
 * fine-grained 'tele-*' / 'audit-*' hooks for scripted tests; __academy.ext('view:lerndojo-b').
 */
import * as THREE from 'three';
import { defineZone, type ChallengeHandle, type EmiHandle, type PanelHandle, type ZoneContext } from '@/core/zones';
import { css } from '@/core/zones';
import manifest from './manifest';
import { STRINGS } from './strings';
import { buildPavilion, FLOOR_Y, ROOF } from './pavilion';
import { createCloud, VITRINE, type Cloud } from './ribbons';
import { createTeleop, type Teleop } from './teleop';
import { createAudit, EMI_AUDIT, WALL, type Audit } from './audit';
import { createSounds } from './sound';
import { befundCard, cardA, cardB, cardC } from './cards';
import { Batch } from './batch';
import { look } from './look';
import { createArms, type Arms } from './arms';
import { createBench3D, type Bench3D } from './bench3d';
import { createBrain } from './brain';
import { DojoLab, fieldCube } from './lab';
import { LAYOUT, STATION_A, type CubeColour } from './tuning';

let emi: EmiHandle | null = null;
let cloud: Cloud | null = null;
let teleop: Teleop | null = null;
let audit: Audit | null = null;
let arms: Arms | null = null;
let bench: Bench3D | null = null;
let skill: PanelHandle | null = null;
let skillShown = false;

/**
 * „Was kostet ein Skill?“ (R1 §10.5, Entscheider): data 15–60 min per task and setup (RICHTWERT, R1 §7
 * from LeRobot's 50 episodes with their resets), training hours to a day (QUELLE: LeRobot's ACT and
 * SmolVLA docs), measuring n ≥ 50 per condition (QUELLE: LeRobot's GR00T doc). No prices (D5).
 */
function showSkill(ctx: ZoneContext): void {
  if (ctx.mode !== 'entscheider' || !skillShown) return;
  if (!skill) {
    skill = ctx.hud.panel({ eyebrow: ctx.i18n.text('skill.eyebrow') });
    const box = document.createElement('div');
    box.style.cssText = 'display:grid;gap:6px;margin-top:6px;font-size:13px';
    const row = (key: string, chip: 'richtwert' | 'quelle', src: string): void => {
      const r = document.createElement('div');
      r.className = 'line';
      r.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap';
      const t = document.createElement('span');
      t.textContent = ctx.t(key);
      r.append(t, ctx.ui.chip(chip, ctx.i18n.text(src)));
      box.appendChild(r);
    };
    row('skill.data', 'richtwert', 'skill.srcData');
    row('skill.train', 'quelle', 'skill.srcTrain');
    row('skill.measure', 'quelle', 'skill.srcMeasure');
    skill.el.appendChild(box);
    ctx.i18n.onChange(() => {
      skill?.remove();
      skill = null;
      showSkill(ctx);
    });
  }
  skill.setVisible(true);
}

const EMI_TABLE: [number, number, number] = [2.4, FLOOR_Y, -1.6];
const EMI_WAYPOINT: [number, number, number] = [0.2, FLOOR_Y, 0.4];

function objective(ctx: ZoneContext): void {
  if (!ctx.playerInside) return;
  const tp = teleop;
  const s = tp?.stage ?? 'A';
  const benchTarget = tp?.target ?? [0.42, 0, -2.25];
  const aDone = ctx.pass.has('vormachen') || ctx.mode === 'entscheider';
  if (!aDone && s === 'A') ctx.hud.setObjective(ctx.i18n.text('obj.A', { n: Math.min(STATION_A.target, (ctx.progress.get('demos', []) as unknown[]).length) }), { target: benchTarget });
  else if (s !== 'done' && !ctx.pass.has('nachmachen')) ctx.hud.setObjective(ctx.i18n.text(`obj.${s === 'A' ? 'B-train' : s}`), { target: benchTarget });
  else if (audit && !audit.done) ctx.hud.setObjective(ctx.i18n.text('obj.C'), { target: audit.consoleTarget });
  else if (!ctx.pass.has('vormachen')) ctx.hud.setObjective(ctx.i18n.text('obj.A', { n: 0 }), { target: benchTarget });
  else ctx.hud.setObjective(ctx.i18n.text('obj.done'));
}

/** Canvas sign on a post: eyebrow, title, body, "[E] Info". One draw call for the face. */
function canvasSign(ctx: ZoneContext, key: 'A' | 'B' | 'C', pos: [number, number, number], rotY: number, batch: Batch): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 300;
  const g = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const draw = (): void => {
    g.fillStyle = '#1f1f1f';
    g.fillRect(0, 0, 512, 300);
    const grad = g.createLinearGradient(0, 0, 512, 0);
    grad.addColorStop(0, css.orange);
    grad.addColorStop(1, css.teal);
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 4);
    g.font = '500 20px "Geist Mono", monospace';
    g.fillStyle = css.orange;
    g.fillText(ctx.t(`sign.${key}.eyebrow`), 28, 50);
    g.font = '700 54px "Space Grotesk", sans-serif';
    g.fillStyle = css.text;
    g.fillText(ctx.t(`sign.${key}.title`), 28, 118);
    g.font = '400 23px "Geist", sans-serif';
    g.fillStyle = css.textSecondary;
    const words = ctx.t(`sign.${key}.body`).split(' ');
    let line = '',
      y = 168;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (g.measureText(test).width > 456 && line) {
        g.fillText(line, 28, y);
        line = w;
        y += 32;
      } else line = test;
    }
    if (line) g.fillText(line, 28, y);
    g.font = '500 19px "Geist Mono", monospace';
    g.fillStyle = css.teal;
    g.fillText(ctx.t('sign.cta'), 28, 272);
    tex.needsUpdate = true;
  };
  draw();
  ctx.i18n.onChange(draw);
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const W = 1.25,
    H = (W * 300) / 512;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  const group = new THREE.Group();
  group.position.set(pos[0], pos[1], pos[2]);
  group.rotation.y = rotY;
  face.position.set(0, 1.25, 0.031);
  group.add(face);
  ctx.groups.detail.add(group);
  const c = Math.cos(rotY),
    s = Math.sin(rotY);
  const at = (lx: number, ly: number, lz: number): [number, number, number] => [pos[0] + lx * c + lz * s, pos[1] + ly, pos[2] - lx * s + lz * c];
  const LK = look(ctx);
  const [px, py, pz] = at(0, 1.25, 0);
  batch.box(LK.alu, W + 0.1, H + 0.1, 0.04, px, py, pz, rotY);
  const [gx, gy, gz] = at(0, 1.25, -0.03);
  batch.box(LK.darkGlass, W + 0.02, H + 0.02, 0.04, gx, gy, gz, rotY);
  const [tx2, ty2, tz2] = at(0, 1.25 + H / 2 + 0.06, 0.005);
  batch.box(LK.light(0x2dd4bf, 0), W + 0.1, 0.02, 0.03, tx2, ty2, tz2, rotY);
  const [qx, qy, qz] = at(0, 0.4, -0.04);
  batch.box(LK.carbon, 0.08, 0.8, 0.08, qx, qy, qz, rotY);
  const [fx, fy, fz] = at(0, FLOOR_Y + 0.03, -0.04);
  batch.box(LK.carbon, 0.36, 0.06, 0.24, fx, fy - FLOOR_Y, fz, rotY);
  ctx.physics.addStaticBox({ size: [0.2, 1.6, 0.2], position: [qx, FLOOR_Y + 0.8, qz] });
  ctx.onDispose(() => {
    tex.dispose();
    mat.dispose();
    face.geometry.dispose();
  });
  return face;
}

/**
 * „Echt gemessen“: a board beside the bench with the published SO-101 numbers next to the toy, each with
 * its chip and source (R1 §5: Yu & Qiu 2026 [S29]; Shukor et al. 2025 [S19], n not stated; LeRobot's
 * SmolVLA docs [S11]). Canvas only (no console words).
 */
function realBoard(ctx: ZoneContext, pos: [number, number, number], rotY: number, batch: Batch): void {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 400;
  const g = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const chip = (x: number, y: number, label: string, kind: 'quelle' | 'sim'): number => {
    g.font = '600 15px "Geist Mono", monospace';
    const w = g.measureText(label).width + 18;
    g.fillStyle = kind === 'sim' ? 'rgba(45,212,191,0.15)' : 'rgba(231,229,228,0.1)';
    g.fillRect(x, y - 17, w, 24);
    g.strokeStyle = kind === 'sim' ? 'rgba(45,212,191,0.6)' : 'rgba(231,229,228,0.45)';
    g.lineWidth = 1.2;
    g.strokeRect(x, y - 17, w, 24);
    g.fillStyle = kind === 'sim' ? css.teal : css.text;
    g.fillText(label, x + 9, y);
    return w;
  };
  const draw = (): void => {
    g.fillStyle = '#1f1f1f';
    g.fillRect(0, 0, 640, 400);
    const grad = g.createLinearGradient(0, 0, 640, 0);
    grad.addColorStop(0, css.orange);
    grad.addColorStop(1, css.teal);
    g.fillStyle = grad;
    g.fillRect(0, 0, 640, 4);
    g.font = '500 18px "Geist Mono", monospace';
    g.fillStyle = css.orange;
    g.fillText(ctx.t('real.eyebrow'), 26, 44);
    const rows: [string, string, 'quelle' | 'sim'][] = [
      [ctx.t('real.a'), ctx.t('real.srcA'), 'quelle'],
      [ctx.t('real.b'), ctx.t('real.srcB'), 'quelle'],
      [ctx.t('real.c'), ctx.t('real.srcC'), 'quelle'],
      [ctx.t('real.toy'), ctx.t('real.srcToy'), 'sim'],
    ];
    let y = 90;
    for (const [text, src, kind] of rows) {
      g.font = '400 20px "Geist", sans-serif';
      g.fillStyle = css.text;
      const words = text.split(' ');
      let line = '';
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (g.measureText(test).width > 588 && line) {
          g.fillText(line, 26, y);
          line = w;
          y += 26;
        } else line = test;
      }
      g.fillText(line, 26, y);
      y += 26;
      const cw = chip(26, y, kind === 'sim' ? 'SIM · LIVE' : ctx.t('real.chip'), kind);
      g.font = '400 14px "Geist Mono", monospace';
      g.fillStyle = css.textMuted;
      g.fillText(src, 26 + cw + 10, y);
      y += 38;
    }
    tex.needsUpdate = true;
  };
  draw();
  ctx.i18n.onChange(draw);
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const W = 1.1,
    H = (W * 400) / 640;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  const group = new THREE.Group();
  group.position.set(pos[0], pos[1], pos[2]);
  group.rotation.y = rotY;
  face.position.set(0, 1.18, 0.031);
  group.add(face);
  ctx.groups.detail.add(group);
  const c = Math.cos(rotY),
    s = Math.sin(rotY);
  const at = (lx: number, ly: number, lz: number): [number, number, number] => [pos[0] + lx * c + lz * s, pos[1] + ly, pos[2] - lx * s + lz * c];
  const LK = look(ctx);
  const [px, py, pz] = at(0, 1.18, 0);
  batch.box(LK.alu, W + 0.08, H + 0.08, 0.04, px, py, pz, rotY);
  const [qx, qy, qz] = at(0, 0.4, -0.04);
  batch.box(LK.carbon, 0.06, 0.8, 0.06, qx, qy, qz, rotY);
  const [fx, fy, fz] = at(0, FLOOR_Y + 0.03, -0.04);
  batch.box(LK.carbon, 0.32, 0.06, 0.22, fx, fy - FLOOR_Y, fz, rotY);
  ctx.physics.addStaticBox({ size: [0.2, 1.5, 0.2], position: [qx, FLOOR_Y + 0.75, qz] });
  ctx.onDispose(() => {
    tex.dispose();
    mat.dispose();
    face.geometry.dispose();
  });
}

export default defineZone({
  ...manifest,

  init(ctx) {
    ctx.i18n.register(STRINGS);
    ctx.pass.registerAlbum({
      id: 'policy-kopiert-fehler',
      title: { de: 'Die Policy kopiert auch Fehler', en: 'The policy copies mistakes too' },
      text: { de: 'Die Policy kopiert auch Fehler: Eine schlechte Demo im Datensatz wird nachgemacht.', en: 'The policy copies mistakes too: a bad demo in the dataset gets imitated.' },
      hint: { de: 'Tipp: Behalte eine misslungene Demo und trainiere.', en: 'Hint: keep a failed demo and train.' },
    });
    // R1 §10.7: two new entries from the disturbance cards
    ctx.pass.registerAlbum({
      id: 'wortblind',
      title: { de: 'Wortblind', en: 'Word-blind' },
      text: { de: 'Er hat ‚blau‘ gehört und rot genommen. Das Wort hat in deinen Demos nie etwas verändert.', en: 'It heard ‘blue’ and took red. The word never changed anything in your demos.' },
      hint: { de: 'Tipp: Gib einen Befehl mit einem Wort, das in keiner Demo vorkam.', en: 'Hint: give a command with a word that was in no demo.' },
    });
    ctx.pass.registerAlbum({
      id: 'schleife',
      title: { de: 'Die Schleife', en: 'The loop' },
      text: { de: 'Kamera 3 cm daneben – er greift 3 cm daneben. Immer wieder.', en: 'Camera 3 cm off: it grasps 3 cm off. Again and again.' },
      hint: { de: 'Tipp: Am Tisch steht eine Kamera. Was passiert, wenn sie verrutscht?', en: 'Hint: a camera stands at the bench. What if it slips?' },
    });
    const sounds = createSounds(ctx);

    buildPavilion(ctx);
    cloud = createCloud(ctx, ctx.groups.exterior);
    const changed = (): void => {
      objective(ctx);
      // the lift-off beat: after the zone's last stamp, the SO-101 hands you the M4 part
      if (ctx.pass.has('vormachen') && ctx.pass.has('nachmachen') && ctx.pass.has('datensatz-audit')) teleop?.valveReady();
    };
    emi = ctx.emi.spawn({ unit: 'EMI-05', position: EMI_TABLE, yawDeg: -25, parent: ctx.groups.detail });
    let emiAt: 'table' | 'audit' = 'table';
    let emiBusy = false;
    const emiGoTo = async (to: 'table' | 'audit'): Promise<void> => {
      const e = emi;
      if (!e || emiAt === to || emiBusy) return;
      emiBusy = true;
      try {
        await e.driveTo(EMI_WAYPOINT);
        await e.driveTo(to === 'audit' ? EMI_AUDIT : EMI_TABLE);
        emiAt = to;
      } finally {
        emiBusy = false;
      }
    };
    const brain = createBrain(ctx);
    bench = createBench3D(ctx, FLOOR_Y);
    bench.drawMat({ fieldDemos: [0, 0, 0, 0, 0], nextField: 0, marks: [], policyPath: null, demoPath: null });

    // ── the three challenges (registered at init: they persist, the Pass reads them) ──
    const chA: ChallengeHandle = ctx.game.challenge({
      id: 'vormachen',
      title: ctx.i18n.text('game.a.title'),
      metric: { label: ctx.i18n.text('game.a.metric'), unit: 's', better: 'lower', digits: 1 },
      goals: [{ text: ctx.i18n.text('game.a.g1') }, { text: ctx.i18n.text('game.a.g2') }, { text: ctx.i18n.text('game.a.g3') }],
      lesson: ctx.i18n.text('game.a.lesson'),
      why: () => cardA(ctx, { lastPath: null, demos: 0, fields: 0 }),
      retry: () => {
        teleop?.enter();
        teleop?.hook('armA');
      },
      emi: emi ?? undefined,
    });
    const chB: ChallengeHandle = ctx.game.challenge({
      id: 'nachmachen',
      title: ctx.i18n.text('game.b.title'),
      goals: [{ text: ctx.i18n.text('game.b.g1') }, { text: ctx.i18n.text('game.b.g2') }, { text: ctx.i18n.text('game.b.g3') }],
      lesson: ctx.i18n.text('game.b.lesson'),
      why: () => cardB(ctx),
      retry: () => teleop?.enter(),
      emi: emi ?? undefined,
    });
    const chC: ChallengeHandle = ctx.game.challenge({
      id: 'datensatz-audit',
      title: ctx.i18n.text('game.c.title'),
      metric: { label: ctx.i18n.text('game.c.metric'), unit: '%', better: 'higher', digits: 0 },
      goals: [{ text: ctx.i18n.text('game.c.g1') }, { text: ctx.i18n.text('game.c.g2') }, { text: ctx.i18n.text('game.c.g3') }],
      lesson: ctx.i18n.text('game.c.lesson'),
      why: () => cardC(ctx),
      emi: emi ?? undefined,
    });
    audit = createAudit(ctx, sounds, () => emi, () => void emiGoTo('audit'), chC, changed);

    // ── the arms; the station starts once both are in (their chain feeds the simulation) ──
    let readyResolve: (t: Teleop) => void = () => undefined;
    const teleopReady = new Promise<Teleop>((r) => (readyResolve = r));
    let wantEnter = false;
    arms = createArms(ctx, FLOOR_Y, (a) => {
      if (teleop || !a.chain) return;
      const lab = new DojoLab(ctx.physics.rapier, ctx.physics.createPrivateWorld({ gravity: { x: 0, y: -9.81, z: 0 }, autoStep: false }), a.chain);
      teleop = createTeleop({ ctx, lab, arms: a, bench: bench!, brain, cloud: cloud!, sounds, chA, chB, emi: () => emi, changed });
      // the far cloud: a few scripted demos as the landmark seen from across the island
      const ghosts = [0, 1, 2, 3, 4].map((f) => lab.expertDemo([fieldCube(f, 'rot' as CubeColour)], 'rot', 'rot', 300 + f * 7, f, 'example'));
      const far = cloud!.farMesh(ghosts.filter((d) => d.ok).map((d) => {
        const path = new Float32Array(Math.ceil(d.n / 4) * 3);
        const g = new THREE.Vector3();
        let k = 0;
        for (let i = 0; i < d.n; i += 4, k++) {
          lab.fk.setAll(d.s.subarray(i * 16, i * 16 + 6));
          lab.fk.jawCentre(g);
          path[k * 3] = g.x;
          path[k * 3 + 1] = g.z;
          path[k * 3 + 2] = d.s[i * 16 + 15];
        }
        return { kind: 'ghost' as const, path, n: k, age: 0 };
      }));
      ctx.groups.far.add(far);
      lab.setup([fieldCube(0, 'rot')]);
      readyResolve(teleop);
      changed();
      if (wantEnter && ctx.playerInside) {
        a.hideCard();
        teleop.enter();
      }
    });
    const ready = (): Promise<Teleop> => Promise.race([teleopReady, new Promise<Teleop>((_, rej) => setTimeout(() => rej(new Error('[lern-dojo] SO-101 not loaded')), 25000))]);
    // the bench console: waits behind the loading card while the arms are on their way (plan §5.8)
    ctx.addInteractable({
      object: bench.console,
      label: ctx.i18n.text('console.label'),
      hint: ctx.i18n.text('console.hint'),
      range: 2.6,
      isEnabled: () => !teleop?.operating,
      onInteract: () => {
        void emiGoTo('table');
        if (teleop) teleop.enter();
        else {
          wantEnter = true;
          arms?.showCard();
        }
      },
    });

    // ── signage ──────────────────────────────────────────────────────────────
    const sb = new Batch();
    const sb2 = new Batch();
    const signA = canvasSign(ctx, 'A', [-3.3, FLOOR_Y, 0.2], 0.5, sb);
    const signB = canvasSign(ctx, 'B', [-4.75, FLOOR_Y, -1.35], 0.85, sb);
    const signC = canvasSign(ctx, 'C', [-7.4, FLOOR_Y, -1.2], 0.75, sb);
    sb.build(ctx.groups.detail, { castShadow: false, name: 'signs' });
    const cardData = () => ({ lastPath: null, demos: (ctx.progress.get('demos', []) as unknown[]).length, fields: 0 });
    ctx.addInteractable({ object: signA, label: ctx.i18n.text('info.A'), range: 3, onInteract: () => void ctx.hud.openInfoCard(cardA(ctx, cardData())) });
    ctx.addInteractable({ object: signB, label: ctx.i18n.text('info.B'), range: 3, onInteract: () => void ctx.hud.openInfoCard(cardB(ctx)) });
    ctx.addInteractable({ object: signC, label: ctx.i18n.text('info.C'), range: 3, onInteract: () => void ctx.hud.openInfoCard(cardC(ctx)) });
    const z1 = ROOF.cz + ROOF.d / 2;
    ctx.text3d.create({ text: ctx.i18n.text('roof.title'), font: 'display', size: 1.15, color: 0xe7e5e4, anchorX: 'center', anchorY: 'bottom', letterSpacing: 0.06, position: [0, ROOF.y1 + 0.02, z1 - 0.45] }, ctx.groups.exterior);
    ctx.text3d.create({ text: ctx.i18n.text('roof.eyebrow'), font: 'mono-medium', size: 0.22, color: 0xff6700, anchorX: 'center', anchorY: 'middle', letterSpacing: 0.12, position: [0, (ROOF.y0 + ROOF.y1) / 2, z1 + 0.01] }, ctx.groups.exterior);
    ctx.hud.worldLabel([VITRINE.x, VITRINE.y1 + 0.7, VITRINE.z], ctx.i18n.text('cloud.label'), { eyebrow: ctx.i18n.text('cloud.eyebrow'), maxDistance: 36, kind: 'muted' });

    // ── „Echt gemessen“: the real numbers beside the toy (QUELLE; R1 §5, §10.3) ─────────────
    realBoard(ctx, [-1.25, FLOOR_Y, -3.05], 0.55, sb2);
    sb2.build(ctx.groups.detail, { castShadow: false, name: 'real-board' });

    // ── EMI-05 ───────────────────────────────────────────────────────────────
    emi.onAsk(() => {
      const s = teleop?.stage ?? 'A';
      const key = s === 'A' ? 'A' : s !== 'done' ? 'B' : !audit!.done ? 'C' : 'done';
      void emi!.say(ctx.i18n.text(`emi.ask.${key}`), { interrupt: true });
      void emi!.gesture('point');
    });

    // ── events ───────────────────────────────────────────────────────────────
    ctx.island.onGust(({ strength }) => cloud?.gust(strength));
    // Entscheider: after the stamp the Befundkarte (R1 §10.5), then the side panel „Was kostet ein Skill?“
    ctx.events.on('lern-dojo:befund', () => {
      void ctx.hud.openInfoCard(befundCard()).then(() => {
        skillShown = true;
        if (ctx.playerInside) showSkill(ctx);
      });
    });
    // §3.3: the ◆ is station B; after M4's rotor line, point back in while C is still open (WP12's cue)
    ctx.events.on('island:ignition', (e?: { areaId?: string; phase?: string }) => {
      if (e?.phase !== 'line' || e.areaId !== ctx.id || ctx.pass.has('datensatz-audit')) return;
      void emi?.say(ctx.i18n.text('emi.pointer'));
    });

    // ── debug hooks (the solve hooks wait for the arms) ────────────────────────
    const A = audit;
    const on = (name: string, fn: (t: Teleop) => unknown): void => ctx.debug.register(name, async () => fn(await ready()));
    on('solve-a', (t) => t.solveA());
    on('solve-b', (t) => t.solveB());
    ctx.debug.register('solve-c', () => A.solve());
    on('album', (t) => t.solveAlbum());
    on('stars3-a', (t) => {
      t.stars3A();
      return chA.stars;
    });
    on('stars3-b', (t) => {
      t.stars3B();
      return chB.stars;
    });
    ctx.debug.register('stars3-c', async () => {
      await A.stars3();
      return chC.stars;
    });
    ctx.debug.register('state', async () => ({ teleop: teleop?.debugState() ?? null, audit: A.debugState(), arms: arms?.state ?? null }));
    on('tele-autopilot-on', (t) => t.autopilot(true));
    on('tele-autopilot-off', (t) => t.autopilot(false));
    for (const name of ['train', 'armA', 'rescue', 'next', 'load', 'dusk', 'bump', 'jitter', 'view']) on(`tele-${name}`, (t) => t.hook(name, true));
    on('tele-card-newPose', (t) => t.hook('card', 'newPose'));
    on('tele-card-otherWord', (t) => t.hook('card', 'otherWord'));
    on('tele-predict-blau', (t) => t.hook('predict', 'blau'));
    on('tele-run', (t) => t.hook('run'));
    on('tele-enter', (t) => t.enter());
    ctx.debug.register('audit-select-dead', () => A.hook('selectDead'));
    ctx.debug.register('audit-select-labels', () => A.hook('selectLabels'));
    ctx.debug.register('audit-filter', () => A.hook('filter'));
    ctx.debug.register('audit-retrain', () => A.hook('retrain'));
    ctx.debug.register('audit-eval', () => A.hook('eval'));
    ctx.debug.register('befund', () => ctx.hud.openInfoCard(befundCard()));
    ctx.debug.register('card-a', () => ctx.hud.openInfoCard(cardA(ctx, cardData())));
    ctx.debug.register('card-b', () => ctx.hud.openInfoCard(cardB(ctx)));
    ctx.debug.register('card-c', () => ctx.hud.openInfoCard(cardC(ctx)));
    // tool hooks (plan §5.10): the view of tools/lib/views.mjs
    type Ext = (name: string, fn: (...a: never[]) => unknown) => (() => void) | undefined;
    const ext = (window as unknown as { __academy?: { ext?: Ext } }).__academy?.ext;
    const off = ext?.('view:lerndojo-b', async () => {
      // at the bench (the arms load when the player is near: priority 'route'), then the console in B
      ctx.player.teleport([0.3, FLOOR_Y, -1.9], { yawDeg: 0, pitchDeg: -20 });
      return (await ready()).viewB();
    });
    ctx.onDispose(() => typeof off === 'function' && off());

    // ── Sensorkapsel (FUN-PLAN L4): behind the Datensatz-Wand, at its −z end ──
    ctx.game.collectibles.place({ id: 'lern-dojo.kapsel', position: [WALL.x - 0.9, FLOOR_Y + 0.9, WALL.cz - WALL.w / 2 + 0.4] });
    ctx.mergeStatic(ctx.groups.exterior);
    void LAYOUT;
  },

  onEnter(ctx) {
    objective(ctx);
    showSkill(ctx);
    // Phase 7: the request (plan §3.2) once, also for an rc4 save that had heard rc4's greeting
    if (!ctx.progress.get('greeted7', false)) {
      ctx.progress.set('greeted7', true);
      void emi?.gesture('wave');
      void emi?.say(ctx.i18n.text('request'));
    }
  },

  onExit(ctx) {
    ctx.hud.setObjective(null);
    arms?.hideCard();
    skill?.setVisible(false);
  },

  update(dt, ctx) {
    const t = ctx.time.elapsed;
    teleop?.update(dt, t);
    if (!teleop) bench?.update(dt, t);
    audit?.update(dt, t);
    cloud?.update(dt, t);
  },

  updateFar(dt, ctx) {
    cloud?.update(dt, ctx.time.elapsed);
  },

  dispose() {
    emi = null;
    cloud = null;
    teleop = null;
    audit = null;
    arms = null;
    bench = null;
    skill = null;
    skillShown = false;
  },
});
