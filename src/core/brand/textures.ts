import * as THREE from 'three';
import { css } from './palette';

/** Deterministic PRNG so procedural textures look identical on every load. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(
  width: number,
  height: number,
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  opts: { repeat?: [number, number]; srgb?: boolean; anisotropy?: number } = {},
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d')!;
  draw(g, width, height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  tex.anisotropy = opts.anisotropy ?? 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

/** Hazard tape ("Absperrband"): orange / #0A0A0A at −45°, light wear. One repeat = square tile. */
export function drawHazard(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = css.hazardBlack;
  g.fillRect(0, 0, w, h);
  g.fillStyle = css.orange;
  const pitch = w / 4; // 4 stripe pairs per tile → seamless
  g.save();
  for (let x = -h; x < w + h; x += pitch) {
    g.beginPath();
    g.moveTo(x, h);
    g.lineTo(x + pitch / 2, h);
    g.lineTo(x + pitch / 2 + h, 0);
    g.lineTo(x + h, 0);
    g.closePath();
    g.fill();
  }
  g.restore();
  // light wear pass
  const rnd = mulberry32(7);
  g.globalAlpha = 0.18;
  g.strokeStyle = '#000';
  for (let i = 0; i < 24; i++) {
    g.lineWidth = 0.5 + rnd();
    const x = rnd() * w,
      y = rnd() * h;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 18, y + (rnd() - 0.5) * 6);
    g.stroke();
  }
  g.globalAlpha = 1;
}

/** Concrete with a fine 1 m measuring grid (texture = 1 m × 1 m). */
export function drawConcreteGrid(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#b9b4af';
  g.fillRect(0, 0, w, h);
  const rnd = mulberry32(42);
  // aggregate speckle
  for (let i = 0; i < 2600; i++) {
    const v = 150 + Math.floor(rnd() * 60);
    g.fillStyle = `rgba(${v},${v - 4},${v - 8},${0.25 + rnd() * 0.3})`;
    const s = rnd() * 2.2 + 0.4;
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
  // soft blotches
  for (let i = 0; i < 18; i++) {
    const x = rnd() * w,
      y = rnd() * h,
      r = 30 + rnd() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(90,84,78,${0.05 + rnd() * 0.06})`);
    grd.addColorStop(1, 'rgba(90,84,78,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // grid seam + 10 cm ticks
  g.strokeStyle = 'rgba(60,56,52,0.55)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, w - 2, h - 2);
  g.strokeStyle = 'rgba(60,56,52,0.22)';
  g.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    const p = (i / 10) * w;
    const len = i === 5 ? 18 : 8;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, len);
    g.moveTo(0, p);
    g.lineTo(len, p);
    g.stroke();
  }
}

/** Dark riveted floor plate tile (1 m). */
export function drawFloorPlate(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#2b2725';
  g.fillRect(0, 0, w, h);
  const rnd = mulberry32(11);
  for (let i = 0; i < 1800; i++) {
    const v = 30 + Math.floor(rnd() * 30);
    g.fillStyle = `rgba(${v + 8},${v + 4},${v},0.35)`;
    g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
  }
  // brushed streaks
  g.globalAlpha = 0.06;
  for (let i = 0; i < 120; i++) {
    g.fillStyle = rnd() > 0.5 ? '#fff' : '#000';
    g.fillRect(0, rnd() * h, w, 1);
  }
  g.globalAlpha = 1;
  // seams
  g.strokeStyle = '#141210';
  g.lineWidth = 4;
  g.strokeRect(2, 2, w - 4, h - 4);
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  g.lineWidth = 1;
  g.strokeRect(5, 5, w - 10, h - 10);
  // rivets
  for (const [x, y] of [
    [16, 16],
    [w - 16, 16],
    [16, h - 16],
    [w - 16, h - 16],
  ] as const) {
    g.fillStyle = '#4a4542';
    g.beginPath();
    g.arc(x, y, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.beginPath();
    g.arc(x - 1.5, y - 1.5, 2, 0, Math.PI * 2);
    g.fill();
  }
}

/** Crate side: dark composite panel with a lighter frame. */
export function drawCrate(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#3a3532';
  g.fillRect(0, 0, w, h);
  const rnd = mulberry32(5);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(0,0,0,${rnd() * 0.15})`;
    g.fillRect(rnd() * w, rnd() * h, 2, 2);
  }
  const b = w * 0.09;
  g.fillStyle = '#57534e';
  g.fillRect(0, 0, w, b);
  g.fillRect(0, h - b, w, b);
  g.fillRect(0, 0, b, h);
  g.fillRect(w - b, 0, b, h);
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 2;
  g.strokeRect(b, b, w - 2 * b, h - 2 * b);
  // diagonal brace
  g.strokeStyle = '#4a4542';
  g.lineWidth = b * 0.7;
  g.beginPath();
  g.moveTo(b, h - b);
  g.lineTo(w - b, b);
  g.stroke();
}

// ── ART-V2 "Flugmaschine" textures (procedural, 0 bytes download) ─────────────

/** Tileable value noise on a size² grid (periods must divide `size`), 0…1. */
function tileNoise(size: number, periods: number[], seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 0.5,
    norm = 0;
  periods.forEach((period, k) => {
    const r = mulberry32(seed + k * 31);
    const g = new Float32Array(period * period);
    for (let i = 0; i < g.length; i++) g[i] = r();
    const cell = size / period;
    for (let y = 0; y < size; y++) {
      const fy = y / cell,
        yi = Math.floor(fy),
        ty = fy - yi,
        v = ty * ty * (3 - 2 * ty);
      const y0 = yi % period,
        y1 = (yi + 1) % period;
      for (let x = 0; x < size; x++) {
        const fx = x / cell,
          xi = Math.floor(fx),
          tx = fx - xi,
          u = tx * tx * (3 - 2 * tx);
        const x0 = xi % period,
          x1 = (xi + 1) % period;
        const a = g[y0 * period + x0],
          b = g[y0 * period + x1],
          c = g[y1 * period + x0],
          d = g[y1 * period + x1];
        out[y * size + x] += (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * amp;
      }
    }
    norm += amp;
    amp *= 0.5;
  });
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

/**
 * Height field (wraps) → linear RGB normal map. `blue` (0…1 per pixel), when given, replaces the
 * blue channel (shaders that rebuild z from x/y use it as a free data channel, e.g. panel tone).
 */
export function normalTexture(hgt: Float32Array, w: number, h: number, strength: number, blue?: Float32Array, anisotropy = 8): THREE.CanvasTexture {
  return canvasTexture(
    w,
    h,
    (g) => {
      const img = g.createImageData(w, h);
      const H = (x: number, y: number): number => hgt[((y + h) % h) * w + ((x + w) % w)];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let nx = -(H(x + 1, y) - H(x - 1, y)) * strength;
          let ny = (H(x, y + 1) - H(x, y - 1)) * strength;
          let nz = 1;
          const l = Math.hypot(nx, ny, nz);
          nx /= l;
          ny /= l;
          nz /= l;
          const o = (y * w + x) * 4;
          img.data[o] = Math.round((nx * 0.5 + 0.5) * 255);
          img.data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
          img.data[o + 2] = blue ? Math.round(blue[y * w + x] * 255) : Math.round((nz * 0.5 + 0.5) * 255);
          img.data[o + 3] = 255;
        }
      g.putImageData(img, 0, 0);
    },
    { srgb: false, anisotropy },
  );
}

/**
 * `panelN` (ART-V2 §2.3): 512² = 4.8 × 4.8 m of ceramic-composite panels 2.4 × 1.2 m, every
 * second course offset by 1.2 m. Seams are ~3 cm grooves with a 1 px bevel, four recessed
 * fasteners per panel, 0.5 % grain. Blue channel = per-panel tone (0.5 = neutral, ±3 %).
 */
export function makePanelNormal(anisotropy = 8): THREE.CanvasTexture {
  const S = 512,
    PW = 256,
    PH = 128;
  const grain = tileNoise(S, [32, 64, 128, 256], 501);
  const hgt = new Float32Array(S * S);
  const tone = new Float32Array(S * S);
  const r = mulberry32(502);
  const tones: number[] = [];
  for (let k = 0; k < 64; k++) tones.push(0.5 + (r() - 0.5) * 0.9);
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / PH);
    const off = row % 2 ? PW / 2 : 0;
    const py = y % PH;
    for (let x = 0; x < S; x++) {
      const xs = (x - off + S) % S;
      const col = Math.floor(xs / PW);
      const px = xs % PW;
      const e = Math.min(px, PW - 1 - px, py, PH - 1 - py);
      let v = 1 + (grain[y * S + x] - 0.5) * 0.012;
      if (e < 1.5) v = 0;
      else if (e < 3) v = (e - 1.5) / 1.5;
      // recessed fasteners 7 px in from each corner
      for (const [fx, fy] of [
        [7, 7],
        [PW - 8, 7],
        [7, PH - 8],
        [PW - 8, PH - 8],
      ]) {
        const d = Math.hypot(px - fx, py - fy);
        if (d < 2.6) v = Math.min(v, 0.55 + (d / 2.6) * 0.45);
      }
      hgt[y * S + x] = v;
      tone[y * S + x] = tones[(row * 2 + col) % 64];
    }
  }
  return normalTexture(hgt, S, S, 1.6, tone, anisotropy);
}

/**
 * `deckPanel` + `deckPanelN` (ART-V2 §2.3): 512² = 12 × 12 m of walkable composite, 3 × 1.5 m
 * panels, every second row offset by 1.5 m, 2 px seams, a few flush 0.4 m service hatches.
 * The albedo is near white (×material colour), so one pair serves deck, paths and plaza.
 */
export function makeDeckPanel(anisotropy = 8): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const S = 512,
    PW = 128,
    PH = 64;
  const r = mulberry32(611);
  const grain = tileNoise(S, [16, 32, 64, 128, 256], 612);
  const blot = tileNoise(S, [4, 8, 16], 613);
  const hgt = new Float32Array(S * S);
  const alb = new Float32Array(S * S);
  const tones: number[] = [];
  for (let k = 0; k < 64; k++) tones.push(1 + (r() - 0.5) * 0.06);
  const hatches: [number, number][] = [];
  for (let k = 0; k < 4; k++) hatches.push([Math.floor(r() * 4) * PW + 20 + Math.floor(r() * 80), Math.floor(r() * 8) * PH + 14 + Math.floor(r() * 24)]);
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / PH);
    const off = row % 2 ? PW / 2 : 0;
    const py = y % PH;
    for (let x = 0; x < S; x++) {
      const xs = (x - off + S) % S;
      const col = Math.floor(xs / PW);
      const px = xs % PW;
      const e = Math.min(px, PW - 1 - px, py, PH - 1 - py);
      const i = y * S + x;
      let h = 1 + (grain[i] - 0.5) * 0.02;
      let a = tones[(row * 4 + col) % 64] * (0.955 + grain[i] * 0.05) * (0.975 + blot[i] * 0.04);
      if (e < 1) {
        h = 0.1;
        a *= 0.74;
      } else if (e < 2) {
        h = 0.55;
        a *= 0.92;
      }
      for (const [hx, hy] of hatches) {
        const dx = Math.abs(x - hx),
          dy = Math.abs(y - hy);
        const he = Math.max(dx, dy);
        if (he >= 8 && he < 9.5) {
          h = Math.min(h, 0.35);
          a *= 0.8;
        } else if (he < 8) a *= 0.985;
      }
      hgt[i] = h;
      alb[i] = a;
    }
  }
  const map = canvasTexture(
    S,
    S,
    (g) => {
      const img = g.createImageData(S, S);
      for (let i = 0; i < S * S; i++) {
        const v = Math.min(1, alb[i] * 0.94);
        img.data[i * 4] = Math.round(v * 255);
        img.data[i * 4 + 1] = Math.round(v * 0.995 * 255);
        img.data[i * 4 + 2] = Math.round(v * 0.985 * 255);
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    },
    { anisotropy },
  );
  return { map, normal: normalTexture(hgt, S, S, 1.8, undefined, anisotropy) };
}

/**
 * `pvTex` (ART-V2 §2.3): 256 × 384 photovoltaic cells (#1B1A1A), silver busbars every 32 px,
 * fine fingers every 16 px, light cell gaps.
 */
export function drawPv(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#3d3a37';
  g.fillRect(0, 0, w, h);
  const r = mulberry32(707);
  const C = 64;
  for (let y = 0; y < h; y += C)
    for (let x = 0; x < w; x += C) {
      const v = 25 + Math.round((r() - 0.5) * 6);
      g.fillStyle = `rgb(${v + 2},${v + 1},${v + 3})`;
      g.fillRect(x + 2, y + 2, C - 4, C - 4);
      // cell corner chamfers (mono cells)
      g.fillStyle = '#3d3a37';
      for (const [cx, cy] of [
        [x + 2, y + 2],
        [x + C - 2, y + 2],
        [x + 2, y + C - 2],
        [x + C - 2, y + C - 2],
      ]) {
        g.beginPath();
        g.moveTo(cx - 5, cy);
        g.lineTo(cx, cy - 5);
        g.lineTo(cx + 5, cy);
        g.lineTo(cx, cy + 5);
        g.closePath();
        g.fill();
      }
    }
  g.fillStyle = 'rgba(200,196,190,0.08)';
  for (let y = 8; y < h; y += 16) g.fillRect(0, y, w, 1);
  g.fillStyle = 'rgba(200,196,190,0.55)';
  for (let x = 16; x < w; x += 32) g.fillRect(x, 0, 1.5, h);
}
