#!/usr/bin/env node
// WP1 feature check (plan §5.10, §6.5 WP1): the quest spine's derivations in Node, without a browser.
//
//   node tools/quest-derive.mjs [--verbose]
//
// Loads the real modules through Vite's SSR loader (no build, no server port): every shipped area
// manifest (src/zones/*/manifest.ts), src/core/quest, src/systems/Progress.ts and, when present, the
// save migration. Seeds stamps, stars, modes and the Bodencrew into a real Progress + QuestSpine and
// checks §3.1 / §3.3 / D21 / D23: rotor states, regionOpen, kielOpen, armed, the Startakku charge,
// the Entscheider supply, the scopes, the mastery gate (62 closed, 63 open of 84), the resume rule
// and every save fixture of tools/fixtures/saves through the migration. The ◆ ids are read from the
// manifests (system / trim / ◆), never hard-coded; the D23 names are only cross-checked.
// Exit 1 on any failure. Writes artifacts/phase7/quest-derive.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verbose = process.argv.includes('--verbose');

// ── a minimal browser for the modules (localStorage, timers) ──────────────────────────────────────
class MemStorage {
  constructor() {
    this.m = new Map();
  }
  get length() {
    return this.m.size;
  }
  key(i) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    this.m.set(k, String(v));
  }
  removeItem(k) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
globalThis.window ??= globalThis;
window.localStorage = new MemStorage();
window.sessionStorage = new MemStorage();
const quiet = console.warn;

const { createServer } = await import('vite');
const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  resolve: { alias: { '@': path.join(ROOT, 'src') } },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});

const results = [];
let failed = 0;
function check(group, name, ok, detail = '') {
  results.push({ group, name, ok: !!ok, detail });
  if (!ok) failed++;
  if (!ok || verbose) console.log(`${ok ? '  ok  ' : '  FAIL'} ${group} · ${name}${detail ? ` — ${detail}` : ''}`);
}

try {
  const load = (p) => server.ssrLoadModule(p);
  const Q = await load('/src/core/quest/index.ts');
  const { Progress } = await load('/src/systems/Progress.ts');
  const { EventBus } = await load('/src/core/EventBus.ts');
  const resume = await load('/src/core/quest/resume.ts').catch(() => null);
  const migrateMod = await load('/src/systems/migrate.ts').catch(() => null);

  const dirs = fs.readdirSync(path.join(ROOT, 'src/zones')).filter((d) => !d.startsWith('_') && fs.existsSync(path.join(ROOT, 'src/zones', d, 'manifest.ts')));
  const manifests = [];
  for (const d of dirs.sort()) manifests.push({ ...(await load(`/src/zones/${d}/manifest.ts`)).default, id: d });
  const byId = new Map(manifests.map((m) => [m.id, m]));
  const defs = Q.systemDefs(manifests);
  const def = (id) => defs.find((d) => d.id === id);
  const key = (d) => `${d.areaId}.${d.station}`;
  const stationsOf = (areaId) => byId.get(areaId).stations.filter((s) => s.mastery !== false).map((s) => `${areaId}.${s.id}`);
  const lifts = defs.filter((d) => d.group === 'lift');
  const AKKU = def('AKKU');
  const NAV = def('NAV');

  // ── the table itself (manifests → systems) ───────────────────────────────────────────────────────
  {
    const G = 'table';
    check(G, 'six lift systems M1–M6 from the lobe manifests', lifts.length === 6 && lifts.every((d) => byId.get(d.areaId)?.kind === 'lobe'), lifts.map((d) => `${d.id}=${key(d)}`).join(' '));
    check(G, 'AKKU is the Sonnenacker ◆ (D23 names sonnenacker.erntetag)', AKKU && key(AKKU) === 'sonnenacker.erntetag', AKKU ? key(AKKU) : 'missing');
    check(G, 'NAV is the Traumhangar ◆ (D23 names traumhangar.traumdaten)', NAV && key(NAV) === 'traumhangar.traumdaten', NAV ? key(NAV) : 'missing');
    check(G, 'AKKU and NAV: crewIn entscheider', AKKU?.crewIn?.join() === 'entscheider' && NAV?.crewIn?.join() === 'entscheider');
    const trims = defs.filter((d) => d.group === 'trim');
    check(G, 'four trims; T2/T3 share the NAV/AKKU ◆', trims.length === 4 && key(def('T2')) === key(NAV) && key(def('T3')) === key(AKKU), trims.map((d) => `${d.id}=${key(d)}`).join(' '));
    check(G, 'systems in SYSTEM_ORDER', defs.map((d) => d.id).join() === Q.SYSTEM_ORDER.filter((id) => defs.some((d) => d.id === id)).join());
    check(G, 'the pool reads 84 from the manifests', Q.pool(manifests) === 84, String(Q.pool(manifests)));
    check(G, 'the H2 gate needs 63', Q.masteryNeed(Q.pool(manifests)) === 63);
  }

  // ── a fresh Progress + spine per scenario ──────────────────────────────────────────────────────
  const fresh = (o = {}) => {
    window.localStorage.clear();
    const events = new EventBus();
    const P = new Progress(events);
    P.areaKind = (id) => byId.get(id)?.kind ?? 'lobe';
    if (o.mode) P.setMode(o.mode);
    const spine = new Q.QuestSpine({ progress: P, events, params: { flight: o.flight ?? null, liftoff: !!o.liftoff }, manifests });
    const log = [];
    for (const ev of ['quest:system', 'quest:charge', 'quest:kiel-open', 'quest:region-open', 'quest:startklar', 'quest:armed', 'quest:mastery-open', 'quest:h2', 'flight:state'])
      events.on(ev, (p) => log.push({ ev, ...(p ?? {}) }));
    const stamped = [];
    events.on('stamp:awarded', (p) => stamped.push(p));
    const award = (k, o2) => P.awardStamp(k, o2);
    const stars = (k, n) => P.recordChallenge(k, null, 'higher', n);
    const signF3 = () => {
      P.setZoneValue('world', 'finale', { visited: true, f3: { rec: 'pilot', reasons: [], alt: '', sentence: { de: '', en: '' } } });
      spine.refresh();
    };
    return { P, events, spine, log, stamped, award, stars, signF3, s: () => spine.snapshot() };
  };

  // ── rotors (§3.1) ─────────────────────────────────────────────────────────────────────────────
  {
    const G = 'rotors';
    const t = fresh({ mode: 'entdecker' });
    const M1 = def('M1');
    const [a, b] = stationsOf(M1.areaId).filter((k) => k !== key(M1));
    check(G, 'fresh: every rotor kalt, lift 0, Revier closed', lifts.every((d) => t.s().systems[d.id] === 'kalt') && t.s().start.lift === 0 && !t.s().regionOpen);
    t.award(a, { skipped: true });
    check(G, 'a skipped stamp is not earned (still kalt)', t.spine.system('M1') === 'kalt');
    t.award(a);
    check(G, 'first earned stamp → in Arbeit', t.spine.system('M1') === 'arbeit' && t.s().start.lift === 0);
    t.award(key(M1));
    check(G, '◆ earned → bereit; the Revier opens at 1/6', t.spine.system('M1') === 'bereit' && t.s().start.lift === 1 && t.s().regionOpen);
    check(G, 'quest:region-open fired once', t.log.filter((e) => e.ev === 'quest:region-open').length === 1);
    t.award(b);
    check(G, 'all three → geprüft (by player)', t.spine.system('M1') === 'geprueft');
    for (const d of lifts.slice(1, 3)) t.award(key(d));
    check(G, '3/6: KIEL still closed', t.s().start.lift === 3 && !t.s().kielOpen);
    t.award(key(lifts[3]));
    check(G, '4/6: KIEL opens', t.s().start.lift === 4 && t.s().kielOpen && t.log.filter((e) => e.ev === 'quest:kiel-open').length === 1);
    const sys = t.log.filter((e) => e.ev === 'quest:system' && e.id === 'M1').map((e) => `${e.from}→${e.to}`);
    check(G, 'quest:system M1: kalt→arbeit→bereit→geprueft', sys.join(' ') === 'kalt→arbeit arbeit→bereit bereit→geprueft', sys.join(' '));
    const up = fresh({ mode: 'entdecker', flight: 'airborne' });
    up.award(key(M1));
    check(G, 'airborne: the Revier gate stays closed (regionOpen needs flight = ground)', up.s().start.lift === 1 && !up.s().regionOpen);
    const k = fresh({});
    k.P.setZoneValue('world', 'finale', { visited: true });
    k.spine.refresh();
    check(G, 'KIEL is open once the finale was visited', k.s().kielOpen);
  }

  // ── the Bodencrew (§5.8) ──────────────────────────────────────────────────────────────────────
  {
    const G = 'crew';
    const t = fresh({ mode: 'entdecker' });
    t.spine.groundCrew('M4', 'asset');
    check(G, 'groundCrew(M4, asset): bereit without a stamp, by crew', t.spine.system('M4') === 'bereit' && t.s().start.lift === 1 && t.s().groundCrew.some((c) => c.id === 'M4' && c.reason === 'asset'));
    t.spine.groundCrew('AKKU', 'asset');
    check(G, 'groundCrew(AKKU): bereit by crew, charge 1', t.s().start.energy.state === 'bereit' && t.s().start.energy.by === 'crew' && t.s().start.energy.charge === 1);
    t.spine.groundCrew('NAV', 'timing');
    check(G, 'groundCrew(NAV, timing): bereit by crew', t.s().start.nav.state === 'bereit' && t.s().start.nav.by === 'crew');
    t.award(key(def('M4')));
    check(G, "earning the ◆ replaces the crew line (by player, no crew entry)", t.spine.system('M4') === 'bereit' && !t.s().groundCrew.some((c) => c.id === 'M4'));
    for (const s of stationsOf(def('M4').areaId)) t.award(s);
    check(G, 'a crew-supplied system never gets the halo; earned stamps do', t.spine.system('M4') === 'geprueft');
  }

  // ── the gate (D23) ────────────────────────────────────────────────────────────────────────────
  {
    const G = 'gate';
    const t = fresh({ mode: 'entdecker' });
    t.spine.markProbestart();
    for (const d of lifts) t.award(key(d));
    t.signF3();
    check(G, 'Entdecker 6/6 + F3: not startklar, not armed (AKKU, NAV kalt)', t.s().start.lift === 6 && !t.s().start.startklar && !t.s().armed && t.s().f3Signed);
    const farm = stationsOf(AKKU.areaId).filter((k2) => k2 !== key(AKKU));
    t.award(farm[0]);
    check(G, 'one Sonnenacker stamp: charge ⅓, AKKU in Arbeit', Math.abs(t.s().start.energy.charge - 1 / 3) < 1e-9 && t.s().start.energy.state === 'arbeit');
    t.award(farm[1]);
    check(G, 'two: charge ⅔', Math.abs(t.s().start.energy.charge - 2 / 3) < 1e-9);
    check(G, 'quest:charge fired per stamp', t.log.filter((e) => e.ev === 'quest:charge').length === 2);
    t.award(key(AKKU));
    check(G, 'the ◆ (erntetag): charge 1, AKKU geprüft by player (all three)', t.s().start.energy.charge === 1 && t.s().start.energy.by === 'player' && t.s().start.energy.state === 'geprueft');
    check(G, 'T3 ignites with the AKKU ◆', t.spine.system('T3') === 'an');
    check(G, 'still unarmed without NAV', !t.s().armed && !t.s().start.startklar);
    const before = t.log.length;
    t.award(key(NAV));
    check(G, 'the NAV ◆ (traumdaten): startklar and armed', t.s().start.startklar && t.s().armed && t.s().start.nav.by === 'player');
    const evs = t.log.slice(before).map((e) => e.ev + (e.id ? ':' + e.id : ''));
    check(G, 'events: NAV and T2 system, then startklar, then armed', evs.indexOf('quest:startklar') > evs.indexOf('quest:system:NAV') && evs.indexOf('quest:armed') > evs.indexOf('quest:startklar') && evs.includes('quest:system:T2'), evs.join(' '));
    // only the ◆ alone (one stamp) is enough for AKKU bereit
    const one = fresh({ mode: 'entdecker' });
    one.award(key(AKKU));
    check(G, 'the ◆ alone: AKKU bereit, charge 1', one.s().start.energy.state === 'bereit' && one.s().start.energy.charge === 1);
    // crew instead of the ground ◆ in Entdecker (asset fallback)
    const c = fresh({ mode: 'entdecker' });
    for (const d of lifts) c.award(key(d));
    c.signF3();
    c.spine.groundCrew('AKKU', 'asset');
    c.spine.groundCrew('NAV', 'asset');
    check(G, 'Entdecker 6/6 + F3 with AKKU/NAV crewed (asset): armed', c.s().armed);
    // trims never gate
    const tr = fresh({ mode: 'entdecker' });
    for (const d of defs.filter((x) => x.group === 'trim')) tr.award(key(d));
    check(G, 'all four trims an: not startklar (trims never gate)', defs.filter((x) => x.group === 'trim').every((d) => tr.spine.system(d.id) === 'an') && !tr.s().start.startklar && tr.s().start.lift === 0);
  }

  // ── Entscheider: the Bodencrew supplies AKKU and NAV after the Probestart (D23) ──────────────────
  {
    const G = 'entscheider';
    const t = fresh({ mode: 'entscheider' });
    check(G, 'before the Probestart: AKKU and NAV kalt', t.s().start.energy.state === 'kalt' && t.s().start.nav.state === 'kalt');
    t.spine.markProbestart();
    check(G, 'after the Probestart: AKKU and NAV bereit, by crew, reason route', t.s().start.energy.by === 'crew' && t.s().start.nav.by === 'crew' && t.s().start.energy.charge === 1 && t.s().groundCrew.map((x) => `${x.id}:${x.reason}`).sort().join() === 'AKKU:route,NAV:route');
    for (const d of lifts) t.award(key(d));
    check(G, '6/6: startklar, not armed before F3', t.s().start.startklar && !t.s().armed);
    t.signF3();
    check(G, '6/6 + F3 arms', t.s().armed);
    t.award(key(NAV));
    check(G, "an earned ground ◆ turns by to 'player' (Entscheider)", t.s().start.nav.by === 'player' && t.s().start.energy.by === 'crew');
    const flightBefore = t.s().flight.state;
    t.P.setMode('entdecker');
    check(G, 'mode switch → Entdecker: the route supply goes (AKKU kalt), NAV stays the player’s', t.s().start.energy.state === 'kalt' && t.s().start.nav.by === 'player' && !t.s().armed);
    t.P.setMode('entscheider');
    check(G, 'mode switch back: the supply returns at once', t.s().start.energy.by === 'crew' && t.s().armed);
    check(G, 'a mode switch never changes the flight', t.s().flight.state === flightBefore);
    const air = fresh({ mode: 'entscheider' });
    air.spine.setFlight('airborne', { liftoffSeen: true });
    air.P.setMode('entdecker');
    check(G, 'an airborne island stays airborne across a mode switch', air.s().flight.state === 'airborne' && air.s().flight.liftoffSeen && air.s().flight.firstFlightAt != null);
    const ed = fresh({ mode: 'entdecker' });
    ed.award(key(AKKU));
    ed.P.setMode('entscheider');
    ed.spine.markProbestart();
    check(G, "an earned ground ◆ stays 'player' in Entscheider too", ed.s().start.energy.by === 'player' && ed.s().start.nav.by === 'crew');
  }

  // ── the Entscheider timing fallback (§5.8, R5 §4.2; tuning.ts, off in the MUST build) ─────────────
  {
    const G = 'timing';
    const { ENTSCHEIDER_TIMING_CREW } = await load('/src/core/quest/tuning.ts');
    check(G, 'off in the MUST build (tuning.ts: [])', Array.isArray(ENTSCHEIDER_TIMING_CREW) && ENTSCHEIDER_TIMING_CREW.length === 0);
    const base = { manifests, stamp: () => null, stars: () => 0, finale: null, store: { ...Q.emptyQuestStore(), start: { glideSeen: true, probestart: true } }, timingCrew: ['M5', 'M6'] };
    const e = Q.deriveQuest({ ...base, mode: 'entscheider' });
    check(G, 'Entscheider after the Probestart: M5, M6 bereit by the crew (timing)', e.systems.M5 === 'bereit' && e.systems.M6 === 'bereit' && e.start.lift === 2 && e.groundCrew.filter((c) => c.reason === 'timing').map((c) => c.id).join() === 'M5,M6');
    const d = Q.deriveQuest({ ...base, mode: 'entdecker' });
    check(G, 'Entdecker: no timing crew', d.start.lift === 0 && !d.groundCrew.length);
    const b = Q.deriveQuest({ ...base, mode: 'entscheider', store: Q.emptyQuestStore() });
    check(G, 'before the Probestart: none', b.start.lift === 0);
  }

  // ── scopes (§3.4, D37): farm stamps leave the tower, „n von 18“ and the melody alone ────────────────
  {
    const G = 'scopes';
    const t = fresh({ mode: 'entdecker' });
    t.award(key(def('M1')));
    const n0 = t.P.earnedStamps();
    const ids0 = t.P.stamps().length;
    for (const k2 of stationsOf(AKKU.areaId)) t.award(k2);
    const farmEvents = t.stamped.slice(1);
    check(G, "earnedStamps() (island) unchanged by farm stamps", t.P.earnedStamps() === n0 && n0 === 1);
    check(G, "earnedStamps({ scope: 'all' }) counts them", t.P.earnedStamps({ scope: 'all' }) === 4);
    check(G, '„n von 18“ (stamps(), island) unchanged', t.P.stamps().length === ids0);
    check(G, 'melody index (stamp:awarded n) and the tower count (earned) unchanged by farm stamps', farmEvents.length === 3 && farmEvents.every((e) => e.n === 1 && e.earned === 1), JSON.stringify(farmEvents.map((e) => [e.n, e.earned])));
    check(G, 'earnedInZone works for sites', t.P.earnedInZone(AKKU.areaId) === 3);
  }

  // ── mastery (D21): 62 closed, 63 open, ★★★ on the ladder ─────────────────────────────────────────
  {
    const G = 'mastery';
    const hangar = Q.masteryArea(manifests);
    const ladder = hangar.stations.filter((s) => s.mastery !== false).slice(0, 3).map((s) => `${hangar.id}.${s.id}`);
    const others = [Q.F1_KEY, ...manifests.flatMap((m) => m.stations.filter((s) => s.mastery !== false).map((s) => `${m.id}.${s.id}`)).filter((k2) => !ladder.includes(k2))];
    const seed = (t, total, ladderStars = 3) => {
      let left = total;
      for (const k2 of ladder) {
        t.stars(k2, ladderStars);
        left -= ladderStars;
      }
      for (const k2 of others) {
        if (left <= 0) break;
        const n = Math.min(3, left);
        t.stars(k2, n);
        left -= n;
      }
      t.spine.refresh();
    };
    check(G, 'the ladder is the hangar A, B, C (NAV area)', hangar.id === 'traumhangar' && ladder.length === 3, ladder.join(' '));
    const a = fresh({});
    seed(a, 62);
    check(G, '62 of 84 with ★★★ A–C: closed', a.s().mastery.stars === 62 && !a.s().mastery.open && a.s().mastery.need === 63 && a.s().mastery.pool === 84);
    const b = fresh({});
    seed(b, 63);
    check(G, '63 of 84 with ★★★ A–C: open', b.s().mastery.stars === 63 && b.s().mastery.open);
    check(G, 'quest:mastery-open fired', b.log.some((e) => e.ev === 'quest:mastery-open'));
    const c = fresh({});
    seed(c, 70, 2);
    check(G, '70 stars but ★★ on the ladder: closed', c.s().mastery.stars === 70 && !c.s().mastery.open);
    const d = fresh({});
    seed(d, 62);
    const h2 = hangar.stations.find((s) => s.mastery === false);
    d.stars(`${hangar.id}.${h2.id}`, 3);
    d.spine.refresh();
    check(G, 'the Generalprobe’s own stars never count (still 62, closed), but earn the H2', d.s().mastery.stars === 62 && !d.s().mastery.open && d.s().mastery.h2Earned);
    check(G, 'F1 (world.f1) counts for the pool stars', (() => {
      const e = fresh({});
      e.stars(Q.F1_KEY, 3);
      return e.s().mastery.stars === 3;
    })());
  }

  // ── flight, marks, ?liftoff=1 ─────────────────────────────────────────────────────────────────
  {
    const G = 'flight';
    const t = fresh({});
    check(G, 'flight starts ground', t.s().flight.state === 'ground' && t.s().flight.firstFlightAt == null);
    t.spine.setFlight('airborne', { liftoffSeen: true });
    check(G, 'setFlight(airborne): firstFlightAt set, flight:state emitted', t.s().flight.state === 'airborne' && t.s().flight.firstFlightAt > 0 && t.log.some((e) => e.ev === 'flight:state' && e.state === 'airborne'));
    const first = t.s().flight.firstFlightAt;
    t.spine.setFlight('ground');
    t.spine.setFlight('airborne');
    check(G, 'firstFlightAt and liftoffSeen persist across a dock switch', t.s().flight.firstFlightAt === first && t.s().flight.liftoffSeen);
    check(G, 'markBeat: true once, then false', t.spine.markBeat('M1') === true && t.spine.markBeat('M1') === false && t.spine.markBeat('6of6') === true);
    const p = fresh({ flight: 'airborne' });
    check(G, '?flight=airborne applies for the session', p.s().flight.state === 'airborne');
    const l = fresh({ mode: 'entdecker', liftoff: true });
    check(G, '?liftoff=1: startklar, F3 signed, armed, KIEL open', l.s().start.startklar && l.s().armed && l.s().f3Signed && l.s().kielOpen);
  }

  // ── the resume rule and the title (§3.6, D26) ─────────────────────────────────────────────────
  if (resume?.planFor) {
    const G = 'resume';
    const base = { params: { skipIntro: false, zone: null, pos: null, world: true }, ascentSeen: false, reducedMotion: false, devReload: false, lastZone: null, canResumeAt: () => true, hasProgress: false, stamps: 0, glideSeen: false, flight: 'ground', frameOf: (id) => byId.get(id)?.frame ?? null, rotors: 0 };
    const p = (o, x) => resume.planFor({ ...base, ...o }, x);
    const first = p({});
    check(G, 'first visit: the glide, the bridge head (no zone)', first.glide && !first.skipAscent && first.zone == null);
    const back = p({ hasProgress: true, stamps: 4, lastZone: 'regelgarten', glideSeen: true });
    check(G, 'returning grounded: no glide, the last area', !back.glide && back.zone === 'regelgarten');
    const ground = p({ hasProgress: true, lastZone: 'sonnenacker', glideSeen: true });
    check(G, 'returning grounded, last area on the ground: resume there', ground.zone === 'sonnenacker' && ground.flight === 'ground');
    const airIsland = p({ hasProgress: true, lastZone: 'prueffeld', flight: 'airborne', glideSeen: true });
    check(G, 'returning airborne, last area aboard: resume there', airIsland.zone === 'prueffeld' && airIsland.flight === 'airborne');
    const airGround = p({ hasProgress: true, lastZone: 'traumhangar', flight: 'airborne', glideSeen: true });
    check(G, 'returning airborne, last area on the ground: the plaza (0, 0, 26)', airGround.zone == null && JSON.stringify(airGround.pos) === '[0,0,26]');
    const dock = p({ hasProgress: true, lastZone: 'traumhangar', flight: 'airborne', glideSeen: true }, { dock: true });
    check(G, '„Im Dock weiterspielen“: ground, resume at the last area', dock.flight === 'ground' && dock.zone === 'traumhangar');
    check(G, '?skipIntro / ?zone / ?pos / dev reload: no glide, no resume', [{ params: { ...base.params, skipIntro: true } }, { params: { ...base.params, zone: 'sensordom' } }, { devReload: true }].every((o) => !p({ hasProgress: true, lastZone: 'regelgarten', ...o }).glide && p({ hasProgress: true, lastZone: 'regelgarten', ...o }).zone == null));
    check(G, 'a glide watched without progress: returning (no second glide)', !p({ glideSeen: true }).glide);
    const ts = (o) => resume.titleFor({ ...base, ...o });
    check(G, 'title: first', ts({}).state === 'first' && !ts({}).offersDock && !ts({}).offersReplay);
    check(G, 'title: grounded with progress (n stamps, m rotors)', ts({ hasProgress: true, stamps: 5, rotors: 2 }).state === 'grounded' && ts({ hasProgress: true, stamps: 5, rotors: 2 }).rotors === 2);
    check(G, 'title: airborne offers „Im Dock weiterspielen“ and „Abheben ansehen“', ts({ hasProgress: true, flight: 'airborne' }).state === 'airborne' && ts({ hasProgress: true, flight: 'airborne' }).offersDock && ts({ hasProgress: true, flight: 'airborne' }).offersReplay);
    check(G, '„Anflug ansehen“ is retired', !ts({ hasProgress: true, ascentSeen: true }).offersApproach);
  } else console.log('  skip resume: src/core/quest/resume.ts has no planFor/titleFor yet');

  // ── the save fixtures through the migration (tools/fixtures/saves) ───────────────────────────────
  if (migrateMod?.revisit) {
    const G = 'fixtures';
    const { loadFixtures, seedEntries, checkFixture, V1_KEY, V2_KEY } = await import(path.join(ROOT, 'tools/fixtures/saves/check.mjs'));
    const { RETIRED } = await load('/src/systems/retired.ts');
    const { saveReport } = await load('/src/core/quest/report.ts');
    // the scenarios above left debounced saves behind: let them land before the fixtures seed the storage
    await new Promise((r) => setTimeout(r, 200));
    console.warn = () => undefined; // the corrupt fixture logs once, by design
    for (const fx of loadFixtures()) {
      window.localStorage.clear();
      for (const [k, v] of Object.entries(seedEntries(fx))) window.localStorage.setItem(k, v);
      const before = { v1: window.localStorage.getItem(V1_KEY), v2: window.localStorage.getItem(V2_KEY) };
      const retired = [...new Set([...RETIRED, ...(fx.retired ?? [])])];
      const boot = migrateMod.migrateAtBoot(manifests, retired);
      const events = new EventBus();
      const P = new Progress(events);
      P.areaKind = (id) => byId.get(id)?.kind ?? 'lobe';
      const mode = /mode=(\w+)/.exec(fx.params ?? '')?.[1];
      if (mode) P.setMode(mode);
      const spine = new Q.QuestSpine({ progress: P, events, params: { flight: null }, manifests });
      const r1 = checkFixture(fx, { save: saveReport({ boot, progress: P, quest: spine, manifests }), before, after: null }, 'boot');
      // the v2 session: one persistent change, the debounced save, a "reload"
      P.setZoneValue('world', 'p7.test', 1);
      await new Promise((r) => setTimeout(r, 120));
      const after = { v1: window.localStorage.getItem(V1_KEY), v2: window.localStorage.getItem(V2_KEY) };
      const boot2 = migrateMod.migrateAtBoot(manifests, retired);
      const P2 = new Progress(new EventBus());
      P2.areaKind = P.areaKind;
      const spine2 = new Q.QuestSpine({ progress: P2, events: new EventBus(), params: { flight: null }, manifests });
      const r2 = checkFixture(fx, { save: saveReport({ boot: boot2, progress: P2, quest: spine2, manifests }), before, after }, 'reload');
      const fails = [...r1.failures.map((f) => `boot: ${f}`), ...r2.failures.map((f) => `reload: ${f}`)];
      check(G, `${fx.file} (${fx.rule})`, !fails.length, fails.join('; ') || [...new Set([...r1.notes, ...r2.notes])].join('; '));
    }
    console.warn = quiet;
    // the pure function: idempotent on its own output, never mutates its input
    const fx = loadFixtures().find((f) => f.name === 'rc4-mid');
    const raw = JSON.parse(JSON.stringify(fx.storage.progress));
    const frozen = JSON.stringify(raw);
    const once = migrateMod.migrate(raw, manifests, RETIRED);
    check(G, 'migrate() leaves its input untouched', JSON.stringify(raw) === frozen);
    const twice = migrateMod.revisit(JSON.parse(JSON.stringify(once)), manifests, RETIRED);
    check(G, 'revisit(migrate(x)) === migrate(x) (idempotent)', JSON.stringify(twice) === JSON.stringify(once));
    // rev resets (rule 4) with a test manifest: rev 2 on the Lern-Dojo B
    const revManifests = manifests.map((m) => (m.id === 'lern-dojo' ? { ...m, stations: m.stations.map((s) => (s.id === 'nachmachen' || s.id === 'datensatz-audit' ? { ...s, rev: 2 } : s)) } : m));
    const v1 = { v: 1, mode: 'entdecker', stamps: { 'lern-dojo.nachmachen': { t: 1 } }, visited: {}, zoneData: {}, predictions: { 'lern-dojo.datensatz-audit': { predicted: 1, measured: 2, min: 0, max: 10, scale: 'linear', deviation: 10 } }, questions: [], album: [], best: {}, challenges: { 'lern-dojo.nachmachen': { best: 4, stars: 2, attempts: 3, last: 4, t: 1 } }, collectibles: [] };
    const rv = migrateMod.migrate(v1, revManifests, []);
    const rec = rv.challenges['lern-dojo.nachmachen'];
    check(G, 'rule 4: a record with another rev loses stars, best and attempts; the stamp stays', rec.stars === 0 && rec.best == null && rec.attempts === 0 && rec.rev === 2 && !!rv.stamps['lern-dojo.nachmachen'], JSON.stringify(rec));
    check(G, 'rule 4: the old record is kept in legacy (shown as „rc4: ★★“)', rv.legacy?.challenges?.['lern-dojo.nachmachen']?.stars === 2);
    check(G, 'rule 4: the prediction of a re-goaled station goes to legacy', !rv.predictions['lern-dojo.datensatz-audit'] && !!rv.legacy?.predictions?.['lern-dojo.datensatz-audit']);
    const rv2 = migrateMod.revisit(JSON.parse(JSON.stringify(rv)), revManifests, []);
    check(G, 'rule 4: a reset record (rev 2) is not reset again', JSON.stringify(rv2.challenges) === JSON.stringify(rv.challenges));
  } else console.log('  skip fixtures: src/systems/migrate.ts does not migrate yet');
} catch (err) {
  console.warn = quiet;
  check('run', 'no exception', false, err?.stack ?? String(err));
} finally {
  await server.close();
}

const out = path.join(ROOT, 'artifacts', 'phase7');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'quest-derive.json'), JSON.stringify({ at: new Date().toISOString(), failed, results }, null, 2));
const groups = [...new Set(results.map((r) => r.group))];
for (const g of groups) {
  const rs = results.filter((r) => r.group === g);
  console.log(`${rs.every((r) => r.ok) ? 'PASS' : 'FAIL'}  ${g.padEnd(12)} ${rs.filter((r) => r.ok).length}/${rs.length}`);
}
console.log(failed ? `quest-derive: ${failed} check(s) failed` : `quest-derive: all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
