/**
 * The Discover layer (WP-D0): `.dsc` with the top bar, the sheet, the menu, the live line, the toast,
 * the „lädt …“ chip and the fade. Both paths build it the same way; the 3D path puts it under #hud
 * (the credits page stays on top), the stills path into #app. Game-free.
 */
import type { Lang, Text } from '@/core/types';
import type { DiscoverSettings, DiscoverUi, MenuItem, TextResolver } from '../types';
import { S } from '../strings';
import { el } from './el';
import { MenuImpl } from './menu';
import { SheetImpl } from './sheet';
import { TopBarImpl } from './topbar';

export class NavHub {
  private readonly fns = new Set<(dir: -1 | 1) => void>();
  on(fn: (dir: -1 | 1) => void): () => void {
    this.fns.add(fn);
    return () => void this.fns.delete(fn);
  }
  emit(dir: -1 | 1): void {
    for (const fn of [...this.fns]) fn(dir);
  }
}

export interface Shell {
  root: HTMLElement;
  ui: DiscoverUi;
  sheet: SheetImpl;
  topbar: TopBarImpl;
  menu: MenuImpl;
  nav: NavHub;
}

export function createShell(
  parent: HTMLElement,
  before: Element | null,
  t: TextResolver,
  o: { setLang(l: Lang): void; settings: DiscoverSettings; extraClass?: string },
): Shell {
  const nav = new NavHub();
  const root = el('div', { class: `dsc${o.extraClass ? ' ' + o.extraClass : ''}` });
  const live = el('div', { class: 'dsc-live', 'aria-live': 'polite', role: 'status' });
  const toastEl = el('div', { class: 'dsc-toast', 'aria-hidden': 'true' });
  const busyEl = el('div', { class: 'dsc-busy', hidden: true }, el('span', { class: 'dsc-spin', 'aria-hidden': 'true' }), el('span', { class: 'dsc-busy-t' }));
  const fadeEl = el('div', { class: 'dsc-fade', 'aria-hidden': 'true' });
  let menu: MenuImpl | null = null;
  const topbar = new TopBarImpl(t, { onLang: (l) => o.setLang(l), onMenu: () => menu?.toggle() });
  menu = new MenuImpl(t, topbar.menuBtn);
  const sheet = new SheetImpl(t, (d) => nav.emit(d));
  root.append(fadeEl, topbar.el, busyEl, toastEl, sheet.el, menu.el, live);
  parent.insertBefore(root, before);
  document.documentElement.classList.toggle('dsc-rm', o.settings.reducedMotion);

  let busyN = 0;
  let toastTimer = 0;
  const busyText = (): void => void (busyEl.querySelector('.dsc-busy-t')!.textContent = t.resolve(S.loading));
  t.onChange(busyText);
  busyText();
  const ui: DiscoverUi = {
    root,
    announce(text: Text) {
      // re-set so the same text is announced again
      live.textContent = '';
      window.setTimeout(() => (live.textContent = t.resolve(text)), 30);
    },
    busy(on: boolean) {
      busyN = Math.max(0, busyN + (on ? 1 : -1));
      busyEl.hidden = busyN === 0;
    },
    toast(text: Text) {
      toastEl.textContent = t.resolve(text);
      toastEl.classList.add('on');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.remove('on'), 2800);
    },
    fade(on: boolean, seconds = 0.4) {
      fadeEl.style.transitionDuration = `${seconds}s`;
      fadeEl.classList.toggle('on', on);
      return new Promise((r) => window.setTimeout(r, seconds * 1000 + 20));
    },
  };
  return { root, ui, sheet, topbar, menu, nav };
}

/** D0's standard menu items (both paths): reduced motion and sound. */
export function settingsItems(settings: DiscoverSettings): MenuItem[] {
  return [
    { id: 'reduced-motion', order: 10, label: S.reducedMotion, checked: () => settings.reducedMotion, onSelect: () => settings.setReducedMotion(!settings.reducedMotion) },
    { id: 'sound', order: 20, label: S.sound, checked: () => settings.sound, onSelect: () => settings.setSound(!settings.sound) },
  ];
}

/**
 * Keys on the page (both paths): ←/→ navigate (not while typing or in the menu), Esc collapses the
 * sheet to its peek (the menu handles its own Esc).
 */
export function wireKeys(sh: Shell, blocked: () => boolean = () => false): void {
  window.addEventListener('keydown', (e) => {
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName))) return;
    if (sh.menu.isOpen || blocked()) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (tgt?.closest?.('[role="menu"], .dsc-chips-list')) return;
      sh.nav.emit(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (e.key === 'Escape' && sh.sheet.snap !== 'hidden' && sh.sheet.snap !== 'peek') {
      sh.sheet.setSnap('peek');
    }
  });
}
