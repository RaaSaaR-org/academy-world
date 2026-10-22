# Art direction v2: the Schwebewerk as a flying machine

| | |
|---|---|
| Status | Spec for the v2 art pass (after release candidate `a67f603`). No code changed by this document. |
| Owner | Art direction. Builders: **tower**, **landscape**, **core**, **zones-a** (sensordom, regelgarten, greifwerkstatt), **zones-b** (lern-dojo, dunkelfabrik, prueffeld). File ownership is in the coordinator brief; every section names its owner. |
| Trigger | Founder feedback (verbatim): *"can u review it - it somethimes lookes buggy. also umprove the design, it does not look futurisitc in the "trees" of the platform also makes no sense. also the logo on the tower could be improved (it currently just looks like a ugly version of the logo plated to the tower. improve this all and make the game a real fun learn game"* |
| Overrides | DECISIONS.md still wins. Where this file contradicts GDD §6.1 (medallion), §9 (art direction) or §9.8 (Recamán uses), this file wins for the art pass. |
| Evidence | Screenshots in `artifacts/phase4/art/` (git-ignored, local): `diag/` (current build, 59 views), `ui/` (HUD), `proto/` (look prototype for the tower, logo sculpture and landscape, with source `main.js` / `run.mjs`), `recaman/` (frames of the founder's logo film). |


## Status after the build (2026-10-15, release integrator)

Built by tower, landscape, core, zones-a and zones-b; verified on the integrated build (`docs/RELEASE.md` §1; before/after shots in `artifacts/phase4/verify/`, git-ignored). The as-built record with all deviations is GDD §7 "As-built deviations, Phase 4".

| Item | Status | Note |
|---|---|---|
| D1 pines, mounds, boulders | Done | functional deck features (solar trees, intakes, fin banks, hydro pods, sensor masts, rovers) |
| D2 pavers | Done | composite deck, runway-tone paths with alu kerbs, turbine-disc plaza |
| D3 tower silhouette, D13 Ausguck rails | Done | white lattice tower, halo Ausguck with a glass balustrade |
| D4 medallion, B4 logo colours, B5 plate from below | Done | anamorphic sculpture in a 2.4 m lens; brand pixel test passes on high, low and dusk |
| D5 Allee railing | Done | replaced by the Allee number line in the floor |
| D6 gate masts and bollards | Done | ceramic blades with ★ x/9; ceramic bollards |
| D7 black boxes, D8 shared architecture | Done | every zone has a `look.ts` with the v2 recipes |
| D9 underside, D10 sky | Done | ceramic hull, alu keel truss, glass Kielraum; multicopters and hexacopter platforms |
| D11 dark interiors | Done | Sensordom light lock and hall, foyer panels, Kielraum glass shell. §4.6 Kielraum interior ambient 0.5 → 0.6 not applied (no `enterInterior` call for the Kielraum) |
| D12 dusk glow | Partly | light tiers switch to T1 at dusk; the glow stays moderate (4–7 cm lines) |
| B1 demo cloud, B2 LiDAR fan, B3 bloom band | Done | |
| B6 pines through kerbs, B7 floating props | Done | pines gone; boards in alu frames on feet |
| §2.6 brand-exact rendering, `tools/brand-check.mjs` | Done | `screenExact()` (32³ LUT for in-world screens) not built |
| §3.2 tower | Done, with deviations | crown masts brushed alu 5.6 m (not carbon 6.5 m: carbon read as street lamps); split doors instead of sliding; slim ceramic lift spine; lip light at r 13.02, y 43.6; foyer floor roughness 0.58 (not 0.3) |
| §3.3 sculpture, §3.4 drawing | Done, with deviations | arm shown at 1.5× (links 3.9 / 3.6 / 1.5 m); the lens follows the view cone from the Messpunkt; the strut lands on the waist ring, not in the core; stroke 16 |
| §3.5 Messpunkt | Done | plate at the spawn; [E] opens a card with a ray diagram (the landscape plate and the tower card are one feature) |
| §4 landscape | Done | 3 m hop pad (§4.8) not built |
| §5 core HUD | Done | compass tower marker, machined corners, telemetry strip, EMI far LOD, Kielraum props hidden outside |
| §6 zones | Done | |
| §9 Q1–Q5 | Open | defaults recorded as DECISIONS D9, awaiting the founder |

## Status after Phase 5 (2026-10, release candidate 3)

The polish round changed these items; the as-built record is GDD §7 "As-built deviations, Phase 5". Where it differs from the sections below, it wins.

| Item | Status | Note |
|---|---|---|
| D1 deck features | Done, changed | the solar trees are replaced by 16 low PV tracker segments (180 glass–glass modules) along the Allee and the north spoke; §2.1 rule 5 and §4.1/§4.8 now mean PV rows, not leaves. The deck also carries data packets into the tower, edge studs, rover lanes, a hatch band, vent grates, 4 maintenance drones and 8 rovers |
| D4 medallion, §3.1, §3.3, §3.5, §3.6 | Done, changed (DECISIONS D10) | the anamorphic spec and per-arc table are retired: ring + 17 arcs as 0.42 m tubes in one plane (z 8.95), 0.45 m over a 0.85 m dial (face z 8.5, back z 7.65), R 10.5, exact from every view; collar, yoke on pivots at 3/9 o'clock and hub; the front chamfer stays disc colour; the 26 teal 0–25 ticks sit on a stepped carbon band with alu trims. Brand pixel test passes (§2.6) |
| D11 / §4.6 Kielraum | Done, changed (DECISIONS D11) | a dark control room: interior light 0.45 (not 0.6), smoked glass and a graphite frame instead of tinted glass and an alu truss, catwalk grating #77726D (not #A8A29E), a graphite well under the gimbal |
| D12 dusk glow | Done | additive light spill along every guide line and the rim, warm bollard pools; channels 9 cm |
| §5.4 telemetry strip | Done | on a dark glass pill |

---

## 0. In one page

The island's premise is *"the island is a robot, and you are standing on it."* The current build doesn't look like a robot. It looks like a park on a floating rock, with pines, heath mounds, boulders, grey pavers, black bike-rack railings, an airport control tower with a sticker on it, and an inverted rock mass underneath. v2 makes every object on the deck earn its place on a flying machine:

1. **Language: "Flugmaschine".** Light ceramic-composite panels with seams and chamfers, brushed aluminium, dark glass and carbon accents. Teal light lines carry data, warm white is work light, and orange stays the rare signal colour. The island is bright and clean by day and glows at dusk (§2).
2. **Tower.** The 12-sided dark prism with its mushroom cap goes. The new tower is a white **hyperboloid diagrid** around a dark-glass core, with a slim **halo** as the Ausguck and a crown of six sensor masts. Every coordinate other code depends on stays (§3.2).
3. **Logo.** The flat disc goes too. In its place is a **3D Recamán sculpture**: 17 arcs fan forward out of a deep dark "lens" and are anamorphically corrected, so they form the exact mark from the arrival point (the *Messpunkt*) and read as a 3D sculpture from everywhere else. Unlit arcs are brushed-aluminium "ghosts". A stamp lights its arc: a robot arm under the halo draws it with a laser, as in the founder's film. The tower is exactly in sync with the Pass cover (§3.3–3.4).
4. **Brand colours are currently wrong on screen.** The "exact" medallion renders as `#FF7D15` on `#090C11`, not `#FF6700` on `#141414` (measured). v2 adds brand-exact materials (§2.6).
5. **Trees, mounds and rocks are replaced by functional elements.** Sun-tracking solar trees, cooling-air intake fields with visible fans, heat-exchanger fin banks, sensor masts and three hydroponic glass pods (the only greenery). Small service rovers bring the deck to life (§4.1).
6. **Underside.** An engineered hull replaces the rock, and the six ducted rotors become the dominant silhouette (§4.6).
7. **Zones.** One shared material language and common details (portals, boards, consoles, plot ring). Each zone gets concrete exterior and interior changes. Gameplay geometry, colliders and interactables don't move (§6).
8. **Perf.** The new art is built from instanced and merged meshes. Three existing leaks are fixed on the way: EMI-01 never drops to its far LOD, Kielraum props render from outside, and the lift car and Libelle are unmerged (§7).

![before/after](../artifacts/phase4/art/proto/compare-spawn-before-after.jpg)
*Top: current spawn view (left) vs. prototype (right), 7 of 18 stamps. Bottom: dusk, current (left) vs. prototype with all arcs lit (right). Prototype = `artifacts/phase4/art/proto/main.js`, a throwaway three.js scene with the game's sun, sky colours and bloom threshold.*

---

## 1. Diagnosis

### 1.1 Method

- `artifacts/phase4/art/tools/diag.mjs` (run from the repo root with `PT_DEV=1 PT_DIR=phase4/art node artifacts/phase4/art/tools/diag.mjs`; uses `tools/lib/session.mjs`, private dev server, 1280×720, HUD hidden): 59 views covering spawn, Allee, plaza, foyer, Ausguck (down and out), Glasbalkon, Kanzel, Landedeck, 7 aerials, underside, Kielraum, every zone (gate, 3/4 exterior, two interior views) and dusk (`__academy.solve('world','dusk')`). 0 console errors.
- UI: Pass, map, prompt, zone card (`artifacts/phase4/art/ui/`).
- Pixel sampling of the medallion, a model of the colour grade (`proto/grade.mjs`), and a per-owner draw-call count (frustum-tested meshes per top-level group).
- Brand sources read: the EmAI brand kit (README, styleguide, logo.svg, logo manual); the founder's logo-film experiment (its recaman, logo, beam, robot, timeline, post and environment scripts) and frames from his exported film (`artifacts/phase4/art/recaman/founder-film-frames.jpg`).

### 1.2 What reads as non-futuristic, cheap or incoherent

| # | Element | What is wrong | Evidence (`artifacts/phase4/art/diag/…`) | Owner |
|---|---|---|---|---|
| D1 | **Pines, heath mounds, boulders** (34 trees, 46 rocks, mounds ≤ 1.5 m) | No reason to exist on a flying robot. Flat-shaded cones up to ~9 m tall dwarf the 1.1 m railings, cast big shadows across the paths and read as "low-poly park". | `02-spawn`, `05-allee-side-e`, `09-plaza-out-sw`, `12-free-deck`, `21-aerial-hub` | landscape (`terrain.ts`) |
| D2 | **Grey pavers everywhere** (Allee, spokes, ring, plaza) | A pedestrian-zone brick pattern (1 × 0.5 m) in dark brown-grey. It doesn't read as a machine deck. Plots are 44 m discs of the same paving with a few props, so they look unfinished from above. | `04-allee-mid`, `21-aerial-hub`, `23-aerial-top` | landscape (`deck.ts`, `textures.ts`) |
| D3 | **Akademie-Turm silhouette** | A dark cylinder with a flared observation cap, i.e. an airport control tower or water tower. A tiny door at its foot gives no scale cue. Dark metal from every side, and the south face is in shade at golden hour (sun at 295°). | `02-spawn`, `26-tower-close`, `27-tower-north` | tower |
| D4 | **Medallion** | A 24 m flat disc on an 18 m-wide tower: it overhangs both edges, like a sticker. Unlit black with unlit orange, no material, no depth. From below or the side it is a thin plate (`08-tower-foot`). Measured colours are off-brand (§1.4). | `07-plaza-tower`, `08-tower-foot`, `26-tower-close` | tower |
| D5 | **Allee railing** | GDD §6.1's "tangent semicircles" motif echo reads as black bike racks or a garden fence. | `05`, `06`, `11-ring-path` | landscape (`railing.ts`) |
| D6 | **Gate masts and bollards** | 14 m black poles with a sign and a ring read as street lamps. Black bollards everywhere. | `05-allee-side-e`, `10-plaza-out-ne`, `11-ring-path` | landscape (`masts.ts`, `deck.ts`) |
| D7 | **Plain black boxes** | Dunkelfabrik monolith, Prüffeld container and frames, Greifwerkstatt cabinet, screen backs: unchamfered boxes in near-black. | `49-z-dunkelfabrik-ext`, `53-z-prueffeld-ext`, `43-z-greifwerkstatt-in2` | zones |
| D8 | **No shared architecture** | Each zone is a different genre: a dark geodesic dome, a gravel garden with green icosahedron shrubs, an open disc with an arm, a carport pavilion on brown columns, a black box, a trade-fair truss. Nothing says "the same machine". | `32`–`55` | zones |
| D9 | **Underside = inverted rock** | "The old summit the works were built on" (`underside.ts`) with stalactites. This is the fantasy floating island (sky-pirate genre), the opposite of a hexacopter. The rotors look small next to the rock. | `24-aerial-side`, `28-underside`, `29-underside-low` | landscape (`underside.ts`) |
| D10 | **Sky dressing** | Blimps (retro) and three inverted-rock "Prüfinseln" (spinning-top silhouettes) contradict the premise. | `13-glasbalkon`, `19-ausguck-sw`, `33-z-sensordom-ext` | landscape (`sky.ts`) |
| D11 | **Dark interiors** | Sensordom hall is nearly black outside the darkroom. Kielraum is dark industrial. Foyer is plain white walls under a black ceiling. | `34`, `35`, `31-kiel-tp`, `17-foyer-2` | zones-a, landscape/core, tower |
| D12 | **Dusk doesn't glow** | The island turns into a black silhouette with a few bollards. Only the logo and the Allee lines read. | `56-dusk-spawn`, `57-dusk-plaza`, `58-dusk-aerial` | landscape (`dusk.ts`) + all emissive owners |
| D13 | **Ausguck railing** | Three heavy dark rails cut every view from the lookout, which is supposed to be the island's best view. | `18`, `19`, `20`, `59-dusk-ausguck` | tower |

### 1.3 Why it "sometimes looks buggy" (visual defects)

These are the things a first-time visitor reads as bugs:

| # | Defect | Evidence | Owner |
|---|---|---|---|
| B1 | **The Lern-Dojo "Demo-Wolke" teal ribbons** hang unframed in the sky and read as a glitch or stray triangle strip from the spawn, the Allee and the aerials. | `02-spawn` (right), `21-aerial-hub`, `44-z-lern-dojo-gate` | lern-dojo |
| B2 | **The Sensordom LiDAR fan**, a 30 m translucent teal wedge, sweeps through the sky above the deck. It reads as a rendering artefact. | `33-z-sensordom-ext`, `58-dusk-aerial` | sensordom |
| B3 | **Emissive materials in the "muddy band"**: `accentTeal` (×2.0, L≈1.03), mast teal (×1.7), `accentOrange` (×2.4 on a lit surface, L≈0.8–1.1). They sit right at the bloom threshold, so they bloom in sun and not in shade, and flicker in and out of glow as lighting changes. `emissiveOrange` is documented as "blooms" but doesn't (L 0.74 < 1.0). | `src/core/brand/materials.ts`, `RenderSystem.ts` threshold 1.0 / smoothing 0.25 | landscape |
| B4 | **Logo colours off-brand** (§1.4): a yellowish orange on a blue-black hole. | pixel samples of `02-spawn` | landscape + tower |
| B5 | **Medallion seen from below** is a thin flat plate with a hard black underside. | `08-tower-foot` | tower |
| B6 | **Pines intersect mounds and path kerbs.** Trunks start mid-slope, and big hard shadows fall across the paths at low sun. | `05`, `09`, `12` | landscape |
| B7 | **Floating props**: signs and boards on thin black legs, screens without frames, a teal "kite" glyph in the sky. Objects don't land on anything. | `05`, `40`, `44` | zones |

### 1.4 Measurements that drive the spec

- **Brand colour on screen** (spawn screenshot, centre pixels): spiral `rgb(255,125,21)` = `#FF7D15` (target `#FF6700`); disc `rgb(9,12,17)` = `#090C11` (target `#141414`). Cause: in the composer path *everything*, unlit materials included, goes through ACES + the EmAI grade (S-curve, saturation 1.1, cool shadow tint), and the disc also receives fog. `toneMapped: false` has no effect in that path. The model in `proto/grade.mjs` reproduces both measurements and solves the compensation used in §2.6.
- **Bloom** (`RenderSystem.ts`): mask = `smoothstep(1.0, 1.25, L)` on linear HDR luminance before tone mapping. Below L 1.0 nothing glows; from 1.25 up everything glows fully.
- **Lit-surface ceiling**: the sun is 4.2 at 16° elevation, so a vertical surface facing the sun receives E ≈ 4.04, giving radiance ≈ 1.29 × albedo. Albedo `#E7E5E4` (linear 0.80) plus ambient comes to L≈1.17 and **blooms**. `#D6D3D1` (linear 0.67) comes to ≈0.98 and does not.
- **Draw calls** (whole scene, `renderer.info`): spawn 388, aerials 409–509, underside 524, dusk aerial 521. Several views already break the 500 budget. Per owner in the underside view: zones 160, island misc meshes 64, underside 37, **Kielraum props 30 (visible from outside)**, **EMI-01 24 (near LOD at 75 m)**, Libelle 10, lift car 8, shuttle pod 5.

---

## 2. Visual language: "Flugmaschine"

### 2.1 Five rules

1. **Every object has a job on a flying robot.** It senses, powers, cools, carries, measures, guides or maintains. If you can't say which, it goes. Only the zones' exhibits, the Prüffeld showroom (vendor fiction, GDD §9.1) and three hydroponic pods (people need food and air) are exempt.
2. **Three material families plus two accents.** Light ceramic-composite (≈ 55 % of lit surfaces), brushed aluminium (≈ 15 %), dark glass and carbon (≈ 25 %), teal light (≈ 3 %), orange signal (≤ 2 % by day, never above 5 %). No black slabs, no brown, no blue-grey neutrals (styleguide: warm stone neutrals).
3. **Light is information.** Teal means data, sensors and wayfinding. Warm white means work light and inhabited space. Orange means "this is the signal", which covers the objective, hazards, rotating parts, the laser and the mark. Light is always *built in*: emissive strips sit in a 2 cm carbon reveal, never stuck on as a sticker.
4. **Engineered form.** No raw boxes over 0.5 m, no hard 90° edges in view. Chamfers, radii, tapers, lathe profiles and panel seams. Things stand on feet or plinths, and parts meet at a shadow gap or a metal collar, never by interpenetrating.
5. **The machine is alive.** The island visibly controls itself: solar leaves that correct their aim, fans turning under grilles, rotors, service rovers, drones, the tower drawing your progress. Motion is slow and purposeful, with no blinking (GDD §9.6).

### 2.2 Palette in 3D (tokens, sRGB hex → use as `THREE.Color` in linear)

| Token | Hex | Use |
|---|---|---|
| `hull` | `#D6D3D1` (stone-300) | Default for large lit surfaces: tower, foyer drum, pylons, hull, consoles. **Upper albedo limit for large sun-facing verticals** (bloom, §1.4). |
| `hullWarm` | `#CFC9C2` | Second ceramic tone for panel alternation (every 3rd panel) and the underside hull. |
| `deck` | `#C3BEB8` | Walkable deck composite. |
| `deckDark` | `#8F8A84` | Paths (Allee, spokes, ring): the "runway" tone. |
| `alu` | `#C9C4BF` | Brushed aluminium: rails, posts, frames, collars, trims. |
| `carbon` | `#1C1917` (stone-900) | Plinth reveals, light-channel reveals, cable trays, sensor masts, dark trims. |
| `darkGlass` | `#1C1917` + clearcoat | Tower core, visor bands, doors, screens (frame). |
| `shell` | `#E7E5E4` (stone-200) | **Small** parts only (≤ 2 m²): robot shells, EMI, sensor pods, leaves' edges. |
| `teal` | `#2DD4BF` | Light lines, sensors, data, pads, Wilson bands. |
| `warm` | `#FFE9CC` | Work light, coves, grow lights, dusk windows. |
| `orange` | `#FF6700` | Signal only (see rule 3). |
| `plant` | `#5F7046` | Plants, **only under glass** (hydroponic pods, Regelgarten troughs). |

### 2.3 Material recipes (landscape adds them to `MaterialLibrary` in `src/core/brand/materials.ts`; everyone uses them via `ctx.materials`)

All are cached singletons; never mutate, clone instead (existing rule).

| Name | Class and parameters | Textures | Notes |
|---|---|---|---|
| `hull` | `MeshPhysicalMaterial({ color: 0xD6D3D1, roughness: 0.5, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.8 })` | `panelN` normal map, normalScale 0.6 | Clearcoat > 0.15 or roughness < 0.45 gives sun hotspots that bloom on big curved members (seen in the prototype). |
| `hullWarm` | same as `hull`, color `0xCFC9C2`, roughness 0.55 | `panelN` | |
| `deckComposite` | `MeshStandardMaterial({ color: 0xC3BEB8, roughness: 0.82, metalness: 0.05 })` | `deckPanel` albedo + `deckPanelN`, 3 × 1.5 m staggered panels | Roughness ≥ 0.78 on every walkable surface. At 0.62 the low sun produced a large bloom glare in the prototype. |
| `deckPath` | `deckComposite` with color `0x8F8A84`, roughness 0.78 | same textures, 3 × 3 m panels | Allee, spokes, ring path. |
| `plazaDisc` | `deckComposite`, color `0xCFCAC4` | `plazaRadial`: concentric rings every 3 m, radial seams every 7.5° (a turbine-disc pattern) | Replaces the plaza texture. |
| `brushedAlu` | `MeshStandardMaterial({ color: 0xC9C4BF, roughness: 0.3, metalness: 0.95 })` | none (optional 64² streak normal) | Replaces `steel` / `railing` (`#3D3D3D`) in all new work. |
| `carbon` | `MeshPhysicalMaterial({ color: 0x1C1917, roughness: 0.38, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.2 })` | optional `twillN` (64², 0.05 m tile) | Dark accents. |
| `darkGlass` | `MeshPhysicalMaterial({ color: 0x1C1917, roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2 })` | none | Opaque. It reads as glass through reflections, with no transparency cost. |
| `glassClear` | existing `glass`, but `opacity: 0.12, envMapIntensity: 0.8` | none | **Only where people look out** (Ausguck, Kanzeln, Glasbalkon, pods, lift). Never as a long balustrade seen at grazing angles: Fresnel turns it into a white wall (prototype, first pass). |
| `pvCell` | `MeshPhysicalMaterial({ map: pvTex, roughness: 0.25, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 })` | `pvTex` 256×384: `#1B1A1A` cells, silver busbars `rgba(200,196,190,.55)` every 32 px, fingers at 16 px | Solar leaves. |
| `rubber` | existing | | Wheels, seals. |
| `light(color, tier)` | `MeshBasicMaterial({ color: base × k(tier) })`, **unlit**, `fog: true` | none | Every light line. **Never** `MeshStandard` with `emissive` for light lines, because lighting would push them in and out of the bloom band (B3). |
| `brandExact('orange' \| 'disc')` | see §2.6 | | Logo only, plus optional in-world screen frames. |

Texture recipes (procedural canvas, `src/world/textures.ts`, landscape; reuse `normalMapFromHeight`):

- `panelN`: 512² represents 2.4 × 1.2 m panels (2 × 4 per tile). Seam = 6 mm groove (height −1 over 3 px with a 1 px bevel), ±3 % per-panel albedo variation baked into an optional `panelA`, fine value noise at 0.5 % amplitude. Tile in world units (triplanar or metre UVs).
- `deckPanel` / `deckPanelN`: 512² represents 12 × 12 m (3 × 1.5 m panels, every 2nd row offset by 1.5 m). Seams `rgba(70,64,58,.55)`, 2 px. One flush 0.4 m service hatch every ~40 m² (drawn as a thin rectangle).
- `plazaRadial`: polar drawing at the plaza's exact size (64 × 64 m, as now).
- Memory: four new 512² RGBA textures plus mips ≈ 5.6 MB GPU, 0 bytes download.

### 2.4 Light tiers vs. the bloom threshold

Bloom mask = `smoothstep(1.0, 1.25, L)`, L = linear luminance (`0.2126 R + 0.7152 G + 0.0722 B`). Per-unit luminance of the base colours: teal `#2DD4BF` 0.514, orange `#FF6700` 0.310, warm `#FFE9CC` 0.839.

| Tier | Target L | Teal × | Orange × | Warm × | Use |
|---|---|---|---|---|---|
| **T0 line** (no bloom) | 0.45–0.6 | **1.0** | **1.6** | **0.6** | Daylight light lines, inlays, rail lines, level rings. Readable as a saturated line without bloom, so also on `low` quality. |
| *forbidden band* | 0.8–1.25 | — | — | — | Partial mask: it flickers into glow with lighting and MSAA. Nothing may sit here. |
| **T1 glow** | 1.4–1.5 | **2.8** | **4.7** | **1.75** | Dusk light lines, objective beacon, active station rings, interior coves, Dunkelfabrik strips. |
| **T2 beacon** | ≈ 3.1 | **6.0** | **10** | **3.7** | Small points only (≤ 0.3 m): the laser hot head, the tower needle light at dusk, the objective pulse peak. |

Retune the existing shared getters **without changing their class or API**, because zones use them:
- `accentTeal`: `color 0x000000`, `emissiveIntensity` 2.0 → 2.8. With a black base colour the glow no longer depends on lighting.
- `accentOrange`: `color 0x000000`, `emissiveIntensity` 2.4 → 4.7.
- `emissiveOrange` ×2.4 → ×4.7 and `emissiveTeal` ×2.0 → ×2.8 (both `MeshBasic`).
- Mast teal: ×1.7 → ×2.8.
- `orangePaint` (matte, lit) stays for rings that rotate.

New code uses `light(color, tier)`. Zone owners check their own emissives against the table: anything that sits between L 0.8 and 1.25 moves to T0 or T1. Day-to-dusk switching is a uniform lerp of k from T0 to T1, driven by the existing `finale:dusk` `t` (`dusk.ts`): `k = mix(kT0, kT1, smoothstep(0.25, 0.6, t))`.

### 2.5 Geometry rules (all builders)

- **Boxes**: any visible box with an edge > 0.5 m uses `RoundedBoxGeometry` (`three/examples/jsm/geometries/RoundedBoxGeometry.js`) with radius = clamp(0.04 × smallest dimension, 0.02, 0.25) and segments 2, or an `ExtrudeGeometry` with `bevelThickness = bevelSize` = the same radius and `bevelSegments: 1` (a chamfer).
- **Columns and masts taper** 15–35 % (`CylinderGeometry(rTop, rBottom)`), stand on a carbon foot (0.1–0.2 m), and carry an alu collar where they meet a deck or beam.
- **Plinth reveal**: buildings and big props stand on a 0.1–0.35 m carbon band, inset 0.2–0.3 m, so they float off the deck. No visible intersection of an object with the deck.
- **Seams instead of geometry**: surfaces > 4 m² show panels through `panelN` / `deckPanelN`, not modelled grooves.
- **Edges**: every large ceramic body gets one alu trim (collar, rim or lip). Two-tone edges are what reads "precision".
- **Curves**: prefer circles, arcs, lathe profiles and tangent arcs. For plaza furniture and path corners, use radii from the Recamán ladder (r = 0.39 m × k, the sculpture's arc radii) as a quiet motif.
- **Light reveals**: a light line is a `light()` mesh 0.03–0.08 m wide, sitting 1 cm proud of the floor of a 2 cm carbon channel.
- **Scale ladder**: player 1.75, railing 1.1, doors 2.6–4.5, pylons 14, tower 58 (needle tip). Nothing on the deck taller than 7 m except pylons, the tower and zone buildings.

### 2.6 Brand-exact rendering (landscape implements, tower uses)

The composer path grades everything. To land on the brand colours, brand-exact materials are pre-compensated. Values solved with `proto/grade.mjs` for ACES + `DEFAULT_GRADE`:

| Colour | Target on screen | Material colour (linear, composer path, exposure 1) | Low path (no composer) |
|---|---|---|---|
| Spiral / ring lit | `#FF6700` | `(0.908, 0.105, 0.000)` → model gives `rgb(254,103,5)` | `#FF6700`, `toneMapped: false` |
| Disc face | `#141414` | `(0.0263, 0.0239, 0.0202)` → model gives `rgb(20,20,20)` | `#141414`, `toneMapped: false` |

- FUN-PLAN §6 says "unlit/toneMapped false" for the lit mark. That alone is **not** exact in the composer path (measured, §1.4). Use `brandExact()`.
- `MeshBasicMaterial({ fog: false, toneMapped: false })`. **Divide the colour by the current exposure** (`rs.exposure`: 1.0 by day, 1.32 at full dusk). The ACES input is `c × exposure`, so this stays exact through the dusk blend. Re-apply on `quality:changed` (post on/off) and whenever `setExposure` runs.
- Lit tubes may darken towards their silhouette edge: `col × mix(0.75, 1.0, pow(facing, 0.7))`, with the stroke centre exact. No bloom: the compensated orange has L = 0.27.
- **Acceptance** (new check in `tools/`, core): sample the spawn screenshot at 5 disc points and 5 stroke centres. Each channel within ±4/255 of `#141414` and ±6/255 of `#FF6700`. Mean of a 4 px band outside the ring ≤ +6/255 above its reference, which proves there is no glow halo.
- Optional, landscape: soften `DEFAULT_GRADE.shadowTint` from `(-0.01, -0.002, 0.014)` to `(-0.006, -0.001, 0.008)`. The cool shadow tint turns stone neutrals bluish (styleguide: "warm neutrals, never blue-based").
- In-world screens (canvas textures) shift the same way: orange text renders `#FF7D15`. If a zone wants exact UI colours on an in-world screen, apply the inverse grade in the material via a 32³ LUT baked once at load by numerically inverting `gradeBody` (≈ 1 ms). This is optional; landscape provides it as `ctx.materials.screenExact(tex)`.

### 2.7 Day, dusk, post (landscape: `Environment.ts`, `RenderSystem.ts`, `dusk.ts`)

- **Day** keeps the art-directed sky. Two tweaks: hemisphere 0.62 → **0.75** and `envIntensity` 0.5 → **0.6**, because white ceramic in shade must read light grey, not muddy. **Optional (founder decision Q3):** sun azimuth 295° → **255°**. At 295° the tower's south face (the hero view) is backlit. At 255° it gets grazing light, the sun stays at the left edge of the spawn frame, and the golden glow stays in shot. That changes GDD §4.7 "sun front-left (WNW)" to "left (WSW)". Test with the spawn and Allee shots before deciding.
- **Bloom**: threshold 1.0 and smoothing 0.25 stay (the tiers depend on them). Intensity: day **0.7**, dusk **1.0** (lerp with dusk `t`). Radius 0.72 stays.
- **Dusk** = "the island glows": every T0 line goes to T1, the tower core rings, halo lip and needle light come on, hull nav lights and rotor duct rings appear, rail lines and pylon slots glow, pods show warm grow light. Exposure 1.32 stays. The logo stays exact (it is compensated by exposure, so it doesn't brighten).
- **Low tier** (no post): T0/T1 lines must read without bloom. They do, because colour and luminance carry them. Fans and leaves stop animating when `level === 'low'`.

---

## 3. Tower and Recamán sculpture (owner: **tower**)

### 3.1 The coordinator's anamorphic idea, evaluated

*"An anamorphic sculpture of luminous semicircle tubes at different depths that aligns into the exact logo from the arrival/Allee viewpoint and reads as a 3D sculpture from everywhere else."*

| Question | Verdict |
|---|---|
| Can it be exact? | **Yes, from one eye point**, by construction: every point of a tube is moved along its own viewing ray from that point. I prototyped it (`proto/main.js`). |
| Which variant? | **Not "arcs at different depths".** Depth-scaling whole arcs separates their endpoints in 3D. From the side they become 17 loose hoops that each need a support, and the joints break apart as soon as the player moves. **Use a forward fan about the endpoints instead:** each arc keeps its two endpoints on the mark's vertical axis (the Recamán number line, exactly as in the founder's film) and swings forward by α_k. Each point is then pulled along its ray to depth \|x\| tan α_k. The curve stays continuous in 3D, every arc is a self-supporting loop from two nodes, and drift is small (below). |
| Readable from the Allee? | Measured (`proto/drift.mjs`, 1280×720, FOV 72°, ring ≈ 111 px at spawn): **0 px at the Messpunkt; ≤ 1 px mean / 2.6 px max at z = 75** (the stroke is ≈ 3 px); 5 px max at z = 65; 10 px at z = 55. From the plaza (z ≤ 45) it opens visibly into the 3D fan. **The mark is exact for the first 20 m of the Allee, then unfolds into a sculpture as you approach.** That is a designed reveal, not an error. |
| 3D from elsewhere? | Yes: the fan goes up to 3.74 m deep (`proto/offaxis-day.png`, `side-day.png`, `offaxis-dusk.png`). |
| "Replacing the flat disc"? | **No, the dark backing has to stay.** Logo manual: the primary mark needs the `#141414` circle on neutral or light backgrounds, and the spiral may not sit on a busy or light background without it. The sky and a white tower are light, and a lattice is busy. So the disc stays, but as a deep "lens" (2.4 m) with a dark chamfered front edge, a metal trim at the back and a hub, not a flat plate. At dusk it would be allowed to go, but it is part of the object, so it stays. |
| Individually lit arcs? | Yes. **Mapping = the Pass cover** (`PassPanel.ts`): stamp 1 lights the **ring**, stamps 2…18 light **arcs 1…17**. One source of truth, the stamp count in `Progress`. |
| Dim ghost arcs? | Recommended: **brushed-aluminium tubes** (an unpowered light tube). From the start the sculpture shows the full mark in one ink (a monochrome variant on the dark disc), and lit arcs switch to brand orange. FUN-PLAN §6 defaults to "the opacity the Pass cover uses (0.2) or an equivalent dim". *Brand question Q1:* alu ghosts make a two-ink progress state. If the founder prefers opacity, use orange tubes at the Pass value and raise it to 0.35 only if the mark doesn't read at 85 m in the spawn shot. |
| Glow? | The static mark: **no bloom** (compensated orange L 0.27). Only the laser beam, its hot head and the spark bloom during a drawing event, as in the founder's film. |
| Motion? | The geometry is **static**: nothing rotates, morphs, wobbles or pulses, ever (FUN-PLAN §6, logo manual). Allowed: progressive reveal per element and the finale "Einschalten" sweep (FUN-PLAN §6.6). The founder's golden-angle swing from his film stays out unless he asks for it (Q2). |
| Flat? | FUN-PLAN §6 describes the lit mark as "flat, upright, exact". ART-V2 keeps upright and exact, from the Messpunkt, but makes the sculpture **not planar**, because the coordinator asked for a 3D sculpture and the founder called the flat disc "plated". This is a fixed, sculpted form, not a morph. **Fallback in one constant:** `TOWER.sculpture.depthMax = 0` builds the planar mark with the same lens, materials and drawing. |

**Verdict: build it** as the forward-fan anamorphic sculpture in front of a deep dark lens, mounted on a new tower.

**Division of labour with `docs/FUN-PLAN.md` §6** (committed in parallel): FUN-PLAN owns the *progress hook*. That covers the element mapping, the trigger (outdoors, in frustum, ≤ 160 m), durations and acceleration, `logo:element`, `logoShown` persistence, the finale sweep, debug hooks and the budget (≤ 12 extra draw calls and ≤ 40k triangles for arm, beam and sculpture). ART-V2 owns the *look*: tower, lens, sculpture geometry, materials, brand-exact colours and arm styling. Where numbers in this file differ from FUN-PLAN §6 on those hook topics, FUN-PLAN wins.

### 3.2 The new Akademie-Turm (keep every dependent coordinate)

Prototype views: `proto/spawn-day-7arcs.png`, `offaxis-day.png`, `side-day.png`, `north-day.png`, `spawn-dusk-17arcs.png`, `aerial-dusk.png`.

**Unchanged (other code depends on it):** `TOWER.circumradius 9`, `inradius 8.69` (`foyer.ts` `WALL_R`), `foyerHeight 7`, S door 4 × 4.5 and N lift door 2.6 × 3 with their colliders, `roofY / ausguck.y 44`, Ausguck walkable ring `r 9–13` with the lift hole, lift shaft at `(0, ·, −10.7)` with half-width 1.55 and its stops and colliders, the certificate stand `(2.6, 44.525, −10.1)` (finale), the Libelle at `(0, 0, 19)`, the oculus. **New constants** (`layout.ts`, landscape makes the one small edit): `TOWER.sculpture = { center: [0, 24, 12.4], discZ: 11.7, radius: 10.5, eye: [0, 1.65, 94.5], depthMax: 4.0 }` and `TOWER.arm = { base: [0, 43.4, 12.2] }`. Keep `TOWER.medallion` as an alias (`center: [0, 24, 11.7], radius: 10.5`) for compatibility.

| Part | Geometry | Material | Draw calls |
|---|---|---|---|
| **Foyer drum** 0–7 m | 12-gon as now (facets on bearings 0…330, same openings). Exterior skin in two courses with 5 cm carbon seams at y 2.33 and 4.66. **Plinth reveal** 0–0.35 m, inset 0.3 m. **Collar** torus R 9.0, tube 0.35 at y 7.05. **Drum roof**: ring r 3.4 → 9.0 at y 7.0–7.35, 2 % slope outward. | `hull`, `carbon` reveal, `brushedAlu` collar | 3 |
| **S portal** | Door opening unchanged. Frame 0.3 m chamfered alu (4.6 × 4.8). Dark-glass doors. **Teal lintel line** 3.6 × 0.05 m at y 4.47 (T0 → T1). Eyebrow above: `AKADEMIE · INSEL 17` in Geist Mono Medium 0.32 m, stone-500. | `brushedAlu`, `darkGlass`, `light(teal)` | merged with drum |
| **Diagrid** 7.2–43.0 m | Hyperboloid of one sheet from **2 × 18 straight members**. Family A runs from the bottom ring (r 8.85, y 7.2, angle θᵢ = i·20°) to the top ring (r 8.55, y 43.0, angle θᵢ + 96°). Family B is offset by 10° and twisted −96°. Section: an ellipse 0.40 m (tangential) × 0.28 m (radial), 10 segments. Bottom and top ring beams: tube 0.22. **Waist ring** at y 25.1, r 5.97 (just outside the members' midpoints at r 5.82), tube 0.16. Lattice radius ≈ 7.3 at y 13.5, 5.85 at y 24, 6.6 at y 34.5, so the lens back (z 9.1) clears it by ≥ 1.8 m. Clearance to the lift shaft's inner face (z −9.15) is 0.3 m at the bottom ring: keep the shaft colliders as they are. | members `hull` (InstancedMesh), rings `brushedAlu` | 2 (+1 shadow) |
| **Core** 7.0–44.0 m | Cylinder r 3.4, 48 segments. **11 level rings** (torus r 3.43, tube 0.035) every 3.4 m from y 9.0. Stamp feedback: a ring brightness pulse runs bottom → top in 1.2 s when a stamp is awarded (data rises to the mark). | `darkGlass`; rings `light(teal)` T0 → T1 | 2 |
| **Halo (Ausguck)** | Lathe profile (r, y): (8.4, 42.4) (10.0, 42.95) (11.8, 43.3) (12.9, 43.52) (13.3, 43.75) (13.2, 43.95) (12.9, 44.0) (8.4, 44.0), 128 segments. Walk surface is the existing trimesh at 44.0 with the lift hole. **Lip light**: torus r 13.05, tube 0.05, y 43.42. | `hull`; deck top `deckComposite`; lip `light(teal)` | 3 |
| **Ausguck balustrade** | Glass cylinder r 12.85, 44.0–45.1 (colliders unchanged), handrail torus r 12.85 tube 0.045 at 45.12, a teal line 1 cm under the handrail. **This replaces the three dark rails (D13).** | `glassClear`, `brushedAlu`, `light(teal)` | 3 |
| **Crown** | **Six sensor masts** at r 7.6 on the **zone bearings** (30, 90 … 330): carbon, r 0.07 → 0.12, 6.5 m, leaning 8° outward, colliders r 0.15. Each tip carries a white pod (r 0.28, h 0.32) with a **beacon ring in its zone's state colour** (stone = unvisited, teal = visited, orange = objective; same logic as the gate masts), so the objective direction is visible from anywhere on the island. **Needle**: alu cone r 0.2 → 0.06, y 44 → 58, anemometer kept (orange hub ring, rotates), steady warm light at 58.3 (T1 by day, T2 at dusk). The 12 crown fins go. | `carbon`, `shell`, `brushedAlu`, `light()` | 5 |
| **Lift shaft** | Position and colliders unchanged. Posts: round Ø 0.22 alu (instead of 0.2 m square). Glass on 3 sides. Cap: `RoundedBox(3.6, 0.8, 3.6, r 0.25)` at y 47.6. **Car**: rounded white shell with a teal floor band (T0 → T1), so the ride is visible at dusk. Merge the car to ≤ 2 meshes (it is 8 now). | `brushedAlu`, `glassClear`, `hull`, `shell` | 4 |
| **Foyer interior** | Lining becomes 1.2 m ceramic panels (`panelN`). Warm floor cove (T0 warm) along the walls. Ceiling becomes carbon with 12 radial ribs towards a central disc; the light ring stays (T1 warm). Floor: polished composite `#B5AFA8`, roughness 0.3. Oculus rim alu plus a teal ring (T0). Boards in alu frames (§6.0). | as listed | ≤ +4 |
| **Plaza benches** (`hub.ts`) | Same footprint; ceramic seat with a carbon foot reveal and an alu edge. | `hull`, `carbon` | 1 |

Silhouette check: from every side the tower now reads as a slim white lattice with a dark core, a floating halo, a crown of masts and a luminous sculpture. It no longer reads as a control tower (`proto/north-day.png`, `aerial-dusk.png`).

### 3.3 The Recamán sculpture: geometry

Units: SVG mark units (disc r 400, +y up, GDD Appendix A) scaled by **s = R / 400 = 0.02625 m** (R = 10.5). Sculpture centre C = (0, 24, z_s). **Messpunkt (eye) E = (0, 1.65, 94.5)**, the spawn eye and the end of the ascent.

| Element | Spec |
|---|---|
| **Disc face** | Circle r = R − 0.05 in the plane **z = 11.7**, centre y 24. `brandExact('disc')`. |
| **Lens body** | Front edge: the disc-face material wraps over a 0.12 m 45° chamfer (`brandExact('disc')`), so the front view shows **no light outline** (the manual forbids outlines; the prototype's front alu rim was wrong). Side band: open cylinder R → 0.96 R, **depth 2.4 m** (z 11.58 → 9.1), `carbon`. On the side band, 26 teal tick lines (values 0…25, around the rim): these are only visible from oblique views, never from the front. **Alu trim ring at the back edge** (torus 0.96 R, tube 0.12, z 9.1), visible only obliquely. Back: carbon cap. **Hub**: tapered ceramic cylinder from the core (z 3.4, r 1.0) to the lens back (z 9.1, r 1.8). It passes the diagrid at r ≈ 5.85: set the diagrid phase so a lattice diamond is centred on bearing 180 at y 24, and keep the hub ≤ Ø 2.0 m where it crosses the members. Check clearance in a side shot. Nothing reaches round to the front. |
| **Number-line nodes** | 18 standoffs (r 0.09) from the disc face (z 11.7) to the spine plane **z_s = 12.4** at y = 24 + (−375 + 30·a_n)·s. `brandExact('disc')`: they lie along the view rays, so they are invisible from the Messpunkt and are visible "bolts" from the side. |
| **Ring** | Planar torus, radius 375·s = **9.84 m**, at z_s, centre y 24. |
| **Arc k = 1…17** | Planar logo curve L(φ), φ ∈ [0, π]: x = side_k · r_k · sin φ, y = 24 + y_c,k − dir_k · r_k · cos φ, z = z_s, with r_k = 15k·s, y_c,k = (−375 + 15(a_{k−1} + a_k))·s, side_k = +1 for odd k, dir_k = sign(a_k − a_{k−1}). **Fan angle** α_k = (0.35 + 0.65·frac(0.6180339887·k)) · min(55°, atan(4.0 m / r_k)). **Anamorphic point**: depth d = \|x\| · tan α_k, t = (E_z − (z_s + d)) / (E_z − z_s), **P = E + t·(L − E)**. Endpoints (x = 0) stay on the nodes, so the curve is continuous. |
| **Stroke** | 16 units (bold lockup weight, inside the manual's 8–16) → tube radius **8·s = 0.21 m**, times the arc's mean t (≤ 4 % smaller). Lit sleeve ×1.06 over the ghost tube. Tubular segments 16 + 4k, radial 6. Ring: 200 × 6. That gives ≈ 26k triangles for ghost plus lit, inside FUN-PLAN's 40k with the arm. |
| **Materials** | Ghost tubes: `MeshStandardMaterial({ color: 0xCFC9C2, metalness: 0.85, roughness: 0.28 })` (warm alu). Lit tubes: `brandExact('orange')` with the facing term (§2.6). |
| **Build** | Build on the CPU once: `TubeGeometry` along the corrected curve per arc, then merge all arcs. One **ghost mesh** (always drawn; the lens's back alu trim merges into it) and one **lit mesh** whose fragment shader discards where `aU > uProgress[aEl]`. Attributes: `aEl` = FUN-PLAN element index, 0 = ring and 1–17 = arcs; `aU` 0–1 along the element. Uniform `float uProgress[18]`. **Draw calls:** ghost 1, lit 1, disc face plus nodes 1 (same `brandExact('disc')`), lens body 1, ticks 1 = 5. The hub merges into the tower's `hull` mesh. With the arm (3: shell, carbon, orange rings) and beam plus spark (2, only while drawing) that makes ≤ 10, inside FUN-PLAN's ≤ 12. |
| **Clear space** (manual: 25 % of mark width = 5.25 m) | Nothing graphic inside 5.25 m of the disc edge in the façade plane: door top 4.5 vs. disc bottom 13.5 (9 m), parked arm ≥ y 40.0 vs. disc top 34.5. The diagrid behind the lens is architecture, as the tower is today. |

Per-arc reference values (verify your build against these):

| k | a(k−1)→a(k) | side | r_k (m) | centre y (m) | α_k (°) | max depth (m) |
|---|---|---|---|---|---|---|
| 1 | 0→1 | +x | 0.394 | 14.550 | 41.3 | 0.35 |
| 2 | 1→3 | −x | 0.787 | 15.731 | 27.7 | 0.41 |
| 3 | 3→6 | +x | 1.181 | 17.700 | 49.8 | 1.40 |
| 4 | 6→2 | −x | 1.575 | 17.306 | 36.1 | 1.15 |
| 5 | 2→7 | +x | 1.969 | 17.700 | 22.5 | 0.81 |
| 6 | 7→13 | −x | 2.362 | 22.031 | 44.6 | 2.33 |
| 7 | 13→20 | +x | 2.756 | 27.150 | 30.9 | 1.65 |
| 8 | 20→12 | −x | 3.150 | 26.756 | 49.9 | 3.74 |
| 9 | 12→21 | +x | 3.544 | 27.150 | 34.7 | 2.45 |
| 10 | 21→11 | −x | 3.938 | 26.756 | 21.2 | 1.53 |
| 11 | 11→22 | +x | 4.331 | 27.150 | 37.1 | 3.28 |
| 12 | 22→10 | −x | 4.725 | 26.756 | 25.0 | 2.20 |
| 13 | 10→23 | +x | 5.119 | 27.150 | 14.2 | 1.29 |
| 14 | 23→9 | −x | 5.513 | 26.756 | 27.8 | 2.91 |
| 15 | 9→24 | +x | 5.906 | 27.150 | 17.9 | 1.91 |
| 16 | 24→8 | −x | 6.300 | 26.756 | 30.1 | 3.65 |
| 17 | 8→25 | +x | 6.694 | 27.150 | 21.0 | 2.56 |

Size note: R = 10.5 makes the ring 111 px tall at spawn (today's medallion ring is ≈ 127 px). R up to 11.5 is fine (clear space: disc 12.5–35.5). Founder decision Q4. If R changes, recompute the table; s, the fan and the drift all follow from R.

### 3.4 Stamp lighting and the drawing event

Mapping, trigger, timing, persistence and finale: **FUN-PLAN §6** (stamp n lights element n − 1; element 0 = ring; only earned stamps count; draw only while visible, outdoors and ≤ 160 m; `logoShown`; finale "Einschalten" sweep on `finale:ended`). This section adds only the look of the event.

1. **Arm** (mounted hanging under the halo at `TOWER.arm.base`, bearing 180). A 6-axis arm with links 2.6 / 2.4 / 0.9 m and a laser head with a teal sensor pod. Paint `shell`, joints `carbon`, **orange rings on the rotating joints** (GDD rule "it rotates"). Unbranded, and not a look-alike of any vendor's model (D2/D6): the founder's `robot.js` styling is explicitly modelled on a real vendor's heavy-payload arm, so drop its counterbalance cylinder and housing shapes. Reuse its IK, baked axis dynamics and wrist solve, not its styling. **Parked pose**: all parts above y 40.0 and folded under the halo (clear space, §3.3). **Idle "ready" spark** (FUN-PLAN, while elements are pending): a 0.15 m warm point at the laser head (T1 warm), steady.
2. **Inside FUN-PLAN's duration** (≈ 1.6 s + 0.08 s × index), the founder's PERCEIVE → DECIDE → ACT flavour:
   - first 20 %: unpark, and a **teal sensor ray** touches the rejected candidate a(n−1) − n (a brief grey ✕ marker if it is negative or visited) and then the chosen node (teal ✓);
   - next 65 %: **laser on**. The element lights progressively (`uProgress` 0 → 1, ease in-out) with a hot head (colour (1, 0.62, 0.32) × 6, T2, blooms; it decays with exp(−6 s) after the end). A spark sprite sits at the target, with one landing ring pulse at the end node (`beam.js` and `logo.js` from the founder's experiment);
   - last 15 %: the arm re-parks, or moves straight to the next pending element.
   - Reduced motion: the element fades in over 0.6 s, with no arm motion and no beam.
3. **Finale sweep** (FUN-PLAN §6.6): `uSweep` 0 → 1 along lit elements only, in sequence order (≈ 4 s), with the warm-white head colour from `logo.js`. It runs once and never repeats; the manual forbids "pulsing", not a one-time sweep.
4. **Audio** (core): as FUN-PLAN §6.3 (soft laser hiss plus the element's Recamán note at −12 dB).
5. **Not by default (Q2)**: the founder's full golden-angle swing and collapse. It conflicts with "never rotate or morph". Only if the founder asks: the vertex-shader variant (canonical planar tube plus `uniform float uFan`, mix(rest, rotY(θ_k)), θ_k = k·137.5°).

### 3.5 Messpunkt (learning hook, optional for the fun designer)

A flush brushed-alu disc Ø 0.6 m with a teal ring and an eye glyph at `(0, 0, 94.5)`. Prompt when the player stands on it:

- DE: „Messpunkt. Nur von hier ergibt die Skulptur exakt das Logo. Ein einzelnes Kamerabild verliert die Tiefe: Alles auf einem Strahl landet im selben Pixel.“ Chip `QUELLE`.
- EN: "Measuring point. Only from here does the sculpture form the exact logo. A single camera image loses depth: everything on one ray lands on the same pixel." Chip `SOURCE`.
- Source: Hartley & Zisserman (2004), *Multiple View Geometry in Computer Vision*, 2nd ed., §6.1 (pinhole camera model). It ties the arrival to the Sensordom's depth lesson.

### 3.6 Acceptance (tower)

- Spawn shot (`?skipIntro=1`): the sculpture is centred (±8 px horizontally). Brand-exact pixel test passes (§2.6). No glow halo around the mark.
- `proto/drift.mjs` with the built constants: ≤ 3 px max deviation at (0, 1.65, 75).
- Off-axis shot from (−24, 1.65, 44): at least 8 arcs visibly separated from their planar positions (≥ 12 px).
- 0, 7 and 18 stamps (`__academy` solve hooks), day and dusk, `low` and `high`: the mark reads in all of them.
- Hub exterior ≤ 60 draw calls and ≤ 120k triangles (GDD §11). Spawn view total ≤ 400 calls.

---

## 4. Landscape spec (owner: **landscape**)

### 4.1 Replacement map

| Today (`terrain.ts`, …) | v2 | Count and placement | Build | Calls |
|---|---|---|---|---|
| 34 wind-bent pines | **Solar trees** (Solarbäume, the "trees" that make sense). Tapered white stem 3.6–6.0 m (r 0.07 → 0.16), three short alu branches at h, h−1.0 and h−1.7 m, each with a **hexagonal PV leaf** (1.7 m across corners, 0.05 m plus a bevelled ceramic edge). Carbon foot hexagon r 0.8 with a teal ring (T0). Leaves face the sun azimuth and tilt to 0.75 × (90° − sun elevation). **Control-loop life**: every 6–10 s (random per tree) a leaf "re-aims" with a damped step (overshoot 8 %, settle 1.2 s). | 28–32 trees in **groves of 3–7**, only where `freeDistance > 4`. Groves flank the Allee's outer thirds (not near the Messpunkt sightline \|x\| < 10 for z > 60), plus 2 groves per sector between spokes. | InstancedMesh: stems, branches, leaves (`[pvCell, hull]` groups), feet | 4 (+1 shadow, leaves only) |
| Heath and gravel mounds | **Flat deck.** The relief goes, the deck composite runs through, and it is broken up by *function fields* (below). | — | — | −1 |
| 46 boulders | **Cooling-air intake fields** (Kühlluft-Einlässe): flush round (Ø 6–8 m) or rounded-rectangle (6 × 9 m) alu grilles of radial or linear slats over a carbon pit, with **fans visibly turning 0.6 m below** (InstancedMesh, 0.4 rev/s) and a teal rim (T0). Plus **12 service hatches** (1.2 × 1.2 m, alu frame, flush). | 8 fields, 2 per quadrant at r 55–70 between plots; hatches along the ring path | grilles merged, fans instanced, rims merged | 3 |
| — | **Heat-exchanger fin banks** (Wärmetauscher): curved banks of vertical alu fins (0.04 × 1.5 × 0.9 m, 36 per bank over 80°) on a ceramic plinth arc with a teal foot line. They sit where the zones' machines would dump heat. | 6, one beside each spoke at r 36–40, on the counter-clockwise side | merged | 1 |
| — | **Hydroponic pods** (Hydro-Kapseln), the only greenery on the deck. A glass dome r 3.0 on a ceramic ring base (h 0.5), plants inside (`plant`), three warm grow-light bars (T0 warm by day, T1 at dusk), alu ribs. | 3, beside the plaza benches at bearings 60, 120, 240 (r 24). Bearing 300–330 stays free for FUN-PLAN's Turmsprung pad (W4, bearing ≈ 315, r ≈ 24) | base and plants merged, glass, ribs and lights | 3 |
| — | **Sensor masts** (the island measures itself): carbon masts 4–6 m with white sensor pods (LiDAR puck, GNSS dome, anemometer) and alu collars. | 12 on the rim strip between lobes (2 per gap) | instanced | 2 |
| — | **Service rovers**: unbranded 0.7 × 1.0 × 0.6 m rounded white bodies with a carbon band, four wheels, a teal eye bar and a tiny mast. They drive closed loops on the ring path and Allee edge at 0.8 m/s and stop and turn their eye bar to the player within 2.5 m. | 5 rovers | InstancedMesh body and wheels, matrices per frame | 2 |

No label claims that the PV powers flight (honesty rule). If labelled at all: DE „Hilfsstrom für Sensoren und Licht“ / EN "Auxiliary power for sensors and lights", chip `FIKTION` / `FICTION`.

### 4.2 Ground, paths, plaza, inlays (`deck.ts`, `textures.ts`)

- Deck top: `deckComposite` (3 × 1.5 m staggered panels). The brick-like pavers go.
- Allee, spokes, ring path: `deckPath` ("runway" tone) with a 0.12 m alu kerb, flush. Allee: **two teal light channels** at x = ±3.3 (exist; keep T0 by day, T1 at dusk) plus an optional **number line** for the fun designer: 26 small teal tick lights on the centreline every 2 m (values 0…25 from z 84 to 34). When the player walks over a value, the next step of the sequence draws itself in the floor as a 3 cm teal semi-ellipse between the two values (length n × 2 m along the centreline, half-width min(n × 1 m, 3.5 m) so it stays on the Allee, odd steps right and even steps left). It is a motif echo in teal, never orange, so the mark's rules don't apply. If a plaque explains it: rule from OEIS A005132 (see §8).
- Plaza: `plazaDisc` radial pattern, a teal ring inlay at r 32 (T0) and a second at r 22.5 around the bench ring.
- **Plot ring**: every lobe gets a 0.08 m teal channel at r 21.6 (zone boundary, T0 → T1), built by landscape in the plot pads.
- Spoke inlays: keep the logic (teal; orange = objective).

### 4.3 Railings (`railing.ts`)

- **Perimeter and Allee**: slim alu posts (Ø 0.08 → 0.1, every 2.4 m) carrying two stainless cables (thin cylinders r 0.008 at 0.4 and 0.75 m) and a rounded alu handrail (0.09 × 0.06 m) at 1.1 m with a **teal line on its underside** (T0 → T1). Colliders unchanged. Posts instanced; cables and rails merged per segment set. **The Allee hoop railing goes** (D5). The Recamán echo moves into the floor (§4.2).
- **Glass parapets** only at the Kanzeln, the Glasbalkon and the tower (`glassClear`).

### 4.4 Gate masts, bollards, lamps (`masts.ts`, `deck.ts`)

- **Gate pylon**: a 14 m tapered ceramic blade (0.9 → 0.5 m wide, 0.35 m deep, chamfered 0.06), carbon spine strip with the vertical sign (texts as now) behind a dark-glass inset, and a **vertical light slot** (0.06 m, the full sign height) in the zone's state colour (stone = off, teal = visited, orange = objective, T0 → T1). The beacon ring becomes a horizontal halo (torus Ø 1.6) around the blade top plus a white LiDAR puck. Instanced: blades 1, slots 1, halos as now.
- **Bollards**: 0.9 m tapered ceramic posts with a warm light slot (off by day as now, T1 at dusk). Instanced.

### 4.5 Arrival, spawn surroundings, Glasbalkon, Kanzeln (`landing.ts`, `deck.ts`)

- **Landedeck**: `deckComposite` with a docking marking: two concentric teal rings (r 8.4 and 8.7, T0 → T1) and white chevrons at the dock edge. Hazard tape stays at the dock lip only.
- **Shuttle pod**: keep the capsule; dark-glass window band, an alu cradle and teal running lights along the keel line (T0 → T1).
- **Messpunkt plate** at (0, 0, 94.5) (§3.5).
- **Map board**: a slim dark-glass totem (0.9 × 2.2 × 0.12 m, rounded) on a carbon foot, alu frame. Keep it out of the arrival frame, as now.
- **Glasbalkon / Kanzeln**: glass floor with an alu frame grid (1.5 m), glass parapet with an alu handrail and teal line.

### 4.6 Underside (`underside.ts`)

The **rock goes completely** (`buildRock`).

- **Hull** (Rumpf): a smooth fairing from the deck outline at y −4 (scaled 0.98) down to a circle r 66 at y −9, then a belly plate r 66 at −9. `hullWarm` with `panelN` and dark seams. 6 maintenance hatches and **nav lights** (steady warm white at the six lobe tips, teal belly lights at dusk). Built as a polar mesh (`geometry.ts polarMesh` plus one ring of quads). 2 calls.
- **Keel truss cone** (r 60 → 4, −4 → −60): keep the geometry, switch members to `brushedAlu`, warm node lights (T0 warm by day, T1 at dusk). The cone passes through the belly plate.
- **Thruster pods** (the dominant silhouette): duct Ø 15 m gets a `hull` shroud with an alu inner lip and a **teal duct ring light** (T0 → T1). Blades stay (36 instanced, blur disc at speed); hubs keep their orange rings (they rotate). Struts become `carbon` with alu collars.
- Cables: alu, thinner. The Regelkern glow shows through the truss at dusk.
- **Kielraum shell** (keel room built in `underside.ts`): walls become the truss with **dark-glass panes** (the cloud sea below shows through, as GDD §6.6 intends). Catwalk: perforated alu grating (`#A8A29E`, roughness 0.5). Gimbal rings: `hull` with alu bearings; axis rings stay orange (rotate). IMU sphere: polished steel with a teal sensor ring (T1). `enterInterior` ambient 0.5 → 0.6. The finale props (`finale/room.ts`, core) follow §6.0 console rules.

### 4.7 Sky dressing (`sky.ts`)

- **Blimps go.** Two **cargo multicopters** take their place: six rotors, white body and carbon arms, unbranded, 12 m span, slow transits at 300–600 m. Rotor discs show as blur sprites.
- **Prüfinseln** (inverted rock tops) become **sister platforms**: flat hexacopter-island silhouettes (a disc with six rotor bumps), one call each. At dusk six tiny teal rotor lights each. GDD §4.8 name "Prüfinseln" can stay.
- Rescue drones stay; add two **inspection drones** circling the tower at y 30–50 (existing drone code), keeping ≥ 3 m clear of the arm and the Turmsprung flight path (FUN-PLAN W4).

### 4.8 Life, fun hooks, time and budget

- **Position lights** (FUN-PLAN W2, one per Sensorkapsel): part of this language. Each is a 0.25 m lens in the rim band: `carbon` dark lens while unfound, steady teal T1 when found, never blinking. At dusk they read as a ring of lights alongside the hull nav lights (§4.6).
- **Touchable features** (FUN-PLAN W5): take them from §4.1. A sensor mast with a gust vane that turns on `island:gust`, a fin bank or intake field with a pushable test fan (kinematic spin on E), and a solar tree whose leaves you can make re-aim (E triggers the step response). No plaques with new facts.
- All animated landscape elements (rovers, fans, leaves, drones) update in one `update(dt)` and stop when the island is hidden or the player is inside a zone interior. Matrices go to InstancedMesh buffers, with no allocations per frame. On `low`: fans and leaves are static, rovers move.

---

## 5. Core spec (HUD and UI) (owner: **core**)

The DOM HUD is already on-brand (Geist / Geist Mono / Space Grotesk, glass cards, orange eyebrows, orange→teal hairline; `ui/01-pass.png`, `02-map.png`, `04-zone-card.png`). v2 makes it *the same machine* as the island:

1. **One progress truth.** `Progress` drives the Pass cover (exists), the tower sculpture (§3.4, FUN-PLAN §6) and the merged stamp banner from FUN-PLAN §5 (its text „Linie 7/18 für den Turm“ stands; it doesn't say "drawn", because the tower may hold the element as pending). The look ART-V2 adds: the banner carries a 56 px mark (`logoSvg`, existing) with the new element in `#FF6700` and the others at the Pass ghost opacity, revealed along its SVG path in 1.2 s (`stroke-dashoffset`, opacity only, no glow). While an element is pending, a small hint: DE „Schau zum Turm.“ / EN "Look at the tower."
2. **Compass**: a tower marker (the mark icon, 12 px) at the hub bearing. Zone glyphs as now; objective orange.
3. **Machined corners**: modals and info cards get a 10 px 45° corner cut at top-left and bottom-right (`clip-path` on an inner wrapper so the shadow survives), echoing the 3D chamfers and the brand's corner brackets. Toasts and small chips stay round.
4. **Telemetry strip** (optional, bottom-left, Geist Mono 11 px, `--text-3`): `LAGE 0,04° · TAKT 1000 Hz` / `ATTITUDE 0.04° · RATE 1000 Hz` from the island tilt, with a `FIKTION` / `FICTION` chip (every number carries one chip). This is "you stand on a robot" as UI.
5. **In-world screens** (zones and foyer) should look like the DOM UI: dark glass in an alu frame (§6.0), and `screenExact()` where exact colours matter (§2.6).
6. **Fixes from the review**: EMI-01 must switch to its far LOD beyond ~30 m (24 calls at 75 m today, `src/core/emi`). Kielraum finale props must hide unless the camera is below y −20 within r < 20 or in the lift (30 calls in outside views, `finale/room.ts`).
7. **Brand check tool** (`tools/brand-check.mjs`): the pixel test from §2.6, run in `shots-all`.

---

## 6. Zone specs (owners: **zones-a**, **zones-b**)

### 6.0 Common rules for all six (cheap, high impact)

- **Gameplay is untouchable**: no interactable, collider, station position, gate (local (0, 0, 22), ≥ 6 m), sightline or camera framing moves. Only skins, materials, trims, lights and *non-colliding* dressing change. Budgets stay (detail ≤ 80 calls / 90k tris, exterior ≤ 40, far ≤ 3).
- **Floors**: open-air floors use `deckComposite` or `deckPath`. Dark `carbon` floors (roughness 0.8, 1 m seams) only inside dark rooms. No brown pavers.
- **Boards and signs**: alu frame 0.06 m (chamfered), dark-glass face (`darkGlass` frame + existing screen texture), a 2 cm teal top line (T0), standing on a carbon foot or hung from a frame. No plain black slabs on sticks.
- **Consoles and plinths**: `RoundedBox` (r 0.06) `hull` body, carbon top, alu trim. Interactables keep their orange accents.
- **Station footprints**: a 4 cm teal ring inlay (T0; T1 while the station is active).
- **Interior light floor**: no interior below ambient 0.35 unless darkness *is* the lesson (Sensordom darkroom, Dunkelfabrik "Licht aus"). There, guide lights must keep walkway edges visible (floor L ≥ 0.03).
- **Far tier**: silhouettes in `hull` light tones (today many are black blobs from the Ausguck).
- **Emissives**: tiers from §2.4 only. Retune anything in the forbidden band.

### 6.1 Sensordom (zones-a)

- **Exterior**: geodesic cap panels alternate `hull` and `darkGlass` triangles (≈ 60 / 40, in bands so the visor band stays dark). By day the dome reads as an engineered sensor head instead of a black dome. Drum: `hull` with plinth reveal and alu collar. Keep the visor band and the two teal swept eyes (EMI's head). **LiDAR head**: white `shell` puck Ø 1.4 with alu ring and orange spin ring (rotates). **LiDAR fan (B2)**: shorten to 18 m, pitch −5° … −25° so it scans the deck instead of the sky, fade alpha with distance (0 at 18 m), T0 teal at 35 % opacity. Gate arch: black becomes ceramic blades with an alu lintel.
- **Interior** (dome hall): ambient 0.48 → 0.55. A warm ring light at the drum top (r 15.5, y 4.0, T1 warm). Wall panels `carbon` with vertical teal seam lines every 30° (T0). Floor grid lines at 6 % (exists, keep). Fake light pools: an additive radial floor decal under each station plus an emissive ceiling disc above it (no extra lights). **Darkroom unchanged.**

### 6.2 Regelgarten (zones-a)

- **Ground**: the dark raked gravel becomes `deckComposite` with **contour rings**: thin teal T0 circles around each balancing sculpture, showing the controller's error band as a visual metaphor.
- **Planters with icosahedron shrubs** (more "trees") become **hydroponic troughs**: glass boxes 0.9 m high in alu frames with neat plant rows (same plant geometry as the deck pods) and a warm grow-light bar on two slim posts (T0 → T1). Same footprints, same colliders.
- Weltenwand: an alu frame with a dark-glass face. Gehirn-Stapel shelf: an alu and ceramic frame with glass floor plates and teal level lines. Gyroscope sculptures stay (orange rings rotate).
- Open-air zone, no interior change.

### 6.3 Greifwerkstatt (zones-a)

- **Architecture**: add a **curved ceramic canopy** over the back half (a half-vault shell 14 m wide, 7 m high at the back, open towards the hub, local z −19.5 … −6 so it stays inside the r ≤ 22 cylinder, no colliders in the play area; clear of the giant arm's swept volume and the screen wall, which the zone owner checks). It gives the zone a silhouette from the hub and shade, which helps the arm read. 1–2 calls.
- Dark floor islands become `carbon` plates with alu edges. Hazard rings stay. KINEMATIK screen wall gets an alu frame and a carbon back. The test cabinet becomes a rounded-edge glass box (RoundedBox r 0.08, alu frame). The giant arm already speaks the language (white, orange joints); add an alu base collar.

### 6.4 Lern-Dojo (zones-b)

- **Pavilion** (D7, "carport"): the 0.6 m black roof plate becomes a thin floating `hull` roof 0.35 m with rounded edges (RoundedBox r 0.15). Carbon coffers underneath with a warm cove line (T0 → T1). Eight brown Ø 0.5 columns become slim alu Ø 0.32 with carbon feet and a teal foot ring. Skylight frame alu (the teal LED stays).
- **Demo-Wolke (B1)**: frame it as a data vitrine. A horizontal alu ring Ø 14 m at y 10.6 and a top ring at y 19.5 with six fine vertical cables. Ribbons get more segments (smooth), a constant 0.12 m width with soft end tapers, demos teal **T0 by day** (T1 at dusk) and policy ribbons orange T0. They then read as an exhibit, not a glitch, from the spawn.
- Tatami platform: ceramic with a warm edge cove. Audit wall: alu frame.

### 6.5 Dunkelfabrik (zones-b): dark, but readable

- **Exterior**: the monolith stays dark (it is the dark factory) but becomes architecture. Chamfered vertical edges (0.6 m). **Vertical heat-exchanger fins** on both side façades (alu 0.05 × 0.6 m every 0.5 m, instanced, 1 call); the purpose is the 41 °C heat. Roof equipment band: four large exhaust fans that turn (orange hub rings) and a round alu stack instead of the box chimney. Keep the **single orange status slit** and the hazard door. Forecourt `deckComposite` with the loading lane in `carbon` and teal guide lines.
- **Interior, lights on**: ceiling strips warm T1 (×1.75, today ×2.4), alu column trims, the light floor stays.
- **Interior, "Licht aus"**: ambient 0.02 → 0.04, and *the machines carry their own light*:
  - a teal T1 LED strip along every conveyor edge;
  - orange joint rings on the robots (they exist);
  - floor guide dots every 2 m along the walkway (teal T0, readable at 0.04);
  - the existing orange work lamp;
  - warm task lights on the gallery.

  Walkway edges and crates must stay readable. The point is "work happens without people", not "the screen is black".

### 6.6 Prüffeld (zones-b)

- **Vendor side stays deliberately glossy** (GDD §9.1): white runway, banners, LED wall. Polish: LED wall to T1, truss clean silver instead of black, so it reads "glossy trade fair" against EmAI's engineered side rather than "unfinished".
- **EmAI side (Messzelle)**: container becomes a `hull`/`carbon` module with rounded edges (RoundedBox r 0.12). Rails `brushedAlu` with a teal running light while the cell is pushed (gameplay feedback). Sensor mast alu with white pods. The black open frame becomes an alu gantry (round 0.25 m members) with a teal readout bar. The MESSUNG lane: carbon with teal metre ticks (exists).

---

## 7. Performance notes

| Item | Change in draw calls (main pass) | Triangles |
|---|---|---|
| Remove pines, mounds, boulders | −4 | −60k (mounds trimesh) |
| Solar trees (4), intake fields (3), fin banks (1), pods (3), sensor masts (2), rovers (2) | +15 | +45k |
| Tower: drum 3, diagrid 2, core 2, halo 3, balustrade 3, crown 5, lift 4, sculpture 5, arm 3, beam 2 (only while drawing) | ≈ 32 (today ≈ 14) | ≈ 55k (sculpture, arm and beam ≤ 40k per FUN-PLAN §6.9) |
| Underside: rock → hull | ±0 | −(rock) + 20k |
| **Fixes**: EMI-01 far LOD (−23), Kielraum hidden outside (−30), lift car merge (−6), Libelle merge (−6), shuttle pod merge (−3) | −68 | — |
| **Net** | **≈ −39** (−4 + 15 + 18 − 68): spawn 388 → ≈ 350; worst view today (underside, 524) → ≈ 485, before FUN-PLAN's own additions (capsules, particles, ≈ 3–5 calls) | within 1.5 M |

- **Shadows**: casters are the diagrid (1), the solar leaves (1) and zone buildings as now. Fans, grilles, rovers and lines don't cast. The sculpture casts nothing (it is unlit).
- **Instancing**: every repeated element above is one `InstancedMesh` (posts, leaves, stems, fins, fans, masts, rovers, ticks) with `computeBoundingSphere()` after placement. Static merges go per material (`merge()` in `util.ts`).
- **Transparency**: glass only at the Ausguck, Kanzeln, Glasbalkon, lift and three pods (≤ 8 sorted meshes). No long glass railings.
- **Low tier**: no bloom, fans and leaves static, solar leaves without shadows. Brand-exact uses the raw colours with `toneMapped: false`.
- **Load**: all procedural. Four extra 512² canvas textures (≈ 5.6 MB GPU), 0 bytes download. First load stays ≈ 1.86 MB brotli.
- **CPU**: rovers, leaves and fans ≈ 0.05 ms per frame (matrix writes only). The sculpture is static; uniforms change only during a draw.

---

## 8. New claims and strings (DE / EN, "du" form)

| Where | DE | EN | Claim and source |
|---|---|---|---|
| Messpunkt (optional) | „Messpunkt. Nur von hier ergibt die Skulptur exakt das Logo. Ein einzelnes Kamerabild verliert die Tiefe: Alles auf einem Strahl landet im selben Pixel.“ | "Measuring point. Only from here does the sculpture form the exact logo. A single camera image loses depth: everything on one ray lands on the same pixel." | Perspective projection maps all points on a ray through the camera centre to one image point. Hartley & Zisserman (2004), *Multiple View Geometry in Computer Vision*, 2nd ed., Cambridge University Press, §6.1. Chip `QUELLE` / `SOURCE`. |
| Allee number line (optional) | „a(n) = a(n−1) − n, wenn das positiv und neu ist – sonst a(n−1) + n.“ | "a(n) = a(n−1) − n if that is positive and new – otherwise a(n−1) + n." | Recamán's sequence, OEIS A005132 (Sloane, The On-Line Encyclopedia of Integer Sequences). Same definition as GDD Appendix A and the founder's `recaman.js`. |
| Pending hint (banner text itself: FUN-PLAN §5) | „Schau zum Turm.“ | "Look at the tower." | None (UI). |
| Solar trees (if labelled) | „Hilfsstrom für Sensoren und Licht“ | "Auxiliary power for sensors and lights" | None: island fiction, chip `FIKTION` / `FICTION`. No claim that PV powers flight. |
| Telemetry strip (optional) | `LAGE 0,04° · TAKT 1000 Hz` | `ATTITUDE 0.04° · RATE 1000 Hz` | Existing island fiction (Libelle readout), chip `FIKTION` / `FICTION`. |

No vendor names, no customer names, no prices, no contact data. The tower's structure (hyperboloid) gets **no** player-facing claim.

## 9. Open questions for the founder

1. **Q1:** Is the progress state of the sculpture okay, with unlit arcs in brushed aluminium (monochrome) and lit arcs in orange? Fallback (FUN-PLAN §6 default): orange at the Pass ghost opacity (0.2, raised to 0.35 only if it doesn't read at 85 m). That is closer to the Pass but less readable from the arrival.
2. **Q2:** One full golden-angle swing and collapse of the sculpture at the finale, exactly your film's move? Default is **no**: FUN-PLAN §6 and the logo manual forbid rotating or morphing the mark, and the finale uses the laser sweep instead.
3. **Q3:** Sun azimuth 295° → 255°, so the tower's south face is lit in the arrival view?
4. **Q4:** Mark size: R 10.5 m (fits the new tower) or up to 11.5 m (closer to today's 12 m)?
5. **Q5:** Solar trees as the replacement for the pines, given the honesty rule (no claim that they power the island)?

## 10. Evidence index

- Current build: `artifacts/phase4/art/diag/01-title.png` … `59-dusk-ausguck.png`, contact sheets in `diag/sheets/`; HUD in `artifacts/phase4/art/ui/`.
- Prototype: `artifacts/phase4/art/proto/main.js` (scene), `run.mjs` (own static server on a free port plus Playwright; closes itself), `drift.mjs` (anamorphic drift), `grade.mjs` (grade model and brand-exact solve); renders `spawn-day-7arcs.png`, `offaxis-day.png`, `side-day.png`, `north-day.png`, `spawn-dusk-17arcs.png`, `offaxis-dusk.png`, `aerial-dusk.png`, `allee-solar-grove-day.png`, `allee-solar-grove-dusk.png`, `allee-railing-day.png`, `compare-spawn-before-after.jpg`.
- Founder's film frames: `artifacts/phase4/art/recaman/founder-film-frames.jpg` (from the founder's exported logo film).
- Known prototype limits: the solar-leaf orientation in the prototype is approximate (leaves sometimes edge-on); the spec in §4.1 is authoritative. The prototype's deck roughness 0.62 shows the glare that §2.3 forbids.
