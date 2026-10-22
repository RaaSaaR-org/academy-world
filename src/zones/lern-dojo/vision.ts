/**
 * Lern-Dojo · SEHEN: the bench's top camera as a tiny software renderer, and the toy policy's
 * colour perception (R1 §11). No DOM: the picture is a Uint8 RGB buffer, so the station, the
 * Gehirn-Fenster (which paints it) and the Node check see the same pixels.
 *
 *   render(scene, light, bump)  the camera picture (64 × 48): bench, start fields, Kiste, cubes, the
 *                               gripper seen from above; the light scales and tints it, a bumped
 *                               camera sits `bump` metres off its mount
 *   ColourClasses               one class per cube colour: hue, saturation floor and a brightness range
 *                               fitted on the demos' frames (optionally on brightness-jittered copies,
 *                               „Helligkeit variieren“ = LeRobot's ColorJitter)
 *   detect(image)               per class the centroid of its pixels → a place on the bench, back-
 *                               projected with the camera's NOMINAL calibration (a bumped camera
 *                               therefore reports every cube 3 cm off)
 *
 * The honest twist: the dusk card and the bumped camera fail for the real reasons (appearance outside
 * the training frames, inputs not like in training), not by a script.
 */
import { COLOURS, CUBE, LAYOUT, VISION, type CubeColour } from './tuning';

export interface SceneView {
  cubes: { colour: CubeColour; present: boolean; x: number; y: number; z: number; yaw: number }[];
  /** the jaw centre and whether the gripper is low (it hides what is under it) */
  gripper: { x: number; y: number; z: number } | null;
}

export interface Light {
  brightness: number;
  tint: readonly [number, number, number];
}

export const DAYLIGHT: Light = { brightness: 1, tint: [1, 1, 1] };
export const DUSK: Light = { brightness: VISION.dusk.brightness, tint: VISION.dusk.tint };

export interface Detection {
  colour: CubeColour;
  x: number;
  z: number;
  /** pixels of the class */
  n: number;
}

const W = VISION.w,
  H = VISION.h;
const F = W / (VISION.spanM / VISION.height); // focal length in pixels
const TOP = CUBE.size; // the cube's top face height

function rgbOf(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}
const CUBE_RGB = Object.fromEntries(COLOURS.map((c) => [c, rgbOf(CUBE.colours[c])])) as Record<CubeColour, [number, number, number]>;
const BENCH_RGB: [number, number, number] = [0.8, 0.75, 0.65];
const FIELD_RGB: [number, number, number] = [0.6, 0.56, 0.49];
const BOX_RGB: [number, number, number] = [0.24, 0.24, 0.23];
const BOX_IN_RGB: [number, number, number] = [0.15, 0.15, 0.15];
const JAW_RGB: [number, number, number] = [0.1, 0.1, 0.1];
const BODY_RGB: [number, number, number] = [0.93, 0.93, 0.92];

/** A camera mount offset (m, bench x and z); the nominal mount is NO_BUMP. */
export interface Bump {
  x: number;
  z: number;
}
export const NO_BUMP: Bump = { x: 0, z: 0 };

/** image coordinates of a bench point seen by a camera at (cx + bump.x, height, cz + bump.z) */
function project(x: number, y: number, z: number, bump: Bump): [number, number] {
  const d = VISION.height - y;
  return [W / 2 + (F * (x - VISION.centre.x - bump.x)) / d, H / 2 + (F * (z - VISION.centre.z - bump.z)) / d];
}

/** a pixel back on the bench at height y, with the nominal calibration */
function unproject(u: number, v: number, y: number): [number, number] {
  const d = VISION.height - y;
  return [VISION.centre.x + ((u - W / 2) * d) / F, VISION.centre.z + ((v - H / 2) * d) / F];
}

/** seeded noise (mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The camera picture: W × H × 3 bytes. */
export function render(scene: SceneView, light: Light, bump: Bump, seed = 1, out: Uint8Array = new Uint8Array(W * H * 3)): Uint8Array {
  const img = new Float32Array(W * H * 3);
  const put = (u: number, v: number, c: readonly number[], shade = 1): void => {
    if (u < 0 || v < 0 || u >= W || v >= H) return;
    const o = (v * W + u) * 3;
    img[o] = c[0] * shade;
    img[o + 1] = c[1] * shade;
    img[o + 2] = c[2] * shade;
  };
  // bench top, the five start fields (outlines), the Kiste
  for (let v = 0; v < H; v++)
    for (let u = 0; u < W; u++) {
      const [x, z] = unprojectWith(u + 0.5, v + 0.5, 0, bump);
      let c = BENCH_RGB;
      for (const f of LAYOUT.fields) {
        const dx = Math.abs(x - f.x),
          dz = Math.abs(z - f.z),
          h = LAYOUT.fieldSize / 2;
        if (dx < h && dz < h && (dx > h - 0.004 || dz > h - 0.004)) c = FIELD_RGB;
      }
      const B = LAYOUT.box;
      const bx = Math.abs(x - B.x),
        bz = Math.abs(z - B.z);
      if (bx < B.w / 2 && bz < B.d / 2) c = bx > B.w / 2 - 0.008 || bz > B.d / 2 - 0.008 ? BOX_RGB : BOX_IN_RGB;
      put(u, v, c);
    }
  // cubes, far ones first (the camera looks down: lower first, then higher)
  const order = scene.cubes.map((c, i) => i).filter((i) => scene.cubes[i].present && scene.cubes[i].y > -0.05).sort((a, b) => scene.cubes[a].y - scene.cubes[b].y);
  for (const i of order) {
    const c = scene.cubes[i];
    const top = c.y + CUBE.size / 2;
    const [cu, cv] = project(c.x, top, c.z, bump);
    const half = (F * (CUBE.size / 2)) / (VISION.height - top);
    const cs = Math.cos(c.yaw),
      sn = Math.sin(c.yaw);
    const r = Math.ceil(half * 1.5);
    for (let v = Math.floor(cv - r); v <= Math.ceil(cv + r); v++)
      for (let u = Math.floor(cu - r); u <= Math.ceil(cu + r); u++) {
        const du = u + 0.5 - cu,
          dv = v + 0.5 - cv;
        const lx = cs * du + sn * dv,
          lz = -sn * du + cs * dv;
        if (Math.abs(lx) <= half && Math.abs(lz) <= half) put(u, v, CUBE_RGB[c.colour], 0.94 + 0.06 * (lz / half));
      }
  }
  // the gripper from above: the wrist motor (white), the fingers (black)
  if (scene.gripper) {
    const g = scene.gripper;
    const [gu, gv] = project(g.x, g.y + 0.1, g.z, bump);
    const rad = (F * 0.026) / Math.max(0.2, VISION.height - g.y - 0.1);
    for (let v = Math.floor(gv - rad); v <= Math.ceil(gv + rad); v++)
      for (let u = Math.floor(gu - rad); u <= Math.ceil(gu + rad); u++) {
        const d = Math.hypot(u + 0.5 - gu, v + 0.5 - gv);
        if (d <= rad) put(u, v, d < rad * 0.45 ? JAW_RGB : BODY_RGB);
      }
  }
  // light, sensor noise, quantise
  const R = rng(seed);
  const b = light.brightness;
  for (let k = 0; k < W * H; k++) {
    const n = (R() + R() - 1) * VISION.noise * 1.7;
    for (let ch = 0; ch < 3; ch++) {
      const val = img[k * 3 + ch] * b * light.tint[ch] + n;
      out[k * 3 + ch] = Math.max(0, Math.min(255, Math.round(val * 255)));
    }
  }
  return out;
}

/** a pixel centre back on the bench (render's own, bumped camera: the true place it shows) */
function unprojectWith(u: number, v: number, y: number, bump: Bump): [number, number] {
  const [x, z] = unproject(u, v, y);
  return [x + bump.x, z + bump.z];
}

export function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d > 1e-6) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, mx > 0 ? d / mx : 0, mx];
}

const hueDist = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export interface ClassParams {
  hue: number;
  satMin: number;
  valLo: number;
  valHi: number;
  /** frames this class was fitted on (0 = the pretrained default) */
  frames: number;
}

/**
 * The colour classes. Every class starts from the "pretrained" default (the colour under neutral
 * light, like a vision backbone's prior); fitting on the demos' frames refines it.
 */
export class ColourClasses {
  readonly params: Record<CubeColour, ClassParams>;
  jitter = false;

  constructor() {
    this.params = Object.fromEntries(COLOURS.map((c) => [c, ColourClasses.fromSamples(c, [sample(c, DAYLIGHT)], false, 0)])) as Record<CubeColour, ClassParams>;
  }

  /** a class from pixel samples (h, s, v), optionally on brightness-jittered copies */
  static fromSamples(colour: CubeColour, px: [number, number, number][], jitter: boolean, frames: number): ClassParams {
    const vs: number[] = [];
    let hx = 0,
      hy = 0,
      smin = 1;
    const factors = jitter ? [VISION.jitter[0], (VISION.jitter[0] + 1) / 2, 1, (VISION.jitter[1] + 1) / 2, VISION.jitter[1]] : [1];
    for (const [h, s, v] of px) {
      hx += Math.cos((h * Math.PI) / 180);
      hy += Math.sin((h * Math.PI) / 180);
      smin = Math.min(smin, s);
      for (const f of factors) vs.push(Math.min(1, v * f));
    }
    const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
    const sd = Math.sqrt(vs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vs.length);
    const lo = Math.min(...vs),
      hi = Math.max(...vs);
    const tol = Math.max(VISION.valK * (jitter ? 0 : sd), VISION.valFloor);
    return {
      hue: ((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360,
      satMin: Math.max(VISION.satMin, smin * 0.8),
      valLo: Math.max(0.05, (jitter ? lo : mean) - tol),
      valHi: Math.min(1.01, (jitter ? hi : mean) + tol),
      frames,
    };
  }

  /** Fit every class seen in the frames; the others keep their default. */
  fit(frames: { image: Uint8Array; scene: SceneView; bump: Bump }[], jitter: boolean): void {
    this.jitter = jitter;
    const px: Record<CubeColour, [number, number, number][]> = { rot: [], blau: [], gruen: [] };
    const n: Record<CubeColour, number> = { rot: 0, blau: 0, gruen: 0 };
    for (const f of frames)
      for (const c of f.scene.cubes) {
        if (!c.present) continue;
        // the pixels inside the cube's top face (inset), where the frame shows it
        const [cu, cv] = project(c.x, c.y + CUBE.size / 2, c.z, f.bump);
        const half = ((F * (CUBE.size / 2)) / (VISION.height - c.y - CUBE.size / 2)) * 0.6;
        let k = 0;
        for (let v = Math.floor(cv - half); v <= Math.ceil(cv + half); v++)
          for (let u = Math.floor(cu - half); u <= Math.ceil(cu + half); u++) {
            if (u < 0 || v < 0 || u >= W || v >= H || Math.abs(u + 0.5 - cu) > half || Math.abs(v + 0.5 - cv) > half) continue;
            const o = (v * W + u) * 3;
            px[c.colour].push(hsv(f.image[o] / 255, f.image[o + 1] / 255, f.image[o + 2] / 255));
            k++;
          }
        if (k) n[c.colour]++;
      }
    for (const c of COLOURS) {
      if (px[c].length) this.params[c] = ColourClasses.fromSamples(c, px[c], jitter, n[c]);
      else this.params[c] = ColourClasses.fromSamples(c, [sample(c, DAYLIGHT)], jitter, 0);
    }
  }

  classify(h: number, s: number, v: number): CubeColour | null {
    for (const c of COLOURS) {
      const p = this.params[c];
      if (s >= p.satMin && v >= p.valLo && v <= p.valHi && hueDist(h, p.hue) <= VISION.hueTol) return c;
    }
    return null;
  }

  /** Per class the centroid of its pixels → a place on the bench (nominal calibration). */
  detect(image: Uint8Array, mask?: Uint8Array): Detection[] {
    const acc: Record<CubeColour, [number, number, number]> = { rot: [0, 0, 0], blau: [0, 0, 0], gruen: [0, 0, 0] };
    for (let v = 0; v < H; v++)
      for (let u = 0; u < W; u++) {
        const o = (v * W + u) * 3;
        const [h, s, val] = hsv(image[o] / 255, image[o + 1] / 255, image[o + 2] / 255);
        const c = this.classify(h, s, val);
        if (mask) mask[v * W + u] = c ? COLOURS.indexOf(c) + 1 : 0;
        if (!c) continue;
        const a = acc[c];
        a[0] += u + 0.5;
        a[1] += v + 0.5;
        a[2]++;
      }
    const out: Detection[] = [];
    for (const c of COLOURS) {
      const a = acc[c];
      if (a[2] < VISION.minBlobPx) continue;
      const [x, z] = unproject(a[0] / a[2], a[1] / a[2], TOP);
      out.push({ colour: c, x, z, n: a[2] });
    }
    return out;
  }
}

/** one noiseless sample of a cube colour under a light (the default class) */
function sample(c: CubeColour, light: Light): [number, number, number] {
  const r = CUBE_RGB[c];
  return hsv(r[0] * light.brightness * light.tint[0], r[1] * light.brightness * light.tint[1], r[2] * light.brightness * light.tint[2]);
}

export const IMAGE = { w: W, h: H } as const;
/** where a bench point lands in the picture (for the SEHEN overlay) */
export const toPixel = (x: number, y: number, z: number, bump: Bump = NO_BUMP): [number, number] => project(x, y, z, bump);
