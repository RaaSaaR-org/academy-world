/**
 * Station A „Balancieren" (Probieren): hand-pushed cart-pole on the Balancier-Bahn.
 * A/D push the cart with ±20 N (50 ms ramp; GDD 40 N, see HAND.force); 1/2/3 pick the pole length 0.5/1/2 m; G cycles
 * Erde/Mars/Mond; R resets. RK4 at a fixed 1 kHz, M = 5 kg, uniform rod m = 1 kg, b = 0.5 N·s/m.
 * Felt first: the long pole and the Moon give you time; the short pole tips faster than you react.
 */
import * as THREE from 'three';
import { css, type InfoCardSpec, type ZoneContext } from '@/core/zones';
import { DEG, GRAVITIES, HAND, POLE_LENGTHS, rk4, tippingTime, type Plant } from './sim';
import { LAYOUT } from './world';
import { button, canvasChip, el, fmt, sectionLabel, segmented, signed } from './ui';
import type { Shared } from './shared';

type Phase = 'ready' | 'run' | 'fallen' | 'rail' | 'regler';
/**
 * Earth is the lesson, not a goal (Phase 5): after an Earth fall the robot's controller takes the same
 * cart, the same pole and the same 20 N, corrects 1000×/s and catches two 30 N pushes (the Schubs of
 * station B). Full-state feedback F = 2x + 5ẋ + 300θ + 50θ̇, clamped to ±20 N: holds all nine
 * configurations with ≤ 8 N, also 40 N pushes (artifacts/phase5/zones/calib/a-regler*.ts).
 */
const REGLER_K = [2, 5, 300, 50] as const;
const REGLER_T = 3.6;
const REGLER_PUSHES: [number, number][] = [
  [1.3, 30],
  [2.5, -30],
];
const RAIL_Y = LAYOUT.bahn.h + 0.065;
const X0 = (LAYOUT.bahn.x0 + LAYOUT.bahn.x1) / 2;
const Z0 = LAYOUT.bahn.z;

export interface Balance {
  update(dt: number): void;
  operate(): void;
  onKey(code: string): void;
  /** debug: let an autopilot hold the pole through the real input path */
  autopilot(on: boolean): void;
  setConfig(lengthIdx: number, gravityIdx: number): void;
  solve(): void;
  /** test hook: the stamp route plus 2 m Mars and 1 m Moon held for 9.5 s (★★★) */
  stars3(): void;
  readonly state: { phase: Phase; t: number; theta: number; omega: number; x: number; v: number; li: number; gi: number; tried: number[]; longest: number };
}

export function buildBalance(S: Shared): Balance {
  const ctx: ZoneContext = S.ctx;
  const M = ctx.materials;
  const det = ctx.groups.detail;
  const geos: THREE.BufferGeometry[] = [];
  const texs: THREE.Texture[] = [];
  const mats: THREE.Material[] = [];
  ctx.onDispose(() => {
    geos.forEach((g) => g.dispose());
    texs.forEach((t) => t.dispose());
    mats.forEach((m) => m.dispose());
  });
  const G = <T extends THREE.BufferGeometry>(g: T): T => (geos.push(g), g);

  // ── meshes ────────────────────────────────────────────────────────────────
  const cart = new THREE.Group();
  cart.position.set(X0, RAIL_Y, Z0);
  det.add(cart);
  const body = new THREE.Mesh(G(new THREE.BoxGeometry(0.38, 0.13, 0.3)), S.look.carbon);
  body.position.y = 0.035 + 0.065;
  const cover = new THREE.Mesh(G(new THREE.BoxGeometry(0.34, 0.03, 0.26)), M.shell);
  cover.position.y = 0.035 + 0.13 + 0.015;
  const wheelGeo = G(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12).rotateX(Math.PI / 2));
  const wheels = new THREE.InstancedMesh(wheelGeo, M.rubber, 4);
  const m4 = new THREE.Matrix4();
  [-0.12, 0.12].forEach((x, i) => [-0.12, 0.12].forEach((z, j) => wheels.setMatrixAt(i * 2 + j, m4.makeTranslation(x, 0.035, z))));
  cart.add(body, cover, wheels);
  const PIV = 0.23;
  const pole = new THREE.Group();
  pole.position.y = PIV;
  cart.add(pole);
  const shaft = new THREE.Mesh(G(new THREE.CylinderGeometry(0.016, 0.016, 1, 10).translate(0, 0.5, 0)), S.look.alu);
  const tip = new THREE.Mesh(G(new THREE.SphereGeometry(0.035, 14, 10)), M.standard({ color: 0xf5f5f4, roughness: 0.35, metalness: 0.05 }));
  const ring = new THREE.Mesh(G(new THREE.TorusGeometry(0.045, 0.012, 8, 20)), M.orangePaint);
  ring.position.z = 0.03;
  const axle = new THREE.Mesh(G(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 8).rotateX(Math.PI / 2)), M.steel);
  pole.add(shaft, tip, ring, axle);
  shaft.castShadow = true;

  // tip trail
  const TRAIL = 36;
  const trailPos = new Float32Array(TRAIL * 3);
  const trailGeo = G(new THREE.BufferGeometry());
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
  const trailMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0x2dd4bf).multiplyScalar(1.6), transparent: true, opacity: 0.9, toneMapped: false });
  mats.push(trailMat);
  const trail = new THREE.Line(trailGeo, trailMat);
  trail.frustumCulled = false;
  det.add(trail);
  const tipW = new THREE.Vector3();
  let trailAcc = 0;
  let trailInit = false;

  // operator lever on the pedestal
  const lever = new THREE.Group();
  const leverStick = new THREE.Mesh(G(new THREE.CylinderGeometry(0.02, 0.025, 0.24, 8).translate(0, 0.12, 0)), M.steel);
  const leverKnob = new THREE.Mesh(G(new THREE.SphereGeometry(0.05, 14, 10)), M.accentOrange);
  leverKnob.position.y = 0.25;
  lever.add(leverStick, leverKnob);
  lever.position.set(LAYOUT.bahn.ped[0], 1.0, LAYOUT.bahn.ped[2]);
  det.add(lever);

  // plinth display (the GDD's ERDE / MARS / MOND sign + timer)
  const DC = document.createElement('canvas');
  DC.width = 1024;
  DC.height = 144;
  const dg = DC.getContext('2d')!;
  const dtex = new THREE.CanvasTexture(DC);
  dtex.colorSpace = THREE.SRGBColorSpace;
  dtex.anisotropy = 4;
  texs.push(dtex);
  const dmat = new THREE.MeshBasicMaterial({ map: dtex, color: 0xdcdcdc, toneMapped: false });
  mats.push(dmat);
  const disp = new THREE.Mesh(G(new THREE.PlaneGeometry(6.2, 0.8725)), dmat);
  disp.position.set(X0, 0.46, Z0 + 0.455);
  det.add(disp);
  let dispKey = '';

  // ── state ─────────────────────────────────────────────────────────────────
  const s = new Float64Array(4);
  const plant: Plant = { M: HAND.M, m: HAND.m, L: 1, b: HAND.b, g: 9.81 };
  type Saved = { best: Record<string, number>; tried: number[]; moon: boolean; longest: number; fails: number; ach2?: boolean; ach3?: boolean; earth?: boolean };
  const saved = ctx.progress.get<Saved>('a', { best: {}, tried: [0, 0, 0], moon: false, longest: 0, fails: 0 });
  // „First success first" (plan §4.3): a first visit opens on the 2 m pole on the Moon (τ 0.91 s), then EMI
  // suggests the Earth; later visits open on the rc4 default (1 m, Earth)
  const firstVisit = saved.tried.every((v) => v === 0) && saved.longest === 0;
  const st = {
    li: firstVisit ? 2 : 1,
    gi: firstVisit ? 2 : 0,
    /** EMI's Earth suggestion after the first 5 s run (first visit only) */
    earthNudge: !firstVisit,
    phase: 'ready' as Phase,
    readyT: 0,
    t: 0,
    F: 0,
    acc: 0,
    fallT: 0,
    clacked: false,
    best: saved.best,
    tried: saved.tried.slice(0, 3),
    moon: saved.moon,
    longest: saved.longest,
    fails: saved.fails,
    shortLine: false,
    moonLine: false,
    tipLine: false,
    operateT: 0,
    operating: false,
    holdL: false,
    holdR: false,
    auto: false,
    ticks: 0,
    secTick: 0,
    ach2: !!saved.ach2,
    ach3: !!saved.ach3,
    lastReason: -100,
    reasonIdx: 0,
    /** the player's corrections (key presses) in this run, for the Earth comparison */
    presses: 0,
    lastDir: 0,
    /** Earth comparison: pending after the fall, then the controller's run */
    reglerPending: false,
    reglerT: 0,
    reglerTicks: 0,
    reglerPush: 0,
    earthSeen: !!saved.earth,
    earthLine: false,
    /** Earth falls (with at least one key press) since the controller last showed how */
    earthTries: 0,
  };
  const persist = (): void => ctx.progress.set('a', { best: st.best, tried: st.tried, moon: st.moon, longest: st.longest, fails: st.fails, ach2: st.ach2, ach3: st.ach3, earth: st.earthSeen } satisfies Saved);

  // ── „Stab-Challenge" (FUN-PLAN R1) ────────────────────────────────────────
  // ★ the stamp (each length ≥ 2 s + one 5 s run) · ★★ 2 m pole on Mars ≥ 8 s · ★★★ 1 m pole on the Moon ≥ 8 s.
  // Calibrated with a human-like bot on this plant (0.25 s reaction, 80 ms key presses, 60 Hz decisions,
  // perception noise; artifacts/phase4/zones-a/calib/): no Earth configuration reaches 8 s (2 m Earth: max
  // 3.4 s), 2 m Mars ≥ 8 s in 40 % of tries, 1 m Moon ≥ 8 s in 5 % (0.2 s reaction: 83 % / 93 %).
  const STAR2 = { li: 2, gi: 1, t: 8 },
    STAR3 = { li: 1, gi: 2, t: 8 };
  const starsNow = (): 0 | 1 | 2 | 3 => (!ctx.pass.has('balancieren') ? 0 : ((1 + (st.ach2 ? 1 : 0) + (st.ach2 && st.ach3 ? 1 : 0)) as 1 | 2 | 3));
  const ch = ctx.game.challenge({
    id: 'balancieren',
    title: ctx.i18n.text('game.a.title'),
    metric: { label: ctx.i18n.text('game.a.metric'), unit: 's', better: 'higher', digits: 1 },
    goals: [{ text: ctx.i18n.text('game.a.g1') }, { text: ctx.i18n.text('game.a.g2') }, { text: ctx.i18n.text('game.a.g3') }],
    lesson: ctx.i18n.text('game.a.lesson'),
    why: () => cardA(),
    retry: () => resetRun(),
  });
  const FAIL_KEYS = ['game.a.failLate', 'game.a.failTap'];
  const key = (li: number, gi: number): string => `${POLE_LENGTHS[li]}@${GRAVITIES[gi].id}`;

  const resetRun = (): void => {
    plant.L = POLE_LENGTHS[st.li];
    plant.g = GRAVITIES[st.gi].g;
    s[0] = 0;
    s[1] = 0;
    s[2] = (Math.random() < 0.5 ? -1 : 1) * HAND.theta0;
    s[3] = 0;
    st.F = 0;
    st.t = 0;
    st.phase = 'ready';
    st.readyT = 0;
    st.ticks = 0;
    st.clacked = false;
    st.acc = 0;
    st.presses = 0;
    st.lastDir = 0;
    st.reglerPending = false;
    st.reglerT = 0;
    shaft.scale.y = plant.L;
    tip.position.y = plant.L;
    trailInit = false;
    uiRefresh?.();
  };

  const endRun = (kind: 'fallen' | 'rail'): void => {
    st.phase = kind;
    st.fallT = 0;
    st.fails++;
    st.tried[st.li] += st.t;
    if (st.gi === 2) st.moon = true;
    const k = key(st.li, st.gi);
    const prev = st.best[k] ?? 0;
    if (st.t > prev) {
      st.best[k] = st.t;
      // a per-configuration best: a popup at the tip (the result banner covers new stars)
      if (st.t >= 1 && st.operating) ctx.game.juice.popup(tip, ctx.i18n.text('toast.best', { t: `${fmt(ctx.i18n.lang, st.t, 1)} s` }), { tone: 'accent', seconds: 2 });
      ctx.pass.setBest(`balance.${POLE_LENGTHS[st.li]}m.${GRAVITIES[st.gi].id}`, st.t, 'higher');
    }
    st.longest = Math.max(st.longest, st.t);
    persist();
    const at: [number, number, number] = [X0 + s[0], 1.2, Z0];
    if (kind === 'rail') ctx.audio.play('thud', { at, pitch: 1.6, volume: 0.9 });
    // Earth is the lesson: no fail flash, the controller shows how (after the fall settles)
    const earthLesson = st.gi === 0 && kind === 'fallen' && st.operating && !st.auto;
    // the controller shows how after the first Earth fall, then after every third real try (A/D skips it)
    if (earthLesson && st.presses > 0) st.earthTries++;
    if (earthLesson && (!st.earthSeen || st.earthTries >= 3)) {
      st.reglerPending = true;
      st.earthTries = 0;
    }
    // EMI beats
    if (!st.earthNudge && st.gi === 2 && st.t >= 5 && st.operating) {
      st.earthNudge = true;
      S.emiSay(ctx.i18n.text('emi.aMoonFirst'), true);
    } else if (earthLesson && !st.earthLine) {
      st.earthLine = true;
      S.emiSay(ctx.i18n.text('emi.aEarth'), true);
    } else if (st.li === 0 && st.gi === 0 && !st.shortLine && st.t < 1.2) {
      st.shortLine = true;
      S.emiSay(ctx.i18n.text('emi.aShortFail'), true);
    } else if (st.fails >= 6 && !st.moonLine && !st.moon && st.gi !== 2) {
      st.moonLine = true;
      S.emiSay(ctx.i18n.text('emi.aMoon'), true);
    } else if (st.fails >= 12 && !st.tipLine && st.longest < 5) {
      st.tipLine = true;
      S.emiSay(ctx.i18n.text('emi.aTip'), true);
    }
    // stars: a new achievement (or the stamp) gives the result banner; any other run a short fail flash
    const before = starsNow();
    if (st.li === STAR2.li && st.gi === STAR2.gi && st.t >= STAR2.t) st.ach2 = true;
    if (st.li === STAR3.li && st.gi === STAR3.gi && st.t >= STAR3.t) st.ach3 = true;
    persist();
    checkStamp();
    const after = starsNow();
    const tTxt = `${fmt(ctx.i18n.lang, st.t, 1)} s`;
    if (after > before) {
      const cfg = `${fmt(ctx.i18n.lang, POLE_LENGTHS[st.li], 1)} m · ${ctx.t(`a.${GRAVITIES[st.gi].id}`)}`;
      ch.submit(Math.round(st.t * 10) / 10, { stars: after, detail: cfg });
      ctx.game.juice.burst(tip, { tone: 'teal', count: 50, spread: 0.6 });
      ctx.game.juice.cue('great');
    } else if (earthLesson) {
      // your run as a measurement, side by side with the controller's that follows
      ctx.game.juice.popup(tip, ctx.i18n.text('game.a.earthPop', { t: tTxt, n: st.presses }), { tone: 'muted', seconds: 2.2 });
    } else if (st.operating) {
      // a rotating reason at most every 6 s, otherwise just the number
      const now = ctx.time.elapsed;
      if (now - st.lastReason >= 6) {
        st.lastReason = now;
        const k = kind === 'rail' ? 'game.a.failRail' : FAIL_KEYS[st.reasonIdx++ % FAIL_KEYS.length];
        ch.fail(ctx.i18n.text(k, { t: tTxt }));
      } else ch.fail(tTxt);
    }
    uiRefresh?.();
  };

  const checkStamp = (): void => {
    if (ctx.pass.has('balancieren')) return;
    const allTried = st.tried.every((v) => v >= 2);
    if (!allTried || st.longest < 5) return;
    award(false);
  };

  const bestFor = (li: number): { t: number; gi: number } | null => {
    let best: { t: number; gi: number } | null = null;
    for (let gi = 0; gi < 3; gi++) {
      const t = st.best[key(li, gi)];
      if (t != null && (!best || t > best.t)) best = { t, gi };
    }
    return best;
  };

  const award = (skipped: boolean): void => {
    const value = (lang: 'de' | 'en'): string => {
      const show = (li: number): string => {
        const b = bestFor(li);
        if (!b) return '–';
        const g = b.gi === 0 ? '' : ` (${lang === 'de' ? ['Erde', 'Mars', 'Mond'][b.gi] : ['Earth', 'Mars', 'Moon'][b.gi]})`;
        return `${fmt(lang, b.t, 1)} s${g}`;
      };
      const moon = st.moon ? (lang === 'de' ? ' · Mond probiert' : ' · Moon tried') : '';
      return `2 m: ${show(2)} · 0,5 m: ${show(0)}${moon}`.replace('0,5 m', lang === 'de' ? '0,5 m' : '0.5 m');
    };
    const curve = [0, 1, 2].map((li) => bestFor(li)?.t ?? 0);
    const isNew = ctx.pass.award('balancieren', skipped ? { skipped: true, value: { de: 'übersprungen', en: 'skipped' } } : { value: { de: value('de'), en: value('en') }, curve });
    if (!isNew) return;
    S.refreshObjective();
    if (!skipped) S.emiSay(ctx.i18n.text(ctx.pass.has('regler-takt') ? 'emi.aDoneLast' : 'emi.aDone'), true);
  };

  const cardA = (): InfoCardSpec => {
    const T = ctx.i18n.text;
    const lang = ctx.i18n.lang;
    const b2 = bestFor(2),
      b05 = bestFor(0);
    return {
      eyebrow: T('card.a.eyebrow'),
      title: T('card.a.title'),
      body: [T('card.a.entdecker'), T('card.a.curious')],
      // the decision box only in Entscheider mode (keeps the Entdecker card short)
      entscheider: { body: [T('card.a.entscheider'), T('card.a.curious')], forDecisionMakers: { title: T('card.a.dmTitle'), bullets: [T('card.a.dm2')] } },
      metrics: [
        { label: T('card.a.mBest2'), value: b2 ? fmt(lang, b2.t, 1) : '–', unit: 's' },
        { label: T('card.a.mBest05'), value: b05 ? fmt(lang, b05.t, 1) : '–', unit: 's' },
        { label: T('card.a.mTau'), value: fmt(lang, tippingTime(0.5, 9.81), 2), unit: 's' },
      ],
      diagram: {
        aspect: 16 / 8,
        caption: T('card.a.diagram'),
        draw: (g, w, h) => {
          const padL = 40,
            padB = 26,
            padT = 12,
            padR = 70;
          const X = (L: number): number => padL + ((L - 0.25) / 1.85) * (w - padL - padR);
          const Y = (t: number): number => h - padB - (t / 1.0) * (h - padB - padT);
          g.font = '11px "Geist Mono", monospace';
          g.strokeStyle = css.borderSubtle;
          g.fillStyle = css.textMuted;
          for (const t of [0, 0.25, 0.5, 0.75, 1]) {
            g.beginPath();
            g.moveTo(padL, Y(t));
            g.lineTo(w - padR, Y(t));
            g.stroke();
            const lab = `${fmt(lang, t, 2)} s`;
            g.fillText(lab, 2, Y(t) + 4);
          }
          for (const L of [0.5, 1, 2]) {
            g.fillText(`${fmt(lang, L, 1)} m`, X(L) - 12, h - 8);
          }
          // human reaction ~0.2 s
          g.strokeStyle = css.orange;
          g.setLineDash([6, 4]);
          g.beginPath();
          g.moveTo(padL, Y(0.2));
          g.lineTo(w - padR, Y(0.2));
          g.stroke();
          g.setLineDash([]);
          g.fillStyle = css.orange;
          g.fillText(lang === 'de' ? 'Reaktion ≈ 0,2 s' : 'reaction ≈ 0.2 s', w - padR + 4, Y(0.2) + 4);
          const cols = [css.text, css.teal, css.textSecondary];
          GRAVITIES.forEach((gr, i) => {
            g.strokeStyle = cols[i];
            g.lineWidth = 2;
            g.beginPath();
            for (let k = 0; k <= 40; k++) {
              const L = 0.25 + (1.85 * k) / 40;
              const x = X(L),
                y = Y(Math.min(1, tippingTime(L, gr.g)));
              if (k) g.lineTo(x, y);
              else g.moveTo(x, y);
            }
            g.stroke();
            g.fillStyle = cols[i];
            const name = ctx.t(`a.${gr.id}`);
            g.fillText(name, w - padR + 4, Y(Math.min(1, tippingTime(2.1, gr.g))) + 4);
          });
        },
      },
    };
  };

  // ── display ───────────────────────────────────────────────────────────────
  const drawDisplay = (): void => {
    const lang = ctx.i18n.lang;
    const stat = st.phase === 'ready' ? (st.readyT > 0.6 ? ctx.t('a.go') : ctx.t('a.ready')) : st.phase === 'run' ? '' : st.phase === 'regler' ? ctx.t('a.regler') : st.phase === 'fallen' ? ctx.t('a.fell') : ctx.t('a.rail');
    const k = `${lang}|${st.li}|${st.gi}|${fmt(lang, st.t, 1)}|${stat}|${Math.round(s[2] / DEG)}`;
    if (k === dispKey) return;
    dispKey = k;
    const g = dg;
    g.fillStyle = '#141414';
    g.fillRect(0, 0, 1024, 144);
    g.fillStyle = '#1F1F1F';
    g.fillRect(4, 4, 1016, 136);
    const grad = g.createLinearGradient(0, 0, 1024, 0);
    grad.addColorStop(0, css.orange);
    grad.addColorStop(1, css.teal);
    g.fillStyle = grad;
    g.fillRect(4, 4, 1016, 2);
    g.font = '500 19px "Geist Mono", monospace';
    g.fillStyle = css.textSecondary;
    g.fillText(ctx.t('a.title'), 20, 34);
    // timer
    g.font = '500 66px "Geist Mono", monospace';
    g.fillStyle = st.phase === 'run' ? css.text : st.phase === 'regler' ? css.teal : st.phase === 'ready' ? css.textSecondary : css.orange;
    g.fillText(`${fmt(lang, st.t, 2)} s`, 20, 112);
    g.font = '600 24px "Space Grotesk", sans-serif';
    g.fillStyle = st.phase === 'fallen' || st.phase === 'rail' ? css.orange : css.teal;
    g.fillText(stat.toUpperCase(), 290, 112);
    // ERDE · MARS · MOND
    const names = GRAVITIES.map((gr) => ctx.t(`a.${gr.id}`).toUpperCase());
    let x = 520;
    g.font = '700 30px "Space Grotesk", sans-serif';
    names.forEach((n, i) => {
      const on = i === st.gi;
      const w = g.measureText(n).width;
      g.fillStyle = on ? css.text : css.textMuted;
      g.fillText(n, x, 66);
      if (on) {
        g.fillStyle = css.orange;
        g.fillRect(x, 74, w, 3);
      }
      x += w + 28;
    });
    g.font = '500 22px "Geist Mono", monospace';
    g.fillStyle = css.textSecondary;
    const L = POLE_LENGTHS[st.li];
    g.fillText(`L = ${fmt(lang, L, 1)} m · τ = ${fmt(lang, tippingTime(L, GRAVITIES[st.gi].g), 2)} s`, 520, 114);
    canvasChip(g, 1004 - 130, 14, 'SIM · LIVE', 'sim', 15);
    dtex.needsUpdate = true;
  };

  // ── operate panel ─────────────────────────────────────────────────────────
  let uiRefresh: (() => void) | null = null;
  let timerEl: HTMLElement | null = null;
  let thetaEl: HTMLElement | null = null;
  const operate = (): void => {
    S.stationActive = 'a';
    st.operating = true;
    st.operateT = 0;
    resetRun();
    S.emiDrive([4.4, 0, 12.6]);
    ctx.player.enterOperate({
      title: ctx.i18n.text('a.title'),
      // frontal, 4 m back, aimed 17° right: the whole rail fits between the screen edge and the docked panel
      cameraPose: { position: [X0, 1.85, Z0 + 4.0], lookAt: [X0 + 4.0 * Math.tan(17 * DEG), 1.9, Z0] },
      panelPosition: 'right',
      panel: (root) => {
        root.dataset.rg = 'panel-a';
        const head = el('div', '', undefined, 'display:flex;justify-content:space-between;align-items:center;gap:8px');
        head.append(el('div', 'eyebrow', ctx.t('balancieren.title')), ctx.ui.chip('sim', ctx.t('a.tau')));
        root.append(head);
        const chips = ch.chips();
        chips.style.margin = '8px 0 2px';
        root.append(chips);
        const big = el('div', '', undefined, 'display:flex;align-items:baseline;gap:14px;margin:6px 0 2px');
        timerEl = el('div', 'mono', '0,00 s', 'font-size:40px;color:var(--text);letter-spacing:.01em');
        timerEl.dataset.rg = 'a-timer';
        thetaEl = el('div', 'mono', 'θ +1,5°', 'font-size:16px;color:var(--teal)');
        big.append(timerEl, thetaEl);
        root.append(big);
        const status = el('div', 'mono', '', 'font-size:12.5px;color:var(--text-2);min-height:18px');
        status.dataset.rg = 'a-status';
        root.append(status);
        root.append(sectionLabel(ctx.t('a.length')));
        const len = segmented(
          POLE_LENGTHS.map((v, i) => ({ value: i, label: fmt(ctx.i18n.lang, v, 1) })),
          st.li,
          (v) => setConfig(v, st.gi),
          'len',
        );
        root.append(len.el);
        // gravity: the three bodies name themselves (≤ 35 words at open); the label is the tooltip
        const grav = segmented(
          GRAVITIES.map((gr, i) => ({ value: i, label: ctx.t(`a.${gr.id}`) })),
          st.gi,
          (v) => setConfig(st.li, v),
          'grav',
        );
        grav.el.title = ctx.t('a.gravity');
        grav.el.style.marginTop = '6px';
        root.append(grav.el);
        // τ formula + note live behind ⓘ (why()); the selectors carry g as a tooltip
        const tau = el('div', 'mono', '', 'font-size:12px;color:var(--text-2);margin-top:6px;display:none');
        root.append(tau);
        // mouse push buttons (hold)
        const pushRow = el('div', 'op-row');
        const mk = (label: string, side: 'L' | 'R'): HTMLButtonElement => {
          const b = button(label, 'btn', () => {}, `a-push-${side}`);
          const set = (v: boolean): void => {
            if (side === 'L') st.holdL = v;
            else st.holdR = v;
          };
          b.onpointerdown = (e) => {
            e.preventDefault();
            set(true);
          };
          b.onpointerup = b.onpointerleave = () => set(false);
          b.style.flex = '1';
          b.style.justifyContent = 'center';
          return b;
        };
        pushRow.append(mk('◀ A', 'L'), mk('D ▶', 'R'));
        root.append(pushRow);
        // the best-time grid lives behind a „Bestwerte" tab (plan §4.3: ≤ 35 words at open)
        const grid = el('div', 'mono', undefined, 'display:none;grid-template-columns:52px repeat(3,1fr);gap:3px 8px;font-size:12px;margin-top:4px');
        const bestBtn = button(`${ctx.t('a.best')} ▸`, 'btn ghost', () => {
          const open = grid.style.display === 'none';
          grid.style.display = open ? 'grid' : 'none';
          bestBtn.textContent = `${ctx.t('a.best')} ${open ? '▾' : '▸'}`;
        }, 'a-best');
        bestBtn.style.cssText += ';margin-top:8px;padding:4px 10px;font-size:12px';
        root.append(bestBtn, grid);
        const goal = el('div', '', '', 'font-size:12px;color:var(--text-2);margin-top:8px;line-height:1.5');
        goal.dataset.rg = 'a-goal';
        root.append(goal);
        const actions = el('div', 'op-row');
        actions.append(button(ctx.t('a.reset'), 'btn', () => resetRun(), 'a-reset'));
        actions.append(button('ⓘ', 'btn ghost', () => void ctx.ui.card(cardA()), 'a-info'));
        const skip = button(ctx.t('a.skip'), 'btn ghost', () => award(true), 'a-skip');
        if (ctx.mode === 'entscheider') actions.append(skip);
        root.append(actions);
        // keys: on the buttons themselves (◀ A, D ▶, Neu (R)) and in the push hint — no extra legend line
        uiRefresh = () => {
          const lang = ctx.i18n.lang;
          len.set(st.li);
          grav.set(st.gi);
          const L = POLE_LENGTHS[st.li];
          tau.textContent = `${ctx.t('a.tau')} = ${fmt(lang, tippingTime(L, GRAVITIES[st.gi].g), 2)} s`;
          status.textContent =
            st.phase === 'ready'
              ? st.reglerPending
                ? ''
                : st.readyT > 0.6
                  ? ctx.t('a.go')
                  : ctx.t('a.ready')
              : st.phase === 'regler'
                ? ctx.t('a.reglerStatus', { n: ctx.i18n.num(st.reglerTicks, 0) })
                : st.phase === 'fallen'
                  ? st.reglerPending
                    ? ctx.t('a.earthNext')
                    : `${ctx.t('a.fell')} · R`
                  : st.phase === 'rail'
                    ? `${ctx.t('a.rail')} · R`
                    : '';
          status.style.color = st.phase === 'regler' || st.reglerPending ? 'var(--teal)' : st.phase === 'fallen' || st.phase === 'rail' ? 'var(--orange)' : 'var(--text-2)';
          grid.replaceChildren(el('span', '', ''), ...GRAVITIES.map((gr) => el('span', '', ctx.t(`a.${gr.id}`), 'color:var(--text-3)')));
          POLE_LENGTHS.forEach((Lv, li) => {
            grid.append(el('span', '', fmt(lang, Lv, 1), 'color:var(--text-3)'));
            GRAVITIES.forEach((_gr, gi) => {
              const b = st.best[key(li, gi)];
              const on = li === st.li && gi === st.gi;
              grid.append(el('span', '', b != null ? `${fmt(lang, b, 2)} s` : '–', `color:${on ? 'var(--orange-light)' : 'var(--text)'}`));
            });
          });
          // after the Earth comparison: the controller's row (it holds every configuration, 1000×/s)
          if (st.earthSeen) {
            grid.append(el('span', '', ctx.t('a.reglerRow'), 'color:var(--teal)'));
            // ✓ per gravity (≤ 50 words at open: a mark, not a word; the hover says it)
            for (let gi = 0; gi < GRAVITIES.length; gi++) {
              const c = el('span', '', '✓', 'color:var(--teal)');
              c.title = ctx.t('a.holds');
              grid.append(c);
            }
          }
          // stamp progress without words: a ✓ on every length tried ≥ 2 s and on „5 s“ in the chips' tooltip
          const tick = (ok: boolean): string => (ok ? ' ✓' : '');
          len.el.querySelectorAll('button').forEach((b, i) => (b.textContent = `${fmt(lang, POLE_LENGTHS[i], 1)}${ctx.pass.has('balancieren') ? '' : tick(st.tried[i] >= 2)}`));
          goal.textContent = '';
          goal.title = ctx.pass.has('balancieren') ? '' : `5 s${tick(st.longest >= 5)}`;
          skip.disabled = st.operateT < 30 || ctx.pass.has('balancieren');
          skip.title = ctx.t('a.skipHint');
        };
        uiRefresh();
        return () => {
          uiRefresh = null;
          timerEl = null;
          thetaEl = null;
        };
      },
      onExit: () => {
        st.operating = false;
        st.holdL = st.holdR = false;
        if (S.stationActive === 'a') S.stationActive = null;
        ctx.ui.status(null);
      },
    });
  };

  const setConfig = (li: number, gi: number): void => {
    st.li = Math.max(0, Math.min(2, li));
    st.gi = Math.max(0, Math.min(2, gi));
    ctx.audio.play('click', { volume: 0.6 });
    resetRun();
  };

  const onKey = (code: string): void => {
    if (S.stationActive !== 'a') return;
    if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') setConfig(Number(code.slice(5)) - 1, st.gi);
    else if (code === 'KeyG') setConfig(st.li, (st.gi + 1) % 3);
    else if (code === 'KeyR') {
      // Z3: R = reset; a run with progress (pole held > 2 s) asks once
      const now = ctx.time.elapsed;
      if (st.phase === 'run' && st.t > 2 && now - rAsked > 2.5) {
        rAsked = now;
        ctx.ui.hint(ctx.i18n.text('core.game.fail.confirmRestart'), 2.5);
        return;
      }
      rAsked = -10;
      resetRun();
    }
  };
  let rAsked = -10;

  // ── Earth comparison: the controller takes over (Phase 5) ────────────────
  const startRegler = (): void => {
    resetRun();
    st.phase = 'regler';
    st.reglerT = 0;
    st.reglerTicks = 0;
    st.reglerPush = 0;
    st.t = 0;
    ch.live(null);
    ctx.audio.play('whoosh', { at: [X0, 1.2, Z0], pitch: 1.3, volume: 0.4 });
    uiRefresh?.();
  };
  const endRegler = (skipped: boolean): void => {
    const n = st.reglerTicks;
    const first = !st.earthSeen;
    st.earthSeen = true;
    persist();
    if (!skipped) {
      ctx.game.juice.popup(tip, ctx.i18n.text('game.a.reglerPop', { n: ctx.i18n.num(n, 0) }), { tone: 'teal', seconds: 2.6 });
      ctx.game.juice.cue('good', { at: [X0, 1.6, Z0] });
      if (first) ctx.after(2.4, () => S.emiSay(ctx.i18n.text('emi.aEarthDone'), true));
    }
    resetRun();
  };

  // ── per-frame ─────────────────────────────────────────────────────────────
  let uiAcc = 0;
  let dispAcc = 0;
  let servo: { setVolume(v: number, r?: number): void; setPitch(p: number): void; stop(): void } | null = null;
  const update = (dt: number): void => {
    const h = Math.min(dt, 0.05);
    if (st.operating) st.operateT += dt;
    const ops = st.operating && S.stationActive === 'a';
    let dir = 0;
    if (ops || st.auto) {
      const left = st.holdL || ctx.input.isDown('KeyA') || ctx.input.isDown('ArrowLeft');
      const right = st.holdR || ctx.input.isDown('KeyD') || ctx.input.isDown('ArrowRight');
      dir = (right ? 1 : 0) - (left ? 1 : 0);
      if (st.auto) {
        // autopilot = a skilled, fast "human": bang-bang with deadband on a PD estimate (debug only)
        const e = 9 * s[2] + 2.2 * s[3] + 0.25 * s[0] + 0.5 * s[1];
        dir = e > 0.02 ? 1 : e < -0.02 ? -1 : 0;
      }
    }
    // your corrections: every new key press in a run (the Earth comparison counts them)
    if (st.phase === 'run' && ops && !st.auto && dir !== 0 && dir !== st.lastDir) st.presses++;
    st.lastDir = dir;
    // A/D during the controller's run: you take over again
    if (st.phase === 'regler' && ops && dir !== 0) endRegler(true);
    if (st.phase === 'ready' && !(ops || st.auto)) st.readyT = 0; // latched until someone operates
    else if (st.phase === 'ready') {
      st.readyT += h;
      // countdown ticks (two low, one high)
      const tickAt = [0.05, 0.35, 0.65];
      while (st.ticks < 3 && st.readyT >= tickAt[st.ticks]) {
        ctx.audio.beep(st.ticks < 2 ? 660 : 990, 0.05, { at: [X0, 1.2, Z0], volume: 0.5 });
        st.ticks++;
      }
      if (st.readyT >= 0.7) {
        st.phase = 'run';
        st.t = 0;
        st.secTick = 0;
        if (st.operating) void ch.begin();
      }
    }
    if (st.phase === 'run' && st.operating && Math.floor(st.t) > st.secTick) {
      // a tick every full second, pitch rising; popups at the tip at 5 s and 10 s
      st.secTick = Math.floor(st.t);
      ctx.game.juice.cue('tick', { pitch: 1 + Math.min(12, st.secTick) * 0.06, volume: 0.6 });
      if (st.secTick === 5 || st.secTick === 10) {
        ctx.game.juice.popup(tip, `${st.secTick} s!`, { tone: st.secTick === 10 ? 'accent' : 'teal' });
        ctx.game.juice.cue('good', { pitch: st.secTick === 10 ? 1.25 : 1 });
      }
      ch.live(`${fmt(ctx.i18n.lang, POLE_LENGTHS[st.li], 1)} m · ${ctx.t(`a.${GRAVITIES[st.gi].id}`)} · ${st.secTick} s`);
    }
    if (st.phase === 'run') {
      const target = HAND.force * dir;
      const rate = HAND.force / HAND.ramp;
      st.acc += h;
      while (st.acc >= HAND.dt) {
        st.acc -= HAND.dt;
        const dF = target - st.F;
        st.F += Math.max(-rate * HAND.dt, Math.min(rate * HAND.dt, dF));
        rk4(plant, s, st.F, HAND.dt);
        st.t += HAND.dt;
        if (Math.abs(s[2]) > HAND.failTheta) {
          endRun('fallen');
          break;
        }
        if (Math.abs(s[0]) > HAND.railHalf) {
          s[0] = Math.sign(s[0]) * HAND.railHalf;
          s[1] = 0;
          endRun('rail');
          break;
        }
      }
    } else if (st.phase === 'fallen' || st.phase === 'rail') {
      // the pole drops freely onto the padded stop at 75° (cart brakes)
      st.F = 0;
      st.acc += h;
      while (st.acc >= HAND.dt) {
        st.acc -= HAND.dt;
        s[1] *= 0.995;
        rk4(plant, s, -40 * s[1], HAND.dt);
        if (Math.abs(s[0]) > HAND.railHalf) {
          s[0] = Math.sign(s[0]) * HAND.railHalf;
          s[1] = 0;
        }
        if (Math.abs(s[2]) >= HAND.stopTheta) {
          s[2] = Math.sign(s[2]) * HAND.stopTheta;
          s[3] = 0;
          if (!st.clacked) {
            st.clacked = true;
            ctx.audio.play('drop', { at: [X0 + s[0], 1.1, Z0], pitch: 1.4, volume: 1.2 });
            ctx.audio.play('thud', { at: [X0 + s[0], 1.1, Z0], pitch: 2.2, volume: 0.6 });
          }
        }
      }
      st.fallT += h;
      if (st.fallT > 1.3 && st.reglerPending && st.operating) startRegler();
      else if (st.fallT > 1.3 && (st.operating || st.auto)) resetRun();
    } else if (st.phase === 'regler') {
      // the robot's controller on the same cart: 1000 corrections a second, ±20 N, two Schubs
      st.acc += h;
      while (st.acc >= HAND.dt && st.reglerT < REGLER_T - 1e-9) {
        st.acc -= HAND.dt;
        let F = REGLER_K[0] * s[0] + REGLER_K[1] * s[1] + REGLER_K[2] * s[2] + REGLER_K[3] * s[3];
        F = F > HAND.force ? HAND.force : F < -HAND.force ? -HAND.force : F;
        st.F = F;
        let ext = 0;
        for (const [at, f] of REGLER_PUSHES) if (st.reglerT >= at && st.reglerT < at + 0.1) ext += f;
        rk4(plant, s, F + ext, HAND.dt);
        st.reglerT += HAND.dt;
        st.t = st.reglerT;
        st.reglerTicks++;
        if (Math.abs(s[0]) > HAND.railHalf) {
          s[0] = Math.sign(s[0]) * HAND.railHalf;
          s[1] = 0;
        }
      }
      while (st.reglerPush < REGLER_PUSHES.length && st.reglerT >= REGLER_PUSHES[st.reglerPush][0]) {
        const f = REGLER_PUSHES[st.reglerPush++][1];
        ctx.game.juice.popup([X0 + s[0], RAIL_Y + 0.35, Z0], ctx.i18n.text('a.schubs', { f: Math.abs(f) }), { tone: 'muted', seconds: 1.1 });
        ctx.audio.play('thud', { at: [X0 + s[0], 1.1, Z0], pitch: 1.8, volume: 0.5 });
      }
      if (st.reglerT >= REGLER_T) endRegler(false);
    }
    // visuals
    cart.position.x = X0 + s[0];
    pole.rotation.z = -s[2];
    lever.rotation.z = -st.F / HAND.force * 0.35;
    // servo sound follows the push force
    if (ops && !servo) servo = ctx.audio.loop('servo', { at: cart, volume: 0 });
    if (servo) {
      servo.setVolume(Math.min(0.5, Math.abs(st.F) / HAND.force) * 0.5, 0.05);
      servo.setPitch(0.8 + Math.abs(st.F) / HAND.force * 0.5);
      if (!ops && Math.abs(st.F) < 0.1) {
        servo.stop();
        servo = null;
      }
    }
    trailAcc += dt;
    if (trailAcc > 1 / 45 || !trailInit) {
      trailAcc = 0;
      tip.getWorldPosition(tipW);
      ctx.toLocal(tipW, tipW);
      if (!trailInit) {
        trailInit = true;
        for (let i = 0; i < TRAIL; i++) trailPos.set([tipW.x, tipW.y, tipW.z], i * 3);
      }
      trailPos.copyWithin(3, 0, (TRAIL - 1) * 3);
      trailPos[0] = tipW.x;
      trailPos[1] = tipW.y;
      trailPos[2] = tipW.z;
      trailGeo.attributes.position.needsUpdate = true;
    }
    if (timerEl) {
      timerEl.textContent = `${fmt(ctx.i18n.lang, st.t, 2)} s`;
      const tc = st.phase === 'regler' ? 'var(--teal)' : 'var(--text)';
      if (timerEl.style.color !== tc) timerEl.style.color = tc;
    }
    if (thetaEl) thetaEl.textContent = `θ ${signed(ctx.i18n.lang, s[2] / DEG, 1)}°`;
    uiAcc += dt;
    if (uiAcc > 0.3) {
      uiAcc = 0;
      uiRefresh?.();
    }
    dispAcc += dt;
    if (dispAcc > 0.1 && S.playerNear(30)) {
      dispAcc = 0;
      drawDisplay();
    }
  };

  ctx.addInteractable({ object: leverKnob, label: ctx.i18n.text('act.a'), hint: ctx.i18n.text('act.aHint'), onInteract: operate, range: 2.6 });
  resetRun();
  drawDisplay();

  const solve = (): void => {
    // run the real station code with the autopilot on all three lengths (Moon for the 2 m showcase)
    const was = st.auto;
    st.auto = true;
    const runFor = (seconds: number): void => {
      for (let i = 0; i < seconds * 60; i++) update(1 / 60);
    };
    for (const [li, gi] of [
      [0, 2],
      [1, 1],
      [2, 2],
    ] as [number, number][]) {
      setConfig(li, gi);
      runFor(6.5);
      if (st.phase === 'run') endRun('fallen');
    }
    st.auto = was;
    resetRun();
  };

  const stars3 = (): void => {
    // the real station code with the autopilot: the ★ route, then 2 m on Mars and 1 m on the Moon for 9 s
    solve();
    const was = st.auto;
    st.auto = true;
    for (const [li, gi] of [
      [STAR2.li, STAR2.gi],
      [STAR3.li, STAR3.gi],
    ] as [number, number][]) {
      setConfig(li, gi);
      for (let i = 0; i < 9.5 * 60; i++) update(1 / 60);
      if (st.phase === 'run') endRun('fallen');
    }
    st.auto = was;
    resetRun();
  };

  return {
    stars3,
    update,
    operate,
    onKey,
    autopilot(on) {
      st.auto = on;
      if (on) resetRun();
    },
    setConfig,
    solve,
    get state() {
      return { phase: st.phase, t: st.t, theta: s[2], omega: s[3], x: s[0], v: s[1], li: st.li, gi: st.gi, tried: st.tried.slice(), longest: st.longest };
    },
  };
}
