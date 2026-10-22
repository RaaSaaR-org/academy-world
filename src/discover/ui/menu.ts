/**
 * The ⋯ menu (WP-D0, plan §4): reduced motion, sound, „Am Laptop spielen“, „Credits & Lizenzen“,
 * „Messen“ (with ?perf=1) and what the packages add. Real buttons (menuitem / menuitemcheckbox), Esc
 * and a tap outside close it, focus returns to the menu button. Game-free.
 */
import type { Menu, MenuItem, TextResolver } from '../types';
import { S } from '../strings';
import { el } from './el';

export class MenuImpl implements Menu {
  readonly el: HTMLElement;
  isOpen = false;
  private readonly items = new Map<string, MenuItem>();

  constructor(
    private t: TextResolver,
    private anchor: HTMLButtonElement,
  ) {
    this.el = el('div', { class: 'dsc-menu', role: 'menu', hidden: true });
    this.el.addEventListener('keydown', (e) => {
      const btns = [...this.el.querySelectorAll<HTMLButtonElement>('button')];
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        btns[(i + (e.key === 'ArrowDown' ? 1 : btns.length - 1)) % btns.length]?.focus();
      }
    });
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (this.isOpen && !this.el.contains(e.target as Node) && !anchor.contains(e.target as Node)) this.close(false);
      },
      true,
    );
    t.onChange(() => this.render());
  }

  add(item: MenuItem): () => void {
    this.items.set(item.id, item);
    this.render();
    return () => {
      if (this.items.get(item.id) === item) this.items.delete(item.id);
      this.render();
    };
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.render();
    this.isOpen = true;
    this.el.hidden = false;
    this.anchor.setAttribute('aria-expanded', 'true');
    this.el.querySelector<HTMLButtonElement>('button')?.focus();
  }

  close(refocus = true): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.hidden = true;
    this.anchor.setAttribute('aria-expanded', 'false');
    if (refocus) this.anchor.focus();
  }

  private render(): void {
    this.el.setAttribute('aria-label', this.t.resolve(S.menu));
    const list = [...this.items.values()].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
    this.el.replaceChildren(
      ...list.map((it) => {
        const check = it.checked ? it.checked() : null;
        const b = el(
          'button',
          {
            type: 'button',
            class: 'dsc-menu-item',
            role: check == null ? 'menuitem' : 'menuitemcheckbox',
            'data-id': it.id,
            onclick: () => {
              this.close();
              it.onSelect();
              this.render();
            },
          },
          el('span', null, this.t.resolve(it.label)),
          check == null ? null : el('span', { class: `dsc-switch${check ? ' on' : ''}`, 'aria-hidden': 'true' }),
        );
        if (check != null) b.setAttribute('aria-checked', String(check));
        return b;
      }),
    );
  }
}
