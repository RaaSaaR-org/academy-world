/**
 * Canvas boards: the QUELLE board in the forecourt (4 × 2.5 m at (−8, 0, 12), facing +z) with the
 * three public statistics of GDD §7.5 A, and the Station 7 sign at the conveyor end (FIKTION).
 * Redrawn on language/mode change.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { box, boxMM, canvasTex, merge, mesh, plane, type CanvasTex } from './geo';

export interface Boards {
  redraw(): void;
}

export function buildBoards(ctx: ZoneContext): Boards {
  const M = ctx.materials;
  const ext = ctx.groups.exterior;
  const det = ctx.groups.detail;

  // ── QUELLE board ─────────────────────────────────────────────────────────
  const bx = -8,
    bz = 12;
  const qb = canvasTex(1024, 640);
  ctx.onDispose(() => qb.tex.dispose());
  const qbMat = new THREE.MeshBasicMaterial({ map: qb.tex, toneMapped: false });
  ctx.onDispose(() => qbMat.dispose());
  ext.add(mesh(merge([box(4.2, 2.7, 0.14, bx, 2.3, bz - 0.08), box(0.14, 1.0, 0.14, bx - 1.5, 0.5, bz - 0.1), box(0.14, 1.0, 0.14, bx + 1.5, 0.5, bz - 0.1), boxMM(bx - 2.1, 0, bz - 0.4, bx + 2.1, 0.12, bz + 0.2)]), M.metalDark, { cast: true, name: 'df:quelle-frame' }));
  ext.add(mesh(plane(4, 2.5, bx, 2.3, bz + 0.0), qbMat, { receive: false, name: 'df:quelle-board' }));
  ctx.physics.addStaticBox({ size: [4.2, 3.7, 0.4], position: [bx, 1.85, bz - 0.1], surface: 'metal' });

  // ── Station 7 sign (at the conveyor end, facing the player) ─────────────
  const s7 = canvasTex(512, 256);
  ctx.onDispose(() => s7.tex.dispose());
  const s7Mat = new THREE.MeshBasicMaterial({ map: s7.tex, toneMapped: false });
  ctx.onDispose(() => s7Mat.dispose());
  det.add(mesh(merge([box(1.24, 0.66, 0.06, 5.55, 1.62, -6.72), box(0.06, 1.3, 0.06, 5.55, 0.65, -6.75)]), M.metalDark, { name: 'df:s7-frame' }));
  det.add(mesh(plane(1.2, 0.6, 5.55, 1.62, -6.685), s7Mat, { receive: false, name: 'df:s7-sign' }));

  const redraw = (): void => {
    drawQuelle(ctx, qb);
    drawStation7(ctx, s7);
  };
  redraw();
  return { redraw };
}

function chip(g: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, fill: string, size = 18): number {
  g.font = `500 ${size}px "Geist Mono", monospace`;
  const w = g.measureText(text).width + size * 1.4;
  const h = size * 1.55;
  g.fillStyle = fill;
  g.beginPath();
  g.roundRect(x, y, w, h, h / 2);
  g.fill();
  g.strokeStyle = color;
  g.globalAlpha = 0.5;
  g.lineWidth = 1.5;
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = color;
  g.fillText(text, x + size * 0.7, y + h * 0.7);
  return w;
}

/** set the largest font (from `max` down to `min` px) at which `text` fits `maxW` */
function fitFont(g: CanvasRenderingContext2D, text: string, maxW: number, max: number, min: number, font: (px: number) => string): void {
  let px = max;
  g.font = font(px);
  while (px > min && g.measureText(text).width > maxW) g.font = font(--px);
}

function drawQuelle(ctx: ZoneContext, c: CanvasTex): void {
  const { g, w, h } = c;
  const t = (k: string): string => ctx.t(k);
  g.fillStyle = '#141414';
  g.fillRect(0, 0, w, h);
  // hairline (orange → teal)
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, '#ff6700');
  gr.addColorStop(1, '#2dd4bf');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, 4);
  g.fillStyle = '#a8a29e';
  g.font = '500 24px "Geist Mono", monospace';
  g.fillText(t('board.eyebrow'), 48, 64);
  g.fillStyle = '#f5f5f4';
  g.font = '700 46px "Space Grotesk", sans-serif';
  g.fillText(t('board.title'), 48, 122);
  const rows: [string, string, string][] = [
    [t('board.q1v'), t('board.q1k'), t('board.q1src')],
    [t('board.q2v'), t('board.q2k'), t('board.q2src')],
    [t('board.q3v'), t('board.q3k'), t('board.q3src')],
  ];
  rows.forEach(([v, k, src], i) => {
    const y = 196 + i * 112;
    g.fillStyle = '#2a2a2a';
    g.fillRect(48, y - 52, w - 96, 1.5);
    g.fillStyle = '#ff8534';
    g.font = '700 54px "Space Grotesk", sans-serif';
    g.fillText(v, 48, y + 10);
    const vw = g.measureText(v).width;
    const tx = 48 + vw + 24;
    const maxW = w - 48 - 128 - 16 - tx; // up to the chip
    g.fillStyle = '#f5f5f4';
    fitFont(g, k, maxW, 25, 17, (px) => `500 ${px}px "Geist", sans-serif`);
    g.fillText(k, tx, y - 6);
    g.fillStyle = '#78716c';
    fitFont(g, src, maxW, 18, 13, (px) => `500 ${px}px "Geist Mono", monospace`);
    g.fillText(src, tx, y + 22);
    chip(g, w - 48 - 128, y - 20, t('board.chipQuelle'), '#f5f5f4', 'rgba(255,255,255,0.04)', 17);
  });
  g.fillStyle = '#f5f5f4';
  g.font = '700 30px "Space Grotesk", sans-serif';
  g.fillText(t('claim'), 48, h - 52);
  chip(g, w - 48 - 270, 40, t('board.chipFiktion'), '#a8a29e', 'rgba(255,255,255,0.03)', 15);
  c.tex.needsUpdate = true;
}

function drawStation7(ctx: ZoneContext, c: CanvasTex): void {
  const { g, w, h } = c;
  const t = (k: string): string => ctx.t(k);
  g.fillStyle = '#141414';
  g.fillRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, '#ff6700');
  gr.addColorStop(1, '#2dd4bf');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, 3);
  g.fillStyle = '#a8a29e';
  g.font = '500 19px "Geist Mono", monospace';
  g.fillText(t('s7.eyebrow'), 26, 42);
  g.fillStyle = '#f5f5f4';
  g.font = '700 40px "Space Grotesk", sans-serif';
  g.fillText(t('s7.title'), 26, 96);
  g.fillStyle = '#d6d3d1';
  g.font = '500 22px "Geist Mono", monospace';
  g.fillText(t('s7.specs'), 26, 140);
  g.fillStyle = '#a8a29e';
  g.font = '400 19px "Geist", sans-serif';
  g.fillText(t('s7.howto'), 26, 184);
  chip(g, 26, 206, t('board.chipFiktionShort'), '#a8a29e', 'rgba(255,255,255,0.03)', 14);
  c.tex.needsUpdate = true;
}
