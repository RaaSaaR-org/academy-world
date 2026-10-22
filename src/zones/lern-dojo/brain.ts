/**
 * Gehirn-Fenster: 6 × 3.4 m screen at (0, 4.8, −8) facing +z, three panels like a VLA (R1 §10.1):
 *   SEHEN     — the top camera (64 × 48, as the policy sees it) cut into 8 × 8-pixel patches, the
 *               cubes it recognises outlined; the wrist camera below it
 *   VERSTEHEN — the command as word chips, „Worauf achtet die Policy?“ (the fitted weights of word
 *               and place as shares), the mode, the three neighbours, the distance to the demos
 *   HANDELN   — the action chunk: 6 joints × 15 steps (0.5 s at 30 Hz)
 * Honest footer: the structure is a VLA's, the brain a nearest-neighbour imitator, not SmolVLA.
 * Canvases only (no extra render pass); redrawn ≤ 10 Hz while someone can see them.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { css } from '@/core/zones';
import { COLOURS, CUBE, POLICY, type CubeColour } from './tuning';
import { IMAGE } from './vision';
import { Batch } from './batch';
import { look } from './look';

export const BRAIN_POS = { x: 0, y: 4.8, z: -8 } as const;
const W = 6,
  H = 3.4;
const PANEL_W = 1.86,
  PANEL_H = 2.46,
  GAP = 0.12;

export interface NeighbourInfo {
  demo: number;
  t: number;
}

export interface UnderstandInfo {
  mode: 'idle' | 'record' | 'run' | 'train';
  line: string;
  sub: string;
  /** the command's colour word (null: no command yet) */
  word: CubeColour | null;
  /** fitted weights (null before training) */
  a: number | null;
  b: number | null;
  /** the cube it goes for */
  goal: CubeColour | null;
  nn: number | null;
  nbrs: NeighbourInfo[];
}

export interface Brain {
  /** SEHEN: the policy's camera picture, its class mask (0 = none, 1… = COLOURS + 1), the goal; the wrist picture */
  see(image: Uint8Array, mask: Uint8Array | null, goal: CubeColour | null, wrist: HTMLCanvasElement | null): void;
  /** HANDELN: a chunk (CH × 6) and the executing step */
  act(chunk: Float32Array | null, pos: number, label: string): void;
  understand(info: UnderstandInfo): void;
  /** a pulse while training (0 … 1) */
  pulse(t: number): void;
  relabel(): void;
}

function makeCanvasPlane(ctx: ZoneContext, cw: number, ch: number, w: number, h: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; mesh: THREE.Mesh } {
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const g = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  ctx.onDispose(() => {
    tex.dispose();
    mat.dispose();
    mesh.geometry.dispose();
  });
  return { canvas, g, tex, mesh };
}

const MONO = '"Geist Mono", ui-monospace, monospace';
const DISPLAY = '"Space Grotesk", sans-serif';
const SANS = '"Geist", sans-serif';
const CUBE_CSS: Record<CubeColour, string> = { rot: '#d83a2e', blau: '#2f6fd6', gruen: '#3f9e4d' };
const JOINT_ROWS = ['pan', 'lift', 'elbow', 'flex', 'roll', 'grip'] as const;

export function createBrain(ctx: ZoneContext): Brain {
  const M = ctx.materials;
  const det = ctx.groups.detail;
  const root = new THREE.Group();
  root.position.set(BRAIN_POS.x, BRAIN_POS.y, BRAIN_POS.z);
  ctx.groups.exterior.add(root);

  // ── bezel + hangers (exterior tier: the screen reads from the gate) ──────────
  const b = new Batch();
  const LK = look(ctx);
  b.box(LK.carbon, W + 0.24, H + 0.24, 0.14, 0, 0, -0.08);
  b.box(LK.alu, W + 0.32, 0.06, 0.18, 0, H / 2 + 0.15, -0.08);
  b.box(LK.alu, W + 0.32, 0.04, 0.18, 0, -H / 2 - 0.14, -0.08);
  for (const sx of [-1, 1]) b.cyl(LK.alu, 0.025, 0.025, 8.6 - (BRAIN_POS.y + H / 2), 8, sx * 2.4, (8.6 - BRAIN_POS.y + H / 2) / 2 + 0.05, -0.08);
  b.build(root, { castShadow: true, name: 'brain-bezel' });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H), M.screen);
  glass.position.z = -0.005;
  root.add(glass);

  // ── canvases (detail tier) ──────────────────────────────────────────────────
  const content = new THREE.Group();
  content.position.copy(root.position);
  det.add(content);
  const frame = makeCanvasPlane(ctx, 1024, 160, W, (160 / 1024) * W);
  const headH = (92 / 1024) * W,
    footH = (68 / 1024) * W;
  const headGeo = new THREE.PlaneGeometry(W, headH);
  const footGeo = new THREE.PlaneGeometry(W, footH);
  const uvSet = (geo: THREE.PlaneGeometry, v0: number, v1: number): void => {
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) > 0.5 ? v1 : v0);
  };
  uvSet(headGeo, 1 - 92 / 160, 1);
  uvSet(footGeo, 0, 68 / 160);
  headGeo.translate(0, H / 2 - headH / 2 - 0.02, 0.01);
  footGeo.translate(0, -H / 2 + footH / 2 + 0.02, 0.01);
  frame.mesh.geometry.dispose();
  const hf = new THREE.Mesh(mergeTwo(headGeo, footGeo), frame.mesh.material);
  ctx.onDispose(() => hf.geometry.dispose());
  content.add(hf);

  const panelY = (H / 2 - headH - 0.02 - (-H / 2 + footH + 0.02)) / 2 + (-H / 2 + footH + 0.02);
  const mkPanel = (cw: number, ch: number, x: number): ReturnType<typeof makeCanvasPlane> => {
    const p = makeCanvasPlane(ctx, cw, ch, PANEL_W, PANEL_H);
    p.mesh.position.set(x, panelY, 0.01);
    content.add(p.mesh);
    return p;
  };
  const see = mkPanel(256, 340, -(PANEL_W + GAP));
  const und = mkPanel(384, 508, 0);
  const act = mkPanel(256, 340, PANEL_W + GAP);
  ctx.lights.point([BRAIN_POS.x, BRAIN_POS.y - 1.4, BRAIN_POS.z + 1.4], { color: 0x9ff3e6, intensity: 2.2, distance: 6 });

  const T = (k: string, p?: Record<string, string | number>): string => ctx.t(k, p);
  let glow = 0;

  // ── header / footer ────────────────────────────────────────────────────────
  const drawFrame = (): void => {
    const g = frame.g;
    g.clearRect(0, 0, 1024, 160);
    g.fillStyle = '#121110';
    g.fillRect(0, 0, 1024, 92);
    g.fillRect(0, 92, 1024, 68);
    const grad = g.createLinearGradient(0, 0, 1024, 0);
    grad.addColorStop(0, css.orange);
    grad.addColorStop(1, css.teal);
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 3);
    g.font = `500 22px ${MONO}`;
    g.fillStyle = css.orange;
    g.fillText(T('brain.eyebrow').toUpperCase(), 26, 44);
    g.font = `700 30px ${DISPLAY}`;
    g.fillStyle = css.text;
    const flow = T('brain.flow');
    g.fillText(flow, 512 - g.measureText(flow).width / 2, 56);
    g.font = `500 18px ${MONO}`;
    const chip = 'SIM · LIVE';
    const cw = g.measureText(chip).width + 28;
    g.fillStyle = 'rgba(45,212,191,0.15)';
    roundRect(g, 1024 - 26 - cw, 26, cw, 32, 16);
    g.fill();
    g.strokeStyle = 'rgba(45,212,191,0.5)';
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = css.teal;
    g.fillText(chip, 1024 - 26 - cw + 14, 48);
    // footer: the honest label (R1 §10.3)
    g.font = `400 20px ${SANS}`;
    g.fillStyle = css.textSecondary;
    const honest = T('brain.honest');
    g.fillText(honest, 512 - g.measureText(honest).width / 2, 92 + 42);
    frame.tex.needsUpdate = true;
  };

  // ── SEHEN ──────────────────────────────────────────────────────────────────
  const cam = document.createElement('canvas');
  cam.width = IMAGE.w;
  cam.height = IMAGE.h;
  const cg = cam.getContext('2d', { willReadFrequently: true })!;
  const camData = cg.createImageData(IMAGE.w, IMAGE.h);
  const drawSee = (image: Uint8Array | null, mask: Uint8Array | null, goal: CubeColour | null, wrist: HTMLCanvasElement | null): void => {
    const g = see.g;
    g.fillStyle = '#121110';
    g.fillRect(0, 0, 256, 340);
    g.font = `600 22px ${DISPLAY}`;
    g.fillStyle = css.text;
    g.fillText(T('brain.see'), 16, 32);
    g.font = `500 11px ${MONO}`;
    g.fillStyle = css.textMuted;
    g.fillText(T('brain.seeSub'), 16, 50);
    const ox = 16,
      oy = 60,
      S = 224,
      SH = (S * IMAGE.h) / IMAGE.w;
    if (image) {
      for (let i = 0, j = 0; i < IMAGE.w * IMAGE.h; i++, j += 3) {
        camData.data[i * 4] = image[j];
        camData.data[i * 4 + 1] = image[j + 1];
        camData.data[i * 4 + 2] = image[j + 2];
        camData.data[i * 4 + 3] = 255;
      }
      cg.putImageData(camData, 0, 0);
      g.imageSmoothingEnabled = false;
      g.drawImage(cam, ox, oy, S, SH);
    }
    // patches (8 × 8 px) and the ones that hold a recognised cube
    const pw = S / (IMAGE.w / 8),
      cols = IMAGE.w / 8,
      rows = IMAGE.h / 8;
    g.strokeStyle = 'rgba(20,20,20,0.7)';
    g.lineWidth = 1;
    for (let i = 0; i <= cols; i++) {
      g.beginPath();
      g.moveTo(ox + i * pw, oy);
      g.lineTo(ox + i * pw, oy + SH);
      g.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      g.beginPath();
      g.moveTo(ox, oy + j * pw);
      g.lineTo(ox + S, oy + j * pw);
      g.stroke();
    }
    if (mask) {
      g.lineWidth = 2;
      for (let pj = 0; pj < rows; pj++)
        for (let pi = 0; pi < cols; pi++) {
          let cls = 0;
          for (let v = pj * 8; v < pj * 8 + 8 && !cls; v++) for (let u = pi * 8; u < pi * 8 + 8 && !cls; u++) cls = mask[v * IMAGE.w + u];
          if (!cls) continue;
          const colour = COLOURS[cls - 1];
          g.strokeStyle = colour === goal ? css.orange : CUBE_CSS[colour];
          g.strokeRect(ox + pi * pw + 1, oy + pj * pw + 1, pw - 2, pw - 2);
        }
    }
    // the wrist camera below
    const wy = oy + SH + 12;
    if (wrist) g.drawImage(wrist, ox, wy, S, (S * wrist.height) / wrist.width);
    g.font = `500 11px ${MONO}`;
    g.fillStyle = css.textMuted;
    g.fillText(T('brain.wrist'), ox, 336);
    see.tex.needsUpdate = true;
  };

  // ── HANDELN ────────────────────────────────────────────────────────────────
  const CH = POLICY.chunk;
  const drawAct = (chunk: Float32Array | null, pos: number, label: string): void => {
    const g = act.g;
    g.fillStyle = '#121110';
    g.fillRect(0, 0, 256, 340);
    g.font = `600 22px ${DISPLAY}`;
    g.fillStyle = css.text;
    g.fillText(T('brain.act'), 16, 32);
    g.font = `500 11px ${MONO}`;
    g.fillStyle = css.textMuted;
    g.fillText(label, 16, 50);
    const ox = 46,
      cw = 13,
      top = 66,
      rowH = 38;
    JOINT_ROWS.forEach((name, j) => {
      const y0 = top + j * rowH + rowH / 2;
      g.fillStyle = css.textMuted;
      g.font = `500 11px ${MONO}`;
      g.fillText(name, 8, y0 + 4);
      g.strokeStyle = '#2a2a2a';
      g.beginPath();
      g.moveTo(ox, y0);
      g.lineTo(ox + CH * cw, y0);
      g.stroke();
      for (let k = 0; k < CH; k++) {
        // arm joints: Δ ±20° = a full bar; the gripper: its absolute target (open up, shut down)
        const raw = chunk ? chunk[k * 6 + j] : 0;
        const v = j === 5 ? (chunk ? (raw - 0.17) / 0.34 : 0) : Math.max(-1, Math.min(1, raw / 0.35));
        const hgt = Math.max(-1, Math.min(1, v)) * (rowH / 2 - 4);
        g.fillStyle = j === 5 ? css.orangeLight : j % 2 ? css.textSecondary : css.teal;
        g.globalAlpha = k < pos ? 0.3 : 1;
        g.fillRect(ox + k * cw + 2, Math.min(y0, y0 - hgt), cw - 4, Math.max(1, Math.abs(hgt)));
        g.globalAlpha = 1;
      }
    });
    if (chunk && pos < CH) {
      g.strokeStyle = css.orange;
      g.lineWidth = 2;
      g.strokeRect(ox + pos * cw + 1, top + 2, cw - 2, 6 * rowH - 4);
    }
    g.font = `500 11px ${MONO}`;
    g.fillStyle = css.textMuted;
    g.fillText(T('brain.actAxis'), 8, top + 6 * rowH + 18);
    g.fillText(T('brain.actLegend'), 8, top + 6 * rowH + 34);
    act.tex.needsUpdate = true;
  };

  // ── VERSTEHEN ──────────────────────────────────────────────────────────────
  const drawUnd = (info: UnderstandInfo): void => {
    const g = und.g;
    g.fillStyle = '#121110';
    g.fillRect(0, 0, 384, 508);
    g.font = `600 30px ${DISPLAY}`;
    g.fillStyle = css.text;
    g.fillText(T('brain.understand'), 22, 44);
    // the command as word chips
    g.fillStyle = '#1f1f1f';
    roundRect(g, 22, 60, 340, 92, 12);
    g.fill();
    g.font = `500 12px ${MONO}`;
    g.fillStyle = css.orange;
    g.fillText(T('brain.command').toUpperCase(), 36, 82);
    const pre = info.word ? T('cmd.pre').split(' ') : [];
    const words = info.word ? [...pre, T(`cmd.adj.${info.word}`), ...T('cmd.post').split(' ')] : [T('brain.noCommand')];
    let x = 36,
      y = 112;
    g.font = `500 17px ${SANS}`;
    words.forEach((w, i) => {
      const ww = g.measureText(w).width + 14;
      if (x + ww > 350) {
        x = 36;
        y += 30;
      }
      const isColour = !!info.word && i === pre.length;
      g.fillStyle = isColour ? CUBE_CSS[info.word!] : '#2a2a2a';
      roundRect(g, x, y - 18, ww, 26, 8);
      g.fill();
      g.fillStyle = css.text;
      g.fillText(w, x + 7, y);
      x += ww + 5;
    });
    // „Worauf achtet die Policy?“ — the fitted weights as shares (word vs. place)
    const by = 178;
    g.font = `500 13px ${MONO}`;
    g.fillStyle = css.textMuted;
    g.fillText(T('brain.attention'), 22, by);
    const a = Math.max(0, info.a ?? 0),
      bb = Math.max(0, info.b ?? 0);
    const sum = a + bb || 1;
    const bars: [string, number][] = [
      [T('brain.word'), info.a == null ? 0 : a / sum],
      [T('brain.place'), info.b == null ? 0 : bb / sum],
    ];
    bars.forEach(([label, v], i) => {
      const yy = by + 16 + i * 30;
      g.fillStyle = css.textSecondary;
      g.font = `500 13px ${SANS}`;
      g.fillText(label, 22, yy + 13);
      g.fillStyle = '#2a2a2a';
      g.fillRect(110, yy, 220, 16);
      g.fillStyle = i === 0 ? css.teal : css.textSecondary;
      g.fillRect(110, yy, 220 * Math.min(1, v), 16);
      if (glow > 0) {
        // the training's progress runs along both bars
        g.fillStyle = 'rgba(231,229,228,0.35)';
        g.fillRect(110, yy + 12, 220 * glow, 4);
      }
      g.font = `500 12px ${MONO}`;
      g.fillStyle = css.text;
      g.fillText(info.a == null ? '—' : `${Math.round(v * 100)} %`, 336, yy + 13);
    });
    // mode line
    g.font = `500 15px ${MONO}`;
    g.fillStyle = info.mode === 'run' ? css.orange : info.mode === 'record' ? css.error : css.teal;
    g.fillText(info.line, 22, 270);
    g.font = `400 14px ${SANS}`;
    g.fillStyle = css.textSecondary;
    g.fillText(info.sub, 22, 292);
    if (info.goal) {
      g.font = `500 13px ${MONO}`;
      g.fillStyle = css.textMuted;
      g.fillText(T('brain.goal'), 22, 318);
      g.fillStyle = CUBE_CSS[info.goal];
      g.fillRect(150, 306, 14, 14);
      g.fillStyle = css.text;
      g.fillText(T(`cmd.name.${info.goal}`), 172, 318);
    }
    // neighbours
    g.font = `500 13px ${MONO}`;
    g.fillStyle = css.textMuted;
    g.fillText(T('brain.neighbours'), 22, 352);
    for (let i = 0; i < 3; i++) {
      const n = info.nbrs[i];
      g.fillStyle = n ? css.textSecondary : '#3d3d3d';
      g.fillText(n ? `#${i + 1}  Demo ${n.demo} · t = ${ctx.i18n.num(n.t, 1)} s` : `#${i + 1}  —`, 22, 374 + i * 20);
    }
    // the distance to the demos (coverage)
    const my = 448;
    g.fillStyle = css.textMuted;
    g.fillText(T('brain.distance'), 22, my);
    const mx = 22,
      mw = 340,
      mh = 12,
      maxV = 4;
    g.fillStyle = '#2a2a2a';
    g.fillRect(mx, my + 10, mw, mh);
    const v = info.nn ?? 0;
    const over = v > POLICY.oodDistance;
    g.fillStyle = over ? css.error : css.teal;
    g.fillRect(mx, my + 10, Math.min(1, v / maxV) * mw, mh);
    const tx = mx + (POLICY.oodDistance / maxV) * mw;
    g.fillStyle = css.error;
    g.fillRect(tx - 1, my + 4, 2, mh + 12);
    g.font = `500 13px ${MONO}`;
    g.fillStyle = over ? css.error : css.text;
    g.fillText(info.nn == null ? '—' : `${ctx.i18n.num(v, 2)} ${over ? T('brain.outside') : T('brain.inside')}`, mx, my + 44);
    und.tex.needsUpdate = true;
  };

  let lastInfo: UnderstandInfo | null = null;
  let lastSee: [Uint8Array | null, Uint8Array | null, CubeColour | null, HTMLCanvasElement | null] = [null, null, null, null];
  let lastChunk: Float32Array | null = null;
  let lastPos = 0;
  let lastLabel = '';
  drawFrame();
  drawSee(null, null, null, null);
  drawAct(null, 0, '');
  void CUBE;

  return {
    see(image, mask, goal, wrist) {
      lastSee = [image, mask, goal, wrist];
      drawSee(image, mask, goal, wrist);
    },
    act(chunk, pos, label) {
      lastChunk = chunk;
      lastPos = pos;
      lastLabel = label;
      drawAct(chunk, pos, label);
    },
    understand(info) {
      lastInfo = info;
      drawUnd(info);
    },
    pulse(t) {
      // training: the bars fill smoothly (no blinking: flash safety)
      const was = glow;
      glow = t > 0 ? Math.round((1 - Math.min(1, t / 3)) * 20) / 20 : 0;
      if (was !== glow && lastInfo) drawUnd(lastInfo);
    },
    relabel() {
      drawFrame();
      drawSee(...lastSee);
      drawAct(lastChunk, lastPos, lastLabel);
      if (lastInfo) drawUnd(lastInfo);
    },
  };
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const A = a.getAttribute(name) as THREE.BufferAttribute,
      B = b.getAttribute(name) as THREE.BufferAttribute;
    const arr = new Float32Array(A.array.length + B.array.length);
    arr.set(A.array as Float32Array, 0);
    arr.set(B.array as Float32Array, A.array.length);
    g.setAttribute(name, new THREE.BufferAttribute(arr, A.itemSize));
  }
  const ia = a.index!,
    ib = b.index!;
  const idx = new Uint16Array(ia.count + ib.count);
  for (let i = 0; i < ia.count; i++) idx[i] = ia.getX(i);
  const off = a.getAttribute('position').count;
  for (let i = 0; i < ib.count; i++) idx[ia.count + i] = ib.getX(i) + off;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  a.dispose();
  b.dispose();
  return g;
}
