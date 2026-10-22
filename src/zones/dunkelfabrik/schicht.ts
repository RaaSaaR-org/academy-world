/**
 * Station A „Schicht" (Probieren, GDD §7.5 A): carry 18-kg crates from the conveyor end to the
 * Handpalette at Station 7 for 60 s. First person, no Bedienmodus. Carrying slows you to 2 m/s
 * (no sprint), doubles the head bob, darkens the view with the load you have moved, and you
 * hear yourself breathe (and, after five lifts, your heartbeat).
 */
import * as THREE from 'three';
import type { ChallengeHandle, EmiHandle, InfoCardSpec, PanelHandle, Stars, ZoneContext } from '@/core/zones';
import type { Line } from './line';
import { BELT, CRATE, END_X, HANDPALETTE } from './line';
import { FURNACE } from './hall';
import type { Sound } from './sound';
import { CRATE_KG, G, SHIFT_LIFTS, SHIFT_TONNES } from './sim';
import { clamp01, easeInOut } from './geo';

export const SHIFT_SECONDS = 60;
const MAX_CRATES = 12;
/** a set-down counts as bent when the crate centre ends below this height: the floor pallet's bottom
 *  layer (0.30 m) forces you down, its second layer (0.60 m) and the belt (0.9–1.2 m) do not.
 *  (Load height, not camera pitch: where you look says nothing about how you bend.) */
const BEND_BELOW_M = 0.5;
const HOLD = new THREE.Vector3(0, -0.47, -0.66);
/** crates waiting at the belt end on a retry */
const QUEUE_PREFILL = 4;

export interface Schicht {
  readonly running: boolean;
  /** the Station A challenge (FUN-PLAN D1) */
  readonly challenge: ChallengeHandle;
  readonly carrying: boolean;
  readonly done: boolean;
  update(dt: number, t: number): void;
  /** debug: complete deterministically (placed crates; default 9) */
  solve(placed?: number): void;
  /** debug: start carrying a crate (screenshots) */
  debugCarry(): void;
  /** leaving the zone: put the crate down, end a running shift without a stamp */
  abort(): void;
  onFinish: ((r: { lifts: number; placed: number; seconds: number; bent: number; temp: number; skipped: boolean }) => void) | null;
}

/** star thresholds (crates placed in 60 s), calibrated with real input (see the commit log) */
export const SCHICHT_GOALS = [3, 7, 9] as const;

export function buildSchicht(ctx: ZoneContext, line: Line, sound: Sound, emi: EmiHandle): Schicht {
  const t = (k: string, p?: Record<string, string | number>): string => ctx.t(`schicht.${k}`, p);
  const det = ctx.groups.detail;

  let running = false;
  let done = ctx.pass.has('schicht');
  let elapsed = 0;
  let lifts = 0;
  let placed = 0;
  let bent = 0;
  let tempAcc = 0;
  let tempW = 0;
  let carried: THREE.Mesh | null = null;
  let anim: { kind: 'lift' | 'place'; t: number; from: THREE.Vector3; to: THREE.Vector3; fromQ: THREE.Quaternion; toQ: THREE.Quaternion; slot?: number } | null = null;
  let unlockMove: (() => void) | null = null;
  let restoreSpeed: (() => void) | null = null;
  let restoreBob: (() => void) | null = null;
  let restoreVig: (() => void) | null = null;
  let speedMode = 0; // 0 none, 1 walk, 2 shift held
  let vigNow = -1;
  let panel: PanelHandle | null = null;
  let afterglow = 0; // seconds of breathing/heartbeat after the shift
  let canStop = false;
  let bentTold = false;
  let clearHint: (() => void) | null = null;
  const curve: number[] = [];
  let panelT = 0;
  let lastX = 0;
  let lastZ = 0;
  let labelCount = -1;
  let countingDown = false;
  let objKey = '';
  let last: { lifts: number; placed: number; secs: number; bent: number; temp: number; robot: number } | null = null;

  const _v = new THREE.Vector3();
  const _w = new THREE.Vector3();
  const _q = new THREE.Quaternion();

  // ── interactables: pickup at the end stop, set-down at the Handpalette ───
  const pickProxy = new THREE.Mesh(new THREE.BoxGeometry(CRATE.w + 0.1, 0.45, 1.0), new THREE.MeshBasicMaterial({ visible: false }));
  pickProxy.position.set(END_X, BELT.top + 0.2, BELT.z + 0.1);
  pickProxy.userData.noCollide = true;
  det.add(pickProxy);
  ctx.onDispose(() => {
    pickProxy.geometry.dispose();
    (pickProxy.material as THREE.Material).dispose();
  });
  // PT-23: once the shift is stamped, E at the belt starts a new attempt; the prompt says so
  const again = (): boolean => !running && ctx.pass.has('schicht');
  ctx.addInteractable({
    object: pickProxy,
    label: () => ctx.t(again() ? 'schicht.again' : 'schicht.lift'),
    hint: () => ctx.t(again() ? 'schicht.againHint' : 'schicht.liftHint'),
    range: 2.0,
    highlight: false,
    isEnabled: () => line.mode === 'day' && !carried && !anim && !countingDown && line.frontCrate(_v),
    onInteract: () => {
      if (running) lift();
      else void begin();
    },
  });
  // waist-to-head high, so „Kiste absetzen“ shows while you look at the pallet, not only 40° down (playtest PT-17)
  const placeProxy = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.9, 1.6), new THREE.MeshBasicMaterial({ visible: false }));
  placeProxy.position.set(HANDPALETTE.x, 0.95, HANDPALETTE.z);
  placeProxy.userData.noCollide = true;
  det.add(placeProxy);
  ctx.onDispose(() => {
    placeProxy.geometry.dispose();
    (placeProxy.material as THREE.Material).dispose();
  });
  const placeH = ctx.addInteractable({
    object: placeProxy,
    label: ctx.i18n.text('schicht.place'),
    range: 2.6,
    highlight: false,
    isEnabled: () => !!carried && !anim && line.hand.count < MAX_CRATES,
    onInteract: () => place(),
  });
  // the pallet itself is solid
  ctx.physics.addStaticBox({ size: [1.2, 0.15, 1.2], position: [HANDPALETTE.x, 0.1, HANDPALETTE.z], surface: 'wood' });

  // ── helpers ──────────────────────────────────────────────────────────────
  const hallTemp = (): number => {
    const p = ctx.player.positionLocal(_w);
    const d = Math.hypot(p.x - (FURNACE.x1 + 0.5), p.z - FURNACE.mouthZ);
    return 38 + 6 * clamp01(1 - (d - 2) / 26);
  };
  const fatigue = (): number => clamp01((lifts * CRATE_KG) / (MAX_CRATES * CRATE_KG));
  // the time runs in the core attempt bar (begin({ timer })); the robot's count races you
  const rows = (): { k: string; v: string; tone?: 'accent' | 'teal' | 'default' }[] => [
    { k: t('rowLifts'), v: String(lifts), tone: 'accent' },
    { k: ctx.t('game.a.rowRobot'), v: String(line.robotCount()), tone: 'teal' },
    { k: t('rowMoved'), v: `${lifts * CRATE_KG} kg` },
    { k: t('rowBent'), v: String(bent) },
    { k: t('rowTemp'), v: `${ctx.i18n.num(hallTemp(), 0)} °C` },
  ];
  const ensurePanel = (): void => {
    if (panel) return;
    panel = ctx.hud.panel({ eyebrow: ctx.i18n.text('schicht.panel'), rows: rows() });
    panel.el.append(ch.chips(), ctx.ui.chip('fiktion', ctx.i18n.text('game.a.raceSource')));
  };
  const setSpeed = (mode: number): void => {
    if (mode === speedMode) return;
    restoreSpeed?.();
    restoreSpeed = null;
    speedMode = mode;
    // walk 4.5 → 2.0 m/s (×0.45); with Shift held the sprint 8 → 2.0 m/s (×0.25): no sprint while carrying
    if (mode === 1) restoreSpeed = ctx.player.setSpeedFactor(0.45);
    else if (mode === 2) restoreSpeed = ctx.player.setSpeedFactor(2.0 / 8);
  };
  const setVignette = (v: number): void => {
    if (Math.abs(v - vigNow) < 0.01) return;
    vigNow = v;
    restoreVig?.();
    restoreVig = v > 0.001 ? ctx.player.setVignette(v) : null;
  };

  const start = (): void => {
    running = true;
    elapsed = 0;
    lifts = 0;
    placed = 0;
    bent = 0;
    tempAcc = 0;
    tempW = 0;
    canStop = false;
    bentTold = false;
    curve.length = 0;
    line.hand.count = 0;
    line.race(true);
    ensurePanel();
    objKey = '';
    runObjective();
    liveChip();
  };

  /** QA-14: the objective names the count and the next star, and points where you have to go */
  const nextGoal = (): number => SCHICHT_GOALS.find((g) => g > placed) ?? SCHICHT_GOALS[2];
  const runObjective = (): void => {
    if (!running || !ctx.playerInside) return;
    const carry = !!carried;
    const key = `${carry ? 'carry' : 'fetch'}:${placed}`;
    if (key === objKey) return;
    objKey = key;
    ctx.hud.setObjective(ctx.i18n.text(carry ? 'game.a.carry' : 'game.a.fetch', { n: placed, g: nextGoal() }), {
      target: carry ? [HANDPALETTE.x, 0, HANDPALETTE.z] : [END_X, 0, BELT.z + 0.9],
    });
  };
  const liveChip = (): void => {
    if (running) ch.live(ctx.i18n.text('game.a.live', { you: placed, robot: line.robotCount() }));
  };
  line.onRobotCrate = (n, at) => {
    if (!running) return;
    ctx.game.juice.popup([at.x, at.y + 0.6, at.z], ctx.i18n.text('game.a.robotPop', { n }), { tone: 'muted', seconds: 1.6 });
    liveChip();
  };

  /** first E at the belt: 3-2-1-LOS, then the crate comes up and the minute runs */
  const begin = async (): Promise<void> => {
    if (running || countingDown || carried) return;
    countingDown = true;
    try {
      await ch.begin({ countdown: true, timer: { seconds: SHIFT_SECONDS, label: ctx.i18n.text('game.a.timer') } });
    } finally {
      countingDown = false;
    }
    if (running || line.mode !== 'day') return;
    start();
    lift();
  };

  function lift(): void {
    if (carried || anim) return;
    if (!line.frontCrate(_v)) return;
    if (!running) start();
    line.takeFront();
    lifts++;
    // the crate mesh starts where it stood on the belt (camera-local) and rises into the hold pose
    const m = new THREE.Mesh(line.crateGeometry, line.crateMaterial);
    m.name = 'df:carried-crate';
    const cam = ctx.camera;
    cam.updateMatrixWorld();
    const wpos = ctx.toWorld([_v.x, _v.y, _v.z]);
    const from = cam.worldToLocal(wpos.clone());
    const camQ = cam.getWorldQuaternion(new THREE.Quaternion());
    const rootQ = ctx.root.getWorldQuaternion(new THREE.Quaternion());
    const fromQ = camQ.clone().invert().multiply(rootQ);
    m.position.copy(from);
    m.quaternion.copy(fromQ);
    ctx.player.carry(m);
    carried = m;
    anim = { kind: 'lift', t: 0, from, to: HOLD.clone(), fromQ, toQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, 0)) };
    unlockMove = ctx.player.lockControls({ look: false });
    sound.lift();
    sound.thud(undefined, 0.5);
    ctx.player.shake(0.012, 0.35);
    restoreBob = ctx.player.setHeadBob(2);
    runObjective();
  }

  function place(): void {
    if (!carried || anim) return;
    const slot = line.hand.count;
    if (slot >= MAX_CRATES) return;
    const to = line.handSlot(slot, new THREE.Vector3());
    if (to.y < BEND_BELOW_M) {
      bent++;
      if (!bentTold) {
        bentTold = true;
        ctx.hud.toast(ctx.i18n.text('schicht.bentToastPlace'), { kind: 'warn', duration: 3 });
      }
    }
    // move the crate from the camera into the zone root, then glide into its slot
    const cam = ctx.camera;
    cam.updateMatrixWorld();
    const w = carried.getWorldPosition(new THREE.Vector3());
    const local = ctx.toLocal(w);
    const wq = carried.getWorldQuaternion(new THREE.Quaternion());
    const rootQinv = ctx.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    ctx.player.carry(null);
    det.add(carried);
    carried.position.copy(local);
    carried.quaternion.copy(rootQinv.multiply(wq));
    anim = { kind: 'place', t: 0, from: local, to, fromQ: carried.quaternion.clone(), toQ: new THREE.Quaternion(), slot };
    restoreBob?.();
    restoreBob = null;
  }

  const finish = (skipped = false): void => {
    if (!running && !skipped) return;
    running = false;
    // a crate still in your arms (or still rising into them) goes back on the belt end; a crate
    // already gliding onto the pallet finishes its move
    if (carried && (!anim || anim.kind === 'lift')) {
      ctx.player.carry(null);
      carried.removeFromParent();
      carried = null;
      anim = null;
      unlockMove?.();
      unlockMove = null;
      restoreBob?.();
      restoreBob = null;
    }
    setSpeed(0);
    clearHint?.();
    clearHint = null;
    afterglow = 14;
    const secs = Math.round(Math.min(SHIFT_SECONDS, elapsed));
    const temp = tempW > 0 ? tempAcc / tempW : 41;
    const ok = skipped || placed >= 6 || (elapsed >= SHIFT_SECONDS - 0.01 && placed >= 3) || (canStop && ctx.mode === 'entscheider');
    if (ok) done = true;
    const robot = line.robotCount();
    line.race(false);
    last = { lifts, placed, secs, bent, temp, robot };
    // award first, then notify: the zone's next objective reads the stamp; the result goes to the
    // banner (merged with the stamp), the shift report is behind [H] Warum? (never opens by itself)
    if (ok && !skipped) {
      const value = {
        de: `${lifts} ${lifts === 1 ? 'Hub' : 'Hübe'} · ${lifts * CRATE_KG} kg in ${secs} s · ${Math.round(temp)} °C`,
        en: `${lifts} ${lifts === 1 ? 'lift' : 'lifts'} · ${lifts * CRATE_KG} kg in ${secs} s · ${Math.round(temp)} °C`,
      };
      ctx.pass.award('schicht', { value, curve: curve.length ? [...curve] : [lifts] });
      const by = SCHICHT_GOALS.filter((g) => placed >= g).length;
      const stars = Math.max(1, by) as Stars; // ★ = the stamp (also the Entscheider's early stop)
      const r = ch.submit(placed, { stars, detail: raceLine(placed, robot) });
      if (stars >= 1) {
        ctx.game.juice.burst([HANDPALETTE.x, 1.0, HANDPALETTE.z], { tone: 'teal', count: 40 });
        ctx.game.juice.cue('great');
      }
      void r;
    } else if (!skipped) ch.fail(ctx.i18n.text('game.a.fail', { n: placed }));
    api.onFinish?.({ lifts, placed, seconds: secs, bent, temp, skipped });
    // clear the Handpalette a little later so the next try starts fresh
    ctx.after(4, () => {
      if (!running) line.hand.count = 0;
      panel?.remove();
      panel = null;
    });
  };

  const raceLine = (you: number, robot: number) =>
    ctx.i18n.text('game.a.race', { you, robot, who: ctx.t(you > robot ? 'game.a.win' : you === robot ? 'game.a.tie' : 'game.a.lose') });

  const skip = (): void => {
    if (running) finish();
    ctx.pass.award('schicht', { value: { de: 'übersprungen', en: 'skipped' }, skipped: true });
    done = true;
    api.onFinish?.({ lifts: 0, placed: 0, seconds: 0, bent: 0, temp: 41, skipped: true });
  };

  // ── Station 7 sign with the (Entscheider) skip button ────────────────────
  // Z3: R only ever means retry; ending the shift early (Entscheider, after 30 s, it counts) is
  // E on this button, which sits on the way from the belt end to the hand pallet
  const skipBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 18).rotateX(Math.PI / 2), ctx.materials.panelElevated);
  skipBtn.position.set(5.55, 1.02, -6.66);
  det.add(skipBtn);
  ctx.onDispose(() => skipBtn.geometry.dispose());
  ctx.addInteractable({
    object: skipBtn,
    label: () => ctx.t(running ? 'schicht.stop' : 'schicht.skip'),
    hint: () => ctx.t(running ? 'schicht.stopBtnHint' : 'schicht.skipHint'),
    range: 2.4,
    isEnabled: () => ctx.mode === 'entscheider' && (running ? canStop : !ctx.pass.has('schicht')),
    onInteract: () => {
      if (running) {
        if (canStop) finish();
      } else skip();
    },
  });

  // ── the shift report: now behind [H] Warum? in the banner (and in the Pass) ──
  const report = (): InfoCardSpec => {
    const r = last ?? { lifts: 0, placed: 0, secs: 0, bent: 0, temp: 41, robot: 0 };
    const n = r.lifts;
    return {
      eyebrow: ctx.i18n.text('schicht.reportEyebrow'),
      title: ctx.i18n.text('game.a.whyTitle', { n, hub: t(n === 1 ? 'hubOne' : 'hubMany'), kg: n * CRATE_KG, s: r.secs }),
      body: [ctx.i18n.text('schicht.reportLead'), ctx.i18n.text('schicht.reportMode')],
      metrics: [
        { label: ctx.i18n.text('schicht.rowLifts'), value: `${n} · ${r.placed}`, unit: t('onPallet') },
        { label: ctx.i18n.text('schicht.rowMoved'), value: n * CRATE_KG, unit: `kg · ${Math.round(CRATE_KG * G)} N ${t('perLift')}` },
        { label: ctx.i18n.text('game.a.rowRobot'), value: r.robot, note: ctx.i18n.text('game.a.raceSource') },
        { label: ctx.i18n.text('schicht.rowTemp'), value: Math.round(r.temp), unit: '°C', note: ctx.i18n.text('schicht.fiktionSource') },
        { label: ctx.i18n.text('schicht.shiftLine'), value: t('shiftValue', { n: SHIFT_LIFTS.toLocaleString(ctx.lang === 'de' ? 'de-DE' : 'en-US'), t: Math.round(SHIFT_TONNES) }), note: ctx.i18n.text('schicht.shiftSource') },
      ],
      bullets: (['q1', 'q2', 'q3'] as const).map((k) => (lang: 'de' | 'en') => `${ctx.t(`board.${k}`)} — ${lang === 'de' ? 'Quelle' : 'Source'}: ${ctx.t(`board.${k}src`)}`),
      illustrative: true,
      illustrativeNote: ctx.i18n.text('schicht.shiftSource'),
      forDecisionMakers: ctx.i18n.text('claim'),
    };
  };

  // ── the challenge (FUN-PLAN D1): crates placed in 60 s, the robot races you ──
  const ch: ChallengeHandle = ctx.game.challenge({
    id: 'schicht',
    title: ctx.i18n.text('game.a.title'),
    metric: { label: ctx.i18n.text('game.a.metric'), better: 'higher', digits: 0 },
    goals: [
      { text: ctx.i18n.text('game.a.g1'), at: SCHICHT_GOALS[0] },
      { text: ctx.i18n.text('game.a.g2'), at: SCHICHT_GOALS[1] },
      { text: ctx.i18n.text('game.a.g3'), at: SCHICHT_GOALS[2] },
    ],
    lesson: ctx.i18n.text('game.a.lesson'),
    why: report,
    retry: () => retry(),
    emi,
  });
  /** instant retry: back to the belt end, crates waiting, the next E starts the countdown */
  const retry = (): void => {
    if (running) api.abort();
    line.hand.count = 0;
    line.race(false);
    if (!line.frontCrate(_v)) line.prefill(QUEUE_PREFILL);
    ctx.player.teleport([END_X + 1.1, 0, BELT.z + 1.5], { yawDeg: 40, pitchDeg: -12 });
    ctx.hud.setObjective(ctx.i18n.text('game.a.start'), { target: [END_X, 0, BELT.z + 0.9] });
  };

  const api: Schicht = {
    get running() {
      return running;
    },
    get carrying() {
      return !!carried;
    },
    get done() {
      return done;
    },
    onFinish: null,
    update(dt) {
      // lift / place animations
      if (anim && carried) {
        anim.t += dt;
        const dur = anim.kind === 'lift' ? 0.6 : 0.42;
        const k = easeInOut(Math.min(1, anim.t / dur));
        carried.position.lerpVectors(anim.from, anim.to, k);
        if (anim.kind === 'lift') carried.position.y += Math.sin(Math.PI * k) * -0.08;
        else carried.position.y += Math.sin(Math.PI * k) * 0.12;
        _q.slerpQuaternions(anim.fromQ, anim.toQ, k);
        carried.quaternion.copy(_q);
        if (anim.t >= dur) {
          if (anim.kind === 'lift') {
            unlockMove?.();
            unlockMove = null;
            anim = null;
          } else {
            carried.removeFromParent();
            carried = null;
            line.hand.count++;
            placed++;
            sound.thud(undefined, 0.9);
            ctx.audio.play('thud', { at: [HANDPALETTE.x, 0.4, HANDPALETTE.z], volume: 0.5 });
            anim = null;
            if (running) {
              ctx.game.juice.popup([HANDPALETTE.x, 1.3, HANDPALETTE.z], '+18 kg', { tone: 'good', seconds: 1.4 });
              ctx.game.juice.cue('good', { at: [HANDPALETTE.x, 0.6, HANDPALETTE.z], pitch: 1 + 0.04 * Math.min(10, placed) });
              if (SCHICHT_GOALS.includes(placed as 3 | 7 | 9)) ctx.game.juice.burst([HANDPALETTE.x, 0.9, HANDPALETTE.z], { tone: 'teal', count: 18 });
              liveChip();
              runObjective();
            }
            if (line.hand.count >= MAX_CRATES && running) finish();
          }
        }
      }
      // carried crate sways with breath and steps
      // walking speed from the feet position (no per-frame Vector3 copies from the engine API)
      const pl = ctx.player.positionLocal(_w);
      const sp = dt > 0 ? Math.hypot(pl.x - lastX, pl.z - lastZ) / dt : 0;
      lastX = pl.x;
      lastZ = pl.z;
      if (carried && !anim) {
        const tt = ctx.time.elapsed;
        carried.position.set(HOLD.x + Math.sin(tt * 4.2) * 0.012 * Math.min(1, sp), HOLD.y + Math.sin(tt * 8.4) * 0.018 * Math.min(1, sp) + Math.sin(tt * 2.6) * 0.006, HOLD.z);
      }
      // movement + vignette while carrying
      if (carried) setSpeed(ctx.input.isDown('ShiftLeft') || ctx.input.isDown('ShiftRight') ? 2 : 1);
      else setSpeed(0);
      const f = fatigue();
      if (running) setVignette(carried ? 0.15 + 0.3 * f : 0.08 + 0.12 * f);
      else setVignette(afterglow > 0 ? 0.1 * (afterglow / 14) : 0);

      // timer (paused while a modal is open)
      if (running && !ctx.hud.modalOpen) {
        elapsed += dt;
        const temp = hallTemp();
        tempAcc += temp * dt;
        tempW += dt;
        const sec10 = Math.floor(elapsed / 10);
        while (curve.length < sec10) curve.push(lifts);
        if (!canStop && ctx.mode === 'entscheider' && elapsed >= 30) {
          canStop = true;
          clearHint = ctx.ui.hint(ctx.i18n.text('schicht.stopHint'), 0);
        }
        if (elapsed >= SHIFT_SECONDS) finish();
      }
      // audio body load
      if (running) {
        sound.setBreath(carried ? 0.45 + 0.55 * f : 0.2 + 0.4 * f);
        sound.setHeart(lifts >= 5 ? Math.min(140, 92 + (lifts - 5) * 7) : 0);
      } else if (afterglow > 0) {
        afterglow -= dt;
        sound.setBreath(Math.max(0, (afterglow / 14) * 0.5));
        sound.setHeart(afterglow > 6 ? 96 : 0);
      } else {
        sound.setBreath(0);
        sound.setHeart(0);
      }
      panelT -= dt;
      if (panel && panelT <= 0) {
        panelT = 0.2;
        panel.setRows(rows());
      }
      if (line.hand.count !== labelCount) {
        labelCount = line.hand.count;
        placeH.setLabel(ctx.i18n.text('schicht.place', { n: Math.min(MAX_CRATES, labelCount + 1), layer: labelCount >= 6 ? 2 : 1 }));
      }
    },
    challenge: ch,
    solve(n = 9) {
      if (!running) start();
      lifts = n;
      placed = n;
      bent = 3;
      elapsed = SHIFT_SECONDS;
      tempAcc = 41;
      tempW = 1;
      line.hand.count = n;
      for (let i = 1; i <= 6; i++) curve[i - 1] = Math.round((n * i) / 6);
      finish();
      // no afterglow HUD for the test hook (the Körperlast panel must not linger elsewhere)
      panel?.remove();
      panel = null;
    },
    abort() {
      if (carried) {
        ctx.player.carry(null);
        carried.removeFromParent();
        carried = null;
      }
      anim = null;
      unlockMove?.();
      unlockMove = null;
      restoreBob?.();
      restoreBob = null;
      setSpeed(0);
      setVignette(0);
      if (running) {
        running = false;
        clearHint?.();
        clearHint = null;
        panel?.remove();
        panel = null;
        line.hand.count = 0;
        line.race(false);
        ch.live(null);
      }
      sound.setBreath(0);
      sound.setHeart(0);
      afterglow = 0;
    },
    debugCarry() {
      if (!line.frontCrate(_v)) line.prefill(2);
      lift();
    },
  };
  return api;
}
