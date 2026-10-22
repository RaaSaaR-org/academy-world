import type { Text } from '@/core/zones';

/**
 * Finale strings (GDD §6.6, §8.6; Phase 7 plan §4.14: the „Startprüfung“ / “Flight check”, D24). German
 * first, English for every line. Both modes say "du" (DECISIONS D1); `{ entdecker, entscheider }` only
 * where the content differs. EMI lines stay ≤ 18 words. The lift-off's lines: liftoff/strings.ts.
 */

export const SPEAKER = 'EMI-01 ›';

export const S = {
  // ── lift ──────────────────────────────────────────────────────────────────
  // (the KIEL beat at 4/6 rotors is the island's: src/world/start/beats.ts)
  bannerEyebrow: { de: '// FINALE · STARTPRÜFUNG', en: '// FINALE · FLIGHT CHECK' },
  bannerTitle: { de: 'Kielraum', en: 'Keel Room' },
  arrive: [
    { de: 'Hier unten sitzt der Regelkern. Er hält die Insel – bald in der Luft.', en: 'The control core sits down here. It holds the island, soon in the air.' },
    {
      de: {
        entdecker: 'Ein Anbieter sagt, sein gelernter Regler kann das besser. „99 % stabil.“ Prüfen wir das.',
        entscheider: 'Ein Anbieter verspricht „99 % stabil“. Du entscheidest heute, ob sein Regler fliegen darf.',
      },
      en: {
        entdecker: 'A vendor says its learned controller does it better. “99 % stable.” Let’s check that.',
        entscheider: 'A vendor promises “99 % stable”. Today you decide whether its controller may fly.',
      },
    },
    { de: 'Zuerst du. Am Leitstand hältst du die Insel im Schwebetest von Hand.', en: 'You first. At the control desk you hold the island by hand in the hover test.' },
  ] as Text[],
  arriveAgain: { de: 'Willkommen zurück im Kiel. Der Regelkern läuft.', en: 'Welcome back to the keel. The control core is running.' },

  // ── objectives ────────────────────────────────────────────────────────────
  objF1: { de: 'Startprüfung 1/3: Schwebetest – halte die Insel am Leitstand von Hand.', en: 'Flight check 1/3: hover test – hold the island by hand at the control desk.' },
  objF2: { de: 'Startprüfung 2/3: Prüf das Angebot „NN-Lage v2“ am Prüfstand.', en: 'Flight check 2/3: test the “NN-Lage v2” offer at the test rig.' },
  objF3: { de: 'Startprüfung 3/3: Schreib deine Empfehlung am Pult.', en: 'Flight check 3/3: write your recommendation at the lectern.' },
  objLift: { de: 'Startprüfung bestanden: Fahr zum Ausguck und heb ab.', en: 'Flight check passed: ride up to the lookout and lift off.' },
  objLiftMissing: { de: 'Startfreigabe unterschrieben. Jetzt fehlen nur noch Systeme.', en: 'Clearance signed. Only systems are missing now.' },
  objDone: { de: 'Erstflug geschafft. Die Insel gehört dir – schau dich um.', en: 'First flight done. The island is yours: look around.' },

  // ── room labels ───────────────────────────────────────────────────────────
  leitstand: { de: 'Leitstand: Schwebetest (15 s)', en: 'Control desk: hover test (15 s)' },
  leitstandAgain: { de: 'Leitstand: noch einmal versuchen', en: 'Control desk: try again' },
  vendor: { de: 'Angebot prüfen: 200 Versuche je Regler', en: 'Audit the offer: 200 trials per controller' },
  vendorLocked: { de: 'Erst der Leitstand', en: 'Control desk first' },
  results: { de: 'Messung ansehen', en: 'View the measurement' },
  lectern: { de: 'Empfehlung schreiben', en: 'Write the recommendation' },
  lecternLocked: { de: 'Erst messen, dann empfehlen', en: 'Measure first, then recommend' },
  lecternAgain: { de: 'Empfehlung ansehen oder ändern', en: 'View or change the recommendation' },
  certificate: { de: 'Zertifikat ansehen', en: 'View certificate' },
  liftCall: { de: 'Lift rufen', en: 'Call lift' },

  // ── F1 Schwebetest (Phase 7 plan §4.14: the island hovers 10 m over its keel block) ──
  f1Title: { de: '// F1 · SCHWEBETEST', en: '// F1 · HOVER TEST' },
  f1Intro: { de: 'Die Haltearme geben frei. Zehn Meter über dem Kielblock hältst du sie waagrecht.', en: 'The arms let go. Ten metres above the keel block you keep it level.' },
  f1Rise: { de: 'HALTEARME FREI · SCHWEBEN', en: 'ARMS RELEASED · HOVERING' },
  f1Hover: { de: 'Schweben', en: 'Hover' },
  f1Down: { de: 'AUFSETZEN', en: 'SETTING DOWN' },
  f1Horizon: { de: 'Künstlicher Horizont', en: 'Artificial horizon' },
  f1How: {
    de: 'Zeig mit der Maus dorthin, wo die Kugel hinrollt: Dort gibst du Schub und hebst die Seite an. Die Mitte heißt: kein Schub.',
    en: 'Point the mouse where the ball rolls: that’s where you add thrust and lift that side. The centre means: no thrust.',
  },
  f1Lag: { de: 'Dein Schub kommt 150\u00a0ms später an. Ziel: |θ|\u00a0<\u00a03°.', en: 'Your thrust arrives 150\u00a0ms late. Goal: |θ|\u00a0<\u00a03°.' },
  f1Start: { de: 'Start', en: 'Start' },
  f1Count: { de: 'Hand am Steuer in', en: 'Hands on in' },
  f1Live: { de: 'DU STEUERST', en: 'YOU’RE FLYING' },
  f1Takeover: { de: 'REGLER ÜBERNIMMT', en: 'CONTROLLER TAKES OVER' },
  f1Done: { de: 'ERGEBNIS', en: 'RESULT' },
  f1You: { de: 'Du', en: 'You' },
  f1Ctrl: { de: 'Regler', en: 'Controller' },
  f1Max: { de: 'max. Lage', en: 'max. tilt' },
  f1Over: { de: 'Zeit über 3°', en: 'Time over 3°' },
  f1Level: { de: 'waagrecht nach', en: 'level after' },
  f1Again: { de: 'Nochmal', en: 'Again' },
  // F1 as a challenge (stars rate your hand, never a controller)
  f1ChTitle: { de: 'Schwebetest: halte die Insel 15 Sekunden', en: 'Hover test: hold the island for 15 seconds' },
  f1G1: { de: 'Durchhalten', en: 'Hold on' },
  f1G2: { de: '≤ 5 s über 3°', en: '≤ 5 s over 3°' },
  f1G3: { de: 'Nie über 3°', en: 'Never over 3°' },
  f1Lesson: { de: '150 ms Verzögerung – und schon schwingt alles.', en: '150 ms of delay – and everything swings.' },
  f1Skip: { de: 'Überspringen', en: 'Skip' },
  f1Skipped: { de: 'übersprungen', en: 'skipped' },
  f1Next: { de: 'Weiter', en: 'Continue' },
  f1Emi: {
    de: 'Hundertfünfzig Millisekunden Verzögerung, und schon schwingt alles. Der Regler ist tausendmal pro Sekunde wach.',
    en: 'A hundred and fifty milliseconds of delay, and everything swings. The controller is awake a thousand times a second.',
  },
  f1EmiGood: { de: 'Respekt, du hast sie gehalten. Jetzt stell dir vierundzwanzig Stunden davon vor.', en: 'Respect, you held it. Now imagine twenty-four hours of that.' },
  f1EmiDecider: {
    de: 'Genau diese Arbeit automatisiert man: schnell, monoton, rund um die Uhr. Bleibt die Frage, welcher Regler.',
    en: 'This is exactly the work you automate: fast, monotonous, around the clock. The question is which controller.',
  },
  f1EmiNext: { de: 'Nächster Halt: der Prüfstand. Dort wartet das Angebot.', en: 'Next stop: the test rig. The offer is waiting there.' },

  // ── F2 Das Angebot ────────────────────────────────────────────────────────
  f2Title: { de: '// F2 · DAS ANGEBOT', en: '// F2 · THE OFFER' },
  vendorName: 'NN-LAGE v2',
  vendorClaim: { de: '99 % stabil', en: '99 % stable' },
  vendorFoot: { de: 'Herstellerangabe · Hersteller X', en: 'Vendor claim · Vendor X' },
  vendorSheet: [
    { de: 'Lernender Lageregler, trainiert auf 10.000 Flugstunden.', en: 'Learning attitude controller, trained on 10,000 flight hours.' },
    { de: 'Reagiert schneller als jeder klassische Regler.', en: 'Reacts faster than any classic controller.' },
    { de: '99 % stabil.*', en: '99 % stable.*' },
  ] as Text[],
  vendorStar: { de: '* Herstellerangabe. Bedingungen, n und Intervall: nicht angegeben.', en: '* Vendor claim. Conditions, n and interval: not stated.' },
  protocolTitle: { de: 'Unser Prüfprotokoll', en: 'Our test protocol' },
  protocolHint: { de: 'Jede Zeile beantwortet eine der neun Fragen aus deinem Pass.', en: 'Each line answers one of the nine questions from your pass.' },
  protocolHave: { de: 'aus deinem Pass', en: 'from your pass' },
  protocol: [
    { de: 'Erfolg heißt: |θ| < 3° über die ganzen 20 s.', en: 'Success means: |θ| < 3° for the full 20 s.' },
    { de: '200 Versuche je Regler: 67 ruhig, 67 böig, 66 Sturm.', en: '200 trials per controller: 67 calm, 67 gusty, 66 storm.' },
    { de: 'Feste Startwerte: Jeder Versuch lässt sich wiederholen.', en: 'Fixed seeds: every trial can be repeated.' },
    { de: 'Deine Erwartung wird vorher notiert.', en: 'Your expectation is written down first.' },
    { de: 'Drei Wetterlagen statt einer: ruhig, böig, Sturm.', en: 'Three weather conditions instead of one: calm, gusty, storm.' },
    { de: 'Lizenz der Gewichte: nicht angegeben – nachfragen.', en: 'Licence of the weights: not stated – ask.' },
    { de: 'Ein Lauf endet nach 20 s oder bei 3°. Nicht früher.', en: 'A run ends after 20 s or at 3°. Not earlier.' },
    { de: 'Training: nur ruhige Tage. Betrieb: jedes Wetter.', en: 'Training: calm days only. Operation: any weather.' },
    { de: 'Zweite Umgebung: Böen und Sturm statt Werkshalle.', en: 'Second environment: gusts and storm instead of the factory hall.' },
  ] as Text[],
  protocolGo: { de: 'Erst tippen, dann messen', en: 'Predict first, then measure' },
  f2DeciderBox: {
    de: 'So liest du jedes Datenblatt: Unter welcher Bedingung? Wie viele Versuche? Welches Intervall?',
    en: 'This is how you read any datasheet: under which condition? How many trials? Which interval?',
  },
  predictQ: { de: 'Wie viel % der Sturm-Versuche hält NN-Lage v2?', en: 'What % of the storm trials does NN-Lage v2 hold?' },
  f2RunTitle: { de: '// F2 · PRÜFLAUF', en: '// F2 · TEST RUN' },
  f2Trial: { de: 'Versuch', en: 'Trial' },
  f2Speed: { de: 'Zeitraffer', en: 'Time-lapse' },
  f2EmiStart: { de: 'Beide Regler bekommen dieselben Böen. Fair ist nur, was gleich gemessen wird.', en: 'Both controllers get the same gusts. Only what’s measured the same way is fair.' },
  f2EmiStorm: { de: 'Jetzt kommt der Sturm. Schau auf den Balken rechts.', en: 'Here comes the storm. Watch the bar on the right.' },
  f2Emi: (nnStorm: number): Text => ({
    de: `99 % stimmt – bei ruhigem Wetter. Bei Sturm hält NN-Lage v2 ${nnStorm} %.`,
    en: `99 % is true, in calm weather. In a storm NN-Lage v2 holds ${nnStorm} %.`,
  }),
  f2EmiNext: { de: 'Schau dir die Sturm-Kurve an. Dann schreib deine Empfehlung am Pult.', en: 'Look at the storm curve. Then write your recommendation at the lectern.' },
  resTitle: { de: 'Kennlinie: 2 Regler × 3 Wetterlagen', en: 'Curve: 2 controllers × 3 conditions' },
  resKey: { de: 'NN-Lage v2 bei Sturm', en: 'NN-Lage v2 in a storm' },
  resYourTip: { de: 'Dein Tipp', en: 'Your prediction' },
  resMeasured: { de: 'gemessen', en: 'measured' },
  resCurves: { de: 'Kurven: Lage |θ| über 20 s, jede Linie ein Versuch', en: 'Curves: tilt |θ| over 20 s, one line per trial' },
  resClaim: { de: 'Herstellerangabe 99 %', en: 'Vendor claim 99 %' },
  resHint: { de: 'Ein Balken ist ein Etikett. Erst die Kurven zeigen, wie ein Regler scheitert.', en: 'A bar is a label. Only the curves show how a controller fails.' },
  resFiction: { de: 'Spielzeugmodell: θ″ = λ²θ + (u(t − 0,15 s) + d(t))/I, λ = 0,8 s⁻¹, 200 Hz. NN-Lage v2 und Hersteller X sind Fiktion.', en: 'Toy model: θ″ = λ²θ + (u(t − 0.15 s) + d(t))/I, λ = 0.8 s⁻¹, 200 Hz. NN-Lage v2 and Vendor X are fiction.' },
  close: { de: 'Schließen', en: 'Close' },

  // ── F3 Empfehlung ─────────────────────────────────────────────────────────
  f3Title: { de: '// F3 · EMPFEHLUNG', en: '// F3 · RECOMMENDATION' },
  f3Head: { de: 'Empfehlung an die Inselleitung', en: 'Recommendation to the island board' },
  f3Rec: { de: 'Empfehlung', en: 'Recommendation' },
  f3Why: { de: 'Grund', en: 'Reason' },
  f3Alt: { de: 'Alternativ', en: 'Alternatively' },
  f3Pilot: { de: 'Pilot', en: 'Pilot' },
  f3PilotCond: { de: 'Pilot mit Auflage', en: 'Pilot with conditions' },
  f3NoPilot: { de: 'kein Pilot', en: 'no pilot' },
  f3NeedNumber: { de: 'Der Grund braucht mindestens eine Zahl-Kachel.', en: 'The reason needs at least one number tile.' },
  f3NeedChoice: { de: 'Wähl eine Empfehlung.', en: 'Choose a recommendation.' },
  f3Sign: { de: 'Unterschreiben', en: 'Sign' },
  f3AnyAccepted: { de: 'Jede Empfehlung zählt – wenn sie eine Zahl nennt.', en: 'Every recommendation counts, as long as it cites a number.' },
  f3Decider: {
    de: 'Belastbar ist eine Empfehlung mit Entscheidung, Zahl mit Bedingung und n, und einem Plan B.',
    en: 'A solid recommendation has a decision, a number with condition and n, and a plan B.',
  },
  f3NotSeen: { de: 'Hast du dir die Sturm-Kurve angesehen?', en: 'Have you looked at the storm curve?' },
  f3ShowCurve: { de: 'Kurve ansehen', en: 'View the curve' },
  f3SignAnyway: { de: 'Trotzdem unterschreiben', en: 'Sign anyway' },
  f3Soft: { de: 'Weicher Hinweis: Du darfst trotzdem unterschreiben.', en: 'Soft hint: you may still sign.' },
  tileNNStorm: (r: string): Text => ({ de: `NN-Lage v2 hält ${r} bei Sturm`, en: `NN-Lage v2 holds ${r} in a storm` }),
  tileBStorm: (r: string): Text => ({ de: `Bestand hält ${r} bei Sturm`, en: `The current controller holds ${r} in a storm` }),
  tileNNCalm: (r: string): Text => ({ de: `NN-Lage v2 hält ${r} bei ruhigem Wetter`, en: `NN-Lage v2 holds ${r} in calm weather` }),
  tileNNGust: (r: string): Text => ({ de: `NN-Lage v2 hält ${r} bei Böen`, en: `NN-Lage v2 holds ${r} in gusts` }),
  tile99: { de: '99 % gelten nur bei ruhigem Wetter', en: 'The 99 % only holds in calm weather' },
  tileDemo: { de: 'Die Vorführung sah stabil aus', en: 'The demo looked stable' },
  tileBrand: { de: 'Der Hersteller ist bekannt', en: 'The vendor is well known' },
  altKeep: { de: 'Bestand behalten', en: 'Keep the current controller' },
  altMrc: { de: 'NN nur bei ruhigem Wetter, sonst automatisch zurück auf Bestand', en: 'NN in calm weather only, otherwise automatic fallback to the current controller' },
  altMeasure: { de: 'Weiter messen: Sturmdaten nachtrainieren', en: 'Keep measuring: retrain on storm data' },
  emiPilot: (nnStorm: number): Text => ({
    de: `Mutig. Bei Sturm hält er ${nnStorm} %. Ich hoffe, es gibt eine Rückfallebene.`,
    en: `Brave. In a storm it holds ${nnStorm} %. I hope there’s a fallback.`,
  }),
  emiPilotCond: { de: 'Vernünftig: NN bei ruhigem Wetter, Bestand bei Böen. Und weiter messen.', en: 'Sensible: NN in calm weather, the current controller in gusts. And keep measuring.' },
  emiNoPilot: { de: 'Kein Pilot. Gutes Ergebnis – jetzt wissen wir es.', en: 'No pilot. Good result: now we know.' },
  emiNoPilot2: { de: 'Kein Pilot ist auch ein Ergebnis.', en: '“No pilot” is a result too.' },
  emiUp: { de: 'Komm, fahren wir hoch. Vom Ausguck aus heben wir ab.', en: 'Come, let’s ride up. We lift off from the lookout.' },
  emiNotReady: { de: 'Unterschrieben. Abheben können wir, sobald alle drei Systeme bereit sind.', en: 'Signed. We can lift off as soon as all three systems are ready.' },

  // ── ending (after the lift-off, at dusk) ──────────────────────────────────
  endLine: { de: 'Seit dem Abheben regelt die Insel tausendmal pro Sekunde nach. Du hast einmal entschieden – mit Zahlen.', en: 'Since the lift-off the island has corrected itself a thousand times a second. You decided once, with numbers.' },
  endLine2: {
    de: {
      entdecker: 'Roboter übernehmen die harte Arbeit. Das Denken – messen, zweifeln, entscheiden – bleibt bei dir.',
      entscheider: 'Roboter übernehmen die harte Arbeit, Menschen das Denken. Heute hast du gezeigt, wie das geht.',
    },
    en: {
      entdecker: 'Robots take the hard work. The thinking – measuring, doubting, deciding – stays with you.',
      entscheider: 'Robots take the hard work, people do the thinking. Today you showed how that works.',
    },
  },
  endBannerEyebrow: { de: '// STARTPRÜFUNG · ERSTFLUG', en: '// FLIGHT CHECK · FIRST FLIGHT' },
  endBannerTitle: { de: 'Messung statt Marketing.', en: 'Measurement, not marketing.' },

  // ── certificate ───────────────────────────────────────────────────────────
  certEyebrow: { de: '// ZERTIFIKAT', en: '// CERTIFICATE' },
  certTitle: { de: 'Startprüfung Insel 17', en: 'Flight check, Island 17' },
  certName: { de: 'Dein Name (optional, bleibt auf diesem Gerät)', en: 'Your name (optional, stays on this device)' },
  certNamePh: { de: 'Name', en: 'Name' },
  certSave: { de: 'Zertifikat speichern (PNG)', en: 'Save certificate (PNG)' },
  certChecklist: { de: 'Checkliste speichern (PNG)', en: 'Save checklist (PNG)' },
  certCopy: { de: 'Checkliste kopieren', en: 'Copy checklist' },
  certCopied: { de: 'Kopiert', en: 'Copied' },
  certAcademy: { de: 'Weiterlernen: academy.emai.dev', en: 'Keep learning: academy.emai.dev' },
  certFiction: { de: 'Schwebewerk, Insel 17, Hersteller X und NN-Lage v2 sind Fiktion. Der Regelkreis dahinter ist echt.', en: 'The Floating Works, Island 17, Vendor X and NN-Lage v2 are fiction. The control loop behind them is real.' },
  certPrognose: { de: 'Prognose-Güte', en: 'Prediction accuracy' },
  certTrials: { de: 'Versuche gemessen', en: 'Trials measured' },
  certVerdict: { de: 'Deine Empfehlung', en: 'Your recommendation' },
  certStamps: { de: 'Deine Messwerte', en: 'Your measurements' },
  certOpen: { de: 'offen', en: 'open' },
  certSkipped: { de: 'übersprungen', en: 'skipped' },
  certMode: { de: { entdecker: 'Entdecker', entscheider: 'Entscheider' }, en: { entdecker: 'Explorer', entscheider: 'Decision maker' } },
  certF1: { de: 'Schwebetest', en: 'Hover test' },
  // Phase 7 (plan §4.14, §2.8): the first flight, the three systems, the back side
  certFirstFlight: { de: 'Erstflug', en: 'First flight' },
  certRotors: (n: number): Text => ({ de: `${n}/6 Rotoren selbst gemessen`, en: `${n}/6 rotors measured by you` }),
  certAkkuSelf: { de: 'Startakku: selbst geladen', en: 'Start battery: charged by you' },
  certAkkuCrew: { de: 'Startakku: von der Bodencrew', en: 'Start battery: by the ground crew' },
  certNavSelf: { de: 'Flugmodell: selbst geprüft', en: 'Flight model: checked by you' },
  certNavCrew: { de: 'Flugmodell: von der Bodencrew', en: 'Flight model: by the ground crew' },
  certAkkuOpen: { de: 'Startakku: offen', en: 'Start battery: open' },
  certNavOpen: { de: 'Flugmodell: offen', en: 'Flight model: open' },
  certBackEyebrow: { de: '// ZERTIFIKAT · RÜCKSEITE', en: '// CERTIFICATE · BACK' },
  certH2: { de: 'H2-Meisterprüfung bestanden', en: 'H2 master test passed' },
  certFront: { de: 'Vorderseite', en: 'Front' },
  certBack: { de: 'Rückseite', en: 'Back' },
  certBackTitle: { de: 'Was du unten gesehen hast', en: 'What you saw down there' },
  certBackNone: { de: 'Das Revier wartet noch auf dich: Im Dock geht es weiter.', en: 'The Revier is still waiting for you: carry on in the dock.' },
  certBackClose: { de: 'Vollautomatisch heißt nicht menschenleer.', en: 'Fully automated does not mean empty of people.' },
  certSaveBack: { de: 'Rückseite speichern (PNG)', en: 'Save back side (PNG)' },
  certLog: { de: 'Erstflug-Protokoll', en: 'First-flight log' },
  certPayoff: { de: 'Wo Automatisierung sich lohnt (PNG)', en: 'Where automation pays (PNG)' },
  certF2: { de: 'NN-Lage v2 · Sturm', en: 'NN-Lage v2 · storm' },
  checkTitle: { de: 'Neun Fragen an jeden Anbieter', en: 'Nine questions for every vendor' },
  checkFindings: { de: 'Deine Befunde', en: 'Your findings' },
  checkHave: { de: 'im Pass', en: 'in pass' },
  claim: { de: 'Messung statt Marketing.', en: 'Measurement, not marketing.' },

  // ── conditions / controllers ──────────────────────────────────────────────
  cond: {
    ruhig: { de: 'ruhig', en: 'calm' },
    boeig: { de: 'böig', en: 'gusty' },
    sturm: { de: 'Sturm', en: 'storm' },
  } as Record<'ruhig' | 'boeig' | 'sturm', Text>,
  ctrl: {
    nn: { de: 'NN-Lage v2', en: 'NN-Lage v2' },
    bestand: { de: 'Bestand (PID)', en: 'Current (PID)' },
  } as Record<'nn' | 'bestand', Text>,
};

/** The nine vendor questions (GDD Appendix C), for the protocol and the checklist. */
export const QUESTIONS: { de: string; en: string }[] = [
  { de: 'Wie ist Erfolg als Regel definiert?', en: 'How is success defined, as a rule?' },
  { de: 'Wie viele Versuche?', en: 'How many trials?' },
  { de: 'Lässt sich der beste Lauf wiederholen?', en: 'Can the best run be repeated?' },
  { de: 'Was wurde vorher erwartet?', en: 'What was expected beforehand?' },
  { de: 'Wie viele Objektlagen?', en: 'How many object poses?' },
  { de: 'Welche Lizenz haben die Gewichte?', en: 'What is the licence of the weights?' },
  { de: 'Wann endet ein Lauf?', en: 'When does a run end?' },
  { de: 'Gleiche Eingaben im Betrieb wie im Training?', en: 'Same inputs in operation as in training?' },
  { de: 'Was ist das Ergebnis in einer zweiten Umgebung?', en: 'What is the result in a second environment?' },
];

/** The six lessons as they show up in the island's own control loop (thrusters M1–M6). */
export interface Lesson {
  zone: string;
  m: string;
  eyebrow: Text;
  title: Text;
  face: Text;
  body: Text;
  decider: Text;
}

export const LESSONS: Lesson[] = [
  {
    zone: 'sensordom',
    m: 'M1',
    eyebrow: { de: '// M1 · 01 SEHEN', en: '// M1 · 01 SEE' },
    title: { de: 'Die Insel misst ihre Lage', en: 'The island measures its attitude' },
    face: { de: 'In der Kugel sitzt eine IMU. Aus ihren Werten wird die Lage geschätzt – mit Rauschen.', en: 'Inside the sphere sits an IMU. The attitude is estimated from its readings, with noise.' },
    body: {
      de: 'In der Kugel des Regelkerns sitzt eine **IMU**: Beschleunigungs- und Drehratensensoren. Aus ihren Werten schätzt der Regler tausendmal pro Sekunde die Lage – mit Rauschen, wie jeder Sensor im Sensordom.',
      en: 'Inside the core’s sphere sits an **IMU**: accelerometers and gyroscopes. From their readings the controller estimates the attitude a thousand times a second, with noise, like every sensor in the Sensor Dome.',
    },
    decider: { de: 'Jede Regelung ist nur so gut wie ihre Messung. Frag nach dem Rauschen (σ), nicht nach der Auflösung.', en: 'Any control is only as good as its measurement. Ask for the noise (σ), not the resolution.' },
  },
  {
    zone: 'regelgarten',
    m: 'M2',
    eyebrow: { de: '// M2 · 02 REGELN', en: '// M2 · 02 CONTROL' },
    title: { de: 'Messen, vergleichen, korrigieren', en: 'Measure, compare, correct' },
    face: { de: 'Ein Regelkreis wie dein Pendel – nur in zwei Achsen, 1000-mal pro Sekunde.', en: 'A feedback loop like your pendulum, in two axes, 1,000 times a second.' },
    body: {
      de: 'Der Regler vergleicht die gemessene Lage mit „waagrecht“ und schickt den Rotoren Schub – wie bei deinem Pendel im Regelgarten, nur in zwei Achsen.',
      en: 'The controller compares the measured attitude with “level” and sends thrust to the rotors, like your pendulum in the Control Garden, only in two axes.',
    },
    decider: { de: 'Takt und Verzögerung entscheiden über Stabilität. Am Leitstand spürst du 150 ms.', en: 'Rate and delay decide stability. At the control desk you’ll feel 150 ms.' },
  },
  {
    zone: 'greifwerkstatt',
    m: 'M3',
    eyebrow: { de: '// M3 · 03 GREIFEN', en: '// M3 · 03 GRASP' },
    title: { de: 'Sechs Rotoren, eine Lage', en: 'Six rotors, one attitude' },
    face: { de: 'Aus „links vorn mehr Schub“ werden sechs Drehzahlen – wie IK, nur für Rotoren.', en: '“More thrust front left” becomes six rotor speeds: like IK, for rotors.' },
    body: {
      de: 'Aus „mehr Schub links vorn“ werden sechs Drehzahlen. Diese **Schubverteilung** rechnet wie die inverse Kinematik in der Greifwerkstatt: Aus einem Ziel werden viele Einzelwerte.',
      en: '“More thrust front left” becomes six rotor speeds. This **thrust allocation** works like the inverse kinematics in the Grip Workshop: one goal becomes many individual values.',
    },
    decider: { de: 'Mehr Aktoren als nötig heißt Redundanz – und mehr, das ausfallen kann. Frag nach dem Ausfallverhalten.', en: 'More actuators than needed means redundancy, and more that can fail. Ask how it behaves when one fails.' },
  },
  {
    zone: 'lern-dojo',
    m: 'M4',
    eyebrow: { de: '// M4 · 04 LERNEN', en: '// M4 · 04 LEARN' },
    title: { de: 'Gelernt – aber woraus?', en: 'Learned, but from what?' },
    face: { de: 'NN-Lage v2 lernte aus Beispielen. Nur von ruhigen Tagen.', en: 'NN-Lage v2 learned from examples. From calm days only.' },
    body: {
      de: 'NN-Lage v2 hat das Regeln aus Beispielen gelernt, wie die Policy im Lern-Dojo. Die Beispiele stammen **nur von ruhigen Tagen**. Was es nie gesehen hat, kann es nicht.',
      en: 'NN-Lage v2 learned to control from examples, like the policy in the Learning Dojo. The examples come **from calm days only**. What it never saw, it can’t do.',
    },
    decider: { de: 'Gleiche Eingaben im Betrieb wie im Training? Wenn nicht: messen, bevor es fliegt.', en: 'Same inputs in operation as in training? If not: measure before it flies.' },
  },
  {
    zone: 'dunkelfabrik',
    m: 'M5',
    eyebrow: { de: '// M5 · 05 ARBEITEN', en: '// M5 · 05 WORK' },
    title: { de: 'Die härteste Schicht der Insel', en: 'The island’s hardest shift' },
    face: { de: '86,4 Millionen Korrekturen am Tag. Ohne Pause, ohne Licht.', en: '86.4 million corrections a day. No breaks, no lights.' },
    body: {
      de: 'Tausend Korrekturen pro Sekunde, **86,4 Millionen am Tag**, ohne Pause und ohne Licht. Diese Arbeit kann kein Mensch leisten – am Leitstand merkst du, warum.',
      en: 'A thousand corrections a second, **86.4 million a day**, without a break and without lights. No person can do this work; at the control desk you’ll feel why.',
    },
    decider: { de: 'Roboter übernehmen die harte Arbeit, Menschen das Denken: Ob der neue Regler fliegt, entscheidest heute du.', en: 'Robots take the hard work, people do the thinking: whether the new controller flies is your call today.' },
  },
  {
    zone: 'prueffeld',
    m: 'M6',
    eyebrow: { de: '// M6 · 06 MESSEN', en: '// M6 · 06 MEASURE' },
    title: { de: 'Kennlinie statt Etikett', en: 'Curve, not label' },
    face: { de: 'Regel, n, Intervall, Erwartung vorher. So prüfen wir gleich NN-Lage v2.', en: 'Rule, n, interval, expectation first. That’s how we’ll test NN-Lage v2.' },
    body: {
      de: 'Erfolg als Regel, viele Versuche, ein Intervall statt eines Punkts, die Erwartung vorher notiert. **Genau so** prüfen wir gleich NN-Lage v2.',
      en: 'Success as a rule, many trials, an interval instead of a point, the expectation written down first. **Exactly like that** we’ll test NN-Lage v2.',
    },
    decider: { de: '„99 %“ ohne n und ohne Bedingung ist ein Etikett. Verlang die Kennlinie.', en: '“99 %” without n and without conditions is a label. Ask for the curve.' },
  },
];

export const LESSON_STR = {
  yours: { de: 'Dein Messwert', en: 'Your measurement' },
  none: { de: 'Noch nicht gemessen', en: 'Not measured yet' },
  fiction: { de: 'FIKTION · Der Regelkreis dahinter ist echt.', en: 'FICTION · The control loop behind it is real.' },
  ask: { de: 'Lektion lesen', en: 'Read the lesson' },
};

/** Why each question matters (same lines as the island's question cards, src/world/questions.ts). */
export const QUESTION_WHY: { de: string; en: string }[] = [
  { de: 'Ohne feste Regel lässt sich jedes Ergebnis als Erfolg erzählen.', en: 'Without a fixed rule, any result can be told as a success.' },
  { de: 'Eine Quote ohne n ist eine Anekdote.', en: 'A rate without n is an anecdote.' },
  { de: 'Ein Video zeigt den besten von vielen Läufen, nicht den typischen.', en: 'A video shows the best of many runs, not the typical one.' },
  { de: 'Erst die Erwartung festlegen, dann messen – sonst passt man das Ziel an.', en: 'Fix the expectation first, then measure – or the target moves.' },
  { de: 'Greifen gelingt in geübten Lagen; neue Lagen zeigen die echte Quote.', en: 'Grasps succeed in practised poses; new poses show the real rate.' },
  { de: 'Wer die Gewichte nicht nutzen darf, kann nicht nachtrainieren.', en: "If you can’t use the weights, you can’t retrain." },
  { de: 'Wer das Ende frei wählt, stoppt vor dem Fehler.', en: 'Whoever picks the end freely stops before the failure.' },
  { de: 'Andere Kamera, anderes Licht – andere Policy.', en: 'Different camera, different light – different policy.' },
  { de: 'Die erste Umgebung ist meist die, in der optimiert wurde.', en: 'The first environment is usually the one that was optimised for.' },
];
