/**
 * "Flugmaschine" look (docs/ART-V2.md §2) for this zone: the material recipes, the light tiers and
 * the geometry helpers. Zone-owned copies (zones import only from '@/core/zones' and their own
 * folder); the values follow ART-V2 §2.2–2.5 exactly, so they match the island's shared library.
 *
 *   hull 55 % · brushed alu 15 % · dark glass / carbon 25 % · teal light ≈ 3 % · orange ≤ 2 %
 *   light(color, tier): unlit MeshBasic. T0 line L ≈ 0.5 (no bloom) · T1 glow L ≈ 1.45 · T2 beacon L ≈ 3.1.
 *   Nothing sits in the forbidden band L 0.8–1.25. T0 lines go to T1 at dusk (`finale:dusk` { t }).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ZoneContext } from '@/core/zones';

export const TOK = {
  hull: 0xd6d3d1,
  hullWarm: 0xcfc9c2,
  deck: 0xc3beb8,
  deckPath: 0x8f8a84,
  alu: 0xc9c4bf,
  carbon: 0x1c1917,
  shell: 0xe7e5e4,
  teal: 0x2dd4bf,
  warm: 0xffe9cc,
  orange: 0xff6700,
  plant: 0x5f7046,
} as const;

export type LightColor = 'teal' | 'orange' | 'warm';
export type Tier = 0 | 1 | 2;
/** multipliers per tier (ART-V2 §2.4) */
export const TIER_K: Record<LightColor, [number, number, number]> = {
  teal: [1.0, 2.8, 6.0],
  orange: [1.6, 4.7, 10],
  warm: [0.6, 1.75, 3.7],
};

export interface Look {
  readonly hull: THREE.MeshPhysicalMaterial;
  readonly hullWarm: THREE.MeshPhysicalMaterial;
  readonly deck: THREE.MeshStandardMaterial;
  readonly deckPath: THREE.MeshStandardMaterial;
  readonly alu: THREE.MeshStandardMaterial;
  readonly carbon: THREE.MeshPhysicalMaterial;
  readonly darkGlass: THREE.MeshPhysicalMaterial;
  readonly shell: THREE.MeshStandardMaterial;
  readonly glassClear: THREE.MeshPhysicalMaterial;
  /** unlit light line; `dusk` (default true for T0): blends to T1 with the evening */
  light(color: LightColor, tier: Tier, o?: { dusk?: boolean; opacity?: number }): THREE.MeshBasicMaterial;
  /** a material this zone owns (disposed with the zone) */
  own<T extends THREE.Material | THREE.Texture>(x: T): T;
}

/** RoundedBox with the ART-V2 radius rule: clamp(0.04 × smallest dimension, 0.02, 0.25) (or `r`). */
export function rbox(w: number, h: number, d: number, r?: number): THREE.BufferGeometry {
  const rr = r ?? THREE.MathUtils.clamp(0.04 * Math.min(w, h, d), 0.02, 0.25);
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(rr, Math.min(w, h, d) / 2 - 1e-3));
}

/** Box-projected UVs in metres / `tile` (panel normal maps tile in world units on merged geometry). */
export function metreUv<T extends THREE.BufferGeometry>(g: T, tile = 4.8): T {
  const p = g.getAttribute('position');
  let n = g.getAttribute('normal');
  if (!n) {
    g.computeVertexNormals();
    n = g.getAttribute('normal');
  }
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i)),
      az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ay >= ax && ay >= az) (u = p.getX(i)), (v = p.getZ(i));
    else if (ax >= az) (u = p.getZ(i)), (v = p.getY(i));
    else (u = p.getX(i)), (v = p.getY(i));
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** height canvas → tangent-space normal map (DataTexture, repeat wrap) */
function normalFromHeight(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, strength = 2.2): THREE.DataTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  draw(g);
  const src = g.getImageData(0, 0, w, h).data;
  const H = (x: number, y: number): number => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out[i] = Math.round(((-dx / l) * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round(((dy / l) * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** 2 × 4 hull panels (2.4 × 1.2 m) per 4.8 m tile, 6 mm seams */
function drawPanels(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#000000';
  const sx = w / 2,
    sy = h / 4;
  for (let i = 0; i <= 2; i++) g.fillRect(Math.round(i * sx) - 1, 0, 2, h);
  for (let j = 0; j <= 4; j++) g.fillRect(0, Math.round(j * sy) - 1, w, 2);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i <= 2; i++) g.fillRect(Math.round(i * sx) - 2, 0, 4, h);
  for (let j = 0; j <= 4; j++) g.fillRect(0, Math.round(j * sy) - 2, w, 4);
}

/** deck composite: 3 × 1.5 m staggered panels per 6 m tile + one flush hatch */
function drawDeck(g: CanvasRenderingContext2D, w: number, h: number): void {
  const px = w / 6;
  g.fillStyle = '#000000';
  for (let row = 0; row < 4; row++) {
    const y = row * 1.5 * px;
    g.fillRect(0, Math.round(y) - 1, w, 2);
    const off = row % 2 ? 1.5 : 0;
    for (let x = off; x < 6 + 3; x += 3) g.fillRect(Math.round(x * px) % w - 1, Math.round(y), 2, Math.round(1.5 * px));
  }
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 1;
  g.strokeRect(Math.round(4.2 * px), Math.round(3.4 * px), Math.round(0.4 * px), Math.round(0.4 * px));
}

export function createLook(ctx: ZoneContext, prefix: string): Look {
  const owned: (THREE.Material | THREE.Texture)[] = [];
  const own = <T extends THREE.Material | THREE.Texture>(x: T): T => {
    owned.push(x);
    return x;
  };
  ctx.onDispose(() => {
    for (const x of owned.splice(0)) x.dispose();
  });
  const name = (m: THREE.Material, n: string): void => {
    m.name = `${prefix}:${n}`;
  };

  let panelN: THREE.DataTexture | null = null;
  const panels = (): THREE.DataTexture => (panelN ??= own(normalFromHeight(256, 256, (g) => drawPanels(g, 256, 256))));
  let deckN: THREE.DataTexture | null = null;
  const deckTex = (): THREE.DataTexture => (deckN ??= own(normalFromHeight(256, 256, (g) => drawDeck(g, 256, 256), 3)));

  const cache = new Map<string, THREE.Material>();
  const memo = <T extends THREE.Material>(k: string, make: () => T): T => {
    let m = cache.get(k) as T | undefined;
    if (!m) {
      m = own(make());
      name(m, k);
      cache.set(k, m);
    }
    return m;
  };

  // dusk: T0 lines blend to T1
  const duskLights: { mat: THREE.MeshBasicMaterial; base: THREE.Color; k0: number; k1: number }[] = [];
  let duskT = 0;
  const applyDusk = (): void => {
    const s = THREE.MathUtils.smoothstep(duskT, 0.25, 0.6);
    for (const d of duskLights) d.mat.color.copy(d.base).multiplyScalar(d.k0 + (d.k1 - d.k0) * s);
  };
  ctx.events.on('finale:dusk', (p: { t?: number } | undefined) => {
    duskT = THREE.MathUtils.clamp(p?.t ?? 0, 0, 1);
    applyDusk();
  });

  const look: Look = {
    get hull() {
      return memo('hull', () => {
        const m = new THREE.MeshPhysicalMaterial({ color: TOK.hull, roughness: 0.5, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.8, normalMap: panels() });
        m.normalScale.set(0.6, 0.6);
        return m;
      });
    },
    get hullWarm() {
      return memo('hullWarm', () => {
        const m = new THREE.MeshPhysicalMaterial({ color: TOK.hullWarm, roughness: 0.55, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.8, normalMap: panels() });
        m.normalScale.set(0.6, 0.6);
        return m;
      });
    },
    get deck() {
      return memo('deck', () => {
        const m = new THREE.MeshStandardMaterial({ color: TOK.deck, roughness: 0.82, metalness: 0.05, normalMap: deckTex() });
        m.normalScale.set(0.5, 0.5);
        return m;
      });
    },
    get deckPath() {
      return memo('deckPath', () => {
        const m = new THREE.MeshStandardMaterial({ color: TOK.deckPath, roughness: 0.78, metalness: 0.05, normalMap: deckTex() });
        m.normalScale.set(0.5, 0.5);
        return m;
      });
    },
    get alu() {
      return memo('alu', () => new THREE.MeshStandardMaterial({ color: TOK.alu, roughness: 0.3, metalness: 0.95 }));
    },
    get carbon() {
      return memo('carbon', () => new THREE.MeshPhysicalMaterial({ color: TOK.carbon, roughness: 0.38, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
    },
    get darkGlass() {
      return memo('darkGlass', () => new THREE.MeshPhysicalMaterial({ color: TOK.carbon, roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2 }));
    },
    get shell() {
      return memo('shell', () => new THREE.MeshStandardMaterial({ color: TOK.shell, roughness: 0.45, metalness: 0 }));
    },
    get glassClear() {
      return memo('glassClear', () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.12, envMapIntensity: 0.8, depthWrite: false }));
    },
    light(color, tier, o = {}) {
      const dusk = o.dusk ?? tier === 0;
      const op = o.opacity ?? 1;
      return memo(`light-${color}-${tier}-${dusk ? 'd' : 's'}-${op}`, () => {
        const base = new THREE.Color(TOK[color]);
        const k = TIER_K[color];
        const m = new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(k[tier]) });
        if (op < 1) {
          m.transparent = true;
          m.opacity = op;
          m.depthWrite = false;
        }
        if (dusk && tier === 0) {
          duskLights.push({ mat: m, base, k0: k[0], k1: k[1] });
          applyDusk();
        }
        return m;
      });
    },
    own,
  };
  return look;
}

/**
 * Station footprints (ART-V2 §6.0): a 4 cm teal ring inlay per station, T0 by day, T1 while the station
 * is active (the player within reach or operating it). One mesh per ring (≤ 3 per zone), material swap only.
 */
export function stationRings(
  ctx: ZoneContext,
  look: Look,
  rings: { at: [number, number, number]; r: number; active: () => boolean }[],
  parent?: THREE.Object3D,
): { update(): void; readonly meshes: THREE.Mesh[] } {
  const off = look.light('teal', 0);
  const on = look.light('teal', 1, { dusk: false });
  const geos: THREE.BufferGeometry[] = [];
  ctx.onDispose(() => geos.forEach((g) => g.dispose()));
  const meshes = rings.map((o) => {
    const g = new THREE.RingGeometry(o.r - 0.02, o.r + 0.02, 96).rotateX(-Math.PI / 2);
    geos.push(g);
    const m = new THREE.Mesh(g, off);
    m.position.set(o.at[0], o.at[1], o.at[2]);
    m.renderOrder = 1;
    (parent ?? ctx.groups.detail).add(m);
    return m;
  });
  return {
    meshes,
    update() {
      for (let i = 0; i < meshes.length; i++) {
        const want = rings[i].active() ? on : off;
        if (meshes[i].material !== want) meshes[i].material = want;
      }
    },
  };
}
