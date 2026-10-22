/**
 * Small DOM + canvas helpers for the Regelgarten operate panels and in-world screens.
 * Brand: hud.css classes (.btn, .seg, .eyebrow, .mono, .chip, .op-row); colours from `css`.
 */
import { css } from '@/core/zones';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string, style?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (style) e.style.cssText = style;
  return e;
}

export function button(label: string, cls: string, onClick: () => void, testId?: string): HTMLButtonElement {
  const b = el('button', cls, label);
  b.type = 'button';
  b.onclick = (e) => {
    e.stopPropagation();
    onClick();
    b.blur();
  };
  if (testId) b.dataset.rg = testId;
  return b;
}

/** Segmented control. Returns the element and a setter to re-highlight. */
export function segmented<T extends string | number>(
  items: { value: T; label: string }[],
  current: T,
  onPick: (v: T) => void,
  testPrefix: string,
): { el: HTMLElement; set(v: T): void; setDisabled(d: boolean): void } {
  const wrap = el('div', 'seg');
  const btns: HTMLButtonElement[] = [];
  for (const it of items) {
    const b = button(it.label, it.value === current ? 'on' : '', () => onPick(it.value), `${testPrefix}-${it.value}`);
    btns.push(b);
    wrap.appendChild(b);
  }
  return {
    el: wrap,
    set(v) {
      items.forEach((it, i) => btns[i].classList.toggle('on', it.value === v));
    },
    setDisabled(d) {
      for (const b of btns) b.disabled = d;
      wrap.style.opacity = d ? '0.45' : '';
    },
  };
}

/** Labelled range slider (brand accent). */
export function slider(o: { label: string; min: number; max: number; step: number; value: number; format: (v: number) => string; onInput: (v: number) => void; testId: string }): {
  el: HTMLElement;
  set(v: number): void;
} {
  const row = el('div', '', undefined, 'display:grid;grid-template-columns:62px 1fr 64px;gap:10px;align-items:center;margin-top:6px');
  const k = el('span', 'mono', o.label, 'font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3)');
  const input = el('input') as HTMLInputElement;
  input.type = 'range';
  input.min = String(o.min);
  input.max = String(o.max);
  input.step = String(o.step);
  input.value = String(o.value);
  input.style.cssText = 'width:100%;accent-color:var(--orange)';
  input.dataset.rg = o.testId;
  const v = el('span', 'mono', o.format(o.value), 'font-size:12.5px;text-align:right;color:var(--text)');
  input.addEventListener('input', () => {
    const n = Number(input.value);
    v.textContent = o.format(n);
    o.onInput(n);
  });
  input.addEventListener('keydown', (e) => e.stopPropagation());
  row.append(k, input, v);
  return {
    el: row,
    set(n) {
      input.value = String(n);
      v.textContent = o.format(n);
    },
  };
}

export function sectionLabel(text: string): HTMLElement {
  return el('div', 'mono', text, 'font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3);margin:12px 0 4px');
}

// ── canvas helpers ───────────────────────────────────────────────────────────

export function canvasChip(g: CanvasRenderingContext2D, x: number, y: number, text: string, kind: 'sim' | 'illustrativ' | 'richtwert', size = 11): number {
  g.save();
  g.font = `500 ${size}px "Geist Mono", ui-monospace, monospace`;
  const w = g.measureText(text).width + size * 1.4;
  const h = size * 1.7;
  const fill = kind === 'sim' ? 'rgba(45,212,191,0.15)' : kind === 'illustrativ' ? 'rgba(251,191,36,0.15)' : 'rgba(0,0,0,0)';
  const stroke = kind === 'sim' ? 'rgba(45,212,191,0.45)' : kind === 'illustrativ' ? 'rgba(251,191,36,0.45)' : css.border;
  const col = kind === 'sim' ? css.teal : kind === 'illustrativ' ? css.warning : css.textSecondary;
  g.beginPath();
  g.roundRect(x, y, w, h, h / 2);
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = stroke;
  g.lineWidth = 1;
  g.stroke();
  g.fillStyle = col;
  g.fillText(text, x + size * 0.7, y + h * 0.7);
  g.restore();
  return w;
}

/**
 * Rolling θ(t) plot without allocations: a Float32Array ring buffer sampled at a fixed rate,
 * drawn with the ±30° fail lines. Used in the B panel, on the Leitstand screen and in the transfer view.
 */
export class LivePlot {
  readonly buf: Float32Array;
  head = 0;
  count = 0;
  private acc = 0;
  /** marks (sample index) for pushes / gusts */
  readonly marks = new Int32Array(8).fill(-1);
  private markHead = 0;
  constructor(
    readonly seconds = 10,
    readonly rate = 50,
  ) {
    this.buf = new Float32Array(seconds * rate);
  }
  reset(): void {
    this.head = 0;
    this.count = 0;
    this.acc = 0;
    this.marks.fill(-1);
  }
  /** feed the current angle (degrees) with the frame dt */
  push(deg: number, dt: number): void {
    this.acc += dt;
    const step = 1 / this.rate;
    while (this.acc >= step) {
      this.acc -= step;
      this.buf[this.head] = deg;
      this.head = (this.head + 1) % this.buf.length;
      if (this.count < this.buf.length) this.count++;
    }
  }
  mark(): void {
    this.marks[this.markHead] = this.head;
    this.markHead = (this.markHead + 1) % this.marks.length;
  }
  draw(g: CanvasRenderingContext2D, w: number, h: number, o: { range?: number; bg?: string; label?: string; color?: string; fail?: number; font?: number; lineWidth?: number }): void {
    const range = o.range ?? 35;
    const fail = o.fail ?? 30;
    const fs = o.font ?? 10;
    const padL = fs * 3.4,
      padR = 8,
      padT = fs * 1.8,
      padB = fs * 1.2;
    if (o.bg) {
      g.fillStyle = o.bg;
      g.fillRect(0, 0, w, h);
    } else g.clearRect(0, 0, w, h);
    const pw = w - padL - padR,
      ph = h - padT - padB;
    const Y = (d: number): number => padT + ph * 0.5 - (d / range) * ph * 0.5;
    g.lineWidth = 1;
    g.strokeStyle = css.borderSubtle;
    g.font = `${fs}px "Geist Mono", ui-monospace, monospace`;
    g.fillStyle = css.textMuted;
    for (const d of [-fail, -15, 0, 15, fail]) {
      const y = Y(d);
      g.beginPath();
      g.moveTo(padL, y);
      g.lineTo(padL + pw, y);
      g.stroke();
      const lab = `${d > 0 ? '+' : ''}${d}°`;
      g.fillText(lab, padL - 4 - g.measureText(lab).width, y + fs * 0.35);
    }
    // fail lines
    g.strokeStyle = 'rgba(255,103,0,0.55)';
    g.setLineDash([5, 4]);
    for (const d of [-fail, fail]) {
      g.beginPath();
      g.moveTo(padL, Y(d));
      g.lineTo(padL + pw, Y(d));
      g.stroke();
    }
    g.setLineDash([]);
    if (o.label) {
      g.fillStyle = css.textSecondary;
      g.fillText(o.label, padL, fs * 1.15);
    }
    const n = this.buf.length;
    const x0 = padL + pw * (1 - this.count / n);
    // marks
    g.strokeStyle = 'rgba(245,245,244,0.35)';
    for (let i = 0; i < this.marks.length; i++) {
      const m = this.marks[i];
      if (m < 0) continue;
      const age = (this.head - m + n) % n;
      if (age >= this.count) continue;
      const x = padL + pw * (1 - age / n);
      g.beginPath();
      g.moveTo(x, padT);
      g.lineTo(x, padT + ph);
      g.stroke();
    }
    if (this.count < 2) return;
    g.save();
    g.beginPath();
    g.rect(padL, padT - 2, pw, ph + 4);
    g.clip();
    g.strokeStyle = o.color ?? css.teal;
    g.lineWidth = o.lineWidth ?? 1.6;
    g.beginPath();
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head - this.count + i + n) % n;
      const x = x0 + (pw * i) / n;
      const y = Y(Math.max(-range, Math.min(range, this.buf[idx])));
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.restore();
  }
}

/** Format a number with the locale's decimal separator. */
export function fmt(lang: string, v: number, digits = 1): string {
  const s = v.toFixed(digits);
  return lang === 'de' ? s.replace('.', ',') : s;
}

export function signed(lang: string, v: number, digits = 1): string {
  return (v >= 0 ? '+' : '−') + fmt(lang, Math.abs(v), digits);
}
