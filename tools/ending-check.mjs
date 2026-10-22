#!/usr/bin/env node
// Ground ↔ air after the finale, across reloads (docs/PHASE7-PLAN.md §5.10, §3.6, D25, D38; owners
// WP7, WP13, WP2). Finale steps are driven by the island's debug hooks (the stations themselves are
// covered by tools/playtest.mjs).
//
//   node tools/ending-check.mjs [--lang de|en]
//
// Phase 7 (once WP13's world:liftoff / world:liftoff-skip hooks exist):
//   grounded   a fresh start is grounded (quest flight 'ground'); 0 sky-dressing draws (the rc4
//              'island:sky' group: islets, wisps, far islands, copters, §5.3 rule 2b); the Ausguck
//              sky switch (TAG ↔ ABEND) is not offered;
//   lift-off   F1–F3 solved, the lift-off (skip) ends airborne with liftoffSeen; ground-frame areas
//              with code are suspended; the sky switch is offered;
//   reload     airborne survives a reload (the title's „Weiterspielen“ resumes airborne);
//   title      „Im Dock weiterspielen“ resumes grounded (flight 'ground', 0 sky dressing), and
//              „Abheben ansehen“ plays the lift-off and ends airborne;
//   Ausguck    „Zurück ins Dock“ on the console fades to grounded, ground areas resume.
// Until WP13 lands the rc4 dusk ending is checked as before (KIEL sign, dusk, certificate, the day/dusk
// switch across reloads) and the Phase 7 checks are listed as pending. Screenshots + log.json →
// artifacts/<PT_DIR|ending>/ending-<lang>/. Exit 1 on any failed check.
import { session } from './lib/session.mjs';
import { parseArgs } from './lib/shotlib.mjs';

const args = parseArgs(process.argv.slice(2));
const lang = String(args.lang ?? 'de');
process.env.PT_DIR ??= 'ending';
const fails = [];
const pending = [];
const check = (ok, what, detail = '') => {
  console.log(`${ok ? '  ok ' : '  FAIL'} ${what}${detail ? ' · ' + detail : ''}`);
  if (!ok) fails.push(what);
};
const later = (what, owner) => {
  console.log(`  …    ${what} · pending (${owner})`);
  pending.push(`${what} (${owner})`);
};

/** In-page: main-pass draws of the rc4 sky dressing during one frame. */
const SKY_DRAWS = async () => {
  const G = window.__academy.game;
  let n = 0;
  let on = false;
  const hooked = [];
  G.rs.scene.traverse((o) => {
    if (!o.isMesh && !o.isLine && !o.isPoints && !o.isSprite) return;
    let dress = false;
    for (let q = o; q; q = q.parent) if (q.name === 'island:sky' || q.userData?.skyDressing) dress = true;
    if (!dress) return;
    const prev = o.onBeforeRender;
    o.onBeforeRender = function () {
      if (on) n++;
      return prev.apply(this, arguments);
    };
    hooked.push([o, prev]);
  });
  G.requestRender(3);
  await new Promise((r) => requestAnimationFrame(() => r()));
  on = true;
  await new Promise((r) => requestAnimationFrame(() => r()));
  on = false;
  for (const [o, prev] of hooked) o.onBeforeRender = prev;
  return n;
};

const { errors } = await session(`ending-${lang}`, async (s) => {
  const sign = () => s.val(`(() => { let t = null; __academy.game.rs.scene.traverse((o) => { if (typeof o.text === 'string' && /^(KIEL|KEEL) −36/.test(o.text)) t = o.text.replace('\\n', ' '); }); return t; })()`);
  const sun = () => s.val(`__academy.game.env.params.sunElevationDeg`);
  const fin = () => s.val(`__academy.solve('world','finale-state')`);
  const quest = () => s.val(`(__academy.quest ? __academy.quest() : __academy.game.quest?.snapshot?.()) ?? null`);
  const skyDraws = () => s.page.evaluate(SKY_DRAWS);
  // Phase 7 (WP13): the switch exists as an interactable but is offered (enabled) only in the air
  const skySwitch = () => s.val(`__academy.interactables(400).filter((i) => i.enabled !== false && /^(Himmel|Sky)/.test(i.label)).length`);
  // the suspension state is the frames extension's (WP4: suspended, attached, tiers), as frames-check reads it
  const groundAreas = () => s.val(`(() => { const F = typeof __academy.ext('frames') === 'function' ? __academy.ext('frames')('areas') : []; return __academy.manifests('all').filter((m) => m.frame === 'ground' && m.hasCode).map((m) => { const f = F.find((a) => a.id === m.id); const z = __academy.zones().find((x) => x.id === m.id); return { id: m.id, z: z ? { ...z, suspended: f ? !!f.suspended : z.suspended, attached: f ? f.attached : undefined } : null }; }); })()`);
  const solveFinale = async () => {
    await s.val(`__academy.solve('world','finale-goto')`);
    await s.wait(1500);
    await s.val(`__academy.solve('world','finale-f1-solve')`);
    await s.val(`__academy.solve('world','finale-f2-solve')`);
    await s.val(`__academy.solve('world','finale-f3-solve')`);
    await s.wait(500);
  };

  await s.open(`/?reset=1&skipIntro=1&only=none&lang=${lang}`);
  await s.wait(1200);
  const acts = new Set(await s.val(`__academy.debugActions()`));
  const phase7 = acts.has('world:liftoff-skip') || acts.has('world:liftoff');
  // the ground areas load for this run (integrator, wave 2; WP13's note): with only=none the check
  // „ground areas suspended while airborne“ had no area with code and stayed pending
  // (only=none hides every manifest, so the ids come from the zone list; the ground ones load, the rest stay off)
  const zoneIds = phase7 ? await s.val(`__academy.zones().map((z) => z.id).filter((id) => id !== 'world' && !id.startsWith('_'))`) : [];
  if (zoneIds.length) {
    await s.open(`/?reset=1&skipIntro=1&only=${zoneIds.join(',')}&lang=${lang}`);
    await s.wait(1200);
    const groundIds = await s.val(`__academy.manifests('all').filter((m) => m.frame === 'ground').map((m) => m.id)`);
    await s.open(`/?reset=1&skipIntro=1&only=${groundIds.length ? groundIds.join(',') : 'none'}&lang=${lang}`);
    await s.wait(1200);
    if (groundIds.length) {
      await s.ev(`void __academy.loadAll()`);
      for (let t = 0; t < 240 && !(await s.val(`__academy.settledAll === true`)); t++) await s.wait(500);
    }
  }
  check(/GESPERRT|LOCKED/.test((await sign()) ?? ''), 'fresh start: KIEL sign locked', await sign());

  if (phase7) {
    // ── grounded ──────────────────────────────────────────────────────────────────────────────
    const q0 = await quest();
    check(q0?.flight.state === 'ground', 'fresh start: grounded', q0?.flight.state);
    await s.ev(`__academy.teleport([0,0,30],{yaw:0,pitch:8})`);
    await s.wait(800);
    const sd0 = await skyDraws();
    check(sd0 === 0, 'grounded: 0 sky-dressing draws', `${sd0}`);
    await s.ev(`__academy.teleport([1.3,44.05,-9.4],{yaw:-90,pitch:-25})`);
    await s.wait(800);
    check((await skySwitch()) === 0, 'grounded: no sky switch on the Ausguck (dusk only airborne)');
    // ── the lift-off ──────────────────────────────────────────────────────────────────────────
    await solveFinale();
    await s.val(`__academy.solve('world','${acts.has('world:liftoff-skip') ? 'liftoff-skip' : 'liftoff'}')`);
    await s.wait(3000);
    const q1 = await quest();
    check(q1?.flight.state === 'airborne', 'after the lift-off: airborne', q1?.flight.state);
    check(!!q1?.flight.liftoffSeen, 'after the lift-off: liftoffSeen');
    await s.shot('airborne');
    // the certificate's front and back (WP13, plan §4.14, §2.8)
    const cl = await s.val(`typeof __academy.ext('finale:certificate') === 'function' ? __academy.ext('finale:certificate')('${lang}') : null`);
    if (!cl) later('certificate front and back (finale:certificate)', 'WP13');
    else {
      check(cl.front.some((l) => (lang === 'de' ? /^Erstflug: / : /^First flight: /).test(l)), 'certificate front: the first-flight line', cl.front.join(' | ').slice(0, 160));
      check(cl.front.some((l) => (lang === 'de' ? /Startakku: .+ · Flugmodell: / : /Start battery: .+ · Flight model: /).test(l)), 'certificate front: the Startakku and Flugmodell line');
      check(cl.back.length >= 2 && (lang === 'de' ? /Vollautomatisch heißt nicht menschenleer/ : /Fully automated does not mean empty of people/).test(cl.back.at(-1)), 'certificate back: „Was du unten gesehen hast“ with the closing line', cl.back.join(' | ').slice(0, 160));
    }
    const ga = await groundAreas();
    if (!ga.length) later('ground areas suspended while airborne', 'no ground area with code yet: WP9, WP10, WP14');
    else for (const a of ga) check(!!a.z && (a.z.suspended === true || a.z.status === 'suspended'), `airborne: ${a.id} suspended`, JSON.stringify(a.z ?? null).slice(0, 120));
    await s.ev(`__academy.teleport([1.3,44.05,-9.4],{yaw:-90,pitch:-25})`);
    await s.wait(800);
    check((await skySwitch()) > 0, 'airborne: the sky switch is on the Ausguck');
    // ── reload: airborne stays ────────────────────────────────────────────────────────────────
    await s.open(`/?skipIntro=1&only=none&lang=${lang}`);
    await s.wait(2000);
    const q2 = await quest();
    check(q2?.flight.state === 'airborne', 'reload: still airborne', q2?.flight.state);
    // ── „Zurück ins Dock“ on the Ausguck console ──────────────────────────────────────────────
    await s.ev(`__academy.teleport([0,44.05,-11.5],{yaw:0,pitch:-10})`);
    await s.wait(800);
    const dock = await s.val(`__academy.interact('${lang === 'de' ? 'Zurück ins Dock' : 'Back to the dock'}')`);
    if (!dock) later('„Zurück ins Dock“ on the Ausguck console', 'WP13');
    else {
      await s.wait(4000);
      const q3 = await quest();
      check(q3?.flight.state === 'ground', '„Zurück ins Dock“: grounded', q3?.flight.state);
      check((await skyDraws()) === 0, '„Zurück ins Dock“: 0 sky-dressing draws');
      for (const a of await groundAreas()) check(!!a.z && a.z.suspended !== true && a.z.status !== 'suspended', `docked again: ${a.id} resumed`);
      await s.val(`__academy.solve('world','${acts.has('world:liftoff-skip') ? 'liftoff-skip' : 'liftoff'}')`);
      await s.wait(3000);
    }
    // ── the title: „Im Dock weiterspielen“, „Abheben ansehen“ ─────────────────────────────────
    const title = async (re) => {
      await s.page.goto(`${s.url0}/?lang=${lang}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await s.page.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout: 90000, polling: 200 });
      await s.wait(1500);
      return s.page.evaluate((src) => {
        const re = new RegExp(src, 'i');
        const b = [...document.querySelectorAll('#start button, #start [role=button]')].find((e) => re.test(e.textContent || ''));
        if (!b) return false;
        b.click();
        return true;
      }, re.source);
    };
    if (!(await title(/Im Dock weiterspielen|Continue in the dock/))) later('title „Im Dock weiterspielen“', 'WP1');
    else {
      await s.wait(4000);
      const q4 = await quest();
      check(q4?.flight.state === 'ground', '„Im Dock weiterspielen“: grounded', q4?.flight.state);
      check((await skyDraws()) === 0, '„Im Dock weiterspielen“: 0 sky-dressing draws');
    }
    // „Abheben ansehen“ is offered for an airborne save: fly again first (the dock switch above grounded it)
    await s.open(`/?skipIntro=1&only=none&lang=${lang}`);
    await s.wait(1500);
    await s.val(`__academy.solve('world','${acts.has('world:liftoff-skip') ? 'liftoff-skip' : 'liftoff'}')`);
    await s.wait(3000);
    if (!(await title(/Abheben ansehen|Watch the lift-off/))) later('title „Abheben ansehen“', 'WP1/WP13');
    else {
      // the replay fades to the dock first, then plays the whole lift-off from the console (≈ 100 s,
      // EMI-01 gives the thrust in a replay) and ends airborne
      let docked = false;
      for (let k = 0; k < 40 && !docked; k++) {
        await s.wait(250);
        docked = (await quest())?.flight.state === 'ground';
      }
      check(docked, '„Abheben ansehen“: starts from the dock');
      for (let k = 0; k < 110 && (await quest())?.flight.state !== 'airborne'; k++) await s.wait(1500);
      const q5 = await quest();
      check(q5?.flight.state === 'airborne', '„Abheben ansehen“: ends airborne', q5?.flight.state);
    }
  } else {
    later('Phase 7 ground ↔ air (grounded start, lift-off, airborne reload, „Zurück ins Dock“, title „Im Dock weiterspielen“ / „Abheben ansehen“, sky switch only airborne, ground areas suspended)', 'WP13 world:liftoff / world:liftoff-skip; WP1 title; WP2 sky dressing');
    // ── rc4: the dusk ending across reloads ───────────────────────────────────────────────────
    await solveFinale();
    check(/FREI|OPEN/.test((await sign()) ?? ''), 'in the keel: KIEL sign open', await sign());
    await s.val(`__academy.solve('world','finale-ending')`);
    await s.wait(16000);
    await s.shot('ending-ride-dusk');
    await s.wait(8000);
    // on the Ausguck at dusk, facing the lift car (the shot of the old bug)
    await s.ev(`__academy.lookAt(0, 45.2, -10.7)`);
    await s.wait(400);
    await s.shot('ausguck-dusk-car');
    check(/FREI|OPEN/.test((await sign()) ?? ''), 'ending at the Ausguck: KIEL sign open (no "GESPERRT" at dusk)', await sign());
    await s.wait(14000);
    const st = await s.state('after ending');
    check(st.modal === 'custom', 'certificate open after the dusk');
    await s.shot('certificate');
    await s.ev('__academy.closeModals()');
    await s.wait(1500);
    const f = await fin();
    check(!!f.ended, 'finale state ended');
    check(Math.abs((await sun()) - 3) < 0.6, 'dusk reached (sun ≈ 3°)', `sun ${(await sun()).toFixed(2)}°`);
    await s.ev(`__academy.look(65, -4)`);
    await s.wait(600);
    await s.shot('ausguck-dusk-view');
    // reload: the evening stays, beacons teal, free roam, KIEL open
    await s.open(`/?skipIntro=1&only=none&lang=${lang}`);
    await s.wait(2500);
    check(Math.abs((await sun()) - 3) < 0.6, 'reload: dusk restored', `sun ${(await sun()).toFixed(2)}°`);
    check(/FREI|OPEN/.test((await sign()) ?? ''), 'reload: KIEL sign open', await sign());
    const st2 = await s.state('reloaded');
    check(/Frei erkunden|Free roam/.test(st2.objective ?? ''), 'reload: free-roam objective', st2.objective);
    await s.ev(`__academy.teleport([0,0,40],{yaw:0,pitch:4})`);
    await s.wait(1500);
    await s.shot('hub-dusk-after-reload');
    // the Ausguck switch: back to day, persists across a reload
    await s.ev(`__academy.teleport([1.3,44.05,-9.4],{yaw:-90,pitch:-25})`);
    await s.wait(1200);
    const sw = await s.val(`__academy.interact('${lang === 'de' ? 'Himmel' : 'Sky'}')`);
    check(!!sw, 'sky switch found on the Ausguck', sw ? sw.label : 'not found');
    await s.wait(7500);
    check(Math.abs((await sun()) - 16) < 0.6, 'switch → day (sun ≈ 16°)', `sun ${(await sun()).toFixed(2)}°`);
    await s.ev(`__academy.look(65, -4)`);
    await s.wait(500);
    await s.shot('ausguck-day-after-switch');
    await s.open(`/?skipIntro=1&only=none&lang=${lang}`);
    await s.wait(2500);
    check(Math.abs((await sun()) - 16) < 0.6, 'reload after switching to day: day stays', `sun ${(await sun()).toFixed(2)}°`);
    // and back to the evening
    await s.ev(`__academy.teleport([1.3,44.05,-9.4],{yaw:-90,pitch:-25})`);
    await s.wait(1200);
    await s.val(`__academy.interact('${lang === 'de' ? 'Himmel' : 'Sky'}')`);
    await s.wait(7500);
    check(Math.abs((await sun()) - 3) < 0.6, 'switch → dusk again', `sun ${(await sun()).toFixed(2)}°`);
    await s.ev(`__academy.look(-80, -28)`);
    await s.wait(500);
    await s.shot('sky-switch');
  }
});

for (const p of pending) console.log(`PENDING ${p}`);
const ok = errors.length === 0 && fails.length === 0;
console.log(ok ? `OK   ending state holds across reloads${pending.length ? ` (${pending.length} pending)` : ''}` : `FAIL ${errors.length} errors, ${fails.length} failed checks: ${fails.join('; ')}`);
process.exit(ok ? 0 : 1);
