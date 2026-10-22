/**
 * DockSpray (plan WP3 build 6, §5.2, R5 §7.7): the dock's water spray as ONE instanced draw, ≤ 192
 * particles (96 on low quality). Kinds: 'plume' (a ready rotor's downwash rising 20–25 m out of the slot),
 * 'burst' (a spin-up puff), 'ring' (a ring on the wet floor), 'wisp' (a slow, large, faint drift).
 *
 * Stateless on the GPU: each particle is (spawn point, velocity, birth, life, size); the vertex shader
 * moves it with drag, buoyancy and the wind and turns it to the camera. Flash safety (R5 §5.6, WCAG
 * 2.3.1): mid-tone, low opacity, every particle fades in and out over ≥ 0.35 s, no additive blending, so
 * nothing flickers frame to frame. Reduced motion: plumes at a third of the rate, slower.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { ZONE_PLOTS, bearingDir } from '../layout';
import type { Vec3Tuple } from '../layout';
import { T } from './tuning';
import { wallRadius } from './outline';

export type SprayKind = 'plume' | 'burst' | 'ring' | 'wisp';

export interface Spray {
  readonly mesh: THREE.Mesh;
  emit(kind: SprayKind, at: Vec3Tuple, strength: number): void;
  setPlume(lobe: 0 | 1 | 2 | 3 | 4 | 5, on: boolean): void;
  update(dt: number, t: number): void;
  /** live particles (debug) */
  readonly alive: number;
}

const VERT = /* glsl */ `
attribute vec3 aP0;
attribute vec3 aV;
attribute vec4 aT; // birth, life, size0, size1
uniform float uTime;
uniform vec3 uWind;
varying vec2 vQuad;
varying float vAlpha;
#include <fog_pars_vertex>
void main() {
  float age = uTime - aT.x;
  float life = max(aT.y, 1e-3);
  float k = clamp(age / life, 0.0, 1.0);
  bool dead = age < 0.0 || age > life;
  // drag 1.4/s on the launch velocity, buoyant drift and the wind (spray rises, slows, leans down-wind)
  float d = (1.0 - exp(-1.4 * age)) / 1.4;
  vec3 c = aP0 + aV * d + uWind * age * age * 0.25 + vec3(0.0, 0.35, 0.0) * age;
  float size = mix(aT.z, aT.w, sqrt(k));
  vAlpha = dead ? 0.0 : smoothstep(0.0, 0.18, k) * (1.0 - smoothstep(0.55, 1.0, k));
  vQuad = position.xy;
  vec4 mvPosition = modelViewMatrix * vec4(c, 1.0);
  mvPosition.xy += position.xy * size;
  gl_Position = dead ? vec4(0.0, 0.0, 2.0, 1.0) : projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vQuad;
varying float vAlpha;
#include <fog_pars_fragment>
void main() {
  float r = length(vQuad);
  float a = (1.0 - smoothstep(0.25, 1.0, r)) * vAlpha * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function buildSpray(ctx: ZoneContext, parent: THREE.Object3D): Spray {
  const max = ctx.settings.quality === 'low' ? T.spray.maxLow : T.spray.max;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  const p0 = new THREE.InstancedBufferAttribute(new Float32Array(T.spray.max * 3), 3);
  const v = new THREE.InstancedBufferAttribute(new Float32Array(T.spray.max * 3), 3);
  const tt = new THREE.InstancedBufferAttribute(new Float32Array(T.spray.max * 4).fill(-1e6), 4);
  for (const a of [p0, v, tt]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aP0', p0);
  geo.setAttribute('aV', v);
  geo.setAttribute('aT', tt);
  geo.instanceCount = max;
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      // the wind blows from the lake (295°) toward 115°
      uWind: { value: new THREE.Vector3(bearingDir(115)[0] * 1.2, 0, bearingDir(115)[1] * 1.2) },
      uColor: { value: new THREE.Color(T.spray.color) },
      uOpacity: { value: T.spray.opacity },
    },
  ]);
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false, fog: true });
  mat.name = 'ground:spray';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ground:spray';
  mesh.frustumCulled = false;
  mesh.renderOrder = 60;
  mesh.visible = false;
  mesh.matrixAutoUpdate = false;
  parent.add(mesh);
  ctx.onDispose(() => {
    geo.dispose();
    mat.dispose();
  });

  let next = 0;
  let now = 0;
  let lastDeath = -1;
  const rnd = Math.random;
  const put = (x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number): void => {
    const i = next;
    // a live particle is never cut short (that would pop): when the buffer is full, the new one is dropped
    if (now - tt.getX(i) < tt.getY(i)) return;
    next = (next + 1) % max;
    p0.setXYZ(i, x, y, z);
    v.setXYZ(i, vx, vy, vz);
    tt.setXYZW(i, now, life, s0, s1);
    for (const a of [p0, v, tt]) {
      a.addUpdateRange(i * a.itemSize, a.itemSize);
      a.needsUpdate = true;
    }
    lastDeath = Math.max(lastDeath, now + life);
    mesh.visible = true;
  };
  const rm = (): boolean => ctx.settings.reducedMotion;

  const emit = (kind: SprayKind, at: Vec3Tuple, strength: number): void => {
    const s = THREE.MathUtils.clamp(strength, 0, 2);
    const slow = rm() ? 0.55 : 1;
    const [x, y, z] = at;
    if (kind === 'plume') {
      // out of the slot and 20–25 m up (R5 §3.2): the drag (1.4/s) takes the launch speed to ≈ v / 1.4
      const up = (24 + rnd() * 7) * s * slow;
      put(x + (rnd() - 0.5) * 1.6, y, z + (rnd() - 0.5) * 1.6, (rnd() - 0.5) * 1.6, up, (rnd() - 0.5) * 1.6, 2.9 + rnd() * 0.7, 1.6, 6.0 + 2.0 * s);
    } else if (kind === 'burst') {
      const n = Math.round((rm() ? 5 : 12) * Math.min(1, s));
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2;
        const sp = (2.5 + rnd() * 3) * s * slow;
        put(x, y, z, Math.cos(a) * sp, (5 + rnd() * 4) * s * slow, Math.sin(a) * sp, 1.6 + rnd() * 0.8, 0.8, 3.0 * Math.max(0.5, s));
      }
    } else if (kind === 'ring') {
      const n = rm() ? 8 : 16;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rnd() * 0.2;
        const sp = (5 + rnd() * 2) * s * slow;
        put(x + Math.cos(a) * 1.5, y + 0.4, z + Math.sin(a) * 1.5, Math.cos(a) * sp, 0.6 * s, Math.sin(a) * sp, 2.0 + rnd() * 0.6, 1.2, 3.4);
      }
    } else {
      put(x, y, z, (rnd() - 0.5) * 0.6, 0.4 + rnd() * 0.4, (rnd() - 0.5) * 0.6, 6 + rnd() * 3, 5 * Math.max(0.4, s), 9 * Math.max(0.4, s));
    }
  };

  // a plume rises out of the slot at the lobe tip (between the lobe's rim and the wall)
  const plumes = new Map<number, number>();
  const slotAt = (lobe: number): Vec3Tuple => {
    const b = ZONE_PLOTS[lobe].bearing;
    const [dx, dz] = bearingDir(b);
    const r = wallRadius(b) - 2.2;
    return [dx * r, -1.5, dz * r];
  };

  return {
    mesh,
    emit,
    get alive() {
      let n = 0;
      for (let i = 0; i < max; i++) if (now - tt.getX(i) < tt.getY(i)) n++;
      return n;
    },
    setPlume(lobe, on) {
      if (on) plumes.set(lobe, plumes.get(lobe) ?? 0);
      else plumes.delete(lobe);
    },
    update(dt, t) {
      now = t;
      uniforms.uTime.value = t;
      // six plumes × rate × life (≈ 3.3 s) stay under the particle budget (192, 96 on low)
      const rate = T.spray.plumeRate * (rm() ? T.spray.rmRate : 1) * (max / T.spray.max);
      for (const [lobe, acc] of plumes) {
        let a = acc + dt * rate;
        while (a >= 1) {
          a -= 1;
          emit('plume', slotAt(lobe), 1);
        }
        plumes.set(lobe, a);
      }
      // no particle left: skip the draw
      if (mesh.visible && t > lastDeath + 0.1 && plumes.size === 0) mesh.visible = false;
    },
  };
}
