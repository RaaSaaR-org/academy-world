import { C, F, chip, drawBars, drawTraces, hairline, num, rateText, wilson, wrap, type Lang } from './draw';
import { el, hiCanvas } from './dom';
import { FIN_CSS } from './css';
import { CONDS, SEED_POOL, TRIALS, emptyTally, planAudit, runTrial, type AuditTally, type Cond, type TrialResult, type TrialSpec } from './sim';
import { QUESTIONS, S } from './strings';
import { passSnapshot } from '@/core/quest/values';
import type { FinaleEnv } from './types';

/**
 * F2 „Das Angebot" (GDD §6.6): the vendor claims "99 % stabil". The protocol answers the
 * nine questions from the pass, the player predicts the storm rate, then 200 gust trials per
 * controller run in a ~20 s time-lapse on the Messwand while the island shudders (±0.5°).
 * Result: 6 bars with Wilson bands plus the per-condition curves (the "Sturm-Kurve").
 */

interface RunView {
  i: number;
  spec: TrialSpec | null;
  nn: TrialResult | null;
  bestand: TrialResult | null;
  /** 0…1 how much of the current trial's trace is revealed */
  reveal: number;
  tally: AuditTally;
}

const labels = (L: Lang): { cond: Record<Cond, string>; ctrl: { nn: string; bestand: string }; claim: string } => ({
  cond: { ruhig: L === 'de' ? 'ruhig' : 'calm', boeig: L === 'de' ? 'böig' : 'gusty', sturm: L === 'de' ? 'Sturm' : 'storm' },
  ctrl: { nn: 'NN-Lage v2', bestand: L === 'de' ? 'Bestand (PID)' : 'Current (PID)' },
  claim: L === 'de' ? 'Herstellerangabe 99 %' : 'Vendor claim 99 %',
});

/** Draw the Messwand: idle (no run yet), running (scope + growing bars) or the result. */
export function drawMesswand(env: FinaleEnv, run: RunView | null): void {
  const { ctx, room } = env;
  const c = room.messwandCanvas;
  const g = c.getContext('2d')!;
  const W = c.width,
    H = c.height;
  const L = ctx.lang as Lang;
  const lb = labels(L);
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  hairline(g, 0, 0, W, 5);
  g.fillStyle = C.orange;
  g.font = F.mono(24);
  g.fillText(L === 'de' ? '// MESSWAND · STARTPRÜFUNG INSEL 17' : '// MEASUREMENT WALL · FLIGHT CHECK ISLAND 17', 44, 58);
  let cx = W - 44;
  cx -= chip(g, L === 'de' ? 'FIKTION' : 'FICTION', cx, 50, 17, 'fiktion', true) + 12;
  chip(g, 'SIM · LIVE', cx, 50, 17, 'sim', true);
  g.fillStyle = C.text;
  g.font = F.display(50);
  g.fillText(L === 'de' ? 'NN-Lage v2 gegen Bestand' : 'NN-Lage v2 vs. current controller', 44, 132);

  const done = env.state.f2;
  if (!run && !done) {
    g.fillStyle = C.text2;
    g.font = F.sans(28);
    g.fillText(L === 'de' ? '200 Versuche je Regler · ruhig · böig · Sturm · Erfolg: |θ| < 3° über 20 s' : '200 trials per controller · calm · gusty · storm · success: |θ| < 3° for 20 s', 44, 184);
    drawBars(g, 44, 220, W - 88, H - 290, emptyTally(), { lang: L, labels: lb, claim: true, px: 20 });
    g.fillStyle = C.text3;
    g.font = F.mono(20);
    g.fillText(L === 'de' ? 'BEREIT · Start am Anbieter-Terminal' : 'READY · start at the vendor terminal', 44, H - 22);
    room.markMesswand();
    return;
  }
  if (run) {
    const spec = run.spec;
    g.fillStyle = C.text2;
    g.font = F.mono(26);
    const tl = spec ? `${L === 'de' ? 'Versuch' : 'Trial'} ${Math.min(200, run.i + 1)} / 200 · ${lb.cond[spec.cond]}` : '';
    g.fillText(tl, W - 44 - g.measureText(tl).width, 132);
    // scope of the current trial
    const sets: { traces: Float32Array[]; color: string; alpha: number }[] = [];
    const cut = (tr: Float32Array | undefined): Float32Array[] => (tr ? [tr.subarray(0, Math.max(2, Math.round(tr.length * run.reveal)))] : []);
    if (run.bestand) sets.push({ traces: cut(run.bestand.trace), color: C.stone300, alpha: 1 });
    if (run.nn) sets.push({ traces: cut(run.nn.trace), color: C.teal, alpha: 1 });
    g.fillStyle = C.text3;
    g.font = F.mono(18);
    g.fillText(L === 'de' ? 'LAGE |θ| IM AKTUELLEN VERSUCH' : 'TILT |θ| IN THE CURRENT TRIAL', 44, 196);
    drawTraces(g, 30, 206, 640, 400, sets, { px: 18, yMax: 5, lang: L, limitLabel: L === 'de' ? 'Grenze 3°' : 'limit 3°', fullLength: 201 });
    // outcome tags
    let ty = 650;
    for (const [id, res] of [['bestand', run.bestand], ['nn', run.nn]] as const) {
      if (!res || run.reveal < 1) continue;
      g.font = F.mono(20);
      g.fillStyle = id === 'nn' ? C.teal : C.stone300;
      const name = lb.ctrl[id];
      g.fillText(name, 74, ty);
      g.fillStyle = res.ok ? C.success : C.error;
      g.fillText(res.ok ? (L === 'de' ? 'hält' : 'holds') : `${L === 'de' ? 'verliert die Lage bei' : 'loses attitude at'} ${num(res.failT, 1, L)} s`, 74 + g.measureText(name).width + 20, ty);
      ty += 30;
    }
    drawBars(g, 690, 180, W - 730, H - 230, run.tally, { lang: L, labels: lb, claim: true, px: 16, legend: false });
    legendRow(g, 700, 176, 16, lb);
    // progress
    g.fillStyle = C.grid;
    g.fillRect(44, H - 26, W - 88, 6);
    g.fillStyle = C.teal;
    g.fillRect(44, H - 26, ((W - 88) * Math.min(200, run.i + run.reveal)) / 200, 6);
    room.markMesswand();
    return;
  }
  // result
  const t = done!.tally;
  drawBars(g, 30, 170, 820, H - 200, t, { lang: L, labels: lb, claim: true, key: true, prediction: done!.predicted, predictionLabel: L === 'de' ? 'Tipp' : 'tip', px: 20 });
  const k = t.nn.sturm;
  const [p] = wilson(k.k, k.n);
  g.fillStyle = C.text3;
  g.font = F.mono(20);
  g.fillText((L === 'de' ? 'NN-Lage v2 bei Sturm' : 'NN-Lage v2 in a storm').toUpperCase(), 890, 214);
  g.fillStyle = C.orange;
  g.font = F.display(120);
  g.fillText(`${num(p * 100, 0, L)} %`, 884, 330);
  g.fillStyle = C.text;
  g.font = F.mono(26);
  g.fillText(`${rateText(k.k, k.n, L).replace(/^\S+ % /, '')} · n = ${k.n}`, 890, 374);
  g.fillStyle = C.text2;
  g.font = F.sans(24);
  let y = 440;
  y = wrap(g, `${L === 'de' ? 'Dein Tipp' : 'Your prediction'}: ${num(done!.predicted, 0, L)} %`, 890, y, 350, 32);
  y = wrap(g, `${L === 'de' ? 'Herstellerangabe' : 'Vendor claim'}: 99 %`, 890, y, 350, 32);
  const b = t.bestand.sturm;
  wrap(g, `${L === 'de' ? 'Bestand bei Sturm' : 'Current controller, storm'}: ${rateText(b.k, b.n, L)}`, 890, y, 360, 32);
  g.fillStyle = C.text3;
  g.font = F.mono(18);
  g.fillText(`SEED ${done!.seed}`, 890, H - 30);
  room.markMesswand();
}

function legendRow(g: CanvasRenderingContext2D, x: number, y: number, px: number, lb: ReturnType<typeof labels>): void {
  g.save();
  g.font = F.mono(px * 0.85);
  g.textBaseline = 'middle';
  for (const [col, name] of [
    [C.stone300, lb.ctrl.bestand],
    ['rgba(45,212,191,0.78)', lb.ctrl.nn],
  ] as const) {
    g.fillStyle = col;
    g.fillRect(x, y - px * 0.35, px * 0.7, px * 0.7);
    g.fillStyle = C.text2;
    g.fillText(name, x + px, y);
    x += px * 2 + g.measureText(name).width;
  }
  g.restore();
}

// ── protocol + prediction ──────────────────────────────────────────────────

function protocolModal(env: FinaleEnv): Promise<boolean> {
  const { ctx } = env;
  const T = (t: Parameters<typeof ctx.i18n.resolve>[0]): string => ctx.i18n.resolve(t);
  const have = new Set(passSnapshot(ctx).questions);
  let go = false;
  return ctx.hud
    .openModal(
      (root, close) => {
        root.classList.add('fin', 'fin-modal');
        root.append(el('style', null, FIN_CSS));
        root.append(el('div', { class: 'fin-head' }, el('div', { class: 'eyebrow' }, T(S.f2Title)), el('div', { class: 'fin-chips' }, ctx.ui.chip('fiktion', { de: 'Hersteller X und NN-Lage v2 sind erfunden.', en: 'Vendor X and NN-Lage v2 are made up.' }))));
        const sheet = el(
          'div',
          { class: 'fin-sheet' },
          el('div', { class: 'fin-vendor' }, 'HERSTELLER X · NN-LAGE v2'),
          el('div', { class: 'fin-claim' }, '99 %'),
          el('div', { style: 'font-family:var(--font-display);font-weight:600;font-size:20px;color:#292524' }, T(S.vendorClaim).replace(/^99 %\s*/, '')),
          ...S.vendorSheet.map((l) => el('p', null, T(l))),
          el('div', { class: 'fin-star' }, T(S.vendorStar)),
        );
        const list = el('ol', { class: 'fin-protocol' });
        S.protocol.forEach((a, i) => {
          list.append(el('li', null, el('span', { class: 'n' }, String(i + 1).padStart(2, '0')), el('span', null, el('span', { class: 'q' }, ctx.lang === 'de' ? QUESTIONS[i].de : QUESTIONS[i].en), el('span', { class: 'a' }, T(a))), have.has(i + 1) ? el('span', { class: 'have' }, `✓ ${T(S.protocolHave)}`) : el('span')));
        });
        const right = el('div', null, el('h3', null, T(S.protocolTitle)), el('p', { style: 'font-size:12.5px;color:var(--text-3);margin-bottom:8px' }, T(S.protocolHint)), list);
        const box = el('div', { class: 'fin-box' }, el('div', { class: 'fin-k' }, ctx.lang === 'de' ? 'Für Entscheider' : 'For decision makers'), el('p', { style: 'margin:4px 0 0' }, T(S.f2DeciderBox)));
        if (ctx.mode === 'entscheider') box.style.borderColor = 'var(--orange)';
        root.append(el('div', { class: 'fin-grid2', style: 'grid-template-columns: 0.8fr 1.2fr; margin-top: 12px' }, el('div', null, sheet, box), right));
        root.append(
          el(
            'div',
            { class: 'fin-actions' },
            el('button', { class: 'btn ghost', onclick: () => close() }, T(S.close)),
            el(
              'button',
              {
                class: 'btn primary',
                onclick: () => {
                  go = true;
                  close();
                },
              },
              T(S.protocolGo),
            ),
          ),
        );
      },
      { width: 920 },
    )
    .then(() => go);
}

// ── run ────────────────────────────────────────────────────────────────────

export async function startF2(env: FinaleEnv): Promise<void> {
  const { ctx } = env;
  if (env.busy) return;
  env.busy = true;
  try {
    const ok = await protocolModal(env);
    if (!ok) {
      env.busy = false;
      return;
    }
    const predicted = Math.round(await ctx.ui.predict({ question: S.predictQ, unit: '%', min: 0, max: 100, step: 1, initial: 70, digits: 0 }));
    await runTimelapse(env, predicted);
  } catch (err) {
    console.error('[finale] F2 failed', err);
    env.busy = false;
  }
}

function runTimelapse(env: FinaleEnv, predicted: number): Promise<void> {
  const { ctx, room } = env;
  const T = (t: Parameters<typeof ctx.i18n.resolve>[0]): string => ctx.i18n.resolve(t);
  const seed = SEED_POOL[Math.floor(Math.random() * SEED_POOL.length)];
  const specs = planAudit(seed);
  const results: { spec: TrialSpec; nn: TrialResult; bestand: TrialResult }[] = [];
  const view: RunView = { i: 0, spec: null, nn: null, bestand: null, reveal: 0, tally: emptyTally() };
  const firstStorm = TRIALS.ruhig + TRIALS.boeig;
  // pacing: the first trial (and the first storm trial) in slow motion, then a fast time-lapse
  const slow = (i: number): boolean => i === 0 || i === firstStorm;
  const stepTime = (i: number): number => (slow(i) ? 2.4 : i < 6 ? 0.35 : 0.075);
  let t = 0;
  let active = true;
  const loop = ctx.audio.loop('data', { at: room.messwand, volume: 0.55 });
  const pose = room.poses.f2;
  const prog = el('div', { class: 'progress', style: 'height:6px;border-radius:3px;background:var(--elevated);overflow:hidden;margin:10px 0' }, el('i', { style: 'display:block;height:100%;width:0;background:var(--teal)' }));
  const trialEl = el('div', { class: 'fin-v' });
  const tallyEl = el('div', { class: 'fin-mono', style: 'line-height:1.7;margin-top:6px' });
  const actions = el('div', { class: 'fin-actions' });
  let exit: (() => void) | null = null;
  let finished = false;

  return new Promise((resolve) => {
    const finish = (): void => {
      if (!active) return;
      active = false;
      loop.stop();
      ctx.island.setTilt(0, 0);
      env.busy = false;
      env.refreshObjective();
      resolve();
    };
    exit = ctx.player.enterOperate({
      title: S.f2RunTitle,
      cameraPose: { position: pose.position.toArray() as [number, number, number], lookAt: pose.lookAt.toArray() as [number, number, number] },
      panelPosition: 'right',
      panel: (root) => {
        root.classList.add('fin');
        root.style.width = 'min(330px, calc(100vw - 48px))';
        root.append(el('style', null, FIN_CSS));
        root.append(el('div', { class: 'fin-head' }, el('div', { class: 'eyebrow' }, T(S.f2RunTitle)), el('div', { class: 'fin-chips' }, ctx.ui.chip('sim', { de: 'Spielzeugmodell, im Spiel gerechnet', en: 'Toy model, computed in-game' }))));
        root.append(el('p', { style: 'margin-top:8px;font-size:13px' }, T({ de: 'Beide Regler, dieselben 200 Böen-Folgen. Jeder Versuch: 20 s Simulation bei 200 Hz.', en: 'Both controllers, the same 200 gust sequences. Each trial: a 20 s simulation at 200 Hz.' })));
        root.append(trialEl, prog, tallyEl, actions);
      },
      onExit: () => {
        // leaving early aborts the run: no result, the wall goes back to its idle state
        finish();
        if (!finished) drawMesswand(env, null);
      },
    });
    void env.say([S.f2EmiStart], 4.5, { interrupt: true });

    env.tick((dtRaw) => {
      if (!active) return false;
      if (finished) return false;
      const dt = Math.min(0.05, dtRaw);
      t += dt;
      const i = view.i;
      if (i >= specs.length) return false;
      if (!view.spec || view.spec !== specs[i]) {
        const spec = specs[i];
        view.spec = spec;
        view.nn = runTrial('nn', spec.gusts, spec.seed, true);
        view.bestand = runTrial('bestand', spec.gusts, spec.seed, true);
        view.reveal = 0;
        t = 0;
        if (i === firstStorm) void env.say([S.f2EmiStorm], 3.5, { interrupt: true });
      }
      const st = stepTime(i);
      view.reveal = Math.min(1, t / (st * 0.85));
      // the island shudders with the vendor controller's current tilt (±0.5°)
      const tr = view.nn!.trace;
      const idx = Math.min(tr.length - 1, Math.floor(view.reveal * (tr.length - 1)));
      const a = Math.min(0.5, tr[idx] * 0.16);
      const ang = t * 7 + i;
      ctx.island.setTilt(Math.sin(ang) * a, Math.cos(ang * 0.8) * a);
      if (t >= st) {
        // trial done → tally
        const spec = view.spec!;
        results.push({ spec, nn: view.nn!, bestand: view.bestand! });
        for (const [id, r] of [['nn', view.nn!], ['bestand', view.bestand!]] as const) {
          view.tally[id][spec.cond].n++;
          if (r.ok) view.tally[id][spec.cond].k++;
        }
        ctx.audio.beep(view.nn!.ok ? 1320 : 520, 0.03, { volume: 0.12 });
        if (!view.nn!.ok && spec.cond === 'sturm') ctx.player.shake(0.02, 0.1);
        view.i++;
        if (view.i >= specs.length) {
          finished = true;
          complete();
          return false;
        }
      }
      // panel
      const lang = ctx.lang as Lang;
      const lb = labels(lang);
      const cur = specs[Math.min(view.i, specs.length - 1)];
      trialEl.textContent = `${T(S.f2Trial)} ${Math.min(200, view.i + 1)} / 200 · ${lb.cond[cur.cond]}`;
      (prog.firstChild as HTMLElement).style.width = `${(view.i / 200) * 100}%`;
      tallyEl.replaceChildren(
        ...CONDS.map((c) => el('div', null, `${lb.cond[c].padEnd(6, ' ')}  NN ${view.tally.nn[c].k}/${view.tally.nn[c].n} · ${lang === 'de' ? 'Bestand' : 'Current'} ${view.tally.bestand[c].k}/${view.tally.bestand[c].n}`)),
      );
      drawMesswand(env, view);
      return true;
    });

    const complete = (): void => {
      const tally = view.tally;
      // the panel shows the final tally (200 / 200), not the one before the last trial
      const lang0 = ctx.lang as Lang;
      const lb0 = labels(lang0);
      trialEl.textContent = `${T(S.f2Trial)} 200 / 200 · ${lb0.cond.sturm}`;
      (prog.firstChild as HTMLElement).style.width = '100%';
      tallyEl.replaceChildren(
        ...CONDS.map((c) => el('div', null, `${lb0.cond[c].padEnd(6, ' ')}  NN ${tally.nn[c].k}/${tally.nn[c].n} · ${lang0 === 'de' ? 'Bestand' : 'Current'} ${tally.bestand[c].k}/${tally.bestand[c].n}`)),
      );
      env.audit = { seed, results };
      const k = tally.nn.sturm;
      const measured = Math.round((k.k / Math.max(1, k.n)) * 100);
      env.state.f2 = { seed, tally, predicted, sturmSeen: false };
      env.save();
      try {
        ctx.pass.recordPrediction('jahrespruefung', predicted, measured, { min: 0, max: 100, scale: 'linear' });
      } catch {
        /* pass API unavailable */
      }
      ctx.island.setTilt(0, 0);
      drawMesswand(env, null);
      ctx.audio.play('success', { volume: 0.6 });
      void env.say([S.f2Emi(measured), S.f2EmiNext], 5, { interrupt: true });
      actions.replaceChildren(
        el(
          'button',
          {
            class: 'btn primary',
            onclick: () => {
              exit?.();
              void openResults(env);
            },
          },
          T(S.results),
        ),
      );
    };
  });
}

// ── results modal (bars + per-condition curves) ────────────────────────────

/**
 * W8 (PERF-09): the 400 trials of a saved seed (after a reload, or for the debug solve), computed a few
 * ms per frame instead of in one block (37 ms at 1×, ≈ 220 ms at 6× CPU). Resolves when `env.audit`
 * holds them; one job per seed.
 */
export function auditInSlices(env: FinaleEnv, seed: number, budgetMs = 3): Promise<void> {
  if (env.audit && env.audit.seed === seed) return Promise.resolve();
  if (env.auditJob && env.auditJob.seed === seed) return env.auditJob.done;
  const specs = planAudit(seed);
  const results: { spec: TrialSpec; nn: TrialResult; bestand: TrialResult }[] = [];
  let i = 0;
  const done = new Promise<void>((resolve) => {
    env.tick(() => {
      if (env.auditJob?.seed !== seed) {
        resolve();
        return false;
      }
      const t0 = performance.now();
      do {
        const spec = specs[i++];
        results.push({ spec, nn: runTrial('nn', spec.gusts, spec.seed, true), bestand: runTrial('bestand', spec.gusts, spec.seed, true) });
      } while (i < specs.length && performance.now() - t0 < budgetMs);
      if (i < specs.length) return true;
      env.audit = { seed, results };
      env.auditJob = null;
      resolve();
      return false;
    });
  });
  env.auditJob = { seed, done };
  return done;
}

/** Success counts of a finished audit (the same numbers runAudit() reports). */
export function tallyOf(results: { spec: TrialSpec; nn: TrialResult; bestand: TrialResult }[]): AuditTally {
  const tally = emptyTally();
  for (const r of results)
    for (const [id, res] of [['nn', r.nn], ['bestand', r.bestand]] as const) {
      tally[id][r.spec.cond].n++;
      if (res.ok) tally[id][r.spec.cond].k++;
    }
  return tally;
}

export function openResults(env: FinaleEnv, startTab: Cond = 'ruhig'): Promise<void> {
  const { ctx } = env;
  const f2 = env.state.f2;
  if (!f2) return Promise.resolve();
  // the curves need the trials: computed in slices while the modal is already open (W8)
  const ready = (): boolean => !!env.audit && env.audit.seed === f2.seed;
  let open = true;
  const T = (t: Parameters<typeof ctx.i18n.resolve>[0]): string => ctx.i18n.resolve(t);
  const L = ctx.lang as Lang;
  const lb = labels(L);
  let tab: Cond = startTab;
  return ctx.hud.openModal(
    (root, close) => {
      root.classList.add('fin', 'fin-modal');
      root.append(el('style', null, FIN_CSS));
      root.append(
        el(
          'div',
          { class: 'fin-head' },
          el('div', { class: 'eyebrow' }, T(S.f2Title)),
          el('div', { class: 'fin-chips' }, ctx.ui.chip('sim', { de: 'Spielzeugmodell, im Spiel gerechnet', en: 'Toy model, computed in-game' }), ctx.ui.chip('fiktion', { de: 'NN-Lage v2 und Hersteller X sind erfunden.', en: 'NN-Lage v2 and Vendor X are made up.' })),
        ),
      );
      const k = f2.tally.nn.sturm;
      root.append(el('h2', null, T(S.resTitle)));
      root.append(
        el(
          'div',
          { class: 'fin-row', style: 'align-items:baseline;gap:18px' },
          el('div', { class: 'fin-big', style: 'color:var(--orange);font-size:40px' }, `${num((k.k / k.n) * 100, 0, L)} %`),
          el('div', null, el('div', { class: 'fin-k' }, T(S.resKey)), el('div', { class: 'fin-v' }, `${rateText(k.k, k.n, L)} · n = ${k.n}`)),
          el('div', null, el('div', { class: 'fin-k' }, T(S.resYourTip)), el('div', { class: 'fin-v' }, `${num(f2.predicted, 0, L)} % → ${T(S.resMeasured)} ${num((k.k / k.n) * 100, 0, L)} %`)),
        ),
      );
      const bars = hiCanvas(840, 250);
      drawBars(bars.prep(), 0, 0, 840, 250, f2.tally, { lang: L, labels: lb, claim: true, key: true, prediction: f2.predicted, predictionLabel: T(S.resYourTip), px: 13 });
      root.append(el('div', { style: 'margin:10px 0 4px' }, bars.canvas));
      // curves
      const tabs = el('div', { class: 'fin-tabs' });
      const left = hiCanvas(410, 168),
        right = hiCanvas(410, 168);
      const capL = el('div', { class: 'fin-k', style: 'margin-bottom:4px' });
      const capR = el('div', { class: 'fin-k', style: 'margin-bottom:4px' });
      const renderCurves = (): void => {
        tabs.replaceChildren(
          ...CONDS.map((c) =>
            el(
              'button',
              {
                class: c === tab ? 'on' : '',
                onclick: () => {
                  tab = c;
                  ctx.audio.play('click');
                  renderCurves();
                },
              },
              lb.cond[c],
            ),
          ),
        );
        const tb = f2.tally.bestand[tab],
          tn = f2.tally.nn[tab];
        capL.textContent = `${lb.ctrl.bestand} · ${rateText(tb.k, tb.n, L)} · n = ${tb.n}`;
        capR.textContent = `${lb.ctrl.nn} · ${rateText(tn.k, tn.n, L)} · n = ${tn.n}`;
        if (!ready()) {
          for (const cv of [left, right]) {
            const g = cv.prep();
            g.fillStyle = C.text3;
            g.font = F.mono(12);
            g.fillText(L === 'de' ? 'Kurven werden gerechnet …' : 'Computing the curves …', 12, 90);
          }
          return;
        }
        const res = env.audit!.results.filter((r) => r.spec.cond === tab);
        drawTraces(left.prep(), 0, 0, 410, 168, [{ traces: res.map((r) => r.bestand.trace), color: C.stone300, alpha: 0.28 }], { px: 12, yMax: 6, lang: L, limitLabel: L === 'de' ? 'Grenze 3°' : 'limit 3°' });
        drawTraces(right.prep(), 0, 0, 410, 168, [{ traces: res.map((r) => r.nn.trace), color: C.teal, alpha: 0.3 }], { px: 12, yMax: 6, lang: L, limitLabel: L === 'de' ? 'Grenze 3°' : 'limit 3°' });
        if (tab === 'sturm' && env.state.f2 && !env.state.f2.sturmSeen) {
          env.state.f2.sturmSeen = true;
          env.save();
        }
      };
      root.append(el('div', { class: 'fin-row', style: 'justify-content:space-between;margin-top:8px' }, el('div', { class: 'fin-label', style: 'margin:0' }, T(S.resCurves)), tabs));
      root.append(el('div', { class: 'fin-grid2', style: 'margin-top:8px;gap:20px' }, el('div', null, capL, left.canvas), el('div', null, capR, right.canvas)));
      renderCurves();
      if (!ready()) void auditInSlices(env, f2.seed).then(() => open && renderCurves());
      root.append(el('p', { style: 'margin-top:12px' }, T(S.resHint)));
      root.append(el('p', { class: 'fin-mono', style: 'color:var(--text-3);font-size:11px' }, T(S.resFiction)));
      root.append(el('div', { class: 'fin-actions' }, el('button', { class: 'btn primary', onclick: () => close() }, T(S.close))));
      return () => {
        open = false;
      };
    },
    { width: 900 },
  );
}
