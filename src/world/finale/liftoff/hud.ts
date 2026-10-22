import type { ChipType, Text, ZoneContext } from '@/core/zones';
import type { PanelHandle } from '@/ui/Hud';
import { el } from '../dom';
import { L } from './strings';

/**
 * The lift-off's HUD (plan §4.15): a telemetry card in the right column (every number with its chip:
 * FIKTION for the island, SIM · LIVE for the cloud's gust, TRAUM for the Flugmodell, QUELLE for the
 * formula), the hold-to-skip ring (bottom right), and the outside shot's chip „R-3 · AUSSENKAMERA · LIVE“
 * with its own telemetry (top left). DOM only; the director writes it at ≤ 10 Hz.
 */
export interface HudRow {
  k: Text;
  v: string;
  chip?: ChipType;
  tone?: 'teal' | 'accent' | 'warn';
}

export interface LiftoffHud {
  show(on: boolean): void;
  setTitle(t: Text): void;
  setRows(rows: readonly HudRow[]): void;
  /** the T = W card (null hides it) */
  setFormula(f: { line: string } | null): void;
  /** a large state word (HÖHE HALTEN, RÜCKFALL AUF BESTAND) or null */
  setState(t: Text | null, tone?: 'teal' | 'warn'): void;
  /** the outside shot's chip and line (null hides) */
  setShot(line: string | null): void;
  /** the skip ring 0…1 (null hides the whole skip hint) */
  setSkip(k: number | null): void;
  /** the [C] hint for an outside shot on offer */
  setCamKey(on: boolean): void;
  remove(): void;
}

const CSS = `
#hud .lo-card { min-width: 230px; }
#hud .lo-card .lo-head { display: flex; justify-content: space-between; gap: 8px; align-items: center; margin-bottom: 6px; }
#hud .lo-card .lo-rows { display: grid; grid-template-columns: auto 1fr auto; gap: 3px 10px; align-items: baseline; font-family: var(--font-mono); font-size: 12.5px; }
#hud .lo-card .lo-rows .k { color: var(--text-3); text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; }
#hud .lo-card .lo-rows .v { color: var(--text); text-align: right; font-variant-numeric: tabular-nums; }
#hud .lo-card .lo-rows .v.teal { color: var(--teal); }
#hud .lo-card .lo-rows .v.accent { color: var(--orange-light); }
#hud .lo-card .lo-rows .v.warn { color: var(--warning); }
#hud .lo-card .lo-rows .c { justify-self: end; }
#hud .lo-card .lo-rows .chip { font-size: 9.5px; padding: 1px 5px; }
#hud .lo-card .lo-state { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.14em; color: var(--teal); margin-top: 6px; }
#hud .lo-card .lo-state.warn { color: var(--warning); }
#hud .lo-card .lo-formula { margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--border-subtle); }
#hud .lo-card .lo-formula .f { font-family: var(--font-mono); font-size: 15px; color: var(--text); }
#hud .lo-card .lo-formula .l { font-family: var(--font-mono); font-size: 12px; color: var(--text-2); margin-top: 2px; }
#hud .lo-card .lo-formula .s { font-size: 11px; color: var(--text-3); margin-top: 3px; display: flex; gap: 6px; align-items: center; }
#lo-skip { position: absolute; right: 22px; bottom: 22px; display: flex; gap: 8px; align-items: center; font-family: var(--font-mono); font-size: 12px; color: var(--text-2); letter-spacing: 0.04em; pointer-events: none; opacity: 0.85; z-index: 5; }
#lo-skip .ring { width: 22px; height: 22px; border-radius: 50%; background: conic-gradient(var(--teal) calc(var(--k) * 360deg), rgba(255,255,255,0.14) 0); -webkit-mask: radial-gradient(circle, transparent 6.5px, #000 7.5px); mask: radial-gradient(circle, transparent 6.5px, #000 7.5px); }
#lo-skip .cam { margin-right: 14px; color: var(--text-3); }
#lo-shot { position: absolute; left: 24px; top: 22px; display: flex; flex-direction: column; gap: 6px; font-family: var(--font-mono); font-size: 12.5px; color: var(--text); pointer-events: none; z-index: 5; text-shadow: 0 1px 6px rgba(0,0,0,0.6); }
#lo-shot .tag { align-self: flex-start; border: 1px solid rgba(45,212,191,0.55); color: var(--teal); background: rgba(12,10,9,0.55); border-radius: 999px; padding: 3px 10px; letter-spacing: 0.1em; font-size: 11px; }
#lo-shot .tag::before { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #f87171; margin-right: 7px; vertical-align: 0; }
#hud.lo-running #telemetry, #hud.lo-running #objective { opacity: 0 !important; transition: opacity 0.4s ease; }
#hud.lo-shot .lo-card, #hud.lo-shot .lo-checkcard { opacity: 0; transition: opacity 0.3s ease; }
`;

export function buildLiftoffHud(ctx: ZoneContext): LiftoffHud {
  const T = (t: Text): string => ctx.i18n.resolve(t);
  if (!document.getElementById('style-wp13-liftoff')) {
    const s = document.createElement('style');
    s.id = 'style-wp13-liftoff';
    s.textContent = CSS;
    document.head.append(s);
  }
  let panel: PanelHandle | null = null;
  let title: Text = L.hudTitle;
  const head = el('div', { class: 'lo-head' });
  const rowsEl = el('div', { class: 'lo-rows' });
  const stateEl = el('div', { class: 'lo-state' });
  const formulaEl = el('div', { class: 'lo-formula' });
  const root = document.getElementById('hud') ?? document.body;
  const skipEl = el('div', { id: 'lo-skip' });
  const camEl = el('span', { class: 'cam' });
  const ringEl = el('span', { class: 'ring' });
  const skipLabel = el('span');
  skipEl.append(camEl, ringEl, skipLabel);
  const shotEl = el('div', { id: 'lo-shot' });
  const shotTag = el('span', { class: 'tag' });
  const shotLine = el('span');
  shotEl.append(shotTag, shotLine);
  let lastRows = '';
  let rows: readonly HudRow[] = [];

  const renderHead = (): void => {
    head.replaceChildren(el('div', { class: 'eyebrow' }, T(title)), ctx.ui.chip('fiktion', L.fiction));
  };
  const renderRows = (): void => {
    rowsEl.replaceChildren(...rows.flatMap((r) => [el('span', { class: 'k' }, T(r.k)), el('span', { class: `v ${r.tone ?? ''}` }, r.v), r.chip ? el('span', { class: 'c' }, ctx.ui.chip(r.chip)) : el('span')]));
  };
  ctx.i18n.onChange(() => {
    if (!panel) return;
    renderHead();
    renderRows();
    skipLabel.textContent = T(L.skip);
    shotTag.textContent = T(L.camChip);
    camEl.textContent = T(L.camKey);
  });

  return {
    show(on) {
      if (on && !panel) {
        panel = ctx.hud.panel({});
        panel.el.classList.add('lo-card');
        panel.el.replaceChildren(head, rowsEl, stateEl, formulaEl);
        renderHead();
        stateEl.style.display = 'none';
        formulaEl.style.display = 'none';
        skipLabel.textContent = T(L.skip);
        shotTag.textContent = T(L.camChip);
        camEl.textContent = T(L.camKey);
        camEl.style.display = 'none';
        root.append(skipEl, shotEl);
        shotEl.style.display = 'none';
        // the grounded telemetry strip and the route's objective would be wrong in the climb
        root.classList.add('lo-running');
      } else if (!on && panel) {
        panel.remove();
        panel = null;
        skipEl.remove();
        shotEl.remove();
        lastRows = '';
        root.classList.remove('lo-running', 'lo-shot');
      }
    },
    setTitle(t) {
      title = t;
      if (panel) renderHead();
    },
    setRows(r) {
      const key = r.map((x) => `${typeof x.k === 'object' && 'de' in x.k ? (x.k as { de: string }).de : ''}|${x.v}|${x.chip ?? ''}|${x.tone ?? ''}`).join(';');
      if (key === lastRows) return;
      lastRows = key;
      rows = r;
      renderRows();
    },
    setFormula(f) {
      if (!f) {
        formulaEl.style.display = 'none';
        return;
      }
      formulaEl.style.display = '';
      formulaEl.replaceChildren(el('div', { class: 'f' }, T(L.formula)), el('div', { class: 'l' }, f.line), el('div', { class: 's' }, ctx.ui.chip('quelle', L.formulaSrc), el('span', null, T(L.formulaSrc))));
    },
    setState(t, tone = 'teal') {
      stateEl.style.display = t ? '' : 'none';
      stateEl.className = `lo-state${tone === 'warn' ? ' warn' : ''}`;
      stateEl.textContent = t ? T(t) : '';
    },
    setShot(line) {
      shotEl.style.display = line ? '' : 'none';
      if (line) shotLine.textContent = line;
      // an outside shot is a picture: the cards step aside
      root.classList.toggle('lo-shot', !!line);
    },
    setSkip(k) {
      skipEl.style.display = k == null ? 'none' : '';
      ringEl.style.setProperty('--k', String(Math.max(0, Math.min(1, k ?? 0))));
    },
    setCamKey(on) {
      camEl.style.display = on ? '' : 'none';
    },
    remove() {
      this.show(false);
    },
  };
}
