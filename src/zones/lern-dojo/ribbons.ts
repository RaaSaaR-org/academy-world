/**
 * Demo-Wolke (landmark): every demonstration hangs above the pavilion roof as a teal ribbon,
 * every policy run as an orange one. A ribbon is the SO-101's jaw-centre path in space-time:
 * x/z = the path on the bench scaled ×8 (the work field is a third of rc4's table), height =
 * progress through the episode. Thick where the jaws carry the cube, thin where they are empty.
 *
 * Draw calls: demos (1 merged mesh) + policy (1) + live run (1). Rebuilt only on change.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { look } from './look';

export const CLOUD_S = 8;
export const CLOUD_Y0 = 14.2; // clear of the roof title from the gate approach (release QA)
export const CLOUD_H = 8;
/** bench-frame point (the work field's centre) that maps to the pavilion centre */
const PIVOT_X = 0.06;
const PIVOT_Z = -0.15;
const CLOUD_CX = 0.9;
const CLOUD_CZ = -3.2;
/** the data vitrine around the cloud (ART-V2 §6.4, QA-25): centre, radius, rings */
export const VITRINE = { x: 0, z: -3.2, r: 7.5, y0: CLOUD_Y0 - 0.6, y1: CLOUD_Y0 + CLOUD_H + 0.4 } as const;
/** ribbon half width: a constant 0.12 m band with soft tapers at both ends */
const HALF_W = 0.06;
const SEG = 96;
const MAX_DEMOS = 12;
const MAX_POLICY = 4;

export type RibbonKind = 'ghost' | 'demo' | 'demo-new' | 'policy' | 'policy-fail';

export interface RibbonSpec {
  kind: RibbonKind;
  /** jaw-centre path in bench coords: x, z, carrying (0/1) per point */
  path: Float32Array;
  n: number;
  /** 0 = newest … 1 = oldest (fades) */
  age: number;
}

const _c = new THREE.Color();

export function cloudPoint(x: number, z: number, progress: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(CLOUD_CX + (x - PIVOT_X) * CLOUD_S, CLOUD_Y0 + progress * CLOUD_H, CLOUD_CZ + (z - PIVOT_Z) * CLOUD_S);
}

const vertexShader = /* glsl */ `
attribute vec4 rcolor;
attribute float along;
uniform float uTime;
uniform float uGust;
varying vec4 vCol;
varying float vAlong;
varying float vFace;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float h = max(0.0, p.y - ${CLOUD_Y0.toFixed(1)});
  float seed = rcolor.a * 17.0;
  p.x += (sin(uTime * 0.37 + p.y * 0.21 + seed) * 0.012 + uGust * sin(uTime * 1.9 + p.y * 0.35 + seed) * 0.05) * h;
  p.z += (cos(uTime * 0.29 + p.y * 0.17 + seed) * 0.010 + uGust * cos(uTime * 1.4 + p.y * 0.3 + seed) * 0.035) * h;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vec3 n = normalize(normalMatrix * normal);
  vFace = abs(dot(n, normalize(-mvPosition.xyz)));
  vCol = rcolor;
  vAlong = along;
  #include <fog_vertex>
}`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uLift;
varying vec4 vCol;
varying float vAlong;
varying float vFace;
#include <fog_pars_fragment>
void main() {
  // a data pulse travelling up each ribbon (phase per ribbon)
  float ph = fract(vAlong * 1.4 - uTime * 0.22 + vCol.a * 5.3);
  float pulse = smoothstep(0.86, 0.97, ph) * (1.0 - smoothstep(0.97, 1.0, ph));
  // colours are stored at T0 (light tiers, ART-V2 §2.4): uLift takes them to T1 at dusk; the pulse is
  // a small travelling glow (≈ T1 at its peak)
  float shade = 0.75 + 0.25 * vFace;
  gl_FragColor = vec4(vCol.rgb * uLift * shade * (1.0 + 1.8 * pulse), 1.0);
  #include <fog_fragment>
}`;

export function ribbonMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uGust: { value: 0 }, uLift: { value: 1 } }]),
    vertexShader,
    fragmentShader,
    fog: true,
    side: THREE.DoubleSide,
  });
}

/**
 * Ribbon builder: a flat band along the path that twists slowly about the tangent (two turns
 * over its length), half-width per point. Parallel-transport frames (no flipping).
 */
const TWIST = Math.PI * 4;
class TubeWriter {
  pos: Float32Array;
  nor: Float32Array;
  col: Float32Array;
  along: Float32Array;
  idx: Uint32Array;
  v = 0;
  i = 0;
  private T = new THREE.Vector3();
  private N = new THREE.Vector3();
  private B = new THREE.Vector3();
  private D = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(maxTubes: number) {
    const verts = maxTubes * SEG * 2;
    this.pos = new Float32Array(verts * 3);
    this.nor = new Float32Array(verts * 3);
    this.col = new Float32Array(verts * 4);
    this.along = new Float32Array(verts);
    this.idx = new Uint32Array(maxTubes * (SEG - 1) * 6);
  }

  reset(): void {
    this.v = 0;
    this.i = 0;
  }

  /** pts: SEG × (x, y, z), rad: SEG half-widths */
  tube(pts: Float32Array, rad: Float32Array, color: THREE.Color, seed: number, count = SEG): void {
    const base = this.v;
    const { T, N, B, D, tmp } = this;
    for (let k = 0; k < count; k++) {
      const a = Math.max(0, k - 1),
        b = Math.min(count - 1, k + 1);
      T.set(pts[b * 3] - pts[a * 3], pts[b * 3 + 1] - pts[a * 3 + 1], pts[b * 3 + 2] - pts[a * 3 + 2]);
      if (T.lengthSq() < 1e-10) T.set(0, 1, 0);
      T.normalize();
      if (k === 0) {
        tmp.set(Math.abs(T.y) < 0.9 ? 0 : 1, Math.abs(T.y) < 0.9 ? 1 : 0, 0);
        N.crossVectors(T, tmp).normalize();
      } else {
        N.addScaledVector(T, -N.dot(T));
        if (N.lengthSq() < 1e-8) N.crossVectors(T, tmp.set(0, 1, 0));
        N.normalize();
      }
      B.crossVectors(T, N);
      const ang = (k / (SEG - 1)) * TWIST + seed * Math.PI * 2;
      D.copy(N).multiplyScalar(Math.cos(ang)).addScaledVector(B, Math.sin(ang));
      // band normal = T × D
      tmp.crossVectors(T, D);
      const r = rad[k];
      for (let j = 0; j < 2; j++) {
        const sgn = j === 0 ? -1 : 1;
        const o = this.v * 3;
        this.pos[o] = pts[k * 3] + sgn * r * D.x;
        this.pos[o + 1] = pts[k * 3 + 1] + sgn * r * D.y;
        this.pos[o + 2] = pts[k * 3 + 2] + sgn * r * D.z;
        this.nor[o] = tmp.x;
        this.nor[o + 1] = tmp.y;
        this.nor[o + 2] = tmp.z;
        const c = this.v * 4;
        this.col[c] = color.r;
        this.col[c + 1] = color.g;
        this.col[c + 2] = color.b;
        this.col[c + 3] = seed;
        this.along[this.v] = k / (SEG - 1);
        this.v++;
      }
    }
    for (let k = 0; k < count - 1; k++) {
      const a = base + k * 2;
      this.idx[this.i++] = a;
      this.idx[this.i++] = a + 2;
      this.idx[this.i++] = a + 1;
      this.idx[this.i++] = a + 1;
      this.idx[this.i++] = a + 2;
      this.idx[this.i++] = a + 3;
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('along', new THREE.BufferAttribute(this.along, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage));
    return g;
  }

  commit(g: THREE.BufferGeometry): void {
    for (const name of ['position', 'normal', 'rcolor', 'along']) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      a.needsUpdate = true;
    }
    g.index!.needsUpdate = true;
    g.setDrawRange(0, this.i);
    g.computeBoundingSphere();
    // the shader sways the tops in gusts: keep the sphere generous
    if (g.boundingSphere) g.boundingSphere.radius += 2;
  }
}

/** Resample an EE path to SEG points of the cloud (positions + radii). */
function resample(spec: { path: Float32Array; n: number }, pts: Float32Array, rad: Float32Array, rDown: number, rUp: number, heightScale = 1): void {
  const n = spec.n;
  const p = spec.path;
  const v = _v;
  for (let k = 0; k < SEG; k++) {
    const f = (k / (SEG - 1)) * (n - 1);
    const i0 = Math.floor(f),
      i1 = Math.min(n - 1, i0 + 1),
      w = f - i0;
    // smoothing over ±W samples (≈ ±4 % of the path): rounds corners, keeps the shape
    const W = Math.max(2, Math.round(n / 25));
    let x = 0,
      z = 0,
      pen = 0,
      ws = 0;
    for (let d = -W; d <= W; d++) {
      const a = Math.min(n - 1, Math.max(0, i0 + d)),
        b = Math.min(n - 1, Math.max(0, i1 + d));
      const wt = 1 - Math.abs(d) / (W + 1);
      x += wt * (p[a * 3] * (1 - w) + p[b * 3] * w);
      z += wt * (p[a * 3 + 1] * (1 - w) + p[b * 3 + 1] * w);
      pen += wt * (p[a * 3 + 2] * (1 - w) + p[b * 3 + 2] * w);
      ws += wt;
    }
    cloudPoint(x / ws, z / ws, (k / (SEG - 1)) * heightScale, v);
    pts[k * 3] = v.x;
    pts[k * 3 + 1] = v.y;
    pts[k * 3 + 2] = v.z;
    // constant band, soft tapers over the first and last 8 % (a pen-up stretch is a touch thinner)
    const u = k / (SEG - 1);
    const taper = Math.min(1, u / 0.08, (1 - u) / 0.08);
    rad[k] = (rUp + (rDown - rUp) * (pen / ws)) * (taper * taper * (3 - 2 * taper));
  }
}
const _v = new THREE.Vector3();

export interface Cloud {
  readonly group: THREE.Group;
  setRibbons(list: RibbonSpec[]): void;
  /** live policy ribbon: call with the path so far (progress 0…1 of the expected duration); null hides */
  setLive(spec: { path: Float32Array; n: number } | null, progress?: number, failed?: boolean): void;
  gust(strength: number): void;
  update(dt: number, t: number): void;
  /** world-space highest point (for labels) */
  readonly top: THREE.Vector3;
  /** low-poly static copy for the far tier */
  farMesh(list: RibbonSpec[]): THREE.Mesh;
}

export function createCloud(ctx: ZoneContext, parent: THREE.Object3D): Cloud {
  const group = new THREE.Group();
  group.name = 'demo-wolke';
  parent.add(group);
  const mat = ribbonMaterial();
  ctx.onDispose(() => mat.dispose());

  const demoW = new TubeWriter(MAX_DEMOS);
  const polW = new TubeWriter(MAX_POLICY);
  const liveW = new TubeWriter(1);
  const demoGeo = demoW.geometry(),
    polGeo = polW.geometry(),
    liveGeo = liveW.geometry();
  const mk = (g: THREE.BufferGeometry, name: string): THREE.Mesh => {
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.frustumCulled = true;
    group.add(m);
    return m;
  };
  mk(demoGeo, 'ribbons-demo');
  mk(polGeo, 'ribbons-policy');
  const liveMesh = mk(liveGeo, 'ribbon-live');
  liveMesh.visible = false;
  ctx.onDispose(() => {
    demoGeo.dispose();
    polGeo.dispose();
    liveGeo.dispose();
  });

  const pts = new Float32Array(SEG * 3);
  const rad = new Float32Array(SEG);
  // light tiers: demos teal T0, policy orange T0 (×1.6), the newest demo briefly T1; older ones fade
  const LK = look(ctx);
  const colorFor = (s: RibbonSpec): THREE.Color => {
    const fade = 1 - 0.45 * s.age;
    switch (s.kind) {
      case 'ghost':
        return LK.tierColor(0x2dd4bf, 0, _c).multiplyScalar(0.55);
      case 'demo':
        return LK.tierColor(0x2dd4bf, 0, _c).multiplyScalar(fade);
      case 'demo-new':
        return LK.tierColor(0x2dd4bf, 1, _c);
      case 'policy':
        return LK.tierColor(0xff6700, 0, _c).multiplyScalar(fade);
      case 'policy-fail':
        return LK.tierColor(0xff6700, 0, _c).lerp(_c2.set(0xf87171).multiplyScalar(1.4), 0.35).multiplyScalar(fade);
    }
  };
  // dusk: every ribbon goes from T0 to T1 (the island glows)
  const lift = (t: number): number => 1 + (1.45 / 0.5 - 1) * THREE.MathUtils.smoothstep(t, 0.25, 0.6);
  mat.uniforms.uLift.value = lift(ctx.materials.dusk);
  ctx.onDispose(ctx.materials.onDusk((t) => (mat.uniforms.uLift.value = lift(t))));
  const _c2 = new THREE.Color();

  // projector: a ring above the skylight and a faint additive beam up into the cloud
  const ringMat = LK.duskLight(0x2dd4bf);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.05, 6, 96), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 10.4, -4);
  group.add(ring);
  // the data vitrine (QA-25: from the plaza the cloud read as a stray squiggle): a horizontal alu
  // ring under and over the cloud, six slim alu masts from the roof, fine cables between the rings
  {
    const V = VITRINE;
    const parts: THREE.BufferGeometry[] = [];
    const tor = (y: number, tube: number): THREE.BufferGeometry => new THREE.TorusGeometry(V.r, tube, 8, 160).rotateX(Math.PI / 2).translate(V.x, y, V.z);
    parts.push(tor(V.y0, 0.07), tor(V.y1, 0.07));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const x = V.x + Math.cos(a) * V.r,
        z = V.z + Math.sin(a) * V.r;
      const hMast = V.y0 - 9.3;
      parts.push(new THREE.CylinderGeometry(0.045, 0.07, hMast, 10).translate(x, 9.3 + hMast / 2, z));
      parts.push(new THREE.CylinderGeometry(0.012, 0.012, V.y1 - V.y0, 5).translate(x, (V.y0 + V.y1) / 2, z));
      parts.push(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12).translate(x, V.y0, z), new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12).translate(x, V.y1, z));
    }
    const frame = new THREE.Mesh(mergeSimple(parts), ctx.materials.brushedAlu);
    for (const p of parts) p.dispose();
    frame.name = 'demo-vitrine';
    frame.castShadow = false;
    group.add(frame);
    ctx.onDispose(() => frame.geometry.dispose());
  }
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x2dd4bf) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float fade = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.08, vUv.y);
        float streak = 0.75 + 0.25 * sin(vUv.x * 6.2832 * 12.0 + uTime * 0.6) * sin(vUv.y * 9.0 - uTime * 1.1);
        gl_FragColor = vec4(uColor * 0.11 * fade * streak, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(VITRINE.r - 0.2, 4.1, VITRINE.y1 - 10.2, 48, 1, true), beamMat);
  beam.position.set(0, 10.2 + (VITRINE.y1 - 10.2) / 2, -4);
  beam.renderOrder = 3;
  group.add(beam);
  ctx.onDispose(() => {
    ringMat.dispose();
    beamMat.dispose();
    ring.geometry.dispose();
    beam.geometry.dispose();
  });

  let gustAmp = 0;
  const top = new THREE.Vector3(0, CLOUD_Y0 + CLOUD_H, CLOUD_CZ);

  return {
    group,
    top,
    setRibbons(list) {
      demoW.reset();
      polW.reset();
      let nd = 0,
        np = 0,
        seed = 0;
      for (const s of list) {
        const isPol = s.kind === 'policy' || s.kind === 'policy-fail';
        if (isPol ? np >= MAX_POLICY : nd >= MAX_DEMOS) continue;
        if (s.n < 2) continue;
        resample(s, pts, rad, HALF_W, HALF_W * 0.7);
        (isPol ? polW : demoW).tube(pts, rad, colorFor(s), (seed++ * 0.137) % 1);
        if (isPol) np++;
        else nd++;
      }
      demoW.commit(demoGeo);
      polW.commit(polGeo);
    },
    setLive(spec, progress = 1, failed = false) {
      if (!spec || spec.n < 2) {
        liveMesh.visible = false;
        return;
      }
      liveW.reset();
      resample(spec, pts, rad, HALF_W * 1.4, HALF_W, Math.min(1, progress));
      // the live rollout is the one ribbon at T1: the policy you are watching right now
      liveW.tube(pts, rad, failed ? _c.set(0xf87171).multiplyScalar(1.6) : LK.tierColor(0xff6700, 1, _c), 0.5);
      liveW.commit(liveGeo);
      liveMesh.visible = true;
    },
    gust(strength) {
      if (!ctx.settings.reducedMotion) gustAmp = Math.min(1.2, gustAmp + strength);
    },
    update(dt, t) {
      gustAmp *= Math.exp(-dt * 0.5);
      mat.uniforms.uTime.value = t;
      beamMat.uniforms.uTime.value = t;
      mat.uniforms.uGust.value = gustAmp * Math.min(1, gustAmp * 4) * (0.6 + 0.4 * Math.sin(t * 0.8));
    },
    farMesh(list) {
      // low-poly copy: 24 segments × 4 sides per ribbon, plain emissive teal
      const parts: THREE.BufferGeometry[] = [];
      for (const s of list.slice(0, 6)) {
        const curvePts: THREE.Vector3[] = [];
        for (let k = 0; k < 24; k++) {
          const f = (k / 23) * (s.n - 1);
          const i = Math.round(f);
          curvePts.push(cloudPoint(s.path[i * 3], s.path[i * 3 + 1], k / 23, new THREE.Vector3()));
        }
        parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePts), 23, 0.1, 4, false));
      }
      const merged = mergeSimple(parts);
      for (const p of parts) p.dispose();
      const m = new THREE.Mesh(merged, LK.light(0x2dd4bf, 0));
      ctx.onDispose(() => merged.dispose());
      return m;
    },
  };
}

/** Merge non-indexed-compatible geometries (position + normal only). */
export function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let nv = 0,
    ni = 0;
  for (const p of parts) {
    nv += p.getAttribute('position').count;
    ni += p.index ? p.index.count : p.getAttribute('position').count;
  }
  const pos = new Float32Array(nv * 3),
    nor = new Float32Array(nv * 3);
  const idx = new Uint32Array(ni);
  let vo = 0,
    io = 0;
  for (const p of parts) {
    const pa = p.getAttribute('position') as THREE.BufferAttribute;
    const na = p.getAttribute('normal') as THREE.BufferAttribute | undefined;
    for (let i = 0; i < pa.count; i++) {
      pos[(vo + i) * 3] = pa.getX(i);
      pos[(vo + i) * 3 + 1] = pa.getY(i);
      pos[(vo + i) * 3 + 2] = pa.getZ(i);
      if (na) {
        nor[(vo + i) * 3] = na.getX(i);
        nor[(vo + i) * 3 + 1] = na.getY(i);
        nor[(vo + i) * 3 + 2] = na.getZ(i);
      }
    }
    if (p.index) for (let i = 0; i < p.index.count; i++) idx[io++] = p.index.getX(i) + vo;
    else for (let i = 0; i < pa.count; i++) idx[io++] = vo + i;
    vo += pa.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
