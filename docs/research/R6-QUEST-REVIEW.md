# R6 · Quest review of rc4: fun and learning

Phase 7 research, topic R6. Baseline: release candidate 4 (tag `rc4` = `cba388c`, the founder-approved baseline). Date: 2026-10-17. This report changes no code. It reviews every station of rc4 for minute-to-minute fun and for learning, then proposes how Phase 7 can turn the island into a real quest toward its lift-off and where the new real-robot content (SO-101, Open Duck Mini, the Unitree humanoids and the showroom) should replace or upgrade what is there.

**Contents:** 0 Verdict · 1 Method · 2 The macro loop today · 3 Station by station · 4 Cross-cutting findings · 5 Weakest stations and what replaces them · 6 Quest structure "Startklar" · 7 Top 15 · 8 Keep list · 9 Founder questions · 10 Risks · 11 Sources

---

## 0. Verdict in one screen

**rc4 is a good collection of experiments with no quest around them.** Phase 4 turned every station into a challenge with stars and a banner, and Phase 6 made the game fast and readable. Measured on rc4 with real keys, the first mechanic comes at 42 s and the first zone at 61.6 s. Text stays inside its budgets, and no card opens by itself in Entdecker mode. What is missing is a reason to play the next station:

1. **Nothing is at stake, and nothing changes.** The island flies from the first second, and the "Jahresprüfung" is abstract. Finishing a zone changes a beacon colour, a tower line and a star count. The world never gets more capable because of you.
2. **There are nine progress systems, and only three of them gate anything.** Stamps, stars, tower lines, capsules, question cards, album, EMI skills, Prognose-Güte and personal bests (§2.2). Stars, the most visible of them, unlock nothing.
3. **Five of the 18 stations (plus F2) still follow "set values, press Start, watch, read a curve".** The statistics lesson ("n and an interval") is taught five times (03 C, 04 C, 06 A, 06 B, F2), and the player is asked for a prediction nine times.
4. **Robots are procedural stand-ins.** The SCARA in the Lern-Dojo, the anonymous arms and "Hersteller X" all teach real ideas, but the player never meets a robot they could look up afterwards.
5. **The finale ends in a form and a table** (F3 tiles, "Ein Jahr später"). Then comes a lift ride at dusk. The climax has the least play in the game.

**What already works and must stay:** the Dunkelkammer glass bump (01 B), the egg crack in slow motion (03 B), balancing by hand (02 A), the falling giant pendulum (02 B), the robot that copies your wobble (04 B), the crate minute against the robot (05 A), lights out with the MRC alarm (05 C), the shutter and the sign flip (06 B), F1 at the wheel, the jump pads, the tower that draws your progress, the source chips and "du".

**The Phase 7 quest in five moves:**
1. **"Startklar".** The island starts on the ground. A failed start in minute one shows six red systems, and each zone repairs one of them: zone n brings thruster Mn online, and you see and feel the test run. Lift-off is the finale's payoff (§6).
2. **Every zone gets a request with a reason.** One line from its EMI explains why the island cannot fly without this ("Die Insel landet blind. Zeig mir, was meine Sensoren übersehen."). It replaces the instruction-style objective as the first line.
3. **Real robots replace the weakest stations** rather than adding to an already long route. Open Duck Mini becomes the RL station (Regelgarten C). SO-101 becomes the teleop/VLA station (Lern-Dojo A/B). "200 Griffe" (Greifwerkstatt C) is retired, and its slot and its two question cards move. The Unitree humanoids become a ladder that runs from R1 to the hard-won H2 (§5).
4. **Rewards become things you get.** Stars and thrusters deliver real robots to a showroom in the tower foyer, with an unboxing. The H2 stands under a cover from minute one. The nine progress systems shrink to three you can see: thrusters, stars → robots, and capsules (§6.4).
5. **F3 decides how the island lifts off.** The recommendation flies. Under "Pilot mit Auflage" a gust hits during the climb and the fallback visibly takes over. Every choice still flies, and your F2 numbers decide how it feels (§6.6).

---

## 1. Method and evidence

| What | How | Output (git-ignored) |
|---|---|---|
| Read the design and its history | README, GDD §1–§3, §6, §7 (incl. as-built Phase 4/5), §8; FUN-PLAN; QA-PHASE4; PHASE6-PLAN; RELEASE; DECISIONS; GLOSSARY | — |
| Read every station's player text and mechanics | `src/zones/*/strings.ts` (DE), station code for timings and gating (`messstrecke.ts`, `wall.ts`, `stationC.ts`, `audit.ts`, `nacht.ts`, `teleop.ts`, `questions.ts` and the `awardQuestion` call sites), `src/world/onboarding.ts`, `src/world/finale/strings.ts` | — |
| First minutes with real input on rc4 | `PT_DEV=1 PT_DIR=phase7/quest-review/onboarding node tools/onboarding-run.mjs --lang de --mode entdecker` (private dev server on a free port, no build, ascent watched) | `artifacts/phase7/quest-review/onboarding/run-de-entdecker/` (6 screenshots, log), `onboarding-de.log` |
| Every station console on rc4: visible words and screenshots | own probe `artifacts/phase7/quest-review/probe-stations.mjs` (adapted from Phase 4's `probe2.mjs`): opens each console by label, with earlier stations solved by the zones' debug hooks; plus one result banner per zone | `artifacts/phase7/quest-review/stations-entdecker/` (21 PNG, `stations.json`), `stations-entdecker.log` |
| Text budgets | release text audit `artifacts/release/text-audit/de-entdecker.json` (prose words, lessons, EMI lines per zone) | — |
| External facts for the new content | official vendor pages and repositories (§11), accessed 2026-10-17 | — |

**Limits.** No human played for this report. Fun scores are judged from code, the measured timings, screenshots and the Phase 5 bot calibrations, not from watching people. RELEASE §2 ("Fun, by watching") is still open and should validate §3 before the plan is locked. My probe counts a console's visible text at one moment (key legends, numbers and chips included). The release text audit counts with its own rules, so the two numbers differ by up to 30 words (02 A: 77 vs. 47) and cannot be swapped for each other; the budgets in §6.8 use the probe's method. The probe screenshots come from solve hooks, so some show a banner from the previous station still open; that is a probe artefact, because a real player closes the banner with Enter or by walking 4 m (RELEASE §1, C6).

---

## 2. The macro loop today

### 2.1 Route and timing

`Title → ascent (25 s, the island already flies) → Libelle gust button → Pass → jump pad → 6 zones × 3 stations (Probieren → Verstehen → Messen) → KIEL opens at stamps in 4 zones → F1 hold the island, F2 audit "NN-Lage v2", F3 sign a recommendation → "Ein Jahr später" → lift to the Ausguck at dusk → certificate → free roam.`

Measured on rc4 (DE Entdecker, real keys, ascent watched):

| t (s) | Beat |
|---|---|
| 25.6 | in control (ascent over) |
| 28.2 | EMI-01 „Spürst du das? Geh zur Libelle.“ |
| 32.4 | tutorial capsule line |
| 40.5 | EMI-01 greets at the Libelle |
| **42.0** | **first mechanic: E on „Böe auslösen“** |
| 43.9 | „Gefangen. Die Insel ist ein Roboter – und du stehst drauf.“ |
| 48.7 | Pass line „Achtzehn Stempel – jeder zeichnet eine Linie am Turm.“ |
| 57.2 | E on the jump pad |
| **61.6** | **first zone (Sensordom)** · 6 EMI lines seen, 0 errors |

The speed is good, so speed is not the problem. The meaning is: the hook („Die Insel ist ein Roboter“) is a fact the player watches confirmed, not a problem the player sets out to solve.

### 2.2 Progress systems (what you collect and what it does)

| System | Count | Where you see it | What it unlocks |
|---|---|---|---|
| Stamps | 18 | Pass, tower lines, masts | KIEL at stamps in 4 zones; one EMI-01 skill per zone |
| Stars | 54 | banner, Pass, masts, map, certificate | **nothing** |
| Tower lines | 18 | tower (drawing arm) | nothing (finale sweep) |
| Sensorkapseln | 12 | rim position lights, map | Turmsprung at 12/12 |
| Question cards | 9 | Pass | Prüffeld A, F2 protocol, checklist copy |
| Failure album | 6 | Pass | nothing |
| EMI-01 skills | 6 | Pass row, foyer demo | nothing you can use |
| Prognose-Güte | 1 | Pass, certificate | nothing |
| Personal bests | 11+ | banner, Pass | nothing |

**Finding.** Nine systems compete for attention, and the most visible one (stars) is purely informational. A quest needs fewer rewards that *change something*.

### 2.3 Verbs

| Verb | Stations |
|---|---|
| Walk, look, sprint, jump; launch from a pad | everywhere |
| Switch a sensor view | 01 A, 01 B |
| Navigate blind | 01 B |
| Continuous control (A/D, mouse) | 02 A, 03 A, 03 B (grip), 04 A, F1 |
| Carry or push (hold E) | 05 A, 06 B |
| Reflex under a timer (Space within 10 s) | 05 C |
| Find and select (detective) | 01 A, 04 C, 06 C |
| **Set values in a panel, then watch** | 01 C, 02 B, 02 C, 03 C, 05 B, 05 C, 06 B, 06 C, F2, F3 |
| Predict a number („Erst tippen, dann messen“) | **9 prompts:** 01 C (×2), 02 B, 02 C, 03 C, 04 C, 05 C, 06 B, F2 |
| Collect | capsules, question cards |
| Grab and throw (F / right mouse) | **built, but no station uses it** (QA-22: the rows show only while something is grabbable) |

**Missing verbs that the new content brings naturally:** teach a body to walk by shaping its reward (Open Duck), instruct a robot in words (SO-101 VLA), pilot a humanoid by choosing between imagined futures (world model), and inspect a real object at true scale (showroom).

### 2.4 The one idea per station: felt in play or told in text?

| Station | One idea | Felt / told |
|---|---|---|
| 01 A | every sensor has blind spots | felt |
| 01 B | to LiDAR, glass is mostly air | **felt (you hit it)** |
| 01 C | double distance, four times the error | seen in a histogram; the consequence (EMI misses) is only a number |
| 02 A | a longer pole gives you more time; human reaction is too slow | felt |
| 02 B | measured too slowly means corrected too late | **seen (the giant falls)** |
| 02 C | practise in many wrong worlds | seen on the wall; why it works is told |
| 03 A | forward vs. inverse kinematics | felt (crank vs. click) |
| 03 B | control force, not position | **felt (crack)** |
| 03 C | 20 trials are an anecdote | told (a band shrinks); **repeats** 06 A/B and F2 |
| 04 A | demonstrations are data | partly felt |
| 04 B | it learned you, not the task; distribution shift | **felt (it copies your wobble)** |
| 04 C | check the data before training | felt (detective), gain measured |
| 05 A | this is hard work, every 20 s for 8 h | felt (heartbeat, vignette) |
| 05 B | a robot on an empty post fills a gap; payback depends on assumptions | told, abstract |
| 05 C | autonomy is a share; the weakest gesture limits the line | **felt (MRC alarm at 23:14)** |
| 06 A | a demo is not a measurement | seen (tags on the sign) |
| 06 B | under load: 69 % ± 6, not 100 % | seen (sign flip) |
| 06 C | a rule turns opinions into a measurement | partly felt (refusal); κ stays abstract |
| F1 | 150 ms of lag makes everything swing | felt |
| F2 | "99 %" holds only in calm weather | seen |
| F3 | decide with a number, a condition and n | told (template) |

---

## 3. Station by station

**Scoring.** *Fun* is the sum of six dimensions, each scored 0–2: **A**gency (meaningful choices or skill input), **F**eedback (immediate and legible), **J**uice (sound, motion, spectacle), **S**urprise (a reveal or twist), **M**astery (room to get better, a reason to retry) and **P**acing (no waiting or text walls). The sum maps to a score: 0–2 → 1, 3–4 → 2, 5–7 → 3, 8–10 → 4, 11–12 → 5. *Learning* runs from 5 (the idea is felt in play and sticks as one image) through 4 (felt, but the banner has to name it), 3 (partly felt or abstract), 2 (told rather than felt, or redundant) to 1 (no learning content). "Words" are the visible words of the console when it opens, from my probe.

### 3.0 Hub and onboarding

| Station | You do | A F J S M P | Fun | Learning | Friction | Evidence | Keep / change |
|---|---|---|---|---|---|---|---|
| Ascent (25 s) | watch a camera flight up through the clouds onto the island | 0 0 2 1 0 1 | **2** | **2** (premise told) | conflicts with the new premise: it shows the island already flying | onboarding log 0.2 → 25.6 s; D13 skips it for returning players | replace with a short approach to the **grounded** island (§6.3) |
| Libelle gust | walk 40 m, press one button, watch the ball roll out and back | 1 2 1 1 0 2 | **3** | **3** | a single press is low agency; „1000 Korrekturen“ is abstract | 42.0 s first mechanic; `03-libelle-gust.png` | turn it into the **failed Probestart** (§6.3) |
| Pass and jump pad | get the Pass at the Libelle, hop to the zone | 1 2 2 1 0 2 | **4** | **2** (flight numbers shown, never used) | none | 57.2 s E on pad, 61.6 s zone | keep the pads; the Pass becomes the "Startliste" |
| Sensorkapseln (12) | find capsules; each lights a rim light; 12/12 raises the Turmsprung | 2 1 1 1 1 1 | **3** | **1** (the Sensordom velvet capsule teaches; the others do not) | no purpose beyond completion | FUN-PLAN W1–W4, GDD as-built | keep; give the lights a role at lift-off (§6.4) |
| Tower drawing arm | watch a line drawn per stamp, with the Recamán rule | 0 2 2 1 0 1 | **3** | **2** | must be looked at to draw (pending lines) | ART-V2, GDD Phase 5 | keep; it is the visible progress bar |

### 3.1 Sensordom (01 · SEHEN)

| Station | You do | A F J S M P | Fun | Learning | Friction | Evidence | Upgrade |
|---|---|---|---|---|---|---|---|
| **A Messbrille** | switch the visor (RGB, depth, LiDAR, segmentation) and tag 5 things for EMI-02's gripper | 2 2 1 1 1 2 | **4** | **4** | since Phase 6 (Z2) an E in the wrong view is silently ignored, so the funny, informative miss („Glasflasche · LiDAR: Luft“) is gone; stars count view switches (awaiting the founder) | `labor.ts`, DECISIONS engineering notes; entry prose 7 words | bring the miss back as a harmless gag with no star cost: EMI-02 grabs at thin air, with a popup naming the sensor's blind spot |
| **B Dunkelkammer** | walk through a dark room with LiDAR only, hit invisible glass, lights come on, fusion follows; then a time trial | 2 2 2 2 2 2 | **5** | **5** | none | FUN-PLAN §1.4; time trial ★★ ≤ 60 s, ★★★ ≤ 45 s with 0 contacts | keep as it is: the best "feel it" moment in the game |
| **C Messstrecke ◆** | pick a distance and the light, press Space for 30 readings, read σ; tip σ(6 m), then tip "how far does EMI grip safely?" | 1 1 1 1 0 1 | **3** | **4** | 4 runs of 2.5 s readings (12/s) plus carriage moves at 1.5 m/s (`messstrecke.ts:35–37`); two prediction prompts; "EMI would grip 27 of 30" stays a number | `01-sensordom-C.png`, 37 words | **EMI-02 reaches** for the object at your chosen distance and visibly grips or misses. One prediction, not two |

### 3.2 Regelgarten (02 · REGELN)

| Station | You do | A F J S M P | Fun | Learning | Friction | Evidence | Upgrade |
|---|---|---|---|---|---|---|---|
| **A Balancieren** | keep a pole up on a cart with A/D (3 lengths, Earth/Mars/Moon); on Earth the controller shows you how | 2 2 1 1 2 1 | **4** | **4** | the panel shows **77 words** with the best-time grid; the default is Earth / 1 m, which no human holds (by design), so the first run is a failure (0.91 s in the probe); the stamp asks for all 3 lengths plus one 5 s run | `02-regelgarten-A.png`; GDD Phase 4/5 (Earth not holdable with 0.25 s reaction) | **first success first:** open on 2 m / Moon, then let EMI-03 suggest Earth; move the best-time grid to a tab |
| **B Regler & Takt ◆** | turn the loop rate down until the 12 m pendulum falls; right it, set 200 Hz, push | 1 2 2 2 1 1 | **4** | **4** | a four-step chain (fall → Space → 200 Hz → X); the "skill" and "planner" dials bring VLA/RL vocabulary into a control lesson; 53 words | `03-regelgarten-B.png`; `giant.ts` | keep the fall; hide the brain-stack dials behind „Gehirn-Stapel ▸“ in Entdecker mode |
| **C Tausend falsche Welten** | tune P and D yourself on 256 random worlds, then watch 8 generations of CEM training, then transfer | 1 1 2 1 1 0 | **3** | **3** | about 32 s of replay (8 × 4 s, `wall.ts:19`) plus the transfer; "Policy", "Generation" and "CEM" are new words for Entdecker | `04-regelgarten-C.png`, 37 words | **replace with Open Duck RL** (§5): 256 ducks learn to walk; you shape the reward |

### 3.3 Greifwerkstatt (03 · GREIFEN)

| Station | You do | A F J S M P | Fun | Learning | Friction | Evidence | Upgrade |
|---|---|---|---|---|---|---|---|
| **A Gelenke** | crank 3 joints to thread 3 rings; then target mode (IK) does it in seconds | 2 2 1 1 2 1 | **4** | **4** | joint selection (1/2/3 + A/D) is fiddly for the first minute; formulas on the backdrop; 51 words | `05-greifwerkstatt-A.png`, `18-banner-greifwerkstatt.png` („Gelenke – · IK 0:04“) | keep; show "Gelenke 1:42 · IK 0:04" side by side bigger, because that contrast *is* the lesson |
| **B Das Ei** | grip an egg by position (crack, slow-motion replay), then with a force sensor, then with force control; friction table | 2 2 2 2 2 1 | **5** | **5** | four tabs plus a friction table with three selectors; 59 words | `06-greifwerkstatt-B.png` | keep; make it the zone's ◆ station once C is retired |
| **C 200 Griffe ◆** | choose sensors, n, wear and vibration; press Start; watch eggs tally up; read the Wilson band | 1 1 1 0 0 0 | **2** | **2** | ≈ 34 s of watching for the stamp (n = 20 takes 8 s; n = 200 ≈ 18 s, `stationC.ts:791`); the same lesson as 06 A, 06 B and F2; 56 words | `07-greifwerkstatt-C.png` | **retire** (§5); move question cards 2 and 5 |

### 3.4 Lern-Dojo (04 · LERNEN)

| Station | You do | A F J S M P | Fun | Learning | Friction | Evidence | Upgrade |
|---|---|---|---|---|---|---|---|
| **A Vormachen** | push a block into a goal with a SCARA, by mouse, five times | 2 1 1 0 1 0 | **3** | **3** | 5 near-identical demos; PT-11: demos often end „Demo ohne Ziel“ and the overview camera hides the push direction; 48 words | `08-lern-dojo-A.png`; RELEASE §3 | **SO-101 with a leader arm** (§5): the real LeRobot way of recording demos; 3 demos for ★ |
| **B Nachmachen ◆** | train, watch the policy copy you (wobble included), move the block where you never were, see it fail, add 2 demos, see it succeed | 1 2 1 2 1 1 | **4** | **5** | hotkeys V/P/T/Space; state is lost on reload (RELEASE §3); the "brain window" explains a VLA while a k-NN runs (honestly labelled) | `teleop.ts`; lesson „Es hat dich gelernt“ | keep the arc on the SO-101; add a **spoken instruction** step that makes it a VLA lesson (§5) |
| **C Datensatz-Audit** | find 35 dead episodes in a wall of 250, filter, retrain, evaluate (n = 100), compare the bands; a hidden second defect earns ★★★ | 2 1 1 1 1 1 | **3** | **4** | five-step flow; the bands often overlap, so you evaluate again; abstract tiles | `09-lern-dojo-C.png`, 44 words; eval 2.8 s per 100 (`audit.ts:31`) | keep; could show **SO-101 community-style episodes** (thumbnails of arm clips) instead of abstract sparklines |

### 3.5 Dunkelfabrik (05 · ARBEITEN)

| Station | You do | A F J S M P | Fun | Learning | Friction | Evidence | Upgrade |
|---|---|---|---|---|---|---|---|
| **A Schicht** | carry 18 kg crates at 41 °C for 60 s, racing the cell arm; heartbeat and vignette | 2 2 2 1 2 1 | **4** | **4** | carrying is just pick up with E, walk, set down with E; ★★★ is 9 crates | `20-banner-dunkelfabrik.png` („Du 3 · Roboter 0 … Die Nacht hat 480 davon.“) | keep; with Startklar, the crates become **cargo for the first flight** |
| **B Schichtplan & Waage** | drag the year to 2030 and place 3 robot types on empty posts; then run a payback balance over 6 years | 1 1 1 0 1 0 | **2** | **3** (Entscheider 4) | two consoles (42 and 38 words); k€, VZÄ and coverage %; little for a 14-year-old | `10-dunkelfabrik-B.png`, `11-dunkelfabrik-B2.png` | **one wall, three decisions**; the Waage is optional in Entdecker mode (§7 #14) |
| **C Licht aus ◆** | set L0–L4 per gesture (6 × 5 buttons), pull the lever, run the night in the dark, catch requests to intervene with Space | 2 2 2 2 1 1 | **4** | **4** | 62 words; jargon (RtI, MRC, L-levels); 30 level buttons | `12-dunkelfabrik-C.png`; `nacht.ts:35–37` (60 s night, 10 s per request) | keep; show the levels as 6 big dials, keep the „real L3–4“ tags |

### 3.6 Prüffeld (06 · MESSEN)

| Station | You do | A F J S M P | Fun | Learning | Friction | Evidence | Upgrade |
|---|---|---|---|---|---|---|---|
| **A Die Vorführung** | play the question cards you earned (keys 1–9) against a „100 %“ demo; each answer slaps a caveat on the sign | 1 2 1 1 1 1 | **3** | **4** | depends on cards earned elsewhere: on the Entscheider route (05 → 06) you arrive with 3 cards (7, 1, 3), so ★★ (5 cards) is out of reach in route order (`dunkelfabrik/index.ts:242`, `prueffeld/index.ts:262–268`) | `13-prueffeld-A.png`, 44 words | keep; hand out a 4th and 5th card on arrival in Entscheider mode, or set the stars by "cards held" |
| **B Unter Last ◆** | open the shutter, push the cell to the line (hold E), set the conditions, predict, measure 200 grasps; the sign flips to 69 % ± 6 | 2 2 2 1 1 1 | **4** | **4** | six steps before the first number | `14-prueffeld-B.png`, `15-prueffeld-C.png` (banner „69 % ± 6 % · n = 200 · 44 °C“) | keep; it absorbs the Wilson-band lesson of the retired 03 C |
| **C Drei Auditoren** | rate 12 clips with 6 tags, see κ with two auditors, set a rule, re-rate the ambiguous clips, print the report | 1 1 0 1 1 0 | **2** | **3** | 12 clips × about 4 s, two rounds (a 2× toggle exists); κ is abstract for Entdecker | `15-prueffeld-C.png`, 41 words | **shorten**: 6 clips, 2× by default, a κ needle in place of the number; optional in Entdecker mode |

### 3.7 Finale and ending

| Station | You do | A F J S M P | Fun | Learning | Friction | Evidence | Upgrade |
|---|---|---|---|---|---|---|---|
| **F1 Hand am Steuer** | steer the island's roll and pitch with the mouse for 15 s, with 150 ms of lag; crates slide | 2 2 2 1 1 2 | **4** | **4** | almost everyone fails (by design) | `kielraum.png`, F1 strings | keep; it is also the emotional set-up for the lift-off |
| **F2 Das Angebot** | read the protocol, predict the storm rate, watch 200 trials per controller fast-forwarded (≈ 20 s), read 2 × 3 bars | 1 1 2 1 0 1 | **3** | **4** | reading plus watching | `f2.ts` | keep; it now also decides how the lift-off flies |
| **F3 Empfehlung + „Ein Jahr später“** | fill a tile template (choice, reason tile, alternative), sign, then watch a 10 s calendar | 1 1 0 0 0 1 | **2** | **3** (Entscheider 4) | a form at the climax; the consequence is a table | GDD Phase 4/5 as-built | **the recommendation flies** (§6.6) |
| Ending | lift to the Ausguck, 20 s of dusk, certificate | 0 1 2 1 0 1 | **3** | **2** | passive; not a climax | GDD §6.6 | becomes the **lift-off** sequence |

### 3.8 Scoreboard

| Fun ↓ | Stations |
|---|---|
| 5 | 01 B Dunkelkammer, 03 B Das Ei |
| 4 | 01 A, 02 A, 02 B, 03 A, 04 B, 05 A, 05 C, 06 B, F1, jump pads |
| 3 | 01 C, 02 C, 04 A, 04 C, 06 A, F2, Libelle, capsules, tower, ending |
| 2 | **03 C 200 Griffe, 05 B Schichtplan & Waage, 06 C Drei Auditoren, F3**, ascent |

Zone stations average **Fun 3.5** and **Learning 3.8** of 5. Learning is the stronger half, and the weak fun stations are the ones where the player watches, not where the lesson is hard.

---

## 4. Cross-cutting findings

| # | Finding | Evidence | Consequence for Phase 7 |
|---|---|---|---|
| F-01 | **No stakes and no world change.** The island flies from second 0, and finishing a zone changes only meta UI. | §2.1, §2.2 | the lift-off spine (§6) |
| F-02 | **Rewards inform but do not empower.** 9 systems; stars unlock nothing; EMI skills are cosmetic. | §2.2 | three systems you can see, with unlocks (§6.4) |
| F-03 | **Watch stations cluster in C.** 01 C, 02 C, 03 C, 04 C (eval), 06 B and F2 all end in "press Start, watch". | §3; timing constants | replace 02 C and retire 03 C; shorten 06 C |
| F-04 | **One lesson, five times.** "n and an interval" in 03 C, 04 C, 06 A, 06 B and F2; nine prediction prompts. | §2.3, §2.4 | keep it in 06 B and F2 (and 04 C as data quality); keep at most one prediction per zone |
| F-05 | **Objectives are instructions, not requests.** „Station A: Fädle mit der Armspitze alle drei Ringe ein.“ The zone EMIs explain; they never want anything. | `strings.ts` `obj.*`, `emi.enter` | one request per zone, with the island's need (§6.2) |
| F-06 | **Failure is less funny since Z2.** The Sensordom A wrong-view press is now ignored. | DECISIONS engineering notes | a harmless gag miss with no star cost |
| F-07 | **The first try sometimes fails by design** (02 A on Earth / 1 m; F1). That is good as a lesson, but a skill toy should give the first success early. | probe `02-regelgarten-A.png` (0.91 s) | open 02 A on an easy setting |
| F-08 | **The screen carries up to five cards** (objective, compass, result banner, EMI subtitle, operate panel) when a banner is still up as the next console opens. | `11-`, `12-`, `15-`, `18-*.png` (probe, banners from solve hooks) | one voice at a time: the banner collapses to a slim strip when a console opens or EMI talks |
| F-09 | **The grab verb is unused.** It was built in Phase 1 and no station needs it. | QA-22 | showroom payload test, handing objects to SO-101 or EMI |
| F-10 | **The order matters, but nothing tells you.** Prüffeld A needs cards from four other zones; the Entscheider route cannot reach ★★ there. | §3.6 | hand out cards on arrival in Entscheider mode, or set the stars by "cards held" |
| F-11 | **"Humanoid" is a banned word** (GLOSSARY: robot class, banned-words list), but the founder now asks for Unitree humanoids. | `docs/GLOSSARY.md:76, :136` | founder question Q6: allow "humanoider Roboter" for third-party robots; EMI stays "kognitiver Roboter" |

---

## 5. Weakest stations and what replaces or upgrades them

**Rule: replace, don't add.** The Entdecker route is already 60–90 min (title promise, not yet timed with people, RELEASE §2). Every new real-robot station should take the slot of a weak one that teaches the same idea, so the route does not grow.

| Weak station (fun / learning) | Why | New content that takes the slot | What stays (lesson, stars, cards) | Honesty |
|---|---|---|---|---|
| **02 C Tausend falsche Welten** (3 / 3) | 32 s of replay; abstract pendulums | **Open Duck Mini RL station: „256 Enten lernen laufen“.** Open Duck Mini is an open, ≈ 42 cm biped inspired by Disney's BDX, trained to walk with RL in simulation (MuJoCo, moving to MuJoCo Playground), Apache-2.0 (§11). You set three reward weights (forward speed, staying upright, energy), watch a wall of ducks wobble and fall (funny reward hacks: hopping, crawling), then transfer one policy to the real duck on the deck while a gust hits (sim-to-real) | domain randomisation, sim-to-real gap, the album entry; the "your setting vs. training" reference line; ★★ / ★★★ on your own reward choice | live browser RL of a 3D biped is not realistic: use precomputed checkpoints per generation (chip "vorab trainiert, Wiedergabe") or a planar walker model; never call a replay "live training" |
| **04 A Vormachen** (3 / 3) and the SCARA in **04 B** | 5 identical demos; unclear push direction (PT-11) | **SO-101 teleop with a leader arm.** The SO-101 (TheRobotStudio with Hugging Face, Apache-2.0) is recorded the LeRobot way: a leader arm drives the follower (§11). You move the leader (mouse IK) and the real SO-101 model follows; 3 demos for ★. B keeps the arc *train → copies you → fails where you never were → 2 demos fix it*, and adds a **language instruction** step („Leg den orangen Würfel in die Schale“), so the brain window really describes a VLA. SmolVLA (450M parameters, trained on LeRobot community datasets, evaluated on SO-100/SO-101, takes language plus images plus state) is the real-world reference (§11) | „Es hat dich gelernt“; distribution shift; question cards 6 and 8 | the in-game policy stays a toy (k-NN or scripted), labelled as today („So ist ein VLA aufgebaut. Hier läuft ein einfacher Nächster-Nachbar-Imitator.“) |
| **03 C 200 Griffe ◆** (2 / 2) | the most watched station; its lesson is repeated elsewhere | **Retire.** Move question cards 2 and 5 to 06 B (on the first n = 200 run) and to 04 C; 03 B (egg) becomes the zone's ◆ station. The freed time pays for the SO-101 and Open Duck stations. Optional: a short **SO-101 "Greif-Probe"** in the same cabinet if the zone feels thin | the Wilson-band lesson lives on in 06 B and F2; the 3D-ViTac egg figure can move to the egg card | — |
| **06 C Drei Auditoren** (2 / 3) | slow, κ abstract | **Shorten**: 6 clips, 2× by default, a κ needle; optional in Entdecker mode. Not a slot for new content | the rule-before-rating lesson; question card 1 | — |
| **05 B Schichtplan & Waage** (2 / 3) | dense economics | **Simplify** (one wall, three decisions); the Waage is optional in Entdecker mode. Could later borrow a showroom robot as a "token" | Entscheider decisions with consequences | — |
| *(new)* **Unitree humanoid world-model area** | — | A ladder from the smallest to the hardest: **R1** (1230 mm) → **G1** (1320 mm) → **H1** (about 180 cm) → **H2** (1820 mm, 31 DoF), sizes from the official pages (§11; R1 is the smallest of these four, other Unitree models not checked). Mechanic „Erst träumen, dann gehen“: the robot's world model shows ghost futures for 2–3 candidate actions, you pick one, reality runs, and the gap between dream and measurement is shown and grows with the horizon. Bigger robots and longer tasks need longer horizons, so the H2 is the master test | Messung statt Marketing: a dream is a prediction, the run is the measurement | Unitree's own world model UnifoLM-WMA-0 is **CC BY-NC-SA 4.0** (non-commercial, §11): it cannot be used in a company's public game; the in-game "world model" must be EmAI's own toy model, labelled |
| *(new)* **Showroom** | — | Tower foyer as a "car centre": real robots on turntables, a height wall with EMI (1.55 m) and your eye height, spec cards with a new chip „HERSTELLERANGABE“ next to what was measured in-game. A sourced card that teaches on the spot: G1 arm max load "about 2 kg", which "varies greatly under different arm extension postures" (unitree.com/g1), links straight to 03 A's „Frag nach dem Lastdiagramm“ | reward hub (§6.4) | keep real vendors out of the "Hersteller X" critique (Q5) |

**Placement on the island (six lobes stay six zones):** SO-101 lives in the Lern-Dojo, Open Duck in the Regelgarten, the showroom in the tower foyer (visible from minute one), and the humanoid area on the Landedeck or under the Ausguck. The humanoid area is not a seventh zone, so the hexacopter stays "six lobes = six zones".

---

## 6. Quest structure: „Startklar“ toward the lift-off

### 6.1 Spine in five sentences

The Schwebewerk is a flying island, but it does not fly today: it sits grounded in its dock, its six thrusters cold. The first thing you do is press start, and it fails: the island lifts a hand's breadth, tilts, and sinks back while six system lamps turn red. Each lamp is one zone, and each zone gives you one request from its EMI, explaining why the island cannot fly without it. Finishing a zone runs that lobe's thruster test (Mn online) where you stand: you hear, see and feel it. When all six are green and you have audited the vendor's controller and signed your recommendation, the island lifts off with the controller you chose.

The island, M1–M6, Hersteller X and NN-Lage v2 stay **FIKTION**; the control loops stay real (README honesty rules).

### 6.2 Six thrusters, six requests

| Zone | What the island needs | Request (EMI-0x, ≤ 12 words) DE / EN | Reward you see |
|---|---|---|---|
| 01 Sensordom | sensors that see glass and black | „Die Insel landet blind. Zeig mir, was meine Sensoren übersehen.“ / “The island lands blind. Show me what my sensors miss.” | M1 test run; landing lights on the lobe |
| 02 Regelgarten | a fast attitude controller | „Ohne schnellen Regler kippt die Insel beim Start. Stell ihn ein.“ / “Without a fast controller the island tips at take-off. Tune it.” | M2; the Libelle readout switches from BODEN to LAGE |
| 03 Greifwerkstatt | a gentle service arm | „Der Wartungsarm greift zu fest. Bring ihm Gefühl bei.“ / “The service arm grips too hard. Teach it a feel.” | M3; the giant arm stows the egg and salutes |
| 04 Lern-Dojo | an arm that learns from you (SO-101) | „Zeig dem Arm die Handgriffe. Dann macht er’s dir nach.“ / “Show the arm the moves. Then it copies you.” | M4; the SO-101 hands you a part |
| 05 Dunkelfabrik | cargo aboard, a night shift that runs | „Die Ladung für den Erstflug muss an Bord. Wer schleppt nachts?“ / “The cargo for the first flight must go aboard. Who hauls at night?” | M5; the palettes roll into the hold |
| 06 Prüffeld | the habit of measuring before trusting | „Hersteller X verspricht 100 %. Bevor wir fliegen, messen wir.“ / “Vendor X promises 100 %. Before we fly, we measure.” | M6; the sign keeps your measured value |

Rule: the request is the zone's first line (it replaces `emi.enter`); the existing objective lines stay as step instructions. „du“ in both modes; no new factual claims.

**Thruster test (the per-zone reward):** after the zone's last stamp (Entdecker) or its ◆ station (Entscheider, see Q2), with the player still in the zone: rotor spool-up sound, the lobe trembles, dust or spray at the rim, camera shake ≤ 0.1 (none under reduced motion), and a toast „Triebwerk M3 geprüft · Greifwerkstatt“ / “Thruster M3 tested · Grip Workshop”. On the tower collar the zone lamp goes green, and the tower still draws its lines as today. HUD: „Startklar 3/6“ replaces the Pass cover counter as the headline.

### 6.3 The first five minutes

| t | rc4 (measured) | Proposal |
|---|---|---|
| 0–25 s | ascent through the clouds onto the flying island | ≤ 15 s approach to the **grounded** island in its dock (skippable; returning players skip it as today, D13) |
| 26–42 s | walk to the Libelle, EMI-01 greets | in control at the dock; EMI-01: „Die Insel sollte längst fliegen. Drück den Startknopf.“ / “The island should be flying by now. Press the start button.” |
| 42 s | **first mechanic:** gust button, the ball rolls out and back | **first mechanic: Probestart** (hold E on a lever): thrusters spool, the island rises ≈ 0.3 m, rolls a few degrees, sinks back with a thud; six lamps on the tower collar go red one after another, each labelled SEHEN … MESSEN |
| 44–49 s | „Gefangen. Die Insel ist ein Roboter …“, Pass handover | EMI-01: „Sechs Systeme rot. Sechs Zonen. Bring sie auf Grün.“ / “Six systems red. Six zones. Turn them green.”, then „Dann heben wir ab.“ / “Then we lift off.” The Pass appears as the "Startliste" (cover: 0/6) |
| 57–62 s | jump pad → Sensordom | the same (target first zone ≤ 65 s; `onboarding-run.mjs` keeps measuring it) |
| 1–5 min | Sensordom A | the same; the first stamp turns the 01 lamp **amber** („in Arbeit“), so the progress is visible after 2–3 minutes |

The hook line („Die Insel ist ein Roboter – und du stehst drauf.“) moves to the lift-off, where it is earned. The Libelle stays as an instrument: it reads BODEN until the Regelgarten's thruster M2 is online and shows the live LAGE from then on (§6.2).

### 6.4 Rewards and unlocks: from nine systems to three you can see

| Keep, visible | What it is | What it unlocks |
|---|---|---|
| **Thrusters (Startklar n/6)** | zone completion | KIEL at 4/6 (as today at 4 zones); **lift-off** at 6/6 + F3 signed |
| **Stars → robots** | your mastery (D8 still awaits the founder) | showroom deliveries: robot crates arrive by drone and are unboxed on a podium (R1 early; G1 at ≈ 15 ★; H1 after the lift-off; **H2: see §6.5**) |
| **Sensorkapseln → position lights** | exploration | the rim lights are needed for the **night flight** after the lift-off: with 12/12 the island flies with its full ring of lights (no gate, just a visibly better ending); the Turmsprung stays |

Folded in, not removed: tower lines (they are the thruster progress on the tower), question cards (the tools of 06 A and F2), album (a "Pannen-Wand" in the showroom), EMI-01 skills (EMI-01 uses them in the lift-off prep: carries a crate, checks a sensor), Prognose-Güte and personal bests (Pass and certificate).

### 6.5 The humanoid ladder (start small, earn the H2)

| Step | Robot (official size) | Unlocked by | Task idea („Erst träumen, dann gehen“) |
|---|---|---|---|
| 1 | Unitree R1, 1230 mm | first thruster online (≈ minute 8–10) | walk to EMI across the deck: pick one of 3 imagined 1 s futures |
| 2 | Unitree G1, 1320 mm | 3 thrusters | carry a light box along a path while a gust hits: 2 s horizon |
| 3 | Unitree H1, about 180 cm | after the lift-off | balance on the deck in flight: the dream drifts, so you re-measure |
| 4 | **Unitree H2**, 1820 mm | ★★★ on steps 1–3 **and** ≥ 40 / 54 ★ (threshold to calibrate) | the master test: a long task where you must re-plan when dream and measurement part |

The gate is mastery, never luck or a single dexterity trick. No learning content sits behind the H2; it is the trophy.

### 6.6 Finale → lift-off

| Beat | Today | Proposal |
|---|---|---|
| F1 | hold the island by hand for 15 s | the same, now as the last test before the start ("can a human hold it at take-off?") |
| F2 | audit NN-Lage v2 over 200 trials per controller | the same; the numbers now decide how the lift-off feels |
| F3 | sign a tile template, then a 10 s calendar | sign, and **the recommendation flies**: Pilot → NN flies; in a scripted gust during the climb the island shudders hard but holds (no crash, ever). Pilot mit Auflage → the gust triggers a visible fallback to Bestand („RÜCKFALL AUF BESTAND“). Kein Pilot → Bestand flies steadily. All three lift off; the rates on the HUD come from your F2 run (SIM · LIVE), the gust is FIKTION. „Ein Jahr später“ becomes the optional „Erstflug-Protokoll“ |
| Ending | lift to the Ausguck at dusk, certificate | the **lift-off** (its staging belongs to the lift-off research): through the cloud deck at dusk; EMI-01: „Sechs von sechs. Startfreigabe von dir.“ / “Six of six. Your call for take-off.”, the player gives the go (E), then „Gefangen. Die Insel ist ein Roboter – und du stehst drauf.“ as the first line in the air; the certificate follows on the Ausguck |

### 6.7 Entscheider route (≈ 25 min)

Proposal: showroom (2 min: read one real spec card with its condition) → 05 C Licht aus ◆ → 04 B SO-101 VLA ◆ → 06 B Unter Last ◆ → 02 B Riese ◆ → F2 + F3 → lift-off. That is four zone stations as today plus the showroom; 05 A and 06 A become optional. How many thrusters this route turns green is Q2.

### 6.8 Text diet, round 2

- A console shows **≤ 35 visible words at open** (all words, legends included; today 37–77, `stations.json`). The best-time grid, histograms and formulas sit on a second tab or on the world screens.
- **One voice at a time:** while EMI speaks or a console opens, the result banner shrinks to a one-line strip (value, stars, [R], [H]).
- **One prediction per zone** at most (today 9 prompts over 6 zones and the finale).
- Requests ≤ 12 words; banner lessons ≤ 14 words, as today.

---

## 7. Top 15, ranked by impact / effort

Impact: H (changes how the whole game feels or what it teaches), M (one zone). Effort: S (≤ 2 days in one lane), M (≈ 1 week or two lanes), L (new 3D assets or a new system). Lanes as in PHASE6-PLAN: CORE, WORLD, ZONES, BUILD.

| # | Change | Why (evidence) | Impact | Effort | Lane | Depends on |
|---|---|---|---|---|---|---|
| 1 | **Zone requests** as the first line of every zone (§6.2) | F-05: objectives are instructions | H | S | ZONES | wording sign-off |
| 2 | **Thruster test per completed zone** plus the „Startklar n/6“ tracker | F-01, F-02 | H | M | WORLD + CORE | #3's premise |
| 3 | **Grounded start with the failed Probestart** and six red lamps (§6.3) | F-01; the founder's brief | H | M | WORLD + CORE | the lift-off research (island start state) |
| 4 | **F3 decides how the lift-off flies**; „Ein Jahr später“ → optional „Erstflug-Protokoll“ | §3.7: F3 fun 2 | H | M | CORE (finale) | #3, the lift-off staging |
| 5 | **Showroom as the reward hub**: deliveries by stars and thrusters, H2 under a cover from minute one, chip „HERSTELLERANGABE“ | F-02; the founder's "car center" | H | M (+ L assets) | WORLD + CORE | the model-licence research |
| 6 | **Retire 03 C 200 Griffe**; cards 2/5 → 06 B and 04 C; 03 B becomes ◆ | §3.3: fun 2, learning 2; F-03, F-04 | M | S | ZONES | Q4 |
| 7 | **Shorten 06 C**: 6 clips, 2× by default, κ needle; optional in Entdecker mode | §3.6: fun 2 | M | S | ZONES | — |
| 8 | **First success first**: 02 A opens on 2 m / Moon; 01 A wrong-view gag miss without star cost | F-06, F-07 | M | S | ZONES | the founder's star rule for 01 A |
| 9 | **01 C: EMI-02 reaches** at the chosen distance and grips or misses; one prediction | §3.1 | M | S | ZONES | — |
| 10 | **One voice at a time** and consoles ≤ 35 visible words | F-08; `stations.json` | M | S | CORE + ZONES | — |
| 11 | **Open Duck RL** replaces 02 C (§5) | §3.2: 02 C fun 3; the founder's RL ask | H | L | ZONES + BUILD | the Open Duck asset research, a sim feasibility spike |
| 12 | **SO-101 leader-follower teleop + language instruction** in 04 A/B (§5) | §3.4: 04 A fun 3, PT-11; the founder's VLA ask | H | L | ZONES + BUILD | the SO-101 asset research |
| 13 | **Humanoid ladder R1 → G1 → H1 → H2** with „Erst träumen, dann gehen“ (§6.5) | the founder's world-model ask | H | L | new lane + WORLD | the Unitree asset research, Q3 |
| 14 | **05 B: one wall, three decisions**; the Waage optional in Entdecker mode | §3.5: fun 2 | M | M | ZONES | — |
| 15 | **Use the grab verb**: showroom payload test (stack weights on a scale next to a robot's spec), hand parts to the SO-101 or EMI | F-09 | M | M | CORE + ZONES | #5 |

Items 11–13 are what the founder asked for. They rank lower only because of their effort; the plan should start them first, because their assets and licences take the longest to settle.

---

## 8. Keep list (do not touch while restructuring)

- 01 B Dunkelkammer (glass bump, lights, fusion, time trial). 03 B egg crack and slow-motion replay. 02 A balancing and the Earth controller demo. 02 B the falling giant. 04 B "it learned you". 05 A the crate minute against the robot. 05 C lights out with the MRC alarm. 06 B shutter, push, sign flip. F1.
- Jump pads (only E launches, preview arc), the tower drawing your progress, the capsules and their rim lights, the Funk-Log, D13's resume at the last zone.
- The result banner with [R] retry and [H] Warum?, goal chips before an attempt, no automatic cards in Entdecker mode.
- Source chips on every number, "du" everywhere, no prices and no customer names, Stars rate your play and never a robot (D8), the nine questions.

---

## 9. Questions for the founder

1. **Where does the island wait before the lift-off?** In a dock at sea level below the cloud deck (the lift-off breaks through the clouds), on the cloud sea anchored low, or on a mountain plateau? *Recommended:* the dock below the cloud deck, which gives the strongest before/after.
2. **What powers a thruster in Entscheider mode (≈ 25 min)?** (a) The whole zone, as in Entdecker mode, so a route reaches at most 4/6. (b) The zone's ◆ station, with the route covering 4 zones and two thrusters marked „ungeprüft“ at the lift-off. (c) The ◆ station of every zone, with a route of six ◆ stations (about the same length as today's six stations). *Recommended:* (c), because one rule covers both modes and it keeps the lift-off honest and complete.
3. **How hard should the H2 be to get?** (a) ★★★ on the three earlier humanoid steps plus ≥ 40 / 54 ★. (b) Everything, including 12/12 capsules. (c) One very hard skill challenge open to anyone after the lift-off. *Recommended:* (a), because it rests on mastery and method, not luck or completionism.
4. **May "200 Griffe" (Greifwerkstatt C) be retired, and "Drei Auditoren" (Prüffeld C) shortened**, to make room for the real-robot stations? *Recommended:* yes; their lessons stay in 06 B, F2 and the shortened 06 C.
5. **Real robots in the „Hersteller X“ critique?** *Recommended:* no. Real robots appear only with sourced specs (chip „HERSTELLERANGABE“) and as playable stations; the "100 % demo" vendor stays fictional, so no real brand is implied to overclaim.
6. **May the copy say "humanoider Roboter" for third-party robots?** Today "humanoid" is a banned word (GLOSSARY). *Recommended:* allow it for the Unitree robots only; EMI stays a "kognitiver Roboter".

---

## 10. Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| The grounded start touches every opening system | ascent, Libelle („LAGE 0,04°“), telemetry strip, Glasbalkon plaque „180 m“, ending ride and finale story all assume a flying island; rc4 must not be rewritten | change the state, not the systems: a `grounded` flag that the Libelle, telemetry and plaques read; ship the start state first, then the lift-off |
| "Finish all quests" vs. a 25-min Entscheider route | the lift-off must reach both audiences | Q2 |
| New stations make the route longer | 60–90 min is already the promise and is not yet timed with people | replace, don't add (§5); time it with two first-time players (RELEASE §2) |
| Browser RL is not feasible live | a 3D biped trained in JS in real time at 256 instances would break the 500-draw-call / 1.5 M-triangle budget and the CPU budget | precomputed checkpoints with an honest chip, or a planar walker model; a feasibility spike before committing |
| Licences and weight of real models | UnifoLM-WMA-0 is CC BY-NC-SA 4.0 (non-commercial); meshes can be large, and the first load is 1.68 MB today | the asset research owns licences; lazy-load real models per zone or showroom; simplify meshes at build time |
| Real brands next to a fictional overclaiming vendor | could read as an accusation against a real company | Q5: keep them apart |
| Hard H2 gate frustrates | a learning game must not lock learning behind skill | the gate rests on mastery, with a practice path; the H2 holds no lesson the others lack |
| Making stars functional raises the stakes of D8 | stars would now unlock robots | founder confirmation of D8 before the build |
| Scores are not yet validated by people | headless evidence only | run the RELEASE §2 "fun, by watching" sessions on rc4 before locking the plan |

---

## 11. Sources

Accessed 2026-10-17. Repository paths refer to `rc4` (`cba388c`).

| Claim | Source |
|---|---|
| First mechanic 42.0 s, first zone 61.6 s, 6 EMI lines (DE Entdecker, real keys, ascent watched) | this report's run: `artifacts/phase7/quest-review/onboarding-de.log`, `…/onboarding/run-de-entdecker/log.json` |
| Visible words per console (37–77) and the screenshots cited as `NN-*.png` | `artifacts/phase7/quest-review/stations-entdecker/stations.json` and PNGs; probe `artifacts/phase7/quest-review/probe-stations.mjs` |
| Prose words, lessons, EMI lines per zone, 0 automatic cards | `artifacts/release/text-audit/de-entdecker.json` |
| Messstrecke: 12 readings/s, carriage 1.5 m/s | `src/zones/sensordom/messstrecke.ts:35–37` |
| Weltenwand replay 4 s per generation, 8 generations | `src/zones/regelgarten/wall.ts:4, :19` |
| 200 Griffe: 0.4 s per trial for the first 20, then ×0.8 per trial down to 0.05 s | `src/zones/greifwerkstatt/stationC.ts:791` |
| Datensatz-Audit: n = 100, ≈ 2.8 s per evaluation | `src/zones/lern-dojo/audit.ts:30–31` |
| Licht aus: 60 s night, 10 s per request to intervene | `src/zones/dunkelfabrik/nacht.ts:35–37` |
| Question cards awarded by station | `src/world/questions.ts`; `awardQuestion` in `dunkelfabrik/index.ts:242`, `prueffeld/index.ts:262–268`, `greifwerkstatt/stationC.ts:704–705`, `regelgarten/giant.ts:745`, `lern-dojo/teleop.ts:1295–1296`, `sensordom/messstrecke.ts:481` |
| Earth configuration not holdable with 0.25 s reaction; thresholds calibrated with bots | `docs/GDD.md` §7 as-built Phase 4 and 5 |
| Sensordom A wrong-view press ignored (Z2), star rule awaiting the founder | `docs/DECISIONS.md` (engineering notes), `docs/PHASE6-PLAN.md` Z2 |
| PT-11 „Demo ohne Ziel“; Lern-Dojo state not saved; human checks open | `docs/RELEASE.md` §2, §3 |
| Grab controls unused in the shipped zones | `docs/QA-PHASE4.md` QA-22 |
| "Humanoid" banned; EMI is a "kognitiver Roboter" | `docs/GLOSSARY.md:76, :136`; `docs/GDD.md` §2 |
| SO-101: next version of SO-100, designed by TheRobotStudio with Hugging Face, works with LeRobot, leader arm for teleoperation and follower arm, Apache-2.0 | https://github.com/TheRobotStudio/SO-ARM100 |
| SmolVLA: 450M parameters, trained on LeRobot community datasets, evaluated on SO-100 and SO-101, takes language, images and robot state; published 2025-06-03 | https://huggingface.co/blog/smolvla |
| Open Duck Mini: miniature of Disney's BDX droid, ≈ 42 cm with legs extended, BOM under $400, walking learned with RL in MuJoCo (switching to MuJoCo Playground), runs on a Raspberry Pi Zero 2W, Apache-2.0 | https://github.com/apirrone/Open_Duck_Mini |
| Unitree R1: 1230 mm, about 27–29 kg, 20–40 DoF by version, from $4,900 (R1 AIR) | https://www.unitree.com/R1 |
| Unitree G1: 1320 mm, about 35 kg, 23 DoF (EDU 23–43), $13.5K, arm max load about 2 kg (EDU about 3 kg), "varies greatly under different arm extension postures" | https://www.unitree.com/g1 |
| Unitree H1: height about 180 cm, weight about 47 kg | https://www.unitree.com/h1 |
| Unitree H2: 1820 mm (stand dimensions 1820 × 456 × 218 mm), about 70 kg, 31 joints | https://www.unitree.com/H2 |
| UnifoLM-WMA-0: Unitree's open world-model-action framework, code and weights released 2025-09-15, data from Z1 and G1 | https://github.com/unitreerobotics/unifolm-world-model-action |
| UnifoLM-WMA-0 licence: CC BY-NC-SA 4.0 (non-commercial) | https://raw.githubusercontent.com/unitreerobotics/unifolm-world-model-action/main/LICENSE |
| "R1 is the smallest" | **unverified beyond these four models**: smallest of R1 / G1 / H1 / H2 by the official pages above; other Unitree humanoids not checked |
