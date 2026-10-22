import * as THREE from 'three';
import { DEG } from '../layout';
import { C, F, drawHistory, drawLibelle, hairline, num, type Lang } from './draw';
import { el, hiCanvas } from './dom';
import { FIN_CSS } from './css';
import { F1, F1_GUSTS, controllerF1, createLivePlant, type LivePlant } from './sim';
import { S } from './strings';
import { F1_HOVER } from './tuning';
import type { FinaleEnv } from './types';

/**
 * F1 „Schwebetest" (GDD §6.6; Phase 7 plan §4.14, D24): the dock arms release and the island hovers
 * 10 m above its keel block (ctx.island.setAltitude 0 → 10 m over 4 s: the depth ticks on the dock wall
 * slide through the smoked shell; ground colliders off, ground dynamics frozen, §5.3 rule 7). Then 15 s
 * of holding it level by hand: the cursor is the thrust command (point where the ball rolls → that side
 * gets lifted), the plant has the 150 ms actuator lag. The world tilts (±3°), the crates slide
 * (gravity ×4), the rotors roar. Then "Regler übernimmt": the classic controller levels the island in
 * about 1.5 s, and it sets back down with a thud, the arms catching it. Reduced motion: no world tilt
 * (engine), the hover reached behind a short fade, the artificial horizon in the panel.
 */

const HIST_HZ = 20;
const TAKEOVER_S = 2.6;

type Phase = 'ready' | 'count' | 'live' | 'takeover' | 'result';

/** The hover of F1: the arms and the altitude, eased over time (also after the panel closed). */
interface Hover {
  /** current altitude (m) and where it is going */
  h: number;
  target: number;
  /** the arms 0 holding … 1 stowed */
  arms: number;
  busy: boolean;
}
const hovers = new WeakMap<FinaleEnv, Hover>();
const hoverOf = (env: FinaleEnv): Hover => {
  let h = hovers.get(env);
  if (!h) hovers.set(env, (h = { h: 0, target: 0, arms: 0, busy: false }));
  return h;
};

const easeIO = (k: number): number => {
  const x = Math.max(0, Math.min(1, k));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/**
 * Release the arms and rise to the hover (`up`), or set down and let the arms catch it. Resolves when
 * there. Reduced motion: a short fade instead of the 4 s ease. The thud lands with the touch-down.
 */
export function hoverTo(env: FinaleEnv, up: boolean): Promise<void> {
  const { ctx } = env;
  const hv = hoverOf(env);
  const to = up ? F1_HOVER.height : 0;
  hv.target = to;
  const g = env.ground();
  return new Promise<void>((resolve) => {
    if (ctx.settings.reducedMotion) {
      ctx.events.emit('ui:fade', { on: true });
      ctx.after(F1_HOVER.rmFadeS, () => {
        hv.h = to;
        hv.arms = up ? 1 : 0;
        g?.setArms(hv.arms);
        ctx.island.setAltitude(to);
        if (!up) ctx.audio.play('thud', { volume: 0.6, pitch: 0.55 });
        ctx.after(0.1, () => ctx.events.emit('ui:fade', { on: false }));
        resolve();
      });
      return;
    }
    const from = hv.h;
    const armsFrom = hv.arms;
    let t = 0;
    hv.busy = true;
    const armsS = up ? F1_HOVER.armsS : F1_HOVER.armsBackS;
    const moveS = up ? F1_HOVER.riseS : F1_HOVER.setDownS;
    // up: the arms swing back first, then the rise; down: the set-down first, then the arms catch it
    const total = armsS * 0.5 + moveS + (up ? 0 : armsS * 0.5);
    let landed = false;
    env.tick((dt) => {
      if (hv.target !== to) {
        hv.busy = false;
        resolve();
        return false;
      }
      t += Math.min(0.1, dt);
      const kMove = easeIO(up ? (t - armsS * 0.5) / moveS : t / moveS);
      const kArms = up ? Math.min(1, t / armsS) : Math.max(0, (t - moveS) / armsS);
      hv.h = from + (to - from) * kMove;
      hv.arms = up ? armsFrom + (1 - armsFrom) * kArms : armsFrom * (1 - kArms);
      ctx.island.setAltitude(hv.h);
      g?.setArms(hv.arms);
      if (!up && !landed && kMove >= 1) {
        landed = true;
        ctx.audio.play('thud', { volume: 0.7, pitch: 0.5 });
        ctx.player.shake(0.06, 0.25);
      }
      if (t >= total) {
        hv.busy = false;
        resolve();
        return false;
      }
      return true;
    });
  });
}

/** F1's hover state (tools, the Kielraum view). */
export function hoverState(env: FinaleEnv): { h: number; arms: number; busy: boolean } {
  const hv = hoverOf(env);
  return { h: Math.round(hv.h * 100) / 100, arms: Math.round(hv.arms * 100) / 100, busy: hv.busy };
}

/** The artificial horizon (reduced motion's instrument, plan §4.14): the horizon line tilts by the roll and moves with the pitch. */
function drawHorizon(g: CanvasRenderingContext2D, w: number, h: number, roll: number, pitch: number, lang: Lang): void {
  g.save();
  g.fillStyle = C.bg;
  g.fillRect(0, 0, w, h);
  g.translate(w / 2, h / 2);
  g.rotate((-roll * Math.PI) / 180);
  const dy = pitch * 6;
  g.fillStyle = '#2a2622';
  g.fillRect(-w, dy, w * 2, h);
  g.strokeStyle = C.teal;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-w, dy);
  g.lineTo(w, dy);
  g.stroke();
  for (const k of [-3, 3]) {
    g.strokeStyle = 'rgba(248,113,113,0.6)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-w * 0.18, dy + k * 6);
    g.lineTo(w * 0.18, dy + k * 6);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = C.text;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(w / 2 - 34, h / 2);
  g.lineTo(w / 2 - 10, h / 2);
  g.moveTo(w / 2 + 10, h / 2);
  g.lineTo(w / 2 + 34, h / 2);
  g.stroke();
  g.fillStyle = C.text3;
  g.font = F.mono(11);
  g.fillText(lang === 'de' ? 'KÜNSTLICHER HORIZONT · ±3°' : 'ARTIFICIAL HORIZON · ±3°', 8, 14);
}

/** In-world Leitstand screen: compact spirit level + state line. */
export function drawLeitstandScreen(env: FinaleEnv, roll: number, pitch: number, state: string, thrust: [number, number] | null, ball: [number, number] | null): void {
  const c = env.room.leitstandCanvas;
  const g = c.getContext('2d')!;
  const W = c.width,
    H = c.height;
  const L = env.ctx.lang as Lang;
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  hairline(g, 0, 0, W, 4);
  g.fillStyle = C.orange;
  g.font = F.mono(22);
  g.fillText(env.ctx.i18n.resolve(S.f1Title), 26, 44);
  g.fillStyle = C.text;
  g.font = F.display(34);
  g.fillText(state, 26, 96);
  const tilt = Math.max(Math.abs(roll), Math.abs(pitch));
  g.fillStyle = C.text3;
  g.font = F.mono(20);
  g.fillText(L === 'de' ? 'LAGE' : 'TILT', 26, 150);
  g.fillStyle = tilt >= 3 ? C.error : C.teal;
  g.font = F.mono(52, 500);
  g.fillText(`${num(tilt, 2, L)}°`, 26, 206);
  g.fillStyle = C.text3;
  g.font = F.mono(18);
  g.fillText(L === 'de' ? 'ZIEL |θ| < 3° · VERZÖGERUNG 150 ms' : 'GOAL |θ| < 3° · LAG 150 ms', 26, 256);
  // Phase 7: the Schwebetest's height over the keel block (FIKTION, like every island number)
  const hv = hoverState(env);
  if (hv.h > 0.05 || hv.busy) {
    g.fillStyle = C.teal;
    g.fillText(`${L === 'de' ? 'SCHWEBEN' : 'HOVER'} ${num(hv.h, 1, L)} m · ${L === 'de' ? 'HALTEARME FREI' : 'ARMS RELEASED'} · ${L === 'de' ? 'FIKTION' : 'FICTION'}`, 26, 280);
  }
  drawLibelle(g, W - 150, H / 2 + 8, 118, ball ?? [-roll, pitch], thrust, { limit: 3, range: 4, px: 18 });
  env.room.markLeitstand();
}

/** `bot` (debug/test only): a simulated hand that follows the instruction with a reaction delay. */
export function startF1(env: FinaleEnv, bot: { react: number; kp: number; kd: number } | null = null): void {
  const { ctx, room } = env;
  if (env.busy) return;
  env.busy = true;
  const L = (): Lang => ctx.lang as Lang;
  const T = (t: Parameters<typeof ctx.i18n.resolve>[0]): string => ctx.i18n.resolve(t);

  // operator frame: forward / right on the ground plane (world)
  const pose = room.poses.f1;
  const fwd = new THREE.Vector3(pose.lookAt.x - pose.position.x, 0, pose.lookAt.z - pose.position.z).normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);

  // the classic controller in the same 15 s with the same gusts (deterministic)
  const ctrlRun = controllerF1();
  let phase: Phase = 'ready';
  let plant: LivePlant = createLivePlant();
  let tPhase = 0;
  const ndc = { x: 0, y: 0 };
  let hist: number[] = [];
  let histAcc = 0;
  let maxTilt = 0,
    over = 0,
    settle = -1,
    settleCandidate = -1,
    screenAcc = 0;
  let active = true;
  let atStop = false;
  const cmd: [number, number] = [0, 0];

  // crates: the private world's gravity follows the tilt (×4) while F1 runs
  const setIce = (on: boolean): void => {
    if (!on) room.setCrateGravity(null);
  };
  const roar = ctx.audio.loop('drone', { at: [0, -37, 0], volume: 0.15 });

  // ── panel DOM ────────────────────────────────────────────────────────────
  const lib = hiCanvas(232, 232);
  // reduced motion: the island does not tilt, so an artificial horizon shows the attitude (plan §4.14)
  const horizon = ctx.settings.reducedMotion ? hiCanvas(232, 92) : null;
  let countS = 3;
  const libWrap = el('div', { style: 'display:flex;justify-content:center;margin:6px 0 2px;position:relative' }, lib.canvas);
  const his = hiCanvas(340, 70);
  const stTilt = el('div', { class: 'fin-v teal' }, '0°');
  const stThrust = el('div', { class: 'fin-v' }, '0 %');
  const stTime = el('div', { class: 'fin-v' }, `${num(F1.duration, 1, L())} s`);
  const stateLine = el('div', { class: 'fin-state' });
  const actions = el('div', { class: 'fin-actions', style: 'margin-top:10px' });
  const countEl = el('div', { class: 'fin-countdown', style: 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;text-shadow:0 2px 12px #000' });
  libWrap.append(countEl);
  const topEl = el('div');
  const hisCap = el('div', { class: 'fin-row fin-mono', style: 'justify-content:space-between;color:var(--text-3);font-size:11px;margin:8px 0 3px' });
  let exitOperate: (() => void) | null = null;

  const setTop = (): void => {
    topEl.replaceChildren();
    if (phase === 'ready') topEl.append(el('p', { style: 'margin:8px 0 4px' }, T(S.f1How)), el('p', { class: 'fin-mono', style: 'color:var(--text-3);font-size:11.5px;margin:0' }, T(S.f1Lag)));
    libWrap.style.display = phase === 'result' ? 'none' : 'flex';
  };
  const setActions = (): void => {
    actions.replaceChildren();
    countEl.textContent = '';
    if (phase === 'ready') {
      // Entscheider: the Probieren step may be skipped (GDD §3); the record stays honest ("übersprungen")
      if (ctx.mode === 'entscheider')
        actions.append(
          el(
            'button',
            {
              class: 'btn ghost',
              onclick: () => {
                env.state.f1 = { max: 0, over: 0, settle: 0, held: false, skipped: true };
                env.save();
                void env.say([S.f1EmiNext], 4, { interrupt: true });
                exitOperate?.();
              },
            },
            T(S.f1Skip),
          ),
        );
      actions.append(el('button', { class: 'btn primary', onclick: () => begin() }, T(S.f1Start)));
    } else if (phase === 'result') {
      actions.append(
        el('button', { class: 'btn ghost', onclick: () => begin() }, T(S.f1Again)),
        el('button', { class: 'btn primary', onclick: () => exitOperate?.() }, T(S.f1Next)),
      );
    }
    setTop();
  };
  const stat = (k: string, v: HTMLElement): HTMLElement => el('div', { class: 'fin-stat' }, el('div', { class: 'fin-k' }, k), v);
  const buildPanel = (root: HTMLElement): void => {
    root.classList.add('fin');
    root.append(el('style', null, FIN_CSS));
    root.append(el('div', { class: 'fin-head' }, el('div', { class: 'eyebrow' }, T(S.f1Title)), el('div', { class: 'fin-chips' }, ctx.ui.chip('sim', { de: 'Spielzeugmodell, im Spiel gerechnet', en: 'Toy model, computed in-game' }))));
    root.append(topEl, libWrap);
    if (horizon) root.append(el('div', { style: 'display:flex;justify-content:center;margin:2px 0 4px' }, horizon.canvas));
    root.append(stateLine);
    root.append(el('div', { class: 'fin-stats' }, stat(L() === 'de' ? 'Lage' : 'Tilt', stTilt), stat(L() === 'de' ? 'Schub' : 'Thrust', stThrust), stat(L() === 'de' ? 'Zeit' : 'Time', stTime)));
    hisCap.append(el('span', null, L() === 'de' ? '|θ| ÜBER DIE ZEIT · GRENZE 3°' : '|θ| OVER TIME · LIMIT 3°'), el('span', null, el('span', { style: 'color:var(--text)' }, `— ${T(S.f1You)}`), '  ', el('span', { style: 'color:var(--teal)' }, `— ${T(S.f1Ctrl)}`)));
    root.append(hisCap, his.canvas, actions);
    // the cursor over this panel still steers (NDC from the window)
    const onMove = (e: PointerEvent): void => {
      ndc.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      ndc.y = -((e.clientY / Math.max(1, window.innerHeight)) * 2 - 1);
    };
    root.addEventListener('pointermove', onMove);
    setActions();
  };

  const begin = (): void => {
    if (!active) return;
    env.f1?.begin();
    phase = 'count';
    tPhase = 0;
    // the arms let go and the island rises to its 10 m hover first (once; „Nochmal“ stays up there)
    const hv = hoverState(env);
    if (hv.h < F1_HOVER.height - 0.01 || hv.busy) {
      countS = ctx.settings.reducedMotion ? 3 : Math.max(3, F1_HOVER.armsS * 0.5 + F1_HOVER.riseS);
      ctx.audio.play('whoosh', { volume: 0.4, pitch: 0.42 });
      void hoverTo(env, true);
    } else countS = 3;
    plant = createLivePlant();
    hist = [];
    histAcc = 0;
    maxTilt = 0;
    over = 0;
    settle = -1;
    settleCandidate = -1;
    stateLine.className = 'fin-state';
    setActions();
    ctx.audio.play('click');
  };

  const showResult = (): void => {
    phase = 'result';
    const held = over === 0;
    env.state.f1 = { max: Math.round(maxTilt * 100) / 100, over: Math.round(over * 10) / 10, settle: Math.round(Math.max(0, settle) * 100) / 100, held };
    env.save();
    // ★ result banner (game layer): the time over 3° rates your hand (≤ 15 s · ≤ 5 s · 0 s)
    env.f1?.submit(Math.round(over * 10) / 10, { detail: { de: `max. Lage ${num(maxTilt, 1, 'de')}°`, en: `max. tilt ${num(maxTilt, 1, 'en')}°` } });
    const lang = L();
    const cell = (v: string, cls = ''): HTMLElement => el('td', { class: `fin-v ${cls}`, style: 'padding:4px 8px' }, v);
    const head = (v: string): HTMLElement => el('td', { class: 'fin-k', style: 'padding:0 8px' }, v);
    setActions();
    topEl.append(
      el('div', { class: 'fin-label', style: 'margin-top:10px' }, T(S.f1Done)),
      el(
        'table',
        { style: 'border-collapse:collapse;width:100%;margin-bottom:6px' },
        el('tr', null, el('td'), head(T(S.f1Max)), head(T(S.f1Over)), head(T(S.f1Level))),
        el('tr', null, el('td', { class: 'fin-k', style: 'padding:4px 8px 4px 0' }, T(S.f1You)), cell(`${num(maxTilt, 1, lang)}°`, held ? 'teal' : 'accent'), cell(`${num(over, 1, lang)} s`, held ? 'teal' : 'accent'), cell('—')),
        el('tr', null, el('td', { class: 'fin-k', style: 'padding:4px 8px 4px 0' }, T(S.f1Ctrl)), cell(`${num(ctrlRun.max, 1, lang)}°`, 'teal'), cell(`${num(ctrlRun.over, 1, lang)} s`, 'teal'), cell(settle >= 0 ? `${num(settle, 1, lang)} s` : '—', 'teal')),
      ),
      el('p', { style: 'font-size:13px;margin:6px 0 0' }, T(held ? S.f1EmiGood : S.f1Emi)),
    );
    stateLine.textContent = '';
    ctx.audio.play('success', { volume: 0.5 });
    // „… then it sets back down with a thud“ (the arms catch it)
    ctx.after(1.2, () => {
      if (phase === 'result') void hoverTo(env, false);
    });
    const lines = [held ? S.f1EmiGood : S.f1Emi];
    if (ctx.mode === 'entscheider') lines.push(S.f1EmiDecider);
    lines.push(S.f1EmiNext);
    void env.say(lines, 5, { interrupt: true });
  };

  const finish = (): void => {
    if (!active) return;
    active = false;
    // the island sets back down onto its keel block, the arms catch it (also when you leave early)
    if (hoverState(env).h > 0.01 || hoverState(env).busy) void hoverTo(env, false);
    if (env.f1Def) ctx.game.challenge(env.f1Def); // no retry once the panel is closed
    setIce(false);
    roar.stop();
    ctx.island.setTilt(0, 0);
    env.busy = false;
    env.refreshObjective();
    drawLeitstandScreen(env, 0, 0, ctx.i18n.resolve({ de: 'Regler: EIN · 1000 Hz', en: 'Controller: ON · 1000 Hz' }), null, null);
  };

  exitOperate = ctx.player.enterOperate({
    title: S.f1Title,
    cameraPose: { position: pose.position.toArray() as [number, number, number], lookAt: pose.lookAt.toArray() as [number, number, number] },
    panelPosition: 'right',
    panel: (root) => {
      buildPanel(root);
      return () => {
        /* DOM removed by the engine */
      };
    },
    onPointer: (e) => {
      if (e.type === 'move' || e.type === 'down') {
        ndc.x = e.ndc.x;
        ndc.y = e.ndc.y;
      }
    },
    onExit: finish,
  });

  // „Nochmal ans Steuer": [R] on the result banner restarts the run while the panel is open
  if (env.f1Def) env.f1 = ctx.game.challenge({ ...env.f1Def, retry: () => begin() });
  void env.say([S.f1Intro], 4, { interrupt: true });
  // test bot: presses Start and steers toward the ball after `react` seconds
  const botHist: [number, number][] = [];
  if (bot) ctx.after(0.6, () => begin());

  // ── per-frame loop ───────────────────────────────────────────────────────
  env.tick((dtRaw) => {
    if (!active) return false;
    const dt = Math.min(0.05, dtRaw);
    const lang = L();
    if (bot) {
      const sxb = -plant.theta[0],
        szb = plant.theta[1];
      botHist.push([sxb * right.x + szb * right.z, sxb * fwd.x + szb * fwd.z]);
      const lag = Math.max(1, Math.round(bot.react / Math.max(1e-3, dt)));
      const a = botHist[Math.max(0, botHist.length - 1 - lag)],
        b0 = botHist[Math.max(0, botHist.length - 2 - lag)];
      ndc.x = THREE.MathUtils.clamp(bot.kp * a[0] + (bot.kd * (a[0] - b0[0])) / Math.max(1e-3, dt), -1, 1);
      ndc.y = THREE.MathUtils.clamp(bot.kp * a[1] + (bot.kd * (a[1] - b0[1])) / Math.max(1e-3, dt), -1, 1);
      if (botHist.length > 600) botHist.splice(0, 300);
    }
    // thrust command from the cursor (saturates at half the screen)
    const mag = Math.hypot(ndc.x, ndc.y);
    const sat = mag > 1e-4 ? Math.min(1, mag / 0.5) / mag : 0;
    cmd[0] = ndc.x * sat;
    cmd[1] = ndc.y * sat;
    let uR = 0,
      uP = 0;
    if (phase === 'count') {
      tPhase += dt;
      const left = Math.ceil(countS - tPhase);
      countEl.textContent = left > 0 && left <= 3 ? String(left) : '';
      stateLine.textContent = left > 3 ? T(S.f1Rise) : `${T(S.f1Count)} ${Math.max(1, left)} s`;
      if (tPhase >= countS) {
        phase = 'live';
        tPhase = 0;
        countEl.textContent = '';
        stateLine.textContent = T(S.f1Live);
        ctx.audio.play('beep', { volume: 0.5 });
      }
    } else if (phase === 'live' || phase === 'takeover') {
      if (phase === 'live') {
        // lift point on the ground plane → roll / pitch torque (see sim: roll+ = +X side up)
        const lx = cmd[0] * right.x + cmd[1] * fwd.x;
        const lz = cmd[0] * right.z + cmd[1] * fwd.z;
        uR = F1.uMax * lx;
        uP = -F1.uMax * lz;
      } else [uR, uP] = plant.takeover();
      plant.step(dt, uR, uP);
      tPhase += dt;
      const tilt = Math.max(Math.abs(plant.theta[0]), Math.abs(plant.theta[1]));
      if (phase === 'live') {
        maxTilt = Math.max(maxTilt, tilt);
        if (tilt >= 3) over += dt;
        // gust warnings: you hear the wind before the island leans
        for (const gst of F1_GUSTS) if (tPhase - dt < gst.t0 && tPhase >= gst.t0) ctx.audio.play('whoosh', { volume: 0.35 + gst.s * 0.4, pitch: 0.7 });
        // the toy model's hard stop: a metallic knock
        if (tilt >= F1.bumper - 0.05 && !atStop) {
          atStop = true;
          ctx.audio.play('thud', { volume: 0.55 });
          ctx.player.shake(0.035, 0.18);
        } else if (tilt < F1.bumper - 0.4) atStop = false;
        stTime.textContent = `${num(Math.max(0, F1.duration - tPhase), 1, lang)} s`;
        if (tPhase >= F1.duration) {
          phase = 'takeover';
          tPhase = 0;
          stateLine.textContent = T(S.f1Takeover);
          stateLine.className = 'fin-state warn';
          ctx.audio.play('beep', { volume: 0.6, pitch: 1.4 });
        }
      } else {
        if (tilt < 0.3) {
          if (settleCandidate < 0) settleCandidate = tPhase;
        } else settleCandidate = -1;
        settle = settleCandidate;
        if (tPhase >= TAKEOVER_S) showResult();
      }
      // world: tilt, crates, sound
      ctx.island.setTilt(plant.theta[0], plant.theta[1]);
      // roll+ lifts the +X side → things slide to −X; pitch+ lifts −Z (north) → slide to +Z
      const ax = 4 * plant.theta[0] * DEG,
        az = 4 * plant.theta[1] * DEG;
      room.setCrateGravity([-9.81 * Math.sin(ax), -9.81 * Math.cos(ax) * Math.cos(az), 9.81 * Math.sin(az)]);
      const effort = Math.min(1, Math.hypot(plant.applied[0], plant.applied[1]) / F1.uMax);
      roar.setVolume(0.2 + effort * 0.9);
      roar.setPitch(0.9 + effort * 0.35);
      histAcc += dt;
      while (histAcc >= 1 / HIST_HZ) {
        histAcc -= 1 / HIST_HZ;
        hist.push(tilt);
      }
      stTilt.textContent = `${num(tilt, 2, lang)}°`;
      stTilt.className = `fin-v ${tilt >= 3 ? 'accent' : 'teal'}`;
      stThrust.textContent = `${Math.round(effort * 100)} %`;
    }
    // instrument: ball (low side) and thrust in the operator's frame
    const sx = -plant.theta[0],
      sz = plant.theta[1];
    const ball: [number, number] = [sx * right.x + sz * right.z, sx * fwd.x + sz * fwd.z];
    const thrustShown: [number, number] | null = phase === 'live' || phase === 'ready' || phase === 'count' ? [cmd[0], cmd[1]] : null;
    const g = lib.prep();
    drawLibelle(g, 116, 116, 112, ball, thrustShown, { limit: 3, range: 4, px: 13 });
    if (horizon) drawHorizon(horizon.prep(), 232, 92, plant.theta[0], plant.theta[1], lang);
    const gh = his.prep();
    drawHistory(gh, 0, 0, 340, 70, hist, F1.duration + TAKEOVER_S, 1 / HIST_HZ, { px: 12, yMax: 5, split: phase === 'takeover' || phase === 'result' ? F1.duration : undefined });
    screenAcc += dt;
    if (screenAcc > 1 / 15) {
      screenAcc = 0;
      const label = phase === 'live' ? T(S.f1Live) : phase === 'takeover' ? T(S.f1Takeover) : phase === 'result' ? T(S.f1Done) : T(S.f1Title).replace('// ', '');
      drawLeitstandScreen(env, plant.theta[0], plant.theta[1], label, thrustShown, ball);
    }
    return true;
  });
}
