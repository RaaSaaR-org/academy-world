import type { I18n } from '@/i18n/I18n';
import type { Text } from '@/core/types';
import type { ChallengeDef, ChallengeResult, JuiceTone, Stars } from '@/core/zones/types';
import { RECAMAN, recamanArcs } from '@/core/brand/logo3d';
import { h, kbd } from './dom';
import { ensureStyle } from './Kit';

/** The one-voice strip (plan §4.1, R6 #10): the banner as one line while EMI speaks or a console opened over it. */
const STRIP_CSS = `
#result-banner.strip { width: auto; max-width: min(calc(600px * var(--ts, 1)), calc(100vw - 32px)); }
#hud.operating[data-dock='right'] #result-banner.strip, #hud.operating[data-dock='left'] #result-banner.strip { width: auto; }
#result-banner .rb-strip { flex-direction: row; align-items: center; gap: 12px; padding: 7px 10px 7px 14px; }
#result-banner .rb-strip .rb-sv { font-family: var(--font-mono); font-weight: 500; font-size: calc(17px * var(--ts, 1)); color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
#result-banner .rb-strip .rb-sv.title { font-family: var(--font-display); font-weight: 700; letter-spacing: -0.01em; }
#result-banner .rb-strip .rb-stars { gap: 3px; }
#result-banner .rb-strip .rb-btns { display: flex; gap: 6px; flex: none; }
`;

/** What the result banner shows (built by the GameLayer, rendered here). */
export interface BannerModel {
  key: string;
  /** '// 02 · A · BALANCIEREN' */
  eyebrow: Text;
  def: ChallengeDef;
  result: ChallengeResult;
  detail: Text | null;
  attempts: number;
  /** merged stamp (stamp + result within 1.5 s) */
  stamp: { title: Text; earned: number; lookHint: boolean } | null;
  /** ◆ station in Entscheider mode with a findings box: offers the Befundkarte button */
  befund: boolean;
  onRetry: (() => void) | null;
  onWhy: (() => void) | null;
  onBefund: (() => void) | null;
}

const STAR_PATH = 'M12 2.6l2.82 6.06 6.63.72-4.95 4.47 1.38 6.53L12 17.06l-5.88 3.32 1.38-6.53-4.95-4.47 6.63-.72z';

/** Inline SVG rating star (DOM only; troika never draws ★, docs/FUN-PLAN.md §4.6). */
export function starSvg(on: boolean, size = 16, cls = ''): string {
  return `<svg class="star-svg ${on ? 'on' : 'off'} ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
}

/** Three stars as one inline-SVG string (Pass tiles, map, certificate). */
export function starsSvg(n: number, size = 14): string {
  return `<span class="stars3" aria-label="${n}/3">${[0, 1, 2].map((i) => starSvg(i < n, size)).join('')}</span>`;
}

/**
 * The banner mark (ART-V2 §5.1): all 18 elements of the logo, earned ones at the Pass ghost
 * opacity, unearned fainter, the NEW element in #FF6700 revealed along its path in 1.2 s
 * (stroke-dashoffset + opacity only: no glow, no rotation, logo manual).
 */
export function bannerMark(earned: number, size = 56, animate = true): string {
  const newIdx = earned - 1;
  const op = (i: number): string => (i === newIdx ? '1' : i < newIdx ? '0.42' : '0.14');
  const cls = (i: number): string => (i === newIdx && animate ? ' class="draw" pathLength="1"' : '');
  let paths = '';
  for (const a of recamanArcs()) {
    const yStart = -375 + 30 * RECAMAN[a.k - 1];
    const yEnd = -375 + 30 * RECAMAN[a.k];
    const up = yEnd > yStart;
    const sweep = (a.side === 1) === up ? 0 : 1;
    paths += `<path d="M 400 ${400 - yStart} A ${a.r} ${a.r} 0 0 ${sweep} 400 ${400 - yEnd}" opacity="${op(a.k)}"${cls(a.k)}/>`;
  }
  // the ring as a path from 12 o'clock so its reveal starts at the top
  const ring = `<path d="M 400 25 A 375 375 0 1 1 399.99 25" opacity="${op(0)}"${cls(0)}/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="${size}" height="${size}" class="bmark" aria-hidden="true"><circle cx="400" cy="400" r="400" fill="#141414"/><g fill="none" stroke="#FF6700" stroke-width="16">${ring}${paths}</g></svg>`;
}

/**
 * DOM for the game layer: result banner, fail flash, 3-2-1 countdown, attempt bar (timer + live
 * value), screen-edge pulse and live goal chips. Not a modal: the mouse stays captured, Esc keeps
 * its meaning (docs/FUN-PLAN.md §4.2).
 */
export class ResultUi {
  readonly bannerEl = h('div', { id: 'result-banner', class: 'machined', role: 'status' });
  private failEl = h('div', { id: 'fail-flash' });
  private countEl = h('div', { id: 'countdown' });
  private attemptEl = h('div', { id: 'attempt-bar' });
  private timerEl = h('span', { class: 'timer chip-live hidden' });
  private liveEl = h('span', { class: 'live chip-live hidden' });
  private pulseEl = h('div', { id: 'edge-pulse' });
  private model: BannerModel | null = null;
  /** C6: game seconds the banner still stays without a player action (12 s + 0.25 s per word) */
  private bannerLeft = 0;
  /** C6: where the player stood when it opened (a walk of more than 4 m closes it) */
  private bannerFrom: { x: number; z: number } | null = null;
  private bannerShownAt = 0;
  /** game seconds the fail flash still shows */
  private failLeft = 0;
  private failText: Text | null = null;
  private failAttempt = 0;
  private failRetry = false;
  private failShownAt = 0;
  private countResolve: (() => void) | null = null;
  private countTimers: number[] = [];
  private timerLeft: number | null = null;
  private timerLabel: Text | null = null;
  private liveText: Text | null = null;
  private hover = false;
  /** live goal-chip rows: key → elements (pruned once detached after being mounted) */
  private chipRows = new Map<string, Set<{ el: HTMLElement; seen: boolean; render: () => void }>>();
  /** banner log for tests: one entry per banner shown */
  readonly log: { key: string; stars: number; merged: boolean; t: number }[] = [];
  /** one voice at a time (plan §4.1): the open banner is drawn as a one-line strip */
  private strip = false;

  constructor(
    private i18n: I18n,
    private reducedMotion: () => boolean,
    private playStarCue: (i: number) => void,
    /** the player's feet (C6: a walk away closes the banner) */
    private playerFeet: () => { x: number; z: number } | null = () => null,
  ) {
    this.attemptEl.append(this.timerEl, this.liveEl);
    this.bannerEl.addEventListener('mouseenter', () => (this.hover = true));
    this.bannerEl.addEventListener('mouseleave', () => (this.hover = false));
    // a click outside closes the banner (operate mode: the cursor is free)
    window.addEventListener(
      'mousedown',
      (e) => {
        if (!this.model) return;
        if (e.target instanceof Node && this.bannerEl.contains(e.target)) return;
        if (performance.now() - this.bannerShownAt < 400) return;
        this.closeBanner();
      },
      true,
    );
    i18n.onChange(() => {
      if (this.model) this.renderBanner(false);
      if (this.failText) this.renderFail();
      this.renderAttempt();
      for (const set of this.chipRows.values()) for (const r of set) r.render();
    });
  }

  /** Elements to mount into the HUD root (after the modal layer: the banner stays above operate panels). */
  get elements(): HTMLElement[] {
    return [this.pulseEl, this.attemptEl, this.failEl, this.countEl, this.bannerEl];
  }

  get bannerOpen(): boolean {
    return !!this.model;
  }
  get bannerKey(): string | null {
    return this.model?.key ?? null;
  }
  get bannerModel(): BannerModel | null {
    return this.model;
  }
  get failOpen(): boolean {
    return !!this.failText;
  }
  get countdownActive(): boolean {
    return !!this.countResolve;
  }
  /** the attempt bar shows a run clock or a live value */
  get attemptShown(): boolean {
    return this.timerLeft != null || this.liveText != null;
  }

  // ── banner ────────────────────────────────────────────────────────────────

  showBanner(model: BannerModel, o: { merged?: boolean } = {}): void {
    this.closeFail();
    const same = this.model?.key === model.key && this.model?.result === model.result;
    this.model = model;
    this.bannerShownAt = performance.now();
    this.renderBanner(!same);
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    if (!same) this.log.push({ key: model.key, stars: model.result.stars, merged: !!model.stamp, t: Math.round(performance.now()) });
    else if (o.merged && this.log.length) this.log[this.log.length - 1].merged = true;
    if (this.log.length > 60) this.log.shift();
    // C6: it stays until the player acts (Enter, R, H, a 4 m walk, a new run); without any of these at
    // least 24 s, and 12 s + 0.25 s per word for a long one, counted in game time (it waits behind the
    // pause menu and panels, and while the mouse rests on it)
    const words = (this.bannerEl.textContent ?? '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    this.bannerLeft = Math.max(same ? this.bannerLeft : 0, 24, 12 + 0.25 * words);
    if (!same || !this.bannerFrom) {
      const p = this.playerFeet();
      this.bannerFrom = p ? { x: p.x, z: p.z } : null;
    }
  }

  /** seconds (game time) the open banner still stays without a player action; tests */
  get bannerSecondsLeft(): number | null {
    return this.model ? Math.round(this.bannerLeft * 10) / 10 : null;
  }

  /**
   * One voice at a time (plan §4.1, R6 #10): while EMI speaks or a console opened over the banner, it
   * shrinks to one line (value, stars, [R], [H]); afterwards it opens up again (no second star animation).
   */
  setStrip(on: boolean): void {
    if (this.strip === on) return;
    this.strip = on;
    this.bannerEl.classList.toggle('strip', on);
    if (this.model) this.renderBanner(false);
  }

  get stripped(): boolean {
    return this.strip && !!this.model;
  }

  /** Re-render the open banner (e.g. a stamp merged in, the tower hint changed). */
  refreshBanner(): void {
    if (this.model) this.renderBanner(false);
  }

  closeBanner(): void {
    if (!this.model) return;
    this.bannerFrom = null;
    this.model = null;
    this.hover = false;
    this.bannerEl.classList.remove('show');
  }

  private renderBanner(animate: boolean): void {
    const m = this.model!;
    const r = (t: Text | null | undefined): string => (t == null ? '' : this.i18n.resolve(t));
    const t = (k: string, p?: Record<string, string | number>): string => this.i18n.t(`core.game.${k}`, p);
    const res = m.result;
    const def = m.def;
    const rm = this.reducedMotion();
    const delay0 = m.stamp ? 0.5 : 0.18;
    if (this.strip) {
      this.renderStrip(m);
      // the star cues still sound once (short; EMI's line is ducked by the mix)
      if (animate) for (let i = 0; i < res.stars; i++) window.setTimeout(() => this.playStarCue(i), (0.1 + i * 0.12) * 1000);
      return;
    }

    const head = h('div', { class: 'rb-head' }, h('div', { class: 'eyebrow' }, r(m.eyebrow)), res.personalBest ? h('span', { class: 'tag orange rb-pb' }, t('banner.pb')) : null);

    // value + stars
    const valueText = res.value != null ? formatValue(this.i18n, res.value, def.metric?.unit, def.metric?.digits) : null;
    const stars = h('div', { class: 'rb-stars' });
    for (let i = 0; i < 3; i++) {
      const on = i < res.stars;
      const el = h('span', { class: `rb-star${on ? ' on' : ''}${animate && on && !rm ? ' pop' : ''}`, html: starSvg(on, 28) });
      if (animate && on) el.style.animationDelay = `${(delay0 + i * 0.28).toFixed(2)}s`;
      stars.appendChild(el);
    }
    const valueEl = h('div', { class: `rb-value${valueText ? '' : ' title'}` }, valueText ?? r(def.title));
    const label = valueText && def.metric ? h('div', { class: 'rb-label' }, r(def.metric.label)) : null;
    const main = h('div', { class: 'rb-main' }, h('div', { class: 'rb-vbox' }, valueEl, label), stars);

    // goal chips (✓ met by THIS attempt; the stored best's next goal is dashed)
    const goals = h('div', { class: 'rb-goals' });
    def.goals.forEach((g, i) => {
      const met = i < res.stars;
      const best = i < res.best;
      goals.appendChild(h('span', { class: `rb-goal${met ? ' met' : best ? ' best' : ''}${i === res.best ? ' next' : ''}` }, h('i', { html: met ? '✓' : starSvg(best, 11) }), r(g.text)));
    });

    const left: HTMLElement[] = [head, main, goals];
    if (m.detail) left.push(h('div', { class: 'rb-detail' }, r(m.detail)));
    // the lesson: with the first ★ result only
    if (def.lesson && res.stars >= 1 && res.prevStars === 0) left.push(h('div', { class: 'rb-lesson' }, r(def.lesson)));

    // merged stamp: the 56 px mark (new element drawn in), „Linie n/18 für den Turm" in the footer
    const mark = m.stamp ? h('div', { class: `rb-mark${animate && !rm ? ' anim' : ''}`, title: r(m.stamp.title), html: bannerMark(m.stamp.earned, 56, !rm) }) : null;

    // footer: (stamp line) · next star · best · attempts | buttons
    const meta: string[] = [];
    if (res.bestValue != null && def.metric) meta.push(t('banner.best', { v: formatValue(this.i18n, res.bestValue, def.metric.unit, def.metric.digits) }));
    if (m.attempts > 0) meta.push(m.attempts === 1 ? t('banner.attempt1') : t('banner.attempts', { n: m.attempts }));
    const next = res.best < 3 ? t('banner.next', { goal: r(def.goals[res.best as 0 | 1 | 2].text) }) : res.newStars ? t('banner.allStars') : '';
    const btns = h('div', { class: 'rb-btns' });
    if (m.onRetry) btns.appendChild(h('button', { class: 'btn small', onclick: () => m.onRetry?.() }, kbd('R'), t('banner.retry')));
    if (m.onWhy) btns.appendChild(h('button', { class: 'btn small ghost', onclick: () => m.onWhy?.() }, kbd('H'), t('banner.why')));
    if (m.befund && m.onBefund) btns.appendChild(h('button', { class: 'btn small ghost', onclick: () => m.onBefund?.() }, t('banner.befund')));
    btns.appendChild(h('button', { class: 'btn small ghost rb-close', onclick: () => this.closeBanner() }, kbd('Enter'), t('banner.close')));
    const stampLine = m.stamp
      ? h('div', { class: 'rb-line' }, t('banner.logo', { n: m.stamp.earned }), m.stamp.lookHint ? h('span', { class: 'rb-look' }, ` · ${t('banner.lookTower')}`) : null)
      : null;
    const nextLine = next ? h('div', { class: `rb-next${res.best >= 3 ? ' done' : ''}` }, next) : null;
    const foot = h(
      'div',
      { class: 'rb-foot' },
      h('div', { class: 'rb-info' }, stampLine, stampLine ? h('div', { class: 'rb-meta mono' }, [next, ...meta].filter(Boolean).join(' · ')) : nextLine, !stampLine && meta.length ? h('div', { class: 'rb-meta mono' }, meta.join(' · ')) : null),
      btns.childElementCount ? btns : null,
    );

    const body = h('div', { class: `rb-body${mark ? ' with-stamp' : ''}` }, mark, h('div', { class: 'rb-left' }, ...left));
    this.bannerEl.replaceChildren(h('div', { class: 'mc-frame' }, h('div', { class: 'mc-inner rb-inner' }, body, foot)));
    if (animate && !rm) {
      // the star cues follow the CSS fill (rising pitch)
      for (let i = 0; i < res.stars; i++) window.setTimeout(() => this.playStarCue(i), (delay0 + i * 0.28) * 1000);
    } else if (animate) for (let i = 0; i < res.stars; i++) window.setTimeout(() => this.playStarCue(i), (0.1 + i * 0.12) * 1000);
  }

  /** The one-line strip: value (or the title), the stars, [R] and [H] (plan §4.1). */
  private renderStrip(m: BannerModel): void {
    ensureStyle('wp1-strip', STRIP_CSS);
    const r = (t: Text | null | undefined): string => (t == null ? '' : this.i18n.resolve(t));
    const t = (k: string, p?: Record<string, string | number>): string => this.i18n.t(`core.game.${k}`, p);
    const res = m.result;
    const def = m.def;
    const valueText = res.value != null ? formatValue(this.i18n, res.value, def.metric?.unit, def.metric?.digits) : null;
    const stars = h('div', { class: 'rb-stars', 'aria-label': `${res.stars}/3` });
    for (let i = 0; i < 3; i++) stars.appendChild(h('span', { class: `rb-star${i < res.stars ? ' on' : ''}`, html: starSvg(i < res.stars, 16) }));
    const btns = h('div', { class: 'rb-btns' });
    if (m.onRetry) btns.appendChild(h('button', { class: 'btn small', onclick: () => m.onRetry?.() }, kbd('R'), t('banner.retry')));
    if (m.onWhy) btns.appendChild(h('button', { class: 'btn small ghost', onclick: () => m.onWhy?.() }, kbd('H'), t('banner.why')));
    this.bannerEl.replaceChildren(
      h(
        'div',
        { class: 'mc-frame' },
        h('div', { class: 'mc-inner rb-inner rb-strip' }, h('div', { class: `rb-sv${valueText ? '' : ' title'}`, title: r(def.title) }, valueText ?? r(def.title)), stars, btns.childElementCount ? btns : null),
      ),
    );
  }

  // ── fail flash ────────────────────────────────────────────────────────────

  fail(reason: Text, attempt: number, retry: boolean): void {
    const repeat = !!this.failText && performance.now() - this.failShownAt < 1000;
    this.failText = reason;
    this.failAttempt = attempt;
    this.failRetry = retry;
    this.renderFail();
    if (!repeat) {
      this.failShownAt = performance.now();
      this.failEl.classList.remove('show');
      void this.failEl.offsetWidth;
    }
    this.failEl.classList.add('show');
    this.failLeft = 2.5;
  }

  private renderFail(): void {
    const t = (k: string, p?: Record<string, string | number>): string => this.i18n.t(`core.game.${k}`, p);
    const parts: HTMLElement[] = [
      h('span', { class: 'ff-x', 'aria-hidden': 'true' }, '✕'),
      h('span', { class: 'ff-reason' }, this.i18n.resolve(this.failText)),
      h('span', { class: 'ff-n mono' }, t('fail.attempt', { n: this.failAttempt })),
    ];
    if (this.failRetry) parts.push(h('span', { class: 'ff-r' }, kbd('R'), t('fail.retry')));
    this.failEl.replaceChildren(...parts);
  }

  closeFail(): void {
    this.failLeft = 0;
    this.failText = null;
    this.failEl.classList.remove('show');
  }

  // ── countdown ─────────────────────────────────────────────────────────────

  /** 3-2-1-LOS. Resolves at LOS (or at once when a key skips it). */
  countdown(from: number, cue: (name: 'tick' | 'go', step: number) => void): Promise<void> {
    this.skipCountdown();
    return new Promise((resolve) => {
      this.countResolve = resolve;
      const n = Math.max(1, Math.min(5, Math.round(from)));
      const step = 0.62;
      const show = (label: string, cls: string): void => {
        this.countEl.className = '';
        this.countEl.replaceChildren(h('span', { class: cls }, label));
        void this.countEl.offsetWidth;
        this.countEl.className = `show${this.reducedMotion() ? ' still' : ''}`;
      };
      for (let i = 0; i < n; i++) {
        this.countTimers.push(
          window.setTimeout(() => {
            show(String(n - i), 'num');
            cue('tick', i);
          }, i * step * 1000),
        );
      }
      this.countTimers.push(window.setTimeout(() => this.finishCountdown(cue), n * step * 1000));
    });
  }

  private finishCountdown(cue: (name: 'tick' | 'go', step: number) => void): void {
    for (const id of this.countTimers) window.clearTimeout(id);
    this.countTimers = [];
    this.countEl.className = '';
    this.countEl.replaceChildren(h('span', { class: 'go' }, this.i18n.t('core.game.countdown.go')));
    void this.countEl.offsetWidth;
    this.countEl.className = `show go${this.reducedMotion() ? ' still' : ''}`;
    cue('go', 0);
    this.countTimers.push(window.setTimeout(() => (this.countEl.className = ''), 650));
    const r = this.countResolve;
    this.countResolve = null;
    r?.();
  }

  /** Any key skips: jump to LOS. */
  skipCountdown(cue?: (name: 'tick' | 'go', step: number) => void): void {
    if (!this.countResolve) return;
    this.finishCountdown(cue ?? (() => undefined));
  }

  // ── attempt bar (timer + live value) ──────────────────────────────────────

  setTimer(seconds: number | null, label: Text | null = null): void {
    this.timerLeft = seconds;
    this.timerLabel = label;
    this.renderAttempt();
  }

  setLive(text: Text | null): void {
    this.liveText = text;
    this.renderAttempt();
  }

  /** per frame (game time): counts the timer down; the banner's stay (C6) */
  update(dt: number): void {
    if (this.failText && (this.failLeft -= dt) <= 0) this.closeFail();
    if (this.model) {
      const p = this.bannerFrom ? this.playerFeet() : null;
      if (p && this.bannerFrom && Math.hypot(p.x - this.bannerFrom.x, p.z - this.bannerFrom.z) > 4) this.closeBanner();
      else if (!this.hover && (this.bannerLeft -= dt) <= 0) this.closeBanner();
    }
    if (this.timerLeft != null && this.timerLeft > 0) {
      const before = Math.ceil(this.timerLeft);
      this.timerLeft = Math.max(0, this.timerLeft - dt);
      if (Math.ceil(this.timerLeft) !== before) this.renderAttempt();
    }
  }

  private renderAttempt(): void {
    const t = this.timerLeft;
    if (t == null) this.timerEl.classList.add('hidden');
    else {
      const s = Math.ceil(t);
      const label = this.timerLabel ? this.i18n.resolve(this.timerLabel) : this.i18n.t('core.game.timer');
      this.timerEl.textContent = `${label} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      this.timerEl.classList.remove('hidden');
      this.timerEl.classList.toggle('low', s <= 10);
    }
    if (this.liveText == null) this.liveEl.classList.add('hidden');
    else {
      this.liveEl.textContent = this.i18n.resolve(this.liveText);
      this.liveEl.classList.remove('hidden');
    }
    this.attemptEl.classList.toggle('show', t != null || this.liveText != null);
  }

  // ── pulse ─────────────────────────────────────────────────────────────────

  pulse(tone: JuiceTone = 'good', strength = 1): void {
    if (this.reducedMotion()) return;
    this.pulseEl.className = '';
    this.pulseEl.style.setProperty('--pulse-a', String(Math.max(0.15, Math.min(1, strength))));
    void this.pulseEl.offsetWidth;
    this.pulseEl.className = `go ${tone}`;
  }

  // ── goal chips ────────────────────────────────────────────────────────────

  /** Three live goal chips for one challenge. */
  chips(key: string, def: () => ChallengeDef, stars: () => Stars): HTMLElement {
    const el = h('div', { class: 'goal-chips', title: this.i18n.t('core.game.chips.goals') });
    const entry = {
      el,
      seen: false,
      render: (): void => {
        const d = def();
        const s = stars();
        el.replaceChildren(
          ...d.goals.map((g, i) =>
            h('span', { class: `goal-chip${i < s ? ' on' : ''}${i === s ? ' next' : ''}` }, h('i', { html: starSvg(i < s, 12) }), this.i18n.resolve(g.text)),
          ),
        );
      },
    };
    entry.render();
    let set = this.chipRows.get(key);
    if (!set) this.chipRows.set(key, (set = new Set()));
    set.add(entry);
    return el;
  }

  /** Re-render one challenge's chips (after a result or a def replacement). */
  refreshChips(key: string): void {
    const set = this.chipRows.get(key);
    if (!set) return;
    for (const r of [...set]) {
      if (r.el.isConnected) r.seen = true;
      else if (r.seen) {
        set.delete(r);
        continue;
      }
      r.render();
    }
  }

  dropChips(prefix: string): void {
    for (const k of [...this.chipRows.keys()]) if (k.startsWith(prefix)) this.chipRows.delete(k);
  }
}

/** „8,4 s" / „12" / „73 %" in the current locale. */
export function formatValue(i18n: I18n, v: number, unit?: string, digits?: number): string {
  const d = digits ?? (unit === 's' ? 1 : 0);
  const num = i18n.num(v, d);
  return unit ? `${num} ${unit}` : num;
}
