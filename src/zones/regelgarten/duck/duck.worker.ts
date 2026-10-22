/**
 * The duck station's own worker (plan §5.4, D30): real MuJoCo (official WebAssembly build, stripped,
 * single-threaded) on the light Open Duck Mini v2 model, the CEM generations, the test-track lanes
 * and the hero's live stream. Bundled by Vite from the literal `?worker` import in mujoco.ts as one
 * self-contained ES module (vite.config.ts block „worker (WP5)"): no shared chunks, no import map, no
 * bare specifier. The hashed wasm URL arrives in the init message and goes to the glue's locateFile,
 * so the glue never builds a URL of its own (no third-party request, plan §5.10 third-party).
 *
 * Work is cut into slices (one duck episode each, ≤ ~10 ms) so the hero stream and pause messages
 * get through while a generation is computed. Protocol: see the `In` / `Out` types in mujoco.ts.
 */
import loadMujoco from '@mujoco/mujoco';
import modelXml from './model.xml?raw';
import { Cem, DuckSim, GenerationJob, NACT, POSE_STRIDE, QPOS_STRIDE, detectHack, gaitTargets, testRuns, weightsOf, type Deck, type GenerationResult, type Mujoco, type World } from './core';
import { CARDS, CEM, CURRICULUM, EPISODE, GAIT, HACKS, REFERENCE, TRACK, WORLDS, WORKER } from '../tuning';
import type { DuckIn, DuckOut, GenOut } from './protocol';

interface Scope {
  postMessage(m: DuckOut, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<DuckIn>) => void) | null;
}
const scope = self as unknown as Scope;
const post = (m: DuckOut, transfer?: Transferable[]): void => scope.postMessage(m, transfer ?? []);

let M: Mujoco | null = null;
let train: DuckSim | null = null;
let hero: DuckSim | null = null;
let links: string[] = [];
let paused = false;
/** tools/mujoco-check.mjs: every slice also spins (factor − 1) × its own time, a CPU `factor`× slower */
let slowFactor = 1;
const spin = (ms: number): number => {
  if (slowFactor <= 1 || ms <= 0) return 0;
  const until = now() + ms * (slowFactor - 1);
  while (now() < until);
  return ms * (slowFactor - 1);
};
const runs = new Map<string, Cem>();
/** the latest hack per run (for `confirm` consecutive generations) */
const streak = new Map<string, { hack: string | null; n: number }>();

// ── slices ────────────────────────────────────────────────────────────────────
type Task = { kind: 'gen' | 'track'; step(budget: number): boolean; cancel?: string };
const queue: Task[] = [];
const channel = new MessageChannel();
let scheduled = false;
const now = (): number => performance.now();
function schedule(): void {
  if (scheduled || paused) return;
  scheduled = true;
  channel.port2.postMessage(0);
}
channel.port1.onmessage = () => {
  scheduled = false;
  if (paused) return;
  const t = queue[0];
  if (!t) return;
  if (t.step(8)) queue.shift();
  if (queue.length) schedule();
};

function rebuild(): void {
  if (!M) return;
  train?.dispose();
  hero?.dispose();
  train = new DuckSim(M, modelXml, links, EPISODE);
  hero = new DuckSim(M, modelXml, links, EPISODE);
}

// ── hero: real time, pushed by the player ─────────────────────────────────────
const heroState = {
  on: false,
  params: Float64Array.from(GAIT.mu0),
  world: { ...WORLDS.nominal } as World,
  t: 0,
  timer: 0 as unknown as ReturnType<typeof setInterval>,
  /** the F tug: force on the trunk (N) until `forceUntil` (hero time) */
  force: [0, 0, 0] as [number, number, number],
  forceUntil: 0,
  ctrl: new Float64Array(NACT),
  fell: false,
  x0: 0,
  idle: true,
};
function heroStart(params: ArrayLike<number> | null, world: World, idle: boolean): void {
  if (!hero) return;
  heroState.params = params ? Float64Array.from(params) : Float64Array.from(GAIT.mu0);
  heroState.world = world;
  heroState.idle = idle || !params;
  heroState.t = 0;
  heroState.fell = false;
  hero.setWorld(world);
  hero.reset();
  heroState.x0 = hero.data.qpos[0];
  if (!heroState.on) {
    heroState.on = true;
    heroState.timer = setInterval(heroTick, 1000 / WORKER.heroHz);
  }
}
function heroStop(): void {
  heroState.on = false;
  clearInterval(heroState.timer);
}
const heroPose = (): Float32Array => {
  const out = new Float32Array(links.length * POSE_STRIDE + 7 + NACT);
  hero!.readPose(out, 0);
  const q = hero!.data.qpos;
  for (let k = 0; k < 7 + NACT; k++) out[links.length * POSE_STRIDE + k] = q[k];
  return out;
};
function heroTick(): void {
  if (!hero || paused || !M) return;
  const m = hero.model;
  const d = hero.data;
  const steps = Math.round(1 / WORKER.heroHz / hero.dt);
  const qpos = d.qpos;
  const ctrl = d.ctrl;
  const xfrc = d.xfrc_applied;
  const trunk = hero.trunkId;
  for (let i = 0; i < steps; i++) {
    const si = Math.round(heroState.t / hero.dt);
    if (si % hero.dec === 0 && !heroState.fell) {
      if (heroState.idle) ctrl.set(hero.home);
      else {
        const qw = qpos[3],
          qx = qpos[4],
          qy = qpos[5],
          qz = qpos[6];
        gaitTargets(heroState.params, heroState.t, hero.home, 2 * (qw * qy - qz * qx), 2 * (qw * qx + qy * qz), heroState.ctrl);
        ctrl.set(heroState.ctrl);
      }
    }
    const on = heroState.t < heroState.forceUntil;
    xfrc[trunk * 6] = on ? heroState.force[0] : 0;
    xfrc[trunk * 6 + 1] = on ? heroState.force[1] : 0;
    xfrc[trunk * 6 + 2] = on ? heroState.force[2] : 0;
    M.mj_step(m, d);
    heroState.t += hero.dt;
    const upz = 1 - 2 * (qpos[4] * qpos[4] + qpos[5] * qpos[5]);
    if (!heroState.fell && (qpos[2] < EPISODE.fallHeight || upz < Math.cos((EPISODE.fallTiltDeg * Math.PI) / 180))) {
      heroState.fell = true;
      post({ t: 'hero-fell', at: heroState.t, dist: qpos[0] - heroState.x0 });
    }
  }
  const pose = heroPose();
  post({ t: 'pose', pose, time: heroState.t, fell: heroState.fell, dist: qpos[0] - heroState.x0 }, [pose.buffer]);
}

// ── generations ───────────────────────────────────────────────────────────────
function genTask(m: Extract<DuckIn, { t: 'gen' }>): Task {
  let cem = runs.get(m.run);
  if (!cem || m.restart) {
    cem = new Cem(GAIT, CEM, m.mu ?? undefined, m.sd ?? undefined);
    runs.set(m.run, cem);
    streak.set(m.run, { hack: null, n: 0 });
  }
  const ramp = m.curriculum ? Math.max(0, Math.min(1, (m.gen - CURRICULUM.fromGen) / (CURRICULUM.toGen - CURRICULUM.fromGen))) : 1;
  const job = new GenerationJob(train!, m.fixed ? null : cem, {
    gen: m.gen,
    pop: m.pop,
    weights: weightsOf(m.deck as Deck, CARDS, ramp),
    ranges: m.worlds === 'train' ? WORLDS.train : null,
    nominal: WORLDS.nominal,
    seed: m.seed,
    record: true,
    reference: REFERENCE,
    fixed: m.fixed ?? null,
    repeats: m.worlds === 'train' && !m.fixed ? CEM.repeatsRandom : 1,
  });
  const t0 = now();
  let spun = 0;
  return {
    kind: 'gen',
    cancel: m.run,
    step(budget) {
      const ts = now();
      const done = job.work(budget, now);
      spun += spin(now() - ts);
      if (!done) return false;
      const res: GenerationResult = job.finish();
      const st = streak.get(m.run) ?? { hack: null, n: 0 };
      const h = !m.fixed && m.gen >= HACKS.minGen ? detectHack(res.eliteStats, HACKS) : null;
      st.n = h && h === st.hack ? st.n + 1 : h ? 1 : 0;
      st.hack = h;
      streak.set(m.run, st);
      const out: GenOut = {
        t: 'gen',
        id: m.id,
        run: m.run,
        gen: m.gen,
        pop: m.pop,
        samples: res.samples,
        links: links.length,
        dist: Float32Array.from(res.results, (r) => r.dist),
        fallT: Float32Array.from(res.results, (r) => (r.fell ? r.t : -1)),
        friction: Float32Array.from(res.worlds, (w) => w.friction),
        elite: res.elite,
        stats: res.stats,
        eliteStats: res.eliteStats,
        hack: h && st.n >= HACKS.confirm ? h : null,
        mu: Array.from(res.mu),
        sd: Array.from(res.sd),
        rec: res.rec!,
        ms: now() - t0,
        workMs: res.ms + spun,
      };
      post(out, [out.rec.buffer, out.dist.buffer, out.fallT.buffer, out.friction.buffer]);
      return true;
    },
  };
}

function trackTask(m: Extract<DuckIn, { t: 'track' }>): Task {
  let done = false;
  return {
    kind: 'track',
    step() {
      if (done) return true;
      done = true;
      const t0 = now();
      const samples = train!.samples(TRACK.seconds);
      const per = samples * links.length * POSE_STRIDE;
      const rec = new Int16Array(m.n * per);
      const qrec = new Float32Array(m.n * samples * QPOS_STRIDE);
      const runsOut = testRuns(train!, m.params, m.n, m.seed, WORLDS.test, TRACK.seconds, TRACK.successM, rec, qrec);
      const res = runsOut.map((r) => ({ world: r.world, dist: r.result.dist, fell: r.result.fell, t: r.result.t, success: r.success }));
      post({ t: 'track', id: m.id, runs: res, rec, qrec, samples, links: links.length, ms: now() - t0 }, [rec.buffer, qrec.buffer]);
      return true;
    },
  };
}

// ── messages ──────────────────────────────────────────────────────────────────
scope.onmessage = (e) => {
  const m = e.data;
  try {
    switch (m.t) {
      case 'init': {
        const t0 = now();
        links = m.links;
        void loadMujoco({ locateFile: () => m.wasmUrl })
          .then((mod: Mujoco) => {
            M = mod;
            const t1 = now();
            rebuild();
            post({ t: 'ready', wasmMs: t1 - t0, modelMs: now() - t1, bodies: links.length, timestep: train!.dt });
          })
          .catch((err: unknown) => post({ t: 'error', where: 'init', message: String(err) }));
        break;
      }
      case 'links':
        links = m.links;
        rebuild();
        break;
      case 'gen':
        if (!train) throw new Error('not ready');
        queue.push(genTask(m));
        schedule();
        break;
      case 'track':
        if (!train) throw new Error('not ready');
        queue.push(trackTask(m));
        schedule();
        break;
      case 'cancel':
        for (let i = queue.length - 1; i >= 0; i--) if (queue[i].cancel === m.run || m.run === '*') queue.splice(i, 1);
        if (m.run === '*') runs.clear();
        break;
      case 'hero':
        if (!hero) break;
        if (m.on) heroStart(m.params, m.world ?? { ...WORLDS.nominal }, !!m.idle);
        else heroStop();
        break;
      case 'push':
        heroState.force = m.f;
        heroState.forceUntil = heroState.t + 0.15;
        break;
      case 'pause':
        paused = m.on;
        if (!paused) schedule();
        break;
      case 'ping':
        post({ t: 'pong', id: m.id });
        break;
      case 'slow':
        slowFactor = Math.max(1, m.factor);
        break;
      case 'bench': {
        // R2 §7.6: the physics step alone, then whole episodes with the gait; the home pose for 3 s
        const sim = train!;
        sim.setWorld(WORLDS.nominal);
        sim.reset();
        const t0 = now();
        for (let i = 0; i < m.steps; i++) M!.mj_step(sim.model, sim.data);
        const raw = ((now() - t0) * 1000) / m.steps;
        const none = { fwd: 0, alive: 0, upright: 0, energy: 0, smooth: 0, lift: 0, imitate: 0 };
        let n = 0;
        const t1 = now();
        while (n < m.steps) n += Math.round(sim.episode(GAIT.mu0, none, WORLDS.nominal, { postFall: 0 }).t / sim.dt);
        const gait = ((now() - t1) * 1000) / n;
        const still = new Float64Array(12);
        still[0] = 2;
        const home = sim.episode(still, none, WORLDS.nominal, { seconds: 3 });
        post({ t: 'bench', id: m.id, usPerStep: raw, usPerStepGait: gait, homeDrift: home.dist, homeFell: home.fell });
        break;
      }
    }
  } catch (err) {
    post({ t: 'error', where: m.t, message: err instanceof Error ? err.message : String(err) });
  }
};
