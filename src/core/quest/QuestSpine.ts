/**
 * WP1 — ctx.quest (plan §3.1, §5.2, D23): the rotors, the Startakku, the Flugmodell, the trims, the
 * gates, the flight and the mastery, derived from Progress and the manifests (src/core/quest/derive.ts).
 * The few facts no event can recompute (the Probestart, the glide, the beats played, the stored
 * Bodencrew, the flight, the H2 cover) live in zoneData.world['p7.quest'] (QuestStore, §3.5), written
 * only here. Every change is reported to the
 * onChange listeners and mirrored on the EventBus (quest:* , flight:state).
 */
import type { EventBus } from '../EventBus';
import type { LaunchParams } from '../params';
import type { AreaManifest, CoreId, RotorId, SystemId } from '../zones/manifest';
import type { Progress } from '@/systems/Progress';
import { deriveQuest, diffQuest, QUEST_KEY, readQuestStore, type QuestStore } from './derive';
import { systemDefs } from './systems';
import { ENTSCHEIDER_TIMING_CREW } from './tuning';
import type { BeatId, FlightStateName, QuestApi, QuestEvent, QuestSnapshot, SystemDef, SystemState } from './types';

export interface QuestDeps {
  progress: Progress;
  events: EventBus;
  params: Pick<LaunchParams, 'flight'> & Partial<Pick<LaunchParams, 'liftoff'>>;
  manifests: Iterable<AreaManifest>;
}

export class QuestSpine implements QuestApi {
  readonly defs: readonly SystemDef[];
  readonly manifests: readonly AreaManifest[];
  private readonly listeners = new Set<(s: QuestSnapshot, e: QuestEvent) => void>();
  private store: QuestStore;
  /** ?flight= for this session: read, never stored; the first setFlight() replaces it */
  private flightOverride: FlightStateName | null;
  private last: QuestSnapshot;

  constructor(private deps: QuestDeps) {
    this.manifests = [...deps.manifests];
    this.defs = systemDefs(this.manifests);
    this.flightOverride = deps.params.flight ?? null;
    this.store = this.load();
    this.last = this.derive();
    for (const ev of ['stamp:awarded', 'stamp:updated', 'mode:changed', 'stars:changed', 'challenge:result']) deps.events.on(ev, () => this.refresh());
    deps.events.on('progress:reset', () => {
      this.store = this.load();
      this.refresh();
    });
    // the island keys the derivation reads: the finale (F3 signed, visited), the rc4 ascent flag
    deps.events.on('progress:value', (p?: { zone?: string; key?: string }) => {
      if (p?.zone === 'world' && (p.key === 'finale' || p.key === 'ascentSeen')) this.refresh();
    });
  }

  /** p7.quest as stored (zoneData.world, written by this spine only). */
  private load(): QuestStore {
    return readQuestStore(this.deps.progress.getZoneValue<unknown>('world', QUEST_KEY, null));
  }

  snapshot(): QuestSnapshot {
    return this.derive();
  }

  system(id: SystemId): SystemState {
    return this.derive().systems[id] ?? (this.defs.find((d) => d.id === id)?.group === 'trim' ? 'aus' : 'kalt');
  }

  onChange(cb: (s: QuestSnapshot, e: QuestEvent) => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  resumeArea(): string | null {
    return this.deps.progress.lastZone;
  }

  markProbestart(): void {
    if (this.store.start.probestart) return;
    this.store.start.probestart = true;
    this.changed();
  }

  markGlideSeen(): void {
    if (this.store.start.glideSeen) return;
    this.store.start.glideSeen = true;
    this.changed();
  }

  markBeat(id: BeatId): boolean {
    if (this.store.seenBeats.includes(id)) return false;
    this.store.seenBeats.push(id);
    this.changed();
    return true;
  }

  /** a beat was played already (WP12 checks before it plays one that markBeat would refuse) */
  beatSeen(id: BeatId): boolean {
    return this.store.seenBeats.includes(id);
  }

  groundCrew(id: RotorId | CoreId, reason: 'asset' | 'timing'): void {
    const c = this.store.groundCrew.find((x) => x.id === id);
    if (c?.reason === reason) return;
    if (c) c.reason = reason;
    else this.store.groundCrew.push({ id, reason });
    this.changed();
  }

  setFlight(state: FlightStateName, o: { liftoffSeen?: boolean } = {}): void {
    const f = this.store.flight;
    this.flightOverride = null;
    this.store.flight = {
      state,
      firstFlightAt: f.firstFlightAt ?? (state === 'airborne' ? Date.now() : null),
      liftoffSeen: f.liftoffSeen || !!o.liftoffSeen,
    };
    this.changed();
  }

  unveilH2(): void {
    if (this.store.mastery.h2Unveiled) return;
    this.store.mastery.h2Unveiled = true;
    this.changed();
  }

  /** The stored part (tools, the save report). A copy. */
  stored(): QuestStore {
    return JSON.parse(JSON.stringify(this.store)) as QuestStore;
  }

  // ── derivation (§3.1) ─────────────────────────────────────────────────────────

  private derive(): QuestSnapshot {
    const P = this.deps.progress;
    return deriveQuest({
      manifests: this.manifests,
      defs: this.defs,
      stamp: (k) => P.stampRecord(k),
      stars: (k) => P.challengeRecord(k)?.stars ?? 0,
      mode: P.mode,
      store: this.store,
      finale: P.getZoneValue<{ visited?: boolean; f3?: unknown } | null>('world', 'finale', null),
      flightOverride: this.flightOverride,
      liftoff: !!this.deps.params.liftoff,
      ascentSeen: P.getZoneValue<boolean>('world', 'ascentSeen', false) === true,
      timingCrew: ENTSCHEIDER_TIMING_CREW,
    });
  }

  /** a stored fact changed: persist p7.quest (a copy), then report what follows from it */
  private changed(): void {
    this.deps.progress.setZoneValue('world', QUEST_KEY, JSON.parse(JSON.stringify(this.store)) as QuestStore);
    this.refresh();
  }

  /** Recompute and report what changed to the listeners and on the EventBus (quest:* mirrors). */
  refresh(): void {
    const prev = this.last;
    const next = (this.last = this.derive());
    const out = diffQuest(prev, next, this.defs);
    const bus = this.deps.events;
    for (const e of out) {
      for (const cb of [...this.listeners]) {
        try {
          cb(next, e);
        } catch (err) {
          console.error('[quest] onChange listener threw', err);
        }
      }
      if (e.kind === 'system') bus.emit('quest:system', { id: e.id, from: e.from, to: e.to });
      else if (e.kind === 'charge') bus.emit('quest:charge', { charge: e.charge });
      else if (e.kind === 'flight') bus.emit('flight:state', { state: e.state });
      else bus.emit(e.kind === 'h2-earned' ? 'quest:h2' : `quest:${e.kind}`, {});
    }
  }
}
