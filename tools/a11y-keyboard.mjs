#!/usr/bin/env node
// Keyboard-only path through the menus, focus visibility and dialog semantics (promoted from the
// phase 6 ux-browsers-a11y audit, a11y.mjs). Plan item C5 (+ W7 for the certificate, not covered).
//
//   node tools/a11y-keyboard.mjs [--browsers chromium,firefox,webkit] [--dev | --dist <dir> | --base <url>]
//
// Per browser: Tab through the title (Start, mode, language must be reached; Enter starts), the
// pause menu (every setting reachable, → moves a slider), the Pass (its tabs reachable) and the map
// („Hinreisen“ reachable); the focus ring's contrast against what is behind it (≥ 3:1); and while
// playing on the canvas Tab still opens the Pass and ← → still turn. Chromium also stores ARIA
// snapshots of the pause menu, the Pass, the map and the HUD. Deterministic, so one run per browser.
// Phase 7 (WP1's title and credits, plan WP1 acceptance): the three title states — first visit (above),
// grounded with progress („Weiterspielen“; the v2-present save fixture) and airborne („Im Dock
// weiterspielen“ #dock-btn, „Abheben ansehen“ #replay-btn; the same save, flown) — each with Start, the
// mode cards and the credits link reachable by Tab; and the credits page („Credits & Lizenzen“) from the
// title and from the pause menu: Enter opens it as a dialog, focus moves in and stays in, Esc closes it
// and focus returns to where it was.
// Firefox / WebKit need `npx playwright install firefox webkit` (or FIREFOX_EXE + PW_CORE_FIREFOX …).
// Writes artifacts/<PT_DIR|measure>/a11y-keyboard-<browser>.json; exit 1 when a check fails.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, Verdict, gameServer, launchEngine, loadAllAreas, parseArgs, saveJson, list } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const browsers = list(args.browsers, ['chromium']);

/** In-page: describe the focused element, including its focus ring and the ring's contrast. */
const DESCRIBE = () => {
  const e = document.activeElement;
  if (!e || e === document.body || e === document.documentElement) return { tag: e ? e.tagName.toLowerCase() : null };
  const parse = (c) => {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05);
  const over = (top, bot) => [0, 1, 2].map((i) => top[i] * top[3] + bot[i] * (1 - top[3]));
  const cs = getComputedStyle(e);
  const r = e.getBoundingClientRect();
  const ow = parseFloat(cs.outlineWidth) || 0;
  const hasOutline = cs.outlineStyle !== 'none' && ow > 0;
  const hasShadow = !!cs.boxShadow && cs.boxShadow !== 'none';
  // what is behind the ring: the ancestors' backgrounds (the element's own box is inside the ring)
  let bg = [20, 20, 20];
  const stack = [];
  for (let a = e.parentElement; a; a = a.parentElement) {
    const b = parse(getComputedStyle(a).backgroundColor);
    if (b && b[3] > 0) {
      stack.push(b);
      if (b[3] >= 0.999) break;
    }
  }
  for (let k = stack.length - 1; k >= 0; k--) bg = over(stack[k], bg);
  let ringContrast = null;
  if (hasOutline) {
    const oc = parse(cs.outlineColor);
    if (oc) ringContrast = ratio(over(oc, bg), bg);
  } else if (hasShadow) {
    const sc = parse(cs.boxShadow.match(/rgba?\([^)]+\)/)?.[0]);
    if (sc) ringContrast = ratio(over(sc, bg), bg);
  }
  let fv = null;
  try {
    fv = e.matches(':focus-visible');
  } catch {}
  return {
    tag: e.tagName.toLowerCase(),
    id: e.id || undefined,
    cls: (typeof e.className === 'string' ? e.className : '').slice(0, 40) || undefined,
    text: (e.textContent || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
    type: e.getAttribute('type') || undefined,
    inModal: e.closest('.modal') ? e.closest('.modal').className.split(' ').slice(0, 3).join('.') : null,
    inStart: !!e.closest('#start'),
    focusVisible: fv,
    ring: hasOutline || hasShadow,
    ringContrast: ringContrast == null ? null : Math.round(ringContrast * 100) / 100,
    inView: r.width > 0 && r.bottom > 0 && r.top < innerHeight,
  };
};

async function tabWalk(page, n) {
  const seq = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(110);
    seq.push(await page.evaluate(DESCRIBE));
  }
  return seq;
}
const key = (d) => (d ? `${d.tag}${d.id ? '#' + d.id : ''}${d.cls ? '.' + d.cls.split(' ')[0] : ''}:${d.text}` : 'null');

/** The save fixtures (WP1, tools/fixtures/saves): a grounded v2 save with progress, and the same save flown. */
const STORE_PREFIX = 'emai-academy-island/v1:';
function titleSaves() {
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/saves/v2-present.json'), 'utf8'));
  const grounded = fx.storage;
  const v2 = JSON.parse(JSON.stringify(grounded['progress.v2']));
  const q = v2.zoneData.world['p7.quest'];
  q.flight = { state: 'airborne', firstFlightAt: (v2.migratedAt ?? 1792003600000) + 3600000, liftoffSeen: true };
  return { grounded, airborne: { ...grounded, 'progress.v2': v2 } };
}
const seedScript = (storage) => `(() => {
  if (sessionStorage.getItem('a11y-seeded')) return;
  sessionStorage.setItem('a11y-seeded', '1');
  for (const k of Object.keys(localStorage)) if (k.startsWith(${JSON.stringify(STORE_PREFIX)})) localStorage.removeItem(k);
  const s = ${JSON.stringify(storage)};
  for (const [k, v] of Object.entries(s)) localStorage.setItem(${JSON.stringify(STORE_PREFIX)} + k, typeof v === 'string' ? v : JSON.stringify(v));
})();`;

/**
 * The credits page from the focused opener: Enter opens the dialog, focus moves into it and stays
 * there while tabbing, Esc closes it and focus goes back to the opener's area.
 */
async function creditsByKeyboard(page, opener, back) {
  const r = { opener };
  await page.focus(opener);
  await page.waitForTimeout(120);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !!document.querySelector('.modal.credits'), null, { timeout: 15000, polling: 100 }).catch(() => {});
  await page.waitForTimeout(500);
  r.open = await page.evaluate(() => {
    const d = document.querySelector('.modal.credits');
    return d ? { role: d.getAttribute('role'), label: d.getAttribute('aria-label') } : null;
  });
  r.focusIn = await page.evaluate(() => !!document.activeElement?.closest('.modal.credits'));
  const walk = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(70);
    walk.push(await page.evaluate(() => ({ inCredits: !!document.activeElement?.closest('.modal.credits'), tag: document.activeElement?.tagName?.toLowerCase() })));
  }
  r.stayed = walk.every((w) => w.inCredits);
  r.ring = await page.evaluate(DESCRIBE);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  r.closed = await page.evaluate(() => !document.querySelector('.modal.credits'));
  r.back = await page.evaluate((sel) => !!document.activeElement?.closest(sel), back);
  return r;
}

/** One title state on a fresh page with a seeded save: what Tab reaches, the state's own buttons. */
async function titleState(b, url, name, storage, expect) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  try {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 300)));
    await page.addInitScript(seedScript(storage));
    await page.goto(`${url}/?lang=de`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__academy && window.__academy.ready && window.__academy.game.phase === 'start', null, { timeout: 180000, polling: 200 });
    await page.waitForTimeout(1200);
    const R = { state: name, flight: await page.evaluate(() => window.__academy.ext('save')?.()?.quest?.flight?.state ?? null) };
    R.buttons = await page.evaluate(() => [...document.querySelectorAll('#start button')].map((x) => x.id || x.className.split(' ')[0]).filter(Boolean));
    R.startText = await page.evaluate(() => document.querySelector('#start-btn')?.textContent?.trim() ?? null);
    R.tab = await tabWalk(page, 14);
    R.errors = errors;
    R.expect = expect;
    return { R, page, ctx };
  } catch (err) {
    await ctx.close();
    throw err;
  }
}
const phase = (page) => page.evaluate(() => window.__academy.game.phase);
const modal = (page) => page.evaluate(() => window.__academy.state().modal);

async function runBrowser(name, url, v) {
  const R = { browser: name };
  const b = await launchEngine(name);
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 300)));
    await page.goto(`${url}/?reset=1&lang=de`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__academy && window.__academy.ready && window.__academy.game.phase === 'start', null, { timeout: 180000, polling: 200 });
    // every area (sites too): `ready` is only the eager set (plan §5.6)
    await loadAllAreas(page);
    await page.waitForTimeout(1200);
    const P = `${name}: `;

    // ── title ──
    R.titleInitialFocus = await page.evaluate(DESCRIBE);
    R.titleTab = await tabWalk(page, 10);
    const reached = R.titleTab.filter(Boolean);
    v.require(P + 'title: Tab reaches Start', reached.some((d) => d.id === 'start-btn'), R.titleTab.map(key).slice(0, 4).join(' → '));
    v.require(P + 'title: Tab reaches the mode cards', reached.some((d) => d.inStart && /\bmode\b/.test(d.cls || '')));
    v.require(P + 'title: Tab reaches the language switch', reached.some((d) => d.inStart && (/lang/.test(d.cls || '') || /^(DE|EN|Deutsch|English)\b/.test(d.text))));
    const startRing = reached.find((d) => d.id === 'start-btn');
    v.check(P + 'title: focus ring contrast on Start', startRing?.ring ? startRing.ringContrast : 0, '>=', 3, ':1');
    // the credits page from the title (WP1): reached by Tab, a dialog, focus in and kept, Esc back to the title
    v.require(P + 'title (first visit): Tab reaches „Credits & Lizenzen“', reached.some((d) => d.id === 'credits-btn'), R.titleTab.map(key).join(' → ').slice(0, 300));
    R.creditsFromTitle = await creditsByKeyboard(page, '#credits-btn', '#start');
    const C = R.creditsFromTitle;
    v.require(P + 'credits (title): Enter opens it as a dialog', C.open?.role === 'dialog' && !!C.open?.label, JSON.stringify(C.open));
    v.require(P + 'credits (title): focus moves in and stays in while tabbing', C.focusIn && C.stayed, `in ${C.focusIn} · stayed ${C.stayed}`);
    v.check(P + 'credits (title): focus ring contrast', C.ring?.ring ? C.ring.ringContrast : 0, '>=', 3, ':1');
    v.require(P + 'credits (title): Esc closes it, focus back on the title', C.closed && C.back, `closed ${C.closed} · back ${C.back}`);
    // Enter on the focused Start button starts the game
    await page.focus('#start-btn');
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    R.enterStarts = await phase(page);
    v.require(P + 'title: Enter on Start starts the game', R.enterStarts !== 'start', `phase ${R.enterStarts}`);
    if (R.enterStarts === 'start') await page.evaluate(() => window.__academy.start());
    await page.waitForTimeout(600);
    await page.keyboard.press('Space'); // skip the ascent
    await page.waitForFunction(() => window.__academy.game.phase === 'playing' && !document.querySelector('#hud')?.classList.contains('cinematic'), null, { timeout: 60000, polling: 200 }).catch(() => {});
    await page.waitForTimeout(1500);

    // ── playing on the canvas: Tab opens the Pass, arrows turn ──
    await page.evaluate(() => {
      window.__academy.closeModals();
      const c = document.querySelector('canvas#game');
      if (c) {
        if (!c.hasAttribute('tabindex')) c.setAttribute('tabindex', '-1');
        c.focus();
      }
    });
    const yaw0 = await page.evaluate(() => window.__academy.state().player.yawDeg);
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowLeft');
    const yaw1 = await page.evaluate(() => window.__academy.state().player.yawDeg);
    R.arrowTurn = Math.abs(yaw1 - yaw0);
    v.require(P + 'playing: ← turns the view', R.arrowTurn > 2, `${R.arrowTurn.toFixed(1)}°`);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(700);
    R.passByTab = await modal(page);
    v.require(P + 'playing: Tab opens the Pass', R.passByTab === 'pass', `modal ${R.passByTab}`);
    if (R.passByTab !== 'pass') {
      await page.evaluate(() => window.__academy.openPass());
      await page.waitForTimeout(700);
    }
    // ── the Pass: its tabs are reachable ──
    R.passTab = await tabWalk(page, 8);
    R.passOpenAfterTabs = await modal(page);
    const passTabs = await page.evaluate(() => [...document.querySelectorAll('.modal.pass .tabs button, .modal.pass [role=tab]')].map((x) => x.textContent.trim()));
    const passReached = R.passTab.filter((d) => d && d.inModal && /pass/.test(d.inModal));
    v.require(P + 'Pass: Tab reaches its tabs', passTabs.length === 0 ? passReached.length > 0 : passReached.some((d) => passTabs.includes(d.text)), `tabs ${passTabs.join('/')}; reached ${passReached.map((d) => d.text).join('/') || 'none'}`);
    await page.evaluate(() => window.__academy.closeModals());
    await page.waitForTimeout(500);

    // ── the map: „Hinreisen“ is reachable ──
    await page.evaluate(() => window.__academy.toggleMap());
    await page.waitForTimeout(800);
    R.mapTab = await tabWalk(page, 12);
    v.require(P + 'map: Tab reaches „Hinreisen“', R.mapTab.some((d) => d && /hinreisen|travel|reisen/i.test(d.text)), R.mapTab.map(key).slice(0, 5).join(' → '));
    await page.evaluate(() => window.__academy.closeModals());
    await page.waitForTimeout(500);

    // ── pause menu ──
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    if ((await modal(page)) !== 'pause') {
      await page.evaluate(() => window.__academy.pause());
      await page.waitForTimeout(700);
    }
    R.pauseFocusAfterOpen = await page.evaluate(DESCRIBE);
    R.pauseDialog = await page.evaluate(() => {
      const d = document.querySelector('.modal.pause');
      return d ? { role: d.getAttribute('role'), ariaModal: d.getAttribute('aria-modal'), labelledby: d.getAttribute('aria-labelledby'), label: d.getAttribute('aria-label') } : null;
    });
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('.modal.pause .row')].map((r, i) => {
        r.setAttribute('data-a11y-row', String(i));
        return { i, label: r.querySelector('span')?.textContent?.trim() ?? '', controls: r.querySelectorAll('button, input, select, [tabindex]').length };
      }),
    );
    const nFocusable = await page.evaluate(() => document.querySelectorAll('.modal.pause button, .modal.pause input, .modal.pause select').length);
    const walk = [];
    for (let i = 0; i < nFocusable + 4; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(90);
      walk.push(await page.evaluate(() => {
        const e = document.activeElement;
        const row = e && e.closest && e.closest('[data-a11y-row]');
        return { row: row ? Number(row.getAttribute('data-a11y-row')) : null, inPause: !!(e && e.closest && e.closest('.modal.pause')), tag: e?.tagName?.toLowerCase(), text: (e?.textContent || '').trim().slice(0, 20) };
      }));
    }
    R.pauseTab = walk;
    const reachedRows = new Set(walk.filter((w) => w.row != null).map((w) => w.row));
    const missing = rows.filter((r) => r.controls > 0 && !reachedRows.has(r.i)).map((r) => r.label);
    v.require(P + 'pause: Tab reaches every setting', missing.length === 0 && rows.length > 0, missing.length ? `missed: ${missing.join(', ')}` : `${reachedRows.size} rows`);
    v.require(P + 'pause: focus stays inside the menu', walk.every((w) => w.inPause), walk.filter((w) => !w.inPause).map((w) => w.tag).slice(0, 3).join(','));
    // → on a focused slider moves it (reach it with Tab, fall back to focus())
    R.slider = await page.evaluate(() => {
      const i = document.querySelector('.modal.pause input[type=range]');
      if (!i) return null;
      const viaTab = document.activeElement === i;
      i.focus();
      return { before: i.value, viaTab };
    });
    if (R.slider) {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(150);
      R.slider.after = await page.evaluate(() => document.querySelector('.modal.pause input[type=range]').value);
    }
    v.require(P + 'pause: → moves a focused slider', !!R.slider && R.slider.after !== R.slider.before, R.slider ? `${R.slider.before} → ${R.slider.after}` : 'no slider');
    const segRing = await page.evaluate(() => {
      const bt = document.querySelector('.modal.pause .seg button');
      if (!bt) return null;
      bt.blur();
      return true;
    });
    if (segRing) {
      // keyboard focus (so :focus-visible applies): Tab until a seg button is focused
      let d = null;
      for (let i = 0; i < nFocusable + 2; i++) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(60);
        d = await page.evaluate(DESCRIBE);
        if (d && d.tag === 'button' && (d.cls ?? '') !== 'x' && d.inModal) break;
      }
      const ok = d && d.tag === 'button' && d.inModal;
      R.pauseButtonRing = d;
      v.check(P + 'pause: focus ring contrast on a button (keyboard focus)', ok && d.ring ? d.ringContrast : 0, '>=', 3, ':1');
    }
    // the credits page from the pause menu (WP1): Enter on „Credits & Lizenzen“, Esc back to the menu
    if (await page.evaluate(() => !!document.querySelector('#pause-credits'))) {
      R.creditsFromPause = await creditsByKeyboard(page, '#pause-credits', '.modal.pause');
      const C = R.creditsFromPause;
      v.require(P + 'credits (pause): Enter opens it as a dialog', C.open?.role === 'dialog', JSON.stringify(C.open));
      v.require(P + 'credits (pause): focus moves in and stays in while tabbing', C.focusIn && C.stayed, `in ${C.focusIn} · stayed ${C.stayed}`);
      v.require(P + 'credits (pause): Esc closes it, focus back in the pause menu', C.closed && C.back, `closed ${C.closed} · back ${C.back}`);
      if ((await modal(page)) !== 'pause') {
        await page.evaluate(() => window.__academy.pause());
        await page.waitForTimeout(500);
      }
    } else v.require(P + 'pause: „Credits & Lizenzen“ present (#pause-credits)', false);
    // ARIA snapshots (Chromium)
    if (name === 'chromium') {
      R.aria = {};
      try {
        R.aria.pause = await page.locator('.modal.pause').ariaSnapshot();
        await page.evaluate(() => window.__academy.closeModals());
        await page.evaluate(() => window.__academy.openPass());
        await page.waitForTimeout(600);
        R.aria.pass = (await page.locator('.modal.pass').ariaSnapshot()).slice(0, 4000);
        await page.evaluate(() => window.__academy.closeModals());
        await page.evaluate(() => window.__academy.toggleMap());
        await page.waitForTimeout(600);
        R.aria.map = (await page.locator('.modal.mapcard').ariaSnapshot()).slice(0, 3000);
        await page.evaluate(() => window.__academy.closeModals());
        R.aria.hud = (await page.locator('#hud').ariaSnapshot()).slice(0, 3000);
      } catch (e) {
        R.ariaError = String(e).slice(0, 300);
      }
    }
    await page.evaluate(() => window.__academy.closeModals());
    R.errors = errors;
    v.check(P + 'page errors', errors.length, '<=', 0);
    await ctx.close();

    // ── the other two title states (seeded saves): grounded with progress, airborne ──
    const saves = titleSaves();
    for (const [state, storage] of [
      ['grounded', saves.grounded],
      ['airborne', saves.airborne],
    ]) {
      const T = await titleState(b, url, state, storage);
      try {
        const { R: S, page: tp } = T;
        R[`title_${state}`] = S;
        const got = S.tab.filter(Boolean);
        v.require(`${P}title (${state}): the save's flight state`, S.flight === (state === 'airborne' ? 'airborne' : 'ground'), String(S.flight));
        v.require(`${P}title (${state}): Start says „Weiterspielen“`, /weiter/i.test(S.startText ?? ''), S.startText ?? 'none');
        v.require(`${P}title (${state}): Tab reaches Start`, got.some((d) => d.id === 'start-btn'), S.tab.map(key).slice(0, 5).join(' → '));
        v.require(`${P}title (${state}): Tab reaches the mode cards`, got.some((d) => d.inStart && /\bmode\b/.test(d.cls || '')));
        v.require(`${P}title (${state}): Tab reaches „Credits & Lizenzen“`, got.some((d) => d.id === 'credits-btn'));
        if (state === 'airborne') {
          for (const id of ['dock-btn', 'replay-btn']) {
            const d = got.find((x) => x.id === id);
            v.require(`${P}title (airborne): Tab reaches #${id}`, !!d, S.buttons.join(', '));
            v.check(`${P}title (airborne): focus ring contrast on #${id}`, d?.ring ? d.ringContrast : 0, '>=', 3, ':1');
          }
        } else v.require(`${P}title (grounded): no airborne buttons`, !S.buttons.includes('dock-btn') && !S.buttons.includes('replay-btn'), S.buttons.join(', '));
        // the credits page from this title too
        const C = await creditsByKeyboard(tp, '#credits-btn', '#start');
        S.credits = C;
        v.require(`${P}title (${state}): the credits page opens and closes by keyboard`, C.open?.role === 'dialog' && C.focusIn && C.stayed && C.closed && C.back, JSON.stringify({ open: !!C.open, in: C.focusIn, stayed: C.stayed, closed: C.closed, back: C.back }));
        v.check(`${P}title (${state}): page errors`, S.errors.length, '<=', 0);
      } finally {
        await T.ctx.close();
      }
    }
  } finally {
    saveJson(`a11y-keyboard-${name}.json`, R);
    await b.close().catch(() => {});
  }
  return R;
}

const v = new Verdict('a11y-keyboard');
const srv = await gameServer(args, { prefer: 'dev' });
try {
  for (const name of browsers) {
    try {
      const R = await runBrowser(name, srv.url, v);
      console.log(`${name}: title tab ${R.titleTab.map(key).slice(0, 6).join(' → ')}`);
    } catch (err) {
      v.require(`${name}: run`, false, String(err.message || err).split('\n')[0].slice(0, 200));
    }
  }
} finally {
  await srv.close();
}
v.exit(args);
