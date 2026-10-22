/**
 * Kreislaufhof / Circular Yard (plan §4.11 MUST, §2.8; R8 §3.1; WP14) — a one-station site in the cloud
 * bank's shade, station `sortieren` (its ◆ starts trim rotor T1; trims never gate, D23).
 *
 *   Scene 1 · the sorting line (line.ts): the delta picker's confidence threshold is a live slider while
 *             the belt runs; purity and recovery over 100 pieces, each k/n with Wilson (SIM · LIVE).
 *   Scene 2 · the repair bench (bench.ts): the real SO-101 turns a screwed device's screws out, you sort
 *             its parts; a glued one cannot be opened and goes to the shredder.
 *   ★ both scenes · ★★ a threshold with purity ≥ 90 % and recovery ≥ 70 % · ★★★ that threshold within
 *   ± 0,05 of where the two curves cross (calibrated). Lesson: „Reinheit kostet Ausbeute. Der Schwellwert
 *   ist eine Entscheidung.“ Takeaway (manifest): „Was geschraubt ist, lässt sich reparieren.“
 *
 * EMI-09 (the Revier's EMI, roaming to the site you are at) asks first (§3.2) and says the T1 line when the
 * stamp brings the trim online (the island plays the trim's beat, WP12's beats.ts).
 *
 * Debug hooks (__academy.solve('kreislaufhof', …)): solve-a, stars3-a, state, stats, line, bench;
 * tool hook __academy.ext('view:kreislaufhof') (the drawcalls view: at the console, the belt running).
 */
import * as THREE from 'three';
import { defineZone, type InfoCardSpec, type Text, type ZoneContext, type ZoneInstance } from '@/core/zones';
import manifest from './manifest';
import { STRINGS } from './strings';
import { K } from './tuning';
import { buildHall } from './hall';
import { buildLine } from './line';
import { buildBench } from './bench';
import type { SortResult } from './sim';

interface Saved {
  scene2: boolean;
  /** the best judged run: its stars before the stamp (1 + ★★ + ★★★) and its numbers for the stamp */
  best: { stars: number; th: number; pk: number; pn: number; rk: number; rn: number; purity: number } | null;
}

export default defineZone({
  ...manifest,
  // the entrance, inside the door, looking into the hall (the plot's own spawn stands outside the rect; the
  // floor is up to ≈ 0.8 m above the plot's y 0, so the spawn starts above it and drops onto it)
  spawn: { position: [0, 1.2, 12.5], yawDeg: 0 },

  create(ctx: ZoneContext): ZoneInstance {
    ctx.i18n.register(STRINGS);
    const T = (k: string, p?: Record<string, string | number>): Text => ctx.i18n.text(k, p);
    const saved = ctx.progress.get<Saved>('state', { scene2: false, best: null });
    const persist = (): void => ctx.progress.set('state', saved);

    const hall = buildHall(ctx);
    const F = hall.floor;
    // EMI-09 lives in the detail tier (inside the hall; the region's impostor stands in from afar), kept out of the merge
    const emiTier = new THREE.Group();
    emiTier.name = 'kreislaufhof:emi';
    ctx.groups.detail.add(emiTier);
    const emi = ctx.emi.spawn({ unit: 'EMI-09', position: [K.emi[0], F, K.emi[2]], yawDeg: 0, parent: emiTier });
    const emiSay = (t: Text, now = false): void => void emi.say(t, { interrupt: now });

    // ── the station's challenge (FUN-PLAN §4): stars from the best run, the stamp once both scenes are done ──
    const ch = ctx.game.challenge({
      id: 'sortieren',
      title: T('game.title'),
      metric: { label: T('game.metric'), unit: '%', better: 'higher', digits: 0 },
      goals: [{ text: T('game.g1') }, { text: T('game.g2') }, { text: T('game.g3') }],
      lesson: T('game.lesson'),
      why: () => lineCard(),
      retry: () => line.open(),
    });
    const starsOf = (r: SortResult): number => 1 + (r.star2 ? 1 : 0) + (r.star3 ? 1 : 0);
    const pct = (v: number): string => `${Math.round(v * 100)} %`;
    const award = (): void => {
      const b = saved.best;
      if (!b || !saved.scene2 || ctx.pass.has('sortieren')) return;
      const val = (lang: 'de' | 'en'): string =>
        (STRINGS[lang] as unknown as { stamp: string }).stamp
          .replace('{pk}', String(b.pk))
          .replace('{pn}', String(b.pn))
          .replace('{rk}', String(b.rk))
          .replace('{rn}', String(b.rn))
          .replace('{th}', b.th.toFixed(2).replace('.', lang === 'de' ? ',' : '.'))
          .replace('{a}', '4');
      ctx.pass.award('sortieren', { value: { de: val('de'), en: val('en') }, curve: [b.purity, b.rk / Math.max(1, b.rn)] });
      emiSay(T('emi.done'), true);
    };
    const submitBest = (r?: SortResult): void => {
      const b = saved.best;
      if (!b) return;
      award();
      const th = (r?.th ?? b.th).toFixed(2);
      ch.submit(Math.round((r?.counts.purity ?? b.purity) * 100), { stars: (r ? starsOf(r) : b.stars) as 1 | 2 | 3, detail: T('game.detail', { r: pct(r ? r.counts.recovery : b.rk / Math.max(1, b.rn)), th: ctx.i18n.lang === 'de' ? th.replace('.', ',') : th }) });
    };
    const onRun = (r: SortResult): void => {
      const stars = starsOf(r);
      if (!saved.best || stars > saved.best.stars || (stars === saved.best.stars && r.counts.purity > saved.best.purity))
        saved.best = { stars, th: r.th, pk: r.counts.tp, pn: r.counts.picked, rk: r.counts.tp, rn: r.counts.targets, purity: r.counts.purity };
      persist();
      if (saved.scene2) submitBest(r);
      else {
        // the stamp waits for scene 2; a short note on what the run showed
        if (!r.star2) ch.fail(T(r.counts.purity < 0.9 && r.counts.recovery < 0.7 ? 'game.failBoth' : r.counts.purity < 0.9 ? 'game.failLow' : 'game.failHigh'));
        emiSay(T('emi.sceneTwoFirst'));
      }
      refreshObjective();
    };

    const line = buildLine(ctx, hall, { emiSay, chips: () => ch.chips(), onRun, refreshObjective: () => refreshObjective() });
    const bench = buildBench(ctx, hall, {
      emiSay,
      refreshObjective: () => refreshObjective(),
      onDone: () => {
        saved.scene2 = true;
        persist();
        if (saved.best) submitBest();
        else emiSay(T('emi.sceneOneFirst'), true);
        refreshObjective();
      },
    });
    // a returning player: scene 2 done in an earlier visit (the bench is rebuilt closed; it is not replayed)
    if (saved.scene2) bench.solve();

    // ── cards (E): the line, „Warum Kreislauf?“ by the door, the bench's plaque ──
    const lineCard = (): InfoCardSpec => {
      const b = saved.best;
      const num = (v: number): string => ctx.i18n.num(v, 2);
      return {
        eyebrow: T('card.line.eyebrow'),
        title: T('card.line.title'),
        body: [T('card.line.b1'), T('card.line.b2')],
        chips: [{ type: 'sim', source: T('panel.chipSrc') }],
        metrics: b
          ? [
              { label: T('card.line.mP'), value: `${b.pk}/${b.pn}`, chip: 'sim' },
              { label: T('card.line.mR'), value: `${b.rk}/${b.rn}`, chip: 'sim' },
              { label: T('card.line.mT'), value: num(b.th), chip: 'sim' },
              ...(line.last?.cross != null ? [{ label: T('card.line.mX'), value: num(line.last.cross), chip: 'sim' as const }] : []),
            ]
          : undefined,
        forDecisionMakers: T('card.line.dm'),
      };
    };
    const infoCard = (): InfoCardSpec => ({
      eyebrow: T('card.info.eyebrow'),
      title: T('card.info.title'),
      body: [T('card.info.b1'), T('card.info.b2'), T('card.info.b3')],
      chips: [
        { type: 'quelle', source: T('card.info.srcUn') },
        { type: 'herstellerangabe', source: T('card.info.srcAmp') },
        { type: 'quelle', source: T('card.info.srcEu') },
      ],
    });
    const benchCard = (): InfoCardSpec => {
      const sorted = Object.values(bench.state.sorted).filter(Boolean).length;
      const arm = bench.armInfo();
      return {
        eyebrow: T('card.bench.eyebrow'),
        title: T('card.bench.title'),
        body: [T('card.bench.b1'), T('card.bench.b2'), T('card.bench.b3'), ...(arm ? [arm.attribution] : [])],
        chips: [{ type: 'quelle', source: T('card.bench.srcKit') }],
        metrics: [
          { label: T('card.bench.mA'), value: `${sorted}/4`, chip: 'sim', chipSource: T('card.bench.simNote') },
          { label: T('card.bench.mB'), value: `0/4`, chip: 'sim', chipSource: T('card.bench.simNote') },
        ],
      };
    };
    ctx.addInteractable({ object: line.console, label: T('act.console'), range: 2.6, onInteract: () => line.open() });
    ctx.addInteractable({ object: hall.infoBoard, label: T('act.info'), range: 3, onInteract: () => void ctx.ui.card(infoCard()) });
    ctx.addInteractable({ object: bench.anchors.plaque, label: T('act.benchCard'), range: 2.4, onInteract: () => void ctx.ui.card(benchCard()) });
    // station labels (DOM, no draws)
    ctx.hud.worldLabel([K.line.console.x, F + 2.3, K.line.console.z - 1.2], T('label.line'), { eyebrow: T('label.lineEyebrow'), maxDistance: 16 });
    ctx.hud.worldLabel([K.bench.x, F + 2.3, K.bench.z + 0.4], T('label.bench'), { eyebrow: T('label.benchEyebrow'), maxDistance: 16 });
    ctx.hud.worldLabel([-6.8, F + 2.6, K.hall.d / 2 - 0.4], T('label.info'), { maxDistance: 10, kind: 'muted' });

    // ── the objective (only while you are in the hall) ──
    const refreshObjective = (): void => {
      if (!ctx.playerInside) return;
      const b = bench.state;
      const c = K.line.console,
        bt: [number, number, number] = [K.bench.x, F, K.bench.z + 1];
      if (!saved.best) ctx.hud.setObjective(T('obj.line'), { target: [c.x, F, c.z + 0.8] });
      else if (!b.aOpen && !saved.scene2) ctx.hud.setObjective(T('obj.bench'), { target: bt });
      else if (!saved.scene2 && !Object.values(b.sorted).every(Boolean)) ctx.hud.setObjective(T('obj.sortParts'), { target: bt });
      else if (!saved.scene2) ctx.hud.setObjective(T('obj.shred'), { target: [K.bench.shredder.x, F, K.bench.shredder.z + 1] });
      else if ((saved.best?.stars ?? 0) < 3) ctx.hud.setObjective(T('obj.done'), { target: [c.x, F, c.z + 0.8] });
      else ctx.hud.setObjective(T('obj.all'));
    };
    ctx.i18n.onChange(() => refreshObjective());

    // ── H: EMI-09 explains the station you are at ──
    emi.onAsk(() => {
      const p = ctx.player.positionLocal();
      const dl = Math.hypot(p.x - K.line.console.x, p.z - K.line.console.z),
        db = Math.hypot(p.x - K.bench.x, p.z - K.bench.z);
      emiSay(T(dl < 7 && dl <= db ? 'emi.askLine' : db < 7 ? 'emi.askBench' : 'emi.askNone'), true);
      void emi.gesture('point');
    });

    // ── T1 comes online with the stamp (WP12 plays the island's trim beat); EMI-09 says the line ──
    ctx.events.on('quest:system', (e?: { id?: string; to?: string }) => {
      if (e?.id === 'T1' && e.to === 'an') ctx.after(3.4, () => emiSay(T('t1')));
    });

    // warm work light (rule 7) and the hall's bed: a low hum, the belt when it runs (line.ts)
    for (const at of K.lights) ctx.lights.point([at[0], F + at[1], at[2]], { color: 0xffd9a8, intensity: 14, distance: 22 });
    const hum = ctx.audio.loop('hum', { at: [0, F + 5, -6], volume: 0.35 });
    ctx.onDispose(() => hum.stop());

    // ── hooks: the playtest, the tools ──
    ctx.debug.register('solve-a', () => {
      bench.solve();
      line.solve(false);
      return { stamp: ctx.pass.has('sortieren'), best: saved.best };
    });
    ctx.debug.register('stars3-a', () => {
      bench.solve();
      line.solve(true);
      return { best: saved.best };
    });
    ctx.debug.register('state', () => ({ saved: JSON.parse(JSON.stringify(saved)), line: line.stats(), bench: bench.stats(), flight: { state: ctx.flight.state, altitude: ctx.flight.altitude } }));
    ctx.debug.register('line', () => line.open());
    ctx.debug.register('bench', () => ctx.player.teleport([K.bench.x, F, K.bench.z + 1.6], { yawDeg: 0, pitchDeg: -18 }));
    ctx.debug.register('stats', () => {
      const count = (g: THREE.Object3D): { draws: number; tris: number } => {
        let draws = 0,
          tris = 0;
        g.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          draws += Array.isArray(m.material) ? m.material.length : 1;
          const geo = m.geometry;
          const n = (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
          tris += n * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
        });
        return { draws, tris: Math.round(tris) };
      };
      return { detail: count(ctx.groups.detail), exterior: count(ctx.groups.exterior), far: count(ctx.groups.far) };
    });
    type Ext = (name: string, fn: (...a: never[]) => unknown) => (() => void) | undefined;
    const ext = (window as unknown as { __academy?: { ext?: Ext } }).__academy?.ext;
    const unhook = ext?.('view:kreislaufhof', async () => {
      // the drawcalls view (§5.5): at the console, the belt running with pieces on it
      ctx.player.teleport([K.line.console.x + 0.4, F, K.line.console.z + 2.2], { yawDeg: 12, pitchDeg: -12 });
      await new Promise<void>((r) => ctx.after(0.4, r));
      line.open();
      (document.querySelector('[data-kh="start"]') as HTMLButtonElement | null)?.click();
      await new Promise<void>((r) => ctx.after(6, r));
      return () => line.close();
    });
    ctx.onDispose(() => unhook?.());

    // Z1: the shell in a few draws; moving parts, interactables and bodies stay as they are (the merge skips
    // a hidden subtree, and a tier is hidden while the player is away: show it for the merge)
    const merge = (g: THREE.Group, keep: THREE.Object3D[]): void => {
      const v = g.visible;
      g.visible = true;
      ctx.mergeStatic(g, { keep });
      g.visible = v;
    };
    merge(ctx.groups.exterior, []);
    merge(ctx.groups.detail, [hall.live, line.console, hall.infoBoard, bench.anchors.plaque, emiTier]);

    let greeted = ctx.progress.get('greeted', false);
    return {
      update(dt) {
        line.update(dt);
        bench.update(dt);
      },
      onEnter() {
        refreshObjective();
        if (!greeted) {
          greeted = true;
          ctx.progress.set('greeted', true);
          void emi.gesture('wave');
          // the request (plan §3.2): the island's need in ≤ 12 words
          emiSay(T('request'));
        }
      },
      onExit() {
        ctx.hud.setObjective(null);
      },
    };
  },
});
