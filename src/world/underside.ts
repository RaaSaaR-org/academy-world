import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { DEG, ISLAND, KEEL, TOWER, ZONE_PLOTS, bearingDir, bearingOf, outlineRadius, polar } from './layout';
import type { IslandTextures } from './textures';
import { beamMatrix, merge } from './util';
import { Batch, flatRing, sharedBatch } from './landscape/batch';
import { markStatic, mergeScope, singlePass, staticMerger } from './statics';
import { ROTOR } from './start/tuning';

/**
 * Underside (ART-V2 §4.6, QA-07): what keeps the Schwebewerk in the air — an engineered hull,
 * not a rock.
 *  - a smooth panelled fairing (hullWarm) from the deck outline at −4 down to r 66 at −9, a belly
 *    plate, steady warm nav lights at the six lobe tips and teal belly lights,
 *  - the Kielraum shell (r 28.7, −9 … −34.6): a graphite truss with smoked glass panes, so the cloud
 *    sea shows through and the room inside reads darker than the sky (Phase 5),
 *  - the keel truss cone (r 60 at −4 → r 4 at −60) in brushed alu with warm node lights,
 *  - six ducted thruster pods (Ø 15 m, one per lobe) in ceramic shrouds with an alu lip and a teal
 *    duct ring, carbon struts and gimballing pistons; four trim rotors under the Kanzeln,
 *  - the Kielraum catwalk (−36, perforated alu) around the Regelkern (−40): three counter-rotating
 *    white gimbal rings around a polished IMU sphere — the island's balance control loop, visible.
 * Orange only on rotating hubs and gimbal axes (GDD §9.6). Light lines are 'line' tier (T0 → T1 at dusk).
 */
export interface Underside {
  update(dt: number, t: number): void;
  /** gust response 0…1 with bearing (deg): pods gimbal against it, rotors pitch up */
  gust(strength: number, bearing: number): void;
  /** current rotor thrust factor (1 = hover), for audio */
  readonly thrust: number;
  /** the rotor hubs (world positions) for positional audio: M1–M6 in ZONE_PLOTS order */
  readonly podCenters: THREE.Vector3[];
  /** the trim rotor hubs T1–T4 (bearings 60/120/240/300) */
  readonly trimCenters: THREE.Vector3[];
  /**
   * WP12 (island.rotors): per rotor (0–5 M1–M6, 6–9 T1–T4) the spin rate 0 (still) … 1 (take-off),
   * the downwash 0…1 and the duct ring's colour (linear, light tier). Read every frame.
   */
  readonly rotorRate: Float32Array;
  readonly rotorAir: Float32Array;
  setRing(i: number, c: THREE.Color): void;
  /** hide everything below the deck (not visible from the inner deck → saves draw calls) */
  setVisible(v: boolean): void;
}

/** keel cone radius at height y: r(−4) = 60 → r(−60) = 4 */
function coneRadius(y: number): number {
  const t = (y + 4) / (KEEL.tipY + 4); // 0 at −4, 1 at −60
  return KEEL.coneTopRadius + (KEEL.coneBottomRadius - KEEL.coneTopRadius) * t;
}

const BELLY_Y = -9;
const BELLY_R = 66;
const SHELL_R = 28.7;
const SHELL_BOT = -34.6;

export function buildUnderside(ctx: ZoneContext, tex: IslandTextures): Underside {
  const M = ctx.materials;
  const root = ctx.root;
  const group = new THREE.Group();
  group.name = 'island:underside';
  root.add(mergeScope(group));
  // W1: the Kielraum interior (catwalk, supports, lift shaft, Regelkern) has its own group: from
  // above the deck it is hidden by the deck itself, except through the oculus and the lift shaft
  const interior = new THREE.Group();
  interior.name = 'island:kielraum';
  group.add(mergeScope(interior));

  // the underside's own batches (static merger, statics.ts): hidden with their group when the
  // player is on the inner deck (the outside) or above the deck (the Kielraum interior)
  const ub = new Batch();
  const ib = new Batch();
  buildHull(ctx, ub);
  buildShell(ctx, group, ub);
  buildTruss(ctx, group, ub);
  const pods = buildPods(ctx, group, M, tex);
  buildCables(ub, M, pods.centers);
  const core = buildKeelRoom(ctx, interior, M, tex, ib);
  const merger = staticMerger(ctx);
  merger.beforeRun(() => {
    ub.flushTo(merger, group, 'island:under');
    ib.flushTo(merger, interior, 'island:kielraum');
  });

  const cam = new THREE.Vector3();
  let lastV = true;
  const applyRef = (): void => {
    if (merger.reference) {
      interior.visible = true;
      group.visible = lastV;
    }
  };
  merger.onReference(applyRef);
  return {
    update(dt, t) {
      pods.update(dt, t);
      core.update(dt);
      // the interior can only be seen from below the deck, from outside the outline, or down the
      // oculus / lift shaft (foyer, lift car); above the deck plane inside the outline the deck
      // (and the keel ceiling) cover it completely
      cam.copy(ctx.camera.position);
      const r = Math.hypot(cam.x, cam.z);
      const covered = cam.y > 0.05 && r < outlineRadius(bearingOf(cam.x, cam.z)) - 0.5 && !(r < 13 && cam.y < 12);
      interior.visible = !covered || merger.reference;
    },
    gust(strength, bearing) {
      pods.gust(strength, bearing);
    },
    get thrust() {
      return pods.thrust;
    },
    podCenters: pods.centers,
    trimCenters: pods.trims,
    rotorRate: pods.rate,
    rotorAir: pods.air,
    setRing: (i, c) => pods.setRing(i, c),
    setVisible(v) {
      // W1: on the deck the underside is only drawn when the view can reach past the deck edge
      lastV = v;
      group.visible = v && (merger.reference || seesBelowDeck(ctx.camera));
    },
  };
}

// ── occlusion by the deck (W1) ───────────────────────────────────────────────

/** view-ray samples in NDC, 35 % wider than the frustum (the camera may turn before the next check) */
const NDC: [number, number][] = [];
for (let i = 0; i <= 8; i++) for (let j = 0; j <= 6; j++) NDC.push([-1.35 + (2.7 * i) / 8, -1.35 + (2.7 * j) / 6]);
const _o = new THREE.Vector3();
/** nothing of the underside reaches further out than this (trim rotors under the Kanzeln ≈ 93 m) */
const UNDER_R = 100;
const _d = new THREE.Vector3();

/** true where the deck plane y = 0 is solid deck (no rim gap, oculus, glass floor) */
function deckCovers(x: number, z: number): boolean {
  const r = Math.hypot(x, z);
  if (r < 2.4 || r > outlineRadius(bearingOf(x, z)) - 0.05) return false;
  const gb = ISLAND.glasbalkon;
  if (Math.hypot(x - gb.center[0], z - gb.center[2]) < gb.radius + 1) return false;
  for (const b of ISLAND.kanzeln.bearings) {
    const c = polar(b, ISLAND.kanzeln.ring);
    if (Math.hypot(x - c[0], z - c[2]) < ISLAND.kanzeln.radius + 1) return false;
  }
  return true;
}

/**
 * Can any view ray reach below the deck? From above the deck plane inside the outline, everything
 * below y = 0 is hidden by the deck unless a ray crosses the plane outside the solid deck.
 */
function seesBelowDeck(camera: THREE.Camera): boolean {
  _o.setFromMatrixPosition(camera.matrixWorld);
  if (_o.y < 0.3 || !deckCovers(_o.x, _o.z)) return true;
  for (const [x, y] of NDC) {
    _d.set(x, y, 0.5).applyMatrix4((camera as THREE.PerspectiveCamera).projectionMatrixInverse).applyMatrix4(camera.matrixWorld).sub(_o);
    if (_d.y >= -1e-6) continue; // never reaches the deck plane
    const t = -_o.y / _d.y;
    const hx = _o.x + _d.x * t,
      hz = _o.z + _d.z * t;
    if (deckCovers(hx, hz)) continue;
    // past the plane far outside and heading further out: nothing of the underside lies ahead
    if (Math.hypot(hx, hz) > UNDER_R && hx * _d.x + hz * _d.z > 0) continue;
    return true;
  }
  return false;
}

// ── hull fairing + belly plate ──────────────────────────────────────────────

/** Fairing profile: t 0 = the deck outline at −4, t 1 = r 66 at −9 (convex, like a saucer's lower lip). */
function fairing(b: number, t: number): [number, number] {
  const R0 = outlineRadius(b);
  const k = 1 - Math.pow(1 - t, 1.6);
  const r = R0 + (BELLY_R - R0) * k;
  const y = -4 - 5 * Math.pow(t, 0.75) - 0.35 * Math.sin(Math.PI * t);
  return [r, y];
}

function buildHull(ctx: ZoneContext, ub: Batch): void {
  const M = ctx.materials;
  const N = 720,
    K = 14;
  const pos: number[] = [],
    idx: number[] = [];
  for (let j = 0; j <= K; j++) {
    const t = j / K;
    for (let i = 0; i < N; i++) {
      const b = (i / N) * 360;
      const [r, y] = fairing(b, t);
      pos.push(Math.sin(b * DEG) * r, y, -Math.cos(b * DEG) * r);
    }
  }
  for (let j = 0; j < K; j++)
    for (let i = 0; i < N; i++) {
      const i1 = (i + 1) % N;
      const a = j * N + i,
        bb = j * N + i1,
        c = (j + 1) * N + i,
        d = (j + 1) * N + i1;
      idx.push(a, c, bb, bb, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // outward/downward facing: flip if the first quad's normal points inward
  const n0 = new THREE.Vector3().fromBufferAttribute(g.getAttribute('normal'), N);
  const p0 = new THREE.Vector3().fromBufferAttribute(g.getAttribute('position'), N);
  if (n0.x * p0.x + n0.z * p0.z < 0 && n0.y > 0) {
    const a = g.getIndex()!.array as Uint32Array;
    for (let i = 0; i < a.length; i += 3) [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]];
    g.computeVertexNormals();
  }
  ub.add(M.hullWarm, g, { name: 'hull' });

  // belly plate: annulus r 29 … 66 at −9, facing down, with seam rings and a carbon reveal at the shell
  const belly = new THREE.RingGeometry(SHELL_R + 0.2, BELLY_R + 0.05, 180, 3).rotateX(Math.PI / 2).translate(0, BELLY_Y, 0);
  ub.add(M.hullWarm, belly, { name: 'hull' });
  const batch = sharedBatch(ctx);
  const down = (x: number, z: number, r0: number, r1: number, y: number, seg = 120): THREE.BufferGeometry => new THREE.RingGeometry(r0, r1, seg).rotateX(Math.PI / 2).translate(x, y, z);
  batch.add(M.carbon, down(0, 0, SHELL_R - 0.1, SHELL_R + 0.45, BELLY_Y - 0.02), { name: 'carbon' });
  batch.add(M.brushedAlu, down(0, 0, BELLY_R - 0.1, BELLY_R + 0.25, BELLY_Y - 0.03, 180), { name: 'alu' });
  // panel seams on the belly (phase 5): radial carbon joints every 15° and three seam rings, so the
  // 37 m annulus reads as a plated hull and not as a blank white plate from the rim and the aerials
  for (const r of [38, 47, 56]) ub.add(M.carbon, down(0, 0, r - 0.07, r + 0.07, BELLY_Y - 0.015, 180), { name: 'carbon' });
  for (let b = 7.5; b < 360; b += 15) {
    const [x0, , z0] = polar(b, SHELL_R + 0.5),
      [x1, , z1] = polar(b, BELLY_R - 0.15);
    const g = new THREE.PlaneGeometry(0.12, Math.hypot(x1 - x0, z1 - z0)).rotateX(Math.PI / 2);
    g.rotateY(-b * DEG).translate((x0 + x1) / 2, BELLY_Y - 0.015, (z0 + z1) / 2);
    ub.add(M.carbon, g, { name: 'carbon' });
  }
  // six maintenance hatches on the belly (between the pods) + teal belly lights (T0 → T1)
  const navWarm = M.light(0xffe9cc, 'T1');
  const belly2 = M.light(0x2dd4bf);
  for (let k = 0; k < 6; k++) {
    const b = k * 60;
    const [x, , z] = polar(b, 50);
    batch.add(M.carbon, down(x, z, 1.15, 1.3, BELLY_Y - 0.03, 24), { name: 'carbon' });
    batch.add(belly2, down(x, z, 1.32, 1.4, BELLY_Y - 0.04, 24), { name: 'teal-lines' });
    const [lx, , lz] = polar(b + 30, 40);
    batch.add(belly2, new THREE.SphereGeometry(0.18, 10, 6).translate(lx, BELLY_Y - 0.1, lz), { name: 'teal-lines' });
  }
  // nav lights at the six lobe tips (steady, warm), on short carbon brackets under the rim
  for (const p of ZONE_PLOTS) {
    const r = outlineRadius(p.bearing);
    const [x, , z] = polar(p.bearing, r + 0.15);
    batch.add(M.carbon, new THREE.CylinderGeometry(0.16, 0.2, 0.3, 12).translate(x, -3.3, z), { name: 'carbon' });
    batch.add(navWarm, new THREE.SphereGeometry(0.17, 12, 8).translate(x, -3.55, z), { name: 'warm-nav' });
  }
}

// ── Kielraum shell: truss + tinted glass panes (−9 … −34.6) ─────────────────

function buildShell(ctx: ZoneContext, group: THREE.Group, ub: Batch): void {
  const M = ctx.materials;
  const top = BELLY_Y,
    bot = SHELL_BOT,
    R = SHELL_R;
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, top - bot, 96, 1, true).translate(0, (top + bot) / 2, 0),
    // smoked glass (Phase 5, core: Kielraum look): the room inside reads darker than the sky and the cloud sea
    // (stays two-pass: lit curved glass seen from both sides, W1 A/B showed the change)
    M.standard({ color: 0x0d1113, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.52, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.1 }),
  );
  glass.name = 'island:keel-glass';
  glass.renderOrder = 2;
  group.add(markStatic(glass));
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    parts.push(new THREE.BoxGeometry(0.32, top - bot, 0.5).translate(0, (top + bot) / 2, 0).translate(R, 0, 0).rotateY(a));
  }
  for (const y of [-17.5, -26]) parts.push(new THREE.TorusGeometry(R + 0.05, 0.16, 6, 96).rotateX(Math.PI / 2).translate(0, y, 0));
  // diagonal braces in every other bay (the truss)
  for (let k = 0; k < 24; k += 2) {
    const a0 = (k / 24) * Math.PI * 2,
      a1 = ((k + 1) / 24) * Math.PI * 2;
    for (const [y0, y1] of [
      [top, -17.5],
      [-17.5, -26],
      [-26, bot],
    ]) {
      const p = new THREE.Vector3(Math.cos(a0) * (R + 0.05), y0, Math.sin(a0) * (R + 0.05));
      const q = new THREE.Vector3(Math.cos(a1) * (R + 0.05), y1, Math.sin(a1) * (R + 0.05));
      const len = p.distanceTo(q);
      const g = new THREE.CylinderGeometry(0.07, 0.07, len, 6);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize()));
      g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
      parts.push(g);
    }
  }
  // heavy bottom collar where the shell meets the keel cone
  parts.push(new THREE.CylinderGeometry(32.4, 31.2, 1.6, 96, 1, true).translate(0, bot - 0.2, 0));
  parts.push(new THREE.RingGeometry(R - 0.7, 32.4, 96, 1).rotateX(Math.PI / 2).translate(0, bot - 1.0, 0));
  // anodised graphite frame (Phase 5, core: Kielraum look) — bright alu posts flared in the low sun
  // behind the smoked glass; the keel truss cone below stays brushed alu
  const frame = M.standard({ color: 0x3a3633, roughness: 0.42, metalness: 0.85 });
  for (const g of parts) ub.add(frame, g, { name: 'keel-frame' });
  // the shell's upper skirt (−9 … −4): closes the gap between the glass top and the keel ceiling, where
  // the sky showed through the outward-only hull as a blue ring when looking up from the Kielraum
  // (mirrored so its faces point inward; normals recomputed from the new winding)
  const skirt = new THREE.CylinderGeometry(R + 0.06, R + 0.06, -top - ISLAND.deckThickness + 0.1, 96, 1, true).translate(0, (top - ISLAND.deckThickness) / 2, 0).scale(-1, 1, 1);
  skirt.deleteAttribute('normal');
  ub.add(frame, skirt, { name: 'keel-frame' });
  ub.add(M.hullWarm, new THREE.TorusGeometry(R - 0.4, 0.45, 8, 96).rotateX(Math.PI / 2).translate(0, bot - 0.6, 0), { name: 'hull' });
  // a teal level ring at the collar (T0 → T1)
  sharedBatch(ctx).add(M.light(0x2dd4bf), new THREE.TorusGeometry(R + 0.12, 0.04, 6, 128).rotateX(Math.PI / 2).translate(0, -26, 0), { name: 'teal-lines' });
}

// ── keel truss cone ──────────────────────────────────────────────────────────

function buildTruss(ctx: ZoneContext, group: THREE.Group, ub: Batch): void {
  const M = ctx.materials;
  const list: { a: THREE.Vector3Like; b: THREE.Vector3Like; w: number; h?: number }[] = [];
  const n = 24;
  const levels = [-28, -36, -44, -52, KEEL.tipY];
  const node = (i: number, y: number): THREE.Vector3 => {
    const a = (i / n) * Math.PI * 2;
    const r = coneRadius(y);
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  };
  for (let i = 0; i < n; i++) {
    for (let l = 0; l < levels.length - 1; l++) list.push({ a: node(i, levels[l]), b: node(i, levels[l + 1]), w: 0.6 });
    for (let l = 1; l < levels.length - 1; l++) list.push({ a: node(i, levels[l]), b: node(i + 1, levels[l]), w: 0.36, h: 0.5 });
    for (let l = 0; l < levels.length - 1; l++) {
      if (levels[l] < -50 && i % 2) continue;
      list.push({ a: node(i, levels[l]), b: node(i + 1, levels[l + 1]), w: 0.18 });
      list.push({ a: node(i + 1, levels[l]), b: node(i, levels[l + 1]), w: 0.18 });
    }
  }
  // round members (alu tubes), not boxes
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
  const mesh = new THREE.InstancedMesh(g, M.brushedAlu, list.length);
  const m4 = new THREE.Matrix4();
  list.forEach((l, i) => mesh.setMatrixAt(i, beamMatrix(l.a, l.b, l.w, l.h ?? l.w, m4)));
  mesh.computeBoundingSphere();
  mesh.name = 'island:keel-truss';
  group.add(markStatic(mesh));

  // warm node lights at every joint (T0 by day, T1 at dusk)
  const nodes: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) for (const y of levels.slice(1, -1)) nodes.push(node(i, y));
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 6), M.light(0xffe9cc), nodes.length);
  nodes.forEach((p, i) => lights.setMatrixAt(i, m4.makeTranslation(p.x * 1.012, p.y, p.z * 1.012)));
  lights.computeBoundingSphere();
  group.add(markStatic(lights));

  // hoops at every level + keel tip nose (ceramic)
  const hoops: THREE.BufferGeometry[] = [];
  for (const y of [-36, -44, -52]) hoops.push(new THREE.TorusGeometry(coneRadius(y) + 0.3, 0.26, 8, 96).rotateX(Math.PI / 2).translate(0, y, 0));
  for (const h of hoops) ub.add(M.brushedAlu, h, { name: 'alu' });
  ub.add(M.hullWarm, new THREE.CylinderGeometry(4.6, 3.2, 2.4, 32).translate(0, KEEL.tipY - 0.6, 0), { name: 'hull' });
  ub.add(M.hullWarm, new THREE.ConeGeometry(3.2, 9, 32).rotateX(Math.PI).translate(0, KEEL.tipY - 6.3, 0), { name: 'hull' });
  sharedBatch(ctx).add(M.light(0x2dd4bf), new THREE.TorusGeometry(4.62, 0.05, 6, 64).rotateX(Math.PI / 2).translate(0, KEEL.tipY - 1.2, 0), { name: 'teal-lines' });
  void flatRing;
}

// ── thruster pods ────────────────────────────────────────────────────────────

const AIR_VERT = /* glsl */ `
attribute float aStrength;
varying vec2 vUv;
varying float vFog;
varying float vStr;
void main() {
  vUv = uv;
  vStr = aStrength;
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  #endif
  vec4 mv = modelViewMatrix * p;
  vFog = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const AIR_FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uColor; uniform vec3 uHot; uniform float uStrength;
varying vec2 vUv;
varying float vFog;
varying float vStr;
float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main() {
  // vUv.y = 1 at the rotor, 0 at the bottom of the column: downwash streaks + pressure rings,
  // warm and bright right under the duct (motor heat and the lip glow), shimmering
  float along = clamp(vUv.y, 0.0, 1.0);
  float s1 = n(vec2(vUv.x * 28.0, along * 4.0 + uTime * 3.2));
  float s2 = n(vec2(vUv.x * 72.0, along * 13.0 + uTime * 7.0));
  float streak = s1 * 0.6 + s2 * 0.4;
  float rings = 0.55 + 0.45 * sin(along * 16.0 + uTime * 6.0);
  float a = pow(along, 3.2) * (0.2 + 0.8 * streak) * (0.7 + 0.3 * rings) * uStrength * vStr;
  if (a < 0.002) discard;
  float hot = smoothstep(0.82, 1.0, along) * (0.6 + 0.4 * s2);
  vec3 col = mix(uColor, uHot, hot);
  a *= 1.0 - smoothstep(600.0, 1400.0, vFog);
  gl_FragColor = vec4(col * a * (1.0 + hot * 2.5), a);
}`;

/**
 * Trim rotors T1–T4 (bearings 60/120/240/300°, clockwise from north) under the four Aussichtskanzeln:
 * 0.4× pods for fine attitude control, seen through the glass floors. The island stays a hexacopter:
 * six main lift rotors M1–M6 under the lobes (index order = ZONE_PLOTS, M1 = Sensordom … M6 = Prüffeld).
 * Founder decision D7 keeps them (docs/DECISIONS.md).
 */
const TRIM_SCALE = 0.4;
const TRIM_Y = -5.4;
/** WP12 (start/tuning.ts ROTOR): rad/s per unit rate and the rate from which the blur disc shows */
const ROTOR_OMEGA = ROTOR.omega;
const BLUR_FROM = ROTOR.blurFrom;

function buildPods(ctx: ZoneContext, group: THREE.Group, M: ZoneContext['materials'], tex: IslandTextures) {
  const mainN = ZONE_PLOTS.length;
  const centers = ZONE_PLOTS.map((p) => new THREE.Vector3(p.anchor[0], -12, p.anchor[2]));
  const trims = ISLAND.kanzeln.bearings.map((b) => {
    const c = polar(b, ISLAND.kanzeln.ring);
    return new THREE.Vector3(c[0], TRIM_Y, c[2]);
  });
  const all = [...centers, ...trims];
  const n = all.length;
  const podYaw = [...ZONE_PLOTS.map((p) => -p.bearing * DEG), ...ISLAND.kanzeln.bearings.map((b) => -b * DEG)];
  const podScale = all.map((_, i) => new THREE.Vector3().setScalar(i < mainN ? 1 : TRIM_SCALE));

  // duct: lathe of an aerofoil ring section (inner r 7.45, outer ≈ 8.3, height 3.4)
  const ductProfile: THREE.Vector2[] = [];
  const sec: [number, number][] = [
    [7.45, -1.9],
    [7.5, -1.2],
    [7.42, 0.2],
    [7.55, 1.1],
    [7.85, 1.55],
    [8.25, 1.5],
    [8.45, 1.1],
    [8.45, 0.0],
    [8.25, -1.2],
    [7.9, -1.85],
    [7.45, -1.9],
  ];
  for (const [r, y] of sec) ductProfile.push(new THREE.Vector2(r, y));
  // ceramic shroud (lathe), cradle ring, lugs, stator vanes and the hub nacelle: one instanced hull mesh
  const ductGeo = merge([
    new THREE.LatheGeometry(ductProfile, 72),
    new THREE.TorusGeometry(8.6, 0.22, 6, 72).rotateX(Math.PI / 2).translate(0, 1.2, 0),
    ...[0, 1, 2, 3].map((k) => new THREE.CylinderGeometry(0.45, 0.55, 1.4, 12).translate(8.7, 1.4, 0).rotateY((k * Math.PI) / 2 + Math.PI / 4)),
    ...[0, 1, 2, 3].map((k) => new THREE.BoxGeometry(6.2, 0.18, 0.55).translate(4.35, -0.9, 0).rotateY((k * Math.PI) / 2)),
    new THREE.CylinderGeometry(1.25, 1.35, 2.6, 24).translate(0, -0.2, 0),
    new THREE.ConeGeometry(1.35, 2.4, 24).rotateX(Math.PI).translate(0, -2.7, 0),
    new THREE.CylinderGeometry(0.8, 1.25, 0.6, 24).translate(0, 1.4, 0),
  ]);
  const ducts = new THREE.InstancedMesh(ductGeo, M.hull, n);
  ducts.name = 'island:thruster-ducts';
  // alu inner lip (top) and the teal duct ring inside the lower lip (T0 by day, T1 at dusk): one instanced mesh
  // WP12 (§3.3): the duct ring shows the rotor's state (dark cold, amber in Arbeit, teal bereit, full light
  // geprüft): a white MeshBasic with instance colours (the crown beacons' program), painted by start/rotors.ts
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  glowMat.userData.noEnrich = true;
  ctx.onDispose(() => glowMat.dispose());
  const glow = new THREE.InstancedMesh(new THREE.TorusGeometry(7.38, 0.09, 6, 96).rotateX(Math.PI / 2).translate(0, -1.75, 0), glowMat, n);
  {
    const c = new THREE.Color(0x2dd4bf).multiplyScalar(M.tierScale(0x2dd4bf, 'line'));
    for (let i = 0; i < n; i++) glow.setColorAt(i, c);
  }
  const lip = new THREE.InstancedMesh(new THREE.TorusGeometry(7.5, 0.12, 8, 96).rotateX(Math.PI / 2).translate(0, 1.45, 0), M.brushedAlu, n);
  // rotating hub ring (orange: it rotates)
  const hubRing = new THREE.InstancedMesh(new THREE.TorusGeometry(1.33, 0.13, 8, 40).rotateX(Math.PI / 2).translate(0, 0.55, 0), M.orangePaint, n);
  // blades: 6 per rotor (36 in one InstancedMesh, GDD §6.1)
  const bladeGeo = (() => {
    const g = new THREE.BoxGeometry(5.9, 0.08, 0.95).translate(1.35 + 2.95, 0.15, 0);
    // twist: tilt leading edge
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i);
      const tw = 0.45 - (x / 7.2) * 0.3;
      p.setY(i, p.getY(i) + z * tw);
      p.setZ(i, z * (1 - (x - 1.35) / 14));
    }
    g.computeVertexNormals();
    return g;
  })();
  const blades = new THREE.InstancedMesh(bladeGeo, M.standard({ color: 0x57534e, roughness: 0.4, metalness: 0.6 }), n * 6);
  // blur disc (rotor at speed)
  const blurMat = singlePass(ctx, new THREE.MeshBasicMaterial({ map: tex.blur, color: 0xd6cfc8, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, fog: true }));
  const blur = new THREE.InstancedMesh(new THREE.CircleGeometry(7.35, 64).rotateX(-Math.PI / 2).translate(0, 0.15, 0), blurMat, n);
  blur.renderOrder = 3;
  // air column below each rotor
  const airMat = new THREE.ShaderMaterial({
    vertexShader: AIR_VERT,
    fragmentShader: AIR_FRAG,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xf4f1ec) }, uHot: { value: new THREE.Color(0xffb067) }, uStrength: { value: 0.16 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    forceSinglePass: true, // additive: the order of the two sides does not matter (W1)
  });
  const airGeo = new THREE.CylinderGeometry(7.2, 12, 46, 40, 1, true).translate(0, -23 - 1.9, 0);
  // per-rotor downwash (island.rotors.setAir): an instanced attribute, so a cold rotor blows nothing
  const airStrength = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1);
  airGeo.setAttribute('aStrength', airStrength);
  const air = new THREE.InstancedMesh(airGeo, airMat, n);
  air.renderOrder = 4;
  // struts (to the lobe underside) and pistons
  // carbon struts and piston bodies (one instanced mesh: unit cylinders), alu rods
  const struts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 12), M.carbon, n * 4);
  const pistonRod = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 12), M.brushedAlu, n * 2);
  const pistonBody = { setMatrixAt: (i: number, m: THREE.Matrix4) => struts.setMatrixAt(n * 2 + i, m), instanceMatrix: { needsUpdate: false } };

  for (const m of [ducts, glow, lip, hubRing, blades, blur, air, struts, pistonRod]) {
    m.frustumCulled = false;
    group.add(m);
  }

  // per-pod state
  const tilt = all.map(() => new THREE.Vector2());
  const tiltTarget = all.map(() => new THREE.Vector2());
  let gustAmt = 0;
  let gustDecay = 0;
  let thrust = 1;
  // WP12: each rotor turns at its own rate (rc4: all at 2.2 rad/s ≈ rate 0.5); rate and air are written by start/rotors.ts
  const rate = new Float32Array(n).fill(0.5);
  const airS = new Float32Array(n).fill(1);
  const spinA = new Float32Array(n);
  const ZERO = new THREE.Vector3(0, 0, 0);
  const tmpS = new THREE.Vector3();

  const podM = new THREE.Matrix4(),
    tmp = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    v = new THREE.Vector3(),
    w = new THREE.Vector3(),
    mid = new THREE.Vector3(),
    yawQ = new THREE.Quaternion();
  const strutAnchors = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
  const cylUp = new THREE.Vector3(0, 1, 0);

  const place = (): void => {
    for (let i = 0; i < n; i++) {
      e.set(tilt[i].x, podYaw[i], tilt[i].y, 'YXZ');
      q.setFromEuler(e);
      podM.compose(all[i], q, podScale[i]);
      const trim = i >= mainN;
      const spin = spinA[i] + i;
      ducts.setMatrixAt(i, podM);
      glow.setMatrixAt(i, podM);
      lip.setMatrixAt(i, podM);
      tmp.makeRotationY(spin * 0.15);
      hubRing.setMatrixAt(i, tmp.premultiply(podM));
      for (let k = 0; k < 6; k++) {
        tmp.makeRotationY(spin + (k * Math.PI) / 3 + i * 0.4);
        blades.setMatrixAt(i * 6 + k, tmp.premultiply(podM));
      }
      tmp.makeRotationY(-spin * 0.9);
      // the blur disc only on a rotor at speed (a zero matrix hides one instance)
      if (rate[i] >= BLUR_FROM) blur.setMatrixAt(i, tmp.premultiply(podM));
      else blur.setMatrixAt(i, tmp.makeScale(0, 0, 0).setPosition(ZERO));
      if (airS[i] > 0.01) air.setMatrixAt(i, podM);
      else air.setMatrixAt(i, tmp.compose(all[i], q, tmpS.set(0, 0, 0)));
      // struts: two truss struts and two gimballing pistons, from the cradle lugs up to the lobe underside
      yawQ.setFromAxisAngle(cylUp, podYaw[i]);
      for (let k = 0; k < 4; k++) {
        const a = strutAnchors[k];
        v.set(Math.cos(a) * 8.7, 1.6, Math.sin(a) * 8.7).applyMatrix4(podM);
        const rr = trim ? 3.85 : 5.2;
        w.set(Math.cos(a) * rr, 0, Math.sin(a) * rr).applyQuaternion(yawQ).add(all[i]);
        w.y = trim ? -0.5 : -4.4;
        const slot = i * 2 + (k < 2 ? 0 : 1);
        if (k % 2 === 0) struts.setMatrixAt(slot, cyl(w, v, tmp, trim ? 0.28 : 0.55));
        else {
          // piston: body hangs from the deck, the rod reaches into the cradle (length follows the tilt)
          mid.copy(w).lerp(v, 0.55);
          pistonBody.setMatrixAt(slot, cyl(w, mid, tmp, trim ? 0.5 : 1));
          pistonRod.setMatrixAt(slot, cyl(mid, v, tmp, trim ? 0.5 : 1));
        }
      }
    }
    for (const m of [ducts, glow, lip, hubRing, blades, blur, air, struts, pistonRod]) m.instanceMatrix.needsUpdate = true;
  };
  const cd = new THREE.Vector3(),
    cc = new THREE.Vector3(),
    cs = new THREE.Vector3(),
    cq = new THREE.Quaternion();
  function cyl(a: THREE.Vector3, b: THREE.Vector3, out: THREE.Matrix4, thick = 1): THREE.Matrix4 {
    cd.subVectors(b, a);
    const len = cd.length();
    cq.setFromUnitVectors(cylUp, cd.normalize());
    return out.compose(cc.addVectors(a, b).multiplyScalar(0.5), cq, cs.set(thick, len, thick));
  }
  place();

  return {
    centers,
    trims,
    rate,
    air: airS,
    setRing(i: number, c: THREE.Color) {
      glow.setColorAt(i, c);
      glow.instanceColor!.needsUpdate = true;
    },
    get thrust() {
      return thrust;
    },
    gust(strength: number, bearing: number) {
      gustAmt = Math.max(gustAmt, strength);
      gustDecay = 4;
      // pods lean into the wind (thrust vectoring), up to 3°
      const [gx, gz] = bearingDir(bearing);
      for (let i = 0; i < n; i++) {
        // in pod-local (after yaw) axes: roll about local z, pitch about local x
        const yaw = podYaw[i];
        const lx = gx * Math.cos(yaw) - gz * Math.sin(yaw);
        const lz = gx * Math.sin(yaw) + gz * Math.cos(yaw);
        tiltTarget[i].set(-lz * 3 * DEG * strength, lx * 3 * DEG * strength);
      }
    },
    update(dt: number, t: number) {
      gustDecay = Math.max(0, gustDecay - dt);
      if (gustDecay <= 0) {
        gustAmt *= Math.exp(-dt * 0.8);
        for (const tt of tiltTarget) tt.multiplyScalar(Math.exp(-dt * 1.2));
      }
      for (let i = 0; i < n; i++) {
        // slow trim wobble (the loop never rests) + gust lean
        const wob = 0.25 * DEG;
        const tx = tiltTarget[i].x + Math.sin(t * 0.7 + i * 1.3) * wob;
        const ty = tiltTarget[i].y + Math.cos(t * 0.53 + i * 2.1) * wob;
        tilt[i].x += (tx - tilt[i].x) * (1 - Math.exp(-dt * 2.5));
        tilt[i].y += (ty - tilt[i].y) * (1 - Math.exp(-dt * 2.5));
      }
      thrust = 1 + gustAmt * 0.05;
      for (let i = 0; i < n; i++) spinA[i] += dt * ROTOR_OMEGA * rate[i] * (i >= mainN ? 1.9 : 1) * thrust;
      let airChanged = false;
      for (let i = 0; i < n; i++)
        if (airStrength.getX(i) !== airS[i]) {
          airStrength.setX(i, airS[i]);
          airChanged = true;
        }
      if (airChanged) airStrength.needsUpdate = true;
      airMat.uniforms.uTime.value = t;
      airMat.uniforms.uStrength.value = 0.2 + gustAmt * 0.08;
      place();
    },
  };
}

// ── cables ───────────────────────────────────────────────────────────────────

function buildCables(ub: Batch, M: ZoneContext['materials'], centers: THREE.Vector3[]): void {
  // Phase 5: rigid conduits instead of sagging catenaries (thin hanging lines read as scratches or
  // rendering glitches from the rim and the aerials). Each pod gets two carbon cable trays flush on
  // the belly, from beside its strut base straight in to the Kielraum shell, with alu clamps every 3 m.
  centers.forEach((c) => {
    const bear = (Math.atan2(c.x, -c.z) / DEG + 360) % 360;
    for (const s of [-1, 1]) {
      const b = bear + s * 4.5;
      const r0 = SHELL_R + 0.6,
        r1 = 58.5;
      const [x0, , z0] = polar(b, r0),
        [x1, , z1] = polar(b, r1);
      const len = Math.hypot(x1 - x0, z1 - z0);
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      ub.add(M.carbon, new THREE.BoxGeometry(0.34, 0.16, len).rotateY(yaw).translate((x0 + x1) / 2, BELLY_Y - 0.09, (z0 + z1) / 2), { name: 'carbon' });
      for (let d = 1.5; d < len; d += 3) {
        const x = x0 + ((x1 - x0) * d) / len,
          z = z0 + ((z1 - z0) * d) / len;
        ub.add(M.brushedAlu, new THREE.BoxGeometry(0.44, 0.2, 0.08).rotateY(yaw).translate(x, BELLY_Y - 0.1, z), { name: 'alu' });
      }
    }
  });
}

// ── Kielraum + Regelkern ─────────────────────────────────────────────────────

function buildKeelRoom(ctx: ZoneContext, group: THREE.Group, M: ZoneContext['materials'], tex: IslandTextures, ub: Batch): { update(dt: number): void } {
  const y = KEEL.catwalkY;
  // catwalk ring: perforated alu grating — walkable for the finale; darker than ART-V2's #A8A29E
  // (Phase 5, core: Kielraum look) so the floor recedes and the stations and the gimbal lead
  const grating = M.standard({ map: tex.grating, normalMap: tex.gratingN, color: 0x77726d, roughness: 0.5, metalness: 0.75, transparent: false });
  tex.grating.repeat.set(1, 1);
  const ringGeo = new THREE.RingGeometry(KEEL.catwalkInner, KEEL.catwalkOuter, 96, 1).rotateX(-Math.PI / 2);
  {
    const p = ringGeo.getAttribute('position'),
      uv = ringGeo.getAttribute('uv');
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2, p.getZ(i) / 2);
  }
  const catwalk = new THREE.Mesh(ringGeo, grating);
  catwalk.position.y = y;
  group.add(markStatic(catwalk));
  for (const g of [
    new THREE.TorusGeometry(KEEL.catwalkOuter, 0.12, 6, 96).rotateX(Math.PI / 2).translate(0, y - 0.1, 0),
    new THREE.TorusGeometry(KEEL.catwalkInner, 0.12, 6, 96).rotateX(Math.PI / 2).translate(0, y - 0.1, 0),
    new THREE.TorusGeometry(KEEL.catwalkOuter, 0.045, 6, 96).rotateX(Math.PI / 2).translate(0, y + 1.1, 0),
    new THREE.TorusGeometry(KEEL.catwalkInner, 0.045, 6, 96).rotateX(Math.PI / 2).translate(0, y + 1.1, 0),
  ])
    ub.add(M.brushedAlu, g, { name: 'alu' });
  // teal lines under the handrails (T0 → T1)
  for (const r of [KEEL.catwalkOuter, KEEL.catwalkInner]) ub.add(M.light(0x2dd4bf), new THREE.TorusGeometry(r, 0.015, 4, 128).rotateX(Math.PI / 2).translate(0, y + 1.05, 0), { name: 'teal' });
  // walkable collider (thin annulus as trimesh)
  const col = new THREE.Mesh(new THREE.RingGeometry(KEEL.catwalkInner, KEEL.catwalkOuter, 48, 1).rotateX(-Math.PI / 2), M.railing);
  col.position.y = y;
  col.visible = false;
  group.add(col);
  ctx.physics.addStaticTrimesh(col, { surface: 'metal' });

  // radial supports from the catwalk to the cone, and the yoke holding the Regelkern
  const list: { a: THREE.Vector3Like; b: THREE.Vector3Like; w: number; h?: number }[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const c = Math.cos(a),
      s = Math.sin(a);
    list.push({ a: { x: c * KEEL.catwalkInner, y: y - 0.35, z: s * KEEL.catwalkInner }, b: { x: c * (coneRadius(y) + 0.2), y: y - 0.35, z: s * (coneRadius(y) + 0.2) }, w: 0.35, h: 0.6 });
    // posts
    for (const r of [KEEL.catwalkInner, KEEL.catwalkOuter]) list.push({ a: { x: c * r, y, z: s * r }, b: { x: c * r, y: y + 1.1, z: s * r }, w: 0.07 });
  }
  // fixed frame ring at the core level, hung from four beams to the cone
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    const c = Math.cos(a),
      s = Math.sin(a);
    list.push({ a: { x: c * 6.4, y: KEEL.coreY, z: s * 6.4 }, b: { x: c * (coneRadius(KEEL.coreY) + 0.3), y: KEEL.coreY, z: s * (coneRadius(KEEL.coreY) + 0.3) }, w: 0.5 });
  }
  // lift shaft below the deck: four columns + frames (0, −4 … −36, −10.7)
  const lx = TOWER.lift.x,
    lz = TOWER.lift.z,
    hw = 1.55;
  for (const [cx, cz] of [
    [-hw, -hw],
    [hw, -hw],
    [-hw, hw],
    [hw, hw],
  ])
    list.push({ a: { x: lx + cx, y: -4, z: lz + cz }, b: { x: lx + cx, y: y, z: lz + cz }, w: 0.22 });
  for (let yy = -8; yy > y; yy -= 4) {
    list.push({ a: { x: lx - hw, y: yy, z: lz - hw }, b: { x: lx + hw, y: yy, z: lz - hw }, w: 0.12 });
    list.push({ a: { x: lx - hw, y: yy, z: lz + hw }, b: { x: lx + hw, y: yy, z: lz + hw }, w: 0.12 });
    list.push({ a: { x: lx - hw, y: yy, z: lz - hw }, b: { x: lx - hw, y: yy, z: lz + hw }, w: 0.12 });
    list.push({ a: { x: lx + hw, y: yy, z: lz - hw }, b: { x: lx + hw, y: yy, z: lz + hw }, w: 0.12 });
  }
  const sup = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.brushedAlu, list.length);
  const m4 = new THREE.Matrix4();
  list.forEach((l, i) => sup.setMatrixAt(i, beamMatrix(l.a, l.b, l.w, l.h ?? l.w, m4)));
  sup.computeBoundingSphere();
  group.add(markStatic(sup));

  // ── Regelkern: three counter-rotating gimbal rings Ø 10 / 8.5 / 7 around an IMU sphere
  const core = new THREE.Group();
  core.position.y = KEEL.coreY;
  group.add(core);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.28, 10, 96).rotateX(Math.PI / 2), M.brushedAlu);
  core.add(markStatic(frame));
  // white gimbal rings (hull ceramic) with alu bearings; axis caps orange (they rotate)
  const ringMat = M.hull;
  const mkRing = (r: number): THREE.Group => {
    const g = new THREE.Group();
    mergeScope(g); // the parts merge per material inside the rotating ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.24, 12, 96), ringMat);
    g.add(markStatic(ring));
    for (const s of [-1, 1]) {
      const brg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16).rotateZ(Math.PI / 2), M.brushedAlu);
      brg.position.x = s * (r + 0.05);
      g.add(markStatic(brg));
    }
    // axis caps (orange: gimbal axes)
    const capGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.5, 16).rotateZ(Math.PI / 2);
    for (const s of [-1, 1]) {
      const cap = new THREE.Mesh(capGeo, M.orangePaint);
      cap.position.x = s * (r + 0.32);
      g.add(markStatic(cap));
    }
    return g;
  };
  const outer = mkRing(5);
  const middle = mkRing(4.25);
  const inner = mkRing(3.5);
  core.add(outer);
  outer.add(middle);
  middle.add(inner);
  middle.rotation.z = Math.PI / 2;
  inner.rotation.z = Math.PI / 2;
  // IMU sphere: polished steel with a teal sensor ring (T1)
  const imu = new THREE.Mesh(new THREE.SphereGeometry(1.7, 32, 20), M.standard({ color: 0xd8d4cf, roughness: 0.12, metalness: 1, envMapIntensity: 1.2 }));
  inner.add(markStatic(imu));
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.06, 8, 64), M.light(0x2dd4bf, 'T1'));
  band.rotation.x = Math.PI / 2;
  imu.add(markStatic(band));
  // core light (one local light, §11 Kielraum budget)
  ctx.lights.point([0, KEEL.coreY + 1, 0], { color: 0xffe2c0, intensity: 40, distance: 26 });

  let t = 0;
  return {
    update(dt) {
      t += dt;
      outer.rotation.y = t * 0.35;
      middle.rotation.x = -t * 0.5;
      inner.rotation.y = t * 0.8;
    },
  };
}
