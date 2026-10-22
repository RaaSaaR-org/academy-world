import type { Lang, Text, ZoneContext } from '@/core/zones';
import type { QuestSnapshot } from '@/core/quest/types';
import { passSnapshot, zoneValue } from '@/core/quest/values';
import { AREA_MANIFESTS } from '@/core/zones/ZoneManager';
import type { PanelHandle } from '@/ui/Hud';
import { TRIMS, ZONE_PLOTS } from '../../layout';
import { el } from '../dom';
import { AUSGUCK } from '../tuning';
import type { Recommendation } from '../types';
import { L } from './strings';

/**
 * The checklist card „Startfreigabe“ in three blocks (plan §4.14 „After F3“, §4.15 spin-up): shown in
 * the ride KIEL → AUSGUCK and through the spin-up, where its lines tick block by block. AUFTRIEB: M1–M6
 * with your ◆ value (values.ts zoneValue) or „Bodencrew · ohne Kennlinie“; ENERGIE: „Startakku 100 % ·
 * {Erntetag}“ or „von der Bodencrew bereitgestellt“; NAVIGATION: „Flugmodell: {Traumdaten}“ or the
 * crew line; then the trims („T3 aus · Sonnenacker“ for a missing one), the Regelkern (your F3
 * controller) and „Startplatz frei“. The island's numbers are FIKTION (the chip in the head).
 */
export type Block = 'lift' | 'energy' | 'nav' | 'trim' | 'core';

interface Line {
  block: Block;
  text: (lang: Lang) => string;
  ready: boolean;
}

export interface Checklist {
  show(): void;
  hide(): void;
  /** tick the lines of a block (the spin-up order: lift, energy, nav, trim, core) */
  tick(block: Block): void;
  /** recompute the lines (state or language changed) */
  refresh(): void;
  readonly shown: boolean;
  /** the lines as text (tools) */
  lines(lang: Lang): string[];
}

/** a long measured value, cut on a word for the card (the Pass and the certificate keep it whole) */
function cut(s: string): string {
  const max = AUSGUCK.checkValueMax;
  if (s.length <= max) return s;
  const head = s.slice(0, max - 1);
  const sp = head.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? head.slice(0, sp) : head).replace(/[\s·:,]+$/, '')} …`;
}

export function buildChecklist(ctx: ZoneContext, rec: () => Recommendation | null): Checklist {
  const T = (t: Text): string => ctx.i18n.resolve(t);
  const pick = (t: { de: string; en: string }, lang: Lang): string => (lang === 'de' ? t.de : t.en);
  let panel: PanelHandle | null = null;
  const ticked = new Set<Block>();

  const build = (snap: QuestSnapshot): Line[] => {
    const view = passSnapshot(ctx, { scope: 'all', manifests: [...AREA_MANIFESTS.values()] });
    const crewOf = (id: string): boolean => snap.groundCrew.some((c) => c.id === id);
    const out: Line[] = [];
    ZONE_PLOTS.forEach((z, i) => {
      const id = `M${i + 1}`;
      const v = zoneValue(view, z.id);
      const st = snap.systems[id as 'M1'];
      const ready = st === 'bereit' || st === 'geprueft';
      out.push({
        block: 'lift',
        ready,
        text: (lang) => {
          const head = `${id} · ${pick(z.name, lang)}`;
          if (crewOf(id) && ready) return `${head} · ${pick(L.crewRotor, lang)}`;
          if (v) return `${head} · ${cut(`${v.title}: ${v.value}`)}`;
          return `${head} · ${pick(ready ? L.ready : L.open, lang)}`;
        },
      });
    });
    const e = snap.start.energy;
    const eReady = e.state === 'bereit' || e.state === 'geprueft';
    const acker = zoneValue(view, 'sonnenacker');
    out.push({
      block: 'energy',
      ready: eReady,
      text: (lang) => (e.by === 'crew' ? `${pick(L.akku, lang)} · ${pick(L.crewSupplied, lang)}` : eReady ? `${pick(L.akkuFull, lang)}${acker ? ` · ${cut(acker.value)}` : ''}` : `${pick(L.akku, lang)} · ${pick(L.open, lang)}`),
    });
    const n = snap.start.nav;
    const nReady = n.state === 'bereit' || n.state === 'geprueft';
    const traum = zoneValue(view, 'traumhangar');
    out.push({
      block: 'nav',
      ready: nReady,
      text: (lang) => (n.by === 'crew' ? `${pick(L.model, lang)} · ${pick(L.crewSupplied, lang)}` : nReady ? `${pick(L.model, lang)}: ${traum ? cut(traum.value) : '✓'}` : `${pick(L.model, lang)} · ${pick(L.open, lang)}`),
    });
    // the trims, two to a line: „T1 · Kreislaufhof   T3 aus · Sonnenacker“ (a missing trim leaves its gap in the chord)
    const trims = TRIMS.map((t) => {
      const on = snap.systems[t.id] === 'an';
      const site = AREA_MANIFESTS.get(t.site);
      const name = site ? site.title : { de: t.site, en: t.site };
      return { on, text: (lang: Lang): string => `${t.id}${on ? '' : ` ${pick(L.trimOff, lang)}`} · ${pick(name, lang)}` };
    });
    for (let i = 0; i < trims.length; i += 2) {
      const pair = trims.slice(i, i + 2);
      out.push({ block: 'trim', ready: pair.some((t) => t.on), text: (lang) => pair.map((t) => t.text(lang)).join('   ') });
    }
    const r = rec() ?? 'none';
    out.push({ block: 'core', ready: true, text: (lang) => `${pick(L.core, lang)}: ${pick(L.ctrl[r], lang)}` });
    out.push({ block: 'core', ready: true, text: (lang) => pick(L.padFree, lang) });
    return out;
  };

  const BLOCKS: { id: Block; title: Text }[] = [
    { id: 'lift', title: L.blockLift },
    { id: 'energy', title: L.blockEnergy },
    { id: 'nav', title: L.blockNav },
    { id: 'trim', title: L.blockTrim },
    { id: 'core', title: { de: '', en: '' } },
  ];

  const render = (): void => {
    if (!panel) return;
    const lang = ctx.lang;
    const lines = build(ctx.quest.snapshot());
    const body = el('div', { class: 'lo-check' });
    for (const b of BLOCKS) {
      const mine = lines.filter((l) => l.block === b.id);
      if (!mine.length) continue;
      const t = T(b.title);
      if (t) body.append(el('div', { class: 'lo-check-h' }, t));
      for (const l of mine) {
        const done = ticked.has(b.id);
        const mark = done ? (l.ready ? '✓' : '–') : '·';
        body.append(el('div', { class: `lo-check-l${done && l.ready ? ' ok' : ''}${l.ready ? '' : ' off'}` }, el('span', { class: 'm' }, mark), el('span', null, l.text(lang))));
      }
    }
    panel.el.replaceChildren(el('div', { class: 'lo-head' }, el('div', { class: 'eyebrow' }, T(L.checkHead)), ctx.ui.chip('fiktion', L.fiction)), body);
  };
  if (!document.getElementById('style-wp13-check')) {
    const s = document.createElement('style');
    s.id = 'style-wp13-check';
    s.textContent = `
#hud .lo-checkcard { width: min(340px, calc(100vw - 48px)); }
#hud .lo-checkcard .lo-head { display: flex; justify-content: space-between; gap: 8px; align-items: center; margin-bottom: 4px; }
#hud .lo-check { font-family: var(--font-mono); font-size: 11.5px; line-height: 1.45; color: var(--text-2); }
#hud .lo-check-h { color: var(--text-3); font-size: 10.5px; letter-spacing: 0.12em; margin-top: 6px; }
#hud .lo-check-l { display: grid; grid-template-columns: 14px 1fr; gap: 4px; }
#hud .lo-check-l .m { color: var(--text-3); }
#hud .lo-check-l.ok { color: var(--text); }
#hud .lo-check-l.ok .m { color: var(--teal); }
#hud .lo-check-l.off { color: var(--text-3); }
`;
    document.head.append(s);
  }
  ctx.i18n.onChange(() => render());

  return {
    show() {
      if (panel) return render();
      panel = ctx.hud.panel({});
      panel.el.classList.add('lo-checkcard');
      ticked.clear();
      render();
    },
    hide() {
      panel?.remove();
      panel = null;
    },
    tick(block) {
      ticked.add(block);
      render();
    },
    refresh: () => render(),
    get shown() {
      return !!panel;
    },
    lines: (lang) => build(ctx.quest.snapshot()).map((l) => l.text(lang)),
  };
}
