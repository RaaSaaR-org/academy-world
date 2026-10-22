/**
 * Zone 03 · Greifwerkstatt (GREIFEN) — GDD §7.3, adapted by docs/DECISIONS.md (du everywhere) and the
 * Phase 7 plan §4.4 (the real SO-101 at station C, D15/D33).
 *
 *  Landmark  Riesenarm holding a 4 m egg (giantArm.ts), idle 40 s loop, fingers synced to station B
 *  A         Gelenke: forward kinematics ring threading → CCD inverse kinematics with ghosts (stationA.ts)
 *  B         Das Ei: position vs. force control, friction cones, slow-motion crack replay (stationB.ts)
 *  C ◆ → M3  Lastdiagramm: the real SO-101's payload over reach, Nenn against the stall band
 *            (lastdiagramm.ts, model lastModel.ts; checked by tools/lastdiagramm-check.mjs). It replaced
 *            „200 Griffe“ (retired: its stamps are archived, src/systems/retired.ts)
 *
 * Maths (kinematics.ts, grip.ts, lastModel.ts) is pure: wet glass on rubber at a = 2 m/s² needs 9,45 N,
 * the 5 N force loop overshoots once to ≈ 5,7 N (no ringing); the stretched SO-101 holds 0 g at its rated
 * torque and 188–261 g in its stall band (R1 §1.1).
 *
 * Debug hooks: __academy.solve('greifwerkstatt', 'solve-a' | 'solve-b' | 'solve-c' | 'stars3-*' | 'album' | 'ld-model' | 'stats' | …)
 */
import * as THREE from 'three';
import { defineZone, type EmiHandle, type ZoneContext } from '@/core/zones';
import manifest from './manifest';
import { STRINGS } from './strings';
import { buildShell } from './shell';
import { buildGiantArm, CRADLE, type GiantArm } from './giantArm';
import { buildStationA, type StationA } from './stationA';
import { buildStationB, type StationB } from './stationB';
import { buildStationC, type StationC } from './lastdiagramm';
import { Sfx } from './sfx';
import { Shards } from './shards';
import { createLook, stationRings, type Look } from './look';

let arm: GiantArm | null = null;
let emi: EmiHandle | null = null;
let A: StationA | null = null;
let B: StationB | null = null;
let C: StationC | null = null;
let sfx: Sfx | null = null;
let shards: Shards | null = null;
let lastStation: 'a' | 'b' | 'c' | null = null;
let look: Look | null = null;
/** Sensorkapsel in the giant egg's cradle (FUN-PLAN G4): reachable only while the arm holds the egg up */
let kapsel: { lifted: boolean | null; check(): void } | null = null;
let rings: { update(): void } | null = null;

const STATION_POS = { a: new THREE.Vector3(7, 0, -2), b: new THREE.Vector3(-6, 0, 5.5), c: new THREE.Vector3(10.0, 0, 9.4) };

const STAMP = { a: 'gelenke', b: 'ei', c: 'lastdiagramm' } as const;
const OBJ_TARGET: Record<'a' | 'b' | 'c', [number, number, number]> = { a: [5.8, 0, -1.6], b: [-5.9, 0, 5.4], c: [10.4, 0, 9.5] };

/**
 * The station the player last used wins while it is unfinished; otherwise the mode's route (manifest
 * `route`, D40): Entdecker A → B → C, Entscheider the ◆ C only (A and B stay playable, never the target).
 */
function setObjective(ctx: ZoneContext): void {
  if (!ctx.playerInside) return;
  const open = (k: 'a' | 'b' | 'c'): boolean => !ctx.pass.has(STAMP[k]);
  const route = ctx.mode === 'entscheider' ? (['c'] as const) : (['a', 'b', 'c'] as const);
  const next = lastStation && open(lastStation) ? lastStation : route.find(open);
  if (next) ctx.hud.setObjective(ctx.i18n.text(`obj.${next}`), { target: OBJ_TARGET[next] });
  else ctx.hud.setObjective(ctx.i18n.text((['a', 'b', 'c'] as const).some(open) ? 'obj.doneRoute' : 'obj.done'));
}

export default defineZone({
  ...manifest,

  init(ctx) {
    ctx.i18n.register(STRINGS);
    ctx.pass.registerAlbum({ id: 'singularitaet', title: ctx.i18n.text('album.title'), text: ctx.i18n.text('album.text'), hint: ctx.i18n.text('album.hint') });
    sfx = new Sfx(ctx);
    ctx.onDispose(() => sfx?.dispose());
    shards = new Shards(ctx, ctx.groups.detail);

    look = createLook(ctx, 'greifwerkstatt');
    buildShell(ctx, look);
    arm = buildGiantArm(ctx, look);
    arm.buildFar(ctx.groups.far);

    emi = ctx.emi.spawn({ unit: 'EMI-04', position: [0, 0.08, 13.6], yawDeg: 0 });
    // station reactions replace the line on screen instead of queueing behind it (no subtitle pile-up)
    const say = (key: string): void => {
      void emi?.say(ctx.i18n.text(key), { interrupt: true });
    };
    const onStamp = (): void => {
      setObjective(ctx);
      arm?.celebrate();
      void emi?.gesture('nod');
    };

    const use = (k: 'a' | 'b' | 'c'): void => {
      lastStation = k;
      setObjective(ctx);
    };
    A = buildStationA(ctx, sfx, look, { onStamp, say, onUse: () => use('a') });
    B = buildStationB(ctx, sfx, shards, { onStamp, say, onUse: () => use('b'), crack: () => arm?.shiver() });
    C = buildStationC(ctx, sfx, look, { onStamp, say, onUse: () => use('c') });

    // station labels (DOM): hidden while any operate mode is active so they never float over a close-up
    const labels = [
      ctx.hud.worldLabel([5.8, 1.55, -2.4], ctx.i18n.text('labels.a'), { eyebrow: ctx.i18n.text('labels.aEye'), maxDistance: 10, kind: 'accent' }),
      ctx.hud.worldLabel([-5.95, 1.68, 4.45], ctx.i18n.text('labels.b'), { eyebrow: ctx.i18n.text('labels.bEye'), maxDistance: 10, kind: 'accent' }),
      ctx.hud.worldLabel([10.4, 1.55, 8.6], ctx.i18n.text('labels.c'), { eyebrow: ctx.i18n.text('labels.cEye'), maxDistance: 10, kind: 'accent' }),
    ];
    // while operating, the close-up owns the screen: no floating labels over it
    ctx.events.on('operate:enter', () => labels.forEach((l) => l.setVisible(false)));
    ctx.events.on('operate:exit', () => {
      labels.forEach((l) => l.setVisible(true));
      setObjective(ctx);
    });
    // the island re-asserts its own objective on mode changes; inside the plot ours wins again
    ctx.events.on('mode:changed', () => ctx.after(0.1, () => setObjective(ctx)));

    // EMI help (H): the nearest station at the depth of the current mode
    emi.onAsk(() => {
      const p = ctx.player.positionLocal();
      let best: 'a' | 'b' | 'c' | null = null,
        bd = 7;
      for (const k of ['a', 'b', 'c'] as const) {
        const d = Math.hypot(p.x - STATION_POS[k].x, p.z - STATION_POS[k].z);
        if (d < bd) (bd = d), (best = k);
      }
      best = best ?? lastStation;
      say(best ? `emi.ask.${best}` : 'emi.ask.zone');
      void emi?.gesture(best ? 'point' : 'nod');
    });

    // ── debug hooks (deterministic; Playwright drives them) ──────────────────
    ctx.debug.register('solve-a', () => A!.debugSolve());
    ctx.debug.register('solve-b', () => B!.debug.solve());
    ctx.debug.register('solve-c', () => C!.debug.solve());
    ctx.debug.register('album', () => ctx.pass.unlockAlbum('singularitaet'));
    // ★★★ results for screenshots and the playtest (FUN-PLAN §4.7)
    // the station loops only run while the zone is active: hooks called from afar walk the player in first
    const here = async (at: [number, number, number]): Promise<void> => {
      if (ctx.playerDistance <= 20) return;
      ctx.player.teleport(at);
      await new Promise<void>((r) => ctx.after(0.4, r));
    };
    ctx.debug.register('stars3-a', async () => {
      await here([5.8, 0.08, -1.2]);
      A!.debugStars3();
    });
    ctx.debug.register('stars3-b', async () => {
      await here([-6.2, 0.08, 6.4]);
      await B!.debug.stars3();
    });
    ctx.debug.register('stars3-c', async () => {
      await here([10.4, 0.08, 9.8]);
      await C!.debug.stars3();
    });

    // the capsule sits in the cradle cup; while the egg is seated it waits under the deck (out of reach),
    // when the arm lifts the egg it appears in the cup and can be picked from the guard ring (r 1.4 m)
    const cradleW = ctx.toWorld([CRADLE.x, 0, CRADLE.z]);
    kapsel = {
      lifted: null,
      check() {
        if (!arm || ctx.game.collectibles.has('greifwerkstatt.kapsel')) return;
        const e = arm.eggWorldPosition;
        const up = e.y - cradleW.y > 4.2 || Math.hypot(e.x - cradleW.x, e.z - cradleW.z) > 1.2;
        if (up === this.lifted) return;
        this.lifted = up;
        ctx.game.collectibles.place({ id: 'greifwerkstatt.kapsel', position: up ? [CRADLE.x, 1.05, CRADLE.z] : [CRADLE.x, -1.2, CRADLE.z], radius: 1.5 });
      },
    };
    kapsel.check();
    // station footprints: a teal ring each, T1 while the player is at the station
    const near = (x: number, z: number, d: number): (() => boolean) => () => {
      const p = ctx.player.positionLocal();
      return Math.hypot(p.x - x, p.z - z) < d;
    };
    rings = stationRings(ctx, look, [
      { at: [5.8, 0.096, -2.0], r: 1.0, active: near(5.8, -2.0, 1.9) },
      { at: [-5.95, 0.096, 5.35], r: 1.1, active: near(-5.95, 5.35, 2.0) },
      { at: [10.4, 0.096, 9.6], r: 1.0, active: near(10.4, 9.6, 1.9) },
    ]);
    ctx.debug.register('tp-kapsel', () => ctx.player.teleport([CRADLE.x + 2.2, 0.08, CRADLE.z + 1.0], { yawDeg: 60 }));
    // station A
    ctx.debug.register('a-joints-r1', () => A!.debugJoints([1.4, -0.45, -0.95]));
    ctx.debug.register('a-target-mode', () => A!.debugEnterTargetMode());
    ctx.debug.register('a-ik-r1', () => A!.debugTarget(2.2, 3.2));
    ctx.debug.register('a-ik-far', () => A!.debugTarget(5.2, 2.6));
    ctx.debug.register('a-ik-sing', () => A!.debugTarget(3.85, 2.25));
    ctx.debug.register('a-state', () => A!.state());
    // station B
    ctx.debug.register('b-enter', () => B!.debug.enter());
    ctx.debug.register('b1-crack', async () => {
      B!.debug.setSub('b1');
      await B!.debug.squeezeTo(34);
      return B!.debug.state();
    });
    ctx.debug.register('b1-gentle', async () => {
      B!.debug.setSub('b1');
      await B!.debug.squeezeTo(6);
      return B!.debug.lift();
    });
    ctx.debug.register('b2-squeeze', async () => {
      B!.debug.setSub('b2');
      await B!.debug.squeezeTo(6);
      return B!.debug.state();
    });
    ctx.debug.register('b3', async () => {
      B!.debug.setSub('b3');
      return B!.debug.grip5();
    });
    ctx.debug.register('b-glass-steel', () => B!.debug.rt({ obj: 'glas', pad: 'stahl', a: 2, f: 10 }));
    ctx.debug.register('b-glass-steel-firm', () => B!.debug.rt({ obj: 'glas', pad: 'stahl', a: 2, f: 30 }));
    ctx.debug.register('b-steel-rubber', () => B!.debug.rt({ obj: 'stahl', pad: 'gummi', a: 2, f: 20 }));
    ctx.debug.register('b-sack-steel-fast', () => B!.debug.rt({ obj: 'mehl', pad: 'stahl', a: 10, f: 100 }));
    ctx.debug.register('b-rt-view', () => {
      B!.debug.setSub('rt');
      return B!.debug.state();
    });
    ctx.debug.register('b-state', () => B!.debug.state());
    // station C
    ctx.debug.register('c-enter', () => C!.debug.enter());
    ctx.debug.register('c-state', () => C!.debug.state());
    // tools/lastdiagramm-check.mjs: the model numbers on the real SO-101 (waits for its GLB)
    ctx.debug.register('ld-model', () => C!.debug.model());
    ctx.debug.register('ld-aim', () => C!.debug.aim());
    for (const t of [10, 21, 26, 28.5, 30, 34, 38]) ctx.debug.register(`arm-t${t}`, () => arm?.setClock(t));
    // CPU cost of one zone update (ms): average over 120 calls of the real per-frame path
    ctx.debug.register('bench', () => {
      const n = 120,
        t0 = performance.now();
      for (let i = 0; i < n; i++) {
        arm?.update(1 / 60, ctx.time.elapsed);
        A?.update(1 / 60, ctx.time.elapsed);
        B?.update(1 / 60, ctx.time.elapsed);
        C?.update(1 / 60, ctx.time.elapsed);
      }
      return Math.round(((performance.now() - t0) / n) * 1000) / 1000;
    });
    // budget check: draw calls / triangles per tier (meshes; instanced = 1 call each)
    ctx.debug.register('stats', () => {
      const count = (g: THREE.Object3D): { calls: number; tris: number; casters: number } => {
        let calls = 0,
          tris = 0,
          casters = 0;
        g.traverseVisible((o) => {
          const m = o as THREE.Mesh;
          if (!(m.isMesh || (o as THREE.Line).isLine)) return;
          const geo = m.geometry as THREE.BufferGeometry;
          const idx = geo.index ? geo.index.count : geo.getAttribute('position').count;
          const inst = (m as unknown as THREE.InstancedMesh).isInstancedMesh ? (m as unknown as THREE.InstancedMesh).count : 1;
          const groups = Array.isArray(m.material) ? m.material.length : 1;
          calls += groups;
          tris += (idx / 3) * inst;
          if (m.castShadow) casters++;
        });
        return { calls, tris: Math.round(tris), casters };
      };
      return { detail: count(ctx.groups.detail), exterior: count(ctx.groups.exterior), far: count(ctx.groups.far), rootOther: ctx.root.children.length };
    });
    // Z1: the static exterior (floor, canopy, boards, cabinet, arm base) in few draws; the arm's
    // moving chain and the egg are flagged noMerge in giantArm.ts
    ctx.mergeStatic(ctx.groups.exterior, { shadows: 'union' });
  },

  onEnter(ctx) {
    setObjective(ctx);
    if (!ctx.progress.get('greeted', false)) {
      ctx.progress.set('greeted', true);
      void emi?.gesture('wave');
      // the zone's request (plan §3.2): the island's need in ≤ 12 words, then the step objectives
      void emi?.say(ctx.i18n.text('request')).then(() => emi?.gesture('show-joints'));
    }
  },

  onExit(ctx) {
    ctx.hud.setObjective(null);
  },

  update(dt, ctx) {
    const t = ctx.time.elapsed;
    arm?.setSqueeze(B?.force ?? 0);
    arm?.update(dt, t);
    kapsel?.check();
    rings?.update();
    A?.update(dt, t);
    B?.update(dt, t);
    C?.update(dt, t);
  },

  updateFar(dt, ctx) {
    // only the landmark moves while the zone is inactive (≤ 0.1 ms)
    arm?.setSqueeze(0);
    arm?.update(dt, ctx.time.elapsed);
  },

  dispose() {
    arm = null;
    emi = null;
    A = B = C = null;
    sfx = null;
    shards = null;
    lastStation = null;
    look = null;
    kapsel = null;
    rings = null;
  },
});
