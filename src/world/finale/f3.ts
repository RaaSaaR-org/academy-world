import { C, F, hairline, rateText, wrap, type Lang } from './draw';
import { el } from './dom';
import { FIN_CSS } from './css';
import { openResults } from './f2';
import { S } from './strings';
import type { FinaleEnv, Recommendation } from './types';

/**
 * F3 „Empfehlung" (GDD §6.6): EmAI's template "Empfehlung: {Pilot | Pilot mit Auflage |
 * kein Pilot}. Grund: {Zahl-Kachel}. Alternativ: {Kachel}." The number tiles come from the
 * player's own F2 data. The reason needs at least one number tile; every recommendation is
 * accepted. Signing without having opened the storm curve triggers a soft hint from EMI-01.
 * Phase 7 (plan §4.14, D23, D24): the choice flies — it is the controller of the lift-off's gust in
 * the cloud — and signing arms the lift-off once the island is Startklar (the quest reads F3 from the
 * island's 'finale' state). „Ein Jahr später“ no longer plays here: it is the optional
 * „Erstflug-Protokoll“ on the certificate (year.ts).
 */

interface Tile {
  id: string;
  num: boolean;
  text: { de: string; en: string };
}

type Both = { de: string; en: string };

/** Number tile text in both languages from a {de,en}-returning template and an F2 tally cell. */
function numTile(f: (r: string) => unknown, k: number, n: number): Both {
  const one = (lang: Lang): string => `${(f(rateText(k, n, lang)) as Both)[lang]} (n = ${n})`;
  return { de: one('de'), en: one('en') };
}

export function reasonTiles(env: FinaleEnv): Tile[] {
  const f2 = env.state.f2;
  if (!f2) return [];
  const t = f2.tally;
  return [
    { id: 'nnSturm', num: true, text: numTile(S.tileNNStorm, t.nn.sturm.k, t.nn.sturm.n) },
    { id: 'bSturm', num: true, text: numTile(S.tileBStorm, t.bestand.sturm.k, t.bestand.sturm.n) },
    { id: 'nnCalm', num: true, text: numTile(S.tileNNCalm, t.nn.ruhig.k, t.nn.ruhig.n) },
    { id: 'nnGust', num: true, text: numTile(S.tileNNGust, t.nn.boeig.k, t.nn.boeig.n) },
    { id: 'p99', num: true, text: S.tile99 },
    { id: 'demo', num: false, text: S.tileDemo },
    { id: 'brand', num: false, text: S.tileBrand },
  ];
}

const ALTS: Tile[] = [
  { id: 'keep', num: false, text: S.altKeep },
  { id: 'mrc', num: false, text: S.altMrc },
  { id: 'measure', num: false, text: S.altMeasure },
];

const REC_TEXT: Record<Recommendation, Both> = { pilot: S.f3Pilot, pilotCond: S.f3PilotCond, none: S.f3NoPilot };

export function buildSentence(rec: Recommendation | null, reasons: Tile[], alt: Tile | null, lang: Lang): string {
  // inside a sentence English tiles continue in lower case ("…; the current controller holds …")
  const mid = (t: string, i: number): string => (lang === 'en' && i > 0 && /^(The|Keep)\b/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);
  const r = rec ? REC_TEXT[rec][lang] : '…';
  const why = reasons.length ? reasons.map((x, i) => mid(x.text[lang], i)).join('; ') : '…';
  const a = alt ? mid(alt.text[lang], 1) : '—';
  return lang === 'de' ? `Empfehlung: ${r}. Grund: ${why}. Alternativ: ${a}.` : `Recommendation: ${r}. Reason: ${why}. Alternatively: ${a}.`;
}

/** The lectern's paper: the template, or the signed recommendation. */
export function drawLectern(env: FinaleEnv): void {
  const { ctx, room, state } = env;
  const c = room.lecternCanvas;
  const g = c.getContext('2d')!;
  const W = c.width,
    H = c.height;
  const L = ctx.lang as Lang;
  g.fillStyle = '#EDEAE6';
  g.fillRect(0, 0, W, H);
  hairline(g, 0, 0, W, 6);
  g.fillStyle = '#57534E';
  g.font = F.mono(18);
  g.fillText(L === 'de' ? '// EMPFEHLUNG · STARTPRÜFUNG INSEL 17' : '// RECOMMENDATION · FLIGHT CHECK ISLAND 17', 28, 44);
  g.fillStyle = '#1C1917';
  if (state.f3) {
    g.font = F.display(26, 600);
    wrap(g, state.f3.sentence[L], 28, 96, W - 56, 33, 7);
    g.strokeStyle = '#78716C';
    g.beginPath();
    g.moveTo(28, H - 50);
    g.lineTo(W * 0.55, H - 50);
    g.stroke();
    g.font = F.display(28, 500);
    g.fillStyle = '#1C1917';
    g.fillText(state.name || (L === 'de' ? 'unterschrieben' : 'signed'), 34, H - 58);
    g.fillStyle = '#78716C';
    g.font = F.mono(16);
    g.fillText(new Date().toLocaleDateString(L === 'de' ? 'de-DE' : 'en-GB'), W * 0.62, H - 54);
  } else {
    g.font = F.display(26, 600);
    const rows = L === 'de' ? ['Empfehlung: ______________', 'Grund: ____________________', '______________________________', 'Alternativ: ________________'] : ['Recommendation: __________', 'Reason: ___________________', '______________________________', 'Alternatively: ______________'];
    rows.forEach((r, i) => g.fillText(r, 28, 104 + i * 52));
    g.fillStyle = '#A8A29E';
    g.font = F.mono(16);
    g.fillText(L === 'de' ? 'Grund braucht eine Zahl.' : 'The reason needs a number.', 28, H - 30);
  }
  room.markLectern();
  void C;
}

export function startF3(env: FinaleEnv, onSigned: () => void): void {
  const { ctx } = env;
  if (env.busy || !env.state.f2) return;
  env.busy = true;
  const T = (t: Parameters<typeof ctx.i18n.resolve>[0]): string => ctx.i18n.resolve(t);
  const tiles = reasonTiles(env);
  let rec: Recommendation | null = env.state.f3?.rec ?? null;
  const chosen = new Set<string>(env.state.f3?.reasons ?? []);
  let alt: string | null = env.state.f3?.alt ?? null;
  let signed = false;
  let warned = false;

  void ctx.hud
    .openModal(
      (root, close) => {
        root.classList.add('fin', 'fin-modal');
        root.append(el('style', null, FIN_CSS));
        root.append(el('div', { class: 'fin-head' }, el('div', { class: 'eyebrow' }, T(S.f3Title)), el('div', { class: 'fin-chips' }, ctx.ui.chip('sim', { de: 'Zahlen aus deiner Messung (F2)', en: 'Numbers from your measurement (F2)' }))));
        root.append(el('h2', null, T(S.f3Head)));
        const body = el('div');
        root.append(body);
        const render = (): void => {
          const L = ctx.lang as Lang;
          body.replaceChildren();
          // recommendation
          body.append(el('div', { class: 'fin-label' }, T(S.f3Rec)));
          const seg = el('div', { class: 'fin-tiles' });
          (['pilot', 'pilotCond', 'none'] as Recommendation[]).forEach((r) =>
            seg.append(
              el(
                'button',
                {
                  class: `fin-tile${rec === r ? ' on' : ''}`,
                  onclick: () => {
                    rec = r;
                    ctx.audio.play('click');
                    render();
                  },
                },
                REC_TEXT[r][L],
              ),
            ),
          );
          body.append(seg);
          // reasons
          body.append(el('div', { class: 'fin-label' }, `${T(S.f3Why)} · ${L === 'de' ? 'mehrere möglich' : 'pick one or more'}`));
          const rs = el('div', { class: 'fin-tiles' });
          for (const tl of tiles)
            rs.append(
              el(
                'button',
                {
                  class: `fin-tile${tl.num ? ' num' : ''}${chosen.has(tl.id) ? ' on' : ''}`,
                  onclick: () => {
                    if (chosen.has(tl.id)) chosen.delete(tl.id);
                    else chosen.add(tl.id);
                    ctx.audio.play('click');
                    render();
                  },
                },
                tl.text[L],
              ),
            );
          body.append(rs);
          // alternative
          body.append(el('div', { class: 'fin-label' }, T(S.f3Alt)));
          const as = el('div', { class: 'fin-tiles' });
          for (const tl of ALTS)
            as.append(
              el(
                'button',
                {
                  class: `fin-tile${alt === tl.id ? ' on' : ''}`,
                  onclick: () => {
                    alt = alt === tl.id ? null : tl.id;
                    ctx.audio.play('click');
                    render();
                  },
                },
                tl.text[L],
              ),
            );
          body.append(as);
          // sentence preview
          const reasons = tiles.filter((x) => chosen.has(x.id));
          const altTile = ALTS.find((x) => x.id === alt) ?? null;
          body.append(el('div', { class: 'fin-sentence' }, buildSentence(rec, reasons, altTile, L)));
          const hasNumber = reasons.some((x) => x.num);
          const msg = !rec ? T(S.f3NeedChoice) : !hasNumber ? T(S.f3NeedNumber) : '';
          if (msg) body.append(el('div', { class: 'fin-warn' }, msg));
          else body.append(el('div', { class: 'fin-mono', style: 'color:var(--text-3)' }, T(S.f3AnyAccepted)));
          if (ctx.mode === 'entscheider') body.append(el('div', { class: 'fin-box' }, el('div', { class: 'fin-k' }, L === 'de' ? 'Für Entscheider' : 'For decision makers'), el('p', { style: 'margin:4px 0 0' }, T(S.f3Decider))));
          const actions = el('div', { class: 'fin-actions sticky' });
          const sign = (): void => {
            if (!rec || !hasNumber) return;
            if (!env.state.f2?.sturmSeen && !warned) {
              warned = true;
              void env.say([S.f3NotSeen], 4);
              render();
              return;
            }
            signed = true;
            const s = { de: buildSentence(rec, reasons, altTile, 'de'), en: buildSentence(rec, reasons, altTile, 'en') };
            env.state.f3 = { rec, reasons: reasons.map((x) => x.id), alt: alt ?? '', sentence: s };
            env.save();
            ctx.audio.play('stamp');
            close();
          };
          if (warned && !env.state.f2?.sturmSeen) {
            body.append(el('div', { class: 'fin-box' }, el('div', { class: 'fin-k' }, 'EMI-01'), el('p', { style: 'margin:4px 0 0;color:var(--text)' }, T(S.f3NotSeen)), el('p', { style: 'margin:4px 0 0;font-size:12.5px' }, T(S.f3Soft))));
            actions.append(
              el(
                'button',
                {
                  class: 'btn ghost',
                  onclick: () => {
                    // look at the curve, then come back to the template
                    void openResults(env, 'sturm').then(render);
                  },
                },
                T(S.f3ShowCurve),
              ),
              el('button', { class: 'btn primary', onclick: sign, disabled: !rec || !hasNumber }, T(S.f3SignAnyway)),
            );
          } else {
            actions.append(el('button', { class: 'btn ghost', onclick: () => close() }, T(S.close)), el('button', { class: 'btn primary', onclick: sign, disabled: !rec || !hasNumber }, T(S.f3Sign)));
          }
          body.append(actions);
        };
        render();
      },
      { width: 860 },
    )
    .then(() => {
      env.busy = false;
      drawLectern(env);
      env.refreshObjective();
      if (!signed || !env.state.f3) return;
      const k = env.state.f2!.tally.nn.sturm;
      const pct = Math.round((k.k / Math.max(1, k.n)) * 100);
      const r = env.state.f3.rec;
      const lines = r === 'pilot' ? [S.emiPilot(pct)] : r === 'pilotCond' ? [S.emiPilotCond] : [S.emiNoPilot, S.emiNoPilot2];
      onSigned();
      env.refreshObjective();
      // Startklar: up to the Ausguck; otherwise the island's radio names what is missing (WP12's beat)
      void env.say([...lines, ctx.quest.snapshot().armed ? S.emiUp : S.emiNotReady], 5);
    });
}
