import * as THREE from 'three';
import { css, palette } from './palette';
import { canvasTexture, drawConcreteGrid, drawCrate, drawFloorPlate, drawHazard, drawPv, makeDeckPanel, makePanelNormal } from './textures';

/**
 * Light tiers (ART-V2 §2.4) against the bloom mask smoothstep(1.0, 1.25, L) of RenderSystem:
 *  - 'T0' line, no bloom (L ≈ 0.5)   - 'T1' glow (L ≈ 1.45)   - 'T2' beacon, small points only (L ≈ 3.1)
 *  - 'line'   = T0 by day → T1 at dusk (the default for light lines)
 *  - 'beacon' = T1 by day → T2 at dusk
 * Nothing sits in the forbidden band L 0.8…1.25 (it flickers in and out of bloom).
 */
export type LightTier = 'T0' | 'T1' | 'T2' | 'line' | 'beacon';
const TIER_L = { T0: 0.5, T1: 1.45, T2: 3.1 } as const;
const tierRange = (t: LightTier): [number, number] =>
  t === 'line' ? [TIER_L.T0, TIER_L.T1] : t === 'beacon' ? [TIER_L.T1, TIER_L.T2] : [TIER_L[t], TIER_L[t]];
const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** Day → dusk light lift: k = mix(day, dusk, smoothstep(0.25, 0.6, t)). */
export const duskLift = (t: number): number => THREE.MathUtils.smoothstep(t, 0.25, 0.6);

/**
 * Shared, cached brand materials. Every getter returns the SAME instance each time
 * (one shader program, minimal state changes).
 *
 *   NEVER mutate a shared material (color, map, opacity …) — `clone()` it first,
 *   or use `standard({...})`, which caches by parameters.
 */
export class MaterialLibrary {
  readonly palette = palette;
  readonly css = css;
  private cache = new Map<string, THREE.Material>();
  private textures = new Map<string, THREE.Texture>();

  constructor(private maxAnisotropy = 8) {}

  private memo<T extends THREE.Material>(key: string, make: () => T): T {
    let m = this.cache.get(key) as T | undefined;
    if (!m) {
      m = make();
      m.name = `brand:${key}`;
      this.cache.set(key, m);
    }
    return m;
  }

  private tex(key: string, make: () => THREE.Texture): THREE.Texture {
    let t = this.textures.get(key);
    if (!t) {
      t = make();
      this.textures.set(key, t);
    }
    return t;
  }

  // ── Structural ────────────────────────────────────────────────────────────

  /**
   * Dark structural metal (stone-700…800). Beams, frames, machine bodies. QA-09: lifted albedo and
   * less metalness, so faces away from the low sun read as dark grey with sky light, not as black.
   */
  get metalDark(): THREE.MeshStandardMaterial {
    return this.memo('metalDark', () => new THREE.MeshStandardMaterial({ color: 0x3f3a36, metalness: 0.4, roughness: 0.46 }));
  }
  /** Mid metal (stone-500). */
  get metal(): THREE.MeshStandardMaterial {
    return this.memo('metal', () => new THREE.MeshStandardMaterial({ color: 0x78716c, metalness: 0.8, roughness: 0.36 }));
  }
  /** Bright brushed steel (stone-300). Rails, pistons, shafts. */
  get steel(): THREE.MeshStandardMaterial {
    return this.memo('steel', () => new THREE.MeshStandardMaterial({ color: 0xc9c4bf, metalness: 0.92, roughness: 0.28 }));
  }
  /** Plain concrete (stone-300…400). */
  get concrete(): THREE.MeshStandardMaterial {
    return this.memo('concrete', () => new THREE.MeshStandardMaterial({ color: 0xb3aea8, metalness: 0, roughness: 0.92 }));
  }
  /**
   * Concrete with a 1 m measuring grid. Texture repeats once per UV unit: scale the
   * geometry UVs to metres, or use `concreteGridSized(w, d)` for a plane of w×d metres.
   */
  get concreteGrid(): THREE.MeshStandardMaterial {
    return this.memo('concreteGrid', () => new THREE.MeshStandardMaterial({ map: this.gridTex(), roughness: 0.9, metalness: 0 }));
  }
  /** Concrete grid material whose texture repeat matches a w×d metre plane/box top. */
  concreteGridSized(w: number, d: number): THREE.MeshStandardMaterial {
    const kw = Math.max(1, Math.round(w)),
      kd = Math.max(1, Math.round(d));
    return this.memo(`concreteGrid:${kw}x${kd}`, () => {
      const t = this.gridTex().clone();
      t.repeat.set(kw, kd);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, metalness: 0 });
    });
  }
  private gridTex(): THREE.Texture {
    return this.tex('grid', () => canvasTexture(512, 512, drawConcreteGrid, { anisotropy: this.maxAnisotropy }));
  }
  /** Dark riveted metal floor plates, 1 m tiles. */
  floorPlate(w = 1, d = 1): THREE.MeshStandardMaterial {
    const kw = Math.max(1, Math.round(w)),
      kd = Math.max(1, Math.round(d));
    return this.memo(`floorPlate:${kw}x${kd}`, () => {
      const base = this.tex('floorPlate', () => canvasTexture(256, 256, drawFloorPlate, { anisotropy: this.maxAnisotropy }));
      const t = base.clone();
      t.repeat.set(kw, kd);
      t.needsUpdate = true;
      // roughness 0.7 / metalness 0.45: the low golden-hour sun (elev. 16°) blew out a large bloom
      // hotspot on big plate floors at 0.55 / 0.55
      return new THREE.MeshStandardMaterial({ map: t, metalness: 0.45, roughness: 0.7 });
    });
  }
  /** UI-card dark panel (#1F1F1F → lifted to #262422 for QA-09). Walls of displays, kiosks, sign backs. */
  get panel(): THREE.MeshStandardMaterial {
    return this.memo('panel', () => new THREE.MeshStandardMaterial({ color: 0x262422, metalness: 0.12, roughness: 0.62 }));
  }
  /** Elevated panel (#292929 → #302d2b). */
  get panelElevated(): THREE.MeshStandardMaterial {
    return this.memo('panelElevated', () => new THREE.MeshStandardMaterial({ color: 0x302d2b, metalness: 0.15, roughness: 0.62 }));
  }
  /** Robot / instrument shell, stone-200 (same as the EMI robot's shell colour). */
  get shell(): THREE.MeshStandardMaterial {
    return this.memo('shell', () => new THREE.MeshStandardMaterial({ color: 0xe7e5e4, metalness: 0.1, roughness: 0.42 }));
  }
  get rubber(): THREE.MeshStandardMaterial {
    return this.memo('rubber', () => new THREE.MeshStandardMaterial({ color: 0x1c1917, metalness: 0, roughness: 0.95 }));
  }
  /** Cheap glass (no transmission pass): transparent, reflective via env map. */
  get glass(): THREE.MeshStandardMaterial {
    return this.memo(
      'glass',
      () =>
        new THREE.MeshStandardMaterial({
          color: 0xd6d3d1,
          metalness: 0.1,
          roughness: 0.06,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
          envMapIntensity: 1.4,
        }),
    );
  }
  /** Dark composite crate with frame — for grabbable boxes. */
  get crate(): THREE.MeshStandardMaterial {
    return this.memo('crate', () => {
      const t = this.tex('crate', () => canvasTexture(256, 256, drawCrate, { anisotropy: this.maxAnisotropy }));
      return new THREE.MeshStandardMaterial({ map: t, metalness: 0.2, roughness: 0.7 });
    });
  }

  // ── Accents (use sparingly) ───────────────────────────────────────────────

  /**
   * Glowing orange, tier T1 (L ≈ 1.46, blooms; ART-V2 §2.4). Black base colour, so the glow no longer
   * depends on lighting (it used to sit in the forbidden band and flicker in and out of bloom).
   */
  get accentOrange(): THREE.MeshStandardMaterial {
    return this.memo('accentOrange', () => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: palette.orange, emissiveIntensity: 4.7, roughness: 0.4 }));
  }
  /** Glowing teal, tier T1 (L ≈ 1.44, blooms). Black base colour (see accentOrange). */
  get accentTeal(): THREE.MeshStandardMaterial {
    return this.memo('accentTeal', () => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: palette.teal, emissiveIntensity: 2.8, roughness: 0.4 }));
  }
  /** Matte orange paint (no glow) — small parts like robot joint rings, handles. */
  get orangePaint(): THREE.MeshStandardMaterial {
    return this.memo('orangePaint', () => new THREE.MeshStandardMaterial({ color: palette.orange, metalness: 0.2, roughness: 0.5 }));
  }
  get tealPaint(): THREE.MeshStandardMaterial {
    return this.memo('tealPaint', () => new THREE.MeshStandardMaterial({ color: palette.teal, metalness: 0.2, roughness: 0.5 }));
  }
  /** Unlit dark screen background for in-world displays. */
  get screen(): THREE.MeshBasicMaterial {
    return this.memo('screen', () => new THREE.MeshBasicMaterial({ color: 0x0f0e0d }));
  }
  /** Logo spiral: exact brand orange, unlit, NO bloom/glow (logo rules). */
  get logoOrange(): THREE.MeshBasicMaterial {
    return this.memo('logoOrange', () => new THREE.MeshBasicMaterial({ color: palette.orange }));
  }
  /** Logo disc: exactly #141414. */
  get logoDisc(): THREE.MeshBasicMaterial {
    return this.memo('logoDisc', () => new THREE.MeshBasicMaterial({ color: palette.base }));
  }
  /** Hazard tape. `repeat` = number of square stripe tiles along U (≈ length / height). */
  hazard(repeat = 4): THREE.MeshStandardMaterial {
    const r = Math.max(0.5, Math.round(repeat * 2) / 2);
    return this.memo(`hazard:${r}`, () => {
      const base = this.tex('hazard', () => canvasTexture(128, 128, drawHazard, { anisotropy: this.maxAnisotropy }));
      const t = base.clone();
      t.repeat.set(r, 1);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.05 });
    });
  }

  // ── GDD §9.3 names (docs/GDD.md) ──────────────────────────────────────────

  /** Deck concrete, stone-400, roughness 0.9, 1 m seam grid (UV-scaled: use deckConcreteSized for exact tiling). */
  get deckConcrete(): THREE.MeshStandardMaterial {
    return this.memo('deckConcrete', () => new THREE.MeshStandardMaterial({ color: 0xc4bfba, map: this.gridTex(), roughness: 0.9, metalness: 0 }));
  }
  /** Plaza stone, stone-300, roughness 0.85. */
  get plazaStone(): THREE.MeshStandardMaterial {
    return this.memo('plazaStone', () => new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.85, metalness: 0 }));
  }
  /** Dark brushed metal, stone-700 (QA-09: was stone-800 at metalness 0.7 and read black off the sun). */
  get darkMetal(): THREE.MeshStandardMaterial {
    return this.memo('darkMetal', () => new THREE.MeshStandardMaterial({ color: palette.stone[700], metalness: 0.4, roughness: 0.5 }));
  }
  /** Dark structure, between stone-700 and 800 (QA-09: was stone-900 at metalness 0.6). */
  get structure(): THREE.MeshStandardMaterial {
    return this.memo('structure', () => new THREE.MeshStandardMaterial({ color: 0x3a3532, metalness: 0.35, roughness: 0.55 }));
  }
  /** Railings / trims: mid brushed aluminium (ART-V2: no black bike-rack rails; was #3D3D3D). */
  get railing(): THREE.MeshStandardMaterial {
    return this.memo('railing', () => new THREE.MeshStandardMaterial({ color: 0x9c968f, metalness: 0.75, roughness: 0.36 }));
  }
  /** Hazard tape (4 stripe tiles along U). */
  get hazardTape(): THREE.MeshStandardMaterial {
    return this.hazard(4);
  }
  /** Unlit glowing orange, tier T1 (×4.7, L ≈ 1.46 → blooms). */
  get emissiveOrange(): THREE.MeshBasicMaterial {
    return this.memo('emissiveOrange', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.orange).multiplyScalar(4.7) }));
  }
  /** Unlit glowing teal, tier T1 (×2.8, L ≈ 1.44 → blooms). */
  get emissiveTeal(): THREE.MeshBasicMaterial {
    return this.memo('emissiveTeal', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.teal).multiplyScalar(2.8) }));
  }
  /** = logoOrange (exact #FF6700, unlit, below the bloom threshold). */
  get logoSpiral(): THREE.MeshBasicMaterial {
    return this.logoOrange;
  }

  // ── ART-V2 "Flugmaschine" (docs/ART-V2.md §2.3): one material language for the whole island ──
  //    ceramic-composite ≈ 55 %, brushed aluminium ≈ 15 %, dark glass + carbon ≈ 25 %, teal light ≈ 3 %,
  //    orange ≤ 2 % by day. Every walkable surface has roughness ≥ 0.78 (low-sun bloom glare).

  /** `panelN` (2.4 × 1.2 m ceramic panels, 4.8 m tile; blue channel = per-panel tone). Linear. */
  get panelNormal(): THREE.Texture {
    return this.tex('panelN', () => makePanelNormal(this.maxAnisotropy));
  }
  /** `deckPanel` albedo (near white, × material colour) and `deckPanelN`: 12 m tile, 3 × 1.5 m panels. */
  get deckPanel(): { map: THREE.Texture; normal: THREE.Texture } {
    const map = this.tex('deckPanel', () => {
      const d = makeDeckPanel(this.maxAnisotropy);
      this.textures.set('deckPanelN', d.normal);
      return d.map;
    });
    return { map, normal: this.textures.get('deckPanelN')! };
  }
  /** `pvTex` (256 × 384 PV cells with busbars). */
  get pvTexture(): THREE.Texture {
    return this.tex('pv', () => canvasTexture(256, 384, drawPv, { anisotropy: this.maxAnisotropy }));
  }

  /**
   * Ceramic-composite hull, stone-300 #D6D3D1: the default for large lit surfaces (tower, drums,
   * pylons, consoles). Upper albedo limit for big sun-facing verticals (brighter blooms at 16° sun).
   * Panel seams come from a world-space triplanar `panelN` (no UVs needed, works on instances).
   * Clone-safe (subclass): `hull.clone()` keeps the panels.
   */
  get hull(): THREE.MeshPhysicalMaterial {
    return this.memo('hull', () => new HullMaterial(this.panelNormal, { color: 0xd6d3d1, roughness: 0.5, clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.8 }));
  }
  /** Second ceramic tone #CFC9C2 (panel alternation, the underside hull). */
  get hullWarm(): THREE.MeshPhysicalMaterial {
    return this.memo('hullWarm', () => new HullMaterial(this.panelNormal, { color: 0xcfc9c2, roughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.8 }));
  }
  /** Hull ceramic in any tone (cached by colour), same panels. */
  hullTone(color: THREE.ColorRepresentation, roughness = 0.5): THREE.MeshPhysicalMaterial {
    const c = new THREE.Color(color).getHexString();
    return this.memo(`hull:${c}:${roughness}`, () => new HullMaterial(this.panelNormal, { color, roughness, clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.8 }));
  }
  /**
   * Walkable deck composite #C3BEB8, roughness 0.82: 3 × 1.5 m staggered panels projected in world
   * XZ (any floor geometry, no UV setup). Side faces fade to the plain tone.
   */
  get deckComposite(): THREE.MeshStandardMaterial {
    return this.memo('deckComposite', () => this.deckTone(0xc3beb8, 0.82));
  }
  /** Runway tone #8F8A84 for paths (Allee, spokes, ring), roughness 0.78. */
  get deckPath(): THREE.MeshStandardMaterial {
    return this.memo('deckPath', () => this.deckTone(0x8f8a84, 0.78));
  }
  /** Deck composite in any tone (cached), world-XZ panels. Keep roughness ≥ 0.78 on walkable floors. */
  deckTone(color: THREE.ColorRepresentation, roughness = 0.82, o: { polygonOffset?: number } = {}): THREE.MeshStandardMaterial {
    const c = new THREE.Color(color).getHexString();
    return this.memo(`deck:${c}:${roughness}:${o.polygonOffset ?? 0}`, () => {
      const d = this.deckPanel;
      const m = new DeckMaterial(d.map, d.normal, { color, roughness, metalness: 0.05 });
      if (o.polygonOffset) {
        m.polygonOffset = true;
        m.polygonOffsetFactor = -o.polygonOffset;
        m.polygonOffsetUnits = -2 * o.polygonOffset;
      }
      return m;
    });
  }
  /** Brushed aluminium #C9C4BF: rails, posts, frames, collars, trims (replaces steel/railing in new work). */
  get brushedAlu(): THREE.MeshStandardMaterial {
    return this.memo('brushedAlu', () => new THREE.MeshStandardMaterial({ color: 0xc9c4bf, roughness: 0.3, metalness: 0.95 }));
  }
  /** Carbon #1C1917 with clearcoat: plinth reveals, light channels, cable trays, sensor masts. */
  get carbon(): THREE.MeshPhysicalMaterial {
    return this.memo('carbon', () => new THREE.MeshPhysicalMaterial({ color: 0x1c1917, roughness: 0.38, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
  }
  /** Dark glass (opaque, reads as glass through reflections): tower core, visor bands, doors, screen frames. */
  get darkGlass(): THREE.MeshPhysicalMaterial {
    return this.memo('darkGlass', () => new THREE.MeshPhysicalMaterial({ color: 0x1c1917, roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2 }));
  }
  /** Clear glass, opacity 0.12. ONLY where people look out (never long railings: Fresnel turns it white). */
  get glassClear(): THREE.MeshStandardMaterial {
    return this.memo(
      'glassClear',
      () => new THREE.MeshStandardMaterial({ color: 0xd6d3d1, metalness: 0.1, roughness: 0.06, transparent: true, opacity: 0.12, depthWrite: false, envMapIntensity: 0.8 }),
    );
  }
  /** Solar cells (pvTex, clearcoat). UV-mapped. */
  get pvCell(): THREE.MeshPhysicalMaterial {
    return this.memo('pvCell', () => new THREE.MeshPhysicalMaterial({ map: this.pvTexture, roughness: 0.25, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }));
  }

  /**
   * Light line material (ART-V2 §2.4): unlit MeshBasic, colour × k(tier) so its luminance hits the
   * tier exactly whatever the colour. 'line' (default) and 'beacon' follow the dusk automatically
   * (`setDusk`). Never use MeshStandard + emissive for light lines.
   */
  light(color: THREE.ColorRepresentation, tier: LightTier = 'line'): THREE.MeshBasicMaterial {
    const base = new THREE.Color(color);
    const key = `light:${base.getHexString()}:${tier}`;
    return this.memo(key, () => {
      const m = new THREE.MeshBasicMaterial({ color: base.clone(), fog: true });
      m.userData.noEnrich = true;
      const [a, b] = tierRange(tier);
      const L = Math.max(1e-4, lum(base));
      const entry = { mat: m, base, ka: a / L, kb: b / L };
      this.lights.push(entry);
      m.color.copy(base).multiplyScalar(THREE.MathUtils.lerp(entry.ka, entry.kb, duskLift(this.duskT)));
      return m;
    });
  }
  /** Multiplier that puts `color` at a tier's luminance (for instance colours and custom shaders). */
  tierScale(color: THREE.ColorRepresentation, tier: LightTier = 'line'): number {
    const [a, b] = tierRange(tier);
    return THREE.MathUtils.lerp(a, b, duskLift(this.duskT)) / Math.max(1e-4, lum(new THREE.Color(color)));
  }
  /** Day (0) → dusk (1): lifts every 'line' light from T0 to T1 and every 'beacon' from T1 to T2. Called by the island's dusk. */
  setDusk(t: number): void {
    this.duskT = THREE.MathUtils.clamp(t, 0, 1);
    const k = duskLift(this.duskT);
    for (const l of this.lights) l.mat.color.copy(l.base).multiplyScalar(THREE.MathUtils.lerp(l.ka, l.kb, k));
    for (const fn of this.duskListeners) fn(this.duskT);
  }
  /** Current dusk blend 0…1 (see setDusk). */
  get dusk(): number {
    return this.duskT;
  }
  /** Listen to dusk changes (t 0…1). Returns unsubscribe. */
  onDusk(fn: (t: number) => void): () => void {
    this.duskListeners.add(fn);
    return () => this.duskListeners.delete(fn);
  }
  private duskT = 0;
  private lights: { mat: THREE.MeshBasicMaterial; base: THREE.Color; ka: number; kb: number }[] = [];
  private duskListeners = new Set<(t: number) => void>();

  /**
   * Brand-exact logo materials (ART-V2 §2.6): on screen exactly #FF6700 ('orange') / #141414 ('disc')
   * through ACES + the EmAI grade, the dusk exposure and both render paths. Unlit, no fog, no bloom
   * (compensated orange L ≈ 0.27). `facing: true` darkens tube silhouettes to 0.75 (stroke centres exact).
   */
  brandExact(kind: 'orange' | 'disc', o: { facing?: boolean } = {}): THREE.MeshBasicMaterial {
    return this.memo(`brandExact:${kind}:${o.facing ? 'f' : ''}`, () => {
      const m = new THREE.MeshBasicMaterial({ color: kind === 'orange' ? palette.orange : palette.base, fog: false, toneMapped: false });
      m.userData.noEnrich = true;
      if (o.facing) {
        m.onBeforeCompile = (sh) => {
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vBxN;\nvarying vec3 vBxV;')
            .replace(
              '#include <project_vertex>',
              `#include <project_vertex>
vec3 bxN = objectNormal;
#ifdef USE_INSTANCING
  bxN = mat3(instanceMatrix) * bxN;
#endif
vBxN = normalize(normalMatrix * bxN);
vBxV = -mvPosition.xyz;`,
            )
            .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>');
          sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vBxN;\nvarying vec3 vBxV;')
            .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.75, 1.0, pow(abs(dot(normalize(vBxN), normalize(vBxV))), 0.7));');
        };
        m.customProgramCacheKey = () => 'emai-brand-facing';
      }
      BRAND.mats.push({ mat: m, kind });
      applyBrand(m, kind);
      return m;
    });
  }

  // ── Factories (cached by parameters) ──────────────────────────────────────

  /** Cached MeshStandardMaterial by parameters (colors as numbers or css strings). */
  standard(params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
    const key = 'std:' + stableKey(params);
    return this.memo(key, () => new THREE.MeshStandardMaterial(params));
  }
  /** Cached glowing material. intensity > ~1.2 blooms. */
  emissive(color: THREE.ColorRepresentation, intensity = 2): THREE.MeshStandardMaterial {
    const c = new THREE.Color(color).getHexString();
    return this.memo(`emissive:${c}:${intensity}`, () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 }));
  }
  /** Cached unlit material. */
  basic(color: THREE.ColorRepresentation, opts: { transparent?: boolean; opacity?: number } = {}): THREE.MeshBasicMaterial {
    const c = new THREE.Color(color).getHexString();
    return this.memo(`basic:${c}:${opts.opacity ?? 1}`, () => new THREE.MeshBasicMaterial({ color, transparent: !!opts.transparent || (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1 }));
  }
  /** Canvas texture helper (NOT cached — you own and should dispose it via ctx.onDispose). */
  canvasTexture = canvasTexture;

  // ── Instancing twins (C11a / PERF-02) ─────────────────────────────────────
  // A material drawn by both a plain Mesh and an InstancedMesh switches between its two programs
  // on every such draw, and each switch re-runs three's getParameters(). A cached twin for the
  // instanced users keeps one program per material. Twins follow their source (dusk lights,
  // brand-exact colours, zone tweaks of colour / opacity / maps) via syncInstancing().

  private instTwins = new Map<THREE.Material, Map<string, THREE.Material>>();
  private instPairs: { src: THREE.Material; dst: THREE.Material; seen: Float64Array }[] = [];

  /** The cached instancing twin of `mat` (`withColor`: for InstancedMeshes with per-instance colours). */
  forInstancing<T extends THREE.Material>(mat: T, withColor = false): T {
    const variant = withColor ? 'ic' : 'i';
    let byVariant = this.instTwins.get(mat);
    if (!byVariant) this.instTwins.set(mat, (byVariant = new Map()));
    let twin = byVariant.get(variant);
    if (!twin) {
      twin = mat.clone();
      twin.name = mat.name;
      // instance-level shader hooks are not part of Material.copy()
      if (Object.prototype.hasOwnProperty.call(mat, 'onBeforeCompile')) twin.onBeforeCompile = mat.onBeforeCompile;
      if (Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey')) twin.customProgramCacheKey = mat.customProgramCacheKey;
      twin.userData.instancingOf = mat.uuid;
      byVariant.set(variant, twin);
      const seen = new Float64Array(SYNC_N);
      syncValues(mat, seen);
      this.instPairs.push({ src: mat, dst: twin, seen });
    }
    return twin as T;
  }

  /**
   * After the island or a zone is built: every InstancedMesh whose material is also drawn by a plain
   * Mesh gets the material's instancing twin. Returns the number of meshes switched.
   */
  instancingPass(scene: THREE.Object3D): number {
    const plain = new Set<THREE.Material>();
    const inst: THREE.InstancedMesh[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.material) return;
      if ((m as THREE.InstancedMesh).isInstancedMesh) inst.push(m as THREE.InstancedMesh);
      else if (!(m as THREE.SkinnedMesh).isSkinnedMesh && !(m as unknown as { isBatchedMesh?: boolean }).isBatchedMesh) for (const x of Array.isArray(m.material) ? m.material : [m.material]) plain.add(x);
    });
    let n = 0;
    for (const im of inst) {
      const mat = im.material;
      if (Array.isArray(mat) || !plain.has(mat) || mat.userData.instancingOf) continue;
      try {
        im.material = this.forInstancing(mat, im.instanceColor !== null);
        n++;
      } catch (err) {
        console.warn(`[materials] no instancing twin for "${mat.name}"`, err);
      }
    }
    return n;
  }

  /** Per rendered frame: copy changed colours / opacity / maps from each source to its twin (cheap). */
  syncInstancing(): void {
    const v = _syncScratch;
    for (const p of this.instPairs) {
      syncValues(p.src, v);
      let changed = false;
      for (let i = 0; i < SYNC_N; i++)
        if (v[i] !== p.seen[i]) {
          changed = true;
          break;
        }
      if (!changed) continue;
      // program-relevant changes (blending, side, vertex colours, fog, alpha test, a map added/removed) need a recompile
      const defines = v[13] !== p.seen[13] || v[14] !== p.seen[14] || v[15] !== p.seen[15] || (v[9] < 0) !== (p.seen[9] < 0);
      p.seen.set(v);
      const keep = { name: p.dst.name, userData: p.dst.userData };
      try {
        p.dst.copy(p.src);
      } catch {
        continue;
      }
      p.dst.name = keep.name;
      p.dst.userData = keep.userData;
      if (defines) p.dst.needsUpdate = true;
    }
  }
}

/** Material values a zone or the dusk may change at runtime (instancing twins follow them). */
const SYNC_N = 16;
const _syncScratch = new Float64Array(SYNC_N);
function syncValues(m: THREE.Material, out: Float64Array): void {
  const x = m as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number; map?: THREE.Texture | null; envMapIntensity?: number; roughness?: number; metalness?: number };
  out[0] = x.color ? x.color.r : 0;
  out[1] = x.color ? x.color.g : 0;
  out[2] = x.color ? x.color.b : 0;
  out[3] = x.emissive ? x.emissive.r : 0;
  out[4] = x.emissive ? x.emissive.g : 0;
  out[5] = x.emissive ? x.emissive.b : 0;
  out[6] = x.emissiveIntensity ?? 0;
  out[7] = x.opacity;
  out[8] = x.visible ? 1 : 0;
  out[9] = x.map ? x.map.id : -1;
  out[10] = x.envMapIntensity ?? 0;
  out[11] = x.roughness ?? 0;
  out[12] = x.metalness ?? 0;
  out[13] = (x.transparent ? 1 : 0) + (x.depthWrite ? 2 : 0) + (x.depthTest ? 4 : 0) + x.blending * 8;
  out[14] = x.side + (x.vertexColors ? 4 : 0) + ((x as { fog?: boolean }).fog ? 8 : 0) + (x.forceSinglePass ? 16 : 0);
  out[15] = x.alphaTest;
}

function stableKey(o: object): string {
  const entries = Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => {
      if (v && typeof v === 'object' && 'isColor' in v) return `${k}=#${(v as THREE.Color).getHexString()}`;
      if (v && typeof v === 'object' && 'isTexture' in v) return `${k}=tex:${(v as THREE.Texture).uuid}`;
      return `${k}=${String(v)}`;
    });
  return entries.join(';');
}

// ── triplanar ceramic hull ───────────────────────────────────────────────────

const TRI_VERT_DECL = /* glsl */ `varying vec3 vTpW;\nvarying vec3 vTpN;`;
const TRI_VERT = /* glsl */ `
{
  vec4 tpP = vec4(transformed, 1.0);
  vec3 tpN = objectNormal;
  #ifdef USE_INSTANCING
    tpP = instanceMatrix * tpP;
    tpN = mat3(instanceMatrix) * tpN;
  #endif
  vTpW = (modelMatrix * tpP).xyz;
  vTpN = normalize(mat3(modelMatrix) * tpN);
}`;

/**
 * MeshPhysical ceramic with world-space triplanar panel seams (whiteout blend) and a ±3 % per-panel
 * tone. A subclass (not onBeforeCompile on an instance) so `clone()` keeps the effect.
 */
export class HullMaterial extends THREE.MeshPhysicalMaterial {
  readonly tpUniforms: { uPanelN: { value: THREE.Texture | null }; uTpScale: { value: number }; uTpStrength: { value: number } };
  constructor(panelN: THREE.Texture | null = null, params: THREE.MeshPhysicalMaterialParameters = {}) {
    super({ metalness: 0, ...params });
    this.tpUniforms = { uPanelN: { value: panelN }, uTpScale: { value: 1 / 4.8 }, uTpStrength: { value: 0.6 } };
    this.userData.noEnrich = true;
  }
  override onBeforeCompile(sh: THREE.WebGLProgramParametersWithUniforms): void {
    if (!this.tpUniforms.uPanelN.value) return;
    Object.assign(sh.uniforms, this.tpUniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${TRI_VERT_DECL}`).replace('#include <project_vertex>', `#include <project_vertex>\n${TRI_VERT}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${TRI_VERT_DECL}\nuniform sampler2D uPanelN; uniform float uTpScale; uniform float uTpStrength;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec3 tpN0 = normalize(vTpN);
vec3 tpBw = pow(abs(tpN0), vec3(4.0));
tpBw /= max(1e-4, tpBw.x + tpBw.y + tpBw.z);
vec4 tpX = texture2D(uPanelN, vTpW.zy * uTpScale);
vec4 tpY = texture2D(uPanelN, vTpW.xz * uTpScale);
vec4 tpZ = texture2D(uPanelN, vTpW.xy * uTpScale);
diffuseColor.rgb *= mix(0.97, 1.03, tpX.b * tpBw.x + tpY.b * tpBw.y + tpZ.b * tpBw.z);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  vec2 dX = (tpX.xy * 2.0 - 1.0) * uTpStrength;
  vec2 dY = (tpY.xy * 2.0 - 1.0) * uTpStrength;
  vec2 dZ = (tpZ.xy * 2.0 - 1.0) * uTpStrength;
  vec3 tX = vec3(dX + tpN0.zy, tpN0.x);
  vec3 tY = vec3(dY + tpN0.xz, tpN0.y);
  vec3 tZ = vec3(dZ + tpN0.xy, tpN0.z);
  vec3 tpW = normalize(tX.zyx * tpBw.x + tY.xzy * tpBw.y + tZ.xyz * tpBw.z);
  normal = normalize((viewMatrix * vec4(tpW, 0.0)).xyz) * faceDirection;
}`,
      );
  }
  override customProgramCacheKey(): string {
    return this.tpUniforms.uPanelN.value ? 'emai-hull-tri' : 'emai-hull-plain';
  }
  override copy(source: this): this {
    super.copy(source);
    if (source.tpUniforms && this.tpUniforms) {
      this.tpUniforms.uPanelN.value = source.tpUniforms.uPanelN.value;
      this.tpUniforms.uTpScale.value = source.tpUniforms.uTpScale.value;
      this.tpUniforms.uTpStrength.value = source.tpUniforms.uTpStrength.value;
    }
    return this;
  }
}

/** MeshStandard walkable composite: deck panels projected in world XZ (fades to plain tone on steep faces). */
export class DeckMaterial extends THREE.MeshStandardMaterial {
  readonly dkUniforms: { uDeckMap: { value: THREE.Texture | null }; uDeckN: { value: THREE.Texture | null }; uDeckScale: { value: number } };
  constructor(map: THREE.Texture | null = null, normal: THREE.Texture | null = null, params: THREE.MeshStandardMaterialParameters = {}) {
    super(params);
    this.dkUniforms = { uDeckMap: { value: map }, uDeckN: { value: normal }, uDeckScale: { value: 1 / 12 } };
    this.userData.noEnrich = true;
  }
  override onBeforeCompile(sh: THREE.WebGLProgramParametersWithUniforms): void {
    if (!this.dkUniforms.uDeckMap.value) return;
    Object.assign(sh.uniforms, this.dkUniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${TRI_VERT_DECL}`).replace('#include <project_vertex>', `#include <project_vertex>\n${TRI_VERT}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${TRI_VERT_DECL}\nuniform sampler2D uDeckMap; uniform sampler2D uDeckN; uniform float uDeckScale;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec2 dkUv = vec2(vTpW.x, -vTpW.z) * uDeckScale;
float dkW = smoothstep(0.55, 0.85, abs(normalize(vTpN).y)) * (1.0 - 0.75 * smoothstep(45.0, 160.0, length(vViewPosition)));
vec3 dkA = texture2D(uDeckMap, dkUv).rgb;
diffuseColor.rgb *= mix(vec3(0.925), dkA, dkW);
{
  // per-panel tone from a world hash (never repeats with the 12 m tile): ±5 %, one panel in eight a darker replacement
  float dkR = floor(-vTpW.z / 1.5);
  float dkC = floor((vTpW.x - (mod(dkR, 2.0) < 0.5 ? 1.5 : 0.0)) / 3.0);
  float dkH = fract(sin(dot(vec2(dkC, dkR), vec2(12.9898, 78.233))) * 43758.5453);
  diffuseColor.rgb *= mix(1.0, 1.0 + (dkH - 0.5) * 0.1 - step(0.88, dkH) * 0.1, dkW);
}
vec2 dkD = (texture2D(uDeckN, dkUv).xy * 2.0 - 1.0) * dkW * 0.28;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  vec3 dkWN = normalize(vec3(dkD.x, 1.0, -dkD.y)) * sign(vTpN.y);
  vec3 dkView = normalize((viewMatrix * vec4(dkWN, 0.0)).xyz);
  normal = normalize(mix(normal, dkView * faceDirection, dkW));
}`,
      );
  }
  override customProgramCacheKey(): string {
    return this.dkUniforms.uDeckMap.value ? 'emai-deck-xz' : 'emai-deck-plain';
  }
  override copy(source: this): this {
    super.copy(source);
    if (source.dkUniforms && this.dkUniforms) {
      this.dkUniforms.uDeckMap.value = source.dkUniforms.uDeckMap.value;
      this.dkUniforms.uDeckN.value = source.dkUniforms.uDeckN.value;
      this.dkUniforms.uDeckScale.value = source.dkUniforms.uDeckScale.value;
    }
    return this;
  }
}

// ── brand-exact colours (ART-V2 §2.6) ────────────────────────────────────────

const BRAND = {
  mats: [] as { mat: THREE.MeshBasicMaterial; kind: 'orange' | 'disc' }[],
  exposure: 1,
  post: true,
  grade: { contrast: 0.2, saturation: 1.1, shadowTint: [-0.006, -0.001, 0.008], highlightTint: [0.016, 0.006, -0.012] } as { contrast: number; saturation: number; shadowTint: number[]; highlightTint: number[] },
  cache: new Map<string, [number, number, number]>(),
};
const BRAND_TARGET = { orange: [255, 103, 0], disc: [20, 20, 20] } as const;

/** sRGB 0…255 → linear */
const s2l = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const l2s = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255;
const sat = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** three's ACESFilmicToneMapping (r186) + the EmAI grade (RenderSystem gradeBody), linear in → linear out. */
function gradeForward(c: [number, number, number], exposure: number, g: typeof BRAND.grade): [number, number, number] {
  const k = exposure / 0.6;
  const r = c[0] * k,
    gg = c[1] * k,
    b = c[2] * k;
  const ir = 0.59719 * r + 0.35458 * gg + 0.04823 * b,
    ig = 0.076 * r + 0.90834 * gg + 0.01566 * b,
    ib = 0.0284 * r + 0.13383 * gg + 0.83777 * b;
  const fit = (v: number): number => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  const fr = fit(ir),
    fg = fit(ig),
    fb = fit(ib);
  const t = [sat(1.60475 * fr - 0.53108 * fg - 0.07367 * fb), sat(-0.10208 * fr + 1.10813 * fg - 0.00605 * fb), sat(-0.00327 * fr - 0.07276 * fg + 1.07602 * fb)];
  let p = t.map((v) => Math.pow(v, 1 / 2.2));
  p = p.map((v) => v + (v * v * (3 - 2 * v) - v) * g.contrast);
  const l = 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
  p = p.map((v) => l + (v - l) * g.saturation);
  const ws = 1 - smooth(0, 0.55, l),
    wh = smooth(0.45, 1, l);
  p = p.map((v, i) => v + g.shadowTint[i] * ws + g.highlightTint[i] * wh);
  return [Math.pow(sat(p[0]), 2.2), Math.pow(sat(p[1]), 2.2), Math.pow(sat(p[2]), 2.2)];
}
/** Solve the linear material colour (exposure 1 units) that the grade maps onto the sRGB target. */
function solveBrand(kind: 'orange' | 'disc'): [number, number, number] {
  const key = `${kind}:${JSON.stringify(BRAND.grade)}`;
  const hit = BRAND.cache.get(key);
  if (hit) return hit;
  const tgt = BRAND_TARGET[kind].map(s2l) as [number, number, number];
  let c: [number, number, number] = [tgt[0] * 0.8 + 0.001, tgt[1] * 0.8 + 0.001, tgt[2] * 0.8 + 0.001];
  for (let it = 0; it < 60; it++) {
    const f = gradeForward(c, 1, BRAND.grade);
    const err = [f[0] - tgt[0], f[1] - tgt[1], f[2] - tgt[2]];
    if (Math.abs(err[0]) + Math.abs(err[1]) + Math.abs(err[2]) < 1e-7) break;
    // numerical Jacobian, damped Newton, channels ≥ 0
    const J: number[][] = [[], [], []];
    for (let j = 0; j < 3; j++) {
      const d = Math.max(1e-5, c[j] * 1e-3);
      const cc: [number, number, number] = [c[0], c[1], c[2]];
      cc[j] += d;
      const fd = gradeForward(cc, 1, BRAND.grade);
      for (let i = 0; i < 3; i++) J[i][j] = (fd[i] - f[i]) / d;
    }
    const det =
      J[0][0] * (J[1][1] * J[2][2] - J[1][2] * J[2][1]) - J[0][1] * (J[1][0] * J[2][2] - J[1][2] * J[2][0]) + J[0][2] * (J[1][0] * J[2][1] - J[1][1] * J[2][0]);
    let step: number[];
    if (Math.abs(det) > 1e-12) {
      const inv = [
        [J[1][1] * J[2][2] - J[1][2] * J[2][1], J[0][2] * J[2][1] - J[0][1] * J[2][2], J[0][1] * J[1][2] - J[0][2] * J[1][1]],
        [J[1][2] * J[2][0] - J[1][0] * J[2][2], J[0][0] * J[2][2] - J[0][2] * J[2][0], J[0][2] * J[1][0] - J[0][0] * J[1][2]],
        [J[1][0] * J[2][1] - J[1][1] * J[2][0], J[0][1] * J[2][0] - J[0][0] * J[2][1], J[0][0] * J[1][1] - J[0][1] * J[1][0]],
      ];
      step = [0, 1, 2].map((i) => (inv[i][0] * err[0] + inv[i][1] * err[1] + inv[i][2] * err[2]) / det);
    } else step = err.map((e, i) => e / Math.max(1e-6, J[i][i]));
    c = [0, 1, 2].map((i) => Math.max(0, c[i] - 0.8 * step[i])) as [number, number, number];
  }
  BRAND.cache.set(key, c);
  return c;
}
function applyBrand(m: THREE.MeshBasicMaterial, kind: 'orange' | 'disc'): void {
  if (!BRAND.post) {
    // direct path: toneMapped false → the raw brand colour reaches the screen
    m.color.set(kind === 'orange' ? palette.orange : palette.base);
    return;
  }
  const c = solveBrand(kind);
  m.color.setRGB(c[0] / BRAND.exposure, c[1] / BRAND.exposure, c[2] / BRAND.exposure, THREE.LinearSRGBColorSpace);
}
/**
 * RenderSystem calls this whenever the exposure, the render path (post on/off) or the grade changes,
 * so brand-exact materials stay exact through the dusk blend and the quality switch.
 */
export function syncBrandExact(exposure: number, post: boolean, grade?: { contrast: number; saturation: number; shadowTint: number[]; highlightTint: number[] }): void {
  BRAND.exposure = exposure > 0 ? exposure : 1;
  BRAND.post = post;
  if (grade) BRAND.grade = { contrast: grade.contrast, saturation: grade.saturation, shadowTint: [...grade.shadowTint], highlightTint: [...grade.highlightTint] };
  for (const b of BRAND.mats) applyBrand(b.mat, b.kind);
}
/** For tools/tests: the screen colour (sRGB 0…255) the composer path gives a linear material colour. */
export function brandPreview(c: [number, number, number], exposure = 1): [number, number, number] {
  return gradeForward([c[0] * exposure, c[1] * exposure, c[2] * exposure], 1, BRAND.grade).map((v) => Math.round(l2s(v))) as [number, number, number];
}
