# R2 · Open Duck and reinforcement learning

Phase 7 research, topic R2. Baseline: release candidate 4 (tag `rc4`, founder-approved). Date: 2026-10-17 (all sources accessed that day). This report changes no game code. It identifies the duck the founder means, gathers how these ducks really learn to walk, picks the 3D source, designs an RL station with the real duck, and measures whether real physics plus real optimisation fit the browser budget.

Scratch material: `artifacts/phase7/open-duck-rl/` (fetched source texts, spike scripts in `spike/`); pinned downloads in `artifacts/phase7/downloads/` (`open_duck_mini_v2_b23317a/`, `open_duck_playground_b9be205/`, `microduck_rl_b02fdea/`, `hf_microduck_simulator_ad9d41a/`, `npm_mujoco_3.16.0/`, `odm_policy_b23317a/`). Sources are numbered [S1]…[S52] (§10).

**Contents:** 0 Verdict · 1 Which duck · 2 The robots · 3 How they learn to walk · 4 3D assets · 5 Learning content · 6 Station design „Lauf, Ente!“ · 7 Browser feasibility (measured) · 8 Founder questions · 9 Risks · 10 Sources

---

## 0. Verdict in one screen

1. **"Open micro duck" points at two real, related robots.** The *Open Duck Mini v2* is Antoine Pirrone's open-source biped, about 42 cm tall, inspired by Disney's BD-X droid, with parts for "under $400" (the BOM sheet: €398) [S1, S5]. The *Microduck* is its professional successor from Pollen Robotics (part of Hugging Face): 25 cm, 800 g, 15 motors, USD 399, pre-orders since 2026-08-27 [S17, S26, S27]. The same engineer leads the RL for both [S19, S50]. A third project, "OpenMicroDuck", is a community copy of the Microduck under a non-commercial licence [S28].
2. **Use the Open Duck Mini v2 in the game.** Its meshes are Apache-2.0 [S2, S3]. The Microduck meshes are **CC BY-NC-SA 4.0** [S20], and a public game from a company should not rely on "non-commercial". Show the Microduck only with written permission from Pollen Robotics (founder question Q1).
3. **Replace Regelgarten C „Tausend falsche Welten“ with „Lauf, Ente!“.** This agrees with R6. The zone arc becomes *by hand (A) → controller (B) → learned (C)*. We keep what already works in C: tune it yourself first, then train, a Kennlinie with Wilson bands, transfer, and the album entry `sim-to-real-luecke`. 64 real ducks replace the 256 cart-poles.
4. **The station has three steps.** *C1 Mach du's:* tune a gait by hand. *C2 Belohnung bauen:* 64 ducks train on your reward, and genuine reward hacks appear, such as the belly flop, the statue and the instant faller. *C3 Teststrecke:* the gait walks 20 runs under conditions you don't know, then you retrain it in "a thousand wrong worlds" and measure again. Lesson: „Die Ente lernt, was du belohnst – nicht, was du meinst.“
5. **Real physics and real optimisation fit the budget (measured).** The physics engine is Google DeepMind's official MuJoCo WebAssembly build, which is also what the real ducks train in. Stripped of its debug sections it is 1.03 MB with brotli, and it loads with the zone. The search is a cross-entropy method (CEM) over a 12-parameter gait and runs in a worker. On the Open Duck authors' light MJCF: 11.6 µs per physics step, at most 1.5 s per generation of 64 ducks × 4 s (Apple M5 Pro), and 0.05 ms per frame on the main thread for the 64-duck replay. In the spike, all three hacks emerged on their own, and domain randomisation traded speed for robustness (one world: 26/40 test runs, randomised: 32/40) (§7).
6. **Real PPO training in the browser is out of reach.** One Microduck-size gait budget would need about 5 CPU-hours of physics (§7.1). The station says so honestly: „Echte Physik, echte Belohnung, kleiner Lerner.“ The real numbers go on the cards: the Microduck learns a usable gait in 1–2 h with 4,096 parallel worlds [S19]; Disney's character takes about 2 days per policy, about 12.5 years of simulated experience (arithmetic from [S29]).

---

## 1. Which duck did the founder mean?

| Project | Who / when | What | Licence (3D) | Fit for "open micro duck" |
|---|---|---|---|---|
| **Open Duck Mini v2** | Antoine Pirrone and community, repo since 2024-05, sponsored by Hugging Face and Pollen Robotics [S1] | "a miniature version of the BDX Droid by Disney", about 42 cm with the legs extended, BOM "under $400" [S1] | **Apache-2.0** (repo `LICENSE`, also covers the meshes) [S2] | "Open Duck Mini", the open-source original |
| **Microduck** | Pollen Robotics with Hugging Face; repo created 2026-07-29; pre-orders since 2026-08-27 [S17, S26, S27] | "A tiny biped robot that moves using reinforcement learning policies", about 25 cm and 800 g [S17] | Code, MJCF and policies Apache-2.0; **meshes CC BY-NC-SA 4.0** [S19, S20, S25] | "Micro duck". The hyped 2026 product (9,522 GitHub stars, the browser simulator has 635 likes, 2026-10-17) |
| OpenMicroDuck (JoyandAI) | community, 2026-09 [S28] | Chinese replica of the Microduck, Feetech HD-1910 servos | CC BY-NC-SA 4.0 (derived from the Microduck) [S28] | Literally "Open Micro Duck", but a copy |

**Conclusion.** The founder most likely mixed the two names, either the Microduck news or the "Open Duck Mini" project. Both descend from one RL pipeline. Antoine Pirrone, an R&D engineer at Pollen Robotics, is the top contributor to `microduck_rl` (1,093 commits) [S50]. For the game the choice is a licence question, not a technical one (§4).

---

## 2. The robots

| | **Open Duck Mini v2** | **Microduck** | **Disney BD-X (research robot, background)** |
|---|---|---|---|
| Height | ≈ 42 cm, legs extended [S1] | ≈ 25 cm [S17, S26] | 0.66 m without antennas [S29] |
| Mass | ≈ 2.1 kg in the official simulation model (sum of link masses: URDF 2.06 kg, Playground MJCF 2.11 kg; masses from slicer estimates [S4]); **real weight unverified** | ≈ 800 g [S17]; "under 800 g" [S27] | 15.4 kg [S29] |
| Joints / motors | 14 servo joints (5 per leg, 4 neck/head) + 2 antenna servos [S3, S5] | 15 motors [S26]: 14 joints used by the policies [S21] + the beak/jaw (inferred: the simulator streams "14 joints + jaw" and has an analog "mouth" control [S24]) | 5 per leg + 4 neck/head [S29] |
| Actuators | Feetech STS3215, 7.4 V ("19 kg·cm"), 14 pcs at €14 = €196 [S5] | Dynamixel XL330 [S21] | quasi-direct drives, 34 / 24 N·m peak; head 4.8 N·m [S29] |
| Compute | Raspberry Pi Zero 2W [S5, S15] | Radxa Zero 3 (Rockchip RK3566) [S17, S18] | onboard PC, 600 Hz actuator bus [S29] |
| Sensors | BNO055 IMU, 4 foot contact switches [S5] | camera, small LiDAR, two IMUs [S26]; microphone, speaker [S27] | IMU, encoders [S29] |
| Cost | €398 BOM (cheapest €331; €432 with the "expression" pack) [S5] | USD 399 before tax and shipping [S26] | not public |
| Policy rate | 50 Hz (`ctrl_dt` 0.02 s), simulated at 2 ms [S7] | 50 Hz [S17, S19]; sim step 5 ms × 4 [S24, S47] | 50 Hz; actuators 600 Hz [S29] |
| Trained speed range | forward ±0.15 m/s, sideways ±0.2 m/s, turn ±1.0 rad/s [S7] | forward ±0.4 m/s, sideways ±0.3 m/s, turn ±1.0 rad/s [S22]; rollers up to 0.6 m/s [S24] | 0.7 m/s forward, 0.4 m/s sideways, 1.8 rad/s [S29] |
| Skills | walking (joystick), standing; community builds [S1] | walk, sit/stand, kick, pick up with the beak, roller skating, get back up [S17, S26]; 13 task families in the training repo [S19] | standing, walking, episodic dances, jump, "tantrum" [S29] |
| Battery | 2 × 18650 cells [S5] | 2,600 mAh, about 1 h [S27] (secondary) | ≥ 1 h [S29] |

*Size ladder for the showroom (R6/R8): Microduck 0.25 m · Open Duck Mini 0.42 m · BD-X 0.66 m · EMI 1.55 m.*

---

## 3. How the ducks learn to walk

### 3.1 The pipeline (both ducks)

CAD in Onshape → `onshape-to-robot` exports URDF/MJCF (MIT) [S4, S45] → actuators identified with Rhoban's **BAM** (Apache-2.0; STS3215 and XL330 parameter sets) [S4, S44] → for the Open Duck: reference gaits from a parametric walk engine (Placo, MIT), fitted as polynomials [S14] → **PPO in thousands of parallel simulated worlds** with domain randomisation → ONNX export → the robot runs the network at 50 Hz [S7, S17, S19].

### 3.2 Training numbers

| | Open Duck Mini v2 | Microduck | Disney BD-X |
|---|---|---|---|
| Framework | Open Duck Playground = MuJoCo Playground (MJX, JAX) + Brax PPO [S6, S10] | mjlab (MuJoCo Warp) + PPO (rsl_rl) [S19, S47] | Isaac Gym + PPO [S29] |
| Parallel worlds | Brax PPO with MuJoCo Playground's tuned "BerkeleyHumanoid" preset [S10]; that preset's `num_envs` is 8,192 on today's `main` [S12]. **For the version the Duck pins: unverified** | 4,096 (README command) [S19] | 8,192 envs × 24 steps per batch [S29] |
| Network | preset: policy 512-256-128 [S12] (pinned version unverified); the published ODM policy `BEST_WALK_ONNX_2.onnx` (repo root, [S1]) has 101 inputs → 14 joint targets, 220,262 weights (parsed from the ONNX) | actor and critic 512-256-128, ELU [S22]; policy contract 61 inputs → 14 outputs [S19] | 3 × 512, ELU [S29] |
| Steps / time | default 150 M environment steps; "current win" 300 M with backlash [S6, S10] = **35–69 days of simulated walking** at 50 Hz (arithmetic). Wall-clock time: **unverified** | "~1–2 h for a usable gait at 4096 envs" [S19]; budgets: gaits 4,000–6,000 iterations of 24 steps per env [S21] = 0.39–0.59 bn steps = **91–137 days simulated** (arithmetic) | 100,000 iterations ≈ **2 days** on one RTX 4090; 1,500 iterations (30 min) preview the behaviour [S29] = **≈ 12.5 years simulated** (arithmetic: 100,000 × 8,192 × 24 × 0.02 s) |
| Imitation | yes: Disney's imitation reward against reference gaits ("We obtained good results by implementing the imitation reward described by Disney") [S4, S9] | no reference motion in the walk task; reward shaping + curricula [S22] | yes, artist animations [S29] |

### 3.3 Reward terms (real weights)

| Term | Open Duck Mini v2 [S7, S9] | Microduck walk [S22] | BD-X [S29] | Game card (§6.4) |
|---|---|---|---|---|
| Follow the commanded speed | lin. vel. 2.5, yaw 6.0 (Gaussian, σ 0.01) | lin. 2.0, ang. 2.0 | via the imitation terms | **Vorwärts** |
| Stay alive / survival | **alive 20.0** | – (curricula + termination) | **survival weight 20.0**, "prevents it from seeking early termination" | **Durchhalten** |
| Upright trunk | (inside imitation: orientation 1.0) | **upright 2.0** (deliberately strong: forward lean caused 2/3 of push falls) | torso orientation 1.0 | **Aufrecht** |
| Energy / torque | torques −1e-3 | – | joint torques 1e-3 | **Sparsam** |
| Smoothness | action rate −0.5 | action rate −0.1 → −1.0 (curriculum to iteration 1,500) | leg action rate 1.5, neck 5.0 | **Sanft** |
| Foot lift / air time | (contact match in imitation) | air time 3.0 (0.125–0.3 s); foot clearance target 2 cm | contact match 1.0 | **Füße heben** |
| Imitate a reference gait | **imitation 1.0** (joint pos. 15, contacts 1, …) | – | imitation set (torso pos. 1.0 … neck joints 100) | (unlock card **Vorbild**) |
| Other | stand-still −0.2 | pose 1.0, head pose 2.0, foot slip −0.1, self-collision −1.0, body ang. vel. −0.05 | joint accel. 2.5e-6 | – |

Episode end: Open Duck when the trunk turns upside down (gravity z < 0) [S7]; BD-X when head or torso touches the ground [S29].

### 3.4 Domain randomisation (what "a thousand wrong worlds" means for a real duck)

| Parameter | Open Duck Mini v2 [S7, S8] | Microduck [S22, S23] |
|---|---|---|
| Floor / foot friction | floor 0.5–1.0 | foot ×0.7–1.3 |
| Masses | all links ×0.9–1.1; trunk ±0.1 kg; CoM ±5 cm | mass and inertia ±5 %; CoM ±3 → ±15 mm (curriculum); head CoM ±3 → ±10 mm |
| Motors | Kp ×0.9–1.1; friction ×0.9–1.1; armature ×1.0–1.05 | battery 6.5–8.2 V, voltage sag under load, friction ±10 %, armature ±10 % |
| Delays | action 0–3 steps, IMU 0–3 steps (0–60 ms at 50 Hz) | actuator delay 3–6 sim steps (15–30 ms at 5 ms) |
| Sensors | joint/IMU noise | encoder offset ±0.015 rad, IMU mounting error ≤ 6° |
| Pushes | every 5–10 s | ±0.3 m/s every 3–6 s (±0.5 "trains a permanently nervous … gait") |
| Backlash | backlash variant ("current win") [S6] | ±1° per joint (`-Backlash-` tasks) [S19] |

### 3.5 Curricula and hard-won lessons (good game material)

| Lesson | Source |
|---|---|
| "RL optimizes the letter of the reward." Under-specified freedoms get exploited ("ballistic whip instead of a roll … head-tripod instead of standing"). Expect "2–5 iterations of reward-hacking whack-a-mole – that's normal." | [S21] |
| Wrong penalty sign: "the policy will farm it (butt-hopping, crash-sits)". | [S21] |
| "Any attempt-tax active while a hard skill is being explored makes 'do nothing' win" → bring smoothness in **after** the skill exists (curriculum from ~0). | [S21] |
| "Never gate a positive reward on being in a bad state": the policy parks in the cheapest pose and farms it. | [S21] |
| Too much randomisation hurts: a CoM ramp to ±30 mm "exceeded the foot support polygon (heel is only 20 mm behind the ankle)" and made the policies worse; capped at ±15 mm. | [S22] |
| "At this scale … actuator fidelity is most of the sim2real gap." | [S19] |
| Cheap servos "are hard to model and not overly powerful"; masses taken from the slicer. | [S4] |
| The robot "can only lift its feet ~1–2 cm"; "a 25 cm robot tumbles at 3.5–5.5 rad/s NATURALLY". | [S22, S21] |
| A zero-centred IMU randomisation cannot fix a systematic mounting bias: that needs calibration. | [S21, S22] |

### 3.6 Public demos

- Open Duck Mini README: sim-to-real walking videos, community build collage, Discord [S1]. Runtime image for the Pi Zero 2W [S15].
- **Microduck Sandbox** (Hugging Face Space, Apache-2.0 app code): "Real trained RL policies … running fully in the browser: MuJoCo compiled to WebAssembly steps the physics, onnxruntime-web runs the policy network at 50 Hz. No server" [S24]. *This is the precedent for §7.*
- **Microduck Arena:** published policies race on fixed tasks (`sprint_2m`, `hill_climb_1m5`, `roller_sprint_2m`, "Got a Talent") [S48]. About 30 community policies are on the Hub (e.g. "flamingo-cycle", "moonwalk-backward") [S25, S49].
- IEEE Spectrum "Video Friday" featured the Microduck [S51].
- Disney: a BD-X droid "waddled onstage" at NVIDIA's GTC keynote on 2025-03-18, when Newton was announced, a physics engine built with Disney Research and Google DeepMind [S30].

---

## 4. 3D assets

### 4.1 Candidates

| Candidate | Repo · path | Pin | Licence (SPDX) · covers meshes? | Size / triangles | Restrictions | Verdict |
|---|---|---|---|---|---|---|
| **A. Open Duck Mini v2 robot description** | `apirrone/Open_Duck_Mini` · `mini_bdx/robots/open_duck_mini_v2/`: `robot.urdf` (127 KB), `robot.xml` (32 KB), `robot_motors.xml` (57 KB), `scene.xml`, `config.json`, 45 `.stl` + `.part` | branch `v2` @ `b23317a485b3cec7d8417f352478778b3475173c` (2026-01-31); folder last changed `49b6d7d` (2025-02-06), all commits by apirrone | **Apache-2.0**, root `LICENSE` added 2024-09-16, before the meshes; no `NOTICE` file; the copyright line in the licence was left as a template [S2] · **yes** | 18.7 MB STL; 374,662 unique triangles; **131 visual instances = 2.39 M rendered triangles**, because the servo case meshes (102k + 41k triangles) repeat 14× | Apache §6 grants no trademark rights. The look derives from Disney's BD-X (design rights not licensable by the authors, §9). Vendor part meshes (`wj-wk00-*` servo cases, Raspberry Pi Zero, BNO055, SG90) have undocumented provenance | **Recommended** source for visuals and physics |
| B. Open Duck Playground light model | `apirrone/Open_Duck_Playground` · `playground/open_duck_mini_v2/xmls/` (`open_duck_mini_v2.xml`, `scene_flat_terrain.xml`, `joints_properties.xml`, 28 STL in `assets/`) | `main` @ `b9be205ac64488c23504ca42e5ec790337adeec3` (2025-08-05) | **NOASSERTION**: no licence file; the `.py` files carry Apache-2.0 headers, the XML/STL do not [S6, S7] | 28 STL, 144 KB, 2,832 triangles (4,410 rendered); feet-only collision | all rights reserved by default | Reference only. Ask the author to add a licence (Q3) |
| C. Open Duck Blender rig | `pollen-robotics/Open_Duck_Blender` · `open-duck-mini.blend` (Git LFS) | `121cca6a6a61441918901ee0311a77617ab32466` (2025-06-10) | **Apache-2.0** · yes [S16] | 37.8 MB `.blend` with FK/IK rig and a walk cycle | the file **auto-runs embedded Python add-ons**: open only with `blender --factory-startup --disable-autoexec` in a sandbox | Optional: materials, colours, rig check |
| D. Microduck MJCF + meshes | `pollen-robotics/microduck_rl` · `src/mjlab_microduck/robot/microduck/` (`robot_walk.xml` etc. + `assets/*.stl`) | `develop` @ `b02fdea4902c2b93b7d34a83a6f05da4ececb7d3` (2026-10-12) | MJCF **Apache-2.0**; STL **CC-BY-NC-SA-4.0** [S20] · NC | 43 STL, 23.6 MB; 14 joints, 15 bodies, MJCF link mass 0.737 kg | NonCommercial and ShareAlike. Attribution: "credit Pollen Robotics", link, licence, changes [S20]. Foot collision geoms use the NC meshes | **Only with written permission** (Q1) |
| E. Microduck GLB | HF Space `pollen-robotics/microduck-simulator` · `app/public/robot/mjlab/microduck.glb` | `ad9d41a763f30dc770817c33d92dcfec0205db1e` | Space: apache-2.0 (app code); the meshes are adaptations of D → NC-SA | 1.28 MB | as D | as D |
| F. Policies | ODM `BEST_WALK_ONNX(_2).onnx` at the root of A's repo; Microduck `pollen-robotics/microduck-policies` | A: `b23317a`; Hub repo modified 2026-10-12 | Apache-2.0 / Apache-2.0 [S25] | 0.88 MB; 11 × ≈ 0.79 MB | Microduck policies need the Microduck physics model (NC foot meshes) | ODM policy: spike for the "Profi-Ente" (§7.4) |
| G. Actuator parameters | `Rhoban/bam` · `bam/params/feetech_sts3215_7_4V/` | `main` (2026-09-28) | Apache-2.0 [S44] | JSON | – | Use for the physics variant |

### 4.2 Recommendation for the asset lane

- **Visual source: A.** Convert URDF + STL to glTF, keeping the link hierarchy (glTF nodes = URDF links, joint axes from the URDF).
  - Drop meshes that are invisible inside the closed body: `board`, `cell`, `bms`, `raspberrypizerow`, `bno055`, `usb_c_charger`, `holder`, `power_switch`, `roll_bearing`. This also removes most of the vendor-part provenance question.
  - Keep the visible black servo cases (`wj-wk00-*`), but decimate them hard (102k → ≈ 500 triangles each). The Open Duck authors themselves list exactly these parts as "ignore" in their light export [S11].
- **Budgets:**
  - **Hero LOD** ≤ 25k triangles and ≤ 12 draws (merged per rigid body and material).
  - **Field LOD** ≈ 700 triangles per duck as 16 body meshes, rendered as 16 `InstancedMesh` × 64.
  - **Far LOD:** one merged ≤ 300-triangle silhouette.
- **Colours:** the CAD colours from the MJCF: white shells (0.92), grey parts (0.62/0.67/0.70), dark parts (0.25), orange accent (0.98, 0.71, 0.00).
- **Physics variant (our adaptation of A's MJCF):**
  - visuals stripped;
  - collision on the TPU foot soles only, like the authors' MJX export [S11];
  - `sts3215` actuator class (Kp, damping, friction, armature, force range) from BAM [S44];
  - a "home" keyframe.

  This is an adaptation of the real model for simulation, not a look-alike.

### 4.3 Joint reference (URDF of A)

| Joint | Parent → child link | Limits |
|---|---|---|
| `left/right_hip_yaw` | `trunk_assembly` → `hip_roll_assembly(_2)` | ±30° |
| `left/right_hip_roll` | `hip_roll_assembly(_2)` → `left/right_roll_to_pitch_assembly` | ±25° |
| `left_hip_pitch` / `right_hip_pitch` | `…_roll_to_pitch_assembly` → `knee_and_ankle_assembly(_3)` | −70…30° / −30…70° (mirrored) |
| `left/right_knee` | `knee_and_ankle_assembly(_3)` → `knee_and_ankle_assembly_2(_4)` | ±90° |
| `left/right_ankle` | `knee_and_ankle_assembly_2(_4)` → `foot_assembly(_2)` | ±90° |
| `neck_pitch` | `trunk_assembly` → `neck_pitch_assembly` | −20…65° |
| `head_pitch` | `neck_pitch_assembly` → `head_pitch_to_yaw` | ±45° |
| `head_yaw` | `head_pitch_to_yaw` → `neck_yaw_assembly` | ±160° |
| `head_roll` | `neck_yaw_assembly` → `head_assembly` | ±30° |
| `left/right_antenna` | `head_assembly` → `left/right_antenna_holder` | ±90° |

- 21 links in total; there are also four fixed frames (`trunk_frame`, `left/right_foot_frame`, `head_frame`).
- MJCF actuator order (also the order the CEM uses): L hip yaw, roll, pitch, knee, ankle · neck pitch, head pitch, yaw, roll · R hip yaw … ankle [S7].

### 4.4 Attribution (proposal for credits and `LICENSES/`)

- **DE:** „Open-Duck-Mini-v2-Robotermodell: Antoine Pirrone und Mitwirkende des Open-Duck-Projekts, github.com/apirrone/Open_Duck_Mini, Commit b23317a, Apache-Lizenz 2.0. Von EmAI vereinfacht und nach glTF umgewandelt; Physikmodell von EmAI angepasst. Aktuatorparameter: Rhoban BAM, Apache-Lizenz 2.0. Physik: MuJoCo (Google DeepMind), Apache-Lizenz 2.0.“
- **EN:** "Open Duck Mini v2 robot model: Antoine Pirrone and the Open Duck contributors, github.com/apirrone/Open_Duck_Mini, commit b23317a, Apache License 2.0. Simplified and converted to glTF by EmAI; physics model adapted by EmAI. Actuator parameters: Rhoban BAM, Apache License 2.0. Physics: MuJoCo (Google DeepMind), Apache License 2.0."
- Ship `LICENSES/Apache-2.0.txt`. Apache 4(b) requires a notice in the modified files ("modified by EmAI").

### 4.5 Download hygiene (for every lane)

- `polynomial_coefficients.pkl` (Playground) is a Python pickle. **Never unpickle it**, because loading a pickle can execute code.
- The `.blend` needs `--disable-autoexec`.
- Parse ONNX files without executing them. `spike/onnxshape.py` reads the shapes from the protobuf.

---

## 5. Learning content (with sources)

### 5.1 Concepts

| Concept (DE term → glossary) | One line DE / EN | Where you feel it | Source |
|---|---|---|---|
| **Belohnung** (reward) | „Eine Zahl pro Augenblick, die sagt, was gut war.“ / “A number each moment that says what was good.” | C2 cards | [S34] |
| **Policy** | „Die Regel, die aus dem, was der Roboter spürt, die nächsten Motorbefehle macht.“ / “The rule that turns what the robot senses into its next motor commands.” | C1 sliders = a hand-made policy | [S34] |
| **Episode** (Durchlauf) | „Ein Versuch von Start bis Sturz oder Zeitende.“ / “One try, from start to fall or time-out.” | each 4 s duck run; the instant-faller hack | [S34, S29] |
| **Parallele Welten** | „Tausende Kopien üben gleichzeitig: so wird aus Monaten eine Stunde.“ / “Thousands of copies practise at once; months become an hour.” | the 64-duck field | [S19, S31, S32] |
| **Belohnungs-Hack** (reward hacking, specification gaming) | „Der Roboter erfüllt den Buchstaben der Belohnung, nicht ihren Sinn.“ / “The robot meets the letter of the reward, not its intent.” | belly flop, statue, instant faller | [S39, S41, S21] |
| **Lehrplan** (curriculum) | „Erst das Schwere lernen, dann die Feinheiten dazunehmen.“ / “Learn the hard part first, add the finesse later.” | toggle „Erst laufen, dann schön“ | [S43, S21, S31] |
| **Sim-to-Real-Lücke** (glossary term) | „Was in der Simulation läuft, fällt in der echten Welt.“ / “What walks in simulation falls in the real world.” | C3, one-world gait on the test track | [S35, S36, S4, S19] |
| **Randomisierung** („tausend falsche Welten“) | „Man übt in absichtlich falschen Welten, damit die echte nur eine weitere ist.“ / “Practise in deliberately wrong worlds, so the real one is just another.” | C3 retrain | [S35, S36, S38] |
| **Warum Laufen schwer ist** | „Nur die Füße berühren den Boden, und den Körper kann kein Motor direkt halten.“ / “Only the feet touch the ground, and no motor holds the body directly.” | C1: random gaits fall 78–96 % (spike) | [S42, S22] |
| **PPO** (for the curious) | „Der Lernalgorithmus der echten Enten: kleine, vorsichtige Verbesserungsschritte.“ / “The real ducks' learning algorithm: small, careful improvement steps.” | card | [S33] |

### 5.2 Reward hacking: famous cases (for a "Hack-Galerie" card)

| Year | Case | Source |
|---|---|---|
| 2016 | Boat-racing game: the agent circles a lagoon and hits the same targets again instead of finishing the race | [S39] (OpenAI's original post [S40] returned HTTP 403 to our fetch; its "20 % higher score" figure is **unverified** here) |
| 2017 | Block stacking: rewarded for the height of the red block's bottom face, the agent **flips the block over** | [S39], paper [S52] |
| 2017 | Grasping with human feedback: the hand **hovers between camera and object** so it looks like grasping | [S39] |
| 2019 | A simulated walker "figured out how to **hook its legs together and slide** along the ground" | [S39] |
| 2024 | Disney's BD-X gets a survival reward so that it does not seek "early termination of the episode" | [S29] |
| 2026 | Microduck training notes: "butt-hopping, crash-sits", "head-tripod instead of standing"; 2–5 rounds of hacks per new skill are "normal" | [S21] |

### 5.3 Numbers for the cards (each with one chip)

| Claim DE / EN | Chip | Source |
|---|---|---|
| Open Duck Mini: ≈ 42 cm, Bauteile ≈ 400 € / ≈ 42 cm, parts ≈ €400 | QUELLE | [S1, S5] |
| Microduck: 25 cm, 800 g, 15 Motoren | QUELLE | [S17, S26] |
| Microduck lernt einen brauchbaren Gang in 1–2 Stunden mit 4.096 parallelen Welten / … 4,096 parallel worlds | QUELLE | [S19] |
| Open Duck Mini: 150–300 Mio. Trainingsschritte ≈ 35–69 Tage Laufen, simuliert | QUELLE (Rechnung) | [S6, S10] |
| Disneys Figur: ≈ 2 Tage Rechenzeit pro Bewegung ≈ 12,5 Jahre simulierte Erfahrung | QUELLE (Rechnung) | [S29] |
| Die Ente denkt 50-mal pro Sekunde / thinks 50 times a second | QUELLE | [S7, S17] |
| Selbst die Entwickler rechnen mit 2–5 Runden Belohnungs-Hacks pro neuer Fähigkeit | QUELLE | [S21] |
| Everything measured on the island (distances, falls, success rates) | SIM · LIVE | own simulation |

---

## 6. Station design: „Lauf, Ente!“

### 6.1 Relation to Regelgarten C (options)

| Option | What happens | For | Against |
|---|---|---|---|
| **1. Replace Regelgarten C (recommended, as R6)** | C becomes „Lauf, Ente!“ with three steps C1–C3. A and B stay | The zone tells one story, *by hand → controller → learned controller*. Six lobes stay six zones (R6). C was the weakest station (fun 3 / learning 3, 32 s of replay, R6 §3.2). The F2 vendor controller „NN-Lage v2“ is also a learned controller, so the duck teaches the right questions before the finale | C gets longer (≈ 10 min instead of ≈ 4). The cart-pole CEM goes away |
| 2. New zone "LAUFEN" | A/B/C each get a full station (same content as C1–C3) | More room, three stamps | A 7th lobe breaks the hexacopter rule. Adds 10–12 min to an already long route |
| 3. Keep C, show the duck only in the showroom | – | No build risk | Misses the founder's "RL with the duck"; reward shaping stays untaught |

**Keep from today's C** (`wall.ts`, `sim.ts`):
- the time-sliced CEM loop and its parameters (elite 10–15 %, smoothing α 0.7, a standard-deviation floor);
- „Du gegen …“ with a reference line in the Kennlinie (FUN-PLAN R3);
- Wilson bands at the population size;
- the „Übertragen“ step and its single-world vs randomised comparison;
- the album entry `sim-to-real-luecke` and its existing lines.

**Drop:** the 16 × 16 cart-pole wall. **New:** the MuJoCo worker, the duck field and the test track.

### 6.2 Layout (zone-local coordinates, replacing the Weltenwand at x = −13)

| Structure | Spec |
|---|---|
| **Trainingsfeld** | 8 × 8 tiles of 1.0 × 0.8 m (8.0 × 6.4 m) on a 0.3 m plinth, about x −17…−9, z 0…8. Tile tint = floor friction of that duck's world (single hue, like today's L tint). 1:1 ducks stand at the back edge of each tile |
| **Belohnungspult** | console at about (−7, 0, 4) facing −x, on a 0.6 m step so the far tiles stay readable. Six reward cards as physical levers with 4 notches, plus „Start“ |
| **Teststrecke** | 1.2 × 0.4 m track (marks at 0.25 / 0.5 / 1.0 m) on a 1 m plinth next to the console, at eye level. The hero duck at 1:1; EMI-03 (1.55 m) beside it for scale |
| **Kennlinie** | the existing widget: median distance per generation + fall rate with Wilson band, „Du“ reference line |

### 6.3 Flow and mechanics

**C1 · Probieren — „Mach du’s“ (60–90 s).**
- Three sliders: *Schrittfrequenz*, *Schrittweite*, *Fußhub*. Space = „Los“.
- The hero duck walks your gait on the test track (live physics), while the field runs the same gait in 64 worlds.
- Result: „Du: 0,12 m · 41 von 64 gefallen“.
- Up to three tries. Push the duck with the existing grab/throw tool (F) to feel how fragile a hand-made gait is. R6 notes that no station uses that verb yet.

**C2 · Verstehen — „Belohnung bauen“ (3–4 min).**
- Six reward cards with 4 notches each (§6.4), plus a toggle „Erst laufen, dann schön“ (curriculum: *Sanft* and *Sparsam* ramp from 0 to the set value over generations 1–6).
- „Start“ runs **10 generations**. In each, the 64 ducks are the CEM population. They run 4 s in parallel and then replay on the field; the next generation is computed during the replay (§7.4).
- The default deck starts with *Vorwärts* on 3 and everything else on 0. This guarantees an early, funny **belly flop** by about generation 3 (the spike shows it, §7.3).
- Each detected hack (§6.5) gets a sticker, a slow-motion replay of „Sturz der Generation“, an EMI line and its real-world twin (§5.2).
- Kennlinie: median distance and fall rate per generation; the reference line „Du: 0,12 m“ shows the training overtaking you.

**C3 · Messen — „Ab auf die Teststrecke“ (2–3 min).**
1. **Prediction:** „Wie viele von 20 Läufen schafft die Ente 0,3 m ohne Sturz?“
2. **20 runs** of your best gait (the CEM mean) on the hero duck, at 4× speed. Each run draws hidden conditions: floor friction 0.3–1.0, payload 0–150 g as an orange test block on the back, motor stiffness ±20 %, servo delay 0–60 ms. These ranges are wider than the Open Duck's training ranges on purpose (§3.4), and the card shows both.
3. **Result:** „14 von 20 · 70 % [48–85]“. If the one-world gait falls here, the album entry `sim-to-real-luecke` unlocks.
4. **„In tausend falschen Welten nachtrainieren“:** 10 more generations, with each duck in a randomised world (tile tints vary). Then 20 new runs, and the two bars with Wilson bands appear side by side.
5. Expected from the spike: **slower but fewer falls**. That trade-off is the lesson.

Measured value for the Pass and banner: „Gen 10: 0,31 m · 2 Hacks · Teststrecke 16/20 [58–92 %]“.

### 6.4 Reward cards (game term → physics term → real analogue)

| Card DE / EN | Term in the worker (per second, until the fall) | Real analogue | Hack when overweighted |
|---|---|---|---|
| **Vorwärts** / Forward | + w · v_x | speed tracking 2.0–2.5 [S7, S22] | belly flop (with *Durchhalten* 0) |
| **Durchhalten** / Keep going | + w per second alive | alive / survival 20.0 [S7, S29] | statue (if ≫ *Vorwärts*) |
| **Aufrecht** / Upright | + w · cos(tilt) | upright 2.0 [S22] | statue |
| **Sparsam** / Thrifty | − w · Σ\|τ·q̇\| | torques 1e-3 [S7, S29] | instant faller (if all positive terms are 0) |
| **Sanft** / Gentle | − w · Σ(Δa)² | action rate 0.5; ramped 0.1 → 1.0 [S7, S22] | freeze without curriculum [S21] |
| **Füße heben** / Lift feet | + w · swing-foot height up to 2 cm | foot clearance target 2 cm [S22] | stork (hypothesis, calibrate) |
| *unlock* **Vorbild** / Reference gait | + w · similarity to a reference gait | imitation 1.0 [S7, S9, S29] | – (shows why the Open Duck walked) |

An episode ends at a tilt above 60° or a trunk lower than 9 cm (the spike's rule). This links to question card 7, „Wann endet ein Lauf?“.

### 6.5 Hack catalogue (detected from the elite's behaviour)

| Sticker DE / EN | Detector | Typical cause | Spike (§7.3) |
|---|---|---|---|
| **Bauchklatscher** / Belly flop | ≥ 50 % fall before 2 s with distance > 0.1 m | *Vorwärts* high, *Durchhalten* 0 | **emerged**: 83 % fall at 1.4 s, 0.21 m |
| **Statue** / Statue | distance < 0.05 m, no fall | *Durchhalten*/*Aufrecht* ≫ *Vorwärts* | **emerged**: 0.02–0.04 m, 13 % falls |
| **Sofort-Umfaller** / Instant faller | ≥ 80 % fall before 1 s, distance ≈ 0 | only costs (*Sparsam*, *Sanft*) | **emerged**: 98 % fall at 0.7 s |
| **Zappelente** / Jitter duck | energy and action rate in the top decile, little progress | *Vorwärts* high, *Sanft* 0 | not tested; calibrate |
| **Storch** / Stork | foot lift high, distance < 0.05 m | *Füße heben* ≫ *Vorwärts* | not tested; calibrate |

### 6.6 Stars (rate your play, never the robot)

| | Goal | Calibration note |
|---|---|---|
| ★ (stamp) | one trained gait plus 20 test-track runs measured | – |
| ★★ | find 2 different reward hacks (stickers) | three hacks proven to emerge |
| ★★★ | a gait that passes ≥ 15 of 20 test runs | spike: randomised gait 32/40 = 80 %, single-world gait 26/40 = 65 % |

The C3 prediction counts towards the existing Prognose-Güte.

### 6.7 Entscheider view

- **Path (≈ 4 min):** C1 skippable after 30 s. C2 starts with the preset „Nur Vorwärts“ at 2× speed, and the belly flop appears after 4 generations. One tap on „Durchhalten + Aufrecht dazu“ and the ducks walk after 8 generations. C3 measures the one-world gait and the randomised gait, 20 runs each at 8×.
- **◆:** B „Regler & Takt“ stays the zone's ◆ on the Werkleiter route. C is optional and gives its own Befundkarte when played.
- **Befundkarte:**
  - *Messgröße:* success rate on the test track (n = 20, Wilson interval), trained in one world vs. randomised.
  - *Grenze:* the gait holds only within the trained ranges; more robust means slower here.
  - *Frage an den Anbieter:* „Mit welcher Belohnung wurde trainiert – und welche Abkürzungen hat das Training gefunden?“ and question card 9, „Was ist das Ergebnis in einer zweiten Umgebung?“.
  - *Für dein Werk:* „Lass dir Fehlläufe zeigen, nicht nur das beste Video – und teste auf deinem Boden mit deiner Last.“
- **Question cards:** if R6 moves cards (03 C retired), C3 is a natural place for card 9 or card 7. Coordinate in the build plan.

### 6.8 Minute by minute

| Entdecker (≈ 10 min) | Entscheider (≈ 4 min) |
|---|---|
| 0:00 Approach: 64 ducks stand on the field, the hero duck on the track; EMI line 1 | 0:00 same, EMI line 1 |
| 0:20 C1: three sliders, first fall (EMI line 2), best of 3 tries; push the duck | 0:20 C1 skip after 30 s (grey stamp rule as today) |
| 2:00 C2 run 1 (default deck): generation 1 collapse, belly flop at generation 3 → sticker, EMI | 0:50 C2 preset run at 2×: belly flop by generation 4 |
| 3:00 run 2: add *Durchhalten* → statue → sticker | 1:20 one tap fix → walking by generation 8 |
| 4:00 run 3: balanced deck plus „Erst laufen, dann schön“ → walking; the Kennlinie passes „Du“ | 1:50 C3: prediction; 20 runs one-world at 8× |
| 6:30 C3: prediction; 20 runs; result with band; album if it falls | 2:40 retrain randomised (8 generations at 2×), 20 runs |
| 8:00 retrain in randomised worlds (40 s) → 20 runs → two bars | 3:30 Befundkarte |
| 9:30 banner: value, stars, lesson | 4:00 done |

### 6.9 Fun hooks

- **Generation-1 collapse:** 64 ducks fall at once, with a clatter of 64 soft "plocks". The audio is one aggregated sound whose density follows the falls.
- **Hacks as collectible stickers**, each with a slow-motion „Sturz der Generation“ and its real-world twin from §5.2.
- **„Du gegen 64 Enten“:** the trained curve overtakes your hand-tuned line.
- **Scale gag:** the 42 cm duck next to EMI-03 at 1.55 m. EMI looks down at it.
- **Poke it:** use the existing grab tool for a gentle push. Randomised gaits recover more often.
- **Servo sound:** procedural whine whose pitch follows joint speed; foot taps on contact.
- **Lift-off cameo:** the trained duck waddles along the Ausguck ring during the climb (R5, trim rotor T2).

### 6.10 Copy (DE first, du everywhere)

| Trigger | DE | EN |
|---|---|---|
| Enter C | „Die Ente hat 14 Motoren und keinen Plan. Den Plan baust du – als Belohnung.“ | “The duck has 14 motors and no plan. You build the plan, as a reward.” |
| C1 first fall | „Zwei Beine, vierzehn Motoren, und der Boden schubst zurück. Laufen ist schwer.“ | “Two legs, fourteen motors, and the floor pushes back. Walking is hard.” |
| Generation 1 | „Generation 1: Fast alle fallen. Normal – sie wissen noch nichts.“ | “Generation 1: almost all of them fall. Normal: they know nothing yet.” |
| Belly flop | „Die Enten hechten nach vorn und fallen. Du hast Tempo belohnt, nicht Ankommen.“ | “They dive forward and fall. You rewarded speed, not arriving.” |
| Statue | „Stehen bleiben zahlt sich am meisten aus. Genau das hast du belohnt.“ | “Standing still pays best. That’s exactly what you rewarded.” |
| Instant faller | „Jede Sekunde kostet nur. Also lassen sie sich sofort fallen.“ | “Every second only costs. So they fall at once.” |
| Curriculum hint | „Erst laufen lernen, dann schön laufen. Sonst gewinnt Nichtstun.“ | “First learn to walk, then walk nicely. Otherwise doing nothing wins.” |
| C3 transfer falls | „In der Trainingswelt lief sie. Hier ist der Boden glatter und der Rucksack schwerer.“ | “It walked in its training world. Here the floor is slicker and the pack heavier.” |
| C3 after retraining | „Langsamer, aber sie fällt seltener. Das ist der Preis für Robustheit.“ | “Slower, but it falls less often. That’s the price of robustness.” |
| Lesson (banner) | „Die Ente lernt, was du belohnst – nicht, was du meinst.“ | “The duck learns what you reward, not what you mean.” |

**Card, Entdecker (DE 35 + 25 = 60 words; the budget is 40–65):**
- „Reinforcement Learning: Der Roboter probiert, eine Belohnung sagt ihm, was gut war. Er lernt genau das, was du belohnst – auch Abkürzungen. Darum übt man in vielen falschen Welten und misst danach unter echten Bedingungen.“
- *Für Neugierige:* „Die echte Open Duck Mini lernt mit PPO in Tausenden parallelen Welten: 150–300 Mio. Schritte, rund 35–69 simulierte Tage. Hier sucht ein Evolutionsverfahren 12 Gangparameter.“

**Card, Entdecker (EN ≈ 62 words):**
- “Reinforcement learning: the robot tries, and a reward tells it what was good. It learns exactly what you reward, shortcuts included. So you practise in many wrong worlds, then measure under real conditions.”
- *For the curious:* “The real Open Duck Mini learns with PPO in thousands of parallel worlds: 150–300 million steps, about 35–69 simulated days. Here an evolutionary method searches 12 gait parameters.”

**Card, Entscheider (DE ≈ 60 words):** „Ein gelernter Gang ist so gut wie seine Belohnung und so robust wie die Welten, in denen er geübt hat. Abkürzungen sind normal: Die Entwickler der Microduck rechnen pro neuer Fähigkeit mit 2–5 Runden Belohnungs-Hacks. Frag nach der Belohnungsfunktion, den Randomisierungs-Bandbreiten und der Erfolgsquote unter deinen Böden und Lasten – mit n und Intervall.“

**EN:** “A learned gait is as good as its reward and as robust as the worlds it practised in. Shortcuts are normal: the Microduck developers expect 2–5 rounds of reward hacks per new skill. Ask for the reward function, the randomisation ranges and the success rate on your floors and loads, with n and an interval.”

**Chips.** Every number of the duck station is `SIM · LIVE` with the note „echte Physik, echte Optimierung, kleiner Lerner (12 Gangparameter statt neuronalem Netz)“. The "real world" of C3 is also simulated, and the card says so: „Die Teststrecke ist auch simuliert – mit Bedingungen, die die Ente nicht kennt. So prüft man, bevor ein echter Roboter fällt.“

### 6.11 If a dedicated zone is chosen

A = C1 plus the push test and a "QWOP"-style four-key mode as a funny extra. B = C2 (◆ for Entscheider). C = C3 with n = 40 and three named surfaces. The content, assets and worker are the same, so the choice can be made late.

---

## 7. Feasibility in the browser (measured)

### 7.1 Options

| Option | The player sees | Honesty | Main thread / frame | Worker | Download | Effort | Verdict |
|---|---|---|---|---|---|---|---|
| A. Pre-baked PPO clips per reward preset | real PPO training, replayed | `SIM · AUFZEICHNUNG` | ≈ 0.05 ms | – | ≈ 1.5–3 MB of clips (estimate) | high: GPU training of 8–30 presets, recording pipeline | discrete presets only; keep as fallback |
| B. Parametric gait whose quality is mapped from the weights | animation | ILLUSTRATIV: no learning, scripted hacks | ≈ 0.1 ms | – | ≈ 0 | low | **rejected for C2** (fake learning) |
| **C. Real optimisation in a worker: MuJoCo WASM + CEM over a 12-parameter gait (CPG + 2 feedback gains)** | live generations, genuine hacks | `SIM · LIVE` | **0.05 ms** (measured) | **1.2–1.5 s per generation of 64 × 4 s** (measured, M5 Pro); ≈ 4–6 s at 4× slower CPU (×4 estimate) | **+1.09 MB brotli** (stripped wasm 1.03 + JS 0.06), lazy | medium | **recommended** |
| D. Real PPO in the browser | – | – | – | one Microduck gait budget ≈ 0.4 bn policy steps × 4 sim steps × 12 µs ≈ **5.3 CPU-hours** (arithmetic) | – | – | not feasible |
| E. Real trained policy (Open Duck ONNX → a TypeScript MLP) on the same physics | "Profi-Ente" on the test track | `SIM · LIVE` with the official policy | – | 0.13 ms per inference (measured) × 50 Hz = 6.5 ms/s | +0.45–0.88 MB (fp16/fp32) | medium plus spike risk (101-dim observation) | optional C3 add-on |

- **Rapier fallback:** Rapier is already shipped (0.81 MB) and has multibody joints. It avoids the extra 1.09 MB, but the MJCF must be converted at build time and the dynamics differ from the reference simulator. Use it only if Q4 says no.
- **Note for R1:** R1 §11 rejects "npm `mujoco` 3.1.16, 18 MB". The official package is **`@mujoco/mujoco` 3.16.0** from Google DeepMind (Apache-2.0): 10.75 MB raw, 1.99 MB brotli, and **1.03 MB brotli after stripping debug sections**. If the duck lane adopts it, R1 and R3 can share it.

### 7.2 Measurements (Apple M5 Pro, Node 24.19, single thread; scripts in `artifacts/phase7/open-duck-rl/spike/`)

| What | Result |
|---|---|
| `@mujoco/mujoco` 3.16.0 `mujoco.wasm` | 10,751,588 B raw · 2,639,895 B gzip-9 · **1,986,746 B brotli-11**; JS 294 KB raw / 56 KB brotli |
| Same wasm with custom/debug sections stripped | **4,873,860 B raw · 1,034,382 B brotli**; compiles and steps identically |
| Feature check | no exception-handling tag section, no threads in the default build (an `mt/` variant exists); plain `instantiateStreaming`. Browser test still open (Safari 16.4+, Firefox 108+) |
| Init / compile, light Open Duck model (feet-only collision, 14 actuators, dt 2 ms) | 24–29 ms / 48–50 ms |
| **Step cost, light model** | **11.6–11.8 µs per step** = 5.8 ms per simulated second, 170× real time |
| Step cost, full Apache model (`robot_motors.xml`, 131 mesh collisions) | 33.3 µs per step; compile 437 ms. Hence the light physics variant (§4.2) |
| CEM generation, 64 candidates × 4 s, incl. control | 0.7–1.5 s (shorter when many ducks fall early); 13.4 µs per step including the gait controller |
| MLP 61-512-256-128-14 (Microduck shape), plain JS | 0.130 ms per inference (197,774 weights) |
| Field replay: 64 ducks × 15 bodies, lerp + slerp + compose into `InstancedMesh` | **0.046 ms per frame**; 2.7 MB of Float32 pose data per generation (100 samples). Halve it with 16-bit storage |
| Open Duck policy `BEST_WALK_ONNX_2.onnx` | input `obs [1, 101]`, output `continuous_actions [1, 14]`, 220,262 weights |

### 7.3 Spike: does a real optimisation produce walking and genuine hacks?

Setup: the authors' light Open Duck model (the `Open_Duck_Playground` MJCF, used locally for evaluation only, since it has no licence), a 10-parameter gait (frequency, hip/knee/ankle amplitudes and phases, lateral sway, lean, neck, ankle offset), CEM with 48–64 candidates, 4 s episodes, and an end at > 60° tilt or a trunk below 9 cm. One seed each, so these are **indicative, not claims**.

| Reward preset (spike units) | After 8–14 generations | Reading |
|---|---|---|
| `walk`: forward 40, alive 1, upright 1, small costs | mean gait **0.37 m in 4 s**, no fall; population falls 78 % → 16 % | it walks: a shuffle, ≈ 0.09 m/s |
| `balanced`: forward 10, alive 1, upright 1 | 0.02–0.04 m, population falls 96 % → 13 % | **statue** |
| `speedOnly`: forward 10, nothing else | falls at 1.4 s after 0.21 m; 83 % fall | **belly flop** |
| `costsOnly`: energy and smoothness only | falls at 0.7 s; 98 % fall | **instant faller** |

Domain randomisation (`spike_dr.mjs`): the gait has 12 parameters, including pitch and roll feedback. It was trained 14 generations × 64, either in one world or with friction 0.3–1.0, payload 0–150 g, Kp ×0.8–1.2 and delay 0–3 control steps. It was then tested on the same 40 randomised worlds:

| Trained in | Nominal world | 40 random worlds: walks > 0.15 m without falling | Falls | Median distance |
|---|---|---|---|---|
| one world | 0.44 m | 26/40 = 65 % [50–78] | 13/40 | 0.39 m |
| randomised worlds | 0.23 m | **32/40 = 80 % [65–90]** | **7/40** | 0.22 m |

Both lessons, "you get what you reward" and "robust is slower but falls less", come out of the real duck model without scripting. Generation 1 is a comic mass fall (78–96 % in every preset). The gait quality is honest but plain, a shuffle, so C3's optional "Profi-Ente" (option E) is the planned contrast.

### 7.4 Recommended architecture

```
main thread (zone regelgarten, C)                 worker (duck.worker.ts)
  panel, cards, Kennlinie, banner                   mujoco.wasm (stripped, self-hosted, ?url, lazy)
  field: 16 InstancedMesh × 64 (replay 4 s)  <──   light duck MJCF (ours, from Apache robot.xml + BAM)
  hero duck: merged glTF, pose stream 30 Hz  <──   CEM: gen k+1 computed while gen k replays
  → postMessage(weights, toggles)            ──>   records 16 body poses × 25 Hz, int16, transferable
```

- **Time budget:** the replay of a generation lasts 4 s, and computing it takes 0.7–1.5 s on the M5 Pro. On a 4× slower CPU it takes ≈ 3–6 s: the worker then lowers the population (64 → 32, the other cells mirror elites) or the episode length (4 → 3 s) to stay under 3.5 s.
- **Hero duck in C3:** one duck in real time = 5.8 ms of worker time per second.
- **Fallback:** without Worker or WASM, or at quality "low" with auto-quality on a slow CPU, use pre-recorded generations. They come from the same worker code run offline in Node for the 6 presets of §6.5 (≈ 1–2 MB). Chip `SIM · AUFZEICHNUNG`.
- **No cross-origin isolation** is needed (single-threaded wasm). **No third-party request:** the wasm is a hashed asset with a `.br` copy, like Rapier (DECISIONS, Phase 6).

### 7.5 Budget check (GDD §11, RELEASE.md)

| Budget | Limit | Duck station | Status |
|---|---|---|---|
| Zone `update` CPU | ≤ 1.5 ms | replay 0.05 ms + UI | ok |
| JS per frame at 4× CPU (spawn / plaza) | ≤ 8.4 / 7.8 ms | the worker runs only inside the zone and only while training (C2, C3) | needs a 4× run in the zone (`perf-cpu.mjs`) |
| Detail draws | ≤ 80 | field 16 + hero ≤ 12 + track and console ≈ 6, replacing the wall's 3 | to measure (Regelgarten today: not itemised) |
| Detail triangles | ≤ 90k | field ≤ 45k (700/duck) + hero ≤ 25k | tight; LOD the hero to the field mesh beyond 15 m |
| First load | 1.68 MB today; total < 8 MB | +0 at first load (lazy); +1.09 MB wasm + ≈ 0.5 MB meshes when you near Regelgarten | ok; shareable with R1/R3 |
| Long tasks | none > 250 ms before the title | wasm compile happens in the worker; MJCF compile 50 ms in the worker | ok |

### 7.6 Next-phase steps (each with an acceptance test)

1. **Physics variant** (1 day): our light MJCF from the Apache `robot.xml` plus BAM STS3215. Accept: home pose stable for 3 s, ≤ 15 µs per step, CEM `walk` preset ≥ 0.3 m in 4 s by generation 14.
2. **Worker and CEM port** (2 days): the `sim.ts` pattern, transferable recordings, adaptive population. Accept: generation ≤ 1.5 s on the M5 Pro, ≤ 3.5 s at 4× (Playwright CPU throttling); 0 main-thread long tasks.
3. **Asset lane** (2 days): glTF hero and field LODs from A. Accept: §4.2 budgets; the joints animate from MuJoCo `xpos/xquat`.
4. **Hack calibration** (1 day): the five presets of §6.5 with 3 seeds each. Accept: each hack emerges in ≥ 2 of 3 seeds, or is dropped. Then the star thresholds.
5. **Option E spike** (1 day, optional): run `BEST_WALK_ONNX_2` on our physics. Accept: it walks ≥ 1 m. If not, skip the "Profi-Ente".
6. **Copy and facts register:** §5.3 and §6.10 into RELEASE.md §5 with sources; `text-audit` passes.

---

## 8. Founder questions

1. **Which duck appears in the game?** Recommended: Open Duck Mini v2 now (Apache-2.0). Ask Pollen Robotics in parallel for written permission to show the Microduck (CC BY-NC-SA meshes), at least in the showroom.
2. **Where does the duck station live?** Recommended: it replaces Regelgarten C (agrees with R6). The alternative is a 7th zone.
3. **May we contact the Open Duck author** to ask for a licence file in `Open_Duck_Playground`, so its light MJCF and reference gaits can be reused? Recommended: yes. Not blocking, because we derive our own light model from the Apache repo.
4. **Accept +1.1 MB (brotli), lazy-loaded, for real physics** (official MuJoCo WebAssembly), shareable with the SO-101 and Unitree lanes? Recommended: yes. The alternative is Rapier with a converted model, or pre-recorded clips only.
5. **May the card say „inspiriert von Disneys BD-X-Roboter“** as a sourced fact, with no Disney or Star Wars imagery or logos and neutral colours? Recommended: yes, in the „Für Neugierige“ text only.

---

## 9. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Microduck meshes are NonCommercial (CC BY-NC-SA 4.0) | showing it without permission is a licence breach for a company game | use the Open Duck Mini; ask Pollen (Q1) |
| `Open_Duck_Playground` has no licence | its light model and reference data cannot ship | derive our own from the Apache repo (§4.2); ask (Q3) |
| The Open Duck Mini looks like Disney's BD-X (a Star Wars droid design) | design or trade-dress complaint | neutral CAD colours, no Disney or Star Wars names on signs or art, factual card mention only (Q5); legal check before release |
| Vendor part meshes inside A (Feetech, Raspberry Pi, Bosch IMU) of unclear provenance | small licence doubt | drop the invisible internals; keep only the decimated servo cases |
| CEM gaits look crude next to real robot videos | "is that all?" | say it on the card („kleiner Lerner“), show the real numbers, add the "Profi-Ente" (option E) |
| Worker CPU on slow laptops (≈ 4× slower: 4–6 s per generation) | stalls between replays | adaptive population and episode length; pre-recorded fallback; measure with `perf-cpu.mjs` |
| Hack detectors misclassify | wrong sticker, confused player | detect from the elite's behaviour statistics, calibrate on 3 seeds (§7.6 step 4) |
| MuJoCo WASM in Safari 16.4 / Firefox 108 untested | the station fails on some browsers | test in step 2; fallback recordings |
| Load budget pressure from all Phase 7 assets | > 8 MB total | lazy per zone; share one MuJoCo for the duck, SO-101 and Unitree |
| A "simulated real world" is mistaken for the real robot | honesty | the C3 card says it is simulated (§6.10) |

---

## 10. Sources (all accessed 2026-10-17)

| # | Source | URL |
|---|---|---|
| S1 | Open Duck Mini README, branch v2 @ b23317a | https://github.com/apirrone/Open_Duck_Mini/blob/b23317a485b3cec7d8417f352478778b3475173c/README.md |
| S2 | Open Duck Mini LICENSE (Apache-2.0) | https://github.com/apirrone/Open_Duck_Mini/blob/b23317a485b3cec7d8417f352478778b3475173c/LICENSE |
| S3 | Open Duck Mini v2 robot description (URDF, MJCF, STL, ONNX policies at repo root) | https://github.com/apirrone/Open_Duck_Mini/tree/b23317a485b3cec7d8417f352478778b3475173c/mini_bdx/robots/open_duck_mini_v2 |
| S4 | Open Duck Mini `docs/sim2real.md` | https://github.com/apirrone/Open_Duck_Mini/blob/b23317a485b3cec7d8417f352478778b3475173c/docs/sim2real.md |
| S5 | Open Duck Mini BOM (Google Sheet, linked from S1) | https://docs.google.com/spreadsheets/d/1gq4iWWHEJVgAA_eemkTEsshXqrYlFxXAPwO515KpCJc |
| S6 | Open Duck Playground README @ b9be205 | https://github.com/apirrone/Open_Duck_Playground/blob/b9be205ac64488c23504ca42e5ec790337adeec3/README.md |
| S7 | Playground `joystick.py` (config, rewards, termination) | https://github.com/apirrone/Open_Duck_Playground/blob/b9be205ac64488c23504ca42e5ec790337adeec3/playground/open_duck_mini_v2/joystick.py |
| S8 | Playground `randomize.py` | https://github.com/apirrone/Open_Duck_Playground/blob/b9be205ac64488c23504ca42e5ec790337adeec3/playground/common/randomize.py |
| S9 | Playground `custom_rewards.py` (imitation) | https://github.com/apirrone/Open_Duck_Playground/blob/b9be205ac64488c23504ca42e5ec790337adeec3/playground/open_duck_mini_v2/custom_rewards.py |
| S10 | Playground runners (Brax PPO, 150 M default) | https://github.com/apirrone/Open_Duck_Playground/blob/b9be205ac64488c23504ca42e5ec790337adeec3/playground/common/runner.py · …/open_duck_mini_v2/runner.py |
| S11 | Playground `xmls/config.json` (onshape-to-robot export, "ignore" list) | https://github.com/apirrone/Open_Duck_Playground/blob/b9be205ac64488c23504ca42e5ec790337adeec3/playground/open_duck_mini_v2/xmls/config.json |
| S12 | MuJoCo Playground `locomotion_params.py` @ d59156e | https://github.com/google-deepmind/mujoco_playground/blob/d59156e099a8785dd58fbce2e25a6ee1f7b5800c/mujoco_playground/config/locomotion_params.py |
| S13 | Zakka et al. 2025, MuJoCo Playground, arXiv 2502.08844 | https://arxiv.org/abs/2502.08844 |
| S14 | Open Duck reference motion generator README @ 3d7bc6f | https://github.com/apirrone/Open_Duck_reference_motion_generator |
| S15 | Open Duck Mini Runtime README @ 376de65 | https://github.com/apirrone/Open_Duck_Mini_Runtime |
| S16 | Open Duck Blender @ 121cca6 (README, LICENSE, LFS pointer) | https://github.com/pollen-robotics/Open_Duck_Blender |
| S17 | Microduck README @ 5323046 | https://github.com/pollen-robotics/microduck |
| S18 | Microduck `docs/faq.md` (Radxa Zero 3) | https://github.com/pollen-robotics/microduck/blob/main/docs/faq.md |
| S19 | microduck_rl README @ b02fdea (tasks, 4096 envs, 1–2 h, licences) | https://github.com/pollen-robotics/microduck_rl/blob/b02fdea4902c2b93b7d34a83a6f05da4ececb7d3/README.md |
| S20 | microduck_rl `LICENSE-MODELS.md` (CC BY-NC-SA 4.0) | https://github.com/pollen-robotics/microduck_rl/blob/b02fdea4902c2b93b7d34a83a6f05da4ececb7d3/LICENSE-MODELS.md |
| S21 | microduck_rl `AGENTS.md` (reward rules, budgets, sim2real) | https://github.com/pollen-robotics/microduck_rl/blob/b02fdea4902c2b93b7d34a83a6f05da4ececb7d3/AGENTS.md |
| S22 | microduck_rl `microduck_velocity_env_cfg.py` | https://github.com/pollen-robotics/microduck_rl/blob/b02fdea4902c2b93b7d34a83a6f05da4ececb7d3/src/mjlab_microduck/tasks/microduck_velocity_env_cfg.py |
| S23 | microduck_rl `microduck_constants.py` (voltage, delay) | https://github.com/pollen-robotics/microduck_rl/blob/b02fdea4902c2b93b7d34a83a6f05da4ececb7d3/src/mjlab_microduck/robot/microduck_constants.py |
| S24 | HF Space Microduck Sandbox README @ ad9d41a | https://huggingface.co/spaces/pollen-robotics/microduck-simulator/blob/ad9d41a763f30dc770817c33d92dcfec0205db1e/README.md |
| S25 | HF model `pollen-robotics/microduck-policies` (apache-2.0) | https://huggingface.co/pollen-robotics/microduck-policies |
| S26 | Pollen Robotics Microduck product page | https://pollen-robotics.com/microduck |
| S27 | Engadget, 2026-08-27, Microduck pre-orders | https://www.engadget.com/2245407/huggingface-and-pollen-robotics-opn-pre-orders-for-the-microduck-robot/ |
| S28 | JoyandAI/OpenMicroDuck README + LICENSE | https://github.com/JoyandAI/OpenMicroDuck |
| S29 | Grandia et al., Design and Control of a Bipedal Robotic Character, RSS 2024, arXiv 2501.05204 (HTML v1) | https://arxiv.org/html/2501.05204v1 |
| S30 | TechCrunch, 2025-03-18, Newton with Disney Research and Google DeepMind | https://techcrunch.com/snippet/2983012/nvidia-partners-with-google-deepmind-and-disney-to-make-robots-more-lively |
| S31 | Rudin et al. 2021, Learning to Walk in Minutes Using Massively Parallel Deep RL, arXiv 2109.11978 | https://arxiv.org/abs/2109.11978 |
| S32 | Makoviychuk et al. 2021, Isaac Gym, arXiv 2108.10470 | https://arxiv.org/abs/2108.10470 |
| S33 | Schulman et al. 2017, Proximal Policy Optimization Algorithms, arXiv 1707.06347 | https://arxiv.org/abs/1707.06347 |
| S34 | Sutton & Barto, Reinforcement Learning: An Introduction, 2nd ed. 2018 | http://incompleteideas.net/book/the-book-2nd.html |
| S35 | Tobin et al. 2017, Domain Randomization …, arXiv 1703.06907 | https://arxiv.org/abs/1703.06907 |
| S36 | Peng et al. 2018, Sim-to-Real Transfer … with Dynamics Randomization, arXiv 1710.06537 | https://arxiv.org/abs/1710.06537 |
| S37 | Hwangbo et al. 2019, Learning agile and dynamic motor skills for legged robots, arXiv 1901.08652 | https://arxiv.org/abs/1901.08652 |
| S38 | OpenAI et al. 2019, Solving Rubik's Cube with a Robot Hand, arXiv 1910.07113 | https://arxiv.org/abs/1910.07113 |
| S39 | Krakovna et al. 2020, Specification gaming: the flip side of AI ingenuity (DeepMind blog) | https://deepmind.google/discover/blog/specification-gaming-the-flip-side-of-ai-ingenuity/ |
| S40 | Amodei & Clark 2016, Faulty reward functions in the wild (HTTP 403 to our fetch) | https://openai.com/index/faulty-reward-functions/ |
| S41 | Amodei et al. 2016, Concrete Problems in AI Safety, arXiv 1606.06565 | https://arxiv.org/abs/1606.06565 |
| S42 | Tedrake, Underactuated Robotics, ch. 4 "Simple Models of Walking and Running" | https://underactuated.mit.edu/simple_legs.html |
| S43 | Bengio et al. 2009, Curriculum Learning, ICML (DOI page returned HTTP 403 to our fetch; standard reference) | https://doi.org/10.1145/1553374.1553380 |
| S44 | Rhoban BAM (Apache-2.0), STS3215 and XL330 parameters | https://github.com/Rhoban/bam |
| S45 | Rhoban onshape-to-robot (MIT) · Placo (MIT) | https://github.com/Rhoban/onshape-to-robot · https://github.com/Rhoban/placo |
| S46 | `@mujoco/mujoco` 3.16.0 tarball (Apache-2.0), measured locally | https://registry.npmjs.org/@mujoco/mujoco/-/mujoco-3.16.0.tgz |
| S47 | mjlab (Apache-2.0), velocity env: timestep 0.005, decimation 4 | https://github.com/mujocolab/mjlab/blob/main/src/mjlab/tasks/velocity/velocity_env_cfg.py |
| S48 | microduck-challenges README (Arena events) | https://github.com/pollen-robotics/microduck-challenges |
| S49 | HF Hub search "microduck" (community policies and Spaces) | https://huggingface.co/models?search=microduck |
| S50 | GitHub contributors of microduck_rl; profile of Antoine Pirrone (Pollen Robotics) | https://github.com/pollen-robotics/microduck_rl/graphs/contributors · https://github.com/apirrone |
| S51 | IEEE Spectrum, Video Friday: Microduck | https://spectrum.ieee.org/video-friday-microduck-robot |
| S52 | Popov et al. 2017, Data-efficient Deep RL for Dexterous Manipulation, arXiv 1704.03073 | https://arxiv.org/abs/1704.03073 |

**Own measurements** (`SIM`, not sources): all of §7.2–7.3 and the mesh, triangle and mass sums in §2 and §4, made with the scripts in `artifacts/phase7/open-duck-rl/spike/` on the pinned downloads.
