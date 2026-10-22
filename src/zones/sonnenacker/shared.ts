/**
 * Sonnenacker — what the stations share (built once in index.ts): the context, the look, the site,
 * the roof, the field, the arms, the dashboard, EMI-08 and the zone's sounds.
 */
import type * as THREE from 'three';
import type { EmiHandle, Text, ZoneContext } from '@/core/zones';
import type { Look } from './look';
import type { Site } from './site';
import type { Roof } from './roof';
import type { Field } from './field';
import type { Arms } from './arms';
import type { Dashboard } from './hofladen';
import type { FarmSound } from './sound';

export type StationKey = 'a' | 'b' | 'c';

export interface Shared {
  ctx: ZoneContext;
  look: Look;
  site: Site;
  roof: Roof;
  field: Field;
  arms: Arms;
  dash: Dashboard;
  emi: EmiHandle;
  sound: FarmSound;
  /** the static exterior (baked by mergeStatic at the end of init) and the live detail group */
  ext: THREE.Object3D;
  det: THREE.Object3D;
  /** EMI-08 talks (queued; `now` interrupts) */
  say(text: Text, now?: boolean): void;
  /** the station the player is operating, or null */
  active: StationKey | null;
  /** re-evaluate the objective line */
  refresh(): void;
  /** the Herztomate egg asks the arms to hesitate (index.ts wires it) */
  y(x: number, z: number): number;
}
