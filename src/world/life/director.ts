/**
 * WP15 — the LifeDirector (plan §4.12, §5.2; R9 §4.5): one farm clock (the 8-minute Hof-Takt), tiers per
 * life area and one update loop for every agent:
 *  - near ≤ 40 m: the agent's near() at 60 Hz;
 *  - mid 40–150 m: mid() at 15 Hz, in four round-robin slices;
 *  - far 150–1,500 m: no update, one instanced proxy draw for every far agent („Spielfiguren“), re-placed
 *    at 2 Hz;
 *  - hidden: inside an interior (the Schauhalle, the Traumhangar), the Kielraum, under the deck, or, for
 *    the ground, airborne above 300 m.
 * The loop is ctx.every, so it runs on game time: it stops on game:pause and behind the frozen panels
 * (Pass, map, info cards, credits) [C1 m8]. No per-frame allocations.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { HALL_PLOTS, SITE_PLOTS, KEEL, bearingOf, outlineRadius, type Vec3Tuple } from '../layout';
import type { AreaId, HofPhase, LifeAgentDef, LifeAreaDef, LifeDirector, LifeTier, ReactKind } from './types';
import { DIRECTOR, HOF } from './tuning';
import { PAL, unitPart } from './geo';

interface AreaState {
  id: AreaId;
  def: LifeAreaDef;
  tier: LifeTier;
}
interface AgentState {
  def: LifeAgentDef;
  removed: boolean;
  /** game time of the last mid() call */
  lastMid: number;
  slot: number;
}

export interface LifeRoots {
  /** island frame (ctx.root child), ledger 'life' */
  readonly island: THREE.Group;
  /** ground frame (the ground root's child), ledger 'life' */
  readonly ground: THREE.Group;
}

export interface Director extends LifeDirector {
  readonly roots: LifeRoots;
  /** the camera in the ground frame (h = 0 coordinates), updated every tick */
  readonly camGround: THREE.Vector3;
  /** the player's feet in world (= island) coordinates, updated every tick */
  readonly feet: THREE.Vector3;
  /** the player's feet in the ground frame */
  readonly feetGround: THREE.Vector3;
  /** current altitude h of the island over the dock */
  readonly altitude: number;
  /** milliseconds of the last tick (smoothed) */
  readonly lastMs: number;
  /** called once per tick after every agent (uploads: the crowds' instance buffers); returns off */
  afterTick(cb: (dt: number) => void): () => void;
  dispose(): void;
}

const PROXY_SCALE: Record<'figure' | 'vehicle' | 'animal', [number, number, number]> = {
  figure: [0.5, 1.75, 0.38],
  vehicle: [0.8, 0.7, 1.05],
  animal: [0.5, 0.5, 0.8],
};
const PROXY_COLOR: Record<'figure' | 'vehicle' | 'animal', number> = { figure: PAL.olive, vehicle: PAL.white, animal: PAL.stoneDark };

/** Interiors that hide every other life area while the camera is inside (§4.12 hidden tier). */
const INTERIORS = [...HALL_PLOTS, ...SITE_PLOTS].filter((p) => p.interior && p.shape?.kind === 'rect');

export function createDirector(ctx: ZoneContext, ground: THREE.Object3D, atPlaza: () => boolean = () => false): Director {
  const island = new THREE.Group();
  island.name = 'life:island';
  island.userData.ledger = 'life';
  island.userData.noMerge = true;
  island.userData.noEnrich = true;
  ctx.root.add(island);
  const groundG = new THREE.Group();
  groundG.name = 'life:ground';
  groundG.userData.ledger = 'life';
  groundG.userData.noMerge = true;
  groundG.userData.noEnrich = true;
  ground.add(groundG);

  const areas = new Map<AreaId, AreaState>();
  const agents: AgentState[] = [];
  const phaseCbs = new Set<(p: HofPhase) => void>();
  const afterCbs: ((dt: number) => void)[] = [];
  const tracked = new Set<THREE.Object3D>();

  // ── the clock ───────────────────────────────────────────────────────────────
  const clock = { t: HOF.startT, loop: 0, phase: 'ernte' as HofPhase, phaseT: HOF.startT };
  const phaseAt = (tl: number): { id: HofPhase; from: number } => {
    let cur: { id: HofPhase; from: number } = HOF.phases[0];
    for (const p of HOF.phases) if (tl >= p.from) cur = p;
    return cur;
  };
  const advance = (dt: number): void => {
    clock.t += dt;
    const loop = Math.floor(clock.t / HOF.loopS);
    const tl = clock.t - loop * HOF.loopS;
    const p = phaseAt(tl);
    clock.loop = loop;
    clock.phaseT = tl - p.from;
    if (p.id !== clock.phase) {
      clock.phase = p.id;
      for (const cb of phaseCbs) {
        try {
          cb(p.id);
        } catch (err) {
          console.error('[life] phase callback threw', err);
        }
      }
    }
  };

  // ── tiers ───────────────────────────────────────────────────────────────────
  const cam = new THREE.Vector3();
  const camGround = new THREE.Vector3();
  const feet = new THREE.Vector3();
  const feetGround = new THREE.Vector3();
  const c = new THREE.Vector3();
  let altitude = 0;
  const inInterior = (x: number, y: number, z: number): boolean => {
    for (const p of INTERIORS) {
      if (p.shape?.kind !== 'rect') continue;
      const f = THREE.MathUtils.degToRad(p.facingDeg ?? 0);
      const dx = x - p.anchor[0],
        dz = z - p.anchor[2];
      const lx = Math.cos(f) * dx - Math.sin(f) * dz,
        lz = Math.sin(f) * dx + Math.cos(f) * dz;
      if (Math.abs(lx) <= p.shape.w / 2 && Math.abs(lz) <= p.shape.d / 2 && y < 12) return true;
    }
    return false;
  };
  const tierFor = (a: AreaState): LifeTier => {
    const d = a.def;
    // the camera in the area's frame
    const p = d.frame === 'ground' ? camGround : cam;
    if (d.frame === 'ground' && altitude > DIRECTOR.hiddenAboveM) return 'hidden';
    // under the deck or in the Kielraum: nothing on the deck or the ground is seen
    const r = Math.hypot(cam.x, cam.z);
    const underDeck = cam.y < -3 && r < outlineRadius(bearingOf(cam.x, cam.z)) - 4;
    if (underDeck || cam.y < KEEL.catwalkY + 6) return 'hidden';
    // inside an interior hall: only the hall's own area (if life had one) is seen
    const inside = d.frame === 'ground' ? inInterior(camGround.x, camGround.y, camGround.z) : inInterior(cam.x, cam.y, cam.z);
    const own = inInterior(d.center[0], d.center[1], d.center[2]);
    if (inside && !own) return 'hidden';
    const dist = Math.max(0, p.distanceTo(c.set(d.center[0], d.center[1], d.center[2])) - d.radius);
    if (dist <= DIRECTOR.nearM) return 'near';
    if (dist <= DIRECTOR.midM) return 'mid';
    // on the plaza the ground's far tier is behind the rim (WP17: the plaza's GPU frame, GroundHandle.atPlaza)
    if (dist <= DIRECTOR.farM) return d.frame === 'ground' && atPlaza() ? 'hidden' : 'far';
    return 'hidden';
  };

  // ── far proxies: one instanced draw for every far agent („Spielfiguren“) ────
  const proxyMat = ctx.robots?.paint ?? ctx.materials.standard({ vertexColors: true, roughness: 0.55, metalness: 0 });
  const proxyGeo = unitPart().translate(0, 1, 0);
  const proxies = new THREE.InstancedMesh(proxyGeo, proxyMat, DIRECTOR.maxAgents);
  proxies.name = 'life:far-proxies';
  proxies.count = 0;
  proxies.castShadow = false;
  proxies.receiveShadow = false;
  proxies.frustumCulled = false;
  proxies.visible = false;
  proxies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const _col = new THREE.Color();
  for (let i = 0; i < DIRECTOR.maxAgents; i++) proxies.setColorAt(i, _col.setHex(PAL.olive));
  groundG.add(proxies);
  tracked.add(proxies);
  ctx.onDispose(() => proxyGeo.dispose());
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  const _p = new THREE.Vector3();
  let farAcc = 0;
  const placeProxies = (): void => {
    let n = 0;
    for (const a of agents) {
      if (a.removed || !a.def.far) continue;
      const st = areas.get(a.def.area);
      if (!st || st.tier !== 'far' || st.def.frame !== 'ground') continue;
      if (n >= DIRECTOR.maxAgents) break;
      a.def.far.at(_p);
      const sc = PROXY_SCALE[a.def.far.proxy];
      _m.compose(_p, _q.identity(), _s.set(sc[0], sc[1] / 2, sc[2]));
      proxies.setMatrixAt(n, _m);
      proxies.setColorAt(n, _col.setHex(PROXY_COLOR[a.def.far.proxy]));
      n++;
    }
    proxies.count = n;
    proxies.visible = n > 0;
    proxies.instanceMatrix.needsUpdate = true;
    if (proxies.instanceColor) proxies.instanceColor.needsUpdate = true;
  };

  // ── the loop ────────────────────────────────────────────────────────────────
  let last = ctx.time.elapsed;
  let frame = 0;
  let ms = 0;
  let nearCount = 0;
  const inv = new THREE.Matrix4();
  const tick = (): void => {
    const t0 = performance.now();
    const now = ctx.time.elapsed;
    const dt = Math.min(0.1, Math.max(0, now - last));
    last = now;
    frame++;
    advance(dt);
    altitude = ctx.flight.altitude;
    cam.copy(ctx.camera.position);
    feet.copy(ctx.player.position);
    ground.updateWorldMatrix(true, false);
    inv.copy(ground.matrixWorld).invert();
    camGround.copy(cam).applyMatrix4(inv);
    feetGround.copy(feet).applyMatrix4(inv);
    for (const a of areas.values()) {
      const t = tierFor(a);
      if (t === a.tier) continue;
      a.tier = t;
      for (const ag of agents) {
        if (ag.removed || ag.def.area !== a.id || !ag.def.tier) continue;
        try {
          ag.def.tier(t);
        } catch (err) {
          console.error(`[life] ${ag.def.id}.tier threw`, err);
        }
      }
    }
    nearCount = 0;
    const slice = frame % DIRECTOR.midSlices;
    for (const ag of agents) {
      if (ag.removed) continue;
      const st = areas.get(ag.def.area);
      const tier = st ? st.tier : 'near';
      // inline try/catch: no closure per call (no per-frame allocations)
      try {
        if (tier === 'near') {
          nearCount++;
          ag.lastMid = now;
          if (ag.def.near) ag.def.near(dt, clock);
          else if (ag.def.mid) ag.def.mid(dt, clock);
        } else if (tier === 'mid') {
          if (ag.slot % DIRECTOR.midSlices === slice && ag.def.mid) {
            const mdt = Math.min(0.4, now - ag.lastMid);
            ag.lastMid = now;
            ag.def.mid(mdt, clock);
          }
        } else ag.lastMid = now;
      } catch (err) {
        console.error(`[life] ${ag.def.id} threw`, err);
        ag.removed = true;
      }
    }
    for (let i = 0; i < afterCbs.length; i++) {
      try {
        afterCbs[i](dt);
      } catch (err) {
        console.error('[life] afterTick threw', err);
      }
    }
    farAcc += dt;
    if (farAcc >= 1 / DIRECTOR.farHz) {
      farAcc = 0;
      placeProxies();
    }
    ms = ms * 0.9 + (performance.now() - t0) * 0.1;
  };
  const safe = (fn: () => void): void => {
    try {
      fn();
    } catch (err) {
      console.error('[life] agent threw', err);
    }
  };
  const cancel = ctx.every(1 / 60, tick);

  // 'life:react' from anyone (WP12's beats: 'rotor'; WP13: 'liftoff', 'gather'; zones: 'greet', 'flush', 'wave')
  const offReact = ctx.events.on('life:react', (p?: { kind?: ReactKind; at?: Vec3Tuple }) => {
    if (p?.kind) director.react(p.kind, p.at);
  });

  let slots = 0;
  const director: Director = {
    roots: { island, ground: groundG },
    camGround,
    feet,
    feetGround,
    get altitude() {
      return altitude;
    },
    get lastMs() {
      return ms;
    },
    clock,
    register(def) {
      if (agents.filter((a) => !a.removed).length >= DIRECTOR.maxAgents) console.warn(`[life] agent cap ${DIRECTOR.maxAgents} reached: ${def.id}`);
      const st: AgentState = { def, removed: false, lastMid: ctx.time.elapsed, slot: slots++ };
      agents.push(st);
      const a = areas.get(def.area);
      if (a) safe(() => def.tier?.(a.tier));
      return {
        remove() {
          st.removed = true;
          const i = agents.indexOf(st);
          if (i >= 0) agents.splice(i, 1);
        },
      };
    },
    react(kind, at) {
      const where = at ?? null;
      for (const ag of agents) if (!ag.removed && ag.def.react) safe(() => ag.def.react!(kind, where));
    },
    onPhase(cb) {
      phaseCbs.add(cb);
      return () => phaseCbs.delete(cb);
    },
    tierOf(id) {
      return areas.get(id)?.tier ?? 'hidden';
    },
    stats() {
      let draws = 0;
      for (const m of tracked) {
        let vis = m.visible;
        for (let q = m.parent; q && vis; q = q.parent) vis = q.visible;
        const im = m as THREE.InstancedMesh;
        if (vis && (!im.isInstancedMesh || im.count > 0)) draws++;
      }
      return { agents: agents.filter((a) => !a.removed).length, near: nearCount, draws, ms: Math.round(ms * 1000) / 1000 };
    },
    area(id, def) {
      const a = areas.get(id);
      if (a) a.def = def;
      else {
        const st: AreaState = { id, def, tier: 'hidden' };
        areas.set(id, st);
        st.tier = tierFor(st);
      }
    },
    track(mesh) {
      tracked.add(mesh);
    },
    afterTick(cb) {
      afterCbs.push(cb);
      return () => {
        const i = afterCbs.indexOf(cb);
        if (i >= 0) afterCbs.splice(i, 1);
      };
    },
    dispose() {
      cancel();
      offReact();
      island.removeFromParent();
      groundG.removeFromParent();
    },
  };
  ctx.onDispose(() => director.dispose());
  return director;
}
