import type { I18n } from '@/i18n/I18n';
import type { Lang, Mode } from '@/core/types';
import type { AudioSystem } from '@/systems/Audio';
import { logoSvg } from '@/core/brand/logo3d';
import { storageWorks } from '@/core/storage';
import type { TitleState } from '@/core/quest/resume';
import { cycleFocus, h, kbd, keepFocus } from './dom';
import { ensureStyle } from './Kit';

const TITLE_CSS = `
#start .credits-link { margin-top: 14px; }
#start .credits-link .btn.approach, #start .cta .btn.approach { border-color: transparent; background: transparent; padding: 8px 4px; font-weight: 500; font-size: 14px; color: var(--text-2); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--border); }
#start .credits-link .btn.approach { font-size: 12.5px; padding: 4px 2px; }
#start .credits-link .btn.approach:hover, #start .cta .btn.approach:hover { color: var(--text); background: transparent; text-decoration-color: var(--orange); }
`;

/** Phase 7 title hooks (plan §3.6, §4.1; WP1): attached once the quest spine exists (src/core/quest/wire.ts). */
export interface TitleHooks {
  /** the three title states (src/core/quest/resume.ts) */
  title(): TitleState;
  /** „Im Dock weiterspielen“: grounded, at the last area (D25) */
  dock(mode: Mode): void;
  /** „Abheben ansehen“: Start, then the lift-off replay (WP13 listens to 'liftoff:replay') */
  replay(mode: Mode): void;
  /** „Credits & Lizenzen“ */
  credits(): void;
}

/**
 * Title screen over the live 3D scene (the attract camera circles the island): kicker, logo,
 * title, the premise in one sentence, the tagline, mode choice with honest time estimates,
 * language toggle, Start. Phase 7 (plan §4.1, R5 §3.3): three states — first visit („Starten“),
 * grounded with progress („Weiterspielen · n von 18 Stempeln · m/6 Rotoren“), airborne
 * („Weiterspielen“ + „Im Dock weiterspielen“ + „Abheben ansehen“) — and the credits link.
 * „Anflug ansehen“ is retired with the ascent (D26).
 */
export class StartScreen {
  readonly root = h('div', { id: 'start' });
  private mode: Mode;
  private hooks: TitleHooks | null = null;

  constructor(
    private i18n: I18n,
    private audio: AudioSystem,
    initialMode: Mode,
    private cb: {
      /** `approach` is the retired D13 „Anflug ansehen“ (never set since D26) */
      start(mode: Mode, o?: { approach?: boolean }): void;
      setLang(l: Lang): void;
      /** stamps earned so far (returning visitors) */
      stamps?(): number;
      /** D13: any progress (stamps, stars, capsules, cards): the CTA says „Weiterspielen“ */
      hasProgress?(): boolean;
      /** retired with the ascent (D26): not read any more */
      skipsAscent?(): boolean;
    },
  ) {
    this.mode = initialMode;
    // PERF-09: the AudioContext (and its noise buffers) is built on the first press anywhere on the title,
    // not inside the Start click that also captures the mouse and starts the ascent
    this.root.addEventListener('pointerdown', () => this.audio.unlock(), { passive: true });
    this.render();
    i18n.onChange(() => keepFocus(this.root, () => this.render()));
    // C5: Enter starts the game from anywhere on the title (on a focused button it is that button's click)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' && this.visible && !e.defaultPrevented && !document.querySelector('#modals .modal-backdrop:not(.passthrough)')) {
        // Start → language → mode cards → Start (in every engine: Safari's default Tab skips buttons)
        e.preventDefault();
        cycleFocus(this.root, e.shiftKey);
        return;
      }
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      if (e.repeat || !this.visible || e.defaultPrevented) return;
      // a focused control (button, link, field) handles its own Enter
      const t = e.target;
      if (t instanceof Element && t.closest('button, a[href], input, select, textarea, [role=button], [role=link], .modal')) return;
      e.preventDefault();
      this.start();
    });
  }

  /** Phase 7: the title states and the extra buttons (called once at boot, before the title shows). */
  attach(hooks: TitleHooks): void {
    this.hooks = hooks;
    keepFocus(this.root, () => this.render());
  }

  /** Re-render (the save changed under the title, e.g. a reset). */
  refresh(): void {
    keepFocus(this.root, () => this.render());
  }

  private get visible(): boolean {
    return this.root.isConnected && !this.root.classList.contains('hidden') && !this.root.classList.contains('leaving');
  }

  private start(): void {
    this.audio.unlock();
    this.cb.start(this.mode);
  }

  /** the title state: the hooks', else the rc4 callbacks' („Weiterspielen“ with the stamp count) */
  private state(): TitleState {
    if (this.hooks) return this.hooks.title();
    const stamps = this.cb.stamps?.() ?? 0;
    const hasProgress = stamps > 0 || !!this.cb.hasProgress?.();
    return { state: hasProgress ? 'grounded' : 'first', hasProgress, stamps, rotors: 0, offersApproach: false, offersDock: false, offersReplay: false };
  }

  private render(): void {
    ensureStyle('wp1-title', TITLE_CSS);
    const t = (k: string): string => this.i18n.t(k);
    const modeCard = (m: Mode): HTMLElement =>
      h(
        'button',
        {
          class: `mode${this.mode === m ? ' sel' : ''}`,
          'aria-pressed': this.mode === m ? 'true' : 'false',
          onclick: (e: Event) => {
            e.stopPropagation();
            this.mode = m;
            this.audio.unlock();
            this.audio.play('click');
            keepFocus(this.root, () => this.render());
          },
        },
        h('span', { class: 'chk' }),
        h('span', { class: 'eyebrow' }, t(`core.start.${m}.eyebrow`)),
        h('span', { class: 't' }, t(`core.start.${m}.title`)),
        h('span', { class: 'd' }, t(`core.start.${m}.desc`)),
        h('span', { class: 'time mono' }, t(`core.start.${m}.time`)),
      );
    // C7: „Deutsch · English“ in 14 px on a dark backplate (the grey 12 px „EN“ was 1.2:1 over the sky)
    const langBtn = (l: Lang, label: string): HTMLElement =>
      h(
        'button',
        {
          class: this.i18n.lang === l ? 'on' : '',
          lang: l,
          'aria-pressed': this.i18n.lang === l ? 'true' : 'false',
          onclick: (e: Event) => {
            e.stopPropagation();
            this.audio.unlock();
            this.audio.play('click');
            this.cb.setLang(l);
          },
        },
        label,
      );
    const lang = h('div', { class: 'lang-toggle', role: 'group', 'aria-label': t('core.start.language') }, langBtn('de', 'Deutsch'), h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'), langBtn('en', 'English'));
    const keys = h(
      'div',
      { class: 'keys' },
      h('span', null, kbd('WASD'), t('core.controls.move')),
      h('span', null, kbd(t('core.controls.keyMouse')), kbd('← →'), t('core.controls.look')),
      h('span', null, kbd('E'), t('core.controls.interact')),
      h('span', null, kbd('H'), t('core.hud.help')),
      h('span', null, kbd('Esc'), t('core.controls.menu')),
    );
    const ts = this.state();
    const cont = ts.hasProgress;
    const second = (id: string, label: string, run: () => void): HTMLElement =>
      h(
        'button',
        {
          class: 'btn approach',
          id,
          type: 'button',
          onclick: (e: Event) => {
            e.stopPropagation();
            this.audio.unlock();
            run();
          },
        },
        label,
      );
    // grounded: „n von 18 Stempeln · m/6 Rotoren“; airborne: the stamps (the rotors all run)
    const note =
      ts.state === 'grounded'
        ? this.i18n.t('core.start.progressRotors', { n: ts.stamps, m: ts.rotors })
        : ts.state === 'airborne' && ts.stamps > 0
          ? this.i18n.t('core.start.progress', { n: ts.stamps })
          : '';
    this.root.replaceChildren(
      h(
        'div',
        { class: 'col' },
        h('div', { class: 'lockup' }, h('span', { html: logoSvg({ size: 46 }) }), h('div', { class: 'eyebrow kicker' }, t('core.start.kicker'))),
        h('h1', null, h('span', { class: 'wm' }, 'Em', h('b', null, 'AI')), ' ', t('core.brand.academy')),
        h('div', { class: 'eyebrow', style: 'margin-bottom:14px' }, t('core.brand.eyebrow')),
        h('p', { class: 'sub' }, t('core.start.subtitle')),
        h('div', { class: 'tagline' }, t('core.brand.tagline')),
        h('div', { class: 'eyebrow muted choose' }, t('core.start.choose')),
        h('div', { class: 'modes' }, modeCard('entdecker'), modeCard('entscheider')),
        h(
          'div',
          { class: 'cta' },
          h(
            'button',
            {
              class: 'btn primary',
              id: 'start-btn',
              onclick: (e: Event) => {
                e.stopPropagation();
                this.start();
              },
            },
            t(cont ? 'core.start.ctaContinue' : 'core.start.cta'),
            ' →',
          ),
          note ? h('span', { class: 'progress-note mono' }, note) : null,
          // airborne (D25, §3.6): back into the dock, or watch the lift-off again
          ts.offersDock && this.hooks ? second('dock-btn', t('core.start.dock'), () => this.hooks!.dock(this.mode)) : null,
          ts.offersReplay && this.hooks ? second('replay-btn', t('core.start.replay'), () => this.hooks!.replay(this.mode)) : null,
        ),
        // UXA-12: blocked storage → no promise that the progress stays, and say so
        h('div', { class: 'hint' }, t(storageWorks() ? 'core.start.hint' : 'core.start.hintNoSave')),
        storageWorks() ? null : h('div', { class: 'hint storage-note' }, t('core.start.noStorage')),
        // public link: phones and tablets land here too — say honestly what the game needs
        touchOnly() ? h('div', { class: 'hint touch-note' }, t('core.start.touch')) : null,
        keys,
        // D15: who made the real robots, the software and the fonts
        this.hooks ? h('div', { class: 'credits-link' }, second('credits-btn', t('core.start.credits'), () => this.hooks!.credits())) : null,
      ),
      // after the column in tab order: Start (focused) → language → the mode cards
      h('div', { class: 'top-right' }, lang),
    );
  }

  hide(): void {
    this.root.classList.add('leaving');
    window.setTimeout(() => this.root.classList.add('hidden'), 520);
    // the keyboard goes to the 3D view (Tab = Pass, ← → turn), not to a fading button
    if (this.root.contains(document.activeElement)) document.getElementById('game')?.focus({ preventScroll: true });
  }

  show(): void {
    this.root.classList.remove('hidden', 'leaving');
    // C5: Start has the focus, so Enter starts and Tab goes on to the mode cards and the language
    requestAnimationFrame(() => {
      if (this.visible && !this.root.contains(document.activeElement)) this.root.querySelector<HTMLElement>('#start-btn')?.focus({ preventScroll: true });
    });
  }
}

/** A device without any fine pointer (phone, tablet): the game needs mouse + keyboard. */
function touchOnly(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches;
  } catch {
    return false;
  }
}
