#!/usr/bin/env node
// Audio level survey of the GLOBAL sounds (island, engine, finale) in headless Chromium.
// Nobody can listen in a headless run, so this measures instead: sample peak, RMS and the RMS
// above 4 kHz ("hf", harshness) in dBFS with window.__academy.audioMeter (docs/ARCHITECTURE.md §5.12).
//
//   node tools/audio-levels.mjs [--json out.json] [--quick]
//
// Uses a private production build (PT_DEV=1: private dev server). The browser runs with
// --autoplay-policy=no-user-gesture-required (tools/lib/shotlib.mjs), so audio starts without a click.
// Prints one table and writes artifacts/<PT_DIR|audio>/levels/levels.json. Exit 1 when a
// sound breaks the ceiling (−1 dBFS) or clips.
import fs from 'node:fs';
import path from 'node:path';
import { session } from './lib/session.mjs';
import { parseArgs } from './lib/shotlib.mjs';

const args = parseArgs(process.argv.slice(2));
process.env.PT_DIR ??= 'audio';
const rows = [];
const problems = [];

const { errors } = await session('levels', async (s) => {
  await s.open('/?reset=1&skipIntro=1&only=none&lang=de');
  await s.wait(1500);
  const st = await s.val('__academy.audioUnlock()');
  s.log('audio context', st);
  await s.ev('__academy.audioArm()');
  await s.wait(800);

  /** measure `ms` after running `code` (bus = the solo + meter target; master always read too) */
  const measure = async (label, bus, code, ms = 1500, { solo = true, settle = 300 } = {}) => {
    await s.ev(`__academy.audioSolo(${solo && bus !== 'master' ? `'${bus}'` : 'null'})`);
    await s.wait(settle);
    const t0 = Date.now();
    if (code) await s.ev(code);
    const rest = ms - (Date.now() - t0);
    if (rest > 0) await s.wait(rest);
    const r = await s.val(`({ bus: __academy.audioMeter(${ms}, '${bus === 'master' ? 'master' : bus}'), master: __academy.audioMeter(${ms}, 'master') })`);
    const row = { label, bus, peak: r.bus.peakDb, rms: r.bus.rmsDb, hf: r.bus.hfDb, masterPeak: r.master.peakDb, masterRms: r.master.rmsDb, clipped: r.master.clipped, covered: r.master.ms, state: r.master.state };
    if (row.covered < ms * 0.5) problems.push(`${label}: meter covered only ${row.covered} of ${ms} ms (audio state ${row.state}) — audio thread stalled?`);
    rows.push(row);
    s.log(`${label.padEnd(34)} ${bus.padEnd(8)} peak ${fmt(row.peak)}  rms ${fmt(row.rms)}  hf ${fmt(row.hf)}  | master peak ${fmt(row.masterPeak)} rms ${fmt(row.masterRms)}${row.clipped ? `  CLIP ${row.clipped}` : ''}`);
    if (row.masterPeak > -1.0) problems.push(`${label}: master peak ${row.masterPeak} dBFS > −1`);
    if (row.clipped) problems.push(`${label}: ${row.clipped} clipped samples`);
    return row;
  };
  const tp = (x, y, z, yaw = 0, pitch = 0) => s.ev(`__academy.teleport([${x},${y},${z}],{yaw:${yaw},pitch:${pitch}})`);

  // ── beds: wind + rotor drones (ambience), by place ─────────────────────────────────────
  const places = [
    ['arrival (Landedeck)', 0, 0, 94.5, 0, 6],
    ['plaza / Libelle', 0, 0, 26, 0, 0],
    ['deck rim (E lobe)', 96, 0, 0, 90, 0],
    ['Kanzel 60° (glass floor)', 76, 0, -44, 60, -40],
    ['Glasbalkon', 0, 0, -92, 180, -30],
    ['Ausguck +44', 0, 44, 11, 0, 0],
  ];
  for (const [label, x, y, z, yaw, pitch] of places) {
    await tp(x, y, z, yaw, pitch);
    await s.wait(4500); // wind follows with τ = 0.8 s
    await measure(`bed · ${label}`, 'ambience', null, 3000, { solo: false, settle: 0 });
  }

  // ── one-shots, soloed on their bus (master read in the same window) ───────────────────
  await tp(0, 0, 40, 0, 0);
  await s.wait(1500);
  const shots = [
    ['ui', 'click', `__academy.audioPlay('click')`],
    ['ui', 'click (interact, 0.8)', `__academy.audioPlay('click',{volume:0.8})`],
    ['ui', 'hover (0.4)', `__academy.audioPlay('hover',{volume:0.4})`],
    ['ui', 'open', `__academy.audioPlay('open')`],
    ['ui', 'close', `__academy.audioPlay('close')`],
    ['ui', 'type ×6 (dialogue)', `for (let i=0;i<6;i++) setTimeout(()=>__academy.audioPlay('type',{volume:0.6}), i*45)`],
    ['ui', 'toast beep (info)', `__academy.game.audio.play('beep',{volume:0.8,pitch:1.4,bus:'ui'})`],
    ['foley', 'step concrete ×3', `for (let i=0;i<3;i++) setTimeout(()=>__academy.audioPlay('step:concrete',{volume:0.85}), i*380)`],
    ['foley', 'step metal ×3', `for (let i=0;i<3;i++) setTimeout(()=>__academy.audioPlay('step:metal',{volume:0.85}), i*380)`],
    ['foley', 'step glass ×3', `for (let i=0;i<3;i++) setTimeout(()=>__academy.audioPlay('step:glass',{volume:0.85}), i*380)`],
    ['foley', 'step grass ×3', `for (let i=0;i<3;i++) setTimeout(()=>__academy.audioPlay('step:grass',{volume:0.85}), i*380)`],
    ['foley', 'step sprint concrete ×3', `for (let i=0;i<3;i++) setTimeout(()=>__academy.audioPlay('step:concrete',{volume:1.25}), i*300)`],
    ['foley', 'jump', `__academy.audioPlay('jump',{volume:0.7})`],
    ['foley', 'land (hard, 1.2)', `__academy.audioPlay('land',{volume:1.2})`],
    ['cues', 'stamp (Recamán note)', `__academy.audioPlay('stamp:440')`],
    ['cues', 'success', `__academy.audioPlay('success',{volume:0.7})`],
    ['cues', 'error', `__academy.audioPlay('error',{volume:0.6})`],
    ['cues', 'beep (zone default)', `__academy.audioPlay('beep')`],
    ['cues', 'whoosh (pad launch 0.9)', `__academy.audioPlay('whoosh',{volume:0.9})`],
    ['cues', 'whoosh (gust max)', `__academy.audioPlay('whoosh',{volume:0.6,pitch:0.6})`],
    ['cues', 'whoosh (start)', `__academy.audioPlay('whoosh',{volume:0.6})`],
    ['cues', 'thud (F1 bumper)', `__academy.audioPlay('thud',{volume:0.55})`],
    ['cues', 'grab', `__academy.audioPlay('grab')`],
    ['cues', 'drop', `__academy.audioPlay('drop')`],
    ['cues', 'throw (max)', `__academy.audioPlay('throw',{volume:1})`],
    ['cues', 'pad charge tone', `__academy.game.audio.tone({freq:196,to:523,dur:0.32,type:'triangle',volume:0.9})`],
    ['cues', 'pad enter beep', `__academy.game.audio.beep(660,0.05,{volume:0.5})`],
    ['cues', 'lift chime', `__academy.game.audio.tone({freq:523,to:659,dur:0.18,type:'sine',volume:0.7})`],
    ['cues', 'radio blip (dock line)', `__academy.game.audio.tone({freq:880,to:1320,dur:0.12,type:'sine',volume:0.6})`],
    ['cues', 'beacon notes (ending)', `[0,1,3].forEach((n,i)=>setTimeout(()=>__academy.game.audio.tone({freq:220*Math.pow(2,(n+12)/12),dur:0.5,type:'sine',volume:0.6}), i*500))`],
    ['cues', 'tone square 440 (zone)', `__academy.game.audio.tone({freq:440,dur:0.3,type:'square',volume:1})`],
    ['cues', 'tone saw 220 (zone)', `__academy.game.audio.tone({freq:220,dur:0.3,type:'sawtooth',volume:1})`],
    // game-layer cues (ctx.game.juice.cue, docs/FUN-PLAN.md §4): cue band −18 … −9 dBFS peak
    ['cues', 'cue good', `__academy.audioCue('good')`],
    ['cues', 'cue great', `__academy.audioCue('great')`],
    ['cues', 'cue bad', `__academy.audioCue('bad')`],
    ['cues', 'cue oops', `__academy.audioCue('oops')`],
    ['cues', 'cue tick (countdown 0.9)', `__academy.audioCue('tick',{volume:0.9})`],
    ['cues', 'cue go', `__academy.audioCue('go')`],
    ['cues', 'cue star ×3 (banner)', `[0,1,2].forEach((i)=>setTimeout(()=>__academy.audioCue('star',{pitch:1+0.12*i,volume:0.9}), i*280))`],
    ['cues', 'cue pb', `__academy.audioCue('pb',{volume:0.9})`],
    ['cues', 'cue collect', `__academy.audioCue('collect')`],
    // the tower draws a line (GameLayer on logo:element): laser hiss while drawing, then the element's note ×2 at 0.45
    ['cues', 'logo draw hiss (1.2 s)', `{ const stop = __academy.game.audio.hiss({ volume: 0.7 }); setTimeout(stop, 1200); }`],
    ['cues', 'logo landing note (A5)', `__academy.game.audio.tone({ freq: 880, dur: 0.6, type: 'triangle', volume: 0.45 })`],
    ['voice', 'EMI chirp (2 m)', `const p=__academy.game.camera.position; __academy.audioPlay('chirp',{at:[p.x+1.6,p.y,p.z-1.2]})`],
    ['voice', 'EMI chirp (6 m)', `const p=__academy.game.camera.position; __academy.audioPlay('chirp',{at:[p.x+3,p.y,p.z-5.2]})`],
  ];
  for (const [bus, label, code] of args.quick ? shots.slice(0, 8) : shots) await measure(label, bus, code, 1400);

  // ── flows with the real game code ──────────────────────────────────────────────────────
  await s.ev('__academy.audioSolo(null)');
  // walking the avenue (real footsteps from the player controller)
  await tp(0, 0, 80, 0, 0);
  await s.wait(2500);
  await measure('flow · walking the avenue 3 s', 'foley', `__academy.press('KeyW', 3000)`, 3000, { solo: false });
  // a gust (whoosh + rotor pitch + wind swell)
  await tp(0, 0, 40, 0, 0);
  await s.wait(2500);
  await measure('flow · island gust (full mix)', 'master', `__academy.solve('world','gust')`, 4000, { solo: false });
  // jump pad: stand on the sensordom hub pad (bearing 270, r 27) and launch with E
  await tp(-27, 0, 0, 90, 0);
  await s.wait(1500);
  await measure('flow · jump pad launch + flight', 'master', `__academy.press('KeyE', 120)`, 4000, { solo: false });
  // lift foyer → Ausguck: call console in the car
  await tp(0, 0, -10.7, 180, 0);
  await s.wait(1500);
  await measure('flow · lift ride to Ausguck', 'master', `__academy.interact('AUSGUCK')`, 7000, { solo: false });
  // finale: keel arrival (data buzz + drones), F1 (roar, gust whooshes, bumper thuds), F2 (data loop + tick beeps)
  await s.ev(`__academy.solve('world','finale-goto')`);
  await s.wait(4000);
  await measure('flow · Kielraum bed', 'master', null, 3000, { solo: false, settle: 0 });
  await measure('flow · F1 Hand am Steuer (bot)', 'master', `__academy.solve('world','finale-f1-bot')`, 12000, { solo: false });
  await s.wait(12000);
  await s.ev('__academy.closeModals(); __academy.exitOperate()');
  await s.wait(1000);
  await measure('flow · F2 audit run', 'master', `__academy.solve('world','finale-f2')`, 9000, { solo: false });
  await s.wait(14000);
  await s.ev('__academy.closeModals(); __academy.exitOperate()');
  await s.val(`__academy.solve('world','finale-f2-solve')`);
  await s.val(`__academy.solve('world','finale-f3-solve')`);
  await s.wait(500);
  await measure('flow · ending (lift up, beacons, banner)', 'master', `__academy.solve('world','finale-ending')`, 24000, { solo: false });
  await measure('flow · ending (dusk, certificate)', 'master', null, 8000, { solo: false, settle: 0 });
  await s.ev('__academy.closeModals()');
});

function fmt(v) {
  return (v <= -120 ? '  −∞ ' : v.toFixed(1).padStart(6)).replace('-', '−');
}

const out = path.join(process.cwd(), 'artifacts', process.env.PT_DIR, 'levels', 'levels.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ rows, problems, errors }, null, 2));
if (args.json && args.json !== true) fs.writeFileSync(String(args.json), JSON.stringify(rows, null, 2));
for (const p of problems) console.log('PROBLEM', p);
const ok = errors.length === 0 && problems.length === 0;
console.log(ok ? `OK   ${rows.length} measurements → ${path.relative(process.cwd(), out)}` : `FAIL ${errors.length} errors, ${problems.length} problems`);
process.exit(ok ? 0 : 1);
