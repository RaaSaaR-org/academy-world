/**
 * Virtual sensors on a private, static Rapier world (zone-local coordinates):
 *
 *   LiDAR    32 channels (−45° … +15°, wide-FOV head sensor), spinning 2 rev/s at 1° azimuth steps → ≈ 23 000 points/s,
 *            ≤ 2 048 rays per frame (cap), max range 30 m. Glass is invisible to it (G_GLASS is not in
 *            its mask). Mirrors reflect once; the point is plotted along the ORIGINAL ray at d₁ + d₂
 *            (that is how a real scanner places it) → ghost points / phantom corridors.
 *   Sonar    three ultrasonic cones (0°, ±30° of the view yaw, 15° half-angle, 3 m), 8 pings/s,
 *            hit glass too. Drawn as stone-100 points.
 *   Probe    one ray from the eye along the view (the crosshair readout), any mask.
 *
 * Points live in one ring buffer (60 000, one THREE.Points draw call) and fade over 2.5 s.
 */
import * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { ZoneContext } from '@/core/zones';
import type { SegClass, DepthKind } from './visor';

export const G_SOLID = 1;
export const G_GLASS = 2;
export const G_MIRROR = 4;
export const G_THIN = 8;
const groups = (member: number, filter = 0xffff): number => ((member & 0xffff) << 16) | (filter & 0xffff);
export const MASK_LIDAR = groups(0xffff, G_SOLID | G_MIRROR);
export const MASK_SONAR = groups(0xffff, G_SOLID | G_MIRROR | G_GLASS);
export const MASK_ALL = groups(0xffff, G_SOLID | G_MIRROR | G_GLASS | G_THIN);

export interface SurfaceInfo {
  /** probe readout name for SEG mode (seg class) */
  seg: SegClass;
  depth: DepthKind;
  /** RGB contrast against its background in % (crosshair readout); undefined = ordinary surface */
  contrast?: number;
  /** tagging target id (labor objects) */
  target?: string;
  /** mirror plane normal (local) */
  normal?: THREE.Vector3;
}

export interface ProbeHit {
  distance: number;
  info: SurfaceInfo | null;
  /** distance reported by a sensor that trusts mirrors (d₁ + d₂), else = distance */
  reported: number;
}

const CAPACITY = 60000;
const FADE = 2.5;
const CHANNELS = 32;
const EL_MIN = THREE.MathUtils.degToRad(-45);
const EL_MAX = THREE.MathUtils.degToRad(15);
const AZ_STEP = THREE.MathUtils.degToRad(1);
const AZ_RATE = 720; // azimuth steps per second (2 rev/s)
const RANGE = 30;

const POINTS_VERT = /* glsl */ `
  attribute float aBirth;
  attribute float aKind;
  uniform float uTime;
  uniform float uFade;
  uniform float uSize;
  varying float vA;
  varying float vKind;
  varying float vFresh;
  varying float vDist;
  varying float vH;
  void main() {
    vH = position.y;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
    float age = uTime - aBirth;
    vA = clamp(1.0 - age / uFade, 0.0, 1.0);
    vFresh = 1.0 - smoothstep(0.0, 0.12, age);
    vKind = aKind;
    vDist = dist;
    gl_PointSize = vA > 0.0 ? uSize * clamp(2.6 / dist, 0.7, 1.25) * (aKind > 0.5 ? 1.25 : 1.0) : 0.0;
  }`;
const POINTS_FRAG = /* glsl */ `
  uniform vec3 uTeal;
  uniform vec3 uTealDeep;
  uniform vec3 uStone;
  varying float vH;
  varying float vA;
  varying float vKind;
  varying float vFresh;
  varying float vDist;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    // colour by height (standard in point-cloud viewers): floor deep teal, objects bright teal
    vec3 col = vKind > 0.5 ? uStone : mix(uTealDeep, uTeal, smoothstep(0.1, 0.8, vH));
    // near points bright, far points dim: depth reads even without surfaces
    float near = mix(1.0, 0.4, smoothstep(1.5, 16.0, vDist));
    col = mix(col, vec3(1.0), vFresh * 0.5) * (0.35 + 0.95 * vA) * vA * near;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _r = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export class Lidar {
  readonly world: RAPIER_NS.World;
  readonly points: THREE.Points;
  private R: typeof RAPIER_NS;
  private info = new Map<number, SurfaceInfo>();
  private ray: RAPIER_NS.Ray;
  private pos: Float32Array;
  private birth: Float32Array;
  private kind: Float32Array;
  private head = 0;
  private dirty0 = -1;
  private dirtyCount = 0;
  private azimuth = 0;
  private azAcc = 0;
  private elJitter = 0;
  private sonarAcc = 0;
  private uniforms = {
    uTime: { value: 0 },
    uFade: { value: FADE },
    uSize: { value: 3 },
    uTeal: { value: new THREE.Color(0x5eead4).multiplyScalar(1.2) },
    uTealDeep: { value: new THREE.Color(0x0f766e).multiplyScalar(0.9) },
    uStone: { value: new THREE.Color(0xf5f5f4) },
  };
  /** colliders that follow objects (EMI) */
  private movers: { collider: RAPIER_NS.Collider; object: THREE.Object3D; yOff: number }[] = [];
  /** rays cast in the last frame (perf readout) */
  raysLastFrame = 0;
  sonarPings = 0;

  constructor(ctx: ZoneContext) {
    this.R = ctx.physics.rapier;
    this.world = ctx.physics.createPrivateWorld({ gravity: { x: 0, y: 0, z: 0 } });
    this.ray = new this.R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
    this.pos = new Float32Array(CAPACITY * 3);
    this.birth = new Float32Array(CAPACITY).fill(-1000);
    this.kind = new Float32Array(CAPACITY);
    const g = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    const ba = new THREE.BufferAttribute(this.birth, 1).setUsage(THREE.DynamicDrawUsage);
    const ka = new THREE.BufferAttribute(this.kind, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', pa);
    g.setAttribute('aBirth', ba);
    g.setAttribute('aKind', ka);
    const mat = new THREE.ShaderMaterial({
      name: 'sensordom:points',
      vertexShader: POINTS_VERT,
      fragmentShader: POINTS_FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      // a point cloud has no surfaces: every point of the last 2.5 s is drawn (mirror ghosts included)
      depthTest: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.points.visible = false;
    this.points.name = 'sensordom:pointcloud';
  }

  // ── colliders ──────────────────────────────────────────────────────────────
  private place(desc: RAPIER_NS.ColliderDesc, pos: THREE.Vector3, rot: THREE.Euler | null, group: number, info: SurfaceInfo): RAPIER_NS.Collider {
    desc.setTranslation(pos.x, pos.y, pos.z);
    if (rot) {
      _q.setFromEuler(rot);
      desc.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
    }
    desc.setCollisionGroups(groups(group));
    const c = this.world.createCollider(desc);
    this.info.set(c.handle, info);
    return c;
  }

  addBox(size: [number, number, number], pos: [number, number, number], rot: [number, number, number] | null, group: number, info: SurfaceInfo): RAPIER_NS.Collider {
    return this.place(this.R.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2), _p.set(pos[0], pos[1], pos[2]), rot ? _e.set(rot[0], rot[1], rot[2]) : null, group, info);
  }

  addCylinder(radius: number, height: number, pos: [number, number, number], group: number, info: SurfaceInfo): RAPIER_NS.Collider {
    return this.place(this.R.ColliderDesc.cylinder(height / 2, radius), _p.set(pos[0], pos[1], pos[2]), null, group, info);
  }

  /** Trimesh from a geometry already in zone-local coordinates. */
  addTrimesh(geo: THREE.BufferGeometry, group: number, info: SurfaceInfo): RAPIER_NS.Collider {
    const p = geo.getAttribute('position');
    const verts = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      verts[i * 3] = p.getX(i);
      verts[i * 3 + 1] = p.getY(i);
      verts[i * 3 + 2] = p.getZ(i);
    }
    let idx: Uint32Array;
    if (geo.index) idx = Uint32Array.from(geo.index.array as ArrayLike<number>);
    else idx = Uint32Array.from({ length: p.count }, (_, i) => i);
    return this.place(this.R.ColliderDesc.trimesh(verts, idx), _p.set(0, 0, 0), null, group, info);
  }

  /** A capsule that follows an object (EMI on its wheels). */
  addFollower(object: THREE.Object3D, radius: number, height: number, info: SurfaceInfo): void {
    const c = this.place(this.R.ColliderDesc.capsule(height / 2 - radius, radius), _p.copy(object.position).setY(height / 2), null, G_SOLID, info);
    this.movers.push({ collider: c, object, yOff: height / 2 });
  }

  infoOf(c: RAPIER_NS.Collider): SurfaceInfo | null {
    return this.info.get(c.handle) ?? null;
  }

  // ── rays ───────────────────────────────────────────────────────────────────
  private cast(o: THREE.Vector3, d: THREE.Vector3, max: number, mask: number, exclude?: RAPIER_NS.Collider): RAPIER_NS.RayColliderHit | null {
    const r = this.ray;
    r.origin.x = o.x;
    r.origin.y = o.y;
    r.origin.z = o.z;
    r.dir.x = d.x;
    r.dir.y = d.y;
    r.dir.z = d.z;
    return this.world.castRay(r, max, true, undefined, mask, exclude);
  }

  /**
   * One sensor ray. Returns the distance the SENSOR reports (mirror: d₁ + d₂ along the original
   * direction) or -1 for no return. `outInfo` receives the first surface hit.
   */
  private sense(o: THREE.Vector3, d: THREE.Vector3, max: number, mask: number): number {
    const hit = this.cast(o, d, max, mask);
    if (!hit) return -1;
    const info = this.info.get(hit.collider.handle);
    if (!info || info.depth !== 'mirror' || !info.normal) return hit.timeOfImpact;
    // specular reflection, once
    const t1 = hit.timeOfImpact;
    _p.copy(o).addScaledVector(d, t1);
    const n = info.normal;
    _r.copy(d).addScaledVector(n, -2 * d.dot(n));
    _p.addScaledVector(_r, 0.01);
    const hit2 = this.cast(_p, _r, max - t1, mask, hit.collider);
    return hit2 ? t1 + 0.01 + hit2.timeOfImpact : -1;
  }

  /** Crosshair probe: first surface along the ray (any mask) + what a mirror-trusting sensor reports. */
  probe(o: THREE.Vector3, d: THREE.Vector3, mask: number, out: ProbeHit): ProbeHit | null {
    const hit = this.cast(o, d, RANGE, mask);
    if (!hit) return null;
    out.distance = hit.timeOfImpact;
    out.info = this.info.get(hit.collider.handle) ?? null;
    out.reported = out.info?.depth === 'mirror' ? this.sense(o, d, RANGE, mask) : hit.timeOfImpact;
    return out;
  }

  // ── ring buffer ────────────────────────────────────────────────────────────
  private push(x: number, y: number, z: number, kind: number, now: number): void {
    const i = this.head;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.birth[i] = now;
    this.kind[i] = kind;
    if (this.dirty0 < 0) this.dirty0 = i;
    this.dirtyCount++;
    this.head = (i + 1) % CAPACITY;
  }

  private flush(): void {
    if (this.dirty0 < 0) return;
    const g = this.points.geometry;
    const pa = g.getAttribute('position') as THREE.BufferAttribute;
    const ba = g.getAttribute('aBirth') as THREE.BufferAttribute;
    const ka = g.getAttribute('aKind') as THREE.BufferAttribute;
    const start = this.dirty0;
    const count = Math.min(this.dirtyCount, CAPACITY);
    const first = Math.min(count, CAPACITY - start);
    const ranges: [number, number][] = [[start, first]];
    if (count > first) ranges.push([0, count - first]);
    for (const [s, n] of ranges) {
      pa.addUpdateRange(s * 3, n * 3);
      ba.addUpdateRange(s, n);
      ka.addUpdateRange(s, n);
    }
    pa.needsUpdate = true;
    ba.needsUpdate = true;
    ka.needsUpdate = true;
    this.dirty0 = -1;
    this.dirtyCount = 0;
  }

  clear(): void {
    this.birth.fill(-1000);
    const ba = this.points.geometry.getAttribute('aBirth') as THREE.BufferAttribute;
    ba.clearUpdateRanges();
    ba.needsUpdate = true;
    this.dirty0 = -1;
    this.dirtyCount = 0;
  }

  /** Keep follower colliders on their objects (call once per frame while scanning). */
  syncMovers(): void {
    for (const m of this.movers) {
      const p = m.object.position;
      m.collider.setTranslation({ x: p.x, y: p.y + m.yOff, z: p.z });
    }
  }

  /**
   * Spin the scanner for dt seconds from `eye` (local). Returns the number of rays cast.
   */
  scan(dt: number, eye: THREE.Vector3, now: number): number {
    this.azAcc += dt * AZ_RATE;
    let cols = Math.floor(this.azAcc);
    this.azAcc -= cols;
    cols = Math.min(cols, Math.floor(2048 / CHANNELS));
    let rays = 0;
    const spacing = (EL_MAX - EL_MIN) / (CHANNELS - 1);
    for (let c = 0; c < cols; c++) {
      this.azimuth += AZ_STEP;
      if (this.azimuth > Math.PI * 2) {
        // per-revolution jitter fills the gaps between scan lines over time (like a sensor that moves)
        this.azimuth -= Math.PI * 2 - Math.random() * AZ_STEP;
        this.elJitter = (Math.random() - 0.5) * spacing * 0.8;
      }
      const az = this.azimuth;
      const ca = Math.cos(az),
        sa = Math.sin(az);
      for (let ch = 0; ch < CHANNELS; ch++) {
        const el = EL_MIN + spacing * ch + this.elJitter;
        const ce = Math.cos(el);
        _d.set(sa * ce, Math.sin(el), -ca * ce);
        const dist = this.sense(eye, _d, RANGE, MASK_LIDAR);
        rays++;
        if (dist > 0) this.push(eye.x + _d.x * dist, eye.y + _d.y * dist, eye.z + _d.z * dist, 0, now);
      }
    }
    this.raysLastFrame = rays;
    return rays;
  }

  /**
   * Ultrasonic cones around the horizontal view direction `yaw` (local, 0 = facing −Z).
   * Returns true on a ping frame.
   */
  sonar(dt: number, eye: THREE.Vector3, yaw: number, now: number): boolean {
    this.sonarAcc += dt;
    if (this.sonarAcc < 0.125) return false;
    this.sonarAcc = 0;
    this.sonarPings++;
    _o.copy(eye).setY(eye.y - 0.45); // chest-mounted transducers
    const half = THREE.MathUtils.degToRad(15);
    for (const off of [0, Math.PI / 6, -Math.PI / 6]) {
      const base = yaw + off;
      // an ultrasonic sensor reports ONE distance per cone: the nearest echo
      let tMin = Infinity;
      for (let i = -3; i <= 3; i++) {
        for (let j = -2; j <= 2; j++) {
          const a = base + (i / 3) * half;
          const el = -0.05 + (j / 2) * half;
          const ce = Math.cos(el);
          _d.set(-Math.sin(a) * ce, Math.sin(el), -Math.cos(a) * ce);
          const hit = this.cast(_o, _d, 3, MASK_SONAR);
          if (hit && hit.timeOfImpact < tMin) tMin = hit.timeOfImpact;
        }
      }
      if (!Number.isFinite(tMin)) continue;
      // …so it is drawn as an echo arc across the whole cone (the bearing inside the cone is unknown)
      for (let i = -6; i <= 6; i++) {
        const a = base + (i / 6) * half;
        for (const el of [-0.06, 0, 0.06]) {
          const ce = Math.cos(el);
          this.push(_o.x - Math.sin(a) * ce * tMin, _o.y + Math.sin(el) * tMin, _o.z - Math.cos(a) * ce * tMin, 1, now);
        }
      }
    }
    return true;
  }

  /** Write a burst of decorative points (e.g. EMI's scan of a tagged object). */
  splash(center: THREE.Vector3, radius: number, n: number, now: number): void {
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1,
        th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      this.push(center.x + radius * s * Math.cos(th), center.y + radius * u, center.z + radius * s * Math.sin(th), 0, now);
    }
  }

  update(now: number): void {
    this.uniforms.uTime.value = now;
    this.flush();
  }

  setPixelRatio(pr: number): void {
    this.uniforms.uSize.value = 3 * pr;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.info.clear();
    this.movers = [];
  }
}
