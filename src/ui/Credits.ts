/**
 * WP1 — the page „Credits & Lizenzen“ (plan §5.2, D15; R9 egg 15): every real robot model with its
 * makers, licence, attribution and what EmAI changed, then the software and the fonts, each with a
 * same-origin licence text. Opened from the title, the pause menu, the Schauhalle entrance and egg 15.
 * The data (WP0: src/core/credits.ts, src/robots/credits.ts) is imported on first open, so none of it
 * is in the first load. Source links point to the projects (a click is the player's choice; nothing
 * is fetched from another origin).
 */
import type { I18n } from '@/i18n/I18n';
import type { AudioSystem } from '@/systems/Audio';
import { h } from './dom';
import { ensureStyle } from './Kit';
import type { ModalManager } from './Modals';

interface CreditsDeps {
  modals: ModalManager;
  i18n: I18n;
  audio?: AudioSystem;
}
let deps: CreditsDeps | null = null;
let closeOpen: (() => void) | null = null;

/** The engine hands over the modal layer once (src/core/quest/wire.ts). */
export function bindCredits(d: CreditsDeps): void {
  deps = d;
}

/** The page is open (tests, the pause menu). */
export function creditsOpen(): boolean {
  return !!closeOpen;
}

const CSS = `
#hud.no-hud > #modals:not(#start):not(#loading):has(.modal.credits) { opacity: 1 !important; }
.modal.credits { width: min(760px, calc(100vw - 32px)); max-height: min(86vh, 900px); overflow-y: auto; padding: 26px 28px 22px; }
.modal.credits h2 { margin: 6px 0 10px; }
.modal.credits .lead { color: var(--text-2); font-size: 14px; line-height: 1.55; margin: 0 0 8px; max-width: 640px; }
.modal.credits h3 { font-family: var(--font-mono); font-weight: 500; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-2); margin: 22px 0 8px; }
.modal.credits .cr { padding: 11px 0 12px; border-top: 1px solid var(--border-subtle); }
.modal.credits .cr.focus { background: rgba(45, 212, 191, 0.07); box-shadow: inset 3px 0 0 var(--teal); padding-left: 10px; }
.modal.credits .cr .n { font-weight: 600; color: var(--text); font-size: 15px; }
.modal.credits .cr .m { color: var(--text-2); font-size: 12.5px; margin-top: 2px; }
.modal.credits .cr .a { font-size: 13.5px; line-height: 1.5; margin-top: 6px; color: var(--text); }
.modal.credits .cr .c { font-size: 12.5px; line-height: 1.45; margin-top: 4px; color: var(--text-2); }
.modal.credits .cr .l { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 6px; font-size: 12.5px; }
.modal.credits a { color: var(--text); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--border); }
.modal.credits a:hover, .modal.credits a:focus-visible { text-decoration-color: var(--orange); }
.modal.credits .spdx { font-family: var(--font-mono); font-size: 11.5px; letter-spacing: 0.04em; color: var(--text-2); }
.modal.credits .foot { margin-top: 18px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
`;

/** Open the credits page (optionally scrolled to one entry: a robot id, a software or font name). */
export async function openCredits(o: { focus?: string } = {}): Promise<void> {
  if (!deps) {
    if (import.meta.env.DEV) console.warn('[credits] openCredits() before the engine bound the page');
    return;
  }
  if (closeOpen) return;
  const { modals, i18n, audio } = deps;
  ensureStyle('wp1-credits', CSS);
  const { CREDITS, creditHref } = await import('@/core/credits');
  const r = (t: { de: string; en: string }): string => i18n.resolve(t);
  const L = CREDITS.labels;
  const link = (label: string, href: string, external = false): HTMLElement =>
    h('a', external ? { href, target: '_blank', rel: 'noopener noreferrer' } : { href, target: '_blank', rel: 'noopener' }, label);
  const card = h('div', { class: 'modal credits hairline', role: 'dialog', 'aria-label': r(CREDITS.title) });
  const render = (): void => {
    const robots = CREDITS.robots.map((c) =>
      h(
        'div',
        { class: 'cr', id: `credit-${c.id}` },
        h('div', { class: 'n' }, r(c.name)),
        h('div', { class: 'm' }, c.maker, ' · ', h('span', { class: 'spdx' }, c.spdx)),
        h('div', { class: 'a' }, r(c.attribution)),
        h('div', { class: 'c' }, `${r(L.changes)}: ${r(c.changes)}`),
        h(
          'div',
          { class: 'l' },
          link(r(L.source), c.source, true),
          ...c.licenseFiles.map((f) => link(r(L.license), creditHref(f))),
          c.notice ? link(r(L.notice), creditHref(c.notice)) : null,
        ),
      ),
    );
    const row = (id: string, name: string, meta: string, url: string, file: string): HTMLElement =>
      h('div', { class: 'cr', id: `credit-${id}` }, h('div', { class: 'n' }, name), h('div', { class: 'm' }, meta), h('div', { class: 'l' }, link(r(L.source), url, true), link(r(L.license), creditHref(file))));
    const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    card.replaceChildren(
      h('button', { class: 'x', 'aria-label': i18n.t('core.hud.close'), onclick: () => closeOpen?.() }, '✕'),
      h('div', { class: 'eyebrow' }, '// EmAI Academy · Schwebewerk'),
      h('h2', null, r(CREDITS.title)),
      h('p', { class: 'lead' }, r(CREDITS.intro)),
      h('p', { class: 'lead' }, r(CREDITS.disclaimer), ' ', r(CREDITS.unitree)),
      h('h3', null, r(L.robots)),
      ...robots,
      h('h3', null, r(L.software)),
      ...CREDITS.software.map((s) => row(slug(s.name), s.name, `${s.license} · ${s.copyright}`, s.url, s.licenseFile)),
      h('h3', null, r(L.fonts)),
      ...CREDITS.fonts.map((f) => row(slug(f.name), f.name, `${f.license} · ${f.copyright}`, f.url, f.licenseFile)),
      h('div', { class: 'foot' }, link(r(L.allNotices), creditHref(CREDITS.noticesFile)), h('button', { class: 'btn primary', 'data-autofocus': '', onclick: () => closeOpen?.() }, i18n.t('core.hud.close'))),
    );
  };
  render();
  const off = i18n.onChange(render);
  audio?.play('open');
  closeOpen = modals.open('credits', card, {
    backdropCloses: true,
    onClose: () => {
      off();
      closeOpen = null;
      audio?.play('close');
    },
  });
  // over the title (#start comes later in the HUD than the modal layer, and the title hides the HUD:
  // the CSS above shows the modal layer while the credits are open): lift the backdrop above it
  const backdrop = card.closest<HTMLElement>('.modal-backdrop');
  if (backdrop) backdrop.style.zIndex = '30';
  if (o.focus) {
    const id = `credit-${o.focus.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    requestAnimationFrame(() => {
      const el = card.querySelector<HTMLElement>(`[id="${id}"]`);
      if (!el) return;
      el.classList.add('focus');
      el.scrollIntoView({ block: 'center' });
    });
  }
}
