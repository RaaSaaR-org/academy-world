import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { DEG, bearingDir } from '../../layout';
import { BEATS } from '../tuning';

/**
 * The Flugmodell's ghost horizon (plan §4.15, D23; TRAUM): inside the cloud, where the camera sees
 * nothing, the world model draws where „level“ will be two seconds ahead (the horizon of Traumhangar B)
 * and the climb path it predicts. A band at eye height round the Ausguck (r 26 m) with tick marks, and
 * five chevrons ahead toward the sun that climb with the predicted rate. Two meshes on a copy of the
 * dream ghosts' material (ctx.robots.ghost: the same teal, the same program, so the title links none of
 * its own; WP17), front faces toward the eye, opacity ≤ 0.55 so it stays under the mist's luminance cap
 * (flash rule). Shown only while
 * the eye is inside the cloud; it fades in over ≥ 2 s. Reduced motion: static (no tilt, no climb).
 * The root carries userData.ghostHorizon for liftoff-check.
 */
export interface GhostHorizon {
  readonly root: THREE.Group;
  /** 0 hidden … 1 full (the director ramps it) */
  setOpacity(k: number): void;
  /** the predicted attitude in 2 s (deg) and the predicted climb in 2 s (m) */
  setPrediction(rollDeg: number, pitchDeg: number, climb2s: number): void;
}

const R = 26;
const BAND_H = 0.16;
const TEAL = 0x2dd4bf;
const MAX_OPACITY = 0.55;

export function buildGhostHorizon(ctx: ZoneContext): GhostHorizon {
  const root = new THREE.Group();
  root.name = 'liftoff:ghost-horizon';
  root.userData.ghostHorizon = true;
  root.position.set(0, BEATS.eyeY, 0);
  root.visible = false;
  ctx.root.add(root);

  // a copy, so the fade has its own opacity (the copy keeps the shared program: same parameters)
  const mat = ctx.robots ? ctx.robots.ghost.clone() : new THREE.MeshStandardMaterial({ color: TEAL, emissive: TEAL, emissiveIntensity: 0.4, roughness: 0.6, metalness: 0, transparent: true, depthWrite: false });
  mat.opacity = 0;
  mat.name = 'liftoff:ghost';
  mat.userData.noEnrich = true;

  // the band (an open cylinder) and 36 ticks every 10°, the four at the compass points longer
  // (the band mirrored, so its front faces look inward at the eye: one pass, no back-face program)
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(R, R, BAND_H, 120, 1, true).scale(-1, 1, 1)];
  for (let i = 0; i < 36; i++) {
    const long = i % 9 === 0;
    const h = long ? 1.1 : 0.45;
    const t = new THREE.PlaneGeometry(0.07, h);
    const [x, z] = bearingDir(i * 10);
    t.rotateY(-i * 10 * DEG);
    t.translate(x * R, 0, z * R);
    parts.push(t);
  }
  const band = new THREE.Mesh(mergeAll(parts), mat);
  band.name = 'liftoff:ghost-band';
  band.frustumCulled = false;
  root.add(band);

  // five chevrons ahead (bearing 295, toward the sun patch), 1, 2, 3, 4 and 5 half-seconds out
  const chev: THREE.BufferGeometry[] = [];
  const shape = new THREE.Shape();
  shape.moveTo(-0.9, -0.25);
  shape.lineTo(0, 0.25);
  shape.lineTo(0.9, -0.25);
  shape.lineTo(0.9, -0.05);
  shape.lineTo(0, 0.45);
  shape.lineTo(-0.9, -0.05);
  shape.closePath();
  const one = new THREE.ShapeGeometry(shape);
  for (let i = 0; i < 5; i++) {
    const g = one.clone();
    const s = 1 - i * 0.12;
    g.scale(s, s, 1);
    chev.push(g);
  }
  one.dispose();
  const chevGeo = mergeAll(chev);
  // the chevrons' rest positions; placeChevrons() moves each one's vertices up the predicted climb
  const base = (chevGeo.getAttribute('position') as THREE.BufferAttribute).array.slice() as Float32Array;
  const per = base.length / 3 / 5;
  const chevrons = new THREE.Mesh(chevGeo, mat);
  chevrons.name = 'liftoff:ghost-path';
  chevrons.frustumCulled = false;
  const ahead = bearingDir(295);
  chevrons.position.set(ahead[0] * 17, 0, ahead[1] * 17);
  chevrons.rotation.y = -295 * DEG;
  root.add(chevrons);

  let lastClimb = NaN;
  const placeChevrons = (climb2s: number): void => {
    if (Math.abs(climb2s - lastClimb) < 0.02) return;
    lastClimb = climb2s;
    const pos = chevGeo.getAttribute('position') as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    // the path rises with the predicted climb: chevron i sits (i + 1) / 5 of the 2 s ahead, drawn at ×0.35
    for (let i = 0; i < 5; i++) {
      const dy = -0.6 + ((i + 1) / 5) * climb2s * 0.35;
      const dz = -i * 1.6;
      for (let v = i * per; v < (i + 1) * per; v++) {
        a[v * 3] = base[v * 3];
        a[v * 3 + 1] = base[v * 3 + 1] + dy;
        a[v * 3 + 2] = base[v * 3 + 2] + dz;
      }
    }
    pos.needsUpdate = true;
  };
  placeChevrons(0);
  ctx.onDispose(() => {
    band.geometry.dispose();
    chevGeo.dispose();
    mat.dispose();
  });

  const e = new THREE.Euler();
  return {
    root,
    setOpacity(k) {
      const o = Math.max(0, Math.min(1, k)) * MAX_OPACITY;
      mat.opacity = o;
      root.visible = o > 0.004;
    },
    setPrediction(rollDeg, pitchDeg, climb2s) {
      if (ctx.settings.reducedMotion) {
        root.rotation.set(0, 0, 0);
        placeChevrons(0);
        return;
      }
      // the island tilts by (roll, pitch): the horizon it predicts tilts the other way in the island frame
      root.rotation.copy(e.set(pitchDeg * DEG, 0, rollDeg * DEG));
      placeChevrons(climb2s);
    },
  };
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // non-indexed merge of the positions (no uvs; the normals are computed from the faces)
  let n = 0;
  const flat = list.map((g) => {
    const f = g.index ? g.toNonIndexed() : g;
    n += f.getAttribute('position').count;
    return f;
  });
  const out = new Float32Array(n * 3);
  let o = 0;
  for (const f of flat) {
    const p = f.getAttribute('position').array as Float32Array;
    out.set(p, o);
    o += p.length;
  }
  for (const g of list) g.dispose();
  for (const f of flat) f.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  // the lit ghost material needs normals (flat: one per face, toward the eye)
  geo.computeVertexNormals();
  return geo;
}
