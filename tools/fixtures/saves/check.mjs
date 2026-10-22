// Checks one save fixture against what the game reports (README.md next to this file; plan §3.5).
// Shared by tools/save-migrate.mjs (WP7, in the browser) and tools/quest-derive.mjs (WP1, in Node).
//
//   import { loadFixtures, checkFixture } from './fixtures/saves/check.mjs';
//   const { failures, notes } = checkFixture(fixture, { save, before, after }, 'boot' | 'reload');
//
// `save` = __academy.ext('save')(); `before` / `after` = { v1, v2 } raw localStorage strings (null when
// absent): `before` as seeded, `after` after the v2 session and the reload (null at 'boot').
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const PREFIX = 'emai-academy-island/v1:';
export const V1_KEY = PREFIX + 'progress';
export const V2_KEY = PREFIX + 'progress.v2';

/** Every fixture of this folder (sorted by file name), each with `file`. */
export function loadFixtures(dir = DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}

/** The localStorage entries a fixture seeds: full key → raw string. */
export function seedEntries(fx) {
  const out = {};
  for (const [k, v] of Object.entries(fx.storage ?? {})) out[PREFIX + k] = typeof v === 'string' ? v : JSON.stringify(v);
  return out;
}

/** The URL query a fixture needs (without the leading '?'). */
export function fixtureQuery(fx) {
  const q = ['skipIntro=1'];
  if (fx.params) q.push(fx.params);
  if (fx.retired?.length) q.push(`retired=${fx.retired.join(',')}`);
  return q.join('&');
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (isObj(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]));
  return v;
}
const at = (obj, p) => p.reduce((o, k) => (o == null ? undefined : o[k]), obj);
const parse = (s) => {
  try {
    return s == null ? null : JSON.parse(s);
  } catch {
    return undefined; // corrupt
  }
};

/** The stamps the fixture seeds (from the blob the game reads first: v2 if it parses, else v1). */
function seededStamps(fx) {
  const v2 = typeof fx.storage?.['progress.v2'] === 'string' ? parse(fx.storage['progress.v2']) : fx.storage?.['progress.v2'];
  const v1 = typeof fx.storage?.progress === 'string' ? parse(fx.storage.progress) : fx.storage?.progress;
  const src = isObj(v2) && v2.v === 2 ? v2 : isObj(v1) && v1.v === 1 ? v1 : null;
  return { stamps: isObj(src?.stamps) ? src.stamps : {}, challenges: isObj(src?.challenges) ? src.challenges : {}, isV2: src === v2 && !!src };
}

/**
 * @returns {{ failures: string[], notes: string[] }}
 */
export function checkFixture(fx, obs, phase = 'boot') {
  const failures = [];
  const notes = [];
  const fail = (m) => failures.push(m);
  const E = fx.expect ?? {};
  const S = obs.save;
  if (!S || !isObj(S)) return { failures: ['__academy.ext("save")() returned nothing'], notes };
  const D = S.data ?? {};
  const Q = S.quest ?? {};
  const kinds = S.kinds ?? {};
  const areaOf = (id) => id.split('.')[0];

  // ── adjustments for stations retired / re-goaled after the fixture was written ───────────────
  const seeded = seededStamps(fx);
  const fxRetired = new Set(fx.retired ?? []);
  const extra = (S.retired ?? []).filter((id) => !fxRetired.has(id) && id in seeded.stamps && !seeded.isV2);
  const extraEarned = extra.filter((id) => !(isObj(seeded.stamps[id]) && seeded.stamps[id].skipped));
  const touchedAreas = new Set(extra.map(areaOf));
  if (extra.length) notes.push(`adjusted for retired ${extra.join(', ')} (not in the fixture's own list)`);
  const revChanged = Object.entries(seeded.challenges)
    .filter(([k, r]) => S.revs && k in S.revs && (r?.rev ?? 1) !== S.revs[k])
    .map(([k]) => k);
  if (revChanged.length) notes.push(`adjusted for rev resets of ${revChanged.join(', ')}`);
  // ── storage invariants (every fixture) ──────────────────────────────────────────────────────
  if (obs.before && obs.after) {
    if (obs.after.v1 !== obs.before.v1) fail('the v1 blob changed (it must stay byte-identical, §3.5 rule 1/7)');
    const readOnly = E.readOnly ?? false;
    if (readOnly) {
      if (obs.after.v2 !== obs.before.v2) fail('read-only save, but the v2 key was written');
    } else if (E.v2Written !== false) {
      const v2 = parse(obs.after.v2);
      if (!isObj(v2) || v2.v !== 2) fail(`no v2 blob under ${V2_KEY} after the session`);
      else if (!Array.isArray(v2.secrets)) fail('the v2 blob has no secrets array');
    }
  }
  if (D.v !== 2) fail(`data.v = ${JSON.stringify(D.v)}, want 2`);
  if (!Array.isArray(D.secrets)) fail('data.secrets is not an array');

  // ── save fields ─────────────────────────────────────────────────────────────────────────────
  const eq = (name, got, want) => {
    if (want === undefined) return;
    if (!same(got, want)) fail(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  };
  if (E.source !== undefined) {
    // after the reload a migrated (or fresh, now written) save is read back as v2
    const want = phase === 'reload' && !E.readOnly && E.v2Written !== false ? 'v2' : E.source;
    eq('source', S.source, want);
  }
  eq('readOnly', !!S.readOnly, E.readOnly ?? false);
  const islandAdj = extraEarned.filter((id) => (kinds[areaOf(id)] ?? 'lobe') === 'lobe').length;
  if (E.islandStamps !== undefined) eq('islandStamps', S.islandStamps, E.islandStamps - islandAdj);
  if (E.allStamps !== undefined) eq('allStamps', S.allStamps, E.allStamps - extraEarned.length);
  const ids = (o) => Object.keys(isObj(o) ? o : {}).sort();
  if (E.legacyStamps !== undefined) eq('legacy.stamps', ids(D.legacy?.stamps), [...new Set([...E.legacyStamps, ...extra])].sort());
  if (E.legacyChallenges !== undefined) {
    const extraCh = extra.filter((id) => id in seeded.challenges);
    eq('legacy.challenges', ids(D.legacy?.challenges), [...new Set([...E.legacyChallenges, ...extraCh, ...revChanged])].sort());
  }
  if (E.legacyPredictions !== undefined && !extra.length && !revChanged.length) eq('legacy.predictions', ids(D.legacy?.predictions), [...E.legacyPredictions].sort());
  if (E.secrets !== undefined) eq('secrets', (D.secrets ?? []).length, E.secrets);
  if (E.mode !== undefined) eq('mode', D.mode, E.mode);

  // ── island keys ─────────────────────────────────────────────────────────────────────────────
  const W = D.zoneData?.world ?? {};
  for (const [k, v] of Object.entries(E.world ?? {})) {
    const want = k === 'logoShown' && typeof v === 'number' ? v - islandAdj : v;
    eq(`zoneData.world.${k}`, W[k], want);
  }
  for (const k of E.worldAbsent ?? []) if (k in W) fail(`zoneData.world.${k} should be gone`);
  for (const { path: p, value } of E.keep ?? []) eq(`data.${p.join('.')}`, at(D, p), value);

  // ── the quest snapshot ──────────────────────────────────────────────────────────────────────
  eq('flight', Q.flight?.state, E.flight);
  if (E.liftoffSeen !== undefined) eq('flight.liftoffSeen', Q.flight?.liftoffSeen, E.liftoffSeen);
  if (E.start) {
    if (E.start.glideSeen !== undefined) eq('start.glideSeen', Q.glideSeen, E.start.glideSeen);
    if (E.start.probestart !== undefined) eq('start.probestart', Q.probestart, E.start.probestart);
  }
  if (E.systems) {
    for (const [id, want] of Object.entries(E.systems)) {
      const area = S.systemAreas?.[id];
      if (area && touchedAreas.has(area)) {
        notes.push(`skipped systems.${id} (${area} has a retired station)`);
        continue;
      }
      eq(`systems.${id}`, Q.systems?.[id], want);
    }
  }
  if (touchedAreas.size) notes.push(`skipped lift and the gate flags (areas with a retired station: ${[...touchedAreas].join(', ')})`);
  else {
    eq('start.lift', Q.start?.lift, E.lift);
    for (const [k, v] of Object.entries(E.energy ?? {})) eq(`start.energy.${k}`, Q.start?.energy?.[k], v);
    for (const [k, v] of Object.entries(E.nav ?? {})) eq(`start.nav.${k}`, Q.start?.nav?.[k], v);
    eq('start.startklar', Q.start?.startklar, E.startklar);
    eq('armed', Q.armed, E.armed);
    eq('kielOpen', Q.kielOpen, E.kielOpen);
    eq('regionOpen', Q.regionOpen, E.regionOpen);
    if (E.crew !== undefined) eq('groundCrew', (Q.groundCrew ?? []).map((c) => `${c.id}:${c.reason}`).sort(), [...E.crew].sort());
  }
  eq('f3Signed', Q.f3Signed, E.f3Signed);
  eq('pool', S.pool, E.pool);
  if (E.stars !== undefined) {
    const touched = [...extra, ...revChanged].some((id) => (seeded.challenges[id]?.stars ?? 0) > 0);
    if (touched) notes.push('skipped stars (a starred record was retired or reset)');
    else eq('stars', S.stars, E.stars);
  }
  return { failures, notes };
}
