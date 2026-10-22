import * as THREE from 'three';

/**
 * Laser / sensor beam and the drawing sprites (after the founder's beam.js and textures.js):
 * 2 draw calls, both only while something is shown.
 *  - beam: an open cylinder with a facing-based core + halo (additive), orange laser or teal sensor ray
 *  - sprites: one InstancedMesh of camera-facing quads with an atlas (glow, ✕, ✓, ring)
 * These may bloom: they are the tool, not the mark.
 */
export type SpriteKind = 'glow' | 'reject' | 'accept' | 'ring';
const KIND: Record<SpriteKind, number> = { glow: 0, reject: 1, accept: 2, ring: 3 };

export interface Fx {
  readonly group: THREE.Group;
  /** beam from a to b; kind laser (orange) / sensor (teal); k = intensity 0…1 (0 hides) */
  beam(a: THREE.Vector3, b: THREE.Vector3, kind: 'laser' | 'sensor', k: number): void;
  /** sprite slot i (0…7): position, kind, size (m), colour (HDR, linear) and opacity; opacity 0 hides */
  sprite(i: number, at: THREE.Vector3, kind: SpriteKind, size: number, color: THREE.Color, opacity: number): void;
  /** call at the start of every frame, then declare what is shown */
  hideAll(): void;
  /** call once per frame after setting beams/sprites */
  commit(): void;
}

const SLOTS = 8;

export function buildFx(onDispose: (fn: () => void) => void): Fx {
  const group = new THREE.Group();
  group.name = 'tower:fx';

  // ── beam ──────────────────────────────────────────────────────────────────
  const beamUni = { uColor: { value: new THREE.Color() }, uK: { value: 0 } };
  const beamMat = new THREE.ShaderMaterial({
    name: 'tower:beam',
    uniforms: beamUni,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying float vAlong;
      void main() {
        vAlong = position.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = -mv.xyz; vN = normalMatrix * normal;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uK;
      varying vec3 vN; varying vec3 vV; varying float vAlong;
      void main() {
        float f = abs(dot(normalize(vN), normalize(vV)));
        float core = pow(f, 14.0) * 7.0;
        float halo = pow(f, 2.5) * 0.45;
        float taper = smoothstep(0.0, 0.03, vAlong) * (0.6 + 0.4 * smoothstep(1.0, 0.7, vAlong));
        gl_FragColor = vec4(uColor * (core + halo) * uK * taper, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0), beamMat);
  beam.name = 'tower:beam';
  beam.frustumCulled = false;
  beam.renderOrder = 8;
  beam.visible = false;
  group.add(beam);

  // ── sprites ───────────────────────────────────────────────────────────────
  const atlas = (() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const g = c.getContext('2d')!;
    const cell = (i: number, draw: (cx: number, cy: number, s: number) => void): void => draw(i * 128 + 64, 64, 128);
    // glow
    cell(0, (cx, cy, s) => {
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.12, 'rgba(255,255,255,0.75)');
      gr.addColorStop(0.35, 'rgba(255,255,255,0.18)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(cx - s / 2, cy - s / 2, s, s);
    });
    const reticle = (cx: number, cy: number, s: number): void => {
      g.strokeStyle = '#fff';
      g.lineCap = 'round';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(cx, cy, s * 0.32, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 4;
      const r = s * 0.45,
        k = s * 0.1;
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        g.beginPath();
        g.moveTo(cx + sx * r, cy + sy * (r - k));
        g.lineTo(cx + sx * r, cy + sy * r);
        g.lineTo(cx + sx * (r - k), cy + sy * r);
        g.stroke();
      }
    };
    cell(1, (cx, cy, s) => {
      reticle(cx, cy, s);
      g.lineWidth = 8;
      const x = s * 0.14;
      g.beginPath();
      g.moveTo(cx - x, cy - x);
      g.lineTo(cx + x, cy + x);
      g.moveTo(cx + x, cy - x);
      g.lineTo(cx - x, cy + x);
      g.stroke();
    });
    cell(2, (cx, cy, s) => {
      reticle(cx, cy, s);
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(cx - s * 0.15, cy + s * 0.01);
      g.lineTo(cx - s * 0.04, cy + s * 0.12);
      g.lineTo(cx + s * 0.16, cy - s * 0.12);
      g.stroke();
    });
    cell(3, (cx, cy, s) => {
      g.strokeStyle = '#fff';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(cx, cy, s * 0.44, 0, Math.PI * 2);
      g.stroke();
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  })();
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  geo.setAttribute('uv', quad.getAttribute('uv'));
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(SLOTS * 3), 3);
  const aCol = new THREE.InstancedBufferAttribute(new Float32Array(SLOTS * 4), 4); // rgb × opacity, size
  const aKind = new THREE.InstancedBufferAttribute(new Float32Array(SLOTS), 1);
  aPos.setUsage(THREE.DynamicDrawUsage);
  aCol.setUsage(THREE.DynamicDrawUsage);
  aKind.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPos', aPos);
  geo.setAttribute('aCol', aCol);
  geo.setAttribute('aKind', aKind);
  geo.instanceCount = SLOTS;
  const spriteMat = new THREE.ShaderMaterial({
    name: 'tower:sprites',
    uniforms: { uMap: { value: atlas } },
    vertexShader: /* glsl */ `
      attribute vec3 aPos; attribute vec4 aCol; attribute float aKind;
      varying vec2 vUv; varying vec3 vCol;
      void main() {
        vUv = vec2((uv.x + aKind) / 4.0, uv.y);
        vCol = aCol.rgb;
        vec4 mv = viewMatrix * vec4(aPos, 1.0);
        // pull the sprite 0.6 m toward the camera: it sits on a tube, not inside it
        mv.xyz += normalize(-mv.xyz) * 0.6;
        mv.xy += position.xy * aCol.w;
        gl_Position = projectionMatrix * mv;
        if (aCol.w <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; varying vec2 vUv; varying vec3 vCol;
      void main() {
        float a = texture2D(uMap, vUv).a;
        gl_FragColor = vec4(vCol * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    // depth-tested: the arm's glows must not shine through the halo deck when seen from the Ausguck
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const sprites = new THREE.Mesh(geo, spriteMat);
  sprites.name = 'tower:sprites';
  sprites.frustumCulled = false;
  sprites.renderOrder = 9;
  sprites.visible = false;
  group.add(sprites);
  onDispose(() => {
    beam.geometry.dispose();
    beamMat.dispose();
    geo.dispose();
    quad.dispose();
    spriteMat.dispose();
    atlas.dispose();
  });

  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const laserCol = new THREE.Color(1.0, 0.55, 0.22);
  const sensorCol = new THREE.Color(0.18, 0.83, 0.75);
  let anySprite = false;
  let beamOn = false;
  return {
    group,
    beam(a, b, kind, k) {
      if (k <= 0.002) {
        beamOn = false;
        return;
      }
      beamOn = true;
      dir.subVectors(b, a);
      const len = dir.length();
      dir.divideScalar(len || 1);
      beam.position.copy(a);
      beam.quaternion.setFromUnitVectors(up, dir);
      const r = kind === 'laser' ? 0.16 : 0.09;
      beam.scale.set(r, len, r);
      beamUni.uColor.value.copy(kind === 'laser' ? laserCol : sensorCol);
      beamUni.uK.value = k * (kind === 'laser' ? 1.6 : 0.8);
    },
    sprite(i, at, kind, size, color, opacity) {
      aPos.setXYZ(i, at.x, at.y, at.z);
      aCol.setXYZW(i, color.r * opacity, color.g * opacity, color.b * opacity, opacity > 0.001 ? size : 0);
      aKind.setX(i, KIND[kind]);
      if (opacity > 0.001) anySprite = true;
    },
    hideAll() {
      beamOn = false;
      for (let i = 0; i < SLOTS; i++) aCol.setW(i, 0);
      anySprite = false;
    },
    commit() {
      beam.visible = beamOn;
      sprites.visible = anySprite;
      aPos.needsUpdate = true;
      aCol.needsUpdate = true;
      aKind.needsUpdate = true;
    },
  };
}
