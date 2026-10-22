/**
 * Unkrautacker / Weed Field (plan §4.11 MUST, §2.8; R8 §3.2; WP14) — a one-station site in the sun, station
 * `jaeten` (its ◆ starts trim rotor T4; trims never gate, D23). Sheep graze under vertical PV fences next door
 * (Cat. II; the fences and the flock are the region's, src/world/region).
 *
 *   1. Steer the laser yourself for 20 s over field A: the camera marks the weeds (teal rings: data), you
 *      click to fire, the seedlings beside them must stay (C2 M6). Then the automatic laser's tally.
 *   2. Choose a machine for each field state — A just emerged, B dry and clean, C wet and weedy: the mapping
 *      hoe (no camera, solar), the camera spot sprayer (a micro-dose per weed) or the laser (no poison, much
 *      power). Then all three drive at once, 50 + 50 plants per strip at 4× in ≈ 6 s (parallel lanes, the
 *      watching rule; one unattended stretch, a skip offered), and read weeds left and crop damaged (k/50,
 *      Wilson), energy and area per hour (ILLUSTRATIV), herbicide.
 *   ★ three choices · ★★ no field above 5 % crop loss · ★★★ every field with its best method (sim.ts).
 *   Lesson: „Ohne Gift geht. Jede Methode zahlt anders: Zeit, Energie oder Präzision.“
 *   Takeaway (manifest): „Präzision statt Gift.“
 *
 * Debug hooks (__academy.solve('unkrautacker', …)): solve-a, stars3-a, state, toy, console, stats.
 */
import * as THREE from 'three';
import { css, defineZone, type InfoCardSpec, type Text, type ZoneContext, type ZoneInstance } from '@/core/zones';
import manifest from './manifest';
import { STRINGS } from './strings';
import { U } from './tuning';
import { BEST, COST, FIELDS, METHODS, N, autoLaser, outcome, run as passOf, stars as starsOf, type FieldId, type FieldRun, type MethodId } from './sim';
import { buildStrips, removedState, type Plant } from './field';
import { buildMachines } from './machines';

interface Saved {
  best: { stars: number; runs: FieldRun[] } | null;
  toy: { k: number; n: number; c: number; ak: number; ac: number } | null;
}

export default defineZone({
  ...manifest,
  // behind the field station, looking down the strips (inside the plot; the plot's own spawn stands outside it)
  spawn: { position: [-3, 0.8, 66], yawDeg: 0 },

  create(ctx: ZoneContext): ZoneInstance {
    ctx.i18n.register(STRINGS);
    const T = (k: string, p?: Record<string, string | number>): Text => ctx.i18n.text(k, p);
    const saved = ctx.progress.get<Saved>('state', { best: null, toy: null });
    const persist = (): void => ctx.progress.set('state', saved);
    const gy = (x: number, z: number): number => {
      const w = ctx.toWorld([x, 0, z]);
      return ctx.frames.heightAt(w.x, w.z);
    };
    const M = ctx.materials;
    const ext = ctx.groups.exterior;
    const det = ctx.groups.detail;
    const geos: THREE.BufferGeometry[] = [];
    const G = <T2 extends THREE.BufferGeometry>(g: T2): T2 => (geos.push(g), g);
    ctx.onDispose(() => geos.forEach((g) => g.dispose()));

    // ── the field station: larch posts, a PV roof, the console facing the strips ──
    const sx = U.station.x,
      sz = U.station.z;
    const sy = gy(sx, sz);
    const timber = M.standard({ color: 0x9a9188, roughness: 0.88, metalness: 0 });
    const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0): THREE.Mesh => {
      const m = new THREE.Mesh(G(geo), mat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    for (const [dx, dz] of [
      [-2.2, -1.6],
      [2.2, -1.6],
      [-2.2, 1.6],
      [2.2, 1.6],
    ]) {
      part(ext, new THREE.BoxGeometry(0.16, 2.9, 0.16), timber, sx + dx, sy + 1.45, sz + dz);
      ctx.physics.addStaticBox({ size: [0.16, 2.9, 0.16], position: [sx + dx, sy + 1.45, sz + dz], surface: 'wood' });
    }
    part(ext, new THREE.BoxGeometry(4.9, 0.12, 3.8), M.standard({ color: 0xb9a68a, roughness: 0.85, metalness: 0 }), sx, sy + 2.95, sz);
    const roof = part(ext, new THREE.BoxGeometry(4.7, 0.05, 3.6), M.standard({ color: 0x23262b, roughness: 0.3, metalness: 0.35 }), sx, sy + 3.05, sz);
    roof.rotation.x = 0.12;
    part(det, new THREE.BoxGeometry(0.9, 1.0, 0.5), timber, U.console.x, sy + 0.5, U.console.z + 0.25);
    const consoleTop = part(det, new THREE.BoxGeometry(1.0, 0.06, 0.62), M.standard({ color: 0x302d2b, roughness: 0.6, metalness: 0.15 }), U.console.x, sy + 1.06, U.console.z + 0.25);
    consoleTop.rotation.x = -0.35;
    consoleTop.name = 'unkrautacker:console';
    ctx.physics.addStaticBox({ size: [0.9, 1.0, 0.5], position: [U.console.x, sy + 0.5, U.console.z + 0.25], surface: 'wood' });

    const strips = buildStrips(ctx, gy);
    const machines = buildMachines(ctx, ext, gy);
    for (const id of METHODS) machines[id].place(U.park[id][0], U.park[id][1], 0);
    // EMI-09 lives in the detail tier (the region's landmark stands in from afar), kept out of the merge
    const emiTier = new THREE.Group();
    emiTier.name = 'unkrautacker:emi';
    det.add(emiTier);
    const emi = ctx.emi.spawn({ unit: 'EMI-09', position: [U.emi[0], gy(U.emi[0], U.emi[2]), U.emi[2]], yawDeg: 160, parent: emiTier });
    const emiSay = (t: Text, now = false): void => void emi.say(t, { interrupt: now });

    // labels (DOM): the station, the strips, the machines
    ctx.hud.worldLabel([sx, sy + 3.5, sz], T('label.station'), { eyebrow: T('label.stationEyebrow'), maxDistance: 40 });
    FIELDS.forEach((f) => ctx.hud.worldLabel([strips.stripX(f), gy(strips.stripX(f), U.strips.z1 - 0.6) + 1.2, U.strips.z1 - 0.6], T(`field.${f}`), { maxDistance: 22, kind: 'muted' }));
    for (const id of METHODS) ctx.hud.worldLabel([U.park[id][0], gy(U.park[id][0], U.park[id][1]) + 2.6, U.park[id][1]], T(`method.${id}`), { maxDistance: 18, kind: 'muted' });

    // ── the challenge ──
    const ch = ctx.game.challenge({
      id: 'jaeten',
      title: T('game.title'),
      metric: { label: T('game.metric'), unit: '%', better: 'higher', digits: 0 },
      goals: [{ text: T('game.g1') }, { text: T('game.g2') }, { text: T('game.g3') }],
      lesson: T('game.lesson'),
      why: () => card(),
      retry: () => retryAttempt(),
    });
    const retryAttempt = (): void => {
      if (st.busy) return;
      st.runs = [];
      st.choice = { a: null, b: null, c: null };
      st.step = saved.toy ? 'a' : 'toy';
      st.seed = Math.floor(Math.random() * 1e6);
      for (const f of FIELDS) strips.reset(f);
      if (ui) refreshUi();
      else openConsole();
    };

    // ── the attempt: a machine for each field (one choice each, changeable until they drive), then all three
    // drive at once (§4 watching rule: batch measurements run in parallel lanes; ≤ 8 s at 4×) ──
    type Step = 'toy' | FieldId | 'go' | 'done';
    const st = {
      step: (saved.toy ? 'a' : 'toy') as Step,
      choice: { a: null, b: null, c: null } as Record<FieldId, MethodId | null>,
      runs: [] as FieldRun[],
      busy: false,
      seed: Math.floor(Math.random() * 1e6),
    };
    const choose = (f: FieldId, m: MethodId): void => {
      if (st.busy) return;
      st.choice[f] = m;
      ctx.audio.tone({ freq: 520 + METHODS.indexOf(m) * 90, dur: 0.07, type: 'triangle', volume: 0.06 });
      st.step = FIELDS.find((x) => !st.choice[x]) ?? 'go';
      refreshUi();
    };
    const removedShare = (runs: FieldRun[]): number => Math.round((100 * runs.reduce((a, r) => a + (N - r.left), 0)) / (N * Math.max(1, runs.length)));
    const finish = (): void => {
      const s = starsOf(st.runs);
      if (!s) return;
      if (!saved.best || s > saved.best.stars) saved.best = { stars: s, runs: st.runs.map((r) => ({ ...r })) };
      persist();
      if (!ctx.pass.has('jaeten')) {
        const r = Object.fromEntries(st.runs.map((x) => [x.field, x])) as Record<FieldId, FieldRun>;
        const d = Math.max(...st.runs.map((x) => x.damaged));
        const val = (lang: 'de' | 'en'): string => {
          const tab = STRINGS[lang] as unknown as { stamp: string; method: Record<MethodId, string> };
          return tab.stamp
            .replace('{ma}', tab.method[r.a.method])
            .replace('{la}', String(r.a.left))
            .replace('{mb}', tab.method[r.b.method])
            .replace('{lb}', String(r.b.left))
            .replace('{mc}', tab.method[r.c.method])
            .replace('{lc}', String(r.c.left))
            .replace('{d}', String(d));
        };
        ctx.pass.award('jaeten', { value: { de: val('de'), en: val('en') }, curve: st.runs.map((x) => (N - x.left) / N) });
      }
      ch.submit(removedShare(st.runs), { stars: s, detail: T('game.detail', { d: Math.max(...st.runs.map((x) => x.damaged)) }) });
      st.step = 'done';
      refreshObjective();
    };

    interface Lane {
      field: FieldId;
      method: MethodId;
      res: FieldRun;
      out: ReturnType<typeof outcome>;
      done: Set<Plant>;
      ghost: THREE.Mesh;
    }
    let batch: null | { t: number; lanes: Lane[]; loop: { stop(): void } | null } = null;
    const startBatch = (): void => {
      if (st.busy || st.step !== 'go' || FIELDS.some((f) => !st.choice[f])) return;
      st.busy = true;
      const lanes = FIELDS.map((f, i): Lane => {
        const method = st.choice[f]!;
        const res = passOf(f, method, st.seed + i * 7919);
        strips.reset(f);
        // the fleet drives: a machine of the chosen kind on each strip (the parked ones step out)
        const ghost = machines[method].object.clone();
        ghost.name = `unkrautacker:lane-${f}`;
        ext.add(ghost);
        machines[method].object.visible = false;
        return { field: f, method, res, out: outcome(res, st.seed + 31 + i), done: new Set(), ghost };
      });
      batch = { t: 0, lanes, loop: ctx.audio.loop('servo', { at: [0, sy + 1, (U.strips.z0 + U.strips.z1) / 2], volume: 1, pitch: 0.8 }) };
      ctx.game.unattended(true, 'jaeten');
      ctx.game.juice.cue('go');
      refreshUi();
    };
    const lanePlants = (l: Lane, front: number): void => {
      for (const pl of strips.plants) {
        if (pl.field !== l.field || l.done.has(pl) || pl.z < front) continue;
        l.done.add(pl);
        if (pl.weed && !l.out.weedsLeft.has(pl.index)) {
          strips.setState(pl, removedState(l.method));
          if (l.method === 'laser' && !ctx.settings.reducedMotion && pl.index % 3 === 0) ctx.game.juice.burst([pl.x, pl.y + 0.05, pl.z], { tone: 'orange', count: 3, spread: 0.05 });
        } else if (!pl.weed && l.out.cropsHit.has(pl.index)) strips.setState(pl, 'damaged');
      }
    };
    const stepBatch = (dt: number): void => {
      if (!batch) return;
      const R = U.run;
      const b = batch;
      const before = b.t;
      b.t += dt;
      const zHead = U.strips.z0 + 1.6,
        zEnd = U.strips.z1 - 1.6;
      for (const l of b.lanes) {
        const x = strips.stripX(l.field);
        let z: number, px: number;
        if (b.t < R.approach) {
          const k = smooth(b.t / R.approach);
          const [ox, oz] = U.park[l.method];
          px = ox + (x - ox) * k;
          z = oz + (zHead - oz) * k;
        } else {
          px = x;
          z = zHead + (zEnd - zHead) * Math.min(1, (b.t - R.approach) / R.pass);
          // the working front is ≈ 1 m ahead of the machine's centre
          lanePlants(l, z - 1.0);
          if (l.method === 'hoe' && Math.floor(before * 3) !== Math.floor(b.t * 3)) ctx.game.juice.burst([x, gy(x, z) + 0.2, z - 0.4], { tone: 'stone', count: 5, spread: 0.4 });
        }
        l.ghost.position.set(px, gy(px, z), z);
      }
      if (b.t >= R.approach + R.pass) endBatch();
    };
    const endBatch = (): void => {
      const b = batch;
      if (!b) return;
      batch = null;
      for (const l of b.lanes) {
        lanePlants(l, -Infinity);
        l.ghost.removeFromParent();
        machines[l.method].object.visible = true;
      }
      b.loop?.stop();
      ctx.game.unattended(false, 'jaeten');
      st.runs = b.lanes.map((l) => l.res);
      st.busy = false;
      const wrong = st.runs.find((r) => !r.best);
      ctx.game.juice.cue(wrong ? (st.runs.some((r) => r.damaged / N > 0.05) ? 'bad' : 'good') : 'great');
      finish();
      // EMI-09 names what the most instructive field showed (or the takeaway when all three fit)
      ctx.after(U.juice.verdictDelay, () => emiSay(wrong ? T(`verdict.${wrong.field}.${wrong.method}`) : T('emi.done'), true));
      refreshUi();
    };

    // ── the laser toy: 20 s steering the laser's camera over field A ──
    const toy = { active: false, t: 0, k: 0, c: 0, miss: 0, exit: null as (() => void) | null, el: null as HTMLElement | null };
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd2b0, transparent: true, opacity: 0.95, depthWrite: false });
    ctx.onDispose(() => beamMat.dispose());
    const beam = new THREE.Mesh(G(new THREE.CylinderGeometry(0.008, 0.008, 1, 6)), beamMat);
    beam.visible = false;
    beam.name = 'unkrautacker:beam';
    det.add(beam);
    let beamT = 0;
    const camZ = (): number => U.strips.z0 - 0.4 - (U.toy.speed * toy.t);
    const startToy = (): void => {
      if (toy.active || st.busy) return;
      exitConsole?.();
      strips.reset('a');
      strips.showRings(true);
      Object.assign(toy, { active: true, t: 0, k: 0, c: 0, miss: 0 });
      st.busy = true;
      emiSay(T('emi.console'), true);
      const x = strips.stripX('a');
      const down = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      toy.exit = ctx.player.enterOperate({
        title: T('panel.toy'),
        cameraPose: { position: [x, gy(x, U.strips.z0) + U.toy.height, U.strips.z0 - 0.4], lookAt: [x, gy(x, U.strips.z0), U.strips.z0 - 0.41] },
        panelPosition: 'bottom',
        capture: {
          keys: [],
          camera: (out) => {
            const z = camZ();
            out.position.set(x, strips.topY(x, z) + U.toy.height, z);
            out.quaternion.copy(down);
          },
        },
        onPointer: (e) => {
          if (e.type !== 'down' || e.button !== 0 || !toy.active) return;
          // the ray meets the bed top
          const y0 = strips.topY(x, camZ());
          if (Math.abs(e.direction.y) < 1e-4) return;
          const s = (y0 - e.origin.y) / e.direction.y;
          if (s <= 0) return;
          const hx = e.origin.x + e.direction.x * s,
            hz = e.origin.z + e.direction.z * s;
          fire(hx, y0, hz);
        },
        panel: (root) => {
          root.dataset.uk = 'toy';
          const line = document.createElement('div');
          line.className = 'mono';
          line.style.cssText = 'font-size:14px;color:var(--text);display:flex;gap:14px;align-items:center;flex-wrap:wrap';
          root.append(line);
          toy.el = line;
          paintToy();
          return () => (toy.el = null);
        },
        onExit: () => {
          if (toy.active) endToy();
        },
      });
    };
    const fire = (hx: number, y: number, hz: number): void => {
      const p = strips.nearest('a', hx, hz, U.toy.hitR);
      const camPos = new THREE.Vector3(strips.stripX('a'), y + U.toy.height - 0.35, camZ());
      const at = p ? new THREE.Vector3(p.x, p.y + 0.03, p.z) : new THREE.Vector3(hx, y, hz);
      if (!ctx.settings.reducedMotion) {
        beam.position.copy(camPos).add(at).multiplyScalar(0.5);
        beam.scale.set(1, camPos.distanceTo(at), 1);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), at.clone().sub(camPos).normalize());
        beam.visible = true;
        beamT = U.toy.beamS;
      }
      if (p && p.weed && p.state === 'ok') {
        toy.k++;
        strips.setState(p, 'charred');
        ctx.game.juice.cue('tick', { at: [p.x, p.y, p.z], pitch: 1 + toy.k * 0.02, volume: 0.6 });
        if (!ctx.settings.reducedMotion) ctx.game.juice.burst([p.x, p.y + 0.04, p.z], { tone: 'orange', count: 4, spread: 0.04 });
      } else if (p && !p.weed && p.state === 'ok') {
        toy.c++;
        strips.setState(p, 'damaged');
        ctx.game.juice.cue('oops', { at: [p.x, p.y, p.z] });
        ctx.game.juice.popup([p.x, p.y + 0.3, p.z], T('pop.seedling'), { tone: 'bad', seconds: 1 });
      } else {
        toy.miss++;
        ctx.audio.tone({ freq: 300, dur: 0.06, type: 'triangle', volume: 0.04 });
      }
      paintToy();
    };
    const paintToy = (): void => {
      if (!toy.el) return;
      const left = Math.max(0, Math.ceil(U.toy.seconds - toy.t));
      toy.el.replaceChildren(
        span(ctx.t('panel.toyRun', { n: left })),
        span(`✔ ${toy.k}`, css.teal),
        span(`✖ ${toy.c}`, toy.c ? '#F87171' : undefined),
        span(ctx.t('panel.toyHint'), 'var(--text-2)'),
      );
      // a game counter (time, hits), not a claim
      toy.el.dataset.chip = 'ui';
    };
    const endToy = (): void => {
      if (!toy.active) return;
      toy.active = false;
      strips.showRings(false);
      const auto = autoLaser(N, N, st.seed + 99);
      saved.toy = { k: toy.k, n: N, c: toy.c, ak: auto.hit, ac: auto.cropHit };
      persist();
      st.busy = false;
      if (st.step === 'toy') st.step = FIELDS.find((x) => !st.choice[x]) ?? 'go';
      const exit = toy.exit;
      toy.exit = null;
      exit?.();
      emiSay(T('emi.toyDone'), true);
      ctx.after(0.6, () => openConsole());
    };

    // ── the console ──
    let exitConsole: (() => void) | null = null;
    let ui: HTMLElement | null = null;
    const openConsole = (): void => {
      if (ctx.player.operating || toy.active) return;
      exitConsole = ctx.player.enterOperate({
        title: T('panel.eyebrow'),
        // in front of the canopy (its roof and the console stay behind the camera), looking down the strips
        cameraPose: { position: [U.console.x + 0.4, sy + 2.6, U.console.z - 1.4], lookAt: [0, sy, (U.strips.z0 + U.strips.z1) / 2] },
        panelPosition: 'right',
        panel: (root) => {
          root.dataset.uk = 'panel';
          ui = root;
          refreshUi();
          return () => (ui = null);
        },
        onExit: () => {
          exitConsole = null;
          ui = null;
        },
      });
    };
    const span = (text: string, color?: string, size = 13): HTMLElement => {
      const e = document.createElement('span');
      e.textContent = text;
      e.style.cssText = `font-size:${size}px;${color ? `color:${color};` : ''}`;
      return e;
    };
    const bars = (n: number): string => '▮'.repeat(n) + '▯'.repeat(5 - n);
    let showDetails = false;
    const refreshUi = (): void => {
      if (!ui) return;
      const root = ui;
      const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string, style?: string): HTMLElementTagNameMap[K] => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        if (style) e.style.cssText = style;
        return e;
      };
      const btn = (label: string, fn: () => void, id: string, cls = 'btn', title?: string): HTMLButtonElement => {
        const b = el('button', cls, label);
        b.type = 'button';
        b.dataset.uk = id;
        if (title) b.title = title;
        b.onclick = (e) => {
          e.stopPropagation();
          ctx.audio.play('click');
          fn();
          b.blur();
        };
        return b;
      };
      const head = el('div', '', undefined, 'display:flex;justify-content:space-between;align-items:center;gap:8px');
      head.append(el('div', 'eyebrow', ctx.t('panel.eyebrow')), ctx.ui.chip('sim', T('panel.chipSrc')));
      const goals = ch.chips();
      goals.style.margin = '8px 0 6px';
      const nodes: HTMLElement[] = [head, goals];
      // the attempt at a glance: each field with its choice (a letter is a button: change it until they drive),
      // then ✓ for its best method (≤ 35 words at open: the values sit behind „Werte ▸“)
      const prog = el('div', 'mono', undefined, 'font-size:13px;display:flex;gap:6px;margin-top:2px;flex-wrap:wrap');
      for (const f of FIELDS) {
        const r = st.runs.find((x) => x.field === f);
        const c = st.choice[f];
        const label = `${ctx.t(`field.short.${f}`)}${c ? ` ${ctx.t(`method.${c}`)}` : ''}${r ? (r.best ? ' ✓' : ' ·') : ''}`;
        const b = btn(label, () => {
          if (st.busy || st.step === 'done' || st.step === 'toy') return;
          st.step = f;
          refreshUi();
        }, `f-${f}`, 'btn ghost');
        b.style.cssText += `;padding:3px 9px;font-size:12.5px;color:${r ? (r.best ? css.teal : 'var(--text)') : st.step === f ? css.orange : c ? 'var(--text)' : 'var(--text-3)'}`;
        prog.append(b);
      }
      nodes.push(prog);
      // numbers below are the model's: one section whose header carries the chips
      const sec = el('section', '', undefined, 'margin-top:6px');
      const sh = el('header', '', undefined, 'display:none;gap:6px;margin-bottom:4px');
      sh.append(ctx.ui.chip('sim', T('panel.chipSrc')), ctx.ui.chip('illustrativ', T('panel.illuSrc')));
      sec.append(sh);
      if (st.step === 'done' && st.runs.length) {
        const d = Math.max(...st.runs.map((x) => x.damaged));
        sec.append(el('div', 'row', ctx.t('panel.sum', { p: `${removedShare(st.runs)} %`, d }), 'font-size:14px;color:var(--text)'));
      }
      // the details (collapsed): every pass with its costs, and the laser toy's tally; the rows sit right in the
      // section, under the header that carries their chips
      for (const r of st.runs) {
        const c = COST[r.method];
        const row = el('div', 'row', undefined, `display:${showDetails ? 'grid' : 'none'};grid-template-columns:22px 1fr;gap:2px 8px;font-size:12px;margin-top:6px;color:var(--text-2)`);
        row.append(
          el('span', 'mono', ctx.t(`field.short.${r.field}`), `color:${r.best ? css.teal : 'var(--text)'};font-weight:600`),
          el('span', '', `${ctx.t(`method.${r.method}`)} · ${ctx.t('panel.left')} ${ctx.ui.formatRate(r.left, N).replace(/ · n = \d+$/, '')} · ${ctx.t('panel.damaged')} ${r.damaged}/${N}`, 'color:var(--text)'),
          el('span', ''),
          el('span', 'mono', `${ctx.t('panel.energy')} ${bars(c.energy)} · ${ctx.t('panel.area')} ${bars(c.area)} · ${ctx.t('panel.herb')} ${ctx.t(c.herbicide ? 'panel.herbYes' : 'panel.herbNo')}`, 'font-size:11px'),
        );
        sec.append(row);
      }
      if (saved.toy) {
        const t = saved.toy;
        sec.append(el('div', 'row mono', ctx.t('panel.toyDone', { k: t.k, n: t.n, c: t.c, ak: t.ak, ac: t.ac }), `display:${showDetails ? 'block' : 'none'};font-size:11.5px;color:var(--text-2);margin-top:6px`));
      }
      if (st.runs.length || saved.toy) {
        sh.style.display = showDetails ? 'flex' : 'none';
        nodes.push(sec);
      }
      if (st.step === 'toy') {
        nodes.push(el('div', '', ctx.t('field.a'), 'font-size:15px;color:var(--text);margin-top:8px'), el('div', '', ctx.t('field.ah'), 'font-size:13px;color:var(--text-2)'));
        const b = btn(ctx.t('panel.toy'), startToy, 'toy');
        b.style.marginTop = '10px';
        nodes.push(b);
      } else if (batch) {
        nodes.push(el('div', '', ctx.t('panel.running'), 'font-size:14px;color:var(--text-2);margin-top:10px'), btn(ctx.t('panel.skip'), () => batch && (batch.t = U.run.approach + U.run.pass), 'skip', 'btn ghost'));
      } else if (st.step === 'go') {
        const b = btn(ctx.t('panel.go'), startBatch, 'go');
        b.style.marginTop = '10px';
        nodes.push(b);
      } else if (st.step !== 'done') {
        const f = st.step;
        nodes.push(el('div', '', ctx.t(`field.${f}`), 'font-size:15px;color:var(--text);margin-top:10px'), el('div', '', ctx.t(`field.${f}h`), 'font-size:13px;color:var(--text-2)'));
        const row = el('div', 'op-row', undefined, 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap');
        for (const m of METHODS) {
          const b = btn(ctx.t(`method.${m}`), () => choose(f, m), `m-${m}`, st.choice[f] === m ? 'btn' : 'btn ghost', ctx.t(`method.${m}T`));
          b.disabled = st.busy;
          row.append(b);
        }
        nodes.push(row);
      } else nodes.push(btn(ctx.t('panel.again'), retryAttempt, 'again', 'btn ghost'));
      if (st.runs.length || saved.toy) {
        const tog = btn(`${ctx.t('panel.details')} ${showDetails ? '▾' : '▸'}`, () => {
          showDetails = !showDetails;
          refreshUi();
        }, 'details', 'btn ghost');
        tog.style.cssText += ';margin-top:8px;padding:4px 10px;font-size:12px';
        nodes.push(tog);
      }
      root.replaceChildren(...nodes);
    };
    ctx.i18n.onChange(() => refreshUi());

    // ── cards: the station's, the PV fences' ──
    const card = (): InfoCardSpec => {
      const runs = saved.best?.runs ?? [];
      return {
        eyebrow: T('card.eyebrow'),
        title: T('card.title'),
        body: [T('card.b1'), T('card.b2'), T('card.b3')],
        chips: [
          { type: 'quelle', source: T('card.srcFao') },
          { type: 'herstellerangabe', source: T('card.srcEco') },
          { type: 'illustrativ', source: T('panel.illuSrc') },
        ],
        metrics: runs.length ? runs.map((r) => ({ label: T(`card.m${r.field.toUpperCase()}`), value: `${ctx.i18n.resolve(T(`method.${r.method}`))} · ${r.left}/${N}`, chip: 'sim' as const, chipSource: T('panel.chipSrc') })) : undefined,
        forDecisionMakers: T('card.dm'),
      };
    };
    const pvCard = (): InfoCardSpec => ({ eyebrow: T('pv.eyebrow'), title: T('pv.title'), body: [T('pv.b1'), T('pv.b2')], chips: [{ type: 'quelle', source: T('pv.src') }] });
    ctx.addInteractable({ object: consoleTop, label: T('act.console'), range: 2.6, onInteract: () => openConsole() });
    // a sign by the station about the method card, and one at the pasture's fence about the PV fences
    const sign = part(det, new THREE.BoxGeometry(0.7, 0.45, 0.04), M.standard({ color: 0x302d2b, roughness: 0.6, metalness: 0.15 }), sx + 1.9, sy + 1.25, sz + 1.75);
    sign.name = 'unkrautacker:sign';
    ctx.addInteractable({ object: sign, label: T('act.card'), range: 2.6, onInteract: () => void ctx.ui.card(card()) });
    const pvAt = ctx.toLocal([-268, 0, -222]);
    const pvSign = part(ext, new THREE.BoxGeometry(0.8, 0.5, 0.05), M.standard({ color: 0x302d2b, roughness: 0.6, metalness: 0.15 }), pvAt.x, gy(pvAt.x, pvAt.z) + 1.3, pvAt.z, Math.PI / 2 - 0.72);
    pvSign.name = 'unkrautacker:pv-sign';
    part(ext, new THREE.BoxGeometry(0.08, 1.1, 0.08), timber, pvAt.x, gy(pvAt.x, pvAt.z) + 0.55, pvAt.z);
    ctx.addInteractable({ object: pvSign, label: T('act.pv'), range: 3, onInteract: () => void ctx.ui.card(pvCard()) });
    ctx.hud.worldLabel([pvAt.x, gy(pvAt.x, pvAt.z) + 2, pvAt.z], T('label.pv'), { maxDistance: 14, kind: 'muted' });

    // ── the objective, H, the T4 line ──
    const refreshObjective = (): void => {
      if (!ctx.playerInside) return;
      ctx.hud.setObjective(T(st.step === 'done' && (saved.best?.stars ?? 0) >= 3 ? 'game.lesson' : st.step === 'done' ? 'game.g3' : 'panel.choose'), { target: [U.console.x, sy, U.console.z + 1] });
    };
    emi.onAsk(() => {
      emiSay(T(toy.active ? 'emi.askToy' : 'emi.ask'), true);
      void emi.gesture('point');
    });
    ctx.events.on('quest:system', (e?: { id?: string; to?: string }) => {
      if (e?.id === 'T4' && e.to === 'an') ctx.after(3.4, () => emiSay(T('t4')));
    });

    // ── hooks ──
    const instantAttempt = (pick: (f: FieldId) => MethodId): void => {
      if (!saved.toy) {
        const auto = autoLaser(N, N, st.seed + 99);
        saved.toy = { k: 30, n: N, c: 1, ak: auto.hit, ac: auto.cropHit };
      }
      st.runs = [];
      st.step = 'a';
      for (const f of FIELDS) {
        const res = passOf(f, pick(f), st.seed + FIELDS.indexOf(f) * 7919);
        const out = outcome(res, st.seed + 31);
        strips.reset(f);
        for (const pl of strips.plants) {
          if (pl.field !== f) continue;
          if (pl.weed && !out.weedsLeft.has(pl.index)) strips.setState(pl, removedState(res.method));
          else if (!pl.weed && out.cropsHit.has(pl.index)) strips.setState(pl, 'damaged');
        }
        st.runs.push(res);
      }
      finish();
      refreshUi();
    };
    ctx.debug.register('solve-a', () => {
      instantAttempt(() => 'spray');
      return { stamp: ctx.pass.has('jaeten'), best: saved.best?.stars };
    });
    ctx.debug.register('stars3-a', () => {
      instantAttempt((f) => BEST[f]);
      return { best: saved.best?.stars };
    });
    ctx.debug.register('toy', () => startToy());
    ctx.debug.register('console', () => openConsole());
    ctx.debug.register('state', () => ({ step: st.step, busy: st.busy, runs: st.runs, saved: JSON.parse(JSON.stringify(saved)), toy: { active: toy.active, t: toy.t, k: toy.k, c: toy.c } }));
    ctx.debug.register('stats', () => {
      const count = (g: THREE.Object3D): { draws: number; tris: number } => {
        let draws = 0,
          tris = 0;
        g.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          draws++;
          const geo = m.geometry;
          tris += ((geo.index ? geo.index.count : geo.getAttribute('position').count) / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
        });
        return { draws, tris: Math.round(tris) };
      };
      return { detail: count(det), exterior: count(ext), far: count(ctx.groups.far) };
    });

    // statics in a few draws (the tiers are hidden while the player is away: show them for the merge)
    const merge = (g: THREE.Group, keep: THREE.Object3D[]): void => {
      const v = g.visible;
      g.visible = true;
      ctx.mergeStatic(g, { keep });
      g.visible = v;
    };
    merge(ext, [...METHODS.map((id) => machines[id].object), pvSign]);
    merge(det, [consoleTop, sign, beam, emiTier]);

    let greeted = ctx.progress.get('greeted', false);
    return {
      update(dt) {
        stepBatch(dt);
        strips.update(dt);
        if (toy.active) {
          toy.t += dt;
          if (Math.floor(toy.t * 4) !== Math.floor((toy.t - dt) * 4)) paintToy();
          if (toy.t >= U.toy.seconds) endToy();
        }
        if (beamT > 0) {
          beamT -= dt;
          if (beamT <= 0) beam.visible = false;
        }
      },
      onEnter() {
        refreshObjective();
        if (!greeted) {
          greeted = true;
          ctx.progress.set('greeted', true);
          void emi.gesture('wave');
          emiSay(T('request'));
        }
      },
      onExit() {
        ctx.hud.setObjective(null);
      },
    };
  },
});

const smooth = (k: number): number => {
  const t = Math.min(1, Math.max(0, k));
  return t * t * (3 - 2 * t);
};
