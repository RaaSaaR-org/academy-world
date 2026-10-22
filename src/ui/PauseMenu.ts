import type { I18n } from '@/i18n/I18n';
import type { Settings } from '@/core/Settings';
import type { Progress } from '@/systems/Progress';
import type { AudioSystem } from '@/systems/Audio';
import type { Lang, Mode, QualitySetting } from '@/core/types';
import { clearGameStorage } from '@/core/storage';
import { TEXT_SCALES } from '@/core/Settings';
import { h, kbd, keepFocus } from './dom';
import { openCredits } from './Credits';
import type { ModalManager } from './Modals';

export interface PauseCallbacks {
  resume(): void;
  openPass(): void;
  toHub(): void;
  setLang(l: Lang): void;
  setMode(m: Mode): void;
  setQuality(q: QualitySetting): void;
  resetProgress(): void;
  currentQualityLabel(): string;
  /** true when anything on the island can be grabbed (the grab / throw rows show only then, QA-22) */
  hasGrabbables?(): boolean;
}

/** Esc menu: resume, pass, hub, settings (Phase 7: the outside cameras) and controls help, credits & licences. */
export class PauseMenu {
  private close: (() => void) | null = null;
  private tab: 'settings' | 'sound' | 'controls' = 'settings';
  private confirmReset = false;

  constructor(
    private modals: ModalManager,
    private i18n: I18n,
    private settings: Settings,
    private progress: Progress,
    private audio: AudioSystem,
    private cb: PauseCallbacks,
  ) {}

  get isOpen(): boolean {
    return !!this.close;
  }

  open(): void {
    if (this.close) return;
    const card = h('div', { class: 'modal pause hairline', role: 'dialog', 'aria-label': this.i18n.t('core.pause.title') });
    const render = (): void => keepFocus(card, () => card.replaceChildren(...this.build(render)));
    const unsub = this.i18n.onChange(render);
    render();
    this.confirmReset = false;
    // Clicking the backdrop resumes and re-captures the mouse. Esc resumes too (QA-21); browsers
    // refuse pointer lock on Esc, so the next click on the view captures the mouse (capture hint).
    // The Esc that released the pointer lock (and opened this menu) must not close it again: 0.4 s guard.
    const openedAt = performance.now();
    this.close = this.modals.open('pause', card, {
      backdropCloses: true,
      onClose: () => {
        unsub();
        this.close = null;
        this.cb.resume();
      },
      onKey: (code) => {
        if (code !== 'Escape') return false;
        if (performance.now() - openedAt > 400) this.close?.();
        return true;
      },
    });
  }

  hide(): void {
    this.close?.();
  }

  private build(rerender: () => void): HTMLElement[] {
    const t = (k: string): string => this.i18n.t(k);
    const S = this.settings.data;
    const click = (): void => this.audio.play('click');
    const seg = <T extends string>(options: [T, string][], value: T, set: (v: T) => void): HTMLElement =>
      h(
        'div',
        { class: 'seg' },
        ...options.map(([v, label]) =>
          h(
            'button',
            {
              class: v === value ? 'on' : '',
              'aria-pressed': v === value ? 'true' : 'false',
              onclick: () => {
                click();
                set(v);
                rerender();
              },
            },
            label,
          ),
        ),
      );
    const range = (min: number, max: number, step: number, value: number, fmt: (v: number) => string, set: (v: number) => void): HTMLElement => {
      const val = h('span', { class: 'val' }, fmt(value));
      const input = h('input', { type: 'range', min, max, step, value }) as HTMLInputElement;
      input.addEventListener('input', () => {
        const v = Number(input.value);
        val.textContent = fmt(v);
        set(v);
      });
      return h('div', { class: 'ctl' }, input, val);
    };

    const tabs = h(
      'div',
      { class: 'tabs' },
      h('button', { class: this.tab === 'settings' ? 'on' : '', onclick: () => ((this.tab = 'settings'), click(), rerender()) }, t('core.pause.settings')),
      h('button', { class: this.tab === 'sound' ? 'on' : '', onclick: () => ((this.tab = 'sound'), click(), rerender()) }, t('core.pause.sound')),
      h('button', { class: this.tab === 'controls' ? 'on' : '', onclick: () => ((this.tab = 'controls'), click(), rerender()) }, t('core.pause.controls')),
    );

    let body: HTMLElement;
    if (this.tab === 'settings') {
      body = h(
        'div',
        { class: 'form' },
        h('div', { class: 'row' }, h('span', null, t('core.settings.mode')), seg<Mode>([['entdecker', t('core.modes.entdecker.name')], ['entscheider', t('core.modes.entscheider.name')]], this.progress.mode, (m) => this.cb.setMode(m))),
        h('div', { class: 'row' }, h('span', null, t('core.settings.language')), seg<Lang>([['de', 'Deutsch'], ['en', 'English']], this.i18n.lang, (l) => this.cb.setLang(l))),
        h('div', { class: 'row' }, h('span', null, t('core.settings.sensitivity')), range(0.2, 3, 0.05, S.sensitivity, (v) => v.toFixed(2), (v) => this.settings.set('sensitivity', v))),
        h('div', { class: 'row' }, h('span', null, t('core.settings.invertY')), seg<'on' | 'off'>([['off', t('core.settings.off')], ['on', t('core.settings.on')]], S.invertY ? 'on' : 'off', (v) => this.settings.set('invertY', v === 'on'))),
        h('div', { class: 'row' }, h('span', null, t('core.settings.fov')), range(50, 80, 1, S.fov, (v) => `${v}°`, (v) => this.settings.set('fov', v))),
        h('div', { class: 'row' }, h('span', null, t('core.settings.headBob')), seg<'on' | 'off'>([['on', t('core.settings.on')], ['off', t('core.settings.off')]], S.headBob ? 'on' : 'off', (v) => this.settings.set('headBob', v === 'on'))),
        h('div', { class: 'row' }, h('span', null, t('core.settings.reducedMotion')), seg<'on' | 'off'>([['off', t('core.settings.off')], ['on', t('core.settings.on')]], S.reducedMotion ? 'on' : 'off', (v) => this.settings.set('reducedMotion', v === 'on'))),
        // Phase 7 (D24, Settings v4): the lift-off's two outside shots
        h('div', { class: 'row' }, h('span', null, t('core.settings.exteriorCams')), seg<'on' | 'off'>([['on', t('core.settings.on')], ['off', t('core.settings.off')]], S.exteriorCams ? 'on' : 'off', (v) => this.settings.set('exteriorCams', v === 'on'))),
        h(
          'div',
          { class: 'row' },
          h('span', null, t('core.settings.quality')),
          seg<QualitySetting>(
            [
              ['auto', t('core.settings.qualityAuto')],
              ['low', t('core.settings.qualityLow')],
              ['medium', t('core.settings.qualityMedium')],
              ['high', t('core.settings.qualityHigh')],
            ],
            S.quality,
            (q) => this.cb.setQuality(q),
          ),
        ),
      );
    } else if (this.tab === 'sound') {
      // D14 (F3): the master volume, three groups (Audio.VOLUME_GROUPS) and the text size
      const pct = (v: number): string => `${Math.round(v * 100)} %`;
      body = h(
        'div',
        { class: 'form' },
        h('div', { class: 'row' }, h('span', null, t('core.settings.volume')), range(0, 1, 0.05, S.volume, pct, (v) => this.settings.set('volume', v))),
        h('div', { class: 'row' }, h('span', null, t('core.settings.volAtmo')), range(0, 1, 0.05, S.volAtmo, pct, (v) => this.settings.set('volAtmo', v))),
        h('div', { class: 'row' }, h('span', null, t('core.settings.volEffects')), range(0, 1, 0.05, S.volEffects, pct, (v) => this.settings.set('volEffects', v))),
        h('div', { class: 'row' }, h('span', null, t('core.settings.volEmi')), range(0, 1, 0.05, S.volEmi, pct, (v) => this.settings.set('volEmi', v))),
        h(
          'div',
          { class: 'row' },
          h('span', null, t('core.settings.textSize')),
          seg<string>(
            TEXT_SCALES.map((s) => [String(s), `${Math.round(s * 100)} %`] as [string, string]),
            String(S.textScale),
            (v) => this.settings.set('textScale', Number(v)),
          ),
        ),
      );
    } else {
      const row = (label: string, ...keys: HTMLElement[]): HTMLElement[] => [h('span', null, label), h('span', { class: 'keys' }, ...keys)];
      body = h(
        'div',
        { class: 'controls' },
        ...row(t('core.controls.move'), kbd('W'), kbd('A'), kbd('S'), kbd('D')),
        ...row(t('core.controls.look'), kbd(t('core.controls.keyMouse')), kbd('←'), kbd('→')),
        ...row(t('core.controls.sprint'), kbd('Shift')),
        ...row(t('core.controls.jump'), kbd(t('core.controls.keySpace'))),
        ...row(t('core.controls.interact'), kbd('E'), kbd(t('core.controls.keyLmb'))),
        ...(this.cb.hasGrabbables?.() !== false
          ? [
              ...row(t('core.controls.grab'), kbd('F'), kbd(t('core.controls.keyRmb'))),
              ...row(t('core.controls.throw'), kbd(t('core.controls.keyLmb'))),
              ...row(t('core.controls.distance'), kbd(t('core.controls.keyWheel'))),
            ]
          : []),
        ...row(t('core.controls.dialogue'), kbd('Enter')),
        ...row(t('core.controls.ask'), kbd('H')),
        ...row(t('core.controls.map'), kbd('M')),
        ...row(t('core.controls.overlays'), kbd('O')),
        ...row(t('core.controls.pass'), kbd('Tab')),
        ...row(t('core.controls.menu'), kbd('Esc')),
      );
    }

    // C12c: a reset clears everything the game stored (not the settings) and reloads into the first-visit
    // title. „Abbrechen“ comes first, so the keyboard lands on it (keepFocus), not on „Löschen“.
    const reset = this.confirmReset
      ? h(
          'span',
          { class: 'reset-confirm' },
          h('span', null, t('core.pause.resetConfirm')),
          h('button', { class: 'btn ghost', onclick: () => ((this.confirmReset = false), rerender()) }, t('core.pause.resetNo')),
          h(
            'button',
            {
              class: 'btn danger',
              onclick: (e: Event) => {
                (e.currentTarget as HTMLButtonElement).disabled = true;
                this.cb.resetProgress();
                // after Progress's debounced save (50 ms), so nothing is written back
                window.setTimeout(() => {
                  clearGameStorage();
                  window.location.reload();
                }, 150);
              },
            },
            t('core.pause.resetYes'),
          ),
        )
      : h('button', { class: 'btn danger', onclick: () => ((this.confirmReset = true), rerender()) }, t('core.pause.reset'));

    // every slider and segment row is named by its label (screen readers)
    for (const r of body.querySelectorAll('.row')) {
      const label = r.querySelector('span')?.textContent ?? '';
      for (const c of r.querySelectorAll('input, .seg')) {
        c.setAttribute('aria-label', label);
        if (c.classList.contains('seg')) c.setAttribute('role', 'group');
      }
    }

    return [
      h('div', { class: 'eyebrow' }, '// EmAI Academy'),
      h('h2', null, t('core.pause.title')),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn primary block', onclick: () => this.cb.resume() }, t('core.pause.resume')),
        h(
          'div',
          { class: 'pair' },
          h('button', { class: 'btn block', onclick: () => (click(), this.cb.openPass()) }, t('core.pause.pass')),
          h('button', { class: 'btn block', onclick: () => (click(), this.cb.toHub()) }, t('core.pause.hub')),
        ),
      ),
      tabs,
      body,
      h(
        'div',
        { class: 'footer' },
        reset,
        // D15: „Credits & Lizenzen“ (over the pause menu; Esc goes back to it)
        h('button', { class: 'btn ghost', id: 'pause-credits', onclick: () => (click(), void openCredits()) }, t('core.pause.credits')),
        h('span', { class: 'mono' }, this.cb.currentQualityLabel()),
      ),
    ];
  }
}
