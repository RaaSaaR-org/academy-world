# Glossary and house style (DE / EN)

One concept, one word, in every zone. Use these terms in strings, signs, cards, docs and tests. If a term is missing, add it here before you use it in two places.

## Brand, modes, progress

| Concept | Deutsch | English | Notes |
|---|---|---|---|
| Brand line | Messung statt Marketing. | Measurement, not marketing. | Always with the full stop |
| Game | Schwebewerk · Insel 17 | The Floating Works · Island 17 | FIKTION |
| Company | EmAI | EmAI | Never "Emai" or "EMAI" |
| Explorer mode | Entdecker | Explorer | Learn by trying |
| Decision-maker mode | Entscheider | Decision maker | Same "du"; more depth, Befundkarten |
| Form of address | du (both modes) | you | DECISIONS D1: never „Sie“ |
| Station arc | Probieren · Verstehen · Messen | Try · Understand · Measure | Stations A · B · C |
| Core station (◆) | Kernstation (für Entscheider) | core station (for decision makers) | The Kennlinie station of a zone. Marked ◆ since Phase 4 (★ now means a challenge star) |
| Academy Pass | Academy Pass | Academy Pass | Tab; no hyphen in German either |
| Stamp | Stempel | stamp | 18 in total |
| Skipped stamp | übersprungen · grauer Stempel | skipped · grey stamp | Entscheider skip |
| Prediction | Erst tippen, dann messen · Tipp | Predict first, then measure · prediction | |
| Prediction score | Prognose-Güte | prediction accuracy | The only score |
| Question cards | Fragenkarten (sing. Fragenkarte) | question cards | Not „Fragekarten“ |
| The nine questions | Neun Fragen an jeden Anbieter | Nine questions for every vendor | GDD Appendix C |
| Album | Failure-Mode-Album | failure-mode album | One hidden entry per zone |
| Certificate | Zertifikat | certificate | On the Ausguck |
| Annual audit (finale) | Jahresprüfung | annual audit / audit | Kielraum, F1–F3 |

## Game layer and world (Phase 4)

| Concept | Deutsch | English | Notes |
|---|---|---|---|
| Challenge star | Stern, ★ x/9 (Zone), ★ x/54 (gesamt) | star, ★ x/9 (zone), ★ x/54 (total) | Rates the player's play, never a robot (DECISIONS D8) |
| Retry | Nochmal [R] | Again [R] | Banner and fail flash |
| Why? | Warum? [H] | Why? [H] | Opens the station's info card |
| Personal best | Bestwert · Neuer Bestwert | best · New best | Never on the first attempt |
| Countdown | 3 · 2 · 1 · Los! | 3 · 2 · 1 · Go! | |
| Tower line | Linie n/18 für den Turm · Schau zum Turm. | Line n/18 for the tower · Look at the tower. | Earned stamp n lights element n − 1 |
| Sensor capsule | Sensorkapsel (Kapseln x/12) | sensor capsule (capsules x/12) | 12: 6 world, 6 zones |
| Position light | Positionslicht | position light | One per capsule, on the rim |
| Tower leap | Turmsprung | tower leap | Pad at 12/12 capsules; on the map once all capsules are found (Phase 5). The strings say „Tower leap“ |
| Solar row | Solarreihe | solar row | Low single-axis PV tracker on the deck (Phase 5, replaces the solar trees); the toy „Solarreihe verstellen“. Unlabelled: no claim that it powers the island |
| Measuring point | Messpunkt | measuring point | The spawn eye; the arrival plate whose card measures the tower (known width → distance) |
| Lens | Linse | lens | The dark 2.4 m disc behind the sculpture |
| Lookout ring | Ausguck (Halo) | lookout (halo) | +44 |
| Lattice | Gitterturm (Diagrid) | lattice (diagrid) | |
| Drawing arm | Zeichenarm | drawing arm | Draws the tower lines with a laser |
| Ghost arc | Geisterbogen | ghost arc | Unlit arc in brushed aluminium |
| Radio companion | EMI-01 › Funk | EMI-01 › radio | ≤ 1 line per 20 s |
| EMI-01 skills | EMI-01 hat gelernt: SEHEN · REGELN · GREIFEN · LERNEN · ARBEITEN · MESSEN | EMI-01 has learned: SEE · CONTROL · GRIP · LEARN · WORK · MEASURE | One per zone |

## Cards and honesty labels

| Concept | Deutsch | English | Notes |
|---|---|---|---|
| Info card | Infokarte | info card | Engine `openInfoCard` |
| Decision box | Für Entscheider; box title „Was das für dein Werk heißt“ | For decision makers; “What this means for your plant” | Entscheider mode only in most zones; „Werk“ / “plant”, not „Betrieb“ or „Halle“ |
| Curious line | Für Neugierige | For the curious | Entdecker depth line |
| Findings card | Befundkarte | Findings card | Four labelled lines, below |
| … line 1 | **Messgröße:** | **Measured:** | What was measured |
| … line 2 | **Grenze:** | **Limit:** | Where it breaks, incl. „Spielzeugmodell“ when it is one |
| … line 3 | **Frage an den Anbieter:** „…“ | **Question for the vendor:** “…” | One of the nine questions |
| … line 4 | **Für dein Werk:** | **For your plant:** | Action for the reader's site |
| Curve | Kennlinie („Kennlinie statt Etikett“) | curve (“A curve, not a label”) | Never a pass/fail stamp |
| Interval | 95-%-Intervall, Wilson-Intervall, Band | 95 % interval, Wilson interval, band | |
| Toy model | Spielzeugmodell | toy model | Not „Spielmodell“ |
| Guide value | Richtwert | guide value | Chip RICHTWERT / GUIDE VALUE |
| Chips | SIM · LIVE · STUDIE · QUELLE · RICHTWERT · ILLUSTRATIV · FIKTION; since Phase 7 also HERSTELLERANGABE · MODELL · SIM · AUFZEICHNUNG · TRAUM | SIM · LIVE · STUDY · SOURCE · GUIDE VALUE · ILLUSTRATIVE · FICTION; VENDOR SPEC · MODEL · SIM · RECORDED · DREAM | One chip per number (`src/ui/Kit.ts`) |
| Vendor spec | HERSTELLERANGABE (mit Datum: „Stand 17.10.2026“) | VENDOR SPEC (with its date) | A real vendor's published value, never a measurement of ours (D32); a secondary source (press, distributor) carries QUELLE instead |
| Model value | MODELL | MODEL | Computed on the shipped 3D model (height, mass, joints, payload over reach); never stands in for a vendor value (D32) |
| Dream value | TRAUM | DREAM | A world model's prediction (Traumhangar, lift-off HUD); teal with a dashed rim |
| Datasheet | Datenblatt | datasheet | One word in EN |
| Falsification condition | Falsifikationsbedingung | falsification condition | „92 % bei n = 200, falsifiziert, falls < 80 % bei 45 °C“ (ILLUSTRATIV) |

## People, machines, places

| Concept | Deutsch | English | Notes |
|---|---|---|---|
| Our robot | EMI (EMI Rover, 1,55 m), Einheiten EMI-01 … EMI-09 | EMI (EMI Rover, 1.55 m), units EMI-01 … EMI-09 | 17 revolute joints + 2 wheels. Phase 7 adds EMI-08 (Sonnenacker) and EMI-09 (roams the Revier) |
| The EMI count line | „Open Hardware. Jeder kann einen bauen. Wir haben neun.“ | “Open hardware. Anyone can build one. We have nine.” | Was „Wir haben sieben.“ until rc4 (GDD §2) |
| Robot class | kognitiver Roboter | cognitive robot | EMI only. Never „humanoid“ for EMI |
| Third-party robot class | humanoider Roboter; on datasheets „Humanoid“ | humanoid robot; „Humanoid“ on datasheets | Only for real third-party robots (Unitree, Apollo, TALOS; D32) |
| Fictional vendor | Hersteller X | Vendor X | Procedural, unbranded |
| Vendor (role) | Anbieter | vendor | Real vendors are never named (D6) |
| Fictional controller | NN-Lage v2 | NN-Lage v2 | Finale offer |
| Current controller | Bestand (PID) | current controller (PID) | Finale |
| Control desk | Leitstand | control desk | Regelgarten B, Dunkelfabrik C, Kielraum F1 |
| Test rig | Prüfstand | test rig | Greifwerkstatt C, Kielraum F2 |
| Test cell | Messzelle (mobile) | (mobile) test cell | Prüffeld B |
| Test console | Messpult | test console | Prüffeld B |
| Operate mode | Bedienmodus | operate mode | Esc leaves |
| Jump pad | Sprungplatte | jump pad | |
| Spirit level | Libelle | spirit level | Plaza |
| Lookout | Ausguck (+44) | lookout (+44) | Certificate, sky switch |
| Keel room | Kielraum, KIEL −36 | Keel Room, KEEL −36 | Finale |
| Rotors | Hauptrotoren M1–M6, Trimmrotoren T1–T4 | main rotors M1–M6, trim rotors T1–T4 | DECISIONS D7 |

## Phase 7: the quest, the world below, the real robots

| Concept | Deutsch | English | Notes |
|---|---|---|---|
| Quest spine | Startklar | Ready for take-off | The cover and HUD line „STARTKLAR · AUFTRIEB n/6 · ENERGIE · NAVIGATION“ (plan §3) |
| The three systems | Auftrieb · Energie · Navigation | Lift · Energy · Navigation | D23: Auftrieb = the six main rotors (one ◆ per island zone), Energie = the Startakku, Navigation = the Flugmodell |
| Start battery | Startakku | start battery | Charged by the Sonnenacker ◆ „Erntetag“ (D23); its kWh are a RICHTWERT |
| Flight model | Flugmodell | flight model | The world model the island flies with through the cloud bank; installed by the Traumhangar ◆ „Traumdaten“ (D23) |
| Ground crew | Bodencrew | ground crew | Supplies the Startakku and the Flugmodell in Entscheider mode, labelled „von der Bodencrew“ (D23) |
| Test start | Probestart | test start | The first lever at arrival; it fails on purpose and shows the three red systems |
| Finale | Startprüfung (F1 Schwebetest, F2 Prüfstand, F3 Empfehlung) | flight check (F1 hover test, F2 test rig, F3 recommendation) | Was „Jahresprüfung“ (D24) |
| Hover test | Schwebetest | hover test | F1: the island hovers 10 m over the keel block, held by hand |
| Dock arms | Haltearme | holding arms | The six hydraulic clamps from the dock wall; they catch every gust while docked |
| The land below | Revier („Das Revier“) | Revier (not translated) | The reclaimed open-cast mining land around Trockendock 3 (D42, D43) |
| Farm site | Sonnenacker | Sun Field | Ground area: agrivoltaics and harvest arms; EMI-08 |
| Unitree hall | Traumhangar | Dream Hangar | Ground area in the Werft (D36); world models, the R1, G1, H1-2 and the H2 |
| Showroom | Schauhalle Nord (kurz: Schauhalle) | Showroom North (short: showroom) | Island hall with the real robots; the Entscheider stop there is the „Schaufenster“ / “shop window” (D41) |
| Finds cabinet | Fundvitrine | finds cabinet | In the Schauhalle; holds the found secrets, never gates anything (D35) |

| # | Deutsch | English | Verb DE / EN |
|---|---|---|---|
| 01 | Sensordom | Sensor Dome | SEHEN / SEE |
| 02 | Regelgarten | Control Garden | REGELN / CONTROL |
| 03 | Greifwerkstatt | Grip Workshop | GREIFEN / GRASP |
| 04 | Lern-Dojo | Learning Dojo | LERNEN / LEARN |
| 05 | Dunkelfabrik | Dark Factory | ARBEITEN / WORK |
| 06 | Prüffeld | Proving Ground | MESSEN / MEASURE |

## Technical terms

| Concept | Deutsch | English | Notes |
|---|---|---|---|
| Controller | Regler | controller | |
| Feedback loop | Regelkreis | control loop / feedback loop | „Die Insel ist ein Roboter“ |
| Control rate | Takt (Regelfrequenz) | rate (control rate) | Hz |
| Latency | Latenz, Verzögerung | latency, delay | ms |
| Tipping time | Kippzeit τ | tipping time τ | e-folding time, not the fall time |
| Forward / inverse kinematics | Vorwärtskinematik / inverse Kinematik (IK) | forward / inverse kinematics (IK) | |
| Singularity | Singularität | singularity | |
| Friction cone | Reibungskegel | friction cone | |
| Force sensor / tactile | Kraftsensor / Taktil, Tastsinn | force sensor / tactile, touch | |
| Demonstration | Demo (Vormachen) | demo (demonstrate) | |
| Policy | Policy | policy | |
| Distribution shift | Distribution-Shift | distribution shift | |
| Action chunk | Action-Chunk | action chunk | |
| Dead block | Totblock | dead block | Lern-Dojo C |
| Autonomous share | autonomer Anteil (von X % bei Aufgabe Y) | autonomous share (of X % at task Y) | Never a bare „autonom“ |
| Intervention | Eingriff | intervention | One person, one gesture, one cycle |
| RtI / MRC | RtI (Aufforderung zu übernehmen) / MRC (sicherer Zustand) | RtI (request to intervene) / MRC (minimal-risk condition) | |
| Sim-to-real gap | Sim-to-Real-Lücke | sim-to-real gap | |
| Inter-rater agreement | Prüferübereinstimmung, Cohen’s κ | inter-rater agreement, Cohen’s κ | κ ≥ 0,8 stark (McHugh 2012) |

## House style

- **Address:** „du“ in both modes, lower case inside a sentence.
- **Numbers:** German decimal comma (0,2 s), English decimal point (0.2 s); thousands 76.000 / 76,000. A space before units and before % in both languages (58 %, 4,6 m, 41 °C). Ranges with an en dash and no spaces (58–92 %). Multiplication sign × (×2,5).
- **Dashes:** a spaced en dash „ – “ in both languages (no em dash).
- **Quotes:** German „…“, English “…”; apostrophe ’.
- **Intervals:** a rate is always shown with n and an interval: „73 % [66–80] · n = 200“; for skewed small-n intervals show the range („84–100 %“), not „±“.
- **EMI lines:** at most two sentences and about 18 words; reactions replace the current line (`emi.say(…, { interrupt: true })`).
- **Cards (1280×720 must fit without scrolling):** Entdecker ≈ 40–65 words (concept + Für Neugierige), Entscheider ≈ 50–80 words (concept + Für Entscheider / Befundkarte).
- **Banned words:** humanoid (for EMI; real third-party robots may be „humanoider Roboter“, D32), revolutionär, disruptiv, bahnbrechend, Game-Changer, Synergien, ganzheitlich, KI-getrieben/-gestützt, KI-Lösung, nahtlos, smart, innovativ, Mehrwert, zukunftssicher, transformativ; never „Roboter ersetzen Menschen“ (say „Roboter übernehmen die harte Arbeit, Menschen das Denken“).
- **Names:** no customer names, no prices for EmAI products, no robot-vendor brand names in player-facing text (DECISIONS D6) except the real robots of Phase 7, named only to identify the product (D15, D32; history cards and use-case machines keep companies anonymous, D34); price bands with source and date only for third-party robots (D17); statistics bodies (IFR, Eurostat, Destatis, IW Köln, BAuA, DGUV) and academic studies (author, year) may be named.
- **Check:** `node tools/text-audit.mjs --lang de --mode entscheider` lists card word counts, cards that scroll at 1280×720 and EMI lines over two sentences.
