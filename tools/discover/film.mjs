// discover-check scenario `film` (WP-D3, plan §5 WP-D3): the lift-off on the live engine, at 390×844.
//   flight   the tour's first stop → modes.enter('film', { stills: false }): the director in its flight mode,
//            the camera detached (game.cameraDriver null), #hud.film shows the subtitles and the lift-off
//            card, „Überspringen“ (a touch tap) skips to the level-off ('dusk' within 4 s), the end card
//            („Am Laptop spielen“, „Nochmal ansehen“, „Zurück zur Tour“), the island airborne, the shakes
//            decayed; „Zurück zur Tour“: docked (ground, h 0), the camera attached, the observer following,
//            the tour at its first stop, EMI-01's voice off, no evening left on the docked island
//   stills   prefers-reduced-motion: modes.enter('film', {}) picks the director's stills version on its
//            own and plays it to the level-off without a skip; enter() resolves at the end card (the
//            bench waits for that); „Nochmal ansehen“ plays it again from the dock (skipped this time)
//   both     0 page errors, 0 third-party requests, every request under /academy-world/
// Screenshots (artifacts/discover/<device>/film-*.png): start, middle, end card, dusk (sheet collapsed).
import { tapEl } from './boot.mjs';

export const scenario = { name: 'film' };

/** the film's events, recorded from the first frame the game exists */
const REC = `(() => { const iv = setInterval(() => { const g = window.__academy && window.__academy.game; if (g && g.events) { clearInterval(iv); window.__dcFilm = []; for (const ev of ['flight:phase', 'finale:dusk', 'liftoff:replay', 'liftoff:skip']) g.events.on(ev, (p) => window.__dcFilm.push({ ev, t: performance.now(), name: p && p.name, h: p && p.h, dusk: p && p.t, stills: p && p.stills })); } }, 10); })();`;
const PHONE = { width: 390, height: 844 };

const film = (page) =>
  page.evaluate(async () => {
    const g = window.__academy.game;
    const lo = window.__academy.ext('liftoff');
    const s = window.__discover.state();
    return {
      mode: s.mode,
      card: s.card,
      snap: s.snap,
      stop: s.stop,
      observer: s.observer,
      driver: !!g.cameraDriver,
      hud: g.hud.root.className,
      flight: g.quest.snapshot().flight.state,
      alt: g.worldCtx ? g.worldCtx.flight.altitude : null,
      director: lo ? await lo() : null,
      shake: g.player.shakeTime,
      volEmi: g.settings.data.volEmi,
      skip: !!document.querySelector('.dsc-film-skip:not([hidden])'),
      dialogue: getComputedStyle(document.getElementById('dialogue')).visibility,
      events: window.__dcFilm.length,
    };
  });
const since = (page, k) => page.evaluate((k) => window.__dcFilm.slice(k), k);

async function toFirstStop(t, h) {
  await t.waitState(h.page, (s) => s.startCard && s.ready, 240000);
  await h.page.evaluate(() => window.__discover.start());
  return t.waitState(h.page, (s) => s.mode === 'tour' && s.stop != null && !s.flying && s.snap === 'peek', 180000);
}

export default async function run(t) {
  const dev = { ...t.dev, context: { ...t.dev.context, viewport: PHONE } };

  // ── the flight version, skipped ───────────────────────────────────────────────────────────
  {
    const h = await t.open('?discover=1&stills=0&lang=de', { dev, init: [REC], waitUntil: 'commit' });
    const { page } = h;
    const first = await toFirstStop(t, h);
    const k0 = (await film(page)).events;
    const entered = page.evaluate(() => window.__discover.handle.modes.enter('film', { stills: false }).then(() => performance.now()));
    await page.waitForFunction(() => document.querySelector('.dsc-film-skip:not([hidden])'), null, { timeout: 120000 });
    const ev0 = await since(page, k0);
    t.require('film: liftoff:replay { from: discover, stills: false }', ev0.some((e) => e.ev === 'liftoff:replay' && e.stills === false), JSON.stringify(ev0.filter((e) => e.ev !== 'finale:dusk').slice(0, 4)));
    await page.waitForTimeout(3000);
    let f = await film(page);
    t.require('film: the director flies (flight mode, running)', f.director && f.director.running && f.director.mode === 'flight', JSON.stringify(f.director && { mode: f.director.mode, phase: f.director.phase }));
    t.require('film: the camera is detached (the engine draws)', !f.driver && f.mode === 'film', `driver ${f.driver} · mode ${f.mode}`);
    t.require('film: #hud.film without .no-hud, the subtitles visible', /\bfilm\b/.test(f.hud) && !/\bno-hud\b/.test(f.hud) && f.dialogue === 'visible', f.hud);
    t.require('film: EMI-01 speaks (voice on)', f.volEmi > 0, String(f.volEmi));
    await t.shot(page, 'start');
    // the middle: after the lift-off (the climb, the outside shot or the cloud)
    await page.waitForFunction(() => window.__dcFilm.some((e) => e.ev === 'flight:phase' && e.name === 'liftoff'), null, { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(6000);
    await t.shot(page, 'middle');
    f = await film(page);
    t.log(`middle: phase ${f.director && f.director.phase} · h ${f.director && f.director.h} m · shot ${f.director && f.director.shot}`);

    // „Überspringen“
    const k1 = f.events;
    const tSkip = Date.now();
    await tapEl(t, page, '.dsc-film-skip');
    await page.waitForFunction((k) => window.__dcFilm.slice(k).some((e) => e.ev === 'flight:phase' && e.name === 'dusk' && e.h > 0), k1, { timeout: 15000 }).catch(() => {});
    const skipS = (Date.now() - tSkip) / 1000;
    t.check('film: „Überspringen“ to the level-off', skipS, '<=', 4, ' s');
    const tEnd = await entered;
    await t.waitState(page, (s) => s.card === 'film:end' && s.snap === 'half', 15000).catch(() => {});
    f = await film(page);
    t.require('film: enter() resolved, the end card is up', !!tEnd && f.card === 'film:end' && f.snap === 'half', `${f.card} · ${f.snap}`);
    const actions = await page.evaluate(() => [...document.querySelectorAll('.dsc-sheet .dsc-actions [data-action]')].map((b) => b.dataset.action));
    t.require('film: end card actions (laptop, again, tour)', JSON.stringify(actions) === JSON.stringify(['laptop', 'again', 'tour']), JSON.stringify(actions));
    t.require('film: airborne after the film', f.flight === 'airborne' && f.alt > 500, `${f.flight} · h ${f.alt}`);
    t.require('film: no „Überspringen“ on the end card', !f.skip);
    await page.waitForTimeout(800);
    t.check('film: the shakes decay (shake time left)', Math.max(0, f.shake), '<=', 0, ' s');
    await t.shot(page, 'end');
    // the dusk behind it (the user collapses the sheet)
    await page.waitForTimeout(14000);
    await page.evaluate(() => window.__discover.handle.sheet.setSnap('peek'));
    await page.waitForTimeout(600);
    await t.shot(page, 'dusk');
    await page.evaluate(() => window.__discover.handle.sheet.setSnap('half'));
    await page.waitForTimeout(400);

    // „Zurück zur Tour“ (while the ending's dusk still blends in)
    await tapEl(t, page, '.dsc-sheet [data-action="tour"]');
    const back = await t.waitState(page, (s) => s.mode === 'tour' && s.card && s.card !== 'film:end' && s.snap === 'peek' && !s.flying, 180000).catch(() => null);
    f = await film(page);
    t.require('film: „Zurück zur Tour“ → the first stop', !!back && back.stop === first.stop, `${back && back.stop} / ${first.stop}`);
    t.require('film: docked again (ground, h 0)', f.flight === 'ground' && f.alt === 0, `${f.flight} · h ${f.alt}`);
    t.require('film: the camera attached, the observer following', f.driver && f.observer === 'follow', `driver ${f.driver} · ${f.observer}`);
    t.require('film: #hud back in its Discover state (no .film, .no-hud)', !/\bfilm\b/.test(f.hud) && /\bno-hud\b/.test(f.hud), f.hud);
    t.require('film: EMI-01 silent in the tour', f.volEmi === 0, String(f.volEmi));
    await page.waitForTimeout(2500);
    const dusk = await page.evaluate(() => window.__dcFilm.filter((e) => e.ev === 'finale:dusk').slice(-1)[0]?.dusk ?? 0);
    t.check('film: no evening on the docked island (last finale:dusk t)', dusk, '<=', 0);
    t.check('film: third-party requests', t.thirdParty(h.requests).length, '<=', 0);
    t.check('film: requests outside /academy-world/', t.outside(h.requests).length, '<=', 0);
    t.check('film: page and console errors', h.errors.length, '<=', 0);
    if (h.errors.length) t.log(h.errors.slice(0, 4));
    await h.close();
  }

  // ── the stills version under reduced motion, to the end ───────────────────────────────────────
  {
    const h = await t.open('?discover=1&stills=0&lang=de', { dev, init: [REC], waitUntil: 'commit', reducedMotion: true });
    const { page } = h;
    await toFirstStop(t, h);
    const k0 = (await film(page)).events;
    const t0 = Date.now();
    const entered = page.evaluate(() => window.__discover.handle.modes.enter('film', {}).then(() => true));
    await page.waitForFunction(() => document.querySelector('.dsc-film-skip:not([hidden])'), null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    let f = await film(page);
    t.require('stills: reduced motion picks the director’s stills version', f.director && f.director.mode === 'stills', JSON.stringify(f.director && f.director.mode));
    const done = await Promise.race([entered, new Promise((r) => setTimeout(() => r(false), 150000))]);
    const filmS = (Date.now() - t0) / 1000;
    const ev = await since(page, k0);
    const names = ev.filter((e) => e.ev === 'flight:phase' && e.name !== 'downwash').map((e) => e.name);
    t.require('stills: plays to the level-off unskipped (… breakout, level, dusk)', done && !ev.some((e) => e.ev === 'liftoff:skip') && ['breakout', 'level', 'dusk'].every((n) => names.includes(n)), names.join(' '));
    t.log(`stills film ${filmS.toFixed(0)} s: ${names.join(' · ')}`);
    f = await film(page);
    t.require('stills: enter() resolved at the end card', f.card === 'film:end', String(f.card));
    // „Nochmal ansehen“: from the dock again (once the sheet slid up)
    await page.waitForTimeout(700);
    const k1 = f.events;
    await tapEl(t, page, '.dsc-sheet [data-action="again"]');
    await page.waitForFunction((k) => window.__dcFilm.slice(k).some((e) => e.ev === 'flight:phase' && e.name === 'spinup'), k1, { timeout: 60000 }).catch(() => {});
    await page.waitForFunction(() => document.querySelector('.dsc-film-skip:not([hidden])'), null, { timeout: 30000 }).catch(() => {});
    const again = await since(page, k1);
    t.require('stills: „Nochmal ansehen“ docks and starts again', again.some((e) => e.ev === 'flight:phase' && e.name === 'dusk' && e.h === 0) && again.some((e) => e.ev === 'flight:phase' && e.name === 'spinup'), again.filter((e) => e.ev === 'flight:phase').map((e) => e.name).join(' '));
    await tapEl(t, page, '.dsc-film-skip');
    await t.waitState(page, (s) => s.card === 'film:end' && s.snap === 'half', 20000).catch(() => {});
    f = await film(page);
    t.require('stills: skipped again to the end card', f.card === 'film:end' && f.flight === 'airborne', `${f.card} · ${f.flight}`);
    t.check('stills: third-party requests', t.thirdParty(h.requests).length, '<=', 0);
    t.check('stills: page and console errors', h.errors.length, '<=', 0);
    if (h.errors.length) t.log(h.errors.slice(0, 4));
    await h.close();
  }
}
