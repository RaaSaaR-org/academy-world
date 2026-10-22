#!/usr/bin/env node
// The lift-off (docs/PHASE7-PLAN.md §4.15, §5.5, §5.10; skeleton WP7, full checks WP13).
//
//   node tools/liftoff-check.mjs [--rm] [--skip] [--replay] [--dist <dir> | --dev]
//   node tools/liftoff-check.mjs --selftest --dev   # a scripted fake sequence exercises the machinery
//
// Opens `?liftoff=1` (all conditions met, at the console), starts the lift-off through WP13's hook
// (__academy.solve('world','liftoff'), or __academy.ext('sequence:liftoff')) and records every frame
// (tools/lib/measure.mjs INSTRUMENT) and every event of the sequence: 'flight:phase' { name, t, h, r? }
// with the plan's names (§6.6 WP13 „Provides“: spinup · release · liftoff · downwash (repeated, r = the
// front's radius) · shade · lid · cloud · breakout · level · dusk), 'liftoff:nav' (the nav lamp turns
// active) and 'liftoff:cut' (the outside shots' cuts). Checks:
//   per beat     main-pass draws ≤ 320 (§5.5 „Lift-off, any beat“: the ledger counts the main pass; counted
//                with onBeforeRender like tools/lib/drawcalls.mjs) and triangles ≤ 1.2 M (renderer, all
//                passes), sampled on the first frame after each phase event; renderer calls (incl. the
//                shadow pass) are reported beside them
//   frames       0 frames over 33 ms, except the cuts ('liftoff:cut' ± 50/200 ms; §5.5 „the two lift-off cuts“)
//   programs     0 program links on rendered frames during the sequence (the program gate)
//   env map      ≤ 1 env-map rebuild from 'spinup' to 'dusk' (WP2's Environment.stats.envRebuilds)
//   audio        master peak ≤ −10 dBFS over the sequence
//   console      the three systems ready at the start (quest start.startklar, armed) and on the console
//                (six rotor lamps teal, the Startakku bar full, the nav lamp on; crew plates where the
//                Bodencrew supplied AKKU or NAV)
//   nav lamp     'liftoff:nav' (active) comes before the 'cloud' phase (the first whiteout frame)
//   sky dressing first drawn after the 'breakout' phase (0 sky-dressing draws before it)
//   ghost        objects tagged userData.ghostHorizon are drawn only while the eye is inside the cloud
//                (between 'cloud' and 'breakout') and add ≤ 2 draws
//   tracker wave the downwash front ('downwash' { r }) reaches past the Sonnenacker's rows (its plot edge,
//                from the manifests' plot; a 'trackers:farm' phase counts too)
//   throttle     WP13's __academy.ext('liftoff:throttle')(false) after the lift-off: the island brakes to a
//                hover and h stays within 0.5 m for 2 s; EMI-01 takes over after 6 s (the climb resumes);
//                (null) hands the throttle back
//   reload       airborne after a reload; --skip: Space held 1.2 s at 3 s skips to the end, airborne;
//                --replay: world:liftoff-replay (the title's „Abheben ansehen“) plays again and ends airborne
// --rm: a fresh profile with prefers-reduced-motion: reduce: the stills (§4.15): no cut, no tilt, the
// director in its 'stills' mode. A check whose event, tag or hook never appears is pending; until WP13's
// hook exists the whole tool is pending and exits 0. Exit 1 on a miss.
import { Verdict, gameServer, launchChromium, parseArgs, saveJson, round, INSTRUMENT } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const rm = !!args.rm;
const selftest = !!args.selftest;
/**
 * --selftest: a fake sequence:liftoff (6 s) that emits the phases in order and ends airborne in memory
 * (the WP1 stub saves no flight, so the reload check is skipped); the machinery must record them.
 */
const FAKE = () => {
  const A = window.__academy;
  A.ext('sequence:liftoff', async () => {
    const ev = A.game.events;
    const names = ['spinup', 'release', 'liftoff', 'downwash', 'lid', 'cloud', 'breakout', 'level'];
    for (let i = 0; i < names.length; i++) {
      if (names[i] === 'cloud') ev.emit('liftoff:nav', { state: 'active', t: i * 0.7, h: 280 });
      ev.emit('flight:phase', { name: names[i], t: i * 0.7, h: i * 40, ...(names[i] === 'downwash' ? { r: 600 } : {}) });
      await new Promise((r) => setTimeout(r, 700));
    }
    ev.emit('flight:phase', { name: 'dusk', t: 6, h: 570 });
    A.game.quest?.setFlight?.('airborne', { liftoffSeen: true });
  });
};
const v = new Verdict(`liftoff-check${rm ? ' --rm' : ''}${args.skip ? ' --skip' : ''}${args.replay ? ' --replay' : ''}`);
const CAP_DRAWS = 320;
const CAP_TRIS = 1.2e6;
const out = {};

/** In-page: phase events with the frame state, sky-dressing and ghost-horizon draws per frame. */
const WATCH = () => {
  const A = window.__academy;
  const G = A.game;
  const W = (window.__lo = { phases: [], nav: [], cuts: [], frames: [], env0: null, env1: null, t0: performance.now() });
  const rebuilds = () => G.env?.stats?.envRebuilds ?? 0;
  G.events.on('flight:phase', (e) => {
    W.phases.push({ ...e, at: performance.now() });
    if (e.name === 'spinup' && W.env0 == null) W.env0 = rebuilds();
    if (e.name === 'dusk') W.env1 = rebuilds();
  });
  G.events.on('liftoff:nav', (e) => W.nav.push({ ...e, at: performance.now() }));
  G.events.on('liftoff:cut', (e) => W.cuts.push({ ...e, at: performance.now() }));
  // per rendered frame: main-pass draws (onBeforeRender: the shadow pass does not call it), renderer
  // calls and triangles, sky-dressing draws, ghost-horizon draws, camera height, tilt
  const rs = G.rs;
  const orig = rs.render.bind(rs);
  let sky = 0;
  let ghost = 0;
  let main = 0;
  const hooked = new WeakSet();
  const hook = () =>
    rs.scene.traverse((o) => {
      if (hooked.has(o) || (!o.isMesh && !o.isPoints && !o.isLine && !o.isSprite)) return;
      hooked.add(o);
      let isSky = false;
      let isGhost = false;
      for (let q = o; q; q = q.parent) {
        if (q.name === 'island:sky' || q.userData?.skyDressing) isSky = true;
        if (q.userData?.ghostHorizon) isGhost = true;
      }
      const prev = o.onBeforeRender;
      o.onBeforeRender = function () {
        main++;
        if (isSky) sky++;
        if (isGhost) ghost++;
        return prev.apply(this, arguments);
      };
    });
  hook();
  setInterval(hook, 500);
  rs.render = (dt) => {
    sky = 0;
    ghost = 0;
    main = 0;
    const r = orig(dt);
    const i = A.renderInfo();
    const tl = G.env?.tilt ?? { rollDeg: 0, pitchDeg: 0 };
    W.frames.push({ at: performance.now(), main, calls: i.calls, tris: i.triangles, sky, ghost, y: G.camera.position.y, tilt: Math.max(Math.abs(tl.rollDeg), Math.abs(tl.pitchDeg)) });
    return r;
  };
};

const srv = await gameServer(args);
const browser = await launchChromium({ full: true });
let pending = null;
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: rm ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(INSTRUMENT);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 300)));
  const open = async (q) => {
    await page.goto(`${srv.url}/?skipIntro=1&quality=high${q}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout: 180000, polling: 200 });
    await page.evaluate(() => typeof window.__academy.loadAll === 'function' && window.__academy.loadAll());
  };
  await open('&reset=1&liftoff=1');
  if (selftest) {
    await page.evaluate(FAKE);
    // the stub has no Probestart or F3: arm the quest for the console check
    await page.evaluate(() => {
      const q = window.__academy.game.quest;
      q?.markProbestart?.();
    });
  }
  const has = await page.evaluate(() => ({ solve: window.__academy.debugActions().includes('world:liftoff'), seq: typeof window.__academy.ext === 'function' && typeof window.__academy.ext('sequence:liftoff') === 'function', replay: window.__academy.debugActions().includes('world:liftoff-replay') }));
  if (!has.solve && !has.seq) pending = "no world:liftoff hook and no __academy.ext('sequence:liftoff') yet (WP13)";
  else {
    // the finale chunk loads after the title: let it settle (its late-build warm-up compiles the console and the ghost)
    await page.waitForTimeout(selftest ? 500 : 4000);
    const q0 = await page.evaluate(() => window.__academy.quest?.() ?? null);
    if (selftest) v.note(`selftest: console check skipped (start ${JSON.stringify(q0?.start ?? null).slice(0, 80)})`);
    else v.require('console: the three systems ready at the start (startklar, armed)', !!q0?.start.startklar && !!q0?.armed, JSON.stringify(q0?.start ?? null).slice(0, 120));
    await page.evaluate(WATCH);
    await page.evaluate(() => window.__academy.audioArm('master'));
    await page.evaluate(() => window.__perf.start());
    // start; --skip holds Space 1.2 s at 3 s; the throttle check runs after the 'liftoff' phase
    // the selftest drives its fake sequence:liftoff even where the real hooks exist
    const run = page.evaluate(async ([solve]) => {
      const A = window.__academy;
      if (solve) await A.solve('world', 'liftoff');
      else await A.ext('sequence:liftoff')({ rm: A.game.settings.data.reducedMotion });
    }, [has.solve && !selftest]);
    let peak = -Infinity;
    const t0 = Date.now();
    let throttle = null;
    let consoleShown = null;
    let skipped = false;
    let done = false;
    run.then(() => (done = true), () => (done = true));
    const stats = () => page.evaluate(async () => (typeof window.__academy.ext('liftoff') === 'function' ? await window.__academy.ext('liftoff')() : null));
    while (!done && Date.now() - t0 < 300000) {
      await page.waitForTimeout(1000);
      const m = await page.evaluate(() => window.__academy.audioMeter(1000, 'master'));
      if (m && Number.isFinite(m.peakDb)) peak = Math.max(peak, m.peakDb);
      if (!consoleShown && !selftest) {
        const st = await stats();
        if (st?.running && st.t > 2) consoleShown = st.console;
      }
      if (args.skip && !skipped && Date.now() - t0 > 3000) {
        skipped = true;
        await page.keyboard.down('Space');
        await page.waitForTimeout(1250);
        await page.keyboard.up('Space');
      }
      if (!throttle && !rm && !args.skip && !selftest) {
        const lifted = await page.evaluate(() => window.__lo.phases.some((p) => p.name === 'liftoff') && typeof window.__academy.ext('liftoff:throttle') === 'function');
        if (lifted) {
          // a few seconds into the climb, release the throttle: the controller brakes to a hover and holds h
          await page.waitForTimeout(3000);
          await page.evaluate(() => window.__academy.ext('liftoff:throttle')(false));
          const tRel = Date.now();
          let st = await stats();
          for (let k = 0; k < 24 && st?.climb !== 'hover'; k++) {
            await page.waitForTimeout(250);
            st = await stats();
          }
          const tHover = (Date.now() - tRel) / 1000;
          const h0 = st?.h ?? NaN;
          await page.waitForTimeout(2000);
          const h1 = (await stats())?.h ?? NaN;
          // EMI-01 takes over 6 s after the release: the climb resumes on its own
          let st2 = await stats();
          for (let k = 0; k < 20 && !(st2?.auto && st2.climb === 'climb'); k++) {
            await page.waitForTimeout(250);
            st2 = await stats();
          }
          const tAuto = (Date.now() - tRel) / 1000;
          await page.evaluate(() => window.__academy.ext('liftoff:throttle')(null));
          throttle = { h0, h1, tHover, paused: Math.abs(h1 - h0) <= 0.5, auto: !!st2?.auto && st2.climb === 'climb', tAuto };
        }
      }
    }
    await page.waitForTimeout(1500);
    const rec = await page.evaluate(() => {
      window.__perf.stop();
      return { frames: window.__perf.frames.map((f) => ({ s: f.s, ms: f.ms, link: f.d.link || 0 })), lo: window.__lo };
    });
    const { phases, frames, nav: navEvents, cuts } = rec.lo;
    out.phases = phases.filter((p) => p.name !== 'downwash').map((p) => ({ name: p.name, t: round((p.at - rec.lo.t0) / 1000, 2), h: p.h }));
    out.cuts = cuts.map((c) => ({ shot: c.shot, at: c.at, t: round((c.at - rec.lo.t0) / 1000, 2) }));
    console.log(`phases: ${out.phases.map((p) => `${p.name}@${p.t}s${p.h != null ? ` h ${round(p.h, 0)}` : ''}`).join(' · ') || 'none'}`);
    // per beat (the downwash repeats: its first event only)
    const seen = new Set();
    const beats = phases
      .filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true)))
      .map((p) => ({ name: p.name, f: frames.find((f) => f.at >= p.at) }))
      .filter((b) => b.f);
    for (const b of beats) {
      v.check(`beat ${b.name}: main-pass draws (renderer calls ${b.f.calls})`, b.f.main, '<=', CAP_DRAWS);
      v.check(`beat ${b.name}: triangles`, b.f.tris, '<=', CAP_TRIS);
    }
    // the worst frame of the whole sequence, for the record (§5.5 „any beat“; C1 ≈ 300 in the plan)
    out.worst = frames.reduce((w, f) => (f.main > (w?.main ?? -1) ? f : w), null);
    if (out.worst) v.note(`worst frame: ${out.worst.main} main-pass draws (${out.worst.calls} renderer calls) at ${round((out.worst.at - rec.lo.t0) / 1000, 1)} s`);
    if (!beats.length) v.note('pending: no flight:phase events (WP13)');
    // frames over 33 ms except the cuts
    const cutWin = cuts.map((c) => [c.at - 50, c.at + 200]);
    const long = rec.frames.filter((f, i) => i > 0 && f.s - rec.frames[i - 1].s > 33.4 && !cutWin.some(([a, b]) => f.s >= a && f.s <= b));
    out.long = long.map((f) => ({ at: round((f.s - rec.lo.t0) / 1000, 2), ms: round(f.ms, 1) }));
    v.check('frames over 33 ms (the cuts excepted)', long.length, '<=', 0);
    v.check('program links on rendered frames during the lift-off', rec.frames.reduce((a, f) => a + f.link, 0), '<=', 0);
    const envN = rec.lo.env0 != null && rec.lo.env1 != null ? rec.lo.env1 - rec.lo.env0 : null;
    if (envN != null) v.check('env-map rebuilds from the spin-up to the dusk', envN, '<=', 1);
    else v.note("pending: the 'spinup' and 'dusk' phases (env-map rebuilds)");
    v.check('audio: master peak', round(peak, 1), '<=', -10, ' dBFS');
    // the console: the three systems ready (crew plates where the Bodencrew supplied them)
    if (consoleShown) {
      const lampsOk = consoleShown.lamps.length === 6 && consoleShown.lamps.every((l) => /teal|crew/.test(l));
      const q = await page.evaluate(() => window.__academy.quest?.() ?? null);
      const crewOk = consoleShown.crew.akku === (q?.start.energy.by === 'crew') && consoleShown.crew.nav === (q?.start.nav.by === 'crew');
      v.require('console: six rotor lamps on, the Startakku bar full, the nav lamp on', lampsOk && consoleShown.bar.segments >= 8 && /teal|crew/.test(consoleShown.bar.lamp) && /teal|crew/.test(consoleShown.nav), JSON.stringify(consoleShown).slice(0, 160));
      v.require('console: crew plates exactly where the Bodencrew supplied AKKU / NAV', crewOk, JSON.stringify(consoleShown.crew));
    } else if (!selftest) v.note("pending: __academy.ext('liftoff') console state (WP13)");
    // nav lamp before the whiteout
    const nav = navEvents.find((p) => p.state === 'active');
    const white = phases.find((p) => p.name === 'cloud');
    if (nav && white) v.require('the nav lamp is active before the first whiteout frame', nav.at < white.at);
    else v.note(args.skip ? "skipped: the nav lamp's switch and the whiteout were not reached" : "pending: 'liftoff:nav' and the 'cloud' phase (WP13)");
    // sky dressing first after the break-out
    const brk = phases.find((p) => p.name === 'breakout');
    const firstSky = frames.find((f) => f.sky > 0);
    if (brk) v.require('sky dressing first visible after the break-out', !firstSky || firstSky.at >= brk.at, firstSky ? `${round((firstSky.at - brk.at) / 1000, 2)} s after` : 'never drawn');
    else v.note("pending: the 'breakout' phase (WP13)");
    // ghost horizon only inside the cloud, ≤ 2 draws
    if (white && brk) {
      const outside = frames.filter((f) => f.ghost > 0 && (f.at < white.at || f.at > brk.at + 100)).length;
      const inside = frames.filter((f) => f.ghost > 0 && f.at >= white.at && f.at <= brk.at + 100);
      if (!inside.length && !outside) v.note(args.skip ? 'skipped: the ghost horizon was not reached' : 'pending: no object tagged userData.ghostHorizon drawn (WP13)');
      else {
        v.check('ghost horizon drawn outside the cloud (frames)', outside, '<=', 0);
        v.check('ghost horizon draws per frame', Math.max(0, ...inside.map((f) => f.ghost)), '<=', 2);
      }
    }
    // the tracker wave reaches the farm: the downwash front passes the Sonnenacker's plot (or 'trackers:farm')
    const down = phases.filter((p) => p.name === 'downwash');
    if (down.length) {
      const farm = await page.evaluate(() => {
        const m = (window.__academy.manifests('all') || []).find((x) => x.id === 'sonnenacker');
        return m ? Math.hypot(m.anchor[0], m.anchor[2]) + (m.radius || 0) : 380;
      });
      const maxR = Math.max(...down.map((p) => p.r ?? 0));
      v.require('the tracker wave reaches the farm', maxR >= farm || phases.some((p) => p.name === 'trackers:farm'), `front ${round(maxR, 0)} m, farm rows to ${round(farm, 0)} m`);
    } else v.note(args.skip ? 'skipped: the downwash front was not reached' : "pending: the 'downwash' phase (WP13)");
    if (throttle) {
      v.require('throttle released: the climb pauses (h within 0.5 m for 2 s)', throttle.paused, `hover after ${round(throttle.tHover, 1)} s, h ${round(throttle.h0, 2)} → ${round(throttle.h1, 2)}`);
      v.require('EMI-01 takes over after 6 s (the climb resumes)', throttle.auto && throttle.tAuto >= 5.5, `${round(throttle.tAuto, 1)} s after the release`);
    } else if (!rm && !args.skip && !selftest) v.note("pending: __academy.ext('liftoff:throttle') (WP13)");
    if (rm && !selftest) {
      v.check('reduced motion: outside-shot cuts', cuts.length, '<=', 0);
      v.check('reduced motion: island tilt (max °)', round(Math.max(0, ...frames.map((f) => f.tilt)), 3), '<=', 0);
    }
    // airborne, across a reload
    const q1 = await page.evaluate(() => window.__academy.quest?.() ?? null);
    v.require(`after the lift-off${args.skip ? ' (skipped)' : ''}: airborne`, q1?.flight.state === 'airborne', q1?.flight.state);
    if (args.skip) v.require('the skip ended with the dusk phase', phases.some((p) => p.name === 'dusk'));
    if (!selftest) {
      await open('');
      const q2 = await page.evaluate(() => window.__academy.quest?.() ?? null);
      v.require('reload: still airborne', q2?.flight.state === 'airborne', q2?.flight.state);
    }
    if (args.replay) {
      if (!has.replay) v.note('pending: world:liftoff-replay (WP13; the title button „Abheben ansehen“ emits liftoff:replay)');
      else {
        await page.evaluate(() => window.__academy.closeModals?.());
        await page.evaluate(() => window.__academy.solve('world', 'liftoff-replay'));
        await page.waitForTimeout(2000);
        const q3 = await page.evaluate(() => window.__academy.quest?.() ?? null);
        v.require('replay: ends airborne', q3?.flight.state === 'airborne', q3?.flight.state);
      }
    }
    out.errors = errors;
    v.check('page errors', errors.length, '<=', 0);
  }
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
if (pending) {
  console.log(`liftoff-check: pending — ${pending}`);
  v.note(`pending: ${pending}`);
}
saveJson(`liftoff-check${rm ? '-rm' : ''}${args.skip ? '-skip' : ''}${args.replay ? '-replay' : ''}${selftest ? '-selftest' : ''}.json`, out);
if (selftest) {
  v.print();
  const names = (out.phases ?? []).map((p) => p.name);
  const rows = v.rows.map((r) => r.name);
  const ok = names.length === 8 && rows.some((r) => r.startsWith('beat liftoff')) && rows.includes('the nav lamp is active before the first whiteout frame') && rows.includes('sky dressing first visible after the break-out') && rows.includes('the tracker wave reaches the farm') && v.rows.find((r) => r.name === 'the nav lamp is active before the first whiteout frame')?.ok;
  console.log(ok ? 'OK   selftest: the fake sequence was recorded and judged' : `FAIL selftest: phases ${names.join(',')}`);
  process.exit(ok ? 0 : 1);
}
v.exit(args);
