import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { rng } from './util';

/**
 * Procedural canvas textures for the island (no image files). Every texture is
 * created once, owned by the island module and disposed on dispose.
 */
export interface IslandTextures {
  /** whole plaza, 64 × 64 m: the "turbine disc" (rings every 3 m, radial seams every 7.5°), bearing ring, baked contact AO */
  plaza: THREE.Texture;
  plazaN: THREE.Texture;
  /** 1 m perforated alu catwalk grating (alpha-free, dark holes) */
  grating: THREE.Texture;
  gratingN: THREE.Texture;
  /** rotor blur disc (alpha) */
  blur: THREE.Texture;
  /** soft round sprite (alpha) */
  soft: THREE.Texture;
}

/** Tileable value-noise fbm on a size² grid (each period must divide `size`). */
export function tileFbm(size: number, periods: number[], seed: number, ridged = false): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 0.5,
    norm = 0;
  periods.forEach((period, k) => {
    const r = rng(seed + k * 31);
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
        let n = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
        if (ridged) n = 1 - Math.abs(n * 2 - 1);
        out[y * size + x] += n * amp;
      }
    }
    norm += amp;
    amp *= 0.5;
  });
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

/** Height field (0…1, size w×h, wraps) → tangent-space normal map canvas texture (linear). */
export function normalMapFromHeight(ct: ZoneContext['materials']['canvasTexture'], hgt: Float32Array, w: number, h: number, strength: number): THREE.CanvasTexture {
  return ct(
    w,
    h,
    (g) => {
      const img = g.createImageData(w, h);
      const data = img.data;
      // W6: the same wrap-around central differences without a modulo or Math.hypot per pixel
      for (let y = 0; y < h; y++) {
        const row = y * w,
          up = ((y + h - 1) % h) * w,
          dn = ((y + 1) % h) * w;
        for (let x = 0; x < w; x++) {
          const xl = x === 0 ? w - 1 : x - 1,
            xr = x === w - 1 ? 0 : x + 1;
          const nx = -(hgt[row + xr] - hgt[row + xl]) * strength;
          const ny = (hgt[dn + x] - hgt[up + x]) * strength;
          const il = 1 / Math.sqrt(nx * nx + ny * ny + 1);
          const o = (row + x) * 4;
          data[o] = Math.round((nx * il * 0.5 + 0.5) * 255);
          data[o + 1] = Math.round((ny * il * 0.5 + 0.5) * 255);
          data[o + 2] = Math.round((il * 0.5 + 0.5) * 255);
          data[o + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    },
    { srgb: false, anisotropy: 8 },
  );
}

/**
 * W6 (PL-11): the plaza's relief straight from its colour canvas, in one pass. The canvas is drawn
 * through `filter: blur()` (the browser's own, on the GPU where it can) instead of the old JS 3×3
 * blur over a Float32 copy, and the normals come from the green channel (≈ the luminance of the
 * near-grey plaza) in a single loop: no 4-million-pixel height array, no blur loop. Browsers
 * without canvas filters get the unblurred seams.
 */
function reliefFromCanvas(ct: ZoneContext['materials']['canvasTexture'], src: HTMLCanvasElement, blurPx: number, strength: number): THREE.CanvasTexture {
  const w = src.width,
    h = src.height;
  return ct(
    w,
    h,
    (g) => {
      g.filter = `blur(${blurPx}px)`;
      g.drawImage(src, 0, 0);
      g.filter = 'none';
      const d = g.getImageData(0, 0, w, h).data;
      const img = g.createImageData(w, h);
      const out = img.data;
      const k = strength / 255;
      for (let y = 0; y < h; y++) {
        const row = y * w,
          up = ((y + h - 1) % h) * w,
          dn = ((y + 1) % h) * w;
        for (let x = 0; x < w; x++) {
          const xl = x === 0 ? w - 1 : x - 1,
            xr = x === w - 1 ? 0 : x + 1;
          const nx = -(d[(row + xr) * 4 + 1] - d[(row + xl) * 4 + 1]) * k;
          const ny = (d[(dn + x) * 4 + 1] - d[(up + x) * 4 + 1]) * k;
          const il = 1 / Math.sqrt(nx * nx + ny * ny + 1);
          const o = (row + x) * 4;
          out[o] = Math.round((nx * il * 0.5 + 0.5) * 255);
          out[o + 1] = Math.round((ny * il * 0.5 + 0.5) * 255);
          out[o + 2] = Math.round((il * 0.5 + 0.5) * 255);
          out[o + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    },
    { srgb: false, anisotropy: 8 },
  );
}

export function createTextures(ctx: ZoneContext): IslandTextures {
  const ct = ctx.materials.canvasTexture;
  const own = <T extends THREE.Texture>(t: T): T => {
    ctx.onDispose(() => t.dispose());
    return t;
  };

  // ── plaza: turbine disc (ART-V2 §4.2) ─────────────────────────────────────
  const plaza = own(
    ct(2048, 2048, (g, w, h) => {
      const r = rng(31);
      const s = w / 64; // px per metre
      const cx = w / 2,
        cy = h / 2;
      g.fillStyle = '#ece9e5';
      g.fillRect(0, 0, w, h);
      // panels: rings every 3 m, radial seams every 7.5° (offset by half a panel every other ring)
      for (let ring = 0; ring < 11; ring++) {
        const r0 = ring * 3,
          r1 = r0 + 3;
        const n = 48;
        for (let k = 0; k < n; k++) {
          const a0 = (k / n) * Math.PI * 2 + (ring % 2) * (Math.PI / n),
            a1 = a0 + (Math.PI * 2) / n;
          const v = 236 + Math.round((r() - 0.5) * 10);
          g.fillStyle = `rgb(${v},${v - 2},${v - 5})`;
          g.beginPath();
          g.arc(cx, cy, r1 * s, a0, a1);
          g.arc(cx, cy, r0 * s, a1, a0, true);
          g.closePath();
          g.fill();
          g.strokeStyle = 'rgba(70,64,58,0.6)';
          g.lineWidth = 2;
          g.stroke();
        }
      }
      // fine grain (W6: 2 × 64 prebuilt fill styles instead of 50 000 formatted strings; same draws)
      const grain = [0, 1].map((dark) => Array.from({ length: 64 }, (_, i) => `rgba(${dark ? '40,34,30' : '255,250,240'},${(((i + 0.5) / 64) * 0.035).toFixed(5)})`));
      for (let k = 0; k < 50000; k++) {
        const set = r() < 0.5 ? grain[1] : grain[0];
        g.fillStyle = set[Math.min(63, Math.floor(r() * 64))];
        g.fillRect(r() * w, r() * h, 2, 2);
      }
      // baked contact AO: the tower foot, the Libelle plinth (0, 19), the benches, the pods
      const ao = (x: number, z: number, r0: number, r1: number, a: number): void => {
        const grd = g.createRadialGradient(cx + x * s, cy + z * s, r0 * s, cx + x * s, cy + z * s, r1 * s);
        grd.addColorStop(0, `rgba(28,24,22,${a})`);
        grd.addColorStop(1, 'rgba(28,24,22,0)');
        g.fillStyle = grd;
        g.fillRect(cx + (x - r1) * s, cy + (z - r1) * s, r1 * 2 * s, r1 * 2 * s);
      };
      ao(0, 0, 8.6, 12, 0.32);
      ao(0, 19, 3.4, 4.8, 0.3);
      const bx = (b: number, rr: number): [number, number] => [Math.sin((b * Math.PI) / 180) * rr, -Math.cos((b * Math.PI) / 180) * rr];
      for (const b of [60, 120, 240, 300]) ao(...bx(b, 22.77), 0.4, 2.6, 0.16);
      for (const b of [60, 120, 240]) ao(...bx(b, 27.4), 3.1, 4.4, 0.28);
      // engraved bearing ring at r 30.2 … 31.7 with ticks and numbers (a measuring instrument)
      g.strokeStyle = 'rgba(64,58,52,0.85)';
      g.lineWidth = 0.06 * s;
      g.beginPath();
      g.arc(cx, cy, 30.2 * s, 0, Math.PI * 2);
      g.stroke();
      g.font = `500 ${0.55 * s}px "Geist Mono", monospace`;
      g.fillStyle = 'rgba(64,58,52,0.9)';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let b = 0; b < 360; b += 5) {
        const a = (b * Math.PI) / 180;
        const major = b % 30 === 0;
        const x0 = cx + Math.sin(a) * 30.2 * s,
          y0 = cy - Math.cos(a) * 30.2 * s;
        const len = (major ? 0.9 : b % 10 === 0 ? 0.5 : 0.3) * s;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x0 + Math.sin(a) * len, y0 - Math.cos(a) * len);
        g.stroke();
        if (major) {
          // the top of each number faces the tower: upright for someone walking in toward the plaza
          g.save();
          g.translate(cx + Math.sin(a) * 31.05 * s, cy - Math.cos(a) * 31.05 * s);
          g.rotate(a + Math.PI);
          g.fillText(String(b).padStart(3, '0'), -0.9 * s, 0);
          g.restore();
        }
      }
    }),
  );
  plaza.wrapS = plaza.wrapT = THREE.ClampToEdgeWrapping;

  // ── perforated alu grating (1 m tile): round holes on a staggered 5 cm pitch ──
  const GS = 256;
  const gh = new Float32Array(GS * GS);
  for (let y = 0; y < GS; y++)
    for (let x = 0; x < GS; x++) {
      const pitch = 12.8;
      const row = Math.floor(y / pitch);
      const ox = row % 2 ? pitch / 2 : 0;
      const dx = ((x + ox) % pitch) - pitch / 2,
        dy = (y % pitch) - pitch / 2;
      const d = Math.hypot(dx, dy);
      gh[y * GS + x] = d < 3.6 ? 0 : d < 4.6 ? (d - 3.6) : 1;
      // 1 m panel seam
      if (x < 2 || y < 2) gh[y * GS + x] = 0.3;
    }
  const grating = own(
    ct(GS, GS, (g) => {
      const img = g.createImageData(GS, GS);
      for (let i = 0; i < GS * GS; i++) {
        const v = gh[i] <= 0.01 ? 0.07 : 0.62 + gh[i] * 0.2;
        img.data[i * 4] = Math.round(v * 255);
        img.data[i * 4 + 1] = Math.round(v * 0.985 * 255);
        img.data[i * 4 + 2] = Math.round(v * 0.96 * 255);
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }),
  );
  const gratingN = own(normalMapFromHeight(ct, gh, GS, GS, 2.2));

  const blur = own(
    ct(
      256,
      256,
      (g, w, h) => {
        const cx = w / 2,
          cy = h / 2;
        g.clearRect(0, 0, w, h);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const grd = g.createConicGradient(a, cx, cy);
          grd.addColorStop(0, 'rgba(255,255,255,0.0)');
          grd.addColorStop(0.06, 'rgba(255,255,255,0.55)');
          grd.addColorStop(0.16, 'rgba(255,255,255,0.0)');
          grd.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = grd;
          g.beginPath();
          g.arc(cx, cy, w * 0.49, 0, Math.PI * 2);
          g.arc(cx, cy, w * 0.1, 0, Math.PI * 2, true);
          g.fill();
        }
        const base = g.createRadialGradient(cx, cy, w * 0.1, cx, cy, w * 0.49);
        base.addColorStop(0, 'rgba(255,255,255,0.18)');
        base.addColorStop(0.9, 'rgba(255,255,255,0.12)');
        base.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = base;
        g.beginPath();
        g.arc(cx, cy, w * 0.49, 0, Math.PI * 2);
        g.arc(cx, cy, w * 0.1, 0, Math.PI * 2, true);
        g.fill();
      },
      { anisotropy: 4 },
    ),
  );
  blur.wrapS = blur.wrapT = THREE.ClampToEdgeWrapping;

  const soft = own(
    ct(128, 128, (g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.4, 'rgba(255,255,255,0.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    }),
  );
  soft.wrapS = soft.wrapT = THREE.ClampToEdgeWrapping;

  // the plaza's relief at full size (1024² was tried: diagonal seams stair-stepped, a visible loss)
  const plazaN = own(reliefFromCanvas(ct, plaza.image as HTMLCanvasElement, 0.7, 2.4));
  plazaN.wrapS = plazaN.wrapT = THREE.ClampToEdgeWrapping;

  return { plaza, plazaN, grating, gratingN, blur, soft };
}
