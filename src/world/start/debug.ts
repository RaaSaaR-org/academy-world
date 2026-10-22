/**
 * WP12: tool hooks of the start flow (plan §5.10 feature check `tools/beats-check.mjs`), through
 * `__academy.ext(name)`:
 *   'start'          → the state as the island shows it: panel, crown, needle, bar, flags, beats log
 *   'start:press'    → pull the Probestart lever (false while busy or cooling down)
 *   'start:award'    → award a stamp by its full id ('sensordom.messstrecke'), as a station would
 *   'start:gust'     → a random gust (docked: the arms must catch it, no tilt)
 *   'sequence:spray' → flash-check: the six plumes, the 6/6 pulses and the Startklar pulses (a replay;
 *                      marks no beat), chained after the ground's own spray sequence if it has one
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { registerDebugExt } from '@/core/DebugApi';
import { ISLAND, ZONE_PLOTS, outlineRadius, polar } from '../layout';
import type { Libelle } from '../libelle';
import type { StartDisplay } from './state';
import type { IslandRotors } from './rotors';
import type { Beats } from './beats';
import type { Probestart } from './probestart';
import type { SystemPanel } from './panel';
import type { SystemLamp } from './contract';
import type { GroundHandle } from '../ground';

/** classify a linear colour back to a lamp (the tools compare what is on screen, not what was asked) */
function classify(c: THREE.Color): SystemLamp {
  const max = Math.max(c.r, c.g, c.b);
  if (max < 0.2) return 'dark';
  const hsl = { h: 0, s: 0, l: 0 };
  c.clone().multiplyScalar(1 / max).getHSL(hsl);
  if (hsl.s < 0.2) return 'dark';
  const h = hsl.h * 360;
  if (h < 20 || h > 340) return 'red';
  if (h < 60) return 'amber';
  if (h > 150 && h < 200) return max > 2.6 ? 'teal-halo' : 'teal';
  return 'dark';
}

export function registerStartDebug(
  ctx: ZoneContext,
  d: { display: StartDisplay; rotors: IslandRotors; beats: Beats; probestart: () => Probestart | null; panel: SystemPanel; libelle: Libelle; ground: () => GroundHandle | null; padsArmed: () => boolean },
): void {
  const c = new THREE.Color();
  const instanceLamps = (mesh: THREE.InstancedMesh | null, n: number, from = 0): SystemLamp[] => {
    const out: SystemLamp[] = [];
    for (let i = from; i < from + n; i++) {
      if (!mesh?.instanceColor) out.push('dark');
      else out.push(classify(c.fromBufferAttribute(mesh.instanceColor, i)));
    }
    return out;
  };
  const offs = [
    registerDebugExt('start', () => {
      const s = d.display.snap;
      const beacons = ctx.root.getObjectByName('tower:beacons') as THREE.InstancedMesh | undefined;
      const needle = (ctx.root.getObjectByName('tower:needle-light') as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial | undefined;
      // lit bar segments on screen: amber or teal ones (the empty bar is dim red, an unlit segment dark)
      const lit = instanceLamps(d.panel.lamps, 10, 6).filter((l) => l !== 'dark' && l !== 'red').length;
      return {
        mode: ctx.mode,
        flight: s.flight.state,
        probestart: s.probestart,
        glideSeen: s.glideSeen,
        quest: { lift: s.start.lift, charge: s.start.energy.charge, akku: s.start.energy, nav: s.start.nav, startklar: s.start.startklar, armed: s.armed, regionOpen: s.regionOpen, kielOpen: s.kielOpen, f3Signed: s.f3Signed, groundCrew: s.groundCrew, systems: s.systems },
        shown: { panel: d.display.panel(), lift: d.display.liftShown(), charge: d.display.chargeShown(), crew: { akku: d.display.crewShown('AKKU'), nav: d.display.crewShown('NAV') } },
        screen: {
          panelLamps: instanceLamps(d.panel.lamps, 6),
          barSegmentsLit: lit,
          navLamp: instanceLamps(d.panel.lamps, 1, 16)[0],
          crown: instanceLamps(beacons ?? null, ZONE_PLOTS.length),
          needle: needle ? classify(c.copy(needle.emissive).multiplyScalar(2.2)) : 'dark',
          crewPlates: (ctx.root.getObjectByName('start:libelle-panel:crew-plates') as THREE.Object3D | undefined)?.visible ?? false,
        },
        libelle: d.libelle.mode,
        padsArmed: d.padsArmed(),
        rotors: { rates: [...d.rotors.rates].map((r) => Math.round(r * 100) / 100) },
        tilt: { roll: ctx.island.tiltDeg.roll, pitch: ctx.island.tiltDeg.pitch },
        altitude: ctx.flight.altitude,
        reducedMotion: ctx.settings.reducedMotion,
        probestartBusy: d.probestart()?.busy ?? false,
        probestartCount: d.probestart()?.count ?? 0,
        readout: d.probestart()?.readout() ?? null,
        beats: [...d.beats.log],
        beatsIdle: d.beats.idle,
      };
    }),
    registerDebugExt('start:press', () => d.probestart()?.press() ?? false),
    registerDebugExt('start:award', ((id: string) => ctx.pass.award(id)) as never),
    registerDebugExt('start:gust', ((strength = 1) => ctx.island.emitGust({ strength, bearing: Math.round(Math.random() * 360) })) as never),
  ];
  // flash-check: the spray beats with the 6/6 and Startklar pulses (flash-safe ramps, §3.3)
  const prior = (globalThis as { __academy?: { ext?(n: string): unknown } }).__academy?.ext?.('sequence:spray') as ((...a: unknown[]) => unknown) | undefined;
  // the worst case for the eyes: the Libelle panel in the Startklar state from the lever (it fills a
  // 341 × 256 window), then the crown from the plaza; the 6/6 pulses, then the Startklar pulses
  const look = (pos: [number, number, number], yaw: number, pitch: number): void => {
    ctx.player.teleport(pos, { yawDeg: yaw, pitchDeg: pitch });
  };
  offs.push(
    registerDebugExt('sequence:spray', (async (o: unknown) => {
      // the ground's own spray sequence first (WP3: the six plumes framed from the bridge head)
      if (typeof prior === 'function') await prior(o);
      const back = ctx.player.position.clone();
      const backYaw = (ctx.player.yaw * 180) / Math.PI;
      const all: SystemLamp[] = ['teal', 'teal', 'teal', 'teal', 'teal', 'teal'];
      d.display.override({ lamps: [...all] as never, bar: { lamp: 'teal', segments: 10 }, nav: 'teal' });
      for (const [pos, yaw, pitch] of [
        [[-3.6, 0, 24.2], -34.8, -12],
        [[0, 0, 30], 0, 32],
      ] as [[number, number, number], number, number][]) {
        look(pos, yaw, pitch);
        await new Promise((r) => setTimeout(r, 400));
        for (let k = 0; k < 6; k++) {
          const b = ZONE_PLOTS[k].bearing;
          d.ground()?.spray.emit('plume', polar(b, outlineRadius(b, true) + 2, -3), 1);
        }
        for (const b of ISLAND.kanzeln.bearings) d.ground()?.spray.emit('plume', polar(b, ISLAND.kanzeln.ring + ISLAND.kanzeln.radius + 4, -3), 0.8);
        await d.display.pulse(['lamps', 'crown']);
        await d.display.pulse(['lamps', 'bar', 'nav', 'crown', 'needle']);
      }
      d.display.override(null);
      ctx.player.teleport([back.x, back.y, back.z], { yawDeg: backYaw });
      return { seconds: 2 * 2 * 3.75 };
    }) as never),
  );
  ctx.onDispose(() => offs.forEach((f) => f()));
}
