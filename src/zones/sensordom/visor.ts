/**
 * EMI's Messbrille: four real render modes on the zone's own meshes (GDD §7.1 Station A).
 *
 *   RGB    the meshes' own materials
 *   TIEFE  per-pixel camera distance → ramp #F5F5F4 (0.3 m) → #0F3D38 (12 m) → black, with
 *          animated noise σ ∝ z² and 0.5 m depth banding; glass / black velvet = no return (black)
 *   LIDAR  every mesh becomes a black occluder (glass hidden); the point cloud (lidar.ts) is the image
 *   SEG    flat class colours (MeshBasic look); glass invisible, mirror = unknown
 *
 * A switch sends a teal wavefront out from the player that reveals the new image.
 * No per-frame allocations: uniforms are shared objects, mode swaps only touch registered meshes.
 */
import * as THREE from 'three';

export type VisorMode = 'rgb' | 'tiefe' | 'lidar' | 'seg';
export const MODES: VisorMode[] = ['rgb', 'tiefe', 'lidar', 'seg'];

/** segmentation classes; 'unbekannt' = background colour, 'unsichtbar' = not drawn (glass) */
export type SegClass = 'boden' | 'struktur' | 'moebel' | 'geraet' | 'becher' | 'kiste' | 'kabel' | 'roboter' | 'unbekannt' | 'unsichtbar';
/** depth camera behaviour: normal return, no return (black), mirror (reports the reflected path) */
export type DepthKind = 'normal' | 'none' | 'mirror';

export const SEG_COLORS: Record<Exclude<SegClass, 'unsichtbar'>, number> = {
  boden: 0x3a3532, // floor
  struktur: 0x232020, // walls, dome
  moebel: 0x57534e, // stone-600 (table, shelf)
  geraet: 0x44403c, // stone-700 (instruments)
  becher: 0x2dd4bf, // teal
  kiste: 0xd6d3d1, // stone-300
  kabel: 0x0f8f80, // #14B8A6 muted
  roboter: 0xcc5200, // EMI (orange-dark: orange stays a small accent)
  unbekannt: 0x0c0a09, // background
};

export interface VisorTags {
  /** 'attr' = per-vertex aSeg / aDepth (merged buckets of mixed classes) */
  seg: SegClass | 'attr';
  depth?: DepthKind | 'attr';
  /** LIDAR mode: black occluder (default) or hidden (glass: the laser passes) */
  lidar?: 'occlude' | 'hide';
}

interface Entry {
  mesh: THREE.Mesh;
  rgb: THREE.Material | THREE.Material[];
  visible: boolean;
  tags: Required<VisorTags>;
}

const BG = new THREE.Color(0x0c0a09);
/** every visor image must cover the island's plot pad (paving polygonOffset −2/−4) */
const OFFSET = { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 } as const;

const VERT = /* glsl */ `
  #include <common>
  varying vec3 vView;
  varying vec3 vWorld;
  #ifdef SD_ATTR
    attribute vec3 aSeg;
    attribute float aDepth;
    varying vec3 vSeg;
    varying float vDepth;
  #endif
  void main() {
    #ifdef SD_ATTR
      vSeg = aSeg;
      vDepth = aDepth;
    #endif
    #include <begin_vertex>
    vec4 wp = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      wp = instanceMatrix * wp;
    #endif
    wp = modelMatrix * wp;
    vWorld = wp.xyz;
    vec4 mv = viewMatrix * wp;
    vView = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;

const WAVE = /* glsl */ `
  uniform vec3 uWaveO;
  uniform float uWaveR;
  uniform vec3 uTeal;
  uniform vec3 uBg;
  vec3 wave(vec3 c) {
    float w = length(vWorld - uWaveO);
    float front = uWaveR - w;
    vec3 o = front < 0.0 ? uBg : c;
    // thin teal wavefront, fading out once the wave has crossed the dome
    float edge = (1.0 - smoothstep(0.0, 0.18, abs(front))) + 0.45 * (1.0 - smoothstep(0.0, 1.6, front)) * step(0.0, front);
    return o + uTeal * edge * (1.0 - smoothstep(16.0, 32.0, uWaveR)) * 1.5;
  }`;

const DEPTH_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uNoise;
  uniform float uExtra;
  uniform float uNoReturn;
  uniform vec3 uNear;
  uniform vec3 uFar;
  varying vec3 vView;
  varying vec3 vWorld;
  #ifdef SD_ATTR
    varying float vDepth;
  #endif
  ${WAVE}
  // integer hash (PCG-style): no visible streaks
  float hash(uvec3 v) {
    uint h = v.x * 1973u + v.y * 9277u + v.z * 26699u;
    h = (h ^ (h >> 16u)) * 0x45d9f3bu;
    h = (h ^ (h >> 16u)) * 0x45d9f3bu;
    h = h ^ (h >> 16u);
    return float(h) / 4294967295.0;
  }
  void main() {
    vec3 c;
    float extra = uExtra;
    float noReturn = uNoReturn;
    #ifdef SD_ATTR
      if (vDepth > 1.5) extra = 3.2; else if (vDepth > 0.5) noReturn = 1.0;
    #endif
    if (noReturn > 0.5) {
      c = vec3(0.0);
    } else {
      float d = length(vView) + extra;
      // per-pixel noise, re-rolled 30× per second; sum of three uniforms ≈ gaussian (σ = 1)
      uvec2 px = uvec2(gl_FragCoord.xy);
      uint fr = uint(uTime * 30.0);
      float n = (hash(uvec3(px, fr)) + hash(uvec3(px, fr + 7919u)) + hash(uvec3(px, fr + 104729u)) - 1.5) * 2.0;
      float dn = d + n * uNoise * d * d;            // measured depth: σ(z) = k · z²
      float t = pow(clamp((dn - 0.3) / 11.7, 0.0, 1.0), 0.7);
      c = mix(uNear, uFar, t);
      c *= 0.86 + 0.14 * cos(6.2831853 * d / 0.5); // 0.5 m iso-bands: steps in depth become visible
      c *= 1.0 - smoothstep(11.0, 13.5, d);         // beyond the sensor's range: no data (black)
      // dropouts (no return) become more frequent with range
      if (hash(uvec3(px, fr + 15485863u)) < 0.0012 * max(0.0, d - 2.0) * max(0.0, d - 2.0)) c = vec3(0.0);
    }
    gl_FragColor = vec4(wave(c), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const FLAT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vView;
  varying vec3 vWorld;
  #ifdef SD_ATTR
    varying vec3 vSeg;
  #endif
  ${WAVE}
  void main() {
    // a whisper of distance falloff keeps the flat classes readable as space
    float d = length(vView);
    vec3 col = uColor;
    #ifdef SD_ATTR
      col = vSeg;
    #endif
    vec3 c = col * (1.0 - 0.25 * smoothstep(4.0, 22.0, d));
    gl_FragColor = vec4(wave(c), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class Visor {
  mode: VisorMode = 'rgb';
  /** shared uniforms (no per-frame allocation) */
  readonly uniforms = {
    uTime: { value: 0 },
    uNoise: { value: 0.004 }, // visual σ = 4 mm·z² (2× the toy model so the grain reads on screen)
    uWaveO: { value: new THREE.Vector3() },
    uWaveR: { value: 999 },
    uTeal: { value: new THREE.Color(0x2dd4bf) },
    uBg: { value: BG.clone() },
    uNear: { value: new THREE.Color(0xf5f5f4) },
    uFar: { value: new THREE.Color(0x0f3d38) },
  };
  private entries: Entry[] = [];
  private byMesh = new Map<THREE.Mesh, Entry>();
  private rgbOnly: THREE.Object3D[] = [];
  private emiRoots: THREE.Object3D[] = [];
  private depthMat: THREE.ShaderMaterial;
  private depthNone: THREE.ShaderMaterial;
  private depthMirror: THREE.ShaderMaterial;
  private depthAttr: THREE.ShaderMaterial;
  private segAttr: THREE.ShaderMaterial;
  private black: THREE.MeshBasicMaterial;
  private segMats = new Map<SegClass, THREE.ShaderMaterial>();
  private waveT0 = -100;
  private listeners: ((m: VisorMode) => void)[] = [];

  constructor() {
    const mk = (extra: number, noReturn: number, attr = false): THREE.ShaderMaterial =>
      new THREE.ShaderMaterial({
        name: 'sensordom:depth',
        defines: attr ? { SD_ATTR: '' } : {},
        vertexShader: VERT,
        fragmentShader: DEPTH_FRAG,
        uniforms: { ...this.uniforms, uExtra: { value: extra }, uNoReturn: { value: noReturn } },
        side: THREE.DoubleSide,
        fog: false,
        ...OFFSET,
      });
    this.depthMat = mk(0, 0);
    this.depthNone = mk(0, 1);
    // a mirror reports the reflected path: on average ~3 m too far (toy value for the room)
    this.depthMirror = mk(3.2, 0);
    this.depthAttr = mk(0, 0, true);
    this.segAttr = new THREE.ShaderMaterial({
      name: 'sensordom:seg-attr',
      defines: { SD_ATTR: '' },
      vertexShader: VERT,
      fragmentShader: FLAT_FRAG,
      uniforms: { ...this.uniforms, uColor: { value: new THREE.Color(0) } },
      side: THREE.DoubleSide,
      fog: false,
      ...OFFSET,
    });
    this.black = new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.DoubleSide, name: 'sensordom:black', ...OFFSET });
  }

  private segMat(c: SegClass | 'attr'): THREE.ShaderMaterial {
    if (c === 'attr') return this.segAttr;
    let m = this.segMats.get(c);
    if (!m) {
      const col = c === 'unsichtbar' ? 0 : SEG_COLORS[c];
      m = new THREE.ShaderMaterial({
        name: `sensordom:seg-${c}`,
        vertexShader: VERT,
        fragmentShader: FLAT_FRAG,
        uniforms: { ...this.uniforms, uColor: { value: new THREE.Color(col) } },
        side: THREE.DoubleSide,
        fog: false,
        ...OFFSET,
      });
      this.segMats.set(c, m);
    }
    return m;
  }

  register(mesh: THREE.Mesh, tags: VisorTags): void {
    if (this.byMesh.has(mesh)) return;
    const e: Entry = { mesh, rgb: mesh.material, visible: mesh.visible, tags: { seg: tags.seg, depth: tags.depth ?? 'normal', lidar: tags.lidar ?? 'occlude' } };
    this.entries.push(e);
    this.byMesh.set(mesh, e);
    if (this.mode !== 'rgb') this.applyEntry(e);
  }

  /** Forget a mesh (Z1: an original folded into a merged mesh); it keeps its RGB material. */
  unregister(mesh: THREE.Mesh): void {
    const e = this.byMesh.get(mesh);
    if (!e) return;
    mesh.material = e.rgb;
    mesh.visible = e.visible;
    this.byMesh.delete(mesh);
    this.entries.splice(this.entries.indexOf(e), 1);
  }

  /** The tags a mesh was registered with (null = not registered). */
  tagsOf(mesh: THREE.Object3D): Readonly<Required<VisorTags>> | null {
    return this.byMesh.get(mesh as THREE.Mesh)?.tags ?? null;
  }

  /** Change the RGB material of a registered mesh (e.g. darkroom lights on/off). */
  setRgbMaterial(mesh: THREE.Mesh, m: THREE.Material): void {
    const e = this.byMesh.get(mesh);
    if (!e) return;
    e.rgb = m;
    if (this.mode === 'rgb') mesh.material = m;
  }

  /** Objects shown only in RGB (troika texts, decals): the sensors do not see printed words. */
  registerRgbOnly(o: THREE.Object3D): void {
    this.rgbOnly.push(o);
    o.visible = this.mode === 'rgb';
  }

  /** EMI unit: all its meshes become class 'roboter' (traversed at every switch: EMI swaps ring materials itself). */
  registerEmi(root: THREE.Object3D): void {
    this.emiRoots.push(root);
  }

  onChange(fn: (m: VisorMode) => void): void {
    this.listeners.push(fn);
  }

  /** Switch mode; the wave starts at `originWorld`. */
  setMode(mode: VisorMode, originWorld?: THREE.Vector3, now = 0): void {
    if (mode === this.mode) return;
    this.mode = mode;
    for (const e of this.entries) this.applyEntry(e);
    for (const o of this.rgbOnly) o.visible = mode === 'rgb';
    for (const root of this.emiRoots) this.applyEmi(root);
    if (originWorld) this.uniforms.uWaveO.value.copy(originWorld);
    this.waveT0 = originWorld ? now : -100;
    this.uniforms.uWaveR.value = originWorld ? 0 : 999;
    for (const fn of this.listeners) fn(mode);
  }

  private applyEntry(e: Entry): void {
    const { mesh, tags } = e;
    mesh.visible = e.visible;
    switch (this.mode) {
      case 'rgb':
        mesh.material = e.rgb;
        break;
      case 'tiefe':
        mesh.material = tags.depth === 'attr' ? this.depthAttr : tags.depth === 'none' ? this.depthNone : tags.depth === 'mirror' ? this.depthMirror : this.depthMat;
        break;
      case 'lidar':
        mesh.material = this.black;
        if (tags.lidar === 'hide') mesh.visible = false;
        break;
      case 'seg':
        if (tags.seg === 'unsichtbar') mesh.visible = false;
        else mesh.material = this.segMat(tags.seg);
        break;
    }
  }

  private emiOriginals = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private applyEmi(root: THREE.Object3D): void {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.__highlight) return;
      if (this.mode === 'rgb') {
        const orig = this.emiOriginals.get(m);
        if (orig) m.material = orig;
        this.emiOriginals.delete(m);
        return;
      }
      if (!this.emiOriginals.has(m)) this.emiOriginals.set(m, m.material);
      m.material = this.mode === 'tiefe' ? this.depthMat : this.mode === 'lidar' ? this.black : this.segMat('roboter');
    });
  }

  update(now: number): void {
    this.uniforms.uTime.value = now;
    if (this.waveT0 > -50) {
      const r = (now - this.waveT0) * 22; // m/s
      this.uniforms.uWaveR.value = r;
      if (r > 60) {
        this.waveT0 = -100;
        this.uniforms.uWaveR.value = 999;
      }
    }
  }

  dispose(): void {
    this.depthMat.dispose();
    this.depthNone.dispose();
    this.depthMirror.dispose();
    this.depthAttr.dispose();
    this.segAttr.dispose();
    this.black.dispose();
    for (const m of this.segMats.values()) m.dispose();
    this.entries = [];
    this.byMesh.clear();
    this.rgbOnly = [];
    this.emiRoots = [];
    this.listeners = [];
  }
}
