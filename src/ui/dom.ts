/** Tiny hyperscript helper for HUD DOM. */
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | null | undefined> & {
  class?: string;
  style?: string;
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

const GREEK = /[\u0370-\u03FF\u1F00-\u1FFF]+/g;

/**
 * Text node(s) for a string. Greek runs (σ, κ, θ, λ, μ…) are wrapped in `.keep-case` spans so
 * CSS `text-transform: uppercase` (eyebrows, metric and row labels) cannot turn σ into Σ.
 */
export function textNodes(s: string): Node {
  if (!/[\u0370-\u03FF\u1F00-\u1FFF]/.test(s)) return document.createTextNode(s);
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of s.matchAll(GREEK)) {
    if (m.index! > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
    const sp = document.createElement('span');
    sp.className = 'keep-case';
    sp.textContent = m[0];
    frag.appendChild(sp);
    last = m.index! + m[0].length;
  }
  if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
  return frag;
}

/** Uppercase for canvas text that keeps Greek symbols (σ stays σ, never Σ). */
export function upperKeepGreek(s: string): string {
  return s.replace(/[^\u0370-\u03FF\u1F00-\u1FFF]+/g, (r) => r.toUpperCase());
}

export function append(el: Element, children: (Child | Child[])[]): void {
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? textNodes(String(c)) : c);
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** HTML-escape a string (for building small innerHTML snippets safely). */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Minimal inline markup for zone copy: **bold** → <strong>, line breaks kept.
 * Input is escaped first, so zones cannot inject HTML by accident.
 */
export function richText(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keyboard-focusable controls inside `root`, in tab order (visible ones only). */
export function focusables(root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => e.getClientRects().length > 0 && !e.closest('[inert]'));
}

/**
 * Re-render `root` without losing the keyboard's place (C5): the control that had focus is focused
 * again by its position among the focusable controls (menus rebuild their DOM on every click).
 */
export function keepFocus(root: HTMLElement, rebuild: () => void): void {
  const a = document.activeElement;
  const i = a instanceof HTMLElement && a !== root && root.contains(a) ? focusables(root).indexOf(a) : -1;
  rebuild();
  if (i >= 0) {
    const list = focusables(root);
    (list[i] ?? list[list.length - 1])?.focus({ preventScroll: true });
  }
}

/**
 * Move the focus to the next / previous control inside `root` and wrap around (C5). The menus manage
 * Tab themselves: Safari's default Tab skips buttons, and focus must not leave a dialog.
 */
export function cycleFocus(root: HTMLElement, back: boolean): void {
  const items = focusables(root);
  if (!items.length) {
    root.focus({ preventScroll: true });
    return;
  }
  const a = document.activeElement;
  const i = a instanceof HTMLElement ? items.indexOf(a) : -1;
  const next = i < 0 ? (back ? items.length - 1 : 0) : (i + (back ? -1 : 1) + items.length) % items.length;
  items[next].focus({ preventScroll: true });
}

export function kbd(label: string, accent = false): HTMLElement {
  return h('span', { class: accent ? 'kbd accent' : 'kbd' }, label);
}

/** Show with a CSS transition: adds `.show` on the next frame. */
export function showAnimated(el: HTMLElement): void {
  el.classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
}

export function hideAnimated(el: HTMLElement, removeAfterMs = 0, remove = false): void {
  el.classList.remove('show');
  if (remove) window.setTimeout(() => el.remove(), removeAfterMs || 300);
}
