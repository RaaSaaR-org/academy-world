import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { LIBELLE } from './layout';
import { merge } from './util';
import { paint, sharedBatch } from './landscape/batch';
import { markStatic } from './statics';
import { cullTinyText } from './detail';

/**
 * Libelle (§6.1): a 7 m plinth carrying a glass dish (radius of curvature 4 m, rim r 3)
 * with a polished steel ball (r 0.5). The ball is a rolling pendulum driven by the
 * island's tilt (amplified ×10 for readability) and kicked by gusts — the visible
 * proof that the island moves and is corrected. Readout: LAGE · TAKT · SCHUB (FIKTION).
 * Phase 7 (WP12, plan §4.1): it reads „BODEN“ while docked until M2 is bereit (the arms hold the
 * island), then the live LAGE; the system panel of the Probestart stands on the plinth (`panelMount`,
 * start/panel.ts), facing the lever.
 */
export interface Libelle {
  update(dt: number, tiltDeg: { roll: number; pitch: number }): void;
  gust(strength: number, bearing: number): void;
  /** 'boden': docked, M2 not bereit yet · 'lage': the live attitude (rc4) */
  setMode(m: 'boden' | 'lage'): void;
  readonly mode: 'boden' | 'lage';
  readonly object: THREE.Object3D;
  /** where the system panel stands: on the plinth top, facing the Probestart lever, leaning back */
  readonly panelMount: THREE.Object3D;
}

/** the system panel's place on the plinth (start/panel.ts): bearing from the centre toward the lever's stand point */
export const PANEL_MOUNT = { r: 3.13, y: 1.31, yawDeg: -34.8, tilt: -0.6, width: 2.8 };

export function buildLibelle(ctx: ZoneContext): Libelle {
  const M = ctx.materials;
  const [cx, , cz] = LIBELLE.center;
  const group = new THREE.Group();
  group.name = 'hub:libelle';
  group.position.set(cx, 0, cz);
  ctx.root.add(group);

  const H = LIBELLE.plinthHeight;
  const Rc = LIBELLE.dishCurvature;
  const capA = Math.asin(LIBELLE.dishRim / Rc);
  const centerY = H + Rc; // centre of curvature
  const rimY = centerY - Rc * Math.cos(capA);

  // plinth (ART-V2): ceramic drum on a carbon reveal, alu bezel, a teal level line
  const batch = sharedBatch(ctx);
  const PR = LIBELLE.plinthRadius;
  const at = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.translate(cx, 0, cz);
  batch.add(M.carbon, at(new THREE.CylinderGeometry(PR - 0.25, PR - 0.25, 0.14, 64).translate(0, 0.07, 0)), { name: 'carbon' });
  batch.add(M.hull, at(new THREE.CylinderGeometry(PR - 0.08, PR, H - 0.34, 64, 1, true).translate(0, 0.14 + (H - 0.34) / 2, 0)), { name: 'hull', cast: true });
  // open-ended: a closed top cap lay exactly in the plane of the ceramic top ring below (y = H) and
  // z-fought with it in radial bands and blocks behind the glass dish (rc4 verify; plan UXA-15)
  batch.add(M.brushedAlu, at(new THREE.CylinderGeometry(PR - 0.45, PR - 0.08, 0.2, 64, 1, true).translate(0, H - 0.1, 0)), { name: 'alu' });
  batch.add(M.carbon, at(new THREE.CylinderGeometry(PR - 0.06, PR - 0.06, 0.06, 64, 1, true).translate(0, H - 0.23, 0)), { name: 'carbon' });
  batch.add(M.light(0x2dd4bf), at(new THREE.CylinderGeometry(PR - 0.055, PR - 0.055, 0.02, 64, 1, true).translate(0, H - 0.23, 0)), { name: 'teal-lines' });
  batch.add(M.hull, at(new THREE.RingGeometry(0.1, PR - 0.45, 64).rotateX(-Math.PI / 2).translate(0, H, 0)), { name: 'hull' });
  void paint;
  const cradle: THREE.BufferGeometry[] = [new THREE.TorusGeometry(LIBELLE.dishRim + 0.02, 0.06, 8, 96).rotateX(Math.PI / 2).translate(0, rimY, 0)];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
    const top = new THREE.Vector3(Math.sin(a) * LIBELLE.dishRim, rimY, Math.cos(a) * LIBELLE.dishRim);
    const bot = new THREE.Vector3(Math.sin(a) * 2.6, H, Math.cos(a) * 2.6);
    const len = top.distanceTo(bot);
    const g = new THREE.CylinderGeometry(0.05, 0.07, len, 8);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize()));
    g.translate((top.x + bot.x) / 2, (top.y + bot.y) / 2, (top.z + bot.z) / 2);
    cradle.push(g);
  }
  cradle.push(new THREE.CylinderGeometry(0.35, 0.5, 0.12, 24).translate(0, H + 0.06, 0));
  batch.add(M.brushedAlu, at(merge(cradle)), { name: 'alu' });

  // glass dish (bottom cap of a sphere r 4)
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(Rc, 64, 16, 0, Math.PI * 2, Math.PI - capA, capA).translate(0, centerY, 0),
    M.standard({ color: 0xe7e5e4, roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.8 }),
  );
  dish.renderOrder = 2;
  group.add(dish);
  ctx.freezeStatic(dish);

  // the ball
  const ball = new THREE.Mesh(new THREE.SphereGeometry(LIBELLE.ball, 40, 24), M.standard({ color: 0xf5f5f4, roughness: 0.06, metalness: 1, envMapIntensity: 1.3 }));
  ball.castShadow = true;
  group.add(ball);

  ctx.physics.addStaticCylinder({ radius: LIBELLE.plinthRadius + 0.05, height: 2.6, position: [cx, 1.3, cz], surface: 'metal' });

  // readout on the bezel (south and north faces)
  // QA-23: the readout rests at exactly 0,04° (what EMI-01 says) and only rises with the island's tilt
  let lage = 0.04;
  let mode: 'boden' | 'lage' = 'lage';
  const readout = (lang: string): string =>
    mode === 'boden'
      ? lang === 'de'
        ? `BODEN · HALTEARME · LAGE ${Math.max(0, lage - 0.04).toFixed(2).replace('.', ',')}°`
        : `GROUND · HOLDING ARMS · ATTITUDE ${Math.max(0, lage - 0.04).toFixed(2)}°`
      : lang === 'de'
        ? `LAGE ${lage.toFixed(2).replace('.', ',')}° · TAKT 1000 Hz · SCHUB M1–M6`
        : `ATTITUDE ${lage.toFixed(2)}° · RATE 1000 Hz · THRUST M1–M6`;
  const texts: { mesh: ReturnType<ZoneContext['text3d']['create']> }[] = [];
  const plateGeo = new THREE.BoxGeometry(3.45, 0.78, 0.06);
  for (const side of [0, Math.PI]) {
    const holder = new THREE.Group();
    holder.rotation.y = side;
    group.add(holder);
    const plate = new THREE.Group();
    plate.position.set(0, 0.62, LIBELLE.plinthRadius + 0.08);
    plate.rotation.x = -0.18;
    holder.add(plate);
    plate.add(markStatic(new THREE.Mesh(plateGeo, M.darkGlass)));
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.52, 0.85, 0.03), M.brushedAlu);
    frame.position.z = -0.03;
    plate.add(markStatic(frame));
    const t = ctx.text3d.create({ text: (lang) => readout(lang), font: 'mono-medium', size: 0.105, color: 0xe7e5e4, anchorX: 'center', anchorY: 'middle', letterSpacing: 0.06, maxWidth: 3.25, textAlign: 'center', position: [0, 0.12, 0.035] }, plate);
    cullTinyText(ctx, t);
    cullTinyText(ctx, ctx.text3d.create({ text: { de: 'FIKTION · Der Regelkreis dahinter ist echt.', en: 'FICTION · The control loop behind it is real.' }, font: 'mono', size: 0.072, color: 0x8a817a, anchorX: 'center', anchorY: 'middle', letterSpacing: 0.08, uppercase: true, maxWidth: 3.25, position: [0, -0.2, 0.035] }, plate));
    texts.push({ mesh: t });
    ctx.freezeStatic(holder);
  }

  // rolling pendulum state (angles in rad, x = east, z = south)
  const omega2 = ((5 / 7) * 9.81) / (Rc - LIBELLE.ball);
  const ang = new THREE.Vector2(0, 0),
    vel = new THREE.Vector2(0, 0);
  const place = (): void => {
    const L = Rc - LIBELLE.ball;
    const x = L * Math.sin(ang.x),
      z = L * Math.sin(ang.y);
    const y = centerY - Math.sqrt(Math.max(0.01, L * L - x * x - z * z));
    ball.position.set(x, y, z);
  };
  place();
  let readoutTimer = 0;

  // the system panel's mount (start/panel.ts builds into it)
  const mount = new THREE.Group();
  mount.name = 'hub:libelle-panel';
  {
    const a = (PANEL_MOUNT.yawDeg * Math.PI) / 180;
    mount.position.set(Math.sin(a) * PANEL_MOUNT.r, PANEL_MOUNT.y, Math.cos(a) * PANEL_MOUNT.r);
    mount.rotation.set(PANEL_MOUNT.tilt, a, 0, 'YXZ');
  }
  group.add(mount);
  group.updateMatrixWorld(true);

  const resync = (): void => {
    for (const t of texts) {
      t.mesh.text = readout(ctx.lang);
      t.mesh.sync();
    }
  };
  return {
    object: group,
    panelMount: mount,
    get mode() {
      return mode;
    },
    setMode(m) {
      if (m === mode) return;
      mode = m;
      resync();
    },
    gust(strength, bearing) {
      const b = (bearing * Math.PI) / 180;
      vel.x += Math.sin(b) * strength * 0.42;
      vel.y += -Math.cos(b) * strength * 0.42;
    },
    update(dt, tilt) {
      // the island rolls about z (roll) and x (pitch); the ball feels the tilted gravity ×10
      const eqx = (tilt.roll * Math.PI) / 180 * 10,
        eqz = (-tilt.pitch * Math.PI) / 180 * 10;
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        vel.x += (-omega2 * Math.sin(ang.x - eqx) - 0.32 * vel.x) * h;
        vel.y += (-omega2 * Math.sin(ang.y - eqz) - 0.32 * vel.y) * h;
        ang.x = THREE.MathUtils.clamp(ang.x + vel.x * h, -0.6, 0.6);
        ang.y = THREE.MathUtils.clamp(ang.y + vel.y * h, -0.6, 0.6);
      }
      place();
      readoutTimer -= dt;
      if (readoutTimer <= 0) {
        readoutTimer = 0.25;
        const tiltMag = Math.hypot(tilt.roll, tilt.pitch);
        const next = 0.04 + tiltMag;
        if (Math.abs(next - lage) > 0.004) {
          lage = next;
          resync();
        }
      }
    },
  };
}
