/**
 * The region's materials (plan §2.7, §5.5 programs): every static part of the Revier is merged into WP3's
 * ground program (GroundMaterial: vertex colour, roughness, metalness, grain and the baked analytic sun per
 * vertex, so the Kreislaufhof sits in the cloud bank's shade like the land around it). Reusing that program
 * means the region links no new shader when its chunk arrives. The few lit things (the hall's warm door,
 * the weather mast's teal tip) use the brand's light material, which the dock already compiled.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { GroundBatch, GroundMaterial, mat4, type PartStyle } from '../ground/material';
import { R } from './tuning';

export { GroundBatch, mat4 };
export type { PartStyle };

export interface RegionLook {
  /** the ground program (non-instanced and instanced meshes share it with the dock and the far ring) */
  readonly mat: GroundMaterial;
  /** warm work light (doors, windows): the brand light material */
  readonly warm: THREE.Material;
  /** teal = data (rule 6): sensor tips */
  readonly teal: THREE.Material;
  /** a style shorthand: colour token + roughness/metalness/grain */
  s(color: number, rough?: number, metal?: number, grain?: number): PartStyle;
  /** terrain height at h = 0 */
  y(x: number, z: number): number;
}

export function createLook(ctx: ZoneContext, heightAt: (x: number, z: number) => number): RegionLook {
  const mat = new GroundMaterial();
  ctx.onDispose(() => mat.dispose());
  return {
    mat,
    warm: ctx.materials.light(R.color.warm, 'line'),
    teal: ctx.materials.light(R.color.teal, 'line'),
    s: (color, rough = 0.85, metal = 0, grain = 0) => ({ color, rough, metal, grain }),
    y: heightAt,
  };
}

/** Build a batch into the parent (one draw), or nothing when empty. */
export function place(parent: THREE.Object3D, b: GroundBatch, look: RegionLook, name: string, o: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh | null {
  const m = b.build(look.mat, name, o);
  if (m) parent.add(m);
  return m;
}

/** An instanced mesh of one batch-built template (the ground program's instanced variant, compiled by the far ring). */
export function instanced(template: GroundBatch, look: RegionLook, name: string, count: number, o: { cast?: boolean } = {}): THREE.InstancedMesh {
  const tmp = template.build(look.mat, `${name}:tmp`)!;
  const mesh = new THREE.InstancedMesh(tmp.geometry, look.mat, count);
  mesh.name = name;
  mesh.castShadow = o.cast ?? false;
  mesh.receiveShadow = true;
  return mesh;
}

/** world matrix of a part in a local frame (origin, yaw in radians) */
export function frame(ox: number, oy: number, oz: number, yaw: number): (m: THREE.Matrix4) => THREE.Matrix4 {
  const f = new THREE.Matrix4().compose(new THREE.Vector3(ox, oy, oz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
  return (m) => f.clone().multiply(m);
}

/** A beam between two local points (box w × h), as a matrix + unit box. */
export function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h = w): { geo: THREE.BufferGeometry; m: THREE.Matrix4 } {
  const len = a.distanceTo(b);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return { geo: BOX, m: new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(w, len, h)) };
}

/** shared unit templates (GroundBatch copies them) */
export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1);
export const CYL6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1);
export const ICO = new THREE.IcosahedronGeometry(1, 0);
export const ROOF = new THREE.CylinderGeometry(0.72, 0.72, 1, 3, 1).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);

/** a deterministic PRNG (mulberry32) */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEG = Math.PI / 180;
/** three's rotation.y for a plot facing (degrees) */
export const yawOf = (deg: number): number => deg * DEG;
/** a box part from its centre, size and yaw */
export const box = (x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0): THREE.Matrix4 => mat4(x, y, z, yaw, w, h, d);
