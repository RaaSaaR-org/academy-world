/**
 * The top bar (WP-D0, plan §4): „3 / 12“ + the stop title on one line | DE · EN | the menu button.
 * 48 px inside the safe area (40 px in landscape). Game-free.
 */
import type { Lang, Text } from '@/core/types';
import type { TextResolver, TopBar } from '../types';
import { S } from '../strings';
import { el, icon } from './el';

export class TopBarImpl implements TopBar {
  readonly el: HTMLElement;
  readonly menuBtn: HTMLButtonElement;
  private readonly stepEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly langGroup: HTMLElement;
  private readonly langBtns: Record<Lang, HTMLButtonElement>;
  private step: { i: number; n: number; title: Text } | null = null;

  constructor(
    private t: TextResolver,
    o: { onLang(l: Lang): void; onMenu(): void },
  ) {
    this.stepEl = el('span', { class: 'dsc-stepn' });
    this.titleEl = el('span', { class: 'dsc-stept' });
    const lang = (l: Lang): HTMLButtonElement => el('button', { type: 'button', class: 'dsc-lang-btn', lang: l, onclick: () => o.onLang(l) }, l.toUpperCase());
    this.langBtns = { de: lang('de'), en: lang('en') };
    this.langGroup = el('div', { class: 'dsc-lang', role: 'group' }, this.langBtns.de, el('span', { class: 'dsc-dot', 'aria-hidden': 'true' }, '·'), this.langBtns.en);
    this.menuBtn = el('button', { type: 'button', class: 'dsc-menu-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: () => o.onMenu() }, icon('menu'));
    this.el = el('header', { class: 'dsc-top' }, el('div', { class: 'dsc-step' }, this.stepEl, this.titleEl), this.langGroup, this.menuBtn);
    t.onChange(() => this.render());
    this.render();
  }

  setStep(i: number, n: number, title: Text): void {
    this.step = { i, n, title };
    this.render();
  }

  private render(): void {
    const s = this.step;
    this.stepEl.textContent = s && s.n > 0 ? `${s.i} / ${s.n}` : '';
    this.stepEl.hidden = !(s && s.n > 0);
    this.titleEl.textContent = s ? this.t.resolve(s.title) : this.t.resolve(S.discover);
    this.langGroup.setAttribute('aria-label', this.t.resolve(S.language));
    for (const l of ['de', 'en'] as const) this.langBtns[l].setAttribute('aria-pressed', String(this.t.lang === l));
    this.menuBtn.setAttribute('aria-label', this.t.resolve(S.menu));
  }
}
