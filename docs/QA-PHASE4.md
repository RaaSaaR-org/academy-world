# QA phase 4: what makes the game look or feel buggy

QA lead pass, 2026-10-15, on the release candidate `a67f603` (exported to a private snapshot, so the parallel builders' edits did not move under the tests). The founder's note: *"it sometimes looks buggy … it does not look futuristic, the trees of the platform make no sense … the logo on the tower looks like an ugly version of the logo plated to the tower … make the game a real fun learn game."*

> **Status after the Phase 4 build (2026-10-15, release integrator):** QA-01 … QA-26 and QA-28 are fixed and verified on the integrated build (fixes and evidence per builder in `docs/RELEASE.md` §4 and GDD §7 "As-built deviations, Phase 4"). QA-27 was half fixed in rc2 (the façade slit is vertical).
>
> **Phase 5 (2026-10, release candidate 3):** QA-27 is fixed. Zone entry shows a location card on the left under the objective instead of a centred title (core, cefd450), and the Dunkelfabrik's door lettering moved off the lintel to the façade right of the door (zones, 0f339de); checked on a walk-in through the gate (`artifacts/phase5/verify/critic-high-de/qa27-dunkelfabrik-*.png`). All 28 findings are fixed.

## Method

- **Real input:** the onboarding twice with Playwright keyboard input (`tools/onboarding-run.mjs`: DE Entdecker watching the ascent, first zone after 85.7 s; EN Entscheider skipping it, 58.2 s). Then two stations with a keyboard-and-mouse-look bot (arrows + W to walk, `lookDelta` for the mouse, E, 1–4): Sensordom A (visor + marking, 4 of 5 items marked; the fifth miss was my bot aiming at the cable group's origin) and Dunkelfabrik A (two full 60 s shifts). I also walked into the Sensordom and the Dunkelfabrik with W held, jumped at 16 rim points, rode the lift, and double-tapped E on terminals.
- **Teleport survey** (`__academy`): spawn in 30° steps, Allee, plaza, Libelle, foyer, Ausguck, Glasbalkon, Kanzel, every zone (gate + 4 bearings + grazing floor views), Kielraum, F1–F3, ending, certificate, the ascent every 2.5 s, a jump-pad flight frame by frame, the lift ride, day and dusk, the `high` and `low` tiers, DE and EN, both modes, 1280×720 and 1920×1080.
- **Measurements:** draw calls and triangles at 23 positions × 12 headings × 2 pitches, frame luminance in dark areas, held-key escape tests at the rim, the audio-level survey (`tools/audio-levels.mjs`, 49 measurements).
- **Verified fine (no finding):** 0 console errors and 0 warnings in about 30 runs; 60 fps in every view on both tiers (worst main-thread CPU 3.7 ms); no way off the island at 16 rim points (walk + jump); no z-fighting on zone floors, pads or plaza edges; audio never clips (loudest master peak −11.0 dBFS, the stamp); EN gate signs fit; the Pass, map and pause menu fit at 1280×720 and 1920×1080.

Evidence lives in `artifacts/phase4/qa/` (git-ignored); the probe scripts are in `artifacts/phase4/qa/probes/` (`run.mjs` + `plans/*.mjs`, run against a private Vite server started by `serve.mjs`). Repro URLs are relative to a dev server (`npm run dev`). Line numbers refer to `a67f603`.

## The coordinator's six observations

| # | Observation | Verdict | Finding |
|---|---|---|---|
| 1 | White ellipsoid and black block when turning at the spawn | Confirmed: the shuttle pod 2.1 m behind the spawn, its door is a flat black plane | QA-03 |
| 2 | Moiré / stripe shadows near the railing | Confirmed on both tiers: dithered (high) or blotchy (low) railing shadows | QA-04 |
| 3 | Compass labels half-transparent / overlapping at the edge | Confirmed: clipped by the edge mask, jammed under the N/O/S/W letters | QA-08 |
| 4 | Dunkelfabrik overview almost black | Confirmed: mean luminance 2–6 of 255 after the lever (also in the release gallery) | QA-01 |
| 5 | Many objects are plain black boxes | Confirmed: dark metal palette under a 16° sun, no edge or panel definition | QA-09 |
| 6 | The 24 m logo disc reads as a flat decal | Confirmed: an unlit disc, wider than the tower, mounts hidden | QA-06 |

## Findings (most severe first)

Severity: **high** = a player notices it within minutes or it breaks immersion or progress; **medium**; **low**.

### QA-01 · high · dunkelfabrik — The lights-out station (★, Station C) renders as a black screen

- **What:** after the lever, the hall and the Leitstand overview fall to a mean luminance of 2–6 of 255. You see the conveyor glow, three lamp cones and the wall-clock hands floating alone in black (their face is invisible). This is the core Entscheider station: "dark factories" is the message, and the player cannot see a single robot working. The release gallery's `dunkelfabrik.png` shows the same thing.
- **Files:** `src/zones/dunkelfabrik/nacht.ts` (lights out/on, 270–300), `hall.ts` (strips), `index.ts` (`onDark` ambient).
- **Repro:** `/?skipIntro=1&zone=dunkelfabrik`, then `{ const z = __academy.game.zones.records.get('dunkelfabrik').ctx; const p = z.toWorld([0,0,0]); __academy.teleport([p.x,p.y,p.z]); }`, `await __academy.solve('dunkelfabrik','lever')`, wait 9 s. Also `solve('dunkelfabrik','op-leitstand')` and `solve('dunkelfabrik','dark')` with `look(0..270, 0)`.
- **Evidence:** `artifacts/phase4/qa/dunkel-lightsout-9s.png`, `…/dunkel-leitstand.png`, `…/dunkel-dark-y0.png`
- **Fix hint:** show what the machines "see" instead of nothing. Keep a cool 5–10 % moonlight or skylight fill, give every robot, belt and rail emissive edge lines and status LEDs, add floor guide lines, or offer a LiDAR / thermal "robot view" toggle in the Leitstand. Hide or light the clock face. Target a mean luminance of at least 25 of 255.

### QA-02 · high · sensordom — The first zone a newcomer enters opens on a black screen

- **What:** the onboarding sends every Entdecker to the Sensordom first. The moment the zone starts (inside the Schleuse tunnel), the frame is black, with a mean luminance of 3 of 255 and a few teal specks. It stays at 6–7 of 255 for the next 2 s of walking, and the dome interior then runs at 10–25.
- **Files:** `src/zones/sensordom/dome.ts` (Schleuse, 318–330), `curtains.ts`.
- **Repro:** `node tools/onboarding-run.mjs --lang de` (screenshot `05-first-zone`), or `/?skipIntro=1`, `__academy.teleport('sensordom')`, hold W for 3 s.
- **Evidence:** `artifacts/phase4/qa/onboarding-first-zone-black.png`, `…/sensordom-walk-sheet.png`
- **Fix hint:** light the Schleuse as a light lock: a glowing teal floor strip along its full length, wall washes, back-lit strip curtains and a visible bright opening into the dome. Keep the tunnel above roughly 20 of 255 mean luminance.

### QA-03 · high · landscape — At the spawn, turning around shows a giant white blob and a black slab

- **What:** the shuttle pod (a capsule Ø 4 × 6 m) sits 2.1 m behind the spawn. Between yaw 90° and 240° it fills the screen. The "door" is a flat 1.5 × 2.3 m black plane, while the hull curves away behind it, so the plane floats up to 0.9 m in front of the hull at its lower edge and reads as a detached black block. The hull is plain white with visible faceting and no detail. This is the first thing many players see when they look around.
- **Files:** `src/world/landing.ts:20–67` (hull 28–50, door plane 51–55, collider 64).
- **Repro:** `/?skipIntro=1&reset=1`, then `__academy.look(150,0)` and `look(180,0)`.
- **Evidence:** `artifacts/phase4/qa/spawn-yaw150-pod.png`, `…/spawn-yaw180-pod.png`
- **Fix hint:** move the spawn 4–5 m north or dock the pod at the deck rim in a cradle. Make the door a recessed hatch that follows the hull, with a lit interior and a ramp. Give the hull panel lines, windows and dock clamps so it reads as a vehicle.

### QA-04 · high · landscape — Railing shadows become dithered moiré (high) or blotches (low) on the deck

- **What:** three r186 `PCFShadowMap` takes 5 Vogel-disk taps per pixel, rotated by per-pixel interleaved-gradient noise (`node_modules/three/src/renderers/shaders/ShaderChunk/shadowmap_pars_fragment.glsl.js:130–173`). With `shadow.radius = 3` (high) or `2.5` (medium), every soft edge becomes a stipple pattern, because nothing resolves the noise over time. The thin rails and posts cast long multi-stripe shadows under the 16° sun, so large areas near railings (Landedeck, Allee, rim) fill with this pattern. On low (1024², radius 1, 35 m extent) the same shadows alias into blobs.
- **Files:** `src/core/RenderSystem.ts:120–122` (presets), `171` (shadow type), `238–260` (`configureSunShadow`); `src/world/railing.ts:134, 140, 262` (`castShadow = true` on rails, posts and the Allee railing).
- **Repro:** `/?skipIntro=1`, `__academy.look(90,0)` at the spawn; look at the floor right of the map board. Add `&quality=low` for the blob version.
- **Evidence:** `artifacts/phase4/qa/shadow-stipple-high.png`, `…/shadow-stipple-high-2.png`, `…/shadow-blobs-low.png`
- **Fix hint:** set `castShadow = false` on railings, fences and other thin bars (GDD §9.4 already says only meshes larger than about 1 m cast). Set the radius to 1, or patch the shadow chunk to a fixed 3×3 PCF without noise rotation. Consider raising the sun to 22–28° so contact shadows get shorter.

### QA-05 · high · core — EMI-01 stands inside the Libelle plinth

- **What:** EMI-01 is spawned at (3, 0, 19). The Libelle plinth is centred at (0, 0, 19) with radius 3.5 m and height 1.1 m, so the 1.55 m robot is sunk into it and only its head and shoulders show. Every player walks to the Libelle in the first minute, and this is where EMI introduces itself. GDD §6.3 gives the same coordinates, so the GDD is wrong too.
- **Files:** `src/world/onboarding.ts:100` (`LIBELLE.center[0] + 3`), `src/world/layout.ts:237` (`plinthRadius: 3.5`).
- **Repro:** `/?skipIntro=1`, `__academy.teleport([7,0,19])`, `__academy.lookAt(3,0.8,19)`.
- **Evidence:** `artifacts/phase4/qa/emi01-in-plinth-side.png`, `…/emi01-in-plinth-front.png`
- **Fix hint:** place EMI at least 4.3 m from the centre (plinth radius + robot radius + margin), for example (3.4, 0, 22.6), facing the player's approach. Update GDD §6.3.

### QA-06 · high · tower — The tower medallion reads as a flat sticker

- **What:** the medallion is an unlit `MeshBasicMaterial` #141414 disc, 24 m across, 0.3 m thick. That is wider than the 12-sided tower (about 18 m), so it overhangs by about 3 m on each side, and its four mounting arms are hidden behind it. With no shading, no rim and no visible mount, it reads off-axis as a plate stuck on the façade (see the Kanzel 240 view). The stroke is 12 rather than the canonical 8 (`logo-manual`), so the small arcs at the tail merge into a blob at distance.
- **Files:** `src/world/hub.ts:245–262`, `src/core/brand/logo3d.ts`, `src/core/brand/materials.ts:157` (`logoDisc`).
- **Repro:** `/?skipIntro=1`, `__academy.teleport([18,0,28])`, `__academy.look(35,25)`; and `teleport([-76.2,0,44])`, `look(300,0)`.
- **Evidence:** `artifacts/phase4/qa/medallion-side.png`, `…/medallion-edge-and-522-calls.png`, `…/spawn-yaw0.png`
- **Fix hint:** build the mark into the architecture: a recessed, lit dark-metal bezel or drum that the façade facets wrap around, a real bevel and depth, visible clamps or a structural ring, and the spiral as a raised tube with a lit paint material (still no bloom or glow, per the brand rules). Or reuse the founder's logo-film experiment (robot arm + laser drawing the arcs, `robot.js`, `beam.js`, `logo.js`) as a crown sculpture that draws the mark on arrival. Use stroke 8.

### QA-07 · high · landscape — Pines, boulders and sand mounds contradict "the island is a robot"

- **What:** 34 low-poly pines (7-sided cones, flat olive), 46 faceted boulders and heath/gravel mounds sit on a machine deck. The mounds carry a blotchy brown-blue noise texture with a hard jagged edge against the clean tiles, which reads as a missing texture. Underneath, an "inverted rock mass" with crags makes the island read as a fantasy floating rock rather than a hexacopter. This is the founder's "trees make no sense". The Regelgarten planters with faceted green blobs repeat the problem inside a zone (owner: regelgarten).
- **Files:** `src/world/terrain.ts:1–240` (mounds; pines and boulders 155–240), `src/world/underside.ts:10, 71–140` (rock mass), `src/zones/regelgarten/*` (planters).
- **Repro:** `/?skipIntro=1`, `__academy.teleport([0,0,30])`, `look(60,0)` and `look(240,0)`; `teleport([-60,0,30])`, `look(100,-25)`.
- **Evidence:** `artifacts/phase4/qa/plaza-trees-sheet.png`, `…/terrain-mound-blotch.png`, `…/regelgarten-planters-sheet.png`, `…/ascent-sheet.png`
- **Fix hint:** replace them with machine-island features: heat-sink fin fields, cooling louvres, antenna and sensor masts, cable trays, service hatches, rotor-maintenance modules. If greenery is wanted, put it in glass hydroponic racks. Build the underside as an engineered hull with ribs, plates and ducts instead of rock.

### QA-08 · medium · core — The compass objective label is clipped, faded and cramped, and vanishes when behind you

- **What:** the strip has `overflow: hidden` and an 18 % edge mask, so the objective label ("Ziel · 76 m") fades out and is cut off near the edges ("Ziel ·" or "76 m" alone). The label sits directly under the N/O/S/W letters (9.5 px grey on bright sky). The orange objective diamond covers the orange centre needle when you face the goal. Beyond ±92° the marker is simply hidden, so a player who has turned away gets no hint which way to turn.
- **Files:** `src/ui/Compass.ts:108–150` (`show` 124, label placement 140–150), `src/ui/hud.css:144–154`.
- **Repro:** `/?skipIntro=1`, `__academy.look(0,0)`, `look(90,0)`, `look(270,0)` at the spawn; also `look(180,0)` (no marker at all).
- **Evidence:** `artifacts/phase4/qa/compass-crops.png`
- **Fix hint:** clamp the objective marker to the strip edge with an arrow when it is outside the visible range. Draw its label on a small dark backplate in a row of its own, never under the masked edge. Keep the centre needle above the marker.

### QA-09 · medium · landscape (+ zone owners) — Plain black boxes everywhere

- **What:** the dark palette (stone-800/900, #1F1F1F, metalness 0.6–0.7) has no panel or edge definition, and under a 16° golden-hour sun every face turned away from WNW reads as a black silhouette. Examples: the Dunkelfabrik hall exterior, the Prüffeld Messzelle container, the Regelgarten "256 Welten" wall, the Sensordom gate arch, the gate-mast signs, the pod door (QA-03), the foyer kiosks and the lift car interior.
- **Files:** `src/core/brand/materials.ts:93–99, 183–189` (`panel`, `darkMetal`, `structure`), `src/core/Environment.ts:537–582, 657–687` (hemisphere and environment intensity); the zones' own exterior meshes.
- **Repro:** `/?skipIntro=1`, `look(315,0)` at the spawn; `teleport('prueffeld')`; `teleport('regelgarten')`.
- **Evidence:** `artifacts/phase4/qa/spawn-yaw0.png`, `…/prueffeld-sheet.png`, `…/dunkelfabrik-sheet.png`, `…/regelgarten-planters-sheet.png`
- **Fix hint:** lift the base albedo of dark metals (stone-700 instead of 800/900) or lower their metalness. Add trim lines (emissive teal or orange at about 5 %), panel seams in a normal map, beveled edges that catch the sky light, and a stronger sky-environment contribution on exteriors. Give each large dark volume one readable detail layer.

### QA-10 · medium · core — World labels show through walls

- **What:** `WorldLabels.update` only projects the label and fades it by distance; there is no occlusion test. Standing behind the Prüffeld container, "Drei Auditoren" and "Auditor C" float on the wall. Behind the Greifwerkstatt panel, "STATION A · Gelenke" floats on a black wall.
- **Files:** `src/ui/WorldLabels.ts:89–115`.
- **Repro:** `/?skipIntro=1`, `__academy.teleport('prueffeld')`, then `{ const z = __academy.game.zones.records.get('prueffeld').ctx; const p = z.toWorld([12,0,6]); const l = z.toWorld([6,1.95,6]); __academy.teleport([p.x,p.y,p.z]); setTimeout(() => __academy.lookAt(l.x,l.y,l.z), 600); }`.
- **Evidence:** `artifacts/phase4/qa/labels-through-wall-prueffeld.png`, `…/labels-through-wall-greif.png`
- **Fix hint:** raycast from the camera to each visible label against static colliders (throttled to about 10 Hz, labels are few) and fade the label out when it is occluded.

### QA-11 · medium · tower — An invisible hole in the Ausguck floor drops you 44 m into the foyer

- **What:** the visual roof floor is a full disc (`CircleGeometry`), but the collider has a 3.2 m square hole at the lift shaft, covered by a "lid" only while the car is up. The car console is usable from outside the car (range 2.4 m). Standing on the deck and pressing "Lift → FOYER 0" sends the empty car down. The deck still looks solid; walking on, you fall 44 m, pass through the tower's N facet (no collider above the door) and land in the foyer.
- **Files:** `src/world/hub.ts:181–201` (visual floor 182, collider hole 186–201), `src/world/lift.ts:47–50` (lid), `162–169` (console, `inCar()` not required).
- **Repro:** `/?skipIntro=1`, `__academy.teleport([0,0,-6.5],{yaw:0})`, hold W for 1.1 s into the car, `__academy.interact('AUSGUCK')`, wait 8 s, hold W for 0.9 s (step out north), `look(180,-20)`, `__academy.interact('FOYER')`, wait 7 s, hold W.
- **Evidence:** `artifacts/phase4/qa/ausguck-invisible-hole.png`, `…/ausguck-fell-into-foyer.png` (position log 44.0 → 0.0 m, z −10.8 → −6.1)
- **Fix hint:** only enable the console when `inCar()`. Cut the hole in the visual floor and add a shaft gate or railing that closes while the car is away, or keep the lid permanently. Add facet colliders up the full tower height.

### QA-12 · medium · tower — The lift car floor z-fights with the Kielraum catwalk

- **What:** at the KIEL stop the car floor top (at car y) is coplanar with the catwalk grating at −36. Looking down on arrival at the finale shows a stair-stepped flickering patch.
- **Files:** `src/world/hub.ts:303–322` (car floor box `translate(0,-0.09,0)`), the Kielraum catwalk at `KEEL.catwalkY`.
- **Repro:** `/?skipIntro=1`, `await __academy.solve('world','finale-goto')`, wait 9 s, `__academy.look(0,-60)`.
- **Evidence:** `artifacts/phase4/qa/kiel-zfight.png`
- **Fix hint:** raise the car floor top by 2–3 cm, or give it `polygonOffset`. Alternatively, leave out the catwalk grating under the car stop.

### QA-13 · medium · landscape — The jump pad bounces you straight back

- **What:** you land exactly on the destination's return pad, which is re-armed 0.25 s after landing, and Space also launches. A reflexive jump (Space) or a second E after landing flies you back to the plaza.
- **Files:** `src/world/transit.ts:117–153` (launch, re-arm in `finish` 125–131), `185` (`['KeyE','Space']`).
- **Repro:** `/?skipIntro=1`, `__academy.teleport([-27,0,0],{yaw:90})`, press E, wait 3.5 s, press Space.
- **Evidence:** `artifacts/phase4/qa/pad-landed-on-return-pad.png` (the return hint is already showing after landing)
- **Fix hint:** land 2–3 m beyond the pad toward the gate, re-arm only after the player has left and re-entered the trigger, and launch with E only.

### QA-14 · medium · dunkelfabrik — Station A hides its goal and the marker never points back to the belt

- **What:** the running objective reads "Trag die Kisten zur Handpalette. 60 Sekunden." without the 3-crate target, and its compass target stays on the pallet for the whole shift, even with empty hands. Following the marker, the player waits at the pallet. The shift ends with "Nur 1 von 3 Kisten in 60 s" and no stamp; this happened twice in the real-input run.
- **Files:** `src/zones/dunkelfabrik/schicht.ts:158` (`setObjective(… objectiveRun, { target: HANDPALETTE })`), `strings.ts:22`.
- **Repro:** `/?skipIntro=1`, enter the zone and press E at the belt end ("Kiste heben · 18 kg"), carry to the pallet, E; watch the objective and compass for the rest of the 60 s.
- **Evidence:** `artifacts/phase4/qa/dunkel-shift-1of3.png`
- **Fix hint:** "Trag 3 Kisten zur Handpalette (1/3) · 60 s", and switch the target between the belt end (hands empty) and the pallet (carrying).

### QA-15 · medium · core — Skipping the ascent whips the camera, and HUD and caption overlap the arrival

- **What:** Space blends the camera over 0.8 s from about 200 m below the island to the spawn, sweeping under the rim. The objective and compass reappear mid-whip, and the ascent caption ("This island is always falling.") plus the skip hint stay on top of the arrival for about 1.2 s.
- **Files:** `src/world/intro.ts:96–133`.
- **Repro:** `/?reset=1&lang=en`, click Start, press Space after 3 s, take screenshots every 150 ms.
- **Evidence:** `artifacts/phase4/qa/skip-whip-sheet.png`, `…/en-skip-arrival.png`
- **Fix hint:** on skip, fade to black (`hud.fade`) and cut to the spawn; clear the caption and hint immediately.

### QA-16 · medium · core — The default FOV stretches everything at the screen edges

- **What:** the default field of view is 72° vertical, which is about 104° horizontal at 16:9, and 110° with the sprint kick. Buildings and the medallion balloon at the edges (the medallion is about twice as wide at the left edge as in the centre), which reads as a fisheye glitch.
- **Files:** `src/core/Settings.ts:34`, `src/core/RenderSystem.ts:173`, `src/systems/Player.ts:400–405`, `src/ui/PauseMenu.ts:113` (slider 60–90).
- **Repro:** `/?skipIntro=1`, `__academy.look(315,0)` at the spawn.
- **Evidence:** `artifacts/phase4/qa/fov-edge-stretch.png` (medallion and monolith at the left and right edges)
- **Fix hint:** default 60° vertical (≈ 91° horizontal), slider 50–80°, sprint kick 3°.

### QA-17 · medium · tower — The foyer floor looks like blue water

- **What:** the polished floor (`#8a817a`, roughness 0.3) mirrors the sky environment as a blurry blue surface with a bright blob. Indoors it reads as water, and GDD §9.2 forbids blue-grey neutrals. The white walls with floating screens read as an empty white box rather than a futuristic interior.
- **Files:** `src/world/hub.ts:330–368` (lining 353, floor 363).
- **Repro:** `/?skipIntro=1`, `__academy.teleport([0,0,6])`, `look(0,0)`, `look(0,-60)`.
- **Evidence:** `artifacts/phase4/qa/foyer-water-floor.png`, `…/foyer-floor-down.png`
- **Fix hint:** roughness 0.55 or more, a lower interior environment intensity, tile seams or an inlay ring, and warm dark-metal wall panelling with light lines instead of flat white.

### QA-18 · medium · core — A view breaks the 500-draw-call budget

- **What:** from the Aussichtskanzel at bearing 240 (−76.2, 0, 44) looking across the island (yaw 300): 522 draw calls at pitch 0 and 505 at −20 (623 k triangles). `tools/perf.mjs` has no Kanzel views, so the release pass did not see it.
- **Files:** `src/core/zones/ZoneManager.ts:49–51, 277–280` (detail ≤ 45 m, exterior ≤ 130 m), `tools/perf.mjs`.
- **Repro:** `/?skipIntro=1`, `__academy.teleport([-76.2,0,44])`, `look(300,0)`, `__academy.renderInfo().calls`.
- **Evidence:** `artifacts/phase4/qa/drawcall-sweep.json`, `…/medallion-edge-and-522-calls.png`
- **Fix hint:** add the four Kanzeln to `perf.mjs`; merge or instance exterior props, or lower `EXTERIOR_DISTANCE` for zones seen across the island.

### QA-19 · medium · core — The Pass closes on the same E that opened it

- **What:** the Pass modal treats E as "close". A quick double tap (or a bouncy key) on the Pass-Terminal opens and closes the Pass in the same moment, so the onboarding's Pass tutorial beat is skipped. The map board does not have this problem.
- **Files:** `src/ui/PassPanel.ts:55–58`.
- **Repro:** `/?skipIntro=1`, `__academy.teleport([4,0,5.2])`, `__academy.lookAt(4,1.1,3)`, press E twice 60 ms apart; `state().modal` is `null`.
- **Evidence:** run log in `artifacts/phase4/qa/probes/double.mjs` (output: "after double E {modal:null}"; the board stays `map`).
- **Fix hint:** ignore E for about 400 ms after the Pass opens, or close on E only after a keyup has been seen.

### QA-20 · low · core — Zone detail pops in at exactly 45 m

- **What:** detail groups switch on at a hard `dist <= 45` with no fade or hysteresis. Walking a spoke, the Prüffeld stage, the Greifwerkstatt props and the Regelgarten sculptures appear between one step and the next.
- **Files:** `src/core/zones/ZoneManager.ts:50, 278`.
- **Repro:** spoke points 46.5 m and 43.5 m from each anchor, looking at the zone (`probes/pop.mjs`).
- **Evidence:** `artifacts/phase4/qa/lod-pop-pairs.png`
- **Fix hint:** 2–3 m of hysteresis plus a short opacity or dither fade, and switch while the zone is outside the view where possible.

### QA-21 · low · core — Esc does not close the pause menu

- **What:** the pause menu consumes Escape without closing (`onKey: code === 'Escape'`), so the only way back is clicking Resume. Keyboard-first players (← → look is advertised) feel stuck.
- **Files:** `src/ui/PauseMenu.ts:55`.
- **Repro:** `/?skipIntro=1`, press Escape twice; the menu stays open.
- **Evidence:** `artifacts/phase4/qa/pause-menu.png`
- **Fix hint:** Esc resumes; the next click re-captures the mouse, as on the canvas.

### QA-22 · low · core — The grab controls do nothing in the shipped zones

- **What:** README and the controls panel advertise grab (F or right mouse), throw and the wheel for hold distance, but only `src/zones/_example` calls `ctx.physics.addDynamic`. All six zones have 0 dynamic bodies, so F never does anything. Physical props would also be the easiest way to make the game more playful.
- **Files:** `src/ui/PauseMenu.ts` (controls), `README.md` controls table, `src/zones/*/` (no `addDynamic`).
- **Repro:** `/?skipIntro=1`, enter every zone, `__academy.game.physics.dynamics.size` returns 0.
- **Evidence:** `artifacts/phase4/qa/probes/dyn.mjs` (output: 0 in all six zones).
- **Fix hint:** either remove the grab rows, or add real throwable props: Dunkelfabrik crates as dynamic bodies, Lern-Dojo blocks, Greifwerkstatt spare eggs.

### QA-23 · low · landscape / core — Awkward text wraps

- **What:** the jump-pad hint leaves "m/s²" (DE) or "9,81 m/s²" (EN) alone on a second line. The Libelle readout wraps "SCHUB / M1–M6" (`maxWidth: 2.5`), and it shows 0,05° while EMI says "gerade 0,04 Grad". In the Pass, the ★ of "200 Griffe: Wie sicher ist der Griff?" wraps onto its own line.
- **Files:** `src/world/transit.ts` (hint label), `src/world/libelle.ts:73, 85`, `src/ui/PassPanel.ts` (stamp tiles).
- **Repro:** `__academy.teleport([-27,0,0])` (pad hint); `teleport([0,0,25])`, `look(0,-25)` (Libelle); `openPass()`.
- **Evidence:** `artifacts/phase4/qa/pad-hint-wrap.png`, `…/libelle-readout-wrap.png`
- **Fix hint:** use non-breaking spaces inside units, widen the Libelle plate text to 3.2 m, keep the readout at 0,04 while EMI says it (or make the line "unter 0,1 Grad"), and keep the ★ with the last word.

### QA-24 · low · core — EN Entscheider: the jump-pad tutorial line plays after the jump

- **What:** in the EN Entscheider run the player pressed E on the pad at 53.6 s, and the line "The orange jump pad takes you to the next objective. Step on it, then…" arrived at 56.8 s, mid-flight. It was queued behind the long route line.
- **Files:** `src/world/onboarding.ts` (line queue around the route and pad beats).
- **Repro:** `node tools/onboarding-run.mjs --lang en --mode entscheider --skip-after 3`.
- **Evidence:** `artifacts/phase4/qa/en-skip-arrival.png` (same run); run log beats 47.8 s route line, 53.6 s pad E, 56.8 s pad line.
- **Fix hint:** drop the pad line once a launch has happened, or play it with `interrupt: true` when the player steps onto the pad.

### QA-25 · low · lern-dojo — The demo cloud floats as a teal squiggle visible from the whole island

- **What:** the Lern-Dojo demo cloud hangs about 20 m up, above the roof title. From the plaza, the spawn and the other zones it reads as a stray floating glitch.
- **Files:** `src/zones/lern-dojo/index.ts:174` (label at y 22.8) and the cloud mesh.
- **Repro:** `/?skipIntro=1`, `teleport([0,0,30])`, `look(240,0)`.
- **Evidence:** `artifacts/phase4/qa/plaza-trees-sheet.png` (upper left of 09/10)
- **Fix hint:** show the cloud only inside the zone (detail tier), or lower it into a framed hologram volume with a visible projector.

### QA-26 · low · core — Ascent captions are white on white clouds

- **What:** "Diese Insel fällt ständig." and "Tausendmal pro Sekunde fängt sie sich wieder." are almost invisible over the sunlit cloud sea at 2.5–10 s.
- **Files:** HUD caption style (`src/ui/hud.css`), `src/world/intro.ts` captions.
- **Repro:** `/?reset=1`, click Start, screenshot at 2.5 s and 7.5 s.
- **Evidence:** `artifacts/phase4/qa/ascent-sheet.png`
- **Fix hint:** a dark gradient backplate or a stronger text shadow under captions.

### QA-27 · low · dunkelfabrik — The orange façade slit reads as a stray UI bar

> **Status (Phase 5): fixed.** Location card under the objective (core) and the door lettering beside the door (zones).

- **What:** at the gate the orange slit high on the hall looks like a HUD progress bar under the compass. Closer in, at a wide FOV, it becomes a diagonal orange line across the DOM zone title, and the 3D "DUNKELFABRIK · STATION 7" sign collides with the DOM banner.
- **Files:** `src/zones/dunkelfabrik/hall.ts` (slit), the zone banner in `src/ui/Hud.ts`.
- **Repro:** `/?skipIntro=1&lang=en`, `teleport('dunkelfabrik')`, walk 4 m in.
- **Evidence:** `artifacts/phase4/qa/dunkelfabrik-sheet.png` (gate view, top left), `…/en-dunkel-slit.png`
- **Fix hint:** lower or shorten the slit, and move the banner to a band without 3D text, or show it while the player is still outside.

### QA-28 · low · core — "Klicken, um die Maus einzufangen" sits centre-screen for keyboard players (known)

- **What:** without pointer lock the hint stays in the middle of the view (over the tower base at the spawn, over the gates) for the whole session. It is listed in RELEASE §3, but it is one of the most visible UI elements in every keyboard-only screenshot.
- **Files:** `src/core/Game.ts:691` (`setCaptureHint`), `src/ui/hud.css`.
- **Repro:** `node tools/onboarding-run.mjs` (all screenshots).
- **Evidence:** `artifacts/phase4/qa/onboarding-first-zone-black.png`
- **Fix hint:** move it to the bottom edge, and hide it after the first arrow-key or W use.

## Game feel (for "make it a real fun learn game")

Not bugs, but they came up while playing with real input:

- **Time to first play:** 86 s from Start to the first zone when watching the ascent, and that first zone opens black (QA-02). The first thing you *do* with your hands is about 90–100 s in.
- **Hidden rules and wrong pointers** (QA-14) make players fail without knowing why. Every timed task should show its target and live progress.
- **Nothing to touch on the way:** the deck between zones has no physical toys (QA-22). Throwable crates, a rolling ball on the Libelle, or wind gusts you can feel would make the walk itself playful.
- **Reading load:** dialogue lines stay on screen until Enter and stack across zones (EMI-01's line was still visible on arrival at a zone after a teleport). A short auto-advance would keep the pace up.

## New factual claims in this report

No player-facing claims are added. Technical statements used as evidence:

| Claim | Source |
|---|---|
| three r186 `PCFShadowMap` uses 5 Vogel-disk taps rotated by interleaved-gradient noise per pixel | `node_modules/three/src/renderers/shaders/ShaderChunk/shadowmap_pars_fragment.glsl.js:130–173` (three 0.186.1) |
| 72° vertical FOV ≈ 104° horizontal at 16:9; 60° ≈ 91° | arithmetic: h = 2·atan(tan(v/2)·16/9) |
