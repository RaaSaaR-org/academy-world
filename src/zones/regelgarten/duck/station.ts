/**
 * Station C „Lauf, Ente!" (Messen; plan §4.3, R2 §6): the real Open Duck Mini v2 learns to walk in
 * real MuJoCo, on the player's reward.
 *
 *   C1 „Mach du's"      three sliders → the hero walks your gait live on the test track (push it
 *                       with F) while 64 copies try it in 64 worlds: „Du: 0,12 m · 41 von 64 gefallen"
 *   C2 „Belohnung"      six reward cards with 4 notches (+ „Vorbild" unlocked by two hacks) and the
 *                       curriculum toggle; Start runs ≤ 10 CEM generations of 64 ducks; a run STOPS
 *                       EARLY as soon as the elite shows a hack: sticker, slow motion, the real twin
 *   C3 „Teststrecke"    20 runs of the trained gait in 4 parallel lanes under hidden conditions; the
 *                       ★★★ path retrains in randomised worlds (2 worlds per gait, the worse counts)
 *
 * Generation k+1 is computed in the worker while k replays (4 s at 1× the first time, then 2×;
 * Space = 4×). Every number is SIM · LIVE (or SIM · AUFZEICHNUNG from the recordings).
 */
import * as THREE from 'three';
import { css, type ChallengeHandle, type DynamicHandle, type InfoCardSpec, type KennlinieSpec, type RobotBody, type RobotModel, type Text, type ZoneContext } from '@/core/zones';
import type { Shared } from '../shared';
import { button, el, slider } from '../ui';
import { CARD_IDS, CEM, DEBUG, DECKS, HAND, REPLAY, STARS, TRACK, WORKER, type CardId, type HackId } from '../tuning';
import { buildField, FIELD, TRACK_LAYOUT, type FieldHandle, type Replay } from './field';
import { LiveEngine, supported, type DuckEngine, type GenRequest } from './mujoco';
import { LINKS } from './core';
import type { GenOut, TrackOut } from './protocol';
import { DUCK_STRINGS } from './strings';
import { createDuckSound } from './sound';

const ROBOT = 'open-duck-mini-v2' as const;
/** the three hacks the station names (calibrated in ≥ 2 of 3 seeds; tuning.ts HACKS) */
const NAMED_HACKS: readonly HackId[] = ['bauchklatscher', 'statue', 'sofortUmfaller'];
const CONSOLE = { x: -7, z: 4, step: 0.6 } as const;

type Step = 'c1' | 'c2' | 'c3';
type Deck = Record<CardId, number>;
interface GenPoint {
  gen: number;
  median: number;
  falls: number;
  n: number;
}
interface TrackResult {
  k: number;
  n: number;
  falls: number;
  median: number;
}
interface Saved {
  hand: { freq: number; hipAmp: number; kneeAmp: number };
  handBest: { median: number; falls: number } | null;
  handTries: number;
  deck: Deck;
  curriculum: boolean;
  hacks: HackId[];
  /** the trained gait (μ of the latest C2 run) and its curve */
  gait: number[] | null;
  gaitGen: number;
  curve: GenPoint[];
  robust: number[] | null;
  trackOne: TrackResult | null;
  trackRand: TrackResult | null;
  firstView: boolean;
  step: Step;
}

export interface DuckStation {
  update(dt: number): void;
  updateFar(dt: number): void;
  operate(): void;
  onEnter(): void;
  onExit(): void;
  /** the next unfinished step (objective) */
  nextStep(): Step | null;
  solve(): Promise<void>;
  album(): Promise<void>;
  stars3(): Promise<void>;
  readonly status: Record<string, unknown>;
  dispose(): void;
}

export function buildDuckStation(S: Shared): DuckStation {
  const ctx: ZoneContext = S.ctx;
  ctx.i18n.register(DUCK_STRINGS);
  const T = ctx.i18n.text;
  const t = ctx.t;
  const det = ctx.groups.detail;
  const num = (v: number, d = 2): string => ctx.i18n.num(v, d);
  const sound = createDuckSound(ctx);
  ctx.onDispose(() => sound.stop());

  // ── materials, field, hero ─────────────────────────────────────────────────
  const paint = ctx.materials.standard({ vertexColors: true, roughness: 0.55, metalness: 0 });
  const tileMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  tileMat.name = 'regelgarten:duck-tile';
  ctx.onDispose(() => tileMat.dispose());
  const field: FieldHandle = buildField(ctx, { tileMaterial: tileMat, paint });
  ctx.onDispose(() => field.dispose());

  // ── state ──────────────────────────────────────────────────────────────────
  const saved = ctx.progress.get<Saved>('duck', {
    hand: { freq: HAND.freq.value, hipAmp: HAND.hipAmp.value, kneeAmp: HAND.kneeAmp.value },
    handBest: null,
    handTries: 0,
    deck: { ...DECKS.start },
    curriculum: false,
    hacks: [],
    gait: null,
    gaitGen: 0,
    curve: [],
    robust: null,
    trackOne: null,
    trackRand: null,
    firstView: false,
    step: 'c1',
  });
  const st = {
    ...saved,
    deck: { ...DECKS.start, ...saved.deck } as Deck,
    operating: false,
    links: [] as string[],
    engine: null as DuckEngine | null,
    engineWait: null as Promise<DuckEngine | null> | null,
    engineFail: null as string | null,
    bodiesWait: null as Promise<void> | null,
    run: null as null | Run,
    track: null as null | TrackPlay,
    slowmo: null as null | { t: number; t0: number; t1: number; gen: GenOut; duck: number; end: () => void },
    heroLive: false,
    heroFell: 0,
    heroDist: 0,
    lastJoint: new Float32Array(14),
    lastFootZ: [0, 0],
    idleFar: 0,
    lastUpdate: 0,
    paused: false,
    resolve: null as null | (() => void),
    prevCurve: [] as GenPoint[],
    c1Started: 0,
    c1Last: null as null | { median: number; falls: number },
    heroIgnoreUntil: 0,
    /** game time of the last approach load of the robots (a failed download retries every 10 s) */
    bodiesTry: -100,
    unattended: null as string | null,
  };
  const persist = (): void =>
    ctx.progress.set('duck', {
      hand: st.hand,
      handBest: st.handBest,
      handTries: st.handTries,
      deck: st.deck,
      curriculum: st.curriculum,
      hacks: st.hacks,
      gait: st.gait,
      gaitGen: st.gaitGen,
      curve: st.curve,
      robust: st.robust,
      trackOne: st.trackOne,
      trackRand: st.trackRand,
      firstView: st.firstView,
      step: st.step,
    } satisfies Saved);
  /** input-free stretches for watch-audit (≤ 10 s each, plan §4) */
  const unattended = (label: string | null): void => {
    if (st.unattended === label) return;
    if (st.unattended) ctx.game.unattended(false, st.unattended);
    st.unattended = label;
    if (label) ctx.game.unattended(true, label);
  };

  // ── robot assets: the field's LOD2 bodies and the hero ──────────────────────
  let hero: RobotModel | null = null;
  const loadBodies = (): Promise<void> =>
    (st.bodiesWait ??= (async () => {
      const [bodies, model] = await Promise.all([bodiesOf(ctx), ctx.robots.load(ROBOT, { lod: 'auto', castShadow: false })]);
      ctx.robots.untrack(model);
      hero = model;
      field.setHero(model);
      st.links = bodies.map((b) => b.link);
      field.setBodies(bodies, st.links);
      setupPush();
    })().catch((err: unknown) => {
      console.warn('[regelgarten] duck models:', err);
      st.bodiesWait = null;
      throw err;
    }));

  // the duck GLB downloads in idle time once the zone is loaded; the field is built on approach
  ctx.robots.prefetch([ROBOT], { priority: 'idle' });

  // ── engine: the live worker, or the recordings ───────────────────────────────
  const forcedRec = typeof location !== 'undefined' && /[?&]duck=rec\b/.test(location.search);
  const getEngine = (): Promise<DuckEngine | null> =>
    (st.engineWait ??= (async () => {
      // the physics does not wait for the pictures: without the GLB (blocked, offline) the station still
      // runs and measures, in the bodies' default order
      await loadBodies().catch(() => undefined);
      if (!st.links.length) st.links = [...LINKS];
      const sup = forcedRec ? { ok: false, reason: 'forced' } : await supported();
      let eng: DuckEngine | null = null;
      if (sup.ok) {
        try {
          const live = new LiveEngine(st.links);
          live.onFail = (why) => void switchToRecordings(why);
          await live.ready();
          eng = live;
        } catch (err) {
          console.warn('[regelgarten] duck worker failed, using the recordings:', err);
          eng = null;
        }
      }
      if (!eng) eng = await recordedEngine(sup.reason ?? 'worker');
      st.engine = eng;
      eng.onHero((f) => {
        if (!st.heroLive || st.track || performance.now() < st.heroIgnoreUntil) return;
        field.heroFrame(f.pose);
        st.heroDist = f.dist;
        heroAudio(f.pose);
        if (f.fell && !st.heroFell) st.heroFell = ctx.time.elapsed;
      });
      uiRefresh?.();
      return eng;
    })().catch((err: unknown) => {
      console.warn('[regelgarten] duck engine:', err);
      st.engineFail = String(err);
      st.engineWait = null;
      return null;
    }));
  const recordedEngine = async (reason: string): Promise<DuckEngine> => {
    const m = await import('./recorded');
    return m.RecordedEngine.create(st.links, reason);
  };
  const switchToRecordings = async (why: string): Promise<void> => {
    const old = st.engine;
    if (!old || old.kind === 'recorded') return;
    cancelRun();
    old.dispose();
    st.engine = null;
    st.engineWait = recordedEngine(why).then((e) => {
      st.engine = e;
      return e;
    });
    await st.engineWait;
    S.emiSay(T('duck.emi.slow'), true);
    uiRefresh?.();
  };
  const chip = (): HTMLElement => (st.engine?.kind === 'recorded' ? ctx.ui.chip('sim-aufzeichnung', T('duck.recNote')) : ctx.ui.chip('sim', T('duck.chipNote')));

  // ── the hero: live stream, audio, the push proxy ─────────────────────────────
  const heroOn = (params: number[] | null): void => {
    const e = st.engine;
    if (!e) return;
    st.heroLive = true;
    st.heroFell = 0;
    st.heroDist = 0;
    st.heroIgnoreUntil = performance.now() + 120;
    e.hero(true, params, undefined, !params);
  };
  const heroOff = (): void => {
    st.heroLive = false;
    st.engine?.hero(false, null);
    sound.hero(false, 0, false, null);
    field.heroStand();
  };
  const heroParams = (): number[] | null => {
    if (st.step === 'c1' || !st.gait) return handParams();
    return st.run?.mu ?? st.gait;
  };
  const heroAudio = (pose: Float32Array): void => {
    const q0 = pose.length - 14;
    let sp = 0;
    for (let k = 0; k < 14; k++) {
      sp += Math.abs(pose[q0 + k] - st.lastJoint[k]) * WORKER.heroHz;
      st.lastJoint[k] = pose[q0 + k];
    }
    // feet: the two foot links' z (MuJoCo) in the stream
    const fi = [st.links.indexOf('foot_assembly'), st.links.indexOf('foot_assembly_2')];
    let tap = false;
    for (let s = 0; s < 2; s++) {
      if (fi[s] < 0) continue;
      const z = pose[fi[s] * 7 + 2];
      if (st.lastFootZ[s] > 0.012 && z <= 0.012) tap = true;
      st.lastFootZ[s] = z;
    }
    const at = hero?.object ?? null;
    const p = field.heroTrunk(_v);
    sound.hero(st.operating, sp, tap, at, [p.x, p.y, p.z]);
  };

  // F (the grab tool, R6: no station used that verb yet): a light proxy at the duck's trunk; while it
  // is held, a spring pulls the real trunk in MuJoCo towards it (≤ 12 N), so the player tugs the duck
  let proxy: DynamicHandle | null = null;
  const setupPush = (): void => {
    if (proxy) return;
    const geo = new THREE.SphereGeometry(0.09, 10, 8);
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    ctx.onDispose(() => {
      geo.dispose();
      mat.dispose();
    });
    const m = new THREE.Mesh(geo, mat);
    m.userData.noMerge = true;
    field.heroTrunk(m.position);
    det.add(m);
    proxy = ctx.physics.addDynamic(m, { mass: 2.1, shape: 'sphere', label: T('duck.push'), grabbable: true, linearDamping: 4, onFall: 'reset' });
  };
  const pushUpdate = (): void => {
    if (!proxy) return;
    const trunk = field.heroTrunk(_v);
    const live = st.engine?.kind === 'live' && st.heroLive;
    proxy.setGrabbable(live);
    if (!proxy.held) {
      proxy.setPosition([trunk.x, trunk.y, trunk.z]);
      return;
    }
    const p = proxy.position(_v2);
    _v3.subVectors(p, trunk);
    const len = _v3.length();
    if (len > 0.9) {
      ctx.player.release();
      return;
    }
    _v3.multiplyScalar(Math.min(12, len * 40) / Math.max(1e-6, len));
    st.engine?.push(field.toMujoco(_v3));
  };

  // ── the gait from the C1 sliders ─────────────────────────────────────────────
  const handParams = (): number[] => {
    const p: number[] = [...HAND.base];
    p[HAND.freq.param] = st.hand.freq;
    p[HAND.hipAmp.param] = st.hand.hipAmp;
    p[HAND.kneeAmp.param] = st.hand.kneeAmp;
    return p;
  };

  // ── runs: C1 copies, C2 training, C3 retraining ──────────────────────────────
  interface Run {
    kind: 'c1' | 'c2' | 'retrain';
    id: string;
    gen: number;
    maxGen: number;
    deck: Deck;
    curriculum: boolean;
    worlds: 'one' | 'train';
    fixed: number[] | null;
    seed: number;
    /** the generation on the field, its replay time and speed */
    cur: GenOut | null;
    replayT: number;
    speed: number;
    /** the next one, computing in the worker */
    next: Promise<GenOut> | null;
    nextReady: GenOut | null;
    mu: number[] | null;
    curve: GenPoint[];
    hack: HackId | null;
    /** fall bookkeeping of the replay (plock density, tile dimming) */
    fallen: Uint8Array;
    done: boolean;
  }
  const replayOf = (g: GenOut): Replay => ({ rec: g.rec, samples: g.samples, links: g.links, ducks: g.pop, fallT: g.fallT, rate: (g.samples - 1) / REPLAY.seconds });
  const gseed = (): number => (Math.random() * 2 ** 31) | 0;
  const request = (run: Run, gen: number): void => {
    const e = st.engine;
    if (!e) return;
    const req: GenRequest = {
      run: run.id,
      restart: gen === 1,
      gen,
      deck: { ...st.deck },
      curriculum: st.curriculum,
      worlds: run.worlds,
      seed: run.kind === 'c1' ? 7 + st.handTries : run.seed + gen * 7919,
      fixed: run.fixed,
    };
    if (run.kind !== 'c1') run.deck = { ...st.deck };
    const p = e.gen(req);
    run.next = p;
    void p.then(
      (g) => {
        if (st.run !== run) return;
        run.nextReady = g;
        run.next = null;
        if (!run.cur) beginReplay(run);
      },
      () => undefined,
    );
  };
  const startRun = async (kind: Run['kind']): Promise<void> => {
    if (st.run || st.track || st.slowmo) return;
    const e = await getEngine();
    if (!e) return;
    const run: Run = {
      kind,
      id: `${kind}-${Date.now()}`,
      gen: 0,
      maxGen: kind === 'c1' ? 1 : CEM.generations,
      deck: { ...st.deck },
      curriculum: st.curriculum,
      worlds: kind === 'c2' ? 'one' : 'train',
      fixed: kind === 'c1' ? handParams() : null,
      seed: gseed(),
      cur: null,
      replayT: 0,
      speed: 1,
      next: null,
      nextReady: null,
      mu: null,
      curve: [],
      hack: null,
      fallen: new Uint8Array(FIELD.ducks),
      done: false,
    };
    st.run = run;
    // Space = 4× holds for this run only; the next one starts at 1× (first viewing) or 2× again
    spaceFast = false;
    if (kind === 'c2' || kind === 'retrain') {
      st.prevCurve = kind === 'c2' ? st.curve : st.prevCurve;
      if (!ctx.progress.get('duckGreetC2', false)) {
        ctx.progress.set('duckGreetC2', true);
        if (st.curriculum) S.emiSay(T('duck.emi.curriculum'));
      }
    }
    // the hero walks the gait in question
    heroOn(kind === 'c1' ? run.fixed : st.gait ?? handParams());
    request(run, 1);
    unattended('lauf-ente');
    uiRefresh?.();
    if (kind !== 'c1') ctx.game.juice.cue('go');
    await new Promise<void>((res) => (st.resolve = res));
  };
  const cancelRun = (): void => {
    const run = st.run;
    if (!run) return;
    st.engine?.cancel(run.id);
    st.run = null;
    unattended(null);
    const r = st.resolve;
    st.resolve = null;
    r?.();
    uiRefresh?.();
  };
  const beginReplay = (run: Run): void => {
    const g = run.nextReady;
    if (!g) return;
    run.nextReady = null;
    run.cur = g;
    run.gen = g.gen;
    run.mu = g.mu;
    run.replayT = 0;
    run.fallen.fill(0);
    const first = !st.firstView;
    run.speed = ctx.mode === 'entscheider' ? REPLAY.speedEntscheider : first ? 1 : REPLAY.speedRepeat;
    if (spaceFast) run.speed = REPLAY.speedFast;
    field.tint(run.worlds === 'train' ? g.friction : null);
    unattended(null);
    // pipeline: generation k+1 computes while k replays (none after a hack or the last one)
    if (run.kind !== 'c1' && !g.hack && g.gen < run.maxGen) request(run, g.gen + 1);
    // the hero walks the new mean
    if (run.kind !== 'c1' && st.engine) st.engine.hero(true, g.mu, undefined, false);
    if (g.gen === 1 && run.kind === 'c2' && g.stats.fallFrac > 0.7 && !ctx.progress.get('duckGen1', false)) {
      ctx.progress.set('duckGen1', true);
      S.emiSay(T('duck.emi.gen1'), true);
    }
    uiRefresh?.();
  };
  const endReplay = (run: Run): void => {
    const g = run.cur!;
    st.firstView = true;
    const falls = Array.from(g.fallT).filter((x) => x >= 0).length;
    const point: GenPoint = { gen: g.gen, median: g.stats.medianDist, falls, n: g.pop };
    run.curve.push(point);
    sound.genEnd(g.stats.medianDist, [FIELD.x0 + 4, 1.2, FIELD.zc]);
    if (run.kind === 'c1') return finishC1(run, g, falls);
    if (run.kind === 'c2') {
      // „Du gegen 64 Enten": the trained curve overtakes your hand-tuned median
      const you = st.handBest?.median;
      const prev = run.curve.length > 1 ? run.curve[run.curve.length - 2].median : null;
      if (you != null && you > 0.05 && prev != null && prev < you && point.median >= you && !ctx.progress.get('duckOvertake', false)) {
        ctx.progress.set('duckOvertake', true);
        ctx.game.juice.cue('pb');
        ctx.game.juice.popup([FIELD.x0 + 6, 1.4, FIELD.zc], ctx.t('duck.c2.you', { d: num(you) }), { tone: 'teal', seconds: 2.4 });
        S.emiSay(T('duck.emi.overtake'), true);
      }
    }
    refreshK(run);
    if (g.hack) return stopForHack(run, g);
    if (g.gen >= run.maxGen) return finishRun(run);
    run.cur = null;
    if (run.nextReady) beginReplay(run);
    else unattended('lauf-ente');
  };
  const finishRun = (run: Run): void => {
    run.done = true;
    run.cur = null;
    if (run.kind === 'c2') {
      st.gait = run.mu;
      st.gaitGen = run.gen;
      st.curve = run.curve;
      st.trackOne = null;
      if (st.step === 'c2') st.step = 'c3';
      S.emiSay(T('duck.emi.walked'), true);
    } else if (run.kind === 'retrain') {
      st.robust = run.mu;
      st.trackRand = null;
    }
    persist();
    st.run = null;
    unattended(null);
    S.refreshObjective();
    uiRefresh?.();
    const r = st.resolve;
    st.resolve = null;
    r?.();
  };
  const finishC1 = (run: Run, g: GenOut, falls: number): void => {
    st.handTries++;
    const median = g.stats.medianDist;
    if (!st.handBest || median > st.handBest.median) st.handBest = { median, falls };
    st.c1Last = { median, falls };
    ctx.game.juice.popup([TRACK_LAYOUT.x0 + 0.6, TRACK_LAYOUT.top + 0.7, TRACK_LAYOUT.zc], ctx.t('duck.c1.result', { d: num(median), k: falls }), { tone: falls > 32 ? 'muted' : 'teal', seconds: 2.8 });
    if (st.handTries === 1) S.emiSay(T('duck.emi.c1Fall'), true);
    else if (st.handTries >= HAND.tries && st.step === 'c1') S.emiSay(T('duck.emi.c1Done'), true);
    if (st.handTries >= 1 && st.step === 'c1') {
      st.step = 'c2';
      S.refreshObjective();
    }
    persist();
    run.done = true;
    run.cur = null;
    st.run = null;
    unattended(null);
    uiRefresh?.();
    const r = st.resolve;
    st.resolve = null;
    r?.();
  };

  // ── hacks: early stop, sticker, slow motion, the real twin ───────────────────
  const stopForHack = (run: Run, g: GenOut): void => {
    const hack = g.hack!;
    run.hack = hack;
    st.gait = run.mu;
    st.gaitGen = run.gen;
    st.curve = run.curve;
    const isNew = !st.hacks.includes(hack);
    if (isNew) st.hacks.push(hack);
    persist();
    // the elite duck whose fall time is closest to the elite's mean: its tile gets the ring
    const elite = g.elite.length ? g.elite : [0];
    const tf = elite.map((i) => g.fallT[i]).filter((x) => x >= 0);
    const mean = tf.length ? tf.reduce((a, b) => a + b, 0) / tf.length : 2;
    let duck = elite[0];
    let best = Infinity;
    for (const i of elite) {
      const d = Math.abs((g.fallT[i] >= 0 ? g.fallT[i] : 4) - mean);
      if (d < best) (best = d), (duck = i);
    }
    const tFall = g.fallT[duck] >= 0 ? g.fallT[duck] : mean;
    slowmo(g, duck, Math.max(0, tFall - 0.7), Math.min(4, tFall + 0.25), () => {
      const name = t(`duck.hack.${hack}`);
      ctx.game.juice.popup([FIELD.x0 + 5, 1.6, FIELD.zc], ctx.t('duck.hack.sticker', { name }), { tone: 'accent', seconds: 3 });
      if (isNew) {
        ctx.game.juice.burst([FIELD.x0 + 5, 1.2, FIELD.zc], { tone: 'orange', count: 60, spread: 1.6 });
        ctx.game.juice.cue('great');
      } else ctx.game.juice.cue('oops');
      S.emiSay(isNew ? T(`duck.emi.hack.${hack}`) : T('duck.emi.hackAgain'), true);
      if (isNew && NAMED_HACKS.every((h) => st.hacks.includes(h))) {
        ctx.after(4, () => S.emiSay(T('duck.emi.collector'), true));
        ctx.game.secrets.find('hack-sammler', ctx.toWorld([CONSOLE.x, 1, CONSOLE.z]));
        ctx.events.emit('regelgarten:egg', { egg: 11, id: 'hack-sammler' });
      }
      submitStars();
      run.done = true;
      run.cur = null;
      st.run = null;
      uiRefresh?.();
      const r = st.resolve;
      st.resolve = null;
      r?.();
    });
  };
  /** „Sturz der Generation" (≤ 4 s): the hack generation at ¼ speed around the fall; reduced motion: a still */
  const slowmo = (g: GenOut, duck: number, t0: number, t1: number, end: () => void): void => {
    const rm = ctx.settings.reducedMotion;
    field.highlight(duck);
    sound.slowmo([FIELD.x0 + 4, 1, FIELD.zc]);
    unattended('lauf-ente');
    st.slowmo = { t: rm ? t1 : t0, t0, t1, gen: g, duck, end };
    if (rm) {
      // a still at the fall with the sticker; no camera, no motion
      field.pose(replayOf(g), Math.min(t1, (t0 + t1) / 2 + 0.2));
      ctx.after(REPLAY.slowmoSeconds * 0.6, () => endSlowmo());
    }
  };
  const endSlowmo = (): void => {
    const s = st.slowmo;
    if (!s) return;
    st.slowmo = null;
    field.highlight(null);
    unattended(null);
    s.end();
  };
  const updateSlowmo = (dt: number): void => {
    const s = st.slowmo;
    if (!s || ctx.settings.reducedMotion) return;
    s.t += dt * REPLAY.slowmoRate;
    const tt = Math.min(s.t1, s.t);
    field.pose(replayOf(s.gen), tt);
    if (s.t >= s.t1) endSlowmo();
  };

  // ── C3: the test track ───────────────────────────────────────────────────────
  interface TrackPlay {
    kind: 'one' | 'rand';
    out: TrackOut;
    t: number;
    speed: number;
    round: number;
  }
  const testTrack = async (kind: 'one' | 'rand'): Promise<void> => {
    const gait = kind === 'one' ? st.gait : st.robust;
    if (!gait || st.run || st.track || st.slowmo) return;
    const e = await getEngine();
    if (!e) return;
    heroOff();
    const out = await e.track(gait, TRACK.runs, TRACK.seed);
    st.track = { kind, out, t: 0, speed: ctx.mode === 'entscheider' ? TRACK.speedEntscheider : TRACK.speed, round: 0 };
    unattended('lauf-ente');
    uiRefresh?.();
    await new Promise<void>((res) => (st.resolve = res));
  };
  const updateTrack = (dt: number): void => {
    const tp = st.track;
    if (!tp) return;
    tp.t += dt * tp.speed;
    const rounds = Math.ceil(TRACK.runs / TRACK_LAYOUT.lanes);
    const per = TRACK.seconds;
    const round = Math.min(rounds - 1, Math.floor(tp.t / per));
    const rt = Math.min(per, tp.t - round * per);
    const r: Replay = { rec: tp.out.rec, samples: tp.out.samples, links: tp.out.links, ducks: TRACK.runs, fallT: new Float32Array(0), rate: (tp.out.samples - 1) / TRACK.seconds };
    const run0 = round * TRACK_LAYOUT.lanes;
    field.heroRecorded(r, tp.out.qrec, run0, rt);
    field.lanes(r, run0 + 1, rt);
    if (round !== tp.round) {
      tp.round = round;
      ctx.audio.play('click', { at: [TRACK_LAYOUT.x0 + 0.6, TRACK_LAYOUT.top + 0.2, TRACK_LAYOUT.zc] });
    }
    if (tp.t >= rounds * per) finishTrack(tp);
  };
  const finishTrack = (tp: TrackPlay): void => {
    st.track = null;
    field.lanes(null, 0, 0);
    field.heroStand();
    unattended(null);
    const runs = tp.out.runs;
    const k = runs.filter((x) => x.success).length;
    const falls = runs.filter((x) => x.fell).length;
    const median = runs.map((x) => x.dist).sort((a, b) => a - b)[runs.length >> 1] ?? 0;
    const res: TrackResult = { k, n: runs.length, falls, median };
    if (tp.kind === 'one') st.trackOne = res;
    else st.trackRand = res;
    persist();
    const rate = ctx.ui.formatRate(k, runs.length).replace(/ · n = \d+$/, '');
    ctx.game.juice.popup([TRACK_LAYOUT.x0 + 0.6, TRACK_LAYOUT.top + 0.8, TRACK_LAYOUT.zc], ctx.t('duck.c3.result', { k, rate }), { tone: k >= STARS.track ? 'teal' : 'muted', seconds: 3 });
    ctx.game.juice.cue(k >= STARS.track ? 'great' : k >= 10 ? 'good' : 'oops');
    if (tp.kind === 'one') {
      if (falls >= 5) {
        if (ctx.pass.unlockAlbum('sim-to-real-luecke')) ctx.after(0.6, () => S.emiSay(T('duck.emi.trackFalls'), true));
        else S.emiSay(T('duck.emi.trackFalls'), true);
      } else S.emiSay(T('duck.emi.trackHolds'), true);
    } else {
      const one = st.trackOne;
      if (one && res.k > one.k) S.emiSay(T(res.median < one.median - 0.03 ? 'duck.emi.retrained' : 'duck.emi.retrainedFast'), true);
      else S.emiSay(T('duck.emi.retrainedNot'), true);
    }
    award();
    uiRefresh?.();
    const r = st.resolve;
    st.resolve = null;
    r?.();
  };

  // ── stars, stamp, card ─────────────────────────────────────────────────────
  const starsNow = (): 0 | 1 | 2 | 3 => {
    if (!ctx.pass.has('lauf-ente')) return 0;
    const hacks = st.hacks.filter((h) => NAMED_HACKS.includes(h)).length;
    const s3 = !!st.robust && !!st.trackRand && st.trackRand.k >= STARS.track;
    return (1 + (hacks >= STARS.hacks ? 1 : 0) + (s3 ? 1 : 0)) as 1 | 2 | 3;
  };
  const bestTrack = (): number | null => Math.max(st.trackOne?.k ?? -1, st.trackRand?.k ?? -1) >= 0 ? Math.max(st.trackOne?.k ?? 0, st.trackRand?.k ?? 0) : null;
  const chC: ChallengeHandle = ctx.game.challenge({
    id: 'lauf-ente',
    title: T('duck.game.title'),
    metric: { label: T('duck.game.metric'), unit: '/ 20', better: 'higher', digits: 0 },
    goals: [{ text: T('duck.game.g1') }, { text: T('duck.game.g2') }, { text: T('duck.game.g3') }],
    lesson: T('duck.game.lesson'),
    why: () => card(),
    retry: () => operate(),
  });
  const submitStars = (): void => {
    if (!ctx.pass.has('lauf-ente')) return;
    chC.submit(bestTrack(), { stars: starsNow(), quiet: false });
  };
  const award = (): void => {
    const tr = st.trackRand ?? st.trackOne;
    if (!tr || !st.gait) return;
    const last = st.curve[st.curve.length - 1];
    const hacks = st.hacks.length;
    const rate = (k: number, n: number): string => ctx.ui.formatRate(k, n).replace(/ · n = \d+$/, '');
    const val = (lang: 'de' | 'en'): string => {
      const s = DUCK_STRINGS[lang] as unknown as { duck: { stamp: string; stampGen: string } };
      return s.duck.stamp
        .replace('{gen}', s.duck.stampGen.replace('{g}', String(st.gaitGen)))
        .replace('{d}', (last?.median ?? 0).toFixed(2).replace('.', lang === 'de' ? ',' : '.'))
        .replace('{h}', String(hacks))
        .replace('{k}', String(tr.k))
        .replace('{rate}', rate(tr.k, tr.n));
    };
    const isNew = ctx.pass.award('lauf-ente', { value: { de: val('de'), en: val('en') }, curve: st.curve.map((c) => c.median) });
    if (isNew) {
      S.refreshObjective();
      ctx.game.juice.burst([TRACK_LAYOUT.x0 + 0.6, TRACK_LAYOUT.top + 0.4, TRACK_LAYOUT.zc], { tone: 'teal', count: 70, spread: 1.4 });
    }
    chC.submit(bestTrack(), { stars: starsNow() });
  };
  const card = (): InfoCardSpec => ({
    eyebrow: T('duck.card.eyebrow'),
    title: T('duck.card.title'),
    body: [T('duck.card.entdecker'), T('duck.card.curious')],
    entscheider: {
      body: [T('duck.card.entscheider'), T('duck.card.fast')],
      forDecisionMakers: { title: T('duck.card.dmTitle'), bullets: [T('duck.card.bf1'), T('duck.card.bf2'), T('duck.card.bf3'), T('duck.card.bf4')] },
    },
    metrics: [
      { label: T('duck.card.mGen'), value: st.curve.length ? num(st.curve[st.curve.length - 1].median) : '–', unit: st.curve.length ? 'm' : undefined, note: T('duck.chipNote') },
      { label: T('duck.card.mHacks'), value: st.hacks.length },
      { label: T('duck.card.mOne'), value: st.trackOne ? `${st.trackOne.k}/20` : '–' },
      { label: T('duck.card.mRand'), value: st.trackRand ? `${st.trackRand.k}/20` : '–' },
    ],
  });

  // ── the console: Belohnungspult, Kennlinie screen, rubber duck ──────────────
  const G = <T2 extends THREE.BufferGeometry>(g: T2): T2 => (ctx.onDispose(() => g.dispose()), g);
  const knob = new THREE.Mesh(G(new THREE.CylinderGeometry(0.07, 0.08, 0.06, 18)), ctx.materials.accentOrange);
  knob.position.set(CONSOLE.x + 0.22, CONSOLE.step + 1.03, CONSOLE.z + 0.62);
  knob.rotation.z = 0.22;
  det.add(knob);
  const kSpec = (run: Run | null): KennlinieSpec => {
    const cur = run && run.kind !== 'c1' ? run.curve : st.curve;
    const you = st.handBest?.median ?? null;
    const prev = st.prevCurve;
    const ymax = Math.max(0.4, you ?? 0, ...cur.map((c) => c.median), ...prev.map((c) => c.median)) * 1.15;
    return {
      title: T('duck.c2.kTitle'),
      xLabel: T('duck.c2.kx'),
      yLabel: T('duck.c2.ky'),
      chip: st.engine?.kind === 'recorded' ? 'sim-aufzeichnung' : 'sim',
      xMin: 0,
      xMax: CEM.generations,
      yMin: 0,
      yMax: Math.ceil(ymax * 10) / 10,
      keyValue: cur.length ? `Gen ${cur[cur.length - 1].gen}: ${num(cur[cur.length - 1].median)} m` : undefined,
      series: [
        ...(prev.length && prev !== cur ? [{ id: 'prev', label: T('duck.c2.median'), line: prev.map((c) => [c.gen, c.median] as [number, number]), color: css.textSecondary, dashed: true }] : []),
        ...(cur.length ? [{ id: 'run', label: T('duck.c2.median'), points: cur.map((c) => [c.gen, c.median] as [number, number]), line: cur.map((c) => [c.gen, c.median] as [number, number]), color: css.text }] : []),
        ...(you != null ? [{ id: 'you', label: ctx.t('duck.c2.you', { d: num(you) }), line: [[0, you], [CEM.generations, you]] as [number, number][], color: css.orange, dashed: true }] : []),
      ],
    };
  };
  const fSpec = (run: Run | null): KennlinieSpec => {
    const cur = run && run.kind !== 'c1' ? run.curve : st.curve;
    return {
      title: T('duck.c2.fTitle'),
      xLabel: T('duck.c2.kx'),
      yLabel: T('duck.c2.fy'),
      chip: st.engine?.kind === 'recorded' ? 'sim-aufzeichnung' : 'sim',
      band: 'wilson95',
      percent: true,
      xMin: 0,
      xMax: CEM.generations,
      series: cur.length ? [{ id: 'falls', label: T('duck.c2.fTitle'), trials: cur.map((c) => ({ x: c.gen, k: c.falls, n: c.n })), color: css.teal }] : [],
    };
  };
  const scr = ctx.ui.kennlinie(kSpec(null), { target: 'texture', width: 512, height: 300 });
  const scrMat = new THREE.MeshBasicMaterial({ map: scr.texture!, color: 0xdcdcdc, toneMapped: false });
  ctx.onDispose(() => scrMat.dispose());
  // the in-world Kennlinie at the desk's north end, turned towards the stairs (the field stays in view)
  const scrMesh = new THREE.Mesh(G(new THREE.PlaneGeometry(0.98, 0.575)), scrMat);
  scrMesh.rotation.set(-0.12, Math.PI / 2 - 0.5, 0, 'YXZ');
  scrMesh.position.set(CONSOLE.x - 0.1, CONSOLE.step + 1.32, CONSOLE.z + 0.95);
  det.add(scrMesh);
  let panelK: { update(s: KennlinieSpec): void; remove(): void } | null = null;
  let panelF: { update(s: KennlinieSpec): void; remove(): void } | null = null;
  const refreshK = (run: Run | null = st.run): void => {
    scr.update(kSpec(run));
    panelK?.update(kSpec(run));
    panelF?.update(fSpec(run));
  };
  refreshK(null);

  // the Teststrecke's face: four lanes, the marks 0,25 / 0,5 / 1,0 m (one canvas, one draw)
  {
    const cv = document.createElement('canvas');
    cv.width = 768;
    cv.height = 512;
    const g = cv.getContext('2d')!;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    ctx.onDispose(() => (tex.dispose(), mat.dispose()));
    const len = TRACK_LAYOUT.length,
      wid = TRACK_LAYOUT.lanes * TRACK_LAYOUT.laneW;
    const draw = (): void => {
      g.clearRect(0, 0, cv.width, cv.height);
      const X = (m: number): number => ((m + 0.08) / len) * cv.width;
      g.fillStyle = 'rgba(168,162,158,0.5)';
      for (let l = 1; l < TRACK_LAYOUT.lanes; l++) g.fillRect(0, (l / TRACK_LAYOUT.lanes) * cv.height - 1, cv.width, 2);
      g.fillStyle = 'rgba(45,212,191,0.85)';
      g.fillRect(X(0) - 1.5, 0, 3, cv.height);
      g.font = '500 30px "Geist Mono", monospace';
      for (const m of TRACK.marks) {
        g.fillStyle = 'rgba(45,212,191,0.85)';
        g.fillRect(X(m) - 1.5, 0, 3, cv.height);
        g.fillStyle = 'rgba(245,245,244,0.9)';
        g.save();
        g.translate(X(m) + 8, cv.height - 10);
        g.fillText(`${num(m, 2).replace(/0$/, '')} m`, 0, 0);
        g.restore();
      }
      tex.needsUpdate = true;
    };
    draw();
    ctx.i18n.onChange(draw);
    const plane = new THREE.Mesh(G(new THREE.PlaneGeometry(len, wid).rotateX(-Math.PI / 2)), mat);
    plane.position.set(TRACK_LAYOUT.x0 + len / 2, TRACK_LAYOUT.top + 0.003, TRACK_LAYOUT.zc);
    plane.renderOrder = 1;
    det.add(plane);
  }

  // egg 10 „Erklär's der Ente": a small yellow rubber duck on the desk (≤ 300 triangles)
  const rubber = new THREE.Group();
  {
    const yellow = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.55 });
    const beak = new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.6 });
    ctx.onDispose(() => (yellow.dispose(), beak.dispose()));
    const body = new THREE.Mesh(G(new THREE.SphereGeometry(0.06, 10, 7).scale(1.25, 0.8, 1)), yellow);
    const head = new THREE.Mesh(G(new THREE.SphereGeometry(0.038, 9, 6)), yellow);
    head.position.set(0.045, 0.06, 0);
    const bk = new THREE.Mesh(G(new THREE.ConeGeometry(0.014, 0.035, 6).rotateZ(-Math.PI / 2)), beak);
    bk.position.set(0.09, 0.058, 0);
    rubber.add(body, head, bk);
    rubber.position.set(CONSOLE.x + 0.3, CONSOLE.step + 1.04, CONSOLE.z - 0.9);
    rubber.rotation.y = Math.PI;
    rubber.userData.noMerge = true;
    det.add(rubber);
  }
  ctx.addInteractable({
    object: rubber,
    label: T('duck.egg.act'),
    range: 2.2,
    onInteract: () => {
      sound.squeak([rubber.position.x, rubber.position.y, rubber.position.z]);
      void ctx.ui.subtitle('EMI-03 ›', [T('duck.egg.intro'), T('duck.egg.s1'), T('duck.egg.s2'), T('duck.egg.s3')]);
      ctx.game.secrets.find('erklaer-ente', ctx.toWorld([rubber.position.x, rubber.position.y, rubber.position.z]));
      ctx.events.emit('regelgarten:egg', { egg: 10, id: 'erklaer-ente' });
    },
  });

  // ── operate panel ──────────────────────────────────────────────────────────
  let uiRefresh: (() => void) | null = null;
  let spaceFast = false;
  const setDeck = (d: Deck): void => {
    st.deck = { ...d };
    persist();
    uiRefresh?.();
  };
  const operate = (): void => {
    S.stationActive = 'c';
    st.operating = true;
    if (!ctx.progress.get('duckGreeted', false)) {
      ctx.progress.set('duckGreeted', true);
      S.emiSay(T('duck.emi.enter'), true);
    }
    S.emiDrive([TRACK_LAYOUT.x0 + 0.7, 0, TRACK_LAYOUT.zc - 1.1]);
    void getEngine().then(() => {
      if (st.operating && !st.run && !st.track) heroOn(heroParams());
    });
    if (st.step === 'c1' && !st.c1Started) st.c1Started = ctx.time.elapsed;
    ctx.player.enterOperate({
      title: T('duck.title'),
      cameraPose: ((window as unknown as { __duckCam?: { position: [number, number, number]; lookAt: [number, number, number] } }).__duckCam ?? { position: [-4.9, 3.3, -0.9], lookAt: [-11.6, 0.45, 4.4] }),
      panelPosition: 'right',
      panel: (root) => {
        root.dataset.rg = 'panel-duck';
        const head = el('div', '', undefined, 'display:flex;justify-content:space-between;align-items:center;gap:8px');
        const chipWrap = el('span');
        const info = button('ⓘ', 'btn ghost', () => void ctx.ui.card(card()), 'duck-info');
        info.style.cssText += ';padding:2px 8px;margin-left:auto';
        head.append(el('div', 'eyebrow', t('lauf-ente.title')), info, chipWrap);
        root.append(head);
        const goal = chC.chips();
        goal.style.margin = '8px 0 4px';
        root.append(goal);
        // step tabs
        const tabs = el('div', 'seg', undefined, 'margin:6px 0 2px');
        const tabBtn = (s: Step): HTMLButtonElement => button(t(`duck.steps.${s}`), '', () => ((view = s), uiRefresh?.()), `duck-tab-${s}`);
        const tb = { c1: tabBtn('c1'), c2: tabBtn('c2'), c3: tabBtn('c3') };
        tabs.append(tb.c1, tb.c2, tb.c3);
        root.append(tabs);
        let view: Step = st.step;
        /** this panel session: the Kennlinie, the result line and the real twin appear once something ran here */
        let ranHere = false;
        const disclosure = (label: string, testId: string): { btn: HTMLButtonElement; box: HTMLElement } => {
          const box = el('div', '', undefined, 'display:none;margin-top:4px');
          const btn = button(`${label} ▸`, 'btn ghost', () => {
            const open = box.style.display === 'none';
            box.style.display = open ? '' : 'none';
            btn.textContent = `${label} ${open ? '▾' : '▸'}`;
          }, testId);
          btn.style.cssText += ';margin-top:6px;padding:4px 10px;font-size:12px';
          return { btn, box };
        };
        const body = el('div');
        root.append(body);
        const status = el('div', 'mono', '', 'font-size:12.5px;color:var(--teal);min-height:18px;margin-top:6px');
        status.dataset.rg = 'duck-status';
        root.append(status);

        // C1
        const c1 = el('div');
        const sF = slider({ label: t('duck.c1.freq'), min: HAND.freq.min, max: HAND.freq.max, step: 0.05, value: st.hand.freq, format: (v) => `${num(v, 2)} Hz`, onInput: (v) => ((st.hand.freq = v), persist()), testId: 'duck-freq' });
        const sS = slider({ label: t('duck.c1.stride'), min: HAND.hipAmp.min, max: HAND.hipAmp.max, step: 0.01, value: st.hand.hipAmp, format: (v) => `${num((v * 180) / Math.PI, 0)}°`, onInput: (v) => ((st.hand.hipAmp = v), persist()), testId: 'duck-stride' });
        const sL = slider({ label: t('duck.c1.lift'), min: HAND.kneeAmp.min, max: HAND.kneeAmp.max, step: 0.01, value: st.hand.kneeAmp, format: (v) => `${num((v * 180) / Math.PI, 0)}°`, onInput: (v) => ((st.hand.kneeAmp = v), persist()), testId: 'duck-lift' });
        c1.append(sF.el, sS.el, sL.el);
        const c1row = el('div', 'op-row');
        const bGo = button(t('duck.c1.go'), 'btn primary', () => ((ranHere = true), void startRun('c1')), 'duck-go');
        bGo.title = t('duck.c1.intro');
        const c1out = el('div', 'mono', '', 'font-size:12.5px;color:var(--teal);flex:1;text-align:right');
        c1row.append(bGo, c1out);
        c1.append(c1row, el('div', 'mono', t('duck.c1.push'), 'font-size:11px;color:var(--text-3);margin-top:4px'));
        const c1next = el('div', 'op-row');
        const bNext = button(t('duck.c1.next'), 'btn', () => ((view = 'c2'), uiRefresh?.()), 'duck-c1-next');
        // Entscheider: C1 can be skipped after 30 s (R2 §6.7); it skips the step, not the station's stamp
        const bSkip = button(t('duck.c1.skip'), 'btn', () => {
          if (st.step === 'c1') st.step = 'c2';
          view = 'c2';
          persist();
          S.refreshObjective();
          uiRefresh?.();
        }, 'duck-c1-skip');
        c1next.append(bNext, bSkip);
        c1.append(c1next);

        // C2
        const c2 = el('div');
        const cardRows = new Map<CardId, { row: HTMLElement; dots: HTMLButtonElement[] }>();
        const grid = el('div', '', undefined, 'display:grid;grid-template-columns:1fr 1fr;gap:4px 12px');
        for (const id of CARD_IDS) {
          const row = el('div', '', undefined, 'display:flex;align-items:center;justify-content:space-between;gap:6px');
          row.title = t(`duck.cardHint.${id}`);
          const lab = el('span', 'mono', t(`duck.cards.${id}`), 'font-size:11.5px;letter-spacing:.04em;color:var(--text)');
          const dots = el('div', '', undefined, 'display:flex;gap:3px');
          const btns: HTMLButtonElement[] = [];
          for (let n = 0; n <= 3; n++) {
            // notches as dots (the value is the dot, not a word): aria-label carries „Vorwärts 2“
            const b = button('', '', () => {
              if (id === 'vorbild' && !vorbildOpen()) return;
              setDeck({ ...st.deck, [id]: n });
            }, `duck-card-${id}-${n}`);
            b.setAttribute('aria-label', `${t(`duck.cards.${id}`)} ${n}`);
            b.title = `${t(`duck.cards.${id}`)} ${n}/3 · ${t(`duck.cardHint.${id}`)}`;
            b.style.cssText = `width:16px;height:16px;padding:0;border-radius:50%;min-width:0;${n === 0 ? 'opacity:.55' : ''}`;
            btns.push(b);
            dots.append(b);
          }
          row.append(lab, dots);
          grid.append(row);
          cardRows.set(id, { row, dots: btns });
        }
        c2.append(grid);
        const curRow = el('label', 'mono', undefined, 'display:flex;align-items:center;gap:8px;font-size:12px;margin-top:6px;color:var(--text-2)');
        const cur = el('input') as HTMLInputElement;
        cur.type = 'checkbox';
        cur.dataset.rg = 'duck-curriculum';
        cur.onchange = () => {
          st.curriculum = cur.checked;
          persist();
          if (cur.checked) S.emiSay(T('duck.emi.curriculum'));
        };
        curRow.append(cur, el('span', '', t('duck.c2.curriculum')));
        c2.append(curRow);
        const c2row = el('div', 'op-row');
        const bStart = button(t('duck.c2.start'), 'btn primary', () => ((ranHere = true), void startRun('c2')), 'duck-start');
        bStart.title = t('duck.c2.fast');
        const bStop = button(t('duck.c2.stop'), 'btn', () => cancelRun(), 'duck-stop');
        const bPreset = button(t('duck.c2.preset'), 'btn', () => setDeck({ ...DECKS.start }), 'duck-preset');
        const bFix = button(t('duck.c2.fix'), 'btn', () => setDeck({ ...st.deck, durchhalten: Math.max(1, st.deck.durchhalten), aufrecht: Math.max(1, st.deck.aufrecht) }), 'duck-fix');
        c2row.append(bStart, bStop);
        c2.append(c2row);
        const c2pre = el('div', 'op-row');
        c2pre.append(bPreset, bFix);
        c2.append(c2pre);
        const kWrap = el('div');
        c2.append(kWrap);
        const pk = ctx.ui.kennlinie(kSpec(st.run), { parent: kWrap, width: 360, height: 140 });
        const fall = disclosure(t('duck.c2.fTitle'), 'duck-falls');
        kWrap.append(fall.btn, fall.box);
        const pf = ctx.ui.kennlinie(fSpec(st.run), { parent: fall.box, width: 360, height: 110 });
        panelK = pk;
        panelF = pf;
        const stickers = el('div', 'mono', '', 'display:flex;flex-wrap:wrap;gap:6px;font-size:11.5px;margin-top:6px');
        c2.append(stickers);
        const twin = el('div', '', '', 'font-size:12px;color:var(--text-2);margin-top:6px;line-height:1.4');
        c2.append(twin);

        // C3
        const c3 = el('div');
        c3.append(el('div', '', t('duck.c3.intro'), 'font-size:13px;color:var(--text-2);margin:6px 0'));
        const bars = el('canvas') as HTMLCanvasElement;
        bars.width = 720;
        bars.height = 220;
        bars.style.cssText = 'width:360px;height:110px;margin-top:6px';
        c3.append(bars);
        const c3row = el('div', 'op-row');
        const bTest = button(t('duck.c3.test'), 'btn primary', () => void testTrack('one'), 'duck-test');
        const bRetrain = button(t('duck.c3.retrainShort'), 'btn', () => void startRun('retrain'), 'duck-retrain');
        bRetrain.title = t('duck.c3.retrain');
        const bRetest = button(t('duck.c3.retest'), 'btn', () => void testTrack('rand'), 'duck-retest');
        for (const b of [bTest, bRetrain, bRetest]) b.style.cssText = 'flex:1 1 0;justify-content:center;text-align:center;padding:9px 8px;font-size:13px;line-height:1.2;white-space:normal';
        c3row.append(bTest, bRetrain, bRetest);
        const cond = disclosure(t('duck.c3.conditions'), 'duck-conditions');
        cond.box.append(
          el('div', 'mono', `${t('duck.c3.hidden')}\n${t('duck.c3.trainRanges')}`, 'white-space:pre-line;font-size:11px;color:var(--text-3)'),
          el('div', 'mono', t('duck.c3.rule'), 'font-size:11px;color:var(--text-3);margin-top:2px'),
          el('div', '', t('duck.c3.pairs'), 'font-size:11.5px;color:var(--text-3);margin-top:4px'),
          el('div', '', t('duck.c3.simNote'), 'font-size:11.5px;color:var(--text-3);margin-top:4px'),
        );
        c3.append(c3row, cond.btn, cond.box);
        body.append(c1, c2, c3);

        const drawBars = (): void => {
          const g = bars.getContext('2d')!;
          g.clearRect(0, 0, bars.width, bars.height);
          const items: [string, TrackResult | null, string][] = [
            [t('duck.c3.barOne'), st.trackOne, css.textSecondary],
            [t('duck.c3.barRand'), st.trackRand, css.teal],
          ];
          g.font = '500 22px "Geist Mono", monospace';
          items.forEach(([label, r], i) => {
            const y = 30 + i * 96;
            g.fillStyle = css.textSecondary;
            g.fillText(label, 8, y);
            g.fillStyle = 'rgba(168,162,158,0.2)';
            g.fillRect(8, y + 12, 600, 34);
            if (!r) return;
            const [p, lo, hi] = ctx.ui.wilson(r.k, r.n);
            g.fillStyle = items[i][2];
            g.fillRect(8, y + 12, 600 * p, 34);
            g.strokeStyle = css.text;
            g.lineWidth = 3;
            g.beginPath();
            g.moveTo(8 + 600 * lo, y + 29);
            g.lineTo(8 + 600 * hi, y + 29);
            g.stroke();
            g.fillStyle = css.text;
            g.fillText(`${r.k}/20`, 620, y + 38);
          });
        };

        uiRefresh = () => {
          const eng = st.engine;
          chipWrap.replaceChildren(chip());
          for (const s of ['c1', 'c2', 'c3'] as Step[]) tb[s].classList.toggle('on', view === s);
          c1.style.display = view === 'c1' ? '' : 'none';
          c2.style.display = view === 'c2' ? '' : 'none';
          c3.style.display = view === 'c3' ? '' : 'none';
          const run = st.run;
          const busy = !!run || !!st.track || !!st.slowmo || !eng;
          // C1
          bGo.disabled = busy;
          const last = st.c1Last ?? st.handBest;
          c1out.textContent = run?.kind === 'c1' ? t('duck.c1.running') : last && ranHere ? ctx.t('duck.c1.result', { d: num(last.median), k: last.falls }) : '';
          bSkip.style.display = ctx.mode === 'entscheider' && st.step === 'c1' && st.c1Started && ctx.time.elapsed - st.c1Started >= HAND.skipAfter ? '' : 'none';
          bNext.style.display = st.handTries > 0 && ranHere ? '' : 'none';
          // C2
          for (const [id, { row, dots }] of cardRows) {
            const locked = id === 'vorbild' && !vorbildOpen();
            row.style.opacity = locked ? '0.4' : '';
            // a level meter: dots 1…value filled orange, dot 0 (off) ringed when the card is off
            const v = st.deck[id];
            dots.forEach((b, n) => {
              b.classList.toggle('on', v === n);
              b.style.background = n > 0 && n <= v ? 'var(--orange)' : 'transparent';
              b.style.border = `1.5px solid ${n === 0 ? (v === 0 ? 'var(--text-2)' : 'var(--text-3)') : n <= v ? 'var(--orange)' : 'var(--text-3)'}`;
              b.disabled = locked;
            });
          }
          cur.checked = st.curriculum;
          bStart.disabled = busy;
          bStop.style.display = run && run.kind !== 'c1' ? '' : 'none';
          bPreset.style.display = ctx.mode === 'entscheider' ? '' : 'none';
          bFix.style.display = ctx.mode === 'entscheider' && st.hacks.includes('bauchklatscher') ? '' : 'none';
          const found = st.hacks.filter((h) => NAMED_HACKS.includes(h));
          stickers.replaceChildren(
            ...(found.length ? [el('span', '', `${found.length}/3`, 'color:var(--text-3)')] : []),
            ...found.map((h) => el('span', 'chip', t(`duck.hack.${h}`), 'border-color:var(--orange);color:var(--orange)')),
          );
          const lastHack = st.hacks[st.hacks.length - 1];
          twin.textContent = lastHack && ranHere && !run ? `${t('duck.c2.twinTitle')} ${t(`duck.twin.${lastHack}`)}` : '';
          kWrap.style.display = ranHere || run ? '' : 'none';
          // C3
          bTest.disabled = busy || !st.gait;
          bRetrain.disabled = busy || !st.trackOne;
          bRetest.disabled = busy || !st.robust;
          const next = !st.trackOne ? bTest : !st.robust ? bRetrain : !st.trackRand ? bRetest : null;
          for (const b of [bTest, bRetrain, bRetest]) b.classList.toggle('primary', b === next && !b.disabled);
          drawBars();
          // status line
          if (!eng) status.textContent = st.bodiesWait && !hero ? t('duck.loadingRobot') : t('duck.loading');
          else if (st.slowmo) status.textContent = t('duck.hack.slowmo');
          else if (st.track) status.textContent = `${ctx.t('duck.c3.testing', { k: Math.min(TRACK.runs, (st.track.round + 1) * TRACK_LAYOUT.lanes) })} · ${ctx.t('duck.c3.lanes', { x: st.track.speed })}`;
          else if (run && run.kind !== 'c1') {
            const g = run.cur;
            if (!g) status.textContent = ctx.t('duck.c2.computing', { g: run.gen + 1 });
            else
              status.textContent = `${run.kind === 'retrain' ? ctx.t('duck.c3.retraining', { g: g.gen, n: run.maxGen }) : ctx.t('duck.c2.status', { g: g.gen, n: run.maxGen, f: `${Math.round(g.stats.fallFrac * 100)} %`, d: num(g.stats.medianDist) })}${run.speed !== 1 ? ` · ${run.speed}×` : ''}`;
          } else if (st.hacks.length && st.curve.length && st.curve.length < CEM.generations && view === 'c2') status.textContent = ctx.t('duck.c2.stopped', { hack: t(`duck.hack.${st.hacks[st.hacks.length - 1]}`) });
          else status.textContent = '';
        };
        uiRefresh();
        return () => {
          uiRefresh = null;
          pk.remove();
          pf.remove();
          panelK = null;
          panelF = null;
        };
      },
      onExit: () => {
        st.operating = false;
        if (S.stationActive === 'c') S.stationActive = null;
        sound.hero(false, 0, false, null);
        ctx.ui.status(null);
      },
    });
  };
  const vorbildOpen = (): boolean => st.hacks.filter((h) => NAMED_HACKS.includes(h)).length >= 2;
  ctx.addInteractable({ object: knob, label: T('duck.act'), hint: T('duck.actHint'), onInteract: operate, range: 2.6 });

  // Space: Los (C1), 4× during a replay, skip the slow motion
  ctx.input.onKey(
    ['Space'],
    () => {
      if (!st.operating) return;
      if (st.slowmo) return endSlowmo();
      const run = st.run;
      if (run && run.kind !== 'c1') {
        spaceFast = !spaceFast;
        run.speed = spaceFast ? REPLAY.speedFast : st.firstView ? REPLAY.speedRepeat : 1;
        uiRefresh?.();
      } else if (!run && !st.track && st.step === 'c1') void startRun('c1');
      else if (st.track) st.track.speed = Math.max(st.track.speed, REPLAY.speedFast * 2);
    },
    { whileOperating: true },
  );

  // ── per frame ──────────────────────────────────────────────────────────────
  let uiAcc = 0;
  let wasPaused = false;
  const watchdog = window.setInterval(() => {
    // frozen panels / pause: the zone's update stops, so does the worker (plan §5.9)
    const idle = performance.now() - st.lastUpdate > 400;
    if (idle !== wasPaused) {
      wasPaused = idle;
      st.engine?.pause(idle);
    }
  }, 200);
  ctx.onDispose(() => window.clearInterval(watchdog));
  ctx.events.on('game:pause', () => st.engine?.pause(true));
  ctx.events.on('game:resume', () => st.engine?.pause(false));

  const update = (dt: number): void => {
    st.lastUpdate = performance.now();
    st.idleFar = 0;
    if (wasPaused) {
      wasPaused = false;
      st.engine?.pause(false);
    }
    // prewarm: the worker compiles and loads the model while the player walks up (plan §5.4)
    if (!st.engineWait && ctx.playerDistance < WORKER.prewarmDistance) void getEngine();
    const run = st.run;
    if (st.slowmo) updateSlowmo(dt);
    else if (st.track) updateTrack(dt);
    else if (run?.cur) {
      run.replayT += dt * run.speed;
      const g = run.cur;
      const tt = Math.min(REPLAY.seconds, run.replayT);
      field.pose(replayOf(g), tt);
      // falls: plock density, dimmed tiles
      let n = 0;
      for (let i = 0; i < g.pop && i < FIELD.ducks; i++) {
        if (!run.fallen[i] && g.fallT[i] >= 0 && g.fallT[i] <= tt) {
          run.fallen[i] = 1;
          n++;
        }
      }
      if (n) {
        sound.falls(n, [FIELD.x0 + 4, 0.6, FIELD.zc]);
        field.tint(run.worlds === 'train' ? g.friction : null, run.fallen as unknown as ArrayLike<boolean>);
      }
      if (run.replayT >= REPLAY.seconds) endReplay(run);
    }
    // the live hero: reset at the end of the track or 2 s after a fall
    if (st.heroLive && !st.track && st.engine?.kind === 'live') {
      if (st.heroDist > TRACK_LAYOUT.length - 0.2 || (st.heroFell && ctx.time.elapsed - st.heroFell > 2)) heroOn(heroParams());
    }
    if (hero) hero.updateLod(ctx.camera, window.innerHeight);
    pushUpdate();
    field.update();
    uiAcc += dt;
    if (uiAcc > 0.25) {
      uiAcc = 0;
      uiRefresh?.();
    }
  };
  const updateFar = (dt: number): void => {
    // the field's ducks stand before the player arrives (the detail tier shows from 45 m)
    if (!st.bodiesWait && ctx.playerDistance < WORKER.prewarmDistance + 35 && ctx.time.elapsed - st.bodiesTry > 10) {
      st.bodiesTry = ctx.time.elapsed;
      void loadBodies().catch(() => undefined);
    }
    // terminate the worker 60 s after the player left the Regelgarten (≥ 60 m; plan §5.4, §5.9)
    if (!st.engine || st.engine.kind !== 'live' || ctx.playerDistance < WORKER.leaveDistance) return;
    st.idleFar += dt;
    if (st.idleFar >= WORKER.idleSeconds) {
      cancelRun();
      heroOff();
      st.engine.dispose();
      st.engine = null;
      st.engineWait = null;
      st.idleFar = 0;
    }
  };

  // ── debug hooks (solve-c, album, stars3-c, the slow-motion flash sequence) ───
  const goStation = async (): Promise<void> => {
    if (ctx.playerDistance > 20) {
      ctx.player.teleport([-5.6, 0, 4.4], { yawDeg: 90 });
      await new Promise<void>((r) => ctx.after(0.3, r));
    }
  };
  const solve = async (): Promise<void> => {
    await goStation();
    const e = await getEngine();
    if (!e) return;
    if (!st.handBest) st.handBest = { median: 0.1, falls: 40 };
    if (!st.gait) {
      st.gait = [...DEBUG.walkGait];
      st.gaitGen = CEM.generations;
      st.curve = [{ gen: CEM.generations, median: 0.5, falls: 8, n: 64 }];
    }
    if (st.step !== 'c3') st.step = 'c3';
    persist();
    await testTrackFast('one');
  };
  /** debug: the 20 runs without the 5 s lane replay */
  const testTrackFast = async (kind: 'one' | 'rand'): Promise<void> => {
    const e = await getEngine();
    const gait = kind === 'one' ? st.gait : st.robust;
    if (!e || !gait) return;
    const out = await e.track(gait, TRACK.runs, TRACK.seed);
    finishTrack({ kind, out, t: 0, speed: 1, round: 0 });
  };
  const album = async (): Promise<void> => {
    await solve();
    if (!ctx.pass.unlockAlbum('sim-to-real-luecke')) return;
  };
  const stars3 = async (): Promise<void> => {
    await solve();
    for (const h of ['bauchklatscher', 'statue'] as HackId[]) if (!st.hacks.includes(h)) st.hacks.push(h);
    st.robust = [...DEBUG.robustGait];
    persist();
    await testTrackFast('rand');
    submitStars();
  };
  ctx.debug.register('c-run', () => void startRun('c2'));
  ctx.debug.register('c-hand', () => void startRun('c1'));
  ctx.debug.register('c-deck', () => setDeck({ ...DECKS.start }));
  ctx.debug.register('c-engine', async () => {
    const e = await getEngine();
    return e ? { kind: e.kind, reason: e.reason, pop: e.pop, timings: e.timings.slice() } : { kind: null, error: st.engineFail };
  });
  ctx.debug.register('c-state', () => status());
  ctx.debug.register('c-bench', async () => {
    const e = await getEngine();
    return e instanceof LiveEngine ? { kind: 'live', ...(await e.bench(20000)), timings: e.timings.slice() } : { kind: e?.kind ?? null };
  });
  ctx.debug.register('c-fk', () => {
    // the hero's skinned link frames vs the MuJoCo-frame pose they were placed from (R2 §7.6 step 3)
    if (!hero) return null;
    hero.object.updateMatrixWorld(true);
    const trunk = field.heroTrunk(new THREE.Vector3());
    return { visible: hero.object.visible, inScene: !!hero.object.parent, lod: hero.shownLod, tris: hero.triangles, trunkLocal: trunk.toArray().map((v) => +v.toFixed(3)), heroLive: st.heroLive };
  });
  // tool hooks (plan §5.10): __academy.ext('sequence:duck-slowmo') for flash-check, 'view:duckfield'
  // for drawcalls / perf / perf-cpu, 'duck' for tools/mujoco-check.mjs
  type Ext = (name: string, fn: (...a: never[]) => unknown) => (() => void) | undefined;
  const ext = (window as unknown as { __academy?: { ext?: Ext } }).__academy?.ext;
  const exts: ((() => void) | undefined)[] = [];
  exts.push(
    ext?.('sequence:duck-slowmo', async () => {
      await goStation();
      const e = await getEngine();
      if (!e) return { ok: false, error: st.engineFail ?? 'no engine' };
      const run = `slowmo-${Date.now()}`;
      let g = await e.gen({ run, restart: true, gen: 1, deck: { ...DECKS.start }, curriculum: false, worlds: 'one', seed: DEBUG.bellyFlopSeed });
      g = await e.gen({ run, gen: 2, deck: { ...DECKS.start }, curriculum: false, worlds: 'one', seed: DEBUG.bellyFlopSeed + 2 * 7919 });
      const t0 = performance.now();
      const elite = g.elite.length ? g.elite[0] : 0;
      const tf = g.fallT[elite] >= 0 ? g.fallT[elite] : 1.5;
      await new Promise<void>((res) => slowmo(g, elite, Math.max(0, tf - 0.7), Math.min(4, tf + 0.25), res));
      return { ok: true, seconds: (performance.now() - t0) / 1000, hack: g.hack, reducedMotion: ctx.settings.reducedMotion };
    }),
  );
  exts.push(
    // robust-check --only worker (plan §5.8): Workers blocked → the station runs on the recordings
    ext?.('robust:worker', async () => {
      await goStation();
      await getEngine();
      if (!st.operating) operate();
      return { kind: st.engine?.kind ?? null, reason: st.engine?.reason ?? null };
    }),
  );
  exts.push(
    ext?.('view:duckfield', async () => {
      // on the desk's step, facing the field; a C2 run of the walking deck replays while the worker
      // computes the next generation (the measured state of §5.5)
      ctx.player.teleport([-5.7, CONSOLE.step, 3.3], { yawDeg: 98, pitchDeg: -14 });
      await new Promise<void>((r) => ctx.after(0.4, r));
      const e = await getEngine();
      if (!e) return () => undefined;
      setDeck({ ...DECKS.fix });
      void startRun('c2');
      await new Promise<void>((r) => ctx.after(1.5, r));
      return () => cancelRun();
    }),
  );
  exts.push(
    ext?.('duck', async (o: { op: string; deck?: string; gens?: number; seed?: number; steps?: number; factor?: number }) => {
      const e = await getEngine();
      if (o.op === 'engine') return e ? { kind: e.kind, reason: e.reason, pop: e.pop, links: st.links.length, wasm: e instanceof LiveEngine ? e.wasm : null } : { kind: null, error: st.engineFail };
      if (!e) return { error: st.engineFail ?? 'no engine' };
      if (o.op === 'bench') return e instanceof LiveEngine ? await e.bench(o.steps ?? 20000) : { kind: e.kind };
      if (o.op === 'slow') {
        if (e instanceof LiveEngine) {
          e.slow(o.factor ?? 1);
          e.pop = CEM.population;
        }
        return { kind: e.kind, factor: o.factor ?? 1 };
      }
      if (o.op === 'train') {
        // generations without the replay (the worker's own timing), as R2 §7.6 measures them
        const deck = { ...(DECKS as Record<string, Deck>)[o.deck ?? 'walk'] };
        const run = `tool-${Date.now()}`;
        const out: { gen: number; workMs: number; ms: number; pop: number; median: number; fall: number; hack: string | null; meanDist?: number }[] = [];
        let mu: number[] | null = null;
        try {
          for (let g = 1; g <= (o.gens ?? 14); g++) {
            const t0 = performance.now();
            const r = await e.gen({ run, restart: g === 1, gen: g, deck, curriculum: false, worlds: 'one', seed: (o.seed ?? 1) * 1000 + g });
            out.push({ gen: g, workMs: Math.round(r.workMs), ms: Math.round(performance.now() - t0), pop: r.pop, median: +r.stats.medianDist.toFixed(3), fall: +r.stats.fallFrac.toFixed(2), hack: r.hack });
            mu = r.mu;
          }
        } catch (err) {
          // too slow even at the halved population: the station has switched to the recordings
          return { gens: out, error: err instanceof Error ? err.message : String(err), kind: st.engine?.kind ?? null, reason: st.engine?.reason ?? null };
        }
        // the trained mean in the one world (64 identical copies: their median is its distance)
        const ev = mu ? await e.gen({ run: `${run}-eval`, restart: true, gen: 1, deck, curriculum: false, worlds: 'one', seed: 1, fixed: mu }) : null;
        return { gens: out, mu, mean: ev ? { dist: +ev.stats.medianDist.toFixed(3), fell: ev.stats.fallFrac > 0.5 } : null, kind: e.kind, pop: e.pop };
      }
      if (o.op === 'state') return status();
      return { error: `unknown op ${o.op}` };
    }),
  );
  ctx.onDispose(() => exts.forEach((u) => typeof u === 'function' && u()));

  const status = (): Record<string, unknown> => ({
    engine: st.engine ? { kind: st.engine.kind, reason: st.engine.reason, pop: st.engine.pop } : null,
    step: st.step,
    deck: { ...st.deck },
    curriculum: st.curriculum,
    run: st.run ? { kind: st.run.kind, gen: st.run.gen, replaying: !!st.run.cur, speed: st.run.speed, hack: st.run.hack, curHack: st.run.cur?.hack ?? null } : null,
    track: st.track ? { kind: st.track.kind, round: st.track.round } : null,
    slowmo: !!st.slowmo,
    hacks: st.hacks.slice(),
    gait: !!st.gait,
    curve: st.curve.map((c) => [c.gen, +c.median.toFixed(3), c.falls]),
    trackOne: st.trackOne,
    trackRand: st.trackRand,
    stars: starsNow(),
    heroLive: st.heroLive,
    links: st.links.length,
  });

  return {
    update,
    updateFar,
    operate,
    onEnter() {
      if (st.operating && !st.run) heroOn(heroParams());
    },
    onExit() {
      cancelRun();
      if (st.track) finishTrack(st.track);
      if (st.slowmo) endSlowmo();
      heroOff();
    },
    nextStep: () => (ctx.pass.has('lauf-ente') ? null : st.step),
    solve,
    album,
    stars3,
    get status() {
      return status();
    },
    dispose() {
      cancelRun();
      st.engine?.dispose();
      st.engine = null;
      sound.stop();
    },
  };
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

/**
 * The duck's LOD2 bodies for the field: ctx.robots.bodies() (WP4 adapter over WP0's
 * RobotLibrary.bodies). Until the adapter wires it, the same split is made here from a template
 * model's articulated LOD2 skinned mesh (one body per bone, in the bone's link frame).
 */
async function bodiesOf(ctx: ZoneContext): Promise<readonly RobotBody[]> {
  try {
    return await ctx.robots.bodies(ROBOT, 2);
  } catch {
    const tpl = await ctx.robots.load(ROBOT, { lod: 2, castShadow: false });
    try {
      let mesh: THREE.SkinnedMesh | null = null;
      tpl.object.traverse((n) => {
        if ((n as THREE.SkinnedMesh).isSkinnedMesh && !mesh) mesh = n as THREE.SkinnedMesh;
      });
      if (!mesh) throw new Error('duck: no skinned mesh');
      return splitBodies((mesh as THREE.SkinnedMesh).geometry, (mesh as THREE.SkinnedMesh).skeleton);
    } finally {
      tpl.dispose();
    }
  }
}

function splitBodies(geo: THREE.BufferGeometry, skeleton: THREE.Skeleton): RobotBody[] {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const col = geo.attributes.color;
  const jnt = geo.attributes.skinIndex;
  const index = geo.index!;
  const nb = skeleton.bones.length;
  const tris: number[][] = Array.from({ length: nb }, () => []);
  for (let f = 0; f < index.count; f += 3) tris[jnt.getX(index.getX(f))].push(index.getX(f), index.getX(f + 1), index.getX(f + 2));
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  const out: RobotBody[] = [];
  for (let b = 0; b < nb; b++) {
    const list = tris[b];
    if (!list.length) continue;
    const inv = skeleton.boneInverses[b];
    nm.getNormalMatrix(inv);
    const map = new Map<number, number>();
    const P: number[] = [];
    const N: number[] = [];
    const C: number[] = [];
    const I = new Uint32Array(list.length);
    list.forEach((g, k) => {
      let l = map.get(g);
      if (l === undefined) {
        l = P.length / 3;
        map.set(g, l);
        v.fromBufferAttribute(pos, g).applyMatrix4(inv);
        P.push(v.x, v.y, v.z);
        v.fromBufferAttribute(nrm, g).applyMatrix3(nm).normalize();
        N.push(v.x, v.y, v.z);
        if (col) C.push(col.getX(g), col.getY(g), col.getZ(g));
      }
      I[k] = l;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setIndex(new THREE.BufferAttribute(P.length / 3 > 65535 ? I : new Uint16Array(I), 1));
    g.computeBoundingSphere();
    out.push({ link: skeleton.bones[b].userData.link as string, geometry: g });
  }
  return out;
}

export type { Text };
