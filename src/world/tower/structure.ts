import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ZoneContext } from '@/core/zones';
import { DEG, TOWER, ZONE_PLOTS } from '../layout';
import { merge } from '../util';
import { CORE, DIAGRID, HALO, SHAFT } from './constants';
import { clean, metreUVs, type TowerKit } from './kit';
import { towerState } from './state';
import { markStatic } from '../statics';
import { cullTinyText } from '../detail';
import type { SystemLamp } from '../start/contract';
import { lampColor, lampGain, lampHue } from '../start/lamps';

/**
 * Akademie-Turm v2 (ART-V2 §3.2): ceramic foyer drum (12-gon, every dependent coordinate kept),
 * white hyperboloid diagrid around a dark-glass compute core with teal level rings, the halo
 * (Ausguck) with a glass balustrade, a crown of six sensor masts on the zone bearings, the
 * needle with the anemometer, the exterior lift shaft and car.
 *
 * Static parts are merged per material (hull, carbon, alu, teal light, glass): the whole
 * exterior is ≈ 20 draw calls. Colliders keep the old layout (facets to 8 m, Ausguck disc
 * with the lift hole, balustrade boxes, shaft walls) plus masts, needle and core.
 */
export interface Statics {
  hull: THREE.BufferGeometry[];
  carbon: THREE.BufferGeometry[];
  alu: THREE.BufferGeometry[];
  teal: THREE.BufferGeometry[];
}

export interface Structure {
  liftCar: THREE.Group;
  /** warm tower lights (MeshStandard: dusk.ts lerps its emissiveIntensity) */
  windows: THREE.MeshStandardMaterial;
  /** the needle light, the nav lamp for everyone (its own instance of the windows material type; dusk.ts drives its intensity) */
  needle: THREE.MeshStandardMaterial;
  /** WP12 (§3.3): the crown beacons repeat the six rotor lamps, the needle light the nav lamp; k = pulse factors */
  setSystems(crown: readonly SystemLamp[], needle: SystemLamp, k?: { crown?: number; needle?: number }): void;
  /** start the core-ring brightness wave (a stamp: data rises to the mark) */
  wave(): void;
  /** W1: is a foyer door (S or N) open at all? (the drum is closed otherwise: opaque walls and doors) */
  readonly doorsOpen: boolean;
  update(dt: number, t: number, camPos: THREE.Vector3, playerPos: THREE.Vector3): void;
}

const N = 12;
const SIDE = 2 * TOWER.circumradius * Math.sin(Math.PI / N); // 4.66 m
const IN = TOWER.inradius;
const WALL = 0.45;
const DRUM_Y0 = 0.35; // carbon plinth reveal below
const FOYER_H = TOWER.foyerHeight;

/** world position + yaw of the facet centred on bearing b (outer face); local +Z points outward */
export function facetFrame(b: number): { x: number; z: number; yaw: number } {
  const a = b * DEG;
  return { x: Math.sin(a) * IN, z: -Math.cos(a) * IN, yaw: Math.atan2(Math.sin(a), -Math.cos(a)) };
}
const toFacet = (g: THREE.BufferGeometry, b: number): THREE.BufferGeometry => {
  const f = facetFrame(b);
  return g.rotateY(f.yaw).translate(f.x, 0, f.z);
};
const rbox = (w: number, h: number, d: number, r?: number): THREE.BufferGeometry => {
  const rr = r ?? THREE.MathUtils.clamp(0.04 * Math.min(w, h, d), 0.02, 0.25);
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(rr, Math.min(w, h, d) / 2 - 1e-3));
};

export function buildStructure(ctx: ZoneContext, kit: TowerKit, statics: Statics, stem: { a: THREE.Vector3; b: THREE.Vector3; radiusAt: (w: number) => number }): Structure {
  const root = ctx.root;
  const { hull, carbon, alu, teal } = statics;

  // ── foyer drum: 12 facets, two courses, doors S (4 × 4.5) and N (2.6 × 3) ──
  const facetPanel = (b: number, x0: number, x1: number, y0: number, y1: number): void => {
    const w = x1 - x0,
      h = y1 - y0;
    const g = new THREE.BoxGeometry(w, h, WALL);
    const uv = g.getAttribute('uv');
    const p = g.getAttribute('position');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + (x0 + x1) / 2 + SIDE / 2) / SIDE, (p.getY(i) + (y0 + y1) / 2) / 4.66);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, -WALL / 2);
    hull.push(clean(toFacet(g, b)));
    // collider for the ground floor (unchanged layout: walls up to 8 m)
    const f = facetFrame(b);
    const top = Math.min(y1, FOYER_H + 1);
    const c = new THREE.Vector3((x0 + x1) / 2, 0, -WALL / 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), f.yaw);
    const yb = y0 <= DRUM_Y0 + 0.01 ? 0 : y0; // the plinth reveal is solid too
    if (top > yb) ctx.physics.addStaticBox({ size: [w, top - yb, WALL], position: [f.x + c.x, (yb + top) / 2, f.z + c.z], rotation: [0, f.yaw, 0], surface: 'metal' });
  };
  const W2 = SIDE / 2 + 0.06;
  for (let k = 0; k < N; k++) {
    const b = k * 30;
    if (b === 180) {
      facetPanel(b, -W2, -2, DRUM_Y0, FOYER_H);
      facetPanel(b, 2, W2, DRUM_Y0, FOYER_H);
      facetPanel(b, -2, 2, 4.5, FOYER_H);
    } else if (b === 0) {
      facetPanel(b, -W2, -1.3, DRUM_Y0, FOYER_H);
      facetPanel(b, 1.3, W2, DRUM_Y0, FOYER_H);
      facetPanel(b, -1.3, 1.3, 3, FOYER_H);
    } else facetPanel(b, -W2, W2, DRUM_Y0, FOYER_H);
    // carbon seams between the two courses (skip door openings) and at the corners
    for (const y of [2.33, 4.66]) {
      const spans: [number, number][] = b === 180 ? (y < 4.5 ? [[-W2, -2.0], [2.0, W2]] : [[-W2, W2]]) : b === 0 && y < 3 ? [[-W2, -1.3], [1.3, W2]] : [[-W2, W2]];
      for (const [x0, x1] of spans) carbon.push(clean(toFacet(new THREE.BoxGeometry(x1 - x0, 0.05, 0.02).translate((x0 + x1) / 2, y, 0.005), b)));
    }
    const a = (b + 15) * DEG;
    const rc = TOWER.circumradius + 0.005;
    carbon.push(clean(new THREE.BoxGeometry(0.05, FOYER_H - DRUM_Y0, 0.05).translate(0, (FOYER_H + DRUM_Y0) / 2, 0).rotateY(-a).translate(Math.sin(a) * rc, 0, -Math.cos(a) * rc)));
  }
  // plinth reveal (carbon, inset 0.3 m). Open-ended: a closed cap at y 0.37 covered the whole foyer
  // floor with a dark glossy disc — the "blue water floor" of QA-17 (the old plinth had the same cap)
  carbon.push(clean(new THREE.CylinderGeometry((IN - 0.3) / Math.cos(Math.PI / N), (IN - 0.3) / Math.cos(Math.PI / N), DRUM_Y0 + 0.02, N, 1, true).rotateY(15 * DEG).translate(0, (DRUM_Y0 + 0.02) / 2, 0)));
  // collar (alu) and drum roof (ceramic, 2 % fall outward)
  alu.push(clean(new THREE.TorusGeometry(TOWER.circumradius, 0.35, 12, 96).rotateX(Math.PI / 2).translate(0, FOYER_H + 0.05, 0)));
  hull.push(clean(metreUVs(new THREE.LatheGeometry([new THREE.Vector2(CORE.r + 0.02, FOYER_H + 0.48), new THREE.Vector2(TOWER.circumradius - 0.1, FOYER_H + 0.36)].reverse(), 96), 4.8, 'cyl')));

  // S portal: chamfered alu frame, teal lintel line in a carbon channel, eyebrow
  {
    const fr: THREE.BufferGeometry[] = [];
    fr.push(rbox(0.3, 4.8, 0.3, 0.06).translate(-2.15, 2.4, 0.06));
    fr.push(rbox(0.3, 4.8, 0.3, 0.06).translate(2.15, 2.4, 0.06));
    fr.push(rbox(4.6, 0.3, 0.3, 0.06).translate(0, 4.65, 0.06));
    for (const g of fr) alu.push(clean(toFacet(g, 180)));
    carbon.push(clean(toFacet(new THREE.BoxGeometry(3.7, 0.025, 0.11).translate(0, 4.493, 0.08), 180)));
    teal.push(clean(toFacet(new THREE.BoxGeometry(3.6, 0.02, 0.05).translate(0, 4.475, 0.08), 180)));
    const nf: THREE.BufferGeometry[] = [];
    nf.push(rbox(0.2, 3.2, 0.24, 0.05).translate(-1.4, 1.6, 0.04));
    nf.push(rbox(0.2, 3.2, 0.24, 0.05).translate(1.4, 1.6, 0.04));
    nf.push(rbox(3.0, 0.2, 0.24, 0.05).translate(0, 3.1, 0.04));
    for (const g of nf) alu.push(clean(toFacet(g, 0)));
    teal.push(clean(toFacet(new THREE.BoxGeometry(2.4, 0.02, 0.05).translate(0, 2.99, 0.06), 0)));
    const eyebrow = ctx.text3d.create({
      text: { de: 'AKADEMIE · INSEL 17', en: 'ACADEMY · ISLAND 17' },
      font: 'mono-medium',
      size: 0.32,
      color: 0x78716c,
      anchorX: 'center',
      anchorY: 'middle',
      letterSpacing: 0.14,
      position: [0, 5.75, IN + 0.02],
    });
    eyebrow.name = 'tower:eyebrow';
    cullTinyText(ctx, eyebrow);
  }

  // split doors (dark glass, one instanced mesh): the lower leaf sinks into the deck, the upper one
  // rises into the wall above the opening — both vanish inside the facet (a sideways slide would
  // stick out past the 12-gon's corners). S 4 × 4.5 m, N 2.6 × 3 m.
  const doors = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), kit.darkGlass, 4);
  doors.name = 'tower:doors';
  root.add(doors);
  const doorState = { s: 0, n: 0 };
  const dm = new THREE.Matrix4();
  const dq = new THREE.Quaternion();
  const ds = new THREE.Vector3();
  const dp = new THREE.Vector3();
  const placeDoors = (): void => {
    const leaves: [number, number, number, number, number][] = [
      // bearing, width, opening height, open k, half (−1 lower, +1 upper)
      [180, 4.0, 4.5, doorState.s, -1],
      [180, 4.0, 4.5, doorState.s, 1],
      [0, 2.6, 3.0, doorState.n, -1],
      [0, 2.6, 3.0, doorState.n, 1],
    ];
    leaves.forEach(([b, w, h, k, half], i) => {
      const f = facetFrame(b);
      const e = k * k * (3 - 2 * k);
      const ly = h / 2 + half * (h / 4 + (h / 2 + 0.05) * e);
      dp.set(0, ly, -WALL / 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), f.yaw).add(new THREE.Vector3(f.x, 0, f.z));
      dq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.yaw);
      ds.set(w - 0.02, h / 2 - 0.01, 0.06);
      doors.setMatrixAt(i, dm.compose(dp, dq, ds));
    });
    doors.instanceMatrix.needsUpdate = true;
  };
  placeDoors();
  doors.computeBoundingSphere();
  doors.boundingSphere!.radius = 14;
  let nDoorCollider: { remove(): void } | null = null;
  const setNDoorCollider = (on: boolean): void => {
    if (on && !nDoorCollider) {
      const f = facetFrame(0);
      nDoorCollider = ctx.physics.addStaticBox({ size: [2.6, 3, 0.12], position: [f.x, 1.5, f.z + WALL / 2], rotation: [0, f.yaw, 0], surface: 'metal' });
    } else if (!on && nDoorCollider) {
      nDoorCollider.remove();
      nDoorCollider = null;
    }
  };

  // ── diagrid: hyperboloid of 2 × 18 straight members (phase: a diamond centred on the hub) ──
  const D = DIAGRID;
  const tw = D.twistDeg * DEG;
  const memberEnds = (phase: number): [THREE.Vector3, THREE.Vector3][] => {
    const out: [THREE.Vector3, THREE.Vector3][] = [];
    for (const sgn of [1, -1])
      for (let i = 0; i < D.n; i++) {
        const a0 = ((i * 360) / D.n + (sgn < 0 ? D.offsetDeg : 0) + phase) * DEG;
        const a1 = a0 + sgn * tw;
        out.push([new THREE.Vector3(Math.sin(a0) * D.rb, D.yb - 0.15, -Math.cos(a0) * D.rb), new THREE.Vector3(Math.sin(a1) * D.rt, D.yt + 0.15, -Math.cos(a1) * D.rt)]);
      }
    return out;
  };
  // pick the phase with the most clearance around the hub's collar seat at bearing 180 (0.25° steps over one period)
  let phase = 0;
  let clearance = -Infinity;
  {
    const sample = 24;
    const pts: THREE.Vector3[] = [];
    // the seat axis runs from the waist to the collar's inner face: test its length from w 0.1 on
    for (let i = 0; i <= sample; i++) pts.push(stem.a.clone().lerp(stem.b, 0.1 + (0.9 * i) / sample));
    const segDist = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number => {
      const ab = b.clone().sub(a);
      const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
      return a.clone().addScaledVector(ab, t).distanceTo(p);
    };
    for (let ph = 0; ph < 20; ph += 0.25) {
      let worst = Infinity;
      for (const [a, b] of memberEnds(ph)) for (let i = 0; i <= sample; i++) worst = Math.min(worst, segDist(pts[i], a, b) - stem.radiusAt(0.1 + (0.9 * i) / sample) - 0.2);
      if (worst > clearance) {
        clearance = worst;
        phase = ph;
      }
    }
    if (clearance < 0.05) console.warn(`[tower] hub seat clearance to the diagrid only ${clearance.toFixed(2)} m (phase ${phase}°)`);
  }
  {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, 0.5, 0);
    const ends = memberEnds(phase);
    const inst = new THREE.InstancedMesh(geo, kit.hull, ends.length);
    inst.name = 'tower:diagrid';
    const m = new THREE.Matrix4();
    const X = new THREE.Vector3(),
      Y = new THREE.Vector3(),
      Z = new THREE.Vector3();
    ends.forEach(([p0, p1], i) => {
      Y.subVectors(p1, p0);
      const L = Y.length();
      Y.divideScalar(L);
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      Z.set(mid.x, 0, mid.z).normalize();
      Z.addScaledVector(Y, -Y.dot(Z)).normalize();
      X.crossVectors(Y, Z).normalize();
      m.makeBasis(X.multiplyScalar(0.2), Y.multiplyScalar(L), Z.multiplyScalar(0.14));
      m.setPosition(p0);
      inst.setMatrixAt(i, m);
    });
    inst.computeBoundingSphere();
    inst.castShadow = true;
    inst.receiveShadow = true;
    root.add(inst);
    // ring beams (alu): bottom, top; the waist is held by the sculpture's ceramic collar (tower/mount.ts)
    alu.push(clean(new THREE.TorusGeometry(D.rb, 0.22, 10, 128).rotateX(Math.PI / 2).translate(0, D.yb, 0)));
    alu.push(clean(new THREE.TorusGeometry(D.rt, 0.22, 10, 128).rotateX(Math.PI / 2).translate(0, D.yt, 0)));
    // member feet: carbon shoes on the bottom ring
    for (const [p0] of ends) carbon.push(clean(new THREE.CylinderGeometry(0.26, 0.3, 0.3, 10).translate(p0.x, D.yb + 0.05, p0.z)));
  }

  // ── core: dark glass, 11 teal level rings with a stamp wave ────────────────
  {
    const core = new THREE.Mesh(new THREE.CylinderGeometry(CORE.r, CORE.r, CORE.y1 - CORE.y0, 48, 1, true).translate(0, (CORE.y0 + CORE.y1) / 2, 0), kit.darkGlass);
    core.name = 'tower:core';
    core.castShadow = true;
    root.add(markStatic(core));
    ctx.physics.addStaticCylinder({ radius: CORE.r, height: CORE.y1 - CORE.y0 - 0.6, position: [0, (CORE.y0 + CORE.y1) / 2 - 0.3, 0] });
  }
  const ringUni = { uWave: { value: -10 }, uK: { value: 1 } };
  {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < CORE.rings; i++) {
      const g = new THREE.TorusGeometry(CORE.r + 0.03, 0.035, 4, 72).rotateX(Math.PI / 2).translate(0, CORE.ringY0 + i * CORE.ringStep, 0);
      g.setAttribute('aRing', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(i), 1));
      g.deleteAttribute('uv');
      g.deleteAttribute('normal');
      parts.push(g);
    }
    const mat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf });
    mat.name = 'tower:coreRings';
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, ringUni);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aRing; varying float vRing;').replace('#include <project_vertex>', '#include <project_vertex>\nvRing = aRing;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uWave; uniform float uK; varying float vRing;')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'float wv = exp(-pow(vRing - uWave, 2.0) * 0.7);\nvec4 diffuseColor = vec4( diffuse * (uK + 2.6 * wv), opacity );');
    };
    mat.customProgramCacheKey = () => 'tower:coreRings-v1';
    ctx.onDispose(() => mat.dispose());
    const rings = new THREE.Mesh(merge(parts), mat);
    rings.name = 'tower:core-rings';
    root.add(rings);
  }

  // ── halo (Ausguck): ceramic lathe incl. the soffit to the core, deck top, lip light ──
  {
    const prof = [new THREE.Vector2(CORE.r + 0.02, 43.75), new THREE.Vector2(6.0, 43.05), ...HALO.map(([r, y]) => new THREE.Vector2(r, y))];
    hull.push(clean(metreUVs(new THREE.LatheGeometry(prof, 128), 4.8, 'cyl')));
    teal.push(clean(new THREE.TorusGeometry(13.02, 0.05, 6, 192).rotateX(Math.PI / 2).translate(0, 43.6, 0)));
    // 36 warm downlights in the halo soffit (work light over the plaza; glow at dusk)
    const dl: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 36; i++) {
      const a = ((i + 0.5) / 36) * Math.PI * 2;
      dl.push(new THREE.CircleGeometry(0.13, 12).rotateX(Math.PI / 2).translate(Math.sin(a) * 10.6, 43.03, Math.cos(a) * 10.6));
      carbon.push(clean(new THREE.TorusGeometry(0.16, 0.035, 4, 16).rotateX(Math.PI / 2).translate(Math.sin(a) * 10.6, 43.05, Math.cos(a) * 10.6)));
    }
    const dlm = new THREE.Mesh(merge(dl), kit.light('warm', 0, 1));
    dlm.name = 'tower:halo-downlights';
    root.add(markStatic(dlm));
    // walkable deck (visual and collider share the shape: disc r 12.92 with the lift hole)
    const y = TOWER.ausguck.y;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, TOWER.ausguck.outer - 0.08, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    const hx = 1.6;
    hole.moveTo(TOWER.lift.x - hx, -TOWER.lift.z - hx);
    hole.lineTo(TOWER.lift.x - hx, -TOWER.lift.z + hx);
    hole.lineTo(TOWER.lift.x + hx, -TOWER.lift.z + hx);
    hole.lineTo(TOWER.lift.x + hx, -TOWER.lift.z - hx);
    hole.lineTo(TOWER.lift.x - hx, -TOWER.lift.z - hx);
    shape.holes.push(hole);
    const dg = new THREE.ShapeGeometry(shape, 48);
    const uv = dg.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 12, uv.getY(i) / 12);
    dg.rotateX(-Math.PI / 2);
    const deck = new THREE.Mesh(dg, kit.deck);
    deck.name = 'tower:ausguck-deck';
    deck.position.y = y;
    deck.receiveShadow = true;
    root.add(deck);
    const collider = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24).rotateX(-Math.PI / 2));
    collider.position.y = y;
    collider.visible = false;
    root.add(collider);
    ctx.physics.addStaticTrimesh(collider, { surface: 'metal' });
    // shaft hole rim (carbon) and a teal edge line so the opening reads at a glance
    const rim: THREE.BufferGeometry[] = [];
    for (const [w, d, x, z] of [
      [3.3, 0.1, 0, -hx],
      [3.3, 0.1, 0, hx],
      [0.1, 3.3, -hx, 0],
      [0.1, 3.3, hx, 0],
    ])
      rim.push(new THREE.BoxGeometry(w, 0.04, d).translate(TOWER.lift.x + x, y + 0.02, TOWER.lift.z + z));
    for (const g of rim) carbon.push(clean(g));
  }

  // ── balustrade: glass, alu handrail and posts, teal line under the rail ─────
  const glass: THREE.BufferGeometry[] = [];
  {
    const y = TOWER.ausguck.y;
    const rB = TOWER.ausguck.outer - 0.15;
    glass.push(clean(new THREE.CylinderGeometry(rB, rB, 1.1, 128, 1, true).translate(0, y + 0.55, 0)));
    alu.push(clean(new THREE.TorusGeometry(rB, 0.045, 8, 192).rotateX(Math.PI / 2).translate(0, y + 1.12, 0)));
    teal.push(clean(new THREE.TorusGeometry(rB - 0.03, 0.008, 4, 192).rotateX(Math.PI / 2).translate(0, y + 1.065, 0)));
    for (let k = 0; k < 24; k++) {
      const a = ((k + 0.5) / 24) * Math.PI * 2;
      alu.push(clean(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 8).translate(Math.sin(a) * rB, y + 0.55, Math.cos(a) * rB)));
    }
    // colliders as before (36 boxes, 1.3 m)
    for (let k = 0; k < 36; k++) {
      const b = ((k + 0.5) / 36) * Math.PI * 2;
      const len = (2 * Math.PI * rB) / 36 + 0.2;
      ctx.physics.addStaticBox({ size: [len, 1.3, 0.2], position: [Math.sin(b) * rB, y + 0.65, Math.cos(b) * rB], rotation: [0, b, 0] });
    }
  }

  // ── crown: six sensor masts on the zone bearings, beacon rings, needle ─────
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  beaconMat.name = 'tower:beacons';
  ctx.onDispose(() => beaconMat.dispose());
  const beacons = new THREE.InstancedMesh(new THREE.TorusGeometry(0.36, 0.06, 6, 32).rotateX(Math.PI / 2), beaconMat, ZONE_PLOTS.length);
  beacons.name = 'tower:beacons';
  {
    const y = TOWER.ausguck.y;
    const shell: THREE.BufferGeometry[] = [];
    const m = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0);
    ZONE_PLOTS.forEach((z, i) => {
      const a = z.bearing * DEG;
      const out = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
      const base = out.clone().multiplyScalar(7.6).setY(y);
      const dir = out.clone().multiplyScalar(Math.sin(8 * DEG)).setY(Math.cos(8 * DEG));
      const L = 5.6;
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
      // brushed-alu sensor mast (tapered), carbon foot and band, white sensor pod with the beacon ring
      alu.push(clean(new THREE.CylinderGeometry(0.07, 0.11, L, 12).translate(0, L / 2, 0).applyQuaternion(q).translate(base.x, base.y, base.z)));
      carbon.push(clean(new THREE.CylinderGeometry(0.26, 0.32, 0.16, 16).translate(base.x, y + 0.08, base.z)));
      carbon.push(clean(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 12).translate(0, 1.2, 0).applyQuaternion(q).translate(base.x, base.y, base.z)));
      const tip = base.clone().addScaledVector(dir, L);
      shell.push(clean(new THREE.CylinderGeometry(0.34, 0.3, 0.3, 24).translate(0, 0.15, 0).applyQuaternion(q).translate(tip.x, tip.y, tip.z)));
      shell.push(clean(new THREE.SphereGeometry(0.34, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.3, 0).applyQuaternion(q).translate(tip.x, tip.y, tip.z)));
      m.compose(tip.clone().addScaledVector(dir, 0.3), q, new THREE.Vector3(1, 1, 1));
      beacons.setMatrixAt(i, m);
      const mid = base.clone().addScaledVector(dir, L / 2);
      const e = new THREE.Euler().setFromQuaternion(q);
      ctx.physics.addStaticCylinder({ radius: 0.15, height: L, position: [mid.x, mid.y, mid.z], rotation: [e.x, e.y, e.z] });
    });
    beacons.computeBoundingSphere();
    root.add(beacons);
    const pods = new THREE.Mesh(merge(shell), kit.shell);
    pods.name = 'tower:crown-pods';
    root.add(pods);
    // needle: alu cone 44 → 58 with a collar
    alu.push(clean(new THREE.CylinderGeometry(0.06, 0.2, 14, 14).translate(0, y + 7, 0)));
    alu.push(clean(new THREE.CylinderGeometry(0.42, 0.5, 0.3, 24).translate(0, y + 0.15, 0)));
    carbon.push(clean(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 16).translate(0, y + 0.6, 0)));
    ctx.physics.addStaticCylinder({ radius: 0.5, height: 1.2, position: [0, y + 0.6, 0] });
    ctx.physics.addStaticCylinder({ radius: 0.22, height: 13, position: [0, y + 7.5, 0] });
  }
  // WP12 (§3.3): the six crown beacons repeat the rotors (AUFTRIEB) for everyone on the island; the
  // objective keeps its own channels (gate-mast beacon, spoke inlay, pad beam), so the crown no longer
  // shows „visited / objective“. Dark until the Probestart; the dusk lifts them with the beacon tier.
  let crownLamps: readonly SystemLamp[] = ZONE_PLOTS.map(() => 'dark' as SystemLamp);
  let crownK = 1;
  const setBeacons = (): void => {
    const c = new THREE.Color();
    ZONE_PLOTS.forEach((_z, i) => beacons.setColorAt(i, lampColor(ctx.materials, crownLamps[i] ?? 'dark', c, crownK)));
    beacons.instanceColor!.needsUpdate = true;
  };
  setBeacons();
  for (const ev of ['progress:reset', 'game:start']) ctx.events.on(ev, () => (towerState.beaconsDirty = true));

  // warm tower lights (dusk.ts drives emissiveIntensity day → 2.6) and the anemometer
  const windows = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffe9cc, emissiveIntensity: 1.75, roughness: 0.4 });
  windows.name = 'hub:windows';
  ctx.onDispose(() => windows.dispose());
  // WP12 (§3.3): the needle light (Ausguck + 14.3 m, far outside the mark's clear space) is the nav lamp
  // for everyone: its own instance of the same material type (no new program); its emissive colour
  // carries the state, its intensity the dusk
  const needle = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x57534e, emissiveIntensity: 1.75, roughness: 0.4 });
  needle.name = 'tower:needle';
  ctx.onDispose(() => needle.dispose());
  let needleLamp: SystemLamp = 'dark';
  let needleK = 1;
  const setNeedle = (): void => {
    lampHue(needleLamp, needle.emissive).multiplyScalar(lampGain(needleLamp) * needleK * (needleLamp === 'dark' ? 0.25 : 1));
  };
  setNeedle();
  {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10), needle);
    lamp.name = 'tower:needle-light';
    lamp.position.set(0, TOWER.ausguck.y + 14.3, 0);
    root.add(lamp);
  }
  const anemo = new THREE.Group();
  anemo.name = 'tower:anemometer';
  anemo.position.set(0, TOWER.ausguck.y + 7.5, 0);
  {
    const g: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      g.push(clean(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6).rotateZ(Math.PI / 2).translate(0.6, 0, 0).rotateY(a)));
      g.push(clean(new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI).rotateY(Math.PI / 2).translate(1.2, 0, 0).rotateY(a)));
    }
    anemo.add(new THREE.Mesh(merge(g), kit.alu));
    anemo.add(new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.045, 8, 24).rotateX(Math.PI / 2), kit.orangePaint));
    root.add(anemo);
  }

  // ── lift shaft (exterior, N facet): round alu posts, glass on N/E/W, ceramic cap ──
  const lx = TOWER.lift.x,
    lz = TOWER.lift.z,
    hw = SHAFT.hw;
  {
    const top = SHAFT.capY - 0.4;
    for (const [cx, cz] of [
      [-hw, -hw],
      [hw, -hw],
      [-hw, hw],
      [hw, hw],
    ])
      alu.push(clean(new THREE.CylinderGeometry(0.11, 0.11, top + 0.1, 12).translate(lx + cx, (top - 0.1) / 2, lz + cz)));
    // N spine: a slim ceramic rib outside the north glass carries a teal line up the shaft
    const spineH = SHAFT.capY - 0.4;
    hull.push(clean(metreUVs(rbox(1.1, spineH, 0.32, 0.08).translate(lx, spineH / 2, lz - hw - 0.2), 4.8)));
    carbon.push(clean(new THREE.BoxGeometry(0.12, spineH - 1.2, 0.03).translate(lx, spineH / 2, lz - hw - 0.37)));
    teal.push(clean(new THREE.BoxGeometry(0.05, spineH - 1.4, 0.03).translate(lx, spineH / 2, lz - hw - 0.38)));
    for (let y = 7.2; y < TOWER.ausguck.y - 1; y += 7.2) {
      alu.push(clean(rbox(hw * 2, 0.07, 0.07, 0.02).translate(lx, y, lz - hw)));
      alu.push(clean(rbox(0.07, 0.07, hw * 2, 0.02).translate(lx - hw, y, lz)));
      alu.push(clean(rbox(0.07, 0.07, hw * 2, 0.02).translate(lx + hw, y, lz)));
    }
    const cap = rbox(3.6, 0.8, 3.6, 0.25).translate(lx, SHAFT.capY, lz);
    hull.push(clean(metreUVs(cap, 4.8)));
    teal.push(clean(new THREE.BoxGeometry(3.2, 0.03, 0.03).translate(lx, SHAFT.capY - 0.42, lz + 1.79)));
    const gh = TOWER.ausguck.y - 0.1;
    glass.push(clean(new THREE.PlaneGeometry(hw * 2, gh).translate(lx, gh / 2, lz - hw)));
    glass.push(clean(new THREE.PlaneGeometry(hw * 2, gh).rotateY(Math.PI / 2).translate(lx - hw, gh / 2, lz)));
    glass.push(clean(new THREE.PlaneGeometry(hw * 2, gh).rotateY(Math.PI / 2).translate(lx + hw, gh / 2, lz)));
    ctx.physics.addStaticBox({ size: [hw * 2 + 0.2, gh, 0.15], position: [lx, gh / 2, lz - hw - 0.05] });
    ctx.physics.addStaticBox({ size: [0.15, gh, hw * 2], position: [lx - hw - 0.05, gh / 2, lz] });
    ctx.physics.addStaticBox({ size: [0.15, gh, hw * 2], position: [lx + hw + 0.05, gh / 2, lz] });
  }
  {
    const gm = new THREE.Mesh(merge(glass), kit.glassClear);
    gm.name = 'tower:glass';
    gm.renderOrder = 2;
    root.add(gm);
  }
  // hatch over the shaft at the Ausguck while the car is away (the collider lid is permanent, see lift.ts)
  const hatch = new THREE.Group();
  hatch.name = 'tower:hatch';
  {
    hatch.add(new THREE.Mesh(rbox(3.12, 0.06, 3.12, 0.02), kit.carbon));
    const edge: THREE.BufferGeometry[] = [];
    for (const [w, d, x, z] of [
      [2.8, 0.05, 0, -1.4],
      [2.8, 0.05, 0, 1.4],
      [0.05, 2.8, -1.4, 0],
      [0.05, 2.8, 1.4, 0],
    ])
      edge.push(new THREE.BoxGeometry(w, 0.02, d).translate(x, 0.035, z));
    hatch.add(new THREE.Mesh(merge(edge), kit.light('teal')));
    hatch.position.set(lx, TOWER.ausguck.y - 0.03, lz);
    root.add(hatch);
  }

  // lift car: one rounded white shell + one light mesh (teal floor band, warm ceiling lamp)
  const liftCar = new THREE.Group();
  liftCar.name = 'hub:lift-car';
  {
    const s: THREE.BufferGeometry[] = [];
    const w = hw * 2 - 0.1;
    // QA-12: floor top 3 cm above the stop height (no z-fight with the Kiel catwalk or the deck)
    s.push(clean(rbox(w, 0.2, w, 0.05).translate(0, 0.03 - 0.1, 0)));
    s.push(clean(rbox(w, 0.16, w, 0.05).translate(0, 2.88, 0)));
    for (const [cx, cz] of [
      [-w / 2 + 0.07, -w / 2 + 0.07],
      [w / 2 - 0.07, -w / 2 + 0.07],
      [-w / 2 + 0.07, w / 2 - 0.07],
      [w / 2 - 0.07, w / 2 - 0.07],
    ])
      s.push(clean(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 10).translate(cx, 1.43, cz)));
    // back wall (N) carrying the console, with a handrail
    s.push(clean(rbox(w - 0.2, 2.7, 0.06, 0.02).translate(0, 1.43, -w / 2 + 0.03)));
    s.push(clean(new THREE.CylinderGeometry(0.025, 0.025, w - 0.4, 8).rotateZ(Math.PI / 2).translate(0, 0.95, -w / 2 + 0.12)));
    const shellMesh = new THREE.Mesh(merge(s), kit.shell);
    shellMesh.castShadow = false;
    liftCar.add(shellMesh);
    const l: THREE.BufferGeometry[] = [];
    const teal = new THREE.Color(0x2dd4bf);
    const warm = new THREE.Color(0xffe9cc).multiplyScalar(0.6);
    const paint = (g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry => {
      g.deleteAttribute('uv');
      const n = g.getAttribute('position').count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return g;
    };
    for (const [bw, bd, x, z] of [
      [w, 0.04, 0, -w / 2],
      [w, 0.04, 0, w / 2],
      [0.04, w, -w / 2, 0],
      [0.04, w, w / 2, 0],
    ])
      l.push(paint(new THREE.BoxGeometry(bw, 0.05, bd).translate(x, -0.04, z), teal));
    l.push(paint(new THREE.BoxGeometry(1.4, 0.03, 0.2).translate(0, 2.79, 0), warm));
    liftCar.add(new THREE.Mesh(merge(l), kit.lightVC));
    liftCar.position.set(lx, 0, lz);
    root.add(liftCar);
  }

  // ── plaza benches (same footprint): ceramic seat with an alu edge on carbon feet ──
  {
    for (const b of [60, 120, 240, 300]) {
      const a0 = (b - 7) * DEG,
        a1 = (b + 7) * DEG;
      const shape = new THREE.Shape();
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        if (i === 0) shape.moveTo(Math.sin(a) * 23.08, Math.cos(a) * 23.08);
        else shape.lineTo(Math.sin(a) * 23.08, Math.cos(a) * 23.08);
      }
      for (let i = n; i >= 0; i--) {
        const a = a0 + ((a1 - a0) * i) / n;
        shape.lineTo(Math.sin(a) * 22.47, Math.cos(a) * 22.47);
      }
      const slab = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2 }).rotateX(Math.PI / 2).translate(0, 0.52, 0);
      slab.scale(1, 1, -1);
      hull.push(clean(metreUVs(slab, 4.8)));
      // alu edge on the outer rim
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        pts.push(new THREE.Vector3(Math.sin(a) * 23.1, 0.49, -Math.cos(a) * 23.1));
      }
      alu.push(clean(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.02, 4, false)));
      for (const k of [0.15, 0.5, 0.85]) {
        const a = a0 + (a1 - a0) * k;
        carbon.push(clean(rbox(0.44, 0.44, 0.36, 0.04).rotateY(-a + Math.PI).translate(Math.sin(a) * 22.77, 0.22, -Math.cos(a) * 22.77)));
      }
      const a = b * DEG;
      ctx.physics.addStaticBox({ size: [5.6, 0.55, 0.7], position: [Math.sin(a) * 22.77, 0.275, -Math.cos(a) * 22.77], rotation: [0, -a, 0] });
    }
  }

  let waveT = -1;
  let tAcc = 0;
  return {
    liftCar,
    windows,
    needle,
    setSystems(crown, nav, k = {}) {
      crownLamps = crown;
      crownK = k.crown ?? 1;
      needleLamp = nav;
      needleK = k.needle ?? 1;
      setBeacons();
      setNeedle();
    },
    get doorsOpen() {
      return doorState.s > 0 || doorState.n > 0;
    },
    wave() {
      waveT = 0;
    },
    update(dt, t, camPos, playerPos) {
      void camPos;
      tAcc += dt;
      anemo.rotation.y = t * 1.3;
      // doors: S opens when someone is near; N only when the car waits at the foyer
      const dS = Math.hypot(playerPos.x, playerPos.z - IN);
      const dN = Math.hypot(playerPos.x - lx, playerPos.z + IN);
      const nearY = playerPos.y > -1 && playerPos.y < 6;
      const wantS = nearY && dS < 7.5 ? 1 : 0;
      const carHere = towerState.liftAt === 'foyer' && !towerState.liftBusy;
      const wantN = nearY && dN < 4.2 && carHere ? 1 : 0;
      const step = dt * 1.6;
      const s0 = doorState.s,
        n0 = doorState.n;
      doorState.s += THREE.MathUtils.clamp(wantS - doorState.s, -step, step);
      doorState.n += THREE.MathUtils.clamp(wantN - doorState.n, -step, step);
      if (s0 !== doorState.s || n0 !== doorState.n) placeDoors();
      // N door blocks the empty shaft while the car is away or riding
      setNDoorCollider(doorState.n < 0.6 && !(dN < 1.6 && nearY && carHere));
      // shaft hatch at the Ausguck: shown while the car is not up
      hatch.visible = towerState.carY < TOWER.ausguck.y - 0.05;
      // core wave
      if (waveT >= 0) {
        waveT += dt;
        ringUni.uWave.value = -1.5 + (waveT / 1.2) * (CORE.rings + 2);
        if (waveT > 1.6) {
          waveT = -1;
          ringUni.uWave.value = -10;
        }
      }
      ringUni.uK.value = THREE.MathUtils.lerp(1.0, 2.8, kit.duskK);
      if (towerState.beaconsDirty || tAcc > 1) {
        tAcc = 0;
        towerState.beaconsDirty = false;
        setBeacons();
      }
    },
  };
}
