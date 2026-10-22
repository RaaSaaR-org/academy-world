// URDF (or expanded xacro) → robot description (see lib/model.mjs for the shape).
import path from 'node:path';
import * as THREE from 'three';
import { children, child, nums, num } from './xml.mjs';
import { urdfOrigin } from './math.mjs';
import { resolveMeshPath } from './paths.mjs';

const originOf = (el) => {
  const o = el && child(el, 'origin');
  return { xyz: nums(o?.attrs.xyz, [0, 0, 0]), rpy: nums(o?.attrs.rpy, [0, 0, 0]) };
};

/**
 * @param {import('./xml.mjs').El} robot <robot> element
 * @param {{ root: string, file: string }} src root: checkout folder (confinement), file: the URDF
 */
export function readUrdf(robot, src) {
  const baseDir = path.dirname(src.file);
  const named = new Map();
  for (const m of children(robot, 'material')) {
    const c = child(m, 'color');
    if (c?.attrs.rgba) named.set(m.attrs.name, nums(c.attrs.rgba));
  }
  const links = new Map();
  for (const l of children(robot, 'link')) {
    const visuals = [];
    for (const v of children(l, 'visual')) {
      const o = originOf(v);
      const g = child(v, 'geometry');
      if (!g) continue;
      const mat = child(v, 'material');
      let color = null;
      if (mat) {
        const c = child(mat, 'color');
        color = c?.attrs.rgba ? nums(c.attrs.rgba) : named.get(mat.attrs.name) ?? null;
      }
      const vis = { origin: urdfOrigin(o.xyz, o.rpy), color, name: v.attrs.name ?? null };
      const mesh = child(g, 'mesh');
      const box = child(g, 'box');
      const cyl = child(g, 'cylinder');
      const sph = child(g, 'sphere');
      if (mesh) {
        vis.mesh = { file: resolveMeshPath(src.root, baseDir, mesh.attrs.filename), ref: mesh.attrs.filename, scale: nums(mesh.attrs.scale, [1, 1, 1]) };
      } else if (box) vis.prim = { type: 'box', size: nums(box.attrs.size) };
      else if (cyl) vis.prim = { type: 'cylinder', radius: num(cyl.attrs.radius), length: num(cyl.attrs.length) };
      else if (sph) vis.prim = { type: 'sphere', radius: num(sph.attrs.radius) };
      else continue;
      visuals.push(vis);
    }
    const inertial = child(l, 'inertial');
    const mass = inertial ? num(child(inertial, 'mass')?.attrs.value) : null;
    // centre of mass in the link frame (the inertial origin's rpy only turns the inertia tensor)
    const com = inertial ? nums(child(inertial, 'origin')?.attrs.xyz, [0, 0, 0]) : null;
    links.set(l.attrs.name, { name: l.attrs.name, visuals, mass, com });
  }
  const joints = [];
  for (const j of children(robot, 'joint')) {
    const o = originOf(j);
    const lim = child(j, 'limit');
    const mim = child(j, 'mimic');
    const type = j.attrs.type;
    joints.push({
      name: j.attrs.name,
      type: type === 'floating' || type === 'planar' ? 'fixed' : type,
      parent: child(j, 'parent').attrs.link,
      child: child(j, 'child').attrs.link,
      origin: urdfOrigin(o.xyz, o.rpy),
      originXyzRpy: o,
      axis: normAxis(nums(child(j, 'axis')?.attrs.xyz, [1, 0, 0])),
      limit:
        type === 'continuous' || !lim
          ? type === 'continuous'
            ? { lower: null, upper: null, effort: num(lim?.attrs.effort), velocity: num(lim?.attrs.velocity) }
            : null
          : { lower: num(lim.attrs.lower, 0), upper: num(lim.attrs.upper, 0), effort: num(lim.attrs.effort), velocity: num(lim.attrs.velocity) },
      mimic: mim ? { joint: mim.attrs.joint, multiplier: num(mim.attrs.multiplier, 1), offset: num(mim.attrs.offset, 0) } : null,
      ref: 0,
    });
  }
  return { format: 'urdf', name: robot.attrs.name ?? 'robot', links, joints, poses: {}, couplings: [] };
}

function normAxis(a) {
  const v = new THREE.Vector3(...a);
  if (v.lengthSq() < 1e-12) return [1, 0, 0];
  v.normalize();
  return [v.x, v.y, v.z];
}
