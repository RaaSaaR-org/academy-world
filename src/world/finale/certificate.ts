import { logoSvg } from '@/core/zones';
import { C, F, chip, hairline, num, rateText, roundRect, wrap, type Lang } from './draw';
import { el } from './dom';
import { FIN_CSS } from './css';
import { ISLAND_ORDER as ZONE_ORDER, passSnapshot, takeaways, zoneValue, type PassView } from '@/core/quest/values';
import { AREA_MANIFESTS } from '@/core/zones/ZoneManager';
import { LESSONS, QUESTIONS, QUESTION_WHY, S } from './strings';
import { ZONE_PLOTS } from '../layout';
import { openFlightLog } from './year';
import { PAYOFF, PAYOFF_CHIP, PAYOFF_TEXT } from './payoff';
import type { FinaleEnv } from './types';

/**
 * Certificate (GDD §8.6, DECISIONS D5): canvas → PNG 1600 × 1000 with the wordmark, the
 * optional name (stored locally only), mode and date, the 18 stamp values as tiny curves (no
 * seals), Prognose-Güte, trials measured, the finale verdict in the player's own words, the
 * chip legend and "Messung statt Marketing." One neutral line plus academy.emai.dev — no
 * prices, no contact data. Entscheider mode adds a checklist PNG + clipboard text: the nine
 * questions followed by the player's findings.
 *
 * Phase 7 (plan §4.14, §2.8, D43): the front gains „Erstflug: {Datum} · {n}/6 Rotoren selbst gemessen“
 * and „Startakku: {selbst geladen | von der Bodencrew} · Flugmodell: {selbst geprüft | von der
 * Bodencrew}“ (+ the H2 line once it is earned); the back side „Was du unten gesehen hast“ carries one
 * line per site you stamped (the manifests' takeaway) and the closing line for everyone. The
 * „Erstflug-Protokoll“ (rc4 „Ein Jahr später“) is a button here. Entscheider: the „Wo Automatisierung
 * sich lohnt“ Befundkarte joins the PNG set (rows of the sites you visited, payoff.ts).
 */

const W = 1600,
  H = 1000;

let logoImg: Promise<HTMLImageElement | null> | null = null;
function logo(): Promise<HTMLImageElement | null> {
  logoImg ??= new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(logoSvg({ disc: true, size: 256, stroke: 14 }));
    } catch {
      resolve(null);
    }
  });
  return logoImg;
}

async function fontsReady(): Promise<void> {
  try {
    const fs = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fs) return;
    await Promise.race([Promise.all([fs.load(F.display(40)), fs.load(F.sans(20)), fs.load(F.mono(20))]), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* fall back to system fonts */
  }
}

function header(g: CanvasRenderingContext2D, img: HTMLImageElement | null, L: Lang, mode: string, date: string): void {
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = C.grid;
  g.lineWidth = 2;
  g.strokeRect(20, 20, W - 40, H - 40);
  hairline(g, 20, 20, W - 40, 6);
  if (img) g.drawImage(img, 70, 62, 88, 88);
  g.font = F.display(60);
  g.fillStyle = C.text;
  g.fillText('Em', 176, 128);
  const em = g.measureText('Em').width;
  g.fillStyle = C.orange;
  g.fillText('AI', 176 + em, 128);
  g.fillStyle = C.text2;
  g.font = F.mono(19);
  g.fillText('ACADEMY · SCHWEBEWERK', 180, 158);
  // mode + date (right)
  g.font = F.mono(19);
  const dw = g.measureText(date).width;
  g.fillStyle = C.text2;
  g.fillText(date, W - 70 - dw, 100);
  g.save();
  g.font = F.mono(17);
  const label = mode.toUpperCase();
  const tw = g.measureText(label).width + 0.12 * 17 * label.length;
  roundRect(g, W - 70 - tw - 30, 120, tw + 30, 32, 16);
  g.fillStyle = 'rgba(255,103,0,0.08)';
  g.fill();
  g.strokeStyle = 'rgba(255,103,0,0.5)';
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = C.orangeLight;
  g.textBaseline = 'middle';
  let x = W - 70 - tw - 15;
  for (const ch of label) {
    g.fillText(ch, x, 137);
    x += g.measureText(ch).width + 0.12 * 17;
  }
  g.restore();
  void L;
}

function footer(g: CanvasRenderingContext2D, ctxLang: Lang, t: (x: { de: string; en: string }) => string): void {
  // chip legend
  let x = 70;
  const y = H - 106;
  const chips: [string, 'sim' | 'fiktion' | 'illustrativ' | 'plain'][] = [
    ['SIM · LIVE', 'sim'],
    [ctxLang === 'de' ? 'STUDIE' : 'STUDY', 'plain'],
    [ctxLang === 'de' ? 'QUELLE' : 'SOURCE', 'plain'],
    [ctxLang === 'de' ? 'RICHTWERT' : 'GUIDE VALUE', 'plain'],
    [ctxLang === 'de' ? 'ILLUSTRATIV' : 'ILLUSTRATIVE', 'illustrativ'],
    [ctxLang === 'de' ? 'FIKTION' : 'FICTION', 'fiktion'],
  ];
  for (const [lab, kind] of chips) x += chip(g, lab, x, y, 15, kind) + 10;
  g.fillStyle = C.text3;
  g.font = F.sans(17);
  g.fillText(t(S.certFiction), 70, H - 70);
  g.fillStyle = C.text2;
  g.font = F.mono(18);
  g.fillText(t(S.certAcademy), 70, H - 42);
  g.fillStyle = C.text;
  g.font = F.display(44);
  const claim = t(S.claim);
  g.fillText(claim, W - 70 - g.measureText(claim).width, H - 46);
}

function spark(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number[]): void {
  const lo = Math.min(...v),
    hi = Math.max(...v);
  const span = hi - lo || 1;
  g.save();
  g.strokeStyle = C.teal;
  g.lineWidth = 2;
  g.beginPath();
  v.forEach((p, i) => {
    const xx = x + (i / (v.length - 1)) * w;
    const yy = y + h - ((p - lo) / span) * h;
    if (i === 0) g.moveTo(xx, yy);
    else g.lineTo(xx, yy);
  });
  g.stroke();
  g.restore();
}

export interface CertData {
  name: string;
  modeLabel: string;
  date: string;
  view: PassView;
}

export async function drawCertificate(env: FinaleEnv, canvas: HTMLCanvasElement): Promise<void> {
  const { ctx, state } = env;
  await fontsReady();
  const img = await logo();
  const L = ctx.lang as Lang;
  const t = (x: { de: string; en: string }): string => x[L];
  const view = passSnapshot(ctx);
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const date = new Date().toLocaleDateString(L === 'de' ? 'de-DE' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  header(g, img, L, ctx.i18n.resolve(S.certMode), date);

  // title + name; without a name the audit's title takes the big line (W7: no „Ohne Namen“)
  g.fillStyle = C.orange;
  g.font = F.mono(21);
  g.fillText(state.name ? `${t(S.certEyebrow)} · ${t(S.certTitle).toUpperCase()}` : t(S.certEyebrow), 70, 222);
  g.font = F.display(64);
  g.fillStyle = C.text;
  g.fillText(state.name || t(S.certTitle), 66, 290);
  // Phase 7: the first flight and the three systems (who brought them online)
  const fl = flightLines(env, L);
  g.font = F.mono(17);
  const flLine = fl.join('   ·   ');
  if (g.measureText(flLine).width > W - 140) g.font = F.mono(15);
  g.fillStyle = C.teal;
  g.fillText(flLine, 70, 328);

  // 18 stamps: 6 zones × 3 stations (Phase 7: 24 px lower, under the first-flight line)
  const DY = 24;
  g.fillStyle = C.text3;
  g.font = F.mono(16);
  g.fillText(t(S.certStamps).toUpperCase(), 70, 336 + DY);
  const colW = (W - 140) / 6;
  ZONE_ORDER.forEach((zone, zi) => {
    const x = 70 + zi * colW;
    const plot = ZONE_PLOTS.find((z) => z.id === zone);
    const lesson = LESSONS.find((l) => l.zone === zone);
    g.fillStyle = C.grid;
    g.fillRect(x, 350 + DY, colW - 18, 2);
    g.fillStyle = C.text2;
    g.font = F.mono(15);
    g.fillText(plot ? `${String(plot.number).padStart(2, '0')} · ${plot.verb[L]}` : zone, x, 376 + DY);
    g.fillStyle = C.text;
    g.font = F.display(24, 600);
    g.fillText(plot ? plot.name[L] : zone, x, 405 + DY);
    const stamps = view.stamps.filter((s) => s.zone === zone);
    // the zone's ★ total next to its name (C10)
    const zs = stamps.reduce((a, b) => a + b.stars, 0);
    if (stamps.length) {
      g.font = F.mono(15);
      const lab = `${zs}/${stamps.length * 3}`;
      const lw = g.measureText(lab).width;
      g.fillStyle = zs ? C.text : C.text3;
      g.fillText(lab, x + colW - 24 - lw, 376 + DY);
      starPath(g, x + colW - 24 - lw - 12, 371 + DY, 6.5, zs > 0);
    }
    for (let si = 0; si < 3; si++) {
      const s = stamps[si];
      const y = 440 + DY + si * 82;
      g.fillStyle = C.text3;
      g.font = F.sans(15);
      if (s) {
        const label = s.title + (s.star ? ' ◆' : '');
        const tw = colW - 24 - 52;
        // W7: a smaller size, then two lines at 12 px (into the gap above), before an ellipsis
        for (const px of [14, 13]) if (g.measureText(label).width > tw) g.font = F.sans(px);
        if (g.measureText(label).width <= tw) g.fillText(label, x, y);
        else {
          g.font = F.sans(12);
          wrap(g, label, x, y - 7, tw, 13, 2);
        }
      } else g.fillText('—', x, y);
      // three small stars per station (rating the player's play, never a robot)
      if (s) for (let k = 0; k < 3; k++) starPath(g, x + colW - 24 - 40 + k * 15, y - 5, 5.6, k < s.stars);
      g.font = F.mono(17);
      if (!s || (!s.earned && !s.skipped)) {
        g.fillStyle = '#57534E';
        g.fillText(t(S.certOpen), x, y + 26);
      } else if (s.skipped) {
        g.fillStyle = C.text3;
        g.fillText(t(S.certSkipped), x, y + 26);
      } else {
        g.fillStyle = C.text;
        // W7: wrap onto two lines, then smaller, then three lines, before anything is cut
        const fit = fitValue(g, s.value ?? '✓', x, y + 26, colW - 24);
        // the curve between the value and the next station's title (it used to run through that title)
        const sparkTop = fit.y - fit.lh + 5;
        const sparkH = Math.min(22, y + 66 - sparkTop);
        if (s.curve && s.curve.length > 1 && sparkH >= 10) spark(g, x, sparkTop, Math.min(150, colW - 40), sparkH, s.curve);
      }
    }
    void lesson;
  });

  // stats row
  const sy = 724;
  const stat = (x: number, k: string, v: string, accent = false): void => {
    g.fillStyle = C.text3;
    g.font = F.mono(15);
    g.fillText(k.toUpperCase(), x, sy);
    g.fillStyle = accent ? C.orange : C.text;
    g.font = F.mono(30, 500);
    g.fillText(v, x, sy + 40);
  };
  const pg = view.prognoseGuete;
  stat(70, t(S.certPrognose), pg == null ? '—' : `${num(pg, 0, L)} %`);
  const trials = (state.f2 ? 400 : 0) + view.trialsBest;
  stat(300, t(S.certTrials), trials ? num(trials, 0, L).replace(/\B(?=(\d{3})+(?!\d))/g, L === 'de' ? '.' : ',') : '—');
  // ★ total and Sensorkapseln (C10)
  stat(510, L === 'de' ? 'Sterne' : 'Stars', `${view.starsTotal}/${view.starsMax}`);
  stat(700, L === 'de' ? 'Kapseln' : 'Capsules', view.capsulesTotal ? `${view.capsules}/${view.capsulesTotal}` : '—');
  // F1: your stars + the time over 3°
  const f1Stars = env.f1?.stars ?? 0;
  stat(890, t(S.certF1), state.f1?.skipped ? t(S.f1Skipped) : state.f1 ? `${num(state.f1.over, 1, L)} s > 3°` : '—');
  if (state.f1 && !state.f1.skipped) for (let k = 0; k < 3; k++) starPath(g, 897 + k * 17, sy + 58, 6.5, k < f1Stars);
  const k = state.f2?.tally.nn.sturm;
  stat(1150, t(S.certF2), k ? `${rateText(k.k, k.n, L)} · n = ${k.n}` : '—', true);

  // verdict
  g.fillStyle = C.text3;
  g.font = F.mono(15);
  g.fillText(t(S.certVerdict).toUpperCase(), 70, 800);
  g.fillStyle = C.orange;
  g.fillRect(70, 812, 4, 56);
  g.fillStyle = C.text;
  g.font = F.display(23, 500);
  const quote = state.f3 ? (L === 'de' ? `„${state.f3.sentence.de}“` : `“${state.f3.sentence.en}”`) : '—';
  wrap(g, quote, 88, 834, W - 170, 28, 2);

  footer(g, L, t);
}

/**
 * Phase 7: the first flight and the three systems (plan §4.14): „Erstflug: {Datum} · {n}/6 Rotoren selbst
 * gemessen“ and „Startakku: selbst geladen | von der Bodencrew · Flugmodell: selbst geprüft | …“, plus the
 * H2 line once it is earned. n counts the rotors you brought online yourself (not the Bodencrew's).
 */
export function flightLines(env: FinaleEnv, L: Lang): string[] {
  const q = env.ctx.quest.snapshot();
  const t = (x: { de: string; en: string }): string => x[L];
  const at = q.flight.firstFlightAt;
  const date = at ? new Date(at).toLocaleDateString(L === 'de' ? 'de-DE' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) : t(S.certOpen);
  // „selbst gemessen“: the rotors whose ◆ stamp you earned yourself (the Bodencrew's never count)
  const view = passSnapshot(env.ctx);
  const own = ZONE_ORDER.filter((z) => view.stamps.some((st) => st.zone === z && st.star && st.earned)).length;
  const e = q.start.energy.by === 'player' ? S.certAkkuSelf : q.start.energy.by === 'crew' ? S.certAkkuCrew : S.certAkkuOpen;
  const n = q.start.nav.by === 'player' ? S.certNavSelf : q.start.nav.by === 'crew' ? S.certNavCrew : S.certNavOpen;
  const out = [`${t(S.certFirstFlight)}: ${date} · ${t(S.certRotors(own) as { de: string; en: string })}`, `${t(e)} · ${t(n)}`];
  if (q.mastery.h2Earned) out.push(t(S.certH2));
  return out;
}

/** §2.8 (D43): one line per site you stamped (the manifests' takeaway), in the manifests' order. */
function backRows(env: FinaleEnv): { title: { de: string; en: string }; line: { de: string; en: string } }[] {
  const manifests = [...AREA_MANIFESTS.values()];
  const view = passSnapshot(env.ctx, { scope: 'all', manifests });
  return takeaways(view, manifests).map((r) => ({ title: r.title as { de: string; en: string }, line: r.line as { de: string; en: string } }));
}

/** The back side „Was du unten gesehen hast“ / “What you saw down there” (plan §2.8). */
export async function drawBack(env: FinaleEnv, canvas: HTMLCanvasElement): Promise<void> {
  const { ctx } = env;
  await fontsReady();
  const img = await logo();
  const L = ctx.lang as Lang;
  const t = (x: { de: string; en: string }): string => x[L];
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const date = new Date().toLocaleDateString(L === 'de' ? 'de-DE' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  header(g, img, L, ctx.i18n.resolve(S.certMode), date);
  g.fillStyle = C.orange;
  g.font = F.mono(21);
  g.fillText(t(S.certBackEyebrow), 70, 222);
  g.font = F.display(60);
  g.fillStyle = C.text;
  g.fillText(t(S.certBackTitle), 66, 290);
  const rows = backRows(env);
  let y = 372;
  if (!rows.length) {
    g.fillStyle = C.text2;
    g.font = F.sans(24);
    wrap(g, t(S.certBackNone), 70, y + 20, W - 140, 32, 2);
  }
  for (const r of rows.slice(0, 5)) {
    g.fillStyle = C.grid;
    g.fillRect(70, y - 26, W - 140, 2);
    g.fillStyle = C.text3;
    g.font = F.mono(16);
    g.fillText(t(r.title).toUpperCase(), 70, y);
    g.fillStyle = C.text;
    g.font = F.display(36, 600);
    g.fillText(t(r.line), 70, y + 46);
    y += 96;
  }
  g.fillStyle = C.teal;
  g.font = F.display(40);
  g.fillText(t(S.certBackClose), 70, Math.max(y + 34, 800));
  footer(g, L, t);
}

/** Entscheider: the „Wo Automatisierung sich lohnt“ Befundkarte (payoff.ts), rows of the sites you visited. */
export async function drawPayoff(env: FinaleEnv, canvas: HTMLCanvasElement): Promise<void> {
  const { ctx } = env;
  await fontsReady();
  const img = await logo();
  const L = ctx.lang as Lang;
  const t = (x: { de: string; en: string }): string => x[L];
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const date = new Date().toLocaleDateString(L === 'de' ? 'de-DE' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  header(g, img, L, ctx.i18n.resolve(S.certMode), date);
  const P = PAYOFF_TEXT;
  g.fillStyle = C.orange;
  g.font = F.mono(21);
  g.fillText(t(P.eyebrow), 70, 222);
  g.fillStyle = C.text;
  g.font = F.display(56);
  g.fillText(t(P.title), 66, 288);
  // the sites you went to: entered, or with a stamp of yours
  const rows = PAYOFF.filter((r) => r.area === null || ctx.zones.visited(r.area) || ctx.zones.stamps(r.area) > 0);
  const colP = 520,
    colN = 1060;
  g.fillStyle = C.text3;
  g.font = F.mono(15);
  g.fillText(t(P.pays).toUpperCase(), colP, 340);
  g.fillText(t(P.notYet).toUpperCase(), colN, 340);
  let y = 382;
  if (rows.length <= 1) {
    g.fillStyle = C.text2;
    g.font = F.sans(19);
    g.fillText(t(P.none), 70, y);
    y += 50;
  }
  for (const r of rows) {
    g.fillStyle = C.grid;
    g.fillRect(70, y - 24, W - 140, 2);
    g.fillStyle = C.text;
    g.font = F.display(24, 600);
    g.fillText(t(r.title), 70, y + 4);
    if (r.chip) chip(g, t(PAYOFF_CHIP[r.chip]), 70, y + 26, 13, 'plain');
    g.fillStyle = C.text3;
    g.font = F.sans(14);
    g.fillText(t(r.source), 70, y + (r.chip ? 58 : 32));
    g.fillStyle = C.text;
    g.font = F.sans(18);
    const y1 = wrap(g, t(r.pays), colP, y, colN - colP - 30, 23, 3);
    g.fillStyle = C.text2;
    const y2 = wrap(g, t(r.notYet), colN, y, W - 70 - colN, 23, 3);
    y = Math.max(y1, y2, y + 64) + 34;
    if (y > H - 150) break;
  }
  g.fillStyle = C.text3;
  g.font = F.sans(15);
  g.fillText(t(P.foot), 70, H - 130);
  footer(g, L, t);
}

/** The certificate as text lines (tools: ending-check, playtest; the screen-reader summary has its own). */
export function certLines(env: FinaleEnv, lang?: Lang): { front: string[]; back: string[] } {
  const L = lang ?? (env.ctx.lang as Lang);
  const t = (x: { de: string; en: string }): string => x[L];
  const front = [t(S.certTitle), ...flightLines(env, L)];
  if (env.state.f3) front.push(env.state.f3.sentence[L]);
  const rows = backRows(env);
  const back = [t(S.certBackTitle), ...(rows.length ? rows.map((r) => `${t(r.title)}: ${t(r.line)}`) : [t(S.certBackNone)]), t(S.certBackClose)];
  return { front, back };
}

export async function drawChecklist(env: FinaleEnv, canvas: HTMLCanvasElement): Promise<void> {
  const { ctx, state } = env;
  await fontsReady();
  const img = await logo();
  const L = ctx.lang as Lang;
  const t = (x: { de: string; en: string }): string => x[L];
  const view = passSnapshot(ctx);
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const date = new Date().toLocaleDateString(L === 'de' ? 'de-DE' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  header(g, img, L, ctx.i18n.resolve(S.certMode), date);
  g.fillStyle = C.orange;
  g.font = F.mono(21);
  g.fillText(L === 'de' ? '// CHECKLISTE · ENTSCHEIDER' : '// CHECKLIST · DECISION MAKERS', 70, 228);
  g.fillStyle = C.text;
  g.font = F.display(56);
  g.fillText(t(S.checkTitle), 66, 292);
  const have = new Set(view.questions);
  QUESTIONS.forEach((q, i) => {
    const y = 350 + i * 56;
    g.fillStyle = C.orangeLight;
    g.font = F.mono(18);
    g.fillText(String(i + 1).padStart(2, '0'), 70, y);
    g.fillStyle = C.text;
    g.font = F.sans(22, 600);
    g.fillText(q[L], 116, y);
    g.fillStyle = C.text3;
    g.font = F.sans(16);
    g.fillText(QUESTION_WHY[i][L], 116, y + 22);
    if (have.has(i + 1)) {
      g.fillStyle = C.teal;
      g.font = F.mono(15);
      g.fillText(`✓ ${t(S.checkHave)}`, 760, y);
    }
  });
  // findings
  const fx = 900;
  g.fillStyle = C.grid;
  g.fillRect(fx - 30, 330, 2, 500);
  g.fillStyle = C.text3;
  g.font = F.mono(16);
  g.fillText(t(S.checkFindings).toUpperCase(), fx, 342);
  let y = 380;
  for (const zone of ZONE_ORDER) {
    const plot = ZONE_PLOTS.find((z) => z.id === zone);
    const v = zoneValue(view, zone);
    g.fillStyle = C.text2;
    g.font = F.mono(15);
    g.fillText(plot ? `${String(plot.number).padStart(2, '0')} ${plot.name[L].toUpperCase()}` : zone, fx, y);
    g.fillStyle = v ? C.text : '#57534E';
    g.font = F.sans(19);
    y = wrap(g, v ? `${v.title}: ${v.value}` : t(S.certOpen), fx, y + 24, W - fx - 80, 24, 2) + 14;
  }
  const k = state.f2?.tally.nn.sturm;
  g.fillStyle = C.text2;
  g.font = F.mono(15);
  g.fillText(L === 'de' ? 'STARTPRÜFUNG' : 'FLIGHT CHECK', fx, y + 6);
  g.fillStyle = C.orange;
  g.font = F.sans(19, 600);
  y = wrap(g, k ? `NN-Lage v2 · ${L === 'de' ? 'Sturm' : 'storm'}: ${rateText(k.k, k.n, L)} (n = ${k.n})` : '—', fx, y + 30, W - fx - 80, 24, 2);
  g.fillStyle = C.text;
  g.font = F.sans(18);
  if (state.f3) wrap(g, state.f3.sentence[L], fx, y + 8, W - fx - 80, 23, 4);
  footer(g, L, t);
}

export function checklistText(env: FinaleEnv): string {
  const { ctx, state } = env;
  const L = ctx.lang as Lang;
  const view = passSnapshot(ctx);
  const lines: string[] = [];
  lines.push(L === 'de' ? 'EmAI Academy · Schwebewerk – Neun Fragen an jeden Anbieter' : 'EmAI Academy · The Floating Works – Nine questions for every vendor');
  lines.push('');
  QUESTIONS.forEach((q, i) => lines.push(`${i + 1}. ${q[L]} – ${QUESTION_WHY[i][L]}`));
  lines.push('');
  lines.push(L === 'de' ? 'Meine Befunde:' : 'My findings:');
  for (const zone of ZONE_ORDER) {
    const plot = ZONE_PLOTS.find((z) => z.id === zone);
    const v = zoneValue(view, zone);
    lines.push(`- ${plot ? plot.name[L] : zone}: ${v ? `${v.title}: ${v.value}` : L === 'de' ? 'offen' : 'open'}`);
  }
  const k = state.f2?.tally.nn.sturm;
  if (k) lines.push(`- ${L === 'de' ? 'Startprüfung' : 'Flight check'}: NN-Lage v2 ${L === 'de' ? 'bei Sturm' : 'in a storm'} ${rateText(k.k, k.n, L)} (n = ${k.n})`);
  if (state.f3) lines.push(`- ${state.f3.sentence[L]}`);
  lines.push('');
  lines.push(ctx.i18n.resolve(S.certFiction));
  lines.push(ctx.i18n.resolve(S.claim) + ' · academy.emai.dev');
  return lines.join('\n');
}

/** Lines `text` needs at the current font within `w` (word wrap; a single over-long word counts as one line). */
function lineCount(g: CanvasRenderingContext2D, text: string, w: number): number {
  let n = 1,
    line = '';
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (line && g.measureText(test).width > w) {
      n++;
      line = word;
    } else line = test;
  }
  return n;
}

/**
 * W7 (UX-22): a station value in its column without „…“ where possible: 17 px on ≤ 2 lines, then
 * 15 and 14 px on ≤ 2 lines, then 13 px on 3 lines; only then is the last line cut. Returns the y
 * after the last line (like wrap()) and the line height used.
 */
function fitValue(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number): { y: number; lh: number } {
  const tries: [number, number, number][] = [
    [17, 21, 2],
    [15, 19, 2],
    [14, 17, 2],
    [13, 16, 3],
  ];
  for (const [px, lh, lines] of tries) {
    g.font = F.mono(px);
    if (lineCount(g, text, w) <= lines) return { y: wrap(g, text, x, y, w, lh, lines), lh };
  }
  return { y: wrap(g, text, x, y, w, 16, 3), lh: 16 };
}

/** PNG download via a temporary link inside the modal (some browsers need it in the DOM). */
function download(canvas: HTMLCanvasElement, name: string, host: HTMLElement): void {
  try {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: name, style: 'display:none' });
      host.append(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 4000);
    }, 'image/png');
  } catch (err) {
    console.warn('[finale] PNG download failed', err);
  }
}

/** W7: the certificate as text for screen readers (canvas role=img): name, stars, stamps, values, verdict. */
export function certSummary(env: FinaleEnv): string {
  const { ctx, state } = env;
  const L = ctx.lang as Lang;
  const de = L === 'de';
  const t = (x: { de: string; en: string }): string => x[L];
  const view = passSnapshot(ctx);
  const parts: string[] = [];
  parts.push(`${de ? 'Zertifikat' : 'Certificate'}: ${t(S.certTitle)}${state.name ? (de ? `, für ${state.name}` : `, for ${state.name}`) : ''}.`);
  for (const l of flightLines(env, L)) parts.push(`${l}.`);
  const earned = view.stamps.filter((s) => s.earned).length;
  parts.push(de ? `${view.starsTotal} von ${view.starsMax} Sternen, ${earned} von 18 Stempeln.` : `${view.starsTotal} of ${view.starsMax} stars, ${earned} of 18 stamps.`);
  for (const zone of ZONE_ORDER) {
    const plot = ZONE_PLOTS.find((z) => z.id === zone);
    const stamps = view.stamps.filter((s) => s.zone === zone);
    const stars = stamps.reduce((a, b) => a + b.stars, 0);
    const v = zoneValue(view, zone);
    const name = plot ? plot.name[L] : zone;
    const head = de ? `${name}: ${stars} von ${stamps.length * 3 || 9} Sternen` : `${name}: ${stars} of ${stamps.length * 3 || 9} stars`;
    parts.push(v ? `${head}; ${v.title}: ${v.value}.` : `${head}; ${t(S.certOpen)}.`);
  }
  const pg = view.prognoseGuete;
  if (pg != null) parts.push(`${t(S.certPrognose)}: ${num(pg, 0, L)} %.`);
  const k = state.f2?.tally.nn.sturm;
  if (k) parts.push(`${t(S.certF2)}: ${rateText(k.k, k.n, L)}, n = ${k.n}.`);
  if (state.f3) parts.push(`${t(S.certVerdict)}: ${state.f3.sentence[L]}`);
  parts.push(t(S.claim));
  return parts.join(' ');
}

/** The back side for screen readers. */
function backSummary(env: FinaleEnv): string {
  return certLines(env).back.join('. ').replace(/\.\./g, '.');
}

/** The certificate overlay: preview, optional name, PNG download; Entscheider: checklist PNG + copy. */
export function openCertificate(env: FinaleEnv, onName?: () => void): Promise<void> {
  const { ctx, state } = env;
  const drawLecternLater = (): void => onName?.();
  const T = (t: Parameters<typeof ctx.i18n.resolve>[0]): string => ctx.i18n.resolve(t);
  const cert = el('canvas', { class: 'fin-cert' });
  const back = el('canvas', { class: 'fin-cert', style: 'display:none' });
  const check = el('canvas', { class: 'fin-cert' });
  const payoff = el('canvas', { class: 'fin-cert' });
  let timer = 0;
  return ctx.hud.openModal(
    (root, close) => {
      root.classList.add('fin', 'fin-modal');
      // W7 (UX-19/UXA-09): a named modal dialog; the certificate image carries a text summary
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-labelledby', 'fin-cert-title');
      root.append(el('style', null, FIN_CSS));
      root.append(el('div', { class: 'fin-head' }, el('div', { class: 'eyebrow' }, T(S.certEyebrow)), el('div', { class: 'fin-chips' }, ctx.ui.chip('fiktion', S.certFiction))));
      root.append(el('h2', { id: 'fin-cert-title' }, T(S.certTitle)));
      cert.setAttribute('role', 'img');
      back.setAttribute('role', 'img');
      const describe = (): void => {
        cert.setAttribute('aria-label', certSummary(env));
        back.setAttribute('aria-label', backSummary(env));
      };
      describe();
      void drawCertificate(env, cert);
      void drawBack(env, back);
      // Phase 7 (§2.8): front and back side
      const tabs = el('div', { class: 'fin-tabs', role: 'tablist' });
      const tab = (label: string, on: boolean, show: () => void): HTMLButtonElement => {
        const b = el('button', { role: 'tab', 'aria-selected': on ? 'true' : 'false', class: on ? 'on' : '', onclick: () => {
          for (const x of tabs.children) {
            x.classList.remove('on');
            x.setAttribute('aria-selected', 'false');
          }
          b.classList.add('on');
          b.setAttribute('aria-selected', 'true');
          show();
          ctx.audio.play('click');
        } }, label) as HTMLButtonElement;
        return b;
      };
      tabs.append(
        tab(T(S.certFront), true, () => {
          cert.style.display = '';
          back.style.display = 'none';
        }),
        tab(T(S.certBack), false, () => {
          cert.style.display = 'none';
          back.style.display = '';
        }),
      );
      const input = el('input', { class: 'fin-name', id: 'fin-cert-name', type: 'text', maxlength: 40, placeholder: T(S.certNamePh), value: state.name, autocomplete: 'off' }) as HTMLInputElement;
      input.addEventListener('input', () => {
        state.name = input.value.slice(0, 40);
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          env.save();
          void drawCertificate(env, cert);
          describe();
          drawLecternLater();
        }, 180);
      });
      // keep game keys (E, Tab, …) out of the name field; Esc leaves the field (a second Esc closes)
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      });
      const copyBtn = el('button', { class: 'btn ghost block' }, T(S.certCopy));
      copyBtn.addEventListener('click', () => {
        const text = checklistText(env);
        const done = (): void => {
          copyBtn.textContent = T(S.certCopied);
          setTimeout(() => (copyBtn.textContent = T(S.certCopy)), 1600);
        };
        try {
          void navigator.clipboard?.writeText(text).then(done, done);
        } catch {
          done();
        }
      });
      const side = el(
        'div',
        { class: 'fin-side' },
        el('label', { class: 'fin-field', for: 'fin-cert-name' }, el('span', { class: 'fin-label', style: 'margin-top:0' }, T(S.certName)), input),
        el(
          'button',
          {
            class: 'btn primary block',
            style: 'margin-top:14px',
            onclick: () => {
              void drawCertificate(env, cert).then(() => download(cert, ctx.lang === 'de' ? 'emai-zertifikat.png' : 'emai-certificate.png', root));
            },
          },
          T(S.certSave),
        ),
        el(
          'button',
          {
            class: 'btn ghost block',
            style: 'margin-top:8px',
            onclick: () => {
              void drawBack(env, back).then(() => download(back, ctx.lang === 'de' ? 'emai-zertifikat-rueckseite.png' : 'emai-certificate-back.png', root));
            },
          },
          T(S.certSaveBack),
        ),
      );
      // the rc4 „Ein Jahr später“, now optional: the „Erstflug-Protokoll“ (plan §4.14)
      if (state.f2 && state.f3)
        side.append(el('button', { class: 'btn ghost block', style: 'margin-top:8px', onclick: () => void openFlightLog(env) }, T(S.certLog)));
      if (ctx.mode === 'entscheider') {
        side.append(
          el('div', { class: 'fin-label' }, T(S.checkTitle)),
          el(
            'button',
            {
              class: 'btn ghost block',
              onclick: () => {
                void drawChecklist(env, check).then(() => download(check, ctx.lang === 'de' ? 'emai-checkliste.png' : 'emai-checklist.png', root));
              },
            },
            T(S.certChecklist),
          ),
          copyBtn,
          el(
            'button',
            {
              class: 'btn ghost block',
              style: 'margin-top:8px',
              onclick: () => {
                void drawPayoff(env, payoff).then(() => download(payoff, ctx.lang === 'de' ? 'emai-wo-automatisierung-sich-lohnt.png' : 'emai-where-automation-pays.png', root));
              },
            },
            T(S.certPayoff),
          ),
        );
      }
      side.append(
        el(
          'p',
          { class: 'fin-mono', style: 'margin:16px 0 0;color:var(--text-3);font-size:12px;line-height:1.6' },
          T({ de: 'Weiterlernen: ', en: 'Keep learning: ' }),
          el('a', { href: 'https://academy.emai.dev', target: '_blank', rel: 'noopener', style: 'color:var(--teal)' }, 'academy.emai.dev'),
        ),
        el('div', { style: 'flex:1' }),
        el('button', { class: 'btn ghost block', style: 'margin-top:14px', onclick: () => close() }, T(S.close)),
      );
      root.append(el('div', { class: 'fin-certgrid' }, el('div', null, el('div', { style: 'margin:0 0 8px' }, tabs), cert, back), side));
      return () => window.clearTimeout(timer);
    },
    { width: 1080 },
  );
}

/** a five-point star as a canvas path (no glyph: fonts may lack ★) */
function starPath(g: CanvasRenderingContext2D, x: number, y: number, r: number, on: boolean): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  if (on) {
    g.fillStyle = '#FF6700';
    g.fill();
  } else {
    g.lineWidth = 1.2;
    g.strokeStyle = '#57534E';
    g.stroke();
  }
}
