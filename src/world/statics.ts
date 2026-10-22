import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { DeckMaterial, HullMaterial, duskLift } from '@/core/brand/materials';

/**
 * Static merge (Phase 6 W1, PERF-01): the island draws each static part once per *shading model*
 * instead of once per mesh or per colour variant.
 *
 * Builders mark static subtrees with `markStatic(obj)` and the shared landscape batch hands its
 * geometry over at flush. `finishStatic(root)` (run by `enrichSurfaces`, the last step of the
 * island's init) bakes every marked mesh into its scope's space and merges, per scope:
 *  - plain MeshStandard (any colour, roughness, metalness, with or without the surface pass)
 *    → ONE `UberStandard`: colour, roughness, metalness and the surface mode ride on vertex
 *    attributes, so the look of every source material is reproduced exactly;
 *  - plain MeshBasic and the light lines of every tier (brand `light()` and the tower kit)
 *    → ONE `UberBasic`: base colour per vertex × the tier's day→dusk lift (aTier), so dusk works;
 *  - triplanar ceramic hull tones → ONE `UberHull`; deck composite tones → one `UberDeck` per
 *    polygon offset;
 *  - everything else (carbon, dark glass, glass, textured …) per material (or per identical
 *    parameter set).
 * Interactables, label texts, moving parts, collider-linked or code-referenced meshes are never
 * marked. Merged meshes are frozen (matrixAutoUpdate off).
 */

// ── uber materials ────────────────────────────────────────────────────────────

const NOISE_GLSL = /* glsl */ `
varying vec3 vEmaiW;
float emaiHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float emaiNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(emaiHash(i), emaiHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(emaiHash(i + vec3(0.0, 1.0, 0.0)), emaiHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(emaiHash(i + vec3(0.0, 0.0, 1.0)), emaiHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(emaiHash(i + vec3(0.0, 1.0, 1.0)), emaiHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float emaiFbm(vec3 p) { return emaiNoise(p) * 0.6 + emaiNoise(p * 2.13 + 1.7) * 0.3 + emaiNoise(p * 4.41 + 3.1) * 0.1; }
`;

/** vRM = (roughness, metalness, surface mode / 2: 0 none, 0.5 surface, 1 surface metal) */
const RM_VERT = (world: boolean): string => `
{
  vRM = aRM;
  ${
    world
      ? `vec4 emaiP = vec4(transformed, 1.0);
  vEmaiW = (modelMatrix * emaiP).xyz;`
      : ''
  }
}`;

/**
 * Per-vertex shadow flags (aShadow = cast, receive): merged parts keep their own receiveShadow
 * (the light loop skips the shadow lookup where vRecv = 0) and castShadow (CAST_MASK clips
 * non-casting parts out of the shadow pass), so meshes with different flags share one draw.
 */
export function patchReceive(sh: THREE.WebGLProgramParametersWithUniforms): void {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 aShadow;\nvarying float vRecv;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRecv = aShadow.y;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vRecv;')
    .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.split('( directLight.visible && receiveShadow )').join('( directLight.visible && receiveShadow && vRecv > 0.5 )'));
}
let castMask: THREE.MeshDepthMaterial | null = null;
/** shadow-pass material that clips the parts that do not cast */
function castMaskMaterial(): THREE.MeshDepthMaterial {
  if (!castMask) {
    castMask = new THREE.MeshDepthMaterial();
    castMask.name = 'world:cast-mask';
    castMask.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aShadow;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nif (aShadow.x < 0.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);');
    };
    castMask.customProgramCacheKey = () => 'emai-cast-mask';
  }
  return castMask;
}

/**
 * MeshStandard with per-vertex colour, roughness, metalness and the island's surface pass
 * (src/world/surface.ts, same constants) switched per vertex: one program for every plain
 * standard material of the island.
 */
export class UberStandard extends THREE.MeshStandardMaterial {
  constructor(params: THREE.MeshStandardMaterialParameters = {}) {
    super({ ...params, color: 0xffffff, roughness: 1, metalness: 1, vertexColors: true });
    this.userData.noEnrich = true;
  }
  override onBeforeCompile(sh: THREE.WebGLProgramParametersWithUniforms): void {
    patchReceive(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRM;\nvarying vec3 vRM;\nvarying vec3 vEmaiW;')
      .replace('#include <project_vertex>', `#include <project_vertex>\n${RM_VERT(true)}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRM;\n${NOISE_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float emaiOn = step(0.25, vRM.z);
float emaiMetal = step(0.75, vRM.z);
float emaiB = emaiNoise(vEmaiW * 0.17 + 5.3);
float emaiG = emaiFbm(vEmaiW * mix(0.45, 0.7, emaiMetal));
diffuseColor.rgb *= mix(vec3(1.0), vec3(mix(0.92, 1.05, emaiB) * mix(0.975, 1.025, emaiG)), emaiOn);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor *= vRM.x;
roughnessFactor = mix(roughnessFactor, clamp(roughnessFactor + (emaiB - 0.5) * mix(0.08, 0.16, emaiMetal) + (emaiG - 0.5) * 0.05, 0.05, 1.0), emaiOn);`,
      )
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= vRM.y;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  vec3 emaiDx = dFdx(-vViewPosition), emaiDy = dFdy(-vViewPosition);
  vec3 emaiR1 = cross(emaiDy, normal), emaiR2 = cross(normal, emaiDx);
  float emaiDet = dot(emaiDx, emaiR1);
  vec3 emaiGrad = sign(emaiDet) * (dFdx(emaiG) * emaiR1 + dFdy(emaiG) * emaiR2);
  float emaiFade = (1.0 - smoothstep(3.0, 14.0, length(vViewPosition))) * 0.0025 * 60.0 * emaiOn * emaiMetal;
  vec3 emaiN = normalize(abs(emaiDet) * normal - emaiGrad * emaiFade);
  normal = mix(normal, emaiN, emaiOn * emaiMetal);
}`,
      );
  }
  override customProgramCacheKey(): string {
    return 'emai-uber-std';
  }
}

/** Triplanar ceramic (HullMaterial) with per-vertex colour and roughness: every hull tone in one program. */
export class UberHull extends HullMaterial {
  constructor(panelN: THREE.Texture | null, params: THREE.MeshPhysicalMaterialParameters = {}) {
    super(panelN, { ...params, color: 0xffffff, roughness: 1, vertexColors: true });
  }
  override onBeforeCompile(sh: THREE.WebGLProgramParametersWithUniforms): void {
    super.onBeforeCompile(sh);
    patchReceive(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRM;\nvarying vec3 vRM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRM;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= vRM.x;');
  }
  override customProgramCacheKey(): string {
    return super.customProgramCacheKey() + '-uber';
  }
}

/** Deck composite (DeckMaterial) with per-vertex colour and roughness. */
export class UberDeck extends DeckMaterial {
  constructor(map: THREE.Texture | null, normal: THREE.Texture | null, params: THREE.MeshStandardMaterialParameters = {}) {
    super(map, normal, { ...params, color: 0xffffff, roughness: 1, vertexColors: true });
  }
  override onBeforeCompile(sh: THREE.WebGLProgramParametersWithUniforms): void {
    super.onBeforeCompile(sh);
    patchReceive(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRM;\nvarying vec3 vRM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRM;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= vRM.x;');
  }
  override customProgramCacheKey(): string {
    return super.customProgramCacheKey() + '-uber';
  }
}

/**
 * Unlit, per-vertex base colour × the light tier's lift: aTier = (day k, dusk k, source), where the
 * source picks the brand library's dusk blend (0, `materials.setDusk`) or the tower kit's (1).
 * Plain unlit colours use (1, 1, 0).
 */
export class UberBasic extends THREE.MeshBasicMaterial {
  readonly tierUniforms = { uK: { value: 0 }, uKk: { value: 0 } };
  constructor(params: THREE.MeshBasicMaterialParameters = {}) {
    super({ ...params, color: 0xffffff, vertexColors: true });
    this.userData.noEnrich = true;
  }
  override onBeforeCompile(sh: THREE.WebGLProgramParametersWithUniforms): void {
    Object.assign(sh.uniforms, this.tierUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aTier;\nvarying vec3 vTier;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTier = aTier;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTier;\nuniform float uK;\nuniform float uKk;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(vTier.x, vTier.y, mix(uK, uKk, vTier.z));');
  }
  override customProgramCacheKey(): string {
    return 'emai-uber-basic';
  }
}

// ── light tiers (mirrors core/brand/materials.ts light() and world/tower/kit.ts light()) ──

const BRAND_TIER_L = { T0: 0.5, T1: 1.45, T2: 3.1 } as const;
const KIT_TIER_K: Record<string, [number, number, number]> = { teal: [1.0, 2.8, 6.0], orange: [1.6, 4.7, 10], warm: [0.6, 1.75, 3.7] };
const KIT_BASE: Record<string, number> = { teal: 0x2dd4bf, orange: 0xff6700, warm: 0xffe9cc };
const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** base colour (linear) and tier (a, b, source) of an unlit material, or null if it cannot join UberBasic */
function basicTier(m: THREE.MeshBasicMaterial): { base: THREE.Color; tier: [number, number, number] } | null {
  const name = m.name || '';
  let r: RegExpExecArray | null;
  if ((r = /^brand:light:([0-9a-f]{6}):(T0|T1|T2|line|beacon)$/.exec(name))) {
    const base = new THREE.Color(parseInt(r[1], 16));
    const t = r[2];
    const [a, b] = t === 'line' ? [BRAND_TIER_L.T0, BRAND_TIER_L.T1] : t === 'beacon' ? [BRAND_TIER_L.T1, BRAND_TIER_L.T2] : [BRAND_TIER_L[t as 'T0'], BRAND_TIER_L[t as 'T0']];
    const L = Math.max(1e-4, lum(base));
    return { base, tier: [a / L, b / L, 0] };
  }
  if ((r = /^tower:light:(teal|orange|warm):([012]):([012])$/.exec(name))) {
    const k = KIT_TIER_K[r[1]];
    return { base: new THREE.Color(KIT_BASE[r[1]]), tier: [k[Number(r[2])], k[Number(r[3])], 1] };
  }
  if (name === 'tower:lightVC') return { base: new THREE.Color(1, 1, 1), tier: [1, 2.8, 1] };
  if (/^(brand|tower):/.test(name) && !/^brand:(basic|screen|emissiveTeal|emissiveOrange)/.test(name)) return null; // brand-exact, logo, beacons …
  if (name && !/^(brand|tower):/.test(name)) return null; // named custom materials (driven by code)
  return { base: m.color.clone(), tier: [1, 1, 0] };
}

// ── merger ────────────────────────────────────────────────────────────────────

type Kind = 'std' | 'basic' | 'hull' | 'deck' | 'same';
type Rc = { src: THREE.Mesh; geo: THREE.BufferGeometry; kind: Kind; key: string };
interface MergeGroup {
  kind: Kind;
  mat: THREE.Material;
  scope: THREE.Object3D;
  order: number;
  geos: THREE.BufferGeometry[];
  flags: [boolean, boolean][];
  perVertex: boolean;
  recolor?: Rc[];
}
interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  cast: boolean;
  receive: boolean;
  order: number;
  scope: THREE.Object3D;
  /** geometry carries a per-vertex colour that multiplies the material colour */
  vc: boolean;
  /** the source mesh keeps a `material` setter that recolours its range of the merged mesh */
  recolor?: THREE.Mesh;
}

type Ctx = Pick<ZoneContext, 'materials' | 'root' | 'debug'>;

const MERGERS = new WeakMap<THREE.Object3D, StaticMerger>();
const _rel = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/**
 * forceSinglePass on a transparent DoubleSide material (one draw instead of a back-face and a
 * front-face pass). For flat or additive glass the result is identical; for curved low-opacity glass
 * only the blend order of a pane's far and near side changes (checked in the A/B: the reference
 * switches it back off).
 */
export function singlePass<T extends THREE.Material>(ctx: Ctx, mat: T): T {
  mat.forceSinglePass = true;
  const m = staticMerger(ctx);
  m.onReference(() => (mat.forceSinglePass = !m.reference));
  return mat;
}

/** Mark a subtree as static: its meshes are merged into the island's shared meshes after init. */
export function markStatic(o: THREE.Object3D): THREE.Object3D {
  o.userData.mergeStatic = true;
  return o;
}
/** Merged meshes of a marked subtree go into this group (e.g. a group that is hidden by distance). */
export function mergeScope(o: THREE.Object3D): THREE.Object3D {
  o.userData.mergeScope = true;
  return o;
}

/** The island's merger (one per island root). */
export function staticMerger(ctx: Ctx): StaticMerger {
  let m = MERGERS.get(ctx.root);
  if (!m) {
    m = new StaticMerger(ctx);
    MERGERS.set(ctx.root, m);
  }
  return m;
}

/** Run the merge for this island root (idempotent). Returns the number of draw objects merged away. */
export function finishStatic(root: THREE.Object3D): number {
  return MERGERS.get(root)?.run() ?? 0;
}
/** The same in slices: `await finishStaticAsync(root, ctx.yield)` keeps every task short (W6). */
export function finishStaticAsync(root: THREE.Object3D, yieldFn: () => Promise<void>): Promise<number> {
  return MERGERS.get(root)?.runAsync(yieldFn) ?? Promise.resolve(0);
}

/** Tasks run right before the merge (the landscape batch hands its geometry over). */
export class StaticMerger {
  private parts: Part[] = [];
  private before: (() => void)[] = [];
  private done = false;
  /** debug: merged source objects and output meshes */
  readonly stats = { sources: 0, meshes: 0, ms: 0, slice: 0 };
  private uberStd = new Map<string, UberStandard>();
  private uberBasic = new Map<string, UberBasic>();
  private uberHull = new Map<string, UberHull>();
  private uberDeck = new Map<string, UberDeck>();
  private sameMats = new Map<string, THREE.Material>();
  kitK: () => number = () => 0;
  /** `?mergeab`: keep the source meshes so `__academy.solve('world', 'static-ab')` can swap them back in (same-frame A/B) */
  private ab = typeof location !== 'undefined' && /[?&]mergeab\b/.test(location.search);
  private sources: { mesh: THREE.Object3D; parent: THREE.Object3D }[] = [];
  private outputs: THREE.Mesh[] = [];
  /** `?mergeab`: the unmerged reference is showing (distance and occlusion culls switch off too) */
  reference = false;
  private refHooks: (() => void)[] = [];
  /** re-apply a cull right away when the A/B toggle flips (the game may be paused) */
  onReference(fn: () => void): void {
    if (this.ab) this.refHooks.push(fn);
  }

  constructor(private ctx: Ctx) {
    ctx.debug.register('static-stats', () => ({ ...this.stats }));
    if (this.ab)
      ctx.debug.register('static-ab', () => {
        const merged = !this.reference;
        this.reference = merged;
        for (const fn of this.refHooks) fn();
        for (const m of this.outputs) m.visible = !merged;
        for (const { mesh, parent } of this.sources) {
          if (merged) parent.add(mesh);
          else mesh.removeFromParent();
        }
        return merged ? 'sources' : 'merged';
      });
  }

  get finished(): boolean {
    return this.done;
  }

  beforeRun(fn: () => void): void {
    if (this.done) fn();
    else this.before.push(fn);
  }

  get abMode(): boolean {
    return this.ab;
  }
  /** `?mergeab` only: an unmerged reference mesh (detached until the A/B toggle swaps it in) */
  addReference(mesh: THREE.Object3D, scope?: THREE.Object3D): void {
    this.sources.push({ mesh, parent: scope ?? this.ctx.root });
  }

  /** Geometry already in `scope` space (the root by default); the merger owns it from now on. */
  addGeometry(mat: THREE.Material, geo: THREE.BufferGeometry, o: { cast?: boolean; receive?: boolean; order?: number; scope?: THREE.Object3D } = {}): void {
    this.parts.push({ geo, mat, cast: !!o.cast, receive: o.receive ?? true, order: o.order ?? 0, scope: o.scope ?? this.ctx.root, vc: !!(mat as THREE.MeshBasicMaterial).vertexColors && !!geo.getAttribute('color') });
  }

  /** Merge everything now (one task). */
  run(): number {
    if (this.done) return 0;
    const t0 = performance.now();
    this.collect();
    for (const g of this.groupParts()) this.emit(g);
    this.stats.meshes = this.outputs.length;
    this.stats.ms = Math.round(performance.now() - t0);
    return this.stats.sources;
  }

  /** Merge in slices, handing the main thread back between the groups (`ctx.yield`). */
  async runAsync(yieldFn: () => Promise<void>): Promise<number> {
    if (this.done) return 0;
    let ms = 0;
    let t = performance.now();
    this.collect();
    const groups = this.groupParts();
    ms += performance.now() - t;
    let slice = ms;
    for (const g of groups) {
      await yieldFn();
      t = performance.now();
      this.emit(g);
      const d = performance.now() - t;
      ms += d;
      slice = Math.max(slice, d);
    }
    this.stats.meshes = this.outputs.length;
    this.stats.ms = Math.round(ms);
    this.stats.slice = Math.round(slice);
    return this.stats.sources;
  }

  private collect(): void {
    for (const fn of this.before.splice(0)) fn();
    this.done = true;
    const root = this.ctx.root;
    root.updateMatrixWorld(true);
    // collect marked subtrees
    const marked: THREE.Object3D[] = [];
    root.traverse((o) => {
      if (o.userData.mergeStatic) marked.push(o);
    });
    const removed = new Set<THREE.Object3D>();
    for (const top of marked) {
      if (removed.has(top)) continue;
      const scope = scopeOf(top, root);
      _inv.copy(scope.matrixWorld).invert();
      const meshes: THREE.Mesh[] = [];
      top.traverse((o) => {
        if (o.userData.noMerge || !mergeable(o as THREE.Mesh)) return;
        meshes.push(o as THREE.Mesh);
      });
      for (const mesh of meshes) {
        if (!visibleChain(mesh, top)) continue;
        const mat = mesh.material as THREE.Material;
        if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
          const im = mesh as THREE.InstancedMesh;
          for (let i = 0; i < im.count; i++) {
            im.getMatrixAt(i, _m);
            _rel.multiplyMatrices(_inv, mesh.matrixWorld).multiply(_m);
            const g = bake(mesh.geometry, _rel);
            let vc = !!(mat as THREE.MeshBasicMaterial).vertexColors && !!g.getAttribute('color');
            if (im.instanceColor) {
              im.getColorAt(i, _c);
              tintGeometry(g, _c, vc);
              vc = true;
            }
            this.parts.push({ geo: g, mat, cast: mesh.castShadow, receive: mesh.receiveShadow, order: mesh.renderOrder, scope, vc });
          }
        } else {
          _rel.multiplyMatrices(_inv, mesh.matrixWorld);
          const g = bake(mesh.geometry, _rel);
          this.parts.push({ geo: g, mat, cast: mesh.castShadow, receive: mesh.receiveShadow, order: mesh.renderOrder, scope, vc: !!(mat as THREE.MeshBasicMaterial).vertexColors && !!g.getAttribute('color'), recolor: mesh.userData.recolor ? mesh : undefined });
        }
        this.stats.sources++;
        const parent = mesh.parent!;
        if (this.ab) this.sources.push({ mesh, parent });
        // children that stay (label texts on a plaque …) move to a stand-in with the same transform
        const kids = mesh.children.filter((c) => !removed.has(c) && !meshes.includes(c as THREE.Mesh));
        if (kids.length) {
          const stand = new THREE.Object3D();
          stand.name = mesh.name ? `${mesh.name}:anchor` : 'anchor';
          stand.position.copy(mesh.position);
          stand.quaternion.copy(mesh.quaternion);
          stand.scale.copy(mesh.scale);
          parent.add(stand);
          for (const k of kids) stand.add(k);
        }
        mesh.removeFromParent();
        removed.add(mesh);
      }
      // what is left of the subtree (groups, label texts) stays where it is, with its matrices baked
      // (texts keep matrixAutoUpdate: the text factory may turn billboards)
      top.traverse((o) => {
        if ('sync' in o || o.userData.mergeScope) return; // label texts may turn; scopes may move
        o.matrixAutoUpdate = false;
        o.updateMatrix();
      });
      top.updateMatrixWorld(true);
    }
  }

  private groupParts(): MergeGroup[] {
    const groups = new Map<string, MergeGroup>();
    for (const p of this.parts) {
      const c = this.canon(p);
      // shadow flags per vertex (aShadow) for opaque lit / unlit parts; transparent ones split by flags
      const perVertex = c.kind !== 'same' || litOpaque(c.mat);
      const receive = c.kind === 'basic' ? false : p.receive; // unlit: receiving does nothing
      const key = `${c.key}|${perVertex ? 'v' : `${p.cast ? 1 : 0}${receive ? 1 : 0}`}|${p.order}|${p.scope.uuid}`;
      let g = groups.get(key);
      if (!g) {
        g = { kind: c.kind, mat: c.mat, scope: p.scope, order: p.order, geos: [], flags: [], perVertex };
        groups.set(key, g);
      }
      if (perVertex) constsOf(c.geo).aShadow = [p.cast ? 1 : 0, receive ? 1 : 0];
      g.geos.push(c.geo);
      g.flags.push([p.cast, receive]);
      if (p.recolor) (g.recolor ??= []).push({ src: p.recolor, geo: c.geo, kind: c.kind, key: c.key });
    }
    this.parts = [];
    return [...groups.values()];
  }

  private emit(g: MergeGroup): void {
    {
      const cast = g.flags.some((f) => f[0]);
      const receive = g.flags.some((f) => f[1]);
      const mixedCast = cast && g.flags.some((f) => !f[0]);
      const mixedReceive = receive && g.flags.some((f) => !f[1]);
      let mat = g.mat;
      // uber materials always read aShadow; a plain material only needs it (and a clone) when mixed
      const flags = g.perVertex && (g.kind !== 'same' || mixedCast || mixedReceive);
      if (g.perVertex && g.kind === 'same' && mixedReceive) mat = this.receiveClone(g.mat);
      // vertex ranges of recolourable sources (before concat disposes the parts)
      const ranges: { rc: Rc; start: number; count: number }[] = [];
      if (g.recolor) {
        let off = 0;
        for (const geo of g.geos) {
          const count = geo.getAttribute('position').count;
          const rc = g.recolor.find((r) => r.geo === geo);
          if (rc) ranges.push({ rc, start: off, count });
          off += count;
        }
      }
      const geo = concat(g.geos, specFor(g.kind, g.geos, flags));
      if (!geo) return;
      for (const r of ranges) this.recolorProxy(r.rc.src, geo, r.rc.kind, r.rc.key, r.start, r.count);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `${g.scope === this.ctx.root ? 'island' : g.scope.name || 'scope'}:static:${g.kind}:${mat.name || mat.type}`;
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      if (mixedCast) mesh.customDepthMaterial = castMaskMaterial();
      mesh.renderOrder = g.order;
      mesh.userData.noCollide = true; // colliders were created from the sources
      if (g.kind === 'basic') {
        const u = (mat as UberBasic).tierUniforms;
        const M = this.ctx.materials;
        mesh.onBeforeRender = () => {
          u.uK.value = duskLift(M.dusk);
          u.uKk.value = this.kitK();
        };
      }
      g.scope.add(mesh);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.updateMatrixWorld(true);
      this.outputs.push(mesh);
    }
  }

  private recvClones = new Map<THREE.Material, THREE.Material>();
  /** the same material with the per-vertex receive patch (one per source material) */
  private receiveClone(src: THREE.Material): THREE.Material {
    let c = this.recvClones.get(src);
    if (!c) {
      const m = src.clone();
      m.name = `${src.name}+recv`;
      const own = Object.prototype.hasOwnProperty.call(src, 'onBeforeCompile') ? src.onBeforeCompile : null;
      const proto = Object.getPrototypeOf(src).onBeforeCompile as THREE.Material['onBeforeCompile'];
      m.onBeforeCompile = (sh, r) => {
        (own ?? proto).call(m, sh, r);
        patchReceive(sh);
      };
      const key = src.customProgramCacheKey();
      m.customProgramCacheKey = () => `${key}|emai-recv`;
      this.recvClones.set(src, m);
      c = m;
    }
    return c;
  }

  /**
   * The source mesh (detached) keeps working for code that swaps its material: assigning a material
   * of the same shading model rewrites the source's vertex range (colour, tier / roughness …).
   */
  private recolorProxy(src: THREE.Mesh, geo: THREE.BufferGeometry, kind: Kind, key: string, start: number, count: number): void {
    let current = src.material as THREE.Material;
    const write = (m: THREE.Material): boolean => {
      const probe = new THREE.BufferGeometry();
      probe.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
      const c = this.canon({ geo: probe, mat: m, cast: false, receive: true, order: 0, scope: this.ctx.root, vc: false });
      if (c.kind !== kind || c.key !== key) return false;
      const k = constsOf(c.geo);
      for (const name of ['color', 'aTier', 'aRM'] as const) {
        const v = k[name];
        const to = geo.getAttribute(name) as THREE.BufferAttribute | undefined;
        if (!v || !to) continue;
        for (let i = 0; i < count; i++) to.setXYZ(start + i, v[0], v[1], v[2]);
        to.addUpdateRange(start * to.itemSize, count * to.itemSize);
        to.needsUpdate = true;
      }
      return true;
    };
    Object.defineProperty(src, 'material', {
      configurable: true,
      get: () => current,
      set: (m: THREE.Material) => {
        if (m === current) return;
        if (write(m)) current = m;
        else console.warn('[statics] recolour: the new material is not of the merged shading model', m.name);
      },
    });
  }

  /** canonical material + prepared geometry for a part */
  private canon(p: Part): { kind: Kind; key: string; mat: THREE.Material; geo: THREE.BufferGeometry } {
    const m = p.mat as THREE.MeshStandardMaterial;
    const geo = p.geo;
    // ── hull tones (triplanar ceramic) ──
    if (m instanceof HullMaterial && !(m instanceof UberHull) && !m.map && !m.transparent && m.tpUniforms.uPanelN.value) {
      const key = `hull|${m.side}|${m.shadowSide}|${m.clearcoat}|${m.clearcoatRoughness}|${m.envMapIntensity}|${m.metalness}|${polyKey(m)}|${m.tpUniforms.uPanelN.value.uuid}`;
      let u = this.uberHull.get(key);
      if (!u) {
        u = new UberHull(m.tpUniforms.uPanelN.value, { clearcoat: m.clearcoat, clearcoatRoughness: m.clearcoatRoughness, envMapIntensity: m.envMapIntensity, metalness: m.metalness, side: sideOut(m.side) });
        u.shadowSide = m.shadowSide;
        copyPoly(m, u);
        u.name = 'world:uber-hull';
        this.uberHull.set(key, u);
      }
      return { kind: 'hull', key, mat: u, geo: prepLit(geo, m, p.vc, [m.roughness, 0, 0]) };
    }
    // ── deck composite tones ──
    if (m instanceof DeckMaterial && m.constructor === DeckMaterial && !m.transparent && m.dkUniforms.uDeckMap.value) {
      const key = `deck|${m.side}|${m.metalness}|${polyKey(m)}|${m.dkUniforms.uDeckMap.value.uuid}`;
      let u = this.uberDeck.get(key);
      if (!u) {
        u = new UberDeck(m.dkUniforms.uDeckMap.value, m.dkUniforms.uDeckN.value, { metalness: m.metalness, side: sideOut(m.side) });
        copyPoly(m, u);
        u.name = 'world:uber-deck';
        this.uberDeck.set(key, u);
      }
      return { kind: 'deck', key, mat: u, geo: prepLit(geo, m, p.vc, [m.roughness, 0, 0]) };
    }
    // ── plain standard ──
    if (plainStandard(m)) {
      const surf = /\+surface$/.test(m.name) ? (m.metalness > 0.35 ? 2 : 1) : 0;
      const key = `std|${sideOut(m.side)}|${m.envMapIntensity}|${polyKey(m)}|${m.fog}|${m.depthWrite}|${m.shadowSide}`;
      let u = this.uberStd.get(key);
      if (!u) {
        u = new UberStandard({ side: sideOut(m.side), envMapIntensity: m.envMapIntensity, fog: m.fog, depthWrite: m.depthWrite });
        u.shadowSide = m.shadowSide;
        copyPoly(m, u);
        u.name = 'world:uber-std';
        this.uberStd.set(key, u);
      }
      return { kind: 'std', key, mat: u, geo: prepLit(geo, m, p.vc, [m.roughness, m.metalness, surf], m.flatShading) };
    }
    // ── unlit colours and light lines ──
    const b = p.mat as THREE.MeshBasicMaterial;
    if (b.isMeshBasicMaterial && plainBasic(b)) {
      const t = basicTier(b);
      if (t) {
        const key = `basic|${sideOut(b.side)}|${b.fog}|${b.toneMapped}|${polyKey(b)}|${b.depthWrite}`;
        let u = this.uberBasic.get(key);
        if (!u) {
          u = new UberBasic({ side: sideOut(b.side), fog: b.fog, toneMapped: b.toneMapped, depthWrite: b.depthWrite });
          copyPoly(b, u);
          u.name = 'world:uber-basic';
          this.uberBasic.set(key, u);
        }
        return { kind: 'basic', key, mat: u, geo: prepBasic(geo, b, t, p.vc) };
      }
    }
    // ── anything else: per material (or per identical parameter set) ──
    const sig = signature(p.mat);
    let same = this.sameMats.get(sig);
    if (!same) {
      same = p.mat;
      this.sameMats.set(sig, same);
    }
    return { kind: 'same', key: `same|${sig}`, mat: same, geo: prepSame(geo, same) };
  }
}

function scopeOf(o: THREE.Object3D, root: THREE.Object3D): THREE.Object3D {
  for (let q: THREE.Object3D | null = o; q && q !== root; q = q.parent) if (q.userData.mergeScope) return q;
  return root;
}

function visibleChain(o: THREE.Object3D, top: THREE.Object3D): boolean {
  for (let q: THREE.Object3D | null = o; q; q = q.parent) {
    if (!q.visible) return false;
    if (q === top) break;
  }
  return true;
}

function mergeable(o: THREE.Mesh): boolean {
  if (!o.isMesh || (o as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh) return false;
  if ((o as unknown as { isTroikaText?: boolean }).isTroikaText || 'sync' in o) return false; // troika text
  if (Array.isArray(o.material) || !o.material) return false;
  const g = o.geometry;
  if (!g || !g.getAttribute('position') || g.morphAttributes.position) return false;
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
  if ((o.material as THREE.ShaderMaterial).isShaderMaterial) return false;
  for (const a of Object.values(g.attributes)) if ((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return false;
  if (o.onBeforeRender !== THREE.Mesh.prototype.onBeforeRender) return false;
  return true;
}

function plainStandard(m: THREE.MeshStandardMaterial): boolean {
  if (!m.isMeshStandardMaterial || (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) return false;
  if (m.constructor !== THREE.MeshStandardMaterial) return false;
  if (m.map || m.normalMap || m.roughnessMap || m.metalnessMap || m.emissiveMap || m.alphaMap || m.aoMap || m.lightMap || m.bumpMap || m.displacementMap || m.envMap) return false;
  if (m.transparent || m.opacity < 1 || m.alphaTest > 0 || m.wireframe) return false;
  if (m.emissive.getHex() !== 0 && m.emissiveIntensity > 0) return false;
  // only the island's surface pass may patch the program
  const own = Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile');
  if (own && !/\+surface$/.test(m.name)) return false;
  if (/(logo|brandExact)/.test(m.name)) return false;
  return true;
}

function plainBasic(m: THREE.MeshBasicMaterial): boolean {
  if (m.constructor !== THREE.MeshBasicMaterial) return false;
  if (m.map || m.alphaMap || m.aoMap || m.lightMap || m.specularMap || m.envMap) return false;
  if (m.transparent || m.opacity < 1 || m.alphaTest > 0 || m.wireframe || !m.toneMapped) return false;
  if (Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) return false;
  return true;
}

const sideOut = (s: THREE.Side): THREE.Side => (s === THREE.BackSide ? THREE.FrontSide : s);
const polyKey = (m: THREE.Material): string => (m.polygonOffset ? `${m.polygonOffsetFactor}:${m.polygonOffsetUnits}` : '-');
function copyPoly(src: THREE.Material, dst: THREE.Material): void {
  dst.polygonOffset = src.polygonOffset;
  dst.polygonOffsetFactor = src.polygonOffsetFactor;
  dst.polygonOffsetUnits = src.polygonOffsetUnits;
}

function signature(m: THREE.Material): string {
  const s = m as THREE.MeshPhysicalMaterial & Record<string, unknown>;
  const v = (x: unknown): string => {
    if (x == null) return '-';
    if (typeof x === 'object' && (x as THREE.Color).isColor) return (x as THREE.Color).getHexString();
    if (typeof x === 'object' && (x as THREE.Texture).isTexture) return (x as THREE.Texture).uuid;
    if (typeof x === 'object' && (x as THREE.Vector2).isVector2) return `${(x as THREE.Vector2).x},${(x as THREE.Vector2).y}`;
    return String(x);
  };
  const keys = [
    'type', 'color', 'emissive', 'emissiveIntensity', 'roughness', 'metalness', 'clearcoat', 'clearcoatRoughness', 'envMapIntensity', 'side', 'shadowSide',
    'transparent', 'opacity', 'depthWrite', 'depthTest', 'blending', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'map', 'normalMap', 'normalScale',
    'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'envMap', 'vertexColors', 'flatShading', 'fog', 'toneMapped', 'alphaTest', 'sheen',
    'transmission', 'iridescence', 'specularIntensity', 'ior', 'reflectivity', 'colorWrite', 'forceSinglePass',
  ];
  // unnamed materials may be driven by code through their reference: they only merge with themselves
  const name = m.name.replace(/\+surface$/, '');
  if (!/^(brand|tower):/.test(name) || Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) return `id:${m.uuid}`;
  // library materials with identical parameters (the tower kit's dark glass = the brand's) share one draw
  return `${m.constructor.name}|${keys.map((k) => v(s[k])).join('|')}|${m.customProgramCacheKey()}|${name.replace(/^(brand|tower):/, '')}`;
}

// ── geometry ──────────────────────────────────────────────────────────────────

/** Clone with a matrix applied (normals by the normal matrix; winding flipped for mirroring matrices). */
function bake(src: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(src.attributes)) g.setAttribute(name, (a as THREE.BufferAttribute).clone());
  if (src.index) g.setIndex(src.index.clone());
  g.applyMatrix4(m);
  if (m.determinant() < 0) flipWinding(g);
  return g;
}

function flipWinding(g: THREE.BufferGeometry): void {
  if (!g.index) g.setIndex(seqIndex(g.getAttribute('position').count));
  const a = g.index!.array as Uint16Array | Uint32Array;
  for (let i = 0; i + 2 < a.length; i += 3) {
    const t = a[i + 1];
    a[i + 1] = a[i + 2];
    a[i + 2] = t;
  }
  g.index!.needsUpdate = true;
}

function seqIndex(n: number): THREE.BufferAttribute {
  const a = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
  for (let i = 0; i < n; i++) a[i] = i;
  return new THREE.BufferAttribute(a, 1);
}

/** multiply (or set) a per-vertex colour (instance colours of baked instanced meshes) */
function tintGeometry(g: THREE.BufferGeometry, c: THREE.Color, multiply: boolean): void {
  const n = g.getAttribute('position').count;
  const old = multiply ? g.getAttribute('color') : null;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = old ? old.getX(i) : 1,
      gg = old ? old.getY(i) : 1,
      b = old ? old.getZ(i) : 1;
    arr[i * 3] = r * c.r;
    arr[i * 3 + 1] = gg * c.g;
    arr[i * 3 + 2] = b * c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/**
 * Per-part constants, written straight into the merged attributes by `concat` (no per-part arrays):
 * a part attribute that exists is multiplied by its constant, a missing one is filled with it.
 */
type Consts = Partial<Record<'color' | 'aRM' | 'aTier' | 'aShadow', number[]>>;
const constsOf = (g: THREE.BufferGeometry): Consts => (g.userData.consts ??= {}) as Consts;

/** lit, opaque, library-style materials whose clone can take the per-vertex shadow flags */
function litOpaque(m: THREE.Material): boolean {
  const s = m as THREE.MeshStandardMaterial;
  return !!s.isMeshStandardMaterial && !m.transparent && m.opacity >= 1 && m.alphaTest === 0;
}

function keepOnly(g: THREE.BufferGeometry, names: string[]): void {
  for (const k of Object.keys(g.attributes)) if (!names.includes(k)) g.deleteAttribute(k);
  g.morphAttributes = {};
  g.clearGroups();
}

/** lit uber kinds: position, normal, colour (material × vertex colour), aRM = (roughness, metalness, surface / 2) */
function prepLit(g: THREE.BufferGeometry, m: THREE.MeshStandardMaterial, vc: boolean, rm: [number, number, number], flat = false): THREE.BufferGeometry {
  if (flat) {
    if (g.index) g = g.toNonIndexed();
    g.deleteAttribute('normal');
    g.computeVertexNormals();
  } else if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (m.side === THREE.BackSide) {
    flipWinding(g);
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
  }
  const c = constsOf(g);
  c.color = [m.color.r, m.color.g, m.color.b];
  c.aRM = [rm[0], rm[1], rm[2] / 2];
  keepOnly(g, vc ? ['position', 'normal', 'color'] : ['position', 'normal']);
  return g;
}

function prepBasic(g: THREE.BufferGeometry, m: THREE.MeshBasicMaterial, t: { base: THREE.Color; tier: [number, number, number] }, vc: boolean): THREE.BufferGeometry {
  if (m.side === THREE.BackSide) flipWinding(g);
  const c = constsOf(g);
  c.color = [t.base.r, t.base.g, t.base.b];
  c.aTier = t.tier;
  keepOnly(g, vc ? ['position', 'color'] : ['position']);
  return g;
}

function prepSame(g: THREE.BufferGeometry, m: THREE.Material): THREE.BufferGeometry {
  const s = m as THREE.MeshStandardMaterial;
  const names = ['position'];
  if (!(m as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    names.push('normal');
  }
  if (s.map || s.normalMap || s.roughnessMap || s.metalnessMap || s.emissiveMap || s.alphaMap || s.aoMap) {
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    names.push('uv');
  }
  if (s.vertexColors) {
    if (!g.getAttribute('color')) constsOf(g).color = [1, 1, 1];
    names.push('color');
  }
  keepOnly(g, names);
  return g;
}

/** output attribute layout per kind: lit colours and parameters as normalised 16-bit, flags 8-bit */
interface AttrSpec {
  name: string;
  size: number;
  type: 'f32' | 'u16n' | 'u8n';
}
function specFor(kind: Kind, geos: THREE.BufferGeometry[], flags: boolean): AttrSpec[] {
  const out: AttrSpec[] = [{ name: 'position', size: 3, type: 'f32' }];
  if (kind === 'basic') out.push({ name: 'color', size: 3, type: 'f32' }, { name: 'aTier', size: 3, type: 'f32' });
  else if (kind !== 'same') out.push({ name: 'normal', size: 3, type: 'f32' }, { name: 'color', size: 3, type: 'u16n' }, { name: 'aRM', size: 3, type: 'u16n' });
  else {
    const g0 = geos[0];
    for (const n of ['normal', 'uv', 'color']) if (g0.getAttribute(n) || (n === 'color' && constsOf(g0).color)) out.push({ name: n, size: n === 'uv' ? 2 : 3, type: 'f32' });
  }
  if (flags) out.push({ name: 'aShadow', size: 2, type: 'u8n' });
  return out;
}

/** Concatenate the parts of one group (indexed output); constants are written per vertex. */
function concat(geos: THREE.BufferGeometry[], spec: AttrSpec[]): THREE.BufferGeometry | null {
  if (!geos.length) return null;
  let vtx = 0,
    idx = 0;
  for (const g of geos) {
    vtx += g.getAttribute('position').count;
    idx += g.index ? g.index.count : g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  for (const { name, size, type } of spec) {
    const arr = type === 'u16n' ? new Uint16Array(vtx * size) : type === 'u8n' ? new Uint8Array(vtx * size) : new Float32Array(vtx * size);
    const max = type === 'u16n' ? 65535 : type === 'u8n' ? 255 : 1;
    const q = (v: number): number => (max === 1 ? v : Math.round(Math.min(1, Math.max(0, v)) * max));
    let off = 0;
    for (const g of geos) {
      const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
      const k = constsOf(g)[name as keyof Consts];
      const n = g.getAttribute('position').count;
      const base = off * size;
      off += n;
      if (a) {
        const src = a.array;
        const plain = !a.normalized && src instanceof Float32Array && !(a as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && src.length >= n * a.itemSize;
        if (plain && !k && max === 1 && a.itemSize === size) {
          arr.set(src.length === n * size ? src : src.subarray(0, n * size), base);
          continue;
        }
        const st = a.itemSize;
        const k0 = k ? k[0] : 1,
          k1 = k ? k[1] : 1,
          k2 = k ? k[2] : 1;
        if (plain && size === 3 && st >= 3) {
          for (let i = 0, o = base, p = 0; i < n; i++, o += 3, p += st) {
            arr[o] = q(src[p] * k0);
            arr[o + 1] = q(src[p + 1] * k1);
            arr[o + 2] = q(src[p + 2] * k2);
          }
        } else for (let i = 0; i < n; i++) for (let j = 0; j < size; j++) arr[base + i * size + j] = q(a.getComponent(i, j) * (k ? k[j] : 1));
      } else if (k) {
        if (size === 3) {
          const c0 = q(k[0]),
            c1 = q(k[1]),
            c2 = q(k[2]);
          for (let o = base, e = base + n * 3; o < e; o += 3) {
            arr[o] = c0;
            arr[o + 1] = c1;
            arr[o + 2] = c2;
          }
        } else if (size === 2) {
          const c0 = q(k[0]),
            c1 = q(k[1]);
          for (let o = base, e = base + n * 2; o < e; o += 2) {
            arr[o] = c0;
            arr[o + 1] = c1;
          }
        } else for (let i = 0; i < n; i++) for (let j = 0; j < size; j++) arr[base + i * size + j] = q(k[j]);
      } else if (name !== 'normal' && name !== 'uv') arr.fill(max, base, base + n * size); // missing colour = white
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size, max !== 1));
  }
  const index = vtx > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  let io = 0,
    vo = 0;
  for (const g of geos) {
    const n = g.getAttribute('position').count;
    if (g.index) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i++) index[io++] = a[i] + vo;
    } else for (let i = 0; i < n; i++) index[io++] = vo + i;
    vo += n;
    g.dispose();
  }
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}
