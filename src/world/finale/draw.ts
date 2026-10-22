/**
 * Canvas drawing for the finale: in-world screens (Messwand, vendor kiosk, lesson tiles,
 * Leitstand), the F1 instrument and the result charts. Brand: warm stone neutrals, teal for
 * data and Wilson bands, orange only for the key value; Geist Mono for numbers.
 */
import type { AuditTally, Cond, CtrlId } from './sim';
import { CONDS, MODEL } from './sim';

export const C = {
  bg: '#141414',
  surface: '#1F1F1F',
  elevated: '#292929',
  border: '#3D3D3D',
  grid: '#2A2A2A',
  text: '#F5F5F4',
  text2: '#A8A29E',
  text3: '#78716C',
  stone300: '#D6D3D1',
  orange: '#FF6700',
  orangeLight: '#FF8534',
  teal: '#2DD4BF',
  tealBand: 'rgba(45,212,191,0.15)',
  warn: '#FBBF24',
  error: '#F87171',
  success: '#4ADE80',
};

export const F = {
  display: (px: number, w = 700): string => `${w} ${px}px "Space Grotesk", sans-serif`,
  sans: (px: number, w = 400): string => `${w} ${px}px "Geist", system-ui, sans-serif`,
  mono: (px: number, w = 500): string => `${w} ${px}px "Geist Mono", ui-monospace, monospace`,
};

/** Wilson 95 % interval (Appendix B) → [p, lo, hi]. */
export function wilson(k: number, n: number, z = 1.96): [number, number, number] {
  if (n <= 0) return [0, 0, 1];
  const p = k / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return [p, Math.max(0, centre - half), Math.min(1, centre + half)];
}

export type Lang = 'de' | 'en';
export const num = (v: number, d = 0, lang: Lang = 'de'): string => {
  const s = v.toFixed(d);
  return lang === 'de' ? s.replace('.', ',') : s;
};
/** "41 % [30–53]" */
export const rateText = (k: number, n: number, lang: Lang): string => {
  const [p, lo, hi] = wilson(k, n);
  return `${num(p * 100, 0, lang)} % [${num(lo * 100, 0, lang)}–${num(hi * 100, 0, lang)}]`;
};

/** Word-wrap `text` into lines no wider than `w`; returns the y after the last line. */
export function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, lh: number, maxLines = 99): number {
  const words = text.split(/\s+/);
  let line = '';
  let n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (g.measureText(test).width > w && line) {
      if (n === maxLines - 1) {
        g.fillText(line + ' …', x, y);
        return y + lh;
      }
      g.fillText(line, x, y);
      y += lh;
      n++;
      line = words[i];
    } else line = test;
  }
  if (line) {
    g.fillText(line, x, y);
    y += lh;
  }
  return y;
}

export function hairline(g: CanvasRenderingContext2D, x: number, y: number, w: number, h = 3): void {
  const gr = g.createLinearGradient(x, 0, x + w, 0);
  gr.addColorStop(0, C.orange);
  gr.addColorStop(1, C.teal);
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Pill chip like the HUD source chips. */
export function chip(g: CanvasRenderingContext2D, label: string, x: number, y: number, px: number, kind: 'sim' | 'fiktion' | 'illustrativ' | 'plain', alignRight = false): number {
  g.save();
  g.font = F.mono(px, 500);
  const tw = g.measureText(label).width + px * 0.08 * label.length;
  const pw = tw + px * 1.6,
    ph = px * 1.75;
  const x0 = alignRight ? x - pw : x;
  roundRect(g, x0, y - ph / 2, pw, ph, ph / 2);
  const col = kind === 'sim' ? C.teal : kind === 'illustrativ' ? C.warn : kind === 'fiktion' ? C.text3 : C.text;
  if (kind === 'sim') {
    g.fillStyle = C.tealBand;
    g.fill();
  } else if (kind === 'illustrativ') {
    g.fillStyle = 'rgba(251,191,36,0.15)';
    g.fill();
  }
  g.strokeStyle = kind === 'sim' ? 'rgba(45,212,191,0.4)' : kind === 'illustrativ' ? 'rgba(251,191,36,0.4)' : C.border;
  g.lineWidth = Math.max(1, px / 10);
  g.stroke();
  g.fillStyle = col;
  g.textBaseline = 'middle';
  let cx = x0 + px * 0.8;
  for (const ch of label) {
    g.fillText(ch, cx, y + px * 0.04);
    cx += g.measureText(ch).width + px * 0.08;
  }
  g.restore();
  return pw;
}

// ── bars: 2 controllers × 3 conditions with Wilson intervals ───────────────

export interface BarsOptions {
  lang: Lang;
  labels: { cond: Record<Cond, string>; ctrl: Record<CtrlId, string>; claim: string };
  /** draw the vendor's 99 % line */
  claim?: boolean;
  /** player's prediction for NN · Sturm (0…100) */
  prediction?: number | null;
  /** highlight the NN · Sturm value in orange */
  key?: boolean;
  /** draw the legend row (default true) */
  legend?: boolean;
  /** label next to the prediction marker */
  predictionLabel?: string;
  px?: number;
}

export function drawBars(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tally: AuditTally, o: BarsOptions): void {
  const px = o.px ?? 14;
  const padL = px * 3.2,
    padB = px * (o.legend === false ? 2.8 : 4.4),
    padT = px * 1.4;
  const X0 = x + padL,
    X1 = x + w - px * 0.6;
  const Y0 = y + h - padB,
    Y1 = y + padT;
  const Y = (v: number): number => Y0 - v * (Y0 - Y1);
  g.save();
  g.font = F.mono(px * 0.78);
  g.textBaseline = 'middle';
  // grid
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    g.strokeStyle = C.grid;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(X0, Y(v));
    g.lineTo(X1, Y(v));
    g.stroke();
    g.fillStyle = C.text3;
    const lab = `${v * 100} %`;
    g.fillText(lab, X0 - px * 0.5 - g.measureText(lab).width, Y(v));
  }
  const groupW = (X1 - X0) / 3;
  const barW = Math.min(groupW * 0.3, px * 4.2);
  CONDS.forEach((cond, ci) => {
    const gx = X0 + groupW * ci + groupW / 2;
    (['bestand', 'nn'] as CtrlId[]).forEach((ctrl, k) => {
      const t = tally[ctrl][cond];
      const bx = gx + (k === 0 ? -barW - px * 0.25 : px * 0.25);
      if (t.n > 0) {
        const [p, lo, hi] = wilson(t.k, t.n);
        g.fillStyle = ctrl === 'nn' ? 'rgba(45,212,191,0.78)' : C.stone300;
        g.fillRect(bx, Y(p), barW, Y0 - Y(p));
        // Wilson band + whisker
        g.fillStyle = C.tealBand;
        g.fillRect(bx - px * 0.3, Y(hi), barW + px * 0.6, Y(lo) - Y(hi));
        g.strokeStyle = C.text;
        g.lineWidth = Math.max(1.2, px / 9);
        g.beginPath();
        g.moveTo(bx + barW / 2, Y(hi));
        g.lineTo(bx + barW / 2, Y(lo));
        g.moveTo(bx + barW * 0.2, Y(hi));
        g.lineTo(bx + barW * 0.8, Y(hi));
        g.moveTo(bx + barW * 0.2, Y(lo));
        g.lineTo(bx + barW * 0.8, Y(lo));
        g.stroke();
        // value
        const isKey = !!o.key && ctrl === 'nn' && cond === 'sturm';
        g.fillStyle = isKey ? C.orange : C.text;
        g.font = F.mono(isKey ? px * 1.05 : px * 0.82, isKey ? 600 : 500);
        const v = `${num(p * 100, 0, o.lang)}`;
        g.fillText(v, bx + barW / 2 - g.measureText(v).width / 2, Y(hi) - px * 0.75);
        g.font = F.mono(px * 0.78);
      } else {
        g.strokeStyle = C.border;
        g.setLineDash([4, 4]);
        g.strokeRect(bx, Y(0.02), barW, Y0 - Y(0.02));
        g.setLineDash([]);
      }
      g.fillStyle = C.text3;
      const n = `n=${t.n}`;
      g.fillText(n, bx + barW / 2 - g.measureText(n).width / 2, Y0 + px * 0.8);
    });
    g.fillStyle = C.text2;
    g.font = F.sans(px * 1.0, 600);
    const cl = o.labels.cond[cond];
    g.fillText(cl, gx - g.measureText(cl).width / 2, Y0 + px * 1.95);
    g.font = F.mono(px * 0.78);
  });
  // vendor claim
  if (o.claim) {
    g.strokeStyle = C.text;
    g.globalAlpha = 0.75;
    g.lineWidth = Math.max(1.2, px / 10);
    g.setLineDash([px * 0.5, px * 0.35]);
    g.beginPath();
    g.moveTo(X0, Y(0.99));
    g.lineTo(X1, Y(0.99));
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
    g.fillStyle = C.text;
    g.font = F.mono(px * 0.78, 500);
    const cl = o.labels.claim;
    g.fillText(cl, X1 - g.measureText(cl).width, Y(0.99) - px * 0.62);
  }
  // prediction marker on the NN · Sturm bar
  if (o.prediction != null) {
    const gx = X0 + groupW * 2 + groupW / 2;
    const bx = gx + px * 0.25;
    const yy = Y(o.prediction / 100);
    g.strokeStyle = C.text;
    g.lineWidth = Math.max(1.5, px / 8);
    g.beginPath();
    g.moveTo(bx - px * 0.6, yy);
    g.lineTo(bx + barW + px * 0.6, yy);
    g.stroke();
    g.beginPath();
    g.moveTo(bx + barW + px * 0.6, yy);
    g.lineTo(bx + barW + px * 1.2, yy - px * 0.4);
    g.lineTo(bx + barW + px * 1.2, yy + px * 0.4);
    g.closePath();
    g.fillStyle = C.text;
    g.fill();
    if (o.predictionLabel) {
      g.font = F.mono(px * 0.75);
      g.fillText(o.predictionLabel, bx + barW + px * 1.45, yy + px * 0.05);
    }
  }
  // legend
  if (o.legend === false) {
    g.restore();
    return;
  }
  g.font = F.mono(px * 0.8);
  let lx = X0;
  const ly = y + h - px * 0.7;
  for (const ctrl of ['bestand', 'nn'] as CtrlId[]) {
    g.fillStyle = ctrl === 'nn' ? 'rgba(45,212,191,0.78)' : C.stone300;
    g.fillRect(lx, ly - px * 0.35, px * 0.7, px * 0.7);
    g.fillStyle = C.text2;
    g.fillText(o.labels.ctrl[ctrl], lx + px, ly);
    lx += px * 1.6 + g.measureText(o.labels.ctrl[ctrl]).width + px;
  }
  g.fillStyle = C.tealBand;
  g.fillRect(lx, ly - px * 0.35, px * 0.7, px * 0.7);
  g.fillStyle = C.text2;
  g.fillText('Wilson 95 %', lx + px, ly);
  g.restore();
}

// ── traces: tilt |θ| over a 20 s trial, many trials overlaid ───────────────

export function drawTraces(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  sets: { traces: Float32Array[]; color: string; alpha: number }[],
  o: { px?: number; yMax?: number; lang: Lang; limitLabel?: string; frame?: boolean; tMax?: number; fullLength?: number },
): void {
  const px = o.px ?? 12;
  const yMax = o.yMax ?? 5;
  const padL = px * 2.6,
    padB = px * 1.9,
    padT = px * 0.6;
  const X0 = x + padL,
    X1 = x + w - px * 0.4,
    Y0 = y + h - padB,
    Y1 = y + padT;
  const tMax = o.tMax ?? MODEL.duration;
  g.save();
  if (o.frame !== false) {
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(X0, Y1, X1 - X0, Y0 - Y1);
  }
  g.font = F.mono(px * 0.8);
  g.textBaseline = 'middle';
  for (let v = 0; v <= yMax; v++) {
    const yy = Y0 - (v / yMax) * (Y0 - Y1);
    g.strokeStyle = C.grid;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(X0, yy);
    g.lineTo(X1, yy);
    g.stroke();
    g.fillStyle = C.text3;
    g.fillText(`${v}°`, X0 - px * 0.4 - g.measureText(`${v}°`).width, yy);
  }
  for (let t = 0; t <= tMax; t += 5) {
    const xx = X0 + (t / tMax) * (X1 - X0);
    g.fillStyle = C.text3;
    const lab = `${t} s`;
    g.fillText(lab, Math.min(X1 - g.measureText(lab).width, xx - g.measureText(lab).width / 2), Y0 + px * 0.9);
  }
  // clip to the plot
  g.beginPath();
  g.rect(X0, Y1 - 1, X1 - X0, Y0 - Y1 + 2);
  g.clip();
  for (const s of sets) {
    g.strokeStyle = s.color;
    g.globalAlpha = s.alpha;
    g.lineWidth = Math.max(1, px / 9);
    for (const tr of s.traces) {
      if (!tr.length) continue;
      g.beginPath();
      const n = (o.fullLength ?? tr.length) - 1;
      for (let i = 0; i < tr.length; i++) {
        const xx = X0 + (i / n) * (X1 - X0) * (MODEL.duration / tMax);
        const yy = Y0 - (Math.min(tr[i], yMax + 1) / yMax) * (Y0 - Y1);
        if (i === 0) g.moveTo(xx, yy);
        else g.lineTo(xx, yy);
      }
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  // 3° limit
  const ly = Y0 - (MODEL.limit / yMax) * (Y0 - Y1);
  g.strokeStyle = C.error;
  g.lineWidth = Math.max(1.2, px / 8);
  g.setLineDash([px * 0.5, px * 0.35]);
  g.beginPath();
  g.moveTo(X0, ly);
  g.lineTo(X1, ly);
  g.stroke();
  g.setLineDash([]);
  if (o.limitLabel) {
    g.fillStyle = C.error;
    g.font = F.mono(px * 0.8);
    g.fillText(o.limitLabel, X1 - g.measureText(o.limitLabel).width - px * 0.3, ly - px * 0.7);
  }
  g.restore();
}

// ── F1 instrument: a spirit level (Libelle) + thrust cursor ────────────────

/**
 * Bubble view in the operator's frame: `ball` = where a ball rolls (low side), in degrees
 * (x right, y forward/up on screen); `thrust` = commanded thrust point (−1…1).
 */
export function drawLibelle(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, ball: [number, number], thrust: [number, number] | null, o: { limit: number; range: number; px: number }): void {
  g.save();
  const s = r / o.range;
  // dish
  const grad = g.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
  grad.addColorStop(0, '#2A2725');
  grad.addColorStop(1, '#141312');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = C.border;
  g.lineWidth = 2;
  g.stroke();
  // rings: 1°, 2°, limit
  for (let d = 1; d <= o.range; d++) {
    g.strokeStyle = d === o.limit ? 'rgba(248,113,113,0.85)' : C.grid;
    g.lineWidth = d === o.limit ? 2 : 1;
    g.setLineDash(d === o.limit ? [6, 5] : []);
    g.beginPath();
    g.arc(cx, cy, d * s, 0, Math.PI * 2);
    g.stroke();
  }
  g.setLineDash([]);
  g.strokeStyle = C.grid;
  g.beginPath();
  g.moveTo(cx - r, cy);
  g.lineTo(cx + r, cy);
  g.moveTo(cx, cy - r);
  g.lineTo(cx, cy + r);
  g.stroke();
  // thrust cursor
  if (thrust) {
    const tx = cx + thrust[0] * r,
      ty = cy - thrust[1] * r;
    g.strokeStyle = C.orange;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(tx, ty);
    g.stroke();
    g.beginPath();
    g.arc(tx, ty, o.px * 0.55, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(tx - o.px * 0.9, ty);
    g.lineTo(tx - o.px * 0.3, ty);
    g.moveTo(tx + o.px * 0.3, ty);
    g.lineTo(tx + o.px * 0.9, ty);
    g.moveTo(tx, ty - o.px * 0.9);
    g.lineTo(tx, ty - o.px * 0.3);
    g.moveTo(tx, ty + o.px * 0.3);
    g.lineTo(tx, ty + o.px * 0.9);
    g.stroke();
  }
  // ball (clamped to the dish)
  let bx = ball[0] * s,
    by = -ball[1] * s;
  const bl = Math.hypot(bx, by);
  if (bl > r - o.px * 0.8) {
    bx *= (r - o.px * 0.8) / bl;
    by *= (r - o.px * 0.8) / bl;
  }
  const tilt = Math.hypot(ball[0], ball[1]);
  const bg = g.createRadialGradient(cx + bx - o.px * 0.25, cy + by - o.px * 0.3, o.px * 0.1, cx + bx, cy + by, o.px * 0.8);
  bg.addColorStop(0, '#FFFFFF');
  bg.addColorStop(1, tilt >= o.limit ? '#F87171' : '#A8A29E');
  g.fillStyle = bg;
  g.beginPath();
  g.arc(cx + bx, cy + by, o.px * 0.8, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** Scrolling |θ| history (deg) with the 3° limit; `split` marks the controller take-over. */
export function drawHistory(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, hist: number[], tMax: number, dtSample: number, o: { px: number; yMax: number; split?: number }): void {
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(x, y, w, h);
  g.font = F.mono(o.px * 0.75);
  g.textBaseline = 'middle';
  for (let v = 0; v <= o.yMax; v += 1) {
    const yy = y + h - (v / o.yMax) * h;
    g.strokeStyle = v === 3 ? 'rgba(248,113,113,0.7)' : C.grid;
    g.setLineDash(v === 3 ? [5, 4] : []);
    g.beginPath();
    g.moveTo(x, yy);
    g.lineTo(x + w, yy);
    g.stroke();
  }
  g.setLineDash([]);
  if (o.split != null) {
    const sx = x + (o.split / tMax) * w;
    g.fillStyle = 'rgba(45,212,191,0.08)';
    g.fillRect(sx, y, x + w - sx, h);
  }
  g.strokeStyle = C.text;
  g.lineWidth = 1.6;
  g.beginPath();
  hist.forEach((v, i) => {
    const t = i * dtSample;
    const xx = x + (t / tMax) * w;
    const yy = y + h - (Math.min(v, o.yMax) / o.yMax) * h;
    if (i === 0) g.moveTo(xx, yy);
    else g.lineTo(xx, yy);
  });
  g.stroke();
  if (o.split != null) {
    // redraw the controller part in teal
    g.strokeStyle = C.teal;
    g.beginPath();
    let started = false;
    hist.forEach((v, i) => {
      const t = i * dtSample;
      if (t < o.split!) return;
      const xx = x + (t / tMax) * w;
      const yy = y + h - (Math.min(v, o.yMax) / o.yMax) * h;
      if (!started) {
        g.moveTo(xx, yy);
        started = true;
      } else g.lineTo(xx, yy);
    });
    g.stroke();
  }
  g.restore();
}
