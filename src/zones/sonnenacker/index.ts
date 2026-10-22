/**
 * Sonnenacker / Sun Field (plan §4.10, R8 §2; WP9) — the agrivoltaic tomato farm in the Revier that
 * harvests tomatoes and power: raised beds under tracking PV, 12 + 6 real SO-101 arms on rails, LeKiwi
 * rovers, people who still look after it, and the island's Startakku (ENERGIE, D23).
 *   A  Reif oder nicht?  (Probieren)  — teach the wrist camera ripe vs. not, then beat the shade
 *   B  Licht teilen      (Verstehen)  — share the light between crop and power on the Tagesmodell
 *   C  Erntetag ◆        (Messen)     — prepare the beds, run the automated day, answer the calls
 *
 * Events it provides (zones talk to life only through events, plan §4.12):
 *   'sonnenacker:shift'  { phase, arms: { id, state, at }[] } — on every phase change and every 2 s
 *                        (phase: the farm clock's 'ernte' | 'abtransport' | 'wartung' | 'bewaesserung',
 *                        'erntetag' during station C's day; at = world position of the arm base)
 *   'sonnenacker:pick'   { arm, ok, damaged, at, sample } — every pick (a miss stays on the vine)
 *   'sonnenacker:kapsel' { k, n, lo, hi, value, lesson } — the Tomatenkapsel's lesson hook (WP15)
 *   'flight:phase'       { name: 'trackers:farm', t, h, r } — the lift-off's stow wave reached the farm
 * Hooks: __academy.solve('sonnenacker', 'solve-a' | 'solve-b' | 'solve-c' | 'stars3-a|b|c' | 'state' |
 * 'perf' | 'stats' | 'day' | 'answer' | 'heart'); __academy.ext('view:sonnenacker-c'), ('sequence:hail').
 */
import * as THREE from 'three';
import { defineZone, type ZoneContext, type ZoneInstance } from '@/core/zones';
import manifest from './manifest';
import { STRINGS } from './strings';
import { createLook } from './look';
import { buildSite } from './site';
import { buildRoof } from './roof';
import { buildField } from './field';
import { buildArms } from './arms';
import { buildRovers } from './rovers';
import { buildDashboard } from './hofladen';
import { buildStationA } from './stationA';
import { buildStationB } from './stationB';
import { buildStationC } from './stationC';
import { buildExtras } from './extras';
import { createSound } from './sound';
import { JUICE, ROOFS, SHIFT, SITE } from './tuning';
import type { Shared } from './shared';

// the suspension hooks are the definition's (ZoneManager calls def.onSuspend / onResume): create() fills them
let suspendHook: (() => void) | null = null;
let resumeHook: (() => void) | null = null;

export default defineZone({
  ...manifest,
  // the farm is 150 m long: its life runs while you are within 50 m of the plot's edge
  activeDistance: 140,

  onSuspend() {
    suspendHook?.();
  },
  onResume() {
    resumeHook?.();
  },

  async create(ctx: ZoneContext): Promise<ZoneInstance> {
    ctx.i18n.register(STRINGS);
    const T = ctx.i18n.text;
    const look = createLook(ctx);
    const ext = new THREE.Group();
    ext.name = 'sonnenacker:site';
    const det = new THREE.Group();
    det.name = 'sonnenacker:life';
    const far = new THREE.Group();
    far.name = 'sonnenacker:far';
    ctx.groups.exterior.add(ext);
    ctx.groups.detail.add(det);
    ctx.groups.far.add(far);

    const site = buildSite(ctx, look, ext, far);
    const y = (x: number, z: number): number => site.plane.at(x, z);
    await ctx.yield();
    const roof = buildRoof(ctx, look, site.plane, ext, far, site.table);
    const field = buildField(ctx, look, site.plane, det);
    await ctx.yield();
    const arms = buildArms(ctx, look, field, site.plane, det);
    const rovers = buildRovers(ctx, look, y, det);
    const emi = ctx.emi.spawn({ unit: 'EMI-08', position: [SITE.emi[0], y(SITE.emi[0], SITE.emi[2]), SITE.emi[2]], yawDeg: 90 });
    const dash = buildDashboard(ctx, site.dashboard, det, emi);
    const sound = createSound(ctx, y);
    ctx.onDispose(() => sound.dispose());

    const S: Shared = {
      ctx,
      look,
      site,
      roof,
      field,
      arms,
      dash,
      emi,
      sound,
      ext,
      det,
      active: null,
      y,
      say: (text, now = false) => void emi.say(text, { interrupt: now }),
      refresh: () => refreshObjective(),
    };
    const A = buildStationA(S);
    const B = buildStationB(S);
    const C = buildStationC(S, () => A.calibrated);
    const X = buildExtras(S);
    await ctx.yield();

    // the dashboard wall: E opens its console
    {
      const w = site.dashboard;
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.3, w.h, w.w), look.mat(0xffffff));
      hit.visible = false;
      hit.position.set(w.x + 0.15, w.y, w.z);
      hit.userData.noMerge = true;
      det.add(hit);
      ctx.addInteractable({ object: hit, label: T('dash.act'), range: 3.2, highlight: false, onInteract: () => !S.active && dash.operate() });
    }

    // ── station labels (DOM: no draw calls) ─────────────────────────────────────────────────
    const labels = [
      ctx.hud.worldLabel([A.target[0], A.target[1] + 1.55, A.target[2]], T('label.a'), { eyebrow: T('label.eyebrowA'), maxDistance: 16 }),
      ctx.hud.worldLabel([B.target[0], B.target[1] + 1.7, B.target[2]], T('label.b'), { eyebrow: T('label.eyebrowB'), maxDistance: 16 }),
      ctx.hud.worldLabel([C.target[0], C.target[1] + 1.75, C.target[2]], T('label.c'), { eyebrow: T('label.eyebrowC'), maxDistance: 18, kind: 'accent' }),
    ];
    ctx.events.on('operate:enter', () => labels.forEach((l) => l.setVisible(false)));
    ctx.events.on('operate:exit', () => labels.forEach((l) => l.setVisible(true)));

    // ── the objective: Entdecker A → B → C; Entscheider C first (A and B are optional there) ──
    const refreshObjective = (): void => {
      if (!ctx.playerInside) return;
      const order: ('a' | 'b' | 'c')[] = ctx.mode === 'entscheider' ? ['c', 'a', 'b'] : ['a', 'b', 'c'];
      const st = { a: A, b: B, c: C };
      const next = C.running ? 'c' : order.find((k) => !st[k].done);
      if (!next) return ctx.hud.setObjective(T('obj.done'));
      const step = next === 'a' ? A.next() : next === 'b' ? B.next() : C.next();
      const key = next === 'c' && step === 'deleaf' && ctx.mode === 'entscheider' ? 'obj.c.start' : `obj.${next}.${step === 'done' ? (next === 'a' ? 'card' : next === 'b' ? 'season' : 'start') : step}`;
      const tg = next === 'c' && step === 'deleaf' ? field.mess.clusters[0][4] : st[next].target;
      ctx.hud.setObjective(T(key), { target: [tg instanceof THREE.Vector3 ? tg.x : tg[0], tg instanceof THREE.Vector3 ? tg.y : tg[1], tg instanceof THREE.Vector3 ? tg.z : tg[2]] });
    };
    ctx.i18n.onChange(() => refreshObjective());

    // ── H: EMI-08 explains the station you are at ─────────────────────────────────────────
    emi.onAsk(() => {
      const p = ctx.player.positionLocal();
      const d = (t: [number, number, number]): number => Math.hypot(p.x - t[0], p.z - t[2]);
      const near = S.active ?? ([['a', d(A.target)], ['b', d(B.target)], ['c', d(C.target)]] as [string, number][]).sort((u, v) => u[1] - v[1]).find((x) => x[1] < 9)?.[0] ?? null;
      S.say(T(near ? `emi.ask.${near}` : 'emi.ask.none'), true);
      void emi.gesture('point');
    });

    // ── life: picks, the shift, the waves, the lesson hook ─────────────────────────────────
    const wv = new THREE.Vector3();
    arms.onPick((a, ok, damaged, at, sample) => {
      sound.pick([at.x, at.y, at.z], ok);
      ctx.toWorld(at, wv);
      ctx.events.emit('sonnenacker:pick', { arm: a.label, ok, damaged, at: [wv.x, wv.y, wv.z], sample });
    });
    arms.onUnload((_a, _n, at) => sound.tock([at.x, at.y, at.z]));
    ctx.events.on('life:react', (e: { kind?: string } | undefined) => {
      if (e?.kind === 'liftoff' || e?.kind === 'wave') arms.wave();
    });
    ctx.events.on('robots:retry', (e: { id?: string; area?: string } | undefined) => {
      if (e?.area !== ctx.id) return;
      if (e.id === 'so101') arms.retry();
      if (e.id === 'lekiwi-base') rovers.retry();
    });
    {
      const best = ctx.pass.snapshot().stamps.find((s) => s.id === 'sonnenacker.erntetag')?.record?.value ?? null;
      ctx.events.emit('sonnenacker:kapsel', { k: null, n: null, lo: null, hi: null, value: best, lesson: { de: 'Vollautomatisch heißt nicht menschenleer.', en: 'Fully automated does not mean nobody.' } });
    }
    // the farm clock (WP15's Hof-Takt has the same 8 minutes) and the shift snapshots for the life director
    let clock = 0;
    let phase = '';
    let emitAcc = 0;
    const armsPayload = arms.list.map((a) => ({ id: a.label, state: a.phase as string, at: [0, 0, 0] as [number, number, number] }));
    const emitShift = (): void => {
      arms.list.forEach((a, i) => {
        armsPayload[i].state = a.jammed ? 'jammed' : a.paused ? 'paused' : a.phase;
        arms.carriageWorld(i, wv);
        armsPayload[i].at[0] = wv.x;
        armsPayload[i].at[1] = wv.y;
        armsPayload[i].at[2] = wv.z;
      });
      ctx.events.emit('sonnenacker:shift', { phase, arms: armsPayload });
    };

    // ── tool hooks ──────────────────────────────────────────────────────────────────────────
    ctx.debug.register('solve-a', () => A.solve());
    ctx.debug.register('solve-b', () => B.solve());
    ctx.debug.register('solve-c', () => C.solve());
    ctx.debug.register('stars3-a', () => A.stars3());
    ctx.debug.register('stars3-b', () => B.stars3());
    ctx.debug.register('stars3-c', () => C.stars3());
    ctx.debug.register('state', () => ({
      a: A.state(),
      b: B.state(),
      c: C.state(),
      dash: dash.shown,
      quest: ctx.quest.snapshot().start.energy,
      roof: { mode: roof.mode, wave: roof.wave, tilt0: roof.tilt(0) },
      arms: arms.stats(),
      rovers: rovers.stats(),
      heart: X.heartFound,
      flight: { state: ctx.flight.state, altitude: ctx.flight.altitude, docked: ctx.flight.docked },
      plane: site.plane,
      suspended,
    }));
    ctx.debug.register('day', () => {
      C.startDay();
      return C.running;
    });
    ctx.debug.register('answer', () => {
      C.answerAll();
      return true;
    });
    ctx.debug.register('heart', () => X.findHeart());
    // the playtest's album pass: the farm's two album entries („Zu fest gegriffen“ from the day, egg 24's heart)
    ctx.debug.register('album', () => {
      ctx.pass.unlockAlbum('zu-fest-gegriffen');
      X.heartAtOnce();
      return true;
    });
    ctx.debug.register('stats', () => {
      const count = (g: THREE.Object3D): { draws: number; tris: number } => {
        let draws = 0,
          tris = 0;
        g.traverseVisible((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const geo = m.geometry as THREE.BufferGeometry;
          const n = geo.index ? geo.index.count : geo.getAttribute('position').count;
          const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
          draws += Array.isArray(m.material) ? m.material.length : 1;
          tris += (n / 3) * inst;
        });
        return { draws, tris: Math.round(tris) };
      };
      return { detail: count(ctx.groups.detail), exterior: count(ctx.groups.exterior), far: count(ctx.groups.far) };
    });
    const perf = { n: 0, sum: 0, max: 0 };
    ctx.debug.register('perf', () => {
      const r = { frames: perf.n, meanMs: +(perf.sum / Math.max(1, perf.n)).toFixed(3), maxMs: +perf.max.toFixed(3) };
      perf.n = perf.sum = perf.max = 0;
      return r;
    });
    type Ext = (name: string, fn: (...a: never[]) => unknown) => (() => void) | undefined;
    const extApi = (window as unknown as { __academy?: { ext?: Ext } }).__academy?.ext;
    const exts: ((() => void) | undefined)[] = [];
    // perf / drawcalls / perf-cpu (plan §5.5 „Sonnenacker C, automated day“): the player at the Tagesplan,
    // looking down the beds while the day runs (the arms pick, the rovers carry, the dashboard counts)
    exts.push(
      extApi?.('view:sonnenacker-c', async () => {
        // at the Tagesplan, looking west along Sonnendach A while the day runs (the Hofladen behind you)
        ctx.player.teleport([-10.2, y(-10.2, 45.6) + 1, 45.6], { yawDeg: -22, pitchDeg: -6 });
        await new Promise<void>((r) => ctx.after(0.6, r));
        // the SO-101 and the LeKiwi load within 60 m: the view counts them, so wait for them (≤ 20 s)
        for (let i = 0; i < 80 && !(arms.stats().ready && rovers.ready); i++) await new Promise<void>((r) => ctx.after(0.25, r));
        if (!C.running) C.startDay({ window: 'midday' });
        await new Promise<void>((r) => ctx.after(3, r));
        return () => C.answerAll();
      }),
    );
    // flash-check (plan §5.10): the hail front over the Tagesmodell and the real modules' Schutzstellung
    exts.push(
      extApi?.('sequence:hail', async () => {
        ctx.player.teleport([SITE.tagesmodell.x - 1.6, y(SITE.tagesmodell.x - 1.6, SITE.tagesmodell.z) + 1, SITE.tagesmodell.z], { yawDeg: -90, pitchDeg: -18 });
        await new Promise<void>((r) => ctx.after(0.8, r));
        return B.hailSequence();
      }),
    );
    ctx.onDispose(() => exts.forEach((off) => off?.()));

    ctx.mergeStatic(ext, { keep: [roof.farMesh] });

    let greeted = ctx.progress.get('greeted', false);
    const cam = new THREE.Vector3();
    const camL = new THREE.Vector3();
    const pl = new THREE.Vector3();
    const zB = (ROOFS.b.z0 + ROOFS.b.z1) / 2;
    let farB: boolean | null = null;
    let suspended = false;
    suspendHook = () => {
      // above h = 1 m (the lift-off, F1): no update; the sounds stop, a running day stands still
      suspended = true;
      sound.chorus(false);
      sound.hail(false);
    };
    resumeHook = () => {
      suspended = false;
    };
    return {
      update(dt) {
        const t0 = performance.now();
        // Sonnendach B's small things (plants, fruit, its six arms) are drawn only within 55 m
        ctx.camera.getWorldPosition(cam);
        ctx.toLocal(cam, camL);
        const fb = Math.hypot(camL.x, camL.z - zB) > 55;
        if (fb !== farB) {
          farB = fb;
          field.setFarB(fb);
          arms.setFarB(fb);
        }
        roof.update(dt);
        field.tick(dt);
        A.update(dt);
        B.update(dt);
        C.update(dt);
        rovers.setSpeed(C.running ? 3 : 1);
        rovers.update(dt);
        arms.update(dt);
        dash.update(dt);
        X.update(dt);
        ctx.player.positionLocal(pl);
        sound.update(dt, pl);
        // the farm clock and its snapshots
        clock = (clock + dt) % SHIFT.loopS;
        const ph = C.running ? 'erntetag' : SHIFT.phases.reduce((p, [name, at]) => (clock >= at ? name : p), SHIFT.phases[0][0]);
        emitAcc += dt;
        if (ph !== phase || emitAcc >= SHIFT.emitS) {
          phase = ph;
          emitAcc = 0;
          emitShift();
        }
        const ms = performance.now() - t0;
        perf.n++;
        perf.sum += ms;
        perf.max = Math.max(perf.max, ms);
      },
      onEnter() {
        refreshObjective();
        if (!greeted) {
          greeted = true;
          void emi.gesture('wave');
          // the zone's request (plan §3.2): the island's need in ≤ 12 words, then the step objectives
          ctx.after(JUICE.requestDelayS, () => {
            if (!ctx.playerInside) {
              greeted = false;
              return;
            }
            ctx.progress.set('greeted', true);
            void emi.say(T('request'));
          });
        }
      },
      onExit() {
        if (!C.running) ctx.hud.setObjective(null);
      },
      dispose() {
        labels.forEach((l) => l.remove());
        suspendHook = resumeHook = null;
      },
    };
  },
});
