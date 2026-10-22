#!/usr/bin/env node
// Sonnenacker in the browser (WP9 acceptance; plan §4.10, §3.3, §4.15, §6.6 WP9): what the shared tools
// do not see on their own. On the dev server (default) or a build (--dist <dir>):
//   1. Entdecker: the three stamps charge the Startakku ⅓ → ⅔ → 1 (ctx.quest), AKKU bereit by 'player',
//      T3 'an', the dashboard bar shown at 100 % and locked on the result;
//   2. the live automated day (every leaf, midday, the card found, each call answered at once) gives the
//      same harvest as the model's day (model.ts simulateDay): the stars rate preparation, not luck;
//   3. the lift-off: 'flight:phase' 'downwash' → the farm's rows stow and 'flight:phase' 'trackers:farm'
//      follows; the rows track again at the next docked resume;
//   4. 'sonnenacker:shift' snapshots with all 18 arms; 'sonnenacker:pick' events while the farm works;
//   5. egg 24: the heart tomato into a crate → the secret 'herztomate' and its album entry;
//   6. Entscheider: AKKU by 'crew' after the Probestart, then the optional detour's ◆ → by 'player';
//   7. the site's update cost at 1× CPU while the day runs (indicative; perf-cpu is the gate).
//
//   node tools/sonnenacker/check.mjs [--dist <dir>] [--only 1,2,…]
// Exit 1 on a miss.
import { Verdict, gameServer, launchChromium, openGame, parseArgs, round } from '../lib/measure.mjs';
import { loadFarm } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const only = args.only ? String(args.only).split(',').map(Number) : null;
const want = (n) => !only || only.includes(n);
const v = new Verdict('sonnenacker check');
const srv = await gameServer(args, { prefer: 'dev' });
const browser = await launchChromium();
const errors = [];
const open = async (q) => {
  const { page, ctx, errors: e } = await openGame(browser, `${srv.url}/?${q}`, { instrument: false });
  errors.push(e);
  await page.waitForFunction(() => window.__academy.zones().some((z) => z.id === 'sonnenacker' && (z.status === 'ready' || z.status === 'error')), null, { timeout: 120000, polling: 200 });
  const S = (h) => page.evaluate((x) => window.__academy.solve('sonnenacker', x), h);
  const Q = () => page.evaluate(() => window.__academy.quest());
  const W = (ms) => page.waitForTimeout(ms);
  // into the farm through the gate (the zone's own logic needs the player inside; the robots load within 60 m)
  await page.evaluate(() => window.__academy.teleport('sonnenacker'));
  await W(1200);
  await page.evaluate(() => window.__academy.press('KeyW', 1500));
  await page.waitForFunction(async () => (await window.__academy.solve('sonnenacker', 'state'))?.arms?.ready === true, null, { timeout: 60000, polling: 250 }).catch(() => null);
  await W(1500);
  return { page, ctx, S, Q, W };
};
try {
  if (want(1) || want(2) || want(3) || want(4) || want(5) || want(7)) {
    const { page, ctx, S, Q, W } = await open('area=sonnenacker&skipIntro=1&reset=1&dev=1&lang=de&mode=entdecker&mute=1');
    const z = (await page.evaluate(() => window.__academy.zones().find((x) => x.id === 'sonnenacker'))) ?? {};
    v.require('the Sonnenacker is ready', z.status === 'ready', z.error ?? z.status);
    // events: the shift snapshots and the picks
    await page.evaluate(() => {
      window.__sa = { shift: [], picks: 0, phases: [] };
      const ev = window.__academy.game.events;
      ev.on('sonnenacker:shift', (p) => window.__sa.shift.push({ phase: p.phase, arms: p.arms.length, at: p.arms[0]?.at?.slice() }));
      ev.on('sonnenacker:pick', () => window.__sa.picks++);
      ev.on('flight:phase', (p) => window.__sa.phases.push({ name: p.name, t: window.__academy.game.time.elapsed }));
    });
    if (want(1)) {
      const charge = [(await Q()).start.energy.charge];
      for (const h of ['solve-a', 'solve-b', 'solve-c']) {
        await S(h);
        await W(1600);
        charge.push((await Q()).start.energy.charge);
      }
      v.require('Startakku charge ⅓ → ⅔ → 1 over the three stamps', charge.map((c) => round(c, 3)).join(' → ') === '0 → 0.333 → 0.667 → 1', charge.map((c) => round(c, 3)).join(' → '));
      const q = await Q();
      v.require("AKKU bereit by 'player'", (q.start.energy.state === 'bereit' || q.start.energy.state === 'geprueft') && q.start.energy.by === 'player', `${q.start.energy.state} by ${q.start.energy.by}`);
      v.require('trim T3 an', q.systems.T3 === 'an', q.systems.T3);
      await W(2500);
      const st = await S('state');
      v.check('the dashboard bar on the result', st.dash.charge, '>=', 0.999);
      v.require('the dashboard bar is locked at 100 %', st.dash.locked === true);
      const pass = await page.evaluate(() => window.__academy.pass().stamps.filter((s) => s.id.startsWith('sonnenacker.')).map((s) => s.record?.value?.de ?? null));
      v.require('three stamps with their measured values', pass.length === 3 && pass.every(Boolean), JSON.stringify(pass));
      const stars = await page.evaluate(() => window.__academy.stars().byZone.sonnenacker);
      v.check('★ of the three stations after the solve hooks', stars?.stars ?? 0, '>=', 3);
    }
    if (want(2)) {
      // the live day against the model: start, answer each call as it comes, wait for the result
      await S('day');
      const t0 = Date.now();
      let st = await S('state');
      while (st.c.run && Date.now() - t0 < 140000) {
        await S('answer');
        await W(400);
        st = await S('state');
      }
      await W(2500);
      st = await S('state');
      const { M } = await loadFarm();
      const sim = M.simulateDay(M.preparedChoices('midday', 0.5));
      const model = sim.result;
      v.require('the live day ended', !st.c.run, `t ${st.c.run?.t}`);
      // attempt by attempt: [i, ok, damaged, missed, vis, t] from the station against the model's outcome
      const live = new Map((st.c.outcomes ?? []).map((o) => [o[0], o]));
      const differ = sim.outcomes.filter((o) => {
        const l = live.get(o.i);
        return !l || l[1] !== (o.ok ? 1 : 0) || l[2] !== (o.damaged ? 1 : 0) || l[3] !== (o.missed ? 1 : 0);
      });
      v.check('live day: attempts whose outcome differs from the model', differ.length, '=', 0, ` of ${sim.outcomes.length}`);
      for (const o of differ.slice(0, 4)) v.note(`attempt ${o.i} (row ${o.row}, fruit ${o.fruit}): model ${o.ok ? 'picked' : 'not picked'} at ${round(o.t, 1)} s, live ${JSON.stringify(live.get(o.i) ?? null)}`);
      v.check('live day: harvest (the model says ' + model.k + '/60)', st.c.last?.k ?? -1, '=', model.k, '/60');
      v.check('live day: damaged fruit (the model says ' + model.damaged + ')', st.c.last?.damaged ?? -1, '=', model.damaged);
      v.check('live day: calls answered in time', st.c.last?.callsInTime ?? -1, '=', 5);
    }
    if (want(4)) {
      const sa = await page.evaluate(() => window.__sa);
      v.check("'sonnenacker:shift' snapshots", sa.shift.length, '>=', 3);
      v.check("arms in a 'sonnenacker:shift' snapshot", sa.shift.at(-1)?.arms ?? 0, '=', 18);
      v.require("a snapshot's arm has a world position", Array.isArray(sa.shift.at(-1)?.at) && sa.shift.at(-1).at.length === 3);
      v.require("'erntetag' was a shift phase during the day", !want(2) || sa.shift.some((s) => s.phase === 'erntetag'));
      v.check("'sonnenacker:pick' events", sa.picks, '>=', want(2) ? 60 : 1);
    }
    if (want(7)) {
      await S('perf');
      await S('day');
      await W(8000);
      const p = await S('perf');
      v.note(`site update at 1× CPU while the day runs: mean ${p.meanMs} ms, max ${p.maxMs} ms over ${p.frames} frames (indicative; gate: perf-cpu, ≤ 1.0 ms)`);
      v.check('site update at 1× (mean, indicative)', p.meanMs, '<=', 1.0, ' ms');
      await S('answer');
    }
    if (want(5)) {
      const before = await page.evaluate(() => window.__academy.game.gameLayer.secrets.has('herztomate'));
      await S('heart');
      await W(2500);
      const found = await page.evaluate(() => ({ s: window.__academy.game.gameLayer.secrets.has('herztomate'), a: window.__academy.pass().album.includes('herztomate') }));
      v.require('egg 24: the heart tomato in a crate finds the secret', !before && found.s);
      v.require('egg 24: its album entry', found.a);
    }
    if (want(3)) {
      // the stow wave (WP13 drives the lift-off; here only its event)
      await page.evaluate(() => window.__academy.game.events.emit('flight:phase', { name: 'downwash', t: 22, h: 1, r: 0 }));
      await W(14000);
      const st = await S('state');
      const sa = await page.evaluate(() => window.__sa.phases);
      const down = sa.find((p) => p.name === 'downwash');
      const farm = sa.find((p) => p.name === 'trackers:farm');
      v.require("'trackers:farm' follows 'downwash'", !!down && !!farm && farm.t > down.t, farm ? `${round(farm.t - down.t, 1)} s later` : 'never');
      v.check('rows stowed by the wave', st.roof.wave.rows, '=', 12);
      v.check('row 1 tilt after the wave (flat)', Math.abs(st.roof.tilt0), '<=', 1, '°');
    }
    await ctx.close();
  }
  if (want(6)) {
    const { page, ctx, S, Q, W } = await open('area=sonnenacker&skipIntro=1&reset=1&dev=1&lang=en&mode=entscheider&mute=1');
    await page.evaluate(() => window.__academy.game.quest.markProbestart());
    await W(1500);
    const q0 = await Q();
    v.require("Entscheider: AKKU by 'crew' after the Probestart", q0.start.energy.by === 'crew', `${q0.start.energy.state} by ${q0.start.energy.by}`);
    await S('solve-c');
    await W(2000);
    const q1 = await Q();
    v.require("Entscheider detour: the ◆ turns AKKU to 'player'", q1.start.energy.by === 'player', `${q1.start.energy.state} by ${q1.start.energy.by}`);
    await ctx.close();
  }
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
const errs = errors.flat().filter((e) => !/GPU stall|DevTools/.test(e));
v.check('page errors', errs.length, '=', 0);
for (const e of errs.slice(0, 5)) v.note(e.slice(0, 300));
v.exit(args);
