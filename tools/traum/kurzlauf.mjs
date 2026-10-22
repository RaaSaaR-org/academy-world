#!/usr/bin/env node
// The Schaufenster's Kurzlauf „Traumdaten“ (plan §4.9, D41 as amended by D23; R3 §5.6): the hangar's
// station C as a recorded 40 s run for WP11's stand, titled „So entsteht das Flugmodell“, because in
// Entscheider mode the Bodencrew's Flugmodell was built this way. WP10 owns this generator, WP11 commits
// the output (plan §6.2 hand-off).
//
//   node tools/traum/kurzlauf.mjs --out src/zones/schauhalle/kurzlauf/traumdaten.json [--seed 1] [--check]
//
// It runs the station's own toy model (src/zones/traumhangar/model.ts with its tuning.ts: Node strips the
// types itself), so the stand shows what the hangar measures. Every number is ILLUSTRATIV (a toy world
// model) or SIM · AUFZEICHNUNG (its recorded draws); the island's Flugmodell is FIKTION. Fixed seeds: the
// same bytes every run (--check compares against the file at --out and exits 1 on a difference).
//
// File (JSON, UTF-8): {
//   kind: 'traumdaten-kurzlauf', version: 1, generator, seed,
//   title / subtitle: { de, en },
//   chips: { offline: 'illustrativ', closed: 'sim-aufzeichnung', flugmodell: 'fiktion', dream: 'traum' },
//   durationS: 40,
//   beats: [{ t0, t1, id, caption: { de, en } }]            the stand's script (seconds)
//   tiles: [{ error | null, decoy, task, phase }]          8 sample dreams, 3 with physics errors
//   mixes: [{ id, label: { de, en }, offline, hidden?, closed: { k, n, p, lo, hi, lanes: boolean[] } }]
//          'echt' (20 real demos only), 'alle' (+ all 200 dreams), 'geprueft' (+ the checked dreams),
//          'stillstand' (does nothing; hidden until the trap is revealed)
//   offlineWinner: 'stillstand', offlineWinnerReal: 'alle', closedWinner: 'geprueft',
//   installed: { mix, label, pp, lo, hi, n }               the Flugmodell: checked dreams vs real only (Newcombe)
//   deal: { a: { offer, offline, closed }, b: { … } }      the Entscheider deal (R3 §5.6)
//   horizon: { rows: [{ horizon, k, n }], best }           station B's Kennlinie (0,5 / 2 / 8 s, n = 20)
//   befund: { messgroesse, grenze, frage, folgefragen[], fuerDeinWerk }   the Befundkarte (de, en each)
// }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ZONE = path.join(ROOT, 'src', 'zones', 'traumhangar');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, []),
);
const OUT = path.resolve(ROOT, String(args.out ?? 'src/zones/schauhalle/kurzlauf/traumdaten.json'));
const SEED = Number(args.seed ?? 1);

const T = await import(pathToFileURL(path.join(ZONE, 'tuning.ts')).href);
const M = await import(pathToFileURL(path.join(ZONE, 'model.ts')).href);

const pct = (x) => Math.round(x * 1000) / 10;
const label = {
  echt: { de: 'nur echt (20 Demos)', en: 'real only (20 demos)' },
  alle: { de: 'echt + alle Träume', en: 'real + all dreams' },
  geprueft: { de: 'echt + geprüfte Träume', en: 'real + checked dreams' },
  stillstand: { de: 'Stillstand (tut nichts)', en: 'Standing still (does nothing)' },
};

// the station's run: all three physics errors found, no false flag (the Bodencrew's careful check)
const rows = M.pruefzelle(T.C, { seed: SEED, found: T.C.errors, falseFlags: 0 });
const offline = Object.fromEntries(M.offlineBars(T.C).map((b) => [b.mix, b.error]));
const mixes = rows.map((r) => {
  const [p, lo, hi] = M.wilson(r.k, r.n);
  return { id: r.mix, label: label[r.mix], offline: offline[r.mix], ...(r.mix === 'stillstand' ? { hidden: true } : {}), closed: { k: r.k, n: r.n, p: pct(p), lo: pct(lo), hi: pct(hi), lanes: r.lanes } };
});
const installed = M.installedMix(rows);
const gain = M.gainPp(rows, 'geprueft', 'echt');
const deal = {
  a: { offer: { de: '10.000 Träume, offline +40 %', en: '10,000 dreams, offline +40 %' }, ...pick(M.dealOutcome(T.C, 'a', SEED)) },
  b: { offer: { de: '1.000 geprüfte Träume + Messung im geschlossenen Lauf', en: '1,000 checked dreams + a closed-loop measurement' }, ...pick(M.dealOutcome(T.C, 'b', SEED)) },
};
function pick(o) {
  const [p, lo, hi] = M.wilson(o.closed.k, o.closed.n);
  return { offline: o.offline, closed: { mix: o.closed.mix, k: o.closed.k, n: o.closed.n, p: pct(p), lo: pct(lo), hi: pct(hi) } };
}
const ml = M.messlaufB(T.B, { seed: SEED, noise: T.DREAM.noise, agentNoise: T.DREAM.agentNoise, forgetS: T.DREAM.forgetS, horizons: T.DREAM.horizons });

const data = {
  kind: 'traumdaten-kurzlauf',
  version: 1,
  generator: 'tools/traum/kurzlauf.mjs (WP10) · src/zones/traumhangar/model.ts',
  seed: SEED,
  title: { de: 'So entsteht das Flugmodell', en: 'How the flight model is made' },
  subtitle: { de: 'Traumdaten: offline gut heißt nicht gut', en: 'Dream data: good offline doesn’t mean good' },
  chips: { offline: 'illustrativ', closed: 'sim-aufzeichnung', flugmodell: 'fiktion', dream: 'traum' },
  durationS: 40,
  beats: [
    { t0: 0, t1: 8, id: 'traeume', caption: { de: '20 echte Demos. Das Weltmodell träumt 200 dazu.', en: '20 real demos. The world model dreams 200 more.' } },
    { t0: 8, t1: 14, id: 'pruefen', caption: { de: 'Drei Träume brechen die Physik. Sie fliegen raus.', en: 'Three dreams break physics. They are filtered out.' } },
    { t0: 14, t1: 20, id: 'offline', caption: { de: 'Offline-Test: „alle Träume“ sieht am besten aus.', en: 'Offline test: “all dreams” looks best.' } },
    { t0: 20, t1: 24, id: 'stillstand', caption: { de: 'Noch besser offline: Stillstand. Wer nichts tut, macht offline keine Fehler.', en: 'Even better offline: standing still. Do nothing, and offline you make no mistakes.' } },
    { t0: 24, t1: 33, id: 'geschlossen', caption: { de: 'Geschlossener Lauf: n = 20 je Mischung am Wagen.', en: 'Closed loop: n = 20 per mix on the cart.' } },
    { t0: 33, t1: 40, id: 'flugmodell', caption: { de: 'Das Flugmodell: die beste Mischung im geschlossenen Lauf.', en: 'The flight model: the best mix in the closed loop.' } },
  ],
  tiles: M.tiles(T.C, SEED),
  mixes,
  offlineWinner: M.offlineWinner(T.C, true),
  offlineWinnerReal: M.offlineWinner(T.C, false),
  closedWinner: installed,
  installed: { mix: installed, label: label[installed], pp: gain.pp, lo: gain.lo, hi: gain.hi, n: gain.n },
  deal,
  horizon: { rows: ml.map((r) => ({ horizon: r.horizon, k: r.k, n: r.n })), best: M.bestHorizon(ml) },
  befund: {
    messgroesse: { de: 'Erfolg im geschlossenen Lauf statt Offline-Fehler; der Vorhersagehorizont.', en: 'Closed-loop success instead of offline error; the prediction horizon.' },
    grenze: { de: 'Weltmodelle halluzinieren Physik, der Fehler wächst mit dem Horizont, Objekte verschwinden.', en: 'World models hallucinate physics, the error grows with the horizon, objects vanish.' },
    frage: { de: 'Frage 9: Was ist das Ergebnis in einer zweiten Umgebung?', en: 'Question 9: What is the result in a second environment?' },
    folgefragen: [
      { de: 'Wurde geschlossen am Roboter gemessen, mit n und Intervall?', en: 'Was it measured closed-loop on the robot, with n and an interval?' },
      { de: 'Wie weit reicht die Vorhersage, und wie oft wird neu geplant?', en: 'How far does the prediction reach, and how often does it replan?' },
      { de: 'Kennt das Weltmodell deinen Roboter, deine Kameras, deine Teile?', en: 'Does the world model know your robot, your cameras, your parts?' },
    ],
    fuerDeinWerk: { de: 'Synthetische Daten nur mit Ablation und geschlossener Messung; Lizenz der Gewichte prüfen – nicht-kommerziell kommt vor.', en: 'Synthetic data only with an ablation and a closed-loop measurement; check the licence of the weights – non-commercial happens.' },
  },
};

// the lesson's invariants (the stand must never show the opposite)
const fail = [];
if (data.offlineWinner !== 'stillstand') fail.push(`offline winner ${data.offlineWinner} (want stillstand)`);
if (!installed || installed === 'stillstand' || installed === data.offlineWinnerReal) fail.push(`installed ${installed} must be neither Stillstand nor the offline winner (${data.offlineWinnerReal})`);
if (data.horizon.best !== 2) fail.push(`horizon hump peaks at ${data.horizon.best} s (want 2)`);
if (fail.length) {
  console.error('kurzlauf: ' + fail.join('; '));
  process.exit(1);
}

const json = JSON.stringify(data, null, 1) + '\n';
if (args.check) {
  const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  if (prev !== json) {
    console.error(`kurzlauf --check: ${path.relative(ROOT, OUT)} differs from the generator (re-run without --check)`);
    process.exit(1);
  }
  console.log(`OK   kurzlauf --check: ${path.relative(ROOT, OUT)} is current`);
  process.exit(0);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, json);
console.log(`wrote ${path.relative(ROOT, OUT)} (${json.length} bytes): offline winner ${data.offlineWinner}, Flugmodell ${installed} +${gain.pp} pp [${gain.lo}, ${gain.hi}] · n = ${gain.n}; horizon best ${data.horizon.best} s (${data.horizon.rows.map((r) => `${r.horizon} s ${r.k}/${r.n}`).join(', ')})`);
