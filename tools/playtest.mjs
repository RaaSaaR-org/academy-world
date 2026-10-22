#!/usr/bin/env node
// Full-route playtest of the production build (integration QA; docs/PHASE7-PLAN.md §5.10). Builds a
// private copy of dist/, serves it with `vite preview` (immune to source edits during the run), loads
// every area (__academy.loadAll) and drives one session:
//
//   1. the start: Pass-Terminal, the Probestart (WP12's world:probestart hook or the Libelle lever;
//      until WP12 lands the quest's markProbestart() with a warning);
//   2. the mode's ROUTE, from the manifests (StationManifest.route): Entdecker every main and side
//      station of every area with code, the Sonnenacker, the Schauhalle and the Traumhangar included;
//      Entscheider the six-◆ loop with the Schaufenster stop (schauhalle) after the Regelgarten. Per
//      area: walk in through the gate (not with --quick), the solve hooks of the route's stations
//      (solve-a/b/c by station order, album), ≥ 1 ★ per stamped station, stamp + result merged into one
//      banner, leave, no zone HUD card or status line left at the hub;
//   3. the THREE SYSTEMS of D23 after the route: Entdecker 6 rotors + AKKU + NAV from the player's
//      stamps (by 'player'); Entscheider 6 rotors, AKKU and NAV by the Bodencrew (by 'crew'). AKKU and
//      NAV checks of a site without code yet are reported as pending (WP9, WP10), not failed;
//   4. the rest of every area (solve hooks of the stations off the route) and the stars3 hooks:
//      every registered station challenge at ★★★, island stamps 18 (scope 'island'), the star pool
//      read from the manifests (84 in the MUST build), 0 info cards that opened by themselves
//      (Entdecker), question cards 9, every registered album entry;
//   5. the Startprüfung: KIEL lift, F1 (bot hand; --quick the solve hook), F2 + F3, then the lift-off
//      when WP13's hooks exist (world:liftoff full, world:liftoff-skip with --quick; flight airborne
//      afterwards), else the rc4 dusk ending (finale:ended exactly once); the certificate. Phase 7
//      (WP13): „Ein Jahr später“ is the certificate's optional „Erstflug-Protokoll“ (no longer after F3);
//      the certificate's front carries „Erstflug …“ and the Startakku/Flugmodell line („selbst“ when the
//      player brought them online, „von der Bodencrew“ when the crew did: Entscheider), its back side
//      „Was du unten gesehen hast“ with the closing line (__academy.ext('finale:certificate')).
//
//   node tools/playtest.mjs [--lang de|en] [--mode entdecker|entscheider] [--quick] [--save tools/fixtures/saves/<f>.json] [--secrets none|all]
//
// --secrets all finds every registered secret first (secrets never gate, D35; secret-audit runs both).
// --quick: solve hooks only, short waits, no screenshots (≤ 6 min). --save seeds a save fixture
// (WP1's format: `storage` under the 'emai-academy-island/v1:' prefix, `params`) and plays on from it.
// Screenshots, log.json and unattended.json (the marks of ctx.game.unattended with the area timeline,
// for tools/watch-audit.mjs) go to artifacts/playtest/route-<lang>-<mode>[-<save>]/. Exit 1 on a console
// or page error, a missing stamp, a leaked panel, a system in the wrong state or an unfinished finale.
import fs from 'node:fs';
import path from 'node:path';
import { session } from './lib/session.mjs';
import { ROOT, parseArgs } from './lib/shotlib.mjs';

const args = parseArgs(process.argv.slice(2));
const lang = String(args.lang ?? 'de');
const mode = String(args.mode ?? 'entdecker');
const quick = !!args.quick;
const saveFile = args.save && args.save !== true ? path.resolve(ROOT, String(args.save)) : null;
/** The MUST build's star pool (§3.1): 3 × 27 stations + F1. */
const EXPECTED_POOL = Number(args.pool ?? 84);
const ISLAND_STAMPS = 18;
const LOBES_ENTDECKER = ['sensordom', 'regelgarten', 'greifwerkstatt', 'lern-dojo', 'dunkelfabrik', 'prueffeld'];
const LOBES_ENTSCHEIDER = ['dunkelfabrik', 'prueffeld', 'regelgarten', 'lern-dojo', 'sensordom', 'greifwerkstatt'];
const problems = [];
const pending = [];
const W = (ms) => (quick ? Math.min(ms, Math.max(400, ms * 0.45)) : ms);

let fixture = null;
if (saveFile) {
  if (!fs.existsSync(saveFile)) {
    console.error(`playtest: no save fixture ${path.relative(ROOT, saveFile)}`);
    process.exit(2);
  }
  fixture = JSON.parse(fs.readFileSync(saveFile, 'utf8'));
}
const PREFIX = 'emai-academy-island/v1:';
const seedEntries = (fx) => Object.fromEntries(Object.entries(fx?.storage ?? {}).map(([k, v]) => [PREFIX + k, typeof v === 'string' ? v : JSON.stringify(v)]));
const runName = `route-${lang}-${mode}${saveFile ? `-${path.basename(saveFile, '.json')}` : ''}`;

const { errors } = await session(runName, async (s) => {
  if (fixture) {
    await s.page.addInitScript(([entries]) => {
      try {
        if (sessionStorage.getItem('__pt_seeded')) return;
        for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
        sessionStorage.setItem('__pt_seeded', '1');
      } catch (e) {
        /* storage blocked */
      }
    }, [seedEntries(fixture)]);
  }
  const extra = fixture?.params ? `&${fixture.params}` : '';
  await s.open(`/?${fixture ? '' : 'reset=1&'}skipIntro=1&lang=${lang}&mode=${mode}${extra}`);
  await s.wait(1500);
  if (args.secrets === 'all') {
    const n = await s.val(`(() => { const S = __academy.game.gameLayer?.secrets; if (!S || !S.defs) return 0; for (const id of S.defs.keys()) S.find(id); return S.found().length; })()`);
    s.log('SECRETS', `${n} found up front (--secrets all)`);
  }
  // the area timeline in game time (watch-audit) and the finale:ended counter
  await s.ev(`window.__pt = { timeline: [], ended: 0 };
    const G = __academy.game;
    G.events.on('finale:ended', () => window.__pt.ended++);
    G.events.on('zone:enter', (e) => window.__pt.timeline.push({ t: G.time.elapsed, kind: 'enter', area: e.id }));
    G.events.on('zone:exit', (e) => window.__pt.timeline.push({ t: G.time.elapsed, kind: 'exit', area: e.id }));`);
  const manifests = await s.val(`__academy.manifests('all').map((m) => ({ id: m.id, kind: m.kind, hasCode: m.hasCode, system: m.system ?? null, stations: m.stations.map((st) => ({ id: st.id, star: !!st.star, rev: st.rev ?? null, mastery: st.mastery !== false, route: st.route ?? null })) }))`);
  const byId = Object.fromEntries(manifests.map((m) => [m.id, m]));
  const role = (st) => st.route?.[mode] ?? (mode === 'entdecker' || st.star ? 'main' : 'skip');
  const acts = new Set(await s.val(`__academy.debugActions()`));
  const quest = () => s.val(`(__academy.quest ? __academy.quest() : __academy.game.quest?.snapshot?.()) ?? null`);

  // ── 1. start: Pass-Terminal, Probestart ─────────────────────────────────────────────────────
  await s.ev(`__academy.teleport([0,0,26],{yaw:0,pitch:-5})`);
  await s.wait(quick ? 4000 : 12000);
  await s.ev(`__academy.teleport([4,0,6],{yaw:0,pitch:0})`);
  await s.wait(1000);
  await s.val(`__academy.interact('Pass')`);
  await s.wait(800);
  await s.ev(`__academy.closeModals()`);
  if (acts.has('world:probestart')) await s.val(`__academy.solve('world','probestart')`);
  else {
    const lever = await s.val(`__academy.interact('Probestart')`);
    if (!lever) {
      const did = await s.val(`(() => { const q = __academy.game.quest; if (!q || !q.markProbestart) return false; q.markProbestart(); return true; })()`);
      pending.push(`Probestart: no world:probestart hook and no Libelle lever yet (WP12)${did ? '; used quest.markProbestart()' : ''}`);
    }
  }
  await s.wait(W(2500));
  await s.ev(`__academy.closeModals()`);
  await s.state('after-start');

  // ── 2. the mode's route ─────────────────────────────────────────────────────────────────────
  const letter = (i) => 'abc'[i] ?? String(i + 1);
  const solved = new Set();
  const albumDone = new Set();
  async function playArea(z, stationIds, { walk = !quick, label = '' } = {}) {
    const m = byId[z];
    if (!m?.hasCode) {
      pending.push(`${z}: no code yet, skipped (${label || 'route'})`);
      return;
    }
    await s.ev(`__academy.teleport('${z}')`);
    await s.wait(W(1200));
    if (walk) {
      // walk through the gate: zone:enter, onEnter (Prüffeld hands out question cards 1 and 3 here)
      await s.ev(`__academy.press('KeyW', 1400)`);
      await s.wait(2200);
      await s.shot(`${z}-enter`);
    } else {
      // the zone becomes current only inside its gate (the merged result banner needs it)
      await s.ev(`__academy.press('KeyW', 1400)`);
      await s.wait(1800);
    }
    await s.state(`${z} enter${label ? ` (${label})` : ''}`);
    const hooks = stationIds.map((id) => `solve-${letter(m.stations.findIndex((st) => st.id === id))}`);
    // stations stamped before this visit (a seeded save, --save): their solve shows no new stamp
    const stampedBefore = await s.val(`__academy.pass().stamps.filter(x => [${stationIds.map((id) => `'${z}.${id}'`).join(',')}].includes(x.id) && x.record && !x.record.skipped).length`);
    // the album entry once every station of the area is solved (rc4: after solve-a/b/c)
    const allSolved = m.stations.every((st) => stationIds.includes(st.id) || solved.has(`${z}.${st.id}`));
    if (allSolved && acts.has(`${z}:album`) && !albumDone.has(z)) {
      hooks.push('album');
      albumDone.add(z);
    }
    for (const h of hooks) {
      if (!acts.has(`${z}:${h}`)) {
        problems.push(`${z}: no ${h} hook`);
        continue;
      }
      await s.val(`__academy.solve('${z}','${h}')`);
      await s.wait(quick ? 1600 : 2200);
      const st = await s.state(`${z} ${h}`);
      if (st.modal || st.infoCard) {
        if (!quick) await s.shot(`${z}-${h}`);
        await s.ev(`__academy.closeModals()`);
        await s.wait(400);
      }
      if (st.operating) await s.ev(`__academy.exitOperate()`);
    }
    for (const id of stationIds) solved.add(`${z}.${id}`);
    const got = await s.val(`__academy.pass().stamps.filter(x => [${stationIds.map((id) => `'${z}.${id}'`).join(',')}].includes(x.id) && x.record && !x.record.skipped).length`);
    if (got !== stationIds.length) problems.push(`${z}: ${got}/${stationIds.length} stamps after ${hooks.join(', ')}`);
    // game layer: every stamped station has ≥ 1 ★, and the stamp + result showed as ONE banner
    const zs = await s.val(`__academy.stars().byZone['${z}']`);
    const noStar = Object.entries(zs?.byStation ?? {}).filter(([k, v]) => stationIds.includes(k) && v < 1).map(([k]) => k);
    if (!zs || noStar.length) problems.push(`${z}: stations without ★ after the solve hooks: ${noStar.join(', ') || 'no stars data'}`);
    // a merged stamp + result banner needs a NEW stamp in this visit
    if (stampedBefore < stationIds.length) {
      const merged = await s.val(`__academy.gameUi().log.filter(l => l.key.startsWith('${z}.') && l.merged).length`);
      if (merged < 1) problems.push(`${z}: no merged stamp + result banner after the solve hooks`);
    }
    await s.ev(`__academy.teleport([0,0,40],{yaw:0,pitch:0})`);
    await s.wait(W(2500));
    const leak = await s.val(`[...document.querySelectorAll('#panels > *')].filter(e=>e.offsetParent!==null && getComputedStyle(e).display!=='none').map(e=>e.textContent.trim().slice(0,60))`);
    if (leak.length) problems.push(`${z}: HUD cards still visible at the hub: ${JSON.stringify(leak)}`);
    const st = await s.state(`${z} left`);
    if (st.status) problems.push(`${z}: status line leaked to the hub: ${st.status}`);
  }

  const routeOf = (z) => (byId[z]?.stations ?? []).filter((st) => role(st) !== 'skip').map((st) => st.id);
  const lobes = mode === 'entscheider' ? LOBES_ENTSCHEIDER : LOBES_ENTDECKER;
  const route = [];
  if (mode === 'entdecker') {
    route.push(...lobes);
    // the ground and hall areas of the Entdecker route (D23: the Sonnenacker and the Traumhangar ◆)
    for (const m of manifests) if (!lobes.includes(m.id) && !m.id.startsWith('_') && routeOf(m.id).length) route.push(m.id);
  } else {
    // the six-◆ loop; the Schaufenster stop after the Regelgarten (D41)
    for (const z of lobes) {
      route.push(z);
      if (z === 'regelgarten' && byId.schauhalle) route.push('schauhalle');
    }
  }
  s.log('ROUTE', mode, route.map((z) => `${z}[${routeOf(z).join(',') || (z === 'schauhalle' ? 'Schaufenster' : '-')}]`).join(' → '));
  for (const z of route) {
    const ids = routeOf(z);
    if (!ids.length) {
      // the Schaufenster stop has no station of its own: a visit
      if (byId[z]?.hasCode) {
        await s.ev(`__academy.teleport('${z}')`);
        await s.wait(W(2500));
        // Request(WP7) by WP11: the hall's bot plays the stop at a person's pace (plan §1.4, §4.9: the
        // Größenwand, the G1 datasheet, three Kurzlauf stands); ≤ 3.0 min, all three Befundkarten in the set
        const hasBot = await s.val(`typeof __academy.ext === 'function' && typeof __academy.ext('${z === 'schauhalle' ? 'schaufenster' : '-'}') === 'function'`);
        if (z === 'schauhalle' && hasBot) {
          const r = await s.val(`__academy.ext('schaufenster')()`);
          s.log('SCHAUFENSTER', JSON.stringify(r));
          if (!r || !(r.seconds <= 180)) problems.push(`schauhalle: the Schaufenster took ${r?.seconds} s by bot (≤ 180)`);
          for (const id of ['belohnung', 'erntetag', 'traumdaten']) if (!r?.befunde?.includes(id)) problems.push(`schauhalle: Befundkarte „${id}“ not in the PNG set`);
          await s.ev(`__academy.closeModals(); __academy.exitOperate()`);
          if (!quick) await s.shot('schaufenster');
        }
        await s.state(`${z} (stop)`);
      } else pending.push(`${z}: no code yet, the ${z === 'schauhalle' ? 'Schaufenster' : ''} stop skipped`);
      continue;
    }
    await playArea(z, ids, { label: 'route' });
  }

  // ── 3. the three systems (D23) after the route ──────────────────────────────────────────────
  {
    const q = await quest();
    if (!q) problems.push('quest: no quest snapshot (__academy.quest / game.quest)');
    else {
      s.log('SYSTEMS', JSON.stringify(q.start), 'crew', JSON.stringify(q.groundCrew));
      if (q.start.lift !== 6) problems.push(`systems: AUFTRIEB ${q.start.lift}/6 after the route (want 6)`);
      const want = mode === 'entdecker' ? 'player' : 'crew';
      for (const [sys, area, wp] of [['energy', 'sonnenacker', 'WP9'], ['nav', 'traumhangar', 'WP10']]) {
        const st = q.start[sys];
        const ready = st.state === 'bereit' || st.state === 'geprueft';
        if (mode === 'entdecker' && !byId[area]?.hasCode) {
          pending.push(`systems: ${sys === 'energy' ? 'AKKU' : 'NAV'} from the ${area} ◆ pending (${area} has no code yet, ${wp}); state ${st.state}`);
          continue;
        }
        if (!ready || st.by !== want) problems.push(`systems: ${sys === 'energy' ? 'AKKU' : 'NAV'} ${st.state} by ${st.by} after the route (want bereit by ${want})`);
      }
      const sitesReady = byId.sonnenacker?.hasCode && byId.traumhangar?.hasCode;
      if (mode === 'entscheider' || sitesReady) {
        if (!q.start.startklar) problems.push('systems: not Startklar after the route');
      } else if (q.start.startklar) problems.push('systems: Startklar without the Sonnenacker and Traumhangar ◆ in Entdecker mode (D23)');
      for (const [id, st] of Object.entries(q.systems)) if (/^M\d$/.test(id) && st !== 'bereit' && st !== 'geprueft') problems.push(`systems: rotor ${id} ${st} after the route`);
    }
  }

  // ── 4. the rest of every area, then ★★★ everywhere ──────────────────────────────────────────
  for (const m of manifests) {
    if (m.id.startsWith('_') || !m.hasCode) continue;
    const rest = m.stations.map((st) => st.id).filter((id) => !solved.has(`${m.id}.${id}`));
    if (rest.length) await playArea(m.id, rest, { walk: false, label: 'off the route' });
  }
  for (const m of manifests) {
    if (m.id.startsWith('_') || !m.hasCode) continue;
    for (let i = 0; i < m.stations.length; i++) {
      const h = `stars3-${letter(i)}`;
      if (!acts.has(`${m.id}:${h}`)) {
        if (m.stations[i].mastery) problems.push(`${m.id}: no ${h} hook`);
        continue;
      }
      await s.val(`__academy.solve('${m.id}','${h}')`);
      await s.wait(quick ? 300 : 600);
      await s.ev(`__academy.closeModals(); __academy.exitOperate()`);
    }
  }
  await s.wait(800);
  const stars = await s.val(`__academy.stars()`);
  const challenges = await s.val(`__academy.challenges().filter(c => c.station)`);
  const short = challenges.filter((c) => c.stars < 3).map((c) => `${c.key} ${c.stars}★`);
  s.log('STARS', JSON.stringify({ total: stars.total, max: stars.max, stations: challenges.length }));
  if (short.length) problems.push(`stars: stations below ★★★ after the stars3 hooks: ${short.join(', ')}`);
  if (stars.total !== stars.max) problems.push(`stars: ${stars.total}/${stars.max} after the stars3 hooks`);
  const q4 = await quest();
  if (q4) {
    s.log('POOL', JSON.stringify({ pool: q4.mastery.pool, need: q4.mastery.need, stars: q4.mastery.stars }));
    const fromManifests = 3 + manifests.reduce((a, m) => a + 3 * m.stations.filter((st) => st.mastery).length, 0);
    if (q4.mastery.pool !== fromManifests) problems.push(`pool: quest ${q4.mastery.pool} ≠ ${fromManifests} from the manifests`);
    if (q4.mastery.pool !== EXPECTED_POOL) problems.push(`pool: ${q4.mastery.pool} (the MUST build has ${EXPECTED_POOL}; --pool <n> after a cut)`);
  }
  const island = await s.val(`__academy.game.progress.earnedStamps({ scope: 'island' })`);
  if (island !== ISLAND_STAMPS) problems.push(`island stamps: ${island}/${ISLAND_STAMPS} (scope 'island')`);
  if (mode === 'entdecker') {
    const auto = await s.val(`__academy.cards().filter(c => !c.requested).map(c => c.title)`);
    if (auto.length) problems.push(`${auto.length} info card(s) opened by themselves in Entdecker mode: ${JSON.stringify(auto)}`);
  }
  const pass = await s.val(`__academy.pass()`);
  const lobeIds = new Set(manifests.filter((m) => m.kind === 'lobe').map((m) => m.id));
  const n = pass.stamps.filter((x) => x.record && lobeIds.has(x.id.split('.')[0])).length;
  s.log('PASS', JSON.stringify({ stamps: pass.stamps.filter((x) => x.record).length, island: n, prognoseGuete: pass.prognoseGuete, questions: pass.questions, album: pass.album }));
  if (n !== ISLAND_STAMPS) problems.push(`pass: ${n}/${ISLAND_STAMPS} island stamps`);
  // the album entries the loaded areas registered (rc4: one per lobe; Phase 7 areas may add, e.g. the Lern-Dojo's two)
  const albumTotal = await s.val(`(() => { const d = __academy.game.progress.albumDefs; if (!d) return 6; const ids = new Set(__academy.manifests('all').map((m) => m.id)); return [...d.values()].filter((a) => ids.has(a.zoneId)).length; })()`);
  if (pass.album.length !== albumTotal) problems.push(`album: ${pass.album.length}/${albumTotal}`);
  if (pass.questions.length !== 9) problems.push(`question cards: ${pass.questions.length}/9 (${pass.questions.join(', ')})`);

  // ── 5. the Startprüfung, the lift-off, the certificate ──────────────────────────────────────
  await s.ev(`__academy.teleport([0,0,-7.5],{yaw:180,pitch:0})`);
  await s.wait(1200);
  const kiel = await s.val(`__academy.interact('${lang === 'de' ? 'KIEL' : 'KEEL'}')`);
  if (!kiel) problems.push('lift: KIEL button not found');
  await s.wait(3000);
  if (!quick) await s.shot('lift-ride');
  await s.wait(6500);
  const keel = await s.state('keel');
  if (keel.pos[1] > -30) problems.push(`lift: player not in the keel (y = ${keel.pos[1]})`);
  if (!quick) await s.shot('keel');
  await s.ev(`await __academy.solve('world','finale-f1-bot')`);
  if (quick) {
    // the bot hand flies F1 for real (the ★ result counts for the pool); poll for its result
    for (let k = 0; k < 40; k++) {
      await s.wait(1000);
      const r = await s.val(`__academy.challenges().find(c => c.key === 'world.f1') ?? null`);
      if (r && (r.stars > 0 || r.last != null)) break;
    }
    await s.wait(1500);
  } else {
    await s.wait(9000);
    await s.shot('f1');
    await s.wait(14000);
    await s.shot('f1-result');
  }
  await s.ev(`__academy.closeModals(); __academy.exitOperate()`);
  await s.wait(1200);
  const f1 = await s.val(`__academy.challenges().find(c => c.key === 'world.f1') ?? null`);
  s.log('F1', JSON.stringify(f1));
  if (!f1 || f1.stars < 1) problems.push(`F1: no ★ result (${JSON.stringify(f1)})`);
  await s.val(`__academy.solve('world','finale-f2-solve')`);
  await s.wait(800);
  await s.val(`__academy.solve('world','finale-f3-solve')`);
  await s.wait(2500);
  if (!quick) await s.shot('f3-year-later');
  await s.wait(quick ? 4000 : 9000);
  const year = await s.val(`__academy.solve('world','finale-state')`);
  // Phase 7 (WP13): „Ein Jahr später“ became the certificate's optional „Erstflug-Protokoll“
  const phase7Finale = acts.has('world:liftoff') || acts.has('world:liftoff-skip');
  if (!phase7Finale && (!year || !year.yearLater)) problems.push(`F3: „Ein Jahr später" did not run (${JSON.stringify(year)})`);
  if (phase7Finale && !year?.f3) problems.push(`F3: not signed (${JSON.stringify(year).slice(0, 120)})`);
  await s.ev(`__academy.closeModals()`);
  await s.wait(500);
  const qa = await quest();
  if (qa) {
    const armedWanted = mode === 'entscheider' || (byId.sonnenacker?.hasCode && byId.traumhangar?.hasCode);
    if (armedWanted && !qa.armed) problems.push(`lift-off: not armed after F3 (startklar ${qa.start.startklar}, f3Signed ${qa.f3Signed})`);
    if (!armedWanted && qa.armed) problems.push('lift-off: armed without AKKU and NAV in Entdecker mode (D23)');
  }
  const liftoffHook = quick && acts.has('world:liftoff-skip') ? 'liftoff-skip' : acts.has('world:liftoff') ? 'liftoff' : null;
  if (liftoffHook) {
    // Phase 7 (WP13): the lift-off ends airborne
    await s.val(`__academy.solve('world','${liftoffHook}')`);
    await s.wait(2000);
    const qf = await quest();
    if (qf?.flight.state !== 'airborne') problems.push(`lift-off: flight ${qf?.flight.state} after world:${liftoffHook} (want airborne)`);
    if (!qf?.flight.liftoffSeen && liftoffHook === 'liftoff') problems.push('lift-off: liftoffSeen not set after the full lift-off');
    if (!quick && acts.has('world:liftoff-skip')) s.log('lift-off: full run; the skip runs with --quick');
    if (acts.has('world:finale-certificate')) {
      await s.ev(`__academy.solve('world','finale-certificate')`);
      await s.wait(1500);
    }
  } else {
    pending.push('lift-off: no world:liftoff / world:liftoff-skip hooks yet (WP13); ran the rc4 dusk ending');
    await s.ev(`__academy.solve('world','finale-ending')`);
    for (let k = 0; k < (quick ? 20 : 6); k++) {
      await s.wait(quick ? 2000 : 6000);
      if (!quick) {
        await s.state('ending');
        await s.shot('ending');
      } else if ((await s.val(`__academy.solve('world','finale-state')`))?.ended) break;
    }
    await s.wait(4000);
    // the certificate opens at the end of the ending
    for (let k = 0; quick && k < 30 && (await s.state('ending')).modal !== 'custom'; k++) await s.wait(1500);
    const fin = await s.val(`__academy.solve('world','finale-state')`);
    s.log('finale', JSON.stringify(fin));
    if (!fin || !fin.ended) problems.push('finale: not ended');
    const ended = await s.val(`window.__pt.ended`);
    if (ended !== 1) problems.push(`finale:ended fired ${ended}× (expected exactly once)`);
  }
  const cert = await s.state('certificate');
  if (cert.modal !== 'custom') problems.push('certificate: overlay not open');
  await s.shot('certificate');
  // Phase 7 (WP13, plan §4.14, §2.8): the certificate's front and back side
  const lines = await s.val(`typeof __academy.ext('finale:certificate') === 'function' ? __academy.ext('finale:certificate')('${lang}') : null`);
  if (!lines) {
    if (liftoffHook) problems.push('certificate: no finale:certificate hook (WP13)');
  } else {
    s.log('certificate', JSON.stringify(lines));
    const de = lang === 'de';
    const front = lines.front.join(' | ');
    const back = lines.back.join(' | ');
    if (!(de ? /Erstflug: .+ · \d\/6 Rotoren selbst gemessen/ : /First flight: .+ · \d\/6 rotors measured by you/).test(front)) problems.push(`certificate: no first-flight line (${front.slice(0, 160)})`);
    const qc = await quest();
    const want = (by, self, crew) => (by === 'player' ? self : by === 'crew' ? crew : null);
    for (const [k, by, self, crew] of [
      ['Startakku', qc?.start.energy.by, de ? 'Startakku: selbst geladen' : 'Start battery: charged by you', de ? 'Startakku: von der Bodencrew' : 'Start battery: by the ground crew'],
      ['Flugmodell', qc?.start.nav.by, de ? 'Flugmodell: selbst geprüft' : 'Flight model: checked by you', de ? 'Flugmodell: von der Bodencrew' : 'Flight model: by the ground crew'],
    ]) {
      const w = want(by, self, crew);
      if (!w) pending.push(`certificate: ${k} not online (its site has no code yet: WP9/WP10)`);
      else if (!front.includes(w)) problems.push(`certificate: „${w}“ missing (${front.slice(0, 200)})`);
    }
    // (an Entscheider who also played the optional Sonnenacker or Traumhangar detour reads „selbst“ there, D23)
    if (!(de ? /Was du unten gesehen hast/ : /What you saw down there/).test(back) || !(de ? /Vollautomatisch heißt nicht menschenleer/ : /Fully automated does not mean empty of people/).test(back)) problems.push(`certificate: the back side is incomplete (${back.slice(0, 200)})`);
  }

  // ── unattended marks for watch-audit ────────────────────────────────────────────────────────
  const marks = await s.val(`({ marks: typeof __academy.unattended === 'function' ? __academy.unattended() : [], timeline: window.__pt.timeline, end: __academy.game.time.elapsed })`);
  const revs = Object.fromEntries(manifests.flatMap((m) => m.stations.filter((st) => st.rev != null).map((st) => [`${m.id}.${st.id}`, st.rev])));
  fs.writeFileSync(path.join(s.outDir, 'unattended.json'), JSON.stringify({ run: runName, lang, mode, quick, ...marks, revs }, null, 1));
});

for (const p of pending) console.log('PENDING', p);
for (const p of problems) console.log('PROBLEM', p);
const ok = errors.length === 0 && problems.length === 0;
console.log(ok ? `OK   playtest passed${pending.length ? ` (${pending.length} pending: content of later WPs)` : ''}` : `FAIL ${errors.length} errors, ${problems.length} problems`);
process.exit(ok ? 0 : 1);
