/**
 * Small DOM helpers for the hangar's operate panels (hud.css classes: .btn, .seg, .eyebrow, .mono,
 * .chip, .op-row, kbd). Panels stay ≤ 35 words at open (plan §4 conventions): the key legend is kbd
 * caps plus one word each, numbers carry their chip in the same row.
 */
import type { ChipType, Text, ZoneContext } from '@/core/zones';

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
  if (testId) b.dataset.th = testId;
  return b;
}

/** A key legend row: [W][S] Tempo · [A][D] drehen … (`keys` caps, then the word). */
export function legend(items: [string[], string][]): HTMLElement {
  const row = el('div', 'mono', undefined, 'display:flex;flex-wrap:wrap;gap:4px 10px;font-size:11.5px;color:var(--text-2);margin-top:6px');
  for (const [caps, word] of items) {
    const it = el('span', 'legend', undefined, 'display:inline-flex;align-items:center;gap:3px');
    for (const c of caps) it.append(el('kbd', 'kbd', c, 'font-size:10.5px;padding:0 4px'));
    it.append(el('span', '', word));
    row.append(it);
  }
  return row;
}

/** A value row with its chip: „Vertrauen richtig 4/6 [SIM · LIVE]“. */
export function chipRow(ctx: ZoneContext, chip: ChipType, source?: Text): { el: HTMLElement; set(text: string): void } {
  const row = el('div', 'mono row', undefined, 'display:flex;align-items:center;gap:8px;font-size:12.5px;margin-top:6px;color:var(--text)');
  const v = el('span', '', '', 'flex:1');
  row.append(v, ctx.ui.chip(chip, source));
  return {
    el: row,
    set(text) {
      v.textContent = text;
    },
  };
}

/** A segmented control (one value of a few). */
export function segmented<T extends string | number>(items: { value: T; label: string }[], current: T, onPick: (v: T) => void, testPrefix: string): { el: HTMLElement; set(v: T): void; setDisabled(d: boolean): void } {
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
