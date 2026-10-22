# R3 · Unitree humanoids and world models

Phase 7 research, topic R3. Baseline: rc4. Date: 2026-10-17. This report changes no code. It covers (1) Unitree's humanoid line-up as of October 2026, smallest first, (2) the real, licensable 3D models for each robot, (3) internal notes (removed for the public edition), (4) world models: what they are, the key systems, how they help humanoids and where they fail, and (5) a playable zone, the **Traumhangar**, where you work your way from the R1 up to the H2.

All web sources were accessed on **2026-10-17**. Every number has a source in §9, or is marked *unverified* or **ILLUSTRATIV** (a toy-model parameter to calibrate). Scratch files are in `artifacts/phase7/unitree-world-models/`, and the pinned download is in `artifacts/phase7/downloads/r3-unitree_ros_5994d4f/`.

---

## 0. Verdict in one screen

1. **Public 3D models exist for every Unitree humanoid the game needs, the R1 and H2 included.** They are in `unitreerobotics/unitree_ros` (BSD-3-Clause, © Unitree Robotics), pinned here at commit `5994d4f` (2026-09-30): R1, R1 AIR, G1 (all variants, plus the new G1+), H1, H1-2, **H2** (since 2026-02-25) and **H2 Plus** (since 2026-06-01). MJCF versions are in `unitree_mujoco` and MuJoCo Menagerie. The BSD licence covers the meshes, because no separate terms exist and Menagerie states that Unitree supplied "the original URDF and assets … under a BSD-3-Clause License". The only exceptions are third-party hands bundled in Unitree's repos (Sharpa, Inspire, BrainCo), whose authorship is unclear: leave them out. **No founder question is needed about a missing H2 model.**
2. **The line-up, smallest first:** R1 (1.23 m, ≈ 29 kg, 26 DoF, from $5,900) → G1 (1.32 m, ≈ 35 kg, 23–43 DoF, $13.5K) → G1+ (1.34 m, new in September 2026) → H1 (≈ 1.80 m, ≈ 47 kg) → H1-2 (≈ 1.78 m, ≈ 70 kg, 27 DoF) → **H2** (1.82 m, ≈ 70 kg, 31 DoF, $29,900) → H2 Plus (the NVIDIA reference humanoid, 31 + 44 hand DoF, no price). The August 2026 "Superman" sprinter is a prototype that has not been checked independently and has no model: leave it out.
3. **Web cost is small once the meshes are reduced.** The raw meshes are 250k–790k triangles and 13–42 MB per robot. A measurement on EmAI's own G1 copy: 383k → **40k triangles = 152 KB** (97 KB brotli) with meshopt, and the silhouette still reads (§2.4). Plan on 25–40k triangles and one skinned mesh per robot.
4. **The world model inside the game must be EmAI's own toy model.** Unitree's open world model UnifoLM-WMA-0 is **CC BY-NC-SA 4.0** (non-commercial). Cosmos 3 (OpenMDW-1.1) and GR00T-Dreams (Apache-2.0) are open but do not run in a browser.
5. (Internal notes removed for the public edition.)
6. **Zone proposal: Traumhangar** („Erst im Kopf durchspielen, dann erst anfassen."). Before acting, the robot shows **ghost futures**. You learn when to trust them. Each station runs Probieren → Verstehen → Messen on a bigger robot: **R1** (trust the ghost?) → **G1** (how far ahead should it dream?) → **H1-2** ◆ (do dream data help? Measure in a closed loop) → **H2** mastery test (a long task, a limited dream budget, and one crate whose weight is over the robot's rated payload). The ladder is consistent with R6 §6.5 (§5.10).

---

## 1. Unitree humanoid line-up (October 2026), smallest first

### 1.1 Body and performance (official pages unless marked)

| Robot | Height (stand) | Weight (with battery) | DoF body / hands | Arm payload | Speed | Battery / runtime |
|---|---|---|---|---|---|---|
| **R1 AIR** | 1230 mm | ≈ 27 kg | 20 (6/leg, 4/arm) / none | "about 2 kg" [U-R1] ¹ | not stated | ≈ 1 h, quick-release |
| **R1** | 1230 mm | ≈ 29 kg | 26 (6/leg, 5/arm, 2 waist, 2 head) / none | "about 2 kg" ¹ | not stated | ≈ 1 h |
| **R1 EDU** | 1230 mm | ≈ 29 kg | 26–40 / dexterous hand optional | "about 2 kg" ¹ | not stated | ≈ 1 h |
| **G1** | 1320 mm (fold 690 mm) | ≈ 35 kg | 23 (6/leg, 1 waist, 5/arm) / none | ≈ 2 kg ² | 2 m/s at launch [heise-G1]; not on the current page | 9000 mAh, ≈ 2 h |
| **G1 EDU** | 1320 mm | ≈ 35 kg+ | 23–43 / Dex3-1: 7 per hand (thumb 3, index 2, middle 2), tactile optional | ≈ 3 kg ² | as G1 | ≈ 2 h |
| **G1+** (Sept 2026) | 1340 mm | ≈ 35 kg | 25 (+2 neck) / EDU 25–45 | ≈ 3 kg (EDU ≈ 4 kg) ² | not stated | 9000 mAh, ≈ 2 h, plus an external supply option |
| **H1** | ≈ 180 cm (1520+285 mm) | ≈ 47 kg | 19 (5/leg, 4/arm, 1 torso) ³ / optional | not stated | **3.3 m/s** ("world record"), "potential > 5 m/s" | 15 Ah (0.864 kWh), runtime not stated |
| **H1-2** | ≈ 178 cm | ≈ 70 kg | 27 (6/leg, 7/arm, waist) / optional (Dex5-1 etc.) | rated ≈ 7 kg, peak ≈ 21 kg | "< 2 m/s" | 15 Ah (0.864 kWh) |
| **H2** | **1820 mm** | ≈ 70 kg | **31** (6/leg, 7/arm, 3 waist, 2 head) / EDU: "multiple model options" | rated ≈ 7 kg, peak ≈ 15 kg | not stated | 15 Ah (0.972 kWh), **≈ 3 h** |
| **H2 Plus** (June 2026) | 1820 mm | ≈ 70 kg | 31 / Sharpa Wave 22 per hand, **75 total** | rated ≈ 7 kg, peak ≈ 15 kg | not stated | 0.972 kWh, ≈ 3 h |

¹ The R1 page lists "about 2 kg" in the row "Maximum Torque of Arm Joint". The unit does not match the label, and the footnote says the arm load "varies greatly under different arm extension postures". ² The same posture footnote applies to the G1. ³ The official H1 page gives no total. 19 comes from the per-limb counts on the page and from `h1_description/README.md` ("Basic H1 Humanoid have 19 joints").

Leg and arm geometry on the official pages: H2 calf + thigh 1045 mm, forearm + upper arm 690 mm. G1 calf + thigh 0.6 m. Peak joint torque: H1 and H2 legs 360 N·m, H2 arms 120 N·m, G1 knee 90 N·m (EDU 120 N·m).

### 1.2 Compute, sensors, dates, demos

| Robot | Compute | Sensors (official) | Announced / shipping | Notable demos (sourced) |
|---|---|---|---|---|
| R1 | 8-core CPU (EDU: optional module) | R1: binocular camera; AIR: monocular; 4-mic array; **no LiDAR listed** | Unveiled 2025-07-25 at WAIC Shanghai, 39,999 yuan [IE-R1]. Delivery dates *unverified* | cartwheel, running downhill, getting up from the ground [IE-R1] |
| G1 | 8-core CPU; EDU "such as Orin" (Jetson Orin NX, 100 TOPS per an EU distributor's model overview [Reichelt]) | depth camera + 3D LiDAR (Livox MID-360 + RealSense D435 [heise-G1]) | Unveiled at ICRA, May 2024, $16,000 [heise-G1]; model in `unitree_ros` since 2024-05-15 | G1-Boxing / "Iron Fist King" and G1-Comp (RoboCup) are application plans on unitree.com |
| G1+ | 8-core CPU; EDU module optional | binocular 2 MP (H110°), wide-angle chest camera, 3D LiDAR, 6 mics, head touch | Launched mid-September 2026 [TechNode]; URDF `g1_pl` dated 2026-09-23 | *none found* |
| H1 | Intel Core i5 (platform) + i7 (user); optional i7 / Orin NX | 3D LiDAR + depth camera, "360° depth sensing" | Teased 2023-08-15, "below $90,000", availability "3 to 10 years" [TRR-H1] | 16 H1 at the 2025 Spring Festival Gala (unitree.com news); **1500 m gold at the 2025 World Humanoid Robot Games, 6:34.40** [R247], with the H1 robots "manually operated" [TRR-WHRG] |
| H1-2 | i5 + i7; optional i7 / Orin NX (up to 3) | as H1 | Release date *unverified*; model in `unitree_ros` since 2024-10-09 | *none found* |
| H2 | PC1 i5; H2 EDU PC2 i7 plus a high-power module (e.g. Thor) | binocular wide-FOV camera, mic array; no LiDAR listed | Revealed 2025-10-20 as "Destiny Awakening" (secondary source, *unverified*); list price on unitree.com | ballet-style spins, kickboxing, walking beside a human model; a human-like face with eyes, nose and lips [eWeek-H2] |
| H2 Plus | Jetson T5000 (Thor), "2070 TFLOPS (FP4, sparse)", 128 GB; plus i5/i7 | head binocular camera (H140°), optional wrist cameras, IMU | Announced 2026-06-01 as the "Isaac GR00T reference" humanoid with NVIDIA and Sharpa, "late 2026" [GT-H2P] | research platform (Stanford and UCSD named as users [GT-H2P]) |

### 1.3 Other 2026 Unitree models (not for the ladder)

| Model | What it is | Why not in the ladder |
|---|---|---|
| R1-A5 / A7 (-D) | upper body only (dual arm, 15–22 DoF) on a fixed or mobile base; 11–32 kg; "from $4,290" [U-R1D] | not a walking humanoid (models exist: `r1_a5_description`, `r1_a7_description`, `r1d_description`) |
| G1-D, H2-D | data-collection platforms ("application plan"); `g1_d_description`, `h2d_description` (2026-09-16) | not walking humanoids |
| "Superman" (Aug 2026) | prototype; Unitree claims 12.66 m/s and a ≈ 2 m standing jump. "The records have not been externally verified." [SH] | no specs, no model, unverified claims |

### 1.4 Prices (separate on purpose: whether they appear in the game is founder question Q4)

| Robot | Official list price (unitree.com, excluding tax and shipping) | Other price points |
|---|---|---|
| R1 AIR / R1 / R1 EDU | $4,900 / $5,900 / contact sales | launch: 39,999 yuan [IE-R1] |
| G1 / G1 EDU | US $13.5K / contact sales | $16,000 at launch, 2024 [heise-G1]. EU distributor's model overview [Reichelt], *not re-checked*: G1 EDU U1–U10 €31,500–57,959 |
| G1+ / G1+ EDU | US $15K / contact sales | RMB 95,000 in China [TechNode] |
| H1 / H1-2 | not shown | H1 "from 90,000 US dollars" (2024) [heise-G1] |
| H2 / H2 EDU | **$29,900** / contact sales | US retail with tariffs ≈ $40,500 (RobotShop, search summary, *unverified*) |
| H2 Plus | not listed | none found |

### 1.5 What the spec sheets do not say (useful for game honesty)

- **Walking speed** is missing for R1, H2 and the current G1 page. Use "nicht angegeben" (not stated), never a guess.
- Every Unitree page carries the same footnotes: parameters "may vary in different scenarios and configurations", "keep a sufficient safe distance", and "the humanoid robot industry is in an early stage … understand its limitations". These fit the house line well.
- **URDF masses differ from the datasheets.** The URDF sums are H1 59.3 kg vs ≈ 47 kg official, H2 75.6 kg vs ≈ 70 kg, G1 29dof 33.3 kg vs ≈ 35 kg. Use the official figures on cards and the URDF only for looks.

---

## 2. Real 3D models

### 2.1 Availability (all measured from the pinned checkout, commit `5994d4faef0a9cadd3287f8de0199a67eeb2a259`, 2026-09-30)

| Robot | Repo path (unitree_ros) | Added / last change | Visual meshes | Files / size | Triangles (visual) | Zero-pose height | URDF mass | Joints (movable) |
|---|---|---|---|---|---|---|---|---|
| **R1** | `robots/r1_description/R1.urdf` + `meshes/` | `9b3b6e5` 2026-01-29 / `bbd833d` 2026-04-08 | STL | 40 / 22.3 MB | 446,727 | 1.230 m | 28.84 kg | 26 |
| R1 AIR | `robots/r1_air_description/R1_AIR.urdf` | `3d8d582` 2026-02-03 / `8ab3359` 2026-03-30 | STL | 34 / 22.6 MB | 452,192 | 1.230 m | 26.68 kg | 20 |
| **G1** (current) | `robots/g1_description/g1_29dof_rev_1_0.urdf` | `727e8f8` 2024-05-15 / `5994d4f` 2026-09-30 | STL | 35 / 19.7 MB | 393,270 | 1.323 m | 33.34 kg | 29 |
| G1 + Dex3-1 | `…/g1_29dof_with_hand_rev_1_0.urdf` | same folder | STL | 49 / 31.5 MB | 629,338 | 1.323 m | 34.39 kg | 43 |
| G1+ | `…/g1_pl.urdf` (README: "G1+ upper body dated 2026-09-23") | same folder | STL | 37 / 21.5 MB | 430,059 | 1.346 m | 35.31 kg | 31 |
| H1 | `robots/h1_description/urdf/h1.urdf` (+ `mjcf/h1.xml`) | `e197ae1` 2023-12-07 / `34e7506` 2025-12-31 | STL (+ DAE) | 21 / 17.3 MB | 345,765 | 1.806 m | 59.34 kg | 19 |
| **H1-2** | `robots/h1_2_description/h1_2_handless.urdf` | `18f4921` 2024-10-09 / `c0b722b` 2026-02-11 | STL | 28 / 27.4 MB | 549,596 | 1.788 m | 66.98 kg | 27 |
| **H2** | `robots/h2_description/H2.urdf` (STL) or `H2_dae.urdf` (DAE) | `ad5c7db` 2026-02-25 / `80b9643` 2026-08-26 (head meshes) | STL; DAE with per-material colours (black face, white shell; Cinema 4D export) | 34 / 12.8 MB (STL), 30.4 MB (DAE) | 256,242 (STL), 259,500 (DAE) | 1.832 m | 75.59 kg | 31 |
| H2 Plus | `robots/h2_plus/H2_Plus.urdf` (body DAE + `meshes/{left,right}_sharpa/` STL) | `6a119a9` 2026-06-01 | DAE + STL | 58 / 41.6 MB | 744,623 | (not measured: DAE body) | 77.24 kg | 75 |

Other sources of the same robots:

| Source | Path, commit | Licence | Notes |
|---|---|---|---|
| `unitreerobotics/unitree_mujoco` | `unitree_robots/{r1,g1,h1,h1_2,h2}/` at `1eb6642` (2026-09-07). H2 added `c1ccb76` 2026-06-04, R1 added `c598f10` 2026-05-18 | BSD-3-Clause | MJCF for physics: `h2/h2_mujoco.xml` (meshes 13.1 MB), `r1/R1_C++.xml` (22.7 MB), `g1/g1_29dof.xml` (33.3 MB) |
| `google-deepmind/mujoco_menagerie` | `unitree_g1/`, `unitree_h1/` at `62ab00f` (folders last changed `71f066a`, 2026-07-04) | BSD-3-Clause (Unitree copyright in the folder `LICENSE`) | "simplified" MJCF. G1 is derived from `g1_29dof_rev_1_0.xml`, and the MJX version was "successfully transferred to hardware" (folder README) |
| `unitreerobotics/xr_teleoperate` | `assets/{g1,h1,h1_2,h2,r1}` at `817fb00` | Apache-2.0 (code) | derived copies; take the originals from `unitree_ros` |
| `unitreerobotics/unitree_rl_gym` | `resources/robots/{g1_description,h1,h1_2}` at `276801e` | BSD-3-Clause | copies, plus pretrained `deploy/pre_train/{g1,h1,h1_2}/motion.pt` |
| `unitreerobotics/unitree_rl_lab` | `deploy/robots/g1_29dof/config/policy/velocity/v0/exported/policy.onnx` (1.66 MB) at `4960b84` | Apache-2.0 | a **real G1 walking policy as ONNX** (stretch, §2.5). The "mimic" dance policies ship with BVH-derived motion CSVs of *unknown origin*: do not use them |

**Answer to the brief's precise question:** public, licensed models exist for **R1** (`r1_description`, since 2026-01-29) and **H2** (`h2_description`, since 2026-02-25; MJCF since 2026-06-04). Both are under the repo's BSD-3-Clause. Note that `robots/README.md` lists R1, R1 Air and H2 but not H2 Plus.

### 2.2 Licence, attribution, trademark

| Item | Finding |
|---|---|
| Licence | `unitree_ros/LICENSE`: **BSD-3-Clause**, "Copyright (c) 2016-2022 HangZhou YuShu TECHNOLOGY CO.,LTD. ("Unitree Robotics")". No folder carries other terms. The only stray field is `h1_description/package.xml`, which says `<license>TODO</license>`. A grep of the descriptions finds no "non-commercial" or "all rights reserved" text. |
| Meshes covered? | **Yes, in practice.** They are part of the BSD-licensed repo, and Menagerie states that "the original URDF and assets were provided directly by Unitree Robotics under a BSD-3-Clause License". **Exception:** third-party hands bundled by Unitree (Sharpa Wave in `h2_plus`, Inspire DFQ/FTP in `g1_description/inspire_hand` and `h1_2_with_FTP_hand`, BrainCo in `g1_with_brainco_hand`) are other companies' products, so their authorship is unclear. **Leave them out**, and use Unitree's own Dex3-1 if hands are needed. |
| Obligations (web game = "binary form") | (1) Reproduce the copyright notice, the conditions and the disclaimer "in the documentation and/or other materials", which means `LICENSES/BSD-3-Clause-Unitree.txt` plus a credits line in the game. (2) Clause 3: Unitree's name must not "endorse or promote" the game, so no implied partnership. Modifications such as decimation and recolouring are allowed. |
| Trademark | "UNITREE" is a registered US word mark (reg. 2018-03-13) [Justia]. **No public Unitree brand or trademark policy was found.** Use the names only to identify the real products (nominative use), no Unitree logo in the UI, and no "official" wording. Observation: the original meshes may carry embossed lettering. Something like it shows on the G1's upper back in §2.4's render; *not checked*. It belongs to the real product, so do not crop it out or highlight it. |
| Proposed credit line | DE: „3D-Modelle Unitree R1, G1, H1-2, H2: unitreerobotics/unitree_ros (Commit 5994d4f), © 2016–2022 HangZhou YuShu Technology Co., Ltd. („Unitree Robotics"), BSD-3-Clause; für den Browser vereinfacht. Unitree ist eine Marke ihres Inhabers. Keine Verbindung zu Unitree Robotics und keine Empfehlung durch Unitree Robotics." EN: "3D models Unitree R1, G1, H1-2, H2: unitreerobotics/unitree_ros (commit 5994d4f), © 2016–2022 HangZhou YuShu Technology Co., Ltd. ("Unitree Robotics"), BSD-3-Clause; simplified for the browser. Unitree is a trademark of its owner. Not affiliated with or endorsed by Unitree Robotics." |

### 2.3 EmAI's local copy (in a private EmAI project)

- **Origin:** a download script in that project sparse-clones `unitreerobotics/unitree_ros` and copies `robots/g1_description/g1_29dof.urdf` to `g1.urdf`. It records no commit.
- **Verified identical:** the git blob of `g1.urdf` = `49aeacd8…` = upstream `g1_29dof.urdf` at `5994d4f`, and all 165 local meshes are byte-identical to upstream. Upstream now has 173, the extra 8 being newer ones such as G1+.
- **Caveats:**
  - `g1_29dof` is marked **"Deprecated"** in the upstream README (mode 2, old hip gear ratio). Use `g1_29dof_rev_1_0` (also Menagerie's source) or `g1_pl` (G1+).
  - **No licence file** was copied along, and `provenance.json` only says "Existing EmAI repository Unitree G1 model". Add the BSD-3 text if the copy is reused.
- `g1.glb` was exported with trimesh (`convert-to-glb.py`, yourdfpy): 382,618 triangles, 7.68 MB, **0 materials**, nodes in zero pose. Do not ship it as is.

### 2.4 Web budget: measured, not guessed

Test: the local `g1.glb` → `gltfpack 0.24.0` (MIT) with simplification and meshopt compression (`-si … -cc -kn`). The renders are three.js r186 in headless Chromium (`artifacts/phase7/unitree-world-models/g1_decimation.png`).

| Simplify ratio | Triangles | GLB bytes | Brotli bytes | Visual (full figure, 1600 × 700 render) |
|---|---|---|---|---|
| original | 382,618 | 7,679,280 | n/a | reference |
| 0.25 | 95,868 | 319,904 | 212,073 | no visible difference |
| **0.10** | **39,759** | **151,620** | **96,978** | silhouette, joints and head read |
| 0.05 | 23,696 | 102,216 | 62,285 | still reads as a G1 at room distance |

**Recommendation for the pipeline lane:**
- Build each robot from its URDF: one node per link in the kinematic tree, then **one rigid-skinned mesh** (one bone per link) so the whole robot costs one or two draw calls.
- Make three LODs: about 30k triangles active, 8k docked, 4k ghost.
- Colours: from the URDF materials (`dark`/`white`), and for the H2 from the DAE materials.
- Expected download for R1 + G1 + H1-2 + H2 with three LODs each: **about 0.6–1.0 MB** (extrapolated from the G1 row, *estimate*), loaded with the zone chunk and not at first load. three.js already ships `GLTFLoader` and `meshopt_decoder.module.js`.

### 2.5 Real motion, if wanted (stretch)

- Unitree ships a real **G1 velocity policy** as ONNX (Apache-2.0, 1.66 MB, `unitree_rl_lab`).
- The MJCF (`unitree_mujoco`, BSD-3) and MuJoCo's WebAssembly build could in principle make the G1 walk *physically* in the browser.
- That costs megabytes and CPU and covers one robot only. For v1, use **kinematic gait animation** with an honest chip (§5.9), and keep the real policy as a showroom stretch.

---

## 3. What EmAI has done and decided (summary, no customer data)

(Internal notes removed for the public edition.)

---

## 4. World models

### 4.1 What they are

A **world model** is a learned model that predicts the next observations or states **given an action**: *if I do this, what will I see next?* A video generator answers "how does this plausibly continue?". A world model answers "how does it continue **if I do this**?" (EmAI deck). NVIDIA's Cosmos paper calls a world foundation model "a general-purpose world model that can be fine-tuned into customized world models" and opens with "Physical AI needs to be trained digitally first" [Cosmos-WFM]. Some predict **pixels** (Cosmos, Genie, 1XWM), others a **compressed state** (V-JEPA 2: "latent instead of pixels", which is faster to plan with but cannot be watched).

### 4.2 Key systems (state: October 2026)

| System | Who, when | What it predicts | Open? | Robot relevance (with numbers) |
|---|---|---|---|---|
| **Cosmos** WFM platform | NVIDIA, Jan 2025 [Cosmos-WFM] | video futures; curation, tokenizers, pre- and post-trained models | open weights, "permissive licenses" | base of GR00T-Dreams. Predict 2.5 (repo created Sep 2025, code Apache-2.0) has robot action-conditioned and policy checkpoints (Feb 2026) [Predict2.5] |
| **Cosmos 3** | NVIDIA, 2026-05-31 [NV-C3] | one model for reasoning, video generation and actions; forward dynamics (frame + actions → video) and inverse dynamics (video → actions) | **OpenMDW-1.1**, "ready for commercial and non-commercial use"; Nano 16B [HF-C3] | **Supported action spaces include Franka, UR, WidowX, Agibot, egocentric and others, but no bipedal humanoid.** The model card itself warns: physics, contact and "object permanence" are only approximated, with "disappearing or morphing objects" [HF-C3] |
| **DreamGen / GR00T-Dreams** | NVIDIA et al., May 2025 [DreamGen] | 4 stages: fine-tune a video world model on robot data → generate videos → recover pseudo-actions (latent action model or IDM) → train a policy on the "neural trajectories" | code Apache-2.0 | Fourier GR1 humanoid: **22 new behaviours** from teleop data of a single pick-and-place task. New behaviours in a seen environment **11.2 % → 43.2 %**, in unseen environments **0 % → 28.5 %**. Most runs used WAN2.1 as the video model [DreamGen-html] |
| **Genie 3** | Google DeepMind, 2025-08-05 [Genie3] | real-time interactive worlds, 720p at 24 fps, consistent "for a few minutes", visual memory "as far back as one minute" | closed. "Project Genie" for US AI Ultra subscribers since 2026-01-29, generations capped at 60 s [PGenie] | used as a training world for DeepMind's SIMA agent. Limits: constrained action space, multi-agent interaction, "a few minutes … rather than extended hours" |
| **V-JEPA 2 / 2-AC** | Meta, 2025-06-11 [VJEPA2] | latent future states (no pixels); planning by model-predictive control toward image goals | open | pretrained on > 1 M h of internet video plus **< 62 h** of unlabelled robot video (DROID); **zero-shot** on Franka arms in 2 labs: pick-and-place cup 80 %, box 65 % (the Cosmos baseline, run in lab 2 only, scored lower; column mapping as read from the paper's table). **16 s per action vs 4 min with Cosmos.** Stated limits: "autoregressive prediction suffers from error accumulation", camera sensitivity, image goals only [VJEPA2-html] |
| **1X World Model** | 1X, 2024-09-17 [1X-2024] and 2026-01 (NEO) [1X-2026, TRR-1X] | 2024: learned simulator to **evaluate** policies. 2026: text-conditioned video (14B backbone; 900 h human egocentric video; 70 h robot data) → an inverse-dynamics model → actions on the NEO humanoid | closed (a 2024 dataset was released) | 2024 failure modes: objects "may completely disappear", a plate stays "suspended in the air". 2026: "generations tend to be overly optimistic about task completion", weak 3D grounding, tasks > 5 s need replanning; best-of-8 raised "pull tissue" from 30 % to 45 %; 11 s per inference for 5 s of video |
| **DreamerV3 / Dreamer 4** | Hafner et al. (Google DeepMind), Nature 2025-04 [DreamerV3]; Dreamer 4, 2025-09 [Dreamer4] | latent dynamics; the agent **learns inside its imagination** | open | V3: one configuration beats specialised methods on > 150 tasks, and is the first agent to collect Minecraft diamonds from scratch. Dreamer 4: diamonds "purely from offline data", real-time on one GPU |
| **GAIA-2 / -3 / -4** | Wayve (driving): GAIA-3 on 2025-12-02 [Wayve] | camera-video futures for driving; GAIA-3 has 15 B parameters | closed | world model as an **evaluation** tool: "GAIA-3 simulated testing closely mirrors real-world driving results" (vendor claim, no data published) |
| **UnifoLM-WMA-0** | Unitree, 2025-09-15 [UnifoLM] | a world model as "Simulation Engine" (synthetic data) and "Policy Enhancement" (predicts outcomes for an action head); data from Z1 arms and **G1** | **CC BY-NC-SA 4.0** (non-commercial) | the only Unitree world model; **not usable** in EmAI's public game |
| **GR00T N1.7** | NVIDIA, 2026 [GR00T] | not a world model: an open humanoid VLA with a Cosmos-Reason2-2B backbone | Apache-2.0 (code) | Unitree G1 shown in its README |

### 4.3 How world models help humanoids

| Use | How | Evidence |
|---|---|---|
| **Synthetic training data** ("dreams") | Generate videos of new tasks, label them with an IDM, add them to training | DreamGen: 22 new behaviours on a humanoid; 0 → 28.5 % in unseen environments [DreamGen-html] |
| **Planning by imagination** | Before acting, roll candidate actions through the model and pick the best (model-predictive control) | V-JEPA 2-AC zero-shot pick-and-place 65–80 % [VJEPA2-html]; 1XWM on NEO turns prompt → video → actions [1X-2026] |
| **Policy evaluation** | Run policies in the learned simulator instead of on a real robot | 1X 2024 [1X-2024]; Wayve GAIA-3 for driving [Wayve] |
| **Learning inside the model** | Train the policy on imagined rollouts | DreamerV3, Dreamer 4 [DreamerV3, Dreamer4] |

### 4.4 Limits (what the game must teach)

| Limit | Evidence |
|---|---|
| **Hallucinated physics.** Looking right is not the same as being physically right | Physics-IQ: physical understanding "severely limited, and unrelated to visual realism" [PhysIQ]; 1X: a plate "suspended in the air" [1X-2024]; Cosmos 3 card: "unrealistic collisions" [HF-C3] |
| **Errors compound over the horizon** | V-JEPA 2: "error accumulation"; the candidate space grows exponentially with the horizon [VJEPA2-html]. MBPO's answer: "short model-generated rollouts branched from real data" [MBPO]. Genie 3 lasts minutes, not hours [Genie3]; 1X: > 5 s needs replanning [1X-2026] |
| **Object permanence** | Cosmos 3 card: "disappearing or morphing objects" [HF-C3]; 1X: objects "may completely disappear" [1X-2024] |
| **Optimism** | 1X: "overly optimistic about task completion and depth understanding" [1X-2026] |
| **Case-based, not rule-based** | Models "fail to abstract general physical rules": fine in-distribution, failure out of distribution; when they generalise, they weigh colour > size > velocity > shape [Kang] |
| **Coverage** | Cosmos 3's action spaces include no bipedal humanoid [HF-C3]; UnifoLM-WMA is non-commercial [UnifoLM] |
| **Cost and latency** | 4 min per planned action (Cosmos) vs 16 s (V-JEPA 2-AC) [VJEPA2-html]; 11 s per 5 s of video (1X) [1X-2026] |
| **Uncertainty is measurable** | An ensemble of models disagrees where it does not know; PETS combines "uncertainty-aware … dynamics models with sampling-based uncertainty propagation" [PETS]. **The ghost spread in the game is exactly this** |
| **Offline ≠ closed loop** | (Internal notes removed for the public edition.) |

### 4.5 What a decision maker should ask (candidates for new question cards)

| # | DE (du) | EN |
|---|---|---|
| 10 | „Mit Traumdaten trainiert: Wurde geschlossen am Roboter gemessen, mit n und Intervall?" | "Trained on dream data: was it measured closed-loop on the robot, with n and an interval?" |
| 11 | „Wie weit reicht die Vorhersage, bevor der Fehler zu groß wird, und wie oft wird neu geplant?" | "How far does the prediction reach before the error gets too big, and how often does it replan?" |
| 12 | „Kennt das Weltmodell deinen Roboter, deine Kameras und deine Teile?" | "Does the world model know your robot, your cameras and your parts?" |

Further questions for the Befundkarte's "Für dein Werk": Which offline metric, and does it beat a do-nothing baseline? How many dreams were rejected, and by what filter? Real-only vs real + synthetic on the same budget (an ablation)? Licence of the weights (OpenMDW, Apache, or **non-commercial**)? Latency per decision on the robot's own computer?

---

## 5. Zone design: Traumhangar

### 5.1 Fantasy and frame

| | |
|---|---|
| Id / eyebrow | `traumhangar` · `// 07 · TRÄUMEN · WELTMODELLE` / `// 07 · IMAGINE · WORLD MODELS` |
| Name | **Traumhangar** / **Dream Hangar** |
| One-line fantasy | A hangar where real two-legged robots stand in charging docks. Before each one moves, it shows you its **dream**: teal ghosts of the next seconds. Then reality runs in orange (the house colours: teal = demonstration or prediction, orange = policy or reality, as in the Lern-Dojo). |
| House line | „Erst im Kopf durchspielen, dann erst anfassen." / "Play it through in your head first, then touch." |
| Landmark | A **Messlatte** wall with the four docks: R1 1.23 m, G1 1.32 m, H1-2 1.78 m, H2 1.82 m, EMI's 1.55 m silhouette and a line at *your* eye height (1.70 m, `Player.ts` EYE_HEIGHT). The **H2 stands in a glass vault from the first minute**, with a ring of 9 star slots that fill as you play. |
| Placement | Lead's call (R6 places the ladder across the deck). The hangar works as a seventh lobe or under the deck next to the Kielraum ("where the island keeps its robots"). |
| Gehirn-Fenster (reused) | three panels: **VORSTELLEN** (ghost spread in cm), **HANDELN** (command), **MESSEN** (ghost vs real trace) |

### 5.2 How you play a humanoid in first person

Real Unitree humanoids are not driven joint by joint. The legs run Unitree's learned walking controller, which takes **velocity commands** from a joystick. The arms are **teleoperated** with XR (Apple Vision Pro, PICO 4 Ultra Enterprise, Meta Quest 3), and the teleop program "can run alongside the robot's motion control program" [xr_teleop]. The H1 robots that won the 2025 Games races were "manually operated" [TRR-WHRG]. The game copies this split:

| Layer | Real counterpart | Input | Stations |
|---|---|---|---|
| **Kommandieren** (legs) | velocity commands to the walking policy | W/S speed, A/D turn; the mouse turns the head (±60°) | A–D |
| **Steuern** (arms, teleop) | XR arm teleoperation | hold right mouse: the hand target follows the mouse on a plane (IK), left click grips or releases | B, D (and C's demos as replays) |
| **Vorstellen** (world model) | model-predictive planning (V-JEPA 2-AC), video model + IDM (1XWM) | **hold Space**: time ×0.1 and ghosts show the next H seconds; wheel = horizon; 1/2/3 = pick a candidate; release = act | A–D |

- **First person = the robot's head camera.** Heights measured from the URDFs: R1 ≈ 1.05–1.16 m, G1 ≈ 1.27 m (D435 link), H1-2 ≈ 1.72 m, H2 ≈ 1.73 m. You drop 0.6 m when you step into the R1 and are back at your own height in the H2. The size difference is *felt*, which is the showroom lesson in play.
- **V toggles a chase camera** (3 m behind): from a head camera a humanoid cannot see its own feet.
- **Entering and leaving:** you step onto the dock's pilot plate and press E (the view blends into the head camera with a visor frame like the Sensordom's). Esc leaves.

### 5.3 The imagination mechanic (engine spec for the toy world model)

| Part | Spec | Chip |
|---|---|---|
| Real world | private Rapier world: floor patches with friction (training floor μ 0.8; ice μ 0.08; glass, loose grating), crates, cart, a service rover; the robot as a kinematic capsule with hand colliders | SIM · LIVE |
| World model | **an ensemble of K = 5 "Traumköpfe"**: copies of that world stepped ahead with the **learned** parameters (μ̂ = 0.8 everywhere, labelled masses, no gusts) plus per-step noise on the robot root and objects. The spread grows roughly with √t; outside the training floor a **bias** appears | ILLUSTRATIV (parameters) |
| Ghosts | each member draws one translucent teal robot plus objects at t + H. The spread = ensemble disagreement (PETS idea), shown as blur and as "Traumschärfe ± x cm" | SIM · LIVE |
| Object permanence | an object hidden from the head camera for > 1.0 s fades out of the dream over 0.5 s, the known failure (Cosmos 3 card, 1X) | ILLUSTRATIV |
| Optimism | grasp outcomes in the dream succeed more often than in reality (calibrate; 1X 2026) | ILLUSTRATIV |
| Cost | one dream = K × H × 60 steps of a world with ≤ 12 bodies, computed once when Space is pressed (≤ 8 ms, spread over frames). A **Traumbudget** (number of dreams) is the compute cost | SIM · LIVE |
| Honesty line (card) | „Hier träumt ein Spielzeug-Weltmodell: dieselbe Physik mit falschen Annahmen und Rauschen. Echte Weltmodelle sind neuronale Netze. Ihre Fehler sehen genauso aus." / "A toy world model dreams here: the same physics with wrong assumptions and noise. Real world models are neural networks. Their mistakes look the same." | n/a |

### 5.4 The unlock ladder

| Tier | Robot (real model) | Unlocked by | Teaches | Horizon |
|---|---|---|---|---|
| 1 | **R1**, 1.23 m, 26 DoF | open at zone entry (or R6: first thruster) | a ghost is a prediction; trust it only on ground it knows | 1 s |
| 2 | **G1**, 1.32 m, 29 DoF | ★ in A | planning by imagination: candidates, horizon, replanning, object permanence | 0.5–8 s, selectable |
| 3 | **H1-2**, 1.78 m, 27 DoF (7-DoF arms, rated ≈ 7 kg) | ★ in B | dream data: generate, filter, measure closed-loop (◆ station) | 6 s dreams |
| 4 | **H2**, 1.82 m, 31 DoF | **mastery gate** (Q1): ★★ in A, B and C, **★★★ in at least two**, and "Traumgüte" (trust calls + predictions in this zone) ≥ 75 %. Target: ≈ 15–25 % of first-pass Entdecker players (calibrate in playtests) | everything on one long task; the datasheet limit beats the dream | reliable to ≈ 2 s, budget 12 dreams |

- **Why H1-2 and not H1 for tier 3:** it has 7-DoF arms and an official payload (rated ≈ 7 kg / peak ≈ 21 kg), and its model was updated in 2026. The H1's 3.3 m/s record and its teleoperated Games gold become facts on its card.
- **Before the H2 is unlocked: the "Traum-Probefahrt".** You can drive the H2 **only as a ghost** on the dream floor, with no stars and no measurement. It is the practice path, and the lesson in one line: „Den H2 kannst du erst nur träumen." / "At first you can only dream the H2."

### 5.5 Stations

#### Station A · R1 · „Erster Schritt im Kopf" (Probieren)

- **Goal:** walk the R1 25 m across the hangar. Six **Weichen** (decision points): three on training floor, then an ice sheen, a glass plate that looks like floor, and a loose grating.
- **Loop:** at each Weiche the R1 stops. **Hold Space** and the ghost walks the next 1 s. Then choose **E „Vertrauen"** (walk on) or **Q „Prüfen"** (a careful probe step, safe, costs 3 s). If you trust it on an unknown patch, the R1 slips and **gets up again** (the real R1 shows this in its launch video [IE-R1]). A dry fail line: „Geträumt: Boden. Gemessen: Eis." / "Dreamed: floor. Measured: ice."
- **Measured value:** „Vertrauen richtig 5/6 · 68 s".
- **Stars:** ★ reach the end (stamp); ★★ ≥ 5/6 correct calls; ★★★ 6/6 in ≤ 75 s (calibrate).
- **Banner lesson:** „Der Traum kennt nur Boden, den er schon gesehen hat." / "The dream only knows floor it has seen before."

| | DE | EN |
|---|---|---|
| Entdecker | „Ein Weltmodell sagt voraus, was passiert, wenn der Roboter etwas tut. Auf bekanntem Boden stimmt das. Auf neuem rät es, und es sieht dabei genauso sicher aus." | "A world model predicts what happens when the robot does something. On known floor it's right. On new floor it guesses, and it looks just as sure." |
| Entscheider | „Ein Weltmodell ist ein gelernter Simulator. Frag zuerst: Auf welchen Daten wurde es trainiert, und sieht dein Werk so aus?" | "A world model is a learned simulator. Ask first: what data was it trained on, and does your plant look like that?" |

#### Station B · G1 · „Wie weit vorausträumen?" (Verstehen)

- **Goal:** carry a 2 kg box (the G1's official arm load is about 2 kg, EDU about 3 kg) from a table around a pillar to a shelf 6 m away while the service rover crosses.
- **Loop:** the G1 dreams **3 candidate plans** (ghost fans) over horizon H. You pick one (1/2/3), or choose „Auto" (the best by predicted distance to the goal). It acts for 1 s and dreams again.
- **Toy-model behaviour:**
  - A short H is myopic: it walks into the dead end behind the pillar.
  - A long H blurs: the rover changes lane in reality but not in the dream, and the box **vanishes from the dream behind the pillar** (object permanence).
- **Prediction (Erst tippen):** „Bei welchem Horizont klappt es am häufigsten?" with chips 0,5 / 1 / 2 / 4 / 8 s.
- **Messlauf:** 20 autonomous runs per horizon in fast-forward (SIM · LIVE) → a Kennlinie of success over H with Wilson bands. ILLUSTRATIV calibration: a hump that peaks near 2 s.
- **Measured value:** „Bester Horizont 2 s · 85 % [64–95] · n = 20".
- **Stars:** ★ deliver once using a dream + run the Messlauf (stamp); ★★ prediction within one chip of the measured best; ★★★ three deliveries in a row in manual pick mode with ≤ 9 dreams in total.
- **Banner lesson:** „Zu kurz geträumt: Sackgasse. Zu weit geträumt: Fantasie." / "Dream too short: dead end. Dream too far: fantasy."
- **Album:** `kiste-weg` „Die Kiste ist weg: Im Traum verschwand sie hinter der Säule." / "The box is gone: in the dream it vanished behind the pillar."

| | DE | EN |
|---|---|---|
| Entdecker | „Je weiter der Roboter vorausträumt, desto mehr Fehler stapeln sich. Darum träumt er kurz, handelt kurz und träumt neu." | "The further the robot dreams ahead, the more errors pile up. So it dreams a little, acts a little, and dreams again." |
| Entscheider | „Frag nach dem Horizont: Wie weit reicht die Vorhersage, und wie oft wird neu geplant? Ein Planungsschritt kann Sekunden bis Minuten kosten." | "Ask about the horizon: how far does the prediction reach, and how often does it replan? One planning step can cost seconds to minutes." |
| Für Neugierige | „Modellprädiktive Regelung: viele Kandidaten träumen, den besten ein Stück ausführen, neu träumen. Kurze Träume ab echten Messungen sind robuster (MBPO). Meta plante so einen Griff in 16 s pro Aktion, mit Pixel-Vorhersage dauerte es 4 min." | "Model-predictive control: dream many candidates, run the best one a little, dream again. Short dreams from real measurements are more robust (MBPO). Meta planned a grasp this way at 16 s per action; with pixel prediction it took 4 min." |

#### Station C ◆ · H1-2 · „Traumdaten" (Messen)

- **Setup:** the H1-2 has 20 real demos of lifting a crate. The new task, **pushing a cart onto the lift**, has none. The hangar's world model can dream it.
- **Steps:**
  1. **Träumen:** „200 Träume" fills a wall with 40 visible dream tiles (2 s ghost loops). About 25 % show glitches of four kinds: crate floats, hand passes through the crate, crate vanishes, feet glide (ILLUSTRATIV).
  2. **Prüfen:** reject tiles by clicking. A „Physik-Lupe" shows contact points and height above the floor.
  3. **Trainieren:** three arms: *nur echt*, *echt + alle Träume*, *echt + geprüfte Träume*.
  4. **Messen:**
     - First the **Offline-Test** (prediction error on held-out dreams). It ranks *echt + alle* best, and a hidden fourth bar, **„Stillstand"**, scores best of all.
     - Then the **Prüfzelle**: closed loop, n = 20 per arm, on the real cart task, with a Kennlinie and Wilson bands.
- **Toy model (ILLUSTRATIV, calibrate):**

  | Arm | Offline error (lower looks better) | Closed-loop success, new task |
  |---|---|---|
  | nur echt | 0.30 | 10 % |
  | echt + alle Träume | 0.18 | 25 % |
  | echt + geprüfte Träume | 0.20 | 45 % |
  | Stillstand (does nothing) | **0.08** | **0 %** |

  The shape follows DreamGen (new behaviours from dreams) and the offline trap; the values are toy values.
- **Prediction:** „Wie viele Prozentpunkte bringen die geprüften Träume im echten Lauf?" (0–40 pp).
- **Measured value:** „Geprüfte Träume: +35 pp [+8, +58] im geschlossenen Lauf · n = 20 · offline hätte Stillstand gewonnen".
- **Stars:** ★ offline + closed loop measured for at least two arms (stamp); ★★ ≥ 90 % of the glitched dreams rejected with ≤ 3 false rejects; ★★★ prediction within ±10 pp **and** you flag the „Stillstand" bar as the offline trap (click → reveal).
- **Banner lesson:** „Offline gut heißt nicht gut. Miss im geschlossenen Lauf." / "Good offline doesn't mean good. Measure closed-loop."
- (Internal notes removed for the public edition.)
- **Question card:** awards the new **#10**. **Album:** `stillstand-gewinnt` „Stillstand gewinnt offline." / "Standing still wins offline."

| | DE | EN |
|---|---|---|
| Entdecker | „Ein Weltmodell kann Übungsdaten für neue Aufgaben erfinden. Manche Träume brechen die Physik. Ob sie helfen, zeigt nur der echte Lauf." | "A world model can invent practice data for new tasks. Some dreams break physics. Only the real run shows whether they help." |
| Entscheider | „Synthetische Daten nur mit Gegenprobe kaufen: echt gegen echt plus synthetisch, gleiches Budget, geschlossen gemessen, mit n." | "Buy synthetic data only with a control: real vs real plus synthetic, same budget, measured closed-loop, with n." |

#### Meisterprüfung · H2 · „Generalprobe" (the hard one)

- **Task (≈ 90 s):** walk 18 m over mixed floor; open the hatch (teleop pull); lift a crate labelled **5 kg**; carry it past the rover lane in a gust; place it on the lift pad. Then a second crate labelled **18 kg** appears (the Dunkelfabrik's crate).
  - The H2's official rated arm payload is ≈ 7 kg (peak ≈ 15 kg). The dream, optimistic, shows the lift succeeding.
  - **The right move is „Ablehnen"** (refuse, and call the cart).
- **Constraints:** a Traumbudget of 12 dreams; the ghosts are reliable to ≈ 2 s and drift beyond that.
- **Stars:** ★ the 5 kg crate on the pad (the H2 is now *yours*: it stands at the rim at lift-off and in the showroom with your time); ★★ no fall and ≤ 12 dreams; ★★★ ≤ 100 s and the 18 kg crate refused.
- **Banner lesson:** „Ein Traum kennt kein Datenblatt. Du schon." / "A dream doesn't know the datasheet. You do."

### 5.6 Entscheider view (≈ 6 min, optional detour or one of the four zones; R6 Q2 decides the route)

1. **„Der Traumdaten-Deal" (≈ 4 min, condensed C).**
   - Offer A: „10.000 Träume, offline +40 %". Offer B: „1.000 geprüfte Träume + Messung im geschlossenen Lauf".
   - You pick one and order the Prüfzelle run. The consequences are visible: A shines offline and does not hold up closed-loop; B is smaller but measurable.
   - Dreams arrive pre-filtered by a „Prüfdienst". The Stillstand bar is visible from the start.
2. **„Horizont" (≈ 1 min):** B's Kennlinie preloaded; you set the horizon a vendor should guarantee.
3. **Befundkarte:**
   - **Messgröße:** Erfolg im geschlossenen Lauf vs. Offline-Fehler; Vorhersagehorizont.
   - **Grenze:** Weltmodelle halluzinieren Physik; der Fehler wächst mit dem Horizont; Objekte verschwinden.
   - **Frage:** #10 (with #11 and #12 as follow-ups, §4.5).
   - **Für dein Werk:** „Synthetische Daten nur mit Ablation und geschlossener Messung; Lizenz der Gewichte prüfen (nicht-kommerziell kommt vor)."

### 5.7 Minute by minute (Entdecker ≈ 15 min, + H2 ≈ 5 min)

| t | Beat |
|---|---|
| 0:00 | Gate: hangar doors open. Four docks, the H2 behind glass, the vault ring at 0/9. EMI-07: „Hier träumen Roboter, bevor sie handeln. Fang klein an." |
| 0:30 | Pilot plate at the R1 dock, view drops 0.6 m. First input within 25 words (FUN-PLAN §2) |
| 0:45–4:00 | **A (R1):** 6 Weichen, first slip on the ice is funny and teaches. Stamp → the G1 dock lights up and the G1 rises from its crouch |
| 4:00–8:30 | **B (G1):** pick ghosts, hit the pillar dead end, find the box missing from the long dream, predict, Messlauf, Kennlinie |
| 8:30–13:30 | **C ◆ (H1-2):** dream wall, filter, offline trap, Prüfzelle. Stamp → thruster test (R6) |
| 13:30–15:00 | Vault check: the ring shows what is missing (e.g. „★★★ in B fehlt"); the Traum-Probefahrt is offered if the gate is closed |
| +5 min | **H2 Generalprobe** once the gate opens (any time later; retry with R) |

### 5.8 Fun hooks, EMI-07, sound

- **The ghost moment:** hold Space and the hangar goes slow, the sound drops an octave, teal ghosts run ahead; release and the orange reality snaps in.
- **Traum-Pannen** (album, 6 entries): crate floats, hand through crate, an extra finger, feet glide on dry floor, the box vanishes, the robot sinks into the floor. Funny, and every one is a documented failure class (§4.4).
- **Size you feel:** eye height changes per robot; door frames and shelves are built so that the H2 sees over the shelf the R1 walks under.
- **The visible goal:** the H2 behind glass from minute one, with a ring that fills.
- **Unboxing beats:** each robot "wakes" (rises from its crouch) when unlocked.

| Trigger | DE | EN |
|---|---|---|
| Enter | „Hier träumen Roboter, bevor sie handeln. Fang klein an." | "Here robots dream before they act. Start small." |
| A first ghost | „Halt die Leertaste. Dann siehst du, was er erwartet." | "Hold Space. Then you'll see what it expects." |
| A ice slip | „Er hat Boden geträumt. Es war Eis." | "It dreamed floor. It was ice." |
| B start | „Wie weit soll er vorausträumen? Tipp erst." | "How far ahead should it dream? Guess first." |
| B box gone | „Hinter der Säule hat er die Kiste vergessen." | "Behind the pillar it forgot the box." |
| C start | „Zweihundert Träume, keiner echt. Welche lügen?" | "Two hundred dreams, none real. Which ones lie?" |
| C trap | „Wer nichts tut, macht offline keine Fehler." | "Do nothing, and offline you make no mistakes." |
| H2 locked | „Den H2 kannst du erst nur träumen." | "At first you can only dream the H2." |
| H2 18 kg | „Der Traum sagt ja. Das Datenblatt sagt sieben Kilo." | "The dream says yes. The datasheet says seven kilos." |

Sound: a dream swell (reversed noise rising for 0.4 s), a ghost hum (detuned sine pair), a reality snap (short click plus low thump), and a slip foley.

### 5.9 Budget and technical notes

- **Zone detail budget (GDD §11): ≤ 80 draw calls, ≤ 90k triangles.**
  - Active robot ≈ 25k triangles (1–2 draws, skinned).
  - 5 ghosts at LOD ≈ 4k each (5 draws, sharing the active robot's geometry with their own skeletons).
  - 3 docked robots ≈ 6k each.
  - Total ≈ 63k triangles and ≈ 12 draw calls for robots.
- **Motion:** kinematic gait (procedural leg IK on the URDF chain plus root motion), arm IK on the shoulder and elbow chain, crates attached by fixed joints. Chip: **„Bewegung animiert, keine Ganzkörper-Physik"** / "Motion animated, no whole-body physics". The stretch option is in §2.5.
- **Spec cards** show official values with a new chip **HERSTELLERANGABE** (as R6 proposes) and the access date; walking speed „nicht angegeben" where Unitree gives none.
- **Assets** are loaded with the zone chunk (≈ 0.6–1.0 MB *estimate*). Add `LICENSES/BSD-3-Clause-Unitree.txt` and the credit line (§2.2).

### 5.10 Relation to R6 (quest review)

- R6 §6.5 proposes the same order (R1 → G1 → H1 → H2), spreads the steps over the macro quest (R1 after the first thruster, G1 at 3 thrusters, H1 after the lift-off), and makes the H2 a mastery trophy.
- This report keeps the H2 as mastery content, uses the **H1-2** (arms and payload) for the ◆ station, and puts the three teaching stations into one zone so the lesson builds A → B → C.
- If the lead prefers R6's spread, the stations move as they are; only the unlock triggers change.

---

## 6. Founder questions

| # | Question | Options | Recommended | Why |
|---|---|---|---|---|
| Q1 | How hard is the H2, and does the lift-off need it? | (a) optional mastery: ★★ in A–C, ★★★ in ≥ 2, Traumgüte ≥ 75 %; (b) R6: ★★★ on all humanoid steps + ≥ 40/54 ★ overall; (c) required for the lift-off | **(a)** | "very hard" as asked, earned by method rather than luck; never blocks the island's lift-off; a practice path exists (Traum-Probefahrt) |
| Q2 | Top tier: H2 or H2 Plus? | (a) H2 (31 DoF, BSD model, Unitree-only meshes); (b) H2 Plus (75 DoF with Sharpa hands) | **(a)** | the Sharpa hand meshes are another company's product inside Unitree's repo, so their licence is unclear; H2 Plus can appear later in the showroom once cleared |
| Q3 | (Internal notes removed for the public edition.) | — | — | — |
| Q4 | Prices in the game? | (a) none (current README rule); (b) official list prices with date, "excl. tax and shipping", showroom only; (c) price classes (€ / €€ / €€€) | **(c)** | teaches the order of magnitude without prices that go stale, are disputed (H2: $29,900 list vs ≈ $40,500 retail) and differ by region |
| Q5 | Wording: may player text say „humanoider Roboter" for Unitree robots? (same as R6 Q6) | (a) yes, for third-party robots only; (b) no, keep „zweibeiniger Roboter" | **(a)** | it is the product category of these robots; EMI stays „kognitiver Roboter" |

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Third-party hand meshes (Sharpa, Inspire, BrainCo) slip in through Unitree URDFs | Use only `*_handless`, `g1_29dof_rev_1_0`, `g1_29dof_with_hand_rev_1_0` (Dex3-1, Unitree), `R1.urdf` and `H2.urdf`/`H2_dae.urdf`. The pipeline fails on any mesh path containing `sharpa`, `inspire` or `brainco` |
| BSD notice forgotten | Licence file plus a credits line (§2.2); also fix the local copy (§2.3) |
| Implied endorsement or trademark misuse | Names only; no Unitree logo in the UI; „Keine Verbindung zu Unitree Robotics" in the credits |
| UnifoLM-WMA-0 (CC BY-NC-SA) used by mistake | The world model in the game is EmAI's toy model only (§5.3); say so on the card |
| Spec drift (Unitree changes pages and models monthly: G1+ in Sept 2026, H2 head meshes in Aug 2026) | Pin commit `5994d4f`; date-stamp the spec cards; re-check before release |
| Player takes the animated walk for real capability | Chip „Bewegung animiert"; no speed numbers that Unitree does not publish |
| Raw meshes break the budget (250k–790k triangles) | Decimate to ≤ 30k (measured: 40k triangles = 152 KB); skinned meshes; LODs |
| The H2 gate frustrates | Optional, a practice path, transparent ring; calibrate the unlock rate in playtests |
| Unverified claims ("Superman" 12.66 m/s, H2 delivery dates, Guinness date) | Not used in the game |
| URDF masses differ from the datasheets (H1 59 vs 47 kg) | Official values on cards; the URDF for visuals only |

---

## 8. Scratch files (git-ignored)

- `artifacts/phase7/unitree-world-models/analyze_urdf.py`, `head_height.py`: URDF analysis (stdlib, read-only); output in `urdf_analysis.txt`.
- `artifacts/phase7/unitree-world-models/glb/*.glb`, `g1_decimation.png`: decimation test (§2.4).
- `artifacts/phase7/downloads/r3-unitree_ros_5994d4f/repo`: sparse checkout of the humanoid descriptions at the pinned commit.

---

## 9. Sources (all accessed 2026-10-17)

| Key | Claim(s) | URL |
|---|---|---|
| U-R1 | R1 AIR / R1 / R1 EDU specs and prices | https://www.unitree.com/R1 |
| U-G1 | G1 / G1 EDU specs, $13.5K, Dex3-1 | https://www.unitree.com/g1 |
| U-G1+ | G1+ specs, US $15K | https://www.unitree.com/G1pl |
| U-H1 | H1 / H1-2 specs, 3.3 m/s | https://www.unitree.com/h1 |
| U-H2 | H2 / H2 EDU specs, $29,900 | https://www.unitree.com/H2 |
| U-H2P | H2 Plus specs (Sharpa, Jetson T5000) | https://www.unitree.com/H2plus |
| U-R1D | R1-A specs, from $4,290 | https://www.unitree.com/R1-D |
| U-home | product menu; 16 H1 at the 2025 Spring Festival Gala | https://www.unitree.com/ |
| heise-G1 | G1 launch 2024-05-16, $16,000, 2 m/s, MID-360 + D435, H1 from $90,000 | https://heise.de/-9720187 |
| IE-R1 | R1 launch 2025-07-25, 39,999 yuan, demos | https://interestingengineering.com/innovation/unitree-launches-cheapest-humanoid-robot-r1 |
| IE-R1A | R1-A, May 2026, 26,900 yuan | https://interestingengineering.com/ai-robotics/china-unitree-humanoid-robot |
| eWeek-H2 | H2 video content, face, $29,900 | https://www.eweek.com/news/unitree-h2-humanoid-robot-china/ |
| H2-date | H2 "Destiny Awakening" 2025-10-20 (secondary; page now returns 410, *unverified*) | https://www.redhotcyber.com/en/post/theyre-coming-unitree-robotics-launches-the-h2-destiny-awakening-humanoid |
| GT-H2P | H2 Plus, 2026-06-01, Jetson Thor, Sharpa, late 2026, Stanford/UCSD | https://www.globaltimes.cn/page/202606/1362496.shtml |
| TechNode | G1+ launch, RMB 95,000 | https://technode.com/2026/09/15/unitree-g1-plus-humanoid-robot/ |
| SH | "Superman" 12.66 m/s claim, not externally verified | https://singularityhub.com/2026/08/24/unitree-claims-new-humanoid-robot-outruns-usain-bolt/ |
| TRR-H1 | H1 teased 2023-08-15, < $90,000 | https://www.therobotreport.com/unitree-teases-new-h1-humanoid-robot/ |
| R247 | H1 1500 m gold 6:34.40 (2025-08-15) | https://www.robotics247.com/article/unitree_h1_earns_two_gold_medals_at_world_humanoid_robot_games |
| TRR-WHRG | H1 robots "manually operated" at the Games | https://www.therobotreport.com/inaugural-world-humanoid-robot-games-step-into-the-spotlight/ |
| RobotShop | H2 retail ≈ $40,500 with tariffs (search summary, *unverified*) | https://www.robotshop.com/products/unitree-h2-humanoid-robot |
| Reichelt | G1 EDU EU prices and Orin NX 100 TOPS (distributor's model overview, not re-checked) | https://cdn-reichelt.de/documents/datenblatt/A300/UNITREEG1MODELLUBERSICHT.pdf |
| Justia | UNITREE US word mark, registered 2018-03-13 | https://trademarks.justia.com/873/44/unitree-87344661.html |
| unitree_ros | models, BSD-3-Clause, commit 5994d4f | https://github.com/unitreerobotics/unitree_ros |
| unitree_mujoco | MJCF h2/r1/g1/h1_2, commit 1eb6642 | https://github.com/unitreerobotics/unitree_mujoco |
| Menagerie | unitree_g1/h1, BSD-3, "assets … provided directly by Unitree" | https://github.com/google-deepmind/mujoco_menagerie |
| unitree_rl_gym | copies + pretrained motion.pt, commit 276801e | https://github.com/unitreerobotics/unitree_rl_gym |
| unitree_rl_lab | G1 velocity policy ONNX, Apache-2.0, commit 4960b84 | https://github.com/unitreerobotics/unitree_rl_lab |
| xr_teleop | XR devices, `--motion` alongside walking control, robots incl. H2/R1 | https://github.com/unitreerobotics/xr_teleoperate |
| UnifoLM | UnifoLM-WMA-0, 2025-09-15, CC BY-NC-SA 4.0, Z1/G1 data | https://github.com/unitreerobotics/unifolm-world-model-action |
| GR00T-Dreams | DreamGen code, Apache-2.0 | https://github.com/NVIDIA/GR00T-Dreams |
| GR00T | GR00T N1.7, Cosmos-Reason2-2B backbone, Unitree G1 shown | https://github.com/NVIDIA/Isaac-GR00T |
| Cosmos-WFM | Cosmos platform paper (2025-01-07), definition | https://arxiv.org/abs/2501.03575 |
| Predict2.5 | Cosmos-Predict2.5 repo (Apache-2.0), robot policy release Feb 2026 | https://github.com/nvidia-cosmos/cosmos-predict2.5 |
| NV-C3 | Cosmos 3 launch 2026-05-31 | https://nvidianews.nvidia.com/news/nvidia-launches-cosmos-3-the-open-frontier-foundation-model-for-physical-ai |
| HF-C3 | Cosmos3-Nano: OpenMDW1.1, 16B, embodiments, limitations | https://huggingface.co/nvidia/Cosmos3-Nano |
| DreamGen | abstract: 4 stages, 22 behaviours | https://arxiv.org/abs/2505.12705 |
| DreamGen-html | 11.2 → 43.2 %, 0 → 28.5 %, Fourier GR1, WAN2.1 | https://arxiv.org/html/2505.12705v2 |
| Genie3 | 720p / 24 fps, minutes, limitations | https://deepmind.google/discover/blog/genie-3-a-new-frontier-for-world-models/ |
| PGenie | Project Genie 2026-01-29, 60 s cap | https://blog.google/innovation-and-ai/models-and-research/google-deepmind/project-genie/ |
| VJEPA2 | V-JEPA 2 abstract: 1 M h video, < 62 h DROID | https://arxiv.org/abs/2506.09985 |
| VJEPA2-html | success rates, 16 s vs 4 min, limitations | https://arxiv.org/html/2506.09985 |
| 1X-2024 | 1X world model as evaluator; objects disappear, floating plate | https://www.1x.tech/discover/1x-world-model |
| 1X-2026 | 1XWM on NEO: 14B, 900 h / 70 h / 400 h, optimism, 30 → 45 % | https://www.1x.tech/discover/world-model-self-learning |
| TRR-1X | date of the NEO world-model launch (2026-01-24) | https://www.therobotreport.com/1x-launches-world-model-enabling-neo-robot-to-learn-tasks-by-watching-videos/ |
| DreamerV3 | Nature 2025, > 150 tasks, Minecraft diamonds | https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12003158/ |
| Dreamer4 | offline diamonds, real time on one GPU | https://arxiv.org/abs/2509.24527 |
| Wayve | GAIA-3, 2025-12-02, 15B, evaluation claim | https://wayve.ai/press/wayve-launches-gaia3/ |
| PhysIQ | Physics-IQ: understanding unrelated to visual realism | https://arxiv.org/abs/2501.09038 |
| Kang | video models are case-based; OOD failure | https://arxiv.org/abs/2411.02385 |
| MBPO | short model rollouts from real data | https://arxiv.org/abs/1906.08253 |
| PETS | ensembles as uncertainty-aware dynamics models | https://arxiv.org/abs/1805.12114 |
| Internal | (Internal notes removed for the public edition.) | — |
