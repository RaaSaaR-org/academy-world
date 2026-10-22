import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { SENSOR_MASTS } from './plan';
import { type Batch, paint } from './batch';

/**
 * Sensormasten (ART-V2 §4.1): the island measures itself. Twelve tapered carbon masts on the rim
 * strip, alu collars, white sensor heads: a LiDAR puck, a GNSS dome or an anemometer with a wind
 * vane. The vanes swing into every gust (FUN-PLAN W5: you can watch the island feel the wind),
 * the cups turn (orange hub ring: it rotates). Static parts → batch; cups and vanes instanced.
 */
export interface SensorMasts {
  update(dt: number, animate: boolean): void;
  gust(strength: number, bearing: number): void;
}

const CARBON = 0x1c1917,
  ALU = 0xc9c4bf,
  SHELL = 0xe7e5e4,
  GLASS = 0x0f0e0d;

export function buildSensorMasts(ctx: ZoneContext, batch: Batch): SensorMasts {
  const M = ctx.materials;
  const mat = M.standard({ vertexColors: true, roughness: 0.38, metalness: 0.25 });
  const windMasts: { x: number; z: number; top: number }[] = [];
  for (const m of SENSOR_MASTS) {
    const parts: THREE.BufferGeometry[] = [];
    // carbon foot, alu collars, tapered ceramic pole (24 % taper) with a carbon spine band
    parts.push(paint(new THREE.CylinderGeometry(0.26, 0.3, 0.12, 16).translate(0, 0.06, 0), CARBON));
    parts.push(paint(new THREE.CylinderGeometry(0.12, 0.14, 0.1, 16).translate(0, 0.17, 0), ALU));
    parts.push(paint(new THREE.CylinderGeometry(0.07, 0.092, m.h - 0.22, 12).translate(0, 0.22 + (m.h - 0.22) / 2, 0), 0xd6d3d1));
    parts.push(paint(new THREE.CylinderGeometry(0.087, 0.087, 0.5, 12).translate(0, m.h * 0.52 - 0.32, 0), CARBON));
    parts.push(paint(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 14).translate(0, m.h * 0.52, 0), ALU));
    parts.push(paint(new THREE.CylinderGeometry(0.11, 0.08, 0.1, 14).translate(0, m.h + 0.03, 0), ALU));
    // small junction box with a status lens (dark glass)
    parts.push(paint(new THREE.BoxGeometry(0.16, 0.26, 0.1).translate(0, 1.15, 0.12), SHELL));
    parts.push(paint(new THREE.BoxGeometry(0.1, 0.05, 0.012).translate(0, 1.22, 0.176), GLASS));
    // phase 5: an outward boom at 3/4 height with an instrument, so the mast reads as a measuring
    // mast and never as a lamp post: a camera pod on the LiDAR masts, a stacked-plate radiation
    // shield (temperature/humidity) on the others; a slim lightning spike above the domes and pucks
    const hb = m.h * 0.76;
    parts.push(paint(new THREE.CylinderGeometry(0.095, 0.095, 0.09, 14).translate(0, hb, 0), ALU));
    parts.push(paint(new THREE.CylinderGeometry(0.022, 0.026, 1.05, 8).rotateX(Math.PI / 2).translate(0, hb, -0.6), ALU));
    if (m.kind === 0) {
      parts.push(paint(new THREE.BoxGeometry(0.16, 0.14, 0.26).translate(0, hb - 0.1, -1.08), SHELL));
      parts.push(paint(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 14).rotateX(Math.PI / 2).translate(0, hb - 0.1, -1.225), GLASS));
    } else {
      parts.push(paint(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 6).translate(0, hb - 0.18, -1.1), ALU));
      for (let k = 0; k < 6; k++) parts.push(paint(new THREE.CylinderGeometry(0.1 - k * 0.004, 0.105 - k * 0.004, 0.022, 16).translate(0, hb - 0.06 - k * 0.05, -1.1), SHELL));
    }
    const top = m.h + 0.08;
    if (m.kind !== 2) parts.push(paint(new THREE.CylinderGeometry(0.004, 0.012, 0.62, 5).translate(0, top + (m.kind === 0 ? 0.25 : 0.24) + 0.31, 0), ALU));
    if (m.kind === 0) {
      // LiDAR puck: shell drum, dark window band, alu cap
      parts.push(paint(new THREE.CylinderGeometry(0.2, 0.22, 0.1, 24).translate(0, top + 0.05, 0), SHELL));
      parts.push(paint(new THREE.CylinderGeometry(0.205, 0.205, 0.09, 24).translate(0, top + 0.145, 0), GLASS));
      parts.push(paint(new THREE.CylinderGeometry(0.17, 0.205, 0.06, 24).translate(0, top + 0.22, 0), ALU));
    } else if (m.kind === 1) {
      // GNSS dome on an alu plate
      parts.push(paint(new THREE.CylinderGeometry(0.24, 0.24, 0.035, 24).translate(0, top + 0.018, 0), ALU));
      parts.push(paint(new THREE.SphereGeometry(0.21, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, top + 0.035, 0), SHELL));
    } else {
      // anemometer + vane: a cross-arm head; cups and vane are instanced (they move)
      parts.push(paint(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 10).translate(0, top + 0.25, 0), ALU));
      windMasts.push({ x: m.x, z: m.z, top });
    }
    const yaw = (-m.bearing * Math.PI) / 180;
    for (const p of parts) batch.add(mat, p.rotateY(yaw).translate(m.x, 0, m.z), { name: 'sensor-masts' });
    // steady teal status lens (T0 → T1 at dusk)
    batch.add(M.light(0x2dd4bf), new THREE.BoxGeometry(0.08, 0.025, 0.012).translate(0, 1.22, 0.183).rotateY(yaw).translate(m.x, 0, m.z), { name: 'teal-lines' });
    ctx.physics.addStaticCylinder({ radius: 0.16, height: m.h, position: [m.x, m.h / 2, m.z], surface: 'metal' });
  }

  // ── moving parts: cup rotors (shell cups, orange hub ring) and wind vanes ──
  const cupGeo = (() => {
    const parts: THREE.BufferGeometry[] = [paint(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12), SHELL), paint(new THREE.TorusGeometry(0.055, 0.012, 6, 16).rotateX(Math.PI / 2).translate(0, 0.02, 0), 0xff6700)];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      parts.push(paint(new THREE.CylinderGeometry(0.008, 0.008, 0.28, 5).rotateZ(Math.PI / 2).translate(0.14, 0, 0).rotateY(a), ALU));
      parts.push(paint(new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI).rotateY(Math.PI / 2).translate(0.28, 0, 0).rotateY(a), SHELL));
    }
    return mergeColored(parts);
  })();
  const vaneGeo = (() => {
    const parts: THREE.BufferGeometry[] = [
      paint(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10), ALU),
      paint(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 5).rotateX(Math.PI / 2).translate(0, 0, 0.1), ALU),
      paint(new THREE.BoxGeometry(0.008, 0.18, 0.26).translate(0, 0.02, 0.48), SHELL),
      paint(new THREE.ConeGeometry(0.04, 0.12, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.4), CARBON),
    ];
    return mergeColored(parts);
  })();
  const n = windMasts.length;
  const cups = new THREE.InstancedMesh(cupGeo, mat, n);
  const vanes = new THREE.InstancedMesh(vaneGeo, mat, n);
  cups.name = 'island:anemometers';
  vanes.name = 'island:wind-vanes';
  ctx.root.add(cups, vanes);
  ctx.freezeStatic(cups);
  ctx.freezeStatic(vanes);
  const spin = new Float32Array(n),
    yawNow = new Float32Array(n),
    yawVel = new Float32Array(n);
  let windYaw = (40 * Math.PI) / 180,
    windSpeed = 0.6,
    gustLeft = 0;
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    one = new THREE.Vector3(1, 1, 1),
    p = new THREE.Vector3(),
    Y = new THREE.Vector3(0, 1, 0);
  windMasts.forEach((_, i) => {
    spin[i] = i * 1.3;
    yawNow[i] = windYaw;
  });
  const place = (): void => {
    windMasts.forEach((w, i) => {
      cups.setMatrixAt(i, m4.compose(p.set(w.x, w.top + 0.54, w.z), q.setFromAxisAngle(Y, spin[i]), one));
      vanes.setMatrixAt(i, m4.compose(p.set(w.x, w.top + 0.32, w.z), q.setFromAxisAngle(Y, yawNow[i]), one));
    });
    cups.instanceMatrix.needsUpdate = true;
    vanes.instanceMatrix.needsUpdate = true;
  };
  place();
  cups.computeBoundingSphere();
  vanes.computeBoundingSphere();
  let t = 0;
  return {
    gust(strength, bearing) {
      // the vane's tail points downwind: nose into the wind (bearing it comes from)
      windYaw = Math.PI - (bearing * Math.PI) / 180;
      windSpeed = 0.6 + strength * 3;
      gustLeft = 4.5;
    },
    update(dt, animate) {
      t += dt;
      if (gustLeft > 0) gustLeft -= dt;
      else windSpeed += (0.6 - windSpeed) * (1 - Math.exp(-dt * 0.5));
      if (!animate) return;
      for (let i = 0; i < n; i++) {
        spin[i] += dt * windSpeed * 2.2;
        // gentle wander around the wind direction, damped second-order follow (no snapping)
        const target = windYaw + Math.sin(t * 0.13 + i) * 0.08;
        let d = target - yawNow[i];
        d = Math.atan2(Math.sin(d), Math.cos(d));
        yawVel[i] += (d * 6 - yawVel[i] * 2.4) * dt;
        yawNow[i] += yawVel[i] * dt;
      }
      place();
    },
  };
}

function mergeColored(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geos = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of geos) {
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
  }
  const total = geos.reduce((a, g) => a + g.getAttribute('position').count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const arr = new Float32Array(total * 3);
    let o = 0;
    for (const g of geos) {
      arr.set(g.getAttribute(name).array as Float32Array, o);
      o += g.getAttribute(name).count * 3;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return out;
}
