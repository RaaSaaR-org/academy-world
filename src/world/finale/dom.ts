/** Minimal DOM helper for the finale's panels and modals (no engine UI imports). */
type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | null | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (attrs)
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (typeof v === 'function') e.addEventListener(k.replace(/^on/, ''), v as EventListener);
      else if (k === 'class') e.className = String(v);
      else if (k === 'style') e.setAttribute('style', String(v));
      else if (k === 'html') e.innerHTML = String(v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, String(v));
    }
  for (const c of children) if (c != null && c !== false) e.append(c);
  return e;
}

/** A canvas sized for the device pixel ratio; draw in CSS pixels after `prep()`. */
export function hiCanvas(w: number, h: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; prep(): CanvasRenderingContext2D } {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const canvas = el('canvas', { width: Math.round(w * dpr), height: Math.round(h * dpr), style: `width:${w}px;height:${h}px` });
  const g = canvas.getContext('2d')!;
  return {
    canvas,
    g,
    prep() {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      return g;
    },
  };
}
