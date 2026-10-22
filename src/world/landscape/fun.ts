import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { DEG, PADS, hopNumbers, outlineRadius, polar } from '../layout';
import { padLanding } from '../transit';
import { POSITION_LIGHTS, TURMSPRUNG } from './plan';
import { flatRing, sharedBatch } from './batch';

/**
 * FUN-PLAN §7 world items:
 *  - W1 six world Sensorkapseln (core builds the capsules and the pickup),
 *  - W2 twelve position lights on the rim, one per capsule: a dark lens until it is found, then a
 *    steady teal T1 light (fades up once, never blinks); at dusk they read as a ring of lights,
 *  - W4 the Turmsprung: with 12/12 capsules a pad rises out of the plaza (bearing 315) and
 *    launches you onto the Ausguck (y 44) in a 4 s ballistic arc that clears the tower by ≥ 2 m.
 */
export function buildFun(ctx: ZoneContext): void {
  placeCapsules(ctx);
  positionLights(ctx);
  turmsprung(ctx);
}

// ── W1 ───────────────────────────────────────────────────────────────────────

function placeCapsules(ctx: ZoneContext): void {
  // apex of the hop from the Dunkelfabrik hub pad (bearing 150) to its landing point (FUN-PLAN W1)
  const hub = polar(150, PADS.hubRadius);
  const land = padLanding(150, 'hub');
  const apex = hopNumbers(Math.hypot(land[0] - hub[0], land[2] - hub[2])).apex;
  const mid: [number, number, number] = [(hub[0] + land[0]) / 2, apex + 0.9, (hub[2] + land[2]) / 2];
  const kanzel = polar(240, 89.6, 0.95);
  const ausguck = polar(340, 12.2, 44.95);
  const list: { id: string; position: [number, number, number]; radius?: number }[] = [
    // the tutorial capsule: on the walking line from the spawn to the Allee, 4 m ahead, a little off-axis
    { id: 'world.landedeck', position: [0.9, 1.05, 90.4] },
    { id: 'world.sprungbogen', position: mid, radius: 1.6 },
    { id: 'world.ausguck', position: ausguck },
    { id: 'world.kanzel', position: kanzel },
    { id: 'world.glasbalkon', position: [0, 0.95, -97.5] },
    { id: 'world.kiel', position: [0, -35.05, 11] },
  ];
  for (const c of list) ctx.game.collectibles.place({ id: c.id, position: c.position, radius: c.radius });
}

// ── W2 ───────────────────────────────────────────────────────────────────────

function positionLights(ctx: ZoneContext): void {
  const M = ctx.materials;
  const batch = sharedBatch(ctx);
  const n = POSITION_LIGHTS.length;
  const pos: THREE.Vector3[] = POSITION_LIGHTS.map((l) => {
    const r = outlineRadius(l.bearing, true) - 0.22;
    const [x, , z] = polar(l.bearing, r);
    return new THREE.Vector3(x, 1.3, z);
  });
  // a marine-style position lantern on the rail line: alu post on a carbon foot, ceramic base, a
  // cylindrical lens (instanced: smoked teal glass until found, then steady teal T1) and an alu cap.
  // (rc2 had a dark hemisphere on a stick: from the spawn it read as a black lollipop.)
  for (const p of pos) {
    batch.add(M.carbon, new THREE.CylinderGeometry(0.09, 0.11, 0.06, 12).translate(p.x, 0.03, p.z), { name: 'carbon' });
    batch.add(M.brushedAlu, new THREE.CylinderGeometry(0.032, 0.042, 1.16, 10).translate(p.x, 0.06 + 0.58, p.z), { name: 'alu' });
    batch.add(M.hull, new THREE.CylinderGeometry(0.075, 0.06, 0.1, 16).translate(p.x, 1.25, p.z), { name: 'hull' });
    batch.add(M.brushedAlu, new THREE.CylinderGeometry(0.082, 0.082, 0.018, 16).translate(p.x, 1.309, p.z), { name: 'alu' });
    batch.add(M.brushedAlu, new THREE.CylinderGeometry(0.03, 0.082, 0.035, 16).translate(p.x, 1.44, p.z), { name: 'alu' });
    ctx.physics.addStaticCylinder({ radius: 0.1, height: 1.46, position: [p.x, 0.73, p.z], surface: 'metal' });
  }
  const lens = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.105, 18), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
  lens.name = 'island:position-lights';
  ctx.onDispose(() => (lens.material as THREE.Material).dispose());
  const m4 = new THREE.Matrix4();
  pos.forEach((p, i) => lens.setMatrixAt(i, m4.makeTranslation(p.x, 1.37, p.z)));
  lens.computeBoundingSphere();
  ctx.root.add(lens);
  ctx.freezeStatic(lens);
  const OFF = new THREE.Color(0x2c4541),
    TEAL = new THREE.Color(0x2dd4bf);
  const on = new THREE.Color();
  const level = new Float32Array(n); // 0 = dark lens, 1 = lit
  const target = new Float32Array(n);
  const c = new THREE.Color();
  const paint = (): void => {
    on.copy(TEAL).multiplyScalar(M.tierScale(TEAL, 'T1'));
    for (let i = 0; i < n; i++) lens.setColorAt(i, c.copy(OFF).lerp(on, level[i]));
    if (lens.instanceColor) lens.instanceColor.needsUpdate = true;
  };
  const indexFor = (id: string, world?: number[]): number => {
    const k = POSITION_LIGHTS.findIndex((l) => l.id === id);
    if (k >= 0) return k;
    // an id we do not know (a zone named its capsule differently): the nearest dark light by bearing
    if (!world) return -1;
    const b = (Math.atan2(world[0], -world[2]) / DEG + 360) % 360;
    let best = -1,
      bd = Infinity;
    POSITION_LIGHTS.forEach((l, i) => {
      if (target[i] > 0) return;
      const d = Math.abs(((l.bearing - b + 540) % 360) - 180);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  for (const id of ctx.game.collectibles.found()) {
    const i = indexFor(id);
    if (i >= 0) level[i] = target[i] = 1;
  }
  paint();
  ctx.events.on('collectible:found', (e: { id?: string; world?: number[] } | undefined) => {
    if (!e?.id) return;
    const i = indexFor(e.id, e.world);
    if (i >= 0) target[i] = 1;
  });
  ctx.onDispose(M.onDusk(paint));
  // after a reset (progress cleared) the lights go dark again
  ctx.events.on('progress:reset', () => {
    level.fill(0);
    target.fill(0);
    paint();
  });
  ctx.every(1 / 30, () => {
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (level[i] === target[i]) continue;
      level[i] = Math.min(target[i], level[i] + 1 / 24); // ≈ 0.8 s fade-up, once
      changed = true;
    }
    if (changed) paint();
  });
}

// ── W4 ───────────────────────────────────────────────────────────────────────

const JUMP_T = 4;
const AUSGUCK_LAND = 10.6;

function turmsprung(ctx: ZoneContext): void {
  const M = ctx.materials;
  const batch = sharedBatch(ctx);
  const [px, , pz] = polar(TURMSPRUNG.bearing, TURMSPRUNG.r);
  const R = 1.5;
  // flush iris hatch in the plaza (always there): carbon ring, alu seam
  batch.add(M.carbon, flatRing(px, pz, R + 0.02, R + 0.16, 0.026, 64), { name: 'carbon' });
  batch.add(M.brushedAlu, flatRing(px, pz, R + 0.16, R + 0.22, 0.027, 64), { name: 'alu' });
  // the pad that rises (hidden until 12/12)
  const pad = new THREE.Group();
  pad.position.set(px, -0.4, pz);
  pad.visible = false;
  ctx.root.add(pad);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.04, 0.42, 48), M.hull);
  disc.position.y = 0.2;
  disc.castShadow = true;
  pad.add(disc);
  const top = new THREE.Mesh(new THREE.CircleGeometry(R - 0.12, 48).rotateX(-Math.PI / 2), M.carbon);
  top.position.y = 0.415;
  pad.add(top);
  const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.42, R - 0.28, 64).rotateX(-Math.PI / 2), M.light(0x2dd4bf, 'T1'));
  ring.position.y = 0.42;
  pad.add(ring);
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.04, 24), M.brushedAlu);
  boss.position.y = 0.43;
  pad.add(boss);
  const dest = new THREE.Vector3(...polar(TURMSPRUNG.bearing, AUSGUCK_LAND, 44));
  const label = { de: '[E] Turmsprung → Ausguck · 44 m hoch · 4 s Flug', en: '[E] Tower leap → lookout · 44 m up · 4 s flight' };
  let open = false,
    rising = -1,
    inside = false,
    flying = false,
    clearHint: (() => void) | null = null;
  let collider: { remove(): void } | null = null;

  const reveal = (animate: boolean): void => {
    if (open) return;
    open = true;
    pad.visible = true;
    if (animate && !ctx.settings.reducedMotion) rising = 0;
    else pad.position.y = 0;
    collider = ctx.physics.addStaticCylinder({ radius: R, height: 0.44, position: [px, 0.2, pz], surface: 'metal' });
    if (animate) {
      ctx.game.juice.burst([px, 0.6, pz], { tone: 'teal', count: 40, spread: 2 });
      ctx.game.juice.cue('great', { at: [px, 0.5, pz] });
      ctx.game.juice.popup([px, 2.2, pz], { de: 'Turmsprung frei', en: 'Tower leap unlocked' }, { tone: 'teal', seconds: 3 });
      const mk = ctx.hud.addMarker([px, 0.5, pz], { de: 'Turmsprung', en: 'Tower leap' }, { kind: 'poi' });
      ctx.after(25, () => mk.remove());
    }
  };
  const close = (): void => {
    open = false;
    pad.visible = false;
    pad.position.y = -0.4;
    collider?.remove();
    collider = null;
  };
  const sum = ctx.game.progress();
  if (sum.capsulesTotal >= 12 && sum.capsules >= sum.capsulesTotal) reveal(false);
  ctx.events.on('collectible:found', (e: { n?: number; total?: number } | undefined) => {
    if (e && typeof e.n === 'number' && e.n >= 12 && (e.total ?? 12) <= e.n) reveal(true);
  });
  ctx.events.on('progress:reset', close);
  ctx.debug.register('turmsprung', () => reveal(true));

  ctx.physics.addTrigger({
    shape: 'cylinder',
    radius: R - 0.1,
    height: 2.6,
    position: [px, 1.4, pz],
    onEnter: () => {
      inside = true;
      if (!open || flying) return;
      clearHint?.();
      clearHint = ctx.ui.hint(label, 0);
    },
    onExit: () => {
      inside = false;
      clearHint?.();
      clearHint = null;
    },
  });
  ctx.input.onKey(
    'KeyE',
    () => {
      if (!open || !inside || flying || rising >= 0 || ctx.player.operating || ctx.hud.modalOpen) return;
      flying = true;
      clearHint?.();
      clearHint = null;
      ctx.game.juice.cue('go', { at: [px, 0.5, pz] });
      const unlock = ctx.player.lockControls();
      const done = (): void => {
        ctx.after(0.25, () => {
          unlock();
          flying = false;
        });
      };
      if (ctx.settings.reducedMotion) {
        ctx.player.teleport([dest.x, dest.y, dest.z], { fade: true, yawDeg: -TURMSPRUNG.bearing });
        ctx.after(0.5, done);
        return;
      }
      const from = ctx.player.position;
      const dx = dest.x - from.x,
        dz = dest.z - from.z;
      const d = Math.hypot(dx, dz);
      const n = hopNumbers(d, dest.y - from.y, JUMP_T);
      ctx.audio.play('whoosh', { volume: 1, pitch: 0.8 });
      void ctx.player.launch([(dx / d) * n.vh, n.vy, (dz / d) * n.vh]).then(() => {
        ctx.player.shake(0.08, 0.15);
        ctx.game.juice.burst([dest.x, dest.y + 0.3, dest.z], { tone: 'teal', count: 24, spread: 1.2 });
        done();
      });
      ctx.after(JUMP_T + 2, () => {
        if (flying) done();
      });
    },
    { anywhere: true },
  );
  ctx.every(1 / 60, () => {
    if (rising < 0) return;
    rising += 1 / 60;
    const k = Math.min(1, rising / 1.6);
    pad.position.y = -0.4 + 0.4 * (1 - Math.pow(1 - k, 3));
    if (k >= 1) rising = -1;
  });
}
