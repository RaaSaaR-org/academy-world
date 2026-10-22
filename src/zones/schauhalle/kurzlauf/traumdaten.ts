/**
 * Kurzlauf „Traumdaten“ (plan §4.9, §4.8 Entscheider, D41 as amended): titled „So entsteht das
 * Flugmodell“ — the Traumhangar's three training mixes measured offline first (the error, lower looks
 * better) with the hidden fourth bar „Stillstand“ that wins offline (the trap: you are asked which mix
 * wins), then closed loop, n = 20 per mix with Wilson bands, then the Befundkarte. Data: traumdaten.json
 * from WP10's tools/traum/kurzlauf.mjs (`--out src/zones/schauhalle/kurzlauf/traumdaten.json`): offline
 * bars ILLUSTRATIV, closed-loop draws SIM · AUFZEICHNUNG, the island's Flugmodell FIKTION.
 */
import type { ChipType, Text, ZoneContext } from '@/core/zones';
import type { Befund } from '../befund';
import { bar, fitText, FONT, INK, para, screenHead, type StandDef, type StandStep } from './stand';

/** traumdaten.json — kind 'traumdaten-kurzlauf' v1 (WP10's tools/traum/kurzlauf.mjs, the hangar's own toy model) */
interface Mix {
  id: 'echt' | 'alle' | 'geprueft' | 'stillstand';
  label: { de: string; en: string };
  offline: number;
  hidden?: boolean;
  /** p, lo, hi in percent (Wilson) */
  closed: { k: number; n: number; p: number; lo: number; hi: number; lanes: boolean[] };
}
interface Traum {
  kind: 'traumdaten-kurzlauf';
  version: 1;
  chips: { offline: ChipType; closed: ChipType; flugmodell: ChipType; dream: ChipType };
  beats: { t0: number; t1: number; id: string; caption: { de: string; en: string } }[];
  mixes: Mix[];
  offlineWinner: Mix['id'];
  closedWinner: Mix['id'];
  installed: { mix: Mix['id']; label: { de: string; en: string }; pp: number; lo: number; hi: number; n: number };
  horizon: { rows: { horizon: number; k: number; n: number }[]; best: number };
  befund: { messgroesse: Text; grenze: Text; frage: { de: string; en: string }; folgefragen: { de: string; en: string }[]; fuerDeinWerk: Text };
}

export function traumdaten(ctx: ZoneContext): StandDef {
  let D: Traum | null = null;
  const L = (): 'de' | 'en' => ctx.i18n.lang;
  const num = (v: number, d = 2): string => (L() === 'de' ? v.toFixed(d).replace('.', ',') : v.toFixed(d));
  const chip = (): ChipType => D?.chips.closed ?? 'sim-aufzeichnung';
  const chipText = (kind: 'offline' | 'closed' = 'closed'): string => (kind === 'offline' ? (L() === 'en' ? 'ILLUSTRATIVE' : 'ILLUSTRATIV') : L() === 'en' ? 'SIM · RECORDED' : 'SIM · AUFZEICHNUNG');
  const eyebrow = (): string => (L() === 'en' ? '// SHOP WINDOW · SHORT RUN 3' : '// SCHAUFENSTER · KURZLAUF 3');
  const title = (): string => (L() === 'en' ? 'How the flight model is made' : 'So entsteht das Flugmodell');
  const mixes = (): Mix[] => D!.mixes;
  const mix = (id: Mix['id']): Mix => D!.mixes.find((m) => m.id === id)!;
  const beat = (id: string): { de: string; en: string } => D!.beats.find((b) => b.id === id)?.caption ?? { de: '', en: '' };
  const both = (...ids: string[]): Text => ({ de: ids.map((i) => beat(i).de).join(' '), en: ids.map((i) => beat(i).en).join(' ') });
  const colour = (m: Mix): string => (m.id === D!.offlineWinner ? INK.amber : m.id === D!.closedWinner ? INK.teal : INK.text2);

  const offline = (g: CanvasRenderingContext2D, w: number, h: number, k: number, trap: boolean): void => {
    screenHead(g, w, h, eyebrow(), L() === 'en' ? 'Offline: prediction error (lower looks better)' : 'Offline: Vorhersagefehler (kleiner sieht besser aus)', chipText('offline'));
    const list = mixes().filter((m) => trap || !m.hidden);
    const max = Math.max(...mixes().map((m) => m.offline));
    list.forEach((m, i) => bar(g, 22, 110 + i * 44, w - 44, m.label[L()], (m.offline / max) * Math.min(1, k * 1.4), num(m.offline), colour(m)));
  };

  const steps = (): StandStep[] => [
    {
      // the hangar's own script (WP10's beats): the dreams, then the check
      text: both('traeume', 'pruefen'),
      seconds: 0,
      draw(g, w, h) {
        screenHead(g, w, h, eyebrow(), title(), chipText());
        para(g, L() === 'en' ? 'Three training mixes: real only, real + all dreams, real + checked dreams. First offline, then on the robot in a closed loop.' : 'Drei Trainingsmischungen: nur echt, echt + alle Träume, echt + geprüfte Träume. Erst offline, dann am Roboter im geschlossenen Lauf.', 22, 100, w - 44, 19, 26, INK.text);
      },
    },
    {
      text: { de: 'Erst offline. Eine vierte Mischung taucht auf. Welche gewinnt?', en: 'Offline first. A fourth mix shows up. Which one wins?' },
      button: { de: 'Offline messen', en: 'Measure offline' },
      seconds: 4,
      draw: (g, w, h, k) => offline(g, w, h, k, k > 0.6),
      ask: mixes().map((m) => ({ label: (lang: 'de' | 'en') => m.label[lang], right: m.id === D!.offlineWinner || undefined })),
    },
    {
      text: { de: `${beat('stillstand').de.replace(/^[^.]*\.\s*/, '')} ${beat('geschlossen').de}`, en: `${beat('stillstand').en.replace(/^[^.]*\.\s*/, '')} ${beat('geschlossen').en}` },
      button: { de: 'Im geschlossenen Lauf messen', en: 'Measure closed loop' },
      seconds: 6,
      draw(g, w, h, k) {
        const n = mixes()[0].closed.n;
        screenHead(g, w, h, eyebrow(), L() === 'en' ? `Closed loop: success, n = ${n} each` : `Geschlossener Lauf: Erfolg, je n = ${n}`, chipText());
        mixes().forEach((m, i) => {
          const c = m.closed;
          const show = Math.min(1, k * 1.3);
          bar(g, 22, 110 + i * 44, w - 44, m.label[L()], (c.p / 100) * show, `${c.k}/${c.n} · ${Math.round(c.p)} % [${Math.round(c.lo)}–${Math.round(c.hi)}]`, colour(m), show >= 1 ? [c.lo / 100, c.hi / 100] : undefined);
        });
        const I = D!.installed;
        if (k >= 1) fitText(g, `${L() === 'en' ? 'FLIGHT MODEL' : 'FLUGMODELL'} · ${I.label[L()]} · +${I.pp} pp [${I.lo}, ${I.hi}] · ${L() === 'en' ? 'FICTION' : 'FIKTION'}`, 22, h - 18, w - 44, 15, (px) => FONT.mono(px, 500), INK.text2);
      },
    },
  ];

  const befund = (): Befund => {
    const best = mix(D!.closedWinner);
    const real = mix('echt');
    const trap = mix(D!.offlineWinner);
    const I = D!.installed;
    const H = D!.horizon;
    const hb = H.rows.find((r) => r.horizon === H.best);
    const rate = (m: Mix): string => `${m.closed.k}/${m.closed.n} · ${Math.round(m.closed.p)} % [${Math.round(m.closed.lo)}–${Math.round(m.closed.hi)}]`;
    const B = D!.befund;
    return {
      id: 'traumdaten',
      title: { de: 'Traumdaten: So entsteht das Flugmodell', en: 'Dream data: how the flight model is made' },
      // the card's text as WP10's generator writes it (the hangar's own Befund)
      measure: B.messgroesse,
      limit: B.grenze,
      question: { de: `${B.frage.de} ${B.folgefragen[0]?.de ?? ''}`.trim(), en: `${B.frage.en} ${B.folgefragen[0]?.en ?? ''}`.trim() },
      forYou: B.fuerDeinWerk,
      values: [
        { label: best.label, value: `${rate(best)} · +${I.pp} pp [${I.lo}, ${I.hi}]`, chip: D!.chips.closed },
        { label: real.label, value: rate(real), chip: D!.chips.closed },
        { label: { de: 'Offline hätte gewonnen', en: 'Offline would have won' }, value: `${trap.label[L()]} (${num(trap.offline)})`, chip: D!.chips.offline },
        ...(hb ? [{ label: { de: 'Bester Horizont', en: 'Best horizon' }, value: `${num(hb.horizon, hb.horizon % 1 ? 1 : 0)} s · ${hb.k}/${hb.n}`, chip: D!.chips.closed }] : []),
      ],
    };
  };

  return {
    key: 'traumdaten',
    eyebrow: (lang) => (lang === 'en' ? '// SHOP WINDOW · SHORT RUN 3' : '// SCHAUFENSTER · KURZLAUF 3'),
    title: { de: 'So entsteht das Flugmodell', en: 'How the flight model is made' },
    chip,
    async load() {
      D = (await import('./traumdaten.json')).default as unknown as Traum;
    },
    steps,
    befund,
    idle(g, w, h) {
      screenHead(g, w, h, eyebrow(), title(), D ? chipText() : '');
      para(g, L() === 'en' ? 'The Dream Hangar’s data trap: good offline is not good.' : 'Die Datenfalle des Traumhangars: offline gut heißt nicht gut.', 22, 100, w - 44, 22, 28, INK.text);
      fitText(g, '[E]', 22, h - 22, 80, 18, (px) => FONT.mono(px, 600), INK.teal);
    },
  };
}
