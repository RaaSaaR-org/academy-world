// discover-check scenario `perf` (WP-D0, plan §2.3, §2.4): every stop (the spike's 3, or D1's 12):
// discover:goto, then 4 s dwell, recorded (tools/lib/measure.mjs INSTRUMENT); the flight on its own.
//   hard        0 program links in a frame during flights (the pre-roll compiles first); ≤ 220 main-pass
//               draws and ≤ 0.9 M triangles at each stop
//   indicative  (the desktop GPU predicts nothing; --strict makes them fail): JS p90 ≤ 12 ms dwelling,
//               ≤ 16 ms in flight; 0 frames > 50 ms dwelling, ≤ 2 in the first second after arrival;
//               ≤ 4 MB texture upload per frame
// Pixel profile: Chromium, 4× CPU; iPhone profile: WebKit unthrottled (stalls WebKit alone shows).
import { DRAWS_BY_OWNER } from '../lib/drawcalls.mjs';
import { INSTRUMENT, record } from '../lib/measure.mjs';

export const scenario = { name: 'perf' };

/** in-page: the times of the frames while __discover says flying */
const WATCH = () => {
  const W = (window.__dcFly = { t: [], on: true });
  const tick = (now) => {
    if (!W.on) return;
    if (window.__discover?.state().flying) W.t.push(now);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
/** in-page: the INSTRUMENT frames inside the flying window */
const FLIGHT = () => {
  window.__dcFly.on = false;
  window.__perf.stop();
  const W = window.__dcFly.t;
  if (!W.length) return { n: 0, js: [], link: 0, texB: 0 };
  const a = W[0] - 20,
    b = W[W.length - 1] + 20;
  const fr = window.__perf.frames.filter((x) => x.t >= a && x.t <= b);
  return { n: fr.length, js: fr.map((x) => x.ms), link: fr.reduce((s, x) => s + (x.d.link || 0), 0), texB: Math.max(0, ...fr.map((x) => x.d.texB || 0)) };
};

const pct = (a, q) => {
  const s = a.slice().sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
};

export default async function run(t) {
  const h = await t.open('?discover=1&stills=0', { init: [INSTRUMENT] });
  const { page } = h;
  await t.waitState(page, (s) => s.startCard, 180000);
  let stops = await page.evaluate(() => window.__discover.stops());
  if (t.quick) stops = stops.slice(0, 3);
  await page.evaluate(() => window.__discover.start());
  await t.waitState(page, (s) => s.stop != null && !s.flying, 120000);
  const rows = [];
  const flightJs = [];
  for (const [i, st] of stops.entries()) {
    let fly = { n: 0, js: [], link: 0, texB: 0 };
    if (i > 0) {
      await page.evaluate(WATCH);
      await page.evaluate(() => window.__perf.start());
      await page.evaluate((id) => window.__discover.goto(id), st.id);
      fly = await page.evaluate(FLIGHT);
      flightJs.push(...fly.js);
    }
    const rec = await record(page, 4000);
    const frames = rec.raw.frames;
    const iv = [];
    for (let k = 1; k < frames.length; k++) iv.push(frames[k].t - frames[k - 1].t);
    const firstSec = iv.filter((_, k) => frames[k + 1].t - frames[0].t < 1000);
    const dwellLinks = frames.reduce((s, f) => s + (f.d.link ?? 0), 0);
    const maxTexB = Math.max(0, ...frames.map((f) => f.d.texB ?? 0), fly.texB);
    // the count spans one animation frame: lift the tier's frame cap for it (a capped rAF draws nothing)
    const cap = await page.evaluate(() => {
      const g = window.__academy.game;
      const c = g.frameCapMs;
      g.frameCapMs = 0;
      return c;
    });
    const draws = await page.evaluate(DRAWS_BY_OWNER);
    await page.evaluate((c) => (window.__academy.game.frameCapMs = c), cap);
    const tris = await page.evaluate(() => window.__academy.game.rs.info().triangles);
    const row = { id: st.id, jsP90: rec.js.p90, over50: rec.over50, arrivalOver50: firstSec.filter((x) => x > 50).length, flyFrames: fly.n, flyLinks: fly.link, flyJsP90: pct(fly.js, 0.9), dwellLinks, mainDraws: draws.total, tris, maxTexMB: Math.round((maxTexB / 1048576) * 100) / 100, ivP90: pct(iv, 0.9) };
    rows.push(row);
    if (i > 0) t.check(`${st.id}: program links during the flight`, fly.link, '<=', 0);
    t.check(`${st.id}: main-pass draws`, draws.total, '<=', 220);
    t.check(`${st.id}: triangles (all passes)`, tris / 1e6, '<=', 0.9, ' M');
    t.indicative(`${st.id}: JS p90 dwelling`, rec.js.p90, '<=', 12, ' ms');
    t.indicative(`${st.id}: frames > 50 ms dwelling`, rec.over50 - row.arrivalOver50, '<=', 0);
    t.indicative(`${st.id}: frames > 50 ms in the first second`, row.arrivalOver50, '<=', 2);
    t.indicative(`${st.id}: texture upload per frame`, row.maxTexMB, '<=', 4, ' MB');
  }
  if (flightJs.length) t.indicative('JS p90 in flight (all hops)', pct(flightJs, 0.9), '<=', 16, ' ms');
  t.log(JSON.stringify(rows));
  t.check('page errors', h.errors.length, '<=', 0);
  await h.close();
}
