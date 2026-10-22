import { logoSvg } from '@/core/brand/logo3d';
import { h } from './dom';

export interface LoadingAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

/**
 * Boot screen with brand mark, progress bar and status line. Works before i18n is ready.
 * C8: it adopts the inline shell from index.html (#loading, painted before any script loads)
 * instead of building its own; the bar starts indeterminate (CSS only) until the first set().
 * The bar moves by transform (compositor only). C12: the same overlay shows a notice while the
 * WebGL context is lost and the friendly boot error with its actions.
 */
export class LoadingScreen {
  readonly root: HTMLElement;
  private bar: HTMLElement;
  private status: HTMLElement;
  private err: HTMLElement;
  private actions: HTMLElement;
  private p = 0;
  private next = 0;
  private hideTimer = 0;

  constructor() {
    const shell = document.getElementById('loading');
    if (shell && shell.querySelector('.bar > i') && shell.querySelector('.status')) {
      this.root = shell;
      this.bar = shell.querySelector('.bar > i') as HTMLElement;
      this.status = shell.querySelector('.status') as HTMLElement;
      this.err = (shell.querySelector('.err') as HTMLElement | null) ?? shell.appendChild(h('div', { class: 'err' }));
      this.actions = (shell.querySelector('.actions') as HTMLElement | null) ?? shell.appendChild(h('div', { class: 'actions' }));
    } else {
      this.bar = h('i');
      this.status = h('div', { class: 'status' });
      this.err = h('div', { class: 'err' });
      this.actions = h('div', { class: 'actions' });
      this.root = h(
        'div',
        { id: 'loading', class: 'indet' },
        h('div', { class: 'mark', html: logoSvg({ size: 76 }) }),
        h('div', { class: 'wm' }, 'Em', h('b', null, 'AI'), h('span', { style: 'color:#A8A29E;font-weight:500' }, ' Academy')),
        h('div', { class: 'bar progress' }, this.bar),
        this.status,
        this.err,
        this.actions,
      );
    }
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
  }

  /** `progress` is where this step starts; `next` (optional) where the following one begins — tick() creeps toward it. */
  set(progress: number, status: string, next?: number): void {
    this.root.classList.remove('indet');
    this.p = Math.min(1, Math.max(0, progress));
    this.next = Math.max(this.p, next ?? this.p);
    this.paint();
    this.status.textContent = status;
  }

  /** One sub-step inside the current step (ctx.yield() calls this): a share `f` of the remaining way. */
  tick(f = 0.25): void {
    if (this.next <= this.p) return;
    this.p += (this.next - this.p) * f;
    this.paint();
  }

  private paint(): void {
    this.bar.style.transform = `scaleX(${this.p.toFixed(4)})`;
  }

  /** C12d: friendly message, the technical text folded away, and buttons (e.g. „Erneut versuchen“). */
  error(title: string, o: { hint?: string; alt?: { text: string; lang: string }; detail?: string; detailLabel?: string; actions?: LoadingAction[] } = {}): void {
    this.show();
    this.root.classList.add('failed');
    this.err.replaceChildren(
      h('div', { class: 'err-title' }, title),
      ...(o.hint ? [h('div', { class: 'err-hint' }, o.hint)] : []),
      ...(o.alt ? [h('div', { class: 'err-hint err-alt', lang: o.alt.lang }, o.alt.text)] : []),
      ...(o.detail ? [h('details', { class: 'err-detail' }, h('summary', null, o.detailLabel ?? 'Details'), h('code', null, o.detail))] : []),
    );
    this.setActions(o.actions ?? []);
  }

  /** C12a: show the overlay again with a status line and an indeterminate bar (context lost). */
  notice(status: string): void {
    this.show();
    this.root.classList.add('indet');
    this.status.textContent = status;
    this.err.replaceChildren();
    this.setActions([]);
  }

  /** Text + buttons under the status line of a notice (e.g. „Neu laden“ when the context never comes back). */
  offer(text: string, actions: LoadingAction[]): void {
    this.err.replaceChildren(h('div', { class: 'err-hint' }, text));
    this.setActions(actions);
  }

  private setActions(actions: LoadingAction[]): void {
    this.actions.replaceChildren(
      ...actions.map((a) => {
        const b = h('button', { class: a.primary === false ? 'btn' : 'btn primary', type: 'button' }, a.label);
        b.addEventListener('click', a.onClick);
        return b;
      }),
    );
    (this.actions.querySelector('button') as HTMLButtonElement | null)?.focus();
  }

  private show(): void {
    window.clearTimeout(this.hideTimer);
    this.root.classList.remove('done', 'hidden', 'failed');
  }

  done(): void {
    this.root.classList.add('done');
    this.root.classList.remove('indet');
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.root.classList.add('hidden'), 700);
  }
}
