/**
 * Zone 02 · REGELN · Regelgarten / Control Garden (GDD §7.2, adapted by DECISIONS.md).
 *
 * „Eine Skulpturengalerie aus Dingen, die nur stehen, weil sie korrigiert werden."
 *   A  Balancieren (Probieren)     — hand-pushed cart-pole: length & gravity change the tipping time √(2L/3g)
 *   B  Regler & Takt ★ (Verstehen) — the 12 m Pendelmast: PD gains, Takt (ZOH), latency, Gehirn-Stapel
 *   C  Lauf, Ente! (Phase 7)       — the real Open Duck Mini v2 in real MuJoCo learns to walk on your reward:
 *                                    64 ducks, a real CEM, hacks that stop a run early, a test track (duck/)
 *
 * Debug hooks (window.__academy.solve('regelgarten', …)): solve-a, solve-b, solve-c, album,
 * stats (draw calls / triangles per tier), a-auto, a-off, speed, gust, b-push, b-takt-10, c-run, c-hand,
 * c-deck, c-engine, c-state, c-bench, c-fk; the flash sequence __academy.ext('sequence:duck-slowmo').
 */
import * as THREE from 'three';
import { defineZone, type EmiHandle, type Text, type ZoneContext, type ZoneInstance } from '@/core/zones';
import manifest from './manifest';
import { STRINGS } from './strings';
import { buildWorld, LAYOUT } from './world';
import { createZoneSound } from './audio';
import { buildGiant } from './giant';
import { buildBalance } from './balance';
import { buildDuckStation } from './duck/station';
import { buildSculptures } from './sculptures';
import { createLook, stationRings } from './look';
import { MID, buildExteriorMid } from './mid';
import type { Shared } from './shared';

export default defineZone({
  ...manifest,

  create(ctx: ZoneContext): ZoneInstance {
    ctx.i18n.register(STRINGS);
    ctx.pass.registerAlbum({
      id: 'sim-to-real-luecke',
      title: ctx.i18n.text('album.title'),
      text: ctx.i18n.text('album.text'),
      hint: ctx.i18n.text('album.hint'),
    });

    const look = createLook(ctx, 'regelgarten');
    const world = buildWorld(ctx, look);
    const sound = createZoneSound(ctx);
    ctx.onDispose(() => sound.dispose());

    // ── EMI-03 ──────────────────────────────────────────────────────────────
    const emi: EmiHandle = ctx.emi.spawn({ unit: 'EMI-03', position: LAYOUT.emi, yawDeg: 0 });
    let winchLoop: { stop(): void } | null = null;

    const S: Shared = {
      ctx,
      sound,
      look,
      stationActive: null,
      speed: 1,
      emiSay: (text: Text, now = false) => void emi.say(text, { interrupt: now }),
      emiDrive: (to) => void emi.driveTo(to),
      refreshObjective: () => refreshObjective(),
      playerNear: (d) => ctx.playerDistance <= d,
      winch: (on, at) => {
        winchLoop?.stop();
        winchLoop = on ? ctx.audio.loop('servo', { at, volume: 0.9, pitch: 0.45 }) : null;
      },
    };

    const giant = buildGiant(S, world);
    const balance = buildBalance(S);
    const duck = buildDuckStation(S);
    const sculptures = buildSculptures(S);

    // ── station labels (DOM, no draw calls) ─────────────────────────────────
    const T = ctx.i18n.text;
    const labels = [
      ctx.hud.worldLabel([8, 3.5, 6.2], T('label.a'), { eyebrow: T('label.eyebrowA'), maxDistance: 16 }),
      ctx.hud.worldLabel([0, 1.9, -0.6], T('label.b'), { eyebrow: T('label.eyebrowB'), maxDistance: 16, kind: 'accent' }),
      ctx.hud.worldLabel([-7.0, 2.65, 4], T('duck.label'), { eyebrow: T('label.eyebrowC'), maxDistance: 16 }),
      ctx.hud.worldLabel([LAYOUT.tower.x + 1.4, 1.7, LAYOUT.tower.z + 1.4], T('label.tower'), { eyebrow: T('label.eyebrowTower'), maxDistance: 11, kind: 'muted' }),
    ];
    // labels would float over the scene in Bedienmodus: hide them while operating
    ctx.events.on('operate:enter', () => labels.forEach((l) => l.setVisible(false)));
    ctx.events.on('operate:exit', () => labels.forEach((l) => l.setVisible(true)));

    // tower info card (stacked brain, guide values)
    const towerBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 16), ctx.materials.accentTeal);
    towerBtn.rotation.x = Math.PI / 2;
    towerBtn.position.set(LAYOUT.tower.x + 0.6, 1.25, LAYOUT.tower.z + LAYOUT.tower.w / 2 + 0.17);
    ctx.groups.detail.add(towerBtn);
    const towerPlate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.06), look.carbon);
    towerPlate.position.set(LAYOUT.tower.x + 0.6, 1.25, LAYOUT.tower.z + LAYOUT.tower.w / 2 + 0.12);
    ctx.groups.detail.add(towerPlate);
    ctx.onDispose(() => {
      towerBtn.geometry.dispose();
      towerPlate.geometry.dispose();
    });
    ctx.addInteractable({
      object: towerBtn,
      label: T('act.tower'),
      range: 2.4,
      onInteract: () =>
        void ctx.ui.card({
          eyebrow: T('card.tower.eyebrow'),
          title: T('card.tower.title'),
          body: [T('card.tower.body'), T('card.tower.lesson')],
          bullets: [T('card.tower.b1'), T('card.tower.b2'), T('card.tower.b3')],
          // guide values (RICHTWERT): one source note under the row, numbers in the player's locale
          metrics: [
            { label: T('tower.planner'), value: `≈ ${ctx.i18n.num(0.2, 1)}–5`, unit: 'Hz' },
            { label: T('tower.skill'), value: '30–200', unit: 'Hz' },
            { label: T('tower.reflex'), value: '≤ 1000', unit: 'Hz', note: T('card.tower.note') },
          ],
        }),
    });

    // ── objective: next unfinished station (mode-aware order) ───────────────
    const refreshObjective = (): void => {
      if (!ctx.playerInside) return;
      const order: ('a' | 'b' | 'c')[] = ctx.mode === 'entscheider' ? ['b', 'c', 'a'] : ['a', 'b', 'c'];
      const ids = { a: 'balancieren', b: 'regler-takt', c: 'lauf-ente' } as const;
      const targets = { a: [5.5, 0, 9.8], b: [0, 0, 0.6], c: [-4.2, 0, 4] } as const;
      const next = order.find((k) => !ctx.pass.has(ids[k]));
      // second step of B once the first half is done (fall seen); C names its own step
      const text = next === 'b' && giant.sawSlowFall ? T('obj.b2') : next === 'c' ? T(`duck.obj.${duck.nextStep() ?? 'c3'}`) : next ? T(`obj.${next}`) : null;
      if (!next) ctx.hud.setObjective(T('obj.done'));
      else ctx.hud.setObjective(text, { target: [...targets[next]] as [number, number, number] });
    };
    ctx.i18n.onChange(() => refreshObjective());

    // ── keys (dispatched to the station that owns operate mode) ─────────────
    ctx.input.onKey(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'KeyG', 'KeyR', 'KeyX', 'Space'], (code) => {
      balance.onKey(code);
      giant.onKey(code);
    }, { whileOperating: true });

    // ── H: EMI explains the station you are at ──────────────────────────────
    const nearest = (): 'a' | 'b' | 'c' | null => {
      const p = ctx.player.positionLocal();
      const d = (x: number, z: number): number => Math.hypot(p.x - x, p.z - z);
      const cand: [('a' | 'b' | 'c'), number][] = [
        ['a', d(7, 9)],
        ['b', d(0, 0.5)],
        ['c', d(-6, 3.4)],
      ];
      cand.sort((x, y) => x[1] - y[1]);
      return cand[0][1] < 7 ? cand[0][0] : null;
    };
    emi.onAsk(() => {
      const k = S.stationActive ?? nearest();
      // help on request: answer now, not after the queue
      S.emiSay(k === 'c' ? T(`duck.emi.ask.${duck.nextStep() ?? 'c3'}`) : T(k ? `emi.ask.${k}` : 'emi.ask.none'), true);
      void emi.gesture('point');
    });

    // ── debug hooks ─────────────────────────────────────────────────────────
    ctx.debug.register('solve-a', () => balance.solve());
    ctx.debug.register('solve-b', () => giant.solve());
    ctx.debug.register('solve-c', () => duck.solve());
    ctx.debug.register('album', () => duck.album());
    // ★★★ results for screenshots and the playtest (FUN-PLAN §4.7)
    ctx.debug.register('stars3-a', () => balance.stars3());
    ctx.debug.register('stars3-b', () => giant.stars3());
    ctx.debug.register('stars3-c', () => duck.stars3());
    // Sensorkapsel (FUN-PLAN R4): on the entrance gyro's plinth; the service step beside it is the way up
    {
      const [gx, , gz] = LAYOUT.gyros[2];
      ctx.game.collectibles.place({ id: 'regelgarten.kapsel', position: [gx - 0.32, 1.36, gz + 0.1], radius: 0.45 });
      ctx.debug.register('tp-kapsel', () => {
        ctx.player.teleport([gx + 2.3, 0, gz], { pitchDeg: -8 });
        ctx.after(0.2, () => {
          const w = ctx.toWorld([gx, 0.9, gz]);
          const e = ctx.player.eye;
          // face the gyro (world yaw from the eye to the plinth)
          ctx.player.teleport([gx + 2.3, 0, gz], { yawDeg: THREE.MathUtils.radToDeg(Math.atan2(-(w.x - e.x), -(w.z - e.z))) - THREE.MathUtils.radToDeg(ctx.layout.facing), pitchDeg: -8 });
        });
      });
    }
    ctx.debug.register('a-auto', () => balance.autopilot(true));
    ctx.debug.register('a-off', () => balance.autopilot(false));
    ctx.debug.register('speed', () => (S.speed = S.speed === 1 ? 8 : 1));
    ctx.debug.register('gust', () => ctx.island.emitGust({ strength: 1, bearing: 330 + 90 }));
    ctx.debug.register('b-push', () => giant.push());
    ctx.debug.register('sound', () => sound.state());
    ctx.debug.register('state', () => ({
      a: balance.state,
      b: { takt: giant.loop.takt, lat: giant.loop.latencyMs, kp: giant.loop.Kp, kd: giant.loop.Kd, fallen: giant.loop.fallen, theta: giant.loop.s[2], findings: giant.findings },
      c: duck.status,
      station: S.stationActive,
    }));
    ctx.debug.register('stats', () => {
      // what draws: the visible parts (the exterior's full and mid sets swap, mid.ts)
      const count = (g: THREE.Object3D): { draws: number; tris: number; shadow: number } => {
        let draws = 0,
          tris = 0,
          shadow = 0;
        g.traverseVisible((o) => {
          const m = o as THREE.Mesh;
          if (!(m.isMesh || (o as THREE.Line).isLine)) return;
          const geo = m.geometry as THREE.BufferGeometry;
          const n = geo.index ? geo.index.count : geo.getAttribute('position').count;
          const inst = (m as unknown as THREE.InstancedMesh).isInstancedMesh ? (m as unknown as THREE.InstancedMesh).count : 1;
          const mats = Array.isArray(m.material) ? m.material.length : 1;
          draws += mats;
          tris += ((m as unknown as THREE.Line).isLine ? 0 : n / 3) * inst;
          if (m.castShadow) shadow++;
        });
        return { draws, tris: Math.round(tris), shadow };
      };
      const vis = (g: THREE.Object3D, f: () => unknown): unknown => {
        const v = g.visible;
        g.visible = true;
        const r = f();
        g.visible = v;
        return r;
      };
      return {
        detail: vis(ctx.groups.detail, () => count(ctx.groups.detail)),
        exterior: vis(ctx.groups.exterior, () => count(ctx.groups.exterior)),
        far: vis(ctx.groups.far, () => count(ctx.groups.far)),
        emi: ((o) => (o ? count(o) : null))(ctx.root.getObjectByName('emi:EMI-03')),
      };
    });

    // station footprints: a teal ring each, T1 while the station is active
    const near = (x: number, z: number, d: number): boolean => {
      const p = ctx.player.positionLocal();
      return Math.hypot(p.x - x, p.z - z) < d;
    };
    const rings = stationRings(ctx, look, [
      { at: [LAYOUT.bahn.ped[0] + 0.6, 0.046, LAYOUT.bahn.ped[2] + 0.4], r: 1.25, active: () => S.stationActive === 'a' || near(LAYOUT.bahn.ped[0] + 0.6, LAYOUT.bahn.ped[2] + 0.4, 2) },
      { at: [0, 0.046, 1.0], r: 1.6, active: () => S.stationActive === 'b' || near(0, 1.0, 2.2) },
      { at: [-3.7, 0.046, 4], r: 1.0, active: () => S.stationActive === 'c' || near(-4.4, 4, 2.2) },
    ]);

    let greeted = ctx.progress.get('greeted', false);
    // CPU probe for the GDD budget (update ≤ 1.5 ms): __academy.solve('regelgarten', 'perf') resets, the
    // debugAction's return value reports the mean/max since the last reset
    const perf = { n: 0, sum: 0, max: 0, duck: 0 };
    ctx.debug.register('perf', () => {
      const r = { frames: perf.n, meanMs: +(perf.sum / Math.max(1, perf.n)).toFixed(3), maxMs: +perf.max.toFixed(3), duckMeanMs: +(perf.duck / Math.max(1, perf.n)).toFixed(3) };
      perf.n = perf.sum = perf.max = perf.duck = 0;
      return r;
    });

    // from afar (≥ MID.on m, the plaza at 108 m) the exterior shows as 9 draws that look the same there (mid.ts;
    // WPF item 7, plan §5.5: ≤ 10 per lobe exterior at the plaza)
    const midT0 = performance.now();
    const exteriorMid = buildExteriorMid(ctx, { cart: giant.mid.cart, cartMid: giant.mid });
    const midBuildMs = Math.round((performance.now() - midT0) * 10) / 10;
    // and while the player is inside the Schauhalle next door: it sees the lobe only through its frosted side
    // wall, so the mid set looks the same there (WP17: the hall's other-areas draws, plan §5.5)
    let inHall = false;
    ctx.events.on('zone:enter', (p?: { id?: string }) => void (p?.id === 'schauhalle' && (inHall = true)));
    ctx.events.on('zone:exit', (p?: { id?: string }) => void (p?.id === 'schauhalle' && (inHall = false)));
    ctx.every(0.25, () => exteriorMid.set(inHall || ctx.playerDistance > (exteriorMid.on ? MID.off : MID.on)));
    ctx.debug.register('mid', () => ({ on: exteriorMid.on, draws: exteriorMid.draws, distance: Math.round(ctx.playerDistance), buildMs: midBuildMs }));

    // Z1: the static exterior (deck, Gehirn-Stapel, plinths, troughs, the duck field's plinth, mural) in
    // few draws; the giant's cart, the duck instances and the pulse spine stay as they are
    // (shadows stay exact: the trough parts must not start casting at low sun)
    ctx.mergeStatic(exteriorMid.full);

    return {
      update(dt, elapsed) {
        const t0 = performance.now();
        world.update(dt, elapsed);
        world.updateTower(dt, ctx.settings.reducedMotion);
        rings.update();
        sculptures.update(dt, elapsed);
        balance.update(dt);
        giant.update(dt);
        exteriorMid.update();
        const t1 = performance.now();
        duck.update(dt);
        const t2 = performance.now();
        perf.n++;
        perf.sum += t2 - t0;
        perf.max = Math.max(perf.max, t2 - t0);
        perf.duck += t2 - t1;
      },
      updateFar(dt) {
        giant.updateFar(dt);
        duck.updateFar(dt);
        exteriorMid.update();
      },
      onEnter() {
        refreshObjective();
        duck.onEnter();
        if (!greeted) {
          greeted = true;
          ctx.progress.set('greeted', true);
          void emi.gesture('wave');
          // the zone's request (plan §3.2): the island's need in ≤ 12 words, then the step objectives
          void emi.say(T('request'));
        }
      },
      onExit() {
        ctx.hud.setObjective(null);
        giant.restoreDefaults();
        duck.onExit();
      },
      dispose() {
        winchLoop?.stop();
        winchLoop = null;
        duck.dispose();
      },
    };
  },
});
