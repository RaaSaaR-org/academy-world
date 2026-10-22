/**
 * Zone-owned materials (never mutate the shared library). Disposed via the zone root traversal
 * plus `disposeZoneMaterials()` for textures.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';

const owned: { dispose(): void }[] = [];
const keep = <T extends { dispose(): void }>(x: T): T => {
  owned.push(x);
  return x;
};

export function disposeZoneMaterials(): void {
  for (const x of owned.splice(0)) x.dispose();
  floorCache.clear();
  inlay = null;
}

/** Unlit fresnel glass: reads as glass in any light (the dome is dim), no transmission pass. */
export function fresnelGlass(o: { edges?: boolean; tint?: number; rim?: number; base?: number; streak?: boolean } = {}): THREE.ShaderMaterial {
  return keep(
    new THREE.ShaderMaterial({
      name: 'sensordom:glass',
      uniforms: {
        uTint: { value: new THREE.Color(o.tint ?? 0x3d3a36) },
        uRim: { value: new THREE.Color(o.rim ?? 0xe7e5e4) },
        uBase: { value: o.base ?? 0.06 },
        uEdges: { value: o.edges ? 1 : 0 },
        uStreak: { value: o.streak ? 1 : 0 },
        uReveal: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint; uniform vec3 uRim; uniform float uBase; uniform float uEdges; uniform float uStreak; uniform float uReveal;
        varying vec3 vN; varying vec3 vV; varying vec2 vUv;
        void main() {
          float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float a = uBase + 0.55 * pow(f, 2.5);
          vec3 c = mix(uTint, uRim, pow(f, 1.5));
          if (uEdges > 0.5) {
            // ground edges glint + a diagonal smear: how you notice a glass door
            vec2 e = min(vUv, 1.0 - vUv);
            float edge = 1.0 - smoothstep(0.0, 0.025, min(e.x, e.y));
            float smear = smoothstep(0.985, 1.0, sin((vUv.x * 1.3 + vUv.y) * 23.0)) * smoothstep(0.2, 0.6, vUv.y) * 0.18;
            a += edge * 0.7 + smear * 0.3;
            c = mix(c, uRim, edge * 0.9 + smear);
          }
          if (uStreak > 0.5) {
            // a vertical specular streak (lamp reflection) on round glass
            float sx = normalize(vN).x;
            float st = smoothstep(0.42, 0.55, sx) * (1.0 - smoothstep(0.6, 0.72, sx));
            c = mix(c, vec3(1.0, 0.97, 0.92), st);
            a = max(a, st * 0.9);
          }
          gl_FragColor = vec4(c, clamp(a, 0.0, 0.95) * uReveal);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
}

/** Painted equirect of a dim lab (dark dome, warm lamps, teal LED line, floor) as a mirror env map. */
export function mirrorMaterial(ctx: ZoneContext): THREE.MeshStandardMaterial {
  const tex = ctx.materials.canvasTexture(512, 256, (g: CanvasRenderingContext2D, w: number, h: number) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.5);
    sky.addColorStop(0, '#0c0a09');
    sky.addColorStop(1, '#2f2a27');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h * 0.5);
    // geodesic seams
    g.strokeStyle = 'rgba(120,113,108,0.35)';
    g.lineWidth = 1;
    for (let i = 0; i < 24; i++) {
      const x = (i / 24) * w;
      g.beginPath();
      g.moveTo(x, h * 0.5);
      g.lineTo(x + w / 48, h * 0.12);
      g.lineTo(x + w / 24, h * 0.5);
      g.stroke();
    }
    // warm lamps
    for (const [x, y, r] of [
      [0.18, 0.33, 22],
      [0.62, 0.3, 26],
      [0.86, 0.36, 14],
    ]) {
      const rg = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, r);
      rg.addColorStop(0, 'rgba(255,226,190,1)');
      rg.addColorStop(1, 'rgba(255,200,150,0)');
      g.fillStyle = rg;
      g.fillRect(x * w - r, y * h - r, 2 * r, 2 * r);
    }
    // teal LED ring
    g.fillStyle = 'rgba(45,212,191,0.9)';
    g.fillRect(0, h * 0.46, w, 2);
    // floor
    const fl = g.createLinearGradient(0, h * 0.5, 0, h);
    fl.addColorStop(0, '#3a3532');
    fl.addColorStop(1, '#1c1917');
    g.fillStyle = fl;
    g.fillRect(0, h * 0.5, w, h * 0.5);
    g.strokeStyle = 'rgba(12,10,9,0.6)';
    for (let i = 0; i < 32; i++) {
      g.beginPath();
      g.moveTo((i / 32) * w, h * 0.5);
      g.lineTo((i / 32) * w, h);
      g.stroke();
    }
  });
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  keep(tex);
  return keep(new THREE.MeshStandardMaterial({ name: 'sensordom:mirror', color: 0xd6d3d1, metalness: 1, roughness: 0.035, envMap: tex, envMapIntensity: 1.15 }));
}

/** The rotating LiDAR fan: vertical sector with 16 beams, fading with range, additive. */
export function fanMaterial(): THREE.ShaderMaterial {
  return keep(
    new THREE.ShaderMaterial({
      name: 'sensordom:fan',
      uniforms: { uColor: { value: new THREE.Color(0x2dd4bf) } },
      vertexShader: /* glsl */ `
        attribute float aTrail;
        varying vec2 vUv; varying float vTrail;
        void main() { vUv = uv; vTrail = aTrail; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying vec2 vUv; varying float vTrail;
        void main() {
          // 16 channels as soft lines in a translucent blade, T0 teal at ≤ 35 % (ART-V2 B2):
          // it fades to nothing at 18 m, so it never reads as a stray plane in the sky
          float beams = pow(abs(cos(vUv.y * 3.14159265 * 16.0)), 10.0);
          float fade = pow(1.0 - vUv.x, 1.6) * smoothstep(0.0, 0.05, vUv.x);
          float a = vTrail * 0.35 * (0.35 + 0.65 * beams) * fade;
          gl_FragColor = vec4(uColor, clamp(a, 0.0, 0.35));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
}

/** A floor material that wins against the island's plot pad (its paving uses polygonOffset −2/−4). */
const floorCache = new Map<string, THREE.MeshStandardMaterial>();
export function offsetFloor(base: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  let m = floorCache.get(base.uuid);
  if (!m) {
    m = keep(base.clone());
    m.name = 'sensordom:floor';
    m.color.setScalar(2.6); // the shared plate texture is very dark; the dome floor should read in dim light
    m.polygonOffset = true;
    m.polygonOffsetFactor = -4;
    m.polygonOffsetUnits = -8;
    floorCache.set(base.uuid, m);
  }
  return m;
}
let inlay: THREE.MeshBasicMaterial | null = null;
/** teal floor inlay: unlit T0 line (L ≈ 0.51, below the bloom band), offset above the floor */
export function inlayMaterial(): THREE.MeshBasicMaterial {
  if (!inlay) {
    inlay = keep(new THREE.MeshBasicMaterial({ name: 'sensordom:inlay', color: new THREE.Color(0x2dd4bf).multiplyScalar(1.0), polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }));
  }
  return inlay;
}

export function own<T extends { dispose(): void }>(x: T): T {
  return keep(x);
}
