# R9 · Life in the world, and easter eggs

Phase 7 research, topic R9. Baseline: release candidate 4 (tag `rc4`, founder-approved). Date: 2026-10-17. This report changes no code. It proposes (1) ambient systems that make the island and the region around it feel alive and believable, (2) 25 discoverable secrets with a robotics, AI and EmAI flavour, and (3) a delight checklist for every area, with a test for how many secrets a first-time player finds without a guide.

Repo facts cite the file (`I…`). External facts cite the sources table (§10, `S…`, all accessed 2026-10-17). Anything I could not confirm is marked **unverified**. Cost figures marked *est.* are estimates. The CPU figures come from a Node micro-benchmark (`artifacts/phase7/life-eastereggs/bench.mjs`, output in `bench.txt`, both git-ignored) and must be re-measured in the browser with `tools/perf-cpu.mjs`.

**Fit with the sibling reports.** R5 (`docs/research/R5-LIFTOFF.md`) places the island in **„Trockendock 3“**, a dry dock on a coastal plateau with an apron (r ≈ 400 m), shipyard cranes, the coast about 600 m WNW and hills under a cloud bank. The sun stays fixed at 295° and 16°. R5 also says that ground content cannot be reached once the island is airborne [I11]. R6 (`R6-QUEST-REVIEW.md`) cuts the progress systems from nine to three you can see. It turns the album into a „Pannen-Wand“ in the showroom and wants rewards to be "things you get"; its delivery podium is in the tower foyer [I12]. R4 (`R4-SHOWROOM.md`) designs the showroom itself as a glass „Schauhalle“ on the north axis between Regelgarten and Greifwerkstatt, and keeps the foyer as R6's delivery podium [I22]. R3 designs the **Traumhangar** (Unitree ladder, a toy world model) [I13]. R2 (`R2-OPEN-DUCK-RL.md`) builds the Open Duck station, where reward hacks (belly flop, statue, instant faller) already emerge in play [I23]. R1 gives the SO-101 spec (reach ≈ 0.41 m, own calculation) [I14]. This report builds on all six and only adds to them: a cabinet in R4's hall, an album entry on R2's hacks. Where it depends on a decision that is still open there, §2 and §8 say so.

---

## 0. In one screen

**Life: everything that moves has a job, runs on one farm clock and reacts to you and to your progress.** I propose 20 ambient systems (§4). The ones to build first:

- **The harvest shift in the Hochbeete.** Real SO-101 arms on rails pick cherry tomatoes at the measured research average: a 33 s cycle and 66 % harvest success, averaged over 50 projects [S37]. Each miss stays on the vine for the human „Nachlese“ or a rover. A farm board counts the shift live (SIM · LIVE). This is „Messung statt Marketing“ as ambience.
- **Bumblebees, not robots, pollinate the tomatoes.** Tomatoes are buzz-pollinated. Bumblebees vibrate their flowers at about 100–400 Hz, and honeybees do not raise tomato fruit weight significantly [S29, S30]. You hear the buzz, and the card says so.
- **Robots that notice you.** They greet you and yield with a visible safety field, then replan around you (speed and separation monitoring is one of the collaborative techniques in ISO 10218 and ISO/TS 15066 [S9, S10]).
- **The region reacts to your progress.** Each thruster test makes the birds flush from the fields, the sheep look up and the workers wave. At the lift-off, every arm on the farm waves goodbye.
- **A few stylised people with jobs** (agronomist, technician, Nachlese, visitors). They have no faces, and the robots give way to them. This matches the house line „Roboter übernehmen die harte Arbeit, Menschen das Denken“ [I17]. Founder question Q1.

**Easter eggs: 25 secrets that reuse what exists.** Every find puts a small object into a **Fundvitrine** next to the Pannen-Wand in the showroom (R4's Schauhalle), so the world changes. It also adds a slot to a hidden „Funde“ section in the Pass album tab, which appears only after the first find, plus an EMI-01 radio line and a sourced fact card. Three eggs are failure modes and go to the album instead: reward hacking, a world-model dream and the out-of-distribution tomato. **No egg gates anything** (R6: fewer systems that gate). There is no Konami code: the "code" is the EmAI mark's own arc directions, ↑↑↑↓↑↑↑↓, typed on the Pass cover.

**Budget (§4.5).** Life adds ≤ 4 main-pass draws at the spawn and the plaza. That matters because R5 already brings the spawn world to 106 of 110. It adds ≤ 20 draws in the busiest farm view and ≤ 3 during the lift-off. It stays within ≤ 120 k triangles, ≤ 0.25 ms CPU per frame at 1× (≤ 1.0 ms at 4×, and ≤ 0.2 ms at 4× on the plaza), ≤ 4 MB of GPU memory, ≤ 40 KB of brotli JS in a lazy chunk, 0 audio files and ≤ 6 extra voices. There are no new shadow casters except the arms near you, and nothing transparent near the plaza (its GPU margin at 4K is 0.07 ms [I10]). The key technique is a `BatchedMesh` that holds all real-robot links and LODs in about one draw call [I18].

**Discoverability (§6.1).** Target: a first-time player finds a median of ≥ 5 secrets in a full Entdecker run, and ≥ 1 within the first 10 minutes. The Winke-Arm at the bridge head is designed to be that first find. Checked by an automated "secret audit" and two rounds of 5–6 first-time players [S44].

---

## 1. What rc4 already gives us (reuse map)

| Need | rc4 system (file) | What it does today | Reuse here |
|---|---|---|---|
| Robots with a visible job | Service rovers (`landscape/rovers.ts`) [I1] | 8 unbranded rovers on loops at 0.8 m/s; within 2.5 m they stop and turn to look at you; kinematic colliders; 3 instanced meshes | Farm crate rovers (same geometry), greeting, yield and replan |
| Drones on schedules | Maintenance drones (`landscape/drones.ts`) [I2] | 4 quadcopters: dock 9–16 s, inspect two intakes and a mast, return; +3 draws; still fly on low ("motion is information, not decoration") | Delivery drone to the farm; the Wright-Flyer swatch egg |
| One update loop, skipped when hidden | `landscape/index.ts` [I21] | One `ctx.every(1/60)` loop for everything on the deck; returns early when the camera is far or under the deck | The LifeDirector pattern (§4.5) |
| Control-loop toys | PV tracker rows, test fan (`landscape/solar.ts`, `index.ts` `buildToys`) | A row re-aims after a kick with 8 % overshoot; a fan spins up | PV cleaning robot; "90 Sol" egg |
| Greenery | Hydro-Kapseln (`landscape/pods.ts`) | 3 glass pods at bearings 60/120/240 with plants and grow lights | A small „Tomatenkapsel“ aboard, so the farm lesson survives the lift-off (§2) |
| Hidden collectibles | Sensorkapseln (`systems/Capsules.ts`) [I3] | ≤ 16 instanced capsules + rings = 2 draws; pickup by segment test; 12 rim position lights | Stays as is (R6 keeps it); eggs are a separate, quieter layer |
| Companion voice | EMI-01 radio (`world/radio.ts`) [I4] | ≤ 1 line per 20 s, a queue of 3 (the oldest is dropped), quiet in the Kielraum and the ending; capsule direction hint on H | One line per egg; a post-lift-off egg hint (§5.1) |
| Juice | `systems/Juice.ts` [I5] | 256 pooled particles in 1 draw, popups, 9 calibrated cues (`collect` among them) | Find feedback; no new effect system |
| Sound | `systems/Audio.ts` [I6] | Procedural WebAudio, 6 buses, loops `hum/servo/beacon/conveyor/drone/generator/data`, `tone()`, level targets | All new beds and one-shots are procedural (§4.4) |
| Album and Pass | `systems/Progress.ts`, `ui/PassPanel.ts` [I7] | `registerAlbum/unlockAlbum`; Pass tabs stamps, questions, album, Funk-Log | Failure-mode eggs → album; a hidden „Funde“ section in the album tab |
| Recamán in the floor | Allee number line (`landscape/numberline.ts`) [I8] | 26 teal ticks 0–25; walking draws the 17 arcs; a rule plaque (OEIS A005132) | Egg 1 „Die nächste Zahl“ continues it |
| Sky traffic | `world/sky.ts` [I20] | Sister platforms, two cargo multicopters, six rescue drones, two tower drones | The far tier of the region; the lift-off farewell |

**The rule rc4 already follows, and which life must keep:** "Purpose you can see." The drones inspect, the rovers serve, the PV rows track the sun. No prop moves only for decoration (ART-V2 §4.8; the comment in `drones.ts` [I2]).

---

## 2. Where life lives (constraints from R5, R6, R3)

| Place | State in R5 / R6 | Life there | After the lift-off |
|---|---|---|---|
| **Island deck** (plaza, Allee, rim, pods, PV rows) | Unchanged geometry; the island never moves, the world does (R5) | Rovers, drones, the PV cleaning robot, the Tomatenkapsel with one SO-101, birds on the rail | Keeps running (it is aboard) |
| **Apron and dock** (r ≈ 400 m, cranes, hangars) | Seen from the deck; R5: "the player cannot leave the island" | Ground rovers, crane moves, dock crew; far tier from the deck | Seen from above for ≈ 20 s (R5 beats 22–42 s), then gone under the cloud |
| **The agrivoltaic tomato farm** (Hochbeete + PV + SO-101 arms) | **Not placed by R5 yet** (founder follow-up). R5: content on the ground cannot be reached once airborne | The densest life: harvest shift, bees, sheep, people, board | Seen from above in the farewell beat; a small aboard copy keeps the lesson |
| **Traumhangar** (R3) | On the island (Landedeck or under the Ausguck, R6) | Humanoids in their docks; the dream glitch room (egg 12) | Aboard |
| **Schauhalle** (R4, north axis) and the foyer podium (R6) | On the island | The Fundvitrine next to the Pannen-Wand, the credits room | Aboard |

**Open choice (Q2).** Either the farm sits on the apron and is walkable before the lift-off, which changes R5's "gate at the bridge head", or it is view-only from the deck. My recommendation: the farm sits on the **sunlit WNW side of the apron**, between the dock and the coast, not ESE where R5's cloud shadow begins at ≈ 251 m [I11]. It is walkable over a second bridge until the lift-off, and the 3 Hydro-Kapseln become **Tomatenkapseln** aboard, one with an SO-101, so the life and the lesson continue in the air.

**Light.** R5 computes its look from a fixed sun at 16° under the cloud edge, which sits at 20.1° [I11]. A moving sun would put the deck into the cloud shadow above 20.1° and would rebuild the environment map. So this report proposes **no sun cycle**. Time is told by the farm clock (shift changes, cleaning runs, irrigation) and by the existing dusk after the lift-off (§4, L1).

---

## 3. Rules for life (applies to every system below)

1. **Every moving thing has a job you can name.** If a player asks "what is it doing?", the answer must be a job (harvest, deliver, clean, inspect, graze, pollinate), not "decoration".
2. **One clock.** All schedules hang off one farm clock (the „Hof-Takt“, §4.2), so the region's stories line up: a crate is full when the rover arrives, and the drone lands when an arm reports wear.
3. **Life reacts to you and to your progress.** Robots notice you; animals keep their distance; each thruster test (R6 §6.2) and the lift-off (R5 §5.2) visibly reaches the region.
4. **Honest automation.** Robots miss, wait and ask for help at sourced rates. People do the judging, the fixing and the enjoying. Never write „Roboter ersetzen Menschen“ [I17].
5. **Never in the way.** Nothing blocks a route for more than 2 s (rovers yield and replan), nothing chases you, there are no jump scares and no stinging bees. Under reduced motion, life slows and perches. No effect flashes more than 3 times per second [S45].
6. **Budget first.** Life is one module with tiers (§4.5). It reuses instanced meshes, adds no shadow casters beyond the near arms, uses nothing transparent near the plaza, and collapses every far agent into one draw.

---

## 4. Ambient systems („Leben in der Welt“)

Costs are main-pass draw calls in the view where the system is busiest (near / far), CPU per frame at 1× CPU (*est.*, from `bench.txt` [I16] plus overhead), and GPU memory. "Low" is the low quality tier. Priority: **must**, should, could.

| # | System | What you see and hear | Why: life / learning | Draws near / far | CPU / frame (1×) | Memory | Low tier | Prio |
|---|---|---|---|---|---|---|---|---|
| L1 | **LifeDirector + Hof-Takt** (farm clock) | Nothing by itself; drives all schedules, tiers and events | Coherent stories; one place to enforce the budget | 0 / 0 | ≤ 0.02 ms | < 0.1 MB | mid tier at 5 Hz | **must** |
| L2 | **Harvest shift in the Hochbeete** | 8–12 real SO-101 arms on carriages along the bed edges pick cherry tomatoes into crates. One in three attempts misses, and the miss stays on the vine. An arm pauses when you reach into its bed | The research average on screen: 66 % success, 33 s cycle, over 50 projects [S37]. A modern single case: 61 % in a crop adapted to the robot, 18 % in a normal one, 24 s cycle [S38]. The SO-101 reaches ≈ 0.41 m [I14], so it rides a rail (honest scale) | 1–2 (BatchedMesh, all links and LODs) / 1 | ≈ 0.03 ms (12 arms × 6 joints: 4 µs in Node) | ≈ 2 MB (LOD0 24 k, LOD1 6.5 k triangles per arm [I15]) | 15 Hz animation | **must** |
| L3 | **Tomatoes and crates** | Ripe and unripe tomatoes (instance colour); crates that fill up and are swapped | The crop you can see grows, empties and refills | 2 / 0 | only on change | < 0.3 MB (≈ 2,000 × 16 triangles) | same | **must** |
| L4 | **Crate rovers (farm logistics)** | 4–6 rovers (rc4 geometry) carry full crates to the packing shed and the farm shop | Reuses I1; shows where the harvest goes | 3 / far tier | < 0.01 ms | < 0.1 MB | keep moving | **must** |
| L5 | **Reactive robots** | First meeting: eye-bar blink and a chirp. In your way: a flat safety ring (teal; amber inside), the robot slows, stops and then replans around you on a coarse grid. It never waits more than 2 s | Speed and separation monitoring as a visible idea (one of the collaborative techniques in ISO 10218 / ISO/TS 15066, consolidated into ISO 10218:2025 [S9, S10]); feeds egg 5 (Shakey, A*) | 1 (instanced rings) / 0 | proximity 0.2 µs for 256 agents; A* ≤ 0.2 ms per replan, time-sliced | < 0.1 MB | same | **must** |
| L6 | **Delivery drone story** | When an arm's wear counter is full, a drone takes off from the island dock with a gripper finger, lands at the farm, the arm resumes, and the board logs it | Maintenance, uptime and a reason to fly. Card: in the EU's open drone category the ceiling is generally 120 m [S39], so a delivery from an island at 570 m would need an authorisation (honest twist) | 0–3 (extra instances in I2's meshes) / 0 | < 0.01 ms | 0 | keep | should |
| L7 | **People (6–10 stylised figures with jobs)** | Agronomist with a tablet at the beds, a technician who swaps the finger, a Nachlese worker who picks the misses, visitors at the farm shop, a cyclist. Faceless, matte, no speech; they look at you, wave at thruster tests and step aside | "A nice future" includes people; it shows who does the judging. Robots yield to people (L5). See §4.1 | 2 (instanced body + limbs) + 1 shared blob-shadow decal / far tier | ≈ 0.01 ms | < 0.3 MB | 5 Hz walk | should (Q1) |
| L8 | **Bumblebees and bees** | Bumblebees orbit the tomato flowers and buzz (a 1-voice loop); a bumblebee box and a beehive at the bed ends | Tomatoes are buzz-pollinated; bumblebee buzzes sit at about 100–400 Hz [S30]; extra pollination by buzzing bees raised tomato fruit weight, and by honeybees it did not [S29]. The robot harvests, the bumblebee pollinates | 1 (≈ 300 tiny opaque instances, vertex-shader orbits) / 0 | 0 (GPU) | < 0.1 MB | off | **must** (farm) |
| L9 | **Birds: a flock and a stork** | 24–32 swallows hunt over the fields (boids); a white stork on a nest on a farm mast. The flock flushes at a thruster test or when you sprint into the field | Life at every distance, read from the deck; white storks in Germany: > 15,000 pairs expected in 2026, after < 3,000 in the 1980s (NABU) [S34]. Conservation works: good news, sourced | 2 / 1 (the flock stays visible far away) | ≈ 0.01 ms (32 boids: 4 µs in Node) | < 0.1 MB | 12 birds | should |
| L10 | **Flower strips and butterflies** | Wildflower strips between the PV rows; 60 butterflies (shader motion) | Habitat-friendly solar: at two Minnesota sites total insect abundance tripled and native bees rose 20-fold over five years (2018–2022) [S31] | 1 (butterflies; the strips are part of R5's ground budget) / 0 | 0 | < 0.1 MB | off | should |
| L11 | **Sheep under the PV ("solar grazing")** | 6–8 sheep graze between the posts and amble away from you | Grazing in German solar parks is documented (bne study 2019 [S32]; the effects are **unverified** in detail). The sheep mow; the mower robot (egg 23) keeps to the hedges | 1 / far tier | < 0.01 ms | < 0.2 MB | static | should |
| L12 | **Wind and weather** | The gust (rc4 `island:gust`) bends the plants (vertex uniform); 3–5 wind turbines on the ESE hills turn with the wind; a wind sock | Power in the wind grows with v³, and no turbine can take more than 16/27 ≈ 59.3 % of it (Betz) [S40] | 1 (turbines instanced) / 1 | 0 (uniforms) | < 0.1 MB | rotors at fixed speed | should |
| L13 | **PV cleaning robot** | A cleaning robot crawls along one PV row per Hof-Takt (island rows and farm rows) | Soiling costs at least 3–4 % of global solar production even with optimised cleaning [S36]; feeds egg 21 (Mars: wind cleaned a rover's panels [S26]) | 1–2 / 0 | < 0.01 ms | < 0.1 MB | keep | should |
| L14 | **Hofanzeige (farm board)** | A board at the farm shop: today's tomatoes, the hit rate with n and an interval, misses picked by hand, PV output (ILLUSTRATIV), water used | The ambient sim measured live (SIM · LIVE), never a claim. Card: agrivoltaics can raise land-use efficiency; Fraunhofer ISE measured 160 % (2017) and 186 % in the hot summer of 2018 on one pilot site [S27] | 1 (canvas 512 × 256, redrawn at 1 Hz in idle time) / 0 | ≈ 0.01 ms amortised | ≈ 0.7 MB | 0.2 Hz | should |
| L15 | **Pond with aquaponics fish** | A greenhouse tank where fish and tomatoes share one water loop | A real German research system: IGB's "Tomatenfisch" (ASTAF-PRO) [S33] | 1 (fish, shader swim) / 0 | 0 | < 0.1 MB | static | could |
| L16 | **Rail line and cargo bikes** | A short electric train crosses the hills every 4 min with a distant rumble and a bell; a cargo bike stops at the farm shop | Believable 2030s mobility; life at the far edge | 1–2 / 1 | < 0.01 ms | < 0.1 MB | train only | could |
| L17 | **The region reacts to your progress** | At each thruster test: the birds flush, the sheep look up, the people wave, the train rings. At the lift-off (R5 beats 22–42 s): every SO-101 raises its gripper and waves for 2 s, the crew waves from the apron | R6 F-01: "the world never changes because of you", fixed with event hooks | 0 | 0 | 0 | same | **must** |
| L18 | **Sound beds** | Region: wind in grass, distant train, birds. Farm: bumblebees, one servo bed for all arms (positional at the nearest), drip irrigation. Crossfade by area | Life you hear before you see it; the cues for H1 secrets | 0 | audio thread only | 0 files | fewer voices | **must** |
| L19 | **Micro-stories** (§4.3) | 5 small stories told by the agents above | Learning by watching: edge cases, maintenance, out-of-distribution, honesty | 0 | 0 | 0 | same | **must** (2), should (3) |
| L20 | **Dusk and night touches** (if a ground dusk exists; otherwise aboard after the lift-off) | Grow lights in the Tomatenkapseln, position lights (rc4), the mower parked, the stork back on its nest | A believable end of the day | 0–1 / 0 | 0 | 0 | same | could |

### 4.1 People: do we want humans?

| Option | What | For | Against | Cost |
|---|---|---|---|---|
| A · No people, only traces | Bicycles, a jacket on a hook, coffee cups, a child's chalk drawing of EMI, a picnic blanket, the board's „Nachlese: Schicht B“ | Cheapest; no uncanny risk; nothing to animate | A future where robots work and nobody lives reads as dystopian; it contradicts the house line „Menschen das Denken“ | 1–2 static draws |
| **B · Few stylised figures** (recommended) | 6–10 faceless, low-poly figures with roles: agronomist, technician, Nachlese, two visitors, a cyclist, a family at the shop. Matte stone base with muted accents (olive, sand, slate); teal and orange stay reserved for data and the brand | Shows who does what; gives the robots someone to yield to (L5); cheap to animate (2 rigid parts per figure, instance matrices) | Representation needs care: mixed ages, genders and body types; no national or brand markers | 2 + 1 draws near; far tier |
| C · Realistic humans | Skinned, mocap-animated, faces | Believable up close | Uncanny, expensive (skinning per figure), clashes with the matte machined style | 10+ draws, MBs of animation |

Rules for B: no names and no dialogue (EMI-01 speaks about them: „Die Nachlese holt, was der Arm verpasst.“). People never stand in a station, never block a door and always yield to the player. Robots always yield to people.

### 4.2 The Hof-Takt (one 8-minute farm loop)

| t (min) | Farm | Island deck | Why at this time |
|---|---|---|---|
| 0:00–5:00 | Harvest: each arm tries one tomato per 33 s [S37] and succeeds about 2 of 3 times; ≈ 14 tries per arm per loop | Rovers on their loops, drones on inspection | Constant activity where the player arrives |
| 5:00 | Crates full → crate rovers to the packing shed | – | Cause → effect you can follow |
| 5:30 (every 3rd loop) | One arm's wear counter is full → the drone brings a finger (L6) | The drone leaves its dock | A visible link between island and farm |
| 6:00–7:00 | The cleaning robot runs along one PV row (L13); the Nachlese worker picks the misses | The cleaning robot on one island PV row | Maintenance is part of the work |
| 7:00–8:00 | Drip irrigation (water sound), the agronomist checks plants, the sheep move to the next row | – | A quiet minute; good moment for animals |

The board (L14) shows the loop's numbers as SIM · LIVE: „Ernte heute 64 % [58–70] · n = 212“ with a QUELLE line „Mittelwert 50 Forschungsprojekte: 66 % (Bac et al. 2014)“. Note that the 66 % mixes several crops; the review says the data were too sparse for averages per crop [S37].

### 4.3 Micro-stories (told only by agents, no cut-scenes)

| Story | Beats | Lesson | EMI-01 line (≤ 18 words) DE / EN | Prio |
|---|---|---|---|---|
| **„Rover 5 und die Pfütze“** | A crate rover gets stuck at the same puddle by the farm shop, three loops in a row. At the third, the technician lays a plate, and the rover never sticks there again. If you stand in the puddle, it replans with A* (egg 5) | Edge cases and the long tail; a fix becomes data | „Jeder Sonderfall einmal. Danach ist er Daten.“ / “Every edge case once. After that, it’s data.” | **must** |
| **„Ersatzfinger per Drohne“** | Arm 3's status light turns amber → the drone flies from the island → it lands → the finger is swapped → the board logs „Greiferfinger getauscht“ | Wear, maintenance, uptime | „Greifer nutzen sich ab. Gute Planung tauscht vorher.“ / “Grippers wear out. Good planning swaps them early.” | **must** |
| **„Nachlese“** | The arms leave the misses on the vine; the Nachlese worker picks them with a basket | 66 %, not 100 %: robots and people share the work | „Zwei von drei schafft der Arm. Den Rest holt die Nachlese.“ / “The arm gets two in three. The pickers get the rest.” | should |
| **„Die Herztomate“** (egg 24) | A heart-shaped tomato makes an arm stop and retry; you can pick it up (grab verb) and put it in the crate | Out-of-distribution input | see egg 24 | should |
| **„Der Storch kommt“** | Once per session the stork lands on its mast nest; the swallows scatter | Biodiversity on a working farm | „Der Storch kommt jedes Jahr. Die Arme stört er nicht.“ / “The stork comes back every year. The arms don’t bother it.” | should |

### 4.4 Sound beds (procedural, no files)

| Bed | Recipe (existing `Audio.ts` primitives [I6]) | Bus / level | Voices |
|---|---|---|---|
| Bumblebees | 2–3 band-passed noise sources around 150–350 Hz with slow AM, positional at the flower clusters; one buzz burst when a bumblebee "sonicates" a flower | ambience, ≤ zone-loop RMS (−34…−24 dBFS at ≤ 3 m) | 1 |
| Arms | The existing `servo` loop at the nearest working arm, pitch per move; a soft click on gripper close | zones | 1 |
| Water | Pink noise through a narrow band-pass plus random grains (drip irrigation, the tank) | ambience | 1 |
| Birds | Scheduled FM chirps (≤ 2 at a time), more when the flock flushes; generic, imitating no recorded song | ambience | ≤ 2 |
| Train | Low rumble with a Doppler-style pitch slide; one two-tone bell | ambience, far | 1 (while passing) |
| Region wind | The existing wind bed with a grass-rustle high-pass layer driven by the gust | ambience | 0 (existing) |
| One-shots | Rubber-duck squeak (FM sine sweep), music-box melody (`stamp()` notes), find cue (`cue('collect')`) | cues | – |

Total ≤ 6 extra voices (GDD §10.1 limit ≈ 40, audio CPU ≤ 1 ms [I9]). Run `node tools/audio-levels.mjs` on every new sound.

### 4.5 LifeDirector and the budget

**Tiers** (distance from the camera to the agent's group):

| Tier | Range | Update | Geometry | Sound |
|---|---|---|---|---|
| Near | ≤ 40 m | 60 Hz | Real models: the closest SO-101 within 6 m at LOD0, the rest LOD1 (R7 pipeline: LOD0 24,078 / LOD1 6,496 triangles per arm [I15]); animals animate | Positional |
| Mid | 40–150 m | 15 Hz, in 4 round-robin slices | LOD1; animals shader-only | Bed only |
| Far | 150–1,500 m | 2 Hz | Every agent as one tiny proxy in **one** instanced draw („Spielfiguren“, ≈ 30 triangles each) | None |
| Hidden | Camera in a zone interior, the Kielraum, under the deck, or airborne above 300 m | 0 | 0 draws | None |

**Real robots in one draw.** three.js r186 has `BatchedMesh` with `addGeometry`, `addInstance`, `setMatrixAt`, `setColorAt` and `setGeometryIdAt` (LOD per instance), and it uses `WEBGL_multi_draw` when available [I18]. All 7 SO-101 link bodies × 2 LODs × 12 arms fit in one BatchedMesh per material. That is 1–2 draws instead of 84 separate meshes (7 links × 12 arms). Shadows: one shadow call, for near arms only. **Verify:** `tools/drawcalls.mjs` counts renderer calls, so check on a browser without the multi-draw extension too; whether Safari has it is **unverified**.

**Budget per view** (main pass, on top of R5's ground module):

| View | rc4 / R5 target | Life adds (max) | Notes |
|---|---|---|---|
| Spawn, world | rc4 86, R5 ground ≤ 20 → ≤ 106 of the 110 target [I10, I11] | **≤ 4 draws** (far proxies 1, rover rings 1, flock 1, spare 1) | Tight: life near the spawn must reuse instanced meshes |
| Plaza, all | rc4 148 of 200 [I10] | ≤ 4 draws, ≤ 0.05 ms at 1× (≤ 0.2 ms at 4×) | rc4 JS at the plaza: 5.8 ms at 4× vs a target of 7.8 ms; GPU at 4K: 4.43 vs a 4.5 ms gate, so nothing transparent here |
| Farm, busiest view | new | ≤ 20 draws, ≤ 120 k triangles, ≤ 0.25 ms at 1× (≤ 1.0 ms at 4×) | Arms 2, crop and crates 2, rovers 3, rings 1, people 3, bees 1, birds 2, butterflies 1, sheep 1, turbines 1, cleaner 1, board 1, far 1 ≈ 20 |
| Lift-off (any beat) | R5: ≤ 500, C1 est. ≈ 300 | ≤ 3 draws (far proxies, flock, waving arms at LOD1) | R5's director already takes 0.3 ms at 1× |
| GDD worst view | 500 draws / 1.5 M triangles; rc4 worst 238 / 0.90 M [I9, I10] | – | R5 targets ≤ 270 / 1.05 M; life keeps the worst view ≤ 300 / 1.2 M |

**Hard caps:** ≤ 64 CPU-driven agents, ≤ 400 shader-driven instances, ≤ 6 voices, 0 per-frame allocations, 0 new shader programs after the title (add the life materials to `RenderSystem.warmUp()`; rc4 compiles 132 at the title against a target of 130 [I10]), canvas redraws only on value change (ARCHITECTURE §9).

**Measured order of magnitude** (Node 24.19, this workstation, `bench.txt` [I16]): 32 instanced walkers 1.6 µs per frame, 512 walkers 15 µs, 32 boids 4 µs (96 boids: 31 µs, so keep the flock ≤ 48), 12 six-joint arms with `updateMatrixWorld` 4 µs, a proximity test against 256 agents 0.2 µs. Upload and draw overhead come on top. The CPU budget above leaves a margin of 10× or more; draw calls and GPU fill are the real limits.

**Download.** Life code ≤ 40 KB brotli in its own lazy chunk after the title, like the finale chunk. The SO-101 GLB (R7: rigid 221 KB brotli) is shared with the Lern-Dojo, so nothing is downloaded twice. Everything else is procedural. 0 third-party requests (Phase 6 rule).

**Tests to add (proposals, not built):** a `life` module tag in `drawcalls.mjs`; a "farm" view in the `perf` survey; `__academy.life()` returning agents, tiers, draws and ms; `idle-render.mjs` must stay at 0 renders while paused.

---

## 5. Easter eggs (25)

Hint levels: **H0** in plain view (motion or sound draws you), **H1** a cue within 10 m of a main path, **H2** off the path and signposted by something odd, **H3** a riddle, hinted only in the Fundbuch. Effort as in R6: S ≤ 2 days in one lane, M ≈ 1 week or two lanes, L new 3D assets or a new system. Reward shorthand: **V** = an object in the Fundvitrine, **P** = a slot in the Pass „Funde“ section, **R** = an EMI-01 radio line, **K** = a fact card (QUELLE), **A** = an album / Pannen-Wand entry instead of V/P.

| # | Name (DE) | Where and how you find it (hint) | What happens (reward) | Learning tie-in | Effort | Brand / legal | Prio |
|---|---|---|---|---|---|---|---|
| 1 | **Die nächste Zahl** | Allee / plaza. After walking all 17 arcs into the floor, a small console at the plaza end asks: „a(17) = 25. Und dann?“ It uses the existing prediction widget (H2) | Pick 43: arcs 18–25 of the sequence jump off the Allee across the plaza in teal light for 10 s. A wrong pick shows the rule step (25 − 18 = 7 is taken, so + 18). V (a slate with „43“), P, R, K | Recamán: a(18) = 43, then 62, 42, 63 … [S43]. Open maths: whether every number appears is unknown, and 852,655 is still missing after 10^612 terms (OEIS, 2026) [S43]. Not knowing is an honest answer | S | Teal floor light, a motif echo like the Allee (GDD §9.8 use 2 [I9]); the tower mark is never touched | should |
| 2 | **Spieluhr** | The Pass cover (Tab). Type the mark's first eight arc directions, ↑↑↑↓↑↑↑↓ (or W/S), from GDD Appendix A [I9] (H3; the riddle line in the Fundbuch reads „Hoch, hoch, hoch, runter …“) | All 18 stamp notes play as one melody (`stamp()` notes, f = 220 Hz · 2^(a/12) [I9]); V (a music box that plays it on E), P | The EmAI mark *is* the sequence; music from maths | S | Our own code, no Konami-style sequence; the cover mark is never altered (opacity rule). Check `a11y-keyboard.mjs`: the Pass must not bind these keys | should |
| 3 | **Robota** | Dunkelfabrik, on the night-shift locker: a theatre ticket „R.U.R. · 1921“ in EmAI typography (H1) | V (the ticket), P, R, K | The word "robot" comes from Karel Čapek's play R.U.R. (1920, first staged 1921). His brother Josef suggested it, after Czech *robota*, forced labour [S1, S2]. Ties to ARBEITEN: which work should robots take over? | S | Čapek (d. 1938) and Josef (d. 1945) are in the public domain in the EU; still use our own text and no 1920 cover art; avoid „Roboter ersetzen Menschen“ [I17] | **must** |
| 4 | **Die erste Schicht** | Dunkelfabrik, on an old shelf: a die-cast part stamped „1961“ (H1) | V (the casting), P, K | The first industrial robot started work in 1961 at a car plant in New Jersey, lifting hot parts out of a die-casting machine [S4]. The first robot job was hot, heavy and dangerous, like the posts in 05 A | S | No 3D look-alike of the 1961 robot (founder rule); name it in the card only; leave out the carmaker (customer-like name) | should |
| 5 | **Der Wackelige** | Anywhere a rover replans (L5): stand in its way three times and watch the teal search frontier spread over the floor (H0 → H1) | V (an „A*“ floor tile), P, R, K | Shakey (SRI, 1966–1972) perceived, planned and recovered from errors; its team published A* in 1968; A* plans driving directions, game paths and Mars-rover routes today. The name came from how it shook [S5, S6] | M (A* visual, reused by L5) | No Shakey model; facts only | **must** |
| 6 | **Narziss** | Sensordom B, in front of the mirror: a small light-seeking test bot (our own hex puck with a lamp) circles and "dances" when it sees its own lamp (H2) | V (the puck), P, K; links to the album entry „spiegel-geisterpunkte“ | W. Grey Walter's light-seeking robot tortoises (Bristol, 1948/49) reacted to their own lamp in a mirror; Walter wrote about it in 1950 [S7]. Mirrors have fooled robot sensors for over 75 years | S–M | Own design, not a tortoise replica; the 1950 wording is paraphrased (secondary source for the mirror detail) | should |
| 7 | **Drei Gesetze, zwei Normen** | Showroom, a frame with three empty lines next to the humanoid covers (H1) | V (the frame), P, R, K | In 1942 Isaac Asimov wrote three laws for robots into a short story, "Runaround", which is fiction [S8]. Real safety comes from standards and law: ISO 10218 (revised in 2025, with the collaborative content of ISO/TS 15066 folded in) and the EU Machinery Regulation, which applies from 20 January 2027 [S9, S11] | S | Do not quote the laws (copyrighted text); name the story as history | should |
| 8 | **Plauderterminal** | Glasbalkon, an old-style text terminal in a quiet corner (H2) | Pick from „Gesprächskarten“ (no free text, see §9); it answers with 15 visible pattern rules in the 1966 style and, after 5 exchanges, shows you its rules. V, P, two K | ELIZA (Weizenbaum, CACM 1966) talked with simple patterns, and people credited it with understanding [S13; the anecdotes are secondary]. Turing proposed in 1950 to judge machines by their answers, the "imitation game" [S12]. A good conversation is not a measurement (Prüffeld A, the VLA language step) | M | Own rules, not the original DOCTOR script; no player input stored or sent | could |
| 9 | **Leicht ist schwer** | Greifwerkstatt, the cabinet freed by retiring 03 C (R6 #6): an arm solves a chess puzzle instantly; next to it an SO-101 folds a towel, very slowly (H2) | V (a folded towel), P, R, K | Moravec's paradox (Moravec, *Mind Children*, 1988): reasoning is easy for computers, perception and moving like a toddler are hard [S14]. In 2010 a two-armed robot in Berkeley folded 50 of 50 towels, at 1,478 s per towel on average [S15]. Ties to the egg station: touch is the hard part | M | Paraphrase, no book quote; no robot brand needed | should |
| 10 | **Erklär's der Ente** | Regelgarten (the Open Duck RL station): a yellow rubber duck on the engineer's desk (H1) | E: „Erklär mir dein Problem.“ It replays the station's hint as three short steps, with a squeak. V (the duck), P, R, K | Rubber-duck debugging: explaining a problem step by step to a duck finds the bug; the name traces to *The Pragmatic Programmer* (1999) [S16; wording **unverified**] | S | A generic duck. Never "Disney", "BDX" or "droid" (a third-party trademark) in player text, even though Open Duck Mini is a miniature of a Disney design [I19] | **must** |
| 11 | **Hack-Sammler** (album) | Open Duck station C2 (R2): R2's real optimiser already produces three hacks, the belly flop, the statue and the instant faller [I23]. Provoke all three on purpose, with three different reward settings (H1; the station shows „1/3 Hacks gesehen“ only after the first) | A (Pannen-Wand entry „Belohnung wörtlich genommen“, with the three replays), R, K | Specification gaming: an agent meets the literal goal, not the intended one. DeepMind's examples include a simulated robot that hooked its legs together and slid along the ground [S17]. Seeing three different hacks teaches that each is a reward-design error, not a bug in the duck | S (on R2's station) | Never name the robot that inspired the Open Duck design | **must** |
| 12 | **Traumraum** (album) | Traumhangar (R3): after a dream step a door appears for one round; inside is the toy world model's world. Objects fade once you look away, the floor ends where it saw no data, and there is a shortcut that exists only in the dream (H1–H2) | Use the shortcut: back in reality it is a wall. A („Im Traum geschummelt“), R, K | Ha & Schmidhuber (2018) trained an agent inside its own world model's "dream" and transferred it back [S18]; DreamerV3 (Nature, 2025) learns inside imagination [S19]. R3 already models object permanence fading [I13]. Lesson: a dream is a prediction; agents can exploit a model's errors | M–L | EmAI's toy model only (UnifoLM-WMA-0 is non-commercial, R3/R6); no flicker over 3 per s [S45] | **must** |
| 13 | **Winke-Arm** | Bridge head (R5) or the farm stand: an idle SO-101. Look at it and wiggle the view left–right 3× within 1.5 s (H0/H1; EMI-01: „Manche Arme grüßen zurück.“) | It waves back and does a short dance. V (a little hand), P, R, K. Designed as most players' first find | Gesture recognition from one signal: your camera yaw, zero-crossings counted, with a threshold against false positives | S | The real model (Apache-2.0) with attribution [I19] | **must** |
| 14 | **Fotopunkt** | Ausguck, a camera mark on the floor (H0), also offered once after the lift-off | Photo mode: HUD off, frame „EmAI Academy · Schwebewerk · Datum“, a field-of-view slider in mm; saves a PNG locally (as the certificate does). V (a framed print), P | A camera model: focal length vs field of view (ties to SEHEN) | S–M | The wordmark per the brand rules (as on the certificate); nothing uploaded | **must** |
| 15 | **Werkbank der Offenen** | Behind the showroom, a door „Danke“ (H1); also linked from the pause menu (it is the attribution page anyway) | Every real model on a small plinth with its project, authors and licence; the software beside it. V, P, R („Open Hardware. Jeder kann einen bauen. Diese Leute haben es vorgemacht.“) | Open source as a way of working: SO-ARM100 (Apache-2.0), Open Duck Mini v2 (Apache-2.0), Unitree URDFs (BSD-3-Clause), three.js (MIT), Rapier (Apache-2.0), postprocessing (Zlib), troika (MIT), fonts (OFL) [I19]; the showroom models with their attribution lines from R4 §4 [I22]; R4 §6 and R7 own the final list | S | Licence compliance (Apache NOTICE, BSD copyright line); use project names, not logos | **must** |
| 16 | **304 Schachteln** | Lern-Dojo back room: a wall of 304 matchboxes and a noughts-and-crosses board (H2) | Play three rounds; you see the beads change in the boxes it used. V (a matchbox), P, K | MENACE (Donald Michie, 1961): reinforcement learning without a computer, 304 matchboxes, beads added for wins and removed for losses [S22] | M | Plain boxes, no match brand | could |
| 17 | **Hallo Welt des Lernens** | Regelgarten A: balance the pole 60 s on the Moon setting, and a plaque „1983“ slides out of the cart (H2) | V (the plaque), P, K | Barto, Sutton and Anderson (1983) balanced a simulated pole with a learning controller, the classic benchmark of reinforcement learning [S20]. What you balance by hand, the Open Duck learns by trial | S | – | could |
| 18 | **Fliehkraftregler** | Kielraum, a shelf: a small flyball governor whose balls rise with the rotor speed (live from the thrusters) (H1) | V (a governor ball), P, K | Maxwell's "On Governors" (Royal Society, read 1868) analysed when a speed governor oscillates or stays stable; it is often called the first control-theory paper [S21] | S | A generic mechanism, not a product | should |
| 19 | **Drohne** | Farm: the beehive stands next to the drone pad (H1) | E on the hive: V (a honeycomb tile), P, K | "Drone" means a male bee. The usual account traces the aircraft word to a 1935 British radio-controlled target called "Queen Bee"; the dating is disputed [S23]. Bees tell each other where food is by dancing (Karl von Frisch, Nobel Prize 1973, shared) [S24] | S | Chip „umstritten“ on the etymology | should |
| 20 | **Ein Stück Stoff von 1903** | Island drone dock: the oldest drone carries a tiny fabric patch under its panel, visible only while docked (H2) | V (a fabric square), P, K | In 2021 a NASA helicopter carried a swatch of the Wright brothers' 1903 Flyer under its solar panel; on 19 April 2021 it made the first powered, controlled flight on another planet; planned: up to 5 flights in 30 days; flown: 72 [S25] | S | Facts only; no agency logo | could |
| 21 | **Geplant: 90 Sol** | Island PV rows, on the cleaning robot's dock (L13) (H1) | V (a dust filter), P, K | A Mars rover built for 90 sols ran for almost 15 years; the wind once cleaned much of the dust off its panels; mission declared complete on 13 February 2019 [S26]. Here a robot cleans, because soiling costs ≥ 3–4 % of solar output [S36] | S | – | could |
| 22 | **Kartoffeln unter dem Kollektor** | Farm: one Hochbeet under the PV holds potatoes instead of tomatoes, sign „1981“ (H1) | V (a potato), P, K | Agrivoltaics began on paper in 1981 with „Kartoffeln unter dem Kollektor“ by Adolf Goetzberger (co-author Armin Zastrow per secondary sources); Fraunhofer ISE's pilot at Heggelbach (2016): 194 kWp at 5 m height; land-use efficiency 160 % (2017), 186 % in the drought summer of 2018 [S27]. One site, one hot year: say so | S | Coordinate with the farm design | should |
| 23 | **Igelhaus** | Farm hedge: a hedgehog house; peek in during the day and a hedgehog sleeps (H2). The mower's schedule on the board reads „Mähen nur tagsüber“ | V (a leaf), P, K | In a test of 18 robotic mowers, none detected juvenile hedgehogs under 200 g before touching them [S35]. Sensing has limits, so the farm mows by day. Phrase it gently (the study used hedgehog cadavers) | S–M | – | could |
| 24 | **Herztomate** (album) | Farm crate line: a heart-shaped tomato makes an arm hesitate and skip it (H0/H1) | Grab it (F) and put it in the crate: A („Nicht in der Verteilung“), R („Die kennt der Arm nicht. Nicht in den Trainingsdaten. Du schon.“) | Distribution shift, the Lern-Dojo lesson, in the wild | S | – | **must** |
| 25 | **Das Urkilogramm** | Prüffeld, a glass dome with a 1 kg check weight beside the measuring cell; you can lift it (grab verb) (H1) | V (a 1 kg weight), P, R, K | From 1889 until 20 May 2019 a metal cylinder defined the kilogram; since then the kilogram is defined by fixing the Planck constant, so even that old prototype now has a measurement uncertainty [S41] | S | – | should |

**Priority count:** must 9 (3, 5, 10, 11, 12, 13, 14, 15, 24), should 10 (1, 2, 4, 6, 7, 9, 18, 19, 22, 25), could 6 (8, 16, 17, 20, 21, 23). A first build of the 9 musts is about 2–3 weeks of one lane (S × 6, S–M × 1, M × 1, M–L × 1), with eggs 11 and 12 riding on R2's and R3's stations.

### 5.1 Rewards and integration (no new HUD)

| Piece | What | Built on |
|---|---|---|
| **Fundvitrine** | A glass cabinet next to the Pannen-Wand in R4's Schauhalle, 25 compartments; each find places its small object (procedural, ≤ 300 triangles each, one merged instanced draw + glass shared with the showroom). E on an object reopens its card | R6 §6.4 "rewards become things you get" |
| **„Funde“ in the Pass** | A second block in the album tab, **hidden until the first find**, then „Funde 3/25“ and 25 slots („?“ until found). Entdecker mode: after the lift-off, unfound slots show their one-line hint, as the album does today after a zone's stamps | `PassPanel.albumTab()` [I7] |
| **Save** | `secrets: string[]` in the Progress blob (optional, defaults to `[]` like `collectibles`), cleared on `progress:reset`, counted by `hasAnyProgress()` | `Progress.ts` [I7] |
| **EMI-01 radio** | One line per find via the existing queue; first find: „Ein Fundstück! Ich stell es in die Vitrine im Showroom.“ / “A find! I’ll put it in the showroom cabinet.” After the lift-off, H on the Ausguck gives the direction of the nearest unfound H0–H2 egg, like `capsuleHint()` (never H3) | `radio.ts` [I4] |
| **Feedback** | `juice.cue('collect')`, a small teal burst, a popup „Fundstück · Robota“ | `Juice.ts` [I5] |
| **Cards** | Existing InfoCards with the QUELLE chip, a source line and „Stand 2026-10“ | ARCHITECTURE §5.4 |
| **API** (proposal) | `ctx.game.secrets.register({ id, area, level, title, card, hint, vitrine })`, `find(id, at?)` (idempotent, emits `secret:found { id, n, total }`), `found()`; test hooks `__academy.secrets()` and `solve('world', 'secret-<id>')` | Same pattern as `ctx.game.collectibles` |
| **Never** | No stars, no gate, no leaderboard, no timer, no penalty for missing an egg; nothing on the critical path | DECISIONS D8, R6 |

### 5.2 Hint ladder and expected finds

| Level | Eggs | Design rule | Assumed find rate per first-time player (*est.*) |
|---|---|---|---|
| H0 | 13, 14, 24 (+ 5 starts at H0) | On a main path, moving or making a sound | ≈ 0.9 |
| H1 | 3, 4, 5, 7, 10, 11, 12, 15, 18, 19, 21, 22, 25 | A visible or audible cue within 10 m of a path | ≈ 0.3 |
| H2 | 1, 6, 8, 9, 16, 17, 20, 23 | Off the path; something odd points at it (a light, a sound, a shape) | ≈ 0.08 |
| H3 | 2 | A riddle; hinted only in the Fundbuch after 5 finds | ≈ 0.02 |

Expected finds ≈ 3 × 0.9 + 13 × 0.3 + 8 × 0.08 + 0.02 ≈ **7** per full first run (*est.*; §6.1 measures it).

### 5.3 Brand and legal rules for every egg

- **History, not homage-by-copy.** Facts with a source, in our own words. No copyrighted characters, quotes, logos, posters or level designs. Asimov's laws, Moravec's sentence and the ELIZA script are not quoted. Čapek's and Turing's texts are public domain in the EU, but are paraphrased anyway.
- **No look-alikes of real products.** Historical robots (the 1961 arm, Shakey, Grey Walter's tortoises) appear as facts and objects (a casting, a floor tile), never as a 3D replica. Real robots appear only as the licensed real models (SO-101, Open Duck, Unitree).
- **Third-party marks.** No "Konami", "Disney", "BDX", "Star Wars" or "droid". Agency names (NASA) and institutes (Fraunhofer ISE, IGB, NABU, BIPM, SRI, MIT) may be named in sourced cards; agency logos are not used. Carmakers stay anonymous („ein Autowerk“).
- **The EmAI mark is never touched.** Recamán eggs use the floor motif echo (teal, no ring, no disc) or sound; the tower relief and the Pass cover keep their rules (GDD §9.8, D10).
- **House style.** „du“, German decimal comma, a spaced en dash, no banned words („smart“, „innovativ“ …), no „Roboter ersetzen Menschen“ [I17]. EMI-01 lines ≤ 18 words, cards 40–65 words (Entdecker).
- **Safety and privacy.** No free text input (egg 8 uses cards), no uploads (egg 14 saves locally), no flashes over 3 per s (egg 12) [S45], gentle wording on animals (egg 23).

### 5.4 Player text, examples (DE default, EN; „du“)

Cards (Entdecker length):

| Egg | DE | EN |
|---|---|---|
| 1 | „Glied 18 der Recamán-Folge: 25 − 18 = 7 gibt es schon, also 25 + 18 = 43. Dann 62, 42, 63 … Kommt jede Zahl irgendwann vor? Das weiß niemand. 852 655 fehlt auch nach 10^612 Gliedern noch (OEIS A005132, Stand 2026). Manchmal ist ‚unbekannt‘ die ehrliche Antwort.“ | "Step 18 of Recamán's sequence: 25 − 18 = 7 is taken, so 25 + 18 = 43. Then 62, 42, 63 … Does every number appear one day? Nobody knows. 852,655 is still missing after 10^612 terms (OEIS A005132, 2026). Sometimes ‘unknown’ is the honest answer." |
| 3 | „Das Wort ‚Roboter‘ stammt aus dem Theaterstück R.U.R. von Karel Čapek (1920, uraufgeführt 1921). Vorgeschlagen hat es sein Bruder Josef, nach tschechisch ‚robota‘: Frondienst. Im Stück sind Roboter künstliche Arbeiter. Heute fragen wir: Welche Arbeit sollen Roboter übernehmen, damit Menschen mehr Zeit zum Denken haben?“ | "The word ‘robot’ comes from Karel Čapek's play R.U.R. (1920, first staged 1921). His brother Josef suggested it, from the Czech ‘robota’: forced labour. In the play, robots are artificial workers. Today we ask: which work should robots take on, so people have more time to think?" |
| 5 | „Shakey (Stanford Research Institute, 1966–1972) war der erste mobile Roboter, der plante: sehen, schließen, planen, Fehler beheben. Sein Team veröffentlichte 1968 die Wegsuche A*. Sie plant bis heute Routen, im Navi, in Spielen und für Marsrover. Den Namen bekam er, weil er so wackelte.“ | "Shakey (Stanford Research Institute, 1966–1972) was the first mobile robot that planned: see, infer, plan, recover. Its team published the A* path search in 1968. It still plans routes today, in car navigation, games and for Mars rovers. It got its name because it shook." |
| 7 | „1942 schrieb Isaac Asimov in der Kurzgeschichte ‚Runaround‘ drei Gesetze für Roboter auf. Das war Science-Fiction. Für echte Roboter gelten Normen und Gesetze: Die Sicherheitsnorm ISO 10218 wurde 2025 neu gefasst, die EU-Maschinenverordnung gilt ab dem 20. Januar 2027. Weniger poetisch, dafür prüfbar.“ | "In 1942 Isaac Asimov wrote three laws for robots into a short story, ‘Runaround’. That was science fiction. Real robots follow standards and laws: the safety standard ISO 10218 was revised in 2025, and the EU Machinery Regulation applies from 20 January 2027. Less poetic, but testable." |
| 11 | „Belohnung wörtlich genommen: Bauchklatscher, Statue, Sofort-Umfaller – jede Ente hat genau das getan, was du belohnt hast. Das nennt man Specification Gaming. Ein Beispiel von DeepMind: Ein simulierter Roboter hakte seine Beine ineinander und rutschte über den Boden. Die Belohnung sagt, was zählt. Nicht, was du meinst.“ | "Reward taken literally: belly flop, statue, instant faller – each duck did exactly what you rewarded. This is called specification gaming. One example from DeepMind: a simulated robot hooked its legs together and slid along the ground. A reward says what counts, not what you mean." |
| 25 | „Von 1889 bis zum 20. Mai 2019 war das Kilogramm ein Metallzylinder, das Urkilogramm. Seitdem legt eine Naturkonstante fest, was ein Kilogramm ist: das Plancksche Wirkungsquantum. Seitdem hat sogar der alte Zylinder eine Messunsicherheit. Auch die Referenz wird gemessen.“ | "From 1889 until 20 May 2019, the kilogram was a metal cylinder, the international prototype. Since then a constant of nature defines it: the Planck constant. Now even the old cylinder has a measurement uncertainty. Even the reference gets measured." |

EMI-01 lines (≤ 18 words):

| Moment | DE | EN |
|---|---|---|
| Egg 13 | „Er hat zurückgewinkt. Drei Wackler mit der Kamera – mehr braucht er nicht.“ | “It waved back. Three wiggles of your camera – that’s all it needs.” |
| Egg 10 | „Erklär’s der Ente. Wer laut erklärt, findet den Fehler oft selbst.“ | “Explain it to the duck. Explaining out loud often finds the bug.” |
| Egg 11 | „Drei Hacks, drei Lehren. Die Ente war nie kaputt – die Belohnung schon.“ | “Three hacks, three lessons. The duck was never broken – the reward was.” |
| Egg 12 | „Im Traum war da eine Tür. In echt ist da eine Wand. Gemessen.“ | “In the dream there was a door. In reality, a wall. Measured.” |
| Egg 14 | „Lächeln. Ich zähle bis drei. Das hier kann ich nicht messen.“ | “Smile. I’ll count to three. This one I can’t measure.” |
| Egg 5 | „Er plant um dich herum. Das Prinzip ist von 1968.“ | “It plans around you. The idea is from 1968.” |
| Bumblebee card hook | „Die Arme ernten. Bestäuben müssen die Hummeln.“ | “The arms harvest. The bumblebees do the pollinating.” |

---

## 6. Delight checklist per area

For every area: **one surprise** (something unexpected you see), **one reactive robot** (it answers what you do), **one sound moment** (a sound you remember), **one secret** (an egg). Names follow rc4, R3, R5 and R6; R6's quest changes may move stations, so map by area, not by station.

| Area | Surprise | Reactive robot | Sound moment | Secret |
|---|---|---|---|---|
| Trockendock and bridge head (R5) | The 66 m drop under the bridge, the dock arms twitching in a gust | The Winke-Arm | Hydraulic sigh of the dock arms in a gust | 13 Winke-Arm |
| Allee and plaza | The number line drawing itself under your feet (rc4) | Rovers that greet and yield (L5) | The arc notes (rc4) | 1 Die nächste Zahl, 5 Der Wackelige |
| Akademie-Turm and Ausguck | The view over the farm and the coast; the stork's nest seen from above | The tower drones peel off to look at you (rc4 tower drones, small change) | Wind at height, a distant train bell | 14 Fotopunkt |
| Schauhalle (R4) and foyer podium (R6) | A robot crate arriving by drone (R6) | The H2 under its cover turns its head as you pass (R6/R3) | The crate's unboxing hiss | 7 Drei Gesetze; 15 Werkbank der Offenen; the Fundvitrine itself |
| Traumhangar (R3) | Teal ghost futures | The R1 dreams before it steps and looks back at you | A low "dream" pad that detunes as the dream drifts | 12 Traumraum |
| Sensordom | The LiDAR-only room (rc4) | EMI-02 reaches (R6 #9) | The glass bump (rc4) | 6 Narziss |
| Regelgarten | 64 ducks wobbling (R2) | The duck that belly-flops | The squeak | 10 Ente, 11 Hack-Sammler, 17 Hallo Welt |
| Greifwerkstatt | The egg cracking in slow motion (rc4) | The towel-folding SO-101 that gives up and starts again | The crack | 9 Leicht ist schwer |
| Lern-Dojo | The SO-101 copying your wobble (R6) | The follower arm mirrors the leader | Servo chorus when leader and follower move together | 16 304 Schachteln |
| Dunkelfabrik | Lights out (rc4) | The night robot pausing for an RtI (rc4) | The MRC alarm (rc4) | 3 Robota, 4 Die erste Schicht |
| Prüffeld | The sign flip (rc4) | The measuring cell pushing back (rc4) | The shutter (rc4) | 25 Urkilogramm |
| Glasbalkon and Kanzeln | The dock floor through the glass (R5) | A rescue drone that hovers to look at you (rc4 sky drones) | A trim rotor's low hum under your feet | 8 Plauderterminal |
| Kielraum | The gimbal (rc4) | – (the finale talks) | The Regelkern tick (rc4) | 18 Fliehkraftregler |
| Farm (agrivoltaics) | Sheep under the PV; the bumblebee "buzz" on a flower | Arms that pause when you reach in; rovers yield | Bumblebee buzz, drip irrigation | 19 Drohne, 22 Kartoffeln, 23 Igelhaus, 24 Herztomate |
| Island deck rim and PV | The PV cleaning robot | Rovers, drones (rc4) | The test fan (rc4) | 20 Stoff von 1903, 21 90 Sol |
| Lift-off (R5) | Every SO-101 on the farm waves; the flower strips' arcs read from above (a motif echo, brand review needed) | The crew waving; the flock flushing | The 18-note Recamán melody (R5) | 2 Spieluhr's melody matches it; egg 14 offered after the climb |

### 6.1 How to test that first-time players find secrets without a guide

**Targets.** In a full first Entdecker run (≈ 60–90 min, the title promise): median **≥ 5 finds** without help; **≥ 1 find in the first 10 min** for at least 4 of 5 players (the Winke-Arm is designed for this); every H0 egg found by ≥ 80 % of players; every H1 egg by ≥ 1 player per round; **no egg found by everyone** (if it is, it is content, not a secret: move it into a station); an egg found by nobody in two rounds moves up one hint level.

**Step 1 · Automated secret audit before people (proposal, `tools/secret-audit.mjs`).** For every registered secret, using the playtest route the existing `playtest.mjs` walks:

| Check | Pass rule |
|---|---|
| Distance from the nearest main path (layout `PATHS`, R5 bridge, farm paths) | H0/H1 ≤ 10 m; H2 ≤ 30 m |
| Cue visible: the cue object in the frustum and not occluded (ray test) at sampled route points within 30 m | H0 on ≥ 80 % of the samples; H1 ≥ 30 %; H2 5–50 % |
| Cue audible: positional sound within range at some route point | H0 and H1 have one |
| Reachable and safe: the prompt can be reached on foot, nothing needs a pixel-precise jump, no route blocker | all |
| Curiosity bot: 30 runs of a wanderer that leaves the route at junctions with p = 0.2 and approaches anything that moves or makes a sound | per-egg find rate; flags H0 eggs < 50 % and H2 eggs > 50 % |
| No gate: the full `playtest.mjs` passes with 0 secrets found, and again with all found | all |

**Step 2 · People.** Two rounds of 5–6 first-time players each (five users find most usability problems; run several small rounds [S44]). There is no briefing about secrets and no prompting. Each tester exports a local JSON via `__academy.secrets()` and a 1 Hz position trace kept in memory only. Nothing is sent over the network (Phase 6 rule), and testers hand the file over themselves. Record the time of each find, the area and whether EMI-01 hinted. Between rounds, adjust the hint levels and rerun step 1.

**Step 3 · Regression.** Add `secret-audit` to the release checklist; `ending-check.mjs` must show the Fundvitrine contents after a reload; `text-audit.mjs` must cover the egg cards and lines.

---

## 7. Order of work and effort

| # | Item | Impact | Effort | Lane | Depends on |
|---|---|---|---|---|---|
| 1 | LifeDirector with tiers, the Hof-Takt and the budget hooks (L1) | H (enables everything) | M | WORLD | R5 ground group |
| 2 | Reactive robots: greet, safety ring, replan with a visible A* (L5 + egg 5) | H | M | WORLD | – |
| 3 | Region reacts to progress and the lift-off farewell (L17) | H | S | WORLD | R6 thruster events, R5 beats |
| 4 | Secrets API, the Pass „Funde“ block, the Fundvitrine, radio lines (§5.1) | H | M | CORE + WORLD | R4 Schauhalle |
| 5 | The farm shift with BatchedMesh SO-101s, crop, crates, rovers, board (L2–L4, L14) | H | L | WORLD + BUILD | farm placement (Q2), R7 asset |
| 6 | Bumblebees, sound beds (L8, L18) | M | S | WORLD + CORE | farm |
| 7 | The 9 must eggs (§5) | M | M (≈ 2–3 weeks in one lane) | WORLD + ZONES | R2 checkpoints (11), R3 hangar (12) |
| 8 | People (L7) | M | M | WORLD | Q1 |
| 9 | Birds, sheep, flower strips, turbines (L9–L12) | M | M | WORLD | farm |
| 10 | Secret audit and the human test (§6.1) | M | S (tool) + 2 sessions | BUILD | 4, 7 |
| 11 | Should and could eggs; L13, L15, L16, L20 | L–M | S each | – | – |

---

## 8. Questions for the founder

1. **People in the world?** (a) None, only robots and traces of people; (b) 6–10 stylised, faceless figures with jobs; (c) realistic humans. *Recommended:* (b). A future without people reads as dystopian, and the house line says „Menschen das Denken“. (b) is cheap and avoids the uncanny.
2. **Where does the farm live, given that R5 makes the ground unreachable after the lift-off?** (a) On the apron, walkable over a second bridge until the lift-off, seen from above in the farewell; (b) view-only from the deck; (c) (a) plus Tomatenkapseln aboard. *Recommended:* (c), on the sunlit WNW side. You walk it, the lift-off says goodbye to it, and its lesson flies with you.
3. **What do easter eggs give?** (a) Only a hidden list in the Pass; (b) a physical Fundvitrine in the showroom plus a hidden Pass block, no stars and no gates; (c) cosmetics or unlocks. *Recommended:* (b). R6 cuts gating systems; a cabinet that fills up is a reward you can see and changes the world without gating anything.
4. **Time of day?** (a) Keep R5's fixed low sun, with time told by the farm clock and the dusk after the lift-off; (b) a sun that moves with progress. *Recommended:* (a). (b) breaks R5's under-the-cloud lighting above 20.1° and costs environment-map rebuilds.
5. **Names in history cards** (Čapek, Asimov, Turing, Weizenbaum, Moravec, Shakey/SRI, NASA, Fraunhofer ISE) under the lifted D6? (a) Name people, research robots and institutes, and keep companies anonymous („ein Autowerk“); (b) anonymise everything as in rc4. *Recommended:* (a). History without names is not checkable, and companies are not needed for the lesson.

---

## 9. Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Spawn draw budget | R5's ground brings the spawn world to 106 of 110 [I11]; life could tip it | ≤ 4 life draws there; reuse instanced meshes; measure with `drawcalls.mjs` per module |
| 4K GPU margin at the plaza (0.07 ms) | Transparent or alpha-tested life near the plaza would break the gate [I10] | Opaque tiny meshes, the far tier as one proxy draw; `gpu-ab.mjs` before the art lock |
| BatchedMesh without multi-draw | Without `WEBGL_multi_draw`, one BatchedMesh becomes several GL calls [I18] | Measure on Safari and Firefox; fall back to per-link InstancedMesh (7 draws) |
| Ground content lost after the lift-off | R5: unreachable once airborne | The Tomatenkapseln aboard; the farewell beat; no egg that only exists on the ground is required (all are optional anyway) |
| A tenth progress system | R6 found nine competing systems | Eggs are hidden until the first find, never gate, and live in the album tab and the showroom |
| Wrong history facts | Sources disagree: R.U.R.'s first staging (2 or 25 January 1921 [S1, S2]), the 1961 plant's town [S4], the drone etymology [S23], 18 vs 19 mowers [S35] | Phrase at the level all sources agree on (year, country); a chip „umstritten“ where needed; this report's sources table goes into RELEASE §5's facts register |
| Third-party IP | Open Duck Mini is a miniature of a Disney character design; "droid" is a trademark; the Konami code is someone else's | Never in player text; our own code (egg 2); facts only, no replicas |
| Free text echoed back (ELIZA style) | A player types something offensive and the terminal repeats it in a screenshot | Multiple-choice cards only (egg 8) |
| Photosensitivity in the dream room | Glitch effects tempt fast flicker | ≤ 3 flashes per s [S45]; follow R5 §5.6; reduced motion swaps to still frames |
| Life that annoys | Rovers that block, birds that startle, sounds that loop audibly | Rule 5 (§3); yield ≤ 2 s; randomised scheduling; audio-levels check |
| Representation of people | Stylised figures can still stereotype | Mixed roles, ages and body types; no props that mark nationality or brand; review with the founder |
| Honest numbers turn into claims | The 66 % mixes crops and dates from 2014 [S37] | Show it as "research average, 50 projects, 2014", with SIM · LIVE for the farm's own count; newer figures are **unverified** and not shown |

---

## 10. Sources

All external sources accessed 2026-10-17.

**Repository (rc4 and Phase 7 scratch)**

| Id | What | Where |
|---|---|---|
| I1 | Service rovers: 8, 0.8 m/s, stop and turn within 2.5 m, kinematic colliders, 3 instanced meshes | `src/world/landscape/rovers.ts` |
| I2 | Maintenance drones: 4, dock 9–16 s, inspection round, +3 draws, fly on low | `src/world/landscape/drones.ts` |
| I3 | Sensorkapseln ≤ 16, 2 draws, segment pickup | `src/systems/Capsules.ts` |
| I4 | Radio: ≤ 1 line per 20 s, queue of 3, quiet rules, capsule hint | `src/world/radio.ts` |
| I5 | Juice: 256 particles, 1 draw, cues | `src/systems/Juice.ts`; docs/ARCHITECTURE.md §5.17 |
| I6 | Procedural audio, buses, loop kinds, level targets | `src/systems/Audio.ts` |
| I7 | Album defs, Pass tabs, Progress blob | `src/systems/Progress.ts`, `src/ui/PassPanel.ts` |
| I8 | Allee number line 0–25, 17 arcs, OEIS plaque | `src/world/landscape/numberline.ts` |
| I9 | Recamán melody, motif echo rules, arc directions, performance budget, audio limits | docs/GDD.md §8.1, §9.8, §10.1, §11, Appendix A |
| I10 | rc4 measured: spawn world 86, plaza 148 / 200, 4× CPU plaza 5.8 / 7.8 ms, 4K plaza 4.43 / 4.5 ms, 132 programs at the title, worst 238 / 0.90 M | docs/RELEASE.md §1a, §1b |
| I11 | Trockendock 3, apron r ≈ 400 m, coast 600 m WNW, cloud edge 20.1°, shade beyond ≈ 251 m ESE, ground ≤ 20 draws, director ≤ 0.3 ms, beats, "unreachable once airborne" | docs/research/R5-LIFTOFF.md §0, §3.1, §4.4, §5.2, §8.1 |
| I12 | Nine progress systems, showroom in the foyer, Pannen-Wand, thruster tests, retire 03 C, grab verb unused | docs/research/R6-QUEST-REVIEW.md §2.2, §4, §5, §6 |
| I13 | Traumhangar, toy world model, object permanence fade | docs/research/R3-UNITREE-WORLD-MODELS.md §5 |
| I14 | SO-101 reach ≈ 0.41 m (own FK calculation), payload estimate | docs/research/R1-SO101-VLA.md §1.1 |
| I15 | SO-101 converted model: 7 bodies, LOD0 24,078 / LOD1 6,496 triangles | `artifacts/phase7/pipeline/out/so101/so101.robot.json` (R7 scratch, git-ignored) |
| I16 | Node micro-benchmark of the update patterns | `artifacts/phase7/life-eastereggs/bench.mjs`, `bench.txt` (git-ignored) |
| I17 | Banned words, „Roboter übernehmen die harte Arbeit, Menschen das Denken“, number style, line and card lengths | docs/GLOSSARY.md (House style) |
| I18 | `BatchedMesh` API (`addGeometry`, `addInstance`, `setMatrixAt`, `setColorAt`, `setGeometryIdAt`) and `WEBGL_multi_draw` use in three r186 | `node_modules/three/src/objects/BatchedMesh.js`; `node_modules/three/src/renderers/webgl/WebGLBufferRenderer.js` |
| I19 | Licences: Open Duck Mini v2 Apache-2.0, SO-ARM100 Apache-2.0, unitree_ros BSD-3-Clause (downloaded LICENSE files); three MIT, Rapier Apache-2.0, postprocessing Zlib, troika MIT (package.json); Open Duck Mini README: "a miniature version of the BDX Droid by Disney" | `artifacts/phase7/downloads/{open_duck_mini_v2_b23317a,pipeline-so-arm100/repo,pipeline-unitree-ros/repo}/LICENSE`; `node_modules/*/package.json`; `artifacts/phase7/open-duck-rl/odm_README.md` |
| I20 | Sky traffic: sister platforms, cargo multicopters, rescue and tower drones | `src/world/sky.ts` |
| I21 | One landscape update loop, skipped when hidden | `src/world/landscape/index.ts` |
| I22 | Showroom as a glass „Schauhalle“ on the north axis (30 × 28 m), foyer stays R6's delivery podium; licence duties | docs/research/R4-SHOWROOM.md §0, §4, §6 |
| I23 | Open Duck station C2 „Belohnung bauen“: belly flop, statue and instant faller emerge from a real CEM optimiser in MuJoCo WASM | docs/research/R2-OPEN-DUCK-RL.md §0, §5.2 |

**External**

| Id | Claim | Source |
|---|---|---|
| S1 | R.U.R. introduced "robot"; first staged 2 January 1921 (Hradec Králové, amateur) and 25 January 1921 (National Theatre, Prague); *robota* = forced labour | https://en.wikipedia.org/wiki/R.U.R. |
| S2 | Josef Čapek suggested the word; centenary of the 1921 premiere | https://mzv.gov.cz/file/4171536/Robot__the_Most_Famous_Czech__Celebrates_100_Years___English.pdf · https://thereader.mitpress.mit.edu/origin-word-robot-rur/ |
| S4 | First industrial robot installed 1961 at a General Motors plant in New Jersey (Trenton / Ewing Township: sources differ), unloading a die-casting press | https://thehenryford.org/collections-and-research/digital-collections/artifact/183434 · https://spectrum.ieee.org/unimation-robot |
| S5 | Shakey: IEEE Milestone citation (perceive, infer, plan, recover, communicate), 1966–1972; A* used for driving directions, games, Mars rovers; name from "it shakes like hell" | https://ieeemilestones.ethw.org/Milestones:Shakey:_The_World%E2%80%99s_First_Mobile,_Intelligent_Robot,_1972 · https://spectrum.ieee.org/sri-shakey-robot-honored-as-ieee-milestone |
| S6 | Hart, Nilsson, Raphael (1968), A*, IEEE Trans. SSC 4(2):100–107 | https://doi.org/10.1109/TSSC.1968.300136 |
| S7 | Grey Walter's tortoises (1948/49, Bristol), Scientific American 1950; the mirror behaviour (secondary) | https://spectrum.ieee.org/meet-roombas-ancestor-cybernetic-tortoise · https://cse-robotics.engr.tamu.edu/dshell/cs689/papers/holland02first.pdf · https://cyberneticzoo.com/tag/elmer/ |
| S8 | "Runaround" (Astounding, March 1942): first explicit statement of the Three Laws; OED credits "Liar!" (1941) with "robotics" (secondary) | https://en.wikipedia.org/wiki/Runaround_(story) · https://sf-encyclopedia.com/entry/laws_of_robotics |
| S9 | ISO 10218-1/-2:2025 replace the 2011 editions and consolidate ISO/TS 15066's collaborative content | https://www.therobotreport.com/iso-10218-industrial-robot-safety-standard-receives-major-overhaul/ |
| S10 | ISO 10218 describes four techniques for collaborative operation; ISO/TS 15066 (2016) builds on them (speed and separation monitoring among them; from the search result, page not opened) | https://www.iso.org/news/2016/03/Ref2057.html |
| S11 | EU Machinery Regulation 2023/1230 applies from 20 January 2027 | https://osha.europa.eu/en/legislation/directive/regulation-20231230eu-machinery |
| S12 | Turing (1950), "Computing Machinery and Intelligence", Mind 59(236):433–460, the imitation game | https://doi.org/10.1093/mind/LIX.236.433 |
| S13 | Weizenbaum (1966), ELIZA, CACM 9(1):36–45; users credited it with understanding (secondary: secretary anecdote) | https://doi.org/10.1145/365153.365168 · https://en.wikipedia.org/wiki/ELIZA |
| S14 | Moravec, *Mind Children* (Harvard University Press, 1988); Moravec's paradox | https://www.ri.cmu.edu/publications/mind-children-the-future-of-robot-and-human-intelligence · https://en.wikipedia.org/wiki/Moravec%27s_paradox |
| S15 | Maitin-Shepard et al., ICRA 2010: 50/50 towels, average total 1,478 s per towel (read from the PDF text) | https://rll.berkeley.edu/pr/icra10/cloth-grasp-geometric-towel-folding-icra2010.pdf |
| S16 | Rubber-duck debugging traced to *The Pragmatic Programmer* (Hunt, Thomas, 1999); **book wording unverified** | https://www.freecodecamp.org/news/rubber-duck-debugging/ |
| S17 | Specification gaming: definition and examples (legs hooked together and sliding; boat race) | https://deepmind.google/discover/blog/specification-gaming-the-flip-side-of-ai-ingenuity/ |
| S18 | Ha & Schmidhuber (2018): agent trained inside its own world model's dream and transferred back | https://arxiv.org/abs/1803.10122 |
| S19 | Hafner et al., DreamerV3, Nature 640:647–653 (2025) | https://danijar.com/project/dreamerv3/ · https://ideas.repec.org/a/nat/nature/v640y2025i8059d10.1038_s41586-025-08744-2.html |
| S20 | Barto, Sutton, Anderson (1983), pole balancing with adaptive elements, IEEE SMC 13 | https://doi.org/10.1109/TSMC.1983.6313077 |
| S21 | Maxwell, "On Governors", Proc. R. Soc. 16:270–283, read 5 March 1868; "first significant control paper" is a historian's characterisation | https://doi.org/10.1098/rspl.1867.0055 · https://en.wikisource.org/wiki/Page:On_Governors.pdf/1 |
| S22 | MENACE: Michie (and Chambers), 1961, 304 matchboxes, beads; Michie 1963, The Computer Journal | https://people.csail.mit.edu/brooks/idocs/matchbox.pdf · https://en.wikipedia.org/wiki/Matchbox_Educable_Noughts_and_Crosses_Engine · https://www.computinghistory.org.uk/det/2919/The-Computer-Journal-October-1963/ |
| S23 | "Drone" from the 1935 Queen Bee target (Zaloga, via Word Routes); OED's first aircraft citation 1946 (via Grammarphobia); disputed | https://www.vocabulary.com/articles/wordroutes/how-drone-got-off-the-ground/ · https://grammarphobia.com/blog/2017/01/drone.html · https://languagelog.ldc.upenn.edu/nll/?p=73019 |
| S24 | Nobel Prize 1973 (shared) to Karl von Frisch for the "language" of bees | https://www.nobelprize.org/prizes/medicine/1973/press-release/ |
| S25 | Ingenuity: first flight 19 April 2021, planned up to 5 flights in 30 days, 72 flown, end announced 25 January 2024; Wright Flyer muslin swatch under the solar panel | https://www.nasa.gov/news-release/after-three-years-on-mars-nasas-ingenuity-helicopter-mission-ends/ · https://science.nasa.gov/photojournal/swatch-of-wright-brothers-flyer-1-attached-to-mars-helicopter/ |
| S26 | Opportunity: designed for 90 sols, operated almost 15 years, mission complete 13 February 2019; wind cleaned much of the dust off its panels (2014 self-portrait caption) | https://science.nasa.gov/mission/mer-opportunity/ |
| S27 | Goetzberger 1981 „Kartoffeln unter dem Kollektor“ (Sonnenenergie); Heggelbach 2016: 194 kWp, 5 m, 0.3 ha; land-use efficiency 160 % (2017), 186 % (2018); co-author Zastrow per secondary sources | https://www.ise.fraunhofer.de/de/presse-und-medien/presseinformationen/2016/photovoltaik-und-photosynthese-pilotanlage-am-bodensee-kombiniert-strom-und-nahrungsmittelproduktion.html · https://www.ise.fraunhofer.de/de/presse-und-medien/presseinformationen/2019/agrophotovoltaik-hohe-ernteertraege-im-hitzesommer.html |
| S28 | Barron-Gafford et al. 2019: cherry tomato production doubled under PV (drylands) (background for the farm owner; not used in a card here) | https://news.arizona.edu/news/agrivoltaics-proves-mutually-beneficial-across-food-water-energy-nexus · https://doi.org/10.1038/s41893-019-0364-5 |
| S29 | Cooley & Vallejo-Marín 2021: buzz-pollinating bees raise tomato fruit weight; non-buzzing bees incl. *Apis* do not significantly | https://doi.org/10.1093/jee/toab009 · https://dspace.stir.ac.uk/handle/1893/32495 |
| S30 | Buzz-pollination fundamental frequencies typically 100–400 Hz (De Luca et al. 2019; from the search result; some sources say up to 500 Hz) | https://repository.arizona.edu/handle/10150/634041 |
| S31 | Walston et al. 2024, ERL 19:014053: insect abundance tripled, native bees 20-fold at two Minnesota solar sites, 2018–2022 | https://doi.org/10.1088/1748-9326/ad0f72 · https://www.newswise.com/doescience/insect-populations-flourish-in-the-restored-habitats-of-solar-energy-facilities |
| S32 | bne 2019, „Solarparks – Gewinne für die Biodiversität“ (75 parks; sheep grazing documented; effects **unverified** in detail) | https://bne-online.de/wp-content/uploads/20191119_bne_Studie_Solarparks_Gewinne_fuer_die_Biodiversitaet.pdf |
| S33 | IGB „Der Tomatenfisch“ (ASTAF-PRO): fish and tomatoes in one greenhouse system (from the search result) | https://www.igb-berlin.de/sites/default/files/media-files/download-files/IGB_Broschuere_Der_Tomatenfisch_Deutsch.pdf |
| S34 | NABU, July 2026: > 15,000 white stork pairs expected in Germany; < 3,000 in the 1980s | https://www.nabu.de/news/2026/07/37350.html |
| S35 | Rasmussen et al. 2021, Animals 11:1191: 18 robotic mowers (one Oxford listing says 19); none detected juveniles < 200 g before touching | https://doaj.org/article/4f3fe496567f45c9822af9dbf499bc6a · https://www.biology.ox.ac.uk/node/3644866 |
| S36 | Ilse et al. 2019, Joule 3(10): soiling reduces global solar production by at least 3–4 % even with optimised cleaning | https://doi.org/10.1016/j.joule.2019.08.019 · https://elib.dlr.de/129424 |
| S37 | Bac et al. 2014 review (50 projects in 30 years): mean harvest success 66 %, cycle time 33 s; data too sparse per crop (read from the WUR thesis PDF) | https://edepot.wur.nl/327202 · https://doi.org/10.1002/rob.21525 |
| S38 | Arad et al. 2020 (sweet pepper robot): 61 % in best-fit crop, 18 % in current crop, 24 s cycle | https://research.wur.nl/en/publications/development-of-a-sweet-pepper-harvesting-robot/ · https://doi.org/10.1002/rob.21937 |
| S39 | EASA: open-category maximum height generally 120 m (UAS.OPEN.010) | https://www.easa.europa.eu/en/faq/116465 |
| S40 | Betz limit 16/27 ≈ 59.3 %; wind power ∝ v³ (university course notes) | https://courses.grainger.illinois.edu/ece333/fa2018/handouts/ECE_333_Lecture%206_Limits%20on%20Conversion.pdf |
| S41 | BIPM: the IPK defined the kilogram from 1889 until 20 May 2019; now defined via a fixed Planck constant; the IPK's mass now has an uncertainty | https://www.bipm.org/documents/20126/41483022/SI-FAQs-EN.pdf/0e5c4a2b-e3c4-d56e-f646-3f6ffee236be |
| S43 | OEIS A005132: terms 0, 1, 3, 6, 2, 7, 13, 20, 12, 21, 11, 22, 10, 23, 9, 24, 8, 25, 43, 62, 42, 63 …; 852,655 still missing after 10^612 terms (B. Chaffin, 8 February 2026); named after Bernardo Recamán | https://oeis.org/A005132 · https://en.wikipedia.org/wiki/Recam%C3%A1n%27s_sequence |
| S44 | Nielsen (2000): 5 users find most usability problems; run many small tests | https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/ |
| S45 | WCAG 2.2 SC 2.3.1: nothing flashes more than three times in any one second, or below the thresholds | https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html |
