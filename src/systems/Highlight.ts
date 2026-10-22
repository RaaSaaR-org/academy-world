import * as THREE from 'three';

/**
 * Hover highlight: an additive orange fresnel rim drawn as an overlay over the focused
 * object's meshes (shares their geometry, no material mutation). Cheap: only the
 * focused object gets overlays, created lazily and cached per object.
 */
const rimMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uColor: { value: new THREE.Color(0xff6700) },
    uStrength: { value: 0 },
  },
  vertexShader: /* glsl */ `
    #include <common>
    #include <skinning_pars_vertex>
    varying vec3 vN; varying vec3 vV;
    void main() {
      #include <beginnormal_vertex>
      #include <skinbase_vertex>
      #include <skinnormal_vertex>
      #include <begin_vertex>
      #include <skinning_vertex>
      vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
      vN = normalize(normalMatrix * objectNormal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uStrength;
    varying vec3 vN; varying vec3 vV;
    void main() {
      float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
      // steep rim, faint fill: flat faces at grazing angles must not turn a big crate solid
      // orange (brand: orange ≤ 5 % of the screen)
      float a = (pow(f, 3.5) * 0.8 + 0.03) * uStrength;
      gl_FragColor = vec4(uColor * a * 1.4, 1.0);
    }`,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  depthFunc: THREE.LessEqualDepth,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
  fog: false,
  toneMapped: false,
});
rimMaterial.name = 'core:highlight-rim';

const noRaycast = (): void => {};

export class Highlighter {
  private overlays = new WeakMap<THREE.Object3D, THREE.Mesh[]>();
  private current: THREE.Object3D | null = null;
  private strength = 0;
  private target = 0;

  setColor(color: THREE.ColorRepresentation): void {
    (rimMaterial.uniforms.uColor.value as THREE.Color).set(color);
  }

  focus(object: THREE.Object3D | null): void {
    if (object === this.current) return;
    if (this.current) this.setVisible(this.current, false);
    this.current = object;
    this.strength = 0;
    if (object) {
      this.ensure(object);
      this.setVisible(object, true);
    }
    this.target = object ? 1 : 0;
  }

  forget(object: THREE.Object3D): void {
    const list = this.overlays.get(object);
    if (list) for (const m of list) m.removeFromParent();
    this.overlays.delete(object);
    if (this.current === object) this.current = null;
  }

  update(dt: number): void {
    this.strength += (this.target - this.strength) * (1 - Math.exp(-dt * 14));
    rimMaterial.uniforms.uStrength.value = this.strength;
  }

  private ensure(object: THREE.Object3D): void {
    if (this.overlays.has(object)) return;
    const list: THREE.Mesh[] = [];
    const meshes: THREE.Mesh[] = [];
    object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry || m.userData.__highlight || m.userData.noHighlight) return;
      if ((m as THREE.InstancedMesh).isInstancedMesh || (m.geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry) return;
      meshes.push(m);
    });
    for (const m of meshes.slice(0, 24)) {
      const sk = m as THREE.SkinnedMesh;
      let ov: THREE.Mesh;
      if (sk.isSkinnedMesh) {
        const s = new THREE.SkinnedMesh(m.geometry, rimMaterial);
        s.bind(sk.skeleton, sk.bindMatrix);
        ov = s;
      } else ov = new THREE.Mesh(m.geometry, rimMaterial);
      ov.userData.__highlight = true;
      ov.raycast = noRaycast;
      ov.castShadow = false;
      ov.receiveShadow = false;
      ov.renderOrder = 10;
      ov.visible = false;
      ov.name = 'highlight';
      m.add(ov);
      list.push(ov);
    }
    this.overlays.set(object, list);
  }

  private setVisible(object: THREE.Object3D, v: boolean): void {
    const list = this.overlays.get(object);
    if (list) for (const m of list) m.visible = v;
  }
}
