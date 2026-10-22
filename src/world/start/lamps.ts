/**
 * WP12: one colour rule for every system lamp of the island (plan §3.3 „States“, §4 colour
 * conventions): dark → red #F87171 after the Probestart → amber #FBBF24 (in Arbeit) → teal #2DD4BF
 * (bereit) → teal with a steady halo (geprüft, lifted into the bloom). The Bodencrew's teal is a
 * little dimmer and never gets the halo. Colours sit on the brand's light tiers (T1 by day, the
 * dusk lifts them like every light line), so the lamps read the same as the rest of the island.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import type { SystemLamp } from './contract';
import { LAMP } from './tuning';

const C = {
  red: new THREE.Color(LAMP.red),
  amber: new THREE.Color(LAMP.amber),
  teal: new THREE.Color(LAMP.teal),
  dark: new THREE.Color(LAMP.dark),
};

/** The linear colour of a lamp (for MeshBasic instance colours); `k` multiplies (pulses). */
export function lampColor(M: ZoneContext['materials'], lamp: SystemLamp, out: THREE.Color, k = 1): THREE.Color {
  switch (lamp) {
    case 'dark':
      return out.copy(C.dark).multiplyScalar(LAMP.gain.dark * k);
    case 'red':
      return out.copy(C.red).multiplyScalar(M.tierScale(C.red, 'beacon') * LAMP.gain.red * k);
    case 'amber':
      return out.copy(C.amber).multiplyScalar(M.tierScale(C.amber, 'beacon') * LAMP.gain.amber * k);
    case 'teal':
      return out.copy(C.teal).multiplyScalar(M.tierScale(C.teal, 'beacon') * LAMP.gain.teal * k);
    case 'crew':
      return out.copy(C.teal).multiplyScalar(M.tierScale(C.teal, 'beacon') * LAMP.gain.crew * k);
    case 'teal-halo':
      return out.copy(C.teal).multiplyScalar(M.tierScale(C.teal, 'beacon') * LAMP.gain.halo * k);
  }
}

/** The hue of a lamp (for emissive materials that keep their own intensity, e.g. the needle light). */
export function lampHue(lamp: SystemLamp, out: THREE.Color): THREE.Color {
  if (lamp === 'red') return out.copy(C.red);
  if (lamp === 'amber') return out.copy(C.amber);
  if (lamp === 'dark') return out.copy(C.dark);
  return out.copy(C.teal);
}

/** Relative brightness of a lamp state (dark ≈ off). */
export function lampGain(lamp: SystemLamp): number {
  return lamp === 'dark' ? LAMP.gain.dark : lamp === 'teal-halo' ? LAMP.gain.halo : lamp === 'crew' ? LAMP.gain.crew : lamp === 'red' ? LAMP.gain.red : lamp === 'amber' ? LAMP.gain.amber : LAMP.gain.teal;
}
