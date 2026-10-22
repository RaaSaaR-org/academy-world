import * as THREE from 'three';

/**
 * Z1 (phase 6): merge a zone's static meshes into one draw per material.
 *
 * Walks `root` and bakes every static, plain mesh (and static InstancedMesh / LineSegments) into
 * one geometry per material, in `root`-local space; the merged meshes are added to `root` and
 * the originals are detached. With `pack` (default) materials that differ only in values a vertex
 * can carry share ONE material:
 *  - plain opaque MeshStandard / MeshPhysical (colour, roughness, metalness, emissive, clearcoat
 *    per vertex; a shared normal map is allowed),
 *  - plain opaque untextured MeshBasic (colour per vertex: light lines of different colours).
 * The packed values follow their source materials live: when zone code changes a source's colour,
 * emissive, roughness, metalness or clearcoat later (a flash, the dusk), the merged mesh rewrites
 * that material's vertex range before it draws.
 *
 * Left alone (with their subtrees): anything in `keep`, `userData.noMerge`, interactables,
 * physics-driven objects, InstancedMeshes with DynamicDrawUsage, hidden objects, meshes with
 * children, troika text, ShaderMaterials and instance-level onBeforeCompile patches, multi-material
 * meshes, morph/skinned meshes, custom attributes, partial draw ranges and meshes with their own
 * onBeforeRender.
 *
 * Detached originals keep their world matrix (getWorldPosition still answers correctly). In dev
 * builds a watcher warns when code later moves, hides or re-materials a merged original or one of
 * its former parents, moves a frozen node, or hides / fades a packed material — those belong in
 * `keep` (or `userData.noPack` on the material).
 */
export interface MergeStaticOptions {
  /** objects whose subtrees stay untouched (animated, highlighted, looked up later) */
  keep?: Iterable<THREE.Object3D | null | undefined> | ((o: THREE.Object3D) => boolean);
  /** fold materials that differ only in per-vertex-able values into one material (default true) */
  pack?: boolean;
  /** merge static InstancedMeshes too, up to this many vertices each (default 24000) */
  maxInstanceVertices?: number;
  /** matrixAutoUpdate off for everything left in the subtree except `keep` (default true) */
  freeze?: boolean;
  /** name prefix of the merged meshes */
  name?: string;
  /**
   * 'exact' (default): parts with different castShadow / receiveShadow flags stay in separate draws.
   * 'union': one draw per material; the merged mesh casts / receives when any part did (small trims,
   * inlays and inner faces then cast too, floor decals can self-shadow, parts that ignored shadows
   * now darken in them — check the look).
   */
  shadows?: 'exact' | 'union';
  /** extra vertex attributes to carry along (e.g. a zone's own per-vertex tags); meshes lacking one stay unmerged */
  attributes?: string[];
}

export interface MergeStaticReport {
  /** meshes (draw-call candidates) under root before / after */
  before: number;
  after: number;
  /** originals baked into merged meshes */
  merged: number;
  /** the new merged meshes (to register with a zone's own systems) */
  meshes: THREE.Object3D[];
  /** the detached originals */
  originals: THREE.Object3D[];
  /** time the merge took (ms) */
  ms: number;
}

interface Item {
  obj: THREE.Mesh | THREE.LineSegments;
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  /** root-local matrices (one per instance) */
  mats: THREE.Matrix4[];
  /** per-instance colour multipliers (InstancedMesh.instanceColor) */
  tints: (THREE.Color | null)[];
}

type PackKind = 'pbr' | 'basic' | null;

interface Bucket {
  material: THREE.Material;
  items: Item[];
  lines: boolean;
  pack: PackKind;
  normals: boolean;
  uvs: boolean;
  /** packed physical clearcoat (per-vertex clearcoat, clearcoat roughness) */
  coat: boolean;
  colors: 0 | 3 | 4;
  proto: THREE.Object3D;
}

const TEX_SLOTS = ['map', 'lightMap', 'aoMap', 'emissiveMap', 'bumpMap', 'normalMap', 'displacementMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'envMap', 'specularMap', 'gradientMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'iridescenceMap', 'iridescenceThicknessMap', 'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularIntensityMap', 'specularColorMap', 'anisotropyMap', 'matcap'] as const;
const BASE_ATTRS = new Set(['position', 'normal', 'uv', 'color']);
// envMapIntensity is not packed: with scene.environment (and no material envMap) three uses scene.environmentIntensity
const PACK_KEY_PROPS = ['side', 'flatShading', 'fog', 'depthTest', 'depthWrite', 'colorWrite', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'toneMapped', 'dithering', 'shadowSide', 'forceSinglePass'] as const;
type PbrMat = THREE.MeshStandardMaterial & Partial<THREE.MeshPhysicalMaterial>;
const rec = (m: THREE.Material): Record<string, unknown> => m as unknown as Record<string, unknown>;

const hasTexture = (m: THREE.Material): boolean => TEX_SLOTS.some((k) => !!rec(m)[k]);
const ownCompile = (m: THREE.Material): boolean => Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile') || Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey');
const plainOpaque = (m: THREE.Material): boolean => !m.transparent && m.opacity === 1 && m.alphaTest === 0 && !m.alphaHash && !(m as THREE.MeshBasicMaterial).wireframe && m.blending === THREE.NormalBlending && !m.userData.noPack;

/**
 * Pack key of a material (null = not packable): everything that changes the shader program or a
 * uniform the packed material cannot carry per vertex.
 */
function packKey(mat: THREE.Material): { key: string; kind: PackKind } | null {
  const proto = Object.getPrototypeOf(mat);
  if (!plainOpaque(mat)) return null;
  const props = PACK_KEY_PROPS.map((k) => String(rec(mat)[k]));
  if (proto === THREE.MeshBasicMaterial.prototype) {
    if (hasTexture(mat)) return null;
    return { key: ['B', ...props].join(','), kind: 'basic' };
  }
  const phys = proto === THREE.MeshPhysicalMaterial.prototype;
  if (!phys && proto !== THREE.MeshStandardMaterial.prototype) return null;
  const m = mat as PbrMat;
  // the only texture allowed is a shared normal map
  if (TEX_SLOTS.some((k) => k !== 'normalMap' && !!rec(m)[k])) return null;
  if (phys) {
    const p = m as THREE.MeshPhysicalMaterial;
    if (p.transmission !== 0 || p.sheen !== 0 || p.iridescence !== 0 || p.anisotropy !== 0 || p.dispersion !== 0 || p.specularIntensity !== 1 || p.specularColor.getHex() !== 0xffffff || Math.abs(p.ior - 1.5) > 1e-6) return null;
  }
  const nm = m.normalMap ? `${m.normalMap.uuid}:${m.normalMapType}:${m.normalScale.x}:${m.normalScale.y}` : '-';
  const coat = phys && (m as THREE.MeshPhysicalMaterial).clearcoat > 0 ? 'C' : '-';
  return { key: [phys ? 'P' : 'S', coat, nm, ...props].join(','), kind: 'pbr' };
}

/** The packed material: colour from the vertex colour; roughness / metalness, emissive and clearcoat per vertex (PBR). */
function packedMaterial(name: string, src: THREE.Material, kind: 'pbr' | 'basic'): THREE.Material {
  if (kind === 'basic') {
    const b = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    for (const k of PACK_KEY_PROPS) rec(b)[k] = rec(src)[k];
    b.name = name;
    return b;
  }
  const s = src as PbrMat;
  const phys = Object.getPrototypeOf(src) === THREE.MeshPhysicalMaterial.prototype;
  const coat = phys && (s as THREE.MeshPhysicalMaterial).clearcoat > 0;
  const m: THREE.MeshStandardMaterial = phys ? new THREE.MeshPhysicalMaterial({ clearcoat: coat ? 1 : 0 }) : new THREE.MeshStandardMaterial();
  m.color.set(0xffffff);
  m.roughness = 1;
  m.metalness = 0;
  m.vertexColors = true;
  for (const k of PACK_KEY_PROPS) rec(m)[k] = rec(src)[k];
  if (s.normalMap) {
    m.normalMap = s.normalMap;
    m.normalMapType = s.normalMapType;
    m.normalScale.copy(s.normalScale);
  }
  m.name = name;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec2 packRM;\nattribute vec3 packE;\nvarying vec2 vPackRM;\nvarying vec3 vPackE;${coat ? '\nattribute vec2 packCC;\nvarying vec2 vPackCC;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvPackRM = packRM;\nvPackE = packE;${coat ? '\nvPackCC = packCC;' : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vPackRM;\nvarying vec3 vPackE;${coat ? '\nvarying vec2 vPackCC;' : ''}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vPackRM.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vPackRM.y;')
      .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = vPackE;');
    if (coat)
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <lights_physical_fragment>',
        THREE.ShaderChunk.lights_physical_fragment.replace('material.clearcoat = clearcoat;', 'material.clearcoat = vPackCC.x;').replace('material.clearcoatRoughness = clearcoatRoughness;', 'material.clearcoatRoughness = vPackCC.y;'),
      );
  };
  m.customProgramCacheKey = () => `zone-pack-v1${coat ? 'c' : ''}`;
  return m;
}

/** The per-vertex values a packed source material contributes (colour first). */
function packValues(m: THREE.Material, kind: 'pbr' | 'basic', out: number[]): number[] {
  const c = (m as THREE.MeshBasicMaterial).color;
  out[0] = c.r;
  out[1] = c.g;
  out[2] = c.b;
  if (kind === 'basic') return out;
  const p = m as PbrMat;
  const ei = p.emissiveIntensity;
  out[3] = p.emissive.r * ei;
  out[4] = p.emissive.g * ei;
  out[5] = p.emissive.b * ei;
  out[6] = p.roughness;
  out[7] = p.metalness;
  out[8] = p.clearcoat ?? 0;
  out[9] = p.clearcoatRoughness ?? 0;
  return out;
}

interface PackedSource {
  mat: THREE.Material;
  /** vertex ranges [start, count] of this material in the merged geometry */
  ranges: [number, number][];
  snap: number[];
}

/**
 * Keeps a packed mesh's per-vertex values in step with its source materials: compares a handful
 * of numbers per source each time the mesh draws, rewrites only the ranges of a changed source.
 */
function liveUpdate(g: THREE.BufferGeometry, kind: 'pbr' | 'basic', base: Float32Array, sources: PackedSource[]): () => void {
  const cur: number[] = [];
  const color = g.getAttribute('color') as THREE.BufferAttribute;
  const rm = g.getAttribute('packRM') as THREE.BufferAttribute | undefined;
  const em = g.getAttribute('packE') as THREE.BufferAttribute | undefined;
  const cc = g.getAttribute('packCC') as THREE.BufferAttribute | undefined;
  return () => {
    for (const s of sources) {
      packValues(s.mat, kind, cur);
      let same = true;
      for (let i = 0; i < s.snap.length; i++) if (cur[i] !== s.snap[i]) same = false;
      if (same) continue;
      for (let i = 0; i < s.snap.length; i++) s.snap[i] = cur[i];
      for (const [start, count] of s.ranges) {
        const ca = color.array as Float32Array;
        for (let v = start; v < start + count; v++) {
          ca[v * 3] = base[v * 3] * cur[0];
          ca[v * 3 + 1] = base[v * 3 + 1] * cur[1];
          ca[v * 3 + 2] = base[v * 3 + 2] * cur[2];
        }
        color.addUpdateRange(start * 3, count * 3);
        color.needsUpdate = true;
        if (kind === 'basic') continue;
        const ra = rm!.array as Float32Array;
        const ea = em!.array as Float32Array;
        for (let v = start; v < start + count; v++) {
          ra[v * 2] = cur[6];
          ra[v * 2 + 1] = cur[7];
          ea[v * 3] = cur[3];
          ea[v * 3 + 1] = cur[4];
          ea[v * 3 + 2] = cur[5];
        }
        rm!.addUpdateRange(start * 2, count * 2);
        em!.addUpdateRange(start * 3, count * 3);
        rm!.needsUpdate = em!.needsUpdate = true;
        if (cc) {
          const a = cc.array as Float32Array;
          for (let v = start; v < start + count; v++) {
            a[v * 2] = cur[8];
            a[v * 2 + 1] = cur[9];
          }
          cc.addUpdateRange(start * 2, count * 2);
          cc.needsUpdate = true;
        }
      }
    }
  };
}

export function mergeStatic(
  root: THREE.Object3D,
  o: MergeStaticOptions = {},
  engineKeep?: (obj: THREE.Object3D) => boolean,
  zoneId = 'zone',
): MergeStaticReport & { formerParents: THREE.Object3D[]; frozen: THREE.Object3D[]; packedSources: THREE.Material[]; labels: Map<THREE.Object3D, string> } {
  const keepSet = new Set<THREE.Object3D>();
  let keepFn: ((obj: THREE.Object3D) => boolean) | null = null;
  if (typeof o.keep === 'function') keepFn = o.keep;
  else if (o.keep) for (const k of o.keep) if (k) keepSet.add(k);
  const isKept = (obj: THREE.Object3D): boolean => keepSet.has(obj) || !!obj.userData.noMerge || !!obj.userData.__highlight || (keepFn?.(obj) ?? false) || (engineKeep?.(obj) ?? false);
  const pack = o.pack !== false;
  const maxInst = o.maxInstanceVertices ?? 24000;
  const prefix = o.name ?? `${zoneId}:merged`;
  const extra = o.attributes ?? [];
  const allowed = new Set([...BASE_ATTRS, ...extra]);
  const t0 = performance.now();

  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, Bucket>();
  const packedMats = new Map<string, THREE.Material>();
  const kept: THREE.Object3D[] = [];

  const countDraws = (obj: THREE.Object3D): number => {
    let n = 0;
    obj.traverseVisible((q) => {
      if ((q as THREE.Mesh).isMesh || (q as THREE.Line).isLine || (q as THREE.Points).isPoints || (q as THREE.Sprite).isSprite) n++;
    });
    return n;
  };
  const before = countDraws(root);

  const eligibleGeo = (g: THREE.BufferGeometry): boolean => {
    if (!g || !g.isBufferGeometry || (g as THREE.InstancedBufferGeometry).isInstancedBufferGeometry) return false;
    if (!g.getAttribute('position')) return false;
    if (Object.keys(g.morphAttributes).length) return false;
    if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
    for (const name of Object.keys(g.attributes)) {
      if (!allowed.has(name)) return false;
      if ((g.attributes[name] as unknown as THREE.InstancedBufferAttribute).isInstancedBufferAttribute) return false;
    }
    return true;
  };

  const visit = (obj: THREE.Object3D): void => {
    if (obj !== root && isKept(obj)) {
      kept.push(obj);
      return;
    }
    if (!obj.visible) return; // toggled later: leave the subtree alone
    for (const c of [...obj.children]) visit(c);
    if (obj === root || obj.children.length) return;
    const mesh = obj as THREE.Mesh;
    const isLineSeg = !!(obj as THREE.LineSegments).isLineSegments;
    if (!(mesh.isMesh || isLineSeg)) return;
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh || (obj as unknown as { isBatchedMesh?: boolean }).isBatchedMesh) return;
    if (obj.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || obj.onAfterRender !== THREE.Object3D.prototype.onAfterRender) return;
    if (mesh.customDepthMaterial || mesh.customDistanceMaterial) return;
    const mat = mesh.material as THREE.Material | THREE.Material[];
    if (!mat || Array.isArray(mat) || !mat.visible) return;
    if ((mat as THREE.ShaderMaterial).isShaderMaterial || ownCompile(mat)) return;
    if (isLineSeg && !(mat as THREE.LineBasicMaterial).isLineBasicMaterial) return;
    const geo = mesh.geometry;
    if (!eligibleGeo(geo)) return;
    const inst = (obj as THREE.InstancedMesh).isInstancedMesh ? (obj as THREE.InstancedMesh) : null;
    // instances flagged for per-frame updates stay live (and unfrozen)
    if (inst && (inst.instanceMatrix.usage === THREE.DynamicDrawUsage || inst.instanceColor?.usage === THREE.DynamicDrawUsage)) {
      kept.push(obj);
      return;
    }
    if (inst && (inst.count === 0 || inst.count * geo.getAttribute('position').count > maxInst || inst.morphTexture)) return;
    if (isLineSeg && inst) return;
    const textured = hasTexture(mat);
    const geoColors = geo.getAttribute('color');
    const usesColor = !!(mat as THREE.MeshBasicMaterial).vertexColors;
    if (usesColor && !geoColors) return; // would render black; keep as is
    if (extra.some((n) => !geo.getAttribute(n))) return;
    const extraSig = extra.map((n) => `${n}:${geo.getAttribute(n).itemSize}`).join(',');
    const pk = pack && !isLineSeg && !(usesColor && geoColors.itemSize === 4) ? packKey(mat) : null;
    // instance colours need a colour attribute: only for packed or vertex-coloured materials
    if (inst?.instanceColor && !pk && !usesColor) return;
    const lit = !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial && !isLineSeg;
    if (lit && !geo.getAttribute('normal')) return;
    const colors: 0 | 3 | 4 = pk ? 3 : usesColor ? (geoColors.itemSize === 4 ? 4 : 3) : 0;
    // cast and receive flags split buckets unless shadows 'union' (then any part casting / receiving → all do);
    // unlit materials ignore receiveShadow, so it never splits them
    const recv = lit ? (mesh.receiveShadow ? 1 : 0) : '-';
    const flags = `${o.shadows === 'union' ? 'u' : `${mesh.castShadow ? 1 : 0}${recv}`}|${obj.renderOrder}|${obj.layers.mask}|${obj.frustumCulled ? 1 : 0}|${extraSig}`;
    let key: string;
    let material: THREE.Material;
    if (pk) {
      key = `pack|${pk.key}|${flags}`;
      let pm = packedMats.get(pk.key);
      if (!pm) packedMats.set(pk.key, (pm = packedMaterial(`${prefix}:packed${packedMats.size ? packedMats.size : ''}`, mat, pk.kind!)));
      material = pm;
    } else {
      key = `${mat.uuid}|${isLineSeg ? 'L' : 'M'}|${colors}|${flags}`;
      material = mat;
    }
    let b = buckets.get(key);
    if (!b) {
      const coat = pk?.kind === 'pbr' && ((mat as THREE.MeshPhysicalMaterial).clearcoat ?? 0) > 0;
      buckets.set(key, (b = { material, items: [], lines: isLineSeg, pack: pk?.kind ?? null, normals: lit, uvs: textured, coat, colors, proto: obj }));
    }
    const world = new THREE.Matrix4().multiplyMatrices(rootInv, obj.matrixWorld);
    const item: Item = { obj: obj as THREE.Mesh, geo, mat, mats: [], tints: [] };
    if (inst) {
      const im = new THREE.Matrix4();
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, im);
        item.mats.push(new THREE.Matrix4().multiplyMatrices(world, im));
        if (inst.instanceColor) {
          const c = new THREE.Color();
          inst.getColorAt(i, c);
          item.tints.push(c);
        } else item.tints.push(null);
      }
    } else {
      item.mats.push(world);
      item.tints.push(null);
    }
    b.items.push(item);
  };
  visit(root);

  const originals: THREE.Object3D[] = [];
  const formerParents = new Set<THREE.Object3D>();
  const packedSources = new Set<THREE.Material>();
  const meshes: THREE.Object3D[] = [];
  // dev: where each watched object sat (the originals are detached below)
  const labels = new Map<THREE.Object3D, string>();
  const describe = (q: THREE.Object3D): string => {
    const m = (q as THREE.Mesh).material as THREE.Material | undefined;
    const path: string[] = [];
    for (let p = q.parent; p && p !== root.parent; p = p.parent) path.push(p.name || p.type);
    return `${q.name || q.type}${m && !Array.isArray(m) ? `[${m.name || m.type}]` : ''} in ${path.reverse().join('/')}`;
  };
  let merged = 0;
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  const col = new THREE.Color();
  const vals: number[] = [];
  for (const b of buckets.values()) {
    if (b.items.length < 2) continue; // one mesh (or one InstancedMesh) is one draw already
    let vCount = 0;
    let iCount = 0;
    for (const it of b.items) {
      const n = it.geo.getAttribute('position').count;
      vCount += n * it.mats.length;
      iCount += (it.geo.index ? it.geo.index.count : n) * it.mats.length;
    }
    const pos = new Float32Array(vCount * 3);
    const nor = b.normals ? new Float32Array(vCount * 3) : null;
    const uv = b.uvs || (b.pack === 'pbr' && !!(b.material as PbrMat).normalMap) ? new Float32Array(vCount * 2) : null;
    const cs = b.colors;
    const colArr = cs ? new Float32Array(vCount * cs) : null;
    // packed: the per-vertex colour without its material's colour (for live updates)
    const base = b.pack ? new Float32Array(vCount * 3) : null;
    const rm = b.pack === 'pbr' ? new Float32Array(vCount * 2) : null;
    const em = b.pack === 'pbr' ? new Float32Array(vCount * 3) : null;
    const cc = b.coat ? new Float32Array(vCount * 2) : null;
    const ex = extra.map((n) => {
      const size = b.items[0].geo.getAttribute(n).itemSize;
      return { n, size, arr: new Float32Array(vCount * size) };
    });
    const index = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
    const sources = new Map<THREE.Material, PackedSource>();
    let vo = 0;
    let io = 0;
    for (const it of b.items) {
      const g = it.geo;
      const P = g.getAttribute('position');
      const N = g.getAttribute('normal');
      const U = g.getAttribute('uv');
      const C = g.getAttribute('color');
      const I = g.index;
      const n = P.count;
      const src = it.mat;
      if (b.pack) packValues(src, b.pack, vals);
      const srcUsesColor = !!(src as THREE.MeshBasicMaterial).vertexColors && !!C;
      const startV = vo;
      for (let k = 0; k < it.mats.length; k++) {
        const M = it.mats[k];
        const tint = it.tints[k];
        const flip = M.determinant() < 0;
        nm.getNormalMatrix(M);
        for (let i = 0; i < n; i++) {
          const w = vo + i;
          v.fromBufferAttribute(P, i).applyMatrix4(M);
          pos[w * 3] = v.x;
          pos[w * 3 + 1] = v.y;
          pos[w * 3 + 2] = v.z;
          if (nor && N) {
            v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
            nor[w * 3] = v.x;
            nor[w * 3 + 1] = v.y;
            nor[w * 3 + 2] = v.z;
          }
          // a part without uvs reads (0, 0) — what WebGL feeds a missing attribute
          if (uv && U) {
            uv[w * 2] = U.getX(i);
            uv[w * 2 + 1] = U.getY(i);
          }
          if (colArr) {
            if (srcUsesColor) col.setRGB(C.getX(i), C.getY(i), C.getZ(i));
            else col.setRGB(1, 1, 1);
            if (tint) col.multiply(tint);
            if (base) {
              base[w * 3] = col.r;
              base[w * 3 + 1] = col.g;
              base[w * 3 + 2] = col.b;
              col.r *= vals[0];
              col.g *= vals[1];
              col.b *= vals[2];
            }
            colArr[w * cs] = col.r;
            colArr[w * cs + 1] = col.g;
            colArr[w * cs + 2] = col.b;
            if (cs === 4) colArr[w * 4 + 3] = C && C.itemSize === 4 ? C.getW(i) : 1;
          }
          if (rm && em) {
            em[w * 3] = vals[3];
            em[w * 3 + 1] = vals[4];
            em[w * 3 + 2] = vals[5];
            rm[w * 2] = vals[6];
            rm[w * 2 + 1] = vals[7];
            if (cc) {
              cc[w * 2] = vals[8];
              cc[w * 2 + 1] = vals[9];
            }
          }
          for (const e of ex) {
            const A = g.getAttribute(e.n);
            for (let c = 0; c < e.size; c++) e.arr[w * e.size + c] = A.getComponent(i, c);
          }
        }
        const ic = I ? I.count : n;
        if (b.lines) {
          for (let j = 0; j < ic; j++) index[io++] = vo + (I ? I.getX(j) : j);
        } else {
          for (let j = 0; j + 2 < ic; j += 3) {
            const a = I ? I.getX(j) : j;
            const b1 = I ? I.getX(j + 1) : j + 1;
            const c1 = I ? I.getX(j + 2) : j + 2;
            index[io++] = vo + a;
            index[io++] = vo + (flip ? c1 : b1);
            index[io++] = vo + (flip ? b1 : c1);
          }
        }
        vo += n;
      }
      if (b.pack) {
        let s = sources.get(src);
        if (!s) sources.set(src, (s = { mat: src, ranges: [], snap: vals.slice(0, b.pack === 'basic' ? 3 : 10) }));
        s.ranges.push([startV, vo - startV]);
        packedSources.add(src);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (nor) g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (colArr) g.setAttribute('color', new THREE.BufferAttribute(colArr, cs));
    if (rm) g.setAttribute('packRM', new THREE.BufferAttribute(rm, 2));
    if (em) g.setAttribute('packE', new THREE.BufferAttribute(em, 3));
    if (cc) g.setAttribute('packCC', new THREE.BufferAttribute(cc, 2));
    for (const e of ex) g.setAttribute(e.n, new THREE.BufferAttribute(e.arr, e.size));
    g.setIndex(new THREE.BufferAttribute(io === index.length ? index : index.subarray(0, io), 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    const p = b.proto as THREE.Mesh;
    const out = b.lines ? new THREE.LineSegments(g, b.material) : new THREE.Mesh(g, b.material);
    out.name = `${prefix}:${b.pack ? 'packed' : b.material.name || b.material.type}`;
    out.castShadow = b.items.some((it) => it.obj.castShadow);
    out.receiveShadow = b.items.some((it) => it.obj.receiveShadow);
    out.renderOrder = p.renderOrder;
    out.layers.mask = p.layers.mask;
    out.frustumCulled = p.frustumCulled;
    out.userData.mergedFrom = b.items.length;
    if (b.pack && base) out.onBeforeRender = liveUpdate(g, b.pack, base, [...sources.values()]);
    root.add(out);
    meshes.push(out);
    for (const it of b.items) {
      const ob = it.obj;
      // former parents (between the original and root) are watched in dev: hiding or moving them now does nothing
      for (let q = ob.parent; q && q !== root; q = q.parent) formerParents.add(q);
      if (import.meta.env.DEV) labels.set(ob, describe(ob));
      ob.updateMatrixWorld(true);
      ob.removeFromParent();
      // a detached original keeps answering world queries correctly (getWorldPosition & co.)
      ob.matrixAutoUpdate = false;
      ob.matrix.copy(ob.matrixWorld);
      originals.push(ob);
      merged++;
    }
  }

  const frozen: THREE.Object3D[] = [];
  if (o.freeze !== false) {
    const keptSet = new Set(kept);
    const mine = new Set(meshes);
    const freeze = (obj: THREE.Object3D): void => {
      if (keptSet.has(obj) || !obj.visible) return;
      // troika text (billboards turn every frame) and self-animating meshes keep their matrices live
      const geo = (obj as THREE.Mesh).geometry as THREE.InstancedBufferGeometry | undefined;
      if (geo?.isInstancedBufferGeometry || (!mine.has(obj) && obj.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender)) return;
      if (obj.matrixAutoUpdate) {
        if (import.meta.env.DEV) labels.set(obj, describe(obj));
        obj.matrixAutoUpdate = false;
        obj.updateMatrix();
        frozen.push(obj);
      }
      for (const c of obj.children) freeze(c);
    };
    for (const c of root.children) freeze(c);
    root.updateMatrixWorld(true);
  }
  if (import.meta.env.DEV) for (const q of formerParents) labels.set(q, describe(q));
  return { before, after: countDraws(root), merged, meshes, originals, formerParents: [...formerParents], frozen, packedSources: [...packedSources], labels, ms: performance.now() - t0 };
}

const r4 = (x: number): string => x.toFixed(4);
const transformOf = (o: THREE.Object3D): string => [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()].map(r4).join(',');
function fullOf(o: THREE.Object3D): string {
  const inst = o as THREE.InstancedMesh;
  const m = (o as THREE.Mesh).material as THREE.Material | undefined;
  return [o.visible ? 1 : 0, transformOf(o), m && !Array.isArray(m) ? m.uuid : '', inst.isInstancedMesh ? `${inst.count}/${inst.instanceMatrix.version}/${inst.instanceColor?.version ?? 0}` : ''].join('|');
}

/**
 * Dev check: warns once per object when zone code later changes what mergeStatic baked — a merged
 * original (moved, hidden, new material, instance updates), a former parent of one (moved or
 * hidden), a frozen node (moved) or a packed material (hidden, faded, side changed; its colour and
 * PBR values follow live). Such objects belong in `keep`.
 */
export function watchMerged(
  zoneId: string,
  r: { originals: THREE.Object3D[]; formerParents: THREE.Object3D[]; frozen: THREE.Object3D[]; packedSources: THREE.Material[]; labels: Map<THREE.Object3D, string> },
  every: (seconds: number, fn: () => void) => () => void,
): () => void {
  type Watched = THREE.Object3D | THREE.Material;
  type Check = [Watched, (o: Watched) => string, string];
  const matOf = (q: Watched): string => {
    const m = q as THREE.Material;
    return [m.visible, m.transparent, m.opacity, m.side].join(',');
  };
  const checks: Check[] = [
    ...r.packedSources.map((m): Check => [m, matOf, 'packed material']),
    ...r.originals.map((o): Check => [o, (q) => fullOf(q as THREE.Object3D), 'merged mesh']),
    ...r.formerParents.map((o): Check => [o, (q) => `${(q as THREE.Object3D).visible ? 1 : 0}|${transformOf(q as THREE.Object3D)}`, 'parent of merged meshes']),
    ...r.frozen.map((o): Check => [o, (q) => transformOf(q as THREE.Object3D), 'frozen node']),
  ];
  const snap = checks.map(([o, f]) => f(o));
  const warned = new Set<number>();
  return every(2, () => {
    for (let i = 0; i < checks.length; i++) {
      if (warned.has(i)) continue;
      const [o, f, what] = checks[i];
      if (f(o) !== snap[i]) {
        warned.add(i);
        const label = (o as THREE.Object3D).isObject3D ? (r.labels.get(o as THREE.Object3D) ?? o.name) : o.name || o.type;
        console.warn(`[zone ${zoneId}] mergeStatic: ${what} ${label} changed after the merge — put it in \`keep\` (or set userData.noPack on the material)`);
      }
    }
  });
}
