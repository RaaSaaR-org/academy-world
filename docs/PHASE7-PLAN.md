# Phase 7 plan: Startklar – the island as the goal

Lead game design and lead architecture, 2026-10-17, **second pass**. The first draft was reviewed by an engineering critique (`docs/research/C1-PLAN-CRITIQUE-ENGINEERING.md`) and a brief, fun and learning critique (`docs/research/C2-PLAN-CRITIQUE-BRIEF-FUN.md`); every BLOCKER and MAJOR is fixed in the text below or rejected with a reason in §10 („Critique log“). Baseline: release candidate 4 (tag `rc4`, founder-approved: „a nice start, let's keep that“). Branch `phase7`, local only: never add a remote, never push. This file is **binding** for every Phase 7 builder; `docs/DECISIONS.md` (D15–D43 are new) overrides it where they differ. Inputs: the founder brief (two parts) and the founder answers of 2026-10-17, README, GDD, DECISIONS, ARCHITECTURE, FUN-PLAN, RELEASE, PHASE6-PLAN, GLOSSARY, the research reports `docs/research/R1`–`R9` and the critiques C1 and C2. The research keeps its sources; this plan cites them as [R1 §x], the critiques as [C1 B1] or [C2 M4], and code as `path`.

**Amendment 2026-10-17 (founder answers on the lift-off gate and the side stations).** D23 is rewritten by the lead on the founder's instruction „do what you think looks the best“: the lift-off is gated by the whole world through three systems, **lift** (the six rotors), **energy** (the Startakku, charged by the Sonnenacker ◆) and **navigation** (the Flugmodell, installed by the Traumhangar ◆). In Entscheider mode the Bodencrew supplies energy and navigation. D40 (side stations) is confirmed. Changed: §1.1–§1.5, §3.1–§3.5, §4.1, §4.8–§4.10, §4.14–§4.16, §5.2, §5.8, §5.10, §6.2, WPS (the system ids in the manifest stubs), WP1, WP7, WP9–WP13, WP18, §7, §9, §10 (notes only) and DECISIONS D23, D25, D27, D36–D38, D40 and D41.

Phase 7 builds on rc4. Nothing is rewritten that does not have to change. Every zone keeps its folder, its contract and its kept stations. The engine keeps its API and gains seams (§5.2). The island keeps its geometry. Section 6 is written so that each work package can be handed to a builder as its prompt.

## Status (the integrator updates this table after every merge)

| WP | Name | Wave | Branch | Status |
|---|---|---|---|---|
| WP0 | Robots pipeline and runtime | 0 → 1 | `p7/robots` | merged: R1 `20f3fc4`; R2–R6 `46fb5b3` (ahead of the wave-1 order, so wave 1 branches with LOD2 and `bodies()`); first-show gate closed in wave 1 (hitches: the duck's first show links 0 programs; robots-adapter-check: 0 for a prewarmed G1); WP5's Request(WP0) commits `87cf45a` (MuJoCo licence) and `2ce6294` (RobotLibrary decodes on the main thread without workers) accepted |
| WPS | Seams and boot split | 0 | `p7/wps` | merged (`7ffc311`, with the wave-1 contract stubs of WP1, WP2, WP3, WP4, WP12); tag `p7-w0` |
| WP1 | Quest spine, save v2, title and UI | 1 | `p7/wp1` | merged `484ba96` (head `e5052cf`; its Request(WP4) `bd1caf0` accepted); fix round: a11y-keyboard cases for the credits page and the three title states (with WP7), done by WPF in wave 2 (merged `069025b`) |
| WP2 | Sky, environment, sky dressing (+ hangar spike) | 1 | `p7/wp2` | merged `a2cd1da` (head `71192f2`); `src/zones/_traum-spike/**` moves to WP10 at `p7-w1` |
| WP3 | Ground and dock | 1 | `p7/wp3` | merged `ebde920` (head `c856185`; its Request(integrator) `d7a9891`, .bin served as brotli, accepted); integrator: the terrain draws after the island's opaques (`5fd4e96`/`82514f7`); wave 2: fix duty for the three G-LOOK fixes, the plaza GPU A/B (+0.16–0.22 ms over rc4) and the duck-field triangles (ground +119 k); the fix duty (G-LOOK fixes, duck field 950.8 k → 877.6 k, island terrain set): done by WPF in wave 2 (merged `069025b`); the plaza GPU A/B still misses at rc4 + 0.22 ms (WP17 in wave 3) |
| WP4 | Engine: frames, sites, flight, robots adapter | 1 | `p7/wp4` | merged `dff32c5` (head `bd1c47f`; its Request(WP12) `504aefa` superseded by WP12's onboarding); `src/world/layout.ts` frozen from `p7-w1`; fix round: a 'robots:retry' path, the program links that hitch in WebKit, done by WPF in wave 2 (merged `069025b`) |
| WP5 | Regelgarten: „Lauf, Ente!“ (MuJoCo) | 1 | `p7/wp5` | merged `71a5186` (head `cc6b63d`; Request(integrator) `3f43b4d`, @mujoco/mujoco 3.16.0, accepted; the lockfile came with it); integrator shortened four EN console labels (`556483b`); the Regelgarten exterior at the plaza 24 → 9 draws (mid set): done by WPF in wave 2 (merged `069025b`) |
| WP7 | Tools and gates | 1 | `p7/wp7` | merged `1c96cf0` (head `e8f8f3b`); integrator tool fixes `88d0185`, `b293b35`, `35910ed`, `4c126db`; wave-2 tool fixes by the integrator `614d2b8`, `03f8049`, `7d03123` |
| WP12 | Rotors and start flow (island owner) | 1 | `p7/wp12` | merged `fb87db7` (head `a020740`); integrator: the movement card hides under the pause menu and panels (`2ff64c0`). Wave 1 tagged `p7-w1` after this merge order and the exit criteria (§6.5) |
| WPF | Wave-1 follow-ups (fix duty in WP3, WP4, WP5 and WP7 files) | 2 | `p7/wpf` | merged `069025b` (head `b8fb17d`; Request(WP0) `5cb7861` and Request(WP7) `adf625d` accepted) |
| WP6 | Lern-Dojo: SO-101 VLA | 2 | `p7/wp6` | merged `485ddef` (head `987e4c5`; Request(WP12) `2205f05` and Request(WP7) `696e9ce` accepted); integrator: a played A upgrades a skipped stamp (`9efdafd`) |
| WP8 | Island zone fixes (01, 03, 05, 06) | 2 | `p7/wp8` | merged `f1a320f` (head `0be1381`; Request(WP12) `ec5589c` accepted); its two fixed known misses became standing ledger limits (`614d2b8`); fix duty in wave 3: the Prüffeld vendor terminal reads 37 > 35 words in English once most question cards are held |
| WP9 | Sonnenacker | 2 | `p7/wp9` | merged `d192246` (head `de76a13`; Request(WP7) `9055a6b`, `badad47`, `8404514`, `07b9eac`, `83f9b5c` accepted; conflict in `tools/perf-cpu.mjs` imports resolved); the Kurzlauf `erntetag.json` is current (`--check`) |
| WP10 | Traumhangar | 2 | `p7/wp10` | merged `a37998f` (head `5d2ad9e`; Request(WP7) `165cf49`, `d4d04ed`, `78734b9` accepted; `_traum-spike` deleted); integrator: the B and C album entries registered plus an 'album' hook (`b668c5e`), the spawn inside the hall (`7142fb3`); the Kurzlauf `traumdaten.json` is current |
| WP11 | Schauhalle Nord | 2 | `p7/wp11` | merged `4778894` (head `006349f`; Request(WP4) `0c1cba2`, `a6d5cc8`, Request(WP12) `607fe1c`, Request(WP7) `8732e08`, `fe6fa5b` accepted); the hall's areas bucket is a known miss (20 > 10, the lobe 02/03 exteriors through the side glass, WP11/WP17) |
| WP13 | Startprüfung and lift-off | 2 | `p7/wp13` | merged `afdd668` (head `1fe1077`; Request(WP12) `dabb83a` and Request(WP7) `a6ab06a` accepted). Wave 2 tagged `p7-w2` after this merge order; the wave tier passes except five owned wave-3 misses in six steps, none of which breaks play: the plaza GPU A/B at rc4 + 0.22 ms, programs at the title 155 > 150, WebKit walking frames from texture uploads, suspended ground areas that keep their GPU memory (memory-lap), and the Prüffeld vendor terminal at 37 words in English (both EN text-audit runs). Logs: `artifacts/phase7/gates/wave-03f8049.json` (full) and `wave-7d03123.json` (rerun) |
| WP14 | Revier and use-case scenes | 2 | `p7/wp14` | merged `ef4357b` (head `e3c50ce`; Request(WP1) `f4faef0`, `efc3bc1` and Request(WP7) `ef1f958`, `e721bbf` accepted; conflicts in `DebugApi.ts` and `text-audit.mjs` resolved as in p7/wp15) |
| WP15 | Life and easter eggs | 2 | `p7/wp15` | merged `0b27777` (head `b6e9175`; its Request(integrator) `b3777bd` superseded by WP14's `f4faef0`); integrator: the pods' tomato vines draw in a near tier (`fffbc3c`) |
| WP16 | SHOULD content | 3 | `p7/wp16` | **backlog** (the founder's scope cut of 2026-10-18: wave 3 is a slim release); not started, see „Backlog after rc5“ below |
| WP17 | Perf and look | 3 | `p7/wp17` | done as **WP17-lite** (the slim release's fix list): merged `bcd637d` (head `ec86a5f`). Plaza GPU rc4 + 0.22 → + 0.18 ms (still over + 0.15: known limitation under D44 (1), founder told), programs at the title 155 → 150, suspended ground areas give their robots' GPU buffers back (memory-lap 9/9), the Schauhalle's other areas 20 → 17 (the Regelgarten mid set inside the hall), C1's tree crown and the near-opaque dialogue panel. Item 6 (WebKit upload frames) skipped; the Greifwerkstatt mid tier is missing for the hall's cap of 10 |
| WP18 | Copy, facts, docs | 3 | `p7/wp18` | done as **WP18-lite**: merged `6475ce7` (head `5374fe4`). Facts register for Phase 7 (RELEASE §5), D44, `docs/LEGAL-REVIEW.md`, GLOSSARY, README, GDD and ARCHITECTURE as built; the Prüffeld vendor terminal 37 → 35 EN words (copy only). Open: LeKiwi's price band has no source; the Unitree no-endorsement line is the lawyer's call |
| WP19 | QA and release | 3 | `p7/wp19` | done as the **release pass** on `phase7` (no branch): the wave gate on `6475ce7` (`artifacts/phase7/gates/wave-6475ce7.json`), the release gallery (`artifacts/phase7/release/`), `deploy-check --preview`, `docs/RELEASE.md` §1–§3 for rc5; tag `rc5`. The §8.2 people sessions were not run (backlog) |
| WP20 | Fun tuning | 3 | `p7/wp20` | **backlog** (scope cut of 2026-10-18); needs the §8.2 round 1 first |
| Wave 3 | Slim release (WP17-lite, WP18-lite, release pass) | 3 | `phase7` | **done**: WP17-lite and WP18-lite merged (`bcd637d`, `6475ce7`), no integration fix needed; the wave tier on `6475ce7` passes 49 of 51 steps (`artifacts/phase7/gates/wave-6475ce7.json`, 323 min). The two misses, both listed in RELEASE §3 and neither breaking play: the plaza GPU A/B at rc4 + 0.18 ms (4.52 ms; a confirmation run 4.50 ms, rc4 + 0.17; D44 (1), founder told) and WebKit walking frames from texture uploads (8 in the gate's lap, 2 in a rerun). Both routes in both languages reach the lift-off and the certificate (four full playtests plus the rc4-mid save). Schauhalle GPU 4.50 ms (budget 5.0). Tagged `rc5` (annotated, local) on the commit that adds RELEASE §1–§3; `main` keeps rc4 until the founder has played rc5 |
| H-TIME | Timing session on rc4, two first-time players | 0 → 1 (day 8) | — | open; not held, folded into the backlog's first people session |
| G-LOOK | Founder approves one still of the ground look | 1 (day 5) | — | **approved 2026-10-18 with three fixes** (D42): warm-neutral fields, pit-lake far banks, the mining past visible (terraces, spoil heap, the bucket-wheel landmark); cloud ceiling kept. Fixes are wave-2 work for WP3 (fix duty) and WP14. The merged wave-1 head's stills (the three views plus the title and the Probestart, without the fixes yet) are in `artifacts/phase7/lookdev/g-look-w1/`. The three fixes were built by WPF; its stills are in `artifacts/phase7/lookdev/g-look-v2/` (founder look open), the wave-2 stills in `artifacts/phase7/lookdev/w2/` |
| G-FARM | Founder looks at one Sonnenacker still (non-blocking) | 2 (day 4) | — | still delivered by WP9 (`artifacts/phase7/lookdev/g-farm-v1/`); founder review open (non-blocking, at p7-w2) |

### Backlog after rc5

Everything Phase 7 planned that rc5 does not have, each with its next step. The release record is `docs/RELEASE.md` §1–§3 (rc5).

**Content and tuning (moved by the founder's scope cut of 2026-10-18):**
- **WP16 SHOULD content** (≈ 12 builder-days + the 2-day Profi-Ente spike): the Feldbahn + Bahnhof + Dorf scene, the SHOULD life (L6, L9–L14, L16, the copter crate aboard), the SHOULD eggs (egg 22; the Asimov, Turing, Weizenbaum and Moravec history cards) and region extras, the Seeblick, the compare-stage extras. Next step: branch `p7/wp16` off `rc5` with the WP16 prompt of §6.7, acceptance unchanged.
- **WP20 fun tuning** (≈ 4 builder-days): the ten key moments, `src/**/tuning.ts` only. Next step: run the §8.2 fun-and-time round 1 on rc5, then tune from its notes.

**Unfixed misses of rc5 (measured; none breaks play):**
- **Plaza GPU frame, rc4 + 0.18 ms** (4.52 against 4.34 ms; budget 4.5 or rc4 + 0.15). Next step: make the terrain fragment's farmland block beyond 400 m (parcel hash and `fwidth`) cheaper on the plaza's horizon band, then `gpu-ab --views plaza --runs 5` on a quiet machine.
- **Schauhalle other-areas draws, 17 against 10.** Next step: a Greifwerkstatt `buildExteriorMid` (≤ 1 draw) shown on `zone:enter` schauhalle (5 + 1 + 4 = 10), then lower the known entry in `tools/lib/views.mjs`.
- **WebKit walking frames over 33 ms from texture uploads** (8 in the gate's lap, 2 in a rerun; up to 48 MB in one frame at the Schauhalle approach; Chromium 0). Next step: upload an area's exterior textures with `renderer.initTexture()` one per idle slot after its chunk loads, before the exterior first shows.
- **Smaller items:** watch-audit judges no unattended stretch in the gate (the playtests solve by hooks): feed the bot runs into it (WP7 tools). `_site-example` should load a robot only the site uses, so robots-adapter-check sees a site's queue again. The operate-mode camera drifts about 0.1 m between pointer events (WP4). Onboarding should key on the flight state and point to the Ausguck console once armed (WP12's files). A queued EMI egg line can spill into the next area's entry (drop queued egg lines on `zone:enter`). The ✓ resolver block is not self-hosted (needed before a 3D text uses ✓).
- **Facts and legal:** LeKiwi's price band „unter 1.000“ has no source: read the BOM of `SIGRobotics-UIUC/LeKiwi` at `efa608d` and add a dated QUELLE to `src/zones/schauhalle/data/sources.ts`, or show „auf Anfrage“. The Unitree no-endorsement line: if the lawyer wants it, add it to `CREDITS` in `src/core/credits.ts` (DE/EN) and the Unitree notice in `tools/robots/sources.mjs`. Re-check the three secondary figures (H2 status R4 S62, H2 reseller price R4 S63, Spot's 2020 price R4 S37) against their pages.

**Human sessions and sign-offs (plan §8.2–§8.4; none run for rc5):**
- **Fun and time, rounds 1 and 2** (5–6 first-time players each, incl. teenagers): Entdecker median 80–100 min, ≥ 1 secret in 10 min for 4 of 5. Next step: run round 1 on rc5 with local JSON exports.
- **Entscheider** (2–3 managers): median ≤ 30 min, Befundkarten understood. Next step: one session with the Lern-Dojo path and the Schaufenster timed by hand.
- **Controls** (3 players): SO-101 teleop, humanoid piloting, duck sliders, Kanzel hops, the Sonnenacker console, the lift-off hold-E. Next step: one session, one zone each.
- **Motion** (5 players incl. one motion-sensitive) and **photosensitivity** (a reviewer, with `flash-check` passing): the lift-off with outside shots on and off, the RM stills, the hops, the head camera. Next step: one session each.
- **Screen reader** and **browsers** (M1 Air Safari and Chrome, Windows Edge, Firefox current and 108–113). Next step: one pass each, WebKit upload frames included.
- **Founder:** confirm D15–D44 (D44 = the six wave-2 defaults), look at G-LOOK v2 and G-FARM, play rc5 (`main` keeps rc4 until then), arrange the legal review (`docs/LEGAL-REVIEW.md`) and its sign-off, test the rc4-save migration in the own browser. Next step: the founder plays rc5 locally.
- **Hosting:** `node tools/deploy-check.mjs https://<host>/` plus one GLB and the MuJoCo wasm on the real host. Next step: after the host exists.

**Contents:** 1 Vision and journey · 2 World layout · 3 Quest spine „Startklar“ · 4 Stations · 5 Architecture · 6 Work packages (builder prompts) · 7 Scope, effort, cut order · 8 QA and release · 9 Risks · 10 Critique log

---

## 1. Vision and the player journey

### 1.1 Vision in ten lines

1. The Schwebewerk is a flying machine that cannot fly yet. It sits in **Trockendock 3**, the last pit of reclaimed open-cast mining land, „Das Revier“.
2. In minute one you press start and it fails. The island lifts a hand's breadth, tilts and sinks back, and three systems turn red on the Libelle in front of you: **lift** (six rotor lamps), **energy** (an empty start battery, the Startakku) and **navigation** (a dark nav lamp). The tower repeats them for everyone.
3. The whole world gets it flying. Each of the six zones brings one rotor online: you measure it ready, and you hear, see and feel it. Down in the Revier, the Sonnenacker charges the Startakku from its tomato field. The Traumhangar's checked world model becomes the island's Flugmodell for the blind climb through the cloud.
4. Real robots replace stand-ins: the SO-101 learns from you and follows words, the Open Duck Mini learns to walk from your reward, and Unitree humanoids dream before they act.
5. The land around the dock is a believable 2030s future, solarpunk but real (§2.7): an agrivoltaic tomato farm run by SO-101 arms, rovers and people, plus repair and sorting and weeding without poison, all on a former mining pit.
6. A glass Schauhalle on the island shows 20 real robots at true scale, each showing what it is built for, with datasheets, conditions, price bands and a crate scale: a car dealership that never sells.
7. Before the flight, the Startprüfung clears the controller: hover 10 m in the dock, audit the vendor's „99 %“, sign your recommendation.
8. Your recommendation flies the lift-off, and you hold the thrust: ≈ 100 s from the dock through the cloud bank into the sun. The solar rows of the Revier turn flat in a wave below you, and the Flugmodell you checked dreams the way through the whiteout.
9. After the climax the island is yours in the air; the dock, the farm, the hangar and the H2 trophy stay one switch away.
10. Every number still has a condition and a chip. **Messung statt Marketing.**

### 1.2 The first five minutes (Entdecker, first visit, real keys; targets measured with `tools/onboarding-run.mjs`)

| t | What the player sees and does | System |
|---|---|---|
| 0.0 s | Title over the docked island (orbit 18 m above the apron: dock slot, cranes, cloud bank, lake glitter WNW; crown beacons and needle light dark; **no flying platform anywhere**, §5.3 rule 2b). Subtitle (§4.1). Start | `StartScreen`, `ATTRACT_CAMERA` |
| 0.0–6.0 s | 6 s glide from the title orbit down to the bridge head; skippable (Space, Enter, E, click); under reduced motion a 0.4 s fade. First visit only (`p7.quest.start.glideSeen`) | `intro.ts` spline and skip, shortened |
| 6.0 s | In control at the bridge head, feet (0, 0, 114), bearing 0, pitch +6°. The GDD §4.7 composition holds from 19.5 m further back (mark centred, Prüffeld left, Dunkelfabrik right). The movement card shows at once | `TROCKENDOCK.bridgeHead` spawn (layout); `HUB.spawn` (the Messpunkt) stays for `?skipIntro=1` and the tools; W2 card |
| 6–8 s | Dock gust: the six dock arms twitch with a hydraulic sigh. No tilt while docked (§5.3 rule 4). Radio EMI-01: „Spürst du das? Die Haltearme fangen jede Böe ab. Komm zur Libelle.“ | `dockGust()` → `ground.catchGust()` |
| 6–12 s | First find on offer: the idle SO-101 on a post by the bridge sign **waves at you as you pass**; wiggle the view 3× and it waves back (egg 13, H0) | WP15 |
| 8–11 s | The 13 m bridge over the 66 m slot: depth ticks on the dock wall, cold rotor ducts M5/M6 under the lobes left and right | WP3 |
| 11–14 s | Landedeck; the Messpunkt plate (optional E card, unchanged) | rc4 |
| 14–26 s | Allee: the number line draws itself under your feet (rc4); 90 m from the bridge head to the Libelle (20 s walking, 11 s sprinting) | rc4 |
| ≈ 27 s | **First mechanic: Probestart.** Hold E 1 s on the lever at the Libelle column (−3.3, 0, 22.7). The cold rotors cough, and a puff of slot spray rises at the two southern lobes (M5, M6). The world sinks 0.3 m (the island rises) and tilts 2.2–2.9°, the Libelle ball rolls out and back, and the arms catch the island with a thud. **The three systems on the Libelle plinth at eye height turn red one after the other:** AUFTRIEB (six lamps, labelled SEHEN … MESSEN), ENERGIE (the 10-segment Startakku bar, empty with a red outline) and NAVIGATION (the nav lamp). The six crown beacons repeat the rotors and the needle light repeats the nav lamp. Readout „LAGE {max}° · AUFTRIEB 0/6 · AKKU 0 % · NAV AUS“ (FIKTION) | `toyGust()` + `ctx.island.setAltitude(0.3)`; Libelle lamps + bar + nav lamp, crown beacons, needle light |
| ≈ 32 s | EMI-01: „Drei Systeme rot: Auftrieb, Energie, Navigation. Bring sie zum Leuchten.“ … „Auftrieb kommt aus den sechs Zonen. Strom und Flugmodell holen wir unten im Revier.“ … „Schau hoch: Der Turm zeigt es allen. Dann heben wir ab.“ **Entscheider**, line 2: „Die sechs Rotoren misst du selbst. Akku und Flugmodell stellt die Bodencrew.“ The bar fills in ≤ 3 s and the nav lamp turns teal, both tagged BODENCREW (§3.3) | `onboarding.ts` |
| ≈ 38 s | Pass handover as the „Startliste“ (cover „Startklar“ with three lines: Auftrieb 0/6 · Energie 0 % · Navigation aus); „[Tab] öffnet ihn“ after `dialogue:idle` | rc4 W4 |
| ≈ 42 s | Objective: the orange hub pad 270 (Sensordom) with its plaza beam | rc4 W5 |
| ≈ 48 s | E on the pad, 2.5 s hop | rc4 |
| ≈ 55 s | **First zone (target ≤ 65 s).** EMI-02 request: „Die Insel landet blind. Zeig mir, was meine Sensoren übersehen.“ | WP8 |
| 1:00–3:30 | Sensordom A Messbrille: tag five things; a wrong view now gives a harmless gag miss (EMI-02 grabs thin air, a popup names the blind spot), no star cost | WP8 |
| ≈ 3:30 | First stamp: banner, tower line 1/18, crown beacon 01 and Libelle lamp 01 turn **amber** („in Arbeit“) | WP12 |
| 3:30–5:00 | Sensordom B Dunkelkammer: the glass bump at ≈ 4:10 (rc4, unchanged) | rc4 |

Targets: first mechanic ≤ 30 s, first zone ≤ 65 s (rc4: 42.2 s / 60.9 s with the ascent).

### 1.3 Entdecker route (design target ≈ 94 min; pass rule: median 80–100 min)

The objective system leads the route. The route covers every ◆ station plus the stations the lesson chain needs. **05 B and 06 C are side stations** in Entdecker mode (D40, confirmed by the founder 2026-10-17): signposted with a grey objective chip, their stars count, the objective skips them. The Revier, the hangar and the hall join the route where they fit geographically and thematically. Minutes are design targets; they are recalibrated after H-TIME (wave 1) and the block-out session (wave 2, day 8) (§8.2).

**The Entdecker lift-off gate is the whole world (D23):** the six island ◆ (lift), the Sonnenacker ◆ „Erntetag“ (energy: the Startakku), the Traumhangar ◆ „Traumdaten“ (navigation: the Flugmodell) and the signed F3. Both ground ◆ were already on this route (steps 2 and 7), so **the route time does not change** (≈ 93.7 min). Since both detours now gate the lift-off, neither can leave the route. If the route runs long, the levers stay the side stations, the second cut tier below and the cut order (§7).

| # | Step | Stations (target min) | Step min | Cum. | What changes in the world |
|---|---|---|---|---|---|
| 0 | Title → bridge → Probestart → Pass → pad | — | 1.0 | 1.0 | three systems red (six lamps, the empty Startakku, the dark nav lamp) |
| 1 | 01 Sensordom | A 2.5 · B 2.5 · C ◆ 3.0 | 8.0 | 9.0 | **M1 bereit**; the bridge-head gate and the Kanzel pads open (Revier) |
| 2 | Sonnenacker (pad K240 → G240, path to the Hofladen, back the same way) | A 2.0 · B 2.5 · C ◆ 3.5 · travel 2.0 | 10.0 | 19.0 | **Startakku voll** (ENERGIE, a third per stamp on the way); trim **T3** online; the Tomatenkapsel aboard lights |
| 3 | 02 Regelgarten | A 3.0 · B ◆ 3.5 · C 7.0 · travel 0.5 | 14.0 | 33.0 | **M2 bereit**; the Libelle switches BODEN → LAGE |
| 4 | Schauhalle, first visit (on the ring between 02 and 03) | Größenwand 0.5 · Kistenwaage 1.0 · one Lastenheft round 2.0 · deliveries 0.5 | 4.0 | 37.0 | ANYmal D and Open Duck unboxed; Lastenheft stamp |
| 5 | 03 Greifwerkstatt | A 3.5 · B 4.0 · C ◆ 3.0 · travel 0.5 | 11.0 | 48.0 | **M3 bereit** |
| 6 | 04 Lern-Dojo | A 3.0 · B ◆ 3.5 · C 3.0 · travel 0.5 | 10.0 | 58.0 | **M4 bereit**; KIEL opens (4/6) |
| 7 | Traumhangar (pad K120 → G120 → Werft) | A 3.0 · B 3.0 · C ◆ 4.5 · travel 2.0 | 12.5 | 70.5 | **Flugmodell an Bord** (NAVIGATION; the needle light turns teal); trim **T2**; R1, G1, H1-2 delivered to the Schauhalle |
| 8 | 05 Dunkelfabrik (B side) | A 2.0 · C ◆ 4.5 · travel 0.5 | 7.0 | 77.5 | **M5 bereit**; pallets roll into the hold |
| 9 | 06 Prüffeld (C side) | A 2.0 · B ◆ 4.5 · travel 0.5 | 7.0 | 84.5 | **M6 bereit**: the 6/6 beat, which on this route is also the Startklar beat (§3.3) |
| 10 | Lift → KIEL: Startprüfung | F1 1.5 · F2 2.5 · F3 1.5 · travel 0.5 | 6.0 | 90.5 | armed |
| 11 | Ride → Ausguck → lift-off → dusk → certificate | ≈ 100 s + 20 s + 1 min | 3.2 | ≈ 93.7 | airborne |

Not on the route (optional before or after the lift-off): 05 B, 06 C, Kreislaufhof, Unkrautacker (and the SHOULD/COULD scenes), more Lastenheft rounds, the H2, 12 Sensorkapseln, 25 secrets, ★★/★★★ goals. **Second cut tier, pre-committed** (used if the wave-2 block-out session measures > 100 min): duck C3 live retraining becomes recordings; Traumhangar B Messlauf drops to 2 horizons; Sonnenacker B runs its season without the hail.

### 1.4 Entscheider route (design target ≈ 29 min; pass rule: median ≤ 30 min)

Six ◆ stations on one clockwise loop, plus the **Schaufenster** stop in the Schauhalle on the way (D41), so decision-makers see RL, world models, real robots at true scale and price bands.

**The Entscheider lift-off gate (D23):** the six island ◆ + the signed F3. Energy and navigation come from the **Bodencrew** right after the Probestart, with the honest label „von der Bodencrew bereitgestellt“. The Schaufenster shows the recorded Sonnenacker and Traumhangar runs behind them, so managers see what powers the island. A short Sonnenacker ◆ variant on the route was considered and rejected. The round trip K240 → Hofladen and back (≈ 1.5 min) plus a ≥ 2.5 min station would put the route at ≈ 33 min, past the pass rule.

| # | Step | Min | Cum. | Rotor |
|---|---|---|---|---|
| 0 | Title → bridge → Probestart → Pass (same beats, „Werkleiter-Route, ca. 30 Minuten“) | 1.0 | 1.0 | — · AKKU and NAV by the Bodencrew |
| 1 | 05 C Licht aus ◆ (A skipped by default; „Schicht ansehen“ optional) | 3.0 | 4.0 | M5 · Revier opens (not on the route) |
| 2 | 06 B Unter Last ◆ (cards #1 #3 on arrival, #2 on the first n = 200; shorter setup) | 3.0 + 0.5 travel | 7.5 | M6 |
| 3 | 01 C Messstrecke ◆ | 2.5 + 0.5 | 10.5 | M1 |
| 4 | 02 B Regler & Takt ◆ | 2.5 + 0.5 | 13.5 | M2 · KIEL opens |
| 5 | **Schaufenster** (Schauhalle, on the way): Größenwand, G1 datasheet, three Kurzlauf stands („Belohnung“, „Erntetag“, „Traumdaten“; §4.9) | 2.5 | 16.0 | — |
| 6 | 03 C Lastdiagramm ◆ | 2.5 + 0.5 | 19.0 | M3 |
| 7 | 04 B Befehlen ◆ (50 preloaded demos, two cards) | 3.5 + 0.5 | 23.0 | M4 |
| 8 | Startprüfung: F1 0.75 · F2 1.5 (protocol tab collapsed by default) · F3 1.0 + 0.25 travel | 3.5 | 26.5 | armed |
| 9 | Lift-off, certificate, Befundkarten PNG and checklist | 2.5 | 29.0 | airborne |

Optional Entscheider detours with their own Befundkarte: the full Schauhalle (Lastenheft job), Sonnenacker C (6 min incl. the economics overlay of B), Traumhangar „Traumdaten-Deal“ (4 min). Earning the Sonnenacker or Traumhangar ◆ on a detour replaces the Bodencrew label of that system with the player's own value, as with the rotors. If first-time managers need > 30 min, the fallback is R5's ground crew for two rotors („Bodencrew · ohne Kennlinie“), through the same mechanism as the asset fallback (§5.8).

### 1.5 The lift-off, the ending and what is left

- **The gate** (D23): all three systems ready plus the signed F3. In Entdecker mode that is the whole world: six island ◆ (lift), the Sonnenacker ◆ (energy) and the Traumhangar ◆ (navigation). In Entscheider mode it is six island ◆, with energy and navigation from the Bodencrew. Nothing else gates it; the H2 stays optional (D21).
- **Lift-off** (§4.15): ≈ 100 s from the Ausguck console. The console shows the three systems ready: six rotor lamps, the Startakku bar full, the nav lamp on standby. The rotors spin up around you, thrust reaches weight (T = W), and the arms release. **You hold E for thrust above 100 %**; releasing it holds the island in a hover. The island rises out of the dock (outside shot C1, with the dock crew and the waving SO-101 on the apron) into the cloud shadow, while a wave of solar trackers stows flat across the Revier. Before the whiteout the nav lamp switches to active. Then 6 s inside the cloud: the Flugmodell draws its teal ghost horizon 2 s ahead, and your F3 controller flies the gust. Then the break-out („Gefangen. Die Insel ist ein Roboter – und du stehst drauf.“), the sister platforms appearing for the first time, outside shot C2, and the level-off 570 m above the dock.
- **The show grows with completion, never gated:** each online trim adds a Recamán note and a plume; „geprüft“ systems keep a steady halo; stamped sites send their people to the apron; earned robots ride along as guests; 12/12 capsules complete the night ring.
- **Ending:** the rc4 dusk (20 s), then the certificate on the Ausguck. It gains the line „Erstflug: {Datum} · {n}/6 Rotoren selbst gemessen“, a second line „Startakku: {selbst geladen | von der Bodencrew} · Flugmodell: {selbst geprüft | von der Bodencrew}“ and a back side **„Was du unten gesehen hast“** (§2.8). Then free roam in the air. The optional „Erstflug-Protokoll“ (rc4's „Ein Jahr später“) is a button on the certificate.
- **Left to do, airborne:** ★★/★★★ on the island stations; the 12 Sensorkapseln (12/12 = the full ring of position lights at night, the Turmsprung); island secrets and the Fotopunkt; Schauhalle deliveries by stars, the Lastenheft, the compare stage; „Start wiederholen“; the TAG ↔ ABEND sky switch.
- **Left to do, in the dock** („Im Dock weiterspielen“ on the title, „Zurück ins Dock“ on the Ausguck console; both a fade, no landing sequence): the Revier sites and their stars, the Traumhangar and the **H2 Meisterprüfung**, ground secrets, the farm shift.

---

## 2. World layout

### 2.1 Frames and the one rule

- Axes as GDD §4.1: metres, y up, origin = tower axis at deck level, north = −z, east = +x, bearing b → direction (sin b, 0, −cos b). Every coordinate below is world, at altitude h = 0 (docked).
- **The island never moves; the world does.** Island geometry, island colliders, island zones and merged statics never change their transform. Altitude h moves the ground frame (`ground.root.position.y = −h`), the slab and the cloud sea, through **one** engine setter (§5.3). Ground colliders exist only when docked.
- Three frames:
  - **island:** deck, six lobes, Schauhalle, underside, Kielraum, Ausguck;
  - **ground:** dock, Werft, Revier, Traumhangar, Sonnenacker, use-case sites;
  - **sky:** the rc4 sky dressing (sister platforms, Prüfinseln, wisps). Hidden while grounded; revealed after the break-out (§5.3 rule 2b).
- Every plot declares its frame (§5.2).

### 2.2 Map (schematic; the table in §2.3 is authoritative)

```
                                                       N (−z)
                              T3 ⊥ (0,−600)          ·                         WINDKAMM landmarks (SHOULD)
                                                          T1 ⊥ (150,−420)          T2 ⊥ (300,−520)
 ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈/  SEEBLICK ◇ (−480,−180)
 ≈≈≈≈ REVIER-SEE ≈≈≈≈/               UNKRAUTACKER ▦ (−230,−260)
 ≈≈ flooded pit ≈≈≈≈/                PV fences + sheep      (F3)··············(F4)        cloud shade beyond
 ≈≈ lake, y −20 ≈≈≈/                                       ·                     ·        proj(115°) > 251 m
 ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈/                                       ·  ⊙G300      G60⊙  ·          ,  ,  ,  ,  ,
 ≈≈ shore with   ≈/  SONNENACKER ▤▤▤ (−290,60)          (F2)      .-~~~~~-.     (F5)   KREISLAUFHOF ▣ (340,−40)
 ≈≈ mining      ≈/   PV roof over raised beds             ·      /  DOCK   \     ·   ,  WERFT: cranes K1 K2  ,
 ≈≈ terraces    /    Hofladen (−215,70) ⌂ Grubenrand      ·     | ISLAND  |    ·   ,                        ,
 ≈≈≈≈≈≈≈≈≈≈≈≈≈≈/     (−195,88) Schaufelrad               ·  ⊙G240 '-~~+~~-' G120⊙  TRAUMHANGAR ▣ (123,110)
 ≈≈≈≈≈≈≈≈≈≈≈≈≈/                                         (F1)······ bridge ···(F6)   HOLZBAU ○ (230,230)
 ≈≈≈≈≈≈≈≈≈≈≈≈/                                     DORF (−45,256) · BAHNHOF (0,208)
                                                       S (+z)
 Legend: ⊙Gb ground pad r 150 on bearing b (hop from the Kanzel pad)   (Fn) Feldbahn stop r 240 (SHOULD)
         ▣ hall   ▤ Agri-PV roof   ⊥ wind turbine   ≈ lake   , cloud shade   ⌂ landmark   island and dock r ≤ 106
```

Island inset (GDD §4.9 stays valid; new items marked ✚):

```
                    N        ✚ SCHAUHALLE NORD  x −15…15, z −80…−52 (PV tracker rows on its roof frame)
              GLASBALKON (0,−92)          north spoke runs through the hall's central aisle
     02 REGELGARTEN ·   frosted side walls   · 03 GREIFWERKSTATT
   ✚K300 pad (r 85)    TURM (0,0)    ✚K60 pad (r 85)
 01 SENSORDOM                          04 LERN-DOJO
   ✚K240 pad (r 85)   Libelle ⊙ Probestart lever + six lamps    ✚K120 pad (r 85)
     06 PRÜFFELD ·    Allee      · 05 DUNKELFABRIK
                   LANDEDECK (0,92)
                      ✚ BRIDGE z 101 → 114 · ✚ bridge head and spawn (0, 0, 114) · ✚ Revier gate z 121
```

### 2.3 Coordinate table

| Element | Frame | Centre / extent (world m) | Bearing, distance | Size | Note |
|---|---|---|---|---|---|
| Six lobes / zones 01–06 | island | GDD §4.3 (unchanged) | 270/330/30/90/150/210, r 80 | r 22 | rotors M1–M6 under them at y −12 |
| Schauhalle Nord | island | rect x −15…15, z −80…−52, centre (0, −66) | 0°, 66 m | 30 × 28 × 9 m | ≥ 3 m to both plot circles (R4 §7.1). Tiers by rect distance: detail ≤ 8 m outside the rect, exterior ≤ 60 m. `interior: true`: while you are inside, the neighbouring lobes drop to their exterior tier [C1 M2]. Frosted side walls toward 02 and 03. WP12 clears `landscape/plan.ts` `PV_FIELDS[2,3]` and the north-spoke inlays and lanes inside the rect; their 8 tracker segments sit on the hall's roof frame at y 9.3 (island geometry, WP12) |
| Kanzel pads K60/K120/K240/K300 | island | polar(b, 85) for b 60/120/240/300 | r 85 | Ø 3 m | at the stub end; armed once the Revier is open, dark when airborne |
| Tomatenkapseln | island | rc4 pods (`landscape/plan.ts` `PODS`) at bearings 60/120/240, r 27.4 | — | r 3 | pod 240 holds one SO-101 (LOD1) |
| Dock wall | ground | `outlineRadius(b, true) + 4` | r 89–106 | depth 66 m, ticks 0–66 m | ribs, mining terraces in the upper 12 m (D19) |
| Dock floor, keel block | ground | y −66; block (0, −66 … −60, 0) | — | r 4 | wet floor. **Rescue volume** over the floor and the keel block (player rescue, dynamics reset) [C1 M7]; `ISLAND.killY` −66 stays the backstop |
| Dock arms (Haltearme) | ground | wall → lobe tips at 30/90/150/210/270/330 | r 102 → 106 | 6 | swing back at the release beat |
| Bridge | ground | x 0, z 101 → 114 | 180° | 13 × 4 m | the slot is widened to 13 m only here; retracts at the release beat; gap in the Landedeck railing (WP12) |
| Bridge head, spawn, gate | ground | apron z 114–126; spawn (0, 0, 114) → bearing 0, pitch +6°; gate z 121 | 180°, 114 m | — | sign „TROCKENDOCK 3 · ROTOREN m/6“ (`ground.setSign`) |
| Ground pads G60/G120/G240/G300 | ground | polar(b, 150): (129.9, −75), (129.9, 75), (−129.9, 75), (−129.9, −75) | 60/120/240/300 | Ø 3 m | hop Kanzel ↔ ground: d 65 m, T 3.0 s, apex 11.0 m, v₀ 26.2 m/s (GDD App. B) |
| Werft cranes K1, K2 | ground | polar(75, 140) = (135.2, −36.2), polar(105, 140) = (135.2, 36.2) | E | gantry 28 m | far landmarks |
| Traumhangar | ground | centre polar(132, 165) = (122.6, 110.4); doors face bearing 312 | 132°, 165 m | 48 × 32 × 12 m | the G120 pad lands ≈ 7.5 m from its island-side corner; ≥ 40 m to the dock wall. **Exterior tier ≤ 110 m** (the bridge head is 122.7 m away) [C1 M2]; `interior: true` |
| Sonnenacker | ground | (−290, 60), Hofladen and east gate (−215, 70) | 258°, 296 m | 150 × 100 m | in the sun; 85 m path from G240 |
| Grubenrand (MUST landmark) | ground | (−195, 88), on the path G240 → Hofladen | 254°, 214 m | terrace cut 30 m, generic bucket wheel Ø 12 m | the Revier-Chronik board (§2.8); no specific machine [C2 M4] |
| Unkrautacker + pasture | ground | (−230, −260) | 318°, 347 m | 200 × 150 m | sun; path from G300 |
| Kreislaufhof | ground | (340, −40) | 83°, 342 m | hall 60 × 30 m | cloud shade, warm work light; path from G60 |
| Dorf, Bahnhof (SHOULD) | ground | Dorf (−45, 256), Bahnhof (0, 208) | 190°, 260 m | 120 × 80 m | behind the spawn |
| Holzbau-Werkhof (COULD scene, SHOULD landmark) | ground | (230, 230) | 135°, 325 m | shell Ø 30 m | shade |
| Windkamm (COULD scene, SHOULD landmarks) | ground | T1 (150, −420), T2 (300, −520), T3 (0, −600) | 0–30°, 446–600 m | rotor Ø ≈ 80 m | generic three-blade turbines |
| Seeblick (SHOULD) | ground | (−480, −180) | 291°, 513 m | lookout | shore terrace |
| Shore and lake | ground | shore where proj(295°) = 600 m; lake y −20 to the far plane | WNW | — | the flooded pit lake („Revier-See“, D22). The lake surface is a rescue and reset volume; the water stays ≥ 1 m below the nearest shore geometry, with a polygon offset (depth precision at 600 m) [C1 m6] |
| Feldbahn (SHOULD) | ground | hexagon, vertices polar(zone bearing, 240) + Bahnhof (0, 207.8) | — | 1.44 km loop | 12 m/s, 20 s between stops |
| Cloud bank (slab) | ground | base +330, top +390; edge at proj(295°) = 900 m | — | — | the sun at 16° passes under the edge (20.1° from the deck centre, R5 §3.1) |
| Sky dressing | sky | rc4 `sky.ts` positions (near islets, far Prüfinseln, wisps) offset by (570 − h) | — | — | hidden grounded; fades in after the break-out [C2 B1] |
| rc4 placeholder plots | island → none | moved beyond 900 m | — | — | the rc4 fallback ring at r 230 m would sit in the Revier [C1 m9] |
| Walkable boundary | ground | r ≤ 650 m (shore W, wind rise N, Werft fence E/S) | — | — | lake water = rescue volume |

**The six lobes and their systems.** M1 Sensordom (270°) · M2 Regelgarten (330°) · M3 Greifwerkstatt (30°) · M4 Lern-Dojo (90°) · M5 Dunkelfabrik (150°) · M6 Prüffeld (210°), in the order of `ZONE_PLOTS` and `underside.ts`. The trim rotors under the Kanzeln (D7) belong to the site their pad leads to, clockwise from north: **T1 (60°) Kreislaufhof · T2 (120°) Traumhangar · T3 (240°) Sonnenacker · T4 (300°) Unkrautacker**. Layout names: the new dock data is exported as `TROCKENDOCK`; the rc4 shuttle pod (`landscape/plan.ts` `DOCK`, `landing.ts`) is removed by WP12 [C1 m9].

### 2.4 Travel

| Mode | Spec | Time | Tier |
|---|---|---|---|
| Walk / sprint | 4.5 / 8 m/s (GDD §4.1) on deck, bridge and field paths | bridge head → Libelle 20 s / 11 s; G240 → Hofladen 19 s / 11 s | MUST |
| Island pads | rc4: 12 pads, T 2.5 s | — | MUST (unchanged) |
| Kanzel ↔ ground pads | 4 pairs, both directions, existing pad code with new parameters (`transit.ts`) | 3.0 s | MUST |
| Map fast travel | „Hinreisen“ to any visited gate, hall entrance or ground pad (grounded only for ground targets) | fade | MUST |
| Feldbahn | one two-car PV-roof tram, 6 + 1 stops, boarding with E, a scripted ride like the lift (look around allowed, movement locked) | full loop ≈ 3 min | SHOULD |
| Not added | cars, flying taxis, zip lines | — | — |

### 2.5 What is visible from where

| Viewpoint | Sees (grounded) | Sees (airborne) |
|---|---|---|
| Bridge head | the island ahead; behind: gate, Dorf roofs (SHOULD), Werft cranes and the Traumhangar roof ESE, the cloud bank, cargo copters crossing under it. No sister platform | — (not reachable) |
| Plaza | tower, zones; over the rim: cranes E, the Traumhangar roof ESE, the cloud bank lit warm near its WNW edge | rc4 sky over the cloud sea, sister platforms |
| Ausguck (+44) | the whole Revier (far tier): the lake and shore WNW, the farm's dark PV stripes (analytic shadows, [C1 m7]), the pasture, the Kreislaufhof hall, the turbines N, the Feldbahn ring (SHOULD) | the cloud sea, sister platforms, dusk |
| Kanzel 240 / 300 / 60 / 120 | Sonnenacker / Unkrautacker / Windkamm + Kreislaufhof / Werft + Traumhangar, each down its pad line | trim rotor below the glass, cloud sea |
| Glasbalkon, Kanzel glass | the dock floor 66 m down, the keel block, still trim rotors | rc4: the cloud sea 180 m down. The plaque switches from „TROCKENDOCK 3 · TIEFE 66 m“ to „ABSTAND ZUR WOLKENDECKE 180 m“ |
| Schauhalle north window | the cloud edge and the lake; the H2 under its cover in front of it, visible from the north spoke | the cloud sea behind the cover |
| Kielraum (smoked shell) | the dock wall's depth ticks; during F1 they slide 10 m | rc4 lattice view |
| Lift-off 0–330 m (t 22–61 s) | the region from above: the PV stripes stowing in a wave, the dock as an empty gear, the crowd on the apron | — |
| Revier sites | the island as a white campus in its dock; the tower as the landmark; at the Sonnenacker the PV roofs | — |

### 2.6 What is reachable when

| Area | Before the first rotor | Grounded, ≥ 1 rotor | During the lift-off | Airborne | Docked again |
|---|---|---|---|---|---|
| Island deck, six zones, Schauhalle, Kielraum, Ausguck | yes | yes | Ausguck only | yes | yes |
| Bridge head apron (spawn) | yes | yes | — | no | yes |
| Revier, Werft, Traumhangar, Sonnenacker, use-case sites | **no** (gate closed, Kanzel pads dark; their code is not even loaded, §5.6) | yes | seen only | **no** (pads off: „Kein Boden unter uns.“) | yes |
| H2 Meisterprüfung | ghost practice only | after the mastery gate | — | via „Zurück ins Dock“ | yes |

### 2.7 Look of the Revier: solarpunk, but believable (D42; adopted from R8 §4.6)

The island stays the *machine*, white and engineered (ART-V2). The ground is the *garden it serves*: real technology built into a cared-for landscape. Green lives on the ground; light lines stay on the machines. These rules bind WP3, WP9, WP14, WP15 and WP16; G-LOOK and G-FARM judge stills against them.

| Rule | Do | Don't |
|---|---|---|
| 1 Only technology that exists or is close | PV (mono/bifacial, semi-transparent on canopies, vertical fences), 3-blade turbines, light rail, heat pumps, battery containers, CLT/glulam timber, green roofs, rain gardens, cisterns, drip irrigation | floating cities, glowing plants, holograms, crystal towers, trees grown into buildings, flying cars |
| 2 Green is managed and useful | crops, hedges, orchards, flower strips, pasture, reed at the cistern | jungle overgrowth, moss on everything, ruins reclaimed by nature |
| 3 Materials | weathered (silver-grey) larch, light glulam, clay plaster in stone tones, ceramic tiles, alu frames, carbon-dark PV glass | shiny chrome, white plastic everywhere, rusty steampunk, Art Nouveau curls |
| 4 Palette (ground tokens, warm-neutral) | `soil` #857A6C · `grassDry` #A39C7A · `grassGreen` #6F7A50 · `crop` #5F7046 (existing `plant`) · `timberSilver` #9A9188 · `timberFresh` #B9A68A · `clay` #B08A72 (roofs only, ≤ 3 % of the screen) · `water` #5E6B66 (green-grey) | saturated greens, blue water, rainbow flowers, neon |
| 5 Orange stays the signal (≤ 5 %) | joint rings of moving machines, the objective beacon, the hazard tape at the bridge | orange roofs, orange crops. **Ripe tomatoes read deep red (≈ #B5332A), not brand orange** |
| 6 Teal = data | soil-moisture stake tips, the rail's stop markers, the SO-101 camera ring | teal lights on houses or plants |
| 7 Light | the fixed golden hour; warm work light in the shaded halls; dusk windows in the village | street-lamp clutter, a day/night cycle in the world (the farm's day plays on the table model) |
| 8 People | a few faceless figures at work, consistent with the zones | crowds, faces, brand clothing |
| 9 Scale ladder | person 1.75, bed 0.85, Sonnendach 2.6–3.4, village houses 2–3 storeys (≤ 12 m), timber shell ≤ 12 m, turbines the only tall things | skyscrapers, megastructures |
| 10 Every object has a job | it grows, powers, stores, carries, repairs or shelters | decorative sci-fi props |

**Futuristic, so the restraint never makes it dull** [C2 M5]. Allowed signals: cargo copters crossing under the cloud bank, robots visibly at work everywhere, the light rail, tracking PV that moves, the dock arms and the slot spray, the island itself. Not allowed: holograms, glowing plants, megastructures, flying cars.

### 2.8 What you take home: how we get a good future (D43; adopted from R8 §5)

The founder asked twice that players learn „how we get a nice future“. The landscape tells it (a mining pit turned into food, power and repair), and every site carries one share of the lesson:

| Theme | Understand | Where it is felt |
|---|---|---|
| Energy | A field can grow food *and* power, and together it can give more than splitting it (LER > 1), but only when the roof suits the crop | Sonnenacker B; the Hofladen dashboard |
| Food | Robots can pick some fruit, slowly, if people plant for them. Light, leaves and ripeness decide | Sonnenacker A and C |
| Work | Robots take the repetitive, dangerous or heavy part. People plan, tend, repair and decide | Sonnenacker C's „Wo du gebraucht wurdest“; the people at work |
| Resources | What is screwed can be repaired, what is sorted can be reused; precision replaces poison | Kreislaufhof, Unkrautacker |
| Honesty | Every number has a condition: crop, light, n, cycle time | every site's banner and chips |

**Three touchpoints** make sure nobody finishes without the sentence [C2 M4]:
1. The bridge-head plaque: „Das Revier: Früher wurde hier im Tagebau gegraben. Trockendock 3 liegt in der letzten Grube.“ (FIKTION, no dates or real places). The Grubenrand by the Hofladen repeats it with the **Revier-Chronik** board: three FIKTION panels, Grube → See → Acker.
2. The lift-off line at 32 s (EMI-01): „Da unten war eine Grube. Jetzt wachsen dort Tomaten und Strom.“ / “Down there was a pit. Now tomatoes and power grow there.”
3. The certificate back side „Was du unten gesehen hast“ / “What you saw down there”: one line per site the player stamped (`AreaManifest.takeaway`). Sonnenacker: „Ein Acker, zwei Ernten: Tomaten und Strom.“ / “One field, two harvests: tomatoes and power.” · Kreislaufhof: „Was geschraubt ist, lässt sich reparieren.“ / “What is screwed together can be repaired.” · Unkrautacker: „Präzision statt Gift.“ / “Precision instead of poison.” · Traumhangar: „Erst träumen, dann messen, dann handeln.“ / “Dream first, then measure, then act.” Closing line for everyone: „Vollautomatisch heißt nicht menschenleer.“ In Entscheider mode, R8 §5's „Wo Automatisierung sich lohnt“ table becomes one Befundkarte in the PNG set (rows of the visited sites only).

---

## 3. Quest spine „Startklar“

### 3.1 States (derived from stamps and manifests where possible; stored only where an event cannot be recomputed)

| State | Values | Derived from / stored | Who reads it |
|---|---|---|---|
| Rotor Mk (k = 1…6) = **AUFTRIEB** | **kalt** (no earned stamp in the zone) → **in Arbeit** (≥ 1 earned stamp, ◆ open) → **bereit** (the zone's ◆ stamp earned, not skipped, **or** the ground crew took over, §5.8) → **geprüft** (all three stamps earned) | derived from Progress + manifests (works before any zone code has loaded) | crown beacons, Libelle lamps, underside, bridge sign, Pass, map, checklist, certificate |
| Startakku `AKKU` = **ENERGIE** (D23) | **kalt** (no Sonnenacker stamp) → **in Arbeit** (≥ 1 Sonnenacker stamp; charge ⅓ per earned stamp) → **bereit** (`sonnenacker.erntetag` ◆ earned; charge 1) **or** the Bodencrew (Entscheider mode after the Probestart, or the asset fallback, §5.8) → **geprüft** (all three Sonnenacker stamps) | derived | the Libelle's Startakku bar, the Hofladen dashboard, telemetry strip, Pass, launch console, checklist, certificate |
| Flugmodell `NAV` = **NAVIGATION** (D23) | **kalt** (no Traumhangar stamp) → **in Arbeit** (≥ 1 of A–C) → **bereit** (`traumhangar.traumdaten` ◆ earned) **or** the Bodencrew (as for AKKU) → **geprüft** (A, B and C stamped) | derived | the Libelle's nav lamp, the tower's needle light, telemetry strip, Pass, launch console, the ghost horizon in the cloud, checklist, certificate |
| **Startklar** | true when all three systems are ready: rotors 6/6 bereit **and** AKKU **and** NAV bereit (ground crew and Bodencrew included) | derived | the Startklar beat, the Probestart lever, objective |
| Trim Tk | **aus** → **an** (the site's ◆ stamp; T2 and T3 share their ◆ with NAV and AKKU and ignite in the same beat) | derived | spin-up chord, plumes, checklist (optional lines) |
| Ground crew | per rotor or core system: off / on (`asset` or `timing`, stored). The Entscheider supply of AKKU and NAV (`route`) is derived from the current mode and `probestart`, never stored; it shows the label „von der Bodencrew bereitgestellt“. A pause-menu mode switch changes it at once, and an airborne island stays airborne | stored `p7.quest.groundCrew` (`asset`, `timing`); `route` derived | system state, checklist „Bodencrew · ohne Kennlinie“ or „von der Bodencrew bereitgestellt“, certificate |
| Probestart, glide | done / not done | stored `p7.quest.start` | lamps dark → red; glide only on the first visit |
| KIEL (Startprüfung) | open when ≥ 4 rotors are bereit, or the finale was visited | derived | lift sign, objective, map |
| Revier gate | open when ≥ 1 rotor is bereit **and** flight = ground | derived | bridge-head gate, Kanzel pads, map, area loading (§5.6) |
| F1 / F2 / F3 | rc4 finale state | stored `finale` (rc4) | lift-off |
| Lift-off armed | **Startklar and F3 signed** (D23). Entdecker: 6 island ◆ + Sonnenacker ◆ + Traumhangar ◆ + F3. Entscheider: 6 island ◆ + F3 (AKKU and NAV by the Bodencrew) | derived | console, objective |
| Flight | `ground` / `airborne`; `firstFlightAt`; `liftoffSeen` | stored `p7.quest.flight` | everything with two looks |
| Mastery (H2) | gate open when ★★★ on Traumhangar A, B **and** C **and** stars ≥ ⌈0.75 × pool⌉ (D21); earned with ★ in the Generalprobe | derived; `p7.quest.mastery.h2Unveiled` stored | hangar, Schauhalle Tresor, lift-off guests, certificate |

**Star pool (the mastery denominator).** The pool is 3 × every station in a shipped area manifest with `mastery !== false`, plus the F1 Schwebetest, because the founder said „75 % of all stars in the game“ [C2 m5]. MUST build:

| Source | ★ |
|---|---|
| 18 island stations (incl. the side stations 05 B and 06 C) | 54 |
| F1 Schwebetest | 3 |
| Sonnenacker (3 stations) | 9 |
| Traumhangar A–C | 9 |
| Schauhalle Lastenheft | 3 |
| Kreislaufhof | 3 |
| Unkrautacker | 3 |
| **Total** | **84 ★; the H2 opens at 63** |

The H2 Generalprobe (`mastery: false`) and secrets never count. The pool is read from the manifests at boot (`src/core/quest/pool.ts`), before any zone code loads, so cut or added content updates the threshold automatically. The Pass shows it: „★ 47/84 · H2 ab 63“.

**System table** (data, `src/core/quest/systems.ts`, WP1; `SystemDef`, §5.2):

| Group (`StartSystem`) | Systems and their ◆ | Gates the lift-off |
|---|---|---|
| `lift` (AUFTRIEB) | M1 `sensordom.messstrecke` · M2 `regelgarten.regler-takt` · M3 `greifwerkstatt.lastdiagramm` · M4 `lern-dojo.nachmachen` · M5 `dunkelfabrik.lichtaus` · M6 `prueffeld.unter-last` | yes, both modes |
| `energy` (ENERGIE) | AKKU `sonnenacker.erntetag` (`crewIn: ['entscheider']`) | yes; in Entscheider mode the Bodencrew supplies it |
| `nav` (NAVIGATION) | NAV `traumhangar.traumdaten` (`crewIn: ['entscheider']`) | yes; in Entscheider mode the Bodencrew supplies it |
| `trim` | T1 `kreislaufhof.sortieren` · T2 `traumhangar.traumdaten` · T3 `sonnenacker.erntetag` · T4 `unkrautacker.jaeten` | never |

One gate rule for both modes: every system outside `trim` must be bereit; the mode only decides who may supply AKKU and NAV. Labels come from the manifests (`systemLabel`; a site whose ◆ also starts a trim names it in `trim`).

### 3.2 The Probestart and the per-zone requests

The Probestart replaces the Libelle gust button (rc4 toy). It shows the **three systems** of D23 from the first press: AUFTRIEB (six rotor lamps), ENERGIE (the Startakku bar) and NAVIGATION (the nav lamp). It is repeatable after a 6 s cooldown and always fails until the island is **Startklar** (6/6 rotors, the Startakku full, the Flugmodell aboard). Each later press shows the current state, and EMI-01 names the first thing missing: „Auftrieb fehlt noch: {M…}.“ · „Kein Strom für den Start. Der Startakku ist leer.“ · „Ohne Flugmodell fliegen wir blind in die Wolke.“ Once Startklar, the lever reads „Startfreigabe: KIEL“ until F3 is signed. Readout „LAGE {max}° · AUFTRIEB {n}/6 · AKKU {p} % · NAV {AUS | BEREIT | BODENCREW}“ (FIKTION). **Entscheider:** after the first press the Bodencrew supplies AKKU and NAV during EMI-01's second line (§1.2). It is shown in the Probestart sequence, or at once after a mode switch, and is not a `markBeat` beat. Under reduced motion: no tilt, no world sink, no ball roll; the lamps, the bar, the sound and the readout stay [C1 m5].

Each zone's **first EMI line is a request** with the island's need (R6 #1). It replaces `emi.enter`; the step objectives stay. ≤ 12 words, „du“ in both modes:

| Area | Request DE | EN | System line on bereit (EMI-01 unless noted, R5 §6) |
|---|---|---|---|
| 01 Sensordom | „Die Insel landet blind. Zeig mir, was meine Sensoren übersehen.“ | “The island lands blind. Show me what my sensors miss.” | „M1 läuft. Die Insel weiß jetzt, wie schief sie steht – so genau wie ihr Sensor.“ |
| 02 Regelgarten | „Ohne schnellen Regler kippt die Insel beim Start. Stell ihn ein.“ | “Without a fast controller the island tips at take-off. Tune it.” | „M2 läuft. Messen, vergleichen, korrigieren: der Regelkreis aus deinem Garten.“ |
| 03 Greifwerkstatt | „Der Wartungsarm soll sanft greifen und richtig tragen. Bring’s ihm bei.“ | “The service arm must grip gently and carry right. Teach it.” | „M3 läuft. Last nah am Körper tragen – das gilt für Arme und Inseln.“ / “M3 is running. Carry the load close in: true for arms and islands.” [C2 m1] |
| 04 Lern-Dojo | „Zeig dem Arm die Handgriffe. Dann macht er’s dir nach.“ | “Show the arm the moves. Then it copies you.” | „M4 läuft. Gelernt wird nur, was in den Daten steckt. Merk dir das für später.“ |
| 05 Dunkelfabrik | „Die Ladung für den Erstflug muss an Bord. Wer schleppt nachts?“ | “The cargo for the first flight must go aboard. Who hauls at night?” | „M5 läuft. Tausend Korrekturen pro Sekunde, rund um die Uhr: Arbeit für Maschinen.“ |
| 06 Prüffeld | „Hersteller X verspricht 100 %. Bevor wir fliegen, messen wir.“ | “Vendor X promises 100 %. Before we fly, we measure.” | „M6 läuft. Freigegeben mit n, Regel und Intervall – nicht mit einem Etikett.“ |
| Sonnenacker (EMI-08) | „Der Startakku ist leer. Hier ernten wir Tomaten und Strom.“ | “The start battery is empty. Here we harvest tomatoes and power.” (D23, D27) | AKKU (EMI-08): „Startakku voll. Tomaten und Strom vom selben Acker – und Menschen, die nachsehen.“ Checklist lines „ENERGIE · Startakku vom Sonnenacker geladen“ and „T3 · Sonnenacker“ |
| Traumhangar (radio EMI-01) | „Blind in der Wolke? Hier lernt unser Flugmodell träumen.“ | “Blind in the cloud? Here our flight model learns to dream.” | NAV: „Flugmodell an Bord. Geträumt, gemessen, gefiltert – erst dann geflogen.“ Checklist lines „NAVIGATION · Flugmodell: {Mischung} · {Wert} geschlossen“ and „T2 · Traumhangar“ |
| Schauhalle (radio EMI-01) | „Echte Roboter, echte Datenblätter. Lies die Bedingung, nicht nur die Zahl.“ | “Real robots, real datasheets. Read the condition, not just the number.” | — |
| Kreislaufhof (EMI-09) | „Was wir reparieren, muss niemand neu bauen. Hilf beim Sortieren.“ | “What we repair, nobody has to rebuild. Help with the sorting.” | T1: „T1 läuft. Was sortiert ist, fliegt wieder mit.“ |
| Unkrautacker (EMI-09) | „Unkraut raus, ohne Gift. Welche Maschine passt zu welchem Feld?“ | “Weeds out, no poison. Which machine suits which field?” | T4: „T4 läuft. Präzision statt Gift – auch das ist Regelung.“ |

### 3.3 Gating of the three systems and its beats

| Moment | What happens (≤ 6 s, wherever the player stands) |
|---|---|
| First earned stamp in a zone | crown beacon and Libelle lamp of that zone turn **amber**; a maintenance drone visits its duct (rc4 `drones.ts` loop) |
| ◆ stamp earned → **bereit** | the ignition beat, 1.5 s after the result banner: a whump and a rising positional drone under the lobe, slot spray rising 20–25 m at that lobe tip (`ground.spray`), duct ring teal, crown beacon and Libelle lamp teal, one Recamán note, toast „M3 bereit · Greifwerkstatt“, the rotor line on the radio, `life:react` { kind: 'rotor' } (birds flush, people wave). Camera shake ≤ 0.1 (none under reduced motion). Played once per rotor (`quest.markBeat`) |
| ◆ is station B and the zone still has an open station | after the rotor line, the zone's EMI points back in [C2 m8]. 02: „Jetzt die Ente – sie soll laufen lernen.“ / “Now the duck: it has to learn to walk.” 04: „Jetzt prüf die Daten, bevor jemand anders damit trainiert.“ / “Now check the data before anyone else trains on it.” |
| All three stamps → **geprüft** | full duct-ring light, the checklist line gets its ★, a short chime, a steady halo on the lamp (for AKKU and NAV: a halo on the bar and on the nav lamp) |
| First Sonnenacker stamp; each further one | the Startakku bar turns **amber** and fills a third per earned stamp (Libelle and the Hofladen dashboard) |
| Sonnenacker ◆ → **AKKU bereit** | **the charge beat:** during the automated day of „Erntetag“ the Hofladen dashboard counts the day's kWh (RICHTWERT) into its bar „STARTAKKU · TROCKENDOCK 3“ (FIKTION). At the result the bar locks at 100 % with a rising chime, the T3 trim ignites under Kanzel 240 (whump, plume over the dock rim, visible from the farm), toast „Startakku geladen · Sonnenacker“, EMI-08's AKKU line, `life:react` { kind: 'rotor' }. Back aboard, the Libelle bar is full teal. Once (`quest.markBeat('AKKU')`) |
| First Traumhangar stamp | the nav lamp and the needle light turn **amber** |
| Traumhangar ◆ → **NAV bereit** | **the upload beat:** the 8 dream tiles of station C fold into one teal line that climbs the hangar's roof mast. The needle light on the tower turns teal (visible through the hangar doors, which face the island), and the T2 trim ignites under Kanzel 120. Toast „Flugmodell an Bord · Traumhangar“ and the NAV line on the radio. The installed mix is the one with the best closed-loop result, never the offline winner (§4.8). Once (`markBeat('NAV')`) |
| 1st rotor bereit | the Revier opens: the bridge-head gate slides open with a hiss, the Kanzel pads light, EMI-01 (Entdecker): „Das Tor zum Revier ist offen. Auf dem Sonnenacker laden wir den Startakku.“ · (Entscheider): „Das Tor zum Revier ist offen. Draußen wartet ein Acker.“ |
| 4/6 bereit | KIEL opens: „Die Kielstufe ist frei. Zeit für die Startprüfung.“ |
| **6/6 bereit** | **the 6/6 beat** [C2 m10]: all six plumes at once, the crown and the Libelle lamps pulse teal three times over ≥ 3 s (steady ramps, flash-safe), EMI-01 „Sechs von sechs.“ Then, by state: „Auftrieb steht. Es fehlt noch der Startakku.“ / „… noch das Flugmodell.“ / „Es fehlen noch Startakku und Flugmodell.“, or, when this makes the island Startklar, the Startklar line below. Once (`markBeat('6of6')`) |
| **Startklar** (the last of the three systems turns bereit) | when the last is M-anything, it merges with the 6/6 beat (the usual Entdecker case, M6 last). When the last is AKKU or NAV, the same three teal pulses run on the Libelle (lamps, bar, nav lamp), the crown and the needle light. EMI-01: „Auftrieb, Energie, Navigation – alle drei bereit.“ then „Fehlt nur noch die Startprüfung im Kiel.“ (or „Komm zum Ausguck – wir starten.“ if F3 is signed). Once (`markBeat('startklar')`) |
| F3 signed, a system missing | „Startfreigabe unterschrieben. Es fehlen noch {M…, Startakku, Flugmodell}.“ and the objective points to them |

Who plays what: WP12 plays the island side of every beat (lamps, bar, crown, needle light, trims, toasts, radio lines) and calls `markBeat`. WP9 plays the farm side of the charge beat (the dashboard bar, EMI-08), and WP10 the hangar side of the upload beat (the dream tiles, the roof mast line), each on the first earned ◆ stamp of its station.

The system lamps (the three systems of D23):
- **Crown beacons (AUFTRIEB):** the six beacons at +48 on the zone bearings (`tower/structure.ts`, one InstancedMesh, colours per instance), for everyone on the island.
- **Needle light (NAVIGATION):** the existing lamp on the needle tip (Ausguck + 14.3 m, far outside the mark's clear space) repeats the nav lamp for everyone. Today it shares the `hub:windows` material, so it gets its own instance of the same material type (no new program); dusk still drives its intensity.
- **Libelle panel (all three), for the player at the lever:** at eye height on the plinth, one InstancedMesh of 17 instances (one draw, as before for six). It holds six rotor lamps labelled SEHEN … MESSEN under AUFTRIEB, a **10-segment Startakku bar** under ENERGIE (lit segments = round(charge × 10)) and **one nav lamp** under NAVIGATION. The labels sit in the existing text draw. From the lever the crown sits 57–73° up, above the top of the view [C2 M3].
- **States:** dark → red after the Probestart (#F87171; the empty bar shows a red outline) → amber (#FBBF24) → teal (#2DD4BF) → teal with a steady halo (geprüft). A system the Bodencrew supplies is teal with a small „BODENCREW“ plate and never gets a halo.
- The foyer rotor board, the Pass cover, the telemetry strip and the launch console show the same three systems (§4.1, §4.14).

The objective keeps its rc4 channels (gate-mast beacon, spoke inlay, pad beam), so the crown no longer shows „visited/objective“. Lamps on the collar (R6) are rejected: the collar carries the mark's yoke and sits in its clear space (D10).

### 3.4 Three visible progress systems (R6 §6.4), the rest folded in

| System | What you see | What it unlocks |
|---|---|---|
| **„Startklar“: Auftrieb n/6 · Energie · Navigation** (D23) | lift: crown beacons, Libelle lamps, slot spray, bridge sign; energy: the Startakku bar on the Libelle and the Hofladen dashboard; navigation: the nav lamp and the needle light; all three: Pass cover, map, the foyer rotor board (rc4 „Selbstmessung“ wall), telemetry strip | Revier at 1 rotor, KIEL at 4 rotors, the lift-off at all three + F3 |
| **Sterne → Roboter** | banner, Pass, gate masts, map; deliveries in the Schauhalle | Schauhalle deliveries (§4.9); the H2 gate (§3.1) |
| **Sensorkapseln → Positionslichter** | 12 rim lights | the Turmsprung (rc4); the full ring at the night flight |

**Scopes [C1 M8].** Every aggregate takes `scope: 'island' | 'all'` (default `'island'`). Only the 18 island stamps draw the tower and the Pass cover mark, count for the title's „n von 18“, play the Recamán melody notes and trigger `finale:ended`. The star pool and „★ 47/84“ read the manifests (§3.1).

Folded, not removed:
- tower lines: only the 18 island-zone stamps draw them (D37);
- question cards: tools of 06 A and F2/F3;
- the album: shown as the Pannen-Wand in the Schauhalle and in the Pass;
- EMI-01 skills: EMI-01 shows them during the pre-flight ride;
- Prognose-Güte and bests: Pass and certificate;
- secrets: hidden until the first find; they never gate.

### 3.5 Save format v2 and the migration from rc4 [C1 M9, M10]

Storage: **a new key** `localStorage['emai-academy-island/v1:progress.v2']`. The rc4 blob `…/v1:progress` is never written again: it stays as a read-only backup until a later version removes it, and `clearGameStorage()` removes both on reset. One blob, try/catch, and the game runs without storage. Only WP1 edits `src/systems/Progress.ts` and `src/systems/migrate.ts`.

```ts
interface ProgressDataV2 {
  v: 2;
  mode: Mode | null;
  stamps: Record<string, number | StampRecord>;              // '<areaId>.<stationId>'
  visited: Record<string, number>;
  zoneData: Record<string, Record<string, unknown>>;         // ctx.progress per area (≤ 16 KB per area); 'world' = island progress
  predictions: Record<string, PredictionRecord>;
  questions: number[];                                       // still 1…9
  album: string[];
  best: Record<string, number>;
  challenges: Record<string, ChallengeRecord & { rev?: number }>;
  collectibles: string[];
  lastZone?: string | null;                                  // any area id
  secrets: string[];                                         // new (R9 §5.1)
  legacy?: { from: 'rc4'; stamps: Record<string, StampRecord>; challenges: Record<string, ChallengeRecord>; predictions: Record<string, PredictionRecord>; best: Record<string, number> };
  migratedAt?: number;
}
// zoneData.world['p7.quest'] (WP1 only, written through ctx.quest):
//   { flight: { state: 'ground' | 'airborne'; firstFlightAt: number | null; liftoffSeen: boolean };
//     start: { glideSeen: boolean; probestart: boolean }; seenBeats: BeatId[]; groundCrew: { id: RotorId | CoreId; reason: 'asset' | 'timing' }[];   // 'route' is derived, never stored
//     mastery: { h2Unveiled: boolean } }
// every other package: ctx.progress of its own area, island keys 'p7.<pkg>.<key>' (e.g. 'p7.life.storyIndex')
```

**Migration v1 → v2** (`src/systems/migrate.ts`, a pure function `migrate(raw, manifests, retired)`; it runs at boot after the manifests are known and before any reader; fixtures in `tools/fixtures/saves/`):

| # | Rule |
|---|---|
| 1 | Read v1, write v2 under the new key; `v: 2`; add `secrets: []`; unknown fields are kept |
| 2 | **Failure path:** if `migrate()` throws or the blob is corrupt, the game runs in memory on the untouched v1 data, never writes, and logs once. A dev toast says „Spielstand nur gelesen“ |
| 3 | **Retired stations** (data list `src/systems/retired.ts`; the WP that retires a station appends it in the same commit: WP5 `regelgarten.tausend-welten`, WP8 `greifwerkstatt.griffe`). Their stamps, challenge records, predictions and bests move to `legacy`. They no longer count for rotors, stars, Prognose-Güte or the tower. The Pass shows one line „rc4-Stempel: 200 Griffe, Tausend falsche Welten (Archiv)“; their bests still add to „trials measured“ |
| 4 | **Rev resets** against the manifest `rev` (no hard-coded list). A stored record with another `rev` loses its stars, best and attempts, and its old stars are shown once as „rc4: ★★“; stamps are kept. Predictions of a station whose prediction moved go to `legacy` (`lern-dojo.datensatz-audit` → B). Rev 2 in Phase 7: `lern-dojo.vormachen`, `lern-dojo.nachmachen`, `lern-dojo.datensatz-audit`, `prueffeld.drei-auditoren` |
| 5 | **Island progress.** `ascentSeen` is dropped and `finale` (F1–F3) is kept. `p7.quest.flight` = `{ state: 'ground', liftoffSeen: false }`, **also for rc4 saves with `finale.ended`**: an rc4 player never flew, so they get the real lift-off once the island is Startklar (D38, D23: in Entdecker mode that adds the Sonnenacker ◆ and the Traumhangar ◆; in Entscheider mode the Bodencrew supplies them, and a returning rc4 manager sees them supplied at once). `sky` resets to day (dusk exists only airborne). `p7.quest.start` = `{ glideSeen: true if any stamp or ascentSeen, probestart: true if any island stamp or onboarding ≥ 3 }`, so a returning rc4 player sees their lamps at once. `logoShown` is recomputed from island-zone stamps. Every other rc4 island key (e.g. `liftAt`) is kept untouched |
| 6 | `lastZone` is kept |
| 7 | An rc4 build on the same origin reads only the v1 key, which is unchanged, so it never sees or destroys v2 |
| 8 | Fixtures: fresh · mid-route · 18/18 · finale ended + dusk · Entscheider · griffe ◆ earned · corrupt JSON · v2 already present · a v1 blob with an unknown field |

### 3.6 Resume rule (replaces D13; D26)

| Case | Start does |
|---|---|
| First visit (no save) | title → 6 s glide (skippable; fade under reduced motion) → bridge head |
| Returning, grounded | no glide; resume at the gate (or entrance) of the area entered last (island zones, the Schauhalle, ground areas), toast „Weiter im …“ / „in der …“ (`layout.zoneInPhrase()`); none → bridge head. **If that area is on the ground, the region chunk and the area's code load before the title** [C1 m11] |
| Returning, airborne | „Weiterspielen“: airborne; last area if it is aboard, else the plaza (0, 0, 26). The title also offers **„Im Dock weiterspielen“** (sets ground, resumes at the last area) and **„Abheben ansehen“** (plays the lift-off on the Ausguck; stills under reduced motion; ends airborne with the saved sky) |
| CTA text | „Weiterspielen · {n} von 18 Stempeln · {m}/6 Rotoren“ (n = island stamps) whenever any progress exists (stamps, stars, capsules, question cards, secrets) |
| URL | `?skipIntro=1` (no title, spawn at the Messpunkt (0, 0, 94.5) as the tools expect), `?zone=`, `?pos=`, `?world=0` and a dev reload keep the first-visit flow without the glide. New: `?flight=ground\|airborne`, `?liftoff=1` (all conditions met, at the console), `?area=<id>` (alias of `?zone` for halls and sites; also loads a ground area before the Revier is open), `?only=<site>` (the island module still registers the ground frame) |

---

## 4. Station-by-station spec

**Conventions for every station below.**
- **Stars:** one challenge per station (`ctx.game.challenge`). ★ = the stamp condition, ★★ = the lesson understood, ★★★ = mastery or a discovery. Stars rate the player, never a robot (D8). One prediction per zone at most (R6 §6.8).
- **Text budgets:** a console shows ≤ 35 visible words at open for new and reworked stations (legacy consoles ≤ 50; `text-audit`). EMI lines ≤ 18 words and two sentences. Banner lessons ≤ 14 words; no two banners carry the same sentence (the condition idea is a spiral: reach, load, weather, datasheet, dream) [C2 §4].
- **Chips:** every number has one chip: SIM · LIVE, STUDIE, QUELLE, RICHTWERT, ILLUSTRATIV, FIKTION, plus the new **HERSTELLERANGABE** (vendor spec, with date), **MODELL** (measured on the 3D model in the game), **SIM · AUFZEICHNUNG** (recorded simulation) and **TRAUM** (a world-model prediction).
- **Real robots:** by name, real model, attribution line on the plaque, never in the „Hersteller X“ critique (D32).
- **Calibration:** station thresholds are calibrated with the Phase 5 bot player models first and checked with people (§8).
- **Watching rule [C2 M6].** Unattended time (no input required or offered) is ≤ 10 s per stretch and ≤ 20 % of the station's minutes. Every replay after the first viewing runs at 2×; Space = 4× or jump to the result. Batch measurements run in parallel lanes. Stations mark such stretches with `ctx.game.unattended(true/false)`; `tools/watch-audit.mjs` fails above the rule (legacy rc4 stations are reported, not failed).
- **Colours [C2 m2]:** red #F87171 = a system offline (the system lamps and the Startakku bar only) · amber #FBBF24 = in Arbeit, or over a spec · teal #2DD4BF = live data, systems online, predictions and dreams (with the chip PROGNOSE or TRAUM) · orange #FF6700 = the objective, moving joints, reality and policy, sparingly (≤ 5 %).
- **Reduced motion:** every new station states its RM behaviour in its table. Flash risks (dream glitches, slow-motion falls, hail, spray) are measured by `tools/flash-check.mjs` (§5.10).
- **Tuning and juice:** every area keeps its tunable numbers (thresholds, timings, juice) in its own `tuning.ts` (WP20 edits only those). Each content WP reserves ≈ 15 % of its days for sound, popups and timing [C2 M11].

### 4.1 Arrival and hub (changed)

| Item | Spec | Reuse |
|---|---|---|
| Title | Three states (R5 §3.3): first visit; grounded with progress („… · m/6 Rotoren“); airborne („Weiterspielen“ + „Im Dock weiterspielen“ + „Abheben ansehen“). Subtitle DE „Eine Insel, die fliegen soll – noch steht sie im Dock. Probier aus, wie Roboter sehen, regeln, greifen und lernen, miss, was Physical AI heute kann, und bring sie in die Luft.“ EN “An island built to fly, still standing in its dock. Try how robots see, control, grasp and learn, measure what Physical AI can do today, and get it into the air.” Mode cards: „ca. 90–100 Min.“ / „ca. 30 Min.“. No sky dressing in the title orbit | `StartScreen.ts` |
| Glide | 6 s, first visit only. The 25 s ascent and „Anflug ansehen“ are retired; the captions „Diese Insel fällt ständig.“ / „Tausendmal pro Sekunde fängt sie sich wieder.“ move to the lift-off | `intro.ts` spline + skip |
| Probestart | §1.2, §3.2. Lever at the rc4 gust column; the Libelle panel with the three systems (six lamps, Startakku bar, nav lamp); ball roll; southern spray puff; readout „LAGE {max}° · AUFTRIEB {n}/6 · AKKU {p} % · NAV {…}“ (FIKTION) | `toyGust()`, `libelle.ts` |
| Libelle | reads „BODEN“ until M2 is bereit, then live LAGE (R6 §6.3). H: „Am Boden hält der Regelkern die Insel über die Haltearme. In der Luft über die Rotoren.“ | `libelle.ts` |
| Telemetry strip | grounded „BODEN · HALTEARME · ROTOREN m/6 · AKKU p % · NAV {AUS \| BEREIT}“, airborne rc4 „LAGE · TAKT 1000 Hz“ (FIKTION) | `Hud.setTelemetry` |
| Plaques | Glasbalkon: „TROCKENDOCK 3 · TIEFE 66 m“ (grounded) / rc4 text (airborne). Bridge sign live. The bridge-head plaque of §2.8 | `landing.ts`, `ground.setSign` |
| Pass | Cover headline „Startklar“ with the three systems: „Auftrieb n/6 · Energie {p} % · Navigation {aus \| an}“ (in Entscheider mode „Energie · Navigation: Bodencrew“ until the player earns their own). Sections: Insel (18 stamps, draws the mark); Revier & Hangar (Sonnenacker, Traumhangar + Meisterprüfung, Schauhalle Lastenheft, Kreislaufhof, Unkrautacker); Funde (hidden until the first find). Star line „★ 47/84 · H2 ab 63“ | `PassPanel.ts` |
| One voice at a time | while EMI speaks or an operate console opens, the result banner shrinks to a one-line strip (value, stars, [R], [H]) (R6 #10) | `ResultUi.ts` |
| Loading card | one style for every area and robot that is not ready: name, „{x} von {y} MB“, progress, „Erneut laden“; the Bodencrew offer on a ◆ (§5.8) | `Kit.ts` |

### 4.2 01 Sensordom (changes only)

| Station | Change | Lesson (unchanged) | Stars | Reuse |
|---|---|---|---|---|
| A Messbrille | The wrong-view press returns as a gag: EMI-02 grabs thin air, popup „Glasflasche · LiDAR: Luft“, no star cost. ★★/★★★ keep counting view switches (DECISIONS engineering note, R6 #8) | every sensor has blind spots | rc4 | `labor.ts` |
| B Dunkelkammer | none (keep list) | glass is air to LiDAR | rc4 | — |
| C Messstrecke ◆ → **M1** | One prediction (σ at 6 m). The second tip becomes a visible consequence: at the distance and light you chose, **EMI-02 reaches 10 times and grips or misses** (shown as „8/10“, SIM · LIVE; the 10 reaches run at 2×, ≤ 10 s). Awards #9 | double distance, four times the error | rc4 goals | `messstrecke.ts`, EMI kit `driveTo/setJoint` |
| Entscheider | C only (2.5 min); Befundkarte rc4 | — | — | — |

### 4.3 02 Regelgarten

| Station | Change | Reuse |
|---|---|---|
| A Balancieren | First success first: opens on 2 m / Mond; EMI-03 then suggests the Earth; the best-time grid moves to a „Bestwerte“ tab (≤ 35 words at open) | rc4 |
| B Regler & Takt ◆ → **M2** | the Gehirn-Stapel dials hide behind „Gehirn-Stapel ▸“ in Entdecker mode; awards #4 | `giant.ts` |
| C **„Lauf, Ente!“** (new, replaces „Tausend falsche Welten“, station id `lauf-ente`) | below | `wall.ts` CEM loop pattern, `sim.ts` time slicing, Kennlinie kit, album `sim-to-real-luecke` |

**02 C „Lauf, Ente!“** (R2 §6; Entdecker ≈ 7 min with the early stop, Entscheider ≈ 4 min, optional for the route there)

| | Spec |
|---|---|
| Real robot | **Open Duck Mini v2** (Apache-2.0, `apirrone/Open_Duck_Mini` @ `b23317a`). The hero at LOD0; 64 field ducks at the articulated **LOD2** (≤ 1.5 k triangles each, WP0 R2), drawn as one InstancedMesh per body (≈ 17 draws). Neutral colours: white shell #E7E5E4, grey #9C9893, dark #3D3D3D, **no amber accent** (D29). EMI-03 stands beside the test track for scale (1.55 m vs ≈ 0.52 m) |
| Physics | **Real MuJoCo** (`@mujoco/mujoco` 3.16.0, stripped, in the station's own worker, §5.4) on our light MJCF adapted from the Apache `robot.xml` (feet-only collision, STS3215 actuator class from Rhoban BAM, a home keyframe); 2 ms steps, 50 Hz control |
| Learner | CEM over 12 gait parameters (CPG frequency, amplitudes, phases, sway, lean, neck, ankle offset, pitch/roll feedback gains), population 64 (adaptive 32 on slow CPUs), elite 10–15 %, α 0.7, std floor. Generation k+1 is computed while k replays (4 s at 1×; every replay after the first viewing at 2×; Space = 4× or jump to the result). Fallback: recordings `SIM · AUFZEICHNUNG` |
| Layout (local) | Trainingsfeld 8 × 8 tiles (8.0 × 6.4 m) at x −17…−9, z 0…8, tile tint = that duck's floor friction; Belohnungspult at (−7, 0, 4) on a 0.6 m step; Teststrecke 1.2 × 0.4 m on a 1 m plinth with marks 0.25/0.5/1.0 m and 4 lanes; Kennlinie on the console screen. Replaces the Weltenwand at x = −13 |
| C1 Mach du's (1 min) | three sliders (Schrittfrequenz, Schrittweite, Fußhub), Space = Los; the hero walks your gait live while 64 copies try it; „Du: 0,12 m · 41 von 64 gefallen“; push the hero with the grab tool (F, the unused verb) |
| C2 Belohnung bauen (3 min) | Six reward cards with 4 notches (Vorwärts, Durchhalten, Aufrecht, Sparsam, Sanft, Füße heben; unlock „Vorbild“) and the toggle „Erst laufen, dann schön“ (curriculum). Start runs up to 10 generations. **A run stops early as soon as the elite's statistics show a hack** [C2 M6]. The payoff is the sticker (Bauchklatscher, Statue, Sofort-Umfaller; Zappelente and Storch only if calibration proves them), the slow-motion „Sturz der Generation“ (≤ 4 s) and its real-world twin (R2 §5.2). The cards stay live between generations, so a change shapes the next one; push the hero with F during replays. The default deck Vorwärts 3 gives a belly flop by generation ≈ 3 |
| C3 Teststrecke (2 min) | No numeric prediction (the zone's one prediction stays B's „Ab welchem Takt fällt der Stab?“). 20 runs of your best gait in 4 parallel lanes at 4× (≤ 8 s) under hidden conditions (friction 0.3–1.0, payload 0–150 g as an orange test block, stiffness ±20 %, delay 0–60 ms; wider than the training ranges and shown on the card); one bar with its Wilson band. **★★★ path:** „In tausend falschen Welten nachtrainieren“ (10 randomised generations at 2×) and 20 new runs: the second bar |
| Measured value | „Gen 10: 0,31 m · 2 Hacks · Teststrecke 14/20 · 70 % [48–85]“ (SIM · LIVE) |
| ★ / ★★ / ★★★ | ★ one trained gait + 20 test runs · ★★ two different hacks found · ★★★ retrained in randomised worlds and ≥ 15/20 on the track (spike: randomised 32/40, one world 26/40) |
| Lesson | „Die Ente lernt, was du belohnst – nicht, was du meinst.“ / “The duck learns what you reward, not what you mean.” |
| Key lines | Enter: „Die Ente hat 14 Motoren und keinen Plan. Den Plan baust du – als Belohnung.“ · Belly flop: „Die Enten hechten nach vorn und fallen. Du hast Tempo belohnt, nicht Ankommen.“ · After retraining: „Langsamer, aber sie fällt seltener. Das ist der Preis für Robustheit.“ (R2 §6.10, EN there) |
| Entscheider view | C1 skippable after 30 s; C2 preset „Nur Vorwärts“ at 2× → belly flop → one tap „Durchhalten + Aufrecht dazu“; C3 one-world vs randomised, 20 runs each at 8×. Befundkarte: Messgröße success on the test track (n = 20, Wilson) · Grenze holds only inside the trained ranges, and robust is slower · Frage „Mit welcher Belohnung wurde trainiert – und welche Abkürzungen hat das Training gefunden?“ plus #9 · Für dein Werk „Lass dir Fehlläufe zeigen, nicht nur das beste Video – und teste auf deinem Boden mit deiner Last.“ The same run is recorded for the Schaufenster's Kurzlauf (§4.9) |
| Chips | Every duck number is SIM · LIVE with „echte Physik, echte Optimierung, kleiner Lerner (12 Gangparameter statt neuronalem Netz)“. Card facts are QUELLE: Microduck „brauchbarer Gang in 1–2 Stunden mit 4.096 parallelen Welten“, Open Duck „150–300 Mio. Schritte ≈ 35–69 simulierte Tage“ (R2 §5.3). The card may say „inspiriert von einem Film-Roboter eines Unterhaltungskonzerns“ only after the legal check; never Disney, BDX, Star Wars, droid |
| Album / eggs | `sim-to-real-luecke` (kept: the one-world gait falls on the track), egg 10 „Erklär’s der Ente“ (rubber duck on the console), egg 11 „Hack-Sammler“ (all three hacks) |
| Reduced motion | the slow-motion fall becomes a still with the sticker; no camera follow; the field replays without camera motion |
| Budget | detail ≤ 80 draws (field ≈ 17 + hero 1 + track/console ≈ 6); robots ≤ 140 k triangles on top of the zone's 90 k (field 64 × ≤ 1.5 k + hero; the hero swaps to LOD1 beyond its switch distance); main thread ≤ 0.1 ms for the replay; worker ≤ 1.5 s per generation at 1× and ≤ 3.5 s at 4× |
| Lift-off | if C is stamped, the trained duck waddles along the Ausguck ring during the climb (cosmetic guest) |

### 4.4 03 Greifwerkstatt

| Station | Change | Reuse |
|---|---|---|
| A Gelenke | the contrast „Gelenke 1:42 · IK 0:04“ shown large in the banner and panel (R6) | rc4 |
| B Das Ei | Kept (keep list). Its card takes the egg study from the retired C: „Eine Studie: Ei 50 % → 85 %, je 20 Versuche – kein Naturgesetz.“ (STUDIE, 3D-ViTac CoRL 2024) | rc4 |
| C „200 Griffe“ (rc4 ◆ `griffe`) | **Retired** (fun 2, learning 2, the most watched station; its lesson is taught in 06 B and F2). Its stamps go to legacy (§3.5; WP8 appends `greifwerkstatt.griffe` to `retired.ts`). Card #2 moves to 06 B, card #5 to the new C | cabinet shell, tally canvas |
| C **„Lastdiagramm“ ◆ → M3** (new, id `lastdiagramm`) | below | `stationC.ts` cabinet geometry and operate camera, Kennlinie kit; the wear wall becomes the diagram board |

**03 C „Lastdiagramm“ ◆** (≈ 3 min; Entscheider 2.5 min)

| | Spec |
|---|---|
| Idea | Reach and payload never peak together. Torque = mass × g × lever: the same arm carries much close to its body and almost nothing stretched out. This is why every payload needs its condition; it prepares the Schauhalle's „Bedingung“ lesson with physics you feel |
| Real robot | **SO-101 follower** (shared GLB, Apache-2.0) on a test bench in the former cabinet at (7, 0, 6). Five test weights (20 / 50 / 100 / 200 g and a 100 g gear part); the 18 kg Dunkelfabrik crate on the floor as a joke („Nein.“) |
| Model | Static shoulder_lift torque from the link masses and centres of mass in the manifest (`inertials`, WP0 R3) plus the load at the grasp point: τ = g·(Σ mᵢ·rᵢ + m_load·r_load). Two servo figures, both shown: rated 6,5 kg·cm, and stall 16,5 kg·cm (SO-ARM100 README) to 19,5 kg·cm (Feetech). The stall figure is a **band**: the honest disagreement of two sources (R1 §1.1). MODELL / RICHTWERT, computed live |
| Do | Hang a weight (F) and steer the reach with the mouse (IK keeps the jaws level). A torque bar shows the Nenn mark and the Spitze band. Above Nenn the bar turns amber („nur kurz“); above the band the arm visibly sags (the servo cannot hold; nothing breaks) |
| Prediction | „Wie viel Gramm hält der Arm ganz gestreckt dauerhaft?“ (0–500 g). The model answers ≈ 0 g: the stretched arm alone already exceeds its rated torque (R1, eigene Rechnung). The zone's one prediction |
| Measure | „Lastdiagramm aufnehmen“: 6 reach points from 0,10 to 0,41 m; the rig finds the maximum payload at Nenn and at Spitze by bisection (2×, ≤ 10 s); a Kennlinie with two curves over reach. Beside it, on its own card, one vendor point for scale: UR5e 5 kg bis 850 mm (HERSTELLERANGABE; no comparison, no score) |
| Task | „Bring das 100-g-Zahnrad in die hintere Kiste (0,35 m), ohne den Nennwert zu überschreiten.“ Solved by a pose and a path close to the body, or by two moves |
| Measured value | „Nennlast gestreckt 0 g · bei 0,20 m {x} g · Spitze gestreckt 190–260 g“ (MODELL; values from the live model) |
| ★ / ★★ / ★★★ | ★ diagram with ≥ 4 reach points (stamp) · ★★ prediction within ±40 g · ★★★ the gear task without exceeding Nenn (calibrate) |
| Lesson | „Traglast ohne Reichweite ist keine Angabe.“ / “A payload without its reach is no spec.” |
| Key lines (EMI-04) | „Gestreckt trägt mein Arm fast nichts. Nah am Körper viel mehr. Hebel.“ / “Stretched out, my arm carries almost nothing. Close in, much more. Leverage.” |
| Cards | awards **#5 „Wie viele Objektlagen?“**: the load capacity holds for one pose of the object, so ask for how many poses it was measured |
| Entscheider | Befundkarte: Messgröße payload over reach, Nenn against Spitze · Grenze: stretched out almost nothing lasting (hobby servo, model) · Frage #5 and „Zeig mir das Lastdiagramm.“ · Für dein Werk „Prüf die Last am Arbeitspunkt und für die Dauer, nicht die Spitze am Flansch.“ |
| Album | `singularitaet` stays (A) |

### 4.5 04 Lern-Dojo (SO-101 VLA; R1 §10 with the changes noted)

Eyebrow `// 04 · LERNEN · IMITATION & SPRACHE` / `// 04 · LEARN · IMITATION & LANGUAGE`. Station ids kept (`vormachen`, `nachmachen` ◆, `datensatz-audit`), rev 2.

- **Real robots:** **SO-101 leader and follower** (Apache-2.0, `TheRobotStudio/SO-ARM100` @ `a758567`). Printed parts white #E7E5E4, servos #1A1A1A, the moving jaw orange because it rotates (D32).
- **Bench:** a workbench 1.6 × 0.8 m at local (0, 0, −3) replaces the Teleop-Tisch; 5 start fields of 6 × 6 cm, a 12 × 9 × 5 cm box, three 3 cm cubes (red, blue, green), a 30 cm ruler.
- **Camera:** operate camera behind the leader, pitch ≈ −45°, plus a wrist-camera inset (fixes PT-11).
- **Kept:** Demo-Wolke (scale ×8), Gehirn-Fenster (SEHEN top + wrist tiles; VERSTEHEN word chips + „Worauf achtet die Policy?“ bars; HANDELN 6 joints × chunk bars), Datensatz-Wand, the k-NN core.

| | A Vormachen (3 min) | B Befehlen ◆ → **M4** (3.5 min) | C Prüfen (3 min) |
|---|---|---|---|
| Do | guide the leader: mouse = grasp point over the bench (analytic IK), hold LMB = lower, Space or RMB = trigger, Q/E = wrist roll; → keep, ← discard (as `lerobot-record`); a demo ends automatically when the cube rests in the box; the game resets the cube to the next field („In echt legst du ihn selbst zurück – das dauert oft länger als die Demo.“) | train (3 s); first command from word chips „Leg den roten Würfel in die Kiste.“ ✓ (it copies your hesitation); the prediction („Was tut der Arm?“: roten / blauen / nichts) with red on an unrecorded field and blue on a recorded one; **two Störungskarten on the route: Neue Lage, Anderes Wort** [C2 M9]; rescue: ≥ 4 demos with both cubes and alternating commands, retrain. **Discovery cards (★★★):** Abendlicht („Helligkeit variieren“ fixes it) and Kamera angestoßen („Kamera festschrauben“ fixes it): operations, not data | 250 SO-101 episodes from „drei Werkbänken“ (ILLUSTRATIV pattern): a 35-episode dead block, 12 „Kamera verschoben“, **18 mislabelled** (the task says „rot“, the arm moves blue). Evaluate n = 50 on two fixed conditions, „bekannte Lagen“ and „neue Lagen“, for raw and cleaned data (parallel, ≤ 8 s); rc4's C prediction is dropped (the zone's one prediction is in B) |
| Model | Rapier private world at 100 Hz (3 cubes, kinematic jaw boxes from Menagerie sizes, a slip rule); follower lag τ ≈ 80 ms; safety layer: joint clip and ≤ 10° per step with a „geklippt: n“ counter | Target selection = logistic score a·[word = perceived colour] + b·[training density here], with a and b fitted on the demos. One-cube one-word demos keep a ≈ 0, so the word is ignored. Motion = rc4 k-NN BC (k = 3) on target-relative features, 15-step chunks at 30 Hz | rc4 audit model with per-condition draws, Wilson bands from the kit (shown, not taught again) |
| Measured value | „5 Demos · 4/5 Felder · Ø 8,7 s“ | „rot ✓ · Wort ignoriert ✗ → +4 Demos → blau ✓“ | „Totblock raus · bekannte Lagen 92 % [81–97] · neue Lagen 54 % [40–67] (n = 50 je)“ (ILLUSTRATIV parameters, SIM draws) |
| ★ / ★★ / ★★★ | 3 kept demos · ≥ 3 different start fields · 5 fields, Ø ≤ 9 s, no regrasp | chain complete (command, prediction, two cards, rescue) · rescue with ≤ 4 new demos · both discovery cards found and fixed | dead block out with ≤ 5 false removals + before/after · 0 false removals · also the mislabelled or camera-shift episodes |
| Lesson | „Verschiedene Startlagen bringen mehr als viele gleiche Demos.“ | „Er folgt Wörtern nur, wenn Wörter in deinen Demos etwas verändert haben.“ / “It follows words only if words changed something in your demos.” | **„Erst die Daten prüfen, dann trainieren.“ / “Check the data first, then train.”** (rc4's lesson back) [C2 M9] |
| Honesty | — | Footer „So ist ein VLA aufgebaut: Bild + Sprache + Zustand → Aktions-Chunk. Hier läuft ein Spielzeug-Imitator, kein SmolVLA.“ Optional QUELLE panel: „Echter SO-101, je 100 Demos, je 20 Versuche: Farbsortieren 0–10 %.“ (Yu & Qiu 2026) and „SmolVLA, SO-101: bekannte Lagen 90 %, neue Lagen 50 % (n nicht angegeben).“ (Shukor et al. 2025). Training chip „Echt: SmolVLA 20.000 Schritte ≈ 4 h auf einer A100“ (QUELLE) | — |
| Cards | — | **#8 and #6**; #6 with the real licence example: code Apache-2.0, weights under other terms (π0 Gemma terms, GR00T NVIDIA Open Model License) | — |
| Album | `policy-kopiert-fehler` (kept) | new `wortblind` and `schleife` (R1 §10.7) | — |
| Entscheider | skippable (grey) | 50 preloaded demos (5 fields × 10), one command, the prediction, „Anderes Wort“ and „Neue Lage“, then „Lade 40 Demos mit zwei Farben“ → retrain → ✓ (≈ 3.5 min). Befundkarte R1 §10.5. Side panel „Was kostet ein Skill?“ (data 15–60 min per task and setup, RICHTWERT; training hours to a day, QUELLE; measuring n ≥ 50 per condition) | optional |
| Reduced motion | operate camera static; no camera ease on demo end | — | — |
| Lift-off beat | after the zone's last stamp the SO-101 hands you the M4 part („Gib mir das Ventil.“), cosmetic | | |
| Reuse | `teleop.ts` (SCARA → leader/follower IK), `core.ts` (cubes, jaws, grasp, selector, perception hooks), `brain.ts`, `ribbons.ts`, `audit.ts`/`dataset.ts`, `cards.ts`, `pavilion.ts` | | |

No internal EmAI numbers appear (D20).

### 4.6 05 Dunkelfabrik (changes only)

| Station | Change |
|---|---|
| A Schicht | the crates become cargo for the first flight (request); on M5 bereit the palettes roll onto the deck lift of the Verladebucht |
| B Schichtplan & Waage | **Side station in Entdecker mode** (D40; manifest `route.entdecker: 'side'`). The lighter rework of R6 #14: **one wall, three decisions**: year slider to 2030, one robot token on an empty post with the type choice, and „Rechnet sich das?“ (the Waage). The Waage is optional for ★ in both modes; ★★/★★★ unchanged |
| C Licht aus ◆ → **M5** | the L0–L4 buttons become six large dials with the „real L3–4“ tags; awards #7 (unchanged). Entscheider: A skipped by default |

### 4.7 06 Prüffeld

| Station | Change |
|---|---|
| A Die Vorführung | Cards played on any later visit count (the challenge re-evaluates on return; the sign keeps its tags); ★ 2 · ★★ 5 · ★★★ 9 cards (rc4). Arrival hands out #1 and #3 (rc4) |
| B Unter Last ◆ → **M6** | The first n = 200 run awards **#2 „Wie viele Versuche?“** (moved from 03 C); it now carries the „16 von 20 heißt 58–92 %“ line of the retired station on its card. Entscheider: shorter setup (the conditions are preset) |
| C **Drei Auditoren, kurz** (rev 2) | **Side station in Entdecker mode** (D40). **6 clips** (2 clear successes, 1 clear Fehlgriff, 3 ambiguous: 15 mm off, regrasped, placed at 9.5 s), playback 2× by default, a **κ needle** (0–1 with the 0,8 mark; the number small beside it). Round 1 refuses („κ = 0,58 < 0,8 – erst Erfolg als Regel definieren.“); round 2 sets the rule (Toleranz, Zeitlimit, Nachgreifen) and re-tags the 3 ambiguous clips. ★ report printed · ★★ no refusal in round 2 · ★★★ κ ≥ 0,9 (recalibrate with bots for 6 clips). ≈ 2.5 min (was ≈ 5). Lesson unchanged: „Erst eine Regel macht aus Meinungen eine Messung.“ |

### 4.8 Traumhangar (new ground zone `traumhangar`; R3 §5 with the changes noted)

| | Spec |
|---|---|
| Where | The Werft, centre (122.6, 110.4), a 48 × 32 × 12 m hall with doors to bearing 312 (toward the island), reached from the G120 pad. Ground frame, so it is suspended in the air (D36). Exterior tier ≤ 110 m; `interior: true` |
| Fantasy | Real two-legged robots in charging docks. Before each one moves, it shows its **dream**: teal ghosts of the next seconds (chip TRAUM); then reality runs in orange (house colours: teal = prediction, orange = reality and policy, as in the Lern-Dojo). House line „Erst im Kopf durchspielen, dann erst anfassen.“ |
| Real robots | **Unitree R1 → G1 → H1-2 → H2** (BSD-3-Clause, `unitreerobotics/unitree_ros` @ `5994d4f`: `R1.urdf`, `g1_29dof_rev_1_0.urdf`, `h1_2_handless.urdf`, `H2_dae.urdf`; no third-party hands), one skinned GLB each. The G1's moulded lettering is kept; no Unitree logo elsewhere. Card facts HERSTELLERANGABE with date; walking speed „nicht angegeben“ where Unitree gives none |
| Landmark | The **Messlatte** wall: four docks at true height (R1 1,23 m, G1 1,32 m, H1-2 ≈ 1,79 m, H2 1,83 m; heights from the models, MODELL), EMI's 1,55 m silhouette and a line at your eye height. The H2 dock holds a **teal dream ghost** from the first minute, with a ring that shows the mastery gate („★★★ R1 · G1 · H1-2“ and „★ 47/84 · ab 63“) |
| How you pilot | R3 §5.2, inside `enterOperate({ capture })` (WP4). Legs by velocity commands (W/S speed, A/D turn; the mouse turns the head ±60°); arms by teleop (hold RMB: hand target on a plane by IK; LMB grip/release); **imagination** by holding Space (time ×0.1, ghosts show the next H s; wheel = horizon; 1/2/3 = candidate; release = act). First person is the robot's head camera (R1 ≈ 1,05–1,16 m … H2 ≈ 1,73 m: you feel the size). V toggles a chase camera. Enter by the pilot plate + E; Esc leaves |
| Comfort [C1 m5, C2 m7] | The head camera is stabilised: no gait bob, horizon level, yaw follows the robot smoothly. Under reduced motion the chase camera is the default |
| Toy world model | An ensemble of K = 5 „Traumköpfe“: copies of the private Rapier world stepped ahead with the learned assumptions (μ̂ = 0,8 everywhere, labelled masses, no gusts), plus per-step noise. The spread grows ∝ √t, with a bias off the training floor; objects hidden > 1 s fade from the dream (object permanence); grasps are optimistic. One dream = K × H × 60 steps of ≤ 12 bodies, ≤ 8 ms spread over frames (≤ 2 ms per frame); a Traumbudget counts dreams. Card: „Hier träumt ein Spielzeug-Weltmodell: dieselbe Physik mit falschen Annahmen und Rauschen. Echte Weltmodelle sind neuronale Netze. Ihre Fehler sehen genauso aus.“ Unitree's UnifoLM-WMA-0 is non-commercial and is never used. Ghosts are skinned clones at LOD2 (WP0 R2) in one transparent teal material |
| Motion | kinematic gait (leg IK on the URDF chain + root motion), arm IK, crates attached; chip „Bewegung animiert, keine Ganzkörper-Physik“ |
| EMI | no EMI body (budget); EMI-01 on the radio, H routes to the zone's own help via `emi:ask` |
| Origin | WP2's wave-1 spike (`src/zones/_traum-spike/`) proves piloting and the ensemble before WP10 starts [C1 M12] |
| **Flugmodell an Bord** (D23) | The hall's ◆ is the island's **NAVIGATION** system (manifest `system: 'NAV'`, `trim: 'T2'`). When C is stamped, the training mix with the best **closed-loop** result (never the offline winner, never „Stillstand“) becomes the island's Flugmodell: the upload beat (§3.3), the needle light teal, the checklist line „NAVIGATION · Flugmodell: {Mischung} · {+x pp} geschlossen“. It pays off in the whiteout of the lift-off (§4.15), with the 2 s horizon of station B. Card (≤ 35 words): „So ist auch das Flugmodell der Insel gebaut: geprüfte Träume, im geschlossenen Lauf gemessen. Die Insel ist erfunden – der Fehler, den du gefunden hast, nicht.“ (FIKTION for the island, the lesson stays the station's) |

| | A R1 „Erster Schritt im Kopf“ (3 min) | B G1 „Wie weit vorausträumen?“ (3 min) | C ◆ H1-2 „Traumdaten“ → **NAV** (Flugmodell) + T2 (4.5 min) |
|---|---|---|---|
| Unlock | open at entry | ★ in A (the G1 rises from its crouch) | ★ in B |
| Do | Walk 25 m over 6 Weichen (3 training floor, an ice sheen, glass that looks like floor, a loose grating). At each, hold Space to see 1 s ahead, then E „Vertrauen“ or Q „Prüfen“ (a safe probe step, 3 s). A wrong trust slips, and the R1 gets up again | Carry a 2 kg box (the G1's official arm load ≈ 2 kg) around a pillar to a shelf 6 m away while the service rover crosses. Pick 1 of 3 ghost plans or „Auto“. **Three horizons, 0,5 / 2 / 8 s, shown as parallel ghosts** [C2 M6]: short horizons walk into the dead end, long ones blur and lose the box behind the pillar. Messlauf: 20 runs per horizon in parallel lanes at 8× (≤ 8 s) | The H1-2 has 20 real demos of lifting a crate; the new task (push a cart onto the lift) has none. „200 Träume“: the wall shows **8 sample tiles; find the 3 physics errors** (crate floats, hand through crate, crate vanishes, feet glide; ≈ 30 s) with the Physik-Lupe [C2 M9]. Choose the training mix (nur echt / echt + alle Träume / echt + geprüfte Träume). The offline bars come first, and a hidden fourth bar „Stillstand“ wins offline (the trap: click it). Then **drive one closed-loop trial yourself** with your mix (velocity commands, the policy grasps; ≤ 40 s). Then n = 20 per mix in parallel lanes (≤ 8 s) |
| Prediction | — | „Bei welchem Horizont klappt es am häufigsten?“ (0,5 / 2 / 8 s; the zone's one prediction) | — (the trap is the discovery) |
| Measured value | „Vertrauen richtig 5/6 · 68 s“ | „Bester Horizont 2 s · 85 % [64–95] · n = 20“ (ILLUSTRATIV hump, SIM draws) | „Geprüfte Träume: +35 pp [+8, +58] im geschlossenen Lauf · n = 20 · offline hätte Stillstand gewonnen“ (toy values R3 §5.5, calibrate) |
| ★ / ★★ / ★★★ | reach the end · ≥ 5/6 correct calls · 6/6 in ≤ 75 s | deliver once with a dream + Messlauf · prediction right · three deliveries in a row in manual mode with ≤ 9 dreams | offline + closed loop for ≥ 2 mixes · all 3 physics errors found with ≤ 1 false flag · the Stillstand bar named as the trap before the closed-loop result |
| Lesson | „Der Traum kennt nur Boden, den er schon gesehen hat.“ | „Zu kurz geträumt: Sackgasse. Zu weit geträumt: Fantasie.“ | „Offline gut heißt nicht gut. Miss im geschlossenen Lauf.“ / “Good offline doesn't mean good. Measure closed-loop.” |
| Key line | „Er hat Boden geträumt. Es war Eis.“ | „Hinter der Säule hat er die Kiste vergessen.“ | „Wer nichts tut, macht offline keine Fehler.“ |
| Entscheider | — | the preloaded Kennlinie: set the horizon a vendor should guarantee (1 min) | „Der Traumdaten-Deal“ (≈ 4 min): offer A „10.000 Träume, offline +40 %“ vs B „1.000 geprüfte Träume + Messung im geschlossenen Lauf“; the Stillstand bar visible from the start. Befundkarte: Messgröße closed-loop success vs offline error, horizon · Grenze hallucinated physics, error grows with the horizon, objects vanish · Frage #9 plus the follow-ups „Wurde geschlossen am Roboter gemessen, mit n und Intervall?“, „Wie weit reicht die Vorhersage, und wie oft wird neu geplant?“, „Kennt das Weltmodell deinen Roboter, deine Kameras, deine Teile?“ (lines, not new question cards: the nine stay nine, D33) · Für dein Werk „Synthetische Daten nur mit Ablation und geschlossener Messung; Lizenz der Gewichte prüfen – nicht-kommerziell kommt vor.“ The bars are exported for the Schaufenster's Kurzlauf (§4.9), which is titled „So entsteht das Flugmodell“, because in Entscheider mode the Bodencrew's Flugmodell was built this way |
| Album / eggs | — | `kiste-weg` | `stillstand-gewinnt`; egg 12 „Traumraum“ (album) |
| Reduced motion | no slip animation (a still with the ice label) | ghosts drawn without motion trails | glitch tiles as stills (flash-checked) |
| Delivery | R1 to the Schauhalle on ★ | G1 on ★ | H1-2 on ★ |

**Meisterprüfung · H2 „Generalprobe“** (≈ 90 s task; D21; station id `generalprobe`, `mastery: false`)

| | Spec |
|---|---|
| Before the gate | **Traum-Probefahrt** from the first hangar stamp: drive the H2 only as a ghost on the dream floor; no stars, no measurement; „Den H2 kannst du erst nur träumen.“ |
| Gate | ★★★ on A, B **and** C, and ★ ≥ ⌈0.75 × pool⌉ (63 of 84). Never blocks the lift-off. Radio: „Der H2 ist frei. Er wartet im Hangar.“ The ghost snaps into the orange real robot |
| Task | Walk 18 m over mixed floor; open the hatch (teleop pull); lift the crate labelled **5 kg**; carry it past the rover lane in a gust; place it on the lift pad. Then a second crate labelled **18 kg** appears (the Dunkelfabrik's). The dream, optimistic, shows the lift succeeding, but the H2's rated arm payload is ≈ 7 kg and its peak ≈ 15 kg (HERSTELLERANGABE). **The right move is „Ablehnen“** (refuse and call the cart). Traumbudget 12 dreams; the ghosts are reliable to ≈ 2 s |
| Result | ★ the 5 kg crate on the pad = **H2 earned**: its cover in the Schauhalle comes off once (`quest.unveilH2()`), it stands beside you at the next lift-off or „Start wiederholen“, and the certificate gets „H2-Meisterprüfung bestanden“ · ★★ no fall and ≤ 12 dreams · ★★★ ≤ 100 s and the 18 kg crate refused. These stars are excluded from the pool |
| Lesson | „Ein Traum kennt kein Datenblatt. Du schon.“ / “A dream doesn't know the datasheet. You do.” · „Der Traum sagt ja. Das Datenblatt sagt sieben Kilo.“ |

Budget: detail ≤ 80 draws; robots ≤ 70 k triangles (the active robot at LOD0 ≤ 40 k, 5 ghosts at LOD2 ≤ 15 k, 3 docked robots as silhouettes ≤ 8 k); ghost moment JS ≤ 9 ms at 4× CPU.

### 4.9 Schauhalle Nord (new island hall zone `schauhalle`; R4 §7–§8 with the changes noted)

| | Spec |
|---|---|
| Where | x −15…15, z −80…−52, 9 m clear height, glass front and back, **frosted side walls** toward 02 and 03; entered from the ring path (south front), left by the north door to the Glasbalkon; the central aisle continues the north spoke. Its roof frame carries the 8 PV tracker segments that stood beside the north spoke (D28; island geometry by WP12). Rect tiers (detail ≤ 8 m outside the rect) and `interior: true` |
| Feel | A car dealership that sells nothing: shop window → reception (the Lastenheft terminal) → robots on turntables → the „new model“ under a cover at the back. Dark glossy floor (static env map, no SSR), white ceramic plinths, category pylons GEHEN / GREIFEN & FAHREN / **SELBST BAUEN** [C2 M8] |
| Robots (20, 21 with LeKiwi) | below. The H1-2 replaces R4's H1 (it shares the hangar's GLB and has a payload with its condition). **The amber models (Spot, MiR250, KUKA iiwa 14, Robotiq 2F-85) are plain exhibits**: no rotor delivery and no Kistenwaage point depends on them, so a legal „no“ removes four plinths and nothing else [C2 m9] |
| SELBST BAUEN | SO-101, Open Duck Mini v2 and LeKiwi (if its licence is green, WP0 R5) with their parts cost (QUELLE, parts lists) and a door to egg 15 „Werkbank der Offenen“ |
| Turntables | Ø 2.4 m humanoids and quadrupeds, Ø 1.6 m arms; hands and grippers on 0.9 m columns; one turn per 40 s, stopped under reduced motion; the FANUC on a fixed plinth: „Zu schwer für den Drehteller: 1090 kg.“ |
| **Vorführung** [C2 M8] | On approach (≤ 6 m) each plinth robot plays a 6–10 s joint clip of what it is built for, once per approach (data `src/zones/schauhalle/data/clips.ts`, played with `ctx.robots.animate`): Spot sits and stands, the 2F-85 opens and closes, the Shadow Hand counts to five, the FANUC sweeps, the UR5e and FR3 pick an invisible part, the Go2 and ANYmal D shift their weight, the humanoids turn their heads and raise a hand. Chip „Bewegung animiert“. Under reduced motion the clip shows its end pose |
| Datenblatt | A waist-high stand per robot (name, status chip, 4 key numbers); E opens the card: ≤ 35 words at open, the rest on „Mehr“. Rows: Größe (HERSTELLERANGABE + what the Messlatte measured, MODELL), Gewicht, Gelenke (toggle „Gelenke zeigen“), Nutzlast **with its condition**, Reichweite/Tempo/Laufzeit („k. A.“ where none), Kann heute / Grenzen (R4 §2.3), **Preisklasse**, Modell & Lizenz (generated from the manifest), Quelle + „Stand 17.10.2026“ |
| Price bands (D17) | Bands: „unter 1.000“ · „1.000–10.000“ · „10.000–50.000“ · „50.000–150.000“ · „über 150.000“ · „auf Anfrage“, with the label „Preisklasse (Listenpreis, US-$ oder €, ohne Steuern und Versand)“ and the chip QUELLE + date. The bands are wide enough that the currency moves no listed robot across an edge. Data per robot: `price: { band, basis: 'liste' \| 'quelle' \| 'anfrage', source, date }` (`data/prices.ts`). Assignments from R4 §3: SO-101, Open Duck, LeKiwi „unter 1.000“ (parts); R1, Go2 „1.000–10.000“; G1, Stretch 3 (launch price 2024) „10.000–50.000“; Spot „50.000–150.000 (historisch, 2020)“. **H2 shows both sources** [C2 m4]: „10.000–50.000 (Hersteller) · Händler bis ≈ 90.000 (QUELLE, Stand …)“. For robots without a public list price, a dated secondary source (distributor list, press, public tender award) gives „auf Anfrage · {Band} laut {Quelle}, Stand {Datum}“ (QUELLE) [C2 M8]; only the rest stay „auf Anfrage“, with one line on the card: „Kein öffentlicher Listenpreis. Frag nach Zubehör, Integration und Betrieb.“ Card line for all: „Ein Listenpreis ist nicht die Rechnung: Zubehör, Integration und Betrieb kommen dazu.“ WP11 fills the data from R4 §3; WP18 extends the secondary sources |
| Größenwand | All robots as silhouettes at true scale (one merged line-up, `lineup.l2.glb`, WP0 R6), 0–2,5 m scale with 10 cm ticks, EMI 1,55 m and „Du“ 1,75 m; a laser line follows your eye height |
| Kistenwaage | Grabbable loads of 1, 2 and 5 kg and one 18 kg crate. **Three load points on green models**: the FANUC hook, ANYmal D's payload rails and a hook under the UR5e. A gauge shows % of the vendor spec with its condition; over the spec: „Über der Angabe. Was dann passiert, steht in keinem Datenblatt.“ (never a staged failure). Warm-up „Wer nimmt die 18-kg-Kiste?“: by one vendor figure only the FANUC; the H2 only on paper with both arms at peak (2 × ≈ 15 kg), not at rated load (2 × ≈ 7 kg); the MiR250's 250 kg is on its card only |
| Compare stage | Bühne A + B, two robots at true scale, cards aligned row by row, no winner, no score |
| Inspektion | E at a plinth: operate-mode orbit, wheel zoom, ←/→ next robot, C to the compare stage. **LOD0 is the inspection model** (no third tier) [C1 M4] |
| LOD governor [C1 m2] | Inside the hall: ≤ 2 robots at LOD0 (inspected or nearest), ≤ 8 at LOD1 within 12 m, the rest as silhouettes; posed once, no skinning updates except the ≤ 2 playing a Vorführung; LRU of 3 parsed LOD0 files beyond the visible set (`RobotLibrary.release` for the rest) |
| Probefahrt | on SO-101, Open Duck and the Unitree four: a button sets the objective to their station |
| Tresor | the H2 under a white cover in front of the north window, lit, card readable from the start; the cover comes off when the H2 is earned |
| Pannen-Wand + Fundvitrine | the album entries as small exhibits; next to it the 25-compartment Fundvitrine for secrets (objects registered with `ctx.game.secrets.registerObject` by WP15; the hall places them by id) [C1 M11] |
| Disclaimer | entrance and credits: „Alle Namen und Marken gehören ihren Inhabern. Kein Hersteller hat diese Halle geprüft oder unterstützt.“; plaque „Jede Zahl hier ist eine Herstellerangabe mit Quelle und Datum. Nachmessen erlaubt.“ |
| EMI | no body; EMI-01 on the radio: „Ich verkaufe dir nichts. Ich zeige dir das Datenblatt – und die Bedingung dazu.“ |
| Loading | robots stream nearest first into their plinths; the delivery crate is the visible placeholder with the loading card's bytes; in Entscheider mode everything streams in this way (never ≈ 3.5 MB at once) [C1 M14] |

**First visit in Entdecker mode (4 min, on the route between 02 and 03)** [C2 M8]: the Größenwand (30 s) → the Kistenwaage warm-up (60 s) → **one Lastenheft round** with jobs drawn from the robots already standing (2 min; it can earn the stamp) → the two deliveries (ANYmal D, Open Duck).

**Schaufenster stop in Entscheider mode (2.5 min, on the route between 02 B and 03 C; D41, amended by D23)** [C2 M7]:
1. the Größenwand (20 s);
2. the G1 datasheet with its payload condition and price band (20 s);
3. three **Kurzlauf** stands, played from recordings, each with its Befundkarte:
   - „Belohnung“ (40 s): the duck rewarded only for Vorwärts → belly flop → fixed (data from WP5, R2 §6.7);
   - **„Erntetag“ (30 s)**, titled „So lädt die Bodencrew den Startakku“ (D23): the Sonnenacker's automated day at 8× (≤ 10 s) with the dashboard's kWh (RICHTWERT) and the Startakku bar (FIKTION) filling, then its Befundkarte: Messgröße success per fruit (Wilson) and cycle time beside the research mean (66 %, 33 s) · Grenze: the bed is built for the robot; people deleaf, pollinate and clear jams · Frage „Unter welchen Bedingungen wurde gepflückt: Sorte, Licht, Beet?“ (a line, not a new question card, D33) · Für dein Werk „Rechne mit den Hilferufen, nicht mit der Vorführung.“ (data from WP9, R8 §2.3);
   - „Traumdaten“ (40 s), titled „So entsteht das Flugmodell“: offline bars vs the closed loop, with the Stillstand trap (data from WP10, R3 §5.6).

The stop takes 2.5 min (20 + 20 + 40 + 30 + 40 s). Each Befundkarte joins the Entscheider PNG set.

**Line-up and deliveries** (Entdecker: gated, the crate is the loading placeholder; Entscheider: everything streams in, except the H2 cover)

| From | Robots |
|---|---|
| Bestand (9 + LeKiwi) | UR5e, Spot (amber), KUKA LBR iiwa 14 (amber; dropped first if the 4 MB cap binds), Robotiq 2F-85 (amber), Unitree Go2, Hello Robot Stretch 3, PAL TIAGo, PAL TALOS, MiR250 (amber); LeKiwi on the SELBST BAUEN pylon if green |
| Rotors (6, the zone's verb) | M1 SEHEN → ANYbotics ANYmal D · M2 REGELN → Open Duck Mini v2 · M3 GREIFEN → Shadow Dexterous Hand · M4 LERNEN → SO-101 · M5 ARBEITEN → FANUC R-2000iC/165F · **M6 MESSEN → Franka Research 3** (a torque sensor in every joint; HERSTELLERANGABE) |
| Traumhangar | R1 (A ★), G1 (B ★), H1-2 (C ★); H2 unveiled when earned |
| Stars | Apptronik Apollo at ★ 36 (≈ 43 % of the pool; calibrate) |

Unboxing: a drone lowers the crate onto Bühne A in 6 s (instant under reduced motion), toast „Lieferung: ANYmal D · ausgepackt in der Schauhalle“, once per robot (`zoneData.schauhalle.unboxed`).

**Station „Lastenheft“ ★** (id `lastenheft`, ≈ 2 min a round; R4 §8). The terminal deals 3 jobs from the pool; only stated values count („k. A.“ never fits). Walk to the robot and press E „Passt“, or „Keiner passt“ at the terminal; the deciding rows light up with their condition; tap the deciding row to justify. ★ 2 of 3 right · ★★ 3 of 3 with the deciding row tapped · ★★★ also the trick job („Keiner passt“) right on the first try. Pool as R4 §8, with the H1-2 in the humanoid job („dauerhaft 10 kg pro Arm“ → keiner: H2 und H1-2 ≈ 7 kg Nennlast). On the first visit the deal draws only robots already standing. Lesson: „Die Zahl allein reicht nicht. Die Bedingung entscheidet.“ Entscheider Befundkarte „Datenblatt“ (R4 §9): every spec has a condition; check the status before the spec; environment is a spec; a list price is not the cost.

Budget (own tier, D28): detail ≤ 80 draws (≈ 44 planned: hall 15, turntables 2, text 2, cones 1, near robots 1 draw each, line-up 1, crates 1) and ≤ 300 k triangles under the governor; total view ≤ 180 draws (§5.5); exterior ≤ 12 draws / 40 k; far ≤ 2 / 3 k. Robot downloads §5.6.

### 4.10 Sonnenacker (new ground zone `sonnenacker`; R8 §2)

| | Spec |
|---|---|
| Where | (−290, 60), 150 × 100 m (1.5 ha, under the 2.5 ha of §35 BauGB), in the sun; the Hofladen at the east gate (−215, 70), 85 m from the G240 pad; the Grubenrand on the way (§2.3) |
| Site | **Sonnendach A** (the play block): 36 × 14 m, clearance 2.6 m (DIN SPEC 91434 Cat. I > 2.1 m), 6 single-axis east–west tracking rows of bifacial modules. Under it **6 Hochbeete** of 1.0 × 30 m, 0.85 m high, with two cherry-tomato rows 0.25 m from each long edge („planted for the robot“), and **12 SO-101 arms** on rail carriages (one per bed edge, 0.6 m lift). **Sonnendach B** as ambience (6 arms at far LOD). 3 unroofed Referenzbeete; gutters → cistern → drip lines; 2 Hummelkästen; the Hofladen with the dashboard wall; a 1:20 Tagesmodell (station B) with its own sun lamp, so the world's sun never moves; hedge and flower strips. Crate transport by **LeKiwi** rovers (real, Apache-2.0, WP0 R5) if the mesh licence is green, else rc4-style service rovers [C2 M10] |
| Owner of the arms | WP9 owns the 12 + 6 farm arms and the shift state machine; WP15's life director subscribes through events (`sonnenacker:shift`) [C1 M11]. Arms near you (≤ 1 at LOD0 within 6 m, ≤ 2 at LOD1 within 12 m) are RobotModels; all others are one InstancedMesh per body at LOD2 (≈ 7 draws for all) [C1 m1] |
| EMI | **EMI-08** at the Hofladen (base pitch 800 Hz) |
| Real robot | SO-101 (shared GLB), LeKiwi base + SO-101 arm (if green) |
| **Startakku** (D23, D27) | The farm's ◆ is the island's **ENERGIE** system (manifest `system: 'AKKU'`, `trim: 'T3'`): the field harvests tomatoes *and* power. The Hofladen dashboard wall carries the bar „STARTAKKU · TROCKENDOCK 3“ from the first visit (FIKTION, percent only, a third per earned stamp). During C's automated day it fills with the day's kWh counter (RICHTWERT) and locks at 100 % on the ◆ (the charge beat, §3.3). The fill during the day is presentation only; the state comes from the stamps. Card (≤ 35 words): „Der Startakku gehört zur erfundenen Insel. Die Kilowattstunden sind ein Richtwert für dieses Dach – in Schub oder Flugzeit rechnen wir sie nicht um.“ |

| | A „Reif oder nicht?“ (2 min) | B „Licht teilen“ (2.5 min) | C „Erntetag“ ◆ → **AKKU** (Startakku) + T3 (3.5 min) |
|---|---|---|---|
| Do | look through the wrist camera; sort **12** tomatoes into „pflücken / warten“ by the USDA colour classes (Light red + Red → pick); the arm is tested on 40 fruits in the sun, then under the panels, where red looks darker and accuracy drops; place the colour reference card in view (F, grab verb) and test again | **First drag the table model's sun lamp across the day by hand**: the crop-light and kW gauges pull against each other [C2 M6]. Then choose module density (3 steps) and tracking policy („Sonne zuerst“ / „Pflanze zuerst“ / „Schutzstellung bei Hagel“), predict the tomato yield (the zone's one prediction), and run the season in 10 s (Space = jump to the result) with a hail front (FIKTION). Read crop light, tomato yield, kWh, LER and the DIN check | deleaf two rows (E on leaf clusters: the human's job), choose the harvest window, start: the automated day runs on the real beds in ≈ 90 s (12 arms pick, rovers carry trays, the dashboard counts); 3–5 calls for help (jammed gripper, fruit behind a stem, bumblebee box, a tray on the path): run there and press E within 10 s; between calls, E on any arm shows its camera and its next pick |
| Model | accuracy from hue thresholds learned on your labels; shade tints the camera | T ≈ 0,85 / 0,70 / 0,55 by density; Y_crop = 1 − s·(1 − T), s ∈ [0,7; 1,0] shown as a **band** (the light rule for fruit vegetables, [R8 S14]); Y_el = 0,83·(1 − T)/0,30 capped at 1; LER = the sum (T 0,70 → 1,53–1,62; the densest roof has the highest LER and fails DIN: „LER allein reicht nicht – die Norm schützt die Ernte.“) | p = p_vis · p_ripe(A) · p_window; p_vis free 0,85 / half 0,55 / hidden 0,10 (ILLUSTRATIV); deleafing moves fruit to free; damage 3 % + 2 % per mis-calibrated grip; cycle median ≈ 25 s |
| Measured value | „Sonne 38/40 · Schatten 31/40 → mit Karte 37/40“ (k/40, Wilson) | „Ernte 70–79 % · LER 1,53–1,62 · DIN ✓“ | „Ernte 50/60 · 83 % [72–91] · 1 Schaden · Ø 25 s · 4 Hilferufe · 106 kWh erzeugt, ≤ 10 kWh verbraucht“ (SIM · LIVE; RICHTWERT energy, R8 §2.3). **The banner shows the reference beside it** [C2 m3]: „Forschungsmittel 66 % · 33 s (Bac et al. 2014) · hier: Beet für den Roboter gebaut, entlaubt“ |
| ★ / ★★ / ★★★ | 12 taught + test run · ≥ 36/40 under the panels ([77–96 %]) · calibration found before the second shaded test | a DIN-conform roof (crop band ≥ 66 %) · LER band ≥ 1,5 with crop band ≥ 70 % · prediction within ±5 points of the measured centre | the day completed (≥ 1 full tray) · Wilson lower bound ≥ 70 % (≥ 49/60, [70–89 %]) · also ≤ 2 damaged fruits and every call answered ≤ 10 s |
| Lesson | „Farbe allein lügt bei anderem Licht. Kalibrieren schlägt Raten.“ | „Tomaten lieben Licht. Hier lohnt das Dach als Schutz und Eigenstrom.“ | „Vollautomatisch heißt nicht menschenleer. Menschen planen, pflegen, reparieren.“ / “Fully automated does not mean nobody. People plan, tend, repair.” |
| Honest numbers | QUELLE: USDA classes | RICHTWERT light rule; QUELLE Almería (30 % shade → −15 % yield) vs Arizona (cherry tomatoes doubled under PV): **shade costs tomato yield in Germany** (card „Arizona ist nicht Brandenburg“) | QUELLE: „Mittelwert von 50 Forschungsrobotern: 66 % Erfolg, 33 s pro Frucht, keiner im Handel (Bac et al. 2014)“; 61 % vs 18 % by crop condition (SWEEPER 2020); the honest SO-101 card „Ein Lernarm für 122 Dollar Teile. Gut für Kirschtomaten im Hochbeet, nicht fürs Gewächshaus.“ (QUELLE, parts list); card „Die Früchte hängen 25 cm vom Beetrand: kurzer Hebel für den Arm.“ (MODELL, links to the Lastdiagramm) |
| Entscheider | optional | the economics overlay (LCOE 7–12 ct/kWh, own use, DIN, BauGB; no EEG tariffs) | C (3 min) + „Was darf der Ernteroboter kosten?“ (R8 §2.6, RICHTWERT, eigene Rechnung); an optional detour that replaces the Bodencrew's Startakku with the player's own. One run is recorded for the Schaufenster's Kurzlauf „Erntetag“ (`tools/sonnenacker/kurzlauf.mjs`, §4.9) |
| End list | — | — | „Wo du gebraucht wurdest“: deleafing, pollination (bumblebees), jams, hidden fruit, deciding what to grow; context: 28 % of Germany's farm workforce were seasonal workers (QUELLE, R8) |
| Reduced motion | camera static | the season as a fade between two stills; no lightning (flash-checked) | the day without camera moves |
| Album / eggs | — | — | „Zu fest gegriffen“, egg 24 „Herztomate“ (album), egg 22 SHOULD |
| Lift-off | the tracker rows of both Sonnendächer stow flat when the downwash front passes (`flight:phase` 'downwash'); every SO-101 waves for 2 s (`life:react` 'liftoff'); with a stamped site, the agronomist and a LeKiwi join the apron crowd in C1 | | |

**Tomatenkapseln aboard:** the three rc4 hydroponic pods become Tomatenkapseln. The one at bearing 240 holds an SO-101 (LOD1) picking cherry tomatoes at the research pace; plaque „Vom Sonnenacker. Diese Kapsel fliegt mit.“, so the lesson flies with the island. Site budget: detail ≤ 70 draws, ≤ 130 k triangles, ≤ 2 local lights, update ≤ 1.0 ms. The far PV stripes seen from the island are analytic shadows in the bed and ground material [C1 m7].

### 4.11 Use-case scenes in the Revier

Rule (R8 §3): no vendor publishes a usable model, so these sites use **generic procedural machines that look like no product**; vendor names appear only in source chips and Entscheider cards (D34). Each scene is a one-station site zone (one stamp, 3 ★, counted in the pool); EMI-09 roams to the site you are at.

| Tier | Site | You do (min) | Measured value | ★ / ★★ / ★★★ | Lesson (≤ 14 words) | Real reference (chip) |
|---|---|---|---|---|---|---|
| **MUST** | **Kreislaufhof** (340, −40), hall in the shade, station id `sortieren` | Scene 1 (90 s): **the delta picker's confidence threshold is a live slider while the belt runs**; purity and recovery move under your hand over 100 items [C2 M6]. Scene 2 (60 s): take apart a screwed device (the real SO-101 helps) and a glued one (it cannot), and sort the parts (3 min) | purity and recovery, each k/100 with Wilson | both scenes · one threshold with purity ≥ 90 % and recovery ≥ 70 % · find the threshold where the two curves cross within ±0,05 (calibrate) | „Reinheit kostet Ausbeute. Der Schwellwert ist eine Entscheidung.“ | sorting robot peak and sustained picks (vendor, HERSTELLERANGABE), e-waste 62 Mt / 22,3 % (QUELLE, UN), EU right to repair from 31 July 2026 (QUELLE) |
| **MUST** | **Unkrautacker** (−230, −260) with sheep under vertical PV fences (Cat. II), station id `jaeten` | **Steer the laser weeder yourself for 20 s on the first field** (aim with the mouse; the camera marks the weeds) [C2 M6]. Then choose mapped hoeing, camera spot spray or laser for the other two field states (dry and clean, wet and weedy, just emerged); 50 plants each at 4× (≤ 8 s) (2 min) | weeds left, crop damaged (k/50, Wilson), energy and area per hour | three choices made · no crop loss above 5 % · every field with its best method on the first try | „Ohne Gift geht. Jede Methode zahlt anders: Zeit, Energie oder Präzision.“ | FAO figures for mapped mechanical weeding, vendor figures for spot spray and laser (HERSTELLERANGABE; unverified ones not shown) |
| SHOULD | Dorf (−45, 256) at the Bahnhof | follow one parcel rover; when it is stuck, you are the remote helper; the dashboard runs 100 trips at 8× (1.5 min) | help calls per 100 trips (Wilson on the trip share) | ride + help · ≤ 3 help calls in your trip · predict the rate within ±5 | „Zähl die Hilferufe pro hundert Fahrten, nicht die gelungene Vorführung.“ | delivery-robot fleet totals (vendor, HERSTELLERANGABE) |
| COULD | Holzbau-Werkhof (230, 230) | order 6 segments so the joints close (60 s puzzle) | time per segment (median of n = 6) | — | „Rechnen plus Roboter: dreißig Meter Spannweite mit wenig Holz.“ | BUGA Wood Pavilion 2019 (QUELLE) |
| COULD | Windkamm | plan a blade repair over a 7-day wind strip: rope team or crawler | working hours (RICHTWERT) | — | „Roboter holen Menschen vom Seil. Ein Wetterfenster brauchen auch sie.“ | ENGIE 2026 (QUELLE), crawler claims (HERSTELLERANGABE) |

**Grubenrand** (MUST landmark, WP14): the terrace cut by the Hofladen, a generic bucket wheel (Ø 12 m, weathered steel, no specific machine; ≤ 3 draws), and the Revier-Chronik board of §2.8.

Budget per site: detail ≤ 40 draws / ≤ 70 k triangles; ≤ 30 kinematic items, no dynamic bodies beyond the grab props.

### 4.12 Ambient life (R9 §4; owner WP15)

Rules (R9 §3):
- every moving thing has a job;
- one farm clock (the 8-minute **Hof-Takt**);
- life reacts to you and to progress;
- robots miss and ask for help at sourced rates;
- nothing blocks a route for more than 2 s;
- budget first;
- no sun cycle: time is told by the farm clock and the dusk after the lift-off (D35).

Zones talk to life only through events (`sonnenacker:shift`, `life:react`, `flight:phase`), never by import.

| Tier | Systems |
|---|---|
| **MUST** | **L1** LifeDirector + Hof-Takt. **L2** harvest shift: the 12 farm arms are WP9's; life adds the misses on the vine and the reactions. **L3** tomatoes and crates. **L4** crate rovers (LeKiwi from WP9, or rc4 rover geometry). **L5** reactive robots: they greet, show a flat teal/amber safety ring, slow down, stop and replan with a visible A* (≤ 2 s). **L7 people: 8 stylised faceless figures with jobs** (D18): agronomist with a tablet, technician swapping a gripper finger, two Nachlese pickers, two visitors at the Hofladen, a dock crew member at the bridge head, a mechanic in the Werft. Mixed ages and body types, matte stone base with olive/sand/slate accents, no names, no dialogue; robots yield to people, people yield to you. **L8** bumblebees (buzz bed). **L17** the region reacts: at each rotor birds flush and people wave; at the lift-off every SO-101 waves for 2 s. **Apron crowd** [C2 M2, m11]: when the lift-off is armed and you are on the Ausguck, the Werft mechanic, the two visitors and the people of stamped sites walk to the apron edge (visible in C1), the dock crew member rides up and stands at the Ausguck rail, and the Winke-Arm waves in C1. **L18** sound beds. **L19** two micro-stories: „Rover 5 und die Pfütze“, „Ersatzfinger per Drohne“ |
| SHOULD | L6 delivery drone story · L9 swallow flock + the stork · L10 flower strips + butterflies · L11 sheep under PV · L12 gust bends plants, turbines turn · L13 PV cleaning robot (island rows + farm) · L14 Hofanzeige board („Ernte heute 64 % [58–70] · n = 212“ SIM · LIVE + the QUELLE line) · L16 Feldbahn timetable and cargo bike · micro-stories „Nachlese“, „Der Storch kommt“ · airborne, a cargo copter brings a Sonnenacker crate to the Tomatenkapsel every Hof-Takt loop [C2 m12] |
| COULD | L15 aquaponics tank · L20 dusk touches aboard |

Tiers:
- near ≤ 40 m at 60 Hz (the closest SO-101 within 6 m at LOD0);
- mid 40–150 m at 15 Hz, round-robin;
- far 150–1,500 m at 2 Hz as one instanced proxy draw („Spielfiguren“);
- hidden inside interiors, the Kielraum, under the deck, or airborne above 300 m.

Caps: ≤ 64 CPU agents, ≤ 400 shader instances, ≤ 6 extra voices, 0 per-frame allocations, 0 new programs after the title except idle-time compiles (§5.5). The director pauses on `game:pause` and behind frozen panels [C1 m8].

### 4.13 Easter eggs (R9 §5; never gate, D35)

Each find puts an object into the **Fundvitrine** (Schauhalle) and fills a slot in the hidden „Funde“ section of the Pass (which appears with the first find), plus an EMI-01 radio line and a sourced card; failure-mode eggs go to the album instead. No stars, no timers, no leaderboard. After the lift-off, H on the Ausguck points toward the nearest unfound H0–H2 egg.

| Tier | Eggs (hint level) |
|---|---|
| **MUST (9)** | 13 **Winke-Arm** at the bridge head (H0; it **waves at you first** as you pass, wiggling is the reply; designed as the first find) [C2 m6] · 3 **Robota** (R.U.R. ticket on the night-shift locker, H1) · 5 **Der Wackelige** (a rover replans around you with a visible A* frontier; Shakey, SRI, H0→H1) · 10 **Erklär’s der Ente** (rubber duck at 02 C, H1) · 11 **Hack-Sammler** (album, all three duck hacks, H1) · 12 **Traumraum** (album, the dream door in the hangar, H1–H2) · 14 **Fotopunkt** (Ausguck photo mode, local PNG with the wordmark per the brand rules, H0; offered once after the lift-off) · 15 **Werkbank der Offenen** (the „Danke“ room behind the Schauhalle: every real model and the software with authors and licences, also linked from the credits and the SELBST BAUEN pylon, H1) · 24 **Herztomate** (album, the arm skips a heart-shaped tomato; grab it into the crate, H0/H1) |
| SHOULD (10) | 1 Die nächste Zahl · 2 Spieluhr (↑↑↑↓↑↑↑↓ on the Pass cover; our own code) · 4 Die erste Schicht · 6 Narziss · 7 Drei Gesetze, zwei Normen · 9 Leicht ist schwer (in the 03 bench room) · 18 Fliehkraftregler · 19 Drohne · 22 Kartoffeln unter dem Kollektor · 25 Das Urkilogramm. **If `secret-audit` shows a median < 5 finds, egg 1 or 25 moves into WP15 as MUST** |
| COULD (6) | 8 Plauderterminal (multiple-choice only) · 16 304 Schachteln · 17 Hallo Welt des Lernens · 20 Ein Stück Stoff von 1903 · 21 Geplant: 90 Sol · 23 Igelhaus |
| Region extras (R8 §4.5, SHOULD) | Die Tomate im Schatten · Kleingedrucktes (billboard „100 % autonom!*“) · Ente trifft Schaf · Sechs Ecken (ride the whole Feldbahn loop) |

Brand and legal (R9 §5.3):
- history in our own words; no replicas of historical robots; no quotes of copyrighted laws or scripts;
- people, research robots and institutes are named; companies stay anonymous („ein Autowerk“) (D34);
- never „Konami“, „Disney“, „BDX“, „Star Wars“, „droid“;
- the EmAI mark is never touched (Recamán eggs use the floor motif echo or sound).

Discoverability target: median ≥ 5 finds in a first full Entdecker run, and ≥ 1 in the first 10 min for 4 of 5 players (§8).

### 4.14 Startprüfung (the finale, renamed; D24)

| | Spec | Reuse |
|---|---|---|
| Name | „Startprüfung“ / “Flight check” replaces „Jahresprüfung“ everywhere. Kielraum arrival line: „Hier unten sitzt der Regelkern. Er hält die Insel – bald in der Luft.“ | `finale/strings.ts` |
| Unlock | KIEL at 4/6 rotors bereit (or the finale already visited) | `lift.ts` (WP12) |
| **F1 „Schwebetest“** | The dock arms release, and the island hovers **10 m** above its keel block (ground altitude 0 → 10 m over 4 s via `ctx.island.setAltitude`; the depth ticks on the dock wall slide through the smoked shell; ground colliders off, ground dynamics frozen, §5.3). You hold it level for 15 s with the rc4 model (θ'' = λ²θ + (u(t − 0,15 s) + d)/I, 3 gust pulses); „Regler übernimmt“ levels it in 1.5 s; then it sets back down with a thud. ★ time over 3°: ≤ 15 s · ≤ 5 s · 0 s (rc4). Reduced motion: no tilt, the artificial horizon. Line: „Hundertfünfzig Millisekunden Verzögerung, und schon schwingt alles. Der Regler ist tausendmal pro Sekunde wach.“ F1's stars count for the pool | `f1.ts` |
| F2 „Das Angebot“ | unchanged (NN-Lage v2 vs Bestand, 200 trials per controller, ruhig/böig/Sturm). Its numbers now drive the gust in the cloud. Entscheider: the protocol tab is collapsed by default | `f2.ts`, `sim.ts` |
| F3 „Empfehlung“ | Unchanged tiles; **the choice flies**: Kein Pilot → Bestand steady; Pilot mit Auflage → the gust triggers a visible „RÜCKFALL AUF BESTAND“; Pilot → NN-Lage v2 shudders and holds (never a crash). Signing arms the lift-off if the island is Startklar (all three systems, D23) | `f3.ts` |
| „Ein Jahr später“ | becomes the optional **„Erstflug-Protokoll“**, a button on the certificate (math and labels unchanged) | `year.ts` |
| After F3 | ride KIEL → AUSGUCK (the rc4 12 s ride, `LOOKS.sunset`) with the checklist card in three blocks. AUFTRIEB: six lines M1–M6 with your ◆ value (`zoneValue()` from `src/core/quest/values.ts`) or „Bodencrew · ohne Kennlinie“. ENERGIE: „Startakku 100 % · {your Erntetag value}“ or „von der Bodencrew bereitgestellt“. NAVIGATION: „Flugmodell: {Mischung} · {+x pp} geschlossen“ or „von der Bodencrew bereitgestellt“. Then the trims that are online, „Regelkern: {dein F3-Regler}“, „Startplatz frei“ | `ride.ts`, `pass.ts` |
| Certificate | front: rc4 + „Erstflug: {Datum} · {n}/6 Rotoren selbst gemessen“ + „Startakku: {selbst geladen \| von der Bodencrew} · Flugmodell: {selbst geprüft \| von der Bodencrew}“; back: „Was du unten gesehen hast“ (§2.8) | `certificate.ts` |

### 4.15 The lift-off (R5 §5; owner WP13)

Place: the Ausguck (+44). Interaction: E at the launch console, then **hold E for thrust above 100 %** [C2 M2]. Releasing E holds the island at T = W: it hovers and h stays. After 6 s without E, EMI-01 says „Dann gebe ich Schub.“ and the climb resumes on its own. **The beats from 22 s to 61 s are keyed to the altitude h, not to the clock**; the times below are for E held. The lift car stays shut.

| t (s, E held) | h | Beat | What you see | Sound | HUD / EMI-01 (≤ 18 words) | Tech |
|---|---|---|---|---|---|---|
| −12…0 | 0 | Pre-flight ride | core sinks away, view swings to the sun | lift hum | checklist card | `rideLift()` |
| 0 | 0 | Console „[E] Abheben“ | EMI-01 beside you, the dock crew member at the rail; earned guests on the ring (R1, G1, H1-2 at LOD1, the H2 if earned, the trained duck); the apron crowd below. **The console shows the three systems ready** (D23): six teal rotor lamps, the Startakku bar full, the nav lamp on standby („NAV · BEREIT“; „BODENCREW“ plates where the crew supplied them) | click, silence | „Auftrieb, Energie, Navigation. Startfreigabe von dir.“ | console prop (1 merged mesh; the lamps and the bar reuse the geometry and material of WP12's Libelle panel, +1 draw) |
| 0–15 | 0 | Spin-up M1 → M6 every 2.5 s, clockwise round you; the trims that are online join at 15 s in one chord, each with a plume at its Kanzel | slot spray bursts and climbs over the rim at each lobe; crown beacons teal; each spin-up draws one step from the Startakku bar (100 → 82 %, FIKTION) | a whump + rising drone *at* each rotor (the sound circles you); Recamán notes a(0…5) = 0, 1, 3, 6, 2, 7, then **one note per online trim**: T1 a(6) = 13, T2 a(7) = 20, T3 a(8) = 12, T4 a(9) = 21; a missing trim leaves its gap [C2 M2] | checklist lines tick by block (AUFTRIEB, ENERGIE, NAVIGATION, then the trims; „T3 aus · Sonnenacker“ for a missing trim); „SCHUB 0 → 100 %“ (FIKTION) | per-rotor `rate[i]` (WP12 API), instanced air-shader strength, `ground.spray` |
| 15–18 | 0 | T = W | the deck still; the arms carry nothing | chord holds | „Schub gleich Gewicht. Jetzt hält sie nur noch die Regelung.“; card a = (T − W)/m (NASA Glenn), live from your throttle | — |
| 18–22 | 0 | Release | six arms swing back (6 thunks), the bridge retracts; „[E] halten: Schub über 100 %“ | hydraulic thunks, rumble | „SCHUB 105 % · a = 0,05 g = 0,49 m/s²“ | `ground.setArms/setBridge` |
| 22 | 0 → | Lift-off | the apron edge sinks below the rim; the horizon at eye level | rumble rises | „HÖHE · STEIGEN · SCHUB“ | `ctx.island.setAltitude(h)` (one setter, §5.3) |
| 22–42 | 0–98 | The region reacts | every SO-101 on the farm raises its gripper and waves 2 s; the apron crowd waves; the flock flushes; **the tracker wave**: the downwash front runs out from the dock and every single-axis PV row it passes (Sonnendach A/B, the Schauhalle roof, the Allee rows) turns to its flat stow position over ≥ 2 s, glints as single ramps [C2 M2] | — | at 32 s: **„Da unten war eine Grube. Jetzt wachsen dort Tomaten und Strom.“** (§2.8) | `flight:phase` { name: 'downwash', r }, `life:react` 'liftoff' |
| 24–32 | 1–25 | **C1** outside shot from drone R-3 beside the dock (≤ 10 s; automatic when „Außenkameras“ is on, or **[C]** during the rise window h 1–60 m if it has not played) | the island rises out of its dock (hull clear at 28 s), spray rings, six downwash columns, the crowd and the Winke-Arm in the foreground | same, distant | chip „R-3 · AUSSENKAMERA · LIVE“, „HÖHE 25 m · STEIGEN 4,9 m/s“ | `cinematic()` in the ground frame |
| 32–42 | 26–98 | Into the shade | the sun slides behind the cloud edge at h ≈ 26 m: a first sunset; the Revier spreads out | light cools | at 38 s: „Wir steigen in den Wolkenschatten.“ | `env.sunBlocked()` with a ±2° soft edge |
| 42–61 | 98–330 | The lid | the cloud base comes down to the tower; needle and crown fade into grey first. **At h 280 the nav lamp on the console switches from standby to active** („NAV · FLUGMODELL AKTIV“, a steady ramp ≥ 1 s), always before the first whiteout frame | the low-pass slowly closes; one soft confirm tone | „Schau nach oben.“; at h 280: „Gleich sehen wir nichts. Ab jetzt fliegt das Flugmodell mit.“ | fog density ramp (§5.7) |
| 61–67 | 330–390 | In the cloud | grey-warm mist (luminance ramp ≥ 2 s, never white, < 0,8); wisps stream past; the sun a soft patch WNW. **The Flugmodell pays off** (D23): a teal ghost horizon and the predicted climb path for the next 2 s (the horizon of Traumhangar B) fade in over ≥ 2 s ahead of you, with the chip TRAUM; the IMU readout checks them. **The gust:** your F3 controller flies it (visual tilt ≤ 1,5°, none under RM) | muffled (low-pass ≈ 600 Hz), rotor echo | „Die Kamera sieht nichts. Das Flugmodell träumt zwei Sekunden voraus, die IMU prüft nach.“; telemetry LAGE + controller (SIM · LIVE: `sim.ts` on one seeded böig gust) + „NAV · TRAUM 2 s“ | the one env-map rebuild hides here; the ghost is ≤ 2 draws (one transparent teal line material, compiled with the finale chunk, §5.5), shown only while the eye is inside the cloud |
| 67–72 | 390–430 | Break-out | warm sun over ≥ 2,5 s (a second sunrise); the deck rises out of the white below you; **the sky dressing appears for the first time** (sister platforms and Prüfinseln fade in over ≥ 2 s) | the filter opens; the 18-note Recamán melody over a pad | **„Gefangen. Die Insel ist ein Roboter – und du stehst drauf.“** | cloud sea shown once its plane is ≥ 30 m below the eye; `sky.reveal()` (WP2) |
| 72–80 | 430–500 | **C2** outside shot from the south (≤ 10 s; automatic, or [C]) | the whole island climbs out of the cloud sea, keel last; sister platforms and cargo copters; the tower's laser sweep (`finale:ended`) | the melody ends on the chord | caption „Diese Insel fällt ständig.“ | camera ≤ 160 m south (mark visibility rule) |
| 80–100 | 500–570 | Level-off | back on the Ausguck; the cloud sea sinks to −180 (h 570 m) | rotors settle | caption „Tausendmal pro Sekunde fängt sie sich wieder.“; banner „SCHWEBEWERK · INSEL 17“ / „Messung statt Marketing.“; „Willkommen über den Wolken. Das war dein Regelkreis.“ | `cloudY` animates; `quest.setFlight('airborne')` |
| 100–120 | 570 | Dusk (rc4) | sun 16° → 3°, position lights (12/12 = the full ring) | rc4 ending | rc4 | `finale:dusk` |
| then | 570 | Certificate, free roam | — | — | front and back (§4.14) | `openCertificate()` |

| Topic | Rule |
|---|---|
| Camera and comfort | First person except C1 and C2 (≤ 10 s each). The pause-menu switch „Außenkameras“ turns them off; under reduced motion they are skipped. [C] calls a shot you chose. No camera roll, no shake above 0,1, no jerk, the horizon always visible, no cut inside the whiteout |
| Reduced motion | Stills with cross-fades, ≈ 45 s: (1) the spin-up on the Ausguck with sound, checklist and the three systems on the console, spray slowed; (2) a held view 60 m over the dock; (3) the cloud with the static ghost horizon and the Flugmodell line; (4) above the clouds with the banner and the captions. Then the dusk as a colour blend. No outside shots, no tilt, no streaming wisps, no tracker wave animation (rows shown stowed). Same for every replay |
| Photosensitivity (WCAG 2.3.1) | Whiteout and break-out are single ramps ≥ 2 s; mist luminance < 0,8; beacons and lamps switch on steadily; blades behind blur discs, never across the sun in C1/C2; spray mid-tone, no flicker; tracker glints single ramps; the nav lamp and the ghost horizon switch on as single ramps, the ghost below the mist's luminance cap. **`tools/flash-check.mjs --sequence liftoff` counts opposing ≥ 10 % luminance changes per 341 × 256 window (at 1024 × 768) and second, in-page via `readPixels`, and fails above 3** |
| Audio | lift-off ≤ −10 dBFS peak, ≤ 40 voices, all on the D14 „Atmosphäre & Musik“ bus; captions for every line |
| Skip | Hold Space or LMB for 1 s (a ring fills; a tap does nothing); Esc pauses. A skip fades to black (0,4 s), sets the final state (h 570, airborne, rotors at hover, sweep done, sky dressing shown, trackers back in operation) and continues with the banner, dusk and certificate |
| Replay | Title „Abheben ansehen“. The Ausguck console dial offers „Start wiederholen“ (fade to ground, play, end airborne) and **„Zurück ins Dock“** (fade to ground and stop: the same code path without the sequence; D25). The certificate opens only after the first flight |
| State after | Airborne: the rc4 look and feel above the clouds (gusts, Libelle LAGE, pads, Turmsprung, TAG ↔ ABEND); ground pads off; ground zones suspended. Docked again: day look, the ground reachable, sky dressing hidden, the lift-off console armed for „Start wiederholen“ |

### 4.16 R6 top 15: what Phase 7 adopts

| R6 # | Change | Adopted as | WP |
|---|---|---|---|
| 1 | zone requests | §3.2, every area | WP5, WP6, WP8–WP11, WP14 |
| 2 | thruster test + „Startklar n/6“ | ignition beat, crown beacons + Libelle lamps (not the collar); since 2026-10-17 „Startklar“ has three systems: lift, energy, navigation (D23) | WP12 |
| 3 | grounded start + failed Probestart | §1.2, §4.1 | WP3, WP12 (wave 1) |
| 4 | F3 decides how the lift-off flies | §4.14 | WP13 |
| 5 | showroom as reward hub | **Schauhalle Nord** (not the foyer: room for 20 robots, the FANUC and a compare stage), first visit on the route | WP11 |
| 6 | retire 03 C | retired; 03 C Lastdiagramm ◆ (not 03 B) keeps three stamps and a measuring ◆ | WP8 |
| 7 | shorten 06 C | 6 clips, 2×, κ needle; a side station in Entdecker | WP8 |
| 8 | first success first | 02 A on the Moon; 01 A gag miss | WP5, WP8 |
| 9 | 01 C EMI reaches | n = 10 live grasps, one prediction | WP8 |
| 10 | one voice + ≤ 35 words | `ResultUi` strip; text-audit rule | WP1, all zones |
| 11 | Open Duck RL | 02 C „Lauf, Ente!“ with real MuJoCo physics (not replays) | WP5 |
| 12 | SO-101 teleop + language | 04 A/B/C | WP6 |
| 13 | humanoid ladder | Traumhangar (R1 → G1 → H1-2 → H2) on the ground | WP10 |
| 14 | 05 B one wall | adopted, lighter, as a side station | WP8 |
| 15 | grab verb | Kistenwaage, colour card, Lastdiagramm weights, duck push, Herztomate | WP5, WP8, WP9, WP11 |

---

## 5. Tech architecture

### 5.1 New modules and their owners

| Module | Path | Owner |
|---|---|---|
| Robots pipeline and runtime | `tools/robots/**`, `tools/robot-gallery.mjs`, `tools/notices-plugin.mjs`, `src/robots/**` (generated `manifest.ts`, `credits.ts`, `glb/`), `src/core/robots/**` (`RobotLibrary`, `RobotModel`, `ik.ts`), `src/core/credits.ts`, `LICENSES/**` | **WP0** |
| Seams: manifest/code split, context extensions, registration APIs, boot hooks | `src/core/zones/{manifest,ext}.ts`, `src/zones/*/manifest.ts` (created), boot hooks in `src/core/Game.ts` | **WPS** (wave 0), then WP4 |
| Quest spine, systems, pool, resume, values | `src/core/quest/{QuestSpine,types,systems,pool,mastery,resume,values}.ts`, `src/core/zones/types.quest.ts` | WP1 |
| Save v2, migration, retired list, secrets | `src/systems/{Progress,migrate,retired,Secrets}.ts`, `tools/fixtures/saves/**` | WP1 |
| Title, pause, Pass, credits page, one-voice banner, map layers, chips, telemetry, loading card | `src/ui/{StartScreen,PauseMenu,PassPanel,Credits,ResultUi,MapPanel,Kit,Hud,Compass}.ts`, `src/core/Settings.ts` (schema v4: `exteriorCams`) | WP1 |
| Slab, flight environment, fog, ambience filter, loop kinds, sky dressing | `src/core/Environment.ts`, `src/core/env/**`, `src/core/zones/types.env.ts`, `src/systems/Audio.ts`, `src/world/sky.ts` | WP2 |
| Frames, plot kinds and shapes, suspension, altitude fan-out, rescue volumes, operate capture, robots adapter | `src/core/zones/{ZoneManager,createZoneContext,frames}.ts`, `src/core/zones/types.{frames,robots}.ts`, `src/core/zones/ext/**`, `src/core/{Physics,RenderSystem,Operate}.ts`, `src/world/layout.ts` (adds) | WP4 |
| Ground and dock, dock FX, terrain bake | `src/world/ground/**`, `tools/ground/**`, `public/world/ground/**` | WP3 |
| Rotors and start flow, the island body | `src/world/index.ts` (body), `src/world/{onboarding,intro,libelle,landing,underside,lift,masts,transit,foyer,radio,railing,deck,…}.ts`, `src/world/tower/**`, `src/world/landscape/**` (except pods, rovers, drones), `src/world/start/**` | WP12 |
| Startprüfung and lift-off | `src/world/finale/**` incl. `finale/liftoff/**` (lazy finale chunk) | WP13 |
| Region | `src/world/region/**`, `src/ui/map/region.ts` (a MapPanel layer) | WP14 |
| Life and world eggs | `src/world/life/**`, `src/world/eggs/**`, `src/world/landscape/{pods,rovers,drones}.ts` | WP15 |
| Duck physics (MuJoCo worker) | `src/zones/regelgarten/duck/**`, `tools/duck/**`, `tools/mujoco/**` | WP5 |
| Zones | `regelgarten` (WP5), `lern-dojo` (WP6), `sensordom`/`greifwerkstatt`/`dunkelfabrik`/`prueffeld` (WP8), `sonnenacker` (WP9), `traumhangar` (WP10), `schauhalle` (WP11), `kreislaufhof`/`unkrautacker` (WP14), `dorf` (WP16) | per WP |
| Tools | `tools/*` | WPS (wave-0 skeleton), WP7 (wave 1), feature WPs add their own checks (§5.10) |

The complete shared-file owner map is §6.2.

### 5.2 Interfaces between packages (shared signatures)

```ts
// ── src/core/zones/manifest.ts (WPS) — eager, one file per area: src/zones/<id>/manifest.ts ────────────
export type PlotKind = 'lobe' | 'hall' | 'site';
export type PlotFrame = 'island' | 'ground';
export type RouteRole = 'main' | 'side' | 'skip';
// System ids live with the manifests, so the wave-0 stubs can name them; src/core/quest/types.ts (WP1) re-exports them (D23)
export type RotorId = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6';   // AUFTRIEB: the six main rotors
export type CoreId = 'AKKU' | 'NAV';                              // ENERGIE: Startakku · NAVIGATION: Flugmodell
export type TrimId = 'T1' | 'T2' | 'T3' | 'T4';                   // cosmetic trims, never gate
export type SystemId = RotorId | CoreId | TrimId;
export interface StationManifest {
  id: string;                        // stamp id '<areaId>.<id>'
  star?: boolean;                    // the area's ◆ (it starts the area's system: a rotor, AKKU, NAV or a trim)
  rev?: number;                      // goals changed: a stored record with another rev resets (boot migration, §3.5)
  mastery?: boolean;                 // counts for the H2 pool (default true)
  route?: { entdecker?: RouteRole; entscheider?: RouteRole };   // objective route (defaults: main / main for ◆, skip otherwise)
}
export interface AreaManifest {
  id: string; kind: PlotKind; frame: PlotFrame;
  title: Text; number?: number; verb?: Text; eyebrow?: Text; glyph?: string;
  stations: readonly StationManifest[];
  questions?: readonly number[]; album?: string;
  system?: SystemId; systemLabel?: Text;     // what this area's ◆ starts: M1–M6 (lobes), 'AKKU' (sonnenacker), 'NAV' (traumhangar),
                                             // a trim (kreislaufhof T1, unkrautacker T4); checklist line
  trim?: TrimId;                             // a cosmetic trim started by the same ◆ (sonnenacker 'T3', traumhangar 'T2')
  takeaway?: Text;                           // certificate back side (§2.8)
}
export function defineManifest(m: AreaManifest): AreaManifest;
// index.ts: import manifest from './manifest'; export default defineZone({ ...manifest, init(ctx) { … } })
// ZoneManager: manifests by import.meta.glob('/src/zones/*/manifest.ts', { eager: true }); code by the lazy glob through a
// priority queue: the resume/deep-link area first (before the title), then island areas nearest first after the title,
// then ground areas once ZoneManager.setReachable(pred) allows them (WP4 wires it to ctx.quest: regionOpen).
// A manifest-only area (no index.ts yet) reserves its plot and counts for the pool; it registers no stamps.

// ── src/core/zones/ext.ts and the registration seams (WPS) ─────────────────────────────────────────────────
export interface ZoneContextExtensions {}            // augmented per package: types.quest.ts, types.frames.ts, types.robots.ts, types.env.ts
// interface ZoneContext extends ZoneContextExtensions { … rc4 fields … }   (types.ts, edited once by WPS)
export function registerContextExtension<K extends keyof ZoneContextExtensions>(name: K, make: (area: AreaHandle) => ZoneContextExtensions[K]): void;
// src/ui/Kit.ts:            registerChip(id: string, label: Text): ChipType              (HERSTELLERANGABE, MODELL, SIM · AUFZEICHNUNG, TRAUM: WP1)
// src/systems/Audio.ts:     registerLoopKind(id: string, make: LoopFactory): LoopKind     (spin-up, bees, farm bed, rail: their WPs)
// src/core/RenderSystem.ts: registerBootWarmup(name: string, make: () => THREE.Object3D): void   (eager code only; compiled in the boot warm-up)
// src/core/DebugApi.ts:     __academy.ext(name, fn) · __academy.loadAll(): Promise<void> · __academy.settledAll · __academy.unattended()
// src/core/Game.ts boot hooks: migrate (src/systems/migrate.ts) → Progress; resumePlan + titleState (src/core/quest/resume.ts)
// Readiness: 'game:ready' / __academy.ready = title up and the eager set settled; 'game:settled-all' after __academy.loadAll()

// ── Progress and GameLayer scopes (WP1) ────────────────────────────────────────────────────────────────────
export type StampScope = 'island' | 'all';             // 'island' = areas of kind 'lobe'; the default everywhere
interface Progress  { earnedStamps(o?: { scope?: StampScope }): number; stamps(o?: { scope?: StampScope }): StampRecord[] }
interface GameLayer { summary(o?: { scope?: StampScope }): Summary; stars(o?: { scope?: StampScope }): { stars: number; max: number } }
interface ZoneGame {
  progress(o?: { scope?: StampScope }): Summary;
  unattended(on: boolean, label?: string): void;       // marks an input-free stretch for watch-audit (no behaviour)
  readonly secrets: ZoneSecrets;
}
// tower, Pass cover mark, title „n von 18“, Recamán notes and finale:ended use 'island'; the H2 pool and stars-gated
// deliveries use pool() (src/core/quest/pool.ts, manifests + F1)

// ── src/core/quest/types.ts (WP1); types.quest.ts adds ctx.quest ──────────────────────────────────────────
export type { RotorId, CoreId, TrimId, SystemId } from '@/core/zones/manifest';   // defined there by WPS (wave 0)
export type StartSystem = 'lift' | 'energy' | 'nav';              // the three systems of the Probestart and the lift-off gate
export type ReadyState = 'kalt' | 'arbeit' | 'bereit' | 'geprueft';   // rotors, AKKU and NAV
export type RotorState = ReadyState;                              // name kept for the rotor consumers
export type SystemState = ReadyState | 'aus' | 'an';               // trims: aus | an
export type CrewReason = 'asset' | 'timing' | 'route';            // 'route': the Entscheider supply of AKKU and NAV (derived, never stored)
export type BeatId = SystemId | '6of6' | 'startklar';             // markBeat ids (each beat plays once)
export type FlightStateName = 'ground' | 'airborne';
export interface FlightState { state: FlightStateName; firstFlightAt: number | null; liftoffSeen: boolean }
export interface SystemDef {                                      // table in systems.ts (§3.1)
  id: SystemId; areaId: string; station: string;                  // the ◆ that brings it to bereit
  group: StartSystem | 'trim';                                    // lift: M1–M6 · energy: AKKU · nav: NAV · trim: T1–T4 (never gates)
  crewIn?: readonly Mode[];                                       // modes in which the Bodencrew supplies it after the Probestart (AKKU, NAV: ['entscheider'])
}
export interface CoreStatus { state: ReadyState; by: 'player' | 'crew' | null }   // by: who made it bereit (null below bereit)
export interface StartSystems {                                   // D23: what the Libelle panel, the console and the gate read
  lift: number;                                                   // rotors bereit 0…6, ground crew included (Revier at 1, KIEL at 4)
  energy: CoreStatus & { charge: number };                        // the Startakku bar 0…1: ⅓ per earned Sonnenacker stamp, 1 at bereit
  nav: CoreStatus;                                                // the nav lamp and the needle light
  startklar: boolean;                                             // lift === 6 and energy and nav at least bereit
}
export interface MasteryStatus {
  ladder: { r1: Stars; g1: Stars; h12: Stars };   // best stars of traumhangar A, B, C
  stars: number; pool: number; need: number;       // need = Math.ceil(0.75 * pool); MUST build 84 → 63
  open: boolean; h2Earned: boolean; h2Unveiled: boolean;
}
export interface QuestSnapshot {
  systems: Record<SystemId, SystemState>;
  start: StartSystems;                  // the three systems (D23); replaces the second pass's readyRequired
  groundCrew: { id: RotorId | CoreId; reason: CrewReason }[];   // stored asset/timing entries + the derived 'route' entries
  kielOpen: boolean; regionOpen: boolean; f3Signed: boolean;
  armed: boolean;                       // start.startklar && f3Signed
  probestart: boolean; glideSeen: boolean;
  flight: FlightState; mastery: MasteryStatus;
}
export type QuestEvent =
  | { kind: 'system'; id: SystemId; from: SystemState; to: SystemState }   // also AKKU and NAV
  | { kind: 'charge'; charge: number }                                      // the Startakku bar moved (a Sonnenacker stamp)
  | { kind: 'kiel-open' } | { kind: 'region-open' } | { kind: 'startklar' } | { kind: 'armed' }
  | { kind: 'flight'; state: FlightStateName } | { kind: 'mastery-open' } | { kind: 'h2-earned' };
export interface QuestApi {                       // ctx.quest
  snapshot(): QuestSnapshot;
  system(id: SystemId): SystemState;
  onChange(cb: (s: QuestSnapshot, e: QuestEvent) => void): () => void;
  resumeArea(): string | null;                    // the area the next Start resumes at (WP14: load the region first)
  markProbestart(): void; markGlideSeen(): void;  // WP12
  markBeat(id: BeatId): boolean;                  // WP12 only: true only the first time. WP9 and WP10 play their local part of the
                                                  // AKKU / NAV beat (dashboard lock, dream tiles) when their ◆ stamp is first earned
  groundCrew(id: RotorId | CoreId, reason: 'asset' | 'timing'): void;   // WP1's failure card (§5.8); the Entscheider timing fallback
  setFlight(state: FlightStateName, o?: { liftoffSeen?: boolean }): void;   // WP13 only
  unveilH2(): void;                               // WP11 (the Tresor cover, once)
}
// EventBus mirrors: 'quest:system' | 'quest:charge' | 'quest:kiel-open' | 'quest:region-open' | 'quest:startklar' | 'quest:armed'
//   | 'quest:mastery-open' | 'quest:h2'
//   | 'flight:state' { state } | 'flight:phase' { name, t, h, r? } (WP13) | 'objective:changed' { areaId } (WP12)
//   | 'life:react' { kind, at? } (anyone) | '<area>:<event>' (area events, e.g. 'sonnenacker:shift')
// src/core/quest/values.ts (WP1): passSnapshot(), zoneValue() — moved out of the lazy finale chunk [C1 M11]

// ── src/core/zones/types.frames.ts + src/world/layout.ts (WP4) ─────────────────────────────────────────────
export type PlotShape = { kind: 'circle'; r: number } | { kind: 'rect'; w: number; d: number };
export interface PlotDef {
  /* rc4 fields; radius = the circumscribed radius for rect plots (HUD, compass, default spawn) */
  kind?: PlotKind; frame?: PlotFrame; shape?: PlotShape;
  tiers?: { detail: number; exterior: number };   // measured from the shape's edge, not the anchor
  interior?: boolean;                              // while the player is inside, other areas cap at their exterior tier
}
// layout.ts (frozen after p7-w1): ZONE_PLOTS (rc4), HALL_PLOTS, SITE_PLOTS, PLOTS, ROUTES (per mode, §1.3/§1.4),
//   TROCKENDOCK, REVIER, GROUND_PADS, KANZEL_PADS, RAIL (SHOULD); fallback plots beyond 900 m
interface ZonesApi { list(o?: { kind?: PlotKind | 'all' }): ZoneManifest[] }     // default 'lobe': rc4 island consumers unchanged
interface ZoneDefinition { onSuspend?(ctx: ZoneContext): void; onResume?(ctx: ZoneContext): void }
export interface FramesApi {                       // ctx.frames
  register(name: 'ground', root: THREE.Group, o: { heightAt(x: number, z: number): number }): void;   // island module only (WP3)
  heightAt(x: number, z: number): number;          // terrain at h = 0, for ground-frame areas
  readonly ground: THREE.Group | null;
}
export interface FlightRead { readonly state: FlightStateName; readonly altitude: number; readonly docked: boolean; onChange(cb: (s: FlightStateName, h: number) => void): () => void }   // ctx.flight
interface ZoneIsland { setAltitude(h: number): void }   // island module only (WP12 Probestart, WP13 F1 and lift-off): the ONE setter (§5.3)
interface ZonePhysics { addRescueVolume(o: { center: Vec3Input; size: Vec3Input; player?: 'rescue'; dynamics?: 'reset' }): StaticHandle }
interface OperateOptions { capture?: { keys: readonly string[]; pointerLock?: boolean; onLook?(dx: number, dy: number): void } }   // piloting

// ── src/world/ground/index.ts (WP3) ───────────────────────────────────────────────────────────────────────
export interface DockSpray {
  emit(kind: 'plume' | 'burst' | 'ring' | 'wisp', at: Vec3Tuple, strength: number): void;   // one instanced draw, ≤ 192 (96 low)
  setPlume(lobe: 0 | 1 | 2 | 3 | 4 | 5, on: boolean): void;
}
export interface GroundHandle {
  readonly root: THREE.Group;                       // dock, Werft, terrain, shore, lake, far ring; ground-frame areas parent here (WP4)
  heightAt(x: number, z: number): number;
  setBridge(t: number): void;                       // 0 extended … 1 retracted
  setArms(t: number): void;                         // 0 holding … 1 stowed
  setGate(open: boolean): void;                     // Revier gate at the bridge head
  setSign(rotorsReady: number): void;               // „TROCKENDOCK 3 · ROTOREN m/6“
  catchGust(strength: number): void;                // arms twitch, hydraulic sigh (docked gusts, §5.3 rule 4)
  readonly spray: DockSpray;
  outsideCamera(shot: 'C1' | 'C2', h: number, t: number): { position: Vec3Tuple; lookAt: Vec3Tuple };   // island frame
}
export function buildGround(ctx: ZoneContext, step: () => Promise<void>): Promise<GroundHandle>;
// altitude is NOT on GroundHandle: only ctx.island.setAltitude moves the ground root

// ── ctx.env / ctx.audio additions (WP2; types.env.ts) ─────────────────────────────────────────────────────
export interface SlabParams { base: number; top: number; edgeBearingDeg: number; edgeDist: number; density: number; light: string; shade: string }
export interface FlightEnvParams { altitude: number; slab: SlabParams | null; fog: 'ground' | 'air'; cloudSea: boolean }
interface ZoneEnv {
  setFlight(p: Partial<FlightEnvParams>): void;     // altitude is passed only by the WP4 fan-out
  sunBlocked(eyeWorld: THREE.Vector3): number;      // 0 visible … 1 behind the slab (±2° soft edge); drives sun and hemi
  holdEnvMap(hold: boolean): void;                  // freeze PMREM during the lift-off
  rebuildEnvMap(): void;                            // the one rebuild inside the whiteout
}
interface ZoneAudio { setAmbienceFilter(hz: number | null, rampS?: number): void }   // cloud muffle
// src/world/sky.ts (WP2, island module): setGrounded(on), reveal(t01) (driven by WP13), copterGeometry()

// ── ctx.robots (WP4 adapter src/core/zones/ext/robots.ts over WP0's runtime; types.robots.ts) ────────────
export type { RobotId, RobotLod, RobotLoadOptions, RobotIkOptions, RobotIkResult, RobotJoint, RobotModel } from '@/core/robots';   // type-only
export type { RobotManifestEntry } from '@/robots/manifest';                                                                       // type-only
// WP0 as built (frozen at p7-w0): RobotModel { object; joints; setJoint(name, v): number; getJoint(name); setPose(values); getPose();
//   resetPose(); setJointNormalized(name, t); hasLink(link); getLinkWorldMatrix(link, out?); getLinkWorldPosition(link, out?);
//   attach(link, obj): boolean; solveIK(chain | { joints, tip }, target, RobotIkOptions): RobotIkResult; updateLod(camera, viewportPx);
//   dispose() } · RobotLod = 'auto' | 0 | 1 | 'silhouette' (+ 2 after WP0 R2) · RobotLibrary { load, loadSilhouette, prewarm(id),
//   release(id), info(id), all, paint, loaded() }
export interface RobotBody { link: string; geometry: THREE.BufferGeometry }      // WP0 R2: one body in its link frame, unskinned
export interface RobotClip { duration: number; loop?: boolean; tracks: Readonly<Record<string, ReadonlyArray<readonly [t: number, value: number]>>> }
export type RobotFetchState = 'idle' | 'queued' | 'loading' | 'ready' | 'failed';
export interface ZoneRobots {                        // ctx.robots
  load(id: RobotId, o?: RobotLoadOptions & { priority?: 'now' | 'route' | 'idle' }): Promise<RobotModel>;   // queued; LOD tracked per frame while the area is active; released on dispose/suspend
  loadSilhouette(id: RobotId): Promise<THREE.Mesh>;
  bodies(id: RobotId, lod: 0 | 1 | 2): Promise<readonly RobotBody[]>;   // crowds: one InstancedMesh per body, FK from one template RobotModel
  prefetch(ids: readonly RobotId[], o?: { priority?: 'route' | 'idle' }): void;   // fetch + parse + RobotLibrary.prewarm, ≤ 1 per idle slot
  info(id: RobotId): Promise<RobotManifestEntry>;
  state(id: RobotId): RobotFetchState;
  progress(id: RobotId): { loaded: number; total: number } | null;   // bytes for the loading card
  animate(model: RobotModel, clip: RobotClip, o?: { speed?: number; loop?: boolean }): { stop(): void };   // Vorführung, waving
  untrack(model: RobotModel): void;                 // the area drives updateLod itself (Schauhalle governor)
}
// Queue (§5.6): reachability first (no 'site' area before regionOpen; the resume area always), then the objective area,
// then distance ≤ 60 m from the plot edge; ≤ 2 fetches at once; prefetch paused during cinematic(), F1 and the lift-off.

// ── src/world/life/director.ts (WP15; island module only — zones use events) ────────────────────────────────
export type AreaId = string;                                // area id or 'deck' | 'werft' | 'revier'
export type LifeTier = 'near' | 'mid' | 'far' | 'hidden';
export type HofPhase = 'ernte' | 'abtransport' | 'wartung' | 'bewaesserung';
export interface LifeClock { readonly t: number; readonly loop: number; readonly phase: HofPhase; readonly phaseT: number }
export interface LifeAgentDef {
  id: string; area: AreaId; job: Text;
  kind: 'arm' | 'rover' | 'person' | 'animal' | 'vehicle' | 'drone' | 'machine';
  near?(dt: number, clock: LifeClock): void;                // 60 Hz within 40 m
  mid?(dt: number, clock: LifeClock): void;                 // 15 Hz round robin
  far?: { proxy: 'figure' | 'vehicle' | 'animal'; at(out: THREE.Vector3): THREE.Vector3 };   // one instanced draw for all
}
export interface LifeDirector {
  readonly clock: LifeClock;
  register(def: LifeAgentDef): { remove(): void };
  react(kind: 'greet' | 'rotor' | 'liftoff' | 'flush' | 'wave' | 'gather', at?: Vec3Tuple): void;
  onPhase(cb: (phase: HofPhase) => void): () => void;
  tierOf(area: AreaId): LifeTier;
  stats(): { agents: number; near: number; draws: number; ms: number };   // __academy.ext('life')
}

// ── ctx.game.secrets (WP1) ────────────────────────────────────────────────────────────────────────────────
export interface SecretDef {
  id: string; area: AreaId; level: 0 | 1 | 2 | 3;
  title: Text; hint: Text; card: () => InfoCardSpec; radio?: Text;
  reward: { kind: 'vitrine'; object: string } | { kind: 'album'; albumId: string };
}
export interface ZoneSecrets {
  register(def: SecretDef): void;
  registerObject(objectId: string, make: () => THREE.Object3D): void;   // WP15 at island init (≤ 300 triangles each)
  object(objectId: string): THREE.Object3D | null;                      // WP11 places it in the Fundvitrine
  find(id: string, at?: Vec3Input): boolean;                            // idempotent; emits 'secret:found' { id, n, total }
  has(id: string): boolean; found(): string[]; total(): number;
  nearestHint(fromWorld: Vec3Input, maxLevel?: 0 | 1 | 2): { id: string; bearing: number; distance: number } | null;
}

// ── src/ui/Credits.ts (WP1; data from WP0's src/core/credits.ts and src/robots/credits.ts, imported lazily) ──
export function openCredits(o?: { focus?: string }): Promise<void>;   // title, pause menu, Schauhalle entrance, egg 15

// ── MuJoCo (WP5; zone-local, no engine service) — see §5.4 ───────────────────────────────────────────────
```

### 5.3 „The world moves, the island doesn't“ [C1 M6, C2 B1]

1. **The island stays put.** No island mesh, island collider, island-frame zone root or merged static ever changes its transform (rc4 GDD §5.9, extended).
2. **One setter.** `ctx.island.setAltitude(h)` (WP4) is the only writer. It moves:
   - the ground root (y = −h);
   - every ground-frame area root (children of the ground root; detached from the scene graph while suspended, re-attached at h = 0, so only the terrain and the far ring move during a climb);
   - the slab (base and top − h) and `cloudY` (top − h → −180 airborne);
   - `sunBlocked()` and the fog mode (via `ctx.env.setFlight`);
   - the ground colliders, the dynamics freeze and the suspension (rule 3);
   - `markShadowsDirty()`.

   Nobody else writes any of these.
2b. **Sky frame.** The sky dressing (sister platforms, Prüfinseln, wisps) is hidden while grounded and while the eye is below the slab top. During the lift-off it sits at its rc4 position offset by (570 − h) and fades in over ≥ 2 s after the break-out (t ≥ 67 s). Airborne it has the rc4 positions. Cargo copters: grounded they cross the Revier under the cloud bank; airborne they keep the rc4 transits. `tools/ending-check.mjs` asserts 0 visible sky-dressing meshes in the title and every grounded survey view; `tools/liftoff-check.mjs` asserts their first visible frame comes after the break-out.
3. **Colliders and dynamics.** Ground colliders (terrain tiles, dock wall, bridge, apron, ground pads, ground areas' statics) are on only when h ≤ 0.05 m and the ground root is untilted. Whenever h > 0.05 m or the ground root is tilted, ground-frame dynamic bodies are **frozen**: kinematic, pose kept, physics sync paused, so their meshes ride along with the ground root and resume exactly where they were. Ground areas are **suspended** above h = 1 m: no `update`, `onSuspend`, interactables and panels off, detail and exterior hidden, far tier shown up to h = 1,500 m. They resume only at h = 0 (dock switch, replay start, F1 set-down). No collider ever moves.
4. **Tilt.** While docked, random gusts never tilt anything: the arms catch them (`ground.catchGust`), the Libelle reads BODEN, and you hear the sigh. Only the Probestart and F1 tilt, and in both the player is aboard by construction (the lever, the Kielraum). Their inverse tilt rotates the environment group and the ground root together; island and physics never move (rc4). Airborne: rc4.
5. **Outside shots.** They express their camera in the ground or slab-top frame and convert it to the island frame; the island stays put.
6. **Shadows.** The sun shadow map follows the player (island frame). The island's shadow on the ground, the cloud-bank shade and the far PV stripes are analytic in the ground and bed materials.
7. **F1.** The 10 m hover moves the ground down by 10 m; the player is in the Kielraum (island frame); ground colliders are off and ground dynamics frozen from h > 0.05 m until set-down.
8. **Rescue.** Rescue volumes over the dock floor and keel block and at the lake surface (player rescue, dynamics reset); `ISLAND.killY` stays the backstop below them.

### 5.4 MuJoCo in the duck station (D30) [C1 B4]

- **Package.** `@mujoco/mujoco` 3.16.0 (Google DeepMind, Apache-2.0); the wasm is stripped of custom and debug sections at build time by `tools/mujoco/strip.mjs`: 1.03 MB brotli + 0.06 MB JS, single-threaded (no cross-origin isolation), self-hosted, hashed, with `.br`/`.gz` copies like Rapier. One row in `src/core/credits.ts` `SOFTWARE_CREDITS` (the notices plugin fails the build without it).
- **Owner and bundling.** The duck is the only MUST consumer, so the worker belongs to the station (`src/zones/regelgarten/duck/`), not to an engine service:
  - `import DuckWorker from './duck.worker.ts?worker'` — Vite bundles a worker only from a literal `?worker` import or `new Worker(new URL(…, import.meta.url))`;
  - `vite.config.ts` block „worker (WP5)“: `worker: { format: 'es', rolldownOptions: { output: { inlineDynamicImports: true } } }`, so the worker bundle is self-contained: no shared chunks, no import-map specifiers (the page's `build.chunkImportMap` does not reach workers);
  - the hashed wasm URL comes from a `?url` import and goes to the Emscripten glue's `locateFile` in the init message, so the glue never builds a URL of its own.
- **Support probe.** `supported()` constructs a tiny module worker that compiles an 8-byte wasm (plus a SIMD probe if the build uses SIMD). Browsers without module workers (Firefox 108–113) and any failed probe get the recordings with the chip `SIM · AUFZEICHNUNG` and the reason („Dein Browser kann die Physik hier nicht live rechnen.“).
- **Loading.** On entering the Regelgarten plot, or when the objective points at 02 C; the worker is prewarmed (wasm compiled, the model loaded) while the player walks to station C.
- **Lifetime.** Paused on `game:pause` and behind frozen panels; terminated 60 s after the player leaves the Regelgarten (≥ 60 m) [C1 m3, m8].
- **Fallback.** Without a worker or WebAssembly, or when a generation still takes > 3.5 s after adapting the population: pre-recorded generations, made by the same worker code run in Node (`tools/duck/record.mjs`; ≤ 1.5 MB, loaded only then).
- **Other robots.** The SO-101 keeps Rapier (R1: MuJoCo is not needed for the lesson); the Unitree robots use kinematic animation (R3). R1's „18 MB“ figure referred to an older community package; the official package is the one measured in R2 §7.2. A shared `ctx.workers` helper is added only when a second consumer appears.

### 5.5 Performance budgets per key view (production build, Apple M5 Pro, ANGLE Metal, quality high unless noted)

Every view has a **per-owner ledger** [C1 M2]. `tools/drawcalls.mjs --ledger` checks it with owner tags from p7-w1 on, not first in wave 3. The allocations below are maxima. Owners: world (island module incl. tower, deck, sky), ground (WP3), region (WP14), life (WP15), robots (meshes created through `ctx.robots`), and each area.

| View | Main-pass draws (ledger) | Triangles | GPU ms 3840×2160, vsync off | JS ms/frame at 4× CPU |
|---|---|---|---|---|
| Bridge head spawn (0, 0, 114), grounded | world ≤ 110 · ground ≤ 30 · region ≤ 40 · life ≤ 6 · areas ≤ 52 (05/06 exteriors, EMI) → **≤ 240** | ≤ 1.0 M | ≤ 4.5 (A/B rule below) | ≤ 8.4 |
| Plaza, grounded | world ≤ 95 · areas ≤ 57 (rc4) · Schauhalle exterior ≤ 12 · ground ≤ 10 · region ≤ 20 · life ≤ 4 · robots ≤ 2 → **≤ 200** (Phase 6 target kept) | ≤ 1.0 M | **≤ 4.5** (rc4 4.43; A/B rule) | ≤ 7.8 |
| Plaza, airborne | rc4 148 + hall exterior ≤ 12 + robots ≤ 2 → ≤ 165 | ≤ 1.0 M | ≤ 4.5 | ≤ 7.8 |
| Cloud view, airborne (rc4) | rc4 | rc4 | ≤ 7.0 | — |
| Ausguck grounded (Revier far) | ≤ 300 (region ≤ 30) | ≤ 1.2 M | ≤ 6.0 | ≤ 8.4 |
| Kanzel 240 (farm view) | ≤ 300 | ≤ 1.2 M | ≤ 6.0 | ≤ 8.4 |
| Schauhalle interior | hall ≤ 80 · world ≤ 90 · other areas ≤ 10 (exterior caps while inside) → ≤ 180 | ≤ 0.9 M (hall ≤ 300 k) | ≤ 5.0 | ≤ 8.4 |
| Regelgarten C duck field, training | zone ≤ 80 (incl. field ≈ 17) · world ≤ 100 · others ≤ 40 → ≤ 220 | ≤ 0.9 M | ≤ 4.5 | ≤ 8.4 main; worker ≤ 3.5 s per generation |
| Lern-Dojo B | zone ≤ 80 → ≤ 220 | ≤ 0.8 M | ≤ 4.5 | ≤ 8.4 |
| Sonnenacker C, automated day | site ≤ 70 · region ≤ 70 · island seen from the ground ≤ 80 · ground ≤ 20 · life ≤ 20 → ≤ 260 | ≤ 1.1 M | ≤ 6.0 | ≤ 9.5 |
| Traumhangar, Space held (5 ghosts) | hangar ≤ 80 · others ≤ 40 (interior) → ≤ 120 | ≤ 0.8 M | ≤ 5.0 | ≤ 9.0 |
| Lift-off, any beat | ≤ 320 (C1 ≈ 300) | ≤ 1.2 M | ≤ 7.0 | ≤ 8.4 (director ≤ 0.3 ms at 1×; the climb's altitude fan-out ≤ 0.3 ms) |
| Kielraum F1 hover | rc4 ≤ 296 | rc4 | rc4 | rc4 |
| **GDD gate, every survey view** | **≤ 500** (Phase 7 worst target ≤ 320) | **≤ 1.5 M** (target ≤ 1.2 M) | — | 60 fps on high and on low |

**The GPU gate as an A/B [C1 M1].** The plaza margin is 0.07 ms and rc4's own first run measured 6.71 ms, so a fixed threshold decides nothing. The gate is an interleaved A/B against rc4, median of 5 runs (`tools/gpu-ab.mjs --runs 5 --dist rc4=… --dist head=…`). It passes at ≤ 4.5 ms, or at ≤ rc4 + 0.15 ms **with the founder told**. WP2 and WP3 build a joint GPU-proof scene by day 5 of wave 1, with final-cost stand-ins for the terrain, the far ring, the dock and the region impostors, measured at the plaza, the bridge head and the Ausguck.

**Programs [C1 M5].** rc4 links 6 programs during play, and one skinned program is really several variants. The gate is therefore:
- **0 program links on a frame that first shows an object**, and **0 frames over 33 ms caused by a link**;
- background `compileAsync` in idle slots is allowed and counted separately (`hitches`);
- ≤ 150 programs at the title, re-based on the itemised program table (`tools/warmup.mjs --table`, kept by the integrator);
- the robot and crowd variants are compiled in the boot warm-up with dummies: skinned, skinned shadow depth, instanced per-body, transparent teal ghost, silhouette (`registerBootWarmup`, WP4);
- materials of lazy chunks compile with `compileAsync` when their chunk loads, before their objects are shown;
- one `hitches` lap runs in WebKit, because Safari has no `KHR_parallel_shader_compile`.

**Kept from rc4:**
- 0 frames over 33 ms on a first lap, except zone teleports and the two lift-off cuts (`hitches`);
- ≤ 4 MB texture upload per frame;
- 0 renders while paused or behind the Pass (`idle-render`);
- no frame > 33 ms during the lift-off, and ≤ 1 env-map rebuild in it;
- no task > 250 ms before the title; title ≤ 4.5 s at 4× CPU on cable (RELEASE §1a).

### 5.6 Download caps and the loading plan [C1 B1, M3, M4, M13]

**First load stays ≤ 1.75 MB because area code leaves it.** rc4 imports every zone module before the title (`Game.ts` `zones.importAll()`); the six zone chunks are 39–48 KB brotli each (259 KB). WPS splits every area into an eager `manifest.ts` and lazy code. Expected first load after the split: ≈ 1.45 MB + quest spine, migration, ground code and the heights core (≤ 80 KB) ≈ 1.53 MB. `tools/load-size.mjs` gates it on every merge.

**Measured robot files** (WP0 `tools/robots/REPORT.md`, 2026-10-17, brotli, KB):

| Group | Files | Sum |
|---|---|---|
| Playable (7) | so101 136 · so101-leader 132 · open-duck-mini-v2 196 · unitree-r1 240 · unitree-g1 247 · unitree-h1-2 303 · unitree-h2 235 | 1.49 MB |
| Exhibits (14) | go2 175 · anymal-d 95 · fanuc 126 · ur5e 163 · fr3 152 · talos 298 · tiago 199 · stretch-3 241 · **apollo 407** · shadow-hand 82 · spot 278 · mir250 139 · iiwa-14 107 · 2f85 63 | 2.53 MB |
| **MUST set today** | 21 files | **4.01 MB** (over the cap once the line-up and LeKiwi join) |

| Item | Cap (brotli) | Plan |
|---|---|---|
| First load (title) | **≤ 1.75 MB**, 0 third-party requests | ≈ 1.53 MB after the split |
| One robot file (LOD0 + LOD1 + LOD2 in one file) | **≤ 350 KB**; one documented exception ≤ 420 KB (Apollo, only if a visual check shows holes at 350) | WP0 R4 |
| Exhibits | LOD0 ≤ 25 k triangles (humanoid exhibits ≤ 30 k), ≤ 150 KB each (humanoid exhibits ≤ 250 KB); **LOD0 is the inspection model**, no third tier | target ≤ 2.1 MB for the 14 |
| Robots loaded on approach to one area | **≤ 1.2 MB** | Traumhangar R1 + G1 + H1-2 + H2 ≈ 1.03 MB; Schauhalle: line-up ≤ 0.2 MB, then plinth robots stream in (≤ 2 fetches at once) |
| All robots of the MUST build | **≤ 4.0 MB**, enforced by `tools/robots/check.mjs` | playables 1.49 + exhibits ≤ 2.1 + LeKiwi base ≤ 0.12 + line-up ≤ 0.2 ≈ 3.9 MB. If it binds: drop the KUKA iiwa 14 first (amber, a second cobot next to UR5e and FR3) |
| Per-robot silhouettes (`.l2.glb`) | loaded only where a far tier uses them (Traumhangar docks, lift-off guests) | ≤ 30 KB each |
| MuJoCo | ≤ 1.1 MB | 1.09 MB |
| Terrain heights | core ≤ 20 KB before the title; ring ≤ 100 KB after it | baked Uint16 (WP3) |
| New code chunks | each new area ≤ 80 KB, region ≤ 120 KB, life ≤ 40 KB, lift-off ≤ 60 KB in the finale chunk | `load-size --chunks` |
| Total transfer over a full playthrough | ≤ 8 MB (GDD) | ≈ 7.8 MB estimated (first load 1.53 + area code ≈ 0.75 + region, life, finale ≈ 0.26 + loaders 0.03 + MuJoCo 1.09 + heights 0.1 + robots ≤ 4.0); re-based in wave 1 by a scripted full lap (`tools/load-matrix.mjs --lap`) |

**What loads when** (reachability first, then the objective, then distance):

| Area | Loads | When |
|---|---|---|
| Manifests of every area | main chunk (eager, ≈ 6 KB) | before the title |
| Ground module (dock, apron, the 300 m heights core, lake, slab) | world chunk | before the title (yielding builders); cranes and props after the title |
| Region (sites' exteriors, paths, pads, far ring, map layer) | region chunk | after the title in idle; **before the title if the resume area is on the ground**; a site's detail when the player is ≤ 250 m from it |
| Island zones and the Schauhalle | area chunks | after the title, nearest first (rc4 rule), the resume area before the title |
| Ground areas (Sonnenacker, Traumhangar, Kreislaufhof, Unkrautacker) | area chunks | **only once the Revier is open** (≥ 1 rotor), nearest first, or by `?area=` |
| Robot GLBs | `ctx.robots` queue | reachable areas only; the objective area first; else ≤ 60 m from the plot edge; ≤ 2 at once; prewarm ≤ 1 per idle slot, never during `cinematic()`, F1 or the lift-off. The H2 GLB loads with the hangar (its ghost needs the geometry) |
| MuJoCo + duck worker | lazy | on entering the Regelgarten plot, or when the objective is 02 C |
| Finale (incl. lift-off director) | finale chunk (rc4 W6) | idle after `game:ready`, at once when KIEL opens |
| Life | life chunk | after the title, idle |
| Fallback duck recordings | on failure only | — |

### 5.7 Environment, sky and fog: what changes

| Item | Grounded | Airborne |
|---|---|---|
| Sun | 295°, 16° (rc4), intensity × (1 − `sunBlocked`) | rc4 |
| Sky | rc4 `atmos()` plus the **slab ceiling, computed only in the sky shader**: upward rays hitting the slab base shade a 2–3-octave noise ceiling, lit warm toward the sun near the edge; rays beyond the edge show the normal sky and sun disc (0 extra draws). On day 1, WP2 measures the sky drawn **after** the opaques (depth test on, at the far plane) against rc4's first-drawn sky and adopts it if it saves GPU time [C1 M1] | rc4 |
| Fog | FogExp2 density **0.0007** (300 m → 4 %, 1 km → 39 %). No per-material slab term. Inside the cloud (eye within [base, top]) the uniform density and colour ramp up, then down at the break-out | rc4 0.0015 |
| Cloud sea | off (its raymarch cost goes to the slab and terrain) | rc4, `cloudY` −180; shown during the lift-off once its plane is ≥ 30 m below the eye |
| Sky dressing | hidden (§5.3 rule 2b) | rc4 |
| Env map | rebuilt once at boot for the grounded look; held during the lift-off with one rebuild in the whiteout; dusk keeps its 0.66 s throttle | rc4 |
| Dusk | not on the ground (dock mode is day) | rc4 dusk, TAG ↔ ABEND switch |
| Gust tilt | none while docked (§5.3 rule 4) | environment |
| Audio | ambience low-pass filter API (cloud muffle 600 Hz) | — |

### 5.8 Loading states, failures and degraded modes [C1 M14]

A failed download must never make the goal unreachable.

| Case | What the player gets |
|---|---|
| Area code or a robot is not ready | the loading card (WP1 `Kit`): name, „{x} von {y} MB“, progress. Walking is never blocked; at a station the console waits behind the card; in the Schauhalle the crate is the placeholder |
| A fetch fails | 3 automatic retries with backoff (1, 3, 9 s): `importRetry` for code, the `ctx.robots` queue for GLBs. Then the card shows „Erneut laden“ |
| A ◆ station still cannot load after „Erneut laden“ twice | the card offers **„Bodencrew übernimmt“** → `quest.groundCrew(id, 'asset')` for its system: a rotor, or the Startakku (Sonnenacker) or the Flugmodell (Traumhangar) (D23). The system goes bereit; the checklist and the certificate read „M4 · Bodencrew · ohne Kennlinie“ (or „Startakku · …“, „Flugmodell · …“); no stamp and no stars; EMI-01 once: „M4 hat die Bodencrew freigegeben. Ohne Kennlinie. Glaubst du ihr – oder misst du später?“ The station stays playable later, and earning its ◆ replaces the crew line |
| The MuJoCo worker fails or is unsupported | recorded generations with the chip `SIM · AUFZEICHNUNG` and the reason (§5.4); the station's stars stay earnable |
| The region chunk fails | the gate stays open; the sites show the loading card at their pads with „Erneut laden“. No rotor depends on them, but in Entdecker mode the Startakku and the Flugmodell do: after two failed „Erneut laden“ the card at the G240 or G120 pad offers „Bodencrew übernimmt“ for that system (as above) |
| Entscheider timing fallback | if the managers' session shows a median > 30 min, two rotors start with `groundCrew(…, 'timing')` (R5 §4.2), through the same code path |

`tools/robust-check.mjs` adds the cases `glb` (one GLB blocked → retries → card → Bodencrew offer), `worker` (worker blocked → recordings) and `zone` (an area chunk blocked → card; for `sonnenacker` and `traumhangar` in Entdecker mode → the Bodencrew offer for AKKU or NAV, and the lift-off is still reachable).

### 5.9 Memory, workers and pause [C1 m3, m8, m12]

- `RobotLibrary.release(id)` for every robot of a suspended or disposed area, and for the Schauhalle's LRU of 3 LOD0 files.
- The Traumhangar frees its dream worlds on exit; the duck worker terminates 60 s after leaving.
- The CEM worker and the LifeDirector pause on `game:pause` and behind frozen panels (`idle-render` checks renders; WP7's `memory-lap` checks JS time while paused).
- Per-area `zoneData` ≤ 16 KB (Lern-Dojo demos and duck gaits are the candidates); `ctx.progress.set` refuses more with a dev error.
- `tools/memory-lap.mjs` records `renderer.info.memory` and the JS heap over a full lap; areas must give their memory back after suspension.

### 5.10 Tools to add or update (the tool contract)

The flags below are binding, because the acceptance commands in §6 use them.

| Tool | Command | What it checks | Owner |
|---|---|---|---|
| gates runner | `node tools/gates.mjs --tier merge` · `--tier wave` | runs the tier (§6.3), writes `artifacts/phase7/gates/<tier>-<sha>.json`, exit 1 on any fail; skips a tool that does not exist yet with a warning | WPS skeleton, WP7 |
| reference build | `node tools/dist-ref.mjs rc4` | builds tag `rc4` into `artifacts/dist/rc4` via a local detached worktree (no remote) | WP7 |
| views | `tools/lib/views.mjs` (one table for drawcalls, perf, perf-cpu, gpu-ab, progdiag) | names: `spawn` (rc4 Messpunkt), `bridgehead`, `plaza`, `plaza-air`, `kanzel240`, `clouddown`, `ausguck`, `schauhalle`, `duckfield`, `lerndojo-b`, `sonnenacker-c`, `kreislaufhof`, `traumhangar-ghost`, `kielraum-f1`, `climb` (h = 300 during a lift-off), `traum-spike` (dev, `?zone=_traum-spike`) | WP7 |
| drawcalls | `node tools/drawcalls.mjs --views bridgehead,plaza --ledger` | per-owner ledger against §5.5; exit 1 on a miss | WP7 |
| gpu-ab | `node tools/gpu-ab.mjs --views plaza,clouddown,bridgehead,ausguck --runs 5 --dist rc4=artifacts/dist/rc4 --dist head=artifacts/dist/head` | the A/B rule of §5.5 | WP7 |
| save-migrate | `node tools/save-migrate.mjs` | browser harness (`addInitScript` seeds each fixture, boot, read `__academy`): v2 under the new key, v1 byte-identical, legacy, rev resets, flight ground, failure path | WP7 tool, WP1 fixtures |
| i18n-audit | `node tools/i18n-audit.mjs` | DE/EN key parity, mode-variant shape, every area initialised through `__academy.loadAll()` [C1 m4] | WP7 |
| watch-audit | `node tools/watch-audit.mjs [--zones a,b] [--selftest]` | reads the `unattended` marks of a playtest run: ≤ 10 s per stretch, ≤ 20 % of a station's time | WP7 |
| flash-check | `node tools/flash-check.mjs --sequence liftoff\|traum-glitch\|duck-slowmo\|hail\|spray\|all [--rm] [--selftest]` | in-page `readPixels` on a 1024 × 768 target every frame; opposing ≥ 10 % luminance changes per 341 × 256 window and second; fail > 3. Sequences are registered by their owners via `__academy.ext('sequence:<name>')` | WP7 |
| liftoff-check | `node tools/liftoff-check.mjs [--rm] [--skip] [--replay]` | draws and triangles per beat, frames > 33 ms, the program gate, env rebuilds ≤ 1, audio ≤ −10 dBFS, the airborne state across a reload, skip, replay and dock switch, throttle release pauses the climb, sky dressing first visible after the break-out, the tracker wave reaches the farm, the console shows the three systems ready, the nav lamp is active before the first whiteout frame, the ghost horizon is visible only inside the cloud | WP7 skeleton, WP13 |
| onboarding-run | `node tools/onboarding-run.mjs --lang de --mode entdecker [--idle 10] [--returning]` | glide, bridge, Probestart, Pass, pad, first zone (≤ 30 s / ≤ 65 s); returning visitor without the glide | WP7, WP12 |
| ending-check | `node tools/ending-check.mjs --lang de` | ground ↔ airborne across reloads, „Zurück ins Dock“, „Im Dock weiterspielen“, „Abheben ansehen“, sky switch only airborne, ground areas suspended, 0 sky dressing visible grounded | WP7, WP13, WP2 |
| playtest | `npm run playtest -- --lang de --mode entdecker [--quick] [--save tools/fixtures/saves/<f>.json]` | both modes; the route incl. Sonnenacker, Schauhalle and Traumhangar (Entdecker), the six-◆ loop + Schaufenster (Entscheider), Startprüfung, lift-off (skip and full), certificate; asserts the three systems (Entdecker: 6 rotors + AKKU + NAV from stamps; Entscheider: 6 rotors, AKKU and NAV by the Bodencrew), island stamps 18, the pool from the manifests (84), 0 automatic cards; `--quick` = solve hooks only, ≤ 6 min | WP7; content WPs add solve hooks |
| hitches | `node tools/hitches.mjs --runs 1 [--browser webkit]` | the program gate of §5.5; frames > 33 ms by cause; robot first appearance; deliveries | WP7 |
| warmup | `node tools/warmup.mjs --table` | the itemised program table → `artifacts/phase7/programs.json`; ≤ 150 at the title | WP7 |
| memory-lap | `node tools/memory-lap.mjs` | §5.9 | WP7 |
| load-size | `node tools/load-size.mjs [--chunks]` | first load ≤ 1.75 MB; `--chunks`: the chunk caps of §5.6 | WP7 |
| load-matrix | `node tools/load-matrix.mjs --lap` | a scripted full playthrough transfers ≤ 8 MB | WP7 |
| robust-check | `node tools/robust-check.mjs --only glb,worker,zone` | §5.8 cases (plus the rc4 cases) | WP7 |
| third-party | `node tools/third-party.mjs` | also dedicated-worker requests and `locateFile` URLs [C1 m10] | WP7 |
| deploy-check | `node tools/deploy-check.mjs --preview` | plus one GLB (`model/gltf-binary`, br, immutable) and the MuJoCo wasm | WP7 |
| text-audit | `node tools/text-audit.mjs --lang de --mode entdecker [--zones a,b] [--chips]` | requests ≤ 12 words, consoles ≤ 35 words at open, robot and site cards, egg cards; `--chips`: every number in player text carries a chip | WP7 |
| glyph-check | `node tools/glyph-check.mjs` | new glyphs (π, κ, ≈, ✓, ±, →) | WP7 |
| secret-audit | `node tools/secret-audit.mjs --runs 30` | per secret: distance to a main path, cue on the route, reachable, curiosity-bot find rate; playtest with 0 and all secrets | WP7 skeleton, WP15 |
| shots-all | `node tools/shots-all.mjs [--rm]` | `--rm` = reduced motion | WP7 |
| robots check | `node tools/robots/check.mjs` | validator, FK vs source, licences, forbidden mesh paths (`sharpa`, `inspire`, `brainco`, `ur8long`, `ur15`, `ur18`, `ur20`, `ur30`), **caps as failures** | WP0 |
| robot gallery | `node tools/robot-gallery.mjs --prod` | every robot at true scale next to EMI 1.55 m, LOD0/LOD1/LOD2/silhouette → `artifacts/phase7/robots/` | WP0 |
| mujoco-check | `node tools/mujoco-check.mjs --prod --engines chromium,firefox,webkit --cpu 1,4` | the **production** worker loads; 0 bare specifiers in the worker bundle; generation times; the recordings path | WP5 |
| feature checks | `node tools/ground-walk.mjs` (WP3) · `frames-check.mjs [--area <id>]` and `robots-adapter-check.mjs` (WP4) · `quest-derive.mjs` (WP1) · `beats-check.mjs` (WP12) · `lerndojo-check.mjs` (WP6) · `lastdiagramm-check.mjs` (WP8) · `agripv-check.mjs` (WP9) · `traum-check.mjs` (WP10) · `hall-check.mjs` (WP11) · `f2-seeds.mjs` (WP13) · `region-check.mjs` (WP14) | as in each WP | their WP |

---

## 6. Work packages (builder prompts)

### 6.1 Protocol

- **Branch and worktree.** Every WP works on the branch `p7/<wp-id>` (lower case: `p7/wps`, `p7/wp1` … `p7/wp20`; WP0 keeps its existing `p7/robots`). It branches off `phase7` at the wave's start tag (`p7-w0` for wave 1, `p7-w1` for wave 2, `p7-w2` for wave 3; wave 0 off `phase7` HEAD), in its own worktree:
  `git -C <repo> worktree add ../academy-island-wt/<wp-id> -b p7/<wp-id> <tag>`.
  Commits happen only there. Local only: never add a remote, never push.
- **At most 8 builders at once.**
- **Own your paths.** A builder edits only the paths its WP owns (§6.2). Anything else is a request to the owner, or to the integrator.
- **Contracts first.** Every WP that provides a shared interface (§5.2) commits its types plus a stub implementation by day 2 of its wave (commit subject `Contract: …`). The integrator merges contract commits into `phase7` on day 2–3, and consumers rebase onto them.
- **Merge requests.** Each runs `node tools/gates.mjs --tier merge` on the branch plus the WP's own acceptance commands; the results go into the commit message.
- **Integrator per wave.** Merges in the order listed per wave, resolves the marked blocks, runs `node tools/gates.mjs --tier wave`, updates the status table at the top of this file, and tags `p7-w0`, `p7-w1`, `p7-w2`, `p7-rc5` (local tags).
- **Tuning and juice.** Each content WP keeps its tunable numbers in `tuning.ts` in its folder and reserves ≈ 15 % of its days for juice (sound, popups, timing).
- **Docs.** Builders do not edit docs; WP18 updates them in wave 3 from the builders' commit messages.
- **Hand-offs** (generated data for another WP): the producer owns the generator tool; the consumer owns and commits the output file.

### 6.2 Shared-file owner map [C1 B2]

| Path | Owner | Others reach it through |
|---|---|---|
| `src/core/Game.ts`, `src/core/zones/{ZoneManager,createZoneContext,types,index,manifest,ext,frames}.ts`, `src/core/zones/ext/**`, `src/core/zones/types.{frames,robots}.ts`, `src/core/{Physics,RenderSystem,Operate,Scheduler,retry,Assets}.ts` | WPS in wave 0, then **WP4** | context extensions, type augmentation in your own `types.<pkg>.ts`, the boot hooks |
| `src/core/zones/types.quest.ts`, `src/core/quest/**`, `src/systems/{Progress,migrate,retired,Secrets,GameLayer}.ts`, `src/ui/{StartScreen,PauseMenu,PassPanel,Credits,ResultUi,MapPanel,Kit,Hud,Compass}.ts`, `src/core/{Settings,params}.ts`, `src/i18n/**`, `tools/fixtures/saves/**` | **WP1** (WPS adds the seams in Kit and params in wave 0) | `registerChip`, `MapPanel.addLayer`, `Hud.setTelemetry`; strings live in each package's own files |
| `src/systems/retired.ts` entries | the WP that retires a station appends its line (WP5, WP8) | — |
| `src/core/zones/types.env.ts`, `src/core/Environment.ts`, `src/core/env/**`, `src/systems/Audio.ts`, `src/world/sky.ts` | **WP2** (WPS adds `registerLoopKind` in wave 0) | `registerLoopKind`; `sky.reveal()` |
| `src/core/DebugApi.ts` | WPS in wave 0, then **WP7** (core hooks only) | `__academy.ext()`, `ctx.debug.register` |
| `src/core/robots/**`, `src/robots/**`, `src/core/credits.ts`, `LICENSES/**`, `tools/robots/**`, `tools/robot-gallery.mjs`, `tools/notices-plugin.mjs` | **WP0** | `ctx.robots` (WP4); `src/core/credits.ts` `SOFTWARE_CREDITS`: one row per new runtime dependency, added by the WP that adds it (WP5: MuJoCo) |
| `src/world/ground/**`, `tools/ground/**`, `public/world/ground/**`, `tools/ground-walk.mjs` | **WP3** | `GroundHandle` |
| `src/world/index.ts`, block „Phase 7 packages (one line each)“ and the shared `P7` deps object | WP3 creates it in wave 1; every world WP adds exactly one `await build<Pkg>(ctx, P7)` line and its import; the integrator orders them | — |
| `src/world/index.ts` body; every file directly in `src/world/` except `layout.ts` and `sky.ts`; `src/world/tower/**`; `src/world/landscape/**` except `pods.ts`, `rovers.ts`, `drones.ts`; new `src/world/start/**` | **WP12** (island owner) | `radio.say(owner, line)`, the rotor-rate API, `objective:changed`; WP11 sends the hall footprint and roof spec as a request |
| `src/world/layout.ts` | **WP4**; frozen after p7-w1 (later changes only through the integrator) | — |
| `src/world/finale/**` | **WP13** | `flight:phase` events |
| `src/world/region/**`, `src/ui/map/region.ts` | **WP14** (WP16 adds `src/world/region/rail/**` in wave 3) | — |
| `src/world/life/**`, `src/world/eggs/**`, `src/world/landscape/{pods,rovers,drones}.ts` | **WP15** (WP16 adds `should/` subfolders in wave 3) | events |
| `src/zones/<id>/**` (incl. `manifest.ts`, created by WPS) | the area's WP: regelgarten WP5 · lern-dojo WP6 · sensordom, greifwerkstatt, dunkelfabrik, prueffeld WP8 · sonnenacker WP9 · traumhangar WP10 · schauhalle WP11 · kreislaufhof, unkrautacker WP14 · dorf WP16 | — |
| `src/zones/schauhalle/kurzlauf/*` | WP11 commits; WP5 (`tools/duck/kurzlauf.mjs`), WP9 (`tools/sonnenacker/kurzlauf.mjs`) and WP10 (`tools/traum/kurzlauf.mjs`) generate | hand-off |
| `src/zones/_site-example/**` (dev only) | WP4 | — |
| `src/zones/_traum-spike/**` (dev only) | WP2 in wave 1; moves to WP10 at p7-w1 (deleted when WP10 merges) | — |
| `tools/*`, `tools/lib/**` (except the rows above and below) | **WP7** (WPS edits `tools/lib/{session,measure}.mjs` and creates `tools/gates.mjs` in wave 0) | feature checks by their WPs (§5.10) |
| `tools/duck/**`, `tools/mujoco/**`, `tools/mujoco-check.mjs` | **WP5** | — |
| `tools/traum/**` | **WP10** | — |
| `tools/sonnenacker/**` | **WP9** | — |
| `vite.config.ts` | integrator; marked blocks `// ── robots (WP0)` and `// ── worker (WP5)` | — |
| `package.json` and the lockfile | integrator; WP5 lists `@mujoco/mujoco@3.16.0` in its merge request; the integrator runs `npm install` once per wave and commits the lockfile | — |
| `index.html` | integrator | — |
| `docs/**` | WP18 in wave 3; `docs/RELEASE.md` §1–§3 WP19; the status table of this file: the integrator | — |

### 6.3 Gate tiers (exact commands) [C1 M15]

**Per merge** (`node tools/gates.mjs --tier merge`, ≤ 25 min on the M5 Pro):
1. `npm run typecheck`
2. `npm run typecheck:zone -- <id>` for every area folder the branch touched
3. `npm run build`
4. `node tools/load-size.mjs` (first load ≤ 1.75 MB)
5. `node tools/i18n-audit.mjs`
6. `node tools/save-migrate.mjs`
7. `node tools/robots/check.mjs` (only if `src/robots/**` changed)
8. `node tools/third-party.mjs`
9. `node tools/text-audit.mjs --lang de --mode entdecker`
10. `node tools/drawcalls.mjs --views bridgehead,plaza --ledger`
11. `npm run playtest -- --lang de --mode entdecker --quick`

**Per wave and nightly** (`node tools/gates.mjs --tier wave`, ≈ 2 h; it first runs `npx vite build --outDir artifacts/dist/head` and, once, `node tools/dist-ref.mjs rc4`): the merge tier, plus
- `npm run playtest -- --lang en --mode entscheider` · `npm run playtest -- --lang de --mode entdecker` (full) · `npm run playtest -- --lang de --mode entdecker --save tools/fixtures/saves/rc4-mid.json`
- `node tools/perf.mjs --quality high` · `node tools/perf.mjs --quality low` · `node tools/perf-cpu.mjs --rates 4 --views bridgehead,plaza,duckfield,sonnenacker-c,traumhangar-ghost,climb`
- `node tools/gpu-ab.mjs --views plaza,clouddown,bridgehead,ausguck --runs 5 --dist rc4=artifacts/dist/rc4 --dist head=artifacts/dist/head`
- `node tools/hitches.mjs --runs 1` · `node tools/hitches.mjs --runs 1 --browser webkit` · `node tools/warmup.mjs --table` · `node tools/memory-lap.mjs`
- `node tools/liftoff-check.mjs` · `node tools/liftoff-check.mjs --rm` · `node tools/flash-check.mjs --sequence all`
- `node tools/onboarding-run.mjs --lang de --mode entdecker` · `node tools/onboarding-run.mjs --lang en --mode entscheider --idle 10` · `node tools/onboarding-run.mjs --lang de --mode entdecker --returning` · `node tools/ending-check.mjs --lang de`
- `node tools/text-audit.mjs --chips` in all four language/mode runs · `node tools/glyph-check.mjs` · `node tools/watch-audit.mjs` · `node tools/secret-audit.mjs --runs 30`
- `node tools/a11y-keyboard.mjs --browsers chromium,firefox,webkit` · `node tools/contrast.mjs` · `node tools/audio-levels.mjs` · `node tools/idle-render.mjs` · `node tools/dialogue-modal.mjs` · `node tools/brand-check.mjs`
- `node tools/robust-check.mjs` · `node tools/mujoco-check.mjs --prod --engines chromium,firefox,webkit --cpu 1,4` · `node tools/load-size.mjs --chunks` · `node tools/load-matrix.mjs --lap` · `node tools/deploy-check.mjs --preview`

`gates.mjs` skips a tool that does not exist yet with a warning; WP7 lands the new ones by day 5 of wave 1.

### 6.4 Wave 0 (now; ≈ 3 working days + 1 integration day)

Merge order: WP0 (first merge) → WPS. Tag `p7-w0`. In parallel: **H-TIME**. The founder (or the lead) watches two first-time players on rc4 with a stopwatch per station, noting where they retry by choice and where they stop reading. Results by wave-1 day 8; the lead then recalibrates §1.3 and the wave-2 station specs [C2 M1, M11]. If no players are available by then, wave 2 proceeds on §1.3, and the wave-2 day-8 session decides the second cut tier.

#### WP0 · Robots pipeline and runtime (in progress)

- **Wave · branch · worktree:** 0 → 1 · `p7/robots` (existing; the one exception to `p7/<wp-id>`) · `../academy-island-wt/robots`
- **Size · tier:** ≈ 7 builder-days left · MUST
- **Goal:** every real robot as one skinned meshopt GLB (LOD0 + LOD1, plus LOD2 where requested) and a silhouette, generated from pinned sources, with licences and credits data.
- **Owns:** `tools/robots/**`, `tools/robot-gallery.mjs`, `tools/notices-plugin.mjs`, `src/robots/**` (generated: `manifest.ts`, `credits.ts`, `glb/*.glb`), `src/core/robots/**`, `src/core/credits.ts`, `LICENSES/**`, the `vite.config.ts` block `// ── robots (WP0)` (GLB compression and content type, the notices plugin).
- **API, frozen at p7-w0** (consumers reference it; WP0 changes it only with the integrator): `RobotLibrary` (`load(id, RobotLoadOptions)`, `loadSilhouette`, `prewarm(id)`, `release(id)`, `info`, `all`, `paint`, `loaded()`), `RobotModel` (as listed in §5.2), types `RobotId`, `RobotLod`, `RobotLoadOptions`, `RobotIkOptions`, `RobotIkResult`, `RobotJoint` from `src/core/robots/index.ts`; `ROBOTS`, `robotInfo`, `RobotManifestEntry` from `src/robots/manifest.ts`; `CREDITS`, `creditHref` from `src/core/credits.ts`. Zones never import these at runtime: they use `ctx.robots`; the credits page imports `@/core/credits` dynamically.
- **Consumes:** nothing new.
- **Requested additions** (deadline in wave-1 working days):
  - **R1 · p7-w0:** merge the current state (API frozen, current GLBs, the Apollo flagged).
  - **R2 · day 4:** an **articulated LOD2**: a third index list on the same skinned mesh. Caps: ≤ 1.5 k triangles for the duck, ≤ 2 k for the SO-101, ≤ 3 k for the four Unitree robots (others optional). `RobotLod` gains `2`, and `RobotLibrary.bodies(id, lod: 0 | 1 | 2): Promise<RobotBody[]>` splits any LOD per body: each vertex already has weight 1 on its body; the result is in the link frame, unskinned, for InstancedMesh crowds.
  - **R3 · day 7:** `inertials: { link: string; mass: number; com: [number, number, number] }[]` in the manifest, from the source (SO-101 at least; all robots where the source has them).
  - **R4 · day 7:** the caps of §5.6:
    - re-decimate the exhibits (LOD0 ≤ 25 k triangles, humanoid exhibits ≤ 30 k; ≤ 150 KB each, humanoid exhibits ≤ 250 KB);
    - the Apollo ≤ 350 KB with crack repair; if a visual check shows holes, it is the one documented exception ≤ 420 KB;
    - `check.mjs` fails on any file > 350 KB (except the documented exception) and on a MUST-set total > 4.0 MB, and prints that total.
  - **R5 · day 7:** run LeKiwi (`SIGRobotics-UIUC/LeKiwi`, Apache-2.0 at repo level; mesh licences unchecked) through the licence gate. If green: a `lekiwi-base` GLB (base only; the arm is `so101`) ≤ 120 KB. If not: a note in `tools/robots/REPORT.md`, and the farm keeps the rc4 rovers.
  - **R6 · day 9:** `lineup.l2.glb`: every hall robot in its default pose as one static merged silhouette line-up at true scale, ≤ 0.2 MB.
  - A second WP0 merge on wave-1 day 9 carries R2–R6.
- **Acceptance (exact commands):**
  - `node tools/robots/check.mjs` → validator 0 errors, FK ≤ 0.01 mm, licence + attribution per robot, forbidden mesh paths rejected, every cap of R4 enforced
  - `node tools/robot-gallery.mjs --prod` → screenshots in `artifacts/phase7/robots/`, read by eye (true scale next to EMI 1.55 m; LOD0/LOD1/LOD2/silhouette)
  - `npm run typecheck` · `npm run build` · `node tools/load-size.mjs` (no robot byte in the first load) · `node tools/third-party.mjs`
  - after WP4's adapter lands: `node tools/hitches.mjs --runs 1` → a prewarmed robot links 0 programs on its first-show frame
- **Fallbacks:** if R2 is not merged by wave-1 day 6, WP4 builds `bodies()` in `src/core/zones/ext/robotBodies.ts` from the skinned GLB (never in a zone). If R6 slips, WP11 merges the per-robot silhouettes at runtime.

#### WPS · Seams and boot split

- **Wave · branch · worktree:** 0 · `p7/wps` off `phase7` HEAD · `../academy-island-wt/wps`
- **Size · tier:** 3 builder-days (the engine-lane builder, who continues as WP4) · MUST
- **Goal:** the seams that let eight builders work without colliding, and a boot that keeps area code out of the first load [C1 B1, B2].
- **Owns (wave 0 only; then the owners of §6.2):** `src/core/Game.ts`, `src/core/zones/{ZoneManager,createZoneContext,types,index}.ts`, new `src/core/zones/{manifest,ext}.ts`, new empty shells `src/core/zones/types.{quest,frames,robots,env}.ts`, `src/zones/*/manifest.ts` (split out of `index.ts` for the six rc4 zones; stubs for `schauhalle`, `sonnenacker`, `traumhangar`, `kreislaufhof`, `unkrautacker` with the station ids, kinds, frames and systems of §3.1 and §4; the system ids `RotorId`, `CoreId`, `TrimId`, `SystemId` are defined in `manifest.ts` (§5.2), and the stubs set `system` and `trim` as in §3.1: the lobes M1–M6, `sonnenacker` `system: 'AKKU'` + `trim: 'T3'`, `traumhangar` `system: 'NAV'` + `trim: 'T2'`, `kreislaufhof` `'T1'`, `unkrautacker` `'T4'`, `schauhalle` none), the six rc4 `src/zones/*/index.ts` (only the manifest import), `src/core/params.ts`, `src/core/DebugApi.ts`, `src/ui/Kit.ts` (seam only), `src/systems/Audio.ts` (seam only), `src/core/RenderSystem.ts` (seam only), `src/core/quest/resume.ts` (rc4 resume logic moved out of `Game.ts`, unchanged), `src/systems/migrate.ts` (identity stub), `tools/lib/{session,measure}.mjs` (readiness), `tools/gates.mjs` (new).
- **Consumes:** WP0's manifest types (type-only).
- **Build:**
  1. The manifest/code split (`defineManifest`, §5.2): an eager manifest glob, the lazy code glob behind a priority queue, `ZoneManager.setReachable(pred)` (stub: lobes and halls reachable, sites only by `?area=`/`?zone=`), manifest-only areas reserve plots and register no stamps.
  2. Readiness: `game:ready` / `__academy.ready` = title up + eager set settled; `__academy.loadAll()` forces every area; `game:settled-all` / `__academy.settledAll`; `tools/lib/session.mjs` and `measure.mjs` wait accordingly (tools that need every area call `loadAll()`).
  3. `registerContextExtension`, `interface ZoneContext extends ZoneContextExtensions`, and one `export *` line per planned types file in `src/core/zones/index.ts`, so nobody edits it later.
  4. Seams: `registerChip`, `registerLoopKind`, `registerBootWarmup`, `__academy.ext`, `__academy.unattended()` (an empty trace).
  5. Boot hooks: `migrate()` before `Progress` (identity), `resumePlan()` and `titleState()` from `src/core/quest/resume.ts`.
  6. Params `?flight=`, `?liftoff=1`, `?area=`, `?world=0` (no ground frame; ground areas get fallback platforms), `?only=<site>` (the island module still registers the ground frame) [C1 m14].
  7. `tools/gates.mjs --tier merge|wave` over the existing rc4 tools.
- **Acceptance (exact commands):**
  - `npm run typecheck` and `for z in sensordom regelgarten greifwerkstatt lern-dojo dunkelfabrik prueffeld; do npm run typecheck:zone -- $z || exit 1; done`
  - `npm run build`
  - `node tools/load-size.mjs` → ≤ 1.75 MB, and no zone chunk in the first load (expected ≈ 1.45 MB)
  - `npm run playtest -- --lang de --mode entdecker` and `npm run playtest -- --lang en --mode entscheider` → the rc4 assertions unchanged (18/18, 54/54 ★)
  - `node tools/onboarding-run.mjs --lang de --mode entdecker` → within ±10 % of rc4 (42.2 s / 60.9 s)
  - `node tools/hitches.mjs --runs 1` → no more links than rc4 (6)
  - `node tools/robust-check.mjs --only zone`
  - `node tools/gates.mjs --tier merge` → green

### 6.5 Wave 1 (foundations and the playable spine; 7 builders + WP0; ≈ 12 working days)

Merge order: WP4 → WP1 → WP2 → WP3 → WP7 → WP12 → WP5 (WP0's second merge already landed as `46fb5b3`; wave 1 branches off tag `p7-w1-base`). Tag `p7-w1`. **Exit criteria [C1 M12]:**
- a grounded rc4 with the Probestart, the six lamps, rotors and the Revier gate is playable;
- the first load is ≤ 1.75 MB with all five stub manifests;
- the GPU-proof scene is measured as an A/B;
- the ledger runs on the bridge head and the plaza;
- G-LOOK is approved (or the stills are delivered and waiting).

#### WP1 · Quest spine, save v2, title and UI

- **Wave · branch · worktree:** 1 · `p7/wp1` off `p7-w0` · `../academy-island-wt/wp1`
- **Size · tier:** 11 builder-days · MUST
- **Depends on:** WPS; WP0 (`src/core/credits.ts`).
- **Goal:** rotor, core (AKKU, NAV), trim, start-system („Startklar“, D23), flight, ground-crew and mastery state derived from stamps, manifests and the mode; save v2 with a safe migration; the resume rule; the title states; the Pass sections; pause entries; the credits page; secrets; the one-voice banner; the loading card; the scopes.
- **Owns:** `src/core/quest/**` (`QuestSpine`, `types`, `systems`, `pool`, `mastery`, `resume`, `values`), `src/core/zones/types.quest.ts`, `src/systems/{Progress,migrate,retired,Secrets,GameLayer}.ts`, `src/ui/{StartScreen,PauseMenu,PassPanel,Credits,ResultUi,MapPanel,Kit,Hud,Compass}.ts`, `src/core/{Settings,params}.ts`, `src/i18n/**`, `tools/fixtures/saves/**`, `tools/quest-derive.mjs`.
- **Consumes:** manifests and seams (`src/core/zones/{manifest,ext}.ts`, WPS); boot hooks in `src/core/Game.ts` (WPS); `CREDITS`/`creditHref` (`src/core/credits.ts`, WP0, lazy import).
- **Provides (contract by day 2):** `ctx.quest` (`QuestApi`, `src/core/quest/types.ts`, incl. `CoreId`, `StartSystem`, `StartSystems`, `CrewReason`, `BeatId`), `ctx.game.secrets` (`ZoneSecrets`), `ctx.game.unattended`, the scopes (`Progress.earnedStamps({scope})`, `GameLayer.summary/stars({scope})`, `ZoneGame.progress({scope})`), `pool()`, `values.ts` (`passSnapshot`, `zoneValue`), `openCredits()`, `MapPanel.addLayer()`, `Hud.setTelemetry()`, the chips HERSTELLERANGABE / MODELL / SIM · AUFZEICHNUNG / TRAUM, the loading card and the Bodencrew offer in `Kit`.
- **Spec:** §3 (all), §4.1 (title, Pass, one voice, loading card), §5.2 (quest, scopes, secrets, credits), §5.8.
- **Build:**
  1. Derivations from Progress + manifests (no zone code needed), including the three start systems (§3.1, D23): the system table with `group` and `crewIn`, the Startakku charge, the Entscheider supply of AKKU and NAV after the Probestart (derived from the current mode, `by: 'crew'`), `startklar` and `armed`.
  2. `p7.quest` storage through `QuestApi` only.
  3. Migration rules 1–8 with the failure path and the new key.
  4. `retired.ts` mechanism (empty list; the fixtures test uses a test entry).
  5. The scopes, with every rc4 caller left on `'island'`.
  6. Title three states, „Im Dock weiterspielen“, „Abheben ansehen“ (calls WP13's replay through an event), Pass sections, the Pass cover with the three systems and the star line, the pause entries „Credits & Lizenzen“ and „Außenkameras“ (Settings schema v4).
  7. The credits page (lazy).
  8. `ResultUi` one-voice strip.
  9. Secrets API incl. `registerObject`.
  10. Telemetry strip states.
  11. The loading card + Bodencrew offer wired to `robots:failed` / `zones:failed` events (WP4).
- **Acceptance (exact commands):**
  - `npm run typecheck` · `npm run build`
  - `node tools/save-migrate.mjs` → every fixture of §3.5 rule 8 passes; the v1 blob is byte-identical after a v2 session; a corrupt blob runs read-only
  - `node tools/quest-derive.mjs` → seeded stamps give the right rotor states, `regionOpen`, `kielOpen`, `armed`; the mastery gate is closed at 62 and open at 63 of 84 with ★★★ A–C; farm stamps do not change the tower count, „n von 18“ or the melody index; the ground crew makes a rotor, AKKU or NAV bereit without a stamp. **Gate (D23):** Entdecker with 6/6 + F3 stays unarmed until `sonnenacker.erntetag` and `traumhangar.traumdaten` are earned (or crewed); one Sonnenacker stamp gives `charge` ⅓, two ⅔, the ◆ 1. Entscheider after the Probestart has AKKU and NAV bereit with `by: 'crew'`, and 6/6 + F3 arms. An earned ground ◆ turns `by` to `'player'` in both modes. A mode switch flips the crew supply both ways and never changes `flight`; trims never change `startklar`
  - `npm run playtest -- --lang de --mode entdecker` → rc4 content passes with the pool read from the manifests
  - `node tools/a11y-keyboard.mjs --browsers chromium,firefox,webkit` (incl. the credits page and the three title states) · `node tools/dialogue-modal.mjs` · `node tools/contrast.mjs`
  - `node tools/gates.mjs --tier merge`
- **Hand-offs:** the title's replay button emits `liftoff:replay` (WP13 listens); the failure card listens to WP4's `robots:failed` / `zones:failed` events.

#### WP2 · Sky, environment and sky dressing (+ the Traumhangar spike)

- **Wave · branch · worktree:** 1 · `p7/wp2` off `p7-w0` · `../academy-island-wt/wp2`
- **Size · tier:** 6 builder-days + 3 spike days · MUST
- **Depends on:** WPS; WP3 for the joint GPU-proof scene.
- **Goal:** the grounded sky with the slab ceiling, the fog modes, sun blocking, env-map hold, the ambience filter and the sky frame of the sky dressing, inside the GPU budget; then a spike that proves humanoid piloting and the toy world model for WP10.
- **Owns:** `src/core/Environment.ts`, `src/core/env/**`, `src/core/zones/types.env.ts`, `src/systems/Audio.ts`, `src/world/sky.ts`, `src/zones/_traum-spike/**` (dev only).
- **Consumes:** `registerBootWarmup` (`src/core/RenderSystem.ts`, WPS); WP0's G1 through `ctx.robots` (WP4) and `enterOperate({ capture })` (WP4, day 5) for the spike.
- **Provides (contract by day 2):** `ctx.env.setFlight / sunBlocked / holdEnvMap / rebuildEnvMap`, `ctx.audio.setAmbienceFilter`, `registerLoopKind`, `sky.setGrounded / reveal / copterGeometry`.
- **Spec:** §5.7, §5.3 rule 2b, §5.5 (GPU A/B), §2.5.
- **Build:**
  1. Day 1: measure the sky drawn after the opaques vs first (A/B) and adopt it if it saves.
  2. The slab only in the sky shader.
  3. Fog 0.0007 grounded; the cloud ramp; no per-material slab term.
  4. `sunBlocked` with a ±2° soft edge.
  5. The env map rebuilt once for the grounded look; hold/rebuild for the lift-off.
  6. The ambience filter.
  7. Sky dressing: hidden grounded, `reveal()`, copters over the Revier under the cloud bank.
  8. Day 5 with WP3: the GPU-proof scene and the G-LOOK stills.
  9. Days 7–9, the spike in `src/zones/_traum-spike/`: a G1 walks by velocity commands with leg IK and carries a box with arm IK; a K = 5 dream ensemble on a private Rapier world; findings in the hand-off commit message.
- **Acceptance (exact commands):**
  - `node tools/dist-ref.mjs rc4 && npx vite build --outDir artifacts/dist/head && node tools/gpu-ab.mjs --views plaza,clouddown,bridgehead,ausguck --runs 5 --dist rc4=artifacts/dist/rc4 --dist head=artifacts/dist/head` → plaza ≤ 4.5 ms or ≤ rc4 + 0.15 ms (then the founder is told); cloud view ≤ 7.0 ms; bridge head ≤ 4.5 ms; Ausguck ≤ 6.0 ms
  - `node tools/warmup.mjs --table` → ≤ 150 programs at the title
  - `node tools/brand-check.mjs` → the mark's colours unchanged
  - `node tools/ending-check.mjs --lang de` → 0 visible `island:near-islets`, `island:far-islands`, `island:wisps` in the title and the grounded survey views
  - `node tools/audio-levels.mjs --quick`
  - spike: `node tools/perf-cpu.mjs --rates 4 --views traum-spike` → gait + IK ≤ 2 ms per frame, the dream ≤ 8 ms spread over frames (≤ 2 ms per frame)
  - G-LOOK stills in `artifacts/phase7/lookdev/` by day 5 (with WP3)
  - `node tools/gates.mjs --tier merge`

#### WP3 · Ground and dock

- **Wave · branch · worktree:** 1 · `p7/wp3` off `p7-w0` · `../academy-island-wt/wp3`
- **Size · tier:** 10 builder-days · MUST
- **Depends on:** WP4 (frames, rescue volumes, layout; stubs on day 2), WP2 (fog, warm-up).
- **Goal:** the Trockendock, the Werft yard, the terrain, the shore and lake, the far ring and the dock spray, cheap enough for the bridge-head and plaza budgets.
- **Owns:** `src/world/ground/**`, `tools/ground/**`, `public/world/ground/**`, `tools/ground-walk.mjs`, and the `src/world/index.ts` block „Phase 7 packages (one line each)“ with the shared `P7` deps object (created by WP3).
- **Consumes:** `ctx.frames.register` and `ctx.physics.addRescueVolume` (`src/core/zones/types.frames.ts`, WP4); `TROCKENDOCK`, `REVIER`, `GROUND_PADS` (`src/world/layout.ts`, WP4); `ctx.env.setFlight` (`src/core/zones/types.env.ts`, WP2); `registerBootWarmup` (WPS).
- **Provides (contract by day 2):** `GroundHandle`, `DockSpray`, `buildGround` (`src/world/ground/index.ts`).
- **Spec:** §2.1–§2.3, §2.7, §5.3, §5.5 (ground ledger), §5.6 (heights).
- **Build:**
  1. Dock wall (`outlineRadius(b, true) + 4`, 66 m deep) with ribs, terraces and depth ticks; floor and keel block.
  2. The six Haltearme (`setArms`), the bridge (`setBridge`), apron, bridge head, gate (`setGate`) and sign (`setSign`).
  3. The Werft yard (cranes K1, K2, fence, the pad surroundings).
  4. Terrain:
     - heights baked offline by `tools/ground/bake.mjs` into `public/world/ground/heights-core.bin` (300 m core, Uint16, ≤ 20 KB br, loaded before the title) and `heights-ring.bin` (to 1.3 km, ≤ 100 KB br, after the title), with the path splines baked in;
     - render: clipmap rings, ≤ 8 draws, ≤ 160 k triangles per view;
     - colliders: 64 m Rapier heightfield tiles at 2 m, only over the apron, paths, pads and the site rects; fences bound the walkable area [C1 M13].
  5. Shore and lake (water ≥ 1 m below the shore, polygon offset), far-ring impostors (≤ 4 draws), analytic island shadow and cloud-bank shade.
  6. `DockSpray` (one instanced draw, mid-tone, flash-safe).
  7. Rescue volumes: dock floor + keel block, lake surface.
  8. `outsideCamera()` for C1/C2.
  9. Register the ground frame.
  10. The G-LOOK stills with WP2 by day 5: the bridge head looking north, the Ausguck looking WNW, the Sonnenacker at eye level as a block-out (mandatory in the set) [C2 M5].
- **Acceptance (exact commands):**
  - `node tools/drawcalls.mjs --views bridgehead,plaza,ausguck --ledger` → ground ≤ 30 at the bridge head, ≤ 10 at the plaza
  - `node tools/perf.mjs --quality high` and `node tools/perf.mjs --quality low` → the GDD gate on every view incl. `bridgehead` and `ausguck`
  - `node tools/perf-cpu.mjs --rates 4 --views bridgehead,plaza` → ≤ 8.4 / ≤ 7.8 ms
  - `node tools/load-matrix.mjs --profile cable --cpu 4` → no task > 250 ms before the title; title ≤ 4.5 s
  - `node tools/load-size.mjs` → ≤ 1.75 MB incl. the heights core
  - `node tools/ground-walk.mjs` → bridge, apron, paths and pads walked without a snag > 0.3 s; a fall into the dock and into the lake is rescued within 2 s; a crate thrown into the dock is reset
  - `node tools/flash-check.mjs --sequence spray`
  - `node tools/gates.mjs --tier merge`

#### WP4 · Engine: frames, sites, flight, robots adapter

- **Wave · branch · worktree:** 1 · `p7/wp4` off `p7-w0` · `../academy-island-wt/wp4`
- **Size · tier:** 9 builder-days · MUST
- **Depends on:** WPS (same builder); WP0 (frozen API); WP1 (`ctx.quest` stub, day 2).
- **Goal:** areas beyond the six lobes, the ground frame with one altitude setter, suspension and frozen dynamics, rescue volumes, piloting capture, and `ctx.robots` with a reachability-aware fetch queue.
- **Owns (from p7-w0 to release):** `src/core/Game.ts`, `src/core/zones/{ZoneManager,createZoneContext,types,index,manifest,ext,frames}.ts`, `src/core/zones/ext/**`, `src/core/zones/types.{frames,robots}.ts`, `src/core/{Physics,RenderSystem,Operate,Scheduler,retry,Assets}.ts`, `src/world/layout.ts` (frozen after p7-w1), `src/zones/_site-example/**`, `tools/frames-check.mjs`, `tools/robots-adapter-check.mjs`.
- **Consumes:** `RobotLibrary` / `RobotModel` (`src/core/robots/index.ts`, WP0; dynamic import); `QuestApi.snapshot()` and `onChange` (`src/core/quest/types.ts`, WP1); `objective:changed` events (WP12); `flight:phase` (WP13).
- **Provides (contract by day 2):**
  - plot kinds, frames, shapes, rect tiers and `interior` (`types.frames.ts`), `ctx.zones.list({ kind })`;
  - `onSuspend` / `onResume`, `ctx.frames`, `ctx.flight`, `ctx.island.setAltitude`, `ctx.physics.addRescueVolume`;
  - `enterOperate({ capture })` (by day 5);
  - `ctx.robots` (`ZoneRobots`, `types.robots.ts` + `ext/robots.ts`);
  - layout data (`HALL_PLOTS`, `SITE_PLOTS`, `ROUTES` per §1.3/§1.4, `TROCKENDOCK`, `REVIER`, `GROUND_PADS`, `KANZEL_PADS`, fallback plots beyond 900 m);
  - `robots:failed` / `zones:failed` events.
- **Spec:** §5.2 (frames, flight, robots), §5.3, §5.5 (programs), §5.6 (queue), §5.8, §2.3.
- **Build:**
  1. Plots: rect tiers measured from the shape's edge; `interior` caps other areas at their exterior tier; the circumscribed radius plus a shape test for `inside` [C1 m13].
  2. Ground parenting, with suspended roots detached from the scene graph.
  3. `setAltitude` fan-out (§5.3 rule 2) and `setIslandTilt` applying the inverse tilt to the environment and the ground root.
  4. Collider enable at h ≤ 0.05 m untilted; the dynamics freeze; rescue volumes.
  5. Suspension.
  6. `ZoneManager.setReachable` from `ctx.quest`.
  7. `ctx.robots`: the queue (reachability, objective, ≤ 60 m, ≤ 2 at once), LOD tracking, `animate()`, `prefetch()` (paused during cinematics, F1 and the lift-off), release on suspend/dispose, retries and failure states, `progress()`; it constructs `RobotLibrary` lazily with `{ materials: ctx.materials, renderer, compile: (root) => rs.warmUp({ root }) }`.
  8. Boot warm-up dummies for the robot variants (§5.5).
  9. Operate capture for piloting.
  10. `markShadowsDirty()`.
  11. The dev site zone.
- **Acceptance (exact commands):**
  - `npm run typecheck` · `npm run build` · `node tools/load-size.mjs`
  - `node tools/shots-all.mjs` on `p7/wp4` and on `p7-w0` → identical island views (mean difference ≤ 0.5/255) [C1 M15]
  - `node tools/frames-check.mjs` → the dev site enters and exits correctly; `setAltitude(10)` suspends ground areas, disables ground colliders and freezes ground dynamics; back at 0 everything resumes with bodies within 1 mm of their poses; `setAltitude(0.3)` + tilt lets no ground body fall; inside the Schauhalle rect the neighbouring lobes render their exterior tier; the rescue volumes fire within 0.5 s
  - `node tools/robots-adapter-check.mjs` → no site-area robot is fetched before `regionOpen`; ≤ 2 fetches at once; no prewarm during `cinematic()`; a blocked GLB ends as `failed` after 3 retries and emits `robots:failed`; `animate()` allocates nothing per frame
  - `node tools/hitches.mjs --runs 1` → 0 links on the first-show frame of a prewarmed robot
  - `node tools/perf-cpu.mjs --rates 4 --views climb` → the fan-out at h = 300 costs ≤ 0.3 ms
  - `node tools/gates.mjs --tier merge`

#### WP5 · Regelgarten: „Lauf, Ente!“ (MuJoCo)

- **Wave · branch · worktree:** 1 · `p7/wp5` off `p7-w0` · `../academy-island-wt/wp5`
- **Size · tier:** 11 builder-days · MUST
- **Depends on:** WP0 (duck GLB; R2 LOD2 + `bodies()` by day 4), WP4 (`ctx.robots` stub), WP1 (secrets, `unattended`, chips; stubs).
- **Goal:** the real-physics duck RL station with the early stop and parallel test lanes; the 02 A/B tweaks; the zone request; the retirement of „Tausend falsche Welten“.
- **Owns:** `src/zones/regelgarten/**` (incl. `duck/duck.worker.ts`, `duck/mujoco.ts`, `duck/model.xml`, `tuning.ts`), `tools/duck/**` (`record.mjs`, `kurzlauf.mjs`, the hack calibration), `tools/mujoco/strip.mjs`, `tools/mujoco-check.mjs`, the `vite.config.ts` block `// ── worker (WP5)`, the `@mujoco/mujoco@3.16.0` dependency (through the integrator), one row in `src/core/credits.ts` `SOFTWARE_CREDITS`, the `retired.ts` line `regelgarten.tausend-welten`.
- **Consumes:** `ctx.robots.load / bodies` (`src/core/zones/types.robots.ts`, WP4); `ctx.game.secrets`, `ctx.game.unattended`, chips (`src/core/zones/types.quest.ts`, WP1); `quest:system` events (WP1); `registerLoopKind` (WP2).
- **Provides:** egg hooks 10 and 11; the Kurzlauf data via `node tools/duck/kurzlauf.mjs --out src/zones/schauhalle/kurzlauf/duck.bin` (committed by WP11); the `duck-slowmo` flash sequence.
- **Spec:** §4.3, §5.4, §5.9.
- **Acceptance (exact commands):**
  - `node tools/mujoco-check.mjs --prod --engines chromium,firefox,webkit --cpu 1,4` → R2 §7.6: home pose stable 3 s, ≤ 15 µs/step, the walk preset ≥ 0.3 m by generation 14, each hack in ≥ 2 of 3 seeds, a generation ≤ 1.5 s at 1× and ≤ 3.5 s at 4×, 0 main-thread long tasks; the production worker loads with 0 bare specifiers; a forced no-module-worker run uses the recordings with the chip
  - `npm run typecheck:zone -- regelgarten`
  - `node tools/perf.mjs --quality high` view `duckfield` → zone ≤ 80 draws, robots ≤ 140 k triangles
  - `node tools/perf-cpu.mjs --rates 4 --views duckfield` → main ≤ 8.4 ms
  - `node tools/watch-audit.mjs --zones regelgarten` → no unattended stretch > 10 s
  - `node tools/flash-check.mjs --sequence duck-slowmo`
  - `node tools/robust-check.mjs --only worker`
  - `npm run playtest -- --lang de --mode entdecker --quick` → 02 A, B, C stamp through `solve-a/b/c`; `stars3` hooks
  - `node tools/save-migrate.mjs` → `tausend-welten` goes to legacy
  - `node tools/gates.mjs --tier merge`

#### WP7 · Tools and gates

- **Wave · branch · worktree:** 1 · `p7/wp7` off `p7-w0` · `../academy-island-wt/wp7`
- **Size · tier:** 10 builder-days · MUST
- **Depends on:** WPS (gates skeleton, readiness).
- **Goal:** every gate of §5.10 and §6.3, so that each later WP can prove its acceptance with one command.
- **Owns:** `tools/*` and `tools/lib/**` except the rows owned by WP0, WP3, WP4, WP5, WP9, WP10 and the feature checks of §5.10; `src/core/DebugApi.ts` (core hooks only).
- **Consumes:** `__academy.*` hooks (`src/core/DebugApi.ts`), `__academy.ext` entries registered by the feature WPs.
- **Provides:** the tool contract of §5.10 by day 5. Order: `views`, `drawcalls --ledger`, `save-migrate`, `i18n-audit`, `watch-audit`, `flash-check` first; then the rest. Also: the updated `playtest` (no 54/54 assumption, the pool from `__academy`, the three systems of D23 per mode), `onboarding-run` (no ascent), `ending-check` (ground ↔ air), `dist-ref`.
- **Acceptance (exact commands):**
  - `node tools/gates.mjs --tier merge` on `phase7` HEAD (rc4 content) → green in ≤ 25 min
  - `node tools/gates.mjs --tier wave` → green or a listed known miss
  - `node tools/flash-check.mjs --selftest` → a flashing test page fails · `node tools/watch-audit.mjs --selftest` → a seeded 12 s stretch fails
  - `node tools/drawcalls.mjs --views bridgehead,plaza --ledger` → prints every owner; a seeded extra draw fails
  - `node tools/save-migrate.mjs` with WP1's fixtures · `node tools/i18n-audit.mjs` → a seeded missing EN key fails
  - `node tools/dist-ref.mjs rc4` → `artifacts/dist/rc4` builds

#### WP12 · Rotors and start flow (island owner)

- **Wave · branch · worktree:** 1 · `p7/wp12` off `p7-w0` · `../academy-island-wt/wp12`
- **Size · tier:** 9 builder-days (+1 for the three systems, D23) · MUST
- **Depends on:** WP1 (`ctx.quest`), WP3 (`GroundHandle`), WP4 (`setAltitude`, layout), WP2 (env); all as stubs from day 2.
- **Goal:** the grounded start and the spine of the three systems (D23), playable at p7-w1: Probestart, glide, bridge spawn, onboarding per mode, the Libelle panel (six rotor lamps, the Startakku bar, the nav lamp), crown beacons and the needle light, the Entscheider Bodencrew supply, ignition beats, the island side of the charge and upload beats, the 6/6 and Startklar beats, KIEL at 4/6, the Revier gate and Kanzel pads, the docked gust rule, and the Schauhalle footprint.
- **Owns:** `src/world/index.ts` (body; the Phase 7 block lines belong to their WPs), every file directly in `src/world/` except `layout.ts` and `sky.ts`, `src/world/tower/**`, `src/world/landscape/**` except `pods.ts`, `rovers.ts` and `drones.ts`, new `src/world/start/**`, `tools/beats-check.mjs`.
- **Consumes:** `QuestApi` (`src/core/quest/types.ts`, WP1); `GroundHandle.spray / setGate / setSign / catchGust` (`src/world/ground/index.ts`, WP3); `ctx.island.setAltitude`, `ctx.flight`, `ROUTES`, `TROCKENDOCK`, `KANZEL_PADS` (WP4); `ctx.env` (WP2); manifests (`route`, `system`, `systemLabel`).
- **Provides:** the per-rotor rate and air-strength API for WP13 (`island.rotors.setRate(i, r)`, `island.rotors.setAir(i, s)`); `radio.say(owner, line)`; `objective:changed`; the Libelle panel states and its lamp/bar geometry and material for WP13's console; island tracker rows that stow on `flight:phase` 'downwash'.
- **Spec:** §1.2, §3.2, §3.3, §4.1, §5.3 rule 4, §2.3 (Schauhalle footprint, shuttle pod).
- **Build:**
  1. Probestart: the lever, `toyGust()` + `setAltitude(0.3)` + tilt; the Libelle panel with the three systems (one InstancedMesh, 17 instances: six lamps, the 10-segment Startakku bar, the nav lamp; labels in the existing text draw); the ball; the southern spray puff; the rotor cough; readout, the „what is missing“ lines and cooldown; the Entscheider Bodencrew supply during the second line (and at once after a mode switch); `markProbestart()`; reduced-motion variant.
  2. Glide: 6 s, first visit only; retire the ascent.
  3. Bridge-head spawn.
  4. Onboarding: objectives per mode from `ROUTES` and the manifest `route` roles; side stations get the grey chip.
  5. Crown beacons and the Libelle panel; the needle light as the nav lamp for everyone (its own material instance, no new program); the „BODENCREW“ plates; underside duct rings.
  6. Ignition beats (`markBeat`), the island side of the charge and upload beats (T3/T2 ignition, bar, nav lamp, needle light, toasts, radio), the B-◆ pointer hooks (the zones play their own lines), the 6/6 beat and the Startklar beat (merged when M-last), KIEL at 4/6 (`lift.ts`); the foyer board with the three systems.
  7. The Revier gate and the Kanzel pads (`transit.ts`, 3.0 s hops), dark when airborne.
  8. Libelle BODEN → LAGE at M2; telemetry; plaques; the bridge-head plaque.
  9. The docked gust rule (no tilt; `catchGust`).
  10. Footprint: clear `PV_FIELDS[2,3]`, the inlays and lanes inside the hall rect; the 8 tracker segments on the hall roof frame at y 9.3 per WP11's spec (frame outline in §2.3; WP11 confirms on day 2 of wave 2, and WP12 adjusts on fix duty); the Landedeck railing gap at the bridge; remove the rc4 shuttle pod.
- **Acceptance (exact commands):**
  - `node tools/onboarding-run.mjs --lang de --mode entdecker` and `node tools/onboarding-run.mjs --lang en --mode entscheider` → first mechanic ≤ 30 s, first zone ≤ 65 s · `node tools/onboarding-run.mjs --lang de --mode entdecker --idle 10` → movement card · `node tools/onboarding-run.mjs --lang de --mode entdecker --returning` → no glide, resume at the gate
  - `node tools/beats-check.mjs` → each ignition beat once across reloads; the Revier gate opens at 1/6, KIEL at 4/6; the Libelle lamps match the crown in every state; the Startakku bar shows round(charge × 10) segments and the nav lamp and the needle light match NAV in every seeded state; Entdecker: the Probestart fails at 6/6 without AKKU or NAV and names what is missing; Entscheider: AKKU and NAV show crew-teal with the BODENCREW plate after the Probestart and never a halo; the 6/6 beat and the Startklar beat fire once each (merged when M6 is last, separate when NAV is last); no tilt while docked (seeded gusts); reduced motion: no tilt, no shake, no world sink
  - `node tools/drawcalls.mjs --views bridgehead,plaza --ledger` → world ≤ 110 / ≤ 95
  - `node tools/shots-all.mjs --rm` → the reduced-motion start screenshots
  - `node tools/flash-check.mjs --sequence spray` (the 6/6 and Startklar pulses included)
  - `node tools/gates.mjs --tier merge`

### 6.6 Wave 2 (content; 8 builders; ≈ 14 working days)

Merge order: WP8 → WP6 → WP9 → WP14 → WP15 → WP10 → WP11 → WP13. Tag `p7-w2`. G-LOOK was approved on 2026-10-18 with three fixes (D42), which are wave-2 work: **WP3 on fix duty** (its own files): the ground palette to the §2.7 tokens, the pit lake's far banks visible from the Ausguck, terraced pit banks and a wooded spoil heap in the heights bake; **WP14**: the retired bucket-wheel excavator of D43 placed as the Revier's landmark where the Ausguck sees it. Checkpoints:
- **Day 4, G-FARM:** WP9 delivers one Sonnenacker still with final materials. Non-blocking: if the founder has not answered within 3 working days, WP9 proceeds on §2.7 and the founder reviews at p7-w2.
- **Day 6, controls:** 3 players try the SO-101 teleop, the humanoid piloting, the duck sliders and the Kanzel hops; controls are fixed before the stars are calibrated.
- **Day 8, route on block-out:** 2 first-time players play the full Entdecker route on block-out art. If the median is > 100 min, the second cut tier of §1.3 is applied.

#### WP6 · Lern-Dojo: SO-101 VLA

- **Wave · branch · worktree:** 2 · `p7/wp6` off `p7-w1` · `../academy-island-wt/wp6`
- **Size · tier:** 9 builder-days · MUST
- **Depends on:** WP0 (`so101`, `so101-leader`), WP4 (`ctx.robots`, operate capture), WP1 (rev via manifest, `unattended`, chips).
- **Goal:** SO-101 leader/follower teleop (A), language commands with two route cards and two discovery cards (B ◆), data audit (C).
- **Owns:** `src/zones/lern-dojo/**` (incl. `manifest.ts` with `rev: 2` on all three stations, `tuning.ts`), `tools/lerndojo-check.mjs`.
- **Consumes:** `ctx.robots.load('so101' | 'so101-leader')`, `RobotModel.solveIK`, `getLinkWorldMatrix` (WP4/WP0); `ctx.game.unattended` (WP1); `quest:system` M4 for the pointer line.
- **Spec:** §4.5, §3.2 (request), §3.3 (pointer line), R1 §10–§11.
- **Acceptance (exact commands):**
  - `node tools/lerndojo-check.mjs` → R1 §11: the follower within 2° after 0.3 s; a demo ends when the cube rests in the box; one-cube demos pick by position in ≥ 9/10 seeds; after ≥ 4 two-colour demos it picks blue in ≥ 9/10; Abendlicht and Kamera fail, then recover after their fixes
  - `npm run typecheck:zone -- lern-dojo`
  - `node tools/perf.mjs --quality high` view `lerndojo-b` → zone ≤ 80 draws
  - `node tools/watch-audit.mjs --zones lern-dojo` · `node tools/text-audit.mjs --zones lern-dojo --chips` in all four language/mode runs
  - `npm run playtest -- --lang de --mode entdecker --quick` and `npm run playtest -- --lang en --mode entscheider --quick` → 04 stamps, cards #6 #8, the Entscheider path ≈ 3.5 min by bot
  - `node tools/save-migrate.mjs` → the rev resets
  - `node tools/gates.mjs --tier merge`; bot star calibration recorded in the commit message

#### WP8 · Island zone fixes (01, 03, 05, 06)

- **Wave · branch · worktree:** 2 · `p7/wp8` off `p7-w1` · `../academy-island-wt/wp8`
- **Size · tier:** 9 builder-days · MUST
- **Depends on:** WP0 (`so101` + R3 inertials), WP1, WP4.
- **Goal:** 03 C Lastdiagramm ◆ and the retirement of 200 Griffe; the 03 A/B changes; the 01 A gag and the 01 C reach; 05 B one wall (side station) and 05 C dials; the 06 A rule, 06 B card #2, 06 C short (side station); the requests for 01, 03, 05 and 06.
- **Owns:** `src/zones/{sensordom,greifwerkstatt,dunkelfabrik,prueffeld}/**` (manifests: `route.entdecker: 'side'` on `dunkelfabrik.schichtplan` and `prueffeld.drei-auditoren`, `rev: 2` on `prueffeld.drei-auditoren`, `greifwerkstatt.lastdiagramm` as ◆ with `system: 'M3'`), the `retired.ts` line `greifwerkstatt.griffe`, `tools/lastdiagramm-check.mjs`.
- **Consumes:** `ctx.robots.load('so101')`, `info('so101').inertials` (WP4/WP0); `ctx.game.unattended`, chips (WP1).
- **Spec:** §4.2, §4.4, §4.6, §4.7, §3.2.
- **Acceptance (exact commands):**
  - `node tools/lastdiagramm-check.mjs` → stretched Nenn payload 0 g; Spitze band 190–260 g; the gear task solvable under Nenn
  - `npm run playtest -- --lang de --mode entdecker` and `npm run playtest -- --lang en --mode entscheider` → cards 1–9 in both routes; 06 C κ round 1 < 0.8 and ≥ 0.8 after the rule; the side stations show the grey chip and are skipped by the objective
  - `for z in sensordom greifwerkstatt dunkelfabrik prueffeld; do npm run typecheck:zone -- $z || exit 1; done`
  - `node tools/text-audit.mjs --zones sensordom,greifwerkstatt,dunkelfabrik,prueffeld --chips` (four runs) · `node tools/watch-audit.mjs --zones sensordom,greifwerkstatt,prueffeld`
  - `node tools/save-migrate.mjs` → `griffe` goes to legacy; an rc4 save with `griffe` earned leaves M3 kalt
  - `node tools/gates.mjs --tier merge`

#### WP9 · Sonnenacker

- **Wave · branch · worktree:** 2 · `p7/wp9` off `p7-w1` · `../academy-island-wt/wp9`
- **Size · tier:** 12 builder-days (+1 for the Startakku, D23) · MUST
- **Depends on:** WP4 (site plots, `ctx.frames.heightAt`), WP3 (terrain), WP0 (`so101` LOD2 + `bodies()`, `lekiwi-base` if green), WP1, G-LOOK.
- **Goal:** the agrivoltaic tomato farm that harvests tomatoes and power: three stations, the 12 + 6 arms and their shift, LeKiwi rovers, tracker rows that stow, EMI-08, egg 24, the Tomatenkapsel lesson hook, and the island's **Startakku** (ENERGIE, D23). That means the dashboard bar „STARTAKKU · TROCKENDOCK 3“ (a third per stamp; it fills with the day's kWh during „Erntetag“ and locks at 100 % on the ◆), the farm side of the charge beat with EMI-08's lines, the honest card (FIKTION bar, RICHTWERT kWh, never converted) and the „Erntetag“ Kurzlauf recording for the Schaufenster.
- **Owns:** `src/zones/sonnenacker/**` (incl. the arms, the shift state machine, rovers, trackers, analytic stripe shadows, `tuning.ts`; manifest `system: 'AKKU'`, `trim: 'T3'` on the ◆ `erntetag`), `tools/agripv-check.mjs`, `tools/sonnenacker/**` (`kurzlauf.mjs`).
- **Consumes:** `ctx.frames.heightAt`, `onSuspend/onResume` (WP4); `ctx.robots.bodies('so101', 2)`, `load` (WP4/WP0); `ctx.quest.snapshot().start.energy` and `quest:charge` (WP1) for the dashboard bar; `flight:phase` 'downwash' and `life:react` 'liftoff' (WP13/WP15).
- **Provides:** `sonnenacker:shift` events (`{ phase, arms: { id, state, at }[] }`) for WP15; the `hail` flash sequence; the takeaway line in its manifest; the Kurzlauf data via `node tools/sonnenacker/kurzlauf.mjs --out src/zones/schauhalle/kurzlauf/erntetag.json` by day 9 (committed by WP11).
- **Spec:** §4.10, §3.3 (charge beat), §2.7, §2.8, §4.15 (tracker wave).
- **Acceptance (exact commands):**
  - `node tools/perf.mjs --quality high` view `sonnenacker-c` and `node tools/drawcalls.mjs --views sonnenacker-c --ledger` → site ≤ 70 draws, ≤ 130 k triangles, ≤ 260 total
  - `node tools/perf-cpu.mjs --rates 1,4 --views sonnenacker-c` → site update ≤ 1.0 ms at 1×; ≤ 9.5 ms total at 4×
  - `node tools/agripv-check.mjs` → T, Y_crop band, Y_el and LER match R8 §2.3 (LER 1,53–1,62 at T 0,70; the densest roof fails DIN)
  - `node tools/frames-check.mjs --area sonnenacker` → suspended when airborne, resumed docked
  - `node tools/watch-audit.mjs --zones sonnenacker` · `node tools/flash-check.mjs --sequence hail` · `node tools/text-audit.mjs --zones sonnenacker --chips` (four runs)
  - `npm run typecheck:zone -- sonnenacker` · `npm run playtest -- --lang de --mode entdecker --quick` → three stamps; `start.energy.charge` ⅓ → ⅔ → 1, AKKU bereit with `by: 'player'`, T3 an; the dashboard bar at 100 % on the result; `npm run playtest -- --lang en --mode entscheider --quick` with the optional detour → `by` turns from `'crew'` to `'player'`
  - the `text-audit --chips` runs above also find FIKTION on the Startakku bar and RICHTWERT on every kWh figure
  - `node tools/sonnenacker/kurzlauf.mjs --out src/zones/schauhalle/kurzlauf/erntetag.json` → a 30 s stand's data, the 8× day ≤ 10 s
  - the G-FARM still in `artifacts/phase7/lookdev/` by day 4
  - `node tools/gates.mjs --tier merge`

#### WP10 · Traumhangar

- **Wave · branch · worktree:** 2 · `p7/wp10` off `p7-w1` · `../academy-island-wt/wp10`
- **Size · tier:** 14 builder-days (after WP2's spike) · MUST
- **Depends on:** WP0 (Unitree four, LOD2), WP4 (`ctx.robots`, operate capture, site plots), WP1 (mastery), WP2 spike.
- **Goal:** the hangar, humanoid piloting, the toy world model, stations A/B/C, the Traum-Probefahrt and the H2 Generalprobe; deliveries; egg 12; and the island's **Flugmodell** (NAVIGATION, D23). The C ◆ installs the mix with the best closed-loop result as NAV, through the hangar side of the upload beat (the dream tiles fold into the roof-mast line), its checklist value and the honest card (§4.8).
- **Owns:** `src/zones/traumhangar/**` (moves the spike code in and deletes `src/zones/_traum-spike/**`; manifest `system: 'NAV'`, `trim: 'T2'` on the ◆ `traumdaten`), `tools/traum/**` (incl. `kurzlauf.mjs`), `tools/traum-check.mjs`.
- **Consumes:** `ctx.robots.load('unitree-r1' | 'unitree-g1' | 'unitree-h1-2' | 'unitree-h2')`, LOD2 ghosts (WP4/WP0); `enterOperate({ capture })` (WP4); `ctx.quest.snapshot().mastery` (WP1).
- **Provides:** the Kurzlauf data via `node tools/traum/kurzlauf.mjs --out src/zones/schauhalle/kurzlauf/traumdaten.json` by day 9 (committed by WP11); delivery events `traumhangar:delivered` { robot }; the `traum-glitch` flash sequence.
- **Spec:** §4.8, §3.1 (mastery).
- **Acceptance (exact commands):**
  - `node tools/perf-cpu.mjs --rates 4 --views traumhangar-ghost` → ghost moment ≤ 9 ms
  - `node tools/drawcalls.mjs --views traumhangar-ghost --ledger` → ≤ 120 draws; robots ≤ 70 k triangles
  - `node tools/traum-check.mjs` → the hump peaks at 2 s among 0,5 / 2 / 8 s; Stillstand wins offline; the installed Flugmodell is the best closed-loop mix and never Stillstand or the offline winner; the mastery gate opens exactly at the D21 rule (63 of 84 + ★★★ A–C); the H2 unveils once
  - `node tools/flash-check.mjs --sequence traum-glitch` · `node tools/watch-audit.mjs --zones traumhangar` · `node tools/text-audit.mjs --zones traumhangar --chips` (four runs)
  - `node tools/shots-all.mjs --rm` → the head camera is stable and the chase camera is the default under reduced motion
  - `npm run typecheck:zone -- traumhangar` · `npm run playtest -- --lang de --mode entdecker --quick` → three stamps, NAV bereit with `by: 'player'` and the needle light teal, T2 an, three deliveries
  - `node tools/gates.mjs --tier merge`

#### WP11 · Schauhalle Nord

- **Wave · branch · worktree:** 2 · `p7/wp11` off `p7-w1` · `../academy-island-wt/wp11`
- **Size · tier:** 13 builder-days (the third Kurzlauf stand reuses the stand code) · MUST
- **Depends on:** WP0 (all hall robots, R6 line-up), WP4 (rect tiers, interior, `ctx.robots`), WP1 (secrets, stars, pool), WP5, WP9 and WP10 (Kurzlauf data), WP12 (footprint, roof rows).
- **Goal:** the car-dealership hall: robots with Vorführung loops, datasheets with price bands and conditions, the Größenwand, the Kistenwaage, the compare stage, Inspektion with the LOD governor, the Tresor, deliveries, the Lastenheft (first visit on the route), the Pannen-Wand, the Fundvitrine, the credits-room shell, the SELBST BAUEN pylon, the Entscheider Schaufenster with three Kurzlauf stands („Belohnung“, „Erntetag“, „Traumdaten“; D41 as amended by D23).
- **Owns:** `src/zones/schauhalle/**` (incl. `data/{robots,prices,clips}.ts`, `kurzlauf/*`, `tuning.ts`), `tools/hall-check.mjs`.
- **Consumes:** `ctx.robots.load / loadSilhouette / animate / untrack / progress` (WP4); `info(id)` licence rows (WP0 manifest); `ctx.game.secrets.object()` (WP1); `ctx.quest.snapshot()` and `unveilH2()` (WP1); `traumhangar:delivered` (WP10); `quest:system` for rotor deliveries.
- **Provides:** the roof-frame spec to WP12 on day 2 (outline, height, the 8 tracker mounts); the Schaufenster objective step for the Entscheider route.
- **Spec:** §4.9, §1.3 (first visit), §1.4 (Schaufenster), §5.6.
- **Acceptance (exact commands):**
  - `node tools/drawcalls.mjs --views schauhalle --ledger` → hall ≤ 80, total ≤ 180
  - `node tools/perf.mjs --quality high` view `schauhalle` → ≤ 300 k hall triangles; GPU via `node tools/gpu-ab.mjs --views schauhalle --runs 3 --dist head=artifacts/dist/head` ≤ 5.0 ms
  - `node tools/hitches.mjs --runs 1` → deliveries and LOD swaps link 0 programs on first-show frames
  - `node tools/hall-check.mjs` → 20 (21) cards ≤ 35 words at open; every number chipped; a price basis and date on every plate; the disclaimer present; the governor never exceeds 2 × LOD0 / 8 × LOD1; each delivery happens once; the Vorführung plays once per approach
  - `node tools/text-audit.mjs --zones schauhalle --chips` (four runs)
  - `npm run playtest -- --lang en --mode entscheider` → the Schaufenster ≤ 3.0 min by bot, with all three Befundkarten in the PNG set · `npm run playtest -- --lang de --mode entdecker --quick` → the first-visit Lastenheft stamp
  - `npm run typecheck:zone -- schauhalle` · `node tools/gates.mjs --tier merge`

#### WP13 · Startprüfung and lift-off

- **Wave · branch · worktree:** 2 · `p7/wp13` off `p7-w1` · `../academy-island-wt/wp13`
- **Size · tier:** 13 builder-days (+1 for the three systems in the lift-off, D23) · MUST
- **Depends on:** WP1, WP2, WP3, WP4, WP12 (wave 1); WP9, WP14, WP15 via events; G-LOOK for final art.
- **Goal:** the renamed finale with F1 Schwebetest, the F3 choice that flies (signing arms only when Startklar), the lift-off director with throttle, outside shots, the tracker wave, the crowd, captions, audio, RM stills, skip, replay, the dock switch, and the certificate front and back. Also the three systems in the lift-off (D23): the checklist card in three blocks, the console with the six lamps, the full Startakku bar (stepping down at the spin-up) and the nav lamp that switches to active at h 280, and the Flugmodell's teal ghost horizon 2 s ahead inside the cloud (TRAUM; static under reduced motion).
- **Owns:** `src/world/finale/**` (incl. `finale/liftoff/**`), `tools/f2-seeds.mjs`; the full `tools/liftoff-check.mjs` checks (with WP7).
- **Consumes:** `ctx.island.setAltitude`, `ctx.flight` (WP4); `ctx.env.setFlight / sunBlocked / holdEnvMap / rebuildEnvMap`, `ctx.audio.setAmbienceFilter`, `sky.reveal` (WP2); `GroundHandle.setArms / setBridge / spray / outsideCamera` (WP3); `island.rotors.setRate / setAir`, `radio.say`, the Libelle panel's lamp/bar geometry and material (WP12); `QuestApi.setFlight`, `snapshot().start`, `values.ts` (WP1); `liftoff:replay` (WP1).
- **Provides:** `flight:phase` { name: 'spinup' | 'release' | 'liftoff' | 'downwash' | 'shade' | 'lid' | 'cloud' | 'breakout' | 'level' | 'dusk', t, h, r? }; the `liftoff` flash sequence; `life:react` 'gather' when armed and on the Ausguck.
- **Spec:** §4.14, §4.15, §2.8 (certificate back side), §5.3.
- **Acceptance (exact commands):**
  - `node tools/liftoff-check.mjs` · `node tools/liftoff-check.mjs --rm` · `node tools/liftoff-check.mjs --skip` · `node tools/liftoff-check.mjs --replay` → ≤ 320 draws per beat, no frame > 33 ms, the program gate, env rebuilds ≤ 1, ≤ −10 dBFS; airborne across a reload; releasing E pauses the climb and EMI takes over after 6 s; the sky dressing is first visible after the break-out; the downwash front reaches the farm rows; the console shows the three systems ready (crew plates in Entscheider mode); the nav lamp is active before the first whiteout frame; the ghost horizon is visible only inside the cloud and adds ≤ 2 draws; with `--rm` it is a still
  - `node tools/flash-check.mjs --sequence liftoff` and `--sequence liftoff --rm` → ≤ 3 flashes/s
  - `node tools/ending-check.mjs --lang de` · `npm run playtest -- --lang de --mode entdecker` and `npm run playtest -- --lang en --mode entscheider` → certificate front and back, with the Startakku and Flugmodell line („selbst“ in Entdecker, „von der Bodencrew“ in Entscheider)
  - `node tools/f2-seeds.mjs --seeds 5` → F2 targets unchanged
  - `node tools/perf-cpu.mjs --rates 4 --views climb` → director ≤ 0.3 ms at 1×
  - `node tools/gates.mjs --tier merge`

#### WP14 · Revier and use-case scenes

- **Wave · branch · worktree:** 2 · `p7/wp14` off `p7-w1` · `../academy-island-wt/wp14`
- **Size · tier:** 11 builder-days · MUST
- **Depends on:** WP3, WP4, WP1 (`MapPanel.addLayer`, `resumeArea`), WP2 (`registerLoopKind`), G-LOOK.
- **Goal:** the Revier around the dock: site placement, paths and pads, the far-ring impostors, the map layer, the Grubenrand with the Revier-Chronik, the two MUST scenes (Kreislaufhof, Unkrautacker), EMI-09, the region sound beds.
- **Owns:** `src/world/region/**`, `src/ui/map/region.ts`, `src/zones/{kreislaufhof,unkrautacker}/**`, `tools/region-check.mjs`.
- **Consumes:** `GroundHandle` (WP3); site plots and `ctx.frames.heightAt` (WP4); `MapPanel.addLayer`, `QuestApi.resumeArea` (WP1); `flight:phase` 'downwash' (WP13: the PV fences of the Unkrautacker are vertical and do not stow; the scenes only react).
- **Provides:** the region exteriors and far tiers within the ledger; the takeaway lines in the two scene manifests.
- **Spec:** §2.2, §2.3, §2.7, §2.8, §4.11, §5.6 (region chunk).
- **Acceptance (exact commands):**
  - `node tools/drawcalls.mjs --views sonnenacker-c,kreislaufhof --ledger` → region ≤ 140 draws / ≤ 550 k on the worst ground view
  - `node tools/drawcalls.mjs --views plaza,ausguck --ledger` → region from the island ≤ 20 (plaza) / ≤ 30 (Ausguck), ≤ 120 k
  - `node tools/region-check.mjs` → every path walkable from its pad; the Grubenrand board readable; a ground resume loads the region before the title
  - `node tools/frames-check.mjs --area kreislaufhof,unkrautacker` → suspended airborne
  - `node tools/watch-audit.mjs --zones kreislaufhof,unkrautacker` · `node tools/text-audit.mjs --zones kreislaufhof,unkrautacker --chips` (four runs)
  - `node tools/load-size.mjs --chunks` → the region chunk ≤ 120 KB, each scene ≤ 80 KB
  - `for z in kreislaufhof unkrautacker; do npm run typecheck:zone -- $z || exit 1; done` · `node tools/gates.mjs --tier merge`

#### WP15 · Life and easter eggs

- **Wave · branch · worktree:** 2 · `p7/wp15` off `p7-w1` · `../academy-island-wt/wp15`
- **Size · tier:** 10 builder-days · MUST
- **Depends on:** WP1 (secrets), WP3, WP9 (`sonnenacker:shift`), WP13 (`flight:phase`, 'gather'), WP12 (radio).
- **Goal:** the LifeDirector and Hof-Takt; 8 people with jobs; reactive rovers; bees; region reactions; the apron crowd and the crew member at the Ausguck; the Tomatenkapseln; the 9 MUST eggs and their Fundvitrine objects.
- **Owns:** `src/world/life/**`, `src/world/eggs/**`, `src/world/landscape/{pods,rovers,drones}.ts`; the egg content of `tools/secret-audit.mjs` (with WP7).
- **Consumes:** `ctx.game.secrets.register / registerObject` (WP1); `GroundHandle` (WP3); `sonnenacker:shift` (WP9); `flight:phase`, `life:react` (WP13); `quest:system` (rotor reactions, the Tomatenkapsel light on T3).
- **Provides:** `LifeDirector` (island module); `life:react` handling; the vitrine objects by id.
- **Spec:** §4.12, §4.13.
- **Acceptance (exact commands):**
  - `node tools/drawcalls.mjs --views bridgehead,plaza,sonnenacker-c --ledger` → life ≤ 6 / ≤ 4 / ≤ 20 draws
  - `node tools/perf-cpu.mjs --rates 1 --views plaza,sonnenacker-c` → life ≤ 0.25 ms at 1×
  - `node tools/secret-audit.mjs --runs 30` → curiosity-bot median ≥ 5 finds and ≥ 1 in the first 10 min in ≥ 4 of 5 runs (else egg 1 or 25 moves in)
  - `node tools/idle-render.mjs` → 0 renders paused; `node tools/memory-lap.mjs` → the director does not run while paused
  - `node tools/liftoff-check.mjs` → the crowd stands on the apron in C1; the crew member at the rail
  - `node tools/gates.mjs --tier merge`

### 6.7 Wave 3 (polish, SHOULD, release; ≈ 7 working days)

Merge order: WP17 fixes → WP16 (only if p7-w2 landed on time) → WP20 tuning → WP18 → WP19. Tag `p7-rc5`. The wave-2 owners are on fix duty (their findings, inside their own paths).

#### WP16 · SHOULD content

- **Wave · branch · worktree:** 3 · `p7/wp16` off `p7-w2` · `../academy-island-wt/wp16`
- **Size · tier:** 12 builder-days · SHOULD (starts only if p7-w2 lands on time)
- **Goal:** the Feldbahn + Bahnhof + Dorf scene, the SHOULD life (L6, L9–L14, L16, the copter crate aboard), the SHOULD eggs and region extras, the Seeblick, the compare-stage extras (as requests to WP11 on fix duty).
- **Owns:** `src/zones/dorf/**`, `src/world/region/rail/**`, `src/world/life/should/**`, `src/world/eggs/should/**`.
- **Consumes:** `RAIL` (layout, WP4), `LifeDirector` (WP15), `ZoneSecrets` (WP1), site plots (WP4).
- **Acceptance:** `npm run typecheck:zone -- dorf` · `node tools/drawcalls.mjs --views bridgehead,plaza --ledger` unchanged against p7-w2 · `node tools/secret-audit.mjs --runs 30` · `node tools/watch-audit.mjs --zones dorf` · `node tools/gates.mjs --tier merge`.

#### WP17 · Perf and look

- **Wave · branch · worktree:** 3 · `p7/wp17` off `p7-w2` · `../academy-island-wt/wp17`
- **Size · tier:** 5 builder-days · MUST
- **Goal:** the worst views, the low tier, the `gpu-ab` margins, the `hitches` first lap with robots, the lift-off on an integrated-GPU profile.
- **Owns:** engine files (`src/core/**`) with the WP4/WP2 owners' review; content fixes go to the owning WP on fix duty.
- **Acceptance:** `node tools/gates.mjs --tier wave` green on `phase7`; `node tools/perf.mjs --quality low`; `node tools/hitches.mjs --runs 3` and `node tools/hitches.mjs --runs 1 --browser webkit`; `node tools/gpu-ab.mjs --views plaza,clouddown,bridgehead,ausguck,schauhalle --runs 5 --dist rc4=artifacts/dist/rc4 --dist head=artifacts/dist/head`.

#### WP18 · Copy, facts, docs

- **Wave · branch · worktree:** 3 · `p7/wp18` off `p7-w2` · `../academy-island-wt/wp18`
- **Size · tier:** 6 builder-days · MUST
- **Goal:**
  - the facts register (RELEASE §5) for every new number with its source (SO-101, Open Duck, Unitree, the showroom robots, agrivoltaics, harvest robots, use cases, history cards);
  - the secondary price sources (`src/zones/schauhalle/data/prices.ts`);
  - GLOSSARY: HERSTELLERANGABE, MODELL, TRAUM, „humanoider Roboter“ for third-party robots, Startprüfung, Schwebetest, Haltearme, Revier, Sonnenacker, Traumhangar, Schauhalle, Fundvitrine, Bodencrew, Startklar, Auftrieb · Energie · Navigation, Startakku, Flugmodell; the EMI line „Wir haben neun.“;
  - GDD as-built, ARCHITECTURE (the seams, frames, `ctx.robots`, the manifest split), README.
- **Owns:** `docs/**` (except RELEASE §1–§3), copy edits in any `strings.ts` (no keys added or removed; the owner informed), `src/zones/schauhalle/data/prices.ts`.
- **Acceptance:** `node tools/text-audit.mjs --chips` in all four runs · `node tools/i18n-audit.mjs` · `node tools/glyph-check.mjs` · every new number traceable in the facts register.

#### WP19 · QA and release

- **Wave · branch · worktree:** 3 · `p7/wp19` off `p7-w2` · `../academy-island-wt/wp19`
- **Size · tier:** 6 builder-days · MUST
- **Goal:** §8: the full gates, the human sessions, the legal package, the photosensitivity and motion review, the release gallery, `docs/RELEASE.md` §1–§3 for rc5.
- **Owns:** `docs/RELEASE.md` §1–§3, `artifacts/phase7/release/**`.
- **Acceptance:** `node tools/gates.mjs --tier wave` green · `node tools/gallery.mjs --out artifacts/phase7/release` · `node tools/deploy-check.mjs --preview` · the §8.2 sessions recorded · the §8.3 package ready for the founder.

#### WP20 · Fun tuning

- **Wave · branch · worktree:** 3 · `p7/wp20` off `p7-w2` · `../academy-island-wt/wp20`
- **Size · tier:** 4 builder-days · MUST [C2 M11]
- **Goal:** tune the ten key moments by watching people play: Probestart, first ignition, 6/6, the duck belly flop, „it picks blue“, the first humanoid step, the 18 kg refusal, the Herztomate, the first delivery, the lift-off.
- **Owns:** `src/**/tuning.ts` only.
- **Acceptance:** `npm run playtest -- --lang de --mode entdecker` and `npm run playtest -- --lang en --mode entscheider` green after every change · `node tools/watch-audit.mjs` · the round-2 session of §8.2 within the pass rules.

---

## 7. Scope tiers, effort and the cut order

| Tier | Content | Builder-days |
|---|---|---|
| **MUST** | wave 0: WP0 rest ≈ 7 + WPS 3 · wave 1: WP1 11, WP2 9, WP3 10, WP4 9, WP5 11, WP7 10, WP12 9 = 69 · wave 2: WP6 9, WP8 9, WP9 12, WP10 14, WP11 13, WP13 13, WP14 11, WP15 10 = 91 · wave 3: WP17 5, WP18 6, WP19 6, WP20 4 = 21 · integration 1 + 4 + 4 + 3 = 12 | **≈ 203** |
| Contingency | ≈ 20 %: fix duty, bot extensions, the calibration rounds [C1 M16] | **≈ 40** |
| *Amendment 2026-10-17 (D23)* | the three systems add 3 builder-days: WP12 +1 (the Libelle panel, the needle light, the crew supply, the Startklar beat), WP9 +1 (the Startakku bar, the charge beat, the Kurzlauf recorder) and WP13 +1 (console, checklist blocks, the ghost horizon). WP1 (two rows in the system table and one mode rule), WP10 (installing the best mix) and WP11 (a third stand on the existing stand code) absorb theirs. Wave lengths and the calendar are unchanged | included above |
| SHOULD | WP16 12 + the Profi-Ente spike (Open Duck ONNX policy on our physics, R2 option E) 2 | ≈ 14 |
| COULD | Holzbau and Windkamm scenes, configurator (Spot arm, G1 hands), COULD eggs, L15/L20 | ≈ 15 |

**Calendar with 8 builders:**

| Wave | Working days |
|---|---|
| Wave 0 | 3 + 1 integration |
| Wave 1 | 12 + 2 integration |
| Wave 2 | 14 + 2 integration |
| Wave 3 | 7 + 2 integration |
| **Total** | **≈ 43 working days ≈ 9 weeks** for MUST; **≈ 10–11 weeks** with the contingency |

SHOULD fits into wave 3 only if wave 2 lands on time. Expected use of the cut order: item 1 is planned; items 2 and 3 apply if wave 2 slips by more than 3 days.

**Cut first, in this order, if it runs long:**
1. every SHOULD/COULD item not started;
2. the Schauhalle compare stage (keep Inspektion);
3. the Sonnenacker B hail event;
4. the duck C3 retraining as live runs (the ★★★ bar from recordings);
5. the Traumhangar B Messlauf down to 2 horizons;
6. people from 8 to 6 (D18 allows 6);
7. the H2 Generalprobe's gust and second crate (keep the 5 kg task and „Ablehnen“ on the card);
8. the Unkrautacker scene (keep the Kreislaufhof);
9. the C2 outside shot (keep C1).

**Never cut:**
- the spine with its three systems (lift, energy, navigation; D23) and the grounded start with the Libelle panel;
- the two ground ◆ that supply energy and navigation (Sonnenacker C „Erntetag“, Traumhangar C „Traumdaten“);
- the lift-off with the tracker wave, the apron crowd in C1 and the Flugmodell's ghost horizon in the cloud;
- the four founder asks: SO-101 VLA, duck RL, the Unitree ladder with the H2, and the showroom incl. its first visit and the Entscheider Schaufenster;
- the Sonnenacker;
- people;
- the three nice-future touchpoints (§2.8).

---

## 8. QA plan and release checklist additions

### 8.1 Gates

The two tiers of §6.3: `node tools/gates.mjs --tier merge` on every merge request and integrator merge; `node tools/gates.mjs --tier wave` nightly and before every tag. A wave tag needs the wave tier green, or a known miss listed in the status table with its owner.

### 8.2 People (no prompting; local JSON exports only, nothing sent)

| Session | When | Who | What is measured | Pass |
|---|---|---|---|---|
| H-TIME | waves 0–1 (results by wave-1 day 8) | 2 first-time players on rc4 | minutes per station, retries by choice, where reading stops | recalibrates §1.3 and wave 2 [C2 M1] |
| G-LOOK | wave 1, day 5 | founder | one ground still of three (bridge head, Ausguck, Sonnenacker block-out) | approved |
| G-FARM | wave 2, day 4 | founder | one Sonnenacker still with final materials | non-blocking (3-day timeout) |
| Controls | wave 2, day 6 | 3 players | SO-101 teleop, humanoid piloting, duck sliders, Kanzel hops | no control blocks a ★ |
| Route on block-out | wave 2, day 8 | 2 first-time players | the full Entdecker route: minutes, retries, reading | median ≤ 100 min, else the second cut tier |
| Fun and time, rounds 1 and 2 | wave 3 (WP20, WP19) | 5–6 first-time players each, mixed ages incl. teenagers | the ten key moments; minutes per station and route; ★★/★★★ that feel unfair or trivial; secrets found | Entdecker median **80–100 min**; ≥ 1 secret in 10 min for 4 of 5; median ≥ 5 secrets |
| Entscheider | wave 3 | 2–3 managers | route time, Befundkarten understood | median **≤ 30 min** (else the Bodencrew timing fallback for two rotors) |
| Motion | wave 3 | 5 players incl. one known to be motion-sensitive | the lift-off with outside shots on and off, RM stills, the 65 m hops, the humanoid head camera | no discomfort with the defaults; the RM path complete |
| Photosensitivity | wave 3 | a reviewer + `flash-check --sequence all` | whiteout, break-out, dream glitches, slow-motion falls, hail, spray, 6/6 pulses | ≤ 3 flashes/s everywhere |
| Screen reader | wave 3 | 1 pass | title states, credits page, Pass sections, the loading card | labels and focus order read |
| Browsers | wave 3 | M1 Air (Safari 16.4 or the oldest available, Chrome), Windows (Edge), Firefox (current and, if available, 108–113 for the worker fallback) | the MuJoCo station, robots, lift-off | runs; recordings with the chip on Firefox < 114 [C1 M15] |

### 8.3 Legal review list (before any public link; WP19 prepares the package, the founder signs off)

1. **Open Duck Mini v2:** the design derives from a film-character robot of an entertainment company (trade dress). Never „Disney“, „BDX“, „Star Wars“, „droid“; neutral colours; hidden vendor-part meshes removed, visible servo cases kept. Fallbacks with clean licences: ToddlerBot (MIT), ROBOTIS OP3 (Apache-2.0).
2. **Amber models, exhibits only:** Boston Dynamics Spot (Clearpath BSD-3 + RAI MIT, origin undocumented; „Spot ist eine Marke von Boston Dynamics“), MiR250 (DFKI BSD-3), KUKA LBR iiwa 14 (Drake BSD-3), Robotiq 2F-85 (ROS-Industrial BSD-2). Legal review plus a courtesy note to each vendor; no game mechanic depends on them; reserves Kinova Gen3, FANUC CRX-10iA.
3. **Unitree:** the BSD-3 binary-form notice in `licenses/` and the credits; clause 3 (no endorsement): „Keine Verbindung zu Unitree Robotics und keine Empfehlung durch Unitree Robotics.“; the G1's moulded lettering kept as part of the real object, no logo elsewhere; no third-party hand meshes.
4. **LeKiwi:** the mesh licence (WP0 R5); shipped only if green.
5. **Trademarks everywhere:** names only to identify products; no vendor logos beyond the model geometry; the disclaimer at the Schauhalle and in the credits; no real robot in the „Hersteller X“ critique; vendor names of generic machines only in chips and Entscheider cards.
6. **Notices:** Apache-2.0 (SO-ARM100, Open Duck, Menagerie-derived models, the Franka **NOTICE** reproduced, Apptronik, PAL, Hello Robot, Shadow, LeKiwi), BSD-2/3 (Unitree, ANYbotics, UR5e, Menagerie), MIT (three.js incl. the meshopt decoder, troika), Apache-2.0 (Rapier, MuJoCo), Zlib (postprocessing), OFL (fonts). They ship as `dist/licenses/` and `THIRD-PARTY-NOTICES` (WP0's notices plugin), closing the rc4 gap (R7 §10.3). The UR8 Long/15/18/20/30 meshes are forbidden by the path check.
7. **Price bands:** source, basis and date per band; D5 unaffected.
8. **History cards:** paraphrase only (Čapek, Asimov, Turing, Weizenbaum, Moravec); companies anonymous.
9. **Privacy:** 0 third-party requests (Phase 6 rule, incl. workers); photo mode saves locally; no free text input.

### 8.4 Release checklist additions (RELEASE §2 and §3, by WP19)

- founder sign-off of D15–D43, G-LOOK and G-FARM
- the legal package (§8.3)
- the photosensitivity gate and review; the motion review
- the first-time sessions (§8.2); the Entscheider timing; secrets discoverability
- facts register entries for every new number
- the rc4-save migration on the founder's own browser (the v1 backup stays untouched)
- the robot gallery reviewed by eye
- the credits page complete
- deploy-check of one GLB and the wasm on the real host

---

## 9. Risks and mitigations

| # | Risk | Effect | Mitigation |
|---|---|---|---|
| R1 | Scope: four founder asks + spine + region in one phase | late or shallow content | replace, don't add (two stations retired, two moved to side stations); contracts first; ≈ 20 % contingency; the cut order (§7); SHOULD only after wave 2 lands |
| R2 | 4K GPU margin at the plaza (rc4 4.43 vs 4.5 ms) with slab, terrain and region | gate missed on the main view | the slab only in the sky shader; the sky after the opaques if it saves; the joint GPU-proof scene on day 5 of wave 1; the A/B rule with the founder told at ≤ rc4 + 0.15 ms |
| R3 | A new sky and ground look for the whole game | the founder dislikes the base of everything | sun, hemisphere and exposure unchanged (zone looks stay valid); G-LOOK before mass production; the binding look rules (§2.7) |
| R4 | Licence and IP (Open Duck trade dress, amber vendors, LeKiwi meshes, trademarks) | takedown or a blocked public link | §8.3 package before release; amber robots carry no mechanic; reserves for every amber model and the duck; nominative use only |
| R5 | MuJoCo WASM on old engines or slow CPUs; Vite worker bundling | the duck station fails in production only | the worker owned by the station with `?worker` and a self-contained ES bundle; `mujoco-check --prod` in three engines; the support probe; the recordings fallback with an honest chip (Firefox < 114) |
| R6 | Download growth from 20+ real robots (today 4.01 MB for 21 files) | slow areas, > 8 MB total | caps enforced by `robots/check.mjs`; exhibits re-decimated; LOD0 = inspection; the line-up file; reachability-gated queue; the iiwa 14 dropped first |
| R7 | Hitches when robots appear (31–63 ms at 4× CPU, R7) | stutter at deliveries and zone entries | the boot warm-up variants; `prefetch` in idle; the crate as the placeholder; the redefined program gate incl. a WebKit lap |
| R8 | Motion sickness and photosensitivity in the lift-off, hops, head cameras, glitches | players hurt or out | R5 comfort rules, „Außenkameras“ switch and [C], RM stills, a stabilised head camera, `flash-check` on every risky sequence, a human motion review |
| R9 | Route length (Entdecker > 100 min, Entscheider > 30 min) | the founder's windows broken | design targets ≈ 94 / ≈ 29 (the D23 gate added no Entdecker minutes; the Schaufenster's third stand added 0.5 Entscheider minutes); side stations; H-TIME in wave 1; the block-out session in wave 2; the pre-committed second cut tier; the Bodencrew timing fallback |
| R10 | Merge conflicts with 8 builders | broken integration | WPS seams before wave 1; the complete owner map (§6.2); the layout frozen after wave 1; types split into files; one integrator per wave |
| R11 | State combinations (ground/air × finale × mode × RM × rc4 save × dock switch × ground crew × the Bodencrew supply under a mode switch) | stuck or contradictory worlds | everything derived from stamps and manifests; one flight flag; one altitude setter; suspension in the engine; `ending-check`, `save-migrate`, `quest-derive`, playtests with fixtures |
| R12 | Honesty slips with real robots (animations read as capability, vendor claims as facts, Agri-PV oversold, the SO-101 shown as a farm product) | „Messung statt Marketing“ undermined | HERSTELLERANGABE, MODELL and TRAUM chips; „Bewegung animiert“; „nicht angegeben“ instead of guesses; the research reference beside the farm result; the Arizona-vs-Almería card; the honest SO-101 card; no internal EmAI numbers (D20); facts register before release |
| R13 | A failed download blocks a ◆ (island, or a ground ◆ that supplies energy or navigation) | the lift-off unreachable for that player | retries, „Erneut laden“, then the Bodencrew offer (§5.8); `robust-check` cases |
| R14 | WP0's API drifts after consumers start | wave-2 rework | the API frozen at p7-w0; additions only (R2–R6); one adapter (WP4) between WP0 and every zone |
| R15 | Founder availability for G-LOOK / G-FARM | idle art lanes | G-LOOK blocks only final region and lift-off art (logic and block-outs continue); G-FARM is non-blocking with a 3-day timeout |

---

## 10. Critique log

How each finding of C1 (engineering) and C2 (brief, fun, learning) was handled. „Accepted“ means fixed in the sections named; „modified“ means fixed differently, for the reason given; „rejected“ gives the reason.

### C1 · Engineering

| ID | Finding | Resolution |
|---|---|---|
| B1 | All zone code loads before the title | **Accepted.** Manifest/code split, reachability-based code loading, new readiness events; WPS in wave 0; `load-size` per merge (§5.6, §6.4) |
| B2 | ~20 shared files without an owner | **Accepted.** Complete owner map (§6.2); seams: context-extension registry, type augmentation, `registerChip`, `registerLoopKind`, `registerBootWarmup`, `__academy.ext` (WPS). Modified in one point: `sky.ts` goes to WP2, not WP12, because the sky frame and the environment are one system (C2 B1) |
| B3 | §5.2 robots contract ≠ WP0's API | **Accepted.** §5.2 rewritten from the as-built API, frozen at p7-w0; `ctx.robots` adapter by WP4; LOD2/`bodies()`, inertials, line-up as WP0 requests R2–R6 with one named fallback owner each; clips are data played by the adapter (`animate`), so WP0 needs no `play()`; paths fixed |
| B4 | MuJoCo worker contract breaks in production | **Accepted.** The worker is owned by the station (`?worker`, self-contained ES bundle, `locateFile`), support probe, Firefox < 114 → recordings, `mujoco-check --prod`; no engine service until a second consumer appears (§5.4, D30) |
| M1 | Plaza GPU gate unreachable as specified | **Accepted.** Sky-after-opaques measured on day 1; the slab only in the sky shader; the fog ramp instead of a per-fragment term; a joint GPU-proof scene by day 5; the gate as an A/B, median of 5 (§5.5, §5.7) |
| M2 | Per-view budgets do not add up | **Accepted.** Per-owner ledgers from p7-w1; the plaza re-allocated to stay ≤ 200; the bridge head ≤ 240 with the region term; Schauhalle rect tiers + `interior` + frosted side walls; Traumhangar exterior ≤ 110 m (§5.5, §2.3) |
| M3 | „Lazy“ is eager on a 212 m island | **Accepted.** Reachability first (no ground areas before the Revier opens), objective, then ≤ 60 m; one queue, ≤ 2 at once; MuJoCo on entering the plot; prewarm paused during cinematics. Modified: the H2 GLB loads with the hangar, because its dream ghost (D21) needs the geometry from the first visit (§5.6) |
| M4 | Measured robot sizes break the caps | **Accepted.** Exhibits re-decimated, LOD0 = inspection, caps as failures in `check.mjs`, LeKiwi and the line-up inside 4.0 MB, the iiwa dropped first, Apollo's documented exception; the 8 MB total re-based by a scripted lap (§5.6, D31) |
| M5 | The two program gates cannot both hold | **Accepted.** Program table, boot warm-up variants, the redefined play gate, ≤ 150 at the title, a WebKit lap (§5.5) |
| M6 | „World moves“ bugs | **Accepted, stricter.** No gust tilt at all while docked; only the Probestart and F1 tilt, with the player aboard by construction; one threshold (0.05 m); dynamics frozen; one setter; detached suspended roots; shadows marked dirty; a `climb` CPU view (§5.3) |
| M7 | Kill plane equals the dock floor | **Accepted.** Rescue volumes over the floor, keel block and lake; `killY` stays the backstop (§2.3, §5.3) |
| M8 | Totals count every area | **Accepted.** Scopes on every aggregate, default 'island'; `quest-derive` seeds farm stamps (§3.4, §5.2) |
| M9 | `rev`/`mastery` read at boot, defined at init | **Accepted.** On `StationManifest`; migration against manifests at boot (§3.5, §5.2) |
| M10 | Migration irreversible and incomplete | **Accepted.** New key, v1 kept read-only, failure path, predictions/bests/sky/onboarding/logo rules, `retired.ts` appended by the retiring WP, fixtures; island keys under `p7.quest` (§3.5) |
| M11 | Ownership overlaps | **Accepted.** Farm arms → WP9 (life subscribes); footprint → WP12 on WP11's spec; Fundvitrine via `secrets.registerObject`; `zoneValue` → `src/core/quest/values.ts` |
| M12 | Spine late, WP10 without slack, perf late | **Accepted.** WP12 in wave 1; WP6 to wave 2; the WP10 spike by the WP2 builder in wave 1; the ledger from p7-w1 |
| M13 | Terrain unbuildable before the title | **Accepted.** Baked Uint16 heights (core before, ring after the title), clipmap render budget, collider tiles only where walkable (WP3) |
| M14 | A failed load blocks the goal | **Accepted, modified.** Retries, „Erneut laden“, loading card with bytes, then the Bodencrew offer. Rejected: the „silhouette degraded mode“, because a static silhouette cannot articulate, and a second presentation per ◆ costs more than the crew rule it would replace (§5.8) |
| M15 | Gates too slow, some criteria untestable | **Accepted.** Two tiers (≤ 25 min per merge); browser harness instead of a Node unit runner; stub manifests in wave 0 make the pool testable; WP4's screenshot check against its own base; minimum-version browsers in the human checks; the flash counter in-page via `readPixels` (§6.3, §5.10, §8.2) |
| M16 | No contingency, five WPs undersized | **Accepted.** WP1 11, WP4 9 (+ WPS 3), WP7 10, WP10 14 (after a spike), WP11 13; integration 4 per wave; MUST ≈ 200 + 20 % (§7) |
| m1 | BatchedMesh for nothing | **Accepted.** Per-body InstancedMesh everywhere (§4.10, §4.12) |
| m2 | LOD governor, LOD names | **Accepted.** WP0's names (0, 1, 2, 'silhouette'); a hall governor (§4.9) |
| m3 | Memory and disposal | **Accepted** (§5.9) |
| m4 | Missing English silently German | **Accepted.** `i18n-audit` in the merge tier |
| m5 | Reduced-motion gaps | **Accepted.** RM rows per new station; Probestart and head camera rules |
| m6 | Depth precision at the shore | **Accepted** (§2.3) |
| m7 | Far PV shadows | **Accepted.** Analytic stripes (§4.10, §5.3) |
| m8 | Workers run while paused | **Accepted** (§5.4, §5.9) |
| m9 | rc4 leftovers and name clashes | **Accepted.** `TROCKENDOCK`; shuttle pod removed; fallback plots beyond 900 m |
| m10 | Worker requests and `third-party` | **Accepted** (§5.10) |
| m11 | Resuming on the ground | **Accepted** (§3.6, §5.6) |
| m12 | Save size | **Accepted.** ≤ 16 KB per area |
| m13 | Rect plots | **Accepted** (§5.2, WP4) |
| m14 | Dev runs | **Accepted.** `?world=0`, `?only=<site>` defined (WPS) |

### C2 · Brief, fun and learning

| ID | Finding | Resolution |
|---|---|---|
| B1 | A flying island on screen in minute one | **Accepted.** The sky frame rule 2b, owner WP2, reveal by WP13, assertions in `ending-check` and `liftoff-check` (§5.3, §2.1) |
| M1 | Route time optimistic; pass rules outside the founder's windows | **Accepted, modified.** Pass rules 80–100 / ≤ 30 min; side stations 05 B and 06 C; route ≈ 93.7 min; H-TIME in wave 1; the second cut tier pre-committed. The Entscheider design target is ≈ 28.5, not ≤ 27, because the Schaufenster stop asked for in M7 costs 2 min and ≤ 27 would leave no room for it (§1.3, §1.4). *2026-10-17:* ≈ 29 since the Schaufenster's third stand (D23, D41) |
| M2 | Lift-off beats invisible, little agency | **Accepted.** Tracker wave, apron crowd and Winke-Arm in C1, the „Grube“ line, the hold-E throttle (with EMI taking over after 6 s, so nobody gets stuck), [C] outside camera, trim notes; C2 moved to the end of the cut order (§4.15, §7) |
| M3 | Probestart outside the frame | **Accepted.** Libelle lamps, ball, spray puff, „Schau hoch“ line (§1.2, §3.3) |
| M4 | „Nice future“ never designed | **Accepted.** §2.8 with R8 §5's table and three touchpoints; the Grubenrand (bucket wheel + Revier-Chronik) as a MUST landmark, smaller than the SHOULD monument |
| M5 | No solarpunk art rules | **Accepted.** §2.7 adopts R8 §4.6 and adds allowed/not-allowed futuristic signals; the farm still is mandatory in the G-LOOK set; G-FARM added as a non-blocking second look (founder question) |
| M6 | Watching returns | **Accepted, modified.** The ≤ 10 s / ≤ 20 % rule and the station fixes are adopted. The tool reads explicit `unattended` marks set by the stations instead of input-free intervals of bot runs, because bots never idle like humans; the human sessions check the rest |
| M7 | Entscheider misses the real-robot asks | **Accepted.** The 2-minute Schaufenster with two recorded Kurzläufe (D41; *2026-10-17:* 2.5 min with a third, „Erntetag“, D23). Rejected as C2 also advised: making 02 C an Entscheider ◆ (it would break D23's one rule) |
| M8 | Showroom under-weighted, static, „auf Anfrage“ | **Accepted.** 4-minute first visit with a Lastenheft round; Vorführung loops; dated secondary price sources; the SELBST BAUEN pylon. WP11 fills the price data from R4 in wave 2; WP18 extends the sources in wave 3 |
| M9 | Overloaded stations, duplicated lessons | **Accepted.** 04 B with two route cards and two discovery cards; the 04 C lesson back to rc4's; Traumhangar C simplified with a piloted closed-loop trial |
| M10 | Open source stops at the two examples | **Accepted, conditional.** LeKiwi becomes MUST if its mesh licence is green (R4 lists the mesh licences as unchecked); otherwise the rc4 rovers stay and the founder is told; the iiwa is dropped first if the cap binds |
| M11 | Fun judged too late | **Accepted.** H-TIME (wave 1), the block-out route session (wave 2, day 8), WP20 fun tuning (wave 3), a ≈ 15 % juice reserve per content WP |
| M12 | „After all quests“; the farm request overclaims | **Accepted.** The lift-off grows with completion (never gated); the EMI-08 request reworded; the T3 line „Proviant an Bord“; the gate rule is put to the founder in the founder's own words. *Answered 2026-10-17* („i mean the whole world … do what you think looks the best“): D23 now gates the Entdecker lift-off on lift, energy and navigation. The farm's claim is kept honest by the FIKTION Startakku and RICHTWERT kWh that are never converted into thrust (§4.10) |
| m1 | M3 line teaches IK | **Accepted** (§3.2) |
| m2 | „auf Grün“, teal means two things | **Accepted.** „Bring sie zum Leuchten“; the colour table in §4 conventions; the TRAUM chip |
| m3 | Hobby arm beats the research average | **Accepted.** The reference beside the result; the „25 cm“ card |
| m4 | H2 price conflict hidden | **Accepted.** Two-source band |
| m5 | „All stars“ vs the pool | **Accepted.** F1 joins the pool: 84 → 63 (D21's count corrected) |
| m6 | Winke-Arm not discoverable | **Accepted.** It waves first; the egg 1/25 contingency |
| m7 | Head-camera comfort, flash checks beyond the lift-off | **Accepted.** A stabilised head camera, chase camera under RM, `flash-check` sequences |
| m8 | Players walk away after a B-◆ | **Accepted.** Pointer lines for 02 and 04 |
| m9 | Mechanics on amber models | **Accepted.** M6 → FR3; Kistenwaage on FANUC, ANYmal D, UR5e |
| m10 | 11 min of statistics before the climax | **Accepted.** 06 C a side station; the 6/6 beat |
| m11 | No human aboard | **Accepted.** The crew member at the Ausguck rail |
| m12 | Ground and air unlinked after the flight | **Accepted as SHOULD** (WP16): cosmetic and cheap, but not needed for the brief |
| §6 | „Not cut: Unkrautacker“ | **Partly rejected.** The Unkrautacker moves to position 8 of 9 in the cut order, behind every cheaper item, so it goes only after everything else. A cut list needs one sizeable item before the founder asks, and it is the cheapest such item |
