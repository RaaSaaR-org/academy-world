/**
 * Renders a CardSpec (WP-D0) into the sheet: eyebrow, title, blocks (paragraphs with their chip and
 * source, rows, tappable chips), actions and the source line. Game-free (the stills path uses it too).
 */
import type { Text } from '@/core/types';
import type { CardBlock, CardSpec, ChipType, TextResolver } from '../types';
import { el } from './el';

/**
 * The chip labels, as src/ui/Kit.ts CHIP_LABELS plus the chips WP1 registers there (the same `.chip
 * chip-<type>` contract). A copy, because Kit imports three: tools/discover/i18n.mjs compares the two.
 */
export const CHIP_TEXT: Record<string, { de: string; en: string }> = {
  sim: { de: 'SIM · LIVE', en: 'SIM · LIVE' },
  studie: { de: 'STUDIE', en: 'STUDY' },
  quelle: { de: 'QUELLE', en: 'SOURCE' },
  richtwert: { de: 'RICHTWERT', en: 'GUIDE VALUE' },
  illustrativ: { de: 'ILLUSTRATIV', en: 'ILLUSTRATIVE' },
  fiktion: { de: 'FIKTION', en: 'FICTION' },
  herstellerangabe: { de: 'HERSTELLERANGABE', en: 'VENDOR SPEC' },
  modell: { de: 'MODELL', en: 'MODEL' },
  'sim-aufzeichnung': { de: 'SIM · AUFZEICHNUNG', en: 'SIM · RECORDED' },
  traum: { de: 'TRAUM', en: 'DREAM' },
};

export function chipEl(t: TextResolver, type: ChipType, src?: Text): HTMLElement {
  const c = el('span', { class: `chip chip-${type}` }, t.resolve(CHIP_TEXT[type] ?? type.toUpperCase()));
  if (src) c.title = t.resolve(src);
  return c;
}

function block(t: TextResolver, b: CardBlock): HTMLElement {
  if (b.kind === 'p') {
    const p = el('p', { class: 'dsc-p' }, b.chip ? chipEl(t, b.chip, b.src) : null, b.chip ? ' ' : null, t.resolve(b.text));
    if (!b.src) return p;
    return el('div', { class: 'dsc-pb' }, p, el('p', { class: 'dsc-psrc' }, t.resolve(b.src)));
  }
  if (b.kind === 'rows') {
    return el(
      'dl',
      { class: 'dsc-rows' },
      b.rows.map((r) =>
        el(
          'div',
          { class: 'dsc-row' },
          el('dt', null, t.resolve(r.label)),
          el('dd', null, r.value == null ? '–' : t.resolve(r.value), r.chip ? ' ' : null, r.chip ? chipEl(t, r.chip) : null, r.cond ? el('span', { class: 'dsc-cond' }, t.resolve(r.cond)) : null),
        ),
      ),
    );
  }
  const wrap = el('div', { class: 'dsc-chips' });
  if (b.label) wrap.append(el('div', { class: 'dsc-chips-label eyebrow' }, t.resolve(b.label)));
  const list = el('div', { class: 'dsc-chips-list' });
  for (const it of b.items) list.append(el('button', { type: 'button', class: 'dsc-chipbtn', onclick: () => it.onSelect() }, t.resolve(it.label)));
  wrap.append(list);
  return wrap;
}

/** The card's header (eyebrow, title) and body (blocks, actions, source line) as separate nodes. */
export function renderCard(t: TextResolver, card: CardSpec, titleId: string): { head: HTMLElement; body: HTMLElement } {
  const head = el('div', { class: 'dsc-headtxt' }, card.eyebrow ? el('div', { class: 'eyebrow' }, t.resolve(card.eyebrow)) : null, el('h2', { id: titleId, class: 'dsc-title' }, t.resolve(card.title)));
  const body = el('div', { class: 'dsc-card' });
  for (const b of card.blocks) body.append(block(t, b));
  if (card.actions?.length) {
    const row = el('div', { class: 'dsc-actions' });
    for (const a of card.actions) row.append(el('button', { type: 'button', class: `dsc-btn${a.primary ? ' primary' : ''}`, 'data-action': a.id, onclick: () => a.onSelect() }, t.resolve(a.label)));
    body.append(row);
  }
  if (card.srcLine) body.append(el('p', { class: 'dsc-src' }, t.resolve(card.srcLine)));
  return { head, body };
}

/** Words a card shows at half height (the blocks' text; text-audit's console rule: ≤ 35). */
export function cardWords(t: TextResolver, card: CardSpec): number {
  let s = '';
  for (const b of card.blocks) if (b.kind === 'p') s += ' ' + t.resolve(b.text);
  return s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
