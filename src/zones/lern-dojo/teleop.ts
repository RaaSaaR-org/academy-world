/**
 * Lern-Dojo · the bench console: Station A „Vormachen“ and Station B „Befehlen“ ◆ (plan §4.5, R1 §10).
 *
 * A  You guide the real SO-101 leader with the mouse (the cursor is the jaw centre over the bench;
 *    hold LMB = lower, Space or RMB = grip, Q/E = wrist roll); the follower copies it with its servo lag
 *    through the safety layer. A demo records from the first movement and ends by itself when the
 *    cube rests in the Kiste; → keeps and goes on, ← discards (as lerobot-record). The game puts the
 *    cube on the next start field („In echt legst du ihn selbst zurück …“).
 * B  Train (3 s), then command in words: „Leg den roten Würfel in die Kiste.“ ✓ (it copies your
 *    hesitation); the zone's one prediction („Was tut der Arm?“ — red on a spot no demo started from,
 *    blue on a recorded field: it takes blue); two disturbance cards on the route (Neue Lage, Anderes
 *    Wort); the rescue (4 demos with both cubes and alternating words, retrain: now „blau“ works). Two
 *    discovery cards at the bench (★★★): the lamp's Abendlicht (fix: „Helligkeit variieren“ +
 *    retrain) and the knocked camera (fix: „Kamera festschrauben“).
 *    Entscheider: 50 preloaded demos (5 fields × 10), one command, the prediction, the two route cards,
 *    then „Lade 40 Demos mit zwei Farben“ → retrain → ✓ (≈ 3.5 min).
 *
 * The simulation is lab.ts (Node-tested by tools/lerndojo-check.mjs); this file is input, UI, timing.
 */
import * as THREE from 'three';
import type { ChallengeHandle, EmiHandle, Stars, Text, ZoneContext } from '@/core/zones';
import { CLOCK, COLOURS, GRIPPER, IK, LAYOUT, POLICY, STATION_A, STATION_B, TELEOP, VISION, type CubeColour } from './tuning';
import { JOINTS, NJ } from './kin';
import { SETUPS, fieldCube, hopeless, resultOf, type DojoLab, type Model, type PlacedCube } from './lab';
import { O_HELD, O_Q, SV, Take, aStars, aSummary, demoMeta, fieldAt, type Demo, type DemoKind } from './demo';
import { EXPERT_STYLES, Expert, mulberry32, wrapQuarter } from './expert';
import type { PolicyRun, RunStatus } from './policy';
import { ColourClasses, DAYLIGHT, DUSK, NO_BUMP, render } from './vision';
import { sceneOf } from './policy';
import type { Arms } from './arms';
import type { Bench3D, MatState } from './bench3d';
import type { Brain, NeighbourInfo } from './brain';
import type { Cloud, RibbonSpec } from './ribbons';
import type { DojoSounds } from './sound';
import { createWristView } from './wrist';

export type Stage = 'A' | 'B-load' | 'B-train' | 'B-first' | 'B-predict' | 'B-cards' | 'B-rescue' | 'B-test' | 'done';
type Phase = 'idle' | 'armed' | 'record' | 'review' | 'home' | 'train' | 'run' | 'gen';
type RunKind = 'first' | 'predict' | 'newPose' | 'otherWord' | 'dusk' | 'camera' | 'test' | 'free' | 'valve';
type CardId = 'newPose' | 'otherWord' | 'dusk' | 'camera';
type CardState = 'hidden' | 'open' | 'failed' | 'fixed';
type Choice = CubeColour | 'nichts';

export interface TeleopDeps {
  ctx: ZoneContext;
  lab: DojoLab;
  arms: Arms;
  bench: Bench3D;
  brain: Brain;
  cloud: Cloud;
  sounds: DojoSounds;
  chA: ChallengeHandle;
  chB: ChallengeHandle;
  emi: () => EmiHandle | null;
  /** objective / HUD refresh after a progress change */
  changed: () => void;
}

export interface Teleop {
  update(dt: number, t: number): void;
  readonly stage: Stage;
  readonly operating: boolean;
  /** open the bench console */
  enter(): void;
  /** where the objective points (local) */
  readonly target: [number, number, number];
  // solve hooks (deterministic, synchronous simulation)
  solveA(): void;
  solveB(): void;
  stars3A(): void;
  stars3B(): void;
  solveAlbum(): void;
  /** the lift-off beat: the SO-101 hands you the M4 valve */
  valveReady(): void;
  /** 'view:lerndojo-b': the console in B with a policy run going */
  viewB(): Promise<() => void>;
  autopilot(on: boolean): void;
  debugState(): Record<string, unknown>;
  hook(name: string, arg?: unknown): unknown;
  /** demo paths for the far cloud */
  examplePaths(): RibbonSpec[];
}

const F = LAYOUT.fields;
const CUBE_HALF = 0.015;
const DEG = Math.PI / 180;

export function createTeleop(deps: TeleopDeps): Teleop {
  const { ctx, lab, arms, bench, brain, cloud, sounds, chA, chB } = deps;
  const sim = lab.sim;
  const T = (k: string, p?: Record<string, string | number>): string => ctx.t(k, p);
  const X = (k: string, p?: Record<string, string | number>): Text => ctx.i18n.text(k, p);
  const rng = mulberry32((Date.now() & 0xffff) ^ 0x50101);
  const rm = (): boolean => ctx.settings.reducedMotion;

  // ── state ──────────────────────────────────────────────────────────────────
  const demos: Demo[] = [];
  let model: Model | null = null;
  /** demos in the model (to see whether a retrain is due) */
  let trainedOn = -1;
  let jitter = false;
  let dusk = false;
  let bumped = false;
  let phase: Phase = 'idle';
  let take: Take | null = null;
  let takeKind: { target: CubeColour; word: CubeColour; rescue: boolean } = { target: 'rot', word: 'rot', rescue: false };
  let review: { demo: Demo; until: number; failed: boolean } | null = null;
  let run: PolicyRun | null = null;
  let runKind: RunKind = 'free';
  let runSpeed = 1;
  const viewed = new Set<RunKind>();
  let trainT = 0;
  let homeFrom: Float64Array | null = null;
  let homeTo: Float64Array = Float64Array.from(lab.home);
  let homeT = 0;
  let homeS = 0.6;
  let afterHome: (() => void) | null = null;
  let gen: { todo: (() => Demo)[]; done: Demo[]; total: number; t: number; onDone: (d: Demo[]) => void } | null = null;
  let operating = false;
  let exitOperate: (() => void) | null = null;
  let view: 'bench' | 'watch' = 'bench';
  let autopilot: Expert | null = null;
  let autopilotOn = false;
  let nextField = 0;
  let resetHintShown = false;
  let word: CubeColour = 'rot';
  let lastRun: { kind: RunKind; status: RunStatus; boxed: CubeColour | null; goal: CubeColour | null } | null = null;
  let unattendedOn = false;
  const B = {
    first: false,
    predicted: null as Choice | null,
    predOutcome: null as Choice | null,
    cards: { newPose: 'open', otherWord: 'open', dusk: 'hidden', camera: 'hidden' } as Record<CardId, CardState>,
    rescueK: 0,
    rescueDemos: 0,
    tested: false,
  };
  // the player's input
  const input = { cursor: null as { x: number; z: number } | null, low: false, grip: GRIPPER.open as number, roll: 0, zoom: 1 };
  const jaw = new THREE.Vector3(LAYOUT.home.x, LAYOUT.home.y, LAYOUT.home.z);
  const leaderCmd = Float64Array.from(lab.home);
  const ikOut = new Float64Array(NJ);
  let lastIkErr = 0;
  let lastPointer: unknown = null;
  const wrist = createWristView(192, 120);

  const aDone = (): boolean => ctx.pass.has('vormachen');
  // earned for real: a grey „übersprungen“ stamp (the example demos, or an rc4 save) is upgraded when A is
  // played after all (Progress.awardStamp; Integrate, wave 2: the rc4-mid playtest found A never stamped)
  const aEarned = (): boolean => !!ctx.pass.snapshot().stamps.find((x) => x.zoneId === ctx.id && x.stationId === 'vormachen' && x.record && !x.record.skipped);
  const bDone = (): boolean => ctx.pass.has('nachmachen');
  const playerDemos = (): Demo[] => demos.filter((d) => d.kind === 'player');
  const okDemos = (): Demo[] => demos.filter((d) => d.ok);
  const twoColour = (): Demo[] => demos.filter((d) => d.ok && d.cubes.length > 1);
  const needsTrain = (): boolean => !model || trainedOn !== demos.length || (model.jitter !== jitter);

  const stage = (): Stage => {
    if (bDone() && B.tested) return 'done';
    if (!aDone() && playerDemos().filter((d) => d.ok).length < STATION_A.keep && !demos.some((d) => d.kind === 'example')) return ctx.mode === 'entscheider' ? 'B-load' : 'A';
    if (demos.length === 0) return 'B-load';
    if (bDone()) return 'done';
    if (!model) return 'B-train';
    if (!B.first) return 'B-first';
    if (B.predicted == null || B.predOutcome == null) return 'B-predict';
    if (B.cards.newPose === 'open' || B.cards.otherWord === 'open') return 'B-cards';
    if (twoColour().length < STATION_B.rescueDemos || (model.selector.contrast < STATION_B.rescueDemos)) return 'B-rescue';
    return 'B-test';
  };

  // ── EMI ────────────────────────────────────────────────────────────────────
  const react = (lines: Text | Text[]): void => {
    const e = deps.emi();
    if (e) void e.say(lines, { interrupt: true });
    else void ctx.hud.say(lines, { speaker: 'EMI-05 ›', interrupt: true });
  };
  const unattended = (on: boolean): void => {
    if (on === unattendedOn) return;
    unattendedOn = on;
    ctx.game.unattended(on, 'nachmachen');
  };

  // ── scenes on the bench ────────────────────────────────────────────────────
  const fieldDemos = (): number[] => F.map((_, i) => okDemos().filter((d) => d.field === i).length);
  /** A: the next start field (the one with the fewest demos, in order) */
  const pickNextField = (): number => {
    const n = fieldDemos();
    let best = 0;
    for (let i = 0; i < F.length; i++) if (n[i] < n[best]) best = i;
    // cycle: after a kept demo on `nextField`, the following one with the same count
    for (let k = 1; k <= F.length; k++) {
      const i = (nextField + k) % F.length;
      if (n[i] === n[best]) return i;
    }
    return best;
  };
  const yawJit = (): number => (rng() - 0.5) * 0.08;
  const placeJit = (c: PlacedCube): PlacedCube => ({ ...c, x: c.x + (rng() - 0.5) * 0.003, z: c.z + (rng() - 0.5) * 0.003, yaw: c.yaw + yawJit() });
  const marks: MatState['marks'] = [];
  let policyPath: Float32Array | null = null;
  let demoPathLast: Float32Array | null = null;
  const redrawMat = (): void => bench.drawMat({ fieldDemos: fieldDemos(), nextField: stage() === 'A' || phase === 'armed' ? nextField : -1, marks, policyPath, demoPath: demoPathLast });
  const setScene = (cubes: readonly PlacedCube[], o: { marks?: MatState['marks'] } = {}): void => {
    lab.setup(cubes.map(placeJit));
    marks.length = 0;
    if (o.marks) marks.push(...o.marks);
    jaw.set(LAYOUT.home.x, LAYOUT.home.y, LAYOUT.home.z);
    leaderCmd.set(lab.home);
    input.grip = GRIPPER.open;
    input.roll = 0;
    sounds.place();
    redrawMat();
  };
  const firstField = (): number => {
    const has = (i: number): boolean => okDemos().some((d) => d.field === i && d.cubes.length === 1);
    if (has(STATION_B.firstField)) return STATION_B.firstField;
    const last = [...okDemos()].reverse().find((d) => d.field >= 0);
    return last ? last.field : STATION_B.firstField;
  };
  const recordedField = (avoid: number): number => {
    const n = fieldDemos();
    const order = [2, 1, 3, 0, 4].filter((i) => i !== avoid);
    return order.find((i) => n[i] > 0) ?? order[0];
  };
  const NEW_MARK = (i: number): MatState['marks'][number] => ({ ...LAYOUT.newSpots[i], label: T('mat.new') });

  // ── ribbons and the mat ────────────────────────────────────────────────────
  const _g = new THREE.Vector3();
  const pathOf = (d: Demo, step = 2): { path: Float32Array; n: number } => {
    const n = Math.ceil(d.n / step);
    const path = new Float32Array(n * 3);
    for (let i = 0, k = 0; i < d.n; i += step, k++) {
      lab.fk.setAll(d.s.subarray(i * SV + O_Q, i * SV + O_Q + NJ));
      lab.fk.jawCentre(_g);
      path[k * 3] = _g.x;
      path[k * 3 + 1] = _g.z;
      path[k * 3 + 2] = d.s[i * SV + O_HELD];
    }
    return { path, n };
  };
  const policyRibbons: { path: Float32Array; n: number; ok: boolean }[] = [];
  let newestUntil = 0;
  const rebuildCloud = (): void => {
    const list: RibbonSpec[] = [];
    const kept = okDemos().slice(-12).reverse();
    const now = ctx.time.elapsed;
    kept.forEach((d, i) => {
      const p = pathOf(d, 3);
      list.push({ kind: i === 0 && now < newestUntil ? 'demo-new' : 'demo', path: p.path, n: p.n, age: kept.length > 1 ? i / (kept.length - 1) : 0 });
    });
    policyRibbons
      .slice(-4)
      .reverse()
      .forEach((r, i, arr) => list.push({ kind: r.ok ? 'policy' : 'policy-fail', path: r.path, n: r.n, age: arr.length > 1 ? i / (arr.length - 1) : 0 }));
    cloud.setRibbons(list);
  };
  const live = { path: new Float32Array(3 * 1200), n: 0 };
  const pushLive = (): void => {
    if (live.n >= 1200) return;
    sim.arm.jawCentre(_g);
    live.path[live.n * 3] = _g.x;
    live.path[live.n * 3 + 1] = _g.z;
    live.path[live.n * 3 + 2] = sim.held >= 0 ? 1 : 0;
    live.n++;
  };

  // ── the bench's events: juice ──────────────────────────────────────────────
  sim.events = {
    grasp: () => sounds.jaw(true),
    slip: (i) => {
      const c = sim.cubes[i];
      ctx.game.juice.popup(bench.toLocal(c.p.x, 0.08, c.p.z), X('a.slipPop'), { tone: 'muted', seconds: 1.1 });
      ctx.audio.tone({ freq: 900, to: 500, dur: 0.12, type: 'sine', volume: 0.12 });
    },
    release: (i) => {
      const c = sim.cubes[i];
      const B = LAYOUT.box;
      if (Math.abs(c.p.x - B.x) < B.w / 2 && Math.abs(c.p.z - B.z) < B.d / 2) ctx.after(0.09, () => sounds.clack(Math.min(1, (c.p.y - 0.02) / 0.07)));
    },
  };

  // ── takes (A, the rescue, free demos) ──────────────────────────────────────
  let demoId = 0;
  const startTake = (target: CubeColour, w: CubeColour, rescue = false): void => {
    takeKind = { target, word: w, rescue };
    take = new Take(sim, COLOURS.indexOf(target), w, { light: dusk ? 'dusk' : 'day', bump: bumped ? VISION.bump : NO_BUMP });
    sim.resetCounters();
    // the hand waits at home until the mouse moves (the recording starts with the player's first move)
    input.cursor = null;
    input.low = false;
    phase = 'armed';
    live.n = 0;
    renderPanel();
  };
  /** A's next take: the red cube on the next field */
  const armA = (): void => {
    nextField = pickNextField();
    setScene([fieldCube(nextField, 'rot')]);
    startTake('rot', 'rot');
  };
  const armRescue = (): void => {
    const s = SETUPS.rescue(B.rescueK);
    setScene(s.cubes);
    word = s.word;
    startTake(s.word, s.word, true);
  };
  const finishTake = (): void => {
    const t = take!;
    take = null;
    const d = t.finish(++demoId, autopilotOn ? 'expert' : 'player');
    if (autopilotOn) d.kind = 'player';
    const ok = t.status === 'done';
    if (ok) {
      // a rescue demo must move the commanded cube
      keepDemo(d);
      review = { demo: d, until: ctx.time.elapsed + TELEOP.reviewS, failed: false };
      phase = 'review';
    } else {
      review = { demo: d, until: Infinity, failed: true };
      phase = 'review';
      sounds.failure();
      ctx.game.juice.popup(bench.toLocal(sim.cubes[COLOURS.indexOf(takeKind.target)].p.x, 0.1, sim.cubes[COLOURS.indexOf(takeKind.target)].p.z), X('a.missPop'), { tone: 'bad', seconds: 1.6 });
      ctx.hud.toast(X('toast.demoFail'), { kind: 'warn', duration: 4 });
    }
    renderPanel();
  };
  const keepDemo = (d: Demo): void => {
    demos.push(d);
    newestUntil = ctx.time.elapsed + 3;
    demoPathLast = (() => {
      const p = pathOf(d, 2);
      const out = new Float32Array(p.n * 2);
      for (let i = 0; i < p.n; i++) {
        out[i * 2] = p.path[i * 3];
        out[i * 2 + 1] = p.path[i * 3 + 1];
      }
      return out;
    })();
    rebuildCloud();
    ctx.after(3.1, rebuildCloud);
    redrawMat();
    persist();
    if (!d.ok) return;
    sounds.chime();
    sounds.shimmer();
    const box = bench.toLocal(LAYOUT.box.x, 0.12, LAYOUT.box.z);
    const n = playerDemos().filter((x) => x.ok).length;
    ctx.game.juice.popup(box, X('a.demoPop', { n, t: ctx.i18n.num(d.dur, 1) }), { tone: 'good', seconds: 1.6 });
    ctx.game.juice.cue('good', { at: box, pitch: 1 + 0.06 * Math.min(5, n) });
    if (takeKind.rescue) {
      B.rescueK++;
      B.rescueDemos++;
      ctx.hud.toast(X('toast.rescueDemo', { n: Math.min(B.rescueK, STATION_B.rescueDemos), m: STATION_B.rescueDemos }), { kind: 'success', duration: 2.5 });
      return;
    }
    ctx.hud.toast(X('toast.demoOk', { n, t: ctx.i18n.num(d.dur, 1) }), { kind: 'success', duration: 2.5 });
    if (n === 1 && !aDone()) react(X('emi.firstDemo'));
    checkA();
  };
  const discardReview = (): void => {
    const r = review;
    review = null;
    if (!r) return;
    if (!r.failed) {
      const i = demos.indexOf(r.demo);
      if (i >= 0) demos.splice(i, 1);
      if (takeKind.rescue) {
        B.rescueK = Math.max(0, B.rescueK - 1);
        B.rescueDemos = Math.max(0, B.rescueDemos - 1);
      }
      rebuildCloud();
      redrawMat();
      persist();
    }
    ctx.hud.toast(X('toast.discarded'), { kind: 'info', duration: 2 });
    sounds.whoosh();
    goHome(() => (takeKind.rescue ? armRescue() : stage() === 'A' || phase !== 'idle' ? redo() : null));
  };
  /** the same field again (← discard) */
  const redo = (): void => {
    if (takeKind.rescue) return armRescue();
    setScene([fieldCube(nextField, 'rot')]);
    startTake('rot', 'rot');
  };
  const keepFailed = (): void => {
    const r = review;
    review = null;
    if (!r) return;
    keepDemo(r.demo);
    ctx.hud.toast(X('toast.keptFail'), { kind: 'warn', duration: 4 });
    nextAfterTake();
  };
  /** after a take: home, then the next scene */
  const nextAfterTake = (): void => {
    review = null;
    goHome(() => {
      if (takeKind.rescue && B.rescueK < STATION_B.rescueDemos) armRescue();
      else if (takeKind.rescue) {
        phase = 'idle';
        react(X('emi.rescueRetrain'));
        renderPanel();
      } else if (stage() === 'A' || (!aDone() && ctx.mode === 'entdecker') || playerDemos().filter((d) => d.ok).length < STATION_A.target) {
        if (!resetHintShown) {
          resetHintShown = true;
          ctx.ui.hint(X('a.resetHint'), 5);
        }
        armA();
      } else {
        phase = 'idle';
        renderPanel();
      }
    });
  };
  /** move the arm to a pose over `secs` (the reset between demos, the valve hand-over) */
  const moveArm = (to: ArrayLike<number>, then: () => void, secs = 0.6): void => {
    homeFrom = Float64Array.from(sim.leader);
    homeTo = Float64Array.from(to);
    homeT = 0;
    homeS = secs;
    afterHome = then;
    phase = 'home';
    renderPanel();
  };
  const goHome = (then: () => void): void => moveArm(lab.home, then);

  // ── A: stamp and stars ────────────────────────────────────────────────────
  const checkA = (): void => {
    const s = aSummary(demos);
    const stars = aStars(s);
    chA.live(X('a.live', { n: s.kept, f: s.fields, t: ctx.i18n.num(s.mean, 1) }));
    if (stars < 1) return;
    const first = !aEarned();
    if (first) {
      ctx.pass.award('vormachen', { value: { de: `${s.kept} Demos · ${s.fields}/5 Felder · Ø ${s.mean.toFixed(1).replace('.', ',')} s`, en: `${s.kept} demos · ${s.fields}/5 fields · avg ${s.mean.toFixed(1)} s` }, curve: playerDemos().filter((d) => d.ok).map((d) => +d.dur.toFixed(2)) });
      react(X('emi.aDone', { n: s.fields }));
      deps.changed();
    }
    if (first || stars > chA.stars) {
      chA.submit(s.mean, { stars, detail: X('a.detail', { n: s.kept, f: s.fields, t: ctx.i18n.num(s.mean, 1), r: s.regrasps }) });
      if (stars >= 2) ctx.game.juice.burst(bench.toLocal(LAYOUT.box.x, 0.1, LAYOUT.box.z), { tone: 'teal', count: 24 });
    }
  };

  // ── B: training ────────────────────────────────────────────────────────────
  const train = (): void => {
    if (phase === 'run' || phase === 'train' || phase === 'record' || phase === 'gen' || demos.length === 0) return;
    review = null;
    take = null;
    model = lab.train(demos, jitter);
    trainedOn = demos.length;
    phase = 'train';
    trainT = STATION_B.trainS;
    sounds.trainHum(STATION_B.trainS);
    cloud.gust(0.4);
    unattended(true);
    ctx.hud.toast(X('toast.training', { d: demos.length, n: ctx.i18n.num(model.pairs, 0) }), { kind: 'info', duration: 2.6 });
    renderPanel();
  };
  const trainDone = (): void => {
    phase = 'idle';
    unattended(false);
    sounds.chime();
    if (!B.first) react(X('emi.trained'));
    else if (model && model.selector.contrast >= STATION_B.rescueDemos && !B.tested) react(X('emi.rescue'));
    prepareStage();
    renderPanel();
    deps.changed();
  };

  /** the scene a stage starts with */
  const prepareStage = (): void => {
    const s = stage();
    if (s === 'B-first') {
      word = 'rot';
      setScene([fieldCube(firstField(), 'rot')]);
    } else if (s === 'B-predict' && B.predicted == null) {
      word = 'rot';
      setScene(SETUPS.prediction(recordedField(-1)), { marks: [NEW_MARK(0)] });
    } else if (s === 'B-test') {
      word = 'blau';
      setScene(SETUPS.rescueTest());
    }
    redrawMat();
  };

  // ── B: runs ────────────────────────────────────────────────────────────────
  /** free play (after the chain): both cubes on the rescue fields, the green one too when it is asked for */
  const freeScene = (w: CubeColour): PlacedCube[] => {
    const s = SETUPS.rescueTest();
    if (w === 'gruen') s.push(fieldCube(2, 'gruen'));
    return s;
  };
  const startRun = (kind: RunKind, cubes: readonly PlacedCube[] | null, w: CubeColour): void => {
    if (!model || phase === 'run' || phase === 'train' || phase === 'gen') return;
    review = null;
    take = null;
    setScene(cubes ?? freeScene(w), { marks: marks.slice() });
    sim.resetCounters();
    word = w;
    run = lab.startRun(model, { word: w, light: dusk ? DUSK : DAYLIGHT, bump: bumped ? VISION.bump : NO_BUMP });
    runKind = kind;
    runSpeed = viewed.has(kind) ? STATION_B.replaySpeed : 1;
    viewed.add(kind);
    phase = 'run';
    live.n = 0;
    unattended(true);
    ctx.audio.play('open', { pitch: 1.2, volume: 0.4 });
    if (operating && view !== 'watch' && !rm() && kind !== 'valve') setView('watch');
    renderPanel();
  };
  const finishRun = (): void => {
    const r = run!;
    run = null;
    unattended(false);
    phase = 'idle';
    const res = resultOf(r, sim);
    lastRun = { kind: runKind, status: res.status, boxed: res.boxed, goal: res.goal };
    const ok = res.status === 'success';
    policyRibbons.push({ path: live.path.slice(0, live.n * 3), n: live.n, ok });
    if (policyRibbons.length > 6) policyRibbons.shift();
    cloud.setLive(null);
    rebuildCloud();
    policyPath = (() => {
      const out = new Float32Array(live.n * 2);
      for (let i = 0; i < live.n; i++) {
        out[i * 2] = live.path[i * 3];
        out[i * 2 + 1] = live.path[i * 3 + 1];
      }
      return out;
    })();
    redrawMat();
    const box = bench.toLocal(LAYOUT.box.x, 0.14, LAYOUT.box.z);
    if (ok) {
      sounds.chime();
      ctx.game.juice.popup(box, X('b.okPop', { t: ctx.i18n.num(res.t, 1) }), { tone: 'good', seconds: 2 });
      ctx.game.juice.cue('good', { at: box });
    } else sounds.failure();
    switch (runKind) {
      case 'first':
        B.first = true;
        if (ok) react(X('emi.firstOk'));
        else {
          react(X('emi.inDistFail'));
          if (demos.some((d) => !d.ok) && ctx.pass.unlockAlbum('policy-kopiert-fehler')) react(X('emi.album'));
        }
        break;
      case 'predict': {
        B.predOutcome = res.boxed ?? (res.first ? (res.first as CubeColour) : 'nichts');
        const right = B.predicted === B.predOutcome;
        ctx.pass.recordPrediction('nachmachen', right ? 1 : 0, 1, { min: 0, max: 1, scale: 'linear' });
        ctx.hud.toast(X(right ? 'toast.predRight' : 'toast.predWrong', { p: T(`cmd.name.${B.predicted}`), m: T(`cmd.name.${B.predOutcome}`) }), { kind: right ? 'success' : 'info', duration: 5 });
        if (B.predOutcome === 'blau') {
          react(X('emi.predictBlue'));
          ctx.game.juice.cue('oops', { at: box });
        }
        break;
      }
      case 'newPose':
        B.cards.newPose = ok ? 'fixed' : 'failed';
        if (!ok) {
          react(X('emi.newPose'));
          chB.fail(X('b.newPoseFail'));
        } else ctx.hud.toast(X('toast.lucky'), { kind: 'info', duration: 4 });
        break;
      case 'otherWord':
        B.cards.otherWord = res.status === 'success' ? 'fixed' : 'failed';
        if (res.boxed === 'rot') {
          react(X('emi.wordIgnored'));
          if (ctx.pass.unlockAlbum('wortblind')) ctx.game.juice.cue('star');
        }
        break;
      case 'dusk':
        if (!ok) {
          B.cards.dusk = 'failed';
          react(X('emi.dusk'));
        } else if (B.cards.dusk === 'failed' && jitter) {
          B.cards.dusk = 'fixed';
          react(X('emi.duskFixed'));
          submitB();
        }
        break;
      case 'camera':
        if (!ok && bumped) {
          B.cards.camera = 'failed';
          react(X('emi.camera'));
          ctx.pass.unlockAlbum('schleife');
        } else if (ok && !bumped && B.cards.camera === 'failed') {
          B.cards.camera = 'fixed';
          react(X('emi.cameraFixed'));
          submitB();
        }
        break;
      case 'test':
        if (ok) {
          ctx.game.juice.burst(box, { tone: 'teal', count: 30 });
          ctx.game.juice.cue('great', { at: box });
          B.tested = true;
          if (!bDone()) awardB();
          else submitB();
        } else react(X('emi.testFail'));
        break;
      case 'valve':
        break;
      default:
        break;
    }
    ctx.after(1.4, () => {
      if (phase === 'idle' && operating && view === 'watch' && !autopilotOn) setView('bench');
    });
    // the next step's scene, after a moment to see the result
    ctx.after(1.6, () => {
      if (phase === 'idle' && !bDone()) {
        prepareStage();
        renderPanel();
      }
    });
    renderPanel();
    understand();
    deps.changed();
  };

  // ── B: stamp and stars ────────────────────────────────────────────────────
  const starsB = (): Stars => {
    const two = twoColour();
    const own = two.filter((d) => d.kind === 'player').length;
    const s2 = B.tested && own >= STATION_B.rescueDemos && two.length <= STATION_B.rescueDemos;
    const s3 = s2 && B.cards.dusk === 'fixed' && B.cards.camera === 'fixed';
    return (1 + (s2 ? 1 : 0) + (s3 ? 1 : 0)) as Stars;
  };
  const submitB = (force = false): void => {
    if (!bDone()) return;
    const s = starsB();
    if (force || s > chB.stars) chB.submit(null, { stars: s, detail: X('b.detail', { n: twoColour().length }) });
  };
  const awardB = (): void => {
    const n = twoColour().length;
    ctx.pass.award('nachmachen', {
      value: { de: `rot ✓ · Wort ignoriert ✗ → +${n} Demos → blau ✓`, en: `red ✓ · word ignored ✗ → +${n} demos → blue ✓` },
      curve: [1, 0, 1],
    });
    ctx.pass.setBest('rescueDemos', n, 'lower');
    submitB(true);
    ctx.pass.awardQuestion(8);
    ctx.pass.awardQuestion(6);
    react([X('emi.rescue'), X('emi.card6')]);
    void deps.emi()?.gesture('point');
    deps.changed();
    if (ctx.mode === 'entscheider') ctx.after(5.5, () => ctx.events.emit('lern-dojo:befund'));
  };

  // ── B: cards and fixes ────────────────────────────────────────────────────
  const playCard = (id: CardId): void => {
    if (!model || phase === 'run' || phase === 'train') return;
    if (id === 'newPose') startRun('newPose', SETUPS.newPose(), 'rot');
    else if (id === 'otherWord') startRun('otherWord', SETUPS.otherWord(recordedField(-1)), 'blau');
    else if (id === 'dusk') startRun('dusk', [fieldCube(recordedField(-1), 'rot')], 'rot');
    else if (id === 'camera') startRun('camera', [fieldCube(recordedField(-1), 'rot')], 'rot');
    if (id === 'newPose') {
      marks.length = 0;
      marks.push(NEW_MARK(1));
      redrawMat();
    }
  };
  const setDusk = (on: boolean): void => {
    dusk = on;
    bench.setDusk(on);
    if (on && B.cards.dusk === 'hidden') {
      B.cards.dusk = 'open';
      ctx.hud.toast(X('toast.duskFound'), { kind: 'info', duration: 4 });
      ctx.game.juice.cue('star');
    }
    renderPanel();
  };
  const setBump = (on: boolean): void => {
    bumped = on;
    bench.setCameraBump(on ? VISION.bump.x : 0, on ? VISION.bump.z : 0);
    if (on && B.cards.camera === 'hidden') {
      B.cards.camera = 'open';
      ctx.hud.toast(X('toast.cameraFound'), { kind: 'info', duration: 4 });
      ctx.game.juice.cue('star');
    }
    ctx.audio.play(on ? 'drop' : 'click', { volume: 0.5 });
    renderPanel();
  };

  // ── Entscheider: preloaded sets ───────────────────────────────────────────
  const loadSet = (which: 'first' | 'second'): void => {
    if (gen || phase === 'run' || phase === 'train') return;
    const todo: (() => Demo)[] = [];
    if (which === 'first') {
      for (let k = 0; k < STATION_B.preload.first; k++) {
        const f = k % F.length;
        todo.push(() => lab.expertDemo([placeJit(fieldCube(f, 'rot'))], 'rot', 'rot', 4000 + k * 17, k, 'example'));
      }
    } else {
      for (let k = 0; k < STATION_B.preload.second; k++) {
        const s = SETUPS.rescue(k % 4);
        todo.push(() => lab.expertDemo(s.cubes.map(placeJit), s.word, s.word, 9000 + k * 13, k, 'example'));
      }
    }
    gen = {
      todo,
      done: [],
      total: todo.length,
      t: 0,
      onDone: (list) => {
        for (const d of list) if (d.ok) demos.push({ ...d, id: ++demoId });
        if (which === 'first' && !aDone()) ctx.pass.award('vormachen', { value: { de: '50 Beispiel-Demos geladen', en: '50 example demos loaded' }, skipped: true });
        rebuildCloud();
        redrawMat();
        sounds.shimmer();
        ctx.hud.toast(X(which === 'first' ? 'toast.loaded50' : 'toast.loaded40', { n: list.filter((d) => d.ok).length }), { kind: 'success', duration: 3 });
        phase = 'idle';
        unattended(false);
        if (which === 'second') train();
        renderPanel();
        deps.changed();
      },
    };
    phase = 'gen';
    unattended(true);
    renderPanel();
  };

  // ── operate mode, the panel ────────────────────────────────────────────────
  let panelEl: HTMLElement | null = null;
  let statusEl: HTMLElement | null = null;
  const btn = (label: string, key: string | null, onClick: () => void, cls = 'btn', disabled = false): HTMLButtonElement => {
    const b = document.createElement('button');
    b.className = cls;
    b.style.cssText = 'padding:7px 11px;font-size:13px';
    b.disabled = disabled;
    if (disabled) b.style.opacity = '0.4';
    b.innerHTML = `${esc(label)}${key ? ` <span class="kbd">${key}</span>` : ''}`;
    b.onclick = (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLButtonElement).blur();
      onClick();
    };
    return b;
  };
  const row = (): HTMLDivElement => {
    const r = document.createElement('div');
    r.className = 'op-row';
    return r;
  };
  const statusText = (): string => {
    if (phase === 'armed') return T('status.armed');
    if (phase === 'record' && take) return T('status.rec', { t: ctx.i18n.num(take.rec.t, 1) });
    if (phase === 'run' && run) return T('status.run', { t: ctx.i18n.num(run.t, 1), x: runSpeed > 1 ? ` · ${runSpeed}×` : '' });
    if (phase === 'train') return T('status.train');
    if (phase === 'gen' && gen) return T('status.gen', { n: gen.done.length, m: gen.total });
    if (phase === 'home') return T('status.home');
    if (phase === 'review' && review) return review.failed ? T('status.reviewFail') : T('status.reviewOk', { t: ctx.i18n.num(review.demo.dur, 1) });
    return model ? T('status.trained', { d: model.demos }) : T('status.idle');
  };
  const commandRow = (send: () => void, disabled: boolean): HTMLElement => {
    const r = row();
    r.style.alignItems = 'baseline';
    const pre = document.createElement('span');
    pre.textContent = T('cmd.pre');
    const chip = document.createElement('button');
    chip.className = 'btn small';
    chip.style.cssText = `padding:3px 9px;font-size:13px;border-color:${COLOUR_CSS[word]};color:${COLOUR_CSS[word]}`;
    chip.textContent = T(`cmd.adj.${word}`);
    chip.title = T('cmd.cycle');
    chip.onclick = (e) => {
      e.stopPropagation();
      word = COLOURS[(COLOURS.indexOf(word) + 1) % COLOURS.length];
      ctx.audio.play('click');
      renderPanel();
    };
    const post = document.createElement('span');
    post.textContent = T('cmd.post');
    r.append(pre, chip, post, btn(T('btn.send'), 'P', send, 'btn primary', disabled));
    return r;
  };
  const cardRow = (): HTMLElement => {
    const r = row();
    const ids: CardId[] = ['newPose', 'otherWord', 'dusk', 'camera'];
    for (const id of ids) {
      const st = B.cards[id];
      if (st === 'hidden') {
        const q = document.createElement('span');
        q.className = 'tag';
        q.style.cssText = 'font-size:11px;padding:3px 8px;opacity:0.6';
        q.textContent = '?';
        q.title = T('card.hiddenHint');
        r.appendChild(q);
        continue;
      }
      const label = `${st === 'failed' ? '✗ ' : st === 'fixed' ? '✓ ' : ''}${T(`card.${id}`)}`;
      r.appendChild(btn(label, null, () => playCard(id), st === 'open' ? 'btn' : 'btn ghost', phase === 'run' || !model));
    }
    return r;
  };
  const chipsRow = (extra?: HTMLElement): HTMLElement => {
    const c = document.createElement('div');
    c.className = 'line';
    c.style.cssText = 'display:flex;gap:6px;margin-top:9px;align-items:center;flex-wrap:wrap';
    c.append(ctx.ui.chip('sim', X('chipSim')));
    if (extra) c.append(extra);
    return c;
  };
  const renderPanel = (): void => {
    const el = panelEl;
    if (!el) return;
    el.replaceChildren();
    const s = stage();
    const inA = s === 'A' || (phase !== 'idle' && takeKind && !takeKind.rescue && (phase === 'armed' || phase === 'record' || phase === 'review') && !model);
    el.appendChild((inA ? chA : chB).chips());
    const head = document.createElement('div');
    head.className = 'display';
    head.style.cssText = 'font-size:19px;margin-top:8px';
    head.textContent = inA ? T('panel.titleA', { n: Math.min(playerDemos().filter((d) => d.ok).length + 1, STATION_A.target), m: STATION_A.target }) : T('panel.titleB');
    el.appendChild(head);
    statusEl = document.createElement('div');
    statusEl.className = 'mono';
    statusEl.style.cssText = `font-size:12.5px;margin-top:6px;color:${phase === 'record' ? 'var(--error)' : phase === 'run' ? 'var(--orange-light)' : 'var(--teal)'}`;
    statusEl.textContent = statusText();
    el.appendChild(statusEl);
    // the wrist camera (no words: a picture)
    const wr = document.createElement('div');
    wr.style.cssText = 'margin-top:8px;border-radius:8px;overflow:hidden;width:192px;height:120px;border:1px solid var(--border)';
    wrist.canvas.style.cssText = 'display:block;width:192px;height:120px';
    wr.appendChild(wrist.canvas);
    wr.title = T('panel.wrist');
    el.appendChild(wr);
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:12.5px;color:var(--text-2);margin-top:6px;line-height:1.4';
    const ops = document.createElement('div');
    ops.style.cssText = 'margin-top:4px';
    if (phase === 'review' && review) {
      hint.textContent = review.failed ? T('hint.reviewFail') : T('hint.review');
      const r = row();
      if (review.failed) r.append(btn(T('btn.discard'), '←', () => discardReview(), 'btn primary'), btn(T('btn.keepAnyway'), '→', () => keepFailed(), 'btn ghost'));
      else r.append(btn(T('btn.next'), '→', () => nextAfterTake(), 'btn primary'), btn(T('btn.discard'), '←', () => discardReview(), 'btn ghost'));
      ops.appendChild(r);
    } else if (phase === 'armed' || phase === 'record') {
      hint.textContent = takeKind.rescue ? T('hint.rescue', { c: T(`cmd.name.${takeKind.word}`) }) : T('hint.A');
      if (takeKind.rescue) ops.appendChild(commandSentence(takeKind.word));
      const r = row();
      r.append(btn(T('btn.discard'), '←', () => (take?.started ? discardTake() : undefined), 'btn ghost', !take?.started), btn(T('btn.endKeep'), '→', () => endTakeEarly(), 'btn ghost', !take?.started));
      ops.appendChild(r);
    } else if (s === 'A' && phase === 'idle') {
      hint.textContent = T('hint.A');
      const r = row();
      r.append(btn(T('btn.newDemo'), null, () => armA(), 'btn primary'));
      ops.appendChild(r);
    } else if (s === 'B-load') {
      hint.textContent = T(ctx.mode === 'entscheider' ? 'hint.loadE' : 'hint.load');
      const r = row();
      r.append(btn(T('btn.load50'), null, () => loadSet('first'), 'btn primary', phase === 'gen'));
      if (ctx.mode === 'entdecker') r.append(btn(T('btn.newDemo'), null, () => armA(), 'btn ghost'));
      ops.appendChild(r);
    } else if (s === 'B-train' || (needsTrain() && phase !== 'run' && phase !== 'train')) {
      hint.textContent = T('hint.train');
      const r = row();
      r.append(btn(T('btn.train'), 'T', () => train(), 'btn primary', phase === 'train' || demos.length === 0));
      if (!model && ctx.mode === 'entdecker') r.append(btn(T('btn.newDemo'), null, () => armA(), 'btn ghost', phase === 'train'));
      ops.appendChild(r);
    } else if (s === 'B-predict' && B.predicted == null) {
      hint.textContent = T('hint.predict');
      ops.appendChild(commandSentence('rot'));
      const r = row();
      for (const c of ['rot', 'blau', 'nichts'] as Choice[]) r.append(btn(T(`predict.${c}`), null, () => predict(c), 'btn'));
      ops.appendChild(r);
    } else if (s === 'B-rescue') {
      hint.textContent = ctx.mode === 'entscheider' ? T('hint.rescueE') : T('hint.rescueStart', { n: STATION_B.rescueDemos });
      const r = row();
      if (ctx.mode === 'entscheider') r.append(btn(T('btn.load40'), null, () => loadSet('second'), 'btn primary', phase === 'gen'));
      r.append(btn(T('btn.rescue'), null, () => armRescue(), ctx.mode === 'entscheider' ? 'btn ghost' : 'btn primary', phase === 'gen'));
      ops.appendChild(r);
      ops.appendChild(cardRow());
    } else {
      // B: the command builder, the cards
      hint.textContent = s === 'B-first' ? T('hint.first') : s === 'B-cards' ? T('hint.cards') : s === 'B-test' ? T('hint.test') : '';
      const sendKind: RunKind = s === 'B-first' ? 'first' : s === 'B-test' ? 'test' : dusk ? 'dusk' : bumped ? 'camera' : 'free';
      const setupFor = (): PlacedCube[] | null => (s === 'B-first' ? [fieldCube(firstField(), 'rot')] : s === 'B-test' ? SETUPS.rescueTest() : null);
      ops.appendChild(commandRow(() => startRun(sendKind, setupFor(), word), phase === 'run' || !model || phase === 'train'));
      // the cards (not while the valve waits: the console stays ≤ 35 words)
      if (s !== 'B-first' && valveState !== 'ready' && valveState !== 'offered') ops.appendChild(cardRow());
      const fixes = row();
      if (B.cards.dusk === 'failed' || (dusk && B.cards.dusk !== 'hidden')) fixes.append(btn(jitter ? `✓ ${T('btn.jitter')}` : T('btn.jitter'), null, () => toggleJitter(), jitter ? 'btn ghost' : 'btn'));
      if (bumped) fixes.append(btn(T('btn.screw'), null, () => setBump(false), 'btn'));
      if (needsTrain() && model) fixes.append(btn(T('btn.retrain'), 'T', () => train(), 'btn primary'));
      if (bDone() && valveState === 'ready') fixes.append(btn(T('btn.valve'), null, () => handValve(), 'btn primary'));
      if (valveState === 'offered') fixes.append(btn(T('valve.label'), null, () => takeValve(), 'btn primary'));
      if (fixes.childElementCount) ops.appendChild(fixes);
    }
    if (hint.textContent) el.appendChild(hint);
    el.appendChild(ops);
    el.appendChild(chipsRow());
  };
  const commandSentence = (w: CubeColour): HTMLElement => {
    const d = document.createElement('div');
    d.style.cssText = 'font-size:13.5px;margin-top:6px';
    d.innerHTML = `${esc(T('cmd.pre'))} <b style="color:${COLOUR_CSS[w]}">${esc(T(`cmd.adj.${w}`))}</b> ${esc(T('cmd.post'))}`;
    return d;
  };
  const toggleJitter = (): void => {
    jitter = !jitter;
    ctx.audio.play('click');
    if (jitter) ctx.hud.toast(X('toast.jitter'), { kind: 'info', duration: 3.5 });
    renderPanel();
  };
  const predict = (c: Choice): void => {
    B.predicted = c;
    ctx.audio.play('click');
    startRun('predict', SETUPS.prediction(recordedField(-1)), 'rot');
  };
  const discardTake = (): void => {
    if (!take) return;
    take = null;
    review = null;
    ctx.hud.toast(X('toast.discarded'), { kind: 'info', duration: 2 });
    goHome(() => redo());
  };
  const endTakeEarly = (): void => {
    if (!take?.started) return;
    take.status = 'failed';
    finishTake();
  };

  const refreshStatus = (): void => {
    if (statusEl) statusEl.textContent = statusText();
  };
  const POSES = {
    bench: () => {
      const c = TELEOP.camera;
      const z = input.zoom;
      const la = new THREE.Vector3(...c.lookAt);
      const p = new THREE.Vector3(...c.position).sub(la).multiplyScalar(z).add(la);
      return { position: bench.toLocal(p.x, p.y, p.z).toArray() as [number, number, number], lookAt: bench.toLocal(la.x, la.y, la.z).toArray() as [number, number, number] };
    },
    // the bench in the lower third, the Gehirn-Fenster above it
    watch: () => ({ position: [1.15, 1.95, 0.35] as [number, number, number], lookAt: [-0.1, 2.15, -5.0] as [number, number, number] }),
  };
  let switching = false;
  // the pointer's ray from the console's own camera pose (zone-local): independent of whatever the
  // engine's camera did between frames (measured: its position wandered 10 cm between pointer events)
  const opCam = new THREE.PerspectiveCamera();
  const opRay = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();
  const rayAt = (ndc: { x: number; y: number }, pose: { position: number[]; lookAt: number[] }): THREE.Ray => {
    opCam.fov = ctx.camera.fov;
    opCam.aspect = ctx.camera.aspect;
    opCam.near = 0.01;
    opCam.far = 50;
    opCam.updateProjectionMatrix();
    opCam.position.set(pose.position[0], pose.position[1], pose.position[2]);
    opCam.lookAt(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2]);
    opCam.updateMatrixWorld(true);
    opRay.setFromCamera(_ndc.set(ndc.x, ndc.y), opCam);
    return opRay.ray;
  };
  let opPose: { position: number[]; lookAt: number[] } = POSES.bench();
  const enterOperate = (): void => {
    operating = true;
    opPose = view === 'bench' ? POSES.bench() : POSES.watch();
    exitOperate = ctx.player.enterOperate({
      title: X('panel.bar'),
      cameraPose: opPose as { position: [number, number, number]; lookAt: [number, number, number] },
      panelPosition: 'right',
      capture: { keys: ['Space', 'KeyQ', 'KeyE', 'ArrowLeft', 'ArrowRight', 'KeyT', 'KeyP', 'KeyC', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'] },
      panel: (el) => {
        panelEl = el;
        renderPanel();
        return () => {
          if (panelEl === el) panelEl = null;
        };
      },
      onPointer: (e) => {
        if (e.type === 'wheel') {
          if (view !== 'bench' || !e.deltaY) return;
          input.zoom = Math.max(TELEOP.zoom.min, Math.min(TELEOP.zoom.max, input.zoom + Math.sign(e.deltaY) * TELEOP.zoom.step));
          reenter();
          return;
        }
        // where the player sees things is where the jaws go: the Kiste's rim when the ray meets its
        // opening, else the plane of a cube's top face
        const B = LAYOUT.box;
        const ray = view === 'bench' ? rayAt(e.ndc, opPose) : { origin: e.origin, direction: e.direction };
        const rim = bench.rayToBench(ray.origin, ray.direction, B.h);
        const p = rim && Math.abs(rim.x - B.x) < B.w / 2 && Math.abs(rim.z - B.z) < B.d / 2 ? rim : bench.rayToBench(ray.origin, ray.direction, CUBE_HALF * 2);
        lastPointer = { type: e.type, ndc: [+e.ndc.x.toFixed(3), +e.ndc.y.toFixed(3)], o: e.origin.toArray().map((v) => +v.toFixed(3)), p };
        if (p) input.cursor = p;
        if (e.type === 'down') {
          if (e.button === 0) input.low = true;
          if (e.button === 2) toggleGrip();
        } else if (e.type === 'up' && e.button === 0) input.low = false;
      },
      onExit: () => {
        operating = false;
        exitOperate = null;
        input.low = false;
        if (switching) return;
        input.cursor = null;
        bench.setCursor(null, 'aim');
        if (phase === 'armed' || phase === 'record') {
          take = null;
          phase = 'idle';
        }
        ctx.ui.status(null);
        deps.changed();
      },
    });
    ctx.ui.status(X('panel.status'));
  };
  const reenter = (): void => {
    if (!operating) return;
    const ex = exitOperate;
    exitOperate = null;
    switching = true;
    const keep = phase;
    ex?.();
    switching = false;
    phase = keep;
    enterOperate();
  };
  const setView = (v: 'bench' | 'watch'): void => {
    if (view === v) return;
    view = v;
    reenter();
    if (operating) ctx.audio.play('whoosh', { volume: 0.2, pitch: 1.4 });
  };
  const toggleGrip = (): void => {
    if (!(phase === 'armed' || phase === 'record')) return;
    input.grip = input.grip > 0.1 ? GRIPPER.closed : GRIPPER.open;
    sounds.jaw(input.grip < 0.1);
  };

  ctx.input.onKey(
    ['Space', 'ArrowLeft', 'ArrowRight', 'KeyT', 'KeyP', 'KeyC', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'],
    (code) => {
      if (!operating) return;
      if (code === 'Space') {
        if (phase === 'run') runSpeed = STATION_B.fastSpeed;
        else toggleGrip();
      } else if (code === 'ArrowRight') {
        if (phase === 'review') review?.failed ? keepFailed() : nextAfterTake();
        else if (phase === 'record') endTakeEarly();
      } else if (code === 'ArrowLeft') {
        if (phase === 'review') discardReview();
        else if (phase === 'record') discardTake();
      } else if (code === 'KeyT') train();
      else if (code === 'KeyP') {
        const s = stage();
        if (model && (s === 'B-first' || s === 'B-test' || s === 'B-cards' || s === 'done')) startRun(s === 'B-first' ? 'first' : s === 'B-test' ? 'test' : 'free', s === 'B-first' ? [fieldCube(firstField(), 'rot')] : s === 'B-test' ? SETUPS.rescueTest() : null, word);
      } else if (code === 'KeyC') setView(view === 'bench' ? 'watch' : 'bench');
      else if (code.startsWith('Digit') && phase === 'armed' && !take?.started && !takeKind.rescue) {
        nextField = Number(code.slice(5)) - 1;
        setScene([fieldCube(nextField, 'rot')]);
        startTake('rot', 'rot');
      }
    },
    { whileOperating: true },
  );

  // the discovery cards' interactables (the console is the zone's: it waits for the arms): the lamp
  // (Abendlicht), the overhead camera (knock it)
  ctx.addInteractable({ object: bench.lamp, label: X('lamp.label'), range: 2.2, isEnabled: () => !!model, onInteract: () => setDusk(!dusk) });
  ctx.addInteractable({ object: bench.cameraMount, label: X('camera.label'), range: 2.4, isEnabled: () => !!model && !bumped, onInteract: () => setBump(true) });

  // ── the per-frame work ─────────────────────────────────────────────────────
  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const followerVis = new Float64Array(NJ);
  const cubePoses = COLOURS.map(() => ({ present: false, p: new THREE.Vector3(), q: new THREE.Quaternion() }));
  const servo = ctx.audio.loop('servo', { at: bench.toLocal(LAYOUT.follower.x, 0.1, LAYOUT.follower.z), volume: 0 });
  let servoV = 0;
  let seeT = 0,
    undT = 0,
    statusT = 0,
    liveT = 0,
    wristT = 0;
  let lastActStep = -1;
  const nbrInfo: NeighbourInfo[] = [];
  const mask = new Uint8Array(64 * 48);
  const liveImg = new Uint8Array(64 * 48 * 3);
  const liveVision = new ColourClasses();
  let imgSeed = 1;

  /** the cursor → the commanded jaw centre (speed-limited, held inside the reach) → the leader's joints */
  const steer = (dt: number): void => {
    const c = input.cursor;
    // no cursor yet (the mouse has not been over the bench): the hand rests, nothing records
    if (!c) return;
    const F0 = LAYOUT.follower;
    if (c) {
      let dx = c.x - F0.x,
        dz = c.z - F0.z;
      const r = Math.hypot(dx, dz) || 1e-6;
      const rr = Math.max(IK.minReach, Math.min(IK.maxReach, r));
      dx *= rr / r;
      dz *= rr / r;
      const tx = F0.x + dx,
        tz = F0.z + dz;
      const ex = tx - jaw.x,
        ez = tz - jaw.z;
      const d = Math.hypot(ex, ez);
      const max = TELEOP.maxSpeed * dt;
      if (d > max) {
        jaw.x += (ex / d) * max;
        jaw.z += (ez / d) * max;
      } else {
        jaw.x = tx;
        jaw.z = tz;
      }
    }
    // grasp assist: lowering near a cube, the hand settles over its centre (a mouse is no hand)
    if (input.low && sim.held < 0)
      for (const cube of sim.cubes) {
        if (!cube.present || cube.p.y > 0.03) continue;
        const dx = cube.p.x - jaw.x,
          dz = cube.p.z - jaw.z;
        if (Math.hypot(dx, dz) < TELEOP.magnetM) {
          const k = Math.min(1, TELEOP.magnet * dt * 8);
          jaw.x += dx * k;
          jaw.z += dz * k;
          break;
        }
      }
    // over (and near) the Kiste the hand stays above its rim: lowering there means letting go over it
    const B = LAYOUT.box;
    const nearBox = Math.abs(jaw.x - B.x) < B.w / 2 + 0.035 && Math.abs(jaw.z - B.z) < B.d / 2 + 0.035;
    const low = nearBox ? TELEOP.boxY : TELEOP.lowY;
    const ty = input.low ? low : Math.max(TELEOP.hoverY, nearBox ? TELEOP.boxY : 0);
    jaw.y += Math.max(-TELEOP.liftSpeed * dt, Math.min(TELEOP.liftSpeed * dt, ty - jaw.y));
    if (nearBox) jaw.y = Math.max(jaw.y, TELEOP.boxY - 0.005);
    if (ctx.input.isDown('KeyQ')) input.roll += TELEOP.rollSpeed * dt;
    if (ctx.input.isDown('KeyE')) input.roll -= TELEOP.rollSpeed * dt;
    input.roll = Math.max(-0.8, Math.min(0.8, input.roll));
    lastIkErr = arms.leaderIK(jaw, input.roll, ikOut);
    for (let i = 0; i < 5; i++) leaderCmd[i] = ikOut[i];
    leaderCmd[5] = input.grip;
  };

  const tick = (): void => {
    switch (phase) {
      case 'armed':
      case 'record': {
        if (autopilotOn) {
          if (!autopilot) {
            autopilot = new Expert(lab.ik, COLOURS.indexOf(takeKind.target), 4242 + demoId * 7, EXPERT_STYLES[demoId % EXPERT_STYLES.length]);
            autopilot.begin(sim);
          }
          leaderCmd.set(autopilot.act(sim));
        }
        sim.command(leaderCmd);
        const wasStarted = take?.started;
        take?.tick();
        if (take && !wasStarted && take.started) {
          phase = 'record';
          ctx.audio.beep(1200, 0.05, { volume: 0.45, at: bench.toLocal(0, 0.2, 0) });
          renderPanel();
        }
        if (take?.started) pushLive();
        // a rescue demo must move the commanded cube: the other one in the Kiste ends it as failed
        if (take && take.status === 'rec' && takeKind.rescue)
          for (let i = 0; i < COLOURS.length; i++)
            if (COLOURS[i] !== takeKind.target && sim.restedInBox(i) >= CLOCK.restS) {
              take.status = 'failed';
              ctx.hud.toast(X('toast.wrongCube', { c: T(`cmd.name.${takeKind.word}`) }), { kind: 'warn', duration: 4 });
            }
        if (take && take.status !== 'rec') {
          autopilot = null;
          finishTake();
        }
        break;
      }
      case 'home': {
        homeT += 1 / CLOCK.ctrlHz;
        const f = Math.min(1, homeT / homeS);
        const e = f * f * (3 - 2 * f);
        for (let i = 0; i < NJ; i++) leaderCmd[i] = homeFrom![i] + (homeTo[i] - homeFrom![i]) * e;
        sim.command(leaderCmd);
        if (f >= 1) {
          phase = 'idle';
          const then = afterHome;
          afterHome = null;
          jaw.set(LAYOUT.home.x, LAYOUT.home.y, LAYOUT.home.z);
          input.grip = GRIPPER.open;
          then?.();
        }
        break;
      }
      case 'run':
        if (run) {
          sim.command(run.act());
          pushLive();
          if (run.status !== 'run' || hopeless(run)) {
            if (run.status === 'run') run.status = 'timeout';
            finishRun();
          }
        }
        break;
      default:
        sim.command(sim.leader);
    }
  };

  const understand = (): void => {
    const s = sim;
    const goal = run?.goal ?? null;
    brain.understand({
      mode: phase === 'run' ? 'run' : phase === 'record' || phase === 'armed' ? 'record' : phase === 'train' ? 'train' : 'idle',
      line: phase === 'run' ? T('brain.modeRun') : phase === 'record' ? T('brain.modeRecord', { n: demos.length + 1 }) : phase === 'train' ? T('brain.modeTrain') : model ? T('brain.modeTrained', { d: model.demos, n: ctx.i18n.num(model.pairs, 0) }) : T('brain.modeIdle'),
      sub: phase === 'run' && run ? T('brain.runSub', { t: ctx.i18n.num(run.t, 1), q: run.queries }) : phase === 'record' && take ? T('brain.recSub', { t: ctx.i18n.num(take.rec.t, 1), n: take.rec.samples }) : model ? T('brain.idleTrained') : T('brain.idleSub'),
      word: phase === 'run' || model ? word : null,
      a: model ? model.selector.a : null,
      b: model ? model.selector.b : null,
      goal,
      nn: phase === 'run' && run ? run.nn : null,
      nbrs: phase === 'run' ? nbrInfo : [],
    });
    void s;
  };

  const persist = (): void => {
    // ≤ 16 KB per area (plan §5.9): the demos' summaries only, never their samples
    ctx.progress.set('demos', demos.filter((d) => d.kind === 'player').slice(-30).map(demoMeta));
  };

  const api: Teleop = {
    get stage() {
      return stage();
    },
    get operating() {
      return operating;
    },
    target: [bench.toLocal(0.42, 0, 0.6).x, 0, bench.toLocal(0.42, 0, 0.6).z],
    enter() {
      if (operating) return;
      view = 'bench';
      enterOperate();
      const e = deps.emi();
      if (e) e.lookAt(bench.toLocal(LAYOUT.follower.x, 0.1, LAYOUT.follower.z).applyMatrix4(ctx.root.matrixWorld));
      if (!ctx.progress.get('met', false)) {
        ctx.progress.set('met', true);
        react(X('emi.meet'));
      }
      if (phase === 'idle') {
        const s = stage();
        if (s === 'A') armA();
        else if (s === 'B-first' || s === 'B-predict' || s === 'B-test') prepareStage();
      }
      renderPanel();
    },
    update(dt, t) {
      // the generation of preloaded sets: a few scripted demos per frame
      if (gen) {
        // a few scripted demos per frame (the counter in the status line shows them coming in)
        gen.t += dt;
        const due = gen.total;
        const t0 = performance.now();
        while (gen.todo.length && gen.done.length < due && performance.now() - t0 < 4) gen.done.push(gen.todo.shift()!());
        if (!gen.todo.length) {
          const g = gen;
          gen = null;
          lab.setup([fieldCube(firstField(), 'rot')]);
          g.onDone(g.done);
        } else if (statusT <= 0) refreshStatus();
      }
      if (phase === 'train') {
        trainT -= dt;
        brain.pulse(trainT);
        if (trainT <= 0) {
          brain.pulse(0);
          trainDone();
        }
      }
      if (operating && (phase === 'armed' || phase === 'record') && !autopilotOn) steer(dt);
      if (review && !review.failed && ctx.time.elapsed > review.until && phase === 'review') nextAfterTake();
      // the simulation (frame time × run speed)
      const speed = phase === 'run' ? runSpeed : 1;
      if (phase !== 'gen') lab.stepper.advance(dt * speed, tick, 6 * speed);
      // render: follower (interpolated), leader (your hand or resting), cubes, shadows, cursor
      const a = lab.stepper.alpha;
      for (let i = 0; i < NJ; i++) followerVis[i] = sim.q0[i] + (sim.q[i] - sim.q0[i]) * a;
      arms.setFollower(followerVis);
      if (phase === 'armed' || phase === 'record') arms.setLeader(leaderCmd);
      else arms.setLeader(phase === 'home' && valveState !== 'offering' && valveState !== 'offered' ? leaderCmd : lab.home);
      if (valveState === 'offering' || valveState === 'offered') {
        sim.arm.jawCentre(_p);
        bench.toLocal(_p.x - 0.008, _p.y - 0.022, _p.z, bench.valve.position);
      }
      for (let i = 0; i < COLOURS.length; i++) {
        const c = sim.cubes[i];
        const v = cubePoses[i];
        v.present = c.present;
        v.p.lerpVectors(c.p0, c.p, a);
        v.q.slerpQuaternions(c.q0, c.q, a);
      }
      bench.setCubes(cubePoses);
      sim.arm.jawCentre(_p);
      bench.setJaws(_p);
      const aiming = operating && (phase === 'armed' || phase === 'record') && !!input.cursor;
      bench.setCursor(aiming ? { x: jaw.x, z: jaw.z } : null, input.low ? 'low' : 'aim');
      bench.update(dt, t);
      // the servo whine follows the fastest follower joint
      let sp = 0;
      for (let i = 0; i < 5; i++) sp = Math.max(sp, Math.abs(sim.q[i] - sim.q0[i]) / CLOCK.dt);
      servoV += (Math.min(1, sp / 3) - servoV) * Math.min(1, dt * 8);
      servo.setVolume(servoV * 0.55);
      servo.setPitch(0.8 + 0.7 * servoV);
      // the windows (only when someone can see them)
      if (ctx.playerDistance < 34) {
        wristT -= dt;
        if (wristT <= 0) {
          wristT = 1 / 12;
          wrist.draw(sim.arm, { cubes: sim.cubes, gripper: sim.q[5] }, dusk ? VISION.dusk.tint : [1, 1, 1]);
        }
        seeT -= dt;
        if (seeT <= 0) {
          seeT = 0.1;
          const img = run ? run.image : render(sceneOf(sim), dusk ? DUSK : DAYLIGHT, bumped ? VISION.bump : NO_BUMP, imgSeed++, liveImg);
          (model?.vision ?? liveVision).detect(img, mask);
          brain.see(img, mask, run?.goal ?? null, wrist.canvas);
        }
        undT -= dt;
        if (undT <= 0) {
          undT = 0.25;
          understand();
        }
        if (phase === 'run' && run && run.ticks !== lastActStep) {
          lastActStep = run.ticks;
          if (run.pos === 1) {
            nbrInfo.length = 0;
            for (let i = 0; i < POLICY.k; i++) {
              const k = run.nbr[i];
              if (k < 0 || !model) continue;
              nbrInfo.push({ demo: model.policy.demos[model.policy.refDemo[k]].id, t: model.policy.refStep[k] / CLOCK.ctrlHz });
            }
          }
          brain.act(run.chunk, run.pos, T('brain.actRun', { q: run.queries }));
        }
      }
      statusT -= dt;
      if (statusT <= 0 && operating) {
        statusT = 0.2;
        refreshStatus();
      }
      if (phase === 'run' && run) {
        liveT -= dt;
        if (liveT <= 0) {
          liveT = 0.15;
          cloud.setLive({ path: live.path, n: live.n }, Math.min(1, run.t / 6), run.status === 'run' && run.nn > POLICY.oodDistance);
        }
      }
      void _q;
      void DEG;
    },
    solveA() {
      const order = [0, 1, 2, 3, 4];
      for (const f of order) {
        const d = lab.expertDemo([placeJit(fieldCube(f, 'rot'))], 'rot', 'rot', 7000 + f * 31 + demoId, f, 'player');
        d.id = ++demoId;
        if (d.ok) keepDemo(d);
      }
      checkA();
      lab.setup([fieldCube(firstField(), 'rot')]);
      phase = 'idle';
      renderPanel();
      deps.changed();
    },
    solveB() {
      if (okDemos().length < STATION_A.keep) api.solveA();
      model = lab.train(demos, jitter);
      trainedOn = demos.length;
      const run1 = lab.rollout(model, [placeJit(fieldCube(firstField(), 'rot'))], 'rot');
      B.first = true;
      B.predicted = 'blau';
      const run2 = lab.rollout(model, SETUPS.prediction(recordedField(-1)).map(placeJit), 'rot');
      B.predOutcome = run2.boxed ?? 'nichts';
      ctx.pass.recordPrediction('nachmachen', B.predicted === B.predOutcome ? 1 : 0, 1, { min: 0, max: 1, scale: 'linear' });
      const run3 = lab.rollout(model, SETUPS.newPose().map(placeJit), 'rot');
      B.cards.newPose = run3.status === 'success' ? 'open' : 'failed';
      const run4 = lab.rollout(model, SETUPS.otherWord(recordedField(-1)).map(placeJit), 'blau');
      B.cards.otherWord = 'failed';
      if (run4.boxed === 'rot') ctx.pass.unlockAlbum('wortblind');
      for (let k = B.rescueK; k < STATION_B.rescueDemos; k++) {
        const s = SETUPS.rescue(k);
        const d = lab.expertDemo(s.cubes.map(placeJit), s.word, s.word, 8100 + k * 7 + demoId, k, 'player');
        d.id = ++demoId;
        if (d.ok) {
          demos.push(d);
          B.rescueK++;
          B.rescueDemos++;
        }
      }
      model = lab.train(demos, jitter);
      trainedOn = demos.length;
      const run5 = lab.rollout(model, SETUPS.rescueTest().map(placeJit), 'blau');
      B.tested = run5.status === 'success' || B.tested;
      rebuildCloud();
      redrawMat();
      if (!bDone()) awardB();
      phase = 'idle';
      renderPanel();
      deps.changed();
      void run1;
    },
    stars3A() {
      // five fields, fast and clean (the scripted hand at its quickest style)
      for (let f = 0; f < F.length; f++) {
        if (fieldDemos()[f] > 0 && playerDemos().some((d) => d.field === f && d.ok)) continue;
        const d = lab.expertDemo([placeJit(fieldCube(f, 'rot'))], 'rot', 'rot', 7300 + f * 11, 2, 'player');
        d.id = ++demoId;
        if (d.ok) keepDemo(d);
      }
      const s = aSummary(demos);
      if (!aDone()) checkA();
      chA.submit(s.mean, { stars: 3, detail: X('a.detail', { n: s.kept, f: s.fields, t: ctx.i18n.num(s.mean, 1), r: 0 }) });
    },
    stars3B() {
      if (!bDone()) api.solveB();
      // the two discovery cards: found, failed, fixed
      dusk = true;
      B.cards.dusk = 'failed';
      jitter = true;
      model = lab.train(demos, true);
      trainedOn = demos.length;
      const d1 = lab.rollout(model, [placeJit(fieldCube(recordedField(-1), 'rot'))], 'rot', { light: DUSK });
      if (d1.status === 'success') B.cards.dusk = 'fixed';
      dusk = false;
      bench.setDusk(false);
      B.cards.camera = 'failed';
      ctx.pass.unlockAlbum('schleife');
      const c1 = lab.rollout(model, [placeJit(fieldCube(recordedField(-1), 'rot'))], 'rot');
      if (c1.status === 'success') B.cards.camera = 'fixed';
      bumped = false;
      B.tested = true;
      chB.submit(null, { stars: 3, detail: X('b.detail', { n: twoColour().length }) });
      renderPanel();
    },
    solveAlbum() {
      ctx.pass.unlockAlbum('policy-kopiert-fehler');
    },
    valveReady() {
      if (valveState !== 'none') return;
      valveState = 'ready';
      renderPanel();
      // once: the hint where the M4 part is
      ctx.after(4, () => {
        if (valveState === 'ready' && ctx.playerInside) react(X('emi.valveHint'));
      });
    },
    async viewB() {
      // the console in B, the policy running the first command (the measured state of §5.5)
      if (!model) api.solveB();
      if (!operating) api.enter();
      if (view !== 'bench') setView('bench');
      startRun('free', [fieldCube(firstField(), 'rot')], 'rot');
      await new Promise<void>((r) => ctx.after(1.2, r));
      return () => {
        if (phase === 'run' && run) {
          run.status = 'timeout';
          finishRun();
        }
      };
    },
    autopilot(on) {
      autopilotOn = on;
      autopilot = null;
    },
    examplePaths() {
      return okDemos().slice(-6).map((d) => ({ kind: 'ghost' as const, ...pathOf(d, 4), age: 0 }));
    },
    debugState() {
      return {
        phase,
        stage: stage(),
        demos: demos.map((d) => ({ id: d.id, kind: d.kind, word: d.word, field: d.field, cubes: d.cubes.length, ok: d.ok, dur: +d.dur.toFixed(2), n: d.n, regrasps: d.regrasps })),
        model: model ? { demos: model.demos, pairs: model.pairs, a: +model.selector.a.toFixed(2), b: +model.selector.b.toFixed(2), contrast: model.selector.contrast, jitter: model.jitter } : null,
        b: { ...B, cards: { ...B.cards } },
        dusk,
        bumped,
        jitter,
        lastRun,
        run: run ? { kind: runKind, t: +run.t.toFixed(2), goal: run.goal, nn: +run.nn.toFixed(2) } : null,
        operating,
        view,
        follower: Array.from(sim.q).map((v) => +v.toFixed(3)),
        leader: Array.from(sim.leader).map((v) => +v.toFixed(3)),
        clipped: sim.clipped,
        held: sim.held,
        cubes: sim.cubes.map((c) => ({ colour: c.colour, present: c.present, p: c.p.toArray().map((v) => +v.toFixed(3)) })),
        valve: valveState,
        input: { cursor: input.cursor, low: input.low, grip: input.grip, roll: input.roll, jaw: jaw.toArray().map((v) => +v.toFixed(3)), ikErr: +lastIkErr.toFixed(4) },
        simJaw: sim.arm.jawCentre(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3)),
        lastPointer,
      };
    },
    hook(name, arg) {
      switch (name) {
        case 'train':
          train();
          return true;
        case 'run':
          startRun('free', null, (arg as CubeColour) ?? word);
          return true;
        case 'card':
          playCard(arg as CardId);
          return true;
        case 'predict':
          if (stage() === 'B-predict') predict(arg as Choice);
          return true;
        case 'dusk':
          setDusk(!!arg);
          return dusk;
        case 'bump':
          setBump(!!arg);
          return bumped;
        case 'jitter':
          jitter = !!arg;
          renderPanel();
          return jitter;
        case 'cursor':
          input.cursor = arg as { x: number; z: number };
          return true;
        case 'low':
          input.low = !!arg;
          return true;
        case 'grip':
          input.grip = arg ? GRIPPER.closed : GRIPPER.open;
          return true;
        case 'next':
          if (phase === 'review') nextAfterTake();
          return true;
        case 'armA':
          if (phase === 'idle' || phase === 'armed' || phase === 'review') {
            review = null;
            armA();
          }
          return true;
        case 'rescue':
          armRescue();
          return true;
        case 'load':
          loadSet(arg === 'second' ? 'second' : 'first');
          return true;
        case 'view':
          setView(arg as 'bench' | 'watch');
          return view;
        case 'wrap':
          return wrapQuarter(Number(arg));
      }
      return null;
    },
  };

  // the valve (lift-off beat, plan §4.5): after the zone's last stamp, „Gib mir das Ventil.“ — the follower
  // lifts the M4 valve from the tray and holds it out over the front edge; E takes it (cosmetic)
  let valveState: 'none' | 'ready' | 'offering' | 'offered' | 'taken' = 'none';
  const handValve = (): void => {
    if (valveState !== 'ready' || phase === 'run' || phase === 'train') return;
    valveState = 'offering';
    take = null;
    review = null;
    lab.setup(sim.cubes.map((c, i) => ({ colour: COLOURS[i], x: c.p.x, z: c.p.z, yaw: 0, on: c.present })).filter((c) => c.on));
    bench.valve.visible = true;
    // the hand-over pose: jaws closed on the valve, reaching toward you
    lab.ik.setAll(lab.home);
    const p = new THREE.Vector3(LAYOUT.home.x - 0.02, 0.16, 0.06);
    for (let k = 0; k < 4; k++) lab.ik.solveIK(p, 0);
    const pose = Float64Array.from(lab.ik.q);
    pose[5] = GRIPPER.closed + 0.25;
    react(X('emi.valve'));
    moveArm(pose, () => {
      valveState = 'offered';
      phase = 'idle';
      ctx.game.juice.cue('tick');
      renderPanel();
    }, 1.4);
  };
  const takeValve = (): void => {
    if (valveState !== 'offered') return;
    valveState = 'taken';
    bench.valve.visible = false;
    ctx.hud.toast(X('toast.valve'), { kind: 'success', duration: 4 });
    ctx.game.juice.cue('great');
    ctx.game.juice.burst(bench.toLocal(LAYOUT.home.x, 0.16, 0.06), { tone: 'orange', count: 16 });
    ctx.progress.set('valve', true);
    goHome(() => renderPanel());
  };
  ctx.addInteractable({ object: bench.valve, label: X('valve.label'), range: 2.4, isEnabled: () => valveState === 'offered', onInteract: takeValve });
  if (ctx.progress.get('valve', false)) valveState = 'taken';

  // first draw
  redrawMat();
  rebuildCloud();
  lab.setup([fieldCube(0, 'rot')]);
  ctx.i18n.onChange(() => {
    redrawMat();
    brain.relabel();
    renderPanel();
  });
  void ((): void => {
    // compiled away: helpers kept for the tools (rng-free)
    void fieldAt;
    void JOINTS;
    void COLOURS;
  })();
  return api;
}

const COLOUR_CSS: Record<CubeColour, string> = { rot: '#e0574c', blau: '#5b8fe6', gruen: '#58b866' };

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export type { DemoKind };
