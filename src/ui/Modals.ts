import type { I18n } from '@/i18n/I18n';
import type { Mode, Text } from '@/core/types';
import type { AudioSystem } from '@/systems/Audio';
import { uiGate } from '@/core/Input';
import { cycleFocus, focusables, h, kbd, richText } from './dom';
import { chipElement, type ChipType } from './Kit';

export interface InfoCardMetric {
  label: Text;
  value: string | number;
  unit?: string;
  note?: Text;
  /** Phase 7 (WP14 request, additive): the number's source chip, shown in the metric (plan §4: every number has one chip) */
  chip?: ChipType;
  /** the chip's source line (hover) */
  chipSource?: Text;
}

export type InfoCardDiagram =
  | { svg: string; caption?: Text }
  | {
      /** Draw into a 2D canvas. `t` = seconds since the card opened (for animation). */
      draw: (g: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
      /** redraw every frame while open (default false) */
      animate?: boolean;
      /** width / height, default 4/3 */
      aspect?: number;
      caption?: Text;
    };

export interface InfoCardContent {
  /** Mono eyebrow, e.g. '// SENSOR · LIDAR' */
  eyebrow?: Text;
  title: Text;
  /** One or more paragraphs. `**bold**` is supported. */
  body?: Text | Text[];
  bullets?: Text[];
  /** Key numbers in mono. Mark invented numbers with `illustrative: true`. */
  metrics?: InfoCardMetric[];
  /**
   * Phase 7 (WP14 request, additive): source chips shown at the top of the text (FIKTION, QUELLE,
   * HERSTELLERANGABE …); they cover the numbers in the card's paragraphs (plan §4, text-audit --chips).
   */
  chips?: { type: ChipType; source?: Text }[];
  /** Shows the ILLUSTRATIV tag + note. REQUIRED whenever numbers are examples, not measurements. */
  illustrative?: boolean;
  /**
   * Replaces the default ILLUSTRATIV note ("Beispielwerte zur Veranschaulichung, keine Messdaten.")
   * when the card's numbers come from a toy model the player just ran (e.g. "Spielzeugmodell:
   * simulierte Messwerte, keine echten Sensordaten.").
   */
  illustrativeNote?: Text;
  /** The "Für Entscheider" box (shown in both modes; emphasised in Entscheider mode). */
  forDecisionMakers?: Text | { title?: Text; body?: Text | Text[]; bullets?: Text[] };
  diagram?: InfoCardDiagram;
  closeLabel?: Text;
}

export interface InfoCardSpec extends InfoCardContent {
  /** Overrides merged on top of the base content in Entdecker mode. */
  entdecker?: Partial<InfoCardContent>;
  /** Overrides merged on top of the base content in Entscheider mode. */
  entscheider?: Partial<InfoCardContent>;
}

interface ModalEntry {
  kind: string;
  backdrop: HTMLElement;
  content: HTMLElement;
  passthrough: boolean;
  close: () => void;
  onKey?: (code: string) => boolean;
}

/**
 * Modal stack (info cards, pass, pause, custom). The engine releases pointer lock while a
 * modal is open and re-captures it on close.
 */
export class ModalManager {
  readonly root = h('div', { id: 'modals' });
  private stack: ModalEntry[] = [];
  onChange: ((open: boolean) => void) | null = null;
  /** the Tab that closed a modal (its onKey) must not also move the focus */
  private swallowTab = false;

  constructor() {
    // C5: Tab stays inside the top dialog (bubble phase: the engine's key routing has already run)
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Tab') return;
      if (this.swallowTab) {
        this.swallowTab = false;
        e.preventDefault();
        return;
      }
      const top = this.top;
      if (!top || top.passthrough || e.defaultPrevented) return;
      e.preventDefault();
      cycleFocus(top.content, e.shiftKey);
    });
  }

  private syncGate(): void {
    uiGate.blockingModal = this.stack.some((m) => !m.passthrough);
  }

  get top(): ModalEntry | undefined {
    return this.stack[this.stack.length - 1];
  }
  get isOpen(): boolean {
    return this.stack.length > 0;
  }
  isKindOpen(kind: string): boolean {
    return this.stack.some((m) => m.kind === kind);
  }

  /**
   * Show a modal. C5: a dialog (not operate mode's passthrough panel) gets role=dialog + aria-modal,
   * its first control is focused (the ✕ only when it is the only one; `[data-autofocus]` wins), Tab is
   * trapped inside it, and on close the focus returns where it was (else to the 3D view).
   */
  open(
    kind: string,
    content: HTMLElement,
    opts: { onClose?: () => void; onKey?: (code: string) => boolean; backdropCloses?: boolean; passthrough?: boolean } = {},
  ): () => void {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!opts.passthrough) {
      if (!content.hasAttribute('role')) content.setAttribute('role', 'dialog');
      content.setAttribute('aria-modal', 'true');
      if (!content.hasAttribute('tabindex')) content.tabIndex = -1;
    }
    // passthrough: no dimming, clicks reach the 3D canvas except on `content` (operate mode).
    // Other modals sit in a frame that carries the drop shadow, so the modal itself can take the
    // machined 45° corner cuts (ART-V2 §5.3: clip-path would cut a box-shadow off).
    const frame = opts.passthrough ? null : h('div', { class: 'modal-frame' }, content);
    const backdrop = h('div', { class: opts.passthrough ? 'modal-backdrop passthrough' : 'modal-backdrop' }, frame ?? content);
    if (opts.passthrough) opts.backdropCloses = false;
    let closed = false;
    const entry: ModalEntry = {
      kind,
      backdrop,
      content,
      passthrough: !!opts.passthrough,
      onKey: opts.onKey,
      close: () => {
        if (closed) return;
        closed = true;
        const hadFocus = backdrop.contains(document.activeElement);
        this.stack = this.stack.filter((e) => e !== entry);
        this.syncGate();
        backdrop.classList.remove('show');
        backdrop.setAttribute('inert', '');
        window.setTimeout(() => backdrop.remove(), 260);
        if (hadFocus || document.activeElement === document.body) {
          // back to where the focus was (a menu under this one), else to the 3D view
          const back = before && before.isConnected && before !== document.body && before.getClientRects().length && !before.closest('[inert]') ? before : document.getElementById('game');
          back?.focus({ preventScroll: true });
        }
        try {
          opts.onClose?.();
        } catch (err) {
          console.error('[modal] onClose threw', err);
        }
        this.onChange?.(this.isOpen);
      },
    };
    if (opts.backdropCloses !== false)
      backdrop.addEventListener('mousedown', (e) => {
        if (e.target === backdrop || e.target === frame) entry.close();
      });
    this.stack.push(entry);
    this.syncGate();
    this.root.appendChild(backdrop);
    requestAnimationFrame(() => requestAnimationFrame(() => backdrop.classList.add('show')));
    if (!opts.passthrough) {
      // after the caller has filled the content (custom modals build after open())
      requestAnimationFrame(() => {
        if (closed || this.top !== entry || content.contains(document.activeElement)) return;
        const items = focusables(content);
        const first = content.querySelector<HTMLElement>('[data-autofocus]') ?? items.find((e) => !e.classList.contains('x')) ?? items[0] ?? content;
        first.focus({ preventScroll: true });
      });
    }
    this.onChange?.(true);
    return entry.close;
  }

  /** Route a key to the top modal. Returns true when consumed. */
  handleKey(code: string): boolean {
    const top = this.top;
    if (!top) return false;
    if (top.onKey?.(code)) {
      if (code === 'Tab') {
        this.swallowTab = true;
        window.setTimeout(() => (this.swallowTab = false), 0);
      }
      return true;
    }
    if (code === 'Escape') {
      top.close();
      return true;
    }
    return false;
  }

  closeAll(): void {
    for (const e of [...this.stack].reverse()) e.close();
  }
}

/** Builds and shows info cards. */
export class InfoCards {
  private queue: { spec: InfoCardSpec; resolve: () => void }[] = [];
  private openCount = 0;
  currentTitle: string | null = null;
  /**
   * Every card request (tests, docs/FUN-PLAN.md §5 C3): `requested` = asked for by the player (a key or
   * click within 0.8 s, or an explicit request such as [H] Warum? / the Pass), else it opened by itself.
   */
  readonly log: { title: string; requested: boolean; t: number }[] = [];
  /** set by the engine: true when the player pressed a key / button in the last 0.8 s */
  userActive: () => boolean = () => false;

  constructor(
    private modals: ModalManager,
    private i18n: I18n,
    private audio: AudioSystem,
    private getMode: () => Mode,
  ) {}

  open(spec: InfoCardSpec, o: { requested?: boolean } = {}): Promise<void> {
    try {
      const mode = this.getMode();
      const c = { ...spec, ...(mode === 'entscheider' ? spec.entscheider : spec.entdecker) };
      this.log.push({ title: this.i18n.resolve(c.title), requested: !!o.requested || this.userActive(), t: Math.round(performance.now()) });
      if (this.log.length > 100) this.log.shift();
    } catch {
      /* logging only */
    }
    return new Promise((resolve) => {
      if (this.openCount > 0) {
        this.queue.push({ spec, resolve });
        return;
      }
      this.show(spec, resolve);
    });
  }

  private show(spec: InfoCardSpec, resolve: () => void): void {
    this.openCount++;
    const card = h('div', { class: 'modal infocard', role: 'dialog' });
    let raf = 0;
    const render = (): void => {
      cancelAnimationFrame(raf);
      card.replaceChildren(...this.build(spec, () => close(), (r) => (raf = r)));
    };
    const unsub = this.i18n.onChange(render);
    render();
    this.audio.play('open');
    const close = this.modals.open('infocard', card, {
      onClose: () => {
        unsub();
        cancelAnimationFrame(raf);
        this.openCount--;
        this.currentTitle = null;
        this.audio.play('close');
        resolve();
        const next = this.queue.shift();
        if (next) window.setTimeout(() => this.show(next.spec, next.resolve), 200);
      },
      onKey: (code) => {
        if (code === 'KeyE' || code === 'Enter' || code === 'Space') {
          close();
          return true;
        }
        return false;
      },
    });
  }

  private build(spec: InfoCardSpec, close: () => void, setRaf: (id: number) => void): HTMLElement[] {
    const mode = this.getMode();
    const c: InfoCardContent = { ...spec, ...(mode === 'entscheider' ? spec.entscheider : spec.entdecker) };
    const r = (t: Text | undefined | null): string => (t == null ? '' : this.i18n.resolve(t));
    this.currentTitle = r(c.title);
    const out: HTMLElement[] = [h('div', { class: 'corner-tl' }), h('div', { class: 'corner-br' })];
    out.push(h('button', { class: 'x', 'aria-label': r({ key: 'core.hud.close' }), onclick: () => close() }, '✕'));
    if (c.eyebrow) out.push(h('div', { class: 'eyebrow' }, r(c.eyebrow)));
    out.push(h('h2', null, r(c.title)));

    const text = h('div', { class: 'text' });
    if (c.chips?.length) text.appendChild(h('div', { class: 'chips', style: 'display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px' }, ...c.chips.map((x) => chipElement(this.i18n, x.type, x.source))));
    const paras = c.body == null ? [] : Array.isArray(c.body) ? c.body : [c.body];
    if (c.illustrative)
      text.appendChild(h('div', { class: 'illus' }, h('span', { class: 'tag warn' }, r({ key: 'core.card.illustrative' })), r(c.illustrativeNote ?? { key: 'core.card.illustrativeNote' })));
    if (c.metrics?.length) {
      const m = h('div', { class: 'metrics' });
      for (const x of c.metrics)
        m.appendChild(
          h('div', { class: 'metric' }, h('div', { class: 'k' }, r(x.label)), h('div', { class: 'v', html: `${escapeHtml(String(x.value))}${x.unit ? `<small>${escapeHtml(x.unit)}</small>` : ''}` }), x.note ? h('div', { class: 'n' }, r(x.note)) : null, x.chip ? h('div', { style: 'margin-top:6px' }, chipElement(this.i18n, x.chip, x.chipSource)) : null),
        );
      text.appendChild(m);
    }
    for (const p of paras) text.appendChild(h('p', { html: richText(r(p)) }));
    if (c.bullets?.length) text.appendChild(h('ul', null, ...c.bullets.map((b) => h('li', { html: richText(r(b)) }))));

    if (c.forDecisionMakers) {
      const fd = c.forDecisionMakers;
      const isObj = typeof fd === 'object' && fd !== null && !('de' in fd) && !('key' in fd) && typeof fd !== 'function';
      const box = h('div', { class: `exec${mode === 'entscheider' ? ' prominent' : ''}` }, h('div', { class: 'eyebrow' }, '// ' + r({ key: 'core.card.forDecisionMakers' })));
      if (isObj) {
        const o = fd as { title?: Text; body?: Text | Text[]; bullets?: Text[] };
        if (o.title) box.appendChild(h('h3', null, r(o.title)));
        const bp = o.body == null ? [] : Array.isArray(o.body) ? o.body : [o.body];
        for (const p of bp) box.appendChild(h('p', { html: richText(r(p)) }));
        if (o.bullets?.length) box.appendChild(h('ul', null, ...o.bullets.map((b) => h('li', { html: richText(r(b)) }))));
      } else box.appendChild(h('p', { html: richText(r(fd as Text)) }));
      if (mode === 'entscheider') text.insertBefore(box, text.firstChild);
      else text.appendChild(box);
    }

    const grid = h('div', { class: c.diagram ? 'grid with-diagram' : 'grid' }, text);
    if (c.diagram) {
      const d = c.diagram;
      const wrap = h('div', { class: 'diagram' });
      if ('svg' in d) {
        wrap.innerHTML = d.svg;
      } else {
        const canvas = h('canvas');
        wrap.appendChild(canvas);
        const t0 = performance.now();
        const paint = (): void => {
          const w = Math.max(200, Math.round(wrap.clientWidth - 28 || 360));
          const hh = Math.round(w / (d.aspect ?? 4 / 3));
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          if (canvas.width !== w * dpr || canvas.height !== hh * dpr) {
            canvas.width = w * dpr;
            canvas.height = hh * dpr;
          }
          const g = canvas.getContext('2d')!;
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          g.clearRect(0, 0, w, hh);
          try {
            d.draw(g, w, hh, (performance.now() - t0) / 1000);
          } catch (err) {
            console.error('[infocard] diagram draw threw', err);
            return;
          }
          if (d.animate) setRaf(requestAnimationFrame(paint));
        };
        setRaf(requestAnimationFrame(paint));
      }
      if (d.caption) wrap.appendChild(h('div', { class: 'cap' }, r(d.caption)));
      grid.appendChild(wrap);
    }
    out.push(grid);
    out.push(
      h(
        'div',
        { class: 'foot' },
        h('div', { class: 'hints' }, kbd('E'), kbd('Esc'), r({ key: 'core.hud.close' })),
        h('button', { class: 'btn primary', onclick: () => close() }, r(c.closeLabel ?? { key: 'core.card.close' })),
      ),
    );
    return out;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
