// discover-check scenario `gate` (WP-D0): the pre-boot gate's paths into Discover and the stills fork.
//   default    the phone without ?discover: DISCOVER_DEFAULT_ON_TOUCH is true (founder, 2026-10-23), so
//              Discover's start card (or the stills tour), no mouse-and-keyboard notice; with the flag
//              false: the notice, and the gate does not open Discover
//   discover   ?discover=1: no notice, the start card over the 3D island
//   desktop    no flag: the game's title as before (no Discover layer, no seam active); ?discover=1 works too
//   stills     ?stills=1: the stills tour, no game / Rapier / world chunk / GLB requested, ≤ 400 KB before
//              the first image
//   crash      a crash marker of the last 3D session → stills ('crash'), then remembered ('session')
//   memory     navigator.deviceMemory 2 → stills ('memory'); &stills=0 → 3D; „3D-Ansicht versuchen“ → 3D
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/measure.mjs';
import { DEVICES } from '../lib/devices.mjs';

export const scenario = { name: 'gate', quick: true };

// the game's notice (core.start.touch), not Discover's own laptop note, which names mouse and keyboard too
const NOTICE = /braucht Maus und Tastatur|needs a mouse and keyboard/;
const FORBIDDEN = /\/assets\/(Game|world|rapier[\w.]*)-[\w-]+\.js$|\.wasm$|\.glb$/;
const defaultOnTouch = /DISCOVER_DEFAULT_ON_TOUCH(?:\s*:\s*boolean)?\s*=\s*true/.test(fs.readFileSync(path.join(ROOT, 'src', 'discover', 'flags.ts'), 'utf8'));
const MEM2 = `Object.defineProperty(Navigator.prototype, 'deviceMemory', { configurable: true, get: () => 2 });`;
const CRASH = `try { if (!sessionStorage.getItem('dc-seeded')) { sessionStorage.setItem('dc-seeded', '1'); sessionStorage.setItem('emai-academy-island/v1:discover-alive', JSON.stringify({ stop: 'schauhalle', t: Date.now() })); } } catch (e) {}`;

export default async function run(t) {
  // ── Discover by default (or the notice while the flag is false) ──
  {
    const h = await t.open('', { throttle: false });
    await h.page.waitForTimeout(1500);
    const r = await h.page.evaluate(() => ({ text: document.body.innerText, gate: window.__emaiGate ? { reason: window.__emaiGate.reason, discover: window.__emaiGate.discover } : null, touchOnly: matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches }));
    if (!r.touchOnly) t.note(`default: this engine does not report a touch-only pointer (${t.engine}); the phone's default is checked on the Pixel profile`);
    else if (defaultOnTouch) {
      const s = await t.waitState(h.page, (s) => s.startCard, 150000).catch(() => null);
      const text = await h.page.evaluate(() => document.body.innerText);
      t.require('DISCOVER_DEFAULT_ON_TOUCH: a touch-only phone without ?discover lands in Discover', !!s && r.gate?.discover === true && r.gate?.reason == null, JSON.stringify({ gate: r.gate, path: s?.path }));
      t.require('DISCOVER_DEFAULT_ON_TOUCH: no mouse-and-keyboard notice, the start card says where the full game is', !NOTICE.test(r.text) && !NOTICE.test(text) && /Laptop oder Desktop|laptop or desktop/.test(text), text.replace(/\s+/g, ' ').slice(0, 160));
      await t.shot(h.page, 'default');
    } else {
      t.require('no flag: the touch notice shows', NOTICE.test(r.text), r.text.slice(0, 80));
      t.require('no flag: the gate does not open Discover', r.gate?.discover === false && r.gate?.reason === 'touch');
    }
    await h.close();
  }
  // ── ?discover=1 ──
  {
    const h = await t.open('?discover=1&stills=0', { throttle: false });
    const s = await t.waitState(h.page, (s) => s.startCard, 150000).catch(() => null);
    const r = await h.page.evaluate(() => ({ text: document.body.innerText, discover: window.__emaiGate?.discover, hud: document.getElementById('hud')?.className ?? '' }));
    t.require('?discover=1: the start card shows', !!s?.startCard);
    t.require('?discover=1: no touch notice', !NOTICE.test(r.text.split('\n').slice(0, 3).join(' ')) && r.discover === true);
    t.require('?discover=1: the HUD is in discover mode', /\bdiscover\b/.test(r.hud), r.hud);
    t.check('?discover=1: page errors', h.errors.length, '<=', 0);
    if (h.errors.length) t.log(h.errors.slice(0, 3));
    await t.shot(h.page, 'start');
    await h.close();
  }
  // ── the desktop: unchanged without the flag ──
  {
    const h = await t.open('', { throttle: false, dev: DEVICES.desktop });
    await h.page.waitForFunction(() => window.__academy && window.__academy.ready, null, { timeout: 150000 });
    const r = await h.page.evaluate(() => {
      const g = window.__academy.game;
      return { phase: g.phase, dsc: !!document.querySelector('.dsc'), discover: window.__emaiGate?.discover, driver: !!g.cameraDriver, hook: !!g.frameHook, cap: g.frameCapMs, scale: g.zones.tierScale, pinned: !!g.rs.pinned, memory: g.progress.readOnly };
    });
    t.require('desktop, no flag: the title, no Discover layer and every seam inert', r.phase === 'start' && !r.dsc && r.discover === false && !r.driver && !r.hook && r.cap === 0 && r.scale === 1 && !r.pinned, JSON.stringify(r));
    t.check('desktop, no flag: page errors', h.errors.length, '<=', 0);
    await h.close();
  }
  // ── stills forced ──
  {
    const from = Date.now();
    const h = await t.open('?discover=1&stills=1', { throttle: false });
    const s = await t.waitState(h.page, (s) => s.path === 'stills' && s.startCard, 60000).catch(() => null);
    await h.page.waitForTimeout(1200);
    const log = t.serverLog.filter((e) => e.t >= from && e.status === 200);
    const before = log.filter((e) => !/\.webp$/.test(e.path)).reduce((a, e) => a + e.br, 0) / 1024;
    const bad = h.requests.map((r) => r.url).filter((u) => FORBIDDEN.test(new URL(u).pathname));
    t.require('?stills=1: the stills tour starts', s?.path === 'stills' && s.reason === 'forced');
    t.require('?stills=1: no game, Rapier, world chunk or GLB requested', bad.length === 0, bad.slice(0, 3).join(', '));
    t.check('?stills=1: transferred before the first image (brotli)', before, '<=', 400, ' KB');
    t.check('?stills=1: page errors', h.errors.length, '<=', 0);
    await t.shot(h.page, 'stills-start');
    await h.page.evaluate(() => window.__discover.start());
    await h.page.waitForTimeout(800);
    await t.shot(h.page, 'stills-stop1');
    await h.close();
  }
  // ── the crash marker, then the session's choice ──
  {
    const h = await t.open('?discover=1', { throttle: false, init: [CRASH] });
    const s = await t.waitState(h.page, (s) => s.path === 'stills', 60000).catch(() => null);
    t.require('crash marker: the next boot runs the stills tour', s?.reason === 'crash', JSON.stringify(s?.reason));
    await h.page.goto(t.url + '?discover=1', { waitUntil: 'domcontentloaded' });
    const s2 = await t.waitState(h.page, (s) => s.path === 'stills', 60000).catch(() => null);
    t.require('crash marker: the choice holds for the session', s2?.reason === 'session', JSON.stringify(s2?.reason));
    const ls = await h.page.evaluate(() => Object.keys(localStorage).filter((k) => /discover/.test(k)));
    t.require('the stills choice is in sessionStorage only', ls.length === 0, ls.join(', '));
    await h.close();
  }
  // ── deviceMemory ≤ 3, ?stills=0, and „3D-Ansicht versuchen“ ──
  {
    const h = await t.open('?discover=1', { throttle: false, init: [MEM2] });
    const s = await t.waitState(h.page, (s) => s.path === 'stills', 60000).catch(() => null);
    t.require('deviceMemory 2: the stills tour', s?.reason === 'memory', JSON.stringify(s?.reason));
    await h.page.evaluate(() => {
      document.querySelector('.dsc-menu-btn').click();
      document.querySelector('.dsc-menu [data-id="try3d"]').click();
    });
    const s2 = await t.waitState(h.page, (s) => s.path === '3d' && s.startCard, 150000).catch(() => null);
    t.require('„3D-Ansicht versuchen“: reloads into 3D for the session', s2?.path === '3d');
    await h.close();
    const h2 = await t.open('?discover=1&stills=0', { throttle: false, init: [MEM2] });
    const s3 = await t.waitState(h2.page, (s) => s.startCard, 150000).catch(() => null);
    t.require('?stills=0: 3D despite deviceMemory 2', s3?.path === '3d');
    await h2.close();
  }
}
