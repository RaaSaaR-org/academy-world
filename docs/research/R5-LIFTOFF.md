# R5 · Lift-off: the island as the goal

Phase 7 research, topic R5. Baseline: release candidate 4 (tag `rc4`, founder-approved). Date: 2026-10-17. This report changes no code. It designs a grounded start, the link between quest progress and the island's systems, and a lift-off finale of about 100 s. It also checks whether all of this fits the engine and its frame budgets. Repo facts cite the file. External facts cite the sources table (§10, all accessed 2026-10-17). Scratch maths: `artifacts/phase7/liftoff/timeline.py` (git-ignored, run with `python3 -I`).

Fit with the sibling report **R6** (`docs/research/R6-QUEST-REVIEW.md` §6): R6 sets the quest spine, „Startklar“ (six thrusters, a failed test start in minute one, F3 decides how the lift-off flies). R5 stages it: where the island stands, what you see, how the lift-off plays, and how it is built. Where the two reports differ, §9 says so.

---

## 0. In one screen

**Recommendation: concept A, „Trockendock 3“.** The island sits in a gear-shaped dry dock on a coastal plateau. Its deck lies flush with the ground, the keel rests on a keel block 66 m down, and six hydraulic dock arms hold the lobe tips. A low cloud bank covers the land and ends about 900 m out to sea, so the low sun (295°, 16°, unchanged) still lights the deck from under its edge. The cloud bank is the visible lid: the place the island wants to reach.

- **Start.** No ascent. The title shows the docked island. After Start, a 6 s glide (first visit only) brings you to the bridge head. You walk across a 13 m bridge over the dock slot, so the first thing you learn is the drop. Then comes the failed test start (R6), and you learn the goal: six systems, six zones.
- **Progress.** Each zone's ◆ station brings its lobe's main rotor online: M1 Sensordom … M6 Prüffeld, the order already used in `underside.ts`. You hear it, you see downwash spray rise from the dock, and a lamp lights on the tower. Lift-off needs six ready rotors and a signed F3.
- **Lift-off (≈ 100 s, then the existing 20 s dusk).** From the Ausguck you see the rotors spin up one by one around you. You hold [E] for 105 % thrust (a = 0.05 g). The dock arms swing back, and the island climbs out of the dock, with one short outside shot. Then the island climbs into the shadow of the cloud bank, through a 6 s whiteout and a gust that your F3 controller handles. You break out into the sun again (a second sunrise) and watch the deck rise out of the white below you. The fleet of sister platforms appears, the 18-note Recamán melody plays, the island levels off with the cloud sea 180 m below, and the certificate comes at dusk.
- **Engineering key.** *The island never moves; the world does.* rc4 already uses this rule for gusts (GDD §5.9: the environment rotates, island geometry and physics never move). The ground becomes one group that moves down by the altitude h. The cloud layer becomes one "slab": seen from below it is drawn by the sky shader, inside it by the fog patch, and from above by the existing cloud sea. No zone, no collider and no merged mesh moves, and none of the six zones needs code changes.
- **Effort.** About 27–36 builder-days in four lanes, roughly 9–11 calendar days (§8.3). The main risks are the new sky for the whole game (a look change), the 4K GPU margin at the plaza (4.43 ms against a 4.5 ms gate), and motion comfort (§8.4).

---

## 1. What rc4 gives us (reuse map)

| Need | rc4 system (file) | Reuse |
|---|---|---|
| Scripted camera over the real scene | `ctx.player.cinematic()`; the ascent spline (`src/world/intro.ts`) | Outside shots C1 and C2; the 6 s glide to the bridge |
| Ride to the Ausguck with a planned look | `rideLift()`, `LOOKS.sunset` (`src/world/finale/ride.ts`) | KIEL → AUSGUCK pre-flight ride (12 s) |
| Ending: gate beacons with Recamán notes, banner, dusk 20 s, certificate | `playEnding()` (`finale/ending.ts`), `dusk.ts`, `certificate.ts` | Runs after the lift-off, unchanged |
| Environment blending (colours, sun, fog, cloud sea `cloudY`) | `Environment.set()` (`src/core/Environment.ts`), `dusk.ts` pattern | Ground → sky blend; `cloudY` animates to −180 |
| Island tilt by rotating the world | `Environment.setTilt()`, sky `tiltGroup` (`sky.ts`) | Ground group joins the tilt; the gust during the lift-off |
| Six main + four trim rotors, instanced; downwash air shader | `buildPods()` (`underside.ts`): shared `rot`, `AIR_FRAG`, `uStrength` | Per-rotor spin and strength (small change) |
| Rotor ↔ zone ↔ lesson mapping | `LESSONS` M1–M6 (`finale/strings.ts`) | Pre-flight checklist and the rotor-online lines |
| The player's own value per zone | `zoneValue()` (`finale/pass.ts`: ◆ value first) | Checklist reads back your measurements |
| The controller toy model | `finale/sim.ts` (F2: Bestand vs NN-Lage v2) | The gust in the cloud is simulated with your F3 controller |
| Wisps, sister platforms, cargo copters, rescue drones | `sky.ts` | Cloud streaming; the fleet reveal; drone R-3 as the outside camera |
| Tilt-and-catch toy with a readout | `toyGust()` + Libelle (`onboarding.ts`, `libelle.ts`) | R6's failed test start (rise 0.3 m, tilt, catch) |
| Positional rotor drones, tones | `ctx.audio.loop('drone')`, `tone()` (`src/systems/Audio.ts`) | Spin-up chase around the player; Recamán chord |
| State restored on reload | `buildEvening()` (`finale/evening.ts`), `tools/ending-check.mjs` | „Airborne“ restored like the evening |
| Reduced motion follows the OS | `Settings.ts` reads `prefers-reduced-motion` | Lift-off as cross-faded stills |

What goes away: the 25 s ascent (`intro.ts` flight), its progress flag `ascentSeen` and the title button „Anflug ansehen“. The two ascent captions („Diese Insel fällt ständig.“ / „Tausendmal pro Sekunde fängt sie sich wieder.“) move to the lift-off, where they become true.

---

## 2. Three concepts, scored

Scores are 1–5. For effort and risk, 5 means least effort or lowest risk. Maximum 25.

| | **A · Trockendock 3** (recommended) | **B · Startgerüst im Fjord** | **C · Nebeltal** |
|---|---|---|---|
| Where | Gear-shaped graving dock in a coastal plateau; deck flush with the ground; keel on a keel block, six dock arms at the lobe tips. A dry dock is "a narrow basin … closed by gates or a caisson"; pumped dry, "the vessel rests on supports set on the floor" (Wikipedia: Dry dock) | Island held 64 m up in a cradle of six gantry towers in a fjord, like a rocket on its pad, with swing arms and water below | Island on its keel block in a valley under thick morning fog; the fog top is the goal |
| First view | A campus on the ground; a narrow dark slot behind the railing; cloud bank overhead, sun under its edge over the sea | Obviously high up and obviously a vehicle | White, 60–150 m of visibility |
| Hides the flying machine | Strong: only the slot, the glass floors and the bridge show the depth | Weak | Strong |
| Lift-off | Rises out of the dock, into the cloud shadow, through the bank, a second sunrise | Swing arms fly back, the fjord is sprayed, then the climb (strongest rocket feel) | Rises out of the fog into the sun (classic inversion reveal) |
| Effect on the 60–90 min of play | Sun, shadows and ambient unchanged, so the zone looks stay valid; only sky, horizon and fog change | Same sun; a large fjord to model | No direct sun in fog: every zone look (QA-01 luminance etc.) must be re-tuned |
| Epicness | 4 | **5** | 4 |
| Clarity (goal and progress readable) | **5** (a ship in its dock will leave) | 4 | 2 (beacons and lamps lost in fog) |
| Learning tie-in | **5** (the dock arms are the first control loop; T = W; your values as the checklist) | 4 | 4 (sensors in fog fits the Sensordom) |
| Effort | 3 | 2 | **4** (fog hides missing terrain) |
| Risk | **4** | 3 | 2 |
| **Total** | **21** | 18 | 16 |

Rejected without a full score: an enclosed **hangar with an opening roof** (60–90 min indoors without the golden-hour sun that every zone was tuned for, a 240 m roof span, high risk; about 13/25) and an island **on landing legs** like a jack-up rig (those stand on legs up to 214 m tall, Wikipedia: Jackup rig). On legs the deck would sit 64 m above the ground and nothing would be hidden.

A borrows B's best beat: the six dock arms swing back like launch-tower arms, and the dock floor is wet, so the downwash throws spray.

---

## 3. The grounded start (concept A)

### 3.1 Site (island frame: deck y = 0, as today)

| Element | Spec | Note |
|---|---|---|
| Dock wall | Follows the island outline (`outlineRadius(b)`, lobes to r 102, Kanzeln to r 92) **+ 4 m**; concrete with ribs, painted depth ticks 0–66 m, warm work-light strips | The ticks make F1's 10 m hover and the lift-off readable from the Kielraum and the rim |
| Dock floor | y −66 (= `ISLAND.killY` today), wet: a thin water layer with drainage channels | Rescue drone on a fall, unchanged |
| Keel block | Pedestal under the keel tip (−60 → −66) | Carries the weight (the dry-dock "supports set on the floor") |
| Dock arms (Haltearme) | 6, from the wall to the lobe tips at the zone bearings; hydraulic, they swing back into the wall at launch | They "catch" gusts on the ground: the Regelkern's loop drives them until the rotors take over |
| Access bridge | 13 m, on the Allee axis from the apron (z ≈ 114) to the Landedeck (z 101); it retracts at launch | The dock slot is widened to ≈ 13 m only at the bridge |
| Bridge-head sign | „SCHWEBEWERK · INSEL 17 · TROCKENDOCK 3“ / „STATUS: AM BODEN · ROTOREN n/6“ (live) | The first goal display |
| Apron | Plateau ring to r ≈ 400 m at y 0: runway-tone concrete, two shipyard gantry cranes, low hangars, ground rovers | Stays outside the deck; the player cannot leave the island (gate at the bridge head behind the spawn) |
| Coast and sea | Cliff edge ≈ 600 m WNW down to the sea at y −20; sea plane to the far plane (3,000 m) with a sun glitter path toward 295° | The sun sets over the sea |
| Hills | Low-poly ESE silhouettes under the cloud bank | Under the cloud shadow |
| Cloud bank (slab) | Base +330 m, top +390 m (fiction); covers the land and ends ≈ 900 m WNW. The edge sits 20.1° above the horizon from the deck centre, so the sun at 16° shines under it; the sun ray from the needle tip (+58) reaches the base 949 m out (`timeline.py`) | Real clouds of the low level lie between the surface and 2 km (WMO Cloud Atlas). The look follows stratocumulus: "grey or whitish … sheet or layer of cloud that almost always has dark parts" |
| Cloud shadow on the land | The ground is shaded beyond ≈ 251 m ESE of the centre (computed from the slab and the sun; analytic in the ground shader) | The island stands in the last sunlight before the shade |

Cross-section (not to scale):

```
 y (m)   apron            slot  lobe tip                deck (y 0)                 lobe tip  slot      apron
   0  ───────────────────┐    ┌─════════════════════════════════════════════════════─┐    ┌──────────────
                         │◄arm│  hull to r 66 at −9  ╲   (tower, zones: unchanged)  ╱  │arm►│
 −12                     │    │  [M duct, cold]        ╲                          ╱  [M duct]  │
 −36                     │    │                Kielraum ╲ catwalk ── Regelkern  ╱            │
 −60                     │    │                           ╲        keel tip    ╱              │
 −66  wet dock floor ────┴────┴───────────────────────────── [keel block] ────────────────────┘
```

### 3.2 Hiding the machine, promising the flight

| Seen where, when | What | Reads as |
|---|---|---|
| Title, first frame | A docked campus under a cloud bank, sea glitter in the west; six rotor lamps dark | "Something here is waiting" |
| Bridge (0–5 s) | The 66 m drop under your feet, cold rotor ducts M5/M6 under the lobes left and right | The ground is not ground: it is a dock |
| Libelle (≈ 25 s) | R6's failed test start: the island lifts 0.3 m, tilts and sinks back; the dock arms catch it | It wants to fly |
| Glasbalkon, Kanzeln (glass floors) | The dock floor, the keel block, the trim rotors still and dark | A machine with rotors |
| Tower | Six lamps (R6: on the collar) plus the crown beacons at +48 on the zone bearings: dark → amber → lit | Six systems, visible over the zone roofs |
| Every ready rotor | Idle spin, positional drone sound, a soft downwash spray rising 20–25 m out of the slot at that lobe | The island comes alive zone by zone |
| Kielraum, F1 | The Schwebetest: 10 m off the block, then back down (§5.6) | It can fly; it is not cleared yet |
| Overhead, always | The cloud bank, lit warm from below near the WNW edge | Where we are going |

### 3.3 Title screen (three states)

| State | Camera (`ATTRACT_CAMERA`, today r 190, height 26, target (0, −8, 0)) | Copy and buttons |
|---|---|---|
| First visit | The same orbit, now 18 m over the apron: the docked island, the slot, the cranes, the cloud bank, the sea | Subtitle (new, §6). CTA „Start“ |
| Progress, grounded | The same; ready rotors breathe spray, the lamps show n/6 | „Weiterspielen · n von 18 Stempeln · m/6 Rotoren“ |
| After the lift-off | Today's rc4 orbit above the cloud sea (day or dusk as saved) | „Weiterspielen“ plus „Abheben ansehen“ / “Watch the lift-off” |

The title states the goal openly („bring sie in die Luft“). The look of the flight stays a surprise. A known goal is the point: the founder wants the lift-off to be what you play towards.

### 3.4 The first minute (replaces the 25 s ascent)

| t | Beat | Notes |
|---|---|---|
| 0–6 s | Start: the camera glides from the title orbit down to the bridge head (establishing shot of the dock). First visit only, skippable; a fade under reduced motion | R6 allowed ≤ 15 s. The spline and skip logic of `intro.ts` are reused |
| 6 s | Control at the bridge head (≈ (0, 0, 114), looking north, pitch +6°). The §4.7 composition holds from 19.5 m further back: mark centred, Prüffeld left, Dunkelfabrik right | The movement card shows at once (no ascent to wait for) |
| 7–11 s | Walk the bridge; EMI-01 on the radio: „Spürst du das? Die Haltearme fangen jede Böe ab. Komm zur Libelle.“ (the dock gust stays, ≤ 0.5°) | The 66 m drop is the first lesson in scale |
| ≈ 23 s | **First mechanic (R6): Probestart.** Hold [E] on the lever by the Libelle: the cold rotors spool, h = 0.3 m, the toy's 2.2–2.9° tilt-and-catch, the arms catch it with a thud, then the six lamps turn red in order | Reuses `toyGust()` with a ground offset. Readout: „LAGE max° · SYSTEME 0/6“ (FIKTION) |
| ≈ 28 s | EMI-01: „Sechs Systeme rot. Sechs Zonen. Bring sie auf Grün.“ – „Dann heben wir ab.“ (R6 lines) and the Pass handover | |
| ≈ 40 s | Orange pad → first zone | The target stays ≤ 65 s to the first zone. Estimate ≈ 23 s to the first mechanic and ≈ 40 s to the first zone (rc4 with the ascent skipped: 19.2 s / 35.2 s, ARCHITECTURE §6; +3.4 s for the bridge). To be measured with `tools/onboarding-run.mjs` |

### 3.5 What D13 (resume) becomes

| Case | rc4 (D13) | New |
|---|---|---|
| First visit | Title → 25 s ascent → Landedeck | Title → 6 s glide → bridge head |
| Returning, grounded | Ascent skipped after one complete viewing; resume at the last zone's gate, „Weiter im …“ | The same resume rule; no ascent exists, so `ascentSeen` is retired (ignored if present) |
| Returning, airborne | – | The world restores „airborne“ (like the evening today); resume at the last gate; the title offers „Abheben ansehen“ |
| „Anflug ansehen“ | Replays the ascent | Removed. „Abheben ansehen“ replays the lift-off on the Ausguck (stills version under reduced motion) and ends airborne with the saved sky |
| rc4 save with `finale.ended` | – | Airborne, `seen: false`, so the title offers the new sequence once |
| URL | `?skipIntro=1` | Unchanged: no title, spawn at the Messpunkt (tools depend on it). New: `?flight=ground\|airborne`, `?liftoff=1` (all conditions met, standing at the launch console) |

---

## 4. How quest progress powers the island

### 4.1 Rotor states (derived from stamps, never stored)

| State | When | You see / hear |
|---|---|---|
| **kalt** (cold) | No stamp in the zone | Duct ring dark, rotor still; lamp off |
| **in Arbeit** (in progress) | First stamp in the zone | Lamp amber (R6); a maintenance drone (`landscape/drones.ts`) checks the duct |
| **bereit** (ready) | The zone's **◆ station** stamped (both modes; R6 Q2 option (c)) | **Rotor ignition beat**, about 6 s, wherever you stand: whump plus a rising positional drone under that lobe, spray from the slot, duct ring teal, lamp lit, crown beacon teal, one Recamán note, a toast and a radio line (§6) |
| **geprüft** (checked) | All three stamps | The checklist line gets its ★; the full duct-ring light |

**Lift-off rule:** six rotors „bereit“ **and** F3 signed, in either order. KIEL still opens with stamps in 4 zones (unchanged). If F3 comes first, EMI-01 says what is missing („Startfreigabe unterschrieben. Es fehlen noch M1 und M3.“) and the objective points to those zones. The 6th rotor then triggers „Sechs von sechs. Komm zum Ausguck – wir starten.“

### 4.2 Mapping per mode

| Rotor (`underside.ts` order) | Zone (◆ station today) | Entdecker (6 zones, 60–90 min) | Entscheider (≈ 25 min) |
|---|---|---|---|
| M1 · 270° | 01 Sensordom (C Messstrecke) | ◆ → bereit | Route has it under R6 (c) |
| M2 · 330° | 02 Regelgarten (B Regler & Takt) | ◆ | ◆ (route today) |
| M3 · 30° | 03 Greifwerkstatt (C 200 Griffe; R6 Q4 may retire it, the rule follows whichever station is ◆) | ◆ | Route has it under R6 (c) |
| M4 · 90° | 04 Lern-Dojo (B Nachmachen; R6 puts the SO-101 VLA here) | ◆ | ◆ |
| M5 · 150° | 05 Dunkelfabrik (C Licht aus) | ◆ | ◆ |
| M6 · 210° | 06 Prüffeld (B Unter Last) | ◆ | ◆ |
| T1–T4 · trim, under the Kanzeln (D7) | **Optional slots for new Phase 7 content** (§4.4) | Each adds a spin-up and a checklist line; not required | Same |

If the six-◆ Entscheider route runs over 25 min, the fallback is R6's option (b): two rotors are cleared by the ground crew. Their checklist lines then read „Bodencrew · ohne Kennlinie“, and EMI-01 asks once: „M1 und M3 hat die Bodencrew freigegeben. Ohne Kennlinie. Glaubst du ihr – oder misst du?“ The certificate records which rotors you measured yourself. On brand ("Messung statt Marketing"), but second choice: it is one more rule to explain.

The route objective for Entscheider today moves on after *any* stamp (`onboarding.ts nextZone`, `need = 1`). It must wait for the ◆ stamp (small change).

### 4.3 Visible from everywhere

| Channel | Range | Cost |
|---|---|---|
| Positional rotor drones (one loop per ready rotor; 6 exist today, +4 trims) | Whole deck, swelling near the lobe | 0 draw calls; ≤ 10 loops |
| Crown beacons (+48) and the collar lamps (+25) | Visible over the zone roofs (cap 24 m) from the whole deck | Existing meshes, state change only |
| Slot spray plume per ready rotor (soft, steady, no blinking) | Above the railing from the plaza ring | Part of the particle mesh (§7, item 7) |
| Bridge sign, map totem, foyer „Selbstmessung“ wall (now the rotor board), map, Pass „Startklar n/6“ | Local or UI | Canvas redraw on change |
| Libelle readout: „BODEN“ until M2 is ready, then live LAGE (R6) | Plaza | Existing |

### 4.4 New Phase 7 content: slots, not hard wiring

Every system registers itself in one list. The checklist, the lamps, the certificate and the lift-off read that list, so the next phase can move content without touching the lift-off:

```ts
registerFlightSystem({ id: 'T1', label: Text, required: false, ready: () => boolean, value: () => Text | null, onSpinUp?: () => void })
```

| Content (other Phase 7 reports) | Suggested slot | Lift-off effect |
|---|---|---|
| SO-101 VLA station | M4 if it replaces Lern-Dojo B (R6), else trim T1 | Checklist line with your value |
| Open Duck RL station | Trim T2 | The duck walks the Ausguck ring during the climb (cosmetic) |
| Unitree world-model zone (R1 → G1 → H1 → H2, R6 §6.5) | Trim T3; unlocked humanoids stand on the Ausguck or plaza as guests | The H2, if earned, is the guest of honour beside you |
| Showroom | No slot (learning, not a gate) | – |
| 12 Sensorkapseln (R6 §6.4) | Not a gate | 12/12: the full ring of position lights for the night flight after the dusk |

**Constraint for every Phase 7 design.** Content on the ground (apron, hangars) cannot be reached once the island is airborne. Put it on the island, or build the STRETCH „Landen / Starten“ switch on the Ausguck (§5.8).

---

## 5. The lift-off sequence

### 5.1 Where you are and what the camera does

- **Place:** the Ausguck (+44). It has the 360° view, the glass balustrade (safe), the certificate stand and the sky switch, and the rc4 ending already ends there. You may look around and walk the ring. The lift car stays shut, and the Turmsprung pad is not on the Ausguck.
- **Camera:** first person, with at most two short outside shots through `cinematic()`. Each is ≤ 10 s, carries a DOM chip „R-3 · AUSSENKAMERA · LIVE“ and its own telemetry, and is skipped under reduced motion or with the setting „Außenkameras“ off. The outside shot is the only way to see the whole machine rise. The ascent and the rides already use cinematic cameras. No camera roll and no cut inside the whiteout.
- **Interaction:** press [E] at the launch console, then hold [E] for thrust above 100 %. If you don't press within 6 s, EMI-01 gives the thrust („Dann gebe ich Schub.“). After that, you watch and look around.

### 5.2 Beat sheet (t = 0 at the console; numbers from `timeline.py`)

| t (s) | Beat | What you see (Ausguck) | Sound and music | HUD and EMI-01 (≤ 18 words) | Tech |
|---|---|---|---|---|---|
| −12 … 0 | **Pre-flight ride** KIEL → AUSGUCK (rc4 ride, 12 s) | The core sinks away; the view swings to the sun (`LOOKS.sunset`) | Lift hum | Checklist card: six lines M1–M6 with *your* ◆ value (`zoneValue()`), plus „Regelkern: {your F3 controller}“, „Startplatz frei“ | `rideLift()` unchanged |
| 0 | **Console** „[E] Abheben“ | EMI-01 beside you, sun ahead (295°) | Click, short silence | „Sechs von sechs. Startfreigabe von dir.“ (R6) | New prop (1 merged mesh) |
| 0–15 | **Spin-up** M1 → M6, every 2.5 s, clockwise round you (270 → 330 → 30 → 90 → 150 → 210); then trims T1–T4 if ready | At each lobe, spray bursts out of the slot and climbs over the rim; its crown beacon goes teal | Whump plus a rising drone *at that rotor*, so the sound circles you; Recamán notes a(0…5) = 0, 1, 3, 6, 2, 7 build a chord (the rc4 ending already uses these notes) | Checklist lines tick; telemetry „SCHUB 0 → 100 %“ (FIKTION) | Per-pod spin rate, particle bursts, ≤ 10 loops |
| 15–18 | **T = W** | The deck sits still; the dock arms carry nothing | Chord holds | „Schub gleich Gewicht. Jetzt hält sie nur noch die Regelung.“; card: a = (T − W)/m | Newton's 2nd law (NASA Glenn) |
| 18–22 | **Release** | The six arms swing back into the wall (6 thunks); the bridge retracts; „[E] halten: Schub über 100 %“ | Hydraulic thunks; rumble starts | „SCHUB 105 % · a = 0,05 g = 0,49 m/s²“ | Ground group animation; ground colliders removed at h > 1 m |
| 22 | **Lift-off** (h = 0) | The apron edge starts to sink below the rim; the horizon stays at eye level | Rumble rises, wind bed up | „HÖHE · STEIGEN · SCHUB“ (FIKTION) | `ground.setAltitude(h)` |
| 24–32 | **C1 · outside shot from drone R-3** beside the dock | The six-lobed island rises out of its dock (hull clear at 28 s; h 1 → 25 m), spray rings on the wet floor, six downwash columns | Same mix, more distant | „R-3 · HÖHE 25 m · STEIGEN 4,9 m/s“ | Camera holds its ground position: y = −h + offset |
| 32–42 | **Climb into the shade** | The sun slides behind the cloud edge at h ≈ 26 m (t 32.4 s): a first sunset, the deck goes into shadow; the shipyard and coast spread out (h 98 m at 42 s, v 9.8 m/s) | Light cools; rumble steady | „Wir steigen in den Wolkenschatten.“ | Sun intensity from the slab geometry; soft edge ±2° |
| 42–61 | **The lid** | The cloud base comes down to the tower; the needle (+58) and the crown fade into grey first | Low-pass slowly closes | „Schau nach oben.“ | Slab fog per fragment |
| 61–67 | **In the cloud** (eye inside the slab) | Grey-warm mist (luminance ramp ≥ 2 s, never white); wisps stream down past the balustrade; the sun a soft bright patch to the WNW. **The gust:** your F3 controller flies it (R6 §6.6): Kein Pilot → Bestand, steady; Pilot mit Auflage → „RÜCKFALL AUF BESTAND“; Pilot → NN-Lage v2 shudders but holds | Muffled (low-pass ≈ 600 Hz), rotor echo | „Die Kamera sieht nichts mehr. Die IMU schon.“; telemetry shows only LAGE and the controller (SIM · LIVE: `sim.ts` run on one seeded „böig“ gust; visual tilt ≤ 1.5°, none under reduced motion) | Env-map swap hidden here; the IMU measures specific force and angular rate (Wikipedia: IMU) |
| 67–72 | **Break-out** (eye above the top) | Warm sun again over ≥ 2.5 s, a second sunrise; then **the deck rises out of the white below you**: lobes and zone roofs emerge, wisps tear off | Filter opens; the 18-note Recamán melody (≈ 3 notes/s) over a pad | „Gefangen. Die Insel ist ein Roboter – und du stehst drauf.“ (R6: the hook is earned here) | Cloud-sea raymarch visible once its plane is ≥ 30 m below the eye |
| 72–80 | **C2 · outside shot from the south** (optional) | The whole island climbs out of the cloud sea, keel last (77.9 s); the fleet of sister platforms and cargo copters around; the tower mark's laser sweep (`finale:ended`) plays in this shot | Melody ends on the chord | Caption „Diese Insel fällt ständig.“ | Camera ≤ 160 m south, so the mark's visibility rule passes |
| 80–100 | **Level-off** | Back on the Ausguck; the climb slows (T/W 0.95 → 1.0); the cloud sea sinks to `cloudY` −180 (h 570 m at 100 s); the sister platforms hold station | Rotors settle to hover pitch | Caption „Tausendmal pro Sekunde fängt sie sich wieder.“; banner „SCHWEBEWERK · INSEL 17“ / „Messung statt Marketing.“ (the intro's banner); EMI-01: „Willkommen über den Wolken. Das war dein Regelkreis.“ | `cloudY` animates; `airborne` saved |
| 100–120 | **Dusk** (rc4, 20 s) | Sun 16° → 3°; position lights on (12/12 = full ring, R6) | rc4 ending | rc4 lines | `finale:dusk` unchanged |
| then | **Certificate** on the Ausguck, then free roam above the clouds | | | New line: „Erstflug: {Datum} · {n}/6 Rotoren selbst gemessen“ | `openCertificate()` |

The ground spreads out instead of tilting away. From 570 m the geometric horizon is 85 km away, 92 km with refraction (Wikipedia: Horizon). That is far beyond the 3,000 m far plane, so the cloud sea's existing fade into the sky colour carries the distance (as in rc4).

### 5.3 Why these numbers

- T/W = 1.05 gives a = 0.05 g = 0.49 m/s²: honest physics on a fictional machine. After 20 s the island climbs at 9.8 m/s. A real heavy-lift drone climbs at up to 6 m/s (DJI Matrice 350 RTK: max ascent 6 m/s), so the island's 9.8 m/s carries the FIKTION chip like every island number.
- The slab is 60 m thick. That keeps the whiteout at 6 s with continuous telemetry and no hidden time skip. Real low clouds are usually thicker, but this cloud is fiction.
- Seen from the Ausguck, you lose the sun at 32 s and regain it at 67 s. This follows from the sun's elevation, the cloud edge and your eye height. It is computed, not staged.

### 5.4 Skip

Hold Space (or the left mouse button) for 1 s; a ring fills, and a tap does nothing, so the climax is not lost by accident. Esc pauses. A skip fades to black (0.4 s), sets the final state (h 570, airborne, all rotors at hover, the sweep marked as done), fades in on the Ausguck and continues with the banner, the dusk and the certificate.

### 5.5 Reduced motion and comfort

Vection (the feeling of moving yourself) seems to be needed for visually induced motion sickness, but only together with other factors, such as how large the sensory conflict is (Keshavarz et al. 2015). WCAG treats non-essential motion as a vestibular trigger and asks for a way to turn it off (SC 2.3.3, AAA). MDN names "scaling or panning large objects" as triggers.

| Setting | Lift-off |
|---|---|
| Default | No camera roll, no shake above 0.1, smooth acceleration (no jerk), horizon always visible, the cuts last ≤ 10 s each |
| „Außenkameras“ off | First person only |
| Reduced motion (OS or game setting) | **Stills with cross-fades**, ≈ 45 s: (1) spin-up on the Ausguck, same sound and checklist, spray slowed; (2) fade to a held view 60 m over the dock; (3) fade to the cloud with the IMU line; (4) fade to above the clouds with the banner and the captions. Then the dusk (a colour blend). No outside shots, no world tilt, no streaming wisps. Same for „Abheben ansehen“ |

### 5.6 Photosensitivity

WCAG 2.3.1 (Level A): nothing may flash more than three times in any one second, unless it stays below the general and red flash thresholds. A general flash is a pair of opposing changes of ≥ 10 % of maximum relative luminance where the darker state is below 0.80, and the area rule is 25 % of any 10° field (≈ 341 × 256 px at 1024 × 768).

- Whiteout and break-out are single ramps of ≥ 2 s each (not a flash pair), and the mist luminance stays below 0.8.
- No strobing beacons. Crown beacons and lamps switch on steadily.
- Rotor blades are behind blur discs at speed. In C1 and C2 no blade crosses the sun disc (camera placement).
- Spray particles are mid-tone and never flicker.
- **New gate:** `tools/liftoff-check.mjs` counts opposing ≥ 10 % luminance changes per 341 × 256 window and second over the recorded sequence. It fails above 3.

### 5.7 Connection to the finale

| Question | Recommendation | Why |
|---|---|---|
| Is the audit before or after the lift-off? | **Before**: the audit *is* the flight clearance. Rename it „Startprüfung“ / “Flight check” (§9 Q5) | You may not fly a controller before you have measured it; the house line in one plot |
| F1 „Hand am Steuer“ | Becomes the **Schwebetest**: the dock arms release, the island hovers 10 m above its keel block, you hold it level for 15 s (rc4 model, tilt and ★ unchanged), „Regler übernimmt“, then it sets back down with a thud | The first hover is the trailer for the lift-off. As the first act *after* lift-off it would put a failing task at the climax |
| F2 | Unchanged; its numbers drive the gust in the cloud | R6 §6.6 |
| F3 | Unchanged; your choice flies | R6 §6.6 |
| „Ein Jahr später“ | Stays after F3, retitled „Das erste Jahr“, or becomes R6's optional „Erstflug-Protokoll“ after the certificate | The rc4 code and maths stay |
| Order | Zones → (4 zones) KIEL → F1 Schwebetest → F2 → F3 → [missing rotors] → ride to the Ausguck → lift-off → dusk → certificate → free roam | |

From the Kielraum, the Schwebetest is readable through the smoked shell: the depth ticks on the dock wall slide down by 10 m.

### 5.8 Free roam and replay

- **Airborne world.** This is the rc4 look and feel above the clouds: gusts, Libelle, pads, Turmsprung, the TAG ↔ ABEND sky switch. The Glasbalkon plaque turns from „TROCKENDOCK 3 · TIEFE 66 m“ to the rc4 text „ABSTAND ZUR WOLKENDECKE 180 m“, which is now true. The rc4 Kielraum look (cloud sea through the lattice) returns.
- **Replay.** „Abheben ansehen“ on the title. In play, a dial on the Ausguck console, „Start wiederholen“, uses the same code: it fades to the ground state, plays the sequence and ends airborne.
- **STRETCH „Landen / Starten“.** About a 40 s reverse sequence. It is only needed if Phase 7 puts content on the ground. It doubles the state combinations to test.

---

## 6. Player text (DE default, EN; „du“ in both modes)

| Key | DE | EN |
|---|---|---|
| Title subtitle | Eine Insel, die fliegen soll – noch steht sie im Dock. Probier aus, wie Roboter sehen, regeln, greifen und lernen, miss, was Physical AI heute kann, und bring sie in die Luft. | An island built to fly, still standing in its dock. Try how robots see, control, grasp and learn, measure what Physical AI can do today, and get it into the air. |
| Title CTA (grounded, progress) | Weiterspielen · {n} von 18 Stempeln · {m}/6 Rotoren | Continue · {n} of 18 stamps · {m}/6 rotors |
| Title, after the lift-off | Abheben ansehen | Watch the lift-off |
| Bridge sign | SCHWEBEWERK · INSEL 17 · TROCKENDOCK 3 / STATUS: AM BODEN · ROTOREN {m}/6 | THE FLOATING WORKS · ISLAND 17 · DRY DOCK 3 / STATUS: GROUNDED · ROTORS {m}/6 |
| Dock gust (radio) | Spürst du das? Die Haltearme fangen jede Böe ab. Komm zur Libelle. | Feel that? The dock arms catch every gust. Come to the spirit level. |
| Libelle help (H) | Am Boden hält der Regelkern die Insel über die Haltearme. In der Luft über die Rotoren. | On the ground the control core holds the island through the dock arms. In the air, through the rotors. |
| Pass handover | Achtzehn Stempel zeichnen das Logo. Jede Zone startet einen Rotor. | Eighteen stamps draw the logo. Every zone starts one rotor. |
| Rotor toast | M{k} bereit · {Zone} | M{k} ready · {zone} |
| M1 ready | M1 läuft. Die Insel weiß jetzt, wie schief sie steht – so genau wie ihr Sensor. | M1 is running. The island now knows how much it tilts, as precisely as its sensor. |
| M2 ready | M2 läuft. Messen, vergleichen, korrigieren: der Regelkreis aus deinem Garten. | M2 is running. Measure, compare, correct: the loop from your garden. |
| M3 ready | M3 läuft. Ein Ziel, sechs Drehzahlen – wie die inverse Kinematik am Arm. | M3 is running. One goal, six rotor speeds, like inverse kinematics on the arm. |
| M4 ready | M4 läuft. Gelernt wird nur, was in den Daten steckt. Merk dir das für später. | M4 is running. A policy only learns what is in its data. Remember that for later. |
| M5 ready | M5 läuft. Tausend Korrekturen pro Sekunde, rund um die Uhr: Arbeit für Maschinen. | M5 is running. A thousand corrections a second, around the clock: work for machines. |
| M6 ready | M6 läuft. Freigegeben mit n, Regel und Intervall – nicht mit einem Etikett. | M6 is running. Cleared with n, rule and interval, not with a label. |
| Six ready, F3 open | Sechs von sechs. Fehlt nur noch die Startprüfung im Kiel. | Six of six. Only the flight check in the keel is left. |
| Six ready, F3 signed | Sechs von sechs. Komm zum Ausguck – wir starten. | Six of six. Come to the lookout: we're taking off. |
| F3 signed, rotors missing | Startfreigabe unterschrieben. Es fehlen noch {M…}. | Clearance signed. Still missing: {M…}. |
| Console | [E] Abheben · [E] halten: Schub über 100 % | [E] Lift off · hold [E]: thrust above 100 % |
| Checklist header | // STARTFREIGABE · INSEL 17 | // FLIGHT CLEARANCE · ISLAND 17 |
| Checklist line (example) | M1 · Lagesensor · dein Messwert: {zoneValue} | M1 · attitude sensor · your measurement: {zoneValue} |
| T = W | Schub gleich Gewicht. Jetzt hält sie nur noch die Regelung. | Thrust equals weight. Now only the controller holds it. |
| Shade | Wir steigen in den Wolkenschatten. | We're climbing into the cloud's shadow. |
| Look up | Schau nach oben. | Look up. |
| In the cloud | Die Kamera sieht nichts mehr. Die IMU schon. | The cameras see nothing now. The IMU still does. |
| Fallback (Pilot mit Auflage) | RÜCKFALL AUF BESTAND | FALLBACK TO BASELINE |
| Pilot held | Gehalten – bei Böen. Bei Sturm hielt er in deiner Messung {x} %. | Held, in gusts. In your storm measurement it held {x} %. |
| Level-off | Willkommen über den Wolken. Das war dein Regelkreis. | Welcome above the clouds. That was your control loop. |
| Skip | Leertaste halten: überspringen | Hold Space: skip |
| Outside shot chip | R-3 · AUSSENKAMERA · LIVE | R-3 · EXTERIOR CAMERA · LIVE |
| Kielraum arrival (replaces „Hier unten hält sich die Insel in der Luft.“) | Hier unten sitzt der Regelkern. Er hält die Insel – bald in der Luft. | The control core sits down here. It holds the island, soon in the air. |
| Glasbalkon plaque, grounded | TROCKENDOCK 3 · TIEFE 66 m | DRY DOCK 3 · DEPTH 66 m |
| Certificate line | Erstflug: {Datum} · {n}/6 Rotoren selbst gemessen | First flight: {date} · {n}/6 rotors measured by you |

All island numbers (h, climb rate, thrust, 66 m) carry the FIKTION chip. The gust tilts are SIM · LIVE from `sim.ts`. The formula card cites Newton's 2nd law. No vendor names. EMI lines are ≤ 18 words. The next phase must run `tools/text-audit.mjs` and `tools/glyph-check.mjs`.

---

## 7. How it is built (architecture)

1. **Ground module `src/world/ground/` (island module).** One `THREE.Group` holds the dock, keel block, arms, bridge, apron, cranes, coast, sea and hills. `setAltitude(h)` sets `group.position.y = −h`, joins the gust tilt (the same quaternion as the sky `tiltGroup`) and hides the group above h ≈ 1,500 m. Ground colliders (bridge, apron) are removed at h > 1 m through `StaticHandle.remove()` (`src/core/zones/types.ts`), so a player falling off the rim in the air never lands on an apron hanging in the sky. The island's shadow on the ground (the gear outline projected along the sun) and the cloud bank's shadow are analytic in the ground material; the 90 × 90 m shadow map covers only the player's surroundings.
2. **Cloud slab in `Environment` (core).** New params: `slab: { base, top, edgeBearingDeg, edgeDist, density, light, shade }`, all island-relative and moved with −h.
   - *Below:* the sky shader intersects upward rays with the slab base and shades a noise ceiling (2–3 octaves of the existing noise texture), lit warm toward the sun near the edge. Rays that miss the slab (beyond the edge) show the normal sky and sun disc, so the edge hides the sun correctly. 0 extra draw calls.
   - *Inside:* the fog chunk the engine already patches gets a slab term: fog grows with the length of the view ray inside [base, top]. The needle fading into the cloud, the misty deck and the deck rising out of the white all come from this one term.
   - *Above:* the existing cloud-sea raymarch at `cloudY = top − h`. It is shown only when its plane is ≥ 30 m below the eye; until then the slab fog and the wisps cover it.
   - *Sun:* a CPU helper `sunBlockedBySlab(eye)` drives `sunIntensity` and the hemisphere with a soft edge.
3. **Env-map hold.** PMREM regeneration renders and prefilters the sky (three.js docs). rc4 throttles it to every 0.66 s during dusk; the code comment puts each rebuild at a 10–30 ms GPU spike. New `env.holdEnvMap(true)` freezes it during the lift-off. Exactly one rebuild (ground → sky) runs inside the whiteout. Dusk keeps its throttle.
4. **Flight state** (island progress `flight`: `{ state: 'ground' | 'airborne', seen: boolean }`). Rotor states are derived from stamps, so they never go stale. Events: `flight:rotor {id, state}`, `flight:ready`, `flight:phase {name, t}`, `flight:airborne`. Restored on boot like the evening.
5. **Lift-off director (`src/world/finale/liftoff.ts`, in the lazy finale chunk).** A pure timeline function `(t) → { h, v, thrust, sunFactor, slabEye, cut, captions }` drives ground, environment, rotors, audio and HUD, so a skip or a replay is just `t = end` or `t = 0`. Debug hooks: `solve('world', 'liftoff' | 'liftoff-skip' | 'ground' | 'airborne' | 'rotors-ready')`.
6. **Rotors.** `buildPods()` today shares one `rot` and one `thrust` for all ten rotors. It gets per-rotor `rate[i]` and an air-shader strength per instance (an instanced attribute instead of the shared `uStrength`). Spin-up eases the rate from 0 to idle (ignition) and then to full (lift-off). Blur discs show from 60 % of the rate.
7. **Particles.** One instanced, camera-facing soft-sprite mesh, based on the wisp shader in `sky.ts`. It carries slot spray, spin-up bursts, dock-floor spray rings and the wisps streaming through the cloud. One draw call, ≤ 192 instances (96 on low).
8. **Audio.** The ten drone loops get per-rotor pitch and volume ramps. A shared low-pass on the ambience bus muffles the cloud (BiquadFilterNode lowpass: frequencies above the cutoff are attenuated; MDN). The Recamán chord and melody use `tone()` with f = 220 Hz · 2^(a/12) (GDD §8.1). All of it sits on the D14 „Atmosphäre & Musik“ bus.
9. **Outside shots.** `cinematic()` with the camera expressed in the ground frame (C1) or the cloud-top frame (C2). The shadow focus moves to the island centre with 2× extent during a shot.

---

## 8. Feasibility in numbers

### 8.1 Budgets (rc4 measured → Phase 7 target)

| Metric | rc4 (RELEASE.md §1a, ARCHITECTURE §6) | Target with concept A |
|---|---|---|
| Main-pass draws at the spawn, world | 86 (target ≤ 110) | Ground module ≤ 20 draws, so the world stays ≤ 110 |
| Worst draws / triangles over all survey views, high | 238 / 0.90 M (GDD gate 500 / 1.5 M) | ≤ 270 / ≤ 1.05 M (ground ≤ 150 k triangles) |
| GPU frame at 3840×2160, plaza / cloud view | 4.43 / 6.85 ms (gates 4.5 / 7.0) | **Tight.** On the ground the cloud-sea raymarch is off (≈ 0.13 ms at 1080p from a Kanzel at dusk). Slab ceiling + sea + terrain must cost no more than it saved; measure with `gpu-ab.mjs` before the art lock |
| Shader programs at the title | 132 (target 130) | Ground and slab variants at the title; particles and director shaders compile in idle time with the finale chunk |
| Title, cable 1× | 1.00 s (target ≤ 1.3 s) | The ground builds with `ctx.yield()` between sections; cranes and props after the title |
| First load | 1.68 MB brotli, 31 requests, 0 third-party | Estimate + ≤ 30 KB JS, 0 new requests (all procedural) |
| Lift-off sequence | – | 60 fps on high (M5 Pro); ≤ 500 draws in every beat (C1 estimated ≈ 300: rc4's wide underside view was 241 renderer calls, + ground + particles); 0 programs linked during the sequence; ≤ 1 env-map rebuild; no frame > 33 ms outside the two cut frames |
| Particles | – | 1 draw, ≤ 0.5 ms GPU at 1080p high |
| Director CPU | – | ≤ 0.3 ms per frame at 1× |
| Audio | Loudest flows −12.0 / −13.4 dBFS peak | Lift-off ≤ −10 dBFS peak, ≤ 40 voices |

### 8.2 Reused vs new

| Part | Reused | New |
|---|---|---|
| Site | Island, zones, colliders, merged statics, sun and lighting | Ground module (dock, arms, bridge, apron, coast, sea, hills) |
| Sky | `atmos()`, cloud sea, fog patch, tilt | Slab (sky ceiling, slab fog, sun blocking), env-map hold |
| Progress | Stamps, `ctx.zones.stamps`, ◆ flags, `LESSONS`, `zoneValue()`, masts and crown beacons, drones | Rotor state derivation, ignition beat, collar lamps, system registry |
| Finale | F1 model, F2/F3, `sim.ts`, ride, dusk, certificate, evening | Schwebetest offset, lift-off director, console, flight state |
| Camera | `cinematic()`, the intro's spline and skip | C1/C2 frames, hold-to-skip |
| Effects | Wisp shader, air shader, juice popups | Particle mesh, per-rotor rates |
| Audio | Drone loops, `tone()`, buses (D14) | Spin-up ramps, muffle filter, melody |
| Tools | `playtest`, `ending-check`, `onboarding-run`, `perf`, `hitches`, `gpu-ab` | `liftoff-check.mjs` (frames, draws per beat, flash count, audio peak, persistence), new survey views (bridge head, dock slot, C1, cloud, break-out) |

### 8.3 Lanes and effort (builder-days, rough)

| # | Part | Lane | Effort |
|---|---|---|---|
| 1 | Ground module: dock, keel block, arms, bridge, apron, cranes, coast, sea, hills, analytic shadows | WORLD | L · 5–7 |
| 2 | Slab in `Environment` (sky ceiling, slab fog, sun blocking), env-map hold | CORE | M · 3–4 |
| 3 | Rotor states and ignition beat, per-rotor rates, lamps and beacons, plumes, boards, system registry | WORLD | M · 3–4 |
| 4 | Start flow: 6 s glide, bridge-head spawn, Probestart (R6), title states, D13 rewrite, save migration | WORLD + CORE | M · 2–3 |
| 5 | Lift-off director: timeline, telemetry, checklist, thrust hold, C1/C2, skip, stills, persistence, debug hooks | WORLD (finale) | L · 5–7 |
| 6 | Particles and cloud streaming | WORLD | S · 1–2 |
| 7 | Audio: spin-up, muffle, Recamán chord and melody, levels | CORE | M · 2 |
| 8 | F1 Schwebetest offset and set-down | WORLD (finale) | S · 1 |
| 9 | Strings DE/EN, text audit, glyphs | WORLD | S · 1 |
| 10 | Tools and gates (`liftoff-check`, playtest route, ending-check airborne, survey views) | BUILD | M · 2–3 |
| 11 | Perf and look tuning, QA, founder review build | all | M · 2–3 |
| | **Total** | | **≈ 27–36** builder-days; ≈ 9–11 calendar days in 4 lanes |

Build order: 2 + 1 first (the ground look is the founder's review point), then 3 + 4 (a playable grounded game, shippable on its own), then 5–8 (the lift-off), then 9–11.

### 8.4 Risks and mitigations

| Risk | Mitigation |
|---|---|
| The whole game gets a new sky (cloud bank, coast instead of the cloud sea) | Sun (295°, 16°), hemisphere and exposure stay identical, so the six zone looks and the brand check stay valid. Founder review of one still image before building the rest |
| 4K GPU margin at the plaza (4.43 against 4.5 ms) | The slab and sea replace the cloud-sea raymarch on the ground; budget proven with `gpu-ab.mjs` in step 2 |
| Motion sickness from large-field vertical motion | Moderate acceleration, no roll, visible horizon, short cuts, the „Außenkameras“ switch, the reduced-motion stills |
| Photosensitivity in whiteout and break-out | ≥ 2 s ramps, mist luminance < 0.8, the flash counter in `liftoff-check` (WCAG 2.3.1) |
| Cloud-sea raymarch close to the camera (plane crossing the deck) shows artefacts | Shown only ≥ 30 m below the eye; slab fog and wisps cover the crossing |
| PMREM spikes during the long blend | Env-map hold, one swap inside the whiteout |
| Players who stop early never see the payoff | ◆-only gate (6 of 18 stamps); the title shows m/6; EMI points to the missing rotor |
| State combinations (ground/airborne × finale × mode × reduced motion) | Rotor states derived; one `flight.state`; `ending-check` and `liftoff-check` across reloads in DE/EN and both modes |
| Ground content unreachable after the lift-off | Rule in §4.4; Landen/Starten only if needed |
| Tool churn (`?skipIntro`, ascent-based tools) | `?skipIntro` keeps its meaning; `onboarding-run` gets a new timeline |
| Title time and init CPU | Yielding ground build; props after the title; `load-matrix` gate |

---

## 9. Questions for the founder

| # | Question | Options | Recommended | Why |
|---|---|---|---|---|
| Q1 | Where does the island wait? (R6 Q1 asks the same) | A · dry dock on a coast under a cloud bank · B · launch cradle in a fjord · C · fog valley | **A** | Hides best, reads clearly as "about to leave", keeps the sun and every zone look; R6 also recommends the dock below the cloud deck |
| Q2 | What gates the lift-off? | ◆ station in all six zones (both modes; R6 Q2 c) · all 18 stamps · Entscheider ◆ ×4 plus a ground-crew release for 2 rotors | **◆ in all six** | One rule for both modes and a complete, honest lift-off; 18/18 still earns "geprüft" and the finished mark. Ground crew only if the six-◆ route exceeds 25 min |
| Q3 | Outside shots during the lift-off? | Two (C1 dock, C2 cloud sea) · one (C1) · none, first person only | **Two, ≤ 10 s each, switchable** | Only an outside view shows the whole machine rise; first person carries the shade, the cloud and the deck emerging |
| Q4 | Who flies the lift-off? (R6 §6.6) | Your F3 choice, visibly · always the Bestand controller | **Your choice, visibly** (gust simulated with `sim.ts`, never a crash) | A decision with a visible consequence, from your own F2 data |
| Q5 | The finale's name and F1 | „Startprüfung“ with F1 as the Schwebetest in the dock · keep „Jahresprüfung“ · F1 after the lift-off | **„Startprüfung“, F1 as Schwebetest** | A maiden flight has no annual audit; the first hover is the trailer |
| Q6 | Replay | Title „Abheben ansehen“ plus „Start wiederholen“ on the Ausguck · plus Landen/Starten · none | **Replay only** | Same code as the skip; landing only if content lives on the ground |

---

## 10. Sources (all accessed 2026-10-17)

| # | Source | Supports |
|---|---|---|
| S1 | W3C, Understanding SC 2.3.1 Three Flashes or Below Threshold (WCAG 2.2): https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html | Level A; ≤ 3 flashes per second; general flash = opposing ≥ 10 % luminance changes, darker < 0.80; 25 % of a 10° field ≈ 341 × 256 px at 1024 × 768 |
| S2 | W3C, Understanding SC 2.3.3 Animation from Interactions (WCAG 2.2): https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html | Level AAA; motion can be disabled; vestibular reactions (dizziness, nausea, headaches) |
| S3 | MDN, prefers-reduced-motion: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion | OS setting; "scaling or panning large objects" as vestibular triggers |
| S4 | Keshavarz, Riecke, Hettinger, Campos (2015), Vection and visually induced motion sickness: how are they related? Frontiers in Psychology: https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2015.00472/full | Vection may be necessary for VIMS, but only together with other factors such as sensory conflict |
| S5 | three.js docs, PMREMGenerator: https://threejs.org/docs/pages/PMREMGenerator.html | What the env-map rebuild does (prefiltered mipmapped radiance map; `fromScene`) |
| S6 | three.js docs, FogExp2: https://threejs.org/docs/pages/FogExp2.html | Exponential-squared fog used by the engine |
| S7 | MDN, BiquadFilterNode: https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode | Lowpass: frequencies above the cutoff are attenuated (cloud muffle) |
| S8 | NASA Glenn Research Center, Newton's Laws of Motion: https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/newtons-laws-of-motion/ | F = m·a for constant mass, so a = (T − W)/m |
| S9 | Wikipedia, Dry dock: https://en.wikipedia.org/wiki/Dry_dock | Graving dock: a narrow basin closed by gates or a caisson; pumped out, the vessel rests on supports on the floor |
| S10 | Wikipedia, Jackup rig: https://en.wikipedia.org/wiki/Jackup_rig | Rigs that jack their hull up on legs; tallest legs 214 m (the rejected legs variant) |
| S11 | Wikipedia, Horizon: https://en.wikipedia.org/wiki/Horizon | d ≈ 3.57 √h km (geometric), ≈ 3.86 √h with standard refraction |
| S12 | WMO International Cloud Atlas, Cloud definitions (levels): https://cloudatlas.wmo.int/en/clouds-definitions.html | Temperate regions: low level from the surface to 2 km |
| S13 | WMO International Cloud Atlas, Stratocumulus: https://cloudatlas.wmo.int/en/stratocumulus-sc.html | Grey or whitish layer that almost always has dark parts (ceiling look) |
| S14 | DJI Enterprise, Matrice 350 RTK specs: https://enterprise.dji.com/matrice-350-rtk/specs | Real multirotor: max ascent 6 m/s, max take-off weight 9.2 kg |
| S15 | Wikipedia, Inertial measurement unit: https://en.wikipedia.org/wiki/Inertial_measurement_unit | An IMU measures specific force and angular rate; used in aircraft attitude and heading reference systems |
| R1 | Repo: `docs/GDD.md` §1, §4, §5.9, §6, §9, §11; `docs/DECISIONS.md` D7, D9, D13; `docs/ARCHITECTURE.md` §5.6, §6, §9; `docs/RELEASE.md` §1 | rc4 layout, rules and measured budgets |
| R2 | Repo: `src/world/intro.ts`, `onboarding.ts`, `landing.ts`, `underside.ts`, `sky.ts`, `dusk.ts`, `layout.ts`, `src/world/finale/{index,ending,ride,evening,pass,strings}.ts`, `src/core/Environment.ts`, `src/core/Game.ts`, `src/ui/StartScreen.ts`, `src/systems/Audio.ts`, `src/core/Settings.ts` | What exists and is reused |
| R3 | Repo: `docs/research/R6-QUEST-REVIEW.md` §6, §9 | Sibling quest spine („Startklar“, Probestart, F3 flies) |
| R4 | Scratch: `artifacts/phase7/liftoff/timeline.py` | All lift-off timings, the sun and cloud-edge geometry, the horizon distance |

No 3D models are needed for this topic. Everything in the grounded start and the lift-off is EmAI's own procedural geometry, shaders and sound.
