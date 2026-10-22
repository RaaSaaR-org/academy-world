import type { EventBus } from '@/core/EventBus';
import { loadJSON, removeKey, saveJSON } from '@/core/storage';
import { SAVE_KEY_V1, SAVE_KEY_V2, emptyV2, normalizeV2, stationRev, takeBootSave, type LegacyData, type ProgressDataV2 } from './migrate';
import type { Mode, Text } from '@/core/types';
import { RECAMAN } from '@/core/brand/logo3d';
import type { ChallengeResult, Stars } from '@/core/zones/types';
import type { StampScope } from '@/core/quest/types';
import type { PlotKind } from '@/core/zones/manifest';

/** One challenge's persisted record (docs/FUN-PLAN.md §4.3). */
export interface ChallengeRecord {
  /** best metric value (per `better`), null when the challenge has no metric */
  best: number | null;
  /** best stars over all attempts */
  stars: Stars;
  attempts: number;
  /** value of the last submitted attempt */
  last: number | null;
  /** time of the last submit (ms) */
  t: number;
}

export interface StampDef {
  /** Full id: "<zoneId>.<stationId>" (GDD §5.1 pass unit ids). */
  id: string;
  zoneId: string;
  title: Text;
  description?: Text;
  /** Sort order inside the zone's page of the pass. */
  order?: number;
  /** ◆ station (Entscheider core station; field name kept). */
  star?: boolean;
  /** Non-station stamp (ctx.progress.registerStamp): listed in the pass, not counted by stampsInZone. */
  extra?: boolean;
}

/** What a stamp remembers: the player's own measured value (Kennlinie statt Etikett). */
export interface StampRecord {
  t: number;
  /** e.g. „σ(6 m) = 7,2 cm · Gegenlicht ×2,5" — JSON-serialisable Text (string or {de,en}) */
  value?: Text;
  skipped?: boolean;
  /** optional mini Kennlinie (y values, any scale) shown in the pass */
  curve?: number[];
}

export interface PredictionRecord {
  predicted: number;
  measured: number;
  min: number;
  max: number;
  scale: 'linear' | 'log';
  /** |p − m| / (max − min) × 100 on the given scale (log10 for log) — GDD §5.5 */
  deviation: number;
  /** the station's manifest rev when it is not 1 (plan §3.5 rule 4) */
  rev?: number;
}

export interface AlbumDef {
  id: string;
  zoneId: string;
  title: Text;
  /** the report line: what broke, when, why */
  text: Text;
  /** Entdecker hint shown once the zone's stamps are done */
  hint?: Text;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Academy Pass + audience mode + per-zone key/value storage. Persisted to localStorage under the
 * save v2 key (plan §3.5; try/catch wrapped — works without storage, just not persistent). The boot
 * migration (src/systems/migrate.ts) hands over the data; a save it could not read runs read-only.
 */
export class Progress {
  private data: ProgressDataV2;
  readonly stampDefs = new Map<string, StampDef>();
  readonly questionDefs = new Map<number, { text: Text; why?: Text }>();
  readonly albumDefs = new Map<string, AlbumDef>();
  private saveTimer = 0;
  /** §3.5 rule 2: the stored save could not be read or migrated; the game runs in memory and never writes (until a reset) */
  private ro: boolean;
  get readOnly(): boolean {
    return this.ro;
  }

  constructor(private events: EventBus) {
    const boot = takeBootSave();
    if (boot) {
      this.data = boot.data;
      this.ro = boot.readOnly;
    } else {
      // no boot hook (tools, tests): the v2 key as stored
      const loaded = loadJSON<unknown>(SAVE_KEY_V2, null);
      this.data = isObj(loaded) && loaded.v === 2 ? normalizeV2(loaded) : emptyV2();
      this.ro = false;
    }
  }

  /**
   * D13 / D26: anything earned so far (stamps, stars, Sensorkapseln, question cards, secrets). Read from
   * the save itself, so it is right on the title before any zone has registered its stamps (C13).
   */
  hasAnyProgress(): boolean {
    const d = this.data;
    return (
      Object.keys(d.stamps).length > 0 ||
      Object.values(d.challenges).some((c) => (c?.stars ?? 0) > 0) ||
      d.collectibles.length > 0 ||
      d.questions.length > 0 ||
      d.secrets.length > 0
    );
  }

  /** D13: the zone entered last, or null. */
  get lastZone(): string | null {
    return this.data.lastZone ?? null;
  }

  setLastZone(id: string): void {
    if (this.data.lastZone === id) return;
    this.data.lastZone = id;
    this.save();
  }

  get mode(): Mode {
    return this.data.mode ?? 'entdecker';
  }

  get hasChosenMode(): boolean {
    return this.data.mode != null;
  }

  setMode(mode: Mode): void {
    const changed = this.data.mode !== mode;
    this.data.mode = mode;
    this.save();
    if (changed) this.events.emit('mode:changed', { mode });
  }

  // ── stamps ────────────────────────────────────────────────────────────────

  /**
   * Phase 7 scopes (plan §3.4, §5.2; WP1 contract, committed by WPS): the plot kind of an area, set by
   * Game from the manifests. 'island' counts the areas of kind 'lobe' only (the 18 island stamps).
   */
  areaKind: (zoneId: string) => PlotKind = () => 'lobe';

  private inScope(id: string, scope: StampScope): boolean {
    if (scope === 'all') return true;
    const zoneId = this.stampDefs.get(id)?.zoneId ?? id.split('.')[0];
    return this.areaKind(zoneId) === 'lobe';
  }

  registerStamp(def: StampDef): void {
    this.stampDefs.set(def.id, def);
  }

  hasStamp(id: string): boolean {
    return id in this.data.stamps;
  }

  stampRecord(id: string): StampRecord | null {
    const r = this.data.stamps[id];
    if (r == null) return null;
    return typeof r === 'number' ? { t: r } : r;
  }

  /**
   * Award a stamp (returns true when it is new). Awarding again updates the recorded value
   * (emits 'stamp:updated'). Emits 'stamp:awarded' with the stamp's index n (1-based).
   */
  awardStamp(id: string, o: { value?: Text; skipped?: boolean; curve?: number[] } = {}): boolean {
    const prev = this.stampRecord(id);
    const rec: StampRecord = { t: prev?.t ?? Date.now(), value: o.value ?? prev?.value, skipped: o.skipped ?? false, curve: o.curve ?? prev?.curve };
    if (prev && prev.skipped && !o.skipped) rec.t = Date.now();
    this.data.stamps[id] = rec;
    this.save();
    // a grey „übersprungen" stamp that is later earned for real counts as newly earned (stamp FX, melody note)
    const upgraded = !!prev && !!prev.skipped && !o.skipped;
    if (prev && !upgraded) {
      this.events.emit('stamp:updated', { id });
      return false;
    }
    // earned = non-skipped station stamps after this award (the tower draws element earned − 1)
    this.events.emit('stamp:awarded', { id, n: this.stamps().length, skipped: !!o.skipped, upgraded, earned: this.earnedStamps() });
    return true;
  }

  /** Station stamps that were earned for real (not skipped, not extra): the tower and the Pass cover count these (max 18). */
  earnedStamps(o: { scope?: StampScope } = {}): number {
    let n = 0;
    for (const [id, r] of Object.entries(this.data.stamps)) {
      if (this.stampDefs.get(id)?.extra) continue;
      if (!this.inScope(id, o.scope ?? 'island')) continue;
      if (typeof r === 'object' && r?.skipped) continue;
      n++;
    }
    return n;
  }

  /** Earned (non-skipped) station stamps of one zone. */
  earnedInZone(zoneId: string): number {
    let n = 0;
    for (const [id, r] of Object.entries(this.data.stamps)) {
      const def = this.stampDefs.get(id);
      if (def?.extra) continue;
      if (!(def?.zoneId === zoneId || id.startsWith(zoneId + '.'))) continue;
      if (typeof r === 'object' && r?.skipped) continue;
      n++;
    }
    return n;
  }

  /** Stamp ids (earned or skipped). Phase 7: `scope` as earnedStamps (default 'island'). */
  stamps(o: { scope?: StampScope } = {}): string[] {
    const scope = o.scope ?? 'island';
    return Object.keys(this.data.stamps).filter((id) => this.inScope(id, scope));
  }

  stampsInZone(zoneId: string): number {
    let n = 0;
    // station stamps only (0–3): the island's objective route and lift unlock depend on it
    for (const id of Object.keys(this.data.stamps)) {
      const def = this.stampDefs.get(id);
      if (def?.extra) continue;
      if (def?.zoneId === zoneId || id.startsWith(zoneId + '.')) n++;
    }
    return n;
  }

  /** Note of the Recamán melody for stamp n (1-based): f = 220 Hz · 2^(a(n−1)/12). */
  static stampNote(n: number): number {
    const a = RECAMAN[Math.max(0, Math.min(RECAMAN.length - 1, n - 1))];
    return 220 * Math.pow(2, a / 12);
  }

  // ── predictions (Prognose-Güte) ───────────────────────────────────────────

  recordPrediction(id: string, predicted: number, measured: number, o: { min: number; max: number; scale?: 'linear' | 'log' }): PredictionRecord {
    const scale = o.scale ?? 'linear';
    const f = (v: number): number => (scale === 'log' ? Math.log10(Math.max(1e-12, v)) : v);
    const range = Math.abs(f(o.max) - f(o.min)) || 1;
    const deviation = Math.min(100, (Math.abs(f(predicted) - f(measured)) / range) * 100);
    const rev = stationRev(id);
    const rec: PredictionRecord = { predicted, measured, min: o.min, max: o.max, scale, deviation, ...(rev != null && rev !== 1 ? { rev } : {}) };
    this.data.predictions[id] = rec;
    this.save();
    this.events.emit('prediction:recorded', { id, deviation });
    return rec;
  }

  prediction(id: string): PredictionRecord | null {
    return this.data.predictions[id] ?? null;
  }

  /** 100 − mean deviation over all recorded predictions; null when there are none. */
  prognoseGuete(): number | null {
    const list = Object.values(this.data.predictions);
    if (!list.length) return null;
    return 100 - list.reduce((s, p) => s + p.deviation, 0) / list.length;
  }

  // ── question cards / album / best values ──────────────────────────────────

  registerQuestion(n: number, text: Text, why?: Text): void {
    this.questionDefs.set(n, { text, why });
  }

  awardQuestion(n: number): boolean {
    if (this.data.questions.includes(n)) return false;
    this.data.questions.push(n);
    this.data.questions.sort((a, b) => a - b);
    this.save();
    this.events.emit('question:awarded', { n });
    return true;
  }

  questions(): number[] {
    return this.data.questions.slice();
  }

  hasQuestion(n: number): boolean {
    return this.data.questions.includes(n);
  }

  /** All recorded predictions (copies). */
  predictions(): Record<string, PredictionRecord> {
    return JSON.parse(JSON.stringify(this.data.predictions)) as Record<string, PredictionRecord>;
  }

  /** All best values (copy). */
  bests(): Record<string, number> {
    return { ...this.data.best };
  }

  registerAlbum(def: AlbumDef): void {
    this.albumDefs.set(def.id, def);
  }

  unlockAlbum(id: string): boolean {
    if (this.data.album.includes(id)) return false;
    this.data.album.push(id);
    this.save();
    this.events.emit('album:unlocked', { id });
    return true;
  }

  album(): string[] {
    return this.data.album.slice();
  }

  /** Store a best value; returns true when improved. */
  setBest(key: string, value: number, better: 'higher' | 'lower' = 'higher'): boolean {
    const prev = this.data.best[key];
    if (prev !== undefined && (better === 'higher' ? value <= prev : value >= prev)) return false;
    this.data.best[key] = value;
    this.save();
    this.events.emit('best:updated', { key, value });
    return true;
  }

  getBest(key: string): number | null {
    return this.data.best[key] ?? null;
  }

  // ── visits / zone storage ─────────────────────────────────────────────────

  markVisited(zoneId: string): boolean {
    if (zoneId in this.data.visited) return false;
    this.data.visited[zoneId] = Date.now();
    this.save();
    return true;
  }

  visited(zoneId: string): boolean {
    return zoneId in this.data.visited;
  }

  getZoneValue<T>(zoneId: string, key: string, fallback: T): T {
    const v = this.data.zoneData[zoneId]?.[key];
    return v === undefined ? fallback : (v as T);
  }

  setZoneValue(zoneId: string, key: string, value: unknown): void {
    (this.data.zoneData[zoneId] ??= {})[key] = value;
    this.save();
    // the quest spine re-derives on island keys it reads (the finale)
    this.events.emit('progress:value', { zone: zoneId, key });
  }

  // ── Phase 7: secrets, legacy, the raw save (WP1) ──────────────────────────

  /** Found secrets (ctx.game.secrets; R9 §5.1). */
  secrets(): string[] {
    return this.data.secrets.slice();
  }

  /** Remember a found secret (true when new). */
  addSecret(id: string): boolean {
    if (this.data.secrets.includes(id)) return false;
    this.data.secrets.push(id);
    this.save();
    return true;
  }

  /** What the migration archived (retired stations, records of re-goaled stations), or null. */
  legacy(): LegacyData | null {
    return this.data.legacy ? (JSON.parse(JSON.stringify(this.data.legacy)) as LegacyData) : null;
  }

  /** A deep copy of the whole save (tools: __academy.ext('save')). */
  dataCopy(): ProgressDataV2 {
    return JSON.parse(JSON.stringify(this.data)) as ProgressDataV2;
  }

  // ── game layer: challenges (stars, bests, attempts) and Sensorkapseln ─────

  challengeRecord(key: string): ChallengeRecord | null {
    const r = this.data.challenges[key];
    return r ? { ...r } : null;
  }

  /** All challenge records (copies). */
  challenges(): Record<string, ChallengeRecord> {
    return JSON.parse(JSON.stringify(this.data.challenges)) as Record<string, ChallengeRecord>;
  }

  /** A new record carries its station's manifest rev (plan §3.5 rule 4: it never resets again). */
  private newRecord(key: string): ChallengeRecord & { rev?: number } {
    const rev = stationRev(key);
    return { best: null, stars: 0, attempts: 0, last: null, t: Date.now(), ...(rev != null && rev !== 1 ? { rev } : {}) };
  }

  /** Count one attempt (ChallengeHandle.begin, or a submit/fail without begin). */
  countAttempt(key: string): number {
    const r = (this.data.challenges[key] ??= this.newRecord(key));
    r.attempts++;
    this.save();
    return r.attempts;
  }

  /** Persist a result: stars = max over attempts, best metric per `better`. */
  recordChallenge(key: string, value: number | null, better: 'higher' | 'lower', stars: Stars): ChallengeResult {
    const r = (this.data.challenges[key] ??= this.newRecord(key));
    const prevStars = r.stars;
    const prevBest = r.best;
    const v = value != null && Number.isFinite(value) ? value : null;
    let personalBest = false;
    if (v != null) {
      if (prevBest == null) r.best = v;
      else if (better === 'higher' ? v > prevBest : v < prevBest) {
        r.best = v;
        personalBest = true;
      }
    }
    r.stars = Math.max(prevStars, stars) as Stars;
    r.last = v;
    r.t = Date.now();
    if (r.attempts < 1) r.attempts = 1;
    this.save();
    return { value: v, stars, best: r.stars, prevStars, newStars: r.stars > prevStars, personalBest, bestValue: r.best, prevBest };
  }

  /** Best stars of a station ('<zoneId>.<stationId>'). */
  stationStars(zoneId: string, stationId: string): Stars {
    return this.data.challenges[`${zoneId}.${stationId}`]?.stars ?? 0;
  }

  /** ★ over all station stamps (non-extra stamp defs); max 54 with 18 stations. */
  totalStars(): number {
    let n = 0;
    for (const def of this.stampDefs.values()) if (!def.extra) n += this.data.challenges[def.id]?.stars ?? 0;
    return n;
  }

  /** Mark a Sensorkapsel found (true when new). */
  collect(id: string): boolean {
    if (this.data.collectibles.includes(id)) return false;
    this.data.collectibles.push(id);
    this.save();
    return true;
  }

  collectibles(): string[] {
    return this.data.collectibles.slice();
  }

  /**
   * Wipe the progress (the mode stays). Removes both save keys, the v2 save and the rc4 backup (§3.5);
   * a read-only save (rule 2) becomes a fresh, writable one: the player asked for a new start.
   */
  reset(): void {
    const mode = this.data.mode;
    this.data = { ...emptyV2(), mode };
    removeKey(SAVE_KEY_V2);
    removeKey(SAVE_KEY_V1);
    this.ro = false;
    this.save();
    this.events.emit('progress:reset', {});
  }

  private save(): void {
    // §3.5 rule 2: a save that could not be read is never overwritten
    if (this.readOnly) return;
    // Debounced — awarding several things in one frame writes once. Only the v2 key: the rc4 blob stays untouched.
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => saveJSON(SAVE_KEY_V2, this.data), 50);
  }
}
