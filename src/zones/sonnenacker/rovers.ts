/**
 * Sonnenacker — the LeKiwi crate rovers (plan §4.10, R8 §2.1; WP0 R5): the real open mobile base
 * (SIGRobotics-UIUC, Apache-2.0; the licence gate is green, the model is flagged for the legal review
 * before release) carrying a small tray of tomatoes from the bed ends to the Hofladen's depot. The base
 * is 12 cm tall and its omni wheels are not seen turning, so every rover is one instance of the LeKiwi's
 * own simplified mesh (WP0's .l2.glb, ≈ 600 triangles, the real model) plus one instance of the tray:
 * two draws for all. They stop for you (robots yield to people) and for a crate on their path (station
 * C's „tray“ call).
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { ROVERS } from './tuning';
import { TOK, box, merge, paint, type Look } from './look';

export interface Rovers {
  readonly ready: boolean;
  retry(): void;
  /** a point on the path that blocks it (null: free) */
  setBlocked(at: THREE.Vector3 | null): void;
  /** the time-lapse of the automated day */
  setSpeed(k: number): void;
  /** rover i's position (zone-local) */
  pos(i: number, out?: THREE.Vector3): THREE.Vector3;
  update(dt: number): void;
  stats(): { draws: number; ready: boolean; blocked: boolean };
}

export function buildRovers(ctx: ZoneContext, look: Look, y: (x: number, z: number) => number, detail: THREE.Object3D): Rovers {
  const loop = ROVERS.loop.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const segLen = loop.map((p, i) => p.distanceTo(loop[(i + 1) % loop.length]));
  const total = segLen.reduce((a, b) => a + b, 0);
  // the dwell points: the bed ends (x ±7.8 at z 45.5) and the depot
  const dwellAt = [0, 4, 5].map((i) => loop.slice(0, i).reduce((a, _, k) => a + segLen[k], 0));
  const rov = Array.from({ length: ROVERS.count }, (_, i) => ({ s: (i / ROVERS.count) * total, dwell: 0, lastDwell: -1, p: new THREE.Vector3(), yaw: 0 }));
  const group = new THREE.Group();
  group.name = 'sonnenacker:rovers';
  detail.add(group);
  // the tray on top (larch, with tomatoes)
  const trayGeo = merge([paint(box(0.3, 0.035, 0.22, 0, 0.0175, 0), TOK.timberFresh), paint(box(0.26, 0.03, 0.18, 0, 0.045, 0), TOK.tomato)]);
  const trays = new THREE.InstancedMesh(trayGeo, look.paint, ROVERS.count);
  trays.name = 'sonnenacker:rover-trays';
  trays.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trays.castShadow = true;
  trays.frustumCulled = false;
  group.add(trays);
  ctx.onDispose(() => {
    trayGeo.dispose();
    trays.dispose();
  });

  let mesh: THREE.InstancedMesh | null = null;
  let ready = false;
  let loading = false;
  const load = (): void => {
    if (ready || loading) return;
    loading = true;
    void ctx.robots
      .loadSilhouette('lekiwi-base')
      .then((sil) => {
        mesh = new THREE.InstancedMesh(sil.geometry, look.paint, ROVERS.count);
        mesh.name = 'sonnenacker:lekiwi';
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        group.add(mesh);
        ready = true;
        loading = false;
      })
      .catch((err) => {
        loading = false;
        console.warn('[sonnenacker] LeKiwi not loaded', err);
      });
  };
  load();

  let blocked: THREE.Vector3 | null = null;
  let speedK = 1;
  const at = (s: number, out: THREE.Vector3): { yaw: number } => {
    let d = ((s % total) + total) % total;
    for (let i = 0; i < loop.length; i++) {
      if (d <= segLen[i]) {
        const a = loop[i],
          b = loop[(i + 1) % loop.length];
        out.lerpVectors(a, b, d / segLen[i]);
        out.y = y(out.x, out.z);
        return { yaw: Math.atan2(b.x - a.x, b.z - a.z) };
      }
      d -= segLen[i];
    }
    out.copy(loop[0]);
    return { yaw: 0 };
  };
  const base = new THREE.Matrix4();
  const mm = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const tmp = new THREE.Vector3();
  const player = new THREE.Vector3();
  return {
    get ready() {
      return ready;
    },
    retry: load,
    setBlocked(p) {
      blocked = p ? p.clone() : null;
    },
    setSpeed(k) {
      speedK = k;
    },
    pos(i, out = new THREE.Vector3()) {
      return out.copy(rov[i].p);
    },
    update(dt) {
      ctx.player.positionLocal(player);
      for (let i = 0; i < rov.length; i++) {
        const r = rov[i];
        const v = ROVERS.speed * speedK;
        // stop for the player and for a crate on the path (the „tray“ call); dwell at the stations
        at(r.s + 0.6, tmp);
        const stopP = Math.hypot(player.x - tmp.x, player.z - tmp.z) < 1.1;
        const stopB = !!blocked && Math.hypot(blocked.x - tmp.x, blocked.z - tmp.z) < 0.9;
        if (r.dwell > 0) r.dwell -= dt * speedK;
        else if (!stopP && !stopB) {
          const s0 = r.s;
          r.s = (r.s + v * dt) % total;
          for (const d of dwellAt) {
            const crossed = s0 <= d && r.s > d;
            if (crossed && r.lastDwell !== d) {
              r.dwell = ROVERS.dwellS;
              r.lastDwell = d;
            }
          }
        }
        const { yaw } = at(r.s, r.p);
        // ease the heading at the corners
        let dy = yaw - r.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        r.yaw += dy * Math.min(1, dt * 4);
        q.setFromAxisAngle(Y, r.yaw);
        base.compose(r.p, q, one);
        mm.makeTranslation(0, 0.13, 0);
        trays.setMatrixAt(i, mm.premultiply(base));
        mesh?.setMatrixAt(i, base);
      }
      trays.instanceMatrix.needsUpdate = true;
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    },
    stats: () => ({ draws: mesh ? 2 : 1, ready, blocked: !!blocked }),
  };
}
