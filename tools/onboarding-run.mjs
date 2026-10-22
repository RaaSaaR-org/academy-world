#!/usr/bin/env node
// Time-to-first-zone with REAL input, the way a first-time visitor from a link plays it
// (docs/PHASE7-PLAN.md §1.2): clicks Start, watches (or skips with Space) the 6 s glide down to the
// bridge head, follows the orange objective with the keyboard (W to walk, ← / → to turn: pointer lock
// is unavailable headless) over the bridge and the Allee, reads EMI's lines, HOLDS E 1 s on the
// Probestart lever at the Libelle column (−3.3, 0, 22.7) — the first mechanic —, gets the Pass handed
// over, presses E on the orange jump pad and walks through the zone gate. Nothing is teleported or
// solved by script; the script only READS the screen state (objective target, focus prompt, modal).
// An rc4-style build (the ascent, the Libelle „Böe auslösen“ button, the Pass-Terminal) still runs;
// its beats are reported against the rc4 numbers.
// Targets (Phase 7, no ascent): first mechanic ≤ 30 s, first zone ≤ 65 s. Entscheider: after the
// Probestart the Bodencrew supplies AKKU and NAV (quest snapshot, by 'crew') within 6 s.
//
//   node tools/onboarding-run.mjs [--lang de|en] [--mode entdecker|entscheider] [--skip-after 3] [--read 8] [--idle 10] [--returning]
//     --skip-after s   press Space s seconds into the glide (omit: watch it)
//     --read s         seconds spent looking at the Pass before closing it (default 8)
//     --idle s         W2: stand still s seconds after the glide first (the movement card must show by then;
//                      the first-mechanic and first-zone targets do not apply to such a run)
//     --returning      a returning visitor (a save with a stamp and the Sensordom entered last): Start
//                      („Weiterspielen“) must give no glide and resume at that area's gate within 3 s
//
// Writes artifacts/<PT_DIR|onboarding>/run-<lang>-<mode>[-skip|-returning]/ (screenshots + log.json)
// and prints the time of every beat. Exit 1 when a target is missed (or the first zone is not reached
// within 180 s).
import { session } from './lib/session.mjs';
import { parseArgs } from './lib/shotlib.mjs';

const args = parseArgs(process.argv.slice(2));
const lang = String(args.lang ?? 'de');
const mode = String(args.mode ?? 'entdecker');
const skipAfter = args['skip-after'] !== undefined ? Number(args['skip-after']) : null;
const readS = Number(args.read ?? 8);
const idleS = args.idle !== undefined ? Number(args.idle) : 0;
const returning = !!args.returning;
const LIMIT_S = 180;
const TARGET_MECH = 30;
const TARGET_ZONE = 65;
const PREFIX = 'emai-academy-island/v1:';
/** A returning rc4-format save: one Sensordom stamp, the Sensordom entered last (the migration reads it). */
const RETURNING_SAVE = { v: 1, mode, stamps: { 'sensordom.messbrille': { t: 1760000000000 } }, visited: { sensordom: 1760000000000 }, zoneData: { world: { onboarding: 4, ascentSeen: true } }, predictions: {}, questions: [], album: [], best: {}, challenges: { 'sensordom.messbrille': { best: 5, stars: 1, attempts: 1, last: 5, t: 1760000000000 } }, collectibles: [], lastZone: 'sensordom' };
const problems = [];
let flow = 'unknown';
process.env.PT_DIR ??= 'onboarding';

const beats = [];
let moveCardLog = [];
let idleUntil = null;
let ok = false;
const { errors } = await session(`run-${lang}-${mode}${returning ? '-returning' : skipAfter !== null ? '-skip' : ''}`, async (s) => {
  const page = s.page;
  if (returning) {
    await page.addInitScript(([k, v]) => {
      try {
        if (sessionStorage.getItem('__onb_seeded')) return;
        localStorage.setItem(k, v);
        sessionStorage.setItem('__onb_seeded', '1');
      } catch (e) {
        /* storage blocked */
      }
    }, [PREFIX + 'progress', JSON.stringify(RETURNING_SAVE)]);
    await s.open(`/?lang=${lang}`);
  } else await s.open(`/?reset=1&lang=${lang}`);
  await page.waitForSelector('#start-btn', { state: 'visible', timeout: 30000 });
  // the loading overlay fades out over the title screen: wait until it is gone, as a visitor would
  await page.waitForFunction(() => document.querySelector('#loading')?.classList.contains('hidden') ?? true, null, { timeout: 30000 });
  // choose the mode card like a visitor (second card = Entscheider)
  if (mode === 'entscheider') await page.click('#start .modes .mode:nth-child(2)');
  await s.shot('title');
  const t0 = Date.now();
  const T = () => (Date.now() - t0) / 1000;
  const beat = (name, extra = {}) => {
    const b = { t: Math.round(T() * 10) / 10, beat: name, ...extra };
    beats.push(b);
    s.log(`  ${String(b.t).padStart(6)} s  ${name}${Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''}`);
  };
  await page.click('#start-btn');
  beat('start clicked');
  if (returning) {
    // no glide, resume at the gate of the area entered last (§3.6)
    let cine = false;
    for (;;) {
      const c = await s.val(`({ cine: document.querySelector('#hud')?.classList.contains('cinematic') ?? false, phase: __academy.state().phase, pos: __academy.state().player.pos })`);
      cine ||= c.cine;
      if (c.phase === 'playing' && !c.cine) break;
      if (T() > 20) throw new Error('never in control after Start');
      await s.wait(100);
    }
    beat('in control', { glide: cine });
    await s.wait(600);
    const r = await s.val(`(() => { const sp = __academy.game.zones.spawnOf('sensordom'); const p = __academy.state().player.pos; return { pos: p, gate: sp ? [sp.pos.x, sp.pos.y, sp.pos.z] : null, d: sp ? Math.hypot(p[0] - sp.pos.x, p[2] - sp.pos.z) : null, toasts: __academy.toasts().slice(-3) }; })()`);
    beat('resumed', r);
    if (cine) problems.push('returning: a glide or ascent played (a returning visitor gets none, §3.6)');
    if (T() > 3.5) problems.push(`returning: in control after ${T().toFixed(1)} s (want ≤ 3 s)`);
    if (r.d == null || r.d > 8) problems.push(`returning: resumed at ${JSON.stringify(r.pos)}, ${r.d == null ? 'no gate' : `${r.d.toFixed(1)} m`} from the Sensordom gate (want ≤ 8 m)`);
    ok = problems.length === 0;
    await s.shot('resumed');
    return;
  }
  if (skipAfter !== null) {
    await s.wait(skipAfter * 1000);
    await page.keyboard.press('Space');
    beat('ascent skipped (Space)');
  }
  // wait for control (glide or ascent over)
  for (;;) {
    const c = await s.val(`({ cine: document.querySelector('#hud')?.classList.contains('cinematic') ?? false, phase: __academy.state().phase, obj: __academy.state().objective })`);
    if (c.phase === 'playing' && !c.cine && c.obj) break;
    if (T() > 60) throw new Error('the glide (or ascent) never ended');
    await s.wait(200);
  }
  {
    const p = await s.val(`__academy.state().player.pos`);
    flow = Math.abs(p[2] - 114) < 6 ? 'phase7' : 'rc4';
    beat('in control', { pos: p, flow });
  }
  await s.shot('arrival');
  // W2: the movement card (key caps) — logged whenever it shows or hides, with the walk and turn so far
  const moveCard = { shown: false, events: moveCardLog };
  const watchMoveCard = async () => {
    const on = await s.val(`!!document.querySelector('#onb-move.show')`);
    if (on === moveCard.shown) return;
    moveCard.shown = on;
    const c = await s.val(`__academy.solve('world','onboarding-move')`);
    moveCard.events.push({ t: T(), on, ...c });
    beat(on ? 'movement card shown' : 'movement card hidden', { walked: c.walked, turnedDeg: c.turnedDeg, learned: c.learned, stage: c.stage });
  };
  if (idleS > 0) {
    const tIdle = T();
    while (T() < tIdle + idleS) {
      await watchMoveCard();
      await s.wait(200);
    }
    if (moveCard.shown) await s.shot('movement-card-idle');
    idleUntil = T();
    beat(`stood still ${idleS} s`, { card: moveCard.shown });
  }

  const held = new Set();
  const hold = async (key, on) => {
    if (on && !held.has(key)) {
      held.add(key);
      await page.keyboard.down(key);
    } else if (!on && held.has(key)) {
      held.delete(key);
      await page.keyboard.up(key);
    }
  };
  const releaseAll = async () => {
    for (const k of [...held]) await hold(k, false);
  };

  // a visitor's view of the layout: the tower door (S facet) and the Libelle plinth are obstacles to walk around
  // inside = within the facets or standing in the 4 m door opening (S facet, z ≈ 8.7–9.4)
  const insideTower = (p) => Math.hypot(p[0], p[2]) < 9.9;
  const waypoint = (p, target) => {
    const tIn = Math.hypot(target.x, target.z) < 8.6;
    const pIn = insideTower(p);
    if (tIn && !pIn) return Math.abs(p[0]) > 1.2 || p[2] > 13 ? { x: 0, z: 12.5 } : { x: 0, z: 6.5 };
    if (!tIn && pIn) return Math.abs(p[0]) > 1.2 && p[2] < 9 ? { x: 0, z: 7 } : { x: 0, z: 12.5 };
    // Libelle plinth (r ≈ 3.5 at (0, 19)): pass it on the side of the target
    const lx = 0,
      lz = 19;
    const dx = target.x - p[0],
      dz = target.z - p[2];
    const len = Math.hypot(dx, dz) || 1;
    const u = ((lx - p[0]) * dx + (lz - p[2]) * dz) / (len * len);
    if (u > 0 && u < 1) {
      const cx = p[0] + dx * u,
        cz = p[2] + dz * u;
      if (Math.hypot(cx - lx, cz - lz) < 4.6 && Math.hypot(target.x - lx, target.z - lz) > 7) {
        const side = target.x >= 0 ? 1 : -1;
        return { x: lx + side * 6, z: lz };
      }
    }
    return target;
  };

  let stuck = 0;
  let lastPos = null;
  let passOpenedAt = null;
  let launched = false;
  let firstLibelle = false;
  let firstPad = false;
  let gustPressed = false;
  let lastDialogue = '';
  let lines = 0;
  while (T() < LIMIT_S) {
    await watchMoveCard();
    const st = await s.val(`(() => { const s = __academy.state(); return { pos: s.player.pos, yaw: s.player.yawDeg, zone: s.player.zone, obj: s.objective, tgt: s.objectiveTarget, focus: s.focus, modal: s.modal, dialogue: s.dialogue, hint: document.querySelector('#hint.show')?.textContent ?? '' }; })()`);
    if (st.dialogue && st.dialogue.text !== lastDialogue) {
      lastDialogue = st.dialogue.text;
      lines++;
      beat('EMI line', { text: lastDialogue.slice(0, 70) });
    }
    if (st.zone) {
      await releaseAll();
      beat('FIRST ZONE ENTERED', { zone: st.zone });
      ok = true;
      await s.wait(1500);
      await s.shot('first-zone');
      break;
    }
    if (st.modal) {
      await releaseAll();
      if (passOpenedAt === null) {
        passOpenedAt = T();
        beat('pass open', { modal: st.modal });
        await s.shot('pass');
      }
      if (T() - passOpenedAt >= readS) {
        await page.keyboard.press('Escape');
        beat('pass closed (Esc)');
      }
      await s.wait(200);
      continue;
    }
    if (!firstLibelle && st.pos[2] < 26.5 && Math.abs(st.pos[0]) < 8) {
      firstLibelle = true;
      beat('at the Libelle');
    }
    const label = st.focus && st.focus.kind === 'interactable' ? st.focus.label : '';
    if (flow === 'phase7' && st.pos[1] < -8) {
      beat('FELL at the bridge head', { pos: st.pos });
      problems.push('fell from the bridge head: no ground / bridge yet (WP3)');
      break;
    }
    // Phase 7: the Probestart lever, held 1 s (the first mechanic)
    if (!gustPressed && /Probestart|test start/i.test(label)) {
      gustPressed = true;
      await releaseAll();
      await page.keyboard.down('KeyE');
      await s.wait(1200);
      await page.keyboard.up('KeyE');
      beat('FIRST MECHANIC: E held on the Probestart lever', { label });
      await s.wait(600);
      await s.shot('probestart');
      if (mode === 'entscheider') {
        // the Bodencrew supplies AKKU and NAV during EMI-01's second line (§1.2, D23)
        const tP = T();
        let crew = null;
        while (T() - tP < 8) {
          crew = await s.val(`(() => { const q = __academy.quest ? __academy.quest() : __academy.game.quest?.snapshot?.(); return q ? { energy: q.start.energy, nav: q.start.nav } : null; })()`);
          if (crew && crew.energy.by === 'crew' && crew.nav.by === 'crew') break;
          await s.wait(250);
        }
        if (crew && crew.energy.by === 'crew' && crew.nav.by === 'crew') beat('Bodencrew: AKKU and NAV supplied', { after: +(T() - tP).toFixed(1) });
        else problems.push(`Entscheider: the Bodencrew did not supply AKKU and NAV within 8 s of the Probestart (${JSON.stringify(crew)})`);
      }
      continue;
    }
    // the Libelle toy: E on „Böe auslösen" while that is the objective (the first mechanic)
    if (!gustPressed && /Böe auslösen|Trigger a gust/i.test(label) && st.tgt && Math.hypot(st.tgt.x + 3.3, st.tgt.z - 22.7) < 2) {
      gustPressed = true;
      await releaseAll();
      await page.keyboard.press('KeyE');
      beat('FIRST MECHANIC: E on the Libelle gust button', { label });
      await s.wait(600);
      await s.shot('libelle-gust');
      continue;
    }
    // E on the Pass-Terminal while that is the objective
    if (/Pass/i.test(label) && st.tgt && Math.hypot(st.tgt.x - 4, st.tgt.z - 3) < 1) {
      await releaseAll();
      await page.keyboard.press('KeyE');
      beat('E at Pass-Terminal', { label });
      await s.wait(500);
      continue;
    }
    // on the orange pad leading to the objective: the hint names the destination → E launches
    const onPad = /\[E\] (Springen|Jump)/.test(st.hint) && Math.hypot(st.pos[0], st.pos[2]) > 24 && Math.hypot(st.pos[0], st.pos[2]) < 30;
    if (onPad && !launched && st.tgt) {
      const tb = Math.atan2(st.tgt.x, -st.tgt.z),
        pb = Math.atan2(st.pos[0], -st.pos[2]);
      if (Math.abs(((tb - pb + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < 0.35) {
        await releaseAll();
        if (!firstPad) {
          firstPad = true;
          await s.shot('pad');
        }
        await page.keyboard.press('KeyE');
        launched = true;
        beat('E on the jump pad', { hint: st.hint.slice(0, 60) });
        await s.wait(3200);
        continue;
      }
    }
    if (!st.tgt) {
      await releaseAll();
      await s.wait(200);
      continue;
    }
    // at the gust column's stand point: turn to the button (a visitor looks at what EMI points at)
    const BTN = { x: -3.3, z: 22.7 };
    if (!gustPressed && Math.hypot(st.tgt.x - BTN.x, st.tgt.z - BTN.z) < 2 && Math.hypot(st.pos[0] - st.tgt.x, st.pos[2] - st.tgt.z) < 0.9) {
      const want = Math.atan2(-(BTN.x - st.pos[0]), -(BTN.z - st.pos[2]));
      const err = ((want - (st.yaw * Math.PI) / 180 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      await hold('KeyW', false);
      await hold('ArrowLeft', err > 0.05);
      await hold('ArrowRight', err < -0.05);
      await s.wait(80);
      continue;
    }
    // where to go: the objective, but via the hub pad of that zone once the Pass is done
    let goal = { x: st.tgt.x, z: st.tgt.z };
    const r = Math.hypot(goal.x, goal.z);
    const pr = Math.hypot(st.pos[0], st.pos[2]);
    if (r > 50 && !launched && pr < 40) {
      const k = 27 / r;
      goal = { x: goal.x * k, z: goal.z * k }; // the zone's hub pad on the same bearing
    }
    const wp = waypoint(st.pos, goal);
    const want = Math.atan2(-(wp.x - st.pos[0]), -(wp.z - st.pos[2])); // yaw 0 = −Z, +90° = −X
    const yaw = (st.yaw * Math.PI) / 180;
    const err = ((want - yaw + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    await hold('ArrowLeft', err > 0.08);
    await hold('ArrowRight', err < -0.08);
    await hold('KeyW', Math.abs(err) < 0.6);
    // unstick: walking but not moving → step sideways
    if (lastPos && held.has('KeyW') && Math.hypot(st.pos[0] - lastPos[0], st.pos[2] - lastPos[2]) < 0.05) stuck++;
    else stuck = 0;
    lastPos = st.pos;
    if (stuck > 6) {
      await hold('KeyD', true);
      await s.wait(600);
      await hold('KeyD', false);
      stuck = 0;
    }
    await s.wait(100);
  }
  await releaseAll();
  beat(ok ? 'done' : 'TIMEOUT');
  s.log(`EMI lines seen: ${lines}`);
  await s.shot('end');
});

const first = beats.find((b) => b.beat === 'FIRST ZONE ENTERED');
const mech = beats.find((b) => b.beat.startsWith('FIRST MECHANIC'));
if (!returning) {
  console.log(mech ? `FIRST MECHANIC after ${mech.t} s (target ≤ ${flow === 'rc4' ? '45 s with the rc4 ascent watched' : `${TARGET_MECH} s`})` : 'FIRST MECHANIC NOT REACHED (neither the Probestart lever nor the Libelle gust button was pressed)');
  console.log(first ? `FIRST ZONE after ${first.t} s (limit ${LIMIT_S} s, target ≤ ${TARGET_ZONE} s) · ${lang}/${mode} · ${flow}${skipAfter !== null ? ` · intro skipped after ${skipAfter} s` : ' · intro watched'}` : 'FIRST ZONE NOT REACHED');
}
// W2: the card showed, and it never went away before the walk + turn (or before the Pass took over)
const mc = moveCardLog;
const early = mc.find((e) => !e.on && !e.learned && e.stage < 3);
const idleOk = idleS <= 0 || (idleUntil !== null && mc.some((e) => e.on && e.t <= idleUntil));
if (!returning) console.log(mc.length ? `MOVEMENT CARD: ${mc.map((e) => `${e.on ? 'shown' : 'hidden'} ${e.t} s (walked ${e.walked} m, turned ${e.turnedDeg}°)`).join(' · ')}${early ? ' · HIDDEN TOO EARLY' : ''}${idleS > 0 ? (idleOk ? ` · shown within the ${idleS} s idle` : ` · NOT SHOWN within the ${idleS} s idle`) : ''}` : 'MOVEMENT CARD: never shown');
if (!returning && idleS <= 0 && flow === 'phase7') {
  if (!mech || mech.t > TARGET_MECH) problems.push(`first mechanic ${mech ? `after ${mech.t} s` : 'never reached'} (target ≤ ${TARGET_MECH} s)`);
  if (!first || first.t > TARGET_ZONE) problems.push(`first zone ${first ? `after ${first.t} s` : 'never reached'} (target ≤ ${TARGET_ZONE} s)`);
} else if (!returning && flow === 'rc4') console.log(`note: an rc4-style start (ascent, gust button): the Phase 7 targets (${TARGET_MECH} s / ${TARGET_ZONE} s) wait for WP12's glide, bridge-head spawn and Probestart`);
for (const p of problems) console.log('PROBLEM', p);
const pass = returning ? ok && errors.length === 0 : ok && errors.length === 0 && first && first.t <= LIMIT_S && !early && idleOk && !problems.length;
console.log(pass ? 'OK' : `FAIL (${errors.length} errors, ${problems.length} problems)`);
process.exit(pass ? 0 : 1);
