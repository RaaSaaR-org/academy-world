# C2 · Plan critique: founder brief, fun and learning

Critique of `docs/PHASE7-PLAN.md` (draft, 2026-10-17) and the Phase 7 rows of `docs/DECISIONS.md` (D15–D39 and the lead's engineering notes). Role: creative director and learning designer, guardian of the founder's brief. Date: 2026-10-17. This file changes no other file and commits nothing.

**Read:** the plan and DECISIONS in full; R5 and R6 in full; R1 §10, R2 §6–§7, R3 §3 and §5, R4 §0–§3, R8 §2, §4.6 and §5, R9 §5 (targeted); FUN-PLAN §2; RELEASE §2. **Code checked:** `src/world/sky.ts`, `src/world/tower/structure.ts`, `src/world/layout.ts` (`LIBELLE`, `ATTRACT_CAMERA`), `src/core/RenderSystem.ts:312` (camera), `src/world/index.ts` (`toyGust`), `src/zones/lern-dojo/strings.ts`.

**Limits.** Nobody played anything for this report. Visibility claims are computed from the code and the plan's coordinates. Route minutes compare the plan with the research reports' own minute-by-minute estimates, and those estimates are unmeasured design guesses too.

---

## 0. Verdict in one screen

**The plan is strong where it counts.** The founder's main idea is turned into a real quest spine: grounded start, failed Probestart, six rotors, F3 flies the lift-off. Every named robot is real and has a home. Weak rc4 stations are retired or cut down. The honesty rules are kept everywhere. Leave these alone:
- the Trockendock and the rule that the world moves, not the island;
- the request line per zone;
- the ignition beat;
- the H2 rule, which is exactly D21;
- the Lastdiagramm prediction („gestreckt ≈ 0 g“, the best new twist in the plan);
- the duck's hack stickers;
- the H2 „Ablehnen“ capstone;
- the people with jobs.

**What does not yet match the brief:**
1. **B1:** a flying sister island can be on screen in minute one. The rc4 sky dressing has no owner and no rule for the grounded state.
2. **The climax looks thin as specified.** The „region waves“ beat depends on SO-101 arms about 1 px tall. The Probestart's six red lamps sit about 20–30° above the top of the player's view.
3. **The solarpunk look and the „nice future“ lesson are missing.** The founder asked for both explicitly. The plan never uses the word solarpunk, drops R8's art rules (§4.6) and learning goals (§5), and tells the Revier backstory on one plaque.
4. **Route time is optimistic.** Four of the new areas are budgeted below their own research estimates, so Entdecker lands at about 106 min, not 96. The plan's pass rule (85–105 min) breaks the founder's 80–100.
5. **The decision-maker route** reaches only the SO-101 out of the founder's four real-robot asks, and none of the farm, showroom or use cases.
6. **New stations bring back watching.** rc4's weakest pattern (set, press Start, watch) returns in several of them, and no rule or tool limits it.

**Buildable by parallel builders?** Wave 1: yes, once B1 has an owner and a timing session is added. Wave 2: not as written. The content WPs would faithfully build the problems below. Fold the MAJOR fixes into WP5, WP6 and WP9–WP15 before wave 2 starts (§8).

---

## 1. Brief coverage: every founder ask, and how much weight it gets

Weight = minutes on the objective route (Entdecker / Entscheider) and tier. ✓ covered well · ◐ covered but under-weighted or flawed · ✗ missing.

| Founder ask (brief 1, brief 2, answers) | Where in the plan | Entd. / Entsch. min | Tier | Status | Finding |
|---|---|---|---|---|---|
| Don't show the flying island at the start; it is the goal | §1.2, §2, §3, D22 | spine / spine | MUST | ◐ the concept is right; the sky dressing breaks it | **B1** |
| Lift-off after all quests, epic, futuristic, cool | §4.15, D23–D24 | 3.2 / 2.5 | MUST | ◐ strong timeline; key beats can't be seen; „all quests“ = 6 ◆ | **M2, M3, M12** |
| Better quests | §4.1–§4.7, §4.16 (R6 top 15) | — | MUST | ◐ rc4 fixes adopted; new stations re-add watching and overload | **M6, M9** |
| More open-source projects like SO-101 and the duck | WP0 | — | — | ◐ only the two named examples; LeKiwi demoted to COULD | **M10** |
| Use the real objects, don't rebuild them | D15, WP0 | — | MUST | ◐ yes for robots; farm crate rovers stay procedural although R8 found an open real one | **M10** |
| VLA with the SO-101 | §4.5 Lern-Dojo | 11.5 / 4.5 (◆) | MUST | ✓ (B overloaded) | **M9** |
| RL with the duck (walking) | §4.3 „Lauf, Ente!“ | 6.5 / optional | MUST | ◐ Entdecker ✓; Entscheider ✗; heavy on watching | **M6, M7** |
| World models with a humanoid, Unitree, smallest first | §4.8 Traumhangar | 11.0 / optional | MUST | ✓ ladder R1 → G1 → H1-2 → H2 (C overloaded) | **M7, M9** |
| H2 very hard; D21 rule; ghost practice | §3.1, §4.8 | off-route | MUST | ✓ matches D21 (pool nuance m5) | m5 |
| Car-dealership showroom: real models; size, abilities, payload | §4.9 Schauhalle | 2.0 / optional | MUST | ◐ 2 min on the route; robots static; Lastenheft off the route | **M8** |
| Price bands with source and date (D17) | §4.9 | — | MUST | ◐ 13 of 20 robots show „auf Anfrage“ | **M8**, m4 |
| Use cases in the area | §4.11 | 9.5 farm / optional | MUST | ✓ farm + 2 scenes (the 2 scenes are watch stations) | **M6** |
| Life in the world; 6–10 faceless people with jobs (D18) | §4.12 L1–L19, 8 people | ambient | MUST | ✓ | — |
| Easter eggs; Fundvitrine; never gate (D35) | §4.13, 9 MUST | ambient | MUST | ✓ (the first-find cue is weak) | m6 |
| Agrivoltaic SO-101 tomato farm, raised beds, PV on top, fully automated, tomatoes and energy | §4.10 Sonnenacker | 9.5 / optional | MUST | ✓ (show the honest numbers next to each other) | m3 |
| Solarpunk, but not too much | — | — | — | ✗ no art rules in the binding plan | **M5** |
| Players learn how we get a nice future | — | — | — | ✗ no synthesis, no take-home line | **M4** |
| „Das Revier“: reclaimed open-cast mining, dock in the last pit (D19) | §4.1 plaque, D19 terraces, lake | — | MUST | ◐ one plaque; the only landmark (monument) is SHOULD | **M4** |
| No internal EmAI numbers (D20) | §4.5, §4.8 | — | — | ✓ the Labornotiz from R3 is correctly left out | — |
| Entdecker ≈ 80–100 min | §1.3 = 96 | — | — | ◐ about 106 by the research estimates; pass rule 85–105 | **M1** |
| Entscheider ≈ 25–30 min | §1.4 = 29 | — | — | ◐ pass rule ≤ 32 | **M1** |

---

## 2. Findings, ranked

### BLOCKER

**B1 · A flying island can be on screen in minute one: the rc4 sky dressing has no owner and no rule for the grounded state.**
- *Plan:* §5.3 rule 2: „Altitude h is applied to: the ground root (y = −h) and every ground-frame zone root (its children); the slab (base/top − h) and `cloudY` (top − h → −180 airborne); `sunBlocked()`; the fog mode.“ §4.15, 72–80 s: „sister platforms and cargo copters“ appear as the reveal. §5.1 and §6.1 list an owner for every island file except `src/world/sky.ts`.
- *What is wrong:* `sky.ts` places everything relative to an island that is already flying:
  - three near sister platforms (`island:near-islets`). One sits at bearing 205°, 420 m, deck at y +8: about 22 m wide, hovering 8 m above the Dorf, right behind the spawn. The title orbit (`ATTRACT_CAMERA`, r 190, starting at 200°) looks across it within about 100 s.
  - three far Prüfinseln (`island:far-islands`, y −66 … −85: inside the terrain);
  - 30 wisps (y −95 … −40).

  Nothing in the plan hides, moves or reveals them. So either a hovering sister island greets the player on the title screen, which breaks the founder's first ask („dass wir die ‚fliegende Insel‘ am Start nicht zeigen“), or platforms are half buried in the Revier. During the climb they would also rise with the island instead of appearing at the break-out, which kills the fleet reveal of C2.
- *Fix (≈ 0.5 day):*
  - Add rule 2b to §5.3: „Sky dressing (sister platforms, Prüfinseln, wisps) lives in a sky frame at y_rc4 + (570 − h) and is hidden while the eye is below the slab top; it fades in over ≥ 2 s after the break-out (t ≥ 67 s). The cargo copters and rescue drones stay as ground-frame life under the cloud bank.“
  - Add `src/world/sky.ts` to WP2's *Owns*; WP13 drives the reveal.
  - Acceptance: `ending-check` asserts 0 visible `island:near-islets` / `island:far-islands` in the title and every grounded survey view; `liftoff-check` asserts that their first visible frame comes after the break-out.

### MAJOR

**M1 · Route time: the plan sits below its own research, and its pass rules break the founder's windows.**
- *Plan:* §1.3 „≈ 96 min … The route visits every station“. §8.2 pass: „Entdecker median 85–105 min“. Entscheider „median ≤ 32 min“.
- *What is wrong:* four new areas are budgeted below the research's own minute-by-minute estimates, with no content cut to explain the gap:

  | Area | Plan | Research estimate |
  |---|---|---|
  | Regelgarten incl. duck | 14.0 | ≈ 17.5 (duck ≈ 10, R2 §6.8) |
  | Lern-Dojo | 11.5 | ≈ 13 (R1 §10.6) |
  | Traumhangar | 11.0 | ≈ 15 (R3 §5.7) |
  | Sonnenacker | 9.5 | ≈ 11 (R8 §2.4 + travel) |

  Those gaps add about +10 min, so the route lands at about **106 min**. The rc4 base itself was never timed (RELEASE §2: „Timing of both routes … open“). Visiting every station is the cause: R6's rule „replace, don't add“ retired 2 stations, but the route gained 6 (Sonnenacker 3, Traumhangar 3) plus the hall. The pass rules sit outside the founder's windows (105 > 100; 32 > 30).
- *Fix:*
  1. Pass rules **80–100 min** and **≤ 30 min**, with design targets **≤ 94** and **≤ 27** to leave room for first-timer overhead.
  2. Make the objective route „every ◆ plus the stations the lesson chain needs“. **05 B** and **06 C** (both fun 2 in R6) become signposted side stations (grey objective chip; their stars still count). R6 already asked for 06 C to be optional in Entdecker mode.
  3. The trims in M6/M9 (duck early stop, 04 B with two cards, Traumhangar C simplified).
  4. Pre-commit the second cut tier: duck C3 retraining becomes the ★★★ path; Traumhangar B Messlauf drops to 3 horizons.
  5. A **timing session in wave 1**: two first-time players on rc4 plus the grounded start, a stopwatch per station. It recalibrates §1.3 before wave 2 is sized.

  Proposal tables in §3.

**M2 · The lift-off is well timed but, as specified, its most moving beats can't be seen, and the player does almost nothing.**
- *Plan:* §4.15 row 22–42: „The region reacts | every SO-101 on the farm raises its gripper and waves 2 s; crew waves; the flock flushes | — | —“. Interaction: „E at the launch console, then hold E for thrust above 100 %“. Cut order (7): „the C2 outside shot (keep C1)“.
- *What is wrong:*
  - An SO-101 is about 0.43 m long (R4 §2.1). The farm is about 296 m away. At 72° vertical FOV (`RenderSystem.ts:312`) the arm is about 0.08°, which is **≈ 1 px at 1080p**, and the far tier draws it as a 2 Hz proxy anyway. People at 120–300 m are 5–12 px.
  - The beat has no line, and C1 takes 8 of its 20 s.
  - The founder's farm, the robots and the Revier, the emotional payoff of 90 minutes, do not register.
  - After the hold at 18–22 s the player only watches for about 100 s.
  - C2 is the only shot of the whole island in sunlight above the cloud sea with its fleet. It is the image of „epic, futuristic and cool“, and it is cut before most content.
- *Fix (all S, WP13 plus small hooks in WP9, WP14 and WP15):*
  1. **Tracker wave („Schutzstellung“):** the Revier's single-axis PV rows stow flat in a ripple moving out from the dock as the downwash front passes. That covers Sonnendach A/B, the Schauhalle roof and the island's Allee rows; each row is ≈ 36 m, about 7° and 100 px at 300 m. It is honest: real trackers stow in high wind, and Sonnenacker B teaches „Schutzstellung bei Hagel“. Each row turns over ≥ 2 s, and the sun glints stay single ramps (flash gate).
  2. **People and robots in C1's foreground:** the dock crew, the Werft mechanic and the two visitors walk to the apron edge before the console opens. The bridge-head Winke-Arm (egg 13) waves in C1. That makes the waving SO-101 visible.
  3. **One line for the beat** (EMI-01, ≤ 18 words): DE „Da unten war eine Grube. Jetzt wachsen dort Tomaten und Strom.“ / EN “Down there was a pit. Now tomatoes and power grow there.” (see M4)
  4. **Real throttle:** while E is held at 18–30 s, thrust shows 105 %. Releasing E holds the island at T = W, and the climb pauses. a = (T − W)/m stays live on the card. That makes the physics card a control.
  5. **[C] Außenkamera:** the player may call C1 during the rise window and C2 after the break-out (≤ 10 s each). Without input, the cuts play as planned. A cut you chose is also easier on motion-sensitive players.
  6. Move C2 below item (8) in the cut order.
  7. Scale the show with completion (M12): each trim online adds its Recamán note a(6…9) = 13, 20, 12, 21 to the spin-up chord. A missing trim leaves an audible gap and a checklist line „T3 aus · Sonnenacker“.

**M3 · The Probestart, the first-minute hook, happens outside the frame.**
- *Plan:* §1.2 ≈ 27 s: „the world sinks 0.3 m (the island rises), tilts 2.2–2.9°, … the six crown beacons turn red in order, labelled SEHEN … MESSEN“.
- *What is wrong:*
  - The crown beacons sit at y ≈ 49.8 on an 8.4 m radius (`structure.ts:364–386`). The lever stands at (−3.3, 0, 22.7) (`LIBELLE` centre (0, 0, 19)).
  - From the lever the six beacons sit at **57–73° elevation**. With a 72° vertical FOV and pitch +6°, the top of the frame is at **+42°**.
  - So all six red lamps, and their labels, appear 15–31° above the top of the view. The Ausguck floor may hide them too.
  - The 0.3 m rise is 0.17° at the apron 100 m away, so nobody sees it.
  - What remains is a tilt and a sound. The founder's „goal“ moment („six systems red“) is told, not seen.
- *Fix (S, WP12):*
  1. Six lamps on the Libelle plinth at eye height, driven by the same instance colours as the crown and labelled SEHEN … MESSEN. They turn red one by one under the player's eyes. The crown repeats them for everyone else. The lamps don't touch the mark's clear space (D10).
  2. The rc4 Libelle ball rolls out and back, a near-field instrument for the tilt.
  3. A puff of slot spray at the two southern lobes plus a rotor cough (sound).
  4. EMI-01 after the lamps: DE „Schau hoch: Die Lampen am Turm zeigen es allen.“ / EN “Look up: the lamps on the tower show everyone.”

**M4 · „How we get a nice future“ is never designed, and the Revier backstory is one plaque.**
- *Plan:* §4.1 plaques: „Das Revier: Früher wurde hier im Tagebau gegraben. Trockendock 3 liegt in der letzten Grube.“ The bucket-wheel monument is SHOULD (WP16). R8 §5 „Learning goals: what a player should take home about a good future“ is not cited anywhere in the plan.
- *What is wrong:* the founder asked twice for the learning goal („so the players learn how we get a nice future“). The best story for it is already in the founder answers: a mining pit turned into food, power and repair. The plan keeps that story to one FIKTION plaque behind the spawn, and nothing pulls the threads together:
  - Sonnenacker: tomatoes and power from one field;
  - Kreislaufhof: repair before rebuilding;
  - Unkrautacker: weeding without poison;
  - people deciding.

  A player can finish without ever hearing the sentence the founder wants learned.
- *Fix (≈ 1.5–2.5 days, WP14, WP13, WP18):*
  1. A plan section „Was du mitnimmst“ that copies R8 §5's Entdecker table (energy, food, work, resources, honesty), so every content WP knows its share.
  2. **Three touchpoints:**
     - the bridge-head plaque (kept);
     - the lift-off line (M2-3);
     - a back side of the certificate, „Was du unten gesehen hast“, with three lines that show only for sites the player stamped. Example: „Ein Acker, zwei Ernten: Tomaten und Strom.“ / “One field, two harvests: tomatoes and power.”
  3. Promote one cheap Revier landmark to MUST: the generic bucket-wheel monument, or a mining-terrace cut with a „Grubenrand“ marker by the Hofladen. Without it the backstory is invisible.
  4. A Hofladen board „Revier-Chronik“ with three FIKTION panels (Grube → See → Acker), no dates and no real places, as §4.1 already requires.

**M5 · Solarpunk, but not too much: the binding plan has no art rules for it.**
- *Plan:* the word does not appear. §6.1 G-LOOK: „(3) optionally the Sonnenacker at eye level (block-out)“. R8 §4.6 („solarpunk, but believable“: 10 rules, ground palette tokens, do/don't) is never cited, although the plan calls itself binding and the research for reference only.
- *What is wrong:* the founder named this look explicitly („very futuristic (solarpunk) – but not too much“). WP9, WP14 and WP16 will build the whole region without a rule set. That risks generic sci-fi props, jungle green, or a grey industrial park. The farm, the founder's favourite, is the one still that is optional at the look checkpoint.
- *Fix (≈ 0.5 day of plan text, WP3, WP9, WP14):*
  1. A §2.7 „Look of the Revier“ that adopts R8 §4.6 rules 1–10 and its tokens word for word.
  2. Two lines on „futuristic“, so the restraint doesn't make it dull. **Futuristic signals allowed:** cargo copters crossing under the cloud bank (rc4 `sky.ts` copters, already in the ground frame by B1), robots visibly at work, rail, tracking PV, the dock arms. **Not allowed:** holograms, glowing plants, megastructures, flying cars.
  3. Make G-LOOK still (3), the Sonnenacker at eye level, **mandatory**. The founder approves the region look on the image that matters most to them.

**M6 · Watching returns: several new stations repeat rc4's weakest pattern, and nothing caps it.**
- *Plan, by spec:*
  - duck C2 „Start runs 10 generations“ (R2 §6.3, 4 s replay each = 40 s per run, about 3 runs for ★★), then C3 20 + 20 runs and 10 retrain generations;
  - Traumhangar B „Messlauf 20 runs per horizon (0,5 / 1 / 2 / 4 / 8 s)“;
  - Traumhangar C „offline … then … closed-loop, n = 20 per arm“;
  - 04 C „evaluate n = 50 on two fixed conditions … for raw and cleaned data“;
  - Sonnenacker B „a season runs in 20 s … read crop light, tomato yield, kWh, LER and the DIN check“;
  - Unkrautacker „watch 50 plants each (2 min)“;
  - Kreislaufhof „set the delta picker's confidence threshold, 100 items, read purity and recovery“.
- *What is wrong:* R6 F-03 measured exactly this, „set values in a panel, then watch“, as the cluster of fun-2 stations. „Messung statt Marketing“ needs measuring, but measuring doesn't have to mean waiting. The plan has budgets for words (≤ 35) but none for unattended seconds.
- *Fix:*
  1. **Rule** in §4 conventions: „Unattended time (no input required or offered) ≤ 10 s per stretch and ≤ 20 % of the station's minutes. Every replay after the first viewing runs at 2×, Space = 4× / jump to result.“
  2. **Tool:** `tools/watch-audit.mjs` (WP7). It logs input-free intervals per station in the playtest bots' runs and fails above the rule.
  3. **Station fixes (S each):**
     - Duck: stop a training run early when a hack is detected (the sticker is the payoff). Reward cards stay live between generations, so a change shapes the next one. Push the hero duck during replays.
     - Kreislaufhof: the threshold is a live slider while the belt runs, so purity and recovery move under your hand.
     - Unkrautacker: steer the laser weeder yourself for 20 s on the first field before choosing for the other two.
     - Sonnenacker B: drag the table model's sun lamp across the day by hand. The crop-light and kW gauges pull against each other, then the 20 s season runs for the prediction.
     - Traumhangar B: 3 horizons, run in parallel ghosts.

**M7 · The Entscheider route touches one of the four real-robot asks, and none of the farm, the showroom or the use cases.**
- *Plan:* §1.4 six ◆: 05 C, 06 B, 01 C, 02 B, 03 C, 04 B. Duck, Traumhangar, Schauhalle and Sonnenacker are „optional Entscheider detours“.
- *What is wrong:* decision-makers are EmAI's commercial audience, and in 2026 synthetic data and world models are what they get sold. On route they see the SO-101 (04 B, 03 C) and the lift-off: no RL, no world model, no real robot at true scale, no price band, no farm. The Schauhalle sits on the ring between 02 and 03, so the route walks past its door.
- *Fix (≈ 2 days, WP11 with recordings from WP5 and WP10):* a **3-minute Schaufenster stop on the route** between 02 B and 03 C:
  1. the Größenwand (30 s);
  2. the G1 datasheet with its payload condition and price band (30 s);
  3. two „Kurzlauf“ stands of 45 s each, from recordings with their own Befundkarte: the duck reward hack (Vorwärts only → belly flop → fixed) and the Traumdaten offline trap („Stillstand gewinnt offline“). Both cards exist in R2 §6.7 and R3 §5.6.

  Pay for it: 04 B Entscheider with two Störungskarten instead of four (−1 min), 05 C with A skipped by default (−0.5), 06 B shorter setup (−0.5). The route stays at about 29.5 min (§3.2). Alternative for the founder: make 02 C the ◆ in Entscheider mode only. Not recommended: it breaks D23's one rule.

**M8 · The showroom is under-weighted, static, and mostly „auf Anfrage“: not yet the founder's car dealership.**
- *Plan:* §1.3 step 4: „first visit, two deliveries … 2.0“. Lastenheft: „not on the route“. Turntables „one turn per 40 s“. Price bands: „all others ‚auf Anfrage‘“ (13 of 20). Probefahrt only „on SO-101, Open Duck and the Unitree four: a button sets the objective to their station“.
- *What is wrong:* the founder wants to „view them and learn how big they are, **what they can do**, what they can lift … like a car center“.
  - In Entdecker mode the hall gets 2 minutes on the route.
  - Its only starred learning (Lastenheft) and the Kistenwaage are off the route.
  - 14 of 20 robots never move, so „what they can do“ is a text line.
  - Sixty-five percent of the price plates say „auf Anfrage“. D17 explicitly rejects „no prices“, and R4 §1 allowed QUELLE (secondary, dated sources) for values the vendor does not publish.
- *Fix:*
  1. **First visit becomes 4 min with one Lastenheft round** (jobs drawn from the robots already standing), the Größenwand and the Kistenwaage warm-up („Wer nimmt die 18-kg-Kiste?“).
  2. **„Vorführung“ loops (≈ 2 days, WP11 on WP0's `play(clip)` / `setPose`):** on approach, each plinth robot plays a 6–10 s joint clip of what it is for. Spot sits and stands, the gripper opens and closes, the Shadow Hand counts to five, the FANUC sweeps, the MiR250 docks its top module. Chip „Bewegung animiert“, as in the hangar. This is the test drive of a car dealership.
  3. **Price bands from dated secondary sources:** WP18 looks for a dated public source per „auf Anfrage“ robot (distributor list, press, public tender award). Where one exists, the plate reads „auf Anfrage · {Band} laut {Quelle}, Stand {Datum}“ (QUELLE). Only the rest stay „auf Anfrage“, with one explanation line on the card for the lesson (wording sourced by WP18).
  4. A category pylon **SELBST BAUEN** next to GEHEN and GREIFEN & FAHREN, grouping the open-source robots with their parts cost (see M10).

**M9 · Overloaded stations and duplicated lessons: one station, one idea is slipping.**
- *Plan, by station:*
  - §4.5 04 B: „four Störungskarten … Neue Lage, Anderes Wort, Abendlicht, Kamera angestoßen; rescue …; ‚Helligkeit variieren‘ …; ‚Kamera festschrauben‘“ (5 min, the longest island ◆).
  - §4.5 04 C lesson: „Eine Zahl ohne Bedingung ist keine Zahl. Messung statt Marketing.“
  - §4.8 C: „200 Träume fills a wall of 40 visible tiles … reject tiles … train three arms … measure first offline … then … closed-loop“ in 3.5 min (R3 estimated 5).
  - §4.10 A: colour under the panels.
- *What is wrong (lesson map, §4):*
  - **04 B** teaches three ideas: words, positions, and operations (light, camera).
  - **Abendlicht** duplicates Sonnenacker A („Farbe allein lügt bei anderem Licht“), and in route order the farm comes first.
  - **04 C** keeps rc4's data-cleaning activity, but its lesson is now a fifth copy of the condition idea (03 C, 06 B, F2, Lastenheft). rc4's matching lesson „Erst die Daten prüfen, dann trainieren.“ (`lern-dojo/strings.ts:231`) was dropped.
  - **Traumhangar C** repeats 04 C's verb (find the bad tiles in a wall) and adds a second idea, all in 3.5 minutes.
- *Fix:*
  - 04 B keeps „Neue Lage“ and „Anderes Wort“. „Abendlicht“ and „Kamera“ become ★★★ discovery cards. 5 → ≈ 3.5 min, and it saves WP6 work.
  - 04 C lesson back to rc4's „Erst die Daten prüfen, dann trainieren.“ / “Check the data first, then train.”
  - Traumhangar C: 8 dream tiles as a quick „spot the physics error“ (≈ 30 s, keeps the fun of the floating crate). Then the decision and the Stillstand trap. Then one closed-loop run that you **pilot** with the H1-2 before the n = 20 batch. Lesson unchanged.

**M10 · „More open-source projects“ and „use the real objects“: the plan stops at the founder's two examples and demotes the third real one.**
- *Plan/DECISIONS:* „Farm crate rovers reuse rc4's service-rover geometry (LeKiwi is a COULD), so all robots stay inside the 4 MB cap of D31.“ §5.6: „≈ 3.95 MB (tight: LeKiwi stays COULD)“.
- *What is wrong:* the founder said „i like to have more open source projects like the so101 arm and the open micro duck“. R8 §2.1 chose **LeKiwi** (an open mobile base carrying an SO-101, Apache-2.0 [R8 S28]) as the farm's crate rover. The plan swaps it for a procedural stand-in on the very farm the founder designed. That is the „rebuild“ the founder ruled out.
- *Fix:* LeKiwi becomes MUST as a **base-only** GLB; the arm is the shared SO-101 file. R8 estimated ≤ 0.3 MB for the whole robot (estimate), so the base alone should be well below that; WP0 measures it. If the 4 MB cap is still hit, drop the KUKA LBR iiwa 14 exhibit. It is amber, and it duplicates the cobot category (UR5e, FR3). The SELBST BAUEN pylon (M8) shows SO-101, LeKiwi and Open Duck with their parts cost, linked to egg 15 „Werkbank der Offenen“. ToddlerBot (MIT, R4 §5.1) stays the reserve for a fourth.

**M11 · Fun is first judged by people in wave 3, when the content is already built.**
- *Plan:* §8.2 „Fun and time, round 1 and 2 | 5–6 first-time players“ with no wave given. The only human session in wave 2 is „Controls“ (day 6). Human sessions sit in WP19 (wave 3). R6 §10 asked to „run the RELEASE §2 ‚fun, by watching‘ sessions on rc4 before locking the plan“.
- *What is wrong:* all station minutes, star thresholds and the „epic“ claim are unmeasured. If the duck or the hangar turn out slow or confusing, the finding arrives after their builders have moved on to fix duty.
- *Fix:*
  1. Wave 1: the timing session from M1.
  2. Wave 2, day 8: one full Entdecker route with block-out art by 2 first-time players, measuring minutes, where they retry by choice and where they stop reading.
  3. Wave 3: a **WP-FUN** of ≈ 4 builder-days that tunes the ten key moments by watching people: Probestart, first ignition, 6/6, duck belly flop, „it picks blue“, the first humanoid step, the 18 kg refusal, the Herztomate, the first delivery, the lift-off.
  4. Each content WP reserves ≈ 15 % for juice and feel (sound, popups, timing), as the Phase 4 fun pass did.

**M12 · „After the player finishes all quests“: the ◆-only gate leaves the farm and the hangar off the critical path, and the farm's request claims a need the game doesn't have.**
- *Plan:* D23 (six ◆ + F3). §3.2 Sonnenacker request: „Die Insel braucht Proviant und Strom. Hier wächst beides – fast allein.“ D27: farm stamps „not for the rotors (it powers trim rotor T3, cosmetic)“.
- *What is wrong:*
  - An Entdecker player can lift off after 6 of the 30 stations. The founder's two dearest new places (farm, Unitree hall) can be skipped without consequence.
  - The farm's first line says the island *needs* its power. That contradicts the cosmetic trim, and it hints that a 1.5 ha field powers the flight, which a sharp player will call marketing.
  - The founder's words („after the player finishes all quests“) and D23 differ. That is fine as a default, but it should be put to the founder in those words.
- *Fix:*
  1. Founder decision list: state it plainly (§7).
  2. Scale the lift-off with completion, never gate it:
     - trims add chord notes and spray plumes (M2-7);
     - „geprüft“ rotors get the steady halo;
     - stamped sites send their people and robots to the apron for C1 (M2-2);
     - 12/12 capsules give the full ring at night (planned).

     The ending is visibly richer for the player who did everything, and „Start wiederholen“ shows the difference.
  3. EMI-08 request (≤ 12 words): DE „Proviant für den Erstflug. Hier wachsen Tomaten und Strom auf einem Acker.“ / EN “Food for the first flight: tomatoes and power from one field.” The T3 checklist line gives the causal fiction: „T3 · Sonnenacker: Proviant an Bord“.

### MINOR

| # | Plan quote | Problem | Fix |
|---|---|---|---|
| m1 | §3.2 M3 line „M3 läuft. Ein Ziel, sechs Drehzahlen – wie die inverse Kinematik am Arm.“ | M3 ignites on the new ◆ Lastdiagramm, but the line teaches 03 A's IK | DE „M3 läuft. Last nah am Körper tragen – das gilt für Arme und Inseln.“ / EN “M3 is running. Carry the load close in: true for arms and islands.” |
| m2 | §1.2 „Bring sie auf Grün.“; §3.3 ready = teal #2DD4BF; §4.8 „teal = prediction, orange = reality“ | the lamps never turn green; teal means „ready“ on the tower and „dream, not real“ in the hangar | DE „Sechs Systeme rot. Sechs Zonen. Bring sie zum Leuchten.“; add a one-line colour table to §4 conventions (teal = live data and systems online; the hangar ghost keeps teal but carries the chip TRAUM) |
| m3 | §4.10 C „Ernte 50/60 · 83 % … Ø 25 s“ vs the QUELLE card „66 % Erfolg, 33 s pro Frucht“ | a $122 hobby arm beats the 50-robot research average on screen; reads as capability, not as the result of the bed and the player's deleafing | the result banner shows the reference beside the player's value: „Forschungsmittel 66 % · 33 s (Bac et al. 2014) · hier: Beet für den Roboter gebaut, entlaubt“; add a card that links to the Lastdiagramm: „Die Früchte hängen 25 cm vom Beetrand: kurzer Hebel für den Arm.“ (MODELL) |
| m4 | §4.9 „G1, H2, Stretch 3 … ‚10.000–50.000‘“ | R4 §3: H2 US$ 29,900 (vendor) vs ≈ US$ 90,000 (reseller); the trophy robot hides the conflict | show both, as with the stall-torque band: „10.000–50.000 (Hersteller) · Händler bis ≈ 90.000 (QUELLE, Stand …)“ |
| m5 | §3.1 „F1, the H2 Generalprobe and secrets never count.“ | the founder said „75 % of all stars in the game“; F1 has stars; the Pass totals may disagree | include F1 in the pool (84 → 63), or label the Pass „Stationssterne ★ 47/81“ |
| m6 | §1.2 6–12 s „waves back if you wiggle the view 3× (egg 13, H0)“ | wiggling is not discoverable without a cue; with only the 9 MUST eggs the R9 §5.2 rates give ≈ 4.8 expected finds, below the median ≥ 5 target | the arm waves at you first as you pass; wiggling is the reply (true H0); keep one SHOULD egg (1 or 25) in MUST if the audit shows < 5 |
| m7 | §4.8 „First person = the robot's head camera“; §8.2 photosensitivity covers „dream glitches“ only by review | no comfort spec for walking first person; `liftoff-check` measures only the lift-off | head camera stabilised (no gait bob, horizon level), chase camera default under RM; run the flash counter on the Traumhangar glitch wall, the C3 hack slow motions and the Sonnenacker hail front (no lightning) |
| m8 | §4.3 / §4.5 / §4.7: ◆ is B in 02, 04 and 06 | the ignition beat (the zone's climax) fires before C; goal-driven players walk away from the duck | after a B-◆ beat, EMI points into the zone: DE „M2 läuft. Jetzt die Ente – sie soll laufen lernen.“ / EN “M2 is running. Now the duck: it has to learn to walk.” |
| m9 | §4.9 „M6 MESSEN → Boston Dynamics Spot (amber)“; Kistenwaage „MiR250 top plate, Spot's rails“ | a legal „no“ on the amber models would remove a rotor reward and 2 of 3 Kistenwaage points | build mechanics on green models: M6 MESSEN → Franka Research 3 (a torque sensor in every joint); Kistenwaage points on the FANUC hook, ANYmal D's payload rails and the UR5e; amber robots stay plain exhibits |
| m10 | §1.3 steps 8–10: 05 → 06 → KIEL | about 11 min of statistics (06 B/C, F2, F3) right before the climax | 06 C as a side station (M1); make the 6/6 beat a spectacle: all six plumes at once, the crown and the Libelle lamps pulse teal, EMI „Sechs von sechs.“ |
| m11 | §4.12 L7 people are all on the ground | the island has no humans; „Vollautomatisch heißt nicht menschenleer“ stops at the dock | the dock crew member rides to the Ausguck and stands at the rail during the lift-off (reuses the figure) |
| m12 | §1.5 „Left to do, airborne“ | the ground is gone once you fly; nothing links the two | a cargo copter (rc4 `sky.ts`) brings a Sonnenacker crate to the Tomatenkapsel every Hof-Takt loop while airborne (cosmetic, 0 new assets) |

---

## 3. Route re-budget (proposal; to be replaced by the wave-1 timing)

### 3.1 Entdecker

| Step | Plan | Research estimate | Proposal (objective route) | Change |
|---|---|---|---|---|
| Arrival, Probestart, Pass | 1.0 | 1.0 | 1.0 | — |
| 01 Sensordom | 8.0 | rc4, untimed | 8.0 | — |
| Sonnenacker A·B·C + travel | 9.5 | ≈ 11 | 10.0 (A with 12 labels instead of 20) | founder's farm kept whole |
| 02 Regelgarten A, B ◆, C duck | 14.0 | ≈ 17.5 | 14.0 (duck early stop, 2× replays, C3 retraining = ★★★ path) | M6 |
| Schauhalle first visit | 2.0 | — | 4.0 (one Lastenheft round, Kistenwaage) | M8 |
| 03 Greifwerkstatt | 11.0 | — | 11.0 | — |
| 04 Lern-Dojo | 11.5 | ≈ 13 | 10.0 (B with two cards) | M9 |
| Traumhangar A·B·C | 11.0 | ≈ 15 | 12.5 (B 3 horizons, C simplified) | M9 |
| 05 Dunkelfabrik A, C ◆ (B side) | 9.5 | — | 7.0 | M1 |
| 06 Prüffeld A, B ◆ (C side) | 9.5 | — | 7.0 | M1 |
| Startprüfung | 6.0 | — | 6.0 | — |
| Lift-off, dusk, certificate | 3.2 | — | 3.2 | — |
| **Total** | **96.2** | **≈ 106** | **≈ 93.7** | inside 80–100 with ≈ 6 % margin |

Second cut tier if the wave-2 session measures > 100: duck C3 live retraining → recordings (plan cut 8); Traumhangar B Messlauf → 2 horizons; Sonnenacker B season without the hail.

### 3.2 Entscheider

| Step | Plan | Proposal |
|---|---|---|
| Arrival | 1.0 | 1.0 |
| 05 C ◆ | 3.5 | 3.0 (A skipped by default) |
| 06 B ◆ + travel | 4.0 | 3.5 |
| 01 C ◆ + travel | 3.0 | 3.0 |
| 02 B ◆ + travel | 3.0 | 3.0 |
| **Schaufenster** (Größenwand, G1 card, duck and Traumdaten Kurzlauf) | optional | **3.0** |
| 03 C ◆ + travel | 3.0 | 3.0 |
| 04 B ◆ + travel | 5.0 | 4.0 (two cards) |
| Startprüfung | 4.0 | 4.0 |
| Lift-off, certificate, Befundkarten | 2.5 | 2.5 |
| **Total** | **29.0** | **≈ 30.0**, and it reaches the SO-101, RL, world models, real robots at true scale and the price bands |

If 30 is too tight in measurement, take the 0.5–1 min from F2's reading (protocol tab collapsed by default), not from the Schaufenster.

---

## 4. One idea per station: lesson map

| Station | Idea (banner lesson, short) | Felt by | Status |
|---|---|---|---|
| 01 A / B / C | blind spots / glass is air / distance² error | gag miss / bump / EMI-02 reaches | ✓ |
| 02 A / B | longer pole, more time / measured late = corrected late | balancing / the giant falls | ✓ |
| 02 C | the duck learns what you reward | stickers | ✓; C3 adds robustness, keep it as the ★★★ path |
| 03 A / B / C | FK vs IK / control force / payload needs reach | crank vs click / crack / the arm sags | ✓ |
| 04 A / B | varied start poses / words only if words varied | demos / „it picks blue“ | ◐ B carries light and camera too (M9) |
| 04 C | **now** „number without condition“ | data cleaning | ✗ drift; back to „Erst die Daten prüfen“ (M9) |
| 05 A / B / C | hard work / payback depends on assumptions / autonomy is a share | crates / wall / alarm | ✓ (B a side station) |
| 06 A / B / C | demo ≠ measurement / 69 % under load / a rule makes a measurement | sign tags / flip / refusal | ✓ (C a side station) |
| F1 / F2 / F3 | 150 ms lag / 99 % only calm / decide with n | wheel / bars / the lift-off flies | ✓ |
| Sonnenacker A / B / C | calibrate colour / light is shared / automated ≠ nobody | card / gauges (M6) / help calls | ◐ A duplicates 04 B „Abendlicht“ until M9 is applied |
| Traumhangar A / B / C / H2 | dream knows only seen floor / horizon / offline ≠ good / dream ≠ datasheet | ice slip / dead end / Stillstand bar / refuse 18 kg | ◐ C also repeats 04 C's verb (M9) |
| Lastenheft | the condition decides | the deciding row lights | ✓ the synthesis of the condition spiral |
| Kreislaufhof / Unkrautacker | purity costs recovery / no poison, three prices | live slider (M6) / you steer the laser (M6) | ◐ watch stations as specified |

The condition idea appears five times (03 C, 06 B, F2, Lastenheft, H2). That is the brand's core, so keep it, but as a spiral: each banner names its own facet (reach, load, weather, datasheet, dream). No two banners should carry the same sentence.

---

## 5. More awesome at low cost (ranked by effect per day)

| # | Idea | Where / owner | Cost | Why |
|---|---|---|---|---|
| 1 | Tracker „Schutzstellung“ wave across the Revier at the lift-off | WP13 + tracker hook in WP9, WP14 | S | the region visibly answers, honest physics, solarpunk in one image (M2) |
| 2 | Six lamps on the Libelle plinth | WP12 | S | the minute-one goal becomes visible (M3) |
| 3 | People and the Winke-Arm at the apron edge in C1 | WP15 + WP13 | S | „the region waves“ made visible; people at the climax |
| 4 | Trims add Recamán notes a(6…9) to the chord | WP13 | S | completing the farm and the hangar is heard, never gated (M12) |
| 5 | „Da unten war eine Grube …“ line + certificate back side | WP13, WP18 | S | the nice-future lesson in two sentences (M4) |
| 6 | Hold-E throttle, [C] outside camera | WP13 | S | agency at the climax; a chosen cut is easier on motion-sensitive players |
| 7 | Duck early stop on a hack + live cards between generations | WP5 | S–M | stickers without the wait (M6) |
| 8 | Vorführung loops on the Schauhalle plinths | WP11 | M | „what they can do“ — the car-dealership test drive (M8) |
| 9 | LeKiwi carrying the farm trays + SELBST BAUEN pylon | WP0, WP9, WP11 | S–M | a third open-source robot where the founder wanted one (M10) |
| 10 | 6/6 spectacle beat | WP12 | S | a peak before the analysis stretch (m10) |
| 11 | The crew member rides to the Ausguck | WP15 | S | a human at the lift-off (m11) |
| 12 | A cargo copter brings Sonnenacker crates aboard while airborne | WP15 | S | ground and air stay linked after the flight (m12) |

Rough net effect of all MAJOR fixes and this list: about +12–16 builder-days of additions. The trims pay back about −4 (05 B rework not needed as a side station, 04 B two cards, hangar C simpler, F2 tab). Net ≈ +8–12 on ≈ 150 (≈ 6–8 %). Estimates, not measured.

---

## 6. Cut or shrink (over-scoped for its fun and learning value)

- **Traumhangar C as specified** (dream wall + three arms + offline + closed loop in 3.5 min): simplify (M9).
- **Lern-Dojo B's four Störungskarten:** two on the route, two as discovery (M9).
- **05 B rework** („one wall, three decisions“): as a side station, ship the lighter version; the Waage stays optional.
- **The amber four as mechanics:** exhibits only (m9). If the 4 MB cap binds, drop the iiwa 14 before LeKiwi.
- **Cut order changes:** C2 moves below (8). Add „never cut: the tracker wave and the C1 foreground people, the Schaufenster stop, the Libelle lamps“. These carry founder asks at almost no cost.
- **Not cut:** Unkrautacker. It is the „no poison“ part of the nice future and the sheep-under-PV image of the solarpunk look. Fix its verb (M6) instead of dropping it first.

---

## 7. Additions to the lead's founder decision list

1. **„After all quests“:** the lift-off needs the six island ◆ stations plus F3. In Entdecker mode that is 6 of 30 stations; the farm and the Unitree hall do not gate it, but they make the lift-off richer (more notes, plumes, people, guests). OK?
2. **Side stations:** 05 B and 06 C leave the Entdecker objective route (their stars still count) to keep the route inside 80–100 min.
3. **Entscheider Schaufenster:** a 3-minute showroom stop on the route with two recorded short runs (duck RL, world-model data), so decision-makers see the real-robot asks.
4. **LeKiwi** (open source) replaces the procedural farm rovers.
5. **Showroom prices:** dated secondary sources (press, distributor, tender award) for robots without a public list price, labelled QUELLE; otherwise „auf Anfrage“.
6. **G-LOOK:** two stills instead of one: the ground look (bridge head or Ausguck) and the Sonnenacker at eye level.

---

## 8. Verdict: buildable by parallel builder agents as written?

**Wave 1: yes, with two changes.** The WP split, the contract-first protocol, the shared-file rules and the frozen layout are sound, and nothing in my findings changes an interface in §5.2. Before wave 1 closes:
- assign `src/world/sky.ts` and the sky-frame rule (B1);
- add the rc4 timing session (M1, M11);
- make the farm still mandatory in G-LOOK (M5).

**Wave 2: not as written.** The content specs are detailed enough that builders will build them faithfully, and with them:
- the watch-heavy station flows (M6);
- the invisible lift-off beats (M2, M3);
- the overloaded 04 B and hangar C (M9);
- a region without art rules (M5) and without its lesson (M4);
- the procedural farm rover (M10);
- an Entscheider route that misses the founder's asks (M7);
- a route that runs past 100 min (M1).

About one day of plan edits fixes this: amend §1.3, §1.4, §2 (+ §2.7), §4.3, §4.5, §4.8–§4.11, §4.15, §7 and §8.2 per this file, and update WP5, WP6 and WP9–WP15 with the listed acceptance checks before wave 2 starts. With those edits the plan covers every point of the founder brief with real weight, and the climax is as big as the brief asks.
