/**
 * Canvas drawing for the region's boards and signposts (no image files: the house rule, R8 §4.7 rule 3).
 * Fonts are the game's own (loaded before the title): Space Grotesk (display), Geist (sans), Geist Mono.
 */
import * as THREE from 'three';
import { css } from '@/core/zones';

export const FONT = {
  display: (px: number, w = 700) => `${w} ${px}px "Space Grotesk", sans-serif`,
  sans: (px: number, w = 400) => `${w} ${px}px "Geist", sans-serif`,
  mono: (px: number, w = 500) => `${w} ${px}px "Geist Mono", ui-monospace, monospace`,
};

/** A canvas and its texture (sRGB, mipmapped, anisotropic); `redraw` repaints and uploads. */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, anisotropy = 8): { tex: THREE.CanvasTexture; redraw: () => void; canvas: HTMLCanvasElement } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  const redraw = (): void => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    draw(g, w, h);
    tex.needsUpdate = true;
  };
  redraw();
  return { tex, redraw, canvas };
}

/** Wrap text into lines that fit `maxW` (canvas font already set). */
export function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${word}` : word;
      if (g.measureText(t).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = t;
    }
    if (line) out.push(line);
  }
  return out;
}

/** A source chip like the HUD's (.chip): mono caps in a pill. Returns its width. */
export function chip(g: CanvasRenderingContext2D, x: number, y: number, label: string, px: number, o: { color?: string; border?: string; fill?: string } = {}): number {
  g.save();
  g.font = FONT.mono(px, 500);
  const text = label.toUpperCase();
  const tw = g.measureText(text).width + px * 0.08 * text.length;
  const w = tw + px * 1.6;
  const h = px * 1.75;
  g.beginPath();
  g.roundRect(x, y, w, h, h / 2);
  if (o.fill) {
    g.fillStyle = o.fill;
    g.fill();
  }
  g.lineWidth = Math.max(1, px * 0.09);
  g.strokeStyle = o.border ?? 'rgba(168,162,158,0.7)';
  g.stroke();
  g.fillStyle = o.color ?? css.textSecondary;
  g.textBaseline = 'middle';
  let cx = x + px * 0.8;
  for (const ch of text) {
    g.fillText(ch, cx, y + h / 2 + px * 0.04);
    cx += g.measureText(ch).width + px * 0.08;
  }
  g.restore();
  return w;
}

/** Letter-spaced caps (the brand's eyebrow), left-aligned at the baseline. */
export function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number): number {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    g.fillText(ch, cx, y);
    cx += g.measureText(ch).width + spacing;
  }
  return cx - x;
}
