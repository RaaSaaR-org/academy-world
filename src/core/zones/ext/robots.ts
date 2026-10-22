/**
 * WP4 (engine) — ctx.robots, the adapter over WP0's runtime (plan §5.2, §5.5, §5.6, §5.8, §5.9).
 * Rules: src/core/zones/types.robots.ts. The runtime (RobotLibrary, GLTFLoader, the meshopt decoder)
 * and the robot manifest load on the first request, never in the first load; the library is made
 * lazily with { materials, renderer, compile: rs.warmUp } like plan §6.5 WP4 step 7 says.
 *
 * One fetch job per file (a robot's GLB, its silhouette, the line-up); requests wait in the job until
 * the queue lets it run. The first request's own call is the fetch (a load() gets its model from it);
 * the others run against the parsed cache once the job is 'ready'.
 */
import * as THREE from 'three';
import type { Game } from '../../Game';
import { registerContextExtension } from '../ext';
import { registerBootWarmup } from '../../RenderSystem';
import { registerDebugExt } from '../../DebugApi';
// the boot warm-up dummies for the programs that linked during play (highlight rim, alpha-tested caster depth, transparent basic)
import './warmup';
import type { RobotClip, RobotFetchState, RobotId, RobotModel, RobotPriority, ZoneRobots } from '../types.robots';

type Library = import('../../robots').RobotLibrary;
type ManifestModule = typeof import('@/robots/manifest');

/**
 * The robots' paint (RobotLibrary.ts ROBOT_PAINT). Repeated here because the library is lazy and the
 * boot warm-up must compile its programs with exactly these parameters (MaterialLibrary.standard
 * caches by parameters, so both get the same material); a dev check compares them on load.
 */
const PAINT: THREE.MeshStandardMaterialParameters = { vertexColors: true, roughness: 0.55, metalness: 0 };
/** The dream ghosts' material (teal = prediction, plan §4 colours): one transparent program for every ghost. */
const GHOST: THREE.MeshStandardMaterialParameters = {
  color: 0x2dd4bf,
  emissive: 0x2dd4bf,
  emissiveIntensity: 0.4,
  roughness: 0.6,
  metalness: 0,
  transparent: true,
  opacity: 0.32,
  depthWrite: false,
};

/** Queue numbers (plan §5.6, §5.8). */
export const ROBOT_QUEUE = {
  /** fetches at once */
  maxFetches: 2,
  /** a 'route' request starts once the player is this close to its area's plot edge (m), or the area is the objective */
  nearEdgeM: 60,
  /** retries after a failed fetch (ms); then 'failed' + robots:failed */
  retryMs: [1000, 3000, 9000] as readonly number[],
  /** how often the queue re-checks distances (s) */
  pumpEvery: 0.25,
};

type Rank = 0 | 1 | 2 | 3;
const RANK: Record<RobotPriority, Rank> = { now: 0, route: 2, idle: 3 };

interface Request {
  area: string;
  rank: Rank;
  prefetch: boolean;
  run: (lib: Library) => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

interface Job {
  key: string;
  id: RobotId | null;
  kind: 'glb' | 'sil' | 'lineup';
  state: RobotFetchState;
  running: boolean;
  attempts: number;
  retryAt: number;
  pending: Request[];
  error: string | null;
}

interface Tracked {
  model: RobotModel;
  area: string;
  lod: boolean;
}

interface Track {
  joint: string;
  times: Float64Array;
  values: Float64Array;
  i: number;
}

interface Anim {
  model: RobotModel;
  area: string;
  tracks: Track[];
  duration: number;
  loop: boolean;
  speed: number;
  t: number;
  stopped: boolean;
}

interface AreaState {
  id: string;
  models: Set<RobotModel>;
  ids: Set<RobotId>;
  disposed: boolean;
}

/** What Game drives (per frame) and the tools read. */
export interface RobotsAdapter {
  update(dt: number): void;
  /** the ctx.robots of an area (tools; 'world' = the island module's) */
  forArea(id: string): ZoneRobots | null;
  stats(): unknown;
}

export interface FetchLogEntry {
  key: string;
  area: string;
  kind: string;
  attempt: number;
  t0: number;
  t1: number | null;
  ok: boolean | null;
  regionOpen: boolean;
  paused: boolean;
}

export function installRobots(game: Game): RobotsAdapter {
  let lib: Promise<Library> | null = null;
  let manifest: ManifestModule | null = null;
  let manifestP: Promise<ManifestModule> | null = null;
  const loadManifest = (): Promise<ManifestModule> => {
    if (!manifestP) {
      manifestP = import('@/robots/manifest').then((m) => (manifest = m));
      // a failed import is not kept: the next request (or a 'robots:retry') imports afresh
      manifestP.catch(() => (manifestP = null));
    }
    return manifestP;
  };
  const library = (): Promise<Library> => {
    if (!lib) {
      lib = import('../../robots').then((m) => {
        if (import.meta.env.DEV && JSON.stringify(m.ROBOT_PAINT) !== JSON.stringify(PAINT))
          console.error('[robots] ROBOT_PAINT changed: update PAINT in src/core/zones/ext/robots.ts (the boot warm-up compiles it)', m.ROBOT_PAINT);
        return new m.RobotLibrary({ materials: game.materials, renderer: game.rs.renderer, compile: (root: THREE.Object3D) => game.rs.warmUp({ root }) });
      });
      lib.catch(() => (lib = null));
    }
    return lib;
  };

  const jobs = new Map<string, Job>();
  const tracked = new Map<RobotModel, Tracked>();
  const anims: Anim[] = [];
  const areas = new Map<string, AreaState>();
  const apis = new Map<string, ZoneRobots>();
  const fetchLog: FetchLogEntry[] = [];
  let running = 0;
  let prewarming = false;
  let regionOpen = game.quest.snapshot().regionOpen;
  let liftoff = false;
  let pumpT = 0;
  let pumpTimer = 0;

  game.quest.onChange((s) => {
    if (s.regionOpen === regionOpen) return;
    regionOpen = s.regionOpen;
    pump();
  });
  // the lift-off (WP13): prefetch pauses from the spin-up until the dusk
  game.events.on('flight:phase', (p?: { name?: string }) => {
    liftoff = !!p?.name && p.name !== 'dusk';
    if (!liftoff) pump();
  });
  game.events.on('objective:changed', () => pump());
  game.events.on('zone:suspend', (p?: { id?: string }) => {
    if (!p?.id) return;
    releaseUnused(p.id);
    evictSuspended(p.id);
  });
  // back on the ground: the evicted robots upload again in idle slots, before the area is in view (WP17)
  game.events.on('zone:resume', (p?: { id?: string }) => {
    const a = p?.id ? areas.get(p.id) : null;
    if (!a || !lib) return;
    void lib.then((l) => {
      for (const id of a.ids) if (liveOf(id) > 0) void l.prewarm(id).catch(() => undefined);
    });
  });
  // „Erneut laden“ on WP1's loading card (plan §5.8): 'robots:retry' { id, area } resets the robot's failed
  // jobs (state 'idle', the retry count from 0) and fetches the file once more at once, warmed, so the area's
  // next ctx.robots.load() finds it parsed (or, if the area calls load() right away, joins that fetch). A
  // failure again ends as 'failed' with a new 'robots:failed' (WP1 counts a failed retry).
  game.events.on('robots:retry', (p?: { id?: string; area?: string }) => {
    if (p?.id) retry(p.id as RobotId, p.area ?? 'world');
  });

  // ── gates ───────────────────────────────────────────────────────────────────

  /** prefetch waits: a cinematic camera (not operate mode), the island off the dock (Probestart, F1, the climb), the lift-off */
  const paused = (): boolean => (!!game.player.cameraOverride && !game.operate.isActive) || !game.frames.physicsDocked || liftoff;

  const reachable = (area: string): boolean => {
    if (area === 'world') return true;
    const rec = game.zones.records.get(area);
    if (!rec || rec.suspended) return false;
    if (game.zones.kindOf(rec) !== 'site' || regionOpen) return true;
    // the resume area and a deep link always (plan §5.6)
    const p = game.params;
    return p.zone === area || !!p.only?.includes(area) || game.quest.resumeArea() === area;
  };

  const near = (area: string): boolean => {
    if (area === 'world' || game.zones.objective === area) return true;
    const st = game.zones.records.get(area)?.state;
    return !!st && st.edgeDistance <= ROBOT_QUEUE.nearEdgeM;
  };

  const eligible = (r: Request): boolean => {
    if (!reachable(r.area)) return false;
    if (r.prefetch && (paused() || prewarming)) return false;
    return r.rank === 0 || near(r.area);
  };

  const order = (r: Request): number => {
    const objective = game.zones.objective === r.area && r.rank > 0 ? 1 : r.rank;
    const edge = game.zones.records.get(r.area)?.state?.edgeDistance ?? 0;
    return objective * 1e6 + (r.prefetch ? 5e5 : 0) + Math.min(edge, 4e5);
  };

  // ── the queue ───────────────────────────────────────────────────────────────

  const jobOf = (key: string, kind: Job['kind'], id: RobotId | null): Job => {
    let j = jobs.get(key);
    if (!j) jobs.set(key, (j = { key, id, kind, state: 'idle', running: false, attempts: 0, retryAt: 0, pending: [], error: null }));
    return j;
  };

  function request<T>(key: string, kind: Job['kind'], id: RobotId | null, area: string, rank: Rank, prefetch: boolean, run: (lib: Library) => Promise<T>): Promise<T> {
    void loadManifest();
    const j = jobOf(key, kind, id);
    if (j.state === 'failed' || j.state === 'idle') {
      j.state = 'queued';
      j.attempts = 0;
      j.retryAt = 0;
      j.error = null;
    }
    const p = new Promise<T>((resolve, reject) => j.pending.push({ area, rank, prefetch, run: run as Request['run'], resolve: resolve as Request['resolve'], reject }));
    pump();
    return p;
  }

  function retry(id: RobotId, area: string): void {
    // a failed manifest or runtime import is not cached either (the next request imports afresh)
    for (const kind of ['glb', 'sil'] as const) {
      const j = jobs.get(`${kind}:${id}`);
      if (!j || j.state !== 'failed') continue;
      j.state = 'idle';
      j.attempts = 0;
      j.retryAt = 0;
      j.error = null;
      const run = (l: Library): Promise<unknown> => (kind === 'glb' ? l.prewarm(id) : l.loadSilhouette(id));
      void request<unknown>(j.key, kind, id, areas.has(area) ? area : 'world', RANK.now, false, run).catch(() => undefined);
    }
  }

  /** a request against a parsed file: no network, no slot */
  const runDirect = (r: Request): void => {
    void library()
      .then((l) => r.run(l))
      .then(r.resolve, r.reject);
  };

  function pump(): void {
    const now = performance.now();
    const candidates: { job: Job; req: Request }[] = [];
    let soonest = Infinity;
    for (const j of jobs.values()) {
      if (j.running || !j.pending.length) continue;
      if (j.state === 'ready') {
        // parsed: everything but a prewarm runs now; a prewarm waits for the prewarm lane
        for (let i = j.pending.length - 1; i >= 0; i--) {
          const r = j.pending[i];
          if (r.prefetch) continue;
          j.pending.splice(i, 1);
          if (!areas.get(r.area)?.disposed) runDirect(r);
        }
        const pre = j.pending.find((r) => eligible(r));
        if (pre) {
          j.pending.splice(j.pending.indexOf(pre), 1);
          prewarming = true;
          void library()
            .then((l) => pre.run(l))
            .then(pre.resolve, pre.reject)
            .finally(() => {
              prewarming = false;
              pump();
            });
        }
        continue;
      }
      if (j.state !== 'queued' && j.state !== 'loading') continue;
      if (j.retryAt > now) {
        soonest = Math.min(soonest, j.retryAt);
        continue;
      }
      let best: Request | null = null;
      for (const r of j.pending) if (eligible(r) && (!best || order(r) < order(best))) best = r;
      if (best) candidates.push({ job: j, req: best });
    }
    candidates.sort((a, b) => order(a.req) - order(b.req));
    for (const c of candidates) {
      if (running >= ROBOT_QUEUE.maxFetches) break;
      if (c.req.prefetch && prewarming) continue;
      start(c.job, c.req);
    }
    if (soonest < Infinity) {
      window.clearTimeout(pumpTimer);
      pumpTimer = window.setTimeout(pump, Math.max(0, soonest - now) + 5);
    }
  }

  function start(j: Job, primary: Request): void {
    j.pending.splice(j.pending.indexOf(primary), 1);
    j.running = true;
    j.state = 'loading';
    running++;
    if (primary.prefetch) prewarming = true;
    const log: FetchLogEntry = { key: j.key, area: primary.area, kind: j.kind, attempt: j.attempts, t0: performance.now(), t1: null, ok: null, regionOpen, paused: paused() };
    fetchLog.push(log);
    if (fetchLog.length > 400) fetchLog.splice(0, fetchLog.length - 400);
    void library()
      .then((l) => primary.run(l))
      .then(
        (v) => {
          log.t1 = performance.now();
          log.ok = true;
          j.state = 'ready';
          j.attempts = 0;
          primary.resolve(v);
        },
        (err: unknown) => {
          log.t1 = performance.now();
          log.ok = false;
          const msg = err instanceof Error ? err.message : String(err);
          j.error = msg;
          if (j.attempts < ROBOT_QUEUE.retryMs.length) {
            // plan §5.8: retry with backoff; the request goes back to the front of its job
            j.retryAt = performance.now() + ROBOT_QUEUE.retryMs[j.attempts];
            j.attempts++;
            j.pending.unshift(primary);
            console.warn(`[robots] ${j.key} failed (${msg}) — retry ${j.attempts}/${ROBOT_QUEUE.retryMs.length} in ${ROBOT_QUEUE.retryMs[j.attempts - 1] / 1000} s`);
            return;
          }
          j.state = 'failed';
          const all = [primary, ...j.pending.splice(0)];
          for (const r of all) r.reject(err);
          console.warn(`[robots] ${j.key} failed after ${ROBOT_QUEUE.retryMs.length} retries: ${msg}`);
          if (j.id) game.events.emit('robots:failed', { id: j.id, area: primary.area, error: msg });
        },
      )
      .finally(() => {
        j.running = false;
        running--;
        if (primary.prefetch) prewarming = false;
        pump();
      });
  }

  // ── models: LOD tracking, release ───────────────────────────────────────────

  const liveOf = (id: RobotId): number => {
    let n = 0;
    for (const t of tracked.values()) if (t.model.id === id) n++;
    for (const a of areas.values()) for (const m of a.models) if (m.id === id && !tracked.has(m)) n++;
    return n;
  };

  /** release the parsed GLBs of an area that no model uses any more (dispose, suspend: §5.9) */
  function releaseUnused(area: string): void {
    const a = areas.get(area);
    if (!a || !lib) return;
    void lib.then((l) => {
      for (const id of a.ids) {
        const j = jobs.get(`glb:${id}`);
        if (liveOf(id) > 0 || (j && (j.running || j.pending.length))) continue;
        if (l.release(id) && j && j.state === 'ready') j.state = 'idle';
      }
    });
  }

  /**
   * suspend (§5.9, WP17): a robot whose every model sits in a suspended area gives its GPU copies back
   * (RobotLibrary.evict: vertex buffers, bone textures); the parse and the models stay for the resume
   */
  function evictSuspended(area: string): void {
    const a = areas.get(area);
    if (!a || !lib) return;
    void lib.then((l) => {
      for (const id of a.ids) {
        const models: RobotModel[] = [];
        let shown = false;
        for (const [m, t] of tracked)
          if (m.id === id) {
            models.push(m);
            shown ||= areaLive(t.area);
          }
        for (const s of areas.values())
          for (const m of s.models)
            if (m.id === id && !tracked.has(m)) {
              models.push(m);
              shown ||= areaLive(s.id);
            }
        if (models.length && !shown) l.evict(id, models);
      }
    });
  }

  function adopt(model: RobotModel, area: string): RobotModel {
    const a = areas.get(area);
    if (!a || a.disposed) {
      model.dispose();
      return model;
    }
    a.models.add(model);
    tracked.set(model, { model, area, lod: true });
    const dispose = model.dispose.bind(model);
    model.dispose = () => {
      tracked.delete(model);
      a.models.delete(model);
      for (const an of anims) if (an.model === model) an.stopped = true;
      dispose();
    };
    return model;
  }

  // ── clips ───────────────────────────────────────────────────────────────────

  /**
   * One clip step: the keyframes are sampled inline (a cached segment index per track, no closure,
   * no temporary, no double returned from a helper), then written with RobotModel.setJoint.
   */
  function applyAnim(a: Anim): void {
    const t = a.t;
    for (let k = 0; k < a.tracks.length; k++) {
      const tr = a.tracks[k];
      const T = tr.times;
      const V = tr.values;
      const n = T.length;
      let v: number;
      if (n === 1 || t <= T[0]) {
        tr.i = 0;
        v = V[0];
      } else if (t >= T[n - 1]) {
        tr.i = n - 2;
        v = V[n - 1];
      } else {
        let i = tr.i;
        if (i >= n - 1 || T[i] > t) i = 0;
        while (i < n - 2 && T[i + 1] < t) i++;
        tr.i = i;
        v = V[i] + ((V[i + 1] - V[i]) * (t - T[i])) / (T[i + 1] - T[i] || 1);
      }
      a.model.setJoint(tr.joint, v);
    }
  }

  function stepAnims(dt: number): void {
    for (let k = anims.length - 1; k >= 0; k--) {
      const a = anims[k];
      if (a.stopped) {
        anims[k] = anims[anims.length - 1];
        anims.pop();
        continue;
      }
      if (!areaActive(a.area)) continue;
      a.t += dt * a.speed;
      if (a.t >= a.duration) {
        if (a.loop) a.t %= a.duration;
        else {
          a.t = a.duration;
          a.stopped = true;
        }
      }
      applyAnim(a);
    }
  }

  const areaActive = (area: string): boolean => {
    if (area === 'world') return true;
    const rec = game.zones.records.get(area);
    return !!rec && !rec.suspended && !!rec.state?.active;
  };
  /** LOD follows the camera while the area is built and not suspended (its exterior tier may show a robot from afar) */
  const areaLive = (area: string): boolean => {
    if (area === 'world') return true;
    const rec = game.zones.records.get(area);
    return !!rec && rec.status === 'ready' && !rec.suspended;
  };

  // ── boot warm-up (plan §5.5): every robot / crowd program before the title ────

  registerBootWarmup('robots', () => buildWarmup(game));

  // ── ctx.robots per area ─────────────────────────────────────────────────────

  registerContextExtension('robots', (area) => {
    const st: AreaState = { id: area.id, models: new Set(), ids: new Set(), disposed: false };
    areas.set(area.id, st);
    area.onDispose(() => {
      st.disposed = true;
      for (const m of [...st.models]) m.dispose();
      st.models.clear();
      for (const j of jobs.values()) j.pending = j.pending.filter((r) => r.area !== area.id);
      releaseUnused(area.id);
      areas.delete(area.id);
      apis.delete(area.id);
    });
    const use = (id: RobotId): void => void st.ids.add(id);
    const api: ZoneRobots = {
      load(id, o = {}) {
        use(id);
        const { priority, ...opts } = o;
        return request(`glb:${id}`, 'glb', id, area.id, RANK[priority ?? 'route'], false, (l) => l.load(id, opts)).then((m) => adopt(m, area.id));
      },
      loadSilhouette(id) {
        use(id);
        return request(`sil:${id}`, 'sil', id, area.id, RANK.route, false, (l) => l.loadSilhouette(id));
      },
      bodies(id, lod) {
        use(id);
        return request(`glb:${id}`, 'glb', id, area.id, RANK.route, false, (l) => l.bodies(id, lod));
      },
      prefetch(list, o = {}) {
        for (const id of list) {
          use(id);
          const j = jobs.get(`glb:${id}`);
          if (j?.pending.some((r) => r.prefetch)) continue;
          void request(`glb:${id}`, 'glb', id, area.id, RANK[o.priority ?? 'idle'], true, (l) => l.prewarm(id)).catch(() => undefined);
        }
      },
      async info(id) {
        return (await loadManifest()).robotInfo(id);
      },
      state: (id) => jobs.get(`glb:${id}`)?.state ?? 'idle',
      progress(id) {
        if (!manifest) return null;
        const total = manifest.robotInfo(id).bytes.glb.br;
        return { loaded: jobs.get(`glb:${id}`)?.state === 'ready' ? total : 0, total };
      },
      animate(model, clip, o = {}) {
        const tracks: Track[] = [];
        for (const joint of Object.keys(clip.tracks)) {
          const keys = clip.tracks[joint];
          if (!keys.length) continue;
          tracks.push({ joint, times: Float64Array.from(keys, (k) => k[0]), values: Float64Array.from(keys, (k) => k[1]), i: 0 });
        }
        const a: Anim = { model, area: area.id, tracks, duration: Math.max(1e-3, clip.duration), loop: o.loop ?? clip.loop ?? false, speed: o.speed ?? 1, t: 0, stopped: false };
        if (game.settings.data.reducedMotion) {
          // reduced motion: the end pose (a clip that ends) or the first pose (a loop), held
          a.t = a.loop ? 0 : a.duration;
          applyAnim(a);
          return { stop() {} };
        }
        applyAnim(a);
        anims.push(a);
        return {
          stop() {
            a.stopped = true;
          },
        };
      },
      untrack(model) {
        const t = tracked.get(model);
        if (t) t.lod = false;
      },
      // additive (WP11, Request(WP4)): the Schauhalle governor's LRU releases files it no longer shows
      release(id) {
        const j = jobs.get(`glb:${id}`);
        if (liveOf(id) > 0 || !lib || (j && (j.running || j.pending.length))) return false;
        void lib.then((l) => {
          if (liveOf(id) > 0) return;
          if (l.release(id) && j && j.state === 'ready') j.state = 'idle';
        });
        return true;
      },
      lineup() {
        return request('lineup', 'lineup', null, area.id, RANK.route, false, (l) => l.loadLineup());
      },
      async lineupInfo() {
        return (await loadManifest()).ROBOT_LINEUP ?? null;
      },
      get paint() {
        return game.materials.standard(PAINT);
      },
      get ghost() {
        return game.materials.standard(GHOST);
      },
    };
    apis.set(area.id, api);
    return api;
  });

  const vh = new THREE.Vector2();
  const adapter: RobotsAdapter = {
    update(dt) {
      if (tracked.size) {
        const cam = game.camera;
        const h = game.rs.renderer.getDrawingBufferSize(vh).y;
        for (const t of tracked.values()) if (t.lod && areaLive(t.area)) t.model.updateLod(cam, h);
      }
      if (anims.length) stepAnims(dt);
      pumpT += dt;
      if (pumpT >= ROBOT_QUEUE.pumpEvery) {
        pumpT = 0;
        if (jobs.size) pump();
      }
    },
    forArea: (id) => apis.get(id) ?? null,
    stats() {
      return {
        running,
        prewarming,
        paused: paused(),
        regionOpen,
        jobs: [...jobs.values()].map((j) => ({ key: j.key, state: j.state, running: j.running, attempts: j.attempts, pending: j.pending.length, error: j.error })),
        models: [...tracked.values()].map((t) => ({ id: t.model.id, area: t.area, lod: String(t.model.shownLod), tracked: t.lod })),
        anims: anims.filter((a) => !a.stopped).length,
        log: fetchLog.slice(),
      };
    },
  };

  // tools (robots-adapter-check, hitches): the queue's state, a per-area ctx.robots, a clip bench
  registerDebugExt('robots', ((cmd?: string, ...args: unknown[]) => {
    if (cmd === 'api') return adapter.forArea(String(args[0] ?? 'world'));
    if (cmd === 'queue') return ROBOT_QUEUE;
    if (cmd === 'bench') return benchClip(args[0] as RobotModel, args[1] as RobotClip, Number(args[2] ?? 10000), args[3] === 'stub');
    return adapter.stats();
  }) as never);

  /**
   * n clip steps, nothing else: the heap before and after (precise only with Chromium's
   * --enable-precise-memory-info). `stub`: the joints go to a recording stand-in instead of the
   * RobotModel, so only the adapter's own per-step code is measured (RobotModel.setJoint returns
   * the applied value, a double that V8 boxes in every call: WP0's side).
   */
  function benchClip(model: RobotModel, clip: RobotClip, n: number, stub = false): { steps: number; ms: number; heapDelta: number | null } {
    const tracks: Track[] = Object.keys(clip.tracks).map((joint) => ({ joint, times: Float64Array.from(clip.tracks[joint], (k) => k[0]), values: Float64Array.from(clip.tracks[joint], (k) => k[1]), i: 0 }));
    const sink = new Float64Array(64);
    const target = stub
      ? ({
          setJoint(name: string, v: number): void {
            sink[name.length & 63] = v;
          },
        } as unknown as RobotModel)
      : model;
    const a: Anim = { model: target, area: 'world', tracks, duration: Math.max(1e-3, clip.duration), loop: true, speed: 1, t: 0, stopped: false };
    const mem = (): number | null => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
    const run = (m: number): void => {
      for (let i = 0; i < m; i++) {
        a.t += 1 / 60;
        if (a.t >= a.duration) a.t -= a.duration;
        applyAnim(a);
      }
    };
    run(Math.min(n, 5000));
    const h0 = mem();
    const t0 = performance.now();
    run(n);
    const ms = performance.now() - t0;
    const h1 = mem();
    return { steps: n, ms, heapDelta: h0 != null && h1 != null ? h1 - h0 : null };
  }

  return adapter;
}

/**
 * Dummies whose programs the boot warm-up compiles (plan §5.5): the skinned robot (and its
 * shadow-depth variant), the instanced crowd body with and without per-instance colours, the
 * transparent teal ghost, the silhouette, and the shadow-depth variants a plain caster can need
 * after a robot (below). Their attributes match WP0's GLBs (position, normal, an RGB colour,
 * joints, weights), so the program keys match the real robots'.
 */
function buildWarmup(game: Game): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'warmup:robots';
  const paint = game.materials.standard(PAINT);
  const ghost = game.materials.standard(GHOST);
  const tri = (skinned: boolean): THREE.BufferGeometry => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.1, 0, 0, 0, 0.1, 0], 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
    if (skinned) {
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    }
    return geo;
  };
  const skinned = (mat: THREE.Material, cast: boolean): THREE.SkinnedMesh => {
    const bone = new THREE.Bone();
    const m = new THREE.SkinnedMesh(tri(true), mat);
    m.add(bone);
    m.bind(new THREE.Skeleton([bone]));
    m.castShadow = cast;
    m.receiveShadow = true;
    m.frustumCulled = false;
    return m;
  };
  const robot = skinned(paint, true);
  robot.name = 'warmup:robot-skinned';
  const dream = skinned(ghost, false);
  dream.name = 'warmup:robot-ghost';
  const crowd = new THREE.InstancedMesh(tri(false), paint, 1);
  crowd.name = 'warmup:robot-crowd';
  crowd.castShadow = crowd.receiveShadow = true;
  crowd.frustumCulled = false;
  const tinted = new THREE.InstancedMesh(tri(false), paint, 1);
  tinted.name = 'warmup:robot-crowd-tinted';
  tinted.castShadow = tinted.receiveShadow = true;
  tinted.setColorAt(0, new THREE.Color(1, 1, 1));
  tinted.frustumCulled = false;
  const silhouette = new THREE.Mesh(tri(false), paint);
  silhouette.name = 'warmup:robot-silhouette';
  silhouette.castShadow = true;
  silhouette.frustumCulled = false;
  g.add(robot, dream, crowd, tinted, silhouette);
  // three's shadow pass draws every plain caster with ONE shared MeshDepthMaterial whose side and map
  // change per object, but it picks a new program only when the object kind changes (skinned /
  // instanced ↔ plain). So the plain caster drawn right after a robot or a crowd gets the program for
  // ITS side and map — a program the island may never have needed (seen: a double-sided one on the
  // first show of the G1). Each side × map variant is compiled here right behind a skinned caster.
  const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  tex.needsUpdate = true;
  for (const side of [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide])
    for (const map of [null, tex]) {
      const lead = skinned(paint, true);
      lead.name = 'warmup:depth-lead';
      const plain = new THREE.Mesh(tri(false), paint);
      plain.name = `warmup:depth-${side}${map ? '-map' : ''}`;
      plain.castShadow = true;
      plain.frustumCulled = false;
      plain.onBeforeShadow = (_r, _s, _c, _sc, _g, depth) => {
        const d = depth as THREE.MeshDepthMaterial;
        d.side = side;
        d.map = map;
      };
      g.add(lead, plain);
    }
  return g;
}
