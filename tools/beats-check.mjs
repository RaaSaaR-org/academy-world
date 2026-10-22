#!/usr/bin/env node
// WP12 feature check (plan §5.10, §6.5 WP12 „Acceptance“): the beats of the three systems (D23) as
// the island shows them. Real page, real stamps (through the island's 'start:award' hook, as a station
// awards them), seeded saves for the late states; it reads what is ON SCREEN (the instance colours of
// the Libelle panel and the crown, the needle light's emissive) through __academy.ext('start').
//
//   node tools/beats-check.mjs [--only flow,merged,crew,gusts,rm] [--shots] [--dev | --dist <dir> | --base <url>]
//
// Scenarios
//   flow    Entdecker from a fresh save: Probestart → all red; M1 amber → bereit (ignition once, the
//           Revier opens at 1/6); 4/6 → KIEL; 6/6 (no Startklar yet); the Probestart fails at 6/6 and names
//           the Startakku, then the Flugmodell; one Sonnenacker stamp → ⅓ charge (3 amber segments); the
//           ◆ → the charge beat; the Traumhangar ◆ (NAV last) → the upload beat and a separate Startklar
//           beat; every beat once; a reload replays none; a second award of a ◆ plays nothing.
//   merged  Entdecker, seeded 5/6 + AKKU + NAV: M6 last → the 6/6 and the Startklar beat merged, once each.
//   crew    Entscheider: after the Probestart AKKU and NAV are crew-teal with the BODENCREW plates, never a
//           halo; a mode switch takes the supply away and back at once.
//   gusts   docked: seeded random gusts never tilt the island (the arms catch them).
//   rm      reduced motion: the Probestart without tilt, world sink or shake; lamps, bar and readout stay.
// In every sampled state: the Libelle's rotor lamps = the crown beacons, the nav lamp = the needle light,
// the lit bar segments = round(charge × 10). Exit 1 on a miss.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, Verdict, gameServer, launchChromium, list, parseArgs, saveJson } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const only = list(args.only, ['flow', 'merged', 'crew', 'gusts', 'rm']);
const shots = !!args.shots;
const SHOT_DIR = path.join(ROOT, 'artifacts', 'phase7', 'beats');
if (shots) fs.mkdirSync(SHOT_DIR, { recursive: true });
const v = new Verdict('beats-check');
const out = {};

const KEY = 'emai-academy-island/v1:progress';
const ROTOR_STAR = ['sensordom.messstrecke', 'regelgarten.regler-takt', 'greifwerkstatt.lastdiagramm', 'lern-dojo.nachmachen', 'dunkelfabrik.lichtaus', 'prueffeld.unter-last'];
const AKKU_STAR = 'sonnenacker.erntetag';
const NAV_STAR = 'traumhangar.traumdaten';

/** a v1 save (the boot migration of WP1 carries it to v2), seeded once per tab: reloads keep the progress */
function seedScript(o = {}) {
  const stamps = {};
  for (const id of o.stamps ?? []) stamps[id] = { t: 1760000000000 };
  const data = { v: 1, mode: o.mode ?? 'entdecker', stamps, visited: {}, zoneData: { world: { onboarding: o.onboarding ?? 0, ...(o.world ?? {}) } }, predictions: {}, questions: [], album: [], best: {}, challenges: {}, collectibles: [] };
  return `(() => { try { if (!sessionStorage.getItem('bc-seeded')) { localStorage.clear(); localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(data))}); sessionStorage.setItem('bc-seeded', '1'); } } catch (e) {} })();`;
}

const srv = await gameServer(args, { prefer: 'dev' });
const browser = await launchChromium();

async function open(name, o = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: o.rm ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && (e.stack || e.message || e)).slice(0, 600)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/GPU stall/.test(m.text())) errors.push(m.text().slice(0, 400));
  });
  await page.addInitScript(seedScript(o.seed));
  const url = `${srv.url}/?skipIntro=1&lang=de`;
  const boot = async () => {
    await page.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout: 120000, polling: 200 });
    await page.evaluate((mode) => {
      window.__academy.setMode(mode);
      window.__academy.start(mode);
    }, o.seed?.mode ?? 'entdecker');
    await page.waitForFunction(() => typeof window.__academy.ext('start') === 'function', null, { timeout: 30000 });
    await page.waitForTimeout(800);
  };
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await boot();
  let shotN = 0;
  const S = {
    page,
    errors,
    st: () => page.evaluate(() => window.__academy.ext('start')()),
    award: (id) => page.evaluate((x) => window.__academy.ext('start:award')(x), id),
    press: () => page.evaluate(() => window.__academy.ext('start:press')()),
    dialogue: () => page.evaluate(() => window.__academy.state().dialogue?.text ?? null),
    /** wait for the beat queue and the Probestart to settle; skips EMI's lines to keep the run short */
    async settle(maxS = 40, minS = 1.8) {
      const t0 = Date.now();
      await page.waitForTimeout(minS * 1000);
      for (;;) {
        const s = await S.st();
        if (s.beatsIdle && !s.probestartBusy) return s;
        if ((Date.now() - t0) / 1000 > maxS) return s;
        await page.evaluate(() => window.__academy.advanceDialogue());
        await page.waitForTimeout(300);
      }
    },
    /** collect EMI's / the radio's lines for `s` seconds */
    async lines(s) {
      const seen = new Set();
      const t0 = Date.now();
      while ((Date.now() - t0) / 1000 < s) {
        const d = await S.dialogue();
        if (d) seen.add(d);
        await page.waitForTimeout(200);
      }
      return [...seen];
    },
    async reload() {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await boot();
    },
    async shot(label) {
      if (!shots) return;
      await page.evaluate(() => {
        window.__academy.teleport([-3.6, 0, 24.2]);
        window.__academy.look(-34, -8);
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOT_DIR, `${name}-${String(++shotN).padStart(2, '0')}-${label}.png`) });
    },
    async close() {
      await context.close();
    },
  };
  return S;
}

/** sample tilt, altitude, shake and the readout for `ms` (the Probestart's motion) */
async function motion(S, ms) {
  let tilt = 0,
    alt = 0,
    shake = 0,
    readout = null;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await S.page.evaluate(() => {
      const s = window.__academy.ext('start')();
      const p = window.__academy.game?.player;
      return { tilt: Math.hypot(s.tilt.roll, s.tilt.pitch), alt: s.altitude, shake: p ? (p.shakeAmp ?? 0) : 0, readout: s.readout };
    });
    tilt = Math.max(tilt, r.tilt);
    alt = Math.max(alt, r.alt);
    shake = Math.max(shake, r.shake);
    readout = r.readout ?? readout;
    await S.page.waitForTimeout(60);
  }
  return { tilt, alt, shake, readout };
}

/** the island shows what the quest says, and the three repeaters agree (§3.3) */
function consistent(name, s) {
  const p = s.screen;
  const okCrown = JSON.stringify(p.panelLamps) === JSON.stringify(p.crown);
  const okNeedle = p.navLamp === p.needle;
  const want = Math.round(s.quest.charge * 10);
  const okBar = p.barSegmentsLit === want;
  v.require(`${name}: Libelle lamps = crown`, okCrown, okCrown ? '' : `${p.panelLamps.join(',')} vs ${p.crown.join(',')}`);
  v.require(`${name}: nav lamp = needle light`, okNeedle, okNeedle ? '' : `${p.navLamp} vs ${p.needle}`);
  v.require(`${name}: bar = round(charge × 10)`, okBar, `${p.barSegmentsLit} lit, charge ${s.quest.charge}`);
  return okCrown && okNeedle && okBar;
}
const count = (s, id) => s.beats.filter((b) => b.id === id).length;

try {
  // ── flow ────────────────────────────────────────────────────────────────────
  if (only.includes('flow')) {
    const S = await open('flow', { seed: { mode: 'entdecker' } });
    let s = await S.st();
    v.require('flow: lamps dark before the Probestart', s.screen.panelLamps.every((l) => l === 'dark') && s.screen.navLamp === 'dark', s.screen.panelLamps.join(','));
    v.require('flow: the Libelle reads BODEN while docked', s.libelle === 'boden');
    await S.press();
    // the control for the reduced-motion run: here the island lifts, tilts and the arms' thud shakes
    const m = await motion(S, 6000);
    v.check('flow: Probestart lifts the island (world sinks)', m.alt, '>=', 0.25, 'm');
    v.check('flow: Probestart tilts', m.tilt, '>=', 1.5, '°');
    v.check('flow: the arms catch it (shake)', m.shake, '>', 0);
    v.require('flow: the Probestart readout shows', /AUFTRIEB 0\/6 · AKKU 0 % · NAV AUS/.test(m.readout ?? ''), m.readout ?? '');
    s = await S.settle(40, 1);
    v.require('flow: Probestart → six red rotor lamps', s.screen.panelLamps.every((l) => l === 'red'), s.screen.panelLamps.join(','));
    v.require('flow: Probestart → red nav lamp', s.screen.navLamp === 'red');
    consistent('flow red', s);
    v.require('flow: Revier closed, Kanzel pads dark', !s.quest.regionOpen && !s.padsArmed);
    await S.shot('red');
    await S.award('sensordom.messbrille');
    s = await S.settle();
    v.require('flow: first stamp → M1 amber', s.screen.panelLamps[0] === 'amber', s.screen.panelLamps[0]);
    consistent('flow amber', s);
    await S.award(ROTOR_STAR[0]);
    s = await S.settle();
    v.require('flow: M1 ◆ → teal', s.screen.panelLamps[0] === 'teal' || s.screen.panelLamps[0] === 'teal-halo', s.screen.panelLamps[0]);
    v.check('flow: M1 ignition beats', count(s, 'M1'), '=', 1);
    v.require('flow: the Revier opens at 1/6 (gate, pads)', s.quest.regionOpen && s.padsArmed && count(s, 'revier') === 1);
    v.require('flow: M1 bereit → the Libelle still BODEN (M2 not yet)', s.libelle === 'boden');
    consistent('flow 1/6', s);
    await S.shot('m1');
    for (const id of ROTOR_STAR.slice(1, 3)) await S.award(id);
    s = await S.settle(60);
    v.require('flow: KIEL closed at 3/6', !s.quest.kielOpen && count(s, 'kiel') === 0);
    v.require('flow: M2 bereit → the Libelle reads LAGE', s.libelle === 'lage');
    await S.award(ROTOR_STAR[3]);
    s = await S.settle();
    v.require('flow: KIEL opens at 4/6', s.quest.kielOpen && count(s, 'kiel') === 1);
    for (const id of ROTOR_STAR.slice(4)) await S.award(id);
    s = await S.settle(60);
    v.check('flow: 6/6 beat', count(s, '6of6'), '=', 1);
    v.check('flow: no Startklar beat without AKKU and NAV', count(s, 'startklar'), '=', 0);
    consistent('flow 6/6', s);
    await S.shot('6of6');
    // the Probestart at 6/6 fails and names what is missing
    await S.press();
    let said = await S.lines(9);
    v.require('flow: Probestart at 6/6 names the Startakku', said.some((l) => /Startakku/.test(l)), said.join(' | ').slice(0, 200));
    s = await S.settle();
    await S.award('sonnenacker.reif-oder-nicht');
    s = await S.settle();
    v.require('flow: one Sonnenacker stamp → ⅓ charge, amber bar', Math.abs(s.quest.charge - 1 / 3) < 0.01 && s.shown.panel.bar.lamp === 'amber');
    consistent('flow ⅓', s);
    await S.award(AKKU_STAR);
    s = await S.settle();
    v.check('flow: charge beat (AKKU)', count(s, 'AKKU'), '=', 1);
    v.require('flow: the bar is full teal', s.screen.barSegmentsLit === 10 && s.shown.panel.bar.lamp.startsWith('teal'));
    consistent('flow AKKU', s);
    await S.press();
    said = await S.lines(9);
    v.require('flow: Probestart without NAV names the Flugmodell', said.some((l) => /Flugmodell/.test(l)), said.join(' | ').slice(0, 200));
    s = await S.settle();
    await S.award(NAV_STAR);
    s = await S.settle(60);
    v.check('flow: upload beat (NAV)', count(s, 'NAV'), '=', 1);
    v.check('flow: Startklar beat, its own (NAV last)', count(s, 'startklar'), '=', 1);
    const six = s.beats.find((b) => b.id === '6of6'),
      sk = s.beats.find((b) => b.id === 'startklar');
    v.require('flow: Startklar after 6/6 (separate)', !!six && !!sk && sk.t - six.t > 3);
    v.require('flow: the needle light is teal', s.screen.needle === 'teal' || s.screen.needle === 'teal-halo');
    v.require('flow: trims T2 and T3 ignited once', count(s, 'T2') === 1 && count(s, 'T3') === 1);
    consistent('flow Startklar', s);
    await S.shot('startklar');
    const total = s.beats.length;
    // a second award of a ◆ plays nothing; a reload replays nothing
    await S.award(ROTOR_STAR[0]);
    s = await S.settle();
    v.check('flow: a second ◆ award adds no beat', s.beats.length, '=', total);
    out.flow = s.beats;
    await S.reload();
    s = await S.settle(30, 3);
    v.check('flow: no beat replays after a reload', s.beats.length, '=', 0);
    v.require('flow: after the reload the island still shows Startklar', s.screen.panelLamps.every((l) => l.startsWith('teal')) && s.screen.barSegmentsLit === 10);
    consistent('flow reload', s);
    v.require('flow: no page errors', S.errors.length === 0, S.errors[0] ?? '');
    await S.close();
  }

  // ── merged: M6 last ─────────────────────────────────────────────────────────
  if (only.includes('merged')) {
    const S = await open('merged', { seed: { mode: 'entdecker', onboarding: 3, stamps: [...ROTOR_STAR.slice(0, 5), AKKU_STAR, NAV_STAR] } });
    let s = await S.settle(20, 2);
    consistent('merged 5/6', s);
    await S.award(ROTOR_STAR[5]);
    s = await S.settle(60);
    v.check('merged: M6 ignition', count(s, 'M6'), '=', 1);
    v.check('merged: 6/6 beat once', count(s, '6of6'), '=', 1);
    v.check('merged: Startklar beat once', count(s, 'startklar'), '=', 1);
    const six = s.beats.find((b) => b.id === '6of6'),
      sk = s.beats.find((b) => b.id === 'startklar');
    v.require('merged: 6/6 and Startklar merged (same beat)', !!six && !!sk && Math.abs(sk.t - six.t) < 0.5);
    consistent('merged 6/6', s);
    out.merged = s.beats;
    v.require('merged: no page errors', S.errors.length === 0, S.errors[0] ?? '');
    await S.close();
  }

  // ── crew: Entscheider ───────────────────────────────────────────────────────
  if (only.includes('crew')) {
    const S = await open('crew', { seed: { mode: 'entscheider' } });
    await S.press();
    let s = await S.settle(40, 6);
    v.require('crew: AKKU crew-teal after the Probestart', s.shown.crew.akku && s.screen.barSegmentsLit === 10 && s.shown.panel.bar.lamp === 'crew');
    v.require('crew: NAV crew-teal after the Probestart', s.shown.crew.nav && s.shown.panel.nav === 'crew' && s.screen.navLamp === 'teal');
    v.require('crew: never a halo on a crew system', s.shown.panel.bar.lamp !== 'teal-halo' && s.shown.panel.nav !== 'teal-halo' && s.screen.navLamp !== 'teal-halo' && s.screen.needle !== 'teal-halo');
    v.require('crew: the BODENCREW plates show', s.screen.crewPlates);
    v.check('crew: the supply is no markBeat beat', count(s, 'AKKU') + count(s, 'NAV'), '=', 0);
    consistent('crew', s);
    await S.shot('crew');
    await S.page.evaluate(() => window.__academy.setMode('entdecker'));
    s = await S.settle(10, 0.8);
    v.require('crew: a switch to Entdecker takes the supply away at once', !s.shown.crew.akku && !s.shown.crew.nav && s.screen.navLamp === 'red' && s.screen.barSegmentsLit === 0 && !s.screen.crewPlates);
    consistent('crew → Entdecker', s);
    await S.page.evaluate(() => window.__academy.setMode('entscheider'));
    s = await S.settle(10, 0.8);
    v.require('crew: and back at once', s.shown.crew.akku && s.shown.crew.nav && s.screen.crewPlates);
    out.crew = s.beats;
    v.require('crew: no page errors', S.errors.length === 0, S.errors[0] ?? '');
    await S.close();
  }

  // ── gusts: docked ───────────────────────────────────────────────────────────
  if (only.includes('gusts')) {
    const S = await open('gusts', { seed: { mode: 'entdecker', onboarding: 3 } });
    let maxTilt = 0;
    for (let k = 0; k < 3; k++) {
      await S.page.evaluate(() => window.__academy.ext('start:gust')(1));
      const t0 = Date.now();
      while (Date.now() - t0 < 4500) {
        const s = await S.st();
        maxTilt = Math.max(maxTilt, Math.hypot(s.tilt.roll, s.tilt.pitch));
        await S.page.waitForTimeout(100);
      }
    }
    v.check('gusts: no tilt while docked (3 seeded gusts)', maxTilt, '<=', 0.001, '°');
    v.require('gusts: no page errors', S.errors.length === 0, S.errors[0] ?? '');
    await S.close();
  }

  // ── rm: reduced motion ──────────────────────────────────────────────────────
  if (only.includes('rm')) {
    const S = await open('rm', { rm: true, seed: { mode: 'entdecker' } });
    await S.press();
    const m = await motion(S, 6000);
    const s = await S.settle(40, 1);
    v.require('rm: reduced motion is on', s.reducedMotion);
    v.check('rm: no tilt', m.tilt, '<=', 0.001, '°');
    v.check('rm: no world sink', m.alt, '<=', 0.001, 'm');
    v.check('rm: no shake', m.shake, '<=', 0);
    v.require('rm: the lamps turn red', s.screen.panelLamps.every((l) => l === 'red') && s.screen.navLamp === 'red');
    v.require('rm: the readout shows', /AUFTRIEB 0\/6/.test(m.readout ?? ''), m.readout ?? '');
    consistent('rm', s);
    await S.shot('rm');
    v.require('rm: no page errors', S.errors.length === 0, S.errors[0] ?? '');
    await S.close();
  }
} catch (err) {
  v.require('beats-check ran', false, String(err && err.stack ? err.stack.split('\n').slice(0, 3).join(' ') : err));
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
saveJson('beats-check.json', { rows: v.rows, beats: out });
v.exit(args);
