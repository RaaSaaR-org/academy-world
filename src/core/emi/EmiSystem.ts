import * as THREE from 'three';
import type { Game } from '../Game';
import { EmiUnit, emiUnitIndex } from './Emi';

const _p = new THREE.Vector3();

/** Owns all EMI units: per-frame behaviour, H-key help routing, cleanup per owner. */
export class EmiSystem {
  readonly units = new Set<EmiUnit>();

  constructor(private game: Game) {}

  spawn(owner: string, unit: string, parent: THREE.Object3D): EmiUnit {
    const g = this.game;
    const u = new EmiUnit(unit, emiUnitIndex(unit), owner, {
      say: (speaker, lines, durationS, manual, interrupt) =>
        g.zones.isAway(owner)
          ? Promise.resolve()
          : g.hud.dialogue.say(
              lines.map((text) => ({ speaker, text, hold: durationS })),
              { manual, owner, interrupt },
            ),
      chirp: (idx, at) => g.audio.chirp(idx, at),
      playerEye: (out) => out.copy(g.camera.position),
      reducedMotion: () => g.settings.data.reducedMotion,
    });
    parent.add(u.object);
    this.units.add(u);
    return u;
  }

  removeOwner(owner: string): void {
    for (const u of [...this.units]) {
      if (u.owner !== owner) continue;
      u.dispose();
      this.units.delete(u);
    }
  }

  update(dt: number): void {
    for (const u of this.units) {
      if (u.disposed) {
        this.units.delete(u);
        continue;
      }
      // render LOD (ART-V2 §5.6): beyond ≈ 30 m one merged mesh instead of ≈ 21 calls (hysteresis 28/32 m)
      u.worldPosition(_p);
      const d2 = _p.distanceToSquared(this.game.camera.position);
      u.setFar(u.isFar ? d2 > 28 * 28 : d2 > 32 * 32);
      // skip far units (cheap LOD for behaviour)
      if (d2 > 120 * 120) continue;
      u.update(dt);
    }
  }

  /** H key: the nearest EMI (≤ 15 m) with an onAsk handler explains the current station. */
  ask(): boolean {
    let best: EmiUnit | null = null,
      bd = 15 * 15;
    for (const u of this.units) {
      const d = u.worldPosition(_p).distanceToSquared(this.game.camera.position);
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    if (best && best.ask()) return true;
    return false;
  }
}
