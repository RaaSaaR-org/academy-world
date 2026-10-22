/**
 * Station signs as one canvas plane each (eyebrow · title · body in the brand fonts), redrawn on
 * language/mode change. A troika sign costs 5 draw calls; this costs 1 (+ merged frame/stand).
 */
import * as THREE from 'three';
import { css, type Text } from '@/core/zones';
import { placed, type V3 } from './kit';
import { rbox } from './look';
import { own } from './materials';
import type { Sd } from './types';

export interface CanvasSignOpts {
  eyebrow: Text;
  title: Text;
  body?: Text;
  width: number;
  height: number;
  position: V3;
  rotationY?: number;
  /** add a post down to the floor (panel bottom at 0.9 m) */
  stand?: boolean;
}

export function canvasSign(sd: Sd, o: CanvasSignOpts): THREE.Mesh {
  const { ctx, B } = sd;
  const W = o.width,
    H = o.height;
  const PX = 512;
  const cw = PX,
    ch = Math.round((PX * H) / W);
  const canvas = document.createElement('canvas');
  canvas.width = cw * 2;
  canvas.height = ch * 2;
  const tex = own(new THREE.CanvasTexture(canvas));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = (): void => {
    const g = canvas.getContext('2d')!;
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.fillStyle = '#1f1f1f';
    g.fillRect(0, 0, cw, ch);
    const hair = g.createLinearGradient(0, 0, cw, 0);
    hair.addColorStop(0, css.orange);
    hair.addColorStop(1, css.teal);
    g.fillStyle = hair;
    g.fillRect(0, 0, cw, 3);
    const pad = cw * 0.07;
    let y = pad + 6;
    g.textBaseline = 'top';
    g.fillStyle = css.orange;
    g.font = `500 ${Math.round(cw * 0.032)}px "Geist Mono", monospace`;
    const eb = ctx.i18n.resolve(o.eyebrow).toUpperCase();
    let x = pad;
    for (const chr of eb) {
      g.fillText(chr, x, y);
      x += g.measureText(chr).width + cw * 0.004;
    }
    y += cw * 0.06;
    g.fillStyle = css.text;
    g.font = `700 ${Math.round(cw * 0.1)}px "Space Grotesk", sans-serif`;
    g.fillText(ctx.i18n.resolve(o.title), pad, y);
    y += cw * 0.135;
    if (o.body) {
      g.fillStyle = css.textSecondary;
      const fs = Math.round(cw * 0.044);
      g.font = `400 ${fs}px "Geist", sans-serif`;
      const words = ctx.i18n.resolve(o.body).split(' ');
      let line = '';
      for (const w of words) {
        const t = line ? `${line} ${w}` : w;
        if (g.measureText(t).width > cw - pad * 2 && line) {
          g.fillText(line, pad, y);
          y += fs * 1.4;
          line = w;
        } else line = t;
      }
      if (line) g.fillText(line, pad, y);
    }
    tex.needsUpdate = true;
  };
  draw();
  ctx.i18n.onChange(draw);

  const base = o.stand ? 0.9 : 0;
  const ry = o.rotationY ?? 0;
  const [px, py, pz] = o.position;
  const c = Math.cos(ry),
    s = Math.sin(ry);
  const at = (lx: number, ly: number, lz: number): V3 => [px + lx * c + lz * s, py + ly, pz - lx * s + lz * c];
  // board (ART-V2 §6.0): chamfered 0.06 alu frame, dark-glass face, a 2 cm teal top line, carbon foot
  const L = sd.look;
  B.geo(placed(rbox(W + 0.08, H + 0.08, 0.05, 0.02), at(0, base + H / 2, -0.035), [0, ry, 0]), { mat: L.carbon, seg: 'struktur' });
  for (const [fw, fh, fx, fy] of [
    [W + 0.12, 0.05, 0, H / 2 + 0.035],
    [W + 0.12, 0.05, 0, -H / 2 - 0.035],
    [0.05, H + 0.02, -W / 2 - 0.035, 0],
    [0.05, H + 0.02, W / 2 + 0.035, 0],
  ] as const)
    B.geo(placed(rbox(fw, fh, 0.07, 0.015), at(fx, base + H / 2 + fy, -0.02), [0, ry, 0]), { mat: L.alu, seg: 'struktur' });
  B.geo(placed(new THREE.BoxGeometry(W + 0.04, H + 0.04, 0.02), at(0, base + H / 2, -0.008), [0, ry, 0]), { mat: L.darkGlass, seg: 'struktur' });
  B.geo(placed(new THREE.BoxGeometry(W - 0.1, 0.02, 0.02), at(0, base + H + 0.075, 0), [0, ry, 0]), { mat: L.light('teal', 0), seg: 'struktur' });
  if (o.stand) {
    B.geo(placed(new THREE.CylinderGeometry(0.03, 0.04, base, 12), at(0, base / 2, -0.08)), { mat: L.alu, seg: 'struktur' });
    B.geo(placed(new THREE.CylinderGeometry(0.2, 0.24, 0.1, 24), at(0, 0.05, -0.08)), { mat: L.carbon, seg: 'struktur' });
    ctx.physics.addStaticBox({ size: [0.3, base, 0.3], position: at(0, base / 2, -0.08) });
  }
  const mat = own(new THREE.MeshBasicMaterial({ map: tex, name: 'sensordom:sign' }));
  const plane = B.mesh(new THREE.PlaneGeometry(W, H), { mat, seg: 'struktur' });
  // 8 mm in front of the dark-glass face (its front sits at +2 mm: at 0 the glass hid the whole sign)
  const p = at(0, base + H / 2, 0.01);
  plane.position.set(p[0], p[1], p[2]);
  plane.rotation.y = ry;
  return plane;
}
