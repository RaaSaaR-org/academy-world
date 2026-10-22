import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { ISLAND, PADS, PATHS, ZONE_PLOTS, bearingDir } from '../layout';
import { outlineSamples } from '../geometry';
import { INTAKES, PV_ROWS } from './plan';

/**
 * Dusk glow (phase 5, ART-V2 §2.7 "the island glows"): the light lines are 4–9 cm wide, too thin to
 * read from the aerials or down the Allee once the sun is gone. Every guide line gets a soft light
 * spill on the deck around it — an additive strip with a quadratic falloff, a few decimetres wide —
 * and every path bollard a warm pool of light on the ground. Invisible by day (the meshes are
 * hidden), fades in with the dusk lift of the light tiers (smoothstep 0.3…0.7 of the finale's t).
 * Two draw calls at dusk, none by day. No fog on additive light (it would add the fog colour).
 */
export function buildDuskGlow(ctx: ZoneContext, bollards: [number, number][]): void {
  const M = ctx.materials;
  const pos: number[] = [],
    across: number[] = [],
    idx: number[] = [];
  const Y = 0.05;
  /** strip along a polyline on the deck, half width h */
  const strip = (pts: [number, number][], h: number, y = Y, closed = false): void => {
    const n = pts.length;
    const b = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)],
        c = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      let tx = c[0] - a[0],
        tz = c[1] - a[1];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      const nx = -tz * h,
        nz = tx * h;
      pos.push(pts[i][0] + nx, y, pts[i][1] + nz, pts[i][0] - nx, y, pts[i][1] - nz);
      across.push(1, -1);
    }
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const k = b + i * 2,
        k2 = b + ((i + 1) % n) * 2;
      idx.push(k, k2, k + 1, k + 1, k2, k2 + 1);
    }
  };
  const line = (x0: number, z0: number, x1: number, z1: number, h: number): void => strip([[x0, z0], [x1, z1]], h);
  const circle = (cx: number, cz: number, r: number, h: number, a0 = 0, a1 = Math.PI * 2, seg = 160): void => {
    const pts: [number, number][] = [];
    const full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
    const n = full ? seg : seg + 1;
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / seg;
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
    strip(pts, h, Y, full);
  };

  // Allee channels ±3.3 and the north spoke centre line
  for (const o of [-3.3, 3.3]) {
    line(o, PATHS.plazaRadius + 0.5, o, PATHS.ring.inner - 0.3, 0.42);
    line(o, PATHS.ring.outer + 0.3, o, PATHS.avenue.to - 0.5, 0.42);
  }
  line(0, -33, 0, -(PATHS.ring.inner - 0.3), 0.36);
  line(0, -(PATHS.ring.outer + 0.3), 0, -84.5, 0.36);
  // zone spokes
  for (const p of ZONE_PLOTS) {
    const [dx, dz] = bearingDir(p.bearing);
    const r0 = PADS.hubRadius + PADS.diameter / 2 + 0.2,
      r1 = PATHS.spoke.to - 0.4;
    line(dx * r0, dz * r0, dx * r1, dz * r1, 0.42);
  }
  // plaza rings, zone boundary rings, Landedeck docking rings, intake rims
  circle(0, 0, PATHS.plazaRadius - 0.35, 0.38, 0, Math.PI * 2, 360);
  circle(0, 0, 21.9, 0.32, 0, Math.PI * 2, 240);
  for (const p of ZONE_PLOTS) circle(p.anchor[0], p.anchor[2], 21.6, 0.34);
  const ld = ISLAND.landedeck;
  for (const r of [8.4, 8.7]) circle(ld.center[0], ld.center[2], r, 0.22, -Math.PI * 0.95, Math.PI * 0.95, 120);
  for (const f of INTAKES) circle(f.x, f.z, f.r + 0.25, 0.3, 0, Math.PI * 2, 64);
  // PV row cable channels
  for (const r of PV_ROWS) line(r.x, r.z0 - 0.35, r.x, r.z1 + 0.35, 0.3);
  // the rim reveal line (vertical band on the rim face, 0.42 m below the deck edge)
  {
    const N = 720;
    const ol = outlineSamples(N, -0.06);
    const b = pos.length / 3;
    for (let i = 0; i < N; i++) {
      const p = ol[i];
      pos.push(p.x, -0.42 + 0.2, p.z, p.x, -0.42 - 0.2, p.z);
      across.push(1, -1);
    }
    for (let i = 0; i < N; i++) {
      const k = b + i * 2,
        k2 = b + ((i + 1) % N) * 2;
      idx.push(k, k2, k + 1, k + 1, k2, k2 + 1);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aAcross', new THREE.Float32BufferAttribute(across, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const tealMat = glowMaterial(0x2dd4bf, 'aAcross', 'line');
  ctx.onDispose(() => tealMat.dispose());
  const lines = new THREE.Mesh(g, tealMat);
  lines.name = 'island:dusk-glow';
  lines.renderOrder = 3;
  lines.matrixAutoUpdate = false;
  lines.visible = false;
  ctx.root.add(lines);
  ctx.freezeStatic(lines);

  // warm pools on the ground around the bollards (radial falloff, 1.6 m radius)
  const pool = new THREE.InstancedMesh(poolGeometry(1.6), glowMaterial(0xffd8a8, 'aR', 'pool'), Math.max(1, bollards.length));
  pool.name = 'island:bollard-pools';
  ctx.onDispose(() => (pool.material as THREE.Material).dispose());
  const m4 = new THREE.Matrix4();
  bollards.forEach(([x, z], i) => pool.setMatrixAt(i, m4.makeTranslation(x, 0.055, z)));
  pool.count = bollards.length;
  pool.computeBoundingSphere();
  pool.renderOrder = 3;
  pool.visible = false;
  ctx.root.add(pool);
  ctx.freezeStatic(pool);

  const apply = (t: number): void => {
    const k = THREE.MathUtils.smoothstep(t, 0.3, 0.7);
    lines.visible = pool.visible = k > 0.01;
    (tealMat.uniforms.uK as { value: number }).value = 0.55 * k;
    ((pool.material as THREE.ShaderMaterial).uniforms.uK as { value: number }).value = 0.42 * k;
  };
  apply(M.dusk);
  ctx.onDispose(M.onDusk(apply));
}

/** Additive glow: colour × uK × falloff (quadratic across a strip, or radial for a pool). */
function glowMaterial(color: number, attr: 'aAcross' | 'aR', kind: 'line' | 'pool'): THREE.ShaderMaterial {
  const c = new THREE.Color(color);
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: c }, uK: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float ${attr};
      varying float vA;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vA = ${attr};
        vec4 mv = modelViewMatrix * ${kind === 'pool' ? 'instanceMatrix * ' : ''}vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uK;
      varying float vA;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float d = clamp(abs(vA), 0.0, 1.0);
        float f = (1.0 - d) * (1.0 - d);
        ${kind === 'pool' ? 'f = f * f * 1.6;' : ''}
        gl_FragColor = vec4(uColor * uK * f, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
}

/** Disc of radius r on the deck with a per-vertex radius attribute aR (0 centre … 1 edge). */
function poolGeometry(r: number): THREE.BufferGeometry {
  const seg = 24;
  const pos: number[] = [0, 0, 0],
    ar: number[] = [0],
    idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    ar.push(1);
  }
  for (let i = 1; i <= seg; i++) idx.push(0, i + 1, i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aR', new THREE.Float32BufferAttribute(ar, 1));
  g.setIndex(idx);
  return g;
}
