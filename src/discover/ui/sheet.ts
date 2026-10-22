/**
 * The card sheet (WP-D0, plan §4). Portrait: a bottom sheet, opaque #1F1F1F with the brand hairline,
 * above the safe area: peek ≈ 96 px (eyebrow, title, ‹ ›), half ≈ 45 % (body), full ≈ 90 % (rows,
 * sources, actions); drag the grip or the header to change its height, swipe the collapsed sheet
 * sideways for the previous / next stop. Landscape phones and ≥ 900 px: a right side panel (max 360 px).
 * A region with a heading, never a modal trap. Game-free.
 */
import type { CardSpec, Sheet, SheetSnap, TextResolver } from '../types';
import { S } from '../strings';
import { renderCard } from './card';
import { el, icon, nextId } from './el';

/** The side-panel layout (keep in sync with discover.css). */
export const SIDE_MQ = '(orientation: landscape) and (max-height: 600px), (min-width: 900px)';

const ORDER: SheetSnap[] = ['peek', 'half', 'full'];

export class SheetImpl implements Sheet {
  readonly el: HTMLElement;
  snap: SheetSnap | 'hidden' = 'hidden';
  card: CardSpec | null = null;
  private readonly grip: HTMLButtonElement;
  private readonly headTxt: HTMLElement;
  private readonly body: HTMLElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly titleId = nextId('dsc-sheet-title');
  private readonly listeners = new Set<(s: SheetSnap | 'hidden') => void>();
  private nav: { prev: boolean; next: boolean } | null = null;
  /** the last pointer sequence on the grip was a drag (its click must not toggle) */
  private dragged = false;

  constructor(
    private t: TextResolver,
    private onNav: (dir: -1 | 1) => void,
  ) {
    this.grip = el('button', { type: 'button', class: 'dsc-grip', 'aria-expanded': 'false', onclick: () => (this.dragged ? (this.dragged = false) : this.toggle()) }, el('i'));
    this.prevBtn = el('button', { type: 'button', class: 'dsc-nav prev', onclick: () => this.onNav(-1) }, icon('prev'));
    this.nextBtn = el('button', { type: 'button', class: 'dsc-nav next', onclick: () => this.onNav(1) }, icon('next'));
    this.headTxt = el('div', { class: 'dsc-headtxt' });
    const head = el('div', { class: 'dsc-head' }, this.prevBtn, this.headTxt, this.nextBtn);
    this.body = el('div', { class: 'dsc-body' });
    this.el = el('section', { class: 'dsc-sheet hairline', role: 'region', 'aria-labelledby': this.titleId, 'data-snap': 'hidden', 'aria-hidden': 'true' }, this.grip, head, this.body);
    this.wireDrag(head);
    t.onChange(() => {
      this.labels();
      if (this.card) this.render(this.card);
    });
    this.labels();
    this.setNav(null);
  }

  private labels(): void {
    this.prevBtn.setAttribute('aria-label', this.t.resolve(S.prev));
    this.nextBtn.setAttribute('aria-label', this.t.resolve(S.next));
    this.grip.setAttribute('aria-label', this.t.resolve(this.snap === 'peek' || this.snap === 'hidden' ? S.expand : S.collapse));
  }

  show(card: CardSpec, snap: SheetSnap = 'peek'): void {
    this.card = card;
    this.render(card);
    this.body.scrollTop = 0;
    this.setSnap(snap);
  }

  hide(): void {
    this.set('hidden');
  }

  setSnap(snap: SheetSnap): void {
    if (!this.card) return;
    this.set(snap);
  }

  onSnap(fn: (s: SheetSnap | 'hidden') => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  setNav(o: { prev: boolean; next: boolean } | null): void {
    this.nav = o;
    this.prevBtn.hidden = this.nextBtn.hidden = !o;
    this.prevBtn.disabled = !o?.prev;
    this.nextBtn.disabled = !o?.next;
  }

  /** the grip: peek ↔ half (full → half) */
  private toggle(): void {
    if (this.snap === 'hidden') return;
    this.set(this.snap === 'peek' ? 'half' : this.snap === 'full' ? 'half' : 'peek');
  }

  private set(s: SheetSnap | 'hidden'): void {
    const changed = s !== this.snap;
    this.snap = s;
    this.el.dataset.snap = s;
    this.el.setAttribute('aria-hidden', String(s === 'hidden'));
    this.el.toggleAttribute('inert', s === 'hidden');
    this.grip.setAttribute('aria-expanded', String(s === 'half' || s === 'full'));
    this.labels();
    if (changed) for (const fn of [...this.listeners]) fn(s);
  }

  private render(card: CardSpec): void {
    const { head, body } = renderCard(this.t, card, this.titleId);
    this.headTxt.replaceChildren(...head.childNodes);
    this.body.replaceChildren(body);
    this.el.dataset.card = card.id ?? '';
  }

  /** vertical drag changes the height (portrait), a sideways swipe on the collapsed sheet navigates */
  private wireDrag(head: HTMLElement): void {
    let id = -1;
    let x0 = 0,
      y0 = 0,
      t0 = 0,
      h0 = 0,
      moved = false;
    const side = (): boolean => {
      try {
        return window.matchMedia(SIDE_MQ).matches;
      } catch {
        return false;
      }
    };
    const heights = (): number[] => {
      const vh = window.innerHeight;
      const peek = this.grip.offsetHeight + head.offsetHeight;
      return [peek, vh * 0.45, vh * 0.9];
    };
    const down = (e: PointerEvent): void => {
      if (id !== -1 || this.snap === 'hidden' || (e.target as Element).closest('.dsc-nav')) return;
      id = e.pointerId;
      x0 = e.clientX;
      y0 = e.clientY;
      t0 = performance.now();
      h0 = this.el.getBoundingClientRect().height;
      moved = false;
      this.dragged = false;
    };
    const move = (e: PointerEvent): void => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - x0,
        dy = e.clientY - y0;
      if (!moved && Math.hypot(dx, dy) < 8) return;
      if (!moved) {
        moved = true;
        try {
          (e.currentTarget as Element).setPointerCapture(id);
        } catch {
          /* already released */
        }
      }
      if (side() || Math.abs(dx) > Math.abs(dy)) return;
      const [peek, , full] = heights();
      this.el.classList.add('dragging');
      this.el.style.setProperty('--vis', `${Math.max(peek, Math.min(full, h0 - dy))}px`);
    };
    const up = (e: PointerEvent): void => {
      if (e.pointerId !== id) return;
      id = -1;
      const dx = e.clientX - x0,
        dy = e.clientY - y0;
      const dt = Math.max(1, performance.now() - t0);
      this.el.classList.remove('dragging');
      this.el.style.removeProperty('--vis');
      this.dragged = moved;
      if (!moved) {
        // a tap on the header text toggles like the grip
        if (!(e.target as Element).closest('button')) this.toggle();
        return;
      }
      if (Math.abs(dx) > 48 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
        if (this.snap === 'peek' && this.nav) {
          const dir = dx < 0 ? 1 : -1;
          if ((dir > 0 && this.nav.next) || (dir < 0 && this.nav.prev)) this.onNav(dir);
        }
        return;
      }
      if (side()) return;
      // nearest height after a short throw
      const target = h0 - dy - (dy / dt) * 160;
      const hs = heights();
      let best = 0;
      for (let i = 1; i < hs.length; i++) if (Math.abs(hs[i] - target) < Math.abs(hs[best] - target)) best = i;
      this.set(ORDER[best]);
    };
    for (const t of [this.grip, head]) {
      t.addEventListener('pointerdown', down);
      t.addEventListener('pointermove', move);
      t.addEventListener('pointerup', up);
      t.addEventListener('pointercancel', up);
    }
  }
}
