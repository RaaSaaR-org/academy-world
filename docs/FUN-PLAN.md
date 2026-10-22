# Fun plan: from a guided museum to a learning game

Lead game design, phase 4 (2026-10-15), on `main` after `a67f603` (release candidate). This file is the brief for one implementation pass by five agents (core, tower, landscape, zones-a, zones-b). It does not change code.

The founder's request after playing the release candidate: *"can u review it - it somethimes lookes buggy. also umprove the design, it does not look futurisitc in the "trees" of the platform also makes no sense. also the logo on the tower could be improved … improve this all and make the game a real fun learn game"*.

This plan covers the last part: **make it a real fun learn game**. The look (trees, futuristic design) and the bug review are briefed separately. Where this plan touches them (the tower logo, the world features that replace the trees), it only defines the game hooks.

**Contents:** 0 Verdict · 1 Audit · 2 Principles · 3 Seed ideas · 4 Game-layer API (`ctx.game`) · 5 Core · 6 Tower · 7 Landscape · 8 Zones · 9 Entscheider mode · 10 Honesty, brand, new claims · 11 Priorities, order of work, acceptance · Appendix: how the audit was measured

## Status after the build (2026-10-15, release integrator)

Built by the five agents and verified on the integrated build (`docs/RELEASE.md` §1). **Done** = built and checked; **partly** = built with a deviation (see the note and GDD §7 "As-built deviations, Phase 4"); **not done** = not built.

| Item | Status | Note |
|---|---|---|
| C0 `ctx.game` API, persistence, events, hooks | Done | commit d45323c |
| C1 banner, fail flash, countdown, juice | Done | 9 cues in −18 … −9 dBFS |
| C2 Pass | Done | ★ per stamp, best, attempts, next goal, Warum?; ★ x/54, Kapseln, skills row |
| C3 card policy and text budgets | Done | 0 automatic cards in Entdecker; budgets in `tools/text-audit.mjs` |
| C4 first minute: play first | Done | Libelle gust button; first mechanic 41.7 s, first zone 60.2 s (ascent watched) |
| C5 EMI-01 radio | Done | quiet in the Kielraum and the ending (integrator fix) |
| C6 EMI skills | Done | Pass row, radio lines, skill demos by the foyer door (P2, simple props) |
| C7 F1 as a challenge | Done | |
| C8 F3 „Ein Jahr später“ | Done (Phase 5) | plays on the Messwand (operate camera, slim bar with source and buttons); rc2 had a modal over the lectern |
| C9 HUD and map | Done (Phase 5) | zone entry as a location card under the objective (QA-27); the map shows the Turmsprung once all capsules are found |
| C10 certificate | Done | |
| C11 tools | Done | playtest, perf (Kanzeln, juice view), onboarding-run, audio-levels, brand-check |
| §6.1–6.5 tower progress hook (elements, ghost, draw, trigger, reload) | Done | ghost arcs are brushed alu, not orange at 0.2 (DECISIONS D9 / ART-V2 Q1) |
| §6.6 finale switch-on and bow | Done | the sweep plays the next time the mark is seen from the front (the ending ride is on the north side); EMI-01's „Achtzehn von achtzehn …“ on the 18/18 sweep (integrator) |
| §6.7 foyer stars | Done | Lernpfad boards |
| §6.8 debug hooks, §6.9 budget | Done | Phase 5 relief: no extra meshes, 42.6k triangles (sculpture + arm + effects); `logo-check` / `logo-geom` hooks |
| §6.4 caption „// TURM · LINIE n/18“ | Not done | the banner's „Linie n/18 für den Turm“ carries it |
| W1 world capsules, W2 position lights, W3 mast stars | Done | |
| W4 Turmsprung | Done | |
| W5 toys | Partly | a PV row you knock off aim (Phase 5; was solar leaves), test fan, gust vanes; the 3 m hop pad is not built |
| S1–S3, R1–R3, G1–G3 | Done | R1 ★★/★★★ on Mars/Moon; Phase 5: an Earth fall is a lesson (the 1 kHz controller holds the same cart for 3.6 s). R3 Phase 5: ★★★ = your gains ≥ 90 % of 256 harder worlds (was all 256) |
| S4, R4, G4 capsules | Done | S4 Phase 5: under a black velvet cloth, revealed by the LIDAR or SEG crosshair within 9 m, as designed |
| L1–L3, D1–D3, P1–P3 | Done | D1 ★★★ = 9 crates; D2 ★★ „≥ 2 passt, kein Fehlgriff“ plus a „Neuer Plan“ button (Phase 5). Phase 5: L1 ★★ Ø ≤ 7 s / ★★★ Ø ≤ 5 s, L2 ★★ policy ≤ 5 s / ★★★ ≤ 4 s + rescue with two demos, P2 first run in studio light; calibrated with real-input bots (logs in `artifacts/phase5/zones/calib/`) |
| L4, D4, P4 capsules | Done | |
| §11.2 acceptance 4: 3 real-input attempts per ★★/★★★ threshold | Done with bots (Phase 5) | every threshold now checked with real Playwright mouse and keyboard input driven by bot player models; three human first-timers still pending (RELEASE §2) |
| D8 (stars) | Open | proposed in DECISIONS.md, awaiting the founder |

---

## 0. Verdict in one screen

**What works.** The island already has real toys:
- balancing a pole by hand (Regelgarten A, with a best-time table);
- walking blind through the LiDAR room and hitting invisible glass (Sensordom B);
- cracking an egg in slow motion (Greifwerkstatt B);
- carrying 18 kg crates against a 60 s timer (Dunkelfabrik A);
- switching the lights off and watching the night shift (Dunkelfabrik C);
- the robot copying your hesitations (Lern-Dojo B);
- the shutter reveal and the sign flip (Prüffeld B);
- the jump pads.

The science is careful and the facts are sourced.

**What makes it a museum.**
1. The first 85 seconds are watching and reading. The first real game mechanic is the jump pad at 85 s.
2. Fourteen modals open on their own after stations: 13 info cards plus the Dunkelfabrik shift report. They run 40–61 words in Entdecker mode and up to 77 in Entscheider mode, and each one stops play. Only the Lern-Dojo keeps its cards optional, behind its signs.
3. Operate panels show 55–131 words when they open.
4. Four of the six ★ measuring stations work the same way: configure, press Start, watch 20–40 s, read a Kennlinie.
5. There is no score anyone can see. 11 best values are stored, but only the Regelgarten shows them. No station has a target beyond its stamp, and almost none offers a reason to try again.
6. Exploring is not rewarded. The Ausguck, the Glasbalkon and the Kanzeln are views with nothing to find, apart from 6 hidden album entries.
7. Progress lives in a modal (Tab). The 48 m tower carries a static sticker of the logo that never changes.

**The fun pass in five moves:**
1. **Every station becomes a toy with a goal.** Each station gets 1–3 stars, a personal best and an instant retry ([R]), with a result banner that gives feedback straight away. The lesson becomes one line in the banner. The card moves behind "[H] Warum?". It stays one key away, but it is no longer forced.
2. **Your progress draws the logo.** A laser arm on the tower draws one Recamán element per stamp, and the arcs not yet earned stay as ghosts. The whole island sees your progress, and the finale "switches it on".
3. **Twelve Sensorkapseln to find.** They sit at the jump-pad apex, on the Ausguck, on the Kanzeln, in the zones and so on. Each one switches on a position light on the rim, and all twelve open the Turmsprung, a hop to the tower top.
4. **Play first in the first minute.** You trigger the gust at the Libelle yourself and watch the island catch itself. Only then does EMI say „Die Insel ist ein Roboter.“ You get the Pass at the Libelle, which brings the first zone from 90 s down to about 65 s.
5. **Entscheider decisions show their consequences.** You fill the empty posts in 2030 and see the payback. You set autonomy levels honestly, or overclaim and get a safe stop at 23:14. After signing in the finale, "Ein Jahr später" plays out your choice on your own numbers.

---

## 1. Audit (measured)

How it was measured is in the appendix. In short: real keyboard input for the first minutes and for walking into each zone, `__academy` helpers for the station panels, the release text audit for the cards, and a code read for scoring, retry and feedback. All runs were in DE Entdecker mode, with the Entscheider entries spot-checked.

### 1.1 The first minutes

Run: DE · Entdecker, ascent watched, real keyboard, `tools/onboarding-run.mjs`.

| t (s) | Beat | What the player does | Mechanic? |
|---|---|---|---|
| 0–25.7 | Ascent (skippable) | watches | no |
| 28.6 | EMI-01: „Das war ein Regelkreis. Die Insel ist ein Roboter …“ (13 words) | reads | no |
| 41.1 | Arrives at the Libelle; EMI-01 explains it (17 words), then introduces itself (13 words) | reads | no |
| 64.5 | E at the Pass terminal in the foyer; Pass modal opens; EMI line (14 words) | reads a menu | no |
| 70.7 | EMI: jump-pad hint (13 words) | reads | no |
| 85.4 | **E on the jump pad: first game mechanic** | flies | **yes** |
| 90.0 | First zone (Sensordom) | | |

Totals before the first mechanic: 5 EMI lines (≈ 70 words), 4 objectives (≈ 35 words), one Pass modal and a 22-word pad readout. The premise („Die Insel ist ein Roboter“) is told while the player watches. They never get to feel it.

### 1.2 Zone entry

Real W key held, view steered at the zone's objective, spawn at the gate. "Words shown" counts the zone's own EMI lines, objective, hints and status line before the first station focus.

| Zone | Entry → first station focus | Words shown first | First interactable | Visible words in that operate panel |
|---|---|---|---|---|
| 01 Sensordom | 4.9 s | 48 (+14 more at 14.6 s) | "Kabel am Boden markieren" | — (first person) |
| 02 Regelgarten | 2.5 s | 22 (+19 at 10.8 s) | "Balancier-Bahn bedienen" | **103** |
| 03 Greifwerkstatt | 5.1 s | 23 (+16 at 7.3 s) | "Gelenkarm bedienen" | 57 |
| 04 Lern-Dojo | 18.7 s (longest walk) | 24 | "Teleop-Pult bedienen" | 74 |
| 05 Dunkelfabrik | 6.3 s | 25 | "Kiste heben · 18 kg" | — (first person) |
| 06 Prüffeld | 4.3 s | 22 + question-card toast | "Frag den Hersteller" | **131** |

Getting to the first station is already fast, so that is not the problem. The problem is what happens there: dense panels, then a modal card.

### 1.3 Station by station

Types: **Toy** = skill input with live feedback · **Puzzle** = find or decide · **Watch** = configure, then watch a run · **Read** = text.

"Card" means an info card that opens on its own after the stamp, with its word count in DE Entdecker (release text audit). In §1, ★ is today's Entscheider core-station marker; from §4.6 on it becomes ◆, and ★ means rating stars.

| Station | Type today | Panel words at open | Card | Goal clear? | Score / challenge / reason to replay | Feedback juice | Exploration | Verdict |
|---|---|---|---|---|---|---|---|---|
| 01 A Messbrille | Puzzle | HUD column 8 + hint 14 | 43 | yes (list 0/5) | none | toast per tag, mode click | — | good find-game; wrong tries say nothing useful |
| 01 B Dunkelkammer | Toy | — | 47 | yes | time and contacts in the stamp only; no retry | thud, shake, lights reveal (great) | mirror album | **best "feel it" moment**; no reason to replay |
| 01 C Messstrecke ★ | Watch | 55 | 48 | yes (progress line) | none; prediction feeds Prognose-Güte | ticks per reading | — | museum: 4 runs, ≈ 20–35 s of watching |
| 02 A Balancieren | **Toy** | **103** | 52 | yes | **best-time table + PB toast**, R = retry | timer, clack | Moon | the most game-like station; panel too heavy |
| 02 B Regler & Takt ★ | Toy/Watch | 93 | 45 | yes | none | giant fall (great) | latency | strong "break it" moment |
| 02 C Tausend Welten | Watch | 58 | 61 | yes | none | wall settles | single-world album | museum: press Train, watch ≈ 32 s |
| 03 A Gelenke | Toy | 57 | 49 | yes | ring time stored, not shown | ring tick, servo whine | singularity album | good puzzle; no target time |
| 03 B Das Ei | **Toy** | 63 | 40 | yes | none | crack plus slow-motion replay (best juice in the game) | — | friction table feels like a form (3 lifts / 2 objects / 1 slip) |
| 03 C 200 Griffe ★ | Watch | 84 | 44 | partly | none | tally blips | — | museum: ≥ 3 runs, ≈ 40 s of watching |
| 04 A Vormachen | Toy | 74 | optional (sign) | yes (n/5) | none | ribbons into the cloud | — | fun but repetitive (5 demos) |
| 04 B Nachmachen ★ | Toy/Puzzle | (same pult) | optional | yes (5-step chips) | none | orange ribbon copies you | bad-demo album | **great lesson** ("es hat dich gelernt") |
| 04 C Datensatz-Audit | Puzzle | 64 | optional | yes | none | hover ticks | — | good detective toy |
| 05 A Schicht | **Toy** | HUD 18 | report modal | yes | 60 s timer, counter, no target | breathing, heartbeat, vignette | — | physical and memorable |
| 05 B Schichtplan & Waage | Puzzle/Watch | 58 / 99 | — | partly | none | flip-dots, beam clunk | — | decisions without stakes |
| 05 C Licht aus ★ | Puzzle/Toy | **121** | yes | yes | none | relay clunks, dark hall (great) | overclaim album | the best Entscheider toy |
| 06 A Vorführung | Puzzle | **131** | yes (on leaving the terminal) | yes | none | tags on the sign | Take-Board album | nice payoff for collected cards |
| 06 B Unter Last ★ | Watch (theatre) | 65 | yes | yes | none | shutter, docking, sign flip (great) | — | great theatre; the measurement is watched |
| 06 C Drei Auditoren | Puzzle | 56 | yes (report, 47) | yes | none | κ meter, printer | — | good, slow (12 clips × 4 s) |
| Finale F1 | Toy | — | — | yes | none (held / not held) | world tilts | — | fun, one shot |
| Finale F2 | Watch | — | — | yes | prediction | island shudder | — | fine as the climax measurement |
| Finale F3 | Decision | — | — | yes | none | EMI comment | — | no visible consequence |

**Totals today:**
- 18 stations, 6 of them real toys.
- 13 info cards that open on their own, plus the Dunkelfabrik shift report. Card length across all 15 cards in the release text audit, which includes the Lern-Dojo's optional ones: DE Entdecker 40–61 words, mean 45; DE Entscheider 35–77, mean 52.
- 59 EMI lines.
- 0 stations with a visible target beyond the stamp, and 1 with a visible best value (Regelgarten A).
- 11 best values stored but never shown together.
- 6 hidden album entries; nothing else to find.

### 1.4 What already reads as fun (keep it, build on it)

- **Physical toys with honest physics:** balancing, egg grip, crate carrying, the LiDAR walk, F1.
- **Theatre beats:**
  - the glass bump and lights-up,
  - the giant pendulum falling,
  - the egg slow-motion,
  - the shutter and sign flip,
  - lights out,
  - the robot copying your hesitations.
- **Collection payoff:** the nine question cards you earn in other zones and play against "100 %" in the Prüffeld.
- **The Failure-Mode-Album.** Failure as content is the brand's best game idea, and today it is hidden.

### 1.5 Observations that look buggy (for the core/QA owner; not part of this design)

- **Busy HUD in the Sensordom.** In the first 6 s, seven text elements are on screen at once: objective, toast, status line, hint, two right-column cards and a subtitle (`artifacts/phase4/fun/probe-entdecker/02-sensordom-after-E.png`).
- **Leftovers after the shift (Dunkelfabrik).** At the gallery Leitstand, the shift objective („Trag die Kisten zur Handpalette. 60 Sekunden.“) and the Körperlast panel are still on screen (`probe2-entdecker/12-dunkelfabrik-C.png`). This was reached through the solve hooks. Confirm with real input.
- **Charts look broken through the glass panel (Regelgarten C).** The Kennlinie in the operate panel shows dark rectangles, which are the 3D scene seen through the translucent panel (`probe2-entdecker/04-regelgarten-C.png`). Make chart backgrounds opaque.
- **The ★ glyph already has a meaning.** It marks the Entscheider core station everywhere: in the Pass, the eyebrows and the labels. It would clash with star ratings, so §4.6 replaces it with ◆.

---

## 2. Design principles for this pass

1. **Play first, explain after.**
   - At most 25 words of prose before the first input at any station: the objective plus an EMI greeting of 12 words or fewer. Key legends such as „1 RGB · 2 Tiefe …“ are not counted, but must stay on one line.
   - An operate panel shows at most 50 visible words when it opens. Formulas and long explanations go behind ⓘ or "Warum?".
2. **Every station is a toy with a goal.**
   - The goal can be seen before you start (three goal chips).
   - Feedback is immediate and physical: popup, burst, sound, counter.
   - Result banner with 1–3 stars and a personal best.
   - Retry with [R] within one second.
3. **★ is the stamp; ★★ and ★★★ are mastery.**
   - The first star is the existing stamp condition, so nobody loses the route.
   - ★★ needs the lesson understood.
   - ★★★ needs practice or a discovery.
   - Difficulty ramps inside every station.
4. **Failure is funny and informative.** Every failure shows a short, dry reason that teaches, for example „Glas? Für LiDAR: Luft.“. The album entries become celebrated "Pannen".
5. **The lesson comes from the play.**
   - The banner carries one sentence of at most 14 words, the "aha" the player just felt.
   - Cards stay (the facts are good) but become optional: [H] in the banner, or the Pass.
6. **Exploration pays.** There are 12 capsules, the album, and ★★★ secrets inside stations (a second data defect, the safe gripping range in backlight, the latency limit).
7. **Meta-progress is visible from anywhere.** The tower logo is drawn by your stamps, position lights come on with each capsule, and the gate masts show stars.
8. **EMI reacts to what you do.** Zone EMIs comment on personal bests, three stars and failures, rate-limited. EMI-01 radios in for album finds, capsules and new skills.
9. **Entscheider mode gets decisions with visible consequences, not more text** (§9).
10. **Stars rate your play and your method, never a robot or a vendor.** The honesty rule stays (§10).

---

## 3. Seed ideas from the coordinator: adopt, adapt, reject

| Seed | Decision | Reason |
|---|---|---|
| **a) Your progress draws the logo** (tower sculpture, arm/laser draws one element per stamp, ghost arcs, finale completes) | **Adopt, adapted** | The best meta-progress you can see, and it answers the founder's "ugly logo plated to the tower". **Adapted:** the order is **ring first (stamp 1), then arcs 1–17 (stamps 2–18)**. This is the order the Pass cover already uses (GDD §8.1), and it matches the Recamán stamp melody: stamp n plays a(n−1), which is exactly where arc n−1 lands. The **finale does not add elements**: it "switches the logo on" with a laser sweep and parks the arm. A finale that filled in missing arcs would devalue the stamps, and an Entscheider who finishes with 6 stamps still gets a finale moment (§6). Brand: the final mark stays canonical, flat, upright and exact, with no glow or pulse on the mark itself. Drawing is a progressive reveal by opacity/clip, which the logo manual allows ("Fade, Scale, Opacity") |
| **b) Stars and best values per station, in the Pass and on the zone gate** | **Adopt** | This is the core of the fun pass (§4, §8). Also shown in the result banner, on the map and on the certificate. |
| **c) Collectibles that make sense on a flying robot island** | **Adopt as "Sensorkapseln"** | Story: the dock gust blew 12 sensor capsules across the island (FIKTION). Each one found switches on one **position light** on the rim (a flying machine has them; steady teal, no blinking, GDD §9.6). 12/12 opens the **Turmsprung**, a launch pad from the plaza to the Ausguck. 6 capsules are placed by the landscape agent (pad apex, Ausguck, Kanzel, Glasbalkon, Landedeck, Kielraum), 6 by the zones, one each, where its toy or a hidden corner matters. |
| **d) EMI learns along** | **Adapt (smaller)** | EMI-01 does not follow the player: there is no pathfinding, and a companion that follows is a large change with collision risk. **P1:** six skills (SEHEN … MESSEN), unlocked by the first earned stamp in each zone, shown as a row in the Pass, with an EMI-01 radio line on unlock. **P2:** EMI-01 shows the newest skill on the plaza (balances a stick, holds an egg, carries a crate) when the player passes. |
| **e) Timed challenges, a short "Schicht", "Mensch vs. Roboter"** | **Adopt where time is the lesson** | Dunkelfabrik A becomes "Mensch gegen Roboter: die Minute": you race the cell arm for 60 s and win, then the banner says „Die Nacht hat 480 davon.“ Also timed: Sensordom B Blindflug, Greifwerkstatt A ring race, Regelgarten A hold time. **Rejected:** timers on the measuring stations. Haste there would teach the opposite of "Messung statt Marketing". |

---

## 4. Game-layer API: `ctx.game`

The core agent implements this **first**: the types, a working implementation, the banner and the persistence, then a commit. Zone, tower and landscape agents build against it. It hangs on every `ZoneContext` as **`ctx.game`**, so the island module (tower and landscape) and the finale use the same object. Existing APIs keep working unchanged.

### 4.1 Types (`src/core/zones/types.ts`, re-exported from `@/core/zones`)

```ts
export type Stars = 0 | 1 | 2 | 3;
export type SkillId = 'sehen' | 'regeln' | 'greifen' | 'lernen' | 'arbeiten' | 'messen';
export type CueName = 'good' | 'great' | 'bad' | 'oops' | 'tick' | 'go' | 'star' | 'pb' | 'collect';
export type JuiceTone = 'good' | 'bad' | 'accent' | 'teal' | 'muted';

export interface StarGoal {
  /** What this star asks for, ≤ 8 words („Halte den 2-m-Stab 8 s“). Shown as a goal chip, in the banner and in the Pass. */
  text: Text;
  /** Optional threshold in metric units: met when value ≥ at (better 'higher') or ≤ at (better 'lower'). */
  at?: number;
}

export interface ChallengeDef {
  /** Station id from defineZone({ stations }), one challenge per station. Any other id needs station: false. */
  id: string;
  /** default true: rolls up into the station's stars (Pass, gate, map, total ★ x/54) */
  station?: boolean;
  /** The toy's goal in ≤ 8 words („Fädle drei Ringe ein“). */
  title: Text;
  /** The measured quantity, when there is one (time, count, %). */
  metric?: { label: Text; unit?: string; better: 'higher' | 'lower'; digits?: number };
  /** ★, ★★, ★★★ in ascending difficulty. ★ MUST equal the station's existing stamp condition. */
  goals: [StarGoal, StarGoal, StarGoal];
  /** The one-line "aha" shown with the first ★ result: ≤ 14 words, ModeString allowed. */
  lesson?: Text;
  /** The former auto card. Opened only via [H] while the banner is up, or from the Pass. Never opens by itself. */
  why?: () => InfoCardSpec;
  /** Instant retry (≤ 1 s to playable): the banner button and [R] while the banner is up. Omit when a retry makes no sense. */
  retry?: () => void;
  /** The zone's EMI that reacts to results (rate-limited, interrupting). */
  emi?: EmiHandle;
  /** EMI reactions; core defaults exist (§4.5). */
  lines?: { pb?: Text; star3?: Text; fail?: Text[] };
}

export interface ChallengeResult {
  value: number | null;
  stars: Stars;          // stars of THIS attempt
  best: Stars;           // stored best stars after this attempt
  prevStars: Stars;
  newStars: boolean;     // best > prevStars
  personalBest: boolean; // metric improved
  bestValue: number | null;
  prevBest: number | null;
}

export interface ChallengeHandle {
  readonly key: string;           // '<zoneId>.<id>'
  readonly stars: Stars;          // persisted best
  readonly best: number | null;   // persisted best metric value
  readonly attempts: number;
  /** Start an attempt: counts it. Optional 3-2-1-LOS countdown (any key skips; resolves at LOS) and HUD timer. */
  begin(o?: { countdown?: boolean; timer?: { seconds: number; label?: Text } }): Promise<void>;
  /** Live value chip during an attempt („4,2 s“, „3/5“); null hides it. */
  live(text: Text | null): void;
  /** Finish an attempt. Stars come from goals[i].at unless o.stars is given (for compound goals).
   *  Persists, shows the result banner, lets the EMI react, fires events. quiet: persist only (solve hooks, reloads). */
  submit(value: number | null, o?: { stars?: Stars; detail?: Text; quiet?: boolean }): ChallengeResult;
  /** A failed attempt: fail flash ≤ 2.5 s with a funny-informative reason (≤ 10 words) and [R]; EMI fail line (≤ 1 per 8 s). */
  fail(reason: Text): void;
  /** Three goal chips (☆/★ + text), live-updating. Mount in your operate panel's top row, or in your HUD column for first-person stations. */
  chips(): HTMLElement;
}

export interface ZoneJuice {
  /** Particle burst (one engine-wide pooled InstancedMesh, ≤ 256 particles, 1 draw call). Local coords like the rest of ctx. */
  burst(at: Vec3Input | THREE.Object3D, o?: { tone?: 'orange' | 'teal' | 'stone'; count?: number; spread?: number }): void;
  /** Floating world label that rises and fades („+18 kg“, „Glas? Für LiDAR: Luft.“). */
  popup(at: Vec3Input | THREE.Object3D, text: Text, o?: { tone?: JuiceTone; seconds?: number }): void;
  /** Screen-edge flash, 250 ms (DOM). */
  pulse(tone?: JuiceTone, strength?: number): void;
  /** Calibrated procedural cue on the cues bus (peak −18 … −9 dBFS, ARCHITECTURE §5.12). */
  cue(name: CueName, o?: { at?: Vec3Input; pitch?: number; volume?: number }): void;
  /** 3-2-1-LOS overlay and cues; any key skips. */
  countdown(o?: { from?: number }): Promise<void>;
}

export interface ZoneCollectibles {
  /** Place one Sensorkapsel (local coords). Already-found ids are not spawned. Pickup: player within `radius` (default 1.2 m),
   *  also during jump-pad flights. Core builds the visual (instanced, 1 draw call for all) and the pickup effect. */
  place(o: { id: string; position: Vec3Input; radius?: number }): { readonly found: boolean; remove(): void };
  found(): string[];
  has(id: string): boolean;
  /** number of placed ids (12 when all owners placed theirs) */
  total(): number;
  /** for EMI-01's hint (world coords; bearing in compass degrees) */
  nearestUnfound(fromWorld: Vec3Input): { id: string; distance: number; bearing: number } | null;
}

export interface ZoneSkills {
  list(): { id: SkillId; zoneId: string; unlocked: boolean }[];
  has(id: SkillId): boolean;
}

export interface ZoneGame {
  challenge(def: ChallengeDef): ChallengeHandle;
  readonly juice: ZoneJuice;
  readonly collectibles: ZoneCollectibles;
  readonly skills: ZoneSkills;
  /** stars of one zone (or all): byStation = best stars per station id */
  stars(zoneId?: string): { stars: number; max: number; byStation: Record<string, Stars> };
  /** island-wide numbers for the tower, masts, map and certificate */
  progress(): { earnedStamps: number; stamps: number; stars: number; maxStars: number; capsules: number; capsulesTotal: number; finaleEnded: boolean };
}

// ZoneContext gets:   readonly game: ZoneGame;
```

### 4.2 Behaviour

**Registration.** Call `ctx.game.challenge(def)` once in `init`/`create`. It returns a handle with the persisted record. A second call with the same id replaces the def and keeps the record. The Pass, gate, map and banner read the defs from the registry, and `why` stays callable from the Pass for the whole session.

**Stars.**
- `submit` computes stars from `goals[i].at`, checked in order. Star i is earned when goal i and every goal before it are met.
- `o.stars` overrides this for compound goals such as „≤ 2 Fehlversuche *und* ≤ 90 s“.
- The stored value is `max(previous, this attempt)`. The metric best is stored per `better`.
- Maximum: 18 stations × 3 = **54 ★**. Extra challenges (`station: false`, for example finale F1) show their own stars and are not part of the 54.

**Stamps and stars together.** Zones keep calling `ctx.pass.award(...)` exactly as today, since the stamp value is their measured value. They call `challenge.submit(...)` at the same moment. When a stamp and a result for the same station arrive within 1.5 s (in either order), core merges them into **one** banner that shows the stamp ring, the stars and the line „Linie 7/18 für den Turm“. Do not say "draws": the tower may hold the line as pending until the player can see it (§6).

A stamp without a submit (Entscheider skip) behaves as today: a grey toast and 0 stars. A skipped station can be upgraded later.

**Result banner** (core UI, DOM):
- **Position.** Lower third, centred. In operate mode it sits on the free side, above the operate bar.
- **Contents.**
  - Eyebrow (`// 02 · A · BALANCIEREN`).
  - The value, large, in Geist Mono (`8,4 s`).
  - The tag **NEUER BESTWERT** (orange) on a personal best.
  - Three stars filling in one after another, each with a `star` cue of rising pitch.
  - The three goal chips, met ones checked; the next unmet goal is highlighted as "Nächster Stern: …".
  - The lesson line (first ★ only).
  - The buttons **Nochmal [R]** (if `retry`) and **Warum? [H]** (if `why`). In Entscheider mode on a ◆ station, a second button: **Befundkarte**.
- **Closing.** It closes after 7 s, on Enter, on a click outside, or when the next attempt begins.
- **No modal.** The mouse stays captured, movement stays free, and Esc keeps its meaning.

**Fail flash.** A one-line strip under the crosshair, ≤ 2.5 s, with the reason, the attempt number and [R]. If the zone fails again within 1 s, the strip only updates.

**Keys while the banner or fail flash is up:**
- [R] runs `retry()` and is consumed, so the zone's own R handler does not also fire.
- [H] opens `why()` instead of the EMI ask.

Zones that already use R as reset (Regelgarten A, the Lern-Dojo pult) get the same behaviour.

**Stars and goals before an attempt.** Every station shows its three goal chips (☆ or ★ plus the text) before the first attempt. The zone mounts `handle.chips()` in its operate panel's top row, or in its HUD column for first-person stations. Core keeps the chips up to date.

**Reduced motion:** bursts become a 150 ms static flash ring; no pulse, no shake; popups fade without rising; the countdown does not zoom.

**Performance:**
- One pooled particle InstancedMesh (≤ 256 particles, 1 draw call) and one InstancedMesh for all capsules (≤ 16, 1 draw call) plus their glow ring (1 draw call).
- Popups reuse the WorldLabels DOM pool.
- No per-frame allocations.

### 4.3 Persistence (Progress, same localStorage blob, `v: 1`)

`ProgressData` gains two optional fields. Missing fields default on load, so old saves stay valid:

```ts
challenges: Record<string /* '<zoneId>.<id>' */, { best: number | null; stars: Stars; attempts: number; last: number | null; t: number }>;
collectibles: string[];
```

- **New `Progress` methods:**
  - `recordChallenge(key, value, better, stars): ChallengeResult`
  - `challengeRecord(key)`
  - `stationStars(zoneId, stationId)`
  - `totalStars()`
  - `earnedStamps()`: non-skipped stamps
  - `collect(id): boolean`
  - `collectibles()`
- `reset()` clears both fields.
- **Derived, not stored:** EMI skills (zone has ≥ 1 earned stamp) and `finaleEnded` (from the finale's island progress).
- `ctx.pass.snapshot()`:
  - per stamp: adds `stars: Stars` and `best: number | null`;
  - top level: adds `starsTotal`, `starsMax`, `capsules` and `capsulesTotal`.

### 4.4 Events (EventBus)

| Event | Payload | Fired by | Typical listeners |
|---|---|---|---|
| `challenge:begin` | `{ key, zoneId, id }` | core | zone EMI, HUD |
| `challenge:result` | `{ key, zoneId, id, station, value, stars, best, prevStars, newStars, personalBest, bestValue }` | core | EMI-01 radio, Pass |
| `challenge:fail` | `{ key, zoneId, id }` | core | — |
| `stars:changed` | `{ zoneId, id, stars, total, max }` | core | gate masts (landscape), map, foyer wall (tower) |
| `collectible:found` | `{ id, n, total, world: [x, y, z] }` | core | position lights + Turmsprung (landscape), EMI-01 |
| `emi:skill` | `{ id: SkillId, zoneId, n }` | core | EMI-01 radio, Pass |
| `finale:ended` | `{ earnedStamps, stars }` | core (finale, once, when the ending starts) | tower ("switch on") |
| `stamp:awarded` | existing payload **+ `earned: number`** (non-skipped stamps after this award) | core | tower (draw queue) |
| `logo:element` | `{ index: 0–17, phase: 'start' \| 'done', pending: number }` | tower | core HUD caption (optional) |

### 4.5 Core default strings (DE / EN; zones may override per challenge)

| Key | DE | EN |
|---|---|---|
| banner.pb | NEUER BESTWERT | NEW BEST |
| banner.next | Nächster Stern: {goal} | Next star: {goal} |
| banner.retry / why / befund | Nochmal · Warum? · Befundkarte | Again · Why? · Findings card |
| banner.logo | Linie {n}/18 für den Turm | Line {n}/18 for the tower |
| emi.pb | Neuer Bestwert. Gemessen, nicht geraten. | New best. Measured, not guessed. |
| emi.star3 | Drei Sterne. Das schreib ich mir auf. | Three stars. I’m writing that down. |
| emi.fail (pool) | Daneben. Nochmal – das kostet hier nichts. · Auch das ist ein Messwert. | Missed. Again – it costs nothing here. · That’s a data point too. |
| album.banner | PANNE FÜRS ALBUM · {n}/6 | FAILURE FOR THE ALBUM · {n}/6 |
| capsule.toast | Sensorkapsel {n}/12 · Positionslicht an | Sensor capsule {n}/12 · position light on |

### 4.6 The ★ glyph changes meaning

From now on ★ means rating stars only. The Entscheider core-station marker becomes **◆** (title attribute / tooltip „Kernstation für Entscheider“ / "Core station for decision makers"). There are about 50 occurrences, mostly in strings and comments. Each owner replaces its own:
- core: `PassPanel.ts`, `types.ts`, `Progress.ts`, finale `pass.ts` and `certificate.ts`;
- each zone: its `strings.ts` plus 1–2 code files.

**Troika rule:** in 3D text, use neither ★ nor ◆ unless the glyph is verified in the face. Draw stars as geometry or on a canvas. A missing glyph makes troika fetch a fallback font from a CDN (ARCHITECTURE §7).

### 4.7 Test hooks (`window.__academy`)

- `stars()` returns `{ total, max, byZone }`.
- `challenges()` lists every key, its stars, best value and attempts.
- `challenge(zoneId, id, value, stars?)` calls `submit` (not quiet).
- `collect(id | 'all')` and `capsules()`.
- `skills()`.
- Every zone's `solve-a/b/c` keeps awarding the stamp **and** submits a ★ result (quiet: false).
- Each zone adds `stars3-a/b/c` hooks that submit a ★★★ result, for screenshots and the playtest.

---

## 5. Core spec (`src/core/**`, `src/systems/**`, `src/ui/**`, `src/i18n/**`, `src/world/{index,onboarding,intro,questions}.ts`, `src/world/finale/**`, tools)

| # | Prio | What | Detail |
|---|---|---|---|
| C0 | **P0, first** | `ctx.game` API, persistence, events, debug hooks | §4.1–4.4 and §4.7. Commit and announce before anything else. Typecheck must stay green for every zone that does not use it yet |
| C1 | **P0** | Result banner, fail flash, countdown, juice | §4.2. One particle system, popups via WorldLabels, cues calibrated with `tools/audio-levels.mjs` (add the 9 cues to the survey). Merge the stamp and the banner (1.5 s window). A stamp toast with no challenge result stays as today |
| C2 | **P0** | Pass | Each stamp tile shows ★☆☆, its best value ("Bestwert 8,4 s · 6 Versuche"), the next goal and **Warum?** (calls the registered `why`). The cover stats get **★ x/54** and **Kapseln x/12**. The cover mark counts **earned** (non-skipped) stamps, the same rule as the tower. The ◆ marker replaces ★ (§4.6). The Prognose-Güte stays |
| C3 | **P0** | Card policy and text budgets | In Entdecker mode, zone cards no longer open on their own: zones move them into `why` (§8), and core does not block `ui.card`. Extend `tools/text-audit.mjs` to measure: prose words (EMI lines + objective, key legends excluded) visible before the first input per station (≤ 25), operate-panel words at open (≤ 50; ≤ 70 on the two ◆ decision panels Dunkelfabrik C and Prüffeld A), banner lessons (≤ 14), and cards that open with no click (expected 0 in Entdecker mode) |
| C4 | P1 | First minute: play first | **Dock gust** (ascent end): EMI-01 says only „Spürst du das? Geh zur Libelle.“ / “Feel that? Walk to the spirit level.” **Libelle toy:** new interactable „Böe auslösen“ / “Trigger a gust” (E, 1.5 m). It calls `island.emitGust({ strength: 1 })`; the ball rolls out and back; the Libelle readout ring shows „LAGE {max}° → 0,04° in {t} s · {n} Korrekturen“ (n = t × 1000, FIKTION chip, as the existing plaque). Then EMI-01 says the hook line „Gefangen. Die Insel ist ein Roboter – und du stehst drauf.“ (moved here from the dock). The toy can be repeated, with a 6 s cooldown. **Pass at the Libelle:** EMI-01 hands it over: Pass cover flash, toast, and the line „Achtzehn Stempel – jeder zeichnet eine Linie am Turm.“ / “Eighteen stamps – each one draws a line on the tower.”, with a compass marker on the medallion for 6 s. The objective jumps straight to the orange pad; the foyer terminal stays optional. **Tutorial capsule:** a capsule on the Landedeck, on the walking line to the Libelle (placed by landscape), triggers EMI-01: „Eine Sensorkapsel! Die Böe hat zwölf verstreut. Jede schaltet ein Positionslicht ein.“ / “A sensor capsule! The gust scattered twelve. Each one switches on a position light.” **Target, measured with `onboarding-run.mjs`:** first mechanic before 45 s (ascent watched), first zone ≤ 65 s (was 85 s and 90 s) |
| C5 | P1 | EMI-01 as a radio companion | Reacts anywhere on the island and never over a zone EMI. Queue behind zone lines; at most one radio line per 20 s. Triggers: album unlock (+ the album banner), 3 stars on a ◆ station, capsule found (n = 1, 6, 12 only), new skill (`emi:skill`, lines below), 9/9 question cards. **H on the plaza or the hub** without a zone: hint to the nearest unfound capsule, „Ich empfange ein Signal: Richtung {zone}, {hoch \| unten \| draußen}.“ (`collectibles.nearestUnfound`) |
| C6 | P1 | EMI skills | Derived: a zone's skill unlocks with its first earned stamp. Pass row „EMI-01 hat gelernt“ with six glyphs (zone glyph set). Radio lines: SEHEN „Neu gelernt: SEHEN. Ich weiß jetzt, wo meine Sensoren blind sind.“ / “New skill: SEE. Now I know where my sensors are blind.” · REGELN „… Messen, vergleichen, korrigieren – immer wieder.“ / “… Measure, compare, correct – again and again.” · GREIFEN „… Fest genug, sanft genug.“ / “… Firm enough, gentle enough.” · LERNEN „… Ich mach dir alles nach. Auch die Fehler.“ / “… I copy everything you do. Mistakes included.” · ARBEITEN „… Die schweren Posten zuerst.“ / “… The heavy posts first.” · MESSEN „… Ohne n und Intervall glaube ich nichts mehr.“ / “… No n, no interval, no belief.” **P2:** EMI-01 shows the newest skill at the foyer door when the player is within 10 m: stick balanced on one hand (wrist joints with PD wobble), holds an egg, carries a crate, visor sweep. Props are simple meshes parented to the wrist |
| C7 | P1 | Finale F1 as a challenge | `challenge({ id: 'f1', station: false, metric: { label: 'Zeit über 3°', unit: 's', better: 'lower' }, goals: [{ text: 'Durchhalten', at: 15 }, { text: '≤ 5 s über 3°', at: 5 }, { text: 'Nie über 3°', at: 0 }] })`, using the existing `over` value. **Nochmal ans Steuer:** the Leitstand stays usable after F1; replays do not change the F2/F3 flow |
| C8 | P1 | Finale F3: „Ein Jahr später“ | After signing, the lectern screen plays a 10 s year simulation using the **player's own F2 rates**. Weather is FIKTION: 365 days = 250 ruhig · 85 böig · 30 Sturm, labelled „Wetterjahr erfunden · ein Versuch = ein Tag (Spielzeugmodell)“. It shows a table with **all three** recommendations and highlights the player's own. Per recommendation: expected days with loss of control = Σ days × (1 − rate) with the controller the recommendation uses (Pilot: NN everywhere; Pilot mit Auflage: NN when calm, Bestand when gusty or stormy; Kein Pilot: Bestand everywhere), plus "ruhiger Flug" = mean `maxTilt` of the calm trials of the controller used when calm. **Show the comfort row only if NN's calm mean `maxTilt` is lower than Bestand's** in the toy model; never invent an upside. No judgement and no stars: every recommendation is accepted, and the numbers speak. Chips: SIM · LIVE (rates), FIKTION (weather). Emit `finale:ended` when the ending starts |
| C9 | P1 | HUD and map | **Zone banner on entry:** „★ 4/9 · 2/3 Stempel“. **Map (M):** stars per zone, found capsules as teal dots, the Turmsprung once open. **HUD density rule:** at most one hint line; a hint that repeats the open operate panel's key row is suppressed. Make operate-panel chart backgrounds opaque (§1.5) |
| C10 | P2 | Certificate | Adds ★ total, stars per zone (three small stars under each zone column), Kapseln x/12, and F1 stars. No new claims |
| C11 | P0 | Tools | `playtest.mjs` asserts ≥ 1 ★ per stamped station, banner merge, and 0 cards that open on their own in Entdecker mode. `perf.mjs` adds a view with a burst plus banner. `onboarding-run.mjs` adds the Libelle toy beat |

**Order of work:** C0 → C1 → C2 → C3/C11 → C4 → C7/C8 → C5/C6 → C9 → C10.

---

## 6. Tower spec (`src/world/hub.ts`, `foyer.ts`, `lift.ts`, `src/core/brand/logo3d.ts`, new files under `src/world/tower/`)

The visual design of the tower and medallion belongs to the tower agent's own brief, so this section defines only the **progress hook**.

1. **Elements.**
   - 18 elements: element 0 = outer ring; elements 1–17 = arcs k = 1…17 (GDD Appendix A geometry; `RECAMAN` / `recamanArcs()` in `src/core/brand/logo3d.ts`).
   - Earned stamp n (n = 1…18) lights element n − 1. This is the same order as the Pass cover (`passMark`) and the stamp melody.
   - **Only earned stamps count;** skipped (grey) stamps draw nothing until earned.
2. **States per element.**
   - **Ghost:** at the opacity the Pass cover uses (0.2) or an equivalent dim. The whole mark must read as the EmAI logo from the arrival view on day one.
   - **Drawing:** a progressive reveal along the arc. The laser beam, the spark at the drawing head and a point light may glow, because they are not the mark.
   - **Lit:** the canonical mark: `#FF6700`, unlit/toneMapped false, never bloomed, flat, upright, exact geometry.
   - **Never** rotate, morph, wobble or pulse the mark. Opacity and progressive reveal only (logo manual "Verboten" 2, 4, 9).
3. **Drawing.**
   - A robot arm or gantry with a laser on the tower draws element by element. The founder's logo-film experiment is free to reuse: `logo.js` tube reveal shader, `beam.js`, `robot.js` IK and baked axis dynamics, and its ×1.3-per-step acceleration.
   - Duration ≈ 1.6 s + 0.08 s × arc length index (arc 17 ≈ 3 s; ring ≈ 3 s).
   - When several elements are pending, each next one is 1.3× faster, capped at ×4.
   - Cue: a soft laser hiss plus the element's Recamán note on landing (`Progress.stampNote(n)`; the stamp itself already played it, so use −12 dB).
4. **Trigger.**
   - On `stamp:awarded` with `skipped: false` (or `upgraded`), set `pending = earned − shown`.
   - **Draw only while the player can see it:** outdoors (no active interior), the medallion within the camera frustum, ≤ 160 m. Otherwise keep the elements pending (ghost, plus a small idle "ready" spark at the arm).
   - Pending elements draw in order the next time the medallion is in view.
   - Emit `logo:element` at start and at done. Core may show a caption „// TURM · LINIE 7/18“.
5. **Persistence and reload.** Store `logoShown` (0–18) in island progress (`ctx.progress`). On load, elements `< logoShown` are lit instantly and `earned − logoShown` are pending. `progress:reset` returns everything to ghost and parks the arm.
6. **Finale.**
   - On `finale:ended` (once), "Einschalten": the laser runs once along every lit element in sequence order (≈ 4 s, the experiment's power-on sweep), then the arm parks in a rest pose.
   - If `earned = 18`, add a final beat: the arm "signs off" (bows) and EMI-01 (core) says „Achtzehn von achtzehn. Gemessen, nicht versprochen.“ / “Eighteen of eighteen. Measured, not promised.”
   - After a reload past the ending: rest pose, no sweep.
   - Unearned elements stay ghosts even after the finale. That is the honest record and the reason to come back.
7. **Foyer (P2).** The Lernpfad-Wand panels show the stars per zone (`stars:changed`).
8. **Debug hooks** (`__academy.solve('world', …)`): `logo-<n>` sets n lit, `logo-draw` draws the next one, `logo-pending-<n>`, `logo-sweep`.
9. **Budget:** ≤ 12 extra draw calls and ≤ 40k triangles for the arm, beam and sculpture at the hub view. No shadow casting from thin parts. The medallion stays on its `#141414` disc.

---

## 7. Landscape spec (`src/world/{terrain,surface,railing,masts,deck,landing,layout,…}.ts`, `src/core/brand/{materials,textures}.ts`, `src/core/RenderSystem.ts`, `src/core/Environment.ts`, new files under `src/world/landscape/`)

The look of the island, including what replaces the pine trees, is the landscape agent's own brief. These are the fun items it places. All positions are world coordinates (`layout.ts` helpers). Capsule ids are prefixed `world.`.

| # | Prio | Item | Spec |
|---|---|---|---|
| W1 | P1 | **6 world capsules** via `ctx.game.collectibles.place` from the island module | `world.landedeck`: on the walking line from the spawn (0, 0, 94.5) to the avenue, about 4 m ahead, slightly off-axis (the C4 tutorial capsule). `world.sprungbogen`: at the **apex of the hop from the hub pad at bearing 150 (Dunkelfabrik) to the zone pad**, r ≈ 39.5, height = pad top + `hopNumbers(25).apex` (≈ 7.7 m) + 0.9 m (body centre), so it is collected in flight; the pad's preview arc passes through it, which is the visible hint. `world.ausguck`: on the Ausguck ring (y 44), north side, against the railing. `world.kanzel`: in the Kanzel at bearing 240, on the glass floor above trim rotor T3. `world.glasbalkon`: at the outer edge of the Glasbalkon (0, 0, −97.5); the balcony is r 7 around (0, 0, −92). `world.kiel`: on the Kielraum catwalk (y −36), on the far side from the lift landing, reachable from the finale on. Pickup radius 1.2 m (1.6 m for `sprungbogen`) |
| W2 | P1 | **12 position lights** on the rim | One per capsule id, spread evenly or tied to the capsule's nearest rim bearing. Small steady teal lamps on the rim band: off (dark lens) until found, then on (emissive teal, bloom allowed). **No blinking** (GDD §9.6). At dusk they read as a ring of lights. Listen to `collectible:found` and read `collectibles.found()` on load. Map the 6 zone capsule ids `<zone>.kapsel` to the lights nearest their lobes |
| W3 | P1 | **Gate mast stars** | Each mast sign shows the zone's stamps (0–3) and **★ x/9** from `ctx.game.stars(zoneId)`, updated on `stars:changed`. Draw the stars as geometry or canvas, not troika glyphs (§4.6) |
| W4 | P2 | **Turmsprung** (reward for 12/12) | A pad that rises out of the plaza on `collectible:found` n = 12 (or on load if 12/12). Place it at a north-west or north-east bearing (for example bearing 315, r ≈ 24), so the flight avoids the medallion on the S facet and the lift shaft on the N facet. It launches to the Ausguck (y 44, ring r 9–13) with `ctx.player.launch`, T ≈ 4 s, using the `hopNumbers` formula with Δy = 44. The path must clear all tower geometry, including the tower agent's arm, by ≥ 1.5 m: check with the tower agent's final model. Reduced motion: fade teleport. Teal ring, no orange (not an objective) |
| W5 | P2 | Traversal toys in the new landscape features | Wherever the replacements for the tree mounds go, make 2–3 of them touchable: a gust vane that turns with `island:gust`, a gyro you can push (kinematic spin on E), a small 3 m hop pad to a raised feature carrying a zone-free capsule if a zone drops its one. No new facts on plaques |

---

## 8. Zone specs

**These rules apply to every zone (P0):**
- **One `ctx.game.challenge` per station**, with ★ equal to the existing stamp condition, and `solve-a/b/c` also submitting a ★ result.
- **Add `stars3-a/b/c` hooks.**
- **Move the auto card into `why`.** The Entscheider decision box and Befundkarte stay inside the card, and the Pass and certificate keep collecting them.
- **Banner lesson ≤ 14 words**, reusing an existing EMI line where one exists (listed below).
- **Prose before the first input ≤ 25 words:** one EMI greeting of 12 words or fewer, then the objective. Key legends don't count. A second EMI line comes after the first action. Today the Sensordom shows 48 words and the others 22–25.
- **Operate panels ≤ 50 visible words at open:** formulas, source notes and "Ziel:" lines move to ⓘ, `why` or the goal chips. Every number keeps its chip.
- **★ → ◆** in your strings (§4.6).
- **Juice:** popup and `good` cue on each success step, `oops` plus a reason popup on each failure step, `burst` and `great` on station success.
- **Calibrate every ★★/★★★ threshold** with at least 3 real-input attempts, or the zone's existing human-like bot, and log the result in the commit. Rule: ★★ reachable for most players within 5 tries; ★★★ needs the lesson plus practice (10–20 tries). Never unreachable.

The thresholds below are starting values.

### 8.1 Sensordom (zones-a): `src/zones/sensordom/`

**S1 · A Messbrille → "Sensor-Suche" (P0)** · `labor.ts`
- **Wrong-mode tag:** a popup at the object from the existing `NOTES` table, e.g. „Glasflasche · LiDAR: Luft“ / „Samtkiste · RGB: zu dunkel“ (EN via the table), plus `oops`. This counts as a Fehlversuch.
- **Correct tag:** teal burst at the object, popup „✓ Becher · TIEFE“, `good`; the list row bumps.
- **Metric:** time from entering the dome to the 5th tag (s, lower).
- **Stars:**
  - ★ all 5 tagged (stamp);
  - ★★ all 5 with ≤ 2 Fehlversuche;
  - ★★★ ≤ 2 Fehlversuche and ≤ 90 s.

  Pass the compound result with `o.stars`.
- **Retry:** untag all; the timer restarts at the next visor key.
- **Text (48 → ≤ 25 words of prose):**
  - EMI greeting: „Setz meine Brille auf: Tasten 1 bis 4.“ / “Put on my visor: keys 1 to 4.”
  - Objective: „Markiere 5 Dinge für EMI-02s Greifer.“ / “Tag 5 things for EMI-02’s gripper.”
  - The key legend stays.
  - The EMI `task` line moves to after the first tag, cut to „Manche Dinge sieht nur ein Sensor.“ / “Some things only one sensor sees.”
- **Lesson:** „Kein Sensor sieht alles. Zusammen sehen sie mehr.“ (existing `emi.aDone`)

**S2 · B Dunkelkammer → "Blindflug" time trial (P0)** · `darkroom.ts`
- **First run unchanged.** LiDAR only until the glass bump, then lights, then fusion. The bump is the lesson.
- **Glass contact:** add a popup „Glas! LiDAR: nichts.“ / “Glass! LiDAR: nothing.” and a `bad` pulse on top of the existing thud and shake.
- **Exit:** `burst` + `great`; the banner shows the time and „{n} Glaskontakte“.
- **Stars:**
  - ★ exit (stamp);
  - ★★ ≤ 60 s;
  - ★★★ ≤ 45 s and 0 glass contacts (needs reading the white ultrasound points).
- **Retry [R]:** teleport to the darkroom door. Lights stay off; LiDAR and fusion are on from the start (fusion is already sticky after the first reveal). The timer starts when the player crosses the door.
- **Lesson:** „Glas ist für LiDAR meist Luft – Ultraschall hört es.“ / “To LiDAR, glass is mostly air – ultrasound hears it.”

**S3 · C Messstrecke ◆ → "Greift EMI das?" (P1)** · `messstrecke.ts`
- **Greif-Test line.** After every 30-reading run, the panel shows a line computed from those 30 readings: how many lie within **±5 cm** of the true distance → „EMI würde 30 von 30 greifen“ / “EMI would grip 30 of 30”. A popup at the plate shows it: teal when ≥ 27, stone otherwise. Add an ILLUSTRATIV chip: „Greiftoleranz ±5 cm: Spielwert“ / “Grip tolerance ±5 cm: game value”.
- **Expected results from the existing toy model.** Dropouts („keine Messung“) count as misses.
  - Labor: σ(3 m) = 18 mm → ≈ 99 % within ±5 cm (safe); σ(6 m) = 72 mm → ≈ 51 % (not safe).
  - Gegenlicht (σ ×2.5, dropouts 5 % per m): 3 m → 0.85 × 73 % ≈ 62 % (not safe); 1 m → σ 5 mm, 0.95 × ≈ 100 % ≈ 95 % (safe).
  - **Judge the player's pick against the model's expected rate (≥ 90 % = safe), not against the noisy 30-reading run.** The run is the illustration. Correct answers: Labor 3 m, Gegenlicht 1 m.
- **New one-tap question before the first run:** „Bis wohin greift EMI sicher (≥ 27 von 30)?“ / “Up to which distance does EMI grip safely (≥ 27 of 30)?” Options 1 / 3 / 6 / 9 m. On the first switch to Gegenlicht the same question appears again.
- **Stars:**
  - ★ stamp (3 distances in Labor + 1 in Gegenlicht, unchanged);
  - ★★ safe distance right in Labor (3 m);
  - ★★★ right in Gegenlicht too (1 m).

  The existing σ(6 m) prediction stays and feeds the Prognose-Güte.
- **Panel:** the histogram caption and the model line go behind ⓘ; the Greif-Test line takes their place.
- **Lesson:** „Doppelte Distanz, vierfacher Fehler – und EMI greift daneben.“ / “Double the distance, four times the error – and EMI misses.”

**S4 · capsule `sensordom.kapsel` (P2)**
- **Where:** in a dark corner of the Labor, black like the velvet box.
- **Visibility:** in RGB only within 1.5 m; in LIDAR it shows as points. Register its mesh with the visor like `samt`.
- **Pickup:** by walking into it.

### 8.2 Regelgarten (zones-a): `src/zones/regelgarten/`

**R1 · A Balancieren → "Stab-Challenge" (P0)** · `balance.ts`
- **During a run:** a tick cue every full second with rising pitch; a popup at the tip at 5 s and 10 s.
- **On a fall:** fail flash with a rotating reason, at most 1 per 6 s, otherwise just the number:
  - „Zu spät: Der Stab war schneller als deine Reaktion.“ / “Too late: the pole was faster than your reaction.”
  - „Schienenende. Hol den Wagen zur Mitte.“ / “End of the rail. Bring the cart back to the middle.”
  - „Kurz antippen statt festhalten.“ / “Tap, don’t hold.” (existing `aTip`)
- **Metric:** hold time of this run (s, higher). The stars depend on pole length and gravity, so the zone computes them and passes `o.stars`.
- **Stars:**
  - ★ stamp (each length ≥ 2 s + one 5 s run);
  - ★★ 2 m pole on Earth ≥ 8 s;
  - ★★★ 1 m pole on Earth ≥ 8 s.

  Calibrate with the zone's 0.25 s-delay bot: if 1 m Earth for 8 s is not humanly reachable, use 1 m Earth ≥ 4 s.
- **Retry:** R (exists).
- **Panel 103 → ≤ 50 words:**
  - The τ formula line, the τ note and the "Ziel:" line go to ⓘ, `why` and the goal chips.
  - Keep the length and gravity selectors, the big timer and the Bestzeiten table (that table is the score board).
  - Shorten the key row to „A/D · 1/2/3 · G · R“.
- **Lesson:** „Langer Stab = mehr Zeit: Die Kippzeit wächst mit √L.“ / “Longer pole = more time: tipping time grows with √L.”

**R2 · B Regler & Takt ◆ → "Wann fällt der Riese?" (P0)** · `giant.ts`
- **The giant fall** (the spectacle): dust burst at the foot, `shake(0.15)`, a `bad` pulse and the existing clunk and EMI line.
- **Stars:**
  - ★ stamp (fall seen at ≤ 10 Hz, then a Schubs survived at ≥ 200 Hz);
  - ★★ prediction right (the predicted Takt equals the measured "fällt ab" Takt, which already exists);
  - ★★★ latency limit measured: a fall caused by latency at 1 kHz plus a hold at ≤ 50 ms. The panel's "Latenzgrenze" field already records this.
- **Panel 93 → ≤ 55 words:** the skill and planner dials collapse behind „Gehirn-Stapel ▸“, and the explanatory sub-lines move into `why`.
- **Lesson:** „Zu langsam gemessen ist zu spät korrigiert.“ (existing)

**R3 · C Tausend Welten → "Du gegen 256 Welten" (P1)** · `wall.ts`, `sim.ts`
- **New first step, „Selbst einstellen“ / “Tune it yourself”:**
  - Two sliders: P and D (Kx and Kv fixed at the CEM start mean).
  - A button: „In 256 Welten testen“ / “Test in 256 worlds”.
  - It evaluates the gains on 256 fresh randomised worlds with `runEpisode`, chunked to ≤ 1 ms per frame like the CEM. The wall replays (4 s) and shows „Deine Regler: 37 % stehen“ / “Your gains: 37 % stand”.
  - Unlimited tries.
- **Then „Training starten“ as today.** The Kennlinie gets a horizontal reference line „Du: 37 %“, so the generations visibly pass the player.
- **Stars:**
  - ★ stamp (8 generations + one transfer, unchanged);
  - ★★ your hand-tuned gains hold ≥ 50 % of 256 worlds;
  - ★★★ ≥ 85 %.

  Set both thresholds from a sweep of the real sim: a random slider position should give < 30 %, a sensible P + D (the B lesson) about 50 %, and ★★★ should need fine tuning. Put the sweep table in the commit message.
- **Juice:** a counter bump on each try („37 % → 52 %“) and `great` on a new best.
- **Lesson:** „Wer in vielen falschen Welten übt, besteht eher in der echten.“ / “Practise in many wrong worlds and you’re likelier to hold in the real one.”

**R4 · capsule `regelgarten.kapsel` (P2):** on a gyro-sculpture plinth, reached by a jump from the planter edge (≤ 0.6 m step).

### 8.3 Greifwerkstatt (zones-a): `src/zones/greifwerkstatt/`

**G1 · A Gelenke → "Ringe-Rennen" (P0)** · `stationA.ts`
- **Start:** `begin({ countdown: true })` when the operate mode opens (any key skips). The timer runs.
- **Ring threaded:** burst at the ring, popup „Ring 2 · 0:41“, `good`.
- **Metric:** time for 3 rings in **joint mode** (s, lower; `ringTime` exists).
- **Stars:**
  - ★ 3 rings in any mode (stamp);
  - ★★ 3 rings in joint mode ≤ 120 s;
  - ★★★ ≤ 60 s.
- **IK comparison.** After the first finish, target mode unlocks at once. The banner offers „Jetzt mit Zielmodus [T]“ / “Now in target mode [T]”, and the next banner shows „Gelenke 1:42 · IK 0:09“. That comparison is the lesson.
- **Retry R:** rings reset, arm to home, timer to zero.
- **Panel:** ≤ 40 words; the "Gelenk wählen …" sentence goes behind ⓘ.
- **Lesson:** „Vorwärts gekurbelt, rückwärts gerechnet: IK nimmt dir das Kurbeln ab.“ / “Cranked forward, computed backward: IK does the cranking for you.”

**G2 · B Das Ei → "Eier-Serie" (P0)** · `stationB.ts`
- **B1 → B2 → B3 progression unchanged.** B1 cracks are the funny failure; keep the slow-motion replay.
- **New on-screen tally:** „Eier: 3 heil · 5 kaputt“ / “Eggs: 3 intact · 5 broken”.
- **Intact lift:** teal burst at the jaws, popup „4,8 N · heil“ / “4.8 N · intact”, `good`.
- **Crack:** existing effects + `oops`; EMI lines from the existing pool (`bCrack`, `bLucky`, `bSlip`).
- **Metric:** intact eggs in a row in **B2** (force sensor, manual).
- **Stars:**
  - ★ stamp;
  - ★★ 3 in a row in B2;
  - ★★★ 5 in a row in B2 with every grip inside 3–7 N.

  If ★★★ is not reachable with real mouse input in 10 tries (the release notes a ≈ 75 ms window), widen it to the full 2–8 N band.
- **Stamp condition eased:** egg intact once + **one slip** on the friction table. Drop the "3 lifts / 2 objects" part: the slip is the cone lesson, the rest was a form.
- **Retry:** R = new egg (exists).
- **Lesson:** „Fest genug gegen Rutschen, sanft genug gegen Bruch.“ (existing `bDone`)

**G3 · C 200 Griffe ◆ → "Wette aufs Band" (P1)** · `stationC.ts`
- **Keep the prediction** (eggs out of 20, camera only).
- **Stars:**
  - ★ stamp (both sensor configs at n ≥ 20 + one run at n = 200, unchanged);
  - ★★ your prediction lies inside the Wilson 95 % interval of your camera-only n = 20 run;
  - ★★★ both sensor configs measured at n = 200 (the fair comparison).
- **End of each run:** band-shrink popup on the tally board („±20 → ±7 Punkte“ / “±20 → ±7 points”). When the two n = 200 bands do not overlap: `great` and the popup „Bänder getrennt: Der Unterschied ist echt.“ / “Bands apart: the difference is real.”
- **Panel 84 → ≤ 55 words:** "Für den Stempel:" becomes goal chips; the two source lines keep their chips, one line each.
- **Lesson:** „Zwanzig Versuche sind eine Anekdote. Zweihundert sind eine Kennlinie.“ (existing)

**G4 · capsule `greifwerkstatt.kapsel` (P2):** in the giant egg's cradle at local (−1, 0, −16). It becomes reachable and visible while the arm lifts the egg (the 40 s loop).

### 8.4 Lern-Dojo (zones-b): `src/zones/lern-dojo/`

**L1 · A Vormachen → "Saubere Demos" (P0)** · `teleop.ts`
- **Metric:** mean time of the 5 kept successful demos (s, lower).
- **Stars:**
  - ★ 5 demos (stamp);
  - ★★ mean ≤ 9 s;
  - ★★★ mean ≤ 6 s with no failed or discarded demo.

  Calibrate: the stamp example shows a mean of 7.8 s.
- **Per demo:** popup „Demo 3 ✓ 6,2 s“, counter bump; the record beep and the ribbon into the cloud already exist.
- **The cards are already optional** (the signs). Keep them as the model for the other zones.
- **Link to B:** the in-distribution rollout banner in B shows „Deine Demos: Ø 6,2 s → Policy: 6,9 s“ / “Your demos: avg 6.2 s → policy: 6.9 s”, computed by the sim. The policy copies your speed and your hesitations.

**L2 · B Nachmachen ◆ → "Brich die Policy – und rette sie" (P0)** · `teleop.ts`
- **Flow unchanged** (in-distribution ✓ → OOD ✗ → +2 demos → ✓), with a banner beat at each step:
  - in-distribution: `good`;
  - OOD: fail flash with „Da warst du nie.“ (existing EMI line) and `oops`;
  - fix: `great`.
- **Stars:**
  - ★ stamp;
  - ★★ the in-distribution rollout reaches the goal within your demo mean + 2 s. The rollout is already reliable, so time is what separates good from bad, and clean, fast demos pay off;
  - ★★★ after the fix, the rollout at the new spot reaches the goal in ≤ 10 s (good new demos).

  Calibrate both.
- **Hints:** each hint line ≤ 12 words. The 5-step chip row stays; it is the progress.
- **Lesson:** „Es hat nicht die Aufgabe gelernt. Es hat dich gelernt.“ (existing `bSuccess`)

**L3 · C Datensatz-Audit → "Datendetektiv" (P1)** · `audit.ts`, `dataset.ts`
- **Flow kept:** v0 → mark → filter → retrain → measure.
- **Hidden second defect = the ★★★ secret:** the 12 „Kamera verschoben“ episodes, which have a different thumbnail tint and are already modelled at +6 pp.
- **Stars:**
  - ★ stamp (dead block filtered with ≤ 5 false removals, v0 and v1 evaluated, unchanged);
  - ★★ dead block with 0 false removals;
  - ★★★ the 12 camera-shift episodes also filtered and the gain measured.

  After ★★ the banner hints „Da ist noch etwas: 12 Demos sehen anders aus.“ / “There’s more: 12 demos look different.”
- **Juice:** filter = whoosh and the tiles drop out; eval = `great` when the bands separate.
- **Lesson:** „Erst die Daten prüfen, dann trainieren.“ (existing `cDone`)

**L4 · capsule `lern-dojo.kapsel` (P2):** behind the Datensatz-Wand, at its −z end.

### 8.5 Dunkelfabrik (zones-b): `src/zones/dunkelfabrik/`

**D1 · A Schicht → "Mensch gegen Roboter: die Minute" (P0 + P1)** · `schicht.ts`, `arm.ts`, `line.ts`
- **P0:**
  - `begin({ countdown: true })` at the first lift, then 60 s.
  - Pallet thump + popup „+18 kg“ + counter bump; the heartbeat and vignette exist.
  - **Metric:** crates placed in 60 s (higher).
  - **Stars:**
    - ★ ≥ 3 (stamp, unchanged);
    - ★★ ≥ 7;
    - ★★★ ≥ 10.

    Calibrate to the arrival rate (one crate per 6 s, queue of 4) with a real-input run.
  - **The shift report modal no longer opens by itself.** Its content, including the QUELLE board numbers, becomes `why` („Schichtbericht“).
- **P1, the race:**
  - During your minute the cell arm palletises on its own pallet at Station 7's fictional 20 s Takt (3 crates in 60 s), with a counter „Roboter: 2“.
  - Banner: „Du 8 · Roboter 3. Du gewinnst die Minute. Die Nacht hat 480 davon.“ / “You 8 · robot 3. You win the minute. The night has 480 of them.” (8 h × 60 min; Station 7 is FIKTION).
- **Lesson** (Entdecker): „Diese Arbeit macht heute ein Mensch. Morgen vielleicht niemand mehr.“ (existing `reportLead`, shortened)

**D2 · B Schichtplan & Waage → "Lückenplan 2030" (P0)** · `roster.ts`, `waage.ts`
- **Task (one line):** „2030: Posten sind leer. Setz drei Roboter so, dass sie passen – und sich tragen.“ / “2030: posts are empty. Place three robots so they fit – and pay off.”
- **Stars:**
  - ★ stamp (slider ≥ 2030, ≥ 1 token with feedback, Waage run to year 6, unchanged);
  - ★★ all three tokens get the verdict „passt“. Check that three „passt“ posts can be empty in 2030; if not, use „≥ 2 passt und 0 passt nicht“;
  - ★★★ **find the boundary:** run the Waage once with payback ≤ 4 years and once with „kein Pilot“ (> 4 years), by changing shifts or coverage. With the default 1 shift and 80 % it pays off around year 3.8, but with your own night share as coverage it often does not. The lesson is that the business case depends on its assumptions.
- **Consequences you can see:**
  - verdict popup on the wall: „passt“ teal, „Pilot“ stone, „passt nicht“ muted + shake;
  - the person token moves up to Anlagenführung (exists);
  - beam tip: clunk, burst and popup „Jahr 3,8“.
- **"Kein Pilot" outcome:** `good` cue + „Kein Pilot ist auch ein Ergebnis.“ (existing).
- **Lesson:** „Ein Roboter auf einem leeren Posten ersetzt niemanden – er füllt eine Lücke.“ (existing)

**D3 · C Licht aus ◆ → "Ehrliche Nacht" (P0)** · `nacht.ts`
- **Stars:**
  - ★ stamp (one night with the lights out, unchanged);
  - ★★ **honest levels:** no gesture set above what it can do today (C_g; the "realistisch" hints give it), and ≥ 1 gesture at L3 or higher;
  - ★★★ ★★ plus **0 MRC** in that night (every RtI taken within 10 s; a missed RtI becomes an MRC today).
- **Overclaiming is the funny failure.** At the MRC moment, the line stops, the orange lamp comes on, an alarm cue plays, and a **world popup at the cell** says „MRC 23:14 · niemand da“ (the existing toast becomes a popup) + the EMI line + the album (exists).
- **Banner:** „Autonomer Anteil 44 % · 0 MRC“.
- **Panel 121 → ≤ 70 words:** the "realistisch: …" hints become compact tags („real L3–4“) — they are the knowledge you need for honest levels, so keep them; `leverNote` goes to `why`.
- **Lesson:** „Die schwächste Geste bestimmt die Linie.“ (existing)

**D4 · capsule `dunkelfabrik.kapsel` (P2):** on the gallery, behind the Leitstand, next to the lights-out plaque.

### 8.6 Prüffeld (zones-b): `src/zones/prueffeld/`

**P1 · A Vorführung → "Zettelwirtschaft" (P0)** · `showroom.ts`, `flapSign.ts`
- **Stars:**
  - ★ 2 cards (stamp);
  - ★★ 5 cards;
  - ★★★ all 9: the payoff for the question cards earned across the island, and a reason to come back.
- **Each played card:** tag slap (exists) + thud + small burst.
- **At 9/9:** the split-flap sign flips „100 % ERFOLG*“ → „9 FRAGEN · 9 EINSCHRÄNKUNGEN“ / “9 QUESTIONS · 9 CAVEATS”.
- **Panel:** the terminal is a ◆ decision panel (≤ 70 words). The intro sentence goes to ⓘ.
- **Lesson:** „Eine Vorführung ist kein Messergebnis.“ (existing card title)

**P2 · B Unter Last ◆ → "Falsifiziere die 100 %" (P0)** · `messzelle.ts`, `model.ts`
- **Keep** push, shutter, measure and sign flip.
- **Stars:**
  - ★ stamp (n = 200 at ≥ 40 °C);
  - ★★ your prediction lies inside the measured Wilson interval;
  - ★★★ **measure the worst case** at n = 200: 44 °C, Vibration stark, Halle + Gegenlicht, Schichtdauer 8 h, all four at their harshest. The model's mean there is ≈ 65 % (`expectedRate`). The sign flips to that value with the prefix „SCHLIMMSTER FALL:“ / “WORST CASE:”. The goal is condition-based, not value-based, because a threshold on the value would reward binomial luck (± 3.4 points at n = 200).
- **Entscheider consequence line** under the banner, computed: „Bei 1.000 Griffen pro Schicht heißt das ≈ {1000 × (1 − p)} Nacharbeiten.“ / “At 1,000 grasps per shift that means ≈ {…} reworks.” The shift size gets an ILLUSTRATIV chip: „Beispielschicht“ / “example shift”.
- **Lesson:** „Erst viele Versuche unter echten Bedingungen sagen etwas.“ (existing)

**P3 · C Drei Auditoren → "Einig werden" (P1)** · `audit.ts`
- **2× fast-forward toggle** for clip replays: 12 × 4 s becomes ≈ 24 s.
- **Stars:**
  - ★ report printed (κ ≥ 0,8, unchanged);
  - ★★ κ ≥ 0,8 with the first rule you set;
  - ★★★ κ ≥ 0,9.
- **Refusal:** `oops` + „Wir sind uns nicht einig.“ (existing).
- **Lesson:** „Erst eine Regel macht aus Meinungen eine Messung.“ / “Only a rule turns opinions into a measurement.” (condensed from the existing card body)

**P4 · capsule `prueffeld.kapsel` (P2):** behind the Take-Board, the album spot: a double reward for looking backstage.

---

## 9. Entscheider mode: decisions with visible consequences

Same world, same stars. Entscheider players may skip the dexterity stations as today: grey stamp, 0 stars, upgradeable later. Their ◆ stations reward **decision quality and method**, not dexterity. Every one ends in a consequence they can see, not another card:

| Where | Decision | Consequence you see |
|---|---|---|
| 05 B Lückenplan 2030 | robot type per empty post (3 tokens), shifts covered | wall verdicts, person tokens moving to Anlagenführung, the beam tipping at year x, or „kein Pilot“ |
| 05 C Ehrliche Nacht | autonomy level per gesture | the night runs in the dark: autonomous share, RtIs you must catch, MRC stops where you overclaimed |
| 06 B Falsifiziere | test conditions | the sign flips to your number; the rework line for an example shift |
| 02 B Riese | Takt and latency | the 12 m pendulum falls |
| Finale F3 | Pilot / Pilot mit Auflage / Kein Pilot | „Ein Jahr später“ on your F2 numbers, all three options side by side (§5 C8) |

The Befundkarten stay the Entscheider's take-away. They open from the banner ("Befundkarte"), collect in the Pass and go out with the certificate PNG and clipboard text (existing). They no longer open by themselves.

The Werkleiter route stays as it is: 05 → 06 → 02 → 04 → finale, about 25 minutes.

---

## 10. Honesty, brand and new claims

**Stars and the honesty rule.** GDD §5.5 says the Prognose-Güte is "the only score", and the brand says "no pass/fail stamps". The founder's request for "a real fun learn game" supersedes the first rule. This plan keeps the spirit of both:
- stars rate **your play or your method** (hold time, clean demos, honest levels, prediction inside the interval), never a robot, a vendor or a product;
- the stamp value stays your measured value (Kennlinie statt Etikett);
- the Prognose-Güte stays;
- there are no leaderboards and nothing online.

**Proposed founder decision D8** (for `docs/DECISIONS.md`, to be confirmed by the founder; not written by this plan): *"Stars allowed: 1–3 per station, rating the player's own play and method, never a robot or vendor; personal bests stay in this browser; no leaderboards."*

**Brand.**
- Orange stays ≤ 5 % of the screen: stars in the banner are small, and the bursts on success are teal.
- The mark is canonical when lit (§6).
- No blinking position lights.
- Fonts as before.

**New player-facing claims.** No new real-world fact is introduced. Every new number is either the game's own simulation (SIM · LIVE), arithmetic, or a labelled game value or fiction:

| New text | Kind | Source / basis | Chip |
|---|---|---|---|
| „Die Nacht hat 480 davon.“ | arithmetic | 8 h × 60 min; Station 7 fiction (existing) | FIKTION (existing) |
| Robot palletises 3 crates in 60 s | toy model | Station 7's 20 s Takt (existing fiction) | FIKTION |
| „EMI würde x von 30 greifen“, ±5 cm | game value on the existing σ(z) toy model | `messstrecke.ts` model (existing); tolerance invented for play | ILLUSTRATIV „Spielwert“ |
| „Deine Regler: x % stehen“ | live simulation | existing CEM worlds and `runEpisode` | SIM · LIVE |
| „≈ n Nacharbeiten bei 1.000 Griffen pro Schicht“ | arithmetic on the player's measured rate | shift size invented | ILLUSTRATIV „Beispielschicht“ |
| „Ein Jahr später“: 250 / 85 / 30 days, days with loss of control | arithmetic on the player's F2 rates | weather year invented; "a trial = a day" stated | FIKTION + SIM · LIVE |
| Libelle: „{n} Korrekturen“ | arithmetic | the island's fictional 1000 Hz loop (existing plaque) | FIKTION |
| „Policy: Ø 6,9 s“ | live simulation | the existing k-NN rollout | SIM · LIVE |
| EMI skill and companion lines | character lines | no factual content (checked: no rates, no product claims about EMI) | — |
| Sensorkapseln, position lights, Turmsprung | story | island fiction | FIKTION where shown with a chip |

Verified facts stay as listed in `docs/RELEASE.md` §5. Lines reused from there keep their existing sources.

---

## 11. Priorities, order of work, acceptance

### 11.1 Who does what, in which order

| Agent | P0 (must) | P1 (should) | P2 (nice) |
|---|---|---|---|
| **core** | C0 API → C1 banner/juice → C2 Pass → C3 text budgets → C11 tools | C4 first minute, C5 EMI-01 radio, C6 skills (Pass row + lines), C7 F1 stars, C8 „Ein Jahr später“, C9 HUD/map | C6 plaza skill demos, C10 certificate |
| **tower** | §6 items 1–5 (logo progress, ghost, draw, pending, reload) | §6.6 finale switch-on, §6.8 debug hooks | §6.7 foyer stars |
| **landscape** | — (no P0 game items) | W1 capsules, W2 position lights, W3 mast stars | W4 Turmsprung, W5 toys |
| **zones-a** (sensordom, regelgarten, greifwerkstatt) | §8 common rules; S1, S2, R1, R2, G1, G2 | S3, R3, G3 | S4, R4, G4 |
| **zones-b** (lern-dojo, dunkelfabrik, prueffeld) | §8 common rules; L1, L2, D1 (P0 part), D2, D3, P1, P2 | L3, D1 race, P3 | L4, D4, P4 |

**Sequencing:**
- Core commits C0 first: types, a working `ctx.game` with the banner possibly still plain, persistence, events and hooks. Everyone else can start on visuals and logic in parallel and wire `ctx.game` as soon as it lands.
- Zone agents never edit core files. Missing API → note it in the report and use the closest existing call.
- Tower and landscape read `stamp:awarded.earned`, `stars:changed` and `collectible:found` only through events and `ctx.game`.

### 11.2 Acceptance (the pass is done when)

1. `npm run typecheck` is green, and `npm run typecheck:zone -- <id>` is green for all six zones.
2. **Playtest** (DE Entdecker and EN Entscheider) with 0 errors and 0 warnings:
   - 18/18 stamps;
   - ≥ 18 ★ via the solve hooks;
   - 54 ★ via the `stars3-*` hooks;
   - 0 info cards opening on their own in Entdecker mode;
   - finale with F1 stars and „Ein Jahr später“;
   - `finale:ended` fired once.
3. **Text audit:**
   - ≤ 25 words of prose before the first input at every station (key legends excluded);
   - operate panels ≤ 50 words at open (≤ 70 on the two ◆ decision panels);
   - banner lessons ≤ 14 words.
4. **Real-input checks:**
   - `onboarding-run.mjs`: first mechanic before 45 s, first zone ≤ 65 s (ascent watched);
   - every zone agent logs 3 real-input attempts per ★★/★★★ threshold.
5. **Tower:**
   - from the arrival view the ghost logo reads as the EmAI mark;
   - one stamp draws the ring while the medallion is in view, and stays pending while the player is inside the Sensordom;
   - after a reload the state is restored with no re-animation;
   - reset returns it to ghost.
6. **Capsules:**
   - all 12 can be collected with real movement, including the jump-pad apex in flight;
   - position lights match after a reload;
   - (P2) the Turmsprung lands on the Ausguck.
7. **Performance** (`npm run perf`): still ≤ 500 draw calls and ≤ 1.5 M triangles at every view and ≥ 55 fps. The low quality tier works. A view with a burst plus the banner is added to the survey.
8. **Audio:** the 9 new cues fall inside the cue band (−18 … −9 dBFS peak) in `tools/audio-levels.mjs`, with no clipping.
9. **Strings:**
   - every new player-facing string in DE and EN;
   - „du“ only;
   - no vendor names;
   - no new unsourced facts (§10 table);
   - ◆ replaces the old station ★ everywhere.

---

## Appendix: how the audit was measured

| Measurement | Tool / command | Output |
|---|---|---|
| First minutes, real keyboard, DE Entdecker, ascent watched | `PT_DIR=phase4/fun/onboarding node tools/onboarding-run.mjs --lang de --mode entdecker` | `artifacts/phase4/fun/onboarding/run-de-entdecker/` (screenshots + log), `artifacts/phase4/fun/onboarding-de.log` |
| Zone entry: real W key held, view steered at the objective (`__academy.lookAt`), everything the player sees logged every 200 ms until the first station focus, then real E | `artifacts/phase4/fun/probe.mjs entdecker` and `… entscheider` (private production build via `tools/lib/session.mjs`) | `artifacts/phase4/fun/probe-entdecker/` (screenshots, `probe.json`), `probe-entdecker.log`, `probe-entscheider.log` |
| Visible words (innerText) of every station console when it opens | `artifacts/phase4/fun/probe2.mjs entdecker` (interact by label, earlier stations solved with the zones' hooks) | `artifacts/phase4/fun/probe2-entdecker/` (screenshots, `probe2.json`), `probe2-entdecker.log` |
| Info-card word counts, EMI line counts | release text audit (`node tools/text-audit.mjs`) | `artifacts/release/text-audit/de-entdecker.json`, `de-entscheider.json` |
| Score, best values, retry, feedback, timings of watch phases | code read: `setBest` calls (11 keys), per-station `award`, `ui.card` / `openInfoCard` call sites, run constants (`messstrecke.ts` RATE 12/s, `wall.ts` REPLAY_S 4, `stationC.ts`, `nacht.ts` RUN_SECONDS 60, `audit.ts` EVAL_N 100) | — |

Limits of this audit:
- Headless runs have no human eyes or hands. The stations' feel after the first input and the difficulty of each skill toy were judged from the code, the release notes and screenshots, not from a stopwatch on a real player.
- The new thresholds are starting values that the zone agents calibrate (§8).
- All runs used the private production build of `a67f603` at 1280×720.
