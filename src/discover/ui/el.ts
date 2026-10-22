/**
 * Discover's DOM helpers (WP-D0). The UI under src/discover/ui/ is shared by the 3D path and the stills
 * path, so it imports nothing the game's chunk has (not even src/ui/dom.ts): a shared module would move
 * into a new chunk the desktop game then loads too. Type imports are fine.
 */

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | null | undefined>;

/** Element with attributes (on* → listeners, `class`, booleans) and children. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (attrs)
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') e.className = String(v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, String(v));
    }
  for (const c of children.flat()) if (c != null && c !== false) e.append(typeof c === 'number' ? String(c) : c);
  return e;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const PATHS: Record<string, string> = {
  menu: 'M5 12h.01M12 12h.01M19 12h.01',
  prev: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  close: 'M6 6l12 12M18 6L6 18',
  up: 'M6 15l6-6 6 6',
};

/** A stroked 24×24 icon (aria-hidden; the button carries the label). */
export function icon(name: keyof typeof PATHS | string, size = 22): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', PATHS[name] ?? '');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', name === 'menu' ? '3.2' : '2');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(p);
  return svg;
}

let uid = 0;
/** A unique id for aria wiring. */
export function nextId(prefix: string): string {
  return `${prefix}-${++uid}`;
}

/** prefers-reduced-motion (false where matchMedia is missing). */
export function systemReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** The page's base URL (BASE_PATH, e.g. /academy-world/) for a public file. */
export function publicUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}
