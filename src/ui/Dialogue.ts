import type { I18n } from '@/i18n/I18n';
import type { Text } from '@/core/types';
import type { AudioSystem } from '@/systems/Audio';
import { h, kbd } from './dom';

export type DialogueLine = Text | { speaker?: Text; text: Text; /** seconds to stay after typing (auto) */ hold?: number };

export interface SayOptions {
  /** Default speaker for lines without one. Default: EMI. */
  speaker?: Text;
  /** Replace whatever is currently being said instead of queueing. */
  interrupt?: boolean;
  /** Wait for Enter/E instead of auto-advancing. */
  manual?: boolean;
  /** Zone id that queued the lines: queued (not yet shown) lines are dropped when the player leaves that zone. */
  owner?: string;
}

interface QueuedLine {
  speaker: Text;
  text: Text;
  hold: number | null;
  manual: boolean;
  owner: string | null;
  /** a repeat from the Funk-Log (not logged again) */
  repeat?: boolean;
  resolve?: () => void;
}

/** One line of the Funk-Log (re-resolved on a language switch). */
export interface RadioLogEntry {
  speaker: Text;
  text: Text;
  at: number;
}

/** how many lines the Funk-Log keeps */
const LOG_SIZE = 20;

const DEFAULT_SPEAKER: Text = { de: 'EMI · Academy-Guide', en: 'EMI · Academy guide' };
const CPS = 48; // typewriter characters per second

/** Speaker box with typewriter text. Auto-advances by default; Enter advances / skips. */
export class Dialogue {
  readonly root: HTMLElement;
  private speakerEl = h('div', { class: 'eyebrow teal' });
  private textEl = h('div', { class: 'text' });
  private dotsEl = h('div', { class: 'dots' });
  private hintEl = h('div', { class: 'hint' });
  private queue: QueuedLine[] = [];
  private current: QueuedLine | null = null;
  private full = '';
  private shown = 0;
  private holdLeft = 0;
  private lineIndex = 0;
  private batchSize = 0;
  private typeTick = 0;
  /** the Funk-Log: the last lines that were shown, oldest first (the Pass lists them, Enter repeats the last) */
  readonly history: RadioLogEntry[] = [];

  constructor(
    private i18n: I18n,
    private audio: AudioSystem,
  ) {
    this.root = h(
      'div',
      { id: 'dialogue', class: 'glass hairline' },
      h('div', { class: 'avatar' }),
      h('div', { class: 'body' }, this.speakerEl, this.textEl, h('div', { class: 'foot' }, this.hintEl, this.dotsEl)),
    );
    i18n.onChange(() => {
      if (!this.current) return;
      this.full = this.i18n.resolve(this.current.text);
      this.shown = Math.min(this.shown, this.full.length);
      this.speakerEl.textContent = this.i18n.resolve(this.current.speaker);
      this.renderHint();
    });
  }

  get active(): boolean {
    return !!this.current;
  }

  /** a line is on screen or queued (ctx.hud.dialogueBusy) */
  get busy(): boolean {
    return !!this.current || this.queue.length > 0;
  }

  /**
   * Called once when the queue has run empty and the last line has finished (or was stopped), after
   * the current call stack (an interrupting say() that refills the queue at once is not idle). The
   * game layer turns it into the 'dialogue:idle' event.
   */
  onIdle: (() => void) | null = null;
  private idlePending = false;

  private notifyIdle(): void {
    if (this.idlePending) return;
    this.idlePending = true;
    queueMicrotask(() => {
      this.idlePending = false;
      if (!this.busy) this.onIdle?.();
    });
  }

  get currentText(): { speaker: string; text: string } | null {
    return this.current ? { speaker: this.i18n.resolve(this.current.speaker), text: this.full } : null;
  }

  say(lines: DialogueLine | DialogueLine[], opts: SayOptions = {}): Promise<void> {
    const arr = Array.isArray(lines) ? lines : [lines];
    if (opts.interrupt) this.stop();
    return new Promise((resolve) => {
      const items: QueuedLine[] = arr.map((l) => {
        const isObj = typeof l === 'object' && l !== null && 'text' in l;
        return {
          speaker: (isObj && l.speaker) || opts.speaker || DEFAULT_SPEAKER,
          text: isObj ? l.text : (l as Text),
          hold: isObj && l.hold != null ? l.hold : null,
          manual: !!opts.manual,
          owner: opts.owner ?? null,
        };
      });
      if (!items.length) return resolve();
      items[items.length - 1].resolve = resolve;
      this.queue.push(...items);
      if (!this.current) {
        this.batchSize = this.queue.length;
        this.lineIndex = 0;
        this.next();
      } else this.batchSize += items.length;
    });
  }

  /** Enter with no line on screen: EMI's last line again (Funk-Log). false when there is none or one is showing. */
  repeatLast(): boolean {
    const last = this.history[this.history.length - 1];
    if (this.busy || !last) return false;
    this.queue.push({ speaker: last.speaker, text: last.text, hold: null, manual: false, owner: null, repeat: true });
    this.batchSize = 1;
    this.lineIndex = 0;
    this.next();
    return true;
  }

  /** Clear everything (pending promises resolve). */
  stop(): void {
    const all = [this.current, ...this.queue];
    const had = all.some(Boolean);
    this.queue = [];
    this.current = null;
    for (const l of all) l?.resolve?.();
    this.root.classList.remove('show');
    if (had) this.notifyIdle();
  }

  /**
   * Drop the queued (not yet shown) lines of one owner, e.g. when the player walks away from
   * that zone: its EMI's remaining lines must not follow the player across the island.
   * The line currently on screen finishes normally. Pending promises resolve.
   */
  dropQueued(owner: string): void {
    if (!this.queue.some((l) => l.owner === owner)) return;
    const keep: QueuedLine[] = [];
    for (const l of this.queue) {
      if (l.owner === owner) l.resolve?.();
      else keep.push(l);
    }
    this.batchSize -= this.queue.length - keep.length;
    this.queue = keep;
    if (this.current) this.renderDots();
  }

  /** Enter / E: finish typing, or go to the next line. */
  advance(): void {
    if (!this.current) return;
    if (this.shown < this.full.length) {
      this.shown = this.full.length;
      this.textEl.textContent = this.full;
      this.holdLeft = this.holdFor(this.current);
      return;
    }
    this.finishLine();
  }

  private holdFor(l: QueuedLine): number {
    return l.hold ?? Math.max(2.2, this.full.length / 15);
  }

  private finishLine(): void {
    const l = this.current;
    this.current = null;
    l?.resolve?.();
    this.next();
  }

  private next(): void {
    const l = this.queue.shift();
    if (!l) {
      this.root.classList.remove('show');
      this.batchSize = 0;
      this.notifyIdle();
      return;
    }
    this.current = l;
    if (!l.repeat) {
      this.history.push({ speaker: l.speaker, text: l.text, at: Date.now() });
      if (this.history.length > LOG_SIZE) this.history.shift();
    }
    this.full = this.i18n.resolve(l.text);
    this.shown = 0;
    this.holdLeft = this.holdFor(l);
    this.lineIndex++;
    this.speakerEl.textContent = this.i18n.resolve(l.speaker);
    this.textEl.textContent = '';
    this.renderDots();
    this.renderHint();
    this.root.classList.add('show');
    this.audio.play('open', { volume: 0.5, pitch: 1.2 });
  }

  private renderDots(): void {
    this.dotsEl.replaceChildren();
    const n = Math.min(this.batchSize, 8);
    if (n <= 1) return;
    for (let i = 1; i <= n; i++) this.dotsEl.appendChild(h('i', { class: i <= this.lineIndex ? 'on' : '' }));
  }

  private renderHint(): void {
    this.hintEl.replaceChildren(kbd(this.i18n.t('core.hud.enter')), ' ', this.i18n.t('core.hud.next'));
  }

  update(dt: number): void {
    const l = this.current;
    if (!l) return;
    if (this.shown < this.full.length) {
      const before = Math.floor(this.shown);
      this.shown = Math.min(this.full.length, this.shown + dt * CPS);
      const now = Math.floor(this.shown);
      if (now !== before) {
        this.textEl.textContent = this.full.slice(0, now);
        this.typeTick += now - before;
        if (this.typeTick >= 3) {
          this.typeTick = 0;
          this.audio.play('type', { volume: 0.6 });
        }
      }
      return;
    }
    if (l.manual) return;
    this.holdLeft -= dt;
    if (this.holdLeft <= 0) this.finishLine();
  }
}
