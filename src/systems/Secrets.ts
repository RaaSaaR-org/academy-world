/**
 * WP1 — ctx.game.secrets (plan §5.2, §4.13, R9 §5): easter eggs that never gate and give no stars.
 * Found ids are saved (save v2 `secrets`), counted by hasAnyProgress() and listed in the Pass section
 * „Funde“ (hidden until the first find). A find plays one feedback (toast, cue, popup, radio line:
 * GameLayer) and never opens a card by itself: the card opens from the Pass. nearestHint() serves
 * EMI-01's hint after the lift-off (levels H0–H2 only; H3 riddles are never hinted).
 */
import type * as THREE from 'three';
import type { EventBus } from '@/core/EventBus';
import { toVec3, type Vec3Input } from '@/core/types';
import type { SecretDef, ZoneSecrets } from '@/core/zones/types.quest';
import type { InfoCardSpec } from '@/ui/Modals';

export interface SecretsHost {
  events: EventBus;
  /** where found ids live (Progress) */
  store: { secrets(): string[]; addSecret(id: string): boolean };
  /** the feedback of a new find (n of total, the world position when known) */
  onFound?(def: SecretDef, n: number, total: number, at: { x: number; y: number; z: number } | null): void;
  /** open a found secret's card (requested: from the Pass or the Fundvitrine) */
  openCard?(spec: InfoCardSpec): void;
}

export class Secrets implements ZoneSecrets {
  private readonly defs = new Map<string, SecretDef>();
  private readonly makers = new Map<string, () => THREE.Object3D>();
  private readonly objects = new Map<string, THREE.Object3D>();

  constructor(private host: SecretsHost) {}

  register(def: SecretDef): void {
    if (import.meta.env.DEV && this.defs.has(def.id) && this.defs.get(def.id) !== def) console.warn(`[secrets] "${def.id}" registered twice: the last one wins`);
    this.defs.set(def.id, def);
  }

  registerObject(objectId: string, make: () => THREE.Object3D): void {
    this.makers.set(objectId, make);
  }

  object(objectId: string): THREE.Object3D | null {
    let o = this.objects.get(objectId) ?? null;
    const make = this.makers.get(objectId);
    if (!o && make) {
      try {
        this.objects.set(objectId, (o = make()));
      } catch (err) {
        console.error(`[secrets] object "${objectId}" failed to build`, err);
        return null;
      }
    }
    return o;
  }

  /** Idempotent: true only the first time. Emits 'secret:found' { id, n, total }. */
  find(id: string, at?: Vec3Input): boolean {
    const def = this.defs.get(id);
    if (!def) {
      if (import.meta.env.DEV) console.warn(`[secrets] find("${id}"): not registered`);
      return false;
    }
    if (!this.host.store.addSecret(id)) return false;
    const n = this.found().length;
    const total = Math.max(this.defs.size, n);
    const pos = at ? toVec3(at) : def.at ? toVec3(def.at) : null;
    this.host.events.emit('secret:found', { id, n, total, area: def.area, level: def.level });
    try {
      this.host.onFound?.(def, n, total, pos);
    } catch (err) {
      console.error('[secrets] find feedback threw', err);
    }
    return true;
  }

  has(id: string): boolean {
    return this.host.store.secrets().includes(id);
  }

  found(): string[] {
    return this.host.store.secrets();
  }

  total(): number {
    return this.defs.size;
  }

  /** The registered secrets in registration order (the Pass slots). */
  list(): SecretDef[] {
    return [...this.defs.values()];
  }

  /** Open a found secret's card (the Pass, the Fundvitrine); false when it is not found or has no card. */
  openCard(id: string): boolean {
    const def = this.defs.get(id);
    if (!def || !this.has(id) || !this.host.openCard) return false;
    try {
      this.host.openCard(def.card());
      return true;
    } catch (err) {
      console.error(`[secrets] card of "${id}" threw`, err);
      return false;
    }
  }

  /**
   * The nearest unfound secret with a known position and a hint level ≤ maxLevel (default 2; level 3
   * riddles are never hinted). bearing: compass degrees (0 = north = −z, 90 = east = +x); distance in m.
   */
  nearestHint(fromWorld: Vec3Input, maxLevel: 0 | 1 | 2 = 2): { id: string; bearing: number; distance: number } | null {
    const p = toVec3(fromWorld);
    const found = new Set(this.found());
    let best: { id: string; bearing: number; distance: number } | null = null;
    for (const d of this.defs.values()) {
      if (found.has(d.id) || d.level > maxLevel || !d.at) continue;
      const q = toVec3(d.at);
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const distance = Math.hypot(dx, dz);
      if (best && distance >= best.distance) continue;
      const bearing = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
      best = { id: d.id, bearing: Math.round(bearing * 10) / 10, distance: Math.round(distance * 10) / 10 };
    }
    return best;
  }
}
