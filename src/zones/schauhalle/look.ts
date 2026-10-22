/**
 * Canvas drawing helpers in the hall's look: dark carbon plates with stone text, mono eyebrows, chips as
 * outlined capsules (plan §4 conventions: teal = data, orange only the signal, amber = over a spec).
 */
import { FONT, rrect, wrapLines } from './geo';

export const INK = {
  bg: '#1c1917',
  bg2: '#292524',
  line: '#44403c',
  text: '#f5f5f4',
  text2: '#a8a29e',
  muted: '#78716c',
  teal: '#2DD4BF',
  orange: '#FF6700',
  amber: '#FBBF24',
  red: '#F87171',
  ceramic: '#f3f1ee',
} as const;

/** a dark plate with a hairline (orange → teal, the sign style of Text3D.sign) */
export function plate(g: CanvasRenderingContext2D, w: number, h: number, o: { hairline?: boolean; bg?: string } = {}): void {
  g.fillStyle = o.bg ?? INK.bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = INK.line;
  g.lineWidth = 2;
  g.strokeRect(1, 1, w - 2, h - 2);
  if (o.hairline !== false) {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, INK.orange);
    gr.addColorStop(0.5, INK.teal);
    gr.addColorStop(1, 'rgba(45,212,191,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, 3);
  }
}

/** outlined chip capsule; returns its width */
export function chipPill(g: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string = INK.text2): number {
  g.font = FONT.mono(px, 500);
  const w = g.measureText(text).width + px * 1.1;
  const h = px * 1.55;
  rrect(g, x, y - h / 2, w, h, h / 2);
  g.strokeStyle = color;
  g.lineWidth = Math.max(1, px / 10);
  g.stroke();
  g.fillStyle = color;
  g.textBaseline = 'middle';
  g.fillText(text, x + px * 0.55, y + px * 0.04);
  return w;
}

/** wrapped text block; returns the y below it */
export function para(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, px: number, lineH: number, color: string = INK.text, font: (px: number, w?: number) => string = FONT.sans, maxLines = 99): number {
  g.font = font(px);
  g.fillStyle = color;
  g.textBaseline = 'top';
  const lines = wrapLines(g, text, maxW).slice(0, maxLines);
  for (const l of lines) {
    g.fillText(l, x, y);
    y += lineH;
  }
  return y;
}

/** fit a single line into maxW by shrinking the font */
export function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, px: number, font: (px: number, w?: number) => string, color: string, align: CanvasTextAlign = 'left'): void {
  let s = px;
  g.font = font(s);
  while (s > 8 && g.measureText(text).width > maxW) {
    s -= 1;
    g.font = font(s);
  }
  g.fillStyle = color;
  g.textAlign = align;
  g.fillText(text, x, y);
  g.textAlign = 'left';
}
