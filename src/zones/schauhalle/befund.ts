/**
 * Befundkarten (plan §1.4, §4.9, R4 §9): the decision-maker take-aways of the Schaufenster's three
 * Kurzlauf stands („Belohnung“, „Erntetag“, „Traumdaten“) and of the Lastenheft („Datenblatt“). Each
 * opens as a card with four lines — Messgröße, Grenze, Frage an den Anbieter, Für dein Werk — and the
 * measured numbers with their chips; each joins the player's Entscheider PNG set: kept in zoneData
 * ('befunde'), announced as 'schauhalle:befund' { id, title, rows, values } (the finale's PNG set, WP13),
 * listed by __academy.ext('befunde'), and saved as a PNG on request (a local download, nothing sent).
 */
import type { ChipType, Text, ZoneContext } from '@/core/zones';
import { el, ensureCss } from './ui';
import { zs } from './sheet';

export type BefundId = 'belohnung' | 'erntetag' | 'traumdaten' | 'datenblatt';

export interface BefundValue {
  label: Text;
  value: string;
  chip: ChipType;
}

export interface Befund {
  id: BefundId;
  title: Text;
  measure: Text;
  limit: Text;
  question: Text;
  forYou: Text;
  values: BefundValue[];
}

export interface Befunde {
  /** open the card (and put it into the set) */
  open(b: Befund): Promise<void>;
  /** in the set (ids) */
  readonly set: readonly BefundId[];
  has(id: BefundId): boolean;
}

export function buildBefunde(ctx: ZoneContext): Befunde {
  const set: BefundId[] = ctx.progress.get<BefundId[]>('befunde', []);
  const add = (b: Befund): void => {
    const resolve = (t: Text): string => ctx.i18n.resolve(t);
    if (!set.includes(b.id)) {
      set.push(b.id);
      ctx.progress.set('befunde', set.slice());
    }
    ctx.events.emit('schauhalle:befund', {
      id: b.id,
      title: resolve(b.title),
      rows: [
        { k: zs(ctx.i18n.lang, 'befund.measure'), v: resolve(b.measure) },
        { k: zs(ctx.i18n.lang, 'befund.limit'), v: resolve(b.limit) },
        { k: zs(ctx.i18n.lang, 'befund.question'), v: resolve(b.question) },
        { k: zs(ctx.i18n.lang, 'befund.forYou'), v: resolve(b.forYou) },
      ],
      values: b.values.map((v) => ({ label: resolve(v.label), value: v.value, chip: v.chip })),
    });
  };

  const png = (b: Befund): void => {
    const W = 1400,
      H = 900;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    const R = (t: Text): string => ctx.i18n.resolve(t);
    g.fillStyle = '#141414';
    g.fillRect(0, 0, W, H);
    const gr = g.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, '#FF6700');
    gr.addColorStop(1, '#2DD4BF');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, 6);
    g.fillStyle = '#A8A29E';
    g.font = "500 22px 'Geist Mono', monospace";
    g.fillText(`${zs(ctx.i18n.lang, 'befund.eyebrow')} · EmAI Academy · Schwebewerk`, 70, 80);
    g.fillStyle = '#F5F5F4';
    g.font = "700 52px 'Space Grotesk', sans-serif";
    g.fillText(R(b.title), 70, 150);
    let y = 210;
    g.font = "500 22px 'Geist Mono', monospace";
    for (const v of b.values) {
      g.fillStyle = '#F5F5F4';
      g.fillText(`${R(v.label)}: ${v.value}`, 70, y);
      g.fillStyle = '#A8A29E';
      g.fillText(`[${chipName(v.chip, ctx.i18n.lang)}]`, 70 + g.measureText(`${R(v.label)}: ${v.value}  `).width, y);
      y += 34;
    }
    y += 16;
    const rows: [string, Text][] = [
      [zs(ctx.i18n.lang, 'befund.measure'), b.measure],
      [zs(ctx.i18n.lang, 'befund.limit'), b.limit],
      [zs(ctx.i18n.lang, 'befund.question'), b.question],
      [zs(ctx.i18n.lang, 'befund.forYou'), b.forYou],
    ];
    for (const [k, t] of rows) {
      g.fillStyle = '#78716C';
      g.font = "500 20px 'Geist Mono', monospace";
      g.fillText(k.toUpperCase(), 70, y);
      g.fillStyle = '#F5F5F4';
      g.font = "400 28px 'Geist', sans-serif";
      y = wrap(g, R(t), 70, y + 38, W - 140, 36) + 22;
    }
    g.fillStyle = '#78716C';
    g.font = "500 20px 'Geist Mono', monospace";
    g.fillText(ctx.i18n.lang === 'en' ? 'Measurement, not marketing.' : 'Messung statt Marketing.', 70, H - 50);
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `emai-befund-${b.id}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  };

  return {
    async open(b) {
      add(b);
      ensureCss();
      ctx.audio.play('open', { pitch: 1.05 });
      await ctx.hud.openModal((host, close) => {
        const R = (t: Text): string => ctx.i18n.resolve(t);
        const L = ctx.i18n.lang;
        host.classList.add('befund');
        const vals = el('div', { class: 'b-row' });
        for (const v of b.values) vals.appendChild(el('div', { class: 'v line' }, `${R(v.label)}: ${v.value} `, ctx.ui.chip(v.chip)));
        const row = (k: string, t: Text): HTMLElement => el('div', { class: 'b-row' }, el('span', { class: 'k' }, k), el('div', { class: 'v' }, R(t)));
        host.replaceChildren(
          el('div', { class: 'eyebrow' }, zs(L, 'befund.eyebrow')),
          el('h2', null, R(b.title)),
          vals,
          row(zs(L, 'befund.measure'), b.measure),
          row(zs(L, 'befund.limit'), b.limit),
          row(zs(L, 'befund.question'), b.question),
          row(zs(L, 'befund.forYou'), b.forYou),
          el(
            'div',
            { class: 'btns' },
            el('button', { class: 'btn small primary', onclick: () => close() }, zs(L, 'befund.close')),
            el('button', { class: 'btn small ghost', onclick: () => png(b) }, zs(L, 'befund.png')),
            el('span', { class: 'chip' }, zs(L, 'befund.inSet')),
          ),
        );
      });
    },
    get set() {
      return set;
    },
    has: (id) => set.includes(id),
  };
}

function chipName(c: ChipType, lang: 'de' | 'en'): string {
  const map: Record<string, [string, string]> = {
    'sim-aufzeichnung': ['SIM · AUFZEICHNUNG', 'SIM · RECORDED'],
    richtwert: ['RICHTWERT', 'GUIDE VALUE'],
    fiktion: ['FIKTION', 'FICTION'],
    quelle: ['QUELLE', 'SOURCE'],
    illustrativ: ['ILLUSTRATIV', 'ILLUSTRATIVE'],
    studie: ['STUDIE', 'STUDY'],
    herstellerangabe: ['HERSTELLERANGABE', 'VENDOR SPEC'],
    modell: ['MODELL', 'MODEL'],
    sim: ['SIM · LIVE', 'SIM · LIVE'],
    traum: ['TRAUM', 'DREAM'],
  };
  const m = map[c];
  return m ? m[lang === 'en' ? 1 : 0] : c.toUpperCase();
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): number {
  let line = '';
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > maxW && line) {
      g.fillText(line, x, y);
      y += lh;
      line = w;
    } else line = t;
  }
  if (line) g.fillText(line, x, y);
  return y;
}
