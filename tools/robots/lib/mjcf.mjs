// MJCF (MuJoCo XML) → robot description. Covers what the pinned Menagerie models use: <include>,
// <default> classes with childclass inheritance, <frame>, all orientation forms, mesh / texture /
// material assets, geom primitives incl. fromto, hinge and slide joints with pos, ref and range,
// keyframes and joint equality couplings. Each body becomes a link; a body's joints become a short
// chain of link frames, so the body frame equals MuJoCo's xpos / xquat for every joint value.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { readXml, children, child, nums, num } from './xml.mjs';
import { mjOrientation, compose, translation } from './math.mjs';
import { confine } from './paths.mjs';

/** Inline <include file=…> recursively (paths relative to the including file, inside the checkout). */
function inlineIncludes(el, dir, root, depth = 0) {
  if (depth > 8) throw new Error('MJCF include depth > 8');
  const out = [];
  for (const c of el.children) {
    if (c.tag === 'include') {
      const f = confine(root, path.resolve(dir, c.attrs.file));
      const inc = readXml(f);
      inlineIncludes(inc, path.dirname(f), root, depth + 1);
      out.push(...inc.children);
    } else {
      inlineIncludes(c, dir, root, depth);
      out.push(c);
    }
  }
  el.children = out;
  return el;
}

/**
 * @param {string} file the model XML
 * @param {{ root: string, visual: (geom: object) => boolean }} o visual: which resolved geoms are drawn
 */
export function readMjcf(file, o) {
  const doc = inlineIncludes(readXml(file), path.dirname(file), o.root);
  // several <compiler>/<asset>/<default>/<worldbody> sections may exist after includes
  const compilerAttrs = Object.assign({}, ...children(doc, 'compiler').map((c) => c.attrs));
  const angleScale = (compilerAttrs.angle ?? 'degree') === 'radian' ? 1 : Math.PI / 180;
  const eulerseq = compilerAttrs.eulerseq ?? 'xyz';
  const autolimits = (compilerAttrs.autolimits ?? 'true') === 'true';
  const modelDir = path.dirname(file);
  const assetDir = compilerAttrs.assetdir ?? '';
  const meshDir = path.resolve(modelDir, compilerAttrs.meshdir ?? assetDir);
  const texDir = path.resolve(modelDir, compilerAttrs.texturedir ?? assetDir);

  // ── defaults: class → { parent, tag → attrs } ──
  const classes = new Map();
  const walkDefaults = (el, parent) => {
    const name = el.attrs.class ?? 'main';
    const entry = { parent, tags: new Map() };
    classes.set(name, entry);
    for (const c of el.children) {
      if (c.tag === 'default') walkDefaults(c, name);
      else entry.tags.set(c.tag, { ...(entry.tags.get(c.tag) ?? {}), ...c.attrs });
    }
  };
  for (const d of children(doc, 'default')) walkDefaults(d, null);
  const defaultsFor = (tag, cls) => {
    const chain = [];
    for (let c = cls; c; c = classes.get(c)?.parent ?? null) {
      if (!classes.has(c)) throw new Error(`MJCF: unknown default class "${c}"`);
      chain.unshift(c);
    }
    if (chain[0] !== 'main' && classes.has('main')) chain.unshift('main');
    return Object.assign({}, ...chain.map((c) => classes.get(c).tags.get(tag) ?? {}));
  };
  const resolve = (el, childclass) => {
    const cls = el.attrs.class ?? childclass ?? 'main';
    return { ...defaultsFor(el.tag, classes.has(cls) ? cls : 'main'), ...el.attrs };
  };

  // ── assets ──
  const meshes = new Map();
  const textures = new Map();
  const materials = new Map();
  for (const a of children(doc, 'asset')) {
    for (const c of a.children) {
      const at = resolve(c, null);
      if (c.tag === 'mesh') {
        if (!at.file) continue;
        const name = at.name ?? path.basename(at.file).replace(/\.[^.]+$/, '');
        if (at.refpos || at.refquat) console.warn(`[mjcf] mesh ${name}: refpos/refquat ignored`);
        meshes.set(name, { file: confine(o.root, path.resolve(meshDir, at.file)), scale: nums(at.scale, [1, 1, 1]) });
      } else if (c.tag === 'texture') {
        if (!at.file) continue; // builtin (checker, gradient): only used by floors and skyboxes
        const name = at.name ?? path.basename(at.file).replace(/\.[^.]+$/, '');
        textures.set(name, { file: confine(o.root, path.resolve(texDir, at.file)), type: at.type ?? 'cube' });
      } else if (c.tag === 'material') {
        materials.set(at.name, { rgba: nums(at.rgba, [1, 1, 1, 1]), texture: at.texture ?? null });
      }
    }
  }

  // ── bodies ──
  const links = new Map();
  const joints = [];
  const qposOrder = []; // [jointName | null (free/ball slots), width]
  const geomRows = [];
  let anon = 0;

  const geomMatrix = (at) => {
    if (at.fromto !== undefined && ['capsule', 'cylinder', 'box', 'ellipsoid'].includes(at.type ?? 'sphere')) {
      const f = nums(at.fromto);
      const a = new THREE.Vector3(f[0], f[1], f[2]);
      const b = new THREE.Vector3(f[3], f[4], f[5]);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const dir = b.clone().sub(a);
      const q = dir.lengthSq() > 0 ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize()) : new THREE.Quaternion();
      return { m: compose(mid.toArray(), q), halfLength: dir.length() / 2 };
    }
    return { m: compose(nums(at.pos, [0, 0, 0]), mjOrientation(at, angleScale, eulerseq)), halfLength: null };
  };

  const addGeom = (linkName, el, frameM, childclass) => {
    const at = resolve(el, childclass);
    const type = at.type ?? 'sphere';
    const group = num(at.group, 0);
    const contype = num(at.contype, 1);
    const conaffinity = num(at.conaffinity, 1);
    const mat = at.material ? materials.get(at.material) : null;
    let rgba = nums(at.rgba, null);
    // MuJoCo: the material colour applies unless the geom sets its own (non-default) rgba
    const isDefaultRgba = !rgba || (rgba[0] === 0.5 && rgba[1] === 0.5 && rgba[2] === 0.5 && rgba[3] === 1);
    if (mat && isDefaultRgba) rgba = mat.rgba;
    rgba = rgba ?? [0.5, 0.5, 0.5, 1];
    const g = { link: linkName, name: at.name ?? null, type, group, contype, conaffinity, cls: el.attrs.class ?? childclass ?? 'main', material: at.material ?? null, mesh: at.mesh ?? null };
    geomRows.push(g);
    if (!o.visual(g)) return;
    if (rgba[3] === 0) return; // invisible helper geom
    const { m, halfLength } = geomMatrix(at);
    const vis = { origin: frameM.clone().multiply(m), color: rgba, name: g.name, material: at.material ?? null, mjGeom: g };
    const size = nums(at.size, [0.005, 0.005, 0.005]);
    if (type === 'mesh') {
      const ma = meshes.get(at.mesh);
      if (!ma) throw new Error(`MJCF: geom references unknown mesh "${at.mesh}"`);
      vis.mesh = { file: ma.file, ref: at.mesh, scale: ma.scale };
      if (mat?.texture) {
        const tx = textures.get(mat.texture);
        if (tx && tx.type === '2d') vis.texture = tx.file;
      }
    } else if (type === 'box') vis.prim = { type: 'box', size: [size[0] * 2, size[1] * 2, size[2] * 2] };
    else if (type === 'sphere') vis.prim = { type: 'sphere', radius: size[0] };
    else if (type === 'cylinder') vis.prim = { type: 'cylinder', radius: size[0], length: 2 * (halfLength ?? size[1]) };
    else if (type === 'capsule') vis.prim = { type: 'capsule', radius: size[0], length: 2 * (halfLength ?? size[1]) };
    else if (type === 'ellipsoid') vis.prim = { type: 'ellipsoid', radii: size.slice(0, 3) };
    else return; // plane, hfield, sdf: not part of a robot's look
    links.get(linkName).visuals.push(vis);
  };

  const walkBody = (el, parentLink, parentM, childclass, frameM) => {
    // frameM: transform of enclosing <frame> elements, relative to the parent body
    const at = resolve(el, childclass);
    const name = el.attrs.name ?? `body_${anon++}`;
    const cc = el.attrs.childclass ?? childclass;
    const local = frameM.clone().multiply(compose(nums(at.pos, [0, 0, 0]), mjOrientation(at, angleScale, eulerseq)));
    const jointEls = el.children.filter((c) => c.tag === 'joint' || c.tag === 'freejoint');
    let cur = parentLink;
    let curM = local;
    const moving = [];
    for (const j of jointEls) {
      const ja = j.tag === 'freejoint' ? { type: 'free' } : resolve(j, cc);
      const type = ja.type ?? 'hinge';
      const jname = j.attrs.name ?? `${name}_joint${moving.length}`;
      if (type === 'free') {
        qposOrder.push([null, 7]);
        continue;
      }
      if (type === 'ball') {
        qposOrder.push([null, 4]);
        console.warn(`[mjcf] ball joint ${jname}: kept rigid`);
        continue;
      }
      moving.push({ ja, jname, type });
      qposOrder.push([jname, 1]);
    }
    if (parentLink === null) {
      // the root body: no parent joint; joints on it (other than free) are not expected
      links.set(name, { name, visuals: [], mass: null, rootMatrix: local });
      if (moving.length) console.warn(`[mjcf] root body ${name} has joints; ignored`);
    } else if (!moving.length) {
      links.set(name, { name, visuals: [], mass: null });
      joints.push({ name: `${name}__fixed`, type: 'fixed', parent: parentLink, child: name, origin: curM, axis: [1, 0, 0], limit: null, mimic: null, ref: 0, generated: true });
    } else {
      for (let k = 0; k < moving.length; k++) {
        const { ja, jname, type } = moving[k];
        const pos = nums(ja.pos, [0, 0, 0]);
        const hasPos = pos.some((v) => Math.abs(v) > 1e-12);
        const last = k === moving.length - 1;
        const jointLink = last && !hasPos ? name : `${name}#${jname}`;
        links.set(jointLink, { name: jointLink, visuals: [], mass: null, frameOnly: jointLink !== name });
        const range = nums(ja.range, null);
        const limitedAttr = ja.limited ?? 'auto';
        const limited = limitedAttr === 'true' || (limitedAttr === 'auto' && autolimits && range !== null);
        const scale = type === 'hinge' ? angleScale : 1;
        const axis = new THREE.Vector3(...nums(ja.axis, [0, 0, 1])).normalize();
        joints.push({
          name: jname,
          type: type === 'hinge' ? (limited ? 'revolute' : 'continuous') : 'prismatic',
          parent: cur,
          child: jointLink,
          origin: curM.clone().multiply(translation(...pos)),
          axis: [axis.x, axis.y, axis.z],
          limit: limited && range ? { lower: range[0] * scale, upper: range[1] * scale, effort: null, velocity: null } : type === 'slide' ? null : { lower: null, upper: null, effort: null, velocity: null },
          mimic: null,
          ref: num(ja.ref, 0) * scale,
        });
        cur = jointLink;
        curM = new THREE.Matrix4();
        if (hasPos) {
          // undo the anchor offset so the next frame is the body frame again (MuJoCo: off-centre rotation)
          const nextName = last ? name : `${name}#${jname}#out`;
          links.set(nextName, { name: nextName, visuals: [], mass: null, frameOnly: nextName !== name });
          joints.push({ name: `${nextName}__fixed`, type: 'fixed', parent: cur, child: nextName, origin: translation(-pos[0], -pos[1], -pos[2]), axis: [1, 0, 0], limit: null, mimic: null, ref: 0, generated: true });
          cur = nextName;
        }
      }
    }
    const inertial = child(el, 'inertial');
    if (inertial) {
      // MJCF <inertial pos> is in the body frame; mass from the attribute (inertiafromgeom models have none)
      links.get(name).mass = num(inertial.attrs.mass);
      links.get(name).com = nums(inertial.attrs.pos, [0, 0, 0]);
    }
    walkContent(el, name, cc, new THREE.Matrix4());
  };

  const walkContent = (el, linkName, cc, frameM) => {
    for (const c of el.children) {
      if (c.tag === 'geom') addGeom(linkName, c, frameM, cc);
      else if (c.tag === 'body') walkBody(c, linkName, null, cc, frameM);
      else if (c.tag === 'site' && c.attrs.name) {
        // sites are attach and IK points (tool flanges, grasp points): kept as frame-only links
        const sa = resolve(c, cc);
        const sname = links.has(c.attrs.name) ? `site:${c.attrs.name}` : c.attrs.name;
        links.set(sname, { name: sname, visuals: [], mass: null, frameOnly: true, site: true });
        joints.push({ name: `${sname}__fixed`, type: 'fixed', parent: linkName, child: sname, origin: frameM.clone().multiply(compose(nums(sa.pos, [0, 0, 0]), mjOrientation(sa, angleScale, eulerseq))), axis: [1, 0, 0], limit: null, mimic: null, ref: 0, generated: true });
      }
      else if (c.tag === 'frame') {
        const fa = resolve(c, cc);
        const fm = frameM.clone().multiply(compose(nums(fa.pos, [0, 0, 0]), mjOrientation(fa, angleScale, eulerseq)));
        walkContent(c, linkName, c.attrs.childclass ?? cc, fm);
      }
    }
  };

  // worldbody: the first top-level body is the robot; geoms on the world are scenery
  const world = children(doc, 'worldbody');
  const tops = world.flatMap((w) => w.children.filter((c) => c.tag === 'body' || c.tag === 'frame'));
  const bodies = [];
  const collectTop = (list, fm, cc) => {
    for (const c of list) {
      if (c.tag === 'body') bodies.push({ el: c, fm, cc });
      else if (c.tag === 'frame') {
        const fa = resolve(c, cc);
        collectTop(c.children, fm.clone().multiply(compose(nums(fa.pos, [0, 0, 0]), mjOrientation(fa, angleScale, eulerseq))), c.attrs.childclass ?? cc);
      }
    }
  };
  collectTop(tops, new THREE.Matrix4(), undefined);
  if (!bodies.length) throw new Error('MJCF: no body in worldbody');
  if (bodies.length > 1) console.warn(`[mjcf] ${bodies.length} top-level bodies; using "${bodies[0].el.attrs.name}" and its subtree`);
  walkBody(bodies[0].el, null, null, bodies[0].cc, bodies[0].fm);

  // ── keyframes → named poses ──
  const poses = {};
  for (const kf of children(doc, 'keyframe')) {
    for (const k of children(kf, 'key')) {
      const q = nums(k.attrs.qpos, null);
      if (!q) continue;
      const pose = {};
      let i = 0;
      for (const [jn, w] of qposOrder) {
        if (jn && i < q.length) pose[jn] = q[i];
        i += w;
      }
      poses[k.attrs.name ?? `key${Object.keys(poses).length}`] = pose;
    }
  }

  // ── joint equality couplings: joint1 = c0 + c1 · joint2 (higher terms must be 0) ──
  const couplings = [];
  for (const eq of children(doc, 'equality')) {
    for (const e of children(eq, 'joint')) {
      const at = resolve(e, null);
      const c = nums(at.polycoef, [0, 1, 0, 0, 0]);
      if (!at.joint2) continue;
      if (c.slice(2).some((v) => Math.abs(v) > 1e-9)) {
        console.warn(`[mjcf] equality ${at.joint1}~${at.joint2}: non-linear polycoef ignored`);
        continue;
      }
      couplings.push({ joint: at.joint1, master: at.joint2, multiplier: c[1], offset: c[0] });
    }
  }
  for (const cp of couplings) {
    const j = joints.find((x) => x.name === cp.joint);
    if (j && !j.mimic) j.mimic = { joint: cp.master, multiplier: cp.multiplier, offset: cp.offset };
  }

  return { format: 'mjcf', name: doc.attrs.model ?? path.basename(file, '.xml'), links, joints, poses, couplings, geomRows, rootLink: bodies[0].el.attrs.name };
}

/** Default visual filter for Menagerie models: drawn geoms are group 2, or non-colliding meshes. */
export function menagerieVisual(g) {
  if (g.group === 2) return true;
  if (g.group === 3) return false;
  return g.contype === 0 && g.conaffinity === 0;
}

export function fileExists(f) {
  return fs.existsSync(f);
}
