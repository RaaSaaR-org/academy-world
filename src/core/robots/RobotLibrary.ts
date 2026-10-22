import * as THREE from 'three';
import type { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ROBOTS, ROBOT_LINEUP, robotInfo, type RobotId, type RobotManifestEntry } from '@/robots/manifest';
import { RobotModel } from './RobotModel';
import type { RobotBody, RobotLoadOptions } from './types';

/** What the library needs from the engine (all optional: the dev gallery runs without a Game). */
export interface RobotLibraryDeps {
  /** shared materials: the robots' vertex-colour paint is one cached `standard()` material */
  materials?: { standard(params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial };
  /** prewarm() draws a new robot once into a 1×1 target in an idle slot, so its buffers upload early */
  renderer?: THREE.WebGLRenderer;
  /** compile a subtree's programs against the live scene (RenderSystem.warmUp({ root })) */
  compile?: (root: THREE.Object3D) => Promise<void>;
  /**
   * The same for the shadow pass's depth programs, which render into a render target (no tone
   * mapping, linear output). Default: `compile` (RenderSystem.warmUp already compiles against its
   * composer's input target, so the game needs nothing extra).
   */
  compileShadow?: (root: THREE.Object3D) => Promise<void>;
  /** an idle slot between frames (default: requestIdleCallback, at most 250 ms away) */
  idle?: () => Promise<void>;
}

interface Loaded {
  gltf: GLTF;
  lod0: THREE.BufferGeometry;
  lod1: THREE.BufferGeometry | null;
  lod2: THREE.BufferGeometry | null;
  /** the parsed skin: bones in body order and their inverse bind matrices (quantization folded in) */
  skeleton: THREE.Skeleton;
  bodies: Map<number, Promise<readonly RobotBody[]>>;
  users: number;
  warmed: boolean;
}

/** The robots' paint: vendor colours live in the vertices, so every robot shares ONE material (one program). */
export const ROBOT_PAINT: THREE.MeshStandardMaterialParameters = { vertexColors: true, roughness: 0.55, metalness: 0 };

function defaultIdle(): Promise<void> {
  const ric = (globalThis as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  return new Promise((r) => (ric ? ric(() => r(), { timeout: 250 }) : setTimeout(r, 16)));
}

/**
 * Loads the real robot models of src/robots (manifest + GLBs) on demand. Nothing is fetched until
 * a robot is asked for: the GLB URL itself is a dynamic import, and GLTFLoader, three's meshopt
 * decoder (MIT, WebAssembly inside the JS, no request) and SkeletonUtils load with the first robot.
 * One parse per GLB; instances are skeleton clones that share geometry and the paint material.
 */
export class RobotLibrary {
  private loader: Promise<GLTFLoader> | null = null;
  private cache = new Map<RobotId, Promise<Loaded>>();
  private silhouettes = new Map<RobotId, Promise<THREE.BufferGeometry>>();
  private lineup: Promise<THREE.BufferGeometry> | null = null;
  private skeletonUtils: Promise<typeof import('three/examples/jsm/utils/SkeletonUtils.js')> | null = null;
  private ownPaint: THREE.MeshStandardMaterial | null = null;
  private readonly live = new Set<RobotModel>();

  constructor(private readonly deps: RobotLibraryDeps = {}) {}

  /** Every robot the build knows (manifest rows: licence, attribution, measured stats). */
  get all(): readonly RobotManifestEntry[] {
    return ROBOTS;
  }

  info(id: RobotId): RobotManifestEntry {
    return robotInfo(id);
  }

  /** The one shared paint material (from the MaterialLibrary when the engine provides it). */
  get paint(): THREE.MeshStandardMaterial {
    if (this.deps.materials) return this.deps.materials.standard(ROBOT_PAINT);
    return (this.ownPaint ??= Object.assign(new THREE.MeshStandardMaterial(ROBOT_PAINT), { name: 'robot:paint' }));
  }

  private getLoader(): Promise<GLTFLoader> {
    this.loader ??= Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')]).then(([g, m]) => {
      const decoder = m.MeshoptDecoder;
      // decode in a worker (Blob URL, same origin): the main thread only builds the objects. A browser
      // whose Worker constructor throws (workers blocked) decodes on the main thread instead.
      if (typeof Worker !== 'undefined') {
        try {
          decoder.useWorkers(1);
        } catch {
          /* no workers: MeshoptDecoder decodes synchronously */
        }
      }
      return new g.GLTFLoader().setMeshoptDecoder(decoder);
    });
    this.loader.catch(() => (this.loader = null));
    return this.loader;
  }

  private fetch(id: RobotId): Promise<Loaded> {
    let p = this.cache.get(id);
    if (!p) {
      p = (async () => {
        const [loader, url] = await Promise.all([this.getLoader(), robotInfo(id).glb()]);
        // Vite's ?url already carries the deployment base
        const gltf = await loader.loadAsync(url.default);
        let lod0: THREE.BufferGeometry | null = null;
        let lod1: THREE.BufferGeometry | null = null;
        let lod2: THREE.BufferGeometry | null = null;
        let skeleton: THREE.Skeleton | null = null;
        gltf.scene.traverse((n) => {
          const m = n as THREE.SkinnedMesh;
          if (!m.isSkinnedMesh) return;
          (m.material as THREE.Material).dispose();
          if (n.userData.lod === 'lod1') lod1 = m.geometry;
          else if (n.userData.lod === 'lod2') lod2 = m.geometry;
          else {
            lod0 = m.geometry;
            skeleton = m.skeleton;
          }
        });
        if (!lod0 || !skeleton) throw new Error(`robot ${id}: no skinned mesh in the GLB`);
        return { gltf, lod0, lod1, lod2, skeleton, bodies: new Map(), users: 0, warmed: false };
      })();
      this.cache.set(id, p);
      p.catch(() => this.cache.delete(id));
    }
    return p;
  }

  /** A new instance in the model's default pose (or `o.pose`). */
  async load(id: RobotId, o: RobotLoadOptions = {}): Promise<RobotModel> {
    const info = robotInfo(id);
    this.skeletonUtils ??= import('three/examples/jsm/utils/SkeletonUtils.js');
    const [rec, su, silGeo] = await Promise.all([this.fetch(id), this.skeletonUtils, o.silhouette ? this.silhouetteGeometry(id) : Promise.resolve(null)]);
    const scene = su.clone(rec.gltf.scene);
    let mesh: THREE.SkinnedMesh | null = null;
    const drop: THREE.Object3D[] = [];
    scene.traverse((n) => {
      const m = n as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      if (n.userData.lod === 'lod1' || n.userData.lod === 'lod2') drop.push(n);
      else mesh = m;
    });
    // one skinned mesh per instance; LOD1 / LOD2 are the same mesh with their own index lists
    for (const n of drop) n.removeFromParent();
    if (!mesh) throw new Error(`robot ${id}: no skinned mesh`);
    const skinned = mesh as THREE.SkinnedMesh;
    skinned.material = this.paint;
    skinned.geometry = rec.lod0;
    // culling stays on with a sphere that holds every pose (three would otherwise CPU-skin all vertices once)
    skinned.boundingSphere = new THREE.Sphere(new THREE.Vector3(...info.bounds.center), info.bounds.radius);
    const cast = o.castShadow ?? info.heightM >= 1;
    skinned.castShadow = cast;
    skinned.receiveShadow = o.receiveShadow ?? true;
    let silhouette: THREE.Mesh | null = null;
    if (silGeo) {
      silhouette = new THREE.Mesh(silGeo, this.paint);
      silhouette.name = `${id}:silhouette`;
      silhouette.castShadow = cast;
      silhouette.matrixAutoUpdate = false;
      silhouette.updateMatrix();
    }
    rec.users++;
    const model = new RobotModel(id, info, {
      scene,
      mesh: skinned,
      lod0: rec.lod0,
      lod1: rec.lod1,
      lod2: rec.lod2,
      silhouette,
      onDispose: () => {
        rec.users--;
        this.live.delete(model);
      },
    });
    if (o.pose) model.setPose(o.pose);
    if (o.lod !== undefined) model.lod = o.lod;
    this.live.add(model);
    return model;
  }

  private silhouetteGeometry(id: RobotId): Promise<THREE.BufferGeometry> {
    let p = this.silhouettes.get(id);
    if (!p) {
      p = this.staticGeometry(robotInfo(id).silhouette, id);
      this.silhouettes.set(id, p);
      p.catch(() => this.silhouettes.delete(id));
    }
    return p;
  }

  /** A static GLB (one mesh, dequantized by its node transform) as plain geometry. */
  private async staticGeometry(url: () => Promise<{ default: string }>, what: string): Promise<THREE.BufferGeometry> {
    const [loader, u] = await Promise.all([this.getLoader(), url()]);
    const gltf = await loader.loadAsync(u.default);
    let geo: THREE.BufferGeometry | null = null;
    gltf.scene.traverse((n) => {
      const m = n as THREE.Mesh;
      if (!m.isMesh || geo) return;
      (m.material as THREE.Material).dispose();
      // the dequantization lives in the node transform: bake it (into float attributes: the quantized
      // ones are integers), so the mesh can sit anywhere
      n.updateWorldMatrix(true, false);
      geo = toFloat(m.geometry).applyMatrix4(n.matrixWorld);
      m.geometry.dispose();
    });
    if (!geo) throw new Error(`robot ${what}: empty static mesh`);
    return geo;
  }

  /**
   * The static far silhouette (default pose, ≈ 1–3 k triangles) as its own mesh, e.g. for a height
   * wall or far plinths. Shares geometry and material with every other silhouette of this robot.
   */
  async loadSilhouette(id: RobotId): Promise<THREE.Mesh> {
    const m = new THREE.Mesh(await this.silhouetteGeometry(id), this.paint);
    m.name = `${id}:silhouette`;
    m.userData.robot = id;
    return m;
  }

  /**
   * Get a robot ready before it is shown, one step per idle slot: fetch + parse (decoding in a
   * worker), compile the paint program against the live scene, then one draw into a 1×1 target
   * so geometry, bone texture and vertex arrays are uploaded. The first visible frame then only
   * binds them (R7 §4.3 measured 31–63 ms for an unwarmed first frame at 4× CPU).
   */
  async prewarm(id: RobotId): Promise<void> {
    const idle = this.deps.idle ?? defaultIdle;
    await idle();
    const rec = await this.fetch(id);
    if (rec.warmed) return;
    await idle();
    const model = await this.load(id, { castShadow: false });
    try {
      if (this.deps.compile) {
        await idle();
        await this.deps.compile(model.object);
        // shadow casters: the depth programs the shadow pass will use (three draws a FrontSide
        // material's shadow with a BackSide MeshDepthMaterial)
        await idle();
        await withMaterial(model.object, depthMaterial(), () => (this.deps.compileShadow ?? this.deps.compile!)(model.object));
      }
      const r = this.deps.renderer;
      if (r) {
        await idle();
        await compileUpload(r, model);
        await idle();
        uploadOnce(r, model);
        for (const lod of [1, 2] as const) {
          if (!(lod === 1 ? rec.lod1 : rec.lod2)) continue;
          await idle();
          model.lod = lod;
          uploadOnce(r, model);
        }
      }
      rec.warmed = true;
    } finally {
      model.dispose();
    }
  }

  /** Loaded robots (debug: __academy-style overlays and tests). */
  loaded(): { id: RobotId; lod: string; triangles: number; joints: number }[] {
    return [...this.live].map((m) => ({ id: m.id, lod: String(m.shownLod), triangles: m.triangles, joints: m.joints.length }));
  }

  /** Drop the parsed GLB of a robot nobody uses any more (its GPU buffers go with it). */
  release(id: RobotId): boolean {
    const p = this.cache.get(id);
    if (!p) return false;
    void p.then((rec) => {
      if (rec.users > 0) return;
      this.cache.delete(id);
      rec.lod0.dispose();
      rec.lod1?.dispose();
      rec.lod2?.dispose();
      for (const b of rec.bodies.values()) void b.then((list) => list.forEach((x) => x.geometry.dispose()));
    });
    return true;
  }

  /**
   * WP17 (suspend, plan §5.9): give back the GPU copies of a robot whose models are all out of the scene (a
   * suspended ground area): its LODs' vertex buffers and the models' bone textures. The parse and the models
   * stay; three uploads them again at their next draw (prewarm() does it in idle slots after a resume).
   */
  evict(id: RobotId, models: Iterable<RobotModel>): void {
    const p = this.cache.get(id);
    if (!p) return;
    for (const m of models)
      m.object.traverse((n) => {
        const sm = n as THREE.SkinnedMesh;
        if (sm.isSkinnedMesh) sm.skeleton.dispose();
      });
    void p
      .then((rec) => {
        rec.lod0.dispose();
        rec.lod1?.dispose();
        rec.lod2?.dispose();
        rec.warmed = false;
      })
      .catch(() => undefined);
  }

  /**
   * One LOD split per body for crowds (one InstancedMesh per body): unskinned geometry in each body's
   * link frame (quantization undone), sharing nothing with the skinned mesh. Place instance i of a
   * body with `template.getLinkWorldMatrix(body.link)` of a posed template RobotModel. Cached per LOD;
   * LOD 2 falls back to 1, 1 to 0 where the model has no such level.
   */
  async bodies(id: RobotId, lod: 0 | 1 | 2 = 2): Promise<readonly RobotBody[]> {
    const rec = await this.fetch(id);
    let p = rec.bodies.get(lod);
    if (!p) {
      p = Promise.resolve(splitBodies(lod === 2 ? rec.lod2 ?? rec.lod1 ?? rec.lod0 : lod === 1 ? rec.lod1 ?? rec.lod0 : rec.lod0, rec.skeleton, id));
      rec.bodies.set(lod, p);
    }
    return p;
  }

  /**
   * The size wall's line-up (`ROBOT_LINEUP`): every hall robot in its default pose as one static
   * mesh at true scale, sorted by height along +x from x = 0 (entries give each robot's x range).
   */
  async loadLineup(): Promise<THREE.Mesh> {
    if (!ROBOT_LINEUP) throw new Error('no robot line-up in this build');
    this.lineup ??= this.staticGeometry(ROBOT_LINEUP.glb, 'lineup');
    const m = new THREE.Mesh(await this.lineup, this.paint);
    m.name = 'robots:lineup';
    return m;
  }
}

/** A copy with float position / normal / colour attributes (quantized ones read through getX, so normalized values come out right). */
function toFloat(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const a = src.getAttribute(name) as THREE.BufferAttribute;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  if (src.index) g.setIndex(src.index.clone());
  return g;
}

/** Per-body, unskinned copies of one skinned LOD geometry (see RobotLibrary.bodies). */
function splitBodies(geo: THREE.BufferGeometry, skeleton: THREE.Skeleton, id: RobotId): RobotBody[] {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const col = geo.attributes.color;
  const jnt = geo.attributes.skinIndex;
  const index = geo.index;
  if (!index || !jnt) throw new Error(`robot ${id}: not a rigidly skinned mesh`);
  const nb = skeleton.bones.length;
  const tris: number[][] = Array.from({ length: nb }, () => []);
  for (let f = 0; f < index.count; f += 3) tris[jnt.getX(index.getX(f))].push(index.getX(f), index.getX(f + 1), index.getX(f + 2));
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  const out: RobotBody[] = [];
  for (let b = 0; b < nb; b++) {
    const list = tris[b];
    if (!list.length) continue;
    const inv = skeleton.boneInverses[b];
    nm.getNormalMatrix(inv);
    const map = new Map<number, number>();
    const P: number[] = [];
    const N: number[] = [];
    const C: number[] = [];
    const I = new Uint32Array(list.length);
    list.forEach((g, k) => {
      let l = map.get(g);
      if (l === undefined) {
        l = P.length / 3;
        map.set(g, l);
        v.fromBufferAttribute(pos, g).applyMatrix4(inv);
        P.push(v.x, v.y, v.z);
        v.fromBufferAttribute(nrm, g).applyMatrix3(nm).normalize();
        N.push(v.x, v.y, v.z);
        if (col) C.push(col.getX(g), col.getY(g), col.getZ(g));
      }
      I[k] = l;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setIndex(new THREE.BufferAttribute(P.length / 3 > 65535 ? I : new Uint16Array(I), 1));
    g.computeBoundingSphere();
    out.push({ link: skeleton.bones[b].userData.link as string, geometry: g });
  }
  return out;
}

let _depth: THREE.MeshDepthMaterial | null = null;
const depthMaterial = (): THREE.MeshDepthMaterial => (_depth ??= new THREE.MeshDepthMaterial({ side: THREE.BackSide }));

/** Run `fn` with every mesh under `root` temporarily drawn with `mat`. */
async function withMaterial(root: THREE.Object3D, mat: THREE.Material, fn: () => Promise<void>): Promise<void> {
  const saved: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  root.traverse((n) => {
    const m = n as THREE.Mesh;
    if (m.isMesh) saved.push([m, m.material]);
  });
  for (const [m] of saved) m.material = mat;
  try {
    await fn();
  } finally {
    for (const [m, prev] of saved) m.material = prev;
  }
}

let _rt: THREE.WebGLRenderTarget | null = null;
let _cam: THREE.PerspectiveCamera | null = null;
let _scene: THREE.Scene | null = null;
let _uploadMat: THREE.MeshBasicMaterial | null = null;
let _uploadReady: Promise<unknown> | null = null;

function uploadScene(): { rt: THREE.WebGLRenderTarget; cam: THREE.PerspectiveCamera; scene: THREE.Scene; mat: THREE.MeshBasicMaterial } {
  _rt ??= new THREE.WebGLRenderTarget(1, 1);
  _cam ??= new THREE.PerspectiveCamera(60, 1, 0.01, 100);
  _uploadMat ??= new THREE.MeshBasicMaterial({ color: 0xffffff });
  if (!_scene) {
    _scene = new THREE.Scene();
    _scene.overrideMaterial = _uploadMat;
  }
  return { rt: _rt, cam: _cam, scene: _scene, mat: _uploadMat };
}

/** The upload draw's own (skinned, unlit) program, compiled once in parallel so no draw compiles it. */
function compileUpload(r: THREE.WebGLRenderer, model: RobotModel): Promise<unknown> {
  if (_uploadReady) return _uploadReady;
  const u = uploadScene();
  const meshes: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  model.object.traverse((n) => {
    const m = n as THREE.Mesh;
    if (m.isMesh) meshes.push([m, m.material]);
  });
  for (const [m] of meshes) m.material = u.mat;
  // compiled for the 1×1 target the upload draws into (linear output): against the canvas it built an sRGB
  // twin nobody draws, and the real one linked at the upload draw (WPF's link spy, plan §5.5)
  const prevTarget = r.getRenderTarget();
  try {
    r.setRenderTarget(u.rt);
    _uploadReady = r.compileAsync(model.object, u.cam, u.scene).catch(() => undefined);
  } finally {
    r.setRenderTarget(prevTarget);
    for (const [m, mat] of meshes) m.material = mat;
  }
  return _uploadReady;
}

/** Draw a robot once, unlit, into a 1×1 target: uploads its buffers without touching the frame. */
function uploadOnce(r: THREE.WebGLRenderer, model: RobotModel): void {
  const { rt, cam: _cam, scene: _scene } = uploadScene();
  const b = model.info.bounds;
  _cam.position.set(b.center[0], b.center[1], b.center[2] + b.radius * 2.5);
  _cam.lookAt(b.center[0], b.center[1], b.center[2]);
  _cam.updateMatrixWorld();
  const parent = model.object.parent;
  _scene.add(model.object);
  model.object.updateMatrixWorld(true);
  const prevTarget = r.getRenderTarget();
  const prevAuto = r.shadowMap.autoUpdate;
  r.shadowMap.autoUpdate = false;
  try {
    r.setRenderTarget(rt);
    r.render(_scene, _cam);
  } finally {
    r.setRenderTarget(prevTarget);
    r.shadowMap.autoUpdate = prevAuto;
    if (parent) parent.add(model.object);
    else _scene.remove(model.object);
  }
}
