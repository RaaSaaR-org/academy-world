/**
 * WP15 — birds (plan §4.12 L17 „at each rotor birds flush“; R9 L9 in its MUST part): two small flocks
 * feed on the ground (one by the Sonnenacker, one on the WSW yard below the dock rim). A rotor beat, the
 * lift-off, a 'flush' reaction or you sprinting into them sends them up: a loose flock circles for
 * ≈ 11 s and settles again. Under reduced motion they only hop. One instanced draw (the shared paint),
 * ground frame, only while a flock is near or mid.
 */
import * as THREE from 'three';
import type { Text, ZoneContext } from '@/core/zones';
import type { Vec3Tuple } from '../layout';
import type { Director } from './director';
import type { LifeSounds } from './sound';
import type { LifeTier, ReactKind } from './types';
import { BIRDS } from './tuning';
import { PAL, at, box, mergeParts } from './geo';

interface Bird {
  home: THREE.Vector3;
  p: THREE.Vector3;
  v: THREE.Vector3;
  yaw: number;
  peck: number;
  flap: number;
  off: THREE.Vector3;
}
interface Flock {
  id: string;
  center: THREE.Vector3;
  birds: Bird[];
  /** seconds left in the air (0 = feeding) */
  air: number;
  tier: LifeTier;
  angle: number;
}

export function buildBirds(ctx: ZoneContext, h: { director: Director; paint: THREE.Material; heightAt(x: number, z: number): number; sounds: LifeSounds }): { flush(at?: Vec3Tuple): void } {
  const D = h.director;
  // a swallow-sized bird: body and two wings in a V (16 boxes' worth of triangles: 36)
  const geo = mergeParts([
    box(0.055, 0.045, 0.17, 0xffffff, 0, 0, 0),
    at(box(0.15, 0.008, 0.07, 0xffffff), -0.08, 0.012, 0.01, 0, 0, 0.32),
    at(box(0.15, 0.008, 0.07, 0xffffff), 0.08, 0.012, 0.01, 0, 0, -0.32),
  ]);
  ctx.onDispose(() => geo.dispose());
  const total = BIRDS.flocks.reduce((a, f) => a + f.n, 0);
  const mesh = new THREE.InstancedMesh(geo, h.paint, total);
  mesh.name = 'life:birds';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  D.roots.ground.add(mesh);
  D.track(mesh);
  const _c = new THREE.Color();
  for (let i = 0; i < total; i++) mesh.setColorAt(i, _c.setHex(i % 3 ? 0x3a3f46 : PAL.slate));
  const T = (de: string, en: string): Text => ({ de, en });

  const flocks: Flock[] = BIRDS.flocks.map((f, k) => {
    const c = new THREE.Vector3(f.at[0], h.heightAt(f.at[0], f.at[2]), f.at[2]);
    const birds: Bird[] = [];
    for (let i = 0; i < f.n; i++) {
      const a = Math.random() * Math.PI * 2,
        r = 1 + Math.random() * 5;
      const hx = c.x + Math.cos(a) * r,
        hz = c.z + Math.sin(a) * r;
      const home = new THREE.Vector3(hx, h.heightAt(hx, hz) + 0.03, hz);
      birds.push({ home, p: home.clone(), v: new THREE.Vector3(), yaw: Math.random() * 6.28, peck: Math.random() * 3, flap: Math.random() * 6, off: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 9) });
    }
    const id = `flock${k}`;
    D.area(id, { center: [c.x, c.y, c.z], radius: 14, frame: 'ground' });
    return { id, center: c, birds, air: 0, tier: 'hidden' as LifeTier, angle: Math.random() * 6.28 };
  });

  const flushFlock = (f: Flock): void => {
    if (f.air > 0) return;
    f.air = ctx.settings.reducedMotion ? 1.2 : BIRDS.flushS * (0.85 + Math.random() * 0.3);
    for (const b of f.birds) b.v.set((Math.random() - 0.5) * 3, 3.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3);
    if (f.tier === 'near' || f.tier === 'mid') h.sounds.flush(f.center);
  };

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _s = new THREE.Vector3();
  const _t = new THREE.Vector3();
  const lastFeet = new THREE.Vector3().copy(D.feetGround);
  let chirpAcc = 2;
  const step = (f: Flock, base: number, dt: number): void => {
    const rm = ctx.settings.reducedMotion;
    // you sprint into them: they go up
    const fp = D.feetGround;
    const speed = fp.distanceTo(lastFeet) / Math.max(1e-3, dt);
    if (!f.air && speed > 6 && Math.hypot(fp.x - f.center.x, fp.z - f.center.z) < BIRDS.sprintM + 5) flushFlock(f);
    if (f.air > 0) f.air -= dt;
    f.angle += dt * 0.55;
    // the low tier keeps every second bird (R9 L9 „12 birds“ on low)
    const low = ctx.settings.quality === 'low';
    for (let i = 0; i < f.birds.length; i++) {
      const b = f.birds[i];
      if (low && i % 2) {
        _m.makeScale(0, 0, 0).setPosition(f.center.x, f.center.y, f.center.z);
        mesh.setMatrixAt(base + i, _m);
        continue;
      }
      if (f.air > 0 && !rm) {
        // a loose circle above the field, each bird at its own offset; a gentle pull and some damping
        _t.set(f.center.x + Math.cos(f.angle) * 10 + b.off.x, f.center.y + 14 + b.off.y + Math.sin(f.angle * 2 + i) * 1.5, f.center.z + Math.sin(f.angle) * 10 + b.off.z);
        b.v.addScaledVector(_t.sub(b.p), dt * 1.4);
        b.v.multiplyScalar(Math.exp(-dt * 0.9));
        b.p.addScaledVector(b.v, dt);
        b.flap += dt * 22;
        if (b.v.lengthSq() > 0.05) b.yaw = Math.atan2(-b.v.x, -b.v.z);
      } else {
        // back home and feeding: glide down, then peck and hop
        _t.copy(b.home);
        const d = b.p.distanceTo(_t);
        if (d > 0.05) {
          const s = Math.min(d, (rm ? 1.5 : 6) * dt);
          b.p.addScaledVector(_t.sub(b.p).normalize(), s);
          b.flap += dt * 14;
          b.yaw = Math.atan2(-(b.home.x - b.p.x), -(b.home.z - b.p.z));
        } else {
          b.peck -= dt;
          if (b.peck < 0) {
            b.peck = 0.6 + Math.random() * 2.4;
            b.yaw += (Math.random() - 0.5) * 1.6;
          }
          b.flap = 0;
        }
      }
      const flying = b.flap > 0;
      const wing = flying ? 0.55 + 0.45 * Math.sin(b.flap) : 0.25;
      const bob = !flying && b.peck < 0.18 ? -0.03 : 0;
      _q.setFromEuler(_e.set(!flying && b.peck < 0.18 ? 0.5 : 0, b.yaw, 0));
      _m.compose(_s.set(b.p.x, b.p.y + bob + 0.025, b.p.z), _q, _t.set(1, wing, 1));
      mesh.setMatrixAt(base + i, _m);
    }
  };
  const hideFlock = (f: Flock, base: number): void => {
    // parked (scale 0) at a flock that is shown, so the culling sphere stays around the visible birds
    const shown = flocks.find((x) => x.tier === 'near' || x.tier === 'mid') ?? f;
    _m.makeScale(0, 0, 0).setPosition(shown.center.x, shown.center.y + 10, shown.center.z);
    for (let i = 0; i < f.birds.length; i++) mesh.setMatrixAt(base + i, _m);
    mesh.instanceMatrix.needsUpdate = true;
  };
  let sphereAcc = 0;
  D.afterTick((dt) => {
    sphereAcc -= dt;
    if (sphereAcc > 0 || !mesh.visible) return;
    sphereAcc = 0.5;
    mesh.computeBoundingSphere();
  });
  const bases: number[] = [];
  flocks.reduce((a, f) => (bases.push(a), a + f.birds.length), 0);
  flocks.forEach((f, k) => {
    const tick = (dt: number): void => {
      step(f, bases[k], dt);
      mesh.instanceMatrix.needsUpdate = true;
      // a chirp now and then when you are close
      chirpAcc -= dt;
      if (f.tier === 'near' && chirpAcc <= 0) {
        chirpAcc = 2.5 + Math.random() * 4;
        h.sounds.chirp(f.birds[(Math.random() * f.birds.length) | 0].p);
      }
    };
    D.register({
      id: `birds:${f.id}`,
      area: f.id,
      job: T('Insekten fangen über dem Acker', 'Catch insects over the field'),
      kind: 'animal',
      near: tick,
      mid: tick,
      far: { proxy: 'animal', at: (out) => out.copy(f.center) },
      tier: (t) => {
        f.tier = t;
        flocks.forEach((x, j) => {
          if (x.tier !== 'near' && x.tier !== 'mid') hideFlock(x, bases[j]);
        });
        mesh.visible = flocks.some((x) => x.tier === 'near' || x.tier === 'mid');
        if (mesh.visible) mesh.computeBoundingSphere();
      },
      react: (kind: ReactKind) => {
        if (kind === 'rotor' || kind === 'liftoff' || kind === 'flush') flushFlock(f);
      },
    });
  });
  // the feet speed reference is shared by both flocks: refresh it once per tick
  D.afterTick(() => void lastFeet.copy(D.feetGround));
  return {
    flush(at) {
      for (const f of flocks) if (!at || Math.hypot(at[0] - f.center.x, at[2] - f.center.z) < 60) flushFlock(f);
    },
  };
}
