#!/usr/bin/env node
// Life and easter eggs (docs/PHASE7-PLAN.md §4.12, §4.13, §6.6 WP15; feature check of WP15, §5.10).
//
//   node tools/life-check.mjs [--dist <dir> | --dev] [--skip-gather]
//
// One production build in Chromium (headless, real GPU); the life chunk is loaded first
// (__academy.ext('life:load')). Checks:
//   chunk      the life runtime loads; its agents ≤ 64 (§4.12 caps); the director's own time per tick
//              ≤ 0.25 ms (indicative here: the authoritative number is perf-cpu's)
//   clock      the Hof-Takt runs on game time: it advances while playing and stands still while paused
//              (the director does not run while paused, §5.9 [C1 m8])
//   tiers      at the bridge head its area is near and the farm's is far; at the Hofladen the reverse;
//              airborne above 300 m every ground area is hidden
//   people     eight people with jobs (D18); a rotor beat ('life:react' rotor) makes the visible ones wave
//   ledger     life's main-pass draws at the Hofladen forecourt and the field (the farm view): ≤ 20 (§5.5
//              „Sonnenacker C … life ≤ 20“; the official view sonnenacker-c needs WP9's hook)
//   gather     armed + on the Ausguck (or 'life:react' gather): the mechanic, the two visitors (and the
//              Sonnenacker's people once it is stamped) stand at the apron edge inside the outside shot C1
//              (WP3's ground:camera pose at t 28 s), the dock crew member at the Ausguck rail (§4.12, §4.15)
//   eggs       every island egg's trigger finds its secret; the Fundvitrine objects build, ≤ 300 triangles
//   misses     a 'sonnenacker:shift' miss puts a fruit on the vine for the Nachlese pickers
// Writes artifacts/<PT_DIR|measure>/life-check.json. Exit 1 on a miss.
import { Verdict, gameServer, launchChromium, openGame, parseArgs, saveJson, round } from './lib/measure.mjs';
import { DRAWS_BY_OWNER } from './lib/drawcalls.mjs';

const args = parseArgs(process.argv.slice(2));
const v = new Verdict('life-check');
const out = {};
const srv = await gameServer(args);
const browser = await launchChromium();
try {
  const { page, errors } = await openGame(browser, `${srv.url}/?reset=1&skipIntro=1&lang=de&mode=entdecker`, { instrument: false });
  const ev = (code) => page.evaluate(`(async () => { ${code} })()`);
  const W = (ms) => page.waitForTimeout(ms);
  await ev(`__academy.start(); await __academy.ext('life:load')();`);
  await W(1500);
  const life = () => ev(`return __academy.ext('life')()`);

  // ── chunk, caps, the clock and the pause ──
  let s = await life();
  out.start = s;
  v.require('the life runtime loaded', !!s && s.agents > 0, JSON.stringify(s?.pending ?? ''));
  v.check('life agents (cap §4.12)', s.agents, '<=', 64);
  const t0 = s.clock.t;
  await W(2000);
  const t1 = (await life()).clock.t;
  v.check('the Hof-Takt advances while playing (s in 2 s)', round(t1 - t0, 2), '>=', 1.5);
  await ev(`__academy.pause()`);
  await W(300);
  const p0 = (await life()).clock.t;
  await W(2500);
  const p1 = (await life()).clock.t;
  await ev(`__academy.resume()`);
  v.check('the Hof-Takt stands still while paused (s in 2.5 s)', round(Math.abs(p1 - p0), 3), '<=', 0.05);

  // ── tiers ──
  await ev(`__academy.teleport([0, 0, 116]); __academy.look(0, 2);`);
  await W(1500);
  s = await life();
  out.bridgehead = s;
  v.require('at the bridge head: its area near, the farm far', s.tiers.bridgehead === 'near' && (s.tiers.hof === 'far' || s.tiers.hof === 'hidden'), JSON.stringify(s.tiers));
  v.check('director time per tick at the bridge head (ms, indicative)', s.ms, '<=', 0.25);
  const farm = `const G=__academy.game; const h=G.worldCtx.frames.heightAt(-198,74); __academy.teleport([-198, h, 74]); __academy.lookAt(-222, h + 0.6, 66);`;
  await ev(farm);
  await W(2500);
  s = await life();
  out.farm = s;
  v.require('at the Hofladen: the forecourt and the field near, the bridge head far', s.tiers.hof === 'near' && s.tiers.sonnenacker === 'near' && s.tiers.bridgehead !== 'near', JSON.stringify(s.tiers));
  v.check('director time per tick at the farm (ms, indicative)', s.ms, '<=', 0.25);

  // ── the farm view's ledger (life ≤ 20) ──
  const draws = await page.evaluate(DRAWS_BY_OWNER);
  out.farmDraws = draws.ledger;
  const lifeDraws = draws.ledger.owners.life ?? 0;
  console.log(`farm view: ${draws.total} draws · life ${lifeDraws} · ${Object.entries(draws.ledger.detail).filter(([k]) => k.startsWith('life/')).map(([k, n]) => `${k.slice(5)} ${n}`).join(', ')}`);
  v.check('life draws at the farm view (§5.5 Sonnenacker C: life ≤ 20)', lifeDraws, '<=', 20);

  // ── people and the rotor beat ──
  const people = await ev(`return __academy.ext('life:people')()`);
  out.people = people;
  v.check('people with jobs (D18: 6–10, Phase 7 builds 8)', people.length, '===', 8);
  await ev(`__academy.game.events.emit('life:react', { kind: 'rotor', at: [-80, 0, 0] })`);
  await W(300);
  const waving = (await ev(`return __academy.ext('life:people')()`)).filter((p) => p.visible && p.waving).length;
  const shown = (await ev(`return __academy.ext('life:people')()`)).filter((p) => p.visible).length;
  v.require('a rotor beat: the people in view wave', shown > 0 && waving >= Math.min(shown, 3), `${waving} of ${shown} visible wave`);

  // ── a miss on the vine ──
  await ev(`__academy.game.events.emit('sonnenacker:shift', { phase: 'ernte', arms: [{ id: 'a3', state: 'miss', at: [-226, 1.0, 60] }] })`);
  await W(200);
  const misses = (await life()).farm.misses;
  v.check("a 'sonnenacker:shift' miss stays on the vine", misses, '>=', 1);

  // ── the gather: the crowd in C1, the crew at the rail ──
  if (!args['skip-gather']) {
    await ev(`__academy.teleport([-1.2, 44.05, -9.2]); __academy.look(-65, -4); await __academy.solve('world', 'life-gather');`);
    await W(16000);
    const crowd = await ev(`return __academy.ext('life:crowd')()`);
    out.crowd = crowd;
    const cam = await ev(`return __academy.ext('ground:camera')?.('C1', 10, 28) ?? null`);
    out.c1 = cam;
    v.require('the gather: people at the apron edge', crowd.gathered && crowd.members.length >= 3 && crowd.members.every((m) => m.atSpot), JSON.stringify(crowd.members));
    if (cam) {
      // inside C1's frustum: within the horizontal half angle (16:9 at the game's 72° vertical FOV ≈ 51°) and below the horizon line
      const inC1 = crowd.members.map((m) => {
        const c = cam.position;
        const l = cam.lookAt;
        const fx = l[0] - c[0],
          fz = l[2] - c[2];
        const dx = m.pos[0] - c[0],
          dz = m.pos[2] - c[2];
        const a = Math.abs(Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz));
        return { id: m.id, deg: round((a * 180) / Math.PI, 1), dist: round(Math.hypot(dx, dz), 1) };
      });
      out.inC1 = inC1;
      v.require('the crowd stands inside C1 (≤ 45° off its axis, ≤ 120 m)', inC1.every((m) => m.deg <= 45 && m.dist <= 120), JSON.stringify(inC1));
    } else v.note('pending: no ground:camera hook (WP3) to place C1');
    v.require('the dock crew member stands at the Ausguck rail', crowd.crew.atRail, JSON.stringify(crowd.crew));
    await ev(`await __academy.solve('world', 'life-ungather')`);
  }

  // ── airborne above 300 m: the ground's life is hidden ──
  await ev(`__academy.game.worldCtx.island.setAltitude(320)`);
  await W(600);
  s = await life();
  const groundTiers = ['bridgehead', 'apron', 'werft', 'hof', 'sonnenacker'].map((id) => s.tiers[id]);
  v.require('h 320: every ground life area hidden', groundTiers.every((t) => t === 'hidden'), JSON.stringify(s.tiers));
  await ev(`__academy.game.worldCtx.island.setAltitude(0)`);
  await W(400);

  // ── eggs and the Fundvitrine ──
  const objects = await ev(`return __academy.ext('secrets:objects')()`);
  out.objects = objects;
  for (const [id, n] of Object.entries(objects)) v.check(`Fundvitrine object ${id} (triangles)`, n, '<=', 300);
  const built = await ev(`const S = __academy.game.gameLayer.secrets; return Object.keys(__academy.ext('secrets:objects')()).map((id) => !!S.object(id))`);
  v.require('every Fundvitrine object builds', built.every(Boolean), JSON.stringify(built));
  for (const hook of ['egg-winke', 'egg-robota', 'egg-werkbank', 'egg-naechste', 'egg-foto']) {
    const ok = await ev(`return await __academy.solve('world', '${hook}')`);
    v.require(`${hook}: its trigger finds the secret`, ok === true, String(ok));
  }
  const audit = await ev(`return __academy.ext('secrets:audit')()`);
  const total = await ev(`return __academy.game.gameLayer.secrets.total()`);
  v.check('registered eggs (the 9 MUST + egg 1)', total, '>=', 10);
  v.require('the audit hook lists every registered egg', audit.length === total, `${audit.length} rows, ${total} secrets`);
  const cards = await ev(`const S = __academy.game.gameLayer.secrets; return S.list().map((d) => { const c = d.card(); return { id: d.id, chips: (c.chips || []).length, words: String((c.body && (c.body.de || c.body)) || '').split(/\\s+/).length }; })`);
  out.cards = cards;
  v.require('every egg card carries its chip strip', cards.every((c) => c.chips > 0), JSON.stringify(cards.filter((c) => !c.chips)));
  v.require('egg cards ≈ 40–65 words (R9 §5.3)', cards.every((c) => c.words >= 35 && c.words <= 70), JSON.stringify(cards.map((c) => `${c.id} ${c.words}`)));

  out.errors = errors;
  v.require('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
saveJson('life-check.json', out);
v.exit(args);
