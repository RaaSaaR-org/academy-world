// discover-check scenario `boot` (WP-D0): ?discover=1 on the phone profile (Pixel: 4× CPU, 9 Mbit/s,
// 85 ms; iPhone: WebKit) from the link to the first three stops, by touch.
//   - the start card ≤ 6 s, „Los“ to stop 1 ≤ 12 s (plan §2.3); ≤ 150 programs at the start card
//   - every request under /academy-world/, 0 third-party requests, 0 MuJoCo requests, 0 page errors
//   - no lobe's zone:enter (the observer stays out of the lobe plots)
//   - stops by the sheet's › (touch), the top bar's „i / n“, the card, the live line
//   - gestures (pointer events on the canvas): one-finger drag turns the view, pinch zooms, double tap resets;
//     the grip opens the sheet to half height; DE · EN switches the language in place
import { INSTRUMENT } from '../lib/measure.mjs';

export const scenario = { name: 'boot', quick: true };

const ENTERS = `(() => { const iv = setInterval(() => { const g = window.__academy && window.__academy.game; if (g && g.events) { clearInterval(iv); window.__dcEnters = []; g.events.on('zone:enter', (p) => window.__dcEnters.push(p && p.id)); } }, 10); })();`;
const LOBES = new Set(['sensordom', 'regelgarten', 'greifwerkstatt', 'lern-dojo', 'dunkelfabrik', 'prueffeld']);

/** tap an element's centre with the touchscreen (the mouse on a profile without touch) */
export async function tapEl(t, page, selector) {
  const r = await page.evaluate((sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, selector);
  if (!r) throw new Error(`no element ${selector}`);
  if (t.dev.touch) await page.touchscreen.tap(r.x, r.y);
  else await page.mouse.click(r.x, r.y);
}

/** the camera's yaw / pitch (degrees) and fov, as __academy.look reads them */
const CAM = () => {
  const c = window.__academy.game.camera;
  const e = c.getWorldDirection(c.position.clone());
  return { yaw: (Math.atan2(-e.x, -e.z) * 180) / Math.PI, pitch: (Math.asin(e.y) * 180) / Math.PI, fov: c.fov, pos: c.position.toArray() };
};

/** pointer events on the canvas (touch): a drag of dx, dy px; a pinch by `scale` */
const GESTURE = ([kind, a, b]) => {
  const cv = document.getElementById('game');
  const r = cv.getBoundingClientRect();
  const cx = r.left + r.width / 2,
    cy = r.top + r.height * 0.4;
  const ev = (type, id, x, y) => cv.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  if (kind === 'drag') {
    ev('pointerdown', 1, cx, cy);
    for (let i = 1; i <= 10; i++) ev('pointermove', 1, cx + (a * i) / 10, cy + (b * i) / 10);
    ev('pointerup', 1, cx + a, cy + b);
  } else if (kind === 'pinch') {
    const d0 = 60;
    ev('pointerdown', 1, cx - d0, cy);
    ev('pointerdown', 2, cx + d0, cy);
    for (let i = 1; i <= 10; i++) {
      const d = d0 * (1 + ((a - 1) * i) / 10);
      ev('pointermove', 1, cx - d, cy);
      ev('pointermove', 2, cx + d, cy);
    }
    ev('pointerup', 1, cx - d0 * a, cy);
    ev('pointerup', 2, cx + d0 * a, cy);
  } else if (kind === 'tap') {
    ev('pointerdown', 1, cx, cy);
    ev('pointerup', 1, cx, cy);
  }
};

export default async function run(t) {
  const h = await t.open('?discover=1&stills=0', { init: [INSTRUMENT, ENTERS], waitUntil: 'commit' });
  const { page } = h;
  const t0 = Date.now();
  await t.waitState(page, (s) => s.startCard, 180000);
  const startS = (Date.now() - t0) / 1000;
  const progs = await page.evaluate(() => window.__academy.game.rs.info().programs);
  t.check('start card after (4G, CPU throttled on Chromium)', startS, '<=', 6, ' s');
  t.check('programs at the start card', progs, '<=', 150);
  await t.shot(page, 'start');

  const stops = await page.evaluate(() => window.__discover.stops());
  const n = Math.min(3, stops.length);
  const tGo = Date.now();
  await tapEl(t, page, '.dsc-start [data-action="go"]');
  let s = await t.waitState(page, (s) => s.stop != null && !s.flying && s.snap === 'peek', 120000);
  const losS = (Date.now() - tGo) / 1000;
  t.check('„Los“ to stop 1 (areas ready, flown)', losS, '<=', 12, ' s');
  t.require('stop 1 is the first stop', s.stop === stops[0].id, `${s.stop} / ${stops[0].id}`);
  await t.shot(page, `stop1-${stops[0].id}`);

  for (let i = 1; i < n; i++) {
    await tapEl(t, page, '.dsc-sheet .dsc-nav.next');
    s = await page
      .waitForFunction((id) => { const st = window.__discover.state(); return st.stop === id && !st.flying && st.snap === 'peek'; }, stops[i].id, { timeout: 120000, polling: 50 })
      .then(() => t.state(page), () => t.state(page));
    const top = await page.evaluate(() => document.querySelector('.dsc-stepn')?.textContent);
    t.require(`› reaches stop ${i + 1} (${stops[i].id})`, s.stop === stops[i].id && top === `${i + 1} / ${stops.length}`, `${s.stop} · ${top}`);
  }
  await page.waitForFunction(() => document.querySelector('.dsc-live')?.textContent, null, { timeout: 3000 }).catch(() => {});
  const live = await page.evaluate(() => document.querySelector('.dsc-live')?.textContent ?? '');
  t.require('the live line announces the stop', live.length > 0, live);
  await t.shot(page, `stop${n}-peek`);

  // the sheet: the grip opens it to half height
  await tapEl(t, page, '.dsc-sheet .dsc-grip');
  await page.waitForTimeout(500);
  const snap = (await t.state(page)).snap;
  const sheetH = await page.evaluate(() => document.querySelector('.dsc-sheet').getBoundingClientRect().height / innerHeight);
  t.require('the grip opens the sheet to half height', snap === 'half', snap);
  t.check('the 3D view keeps ≥ 55 % at half height (sheet share)', sheetH, '<=', 0.45 + 0.02);
  await t.shot(page, `stop${n}-half`);
  await tapEl(t, page, '.dsc-sheet .dsc-grip');

  // gestures on the canvas
  await page.waitForTimeout(300);
  const c0 = await page.evaluate(CAM);
  await page.evaluate(GESTURE, ['drag', 120, 0]);
  await page.waitForTimeout(700);
  const c1 = await page.evaluate(CAM);
  const dYaw = Math.abs(((c1.yaw - c0.yaw + 540) % 360) - 180);
  t.require('a one-finger drag turns the view', dYaw > 3, `Δyaw ${dYaw.toFixed(1)}°`);
  await page.evaluate(GESTURE, ['pinch', 1.6]);
  await page.waitForTimeout(400);
  const c2 = await page.evaluate(CAM);
  const zoomed = Math.abs(c2.fov - c1.fov) > 0.5 || Math.hypot(c2.pos[0] - c1.pos[0], c2.pos[1] - c1.pos[1], c2.pos[2] - c1.pos[2]) > 0.5;
  t.require('a pinch zooms (field of view or distance)', zoomed, `fov ${c1.fov.toFixed(1)} → ${c2.fov.toFixed(1)}`);
  await page.evaluate(GESTURE, ['tap']);
  await page.waitForTimeout(80);
  await page.evaluate(GESTURE, ['tap']);
  await page.waitForTimeout(1200);
  const c3 = await page.evaluate(CAM);
  const back = Math.abs(((c3.yaw - c0.yaw + 540) % 360) - 180);
  t.require('a double tap resets the stop pose', back < 1.5 && Math.abs(c3.fov - c0.fov) < 0.5, `Δyaw ${back.toFixed(2)}°, fov ${c3.fov.toFixed(1)}`);

  // DE · EN in place
  const lang0 = (await t.state(page)).lang;
  const other = lang0 === 'de' ? 'en' : 'de';
  const title0 = await page.evaluate(() => document.querySelector('.dsc-stept')?.textContent);
  await tapEl(t, page, `.dsc-lang-btn[lang="${other}"]`);
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ lang: window.__discover.state().lang, title: document.querySelector('.dsc-stept')?.textContent, html: document.documentElement.lang }));
  t.require(`DE · EN switches to ${other.toUpperCase()} in place`, after.lang === other && after.html === other, JSON.stringify(after) + ` (was ${title0})`);

  // the rules of the whole run
  const enters = await page.evaluate(() => window.__dcEnters ?? []);
  const lobeEnters = enters.filter((id) => LOBES.has(id));
  t.check('lobe zone:enter events', lobeEnters.length, '<=', 0);
  const urls = h.requests.map((r) => r.url);
  t.check('third-party requests', t.thirdParty(h.requests).length, '<=', 0);
  t.check('requests outside /academy-world/', t.outside(h.requests).length, '<=', 0);
  const mj = urls.filter((u) => /mujoco|duck\.worker|duck-rec|\/duck-[\w-]+\.bin/i.test(u));
  t.check('MuJoCo / duck worker requests', mj.length, '<=', 0);
  if (mj.length) t.log(mj.map((u) => new URL(u).pathname).join(', '));
  t.check('page and console errors', h.errors.length, '<=', 0);
  if (h.errors.length) t.log(h.errors.slice(0, 4));
  t.log(`start card ${startS.toFixed(1)} s · „Los“ → stop 1 ${losS.toFixed(1)} s · ${progs} programs · enters ${JSON.stringify(enters)}`);
  await h.close();
}
