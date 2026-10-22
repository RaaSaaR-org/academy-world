import * as THREE from 'three';

/**
 * Virtual point lights. Zones may request any number; the engine renders only the
 * N nearest to the camera with N fixed real PointLights (no shadows). Keeping the real
 * light count constant means shader programs never recompile when zones add lights.
 */
export interface VirtualLightOptions {
  color?: THREE.ColorRepresentation;
  intensity?: number; // candela-ish (three physical units), default 6
  distance?: number; // cutoff (m), default 8
  decay?: number; // default 2
}

export interface VirtualLight {
  readonly position: THREE.Vector3; // world
  color: THREE.Color;
  intensity: number;
  distance: number;
  decay: number;
  enabled: boolean;
  owner: string;
  /** follow this object (world position read each frame) */
  follow: THREE.Object3D | null;
}

const POOL = 4;
const FADE_START = 22;
const FADE_END = 34;

export class LightPool {
  private real: THREE.PointLight[] = [];
  readonly lights = new Set<VirtualLight>();
  private scratch: VirtualLight[] = [];

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < POOL; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 8, 2);
      l.name = `lightpool:${i}`;
      l.castShadow = false;
      scene.add(l);
      this.real.push(l);
    }
  }

  add(owner: string, position: THREE.Vector3, o: VirtualLightOptions = {}): VirtualLight {
    const v: VirtualLight = {
      position: position.clone(),
      color: new THREE.Color(o.color ?? 0xffe6cc),
      intensity: o.intensity ?? 6,
      distance: o.distance ?? 8,
      decay: o.decay ?? 2,
      enabled: true,
      owner,
      follow: null,
    };
    this.lights.add(v);
    return v;
  }

  remove(v: VirtualLight): void {
    this.lights.delete(v);
  }

  update(camPos: THREE.Vector3): void {
    const list = this.scratch;
    list.length = 0;
    for (const v of this.lights) {
      if (!v.enabled || v.intensity <= 0) continue;
      if (v.follow) v.follow.getWorldPosition(v.position);
      list.push(v);
    }
    list.sort((a, b) => a.position.distanceToSquared(camPos) - b.position.distanceToSquared(camPos));
    for (let i = 0; i < POOL; i++) {
      const l = this.real[i];
      const v = list[i];
      if (!v) {
        l.intensity = 0;
        continue;
      }
      const d = v.position.distanceTo(camPos) - v.distance * 0.5;
      const fade = 1 - THREE.MathUtils.smoothstep(d, FADE_START, FADE_END);
      l.position.copy(v.position);
      l.color.copy(v.color);
      l.intensity = v.intensity * fade;
      l.distance = v.distance;
      l.decay = v.decay;
    }
  }
}
