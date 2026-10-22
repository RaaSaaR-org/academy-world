/**
 * WP12: the player text of the grounded start (plan §1.2, §3.2, §3.3, §4.1). German default and
 * English, „du“ in both modes. Lines quoted by the plan are verbatim; numbers only in the FIKTION
 * readouts. EMI lines ≤ 18 words and two sentences.
 */
import type { Lang, Text } from '@/core/zones';
import type { RotorId } from '@/core/zones/manifest';

type T = { de: string; en: string };

/** EMI-01 on the radio (the speaker label of every island line). */
export const RADIO_SPEAKER = (lang: Lang): string => (lang === 'de' ? 'EMI-01 › Funk' : 'EMI-01 › radio');

export const START = {
  // ── arrival (§1.2) ──
  dock: { de: 'Spürst du das? Die Haltearme fangen jede Böe ab. Komm zur Libelle.', en: 'Feel that? The holding arms catch every gust. Come to the spirit level.' },
  toLibelle: { de: 'Geh über die Brücke und die Allee hinauf zur Libelle.', en: 'Cross the bridge and walk up the avenue to the spirit level.' },
  greet: { de: 'Ich bin EMI-01. Zieh den Hebel – wir machen einen Probestart.', en: 'I’m EMI-01. Pull the lever: let’s try a test start.' },
  toLever: { de: 'Probestart an der Libelle. [E]', en: 'Test start at the spirit level. [E]' },

  // ── the lever (§3.2) ──
  lever: { de: 'Probestart', en: 'Test start' },
  leverWait: { de: 'Die Haltearme fangen die Insel …', en: 'The holding arms are catching the island …' },
  leverKiel: { de: 'Startfreigabe: KIEL', en: 'Launch clearance: KEEL' },
  leverAusguck: { de: 'Startfreigabe: AUSGUCK', en: 'Launch clearance: LOOKOUT' },
  leverAir: { de: 'Böe auslösen', en: 'Trigger a gust' },
  leverPlate: { de: 'PROBE\nSTART', en: 'TEST\nSTART' },
  leverSub: { de: 'DREI SYSTEME', en: 'THREE SYSTEMS' },
  readoutEyebrow: { de: 'FIKTION · Probestart', en: 'FICTION · test start' },
  airEyebrow: { de: 'FIKTION · Libelle', en: 'FICTION · spirit level' },
  readoutLive: { de: 'Die Haltearme fangen die Insel …', en: 'The holding arms are catching the island …' },
  airLive: { de: 'Die Regelung fängt die Insel …', en: 'The controller is catching the island …' },

  // EMI-01 after the first Probestart (≈ 32 s)
  first1: { de: 'Drei Systeme rot: Auftrieb, Energie, Navigation. Bring sie zum Leuchten.', en: 'Three systems red: lift, energy, navigation. Bring them to light.' },
  first2: { de: 'Auftrieb kommt aus den sechs Zonen. Strom und Flugmodell holen wir unten im Revier.', en: 'Lift comes from the six zones. Power and the flight model we fetch down in the Revier.' },
  first2Crew: { de: 'Die sechs Rotoren misst du selbst. Akku und Flugmodell stellt die Bodencrew.', en: 'You measure the six rotors yourself. The ground crew provides the battery and the flight model.' },
  first3: { de: 'Schau hoch: Der Turm zeigt es allen. Dann heben wir ab.', en: 'Look up: the tower shows it to everyone. Then we lift off.' },

  // later presses: the first thing missing
  missingLift: { de: 'Auftrieb fehlt noch:', en: 'Lift is still missing:' },
  missingAkku: { de: 'Kein Strom für den Start. Der Startakku ist leer.', en: 'No power for the start. The start battery is empty.' },
  missingAkkuPart: { de: 'Kein Strom für den Start. Der Startakku ist noch nicht voll.', en: 'No power for the start. The start battery is not full yet.' },
  missingNav: { de: 'Ohne Flugmodell fliegen wir blind in die Wolke.', en: 'Without a flight model we fly blind into the cloud.' },
  readyKiel: { de: 'Fehlt nur noch die Startprüfung im Kiel.', en: 'Only the launch check in the keel is missing.' },
  readyGo: { de: 'Komm zum Ausguck – wir starten.', en: 'Come to the lookout: we’re taking off.' },
  airAgain: { de: 'Nochmal? Die Regelung hat Zeit. Tausendmal pro Sekunde.', en: 'Again? The controller has time. A thousand times a second.' },

  // the Pass hand-over (rc4 W4, the „Startliste“)
  passGiven: { de: 'Dein Pass ist die Startliste. Achtzehn Stempel zeichnen den Turm.', en: 'Your pass is the launch list. Eighteen stamps draw the tower.' },
  route: {
    de: 'Die Werkleiter-Route: sechs ◆-Stationen und das Schaufenster, dann die Startprüfung. Etwa eine halbe Stunde.',
    en: 'The plant-manager route: six ◆ stations and the showroom window, then the launch check. About half an hour.',
  },

  // ── the Libelle (§4.1) ──
  libelleAsk: { de: 'Am Boden hält der Regelkern die Insel über die Haltearme. In der Luft über die Rotoren.', en: 'On the ground the control core holds the island through the holding arms. In the air through the rotors.' },
  libelleGround: { de: 'BODEN · HALTEARME · LAGE 0,00°', en: 'GROUND · HOLDING ARMS · ATTITUDE 0.00°' },
  libelleFiktion: { de: 'FIKTION · Der Regelkreis dahinter ist echt.', en: 'FICTION · The control loop behind it is real.' },

  // ── beats (§3.3) ──
  revierDe: { de: 'Das Tor zum Revier ist offen. Auf dem Sonnenacker laden wir den Startakku.', en: 'The gate to the Revier is open. At the Sun Field we charge the start battery.' },
  revierDeciders: { de: 'Das Tor zum Revier ist offen. Draußen wartet ein Acker.', en: 'The gate to the Revier is open. A field is waiting outside.' },
  kiel: { de: 'Die Kielstufe ist frei. Zeit für die Startprüfung.', en: 'The keel level is open. Time for the launch check.' },
  sixOfSix: { de: 'Sechs von sechs.', en: 'Six of six.' },
  sixAkku: { de: 'Auftrieb steht. Es fehlt noch der Startakku.', en: 'Lift is ready. The start battery is still missing.' },
  sixNav: { de: 'Auftrieb steht. Es fehlt noch das Flugmodell.', en: 'Lift is ready. The flight model is still missing.' },
  sixBoth: { de: 'Auftrieb steht. Es fehlen noch Startakku und Flugmodell.', en: 'Lift is ready. The start battery and the flight model are still missing.' },
  startklar: { de: 'Auftrieb, Energie, Navigation – alle drei bereit.', en: 'Lift, energy, navigation: all three ready.' },
  f3Missing: { de: 'Startfreigabe unterschrieben. Es fehlen noch', en: 'Launch clearance signed. Still missing:' },
  crewRotor: { de: 'hat die Bodencrew freigegeben. Ohne Kennlinie. Glaubst du ihr – oder misst du später?', en: 'was cleared by the ground crew. No curve. Do you trust it, or measure later?' },
  navLine: { de: 'Flugmodell an Bord. Geträumt, gemessen, gefiltert – erst dann geflogen.', en: 'Flight model aboard. Dreamt, measured, filtered: only then flown.' },
  toastAkku: { de: 'Startakku geladen · Sonnenacker', en: 'Start battery charged · Sun Field' },
  toastNav: { de: 'Flugmodell an Bord · Traumhangar', en: 'Flight model aboard · Dream Hangar' },
  toastCrew: { de: 'Bodencrew', en: 'ground crew' },
  toastReady: { de: 'bereit', en: 'ready' },
  eyebrowStart: { de: '// STARTKLAR', en: '// READY FOR TAKE-OFF' },
  akkuWord: { de: 'Startakku', en: 'start battery' },
  navWord: { de: 'Flugmodell', en: 'flight model' },

  // ── the Kanzel pads (§2.4, §2.6) ──
  padDark: { de: 'Das Revier öffnet mit dem ersten Rotor.', en: 'The Revier opens with the first rotor.' },
  padAir: { de: 'Kein Boden unter uns.', en: 'No ground below us.' },
  padToGround: { de: 'Revier', en: 'Revier' },
  padToKanzel: { de: 'Kanzel', en: 'Pulpit' },

  // ── plaques (§4.1, §2.8) ──
  balconyGround: { de: 'TROCKENDOCK 3 · TIEFE 66 m', en: 'DRY DOCK 3 · DEPTH 66 m' },
  balconyAir: { de: 'ABSTAND ZUR WOLKENDECKE 180 m', en: 'DISTANCE TO THE CLOUD DECK 180 m' },
  bridgePlaqueTitle: { de: 'DAS REVIER', en: 'THE REVIER' },
  bridgePlaque: { de: 'Früher wurde hier im Tagebau gegraben. Trockendock 3 liegt in der letzten Grube.', en: 'This land was once an open-cast mine. Dry Dock 3 sits in the last pit.' },
  fiktion: { de: 'FIKTION', en: 'FICTION' },
} satisfies Record<string, T>;

/** The rotor line on bereit (§3.2 table, EMI-01). */
export const ROTOR_LINE: Record<RotorId, T> = {
  M1: { de: 'M1 läuft. Die Insel weiß jetzt, wie schief sie steht – so genau wie ihr Sensor.', en: 'M1 is running. The island now knows how level it stands: as exactly as its sensor.' },
  M2: { de: 'M2 läuft. Messen, vergleichen, korrigieren: der Regelkreis aus deinem Garten.', en: 'M2 is running. Measure, compare, correct: the control loop from your garden.' },
  M3: { de: 'M3 läuft. Last nah am Körper tragen – das gilt für Arme und Inseln.', en: 'M3 is running. Carry the load close in: true for arms and islands.' },
  M4: { de: 'M4 läuft. Gelernt wird nur, was in den Daten steckt – merk dir das für später.', en: 'M4 is running. It only learns what is in the data: remember that for later.' },
  M5: { de: 'M5 läuft. Tausend Korrekturen pro Sekunde, rund um die Uhr: Arbeit für Maschinen.', en: 'M5 is running. A thousand corrections a second, around the clock: work for machines.' },
  M6: { de: 'M6 läuft. Freigegeben mit n, Regel und Intervall – nicht mit einem Etikett.', en: 'M6 is running. Released with n, a rule and an interval, not with a label.' },
};

/** Panel labels: the three groups and the six rotor verbs (SEHEN … MESSEN, the zones' verbs). */
export const PANEL = {
  lift: { de: 'AUFTRIEB', en: 'LIFT' },
  energy: { de: 'ENERGIE', en: 'ENERGY' },
  nav: { de: 'NAVIGATION', en: 'NAVIGATION' },
  akku: { de: 'STARTAKKU', en: 'START BATTERY' },
  model: { de: 'FLUGMODELL', en: 'FLIGHT MODEL' },
  crew: { de: 'BODENCREW', en: 'GROUND CREW' },
} satisfies Record<string, T>;

/** Join words with a comma and a final „und“ / „and“. */
export function listJoin(lang: Lang, words: readonly string[]): string {
  if (words.length <= 1) return words.join('');
  const and = lang === 'de' ? ' und ' : ' and ';
  return `${words.slice(0, -1).join(', ')}${and}${words[words.length - 1]}`;
}

/** A Text from a function of the language. */
export const txt = (f: (lang: Lang) => string): Text => (lang) => f(lang);
