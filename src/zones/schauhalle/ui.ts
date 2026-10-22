/**
 * DOM helpers and the hall's own styles (operate panels: Datenblatt, Lastenheft, compare stage,
 * Kurzlauf stands, Befundkarten). Built on the HUD's tokens (hud.css: --teal, --text-2, .chip, .btn).
 */
type Child = Node | string | number | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string | number | boolean | ((e: Event) => void) | null | undefined> | null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (attrs)
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') e.className = String(v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, String(v));
    }
  const add = (c: Child | Child[]): void => {
    if (Array.isArray(c)) c.forEach(add);
    else if (c == null || c === false) return;
    else e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return e;
}

const CSS = `
.sh { font-size: 14px; line-height: 1.42; color: var(--text); }
.sh .sh-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.sh h3 { font-family: var(--font-display); font-size: 21px; margin: 4px 0 2px; color: var(--text); letter-spacing: -0.01em; }
.sh .sh-vendor { color: var(--text-2); font-size: 12.5px; margin-bottom: 6px; }
.sh .chip.st-lieferbar { color: var(--teal); border-color: rgba(45, 212, 191, 0.4); }
.sh .chip.st-pilot, .sh .chip.st-angekuendigt { color: var(--warning); border-color: rgba(251, 191, 36, 0.4); }
.sh .row { display: grid; grid-template-columns: 92px 1fr auto; gap: 4px 10px; align-items: baseline; padding: 6px 0; border-top: 1px solid var(--border-subtle); }
.sh .row .k { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-2); }
.sh .row .v { font-size: 14px; }
.sh .row .c { grid-column: 2 / 4; color: var(--text-2); font-size: 12.5px; margin-top: -2px; }
.sh .row .chip { font-size: 10px; padding: 1px 7px; }
.sh .row.ka .v { color: var(--text-2); }
.sh .row.tap { cursor: pointer; border-radius: 6px; }
.sh .row.tap:hover { background: rgba(255, 255, 255, 0.05); }
.sh .row.ok { background: rgba(45, 212, 191, 0.10); box-shadow: inset 3px 0 0 var(--teal); padding-left: 8px; }
.sh .row.bad { background: rgba(248, 113, 113, 0.10); box-shadow: inset 3px 0 0 #F87171; padding-left: 8px; }
.sh .row.hint { background: rgba(251, 191, 36, 0.10); box-shadow: inset 3px 0 0 var(--warning); padding-left: 8px; }
.sh .btns { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.sh .more { margin-top: 8px; }
.sh .more[hidden] { display: none; }
.sh .src { color: var(--text-2); font-size: 11.5px; line-height: 1.45; margin-top: 8px; }
.sh .line { color: var(--text-2); font-size: 12.5px; margin-top: 4px; }
.sh .job { margin: 2px 0 8px; padding: 9px 11px; border: 1px solid rgba(255, 103, 0, 0.45); border-radius: 8px; background: rgba(255, 103, 0, 0.06); }
.sh .job .t { font-weight: 600; }
.sh .say { margin-top: 8px; font-size: 13.5px; }
.sh .say.good { color: var(--teal); }
.sh .say.bad { color: #F87171; }
.sh .cmp { display: grid; grid-template-columns: 96px 1fr 1fr; gap: 0 12px; }
.sh .cmp > div, .sh .cmp > .row > div { padding: 6px 0; border-top: 1px solid var(--border-subtle); font-size: 13.5px; }
.sh .cmp > .row > .k .chip { margin: 4px 0 0; }
.sh .cmp .cond { font-size: 11.5px; color: var(--text-2); margin-top: 2px; }
.sh .cmp .k { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-2); }
.sh .cmp .h { font-weight: 600; font-family: var(--font-display); font-size: 15px; border-top: none; }
.sh .cmp .chip { font-size: 9.5px; padding: 0 6px; margin-left: 4px; }
.sh .steps { display: flex; gap: 6px; margin: 6px 0 2px; }
.sh .steps i { flex: 1; height: 3px; border-radius: 2px; background: var(--border); }
.sh .steps i.on { background: var(--teal); }
.sh canvas { width: 100%; border-radius: 6px; display: block; margin-top: 8px; }
.befund { width: min(560px, calc(100vw - 32px)); padding: 22px 24px 18px; }
.befund h2 { font-family: var(--font-display); margin: 4px 0 10px; font-size: 22px; }
.befund .b-row { padding: 8px 0; border-top: 1px solid var(--border-subtle); }
.befund .b-row .k { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-2); display: block; margin-bottom: 3px; }
.befund .b-row .v { font-size: 14px; line-height: 1.45; }
.befund .b-row .chip { font-size: 9.5px; padding: 0 6px; margin-left: 6px; }
.befund .btns { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
`;

export function ensureCss(): void {
  if (document.getElementById('style-schauhalle')) return;
  const s = document.createElement('style');
  s.id = 'style-schauhalle';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** words as tools/text-audit.mjs counts them (tokens with a letter or a digit) */
export function countWords(t: string): number {
  return t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
