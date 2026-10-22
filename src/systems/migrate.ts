/**
 * Save format v2 and the migration from rc4 (plan §3.5, D38; owner WP1). The rc4 blob
 * `…/v1:progress` (v: 1) is never written again: it stays as a read-only backup, and an rc4 build
 * on the same origin keeps reading it (rule 7). Phase 7 reads and writes `…/v1:progress.v2`.
 *
 *   migrate(raw, manifests, retired)   pure: a v1 blob → a v2 blob (rules 1, 3, 4, 5, 6)
 *   revisit(data, manifests, retired)  pure: retired stations and rev resets on any v2 blob (rules 3, 4)
 *   migrateAtBoot(manifests, retired)  Game, before Progress: picks the blob, migrates, writes v2 once;
 *                                      on a corrupt blob or a throw it runs read-only in memory (rule 2)
 *
 * Every function takes the manifests (station `rev`, area `kind`) and the retired ids as arguments,
 * so the tools run them in Node with test lists (tools/quest-derive.mjs, tools/fixtures/saves).
 */
import type { Mode } from '@/core/types';
import type { AreaManifest } from '@/core/zones/manifest';
import { emptyQuestStore, QUEST_KEY } from '@/core/quest/derive';
import { parseParams } from '@/core/params';
import type { ChallengeRecord, PredictionRecord, StampRecord } from './Progress';

/** storage keys under the game's prefix (src/core/storage.ts) */
export const SAVE_KEY_V1 = 'progress';
export const SAVE_KEY_V2 = 'progress.v2';
/** = the PREFIX of src/core/storage.ts (raw reads tell a missing blob from a corrupt one) */
const PREFIX = 'emai-academy-island/v1:';

/** What one retired station left behind (rule 3), and the old records of re-goaled stations (rule 4). */
export interface LegacyData {
  from: 'rc4';
  stamps: Record<string, StampRecord | number>;
  challenges: Record<string, ChallengeRecord & { rev?: number }>;
  predictions: Record<string, PredictionRecord>;
  best: Record<string, number>;
}

/** Save format v2 (plan §3.5). Unknown fields are kept. */
export interface ProgressDataV2 {
  v: 2;
  mode: Mode | null;
  stamps: Record<string, number | StampRecord>;
  visited: Record<string, number>;
  /** ctx.progress per area (≤ 16 KB per area); 'world' = the island's progress (incl. 'p7.quest', WP1 only) */
  zoneData: Record<string, Record<string, unknown>>;
  predictions: Record<string, PredictionRecord>;
  questions: number[];
  album: string[];
  best: Record<string, number>;
  challenges: Record<string, ChallengeRecord & { rev?: number }>;
  collectibles: string[];
  lastZone?: string | null;
  /** found secrets (R9 §5.1) */
  secrets: string[];
  legacy?: LegacyData;
  migratedAt?: number;
  [unknown: string]: unknown;
}

export function emptyV2(): ProgressDataV2 {
  return { v: 2, mode: null, stamps: {}, visited: {}, zoneData: {}, predictions: {}, questions: [], album: [], best: {}, challenges: {}, collectibles: [], lastZone: null, secrets: [] };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const copy = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
const areaOf = (id: string): string => id.split('.')[0];

/** Fill missing or malformed v2 fields with their defaults; unknown fields stay. Works on a copy. */
export function normalizeV2(raw: Record<string, unknown>): ProgressDataV2 {
  const d = copy(raw) as Record<string, unknown>;
  const e = emptyV2();
  const obj = (k: keyof ProgressDataV2): void => {
    if (!isObj(d[k])) d[k] = e[k];
  };
  const arr = (k: keyof ProgressDataV2): void => {
    if (!Array.isArray(d[k])) d[k] = e[k];
  };
  for (const k of ['stamps', 'visited', 'zoneData', 'predictions', 'best', 'challenges'] as const) obj(k);
  for (const k of ['questions', 'album', 'collectibles', 'secrets'] as const) arr(k);
  if (d.mode !== 'entdecker' && d.mode !== 'entscheider') d.mode = null;
  if (typeof d.lastZone !== 'string') d.lastZone = null;
  d.secrets = [...new Set((d.secrets as unknown[]).filter((s): s is string => typeof s === 'string'))];
  d.v = 2;
  return d as ProgressDataV2;
}

/** The kind of an area from the manifests ('lobe' when unknown: dev zones count as island areas). */
function kindOf(manifests: readonly AreaManifest[], areaId: string): string {
  return manifests.find((m) => m.id === areaId)?.kind ?? 'lobe';
}

/**
 * Rules 3 and 4 on a v2 blob (pure; idempotent):
 * 3. a retired station's stamp, challenge record, prediction and its prefixed bests ('<id>.…') move to
 *    `legacy`; unprefixed bests stay (they still add to „trials measured“);
 * 4. a challenge record whose `rev` (default 1) differs from its station's manifest `rev` (default 1)
 *    loses stars, best and attempts (the stamp stays); the old record goes to `legacy.challenges` (the
 *    Pass shows its stars as „rc4: ★★“) and the station's prediction to `legacy.predictions`.
 */
export function revisit(data: ProgressDataV2, manifests: readonly AreaManifest[], retired: readonly string[]): ProgressDataV2 {
  const d = normalizeV2(data as unknown as Record<string, unknown>);
  const legacy = (): LegacyData => {
    const L = (d.legacy ??= { from: 'rc4', stamps: {}, challenges: {}, predictions: {}, best: {} });
    L.stamps ??= {};
    L.challenges ??= {};
    L.predictions ??= {};
    L.best ??= {};
    return L;
  };
  for (const id of retired) {
    if (id in d.stamps) {
      legacy().stamps[id] ??= d.stamps[id];
      delete d.stamps[id];
    }
    if (id in d.challenges) {
      legacy().challenges[id] ??= d.challenges[id];
      delete d.challenges[id];
    }
    if (id in d.predictions) {
      legacy().predictions[id] ??= d.predictions[id];
      delete d.predictions[id];
    }
    for (const k of Object.keys(d.best))
      if (k === id || k.startsWith(id + '.')) {
        legacy().best[k] ??= d.best[k];
        delete d.best[k];
      }
  }
  for (const m of manifests)
    for (const s of m.stations) {
      const key = `${m.id}.${s.id}`;
      const rev = s.rev ?? 1;
      const rec = d.challenges[key];
      if (rec && (rec.rev ?? 1) !== rev) {
        legacy().challenges[key] ??= { ...rec };
        d.challenges[key] = { best: null, stars: 0, attempts: 0, last: null, t: rec.t, rev };
      }
      // a prediction made for the station's old goals (records carry the rev they were made under)
      const pred = d.predictions[key] as (PredictionRecord & { rev?: number }) | undefined;
      if (pred && (pred.rev ?? 1) !== rev) {
        legacy().predictions[key] ??= pred;
        delete d.predictions[key];
      }
    }
  return d;
}

/**
 * Rules 1, 5 and 6 (pure): a v1 blob → v2. Throws when `raw` is not a v1 save. The island's progress:
 * `ascentSeen` is dropped, the finale (F1–F3) kept, the sky reset to day, `p7.quest` created grounded
 * (an rc4 player never flew, also with `finale.ended`: D38) with the glide seen after any stamp or a
 * complete ascent and the Probestart done after any island stamp or the onboarding (stage ≥ 3), and
 * `logoShown` recomputed from the island stamps that still count. Every other key is kept.
 */
export function migrate(raw: unknown, manifests: readonly AreaManifest[], retired: readonly string[]): ProgressDataV2 {
  if (!isObj(raw) || raw.v !== 1) throw new Error(`not a v1 save (v = ${isObj(raw) ? JSON.stringify(raw.v) : typeof raw})`);
  const d = normalizeV2({ ...copy(raw), secrets: Array.isArray(raw.secrets) ? raw.secrets : [] });
  const world: Record<string, unknown> = isObj(d.zoneData.world) ? d.zoneData.world : {};
  const ids = Object.keys(d.stamps);
  const ascent = world.ascentSeen === true;
  delete world.ascentSeen;
  world.sky = 'day';
  const store = emptyQuestStore();
  store.start = {
    glideSeen: ids.length > 0 || ascent,
    probestart: ids.some((id) => kindOf(manifests, areaOf(id)) === 'lobe') || (typeof world.onboarding === 'number' && world.onboarding >= 3),
  };
  world[QUEST_KEY] = store;
  d.zoneData.world = world;
  const out = revisit(d, manifests, retired);
  // the tower shows what still counts: earned island stamps after the retired ones left
  let logo = 0;
  for (const [id, r] of Object.entries(out.stamps)) if (kindOf(manifests, areaOf(id)) === 'lobe' && !(isObj(r) && r.skipped)) logo++;
  out.zoneData.world.logoShown = Math.min(18, logo);
  out.migratedAt = Date.now();
  return out;
}

// ── boot ──────────────────────────────────────────────────────────────────────────────────────────

export type SaveSource = 'fresh' | 'v1' | 'v2' | 'corrupt' | 'error';

export interface BootSave {
  /** fresh: no save · v1: migrated now · v2: read as stored · corrupt: unreadable blob · error: migrate() threw */
  source: SaveSource;
  /** what Progress reads */
  data: ProgressDataV2;
  /** rule 2: run in memory, never write */
  readOnly: boolean;
  error: string | null;
  /** the retired ids that applied (RETIRED + ?retired=) */
  retired: readonly string[];
  /** stations whose manifest rev is not 1: '<area>.<station>' → rev */
  revs: Readonly<Record<string, number>>;
}

let pending: BootSave | null = null;
let last: BootSave | null = null;
let revByKey = new Map<string, number>();
let warned = false;

function rawGet(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function rawSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* storage unavailable: the game simply does not persist */
  }
}

function parse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/** RETIRED plus the test entries of `?retired=a,b` (the fixtures, tools/fixtures/saves). */
export function effectiveRetired(retired: readonly string[]): string[] {
  let extra: string[] = [];
  try {
    extra = parseParams().retired ?? [];
  } catch {
    /* no window.location (Node tools) */
  }
  return [...new Set([...retired, ...extra])];
}

/**
 * Boot hook (Game, before Progress). Picks the blob: a v2 blob wins (rules 3/4 applied again, written
 * back when they changed it); else the v1 blob is migrated and written once under the new key; else a
 * fresh save. A corrupt blob or a throwing migration runs read-only in memory (on the untouched v1
 * data) and logs once (rule 2). The result is kept for Progress (takeBootSave) and the tools (lastBootSave).
 */
export function migrateAtBoot(manifests: readonly AreaManifest[], retired: readonly string[]): BootSave {
  const ret = effectiveRetired(retired);
  revByKey = new Map();
  const revs: Record<string, number> = {};
  for (const m of manifests)
    for (const s of m.stations) {
      if (s.rev != null && s.rev !== 1) revs[`${m.id}.${s.id}`] = s.rev;
      if (s.rev != null) revByKey.set(`${m.id}.${s.id}`, s.rev);
    }
  const done = (b: Omit<BootSave, 'retired' | 'revs'>): BootSave => {
    if (b.readOnly && !warned) {
      warned = true;
      console.warn(`[save] the stored progress could not be read (${b.error ?? b.source}): running read-only in memory, nothing is written`);
    }
    return (pending = last = { ...b, retired: ret, revs });
  };
  const readOnlyFromV1 = (source: SaveSource, error: string): BootSave => {
    const v1 = parse(rawGet(SAVE_KEY_V1) ?? 'null');
    // the untouched v1 data in memory (shape only), else nothing
    const data = isObj(v1) && v1.v === 1 ? normalizeV2({ ...v1, secrets: [] }) : emptyV2();
    return done({ source, data, readOnly: true, error });
  };

  const v2raw = rawGet(SAVE_KEY_V2);
  if (v2raw != null) {
    const v2 = parse(v2raw);
    if (!isObj(v2) || v2.v !== 2) return readOnlyFromV1('corrupt', 'the v2 blob is not JSON of version 2');
    try {
      const data = revisit(normalizeV2(v2), manifests, ret);
      if (JSON.stringify(data) !== JSON.stringify(normalizeV2(v2))) rawSet(SAVE_KEY_V2, JSON.stringify(data));
      return done({ source: 'v2', data, readOnly: false, error: null });
    } catch (err) {
      return done({ source: 'error', data: normalizeV2(v2), readOnly: true, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const v1raw = rawGet(SAVE_KEY_V1);
  if (v1raw == null) return done({ source: 'fresh', data: emptyV2(), readOnly: false, error: null });
  const v1 = parse(v1raw);
  if (!isObj(v1) || v1.v !== 1) return done({ source: 'corrupt', data: emptyV2(), readOnly: true, error: 'the rc4 blob is not JSON of version 1' });
  try {
    const data = migrate(v1, manifests, ret);
    rawSet(SAVE_KEY_V2, JSON.stringify(data));
    return done({ source: 'v1', data, readOnly: false, error: null });
  } catch (err) {
    return readOnlyFromV1('error', err instanceof Error ? err.message : String(err));
  }
}

/** Progress takes the boot result once (null when the boot hook did not run: Progress reads the v2 key itself). */
export function takeBootSave(): BootSave | null {
  const b = pending;
  pending = null;
  return b;
}

/** The last boot result (tools, the save report). */
export function lastBootSave(): BootSave | null {
  return last;
}

/** A station's manifest rev (records created from now on carry it, so rule 4 never resets them again). */
export function stationRev(key: string): number | undefined {
  return revByKey.get(key);
}
