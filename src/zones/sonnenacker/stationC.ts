/**
 * Sonnenacker C „Erntetag“ ◆ → AKKU (the Startakku) + T3 (Messen; plan §4.10, §3.3; R8 §2.2–§2.5).
 *   1. deleaf the Messbeet's two rows (E on the old leaf clusters: the human's job);
 *   2. choose the harvest window (morning / midday stripes / evening) at the „Tagesplan“ console;
 *   3. start: the automated day runs on the real beds in ≈ 80 s (12 arms pick, the LeKiwi carry, the
 *      dashboard counts the day's kWh into the Startakku bar); 3–5 calls for help come, some in pairs
 *      (a jammed gripper, a fruit behind a stem, a tray on the rovers' path, the bumblebee box): run
 *      there and press E within 10 s; between calls, E on any arm shows its camera and its next pick.
 * Measured value (SIM · LIVE; energy RICHTWERT): „Ernte 50/60 · 83 % [72–91] · 2 Schäden · Ø 25 s ·
 * 5 Hilferufe · 106 kWh erzeugt, ≤ 10 kWh verbraucht“; the banner shows the research reference beside it.
 * ★ the day completed (≥ 1 full tray) · ★★ Wilson lower bound ≥ 70 % (≥ 49/60) · ★★★ also ≤ 2 damaged
 * fruits and every call answered within 10 s. The ◆ charges the Startakku (the charge beat's farm side:
 * the dashboard bar locks at 100 %). Reduced motion: the day runs without camera moves (it has none).
 */
import * as THREE from 'three';
import type { CompassMarkerHandle, InfoCardSpec, InteractableHandle, WorldLabelHandle } from '@/core/zones';
import { DAY, ENERGY, PICK, SITE, STARS } from './tuning';
import { TOK, box, merge, paint, part } from './look';
import { dayAttempts, dayResult, decide, kwhShare, pickP, preparedChoices, robotWorth, simulateDay, type AttemptOutcome, type DayResult, type HarvestWindow, type Vis } from './model';
import type { Shared } from './shared';
import { button, chipCard, el, row, seg } from './ui';

export interface StationC {
  solve(): boolean;
  stars3(): boolean;
  readonly done: boolean;
  readonly running: boolean;
  state(): unknown;
  update(dt: number): void;
  next(): 'deleaf' | 'start' | 'running' | 'done';
  readonly target: [number, number, number];
  /** start the day now (tools: the view hook) */
  startDay(o?: { window?: HarvestWindow }): void;
  /** answer every open call at once (tools) */
  answerAll(): void;
}

interface CallState {
  k: number;
  /** „Arm n“ for a jam, else 0 */
  arm: number;
  kind: (typeof DAY.calls)[number]['kind'];
  t: number;
  at: THREE.Vector3;
  answeredIn: number | null;
  open: boolean;
  label: WorldLabelHandle | null;
  marker: CompassMarkerHandle | null;
  handle: InteractableHandle | null;
  beam: THREE.Mesh | null;
}

interface Run {
  t: number;
  window: HarvestWindow;
  calibrated: boolean;
  attempts: ReturnType<typeof dayAttempts>;
  /** next attempt to dispatch per Messbeet row (indices into attempts) */
  queue: [number[], number[]];
  outcomes: AttemptOutcome[];
  calls: CallState[];
  jam: [boolean, boolean];
  jamSince: [number, number];
  miscal: [boolean, boolean];
  /** the pick each Messbeet arm is carrying out (decided, not yet reported) */
  inflight: [AttemptOutcome | null, AttemptOutcome | null];
  stem: [boolean, boolean];
  trays: number;
  k: number;
  done: number;
  ended: boolean;
}

interface Saved {
  window: HarvestWindow;
  best: { k: number; damaged: number; inTime: number; calls: number } | null;
}

export function buildStationC(S: Shared, calibrated: () => boolean): StationC {
  const { ctx, look, field, arms } = S;
  const T = ctx.i18n.text;
  const t = ctx.t;
  const st: Saved = { window: 'midday', best: null, ...ctx.progress.get<Partial<Saved>>('c', {}) };
  const persist = (): void => ctx.progress.set('c', st);
  const [px, pz] = [SITE.planer.x, SITE.planer.z];
  const gy = S.y(px, pz);
  const messArms: [number, number] = [field.mess.rows[0], field.mess.rows[1]];

  // ── the „Tagesplan“ lectern (static) and its hit box ───────────────────────────────────────
  S.ext.add(
    part(
      merge([
        paint(box(0.08, 1.05, 0.08, px, gy + 0.5, pz), TOK.timberDark),
        paint(box(0.5, 0.04, 0.42, px, gy + 1.08, pz).rotateZ(-0.35), TOK.timberFresh),
        paint(box(0.44, 0.012, 0.34, px + 0.01, gy + 1.105, pz).rotateZ(-0.35), TOK.carbon),
      ]),
      look.paint,
      'tagesplan',
    ),
  );
  ctx.physics.addStaticBox({ size: [0.5, 1.1, 0.45], position: [px, gy + 0.55, pz], surface: 'wood' });
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.6), look.mat(TOK.white));
  hit.visible = false;
  hit.position.set(px, gy + 0.8, pz);
  hit.userData.noMerge = true;
  S.det.add(hit);

  // ── deleafing: one hit box per old leaf cluster of the Messbeet ────────────────────────────
  const leafHits: InteractableHandle[] = [];
  let deleafed = 0;
  field.mess.clusters.forEach((list, r) =>
    list.forEach((p, c) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.5), look.mat(TOK.white));
      m.visible = false;
      m.position.copy(p);
      m.userData.noMerge = true;
      S.det.add(m);
      const present = (): boolean => field.meshes.leaves.count > 0 && hasLeaf(r as 0 | 1, c);
      leafHits.push(
        ctx.addInteractable({
          object: m,
          label: T('c.deleaf'),
          range: 2.2,
          highlight: false,
          isEnabled: () => !run && present(),
          onInteract: () => {
            if (!field.deleaf(r as 0 | 1, c)) return;
            deleafed++;
            S.sound.leaf([p.x, p.y, p.z]);
            ctx.game.juice.burst([p.x, p.y, p.z], { tone: 'stone', count: 12, spread: 0.35 });
            ctx.game.juice.popup([p.x, p.y + 0.3, p.z], T('c.deleafPop', { n: deleafed, of: leafTotal }), { tone: 'muted', seconds: 1 });
            if (deleafed === leafTotal) S.say(T('emi.c.deleafed'));
            refreshPanel?.();
          },
        }),
      );
    }),
  );
  /** clusters that exist at all (a free stretch has none) */
  const hasLeaf = (r: 0 | 1, c: number): boolean => {
    const m4 = new THREE.Matrix4();
    field.meshes.leaves.getMatrixAt(r * PICK.clustersPerRow + c, m4);
    return m4.elements[0] !== 0;
  };
  let leafTotal = 0;
  for (let r = 0; r < 2; r++) for (let c = 0; c < PICK.clustersPerRow; c++) if (hasLeaf(r as 0 | 1, c)) leafTotal++;

  // ── E on any arm: its camera and its next pick (popup) ─────────────────────────────────────
  arms.hits.forEach((m, i) => {
    ctx.addInteractable({
      object: m,
      label: T('c.armCam'),
      range: 2.4,
      highlight: false,
      onInteract: () => {
        const a = arms.list[i];
        const fi = a.next;
        const f = fi >= 0 ? field.fruit[fi] : null;
        const vis: Vis | null = f && f.sample >= 0 ? visNow(f.sample) : f ? 'free' : null;
        const p = f && vis ? pickP(vis, run?.window ?? st.window, calibrated()) : null;
        const txt = f && vis ? t('c.armNext', { arm: a.label, vis: t(`c.vis.${vis}`), p: ctx.i18n.num(p ?? 0, 2) }) : t('c.armIdle', { arm: a.label });
        const w = arms.carriageWorld(i);
        ctx.game.juice.popup(ctx.toLocal(w).add(new THREE.Vector3(0, 0.6, 0)), txt, { tone: 'teal', seconds: 3.2 });
      },
    });
  });

  // ── the day ─────────────────────────────────────────────────────────────────────────────
  let run: Run | null = null;
  const visNow = (sample: number): Vis => {
    const r = sample >= PICK.perRow ? 1 : 0;
    const j = sample % PICK.perRow;
    if (j === field.mess.stem[r]) return run?.stem[r] ? 'free' : 'hidden';
    return field.mess.vis[r][j];
  };
  const beamGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8);
  ctx.onDispose(() => beamGeo.dispose());
  const callAt = (c: (typeof DAY.calls)[number]): THREE.Vector3 => {
    if (c.kind === 'jam') {
      const w = arms.carriageWorld(c.arm);
      return ctx.toLocal(w);
    }
    if (c.kind === 'stem') {
      const f = field.fruit[field.mess.sample[c.row * PICK.perRow + c.fruit]];
      return new THREE.Vector3(f.x, f.y, f.z);
    }
    if (c.kind === 'bees') {
      const [x, z] = SITE.bees[c.box];
      return new THREE.Vector3(x, S.y(x, z) + 1.0, z);
    }
    return new THREE.Vector3(-9.4, S.y(-9.4, 48.5) + 0.3, 48.5);
  };
  // the crate on the rovers' path (the „tray“ call)
  const crate = new THREE.Mesh(paint(box(0.5, 0.3, 0.38, 0, 0.15, 0), TOK.timberFresh), look.paint);
  crate.name = 'sonnenacker:crate-on-path';
  crate.visible = false;
  S.det.add(crate);

  const openCall = (k: number): void => {
    if (!run) return;
    const def = DAY.calls[k];
    const c: CallState = { k, arm: def.kind === 'jam' ? arms.list[def.arm].label : 0, kind: def.kind, t: run.t, at: callAt(def), answeredIn: null, open: true, label: null, marker: null, handle: null, beam: null };
    run.calls.push(c);
    if (def.kind === 'jam') {
      arms.jam(def.arm, true);
      const r = messArms.indexOf(def.arm);
      if (r >= 0) {
        run.jam[r] = true;
        run.jamSince[r] = run.t;
      }
    }
    if (def.kind === 'tray') {
      crate.position.set(c.at.x, S.y(c.at.x, c.at.z), c.at.z);
      crate.visible = true;
    }
    // an orange beam over the place (the objective's signal colour), a label, a compass marker
    const beam = new THREE.Mesh(beamGeo, look.orange);
    beam.position.set(c.at.x, c.at.y + 1.6, c.at.z);
    beam.name = 'sonnenacker:call-beam';
    S.det.add(beam);
    c.beam = beam;
    const lineKey = `c.call.${def.kind}`;
    const armLabel = c.arm;
    c.label = ctx.hud.worldLabel([c.at.x, c.at.y + 0.9, c.at.z], T(lineKey, { arm: armLabel }), { eyebrow: T('c.callEyebrow'), maxDistance: 60, kind: 'accent' });
    c.marker = ctx.hud.addMarker([c.at.x, c.at.y, c.at.z], T(lineKey, { arm: armLabel }), { kind: 'objective' });
    const hitM = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), look.mat(TOK.white));
    hitM.visible = false;
    hitM.position.copy(c.at);
    hitM.userData.noMerge = true;
    S.det.add(hitM);
    c.handle = ctx.addInteractable({ object: hitM, label: T(`c.answer.${def.kind}`), range: 2.6, highlight: false, onInteract: () => answer(c) });
    S.sound.call([c.at.x, c.at.y, c.at.z]);
    S.say(T(`emi.c.call.${def.kind}`, { arm: armLabel }), true);
    refreshPanel?.();
  };
  const closeCall = (c: CallState): void => {
    c.open = false;
    c.label?.remove();
    c.marker?.remove();
    c.handle?.remove();
    c.beam?.removeFromParent();
    c.label = c.marker = c.handle = null;
    c.beam = null;
  };
  const answer = (c: CallState): void => {
    if (!run || !c.open) return;
    c.answeredIn = run.t - c.t;
    const def = DAY.calls[c.k];
    if (def.kind === 'jam') {
      arms.jam(def.arm, false);
      const r = messArms.indexOf(def.arm);
      if (r >= 0) {
        run.jam[r] = false;
        // a gripper that waited longer than the answer time grips harder afterwards (mis-calibrated)
        if (c.answeredIn > DAY.answerS) run.miscal[r] = true;
      }
    }
    if (def.kind === 'stem') run.stem[def.row] = true;
    if (def.kind === 'tray') crate.visible = false;
    S.sound.answer([c.at.x, c.at.y, c.at.z]);
    ctx.game.juice.burst([c.at.x, c.at.y + 0.3, c.at.z], { tone: 'teal', count: 24, spread: 0.5 });
    ctx.game.juice.popup([c.at.x, c.at.y + 0.6, c.at.z], c.answeredIn <= DAY.answerS ? T('c.inTime', { s: ctx.i18n.num(c.answeredIn, 1) }) : T('c.late', { s: ctx.i18n.num(c.answeredIn, 1) }), { tone: c.answeredIn <= DAY.answerS ? 'good' : 'accent' });
    closeCall(c);
    refreshPanel?.();
  };

  // the HUD readout while the day runs (the player is free to move)
  let hud: ReturnType<typeof ctx.hud.panel> | null = null;
  const startDay = (o: { window?: HarvestWindow } = {}): void => {
    if (run) return;
    if (o.window) st.window = o.window;
    persist();
    const attempts = dayAttempts();
    // a new day: the Messbeet's sample hangs ripe again (your deleafing stays done)
    field.resetSample();
    run = {
      t: 0,
      window: st.window,
      calibrated: calibrated(),
      attempts,
      queue: [attempts.filter((a) => a.row === 0).map((a) => a.i), attempts.filter((a) => a.row === 1).map((a) => a.i)],
      outcomes: [],
      calls: [],
      jam: [false, false],
      jamSince: [0, 0],
      miscal: [false, false],
      inflight: [null, null],
      stem: [false, false],
      trays: 0,
      k: 0,
      done: 0,
      ended: false,
    };
    arms.setMode('day');
    S.say(T(ctx.mode === 'entscheider' ? 'emi.c.startDm' : 'emi.c.start'), true);
    hud = ctx.hud.panel({ eyebrow: T('c.hudEyebrow'), rows: [] });
    ctx.game.juice.cue('go');
    S.refresh();
  };
  const dispatched: Set<number> = new Set();
  const step = (dt: number): void => {
    if (!run || run.ended) return;
    run.t += dt;
    const r = run;
    // calls at their time
    DAY.calls.forEach((c, k) => {
      if (r.t >= c.t && !r.calls.some((x) => x.k === k)) openCall(k);
    });
    // the Messbeet's attempts: each arm takes the next one when it is due, free and not jammed
    for (let ri = 0; ri < 2; ri++) {
      const row = ri as 0 | 1;
      const q = r.queue[row];
      const armId = messArms[row];
      if (!q.length || r.jam[row] || arms.busy(armId)) continue;
      const a = r.attempts[q[0]];
      if (r.t < a.t) continue;
      q.shift();
      const fi = field.mess.sample[a.row * PICK.perRow + a.fruit];
      const out = decide(a, visNow(a.row * PICK.perRow + a.fruit), r.window, r.calibrated, r.miscal[row], r.t);
      dispatched.add(a.i);
      r.inflight[row] = out;
      arms.job(armId, {
        fruit: fi,
        ok: out.ok,
        damaged: out.damaged,
        speed: Math.min(DAY.armSpeedMax, DAY.armSpeed * (1 + DAY.catchUpGain * Math.max(0, r.t - a.t))),
        onResult: (ok) => {
          if (!run || run !== r) return;
          r.inflight[row] = null;
          run.outcomes.push(out);
          run.done++;
          if (ok) run.k++;
          if (out.damaged) {
            const f = field.fruit[fi];
            ctx.game.juice.burst([f.x, f.y, f.z], { tone: 'orange', count: 10, spread: 0.2 });
            S.sound.splat([f.x, f.y, f.z]);
            ctx.game.juice.popup([f.x, f.y + 0.25, f.z], T('c.splat'), { tone: 'bad', seconds: 1.2 });
            if (!solving) ctx.pass.unlockAlbum('zu-fest-gegriffen');
          }
          if (ok && run.k % 12 === 0) run.trays++;
        },
      });
    }
    // the dashboard: the clock, the day's kWh (RICHTWERT), the bar filling with them (presentation)
    const f = Math.min(1, r.t / DAY.seconds);
    const q0 = ctx.quest.snapshot().start.energy.charge;
    S.dash.setDay({ clock: DAY.from + f * (DAY.to - DAY.from), kwh: ENERGY.kwhDay * kwhShare(f), k: r.k, done: r.done, n: PICK.perRow * 2, trays: r.trays, akku: q0 + (1 - q0) * kwhShare(f) });
    hud?.setRows([
      { k: T('c.hudClock'), v: clockText(f) },
      { k: T('c.hudMess'), v: `${r.k}/${r.done}`, tone: 'teal' },
      { k: T('c.hudCalls'), v: `${r.calls.filter((c) => !c.open).length}/${DAY.calls.length}` },
    ]);
    // the open calls count down on their labels
    for (const c of r.calls)
      if (c.open) {
        const left = DAY.answerS - (r.t - c.t);
        c.label?.setEyebrow(T('c.callEyebrowT', { s: Math.max(0, Math.ceil(left)) }));
        // the beam breathes, faster in the last three seconds (reduced motion: steady)
        if (c.beam && !ctx.settings.reducedMotion) {
          const k = 1 + 0.35 * Math.max(0, Math.sin(r.t * (left < 3 ? 14 : 6)));
          c.beam.scale.set(k, 1, k);
        }
      }
    // the end: every attempt done (a jam never answered leaves the rest missed), or overtime
    const allQueued = !r.queue[0].length && !r.queue[1].length;
    const idle = !arms.busy(messArms[0]) && !arms.busy(messArms[1]);
    if ((r.t >= DAY.seconds && allQueued && idle) || r.t >= DAY.seconds + 10) endDay();
  };
  const clockText = (f: number): string => {
    const h = DAY.from + f * (DAY.to - DAY.from);
    return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
  };
  let solving = false;
  const endDay = (): void => {
    if (!run) return;
    const r = run;
    r.ended = true;
    // a pick still in the gripper counts as decided; what never got its turn counts as not harvested
    for (const o of r.inflight) if (o) r.outcomes.push(o);
    r.inflight = [null, null];
    for (const q of r.queue)
      for (const i of q) {
        const a = r.attempts[i];
        r.outcomes.push({ i: a.i, row: a.row, fruit: a.fruit, t: DAY.seconds, p: 0, ok: false, damaged: false, missed: true, cycleS: a.cycleS, vis: 'hidden' });
      }
    for (const c of r.calls) if (c.open) closeCall(c);
    const calls = DAY.calls.map((_, k) => ({ answeredIn: r.calls.find((c) => c.k === k)?.answeredIn ?? null }));
    const res = dayResult(r.outcomes, calls, Math.max(r.trays, Math.floor(r.k / 12)));
    lastOutcomes = r.outcomes.map((o) => [o.i, o.ok ? 1 : 0, o.damaged ? 1 : 0, o.missed ? 1 : 0, o.vis, Math.round(o.t * 10) / 10]);
    run = null;
    hud?.remove();
    hud = null;
    arms.setMode('ambient');
    S.dash.setDay(null);
    ctx.after(DAY.resultDelayS, () => result(res, r.window));
  };
  const starsOf = (res: DayResult): 0 | 1 | 2 | 3 => {
    if (res.trays < 1) return 0;
    const s2 = res.rate[1] >= STARS.c.wilsonLo - 1e-9;
    const s3 = res.damaged <= STARS.c.damagedMax && res.callsInTime === res.calls;
    return (1 + (s2 ? 1 : 0) + (s2 && s3 ? 1 : 0)) as 1 | 2 | 3;
  };
  const value = (lang: 'de' | 'en', res: DayResult): string => {
    const de = lang === 'de';
    const n = (v: number): string => String(Math.round(v));
    const rate = `${n(res.rate[0] * 100)} % [${n(res.rate[1] * 100)}–${n(res.rate[2] * 100)}]`;
    return de
      ? `Ernte ${res.k}/${res.n} · ${rate} · ${res.damaged} ${res.damaged === 1 ? 'Schaden' : 'Schäden'} · Ø ${n(res.cycleMedianS)} s · ${res.calls} Hilferufe · ${res.kwh} kWh erzeugt, ≤ ${res.kwhUsed} kWh verbraucht`
      : `Harvest ${res.k}/${res.n} · ${rate} · ${res.damaged} damaged · Ø ${n(res.cycleMedianS)} s · ${res.calls} calls · ${res.kwh} kWh made, ≤ ${res.kwhUsed} kWh used`;
  };
  let last: DayResult | null = null;
  /** the last live day's attempts [i, ok, damaged, missed, vis, t] (tools/sonnenacker/check.mjs compares them with the model) */
  let lastOutcomes: (number | string)[][] = [];
  const result = (res: DayResult, window: HarvestWindow, quiet = false): void => {
    last = res;
    const stars = starsOf(res);
    st.best = !st.best || res.k > st.best.k ? { k: res.k, damaged: res.damaged, inTime: res.callsInTime, calls: res.calls } : st.best;
    persist();
    if (stars < 1) {
      chal.fail(T('c.failTray'));
      return;
    }
    const first = !ctx.pass.has('erntetag');
    const isNew = ctx.pass.award('erntetag', { value: { de: value('de', res), en: value('en', res) } });
    chal.submit(res.k, { stars, detail: T('c.reference'), quiet });
    // the Tomatenkapsel's lesson hook (WP15): the farm's last measured day
    ctx.events.emit('sonnenacker:kapsel', { k: res.k, n: res.n, lo: res.rate[1], hi: res.rate[2], value: { de: value('de', res), en: value('en', res) }, lesson: { de: 'Vollautomatisch heißt nicht menschenleer.', en: 'Fully automated does not mean nobody.' } });
    if (isNew || first) {
      // the farm side of the charge beat: the bar locks at 100 % (the island plays the toast, T3 and the Libelle)
      S.dash.lock();
      S.refresh();
    }
    if (!quiet) {
      showNeeded(res, window);
      S.say(T('emi.c.result'));
    }
  };

  // „Wo du gebraucht wurdest“ (R8 §2.5): a HUD card after the day, with its chips
  let neededPanel: ReturnType<typeof ctx.hud.panel> | null = null;
  const showNeeded = (res: DayResult, window: HarvestWindow): void => {
    neededPanel?.remove();
    neededPanel = ctx.hud.panel({ eyebrow: T('c.needed.eyebrow') });
    const box2 = neededPanel.el;
    const list = el('div', '', undefined, 'font-size:12.5px;line-height:1.5;color:var(--text-2);margin-top:4px');
    const li = (key: string, chip: 'quelle' | 'sim' | 'illustrativ' | null, src?: string): void => {
      const d = el('div', 'row', '• ' + t(key) + ' ');
      if (chip) d.append(ctx.ui.chip(chip, src ? T(src) : undefined));
      list.append(d);
    };
    li('c.needed.deleaf', 'quelle', 'src.bac2015');
    li('c.needed.bees', 'quelle', 'src.bees');
    li('c.needed.jams', 'sim');
    li('c.needed.hidden', 'quelle', 'src.bac2015');
    li('c.needed.decide', 'illustrativ');
    li('c.needed.seasonal', 'quelle', 'src.destatis');
    box2.append(list);
    void window;
    void res;
    ctx.after(28, () => {
      neededPanel?.remove();
      neededPanel = null;
    });
  };

  // ── the challenge ───────────────────────────────────────────────────────────────────────
  const why = (): InfoCardSpec => ({
    eyebrow: T('c.why.eyebrow'),
    title: T('c.why.title'),
    body: [T('c.why.p1'), T('c.why.p2')],
    metrics: [
      { label: T('c.why.mYou'), value: last ? `${last.k}/${last.n}` : '–', note: T('c.why.nYou') },
      { label: T('c.why.mResearch'), value: `${Math.round(PICK.research.success * 100)} %`, unit: `· ${PICK.research.cycleS} s`, note: T('src.bac2014') },
    ],
  });
  const chal = ctx.game.challenge({
    id: 'erntetag',
    title: T('c.game.title'),
    metric: { label: T('c.game.metric'), unit: '/ 60', better: 'higher', digits: 0 },
    goals: [{ text: T('c.game.g1') }, { text: T('c.game.g2'), at: 49 }, { text: T('c.game.g3') }],
    lesson: T('c.game.lesson'),
    why,
    retry: () => operate(),
    emi: S.emi,
  });

  // ── the console ─────────────────────────────────────────────────────────────────────────
  let refreshPanel: (() => void) | null = null;
  const operate = (): void => {
    if (S.active) return;
    S.active = 'c';
    ctx.player.enterOperate({
      title: T('c.title'),
      cameraPose: { position: [px + 1.6, gy + 2.6, pz + 2.4], lookAt: [-2.4, gy + 0.9, 30] },
      panelPosition: 'right',
      panel: (root, exit) => {
        root.dataset.sa = 'panel-c';
        const head = el('div', '', undefined, 'display:flex;justify-content:space-between;align-items:center;gap:8px');
        const info = button('ⓘ', 'btn ghost', () => void cardC(), 'c-info');
        info.style.cssText += ';padding:2px 8px';
        head.append(el('div', 'eyebrow', t('c.eyebrow')), info);
        root.append(head);
        const goals = chal.chips();
        goals.style.margin = '6px 0 4px';
        root.append(goals);
        const leaves = el('div', 'mono', '', 'font-size:12.5px;color:var(--text-2);margin-top:6px');
        leaves.dataset.chip = 'ui';
        const win = seg((['morning', 'midday', 'evening'] as HarvestWindow[]).map((w) => ({ value: w, label: t(`c.window.${w}`) })), st.window, (w) => {
          st.window = w;
          persist();
          win.set(w);
          ctx.game.juice.cue('tick');
        }, 'c-window');
        win.el.style.marginTop = '6px';
        const go = button(t('c.go'), 'btn primary', () => {
          exit();
          startDay();
        }, 'c-go');
        go.style.marginTop = '8px';
        // (the Startakku bar is on the Hofladen wall: the day fills it there, in view while you help)
        const res = row(ctx, t('c.rLast'), 'sim', T('c.why.nYou'));
        root.append(leaves, win.el, go, res.el);
        const cost = button(t('c.cost'), 'btn ghost', () => void costCard(), 'c-cost');
        cost.style.cssText += ';margin-top:6px;font-size:12px';
        if (ctx.mode === 'entscheider') root.append(cost);
        refreshPanel = () => {
          leaves.textContent = t('c.leaves', { n: deleafed, of: leafTotal });
          go.disabled = !!run;
          go.textContent = run ? t('c.running', { clock: clockText(Math.min(1, run.t / DAY.seconds)) }) : t('c.go');
          res.el.style.display = last || st.best ? 'flex' : 'none';
          const b = last ?? null;
          if (b) res.set(`${b.k}/${b.n} · ${Math.round(b.rate[1] * 100)}–${Math.round(b.rate[2] * 100)} %`);
          else if (st.best) res.set(`${st.best.k}/60`);
        };
        refreshPanel();
        return () => {
          refreshPanel = null;
        };
      },
      onExit: () => {
        S.active = null;
        refreshPanel = null;
        S.refresh();
      },
    });
  };
  ctx.addInteractable({ object: hit, label: T('c.act'), hint: T('c.actHint'), range: 2.6, highlight: false, onInteract: () => operate() });

  const cardC = (): Promise<void> =>
    chipCard(ctx, {
      eyebrow: T('c.card.eyebrow'),
      title: T('c.card.title'),
      paras: [
        { text: T('c.card.p1'), chip: 'quelle', source: T('src.bac2014') },
        { text: T('c.card.p2'), chip: 'quelle', source: T('src.sweeper') },
        { text: T('c.card.p3'), chip: 'quelle', source: T('src.so101') },
      ],
    });
  const costCard = (): Promise<void> =>
    chipCard(ctx, {
      eyebrow: T('c.costCard.eyebrow'),
      title: T('c.costCard.title'),
      paras: [
        { text: T('c.costCard.p1'), chip: 'quelle', source: T('src.hemming') },
        { text: T('c.costCard.p2', { avg: Math.round(robotWorth(33, 0.66) / 1000), sw: Math.round(robotWorth(24, 0.61) / 1000), ah: Math.round(robotWorth(32.46, 0.8667) / 1000) }), chip: 'richtwert', source: T('src.ownCalc') },
        { text: T('c.costCard.p3'), chip: 'quelle', source: T('src.bac2014') },
      ],
    });

  return {
    get done() {
      return ctx.pass.has('erntetag');
    },
    get running() {
      return !!run;
    },
    target: [px, gy, pz],
    next: () => (run ? 'running' : ctx.pass.has('erntetag') ? 'done' : deleafed < leafTotal ? 'deleaf' : 'start'),
    state: () => ({ run: run ? { t: run.t, k: run.k, done: run.done, calls: run.calls.map((c) => ({ kind: c.kind, open: c.open, answeredIn: c.answeredIn })), jam: run.jam } : null, deleafed, leafTotal, window: st.window, best: st.best, last, outcomes: lastOutcomes, dash: S.dash.shown }),
    startDay,
    answerAll() {
      if (!run) return;
      for (const c of run.calls) if (c.open) answer(c);
    },
    solve() {
      // the prepared day, computed at once (the same model as the live day): every leaf, midday, calibrated
      solving = true;
      for (let r = 0; r < 2; r++) for (let c = 0; c < PICK.clustersPerRow; c++) if (field.deleaf(r as 0 | 1, c)) deleafed++;
      const sim = simulateDay(preparedChoices('midday'));
      result(sim.result, 'midday', false);
      solving = false;
      return ctx.pass.has('erntetag');
    },
    stars3() {
      return this.solve() && !!last && starsOf(last) === 3;
    },
    update(dt) {
      step(dt);
      if (run) refreshPanel?.();
    },
  };
}
