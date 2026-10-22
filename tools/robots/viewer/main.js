// Dev viewer for the robot GLBs: loads them through the game's runtime (src/core/robots), next to
// a 1.55 m reference bar (EMI's height) on a 0.1 m grid. Driven by tools/robot-gallery.mjs and
// tools/robots/check.mjs through window.viewer; also usable by hand: ?robot=<id>&joint=<name>.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RobotLibrary, ROBOTS } from '/src/core/robots/index.ts';

const params = new URLSearchParams(location.search);
const W = Number(params.get('w') ?? 1280);
const H = Number(params.get('h') ?? 720);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a3734);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const sun = new THREE.DirectionalLight(0xfff4e6, 2.2);
sun.position.set(3, 6, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x4a4540, 0.6));

const camera = new THREE.PerspectiveCamera(35, W / H, 0.01, 200);

// floor with a 0.1 m grid (1 m lines stronger)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x8c8781, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid10 = new THREE.GridHelper(40, 400, 0x6f6a65, 0x7b7671);
grid10.position.y = 0.0005;
const grid1 = new THREE.GridHelper(40, 40, 0x4d4945, 0x4d4945);
grid1.position.y = 0.001;
scene.add(grid10, grid1);

// 1.55 m reference bar: 0.1 m stripes, orange every 0.5 m
function referenceBar() {
  const g = new THREE.Group();
  const w = 0.05;
  for (let i = 0; i < 16; i++) {
    const h = i === 15 ? 0.05 : 0.1;
    const c = (i + 1) % 5 === 0 ? 0xff6700 : i % 2 ? 0xf5f5f4 : 0x1c1917;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
    m.position.y = i * 0.1 + h / 2;
    m.castShadow = true;
    g.add(m);
  }
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const x = cv.getContext('2d');
  x.fillStyle = '#f5f5f4';
  x.font = '600 40px sans-serif';
  x.fillText('1,55 m', 8, 46);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
  label.scale.set(0.24, 0.06, 1);
  label.position.set(0, 1.62, 0);
  g.add(label);
  return g;
}
const bar = referenceBar();
scene.add(bar);

// like the game: the main pass compiles for its target (here the canvas), the shadow pass for a render target
const shadowTarget = new THREE.WebGLRenderTarget(1, 1);
const compileFor = (target) => (root) => {
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  try {
    return renderer.compileAsync(root, camera, scene);
  } finally {
    renderer.setRenderTarget(prev);
  }
};
const library = new RobotLibrary({ renderer, compile: compileFor(null), compileShadow: compileFor(shadowTarget) });
let current = null;

const info = (id) => ROBOTS.find((r) => r.id === id);

/** World box of an object; skinned meshes are measured in their current pose (fresh bone matrices). */
function boxOf(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3();
  obj.traverseVisible((n) => {
    if (n.isSkinnedMesh) {
      n.skeleton.update();
      n.computeBoundingBox();
      box.union(n.boundingBox.clone().applyMatrix4(n.matrixWorld));
    } else if (n.isMesh) box.expandByObject(n, true);
  });
  return box;
}

function frame(objs, { az = 32, el = 14, pad = 1.22 } = {}) {
  const box = new THREE.Box3();
  for (const o of objs) box.union(boxOf(o));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const r = 0.5 * Math.max(size.y, Math.hypot(size.x, size.z) / camera.aspect) * pad;
  const dist = r / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const a = THREE.MathUtils.degToRad(az);
  const e = THREE.MathUtils.degToRad(el);
  camera.position.set(center.x + dist * Math.sin(a) * Math.cos(e), center.y + dist * Math.sin(e), center.z + dist * Math.cos(a) * Math.cos(e));
  camera.near = dist / 50;
  camera.far = dist * 20;
  camera.updateProjectionMatrix();
  camera.lookAt(center);
  const s = Math.max(size.x, size.y, size.z) * 1.5 + 1;
  sun.position.copy(center).add(new THREE.Vector3(0.45, 1, 0.6).multiplyScalar(s));
  sun.target.position.copy(center);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -s;
  sc.right = sc.top = s;
  sc.near = 0.01;
  sc.far = s * 4;
  sc.updateProjectionMatrix();
}

async function show(id, { lod = 0, pose = null, barGap = 0.35 } = {}) {
  if (current) current.dispose();
  current = await library.load(id, { lod, castShadow: true, silhouette: true });
  if (pose) current.setPose(pose);
  scene.add(current.object);
  current.object.updateMatrixWorld(true);
  // bar to the left of the robot's default-pose box
  const b = boxOf(current.object);
  bar.position.set(b.min.x - barGap, 0, (b.min.z + b.max.z) / 2);
  bar.visible = true;
  return current;
}

function render() {
  renderer.render(scene, camera);
}

function snapshot() {
  return renderer.domElement.toDataURL('image/png');
}

/** Render into a w×h tile of a 2D canvas (the renderer is resized for it, then restored). */
function tile(ctx, x, y, w, h, objs, o) {
  renderer.setSize(w, h);
  camera.aspect = w / h;
  frame(objs, o);
  render();
  ctx.drawImage(renderer.domElement, x, y, w, h);
  renderer.setSize(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}

/** Three poses of one joint (lower, middle, upper limit; ±1 rad for unlimited joints) side by side. */
async function jointStrip(joint) {
  const m = current;
  const j = m.joints.find((x) => x.name === joint) ?? m.joints[0];
  if (!j) return null;
  const lo = Number.isFinite(j.lower) ? j.lower : -1;
  const hi = Number.isFinite(j.upper) ? j.upper : 1;
  const values = [lo, (lo + hi) / 2, hi];
  // one camera for all three: frame the union of the three poses
  const box = new THREE.Box3();
  for (const v of values) {
    m.resetPose();
    m.setJoint(j.name, v);
    box.union(boxOf(m.object));
  }
  const proxy = new THREE.Object3D();
  proxy.position.copy(box.getCenter(new THREE.Vector3()));
  const hull = new THREE.Mesh(new THREE.BoxGeometry(...box.getSize(new THREE.Vector3()).toArray()));
  proxy.add(hull);
  proxy.updateMatrixWorld(true);
  const out = document.createElement('canvas');
  const tw = Math.round(W / 3);
  const th = Math.round(H / 2);
  out.width = tw * 3;
  out.height = th;
  const ctx = out.getContext('2d');
  bar.visible = false;
  for (let i = 0; i < 3; i++) {
    m.resetPose();
    m.setJoint(j.name, values[i]);
    tile(ctx, i * tw, 0, tw, th, [proxy], { az: 40, el: 14, pad: 1.08 });
    ctx.fillStyle = '#f5f5f4';
    ctx.font = '600 15px sans-serif';
    ctx.fillText(`${j.name} = ${values[i].toFixed(3)}`, i * tw + 10, 22);
  }
  m.resetPose();
  bar.visible = true;
  hull.geometry.dispose();
  return { dataUrl: out.toDataURL('image/png'), joint: j.name, values };
}

/** LOD0 and LOD1 close-ups from one camera, side by side (no reference bar). */
/** LOD0, LOD1, LOD2 (where built) and the silhouette from one camera, side by side (no reference bar). */
function lodCompare() {
  const m = current;
  const lods = [0, 1, ...(m.info.lod.lod2 ? [2] : []), 'silhouette'];
  const out = document.createElement('canvas');
  const tw = Math.round(W / lods.length);
  out.width = tw * lods.length;
  out.height = H;
  const ctx = out.getContext('2d');
  bar.visible = false;
  lods.forEach((lod, i) => {
    m.lod = lod;
    tile(ctx, i * tw, 0, tw, H, [m.object], { az: 32, el: 14, pad: 1.05 });
    ctx.fillStyle = '#f5f5f4';
    ctx.font = '600 16px sans-serif';
    ctx.fillText(`${lod === 'silhouette' ? 'Silhouette' : 'LOD' + lod} · ${m.triangles} tris`, i * tw + 12, 26);
  });
  m.lod = 0;
  bar.visible = true;
  return out.toDataURL('image/png');
}

window.viewer = {
  robots: ROBOTS.map((r) => ({ id: r.id, demoJoint: r.demoJoint, heightM: r.heightM, ik: r.ik })),
  /** main shot (LOD0, default pose, reference bar) + a joint strip */
  async shot(id, o = {}) {
    const m = await show(id, { lod: o.lod ?? 0 });
    frame([m.object, bar], { az: o.az ?? 32, el: o.el ?? 14 });
    render();
    const main = snapshot();
    const strip = await jointStrip(o.joint ?? info(id).demoJoint);
    const lods = lodCompare();
    return { main, strip: strip?.dataUrl ?? null, lods, joint: strip?.joint ?? null, triangles: m.triangles };
  },
  /** every robot in one row, sorted by height, with the bar */
  async lineup(ids, o = {}) {
    if (current) current.dispose();
    current = null;
    const models = [];
    for (const id of ids) {
      const m = await library.load(id, { lod: o.lod ?? 0, castShadow: true });
      scene.add(m.object);
      models.push(m);
    }
    models.sort((a, b) => a.info.heightM - b.info.heightM);
    let x = 0;
    for (const m of models) {
      const b = boxOf(m.object);
      m.object.position.x = x - b.min.x;
      x += b.max.x - b.min.x + 0.15;
    }
    bar.position.set(-0.4, 0, 0);
    frame([bar, ...models.map((m) => m.object)], { az: 0, el: 8, pad: 1.04 });
    render();
    const url = snapshot();
    for (const m of models) m.dispose();
    return url;
  },
  /** FK: link world matrices (column-major 16) after setting each pose; object at the origin */
  async fk(id, poses, links) {
    const m = await show(id, { lod: 0 });
    const out = [];
    for (const p of poses) {
      for (const j of m.joints) m.setJoint(j.name, 0);
      m.resetPose();
      m.setPose(p);
      out.push({ applied: m.getPose(), links: links.map((l) => m.getLinkWorldMatrix(l)?.toArray() ?? null) });
    }
    return out;
  },
  /** clamp check: a value above the upper limit comes back as the upper limit */
  async clamp(id) {
    const m = await show(id, { lod: 0 });
    const rows = [];
    for (const j of m.joints) {
      if (!Number.isFinite(j.upper)) continue;
      rows.push({ joint: j.name, upper: j.upper, got: m.setJoint(j.name, j.upper + 1) });
    }
    m.resetPose();
    return rows;
  },
  /** IK: reach a target relative to the chain's tip in the default pose; returns the error (m) */
  async ik(id, chain, offsets) {
    const m = await show(id, { lod: 0 });
    const c = m.info.ik.find((k) => k.name === chain);
    const res = [];
    for (const off of offsets) {
      m.resetPose();
      const start = m.getLinkWorldPosition(c.tip);
      const target = start.clone().add(new THREE.Vector3(...off));
      const r = m.solveIK(chain, target, { iterations: 60, tolerance: 0.0005 });
      res.push({ offset: off, error: r.error, iterations: r.iterations, reached: r.reached });
    }
    m.resetPose();
    return res;
  },
  /** timings (ms) of the first robot load and first frames, with or without prewarm (scene warmed first) */
  async timing(id, { prewarm = false, shadows = true } = {}) {
    if (current) current.dispose();
    current = null;
    renderer.shadowMap.enabled = shadows;
    const gl = renderer.getContext();
    // the static scene (floor, grid, bar, shadow map) is drawn and compiled before anything is timed
    frame([bar]);
    render();
    render();
    gl.finish();
    // longest main-thread task while the robot is fetched, parsed, compiled and uploaded
    const tasks = [];
    let obs = null;
    try {
      obs = new PerformanceObserver((l) => tasks.push(...l.getEntries().map((e) => e.duration)));
      obs.observe({ type: 'longtask' });
    } catch {
      obs = null;
    }
    const t0 = performance.now();
    if (prewarm) await library.prewarm(id);
    const t1 = performance.now();
    const m = await library.load(id, { lod: 0, castShadow: shadows });
    const t2 = performance.now();
    await new Promise((r) => setTimeout(r, 50));
    obs?.disconnect();
    const longestTaskMs = tasks.length ? Math.max(...tasks) : 0;
    scene.add(m.object);
    const programs = renderer.info.programs.length;
    const before = new Set(renderer.info.programs);
    const f0 = performance.now();
    render();
    gl.finish();
    const f1 = performance.now();
    render();
    gl.finish();
    const f2 = performance.now();
    current = m;
    return { prewarmMs: t1 - t0, loadMs: t2 - t1, firstFrameMs: f1 - f0, secondFrameMs: f2 - f1, programsLinked: renderer.info.programs.length - programs, newPrograms: renderer.info.programs.filter((p) => !before.has(p)).map((p) => `${p.cacheKey.split(',')[0]} (skinned: ${/,\d+,(\d+),\w+,[^,]*$/.test(p.cacheKey) ? (Number(/,\d+,(\d+),\w+,[^,]*$/.exec(p.cacheKey)[1]) & 32 ? 'yes' : 'no') : '?'})`), longestTaskMs };
  },
  /** LOD in 'auto' at three camera distances (near, past the LOD1 switch, past the silhouette switch) */
  async lodAuto(id) {
    if (current) current.dispose();
    current = await library.load(id, { silhouette: true });
    scene.add(current.object);
    const sw = current.info.lod;
    const k = (H / 720) * (Math.tan(Math.PI / 6) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const out = [];
    const ds = [sw.lod1.switchM * k * 0.5, sw.lod1.switchM * k * 1.2, ...(sw.lod2 ? [sw.lod2.switchM * k * 1.2] : []), sw.silhouette.switchM * k * 1.2];
    for (const d of ds) {
      camera.position.set(0, current.info.bounds.center[1], d + current.info.bounds.center[2]);
      camera.updateMatrixWorld();
      current.updateLod(camera, H);
      render();
      out.push({ distance: d, lod: current.shownLod, triangles: current.triangles });
    }
    return out;
  },
  /** the size-wall line-up file with the 1.55 m bar at its left end */
  async lineupFile() {
    if (current) current.dispose();
    current = null;
    const mesh = await library.loadLineup();
    mesh.castShadow = true;
    scene.add(mesh);
    bar.position.set(-0.4, 0, 0);
    frame([bar, mesh], { az: 0, el: 6, pad: 1.03 });
    render();
    const url = snapshot();
    scene.remove(mesh);
    return { url, tris: mesh.geometry.index.count / 3 };
  },
  /**
   * bodies(id, lod): every body's unskinned geometry placed with getLinkWorldMatrix(link) must sit
   * where the skinned mesh draws the same LOD (sampled vertices, any pose); returns the worst gap (m)
   */
  async bodiesCheck(id, lod, pose) {
    const m = await show(id, { lod });
    m.setPose(pose);
    m.object.updateMatrixWorld(true);
    const bodies = await library.bodies(id, lod);
    const skinned = [];
    m.object.traverse((n) => n.isSkinnedMesh && skinned.push(n));
    const sk = skinned[0];
    sk.skeleton.update();
    // world positions of the skinned LOD's vertices, grouped by body link
    const geo = sk.geometry;
    const byLink = new Map();
    const v = new THREE.Vector3();
    const used = [...new Set(geo.index.array)];
    for (let k = 0; k < used.length; k += 7) {
      const i = used[k];
      const link = sk.skeleton.bones[geo.attributes.skinIndex.getX(i)].userData.link;
      sk.getVertexPosition(i, v);
      v.applyMatrix4(sk.matrixWorld);
      if (!byLink.has(link)) byLink.set(link, []);
      byLink.get(link).push(v.clone());
    }
    let worst = 0;
    let tris = 0;
    const M = new THREE.Matrix4();
    for (const b of bodies) {
      tris += b.geometry.index.count / 3;
      m.getLinkWorldMatrix(b.link, M);
      const pts = [];
      const p = b.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(M));
      // every sampled skinned vertex of this body must coincide with one of the body's vertices
      for (const s of byLink.get(b.link) ?? []) {
        let best = Infinity;
        for (const q of pts) best = Math.min(best, q.distanceToSquared(s));
        worst = Math.max(worst, Math.sqrt(best));
      }
    }
    m.resetPose();
    return { bodies: bodies.length, tris, worstM: worst, skinnedTris: geo.index.count / 3 };
  },
  loaded: () => library.loaded(),
  ready: true,
};

if (params.get('robot')) {
  const id = params.get('robot');
  const m = await show(id);
  frame([m.object, bar]);
  if (params.get('joint')) m.setJoint(params.get('joint'), Number(params.get('value') ?? 0.5));
  const loop = () => {
    render();
    requestAnimationFrame(loop);
  };
  loop();
}
