// Mesh readers: STL (binary / ASCII), OBJ (+ MTL colours), COLLADA (.dae, with node transforms,
// <unit>, per-material colours and textures). Output: a list of parts, each a non-indexed
// triangle soup in metres (before the visual's own scale):
//   { positions: Float32Array (9 per triangle), uvs: Float32Array | null (6 per triangle),
//     color: [r, g, b, a] (sRGB, from the file) | null, texture: absolute path | null, name }
// Files are read as data; a texture path must stay inside the checkout.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { parseXml, children, child, find, findAll, nums } from './xml.mjs';
import { confine } from './paths.mjs';

const cache = new Map();

/** Read a mesh file once (cached by absolute path). */
export function readMesh(file, root) {
  let r = cache.get(file);
  if (!r) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.stl') r = readStl(file);
    else if (ext === '.obj') r = readObj(file, root);
    else if (ext === '.dae') r = readDae(file, root);
    else throw new Error(`unsupported mesh format: ${file}`);
    cache.set(file, r);
  }
  return r;
}

// ── STL ─────────────────────────────────────────────────────────────────────

function readStl(file) {
  const buf = fs.readFileSync(file);
  const n = buf.length >= 84 ? buf.readUInt32LE(80) : 0;
  const binary = buf.length === 84 + n * 50 || (buf.length >= 84 + n * 50 && !/^\s*solid[\s\S]*facet/.test(buf.subarray(0, 512).toString('latin1')));
  if (binary) {
    const pos = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;
      for (let k = 0; k < 9; k++) pos[i * 9 + k] = buf.readFloatLE(o + k * 4);
    }
    return [{ positions: pos, uvs: null, color: null, texture: null, name: path.basename(file) }];
  }
  const txt = buf.toString('latin1');
  const vs = [];
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
  for (let m = re.exec(txt); m; m = re.exec(txt)) vs.push(+m[1], +m[2], +m[3]);
  return [{ positions: new Float32Array(vs.length - (vs.length % 9)).map((_, i) => vs[i]), uvs: null, color: null, texture: null, name: path.basename(file) }];
}

// ── OBJ ─────────────────────────────────────────────────────────────────────

function readMtl(file, root) {
  const out = new Map();
  if (!fs.existsSync(file)) return out;
  let cur = null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'newmtl') out.set((cur = t.slice(1).join(' ')), { color: null, texture: null });
    else if (cur && t[0] === 'Kd') out.get(cur).color = [+t[1], +t[2], +t[3], 1];
    else if (cur && t[0] === 'd') out.get(cur).alpha = +t[1];
    else if (cur && t[0] === 'map_Kd') {
      try {
        out.get(cur).texture = confine(root, path.resolve(path.dirname(file), t[t.length - 1]));
      } catch {
        /* a texture outside the checkout is ignored */
      }
    }
  }
  for (const m of out.values()) if (m.color && m.alpha !== undefined) m.color[3] = m.alpha;
  return out;
}

function readObj(file, root) {
  const txt = fs.readFileSync(file, 'utf8');
  const v = [];
  const vt = [];
  const groups = new Map(); // material → { pos: [], uv: [] }
  let mtl = new Map();
  let cur = '';
  const g = (name) => {
    if (!groups.has(name)) groups.set(name, { pos: [], uv: [], hasUv: true });
    return groups.get(name);
  };
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line[0] === '#') continue;
    const t = line.trim().split(/\s+/);
    if (t[0] === 'v') v.push(+t[1], +t[2], +t[3]);
    else if (t[0] === 'vt') vt.push(+t[1], +(t[2] ?? 0));
    else if (t[0] === 'usemtl') cur = t.slice(1).join(' ');
    else if (t[0] === 'mtllib') {
      try {
        mtl = readMtl(confine(root, path.resolve(path.dirname(file), t.slice(1).join(' '))), root);
      } catch {
        mtl = new Map();
      }
    } else if (t[0] === 'f') {
      const corners = t.slice(1).map((s) => {
        const [a, b] = s.split('/');
        const vi = +a < 0 ? v.length / 3 + +a : +a - 1;
        const ti = b ? (+b < 0 ? vt.length / 2 + +b : +b - 1) : -1;
        return [vi, ti];
      });
      const grp = g(cur);
      for (let k = 1; k + 1 < corners.length; k++) {
        for (const [vi, ti] of [corners[0], corners[k], corners[k + 1]]) {
          grp.pos.push(v[vi * 3], v[vi * 3 + 1], v[vi * 3 + 2]);
          if (ti >= 0) grp.uv.push(vt[ti * 2], vt[ti * 2 + 1]);
          else grp.hasUv = false;
        }
      }
    }
  }
  const parts = [];
  for (const [name, grp] of groups) {
    if (!grp.pos.length) continue;
    const m = mtl.get(name);
    parts.push({
      positions: new Float32Array(grp.pos),
      uvs: grp.hasUv && grp.uv.length * 3 === grp.pos.length * 2 ? new Float32Array(grp.uv) : null,
      color: m?.color ?? null,
      texture: m?.texture ?? null,
      name: `${path.basename(file)}:${name}`,
    });
  }
  return parts;
}

// ── COLLADA ─────────────────────────────────────────────────────────────────

function readDae(file, root) {
  const doc = parseXml(fs.readFileSync(file, 'utf8'));
  const byId = new Map();
  const index = (el) => {
    if (el.attrs.id) byId.set(el.attrs.id, el);
    for (const c of el.children) index(c);
  };
  index(doc);
  const ref = (url) => (url ? byId.get(String(url).replace(/^#/, '')) : undefined);
  const asset = child(doc, 'asset');
  const unitEl = asset && child(asset, 'unit');
  const unit = unitEl?.attrs.meter ? Number(unitEl.attrs.meter) : 1;

  // material id → { color, texture }
  const materialInfo = (matId) => {
    const mat = byId.get(matId);
    if (!mat) return { color: null, texture: null };
    const eff = ref(child(mat, 'instance_effect')?.attrs.url);
    if (!eff) return { color: null, texture: null };
    const prof = find(eff, 'profile_COMMON');
    if (!prof) return { color: null, texture: null };
    const tech = child(prof, 'technique');
    const shader = tech && (child(tech, 'phong') ?? child(tech, 'lambert') ?? child(tech, 'blinn') ?? child(tech, 'constant'));
    const diffuse = shader && (child(shader, 'diffuse') ?? child(shader, 'emission'));
    let color = null;
    let texture = null;
    const c = diffuse && child(diffuse, 'color');
    if (c) color = nums(c.text);
    const tx = diffuse && child(diffuse, 'texture');
    if (tx) {
      // texture → sampler newparam → surface newparam → image id → init_from
      const params = new Map(findAll(prof, 'newparam').map((p) => [p.attrs.sid, p]));
      let imgId = tx.attrs.texture;
      const sampler = params.get(imgId);
      if (sampler) {
        const s2 = find(sampler, 'sampler2D');
        const srcName = s2 && child(s2, 'source')?.text?.trim();
        const surf = srcName && params.get(srcName);
        const init = surf ? find(surf, 'init_from')?.text?.trim() : s2 ? find(s2, 'instance_image')?.attrs.url?.replace(/^#/, '') : null;
        if (init) imgId = init;
      }
      const img = byId.get(imgId);
      const initFrom = img && find(img, 'init_from');
      const rel = initFrom ? (child(initFrom, 'ref')?.text ?? initFrom.text).trim() : null;
      if (rel) {
        try {
          texture = confine(root, path.resolve(path.dirname(file), decodeURIComponent(rel.replace(/^file:\/\//, ''))));
        } catch {
          texture = null;
        }
      }
      // the diffuse colour of a textured material is the texture; keep a mid grey as fallback
      if (!color) color = [0.8, 0.8, 0.8, 1];
    }
    if (shader && !color) {
      const tr = child(shader, 'transparency');
      color = [0.8, 0.8, 0.8, tr ? Number(child(tr, 'float')?.text ?? 1) : 1];
    }
    return { color, texture };
  };

  // geometry id → list of { positions, uvs, symbol }
  const geomCache = new Map();
  const readGeometry = (geo) => {
    if (geomCache.has(geo.attrs.id)) return geomCache.get(geo.attrs.id);
    const mesh = child(geo, 'mesh');
    const out = [];
    if (mesh) {
      const sources = new Map();
      for (const s of children(mesh, 'source')) {
        const fa = child(s, 'float_array');
        const acc = find(s, 'accessor');
        sources.set(s.attrs.id, { data: fa ? Float64Array.from(nums(fa.text, [])) : new Float64Array(0), stride: Number(acc?.attrs.stride ?? 3), offset: Number(acc?.attrs.offset ?? 0) });
      }
      const verticesEl = child(mesh, 'vertices');
      const vertexPos = verticesEl ? children(verticesEl, 'input').find((i) => i.attrs.semantic === 'POSITION')?.attrs.source?.replace(/^#/, '') : null;
      for (const prim of mesh.children) {
        if (!['triangles', 'polylist', 'polygons', 'trifans', 'tristrips'].includes(prim.tag)) continue;
        const inputs = children(prim, 'input').map((i) => ({ sem: i.attrs.semantic, src: i.attrs.source.replace(/^#/, ''), off: Number(i.attrs.offset ?? 0), set: Number(i.attrs.set ?? 0) }));
        const stride = Math.max(...inputs.map((i) => i.off)) + 1;
        const vin = inputs.find((i) => i.sem === 'VERTEX');
        const tin = inputs.filter((i) => i.sem === 'TEXCOORD').sort((a, b) => a.set - b.set)[0];
        const posSrc = sources.get(vin?.src === verticesEl?.attrs.id ? vertexPos : vin?.src);
        const uvSrc = tin ? sources.get(tin.src) : null;
        if (!posSrc) continue;
        // polygons as index lists
        const polys = [];
        if (prim.tag === 'triangles') {
          const p = nums(child(prim, 'p')?.text, []);
          for (let i = 0; i + 3 * stride <= p.length; i += 3 * stride) polys.push(p.slice(i, i + 3 * stride));
        } else if (prim.tag === 'polylist') {
          const p = nums(child(prim, 'p')?.text, []);
          const vc = nums(child(prim, 'vcount')?.text, []);
          let i = 0;
          for (const n of vc) {
            polys.push(p.slice(i, i + n * stride));
            i += n * stride;
          }
        } else if (prim.tag === 'polygons') {
          for (const pe of children(prim, 'p')) polys.push(nums(pe.text, []));
        } else {
          for (const pe of children(prim, 'p')) {
            const p = nums(pe.text, []);
            const n = p.length / stride;
            for (let k = 2; k < n; k++) {
              const ids = prim.tag === 'trifans' ? [0, k - 1, k] : k % 2 ? [k - 1, k - 2, k] : [k - 2, k - 1, k];
              polys.push(ids.flatMap((c) => p.slice(c * stride, c * stride + stride)));
            }
          }
        }
        const pos = [];
        const uv = [];
        for (const poly of polys) {
          const n = poly.length / stride;
          for (let k = 1; k + 1 < n; k++) {
            for (const c of [0, k, k + 1]) {
              const vi = poly[c * stride + vin.off];
              const b = posSrc.offset + vi * posSrc.stride;
              pos.push(posSrc.data[b], posSrc.data[b + 1], posSrc.data[b + 2]);
              if (uvSrc) {
                const ti = poly[c * stride + tin.off];
                const t = uvSrc.offset + ti * uvSrc.stride;
                uv.push(uvSrc.data[t], uvSrc.data[t + 1]);
              }
            }
          }
        }
        if (pos.length) out.push({ positions: pos, uvs: uvSrc ? uv : null, symbol: prim.attrs.material ?? null });
      }
    }
    geomCache.set(geo.attrs.id, out);
    return out;
  };

  const nodeMatrix = (node) => {
    const m = new THREE.Matrix4();
    for (const t of node.children) {
      const v = nums(t.text, []);
      if (t.tag === 'matrix') m.multiply(new THREE.Matrix4().set(...v));
      else if (t.tag === 'translate') m.multiply(new THREE.Matrix4().makeTranslation(v[0], v[1], v[2]));
      else if (t.tag === 'rotate') m.multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(v[0], v[1], v[2]).normalize(), THREE.MathUtils.degToRad(v[3])));
      else if (t.tag === 'scale') m.multiply(new THREE.Matrix4().makeScale(v[0], v[1], v[2]));
    }
    return m;
  };

  const parts = [];
  const unitM = new THREE.Matrix4().makeScale(unit, unit, unit);
  const v3 = new THREE.Vector3();
  const visitNode = (node, parentM, depth) => {
    if (depth > 64) return;
    const m = parentM.clone().multiply(nodeMatrix(node));
    for (const c of node.children) {
      if (c.tag === 'node') visitNode(c, m, depth + 1);
      else if (c.tag === 'instance_node') {
        const target = ref(c.attrs.url);
        if (target) visitNode(target, m, depth + 1);
      } else if (c.tag === 'instance_geometry') {
        const geo = ref(c.attrs.url);
        if (!geo) continue;
        const binds = new Map(findAll(c, 'instance_material').map((im) => [im.attrs.symbol, im.attrs.target.replace(/^#/, '')]));
        const full = unitM.clone().multiply(m);
        const flip = full.determinant() < 0;
        for (const g of readGeometry(geo)) {
          const info = materialInfo(binds.get(g.symbol) ?? g.symbol);
          const pos = new Float32Array(g.positions.length);
          for (let i = 0; i < g.positions.length; i += 3) {
            v3.set(g.positions[i], g.positions[i + 1], g.positions[i + 2]).applyMatrix4(full);
            pos[i] = v3.x;
            pos[i + 1] = v3.y;
            pos[i + 2] = v3.z;
          }
          let uvs = g.uvs ? new Float32Array(g.uvs) : null;
          if (flip) flipWinding(pos, uvs);
          parts.push({ positions: pos, uvs, color: info.color, texture: info.texture, name: `${path.basename(file)}:${node.attrs.name ?? node.attrs.id ?? ''}:${g.symbol ?? ''}` });
        }
      }
    }
  };
  // COLLADA's up_axis is ignored on purpose: ROS (rviz, Gazebo) place the node tree in the link
  // frame and drop the importer's root up-axis conversion, and the DAE files are authored for that.
  const scene = child(doc, 'scene');
  const vs = scene ? ref(child(scene, 'instance_visual_scene')?.attrs.url) : find(doc, 'visual_scene');
  if (vs) for (const n of children(vs, 'node')) visitNode(n, new THREE.Matrix4(), 0);
  return parts;
}

function flipWinding(pos, uvs) {
  for (let i = 0; i < pos.length; i += 9) {
    for (let k = 0; k < 3; k++) [pos[i + 3 + k], pos[i + 6 + k]] = [pos[i + 6 + k], pos[i + 3 + k]];
    if (uvs) {
      const t = (i / 9) * 6;
      for (let k = 0; k < 2; k++) [uvs[t + 2 + k], uvs[t + 4 + k]] = [uvs[t + 4 + k], uvs[t + 2 + k]];
    }
  }
}
