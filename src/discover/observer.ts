/**
 * The observer (WP-D0, plan §1.4): the player as the areas see it. Each frame its feet go 1.7 m below
 * the camera eye (player.teleport without a ground lookup: previous and current feet match), pushed out
 * of every lobe plot (r 22 + 1 m, |Δy| < 40 m) so no lobe's onEnter fires; the interior plots (the hall,
 * the Traumhangar) may be entered, so their culling and the hall's level-of-detail limiter work. The
 * player's collider is off and nothing steps it (Game skips player.fixedUpdate in phase 'discover').
 */
import * as THREE from 'three';
import type { Game } from '@/core/Game';
import { EYE_HEIGHT } from '@/systems/Player';
import { ZONE_PLOTS } from '@/world/layout';
import type { Observer, Vec3 } from './types';

const _p = new THREE.Vector3();

/** Move a feet position out of every lobe plot (r + 1 m) when within 40 m of its height. */
export function outOfLobes(p: THREE.Vector3): THREE.Vector3 {
  for (const z of ZONE_PLOTS) {
    const [ax, ay, az] = z.anchor;
    let dx = p.x - ax,
      dz = p.z - az;
    let d = Math.hypot(dx, dz);
    const R = z.radius + 1;
    if (d >= R || Math.abs(p.y - ay) >= 40) continue;
    if (d < 1e-3) {
      // dead centre: out along the spoke, away from the hub
      dx = ax;
      dz = az;
      d = Math.hypot(dx, dz) || 1;
    }
    p.x = ax + (dx / d) * R;
    p.z = az + (dz / d) * R;
  }
  return p;
}

export class ObserverImpl implements Observer {
  mode: 'follow' | 'pin' | 'off' = 'follow';
  private suspended = false;
  private readonly pinned = new THREE.Vector3();
  private readonly last = new THREE.Vector3(NaN, NaN, NaN);

  constructor(private game: Game) {}

  get feet(): Vec3 {
    const f = this.game.player.feet;
    return [f.x, f.y, f.z];
  }

  follow(): void {
    this.mode = 'follow';
  }

  pin(feet: Vec3): void {
    this.mode = 'pin';
    this.pinned.set(feet[0], feet[1], feet[2]);
    this.place(this.pinned);
  }

  release(): void {
    this.mode = 'off';
  }

  /** the camera is detached (the film): stop without forgetting the mode */
  suspend(): void {
    this.suspended = true;
  }

  resume(): void {
    this.suspended = false;
  }

  /** after the camera moved (camera.ts) */
  update(eye: THREE.Vector3): void {
    if (this.suspended || this.mode === 'off') return;
    if (this.mode === 'pin') return this.place(this.pinned);
    this.place(outOfLobes(_p.set(eye.x, eye.y - EYE_HEIGHT, eye.z)));
  }

  private place(p: THREE.Vector3): void {
    if (p.distanceToSquared(this.last) < 1e-6) return;
    this.last.copy(p);
    this.game.player.teleport(p);
  }
}
