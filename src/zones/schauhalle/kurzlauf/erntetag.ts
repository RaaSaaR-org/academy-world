/**
 * Kurzlauf „Erntetag“ (plan §4.9, §1.4, D23, D41 as amended): titled „So lädt die Bodencrew den
 * Startakku“ — the Sonnenacker's automated day at 8× (≤ 10 s) with the dashboard's kWh (RICHTWERT) and
 * the Startakku bar (FIKTION) filling, then the result beside the research mean (66 %, 33 s, Bac et al.
 * 2014, QUELLE) and its Befundkarte. Data: erntetag.json, written by WP9's tools/sonnenacker/kurzlauf.mjs
 * (format 'EKZL' v1: `node tools/sonnenacker/kurzlauf.mjs --out src/zones/schauhalle/kurzlauf/erntetag.json`).
 */
import type { ChipType, Text, ZoneContext } from '@/core/zones';
import type { Befund } from '../befund';
import { bar, fitText, FONT, INK, para, screenHead, type StandDef, type StandStep } from './stand';

/** erntetag.json — format 'EKZL' v1 (WP9's tools/sonnenacker/kurzlauf.mjs, the station's own model) */
interface Day {
  format: 'EKZL';
  version: 1;
  chips: { harvest: ChipType; energy: ChipType; akku: ChipType; research: ChipType };
  /** the day on the stand: [startS, endS] (stand seconds), at `speed`× */
  stand: { seconds: number; speed: number; day: [number, number]; befundAt: number };
  day: { seconds1x: number; clock: [number, number] };
  /** 10 Hz over the day on the stand */
  samples: { hz: number; t: number[]; clock: number[]; kwh: number[]; akku: number[]; k: number[]; done: number[] };
  calls: { t: number; kind: 'jam' | 'stem' | 'tray' | 'bees'; answeredAfterS: number | null; inTime: boolean }[];
  result: { k: number; n: number; rate: number; lo: number; hi: number; damaged: number; cycleMedianS: number; calls: number; callsInTime: number; kwh: number; kwhUsed: number };
  research: { success: number; cycleS: number; source: string };
  befund: { grenze: Text; frage: Text; fuerDeinWerk: Text };
}

/** the calls for help of the day (plan §4.10 C: a jammed gripper, fruit behind a stem, a tray on the path, the bumblebee box) */
const CALLS: Record<Day['calls'][number]['kind'], Text> = {
  jam: { de: 'Hilferuf: Ein Greifer klemmt.', en: 'Call for help: a gripper is jammed.' },
  stem: { de: 'Hilferuf: Eine Frucht hängt hinter dem Stängel.', en: 'Call for help: a fruit hangs behind the stem.' },
  tray: { de: 'Hilferuf: Eine Kiste liegt auf dem Weg.', en: 'Call for help: a tray lies on the path.' },
  bees: { de: 'Hilferuf: Ein Hummelkasten steht im Weg.', en: 'Call for help: a bumblebee box is in the way.' },
};

export function erntetag(ctx: ZoneContext): StandDef {
  let D: Day | null = null;
  const L = (): 'de' | 'en' => ctx.i18n.lang;
  const num = (v: number, d = 0): string => (L() === 'de' ? v.toFixed(d).replace('.', ',') : v.toFixed(d));
  const harvestChip = (): ChipType => D?.chips.harvest ?? 'sim-aufzeichnung';
  const chipText = (): string => (L() === 'en' ? 'SIM · RECORDED' : 'SIM · AUFZEICHNUNG');
  const eyebrow = (): string => (L() === 'en' ? '// SHOP WINDOW · SHORT RUN 2' : '// SCHAUFENSTER · KURZLAUF 2');
  const title = (): string => (L() === 'en' ? 'How the ground crew charges the start battery' : 'So lädt die Bodencrew den Startakku');
  /** the recording at k ∈ [0, 1] of the day on the stand (linear between the 10 Hz samples) */
  const at = (k: number): { clock: number; k: number; kwh: number; akku: number; calls: number } => {
    const S = D!.samples;
    const [d0, d1] = D!.stand.day;
    const t = d0 + (d1 - d0) * Math.max(0, Math.min(1, k));
    const x = Math.max(0, Math.min(S.t.length - 1, (t - S.t[0]) * S.hz));
    const i = Math.min(S.t.length - 2, Math.floor(x));
    const f = x - i;
    const lerp = (a: number[]): number => a[i] + (a[i + 1] - a[i]) * f;
    return { clock: lerp(S.clock), k: f < 1 ? S.k[i] : S.k[i + 1], kwh: lerp(S.kwh), akku: lerp(S.akku), calls: D!.calls.filter((c) => c.t <= t).length };
  };
  /** „Bac et al. 2014“ from the generator's full reference */
  const refShort = (): string => {
    const src = D!.research.source;
    const y = src.match(/\b(19|20)\d\d\b/)?.[0] ?? '';
    return `${src.split(',')[0]} et al. ${y}`.trim();
  };
  const clock = (t: number): string => `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor((t % 1) * 60)).padStart(2, '0')}`;

  const dash = (g: CanvasRenderingContext2D, w: number, h: number, k: number): void => {
    const s = at(k);
    const r = D!.result;
    screenHead(g, w, h, eyebrow(), title(), chipText());
    fitText(g, `${clock(s.clock)} · ${D!.stand.speed}×`, w - 22, h - 18, 200, 18, (px) => FONT.mono(px, 600), INK.text, 'right');
    bar(g, 22, 114, w - 44, L() === 'en' ? 'tomatoes picked' : 'Tomaten gepflückt', s.k / r.n, `${s.k} / ${r.n}`, '#B5332A');
    bar(g, 22, 162, w - 44, `kWh · ${L() === 'en' ? 'GUIDE VALUE' : 'RICHTWERT'}`, s.kwh / r.kwh, `${num(s.kwh)} kWh`, INK.teal);
    bar(g, 22, 210, w - 44, `${L() === 'en' ? 'START BATTERY' : 'STARTAKKU'} · ${L() === 'en' ? 'FICTION' : 'FIKTION'}`, s.akku, `${Math.round(s.akku * 100)} %`, s.akku >= 0.999 ? INK.teal : INK.amber);
    fitText(g, `${L() === 'en' ? 'calls for help' : 'Hilferufe'}: ${s.calls}`, 22, h - 18, 300, 15, (px) => FONT.mono(px, 500), INK.text2);
  };

  const steps = (): StandStep[] => [
    {
      text: { de: 'Ein automatischer Tag auf dem Sonnenacker: zwölf Arme pflücken, das Dach erntet Strom.', en: 'An automated day on the Sun Field: twelve arms pick, the roof harvests power.' },
      seconds: 0,
      draw(g, w, h) {
        screenHead(g, w, h, eyebrow(), title(), chipText());
        para(g, L() === 'en' ? 'Tomatoes and power from the same field: the start battery belongs to the island (fiction), the kWh are a guide value for this roof.' : 'Tomaten und Strom vom selben Acker: Der Startakku gehört zur erfundenen Insel, die kWh sind ein Richtwert für dieses Dach.', 22, 100, w - 44, 19, 26, INK.text);
      },
    },
    {
      text: { de: 'Der Tag läuft achtfach schnell. Achte auf die Hilferufe: Menschen lösen Staus.', en: 'The day runs eight times as fast. Watch the calls for help: people clear the jams.' },
      button: { de: 'Erntetag starten', en: 'Start the harvest day' },
      seconds: D!.stand.day[1] - D!.stand.day[0],
      draw: dash,
      // the calls for help stop the day until you send someone (plan §4.10 C: people clear the jams)
      pauses: D!.calls.map((c) => ({ at: (c.t - D!.stand.day[0]) / (D!.stand.day[1] - D!.stand.day[0]), text: CALLS[c.kind], button: { de: 'Hilfe schicken', en: 'Send help' } })),
    },
    {
      text: { de: 'Daneben das Forschungsmittel: Hier ist das Beet für den Roboter gebaut.', en: 'Next to it the research mean: here the bed is built for the robot.' },
      button: { de: 'Ergebnis', en: 'Result' },
      seconds: 0,
      draw(g, w, h) {
        const r = D!.result;
        screenHead(g, w, h, eyebrow(), L() === 'en' ? 'The day in numbers' : 'Der Tag in Zahlen', chipText());
        bar(g, 22, 120, w - 44, `${L() === 'en' ? 'here' : 'hier'} · ${chipText()}`, r.rate, `${r.k}/${r.n} · ${Math.round(r.rate * 100)} % [${Math.round(r.lo * 100)}–${Math.round(r.hi * 100)}] · Ø ${num(r.cycleMedianS)} s`, INK.teal, [r.lo, r.hi]);
        bar(g, 22, 176, w - 44, `${L() === 'en' ? 'research mean' : 'Forschungsmittel'} · ${L() === 'en' ? 'SOURCE' : 'QUELLE'}`, D!.research.success, `${Math.round(D!.research.success * 100)} % · ${D!.research.cycleS} s · ${refShort()}`, INK.text2);
        fitText(g, `${r.kwh} kWh ${L() === 'en' ? 'made' : 'erzeugt'}, ≤ ${r.kwhUsed} kWh ${L() === 'en' ? 'used' : 'verbraucht'} · ${L() === 'en' ? 'GUIDE VALUE' : 'RICHTWERT'} · ${r.calls} ${L() === 'en' ? 'calls for help' : 'Hilferufe'}`, 22, h - 20, w - 44, 15, (px) => FONT.mono(px, 500), INK.text2);
      },
    },
  ];

  const befund = (): Befund => {
    const r = D!.result;
    const B = D!.befund;
    return {
      id: 'erntetag',
      title: { de: 'Erntetag: So lädt die Bodencrew den Startakku', en: 'Harvest day: how the ground crew charges the start battery' },
      measure: { de: 'Erfolg pro Frucht mit Wilson-Intervall und Zykluszeit, neben dem Forschungsmittel.', en: 'Success per fruit with a Wilson interval and the cycle time, next to the research mean.' },
      // the card's limit, question and advice as WP9's generator writes them (the station's own Befund)
      limit: B.grenze,
      question: B.frage,
      forYou: B.fuerDeinWerk,
      values: [
        { label: { de: 'Ernte', en: 'Harvest' }, value: `${r.k}/${r.n} · ${Math.round(r.rate * 100)} % [${Math.round(r.lo * 100)}–${Math.round(r.hi * 100)}] · Ø ${num(r.cycleMedianS)} s · ${r.calls} ${L() === 'en' ? 'calls for help' : 'Hilferufe'}`, chip: harvestChip() },
        { label: { de: 'Strom', en: 'Power' }, value: `${r.kwh} kWh ${L() === 'en' ? 'made' : 'erzeugt'}, ≤ ${r.kwhUsed} kWh ${L() === 'en' ? 'used' : 'verbraucht'}`, chip: D!.chips.energy },
        { label: { de: 'Forschungsmittel', en: 'Research mean' }, value: `${Math.round(D!.research.success * 100)} % · ${D!.research.cycleS} s (${refShort()})`, chip: D!.chips.research },
      ],
    };
  };

  return {
    key: 'erntetag',
    eyebrow: (lang) => (lang === 'en' ? '// SHOP WINDOW · SHORT RUN 2' : '// SCHAUFENSTER · KURZLAUF 2'),
    title: { de: 'So lädt die Bodencrew den Startakku', en: 'How the ground crew charges the start battery' },
    chip: harvestChip,
    async load() {
      D = (await import('./erntetag.json')).default as unknown as Day;
    },
    steps,
    befund,
    idle(g, w, h) {
      screenHead(g, w, h, eyebrow(), title(), D ? chipText() : '');
      para(g, L() === 'en' ? 'The Sun Field’s automated day: tomatoes and power from one roof.' : 'Der automatische Tag des Sonnenackers: Tomaten und Strom von einem Dach.', 22, 100, w - 44, 22, 28, INK.text);
      fitText(g, '[E]', 22, h - 22, 80, 18, (px) => FONT.mono(px, 600), INK.teal);
      void num;
    },
  };
}
