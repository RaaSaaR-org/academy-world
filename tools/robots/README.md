# tools/robots — real robot models for the game

Converts the robots' **published** descriptions (URDF / xacro / MJCF with STL, OBJ and COLLADA meshes) into small, articulated GLBs for the game. No hand-made look-alikes: every triangle comes from the pinned source. Research: `docs/research/R7-ASSET-PIPELINE.md` (pipeline), `R4-SHOWROOM.md` (line-up, licences, LOD plan), `R1`/`R2`/`R3`.

```bash
cd tools/robots && npm ci --ignore-scripts && cd ../..   # once (own node_modules, git-ignored)
node tools/robots/fetch.mjs            # pinned sources → artifacts/robots-src/ (git-ignored)
node tools/robots/build.mjs [id …]     # → src/robots/glb/*.glb, src/robots/manifest.ts, src/robots/credits.ts, LICENSES/robots/
node tools/robots/check.mjs [--timing] # validator, FK vs source, clamp, mimic, IK, budgets → tools/robots/REPORT.md
node tools/robot-gallery.mjs [--prod]  # screenshots → artifacts/phase7/robots/ (read them)
```

`npm run build` of the game does **not** run the pipeline: its outputs are committed (reviewable size diffs, an offline and reproducible game build). Rebuild by hand when a pin or a setting changes; the build is deterministic (same sources → byte-identical GLBs).

## Why a separate package

The converter needs gltf-transform 4.5.1, meshoptimizer 1.3.0 (simplifier and encoder), fast-xml-parser 5.11.2, the Khronos gltf-validator, pngjs and jpeg-js (texture bake) and its own three 0.186.1 (math only). None of them is used at runtime: the game decodes with three's own `meshopt_decoder.module.js` (MIT, WebAssembly inside the JS). Keeping them in `tools/robots/package.json` keeps the game's `package.json` and lockfile unchanged, and its dev install small; the scripts reach the game's `playwright` and `vite` through normal module resolution. `npm ci --ignore-scripts`: no install scripts run (sharp, pulled in by gltf-transform, is never loaded).

## Safety

Downloads are untrusted data. `fetch.mjs` does a sparse, blob-less fetch of exactly the pinned commit with hooks, symlinks, LFS and other filters off, and verifies every file against the commit's git tree (git blob ids); research downloads in `artifacts/phase7/downloads/` are reused only when every file's blob id matches. Nothing from a checkout is executed: XML is parsed as data, xacro `${…}` expressions go through a small evaluator (`lib/expr.mjs`, no `eval`), every mesh / texture / include path must stay inside its checkout and must not be a symlink. The FK reference runs as `python3 -I`.

## Files

| File | Role |
|---|---|
| `repos.mjs` | pinned repositories (URL, commit, sparse paths) |
| `sources.mjs` | the line-up: one entry per GLB (source file, licence and attribution, LOD targets, cut list, frame fixes, IK chains, flags) and the licence texts to ship |
| `fetch.mjs` | fetch / reuse / `--verify` the pinned checkouts |
| `lib/xml.mjs`, `lib/urdf.mjs`, `lib/xacro.mjs` + `lib/expr.mjs`, `lib/mjcf.mjs` | readers → one description shape (links with visuals, joints with origin, axis, limits, mimic, ref; MJCF keyframes, joint couplings, sites) |
| `lib/meshes.mjs`, `lib/textures.mjs` | STL (binary/ASCII), OBJ (+MTL), COLLADA (node transforms, `<unit>`, materials, textures; up-axis ignored as ROS does); textures baked into per-corner vertex colours |
| `lib/geometry.mjs` | weld, colour clusters, simplification by absolute error (m), smoothing-group normals, LOD1 index list over LOD0's vertices, silhouette clustering |
| `lib/robot.mjs` | kinematic tree, bodies, LOD search, one skinned mesh, quantization (positions 11–14 bit by error, normals 8 bit, colours 8 bit), glTF documents |
| `build.mjs` | writes GLBs, `manifest.ts`, `credits.ts`, `LICENSES/robots/` and the build records (`artifacts/phase7/robots/build/`) |
| `fk_ref.py` | independent FK from the source files (stdlib Python, own URDF/MJCF parser) |
| `check.mjs`, `viewer/` | checks and the dev viewer that loads robots through the game runtime |

## Output format (per robot)

- `src/robots/glb/<id>.glb`: root node `robot:<id>` (source Z-up / +X front → glTF Y-up / front +Z, lowest point of the default pose on y = 0), one node per link (URDF link or MJCF body; MJCF joints with an anchor get extra frame nodes so the body frame matches MuJoCo), sites and fixed frames kept as nodes. **One skinned mesh**, every vertex weight 1 on its body (fixed links folded in): 1 draw call. LOD0 and LOD1 are two primitives on the same vertex accessors (LOD1 costs one index buffer) bound to one skin. Node extras: `{ link, joint: { name, type, axis, limit, mimic, ref } }`; `asset.extras.emai`: source, licence, attribution, joints, bodies, default pose and keyframes, bounds, LOD errors and switch distances, IK chains; `asset.copyright`: the attribution line. `KHR_mesh_quantization` + `EXT_meshopt_compression` (no Draco).
- LOD2 (where the entry asks for it: SO-101 ≤ 2 k, duck ≤ 1.5 k, the four hangar Unitree robots ≤ 3 k): a third index list on the same vertices and skin, clustered per body, so it stays articulated (crowds, far ghosts). `RobotLibrary.bodies(id, lod)` splits any LOD into per-body, unskinned geometry in the link frame for InstancedMesh crowds.
- `src/robots/glb/<id>.l2.glb`: static silhouette in the default pose (≈ 1–3 k triangles, ≤ 30 KB).
- `src/robots/glb/lineup.l2.glb` (`ROBOT_LINEUP`, `RobotLibrary.loadLineup()`): every hall robot (`lineup: true`) in its default pose as one static mesh at true scale, sorted by height along +x (≤ 200 KB).
- `src/robots/manifest.ts`: typed rows (id, names, vendor, category, source URL + commit + path, SPDX, licence files, copyright lines, NOTICE text, attribution DE/EN, height, joints, default pose, IK chains, LOD triangles / errors / switch distances, bytes, bounds, colour notes, flags `amber`, `legalReviewBeforeRelease`, `noLogoElsewhere`). GLB URLs are dynamic imports, so importing the manifest fetches no model.
- `src/robots/credits.ts`: the robot rows of the in-game credits (`src/core/credits.ts` adds software and fonts).
- `LICENSES/robots/*.txt` verbatim licence texts and NOTICE (and `LICENSES/npm/*.txt`, the game's shipped npm packages, written by `node tools/licenses-npm.mjs`); `LICENSES/robots/NOTICES.txt` the robots' part of `dist/THIRD-PARTY-NOTICES.txt` (written by `tools/notices-plugin.mjs` in `npm run build`, which also copies `LICENSES/` to `dist/licenses/`).

## Download caps (plan §5.6, D31)

`sources.mjs` puts every robot in a set: `playable` and `exhibit` are the MUST build (≤ 4.0 MB with the line-up), `extra` robots are built but not part of it. Per file: ≤ 350 KB (exhibits ≤ 150 KB, humanoid exhibits ≤ 250 KB, LOD0 ≤ 25 k / 30 k triangles; LeKiwi base ≤ 120 KB), silhouettes ≤ 30 KB, robots of one area ≤ 1.2 MB. `build.mjs` lowers a robot's triangle targets until its file fits; `check.mjs` fails on any miss and prints the MUST total. The one documented exception (`EXCEPTIONS`) is the Apollo's LOD0 (45 k; crack repair: 1 mm weld, no component pruning).

## Rules the build enforces

- Third-party hand meshes bundled in vendor repos (Inspire, BrainCo, Sharpa) are rejected by path; Universal Robots' UR8 Long / UR15 / UR18 / UR20 / UR30 meshes stop the build (R4 §5.2).
- Hidden internals only by an explicit cut list (Open Duck electronics); everything visible stays.
- Colours: the source's own (URDF/MJCF materials, COLLADA materials, textures baked), except where a decision says otherwise: D32 (SO-101 white / black / orange moving part), D29 (duck in neutral greys), and LeKiwi, whose URDF has none. One shared paint material in the game.
- Link inertials (mass, centre of mass in the link frame) go into the manifest wherever the source has them (R3).

## Runtime

`src/core/robots/` (`RobotLibrary`, `RobotModel`): lazy load by id, skeleton clones sharing geometry and the paint material (`materials.standard({ vertexColors: true, roughness: 0.55, metalness: 0 })`), `setJoint` / `getJoint` / `setPose` (clamped, mimic followers), FK `getLinkWorldMatrix`, CCD IK `solveIK` (+ optional tip orientation), LOD by distance with the viewport-scaled switch distances, `prewarm(id)` in idle slots (fetch + parse with the meshopt decoder in a worker, compile against the live scene, a 1×1 upload draw), `dispose()`. Not wired into `ZoneContext` yet (that would touch the boot chunk); the integrator adds e.g. `ctx.robots = new RobotLibrary({ materials, renderer: rs.renderer, compile: (root) => rs.warmUp({ root }) })` behind a dynamic `import('@/core/robots')`.

## Credits page (data only)

```ts
const { CREDITS, creditHref } = await import('@/core/credits');   // lazy: not in the first load
title.textContent = CREDITS.title[lang];                             // „Credits & Lizenzen“
intro.textContent = CREDITS.intro[lang] + ' ' + CREDITS.disclaimer[lang];
for (const r of CREDITS.robots) addRow(r.name[lang], r.attribution[lang], r.changes[lang], creditHref(r.licenseFiles[0]));
for (const s of CREDITS.software) addRow(s.name, `${s.license} · ${s.copyright}`, creditHref(s.licenseFile));
for (const f of CREDITS.fonts) addRow(f.name, `${f.license} · ${f.copyright}`, creditHref(f.licenseFile));
addLink(CREDITS.labels.allNotices[lang], creditHref(CREDITS.noticesFile));   // dist/THIRD-PARTY-NOTICES.txt
```

All links are same-origin. `r.notice` (FR3) points at the NOTICE text to show with the licence; `r.amber` marks rows whose licensor is not the maker (legal review before public release).
