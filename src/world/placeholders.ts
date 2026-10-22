import * as THREE from 'three';
import type { ZoneContext, ZoneManifest } from '@/core/zones';
import { DEG, ZONE_PLOTS } from './layout';
import { merge } from './util';

/**
 * "Im Aufbau" placeholders on every plot (teal hologram of a massing model on a
 * projector, billboard title, hazard-taped gate barrier). A plot's placeholder hides
 * automatically when its zone becomes ready (`zone:ready`) and returns if the zone
 * fails to initialise (`zone:error` before it was ready) — see docs/ARCHITECTURE.md §6.
 */
export interface Placeholders {
  update(dt: number, t: number, cam: THREE.Vector3): void;
  /** ids currently showing a placeholder */
  showing(): string[];
}

const HOLO_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vPos;
void main() {
  vUv = uv;
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const HOLO_FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uColor;
varying vec2 vUv; varying vec3 vPos;
void main() {
  float scan = 0.55 + 0.45 * sin(vPos.y * 9.0 - uTime * 3.0);
  float band = smoothstep(0.0, 0.15, fract(vPos.y * 0.25 - uTime * 0.18)) * (1.0 - smoothstep(0.15, 0.3, fract(vPos.y * 0.25 - uTime * 0.18)));
  float fade = (1.0 - vUv.y) * (1.0 - vUv.y) * 0.9 + 0.1;
  float a = (0.05 + 0.06 * scan + 0.25 * band) * fade;
  gl_FragColor = vec4(uColor * a, a);
}`;

export function buildPlaceholders(ctx: ZoneContext, manifests: ZoneManifest[]): Placeholders {
  const M = ctx.materials;
  const byId = new Map(manifests.map((m) => [m.id, m]));
  const holoMat = new THREE.ShaderMaterial({
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x2dd4bf) } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    forceSinglePass: true, // additive: the order of the two sides does not matter (W1)
  });
  const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0x2dd4bf).multiplyScalar(1.3), transparent: true, opacity: 0.75, depthWrite: false });
  ctx.onDispose(() => {
    holoMat.dispose();
    lineMat.dispose();
  });

  // a generic massing model: plinth, hall, tower — read as "a building will be here"
  const massing = (() => {
    const boxes = [
      new THREE.BoxGeometry(12, 1.2, 9).translate(0, 0.6, 0),
      new THREE.BoxGeometry(9, 5, 6.5).translate(-0.8, 3.7, -0.6),
      new THREE.BoxGeometry(3.2, 9.5, 3.2).translate(3.4, 5.95, 1.6),
      new THREE.CylinderGeometry(2.6, 2.6, 0.6, 24).translate(-3, 6.5, -1),
    ];
    const edges = boxes.map((b) => new THREE.EdgesGeometry(b, 20));
    boxes.forEach((b) => b.dispose());
    return merge(edges);
  })();
  const projector = merge([new THREE.CylinderGeometry(2.4, 2.7, 0.35, 40).translate(0, 0.175, 0), new THREE.CylinderGeometry(0.9, 1.1, 0.25, 24).translate(0, 0.45, 0)]);
  const projRingGeo = new THREE.TorusGeometry(2.15, 0.05, 6, 64).rotateX(Math.PI / 2).translate(0, 0.36, 0);
  const holoGeo = new THREE.CylinderGeometry(7.2, 7.2, 11, 48, 1, true).translate(0, 5.5 + 0.5, 0);

  const items: { id: string; group: THREE.Group; model: THREE.LineSegments; ready: boolean; texts: THREE.Object3D[] }[] = [];
  for (const z of ZONE_PLOTS) {
    const group = new THREE.Group();
    group.name = `placeholder:${z.id}`;
    group.position.set(z.anchor[0], 0, z.anchor[2]);
    group.rotation.y = (z.facingDeg ?? 0) * DEG;
    ctx.root.add(group);
    const proj = new THREE.Mesh(projector, M.standard({ color: 0x292524, roughness: 0.4, metalness: 0.75 }));
    proj.receiveShadow = true;
    group.add(proj);
    group.add(new THREE.Mesh(projRingGeo, M.standard({ color: 0x2dd4bf, emissive: 0x2dd4bf, emissiveIntensity: 1.6 })));
    const holo = new THREE.Mesh(holoGeo, holoMat);
    holo.renderOrder = 6;
    group.add(holo);
    const model = new THREE.LineSegments(massing, lineMat);
    model.position.y = 0.8;
    model.renderOrder = 6;
    group.add(model);
    // barrier at the gate (local z ≈ 20.5): two posts with hazard tape
    const barrier = new THREE.Mesh(
      merge([new THREE.BoxGeometry(0.12, 1.1, 0.12).translate(-3.6, 0.55, 20.6), new THREE.BoxGeometry(0.12, 1.1, 0.12).translate(3.6, 0.55, 20.6), new THREE.BoxGeometry(0.5, 0.06, 0.5).translate(-3.6, 0.03, 20.6), new THREE.BoxGeometry(0.5, 0.06, 0.5).translate(3.6, 0.03, 20.6)]),
      M.railing,
    );
    group.add(barrier);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.14, 0.02), M.hazard(14));
    tape.position.set(0, 0.95, 20.6);
    group.add(tape);
    // billboard titles above the model
    const m = byId.get(z.id);
    const eyebrow = ctx.text3d.create({ text: { de: `// ${String(z.number).padStart(2, '0')} · IM AUFBAU`, en: `// ${String(z.number).padStart(2, '0')} · UNDER CONSTRUCTION` }, font: 'mono-medium', size: 0.42, color: 0x2dd4bf, glow: 1.25, anchorX: 'center', anchorY: 'bottom', letterSpacing: 0.12, billboard: true, position: [0, 12.8, 0] }, group);
    const title = ctx.text3d.create({ text: m?.name ?? z.name, font: 'display', size: 1.1, color: 0xf5f5f4, anchorX: 'center', anchorY: 'top', billboard: true, position: [0, 12.6, 0] }, group);
    items.push({ id: z.id, group, model, ready: false, texts: [eyebrow, title] });
  }

  const setReady = (id: string, ready: boolean): void => {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    it.ready = ready;
    it.group.visible = !ready;
  };
  for (const m of manifests) if (m.status === 'ready') setReady(m.id, true);
  ctx.events.on('zone:ready', ({ id }: { id: string }) => setReady(id, true));
  ctx.events.on('zone:error', ({ id }: { id: string }) => {
    // a zone that failed during init/load was disposed → show the placeholder again
    const st = ctx.zones.list().find((z) => z.id === id);
    if (st && st.status === 'error') {
      const it = items.find((i) => i.id === id);
      if (it && !it.ready) setReady(id, false);
    }
  });

  return {
    showing: () => items.filter((i) => !i.ready).map((i) => i.id),
    update(dt, t, cam) {
      holoMat.uniforms.uTime.value = t;
      for (const it of items) {
        if (it.ready) continue;
        it.model.rotation.y = t * 0.15;
        const d = Math.hypot(cam.x - it.group.position.x, cam.z - it.group.position.z);
        it.group.visible = d < 260;
      }
    },
  };
}
