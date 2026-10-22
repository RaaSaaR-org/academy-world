# R1 · SO-101 arm + VLA (vision-language-action)

Research report for Phase 7 (builds on rc4). Topic owner: research lane R1. All web sources accessed **2026-10-17**; the sources table is at the end (§13, `[Sx]`). Numbers I computed myself are marked **eigene Rechnung** and name their script; anything I could not verify says **unverified**. Scratch files: `artifacts/phase7/so101-vla/` (scripts, file listings), downloads: `artifacts/phase7/downloads/r1-*` (text files only, no meshes).

---

## 0. Summary for the lead

1. **The SO-101 is the right real robot for the Lern-Dojo.** It is the open arm that LeRobot's imitation-learning and VLA tutorials are written for. A leader arm drives a follower arm, every demo is recorded as a LeRobot dataset, and SmolVLA, π0/π0.5, GR00T N1.7 and ACT all run on it [S8, S9, S11, S14].
2. **Real 3D model: available, Apache-2.0, including a leader arm.** `TheRobotStudio/SO-ARM100` @ `a758567`, `Simulation/SO101/so101_new_calib.urdf` (follower) and `so101_leader_new_calib.urdf` (leader, added 2026-09-23), STL meshes in metres [S1–S6]. MuJoCo Menagerie's `robotstudio_so101` is derived from it (Apache-2.0) and adds 9 box colliders plus a wrist camera, which is useful for Rapier [S7]. The meshes are heavy: 16.1 MB of binary STL and ≈ 323k unique triangles per arm. The asset pipeline must decimate them to ≤ 20k triangles per arm.
3. **Recommendation: upgrade the Lern-Dojo in place.** Replace the procedural SCARA with the real SO-101 leader/follower pair. Change the task from "push the block" to "put the red cube in the box". Keep the ribbons, the Gehirn-Fenster, the k-NN core and the dataset wall. Add one new verb: **commanding the arm in words**. This agrees with R6 (§5: "replace, don't add"; SO-101 in 04 A/B).
4. **The central twist is honest and backed by research.** A policy trained only on "red cube" demos ignores the word „blau“ and grabs whatever sits where the red cube used to be. VLAs do exactly this on benchmarks: LIBERO-PRO found they produce the same actions with corrupted instructions, LIBERO-Plus that they "tend to ignore language instructions completely" [S31, S30]. On the real SO-101, four policies with 100 demos per task scored 0–10 % on colour sorting (n = 20 each) [S29]. The toy policy in the browser reproduces the effect for the same reason: the word never varied in its training data.
5. **Published numbers often lack their conditions.** The SmolVLA paper gives SO-101 results (in distribution 90 %, out of distribution 50 %) but no trial count [S19]. The only SO-101 benchmark with a stated n uses 20 trials per cell, where 14/20 and 15/20 cannot be told apart (Wilson [48–86 %] vs [53–89 %]) [S29, eigene Rechnung]. That is Prüffeld material, and the dojo should only point to it, not teach it again (R6: the statistics lesson already appears five times).
6. (Internal notes removed for the public edition.)
7. **No official payload or reach exists for the SO-101.** I derived reach ≈ 0.41 m (shoulder axis to grasp point) from the URDF. A static estimate gives ≈ 0.19–0.26 kg at the stall torque of the 7.4 V servos with the arm fully stretched, and **0 g at their rated torque** (the stretched arm alone exceeds it). Treat these as RICHTWERT. A reseller claims "500 g" (unverified); that only fits the 12 V servos at stall.

---

## 1. SO-101 facts

### 1.1 Spec card (for the dojo and the showroom)

| Item | Value | Source / note |
|---|---|---|
| What it is | Open-source 3D-printed arm, the next version of the SO-100; designed by TheRobotStudio with Hugging Face for LeRobot; improved wiring, easier assembly, updated leader motors | [S1] |
| Setup | **Leader** (you move it by hand: handle + trigger) and **follower** (does the work: gripper with a fixed and a moving jaw). Teleoperation copies leader joint positions to the follower | [S1, S8, S9] |
| Joints | 6 motors: `shoulder_pan`, `shoulder_lift`, `elbow_flex`, `wrist_flex`, `wrist_roll`, `gripper`, i.e. 5 arm joints + gripper | URDF [S4]; LeRobot docs [S8] |
| Motors | Feetech STS3215 bus servos, 12-bit magnetic encoder ("360° when 0~4096") | Feetech [S36] |
| Follower gearing | 6 × STS3215 1/345 (C001, 7.4 V). A 12 V variant with 30 kg·cm stall torque is optional and needs a 12 V 5 A+ supply | [S1, S8]; Seeed lists C001 7.4 V or C018/C047 12 V for F1–F6 [S37] |
| Leader gearing | pan 1/191 (C044), shoulder_lift 1/345 (C001), elbow 1/191 (C044), wrist_flex / wrist_roll / gripper 1/147 (C046), so that the leader "can both sustain its own weight and … be moved without requiring much force" | [S8]; same table at Seeed [S37] |
| STS3215 C001 torque | Stall **19.5 kg·cm @ 6 V**, rated 6.5 kg·cm @ 6 V, 0.238 s/60° @ 6 V, 55 g, 45.2 × 24.7 × 35 mm | Feetech product page [S36]. The SO-ARM100 README says **16.5 kg·cm @ 6 V** [S1]. The two disagree, so show both or the lower |
| Supply | 5 V for the 7.4 V motors, 12 V for the 12 V motors | Seeed wiki [S37] |
| Reach | **≈ 0.41 m** from the shoulder-lift axis to `gripper_frame_link` (grasp point); ≈ 0.44 m horizontally from the base pan axis | **eigene Rechnung**, forward kinematics over 200k joint samples of [S4]: `artifacts/phase7/so101-vla/scripts/urdf_reach.py`. No official figure found |
| Mass (follower, no cables or clamp) | ≈ 0.63 kg (sum of link masses in the URDF, CAD-based); leader ≈ 0.66 kg | **eigene Rechnung** from [S4, S5]; real weight unverified |
| Payload | **No official figure.** Static estimate, arm stretched horizontally: 0 g at rated torque, ≈ 190 g at the README's 16.5 kg·cm, ≈ 260 g at Feetech's 19.5 kg·cm, ≈ 520 g at 12 V / 30 kg·cm, all at stall. Closer to the body it is higher | **eigene Rechnung** (`urdf_payload.py`: gravity torque about `shoulder_lift` from URDF masses and COMs). Reseller claim "500 g" (openelab, unverified [S39]) |
| Cameras (typical) | Front/top camera + wrist camera; LeRobot examples record 640 × 480 at 30 fps | [S9] |
| Joint limits (new calibration, URDF) | pan ±110°, shoulder_lift ±100°, elbow ±96.8°, wrist_flex ±95°, wrist_roll −157.2…+162.8°, gripper −10…+100° (leader trigger 0…45°, provisional) | [S4, S5, S3] |
| Parts cost (BOM, without printed parts) | Leader + follower: **$229.88 / €226.30**; one follower: $121.94 / €124.30 | SO-ARM100 README BOM [S1]. Kits vary by seller (WowRobo shows $199 for its default package, sold out [S38]). **The game has a "no prices" rule, see founder question Q2** |
| Licence | Apache-2.0 for the whole repository (hardware files, URDF, meshes) | [S2] |

### 1.2 Why the leader is geared differently (a nice showroom fact)

The leader uses low-ratio gears (1/147, 1/191), so you can back-drive it by hand. Its shoulder keeps 1/345 so that it holds its own weight [S8]. The follower uses 1/345 everywhere for holding torque. This is a good line for the station sign: „Der Leader ist leichtgängig übersetzt, damit du ihn mit der Hand führen kannst.“ / "The leader is geared to move easily, so you can guide it by hand."

---

## 2. 3D assets: which source is best for the web game

### 2.1 Candidates

| Source | Exact path | Commit / tag | Licence (SPDX) | Covers meshes? | Content | Size | Verdict |
|---|---|---|---|---|---|---|---|
| **TheRobotStudio/SO-ARM100** | `Simulation/SO101/so101_new_calib.urdf` + `Simulation/SO101/assets/*.stl` | `a758567c3978dfeefe282ede0500085a48fe8f78` (2026-10-06); SO101 folder last changed `5f6d2b876a` (2026-09-23) | **Apache-2.0** (root `LICENSE`; no NOTICE file; copyright line left as the template) | yes, one licence for the whole repo | Follower URDF (onshape-to-robot, relative mesh paths), **leader URDF** `so101_leader_new_calib.urdf`, MJCF `so101_new_calib.xml`, camera variants `so101_new_calib_camera.{urdf,xml}`, old calibration | Follower visual meshes: 13 STL files, **16.13 MB, ≈ 322.6k triangles** (≈ 399k drawn, since the servo mesh repeats 5×); leader swaps 2 meshes for 3 (`Handle_SO101` 0.47 MB, `Trigger_SO101` 1.41 MB, `Wrist_Roll_SO101` 0.70 MB), 15.86 MB | **Use this one** for visuals and kinematics. It is the only source with a leader |
| **google-deepmind/mujoco_menagerie** | `robotstudio_so101/so101.xml` + `assets/` | `62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35` (2026-10-15); folder last changed `3abca2e302` (2026-09-28) | **Apache-2.0** (`robotstudio_so101/LICENSE`) | yes | Derived from SO-ARM100 `so101_new_calib.xml` (at `aec17bb`): rounded floats, implicitfast, **9 primitive box colliders + convex jaw parts**, gripper contact parameters, wrist camera mount + `wrist_cam` | 18.15 MB STL (same arm meshes plus jaw parts and a camera mount) | **Use it for collider sizes and the wrist-camera pose** (feeds Rapier). Follower only |
| SO-ARM100 CAD | `STEP/SO101/*.step` (incl. `SO101 Assembly.step`, 20.5 MB); print STLs in `STL/SO101/` | same | Apache-2.0 | yes | Exact CAD, not rigged | — | Only if the pipeline wants a cleaner retessellation (STEP → glTF with chosen tolerance) |
| SO-ARM100 optional parts | `Optional/Overhead_Cam_Mount_32x32_UVC_Module/stl/*.stl` (4 parts, ≈ 0.26 MB), wrist camera mounts | same | Apache-2.0 | yes | Real overhead camera mount and wrist camera mounts | small | Nice real props for the top camera on the bench |
| EmAI copy | in a private EmAI project | no provenance pin | (Apache-2.0 upstream) | — | The same `so101_new_calib.xml` + 13 STL (byte-identical sizes) | 15.5 MB | Do not use as the source; pin upstream |
| robot_descriptions.py | `so_arm101_description` → SO-ARM100 @ `63eede5` | — | Apache-2.0 | — | Loader only, not a separate model | — | n/a |
| huggingface/lerobot | no URDF/STL/MJCF in the repo (checked the full tree at `146d847`) | `146d8474932c…` | Apache-2.0 | — | — | — | n/a |

**No hand-made look-alike is needed anywhere.** Follower, leader, servo, wrist camera mount and overhead camera mount all exist as real, licensed meshes.

### 2.2 Kinematic tree (both URDFs; leader differs only below `gripper_link`)

| Joint | Type | Parent → child | Limits (rad / °) | Origin xyz (m) |
|---|---|---|---|---|
| `shoulder_pan` | revolute, axis z | `base_link` → `shoulder_link` | ±1.91986 / ±110.0 | 0.0388 0 0.0624 |
| `shoulder_lift` | revolute | `shoulder_link` → `upper_arm_link` | ±1.74533 / ±100.0 | −0.0304 −0.0183 −0.0542 |
| `elbow_flex` | revolute | `upper_arm_link` → `lower_arm_link` | ±1.69 / ±96.8 | −0.11257 −0.028 0 |
| `wrist_flex` | revolute | `lower_arm_link` → `wrist_link` | ±1.65806 / ±95.0 | −0.1349 0.0052 0 |
| `wrist_roll` | revolute | `wrist_link` → `gripper_link` | −2.74385…2.84121 / −157.2…162.8 | 0 −0.0611 0.0181 |
| `gripper` (follower) | revolute | `gripper_link` → `moving_jaw_so101_v1_link` | −0.17453…1.74533 / −10…100 | 0.0202 0.0188 −0.0234 |
| `gripper` (leader trigger) | revolute | `gripper_link` → `trigger_link` | 0…0.7854 / 0…45 (**provisional**: "derived from CAD geometry … not from a measured leader unit") | same |
| `gripper_frame_joint` | fixed | `gripper_link` → `gripper_frame_link` (grasp point) | — | −0.0079 −0.0002 −0.0981 |

Joint names match LeRobot's action names exactly (`shoulder_pan … gripper`). URDF `effort="10" velocity="10"` are placeholders; never show them as specs. In LeRobot the gripper is a linear 0 (closed) … 100 (open), and the URDF does not reflect that yet [S3].

### 2.3 Notes for the asset pipeline (it converts; R1 only names the source)

- **Units are metres** (no `scale` attribute), and the URDF is Z-up: rotate it to three.js Y-up at the root.
- **Per arm, one node per link**, named as the URDF link, with its pivot at the joint origin. Then the game sets joint angles directly from the URDF axes (the TS constant table is generated at build time, not hand-typed).
- **Instance or merge the servo mesh**: `sts3215_03a_v1.stl` (19.1k triangles) appears five times per arm.
- **Decimation target:** ≤ 20k triangles per arm (zone detail budget 90k triangles, 80 draw calls, GDD §11). Two arms ≈ 40k. Thin jaw edges and the trigger need care.
- **Two materials:** printed plastic and servo black. The URDF colours printed parts yellow `rgba 1 0.82 0.12` and servos `0.1 0.1 0.1`. In reality the PLA colour is the builder's choice (sellers offer black, white, blue, orange [S38]), so printing it in EmAI colours is honest. Founder question Q3.
- **Colliders for Rapier:** take box sizes and positions from Menagerie `so101.xml` (`collision`/`collision_gripper` classes); the jaws as two kinematic boxes each.
- **Leader** uses the same arm meshes, with `Handle_SO101`, `Trigger_SO101` and `Wrist_Roll_SO101` below `gripper_link`.

### 2.4 Licence, attribution, trademarks

| Point | What to do |
|---|---|
| Licence | Apache-2.0 for SO-ARM100 and Menagerie. Ship `LICENSES/Apache-2.0.txt`. §4(b): converted/decimated files are modifications, so add a "modified by EmAI" note in the credits and in the glTF `asset.extras` |
| Attribution (proposal, credits screen + LICENSES) | „SO-101-Robotermodell: TheRobotStudio und Mitwirkende des SO-ARM100-Projekts (mit Hugging Face), github.com/TheRobotStudio/SO-ARM100, Commit a758567, Apache-Lizenz 2.0. Von EmAI nach glTF konvertiert und vereinfacht. Kollisionsformen nach MuJoCo Menagerie `robotstudio_so101` (Google DeepMind), Apache-Lizenz 2.0.“ / "SO-101 robot model: TheRobotStudio and SO-ARM100 contributors (with Hugging Face), github.com/TheRobotStudio/SO-ARM100, commit a758567, Apache License 2.0. Converted to glTF and simplified by EmAI. Collision shapes after MuJoCo Menagerie `robotstudio_so101` (Google DeepMind), Apache License 2.0." |
| Non-commercial restriction | none (Apache-2.0 permits commercial use) |
| Trademarks | Apache-2.0 §6 grants no trademark rights. Use "SO-101", "LeRobot", "Hugging Face", "SmolVLA", "π0", "GR00T" only as plain names that identify the product, with no logos and nothing that implies endorsement. Not legal advice; a quick legal check before release is cheap |

---

## 3. The LeRobot workflow (what the game should mirror)

LeRobot 0.6.1 is the current PyPI release (2026-08-03) [S17]; docs at `main` `146d847` [S8–S16].

| Step | What happens | Command / numbers | Source |
|---|---|---|---|
| 1 Build and set up motors | Assign IDs 1–6 and the baud rate per motor, once (EEPROM) | `lerobot-setup-motors --robot.type=so101_follower …` / `--teleop.type=so101_leader` | [S8] |
| 2 Calibrate | Put every joint at mid-range, then move each through its full range. Leader and follower then report the same values in the same pose, "which allows a neural network trained on one robot to work on another" | `lerobot-calibrate` | [S8] |
| 3 Teleoperate | The follower copies the leader. Cameras can be added and shown live | `lerobot-teleoperate --robot.type=so101_follower … --teleop.type=so101_leader …` (example loop at 30 Hz) | [S9] |
| 4 Record episodes | One task string per dataset (`--dataset.single_task="Grab the black cube"`). Defaults: **50 episodes, 60 s per episode, 60 s reset**. Keys: → next, ← re-record, Esc stop. Pushed to the Hub by default | `lerobot-record …` | [S9] |
| 5 Dataset format | LeRobotDataset **v3.0**: Parquet for states/actions, MP4 per camera, relational metadata; many episodes per file; streaming from the Hub | — | [S15] |
| 6 Data advice | "At least 50 episodes, with 10 episodes per location"; fixed cameras; consistent grasping; "you should be able to do the task yourself by only looking at the camera images"; "Avoid adding too much variation too quickly" | — | [S9] |
| 6b Dataset quality (HF blog) | Two camera views, steady video, neutral stable light, leader arm **not** in frame, no human limbs, ≥ 480 × 640, ~30 fps, task text 25–50 characters | — | [S35] |
| 7 Visualise / replay | Dataset visualiser on the Hub; `lerobot-replay` replays an episode on the robot | — | [S9] |
| 8 Train | ACT: "a few hours for 100k training steps on a single GPU", batch 8, ~80M parameters. SmolVLA: fine-tune `lerobot/smolvla_base` (450M), **20k steps ≈ 4 h on one A100**, ~50 episodes recommended ("25 episodes … was not enough") | `lerobot-train --policy.type=act …` / `--policy.path=lerobot/smolvla_base` | [S10, S11] |
| 9 Deploy / evaluate | `lerobot-rollout` with strategies `base` (no recording), `sentry` (record and upload, for large evaluations), `episodic`, `dagger` (human-in-the-loop corrections), `highlight`. `--inference.type=rtc` smooths slow VLAs (π0, π0.5, SmolVLA) | `lerobot-rollout --strategy.type=… --policy.path=…` | [S9] |
| 10 Report | GR00T doc: "Use `eval.n_episodes >= 50` per suite when reporting success rates" | — | [S14] |

**Game translation:** setup and calibration are a 5 s intro beat, not a mechanic. Teleop → record → (train) → command → evaluate is the play loop. The "→ / ← / Esc" keys match LeRobot (→ keep and next, ← discard and re-record), so the controls teach the real tool.

---

## 4. Policies that run on the SO-101 (state 2026-10)

| Policy | From | Size | Code / weights licence | Compute (official) | Action chunk | On SO-101 | Note |
|---|---|---|---|---|---|---|---|
| **ACT** | Zhao et al. 2023 | ~80M | Apache-2.0 (LeRobot) | single GPU, a few hours | 100 steps (default) | yes | "first model we recommend when you're starting out" [S10]; paper: 6 real tasks at 80–90 % with "10 minutes worth of demonstrations" [S20] |
| **SmolVLA** | Hugging Face 2025 | 450M (~100M action expert) | code Apache-2.0; `lerobot/smolvla_base` **apache-2.0** | 20k steps ≈ 4 h on A100; "consumer-grade GPUs or even CPUs" for inference | 50 steps, 10 flow-matching steps | yes, built for it | pretrained on 481 community datasets, 22.9k episodes, 10.6M frames [S19, S11, S18, S27] |
| **π0 / π0-FAST** | Physical Intelligence 2024 | 3B VLM backbone | openpi code Apache-2.0; `lerobot/pi0_base` model card **license: gemma** | inference > 8 GB, LoRA fine-tune > 22.5 GB, full > 70 GB (A100/H100 80 GB) | 50 Hz control | via LeRobot | openpi base models "pre-trained on 10k+ hours of robot data" [S21, S24, S12, S27] |
| **π0.5** | Physical Intelligence 2025 | ~3B | openpi Apache-2.0; `lerobot/pi05_base` **license: gemma**, base `google/paligemma-3b-pt-224` (gated) | full fine-tune "sized for a single 80 GB GPU" | 10 action steps in the LIBERO example | via LeRobot | open-world generalisation; best average in the SO-101 benchmark (56 %) [S22, S13, S29] |
| π\*0.6 | Physical Intelligence 2025 | — | paper; not among openpi's checkpoints | — | — | — | RL from experience (RECAP) [S23] |
| **GR00T N1.7** | NVIDIA 2026 | 3B, Cosmos-Reason2-2B (Qwen3-VL) backbone | code Apache-2.0; weights **NVIDIA Open Model License**; backbone gated | inference 16 GB+, fine-tune 40 GB+ (H100/L40); SO-101 tutorial (N1.5): ~25 GB VRAM | flow-matching DiT, horizon "increased" | yes (`NEW_EMBODIMENT`) | pretrained with 20K h of human video; LIBERO 93–100 % in LeRobot (n ≥ 50 per suite) [S26, S14, S28]. The README says "fully commercially licensable under Apache 2.0" in its intro and lists the weights under the NVIDIA Open Model License in its licence section, so the two statements contradict each other |
| X-VLA | — | 0.9B | in LeRobot | — | — | — | "near-π₀ performance … 300× fewer trainable parameters" (LeRobot doc) [S46] |
| MolmoAct2 | Ai2 2026 | — | code Apache-2.0; weight licence **not stated** on the SO-100/101 card (unverified) | — | flow-matching expert | dedicated `MolmoAct2-SO100_101` checkpoint | [S42] |
| Wall-X, Diffusion, VQ-BeT, TD-MPC, … | various | — | in LeRobot `policies/` | — | — | some | LeRobot `main` has 25 folders under `policies/` (incl. the shared `common` and `rtc`), among them dm05, eo1, evo1, fastwam, lingbot_va, molmoact2, vla_jepa, wall_x, xvla [S16] |

**For card #6 („Welche Lizenz haben die Gewichte?“) this is real evidence:** the same model family ships code under Apache-2.0 and weights under Gemma terms (π0/π0.5) or the NVIDIA Open Model License (GR00T), and a vendor README can contradict itself. A sourced, true example, without naming a customer.

---

## 5. Published data volumes and success rates (with their conditions)

| Source | Robot | Policy | Training data | Eval n | Result | Conditions / caveat |
|---|---|---|---|---|---|---|
| SmolVLA paper, Table 3 [S19] | SO-100 | ACT / π0 / SmolVLA | 50 demos per task (5 positions × 10) | **not stated** | pick-place 70 / 100 / 75 %; stacking 50 / 40 / 90 %; sorting 25 / 45 / 70 %; average 48.3 / 61.7 / 78.3 % | partial credit (0.5 grasp + 0.5 place; sorting in 0.25 steps) |
| SmolVLA paper, Table 4 [S19] | **SO-101** | ACT / SmolVLA | single task (Lego pick-place) | **not stated** | in distribution 70 / 90 %; **out of distribution 40 / 50 %** | OOD = Lego in "novel positions" |
| SmolVLA paper, Fig. 5 [S19] | SO-100 | SmolVLA sync vs async | — | 10 trials × 5 positions (timing) | completion 13.75 s → 9.70 s (≈ 30 % faster); success 78.3 → 73.3 % | asynchronous inference |
| Yu & Qiu 2026 [S29] | **SO-101** | ACT / SmolVLA / Wall-X / π0.5 | **100 demos per task**, 400 in total | **20 per model × task** (320) | average 33.75 / 32.5 / 51.25 / 56.25 %; **colour sorting 0 / 5 / 0 / 10 %**; pen transfer 75 / 70 / 95 / 95 % | Failures (multi-label, over failed trials): grasp instability 91–100 %, repetition loop 91–100 %, state mismatch 46–98 %. Recovery 3–31 % |
| SmolVLA dataset `lerobot/svla_so101_pickplace` [S40] | SO-101 | — | 50 episodes, 11,939 frames at 30 fps (**6.6 min of motion, Ø 8.0 s per episode**, eigene Rechnung), cameras `up` + `side`, apache-2.0 | — | — | metadata says `robot_type: so100_follower` (a label quirk) |
| GR00T SO-101 tutorial [S28] | SO-101 | GR00T N1.5 | `so101-table-cleanup`, 80 episodes | none reported | — | — |
| LeRobot GR00T doc [S14] | LIBERO (sim) | GR00T N1.7 | LIBERO | ≥ 50 per suite | 95 / 100 / 98 / 93 %, average 96.5 % | simulation benchmark |
| LIBERO-Plus [S30] | sim | several VLAs | — | — | "from 95 % to below 30 % under modest perturbations"; extreme sensitivity to camera viewpoint and robot start state; language largely ignored | controlled perturbations in 7 dimensions |
| LIBERO-PRO [S31] | sim | several VLAs | — | — | > 90 % standard → **0.0 %** under perturbed objects, start states, instructions, environments; the same outputs with corrupted instructions | memorisation |
| Data scaling laws [S32] | real | single-task IL | 40,000+ demos, 15,000+ rollouts | — | generalisation follows ≈ a power law in the number of environments and objects; "diversity … far more important than the absolute number of demonstrations"; 4 collectors × 1 afternoon → ≈ 90 % in new environments | — |
| DROID [S33] | Franka | dataset | 76k trajectories, 350 h, 564 scenes, 84 tasks, 50 collectors, 12 months | — | — | scale of a real data campaign |
| Community volume [S41] | SO-101 | — | ≈ **8,700** public Hub datasets tagged LeRobot whose name matches "so101" (≈ 3,450 "so100") | — | — | name search, 2026-10-17; says nothing about quality |

**Small n, wide bands (eigene Rechnung, Wilson 95 %):** 14/20 = 70 % [48–86]; 15/20 = 75 % [53–89]; 18/20 = 90 % [70–97]; 2/20 = 10 % [3–30]; 45/50 = 90 % [79–96]; 25/50 = 50 % [37–63]. The SO-101 benchmark's ACT-vs-SmolVLA gap on pen transfer (75 vs 70 %) is noise at n = 20.

---

## 6. Typical failure modes: evidence, and how the game shows each

| Failure mode | Evidence | On the SO-101 | Game mechanic (B "Störungskarten") |
|---|---|---|---|
| **Distribution shift (position)** | SmolVLA SO-101 OOD 50 % vs ID 90 % [S19]; LeRobot "10 episodes per location" [S9] | the cube outside the recorded start fields | card „Neue Lage“: grab the cube (F) and set it down anywhere; the coverage meter turns red; the arm grasps beside it |
| **Language ignored** | LIBERO-PRO, LIBERO-Plus [S31, S30]; colour sorting 0–10 % on the SO-101 [S29] | "blue" in the command, but the arm goes to the usual place | card „Anderes Wort“: „Leg den **blauen** Würfel …“ → it grabs whichever cube sits where red used to be |
| **Lighting / appearance** | light is one of LIBERO-Plus's perturbation dimensions (no separate number in the abstract) [S30]; HF: "neutral, stable lighting" [S35]; LeRobot ColorJitter augmentation (brightness 0.7–1.3) [S14] | dusk light changes the hues the camera sees | card „Abendlicht“: perception loses the cube → the arm hovers and searches (the "Hover" failure) |
| **Camera moved** | camera-viewpoint sensitivity [S30]; "Keep the cameras fixed" [S9]; Lern-Dojo C already has „Kamera verschoben“ | 3 cm offset → a constant grasp miss | card „Kamera angestoßen“: the arm misses by 3 cm, again and again (the repetition loop, the top failure in [S29]) |
| **Grasp instability** | 91–100 % of failed SO-101 trials [S29] | the cube slips from the jaws | emerges from the grasp model when the approach is off-centre |
| **Latency** | async inference 30 % faster [S19]; RTC for chunked flow policies [S34] | pauses between chunks | optional STRETCH card „Langsames Netz“: 600 ms per chunk → the arm stutters; prefetch on → smooth |
| **Copies your mistakes** | rc4 album `policy-kopiert-fehler` | a kept failed demo is replayed | keep as is |

---

## 7. What a decision maker should know

| Topic | Fact (with source) | One line for the Befundkarte |
|---|---|---|
| Cost of data | LeRobot default 50 episodes × (≤ 60 s + 60 s reset) [S9]. The real 50-episode SO-101 set holds 6.6 min of motion [S40]. With 10–60 s per reset that is ≈ **15–60 min for one task in one setup** (RICHTWERT, eigene Rechnung). DROID took 50 people 12 months [S33] | „Die Daten kosten Menschenzeit, nicht Rechenzeit.“ |
| What data to collect | diversity of environments and objects beats the number of demos [S32]; 25 episodes were "not enough" for SmolVLA, 50 worked [S11] | „Plane Varianten × Wiederholungen, nicht nur ‚mehr Demos‘.“ |
| Generalisation limits | OOD positions halve success [S19]; sim benchmarks fall from > 90 % to ≈ 0–30 % under perturbation [S30, S31]; colour sorting fails on the real SO-101 [S29] | „Ein Modell kann nur, was in den Daten variiert.“ |
| Measuring | n per condition; GR00T doc asks n ≥ 50 [S14]; n = 20 gives ± 18 pp [eigene Rechnung] | „Erfolg je Bedingung, mit n und Intervall – sonst ist es Werbung.“ |
| Compute | ACT: one GPU, hours [S10]; SmolVLA: ≈ 4 h on one A100 [S11]; π0/π0.5: inference > 8 GB, LoRA > 22.5 GB, full > 70 GB [S24]; GR00T N1.7: inference 16 GB+, fine-tune 40 GB+ [S26] | „Kleine Modelle trainierst du in Stunden; große brauchen Rechenzentrums-GPUs.“ |
| Latency | the robot waits for the model unless chunks overlap (async, RTC) [S19, S34] | „Frag, wo das Modell läuft und wie lange eine Antwort dauert.“ |
| Licences | code and weights can differ (Apache-2.0 vs Gemma terms vs NVIDIA Open Model License; gated backbones) [S24, S26, S27] | card #6 |
| Safety | the SO-101 is a hobby and research arm with no safety rating (none claimed in [S1]). EU Machinery Regulation 2023/1230 applies from 20 Jan 2027 and lists machine-learning safety components among the categories that need third-party assessment (secondary sources [S44]; check against EUR-Lex) | „Zwischen Modell und Motor gehört eine Sicherheitsschicht.“ |

---

## 8. What EmAI actually does with SO-101 and VLA (read-only survey)

(Internal notes removed for the public edition.)

---

## 9. Lern-Dojo today and the recommendation

**Today (rc4):** A pushes a block with a 2-link SCARA (L1 0.7 m / L2 0.6 m on a 2.4 m table) five times. B runs a k-NN imitator (k = 3, 10-step chunks), succeeds in distribution, fails out of distribution and recovers with 2 demos. C audits 250 demos for a 14 % dead block, filters and evaluates (n = 100). Code: `src/zones/lern-dojo/` (≈ 6k lines; `core.ts` holds the sim and k-NN, `teleop.ts` holds A/B, `audit.ts` holds C). R6 rates A at fun 3 / learning 3 (near-identical demos, PT-11 „Demo ohne Ziel“), B at 4/5 and C at 3/4.

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **a) Upgrade in place: SO-101 replaces the SCARA, B gains language** | the lesson is the same (imitation → shift → data); real LeRobot workflow; reuses ribbons, brain window, k-NN, audit wall; no route growth; Entscheider ◆ stays 04 B | teleop of a 5-DOF arm needs good assisted controls; the SO-101 is small at real scale | **Recommended** |
| b) Keep the SCARA, add a VLA station elsewhere | no rework of A | duplicates the imitation lesson; the route grows; the procedural robot stays | no |
| c) New zone "VLA-Labor" | room for everything | breaks "six lobes = six zones"; +10 min | no |

---

## 10. Station design: Lern-Dojo with the real SO-101

Eyebrow `// 04 · LERNEN · IMITATION & SPRACHE` / `// 04 · LEARN · IMITATION & LANGUAGE`. Request (R6 §6.2): „Zeig dem Arm die Handgriffe. Dann macht er’s dir nach.“ / “Show the arm the moves. Then it copies you.”

### 10.1 Set (proposal; the zone team owns the coordinates)

| Element | Spec |
|---|---|
| Werkbank | 1.6 × 0.8 m at 0.90 m height, at local (0, 0, −3), replacing the Teleop-Tisch |
| Leader | real SO-101 leader, clamped at the player's front edge, left of centre |
| Follower | real SO-101 follower, 0.45 m further back, facing a 0.40 × 0.30 m work field |
| Work field | 5 marked start fields (6 × 6 cm, as in SmolVLA's "5 positions × 10" sets), a box 12 × 9 × 5 cm, three 3 cm cubes (red, blue, green); a 30 cm ruler printed on the bench for scale |
| Cameras | real overhead camera mount (SO-ARM100 `Optional/Overhead_Cam_Mount_*`) and the wrist camera (Menagerie pose); both feed the Gehirn-Fenster |
| Operate camera | behind the leader, ≈ 0.55 m above the bench, pitch ≈ −45°, plus a wrist-camera inset (fixes PT-11: you see where the jaws are) |
| Demo-Wolke | kept; ribbons are the follower's `gripper_frame` path scaled ×8 (the work field is ~⅓ the SCARA's) |
| Gehirn-Fenster | kept: SEHEN (top + wrist camera tiles as 8 × 8 patches), VERSTEHEN (command as word chips + „Worauf achtet die Policy?“ bars), HANDELN (6 joints × chunk bars) |
| Datensatz-Wand | kept; tiles become SO-101 episode thumbnails (R6) |

### 10.2 Station A · Vormachen (Probieren)

- **Do:** guide the leader; the follower copies it with a short servo lag. Task (fixed, like LeRobot's `single_task`): „Leg den roten Würfel in die Kiste.“ Only the red cube is on the table in A.
- **Controls:** the mouse moves the leader's grasp point over the bench (ray to plane, analytic IK, jaws pointing down); **hold left mouse** = lower to grasp height, release = lift; **Space** or right mouse = close/open the trigger; Q/E = wrist_roll (optional, needed for ★★★). → keep and next, ← discard (as in `lerobot-record`). Recording starts on the first touch; the demo ends when the cube rests in the box (auto-detected, no „Demo ohne Ziel“).
- **The game resets the cube** to the next start field, with the sign „In echt legst du ihn selbst zurück – das dauert oft länger als die Demo.“
- **Measured value:** „5 Demos · 4/5 Felder · Ø 8,7 s“ (SIM · LIVE).
- **Stars (play and method):** ★ 3 kept demos (R6) · ★★ demos from ≥ 3 different start fields · ★★★ 5 demos from 5 fields, Ø ≤ 9 s, no regrasp (calibrate with bots).
- **Lesson (≤ 14 words):** „Verschiedene Startlagen bringen mehr als viele gleiche Demos.“ / "Different start poses teach more than many identical demos."

### 10.3 Station B · Befehlen ◆ (Verstehen); the Entscheider core

1. **„Trainieren“** (3 s): hum, ribbons pulse. Chip: „Spielzeug-Training: 5 Demos · 1.300 Beispiele“ (SIM · LIVE) and „Echt: SmolVLA 20.000 Schritte ≈ 4 h auf einer A100“ (QUELLE [S11]).
2. **First command** (in distribution): pick the command from word chips: „Leg den roten Würfel in die Kiste.“ ✓. The orange ribbon threads the teal bundle and copies your hesitations (rc4 moment kept).
3. **The one prediction of the zone** (R6 §6.8): the red cube moves to an unrecorded field and the blue cube sits on a recorded one. „Was tut der Arm?“ Options: roten nehmen / blauen nehmen / nichts.
4. **Störungskarten** (four cards, any order; each is one run): „Neue Lage“, „Anderes Wort“ („Leg den **blauen** Würfel …“), „Abendlicht“, „Kamera angestoßen“. Each shows its failure (§6) and fills an album slot.
5. **Rescue:** record ≥ 4 demos with **both cubes** on the table and **alternating commands** (rot / blau); retrain. The bars in VERSTEHEN move: Wort 0 → high, Ort high → medium. „Leg den blauen …“ now works. „Abendlicht“ is fixed with the toggle „Helligkeit variieren“ (LeRobot's ColorJitter, QUELLE [S14]), „Kamera angestoßen“ with „Kamera festschrauben“ (the fix is operations, not data, which leads to card #8).
6. **Stamp, cards #8 and #6** (kept); #6 gets the real licence example from §4.
- **Measured value:** „rot ✓ · Wort ignoriert ✗ → +4 Demos → blau ✓“.
- **Stars:** ★ chain complete · ★★ found all four ways to break it · ★★★ rescue with ≤ 4 new demos (2 colours × 2 fields: the smallest diverse set).
- **Lesson:** „Er folgt Wörtern nur, wenn Wörter in deinen Demos etwas verändert haben.“ / "It follows words only if words changed something in your demos."
- **Honest footer (replaces rc4's):** „So ist ein VLA aufgebaut: Bild + Sprache + Zustand → Aktions-Chunk. Hier läuft ein Spielzeug-Imitator, kein SmolVLA.“ / "This is how a VLA is built: image + language + state → action chunk. A toy imitator runs here, not SmolVLA."
- **QUELLE panel (on the window, optional):** „Echter SO-101, je 100 Demos, je 20 Versuche: Farbsortieren 0–10 %.“ [S29] · „SmolVLA, SO-101: bekannte Lagen 90 %, neue Lagen 50 % (n nicht angegeben).“ [S19]

### 10.4 Station C · Prüfen (Messen)

Keep rc4's audit and its stars; change what is shown and what is measured.
- **Wall:** 250 SO-101 episodes of the same task (rot/blau in die Kiste) from „drei Werkbänken“ (ILLUSTRATIV, anonymised pattern). Tiles show top-camera thumbnails + task text. Defects as in rc4 (35-episode dead block, 12 „Kamera verschoben“), plus one new hidden defect for ★★★: **18 mislabelled episodes** (the task says „rot“, the arm moves blue). Language labels are data too.
- **Measure per condition, not one number:** „Evaluieren“ runs n = 50 each on two fixed conditions, „bekannte Lagen“ and „neue Lagen“, for the raw and the cleaned dataset (rc4 model and Wilson bands; the bands are shown, not taught again).
- **Measured value:** „Totblock raus · bekannte Lagen 92 % [81–97] · neue Lagen 54 % [40–67] (n = 50 je)“ (ILLUSTRATIV parameters, SIM draws).
- **Stars:** as rc4 (★ dead block ≤ 5 false removals + before/after evaluated · ★★ 0 false removals · ★★★ also the mislabelled or camera-shift episodes).
- **Lesson:** „Eine Zahl ohne Bedingung ist keine Zahl. Messung statt Marketing.“ / "A number without its condition is no number. Measurement, not marketing."
- **Thruster beat (R6):** after the last stamp, say „Gib mir das Ventil“ and the SO-101 hands you the part for M4.

### 10.5 Entscheider view (04 B only, ≈ 6 min)

- A is skippable (grey stamp). B preloads **50 demos, 5 fields × 10** (the structure of the real SmolVLA sets [S11]) with one cube and one command.
- The player gives the in-distribution command, makes the one prediction, plays „Anderes Wort“ and „Neue Lage“, then „Lade 40 Demos mit zwei Farben“ → retrain → ✓.
- Then a short Befundkarte (du):

| Field | DE | EN |
|---|---|---|
| Messgröße | Erfolg je Bedingung (Lage, Wort, Licht, Kamera), mit n und Intervall | Success per condition (pose, word, light, camera), with n and interval |
| Grenze | Außerhalb der Demo-Varianten bricht die Policy ein; Wörter ohne Varianz ignoriert sie. | Outside the demo variants the policy breaks; words without variation are ignored. |
| Frage | „Gleiche Eingaben im Betrieb wie im Training?“ (#8) | "Same inputs in operation as in training?" (#8) |
| Für dein Werk | Plane die Aufnahme wie einen Versuch: Varianten × Wiederholungen; miss jede Variante mit n ≥ 50. | Plan recording like an experiment: variants × repetitions; measure each variant with n ≥ 50. |

- Optional side panel „Was kostet ein Skill?“: data 15–60 min per task and setup (RICHTWERT), training hours to a day (QUELLE), measuring n ≥ 50 per condition. No prices (Q2).

### 10.6 Minute by minute (Entdecker, ≈ 13 min)

| t | Beat | Fun hook |
|---|---|---|
| 0:00 | Enter; EMI: „Das ist ein SO-101. Echt, offen, der Bauplan ist im Netz. Du führst, ich lerne.“ | real robot, true size next to a ruler |
| 0:30 | Free play: move the leader, the follower mirrors, tip a cube over | the mirror moment, servo whine |
| 1:30 | Record 3–5 demos (≈ 10 s each + instant reset) | ribbons fly into the cloud; field coverage lights up |
| 4:00 | A stamp | banner „4/5 Felder“ |
| 4:30 | Train; first command ✓; it copies your hesitation | „Er hat dich gelernt.“ |
| 5:30 | The prediction („Was tut der Arm?“) → it grabs blue | the twist, a laugh |
| 6:30 | Three more cards: new pose, dusk, bumped camera | slapstick: the regrasp loop; the arm hovers |
| 9:00 | Rescue with 4 two-colour demos; bars move; „blau“ ✓ | you fixed it with data |
| 10:00 | C: dataset wall, find the dead block, evaluate per condition | detective work |
| 12:30 | Stamp; the SO-101 hands you the part for M4 | reward you can see |

### 10.7 Album, EMI, sound

- **New album entries:** `wortblind` („Er hat ‚blau‘ gehört und rot genommen. Das Wort hat in deinen Demos nie etwas verändert.“ / "It heard 'blue' and took red. The word never changed anything in your demos.") and `schleife` („Kamera 3 cm daneben – er greift 3 cm daneben. Immer wieder.“ / "Camera 3 cm off: it grasps 3 cm off. Again and again."). Keep `policy-kopiert-fehler`.
- **EMI lines (du, both modes):**

| Trigger | DE | EN |
|---|---|---|
| Enter | „Das ist ein SO-101. Echt, offen, Bauplan im Netz. Du führst, ich lerne.“ | "This is an SO-101. Real, open, plans online. You lead, I learn." |
| A done | „Vier Startfelder. Je verschiedener deine Demos, desto mehr kann ich.“ | "Four start fields. The more varied your demos, the more I can do." |
| Word ignored | „Ich habe ‚blau‘ gehört. Aber in deinen Demos hat das Wort nie etwas geändert.“ | "I heard 'blue'. But in your demos the word never changed anything." |
| Dusk | „Abendlicht. Dein Rot sieht für mich jetzt anders aus.“ | "Evening light. Your red looks different to me now." |
| Camera | „Die Kamera steht daneben. Also greife ich daneben.“ | "The camera is off. So I grasp off." |
| Rescue | „Jetzt unterscheiden deine Demos rot und blau. Jetzt höre ich zu.“ | "Now your demos tell red from blue. Now I listen." |
| C | „Eine Zahl ohne Bedingung ist keine Zahl. Wo hast du gemessen?“ | "A number without its condition is no number. Where did you measure?" |

- **Sound:** keep the rc4 set; add a short servo whine on leader moves (procedural, pitch from joint speed) and a soft click when the jaws close.

---

## 11. How to approximate the policy in the browser, honestly

All toy numbers carry **SIM · LIVE**; published numbers **QUELLE**; the C dataset model **ILLUSTRATIV**; reach and payload **RICHTWERT**.

| Part | Approach | Why it is honest |
|---|---|---|
| Kinematics | URDF joint table (generated); analytic IK: pan = atan2; a planar 2-link solve for shoulder_lift / elbow to the wrist point; wrist_flex keeps the jaws vertical; wrist_roll from Q/E or auto-aligned | the real arm's geometry |
| Follower lag | first-order lag on joint targets, τ ≈ 80 ms (ILLUSTRATIV) | mirrors a position servo |
| Physics | private Rapier world at 100 Hz: 3 dynamic 3 cm cubes, kinematic jaw boxes (Menagerie sizes), static box. Grasp = contact on both jaws while closing; it slips if off-centre > 1.2 cm or yaw error > 25° (tunable) | gives "grasp instability" for free |
| Perception (SEHEN) | Canvas2D renders 64 × 48 top and wrist images from the sim (as rc4 does); colour classes from hue thresholds **learned from the demos' frames**; the light card tints the render; the camera card shifts the camera's extrinsics | real (tiny) perception; dusk and bump fail for the real reason |
| Target selection ("which cube") | logistic score per candidate = a·[command word = perceived colour] + b·[density of training target positions here], with a and b fitted on the demos (a few gradient steps). One-cube, one-word demos give no contrast, so **a stays ≈ 0** → the word is ignored. Two-cube demos with mixed commands make a large. VERSTEHEN shows a and b as bars | the language weight is learned, not scripted |
| Motion (HANDELN) | rc4's k-NN behaviour cloning (k = 3) over target-relative features (grasp point − target, jaw opening, carrying flag) plus the absolute target position (for coverage), returning the averaged action chunk (15 steps = 0.5 s at 30 Hz) of 6 joint deltas; re-query per chunk. Label: „SmolVLA: 50 Schritte, ACT: 100“ | the same structure as ACT/SmolVLA chunking; OOD and copied hesitation arise as in rc4 |
| Safety layer | every action is clipped to joint limits and ≤ 10° per step; a counter shows „geklippt: n“ | the real practice |
| Evaluation in C | rc4 audit model (ILLUSTRATIV) for the 250-episode set; per-condition draws; Wilson bands from the shared kit | unchanged honesty rules |
| Optional STRETCH | latency card: chunk refill waits 600 ms vs prefetch (SmolVLA async, QUELLE [S19]) | — |
| Not recommended | MuJoCo WASM (npm `mujoco` 3.1.16, Apache-2.0, 18 MB unpacked [S45]) or ONNX inference for this station: they blow the load budget (< 8 MB total) and are not needed for the lesson; leave them to the Open Duck lane | — |

**Budget:** 2 arms ≤ 40k triangles and ≤ 14 draw calls (7 links each, materials merged); 3 cubes + box ≤ 1k triangles; 1 render target (as rc4); k-NN query per chunk (≈ 5 queries/s × ≤ 3k samples × 10 dims) ≪ 1 ms; `update` ≤ 1.5 ms CPU.

**Modules to change:** `teleop.ts` (SCARA → leader/follower IK, controls), `core.ts` (cubes, jaws, grasp, selector, perception hooks), `brain.ts` (6-dimension chunk, word chips, weight bars), `ribbons.ts` (scale), `audit.ts`/`dataset.ts` (thumbnails, label defect, two conditions), `strings.ts`, `cards.ts`, `pavilion.ts` (bench), new assets `public/zones/lern-dojo/so101-{follower,leader}.glb` loaded with `ctx.assets.loadModel` (ARCHITECTURE.md:532). Debug hooks as rc4 plus `solve('lern-dojo','wortblind')`.

**Acceptance (additions to GDD §7.4):**
1. Leader moves → follower mirrors with joint angles within 2° after 0.3 s.
2. Recording ends automatically on "cube in box".
3. With one-cube demos the "blue" command picks the cube nearest the training positions in ≥ 9/10 seeds; after ≥ 4 two-colour demos it picks blue in ≥ 9/10.
4. Dusk and bumped-camera cards fail reproducibly and recover with their fixes.
5. Zone within the detail budget with `?only=lern-dojo`.

---

## 12. Founder questions and risks

**Founder questions** (also in the structured summary):
- **Q1:** Upgrade the Lern-Dojo in place with the SO-101, replacing the SCARA? Recommended: yes.
- **Q2:** Prices: keep the "no prices" rule, or show the official BOM? Recommended: keep the rule, show effort and hours.
- **Q3:** Print colour of the SO-101: EmAI colours, the URDF yellow, or neutral white/black? Recommended: white parts + black servos with an orange accent.
- **Q4:** Name real models and their published numbers in player text? Recommended: yes, with QUELLE chips and the toy label.
- **Q5:** Use EmAI's internal G1 measurements in player text? Recommended: the lesson only, no internal numbers.

**Risks:**
- Mouse teleop of a 5-DOF arm can feel fiddly. Playtest the assisted IK early.
- The real-scale arm is small (0.4 m reach) and needs the close operate camera.
- Decimating 323k → 20k triangles may break thin parts.
- The leader URDF is three weeks old with provisional trigger limits.
- Published numbers often omit n.
- Licence statements contradict each other (GR00T README; π0 weights under Gemma terms). This matters for text only, since no weights ship.
- Trademark use must stay to plain names: no logos, no implied endorsement.
- Scope creep in B (cap at four cards).

---

## 13. Sources (all accessed 2026-10-17)

| ID | Source | URL |
|---|---|---|
| S1 | TheRobotStudio SO-ARM100 README @ a758567 | https://github.com/TheRobotStudio/SO-ARM100/blob/a758567c3978dfeefe282ede0500085a48fe8f78/README.md |
| S2 | SO-ARM100 LICENSE (Apache-2.0) | https://github.com/TheRobotStudio/SO-ARM100/blob/a758567c3978dfeefe282ede0500085a48fe8f78/LICENSE |
| S3 | SO101 simulation README (calibration, leader caveat, gripper note) | https://github.com/TheRobotStudio/SO-ARM100/blob/a758567c3978dfeefe282ede0500085a48fe8f78/Simulation/SO101/README.md |
| S4 | Follower URDF `so101_new_calib.urdf` | https://github.com/TheRobotStudio/SO-ARM100/blob/a758567c3978dfeefe282ede0500085a48fe8f78/Simulation/SO101/so101_new_calib.urdf |
| S5 | Leader URDF `so101_leader_new_calib.urdf` | https://github.com/TheRobotStudio/SO-ARM100/blob/a758567c3978dfeefe282ede0500085a48fe8f78/Simulation/SO101/so101_leader_new_calib.urdf |
| S6 | Git tree with file sizes (GitHub API) | https://api.github.com/repos/TheRobotStudio/SO-ARM100/git/trees/a758567c3978dfeefe282ede0500085a48fe8f78?recursive=1 |
| S7 | MuJoCo Menagerie `robotstudio_so101` @ 62ab00f (README, CHANGELOG, LICENSE, so101.xml) | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35/robotstudio_so101 |
| S8 | LeRobot docs: SO-101 | https://huggingface.co/docs/lerobot/so101 |
| S9 | LeRobot docs: Imitation learning on real-world robots | https://huggingface.co/docs/lerobot/il_robots |
| S10 | LeRobot docs: ACT (`act.mdx` @ 146d847) | https://github.com/huggingface/lerobot/blob/146d8474932c8b566717eb2738ba459337ab71c4/docs/source/act.mdx |
| S11 | LeRobot docs: SmolVLA | https://github.com/huggingface/lerobot/blob/146d8474932c8b566717eb2738ba459337ab71c4/docs/source/smolvla.mdx |
| S12 | LeRobot docs: π0 | https://github.com/huggingface/lerobot/blob/146d8474932c8b566717eb2738ba459337ab71c4/docs/source/pi0.mdx |
| S13 | LeRobot docs: π0.5 | https://github.com/huggingface/lerobot/blob/146d8474932c8b566717eb2738ba459337ab71c4/docs/source/pi05.mdx |
| S14 | LeRobot docs: GR00T N1.7 | https://github.com/huggingface/lerobot/blob/146d8474932c8b566717eb2738ba459337ab71c4/docs/source/groot.mdx |
| S15 | LeRobot docs: LeRobotDataset v3.0 | https://github.com/huggingface/lerobot/blob/146d8474932c8b566717eb2738ba459337ab71c4/docs/source/lerobot-dataset-v3.mdx |
| S16 | LeRobot `src/lerobot/policies` listing @ 146d847 | https://github.com/huggingface/lerobot/tree/146d8474932c8b566717eb2738ba459337ab71c4/src/lerobot/policies |
| S17 | LeRobot on PyPI (0.6.1, 2026-08-03; Apache-2.0) | https://pypi.org/project/lerobot/ |
| S18 | SmolVLA / ACT default configs (chunk sizes) | https://github.com/huggingface/lerobot/blob/146d8474932c8b566717eb2738ba459337ab71c4/src/lerobot/policies/smolvla/configuration_smolvla.py · https://github.com/huggingface/lerobot/blob/146d8474932c8b566717eb2738ba459337ab71c4/src/lerobot/policies/act/configuration_act.py |
| S19 | Shukor et al., SmolVLA (arXiv 2506.01844), Tables 1–4, Fig. 5 | https://arxiv.org/abs/2506.01844 |
| S20 | Zhao et al., ACT / ALOHA (arXiv 2304.13705) | https://arxiv.org/abs/2304.13705 |
| S21 | Black et al., π0 (arXiv 2410.24164) | https://arxiv.org/abs/2410.24164 |
| S22 | Physical Intelligence, π0.5 (arXiv 2504.16054) | https://arxiv.org/abs/2504.16054 |
| S23 | π\*0.6 (arXiv 2511.14759) | https://arxiv.org/abs/2511.14759 |
| S24 | openpi README @ 215abfb (GPU needs, checkpoints, 10k+ hours) | https://github.com/Physical-Intelligence/openpi/blob/215abfb217dbac7d5f1273282331b9b1866c0479/README.md |
| S25 | NVIDIA, GR00T N1 (arXiv 2503.14734) | https://arxiv.org/abs/2503.14734 |
| S26 | Isaac-GR00T README @ dac54b3 (N1.7, hardware, licence) | https://github.com/NVIDIA/Isaac-GR00T/blob/dac54b313160c201c450f97df0fd74ebd379c892/README.md |
| S27 | Hub model cards (licence fields): smolvla_base, pi0_base, pi05_base, Cosmos-Reason2-2B, paligemma-3b-pt-224 | https://huggingface.co/lerobot/smolvla_base · https://huggingface.co/lerobot/pi0_base · https://huggingface.co/lerobot/pi05_base · https://huggingface.co/nvidia/Cosmos-Reason2-2B · https://huggingface.co/google/paligemma-3b-pt-224 |
| S28 | NVIDIA blog: post-training GR00T N1.5 for the SO-101 (2025-06-11) | https://huggingface.co/blog/nvidia/gr00t-n1-5-so101-tuning |
| S29 | Yu & Qiu, Benchmarking VLAs on SO-101 (arXiv 2606.08881v2), Tables 1, 3–5 | https://arxiv.org/abs/2606.08881 · https://arxiv.org/html/2606.08881v2 |
| S30 | Fei et al., LIBERO-Plus (arXiv 2510.13626) | https://arxiv.org/abs/2510.13626 |
| S31 | Zhou et al., LIBERO-PRO (arXiv 2510.03827) | https://arxiv.org/abs/2510.03827 |
| S32 | Lin et al., Data Scaling Laws in Imitation Learning (arXiv 2410.18647) | https://arxiv.org/abs/2410.18647 |
| S33 | Khazatsky et al., DROID (arXiv 2403.12945) | https://arxiv.org/abs/2403.12945 |
| S34 | Black et al., Real-Time Execution of Action Chunking Flow Policies (arXiv 2506.07339) | https://arxiv.org/abs/2506.07339 |
| S35 | HF blog: LeRobot community datasets, "What makes a good dataset" (2025-05-11) | https://huggingface.co/blog/lerobot-datasets |
| S36 | Feetech STS3215 (C001) product page | https://www.feetechrc.com/74v-19-kgcm-plastic-case-metal-tooth-magnetic-code-double-axis-ttl-series-steering-gear.html |
| S37 | Seeed Studio wiki: SO-ARM100/101 in LeRobot (servo table, supply) | https://wiki.seeedstudio.com/lerobot_so100m_new/ |
| S38 | WowRobo SO-ARM101 kit page (packages, colours, $199 default, sold out) | https://shop.wowrobo.com/products/so-arm101-diy-kit-assembled-version-1 |
| S39 | openelab reseller listing (claims payload 500 g; unverified) | https://openelab.io/products/seeed-studio-so-arm101-pro-assembled-kit-lerobot-6dof-robotic-arm |
| S40 | Hub datasets `lerobot/svla_so101_pickplace` (+ svla_so100_pickplace / stacking / sorting) `meta/info.json` | https://huggingface.co/datasets/lerobot/svla_so101_pickplace |
| S41 | Hub dataset search API (count of "so101" + LeRobot) | https://huggingface.co/api/datasets?search=so101&filter=LeRobot |
| S42 | MolmoAct2-SO100_101 model card; allenai/molmoact2 (Apache-2.0 code) | https://huggingface.co/allenai/MolmoAct2-SO100_101 · https://github.com/allenai/molmoact2 |
| S43 | robot_descriptions.py (SO-ARM101 entries, `_repositories.py`) | https://github.com/robot-descriptions/robot_descriptions.py |
| S44 | EU Machinery Regulation 2023/1230: EP legislative observatory summary; CEMA note on the 20 Jan 2027 date (secondary) | https://oeil.europarl.europa.eu/oeil/en/document-summary?id=1749182 · https://cema-agri.org/publication/news/1025-the-new-machinery-regulation-is-published-new-requirements-and-upcoming-steps |
| S45 | npm `mujoco` (WASM bindings, 3.1.16, Apache-2.0) | https://www.npmjs.com/package/mujoco |
| S46 | LeRobot docs: X-VLA | https://github.com/huggingface/lerobot/blob/146d8474932c8b566717eb2738ba459337ab71c4/docs/source/xvla.mdx |
| L1–L4 | (Internal notes removed for the public edition.) | — |
| L5 | Game: Lern-Dojo code and GDD/FUN-PLAN/R6 | `academy-island/src/zones/lern-dojo/`, `docs/GDD.md` §7.4, `docs/FUN-PLAN.md` §8.4, `docs/research/R6-QUEST-REVIEW.md` |

**Own calculations (scripts, Python run with `-I`, read URDFs only):** `artifacts/phase7/so101-vla/scripts/urdf_summary.py` (links, joints, masses), `urdf_reach.py` (reach), `urdf_payload.py` (static payload); mesh sizes and triangle estimates from `artifacts/phase7/so101-vla/so-arm100-tree.tsv` ((bytes − 84) / 50 per binary STL).
