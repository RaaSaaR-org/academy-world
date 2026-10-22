/**
 * WP12: island.rotors (plan §3.3, §6.5 WP12 „Provides“) — the six main rotors M1–M6 and the four
 * trims T1–T4 as the player sees and hears them. Each rotor follows its state as the island shows it
 * (start/state.ts): a cold rotor stands still in its dark duct, an ignited one spins up to idle with a
 * rising drone and a teal duct ring, a geprüft one keeps the ring at full light; airborne all hover
 * (the rc4 look). WP13 drives the lift-off with setRate / setAir (`reset()` hands them back).
 */
import * as THREE from 'three';
import type { LoopHandle, ZoneContext } from '@/core/zones';
import type { RotorIndex, RotorRates, SystemLamp } from './contract';
import type { Underside } from '../underside';
import { isReady, ROTORS, TRIMS, type StartDisplay } from './state';
import { lampColor } from './lamps';
import { BEATS, ROTOR } from './tuning';

export interface IslandRotors extends RotorRates {
  /** per frame */
  update(dt: number): void;
  /** world position of rotor i (0–5 M1–M6, 6–9 T1–T4) */
  center(i: number): THREE.Vector3;
  /** repaint the duct rings (state or dusk changed) */
  repaint(): void;
  /** the cold cough of the Probestart: a short stutter of rotor i (sound and a twitch of the blades) */
  cough(i: number, at: number): void;
}

export function buildRotors(ctx: ZoneContext, under: Underside, display: StartDisplay, flight: () => 'ground' | 'airborne'): IslandRotors {
  const M = ctx.materials;
  const N = ROTORS.length + TRIMS.length;
  const rate = under.rotorRate;
  const air = under.rotorAir;
  const overRate: (number | null)[] = ROTORS.map(() => null);
  const overAir: (number | null)[] = ROTORS.map(() => null);
  const kick = new Float32Array(N); // the cough: a brief rate kick that decays
  const centers = [...under.podCenters, ...under.trimCenters];
  // start from the shown state (no spin-up on boot)
  const base = (i: number): number => {
    if (flight() === 'airborne') return ROTOR.hover;
    const id = i < 6 ? ROTORS[i] : TRIMS[i - 6];
    return isReady(display.shown(id)) ? ROTOR.idle : 0;
  };
  for (let i = 0; i < N; i++) {
    rate[i] = base(i);
    air[i] = airFor(rate[i]);
  }
  const shown: number[] = Array.from({ length: 6 }, (_, i) => rate[i]);
  // a drone per main rotor (positional, under its lobe), silent while the rotor stands still
  const drones: LoopHandle[] = under.podCenters.map((c) => ctx.audio.loop('drone', { at: [c.x, c.y, c.z], volume: 0 }));
  const lastVol = drones.map(() => -1);

  const c = new THREE.Color();
  const ringLamp = (i: number): SystemLamp => {
    if (flight() === 'airborne') return 'teal';
    const id = i < 6 ? ROTORS[i] : TRIMS[i - 6];
    const s = display.shown(id);
    return s === 'geprueft' ? 'teal-halo' : s === 'bereit' || s === 'an' ? 'teal' : s === 'arbeit' ? 'amber' : 'dark';
  };
  const repaint = (): void => {
    for (let i = 0; i < N; i++) {
      const l = ringLamp(i);
      // the duct ring is a light line: a cold one is off, an amber one glows low (in Arbeit)
      under.setRing(i, l === 'dark' ? c.setRGB(0.02, 0.022, 0.021) : lampColor(M, l, c, l === 'amber' ? 0.5 : 0.7));
    }
  };
  repaint();
  ctx.onDispose(M.onDusk(repaint));
  display.onChange(repaint);

  return {
    setRate(i: RotorIndex, r: number) {
      overRate[i] = THREE.MathUtils.clamp(r, 0, 1);
    },
    setAir(i: RotorIndex, s: number) {
      overAir[i] = THREE.MathUtils.clamp(s, 0, 1);
    },
    get rates() {
      return shown;
    },
    reset() {
      overRate.fill(null);
      overAir.fill(null);
    },
    center: (i) => centers[i],
    repaint,
    cough(i, at) {
      ctx.after(at, () => {
        kick[i] = 0.16;
        const p = centers[i];
        ctx.audio.tone({ freq: 46 + Math.random() * 10, to: 34, dur: 0.14, type: 'sawtooth', volume: 0.55, at: [p.x, p.y, p.z] });
        ctx.audio.tone({ freq: 140, to: 70, dur: 0.08, type: 'square', volume: 0.18, at: [p.x, p.y, p.z] });
      });
    },
    update(dt) {
      const k = 1 - Math.exp(-dt / BEATS.spinUpTau);
      const kd = 1 - Math.exp(-dt * ROTOR.follow);
      for (let i = 0; i < N; i++) {
        const target = (i < 6 ? overRate[i] : null) ?? base(i);
        // spin-up follows the ignition's time constant, spin-down a little faster
        rate[i] += (target - rate[i]) * (target > rate[i] ? k : kd);
        if (kick[i] > 0) kick[i] = Math.max(0, kick[i] - dt * 0.9);
        const r = Math.min(1, rate[i] + kick[i]);
        const a = (i < 6 ? overAir[i] : null) ?? airFor(r);
        air[i] = a;
        if (i < 6) shown[i] = rate[i];
      }
      // the drones: silent at rest, rising in pitch with the rate
      for (let i = 0; i < drones.length; i++) {
        const r = rate[i] + kick[i];
        const vol = ROTOR.droneVolume * THREE.MathUtils.smoothstep(r, 0.02, 0.3);
        if (Math.abs(vol - lastVol[i]) > 0.01) {
          drones[i].setVolume(vol, 0.1);
          lastVol[i] = vol;
        }
        drones[i].setPitch(THREE.MathUtils.lerp(ROTOR.dronePitch0, ROTOR.dronePitch1, Math.min(1, r)));
      }
    },
  };
}

/** downwash from the spin rate: none at rest, a faint column at idle, the full rc4 column in the hover */
function airFor(r: number): number {
  if (r <= 0.02) return 0;
  if (r <= ROTOR.idle) return (r / ROTOR.idle) * ROTOR.airIdle;
  return THREE.MathUtils.lerp(ROTOR.airIdle, ROTOR.airHover, Math.min(1, (r - ROTOR.idle) / (ROTOR.hover - ROTOR.idle)));
}
