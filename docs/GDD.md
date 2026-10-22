# EmAI Academy · SCHWEBEWERK

> **Founder decisions (2026-10-15) override this document — see [DECISIONS.md](DECISIONS.md):** du everywhere (no Sie, also in Entscheider mode) · no Unitree/third-party robots in v1 · EMI Rover 1.55 m · public web experience · no robot-vendor names in player-facing text (D6).
>
> **As built (release QA, 2026-10):** the copy tables in §6–§7 are the original drafts. The shipped strings live in `src/zones/<id>/strings.ts`, `src/world/finale/strings.ts` and `src/i18n/core.ts`; they use "du" throughout and differ where the polish pass corrected facts, wording or playability (§7 "As-built deviations"). The verified facts register is `docs/RELEASE.md`; Appendix D below is its summary. Terms: `docs/GLOSSARY.md`.
>
> **As built (Phase 4, 2026-10: fun + futuristic pass):** the island is now a white flying machine (no pines, rocks or mounds), the medallion is an anamorphic Recamán sculpture that the tower draws one line per stamp, and every station is a ★ challenge (`ctx.game`). §7 "As-built deviations, Phase 4" is the record; where it differs from §5, §6, §8 or §9, it wins.
>
> **As built (Phase 5, 2026-10: polish, release candidate 3):** the anamorphic sculpture is replaced by a planar Recamán relief on a gimbal-mounted dial (exact from every view), the solar trees by low PV tracker rows, the deck works (data packets, lanes, drones), the Kielraum is a dark control room, and QA-27 is closed. §7 "As-built deviations, Phase 5" wins over the Phase 4 section.
>
> **As built (Phase 7, 2026-10: the whole world, rc5):** the island sits in a dock on reclaimed mining land and the whole world gets it airborne; real robots with their published 3D models; the Schauhalle, the Sonnenacker, the Traumhangar and two use-case scenes; the Startprüfung and a flown lift-off. Summary in §14; the plan is `docs/PHASE7-PLAN.md`, decisions D15–D44.

### Game Design Document v1.0 (binding for the island team and the six zone teams)

| | |
|---|---|
| Date | 2026-10-15 |
| Status | v1.0. This document fixes the layout constants in §4. Engine API names in §5 are requirements; the engine (`src/core`) owns the final names. |
| Inputs | Brand brief, domain brief, tech brief, concepts LEARNER ("Schwebewerk"), EXECUTIVE ("Schwebewerk / Station 7"), WORLD ("Insel 17") |
| Engine | Vanilla three.js 0.186.1 + TypeScript (strict) + Vite + Rapier 0.21 (`-compat`), troika-three-text, postprocessing. No React. |
| Languages | German default, English toggle. Every player-facing string exists in both. |
| Modes | `entdecker` (explorer and learner) and `entscheider` (decision maker). Matches `Mode` in `src/core/types.ts`. |

---

## 0. Concept scores and synthesis decision

Each axis is scored 1–10, so the maximum total is 50.

| Concept | Learning | Executive | Wow | Buildability (6 parallel teams) | Brand fit | **Total** |
|---|---|---|---|---|---|---|
| LEARNER "Schwebewerk" | 9 | 6 | 8 | 7 | 8 | **38** |
| EXECUTIVE "Station 7" | 7 | 10 | 8 | 6 | 9 | **40** |
| WORLD "Insel 17" | 8 | 8 | 10 | 8 | 9 | **43** |

- **LEARNER.** It has the best pedagogy: the three-stamp arc, the glass wall in the Dunkelkammer, "Es hat dich gelernt", the cart-pole length discovery and the egg (position control versus force control). Its executive layer is thin. Several of its MUSTs are risky: riding the IK arm, and rotating gravity for the player.
- **EXECUTIVE.** It has the strongest decision-maker content: the Station 7 case, "Erst tippen, dann messen", the roster wall, the payback balance, the weakest gesture, the shutter and the κ calibration round. But its zones depend on each other (the payback balance needs data from Z3 and Z5), the global shift clock makes lighting expensive, and the 6-floor tower costs a lot.
- **WORLD.** It is the best spine: the island is a robot (a six-lobed hexacopter), the Jahresprüfung finale applies every lesson, and it has a clean zone contract with far LODs and private physics worlds. It lacks an imitation-learning zone, and its hard-work content is diluted.

**Synthesis:**
- **Spine.** From WORLD: the island is a robot (six lobes = six zones, each held up by its own thruster), and the finale is the island's annual audit.
- **Name.** "Schwebewerk", which two of the three concepts chose. "Insel 17" survives only as the hull designation on signage.
- **Grafted from LEARNER:**
  - the three-stamp arc per zone (Probieren → Verstehen → Messen)
  - the glass wall in the Dunkelkammer
  - the Lern-Dojo
  - the Recamán melody on stamps
  - the Failure-Mode-Album
  - the cart-pole length/gravity discovery
  - the egg with position control vs. force control
- **Grafted from EXECUTIVE:**
  - predictions and Prognose-Güte
  - the Station 7 scenario
  - the Schichtplan-Wand and the Amortisationswaage
  - the weakest gesture and the Befundkarte
  - the shutter with the 100 % sign
  - the κ calibration round
  - the island's self-measurement board

**Cut on purpose:**

| Cut | Reason |
|---|---|
| Riding the IK arm | Motion sickness and character-controller risk |
| 6-floor autonomy elevator | Replaced by gesture cards |
| Global shift-clock lighting | Shadow cost and coupling between zones |
| Crane cab | Scope |
| 17 Bögen plaques | Replaced by the stamps; 18 stamps = ring + 17 arcs of the mark |
| Rotated gravity for the player | Kept only for loose crates in the finale |
| Unitree G1/H1 as the failing "vendor" robot | Brand and legal risk; see §13 |

---

## 1. Title, premise, hook

**Title:** *EmAI Academy: Schwebewerk*. EN subtitle: *The Floating Works*.
**Title-screen lines:** **Sehen. Verstehen. Handeln.** Below it, smaller: *Messung statt Marketing.*

**Premise.**
- The Schwebewerk is a mechanical island 204 m across, hanging 180 m above a sea of clouds at golden hour.
- It has no anti-gravity. It is a **hexacopter**: six ducted thrusters, one under each lobe. In the keel, the **Regelkern** (an IMU inside a gimballed gyroscope) measures the island's attitude 1,000 times per second and corrects it.
- Every lesson on the island is a smaller version of what keeps the island in the air: a sensor, a controller, actuators, learning, work and measurement.

> *„Diese Insel fällt ständig. Tausendmal pro Sekunde fängt sie sich wieder."*
> *"This island is always falling. A thousand times a second, it catches itself."*

**The hook.** In the first minute, after a gust: **„Die Insel ist ein Roboter. Und du stehst drauf."** / "The island is a robot, and you're standing on it."

**The narrative.**
- Today is the island's **Jahresprüfung** (annual audit).
- A vendor offers a new learned attitude controller, **„NN-Lage v2"**, and claims "99 % stabil".
- Before anyone may judge it, visitors earn the **Academy-Pass** by measuring things themselves in six zones:

| Zone | Verb | Topic |
|---|---|---|
| 01 | SEHEN | sensors |
| 02 | REGELN | control |
| 03 | GREIFEN | kinematics and grasping |
| 04 | LERNEN | imitation learning |
| 05 | ARBEITEN | hard work and the dark factory |
| 06 | MESSEN | EmAI's method |

- With stamps in **4 zones**, the keel lift opens. In the **Kielraum** (keel room), the player:
  1. tries to hold the island level by hand;
  2. measures the vendor's controller over 200 gust trials;
  3. writes a recommendation in EmAI's template.
- "Kein Pilot" is a valid win.

The flying island and its vendor are fiction and carry the `FIKTION` chip: *„Fiktion. Der Regelkreis dahinter ist echt."* / *"Fiction. The control loop behind it is real."*

---

## 2. EMI, the guide

**What EMI is.** EMI is EmAI's own open-hardware robot. The in-game copy calls it a **kognitiver Roboter** and never uses the word "humanoid".
- In-game it is the **EMI Rover**: a wheeled lower body behind the waist port, an upper body with two arms, a helmet head and a wrap-around visor with two swept eyes.
- It is shown at the **concept size of 1.55 m** (`HEIGHT = 1550` in EmAI's EMI design parameters, `params.py`; floor→port 830 mm, port→shoulder 450 mm, shoulder→top 270 mm). Take dimensions from `params.py` and never invent them. The founder still has to confirm the size (§13).

**Why there are seven EMIs.** Open hardware means anyone can build one: *„Open Hardware. Jeder kann einen bauen. Wir haben sieben."* *(Phase 7: nine. EMI-08 works the Sonnenacker and EMI-09 roams the Revier, so the line is „Wir haben neun.“, §14.)*

| Unit | Location |
|---|---|
| EMI-01 | hub and finale |
| EMI-02 | Sensordom |
| EMI-03 | Regelgarten |
| EMI-04 | Greifwerkstatt |
| EMI-05 | Lern-Dojo |
| EMI-06 | Dunkelfabrik |
| EMI-07 | Prüffeld |

Each zone spawns its own unit, which keeps the teams independent.

**Look** (CMF spec, binding):

| Part | Colour | Finish |
|---|---|---|
| Shell | `#E7E5E4` (stone-200) | matte |
| Shell shadow | `#A8A29E` | matte |
| Chassis | `#292929` | matte |
| Structure | `#141414` | matte |
| Carbon | `#1F1F1F` | semi-gloss |
| Visor | `#0C0A09` | gloss |
| Eyes | two swept strips, teal `#2DD4BF` | — |
| Accent | `#FF6700` | — |

- Orange appears **only as rings on joint caps**: *„Orange heißt bei mir: das dreht sich."* It covers at most 2 % of EMI's visible area.
- Everything within 30 mm of a rotation axis is dark chassis.
- The Recamán mark is debossed into the chest shell, in shell colour, not orange.

**Joints:** 17 revolute joints plus 2 wheels.
- Body: waist_yaw, neck_yaw, neck_pitch.
- Per arm (×2): shoulder_pitch, shoulder_roll, shoulder_yaw, elbow, wrist_roll, wrist_pitch, wrist_yaw.

Players can literally count the orange rings.

**Personality:**
- Precise, modest and dry. It names its own limits, uses numbers and never hypes.
- It addresses the player as **du** in Entdecker mode and **Sie** in Entscheider mode, and refers to itself as "ich".
- Lines are at most 18 words and are shown as subtitles for 4–6 s with a procedural 3-note chirp. There is no voice-over.

Signature lines:

| DE | EN |
|---|---|
| „Ich weiß es nicht. Lass es uns messen." / „…Messen wir es." | "I don't know. Let's measure it." |
| „Laufen kann ich noch nicht. Deshalb habe ich Räder." | "I can't walk yet. That's why I have wheels." |
| „Beine sind der schwerste, gefährlichste und teuerste Teil. Die kommen bei mir zuletzt." | "Legs are the hardest, most dangerous and most expensive part. They come last for me." |
| „Orange heißt bei mir: das dreht sich." | "On me, orange means: this rotates." |
| „Kein Pilot ist auch ein Ergebnis." | "'No pilot' is a result too." |

**Help key.** **H** makes the nearest EMI explain the current station at the depth of the current mode. It reads the station's card plus the "Für Neugierige" text (Entdecker) or the Befundkarte line (Entscheider).

---

## 3. Audience modes

The player chooses a mode on the title screen and can switch at any time in the Esc menu or the Pass.
- **The world and the mechanics are identical in both modes.** Only the text layer, the default overlays, the pacing and the outputs change.
- Every zone builds each station once and supplies strings with `{ entdecker, entscheider }` variants (`ModeString` in `src/core/types.ts`).

| | **Entdecker** | **Entscheider** |
|---|---|---|
| Address | **du** (the founder must confirm this, §13) | **Sie** |
| Tone | technical + accessible | technical + direct |
| Suggested route | Clockwise 01 → 06, then the finale. About 75–90 min | **Werkleiter-Route**, about 25 min: 05 (A short, C★) → 06 (A, B★) → 02 (B★) → 04 (B★) → finale. Other stations optional |
| Probieren stations | Full, with retries and best scores | Can be skipped after 30 s; the stamp then shows grey **„übersprungen"** (the record stays honest) |
| Overlays (vectors, cones, formulas) | On by default | Off by default, toggled with **O** |
| Text | Concept card plus a **„Für Neugierige"** drawer (formulas) | Concept card plus a **Befundkarte** after the ★ station: *Messgröße · Grenze · Frage an den Anbieter · Für Ihr Werk* |
| Predictions („Erst tippen, dann messen") | Framed as "Wie sicher bist du?" | Framed as "Was heißt das für Ihre Investition?" |
| Finale output | Certificate with personal measurements | Certificate plus the nine-questions checklist with the player's Befundkarten (PNG + clipboard) |

**★ stations**, one per zone, form the Entscheider core:

| Zone | ★ station |
|---|---|
| 01 Sensordom | C Messstrecke |
| 02 Regelgarten | B Regler & Takt |
| 03 Greifwerkstatt | C 200 Griffe |
| 04 Lern-Dojo | B Nachmachen |
| 05 Dunkelfabrik | C Licht aus |
| 06 Prüffeld | B Unter Last |

**Source chips.** Every number on screen carries exactly one chip (§5.6). This is how the brand's honesty rule becomes visible.

---

## 4. Layout (binding)

### 4.1 Coordinate system

- **Axes and units:**
  - **Units:** metres. **y is up.** The origin (0, 0, 0) is the hub centre (the Akademie-Turm axis) at deck level.
  - **Compass:** north = **−z**, east = **+x**, south = +z, west = −x.
  - **Bearing** b is in degrees clockwise from north, as seen from above. The direction vector for bearing b is `(sin b, 0, −cos b)`.
- **Deck heights:**
  - The walkable deck is at **y = 0** everywhere: hub, paths and all six plots.
  - Vertical variety comes from the Ausguck (+44), the Glasbalkon (a glass floor at 0), the underside (−4 to −60) and the cloud sea (−180).
- **Player:**
  - Capsule: radius 0.35 m, height 1.75 m, eye height 1.65 m.
  - Step-up 0.35 m, max slope 40°, jump height 0.6 m.
  - Walk 4.5 m/s, sprint 8 m/s.

### 4.2 Island outline

| Element | Shape | Extent |
|---|---|---|
| Main deck | Disc r = **85**, top y = 0, 4 m thick (bottom y = −4) | Riveted 2 m rim band with a 1.1 m railing wherever nothing attaches |
| Six lobes | Discs r = **22**, centred on the r = **80** ring at bearings 30/90/150/210/270/330 | Reach r = 102. They overhang the main deck by 17 m; a 0.3 m dark seam groove marks the join |
| Landedeck (S) | Disc r = 9, centre (0, 92) | z 83 → 101 |
| Glasbalkon (N) | Disc r = 7, centre (0, −92), glass floor | z −85 → −99 |
| 4 Aussichtskanzeln | Discs r = 4 at r = 88, bearings 60/120/240/300 | Small pulpits looking down at the thrusters |

From any distance, the silhouette reads as a **six-lobed gear about 204 m across**.

### 4.3 Plot table

All plots are at ground y = 0, plot radius 22, with a height cap of 24 m. The hub tower is 48 m.

- **rotationY** is the zone root group's `rotation.y`: `atan2(−anchor.x, −anchor.z)`.
- **Facing** is the bearing the zone's front or gate faces. It always points at the hub.
- **Spawn** is where `?zone=<id>` places the player: on the spoke, just outside the gate, looking into the zone.

| № | id (`src/zones/<id>`) | DE / EN | Verb | Anchor (x, z) | Bearing | rotationY | Facing | Gate (world) | Spawn feet (world) → look bearing | EMI |
|---|---|---|---|---|---|---|---|---|---|---|
| — | `hub` | Akademie / Academy | — | (0, 0) | — | 0 | S (180) for the medallion | — | (0, 0, 94.5) → 0 (north) | EMI-01 |
| 01 | `sensordom` | Sensordom / Sensor Dome | SEHEN / SEE | **(−80.00, 0.00)** | 270 | **+90°** (+π/2) | 90 | (−58.00, 0.00) | (−56.00, 0, 0.00) → 270 | EMI-02 |
| 02 | `regelgarten` | Regelgarten / Control Garden | REGELN / CONTROL | **(−40.00, −69.28)** | 330 | **+30°** (+π/6) | 150 | (−29.00, −50.23) | (−28.00, 0, −48.50) → 330 | EMI-03 |
| 03 | `greifwerkstatt` | Greifwerkstatt / Grip Workshop | GREIFEN / GRASP | **(40.00, −69.28)** | 30 | **−30°** (−π/6) | 210 | (29.00, −50.23) | (28.00, 0, −48.50) → 30 | EMI-04 |
| 04 | `lern-dojo` | Lern-Dojo / Learning Dojo | LERNEN / LEARN | **(80.00, 0.00)** | 90 | **−90°** (−π/2) | 270 | (58.00, 0.00) | (56.00, 0, 0.00) → 90 | EMI-05 |
| 05 | `dunkelfabrik` | Dunkelfabrik / Dark Factory | ARBEITEN / WORK | **(40.00, 69.28)** | 150 | **−150°** (−5π/6) | 330 | (29.00, 50.23) | (28.00, 0, 48.50) → 150 | EMI-06 |
| 06 | `prueffeld` | Prüffeld / Proving Ground | MESSEN / MEASURE | **(−40.00, 69.28)** | 210 | **+150°** (+5π/6) | 30 | (−29.00, 50.23) | (−28.00, 0, 48.50) → 210 | EMI-07 |

**Clearances (checked):**
- Adjacent plot centres are 80 m apart, which leaves **36 m of free deck** between plot edges.
- The plot inner edge is at r = 58, the ring path's outer edge at r = 48.5, and the plaza edge at r = 32.
- Landedeck ↔ SE/SW plots: 15 m. Glasbalkon ↔ NW/NE plots: 17 m. Kanzeln ↔ nearest plot: 18 m.

### 4.4 Zone local frame (what every zone team builds in)

- The zone's root group is placed by the engine at `(anchor.x, 0, anchor.z)` with `rotation.y = rotationY`. **Zone teams build only in local coordinates.**
- **Local +z points at the hub.** The gate is at local **(0, 0, +22)**, and the gate opening must be at least 6 m wide, centred on x = 0.
- A visitor standing at the gate looking into the zone looks along **local −z**, like a default three.js camera, so **local +x is on their right**.
- Local → world:
  - `world.x = ax + lx·cos θ + lz·sin θ`
  - `world.z = az − lx·sin θ + lz·cos θ`
  - where θ = rotationY.
- **Everything must stay inside the cylinder r ≤ 22 (local), 0 ≤ y ≤ 24.** That includes the swept volumes of moving parts.
  - The outer rim arc (the part of the lobe beyond the main deck) gets a 1.1 m railing from the island team at r 21.8–22.
  - A zone that needs a gap (Dunkelfabrik's Verladebucht) declares it in its manifest as `railingGaps: [{ fromDeg, toDeg }]`, in local degrees where 0 = local −z and angles grow clockwise from above. The zone must then block the player with its own collider.
- The **gate mast** (14 m, island team) stands outside the plot at r = 57, 5 m to the clockwise side of the spoke. Zones supply only their name strings and glyph.

### 4.5 Paths (island team)

| Path | Geometry | Width |
|---|---|---|
| **Avenue** ("Recamán-Allee") | Straight, bearing 180, from Landedeck (0, 83) to plaza edge (0, 32), 51 m | 8 m |
| **Plaza** | Disc r = 32 around the tower | — |
| **6 spokes** | Radial on each zone bearing, plaza edge r = 32 → gate r = 58, 26 m | 6 m |
| **North spoke** | Bearing 0, r 32 → 85, to the Glasbalkon | 4 m |
| **Ring path** | Circle r = 46 (43.5 – 48.5), connects all spokes and the avenue | 5 m |
| **4 Kanzel stubs** | Radial at 60/120/240/300, r 48.5 → 84 | 3 m |

Travel times at 4.5 m/s:
- plaza edge → gate: about 6 s
- gate → neighbouring gate via the ring (12 + 48 + 12 m): about 16 s
- landing → Libelle: about 17 s

**Path connections per zone:**
- Every zone has its spoke to the plaza, plus a ring path to both neighbours. Clockwise, the ring order is 01 → 02 → 03 → 04 → 05 → 06 → 01.
- The avenue meets the ring between 05 and 06. The north spoke meets it between 02 and 03.

### 4.6 Transit pads (Sprungplatten)

- **Hub pads:** Ø 3 m, flush with the deck, at **r = 27** on each zone bearing:

| Bearing | Position (x, z) |
|---|---|
| 270 | (−27.0, 0) |
| 330 | (−13.5, −23.38) |
| 30 | (13.5, −23.38) |
| 90 | (27.0, 0) |
| 150 | (13.5, 23.38) |
| 210 | (−13.5, 23.38) |

- **Zone pads:** at **r = 52** on each spoke:

| Bearing | Position (x, z) |
|---|---|
| 270 | (−52, 0) |
| 330 | (−26.0, −45.03) |
| 30 | (26.0, −45.03) |
| 90 | (52, 0) |
| 150 | (26.0, 45.03) |
| 210 | (−26.0, 45.03) |

- Pads are paired by bearing (hub pad b ↔ zone pad b). They are ballistic hops of **T = 2.5 s**: 25 m horizontal, apex 7.66 m, v₀ ≈ 16.1 m/s.

### 4.7 Spawn and first view

- **After the ascent** (or with `?skipIntro=1`): feet at **(0, 0, 94.5)** on the Landedeck, **yaw = bearing 0** (looking −z, at the tower), **pitch +6°**.
- **What the first frame shows:**
  - the Recamán medallion on the tower's south face, centred;
  - Prüffeld on the left (SW) and the Dunkelfabrik monolith on the right (SE);
  - the avenue railing leading the eye;
  - the sun to the front-left (WNW).
- **`?zone=<id>`:** spawn per the table in §4.3.

### 4.8 Vertical layers

| y (m) | What is there | Owner |
|---|---|---|
| +44 … +48 | **Ausguck**: ring deck r 9–13 around the tower top, railing 1.1 m | hub |
| +12 … +36 | Recamán medallion (Ø 24 m), on the tower's south face | hub |
| 0 | Deck: plaza, paths, plots, Landedeck, Glasbalkon (glass), Kanzeln | all |
| −4 | Deck underside: beam grid (instanced) | hub |
| −12 | Thruster pods under each lobe at (anchor.x, −12, anchor.z): ducted rotor Ø 15 m, 6 blades, orange ring on the hub only | hub |
| −4 → −60 | Keel cone: open truss lattice, r 60 at the top → r 4 at the bottom | hub |
| −36 | **Kielraum** catwalk ring r 9–13 (the finale) | hub |
| −40 | **Regelkern**: three counter-rotating gimbal rings Ø 10/8.5/7 m around an IMU sphere | hub |
| −172, −180 | Cloud sea: two fbm shader planes | hub/env |
| far | 3 "Prüfinseln" silhouettes at 900–1,400 m (bearings 40, 160, 260), one draw call each | env |

### 4.9 ASCII map (schematic; the tables above are authoritative)

```
                                           N  (−z)
                                     .-------------.
                                     |  GLASBALKON |  (0,−92)  glass floor
          .-----------.              '------+------'              .-----------.
         /    02       \                    |                    /    03       \
        |  REGELGARTEN  |                   |                   | GREIFWERKST.  |
        |  (−40,−69.3)  |                   |                   |  (40,−69.3)   |
         \  b=330      /                    |                    \   b=30      /
          '-----+-----'  . . . . . . . . . .|. . . . . . . . . .  '-----+-----'
       K300      \   . '                    |                    ' .   /      K60
                  \.                  .-----+-----.                  ./
                  .                  /    PLAZA    \                  .
 .-----------.   .                  |   .-------.   |                  .   .-----------.
/    01       \  .                  |   | TURM  |   |                  .  /    04       \
|  SENSORDOM   |=:==================|=  | (0,0) |  =|==================:=|  LERN-DOJO    |
|  (−80,0)     |  .                 |   '-------'   |                 .  |  (80,0)       |
\  b=270      /   .                 |    Libelle    |                 .   \  b=90       /
 '-----------'     .                 \      o      /                 .     '-----------'
       K240         \ .               '-----+-----'               . /         K120
                     \   ' .                |                 . '   /
          .-----+-----'      ' . . . . . . .|. . . . . . . . '      '-----+-----.
         /    06       \           RECAMÁN-ALLEE (8 m)            /    05       \
        |   PRÜFFELD    |                   |                    |  DUNKELFABRIK |
        |  (−40,69.3)   |                   |                    |  (40,69.3)    |
         \  b=210      /              .-----+-----.               \  b=150      /
          '-----------'               | LANDEDECK |                '-----------'
                                      |  (0,92)   |  spawn (0,0,94.5) look N
                                      '-----------'
                                           S  (+z)
 Legend: = spokes (6 m)   . . ring path r=46   K = Aussichtskanzel   plots r=22   main deck r=85
```

---

## 5. Shared systems (engine + island team "kit")

### 5.1 Zone contract

Each `src/zones/<id>/index.ts` exports a zone definition. The engine registry calls `create(ctx)` when the zone loads.

```ts
export default defineZone({
  id: 'sensordom',                       // kebab-case, equals folder name and ?zone= value
  number: 1,
  name:  { de: 'Sensordom', en: 'Sensor Dome' },
  verb:  { de: 'SEHEN',     en: 'SEE' },
  eyebrow: { de: '// 01 · SEHEN · SENSORIK', en: '// 01 · SEE · SENSING' },
  glyph: 'sensor',                       // HUD/map glyph id (see §9.7)
  stations: [                            // exactly three, order A, B, C
    { id: 'messbrille' }, { id: 'dunkelkammer' }, { id: 'messstrecke', star: true },
  ],
  questions: [9],                        // vendor-question cards this zone awards (§8.3)
  album: 'spiegel-geisterpunkte',        // hidden Failure-Mode-Album entry id
  railingGaps: [],                       // optional, local degrees
  create(ctx: ZoneContext): ZoneInstance,
});

interface ZoneInstance {
  update(dt: number, elapsed: number): void; // called ONLY while active (player ≤ 60 m from anchor)
  updateFar?(dt: number): void;              // optional, ≤ 0.1 ms, animates exterior/far (LiDAR fan, pendulum sway)
  onEnter?(): void;                          // player crosses into r ≤ 22
  onExit?(): void;
  dispose(): void;
}
```

**Detail tiers.** The engine switches visibility by distance from the anchor. Zones populate three groups:

| Group | Visible when player-to-anchor distance is… | Budget |
|---|---|---|
| `ctx.groups.detail` (stations, interiors, small props) | ≤ 45 m | ≤ 80 draw calls, ≤ 90k tris |
| `ctx.groups.exterior` (landmark, shell, ground) | ≤ 130 m | ≤ 40 draw calls, ≤ 60k tris |
| `ctx.groups.far` (silhouette) | > 130 m | ≤ 3 draw calls, ≤ 5k tris |

**Capabilities `ctx` must provide.** These are requirements; the engine names them.

| Capability | Requirement |
|---|---|
| `ctx.groups` | The three groups above, already placed and rotated |
| `ctx.physics` | `RAPIER`, the shared `world` (player and static colliders), helpers to add static box/trimesh colliders in **local** coordinates, and `createPrivateWorld()` for zone-only simulations. The engine steps private worlds only while the zone is active. Collision groups: `PLAYER`, `STATIC`, `SENSOR_IGNORE` (e.g. glass invisible to LiDAR rays) |
| `ctx.player` | World and local position, view direction, `setSpeedFactor(f)`, `setHeadBob(scale)`, `setVignette(a)`, `lockMovement(bool)`, `teleportLocal(pos, lookBearing)`, `carry(object3D \| null)` (camera-attached) |
| `ctx.interact` | `register(object, { label: Text, radius = 2.5, onUse, enabled() })` with orange-bracket focus. **Bedienmodus**: `enterOperate({ cameraPose (local), panel?, onExit })` eases the camera in 0.4 s, frees the cursor and disables WASD movement. **Esc** leaves |
| `ctx.ui` | `card()`, `subtitle(speaker, Text)`, `hint()`, `chip(type)`, `panel()` (DOM controls in brand style), `kennlinie()`, `predict()`, `plot()`, `readout()` (Geist Mono telemetry line) |
| `ctx.i18n` | `t(key, params)`, `lang`, `mode`, `onChange(cb)`. Number formatting through `Intl.NumberFormat(lang)` (DE uses a decimal comma) |
| `ctx.pass` | `award(stationId, { value: Text, skipped?: boolean })`, `recordPrediction(stationId, predicted, measured, { min, max, scale: 'linear' \| 'log' })`, `awardQuestion(n)`, `unlockAlbum(id)`, `has(stationId)` |
| `ctx.emi` | `spawn({ unit: 'EMI-02', pose (local) })` → handle (§5.8) |
| `ctx.island` | `onGust(cb({ strength 0..1, bearing }))`, `tiltDeg` (read-only) |
| `ctx.audio` | `ctx` (AudioContext), `zoneBus` (attenuated by player distance: full ≤ 20 m, silent ≥ 60 m), procedural kit (§10) |
| `ctx.materials` | Shared material library (§9.3). **Zones must not create one-off variants of library materials** |
| `ctx.text` | troika helpers: `sign()` (Space Grotesk), `label()` (Geist Mono eyebrow), BatchedText for many labels |
| `ctx.env` | `enterInterior({ ambient: 0..1, background?, fog? })` / `exitInterior()`. Scales hemisphere/sky light and overrides background/fog while the camera is inside a closed volume (Sensordom, Dunkelfabrik, Kielraum) |
| `ctx.settings` | `reducedMotion`, `quality` (`low` \| `medium` \| `high`), `overlays` (O key) |
| `ctx.debug` | `register('solve-a' \| 'solve-b' \| 'solve-c' \| 'album' \| string, fn)`. Lets Playwright agents complete stations deterministically |

**String keys:** `zone.<id>.<stationId>.<key>`. Each value is a `ModeString` per language. EN is required for every key.

**Pass unit ids** are stable, for a later link to academy.emai.dev XP: `<zoneId>.<stationId>`, e.g. `sensordom.messbrille`.

### 5.2 Controls (desktop)

Movement uses `KeyboardEvent.code` (physical keys, so it is safe on QWERTZ). Prompts show the layout's own key labels where the browser exposes them.

| Input | Action |
|---|---|
| Mouse | Look (pointer lock) |
| W A S D | Move |
| Shift | Sprint |
| Space | Jump; launch on a pad |
| **E** | Use / talk / launch |
| **H** | Ask EMI |
| **Tab** | Academy-Pass |
| **M** | Map |
| **O** | Toggle overlays |
| **Esc** | Leave Bedienmodus, otherwise menu |
| Digits 1–6 | Zone-specific (e.g. sensor modes) |

### 5.3 HUD

| Position | Element |
|---|---|
| Top centre | Compass ribbon with zone glyphs. The current objective is the only orange marker |
| Top left | Objective card |
| Centre | Reticle: four orange corner brackets (14 px legs, 8 px gap) that expand to frame the focused interactable. Prompt beneath: `[E] Benutzen · Leitstand` |
| Bottom centre | Subtitles: `EMI-03 ›` speaker tag in Geist Mono, line in Geist |
| Bottom right | Telemetry readouts and chips |

All cards are `#1F1F1F` with a 1 px `#2A2A2A` border, 12 px radius, and an orange-to-teal 1 px hairline on top. Transitions are 0.2 s ease.

### 5.4 Objective system

- `objective.set(zoneId | 'hub' | 'finale')`. Only one is active at a time. It lights:
  - that zone's gate-mast beacon in orange (others are stone if unvisited, teal if visited);
  - the orange inlay on that spoke;
  - the orange compass marker.
- Default sequence:
  - Entdecker: 01 → … → 06 → finale.
  - Entscheider: 05 → 06 → 02 → 04 → finale.
- The player can override it in the map ("Als Ziel setzen").

### 5.5 Prediction widget ("Erst tippen, dann messen")

- Before every Messen run, `ui.predict({ question: Text, unit, min, max, step, scale })` shows a slider and returns the value.
- After measuring, the zone calls `pass.recordPrediction(...)`.
- **Prognose-Abweichung** = |p − m| / (max − min) × 100 on the given scale (log10 for log scales).
- **Prognose-Güte** = 100 − the mean deviation. It is the **only score** in the game. There are no success leaderboards.

### 5.6 Source chips

| Chip (DE / EN) | Meaning | Style |
|---|---|---|
| `SIM · LIVE` | Computed in-game right now, by this game's simulation | Teal text, teal 15 % fill |
| `STUDIE` / `STUDY` | Published study; n is stated | Stone-100 text, `#3D3D3D` border |
| `QUELLE` / `SOURCE` | Public statistic; the source and year are stated | Stone-100 text, `#3D3D3D` border |
| `RICHTWERT` / `GUIDE VALUE` | Guide value or range (EmAI assessment, workshop handout) | Stone-400 text, border |
| `ILLUSTRATIV` / `ILLUSTRATIVE` | Invented example or toy-model parameter | Warning `#FBBF24` text, 15 % fill |
| `FIKTION` / `FICTION` | Story element (island, Station 7, Hersteller X, NN-Lage v2) | Stone-500 text, border |

- Chips are pill-shaped (999 px radius), in Geist Mono 11 px, uppercase, with 0.08em tracking.
- Hovering a chip shows the source line from Appendix D.

### 5.7 Kennlinie widget

`ui.kennlinie({ title, xLabel, yLabel, series: [{ id, points | trials }], band: 'wilson95', chip })` renders to a DOM card or to a CanvasTexture for in-world screens.

| Element | Colour |
|---|---|
| Line | Stone-100 |
| Wilson band | Teal at 15 % |
| Key value | Orange |
| Grid | `#2A2A2A` |

The key value is shown as `73 % [66–79] · n = 200`. The Wilson formula is in Appendix B. There are **never pass/fail stamps**: always a curve or an interval.

### 5.8 EMI kit (`ctx.emi.spawn`)

- **v1 model:** procedural, built from primitives and lathes to the dimensions in `params.py` and the CMF table (§2).
  - Draw calls are cut by vertex colours with 3 shared materials (matte body, accent rings, visor), merged per moving link.
  - Near: ≤ 20 draw calls and ≤ 15k tris. Beyond 40 m: a single merged mesh (1 draw call, ≤ 1.5k tris).
  - A later build-time URDF → GLB conversion is in §12.
- **Handle API:**
  - `setJoint(name, rad)` uses the URDF names (`waist_yaw`, `neck_yaw`, `shoulder_pitch_l`, …).
  - `lookAt(worldPos)`: head yaw/pitch, max 2 rad/s.
  - `gesture('point' | 'nod' | 'shrug' | 'wave' | 'show-joints')`. `show-joints` wiggles each joint in turn and brightens its ring.
  - `driveTo(localPos)`: diff-drive, rotate in place, then straight at 1.2 m/s with the wheels spinning; no pathfinding.
  - `say(Text, { durationS })`: subtitle plus chirp.
  - `highlightJoints(bool)`.
- **Idle:** torso sway ±0.5°, and the head tracks the player within 8 m.

### 5.9 Island events

- **Gusts:**
  - Every 60–90 s (random) a 4 s gust fires `{ strength 0.3–1.0, bearing }`.
  - Visual tilt is at most 0.5°. The engine rotates the *environment group* (sky dome, cloud planes, distant islands, sun direction) by the inverse tilt and rolls the camera by at most 0.3°. Island geometry and physics never move.
  - Rotor drone pitch rises 5 %, a wind swell plays, and the Libelle ball rolls.
  - Reduced motion: no tilt and no roll.
- **`island.setTilt(rollDeg, pitchDeg)`** uses the same mechanism and is used only by the finale. It is clamped to ±3°.

### 5.10 Save and settings

- Progress is stored in `localStorage` under the key `emai-academy-island/v1`. Every read and write is wrapped in try/catch, and the game must run without storage.
- What is saved: stamps and their values, predictions, question cards, album, best values, mode, language, settings, and the visited set.
- Settings: language, mode, quality (auto/low/medium/high), mouse sensitivity, invert Y, reduced motion, subtitle size, master/music/effects volume, overlays default.

---

## 6. Hub (island team): Akademie, plaza, arrival, underside, finale

**One-liner:** a 48 m Akademie-Turm carrying the 24 m Recamán medallion, standing on a plaza with the Libelle and six Sprungplatten. *(Phase 4: a white lattice tower with an anamorphic Recamán sculpture and a drawing arm; see §7 "As-built deviations, Phase 4". The table below is the v1 spec.)* Below it, the keel holds the Regelkern, where the finale takes place.

### 6.1 Structures

> **As built (Phase 4):** Akademie-Turm v2, Recamán sculpture, Messpunkt, deck features, Allee number line, arrival, underside and jump-pad changes are listed in §7 "As-built deviations, Phase 4". Unchanged: every coordinate below that other code depends on (drum radii, doors, Ausguck +44, lift shaft and stops, Libelle, Landedeck, Glasbalkon, Kanzeln).

| Structure | Spec |
|---|---|
| **Akademie-Turm** | 12-sided prism at the origin: circumradius 9 m (inradius 8.69 m), roof deck at y = 44, crown to 48. Facets are centred on bearings 0, 30, … 330. Material: `darkMetal` with vertical panel seams. A 4 × 4.5 m door is centred on the S facet; a door on the N facet leads to the lift |
| **Recamán medallion** | On the S facet. Disc **Ø 24 m (R = 12)**, centre **(0, 24, 9.3)**, facing +z, 0.3 m thick, `#141414`, `MeshBasicMaterial` with `toneMapped = false` so the colour stays exact. The spiral and outer ring are built to the geometry in Appendix A. Tube radius 0.18 m, `logoSpiral` material (`#FF6700`, unlit, toneMapped false). It sits on the **NO-BLOOM layer**: static, with **no glow, pulse or animation**. Clear space: nothing within 6 m of the disc edge in the façade plane; the door top at 4.5 m is 7.5 m below the disc bottom at 12 m |
| **Foyer** (interior, detail tier) | Inner radius about 8.2 m, height 7 m, floor at y = 0. Contents below |
| **Libelle** (spirit level) | (0, 0, 19). Plinth Ø 7 m, 1.1 m high. Glass dish (spherical cap, radius of curvature 4 m, rim r = 3). Polished steel ball r = 0.5. Readout ring: `LAGE 0,04° · TAKT 1000 Hz · SCHUB M1–M6` with chip `FIKTION` |
| **Sprungplatten** | 6 hub pads and 6 zone pads (§4.6). Stone-800 disc with a teal ring inlay; the ring turns orange if the pad leads to the current objective |
| **Gate masts** | 6 masts, 14 m tall. Beacon ring Ø 1.6 m (stone = unvisited, teal = visited, orange = objective). Vertical sign 1.2 × 6 m: zone number in Space Grotesk Bold, name, and the Geist Mono eyebrow |
| **Recamán-Allee railing** | Both sides of the avenue. The railing top hops in tangent semicircles with linearly stepping radii (0.15 → 0.6 m, repeating), in `railing` metal (`#3D3D3D`), **not orange**. It is a motif echo, not the mark |
| **Landedeck** | Disc r = 9 at (0, 92). Shuttle-pod dock at (0, 0, 98): a capsule Ø 4 m × 6 m with the door facing −z. Hazard tape on the dock edge |
| **Glasbalkon** | Disc r = 7 at (0, −92). Walkable glass floor (collider plus `glass` material) with a railing. Plaque: `SCHWEBEWERK · INSEL 17 · ABSTAND ZUR WOLKENDECKE 180 m` |
| **Aussichtskanzeln** | 4 pulpits r = 4 at r = 88 (bearings 60/120/240/300), one shared prefab, with a glass parapet |
| **Ausguck** | Ring deck at y = 44, r 9 → 13, with a 1.1 m railing. STRETCH: 4 fixed binoculars that tag zones with their name and distance |
| **Lift** | Glass car in an exterior shaft on the N facet, centre (0, ·, −10.7). Stops: **AUSGUCK +44**, **FOYER 0**, **KIEL −36**. The KIEL stop is locked until the finale unlocks: „Ab Stempeln in 4 Zonen". The ride is scripted: doors close, player input locks, car and player move together for 6 s, doors open. **No free-moving platforms** |
| **Underside** | Main deck beam grid (instanced). 6 thruster pods (duct torus Ø 15 m; 36 blades in one InstancedMesh; hubs with orange rings, which rotate; 4 truss struts each). Keel truss cone (instanced beams). 12 hanging cable catenaries (merged tubes). The Regelkern. Catwalk ring at −36 with a lift landing |
| **Path lamps** | Low bollards along all paths (instanced), off by day and warm white at dusk (ending) |

### 6.2 Foyer contents

| Item | Position (hub local = world) | Function |
|---|---|---|
| **Pass-Terminal** | (4, 0, 3), screen faces the door | First Pass hand-out (tutorial); later also reachable anywhere with Tab |
| **Inselmodell** (map table) | (−4, 0, 3), Ø 3 m | A 1:70 miniature of the island built from the zones' `far` groups. Beacons mirror objective state. E opens the map |
| **Lernpfad-Wand** | W facets | Six panels, one per zone: verb, one-line question, stamps 0–3 |
| **Selbstmessung der Insel** | E facets | Six rotor Kennlinien, e.g. „Rotor M4: Drehmoment-Drift 12 % über 8 h bei 45 °C" `ILLUSTRATIV`. *„Die Insel folgt ihrer eigenen Regel."* |
| **Oculus** | Floor centre, glass disc Ø 4 m | Looks straight down a shaft through the deck to the turning Regelkern 40 m below |
| **Lift door** | N facet | — |

### 6.3 Arrival and onboarding beats

1. **Title screen** (DOM over a slow fly-by of the real scene):
   - The EmAI wordmark: "Em" in `#F5F5F4`, "AI" in `#FF6700`, Space Grotesk Bold.
   - The lines „Sehen. Verstehen. Handeln." and „Messung statt Marketing."
   - The DE | EN toggle, two mode cards (**Entdecker**: „Verstehen, wie Roboter funktionieren — durch Ausprobieren." / **Entscheider**: „Einschätzen, was Physical AI heute kann — in 25 Minuten."), Settings, and **Start**.
   - Start does three things: it unlocks audio, requests pointer lock, and loads Rapier through a dynamic import behind a progress bar.
2. **Ascent** (25 s, skippable with Space, Esc or a click). An on-rails camera spline over the real scene:
   - It starts below the cloud sea at (30, −200, 160), passes through the cloud top (fog fades in and out), and climbs past the SE thruster pod at about 20 m distance and the keel flank.
   - It crests the rim at (0, 2, 104) with the sun behind and to the left of the tower, as the medallion comes into view. A title card appears: `SCHWEBEWERK · INSEL 17` / *„Messung statt Marketing."*
   - The pod docks at (0, 0, 98).
3. **Dock gust:**
   - A scripted 2° roll recovers in 1.5 s, the rotors spool up audibly, and the Libelle ball (visible ahead) runs out and settles.
   - EMI-01, waiting at the Libelle (3, 0, 19), radios in. Reduced motion: no roll.
4. **Movement prompt:** „[W A S D] Gehen · [Maus] Umsehen". The player walks the avenue. On reaching the Libelle, EMI-01 explains it.
5. **Foyer:** EMI-01 drives to the door. The Pass-Terminal hands out the Academy-Pass, and a 3-card Pass tutorial covers stamps, chips and predictions.
   - Entscheider: EMI-01 offers the „Werkleiter-Route, ca. 25 Minuten" and sets the objective to 05.
6. **Sprungplatte tutorial** at the objective's hub pad: the preview arc appears, then the launch.
7. **From here on:** the objective system and H for help. EMI-01 stays at the foyer door (2, 0, 11) until the finale.

**EMI-01 onboarding lines:**

| Trigger | DE (Entdecker / Entscheider) | EN |
|---|---|---|
| Dock gust | „Das war ein Regelkreis. Die Insel ist ein Roboter — und du stehst drauf." / „…und Sie stehen drauf." | "That was a control loop. The island is a robot, and you're standing on it." |
| At the Libelle | „Diese Kugel zeigt, wie schief die Insel steht. Gerade: 0,04 Grad. Tausendmal pro Sekunde wird nachgeregelt." | "This ball shows how much the island tilts. Right now: 0.04 degrees. Corrected a thousand times a second." |
| Pass | „Heute ist Jahresprüfung. Bevor wir die Insel prüfen, messen wir selbst. Sechs Zonen, achtzehn Stempel." | "It's audit day. Before we judge the island, we measure for ourselves. Six zones, eighteen stamps." |
| Self-intro | „Ich bin EMI-01. Laufen kann ich noch nicht. Deshalb habe ich Räder." | "I'm EMI-01. I can't walk yet. That's why I have wheels." |
| Entscheider route | „Die Werkleiter-Route: Dunkelfabrik, Prüffeld, zwei Stationen dazu, dann das Finale. Etwa 25 Minuten." | "The plant-manager route: Dark Factory, Proving Ground, two more stations, then the finale. About 25 minutes." |

### 6.4 Sprungplatten behaviour

- **Preview.** Standing on a pad shows a teal dotted parabola (40 instanced dots) and a troika readout:
  - Entdecker: `FLUGZEIT 2,5 s · SCHEITEL 7,7 m · v₀ 16,1 m/s · g = 9,81 m/s²`
  - Entscheider: the destination name only.
- **Launch.** E or Space launches. The flight is kinematic along the exact ballistic path (Appendix B), with the controller disabled, the camera keeping its look direction, FOV +6° and a wind whoosh. Landing gives a thump and a 0.1 m camera dip.
- **Reduced motion:** a 0.4 s fade teleport instead.

### 6.5 Map (M)

- A top-down SVG generated from the §4 constants. It shows zone glyphs and names, stamps (0–3 per zone), the current objective in orange, and the player arrow.
- Buttons: **„Als Ziel setzen"**, and **„Hinreisen"** (fast travel to any *visited* gate, both modes).

### 6.6 Finale: „Jahresprüfung" (island team, in the Kielraum)

**Unlock:** at least one stamp in each of at least 4 zones (both modes). EMI-01 then says: „Die Kielstufe ist frei. Zeit für die Jahresprüfung." / "The keel level is open. Time for the audit."

**Space and access:**
- The lift ride takes 6 s down through the deck and the inside of the keel truss, with the cloud sea visible through the lattice.
- Catwalk ring at y = −36 (r 9–13) around the turning Regelkern at y = −40.
- The Leitstand console is at (0, −36, −12) facing the core.
- Six loose crates sit on the catwalk, in a private Rapier world with friction 0.05.
- EMI-01 is present: the lift scripts it in with the player.
- `ctx.env.enterInterior({ ambient: 0.5 })`.

**F1 „Hand am Steuer" (Probieren, 15 s):**
- **Input** (Bedienmodus): mouse X sets roll thrust, mouse Y sets pitch thrust.
- **Model:** each axis follows `θ'' = λ²·θ + (u(t − 0.15 s) + d(t)) / I`, with λ = 0.8 s⁻¹ (top-heavy, mildly unstable), 150 ms actuator lag, and 3 scripted gust pulses.
- **Visual:**
  - `island.setTilt(θ)`, clamped to ±3°: sky, clouds and horizon rotate and the camera rolls.
  - The crates slide (private-world gravity is tilted by the same θ, ×4 for readability).
  - Rotor roar follows |u|.
  - A live attitude plot.
- **Outcome:** almost everyone fails. After 15 s, „Regler übernimmt" and the classic controller levels the island in 1.5 s.
- **Reduced motion:** no world tilt. An artificial-horizon instrument shows the same data.
- EMI-01: „Hundertfünfzig Millisekunden Verzögerung, und schon schwingt alles. Der Regler hat es leichter: Er ist tausendmal pro Sekunde wach."

**F2 „Das Angebot" (Messen):**
- The vendor terminal reads „NN-Lage v2 — 99 % stabil (Herstellerangabe)" `FIKTION`.
- **Prediction:** „Wie viel % der Sturm-Versuche hält NN-Lage v2?" (0–100).
- **Run.** 200 trials (67 / 67 / 66 across **ruhig / böig / Sturm**) per controller, fast-forwarded in about 20 s with the island visibly shuddering (±0.5° clamp).
  - Each trial is a 20 s simulation at 200 Hz with a sampled gust sequence. Strength ranges: ruhig 0–0.2, böig 0.2–0.6, Sturm 0.6–1.0.
  - Success means |θ| < 3° for the whole trial.
- **Controllers:**
  - **Bestand**: PD + I, conservative gains.
  - **NN-Lage v2**: a policy fitted on calm data only. It acts as an aggressive PD for |θ| ≤ 0.8°. Beyond that its effective error input bends back: `θ_eff = sign(θ)·0.8° − 0.6·(θ − sign(θ)·0.8°)`. This extrapolation error causes loss of control in big gusts.
- **Tuning targets (acceptance):**

  | Controller | ruhig | böig | Sturm |
  |---|---|---|---|
  | NN | ≥ 98 % | 85–95 % | **30–50 %** |
  | Bestand | ≥ 95 % | ≥ 93 % | 85–95 % |

- **Output:** a Kennlinie card with 6 bars (2 controllers × 3 conditions) and Wilson bands, `SIM · LIVE` (toy model).

**F3 „Empfehlung" (decision):**
- **Tile template:** „Empfehlung: {Pilot | Pilot mit Auflage | kein Pilot}. Grund: {Zahl-Kachel}. Alternativ: {Kachel}."
- **Number tiles are generated from the player's own F2 data**, for example:
  - „NN-Lage v2 hält 41 % [30–53] bei Sturm (n = 66)"
  - „Bestand hält 91 % bei Sturm"
  - „99 % gelten nur bei ruhigem Wetter"
- **Alternativ tiles:**
  - „Bestand behalten"
  - „NN nur bei ruhigem Wetter, Rückfall auf Bestand (MRC)"
  - „Weiter messen: Sturmdaten nachtrainieren"
- **Validation:** the Grund field must contain at least one number tile. **Every recommendation is accepted.**
  - Signing without having opened the Sturm curve triggers EMI-01: „Haben Sie die Sturm-Kurve angesehen?" This is a soft gate; the player can still sign.

**EMI-01 responses:**

| Choice | DE | EN |
|---|---|---|
| Pilot | „Mutig. Bei Sturm hält er 41 %. Ich hoffe, es gibt eine Rückfallebene." | "Brave. In a storm it holds 41 %. I hope there's a fallback." |
| Pilot mit Auflage | „Vernünftig: NN bei ruhigem Wetter, Bestand bei Böen. Und weiter messen." | "Sensible: NN in calm weather, the old controller in gusts. And keep measuring." |
| kein Pilot | „Kein Pilot. Gutes Ergebnis — jetzt wissen wir es." | "No pilot. Good result: now we know." |

The Grund always cites the number.

**Ending:**
1. The island levels, and all six gate beacons turn teal.
2. The lift carries the player to the Ausguck: a 12 s scripted ride, or a fade with reduced motion.
3. **Dusk:** the sun drops from elevation 16° to 3° over 20 s, the sky darkens to stone-900 and amber, path lamps come on, and the rotors hum.
4. STRETCH: the lights of the fictional valley below appear through cloud gaps.
5. The **certificate** overlay opens (§8.6). Closing line: **„Messung statt Marketing."**
6. Free roam continues afterwards.

### 6.7 Hub acceptance criteria

- **Spawn screenshot** (`?skipIntro=1`): the medallion is centred and reads as an orange spiral on a black disc, upright and to spec (compare against `public/brand/mark-inverted.svg`). The tower, the avenue railing, and the 05 and 06 silhouettes are left and right. There is no orange outside the medallion except the objective inlay.
- **Ascent:** plays, can be skipped, and ends at the §4.7 spawn.
- **Libelle:** the ball reacts to gusts.
- **Pads:** all 12 work in both directions; the preview numbers match Appendix B to within 0.1.
- **Lift:** reaches all three stops. KIEL stays locked until unlock.
- **Finale:** F1 → F2 → F3 completes, and the F2 targets hold over 5 seeded runs. The certificate PNG downloads.
- **Frame rate:** 60 fps on the MacBook at quality `high` from the spawn view and from the Ausguck.

---

## 7. Zones

Every zone follows the **three-stamp arc**:
- **A Probieren**: you try it yourself and struggle.
- **B Verstehen**: the machine does it, and the concept gets its name.
- **C Messen**: the task runs many times and you read a Kennlinie.

In addition, each zone has:
- one hidden **Failure-Mode-Album** entry;
- 1–2 vendor **question cards**;
- one **Befundkarte** (Entscheider).

**MUST** fits in the v1 build. **STRETCH** is built only if time is left.

### As-built deviations (polish pass, 2026-10)

Where the game differs from the drafts below, the game is current. Facts and sources: `docs/RELEASE.md`.

| Zone | Deviation | Why |
|---|---|---|
| 01 sensordom | Card B title „Für LiDAR ist Glas meist Luft“ (not „ist Luft“); EMI A-done „Zusammen sehen sie mehr“; datasheet line „oft für eine helle, flache Wand in 2 m Abstand“; the C Entdecker line no longer says „kein Prospekt“; segmentation is called an AI model, not a sensor; cards differ per mode (Entdecker: concept + Für Neugierige, Entscheider: concept + decision box / Befundkarte) | ≈ 92 % of the laser passes clear glass (Foster et al. 2013); vendor documentation does state the z² law; shorter cards |
| 02 regelgarten | A push **±20 N** (was ±40 N); τ explained as the time in which the tilt grows 2.7-fold (the untouched 0.5 m pole falls in ≈ 0.64 s), not „kippt in 0,18 s“; Rubik's-cube line cites Akkaya et al. 2019, no company name; reaction time ≈ 0.2 s cites Woods et al. 2015; decision boxes only in Entscheider mode | At 40 N no configuration was holdable for 5 s by a human-like player (0.25 s delay); e-folding time ≠ fall time; D6 |
| 03 greifwerkstatt | Egg study sourced (3D-ViTac, CoRL 2024, Table 1: whole egg task, 20 trials each); the prediction asks how many eggs arrive intact; „Roboterhände < 1 Jahr“ removed (no primary source; the wear wall is ILLUSTRATIV); „Reichweite und Traglast gelten nie gleichzeitig maximal“ → „Frag nach dem Lastdiagramm“ | Sourcing; vendor-neutral advice |
| 04 lern-dojo | Evaluation **n = 100** (not 50); physics **100 Hz** (2 sub-steps per 50 Hz control tick); retraining needs a measured baseline v0; a dragged block slides until it is pushable | At n = 50 a true +14 pp gain shows as ≤ 5 pp in ≈ 17 % of runs; dead ends removed |
| 05 dunkelfabrik | IW Köln **768.000 in 2028** (IW-Report 34/2025; was 728.000/2027); the lights-out plaque is anonymised („ein japanischer Roboterhersteller … seit 2001“, Business 2.0 / CNN Money 2003); „Gebückt“ counts set-downs on the bottom pallet layer (load height), not camera pitch; Station C shows 44 %, 111 Eingriffe/h, „Ohne Umreifen 88 %“ (the §7.5 examples 46 % / 3,1 / 97 % do not follow from the per-cycle table) | Current forecast; D6; robust bending rule; numbers follow the model |
| 06 prueffeld | Sign, stamp, card B and EMI show the Wilson interval instead of „± half-width“ when the interval is skewed (20/20 → „84–100 %“); κ ≥ 0,8 „stark“ cites McHugh 2012; the Befundkarte has three lines (Grenze incl. toy model, Frage, Für dein Werk) to fit 1280×720; Schichtdauer slider 1–8 h | Honest display for small n; sourcing; layout |
| all | „Fragenkarten“ toast from the engine on every award; EMI reactions interrupt the queue (`emi.say(…, { interrupt: true })`); German typography „…“ and „ – “; EN “…” | Consistency |

### As-built deviations, Phase 4 (2026-10): fun + futuristic pass

The founder played the release candidate and asked for four things: fix what looks buggy, make the design futuristic (the pines and mounds on the deck made no sense on a flying robot), replace the logo that looked "plated" onto the tower, and turn the tour into a real learning game. The plans are `docs/QA-PHASE4.md` (28 findings), `docs/ART-V2.md` (art direction "Flugmaschine") and `docs/FUN-PLAN.md` (game layer). Five builders implemented them in parallel; this section records what was built. Where it differs from §5, §6, §8 or §9 above, this section is current. Status per plan item: the status tables at the top of ART-V2 and FUN-PLAN. Facts and sources: `docs/RELEASE.md` §5.

**Hub and tower (§6.1, §9.8).**

| Part | As built | Replaces |
|---|---|---|
| **Akademie-Turm v2** | White hyperboloid lattice of 2 × 18 straight members (bottom ring r 8.85 at y 7.2, top ring r 8.55 at y 43.0, twist ±96°, elliptic section 0.40 × 0.28 m), alu ring beams, waist ring at y 25.1 (r 5.97). Dark-glass core (r 3.4, y 7–44) with 11 teal level rings; on every stamp a brightness wave runs up the rings. Foyer drum: ceramic 12-gon (circumradius 9, inradius 8.69, 0–7 m) on an open carbon base band, alu collar. Every coordinate other code depends on is unchanged (doors, Ausguck +44 with the lift hole, shaft at (0, ·, −10.7), colliders) | the dark 12-sided prism with crown fins |
| **Doors** | Split dark-glass doors: the lower leaf sinks into the deck, the upper leaf rises into the wall. S door (4 × 4.5) opens when someone is within 7.5 m; N lift door (2.6 × 3) opens only while the car waits at the foyer, otherwise a collider closes it | open openings |
| **Ausguck** | Ring deck at +44 with a glass balustrade (r 12.85), alu handrail with a teal line, teal lip light (r 13.02), 36 warm downlights in the soffit. The lid collider over the shaft is permanent and is lifted only while the player rides the car; a dark hatch with a teal edge shows while the car is away; the car console works only from inside the car (QA-11) | three dark rails, a hole you could fall through |
| **Crown** | Six brushed-alu sensor masts (5.6 m, leaning 8°) on the zone bearings, each with a beacon ring: grey = unvisited, teal = visited, orange = current objective. Alu needle to +58 with the anemometer and a steady warm light | 12 crown fins |
| **Lift** | Round alu posts, glass on N/E/W, slim ceramic spine with a teal line on the N side, ceramic cap at 47.6. Car = white shell + light mesh, floor 3 cm above the stop height (QA-12). The Ausguck call panel stands on its own post west of the shaft | square posts, 8-mesh car |
| **Recamán sculpture** | Replaces the 24 m medallion disc. An **anamorphic** 3D mark (R 10.5) in front of a 2.4 m deep dark lens on a bolted strut to the waist ring: from the **Messpunkt** at the arrival (eye (0, 1.65, 94.5)) it is the exact brand mark; walking up the Allee it opens into a forward fan of arcs up to 4.4 m in front of the disc (geometry: Appendix A, "As built"). Ghost arcs are warm brushed alu; lit arcs are brand-exact orange, compensated for exposure and grade (measured within 5/255 of #FF6700, disc within 2/255 of #141414, no halo, high/low/dusk). Stroke 16 SVG units | the flat medallion „plated“ on the façade (QA-06) |
| **Logo progress** | The tower draws the player's progress: earned stamp n lights element n − 1 (0 = ring, 1–17 = arcs), the same order as the Pass cover. A 6-axis drawing arm under the halo (founder's IK and spring behaviour from his logo-film experiment, shown at 1.5×, no vendor styling) checks a(n−1) − n with a teal sensor ray (✕ or ✓), reveals the line with a laser, a spark and a landing ring, and shows the rule („7 − 6 = 1: schon da ✕ → a(6) = 7 + 6 = 13“). Lines draw only while the player sees the mark (no modal, in front of the disc, ≤ 160 m, unobstructed); pending lines wait (a small spark at the arm) and then chain, each 1.3× faster (max ×4). A reload restores lit lines without animation; a progress reset returns all to ghost. On `finale:ended` one laser sweep runs along the lit lines the next time the mark is seen from the front; at 18/18 the arm bows once. Reduced motion: 0.6 s fade, no arm, no beam | static mark (§9.8 use 1) |
| **Messpunkt** | Flush plate at the spawn. [E] opens a short card with an animated ray diagram: why the mark is exact only from here, and why one camera image measures no depth (Hartley & Zisserman 2004, §6.1) | — |
| **Foyer** | Ceramic panels over a carbon band, warm floor light line, ribbed carbon ceiling, satin radial floor (#C2B6A8, roughness 0.58: QA-17's "blue water" was the old plinth's closed top cap). Lernpfad boards in alu frames show ★ per zone | dark-metal drum, glossy floor |

**Landscape (§4, §6.1, §9.3–§9.6).**

| Part | As built | Replaces |
|---|---|---|
| **Deck** | Flat composite deck (3 × 1.5 m panels) with functional fields (`src/world/landscape/plan.ts`): 32 solar trees in 10 groves whose leaves track the sun and visibly re-correct; 8 cooling-air intakes with turning fans under walk-over grilles; 12 service hatches; 6 heat-exchanger fin banks; 3 hydroponic glass pods (the only greenery, under glass); 12 rim sensor masts whose wind vanes swing into gusts; 5 service rovers that stop and turn to look at you | 34 pines, 46 boulders, heath mounds (QA-07) |
| **Paths, plaza, railings** | Runway-tone paths with flush alu kerbs; a "turbine disc" plaza with teal rings; slim alu railings with a teal line under the handrail; railings and thin bars no longer cast shadows; tent-filtered shadow map (QA-04) | dithered railing shadows, hoop railing |
| **Allee number line** | Walking up the Allee draws Recamán's 17 arcs into the floor (the mark's construction), with a plaque: the rule, OEIS A005132 | Recamán hoop railing (§9.8 use 2) |
| **Gate masts** | 14 m tapered ceramic blades; the sign shows the zone's stamps and ★ x/9 with a state-colour light slot (stone / teal / orange, steady) | dark masts |
| **Arrival** | Spawn unchanged. The shuttle pod is docked in a cradle at the Landedeck's east rim (centre 13.6, 1.85, 92) with a lit recessed hatch and a walkable gangway; the map is a dark-glass totem (QA-03) | pod filling the view behind the spawn |
| **Underside, Kielraum** | Panelled ceramic hull (fairing to r 66 at y −9); thruster pods with ceramic shrouds and teal duct rings; alu keel truss with warm lights; Kielraum shell = alu truss with tinted glass, white gimbal rings, polished IMU sphere | faceted rock mass |
| **Sky** | Six-rotor cargo multicopters instead of airships; sister hexacopter platforms instead of rock islets; two inspection drones circle the tower | blimps, rock islets |
| **Jump pads** | You land 2.5 m past the target pad; only E launches (not Space); a pad arms only when you walk onto it (QA-13) | bounce-back on landing |
| **Materials and light** | Shared v2 material language via `ctx.materials` (ceramic hull, deck composite, brushed alu, carbon, dark glass, clear glass, PV cells) and light tiers T0/T1/T2 that switch from day to dusk; accents moved out of the bloom flicker band; bloom 0.7 by day, 1.0 at dusk | dark metals, flickering accents |

**Game layer (§5, §8; `ctx.game`, FUN-PLAN §4).** Founder decision D8 (stars) is still open (`docs/DECISIONS.md`).

| Feature | As built |
|---|---|
| **Challenges and stars** | Every station has one challenge with three goals: ★ = the stamp's own goal, ★★ and ★★★ = harder goals. Stars rate the player's play and method, never a robot; no leaderboards. Personal bests and attempts are saved in the Progress blob (v 1). 18 stations × 3 = 54 ★; the finale F1 has its own ★ and is not part of the 54 |
| **Result banner** | One banner when a stamp and a result arrive within 1.5 s: value, stars, goal chips, a lesson of ≤ 14 words, „Linie n/18 für den Turm“ and „Schau zum Turm.“ while the tower line is pending, then R = Nochmal (instant retry), H = Warum? (the station's info card), Enter closes. It sits in the lower third above the subtitles, joins the subtitle column in operate mode, and steps aside under real modals |
| **Juice** | Fail flash with a reason, 3-2-1-LOS countdown, timer and live chips, world popups, particle bursts (one pooled mesh), a screen-edge pulse and nine calibrated cues (−18 … −9 dBFS) |
| **Info cards** | No card opens by itself any more (Entdecker); every card is behind Warum? / ⓘ. ◆ (not ★) marks the core stations |
| **Sensorkapseln** | 12 capsules: 6 in the world (Landedeck, the apex of the bearing-150 hop, Ausguck, Kanzel 240, Glasbalkon, Kiel) and one per zone. Each lights one of 12 rim position lights for good. 12/12 raises the **Turmsprung** pad (bearing 315, r 24): E launches a 4 s arc onto the Ausguck |
| **Toys** | Libelle gust button (the first mechanic), touchable solar leaves („Nachgeregelt in x s“), a test fan, gust vanes |
| **EMI-01** | Radio companion („EMI-01 › Funk“): at most one line per 20 s, never over a zone EMI, quiet in the Kielraum and through the ending; triggers: album entry, three stars at a ◆ station, capsules 1/6/12, a new skill, 9/9 question cards; H on the plaza gives a capsule hint. Six skills (SEHEN … MESSEN) unlock with each zone and EMI-01 shows its newest one by the foyer door |
| **Pass, map, certificate** | Pass: ★ x/54, Kapseln x/12, EMI-01 skills row, per stamp ★, best value, attempts, next goal and Warum?; the cover counts earned stamps only. Map: ★ per zone and found capsules. Zone entry: „★ x/9 · n/3 Stempel“. Certificate: ★ per station and zone, ★ x/54, Kapseln, F1 ★ |

**Onboarding (§6.3).** Play first: dock gust, then EMI-01 on the radio („Spürst du das? Geh zur Libelle.“). EMI-01 stands at (3.4, 0, 22.6), outside the plinth (QA-05). The player presses „Böe auslösen“ on a control column at (−3.3, 0, 22.7): the island tilts 2.2–2.9° and catches itself in 1.6–2.0 s; the readout shows „LAGE max° → 0,04° in t s · n Korrekturen“ (FIKTION). Then „Gefangen. Die Insel ist ein Roboter – und du stehst drauf.“ and the Pass handover at the Libelle („Achtzehn Stempel – jeder zeichnet eine Linie am Turm.“). The foyer Pass-Terminal is optional. Skipping the ascent fades to black and cuts to the spawn (QA-15).

**Finale (§6.6).** F1 is a ★ challenge (time over 3°: ≤ 15 s · ≤ 5 s · 0 s; R = „Nochmal ans Steuer“). After signing F3, „Ein Jahr später“ plays a 10 s calendar on the player's own F2 rates (invented weather, labelled; three recommendations side by side). `finale:ended` fires once when the ending starts; the tower sweeps its lit lines.

**UI.** Default FOV 60° (old 72° saves migrate; slider 50–80°); compass with a masked zone band and an unmasked objective that clamps to the edge with an arrow (QA-08); world labels fade behind static and kinematic colliders (QA-10); modals and cards with 45° machined corners; telemetry strip „LAGE · TAKT 1000 Hz“ with a FIKTION chip; Esc resumes from the pause menu (QA-21); the grab rows show only while something is grabbable (QA-22).

**Zones (§7.1–§7.6).** Each zone has a zone-owned `look.ts` (v2 recipes), a Sensorkapsel and three challenges. Thresholds were calibrated by the zone builders (bots and real input; details in their commit messages):

| Zone | A | B | C | Look |
|---|---|---|---|---|
| 01 sensordom | **Sensor-Suche**: ★ 5 tagged · ★★ ≤ 2 misses · ★★★ also ≤ 90 s (clock from the first visor key) | **Blindflug**: ★ exit · ★★ ≤ 60 s · ★★★ ≤ 45 s and 0 glass contacts | **Greift EMI das?**: one-tap distance tip per light, judged against the model rate (Labor 3 m, Gegenlicht 1 m) | lit light lock (QA-02: entry luminance 3 → 137/255), ceramic and dark-glass cap, LiDAR fan aimed at the deck |
| 02 regelgarten | **Stab-Challenge**: ★ stamp · ★★ 2 m on Mars ≥ 8 s · ★★★ 1 m on the Moon ≥ 8 s (no Earth configuration is holdable with 0.25 s reaction) | **Wann fällt der Riese?**: ★★ guessed Takt = measured fall Takt · ★★★ latency limit measured | **Du gegen 256 Welten**: tune P and D yourself on 256 fresh worlds · ★★ ≥ 50 % · ★★★ all 256 stand | hydroponic glass troughs replace the shrub planters ("trees"), deck floor, alu/dark-glass Weltenwand |
| 03 greifwerkstatt | **Ringe-Rennen**: ★ 3 rings · ★★ joint mode ≤ 120 s · ★★★ ≤ 60 s | **Eier-Serie**: stamp = 1 intact egg + 1 slip · ★★ 3 in a row · ★★★ 5 in a row within 3–7 N | **Wette aufs Band**: ★★ tip inside the Wilson band · ★★★ both sensors at n = 200 | curved ceramic canopy at the back rim, carbon work-cell plates, glass test cabinet |
| 04 lern-dojo | **Saubere Demos**: ★ 5 demos · ★★ Ø ≤ 9 s · ★★★ Ø ≤ 6 s, no miss | **Brich die Policy – und rette sie**: ★★ in-distribution rollout ≤ your demo mean + 2 s · ★★★ rescue ≤ 10 s | **Datendetektiv**: ★★ 0 false removals · ★★★ also the 12 camera-shift episodes | floating hull roof on carbon coffers; the demo cloud in an alu data vitrine (QA-25) |
| 05 dunkelfabrik | **Mensch gegen Roboter: die Minute** (you against the cell arm): ★ 3 · ★★ 7 · ★★★ 9 crates | **Lückenplan 2030**: ★★ ≥ 2 „passt“, no misfit · ★★★ one Waage run ≤ 4 years and one > 4 years; coverage selector 40–100 % | **Ehrliche Nacht**: ★★ no gesture above its true level · ★★★ also 0 MRC | lights-out readable (QA-01: 2–6 → 23–40/255) with teal LED edges and guide dots; alu ribs, fin banks, roof fans; vertical status slit (QA-27) |
| 06 prueffeld | **Zettelwirtschaft**: ★ 2 · ★★ 5 · ★★★ 9 cards played; at 9/9 the sign flips to „9 FRAGEN · 9 EINSCHRÄNKUNGEN“ | **Falsifiziere die 100 %**: guess before every run · ★★ guess inside the Wilson band · ★★★ the same at the worst case („SCHLIMMSTER FALL“) | **Einig werden**: ★★ no refusal in round 2 · ★★★ κ ≥ 0.9; 2× replay | ceramic Messzelle, round alu gantry, silver truss, LED wall |

**Measured (production build, Apple M5 Pro, 1280×720, integration pass).** All 71 survey views at 60 fps on high and low; worst 338 draw calls (spawn), worst 0.75 M triangles (Kanzel 300), worst 3.3 ms main-thread CPU; low tier worst 316 calls. Tower exterior 37 meshes / 58.9k triangles; sculpture + arm + effects 8 draw calls / 33.5k triangles. First load 1.93 MB with brotli. Details: `docs/RELEASE.md` §1.

### As-built deviations, Phase 5 (2026-10): polish

A focused polish round on what release candidate 2 still got wrong against the founder's feedback ("looks buggy", "not futuristic", "the trees make no sense", "the logo looks plated", "make it a real fun learn game"). Four builders (tower, landscape, core, zones) worked in parallel; a fresh-eyes playtest of rc2 (two sessions, ≈ 70 min, real keyboard and mouse, findings PT-01 … PT-27) ran alongside, and the release integrator fixed the quick ones (`docs/RELEASE.md` §4). Where this section differs from the Phase 4 section above, this one is current. Facts and sources: `docs/RELEASE.md` §5.

**Tower: the Recamán mark as a planar relief (DECISIONS D10).** The anamorphic fan is retired. Its forward fan read as a "P" or a satellite dish from the south-west and the plaza.

| Part | As built (Phase 5) | Replaces |
|---|---|---|
| **Mark** | Ring + 17 arcs as tubes (stroke 16 SVG units = 0.42 m) in **one plane**, z 8.95, 0.45 m in front of a 0.85 m machined dial (face z 8.5, back z 7.65), R 10.5, centre y 24. Because the whole mark lies in one plane it is the exact EmAI mark from every viewpoint, only seen in perspective. The tubes stand on carbon pins at every number-line node, at 12 points on the ring and at the crown of each arc from k = 3. Ghost tubes are warm alu and cast no shadow. The lit sleeve is brand-exact orange, the dial face brand-exact #141414. The edge is a stepped carbon band with alu trim rings and the 26 teal 0–25 scale ticks. The front chamfer stays dial colour, so there is no light outline from the front | the anamorphic fan (α_k, P = E + t(L − E), "exact only from the Messpunkt"), the 2.4 m lens and the strut |
| **Mount** | The dial sits 0.22 m in front of the lattice (closest at the disc bottom). A white ceramic **collar** with a teal line runs round the diagrid waist (y 25.1, r 6.22–6.84) and replaces the bare alu waist ring. On each side, two straight ceramic struts (bearings 90/125 and 235/270) form a **yoke** to a pivot at 3 and 9 o'clock: a white bearing housing on a bright alu axle with a teal ring, at (±11.86, 24, 8.075). A carbon **hub** with a bolted flange sits in the collar at bearing 180. The **back** (seen from the north half) has 8 ceramic ribs, the heavier pair on the pivot axis, and 2 alu ring beams; rib depth stops ≥ 0.22 m from the lattice | a disc hanging 3.45 m in front of the tower on one strut |
| **Messpunkt card** | Now measures the tower: the disc is 21 m wide and fills 13.5° from the arrival. A 2.1 m disc at 8.9 m would look the same; only the known width turns the angle into a distance: 21 m ÷ (2·tan 6.74°) ≈ 89 m (computed from the built geometry). Same source (Hartley & Zisserman 2004, §6.1), title and decision box unchanged; hint „Wie weit ist der Turm weg?“ / „How far away is the tower?“ | "why the mark is exact only from here" |
| **Unchanged** | Element order (0 = ring, 1–17 = arcs; stamp n lights element n − 1), the drawing arm, labels, pending chain, finale sweep and bow, `logoShown` persistence | |
| **Probes** | `world:logo-drift` removed; `world:logo-check` (mark vs `LOGO_SVG_PATH` and a(0..17), planarity, lattice clearance: 17 arcs, 2 ring halves, 0 side mismatches, 0.000 mm, planar, 0.219 m) and `world:logo-geom` (`{ center, radius }`, read by `tools/brand-check.mjs`) | |

The layout registry (`TOWER.sculpture` in `src/world/layout.ts`) mirrors the new stack: centre (0, 24, 8.95), faceZ 8.5, backZ 7.65, R 10.5; `TOWER.medallion.center` z 8.5 (integrator).

**Landscape.**

| Part | As built (Phase 5) | Replaces |
|---|---|---|
| **PV tracker rows** | 16 segments (8 rows × 2 with a 1.6 m service gap), 180 glass–glass modules 2.0 × 1.0 m, in four darker composite fields beside the Allee (x ±9.3 / ±12.9, z 50–77) and the north spoke (z −76 … −51). Single-axis trackers: N–S axis, pivot 1.45 m, ±50°, top edge < 2.3 m, tapered ceramic piles, carbon torque tube, alu bearing blocks, a ceramic slew drive with a teal status slit. They re-aim every 6–10 s (8 % overshoot, 1.2 s settle) and stow flat at full dusk. Unlabelled; no claim that they power the island or its flight | the 32 solar trees in 10 groves (trunk + crown, "lollipops" from behind) |
| **Toy** | „Solarreihe verstellen“ / „Knock the solar row off aim“: one row is knocked off and the control loop turns it back; the popup still reports the toy's own measured settle time | touchable solar leaves |
| **Working deck** | Data packets every 14 m at 5 m/s along the light channels into the tower, orange and outward on the spoke to the current objective (static under reduced motion). Flush edge studs on the ring path, spokes, north spoke and Kanzel stubs (dark by day, teal T1 from dusk t 0.3–0.6). Painted rover lanes on the ring (dashed centre line at r 46, chevrons every 15°). A ring-frame band at r 52.6–55.4 with an access hatch every 7.5°; vent grates along each fin bank. Four maintenance drones with charging docks at (±66, −27) and (±65, 26) on an inspection loop (two nearest intakes and a sensor mast). Eight rovers (was five). Deck panels vary in tone by a world hash (±5 %, one in eight a darker replacement) | a flat, sparse deck |
| **Glare** | Matte fan blades, unlit dark intake pits (#0F0E0D), satin kerbs, rims and plot kerb rings (roughness 0.42 → 0.58), dark anodised grilles and fin packs (#4A4643) | white glare blobs in the low sun |
| **Dusk** | Additive light spill along every guide line and the rim (fades in at t 0.3–0.7) and warm pools at every bollard (r 1.6 m): 2 draw calls, dusk only. Channels 7 → 9 cm, plaza rings 5 → 7 cm, zone rings 6 → 8 cm | a moderate glow |
| **Hop preview** | The dotted arc fades with the view angle (smoothstep of \|sin\| 0.22–0.55); a dashed ground track (0.9 m) and a landing ring always show the landing point | a column of dots seen from behind a pad |
| **Other** | Position lights are rail lanterns with a smoked teal lens; sensor masts carry an instrument boom (camera pod or radiation shield) and a lightning spike; the belly has seam rings and radial joints; rigid carbon conduits with alu clamps replace the sagging cables | black ball-on-a-stick lights, lamp-post masts, scratch-like cables |

**Core.**

| Part | As built (Phase 5) |
|---|---|
| **Kielraum** | A dark control room. A graphite well under the Regelkern (lathe from the catwalk's inner edge r 9, −36.3 down to a floor at −46, #141211) with 12 dark ribs, a warm level line at −37.2 and a teal floor ring (r 3.2) with four compass ticks, so the white gimbal reads against black. The eight uplights are soft, view-dependent light shafts (NaN-clamped; the old cones made black dots). Carbon sleeves on the four gimbal hangers. A 2.2 m status display behind the Leitstand shows the live F1 canvas. While the camera is in the keel (y −18 … −60, r < 30) `ctx.env.enterInterior({ ambient: 0.45 })` (ART-V2 §4.6 asked 0.6; 0.45 lets the stations and the gimbal lead). Kielraum parts of `underside.ts` (core's surgical edit): smoked shell glass #0d1113 at 0.52, graphite frame, diagonals, rings and collar (#3a3633), an inward skirt r 28.76 from −9 to −4 (closed a blue sky ring under the keel ceiling), catwalk grating #77726D (ART-V2: #A8A29E). From outside the keel reads as a dark smoked drum over the alu cone |
| **„Ein Jahr später“** | Plays on the Messwand (operate mode, camera at bearing 180, r 8.65, 3 m above the catwalk). Calendar, the three recommendations and the footer are drawn on the 1280×720 wall canvas, redrawn only when the day count or the language changes; a slim bar holds the SIM chip with „Raten aus deiner Messung (F2, n = 200 je Regler)“, Überspringen and Weiter; Esc ends it. Math, strings and labels unchanged |
| **Zone entry (QA-27)** | Zone entry and the Kielraum arrival show a location card at the left, 14 px under the objective (teal edge, dark backplate: eyebrow, 30 px title, line, ★/stamps); `ctx.hud.banner(eyebrow, title, { place: true })`. Cinematic titles (ascent, ending, album) stay centred. QA-27 is closed |
| **HUD** | Telemetry strip on a dark glass pill. On viewports ≤ 900 px tall, outside operate mode, subtitle and result banner sit side by side (subtitle bottom left, banner bottom right) and the hint hides. The map draws the Turmsprung pad (teal ring, up chevron, TURMSPRUNG / TOWER LEAP, legend „Turmsprung → Ausguck“) once all Sensorkapseln are found. The optional „// TURM · LINIE n/18“ caption was not built |

**Zones.** Thresholds were calibrated with real Playwright mouse and keyboard input driven by bot player models (perception delay, cursor speed, aim noise; first-time, average and skilled), logs in `artifacts/phase5/zones/calib/` (git-ignored). These are bots, not people (`docs/RELEASE.md` §2).

| Zone | Change |
|---|---|
| 01 sensordom | S4: the capsule lies under a black velvet cloth past the Labor shelf's right end (≈ world (−82.95, 0.48, 11.24)), 1.5 m behind the Samtkiste. In RGB a dark heap, no depth echo. The LIDAR or SEG crosshair within 9 m (or walking within 1.4 m) slides the cloth off, with an EMI-02 line; until then the capsule waits inside the deck slab (`kapsel.ts`, hooks `tp-kapsel`, `kapsel-reveal`). Station signs: the canvas now sits in front of its glass (blank in rc2). Integrator: the floor cable is 16 mm (was 8 mm, under 2 px from 3 m); the Messstrecke rail bed has no player collider (PT-02) |
| 02 regelgarten | R1: an Earth fall is a lesson. Your run is shown as a measurement („Du: 0,9 s · 3 Korrekturen“), then the controller F = 2x + 5ẋ + 300θ + 50θ̇ (±20 N, 1 kHz) holds the same cart for 3.6 s and catches two 30 N pushes („Regler: hält · 3.600 Korrekturen“), with EMI-03 before and after; it returns after every third Earth try with key presses; a „Regler ✓✓✓“ row in the best times. Stars unchanged (★★ 2 m Mars 8 s, ★★★ 1 m Moon 8 s). R3: harder random worlds (L 0.5–1.5 m, m 0.5–1.5 kg, M 3–7 kg, b 0–2, noise 0–1°, latency 0–40 ms, gusts 10–45 N), the latency FIFO grew from 8 to 16 samples (40 ms used to wrap to 0); ★★★ = hand-tuned P + D ≥ 90 % of 256 (was all 256), ★★ ≥ 50 %. Satin trough glass, matte grow bed |
| 03 greifwerkstatt | Integrator: the board rings are drawn at the hit radius (inner edge 0.148 m for RING_HIT 0.15 m; they were 0.3 m, so a tip that looked inside did not count, PT-12) |
| 04 lern-dojo | L1: ★★ Ø ≤ 7 s, ★★★ Ø ≤ 5 s without a miss (was 9 / 6). L2: ★★ in-distribution policy run ≤ 5 s; ★★★ policy ≤ 4 s plus the rescue with the minimum two new demos; after the stamp, R starts a new rescue. Matte ceramic back on the dataset wall. Integrator: the teleop desk's interactable sits on the desk (it sat at the zone origin, PT-10); the discard keycap reads „Backspace“ (⌫ had no glyph) |
| 05 dunkelfabrik | D2 stars unchanged; a „Neuer Plan“ button after a „passt nicht“ takes all tokens back. QA-27: the door lettering moved off the lintel to the façade right of the door (2.7–3.25 m). Integrator: Station C's marker leads to the stair foot first, then to the desk (PT-06); the hand-pallet set-down zone is head-high (PT-17); the heat-exchanger fin banks are dark anodised (#4A4643: polished alu blew out to white against the low sun) |
| 06 prueffeld | P1: the vendor terminal shows a 3 × 3 card grid (39 DE / 46 EN words at open with 9 cards held, 57 / 63 with all asked; was 83 / 92). P2: the first run starts in studio light; goal chip „Schlimmster Fall, Tipp im Band“. Auditor mannequins on task chairs, LED-wall rear and switched-off look, parked standby screen, mid-grey partition. Integrator: an eye-high grip zone on the Messzelle handle (PT-07: the 7 cm bar sat 34° below a level gaze, so E did nothing and W walked you past the cell) |

**Engine (integrator).** Modal → modal in one tick no longer hides the cursor (PT-01: the lock requested on closing modal A was granted after B opened; `Game` now hands the cursor back whenever the lock arrives while a modal is open). Groups registered as interactables are found by their children's bounds, not their origin. The result banner sits above the subtitle by its real height (`--dlg-h`), and in operate mode (right dock) toasts stack under the objective instead of under the panel. The KIEL toast and objective say „Eingang Süd“ / „enter from the south“ (PT-08); the F1 time readout formats 15 s by locale (PT-20). The gust column is interactable as a whole (PT-14).

**Measured (production build, Apple M5 Pro, 1280×720, rc3 integration pass).** Both full routes 0 errors, 18/18 stamps, 54/54 ★. All 69 survey views at 60 fps on high and low; worst 350 draw calls and 0.88 M triangles (spawn), worst 2.6 ms main-thread CPU; low tier worst 329 calls. Wide cinematic views (critic) up to 443 calls and 0.93 M triangles (underside); the tower's own 90 m north-west aerial 463 calls (tower builder). Kielraum ≤ 296 calls / 0.68 M triangles (core). Tower exterior 89.9k triangles (rc2 69.9k), sculpture + arm + effects 42.6k (rc2 33.5k), no extra meshes. Onboarding with real keys: first mechanic 41.7 s, first zone 60.2 s. First load 1.94 MB with brotli. Details: `docs/RELEASE.md` §1.

---

### 7.1 Zone 01: `sensordom`, SEHEN · Sensordom / Sensor Dome

| | |
|---|---|
| Eyebrow | `// 01 · SEHEN · SENSORIK` / `// 01 · SEE · SENSING` |
| Anchor / rotationY / facing | (−80.00, 0.00) / +90° / 90 (east) |
| Plot / ground / cap | r 22 / y 0 / 24 m |
| Gate / spawn | local (0, 0, 22) / world (−56, 0, 0), looking at bearing 270 |
| Paths | Spoke 270 to the plaza; ring to 02 (north) and 06 (south) |
| Question card | **#9** „Was ist das Ergebnis in einer zweiten Umgebung?" |
| Album | `spiegel-geisterpunkte` |

**Fantasy.** You step inside a robot's eyes. A dark geodesic dome, a cluttered lab, and a pitch-black room you can only cross by laser.

**Structures** (local coordinates):

| Structure | Spec |
|---|---|
| Dome (exterior) | Geodesic half-sphere radius 16 m, centre (0, 0, −4), height flattened to 13 m. Stone-900 panels with thin seams; a few panels dark-glazed |
| **LiDAR-Kopf** (landmark) | Cylinder Ø 1.2 × 1.0 m on a 2 m mast at the apex; top at y = 16. A **teal fan** (vertical sector plane, additive, 30 m long, fading out) rotates at 0.5 rev/s. It is visible from everywhere and animated in `updateFar` |
| **Schleuse** (light lock) | Tunnel from the gate (z 22) to the dome entrance (z 11.5), 4 m wide, 3.5 m high, dark, with a teal floor strip and two strip curtains |
| **Labor** (front half, z −4 … 11) | Dim. Two warm spot lights (the zone's 2 local lights) |
| Scan-Tisch | 3.0 × 1.5 × 0.9 m table at (−7, 0, 3) plus a 2.5 m shelf at (−11, 0, −1) |
| Messstrecke rail | 10 m along z at x = 8: sensor tripod at z = 9.5, target carriage (0.6 × 0.6 m plate) with stops at 1/3/6/9 m (z = 8.5 / 6.5 / 3.5 / 0.5). Gegenlicht floodlamp at (8, 2, −2) aimed at the sensor |
| **Dunkelkammer** | Closed box 12 × 12 × 3 m, x −6…6, z −18…−6. Entry door (0, 0, −6), exit door on the east wall at (6, 0, −16), both 1.2 m wide. Maze walls 0.2 m thick, 2.6 m high, on a 2 m grid. Contains **3 glass panes** (`glass`, collision group `SENSOR_IGNORE`) and **1 mirror** (2 × 2.5 m) at the end of a corridor |
| EMI-02 | (−3, 0, 8) |

**Interior lighting.** On entering the dome, call `ctx.env.enterInterior({ ambient: 0.15, background: '#0C0A09' })`. In the Dunkelkammer use `ambient: 0`.

#### Station A: Messbrille (Probieren), MUST

- **Inputs:** keys **1 RGB · 2 TIEFE · 3 LIDAR · 4 SEGMENTIERUNG**. **V** cycles. Active only inside the dome. The HUD eyebrow shows `// SENSOR · TIEFE`.
- **Render modes** (the zone swaps materials on its own interior meshes only; the dome hides the outside world):

  | Mode | How it is rendered |
  |---|---|
  | RGB | Normal |
  | TIEFE | Each mesh gets a depth shader: colour ramps by camera distance from `#F5F5F4` (0.3 m) to `#0F3D38` (12 m) to black. Animated per-pixel noise grows with z². Objects flagged `noDepthReturn` (glass, black velvet) render **black** |
  | LIDAR | Interior meshes hidden; background black. A virtual 32-channel scanner at the player's head casts **≤ 2,048 rays per frame** (Rapier `castRay` in the zone's private static world). Points go into a ring buffer of **60,000** (`THREE.Points`, one draw call, teal, 3 px) and fade over 2.5 s |
  | SEGMENTIERUNG | Flat `MeshBasic` class colours: table stone-600, cup teal, box stone-300, cable `#14B8A6`-muted, robot (EMI) orange, unknown = background. Glass and mirror are not segmented |

- **Task:** EMI-02 needs five things tagged for its gripper. The player aims and presses E. **An object can be tagged only in a mode where it is visible.**

  | Object | RGB | TIEFE | LIDAR | SEG |
  |---|---|---|---|---|
  | Becher (stone-300 cup in a stone-300 niche) | faint | ✓ | ✓ | ✓ |
  | Glasflasche | ✓ | ✗ (hole) | ✗ | ✗ |
  | Schwarze Samtkiste (in shadow) | ✗ | ✗ (no return) | ✓ | ✓ |
  | Kabel am Boden (Ø 8 mm) | ✓ | ✗ (below resolution) | ✗ (between scan lines) | ✓ |
  | Spiegel | ✓ | wrong depth | ghost points | ✗ |

- **Success → stamp:** all 5 tagged. The result card shows the full matrix next to the modes the player actually used. Stamp value: „5/5 · 4 Sensoren genutzt".

| | DE | EN |
|---|---|---|
| Entdecker | „Für dich ein Tisch mit Kram. Für den Roboter: Zahlen. Jeder Sensor sieht etwas anderes — und jeder hat blinde Flecken." | "To you, a table full of stuff. To a robot: numbers. Every sensor sees something different, and every sensor has blind spots." |
| Entscheider | „Kein Sensor sieht alles: Glas, Schwarz und Spiegel sind typische Lücken. Fragen Sie, welche Sensoren kombiniert werden und was passiert, wenn einer ausfällt." | "No sensor sees everything: glass, black and mirrors are typical gaps. Ask which sensors are fused and what happens when one fails." |
| Für Neugierige | „Tiefenkamera: Abstand pro Pixel, per Stereo oder Lichtlaufzeit. LiDAR: Abstand = Lichtgeschwindigkeit × Laufzeit ÷ 2." | "Depth camera: distance per pixel, via stereo or time of flight. LiDAR: distance = speed of light × travel time ÷ 2." |

#### Station B: Dunkelkammer (Verstehen), MUST

- **Mode lock:** entering forces LIDAR and disables the other modes. HUD: `// SENSOR · LIDAR · EINZIGER SENSOR`.
- **The bump:** the obvious corridor looks open in LiDAR, but **glass pane G1** blocks it. The pane has a player collider but is excluded from rays.
  - On contact: a thud (70 Hz sine plus a glass tick), a 0.1 s camera micro-shake (off with reduced motion), and the HUD line „Kontakt — LiDAR sieht nichts".
- **Lights up:** the lights fade up over 1 s and stay on for 6 s, revealing 3 glass panes and the mirror. EMI-02 speaks.
- **Fusion:** the lights go down and **Fusion** is enabled. Three ultrasonic cones (front and ±30°, range 3 m, 15° half-angle) include glass. Their returns are drawn as **stone-100** points so they read differently from the teal LiDAR points.
- **Mirror:** rays hitting the mirror reflect once, and the point is plotted along the *original* direction at d₁ + d₂. This creates a phantom corridor behind the mirror.
- **Success → stamp:** reaching the exit door. Value: „Ausgang in 48 s · 1 Glaskontakt".
- **Hidden album `spiegel-geisterpunkte`:** walking into the phantom corridor until within 0.5 m of the mirror while in LIDAR → „Spiegel erzeugen Geisterpunkte: LiDAR sieht einen Gang, den es nicht gibt." / "Mirrors create ghost points: the LiDAR sees a corridor that doesn't exist."

| | DE | EN |
|---|---|---|
| Entdecker | „Glas lässt den Laser durch — für LiDAR ist es Luft. Deshalb kombinieren Roboter Sensoren: Ultraschall hört, was Licht nicht sieht." | "Glass lets the laser through; to LiDAR it's air. That's why robots fuse sensors: ultrasound hears what light can't see." |
| Entscheider | „Jeder Sensor hat Ausfallmodi. Fragen Sie nach der Sensorfusion und nach dem Verhalten bei Glas, Spiegelung und Staub." | "Every sensor has failure modes. Ask about sensor fusion and about behaviour with glass, reflections and dust." |

#### Station C: Messstrecke ★ (Messen), MUST

- **Bedienmodus** behind the tripod, looking along the rail.
- **Panel controls:** Distanz [1 · 3 · 6 · 9 m] (the carriage drives at 1.5 m/s), Licht [Labor · Gegenlicht], and **„30 Messungen"**.
- **Prediction (once):** „Bei 1 m streut die Messung ±2 mm. Wie stark bei 6 m?" Slider 2–150 mm, log scale. Measured value: 72 mm.
- **Model** (`SIM · LIVE`, labelled „Spielzeugmodell: Stereo-Tiefe, Fehler ∝ Distanz²"):
  - `reading = z + N(0, σ)`, with `σ(z) = 2 mm·(z / 1 m)²`.
  - Gegenlicht: σ ×2.5, and dropout probability `min(0.6, 0.05·z)`. Dropouts show as gaps labelled „keine Messung".
- **Feedback:**
  - Each reading appears as a teal dot on the plate and fills a histogram bin with a tick whose pitch follows the bin.
  - The panel shows the histograms overlaid by distance, plus a **Kennlinie σ over distance** (points, fitted z² curve, and a second series for Gegenlicht).
- **Success → stamp:** at least 3 distances × 30 readings in Labor, plus 1 distance with Gegenlicht. Value: „σ(6 m) = 7,2 cm · Gegenlicht ×2,5". Awards **question card #9**.

| | DE | EN |
|---|---|---|
| Entdecker | „Doppelte Distanz, vierfacher Fehler: Bei Stereo-Kameras wächst die Unsicherheit mit dem Quadrat des Abstands." | "Double the distance, four times the error: with stereo cameras, uncertainty grows with the square of the distance." |
| Entscheider | „Datenblatt-Genauigkeit gilt bei Laborlicht und kurzer Distanz. Messen Sie in Ihrer Halle, bei Ihrem Licht, in Ihrem Abstand." | "Datasheet accuracy holds under lab light at short range. Measure in your hall, with your light, at your distance." |
| Für Neugierige | „σ_z ≈ z² · σ_d ÷ (f · B) — f Brennweite, B Basisabstand der Kameras, σ_d Pixelfehler." | "σ_z ≈ z² · σ_d ÷ (f · B), where f is focal length, B camera baseline and σ_d pixel error." |

**Befundkarte:**
- **Messgröße:** Tiefenrauschen σ über Distanz und Licht.
- **Grenze:** σ ∝ Distanz²; Gegenlicht ×2,5 (Spielzeugmodell).
- **Frage an den Anbieter:** „Was ist das Ergebnis in einer zweiten Umgebung?"
- **Für Ihr Werk:** Sensorik am realen Arbeitsplatz prüfen, nicht im Showroom.

**EMI-02 lines:**

| Trigger | DE (Entdecker / Entscheider) | EN |
|---|---|---|
| Enter | „Willkommen im Sensordom. Setz meine Brille auf: Tasten 1 bis 4." / „Sie sehen ab jetzt, was ich sehe: Tasten 1 bis 4." | "Welcome to the Sensor Dome. Put on my visor: keys 1 to 4." |
| A done | „Keiner meiner Sensoren sieht alles. Zusammen sehen sie genug." | "None of my sensors sees everything. Together they see enough." |
| Glass bump | „Für meinen Laser war da nichts. Licht an — schau, was wirklich da ist." / „…sehen Sie, was…" | "To my laser, nothing was there. Lights on: look what's really there." |
| Album | „Da ist kein Gang. Das ist ein Spiegel. Mein LiDAR glaubt ihm trotzdem." | "There's no corridor. It's a mirror. My LiDAR believes it anyway." |
| C start | „Ich weiß nicht, wie genau ich bei sechs Metern bin. Lass es uns messen." / „…Messen wir es." | "I don't know how accurate I am at six metres. Let's measure it." |

**Sound:**
- dome room tone (an 80 Hz hum plus low-passed noise)
- LiDAR whirr (band-passed noise modulated at 10 Hz) with a tick per sweep; outside, the LiDAR head is audible within 40 m
- a two-tone mode-switch click
- the glass thud
- quiet 4 kHz ultrasonic pips
- measurement ticks pitched by histogram bin

**Budget:**
- Detail ≤ 80 draw calls, exterior ≤ 40, far 3.
- ≤ 120k tris; 2 local lights (Labor spots, no shadows).
- One `Points` draw call; ≤ 2,048 rays per frame at ≤ 1.0 ms.
- A private Rapier world holding only static colliders.

**Acceptance:**
1. Spawn screenshot: the Schleuse is centred, the dome fills about 40 % of the frame width, and the teal LiDAR fan is visible above it.
2. In the Labor with mode 3: a black frame with a teal point cloud of the table and walls, at ≥ 60 fps.
3. Mode 2: a stone-to-teal depth ramp, with the bottle as a black hole.
4. G1 blocks the player and gets no LiDAR points; the lights reveal it.
5. The phantom corridor behind the mirror is visible in LiDAR.
6. σ(6)/σ(1) over 30 samples lands at 36 ± 40 % (statistical check).
7. `solve-a`, `solve-b`, `solve-c` and `album` debug hooks award correctly.

---

### 7.2 Zone 02: `regelgarten`, REGELN · Regelgarten / Control Garden

| | |
|---|---|
| Eyebrow | `// 02 · REGELN · REGELKREIS` / `// 02 · CONTROL · FEEDBACK LOOP` |
| Anchor / rotationY / facing | (−40.00, −69.28) / +30° / 150 |
| Plot / ground / cap | r 22 / y 0 / 24 m |
| Gate / spawn | local (0, 0, 22) / world (−28.00, 0, −48.50), looking at bearing 330 |
| Paths | Spoke 330; ring to 01 and 03 |
| Question card | **#4** „Was wurde vorher erwartet?" |
| Album | `sim-to-real-luecke` |

**Fantasy.** A sculpture garden of things that only stay upright because they are corrected. You hear the control loop tick.

**Structures** (local coordinates):

| Structure | Spec |
|---|---|
| **Pendelmast** (landmark) | Rail track 16 m along x, from (−8, 0, −10) to (8, 0, −10), on a 17 × 2 × 1.2 m plinth with hazard-taped end stops. Cart 1.6 × 1.2 × 1.0 m. **Pole 12 m** (Ø 0.35, `darkMetal`) with an orange ring at the pivot (it rotates) and a stone-100 tip sphere Ø 0.6. Always balancing; visible from the hub |
| **Leitstand** (console) | 3 × 1 m at (0, 0, −1) facing −z. Bedienmodus camera at (0, 1.7, 1.5), aimed at the mast's mid-height |
| **Gehirn-Stapel** | 2.4 × 2.4 × 7.5 m glass tower at (−6.5, 0, −2) with three floors: **REFLEX ≤ 1 kHz**, **SKILL 30–200 Hz**, **PLANER wenige Hz**. Each floor's light-strip pulses at the layer rate (rates above 30 Hz are drawn as steady light), and pulses flow downward |
| **Balancier-Bahn** (A) | 6 m rail along x at z = 6, x 5 → 11, on a 0.9 m plinth. Interchangeable pole. A sign selects ERDE / MARS / MOND. Player stands at (8, 0, 10) |
| **Weltenwand** (C) | 10 × 7.2 m wall at x = −13, z −1 → 9, facing +x: 16 × 16 cells of 0.6 × 0.45 m. Console at (−8, 0, 4) facing −x |
| Set dressing | Three slowly precessing gyroscope sculptures (animated only) and low stone planters on stone-300 gravel |
| EMI-03 | (3, 0, 14) |

#### Station A: Balancieren (Probieren), MUST

- **Bedienmodus inputs:**
  - **A/D** push the cart with ±40 N (50 ms ramp).
  - **1/2/3** pick pole length 0.5 / 1 / 2 m.
  - **G** cycles gravity: Erde 9,81 · Mars 3,71 · Mond 1,62.
  - **R** resets.
- **Physics:** the cart-pole ODE (Appendix B). Cart M = 5 kg, uniform rod m = 1 kg, cart friction b = 0.5 N·s/m. RK4 at a fixed 1 kHz. Start angle θ₀ = ±1.5°.
- **Fail:** |θ| > 30° (the pole drops onto a padded stop at 75° with a clack), or the cart leaves |x| > 2.7 m.
- **Readout:** timer, θ, and the best time per length and gravity. The tip leaves a short teal trail.
- **Success → stamp:** each of the 3 lengths tried for at least 2 s, plus one run of at least 5 s in any configuration.
  - After 6 failed attempts, EMI suggests the Moon.
  - Value: „2 m: 7,4 s · 0,5 m: 0,9 s · Mond probiert".

| | DE | EN |
|---|---|---|
| Entdecker | „Der lange Stab ist leichter! Er kippt langsamer — die Kippzeit wächst mit √(L/g). Auf dem Mond hättest du fast eine Sekunde." | "The long pole is easier! It tips more slowly; tipping time grows with √(L/g). On the Moon you'd have almost a second." |
| Entscheider | „Ein Mensch reagiert in rund 0,2 Sekunden. Was schneller kippt, kann nur ein Regler halten." | "A human reacts in about 0.2 seconds. Anything that tips faster can only be held by a controller." |
| Für Neugierige | „Kippzeit τ = √(2L ÷ 3g). Erde 0,5 m: 0,18 s · Erde 2 m: 0,37 s · Mond 2 m: 0,91 s." | "Tipping time τ = √(2L ÷ 3g). Earth 0.5 m: 0.18 s · Earth 2 m: 0.37 s · Moon 2 m: 0.91 s." |

#### Station B: Regler & Takt ★ (Verstehen), MUST

- **Model.** The giant pendulum simulates **L = 1 m, M = 5 kg, m = 1 kg** and is drawn **12× scaled**, with the label „Darstellung 12-fach vergrößert" `SIM · LIVE`.
  - The controller is full-state feedback, `u = Kp·θ + Kd·θ̇ + Kx·x + Kv·ẋ`. Kx and Kv are fixed; the player tunes Kp and Kd.
  - It samples at the **Takt** with a zero-order hold, behind a latency FIFO.
  - The plant integrates at 1 kHz.
- **Panel:**
  - Sliders P and D, plus presets „Nur P", „P + D" and „Gut abgestimmt".
  - **Takt**: 1000 / 200 / 50 / 20 / 10 / 5 Hz.
  - **Latenz**: 0–200 ms in 10 ms steps.
  - **„Schubs"** button: a 30 N, 0.1 s impulse on the cart.
  - A live θ(t) plot over 10 s with the ±30° fail lines.
- **Gehirn-Stapel dials:**
  - **Reflex** is the Takt above.
  - **Skill** (5 / 30 / 100 / 200 Hz) updates a ramped cart target `x_ref` with a zero-order hold. At 5 Hz the motion becomes visibly stair-stepped, but the pole stays up.
  - **Planer** (0.2–5 Hz) picks the next of 3 rail marks. Slow means pauses, never a fall.
  - Lesson: a slow planner is fine; a slow reflex is not.
- **Island gusts** push the giant pendulum.
- **After a fall:** the pole drops to 75° with a heavy clunk. „Aufrichten" plays a 3 s winch animation.
- **Tuning targets with the default gains (acceptance):**

  | Takt | Required behaviour |
  |---|---|
  | 1000 Hz and 200 Hz | Stable; recovers a Schubs in < 2 s |
  | 50 Hz | Stable, but rings visibly after a Schubs |
  | 20 Hz | Stable without a push (the lowest stable rate) |
  | 10 Hz | Falls within 3 s of a Schubs |
  | 5 Hz | Falls within 2 s without a push |
  | Latency at 1 kHz | Falls at 60–120 ms |

- **Prediction:** „Ab welchem Takt fällt der Stab nach einem Schubs?" Options 200 / 50 / 20 / 10 / 5, log scale. Measured value: the highest Takt at which the player actually saw it fall.
- **Success → stamp:** the player has seen a fall at Reflex ≤ 10 Hz, then survived a Schubs at ≥ 200 Hz. Value: „Fällt bei 10 Hz · stabil ab 20 Hz · Latenzgrenze 90 ms". Awards **question card #4**.

| | DE | EN |
|---|---|---|
| Entdecker | „Ein Regler misst, vergleicht, korrigiert — immer wieder. P drückt zurück, D bremst das Schwingen. Und zu langsam gemessen ist zu spät korrigiert." | "A controller measures, compares, corrects, over and over. P pushes back, D damps the swing. Measure too slowly and you correct too late." |
| Entscheider | „Fragen Sie nach der Regelfrequenz pro Ebene — und was passiert, wenn eine hängt. Faustregel: Je klarer und stabiler die Aufgabe, desto eher RL. Je mehr Varianten, desto eher VLA. WAM ist heute F&E." `RICHTWERT` | "Ask for the control rate per layer, and what happens when one stalls. Rule of thumb: the clearer and more stable the task, the more RL fits. The more variants, the more VLA fits. WAM is R&D today." |
| Für Neugierige | „Roboter haben einen Gehirn-Stapel: Reflexe bis 1 kHz (RL oder klassischer Regler), Fähigkeiten mit 30–200 Hz (VLA), Planung mit wenigen Hz (Sprachmodell)." `RICHTWERT` | "Robots have a stacked brain: reflexes up to 1 kHz (RL or classic control), skills at 30–200 Hz (VLA), planning at a few Hz (language model)." |

#### Station C: Tausend falsche Welten (Messen), MUST

- **Population.** 256 mini cart-poles on the wall, one per cell. Each one runs in a **randomised world**:

  | Parameter | Range |
  |---|---|
  | L | 0.6–1.4 m |
  | m | 0.5–1.5 kg |
  | M | 3–7 kg |
  | b | 0–2 |
  | Sensor noise σθ | 0–0.5° |
  | Latency | 0–20 ms |

  The cell's background tint encodes L.
- **Policy:** linear, 4 gains. **Optimiser: real Cross-Entropy Method.**
  - Population 256 (one sample per world, with worlds re-randomised every generation).
  - Elite 26 (10 %), smoothing α = 0.7, std floor.
  - **8 generations.**
- **Episodes:** 5 s at dt 5 ms (semi-implicit Euler). Computed in chunks of ≤ 1 ms per frame, or in a Worker. Each generation's trajectories replay on the wall over 4 s, so the player sees the wall go from chaos to calm.
- **Measurement:** after each generation, the mean gains are evaluated on 256 fresh worlds. Success means upright for 5 s with |x| < 2 m. This gives a **Kennlinie of success over generations**, with Wilson bands at n = 256.
- **Comparison button „Nur eine Welt trainieren"** (no randomisation) draws a second curve.
- **„Übertragen"** applies the gains to the giant pendulum. Its "real world" is L 1.1, m 1.2, latency 15 ms, and it gets a scripted gust.
  - Tuning target: the randomised policy holds; the single-world policy falls.
- **Prediction:** „Wie viel % der 256 Welten schafft die Policy nach 8 Generationen?" (0–100).
- **Success → stamp:** 8 randomised generations plus one transfer. Value: „Gen 8: 91 % von 256 Welten · Übertragung gehalten".
- **Hidden album `sim-to-real-luecke`:** transferring a single-world policy and watching it fall → „In einer Welt trainiert, in der echten gefallen: die Sim-to-Real-Lücke." / "Trained in one world, fell in the real one: the sim-to-real gap."

| | DE | EN |
|---|---|---|
| Entdecker | „Roboter lernen in der Simulation — millionenfach hinfallen kostet dort nichts. Damit es draußen hält, trainiert man in tausend falschen Welten." | "Robots learn in simulation, where falling a million times costs nothing. To make it hold outside, you train in a thousand wrong worlds." |
| Entscheider | „Simulation ersetzt keine Messung. Fragen Sie: Mit welchen Abweichungen wurde trainiert — und wurde unter Ihren Bedingungen getestet?" | "Simulation doesn't replace measurement. Ask: which variations were trained, and was it tested under your conditions?" |
| Für Neugierige | „Cross-Entropy-Methode: 256 Versuche, die besten 10 % zeigen der nächsten Generation die Richtung. Eine Roboterhand brauchte für einen Zauberwürfel rund 13.000 Jahre simulierte Erfahrung." `STUDIE` (OpenAI, 2019) | "Cross-entropy method: 256 tries; the best 10 % point the next generation's way. A robot hand needed about 13,000 years of simulated experience for a Rubik's cube." |

All C draws use `SIM · LIVE` with the note „echte Optimierung, Spielzeugmodell".

**Befundkarte:**
- **Messgröße:** kleinste stabile Regelfrequenz, Latenzgrenze.
- **Grenze:** Reflex unter 20 Hz → Absturz (Spielzeugmodell).
- **Frage:** „Was wurde vorher erwartet?"
- **Für Ihr Werk:** Lassen Sie sich die Regelfrequenzen pro Ebene und das Verhalten bei Ausfall zeigen.

**EMI-03 lines:**

| Trigger | DE (Entdecker / Entscheider) | EN |
|---|---|---|
| Enter | „Ich stehe nur, weil ich mich ständig korrigiere. Die Insel übrigens auch." | "I only stay upright because I keep correcting. So does the island." |
| A fail on 0,5 m | „Zu spät. Der kurze Stab kippt in 0,18 Sekunden, du brauchst 0,2. Nimm den langen." / „…Sie brauchen 0,2. Nehmen Sie den langen." | "Too late. The short pole tips in 0.18 s; you need 0.2. Take the long one." |
| B fall | „Zehn Hertz. Zu langsam gemessen ist zu spät korrigiert." | "Ten hertz. Measure too slowly and you correct too late." |
| C start | „Für Reinforcement Learning fällt ein Roboter in der Simulation millionenfach hin. Hier reichen 256 Welten." | "For reinforcement learning, a robot falls a million times in simulation. Here, 256 worlds will do." |
| Album | „In einer Welt trainiert, in der echten gefallen. Das ist die Sim-to-Real-Lücke." | "Trained in one world, fell in the real one. That's the sim-to-real gap." |

**Sound:**
- **The loop-rate click train is the zone's signature.** A soft click plays at the Reflex rate. Up to 200 Hz it is heard as discrete clicks; at 1 kHz it becomes a quiet buzz at −30 dB. You *hear* the loop.
- Pendulum creak (resonant filtered noise tied to angular velocity), a clunk on falls, a winch whirr, gyro-sculpture hum.
- Wall generations: a whoosh plus a short arpeggio whose pitch follows the success rate.

**Budget:**
- Detail ≤ 80 draw calls (wall = 2 InstancedMesh + 1 background), exterior ≤ 40, far 3.
- ≤ 100k tris; no local lights needed (outdoor).
- No Rapier; all custom ODEs. CPU in `update` ≤ 1.5 ms.

**Acceptance:**
1. Spawn screenshot: the 12 m mast is upright against the sky, with the Gehirn-Stapel and the Weltenwand visible.
2. A's physics matches τ within 10 %.
3. The tuning targets above are met.
4. The wall visibly settles by generation 8; the randomised policy reaches ≥ 80 % of the 256 worlds.
5. The transfer outcomes match.
6. The click-train rate audibly changes with the Takt.

---

### 7.3 Zone 03: `greifwerkstatt`, GREIFEN · Greifwerkstatt / Grip Workshop

| | |
|---|---|
| Eyebrow | `// 03 · GREIFEN · KINEMATIK & KRAFT` / `// 03 · GRASP · KINEMATICS & FORCE` |
| Anchor / rotationY / facing | (40.00, −69.28) / −30° / 210 |
| Plot / ground / cap | r 22 / y 0 / 24 m |
| Gate / spawn | local (0, 0, 22) / world (28.00, 0, −48.50), looking at bearing 30 |
| Paths | Spoke 30; ring to 02 and 04 |
| Question cards | **#2** „Wie viele Versuche?" and **#5** „Wie viele Objektlagen?" |
| Album | `singularitaet` |

**Fantasy.** A workshop where you can see forces: joint rings, friction cones, and an egg that tells the truth.

**Structures** (local coordinates):

| Structure | Spec |
|---|---|
| **Riesenarm** (landmark) | Base Ø 4 m at (−9, 0, −11). 3 links (6 / 5 / 3 m) with orange rings on 3 joints and the wrist, ending in a three-finger gripper holding a **4 m egg** (ellipsoid 2.8 × 4 × 2.8, stone-50 matte). Max height 18 m. The swept volume stays inside r ≤ 22. Idle 40 s loop: lift the egg from its cradle at (−1, 0, −16), rise to 16 m, set it back. In station B its fingers squeeze in sync with the player's grip force |
| **Gelenk-Bühne** (A) | 1 m pedestal at (8, 0, −7). Planar 3-link arm (2.0 / 1.6 / 1.0 m, joint limits ±160°) moving in the local x-y plane at z = −7. Dark backdrop panel 10 × 7 m at z = −8.5 with a grid and a teal workspace outline. Three orange rings (Ø 0.6 m torus) on thin cables at base-relative (x, y) **R1 (2.2, 3.2), R2 (−1.5, 2.4), R3 (3.6, −0.2)**. Bedienmodus at (8, 1.7, −1) |
| **Greiftisch** (B) | Bench 3 × 1.2 × 0.9 m at (−7, 0, 4), with a parallel-jaw gripper on a small overhead gantry and an object shelf. Bedienmodus at (−7, 1.6, 7), pitch −25° |
| **Prüfstand „200 Griffe"** (C) | Glass cabinet 4 × 2.5 × 2.5 m at (7, 0, 6), with an automated gripper, an egg feeder, and a hazard-tape floor border. Tally board 4 × 2.2 m (canvas) on the cabinet's front top. Bedienmodus at (7, 1.7, 10.5). One local light inside |
| EMI-04 | (0, 0, 14) |
| STRETCH: EMI-Drehteller | Turntable at (−12, 0, 10). EMI-04 stands on it; aim + E at an orange ring to wiggle that joint. Counter „Gelenke gefunden: 9/17" |

#### Station A: Gelenke (Probieren → IK), MUST

- **Phase 1, joint mode:**
  - **1/2/3** select a joint (or click its ring). **A/D** or the mouse wheel rotate it (60°/s; 5° per wheel notch). A servo whine rises with joint speed.
  - Readout: `θ₁ 42° · θ₂ −71° · θ₃ 18° → x 3,41 m · y 2,07 m`.
  - A ring counts when the tip passes within 0.15 m of its centre: the ring turns teal and ticks.
- **Phase 2, target mode** (offered after one ring or 45 s; toggle **T**):
  - Click on the backdrop plane to set a teal target.
  - A **CCD solver** (joint limits, ≤ 12 iterations) shows each iteration as a fading ghost arm (stone-500, over 0.8 s). The real arm then moves in joint space in 0.8 s.
  - If |p| > 4.6 m, the arm stretches toward the target and stops, with the HUD message „Außerhalb des Arbeitsraums".
  - If manipulability falls below the threshold, the HUD shows `SINGULARITÄT` and the joints visibly jump.
- **Success → stamp:** all 3 rings threaded, in any mode. Value: „3/3 Ringe · 1:42 min · Gelenk + Ziel".
- **Hidden album `singularitaet`:** setting a target with 4.4 m < |p| ≤ 4.6 m that triggers the warning → „Singularität: Bei gestrecktem Arm springen die Gelenke schon bei kleinen Zielwechseln." / "Singularity: near full stretch, tiny target changes make the joints jump."

| | DE | EN |
|---|---|---|
| Entdecker | „Jedes Gelenk ist eine Rechnung. Winkel → Handposition heißt Vorwärtskinematik. Andersrum — Ziel → Winkel — ist inverse Kinematik: Der Rechner probiert, bis es passt." | "Every joint is a calculation. Angles → hand position is forward kinematics. The other way round, target → angles, is inverse kinematics: the computer tries until it fits." |
| Entscheider | „Reichweite und Traglast gelten nie gleichzeitig maximal. Fragen Sie nach der Traglast bei voller Reichweite und nach der Wiederholgenauigkeit über Temperatur." | "Reach and payload are never both at maximum. Ask for payload at full reach and for repeatability across temperature." |
| Für Neugierige | „x = L₁·cos θ₁ + L₂·cos(θ₁+θ₂) + L₃·cos(θ₁+θ₂+θ₃). EMI hat 17 Drehgelenke plus 2 Räder — jedes Orange ist eine Achse." | "x = L₁·cos θ₁ + L₂·cos(θ₁+θ₂) + L₃·cos(θ₁+θ₂+θ₃). EMI has 17 revolute joints plus 2 wheels; each orange ring is an axis." |

#### Station B: Das Ei (Verstehen), MUST

- **Gripper and contact.** The gripper is kinematic: parallel jaws, opening 0–120 mm.
  - Contact model: once the jaws touch, `F_N = k·δ`, with effective **k = 8 N/mm** (compliant pads).
  - **Hold** if `2·μ·F_N ≥ m·(g + a)`; otherwise the object slips out. Dropped objects fall in a private Rapier world (≤ 10 bodies).
  - Lift: **Space**, with acceleration a = 2 m/s² by default.
- **The egg:** short axis Ø 44 mm, m = 0.06 kg, **F_break = 30 N**.
  - At the break: 40 instanced shell shards, a yolk particle splash, and a **0.25× slow-motion replay for 2 s with the force curve**, the spike annotated.
- **Three sub-steps:**
  1. **„Nur Position":** hold the left mouse button to close at 10 mm/s; release to stop. No force display and no visible deformation. In practice, about half of attempts crack or slip.
  2. **„Kraftsensor an"** (after one B1 attempt): a live force graph (0–40 N) with a teal target band at 2–8 N. A creak plays at 200 Hz + 20 Hz/N, so you can find the band by ear.
  3. **„Kraftregelung an"** (after one B2 attempt): **„Greifen mit 5 N"** runs a force PI loop at 1 kHz and always succeeds.
- **Reibungstisch** (same bench): pick an object and a pad, set the lift acceleration with a slider (0–10 m/s²) and the grip force with a slider (0–100 N, force-controlled).

  Objects:

  | Object | Mass | Breaks at |
  |---|---|---|
  | Ei | 0.06 kg | 30 N |
  | Stahlblock | 2 kg | — |
  | nasses Glas | 0.4 kg | 80 N |
  | STRETCH: Mehlsack | 5 kg | — |

  μ by pad and object (`RICHTWERT`, rounded):

  | Pad \ Object | Ei | Stahlblock | nasses Glas | Mehlsack |
  |---|---|---|---|---|
  | Stahl | 0,3 | 0,5 | 0,1 | 0,4 |
  | Gummi | 0,7 | 0,8 | 0,25 | 0,7 |
  | Silikon | 0,9 | 1,0 | 0,35 | 0,8 |

  - A bar compares the **required F_N = m(g+a)/(2μ)** with the set force, the gripper maximum (100 N) and the break limit.
  - Overlays: **teal friction cones** at both contacts (half-angle atan μ) and force arrows. When the load vector leaves the cone, the object slips with a squeak.
- **Riesenarm sync:** the landmark's fingers close in proportion to F_N (0–30 N → 0–6°) and shiver on a crack.
- **Success → stamp:** the egg lifted intact once (any sub-step), plus at least 3 Reibungstisch lifts with at least 2 objects, at least one of them a slip. Value: „Ei: 5,0 N gehalten · nasses Glas/Gummi rutscht unter 9,4 N".

| | DE | EN |
|---|---|---|
| Entdecker | „Greifen heißt: fest genug, dass nichts rutscht — und sanft genug, dass nichts bricht. Ohne Kraftsensor rät der Roboter. Mit Kraftsensor regelt er." | "Grasping means: firm enough that nothing slips, gentle enough that nothing breaks. Without a force sensor the robot guesses. With one, it controls." |
| Entscheider | „Greifen ist meist der Engpass. Greiferbacken und Hände sind Verschleißteile — sie gehören in die Kostenrechnung." | "Grasping is usually the bottleneck. Jaws and hands are wear parts; they belong in the cost model." |
| Für Neugierige | „Haltebedingung: 2 · μ · F_N ≥ m · (g + a). Wer schnell hebt (großes a), braucht mehr Griffkraft — das ist Trägheit." | "Holding condition: 2 · μ · F_N ≥ m · (g + a). Lifting fast (large a) needs more grip force: that's inertia." |

#### Station C: 200 Griffe ★ (Messen), MUST

- **Prediction:** „Wie viele von 20 Eiern greift der Roboter nur mit Kamera?" (0–20).
- **Panel configs:**
  - Sensorik [nur Kamera · Kamera + Taktil]
  - n [20 · 200]
  - Pad-Verschleiß [0 · 250 k · 500 k · 1 M Zyklen]
  - Vibration [aus · an]
- **Run:** the cabinet rig grasps automatically. The first 20 trials take 0.4 s each; then the speed ramps to 8×.
- **Model:**
  - Base success probability **0.50 (Kamera) / 0.85 (Kamera + Taktil)**. These are drawn from the study rates and carry the honest label „Zufallsziehung mit den Studien-Raten — zeigt die Streuung, nicht das Experiment" `SIM · LIVE`.
  - Wear: ×(1 − 0.3 · Zyklen / 1 M). Vibration: −0.05.
  - Failure split: Kamera → 60 % Bruch / 40 % Rutschen; Taktil → 30 % / 70 %.
- **Feedback:**
  - Each trial adds a dot on the tally board: teal ✓ for success, stone ✕ for failure, with an icon, not colour alone.
  - Kennlinie of the success rate with a **Wilson band that narrows with n** (16/20 → 58–92 %).
  - Second Kennlinie: success over wear cycles (4 points), „Kennlinie statt Etikett".
- **Chips:**
  - `STUDIE`: „Eine Studie: Ei 50 % → 85 %, je 20 Versuche — kein Naturgesetz."
  - `QUELLE` (to be pinned, Appendix D): „Roboterhände verschleißen oft in unter einem Jahr."
- **Success → stamp:** both sensor configs run at n ≥ 20, plus one run at n = 200. Value: „Kamera 52 % [45–59] · +Taktil 86 % [80–90] · n = 200". Awards **question cards #2 and #5**.

| | DE | EN |
|---|---|---|
| Entdecker | „16 von 20 heißt: irgendwo zwischen 58 und 92 %. Erst viele Versuche machen eine Aussage scharf." | "16 out of 20 means somewhere between 58 and 92 %. Only many trials make a claim sharp." |
| Entscheider | „‚16 von 20' heißt 58–92 %. Fragen Sie nach der Zahl der Versuche und der Objektlagen — und planen Sie Verschleißteile ins ROI ein." | "'16 out of 20' means 58–92 %. Ask for the number of trials and object poses, and budget wear parts into the ROI." |
| Für Neugierige | Wilson interval (Appendix B), in words: „Das Intervall ist bei kleinem n breit und wird mit √n schmaler." | "The interval is wide for small n and narrows with √n." |

**Befundkarte:**
- **Messgröße:** Greiferfolg mit/ohne Taktil, über Verschleiß.
- **Grenze:** bei n = 20 ±17 Prozentpunkte.
- **Frage:** „Wie viele Versuche? Wie viele Objektlagen?"
- **Für Ihr Werk:** Greifen ist der Engpass, Verschleiß ein Kostenfaktor.

**EMI-04 lines:**

| Trigger | DE (Entdecker / Entscheider) | EN |
|---|---|---|
| Enter | „Hier wird gegriffen. Mein Arm hat sieben Gelenke — wie deiner. Zähl die orangen Ringe." / „…wie Ihrer. Zählen Sie…" | "This is where we grasp. My arm has seven joints, like yours. Count the orange rings." |
| A joint mode | „Drei Gelenke, drei Tasten. Umständlich? So fühlt sich Vorwärtskinematik an." | "Three joints, three keys. Clumsy? That's what forward kinematics feels like." |
| IK ghosts | „Jetzt rechne ich. Die Geister sind meine Versuche." | "Now I calculate. The ghosts are my attempts." |
| B crack | „Kaputt. Ich wusste nicht, wie fest ich drücke. Schalt mir den Kraftsensor ein." / „Schalten Sie mir…" | "Broken. I didn't know how hard I was squeezing. Turn on my force sensor." |
| C | „Zwanzig Versuche sind eine Anekdote. Zweihundert sind eine Kennlinie." | "Twenty trials are an anecdote. Two hundred are a curve." |

**Sound:**
- servo whine (low-passed sawtooth at 300 + 400·|ω| Hz)
- ring tick; creak pitched by force
- egg crack (noise burst plus 3 clicks); slip squeak (downward band-pass sweep)
- rhythmic cabinet clatter; tally blips (880 Hz success, 220 Hz failure)

**Budget:**
- Detail ≤ 80 draw calls, exterior ≤ 40, far 3.
- ≤ 140k tris (giant egg ≈ 2k, Riesenarm ≈ 6k).
- 1 local light (cabinet); private Rapier world with ≤ 10 bodies; shards instanced.

**Acceptance:**
1. Spawn screenshot: the Riesenarm holds the 4 m egg high above the workshop. Orange appears only on its joint rings, the A rings and the hazard tape.
2. Rings register; IK ghosts are visible; out-of-reach targets stop the arm.
3. B1 can crack the egg, with a slow-motion replay showing the force spike. B3 always succeeds.
4. Friction cones are visible; the wet glass slips with steel pads.
5. The tally fills; the Wilson band at n = 200 is visibly narrower than at n = 20.

---

### 7.4 Zone 04: `lern-dojo`, LERNEN · Lern-Dojo / Learning Dojo

| | |
|---|---|
| Eyebrow | `// 04 · LERNEN · IMITATION` / `// 04 · LEARN · IMITATION` |
| Anchor / rotationY / facing | (80.00, 0.00) / −90° / 270 (west) |
| Plot / ground / cap | r 22 / y 0 / 24 m |
| Gate / spawn | local (0, 0, 22) / world (56, 0, 0), looking at bearing 90 |
| Paths | Spoke 90; ring to 03 and 05 |
| Question cards | **#8** „Gleiche Eingaben im Betrieb wie im Training?" and **#6** „Welche Lizenz haben die Gewichte?" |
| Album | `policy-kopiert-fehler` |

**Fantasy.** An open pavilion where a robot learns by watching you. Your demonstrations hang in the sky as teal ribbons.

**Structures** (local coordinates):

| Structure | Spec |
|---|---|
| **Pavilion** | Roof plate 22 × 22 × 0.6 m at y = 9, centred (0, 9, −4), stone-900, on 8 columns Ø 0.5 (corners plus mid-sides) with an 8 × 8 m skylight |
| **Demo-Wolke** (landmark) | Above the roof at y 11–20. Every recorded demo appears as a **teal ribbon** (tube, 64 segments), its end-effector path scaled ×4. Policy rollouts appear as **orange** ribbons. At most 16 ribbons, oldest fading. **Five example ribbons exist from the start**, so the silhouette reads before play. Ribbons sway in gusts |
| **Teleop-Tisch** (A/B) | 2.4 × 1.6 × 0.85 m at (0, 0, −3). A 2-link SCARA arm (0.7 / 0.6 m) mounted at (0, 0.85, −3.8), with a pusher Ø 6 cm as end effector. **Orange block**, 8 cm cube (it is the objective). Goal: a 14 × 14 cm teal outlined square. A coverage heatmap texture (32 × 24) on the table shows where demos have been. Bedienmodus camera at (0, 1.75, −1.2), pitch −40° |
| **Gehirn-Fenster** | 6 × 3.4 m screen at (0, 4.8, −8) facing +z, with three panels: **SEHEN** (8 × 8 patch grid of a 128² top-camera render target, updated at 10 Hz), **VERSTEHEN** (command card), **HANDELN** (action-chunk bars, 10 steps × 2 dims, streaming at 50 Hz) |
| **Datensatz-Wand** (C) | 12 × 4.5 m wall at x = −10, z −12 → 0, facing +x. A 2048 × 768 canvas with 250 sparklines (25 × 10). Console at (−6, 0, −6) facing −x |
| EMI-05 | (3, 0, 2) |

#### Station A: Vormachen (Probieren), MUST

- **Inputs** (Bedienmodus):
  - The mouse moves the end-effector target over the table plane (analytic 2-link IK).
  - **Hold the left mouse button** to put the pusher down; release to lift it.
  - Recording starts automatically when the block is first touched. **Backspace** discards.
- **Physics:** private Rapier world at 120 Hz. Static table; dynamic block (cuboid 0.08 m, 0.2 kg, friction 0.4, linear damping 2.0); kinematic pusher (cylinder r 0.03).
- **Recording:** at 50 Hz, state `s = (block x, z, EE x, z)` and action `a = ΔEE per 20 ms`. A demo ends on success (block centre inside the goal) or after 30 s.
- **Demo setup:** all five demos start the block inside the **Startfeld**, a 30 × 20 cm region on the right of the table.
- **Feedback:** each finished demo draws a teal path on the table and adds its scaled ribbon to the Demo-Wolke, with a record beep.
- **Failed demos:** offered as „Verwerfen" or „Trotzdem behalten" (the hidden album path).
- **Success → stamp:** 5 successful demos. Value: „5 Demos · Ø 7,8 s".
  - Entscheider: „Beispiel-Demos laden" after 30 s gives a grey „übersprungen" stamp.

| | DE | EN |
|---|---|---|
| Entdecker | „Vormachen statt programmieren: Du steuerst, der Roboter zeichnet auf. Jede Demo ist ein Pfad aus Zuständen und Aktionen." | "Demonstrate instead of programming: you steer, the robot records. Every demo is a path of states and actions." |
| Entscheider | „Demonstrationen sind der Rohstoff. Der Engpass ist meist die Zeit der Menschen, die vormachen — nicht die Rechenleistung." | "Demonstrations are the raw material. The bottleneck is usually the time of the people demonstrating, not compute." |

#### Station B: Nachmachen ★ (Verstehen), MUST

- **„Trainieren":** builds dataset D from all kept samples, each pairing a state with the next 10 actions.
  - **Policy:** k-NN (k = 3) in normalised state space (block relative to goal, plus EE), returning the averaged **action chunk** of 0.2 s. It executes the chunk and re-queries.
  - A 2 s "compute" hum plays, and the window shows „Training: 5 Demos · 1.950 Beispiele".
- **Rollout 1**, in the training distribution (same start): the **orange ribbon threads through the teal bundle**, copying the player's hesitations.
- **Rollout 2**, out of distribution:
  - The player drags the block (grab icon) to a new start outside the teal coverage.
  - A meter, „Abstand zu den Trainingsdaten" (NN distance), rises past an `#F87171` threshold.
  - The ribbon drifts, errors compound, and after 15 s the rollout times out: **„Fehlschlag: Distribution-Shift"**.
- **Fix:** record **at least 2 demos** from the new region, retrain, and that rollout succeeds.
- **Gehirn-Fenster during rollouts:** patches (SEHEN), the card „Schieb den orangen Block ins Ziel" / "Push the orange block into the goal" (VERSTEHEN), and streaming chunks (HANDELN). Honest label: **„So ist ein VLA aufgebaut. Hier läuft ein einfacher Nächster-Nachbar-Imitator."** `SIM · LIVE`.
- **Entscheider fast path:** 5 preloaded demos, plus „Demos für neue Lage laden" (3 preloaded).
- **Success → stamp:** in-distribution success, then out-of-distribution failure, then success after the new demos. Value: „Training ✓ · neue Lage ✗ → +3 Demos → ✓". Awards **question cards #8 and #6**. Card #6 comes with EMI's line about who owns the trained weights.
- **Hidden album `policy-kopiert-fehler`:** train with at least one kept failed demo, and an in-distribution rollout fails → „Die Policy kopiert auch Fehler: Eine schlechte Demo im Datensatz wird nachgemacht." / "The policy copies mistakes too: a bad demo in the dataset gets imitated."

| | DE | EN |
|---|---|---|
| Entdecker | „Es hat nicht die Aufgabe gelernt. Es hat dich gelernt — samt Zögern. Und wo du nie warst, weiß es nichts." | "It didn't learn the task. It learned you, hesitations included. And where you never went, it knows nothing." |
| Entscheider | „Ein Modell kann nur, was in den Daten steckt. Fragen Sie: Gleiche Eingaben im Betrieb wie im Training — Objektlagen, Licht, Kamera?" | "A model can only do what's in the data. Ask: same inputs in operation as in training, meaning object poses, light, camera?" |
| Für Neugierige | „Behaviour Cloning: Zustand → Aktion, aus Beispielen gelernt. Action Chunking sagt mehrere Schritte voraus und glättet. Kleine Fehler summieren sich: Compounding Error." | "Behaviour cloning: state → action, learned from examples. Action chunking predicts several steps at once and smooths. Small errors add up: compounding error." |

#### Station C: Datensatz-Audit (Messen), MUST

- **Dataset** (generated procedurally from a per-session seed; `ILLUSTRATIV`, „anonymisiertes Muster, keine Kundendaten"):
  - 250 episodes, each drawn as an end-effector speed sparkline.
  - A **contiguous dead block of 35 episodes (14 %)** at a random position, shown as flat lines: the robot never moves.
  - 12 episodes recorded with **„Kamera verschoben"**: normal sparkline, but a different thumbnail tint.
  - 4 truncated failures.
- **Inputs:** click and shift-click to select a range; „Ausfiltern", „Neu trainieren", „Evaluieren (n = 50)".
- **Prediction:** „Wie viele Prozentpunkte bringt das Aufräumen?" (0–40 pp).
- **Model** (`ILLUSTRATIV` parameters; `SIM · LIVE` draws):

  | Dataset state | Success rate |
  |---|---|
  | Raw | 58 % |
  | Dead block removed | +14 pp → 72 % |
  | Camera-shift episodes removed | +6 pp |
  | Failures removed | +2 pp |

- **Output:** a Kennlinie of success per dataset version with Wilson bands; evaluations accumulate.
- **Success → stamp:** dead block filtered (≥ 90 % of it, ≤ 5 false removals), plus at least one evaluation before and after. Value: „Totblock 14 % gefunden · 58 % → 72 % (n = 50, ±13)".

| | DE | EN |
|---|---|---|
| Entdecker | „Müll rein, Müll raus: 14 % der Demos zeigen einen Roboter, der sich nie bewegt. Wer die Daten nicht prüft, trainiert Stillstand." | "Garbage in, garbage out: 14 % of the demos show a robot that never moves. If you don't check the data, you train standing still." |
| Entscheider | „Prüfen Sie den Datensatz vor dem Training, nicht nach dem Pilot. Ein Daten-Audit ist billiger als ein Pilot, der an den Daten scheitert." | "Check the dataset before training, not after the pilot. A data audit is cheaper than a pilot that fails on its data." |

**Befundkarte:**
- **Messgröße:** Erfolg in und außerhalb der Trainingsverteilung; Datenqualität.
- **Grenze:** außerhalb der Demo-Abdeckung versagt die Policy.
- **Frage:** „Gleiche Eingaben im Betrieb wie im Training?"
- **Für Ihr Werk:** Datensatz auditieren lassen, bevor Sie in Training investieren.

**EMI-05 lines:**

| Trigger | DE (Entdecker / Entscheider) | EN |
|---|---|---|
| Enter | „Hier lerne ich von dir. Mach's mir vor — fünfmal." / „Hier lerne ich von Ihnen. Machen Sie es mir vor — fünfmal." | "Here I learn from you. Show me, five times." |
| B success | „Ich habe nicht die Aufgabe gelernt. Ich habe dich gelernt." / „…Ich habe Sie gelernt." | "I didn't learn the task. I learned you." |
| OOD fail | „Da warst du nie. Also weiß ich nicht, was ich tun soll." / „Da waren Sie nie. …" | "You never went there. So I don't know what to do." |
| Card #6 | „Und wem gehört das Modell jetzt? Frag das immer." / „Fragen Sie das immer." | "And who owns the model now? Always ask." |
| C | „Zweihundertfünfzig Demos. Fünfunddreißig davon: Stillstand. Findest du sie?" / „Finden Sie sie?" | "Two hundred and fifty demos. Thirty-five of them: standing still. Can you find them?" |

**Sound:**
- record beep (two short 1.2 kHz pips); ribbon shimmer (quiet high noise)
- training hum (rising filtered saw, 2 s); success chime (a fifth); failure (low descending)
- wall hover ticks; filter whoosh

**Budget:**
- Detail ≤ 80 draw calls (ribbons merged into 2 geometries: demos and policy, rebuilt on change), exterior ≤ 40, far 3.
- ≤ 120k tris; 1 render target at 128²; private Rapier world with ≤ 5 bodies; 1 local light.

**Acceptance:**
1. Spawn screenshot: the pavilion with the teal ribbon cloud above it.
2. Teleop pushes the block, and ribbons appear on the table and in the cloud.
3. The policy reproduces in-distribution, and fails reproducibly at the out-of-distribution start until new demos are added.
4. The Gehirn-Fenster shows all three panels.
5. The dead block is visible as flat lines, and filtering raises the curve.

---

### 7.5 Zone 05: `dunkelfabrik`, ARBEITEN · Dunkelfabrik / Dark Factory

| | |
|---|---|
| Eyebrow | `// 05 · ARBEITEN · STATION 7` / `// 05 · WORK · STATION 7` |
| Anchor / rotationY / facing | (40.00, 69.28) / −150° / 330 |
| Plot / ground / cap | r 22 / y 0 / 24 m |
| Gate / spawn | local (0, 0, 22) / world (28.00, 0, 48.50), looking at bearing 150 |
| Paths | Spoke 150; ring to 04 and 06; close to the avenue and Landedeck |
| Question card | **#7** „Wann endet ein Lauf?" |
| Album | `ueberschaetzte-geste` |
| railingGaps | One gap of about 14° on the back arc, centred on the Verladebucht |

**Scenario** (`FIKTION`): **Station 7** is a palletising station next to the hardening furnace of a fictional Mittelstand plant.
- 18 kg crates, 38–44 °C, night shifts.
- From 2027, two of its three shift posts will be empty.

**Fantasy.** You do the hard work yourself. Then you watch your post go empty. Then you turn off the lights and see what keeps running.

**Structures** (local coordinates):

| Structure | Spec |
|---|---|
| **Hall** (landmark) | Windowless monolith 30 × 20 × 18 m: x −15…15, z −14…6. Panels `#141414` / stone-950. One **orange status slit** (20 × 0.35 m at y = 12) on the front façade: the only orange on the exterior besides the door. Door opening 6 × 5 m at x −3…3, z = 6, with a hazard-taped frame |
| Forecourt (z 6…20) | QUELLE board 4 × 2.5 m at (−8, 0, 12) facing +z. EMI-06 at (4, 0, 12) |
| **Verladebucht** | The outgoing conveyor leaves through the back wall at (10, ·, −14) onto a cantilever platform to z = −19 over the void. Finished pallets sink into a deck lift |
| **Line** (Station 7) | Furnace box 4 × 6 × 5 m at x −15…−11, z −11…−5, with a glowing amber mouth (`#FFB347` emissive plus a flickering point light; this is light, not a brand surface). **Conveyor** along z = −8 from x −11 to x 4 (15 m, 1 m wide, 0.9 m high, instanced rollers). Crates 0.6 × 0.4 × 0.3 m, stone-600 with a hazard label |
| Cells (C) | **Etikett prüfen**: camera arch at x −6 with teal IR beams. **Kiste greifen**: a procedural 6-axis arm at (4, 0, −10). **Palettieren**: pallet at (9, 0, −8). **Umreifen**: station at (12, 0, −11) with a stylised faceless human silhouette (stone-700). **Anfahren**: an AMR shuttle running Umreifen → Verladebucht. **Störung beheben**: a service point at (0, 0, −10) |
| **Handpalette** (A) | (10, 0, −3). A 2 × 3 layer pattern, 2 layers = 12 slots |
| **Schichtplan-Wand** (B) | On the interior front wall: z = 5.7, x −13…−4, 9 × 4.5 m, facing −z. 6 posts (rows) × 3 shifts (columns: Früh, Spät, Nacht) = 18 flip panels of 0.9 × 0.6 m |
| **Amortisationswaage** (B) | Brass-and-dark-steel beam 6 m long, pivot at y = 3, at (−8, 0, −1). Two pans and a block shelf beside it |
| **Galerie** (C) | Mezzanine at y = 5.5 over x 9…14.5, z −5…5.5, with a railing. **Stair** along the front wall, 1.5 m wide at z 4…5.5, rising from x 3.5 (y 0) to x 13.5 (y 5.5): 30 steps of 0.183 m. **Leitstand** at (11.5, 5.5, −4) facing −x, looking down the line toward the furnace. A FANUC plaque beside it |
| Lights | Day: furnace point light plus one high hall point light, with emissive ceiling strips on. „Licht aus": the hall light is reassigned to the **orange work lamp** above Umreifen; ceiling strips go off. `ctx.env.enterInterior({ ambient: 0.25 })` by day and `0.02` with the lights out |

#### Station A: Schicht (Probieren), MUST

- **First person, no Bedienmodus.** Crates arrive at the conveyor end (4, ·, −8) every 6 s, queueing up to 4.
- **Lift:** **E** within 1.5 m of a crate, with a 0.6 s lift animation.
- **Carry** (crate attached to the camera):
  - speed factor 0.45 (4.5 → 2.0 m/s), no sprint
  - head-bob ×2 (off with reduced motion)
  - breathing audio, with a heartbeat after 5 lifts
  - vignette rising from 0.15 to 0.45 with accumulated load
- **Place:** **E** at the Handpalette snaps the crate to the next slot.
- **Bending:** if the camera pitch is below −35° at the moment of lifting, the counter „Gebückt" goes up.
- **HUD Körperlast card:** `HÜBE 7 · BEWEGT 126 kg · GEBÜCKT 3 · 41 °C`, plus a 60 s timer.
- **End** (60 s or 12 crates):
  - „In 60 s: 9 Hübe, 162 kg."
  - „Station 7 im 20-s-Takt: 1.440 Hübe ≈ 26 t pro 8-h-Schicht" `ILLUSTRATIV`
  - The QUELLE board stats are shown, and the line: **„Roboter übernehmen die harte Arbeit, Menschen das Denken."**
- **Success → stamp:** at least 6 crates placed, or the 60 s run out with at least 3. Value: „9 Hübe · 162 kg in 60 s · 41 °C".
  - Entscheider: may stop after 30 s, which counts. Skipping entirely gives a grey stamp.
- **QUELLE board:**
  - „Fachkräftelücke Deutschland 2027: 728.000" (IW Köln)
  - „Altenquotient EU 2025: 34,5 %" (Eurostat)
  - „Roboterdichte Deutschland: 449 pro 10.000 Beschäftigte" (IFR)

| | DE | EN |
|---|---|---|
| Entdecker | „18 Kilo, 41 Grad, alle 20 Sekunden — acht Stunden lang. Diese Arbeit macht heute ein Mensch. Morgen vielleicht niemand mehr." | "18 kilos, 41 degrees, every 20 seconds, for eight hours. Today a person does this. Tomorrow maybe nobody will." |
| Entscheider | „Wer macht diese Aufgabe heute? Welche Position bleibt leer? Roboter übernehmen die harte Arbeit, Menschen das Denken." | "Who does this task today? Which position will stay empty? Robots take on the hard work, people the thinking." |

#### Station B: Schichtplan & Waage (Verstehen), MUST

- **Part 1, Schichtplan-Wand** (Bedienmodus):
  - **Posts:** Palettieren am Ofen · Kisten umsetzen · Sichtprüfung Etikett · Maschinenbeladung · Umreifen · Anlagenführung.
  - Each token shows an anonymous age band (e.g. „58") `ILLUSTRATIV`.
  - **Year slider 2026 → 2035.** Ages advance with the slider; at 65 a token flips to **RUHESTAND** with a flip-dot clatter.
  - Refill: one hire every 2 years, assigned to the lowest-burden posts. So the **heavy, hot and night posts empty first**.
  - **„Dein Posten"** / „Ihr Posten" (Palettieren am Ofen · Spät) is marked and **flips empty in 2027**.
  - **Robot tokens** (3) can be dropped **only on empty posts**. An occupied post refuses with a shake and the line „Roboter übernehmen die harte Arbeit, Menschen das Denken."
  - On drop, the player chooses a type [kognitiver Roboter · Cobot · feste Automatisierung] and gets honest feedback (`RICHTWERT`, EmAI assessment 2026):

    | Post | Feedback |
    |---|---|
    | Palettieren am Ofen | Gleiches Teil, fester Takt → Cobot oder feste Palettierzelle passt. Kognitiver Roboter: „Pilot, nicht Serie (2026)." |
    | Kisten umsetzen | Wechselnde Kisten am menschengemachten Arbeitsplatz → kognitiver Roboter plausibel als begleiteter Pilot. |
    | Sichtprüfung Etikett | Feste Kamera + Modell (feste Automatisierung) gewinnt. |
    | Maschinenbeladung | Cobot. |
    | Umreifen | Deformierbares Band → „noch nicht" (L1). |
    | Anlagenführung | Mensch. „Hier wird gedacht." |

  - When a robot fills a heavy post, the displaced person's token animates up to **Anlagenführung**.
- **Part 2, Amortisationswaage:**
  - Applies to the post the player automated (default: Palettieren am Ofen).
  - **Left pan, CAPEX blocks** (1 k€ = 1 kg of block, label visible):

    | Item | Value | Chip |
    |---|---|---|
    | Cobot | **85 k€** (range 50–120) | `RICHTWERT` |
    | Greifer + Sensorik | **10 k€** (5–15) | `RICHTWERT` |
    | Integration & Sicherheit | **40 k€** | `ILLUSTRATIV` |
    | Rechner | **1 k€** (0,6–1,5) | `RICHTWERT` |

  - **Right pan:** one block per simulated year.
    - Formula: `Schichten × 85 k€ × Abdeckung − OPEX`.
    - FTE reference 80–95 k€/Jahr `RICHTWERT`.
    - Abdeckung: 80 % by default, or the player's autonomous share from C if done.
    - OPEX: wear 4 k€ + maintenance 8 % of CAPEX + supervision 0.2 FTE ≈ 17 k€ `ILLUSTRATIV`.
    - Shifts slider: 1–3.
  - **Beam:** analytic damped spring, ±12°. It tips with a heavy clunk at the payback year, e.g. „Jahr 3,8" (1 Schicht, default blocks).
  - **Not tipped by year 4** → „Empfehlung: kein Pilot. Grund: Amortisation > 4 Jahre bei 1 Schicht. Alternativ: 2 Schichten abdecken oder feste Automatisierung prüfen."
  - Note: „Vereinfachte Rechnung: Wert des leeren Postens ≈ Vollkosten einer Stelle."
- **Success → stamp:** slider at 2030 or later, at least 1 robot token placed with its feedback, and the Waage run to year 6. Value: „2030: 5 von 18 Posten leer · Amortisation Jahr 1,3 (2 Schichten)".

| | DE | EN |
|---|---|---|
| Entdecker | „Zuerst werden die schweren Posten leer: heiß, schwer, nachts. Ein Roboter auf einem leeren Posten ersetzt niemanden — er füllt eine Lücke." | "The heavy posts empty first: hot, heavy, nights. A robot on an empty post replaces nobody; it fills a gap." |
| Entscheider | „Vergleichen Sie den Roboter mit dem Posten, der leer bleibt — nicht mit einem Menschen. Rechnen Sie mit Richtwerten über mindestens drei Jahre. ‚Kein Pilot' ist ein gültiges Ergebnis." | "Compare the robot with the post that stays empty, not with a person. Calculate with guide values over at least three years. 'No pilot' is a valid outcome." |
| Für Neugierige | „Drehmoment = Masse × Hebelarm. Die Waage kippt, wenn die Summe der Jahre die Anschaffung überwiegt." | "Torque = mass × lever arm. The beam tips once the sum of the years outweighs the purchase." |

#### Station C: Licht aus ★ (Messen), MUST

- **Step 1, gesture cards** (Bedienmodus at the Leitstand):
  - Station 7 is split into six gestures. The player sets each to **L0–L4**. L5 is shown but locked: „2035+ · Forschungsziel".
  - Each card shows the realistic range as a hint. Hidden true capability C_g (`RICHTWERT`, EmAI-Autonomieskala):

    | Gesture | Hint | C_g |
    |---|---|---|
    | Anfahren | „L3–L4 (wie Klinik-Transport)" | 4 |
    | Kiste greifen | „Pick-and-Place L2–L3" | 3 |
    | Etikett prüfen | „Inspektion L3" | 3 |
    | Palettieren | „feste Zelle bis L4" | 4 |
    | Umreifen | „deformierbar: L1" | 1 |
    | Störung beheben | „L1–L2" | 2 |

  - Level table (`RICHTWERT`, „EmAI-Autonomieskala, angelehnt an SAE J3016"):

    | Level | Aufsicht | Haftung |
    |---|---|---|
    | L0 | 100 % | Bediener |
    | L1 | ~100 % | Bediener |
    | L2 | ~50 % | geteilt |
    | L3 | ~20 % (RtI) | geteilt |
    | L4 | ~5 % | Hersteller |
    | L5 | 0 % | „jenseits industrieller Realität" |

  - Live line: „Station 7: L1 — begrenzt durch Umreifen".
- **Step 2, „Licht aus" lever:**
  - Over 6 s, six relay clunks switch off the cells **gesture by gesture**.
  - Gestures at L4 run in the dark. L3 gestures keep a dim standby light plus an on-call human. Gestures at L2 or below keep a person: **the orange work lamp stays lit above the human silhouette at Umreifen**.
  - Final image: a dark hall where only orange joint rings, teal IR beams and one or two orange lamps move.
- **Step 3, night shift fast-forward:**
  - 22:00–06:00 runs in 60 s: Takt 20 s → 1,440 cycles.
  - Intervention probability per cycle by chosen level: L0 1.0 · L1 0.5 · L2 0.1 · L3 0.01 · L4 0.002.
  - **If the chosen level is above C_g,** the failure rate stays at the C_g rate, but no human is assigned to that gesture. Each failure then becomes an **MRC** (safe stop) with 30 game-minutes of downtime.
  - **Interactive RtIs:** up to 5 are sampled from L3 events. Time drops to 1×, the orange lamp at that cell lights, and the HUD shows „RtI · Etikett prüfen · 10 s". The player clicks „Übernehmen" within 10 s. A missed RtI becomes an MRC.
  - All other events are resolved statistically and counted.
- **Output** (`SIM · LIVE`, rates `ILLUSTRATIV`):
  - **autonomer Anteil** = cycles in which no gesture needed a human / all cycles
  - interventions per hour; MRC minutes
  - a Kennlinie of the autonomous share per hour (8 points)
  - an auto-composed sentence: „Autonomer Anteil von 46 % bei Station 7 — begrenzt durch Umreifen (L1). Ohne Umreifen: 97 %."
- **Lights-out plaque (anonymised, D6):** „Seit 2001 bauen bei einem japanischen Roboterhersteller Roboter im Dunkeln Roboter, bis zu 30 Tage ohne Aufsicht." `QUELLE · Business 2.0 / CNN Money, Juni 2003`.
- **Success → stamp:** one complete night shift with the lights out. Value: „autonomer Anteil 46 % · 3,1 Eingriffe/h · begrenzt durch Umreifen". Awards **question card #7**.
- **Hidden album `ueberschaetzte-geste`:** run a shift with any gesture set above its C_g → „Überschätzte Geste: Umreifen auf L4 — Band verheddert, MRC um 23:14, niemand da. Ein Anwendungsfall ist nur so autonom wie seine schwächste Geste."

| | DE | EN |
|---|---|---|
| Entdecker | „‚Autonom' ist kein Etikett, sondern ein Anteil. Die Linie läuft im Dunkeln — bis auf die eine Geste, die noch Hände braucht." | "'Autonomous' isn't a label, it's a share. The line runs in the dark, except for the one gesture that still needs hands." |
| Entscheider | „Sagen Sie nie nur ‚autonom'. Sagen Sie: ‚autonomer Anteil von 46 % bei Station 7'. Ein Anwendungsfall ist nur so autonom wie seine schwächste Geste. Wer mit L5 plant, plant für 2035+." | "Never just say 'autonomous'. Say 'an autonomous share of 46 % at Station 7'. A use case is only as autonomous as its weakest gesture. Planning for L5 means planning for 2035+." |
| Für Neugierige | „ODD: Einsatzbereich, für den das System gebaut ist. RtI: Aufforderung an den Menschen zu übernehmen. MRC: sicherer Zustand, wenn niemand übernimmt." | "ODD: the operating domain the system is built for. RtI: request for a human to take over. MRC: minimal-risk condition when nobody does." |

**Befundkarte:**
- **Messgröße:** autonomer Anteil, Eingriffe pro Stunde, Stillstand.
- **Grenze:** die schwächste Geste (Umreifen, L1) begrenzt die Linie.
- **Frage:** „Wann endet ein Lauf?"
- **Für Ihr Werk:** Zerlegen Sie den Use Case in Gesten und bewerten Sie jede einzeln.

**EMI-06 lines:**

| Trigger | DE (Entdecker / Entscheider) | EN |
|---|---|---|
| Enter | „Hier ist es heiß. Einundvierzig Grad am Ofen. Heb mal eine Kiste." / „Heben Sie mal eine Kiste." | "It's hot in here. Forty-one degrees at the furnace. Lift a crate." |
| A end | „Neun Kisten in einer Minute. Jetzt stell dir acht Stunden vor." / „Stellen Sie sich…" | "Nine crates in a minute. Now imagine eight hours." |
| Own post empties | „Dein Posten, 2027: leer. Nicht wegen eines Roboters — weil niemand nachkommt." / „Ihr Posten…" | "Your post, 2027: empty. Not because of a robot; because nobody's coming." |
| Lights out | „Licht aus. Wir Roboter brauchen keins. Fast alle." | "Lights out. We robots don't need any. Almost all of us." |
| Album | „Umreifen auf L4? Das Band hat sich verheddert, und niemand war da." | "Strapping at L4? The band got tangled, and nobody was there." |

**Sound:**
- furnace roar (low-passed brown noise with slow flicker); conveyor rumble with rhythmic roller clacks; crate thud
- breathing (filtered noise envelopes, 0.4 Hz resting → 0.8 Hz loaded) and heartbeat (low sine thumps)
- flip-dot clatter (click bursts); beam creak and a heavy tipping clunk
- six relay clunks for lights out, then a low hall drone continuing in the dark
- RtI alert (soft two-tone, never harsh); MRC stop hiss

**Budget:** this is the heaviest zone; give it the strongest developer.
- Detail ≤ 85 draw calls (instanced rollers, crates up to 40 instances), exterior ≤ 35, far 3.
- ≤ 150k tris; 2 local lights (furnace; hall/work lamp), no local shadows.
- Crates move kinematically (no dynamics); Rapier only for static colliders.

**Acceptance:**
1. Spawn screenshot: the black monolith with exactly one orange slit and a hazard-taped door, and the QUELLE board in the forecourt.
2. Carrying slows the player and shows the vignette and HUD.
3. The roster flips by year, and the player's own post empties in 2027.
4. The Waage tips at the computed year, ± one animation frame.
5. Lights-out screenshot: over 85 % of the frame below luminance 0.1, with orange joint rings, teal beams and one orange lamp over the silhouette.
6. The night-shift numbers reproduce with a fixed seed.
7. 60 fps.

---

### 7.6 Zone 06: `prueffeld`, MESSEN · Prüffeld / Proving Ground

| | |
|---|---|
| Eyebrow | `// 06 · MESSEN · MOBILE MESSZELLE` / `// 06 · MEASURE · MOBILE TEST CELL` |
| Anchor / rotationY / facing | (−40.00, 69.28) / +150° / 30 |
| Plot / ground / cap | r 22 / y 0 / 24 m |
| Gate / spawn | local (0, 0, 22) / world (−28.00, 0, 48.50), looking at bearing 210 |
| Paths | Spoke 210; ring to 05 and 01; close to the avenue and Landedeck |
| Question cards | **#1** „Wie ist Erfolg als Regel definiert?" and **#3** „Lässt sich der beste Lauf wiederholen?" (EMI-07 hands both out on arrival) |
| Album | `bester-von-40` |

**Fantasy.** Showroom versus measuring cell. On the left, a glossy stage where a robot never fails. On the right, behind a shutter, EmAI's mobile measuring cell next to a real line.

**Structures** (local coordinates):

| Structure | Spec |
|---|---|
| **Showroom** („Hersteller X", fictional, unbranded) | Stage 10 × 8 m, 0.4 m high, x −12…−2, z −8…0. Glossy stone-50 floor (roughness 0.15): **the one deliberately off-brand, vendor-aesthetic place in the game**. Three fake volumetric spotlight cones (additive, stone-100). **Vendor robot**: procedural 6-axis arm on a pedestal with a parts crate. **Not** a Unitree model |
| **Split-flap sign** (landmark) | 6 × 1.6 m on a 12 m truss gantry over the stage's back edge (y 6–7.6), double-sided: „100 % ERFOLG" |
| Backdrop | Wall 10 × 5 m at z = −8.5 with a 1 m gap at its −x end. Behind it at z = −10 is the **Take-Board**: a clapperboard wall with 40 takes, 39 crossed out (hidden album) |
| Partition and **Rolltor** | Wall in the plane x = 0, z −12…2, 6 m high. Shutter opening at z −8…0, 8 m wide, 5 m high |
| **Linien-Replik** | Conveyor 8 m along z at x = 7, z −10…−2. A second copy of the vendor arm at (5, 0, −6). Hazard-tape floor border. Gegenlicht floodlamp at (12, 3, −10) |
| **Messzelle** (landmark #2) | Container 6 × 2.5 × 3 m, `#292929`, with a hazard-taped bay, a 4 m sensor mast (thermal camera, watt meter, antenna) and a small EmAI wordmark (Em `#F5F5F4` / AI `#FF6700`, logo clear space respected). Rails along z at x = 10 from z 8 to −4. **Parked** with its centre at z = +6; **docks** at z = −3 |
| Live Kennlinie screen | 4 × 2.5 m canvas screen on the Messzelle's side facing −x |
| **Auswertetisch** (C) | Table at (6, 0, 6) with 3 seats. The player sits in one; two abstract faceless auditor figures (stone-700, labelled „Auditor B" and „Auditor C") sit in the others. Report printer slot on the Messzelle side |
| EMI-07 | (3, 0, 12) |

**Lights.** 2 local lights: the stage spots. After the shutter opens they are reassigned to the hall flood and the Gegenlicht.

#### Station A: Die Vorführung (Probieren), MUST

- **The demo.** The vendor arm picks 5 of 5 perfectly on a scripted loop, under spotlights and the only „glossy" jingle in the game. The sign reads „100 % ERFOLG". This is the vendor's claim, chip `FIKTION`.
- **Vendor terminal** „Frag den Hersteller" at the stage front (−7, 0, 1), in Bedienmodus:
  - 9 card slots. **Only cards the player holds can be played.** #1 and #3 come from EMI-07 on arrival; the rest from other zones. Missing cards show „Karte fehlt — Zone 03".
  - Each played card shows a caveat as a sticky tag on the sign, plus an EMI-07 comment.
- **Caveats** (`FIKTION`):

| # | Question (DE / EN) | Hersteller X answer |
|---|---|---|
| 1 | Wie ist Erfolg als Regel definiert? / How is success defined, as a rule? | „Erfolg = Teil berührt. Ablage nicht geprüft." |
| 2 | Wie viele Versuche? / How many trials? | „5 Versuche in dieser Vorführung." |
| 3 | Lässt sich der beste Lauf wiederholen? / Can the best run be repeated? | „Diese Aufnahme ist der beste von 40 Durchläufen." |
| 4 | Was wurde vorher erwartet? / What was expected beforehand? | „Keine Erwartung dokumentiert." |
| 5 | Wie viele Objektlagen? / How many object poses? | „Eine Lage, mit Anschlag fixiert." |
| 6 | Welche Lizenz haben die Gewichte? / What is the licence of the weights? | „Proprietär, Betrieb nur mit Cloud-Abo." |
| 7 | Wann endet ein Lauf? / When does a run end? | „Wenn der Bediener stoppt — Fehlversuche wurden abgebrochen, nicht gezählt." |
| 8 | Gleiche Eingaben im Betrieb wie im Training? / Same inputs in operation as in training? | „Training und Vorführung: Studiolicht, 500 lux." |
| 9 | Was ist das Ergebnis in einer zweiten Umgebung? / What is the result in a second environment? | „Nicht getestet." |

- **Success → stamp:** at least 2 cards played. Value: „4 Fragen · 4 Einschränkungen gefunden".
- **Hidden album `bester-von-40`:** standing within 3 m of the Take-Board and looking at it for 1 s → „Bester von 40: Die Vorführung war der Ausreißer, nicht die Regel." / "Best of 40: the demo was the outlier, not the rule."

| | DE | EN |
|---|---|---|
| Entdecker | „Eine Vorführung ist kein Messergebnis. Die richtigen Fragen zeigen, was hinter ‚100 %' steckt." | "A demo is not a measurement. The right questions show what's behind '100 %'." |
| Entscheider | „Nehmen Sie die neun Fragen in jedes Herstellergespräch mit. Eine fehlende Antwort ist auch eine Antwort." | "Take the nine questions into every vendor meeting. A missing answer is an answer too." |

#### Station B: Unter Last messen ★ (Verstehen), MUST

- **The reveal.** EMI-07: „Und jetzt unter Last."
  - The Rolltor rises over 4 s with a rattle. The showroom spots die with a clunk, and the hall floods come on.
  - The player walks to the Messzelle and **holds E** at the push handle. The cell rolls along its rails (kinematic, servo-assisted, 1.2 m/s while held) to the dock stop.
  - Docking: a clunk, the hazard bay unfolds, and the sensor mast extends.
- **Panel** (Bedienmodus):
  - Temperatur 22–44 °C
  - Vibration aus/mittel/stark
  - Licht Studio 500 lux / Halle mit Gegenlicht
  - Schichtdauer 0–8 h
  - n 20/50/100/200
  - „Messen"
- **Prediction:** „Wie viele von 200 Griffen gelingen bei 44 °C?" (0–200).
- **Run (fast-forward):**
  - The second arm performs abbreviated picks (0.3 s each).
  - Each trial is classified: **Erfolg / Teil-Erfolg / Rutschen / Fehlgriff / Übertemperatur-Stopp / Drift**.
  - Dots stream onto the screen. **Kennlinie:** x = shift time (0–8 h), y = rolling success (window of 25), with a **Wilson 95 % band**. Running total: „73 % [66–79] · n = 200 · 44 °C".
  - Side plot: torque drift over the shift, „12 % über 8 h bei 45 °C" `ILLUSTRATIV`.
- **Model** (`SIM · LIVE` draws, parameters `ILLUSTRATIV`):
  - `p(t) = 0.96 · f_T · f_V · f_L · f_D(t)`, where:
    - `f_T = 1 − 0.008·max(0, T − 25)`
    - `f_V = 1 / 0.96 / 0.90` (aus/mittel/stark)
    - `f_L = 1.0 (Studio) / 0.93 (Halle)`
    - `f_D(t) = 1 − 0.012·t_h·max(0, (T − 30)/14)`
  - Failure mix:
    - Übertemperatur-Stopp only at T ≥ 40 °C and t ≥ 4 h (20 % of failures).
    - Drift share grows from 0 to 30 % over the shift.
    - Rutschen 35 % (×1.5 with stark), Fehlgriff 25 % (×1.5 under Gegenlicht), Teil-Erfolg 15 %.
  - **Tuning target:** 44 °C, mittel, Halle, 8 h, n = 200 → 68–76 %.
- **The sign flip.** At the end, the giant sign flips mechanically over 2 s with a split-flap clatter, from „100 % ERFOLG" to the measured value, e.g. **„73 % ± 6 % · n = 200 · 44 °C"**.
- **Success → stamp:** one run with n = 200 at T ≥ 40 °C. Value: the sign text.

| | DE | EN |
|---|---|---|
| Entdecker | „Im Studio: 5 von 5. Unter Last, 200-mal: 73 % — und die Unsicherheit steht dabei. Erst viele Versuche unter echten Bedingungen sagen etwas." | "In the studio: 5 out of 5. Under load, 200 times: 73 %, with the uncertainty stated. Only many trials under real conditions tell you something." |
| Entscheider | „Messung statt Marketing: neben der echten Linie, mit echter Hitze, Vibration und Licht. Eine Aussage braucht eine Falsifikationsbedingung: ‚92 % bei 200 Versuchen — falsifiziert, falls < 80 % bei 45 °C.'" (`ILLUSTRATIV`) | "Measurement, not marketing: next to the real line, with real heat, vibration and light. A claim needs a falsification condition: '92 % over 200 trials, falsified if < 80 % at 45 °C.'" |
| Für Neugierige | „16/20 → 58–92 %. 80/100 → 71–87 %. 146/200 → 66–79 %." | same |

#### Station C: Drei Auditoren (Messen), MUST

- **Clips.** 12 replays, authored and fixed. The second arm re-performs each recorded trial in place: 4 s each, at 1×, loopable.
  - 5 clear successes, 2 clear Fehlgriffe, 1 Rutschen.
  - **4 ambiguous:** placed 15 mm off · regrasped · placed at 9.5 s · touched, then dropped beside the bin.
- **Tagging:** at the Auswertetisch the player tags each clip with keys 1–6: Erfolg / Teil-Erfolg / Fehlgriff / Rutschen / Kollision / Zeitüberschreitung. The NPC auditors have fixed round-1 tags and disagree with each other on the ambiguous clips.
- **κ meter:** the **mean pairwise Cohen's κ** across the three raters (Appendix B). Round 1 typically gives 0.5–0.65.
  - The printer refuses: **„κ = 0,58 < 0,8 — erst Erfolg als Regel definieren."**
- **Round 2, define the rule.** Three parameters:
  - Toleranz [±5 / ±10 / ±20 mm]
  - Zeitlimit [8 / 10 / 12 s]
  - Nachgreifen [erlaubt / nicht erlaubt]
- **Re-tag.** The NPC auditors now tag deterministically by the rule. The player re-tags the 4 ambiguous clips, which are framed with orange brackets.
  - κ ≥ 0.8 → the **Failure-Mode-Report** prints: a paper sheet slides out of the slot over 2 s with a dot-matrix buzz. A DOM card shows counts per failure mode, the rule, κ and n.
  - κ < 0.8 → disagreements are highlighted, and the player retries.
- **Success → stamp:** report printed. Value: „κ = 0,86 · Regel: ±10 mm, 10 s, ohne Nachgreifen".

| | DE | EN |
|---|---|---|
| Entdecker | „Wenn drei Leute dasselbe Video unterschiedlich bewerten, misst du Meinungen. Erst eine Regel macht daraus eine Messung. Cohen's Kappa zeigt, wie einig ihr seid." | "If three people rate the same video differently, you're measuring opinions. Only a rule turns that into a measurement. Cohen's Kappa shows how much you agree." |
| Entscheider | „Personenabhängige Audits sind keine Audits, sondern Meinungen. Verlangen Sie die Erfolgsregel und die Übereinstimmung der Prüfer: Cohen's Kappa ≥ 0,8." | "Person-dependent audits aren't audits, they're opinions. Demand the success rule and the inter-rater agreement: Cohen's Kappa ≥ 0.8." |
| Für Neugierige | „κ = (p_o − p_e) ÷ (1 − p_e): beobachtete Übereinstimmung gegen die, die man durch Zufall erwarten würde." | "κ = (p_o − p_e) ÷ (1 − p_e): observed agreement versus agreement expected by chance." |

**Befundkarte:**
- **Messgröße:** Erfolgsrate unter Last mit 95-%-Intervall; Prüferübereinstimmung.
- **Grenze:** Studio 100 % (n = 5) gegen Last 73 % ± 6 % (n = 200).
- **Frage:** „Wie ist Erfolg als Regel definiert?"
- **Für Ihr Werk:** Lassen Sie neben Ihrer Linie messen, mit Regel, n und Intervall.

**EMI-07 lines:**

| Trigger | DE (Entdecker / Entscheider) | EN |
|---|---|---|
| Enter | „Willkommen im Prüffeld. Links die Vorführung, rechts die Messung. Hier, zwei Fragekarten." | "Welcome to the Proving Ground. Demo on the left, measurement on the right. Here, two question cards." |
| A | „Hundert Prozent bei fünf Versuchen. Ich würde gern mehr wissen. Du auch?" / „Sie auch?" | "A hundred percent from five tries. I'd like to know more. Wouldn't you?" |
| Shutter | „Rolltor auf. Jetzt mit Hitze, Vibration und Hallenlicht." | "Shutter up. Now with heat, vibration and hall light." |
| Sign flip | „Dreiundsiebzig Prozent, plus minus sechs. Das ist keine schlechte Nachricht. Das ist eine Nachricht." | "Seventy-three percent, plus or minus six. That's not bad news. That's news." |
| κ fail | „Wir sind uns nicht einig. Dann schreiben wir den Bericht auch nicht." | "We don't agree. Then we don't write the report." |
| Album | „Vierzig Aufnahmen. Eine lief perfekt. Die haben wir gesehen." | "Forty takes. One ran perfectly. That's the one we saw." |

**Sound:**
- showroom jingle (soft major arpeggio, muted when the shutter opens); spotlight clunk-off
- shutter rattle (granular clicks); container rumble; docking clunk
- trial clicks whose rate follows the data stream (high blip success, low blip failure)
- split-flap clatter; printer buzz; κ meter ticks

**Budget:**
- Detail ≤ 80 draw calls, exterior ≤ 40, far 3.
- ≤ 140k tris (two vendor arms at about 8k each).
- 2 local lights; static colliders only (the Messzelle collider moves kinematically with it).

**Acceptance:**
1. Spawn screenshot: the glossy stage with spotlight cones and „100 % ERFOLG" on the left, the dark Messzelle with hazard tape on the right.
2. The shutter opens and the cell docks.
3. The Wilson band at n = 200 is visibly narrower than at n = 20.
4. The sign shows the measured value afterwards.
5. Round-1 κ is < 0.8 and refuses to print; consistent rule-based re-tagging gives ≥ 0.8 and prints.
6. The Take-Board album triggers.

---

## 8. Progression

### 8.1 Academy-Pass (Tab)

- A brand-styled card with **6 pages** (one per zone). Each page has 3 stamp slots, the zone's question cards, its album slot and its Befundkarte.
- **Each stamp records the player's own measured value and a mini Kennlinie** (Kennlinie statt Etikett). There is no pass/fail.
  - Skipped Probieren stations show grey „übersprungen".
- **18 stamps = the mark.** The Pass cover shows the complete Recamán mark, with the outer ring and all 17 arcs at 20 % opacity.
  - The 1st stamp fades the **ring** to 100 %. Stamps 2–18 fade arcs **k = 1…17** in sequence order, regardless of which station earned them.
  - This uses **opacity only**, which the logo rules allow. The mark is never incomplete, recoloured or rotated.
- **The Recamán melody.** Stamp n plays the note for `a(n−1)` from a = 0, 1, 3, 6, 2, 7, 13, 20, 12, 21, 11, 22, 10, 23, 9, 24, 8, 25: `f = 220 Hz · 2^(a/12)`, a soft mallet over a mechanical thunk. A full Pass plays the whole melody.

### 8.2 Prognose-Güte

The average prediction accuracy (§5.5) is shown on the Pass cover and on the certificate. It is the only score.

### 8.3 Fragenkarten (the nine vendor questions)

| # | Card | Awarded by |
|---|---|---|
| 1 | Wie ist Erfolg als Regel definiert? | prueffeld (on arrival) |
| 2 | Wie viele Versuche? | greifwerkstatt C |
| 3 | Lässt sich der beste Lauf wiederholen? | prueffeld (on arrival) |
| 4 | Was wurde vorher erwartet? | regelgarten B |
| 5 | Wie viele Objektlagen? | greifwerkstatt C |
| 6 | Welche Lizenz haben die Gewichte? | lern-dojo B |
| 7 | Wann endet ein Lauf? | dunkelfabrik C |
| 8 | Gleiche Eingaben im Betrieb wie im Training? | lern-dojo B |
| 9 | Was ist das Ergebnis in einer zweiten Umgebung? | sensordom C |

- Each card shows the question (DE/EN), why it matters (one line taken from the awarding station), and a „Kopieren" action.
- Holding all nine unlocks **„Checkliste kopieren"**.

### 8.4 Failure-Mode-Album (6 hidden entries)

Each entry is written as a report line: what broke, when, and why.

| Zone | Entry |
|---|---|
| sensordom | spiegel-geisterpunkte |
| regelgarten | sim-to-real-luecke |
| greifwerkstatt | singularitaet |
| lern-dojo | policy-kopiert-fehler |
| dunkelfabrik | ueberschaetzte-geste |
| prueffeld | bester-von-40 |

In Entdecker mode, once a zone's three stamps are done, its empty album slot shows a one-line hint.

### 8.5 Best values

Stored in localStorage:
- balance time per pole length and gravity
- ring time
- lowest stable Takt
- grip-force error
- demos needed to succeed out of distribution
- autonomous share
- κ
- trials measured in total

### 8.6 Finale and certificate

- **Finale:** §6.6. Unlock with stamps in at least 4 zones.
- **Certificate** (canvas → PNG, 1600 × 1000):
  - the EmAI wordmark and „Academy · Schwebewerk"
  - an optional typed name, stored locally only
  - mode and date
  - the 18 stamp values as tiny Kennlinien (no seals)
  - Prognose-Güte; total trials measured
  - the finale verdict sentence, in the player's own words from the tiles
  - the chip legend, and „Messung statt Marketing."
- **Entscheider mode** also gets a second PNG plus clipboard text: the nine questions, followed by the player's Befundkarten.
- No contact data and no prices (§13 Q4).

---

## 9. Art direction

### 9.1 Mood

A workshop above the clouds in evening light: part shipyard crane, part observatory, part precision instrument. Warm-dark and matte, never glossy blue sci-fi. The one exception is the Prüffeld showroom, glossy on purpose because it is the vendor's world.

### 9.2 Palette in 3D

| Token | Hex | Use in 3D |
|---|---|---|
| Base | `#141414` | Logo disc (exact, unlit), monolith, structure |
| Surface / elevated | `#1F1F1F` / `#292929` | Panels, consoles, Messzelle |
| Border | `#3D3D3D` | Railings, trims |
| Stone-300 → 500 | `#D6D3D1` `#A8A29E` `#78716C` | Plaza and deck concrete, gravel |
| Stone-800 / 900 / 950 | `#292524` `#1C1917` `#0C0A09` | Brushed-metal structure, roofs, visor |
| Stone-50 / 100 / 200 | `#FAFAF9` `#F5F5F4` `#E7E5E4` | EMI shell, giant egg, readout text, showroom floor |
| **Orange** | `#FF6700` (dark `#CC5200`) | **≈ 5 % of the screen at most.** Allowed uses: joint and rotor rings (*it rotates*), the current objective (beacon, spoke inlay, A rings, the Lern-Dojo block), hazard tape, key metric values, the medallion spiral, reticle brackets, the Dunkelfabrik slit and work lamp, RtI lamps, policy ribbons. **Never** large surfaces, floors, buildings or fog |
| **Teal** | `#2DD4BF` | Sensor rays and points, data ribbons, path inlays, trajectory previews, pads, friction cones, workspace outlines, Wilson bands, EMI eyes. Never competes with orange |
| Status | `#4ADE80` / `#F87171` / `#FBBF24` | Small UI states only; `#FBBF24` is the ILLUSTRATIV chip |

**Forbidden:** blue-grey neutrals, neon purple, rainbow palettes, and Inter.

### 9.3 Material library (`ctx.materials`, island team)

| Name | Definition |
|---|---|
| `deckConcrete` | Stone-400 base, triplanar procedural noise, world-space panel seams every 3 m (stone-500). Roughness 0.9, metalness 0 |
| `plazaStone` | Stone-300, radial seams. Roughness 0.85 |
| `darkMetal` | Stone-800, metalness 0.7, roughness 0.55, subtle brushed anisotropy faked by noise |
| `structure` | Stone-900, metalness 0.6, roughness 0.6 |
| `panel` / `panelElevated` | `#1F1F1F` / `#292929`, roughness 0.7 |
| `railing` | `#3D3D3D`, metalness 0.6, roughness 0.5 |
| `glass` | Stone-300 at opacity 0.18, roughness 0.05, envMap. **No transmission pass** |
| `hazardTape` | Canvas texture rasterised from `public/brand/hazard-tape.svg` (orange and `#0A0A0A` stripes at −45°) |
| `emissiveOrange` / `emissiveTeal` | Unlit, toneMapped false, on the BLOOM layer |
| `logoSpiral` / `logoDisc` | Unlit `#FF6700` / `#141414`, toneMapped false, **on the NO-BLOOM layer** |
| `screen` | CanvasTexture, unlit, toneMapped false |
| EMI set | `emiBody` (vertex colours: shell, shadow, chassis, structure, carbon), `emiAccent`, `emiVisor` |

There are **no image textures** apart from the brand SVGs rasterised at load. Everything else is procedural (canvas or shader).

### 9.4 Lighting and time of day

- **Fixed golden hour.** One `DirectionalLight`: `#FFE7C7`, intensity about 3.2, **azimuth 295° (WNW), elevation 16°**.
  - **Shadow map:** 2048² (1024² on low), orthographic 90 × 90 m frustum following the player with texel snapping, normalBias 0.02.
  - **Shadow casters:** only meshes larger than about 1 m; small props don't cast.
- **Hemisphere light:** sky `#A8A29E`, ground `#292524`, intensity 0.7.
- **Interiors** use `ctx.env.enterInterior` to scale the hemisphere down.
- **Tone mapping:** AgX, exposure 1.0, sRGB output.
- **Post-processing** (the `postprocessing` library):
  - **Selective bloom** on the BLOOM layer only: intensity 0.6–0.8, threshold 0.2, half resolution. The logo is excluded.
  - SMAA (high) or FXAA (low); subtle vignette 0.15.
- **Ending:** the sun animates to 3° elevation and the sky shifts to dusk (§6.6).

### 9.5 Sky, fog, cloud sea

- **Sky dome:** a gradient shader. Zenith `#292524` → `#57534E` → horizon `#B5A99C`. An amber halo (`#E8B07A`) spreads about 40° around the sun's azimuth near the horizon; sun disc `#FFF1DC`. No orange fog.
- **Fog:** `FogExp2`, colour `#9C928A`, density about 0.0016.
- **Cloud sea:** two fbm shader planes at y = −180 and −172, scrolling at 2 m/s.
  - Lit tops `#E7E5E4` to shadowed `#78716C`, with an amber tint toward the sun. They fade into the horizon colour with distance.
  - Up to 30 wisp sprites drift near the rim between y −60 and −20; they matter most for the ascent.
- **Distant Prüfinseln:** 3 fog-tinted silhouettes, one draw call each.
- **Camera planes:** near 0.05, far 3,000.

### 9.6 Underside machinery

Thruster pods, keel truss, cables and the Regelkern (§4.8 and §6.1).
- Only rotating hubs and gimbal axes carry orange.
- Rotors spin, and at speed swap to a translucent blur disc.
- No blinking lights, except that the objective beacon may pulse gently. The logo never pulses.

### 9.7 Signage and type

- **3D text:** troika-three-text loading the brand TTFs from `public/fonts/`.
  - Space Grotesk Bold: gate masts, façade-scale text, the split-flap sign.
  - Geist Mono Medium: eyebrows (`// 02 · REGELN · REGELKREIS`), readouts and screens.
- **DOM UI:** Geist for body, Geist Mono for numbers and eyebrows, Space Grotesk for titles.
- **Taglines:** Geist Mono Medium, uppercase, 0.12em tracking, `#A8A29E`, keeping the full stop.
- **Zone glyphs** (1.5 px stroke SVG) for the compass, map and masts:

  | Glyph | Zone | Shape |
  |---|---|---|
  | `sensor` | 01 | concentric arcs |
  | `pendel` | 02 | line with a dot |
  | `greifer` | 03 | two-jaw bracket |
  | `band` | 04 | three stacked curves |
  | `kiste` | 05 | square with a slit |
  | `kurve` | 06 | curve with a band |

### 9.8 Recamán spiral as architecture (three uses)

> **As built (Phase 4; Phase 5: a planar relief instead of the anamorphic sculpture, Appendix A):** use 1 is the sculpture that the tower draws: earned stamp n lights element n − 1 (0 = ring, 1–17 = arcs), the same order as the Pass cover; lines are revealed by the drawing arm, not animated otherwise, and the finale sweeps the lit lines once. Use 2 is the Allee number line in the floor (walking draws the 17 arcs; rule plaque, OEIS A005132) instead of the hoop railing. Use 3 is unchanged. The geometry stays static: nothing rotates, morphs or pulses.

1. **The medallion** on the Akademie-Turm (§6.1, Appendix A): the canonical mark, exact, upright, static, unlit, never bloomed.
2. **The Recamán-Allee railing:** a motif echo of tangent semicircles with stepping radii, in neutral `railing` metal. It is not the mark, so it is never orange.
3. **The Pass cover:** progress is shown by per-arc opacity (§8.1).

The mark is never rotated, mirrored, recoloured, glowed, pulsed or morphed. On busy backgrounds it always sits on its `#141414` disc.

---

## 10. Audio direction (procedural WebAudio)

### 10.1 Architecture

- **Setup.** One AudioContext, created on the Start click. Signal path: master → `DynamicsCompressor` → destination.
- **Buses:**

  | Bus | Content | Default level |
  |---|---|---|
  | `ambience` | wind, rotors | — |
  | `zone` | Per zone, distance-attenuated (full ≤ 20 m, silent ≥ 60 m) | — |
  | `ui` | Interface sounds | — |
  | `voice` | EMI chirps | — |
  | `music` | Score | −24 dB |

- **Sources.** Everything is built from oscillators, noise buffers, biquads, wave shapers and `ConvolverNode`s. The convolvers use procedurally generated impulse responses: a large hall for the Dunkelfabrik, a dome for the Sensordom, a metal shaft for the Kielraum.
- **Limits.** About 40 simultaneous voices. Spatialisation uses equal-power `PannerNode`; HRTF only for EMI. Audio CPU stays at or below 1 ms.

### 10.2 Sound map

| Where | Sounds |
|---|---|
| Island bed | Wind (filtered noise with gust envelopes); thruster drone (two detuned saws through about a 90 Hz low-pass, pitch following thrust, swelling with gusts); a quiet Regelkern tick near the hub that becomes a dense buzz in the keel |
| Score | **The stacked brain as music.** Three quiet layers: a slow **planner pad** (chord change every 4 s), a mid **skill arpeggio** (about 3 notes/s), and soft **reflex ticks** (8 Hz). The mix shifts by zone. It can be switched off |
| Hub | Libelle ball roll; pad charge and whoosh; lift hum and chime; dock clunk |
| Zones | See each zone's "Sound" section |
| UI | Dry clicks. Stamp = mechanical thunk plus a Recamán note. Card reveal = paper slide. No fanfares |
| EMI | 3-note FM chirp per line. Each unit has its own base pitch: EMI-01 at 520 Hz, then +40 Hz per unit |

---

## 11. Performance budget

**Target:** 60 fps on an Apple-silicon MacBook at quality `high`, which means a 16.6 ms frame with about 12 ms GPU and at most 6 ms CPU. This is verified headless with Playwright using `--use-angle=metal` (tech brief).

| Scope | Draw calls | Triangles | Lights | Shadow casters | Other |
|---|---|---|---|---|---|
| **Global, worst view** (Ausguck or spawn) | **≤ 500** (typical ≤ 350) | **≤ 1.5 M** visible | 1 directional (shadowed) + 1 hemisphere + ≤ 4 local active | Shadow pass ≤ 150 draw calls | DPR cap: high 1.5, medium 1.25, low 1.0 |
| Hub exterior (plaza, tower, medallion, masts, pads) | ≤ 60 | ≤ 120k | — | Tower, masts | — |
| Hub foyer (detail ≤ 20 m or inside) | ≤ 50 | ≤ 60k | 1 local | — | — |
| Kielraum / finale (only in keel or lift) | ≤ 60 | ≤ 100k | 1 local | — | Private Rapier world, 6 crates |
| Underside + rim + paths + railings + lamps | ≤ 50 (instanced) | ≤ 200k | — | Rim only | — |
| Environment (sky, clouds, wisps, distant islands) | ≤ 10 | ≤ 20k | — | — | Cloud shader ≤ 1 ms |
| **Per zone: detail** (≤ 45 m) | **≤ 80** | **≤ 90k** | **≤ 2 local, no shadows** | Large static meshes only | ≤ 1 render target ≤ 512²; canvas textures ≤ 8 MB; `update` ≤ 1.5 ms CPU |
| **Per zone: exterior** (≤ 130 m) | **≤ 40** | **≤ 60k** | — | Landmark | `updateFar` ≤ 0.1 ms |
| **Per zone: far** (> 130 m) | **≤ 3** | **≤ 5k** | — | none | — |
| EMI (each) | ≤ 20 near, 1 far | ≤ 15k near, 1.5k far | — | Near only | Counted in the owning zone's budget |
| Physics | Shared world: ≤ 60 dynamic bodies per zone | — | — | — | Private worlds are stepped only while the zone is active |
| Post-processing | — | — | — | — | ≤ 2.5 ms total (bloom at half resolution) |
| Load | — | — | — | — | Total transfer < 8 MB; Rapier loads by dynamic import behind the start screen |

**Measured after Phase 4** (production build, Apple M5 Pro, 1280×720, quality high, `npm run perf`): see `docs/RELEASE.md` §1. Tower exterior 37 meshes / 58.9k triangles; Recamán sculpture + drawing arm + beam 8 draw calls / 33.5k triangles (FUN-PLAN limit 12 / 40k).

**Rules:**
- Merge static geometry per material.
- Use `InstancedMesh` for repeats and troika `BatchedText` for many labels.
- No per-frame allocations in `update`.
- Dispose everything in `dispose()`.
- The engine's `?debug=1` stats overlay must show a zone within its budget when that zone is loaded alone with `?only=<id>`.

---

## 12. v1 scope versus later

### v1 (this build)

- Desktop browsers (Chrome, Safari, Firefox), first person with mouse and keyboard; DE/EN; both modes.
- Hub: arrival, ascent, plaza, foyer, medallion, Libelle, 12 Sprungplatten, map, lift (3 stops), Glasbalkon, underside, cloud sea, gusts.
- Finale F1–F3 and the ending.
- All six zones with the **MUST** parts of stations A/B/C.
- Pass, Prognose-Güte, question cards, album, best values, certificate PNG, procedural audio, localStorage save, reduced-motion mode, URL test params, debug hooks.

### STRETCH (v1 only if time allows)

- Ausguck binoculars; "Die Insel spürt dich" lobe telemetry; valley lights at dusk.
- Greifwerkstatt EMI-Drehteller and Mehlsack; Dunkelfabrik heat shimmer and thermal view.
- Sensordom Sense → Plan → Act rover (occupancy grid + A*).
- Throwing a ball at the giant pendulum.

### Later

| Item | What it would take |
|---|---|
| **WebXR (VR)** | The world is built at 1:1. Bedienmodus maps to hand interaction; pads become comfort teleports |
| **Mobile / touch** | Twin-stick controls, a lower quality tier, DOM panels re-laid out |
| **Workshop / multiplayer mode** | A trainer plus a group sharing the Messzelle results and κ tagging. The κ station is naturally multiplayer |
| **academy.emai.dev XP link** | The 18 stable unit ids (`<zone>.<station>`) map to rooms/units |
| **EMI URDF → GLB** | Build-time conversion with urdf-loader + GLTFExporter, decimated to about 40k tris, with the joint hierarchy kept |
| **EMI Walker** | Only once a real walking controller exists. Honest by design |
| **More zones** | Klinik-Transport / Pflege (autonomy L3–L4), Logistik/AMR, Safety („Tasse vs. Baby", Maschinenverordnung 2027) |
| **Real EmAI measurement datasets** | Anonymised and with consent, replacing ILLUSTRATIV curves |
| **Other** | Gamepad; voice-over |

---

## 13. Open questions for the founder

1. **Du or Sie in Entdecker mode?** The brand docs never use "Du". Proposal: Entdecker uses **du** (technical and accessible); Entscheider always uses **Sie**. All strings are already written in both forms.
2. **Recognisable third-party robots (Unitree G1/H1)?** Their licence is unverified (`public/models/ATTRIBUTION.md`). Using a real vendor's robot in a "demo vs. measurement" scene would also read as criticism of that vendor. Proposal: **no Unitree models in v1**; "Hersteller X" is a procedural, unbranded arm.
3. **Which EMI do players see?** The game shows the **EMI Rover at 1.55 m** with 17+2 joints, labelled "Konzeptgröße" (per `params.py` / PRD). The current README describes a printed-cycloidal design of about 1.04 m. Is the concept-size Rover the right public face?
4. **Ending call to action.** Should the certificate or ending point anywhere: academy.emai.dev, or EmAI services such as Use-Case-Audit and Praxis-Test? Proposal: **one neutral line plus an academy.emai.dev link, with no prices and no contact data**. We also keep stable unit ids so the 18 stations can earn platform XP later.
5. **Primary use context.** Is this mainly a **public web** experience or a **facilitated workshop / trade-fair** tool? That decides whether we add a kiosk/reset mode and a trainer view, and whether the 25-minute Werkleiter-Route is the right length.

## 14. Phase 7 as built (rc5)

A summary of what Phase 7 changed in this design; the binding detail is `docs/PHASE7-PLAN.md` (§1–§4) and DECISIONS D15–D44. Where §1–§13 say otherwise, this section and the plan win.

**The premise.** The Schwebewerk is a flying machine that cannot fly yet. It sits in **Trockendock 3**, the last pit of reclaimed open-cast mining land, „das Revier“, held by six **Haltearme**. A failed **Probestart** at arrival shows three red systems, and the quest „**Startklar**“ brings them to light (D23): **Auftrieb** (the six main rotors M1–M6, one per island zone's ◆ station), **Energie** (the **Startakku**, charged by the Sonnenacker ◆ „Erntetag“) and **Navigation** (the **Flugmodell**, installed by the Traumhangar ◆ „Traumdaten“). In Entscheider mode the **Bodencrew** supplies energy and navigation and the route adds the 2.5-minute **Schaufenster** stop in the Schauhalle (D41; ≈ 29 min against the Entdecker's ≈ 94 min). The Revier opens with the first rotor (D25).

**Frames.** The island never moves; the world moves under it (the ground root, the slab, the clouds, the fog). Ground areas live in the ground frame and are suspended once the island is above 1 m (ARCHITECTURE §17).

**Real robots** (D15, D32). Every non-EMI robot of Phase 7 is the real published 3D model with its licence and attribution (credits page, `licenses/`, `THIRD-PARTY-NOTICES.txt`): the SO-101 arms, the Open Duck Mini v2, LeKiwi, the Unitree R1, G1, H1-2, H2 and Go2 and the Schauhalle's line-up. „Hersteller X“ stays fictional and no real robot appears in its critique. EMI stays a „kognitiver Roboter“; third-party robots may be „humanoider Roboter“. Vendor values carry **HERSTELLERANGABE** with a date, values computed on the model **MODELL**, world-model predictions **TRAUM**. Price bands with source and date (D17); none for EmAI's own services (D5).

**Stations that changed** (D33). Regelgarten C → „**Lauf, Ente!**“ (64 Open Ducks learn to walk from the player's reward; real MuJoCo physics, D30). Lern-Dojo A/B on the SO-101 leader and follower arms with language commands; C keeps „Erst die Daten prüfen, dann trainieren.“ Greifwerkstatt C „200 Griffe“ is retired and replaced by „**Lastdiagramm**“ ◆ (the real SO-101's payload over reach; the gear task's „hintere Kiste (0,35 m)“ is the distance from the pedestal, D44). Prüffeld C is shorter (6 clips, 2×, a κ needle). Dunkelfabrik B and Prüffeld C are side stations in Entdecker mode (D40). The Dunkelfabrik C dials mark the real L3–4 values with a teal arc (D44).

**New areas.**
- **Schauhalle Nord** (island hall): the real robots on plinths with a „Datenblatt“ each, the Größenwand, the Kistenwaage, the Lastenheft station, the recorded „Kurzläufe“, the Pannen-Wand and the **Fundvitrine**; robots arrive as the rotors start, with stars (Apollo at 36 ★, D39) and with the H2 (D21). Frosted side walls; lobes 02 and 03 show at their mid tier from inside (D44).
- **Sonnenacker** (ground site): agrivoltaics over cherry tomatoes. A: teach the arm ripeness under the panels; B: share the light (LER, the DIN check); C ◆ „Erntetag“: an 80 s automated day with calls for help (D44), then „Wo du gebraucht wurdest“. EMI-08 works here.
- **Traumhangar** (ground site in the Werft, D36): world models with the Unitree R1, G1 and H1-2, the steep top-down „planning table“ dream view (D44), the ◆ „Traumdaten“ (the best closed-loop mix, never the offline winner), and the H2 as an optional mastery trophy (D21).
- **Use-case scenes**: the Kreislaufhof (sort, then repair) and the Unkrautacker (three ways to weed); the Grubenrand chronicle pit → lake → field (D43). Ambient life, the Hof-Takt and easter eggs that never gate (D35).

**The ending** (D24). The finale is the **Startprüfung**: F1 **Schwebetest** (the island hovers 10 m over the keel block, held by hand), F2 the audit of „NN-Lage v2“, F3 the recommendation that flies the lift-off. A ≈ 100 s lift-off flown with E, two outside shots, the dusk and the certificate, whose back side lists what the player saw below (D43). „Im Dock weiterspielen“ and „Zurück ins Dock“ return to the ground (D25).

**The EMI count.** Nine units: EMI-01 … EMI-07 as before, EMI-08 (Sonnenacker) and EMI-09 (the Revier); no EMI body in the Schauhalle and the Traumhangar (EMI-01 speaks on the radio there).

**Progress.** The tower mark still draws only the 18 stamps of the six island zones; the other areas fill a second Pass section „Revier & Hangar“ and start the trim rotors T1–T4 (D37). Saves move to format v2; an rc4 save migrates and stays as a backup (D38).

---

## Appendix A: Recamán mark geometry (medallion, Pass)

The source of truth is `public/brand/mark-inverted.svg` (copy of the EmAI brand kit's logo), checked against the path data. All values are in SVG units with disc radius **400**, centred at (0, 0) with **+y up**. Scale to the medallion with `s = R / 400` (R = 12 m → s = 0.03).

- **Disc:** r = 400, `#141414`.
- **Outer ring:** full circle, r = **375** (= 0.9375 R).
- **Spiral:** 17 semicircles whose endpoints all lie on x = 0.
  - Endpoint heights: `y_n = −375 + 30·a_n` for Recamán **a = 0, 1, 3, 6, 2, 7, 13, 20, 12, 21, 11, 22, 10, 23, 9, 24, 8, 25** (n = 0…17). It starts at the bottom (−375) and ends at the top (+375).
  - Arc k = 1…17: radius `r_k = 15·k`, centre `(0, −375 + 15·(a_{k−1} + a_k))`.
  - **Odd k bulges to +x (right); even k bulges to −x.**
  - Centres y, k = 1…17: −360, −315, −240, −255, −240, −75, +120, +105, +120, +105, +120, +105, +120, +105, +120, +105, +120.
  - Direction: up, up, up, down, up, up, up, down, then alternating up/down through k = 17.
- **Stroke:**
  - The canonical stroke is 8 (1 % of the disc diameter); lockups use 14–16.
  - **Medallion:** tube radius 0.18 m (stroke 12 units, inside the brand's 8–16 range).
  - **Pass UI:** stroke 8–12 by size.
- **3D build:**
  - Each arc is a `TubeGeometry` along a half-circle path in the disc plane, from angle −90° to +90° (+x side) or +90° to 270° (−x side).
  - The ring is a `TorusGeometry` (radius 375·s, tube 0.18 m), all merged into one mesh with the `logoSpiral` material.
  - The spiral sits 0.02 m in front of the disc face.
  - On the medallion, SVG +x maps to world +x when seen from the south (the front).

### As built (Phase 5): the planar relief (current)

The anamorphic fan below is **retired** (DECISIONS D10). The tower builds the mark as a planar relief (`src/world/tower/sculpture.ts`, depth stack in `tower/constants.ts`, mount in `tower/mount.ts`):

- **Scale:** R = 10.5 m, s = R / 400 = 0.02625, centre (0, 24); SVG +x = world +x seen from the south.
- **One plane:** ring (r 375·s) and the 17 arcs (r_k = 15k·s, centres and sides exactly as above) are tubes whose centre lines lie in z = 8.95. Stroke 16 units = 0.42 m (tube radius 0.21 m). The mark is therefore the brand mark from every viewpoint, only in perspective; there is no fan angle α_k, no anamorphic map and no "exact only from the Messpunkt".
- **Depth stack:** tube centres 0.45 m in front of the dial face (z 8.5); dial body 0.85 m (back plate z 7.65); lattice clearance 0.22 m at the disc bottom. Carbon pins carry the tubes at the 18 nodes, 12 ring points and each arc crown from k = 3.
- **Colours:** dial face and front chamfer #141414, lit sleeve brand-exact orange, ghost tubes warm alu; the edge band carries the 26 teal 0–25 scale ticks.
- **Check:** `__academy.solve('world', 'logo-check')` compares the tubes with `LOGO_SVG_PATH` and a(0..17): 17 arcs, 2 ring halves, 0 side mismatches, 0.000 mm, planar.

### As built (Phase 4, retired in Phase 5): the anamorphic sculpture

The tower built the mark as a 3D sculpture that was exact from one eye point (`src/world/tower/sculpture.ts`, spec and per-arc table in `docs/ART-V2.md` §3.3; the build matches that table).

- **Scale and planes:** R = 10.5 m, s = R / 400 = 0.02625. Spine plane z_s = 12.4 (ring and nodes), disc face z = 11.7, centre y 24. **Messpunkt** E = (0, 1.65, 94.5), the spawn eye.
- **Number line:** 18 standoff nodes from the disc face to the spine plane at y = 24 + (−375 + 30·a_n)·s.
- **Planar curve** of arc k (φ ∈ [0, π]): x = side_k · r_k · sin φ, y = 24 + y_c,k − dir_k · r_k · cos φ, z = z_s, with r_k = 15k·s, y_c,k = (−375 + 15(a_{k−1} + a_k))·s, side_k = +1 for odd k, dir_k = sign(a_k − a_{k−1}).
- **Forward fan:** α_k = (0.35 + 0.65·frac(0.6180339887·k)) · min(55°, atan(4.0 m / r_k)); depth d = |x| · tan α_k.
- **Anamorphic map:** every point is pulled along its view ray, t = (E_z − (z_s + d)) / (E_z − z_s), **P = E + t·(L − E)**. Endpoints (x = 0) stay on the nodes, so each arc is a continuous loop. Maximum fan depth 3.74 m in front of the spine plane (4.44 m in front of the disc face).
- **Stroke** 16 units (the bold lockup weight; tube 0.21 m, scaled by t). Ghost arcs warm brushed alu; lit sleeve ×1.06, brand-exact orange. Disc face, chamfer and standoffs brand-exact #141414; lens 2.4 m deep.
- **Exactness:** 0 px at the Messpunkt; drift 0.39 m (≈ 2.9 px at 1280×720) at z 75, 0.71 m at z 65. From the plaza the arcs open visibly into the fan.

## Appendix B: Formulas

- **Wilson 95 % interval** (z = 1.96). With p̂ = k/n:
  - `centre = (p̂ + z²/2n) / (1 + z²/n)`
  - `half = z·√(p̂(1−p̂)/n + z²/4n²) / (1 + z²/n)`
  - Checks: 16/20 → 58.4–91.9 %; 80/100 → 71.1–86.7 %; 184/200 (92 %) → 87.4–95.0 %; 146/200 → 66.5–78.7 %.
- **Cohen's κ** for two raters: `κ = (p_o − p_e)/(1 − p_e)`, where `p_e = Σ_c p_A(c)·p_B(c)`. For three raters, report the mean of the three pairwise κ values.
- **Cart-pole** (half-length l = L/2, uniform rod; the Barto form):
  - `θ̈ = [g sin θ − cos θ·(F + m l θ̇² sin θ − b ẋ)/(M+m)] / [l·(4/3 − m cos²θ/(M+m))]`
  - `ẍ = [F + m l (θ̇² sin θ − θ̈ cos θ) − b ẋ]/(M+m)`
  - Tipping time constant: `τ = 1/√(3g/2L)`.
- **Grip hold:** `2·μ·F_N ≥ m·(g + a)`. Friction-cone half-angle: `atan μ`.
- **Ballistic pad hop** (T = 2.5 s):
  - horizontal speed `v_h = d/T`
  - `v_y = (Δy + ½gT²)/T`
  - apex `h = v_y²/2g` (for Δy = 0, `h = gT²/8 = 7.66 m`)
  - `v₀ = √(v_h² + v_y²)`
- **Stereo depth noise** (Sensordom toy model): `σ(z) = σ₁·(z/1 m)²` with σ₁ = 2 mm. Physical basis: `σ_z ≈ z²·σ_d/(f·B)`.

## Appendix C: The nine vendor questions (DE / EN)

These are generic, public-safe, and taken verbatim from EmAI's published checklist.
1. Wie ist Erfolg als Regel definiert? / How is success defined, as a rule?
2. Wie viele Versuche? / How many trials?
3. Lässt sich der beste Lauf wiederholen? / Can the best run be repeated?
4. Was wurde vorher erwartet? / What was expected beforehand?
5. Wie viele Objektlagen? / How many object poses?
6. Welche Lizenz haben die Gewichte? / What is the licence of the weights?
7. Wann endet ein Lauf? / When does a run end?
8. Gleiche Eingaben im Betrieb wie im Training? / Same inputs in operation as in training?
9. Was ist das Ergebnis in einer zweiten Umgebung? / What is the result in a second environment?

## Appendix D: Facts register

Every external number in the game is listed here with its chip and source. The former **PIN** items were resolved in the polish pass (2026-10); the full register with where each claim appears and how it was checked is `docs/RELEASE.md`. **No customer names, customer data or project names may appear anywhere in the game.** No robot-vendor names in player-facing text (D6); historical facts are anonymised.

| Statement | Chip | Source / note | Status | Used in |
|---|---|---|---|---|
| Fehlende Fachkräfte DE 2028 (Prognose): 768.000 | QUELLE | IW Köln, IW-Report 34/2025 (14 Jul 2025) | verified (replaces 728.000/2027) | 05 |
| Altenquotient EU 2025: 34,5 Menschen ab 65 je 100 im Alter 15–64 | QUELLE | Eurostat, old-age dependency ratio, 1 Jan 2025 | verified | 05 |
| Roboterdichte DE: 449 Industrieroboter je 10.000 Beschäftigte in der Industrie | QUELLE | IFR World Robotics 2025 (data 2024), manufacturing | verified | 05 |
| Lights-out seit 2001 bei einem japanischen Roboterhersteller, bis zu 30 Tage ohne Aufsicht | QUELLE | Business 2.0 / CNN Money, „Fade to Black“, 1 Jun 2003; anonymised per D6 | verified, anonymised | 05 |
| Ei-Aufgabe 50 % → 85 % (nur Kamera vs. Kamera + Taktil), je 20 Versuche | STUDIE | Huang et al., 3D-ViTac, CoRL 2024 (arXiv 2410.24091), Table 1, whole egg task | verified | 03 |
| Eischale bricht bei ≈ 30–40 N | RICHTWERT | Quasi-static compression studies; 30 N used as labelled toy value | toy value, labelled | 03 |
| Rund 13.000 Jahre simulierte Erfahrung (Zauberwürfel, Roboterhand) | STUDIE | Akkaya et al. 2019, arXiv 1910.07113 (anonymised per D6; the hand turns the cube, a solver plans the moves) | verified | 02 |
| Menschliche Reaktionszeit ≈ 0,2 s | STUDIE | Woods et al. 2015, Front. Hum. Neurosci. 9:131 (mean simple RT ≈ 213 ms) | verified | 02 |
| Cohen's κ ≥ 0,8 gilt als starke Übereinstimmung | STUDIE | McHugh 2012, Biochemia Medica 22(3):276–282 | verified | 06 |
| ≈ 92 % des Laserlichts gehen durch klares Glas; Glas antwortet nur nahe senkrechtem Einfall | STUDIE | Foster et al., ICRA 2013 | verified | 01 |
| Spiegel erzeugen Geisterpunkte bei d₁ + d₂ | STUDIE | arXiv 2406.10494 | verified | 01 |
| Stereo-Tiefenfehler wächst mit z² | QUELLE | RealSense depth-tuning guide; arXiv 1705.05548 | verified | 01 |
| Datenblattgenauigkeit gilt unter Testbedingungen (oft helle, flache Wand, ≈ 2 m) | QUELLE | Depth-camera datasheets (test conditions sections) | verified, vendor-neutral wording | 01 |
| Segmentierung ist ein KI-Modell, kein Sensor; Glas und Spiegel sind schwer zu segmentieren | STUDIE | Yang et al. ICCV 2019; Xie et al. ECCV 2020 | verified | 01 |
| DROID: 76.000 Demos, 50 Personen, 12 Monate | STUDIE | Khazatsky et al. 2024, arXiv 2403.12945 | verified | 04 |
| Action Chunking reduziert Folgefehler | STUDIE | Zhao et al. 2023, arXiv 2304.13705 | verified | 04 |
| Null-Aktion am Demo-Anfang ließ Policies einfrieren | STUDIE | Kim et al. 2024, arXiv 2406.09246 | verified | 04 |
| VLA (Vision-Language-Action) | STUDIE | Brohan et al. 2023, arXiv 2307.15818 | term | 04 |
| EU-Maschinenverordnung 2023/1230 ab 20.01.2027 | QUELLE | EU regulation | not used in v1 | — |
| Gehirn-Stapel ≤ 1 kHz / 30–200 Hz / wenige Hz; RL/VLA/WAM rule of thumb | RICHTWERT | EmAI assessment 2026 | labelled | 02, finale |
| Autonomy L0–L5, supervision shares, liability, realistic levels | RICHTWERT | EmAI-Autonomieskala (workshop handout w01), based on SAE J3016 | labelled | 05 |
| „Realistisch 2026: Pilot, nicht Serie" | RICHTWERT | EmAI assessment 2026 | labelled | 05 |
| Cobot 50–120 k€, Greifer+Sensorik 5–15 k€, Rechner 0,6–1,5 k€, VZÄ 85 k€/Jahr | RICHTWERT | EmAI workshop handout w02 | labelled | 05 |
| Wilson intervals (5/5 → 57–100 %, 16/20 → 58–92 %, 80/100 → 71–87 %, 146/200 → 66–79 %) | — (mathematics) | Appendix B; checked numerically | verified | 03, 04, 06, finale |
| Drehmoment-Drift, „92 % bei n = 200, falsifiziert, falls < 80 % bei 45 °C“ | ILLUSTRATIV | Brand example figures | labelled | 06 |
| 14 % Totblock in 250 Demos | ILLUSTRATIV | Anonymised pattern, no customer data | labelled | 04 |
| All toy-model parameters (depth noise, μ table, success models, intervention rates) | ILLUSTRATIV / RICHTWERT | This document; the zone code | labelled | all |
| Schwebewerk, Insel 17, Station 7, Hersteller X, NN-Lage v2 | FIKTION | — | labelled | all |
| ~~Roboterhände oft < 1 Jahr verschlissen~~ | — | No primary source found | **removed from the game** | — |

**Language guardrails for all strings:**
- Say „kognitiver Roboter", never „humanoider Roboter".
- Never write a bare „autonom"; always „autonomer Anteil von X % bei Aufgabe Y".
- Banned words: revolutionär, disruptiv, bahnbrechend, Game-Changer, Synergien, ganzheitlich/holistisch, KI-getrieben/-gestützt, KI-Lösung, nahtlos, smart, innovativ, Mehrwert, zukunftssicher, transformativ.
- Never „Roboter ersetzen Menschen".
- Always spell it „EmAI".
