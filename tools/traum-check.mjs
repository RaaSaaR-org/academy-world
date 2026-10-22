#!/usr/bin/env node
// WP10 feature check (plan §5.10, §6.6 WP10): the Traumhangar's toy world model and the hangar in a
// production build.
//
//   node tools/traum-check.mjs [--seeds 200] [--no-browser] [--verbose]
//
// Node (the zone's own pure model, src/zones/traumhangar/model.ts + tuning.ts; WP1's mastery rule via
// Vite's SSR loader, like tools/quest-derive.mjs):
//   1. B's hump: the Messlauf (20 stratified runs per horizon) peaks at 2 s among 0,5 / 2 / 8 s for every
//      seed; the mean k per horizon is reported;
//   2. C: „Stillstand“ wins offline; the installed Flugmodell is the best closed-loop mix and never
//      Stillstand or the offline winner of the real mixes — for every seed × errors found × false flags;
//      the Kurzlauf's invariants (tools/traum/kurzlauf.mjs) hold;
//   3. the mastery gate (D21) from the shipped manifests: pool 84, need 63; closed at 62 ★ with ★★★ on
//      A–C, open at 63; closed at 84 ★ with ★★ on one of A–C; the Generalprobe never counts.
// Browser (a private production build, tools/lib/session.mjs):
//   4. the head camera is stable while the R1 walks (no gait bob: eye height σ ≤ 1 cm, the horizon level)
//      and the chase camera is the default under reduced motion;
//   5. consoles ≤ 35 words at open in German and English (pilot panels, desks, datasheets);
//   6. deliveries 'traumhangar:delivered' once per robot (R1, G1, H1-2) across repeated solves;
//   7. the C stamp installs the Flugmodell: NAV bereit by the player, T2 an, the needle light teal (WP12),
//      'traumhangar:flugmodell' with the installed mix (never Stillstand, never „alle“);
//   8. the gate in play: 62 ★ closed, 63 ★ open; the H2 ghost snaps into the real robot once; the H2 is
//      earned once ('quest:h2' exactly once, also after a reload);
//   9. played through the consoles (no solve hook): B's prediction + Messlauf, C's tiles → mix → offline →
//      reveal → trap → Prüfzelle; the unattended marks of that visit are saved for watch-audit
//      (artifacts/playtest/traum-check/unattended.json, read by `node tools/watch-audit.mjs`).
// Writes artifacts/phase7/traum-check.json. Exit 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZONE = path.join(ROOT, 'src', 'zones', 'traumhangar');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const SEEDS = Number(opt('seeds', 200));
const verbose = flag('verbose');

const results = [];
let failed = 0;
function check(group, name, ok, detail = '') {
  results.push({ group, name, ok: !!ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${group} · ${name}${detail ? ` — ${detail}` : ''}`);
}

const T = await import(pathToFileURL(path.join(ZONE, 'tuning.ts')).href);
const M = await import(pathToFileURL(path.join(ZONE, 'model.ts')).href);

// ── 1. B: the hump ──────────────────────────────────────────────────────────────────────────────
{
  const G = 'B hump';
  const sum = {};
  let peak2 = 0;
  const worst = [];
  for (let s = 1; s <= SEEDS; s++) {
    const rows = M.messlaufB(T.B, { seed: s, noise: T.DREAM.noise, agentNoise: T.DREAM.agentNoise, forgetS: T.DREAM.forgetS, horizons: T.DREAM.horizons });
    for (const r of rows) sum[r.horizon] = (sum[r.horizon] ?? 0) + r.k;
    if (M.bestHorizon(rows) === 2) peak2++;
    else worst.push(`seed ${s}: ${rows.map((r) => `${r.horizon} s ${r.k}/${r.n}`).join(', ')}`);
  }
  const mean = Object.fromEntries(Object.entries(sum).map(([h, k]) => [h, +(k / SEEDS).toFixed(1)]));
  check(G, `the Messlauf peaks at 2 s for every seed (${SEEDS} seeds)`, peak2 === SEEDS, `${peak2}/${SEEDS}; mean k/20: 0,5 s ${mean['0.5']} · 2 s ${mean['2']} · 8 s ${mean['8']}${worst.length ? `; ${worst.slice(0, 3).join(' | ')}` : ''}`);
  check(G, 'the hump: 2 s clearly above both neighbours on average', mean['2'] - Math.max(mean['0.5'], mean['8']) >= 4, `margin ${(mean['2'] - Math.max(mean['0.5'], mean['8'])).toFixed(1)} runs`);
  // the seed the station uses for its Entscheider preload and solve hook (seed 1): „85 % [64–95]“ shape
  const s1 = M.messlaufB(T.B, { seed: 1, noise: T.DREAM.noise, agentNoise: T.DREAM.agentNoise, forgetS: T.DREAM.forgetS, horizons: T.DREAM.horizons });
  const b1 = s1.find((r) => r.horizon === 2);
  const [p, lo, hi] = M.wilson(b1.k, b1.n);
  check(G, 'seed 1 (preload, solve hook) peaks at 2 s', M.bestHorizon(s1) === 2, `2 s ${b1.k}/20 = ${Math.round(p * 100)} % [${Math.round(lo * 100)}–${Math.round(hi * 100)}]`);
}

// ── 2. C: Stillstand, the installed mix ─────────────────────────────────────────────────────────
{
  const G = 'C mixes';
  check(G, '„Stillstand“ wins offline', M.offlineWinner(T.C, true) === 'stillstand', `bars ${M.offlineBars(T.C).map((b) => `${b.mix} ${b.error}`).join(', ')}`);
  const realWinner = M.offlineWinner(T.C, false);
  let bad = 0,
    n = 0;
  const firstBad = [];
  for (let s = 1; s <= SEEDS; s++)
    for (let found = 0; found <= T.C.errors; found++)
      for (let ff = 0; ff <= 3; ff++) {
        n++;
        const rows = M.pruefzelle(T.C, { seed: s, found, falseFlags: ff });
        const inst = M.installedMix(rows);
        const real = rows.filter((r) => r.mix !== 'stillstand');
        const best = real.reduce((a, b) => (b.k > a.k ? b : a));
        const ok = inst === best.mix && inst !== 'stillstand' && inst !== realWinner && rows.find((r) => r.mix === 'stillstand').k === 0;
        if (!ok) {
          bad++;
          if (firstBad.length < 3) firstBad.push(`seed ${s} found ${found} ff ${ff}: ${rows.map((r) => `${r.mix} ${r.k}`).join(' ')} → ${inst}`);
        }
      }
  check(G, 'the installed Flugmodell is the best closed-loop mix, never Stillstand, never the offline winner', bad === 0, `${n - bad}/${n} draws (offline winner of the real mixes: ${realWinner})${firstBad.length ? `; ${firstBad.join(' | ')}` : ''}`);
  const rows = M.pruefzelle(T.C, { seed: 1, found: T.C.errors, falseFlags: 0 });
  const gp = M.gainPp(rows, 'geprueft', 'echt');
  check(G, 'checked dreams beat real-only in the closed loop (seed 1, all errors found): the interval excludes 0', gp.lo > 0, `+${gp.pp} pp [${gp.lo}, ${gp.hi}] · n = ${gp.n}`);
}

// ── 3. the mastery gate (D21) from the shipped manifests (WP1's derivation) ──────────────────────
{
  const G = 'gate D21';
  globalThis.window ??= globalThis;
  const { createServer } = await import('vite');
  const server = await createServer({ root: ROOT, configFile: false, logLevel: 'error', resolve: { alias: { '@': path.join(ROOT, 'src') } }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const Q = await server.ssrLoadModule('/src/core/quest/index.ts');
    const dirs = fs.readdirSync(path.join(ROOT, 'src/zones')).filter((d) => !d.startsWith('_') && fs.existsSync(path.join(ROOT, 'src/zones', d, 'manifest.ts')));
    const manifests = [];
    for (const d of dirs.sort()) manifests.push({ ...(await server.ssrLoadModule(`/src/zones/${d}/manifest.ts`)).default, id: d });
    const hangar = manifests.find((m) => m.id === 'traumhangar');
    const ladder = hangar.stations.filter((s) => s.mastery !== false).map((s) => `traumhangar.${s.id}`);
    const pool = Q.pool(manifests);
    const need = Q.masteryNeed(pool);
    check(G, 'pool 84, need 63 (the Generalprobe never counts)', pool === 84 && need === 63 && hangar.stations.find((s) => s.id === 'generalprobe')?.mastery === false, `pool ${pool}, need ${need}`);
    // star maps: the ladder at ★★★ plus other stations filled up to n stars
    const others = manifests.flatMap((m) => m.stations.filter((s) => s.mastery !== false).map((s) => `${m.id}.${s.id}`)).filter((k) => !ladder.includes(k));
    const starsWith = (total, ladderStars = 3) => {
      const map = new Map(ladder.map((k) => [k, ladderStars]));
      let left = total - ladderStars * ladder.length;
      for (const k of [...others, 'world.f1']) {
        const s = Math.max(0, Math.min(3, left));
        map.set(k, s);
        left -= s;
      }
      return (k) => map.get(k) ?? 0;
    };
    const status = (stars) => Q.masteryStatus({ manifests, stars, earned: () => false, h2Unveiled: false });
    const s62 = status(starsWith(62));
    const s63 = status(starsWith(63));
    check(G, 'closed at 62 ★ with ★★★ on A–C', !s62.open && s62.stars === 62, `stars ${s62.stars}`);
    check(G, 'open at 63 ★ with ★★★ on A–C', s63.open && s63.stars === 63, `stars ${s63.stars}`);
    // ★★ on B only (the rest maxed): closed even at the highest reachable total
    const map = new Map([...others, 'world.f1'].map((k) => [k, 3]));
    for (const k of ladder) map.set(k, 3);
    map.set(ladder[1], 2);
    const s2 = status((k) => map.get(k) ?? 0);
    check(G, 'closed with ★★ on B whatever the total', !s2.open, `stars ${s2.stars}, ladder ${JSON.stringify(s2.ladder)}`);
    const h2 = Q.masteryStatus({ manifests, stars: (k) => (k === 'traumhangar.generalprobe' ? 3 : starsWith(63)(k)), earned: () => false, h2Unveiled: false });
    check(G, 'the Generalprobe stars do not count for the pool', h2.stars === 63, `stars ${h2.stars}`);
  } finally {
    await server.close();
  }
}

// ── 4–8. the hangar in a production build ────────────────────────────────────────────────────────
const countWords = (t) => String(t || '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
if (!flag('no-browser')) {
  process.env.PT_DIR = process.env.PT_DIR || path.join('phase7', 'traum-check');
  const { session } = await import('./lib/session.mjs');
  const { errors } = await session('traum-check', async (s) => {
    const solve = (h) => s.val(`__academy.solve('traumhangar','${h}')`);
    const st = () => s.val(`__academy.solve('traumhangar','state')`);
    await s.open('/?zone=traumhangar&skipIntro=1&reset=1&lang=de');
    await s.ev(`window.__tc = { delivered: [], fm: [], h2: 0, quest: [] };
      const G = __academy.game;
      G.events.on('traumhangar:delivered', (e) => window.__tc.delivered.push(e.robot));
      G.events.on('traumhangar:flugmodell', (e) => window.__tc.fm.push(e));
      G.events.on('quest:h2', () => window.__tc.h2++);`);
    await solve('tp-docks');
    // the robots stream in (the hangar is the deep-link area: they load before the Revier opens)
    for (let k = 0; k < 60; k++) {
      const r = (await st())?.robots;
      if (r && Object.values(r).every((x) => x.ready)) break;
      await s.wait(500);
    }
    const robots = (await st()).robots;
    check('setup', 'the four Unitree robots are in their docks', Object.values(robots).every((x) => x.ready), JSON.stringify(Object.fromEntries(Object.entries(robots).map(([k, v]) => [k, v.state]))));

    // the dream wall's shipped clips (clips.json) are the H1-2 model's own: a live recording matches them
    {
      const live = await solve('clips-bake');
      const baked = JSON.parse(fs.readFileSync(path.join(ZONE, 'clips.json'), 'utf8'));
      let worst = live && live.wagen?.length ? 0 : Infinity;
      for (const task of ['wagen', 'kiste'])
        (baked[task] ?? []).forEach((f, i) => f.kp.forEach((v, j) => (worst = Math.max(worst, Math.abs(v - (live?.[task]?.[i]?.kp?.[j] ?? Infinity))))));
      check('setup', 'clips.json matches a live recording of the H1-2 (≤ 1 mm)', worst <= 0.001, `max |Δ| ${Number.isFinite(worst) ? (worst * 1000).toFixed(2) + ' mm' : 'no recording'}`);
    }

    // 5. consoles at open (≤ 35 words, both languages)
    const panelWords = async (label, open, lang) => {
      await s.ev(`__academy.exitOperate(); __academy.closeModals();`);
      await s.wait(300);
      await open();
      await s.wait(1400);
      const text = await s.val(`(() => { const p = document.querySelector('.operate-panel'); return p ? p.innerText : null; })()`);
      const n = countWords(text);
      check('consoles', `${lang} ${label}: ${n} words at open (≤ 35)`, text != null && n <= 35, text == null ? 'no panel opened' : verbose ? text.replace(/\s+/g, ' ').slice(0, 160) : '');
      await s.ev(`__academy.solve('traumhangar','bot-off'); __academy.exitOperate(); __academy.closeModals();`);
      await s.wait(500);
    };
    const consoleRound = async (lang) => {
      await s.ev(`__academy.setLang('${lang}')`);
      await panelWords('Traumlabor (C, tiles)', () => solve('c-desk'), lang);
      await panelWords('Messstand (B, prediction)', () => solve('b-desk'), lang);
      for (const k of ['r1', 'g1', 'h12', 'h2']) await panelWords(`datasheet ${k}`, () => s.val(`__academy.interact('${lang === 'de' ? 'Datenblatt' : 'Datasheet'}: Unitree ${k === 'r1' ? 'R1' : k === 'g1' ? 'G1' : k === 'h12' ? 'H1-2' : 'H2'}')`), lang);
      await panelWords('A pilot (R1)', () => solve('a-start'), lang);
    };
    await consoleRound('de');

    // 4. the head camera while the R1 walks: no bob, a level horizon
    await s.ev(`__academy.exitOperate()`);
    await solve('a-start');
    await s.wait(2600);
    await solve('bot-walk');
    await s.wait(600);
    const cam = await s.val(`new Promise((done) => { const out = []; const t0 = performance.now(); const tick = async () => { const c = await __academy.solve('traumhangar','pilot-cam'); out.push(c); if (performance.now() - t0 < 2500) requestAnimationFrame(tick); else done(out); }; tick(); })`);
    await solve('bot-off');
    const ys = cam.map((c) => c.p[1]);
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    const sd = Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length);
    // roll from the quaternion (YXZ order): the camera's right vector stays horizontal
    const roll = Math.max(...cam.map(({ q: [x, y, z, w] }) => Math.abs(2 * (w * z + x * y)) / Math.max(1e-6, Math.hypot(1 - 2 * (y * y + z * z), 2 * (x * y + w * z)))));
    check('camera', 'the head camera does not bob while the R1 walks', sd <= 0.01 && cam.length > 20, `eye height σ ${(sd * 100).toFixed(2)} cm over ${cam.length} frames (mean ${mean.toFixed(2)} m)`);
    check('camera', 'the horizon stays level (no roll)', roll < 0.01, `max |roll| ${roll.toFixed(4)}`);
    const sChase = await st();
    check('camera', 'the head camera is the default (reduced motion off)', sChase.pilot.chase === false, `chase ${sChase.pilot.chase}`);
    await s.ev(`__academy.exitOperate()`);

    // 5b. played through the consoles (no solve hook): B's prediction + Messlauf, C's tiles → mix →
    // offline → reveal → trap → Prüfzelle. The unattended marks of these stretches go to watch-audit.
    const click = async (id) => {
      const ok = await s.val(`(() => { const b = document.querySelector('[data-th="${id}"]'); if (!b || b.disabled) return false; b.click(); return true; })()`);
      if (!ok) console.log(`  .. no button ${id}`);
      await s.wait(350);
      return ok;
    };
    await s.ev(`__academy.exitOperate(); __academy.closeModals();`);
    await solve('b-desk');
    await s.wait(900);
    const predOk = await click('b-pred-2');
    const runOk = await click('b-messlauf');
    for (let k = 0; k < 40; k++) {
      const b = (await st()).b;
      if (b?.measured) break;
      await s.wait(500);
    }
    const bm = (await st()).b;
    check('played', 'B: the Messlauf from the console measures the hump (2 s best)', predOk && runOk && bm?.measured?.best === 2, JSON.stringify(bm?.measured ?? null));
    await s.ev(`__academy.exitOperate(); __academy.closeModals();`);
    await s.wait(400);
    await solve('c-desk');
    await s.wait(1200);
    const errs = (await st()).c.tiles;
    for (let i = 0; i < errs.length; i++) {
      if (!errs[i]) continue;
      await solve(`c-tile-${i}`);
      await s.wait(300);
      await click('c-flag');
    }
    await click('c-filter');
    await click('c-mix-geprueft');
    await click('c-offline');
    await click('c-reveal');
    await click('c-trap');
    await click('c-skip-trial');
    await click('c-pruef');
    for (let k = 0; k < 30; k++) {
      if ((await st()).c.installed) break;
      await s.wait(500);
    }
    const cs = (await st()).c;
    check('played', 'C: tiles → mix → offline → Prüfzelle from the console installs „geprüft“', cs.installed && cs.mix === 'geprueft' && cs.found === 3 && cs.falseFlags === 0, JSON.stringify({ found: cs.found, falseFlags: cs.falseFlags, mix: cs.mix, installed: cs.installed, rows: cs.rows }));
    await s.wait(1500);
    await s.ev(`__academy.exitOperate(); __academy.closeModals();`);
    // 6. deliveries (A, B) and the B / probe consoles
    await solve('solve-a');
    await s.wait(800);
    await solve('solve-a');
    await panelWords('B pilot (G1)', () => solve('b-start'), 'de');
    await panelWords('Traum-Probefahrt (H2 ghost)', () => solve('h2-probe'), 'de');
    await solve('solve-b');
    await s.wait(800);
    await panelWords('C trial (H1-2)', async () => {
      await solve('solve-c');
      await s.wait(800);
      await s.ev(`__academy.closeModals()`);
      await solve('c-start');
    }, 'de');
    await solve('solve-b');
    await solve('solve-c');
    await s.wait(1500);
    const tc = await s.val(`window.__tc`);
    const once = (id) => tc.delivered.filter((x) => x === id).length;
    check('deliveries', "'traumhangar:delivered' once each: R1, G1, H1-2", once('unitree-r1') === 1 && once('unitree-g1') === 1 && once('unitree-h1-2') === 1, JSON.stringify(tc.delivered));

    // 7. the Flugmodell
    const q = await s.val(`__academy.quest()`);
    const fm = tc.fm[0];
    check('Flugmodell', 'NAV bereit by the player after the C stamp, T2 an', (q.start.nav.state === 'bereit' || q.start.nav.state === 'geprueft') && q.start.nav.by === 'player' && q.systems.T2 === 'an', `nav ${JSON.stringify(q.start.nav)}, T2 ${q.systems.T2}`);
    check('Flugmodell', "'traumhangar:flugmodell' names the installed mix: neither Stillstand nor the offline winner", !!fm && fm.mix !== 'stillstand' && fm.mix !== 'alle' && tc.fm.length === 1, JSON.stringify(tc.fm));

    // the needle light (WP12's nav lamp on the tower) turns teal once the island shows the Flugmodell
    {
      let scr = null;
      for (let k = 0; k < 30; k++) {
        scr = await s.val(`(() => { const f = __academy.ext('start'); return f ? f().screen : null; })()`);
        if (!scr || String(scr.needle).startsWith('teal')) break;
        await s.wait(500);
      }
      check('Flugmodell', 'the needle light is teal (WP12 start display; „teal-halo“ = geprüft)', !!scr && String(scr.needle).startsWith('teal'), scr ? `needle ${scr.needle}, nav lamp ${scr.navLamp}` : 'no start ext');
    }

    // 8. the gate in play: every island station at ★★★ = 54 + A–C 9 = 63 (F1 not flown)
    await s.ev(`for (const z of ['sensordom','regelgarten','greifwerkstatt','lern-dojo','dunkelfabrik','prueffeld']) for (const h of ['stars3-a','stars3-b','stars3-c']) { try { await __academy.solve(z, h); } catch (e) {} } __academy.closeModals();`);
    await s.wait(800);
    // one star short first: take a star of the Sensordom's A back by replaying it at ★★ is not possible
    // (best stars persist), so the 62 case is the Node check above; here: 63 opens, the snap plays once
    let m = (await s.val(`__academy.quest()`)).mastery;
    if (!m.open) {
      for (const h of ['stars3-a', 'stars3-b', 'stars3-c']) await solve(h);
      await s.wait(800);
      m = (await s.val(`__academy.quest()`)).mastery;
    }
    check('gate', 'open at 63 ★ with ★★★ on A–C (in play)', m.open && m.stars >= 63, `stars ${m.stars}/${m.pool}, need ${m.need}, ladder ${JSON.stringify(m.ladder)}`);
    await s.wait(800);
    const r2 = (await st()).robots.h2;
    check('gate', 'the H2 ghost snapped into the real robot', r2.state === 'docked', `h2 ${r2.state}`);
    await panelWords('H2 Generalprobe', () => solve('h2-start'), 'de');
    await solve('solve-4');
    await s.wait(600);
    await solve('stars3-4');
    await solve('solve-4');
    await s.wait(1200);
    const h2a = await s.val(`window.__tc.h2`);
    const m2 = (await s.val(`__academy.quest()`)).mastery;
    check('H2', "the H2 is earned once ('quest:h2' exactly once)", h2a === 1 && m2.h2Earned, `quest:h2 ×${h2a}, h2Earned ${m2.h2Earned}`);

    // English consoles (the same panels; the state now has every station stamped)
    await consoleRound('en');
    await panelWords('H2 Generalprobe', () => solve('h2-start'), 'en');
    await panelWords('B pilot (G1)', () => solve('b-start'), 'en');

    // the marks of this visit (game time; the reload below starts a new trace)
    {
      const run = await s.val(`({ marks: __academy.unattended(), end: __academy.game.time.elapsed })`);
      const mine = run.marks.filter((m) => m.owner === 'traumhangar' || /traumhangar/.test(m.owner ?? ''));
      const unDir = path.join(ROOT, 'artifacts', 'playtest', 'traum-check');
      fs.mkdirSync(unDir, { recursive: true });
      fs.writeFileSync(path.join(unDir, 'unattended.json'), JSON.stringify({ run: 'traum-check', lang: 'de', mode: 'entdecker', quick: false, marks: run.marks, timeline: [{ t: 0, kind: 'enter', area: 'traumhangar' }, { t: run.end, kind: 'exit', area: 'traumhangar' }], end: run.end }, null, 1));
      check('played', 'the played stretches left unattended marks for watch-audit', mine.length >= 2, `${mine.length} marks (${mine.map((m) => `${m.label} ${((m.t1 ?? run.end) - m.t0).toFixed(1)} s`).join(', ')}) → artifacts/playtest/traum-check/unattended.json`);
    }

    // after a reload: no second delivery, no second H2 event, the H2 stays real
    // (the same deep link without reset=1: the save stays)
    await s.page.goto(`${s.url0}/?zone=traumhangar&skipIntro=1&lang=de`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await s.page.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout: 90000, polling: 200 });
    await s.wait(1500);
    await s.ev(`window.__tc2 = { delivered: [], h2: 0 }; __academy.game.events.on('traumhangar:delivered', (e) => window.__tc2.delivered.push(e.robot)); __academy.game.events.on('quest:h2', () => window.__tc2.h2++);`);
    await s.ev(`await __academy.loadAll()`);
    await s.wait(2500);
    await solve('solve-a');
    await solve('solve-4');
    await s.wait(1200);
    const tc2 = await s.val(`window.__tc2`);
    check('reload', 'no delivery and no H2 event repeat after a reload', tc2.delivered.length === 0 && tc2.h2 === 0, JSON.stringify(tc2));

    // 4b. reduced motion: the chase camera is the default (a fresh context that prefers reduced motion)
    const browser = s.page.context().browser();
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
    const p2 = await ctx2.newPage();
    try {
      await p2.goto(`${s.url0}/?zone=traumhangar&skipIntro=1&reset=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await p2.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout: 90000, polling: 200 });
      for (let k = 0; k < 60; k++) {
        const ok = await p2.evaluate(async () => (await window.__academy.solve('traumhangar', 'state'))?.robots?.r1?.ready);
        if (ok) break;
        await p2.waitForTimeout(500);
      }
      await p2.evaluate(() => window.__academy.solve('traumhangar', 'a-start'));
      await p2.waitForTimeout(1500);
      const rm = await p2.evaluate(async () => ({ rm: window.__academy.game.settings.data.reducedMotion, st: (await window.__academy.solve('traumhangar', 'state')).pilot }));
      check('camera', 'reduced motion: the chase camera is the default', rm.rm === true && rm.st.chase === true, JSON.stringify(rm));
    } finally {
      await ctx2.close();
    }
  });
  check('browser', 'no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
}

const out = path.join(ROOT, 'artifacts', 'phase7', 'traum-check.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), seeds: SEEDS, failed, results }, null, 1));
console.log(failed ? `FAIL traum-check: ${failed} of ${results.length} checks failed` : `OK   traum-check: ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
