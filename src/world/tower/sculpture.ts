import * as THREE from 'three';
import { LOGO_SVG_PATH, RECAMAN } from '@/core/brand/logo3d';
import { SCULPTURE } from './constants';
import type { TowerKit } from './kit';
import { lathe } from './lathe';
import { buildMount } from './mount';

/**
 * The Recamán relief (ART-V2 §3.3, Phase 5): the EmAI mark as real tubes on a machined dial.
 *
 * Logo space: SVG mark units (disc r 400, +y up) × s = R/400, centred on (CX, CY). The ring and
 * all 17 arcs lie in ONE plane z = ZM, 0.45 m in front of the dial face: from every viewpoint the
 * sculpture is a perspective view of the exact mark (a plane maps to a plane), never a fan. The
 * depth is real — tubes on pins over the face, a 0.85 m dial body, a ribbed back, a yoke — so the
 * light plays on the tubes and the mounts read from the side, while the mark itself stays exact.
 *
 * Elements (FUN-PLAN §6): 0 = outer ring, 1…17 = arcs k. Earned stamp n lights element n − 1.
 *  - ghost mesh: warm brushed aluminium tubes, always drawn (the full mark in one ink)
 *  - lit mesh: brand-exact orange sleeve (×1.06); the fragment shader discards where
 *    aU > uProgress[aEl] → progressive reveal per element, one draw call for all 18
 *  - dial face and front chamfer: brand-exact #141414 (no outline from the front)
 * Static parts (dial body, pins, back ribs, hub, yoke, ticks) are returned for the tower's merges.
 */
export interface Sculpture {
  readonly group: THREE.Group;
  readonly statics: { carbon: THREE.BufferGeometry[]; alu: THREE.BufferGeometry[]; hull: THREE.BufferGeometry[]; teal: THREE.BufferGeometry[] };
  /** reveal of element el, 0…1 (0 = ghost, 1 = lit) */
  setProgress(el: number, p: number): void;
  /** opacity of a lit element (reduced-motion fade, dithered), 0…1 */
  setFade(el: number, a: number): void;
  progress(el: number): number;
  /** world point on element el at arc-length fraction u */
  pointAt(el: number, u: number, out: THREE.Vector3): THREE.Vector3;
  /** world point of a value v on the number line (mark plane; v may be < 0 or > 25) */
  nodePoint(v: number, out: THREE.Vector3): THREE.Vector3;
  /** hot laser head on element el (−1 = none), intensity 0…1 */
  setHead(el: number, k: number): void;
  /** finale sweep position 0…1 along all elements in sequence order (null = off) */
  setSweep(g: number | null): void;
  /** global sweep range of element el */
  range(el: number): [number, number];
  /** length of element el in metres */
  length(el: number): number;
  /** centre of the mark (mark plane) */
  readonly center: THREE.Vector3;
  /** geometry check against the brand mark (logo3d LOGO_SVG_PATH = assets/brand/logo.svg) and a(0…17) */
  check(): Record<string, unknown>;
  /** hub neck axis (waist ring a → dial back b) and its radius along it (w 0…1), for the diagrid phase */
  readonly stem: { a: THREE.Vector3; b: THREE.Vector3; radiusAt(w: number): number };
}

export const ELEMENTS = 18;

export function buildSculpture(kit: TowerKit): Sculpture {
  const R = SCULPTURE.radius;
  const s = R / 400;
  const [CX, CY, ZM] = SCULPTURE.center;
  const ZF = SCULPTURE.faceZ;
  const ZB = SCULPTURE.backZ;
  const TUBE = 8 * s; // stroke 16 units (bold lockup weight)
  const at = (X: number, Y: number, z: number, out: THREE.Vector3): THREE.Vector3 => out.set(CX + X, CY + Y, z);

  // ── elements: planar logo curves, parameter u = arc-length fraction (semicircles and the ring are uniform) ──
  interface El {
    raw(u: number, out: THREE.Vector3): THREE.Vector3;
    segs: number;
    caps: boolean;
    len: number;
    /** logo-space definition (for the check) */
    def: { r: number; cy: number; side: number; dir: number };
  }
  const els: El[] = [];
  {
    const RR = 375 * s;
    els.push({ raw: (u, o) => at(RR * Math.sin(Math.PI * 2 * u), -RR * Math.cos(Math.PI * 2 * u), ZM, o), segs: 200, caps: false, len: 2 * Math.PI * RR, def: { r: RR, cy: 0, side: 0, dir: 0 } });
  }
  for (let k = 1; k <= 17; k++) {
    const a0 = RECAMAN[k - 1],
      a1 = RECAMAN[k];
    const rk = 15 * k * s;
    const yc = (-375 + 15 * (a0 + a1)) * s;
    const side = k % 2 === 1 ? 1 : -1;
    const dir = Math.sign(a1 - a0);
    els.push({
      raw: (u, o) => {
        const ph = Math.PI * u;
        return at(side * rk * Math.sin(ph), yc - dir * rk * Math.cos(ph), ZM, o);
      },
      segs: 16 + 4 * k,
      caps: true,
      len: Math.PI * rk,
      def: { r: rk, cy: yc, side, dir },
    });
  }
  const totalLen = els.reduce((acc, e) => acc + e.len, 0);
  const SWEEP_HALF_M = 4;
  const ranges: [number, number][] = [];
  {
    let acc = 0;
    for (const e of els) {
      ranges.push([acc / totalLen, (acc + e.len) / totalLen]);
      acc += e.len;
    }
  }

  // ── tubes (parallel-transport frames) ─────────────────────────────────────
  const buildTubes = (radiusK: number, radial: number, withAttrs: boolean): THREE.BufferGeometry => {
    const pos: number[] = [],
      nrm: number[] = [],
      aEl: number[] = [],
      aU: number[] = [],
      aS: number[] = [],
      aG: number[] = [],
      idx: number[] = [];
    const P = new THREE.Vector3(),
      Pn = new THREE.Vector3(),
      Pp = new THREE.Vector3(),
      T = new THREE.Vector3(),
      N = new THREE.Vector3(),
      B = new THREE.Vector3(),
      d = new THREE.Vector3(),
      tmp = new THREE.Vector3();
    const Z = new THREE.Vector3(0, 0, 1);
    const r = TUBE * radiusK;
    const push = (p: THREE.Vector3, n: THREE.Vector3, el: number, u: number): void => {
      pos.push(p.x, p.y, p.z);
      nrm.push(n.x, n.y, n.z);
      if (withAttrs) {
        aEl.push(el);
        aU.push(u);
        aS.push(u * els[el].len);
        aG.push(ranges[el][0] + (ranges[el][1] - ranges[el][0]) * u);
      }
    };
    els.forEach((el, ei) => {
      const n = el.segs;
      const base = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        el.raw(f, P);
        el.raw(Math.max(0, f - 0.5 / n), Pp);
        el.raw(Math.min(1, f + 0.5 / n), Pn);
        T.subVectors(Pn, Pp).normalize();
        if (i === 0) N.copy(Z);
        N.addScaledVector(T, -T.dot(N)).normalize();
        B.crossVectors(T, N).normalize();
        for (let j = 0; j <= radial; j++) {
          const th = (j / radial) * Math.PI * 2;
          d.copy(N).multiplyScalar(Math.cos(th)).addScaledVector(B, Math.sin(th));
          push(tmp.copy(P).addScaledVector(d, r), d, ei, f);
        }
      }
      for (let i = 0; i < n; i++)
        for (let j = 0; j < radial; j++) {
          const a = base + i * (radial + 1) + j;
          const b = a + radial + 1;
          idx.push(a, a + 1, b, b, a + 1, b + 1);
        }
      if (el.caps) {
        for (const f of [0, 1]) {
          el.raw(f, P);
          const sph = new THREE.SphereGeometry(r, radial, 4);
          const sp = sph.getAttribute('position'),
            sn = sph.getAttribute('normal');
          const b0 = pos.length / 3;
          for (let i = 0; i < sp.count; i++) {
            tmp.set(sp.getX(i), sp.getY(i), sp.getZ(i)).add(P);
            push(tmp, d.set(sn.getX(i), sn.getY(i), sn.getZ(i)), ei, f);
          }
          const si = sph.getIndex()!;
          for (let i = 0; i < si.count; i++) idx.push(b0 + si.getX(i));
          sph.dispose();
        }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    if (withAttrs) {
      g.setAttribute('aEl', new THREE.Float32BufferAttribute(aEl, 1));
      g.setAttribute('aU', new THREE.Float32BufferAttribute(aU, 1));
      g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
      g.setAttribute('aG', new THREE.Float32BufferAttribute(aG, 1));
    }
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  };

  const group = new THREE.Group();
  group.name = 'tower:sculpture';

  // ghost: warm brushed aluminium (the unpowered light tube)
  const ghostMat = new THREE.MeshStandardMaterial({ color: 0xcfc9c2, metalness: 0.85, roughness: 0.28, envMapIntensity: 1.0 });
  ghostMat.name = 'tower:ghost';
  const ghost = new THREE.Mesh(buildTubes(1, 8, false), ghostMat);
  ghost.name = 'tower:sculpture-ghost';
  ghost.receiveShadow = true;
  group.add(ghost);

  // lit: brand-exact orange, progressive reveal per element, hot laser head, finale sweep
  const progress = new Float32Array(ELEMENTS);
  const fade = new Float32Array(ELEMENTS).fill(1);
  const uni = {
    uProgress: { value: progress },
    uFade: { value: fade },
    uHeadEl: { value: -1 },
    uHead: { value: 0 },
    uHeadLen: { value: 1 },
    uSweep: { value: -1 },
    uSweepOn: { value: 0 },
    /** sweep head half-width ≈ 4 m along the mark, whatever is lit */
    uSweepK: { value: 1 },
  };
  const litMat = new THREE.MeshBasicMaterial({ color: 0xff6700, fog: false, toneMapped: false });
  litMat.name = 'tower:lit';
  litMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aEl; attribute float aU; attribute float aS; attribute float aG;
uniform float uProgress[${ELEMENTS}]; uniform float uFade[${ELEMENTS}];
varying float vU; varying float vProg; varying float vS; varying float vG; varying float vEl; varying float vFade;
varying vec3 vNrmV; varying vec3 vViewV;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vU = aU; vProg = uProgress[int(aEl + 0.5)]; vFade = uFade[int(aEl + 0.5)]; vS = aS; vG = aG; vEl = aEl;
vNrmV = normalize(normalMatrix * normal); vViewV = -mvPosition.xyz;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uHeadEl; uniform float uHead; uniform float uHeadLen; uniform float uSweep; uniform float uSweepOn; uniform float uSweepK;
varying float vU; varying float vProg; varying float vS; varying float vG; varying float vEl; varying float vFade;
varying vec3 vNrmV; varying vec3 vViewV;`,
      )
      // reveal along the path; the reduced-motion fade is an ordered dither (no transparency sorting)
      .replace('void main() {', 'void main() {\n\tif (vProg <= 0.0 || vU > vProg) discard;\n\tif (vFade < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) > vFade) discard;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity );
float facing = abs(dot(normalize(vNrmV), normalize(vViewV)));
diffuseColor.rgb *= mix(0.72, 1.0, pow(facing, 0.7));`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  float isHead = 1.0 - step(0.5, abs(vEl - uHeadEl));
  float behind = max(0.0, vProg * uHeadLen - vS);
  outgoingLight += vec3(1.0, 0.62, 0.32) * (isHead * uHead * 6.0 * exp(-behind * 1.1)) * facing;
  float sw = exp(-pow((vG - uSweep) * uSweepK, 2.0)) * uSweepOn;
  outgoingLight += vec3(1.0, 0.86, 0.7) * sw * 2.2 * facing;
}
#include <opaque_fragment>`,
      );
  };
  litMat.customProgramCacheKey = () => 'tower:lit-v4';
  uni.uSweepK.value = totalLen / SWEEP_HALF_M;
  kit.trackBrand(litMat, 'orange');
  const lit = new THREE.Mesh(buildTubes(1.06, 8, true), litMat);
  lit.name = 'tower:sculpture-lit';
  lit.renderOrder = 1;
  group.add(lit);

  // ── dial face + front chamfer (brand-exact #141414, no light outline from the front) ──
  const CH = 0.12;
  const disc = new THREE.Mesh(mergeSimple([new THREE.CircleGeometry(R - CH, 160).translate(CX, CY, ZF), lathe([[R - CH, ZF], [R, ZF - CH]], 160, CX, CY)]), kit.brandDisc);
  disc.name = 'tower:sculpture-disc';
  group.add(disc);

  // ── statics: dial body, pins, ticks, back structure, hub, yoke ─────────────
  const carbon: THREE.BufferGeometry[] = [];
  const alu: THREE.BufferGeometry[] = [];
  const hull: THREE.BufferGeometry[] = [];
  const teal: THREE.BufferGeometry[] = [];
  // body: carbon side band with a stepped, machined profile (the step catches the light), rear chamfer
  const RS = R + 0.06; // the stepped band stands 6 cm proud
  carbon.push(
    lathe(
      [
        [R, ZF - CH],
        [R, ZF - 0.24],
        [RS, ZF - 0.3],
        [RS, ZB + 0.3],
        [R, ZB + 0.24],
        [R, ZB + 0.16],
        [R - 0.16, ZB],
      ],
      160,
      CX,
      CY,
    ),
  );
  carbon.push(new THREE.CircleGeometry(R - 0.16, 96).rotateY(Math.PI).translate(CX, CY, ZB));
  // alu trim in the two steps (fine machined rings, only seen obliquely)
  for (const z of [ZF - 0.27, ZB + 0.27]) alu.push(new THREE.TorusGeometry(RS - 0.01, 0.035, 6, 160).translate(CX, CY, z));
  // 26 teal ticks (values 0…25) around the band: a measuring scale, only seen from oblique views
  {
    const pos: number[] = [];
    const idx: number[] = [];
    const za = ZF - 0.36;
    const v = new THREE.Vector3();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const w = (i % 5 === 0 ? 0.07 : 0.04) / RS;
      const zEnd = i % 5 === 0 ? ZB + 0.36 : za - (za - ZB - 0.36) * 0.45;
      const b0 = pos.length / 3;
      for (const [aa, z] of [
        [a - w, za],
        [a + w, za],
        [a - w, zEnd],
        [a + w, zEnd],
      ]) {
        at(Math.sin(aa) * (RS + 0.02), -Math.cos(aa) * (RS + 0.02), z, v);
        pos.push(v.x, v.y, v.z);
      }
      idx.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    teal.push(g);
  }
  // pins: the tubes stand on carbon standoffs — every node of the number line (both arcs of a node
  // meet there), 12 on the ring, one at the crown of every arc from k = 3 (two from k = 11)
  {
    const pin = (X: number, Y: number, r: number): void => {
      const len = ZM - ZF;
      carbon.push(new THREE.CylinderGeometry(r, r * 1.25, len, 10, 1, true).rotateX(Math.PI / 2).translate(CX + X, CY + Y, ZF + len / 2));
      // a machined foot ring on the face
      alu.push(new THREE.TorusGeometry(r * 1.35, 0.018, 3, 10).translate(CX + X, CY + Y, ZF + 0.02));
    };
    for (const v of new Set(RECAMAN)) pin(0, (-375 + 30 * v) * s, 0.075);
    for (let i = 0; i < 12; i++) {
      const a = ((i + 0.5) / 12) * Math.PI * 2;
      pin(Math.sin(a) * 375 * s, -Math.cos(a) * 375 * s, 0.07);
    }
    const p = new THREE.Vector3();
    for (let k = 3; k <= 17; k++) {
      for (const u of k >= 11 ? [0.3, 0.7] : [0.5]) {
        els[k].raw(u, p);
        pin(p.x - CX, p.y - CY, 0.065);
      }
    }
  }

  const mount = buildMount({ R, CX, CY, ZB, ZF });
  for (const g of mount.carbon) carbon.push(g);
  for (const g of mount.alu) alu.push(g);
  for (const g of mount.hull) hull.push(g);
  for (const g of mount.teal) teal.push(g);

  const center = new THREE.Vector3(CX, CY, ZM);
  const api: Sculpture = {
    group,
    statics: { carbon, alu, hull, teal },
    stem: mount.stem,
    setProgress(el, p) {
      progress[el] = THREE.MathUtils.clamp(p, 0, 1);
    },
    progress: (el) => progress[el],
    setFade(el, a) {
      fade[el] = THREE.MathUtils.clamp(a, 0, 1);
    },
    pointAt(el, u, out) {
      return els[el].raw(THREE.MathUtils.clamp(u, 0, 1), out);
    },
    nodePoint(v, out) {
      return at(0, (-375 + 30 * v) * s, ZM, out);
    },
    setHead(el, k) {
      uni.uHeadEl.value = el;
      uni.uHead.value = k;
      if (el >= 0) uni.uHeadLen.value = els[el].len;
    },
    setSweep(g) {
      uni.uSweepOn.value = g === null ? 0 : 1;
      uni.uSweep.value = g ?? -1;
    },
    range: (el) => ranges[el],
    length: (el) => els[el].len,
    center,
    check: () => checkMark(els, s, CX, CY, ZM, mount.clearance),
  };
  return api;
}

/**
 * Verify the built elements against the brand path (LOGO_SVG_PATH, the path of assets/brand/logo.svg
 * in an 800 box) and the sequence: every arc's radius, centre, bulge side and end points; all in one
 * plane. Returns the worst deviations in millimetres (0 = exact) plus the mount's lattice clearance.
 */
function checkMark(els: { raw(u: number, o: THREE.Vector3): THREE.Vector3; def: { r: number; cy: number; side: number } }[], s: number, CX: number, CY: number, ZM: number, clearance: number): Record<string, unknown> {
  // walk the SVG path: "m x,y a r,r 0 0 sweep dx,dy …"; y down, centre (400, 400)
  const tok = LOGO_SVG_PATH.replace(/,/g, ' ').trim().split(/\s+/);
  let i = 0;
  let px = 0,
    py = 0;
  let cmd = '';
  const arcs: { r: number; cy: number; side: number }[] = [];
  while (i < tok.length) {
    if (/^[a-zA-Z]$/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'm') {
      px += +tok[i++];
      py += +tok[i++];
    } else if (cmd === 'a') {
      const r = +tok[i++];
      i += 4; // ry, rotation, large-arc, (sweep read below)
      const sweep = +tok[i - 1];
      const dx = +tok[i++],
        dy = +tok[i++];
      const cyS = py + dy / 2;
      // a semicircle on the vertical axis: sweep 0 (counter-clockwise on screen) going up bulges right
      const side = Math.abs(dx) > 1e-6 ? 0 : (dy < 0) === (sweep === 0) ? 1 : -1;
      arcs.push({ r, cy: 400 - cyS, side });
      px += dx;
      py += dy;
    } else i++;
  }
  // brand path: 17 spiral arcs, then the ring as two half circles of r 375
  const spiral = arcs.filter((a) => a.r < 370);
  let worstMm = 0;
  let sideErr = 0;
  const p = new THREE.Vector3();
  for (let k = 1; k <= 17; k++) {
    const b = spiral[k - 1];
    const d = els[k].def;
    if (!b) {
      sideErr++;
      continue;
    }
    worstMm = Math.max(worstMm, Math.abs(d.r - b.r * s) * 1000, Math.abs(d.cy - b.cy * s) * 1000);
    if (d.side !== b.side) sideErr++;
    // end points on the number line at a(k−1), a(k)
    const y0 = (-375 + 30 * RECAMAN[k - 1]) * s,
      y1 = (-375 + 30 * RECAMAN[k]) * s;
    els[k].raw(0, p);
    worstMm = Math.max(worstMm, Math.hypot(p.x - CX, p.y - CY - y0, p.z - ZM) * 1000);
    els[k].raw(1, p);
    worstMm = Math.max(worstMm, Math.hypot(p.x - CX, p.y - CY - y1, p.z - ZM) * 1000);
    // the crown sits on the bulge side at the arc's radius
    els[k].raw(0.5, p);
    worstMm = Math.max(worstMm, Math.abs(p.x - CX - b.side * b.r * s) * 1000);
  }
  const ringR = arcs.filter((a) => a.r >= 370).map((a) => a.r);
  let ringMm = 0;
  for (let j = 0; j <= 40; j++) {
    els[0].raw(j / 40, p);
    ringMm = Math.max(ringMm, Math.abs(Math.hypot(p.x - CX, p.y - CY) - (ringR[0] ?? 375) * s) * 1000, Math.abs(p.z - ZM) * 1000);
  }
  return {
    arcs: spiral.length,
    ringHalves: ringR.length,
    sideMismatches: sideErr,
    worstArcMm: +worstMm.toFixed(3),
    worstRingMm: +ringMm.toFixed(3),
    planar: true,
    markZ: ZM,
    latticeClearanceM: +clearance.toFixed(3),
    ok: spiral.length === 17 && ringR.length === 2 && sideErr === 0 && worstMm < 1 && ringMm < 1,
  };
}

function mergeSimple(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // position-only merge (unlit material): indexed + non-indexed mixed
  const pos: number[] = [];
  for (const g of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.getAttribute('position');
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    if (ng !== g) ng.dispose();
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}
