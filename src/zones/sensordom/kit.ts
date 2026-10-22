/**
 * Shared building kit: every static piece is (1) merged per material + visor class into few draw
 * calls, (2) registered with the visor (render modes), (3) given a collider in the shared world
 * (player) and/or in the private sensor world (LiDAR / sonar / probe).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ZoneContext } from '@/core/zones';
import { SEG_COLORS, type Visor, type SegClass, type DepthKind } from './visor';
import { G_SOLID, type Lidar, type SurfaceInfo } from './lidar';
import { metreUv, rbox } from './look';

export type V3 = [number, number, number];

export interface PieceOpts {
  mat: THREE.Material;
  seg: SegClass;
  depth?: DepthKind;
  lidarVis?: 'occlude' | 'hide';
  group?: 'detail' | 'exterior';
  castShadow?: boolean;
  /** separate bucket (e.g. a mesh that needs its own material swaps later) */
  key?: string;
}

export interface BoxOpts extends PieceOpts {
  size: V3;
  pos: V3;
  rot?: V3;
  /** shared physics world: solid for the player (default), 'glass' = sensor-ignore, false = none */
  collide?: 'solid' | 'glass' | false;
  /** sensor world group (G_SOLID default), false = invisible to sensors */
  ray?: number | false;
  info?: Partial<SurfaceInfo>;
  /** rounded edges (ART-V2 §2.5): true = radius rule, number = radius */
  round?: boolean | number;
  /** metre UVs (panel normal maps), tile size in m */
  uvTile?: number;
}

interface Bucket {
  geos: THREE.BufferGeometry[];
  o: PieceOpts;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);
const _t = new THREE.Vector3();

/** keep position/normal/uv only, non-indexed — so anything can be merged */
export function normalizeGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let out = g.index ? g.toNonIndexed() : g;
  if (out === g) out = g.clone();
  for (const name of Object.keys(out.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  if (!out.getAttribute('uv')) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.getAttribute('position').count * 2), 2));
  return out;
}

export function placed(g: THREE.BufferGeometry, pos: V3, rot?: V3, scale?: V3): THREE.BufferGeometry {
  _e.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0);
  _q.setFromEuler(_e);
  _t.set(pos[0], pos[1], pos[2]);
  if (scale) _s.set(scale[0], scale[1], scale[2]);
  else _s.set(1, 1, 1);
  _m.compose(_t, _q, _s);
  g.applyMatrix4(_m);
  return g;
}

export class Builder {
  private buckets = new Map<string, Bucket>();
  readonly meshes: THREE.Mesh[] = [];

  constructor(
    readonly ctx: ZoneContext,
    readonly visor: Visor,
    readonly lidar: Lidar,
  ) {}

  /** class and depth behaviour travel per vertex, so buckets only split by material/tier/shadow */
  private bucketKey(o: PieceOpts): string {
    return [o.group ?? 'detail', o.mat.uuid, o.lidarVis ?? 'occlude', o.castShadow ? 1 : 0, o.key ?? ''].join('|');
  }

  /** add a geometry (already in zone-local coordinates) to a merge bucket */
  geo(g: THREE.BufferGeometry, o: PieceOpts): void {
    const k = this.bucketKey(o);
    let b = this.buckets.get(k);
    if (!b) this.buckets.set(k, (b = { geos: [], o }));
    const n = normalizeGeo(g);
    const count = n.getAttribute('position').count;
    const col = new THREE.Color(o.seg === 'unsichtbar' ? SEG_COLORS.unbekannt : SEG_COLORS[o.seg]);
    const seg = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) seg.set([col.r, col.g, col.b], i * 3);
    const dk = o.depth === 'none' ? 1 : o.depth === 'mirror' ? 2 : 0;
    n.setAttribute('aSeg', new THREE.BufferAttribute(seg, 3));
    n.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(count).fill(dk), 1));
    b.geos.push(n);
  }

  /** a box: visual (merged) + colliders */
  box(o: BoxOpts): void {
    const base = o.round ? rbox(o.size[0], o.size[1], o.size[2], typeof o.round === 'number' ? o.round : undefined) : new THREE.BoxGeometry(o.size[0], o.size[1], o.size[2]);
    let g = placed(base, o.pos, o.rot);
    if (o.uvTile) g = metreUv(g, o.uvTile);
    this.geo(g, o);
    this.collider(o);
  }

  /** colliders only (no visual) */
  collider(o: Omit<BoxOpts, keyof PieceOpts> & Partial<PieceOpts>): void {
    const collide = o.collide ?? 'solid';
    if (collide === 'solid') this.ctx.physics.addStaticBox({ size: o.size, position: o.pos, rotation: o.rot, surface: 'metal' });
    else if (collide === 'glass') this.ctx.physics.addStaticBoxSensorIgnore({ size: o.size, position: o.pos, rotation: o.rot, surface: 'glass' });
    const ray = o.ray ?? G_SOLID;
    if (ray !== false) this.lidar.addBox(o.size, o.pos, o.rot ?? null, ray, { seg: o.seg ?? 'struktur', depth: o.depth ?? 'normal', ...o.info });
  }

  /** a standalone (not merged) mesh, registered with the visor */
  mesh(g: THREE.BufferGeometry, o: PieceOpts, parent?: THREE.Object3D, attr = false): THREE.Mesh {
    const m = new THREE.Mesh(g, o.mat);
    m.castShadow = !!o.castShadow;
    m.receiveShadow = true;
    (parent ?? this.ctx.groups[o.group ?? 'detail']).add(m);
    this.visor.register(m, attr ? { seg: 'attr', depth: 'attr', lidar: o.lidarVis } : { seg: o.seg, depth: o.depth, lidar: o.lidarVis });
    this.meshes.push(m);
    return m;
  }

  /** merge all buckets into meshes (one draw call each) */
  finalize(): void {
    for (const b of this.buckets.values()) {
      if (!b.geos.length) continue;
      const merged = mergeGeometries(b.geos, false);
      for (const g of b.geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      this.mesh(merged, b.o, undefined, true);
    }
    this.buckets.clear();
  }
}
