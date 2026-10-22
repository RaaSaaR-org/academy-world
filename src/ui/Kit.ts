/**
 * Measurement UI kit (GDD §5.5–5.7): source chips, Kennlinie (characteristic curve with
 * Wilson 95 % band), prediction slider ("Erst tippen, dann messen"), hint line, status
 * eyebrow and readouts. Brand rules: curves not pass/fail; illustrative values labelled.
 */
import * as THREE from 'three';
import type { I18n } from '@/i18n/I18n';
import type { Text } from '@/core/types';
import type { AudioSystem } from '@/systems/Audio';
import { css } from '@/core/brand/palette';
import { h, textNodes, upperKeepGreek } from './dom';
import type { ModalManager } from './Modals';

// ── styles of the Phase 7 UI pieces (WP1) ────────────────────────────────────

/**
 * Add a style sheet once (by id). The Phase 7 UI pieces of WP1 (credits page, loading card, Pass
 * sections, one-voice strip) carry their own rules, so hud.css stays untouched.
 */
export function ensureStyle(id: string, css: string): void {
  if (typeof document === 'undefined' || document.getElementById(`style-${id}`)) return;
  const el = document.createElement('style');
  el.id = `style-${id}`;
  el.textContent = css;
  document.head.appendChild(el);
}

// ── the loading card and the Bodencrew offer (plan §4.1, §5.8; WP1) ───────────

/** What a loading card shows: an area or a robot that is not ready (or failed). */
export interface LoadingCardSpec {
  /** the area's or the robot's name */
  name: Text;
  /** bytes so far / in all („{x} von {y} MB“); null or absent: an indeterminate bar */
  progress?: () => { loaded: number; total: number } | null;
  /** 'failed' shows „Erneut laden“ (and the crew offer once it is set) */
  state?: () => 'loading' | 'failed';
  /** „Erneut laden“ */
  retry?: () => void;
  /** §5.8: after two failed „Erneut laden“ on a ◆ station: „Bodencrew übernimmt“ for its system */
  crew?: { system: Text; accept: () => void } | null;
}

export interface LoadingCardHandle {
  readonly el: HTMLElement;
  /** re-read the spec (progress, state, crew) */
  update(patch?: Partial<LoadingCardSpec>): void;
  /** remove the card (a zone's card goes with its area anyway) */
  remove: () => void;
}

const LOADING_CSS = `
.loading-card { padding: 12px 14px 13px; pointer-events: auto; }
.loading-card .lc-name { font-weight: 600; color: var(--text); font-size: calc(14.5px * var(--ts, 1)); margin-top: 3px; }
.loading-card .lc-bar { height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.08); margin-top: 9px; overflow: hidden; position: relative; }
.loading-card .lc-bar i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--teal); border-radius: 2px; transition: width 0.3s ease; }
.loading-card .lc-bar.indet i { width: 30%; animation: lc-indet 1.4s ease-in-out infinite; }
@keyframes lc-indet { 0% { left: -30%; } 100% { left: 100%; } }
.loading-card .lc-meta { font-family: var(--font-mono); font-size: calc(11.5px * var(--ts, 1)); color: var(--text-2); margin-top: 6px; letter-spacing: 0.03em; }
.loading-card.failed .lc-meta { color: #F87171; }
.loading-card .lc-btns { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.loading-card .lc-crew { font-size: calc(12.5px * var(--ts, 1)); color: var(--text-2); line-height: 1.4; margin-top: 8px; }
@media (prefers-reduced-motion: reduce) { .loading-card .lc-bar.indet i { animation: none; left: 0; width: 100%; opacity: 0.35; } }
`;

const MB = (b: number, i18n: I18n): string => i18n.num(b / 1e6, b < 1e7 ? 1 : 0);

/**
 * The one loading card for every area and robot that is not ready (plan §4.1, §5.8): name,
 * „{x} von {y} MB“, progress, „Erneut laden“ after a failure, and the Bodencrew offer. Walking is
 * never blocked: it sits in the HUD column (`parent`), not in a modal.
 */
export function createLoadingCard(i18n: I18n, spec: LoadingCardSpec, parent: HTMLElement, audio?: AudioSystem): LoadingCardHandle {
  ensureStyle('wp1-loading', LOADING_CSS);
  let cur = { ...spec };
  const el = h('div', { class: 'panel glass hairline loading-card', role: 'status', 'aria-live': 'polite' });
  parent.appendChild(el);
  const t = (k: string, p?: Record<string, string | number>): string => i18n.t(`core.loadingCard.${k}`, p);
  const render = (): void => {
    const failed = cur.state?.() === 'failed';
    const p = cur.progress?.() ?? null;
    const frac = p && p.total > 0 ? Math.max(0, Math.min(1, p.loaded / p.total)) : null;
    el.classList.toggle('failed', failed);
    const bar = h('div', { class: `lc-bar${frac == null && !failed ? ' indet' : ''}` }, h('i', { style: `width:${failed ? 0 : frac == null ? 30 : Math.round(frac * 100)}%` }));
    const meta = failed ? t('failed') : p && p.total > 0 ? t('bytes', { x: MB(p.loaded, i18n), y: MB(p.total, i18n) }) : t('loading');
    const btns = h('div', { class: 'lc-btns' });
    if (failed && cur.retry)
      btns.appendChild(
        h('button', { class: 'btn small', onclick: () => (audio?.play('click'), cur.retry?.()) }, t('retry')),
      );
    if (failed && cur.crew)
      btns.appendChild(
        h('button', { class: 'btn small ghost', onclick: () => (audio?.play('click'), cur.crew?.accept()) }, t('crew')),
      );
    const parts: HTMLElement[] = [h('div', { class: 'eyebrow' }, failed ? t('eyebrowFailed') : t('eyebrowLoading')), h('div', { class: 'lc-name' }, i18n.resolve(cur.name)), bar, h('div', { class: 'lc-meta' }, meta)];
    if (failed && cur.crew) parts.push(h('div', { class: 'lc-crew' }, t('crewNote', { system: i18n.resolve(cur.crew.system) })));
    if (btns.childElementCount) parts.push(btns);
    el.replaceChildren(...parts);
  };
  render();
  const off = i18n.onChange(render);
  return {
    el,
    update(patch) {
      if (patch) cur = { ...cur, ...patch };
      render();
    },
    remove() {
      off();
      el.remove();
    },
  };
}

// ── chips ────────────────────────────────────────────────────────────────────

export type BuiltinChipType = 'sim' | 'studie' | 'quelle' | 'richtwert' | 'illustrativ' | 'fiktion';

/**
 * Chips added with registerChip (Phase 7 plan §5.2). A package names its ids for the type checker by
 * augmenting this interface: `declare module '@/ui/Kit' { interface ChipRegistry { traum: true } }`.
 */
export interface ChipRegistry {
  // Phase 7 (D32, plan §4 conventions; WP1): registered below
  herstellerangabe: true;
  modell: true;
  'sim-aufzeichnung': true;
  traum: true;
}
export type ChipType = BuiltinChipType | Extract<keyof ChipRegistry, string>;

export const CHIP_LABELS: Record<BuiltinChipType, { de: string; en: string }> = {
  sim: { de: 'SIM · LIVE', en: 'SIM · LIVE' },
  studie: { de: 'STUDIE', en: 'STUDY' },
  quelle: { de: 'QUELLE', en: 'SOURCE' },
  richtwert: { de: 'RICHTWERT', en: 'GUIDE VALUE' },
  illustrativ: { de: 'ILLUSTRATIV', en: 'ILLUSTRATIVE' },
  fiktion: { de: 'FIKTION', en: 'FICTION' },
};
const extraChips = new Map<string, Text>();

/**
 * A new chip type (HERSTELLERANGABE, MODELL, SIM · AUFZEICHNUNG, TRAUM: WP1). `id` is kebab-case (it is
 * also the CSS class `chip-<id>`); register at boot, before a chip of it is drawn. Returns the id as a ChipType.
 */
export function registerChip(id: string, label: Text): ChipType {
  if ((CHIP_LABELS as Record<string, unknown>)[id]) throw new Error(`chip "${id}" is built in`);
  extraChips.set(id, label);
  return id as ChipType;
}

// Phase 7 chips (D32, plan §4 conventions; WP1): vendor spec (with its date in the source line), a value
// measured on the 3D model in the game, a recorded simulation, a world-model prediction. English
// labels reviewed by WP1 (they follow the rc4 pattern „SIM · LIVE“); WP18 has the last word on copy.
registerChip('herstellerangabe', { de: 'HERSTELLERANGABE', en: 'VENDOR SPEC' });
registerChip('modell', { de: 'MODELL', en: 'MODEL' });
registerChip('sim-aufzeichnung', { de: 'SIM · AUFZEICHNUNG', en: 'SIM · RECORDED' });
registerChip('traum', { de: 'TRAUM', en: 'DREAM' });

/** The Phase 7 chips' look (plan §4 conventions): vendor spec and model neutral, the recording and the dream teal with a dashed rim. */
const CHIP_CSS = `
.chip-herstellerangabe { color: var(--text); border-color: var(--border); }
.chip-modell { color: var(--text-2); border-color: var(--border); }
.chip-sim-aufzeichnung { color: var(--teal); border: 1px dashed rgba(45, 212, 191, 0.5); }
.chip-traum { color: var(--teal); background: var(--teal-muted); border: 1px dashed rgba(45, 212, 191, 0.5); }
`;

/** A source chip element. `source` = the source line shown on hover (Appendix D). */
export function chipElement(i18n: I18n, type: ChipType, source?: Text): HTMLElement {
  if (extraChips.has(type)) ensureStyle('wp1-chips', CHIP_CSS);
  const label = (CHIP_LABELS as Record<string, Text>)[type] ?? extraChips.get(type) ?? type.toUpperCase();
  const el = h('span', { class: `chip chip-${type}` }, i18n.resolve(label));
  if (source) el.title = i18n.resolve(source);
  return el;
}

// ── Wilson interval ──────────────────────────────────────────────────────────

/** Wilson score interval for k successes in n trials (z = 1.96 → 95 %). Returns [p, lo, hi]. */
export function wilson(k: number, n: number, z = 1.96): [number, number, number] {
  if (n <= 0) return [0, 0, 1];
  const p = k / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return [p, Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** „73 % [66–79] · n = 200" */
export function formatRate(i18n: I18n, k: number, n: number): string {
  const [p, lo, hi] = wilson(k, n);
  return `${i18n.num(p * 100)} % [${i18n.num(lo * 100)}–${i18n.num(hi * 100)}] · n = ${n}`;
}

// ── Kennlinie ────────────────────────────────────────────────────────────────

export interface KennlinieSeries {
  id: string;
  label?: Text;
  /** plain (x, y) points */
  points?: [number, number][];
  /** success trials per x → y = rate (0…1), Wilson band drawn when spec.band = 'wilson95' */
  trials?: { x: number; k: number; n: number }[];
  /** draw a fitted/model curve (no markers) */
  line?: [number, number][];
  color?: string;
  dashed?: boolean;
}

export interface KennlinieSpec {
  title?: Text;
  xLabel: Text;
  yLabel: Text;
  series: KennlinieSeries[];
  band?: 'wilson95' | null;
  chip?: ChipType;
  /** key value text in orange (e.g. formatRate(...)) */
  keyValue?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  xLog?: boolean;
  yLog?: boolean;
  /** y values are rates 0…1 → axis shows % */
  percent?: boolean;
}

const SERIES_COLORS = [css.text, css.teal, css.orangeLight, css.textSecondary];

/** "Nice" axis ticks (1/2/2.5/5 × 10^k) covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / Math.max(1, count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) out.push(Math.round(v / step) * step || 0); // || 0 drops −0
  return out;
}

function decimals(ticks: number[]): number {
  if (ticks.length < 2) return 0;
  const step = Math.abs(ticks[1] - ticks[0]);
  return step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step) - 1e-9));
}

/** Draw a Kennlinie into a 2D canvas context (w×h CSS pixels). */
export function drawKennlinie(g: CanvasRenderingContext2D, w: number, hgt: number, spec: KennlinieSpec, i18n: I18n): void {
  const padL = 44,
    padR = 12,
    padT = spec.keyValue ? 34 : 20,
    padB = 30;
  const xs: number[] = [],
    ys: number[] = [];
  for (const s of spec.series) {
    for (const [x, y] of s.points ?? []) xs.push(x), ys.push(y);
    for (const [x, y] of s.line ?? []) xs.push(x), ys.push(y);
    for (const t of s.trials ?? []) {
      xs.push(t.x);
      const [, lo, hi] = wilson(t.k, t.n);
      ys.push(lo, hi);
    }
  }
  const fx = (v: number): number => (spec.xLog ? Math.log10(Math.max(1e-9, v)) : v);
  const fy = (v: number): number => (spec.yLog ? Math.log10(Math.max(1e-9, v)) : v);
  let x0 = spec.xMin ?? (xs.length ? Math.min(...xs) : 0),
    x1 = spec.xMax ?? (xs.length ? Math.max(...xs) : 1);
  let y0 = spec.yMin ?? (spec.percent ? 0 : ys.length ? Math.min(0, ...ys) : 0),
    y1 = spec.yMax ?? (spec.percent ? 1 : ys.length ? Math.max(...ys) * 1.1 : 1);
  if (x1 === x0) x1 = x0 + 1;
  if (y1 === y0) y1 = y0 + 1;
  const X = (v: number): number => padL + ((fx(v) - fx(x0)) / (fx(x1) - fx(x0))) * (w - padL - padR);
  const Y = (v: number): number => hgt - padB - ((fy(v) - fy(y0)) / (fy(y1) - fy(y0))) * (hgt - padT - padB);
  const logTicks = (a: number, b: number): number[] => {
    const out: number[] = [];
    for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, e);
      if (v >= a * 0.999 && v <= b * 1.001) out.push(v);
    }
    return out;
  };
  const yt = spec.yLog ? logTicks(y0, y1) : niceTicks(y0, y1, 5);
  const xt = spec.xLog ? logTicks(x0, x1) : niceTicks(x0, x1, 5);
  const yd = decimals(yt),
    xd = decimals(xt);

  g.save();
  g.font = '11px "Geist Mono", ui-monospace, monospace'; // C7: no text under 11 px, readable grey
  g.lineWidth = 1;
  g.strokeStyle = css.borderSubtle;
  g.fillStyle = css.textSecondary;
  for (const yv of yt) {
    const yy = Y(yv);
    g.beginPath();
    g.moveTo(padL, yy);
    g.lineTo(w - padR, yy);
    g.stroke();
    const lab = spec.percent ? `${i18n.num(yv * 100)}%` : i18n.num(yv, yd);
    g.fillText(lab, padL - 6 - g.measureText(lab).width, yy + 3);
  }
  for (const xv of xt) {
    const xx = X(xv);
    g.beginPath();
    g.moveTo(xx, padT);
    g.lineTo(xx, hgt - padB);
    g.stroke();
    const lab = i18n.num(xv, xd);
    g.fillText(lab, xx - g.measureText(lab).width / 2, hgt - padB + 13);
  }
  // axis labels: x bottom-right, y above the plot area (left)
  g.fillStyle = css.textSecondary;
  const xl = i18n.resolve(spec.xLabel);
  g.fillText(xl, w - padR - g.measureText(xl).width, hgt - 4);
  g.fillText(i18n.resolve(spec.yLabel), padL, padT - 8);

  spec.series.forEach((s, si) => {
    const color = s.color ?? SERIES_COLORS[si % SERIES_COLORS.length];
    if (spec.band === 'wilson95' && s.trials?.length) {
      const pts = s.trials.slice().sort((a, b) => a.x - b.x);
      g.fillStyle = 'rgba(45,212,191,0.15)';
      g.beginPath();
      pts.forEach((t, i) => {
        const [, lo] = wilson(t.k, t.n);
        if (i === 0) g.moveTo(X(t.x), Y(lo));
        else g.lineTo(X(t.x), Y(lo));
      });
      for (let i = pts.length - 1; i >= 0; i--) {
        const [, , hi] = wilson(pts[i].k, pts[i].n);
        g.lineTo(X(pts[i].x), Y(hi));
      }
      g.closePath();
      g.fill();
    }
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = 1.6;
    g.setLineDash(s.dashed ? [5, 4] : []);
    const line = s.line ?? (s.trials ? s.trials.slice().sort((a, b) => a.x - b.x).map((t) => [t.x, t.n ? t.k / t.n : 0] as [number, number]) : null);
    if (line && line.length > 1) {
      g.beginPath();
      line.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
      g.stroke();
    }
    g.setLineDash([]);
    const markers = s.points ?? (s.trials ? s.trials.map((t) => [t.x, t.n ? t.k / t.n : 0] as [number, number]) : []);
    for (const [x, y] of markers) {
      g.beginPath();
      g.arc(X(x), Y(y), 2.6, 0, Math.PI * 2);
      g.fill();
    }
  });
  if (spec.keyValue) {
    g.font = '500 12px "Geist Mono", ui-monospace, monospace';
    g.fillStyle = css.orange;
    g.fillText(spec.keyValue, padL, 13);
  }
  g.restore();
}

export interface KennlinieHandle {
  /** DOM card (target 'panel') */
  readonly el: HTMLElement | null;
  /** CanvasTexture for in-world screens (target 'texture'; MeshBasicMaterial({ map, toneMapped: false })) */
  readonly texture: THREE.CanvasTexture | null;
  readonly canvas: HTMLCanvasElement;
  update(spec: KennlinieSpec): void;
  remove(): void;
}

/** Content width (px) of a Kennlinie card in the HUD's right column. */
export const KENNLINIE_PANEL_WIDTH = 276;

/** Create a Kennlinie as a HUD card (`panelsRoot`) or as a CanvasTexture. */
export function createKennlinie(
  i18n: I18n,
  spec: KennlinieSpec,
  o: { target?: 'panel' | 'texture'; width?: number; height?: number; panelsRoot?: HTMLElement; parent?: HTMLElement },
): KennlinieHandle {
  const target = o.target ?? 'panel';
  // HUD column cards have 276 px of content width (300 px column − padding): clamp, so a chart
  // never overflows the column. Use `parent` (your own modal / operate panel) for larger charts.
  const inColumn = target === 'panel' && !o.parent;
  const w = inColumn ? Math.min(o.width ?? KENNLINIE_PANEL_WIDTH, KENNLINIE_PANEL_WIDTH) : (o.width ?? (target === 'texture' ? 512 : KENNLINIE_PANEL_WIDTH));
  const hh = o.height ?? (target === 'texture' ? 320 : 180);
  const canvas = document.createElement('canvas');
  const dpr = target === 'texture' ? 1 : Math.min(2, window.devicePixelRatio || 1);
  canvas.width = w * dpr;
  canvas.height = hh * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${hh}px`;
  let current = spec;
  let el: HTMLElement | null = null;
  let titleEl: HTMLElement | null = null;
  let chipHost: HTMLElement | null = null;
  let texture: THREE.CanvasTexture | null = null;
  if (target === 'texture') {
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
  } else {
    titleEl = h('div', { class: 'eyebrow' });
    chipHost = h('div', { class: 'chips' });
    el = h('div', { class: o.parent ? 'kennlinie inline' : 'panel glass hairline kennlinie' }, h('div', { class: 'klhead' }, titleEl, chipHost), canvas);
    (o.parent ?? o.panelsRoot ?? document.body).appendChild(el);
  }
  const paint = (): void => {
    const g = canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (target === 'texture') {
      g.fillStyle = '#141414';
      g.fillRect(0, 0, w, hh);
    } else g.clearRect(0, 0, w, hh);
    drawKennlinie(g, w, hh, current, i18n);
    if (target === 'texture') {
      if (current.title) {
        g.font = '500 13px "Geist Mono", monospace';
        g.fillStyle = css.orange;
        const title = upperKeepGreek(i18n.resolve(current.title));
        g.fillText(title, w - 12 - g.measureText(title).width, 16);
      }
      texture!.needsUpdate = true;
    } else {
      titleEl!.replaceChildren(textNodes(current.title ? i18n.resolve(current.title) : ''));
      chipHost!.replaceChildren(...(current.chip ? [chipElement(i18n, current.chip)] : []));
    }
  };
  paint();
  const off = i18n.onChange(paint);
  return {
    el,
    texture,
    canvas,
    update(s) {
      current = s;
      paint();
    },
    remove() {
      off();
      el?.remove();
      texture?.dispose();
    },
  };
}

// ── prediction widget ────────────────────────────────────────────────────────

export interface PredictOptions {
  question: Text;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  scale?: 'linear' | 'log';
  initial?: number;
  /** digits for the displayed value */
  digits?: number;
}

/** „Erst tippen, dann messen": modal slider, resolves with the predicted value. */
export function openPredict(modals: ModalManager, i18n: I18n, audio: AudioSystem, o: PredictOptions): Promise<number> {
  return new Promise((resolve) => {
    const scale = o.scale ?? 'linear';
    const toT = (v: number): number => (scale === 'log' ? (Math.log10(v) - Math.log10(o.min)) / (Math.log10(o.max) - Math.log10(o.min)) : (v - o.min) / (o.max - o.min));
    const fromT = (t: number): number => {
      const raw = scale === 'log' ? Math.pow(10, Math.log10(o.min) + t * (Math.log10(o.max) - Math.log10(o.min))) : o.min + t * (o.max - o.min);
      const step = o.step ?? 0;
      return step > 0 ? Math.round(raw / step) * step : raw;
    };
    let value = o.initial ?? fromT(0.5);
    const digits = o.digits ?? (o.max - o.min < 10 ? 1 : 0);
    const out = h('div', { class: 'predict-value' });
    const input = h('input', { type: 'range', min: 0, max: 1000, step: 1, value: Math.round(toT(value) * 1000) }) as HTMLInputElement;
    const render = (): void => {
      out.textContent = `${i18n.num(value, digits)}${o.unit ? ' ' + o.unit : ''}`;
    };
    input.addEventListener('input', () => {
      value = fromT(Number(input.value) / 1000);
      render();
      audio.play('hover', { volume: 0.4 });
    });
    render();
    let done = false;
    const submit = (): void => {
      if (done) return;
      done = true;
      audio.play('click');
      close();
      resolve(value);
    };
    const el = h(
      'div',
      { class: 'modal custom-modal predict hairline' },
      h('div', { class: 'eyebrow' }, i18n.resolve({ de: '// Erst tippen, dann messen', en: '// Predict first, then measure' })),
      h('h2', { class: 'display', style: 'font-size:24px;margin:8px 0 18px' }, i18n.resolve(o.question)),
      out,
      input,
      h(
        'div',
        { class: 'predict-scale mono' },
        h('span', null, `${i18n.num(o.min, digits)}${o.unit ? ' ' + o.unit : ''}`),
        h('span', null, scale === 'log' ? 'log' : ''),
        h('span', null, `${i18n.num(o.max, digits)}${o.unit ? ' ' + o.unit : ''}`),
      ),
      h('div', { style: 'display:flex;justify-content:flex-end;margin-top:18px' }, h('button', { class: 'btn primary', onclick: submit }, i18n.resolve({ de: 'Tipp abgeben', en: 'Lock in prediction' }))),
    );
    const close = modals.open('predict', el, {
      backdropCloses: false,
      onClose: () => {
        if (!done) {
          done = true;
          resolve(value);
        }
      },
      onKey: (code) => {
        if (code === 'Enter' || code === 'KeyE') {
          submit();
          return true;
        }
        return code === 'Escape';
      },
    });
    window.setTimeout(() => input.focus(), 50);
  });
}
