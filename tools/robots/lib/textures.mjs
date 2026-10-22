// Texture images (PNG, JPEG) for baking into vertex colours. Decoded with pure-JS decoders
// (pngjs MIT, jpeg-js BSD-3-Clause); no native code, nothing executed from the download.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { srgbToLinear } from './math.mjs';

const cache = new Map();

/** { width, height, lin: Float32Array (linear RGB, row 0 = top of the image) } */
export function readImage(file) {
  let img = cache.get(file);
  if (img) return img;
  const buf = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  let w, h, rgba;
  if (ext === '.png') {
    const png = PNG.sync.read(buf);
    [w, h, rgba] = [png.width, png.height, png.data];
  } else if (ext === '.jpg' || ext === '.jpeg') {
    const j = jpeg.decode(buf, { useTArray: true, maxResolutionInMP: 64, maxMemoryUsageInMB: 512 });
    [w, h, rgba] = [j.width, j.height, j.data];
  } else throw new Error(`unsupported texture: ${file}`);
  const lin = new Float32Array(w * h * 3);
  const lut = new Float32Array(256).map((_, i) => srgbToLinear(i / 255));
  for (let i = 0; i < w * h; i++) {
    // alpha over white paper: stickers with transparent margins read as their backing
    const a = rgba[i * 4 + 3] / 255;
    for (let k = 0; k < 3; k++) lin[i * 3 + k] = lut[rgba[i * 4 + k]] * a + (1 - a);
  }
  img = { width: w, height: h, lin, file };
  cache.set(file, img);
  return img;
}

/** Bilinear sample with repeat wrapping; v = 0 is the bottom of the image (OBJ / COLLADA / glTF-in-MuJoCo). */
export function sample(img, u, v, out, o = 0) {
  const { width: w, height: h, lin } = img;
  const x = (((u % 1) + 1) % 1) * w - 0.5;
  const y = (((1 - v) % 1) + 1) % 1 * h - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const px = (xx, yy) => (((yy % h) + h) % h) * w + (((xx % w) + w) % w);
  const a = px(x0, y0) * 3;
  const b = px(x0 + 1, y0) * 3;
  const c = px(x0, y0 + 1) * 3;
  const d = px(x0 + 1, y0 + 1) * 3;
  for (let k = 0; k < 3; k++) {
    out[o + k] = (lin[a + k] * (1 - fx) + lin[b + k] * fx) * (1 - fy) + (lin[c + k] * (1 - fx) + lin[d + k] * fx) * fy;
  }
}

/**
 * Per-corner colours of a textured triangle soup: each corner takes the mean of 7 samples taken on
 * the way from the corner to the triangle's centre (inside the triangle's own UV island, so atlas
 * seams don't bleed), multiplied by the material colour (linear).
 */
export function bakeCorners(img, uvs, tint) {
  const nTri = uvs.length / 6;
  const out = new Float32Array(nTri * 9);
  const s = [0, 0, 0];
  for (let t = 0; t < nTri; t++) {
    const cu = (uvs[t * 6] + uvs[t * 6 + 2] + uvs[t * 6 + 4]) / 3;
    const cv = (uvs[t * 6 + 1] + uvs[t * 6 + 3] + uvs[t * 6 + 5]) / 3;
    for (let c = 0; c < 3; c++) {
      const u0 = uvs[t * 6 + c * 2];
      const v0 = uvs[t * 6 + c * 2 + 1];
      let r = 0;
      let g = 0;
      let b = 0;
      const N = 7;
      for (let k = 0; k < N; k++) {
        const f = 0.08 + (0.5 * k) / (N - 1);
        sample(img, u0 + (cu - u0) * f, v0 + (cv - v0) * f, s);
        r += s[0];
        g += s[1];
        b += s[2];
      }
      out[t * 9 + c * 3] = (r / N) * tint[0];
      out[t * 9 + c * 3 + 1] = (g / N) * tint[1];
      out[t * 9 + c * 3 + 2] = (b / N) * tint[2];
    }
  }
  return out;
}
