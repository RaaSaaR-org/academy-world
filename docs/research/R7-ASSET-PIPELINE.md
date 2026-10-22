# R7 · Asset pipeline for real robot models

Phase 7 research, topic R7. Baseline: rc4. Date: 2026-10-17. This report changes no game code. It prototypes how real, published robot descriptions (URDF/MJCF with STL/OBJ/DAE meshes) get into the game as articulated, small GLB files, measures the result, and proposes the in-game architecture, budgets, build step and licence handling. Founder decisions D2 and D6 are lifted for Phase 7; "use the real objects, don't rebuild them" is the rule throughout.

Prototype: `artifacts/phase7/pipeline/` (own `package.json`, git-ignored). Outputs: `artifacts/phase7/pipeline/out/`. Downloads: `artifacts/phase7/downloads/pipeline-*/`. Sibling reports cross-checked for consistency: R2 (Open Duck), R3 (Unitree), R4 (Schauhalle).

---

## 0. Verdict

1. **The pipeline works end to end on real data.** Five robots were converted from their published URDFs and meshes with no hand-modelling: SO-101, Open Duck Mini v2, Unitree R1, G1 (29 DoF, rev 1.0) and H2. All 5 robots × 4 shipped variants pass the Khronos glTF validator (0 errors, 0 warnings). In the browser, link positions from the GLB joint API match an independent URDF forward-kinematics script to within 0.0005 mm (5 random poses × 3 deepest links per robot) [§4.5].
2. **Shipping format: one "rigidly skinned" GLB per robot.** All link meshes are merged into **one SkinnedMesh per LOD**. The bones are the URDF link nodes, and every vertex has weight 1 on its link. The robot stays fully articulated, but it costs **1 draw call** instead of 7–32 (one per moving body). LOD0 and LOD1 share one skeleton in the same file. A separate static L2 silhouette (≈ 2.8 k triangles) serves far views.
3. **Compression: `KHR_mesh_quantization` + `EXT_meshopt_compression` (level "high"), and no Draco.** three.js already contains the meshopt decoder (6.8 KB with brotli, WebAssembly embedded in the JS, MIT), so the game still makes zero requests to other servers. Measured with brotli: **SO-101 170 KB, Open Duck 333 KB, R1 286 KB, G1 267 KB, H2 211 KB**, each including LOD0 and LOD1. That is about 5–6 bytes per triangle [§4.2].
4. **The simplification error is set in millimetres, not as a percentage.** LOD0 uses 0.2 mm on desk-size robots and 0.6–0.8 mm on human-size ones. From the usual viewing distances, LOD0 cannot be told apart from the full CAD geometry: the silhouette overlap (IoU) is ≥ 0.993 and the mean colour difference is ≤ 2.6 of 255. The triangle count drops by 88–98 % (G1: 393 k → 39 k triangles). The LOD1 switch distance follows a half-pixel rule: 1.9 m for the SO-101 up to 6.2 m for the H2 [§4.4].
5. **Colours: the vendors' own colours, as vertex colours on one shared material.** Robots are not recoloured to the brand and there are no textures. The URDF colours become COLOR_0, converted from sRGB to linear. All robots share one PBR material, so they compile one shader program [§6].
6. **Licences: all five are usable, with duties.** SO-101 and Open Duck are Apache-2.0. Unitree is BSD-3-Clause, and its binary-form clause requires shipping the notice. **Open Duck carries an IP risk outside its licence:** its README calls it "a miniature version of the BDX Droid by Disney". It needs a legal check before public release [§2, §10]. **Side finding:** the deployed rc4-era build ships no third-party notices at all. three.js (MIT), Rapier (Apache-2.0), postprocessing (Zlib), troika (MIT) and the OFL fonts are all missing from `dist/`. Fix it with the same mechanism [§10.3].
7. **Do not reuse the local G1 copy in a private EmAI project.** It is byte-identical to Unitree's *deprecated* `g1_29dof.urdf` (mode_machine 2), with the same meshes. It ships without a licence file. Its `g1.glb` is 7.6 MB, 382 k triangles, with no normals and no joint data. Convert from upstream `g1_29dof_rev_1_0.urdf` instead [§2.2].

---

## 1. What was built

| Piece | Path (under `artifacts/phase7/pipeline/`) | What it does |
|---|---|---|
| Config | `robots.config.mjs` | Per robot: URDF path, pinned source and licence, LOD errors (m), cut list, per-part error scale, yaw fix, demo joint |
| Converter | `convert.mjs` | URDF → kinematic tree → per-part weld, simplify and normals (cached per mesh file) → per-body merge → glTF document (one node per link, joint data in extras) → variants `ref`, `rigid`, `skin`, `skin.mo`, `l2` + sidecar `<id>.robot.json`. 5 robots × 5 variants in 7.2 s (Apple M5 Pro) |
| Sizes | `sizes.mjs` | raw / gzip −9 / brotli q11 per GLB → `out/sizes.json` |
| Viewer + joint API | `viewer/index.html`, `viewer/main.js`, `viewer/RobotModel.js` | three r186 test page; `RobotModel` is the prototype of the in-game joint API (setJoint, limits, mimic, FK, CCD IK, LOD) |
| Measurement driver | `render.mjs` | Headless Chromium on ANGLE Metal (same launch as `tools/lib/shotlib.mjs`), own server on port 0: load timings (median of 3, fresh page), 4× CPU timings, the scale shot next to 1.55 m, a 3-pose joint strip, quality vs reference, CCD test → `out/render-results.json`, `out/shots/` |
| Checks | `check/fk_ref.py` (stdlib, `python3 -I`), `check/fkcheck.mjs`, `check/validate.mjs` (Khronos glTF-Validator), `check/inspect.mjs`, `check/errcurve.mjs`, `check/l2shot.mjs`, `diffshot.mjs`, `partstats.mjs` | Independent FK, spec validity, triangles vs error, per-part breakdown |

Run: `cd artifacts/phase7/pipeline && npm install --ignore-scripts && node convert.mjs && node sizes.mjs && node render.mjs && node check/fkcheck.mjs && node check/validate.mjs`.

Safety: every download sits in its own folder, is fetched with `git clone --filter=blob:none` + sparse checkout (hooks off), and is read only as XML/STL bytes. No script or build tool from a download was run. Python ran with `-I`. Mesh paths that resolve outside the downloads folder are rejected (`resolveMesh`).

---

## 2. Sources and licences (pinned)

### 2.1 Converted assets

| Robot | Repo @ commit (date) | Exact path | SPDX · covers meshes? | Copyright / attribution to show | Restrictions and notes |
|---|---|---|---|---|---|
| **SO-101** (follower) | `TheRobotStudio/SO-ARM100` @ `a758567c3978dfeefe282ede0500085a48fe8f78` (2026-10-06) [S1] | `Simulation/SO101/so101_new_calib.urdf` + `Simulation/SO101/assets/*.stl` (13 files used) | **Apache-2.0** (root `LICENSE`, no `NOTICE` file). There is no separate CAD licence and the README makes no other statement, so the repo licence covers the STL files [S1, S2] | The licence appendix names no holder. Show: „SO-101: TheRobotStudio / SO-ARM100, Apache-2.0, konvertiert und vereinfacht von EmAI“ | Apache §6: no trademark licence. The URDF effort and velocity (`10`) are placeholders, never show them as specs. LeRobot treats the gripper as linear 0–100; in the URDF it is revolute [S2] |
| **Open Duck Mini v2** | `apirrone/Open_Duck_Mini` branch `v2` @ `b23317a485b3cec7d8417f352478778b3475173c` (2026-01-31) [S4] | `mini_bdx/robots/open_duck_mini_v2/robot.urdf` + `*.stl` there (120 of 131 visuals used, 11 hidden internals cut) | **Apache-2.0** (root `LICENSE`, no `NOTICE`) [S4] | Commits by Antoine Pirrone; contributors in `thanks.md`. Show: „Open Duck Mini v2: Antoine Pirrone und Community, Apache-2.0, konvertiert und vereinfacht von EmAI“ | **IP risk:** README: "We are making a miniature version of the BDX Droid by Disney" [S5]. The repo authors cannot license Disney's design rights. Never use "BDX", "Disney" or "Star Wars". Legal check before public release (R2 reached the same conclusion). The provenance of the vendor part meshes (`wj-wk00-*` servo cases, Pi Zero, SG90) is undocumented (R2) |
| **Unitree G1** 29 DoF rev 1.0 | `unitreerobotics/unitree_ros` @ `5994d4faef0a9cadd3287f8de0199a67eeb2a259` (2026-09-30) [S7] | `robots/g1_description/g1_29dof_rev_1_0.urdf` (mode_machine 5) + `robots/g1_description/meshes/*.STL` (35 files) [S8] | **BSD-3-Clause** (root `LICENSE`). No other terms exist. MuJoCo Menagerie redistributes the same G1 meshes under BSD-3 with Unitree's copyright [S12], so it covers the meshes | „Copyright (c) 2016-2022 HangZhou YuShu TECHNOLOGY CO.,LTD. ("Unitree Robotics")“ + full licence text (binary clause) | Clause 3: no endorsement. The torso mesh carries raised **"UNITREE" lettering** (a trademark in the geometry). Keep it as part of the real object, and use no Unitree logo anywhere else (§12, Q2) |
| **Unitree R1** | same repo @ `5994d4f` | `robots/r1_description/R1.urdf` + `meshes/*` (42 files) | BSD-3-Clause, as above | as above | Parallel ankle linkage (`*_ankle_constraint_A/B_link`): URDF cannot close the loop, so the push rods follow only approximately when the ankles move |
| **Unitree H2** | same repo @ `5994d4f` | `robots/h2_description/H2.urdf` + `meshes/*.stl` (34 files) | BSD-3-Clause, as above | as above | `H2_dae.urdf` (DAE, more colours) and `H2_loop.*` (closed loop) exist; the prototype reads STL only |

Cross-checks: the G1 in MuJoCo Menagerie `unitree_g1` (@ `62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35`) is "derived from the publicly available MJCF description" `g1_29dof_rev_1_0.xml` and released under BSD-3-Clause, © Unitree Robotics 2016-2023. Its STL files have the same names as upstream [S12]. Menagerie `robotstudio_so101` is Apache-2.0, derived from `so101_new_calib.xml` [S13].

### 2.2 The local G1 copy (read-only check)

| Check | Result |
|---|---|
| the local copy's `g1.urdf` | SHA-256 prefix `e1dc89366bf96aa3` = upstream `g1_29dof.urdf`, which the upstream table marks **deprecated** (mode_machine 2, hip gear {14.3, 14.5}) [S8] |
| Meshes (sampled: pelvis, left_knee, head, torso_link_rev_1_0) | byte-identical to upstream @ `5994d4f` |
| Licence file in the folder | **none**, so add the BSD-3 notice if anything from it is ever reused |
| `g1.glb` (7.6 MB) | glTF-Transform output: 382,618 triangles, 36 primitives, attributes POSITION and COLOR_0 only (**no normals**), no materials, **no joint extras** (76 nodes named after links) |

Use the upstream rev 1.0 URDF instead. It matches the robots sold today and comes with an auditable commit.

---

## 3. Conversion pipeline (as prototyped)

| Step | Choice | Why |
|---|---|---|
| 1 Parse | URDF via `fast-xml-parser`. Top-level `<link>`/`<joint>` only (SO-101's `<transmission>` blocks also contain `<joint>`); `package://pkg/…` and `package:///…` are resolved inside the downloads folder | Pure data, no ROS needed |
| 2 Tree | Root link = the link that is no joint's child. **Body** = nearest ancestor-or-self whose joint is revolute, continuous or prismatic. Fixed links are folded into their body by matrix; their frames stay as empty nodes (gripper frame, cameras, IMU) | Fewer bodies; frames are kept as attach and IK points |
| 3 Parts | Per mesh file and scale, processed **once** and then placed (simplification is invariant under rigid transforms): weld by position (1 µm) → `MeshoptSimplifier.simplify` with `ErrorAbsolute + Prune`, target count 0, so the **error in metres** limits the result → drop zero-area triangles → **smoothing-group normals** (35° crease) | The duck's 14 identical servo cases are simplified once. Smoothing groups instead of three's `toCreasedNormals` cut vertices per triangle from 1.53 to 1.16 (G1) and the G1 file by ≈ 26 % |
| 4 LOD1 | The same, then `simplifySloppy` (topology-free) at the LOD1 error | Closes tiny gaps and merges small parts. Duck LOD1: 18.6 k → 10.5 k triangles |
| 5 Cuts | Config `exclude` (regex on the mesh file): only parts **hidden inside a closed shell** (duck: Pi Zero, BMS, cells, BNO055, board, USB-C charger, holder). `partErrScale` doubles the error on the duck's servo cases (they were 49 % of LOD0) | Real geometry stays; only invisible parts go |
| 6 Colours | URDF `<material>` colour (inline or named) → COLOR_0, sRGB → linear | three reads COLOR_0 as linear |
| 7 Frames | Link frames stay exactly as in the URDF. One root node `robot:<id>` holds the frame fix: Z-up, +X front → glTF Y-up, front faces **+Z** (quaternion `[-0.5,-0.5,-0.5,0.5]`), plus a floor offset so that the lowest rest-pose point is at y = 0 | glTF: "+Y as up, +Z as forward … the front of a glTF asset faces +Z", metres [S15]. The removed D2 models used the same convention |
| 8 Nodes | **One node per link** named like the link. Rest TRS = joint origin (URDF RPY = Rz·Ry·Rx, fixed axes [S21]). `extras = { link, joint: { name, type, axis, limit{lower,upper,effort,velocity}, mimic } }` | The runtime rebuilds joint motion from the extras, so the file needs no animation tracks |
| 9a `rigid` | One mesh per body on a child node `<body>__lod0` / `__lod1` (so quantization never touches the link node's TRS) | For comparison: draw calls = bodies |
| 9b `skin` | Per LOD, all bodies are merged in scene space at rest. `JOINTS_0` = body index (uint8), `WEIGHTS_0` = [1,0,0,0] (normalised uint8), inverse bind matrices = inverse rest world matrix. Both LODs bind to the same link nodes | **1 draw call per robot**, articulation unchanged |
| 9c `l2` | Static rest pose, whole robot clustered to ≤ 3 k triangles, no hierarchy | Silhouettes for far plinths and the size wall (R4 "L2") |
| 10 Pack | `dedup`, `prune`, `reorder` (meshopt, size) → `quantize` (positions 14 bit, normals 8 bit, colours 8 bit) → `meshopt` level **high** (with filters) | 14 bit over a 1.83 m volume ≈ 0.11 mm steps, below the LOD0 error. "High" is ≈ 10 % smaller than "medium" after brotli, with identical pixels (G1 IoU 0.9948 both) |
| 11 Metadata | `asset.copyright` = attribution incl. "converted … by EmAI"; `asset.extras.emai = { id, source{repo, path, commit, license, attribution}, variant }`; sidecar `<id>.robot.json` | Licence travels with the file; the credits page is generated |

**Sidecar `<id>.robot.json` (excerpt, G1):** `format: emai-robot/0.1`, `frames {units: m, rootQuaternion, rootTranslation [0, 0.792273, 0]}`, `restBounds {min, max, height 1.322845}`, `rootLink: pelvis`, `links[] {name, body, mass}`, `joints[] {name, type, parent, child, origin{xyz, rpy}, axis, limit{lower, upper, effort, velocity}, mimic}` (e.g. `left_elbow_joint`: axis [0, 1, 0], −1.0472 … 2.0944 rad, effort 25, velocity 37), `movableJoints[]`, `bodies[] {body, tris{ref, lod0, lod1}, aabb (body frame)}`, `lod {lod0{absErrorM, maxErrorM}, lod1{…}}`, `stats {visuals, excludedVisuals, sourceTriangles, triangles, vendorColors}`, `files`.

**Draco: not used.** Its decoder would have to be self-hosted from `three/examples/jsm/libs/draco` (279 KB wasm + 57 KB wrapper raw, 64.6 + 9.9 KB brotli), while three's meshopt decoder is 6.8 KB brotli inside the bundle. Meshopt also keeps the quantized attributes GPU-ready (no decode to float).

**Not yet covered (needed for R4's line-up):** an MJCF reader (Menagerie: bodies → links, geoms → visuals, joint axes in the body frame, keyframe poses), OBJ and DAE meshes, baking textures to vertex colours (ANYmal D, Stretch 3 per R4), and per-visual material classes (paint / metal / glass → ≤ 3 primitives). Estimate: MJCF + OBJ 1–2 days, DAE 1 day (three's ColladaLoader needs a DOM, so use jsdom or a converter step), texture bake 1 day.

---

## 4. Measurements

Machine: Apple M5 Pro, Chromium headless shell on ANGLE Metal, 1280 × 720, pixel ratio 1, no shadows, no post-processing (the game's grade is not in the viewer). Timings are the median of 3 fresh pages. "4× CPU" uses `Emulation.setCPUThrottlingRate 4`, as the game's perf tools do. Full data: `out/render-results.json`, `out/sizes.json`, `out/fkcheck.json`, `out/validate.json`.

### 4.1 Geometry

| Robot | Source tris (visuals) | Bodies (draws if rigid) | Movable joints | **LOD0** tris (abs. error) | **LOD1** tris (error) | L2 tris | Rest-pose height (URDF) |
|---|---|---|---|---|---|---|---|
| SO-101 | 398,884 (17) | 7 | 6 | **24,076** (0.2 mm) | 6,494 (1.5 mm) | 2,732 | 0.268 m (zero = middle of range, arm raised) |
| Open Duck Mini v2 | 2,330,940 (120 of 131; 11 cut) | 17 | 16 | **55,710** (0.3 mm; servos 0.6) | 10,510 (2 mm; servos 4) | 2,899 | 0.519 m incl. antennas (README: "about 42 centimeters tall with its legs extended" [S5]) |
| Unitree R1 | 446,727 (40) | 27 | 26 | **41,046** (0.6 mm) | 7,218 (4 mm) | 2,845 | 1.230 m |
| Unitree G1 | 393,270 (35) | 30 | 29 | **38,998** (0.6 mm) | 6,251 (4 mm) | 2,873 | 1.323 m |
| Unitree H2 | 256,242 (34) | 32 | 31 | **31,466** (0.8 mm) | 4,856 (5 mm) | 2,867 | 1.832 m |

The heights are bounding boxes of the URDF rest pose, i.e. model measurements and not vendor specs. They agree with the vendor heights in R3 (R1 1230 mm, G1 1.32 m, H2 1.82 m).

**Triangles vs absolute error** (`check/errcurve.mjs`, whole robot, LOD0 simplifier) helps choose a LOD0 for close inspection:

| Robot | 0.1 mm | 0.2 mm | 0.3 mm | 0.6 mm | 1 mm | 2 mm | 4 mm | 8 mm |
|---|---|---|---|---|---|---|---|---|
| SO-101 | 34.3k | 24.1k | 19.6k | 13.6k | 9.7k | 4.8k | 1.9k | 0.8k |
| Open Duck v2 | 109.3k | 71.0k | 55.7k | 39.5k | 28.3k | 18.6k | 12.7k | 10.4k |
| Unitree G1 | 135.2k | 88.8k | 67.3k | 39.0k | 25.6k | 13.9k | 6.3k | 2.6k |
| Unitree R1 | 164.0k | 98.8k | 72.4k | 41.0k | 27.7k | 15.5k | 8.1k | 4.6k |
| Unitree H2 | 151.6k | 100.7k | 73.3k | 40.6k | 25.8k | 13.0k | 6.3k | 2.8k |

(The duck flattens out above 2 mm because of many small separate parts; the sloppy LOD1 step handles that.)

### 4.2 File size (KB)

| Robot | `rigid` raw / br | `skin` raw / gzip / br | **`skin.mo` raw / gzip / br** (shipping) | `l2` raw / br |
|---|---|---|---|---|
| SO-101 | 799 / 222 | 1,092 / 369 / 229 | **261 / 184 / 170** | 46 / 33 |
| Open Duck v2 | 1,711 / 437 | 3,061 / 829 / 468 | **648 / 418 / 333** | 60 / 39 |
| Unitree R1 | 1,208 / 404 | 1,600 / 606 / 395 | **407 / 305 / 286** | 56 / 35 |
| Unitree G1 | 1,149 / 370 | 1,514 / 560 / 362 | **379 / 283 / 267** | 53 / 34 |
| Unitree H2 | 922 / 306 | 1,194 / 453 / 296 | **303 / 225 / 211** | 51 / 32 |

- Brotli on top of meshopt still saves 30–49 %. `vite.config.ts` precompresses only `js|mjs|css|wasm|svg|html|json|txt`, so add `glb` (§9).
- With LOD0 + LOD1 + skin data this comes to 5.2–6.1 bytes per triangle with brotli. R4 assumed 4–8, so the assumption holds.
- The first-use code cost, lazy: GLTFLoader 21.0 KB + meshopt decoder 6.8 KB + SkeletonUtils 2.7 KB, brotli.

### 4.3 Load, upload, draw calls

| Robot | Draw calls rigid / **skin** | Parse ms rigid / skin / **skin.mo** | First frame after compile (≈ GPU upload) ms | Parse / first frame at **4× CPU** ms | Vertices (LOD0) |
|---|---|---|---|---|---|
| SO-101 | 7 / **1** | 2.1 / 3.6 / **4.5** | 11.7 | 17.8 / 31.2 | 28,402 |
| Open Duck v2 | 17 / **1** | 2.5 / 5.3 / **6.7** | 20.1 | 26.1 / 62.9 | 80,298 |
| Unitree R1 | 27 / **1** | 3.3 / 4.4 / **5.5** | 14.5 | 20.7 / 41.1 | 44,613 |
| Unitree G1 | 30 / **1** | 3.3 / 4.4 / **5.4** | 14.3 | 21.3 / 39.8 | 42,588 |
| Unitree H2 | 32 / **1** | 3.3 / 4.1 / **4.9** | 12.6 | 18.9 / 34.0 | 33,788 |

- Draw calls are main pass only. A shadow-casting robot adds one more per shadow pass (expected, not measured).
- Shader compile measured 2.3–2.4 ms. Chromium may reuse its shader cache between runs, so treat this as a lower bound. The game must warm the robot program anyway (§7.4).
- **Consequence:** at 4× CPU the first frame with a new robot costs 31–63 ms. That breaks the Phase 6 hitch target (longest frame ≤ 33 ms, RELEASE §1). Upload behind `rs.warmUp({ root })` in an idle slot, never on the frame the robot first appears.

### 4.4 Visual quality after decimation

Method: the reference (`ref`, every visual welded but not simplified, float32) and the shipping file are drawn in the same pose and from the same camera. The silhouette uses binary masks (unlit, no MSAA) and gives IoU plus the mismatching pixels. The shading uses the lit, anti-aliased frame and gives the mean |ΔRGB| over the union, plus the share of pixels with ΔRGB > 16. LOD0 is viewed from a distance where the robot fills ≈ 80 % of a 720 px view. LOD1 is viewed at its **switch distance d = e₁ / (0.5 px × 1.604 mm/px at 1 m)** (60° vertical FOV, 720 px; LOD1 error = half a pixel).

| Robot | LOD0: IoU (3 views) | LOD0: mean ΔRGB / >16 | LOD1 switch | LOD1 at switch: IoU / ΔRGB | LOD1 too close (at the LOD0 distance): IoU / ΔRGB |
|---|---|---|---|---|---|
| SO-101 (0.45 m) | 0.9963–0.9974 | 1.8–2.6 / ≤ 2.3 % | 1.9 m | 0.980–0.981 / 5.5–6.2 | 0.978 / 9.3 |
| Open Duck (0.57 m) | 0.9971–0.9982 | 0.8–0.9 / ≤ 1.0 % | 2.5 m | 0.975–0.981 / 3.7–4.9 | 0.983 / 3.9 |
| R1 (1.35 m) | 0.9947–0.9959 | 1.7–1.9 / ≤ 1.3 % | 5.0 m | 0.962–0.968 / 4.0–4.3 | 0.971 / 5.2 |
| G1 (1.46 m) | 0.9936–0.9957 | 2.1–2.2 / ≤ 1.8 % | 5.0 m | 0.959–0.964 / 6.3–7.0 | 0.963 / 8.1 |
| H2 (2.02 m) | 0.9956–0.9962 | 2.1 / ≤ 1.4 % | 6.2 m | 0.967–0.968 / 5.3–5.8 | 0.967 / 7.0 |

Reading: LOD0 differs from the full CAD in < 0.7 % of silhouette pixels. LOD1 at its switch distance differs in ≈ 35–155 pixels of a 1,800–4,300-pixel robot. Seen up close, LOD1 visibly loses detail (the "UNITREE" lettering, finger shapes), so the switch rule matters. In the game, scale the switch distances with the real viewport: `d = e₁ · H_px / (tan(FOV/2) · 2 · 0.5)`. A 1080p view gives 1.5× the distances above.

Pictures (`out/shots/`):

| File | Shows |
|---|---|
| `<id>-ref-lod0-lod1.png` | Reference, LOD0 and LOD1 side by side |
| `<id>-scale.png` | Each robot next to a 1.55 m EMI reference column on a 0.1 m grid. Scale and front (+Z) were checked visually for all five |
| `<id>-joint-<joint>.png` | Three poses (lower / middle / upper limit) of one joint on the skinned file, which proves the articulation. Joints shown: SO-101 `elbow_flex`, duck `left_knee`, G1/R1/H2 `left_elbow_joint` |
| `so101-ik.png` | A CCD IK result |
| `lineup-lod0-vs-l2-close.png`, `lineup-lod0-vs-l2-15m.png` | All five, smallest to largest, LOD0 next to L2 |

### 4.5 Correctness

| Check | Result |
|---|---|
| FK: GLB joint API (three, browser) vs independent URDF FK (`check/fk_ref.py`, stdlib) after the root transform; 5 random poses within limits × 3 deepest links | worst **0.0001–0.0005 mm**, identical for `rigid` and `skin.mo` (all 5 robots) |
| Limits | `setJoint` clamps: asking for upper + 1 rad returns the upper limit (all 5) |
| CCD IK (SO-101, 5 arm joints → `gripper_frame_link`, 30 iterations) | targets (0, 0.12, 0.20), (0.10, 0.08, 0.18), (−0.12, 0.05, 0.15) m reached within 1.5 / 0.6 / 1.2 mm |
| Khronos glTF-Validator 2.0.0-dev.3.10 | 0 errors, 0 warnings on all 20 shipped files. Infos only: an unused accessor left by `quantize` (it creates a second skin), and EXT_meshopt_compression is unknown to the validator. An early run found 12 non-unit normals on R1 (degenerate triangles), fixed by step 3's zero-area drop |
| Console / page errors during all browser runs | 0 |

---

## 5. Per-robot conversion notes

| Robot | Notes for the build phase |
|---|---|
| SO-101 | Use `so101_new_calib.urdf` (zero = middle of range, the LeRobot "new calibration" [S2]). The gripper needs a 0–100 ↔ rad mapping if the VLA station shows LeRobot-style values. Five STS3215 servo meshes make up 28 % of LOD0. Two-colour real look: printed parts `1.0 0.82 0.12` (#FFD11F) and servos `0.1` (#1A1A1A) from the URDF |
| Open Duck v2 | 131 visual instances in the URDF; the 14 servo cases (102 k + 41 k triangles each) dominate. Cut list + servo error ×2 → LOD0 55.7 k. Standing pose for RL scenes: set from the policy's default joint angles (R2) |
| G1 | 29 DoF without hands; "rubber hands" visuals included. Do not use the hand variants with third-party hands (Inspire, BrainCo, Dex): their authorship is unclear (R3) |
| R1 | Ankle constraint rods follow only approximately in motion (closed loop); hide them or add a small per-robot linkage hook if ankles animate visibly |
| H2 | Reads `H2.urdf` (STL, white/grey). R4 suggests `H2_dae.urdf` for its colours, which needs the DAE reader |

---

## 6. Materials decision

| Option | Verdict |
|---|---|
| A. Recolour robots in brand colours | **No.** It contradicts "use the real objects" and would mislabel products; brand orange stays ≤ 5 % of the screen (ARCHITECTURE §1) |
| **B. Vendor colours as vertex colours + one shared PBR material** | **Chosen.** Keeps the published look exactly, 1 draw call, 1 program for all robots, no textures to load |
| C. One material per vendor colour | More draw calls (a primitive per colour); no visual gain over B |
| D. Textures | None of the five has textures. Where Menagerie models have them (ANYmal D, Stretch 3 per R4), bake to vertex colours |

Details:
- **Shared material `robotPaint`:** `MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 })`, cached in `MaterialLibrary`. The loader replaces the GLB's material with it.
- **Extensions for R4:** `robotMetal` (metalness 0.8, roughness 0.35) and `robotVisor` (dark glass) as material classes per visual in the config. Each class adds one primitive, so ≤ 3 draws per robot.
- **Where the colours come from:** they are the colours *published in the description files*, i.e. display colours and not verified paint. G1: two greys, 0.2 and 0.7. H2: white and grey. A per-robot `palette` override is possible, but only with a photo source in the manifest.
- **Brand context:** brand comes from the setting, not from the robot. Plinths, turntables, plaques, light lines and the orange joint ring on the active joint (ARCHITECTURE §10: orange for joint rings) carry it.

---

## 7. In-game architecture

### 7.1 Files and ownership

```
src/core/robots/                 engine-owned (new)
  RobotLoader.ts                 cache per id, GLTF load with MeshoptDecoder, SkeletonUtils.clone, shared material, warm-up
  RobotModel.ts                  joint API (port of viewer/RobotModel.js), LOD, clips, joint ring
  manifest.ts                    GENERATED by tools/robots/build.mjs: ids, files, licence, attribution DE/EN, stats, budgets
  types.ts                       RobotId, RobotJoint, RobotHandle, RobotClip, RobotSidecar
src/robots/<id>/<id>.glb         GENERATED, committed (skinned LOD0 + LOD1, meshopt)
src/robots/<id>/<id>.l2.glb      GENERATED, committed (static silhouette)
src/robots/<id>/<id>.robot.json  GENERATED, committed (sidecar)
```

Files under `src/` (not `public/`) are referenced by URL imports, so Vite gives them content hashes. They get immutable caching and appear in the chunk graph. In `public/` they would be served `no-cache` and revalidated on every visit (README Hosting).

### 7.2 Zone API (`ctx.robots`)

```ts
type RobotId = 'so101' | 'open-duck-mini-v2' | 'unitree-r1' | 'unitree-g1' | 'unitree-h2' /* | R4 line-up … */;

interface RobotJoint { name: string; type: 'revolute' | 'continuous' | 'prismatic'; parent: string; child: string;
  axis: readonly [number, number, number]; lower: number; upper: number; effort: number | null; velocity: number | null }

interface RobotHandle {
  readonly id: RobotId;
  readonly object: THREE.Group;                 // add under ctx.groups.detail / ctx.root; move THIS, never inner nodes
  readonly joints: readonly RobotJoint[];
  setJoint(name: string, value: number): number;            // rad or m, clamped to the URDF limits, follows mimic joints
  getJoint(name: string): number;
  setPose(values: Readonly<Record<string, number>>): void;
  setJointNormalized(name: string, t: number): number;      // 0..1 within the limits (sliders, teach-in)
  linkWorld(link: string, out?: THREE.Vector3): THREE.Vector3;  // FK (also frames like gripper_frame_link)
  attach(link: string, obj: THREE.Object3D): void;          // a crate in the gripper (kinematic follow)
  solveIK(chain: readonly string[], tip: string, target: THREE.Vector3,
          o?: { iterations?: number; tolerance?: number; tipOffset?: THREE.Vector3 }): number;  // CCD, returns the error in m
  play(clip: RobotClip, o?: { loop?: boolean; speed?: number }): void; stop(): void;
  lod: 'auto' | 'lod0' | 'lod1';
  showJointRing(joint: string | null): void;    // small orange ring on the joint axis (brand: joint rings)
  dispose(): void;
}

ctx.robots.load(id: RobotId, o?: { castShadow?: boolean; lod?: 'auto' | 'lod0' | 'lod1'; when?: 'now' | 'near' }): Promise<RobotHandle>;
ctx.robots.loadSilhouette(id: RobotId): Promise<THREE.Mesh>;   // L2, static (BatchedMesh-ready)
ctx.robots.info(id: RobotId): RobotManifestEntry;               // licence + attribution + measured stats (plaques, credits)
```

### 7.3 Loading rules (consistent with ARCHITECTURE §4 and §16)

1. **Never block `init`.** Zone inits run after the title, one per idle slot, with a 20 s timeout. `init` builds the plinth and a placeholder (R4's delivery crate), calls `ctx.robots.load(id, { when: 'near' })`, and installs the robot when the promise resolves.
2. **`when: 'near'`.** The engine fetches when the player is within 130 m of the zone anchor (the exterior tier), at `fetchpriority: 'low'`, one parse per idle slot. It fetches at once when the zone is the spawn or D13 resume target.
3. **Lazy code.** GLTFLoader, MeshoptDecoder (`three/examples/jsm/libs/meshopt_decoder.module.js`) and SkeletonUtils come from the existing lazy loader path in `Assets.ts` (+ `setMeshoptDecoder`): ≈ 31 KB brotli on the first robot, 0 KB on the first load.
4. **Shared GLB.** One GLB per robot is shared by every zone and the showroom (cache per URL, clones via SkeletonUtils), so nothing loads twice (R4 §11).
5. **Upload in idle time.** After adding, call `rs.warmUp({ root: handle.object })` in an idle slot. This uploads the buffers and compiles the program before the robot becomes visible (§4.3: 31–63 ms at 4× CPU otherwise).

### 7.4 Rendering details

- **Shared program.** The loader swaps every GLB material for `MaterialLibrary.robotPaint` (skinned variant). Compile that program once in the boot warm-up with a 3-vertex dummy `SkinnedMesh`, so `tools/hitches.mjs` sees no program linked during play (rc4 target: 0).
- **Culling.**
  - Skinned bounds go stale when posed, so the prototype sets `frustumCulled = false`.
  - In the game, keep culling instead: set `mesh.boundingSphere` from the sidecar (rest-bounds centre, radius = rest radius + max link reach).
  - Mark the robot `userData.noMerge = true` so `ctx.mergeStatic` leaves it alone. Never call `freezeStatic` on it.
- **LOD.**
  - One distance check per robot per frame (not per link), with 10 % hysteresis.
  - The switch distance comes from the sidecar error and the current viewport (§4.4 formula).
  - LOD0 and LOD1 share the skeleton. An invisible LOD costs nothing: three updates a skeleton only for skinned meshes it draws.
- **Shadows.** Robots ≥ 1 m cast (ARCHITECTURE §9). The SO-101 and the duck cast only on stations where they are the subject.
- **Picking.** Use a ray against per-body AABB proxies from the sidecar (`bodies[].aabb`), not three's skinned raycast (CPU-skins every vertex).
- **Physics** (Rapier). Never use trimesh colliders.
  - Option `colliders: 'capsule'`: one static capsule, for showroom robots.
  - Option `'boxes'`: kinematic boxes per body, updated each fixed step from link matrices (arm stations, a robot the player can bump into).
- **Clips (`RobotClip`).** Compact joint trajectories, generated offline from published motions or policy rollouts (R2/R3): `{ fps, joints: string[], root?: pose[], data: Int16Array (rad × 10⁴) }`. Example: 29 joints × 30 fps × 10 s ≈ 17 KB raw. Scripted motion keeps the label `core.robot.disclaimer` („Illustrative Animation, keine Telemetrie.“).
- **Debug.** `__academy.robots()` lists the loaded robots with id, LOD, triangles, draws, KB and joint count. `?robots=lod1` / `?robots=l2` force a tier for screenshots. `npm run perf` gets views at each robot station.

---

## 8. Budgets

Existing budgets for context:
- Global worst view ≤ 500 draws / 1.5 M triangles (rc4 measured 238 / 0.90 M).
- Zone detail tier ≤ 80 draws / 90 k (ARCHITECTURE §1).
- First load ≤ 1.75 MB brotli.
- No frame over 33 ms on a first lap; ≤ 4 MB texture upload per frame (RELEASE §1).
- The GDD's total transfer < 8 MB was written before real robots (R4 Q6).

| Item | Draws (main) | LOD0 tris | LOD1 tris | L2 tris | File (brotli) | Measured today |
|---|---|---|---|---|---|---|
| Desk-size robot (arm, duck) | 1 (+1 shadow) | ≤ 60 k (error ≤ 0.3 mm) | ≤ 12 k | ≤ 3 k | ≤ 350 KB | SO-101 24 k / 170 KB; duck 56 k / 333 KB |
| Human-size robot | 1 (+1 shadow) | ≤ 45 k (≤ 0.8 mm) | ≤ 8 k | ≤ 3 k | ≤ 320 KB | 31–41 k / 211–286 KB |
| Inspection close-up (R4 "L0 Bühne", ≤ 0.4 m) | ≤ 3 (with metal + visor classes) | ≤ 80 k (0.2–0.3 mm) | — | — | ≤ 600 KB | G1 at 0.2 mm ≈ 89 k (§4.1); use 0.3 mm ≈ 67 k |
| L2 silhouette | 1 for all (BatchedMesh) | — | — | ≤ 3 k | ≤ 45 KB | 32–39 KB |
| Robots in a normal zone's detail tier | ≤ 6 | ≤ 150 k on top of the zone's 90 k | | | ≤ 1.2 MB per zone | e.g. SO-101 + duck: 2 draws, 80 k, 0.5 MB |
| Schauhalle (R4) | ≤ 80 incl. hall | ≤ 300 k (R4) | | | ≤ 2.5 MB L1 + L2, ≤ 0.6 MB per L0 (R4) | fits: 5 robots' L2 ≈ 0.18 MB |
| All robot assets on the island | | | | | ≤ 4 MB, never in the first load | 5 robots ≈ 1.27 MB + L2 0.18 MB |

Gate in CI (`tools/robots/check.mjs`): fail on budget overrun, validator errors, FK deviation > 0.01 mm, a missing licence file or attribution, or a GLB without `asset.copyright`.

---

## 9. Build step

```
tools/robots/
  sources.json      pinned per robot: repo, commit, files[] + sha256, SPDX, copyright, attribution {de, en},
                    cut list, errLod0/1, partErrScale, yaw, material classes, demo pose
  fetch.mjs         git sparse clone (filter=blob:none, hooks off) into .cache/robots/<id>/ (git-ignored),
                    verifies every sha256, never runs anything from the repo
  build.mjs         the prototype convert.mjs + MJCF/OBJ/DAE readers + texture bake → src/robots/<id>/*,
                    src/core/robots/manifest.ts, LICENSES/robots/*.txt
  check.mjs         budgets, glTF-Validator, FK vs URDF (fk_ref), licence + attribution present, manifest ↔ files
package.json        "robots:fetch", "robots:build", "robots:check" (dev only);
                    devDependencies: @gltf-transform/{core,extensions,functions} 4.5.1, meshoptimizer 1.3.0,
                    fast-xml-parser 5.11.2, gltf-validator 2.0.0-dev.3.10. No new runtime dependency.
```

- **Outputs are committed.** The game build stays offline and reproducible, and reviewers see size diffs. That is ≈ 2.4 MB raw in git for five robots (GLB + L2 + sidecars); Git LFS is not installed here.
- **`npm run build` does not run the pipeline.** Only `robots:build` does, by hand, when a source pin changes.
- **`vite.config.ts` changes** (engine-owned):
  - Add `glb` to `COMPRESSIBLE`. Brotli saves 30–49 % even on meshopt files.
  - Add `'.glb': 'model/gltf-binary'` to `CONTENT_TYPES`.
  - Copy `LICENSES/**` to `dist/licenses/` (a small plugin like `precompress`).
- **`tools/deploy-check.mjs`** also checks one robot GLB: encoding, `model/gltf-binary` and immutable caching.
- **Hosting note:** nginx `types { model/gltf-binary glb; }`.

---

## 10. Licence compliance

### 10.1 What each licence requires when the game ships these files

| Licence | Duty triggered by shipping GLBs (binary/object form) | How the game meets it |
|---|---|---|
| Apache-2.0 (SO-101, Open Duck) [S1, S4, S22] | §4(a) give recipients a copy of the licence; §4(b) modified files carry prominent change notices; §4(c) keep attribution notices; §4(d) NOTICE, but neither repo has one at the pinned commits; §6 no trademark rights | `dist/licenses/Apache-2.0.txt`. Each GLB's `asset.copyright`: "… Converted to glTF and simplified by EmAI". Credits page lists the changes (converted, simplified with max error x mm, hidden internals removed) |
| BSD-3-Clause (Unitree) [S7, S23] | **"Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution."** Clause 3: no use of the holder's name to endorse or promote | `dist/licenses/BSD-3-Clause-Unitree.txt`, verbatim with the Unitree copyright line, shown in the in-game credits. The credits say the makers neither reviewed nor endorse the game. No vendor names in marketing |
| MIT (three.js, incl. its bundled meshopt decoder © Arseny Kapoulkine) | Include the copyright and permission notice in copies | `dist/licenses/THIRD_PARTY_NOTICES.txt` (generated) |

### 10.2 Asset manifest entry (generated `manifest.ts`)

```ts
{ id: 'unitree-g1', name: { de: 'Unitree G1', en: 'Unitree G1' },
  file: 'unitree-g1.glb', l2: 'unitree-g1.l2.glb', sidecar: 'unitree-g1.robot.json',
  source: { repo: 'https://github.com/unitreerobotics/unitree_ros', commit: '5994d4faef0a9cadd3287f8de0199a67eeb2a259',
            path: 'robots/g1_description/g1_29dof_rev_1_0.urdf + meshes/*.STL' },
  license: { spdx: 'BSD-3-Clause', file: 'licenses/BSD-3-Clause-Unitree.txt',
             copyright: 'Copyright (c) 2016-2022 HangZhou YuShu TECHNOLOGY CO.,LTD. ("Unitree Robotics")' },
  attribution: { de: 'Modell: Unitree Robotics · BSD-3-Clause · vereinfacht von EmAI',
                 en: 'Model: Unitree Robotics · BSD-3-Clause · simplified by EmAI' },
  changes: { de: 'nach glTF konvertiert, vereinfacht (höchstens 0,6 mm Abweichung), Farben aus der URDF',
             en: 'converted to glTF, simplified (at most 0.6 mm off), colours from the URDF' },
  trademarks: 'UNITREE lettering is part of the torso mesh; no logo use elsewhere',
  stats: { sourceTris: 393270, lod0Tris: 38998, lod1Tris: 6251, kbBrotli: 267, draws: 1, maxErrorMm: 0.6 } }
```

### 10.3 Side finding: notices missing today

- The built JS in `dist/assets/` (built 2026-10-15) contains no `@license` / SPDX comments, although `three.module.js` starts with one.
- `dist/` has no `LICENSES` folder. `LICENSES/OFL-1.1.txt` exists only in the repo; `public/fonts/unicode-resolver/` ships its own licences.
- Runtime dependencies and their licences (from their `package.json`): three MIT, @dimforge/rapier3d-compat Apache-2.0, postprocessing Zlib, troika-three-text, troika-three-utils, troika-worker-utils, webgl-sdf-generator and bidi-js MIT.
- Re-check on an rc4 build. If it is the same, the generated `THIRD_PARTY_NOTICES.txt` + `dist/licenses/` closes this together with the robots.

### 10.4 In-game credits page

- A DOM panel „Credits & Lizenzen“ / "Credits & licences", reachable from the title screen and the pause menu (keyboard path as in C3/C5).
- One row per robot: name, maker or project, licence, changes. A link opens `licenses/<file>.txt` (same origin, no third-party request).
- Each plaque or data card shows the one-line attribution from the manifest.

---

## 11. Player-facing text proposals (DE default · EN, always „du“)

| Where | DE | EN |
|---|---|---|
| Credits title | Credits & Lizenzen | Credits & licences |
| Credits intro | Alle Roboter hier sind echte Modelle: die 3D-Daten, die Hersteller und Open-Source-Projekte selbst veröffentlicht haben. Wir haben sie nur vereinfacht, damit sie in deinem Browser flüssig laufen. | Every robot here is a real model: the 3D data its maker or open-source project published. We only simplified it so it runs smoothly in your browser. |
| No endorsement | Die Hersteller haben dieses Spiel weder geprüft noch unterstützt. | The makers have neither reviewed nor endorsed this game. |
| Plaque line (G1) | Modell: Unitree Robotics · BSD-3-Clause · vereinfacht von EmAI | Model: Unitree Robotics · BSD-3-Clause · simplified by EmAI |
| Measured honesty chip (Messung statt Marketing) | Original-CAD: 393.270 Dreiecke. Hier: 38.998, höchstens 0,6 mm Abweichung. | Original CAD: 393,270 triangles. Here: 38,998, at most 0.6 mm off. |
| Loading placeholder | Modell wird geladen … | Loading the model … |
| Duck card name | Open Duck Mini v2 – ein Open-Source-Laufroboter aus dem 3D-Drucker | Open Duck Mini v2 – an open-source walking robot you can 3D-print |
| Scripted motion (existing key) | Illustrative Animation, keine Telemetrie. | Illustrative animation, not telemetry. |

House style (GLOSSARY): the German decimal comma, thousands as 393.270, a space before units, never „humanoid“.

---

## 12. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Open Duck's look derives from Disney's BD-X | Design or trademark claim against a company-published game | Legal check before public release. Never use the names BDX, Disney or Star Wars. Fallbacks with clean licences: ToddlerBot 2xc (MIT) or ROBOTIS OP3 (Apache-2.0) from Menagerie [S26] |
| Vendor part meshes inside open repos (servo cases, Pi Zero, SG90 in the duck; STS3215 in the SO-101) have undocumented origin | Those meshes may not be the repo author's to license | Hidden internals are already cut; the visible servo cases remain. Note in the credits; legal check together with the Disney question |
| "UNITREE" lettering in the G1 torso mesh | Trademark visible in the game | Keep as part of the real object (nominative). No logo in UI or marketing (Q2) |
| BSD-3 / Apache read as software licences applied to CAD | Interpretation risk | The only licences offered. Menagerie redistributes the same G1 meshes under BSD-3 with Unitree's copyright [S12]. Not legal advice: flag for review |
| First frame with a new robot 31–63 ms at 4× CPU | Hitch over the 33 ms target | Upload and compile in idle via `rs.warmUp`; one robot per idle slot |
| Closed linkages (R1 ankles, H2 loop) | Push rods drift when animated | Non-loop URDF; per-robot linkage hook or hide the rods |
| MJCF / OBJ / DAE / textures not in the prototype | R4's 20-robot line-up blocked | 3–5 days of pipeline work (§3), before showroom art |
| Download volume grows with the line-up | Total transfer over the GDD's 8 MB | Per-robot and per-zone caps (§8), lazy `when: 'near'`, L2 for far plinths |
| URDF colours are display colours | The "real look" may differ from the paint | Optional palette override with a photo source in `sources.json` |
| URDF effort/velocity are model values (SO-101: placeholder 10) | Wrong specs on cards | Show specs only from datasheets with source (R3/R4), never from the URDF |

---

## 13. Sources (all accessed 2026-10-17)

| # | Source | URL / location |
|---|---|---|
| S1 | SO-ARM100 `LICENSE` (Apache-2.0) and README, pinned | https://github.com/TheRobotStudio/SO-ARM100/blob/a758567c3978dfeefe282ede0500085a48fe8f78/LICENSE |
| S2 | SO-101 simulation README (onshape-to-robot, calibrations, gripper note) | https://github.com/TheRobotStudio/SO-ARM100/blob/a758567c3978dfeefe282ede0500085a48fe8f78/Simulation/SO101/README.md |
| S3 | SO-101 URDF used | https://github.com/TheRobotStudio/SO-ARM100/blob/a758567c3978dfeefe282ede0500085a48fe8f78/Simulation/SO101/so101_new_calib.urdf |
| S4 | Open Duck Mini `LICENSE` (Apache-2.0), branch v2, pinned | https://github.com/apirrone/Open_Duck_Mini/blob/b23317a485b3cec7d8417f352478778b3475173c/LICENSE |
| S5 | Open Duck Mini README ("miniature version of the BDX Droid by Disney", "about 42 centimeters tall") | https://github.com/apirrone/Open_Duck_Mini/blob/b23317a485b3cec7d8417f352478778b3475173c/README.md |
| S6 | Open Duck Mini v2 URDF used | https://github.com/apirrone/Open_Duck_Mini/blob/b23317a485b3cec7d8417f352478778b3475173c/mini_bdx/robots/open_duck_mini_v2/robot.urdf |
| S7 | unitree_ros `LICENSE` (BSD-3-Clause, © 2016-2022 Unitree), pinned | https://github.com/unitreerobotics/unitree_ros/blob/5994d4faef0a9cadd3287f8de0199a67eeb2a259/LICENSE |
| S8 | G1 description README (model table, mode_machine, deprecated variants) | https://github.com/unitreerobotics/unitree_ros/blob/5994d4faef0a9cadd3287f8de0199a67eeb2a259/robots/g1_description/README.md |
| S9 | G1 / R1 / H2 URDFs used | …/robots/g1_description/g1_29dof_rev_1_0.urdf, …/robots/r1_description/R1.urdf, …/robots/h2_description/H2.urdf (same commit) |
| S10 | Local G1 copy (read-only) | in a private EmAI project, not public (g1.urdf, g1.glb, meshes/) |
| S12 | MuJoCo Menagerie `unitree_g1` README + LICENSE (derivation from g1_29dof_rev_1_0.xml; BSD-3, © Unitree 2016-2023) | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35/unitree_g1 |
| S13 | Menagerie `robotstudio_so101` README + LICENSE (Apache-2.0, derived from so101_new_calib.xml) | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35/robotstudio_so101 |
| S15 | glTF 2.0 specification ("+Y as up, +Z as forward … the front of a glTF asset faces +Z"; "units for all linear distances are meters"; inverseBindMatrices) | https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html |
| S16 | KHR_mesh_quantization (ratified; POSITION byte/short, NORMAL normalised byte/short) | https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_mesh_quantization/README.md |
| S17 | EXT_meshopt_compression (ratified; "general-purpose compressor can compress it further") | https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_meshopt_compression/README.md |
| S18 | meshoptimizer 1.3.0 (simplifier flags ErrorAbsolute, Prune; simplifySloppy) | https://github.com/zeux/meshoptimizer · npm `meshoptimizer@1.3.0` README (local copy in `artifacts/phase7/pipeline/node_modules`) |
| S19 | glTF-Transform 4.5.1 (quantize, meshopt, reorder, dedup, prune) | https://gltf-transform.dev · npm `@gltf-transform/functions@4.5.1` |
| S20 | three.js r186 GLTFLoader: EXT_meshopt_compression, KHR_mesh_quantization support; skinned meshes bound with identity matrix; meshopt decoder MIT | `node_modules/three/examples/jsm/loaders/GLTFLoader.js` (lines 238, 529, 645, 650, 4297), `…/libs/meshopt_decoder.module.js` header; https://threejs.org/docs/#examples/en/loaders/GLTFLoader |
| S21 | URDF origin RPY = fixed-axis roll, pitch, yaw (Rz·Ry·Rx). wiki.ros.org/urdf/XML/joint returned a bot-check page on access; convention taken from urdfpy and confirmed by the FK cross-check | https://urdfpy.readthedocs.io/en/latest/_modules/urdfpy/utils.html |
| S22 | Apache License 2.0 text (§4, §6) | https://www.apache.org/licenses/LICENSE-2.0 (same text in S1, S4) |
| S23 | BSD 3-Clause text | https://opensource.org/license/bsd-3-clause (same text in S7) |
| S24 | Khronos glTF-Validator 2.0.0-dev.3.10 | https://github.com/KhronosGroup/glTF-Validator · npm `gltf-validator` |
| S26 | Menagerie folder licences checked for fallbacks/showroom: toddlerbot_2xc MIT (© 2023 Haochen Shi), robotis_op3 / booster_t1 / apptronik_apollo / fourier_n1 / low_cost_robot_arm / trs_so_arm100 Apache-2.0, agility_cassie MIT text (© 2022 Agility Robotics), boston_dynamics_spot BSD-3 (© 2021 Clearpath), pndbotics_adam_lite MIT, berkeley_humanoid BSD-style (© 2024 Hybrid Robotics), unitree_h1 / unitree_go2 BSD-3 (Unitree) | https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35 (`<robot>/LICENSE`) |
| S27 | Internal: DECISIONS (zero third-party requests), ARCHITECTURE §1/§4/§9/§10/§16, RELEASE §1 (budgets, hitch targets), PHASE6-PLAN, README Hosting, `vite.config.ts`, `src/core/Assets.ts` | this repository at rc4 |
| S28 | Sibling Phase 7 reports R2 (Open Duck), R3 (Unitree line-up), R4 (Schauhalle performance plan and hand-off table) | `docs/research/R2-OPEN-DUCK-RL.md`, `R3-UNITREE-WORLD-MODELS.md`, `R4-SHOWROOM.md` |
| M | All measurements in this report | `artifacts/phase7/pipeline/out/` (`sizes.json`, `render-results.json`, `fkcheck.json`, `validate.json`, `shots/`), Apple M5 Pro, Chromium headless shell (ANGLE Metal) |
