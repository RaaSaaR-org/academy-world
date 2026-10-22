/**
 * The far ring (plan WP3 build 5, §2.5, R8 §4.7: ≤ 4 draws, ≤ 20 k triangles): what lies beyond the
 * walkable Revier on the horizon. Villages (2–3 storeys, clay roofs ≤ 3 % of the screen), managed woods and
 * hedgerow clumps, and wind turbines on the northern rise and the eastern hills: one static draw, plus the
 * turbine rotors (one instanced draw, turning slowly; none stands toward the sun, so no blade ever crosses
 * the sun disc, R5 §5.6). The hills themselves are the terrain's far grid. Since G-LOOK (D42): the wooded
 * spoil heap's crowns (its silhouette on the horizon reads as forest) and woods along the top of the pit's
 * far and lateral banks.
 */
import * as THREE from 'three';
import { DEG, bearingDir } from '../layout';
import { T } from './tuning';
import { HALDE, JETTY, PIT, SHORE, haldeInside, lakeFrame, pitRimQ } from './plan';
import { GroundBatch, mat4, type GroundMaterial } from './material';

export interface FarRing {
  readonly group: THREE.Group;
  update(dt: number): void;
  /** WP17: the tree crowns (woods, the spoil heap's forest, the pit banks' woods) drawn or not (off on the plaza) */
  setCrowns(on: boolean): void;
}

/** deterministic placement */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** bearings of the land on the horizon (the lake fills ≈ 205–25° through the WNW) */
const LAND: [number, number][] = [[25, 205]];
const onLand = (b: number): boolean => LAND.some(([a, c]) => b >= a && b <= c);

export function buildFarRing(parent: THREE.Object3D, mat: GroundMaterial, heightAt: (x: number, z: number) => number, reducedMotion: () => boolean = () => false): FarRing {
  const group = new THREE.Group();
  group.name = 'ground:far';
  parent.add(group);
  const r = rng(4711);
  const B = new GroundBatch();
  // the crowns go last in the static draw, so a draw range can leave them out (WP17: the plaza's GPU frame)
  const C = new GroundBatch();
  const at = (b: number, d: number): [number, number, number] => {
    const [x, z] = bearingDir(b);
    return [x * d, heightAt(x * d, z * d), z * d];
  };

  // ── villages ──
  const house = new THREE.BoxGeometry(1, 1, 1);
  const roof = new THREE.CylinderGeometry(0.72, 0.72, 1, 3, 1).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
  const walls = [0xd6d3d1, 0xc4bfba, 0xb9b3aa, 0x9a9188];
  for (let v = 0; v < T.far.villages; v++) {
    const b = 30 + (v / T.far.villages) * 170 + r() * 14;
    const d = 1050 + r() * 1500;
    const [cx, , cz] = at(b, d);
    const n = 9 + Math.floor(r() * 10);
    for (let k = 0; k < n; k++) {
      const x = cx + (r() - 0.5) * 120,
        z = cz + (r() - 0.5) * 90;
      const y = heightAt(x, z);
      const w = 7 + r() * 5,
        dd = 9 + r() * 6,
        h = 6 + Math.floor(r() * 3) * 3;
      const yaw = Math.round(r() * 4) * (Math.PI / 2) + (r() - 0.5) * 0.3;
      B.add(house, { color: walls[k % walls.length], rough: 0.9 }, mat4(x, y + h / 2, z, yaw, w, h, dd));
      // a clay or a green roof (rule 3: clay roofs only, rule 1: green roofs exist)
      B.add(roof, { color: r() < 0.65 ? 0xb08a72 : 0x6f7a50, rough: 0.85 }, mat4(x, y + h + 1.6, z, yaw, w * 1.06, 3.4, dd * 1.04));
    }
  }

  // ── woods and hedgerow clumps (managed, useful: rule 2) ──
  const tree = new THREE.IcosahedronGeometry(1, 0);
  for (let w = 0; w < T.far.woods; w++) {
    let b = r() * 360;
    if (!onLand(b)) b = 30 + r() * 170;
    const d = 760 + r() * 1900;
    const [cx, , cz] = at(b, d);
    const n = 6 + Math.floor(r() * 9);
    for (let k = 0; k < n; k++) {
      const x = cx + (r() - 0.5) * 70,
        z = cz + (r() - 0.5) * 40;
      const s = 5 + r() * 4;
      C.add(tree, { color: r() < 0.5 ? 0x55603f : 0x5f6b45, rough: 1 }, mat4(x, heightAt(x, z) + s * 0.9, z, r() * 3, s, s * 1.25, s));
    }
  }

  // ── the spoil heap's forest (managed, plan §2.7 rule 2): crowns over the plateau and the upper flank, gaps
  // along the two berm roads; the terrain shades the canopy between them (terrain.ts) ──
  const rh = rng(1959);
  const crown = new THREE.IcosahedronGeometry(1, 0);
  const span = Math.max(...HALDE.half);
  for (let k = 0; k < 900; k++) {
    const x = HALDE.at[0] + (rh() * 2 - 1) * span,
      z = HALDE.at[1] + (rh() * 2 - 1) * span;
    const d = haldeInside(x, z);
    // the plateau and the upper flank (the silhouette), sparse on the lower flank, none on the berm roads
    const keep = d > 118 ? 0.55 : d > 60 ? 0.22 : d > 8 ? 0.08 : 0;
    if ((d > 44 && d < 58) || (d > 102 && d < 116) || rh() > keep) continue;
    const s = 4.5 + rh() * 3.5;
    C.add(crown, { color: rh() < 0.5 ? 0x4b5638 : 0x55603f, rough: 1 }, mat4(x, heightAt(x, z) + s * 0.8, z, rh() * 3, s, s * 1.35, s));
  }
  // ── woods along the top of the pit's far and lateral banks (their rim reads against the land beyond) ──
  for (let k = 0; k < 700; k++) {
    const u = PIT.far + 380 - rh() * (PIT.far + 380 - 520),
      v = PIT.north - 260 + rh() * (PIT.south - PIT.north + 520);
    const b = (295 * Math.PI) / 180;
    const x = u * Math.sin(b) + v * Math.sin(b - Math.PI / 2),
      z = -u * Math.cos(b) - v * Math.cos(b - Math.PI / 2);
    const q = pitRimQ(x, z);
    // a band above the last bench (q −215 … −300), in clumps, never on the heap
    if (q > -215 || q < -300 || haldeInside(x, z) > -30 || lakeFrame(x, z)[0] < 520 || rh() > 0.32) continue;
    const s = 5 + rh() * 3.5;
    C.add(crown, { color: rh() < 0.5 ? 0x4f5a3b : 0x5a6542, rough: 1 }, mat4(x, heightAt(x, z) + s * 0.85, z, rh() * 3, s, s * 1.25, s));
  }

  // ── the sailing club's jetty below the Seeblick: a recultivated pit lake is used again (D43: pit → lake →
  // field), so a few dinghies lie moored there (static, the far ring's draw; every object has a job, rule 10) ──
  {
    const b = (SHORE.bearing * Math.PI) / 180;
    const at = (u: number, v: number): [number, number] => [u * Math.sin(b) + v * Math.sin(b - Math.PI / 2), -u * Math.cos(b) - v * Math.cos(b - Math.PI / 2)];
    const yaw = Math.atan2(Math.sin(b), -Math.cos(b));
    const deckY = SHORE.water + JETTY.deck;
    const [jx, jz] = at(SHORE.line + JETTY.from + JETTY.length / 2, JETTY.v);
    const timber = { color: 0x9a9188, rough: 0.9 };
    B.add(new THREE.BoxGeometry(JETTY.width, 0.18, JETTY.length), timber, mat4(jx, deckY, jz, yaw));
    for (let k = 0; k <= JETTY.length; k += 6)
      for (const sd of [-1, 1]) {
        const [px, pz] = at(SHORE.line + JETTY.from + k, JETTY.v + (sd * JETTY.width) / 2);
        B.add(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 6), timber, mat4(px, deckY - 1.0, pz));
      }
    const hull = new THREE.CylinderGeometry(0.75, 0.42, 4.4, 6, 1).rotateX(Math.PI / 2).scale(1, 0.55, 1);
    const sail = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0.6, 1.1, 0, 6.2, 0.3, 0, 0.6, -1.6, 0, 0.6, -1.6, 0, 6.2, 0.3, 0, 0.6, 1.1], 3));
    sail.computeVertexNormals();
    const mast = new THREE.BoxGeometry(0.08, 6.6, 0.08).translate(0, 3.3, 0.3);
    JETTY.boats.forEach(([du, side], i) => {
      const [x, z] = at(SHORE.line + JETTY.from + du, JETTY.v + side * (JETTY.width / 2 + 1.6));
      // moored alongside, bows lakeward, each swung a little on its line
      const by = yaw + (i % 2 ? 0.08 : -0.06);
      B.add(hull, { color: 0xe7e5e4, rough: 0.5 }, mat4(x, SHORE.water + 0.2, z, by));
      B.add(mast, { color: 0xb9b6b0, rough: 0.4, metal: 0.6 }, mat4(x, SHORE.water + 0.2, z, by));
      // furled or set, a sand-white sail (no brand colours on the lake)
      if (i % 2 === 0) B.add(sail, { color: 0xd6d3d1, rough: 0.8 }, mat4(x, SHORE.water + 0.2, z, by));
    });
  }

  // ── wind turbines: the northern rise and the eastern hills (generic three-blade, rule 1) ──
  const tower = new THREE.CylinderGeometry(1.6, 3.2, 1, 10, 1);
  const nacelle = new THREE.BoxGeometry(4, 4, 11);
  const hub = 92;
  const rotors: { pos: THREE.Vector3; yaw: number; phase: number }[] = [];
  for (let k = 0; k < T.far.turbines; k++) {
    const b = k < 5 ? 330 + k * 15 + r() * 6 : 70 + (k - 5) * 22 + r() * 8;
    const d = 1350 + r() * 1100;
    const [x, y, z] = at(b, d);
    B.add(tower, { color: 0xe7e5e4, rough: 0.5, noShade: false }, mat4(x, y + hub / 2, z, 0, 1, hub, 1));
    // the rotors face the WNW wind (it comes over the lake): local +z toward bearing 295°
    const yaw = Math.atan2(Math.sin(295 * DEG), -Math.cos(295 * DEG));
    B.add(nacelle, { color: 0xe7e5e4, rough: 0.5 }, mat4(x, y + hub, z, yaw));
    rotors.push({ pos: new THREE.Vector3(x, y + hub, z), yaw, phase: r() * Math.PI * 2 });
  }
  // the vertex count without the crowns (the batch is non-indexed, three vertices a triangle)
  const noCrowns = B.triangles * 3;
  B.absorb(C);
  const mesh = B.build(mat, 'ground:far:static', { cast: false });
  if (mesh) group.add(mesh);

  const blades = new GroundBatch();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    blades.add(new THREE.BoxGeometry(2.2, 44, 0.5), { color: 0xe7e5e4, rough: 0.45, noShade: true }, new THREE.Matrix4().makeRotationZ(a).multiply(new THREE.Matrix4().makeTranslation(0, 23, 0)));
  }
  blades.add(new THREE.SphereGeometry(2.4, 10, 6), { color: 0xe7e5e4, rough: 0.45, noShade: true });
  const rotorGeo = blades.build(mat, 'tmp')!.geometry;
  const rotorMesh = new THREE.InstancedMesh(rotorGeo, mat, rotors.length);
  rotorMesh.name = 'ground:far:rotors';
  rotorMesh.castShadow = false;
  group.add(rotorMesh);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    qa = new THREE.Quaternion(),
    one = new THREE.Vector3(1, 1, 1),
    Z = new THREE.Vector3(0, 0, 1),
    Y = new THREE.Vector3(0, 1, 0);
  let t = 0;
  // the rotor sits in front of the nacelle
  const hubs = rotors.map((ro) => ro.pos.clone().add(new THREE.Vector3(0, 0, 6).applyAxisAngle(Y, ro.yaw)));
  const write = (): void => {
    rotors.forEach((ro, i) => {
      q.setFromAxisAngle(Y, ro.yaw).multiply(qa.setFromAxisAngle(Z, ro.phase + t * 1.15));
      rotorMesh.setMatrixAt(i, m.compose(hubs[i], q, one));
    });
    rotorMesh.instanceMatrix.needsUpdate = true;
  };
  write();
  rotorMesh.computeBoundingSphere();

  return {
    group,
    update(dt) {
      // reduced motion: the rotors turn at a third of the speed (they never stop: a still turbine reads as broken)
      t += dt * (reducedMotion() ? 0.33 : 1);
      write();
    },
    setCrowns(on) {
      if (mesh) mesh.geometry.drawRange.count = on ? Infinity : noCrowns;
    },
  };
}
