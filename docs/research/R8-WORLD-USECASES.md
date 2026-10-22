# R8 · The region around the grounded island: real use cases, led by the Sonnenacker

Phase 7 research, topic R8. Baseline: release candidate 4 (tag `rc4`, founder-approved). Date: 2026-10-17. This report changes no code. It designs the land around the docked island: an agrivoltaic tomato farm run by SO-101 arms (the founder's idea), five smaller real use cases, the region layout, the art rules and a frame budget. External facts cite the sources table (§8, all accessed 2026-10-17) as [Sx]. Numbers I computed are marked **eigene Rechnung**. Anything I could not check is marked **unverified**. Scratch files: `artifacts/phase7/world-usecases/` (a PDF text extractor and keyword search, run with `python3 -I`). Downloads: `artifacts/phase7/downloads/r8-*` (PDFs only, read as data).

Fit with the sibling reports: **R5** (`R5-LIFTOFF.md`, concept A „Trockendock 3“) sets the site: a coastal plateau, the deck flush with the ground, a cloud bank at +330…+390 m that ends ≈ 900 m WNW over the sea, cloud shade on the land beyond ≈ 251 m ESE, and an apron with cranes to r ≈ 400 m. This report keeps all of that and puts the region *into* it (§4.1). **R1** owns the SO-101 and VLA teaching in the Lern-Dojo. The farm uses that arm in the field and does not teach VLA again (§2.8). **R6** owns the quest spine („Startklar“, stars → robots) [S50]. **R7** owns model conversion and licences. A life and easter-egg teammate (scratch `artifacts/phase7/life-eastereggs/`) owns the global ambient-life systems. Here I only place region-specific life and eggs (§4.5).

---

## 0. In one screen

1. **The farm works, but the honest version is a demonstrator, not a business.** Agri-PV over farmland is real and measured. At the Heggelbach pilot one field produced 186 % "land use" in the hot summer of 2018 (103 % potatoes + 83 % electricity) [S1, S5]. Tomatoes, though, like light: in greenhouses, 1 % less light costs about 0.7–1 % of the fruit yield [S14]. In an Almería greenhouse, 30 % shade cost 15 % of the tomato yield [S15]. Shade *helps* tomatoes only where heat and drought are the problem: in Arizona the cherry-tomato yield under panels doubled [S13]. **The farm's lesson is therefore "the roof decides the harvest". It is not "solar always helps".**
2. **Tomato-picking robots are still hard.** Over 30 years of research robots, the average was 66 % harvest success at 33 s per fruit, and none of the 50 robots reviewed was commercialised [S17]. Newer systems report 86.67 % at 32.46 s in commercial greenhouses [S20]. A pepper robot reached 61 % under "best-fit" crop conditions but only 18 % under normal ones [S19]. They fail on hidden fruit, on ripeness and on the stem cut.
3. **The SO-101 can pick a cherry tomato, but it cannot work a greenhouse.** Its reach is ≈ 0.41 m. Its payload is ≈ 190 g at stall with the arm stretched, and 0 g at rated torque [S26]. The parts for one follower arm cost $121.94 (US list) [S25]. That is enough for cherry tomatoes in **raised beds planted for the robot**: two rows at the bed edges, low leaves removed, one arm per edge on a rail carriage. It is not enough for trusses, high-wire crops or 20-hour shifts. Commercial systems use 6-axis industrial arms on pipe-rail carts [S19].
4. **The Sonnenacker** (DE) / **Sun Field** (EN) is a full outdoor zone with three stations. **A „Reif oder nicht?“**: teach ripeness with the USDA colour classes, then beat the shade, because red looks darker under the panels. **B „Licht teilen“**: set the roof between crop light and electricity, predict the result, and check it against DIN SPEC 91434. **C „Erntetag“ ◆**: prepare the beds, run one fully automated day and answer the calls for help. The measured value is the harvest success with n = 60 and a Wilson interval. The lesson is „Vollautomatisch heißt nicht menschenleer.“
5. **Five more sites, each one real use case in 1–3 minutes:** Kreislaufhof (recycling sort + repair), Unkrautacker (three ways to weed without herbicide), Holzbau-Werkhof (robot-built timber shell), Windkamm (blade repair robot), Dorf (parcel rovers). Each one has one lesson and a real reference. None of these vendors publishes a usable 3D model, so these sites use **generic procedural machines**, never look-alikes. Real models appear only where the licence allows them: SO-101, LeKiwi and Open Duck (Apache-2.0).
6. **The region fits R5's dock.** The sunny west half, between the dock and the cliff 600 m WNW, is the green land: farm, fields, cliff path, wind rise. The east half, in the cloud shade, is R5's shipyard apron with two warm-lit halls. A field railway with six stops on the six zone bearings (a hexagon around the dock) and four jump pads from the Kanzeln link it all. Each Kanzel and the Glasbalkon looks down on one site.
7. **Budget.** On the ground: region ≤ 140 draws / ≤ 550 k triangles / ≤ 1.5 ms CPU. Seen from the island or during the lift-off: ≤ 30 draws / ≤ 120 k triangles. That keeps the worst island view at ≈ 300 draws / ≈ 1.2 M triangles, inside the GDD gate (500 / 1.5 M) but above R5's own target (270 / 1.05 M), see §4.7. First load: +0 bytes, because the region chunk loads after the title. Real models load lazily: SO-101 0.22 MB brotli [S27].
8. **Two conflicts to settle (§6).** R5 currently keeps the player on the island („gate at the bridge head“), and ground content is unreachable after the lift-off. The founder's follow-up wants use cases "in the area". **Recommendation:** the bridge gate opens with the first rotor online, every region star can be earned before the lift-off, and after the ending the title offers „Im Dock weiterspielen“ (the docked state with all progress kept).

---

## 1. What the research says

### 1.1 Agri-PV: definitions and rules (Germany)

| Item | Fact | Source |
|---|---|---|
| What counts as Agri-PV | DIN SPEC 91434 (published 2021) distinguishes **Category I** "overhead PV with vertical clearance > 2.1 m", with farming *under* the modules, and **Category II** "interspace PV with vertical clearance < 2.1 m", with farming *between* the rows | [S2 Table 01, S6] |
| Primary use stays farming | Agricultural yield must reach **≥ 66 %** of the reference yield. Land lost to the installation may be at most **10 %** (Cat. I) or **15 %** (Cat. II) of the project area. Light availability, homogeneity and water must suit the crop | [S6] (consistent across Fraunhofer ISE slides and trade sources; **DIN full text not read**) |
| Legal weight | A DIN SPEC is not law. It matters only where legislation refers to it | [S6] |
| Building law | §35 (1) No. 9 BauGB privileges "besondere Solaranlagen" next to a farm: ≤ 25,000 m² (2.5 ha) of footprint, one installation per farm site, in spatial connection with the farm | [S7] (verified on gesetze-im-internet.de) |
| EEG tender segment | Solarpaket I (2024) created a sub-segment for "besondere Solaranlagen". Per a state energy agency, its EU state-aid approval was still pending in January 2026 | [S8] **unverified** (the PDF could not be read; current status unknown). The game should not quote EEG tariffs |
| Costs | LCOE of Agri-PV 7–12 ct/kWh, "competitive with other renewable energy sources" (Fraunhofer ISE). For the first research plant (Heggelbach): 8–15 ct/kWh vs. ground-mounted PV 6 ct/kWh and roof PV 11 ct/kWh, "possibly not comparable with new plants". Own use pays: buying at 14–16 ct/kWh while generating at 7 ct/kWh saves 7–9 ct/kWh | [S3, S5, S2] |
| Potential and scale | ≈ 4 % of Germany's arable land would give ≈ 500 GW (2021). Worldwide installed Agri-PV grew from ≈ 5 MWp (2012) to ≥ 14 GWp (2021) | [S4, S2] |

### 1.2 Results: land equivalent ratio, shade, water, pilot sites

LER (land equivalent ratio) = crop yield under Agri-PV ÷ crop yield on the reference field + electricity ÷ electricity of a PV-only plant on the same area. LER > 1 means the shared field beats splitting it [S5].

| Finding | Value | Conditions | Source |
|---|---|---|---|
| Heggelbach LER 2017 / 2018 | **160 % / 186 %** | Lake Constance, Demeter farm, 194 kWp on ≈ 0.3 ha, 720 bifacial modules at 5 m clearance; 2018 was a hot, dry summer | [S1, S2] |
| Heggelbach 2018 breakdown | 255.26 vs 230.02 dt/ha potatoes (+11 %, minus 8 % area loss = 103 %); 249,857 vs 301,032 kWh (83 %) → 1.86 | one crop, one year | [S5] |
| Heggelbach light and crops 2018 | PAR ≈ 30 % lower under the roof. Celery +12 %, winter wheat +3 %, clover grass −8 %. Specific yield 1,285.3 kWh/kWp | same | [S1] |
| Tomato light rule of thumb | 1 % more light → **0.7–1 %** more yield for fruit vegetables (tomato, cucumber, pepper); the effect is larger in winter and at low light | Dutch greenhouses (literature survey and grower data) | [S14] |
| Tomato under shade, greenhouse | 30 % / 50 % shading → **−15 % / −26 %** yield; the PV revenue could more than offset it | Almería plastic greenhouse, checkerboard shading that mimics PV | [S15] (abstract-level; publisher page blocked) |
| Tomato under shade, temperate field | Yield fell as shading rose; water productivity rose under deficit irrigation | Oregon, 2021 | [S16] **unverified detail** |
| Tomato under shade, drylands | Cherry-tomato production **twice as great** under PV; soil moisture ≈ 15 % higher; jalapeño with 65 % less transpirational water loss | Arizona, Biosphere 2, 2019 | [S13] |
| Tomato in development cooperation | "up to 40 percent yield increase of tomatoes and cotton" from reduced evaporation | Maharashtra, India (Fraunhofer ISE study) | [S2] |
| Water and plant protection (orchard) | Kressbronn apples: **−50 %** irrigation, **−70 %** plant-protection products on the covered area, **+20 %** more electricity than simulated (likely evaporative cooling) | interim results, Lake Constance | [S9] |
| Irrigation in general | "reducing irrigation demand by up to 20 percent"; rainwater can be collected from the modules | Fraunhofer guideline | [S2] |
| Cleaning | In Germany "the regular rainfall" keeps module cleaning costs manageable. Worldwide, soiling costs 3–5 % of annual PV energy (≈ €3–5 bn) | | [S2, S31] |

**Real pilot sites that match the farm's idea:**

| Site | What is there | Why it matters for the game | Source |
|---|---|---|---|
| Morschenich-Alt, Rheinisches Revier („Ort der Zukunft“) | ≈ 2 ha; tracked vs. fixed modules; irrigation with rainwater collection and storage; 300 kW, 810 bifacial modules; **phenotyping robots**, irrigation and battery buffer listed as uses | Agri-PV plus robots plus water: the closest real "automated" Agri-PV research site | [S12, S2] |
| Oberkirch-Nussbach (Obsthof Vollmer) | Tracked rows: **half follow plant-physiological criteria, half are sun-optimised** | Exactly the choice of station B | [S9] |
| University of Freiburg pilot (opened 20 May 2026) | **Strawberries in raised beds between PV modules**; sensors compare light, temperature and soil moisture with an unshaded reference | Raised beds under PV are being researched right now | [S11] |
| Fraunhofer ISE + VOEN, Ravensburg (2025) | Light modules < 5 kg/m², 420 kW/ha, on existing hail-net structures over two 40 m rows of cherry trees | PV can sit on light weather-protection frames | [S10] |
| Ankara PV greenhouse (2022) | Tests tomatoes, peppers and lettuce under PV | Tomato Agri-PV is still a research question | [S2] |

### 1.3 Tomato harvesting robots today

| System | Type | Reported | Conditions / caveat | Source |
|---|---|---|---|---|
| 50 research robots (review) | various high-value crops | averages: localisation 85 %, detachment 75 %, **harvest 66 %**, fruit damage 5 %, peduncle damage 45 %, **cycle 33 s**; no improvement in three decades; none commercialised | few indicators reported (e.g. harvest success in 11 of 50 projects) | [S17, S18] |
| What would pay (sweet pepper, NL) | requirement study | robot may cost **≤ €196 k at 6 s per fruit, 20 h/day, 95 % success**; at 20 s per fruit ≤ €59 k | 2011 assumptions; currency symbol reconstructed from PDF text | [S18] (Hemming et al. 2011 as cited) |
| SWEEPER (pepper, 2020) | 6-axis industrial arm on a pipe-rail cart, RGB-D | **61 % best-fit crop conditions, 18 % current conditions**; 24 s per fruit, ≈ 50 % of it logistics; 262 fruits over 4 weeks | commercial greenhouse | [S19] |
| Earlier pepper robot | same group | 6 % / 2 % harvest success; **26 % / 33 % after removing occluding leaves**; 94 s per fruit | the crop itself caused much of the failure | [S18] |
| AHPPEBot (tomato, 2024) | phenotyping + pose estimation | **86.67 %**, 32.46 s per successful harvest | commercial greenhouses; trial count not in the abstract | [S20] |
| Panasonic prototype (2017/18) | camera + range sensor + AI | target "10 tomatoes per minute" | "still very much under development"; vendor statement | [S21] |
| GRoW (MetoMotion) | two arms, truss tomatoes | **90 %** of a complete row, no human intervention (one trial, 2020); EU project goal: −80 % labour, harvest cost halved | vendor/project claims | [S23] |
| Four Growers GR-100 | greenhouse tomatoes | 43 kg/h "(12 g fruit)", "98 % Ripe", 24/7 | **vendor, inconsistent**: 4 stereo cameras on one page, 8 on the other | [S22] |

**Where they fail (and what the game shows):**

| Failure | Evidence | Game mechanic |
|---|---|---|
| Hidden fruit (occlusion by leaves and stems) | "Occlusions make it difficult to detect and localize the fruit, to determine ripeness …"; removing leaves raised success from 6 % to 26 % [S18] | Visibility classes in C, deleafing as the human's job, a hidden tomato as an easter egg |
| Ripeness judgement | ripeness has a formal colour standard with six classes [S24]; colour changes with light | Station A, the shade trap |
| Stem (peduncle) cut | 45 % peduncle damage on average [S17] | Damage counter in C, a "Stielbruch" album entry |
| Crop not built for robots | 61 % vs 18 % depending on crop conditions [S19]; "simplifying the task" is challenge no. 1 [S17] | The raised beds are planted for the robot (§2.1) |
| Speed | 24–33 s per fruit vs 6 s needed to pay [S17–S19] | Entscheider cost card (§2.6) |

### 1.4 What the SO-101 can and cannot do here

| Question | SO-101 (real) | What a commercial picker uses | Source |
|---|---|---|---|
| Reach | ≈ 0.41 m shoulder axis → grasp point; ≈ 0.44 m horizontally from the base | metres, via a cart on rails plus a lift | [S26] (eigene Rechnung, URDF), [S19] |
| Payload | no official figure; arm stretched: 0 g at rated torque, ≈ 190 g at 16.5 kg·cm stall, ≈ 520 g with the 12 V servos at stall. One cherry tomato ≈ 12 g (vendor footnote) | industrial arms | [S26], [S22] |
| Gripper | two-jaw (fixed + moving jaw), no cutter | custom end effectors (cutting, vacuum) | [S26], [S19] |
| Sensing | wrist camera (in the Menagerie model) plus whatever you add | RGB-D, multiple stereo cameras | [S26], [S19, S22] |
| Price | $121.94 parts for one follower arm (US list, without printing); leader + follower kit $229.88 | not published | [S25] |
| Power | 5 V supply (7.4 V servos) or 12 V 5 A+ (12 V servos) | — | [S25] |
| Software | LeRobot datasets and VLAs (SmolVLA, π0, GR00T …) | proprietary | [S26] |
| Data | **no public SO-101 tomato-harvest dataset found** (closest: a 102-episode SO-101 banana pick-and-place set) | proprietary | [S53] (search 2026-10-17) |
| Licence of the model | Apache-2.0 (URDF + STL), attribution line in R7's pipeline | — | [S25, S27] |
| Open alternative for raised beds | FarmBot Genesis: an open-source gantry over a bed of up to 1.5 × 3 m (XL 3 × 6 m), plants up to 0.5 m tall; "100% Open-Source" CAD and BOM. Its tasks (seeding, watering, weeding) are **unverified** here; a 0.5 m plant limit rules out staked tomatoes | — | [S29] (CAD licence not confirmed, so used as a reference only) |

**Realistic for the SO-101:** a raised-bed **demonstrator**, cherry or bush tomatoes, one arm per bed edge on a rail carriage with a short lift, single fruit (no trusses), ripeness by camera, the gripper twisting the fruit off at the knuckle (an assumption; no SO-101 measurement found), slow and supervised, a classroom or community-garden scale. **Not realistic:** high-wire greenhouse tomatoes 2–4 m tall, trusses of several hundred grams, a cutting tool without a new end effector, 20-hour shifts with unattended servos, or a cost case against a person (§2.6). The game says so on station C's card.

---

## 2. The Sonnenacker: the playable farm

### 2.1 Concept and layout

One shared roof, two harvests, run by machines and still looked after by people. The farm sits in the **sunlit west** of the region (R5's cloud shade ends ≈ 251 m ESE), so the low WNW sun (295°, 16°) grazes under the panels and lights the beds. The farm is the region's hero site.

| Element | Spec (metres) | Why |
|---|---|---|
| Site | ≈ 150 × 100 m (1.5 ha) at bearing ≈ 255°, 250–400 m from the island centre | Under the 2.5 ha of §35 BauGB [S7]; inside the sunlit band |
| Sonnendach A (play block) | 36 × 14 m, **clearance 2.6 m** (DIN Cat. I > 2.1 m [S6]), 6 single-axis rows of bifacial modules tracking east–west; carbon-dark `pvCell` on alu frames | Tracking parts rotate, so their hubs may carry orange (GDD §9.2) |
| Hochbeete under A | 6 beds, 1.0 × 30 m, 0.85 m high, warm-grey timber sides; **two tomato rows at 0.25 m from each long edge**; bush or cherry varieties (assumption) | "Plant for the robot": every fruit is within ≈ 0.4 m of an edge rail |
| SO-101 carriages | 2 per bed (one per edge), 12 in A. Each is a generic EmAI rail carriage with a 0.6 m lift; the arm is the **real SO-101**, printed in shell white with carbon servos (it is a 3D-printed arm, so the print colour is the builder's choice) | Real model, Apache-2.0 [S25] |
| Sonnendach B | the same, ambient only (6 arms at far LOD) | Scale and life without cost |
| Referenzbeete | 3 beds without a roof, labelled „Referenz“ | Real sites always keep an unshaded reference [S11] |
| Water | Module gutters → ceramic cistern → drip lines; soil-moisture stakes with teal tips | Rain collection [S2, S12] |
| Crate rover | 1–2 real **LeKiwi** (open mobile base, Apache-2.0, URDF included [S28]) carrying a small tray of crates along the 1.8 m paths | Real open robot; it carries trays, not heavy crates |
| Hummelkästen | 2 bumblebee boxes on posts | Greenhouse tomatoes are pollinated by bumblebees since the 1980s [S30] |
| Hofladen | Timber shed with the dashboard wall (station C), honesty shelf, a faceless figure (stone-700, as in the Dunkelfabrik) | Where people still work |
| Tagesmodell | 1:20 table model of block A with its own small sun lamp (station B) | Plays a whole day **without touching the world's fixed golden hour** |
| Hedge and flower strip | along the N and W edges | Believable, functional greenery |

### 2.2 Stations

| | A „Reif oder nicht?“ / "Ripe or not?" (Probieren) | B „Licht teilen“ / "Share the light" (Verstehen) | C „Erntetag“ ◆ / "Harvest day" (Messen) |
|---|---|---|---|
| You do | Look through the SO-101 wrist camera. Sort 20 tomatoes into „pflücken / warten“ (USDA classes Light red + Red → pick; Green … Pink → wait [S24]). The arm learns and is tested on 40 fruits. Then the same test runs **under the panels**, where red looks darker and accuracy drops. Fix it by placing a colour reference card in view (calibration) and run again | At the table model: choose the roof (module density 3 steps, tracking policy „Sonne zuerst“ / „Pflanze zuerst“ / „Schutzstellung bei Hagel“). Predict the tomato yield first („Erst tippen, dann messen“). A season runs in 20 s: crop light %, tomato yield %, kWh, LER, DIN check. A hail front crosses mid-season | Prepare the day: deleaf rows (walk the bed, E on leaf clusters: the human's job), choose the harvest window (morning / midday stripes / evening), and decide the order. Then the **automated day** runs on the real beds in ≈ 90 s: 12 arms pick, the LeKiwi carries trays, the dashboard counts. Calls for help pop up (jammed gripper, fruit behind a stem, bumblebee box to swap, a tray blocking a path); you run there and press E within 10 s |
| Measured value | accuracy k/40 with Wilson 95 % interval, sun vs. shade | tomato yield and LER **as a band** from the light rule's 0.7–1.0 (§2.3) | harvest success k/60 with Wilson 95 %; fruit damage; median and IQR of cycle time; autonomous share; kWh produced vs. used; water vs. reference bed |
| ★ | 20 taught, test run done | a DIN-conform roof (crop band ≥ 66 %) | the day completed (≥ 1 full tray) |
| ★★ | ≥ 36/40 under the panels (Wilson [77–96 %]) | LER band ≥ 1.5 with crop band ≥ 70 % | Wilson lower bound ≥ 70 % (≥ 49/60, [70–89 %]) |
| ★★★ | calibration found before the second shaded test | prediction within ±5 points of the measured centre | also ≤ 2 damaged fruits and every call answered ≤ 10 s |
| Chips | SIM · LIVE (your test); QUELLE (USDA classes) | SIM · LIVE (model); RICHTWERT (light rule, Heggelbach anchor); FIKTION (hail event) | SIM · LIVE; QUELLE (research comparison); ILLUSTRATIV (pick model) |
| One-line lesson (≤ 14 words) | „Farbe allein lügt bei anderem Licht. Kalibrieren schlägt Raten.“ / "Colour alone lies under different light. Calibrating beats guessing." | „Tomaten lieben Licht. Hier lohnt das Dach als Schutz und Eigenstrom.“ / "Tomatoes love light. Here the roof pays as shelter and own power." | „Vollautomatisch heißt nicht menschenleer. Menschen planen, pflegen, reparieren.“ / "Fully automated does not mean nobody. People plan, tend, repair." |

Stars rate your play (labelling, calibration, prediction, preparation and response), never the robot.

### 2.3 Models behind the numbers (all in the SIM; anchors are cited)

| Model | Formula / rule | Anchors |
|---|---|---|
| Crop light T | T = light under the roof ÷ open field; density step 1/2/3 → T ≈ 0.85 / 0.70 / 0.55; „Pflanze zuerst“ +0.05 T in flowering and fruit set, −5 % electricity | Heggelbach geometry gives PAR −30 %, i.e. T ≈ 0.70 [S1]; the tracking policy split as at Nussbach [S9] |
| Tomato yield | Y_crop = 1 − s · (1 − T), s ∈ [0.7, 1.0] → shown as a band | light rule for fruit vegetables [S14]. Check: T 0.70 → 70–79 %. Almería measured 85 % at 30 % *roof cover* [S15]; the light at the plants drops less than the cover, so the band is on the cautious side |
| Electricity | Y_el = 0.83 · (1 − T) / 0.30, capped at 1.0 | 83 % at Heggelbach geometry [S5] |
| LER | Y_crop + Y_el (eigene Rechnung: T 0.85 → 1.27–1.31; **T 0.70 → 1.53–1.62**; T 0.55 → 1.55–1.69, but the crop band 55–69 % falls below 66 % → DIN fails). The densest roof has the highest LER and is still not allowed: „LER allein reicht nicht – die Norm schützt die Ernte.“ | [S5, S6] |
| Hail | if not in „Schutzstellung“, the season loses a FIKTION share of its fruit | PV can protect against hail [S2]; no number used |
| Pick success | p = p_vis · p_ripe(A) · p_window; p_vis: free 0.85, half hidden 0.55, hidden 0.10 (ILLUSTRATIV); deleafing moves fruit from "half" to "free"; the midday stripe light lowers p_ripe unless A was calibrated | 86.67 % in greenhouses [S20], 61 % vs 18 % by crop condition [S19], leaves removed 6 % → 26 % [S18] |
| Damage | 3 % base, +2 % per mis-calibrated grip (ILLUSTRATIV) | 5 % average fruit damage [S17] |
| Cycle time | median ≈ 25 s with spread (ILLUSTRATIV) | 24 s [S19], 32.46 s [S20], 33 s [S17] |
| Dashboard energy | block A ≈ 504 m² × ≈ 600 kWp/ha ≈ 30 kWp → ≈ 39 MWh/a at 1,285 kWh/kWp ≈ **106 kWh/day** on average. 12 arms × ≤ 60 W × 14 h ≤ **10 kWh/day** (upper bound from the 12 V 5 A supply) → the robots use **under a tenth** of the roof's power | eigene Rechnung from [S1, S2, S25]; chip RICHTWERT |

### 2.4 Flow, minute by minute

**Entdecker (≈ 11 min):**

| Time | Beat |
|---|---|
| 0:00 | The field railway stops at „Sonnenacker“. Modules turn with a soft motor hum, arms nod as they pick, a tray of tomatoes rolls down a wooden chute into a crate, bumblebees hum. EMI-08 (base pitch 800 Hz: EMI-01 520 Hz + 40 Hz per unit, GDD §10.2): „Willkommen auf dem Sonnenacker. Hier wachsen Tomaten und Strom auf derselben Fläche.“ |
| 0:40 | **A** at bed 1: wrist-camera view, 20 labels with 1/2 (≈ 60 s), test in the sun (≈ 15 s) |
| 2:00 | The same test under the panels: accuracy drops, EMI hints at the card, place it (F, grab verb), re-test → stamp A |
| 3:30 | **B** at the table model: predict, set the roof, run the season (20 s), hail front, read LER and the DIN check, one retry (R) → stamp B |
| 6:30 | **C** setup: deleaf two rows (≈ 40 s), choose the window, start |
| 7:30 | The automated day (≈ 90 s) with 3–5 calls for help; you run between the beds |
| 9:00 | Result banner: k/60 [Wilson], damage, cycle time, autonomous share, kWh produced vs. used, water saved vs. the reference bed; „Wo du gebraucht wurdest“ list → stamp C |
| 9:45 | Free: find the hidden tomato (§4.5), watch the Open Duck cross the path (R2's duck as a guest), take the railway on |

**Entscheider (≈ 6 min):** B with the economics overlay (LCOE, own use, DIN, BauGB; 2 min) → C (3 min) → the cost card „Was darf der Ernteroboter kosten?“ (1 min). A is optional.

### 2.5 Where the human is still needed (shown at the end of C)

| Task | Why not the robot (today) | Source / chip |
|---|---|---|
| Deleafing, pruning, tying | fine work on living plants; it also makes the fruit visible for the robot | [S18] |
| Pollination | bumblebees replaced electric vibrating wands in greenhouses from the mid-1980s | [S30] |
| Plant health checks, decisions on what to grow | judgement, responsibility | ILLUSTRATIV |
| Fixing a jammed gripper, a worn servo | maintenance of a low-cost arm | SIM |
| Fruit the arm cannot see or reach | occlusion, reach ≈ 0.41 m | [S18, S26] |
| Selling, cooking, eating together | it is the point of a farm | — |
| Context for Entscheider | 28 % of Germany's farm workforce (242,800 of 875,900, 2022/23) were seasonal workers | [S43] |

### 2.6 Entscheider cards

| Card | Content | Chips |
|---|---|---|
| „Was darf der Ernteroboter kosten?“ | Anchor: a pepper robot may cost ≤ €196 k at 6 s per fruit, 20 h/day and 95 % success, ≤ €59 k at 20 s [S18]. Scaling inversely with cycle time and linearly with success (eigene Rechnung): research average (33 s, 66 %) → **≈ €25 k**; SWEEPER (24 s, 61 %) → ≈ €31 k; AHPPEBot (32 s, 87 %) → ≈ €33 k. „Erst die Zykluszeit, dann die Quote.“ | QUELLE + RICHTWERT |
| „Rechnet sich das Dach?“ | Agri-PV 7–12 ct/kWh vs. ground-mounted PV (Heggelbach comparison 6 ct/kWh) [S3, S5]; own use saves 7–9 ct/kWh [S2]; hofnah ≤ 2.5 ha privileged [S7]; EEG segment status uncertain [S8] | QUELLE |
| „Brauchen wir einen Putzroboter?“ | Soiling costs 3–5 % worldwide [S31]; in Germany the rain does most of the work [S2]: „Hier eher nicht. In der Wüste schon.“ | QUELLE |
| „Messung statt Marketing“ | The same robot type: 61 % vs 18 % depending on crop conditions [S19]. Ask: which crop, which light, how many fruits, which cycle time? | QUELLE |

### 2.7 Player text (DE default, EN; „du“)

| Where | DE | EN |
|---|---|---|
| EMI-08 arrival | „Willkommen auf dem Sonnenacker. Hier wachsen Tomaten und Strom auf derselben Fläche.“ | "Welcome to the Sun Field. Tomatoes and electricity grow on the same land here." |
| A intro | „Bring dem Arm bei, was reif heißt. Er sieht nur Farbe – du siehst mehr.“ | "Teach the arm what ripe means. It only sees colour; you see more." |
| A shade | „Unter dem Dach sieht Rot dunkler aus. Gib der Kamera eine Farbkarte.“ | "Under the roof, red looks darker. Give the camera a colour card." |
| B intro | „Ein Dach, zwei Ernten. Wie viel Licht bekommen die Tomaten, wie viel der Strom?“ | "One roof, two harvests. How much light goes to the tomatoes, how much to power?" |
| B rule | „Die Norm verlangt: Mindestens zwei Drittel der Ernte bleiben.“ | "The standard demands that at least two thirds of the harvest remain." |
| B Entscheider | „Agri-PV rechnet sich hier zuerst über Eigenstrom und Schutz, nicht über Tomaten.“ | "Here, agrivoltaics pays first through own power and shelter, not tomatoes." |
| C intro | „Heute läuft alles allein. Fast. Schau, wann jemand gebraucht wird.“ | "Today everything runs by itself. Almost. Watch when someone is needed." |
| C call | „Arm 7 klemmt. Kannst du kurz hin?“ | "Arm 7 is stuck. Can you go over?" |
| C Entscheider | „Rechne mit gemessener Quote und Zykluszeit, nicht mit der Vorführung.“ | "Calculate with the measured rate and cycle time, not with the demo." |
| Card: SO-101 honest | „Ein Lernarm für 122 Dollar Teile. Gut für Kirschtomaten im Hochbeet, nicht fürs Gewächshaus.“ | "A learning arm for 122 dollars in parts. Good for cherry tomatoes in raised beds, not for greenhouses." |
| Hummeln | „Bestäuben machen hier Hummeln. Gärtnereien setzen sie seit den 1980ern ein.“ | "Bumblebees do the pollinating here. Growers have used them since the 1980s." |

All lines are ≤ 2 sentences and ≤ 19 words (text-audit rules).

### 2.8 Tie-in with R1 (SO-101 VLA) without duplication

| R1 / Lern-Dojo teaches | The Sonnenacker adds | Rule |
|---|---|---|
| Demonstration, datasets, VLA, words as commands; the twist that a policy ignores a word that never varied | **Deployment**: the same arm in a field with shade stripes, leaves and ripeness classes; the lesson is about perception under different light and about preparing the crop | The farm never trains a VLA and never repeats the "word" twist |
| Leader/follower teleop | No teleop at the farm (the arms work alone); your hands do the deleafing | Different verb |
| Statistics (Wilson) lightly | C uses the Wilson band like every ◆ station | Reuse `ctx.game`, no new lesson on statistics |
| — | If 04 B was stamped, the farm's dashboard shows „Policy aus dem Lern-Dojo: aktiv“ (cosmetic; SIM) | One flag, no coupling |

Also: R6's "grab verb unused" (F-09) is used here twice (colour card, hidden tomato). R5's flight-system slots could get a non-gating line „Bordküche: Tomaten vom Sonnenacker“ on the pre-flight checklist.

### 2.9 Fun hooks and failure moments

- **The tomato chute:** each pick drops into a tray, and full trays roll down a timber chute into a crate with a wooden "tock". The sound is the progress bar of C.
- **The arm nod:** a 0.2 s wrist bob after a good pick; a slow "head shake" after a miss.
- **Matsch:** a damaged fruit splats (soft, no gore) and joins the album as „Zu fest gegriffen“.
- **The hail front:** a grey band crosses the table model, the real modules swing into protection with a chorus of motors. If you chose „Sonne zuerst“, you hear hail on the leaves.
- **The race:** calls for help come in pairs, so you have to choose which to answer first.
- **The second look:** after C, the farm keeps running on its own whenever you come back.

### 2.10 Assets and budget for the site

| Asset | Source | Licence | Budget |
|---|---|---|---|
| SO-101 | R7 pipeline from TheRobotStudio URDF/STL | Apache-2.0 [S25] | LOD0 24,078 tris / 7 draws, LOD1 6,496 tris [S27]; a LOD2 ≤ 1.5 k needed (R7). At most **1 arm at LOD0** (the one in A), ≤ 5 at LOD1 within 12 m, the rest LOD2; per-link `InstancedMesh` → ≤ 3 × 7 draws for all arms |
| LeKiwi | GitHub URDF + meshes | Apache-2.0 [S28] | ≤ 8 k tris, ≤ 4 draws; R7 to convert |
| Open Duck (guest) | R2 / R7 | Apache-2.0 (R2) | 1 at a time, lazy |
| Plants, tomatoes, modules, beds, frames | procedural | own | plants as instanced leaf clusters ≈ 120 tris × 160; tomatoes 20 tris × ≤ 800 visible; modules 1 instanced draw |
| **Site detail total** | | | **≤ 70 draws, ≤ 130 k tris, ≤ 2 local lights, CPU update ≤ 1.0 ms** (12 arms × 6 joints is ≈ 4 µs per the life bench [S51]) |

---

## 3. Five more use cases

Rule for all five: **no vendor publishes a usable 3D model, so each site uses generic procedural machines that do not look like any product.** The vendor's name appears only in the source chip or the Entscheider card (with HERSTELLERANGABE where it is a vendor claim). EMI-09 („Revier-EMI“) roams between the five, so there is one more EMI, not five.

| Site | Real use case | Player time | Measured value (n, interval) | The one lesson (DE / EN, ≤ 14 words) |
|---|---|---|---|---|
| **Kreislaufhof** (E, in the cloud shade) | recycling sort robots + repair and disassembly | 3 min (2 scenes) | purity and recovery on n = 100 items (Wilson) | „Reinheit kostet Ausbeute. Der Schwellwert ist eine Entscheidung.“ / "Purity costs yield. The threshold is a decision." |
| **Unkrautacker** (NW, sun) | weeding without herbicide: mapped mechanical, camera spot spray, laser | 2 min | weeds removed and crop damaged on n = 50 plants; energy and area per hour | „Ohne Gift geht. Jede Methode zahlt anders: Zeit, Energie oder Präzision.“ / "No poison needed. Each method pays in time, energy or precision." |
| **Holzbau-Werkhof** (SE, cloud shade) | robot-fabricated timber shells | 2 min | time per segment (median of n = 6); kg of timber per m² | „Rechnen plus Roboter: dreißig Meter Spannweite mit wenig Holz.“ / "Computation plus robots: thirty metres of span with little wood." |
| **Windkamm** (N, sun) | blade repair robots instead of rope access | 1.5 min | working hours in a 7-day weather series (RICHTWERT) | „Roboter holen Menschen vom Seil. Ein Wetterfenster brauchen auch sie.“ / "Robots take people off the rope. They still need a weather window." |
| **Dorf** (S, sun) | sidewalk parcel rovers | 1.5 min | help calls per 100 trips (Wilson on the share of trips) | „Zähl die Hilferufe pro hundert Fahrten, nicht die gelungene Vorführung.“ / "Count help calls per hundred trips, not the successful demo." |

### 3.1 Kreislaufhof: sort it, then repair it

| | |
|---|---|
| You see | A hall with warm work light (it stands in the cloud shade). A conveyor of mixed packaging, a camera arch, and a generic delta picker that grabs items into bins. Next to it, a repair bench where an SO-101 sorts screws into trays while a faceless figure lifts a glued battery |
| You do | Scene 1 (90 s): set the picker's **confidence threshold**. A high threshold gives clean bins but lets items through; a low one catches more but mixes the bins. 100 items run, and you read purity and recovery. Scene 2 (60 s): take apart a device that is screwed (the SO-101 helps) and one that is glued (it cannot), then sort the parts |
| Real reference | AMP Robotics: up to **140 picks/min peak, 120 sustained** on one robot (2021, vendor) [S32]. E-waste: **62 Mt** in 2022, only **22.3 %** documented as properly collected and recycled, **US$62 bn** of resources unaccounted for [S33]. EU right to repair, Directive (EU) 2024/1799, applies from **31 July 2026** [S34]. KIT AgiProbot (2019–2024): mobile learning robots disassembling e-motors for reuse [S35] |
| 3D model | none from the vendors → procedural delta picker; the real SO-101 at the repair bench (Apache-2.0) |
| Entscheider | „Sortierroboter rechnen sich an Bändern, die rund um die Uhr laufen. Reparierbarkeit entscheidet das Design, nicht der Roboter.“ (the second sentence is a principle, not a measured number) |
| Budget | detail ≤ 40 draws / ≤ 70 k tris; ≤ 30 kinematic items on the belt (no physics bodies) |

### 3.2 Unkrautacker: three ways to weed

| | |
|---|---|
| You see | Three lanes in a vegetable field next to a sheep pasture with vertical bifacial PV fences (DIN Cat. II; pasture is a listed use [S2]). Lane 1: a slow, solar-roofed robot that sowed every seed itself and hoes everything that is not on its map. Lane 2: a camera boom that sprays single weeds with a tiny jet. Lane 3: a tractor-towed laser unit |
| You do | Choose the method for three field conditions (dry and clean, wet and weedy, crop just emerged), then watch 50 plants each and read weeds left, crop damaged, energy, area per hour |
| Real reference | Mapped mechanical (FarmDroid FD20): RTK-GPS, **no optical vision**, ≈ 6.5 ha/day, up to 24 h on solar and battery, €75–97 k (FAO) [S36]. Spot spray (Ecorobotix ARA): 6 × 6 cm footprint, "up to 95 %" less herbicide (vendor), 1,000 units in > 30 countries [S37]. Laser (Carbon Robotics, 2022 launch): 30 × 150 W CO₂ lasers, ≈ 2 acres/h (≈ 4.5 kW laser power, eigene Rechnung) [S38] **unverified** |
| 3D model | none → generic procedural machines; sheep instanced |
| Entscheider | „Kein Gift heißt nicht kostenlos: Der eine braucht Zeit, der andere Strom, der dritte gute Kameras.“ |
| Budget | detail ≤ 30 draws / ≤ 60 k tris (crop rows as instanced cards) |

### 3.3 Holzbau-Werkhof: robots build with wood

| | |
|---|---|
| You see | Under a timber shell made of hollow cassettes, two generic industrial arms on a container base glue and mill the next segment. Finished segments stand ready |
| You do | Order 6 segments for a small shell so the joints close (a 60 s spatial puzzle); the arms assemble each one in game-time while a figure checks the fit |
| Real reference | BUGA Wood Pavilion 2019 (University of Stuttgart ICD/ITKE): **376** hollow segments, **30 m** column-free span, **38 kg/m²**, robot assembly ≈ **8 min** + milling 20–40 min per segment, assembled on site in **10 working days by two craftsmen**, designed for disassembly and reuse [S42] |
| 3D model | the real pavilion is architecture, not a product; a generic shell with the same logic (not a replica). The arms are generic |
| Extra role | The shell is the site's landmark from the island and a candidate hall for later content (on the ground; mind R5's constraint) |
| Budget | detail ≤ 30 draws / ≤ 60 k tris (cassette shell instanced) |

### 3.4 Windkamm: off the rope

| | |
|---|---|
| You see | Three turbines on a low rise north of the island. A generic blade crawler sits on the nearest one, with a rope team's van parked below |
| You do | A 7-day weather strip (wind per hour): plan the leading-edge repair with the rope team or the robot, and see how many hours each can work |
| Real reference | Conventional repair of a 55 m blade on a 2 MW turbine: **5–9 days**; work stops at **8–12 m/s** (ENGIE, 2026) [S39]. Vendor claims for the robot ("3–6× faster", works up to 15 m/s) [S40] **unverified** → HERSTELLERANGABE chip |
| 3D model | none → generic crawler; turbines generic (3 blades, instanced rotor) |
| Budget | detail ≤ 20 draws / ≤ 40 k tris; turbines double as far landmarks (§4.4) |

### 3.5 Dorf: the parcel rover

| | |
|---|---|
| You see | A small village around the railway stop: green roofs, timber façades, PV on the south faces, a bakery, a parcel locker. Small six-wheeled rovers roll along the pavements |
| You do | Follow one rover for one trip. When it is stuck (a bike across the pavement, a building-site fence), you are the remote helper in a top-down view and choose a path. The dashboard runs 100 trips and counts the help calls |
| Real reference | Starship: **> 8 million** autonomous deliveries, 2,000+ robots, 150+ locations in six countries, ≈ 125,000 road crossings per day (vendor, 17 April 2025) [S41] |
| 3D model | none → a generic rover with four wheels and a timber lid, deliberately unlike any vendor's design |
| Budget | detail ≤ 30 draws / ≤ 50 k tris; 4 rovers instanced |

### 3.6 Considered and not built

| Idea | Why not (now) |
|---|---|
| Care / assistance robots | Ethically rich and easily shallow in a 2-minute scene; EMI and the showroom cover assistance better |
| 3D-printed concrete houses | Timber shell already shows construction robots, and with less grey mass |
| Water treatment | No robot story with a clear lesson and a source |
| PV cleaning robot as its own site | One card at the farm is enough (§2.6): in Germany the rain does most of the cleaning |
| Drone inspection | Drones already fly on the island (`sky.ts`); the Windkamm covers inspection and repair |

---

## 4. The region

### 4.1 Where the island rests (aligned with R5)

| Element | R5 (concept A) | R8 adds |
|---|---|---|
| Dock | gear-shaped dry dock, deck flush with the ground, keel block at −66, 13 m bridge on the Allee axis to the apron (z ≈ 114) | — |
| Apron | plateau ring to r ≈ 400 m: concrete, two gantry cranes, hangars | Keep it in the **east half** (bearings ≈ 30–170°, in the cloud shade) as „die Werft“. The **west half** beyond r ≈ 140 becomes green land |
| Coast | cliff ≈ 600 m WNW, sea at y −20 to the far plane, sun glitter at 295° | cliff path and lookout; offshore wind silhouettes at 4–8 km WNW |
| Cloud bank | +330 … +390 m, ends ≈ 900 m WNW; shade beyond ≈ 251 m ESE | Sites in the sun: farm, fields, wind, village. Sites in the shade: the two halls with warm light (light as information, ART-V2 rule 3) |
| Hills | low ESE silhouettes | wind rise in the N, low hills E |
| Access | the player cannot leave the island (gate at the bridge head) | **Change:** the gate opens when the first rotor is online (§6 Q1) |
| Optional backstory | — | The plateau is reclaimed mining land and Trockendock 3 is the last pit (real references: Agri-PV at Morschenich-Alt next to the former open-pit region [S12]; the Rhineland lignite exit moved to 2030 [S46]; Ferropolis, where five mining machines became a museum after mining stopped in 1991 [S47]). Founder's call (§6 Q4) |

Shade check (eigene Rechnung, bearing vector (sin b, −cos b) as in GDD §4.1): a point is in R5's cloud shade when its projection onto bearing 115° exceeds 251 m. Farm (−290, 60): −237 → sun. Village (−45, 256): 67 → sun. Unkrautacker (−230, −260): −318 → sun. Wind T1 / T2 (150, −420) / (300, −520): −42 / 52 → sun. Kreislaufhof (340, −40): 291 → shade. Holzbau (230, 230): 306 → shade. All sites lie inland of the cliff (projection onto 295° < 600 m; the Klippenblick at 511 m is the closest).

### 4.2 Map (schematic; the coordinate table is authoritative)

```
                                           N (−z)
 ~~~~~~~~~~~~~~~~~~~~/                      T3 ^               ^ T2     WINDKAMM: 3 turbines
 ~~~~~~~~~~~~~~~~~~~/   coast path                    ^ T1 ◄── blade robot scene
 ~~~~ SEA ~~~~~~~~~/                                  |
 ~~~~ (y −20) ~~~~/     UNKRAUTACKER                  | path
 ~~~~~~~~~~~~~~~~/      ≡≡ lanes ≡≡  ‖‖ sheep  (F3)··········(F4)
 ~~~~~~~~~~~~~~~/       vertical PV fences     ·                ·            ,  ,  ,  ,  ,
 ~~ cliff ~~ K /  Klippenblick                ·  K300 .-~~~-. K60 ·        ,  cloud shade  ,
 ~~~~~~~~~~~~~/                              ·       /  DOCK  \     ·     ,  (R5: > 251 m ESE)
 ~~~~~~~~~~~~/  SONNENACKER [A▤▤▤][B▤▤▤]  (F2)      |  ISLAND  |     (F5)  KREISLAUFHOF   ,
 ~~~~~~~~~~~/   beds, cistern, Hofladen      ·      \ r ≈ 106 /     ·   , WERFT (R5 apron) ,
 ~~~~~~~~~~/    Referenzbeete, Hummeln        ·  K240 '-~+~-' K120 ·   ,  cranes, hangars ,
 ~~~~~~~~~/                                    ·        | bridge  ·  ,   ,   ,   ,   ,   ,
 ~~~~~~~~/                                     (F1)·····|······(F6)  HOLZBAU-WERKHOF  ,
 ~~~~~~~/                                  DORF + BAHNHOF            timber shell   ,  ,
 ~~~~~~/                                   parcel rovers, bakery   ,   ,   ,   ,   ,
                                           S (+z)
 Legend: (Fn) field-railway stop on a zone bearing   ····· railway hexagon (vertices r = 240 m)
         K = Kanzel with a jump pad down   ~ sea   , cloud shade   ▤ Sonnendach (Agri-PV roof over raised beds)
```

| Site / element | Centre (x, z) m | Bearing, distance | Size (m) | Light | Rail stop (bearing) | Seen best from |
|---|---|---|---|---|---|---|
| Island (dock) | (0, 0) | — | r ≈ 106 | sun | — | — |
| Dorf + Bahnhof | (−45, 256) | 190°, 260 m | 120 × 80 | sun | F1 (210°, behind 06 Prüffeld) | Landedeck |
| Sonnenacker | (−290, 60) | 258°, 296 m | 150 × 100 | sun | F2 (270°, behind 01 Sensordom) | K240 |
| Unkrautacker + pasture | (−230, −260) | 318°, 347 m | 200 × 150 | sun | F3 (330°, behind 02 Regelgarten) | K300 |
| Klippenblick | (−480, −180) | 291°, 513 m | lookout | sun | walk from F2 or F3 | K300 |
| Windkamm T1 / T2 / T3 | (150, −420) / (300, −520) / (0, −600) | 20° / 30° / 0°, 446–600 m | rotor Ø ≈ 80 (generic) | sun | F4 (30°, behind 03 Greifwerkstatt) + 214 m path | Glasbalkon, K60 |
| Kreislaufhof | (340, −40) | 83°, 342 m | hall 60 × 30 | shade | F5 (90°, behind 04 Lern-Dojo) | K60 |
| Holzbau-Werkhof | (230, 230) | 135°, 325 m | shell Ø 30 | shade | F6 (150°, behind 05 Dunkelfabrik) | K120 |
| Walkable boundary | r ≤ 650 m (cliff W, wind rise N, hedges and the Werft fence E and S) | | | | | |

The stops sit on the six zone bearings at r = 240 m, so each stop lies behind "its" lobe, and several fit their zone's verb: the farm's camera ripeness test behind SEHEN, the Kreislaufhof (robots that learn disassembly from people [S35]) behind LERNEN, the Holzbau hall behind ARBEITEN, and the help-call count in the village behind MESSEN.

### 4.3 How the player travels

| Mode | Spec | Time (eigene Rechnung) | Note |
|---|---|---|---|
| Walk / sprint | 4.5 / 8 m/s (GDD §4.1) on field paths | bridge → farm ≈ 230 m: 51 s walking, 29 s sprinting | Fine for one site, too slow for a tour |
| **Field railway („Feldbahn“)** | one open two-car tram on a hexagonal loop (vertices r = 240 m on the six zone bearings, side 240 m, ≈ 1.44 km; closest to the dock 208 m), 6 stops, 12 m/s, timber and ceramic cars with a PV roof; you board with E and can look around | 20 s between neighbouring stops; full loop 2 min moving, ≈ 3 min with 10 s stops | A moving viewing platform. Its timetable runs even when you are not aboard (life) |
| Jump pads at the Kanzeln | 4 pads at K60/K120/K240/K300 (r ≈ 88), ballistic hop of ≈ 60 m onto a ground pad at r ≈ 150 on the same bearing, T ≈ 3 s | instant out-trip; back via the railway or the bridge | Each Kanzel is the viewpoint and the launch to "its" site; the existing pad code (GDD §4.6) with new parameters |
| Fast travel | map (M): any **visited** rail stop | — | Unlocked after the first ride |
| Not added | cars, flying taxis, zip lines | — | Too fantasy or too costly |

### 4.4 Sightlines: from the island and during the lift-off

| Viewpoint | Sees | Distance | Tier shown |
|---|---|---|---|
| Bridge head (start) | the island; behind you, the village roofs and the railway | 0–260 m | village exterior |
| Kanzel 240 / 300 / 60 / 120 | Sonnenacker / Unkrautacker / Windkamm / Holzbau + Kreislaufhof | 200–550 m | exterior (≤ 250 m) or far |
| Ausguck (+44) | the whole region; the railway loop as a ring; sea and offshore wind WNW; the cloud edge | to 3 km | far (proxies + impostors) |
| Lift-off 0–330 m (R5: t ≈ 22–61 s) | the region from above. The railway is a hexagon around the dock, its six stops on the six lobe bearings. Agri-PV rows read as dark stripes over green, the timber shell as a pale disc. The lit sites you visited glow warm | 0–2 km below | far tier, impostors; ≤ 30 draws |
| In the slab (61–67 s) and above it | the region is hidden; only the coast and sea beyond the cloud edge stay visible | > 900 m | sea and far ring only |

The region has to read well for the ≈ 40 s of climb below the cloud base (R5 timeline: eye enters the slab at h ≈ 284 m, t = 61 s). That is the moment the founder asked for ("see the whole region from above").

### 4.5 Life in the world and easter eggs (region only)

**Ambient life (each item cheap, always purposeful):**

| Item | Behaviour | Cost (from the life bench [S51] where measured) |
|---|---|---|
| Field railway | runs its loop, stops 10 s at each stop, bell | 3 draws, 1 spline follower |
| SO-101s and LeKiwi at the farm | pick and carry all day, even when you are not playing | counted in the farm (§2.10) |
| Bumblebees | ≈ 40 particles around the boxes and the flower strip, soft hum | 1 draw |
| Sheep under the vertical PV | 12 instanced, graze and wander, flock to shade | 1–2 draws; ≪ 0.1 ms |
| Birds | one flock of 24–48 over the fields and the cliff | 1 draw; 2.4–8.7 µs per frame (boids) |
| Parcel rovers | 4 on the village loop | 2 draws |
| Wind turbines | rotors turn slowly (they rotate, so their hubs may carry orange) | 2 draws (instanced) |
| People | ≈ 8 faceless figures (stone-700, as in the Dunkelfabrik) at work: a gardener deleafing, a mechanic at the rover, two people at the bakery | 1 draw, idle loops |
| Water | ripples on the cistern and the drip lines, waves at the cliff | ≤ 2 draws |

**Region-specific easter eggs (to merge into the global list):**

| Egg | How you find it | Payoff | Honesty |
|---|---|---|---|
| **Die Tomate im Schatten** | One perfectly ripe tomato in bed 4 hides behind leaves; the arm passes it every cycle. Pick it by hand (F) | Album entry „Verdeckt“; EMI: „Die hat der Arm nie gesehen. Blätter davor – du warst schlauer.“ | Occlusion is the main failure [S18] |
| **Recamán im Acker** | If you finished the Unkrautacker, the mapped sowing robot plants a row pattern of tangent semicircles | visible only from the air during the lift-off | A motif echo in crop green, **not** the mark (GDD §9.8) |
| **Kleingedrucktes** | A village billboard: „100 % autonom!“. Walk close and the small print appears: „* bei Sonne, ohne Blätter, auf dem Testfeld“ | a smile, and the Prüffeld's lesson in one line | 61 % vs 18 % [S19] |
| **Der letzte Diesel** | An old tractor at the Hofladen, now a planter, plaque „Außer Dienst“ | photo spot | FIKTION chip |
| **Ente trifft Schaf** | R2's Open Duck sometimes walks the pasture; the sheep follow it in a line | pure joy | — |
| **Sechs Haltestellen** | Ride the whole loop once | the map draws the hexagon, links each stop to the lobe in front of it and labels it „sechs Rotoren, sechs Haltestellen“ | — |
| **Hummelhotel** | Look into a bumblebee box with E | EMI line on pollination | [S30] |

### 4.6 Art direction: solarpunk, but believable (2030s)

**The idea in one line:** the island stays the *machine*, white and engineered (ART-V2). The ground is the *garden it serves*: real technology built into a cared-for landscape. Green lives on the ground, light lines stay on the machines.

| Rule | Do | Don't |
|---|---|---|
| 1. Only technology that exists or is close | PV (mono/bifacial, semi-transparent on canopies, vertical fences), 3-blade turbines, light rail, heat pumps, battery containers, CLT/glulam timber, green roofs, rain gardens, cisterns, drip irrigation | floating cities, glowing plants, holograms, crystal towers, trees grown into buildings, flying cars |
| 2. Green is managed and useful | crops, hedges, orchards, flower strips, pasture, reed at the cistern | jungle overgrowth, moss on everything, ruins reclaimed by nature |
| 3. Materials | weathered (silver-grey) larch, light glulam, clay plaster in stone tones, ceramic tiles, alu frames, carbon-dark PV glass | shiny chrome, white plastic everywhere, rusty steampunk, Art Nouveau curls |
| 4. Palette (new ground tokens, all warm-neutral) | `soil` #857A6C · `grassDry` #A39C7A · `grassGreen` #6F7A50 · `crop` #5F7046 (existing `plant`) · `timberSilver` #9A9188 · `timberFresh` #B9A68A · `clay` #B08A72 (roofs only, ≤ 3 % of the screen) · `water` #5E6B66 (green-grey) | saturated greens, blue water, rainbow flowers, neon |
| 5. Orange stays the signal (≤ 5 %) | joint rings of moving machines, the objective beacon, the hazard tape at the bridge | orange roofs, orange crops. **Ripe tomatoes must read deep red (≈ #B5332A), not brand orange** |
| 6. Teal = data | soil-moisture stake tips, the rail's stop markers, the SO-101 camera ring | teal lights on houses or plants |
| 7. Light | the fixed golden hour; warm work light in the shaded halls; dusk windows in the village | street-lamp clutter, day/night cycle in the world (the farm's day plays on the table model) |
| 8. People | a few faceless figures at work, consistent with the zones | crowds, faces, brand clothing |
| 9. Scale ladder (ground) | person 1.75, bed 0.85, Sonnendach 2.6–3.4, village houses 2–3 storeys (≤ 12 m), timber shell ≤ 12 m, turbines the only tall things | skyscrapers, megastructures |
| 10. Every object has a job | it grows, powers, stores, carries, repairs or shelters | decorative sci-fi props |

### 4.7 Performance budget for the ground world

Starting point: rc4's worst survey view is 238 draws / 0.90 M triangles; the GDD gate is 500 / 1.5 M at 60 fps, and the typical view should stay ≤ 350 draws [S52]. R5 budgets its ground module (apron, sea, hills, slab) at ≤ 20 draws / ≤ 150 k triangles and targets ≤ 270 / ≤ 1.05 M for the worst view [S49].

**The region is a set of "sites" with their own tiers.** These are not island zones: the zone contract fixes plots at r ≤ 22 m, so the region needs a small site API in the engine (detail ≤ 60 m, exterior ≤ 250 m, far beyond), built like the zone tiers.

| Scope | Main-pass draws | Triangles | Shadow casters | CPU per frame (1×) | Memory / download |
|---|---|---|---|---|---|
| Terrain: geo-clipmap, 6 rings, 1 material, procedural height + authored splines | ≤ 8 | ≤ 160 k | 0 (receives) | ≤ 0.2 ms | heightfield 1025² float = 4 MB RAM; 0 bytes download |
| Vegetation, crops: instanced, 2 LODs + impostor cards | ≤ 16 | ≤ 150 k | ≤ 8 (near trees) | ≤ 0.2 ms | impostor atlas 1024² canvas ≈ 5.6 MB GPU |
| One site in detail (only one at a time) | ≤ 70 (farm) / ≤ 40 (others) | ≤ 130 k / ≤ 70 k | ≤ 20 | ≤ 1.0 ms | real models lazy: SO-101 0.22 MB br [S27], LeKiwi ≤ 0.3 MB (estimate) |
| Other sites, exterior (≤ 250 m) | ≤ 8 each, ≤ 24 total | ≤ 15 k each | landmark only | ≤ 0.1 ms each | — |
| Sites, far (> 250 m) | ≤ 2 each | ≤ 3 k each | 0 | 0 | — |
| Rail, paths, fences, lamps (merged / instanced) | ≤ 8 | ≤ 40 k | 0 | ≤ 0.05 ms | — |
| Ambient life (§4.5) | ≤ 10 | ≤ 30 k | 0 | ≤ 0.3 ms | — |
| Far ring (offshore wind, hills, villages as impostors) | ≤ 4 | ≤ 20 k | 0 | 0 | — |
| **Region, worst ground view** | **≤ 140** | **≤ 550 k** | **≤ 40** | **≤ 1.5 ms** | — |
| Island seen from the ground (zones far, hub exterior; underside hidden by the dock) | ≈ 80 (to measure) | ≈ 0.2 M (to measure) | — | — | — |
| **Region seen from the island / lift-off** (far tier + impostors only) | **≤ 30** | **≤ 120 k** | ≤ 4 | ≤ 0.3 ms | — |
| Worst island view incl. region | ≈ 300 (GDD gate 500; R5 target 270) | ≈ 1.2 M (gate 1.5 M; R5 target 1.05 M) | — | — | — |
| First load | — | — | — | — | **+0** (the region chunk, ≤ 120 KB br, loads after the title; title stays 1.68 MB) |

**Rules that make this hold:**

1. **Fog for the ground.** The fog factor is 1 − exp(−(density · d)²) (three.js `fog_fragment`). At rc4's density 0.0015 (`src/core/Environment.ts`) a site 500 m away is ≈ 43 % fogged and 1 km ≈ 89 %, so the region would vanish. Suggested ground density **0.0007**: 300 m → 4 %, 1 km → 39 %, 2 km → 86 %, 3 km (far plane) → 99 % (eigene Rechnung [S48]). R5 owns the environment, so this is an input for R5's sky.
2. **Only one site in detail.** The sites are ≥ 250 m apart, so the detail radius of 60 m never covers two.
3. **No new textures to download.** Field patterns, soil and timber are procedural canvas or shader noise (the house rule: no image textures apart from the brand SVGs).
4. **Physics:** a Rapier heightfield of 501² cells at 2 m for the walkable ≈ 1 km² (≈ 1 MB); ≤ 400 static colliders; ≤ 30 dynamic bodies at the active site; vegetation has no colliders except tree trunks near paths.
5. **Streaming:** sites build in sections with `ctx.yield()` after the title; real models load when you come within 150 m of their site or when the browser is idle; nothing is unloaded during a session (the total is small).
6. **GPU risk:** R5 already reports a tight 4K GPU margin at the plaza (4.43 ms vs 4.5 ms). The terrain and vegetation shaders must be cheap (no parallax, one splat lookup), and `gpu-ab.mjs` must be measured before the art lock.
7. **Audio:** ≤ 8 region voices (railway, bees, sheep, wind, servos, crates), distance-attenuated like the zone bus.

---

## 5. Learning goals

**Entdecker: what a player should take home about a good future with robots**

| Theme | Understand | Where it is felt |
|---|---|---|
| Energy | A field can grow food *and* power, and together it can give more than splitting it (LER > 1), but only when the roof suits the crop. Renewables already make 55.1 % of Germany's gross electricity use (2025) [S44] | Sonnenacker B; the dashboard |
| Food | Robots can pick some fruit, slowly, if people plant for them. Light, leaves and ripeness decide | Sonnenacker A and C |
| Work | Robots take the repetitive, dangerous or heavy part (rope work, night shifts, bending over beds). People plan, tend, repair and decide. „Roboter übernehmen die harte Arbeit, Menschen das Denken.“ (the house line from the Dunkelfabrik) | C's "where you were needed" list; Windkamm |
| Resources | What is screwed can be repaired, what is sorted can be reused, what is computed needs less material. Precision replaces poison | Kreislaufhof, Unkrautacker, Holzbau |
| Honesty | Every number has a condition: crop, light, n, cycle time | every site's banner and chips |

**Entscheider takeaways: where automation pays and where it doesn't (yet)**

| Case | Pays when | Doesn't (yet) when | Evidence |
|---|---|---|---|
| Agri-PV over crops | own use of the power, crop protection (hail, heat, drought), shade-tolerant or heat-stressed crops; ≤ 2.5 ha next to the farm is privileged | light-hungry crops in a temperate climate as the main income; tariffs unclear | [S2, S3, S5, S7, S8, S13, S14] |
| Fruit-picking robots | cycle ≈ 6 s, ≥ 95 % success, ≈ 20 h/day, a crop and greenhouse designed for robots | average research values (33 s, 66 %) → the robot may cost only ≈ €25 k (eigene Rechnung) | [S17, S18] |
| Low-cost arms (SO-101) | teaching, prototyping, data collection, demonstrators | production, heavy or high reach | [S25, S26] |
| Sorting robots | belts that run around the clock with known material streams | low volumes, unknown mixes | [S32] |
| Precision weeding | high-value vegetables, organic farms, rising herbicide limits | large arable fields where speed per hectare rules | [S36–S38] |
| Blade repair robots | many turbines, short weather windows, safety | severe damage beyond the robot's scope | [S39, S40] |
| Rule for all | Compare the measured rate under *your* conditions with the post that stays empty, over several years (GDD's Dunkelfabrik rule) | a demo under best-fit conditions | [S19] |

---

## 6. Questions for the founder

| # | Question | Options | Recommended | Why |
|---|---|---|---|---|
| Q1 | When can you leave the island? (R5 keeps the gate at the bridge head closed) | (a) from the start · (b) when the first rotor is online · (c) only after all six | **(b)** | The first minutes stay focused on the onboarding; the region is a reward that opens early, so it is reachable long before the lift-off |
| Q2 | After the lift-off the ground is unreachable (R5 constraint). What about free roam? | (a) title option „Im Dock weiterspielen“ (the docked state with all progress) · (b) R5's STRETCH „Landen / Starten“ on the Ausguck · (c) the region is pre-flight only | **(a)**, (b) later | Cheapest honest answer: the island can be "back in the dock"; all region stars are earnable before the lift-off anyway |
| Q3 | Is the Sonnenacker a full zone (3 stamps, ◆ station) or a side site? | (a) full outdoor zone with stamps that count for the Pass (not for the rotors) · (b) side site with stars only | **(a)** | It is the founder's use case and the deepest site; keeping it out of the rotor gate keeps R5/R6's "six lobes = six rotors" |
| Q4 | Backstory of the plateau | (a) neutral coastal plateau (R5) · (b) reclaimed mining land, the dock in the last pit | **(b)** | It tells "how we get a nice future" in the landscape itself, with real references [S12, S46, S47]. It costs only a plaque, the terraces and the old machine |
| Q5 | Vendor names in player text for the five generic sites | (a) only in source chips and Entscheider cards · (b) also in EMI lines | **(a)** | The machines are generic, so a vendor name in a line would turn them into look-alikes |
| Q6 | Name of the region | „Das Revier“ · „Werkland“ · „Unterland“ · something else | „Das Revier“ (if Q4 b) | Short, German, true to the backstory |

---

## 7. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| R5 conflict (gate, post-lift-off) | Region content not reachable or lost after the ending | Q1/Q2; a `grounded` state flag that the title can restore |
| Frame budget at island views | worst view ≈ 300 / 1.2 M exceeds R5's own target (270 / 1.05 M) | region from the island = impostors only (≤ 30 draws); if needed ≤ 10 draws / ≤ 40 k by baking the region into 2–3 impostor rings |
| Spawn draw target (Phase 6: world ≤ 110 at the spawn) | rc4 86 + R5 ground ≤ 20 + region ≤ 30 ≈ 136 at the bridge head | merge the terrain into R5's ground module and keep the region at the spawn to ≤ 4 impostor draws, or the founder raises the target; measure with `drawcalls.mjs` |
| 4K GPU margin (R5: 4.43 / 4.5 ms) | terrain + vegetation push the plaza over the gate | cheap terrain shader, fog hides the far ring, measure with `gpu-ab.mjs` early |
| Scope | 6 sites + railway + farm = the size of 2–3 zones | build order: terrain + railway + Sonnenacker first; Kreislaufhof and Unkrautacker next; Windkamm, Dorf and Holzbau as light scenes |
| "Solarpunk" drifts into fantasy | loses the founder's "not too much" | §4.6 rules plus an art review against them |
| Honesty: tomato Agri-PV oversold | players learn "solar always helps crops" | B's band and the Arizona-vs-Almería card |
| SO-101 shown as a farm product | overclaims a learning arm | the honest SO-101 card (§2.7), RICHTWERT chips |
| Vendor claims as facts | marketing in a "Messung statt Marketing" game | HERSTELLERANGABE chip, inconsistent vendor data named as such (e.g. 4 vs 8 cameras [S22]) |
| Licences | FarmBot's open CAD [S29] has no confirmed licence here; LeKiwi meshes need R7's check | use FarmBot only as a reference; LeKiwi through R7's licence gate |
| Legal facts age (EEG segment) | outdated statement in the game | no EEG tariffs in player text; BauGB and DIN facts only, with dates |

---

## 8. Sources (all accessed 2026-10-17)

"Fetched" = I read the page or extracted the PDF text myself. "Search only" = seen in a search summary, not on the page itself (treat as unverified).

| # | Source | Supports | URL | Status |
|---|---|---|---|---|
| S1 | Fraunhofer ISE press release, „Agrophotovoltaik: Hohe Ernteerträge im Hitzesommer“ (2019) | LER 160 % / 186 %; crop changes; PAR −30 %; 194 kW, 5 m, 0.3 ha; 1,285.3 kWh/kWp | https://www.ise.fraunhofer.de/de/presse-und-medien/presseinformationen/2019/agrophotovoltaik-hohe-ernteertraege-im-hitzesommer.html | fetched |
| S2 | Fraunhofer ISE, *Agrivoltaics: Opportunities for Agriculture and the Energy Transition*, 3rd ed., Feb 2024 | DIN categories (Table 01); 720 bifacial modules; 14 GWp (2021); irrigation −20 %; rainwater; cleaning in Germany; tomato +40 % (Maharashtra); own-use savings; Morschenich-Alt 300 kW / phenotyping robots; Ankara PV greenhouse; pasture uses; hail protection; "swarm farming" | https://www.ise.fraunhofer.de/content/dam/ise/en/documents/publications/studies/APV-Guideline.pdf | fetched (PDF text) |
| S3 | Fraunhofer ISE, guideline landing page | LCOE 7–12 ct/kWh | https://www.ise.fraunhofer.de/en/publications/studies/agrivoltaics-opportunities-for-agriculture-and-the-energy-transition.html | fetched |
| S4 | Fraunhofer ISE press release, 22 Feb 2021 | ≈ 500 GW; ≈ 4 % of arable land | https://www.ise.fraunhofer.de/en/press-media/press-releases/2021/dual-yield-on-arable-land-guideline-for-agrivoltaics-published.html | fetched |
| S5 | J. Kalmbach (Fraunhofer ISE), slides, DVS online event 10 Oct 2023 | LER 2018 breakdown (103 % + 83 %); LCOE 8–15 / 6 / 11 ct/kWh | https://www.dvs-gap-netzwerk.de/fileadmin/Redaktion/Seiten/Service/Veranstaltungen/2023/Agri-PV/Vortraege/Jana_Kalmbach_-_Fraunhofer_FREIGEGEBEN.pdf | fetched (PDF text) |
| S6 | DIN SPEC 91434:2021-05; requirements as summarised by Fraunhofer ISE (AFT session slides, 2022) | Cat. I/II, ≥ 66 %, ≤ 10 % / 15 %, not law | https://www.din.de/en/wdc-beuth:din21:337886742 · https://farmlandinfo.org/wp-content/uploads/sites/2/2022/04/AFT_Fraunhofer_ISE_Special-Session-on-Agrivoltaics_Introduction-Research-Ag-Aspects_4.7.2022.pdf | secondary; DIN full text not read |
| S7 | §35 BauGB | (1) No. 9: ≤ 25,000 m², one installation per farm site | https://www.gesetze-im-internet.de/bbaug/__35.html | fetched |
| S8 | Energieagentur Rheinland-Pfalz, Infopapier Agri-PV Teil 1 (22 Jan 2026) | Solarpaket I segment awaiting EU state-aid approval | https://www.energieagentur.rlp.de/fileadmin/user_upload/erneuerbare_energien/20260122_Infopapier_Agri-PV_Teil_1.pdf | search only (PDF unreadable) |
| S9 | Fraunhofer ISE press release, Modellregion Agri-PV BW, 12 Apr 2024 | Kressbronn −70 % / −50 % / +20 %; Nussbach tracking split | https://www.ise.fraunhofer.de/de/presse-und-medien/presseinformationen/2024/modellregion-agri-photovoltaik-baden-wuerttemberg-synergieeffekte-der-doppelten-flaechennutzung.html | fetched |
| S10 | Fraunhofer ISE press release, Agri-PV with weather protection, 7 Apr 2025 | < 5 kg/m², 420 kW/ha, cherry trees, 40 m rows | https://www.ise.fraunhofer.de/content/dam/ise/de/documents/presseinformationen/2025/0925_ISE_d_PI_Agri-Photovoltaik-in-Kombination-mit-Witterungsschutz.pdf | fetched (PDF text) |
| S11 | University of Freiburg news, pilot plant inaugurated 20 May 2026 | strawberries in raised beds between PV modules; unshaded reference | https://news.vm.uni-freiburg.de/en/newsarchive/new-pilot-plant-combines-solar-power-generation-with-agriculture | fetched |
| S12 | Fraunhofer ISE news, first Agri-PV research plant in the Rheinisches Revier, 29 Oct 2021 | Morschenich-Alt, ≈ 2 ha, tracked vs fixed, rainwater storage | https://www.ise.fraunhofer.de/de/presse-und-medien/news/2021/erste-agri-pv-forschungs-und-demonstrationsanlage-im-rheinischen-revier.html | fetched |
| S13 | University of Arizona news, 2 Sep 2019, on Barron-Gafford et al., *Nature Sustainability* 2, 848–855 | tomato ×2, chiltepin ×3, soil moisture +15 %, jalapeño −65 % transpiration | https://news.arizona.edu/news/agrivoltaics-proves-mutually-beneficial-across-food-water-energy-nexus · paper: https://doi.org/10.1038/s41893-019-0364-5 | news fetched; paper paywalled |
| S14 | Marcelis et al. (2006), *Acta Horticulturae* 711, 97–103 | 1 % light → 0.7–1 % yield (fruit vegetables) | https://research.wur.nl/en/publications/quantification-of-the-growth-response-of-light-quantity-of-greenh | fetched (record) |
| S15 | Kujawa et al. (2025), *AgriEngineering* 7(6), 178; DLR news 1 Dec 2023 (set-up) | 30 % / 50 % shading → −15 % / −26 % tomato yield | https://www.mdpi.com/2624-7402/7/6/178 · https://www.dlr.de/en/sf/latest/news/2023/pv-modules-on-plastic-greenhouses-in-southern-spain | abstract via search (publisher 403); DLR fetched |
| S16 | Al-agele et al. (2021), *Sustainability* (Oregon tomato agrivoltaics) | yield falls with shade; water productivity | https://par.nsf.gov/servlets/purl/10295508 | search only |
| S17 | Bac, van Henten, Hemming, Edan (2014), *J. Field Robotics* 31(6), 888–911 | averages 85/75/66/5/45 %, 33 s; none commercialised | https://research.wur.nl/en/publications/harvesting-robots-for-high-value-crops-state-of-the-art-review-an | fetched (record) |
| S18 | C.W. Bac (2015), PhD thesis, Wageningen | Hemming 2011 requirement (€196 k / €59 k); 6 % / 2 % → 26 % / 33 %; 94 s; occlusion quote | https://edepot.wur.nl/327202 | fetched (PDF text) |
| S19 | Arad et al. (2020), *J. Field Robotics* 37, 1027–1039 (SWEEPER) | 61 % / 18 %; 24 s; 262 fruits; 6-DoF arm on pipe rails | https://research.wur.nl/en/publications/development-of-a-sweet-pepper-harvesting-robot/ | fetched |
| S20 | Li et al. (2024), AHPPEBot, arXiv 2405.06959 (ICRA 2024) | 86.67 %, 32.46 s, commercial greenhouses | https://arxiv.org/abs/2405.06959 | fetched |
| S21 | HortiDaily, 3 Jan 2018, Panasonic tomato picker | 10 tomatoes/min target; under development | https://www.hortidaily.com/article/6040108/panasonic-unveils-autonomous-tomato-picker-in-tokyo/ | fetched |
| S22 | Four Growers product pages (vendor) | 43 kg/h (12 g fruit), 98 % Ripe, 24/7; 4 vs 8 cameras | https://four-growers.carney.co/products/robotic-harvesting-technology/ · https://www.fourgrowers.com/ | fetched (vendor; inconsistent) |
| S23 | CORDIS GRoW (880753); HortiDaily 18 May 2021 | −80 % labour goal; 90 % row trial, truss tomatoes | https://cordis.europa.eu/project/id/880753 · https://hortidaily.com/article/9321841/90-success-for-robotic-tomato-harvester | fetched |
| S24 | 7 CFR §51.1860, tomato colour classification | six classes and their surface shares | https://www.law.cornell.edu/cfr/text/7/51.1860 | fetched |
| S25 | TheRobotStudio SO-ARM100 README and LICENSE (as pinned by R1) | Apache-2.0; STS3215 16.5 / 30 kg·cm; BOM $121.94 / $229.88; 5 V / 12 V 5 A supply | https://github.com/TheRobotStudio/SO-ARM100 | read locally (`artifacts/phase7/downloads/r1-so-arm100-text/`) |
| S26 | R1 report and scripts (`urdf_reach.py`, `urdf_payload.py`, rerun by me on `so101_new_calib.urdf`); MuJoCo Menagerie `robotstudio_so101` | reach 0.411 m; payload 0 / 188 / 261 / 517 g; gripper, wrist camera | `docs/research/R1-SO101-VLA.md` · https://github.com/google-deepmind/mujoco_menagerie | internal + local |
| S27 | R7 pipeline prototype output (`artifacts/phase7/pipeline/out/`) | SO-101 LOD0 24,078 / LOD1 6,496 tris; 7 draws; 0.22 MB br | internal | measured by R7 |
| S28 | LeKiwi (SIGRobotics-UIUC) | low-cost mobile manipulator, Apache-2.0, URDF | https://github.com/SIGRobotics-UIUC/LeKiwi | fetched |
| S29 | FarmBot Genesis | open-source CAD/BOM; 1.5 × 3 m, 1.5 m, plants ≤ 0.5 m | https://farm.bot/pages/genesis | fetched (licence not confirmed) |
| S30 | HortiDaily, 24 Feb 2022, history of biological pollination | bumblebees pioneered mid-1980s (Biobest); replaced vibrating wands | https://hortidaily.com/article/9403897/history-of-biological-pollination-in-uk-tomato-crops | fetched |
| S31 | IEA PVPS Task 13, soiling losses (Jan 2023) | 3–5 % energy; €3–5 bn; robots as a cost | https://iea-pvps.org/key-topics/soiling-losses-impact-on-the-performance-of-photovoltaic-power-plants/ | fetched |
| S32 | AMP Robotics press release, 29 Jun 2021 | 140 peak / 120 sustained picks/min | https://ampsortation.com/articles/amp-robotics-achieves-data-milestones-and-recycling-automation-breakthrough | fetched (vendor) |
| S33 | UNITAR/ITU, Global E-waste Monitor 2024, 20 Mar 2024 | 62 Mt; 22.3 %; US$62 bn; 82 Mt by 2030 | https://unitar.org/index.php/about/news-stories/press/global-e-waste-monitor-2024-electronic-waste-rising-five-times-faster-documented-e-waste-recycling | fetched |
| S34 | Directive (EU) 2024/1799 (right to repair), 13 Jun 2024 | applies from 31 Jul 2026 | https://eur-lex.europa.eu/eli/dir/2024/1799/oj/eng | fetched |
| S35 | KIT, AgiProbot | 2019–2024; disassembly of e-motors with mobile learning robots | https://www.ifab.kit.edu/english/1516_2257.php | fetched |
| S36 | FAO Agritech Observatory, FarmDroid FD20 | RTK, no vision, ≈ 6.5 ha/day, 24 h solar + battery, €75–97 k | https://agritechobservatory.review.fao.org/en/farmdroid-fd20 | fetched |
| S37 | Ecorobotix press release, 17 Mar 2026 | 1,000 ARA; > 30 countries; 6 × 6 cm; "up to 95 %" | https://press.ecorobotix.com/449696-ecorobotix-erreicht-einen-meilenstein-1000-ara-ultra-hochprazisionsspritzen-weltweit-verkauft | fetched (vendor) |
| S38 | Carbon Robotics LaserWeeder launch, Feb 2022 | 30 × 150 W; ≈ 2 acres/h | https://www.businesswire.com/news/home/20220207005189/en | search only (403) |
| S39 | ENGIE Innovation, 10 Mar 2026, robots for blade erosion | conventional repair 5–9 days; stops at 8–12 m/s | https://innovation.engie.com/en/news/interview/research-and-innovation/innovation-in-wind-power-robots-used-to-repair-wind-turbine-blade-erosion/30481 | fetched |
| S40 | Aerones (vendor material and trade press) | "3–6× faster", up to 15 m/s | https://aerones.com/ | search only |
| S41 | Starship press release, 17 Apr 2025 | > 8 M deliveries; 2,000+ robots; 125,000 crossings/day | https://www.starship.xyz/press/starship-technologies-surpasses-8-million-deliveries/ | fetched (vendor) |
| S42 | ITKE, University of Stuttgart, BUGA Wood Pavilion 2019 | 376 segments; 30 m; 38 kg/m²; 8 min + 20–40 min; 10 days, 2 craftsmen; reuse | https://www.itke.uni-stuttgart.de/research/built-projects/buga-wood-pavilion-2019/ | fetched |
| S43 | topagrar, 3 Apr 2025, on Destatis Agrarstrukturerhebung 2023 | 875,900 workers, 242,800 seasonal (28 %) | https://www.topagrar.com/betriebsleitung/news/28-aller-arbeitskrafte-in-der-landwirtschaft-waren-2023-saisonarbeitskrafte-20013106.html | fetched (secondary of Destatis) |
| S44 | Umweltbundesamt, 5 Mar 2026 | renewables 54.4 % (2024) → 55.1 % (2025) of gross electricity use; PV 91.6 TWh | https://www.umweltbundesamt.de/themen/erneuerbare-energien-in-deutschland-wachstum-2025 | fetched |
| S46 | RWE, 4 Oct 2022 | Rhineland coal exit brought forward to 2030 | https://www.rwe.com/investor-relations/finanzkalender-und-veroeffentlichungen/news-und-ad-hoc-mitteilungen/news/news-2022-10-04/ | fetched |
| S47 | VDE history map, Ferropolis | Golpa-Nord, mining stopped Aug 1991; 5 of 18 machines kept; open since 1995 | https://www.vde.com/de/geschichte/karte/sachsen-anhalt/ferropolis | fetched |
| S48 | three.js fog shader; repo `src/core/Environment.ts` | fog factor formula; rc4 density 0.0015 | `node_modules/three/src/renderers/shaders/ShaderChunk/fog_fragment.glsl.js` | local |
| S49 | R5 report and `artifacts/phase7/liftoff/timeline.py` | dock, apron, coast, slab, shade line, budgets, climb timings | `docs/research/R5-LIFTOFF.md` | internal |
| S50 | R6 report | quest spine, grab verb unused, stars → robots | `docs/research/R6-QUEST-REVIEW.md` | internal |
| S51 | Life/easter-egg teammate's CPU bench (`artifacts/phase7/life-eastereggs/bench.txt`) | µs per frame for walkers, boids, arms | internal | measured by teammate |
| S52 | GDD §4, §9, §11; RELEASE §1a (rc4) | coordinates, palette, budgets, measured worst view | `docs/GDD.md`, `docs/RELEASE.md` | repo |
| S53 | Hugging Face dataset search (SO-101 fruit) | closest: `SO101_PickAndPlace_Fruit` (102 episodes); no tomato harvest set found | https://huggingface.co/datasets/jinseonylee/SO101_PickAndPlace_Fruit | search only |
