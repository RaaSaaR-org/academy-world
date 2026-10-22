import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { type Batch, paint, rbox, sharedBatch } from './batch';
import { buildSolarRows, type SolarRows } from './solar';
import { buildIntakes, type Intakes } from './intakes';
import { buildFinBanks } from './fins';
import { buildPods } from './pods';
import { buildSensorMasts, type SensorMasts } from './sensors';
import { buildRovers, type Rovers } from './rovers';
import { INTAKES, PV_ROWS } from './plan';
import { buildFun } from './fun';
import { buildNumberLine } from './numberline';
import { buildLanes } from './lanes';
import { buildDuskGlow } from './glow';
import { buildDrones } from './drones';
import { bollardSpots } from '../deck';

/**
 * The "Flugmaschine" deck (ART-V2 §4): PV tracker rows, cooling-air intakes, heat-exchanger fin banks,
 * hydroponic pods, rim sensor masts, service hatches and rovers instead of pines, mounds and rocks.
 * Static parts are batched per material; everything that moves updates in ONE loop with instanced
 * matrices and no per-frame allocations, and only while the deck can be seen.
 */
export interface Landscape {
  readonly solar: SolarRows;
  readonly intakes: Intakes;
  readonly sensors: SensorMasts;
  readonly rovers: Rovers;
}

/** W6: async with an optional `step` (ctx.yield): the main thread is handed back between the deck's fields. */
export async function buildLandscape(ctx: ZoneContext, step: () => Promise<void> = () => Promise.resolve()): Promise<Landscape> {
  const batch = sharedBatch(ctx);
  const solar = buildSolarRows(ctx, batch);
  await step();
  const intakes = buildIntakes(ctx, batch);
  buildFinBanks(ctx, batch);
  await step();
  buildPods(ctx, batch);
  const sensors = buildSensorMasts(ctx, batch);
  await step();
  const rovers = buildRovers(ctx);
  buildToys(ctx, batch, solar, intakes);
  buildFun(ctx);
  await step();
  const numberLine = buildNumberLine(ctx);
  const lanes = buildLanes(ctx, batch);
  await step();
  buildDuskGlow(ctx, bollardSpots());
  const drones = buildDrones(ctx, batch);

  ctx.island.onGust(({ strength, bearing }) => sensors.gust(strength, bearing));
  const applyQuality = (): void => solar.setShadows(ctx.settings.quality !== 'low');
  applyQuality();
  ctx.settings.onChange(applyQuality);

  // one update loop for everything that moves on the deck
  let last = ctx.time.elapsed;
  const feet = new THREE.Vector3();
  ctx.every(1 / 60, () => {
    const now = ctx.time.elapsed;
    const dt = Math.min(0.1, Math.max(0, now - last));
    last = now;
    const cam = ctx.camera.position;
    // deck hidden: far away (title orbit, finale below) or deep under the deck
    if (cam.y < -12 || Math.hypot(cam.x, cam.z) > 260) return;
    const animate = ctx.settings.quality !== 'low';
    lanes.update(now);
    solar.update(dt, now, animate);
    intakes.update(dt, animate);
    sensors.update(dt, animate);
    ctx.player.positionLocal(feet);
    rovers.update(dt, feet);
    drones.update(dt);
    numberLine.update(dt, feet);
  });
  return { solar, intakes, sensors, rovers };
}

/**
 * FUN-PLAN W5: touchable features. A service panel on one PV row's drive knocks the row off aim
 * (the control loop re-aims it with overshoot), a test switch at one intake spins its fan up.
 * No new facts: the popup reports the toy's own measured settling time.
 */
function buildToys(ctx: ZoneContext, batch: Batch, solar: SolarRows, intakes: Intakes): void {
  const M = ctx.materials;
  // the PV row nearest the Allee walk (spawn → plaza), on its Allee side
  let best = 0,
    bd = Infinity;
  PV_ROWS.forEach((r, i) => {
    const d = Math.hypot(r.x - 4, (r.z0 + r.z1) / 2 - 56);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  const row = PV_ROWS[best];
  const drive = solar.drive(best);
  const side = row.x > 0 ? -1 : 1;
  const panel = new THREE.Mesh(rbox(0.06, 0.3, 0.22), M.hullTone(0xe7e5e4, 0.45));
  panel.position.set(drive.x + side * 0.21, drive.y - 0.02, drive.z);
  panel.name = 'island:solar-panel-toy';
  ctx.root.add(panel);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16).rotateY(side * Math.PI / 2), M.light(0x2dd4bf, 'T1'));
  lens.position.set(side * 0.032, 0.07, 0);
  panel.add(lens);
  const tableAt: [number, number, number] = [row.x, 2.6, (row.z0 + row.z1) / 2];
  let busy = false;
  ctx.addInteractable({
    object: panel,
    label: { de: 'Solarreihe verstellen', en: 'Knock the solar row off aim' },
    hint: { de: 'Der Regelkreis dreht sie wieder zur Sonne.', en: 'The control loop turns it back to the sun.' },
    range: 2.8,
    isEnabled: () => !busy,
    onInteract: () => {
      busy = true;
      ctx.game.juice.cue('tick', { at: [panel.position.x, panel.position.y, panel.position.z] });
      void solar.kick(best).then((settle) => {
        busy = false;
        if (settle < 0) return;
        const s = settle.toFixed(1);
        ctx.game.juice.popup(tableAt, { de: `Nachgeregelt in ${s.replace('.', ',')} s`, en: `Re-aimed in ${s} s` }, { tone: 'teal' });
        ctx.game.juice.cue('good', { at: tableAt });
      });
    },
  });

  // the intake field nearest a walking path: a test switch on a short ceramic post at its rim
  const fi = 2;
  const f = INTAKES[fi];
  const out = Math.atan2(-f.x, -f.z);
  const px = f.x + Math.sin(out) * (f.r + 0.75),
    pz = f.z + Math.cos(out) * (f.r + 0.75);
  batch.add(M.carbon, new THREE.CylinderGeometry(0.2, 0.22, 0.08, 16).translate(px, 0.04, pz), { name: 'carbon' });
  batch.add(M.hull, new THREE.CylinderGeometry(0.11, 0.14, 0.86, 16).translate(px, 0.51, pz), { name: 'hull' });
  const sw = new THREE.Mesh(paint(rbox(0.24, 0.1, 0.2), 0xe7e5e4), M.standard({ color: 0xe7e5e4, roughness: 0.45, metalness: 0.1 }));
  sw.position.set(px, 0.98, pz);
  sw.rotation.set(-0.35, out + Math.PI, 0, 'YXZ');
  sw.name = 'island:fan-switch';
  ctx.root.add(sw);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 14), M.orangePaint);
  knob.position.set(0, 0.06, 0);
  sw.add(knob);
  ctx.physics.addStaticCylinder({ radius: 0.2, height: 1.05, position: [px, 0.525, pz], surface: 'metal' });
  ctx.addInteractable({
    object: sw,
    label: { de: 'Testlüfter anwerfen', en: 'Spin up the test fan' },
    range: 2.6,
    onInteract: () => {
      intakes.push(fi);
      ctx.audio.play('whoosh', { volume: 0.35, pitch: 0.8, at: [f.x, 0, f.z] });
      ctx.game.juice.burst([f.x, 0.3, f.z], { tone: 'teal', count: 18, spread: f.r * 0.6 });
    },
  });
}
