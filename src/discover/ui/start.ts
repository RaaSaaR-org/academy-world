/**
 * The start card (WP-D0): over the slow orbit (3D) or the first still. Wordmark, eyebrow, title, the
 * game's line about this island, the laptop note, „Los“ (and „Messen“ with ?bench=1). A region with
 * a heading; „Los“ takes the focus. Game-free.
 */
import type { Text } from '@/core/types';
import type { TextResolver } from '../types';
import { S } from '../strings';
import { el } from './el';

export interface StartCard {
  readonly el: HTMLElement;
  hide(): void;
  readonly shown: boolean;
}

export function startCard(
  parent: HTMLElement,
  t: TextResolver,
  o: { eyebrow: Text; title: Text; body?: Text; note?: Text; onGo(): void; onBench?: () => void; onLaptop?: () => void },
): StartCard {
  const h1 = el('h1', { id: 'dsc-start-title' });
  const eyebrow = el('div', { class: 'eyebrow' });
  const body = el('p');
  const note = el('p', { class: 'dsc-note' });
  const go = el('button', { type: 'button', class: 'dsc-btn primary dsc-go', 'data-action': 'go' });
  const bench = o.onBench ? el('button', { type: 'button', class: 'dsc-btn', 'data-action': 'bench' }) : null;
  const laptop = o.onLaptop ? el('button', { type: 'button', class: 'dsc-btn', 'data-action': 'laptop' }) : null;
  const root = el(
    'section',
    { class: 'dsc-start hairline', role: 'region', 'aria-labelledby': 'dsc-start-title' },
    el('div', { class: 'dsc-wm', 'aria-hidden': 'true' }, 'Em', el('b', null, 'AI'), el('span', null, ' Academy')),
    eyebrow,
    h1,
    o.body ? body : null,
    o.note ? note : null,
    el('div', { class: 'dsc-actions' }, go, bench, laptop),
  );
  let shown = true;
  const render = (): void => {
    eyebrow.textContent = t.resolve(o.eyebrow);
    h1.textContent = t.resolve(o.title);
    body.textContent = t.resolve(o.body);
    note.textContent = t.resolve(o.note);
    go.textContent = t.resolve(S.go);
    if (bench) bench.textContent = t.resolve(S.measure);
    if (laptop) laptop.textContent = t.resolve(S.playOnLaptop);
  };
  t.onChange(render);
  render();
  go.addEventListener('click', () => o.onGo());
  bench?.addEventListener('click', () => o.onBench?.());
  laptop?.addEventListener('click', () => o.onLaptop?.());
  parent.append(root);
  window.setTimeout(() => go.focus({ preventScroll: true }), 0);
  return {
    el: root,
    get shown() {
      return shown;
    },
    hide() {
      shown = false;
      root.hidden = true;
    },
  };
}

/** The probe's offer (p90 > 50 ms): a line under the top bar with the switch and a close button. */
export function offerBar(parent: HTMLElement, t: TextResolver, onSwitch: () => void): HTMLElement {
  const txt = el('span');
  const btn = el('button', { type: 'button', class: 'dsc-btn primary', 'data-action': 'stills' });
  const x = el('button', { type: 'button', class: 'dsc-x' }, '×');
  const bar = el('div', { class: 'dsc-offer', role: 'region' }, txt, btn, x);
  const render = (): void => {
    txt.textContent = t.resolve(S.stillsOffer);
    btn.textContent = t.resolve(S.stillsTour);
    x.setAttribute('aria-label', t.resolve(S.close));
    bar.setAttribute('aria-label', t.resolve(S.stillsTour));
  };
  t.onChange(render);
  render();
  btn.addEventListener('click', onSwitch);
  x.addEventListener('click', () => bar.remove());
  parent.append(bar);
  return bar;
}
