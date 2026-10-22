import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';

/**
 * Tower material kit (ART-V2 §2.2–2.6, "Flugmaschine"): ceramic hull with panel seams,
 * brushed aluminium, carbon, dark glass, clear glass, light lines in tiers (T0 by day →
 * T1 at dusk) and the brand-exact logo colours. One kit per island build; every getter
 * returns the same instance (one program each).
 *
 * Light tiers vs. the bloom mask smoothstep(1.0, 1.25, L) (ART-V2 §2.4):
 *   T0 (no bloom, L 0.45–0.6): teal ×1.0, orange ×1.6, warm ×0.6
 *   T1 (glow, L ≈ 1.45):       teal ×2.8, orange ×4.7, warm ×1.75
 *   T2 (beacon, small points): teal ×6,   orange ×10,  warm ×3.7
 *   Day → dusk: k = mix(T0, T1, smoothstep(0.25, 0.6, dusk)).
 *
 * Brand-exact (ART-V2 §2.6): the composer path grades everything (ACES + EmAI grade), so
 * the logo colours are pre-compensated in linear space and divided by the exposure; the
 * low path (no composer) renders raw #FF6700 / #141414 with toneMapped: false.
 */
export const TEAL = 0x2dd4bf;
export const WARM = 0xffe9cc;
export const ORANGE = 0xff6700;

export type Tier = 0 | 1 | 2;
const TIER_K: Record<'teal' | 'orange' | 'warm', [number, number, number]> = {
  teal: [1.0, 2.8, 6.0],
  orange: [1.6, 4.7, 10],
  warm: [0.6, 1.75, 3.7],
};

/** linear brand-exact colours for the composer path at exposure 1 (proto/grade.mjs) */
const EXACT_ORANGE = new THREE.Color().setRGB(0.908, 0.105, 0.0);
const EXACT_DISC = new THREE.Color().setRGB(0.0263, 0.0239, 0.0202);
/** dusk exposure of the island's evening look (dusk.ts) */
const DUSK_EXPOSURE = 1.32;

interface LightEntry {
  mat: THREE.MeshBasicMaterial;
  base: THREE.Color;
  day: number;
  dusk: number;
}

export interface TowerKit {
  /** ceramic hull with 2.4 × 1.2 m panel seams (metre UVs: 1 UV unit = 4.8 m) */
  readonly hullPanel: THREE.MeshPhysicalMaterial;
  /** ceramic hull without panels (members, hub, small parts) */
  readonly hull: THREE.MeshPhysicalMaterial;
  readonly hullWarm: THREE.MeshPhysicalMaterial;
  readonly alu: THREE.MeshStandardMaterial;
  readonly carbon: THREE.MeshPhysicalMaterial;
  readonly darkGlass: THREE.MeshPhysicalMaterial;
  readonly glassClear: THREE.MeshPhysicalMaterial;
  readonly shell: THREE.MeshPhysicalMaterial;
  readonly orangePaint: THREE.MeshStandardMaterial;
  /** walkable composite (roughness ≥ 0.78), 3 × 1.5 m panels, metre UVs (1 UV unit = 12 m) */
  readonly deck: THREE.MeshStandardMaterial;
  /** light line in a colour family; day tier → dusk tier (default T0 → T1) */
  light(family: 'teal' | 'orange' | 'warm', dayTier?: Tier, duskTier?: Tier): THREE.MeshBasicMaterial;
  /** vertex-coloured light lines (colours baked at T0); ×1 by day → ×2.8 at dusk */
  readonly lightVC: THREE.MeshBasicMaterial;
  /** brand-exact unlit materials (fog off, never bloomed) */
  readonly brandOrange: THREE.MeshBasicMaterial;
  readonly brandDisc: THREE.MeshBasicMaterial;
  /** register any further material whose colour must follow the brand-exact orange (e.g. a shader-patched clone) */
  trackBrand(mat: THREE.MeshBasicMaterial, which: 'orange' | 'disc'): void;
  /** 0 = day … 1 = dusk (eased, from the exposure) */
  readonly dusk: number;
  /** k = smoothstep(0.25, 0.6, dusk): the T0 → T1 blend */
  readonly duskK: number;
  readonly lowPath: boolean;
  update(): void;
}

export function createTowerKit(ctx: ZoneContext): TowerKit {
  const owned: THREE.Material[] = [];
  const own = <T extends THREE.Material>(m: T, name: string): T => {
    m.name = `tower:${name}`;
    owned.push(m);
    return m;
  };
  const panel = panelTextures(ctx);

  const hullPanel = own(
    new THREE.MeshPhysicalMaterial({ color: 0xd6d3d1, map: panel.albedo, normalMap: panel.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.5, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.8 }),
    'hullPanel',
  );
  // one-sided shells (drum roof, halo, lens band) must cast shadows from either side: the low sun
  // otherwise leaks through the drum roof onto the foyer walls
  hullPanel.shadowSide = THREE.DoubleSide;
  const hull = own(new THREE.MeshPhysicalMaterial({ color: 0xd6d3d1, roughness: 0.5, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.8 }), 'hull');
  const hullWarm = own(new THREE.MeshPhysicalMaterial({ color: 0xcfc9c2, roughness: 0.55, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.8 }), 'hullWarm');
  const alu = own(new THREE.MeshStandardMaterial({ color: 0xc9c4bf, roughness: 0.3, metalness: 0.95 }), 'alu');
  const carbon = own(new THREE.MeshPhysicalMaterial({ color: 0x1c1917, roughness: 0.38, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.2 }), 'carbon');
  carbon.shadowSide = THREE.DoubleSide;
  const darkGlass = own(new THREE.MeshPhysicalMaterial({ color: 0x1c1917, roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2 }), 'darkGlass');
  const glassClear = own(
    new THREE.MeshPhysicalMaterial({ color: 0xd6d3d1, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.12, depthWrite: false, envMapIntensity: 0.8, side: THREE.DoubleSide }),
    'glassClear',
  );
  const shell = own(new THREE.MeshPhysicalMaterial({ color: 0xe7e5e4, roughness: 0.42, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.32 }), 'shell');
  const orangePaint = own(new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.5, metalness: 0.2 }), 'orangePaint');
  const deck = own(new THREE.MeshStandardMaterial({ color: 0xc3beb8, map: panel.deck, normalMap: panel.deckN, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.82, metalness: 0.05 }), 'deck');

  const lights = new Map<string, LightEntry>();
  let duskK = 0;
  const light = (family: 'teal' | 'orange' | 'warm', dayTier: Tier = 0, duskTier: Tier = 1): THREE.MeshBasicMaterial => {
    const key = `${family}:${dayTier}:${duskTier}`;
    let e = lights.get(key);
    if (!e) {
      const base = new THREE.Color(family === 'teal' ? TEAL : family === 'orange' ? ORANGE : WARM);
      const k = THREE.MathUtils.lerp(TIER_K[family][dayTier], TIER_K[family][duskTier], duskK);
      const mat = own(new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(k) }), `light:${key}`);
      e = { mat, base, day: TIER_K[family][dayTier], dusk: TIER_K[family][duskTier] };
      lights.set(key, e);
    }
    return e.mat;
  };

  const lightVC = own(new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true }), 'lightVC');
  lights.set('vc', { mat: lightVC, base: new THREE.Color(1, 1, 1), day: 1, dusk: 2.8 });

  const brandOrange = own(new THREE.MeshBasicMaterial({ color: ORANGE, fog: false, toneMapped: false }), 'brandOrange');
  const brandDisc = own(new THREE.MeshBasicMaterial({ color: 0x141414, fog: false, toneMapped: false }), 'brandDisc');
  const brandList: { mat: THREE.MeshBasicMaterial; which: 'orange' | 'disc' }[] = [
    { mat: brandOrange, which: 'orange' },
    { mat: brandDisc, which: 'disc' },
  ];

  const dayExposure = ctx.env.params.exposure || 1;
  let dusk = -1;
  let exposure = -1;
  let low: boolean | null = null;

  const applyBrand = (): void => {
    for (const { mat, which } of brandList) {
      if (low) mat.color.setHex(which === 'orange' ? ORANGE : 0x141414);
      else mat.color.copy(which === 'orange' ? EXACT_ORANGE : EXACT_DISC).multiplyScalar(1 / Math.max(0.05, exposure));
    }
  };

  const kit: TowerKit = {
    hullPanel,
    hull,
    hullWarm,
    alu,
    carbon,
    darkGlass,
    glassClear,
    shell,
    orangePaint,
    deck,
    light,
    lightVC,
    brandOrange,
    brandDisc,
    trackBrand(mat, which) {
      brandList.push({ mat, which });
      applyBrand();
    },
    get dusk() {
      return Math.max(0, dusk);
    },
    get duskK() {
      return duskK;
    },
    get lowPath() {
      return !!low;
    },
    update() {
      const ex = ctx.env.params.exposure || 1;
      // C10: every preset (low too) renders through the composer grade, so the brand-exact path applies everywhere
      const isLow = false;
      if (ex !== exposure || isLow !== low) {
        exposure = ex;
        low = isLow;
        applyBrand();
      }
      const d = THREE.MathUtils.clamp((ex - dayExposure) / Math.max(1e-3, DUSK_EXPOSURE - dayExposure), 0, 1);
      if (d !== dusk) {
        dusk = d;
        duskK = THREE.MathUtils.smoothstep(d, 0.25, 0.6);
        for (const e of lights.values()) e.mat.color.copy(e.base).multiplyScalar(THREE.MathUtils.lerp(e.day, e.dusk, duskK));
      }
    },
  };
  kit.update();
  ctx.onDispose(() => {
    for (const m of owned) m.dispose();
    for (const t of panel.all) t.dispose();
  });
  return kit;
}

// ── procedural panel textures ────────────────────────────────────────────────

function normalFromHeight(h: Float32Array, w: number, hh: number, strength: number): THREE.DataTexture {
  const data = new Uint8Array(w * hh * 4);
  for (let y = 0; y < hh; y++)
    for (let x = 0; x < w; x++) {
      const at = (xx: number, yy: number): number => h[((yy + hh) % hh) * w + ((xx + w) % w)];
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      data[i] = Math.round((-dx / len) * 127.5 + 127.5);
      // DataTexture rows run with v (flipY false): tangent-space normal = (−dh/du, −dh/dv, 1)
      data[i + 1] = Math.round((-dy / len) * 127.5 + 127.5);
      data[i + 2] = Math.round((1 / len) * 127.5 + 127.5);
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, w, hh, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Deterministic PRNG. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hull panels: one 256² tile = 4.8 × 4.8 m = 2 × 4 panels of 2.4 × 1.2 m, 2 px seams
 * (≈ 3.7 cm groove with a soft bevel), ±3 % albedo per panel. Deck: 256² = 12 × 12 m,
 * 3 × 1.5 m panels, every 2nd row offset by 1.5 m.
 */
function panelTextures(ctx: ZoneContext): { albedo: THREE.Texture; normal: THREE.Texture; deck: THREE.Texture; deckN: THREE.Texture; all: THREE.Texture[] } {
  const S = 256;
  const r = prng(17);
  // hull height + albedo
  const hgt = new Float32Array(S * S).fill(1);
  const tone = new Float32Array(8);
  for (let i = 0; i < 8; i++) tone[i] = (r() - 0.5) * 0.06;
  const seam = (d: number): number => (d < 1 ? 0 : d < 2.2 ? (d - 1) / 1.2 : 1);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const px = (x % (S / 2)) + 0.5,
        py = (y % (S / 4)) + 0.5;
      const dx = Math.min(px, S / 2 - px),
        dy = Math.min(py, S / 4 - py);
      hgt[y * S + x] = Math.min(seam(dx), seam(dy)) + (r() - 0.5) * 0.01;
    }
  const albedo = ctx.materials.canvasTexture(S, S, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      const cx = i % 2,
        cy = Math.floor(i / 2);
      const v = Math.round(255 * (1 + tone[i]));
      g.fillStyle = `rgb(${Math.min(255, v)},${Math.min(255, v)},${Math.min(255, v)})`;
      g.fillRect((cx * w) / 2, (cy * h) / 4, w / 2, h / 4);
    }
    g.fillStyle = 'rgba(60,54,48,0.18)';
    for (let i = 0; i <= 2; i++) g.fillRect((i * w) / 2 - 1, 0, 2, h);
    for (let i = 0; i <= 4; i++) g.fillRect(0, (i * h) / 4 - 1, w, 2);
  });
  albedo.flipY = false;
  albedo.needsUpdate = true;
  const normal = normalFromHeight(hgt, S, S, 2.2);

  // deck (3 × 1.5 m staggered panels; 256 px = 12 m → 64 × 32 px panels)
  const dh = new Float32Array(S * S).fill(1);
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / 32);
    for (let x = 0; x < S; x++) {
      const xs = (x + (row % 2 ? 32 : 0)) % S;
      const px = (xs % 64) + 0.5,
        py = (y % 32) + 0.5;
      const d = Math.min(Math.min(px, 64 - px), Math.min(py, 32 - py));
      dh[y * S + x] = seam(d * 1.5);
    }
  }
  const deck = ctx.materials.canvasTexture(S, S, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    const rr = prng(5);
    for (let row = 0; row < 8; row++)
      for (let c = -1; c < 4; c++) {
        const v = Math.round(255 * (0.97 + rr() * 0.05));
        g.fillStyle = `rgb(${Math.min(255, v)},${Math.min(255, v)},${Math.min(255, v)})`;
        g.fillRect(c * 64 + (row % 2 ? 32 : 0), row * 32, 64, 32);
      }
    g.fillStyle = 'rgba(70,64,58,.45)';
    for (let row = 0; row < 8; row++) {
      g.fillRect(0, row * 32 - 1, w, 2);
      for (let c = -1; c <= 4; c++) g.fillRect(c * 64 + (row % 2 ? 32 : 0) - 1, row * 32, 2, 32);
    }
  });
  deck.flipY = false;
  deck.needsUpdate = true;
  const deckN = normalFromHeight(dh, S, S, 1.6);
  return { albedo, normal, deck, deckN, all: [albedo, normal, deck, deckN] };
}

// ── geometry helpers ─────────────────────────────────────────────────────────

/** Replace UVs with metre coordinates projected on the dominant axis plane, scaled by 1/tile. */
export function metreUVs(g: THREE.BufferGeometry, tile: number, mode: 'box' | 'cyl' = 'box'): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    let u: number, v: number;
    if (mode === 'cyl') {
      const a = Math.atan2(x, -z);
      const rr = Math.hypot(x, z);
      const ny = n ? Math.abs(n.getY(i)) : 0;
      if (ny > 0.8) {
        u = x;
        v = z;
      } else {
        u = a * rr;
        v = y;
      }
    } else {
      const nx = n ? Math.abs(n.getX(i)) : 0,
        ny = n ? Math.abs(n.getY(i)) : 0,
        nz = n ? Math.abs(n.getZ(i)) : 1;
      if (ny >= nx && ny >= nz) {
        u = x;
        v = z;
      } else if (nx >= nz) {
        u = z;
        v = y;
      } else {
        u = x;
        v = y;
      }
    }
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Strip every attribute except position / normal / uv (so geometries from different builders merge). */
export function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  return g;
}
