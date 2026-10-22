import type * as THREE from 'three';
import type { EmiHandle, Text, ZoneContext } from '@/core/zones';
import type { Builder } from './kit';
import type { Look } from './look';
import type { Lidar } from './lidar';
import type { SensorSound } from './sound';
import type { Visor, VisorMode } from './visor';

export type Region = 'outside' | 'tunnel' | 'dome' | 'darkroom';

/** Everything the station modules share (one instance per zone life). */
export interface Sd {
  ctx: ZoneContext;
  visor: Visor;
  lidar: Lidar;
  sound: SensorSound;
  B: Builder;
  /** Flugmaschine materials and light tiers (ART-V2) */
  look: Look;
  emi: EmiHandle;
  /** where the player is right now */
  region(): Region;
  /** re-evaluate the zone objective from the stamps */
  refreshObjective(): void;
  /** EMI-02 line (zone string key) */
  say(key: string, params?: Record<string, string | number>): void;
  /** set the visor mode (with wave + click) */
  setMode(m: VisorMode, force?: boolean): void;
  /** modes the player switched to inside the dome */
  modesSeen: Set<VisorMode>;
  /** register a sign group: panels as structure, texts RGB-only */
  registerSign(g: THREE.Object3D): void;
  /** register troika text (RGB only) */
  rgbOnly(o: THREE.Object3D): void;
  /** open a card later, when no modal / operate mode is in the way */
  cardWhenFree(open: () => Promise<void>, delay?: number): void;
  text(key: string, params?: Record<string, string | number>): Text;
  /** virtual light #2 (Labor / Messstrecke / darkroom reveal) */
  light2: { setIntensity(v: number): void; setColor(c: THREE.ColorRepresentation): void; anchor: THREE.Object3D };
}
