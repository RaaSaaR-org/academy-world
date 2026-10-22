import type { I18n } from '@/i18n/I18n';
import type { Text } from '@/core/types';
import type { AudioSystem } from '@/systems/Audio';
import { isKeyless, type Focus } from '@/systems/Interaction';
import type { GrabReadout } from '@/systems/Grab';
import { logoSvg } from '@/core/brand/logo3d';
import { uiGate } from '@/core/Input';
import { Compass, type CompassMarkerHandle } from './Compass';
import { Dialogue } from './Dialogue';
import { append, h, kbd, textNodes } from './dom';
import { ModalManager } from './Modals';
import { WorldLabels } from './WorldLabels';

export interface ToastOptions {
  kind?: 'info' | 'success' | 'warn' | 'error';
  eyebrow?: Text;
  /** seconds, default 4 */
  duration?: number;
  /** no toast sound (the caller plays its own cue) */
  silent?: boolean;
}

export interface PanelRow {
  k: Text;
  v: string | number;
  tone?: 'accent' | 'teal' | 'default';
}

export interface PanelOptions {
  eyebrow?: Text;
  rows?: PanelRow[];
  content?: Text;
}

export interface PanelHandle {
  /** the panel element, for custom DOM (keep it small) */
  readonly el: HTMLElement;
  setRows(rows: PanelRow[]): void;
  setContent(text: Text): void;
  setEyebrow(text: Text): void;
  setVisible(v: boolean): void;
  remove(): void;
}

interface ObjectiveEntry {
  owner: string;
  text: Text;
}

/** In-play HUD (DOM overlay). Modals/start/loading are separate classes mounted into `root`. */
/** Phase 7 telemetry strip states (WP1 contract, plan §4.1): the cells, joined with „ · “ (the chip stays FIKTION). */
export interface TelemetryState {
  cells: readonly Text[];
}

export class Hud {
  readonly root: HTMLElement;
  readonly modals = new ModalManager();
  readonly labels: WorldLabels;
  readonly compass: Compass;
  readonly dialogue: Dialogue;
  private crosshair: HTMLElement;
  private prompt: HTMLElement;
  private grabEl: HTMLElement;
  private throwEl: HTMLElement;
  private captureEl: HTMLElement;
  private objectiveEl: HTMLElement;
  private objectiveTxt: HTMLElement;
  /** C5: „[H] Hilfe“ footer on the objective card */
  private objectiveHelp: HTMLElement;
  private bannerEl: HTMLElement;
  private toastsEl: HTMLElement;
  private stampEl: HTMLElement;
  private panelsEl: HTMLElement;
  private fadeEl: HTMLElement;
  private hintEl: HTMLElement;
  private captionEl: HTMLElement;
  private captionText: Text | null = null;
  /** game seconds left (C4/C6 contract: HUD timers count game time, so they wait behind the pause menu and panels) */
  private captionLeft = 0;
  private statusEl: HTMLElement;
  private hintText: Text | null = null;
  private statusText: Text | null = null;
  private hintLeft = 0;
  private hintClear: (() => void) | null = null;
  readonly debugEl: HTMLElement;
  private objective: ObjectiveEntry | null = null;
  /** world target of each owner's objective (compass marker), for tests and agents */
  readonly objectiveTargets = new Map<string, { x: number; y: number; z: number }>();
  private objectives = new Map<string, Text>();
  private objectiveMarkers = new Map<string, CompassMarkerHandle>();
  private objectiveFocus: string | null = null;
  private bannerLeft = 0;
  private toastTimers: { el: HTMLElement; left: number }[] = [];
  private lastPromptKey = '';
  private throwTimer = 0;
  readonly toastLog: string[] = [];
  private panelRefreshers = new Set<() => void>();

  constructor(
    private i18n: I18n,
    private audio: AudioSystem,
  ) {
    this.labels = new WorldLabels(i18n);
    this.compass = new Compass(i18n);
    this.dialogue = new Dialogue(i18n, audio);
    this.crosshair = h('div', { id: 'crosshair' }, h('div', { class: 'dot' }), h('div', { class: 'c tl' }), h('div', { class: 'c tr' }), h('div', { class: 'c bl' }), h('div', { class: 'c br' }));
    this.prompt = h('div', { id: 'prompt' });
    this.grabEl = h('div', { id: 'grab-readout', class: 'glass hairline' });
    this.throwEl = h('div', { id: 'throw-readout' });
    this.captureEl = h('div', { id: 'capture-hint', class: 'glass hidden' });
    this.objectiveTxt = h('div', { class: 'txt' });
    this.objectiveHelp = h('div', { class: 'help' });
    this.objectiveEl = h('div', { id: 'objective', class: 'glass empty' }, h('div', { class: 'eyebrow' }), this.objectiveTxt, this.objectiveHelp);
    this.bannerEl = h('div', { id: 'zone-banner' });
    this.toastsEl = h('div', { id: 'toasts' });
    this.stampEl = h('div', { id: 'stamp-fx' });
    this.panelsEl = h('div', { id: 'panels' });
    this.fadeEl = h('div', { id: 'fade' });
    this.hintEl = h('div', { id: 'hint', class: 'glass' });
    this.captionEl = h('div', { id: 'caption' });
    this.statusEl = h('div', { id: 'status' });
    this.debugEl = h('div', { id: 'debug', class: 'glass hidden' });
    this.root = h(
      'div',
      { id: 'hud' },
      this.labels.root,
      this.compass.root,
      this.objectiveEl,
      this.bannerEl,
      this.statusEl,
      this.crosshair,
      this.prompt,
      this.captureEl,
      this.grabEl,
      this.throwEl,
      this.panelsEl,
      this.toastsEl,
      this.hintEl,
      this.captionEl,
      this.dialogue.root,
      this.stampEl,
      this.debugEl,
      this.fadeEl,
      this.modals.root,
    );
    i18n.onChange(() => {
      this.renderObjective();
      this.renderCapture();
      this.lastPromptKey = '';
      this.grabUi = null;
      if (this.hintText) this.hintEl.textContent = this.i18n.resolve(this.hintText);
      if (this.captionText) this.captionEl.textContent = this.i18n.resolve(this.captionText);
      if (this.statusText) this.statusEl.textContent = this.i18n.resolve(this.statusText);
      for (const fn of this.panelRefreshers) fn();
    });
    this.renderCapture();
    window.addEventListener('mousemove', (e) => {
      if (!document.pointerLockElement && e.target instanceof HTMLCanvasElement && e.target.id === 'game') this.freeMouseAt = performance.now();
    }, { passive: true });
  }

  /** D14 (F3): subtitles and the in-play HUD text at 1 / 1.25 / 1.5 (hud.css --ts) */
  setTextScale(s: number): void {
    this.root.style.setProperty('--ts', String(s));
    this.root.dataset.textScale = String(Math.round(s * 100));
  }

  /** Hide/show the whole in-play HUD (start screen etc.). */
  setPlaying(on: boolean): void {
    this.root.classList.toggle('no-hud', !on);
    uiGate.playing = on;
  }

  // ── crosshair / prompt / grab ─────────────────────────────────────────────

  /** UX-16: an interactable just out of reach (set by the game layer each frame), shown dimmed: „näher ran“ */
  private nearMiss: { id: number; label: Text } | null = null;
  setNearMiss(item: { id: number; label: Text } | null): void {
    this.nearMiss = item;
  }

  updateFocus(focus: Focus | null, holding: boolean, readout: GrabReadout | null, enabled: boolean): void {
    const cls = this.crosshair.classList;
    cls.toggle('focus', enabled && !!focus && !holding);
    cls.toggle('grab', enabled && focus?.kind === 'grabbable' && !holding);
    cls.toggle('holding', enabled && holding);
    cls.toggle('hidden-x', !enabled);

    // prompt
    let key = '';
    if (enabled && !holding && focus) {
      if (focus.kind === 'interactable') key = `i:${focus.item.id}:${this.i18n.resolve(focus.item.label)}:${isKeyless(focus.item) ? 'k' : ''}:${focus.grabbable?.id ?? ''}`;
      else key = `g:${focus.body.id}`;
    }
    const near = enabled && !holding && !focus && this.nearMiss ? this.nearMiss : null;
    if (near) key = `n:${near.id}:${this.i18n.resolve(near.label)}`;
    if (key !== this.lastPromptKey) {
      this.lastPromptKey = key;
      this.prompt.replaceChildren();
      this.prompt.classList.toggle('far', !!near);
      if (near) {
        this.prompt.appendChild(h('div', { class: 'row glass' }, kbd('E'), this.i18n.resolve(near.label), h('span', { class: 'meta' }, this.i18n.t('core.hud.closer'))));
        this.prompt.classList.add('show');
      } else if (key && focus) {
        if (focus.kind === 'interactable') {
          // Z2: a keyless prompt (E would do nothing here) shows no key cap
          this.prompt.appendChild(h('div', { class: 'row glass' }, ...(isKeyless(focus.item) ? [] : [kbd('E', true)]), this.i18n.resolve(focus.item.label)));
          if (focus.grabbable) this.prompt.appendChild(this.grabRow(focus.grabbable.mass, focus.grabbable.label));
          if (focus.item.hint) this.prompt.appendChild(h('div', { class: 'hint' }, this.i18n.resolve(focus.item.hint)));
        } else this.prompt.appendChild(this.grabRow(focus.body.mass, focus.body.label));
        this.prompt.classList.add('show');
      } else this.prompt.classList.remove('show');
    }

    // grab readout: DOM built once, then only text/width updates (no per-frame allocation churn)
    if (enabled && holding && readout) {
      this.grabEl.classList.add('show');
      this.grabEl.classList.toggle('saturated', readout.saturated);
      if (!this.grabUi) this.grabUi = this.buildGrabUi();
      const n = (v: number, d = 0): string => this.i18n.num(v, d);
      const ui = this.grabUi;
      setText(ui.mass, n(readout.mass, 1));
      setText(ui.weight, n(readout.weight));
      setText(ui.force, `${n(readout.force)}/${n(readout.maxForce)}`);
      ui.bar.style.width = `${Math.min(100, (readout.force / readout.maxForce) * 100).toFixed(1)}%`;
      ui.marker.style.left = `calc(${Math.min(100, (readout.weight / readout.maxForce) * 100).toFixed(1)}% - 1px)`;
      ui.warn.style.display = readout.tooHeavy ? '' : 'none';
      if (readout.tooHeavy) setText(ui.warn, this.i18n.t('core.hud.tooHeavy', { need: n(readout.weight), max: n(readout.maxForce) }));
    } else this.grabEl.classList.remove('show');
  }

  private grabUi: { mass: HTMLElement; weight: HTMLElement; force: HTMLElement; bar: HTMLElement; marker: HTMLElement; warn: HTMLElement } | null = null;

  private buildGrabUi(): NonNullable<Hud['grabUi']> {
    const t = (k: string): string => this.i18n.t(k);
    const val = (): HTMLElement => h('span');
    const mass = val(),
      weight = val(),
      force = val();
    const bar = h('i'),
      marker = h('b'),
      warn = h('div', { class: 'warn' });
    const statEl = (k: string, v: HTMLElement, unit: string): HTMLElement => h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v, h('small', null, unit)));
    this.grabEl.replaceChildren();
    append(this.grabEl, [
      h('div', { class: 'stats' }, statEl(t('core.hud.mass'), mass, 'kg'), statEl(t('core.hud.weight'), weight, 'N'), statEl(t('core.hud.holdForce'), force, 'N')),
      h('div', { class: 'bar' }, bar, marker),
      warn,
      h('div', { class: 'keys' }, h('span', null, kbd('LMB'), t('core.hud.throw')), h('span', null, kbd('F'), t('core.hud.release')), h('span', null, kbd('⇕'), t('core.controls.distance'))),
    ]);
    return { mass, weight, force, bar, marker, warn };
  }

  private grabRow(mass: number, label: Text | null): HTMLElement {
    const name = label ? this.i18n.resolve(label) : this.i18n.t('core.hud.grab');
    return h('div', { class: 'row glass' }, kbd('F', true), name, h('span', { class: 'meta' }, `${this.i18n.num(mass, mass < 10 ? 1 : 0)} kg`));
  }

  showThrow(impulse: number, speed: number): void {
    this.throwEl.textContent = this.i18n.t('core.hud.throwReadout', { j: this.i18n.num(impulse, 1), v: this.i18n.num(speed, 1) });
    this.throwEl.classList.add('show');
    window.clearTimeout(this.throwTimer);
    this.throwTimer = window.setTimeout(() => this.throwEl.classList.remove('show'), 2600);
  }

  /** performance.now() of the last mouse move over the free (unlocked) 3D view */
  private freeMouseAt = -1e9;
  private captureShown = false;

  /**
   * The engine's rule (playing, mouse free, no modal, not a keyboard player) plus C3: the hint also shows
   * for 3 s after the mouse moves over the free view, so a player who just walked with the keyboard
   * still learns how to look around with the mouse.
   */
  setCaptureHint(show: boolean): void {
    const moved = performance.now() - this.freeMouseAt < 3000 && uiGate.playing && !this.modals.isOpen && !document.pointerLockElement;
    const on = show || moved;
    if (on === this.captureShown) return;
    this.captureShown = on;
    this.captureEl.classList.toggle('hidden', !on);
  }

  private renderCapture(): void {
    this.captureEl.replaceChildren(h('span', { class: 'mouse', 'aria-hidden': 'true' }), this.i18n.t('core.hud.clickToCapture'));
  }

  // ── objective / banner ────────────────────────────────────────────────────

  /**
   * Objectives are kept per owner. Shown is the objective of the zone the player is at
   * (`setObjectiveFocus`, driven by the zone manager) if it has one, else the island's ('world').
   * So a zone's step-by-step objective is never overwritten by the island's route while the
   * player is in that zone, and never leaks out of it. Only the shown owner's compass marker
   * is visible: one orange objective at a time (GDD §5.3).
   */
  setObjective(owner: string, text: Text | null): void {
    if (text == null) this.objectives.delete(owner);
    else this.objectives.set(owner, text);
    this.pickObjective(text != null && owner === this.chosenOwner());
  }

  /** Compass marker that belongs to an owner's objective (hidden while another owner's objective is shown). */
  setObjectiveMarker(owner: string, marker: CompassMarkerHandle | null): void {
    if (marker) this.objectiveMarkers.set(owner, marker);
    else this.objectiveMarkers.delete(owner);
    this.pickObjective(false);
  }

  /** The zone whose HUD is active (player within radius + 4 m), or null on the open island. */
  setObjectiveFocus(zoneId: string | null): void {
    if (this.objectiveFocus === zoneId) return;
    this.objectiveFocus = zoneId;
    this.pickObjective(false);
  }

  private chosenOwner(): string | null {
    if (this.objectiveFocus && this.objectives.has(this.objectiveFocus)) return this.objectiveFocus;
    if (this.objectives.has('world')) return 'world';
    return null;
  }

  private pickObjective(forcePulse: boolean): void {
    const owner = this.chosenOwner();
    const text = owner ? this.objectives.get(owner)! : null;
    const changed = this.objective?.owner !== owner || this.objective?.text !== text;
    this.objective = owner && text ? { owner, text } : null;
    for (const [o, m] of this.objectiveMarkers) m.setHidden(o !== owner);
    // PT-27: inside a zone with its own objective, the other zones' compass labels step aside (icons stay)
    this.root.classList.toggle('zone-objective', !!owner && owner !== 'world');
    this.renderObjective();
    if (this.objective && (changed || forcePulse)) {
      this.objectiveEl.classList.remove('pulse');
      void this.objectiveEl.offsetWidth;
      this.objectiveEl.classList.add('pulse');
    }
  }

  /** world position the shown objective points at (null without a target) */
  get objectiveTarget(): { x: number; y: number; z: number } | null {
    return this.objective ? (this.objectiveTargets.get(this.objective.owner) ?? null) : null;
  }

  get objectiveText(): string | null {
    return this.objective ? this.i18n.resolve(this.objective.text) : null;
  }

  clearObjectiveOwner(owner: string): void {
    this.objectives.delete(owner);
    this.objectiveMarkers.delete(owner);
    this.pickObjective(false);
  }

  private renderObjective(): void {
    (this.objectiveEl.firstChild as HTMLElement).textContent = '// ' + this.i18n.t('core.hud.objective');
    this.objectiveHelp.replaceChildren(kbd('H'), this.i18n.t('core.hud.help'));
    this.objectiveTxt.textContent = this.objective ? this.i18n.resolve(this.objective.text) : '';
    this.objectiveEl.classList.toggle('empty', !this.objective);
    this.placeBanner();
  }

  /** Cinematic lower-third caption (scripted cameras). null hides it. */
  caption(text: Text | null, seconds = 3.5): void {
    this.captionLeft = 0;
    this.captionText = text;
    if (text == null) {
      this.captionEl.classList.remove('show');
      return;
    }
    this.captionEl.textContent = this.i18n.resolve(text);
    this.captionEl.classList.remove('show');
    void this.captionEl.offsetWidth;
    this.captionEl.classList.add('show');
    this.captionLeft = Math.max(0.5, seconds);
  }

  /**
   * Title banner. `place: true` (zone entry, the Kielraum) is a location card on the left under the
   * objective, not a centred title: walking in through a gate, the 3D gate lettering sits in the upper
   * centre of the view, and a centred DOM title landed right on it (QA-27). Centred stays for the
   * cinematic titles (ascent, ending).
   */
  showBanner(eyebrow: string, title: string, sub?: string | Node, o: { place?: boolean } = {}): void {
    const place = !!o.place;
    const wasPlace = this.bannerEl.classList.contains('place');
    if (wasPlace !== place && this.bannerEl.classList.contains('show')) {
      // switching sides while one shows: no slide across the screen
      this.bannerEl.style.transition = 'none';
      this.bannerEl.classList.remove('show');
      void this.bannerEl.offsetWidth;
      this.bannerEl.style.transition = '';
    }
    this.bannerEl.classList.toggle('place', place);
    this.bannerEl.replaceChildren(h('div', { class: 'eyebrow' }, eyebrow), h('div', { class: 'title' }, title), h('div', { class: 'line' }));
    if (sub) this.bannerEl.appendChild(h('div', { class: 'sub mono' }, sub));
    this.placeBanner();
    // the zone's onEnter may set a new (taller) objective in the same tick: place again before paint
    requestAnimationFrame(() => this.placeBanner());
    this.bannerEl.classList.add('show');
    this.bannerLeft = place ? 3.6 : 3.2;
  }

  /** A location card sits 14 px under the objective card (or at its top when there is none). */
  private placeBanner(): void {
    if (!this.bannerEl.classList.contains('place')) {
      this.bannerEl.style.top = '';
      return;
    }
    const empty = this.objectiveEl.classList.contains('empty');
    const r = this.objectiveEl.getBoundingClientRect();
    const hudTop = this.root.getBoundingClientRect().top;
    const top = empty || r.height < 4 ? 22 : Math.round(r.bottom - hudTop + 14);
    this.bannerEl.style.top = `${top}px`;
  }

  // ── toasts / stamps ───────────────────────────────────────────────────────

  toast(text: Text, opts: ToastOptions = {}): void {
    const msg = this.i18n.resolve(text);
    this.toastLog.push(msg);
    if (this.toastLog.length > 30) this.toastLog.shift();
    const kind = opts.kind ?? 'info';
    const eyebrow = opts.eyebrow ? this.i18n.resolve(opts.eyebrow) : kind === 'error' ? 'Error' : '';
    const el = h('div', { class: `toast glass ${kind}` }, eyebrow ? h('div', { class: 'eyebrow' }, eyebrow) : null, h('div', null, msg));
    this.pushToast(el, opts.duration ?? 4);
    if (opts.silent) return;
    if (kind === 'error') this.audio.play('error', { volume: 0.6 });
    else if (kind === 'success') this.audio.play('success', { volume: 0.7 });
    else this.audio.play('beep', { volume: 0.8, pitch: 1.4, bus: 'ui' });
  }

  /** Record a line in the toast log (tests) without showing a toast (merged stamp banners). */
  logToast(msg: string): void {
    this.toastLog.push(msg);
    if (this.toastLog.length > 30) this.toastLog.shift();
  }

  private pushToast(el: HTMLElement, seconds: number): void {
    this.toastsEl.prepend(el);
    while (this.toastsEl.children.length > 4) this.toastsEl.lastElementChild?.remove();
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    this.toastTimers = this.toastTimers.filter((x) => x.el.isConnected);
    this.toastTimers.push({ el, left: seconds });
  }

  /** The Academy Pass is handed over: its cover (svg) pops in the centre, like a stamp, with a label. */
  flashPass(svg: string, label: string): void {
    this.stampEl.replaceChildren(h('div', { class: 'cover', html: svg }), h('div', { class: 'label' }, `${label} · Tab`));
    this.stampEl.classList.remove('go');
    void this.stampEl.offsetWidth;
    this.stampEl.classList.add('go');
    this.audio.play('success', { volume: 0.7 });
  }

  stamp(title: string, noteHz = 523.25, skipped = false): void {
    // a skipped station (Entscheider) gets the grey „übersprungen" stamp: honest, no celebration
    const head = this.i18n.t(skipped ? 'core.hud.stampSkipped' : 'core.hud.stampEarned');
    if (!skipped) {
      this.stampEl.replaceChildren(h('div', { class: 'ring', html: logoSvg({ disc: false, size: 84, stroke: 12 }) }), h('div', { class: 'label' }, `${head} · ${title}`));
      this.stampEl.classList.remove('go');
      void this.stampEl.offsetWidth;
      this.stampEl.classList.add('go');
    }
    const el = h('div', { class: `toast glass stamp${skipped ? ' skipped' : ''}` }, h('span', { html: logoSvg({ size: 30 }) }), h('div', null, h('div', { class: 'eyebrow' }, head), h('div', null, title)));
    this.toastLog.push(`${head}: ${title}`);
    this.pushToast(el, 5);
    if (skipped) this.audio.play('click', { volume: 0.5, pitch: 0.7 });
    else this.audio.stamp(noteHz);
  }

  // ── panels ────────────────────────────────────────────────────────────────

  panel(opts: PanelOptions): PanelHandle {
    const eyebrowEl = h('div', { class: 'eyebrow' });
    const rowsEl = h('div', { class: 'rows' });
    const contentEl = h('div', { class: 'content' });
    const el = h('div', { class: 'panel glass hairline' }, eyebrowEl, rowsEl, contentEl);
    this.panelsEl.appendChild(el);
    let eyebrow = opts.eyebrow ?? null;
    let rows = opts.rows ?? [];
    let content = opts.content ?? null;
    const render = (): void => {
      eyebrowEl.replaceChildren(textNodes(eyebrow ? this.i18n.resolve(eyebrow) : ''));
      eyebrowEl.style.display = eyebrow ? '' : 'none';
      rowsEl.replaceChildren(...rows.flatMap((r) => [h('div', { class: 'k' }, this.i18n.resolve(r.k)), h('div', { class: `v ${r.tone ?? ''}` }, String(r.v))]));
      rowsEl.style.display = rows.length ? '' : 'none';
      contentEl.textContent = content ? this.i18n.resolve(content) : '';
      contentEl.style.display = content ? '' : 'none';
    };
    render();
    this.panelRefreshers.add(render);
    return {
      el,
      setRows: (r) => {
        rows = r;
        render();
      },
      setContent: (c) => {
        content = c;
        render();
      },
      setEyebrow: (e) => {
        eyebrow = e;
        render();
      },
      setVisible: (v) => el.classList.toggle('hidden', !v),
      remove: () => {
        this.panelRefreshers.delete(render);
        el.remove();
      },
    };
  }

  // ── hint / status / readout ───────────────────────────────────────────────

  /** Small centred hint line above the subtitles. seconds ≤ 0 = until cleared. Returns clear(). */
  hint(text: Text | null, seconds = 4): () => void {
    this.hintLeft = 0;
    this.hintClear = null;
    this.hintText = text;
    if (text == null) {
      this.hintEl.classList.remove('show');
      return () => {};
    }
    this.hintEl.textContent = this.i18n.resolve(text);
    this.hintEl.classList.add('show');
    const mine = text;
    const clear = (): void => {
      if (this.hintText === mine) this.hint(null);
    };
    if (seconds > 0) {
      this.hintLeft = seconds;
      this.hintClear = clear;
    }
    return clear;
  }

  private telemetryEl: HTMLElement | null = null;
  private telemetryVal: HTMLElement | null = null;
  private telemetryLast = '';
  /**
   * Bottom-left telemetry strip: LAGE 0,04° · TAKT 1000 Hz with a FIKTION chip (ART-V2 §5.4). Phase 7
   * (WP1 contract, plan §4.1): a TelemetryState shows its cells instead, e.g. the grounded
   * „BODEN · HALTEARME · ROTOREN 3/6 · AKKU 33 % · NAV AUS“.
   */
  setTelemetry(lageDeg: number | TelemetryState): void {
    if (!this.telemetryEl) {
      this.telemetryVal = h('span');
      this.telemetryEl = h('div', { id: 'telemetry', class: 'mono' }, this.telemetryVal, h('span', { class: 'chip chip-fiktion' }, ''));
      this.root.insertBefore(this.telemetryEl, this.modals.root);
    }
    const de = this.i18n.lang === 'de';
    const txt =
      typeof lageDeg === 'number'
        ? `${de ? 'LAGE' : 'ATTITUDE'} ${this.i18n.num(lageDeg, 2)}° · ${de ? 'TAKT' : 'RATE'} 1000 Hz`
        : lageDeg.cells.map((c) => this.i18n.resolve(c)).join(' · ');
    if (txt !== this.telemetryLast) {
      this.telemetryLast = txt;
      this.telemetryVal!.textContent = txt;
      (this.telemetryEl.lastChild as HTMLElement).textContent = de ? 'FIKTION' : 'FICTION';
    }
  }

  /** Hide the hint while it only repeats text the given panel already shows (its key row). */
  suppressHintIfIn(panel: Element | null): void {
    const t = this.hintText ? this.i18n.resolve(this.hintText) : '';
    const norm = (x: string): string => x.replace(/[\s·[\]|]+/g, ' ').trim().toLowerCase();
    const dup = !!panel && !!t && norm(panel.textContent ?? '').includes(norm(t));
    this.hintEl.classList.toggle('dup', dup);
  }

  /** Persistent mono eyebrow under the compass, e.g. '// SENSOR · TIEFE' (null clears). */
  status(text: Text | null): void {
    this.statusText = text;
    this.statusEl.textContent = text ? this.i18n.resolve(text) : '';
    this.statusEl.classList.toggle('show', !!text);
  }

  get statusLine(): string | null {
    return this.statusText ? this.i18n.resolve(this.statusText) : null;
  }

  /** One-line telemetry readout in the right column. */
  readout(label: Text, value = ''): { set(v: string): void; remove(): void; readonly el: HTMLElement } {
    const k = h('span', { class: 'k' });
    const v = h('span', null, value);
    const el = h('div', { class: 'readout glass' }, k, v);
    const render = (): void => {
      k.textContent = this.i18n.resolve(label);
    };
    render();
    this.panelRefreshers.add(render);
    this.panelsEl.appendChild(el);
    return {
      el,
      set: (x: string) => {
        if (v.textContent !== x) v.textContent = x;
      },
      remove: () => {
        this.panelRefreshers.delete(render);
        el.remove();
      },
    };
  }

  /** Container for zone-created cards (Kennlinien etc.). */
  get panelsRoot(): HTMLElement {
    return this.panelsEl;
  }

  // ── fade ──────────────────────────────────────────────────────────────────

  fade(on: boolean): Promise<void> {
    this.fadeEl.classList.toggle('on', on);
    return new Promise((r) => window.setTimeout(r, 360));
  }

  update(dt: number): void {
    this.dialogue.update(dt);
    // timed HUD items count game time: dt is 0 while paused or behind a full-screen panel (C4)
    if (this.captionLeft > 0 && (this.captionLeft -= dt) <= 0) {
      this.captionEl.classList.remove('show');
      this.captionText = null;
    }
    if (this.bannerLeft > 0 && (this.bannerLeft -= dt) <= 0) this.bannerEl.classList.remove('show');
    if (this.hintLeft > 0 && (this.hintLeft -= dt) <= 0) {
      const c = this.hintClear;
      this.hintClear = null;
      c?.();
    }
    if (this.toastTimers.length) {
      for (const t of this.toastTimers) {
        if ((t.left -= dt) > 0) continue;
        const el = t.el;
        el.classList.remove('show');
        window.setTimeout(() => el.remove(), 350);
      }
      this.toastTimers = this.toastTimers.filter((t) => t.left > 0);
    }
  }
}

function setText(el: HTMLElement, v: string): void {
  if (el.textContent !== v) el.textContent = v;
}
