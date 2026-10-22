/**
 * Sonnenacker — small DOM helpers for the consoles and the cards (brand classes of hud.css: .btn, .seg,
 * .eyebrow, .mono, .chip, .op-row, .infocard). Every number in a console or card sits in a block with its
 * chip (plan §4 conventions, text-audit --chips): `row(label, value, chip)` builds such a block, and
 * `chipCard` opens a card whose paragraphs carry their chips (the engine's info card has no chip slot).
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
  if (testId) b.dataset.sa = testId;
  return b;
}

/** Segmented control; returns the element and a setter. */
export function seg<T extends string | number>(items: { value: T; label: string }[], current: T, onPick: (v: T) => void, testPrefix: string): { el: HTMLElement; set(v: T): void; disable(d: boolean): void } {
  const wrap = el('div', 'seg');
  const btns = items.map((it) => {
    const b = button(it.label, it.value === current ? 'on' : '', () => onPick(it.value), `${testPrefix}-${it.value}`);
    wrap.appendChild(b);
    return b;
  });
  return {
    el: wrap,
    set(v) {
      items.forEach((it, i) => btns[i].classList.toggle('on', it.value === v));
    },
    disable(d) {
      for (const b of btns) b.disabled = d;
    },
  };
}

/**
 * A readout block: label, value and its chip in one `.row` (the chip scan's block). `value` may be
 * updated later through the returned setter.
 */
export function row(ctx: ZoneContext, label: string, chip: ChipType | null, source?: Text): { el: HTMLElement; set(v: string): void; label(s: string): void; chip(type: ChipType | null): void; stack(): void } {
  const r = el('div', 'row mono', undefined, 'display:flex;align-items:center;gap:8px;font-size:12.5px;margin-top:5px;color:var(--text-2)');
  const k = el('span', '', label, 'flex:1');
  const v = el('span', '', '–', 'color:var(--text);font-weight:500');
  const c = el('span');
  r.append(k, v, c);
  const setChip = (t: ChipType | null): void => {
    c.replaceChildren(...(t ? [ctx.ui.chip(t, source)] : []));
  };
  setChip(chip);
  return {
    el: r,
    set(s) {
      v.textContent = s;
    },
    label(s) {
      k.textContent = s;
    },
    chip: setChip,
    /** a long value: the label as a caption line above it, the value and its chip(s) wrapping below */
    stack() {
      r.style.flexWrap = 'wrap';
      r.style.rowGap = '3px';
      k.style.flex = '1 0 100%';
      k.style.fontSize = '11px';
      k.style.letterSpacing = '.08em';
      k.style.textTransform = 'uppercase';
    },
  };
}

/** A 10-segment bar (the Startakku), with its percent and chip in one block. */
export function segBar(ctx: ZoneContext, label: string, chip: ChipType): { el: HTMLElement; set(frac: number, colour: string, note?: string): void } {
  const wrap = el('div', 'row', undefined, 'margin-top:8px');
  const head = el('div', 'mono', undefined, 'display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-2)');
  const name = el('span', '', label, 'flex:1');
  const pct = el('span', '', '0 %', 'color:var(--text);letter-spacing:.02em');
  head.append(name, pct, ctx.ui.chip(chip));
  const bars = el('div', '', undefined, 'display:grid;grid-template-columns:repeat(10,1fr);gap:3px;margin-top:5px');
  const segs = Array.from({ length: 10 }, () => {
    const s = el('i', '', undefined, 'display:block;height:9px;border-radius:2px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.08)');
    bars.appendChild(s);
    return s;
  });
  const note = el('div', 'mono', '', 'font-size:10.5px;color:var(--text-3);margin-top:3px;min-height:0');
  wrap.append(head, bars, note);
  return {
    el: wrap,
    set(frac, colour, n) {
      const lit = Math.round(Math.max(0, Math.min(1, frac)) * 10);
      segs.forEach((s, i) => {
        s.style.background = i < lit ? colour : 'rgba(255,255,255,0.07)';
        s.style.borderColor = i < lit ? colour : 'rgba(255,255,255,0.08)';
      });
      pct.textContent = `${Math.round(frac * 100)} %`;
      note.textContent = n ?? '';
      note.style.display = n ? '' : 'none';
    },
  };
}

/** A paragraph of a chip card: text, optional chip and its source line. */
export interface ChipPara {
  text: Text;
  chip?: ChipType;
  source?: Text;
}

/**
 * A card in the info card's look whose paragraphs carry their chips (requested only: from an E or a
 * button, never by itself). ≤ 35 words at open is the author's budget (text-audit counts `.text`).
 */
export function chipCard(ctx: ZoneContext, o: { eyebrow: Text; title: Text; paras: ChipPara[]; bullets?: ChipPara[] }): Promise<void> {
  const R = (t: Text): string => ctx.i18n.resolve(t);
  return ctx.hud.openModal((root, close) => {
    root.classList.add('infocard');
    root.append(el('div', 'corner-tl'), el('div', 'corner-br'));
    const x = button('✕', 'x', () => close());
    x.setAttribute('aria-label', ctx.lang === 'de' ? 'Schließen' : 'Close');
    root.append(x, el('div', 'eyebrow', R(o.eyebrow)), el('h2', '', R(o.title)));
    const text = el('div', 'text');
    for (const p of o.paras) {
      const pe = el('p', '', R(p.text) + ' ');
      if (p.chip) pe.append(ctx.ui.chip(p.chip, p.source));
      text.append(pe);
    }
    if (o.bullets?.length) {
      const ul = el('ul');
      for (const b of o.bullets) {
        const li = el('li', '', R(b.text) + ' ');
        if (b.chip) li.append(ctx.ui.chip(b.chip, b.source));
        ul.append(li);
      }
      text.append(ul);
    }
    root.append(text);
  }, { width: 640 });
}

/** A short mono line under a section (hints, the state of a step). */
export function note(text: string): HTMLElement {
  return el('div', 'mono', text, 'font-size:11.5px;color:var(--text-3);margin-top:6px');
}
