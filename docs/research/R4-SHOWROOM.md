# R4 · Showroom „Schauhalle“: real robots, real models

Phase 7 research, topic R4. Baseline: release candidate 4 (tag `rc4`). Date: 2026-10-17 (every web source below was accessed on this date). This report changes no code. Scratch work (measurement scripts, `measurements.json`) is in `artifacts/phase7/showroom/`; downloads are in `artifacts/phase7/downloads/showroom-*` (git-ignored).

**Contents:** 0 Verdict · 1 Method · 2 The line-up (20 robots) · 3 Prices (founder decision) · 4 3D models and licences · 5 Reserve and excluded · 6 Licence duties for the build · 7 Showroom design · 8 Starred station „Lastenheft“ · 9 Entscheider take-away · 10 Text proposals (DE/EN) · 11 Performance plan · 12 Hand-off to the asset pipeline · 13 Founder questions · 14 Risks · 15 Sources

---

## 0. Verdict

1. **20 robots can stand in the showroom as their real 3D model**, at true scale, with a sourced data card. Each category has at least two: 6 humanoids, 3 quadrupeds, 2 mobile manipulators, 1 AMR, 4 industrial arms or cobots, 2 open-source builds, 2 hands or grippers. 16 are **green**: the vendor itself publishes the model under an open licence (Unitree, FANUC, ANYbotics, Franka, PAL, Booster, TheRobotStudio, the Open Duck author), or the model reached MuJoCo Menagerie with the vendor involved (Hello Robot and Shadow Robot: "provided directly"; Apptronik: released as "Apptronik Apollo open source software" and later fixed "based on Apptronik request"), or confirms in its own repo that the meshes fall under the open licence (Universal Robots for the UR5e). 4 are **amber**: the licence is permissive and covers the files, but the licensor is a third party rather than the vendor, so the origin of the geometry is not documented (Spot, MiR250, KUKA LBR iiwa 14, Robotiq 2F-85). §4 has the full table.
2. **All four Unitree humanoids from the founder's ladder exist as official BSD-3-Clause models:** R1 (1230 mm) → G1 (1320 mm) → H1 (about 180 cm) → H2 (1820 mm). H2 and R1 are in Unitree's own `unitree_ros`; G1, H1 and Go2 are also in MuJoCo Menagerie. SO-101 and Open Duck Mini v2 are Apache-2.0.
3. **Hard no:** Universal Robots' newer meshes (UR8 Long, UR15, UR18, UR20, UR30) fall under UR's own terms. Those terms are not open source and forbid comparative advertising, so a compare mode would break them. Fourier's models: the upstream repo is GPL-3.0, while the Menagerie copy says Apache-2.0. Agility Digit, Tesla Optimus, Figure, 1X NEO and Boston Dynamics Atlas: no official public model was found (§5).
4. **The raw models are too heavy for the web.** Visual triangles measured: ANYmal D 19.6 k, FANUC R-2000iC 69.6 k, G1 393 k, Apollo 1.55 M, Open Duck 2.39 M. The plan has three LOD tiers: at most **2 full models visible at once** (≤ 80 k triangles each, rigid-skinned, ≤ 3 draw calls), static podium models of ≤ 20 k, and silhouettes of ≤ 3 k. Everything loads lazily, behind a delivery crate that doubles as the loading screen (§11).
5. **Design:** a glass „Schauhalle“ on the north axis between Regelgarten and Greifwerkstatt (30 × 28 m, 9 m clear height). It has turntables, spotlights, a data card („Datenblatt“) beside every robot and a height line-up wall with you and EMI (1.55 m). Two more toys: a crate scale (one Dunkelfabrik crate weighs 18 kg; by a single vendor figure only the FANUC and the MiR250 can take one, and the H2 only on paper, with both arms at peak), and a compare stage for two robots. The H2 waits under a cover in front of the cloud window. The tower foyer stays the delivery podium of R6. **One starred station, „Lastenheft“:** match three jobs to robots, or say that none fits. The stars reward reading the *condition* behind a number.
6. **House line kept:** every number carries a chip (HERSTELLERANGABE, QUELLE or MODELL) and an as-of date. Real vendors never appear in the „Hersteller X“ critique (R6 Q5). Payload beyond spec shows as a gauge, never as a staged failure.

---

## 1. Method

- **Licences:** for every candidate I read the `LICENSE` file in the exact model folder. For MuJoCo Menagerie that is one folder per model at commit `62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35` (2026-10-14); the repo's README says each folder has its own terms [S1]. I also checked the upstream repo the model was derived from: its licence, its README licence section and, where they exist, licence files inside `meshes/`. Licence and README text was treated as data.
- **Downloads:** each source went into its own new folder under `artifacts/phase7/downloads/showroom-*`: Menagerie (sparse checkout of 22 model folders), `unitree_ros` (H2, H2 Plus, R1), ANYmal D, Open Duck Mini v2, FANUC (CRX-10iA and R-2000iC/165F visual meshes and xacro macros), plus three vendor datasheet PDFs. Nothing inside these folders was executed.
- **Measurements:** I wrote three scripts outside the download folders: `artifacts/phase7/showroom/measure_mjcf.py`, `measure_urdf.py` and `fanuc_bbox.py`. They ran under `python -I`, in a scratch venv with `mujoco` and `trimesh`. They count the visual triangles (MJCF geoms with contype = conaffinity = 0, or URDF `<visual>` meshes), the mesh geoms, the materials and the bounding box in the model's default or `home`/`stand` keyframe. The results are in `artifacts/phase7/showroom/measurements.json`. Where I did not download a file, the triangle count comes from the binary STL size, (bytes − 84) / 50, and is marked as such.
- **Specs:** from the vendor's own page or datasheet where it could be read. Secondary sources (press, distributors) are marked **QUELLE** with their source. Values I could only see in a search snippet are marked **unverified**. „k. A.“ (keine Angabe) means the vendor states no value. I invented no numbers. Model-derived sizes are labelled **MODELL** and never stand in for a vendor value.

---

## 2. The line-up (20 robots)

Status key: **lieferbar** = the vendor lists a price or a quote path; **Pilot** = pilot deployments only; **Selbstbau** = open hardware you build yourself. Sources in brackets refer to §15.

### 2.1 Identity, status, size

| # | Robot | Vendor | Category | Status | Size | Weight | DOF / joints |
|---|---|---|---|---|---|---|---|
| 1 | **R1** | Unitree | Humanoid | lieferbar (price listed; delivery dates unverified) [S32] | 1230 × 357 × 190 mm [S32] | ≈ 29 kg (AIR ≈ 27 kg) [S32] | 26 (AIR 20, EDU 26–40) [S32] |
| 2 | **G1** | Unitree | Humanoid | lieferbar [S29] | 1320 × 450 × 200 mm; folded 690 × 450 × 300 mm [S29] | ≈ 35 kg [S29] | 23 (EDU 23–43) [S29] |
| 3 | **H1** | Unitree | Humanoid | lieferbar (shop listing, "contact us for the real price"; unverified) [S34] | ≈ 180 cm [S30] | ≈ 47 kg [S30] | 5 per leg, 4 per arm [S30]; model: 19 actuated (MODELL) |
| 4 | **H2** | Unitree | Humanoid | announced 2025-10-20 (QUELLE [S62]); price on the vendor page; availability unclear: resellers show special order or out of stock [S63] | 1820 × 456 × 218 mm [S31] | ≈ 70 kg [S31] | 31 [S31] |
| 5 | **Apollo** | Apptronik | Humanoid | Pilot: partners named on the vendor site [S55]; Apollo 2 (2026) is described as a prototype for scaled pilots (QUELLE [S54], unverified) | 1.73 m (QUELLE [S53]) | 72.6 kg (QUELLE [S53]) | k. A. |
| 6 | **TALOS** | PAL Robotics | Humanoid (research) | lieferbar (research platform) [S49] | 175 cm [S49] | 95 kg [S49] | k. A. on the page |
| 7 | **Go2** | Unitree | Quadruped | lieferbar [S33] | 700 × 310 × 400 mm standing [S33] | ≈ 15 kg [S33] | 12 joint motors [S33] |
| 8 | **Spot** (+ Spot Arm) | Boston Dynamics | Quadruped | lieferbar since 2020 [S35][S37] | 1100 × 500 mm, walking height 610 mm (520–700) [S35]¹ | 33.8 kg [S35] | 12 legs (MODELL); arm 6 DOF [S36] |
| 9 | **ANYmal D** | ANYbotics | Quadruped (inspection) | lieferbar [S38] | 930 × 530 × 890 mm walking; 470 mm lying [S38]² | 50.0 kg; 55.7 kg with inspection payload [S38]² | 12 legs + pan-tilt (MODELL: 14 joints) |
| 10 | **Stretch 3** | Hello Robot | Mobile manipulator | lieferbar since 2024-02-15 [S51] | 33 × 34 × 141 cm (unverified [S52]) | 24.5 kg [S51] | lift, telescopic arm, wrist (MODELL: 10 actuators) |
| 11 | **TIAGo** | PAL Robotics | Mobile manipulator | lieferbar [S50] | height 110–145 cm, base ø 54 cm [S50] | k. A. | 7-DoF arm [S50] |
| 12 | **MiR250** | Mobile Industrial Robots | AMR | lieferbar [S47] | 800 × 580 mm footprint, 300 mm high [S47] | 94–97 kg (QUELLE, varies by sheet [S48]) | 2 drive wheels |
| 13 | **UR5e** | Universal Robots | Cobot | lieferbar [S40] | base ø 151 mm [S40] | 20.7 kg incl. cable [S40] | 6 [S40] |
| 14 | **Franka Research 3** | Franka Robotics | Cobot (research) | lieferbar (quote) [S41] | — | ≈ 18.3 kg [S41] | 7 [S41] |
| 15 | **LBR iiwa 14 R820** | KUKA | Sensitive cobot | lieferbar [S42] | — | 29.9 kg (QUELLE [S43]) | 7 axes [S42] |
| 16 | **R-2000iC/165F** | FANUC | Industrial arm | lieferbar [S44] | zero pose 2.48 × 0.75 × 2.11 m (MODELL) | 1090 kg [S44] | 6 [S44] |
| 17 | **SO-101** | TheRobotStudio with Hugging Face | Open-source arm | Selbstbau (parts list) [S22] | zero pose 0.43 m long (MODELL) | k. A. | 6 servos [S22] |
| 18 | **Open Duck Mini v2** | Open-source project (A. Pirrone and contributors) | Open-source biped | Selbstbau, work in progress ("working repo") [S21] | ≈ 42 cm with legs extended [S21] | k. A. (MODELL 2.06 kg) | 16 joints (MODELL) |
| 19 | **Dexterous Hand** | Shadow Robot | Hand | lieferbar (pricing on request) [S56] | — | 4.3 kg [S56] | 24 joints, 20 actuated [S56] |
| 20 | **2F-85** | Robotiq | Gripper | lieferbar [S58] | stroke 85 mm [S57] | 0.9 kg [S57] | 1 actuator |

¹ The vendor page reads "Length: 110 mm (43.3 in)". 43.3 in is 1100 mm, so the millimetre value is a typo on the page.
² Converted from the US sheet: 36.61 × 20.87 × 35.04 in, 18.50 in lying, 110.2 lb / 122.8 lb.

### 2.2 What they carry, how far, how fast, how long

| # | Payload | Reach | Speed | Runtime | Typical uses (vendor) |
|---|---|---|---|---|---|
| 1 R1 | ≈ 2 kg per arm; "varies greatly" with arm posture [S32] | k. A. | k. A. | ≈ 1 h [S32] | entry humanoid; camera and 4-mic array [S32] |
| 2 G1 | ≈ 2 kg per arm (EDU ≈ 3 kg); "The maximum load of the arm varies greatly under different arm extension postures" [S29] | k. A. | k. A. | ≈ 2 h, 9000 mAh quick-release battery [S29] | depth camera + 3D LiDAR, development platform [S29] |
| 3 H1 | k. A. for H1 [S30] | k. A. | 3.3 m/s (vendor: "world record") [S30] | k. A.; 15 Ah / 0.864 kWh, swappable [S30] | 360° depth sensing (3D LiDAR + depth camera) [S30] |
| 4 H2 | arm rated ≈ 7 kg, peak ≈ 15 kg [S31] | k. A. | k. A. | ≈ 3 h, 0.972 kWh [S31] | 7-DoF arms; i5 or i7 compute [S31] |
| 5 Apollo | 25 kg (QUELLE [S53]; condition not stated) | k. A. | k. A. | ≈ 4 h per swappable pack (QUELLE [S53]) | manufacturing, warehouse, retail [S55] |
| 6 TALOS | 6 kg per arm, "arm stretched" [S49] | k. A. | k. A. | 1.5 h walking / 3 h standby [S49] | research; torque sensors in all joints except head, wrists and grippers; EtherCAT at 2 kHz [S49] |
| 7 Go2 | ≈ 7 kg AIR (max ≈ 10), ≈ 8 kg PRO (max ≈ 10), ≈ 8 kg EDU (max ≈ 12) [S33] | — | 2.5 m/s AIR, 3.5 m/s PRO, 3.7 m/s EDU [S33] | 1–2 h (8000 mAh); EDU 2–4 h (15000 mAh) [S33] | 4D LiDAR; 15–16 cm steps, 30–40° slopes [S33] |
| 8 Spot | 14 kg [S35]; arm lifts up to 11 kg, drags up to 25 kg [S36] | arm "almost one meter" [S36] | 1.6 m/s [S35] | 90 min average, 180 min standby [S35] | inspection, digital twins, research, hazardous sites; IP54, −20 to 55 °C, 300 mm steps, ±30° slopes [S35] |
| 9 ANYmal D | up to 10 kg of extra sensors [S39] | — | 1.3 m/s max, 0.75 m/s recommended [S38] | 90–120 min, 932.4 Wh swappable [S38] | autonomous inspection in industrial plants; IP67; stairs up to 45°, grated steps [S38] |
| 10 Stretch 3 | 2 kg (unverified [S52]) | k. A. | k. A. | 2–5 h (unverified [S52]) | mobile manipulation: lift column and telescopic arm (MODELL) [S51] |
| 11 TIAGo | 3 kg without end effector [S50] | k. A. | k. A. | 4–5 h with 1 battery, 8–10 h with 2 [S50] | research, healthcare, education [S50] |
| 12 MiR250 | 250 kg [S47] | — | 2 m/s [S47] | "up to 20 hours a day" [S47]; ≈ 13 h at max payload (QUELLE [S48]) | carts, pallets and top modules in factories and warehouses; passages from 80 cm [S47] |
| 13 UR5e | 5 kg [S40] | 850 mm [S40] | TCP up to 4 m/s; repeatability ± 0.03 mm [S40] | — | collaborative industrial tasks; IP54; force sensing at the tool flange [S40] |
| 14 FR3 | 3 kg [S41] | 855 mm [S41] | up to 2 m/s at the TCP; repeatability < ± 0.1 mm [S41] | — | research; torque sensor in every joint, 1 kHz control; IP40 [S41] |
| 15 iiwa 14 | 14 kg [S42] | 820 mm [S42] | k. A. | — | machining, handling, assembly, gluing, packaging, inspection; joint torque sensors in all 7 axes, ± 2 % of max torque; IP54 [S42] |
| 16 R-2000iC/165F | 165 kg [S44] | 2655 mm [S44] | k. A.; repeatability ± 0.05 mm [S44] | — | "high output automotive spot welding", material handling [S44] |
| 17 SO-101 | k. A. | k. A. | k. A. | — | built for the LeRobot library; STS3215 servos [S22] |
| 18 Open Duck Mini v2 | — | — | k. A. | k. A. | walking learned by reinforcement learning in simulation (MuJoCo, moving to MuJoCo Playground) [S21] |
| 19 Shadow Hand | k. A. | — | — | — | research and industry; 2 tactile fingertips as standard (up to 5), 40 tendon load sensors, over 100 sensors at up to 1 kHz [S56] |
| 20 2F-85 | 5 kg [S57] | — | closing speed 20–150 mm/s (unverified, reseller listings seen in search) | — | precision assembly, pick and place, machine tending [S58]; grip force 20–235 N [S57] |

### 2.3 „Kann heute“ / „Grenzen“: one line each for the card (DE first, then EN)

Every line paraphrases its sources in §2.1 and §2.2. A card shows them with the HERSTELLERANGABE chip; lines built on QUELLE values say so on the card.

| # | Kann heute (DE) | Grenzen (DE) | Can do today (EN) | Limits (EN) |
|---|---|---|---|---|
| 1 R1 | Steht und läuft mit 26 Gelenken, sieht mit Kamera, hört mit 4 Mikrofonen. | ca. 1 h Akku; ca. 2 kg pro Arm, stark haltungsabhängig. | Stands and walks on 26 joints, with a camera and 4 microphones. | About 1 h of battery; about 2 kg per arm, depending heavily on posture. |
| 2 G1 | Läuft mit 23 Gelenken (EDU bis 43), Tiefenkamera und 3D-LiDAR an Bord. | ca. 2 kg pro Arm, „variiert stark mit der Armhaltung“; ca. 2 h Akku. | Walks on 23 joints (EDU up to 43), with a depth camera and a 3D LiDAR. | About 2 kg per arm, "varies greatly with arm posture"; about 2 h of battery. |
| 3 H1 | Läuft bis 3,3 m/s, sieht rundum mit LiDAR und Tiefenkamera. | Keine Armlast und keine Laufzeit angegeben. | Walks at up to 3.3 m/s, with all-round LiDAR and depth vision. | No arm load and no runtime stated. |
| 4 H2 | 31 Gelenke, Arme mit 7 Gelenken, ca. 7 kg Nennlast pro Arm. | 15 kg nur als Spitze; manche Funktionen sind laut Hersteller „noch in Entwicklung“. | 31 joints, 7-joint arms, about 7 kg rated load per arm. | 15 kg is peak only; per the vendor, some functions are "still being developed". |
| 5 Apollo | Für Kisten und Material in Werk und Lager gebaut; Akku tauschbar. | Noch im Pilotbetrieb; 25 kg Hebeleistung nur aus Presseberichten. | Built for crates and material in plants and warehouses; swappable battery. | Still in pilots; the 25 kg lift comes from press reports only. |
| 6 TALOS | Spürt Drehmoment in fast jedem Gelenk; Regeltakt 2 kHz. | 1,5 h Laufen, 95 kg; 6 kg pro Arm bei gestrecktem Arm. | Senses torque in almost every joint; control loop at 2 kHz. | 1.5 h of walking, 95 kg; 6 kg per arm with the arm stretched. |
| 7 Go2 | Läuft bis 3,5 m/s (PRO), steigt 16 cm Stufen und 40° Hänge. | ca. 8 kg Last; 1–2 h Akku (Standard). | Runs at up to 3.5 m/s (PRO), climbs 16 cm steps and 40° slopes. | About 8 kg of load; 1–2 h of battery (standard). |
| 8 Spot | Treppen, Gelände, −20 bis 55 °C, IP54; mit Arm hebt er bis 11 kg. | 14 kg Nutzlast; im Schnitt 90 min Laufzeit. | Stairs, rough ground, −20 to 55 °C, IP54; with the arm it lifts up to 11 kg. | 14 kg payload; 90 min of runtime on average. |
| 9 ANYmal D | Inspiziert Anlagen selbstständig; Treppen bis 45°, Gitterroste, IP67. | Empfohlen 0,75 m/s; 90–120 min pro Ladung. | Inspects plants on its own; stairs up to 45°, grated steps, IP67. | 0.75 m/s recommended; 90–120 min per charge. |
| 10 Stretch 3 | Mobiler Arm mit Hubsäule und Teleskoparm; nur 24,5 kg leicht. | 2 kg Nutzlast (unbestätigt). | A mobile arm with a lift column and a telescopic arm; weighs only 24.5 kg. | 2 kg payload (unverified). |
| 11 TIAGo | Fährt, ist 110 bis 145 cm hoch, Arm mit 7 Gelenken. | 3 kg Armlast ohne Greifer; 4–5 h pro Akku. | Drives, stands 110 to 145 cm tall, 7-joint arm. | 3 kg arm load without a gripper; 4–5 h per battery. |
| 12 MiR250 | Fährt bis 250 kg selbstständig durch Halle und Lager, 2 m/s. | Nur 30 cm hoch: Lasten fahren auf Aufsatzmodulen (Haken, Träger, Lift). | Drives up to 250 kg through plants and warehouses on its own, at 2 m/s. | Only 30 cm tall: loads ride on top modules (hook, carrier, lift). |
| 13 UR5e | Arbeitet neben Menschen: 5 kg, 850 mm, ± 0,03 mm genau. | Nur 5 kg; IP54. | Works next to people: 5 kg, 850 mm, ± 0.03 mm repeatable. | Only 5 kg; IP54. |
| 14 FR3 | Drehmomentsensor in jedem der 7 Gelenke, Steuerung mit 1 kHz. | 3 kg Nutzlast; IP40, also nur trocken und sauber. | A torque sensor in each of its 7 joints, 1 kHz control. | 3 kg payload; IP40, so dry and clean places only. |
| 15 iiwa 14 | Spürt Berührung in allen 7 Achsen; 14 kg Nutzlast. | Reichweite 820 mm. | Feels contact in all 7 axes; 14 kg payload. | 820 mm of reach. |
| 16 R-2000iC/165F | Schweißt und hebt im Autobau: 165 kg, 2655 mm Reichweite. | Wiegt selbst 1090 kg. | Welds and lifts in car plants: 165 kg, 2655 mm of reach. | Weighs 1090 kg itself. |
| 17 SO-101 | Offener Arm zum Selberbauen, gemacht für LeRobot; Teile ca. 122 US$. | Hobby-Servos; Nutzlast und Reichweite nicht angegeben. | An open arm you build yourself, made for LeRobot; parts about US$122. | Hobby servos; no payload or reach stated. |
| 18 Open Duck Mini | Offener Zweibeiner, ca. 42 cm, lernt Laufen per Reinforcement Learning. | Selbstbau unter 400 US$ Teilekosten; Projekt noch in Arbeit. | An open biped, about 42 cm, that learns to walk by reinforcement learning. | DIY build, under US$400 in parts; still a work in progress. |
| 19 Shadow Hand | 20 angetriebene Gelenke, über 100 Sensoren bis 1 kHz. | 4,3 kg; Preis nur auf Anfrage. | 20 driven joints, over 100 sensors at up to 1 kHz. | 4.3 kg; price on request only. |
| 20 2F-85 | Zwei Finger, 85 mm Hub, 20–235 N Griffkraft. | Höchstens 5 kg. | Two fingers, 85 mm stroke, 20–235 N of grip force. | 5 kg at most. |

---

## 3. Prices (separate on purpose: showing them is a founder decision)

| # | Robot | Price | Source | As of | Note |
|---|---|---|---|---|---|
| 1 | Unitree R1 | US$ 5,900 (AIR US$ 4,900; EDU on request) | [S32] | 2026-10-17 | excl. tax and shipping |
| 2 | Unitree G1 | from US$ 13,500 (EDU on request) | [S29] | 2026-10-17 | excl. tax and shipping; secondary sources from 2024 still quote US$ 16,000 |
| 3 | Unitree H1 | US$ 90,000 shown, "contact us for the real price" | [S34] | 2026-10-17 | **unverified** (search result of the shop page) |
| 4 | Unitree H2 | US$ 29,900 (EDU on request) | [S31] | 2026-10-17 | conflict: a reseller guide lists ≈ US$ 90,000 [S63] |
| 7 | Unitree Go2 | AIR US$ 1,600 · PRO US$ 2,800 · EDU on request | [S33] | 2026-10-17 | excl. tax and freight |
| 8 | Boston Dynamics Spot | US$ 74,500 base kit at launch | [S37] | 2020-06-16 | **historical**; today's price not published |
| 10 | Stretch 3 | US$ 24,950 | [S51] | 2024-02-15 | launch price |
| 17 | SO-101 | parts ≈ US$ 121.94 per follower arm; US$ 229.88 for leader + follower | [S22] | 2026-10-17 | parts only, no labour |
| 18 | Open Duck Mini v2 | BOM "under $400" | [S21] | 2026-10-17 | target, parts only |
| 5, 6, 9, 11–16, 19, 20 | Apollo, TALOS, ANYmal D, TIAGo, MiR250, UR5e, FR3, iiwa 14, R-2000iC, Shadow Hand, 2F-85 | no public list price | vendor pages [S39][S41][S47][S49][S50][S55][S56] | 2026-10-17 | „Preis auf Anfrage“ |

---

## 4. 3D models and licences

Light: **green** = an open licence that covers the meshes, with the vendor as licensor or as the confirmed source. **Amber** = an open licence that covers the files, but the licensor is a third party and the origin of the geometry is not documented; a legal review or a courtesy note to the vendor is recommended before public release. „Visual tris“ is measured on the raw visual meshes (§1) and shows how much the asset pipeline must cut.

| # | Model source (repo @ commit · path) | SPDX · covers meshes? | Licensor, and the attribution to show | Restrictions and notes | Visual tris · mesh geoms · source size | Light |
|---|---|---|---|---|---|---|
| 1 R1 | `unitreerobotics/unitree_ros` @ `5994d4faef0a9cadd3287f8de0199a67eeb2a259` · `robots/r1_description/` (`R1.urdf`, STL) [S17] | BSD-3-Clause · yes (repo-wide) | „© 2016–2022 HangZhou YuShu Technology Co., Ltd. (Unitree Robotics), BSD-3-Clause“ | BSD clause 3: no endorsement implied | 446,727 · 40 · 22.3 MB STL | green |
| 2 G1 | Menagerie @ `62ab00f` · `unitree_g1/g1.xml` (+ `g1_with_hands.xml`), derived from `unitree_ros/robots/g1_description/g1_29dof_rev_1_0.xml` [S2] | BSD-3-Clause · yes | „© 2016–2023 HangZhou YuShu Technology Co., Ltd. (Unitree Robotics), BSD-3-Clause, via MuJoCo Menagerie“ | as above; untextured, 2 materials | 393,270 · 35 (with hands 629,338 · 49) · 39.6 MB folder; MODELL height 1.323 m | green |
| 3 H1 | Menagerie · `unitree_h1/h1.xml`; "assets were provided directly by Unitree Robotics" [S3] | BSD-3-Clause · yes | „© 2016–2023 Unitree Robotics, BSD-3-Clause, via MuJoCo Menagerie“ | — | 286,408 · 21 · 17.0 MB; MODELL 1.798 m | green |
| 4 H2 | `unitree_ros` @ `5994d4f` · `robots/h2_description/` (`H2.urdf` STL, `H2_dae.urdf`, `H2_loop.xml` MJCF) [S17] | BSD-3-Clause · yes | „© 2016–2022 Unitree Robotics, BSD-3-Clause“ | `robots/h2_plus/` has a version with hands (75 joints) | 256,242 · 34 · 12.8 MB STL (DAE 30.4 MB); MJCF 284,602; MODELL height 1.832 m | green |
| 5 Apollo | Menagerie · `apptronik_apollo/apptronik_apollo.xml`; added 2025-01-08 as "Apptronik Apollo open source software", with later IMU fixes "based on Apptronik request" [S5] | Apache-2.0 · yes | „Apptronik Apollo model, Apache-2.0, via MuJoCo Menagerie (Google DeepMind); modified by EmAI“ | Apache §4: mark the modifications; §6: no trademark rights. The model is Apollo, not Apollo 2 | 1,553,699 · 60 (+ 18 primitives) · 72.1 MB; MODELL 1.735 m | green |
| 6 TALOS | Menagerie · `pal_talos/talos.xml`, derived from `pal-robotics/talos_robot` (Apache-2.0) [S6] | Apache-2.0 · yes | „PAL Robotics TALOS model, Apache-2.0, via MuJoCo Menagerie; modified by EmAI“ | — | 225,243 · 48 · 9.9 MB; MODELL 1.757 m | green |
| 7 Go2 | Menagerie · `unitree_go2/go2.xml` [S4] | BSD-3-Clause · yes | „© 2016–2022 Unitree Robotics, BSD-3-Clause, via MuJoCo Menagerie“ | — | 398,432 · 33 (16 unique) · 30.9 MB; MODELL 0.715 × 0.324 × 0.377 m | green |
| 8 Spot | Menagerie · `boston_dynamics_spot/spot.xml` and `spot_arm.xml`, derived from `bdaiinstitute/spot_ros2` → `rai-opensource/spot_description` @ `156d1802bfb117f219dbfce7597d283d5fabc968` [S7][S24] | BSD-3-Clause (© 2021 Clearpath Robotics) + MIT (© 2023–2024 RAI Institute) · yes | „Spot model © 2021 Clearpath Robotics (BSD-3-Clause) and © 2023–2024 RAI Institute (MIT), via MuJoCo Menagerie. Spot is a trademark of Boston Dynamics“ | the licensor is not Boston Dynamics; origin of the geometry undocumented; trademark | 127,534 · 18 (with arm 162,787 · 30) · 55.2 MB | amber |
| 9 ANYmal D | `ANYbotics/anymal_d_simple_description` @ `d5bf4dc3a81af81a16b9598fc15c98e339f45a33` · `urdf/anymal.urdf`, `meshes/*.dae` + JPG textures [S18] | BSD-3-Clause · yes | „© 2023 ANYbotics AG, BSD-3-Clause“ | already web-light, with textures | **19,584** · 40 · 2.8 MB DAE (4.9 MB with JPGs) | green |
| 10 Stretch 3 | Menagerie · `hello_robot_stretch_3/stretch.xml`; "directly provided by Hello Robot under the Apache 2.0" [S8] | Apache-2.0 · yes | „Hello Robot Stretch 3 model, Apache-2.0, via MuJoCo Menagerie; modified by EmAI“ | 12 textures (1.6 MB); 30 materials to merge | 302,461 · 75 · 80.1 MB; MODELL 1.41 m | green |
| 11 TIAGo | Menagerie · `pal_tiago/tiago.xml`, derived from `pal-robotics/tiago_robot` (Apache-2.0) [S9] | Apache-2.0 · yes | „PAL Robotics TIAGo model, Apache-2.0, via MuJoCo Menagerie; modified by EmAI“ | the default pose has the torso down (MODELL 1.11 m) | 122,401 · 31 · 5.8 MB | green |
| 12 MiR250 | `DFKI-NI/mir_robot` @ `c08dfad93be53ac12969f0f37a01a2b74b5c1997` (noetic) · `mir_description/meshes/visual/mir_250_base.stl` [S20] | BSD-3-Clause · yes | „MiR250 model © 2018–2022 Martin Günther (DFKI GmbH) and contributors, BSD-3-Clause“ | licensor is DFKI, not MiR; origin of the mesh undocumented (the commit only says "Add mir_250 meshes") | ≈ 23,208 (from STL size) · 1 base mesh | amber |
| 13 UR5e | Menagerie · `universal_robots_ur5e/ur5e.xml` [S10]; upstream README: only UR8 Long/15/18/20/30 meshes fall under UR's terms; "All other content is licensed under the BSD-3-Clause license" [S23] | BSD-3-Clause · yes | „UR5e model © 2018 ROS Industrial Consortium, BSD-3-Clause, via MuJoCo Menagerie“ | **never** use UR8 Long/15/18/20/30 meshes (§5) | 121,783 · 20 · 33.0 MB | green |
| 14 FR3 | Menagerie · `franka_fr3/fr3.xml`, from `frankaemika/franka_description` [S11]; upstream `NOTICE`: "Copyright 2023 Franka Robotics GmbH" [S25] | Apache-2.0 · yes | „Franka Research 3 model, Copyright 2023 Franka Robotics GmbH, Apache-2.0 (NOTICE reproduced); modified by EmAI“ | the NOTICE text must ship (Apache §4d); Menagerie removed licence headers from the DAE files | 232,298 · 28 · 59.2 MB | green |
| 15 iiwa 14 | Menagerie · `kuka_iiwa_14/iiwa14.xml`, from Drake's `iiwa_description` [S12] | BSD-3-Clause (Drake, © 2012–2022 Robot Locomotion Group @ CSAIL) · yes | „KUKA LBR iiwa 14 model from Drake, BSD-3-Clause, via MuJoCo Menagerie“ | licensor is the Drake project, not KUKA | 74,819 · 15 · 7.2 MB | amber |
| 16 R-2000iC/165F | `FANUC-CORPORATION/fanuc_description` @ `fb40c9803a826ba68c7c8e28ba904a25efa7fcd2` · `fanuc_r2000_description/meshes/r2000ic_165f/visual/*.dae`, `urdf/r2000ic_165f_urdf_macro.xacro` [S19] | Apache-2.0 (SPDX headers and `package.xml`) · yes (repo-wide; meshes not separately marked) | „FANUC R-2000iC/165F model © 2025–2026 FANUC America Corporation and FANUC CORPORATION, Apache-2.0; modified by EmAI“ | the official vendor repo, with colours in the DAE | 69,594 · 7 · 5.5 MB DAE; MODELL zero pose 2.475 × 0.746 × 2.113 m | green |
| 17 SO-101 | Menagerie · `robotstudio_so101/so101.xml`, copied from `TheRobotStudio/SO-ARM100/Simulation/SO101/so101_new_calib.xml` [S13]; upstream Apache-2.0, HEAD `a758567c3978dfeefe282ede0500085a48fe8f78` [S22] | Apache-2.0 · yes | „SO-101 by TheRobotStudio in collaboration with Hugging Face, Apache-2.0; modified by EmAI“ | the Menagerie README credits "I2RT Robotics"; use the upstream credit. Share the GLB with the R1 VLA teammate | 401,340 · 18 · 19.2 MB | green |
| 18 Open Duck Mini v2 | `apirrone/Open_Duck_Mini` @ `b23317a485b3cec7d8417f352478778b3475173c` (branch v2) · `mini_bdx/robots/open_duck_mini_v2/robot.xml` (+ `robot.urdf`, 45 STL) [S21] | Apache-2.0 · yes (the LICENSE has no filled-in copyright line) | „Open Duck Mini v2 by Antoine Pirrone and contributors, Apache-2.0; modified by EmAI“ | its README calls it "a miniature version of the BDX Droid by Disney": never name Disney or BDX in the game (§6). `Open_Duck_Playground` has **no licence**, so do not take files from it | **2,390,028** · 131 (45 unique) · 18.7 MB unique STL; MODELL height 0.518 m in zero pose | green (+ design-IP note) |
| 19 Shadow Hand | Menagerie · `shadow_hand/right_hand.xml` (E3M5); "provided directly by Shadow Robot Company under the Apache 2.0 License" [S14] | Apache-2.0 · yes | „Shadow Dexterous Hand model, Shadow Robot Company, Apache-2.0, via MuJoCo Menagerie; modified by EmAI“ | — | 57,736 · 24 (12 unique) · 4.8 MB | green |
| 20 2F-85 | Menagerie · `robotiq_2f85/2f85.xml` [S15] | BSD-2-Clause (© 2013 ROS-Industrial) · yes | „Robotiq 2F-85 model © 2013 ROS-Industrial, BSD-2-Clause, via MuJoCo Menagerie“ | licensor is ROS-Industrial, not Robotiq | 71,330 · 14 · 4.3 MB | amber |

**Not to reuse:** a private EmAI sibling repo holds `g1-edu.glb`, `h1.glb`, `go2.glb` and `b2.glb`, with no recorded source or licence in that repo. Regenerate the robots from the sources above instead.

---

## 5. Reserve and excluded

### 5.1 Reserve (licence checked, not in the first build)

| Robot | Source · SPDX | Visual tris | Why reserve |
|---|---|---|---|
| Kinova Gen3 (7 DoF, 8.2 kg, 902 mm, 2 kg full-range / 4 kg mid-range continuous [S46]) | Menagerie `kinova_gen3` · BSD-3-Clause © 2018 Kinova inc. | 86,948 | 4 arms are enough; a strong pick for a payload-versus-reach demo |
| FANUC CRX-10iA (10 kg, 1249 mm, 39 kg, IP67 [S45]) | `fanuc_description` @ `fb40c98` · Apache-2.0 | 82,294 | second cobot; same clean vendor licence |
| UR10e | Menagerie `universal_robots_ur10e` · BSD-3-Clause | 129,619 | duplicates UR5e |
| ABB GoFa CRB 15000 (5 kg, 0.95 m; QUELLE [S69]) | `ros-industrial/abb` @ `45f4769` · `abb_crb15000_support` · Apache-2.0 (authors TU Delft / TU Vienna) | ≈ 52,539 (from STL sizes) | ABB specs only secondary; licensor is ROS-Industrial (amber) |
| Rainbow Robotics RB-Y1 (1400 mm, 131 kg, 3 kg per arm, 1.5 m/s [S59]) | Menagerie `rainbow_robotics_rby1` · Apache-2.0; upstream `rby1-sdk` Apache-2.0 | 124,061 (`rby1a_1.2`) | third mobile manipulator, if the hall grows |
| Booster T1 (≈ 1.18 m, ≈ 30 kg, 23 DoF; QUELLE [S61]) | Menagerie `booster_t1` · Apache-2.0; upstream © 2024 Booster Robotics [S27] | 168,582 | a distributor lists it as discontinued for the T2 [S61]; could teach "models disappear" |
| LEAP Hand ("under $2000" [S60]) | Menagerie `leap_hand` · MIT © 2023 Ananye Agarwal | 448,440 | low-cost hand next to the Shadow Hand |
| ANYmal C | Menagerie `anybotics_anymal_c` · BSD-3-Clause © 2020 ANYbotics | 58,318 | superseded by D |
| ToddlerBot, Berkeley Humanoid Lite, PNDbotics Adam Lite | Menagerie · MIT | 1.35 M / 0.54 M / n/a | open humanoids; specs not researched |
| LeKiwi, Reachy Mini | GitHub · Apache-2.0 (repo level; mesh licences not checked) | — | not checked in depth |

### 5.2 Excluded

| Robot | Reason |
|---|---|
| UR8 Long, UR15, UR18, UR20, UR30 meshes | UR's "Terms and Conditions for Use of Graphical Documentation" (v1.01, 2023-09-12) govern them. Use must "not constitute comparative advertising" (§1.1), public download needs a copy of the terms (§1.4), and the terms "do not fully comply with OSI's definition of Open Source" [S23]. A compare mode breaks §1.1 |
| Fourier N1, GR-1, GR-2 | Menagerie `fourier_n1` says Apache-2.0, but the upstream `FFTAI/Wiki-GRx-Models` is GPL-3.0, and the commit the Menagerie README cites (`f29a879…`) is not found in that repo [S26]. Unclear; ask Fourier before any use |
| Agility Digit | no official public model found; one third-party repo without a licence. Cassie (MIT, Menagerie) is a discontinued research robot |
| Tesla Optimus, Figure, 1X NEO, Boston Dynamics Atlas (current) | no official public 3D model found (GitHub search, 2026-10-17; not exhaustive) |
| AgiBot X2 | `AgibotTech/agibot_x2_urdf` has no clear licence (NOASSERTION) |
| Vendor CAD portals (KUKA, ABB, FANUC, UR downloads) | not evaluated: open, vendor-published alternatives exist for every robot we need |

---

## 6. Licence duties for the build

| Duty | What the build does |
|---|---|
| Reproduce the licence text (BSD-2/BSD-3 clause 2, MIT, Apache §4a) | Ship every licence text in `LICENSES/models/` and on a credits page („Modelle & Lizenzen“) linked from the title, the pause menu and the showroom entrance. One row per model with the attribution line from §4 |
| Apache NOTICE (§4d) | Reproduce the Franka NOTICE ("franka_description · Copyright 2023 Franka Robotics GmbH") |
| Mark modifications (Apache §4b) | Each attribution ends „konvertiert nach glTF und vereinfacht durch EmAI“ / "converted to glTF and simplified by EmAI". Do not recolour or restyle a vendor's robot; geometry cuts only remove hidden internals (screws, PCBs) and reduce triangles |
| No endorsement (BSD clause 3; Apache §6 grants no trademark rights) | Showroom entrance and credits: „Alle Namen und Marken gehören ihren Inhabern. Kein Hersteller hat diese Halle geprüft oder unterstützt.“ Use names only to identify the product, and use no vendor logos beyond what the model geometry carries |
| Keep real vendors out of the critique (R6 Q5) | „Hersteller X“ stays fictional. The showroom never stages a real robot failing; over-spec payload shows as a gauge („über Angabe“), never as a collapse |
| UR terms | Only UR5e (or UR10e) meshes from BSD-3 sources. A CI check fails on any path containing `ur8long`, `ur15`, `ur18`, `ur20` or `ur30` |
| Open Duck Mini | Player text says „Open Duck Mini, ein offenes Projekt“; never Disney, BDX or Star Wars |
| Spot | Write "Spot" with "Boston Dynamics" as the maker; credits add „Spot ist eine Marke von Boston Dynamics“ |
| Spec and price freshness | Every card shows „Stand 17.10.2026“; a yearly refresh task re-checks §2–§3 (the G1 price has already changed between sources) |

---

## 7. Showroom design: „Schauhalle“

### 7.1 Where it sits

Three options; **A is recommended**:

| Option | Where | Room | Pros | Cons |
|---|---|---|---|---|
| **A · Schauhalle Nord** | a glass pavilion **x −15…+15, z −52…−80** on the north spoke, between 02 Regelgarten and 03 Greifwerkstatt, entered from the ring path and left through the north door to the Glasbalkon | 30 × 28 m, 9 m clear height | room for 20 robots, the FANUC (2.11 m at rest) and a compare stage. Clearances checked against GDD §4: ≥ 3 m to both plot circles, 3.5 m to the ring path, 5 m to the Glasbalkon disc, inside the deck (r ≤ 81.4 m). The cloud window behind the H2 is the money shot | a new structure; not in sight from the spawn (behind the tower) |
| B · Tower foyer only (R6) | foyer, inner r ≈ 8.2 m, 7 m high, oculus Ø 4 m in the centre [S64] | ≈ 200 m² minus oculus, lift door and two desks | visible from minute one; no new building | room for 3–4 robots at most; no FANUC, MiR or compare stage. Works only as a "car tower": one robot on a turntable, the rest in a stacker rack |
| C · Shop windows on the Recamán-Allee | glass cases along the avenue between Prüffeld and Dunkelfabrik | 11 m wide strip | seen on the very first walk | narrow, ≤ 1 m from the plot circle; risks the GDD §4.7 first view of the medallion |

**Recommendation:** A as the showroom, plus R6's idea for the foyer as the **„Lieferannahme“**. Deliveries arrive there by drone and are unboxed on a podium, then the robot rolls or is carried along the north spoke to its plinth (a short scripted walk; under reduced motion it simply appears). The H2's cover is lit in the north window, so you can see it from the plaza and the north spoke.

### 7.2 Layout

```
                      N (−z)        Glasbalkon (0, −92)
   z = −80 ┌────────── Glasfront · Wolkenfenster · Ausgang ──────────┐
           │  [TRESOR: H2 unter Plane]     ◎ BÜHNE A      ◎ BÜHNE B  │  ← hero + compare turntables, 1 local spot
           │                                                         │
           │  GEHEN (West)            ║ Mittelgang ║   GREIFEN & FAHREN (Ost)
           │  ◯ R1   ◯ G1   ◯ H1      ║ (Nordspeiche)║   ◯ UR5e  ◯ FR3  ◯ iiwa 14
           │  ◯ Apollo   ◯ TALOS      ║            ║   ◯ Shadow Hand ◯ 2F-85 ◯ SO-101
           │  ◯ Go2  ◯ Spot  ◯ ANYmal D║  ▣ LASTPROBE║   ◯ Stretch 3  ◯ TIAGo  ◯ MiR250
           │  ◯ Open Duck Mini        ║  (Kistenwaage)  ▭ FANUC R-2000iC/165F (fixed plinth, Ø 3.5 m)
           │                                                         │
           │  ═══ GRÖSSENWAND: all 20 + EMI 1,55 m + „Du“, 0–2,5 m ═══  ⌂ EMPFANG · Lastenheft-Terminal
   z = −52 └──────────── Glasfront · Eingang vom Ringweg (r 48.5) ────────────┘
                      S (+z) → Turm (0, 0)          x = −15 … +15
```

The flow follows a car dealer's: shop window → reception desk → the cars on turntables → the "new model" under a cover at the back. The central aisle continues the north spoke, so the hall is also the way to the Glasbalkon.

### 7.3 Car-dealership elements

| Element | Spec |
|---|---|
| Turntables | Ø 2.4 m for humanoids and quadrupeds, Ø 1.6 m for arms; hands and grippers on 0.9 m columns. 1 turn per 40 s; stopped under reduced motion. The FANUC stands on a fixed plinth: „zu schwer für den Drehteller: 1090 kg“ |
| Spotlights | Emissive ring light in each turntable edge plus a fake additive light cone (one instanced draw). Real local lights only on Bühne A and the Tresor (GDD: ≤ 2 local per space, no shadows) [S64] |
| Floor and walls | Dark glossy floor (low roughness, reflections from a static environment map, no screen-space reflections), white ceramic plinths, category pylons with GEHEN / GREIFEN & FAHREN |
| „Datenblatt“ stand | A waist-high stand like a car's price sign, with the name, the status chip and 4 key numbers in 3D text (BatchedText). E opens the full card (§7.4) |
| Größenwand | All 20 robots as silhouettes at true scale in one row, sorted by height, in front of a 0–2.5 m scale with 10 cm ticks. Two fixed figures: EMI 1.55 m and „Du“ (capsule 1.75 m, eye 1.65 m, GDD §4.1). A laser line follows your eye height along the wall |
| Lastprobe (Kistenwaage) | A rack of grabbable loads (1 kg, 2 kg, 5 kg, and one 18 kg Dunkelfabrik crate) and three load points: the MiR250 top plate, Spot's rails and a hook under a UR5e. A gauge shows load as % of HERSTELLERANGABE with the condition beneath it. It uses the unused grab verb (R6 F-09) |
| Compare stage | Bühne A + B side by side at true scale, with the two cards aligned row by row. Differences are shown neutrally, with no winner and no score (UR terms aside, ranking real vendors is off-brand) |
| Configurator | Variants where the vendor lists them and the model exists: Spot with or without arm, G1 with or without hands, H2 or H2 Plus with hands. A toggle swaps the GLB |
| „Probefahrt“ | On robots that are playable elsewhere (SO-101 → Lern-Dojo, Open Duck → Regelgarten, Unitree ladder → R3's area): a button sets the objective and compass to that station |
| EMI as the honest salesperson | EMI-01 stands at the reception desk: „Ich verkaufe dir nichts. Ich zeige dir das Datenblatt – und die Bedingung dazu.“ |
| Tresor | The H2 stands under a white cover on a lit plinth in front of the cloud window. Its card is readable from the start (no learning sits behind a gate), and only the unveiling is the trophy (R6 §6.5) |

### 7.4 The „Datenblatt“ card (DOM panel, opens with E)

At open it shows ≤ 35 words (R6 text diet); the rest sits on a „Mehr“ tab.

| Row (DE / EN) | Content | Chip |
|---|---|---|
| Kopf / Header | name, vendor, category, status („LIEFERBAR“, „PILOT“, „SELBSTBAU“) | — |
| Größe / Height | vendor value; next to it what you measured with the Messlatte, with the MODELL value | HERSTELLERANGABE · MODELL |
| Gewicht / Weight | value | HERSTELLERANGABE or QUELLE |
| Gelenke / Joints (DOF) | value; a „Gelenke zeigen“ toggle highlights every joint axis on the turntable model | HERSTELLERANGABE · MODELL |
| Nutzlast / Payload | value **plus its condition** (e.g. „bei gestrecktem Arm“, „Nennlast · Spitze“) | HERSTELLERANGABE |
| Reichweite, Tempo, Laufzeit / Reach, speed, runtime | values; „k. A.“ where none is given | HERSTELLERANGABE |
| Kann heute / Grenzen | the two lines from §2.3 | — |
| Preis / Price | only if the founder agrees (Q1); see §3 | LISTENPREIS · Stand |
| Modell & Lizenz / Model & licence | source, SPDX, attribution (one line) | — |
| Quelle / Source | vendor URL, „Stand 17.10.2026“ | — |

Chips: **HERSTELLERANGABE / VENDOR SPEC** (new, R6), **QUELLE / SOURCE** (existing chip, for press or distributor values), **MODELL / MODEL** (new: measured on the 3D model in the game). There is one chip per number, as in GLOSSARY.

### 7.5 How you move through it, and what fills it over time

1. You enter from the ring path, step onto the „Du“ mark at the Größenwand and see yourself next to EMI, the R1 and the H1. EMI says one line.
2. Free roam. E at a plinth starts **Inspektion**, the existing operate mode: orbit with mouse or arrow keys, zoom with the wheel, ←/→ for the next robot, C sends this robot to the compare stage, Esc leaves. The model on Bühne A switches to its full LOD.
3. The Lastenheft terminal at the reception desk starts the starred station (§8).
4. The north exit leads to the Glasbalkon.

**Deliveries (Entdecker), aligned with R6 §6.4–6.5:**

| When | Robots |
|---|---|
| From the start („Bestand“, 9) | UR5e, FR3, iiwa 14, 2F-85, Go2, Stretch 3, TIAGo, TALOS, MiR250 |
| Thruster tests (6; one per zone, matching its verb) | M1 SEHEN → ANYmal D · M2 REGELN → Open Duck Mini · M3 GREIFEN → Shadow Hand · M4 LERNEN → SO-101 · M5 ARBEITEN → FANUC R-2000iC/165F · M6 MESSEN → Spot |
| Humanoid ladder (R6 §6.5 / R3) | R1 (first thruster), G1 (3 thrusters), H1 (after the lift-off), H2 (unveiled at the ladder's gate) |
| Stars | Apollo (threshold to calibrate, e.g. ≈ 25 ★) |

An undelivered robot stands as a closed crate on its plinth, with its card readable. In Entscheider mode everything is unpacked from the start except the H2 cover: 25 minutes leave no room for waiting.

---

## 8. Starred station „Lastenheft“ (Probieren → Verstehen → Messen in one station)

**Loop:** the terminal deals 3 jobs („Aufträge“) from a pool. Only stated values count: a „k. A.“ row never fits a job. For each you walk to the robot you think fits and press E „Passt“, or press „Keiner passt“ at the terminal. The deciding card rows then light up, green or red, **with their condition**. R deals new jobs.

- **Probieren:** walk, look, load the Kistenwaage.
- **Verstehen:** the condition row decides, not the headline number.
- **Messen:** your answer is checked against the sourced rows; you have to justify it by tapping the deciding row.

**Stars (they rate your method, never a robot):**
- ★ = 2 of 3 jobs right.
- ★★ = 3 of 3 right, with the deciding row tapped each time.
- ★★★ = ★★ plus the trick job („Keiner passt“) right on the first try.

**Job pool** (every answer comes only from §2; ✓ = fits, ✗ = does not):

| Job (DE / EN) | Answer | Deciding row (source) |
|---|---|---|
| „Paletten bis 200 kg durch eine ebene Halle fahren.“ / "Move pallets of up to 200 kg across a flat hall." | MiR250 ✓ | payload 250 kg [S47] |
| „Staubdicht (IP6x) und Treppen bis 45° für eine Inspektionsrunde.“ / "Dust-tight (IP6x) and stairs up to 45° for an inspection round." | ANYmal D ✓ (Spot ✗: IP54) | IP67, stairs up to 45° [S38]; Spot IP54 [S35] |
| „Draußen bei −20 °C eine Runde laufen.“ / "Walk a round outdoors at −20 °C." | Spot ✓ (ANYmal D ✗: typical −10 °C) | −20 to 55 °C [S35]; ANYmal D typical 14–122 °F [S38] |
| „12 kg heben, 0,8 m Reichweite, Drehmomentsensoren in allen Achsen.“ / "Lift 12 kg, 0.8 m of reach, torque sensors in every axis." | iiwa 14 ✓ (UR5e ✗ 5 kg, FR3 ✗ 3 kg) | 14 kg, 820 mm, 7 axes with torque sensors [S42] |
| „Ein Auto-Bauteil von 150 kg heben.“ / "Lift a 150 kg car part." | R-2000iC/165F ✓ | 165 kg [S44] |
| „Einen Arm zum Selberbauen, offen und für LeRobot gemacht.“ / "An arm you build yourself, open and made for LeRobot." | SO-101 ✓ | Apache-2.0, LeRobot [S22] |
| „Forschungs-Humanoid mit Drehmomentsensoren, 6 kg pro Arm.“ / "Research humanoid with torque sensors, 6 kg per arm." | TALOS ✓ | 6 kg per arm stretched, torque sensors [S49] |
| „Ein Humanoid soll dauerhaft 10 kg pro Arm halten.“ / "A humanoid must hold 10 kg per arm continuously." | **Keiner passt** (H2 rated ≈ 7 kg, 15 kg only peak; G1 ≈ 2–3 kg; R1 ≈ 2 kg; TALOS 6 kg; Apollo: no vendor condition) | [S31][S29][S32][S49][S53] |
| **Trick:** „Ein Vierbeiner soll eine Dunkelfabrik-Kiste (18 kg) tragen.“ / "A quadruped must carry one Dark Factory crate (18 kg)." | **Keiner passt** (Spot 14 kg, Go2 max ≈ 10–12 kg, ANYmal D 10 kg of sensors) | [S35][S33][S39]; crate 18 kg [S64] |

**Kistentest as a warm-up (no stars):** „Eine Kiste aus der Dunkelfabrik wiegt 18 kg. Wer kann sie nehmen?“ By a single vendor figure only the R-2000iC/165F (165 kg, about 9 crates) and the MiR250 (250 kg, about 13 crates) can. The H2 makes it only on paper, with both arms at peak (2 × ≈ 15 kg), and not at rated load (2 × ≈ 7 kg): a second lesson. Apollo's 25 kg comes from press reports, so it stays grey („nur QUELLE“). The crate ruler links the showroom to what you carried yourself in 05 A.

**Text and time budget:** jobs ≤ 12 words, the result lesson ≤ 14 words; one round takes ≈ 2–3 min.

---

## 9. Entscheider take-away

Route (≈ 2 min, R6 §6.7): Größenwand → the G1 card (arm load with its posture footnote) → one Lastenheft job → Befundkarte.

What decision makers learn here:
1. **Every spec has a condition.** Payload depends on pose (G1, R1: "varies greatly with arm extension postures" [S29][S32]). Rated is not peak (H2: 7 kg vs 15 kg [S31]). Recommended is not maximum (ANYmal D: 0.75 vs 1.3 m/s [S38]). Lift is not drag (Spot Arm: 11 vs 25 kg [S36]).
2. **Check the status before the spec.** Some are deliverable, some in pilots (Apollo), some discontinued (Booster T1, reserve), some still in development: Unitree itself writes that "some sample functions … are still being developed" and that the industry "is in the early stages of exploration" [S29][S31].
3. **Environment is a spec too.** IP rating and temperature range (IP40, IP54 or IP67; −20 °C) decide more jobs than speed.
4. **A list price is not the cost** (only if prices are shown). Spot's 2020 base kit was US$ 74,500, and accessories were sold separately [S37].

Output: the **Befundkarte „Datenblatt“**, holding your job, the robot you picked, the condition you checked and the open question for the vendor, linked to the nine questions (GDD App. C: Q1 "Wie ist Erfolg definiert?" and Q9 "zweite Umgebung" fit directly) [S64].

---

## 10. Text proposals (DE default · EN), always „du“

| Where | DE | EN |
|---|---|---|
| Hall sign | SCHAUHALLE · Roboter, die es heute gibt | SHOWROOM · Robots that exist today |
| Entrance plaque | Jede Zahl hier ist eine Herstellerangabe mit Quelle und Datum. Nachmessen erlaubt. | Every number here is a vendor spec with a source and a date. Measuring is allowed. |
| Disclaimer (entrance + credits) | Alle Namen und Marken gehören ihren Inhabern. Kein Hersteller hat diese Halle geprüft oder unterstützt. | All names and trademarks belong to their owners. No manufacturer has reviewed or endorsed this hall. |
| EMI-01 greeting | Ich verkaufe dir nichts. Ich zeige dir das Datenblatt – und die Bedingung dazu. | I'm not selling you anything. I'll show you the datasheet, and the condition behind it. |
| Größenwand | Du: 1,75 m · EMI: 1,55 m · Wer ist größer als du? | You: 1.75 m · EMI: 1.55 m · Who is taller than you? |
| Messlatte result | Gemessen: 1,32 m · Datenblatt: 1,32 m. Passt. | Measured: 1.32 m · datasheet: 1.32 m. It fits. |
| Messlatte mismatch | Modell 0,52 m, Angabe ca. 42 cm. Warum? Pose, Kopf, Antennen. | Model 0.52 m, spec about 42 cm. Why? Pose, head, antennas. |
| Kistenwaage | Lade auf. Bei 100 % ist die Herstellerangabe erreicht. | Load it up. At 100 % you've reached the vendor spec. |
| Over the limit | Über der Angabe. Was dann passiert, steht in keinem Datenblatt. | Above the spec. No datasheet says what happens next. |
| G1 condition | Armlast ca. 2 kg – „variiert stark mit der Armhaltung“ (Unitree). | Arm load about 2 kg, "varies greatly with arm posture" (Unitree). |
| Lastenheft start | Drei Aufträge. Finde den passenden Roboter – oder sag, dass keiner passt. | Three jobs. Find the right robot, or say that none fits. |
| Lastenheft lesson | Die Zahl allein reicht nicht. Die Bedingung entscheidet. | The number alone isn't enough. The condition decides. |
| Compare stage | Zwei Datenblätter, eine Bühne. Gleiche Zeile, gleiche Bedingung? | Two datasheets, one stage. Same row, same condition? |
| H2 cover | Unitree H2 · 1,82 m · noch verhüllt. Das Datenblatt liegt schon aus. | Unitree H2 · 1.82 m · still under cover. Its datasheet is already here. |
| Delivery toast | Lieferung: ANYmal D · ausgepackt in der Schauhalle | Delivery: ANYmal D · unboxed in the showroom |
| FANUC plinth | Zu schwer für den Drehteller: 1090 kg. | Too heavy for the turntable: 1090 kg. |
| Entscheider quote | Der Hersteller selbst schreibt: Die Branche ist „in einer frühen Phase der Erkundung“. | The vendor itself writes that the industry is "in the early stages of exploration". |
| Price chip (if Q1 = yes) | LISTENPREIS · ohne Steuern und Versand · Stand 17.10.2026 | LIST PRICE · excl. tax and shipping · as of 2026-10-17 |
| Status chips | LIEFERBAR · PILOT · SELBSTBAU · EINGESTELLT | AVAILABLE · PILOT · DIY · DISCONTINUED |

---

## 11. Performance plan

**Budgets today:** worst view ≤ 500 draw calls / ≤ 1.5 M triangles; per zone detail ≤ 80 draws / ≤ 90 k; EMI ≤ 20 draws / 15 k near [S64]. rc4 measured a worst of 350 draws and 0.88 M triangles. Robots are far denser than the procedural props, so the showroom needs its own tier (lead approval):

| Scope | Draw calls | Triangles | Notes |
|---|---|---|---|
| **Schauhalle detail** (player inside or ≤ 45 m) | **≤ 80** | **≤ 300 k** | worst case adds to ≤ 0.9 M + 0.3 M = 1.2 M; most zone details are culled at that distance |
| Hall exterior (≤ 130 m) | ≤ 15 | ≤ 40 k | shell + robot silhouettes (L2) |
| Far | ≤ 2 | ≤ 3 k | |

**LOD tiers per robot:**

| Tier | Used for | Max visible | Humanoid | Quadruped / mobile | Arm | Hand / gripper / small | Draw calls |
|---|---|---|---|---|---|---|---|
| **L0 Bühne** | Bühne A and B, Inspektion | **2** | ≤ 80 k | ≤ 60 k | ≤ 40 k | ≤ 25 k | ≤ 3: one rigid-skinned mesh (one bone per link, weight 1), ≤ 3 materials, as the tower's drawing arm does [S64] |
| **L1 Podest** | plinths ≤ 12 m away | ≈ 10 | ≤ 20 k | ≤ 15 k | ≤ 10 k | ≤ 6 k | 1–2: static pose, merged per material |
| **L2 Silhouette** | plinths > 12 m, Größenwand, exterior | all | ≤ 3 k | ≤ 3 k | ≤ 2 k | ≤ 1 k | 1 for all of them (BatchedMesh) |

Worst case inside: 2 × 80 k + 10 × ≈ 13 k + 20 × ≈ 2.5 k ≈ 340 k. So the plan caps L1 at 8 near plinths, or uses 9 m as the L1 edge, to stay ≤ 300 k. Draw calls ≈ hall 15 + turntables 2 + text 2 + cones 1 + L1 8 × 2 + L0 2 × 3 + L2 1 + crates 1 ≈ 44.

**Materials and shaders:** every robot uses the same three shared materials: vertex colour standard, metal and visor glass. A delivery therefore compiles no new shader program (check with `tools/warmup.mjs` and `tools/progdiag.mjs`). ANYmal D's JPGs become one 1024² atlas; Stretch 3's 12 textures are baked to vertex colour.

**Loading:**
- The showroom is its own lazy chunk, like a zone. Its L2 set and the hall load after the title, at idle. The L1 set loads when you are ≤ 80 m from the hall.
- L0 loads on E at a plinth, with L1 shown on the turntable until it is ready. An LRU keeps 3 L0 models and drops one 60 s after you leave Inspektion.
- **The delivery crate is the loading placeholder:** a robot is unboxed only when its GLB has arrived, which hides latency diegetically.
- Assets are self-hosted glTF with `EXT_meshopt_compression`, using three.js's own MeshoptDecoder. There are no third-party requests (DECISIONS: zero requests to other origins).

**Transfer estimate** (the asset pipeline measures the real figure; assumed ≈ 4–8 bytes per triangle after quantisation, meshopt and brotli): L2 set ≈ 60 k triangles ≈ 0.3–0.5 MB; L1 set ≈ 270 k ≈ 1.1–2.2 MB; one L0 ≈ 0.2–0.6 MB. Proposed cap: **≤ 2.5 MB for L1 + L2, ≤ 0.6 MB per L0.** The first load stays at rc4's 1.68 MB. The GDD's "total transfer < 8 MB" (written for a game without real robots) needs a new number once R1–R3 assets are known (Q6). The showroom and the zones share one GLB per robot (SO-101, Open Duck, Unitree), so nothing loads twice.

**Physics:** the Kistenwaage uses ≤ 8 dynamic bodies. Load points are sensors (sum of masses on a plate), not a simulated robot.

**Tests to add:** 6 showroom views in `npm run perf` (entrance, Größenwand, Bühne with 2 × L0, the east island, the Tresor, the exterior from the ring path); `tools/hitches.mjs` across a delivery and an L0 swap; the 20 cards in `tools/text-audit.mjs`.

---

## 12. Hand-off to the asset pipeline (per robot)

| # | Start file | Pose for L1/L2 | Cut list | Target L0 |
|---|---|---|---|---|
| 1 R1 | `unitree_ros/robots/r1_description/R1.urdf` | stand | drop `*_collision` and the ankle constraint rods | 80 k |
| 2 G1 | Menagerie `unitree_g1/g1.xml` (hands variant for the configurator) | keyframe `stand` | — | 80 k |
| 3 H1 | Menagerie `unitree_h1/h1.xml` | default | — | 80 k |
| 4 H2 | `unitree_ros/robots/h2_description/H2_dae.urdf` (colours) or `H2.urdf` | stand | — | 80 k |
| 5 Apollo | Menagerie `apptronik_apollo.xml` | keyframe `stand` | 1.55 M → heavy decimation; check the face | 80 k |
| 6 TALOS | Menagerie `talos.xml` | default | — | 80 k |
| 7 Go2 | Menagerie `go2.xml` | keyframe `home` | instanced legs | 60 k |
| 8 Spot | Menagerie `spot.xml` + `spot_arm.xml` | keyframe `home` | — | 60 k |
| 9 ANYmal D | `anymal_d_simple_description/urdf/anymal.urdf` | default | none (19.6 k already) | 20 k as is |
| 10 Stretch 3 | Menagerie `stretch.xml` | keyframe `home` | bake 12 textures | 60 k |
| 11 TIAGo | Menagerie `tiago.xml` | raise the torso to the vendor's max (145 cm) for the card photo | — | 60 k |
| 12 MiR250 | `mir_robot` `mir_250_base.stl` (+ wheels from the URDF) | — | — | 25 k |
| 13 UR5e | Menagerie `ur5e.xml` | keyframe `home` | — | 40 k |
| 14 FR3 | Menagerie `fr3.xml` | keyframe `home` | — | 40 k |
| 15 iiwa 14 | Menagerie `iiwa14.xml` | keyframe `home` | — | 40 k |
| 16 R-2000iC | `fanuc_description` r2000ic_165f DAE + macro (all joint rpy are 0; offsets in §4) | zero pose (2.11 m) | none (69.6 k) | 40 k |
| 17 SO-101 | Menagerie `so101.xml` (share with the VLA teammate) | default | 401 k → decimate the servo housings | 25 k |
| 18 Open Duck | `Open_Duck_Mini` v2 `robot.xml` (share with the RL teammate) | stand | 2.39 M: drop hidden internals (PCBs, connectors, screws, Pi Zero), keep the shell | 25 k |
| 19 Shadow Hand | Menagerie `right_hand.xml` | open hand | — | 25 k |
| 20 2F-85 | Menagerie `2f85.xml` | open | — | 15 k |

Every GLB carries `extras.source`, `extras.commit`, `extras.spdx` and `extras.attribution` (from §4), so the credits page and the card's licence row are generated, not typed. `artifacts/phase7/showroom/measurements.json` holds all raw counts.

---

## 13. Founder questions

1. **Show prices?** (a) list prices with source and date where the vendor publishes one, „auf Anfrage“ otherwise, and Spot labelled historical; (b) no prices; (c) bands only (€ / €€ / €€€). *Recommended: (a)*, because "price ≠ cost" is a real lesson for Entscheider. DECISIONS D5's "no prices" concerns EmAI's own services, not robot list prices.
2. **Where does the showroom go?** (A) Schauhalle Nord plus the foyer as the delivery podium; (B) foyer only, as a "car tower" with 1–4 robots; (C) shop windows on the Allee. *Recommended: A.*
3. **The four amber models (Spot, MiR250, KUKA iiwa 14, Robotiq 2F-85):** (a) build them now and run a legal review plus a short courtesy note to each vendor before public release; (b) wait for a written no-objection; (c) drop them. *Recommended: (a).*
4. **Open Duck Mini:** its design is openly inspired by a Disney character robot. Show it, named only „Open Duck Mini“? *Recommended: yes*, with no Disney reference and a legal glance.
5. **Deliveries:** gate robots by progress (9 at the start, 6 by thrusters, 4 on the humanoid ladder, Apollo by stars) or show all 20 from the start? *Recommended:* gated in Entdecker mode, all unpacked in Entscheider mode, and the H2 under its cover in both.
6. **Download budget:** the GDD caps total transfer at < 8 MB. Robots from R1–R4 will exceed it over a full playthrough, even with lazy loading. *Recommended:* keep the first load at ≈ 1.7 MB and set new caps: showroom ≤ 2.5 MB (L1 + L2) and ≤ 0.6 MB per full model loaded on demand.
7. **Do the Lastenheft stars count?** They would raise the total from 54 to 57 ★, and with it the H2 gate. *Recommended: yes.*

---

## 14. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Amber provenance (Spot, MiR250, iiwa, 2F-85) | a vendor could object to its geometry being shown | legal review and a courtesy note before release (Q3); a swap-in reserve (Kinova Gen3, FANUC CRX-10iA) is licence-clean |
| Real brands in a game about honest measurement | could read as endorsement or as criticism | the disclaimer, neutral compare with no scores, real vendors kept out of „Hersteller X“, no staged failures |
| UR terms leaking in | a later "add the UR20" breaks §1.1 of UR's terms | CI path check (§6); this report as the record |
| Fourier licence conflict | a model that looks open is not | excluded until Fourier confirms |
| Disney design IP (Open Duck) | trademark or design complaint | no Disney naming; legal glance (Q4) |
| Spec and price drift | cards go stale (the G1 price changed; H2 price sources conflict: US$ 29,900 vs ≈ 90,000) | „Stand“ date on every card; yearly refresh; secondary values carry QUELLE |
| Secondary-only values (Apollo size and payload, Booster, iiwa weight, MiR runtime, Stretch payload) | a number turns out wrong | QUELLE chip; replace with vendor datasheets when obtained |
| Raw triangle counts (Open Duck 2.39 M, Apollo 1.55 M) | decimation artefacts or budget overrun | the hidden-internal cut list (§12); visual QA against vendor photos; L0 caps |
| Model vs vendor height (Open Duck 0.52 m vs ≈ 42 cm; H2 1.832 vs 1.82 m) | players think the model is wrong | turn it into the lesson („Warum? Pose, Kopf, Antennen“) |
| Untextured Menagerie models look plain next to the textured ANYmal D and FANUC | uneven look | one shared material set; vendor colours from the DAE where they exist |
| Text volume (20 cards × DE/EN) | text budget and translation load | ≤ 35 words at open; generated rows; one owner for the card data |

---

## 15. Sources (all accessed 2026-10-17)

| ID | Source | URL |
|---|---|---|
| S1 | MuJoCo Menagerie @ 62ab00f, README "License and Disclaimer" | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35 |
| S2 | Menagerie `unitree_g1` (LICENSE, README) | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35/unitree_g1 |
| S3 | Menagerie `unitree_h1` | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35/unitree_h1 |
| S4 | Menagerie `unitree_go2` | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35/unitree_go2 |
| S5 | Menagerie `apptronik_apollo` (LICENSE, CHANGELOG, first commit 84fafbd) | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35/apptronik_apollo |
| S6 | Menagerie `pal_talos` | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35/pal_talos |
| S7 | Menagerie `boston_dynamics_spot` | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35/boston_dynamics_spot |
| S8 | Menagerie `hello_robot_stretch_3` | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35/hello_robot_stretch_3 |
| S9 | Menagerie `pal_tiago` | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35/pal_tiago |
| S10 | Menagerie `universal_robots_ur5e` | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35/universal_robots_ur5e |
| S11 | Menagerie `franka_fr3` | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35/franka_fr3 |
| S12 | Menagerie `kuka_iiwa_14` | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35/kuka_iiwa_14 |
| S13 | Menagerie `robotstudio_so101` | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35/robotstudio_so101 |
| S14 | Menagerie `shadow_hand` | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35/shadow_hand |
| S15 | Menagerie `robotiq_2f85` | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35/robotiq_2f85 |
| S16 | Menagerie reserve folders (`kinova_gen3`, `universal_robots_ur10e`, `rainbow_robotics_rby1`, `booster_t1`, `leap_hand`, `anybotics_anymal_c`, `fourier_n1`) | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35 |
| S17 | unitree_ros @ 5994d4f (LICENSE BSD-3-Clause; `robots/h2_description`, `h2_plus`, `r1_description`) | https://github.com/unitreerobotics/unitree_ros/tree/5994d4faef0a9cadd3287f8de0199a67eeb2a259/robots |
| S18 | ANYbotics anymal_d_simple_description @ d5bf4dc (LICENSE © 2023 ANYbotics AG) | https://github.com/ANYbotics/anymal_d_simple_description/tree/d5bf4dc3a81af81a16b9598fc15c98e339f45a33 |
| S19 | FANUC fanuc_description @ fb40c98 (README "Licensing", SPDX headers, LICENSES/) | https://github.com/FANUC-CORPORATION/fanuc_description/tree/fb40c9803a826ba68c7c8e28ba904a25efa7fcd2 |
| S20 | DFKI mir_robot @ c08dfad (LICENSE, `mir_description/package.xml`, commit 592396c "Add mir_250 meshes") | https://github.com/DFKI-NI/mir_robot/tree/c08dfad93be53ac12969f0f37a01a2b74b5c1997 |
| S21 | Open Duck Mini v2 @ b23317a (README: "about 42 centimeters", "under $400", RL; LICENSE Apache-2.0) | https://github.com/apirrone/Open_Duck_Mini/tree/b23317a485b3cec7d8417f352478778b3475173c |
| S22 | TheRobotStudio SO-ARM100 README and LICENSE (HEAD a758567) | https://github.com/TheRobotStudio/SO-ARM100 |
| S23 | Universal_Robots_ROS2_Description @ d4042c1: README "License", `meshes/ur20/LICENSE.txt` (UR T&Cs v1.01) | https://github.com/UniversalRobots/Universal_Robots_ROS2_Description/tree/d4042c1f5123c86645cc5dbd650b4f461f697ee9 |
| S24 | RAI spot_description @ 156d180 (LICENSE MIT + BSD-3-Clause) | https://github.com/rai-opensource/spot_description/tree/156d1802bfb117f219dbfce7597d283d5fabc968 |
| S25 | franka_description NOTICE (HEAD 7aeeddc) | https://github.com/frankarobotics/franka_description/blob/main/NOTICE |
| S26 | FFTAI Wiki-GRx-Models LICENSE (GPL-3.0) | https://github.com/FFTAI/Wiki-GRx-Models |
| S27 | BoosterRobotics booster_gym LICENSE (Apache-2.0, © 2024 Booster Robotics) | https://github.com/BoosterRobotics/booster_gym |
| S28 | ros-industrial/abb @ 45f4769, `abb_crb15000_support` (Apache-2.0) | https://github.com/ros-industrial/abb/tree/45f4769d826cf3ac62a65495f2db67b78b0c81df/abb_crb15000_support |
| S29 | Unitree G1 product page (specs, price, footnotes) | https://www.unitree.com/g1/ |
| S30 | Unitree H1 product page | https://www.unitree.com/h1/ |
| S31 | Unitree H2 product page (specs, price, footnotes) | https://www.unitree.com/H2/ |
| S32 | Unitree R1 product page | https://www.unitree.com/R1/ |
| S33 | Unitree Go2 product page | https://www.unitree.com/go2/ |
| S34 | Unitree shop, H1 (search result; unverified) | https://shop.unitree.com/en-fr/products/unitree-h1 |
| S35 | Boston Dynamics Spot specifications | https://bostondynamics.com/products/spot/ |
| S36 | Boston Dynamics Spot Arm | https://bostondynamics.com/products/spot/arm/ |
| S37 | TechCrunch, 2020-06-16: Spot for US$ 74,500 (seen via search result) | https://techcrunch.com/2020/06/16/now-any-us-business-can-buy-boston-dynamics-spot-robot-for-74500 |
| S38 | ANYbotics ANYmal D spec sheet (US) | https://www.anybotics.com/ANYbotics_Specs_US.pdf |
| S39 | ANYbotics ANYmal page (payload, speed, runtime, IP67) | https://www.anybotics.com/robotics/anymal/ |
| S40 | Universal Robots UR5e datasheet (updated September 2026) | https://www.universal-robots.com/manuals/latest/en/datasheets/ur5e/ |
| S41 | Franka Research 3 page and datasheet 2.6 (July 2026) | https://franka.de/franka-research-3 · https://franka.de/hubfs/Datasheet%20Franka%20Research%203_R02212_2.6_EN_July%202026.pdf |
| S42 | KUKA LBR iiwa product page | https://www.kuka.com/en-de/products/robot-systems/industrial-robots/lbr-iiwa |
| S43 | RoboDK, LBR iiwa 14 R820 (weight; QUELLE, seen via search result, unverified) | https://robodk.com/robot/KUKA/LBR-iiwa-14-R820 |
| S44 | FANUC America, R-2000iC/165F | https://www.fanucamerica.com/products/robots/series/r-2000/r-2000ic-165f |
| S45 | FANUC America, CRX-10iA | https://www.fanucamerica.com/products/robots/series/collaborative-robot/crx-10ia |
| S46 | Kinova Gen3 one-pager 2026 | https://www.kinovarobotics.com/uploads/Kinova_Onepager_Gen3_2026_EN.pdf |
| S47 | MiR250 product page | https://mobile-industrial-robots.com/products/robots/mir250 |
| S48 | MiR250 weight and runtime (search results citing MiR spec sheets; QUELLE, unverified) | https://konicaminolta.com.au/products/robotics/mir250 |
| S49 | PAL Robotics TALOS | https://pal-robotics.com/robot/talos/ |
| S50 | PAL Robotics TIAGo | https://pal-robotics.com/robot/tiago/ |
| S51 | IEEE Spectrum, 2024-02-15, Stretch 3 (price, weight) | https://spectrum.ieee.org/hello-robot-stretch-3 |
| S52 | Hello Robot Stretch 3 hardware guide and spec (search snippets; unverified) | https://docs.hello-robot.com/0.3/hardware/hardware_guide_stretch_3 |
| S53 | Engadget, 2023: Apollo size, payload, battery (QUELLE, seen via search result) | https://www.engadget.com/apptroniks-apollo-is-the-latest-humanoid-robot-to-beat-tesla-to-market-164246161.html |
| S54 | The Robot Report: Apptronik funding and Apollo production (status; QUELLE, seen via search result, unverified) | https://www.therobotreport.com/apptronik-brings-in-another-520m-to-ramp-up-apollo-production/ |
| S55 | Apptronik home page and Apollo 2 page (uses, partners, swappable batteries) | https://apptronik.com/ · https://apptronik.com/apollo/apollo-2 |
| S56 | Shadow Robot Dexterous Hand series | https://www.shadowrobot.com/dexterous-hand-series/ |
| S57 | Robotiq Adaptive Grippers product sheet (search; 85 mm, 20–235 N, 5 kg, 0.9 kg) | https://blog.robotiq.com/hubfs/Product-sheets/Adaptive%20Grippers/Product-sheet-Adaptive-Grippers-EN.pdf |
| S58 | Robotiq Adaptive Grippers page | https://robotiq.com/products/adaptive-grippers |
| S59 | Rainbow Robotics RB-Y1 | https://rainbow-robotics.com/en/products/rb-y1/ |
| S60 | LEAP Hand (v1 site) | https://v1.leaphand.com/ |
| S61 | RobotShop, Booster T1 Standard (QUELLE; "discontinued"; seen via search result, unverified) | https://www.robotshop.com/products/booster-t1-humanoid-robot-standard |
| S62 | RedHotCyber, 2025-10-20: H2 launch (QUELLE, seen via search result, unverified) | https://www.redhotcyber.com/?p=137562 |
| S63 | humanoid.guide, H2 (≈ US$ 90,000, "Prototype"; QUELLE, seen via search result, conflicts with S31) | https://humanoid.guide/product/h2/ |
| S64 | Internal: GDD §4.1, §4.3, §6.1–6.2, §7.5 (18 kg crates), §11, App. C; DECISIONS; ARCHITECTURE §6 | `docs/GDD.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md` |
| S65 | Internal: R6 quest review §5, §6.4–6.7, Q5 | `docs/research/R6-QUEST-REVIEW.md` |
| S66 | SPDX licence list (BSD-2-Clause, BSD-3-Clause, BSD-3-Clause-Clear, MIT, Apache-2.0, GPL-3.0) | https://spdx.org/licenses/ |
| S67 | UR Terms and Conditions for Use of Graphical Documentation (copy in S23) | https://www.universal-robots.com/legal/terms-and-conditions/terms_and_conditions_for_use_of_graphical_documentation.txt |
| S68 | Hello Robot stretch_urdf LICENSE (Clear BSD, © 2021–2024 Hello Robot) | https://github.com/hello-robot/stretch_urdf |
| S69 | RoboDK, ABB CRB 15000 (QUELLE, seen via search result, unverified) | https://robodk.com/robot/ABB/CRB-15000 |
