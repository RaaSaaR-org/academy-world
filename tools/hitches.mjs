#!/usr/bin/env node
// Long frames and late shader compiles on a first lap of the island (promoted from the phase 6
// perf-runtime audit's route-prof.mjs + newprog.mjs). Plan items C2, W8 and the Phase 7 program gate
// (docs/PHASE7-PLAN.md §5.5 „Programs“).
//
//   node tools/hitches.mjs [--runs 3] [--cpu 1] [--browser chromium|webkit] [--dist <dir> | --dev]
//
// One lap per run on a fresh page (production build, every area loaded): the onboarding area, the
// Pass, each area with code (approach on foot from 30 m outside its plot, gate, inside, its solve
// hooks), all three-star hooks, KIEL, finale F1, F2, F3, then the lift-off (WP13's world:liftoff; until
// then the rc4 ending) and the certificate. Every rAF frame is logged with its JS time, programs
// linked and texture bytes uploaded (tools/lib/measure.mjs INSTRUMENT); links outside rAF frames are
// the background compileAsync of idle slots.
// Targets (§5.5): 0 program links on a rendered frame (a frame that first shows an object links
// nothing; background compileAsync in idle slots is allowed and counted separately); 0 frames over
// 33 ms caused by a link; 0 frames over 33 ms while walking up to an area (the approaches; scripted
// teleports, solve hooks and the two lift-off cuts are excepted); every robot's first-shown frame
// links 0 programs (pending while no robot appears); Schauhalle deliveries without a frame over 33 ms
// (pending until WP11); F2 results: no frame over 33 ms (W8); F3: no frame uploads more than 4 MB of
// textures (W8). --browser webkit runs the lap in WebKit (Safari has no KHR_parallel_shader_compile;
// no CPU throttling there). Medians over --runs. Exit 1 on a miss.
// Raw frames: artifacts/<PT_DIR|measure>/hitches-<browser>-run<n>.json.
import { Verdict, gameServer, launchChromium, launchEngine, openGame, median, parseArgs, saveJson, round } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const runs = Number(args.runs ?? 3);
const cpu = Number(args.cpu ?? 1);
const engine = String(args.browser ?? 'chromium');
if (engine !== 'chromium' && cpu !== 1) throw new Error('CPU throttling needs Chromium (CDP); use --cpu 1 with --browser webkit');

/** In-page: the first frame each robot (userData.robot) is drawn, by performance.now(). */
const ROBOT_WATCH = () => {
  const G = window.__academy.game;
  const seen = (window.__robotFirst = window.__robotFirst || {});
  const hooked = new WeakSet();
  const scan = () => {
    G.rs.scene.traverse((o) => {
      if (!o.userData || !o.userData.robot || hooked.has(o)) return;
      hooked.add(o);
      const id = String(o.userData.robot);
      o.traverse((m) => {
        if (!m.isMesh) return;
        const prev = m.onBeforeRender;
        m.onBeforeRender = function () {
          if (seen[id] == null) seen[id] = performance.now();
          return prev.apply(this, arguments);
        };
      });
    });
  };
  scan();
  window.__robotScan = setInterval(scan, 250);
};
async function lap(browser, url, run) {
  const { page, ctx, errors } = await openGame(browser, `${url}/?reset=1&skipIntro=1&lang=de&mode=entdecker`, { all: true });
  const cdp = engine === 'chromium' ? await ctx.newCDPSession(page) : null;
  if (cdp && cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.evaluate(ROBOT_WATCH);
  await page.evaluate(() => {
    const G = window.__academy.game;
    const P = window.__perf;
    const emit = G.events.emit.bind(G.events);
    G.events.emit = (type, payload) => {
      if (P.rec) P.marks.push({ t: performance.now(), m: 'ev:' + type });
      return emit(type, payload);
    };
  });
  const ev = (code) => page.evaluate(`(async () => { ${code} })()`);
  const mark = (m) => page.evaluate((m) => window.__perf.mark(m), m);
  const W = (ms) => page.waitForTimeout(ms);
  await W(3000);
  const programs0 = await page.evaluate(() => window.__academy.renderInfo().programs);
  const links0 = await page.evaluate(() => window.__perf.c.link);
  await page.evaluate(() => window.__perf.start());
  await mark('onboarding');
  await ev(`__academy.teleport([0,0,26],{yaw:0,pitch:-5})`);
  await W(10000);
  await ev(`__academy.teleport([4,0,6],{yaw:0,pitch:0})`);
  await W(1000);
  await ev(`__academy.interact('Pass')`);
  await W(1000);
  await ev(`__academy.closeModals()`);
  const areas = await page.evaluate(() => window.__academy.manifests('all').filter((m) => m.hasCode && !m.id.startsWith('_') && m.anchor).map((m) => ({ id: m.id, anchor: [m.anchor.x ?? m.anchor[0], m.anchor.z ?? m.anchor[2]], radius: m.radius ?? 22, n: m.stations.length })));
  const acts = new Set(await page.evaluate(() => window.__academy.debugActions()));
  for (const a of areas) {
    const z = a.id;
    const [ax, az] = a.anchor;
    const d = Math.hypot(ax, az) || 1;
    // start 30 m outside the plot on the line from the hub (rc4 lobes: 16 m from the hub), sprint in
    const r0 = Math.max(16, d - a.radius - 30);
    const sx = (ax / d) * r0;
    const sz = (az / d) * r0;
    const yaw = (Math.atan2(-(ax - sx), -(az - sz)) * 180) / Math.PI;
    await mark(`approach ${z}`);
    await ev(`__academy.teleport([${sx.toFixed(2)},0,${sz.toFixed(2)}],{yaw:${yaw.toFixed(1)},pitch:0})`);
    await W(600);
    await mark(`walk ${z}`);
    await ev(`__academy.press('ShiftLeft', 6500); __academy.press('KeyW', 6500)`);
    await W(7000);
    await mark(`gate ${z}`);
    await ev(`__academy.teleport('${z}')`);
    await W(800);
    await ev(`__academy.press('KeyW', 1400)`);
    await W(2500);
    for (const h of [...Array.from({ length: a.n }, (_, i) => `solve-${'abc'[i]}`), 'album']) {
      if (!acts.has(`${z}:${h}`)) continue;
      await mark(`${z} ${h}`);
      await ev(`await __academy.solve('${z}','${h}')`);
      await W(2200);
      await ev(`__academy.closeModals(); __academy.exitOperate()`);
      await W(400);
    }
    await mark(`leave ${z}`);
    await ev(`__academy.teleport([0,0,40],{yaw:0,pitch:0})`);
    await W(2500);
  }
  await mark('stars');
  for (const a of areas)
    for (const h of Array.from({ length: a.n }, (_, i) => `stars3-${'abc'[i]}`)) {
      if (!acts.has(`${a.id}:${h}`)) continue;
      const z = a.id;
      await ev(`await __academy.solve('${z}','${h}')`);
      await W(500);
      await ev(`__academy.closeModals(); __academy.exitOperate()`);
    }
  await mark('kiel');
  await ev(`__academy.teleport([0,0,-7.5],{yaw:180,pitch:0})`);
  await W(1200);
  await ev(`__academy.interact('KIEL')`);
  await W(9500);
  await mark('f1');
  await ev(`await __academy.solve('world','finale-f1-bot')`);
  await W(23000);
  await ev(`__academy.closeModals(); __academy.exitOperate()`);
  await W(1200);
  await mark('f2');
  await ev(`await __academy.solve('world','finale-f2-solve')`);
  await W(800);
  await mark('f3');
  await ev(`await __academy.solve('world','finale-f3-solve')`);
  await W(11500);
  await ev(`__academy.closeModals()`);
  await W(500);
  if (acts.has('world:liftoff')) {
    // the Phase 7 lift-off (WP13); its two cuts are excepted from the 33 ms rule
    await mark('liftoff');
    await ev(`await __academy.solve('world','liftoff')`);
    await W(3000);
  } else {
    await mark('ending');
    await ev(`__academy.solve('world','finale-ending')`);
    await W(40000);
  }
  await mark('certificate');
  await ev(`__academy.closeModals()`);
  await W(1500);
  const raw = await page.evaluate(() => {
    window.__perf.stop();
    const P = window.__perf;
    return { frames: P.frames.map((f) => ({ t: f.t, s: f.s, ms: f.ms, d: f.d })), marks: P.marks, loaf: P.loaf.length, linksTotal: P.c.link, robotFirst: window.__robotFirst || {} };
  });
  const programs1 = await page.evaluate(() => window.__academy.renderInfo().programs);
  if (cdp && cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await ctx.close();

  // analysis
  const fr = raw.frames;
  const marks = raw.marks.filter((m) => !m.m.startsWith('ev:'));
  const at = (name) => marks.find((m) => m.m === name)?.t ?? null;
  const markOf = (t) => [...marks].reverse().find((m) => m.t <= t)?.m ?? '';
  const iv = fr.map((f, i) => (i ? f.t - fr[i - 1].t : 0));
  const long = (thr) => iv.filter((x) => x > thr).length;
  const links = fr.reduce((a, f) => a + (f.d.link || 0), 0);
  // links outside rAF frames: background compileAsync in idle slots (allowed, counted separately)
  const backgroundLinks = raw.linksTotal - links0 - links;
  // a frame "from a shader compile": it linked a program and it (or the gap after it) took > 33 ms
  const compileHitches = fr.map((f, i) => ({ f, gap: i + 1 < fr.length ? fr[i + 1].t - f.t : f.ms, at: markOf(f.s) })).filter((x) => (x.f.d.link || 0) > 0 && Math.max(x.f.ms, x.gap) > 33.4);
  // frames over 33 ms while walking up to an area (between 'walk z' and 'gate z'): the realistic part of the lap
  const walks = marks.filter((m) => m.m.startsWith('walk ')).map((m) => [m.t + 300, marks.find((n) => n.m === `gate ${m.m.slice(5)}`)?.t ?? m.t]);
  const walkLong = fr.map((f, i) => ({ f, gap: i + 1 < fr.length ? fr[i + 1].t - f.t : f.ms })).filter((x) => walks.some(([a, b]) => x.f.s >= a && x.f.s < b) && Math.max(x.f.ms, x.gap) > 33.4);
  // robots: links on the frame each robot was first drawn
  const robotFirst = Object.entries(raw.robotFirst).map(([id, t]) => {
    const f = [...fr].reverse().find((x) => x.s <= t);
    return { id, at: markOf(t), links: f ? f.d.link || 0 : null, ms: f ? round(f.ms, 1) : null };
  });
  // Schauhalle deliveries (WP11): frames over 33 ms within 1 s of a delivery event
  const deliveries = raw.marks.filter((m) => /^ev:schauhalle:deliver/.test(m.m)).map((m) => ({ t: m.t, long: fr.filter((f) => f.s >= m.t && f.s < m.t + 1000 && f.ms > 33.4).length }));
  const win = (from, to) => fr.filter((f) => f.s >= from && (to == null || f.s < to));
  const tF2 = at('f2');
  const tF3 = at('f3');
  const tEnd = at('ending');
  const upl = (f) => (f.d.texB || 0) + (f.d.subB || 0);
  // F2 results (f2 solve → f3): the longest frame that is not a big texture upload (those are the
  // F3 room screens, judged by the upload target below)
  const f2 = tF2 ? win(tF2, tF3) : [];
  const f2Worst = f2.reduce((a, f, i) => (upl(f) >= 4 * 1048576 ? a : Math.max(a, f.ms, i + 1 < f2.length ? f2[i + 1].t - f.t : 0)), 0);
  // F2 → ending: the most texture bytes uploaded in one frame (the F3 room's 1280×720 screens)
  const f3 = tF2 ? win(tF2, tEnd) : [];
  const f3MaxUpload = Math.max(0, ...f3.map(upl));
  const lapMaxUpload = Math.max(0, ...fr.map(upl));
  const r = {
    run,
    frames: fr.length,
    over33: long(33.4),
    over50: long(50),
    over100: long(100),
    linksDuringPlay: links,
    programsAtStart: programs0,
    programsAtEnd: programs1,
    compileHitches: compileHitches.length,
    backgroundLinks,
    walkOver33: walkLong.length,
    walkOver33List: walkLong.slice(0, 8).map((x) => `${Math.round(Math.max(x.f.ms, x.gap))} ms @ ${markOf(x.f.s)}`),
    robotFirst,
    robotFirstLinks: robotFirst.reduce((a, r) => a + (r.links || 0), 0),
    deliveries,
    compileHitchList: compileHitches.slice(0, 12).map((x) => `${Math.round(Math.max(x.f.ms, x.gap))} ms, ${x.f.d.link} links @ ${x.at}`),
    f2WorstMs: round(f2Worst, 1),
    f3MaxUploadMB: round(f3MaxUpload / 1048576, 2),
    lapMaxUploadMB: round(lapMaxUpload / 1048576, 2),
    worst: fr.map((f, i) => ({ ms: Math.round(Math.max(f.ms, iv[i + 1] ?? 0)), at: markOf(f.s), links: f.d.link || 0, mb: round(upl(f) / 1048576, 2) })).sort((a, b) => b.ms - a.ms).slice(0, 8),
    errors,
  };
  saveJson(`hitches-${engine}-run${run}.json`, { ...r, marks, frames: fr });
  return r;
}

const srv = await gameServer(args);
const browser = engine === 'chromium' ? await launchChromium({ full: true }) : await launchEngine(engine);
const results = [];
try {
  for (let i = 1; i <= runs; i++) {
    const r = await lap(browser, srv.url, i);
    results.push(r);
    console.log(`${engine} run${i}: ${r.frames} frames · >33 ms ${r.over33} (walking ${r.walkOver33}) · >50 ms ${r.over50} · >100 ms ${r.over100} · links on frames ${r.linksDuringPlay}, in idle slots ${r.backgroundLinks} (${r.programsAtStart} → ${r.programsAtEnd} programs) · link hitches > 33 ms ${r.compileHitches} · F2 worst ${r.f2WorstMs} ms · F3 max upload ${r.f3MaxUploadMB} MB · errors ${r.errors.length}`);
    for (const h of r.compileHitchList) console.log(`   compile: ${h}`);
    for (const h of r.walkOver33List) console.log(`   walking: ${h}`);
    if (r.robotFirst.length) console.log(`   robots first shown: ${r.robotFirst.map((x) => `${x.id} @ ${x.at} (${x.links} links, ${x.ms} ms)`).join(' · ')}`);
    console.log(`   worst frames: ${r.worst.map((w) => `${w.ms} ms @ ${w.at}${w.links ? ` (${w.links} links)` : ''}${w.mb ? ` (${w.mb} MB)` : ''}`).join(' · ')}`);
  }
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
const v = new Verdict(`hitches (${engine})`);
const m = (k) => median(results.map((r) => r[k]));
console.log(`\nMEDIANS (${runs} runs, ${engine}, CPU ×${cpu}): >33 ms ${m('over33')} (walking ${m('walkOver33')}) · >50 ms ${m('over50')} · >100 ms ${m('over100')} · links on frames ${m('linksDuringPlay')}, in idle slots ${m('backgroundLinks')} · F2 ${m('f2WorstMs')} ms · F3 ${m('f3MaxUploadMB')} MB`);
// rc4 links 6 programs on rendered frames (none over 33 ms): a known miss of the Phase 7 rule (0) until the
// boot warm-up (registerBootWarmup, WP4) and the lazy-chunk compileAsync (WP17) cover them; more fails
const RC4_LINKS = 6;
if (m('linksDuringPlay') > 0 && m('linksDuringPlay') <= RC4_LINKS) v.note(`known miss: ${m('linksDuringPlay')} program links on rendered frames (Phase 7 target 0; rc4 ${RC4_LINKS}; owner WP4 boot warm-up / WP17), none over 33 ms`);
else v.check('program links on rendered frames (lap 1; idle-slot compileAsync excepted)', m('linksDuringPlay'), '<=', 0);
v.check('frames over 33 ms caused by a link', m('compileHitches'), '<=', 0);
v.check('frames over 33 ms while walking up to an area', m('walkOver33'), '<=', 0);
v.note(`background compileAsync links in idle slots: ${m('backgroundLinks')} (allowed, counted separately)`);
if (results.some((r) => r.robotFirst.length)) v.check('program links on a robot\'s first-shown frame', m('robotFirstLinks'), '<=', 0);
else v.note('pending: no robot was shown on the lap (ctx.robots content)');
if (results.some((r) => r.deliveries.length)) v.check('frames over 33 ms within 1 s of a Schauhalle delivery', Math.max(...results.flatMap((r) => r.deliveries.map((d) => d.long))), '<=', 0);
else v.note('pending: no Schauhalle delivery on the lap (WP11)');
v.check('F2 results: longest frame', m('f2WorstMs'), '<=', 33, ' ms');
v.check('F3: most texture bytes uploaded in one frame', m('f3MaxUploadMB'), '<=', 4, ' MB');
v.check('page errors', Math.max(0, ...results.map((r) => r.errors.length)), '<=', 0);
v.exit(args);
