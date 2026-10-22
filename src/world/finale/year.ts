import type { Text } from '@/core/zones';
import { el } from './dom';
import { C, F, chip, hairline, roundRect, wrap } from './draw';
import { drawMesswand } from './f2';
import { FIN_CSS } from './css';
import { planAudit, runTrial, type AuditTally, type Cond } from './sim';
import { S } from './strings';
import type { FinaleEnv, Recommendation } from './types';

/**
 * „Erstflug-Protokoll“ (Phase 7 plan §4.14, D24; rc4 „Ein Jahr später", docs/FUN-PLAN.md §5 C8): a
 * button on the certificate opens it; a 10 s year plays out on the player's OWN F2 rates (math and
 * labels as rc4, only the title is new). The weather year is invented (FIKTION): 365 days = 250 ruhig · 85 böig ·
 * 30 Sturm, one trial = one day (toy model). For every recommendation the expected days with loss
 * of control = Σ days × (1 − rate) with the controller it uses:
 *   Pilot: NN everywhere · Pilot mit Auflage: NN when calm, Bestand in gusts and storms ·
 *   Kein Pilot: Bestand everywhere.
 * „Ruhiger Flug" (mean max. tilt of the calm trials of the controller used when calm) is shown ONLY
 * when NN's calm mean is lower than Bestand's in the toy model: never an invented upside.
 * No verdict and no stars: every recommendation is accepted; the numbers speak.
 * Phase 5 played it on the Messwand in the Kielraum; Phase 7 opens it from the certificate (on the
 * Ausguck), so it plays in a modal on the same 1280 × 720 drawing; Esc / „Schließen" ends it.
 */

const DAYS: Record<Cond, number> = { ruhig: 250, boeig: 85, sturm: 30 };
const WEATHER: Record<Cond, string> = { ruhig: '#33302d', boeig: '#5c5752', sturm: '#a8a29e' };
const PLAY_S = 10;
const RECS: Recommendation[] = ['pilot', 'pilotCond', 'none'];

const Y = {
  eyebrow: { de: '// ERSTFLUG-PROTOKOLL · EIN JAHR SPÄTER', en: '// FIRST-FLIGHT LOG · ONE YEAR LATER' },
  title: { de: 'Erstflug-Protokoll', en: 'First-flight log' },
  note: { de: 'Wetterjahr erfunden · ein Versuch = ein Tag (Spielzeugmodell)', en: 'Weather year invented · one trial = one day (toy model)' },
  day: { de: 'Tag', en: 'Day' },
  ruhig: { de: 'ruhig', en: 'calm' },
  boeig: { de: 'böig', en: 'gusty' },
  sturm: { de: 'Sturm', en: 'storm' },
  loss: { de: 'Tage mit Kontrollverlust', en: 'Days with loss of control' },
  calm: { de: 'Ruhiger Flug · Ø max. Lage an ruhigen Tagen', en: 'Smooth flight · mean max. tilt on calm days' },
  yours: { de: 'Deine Empfehlung', en: 'Your recommendation' },
  ctrl: {
    pilot: { de: 'NN-Lage v2 an allen Tagen', en: 'NN-Lage v2 on every day' },
    pilotCond: { de: 'NN bei Ruhe · Bestand bei Böen und Sturm', en: 'NN when calm · current controller in gusts and storms' },
    none: { de: 'Bestand an allen Tagen', en: 'Current controller on every day' },
  } as Record<Recommendation, Text>,
  rates: { de: 'Raten aus deiner Messung (F2, n = 200 je Regler)', en: 'Rates from your measurement (F2, n = 200 per controller)' },
  foot: { de: 'Keine Wertung: Jede Empfehlung wird angenommen. Die Zahlen sprechen.', en: 'No verdict: every recommendation is accepted. The numbers speak.' },
  skip: { de: 'Überspringen', en: 'Skip' },
  next: { de: 'Weiter', en: 'Continue' },
  close: { de: 'Schließen', en: 'Close' },
};

const recName = (r: Recommendation): Text => (r === 'pilot' ? S.f3Pilot : r === 'pilotCond' ? S.f3PilotCond : S.f3NoPilot);
const rate = (t: AuditTally, c: 'nn' | 'bestand', w: Cond): number => t[c][w].k / Math.max(1, t[c][w].n);
const ctrlFor = (r: Recommendation, w: Cond): 'nn' | 'bestand' => (r === 'pilot' ? 'nn' : r === 'none' ? 'bestand' : w === 'ruhig' ? 'nn' : 'bestand');

/** expected loss-of-control days per weather and in total for one recommendation */
export function yearLoss(t: AuditTally, r: Recommendation): { total: number; by: Record<Cond, number> } {
  const by = { ruhig: 0, boeig: 0, sturm: 0 } as Record<Cond, number>;
  for (const w of ['ruhig', 'boeig', 'sturm'] as Cond[]) by[w] = DAYS[w] * (1 - rate(t, ctrlFor(r, w), w));
  return { total: by.ruhig + by.boeig + by.sturm, by };
}

/** mean max. tilt of the calm trials per controller (from the audit kept in memory, else recomputed for the calm trials only) */
function calmTilt(env: FinaleEnv, seed: number): { nn: number; bestand: number } {
  let rows = env.audit && env.audit.seed === seed ? env.audit.results.filter((x) => x.spec.cond === 'ruhig').map((x) => ({ nn: x.nn.maxTilt, bestand: x.bestand.maxTilt })) : null;
  if (!rows) rows = planAudit(seed).filter((s) => s.cond === 'ruhig').map((s) => ({ nn: runTrial('nn', s.gusts, s.seed, false).maxTilt, bestand: runTrial('bestand', s.gusts, s.seed, false).maxTilt }));
  const mean = (k: 'nn' | 'bestand'): number => rows!.reduce((a, b) => a + b[k], 0) / Math.max(1, rows!.length);
  return { nn: mean('nn'), bestand: mean('bestand') };
}

/** Deterministic weather calendar (seeded): storms lean to the winter months. */
function weatherYear(seed: number): Cond[] {
  let s = seed >>> 0 || 1;
  const r = (): number => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const days: Cond[] = [];
  for (const w of ['ruhig', 'boeig', 'sturm'] as Cond[]) for (let i = 0; i < DAYS[w]; i++) days.push(w);
  // weighted shuffle: a storm prefers days far from mid-summer (day ≈ 190)
  const keyed = days.map((w) => ({ w, k: r() + (w === 'sturm' ? 0.35 : w === 'boeig' ? 0.12 : 0) }));
  const order = Array.from({ length: 365 }, (_, i) => i).sort((a, b) => Math.abs(b - 190) - Math.abs(a - 190));
  keyed.sort((a, b) => b.k - a.k);
  const out: Cond[] = new Array(365);
  // the strongest keys (mostly storms) take the winter-most slots, the rest are shuffled into summer
  for (let i = 0; i < 365; i++) out[order[i]] = keyed[i].w;
  return out;
}

/** The „Erstflug-Protokoll“ in a modal (the certificate's button). Resolves when closed. */
export function openFlightLog(env: FinaleEnv): Promise<void> {
  const { ctx } = env;
  const year = yearOf(env);
  if (!year) return Promise.resolve();
  const T = (t: Text): string => ctx.i18n.resolve(t);
  env.state.yearLater = true;
  env.save();
  const cv = el('canvas', { width: 1280, height: 720, class: 'fin-cert', role: 'img', 'aria-label': T(Y.title) });
  let t = 0;
  let open = true;
  ctx.audio.play('whoosh', { volume: 0.3, pitch: 0.8 });
  return ctx.hud.openModal(
    (root, close) => {
      root.classList.add('fin', 'fin-modal');
      root.append(el('style', null, FIN_CSS));
      root.append(el('div', { class: 'fin-head' }, el('div', { class: 'eyebrow' }, T(Y.eyebrow)), el('div', { class: 'fin-chips' }, ctx.ui.chip('sim', Y.rates), ctx.ui.chip('fiktion', Y.note))));
      root.append(cv);
      const skip = el('button', { class: 'btn ghost', onclick: () => (t = PLAY_S) }, T(Y.skip));
      root.append(el('div', { class: 'fin-actions' }, skip, el('button', { class: 'btn primary', onclick: () => close() }, T(Y.close))));
      let drawn = '';
      env.tick((dt) => {
        if (!open) return false;
        t = Math.min(PLAY_S, t + Math.min(0.1, dt));
        const key = `${Math.floor((t / PLAY_S) * 365)}:${ctx.lang}`;
        if (key !== drawn) {
          drawn = key;
          year.draw(cv, t / PLAY_S);
        }
        if (t >= PLAY_S) skip.remove();
        return true;
      });
      // a custom modal keeps game time running: the year plays in it like on the Messwand
      year.draw(cv, 0);
      return () => {
        open = false;
      };
    },
    { width: 1040 },
  );
}

/** rc4: the year on the Messwand (kept for the Kielraum; Phase 7 opens it from the certificate instead). */
export function playYearLater(env: FinaleEnv): Promise<void> {
  const { ctx, state, room } = env;
  const year = yearOf(env);
  if (!year) return Promise.resolve();
  env.endYear?.();
  const T = (t: Text): string => ctx.i18n.resolve(t);
  state.yearLater = true;
  env.save();

  // Phase 5: the year plays on the Messwand (the room's big screen), not in a modal over the lectern.
  // The operate camera frames the wall; a slim bar carries the provenance and the two buttons.
  const c = room.messwandCanvas;
  const pose = room.poses.year;
  let t = 0;
  let done = false;
  return new Promise<void>((resolve) => {
    let skipBtn: HTMLButtonElement | null = null;
    const finish = (): void => {
      if (done) return;
      done = true;
      env.endYear = undefined;
      drawMesswand(env, null);
      resolve();
    };
    const exit = ctx.player.enterOperate({
      title: Y.eyebrow,
      cameraPose: { position: pose.position.toArray() as [number, number, number], lookAt: pose.lookAt.toArray() as [number, number, number] },
      panelPosition: 'bottom',
      panel: (root, close) => {
        root.classList.add('fin', 'fin-yearbar');
        root.append(el('style', null, FIN_CSS + YEAR_CSS));
        skipBtn = el('button', { class: 'btn ghost', onclick: () => (t = PLAY_S) }, T(Y.skip));
        root.append(
          el('div', { class: 'yb-src' }, ctx.ui.chip('sim', Y.rates), el('span', null, T(Y.rates))),
          el('div', { class: 'yb-btns' }, skipBtn, el('button', { class: 'btn primary', onclick: () => close() }, T(Y.next))),
        );
        return () => undefined;
      },
      onExit: finish,
    });
    env.endYear = exit;
    ctx.audio.play('whoosh', { volume: 0.3, pitch: 0.8 });
    // redraw (and re-upload the 1280×720 texture) only when the day count or the language changes
    let drawnKey = '';
    env.tick((dt) => {
      if (done) return false;
      t = Math.min(PLAY_S, t + Math.min(0.1, dt));
      const key = `${Math.floor((t / PLAY_S) * 365)}:${ctx.lang}`;
      if (key !== drawnKey) {
        drawnKey = key;
        year.draw(c, t / PLAY_S);
        room.markMesswand();
      }
      if (t >= PLAY_S && skipBtn) {
        skipBtn.remove();
        skipBtn = null;
      }
      return true;
    });
  });
}

/** The year of the player's own recommendation: its numbers and its drawing (null without F2/F3). */
function yearOf(env: FinaleEnv): { draw(cv: HTMLCanvasElement, k: number): void } | null {
  const { ctx, state } = env;
  const f2 = state.f2;
  const f3 = state.f3;
  if (!f2 || !f3) return null;
  const T = (t: Text): string => ctx.i18n.resolve(t);
  const L = (): 'de' | 'en' => (ctx.lang === 'en' ? 'en' : 'de');
  const n = (v: number, d = 0): string => ctx.i18n.num(v, d);
  const tally = f2.tally;
  const loss = Object.fromEntries(RECS.map((r) => [r, yearLoss(tally, r)])) as Record<Recommendation, ReturnType<typeof yearLoss>>;
  const tilt = calmTilt(env, f2.seed);
  const showCalm = tilt.nn < tilt.bestand;
  const days = weatherYear(f2.seed ^ 0x51ed);
  // the player's own recommendation marks round(expected) failing days per weather, spread evenly
  const failDay = new Uint8Array(365);
  for (const w of ['ruhig', 'boeig', 'sturm'] as Cond[]) {
    const idx = days.map((d, i) => (d === w ? i : -1)).filter((i) => i >= 0);
    const k = Math.round(loss[f3.rec].by[w]);
    for (let j = 0; j < k; j++) failDay[idx[Math.floor(((j + 0.5) / k) * idx.length)]] = 1;
  }
  return { draw: drawWall };

  function drawWall(cv: HTMLCanvasElement, k: number): void {
    const g = cv.getContext('2d')!;
    const W = cv.width,
      H = cv.height;
    const lang = L();
    g.fillStyle = C.bg;
    g.fillRect(0, 0, W, H);
    hairline(g, 0, 0, W, 5);
    const x0 = 48;
    g.textBaseline = 'alphabetic';
    g.fillStyle = C.orange;
    g.font = F.mono(23);
    g.fillText(T(Y.eyebrow), x0, 54);
    let cx = W - x0;
    cx -= chip(g, lang === 'de' ? 'FIKTION' : 'FICTION', cx, 47, 16, 'fiktion', true) + 10;
    chip(g, 'SIM · LIVE', cx, 47, 16, 'sim', true);
    g.textBaseline = 'alphabetic';
    g.fillStyle = C.text;
    g.font = F.display(48);
    g.fillText(T(Y.title), x0, 108);
    g.fillStyle = C.text3;
    g.font = F.mono(17);
    g.fillText(T(Y.note), x0, 140);

    // calendar: 53 weeks × 7 days
    const shown = Math.floor(k * 365);
    const pitch = (W - 2 * x0) / 53,
      cw = pitch - 2.4,
      top = 186;
    g.fillStyle = C.text3;
    g.font = F.mono(14);
    const months = lang === 'de' ? ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'] : ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    for (let m = 0; m < 12; m++) g.fillText(months[m], x0 + Math.floor((m * 30.4) / 7) * pitch, top - 8);
    let lost = 0;
    for (let d = 0; d < 365; d++) {
      const x = x0 + Math.floor(d / 7) * pitch,
        y = top + (d % 7) * pitch;
      g.fillStyle = d < shown ? WEATHER[days[d]] : '#1f1d1c';
      g.fillRect(x, y, cw, cw);
      if (d < shown && failDay[d]) {
        lost++;
        g.fillStyle = C.orange;
        g.beginPath();
        g.arc(x + cw / 2, y + cw / 2, cw * 0.3, 0, Math.PI * 2);
        g.fill();
      }
    }
    // the day line under the calendar: day · legend · the player's losses so far
    const yu = top + 7 * pitch + 30;
    g.fillStyle = C.text;
    g.font = F.mono(21);
    g.fillText(`${T(Y.day)} ${Math.max(1, shown)}/365`, x0, yu);
    let lx = x0 + 190;
    g.font = F.mono(15);
    const lg: [string, Text, boolean][] = [
      [WEATHER.ruhig, Y.ruhig, false],
      [WEATHER.boeig, Y.boeig, false],
      [WEATHER.sturm, Y.sturm, false],
      [C.orange, { de: 'Kontrollverlust', en: 'loss of control' }, true],
    ];
    for (const [col, txt, dot] of lg) {
      g.fillStyle = col;
      if (dot) {
        g.beginPath();
        g.arc(lx + 6, yu - 5, 5, 0, Math.PI * 2);
        g.fill();
      } else g.fillRect(lx, yu - 11, 12, 12);
      g.fillStyle = C.text3;
      g.fillText(T(txt), lx + 18, yu);
      lx += g.measureText(T(txt)).width + 40;
    }
    g.fillStyle = C.orangeLight;
    g.font = F.mono(19);
    g.textAlign = 'right';
    g.fillText(`${T(recName(f3!.rec))}: ${lost} × ${lang === 'de' ? 'Kontrollverlust' : 'loss of control'}`, W - x0, yu);
    g.textAlign = 'left';

    // the three recommendations side by side (expected values for the whole year, as in F2's rates)
    const gy = yu + 22,
      gh = H - gy - 52,
      gap = 18,
      colW = (W - 2 * x0 - 2 * gap) / 3;
    RECS.forEach((r, i) => {
      const mine = r === f3!.rec;
      const x = x0 + i * (colW + gap);
      roundRect(g, x, gy, colW, gh, 12);
      g.fillStyle = mine ? 'rgba(255,103,0,0.08)' : 'rgba(255,255,255,0.025)';
      g.fill();
      g.strokeStyle = mine ? 'rgba(255,103,0,0.7)' : C.border;
      g.lineWidth = 2;
      g.stroke();
      const px = x + 20;
      let y = gy + 30;
      if (mine) {
        g.fillStyle = C.orangeLight;
        g.font = F.mono(14);
        g.fillText(T(Y.yours).toUpperCase(), px, y);
      }
      y += 34;
      g.fillStyle = C.text;
      g.font = F.display(28);
      g.fillText(T(recName(r)), px, y);
      g.fillStyle = C.text2;
      g.font = F.sans(17);
      y = wrap(g, T(Y.ctrl[r]), px, y + 26, colW - 40, 21, 2);
      y = Math.max(y, gy + 138);
      g.fillStyle = C.text3;
      g.font = F.mono(14);
      g.fillText(T(Y.loss).toUpperCase(), px, y);
      const v = loss[r].total;
      g.fillStyle = mine ? C.orange : C.text;
      g.font = F.mono(46, 500);
      g.fillText(`≈ ${n(v, loss[r].total < 10 ? 1 : 0)}`, px, y + 48);
      g.fillStyle = C.text3;
      g.font = F.mono(14);
      g.fillText(`${T(Y.ruhig)} ${n(loss[r].by.ruhig, 1)} · ${T(Y.boeig)} ${n(loss[r].by.boeig, 1)} · ${T(Y.sturm)} ${n(loss[r].by.sturm, 1)}`, px, y + 74);
      if (showCalm) {
        g.fillStyle = C.text3;
        g.font = F.sans(14);
        g.fillText(T(Y.calm), px, y + 100);
        g.fillStyle = C.teal;
        g.font = F.mono(17);
        g.fillText(`${n(ctrlFor(r, 'ruhig') === 'nn' ? tilt.nn : tilt.bestand, 2)}°`, px, y + 122);
      }
    });
    g.fillStyle = C.text2;
    g.font = F.sans(19);
    g.fillText(T(Y.foot), x0, H - 20);
  }
}

const YEAR_CSS = `
.fin-yearbar.operate-panel.bottom { width: min(880px, calc(100vw - 48px)); padding: 10px 12px 10px 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 0; }
.fin-yearbar .yb-src { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--text-2); min-width: 0; }
.fin-yearbar .yb-btns { display: flex; gap: 8px; flex: none; }
`;
