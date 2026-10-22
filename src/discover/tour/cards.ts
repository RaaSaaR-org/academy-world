/**
 * Stop and spot cards from the generated content (WP-D1, plan §3.1, §3.3). Game-free: the 3D tour and the
 * stills tour build the same cards. Every text keeps its provenance (`from`) in content.gen.ts; a card's
 * id is its content id (`stop:<id>`, `spot:<id>`), so the tools can resolve it.
 */
import './tour.css';
import type { CardAction, CardBlock, CardSpec, TextResolver } from '../types';
import type { Text } from '@/core/types';
import { CARDS, CARD_ALIAS, TITLES, type GenCard } from '../data/content.gen';
import { S } from '../strings';
import { T } from './strings';
import { STOPS } from './stops';
import { el } from '../ui/el';

export interface ChipItem {
  label: Text;
  onSelect(): void;
}

/** the generated card behind a content id (aliases resolved) */
export function genCard(id: string): GenCard | null {
  return CARDS[CARD_ALIAS[id] ?? id] ?? null;
}

/** a spot's chip label: its card's title, or the stop's own title when the spot shows a stop's card („Grubenrand“) */
export function spotLabel(card: string): Text {
  const alias = CARD_ALIAS[card];
  if (alias?.startsWith('stop:')) return TITLES[alias.slice(5)] ?? card;
  return genCard(card)?.title ?? card;
}

/** A content card as a CardSpec, plus „Hier zu sehen“ chips and actions. */
export function contentCard(id: string, o: { chips?: ChipItem[]; actions?: CardAction[] } = {}): CardSpec | null {
  const g = genCard(id);
  if (!g) return null;
  const blocks: CardBlock[] = g.blocks.map((b) => (b.kind === 'p' ? { kind: 'p', text: b.text, chip: b.chip, src: b.src } : { kind: 'rows', rows: b.rows.map((r) => ({ label: r.label, value: r.value, chip: r.chip })) }));
  if (o.chips?.length) blocks.push({ kind: 'chips', label: S.hereToSee, items: o.chips });
  return { id, eyebrow: g.eyebrow, title: g.title, blocks, actions: o.actions?.length ? o.actions : undefined, srcLine: g.srcLine };
}

/** „Zurück“ from a spot or robot card to the stop's card */
export function backAction(onSelect: () => void): CardAction {
  return { id: 'back', label: S.prev, onSelect };
}

/** a card with a back action appended (robot cards from D2, spot cards) */
export function withBack(card: CardSpec, onBack: () => void): CardSpec {
  return { ...card, actions: [...(card.actions ?? []), backAction(onBack)] };
}

/**
 * The stop list (plan §4 accessibility): an <ol> of real buttons, the current stop aria-current="step".
 * Shown in the sheet as its own card; returns the list element to put under the card's body.
 */
export function stopListCard(t: TextResolver, current: number, go: (id: string) => void): { card: CardSpec; list: () => HTMLElement } {
  const card: CardSpec = { id: 'tour:stops', title: T.allStops, blocks: [] };
  const list = (): HTMLElement =>
    el(
      'ol',
      { class: 'dsc-stoplist' },
      STOPS.map((s, i) =>
        el(
          'li',
          null,
          el(
            'button',
            { type: 'button', class: 'dsc-stopbtn', 'data-stop': s.id, 'aria-current': i === current ? 'step' : null, onclick: () => go(s.id) },
            el('span', { class: 'dsc-stopn', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
            el('span', null, t.resolve(s.title)),
          ),
        ),
      ),
    );
  return { card, list };
}

/** Show the stop list in the sheet (and keep it there when the language changes). */
export function showStopList(sheet: { el: HTMLElement; show(c: CardSpec, s?: 'peek' | 'half' | 'full'): void; readonly card: CardSpec | null }, t: TextResolver, current: number, go: (id: string) => void): void {
  const { card, list } = stopListCard(t, current, go);
  const mount = (): void => {
    if (sheet.card !== card) return;
    sheet.el.querySelector('.dsc-card')?.append(list());
  };
  sheet.show(card, 'full');
  mount();
  const off = t.onChange(() => {
    if (sheet.card !== card) return off();
    mount();
  });
  (sheet.el.querySelector('.dsc-stopbtn[aria-current="step"]') as HTMLElement | null)?.focus({ preventScroll: true });
}
