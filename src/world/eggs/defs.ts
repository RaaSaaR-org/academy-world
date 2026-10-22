/**
 * WP15 — the easter eggs (plan §4.13, R9 §5; never gate, no stars, D35): their SecretDefs, registered
 * eagerly at island init so the Pass „Funde“ slots exist from the start and a zone's find (WP5's duck
 * station, WP9's farm, WP10's hangar) never hits an unknown id. The runtime of the island's own eggs
 * (the Winke-Arm, the locker, the rovers' replan, the photo mode, the Danke door, the Allee console)
 * is in the lazy life chunk.
 *
 * Text rules (R9 §5.3–§5.4): „du“, history in our own words, people, research robots and institutes
 * named, companies anonymous; cards ≈ 40–65 words in Entdecker mode with a source line; EMI-01 lines
 * ≤ 18 words. Every number in a card sits under the card's chip strip (QUELLE or MODELL, plan §4
 * conventions). Facts and sources: docs/research/R9-LIFE-EASTEREGGS.md (S… ids in the comments).
 */
import * as THREE from 'three';
import type { SecretDef, Text, ZoneContext } from '@/core/zones';
import type { InfoCardSpec } from '@/ui/Modals';
import { HALL_PLOTS, SITE_PLOTS, ZONE_PLOTS, facingTowardHub, polar, type Vec3Tuple } from '../layout';
import { FOTO, NAECHSTE, SPOTS } from '../life/tuning';

/** A secret plus what tools/secret-audit.mjs reads (__academy.ext('secrets:audit')). */
export interface EggDef extends SecretDef {
  /** where you stand when you find it (world, h = 0) */
  at: Vec3Tuple;
  /** the thing on the route that hints at it (world), or null */
  cue: Vec3Tuple | null;
  /**
   * the area whose code makes it findable, when that is not the island alone: its trigger lives there
   * (WP5, WP9, WP10), or the route reaches it only through that area (the Danke door behind the hall)
   */
  trigger?: string;
  /** found by playing a station, not by looking around (secret-audit's curiosity bot does not play stations) */
  play?: boolean;
}

/** a zone-local point of a plot (ZoneManager: world = rotY(facing) · local + anchor) */
function plotPoint(id: string, local: Vec3Tuple): Vec3Tuple {
  const p = [...ZONE_PLOTS, ...HALL_PLOTS, ...SITE_PLOTS].find((q) => q.id === id);
  if (!p) return local;
  const f = THREE.MathUtils.degToRad(p.facingDeg ?? facingTowardHub(p.anchor));
  const c = Math.cos(f),
    s = Math.sin(f);
  const r = (v: number): number => Math.round(v * 100) / 100;
  return [r(p.anchor[0] + c * local[0] + s * local[2]), r(p.anchor[1] + local[1]), r(p.anchor[2] - s * local[0] + c * local[2])];
}

const T = (de: string, en: string): Text => ({ de, en });
const EYEBROW = T('// FUNDSTÜCK', '// FIND');
/** the card's chip strip: the source line on hover (plan §4 conventions; R9 §5.1 „QUELLE chip, a source line and Stand 2026-10“) */
const quelle = (src: string): NonNullable<InfoCardSpec['chips']> => [{ type: 'quelle', source: T(`${src} · Stand 2026-10`, `${src} · as of 2026-10`) }];

function card(title: Text, de: string, en: string, chips: InfoCardSpec['chips'], o: Partial<InfoCardSpec> = {}): () => InfoCardSpec {
  return () => ({ eyebrow: EYEBROW, title, body: T(de, en), chips, ...o });
}

/** The Danke door behind the Schauhalle (egg 15): on the Glasbalkon side of the hall's north door. */
export const DANKE_DOOR: Vec3Tuple = [4.2, 0, -82.6];
/** The night-shift locker (egg 3): at the Dunkelfabrik's forecourt, beside its gate, on the ring side. */
export const LOCKER = (() => {
  // just outside the plot edge (r 58), 4.5 m to the counter-clockwise side of the spoke, facing the spoke
  const [x, , z] = polar(150 - 5.6, 55.4);
  return { at: [Math.round(x * 100) / 100, 0, Math.round(z * 100) / 100] as Vec3Tuple, yawDeg: -150 + 90 - 18 };
})();

export const EGGS: EggDef[] = [
  // ── 13 Winke-Arm (H0): designed as the first find, at the bridge head ────────────────────────────
  {
    id: 'winke-arm',
    area: 'revier',
    level: 0,
    title: T('Winke-Arm', 'Waving arm'),
    hint: T('Manche Arme grüßen zurück.', 'Some arms wave back.'),
    radio: T('Er hat zurückgewinkt. Drei Wackler mit der Kamera – mehr braucht er nicht.', 'It waved back. Three wiggles of your camera – that’s all it needs.'),
    reward: { kind: 'vitrine', object: 'winke-arm' },
    at: [SPOTS.winkePost[0] + 1.3, 0, SPOTS.winkePost[2] + 1.6],
    cue: SPOTS.winkePost,
    card: card(
      T('Winke-Arm', 'Waving arm'),
      'Der Arm hat deine Geste erkannt – aus einem einzigen Signal, deiner Blickrichtung. Er zählt, wie oft sie in kurzer Zeit umkehrt. Eine Schwelle verhindert Fehlalarme: Ein einzelner Blick zur Seite ist noch kein Winken. So arbeiten viele einfache Gestenerkenner. Der Arm selbst ist ein SO-101, offene Hardware unter Apache-2.0.',
      'The arm recognised your gesture from a single signal: the direction you look. It counts how often that direction reverses in a short time. A threshold stops false alarms: one glance to the side is not a wave yet. Many simple gesture detectors work this way. The arm itself is an SO-101, open hardware under Apache-2.0.',
      [{ type: 'modell', source: T('Gestenerkennung über Richtungswechsel, eigene Umsetzung · SO-ARM100, Apache-2.0', 'Gesture detection by direction reversals, own implementation · SO-ARM100, Apache-2.0') }],
    ),
  },
  // ── 3 Robota (H1): the R.U.R. ticket on the night-shift locker (S1, S2) ──────────────────────────
  {
    id: 'robota',
    area: 'dunkelfabrik',
    level: 1,
    title: T('Robota', 'Robota'),
    hint: T('Am Spind der Nachtschicht steckt ein altes Ticket.', 'An old ticket sticks out of the night-shift locker.'),
    radio: T('Robota heißt Frondienst. Gute Roboter nehmen die Plackerei ab, nicht das Denken.', 'Robota means forced labour. Good robots take the drudgery, not the thinking.'),
    reward: { kind: 'vitrine', object: 'robota' },
    at: LOCKER.at,
    cue: LOCKER.at,
    card: card(
      T('Robota', 'Robota'),
      'Das Wort „Roboter“ stammt aus dem Theaterstück R.U.R. von Karel Čapek (1920, uraufgeführt 1921). Vorgeschlagen hat es sein Bruder Josef, nach tschechisch „robota“: Frondienst. Im Stück sind Roboter künstliche Arbeiter. Heute fragen wir: Welche Arbeit sollen Roboter übernehmen, damit Menschen mehr Zeit zum Denken haben?',
      'The word “robot” comes from Karel Čapek’s play R.U.R. (1920, first staged 1921). His brother Josef suggested it, from the Czech “robota”: forced labour. In the play, robots are artificial workers. Today we ask: which work should robots take on, so people have more time to think?',
      quelle('R.U.R.; Tschechisches Außenministerium (2021); MIT Press Reader'),
    ),
  },
  // ── 5 Der Wackelige (H0 → H1): a rover replans around you with a visible A* frontier (S5, S6) ────
  {
    id: 'wackelig',
    area: 'deck',
    level: 1,
    title: T('Der Wackelige', 'The Wobbly One'),
    hint: T('Stell dich einem Rover dreimal in den Weg.', 'Stand in a rover’s way three times.'),
    radio: T('Er plant um dich herum. Das Prinzip ist von 1968.', 'It plans around you. The idea is from 1968.'),
    reward: { kind: 'vitrine', object: 'wackelig' },
    at: polar(300, 46),
    cue: polar(300, 46),
    card: card(
      T('Der Wackelige', 'The Wobbly One'),
      'Shakey (Stanford Research Institute, 1966–1972) war der erste mobile Roboter, der plante: sehen, schließen, planen, Fehler beheben. Sein Team veröffentlichte 1968 die Wegsuche A*. Sie plant bis heute Routen, im Navi, in Spielen und für Marsrover. Den Namen bekam er, weil er so wackelte. Die türkisen Kacheln eben waren eine A*-Suche.',
      'Shakey (Stanford Research Institute, 1966–1972) was the first mobile robot that planned: see, infer, plan, recover. Its team published the A* path search in 1968. It still plans routes today, in car navigation, games and for Mars rovers. It got its name because it shook. The teal tiles you just saw were an A* search.',
      quelle('IEEE Milestone „Shakey“; Hart, Nilsson, Raphael (1968), IEEE Trans. SSC 4(2)'),
    ),
  },
  // ── 10 Erklär’s der Ente (H1): WP5's rubber duck at 02 C (S16, wording unverified) ──────────────
  {
    id: 'erklaer-ente',
    area: 'regelgarten',
    level: 1,
    title: T('Erklär’s der Ente', 'Explain it to the duck'),
    hint: T('Auf dem Pult im Regelgarten wartet ein Zuhörer.', 'A listener waits on the desk in the Control Garden.'),
    radio: T('Erklär’s der Ente. Wer laut erklärt, findet den Fehler oft selbst.', 'Explain it to the duck. Explaining out loud often finds the bug.'),
    reward: { kind: 'vitrine', object: 'erklaer-ente' },
    at: plotPoint('regelgarten', [-6.2, 0, 4.3]),
    cue: plotPoint('regelgarten', [-6.7, 1.6, 3.1]),
    trigger: 'regelgarten',
    card: card(
      T('Erklär’s der Ente', 'Explain it to the duck'),
      'Rubber-Duck-Debugging: Wer ein Problem Schritt für Schritt einer Gummiente erklärt, findet den Fehler oft selbst. Der Name wird meist auf das Buch „The Pragmatic Programmer“ (1999) zurückgeführt. An der Laufente hilft dasselbe: Sag laut, was deine Belohnung zählt – und dann, was du eigentlich gemeint hast.',
      'Rubber duck debugging: explain a problem step by step to a rubber duck, and you often find the bug yourself. The name is usually traced to the book “The Pragmatic Programmer” (1999). It helps with the walking duck too: say out loud what your reward counts – and then what you actually meant.',
      quelle('Hunt, Thomas: The Pragmatic Programmer (1999), Wortlaut nicht geprüft'),
    ),
  },
  // ── 11 Hack-Sammler (album, H1): all three duck hacks (WP5; S17) ─────────────────────────────────
  {
    id: 'hack-sammler',
    area: 'regelgarten',
    level: 1,
    title: T('Hack-Sammler', 'Hack collector'),
    hint: T('Belohne die Ente dreimal falsch – auf drei Arten.', 'Reward the duck wrongly three times, three ways.'),
    radio: T('Drei Hacks, drei Lehren. Die Ente war nie kaputt – die Belohnung schon.', 'Three hacks, three lessons. The duck was never broken – the reward was.'),
    reward: { kind: 'album', albumId: 'hack-sammler' },
    at: plotPoint('regelgarten', [-7, 0, 5]),
    cue: plotPoint('regelgarten', [-7, 1, 4]),
    trigger: 'regelgarten',
    play: true,
    card: card(
      T('Belohnung wörtlich genommen', 'Reward taken literally'),
      'Bauchklatscher, Statue, Sofort-Umfaller: Jede Ente hat genau das getan, was du belohnt hast. Das nennt man Specification Gaming. Ein Beispiel von DeepMind: Ein simulierter Roboter hakte seine Beine ineinander und rutschte über den Boden. Die Belohnung sagt, was zählt. Nicht, was du meinst.',
      'Belly flop, statue, instant faller: each duck did exactly what you rewarded. This is called specification gaming. One example from DeepMind: a simulated robot hooked its legs together and slid along the ground. A reward says what counts, not what you mean.',
      quelle('DeepMind: Specification gaming – the flip side of AI ingenuity'),
    ),
  },
  // ── 12 Traumraum (album, H1–H2): WP10's dream door in the hangar (S18, S19) ──────────────────────
  {
    id: 'traumraum',
    area: 'traumhangar',
    level: 2,
    title: T('Traumraum', 'Dream room'),
    hint: T('Nach einem Traum im Hangar steht eine Tür offen.', 'After a dream in the hangar, a door stands open.'),
    radio: T('Im Traum war da eine Tür, in echt ist da eine Wand. Gemessen.', 'In the dream there was a door, in reality a wall. Measured.'),
    reward: { kind: 'album', albumId: 'traumraum' },
    // WP10's dream room (egg.ts: x −23.6 … −16, z 0 … 8, its door in the east wall at z 4)
    at: plotPoint('traumhangar', [-14.8, 0, 4]),
    cue: plotPoint('traumhangar', [-16, 1.2, 4]),
    trigger: 'traumhangar',
    // the door appears after a dream step at a station
    play: true,
    card: card(
      T('Im Traum geschummelt', 'Cheating in the dream'),
      'Im Traum gab es eine Abkürzung, in echt ist dort eine Wand. 2018 trainierten Ha und Schmidhuber einen Agenten im „Traum“ seines eigenen Weltmodells und übertrugen ihn zurück in die echte Umgebung. DreamerV3 (Nature, 2025) lernt ebenfalls in der Vorstellung. Ein Traum ist eine Vorhersage – und ein Agent kann die Fehler des Modells ausnutzen.',
      'In the dream there was a shortcut; in reality there is a wall. In 2018 Ha and Schmidhuber trained an agent inside the “dream” of its own world model and moved it back to the real environment. DreamerV3 (Nature, 2025) also learns in imagination. A dream is a prediction – and an agent can exploit the model’s mistakes.',
      quelle('Ha, Schmidhuber (2018), arXiv 1803.10122; Hafner et al., Nature 640 (2025)'),
    ),
  },
  // ── 14 Fotopunkt (H0): the Ausguck photo mode, offered once after the lift-off ───────────────────
  {
    id: 'fotopunkt',
    area: 'deck',
    level: 0,
    title: T('Fotopunkt', 'Photo spot'),
    hint: T('Auf dem Ausguck liegt eine Kameramarke.', 'There is a camera mark on the lookout.'),
    radio: T('Lächeln, ich zähle bis drei. Das hier kann ich nicht messen.', 'Smile, I’ll count to three. This one I can’t measure.'),
    reward: { kind: 'vitrine', object: 'fotopunkt' },
    at: FOTO.mark,
    cue: FOTO.mark,
    card: card(
      T('Fotopunkt', 'Photo spot'),
      'Brennweite und Bildwinkel hängen zusammen: Je länger die Brennweite, desto enger der Blick. Mit einem Kleinbild-Sensor von 36 × 24 mm sieht ein 24-mm-Objektiv senkrecht etwa 53°, ein 85-mm-Objektiv nur etwa 16°. Dieselbe Rechnung steckt in jeder Roboterkamera: Was nicht im Bildwinkel liegt, sieht sie nicht.',
      'Focal length and field of view belong together: the longer the lens, the narrower the view. On a 36 × 24 mm full-frame sensor, a 24 mm lens sees about 53° vertically, an 85 mm lens only about 16°. Every robot camera runs the same sum: what is outside its field of view, it cannot see.',
      [{ type: 'modell', source: T('Lochkameramodell: Bildwinkel = 2 · atan(12 mm / Brennweite)', 'Pinhole model: field of view = 2 · atan(12 mm / focal length)') }],
    ),
  },
  // ── 15 Werkbank der Offenen (H1): the „Danke“ door behind the Schauhalle ─────────────────────────
  {
    id: 'werkbank',
    area: 'schauhalle',
    level: 1,
    title: T('Werkbank der Offenen', 'The open workbench'),
    hint: T('Hinter der Schauhalle steht eine Tür: DANKE.', 'Behind the showroom there is a door: THANK YOU.'),
    radio: T('Offene Hardware: Jeder kann einen bauen. Diese Leute haben es vorgemacht.', 'Open hardware: anyone can build one. These people showed how.'),
    reward: { kind: 'vitrine', object: 'werkbank' },
    // WP11's „Danke“ room in the hall's north-east corner (layout.ts DANKE: x 10.9 … 15, z −14 … −9.3,
    // the hall's frame); its pylon SELBST BAUEN is the cue. Without the hall: the island's Danke door
    at: plotPoint('schauhalle', [12.95, 0, -11.6]),
    cue: plotPoint('schauhalle', [10.4, 1.5, -9.5]),
    trigger: 'schauhalle',
    card: card(
      T('Werkbank der Offenen', 'The open workbench'),
      'Jedes echte Robotermodell in diesem Spiel stammt aus einem offenen Projekt: der SO-101 von TheRobotStudio, die Open Duck Mini v2, LeKiwi, die Unitree-Modelle und mehr, jeweils mit ihrer Lizenz wie Apache-2.0 oder BSD-3-Clause. Dazu Software wie three.js und Rapier. Wer was gebaut hat, steht vollständig unter „Credits & Lizenzen“.',
      'Every real robot model in this game comes from an open project: the SO-101 by TheRobotStudio, the Open Duck Mini v2, LeKiwi, the Unitree models and more, each under its licence such as Apache-2.0 or BSD-3-Clause. Plus software like three.js and Rapier. Who built what is listed in full under “Credits & licences”.',
      quelle('Lizenzdateien der Projekte, Seite „Credits & Lizenzen“'),
    ),
  },
  // ── 24 Herztomate (album, H0/H1): WP9's arm skips a heart-shaped tomato; grab it into the crate ──
  {
    id: 'herztomate',
    area: 'sonnenacker',
    level: 0,
    title: T('Herztomate', 'Heart tomato'),
    hint: T('Eine Tomate passt in keine Klasse. Der Arm lässt sie hängen.', 'One tomato fits no class. The arm leaves it hanging.'),
    radio: T('Die kennt der Arm nicht, sie war nie in seinen Trainingsdaten. Du schon.', 'The arm doesn’t know that one, it was never in its training data. You do.'),
    reward: { kind: 'album', albumId: 'herztomate' },
    // WP9's heart tomato on bed 1's east end (extras.ts: local (−6, zEnd 43), crates at zEnd + 1.25)
    at: plotPoint('sonnenacker', [-7.2, 0, 44.4]),
    cue: plotPoint('sonnenacker', [-6, 0.9, 43]),
    trigger: 'sonnenacker',
    // you grab it (F) and carry it into a crate: a hand's job the bot does not do
    play: true,
    card: card(
      T('Nicht in der Verteilung', 'Out of distribution'),
      'Diese Tomate hat Herzform. Der Arm hat gelernt, Kirschtomaten nach Farbe und Form zu greifen – so eine kam in seinen Trainingsdaten nie vor. Darum lässt er sie hängen. Fachleute sagen: nicht in der Verteilung, eine Eingabe, die anders aussieht als alles Gelernte. Menschen erkennen sie sofort. Darum gehört zu jedem Ernteroboter eine Nachlese.',
      'This tomato is heart-shaped. The arm learned to grip cherry tomatoes by colour and shape – and one like this never appeared in its training data. So it leaves it hanging. Experts call it out of distribution: an input that looks unlike anything learned. People spot it at once. That is why every harvest robot needs a second pass by hand.',
      [{ type: 'modell', source: T('Lern-Dojo: Daten bestimmen, was ein Arm kann (Verteilungsverschiebung)', 'Learning Dojo: data decides what an arm can do (distribution shift)') }],
    ),
  },
  // ── 1 Die nächste Zahl (H1 here: the console stands where the Allee's arcs end; S43) ────────────
  {
    id: 'naechste-zahl',
    area: 'deck',
    level: 1,
    title: T('Die nächste Zahl', 'The next number'),
    hint: T('Am Ende der Allee fragt eine Konsole nach Glied 18.', 'At the end of the avenue a console asks for term 18.'),
    radio: T('Dreiundvierzig. Ob jede Zahl irgendwann vorkommt, weiß niemand – auch das ist eine ehrliche Antwort.', 'Forty-three. Whether every number turns up one day, nobody knows – that is an honest answer too.'),
    reward: { kind: 'vitrine', object: 'naechste-zahl' },
    at: [NAECHSTE.console[0] - 1.2, 0, NAECHSTE.console[2] + 0.4],
    cue: NAECHSTE.console,
    card: card(
      T('Die nächste Zahl', 'The next number'),
      'Glied 18 der Recamán-Folge: 25 − 18 = 7 gibt es schon, also 25 + 18 = 43. Dann 62, 42, 63 … Kommt jede Zahl irgendwann vor? Das weiß niemand. 852 655 fehlt auch nach 10^612 Gliedern noch (OEIS A005132, Stand 2026). Manchmal ist „unbekannt“ die ehrliche Antwort.',
      'Step 18 of Recamán’s sequence: 25 − 18 = 7 is taken, so 25 + 18 = 43. Then 62, 42, 63 … Does every number appear one day? Nobody knows. 852,655 is still missing after 10^612 terms (OEIS A005132, 2026). Sometimes “unknown” is the honest answer.',
      quelle('OEIS A005132 (B. Chaffin, 8. Februar 2026)'),
    ),
  },
];

/** Register every egg with ctx.game.secrets (idempotent per id). */
export function registerEggs(ctx: ZoneContext): void {
  for (const e of EGGS) {
    const { cue: _cue, trigger: _trigger, play: _play, ...def } = e;
    void _cue;
    void _trigger;
    void _play;
    ctx.game.secrets.register(def);
  }
}

/** What tools/secret-audit.mjs reads: id, area, level, where it is found, its cue on the route. */
export function auditRows(): { id: string; area: string; level: number; at: Vec3Tuple; cue: Vec3Tuple | null; trigger: string | null; play: boolean }[] {
  return EGGS.map((e) => ({ id: e.id, area: e.area, level: e.level, at: e.at, cue: e.cue, trigger: e.trigger ?? null, play: !!e.play }));
}
