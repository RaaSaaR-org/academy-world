# C1 · Engineering critique of the Phase 7 plan

Principal engineer and performance lead, 2026-10-17. Subject: `docs/PHASE7-PLAN.md` (uncommitted draft) and the D15–D39 additions to `docs/DECISIONS.md`. Baseline: `phase7` HEAD (rc4 content). This file changes no code and no other document.

**Method.** I read the plan, DECISIONS, ARCHITECTURE, RELEASE, PHASE6-PLAN and R1–R9 (R2 §7, R4 §11, R5 §7–§8, R7 §4–§12 in depth), then checked every load-bearing claim against the code. Evidence is cited as `path:line`. Three things were measured, not reasoned:

- **rc4 chunk sizes.** A production build of `phase7` HEAD into the scratchpad (`vite build`, brotli files from the repo's own `precompress` plugin).
- **WP0's robot files.** Brotli-11 sizes of the 48 GLBs in WP0's working tree at 22:52 today (`../academy-island-wt/robots/src/robots/glb`, uncommitted, still changing).
- **WP0's runtime API.** Read from `src/core/robots/*` and `src/robots/manifest.ts` in the same worktree.

I did not run `gpu-ab`, `perf` or `hitches`. GPU statements below come from the shader and render-order structure, not from a measurement.

## Verdict (short)

**Not buildable by parallel builder agents as written.** Four findings would make eight builders collide, or would produce a build that breaks its own caps by construction:

- **B1.** The first-load cap cannot hold, because every zone module is imported before the title.
- **B2.** About twenty shared engine and island files have no owner.
- **B3.** The robots contract in §5.2 is not the API WP0 is actually building.
- **B4.** The MuJoCo worker contract cannot be bundled by Vite in production.

Sixteen majors would surface as integration failures in wave 2. The worst are:

- **M1.** The plaza GPU gate is out of reach as specified.
- **M3.** "Lazy" loading is effectively eager on a 212 m island.
- **M6–M7.** The "world moves" model has visible bugs on the ground.
- **M10.** The rc4 save migration is irreversible.
- **M16.** The estimates have no contingency.

All four blockers can be fixed in the plan text and with day-1 seams in about two lead-days. The plan's architecture is sound and worth keeping (see "What is sound").

## Findings at a glance

| # | Sev. | Finding | Plan § |
|---|---|---|---|
| B1 | BLOCKER | All zone code loads before the title: the ≤ 1.75 MB first load breaks with 5 new areas | §5.6, D31 |
| B2 | BLOCKER | ~20 shared engine and island files have no owner; the shared-file protocol misses them | §5.1, §6.1 |
| B3 | BLOCKER | §5.2 `RobotsApi` ≠ WP0's real API; requests (b), (c), (e), clips and `ctx.robots` wiring are unowned | §5.2, §6.2 |
| B4 | BLOCKER | `MujocoService.spawn(entry: URL)` defeats Vite worker bundling; Firefox 108–113 have no module workers; chunk import map vs workers | §5.2, §5.4 |
| M1 | MAJOR | Plaza 4K GPU gate (4.43 vs 4.5 ms) not reachable as specified; WP2 cannot test it alone | §5.5, §5.7, WP2 |
| M2 | MAJOR | Per-view draw and triangle budgets do not add up (plaza, bridge head, Schauhalle) | §4.9, §5.5 |
| M3 | MAJOR | "Lazy" radii (130/150 m) are eager on a 212 m island: ≈ 3.5–4 MB fetched in minute one | §5.6 |
| M4 | MAJOR | WP0's measured robot sizes already break the 4 MB and 350 KB caps; total ≈ 7.6 MB before any inspection or crowd files | §5.6, D31 |
| M5 | MAJOR | "≤ 140 programs at the title" and "0 linked during play" cannot both hold (rc4 already links 6) | §5.5 |
| M6 | MAJOR | "World moves": gust tilt heaves the ground under the player; collider thresholds inconsistent; ground dynamics fall; three altitude setters | §5.2, §5.3 |
| M7 | MAJOR | Kill plane (−66) equals the dock floor: rescue flaky, thrown crates pile up for ever | §2.3, WP3 |
| M8 | MAJOR | Stamp and star totals count every area: tower, Pass cover, melody and certificate break D37 | §3.4, D37 |
| M9 | MAJOR | `mastery` and `rev` live on `ChallengeDef` (init time), but the pool and the gate read at boot | §3.1, §3.5 |
| M10 | MAJOR | Save migration overwrites the only copy; failure path, predictions, bests, dusk and onboarding not covered | §3.5, D38 |
| M11 | MAJOR | Feature ownership overlaps: 12 farm arms, the Schauhalle footprint, Fundvitrine objects, `zoneValue()` | §4.10, §4.12, §5.2 |
| M12 | MAJOR | Waves: the spine is not playable until wave 2; WP10 has zero slack; perf ledger only in wave 3 | §6.3–§6.5 |
| M13 | MAJOR | Terrain: 650 m at 2 m cells = 422,500 samples built before the title; render mesh unspecified | WP3 |
| M14 | MAJOR | A failed robot or chunk load on a ◆ station blocks the lift-off for good; no loading states | §4.4, §4.5, §5.6 |
| M15 | MAJOR | Gates and tests: full gate set per merge takes hours; several acceptance criteria cannot be tested as written | §6.3, §8.1 |
| M16 | MAJOR | Estimates have no contingency; five WPs undersized | §6, §7 |
| m1–m14 | MINOR | BatchedMesh, LOD governor, memory, i18n parity, reduced motion, depth precision, … | various |

---

## BLOCKERS

### B1 · The first-load cap cannot hold: every zone module is imported before the title

**Plan.** „First load (title) **≤ 1.75 MB** … rc4 1.68 MB; + ground and slab code ≤ 40 KB“ and „Island zones, Schauhalle, ground zones | zone chunks (rc4 rule: after the title, nearest first)“ (§5.6). D31: „the first load stays ≈ 1.7 MB (≤ 1.75 MB)“.

**Problem.** The rc4 rule defers zone *init*, not zone *code*.

- `Game.ts:185–188` runs `zones.discover()` and `await zones.importAll()` before `startScreen.show()` (`Game.ts:216`). The island's init reads every zone manifest, so all zone code is part of the first load.
- My build of `phase7` HEAD gives six rc4 zone chunks of **39–48 KB brotli each (259 KB of the 0.65 MB of JS)**; the finale is the only lazy chunk (38 KB).
- Phase 7 adds five MUST areas (Schauhalle, Sonnenacker, Traumhangar, Kreislaufhof, Unkrautacker). The plan's own cap allows "≤ 80 KB" each. The Regelgarten (duck) and the Lern-Dojo (SO-101) grow, and the quest spine, migration, credits UI, robots core and possibly `@/robots/manifest` (12.6 KB br, measured) join the main chunks.
- Estimate: **+0.2–0.3 MB, so 1.9–2.0 MB at the title**, against a cap with 70 KB of headroom.

The same import also means every area's `init` runs after the title "one per idle slot, nearest first" (ARCHITECTURE §16 C13). That is ~12 inits competing with the first zone. rc4 already got slower here ("Start click → control … worse", RELEASE §1a). `game:ready`, which every tool waits for, waits for all of them.

**Fix.**
1. **Split each area into `manifest.ts` and `index.ts`.** The manifest is static and eager: id, title, stations with `star`, `rev` and `mastery`, kind, frame, glyph. `index.ts` is lazy code. `ZoneManager.discover()` imports manifests through `import.meta.glob('/src/zones/*/manifest.ts', { eager: true })`. Code loads through the existing lazy glob, on a priority queue.
2. **Load code by reachability.** Island zones load after the title, nearest first (as today). Ground areas load and init only once the Revier is open (≥ 1 rotor) and the player is within 250 m. The resume target loads eagerly, as `eagerZones()` does now.
3. **Redefine readiness.** `game:ready` means "title up and the eager set settled". A new `game:settled-all` is what tools that need everything wait for. Update `tools/lib/*` accordingly.
4. **Gate it.** Owner WP4, days 1–3 of wave 1. Acceptance: `load-size` ≤ 1.75 MB with all five MUST areas present as stub manifests, and per merge after that. This also solves M9 (the pool is read from manifests without loading code).

### B2 · About twenty shared files have no owner; the shared-file protocol misses them

**Plan.** §6.1 names owners for strings, `world/index.ts` (one line each), `layout.ts`, Progress, pause/title/Settings, `types.ts` (one `export *` line each), `vite.config.ts`/`package.json`, a list of island files (WP12/WP15/WP13) and docs. §5.1 lists module owners.

**Problem.** The features need edits in files that nobody owns, or that an owner must edit outside its "one line":

| File | Who needs it, for what | Evidence |
|---|---|---|
| `src/core/Game.ts` | WP1: resume rule (it lives here: `returnPlan`, `skipsAscent`, `ascentSeen`, placement), boot-time migration, title states. WP4: lazy zones, suspension, new ctx services. WP0: `RobotLibrary` construction, boot warm-up dummies. WP13: flight on boot | `Game.ts:600–685` |
| `src/core/zones/createZoneContext.ts` | wiring `ctx.quest`, `frames`, `flight`, `mujoco`, `robots`; `ctx.env` and `ctx.audio` additions; `ctx.game.progress()` scope (M8) | `createZoneContext.ts:906–1010` |
| `src/core/zones/types.ts` existing interfaces | `ZoneEnv` (WP2), `ZoneAudio` (WP2), `ZoneGame.progress()` (WP1), `ZoneDefinition` hooks `onSuspend/onResume` (WP4), `StationDef`/`ZoneManifest` kind, frame, rev, mastery (WP1/WP4), `ChallengeDef` (WP1). The protocol only covers *new* `ZoneContext` fields | `types.ts:42, 117, 641, 808` |
| `src/core/params.ts` | `?flight`, `?liftoff`, `?area` | `params.ts:20–34` |
| `src/core/DebugApi.ts` | `__academy.quest/flight/robots/life/secrets`, which every new tool needs | — |
| `src/core/Physics.ts` | collider enable/disable by frame, freezing ground-frame dynamics (M6) | `Physics.ts:141–146, 232` |
| `src/core/brand/materials.ts`, `src/core/RenderSystem.ts` | robot paint variants and boot warm-up dummies (M5) | `RenderSystem.ts:564` |
| `src/systems/GameLayer.ts` | island vs all scope for stamps, stars and pool (M8) | `GameLayer.ts:559–609` |
| `src/systems/Audio.ts` | new loop kinds (spin-up, bees, farm beds): `LoopKind` is a closed union. The plan gives WP2 "filter only" | `Audio.ts:39` |
| `src/ui/Kit.ts` | chips HERSTELLERANGABE, MODELL, `SIM · AUFZEICHNUNG`: `ChipType` is a closed union | `Kit.ts:16` |
| `src/ui/Hud.ts`, `Compass.ts` | telemetry strip states, site markers at 300+ m | — |
| `src/world/index.ts` body | WP12 must rewrite `dockGust`, `toyGust`, `updateGusts`, the `game:start`/intro wiring and the underside cull. All of these live in this file, not behind "one line" | `world/index.ts:133–139, 189, 207–286` |
| `src/world/landscape/plan.ts`, `solar.ts`, `lanes.ts` | WP11: the north-spoke PV fields `PV_FIELDS[2,3]` sit inside the hall rect | `plan.ts:148–149` |
| `src/world/railing.ts`, `deck.ts` | the bridge needs a gap in the Landedeck railing at z ≈ 101; Kanzel pads on the stubs | — |
| `src/world/foyer.ts`, `radio.ts`, `sky.ts` | rotor board (foyer), radio lines for every new area, sister platforms and cargo copters that hover at deck height while docked (`sky.ts`) | — |

**Fix.** Publish an owner map with three seams before wave 1 (proposal below), and make the seams day-1 deliverables:

1. **`createZoneContext` extension registry (WP4).** `registerContextExtension(name, factory)`, so each package adds its `ctx` field from its own file.
2. **TypeScript module augmentation for existing interfaces.** Each WP writes `declare module '@/core/zones/types' { interface ZoneEnv { setFlight(…) } }` in its own `types.<wp>.ts`, so nobody edits the shared interface blocks.
3. **Registration APIs instead of union edits (owners WP1/WP2).** `registerLoopKind`, `registerChip` and `__academy.ext(name, fn)`.

| File(s) | Proposed owner | Others reach it through |
|---|---|---|
| `Game.ts`, `createZoneContext.ts`, `ZoneManager.ts`, `Physics.ts`, `types.ts` blocks | WP4 (engine lane) | WP1's `src/core/quest/resume.ts` is called from one Game hook; ctx extension registry; type augmentation |
| `params.ts`, `GameLayer.ts`, `Kit.ts`, `Hud.ts`, `Compass.ts` | WP1 | `registerChip`; telemetry API |
| `materials.ts` robot entries, boot warm-up variants | WP0 | — |
| `Audio.ts` | WP2 | `registerLoopKind` |
| `DebugApi.ts` | WP7 | `__academy.ext()` |
| `world/index.ts` body, `landscape/plan.ts`, `solar.ts`, `lanes.ts`, `railing.ts`, `deck.ts`, `foyer.ts`, `radio.ts`, `sky.ts` | WP12 (island owner) | WP11 files a request for the PV move; others call `radio.say(owner, line)` |

### B3 · The robots contract in §5.2 is not the API WP0 is building

**Plan.** §5.2 `RobotsApi`/`RobotHandle` "consumed as published in R7 §7.2"; §5.1 paths `src/core/robots/* (RobotLoader, RobotModel, manifest.ts)`; requests (a)–(e) "to be confirmed"; Credits data "from `src/core/robots/manifest.ts` and `src/ui/credits/software.ts`".

**Problem.** The code in `p7/robots` differs in names, shapes and scope:

| Plan §5.2 | WP0 as built (worktree) |
|---|---|
| `ctx.robots.load(id, { lod: 'auto'\|'lod0'\|'lod1', when: 'now'\|'near', colliders })` → `RobotHandle` | `new RobotLibrary(deps).load(id, { castShadow, receiveShadow, lod: 'auto'\|0\|1\|'silhouette', silhouette, pose })` → `RobotModel`. No `when`, no `colliders`, no `ctx.robots` |
| `prewarm(ids[])` | `prewarm(id)`. It does compile + a 1×1 offscreen upload, which is good, plus `release(id)` |
| `linkWorld`, `solveIK(chain, tip, target): number` | `getLinkWorldPosition/Matrix`, `solveIK(chain \| {joints, tip}, target, o): RobotIkResult` with `orient` |
| `play(clip)`, `stop()`, `showJointRing()` | absent |
| auto LOD | `updateLod(camera, viewportPx)`; somebody must call it every frame |
| (b) link masses and COM, needed by 03 C | absent (no `mass` in `src/robots/manifest.ts`) |
| (c) per-body geometry for InstancedMesh crowds (64 ducks, 12 + 6 farm arms, waving arms) | absent. The GLBs are skinned only, and neither InstancedMesh nor BatchedMesh can skin |
| (e) merged line-up silhouette | absent |
| `src/core/robots/manifest.ts`, `tools/robots/gallery.mjs`, `src/robots/<id>/` | `src/robots/manifest.ts`, `src/robots/credits.ts`, `tools/robot-gallery.mjs`, `src/robots/glb/<id>.glb` |

Five wave-1/2 WPs (WP5, WP6, WP8, WP9, WP10, WP11, WP15) code against §5.2. The fallback „if absent, the consuming WP builds it in its own folder“ means (c) gets built twice (WP5 for ducks, WP9/WP15 for arms), and (b) by WP8 from raw URDFs it does not have.

**Fix.**
1. Freeze the as-built WP0 API as the contract today, in `src/core/zones/types.robots.ts`, and rewrite §5.2 from it.
2. Add a thin `ctx.robots` adapter. It owns the `when: 'near'` scheduler (M3), calls `updateLod` for the zone's robots once per frame, and creates proxy colliders. Owner WP4 with WP0 review, because it needs the player position, area anchors and the idle scheduler.
3. Make (b), (c) and (e) plus a minimal `play(clip)` WP0 MUST deliverables, ordered (c) → (b) → (e). They gate WP5's field, WP8's 03 C and WP11's Größenwand.
4. Fix the paths in §5.1, §5.2 (Credits) and §5.8.

### B4 · The MuJoCo worker contract cannot be bundled in production

**Plan.** `MujocoService.spawn<Req, Res>(entry: URL, …)` and „worker side (imported by a zone's worker entry, e.g. `src/zones/regelgarten/duck/duck.worker.ts`)“ (§5.2); „Loaded lazily in a **module worker**“ (§5.4); WP4 edits „wasm `?url`, worker format“ in `vite.config.ts` (§6.1).

**Problem.**
1. Vite bundles a worker only when it sees `new Worker(new URL('./w.ts', import.meta.url), …)` written literally, or a `?worker` import. A URL handed into a service's `spawn(entry)` is treated as a plain asset URL. Dev serves the TS file transformed and works; the production build emits an unbundled `.ts` asset and the worker dies. This is a classic dev/prod split that no headless dev run catches.
2. Module workers (`{ type: 'module' }`) shipped in **Firefox 114**. The supported floor is **Firefox 108** (DECISIONS, Phase 6), so 108–113 fail. Emscripten ES glue normally needs a module worker (`import.meta.url` to find the wasm).
3. The build uses `build.chunkImportMap: true` (`vite.config.ts:184`). Workers do not get the document's import map, so a worker bundle that imports shared chunks through import-map specifiers will not resolve.
4. Only the duck uses MuJoCo in MUST (§5.4), so a shared "service" in WP4 adds a cross-WP dependency on wave 1's critical path (WP5, 9 days) for one consumer.

**Fix.**
1. Change the contract to `spawn<Req, Res>(make: () => Worker)`, with the zone doing `import DuckWorker from './duck/duck.worker.ts?worker'`.
2. Set `worker: { format: 'es', rollupOptions: { output: { inlineDynamicImports: true } } }` so the worker bundle is self-contained (no shared chunks, no import map). Pass `locateFile` and the hashed `?url` of the stripped wasm explicitly.
3. Make `supported()` construct a tiny module worker and compile an 8-byte wasm, plus a SIMD probe if the build uses SIMD. On failure use the recordings, with the chip and the reason stated for Firefox < 114.
4. Extend `mujoco-check` to load the **production** worker and assert 0 bare specifiers in the worker bundle.
5. Let WP5 own the worker and loader under `src/zones/regelgarten/duck/`. WP4 keeps a `ctx.workers` helper (spawn, pause, terminate on dispose) only if a second consumer appears.

---

## MAJORS

### M1 · The plaza 4K GPU gate (4.43 vs 4.5 ms) is not reachable as specified

**Plan.** „Sky | rc4 `atmos()` plus the slab ceiling … (0 extra draws)“, „Fog | FogExp2 0.0007 plus the slab term (fog grows with the view-ray length inside [base, top])“ (§5.7). R2 mitigation: „cloud-sea raymarch off on the ground pays for the slab“. WP2 acceptance: „`gpu-ab` plaza grounded ≤ 4.5 ms“.

**Problem.**
1. **The sky is drawn first, so every new sky term costs all 8.3 Mpx at 4K.** The sky is drawn at `renderOrder = −1000` with `depthWrite: false` (`Environment.ts:521`). Its fragment shader therefore runs on every pixel, including those the island covers (no early-z: the depth buffer is empty). The slab ceiling adds 2–3 noise fetches and a ray–plane test on every upward pixel, on top of the cirrus's 3 fetches.
2. **The cloud-sea saving is smaller than claimed.** The cloud sea is drawn *after* opaques at `renderOrder 50` and is already early-z culled (`Environment.ts:547`, comment at `:177`). From the plaza only the strip over the rim is paid for. ARCHITECTURE puts its cost at ≈ 0.13 ms at 1080p from a Kanzel, where it fills most of the screen. At the plaza the saving is a fraction of that.
3. **The slab fog term costs every lit fragment of every material.** It goes into the engine-wide fog chunk (`patchFogChunks`, `Environment.ts:336`), yet it is non-zero only for rays that reach +330 m, which on the ground is the sky itself.
4. **New content at the plaza adds cost.** Ground and far terrain at eye height, the dock, region impostors (≤ 30 draws), the glass Schauhalle exterior 92 m away (transparent overdraw), and life.
5. **Measurement noise exceeds the margin.** rc4's own first of three runs measured **6.71 ms** (RELEASE §1a) against a 0.07 ms margin.
6. **WP2 cannot pass its gate alone.** Its acceptance depends on WP3's ground being present.

**Fix.**
1. Draw the sky **after** the opaques (positive `renderOrder` inside the opaque list, depth test on, `xyww` already puts it at the far plane), so covered pixels are rejected early. Measure first: on day 1, run `gpu-ab` with the sky hidden and with the sky drawn last.
2. Compute the slab only in the sky shader. Model the cloud passage by ramping the existing uniform FogExp2 density and colour while the eye is inside [base, top], not by a per-fragment path integral in every material.
3. Build a joint WP2 + WP3 **GPU-proof scene by day 5**: final-cost stand-ins for the terrain, far ring, dock and region impostors, measured at the plaza, the bridge head (the likely new grounded worst view) and the Ausguck.
4. Restate the gate as an interleaved A/B against rc4 (`gpu-ab --dist rc4=… --dist head=…`), median of 5 runs: **≤ 4.5 ms, or ≤ rc4 + 0.15 ms with the founder told**. A gate inside its own noise decides nothing.

### M2 · Per-view budgets do not add up

**Plan.** §5.5: plaza grounded ≤ 200 draws; bridge head „world ≤ 110 + ground ≤ 24 + life ≤ 4 + zones ≤ 52 = ≤ 190“; Schauhalle interior „hall ≤ 80, total ≤ 140“; Regelgarten C „zone ≤ 80 … ≤ 4.5 ms“.

**Problem.**
- **Plaza.** rc4 148 + Schauhalle exterior ≤ 15 + region from the island ≤ 30 + visible ground ≤ 24 + life ≤ 4 + Tomatenkapsel SO-101 1–2 ≈ **208–223 > 200**, using the plan's own allocations.
- **Bridge head (0, 0, 114).** The Traumhangar anchor (122.6, 110.4) is **122.7 m** away, inside the 130 m exterior tier (`ZoneManager.ts:53`), so up to 40 exterior draws appear that the sum leaves out. The bridge head is also a *ground* view, where WP14 allows the region ≤ 140 draws; the region term is missing from the sum.
- **Schauhalle.** The hall centre is **40 m** from the Regelgarten and Greifwerkstatt anchors, inside both lobes' 45 m detail tiers. Tiers switch on distance only, so from inside the glass hall both zones' detail tiers (≤ 80 each) render: 80 + 2 × 80 + world ≫ 140. The reverse holds too: the duck field view has the hall's ≤ 300 k robot triangles behind it.

**Fix.**
1. Add a **per-owner ledger** per survey view (world, ground, region, life, robots, each zone). The integrator checks it with `drawcalls` owner tags from p7-w1, not first in WP17.
2. Give the Schauhalle rect-distance tiers (WP4 `shape` + `tiers`, computed against the rect, not the anchor), and make its side walls toward the lobes opaque or frosted so the robots can live in a tier that shows only near or inside the hall.
3. Set `tiers.exterior` of the Traumhangar to ≤ 110 m, or count it in the spawn budget.
4. Write the bridge-head sum with the region term in it.

### M3 · "Lazy" loading is effectively eager

**Plan.** Robot GLBs „≤ 130 m from the area anchor (≤ 150 m for sites)“; MuJoCo „≤ 130 m from the Regelgarten or on C start“ (§5.6).

**Problem.** The island is 212 m across. From the Libelle (−3.3, 22.7), where every player stands in minute one:

| Area | Distance from the Libelle | Within the radius? |
|---|---|---|
| Regelgarten | 99 m | yes |
| Lern-Dojo | 86 m | yes |
| Schauhalle | 89 m | yes |
| Traumhangar | 149 m from the plaza (0, 26) | yes (< 150 m) |

So the first minute triggers about 3.5–4 MB:

- MuJoCo 1.09 MB, the duck 0.19 MB, the SO-101 pair 0.26 MB;
- the Schauhalle line-up 0.35 MB plus four plinth robots;
- the four Unitree robots ≈ 1.0 MB, although the Revier gate is still closed.

At slow 4G (≈ 200 KB/s) that is ≈ 20 s of saturated link while the first zone plays. Each arrival also costs parse, compile and upload in idle slots that the deferred zone inits need too.

**Fix.**
1. Gate fetches by **reachability**: nothing for ground areas before the Revier opens, nothing for the H2 before the mastery gate.
2. Use **one engine fetch queue** (WP4, inside `ctx.robots`) with priorities (current objective first, then route order), concurrency 1–2 and `fetchpriority: 'low'`.
3. Use radii near the active distance (60 m), or route-based prefetch ("next objective").
4. Load MuJoCo on entering the Regelgarten plot, and prewarm the worker while the player walks to station C.
5. Run prewarm at ≤ 1 robot per idle slot, and never during F1, the lift-off or a `cinematic()`.

### M4 · The download caps are already broken by WP0's measured output

**Plan.** „One robot file ≤ 350 KB … exhibits target ≤ 150 KB“; „All robots over a playthrough ≤ 4 MB … ≈ 3.95 MB“; „Total transfer ≤ 8 MB … ≈ 7.3 MB“ (§5.6).

**Problem.** Brotli-11 of WP0's current files, for the 21 GLBs the MUST build needs (20 hall robots + the leader):

- playables: so101 132, leader 128, duck 190, R1 237, G1 240, H1-2 289, H2 231 = **1.41 MB** (fine);
- the 14 exhibits = **2.54 MB**, against the plan's 2.1 MB;
- **Apollo 418 KB** breaks the 350 KB cap;
- only 6 of 14 exhibits meet ≤ 150 KB (Spot 316, TALOS 301, Stretch 243, TIAGo 202, Go2 170, UR5e 163, Franka 155).

With the 0.3 MB line-up the total is **≈ 4.25 MB > 4 MB**. The playthrough adds up to:

| Item | MB |
|---|---|
| First load (today) | 1.68 |
| B1 growth | 0.2–0.3 |
| MuJoCo | 1.09 |
| Robots | 4.25 |
| New chunks (region, life, lift-off) | ≈ 0.22 |
| GLTFLoader, meshopt, SkeletonUtils | 0.03 |
| **Total** | **≈ 7.5–7.6** |

That leaves no room for the "full LOD … LRU of 3" inspection files (§4.9), which no cap budgets and WP0 does not build, or for per-body crowd geometry (B3 (c)).

**Fix.**
1. Re-decimate the exhibits to the plan's LOD0 ≤ 25 k triangles (R7 §4.1 error curves show it is achievable).
2. Drop the separate per-robot L2 file where the merged line-up covers it.
3. Decide that **LOD0 is the inspection model**, with no third tier.
4. Make `robots:check` fail on the per-file and total caps from now on.
5. Re-baseline the 8 MB total with a scripted full-lap `load-matrix` in wave 1, not as an estimate.

### M5 · The two program gates cannot both hold

**Plan.** „shader programs at the title ≤ 140 (rc4 132), **0 programs linked during play** (robots share one skinned `robotPaint` program compiled in the boot warm-up …)“ (§5.5). R9 life: „0 new programs after the title“.

**Problem.**
1. rc4 does not meet "0 during play": the measured value is **6** (RELEASE §1a, `hitches`), and `tools/hitches.mjs:177` counts every link after the title, background ones included.
2. "One skinned program" is several: skinned main, skinned shadow-depth (robots ≥ 1 m cast), the instanced twin for crowds (`forInstancing`), a BatchedMesh variant (m1), the transparent teal ghost (Traumhangar), the L2 silhouette, and WP0's own unlit skinned upload program (`RobotLibrary.ts` `compileUpload`).
3. New world and area materials add more: lake water, dock spray, people and far proxies, the glossy hall floor with a static env map.
4. Lazy chunks (life, region, areas after B1) cannot be compiled "at the title" unless their materials live in eager code. Eight programs of headroom do not cover this.
5. Safari lacks `KHR_parallel_shader_compile`, so an idle-time link is synchronous there and can still drop a frame. The `hitches` tool runs on Chromium only.

**Fix.**
1. Keep an itemised program table (WP7, kept by the integrator).
2. Compile the robot and crowd variants at boot with dummies (WP0, plus WP4 for the warm-up hook).
3. Redefine the play gate as „0 links on a frame that first shows the object, and 0 frames > 33 ms caused by a link“, with background `compileAsync` in idle allowed and counted separately.
4. Re-baseline „at the title“ (e.g. ≤ 150) once the table exists.
5. Add one WebKit `hitches` lap.

### M6 · "The world moves": visible bugs and inconsistent rules

**Plan.** „Gust tilt rotates the environment group and the ground root together by the inverse tilt“ (§5.3.4). `GroundHandle.setAltitude`: „ground colliders enabled only at h === 0“ (§5.2), versus „Above 1 m they are disabled“ (§5.3.3) and „ground colliders off at h > 1 m“ (§4.15). Altitude is set in `ground.setAltitude(h)` (WP3), `env.setFlight({ altitude })` (WP2) and `ctx.flight.altitude` (WP4).

**Problem.**
1. **The ground heaves under the player.** Island gusts run every 60–90 s anywhere (`world/index.ts:266`), with up to 0.5° tilt, and the Probestart tilts 2.2–2.9°. Rotating the ground root about the island centre while the player stands on the ground moves the ground mesh by 114 m × sin 0.5° ≈ **1.0 m** at the bridge head and ≈ 2.6 m at the Sonnenacker. The Probestart would move it ≈ **5.8 m**, while the player's colliders stay put.
2. **Ground dynamics fall.** `Physics` captures a dynamic mesh's `parentInv` once at registration (`Physics.ts:145`). Meshes visually follow the ground root, but their bodies stay in world space. When ground colliders switch off (at 0.3 m during the Probestart under the `h === 0` rule), ground-zone crates fall to the kill plane and snap back.
3. **The whole ground subtree is recomputed every frame.** Moving the ground root forces `matrixWorld` updates for every descendant (ground plus every ground zone's far tier) on every frame of F1 and the lift-off, inside a ≤ 0.3 ms director budget.
4. **The shadow map needs a redraw every altitude frame**, and nothing marks it.
5. **Three setters for one number** will drift.

**Fix.**
1. While docked, gusts never tilt the ground root. The island tilts visually only when the player is aboard, and nothing tilts while the player stands in the ground frame.
2. Use one threshold: colliders on at h ≤ 0.05 m. On any h ≠ 0, ground-frame dynamics go kinematic or sleep, frozen at their pose.
3. Have one engine call, `flight.setAltitude(h)` (WP4), fan out to the ground root, slab, `cloudY`, `sunBlocked`, colliders, suspension and `markShadowsDirty()`.
4. Detach suspended ground-zone roots from the scene graph (re-attach at h = 0), so only the terrain and far-ring meshes move.
5. Add a `perf-cpu` view during the climb.

### M7 · The kill plane equals the dock floor

**Plan.** „Dock floor … y −66 … rescue drone as rc4 (`ISLAND.killY` −66)“ (§2.3); WP3: „rescue from the lake and the dock floor“.

**Problem.**
- The player is rescued when `feet.y ≤ ISLAND.killY` (`Game.ts:850`, `layout.ts:68`). A walkable floor at exactly −66 makes the rescue depend on the capsule's skin offset: either it never fires (the player is stuck in a 66 m pit) or it fires on every step.
- Dynamic bodies reset only below −96 (`Game.ts:292`). Crates thrown off the rim land on the floor and stay for ever, visible through the Glasbalkon and Kanzel glass floors.

**Fix.** Put a rescue trigger volume over the dock floor and the keel block (player rescue, dynamic reset), or raise `killY` to −58 for the grounded state. Also add a reset volume at the lake surface (y −20) for dynamics.

### M8 · Stamp and star totals count every area, which breaks D37

**Plan.** D37: „Only the 18 stamps of the six island zones“ draw the mark; Pass sections „Insel (18)“ and „Revier & Hangar“; star pool 81.

**Problem.** Every station of every imported module is registered as a stamp (`ZoneManager.ts:172`), and the aggregates count them all:

- `Progress.earnedStamps()` (`:179`), `GameLayer.summary()` and `stars()` (`:559–609`), with `max` falling back to 54;
- `Progress.stampNote(n)` (`:218`) clamps the Recamán melody at stamp 18.

With five new areas this drives:

- the tower (`tower/logo.ts:56` clamps `earnedStamps` to 18, so farm stamps draw tower arcs);
- the Pass cover `passMark`, the „Schau zum Turm“ hint and „tower line n/18“;
- the title's „n von 18“ (`StartScreen.ts:116`, via `Game.ts:337` `progress.stamps().length`, which also counts skipped and legacy stamps);
- the certificate and `finale:ended`.

The plan specifies none of these changes.

**Fix.** Add `scope: 'island' | 'all'` (from the manifest `kind`) to `Progress.earnedStamps`, `GameLayer.summary`, `stars()` and `ZoneGame.progress({ scope })`. The default `'island'` keeps rc4 consumers right. The melody index uses island stamps only. Owner WP1, wave 1, with a test that seeds farm stamps and asserts the tower count.

### M9 · `mastery` and `rev` are read at boot but defined at init

**Plan.** `ChallengeDef { rev?: number; mastery?: boolean }` (§5.2). „The pool is read from the manifests at boot (before any zone init)“ (§3.1). „on registration a stored record with another `rev` is reset“ (§3.5 rule 3).

**Problem.** Challenges are registered in a zone's `init`, which runs after the title, and with B1's fix maybe minutes later. A manifest cannot carry a flag that exists only on `ChallengeDef`. Until the Lern-Dojo inits, an rc4 save's ★★★ on `lern-dojo.*` and `prueffeld.drei-auditoren` still count toward:

- the 61 ★ H2 gate;
- Schauhalle deliveries (Apollo at 36 ★);
- the title and the Pass.

So the H2 can open on stale stars and close again when the zone loads.

**Fix.** Put `rev` and `mastery` on `StationDef` (manifest, B1). Run the rev reset and the legacy move in the boot migration step against manifests, before any reader. Keep `ChallengeDef.rev` only as a dev assertion that it matches the manifest.

### M10 · The save migration is irreversible and incomplete

**Plan.** „Storage stays `localStorage['emai-academy-island/v1:progress']`“; rules 1–6; „An rc4 build reading a v2 save … starts fresh (acceptable: rc4 was never public)“ (§3.5). Release: „the rc4-save migration on the founder's own browser“ (§8.4).

**Problem.**
1. **Same key, no backup.** The first save overwrites the only rc4 copy.
   - The founder's own save is the real rc4 user. Once migrated it cannot be re-tested or rolled back.
   - Any rc4 build opened on the same origin later discards v2 (`Progress.ts:99` accepts only `v === 1`) and overwrites it with an empty v1 on its first save.
2. **No failure path.** If `migrate()` throws, today's constructor would start empty and the next debounced save destroys the data.
3. **Gaps in the rules.**
   - Predictions of retired or moved stations stay in Prognose-Güte: `greifwerkstatt.griffe`, `regelgarten.tausend-welten`, and `lern-dojo.datensatz-audit` (whose prediction moves to B). Sources: `stationC.ts:644`, `wall.ts:444`, `audit.ts:523`.
   - `best` values of reworked stations (`kappa` from 12 clips, `oodDemos`) are not covered.
   - rc4 saves with `finale.ended` and `sky: 'dusk'` restore the dusk on the ground (`finale/lazy.ts:34`), against „dock mode is day“.
   - `onboarding: 3` / `start.probestart` is unmapped, so an rc4 player with stamps would see dark lamps until pulling the lever again.
   - The new island keys `flight`, `start` and `mastery` break the plan's own `p7.<pkg>.<key>` rule.
4. **Timing.** Rule 2 archives `greifwerkstatt.griffe` from wave 1 (WP1), while the 200 Griffe station exists until WP8 lands in wave 2, so it can be re-earned in between.

**Fix.**
1. Write v2 under a new key (`…/v1:progress.v2`, or bump the prefix) and keep the v1 blob read-only as a backup until release. `clearGameStorage()` already removes both on reset.
2. Wrap the migration in try/catch. On failure, run in memory on the untouched v1 and do not write.
3. Extend the rule table to predictions, bests, `sky`, `onboarding → start.probestart`, `logoShown` and `liftAt`.
4. Keep a `src/systems/retired.ts` data list that the WP retiring a station appends in the same commit.
5. Add fixtures for each case to `tools/fixtures/saves/`.

### M11 · Feature ownership overlaps and import-rule breaks

1. **The 12 farm arms have two owners.** WP9's C „12 arms pick … in ≈ 90 s“ and WP15's L2 „harvest shift (12 real SO-101 on rails)“ animate the same objects. → WP9 owns the arms and the shift state machine; WP15 subscribes through the LifeDirector.
2. **The Schauhalle footprint has no owner for clearing it.** It overlaps the PV fields `landscape/plan.ts:148–149`, the north-spoke inlays and lanes, and nobody owns those files (B2). → WP12 clears the footprint on WP11's spec in wave 1.
3. **The Fundvitrine breaks the import rule.** „objects (≤ 300 tris each) come from WP15“ (`src/world/eggs`), placed by WP11 (`src/zones/schauhalle`), but zones may not import `src/world` (ARCHITECTURE §1.2). → Register object factories with `ctx.game.secrets` (WP1 engine API) at island init; the zone places them by id.
4. **`zoneValue()` drags the finale into the main chunk.** `FlightSystemDef.value()` calls `finale/pass.ts zoneValue()`, which is in the lazy finale chunk; a static import from WP12's island code pulls the finale (38 KB br) into the main chunk. → Move `zoneValue()` to a small shared island module.

### M12 · Wave order: the spine is late, the riskiest WP has no slack, perf comes last

**Plan.** WP12 (rotors and start flow) in wave 2; WP10 (12 d) in a 12-day wave 2; WP17 perf in wave 3. R5 §8.3: „then 3 + 4 (a playable grounded game, shippable on its own)“.

**Problem.**
- Until p7-w2 there is no playable "Probestart → rotor → Revier" loop. Every wave-2 content WP builds without it, and G-LOOK is judged out of context.
- WP10 is the largest unknown (four robots piloted by leg and arm IK, a K = 5 ensemble world model). It sits on the critical path with zero slack.
- Budgets get summed for the first time in wave 3, after the content is locked.

**Fix.**
1. Move WP12's core (Probestart, crown beacons, M1–M6 registration, bridge spawn, Revier gate, the gust rule from M6) into wave 1.
2. Move WP6 (depends only on WP0) to the start of wave 2.
3. Let the WP2 builder, free from day 5, run a 3-day WP10 spike on a dev plot: piloting plus the toy world model.
4. Start the M2 ledger at p7-w1.

### M13 · The terrain spec is unbuildable before the title

**Plan.** WP3: „terrain heightfield (Rapier, 2 m cells) with paths“; walkable boundary r ≤ 650 m; „Ground module … before the title (yielding builders)“ (§5.6).

**Problem.** A 1.3 km square at 2 m is **422,500 samples**. Generating it procedurally at 4× CPU is a multi-second job before the title (target: no task > 250 ms, title ≤ 4.5 s at 4×). A render mesh at the same resolution is **≈ 842 k triangles**, close to the whole 1.0 M view budget. No render LOD is specified.

**Fix.**
1. Bake the heights offline into a compact Uint16 asset. Load a 300 m core before the title and the rest after it.
2. Use 2 m collider cells only in walk corridors and site plots (≤ 250 m); elsewhere a coarse 8–16 m render ring with skirts and no collider (fences bound the walkable area).
3. State a triangle budget for the terrain per view.

### M14 · A failed load can make the goal unreachable; no loading states

**Plan.** Lift-off needs 6/6 ◆ „earned (not skipped)“. 03 C and 04 B ◆ need the SO-101 (+ leader) GLBs. Failure handling exists only for MuJoCo (recordings).

**Problem.** A GLB fetch or zone-chunk failure is a toast (`ZoneManager.fail`). A ◆ station that cannot load cannot be earned, and skip does not count, so M3 or M4 never become bereit and **the lift-off is unreachable for that player**.

There are also no loading states for:
- duck C: 1.1 MB at slow 4G ≈ 6 s;
- the Traumhangar on arrival;
- the Entscheider Schauhalle, where „all unpacked“ means ≈ 3.5 MB at once.

**Fix.**
1. Retry with backoff plus an „Erneut laden“ card (`importRetry` exists).
2. A degraded mode for each robot ◆: the L2 silhouette plus the same model, still able to earn ★.
3. As a last resort, R5's ground-crew rule for an asset failure („Bodencrew · ohne Kennlinie“).
4. One loading card style per station with bytes and progress.
5. New `robust-check` cases: a GLB blocked, the worker blocked.

### M15 · Gates and acceptance criteria are partly untestable or too slow

**Plan.** §8.1 lists ~28 tools „per merge“. Per-WP criteria as in §6.3–§6.4.

**Problem.**
1. **Runtime.** rc4's playtest alone took 263 s per mode and `hitches` 4.5 min a lap. With the Revier, five areas, the lift-off (≥ 6 min with RM and replay) and `secret-audit` (30 bot runs), a serial full gate is **≥ 1–1.5 h per merge**. The GPU and audio tools cannot run in parallel.
2. **There is no unit runner.** Node 24 strips types but cannot resolve `@/` aliases or extensionless imports. WP1's „unit checks of derivations“ and a Node `save-migrate` need a browser harness or a devDependency.
3. **Criteria that cannot pass as written.**
   - WP1 „pool = 81 from manifests“: the area manifests do not exist in wave 1.
   - WP4 „`shots-all` identical“: impossible after WP2/WP3 merge.
   - „`mujoco-check` in three engines“: Playwright's current engines are not Safari 16.4 or Firefox 108.
4. **Tools hard-code rc4 assumptions.**
   - `playtest.mjs:83` asserts 54/54 ★.
   - `lib/drawcalls.mjs:79` keeps the spawn at (0, 0, 94.5).
   - `ending-check` expects dusk after reload.
   - `onboarding-run` measures the ascent.
5. **The flash counter's capture method is unstated.** CDP screencast is lossy and drops frames.

**Fix.**
1. **Tier the gates.**
   - Per merge (≈ 20 min): typecheck, build, `load-size`, `robots:check`, `save-migrate`, one playtest mode, `third-party`, `text-audit` (one run), `i18n-audit` (m4).
   - Nightly or per wave: everything else.
2. Run unit-style checks in the browser through `__academy` hooks with seeded saves (`addInitScript`).
3. Create stub manifests in wave 1 (B1) so the pool test can run.
4. Restate WP4's check as "identical on the WP4 branch vs its base".
5. Put minimum-version browsers into the human checks (§8.2).
6. Record the flash counter in-page via `readPixels` on a 1024 × 768 target.
7. Budget the tool updates honestly (M16).

### M16 · The estimates have no contingency

**Plan.** MUST ≈ 150 builder-days, 6–7 weeks; wave 1 ≈ 9 days with WP5/WP6 = 9; wave 2 ≈ 12 days with WP10 = 12.

**Problem.** Both waves have zero slack on their critical path, and the scopes below exceed their sizes once B1–B4 and M1–M14 are added:

| WP | Plan (days) | My estimate | Why |
|---|---|---|---|
| WP1 | 7 | 10–12 | plus `Game.ts` resume, GameLayer scope (M8), migration hardening (M10) |
| WP4 | 6 | 9–10 | plus manifest split (B1), lazy init, collider registry and altitude fan-out (M6), `ctx.robots` adapter (B3) |
| WP7 | 4 | 8–10 | 15+ new or updated tools, rc4 assumptions, tiers (M15) |
| WP10 | 12 | 15–18 | four piloted robots, ensemble model, Generalprobe |
| WP11 | 9 | 12 | 20 plinths, cards, LOD governor, six sub-features |
| Integration | 2.5 per wave | 4 per wave | 8 merges per wave, gates (M15) |

No line covers bot extensions for the new stations or the human calibration rounds. My estimate for MUST is ≈ **185–200 builder-days**: about 8–9 weeks with 8 builders, or the cut order applied from item 3 on. The plan should carry an explicit ≈ 20 % contingency and say which cut items it expects to use.

---

## MINORS

- **m1 · BatchedMesh adds a code path for nothing.** Neither BatchedMesh nor InstancedMesh can skin, and `WEBGL_multi_draw` is not guaranteed on the minimum browsers (three falls back to one draw per instance). Use **per-body InstancedMesh** everywhere: 7 draws for all farm arms, as the duck field does. That is one program variant less and works with `forInstancing`.
- **m2 · The Schauhalle needs a LOD governor, and the LOD names disagree.** WP0's LOD is per robot (`updateLod`). Caps like „≤ 2 at full LOD, ≤ 8 LOD0 within 12 m“ need a hall-level governor sorted by distance. „full LOD“, „L0“ and „LOD0“ are used for different things; settle on WP0's `0 | 1 | 'silhouette'`. Exhibits that do not move can be posed once and stop skinning updates.
- **m3 · There is no memory budget or disposal rule.**
  - Terminate the MuJoCo worker 60 s after leaving the Regelgarten.
  - Call `RobotLibrary.release()` for suspended areas and on the Inspektion LRU.
  - Free the Traumhangar dream worlds on exit.
  - Add a `renderer.info.memory` + JS-heap lap to WP7.
- **m4 · Missing English silently becomes German.** Resolution is current language → German → `⟦key⟧` (`I18n.ts:22`), and a warning fails no tool. Add an `i18n-audit` (key parity DE/EN, mode-variant shape, all areas initialised) to the per-merge tier.
- **m5 · Reduced motion has gaps.** Specify RM for: the humanoid head camera (bob and sway off), the 0.3 m world sink of the Probestart, the dock spray rate, the duck „Sturz der Generation“ slow motion, and the dream glitch tiles (photosensitivity review).
- **m6 · Depth precision at distance.** The camera is 0.05–3000 m (`RenderSystem.ts:312`). At 600 m one 24-bit depth step is ≈ 0.4 m, so the lake shore WNW will z-fight. Keep ≥ 1 m vertical separation, or a polygon offset on water.
- **m7 · Far PV shadows.** The shadow map covers 90 × 90 m around the player, so the farm's "dark PV stripes" seen from the Ausguck or Kanzel 240 need analytic stripe shadows in the bed and ground material.
- **m8 · Workers keep running while paused.** Pause the CEM worker and the LifeDirector on `game:pause` and frozen panels; `idle-render` checks renders only.
- **m9 · rc4 leftovers and name clashes.**
  - The rc4 shuttle pod (`landscape/plan.ts` `DOCK`, `landing.ts`) is obsolete, and its name clashes with the new layout `DOCK`.
  - The fallback plots on the r 230 m ring now sit inside the Revier; move them beyond 900 m.
- **m10 · Worker requests may escape `third-party.mjs`.** Verify the tool sees dedicated-worker requests, and that the Emscripten glue's `locateFile` never builds an absolute URL to another origin.
- **m11 · Resuming on the ground.** When the resume target is a ground area, load the region chunk eagerly, or the player stands on bare terrain for seconds.
- **m12 · Save size.** `Progress` serialises the whole blob on every debounced save. Cap per-area `zoneData` (e.g. ≤ 16 KB): Lern-Dojo demos and duck gaits are the candidates.
- **m13 · Rect plots.** `ZoneLayout.radius` drives `inside`, HUD hiding, compass `hideWithin` and the default spawn. Rect plots need a defined circumscribed radius plus a `shape` test (WP4).
- **m14 · Dev runs.** Define `?world=0` (no ground frame: ground zones get fallback platforms) and `?only=<site>` (the island module still registers the ground frame).

---

## What is sound (keep it)

- **Derived state.** Rotor states are derived from stamps, there is one `flight` flag, and suspension lives in the engine, not in the zones.
- **Zone listing default.** `ctx.zones.list()` defaults to the six lobes, so rc4 island consumers stay unchanged.
- **The world moves, not the island.** No collider ever moves; the island frame stays fixed (fix M6's details, keep the principle).
- **Process.** Contracts first with stubs, and the G-LOOK still before mass art production.
- **One env-map rebuild hidden in the whiteout.** Once M5 is redefined, allow that one frame explicitly in `liftoff-check`.
- **Physics choices.** The SO-101 stays on Rapier and the Unitree robots stay kinematic; MuJoCo has a single MUST consumer.
- **WP0's runtime is better than the plan says.** `prewarm()` already compiles *and* uploads offscreen, `release()` exists, and the robots share one vertex-colour paint material.
- **Scope control.** The cut order and the "never cut" list.

## Proposed changes to the wave plan

| Wave | Lanes (≤ 8) |
|---|---|
| Wave 0 (lead, ≈ 2 days, before wave 1) | Fix B1–B4 in the plan text; WP0 freezes its API; publish the owner map (B2) |
| Wave 1 (10–11 days) | **WP0** finish (b), (c), (e), clips · **WP1** · **WP2** (then the WP10 spike) · **WP3** · **WP4** incl. manifest split, `ctx.robots` adapter, altitude fan-out · **WP5** · **WP7** · **WP12-core** |
| Exit p7-w1 | A grounded rc4 with the Probestart, rotors and the Revier gate is playable; first load ≤ 1.75 MB with stub manifests; GPU proof scene measured A/B |
| Wave 2 | WP6, WP8–WP11, WP12-rest, WP13–WP15 (WP10 continuing from its spike); integrator owns the per-owner perf ledger |
| Wave 3 | as planned, plus a 20 % fix buffer |

## Verdict

**Is the plan buildable by parallel builder agents as written? No.**

- **B1:** the boot model makes the first-load cap fail by construction.
- **B2:** the shared-file protocol leaves `Game.ts`, `createZoneContext.ts`, the existing interfaces in `types.ts`, `GameLayer`, `Physics`, `Kit`, `Audio` and half the island module unowned, so eight builders would either collide or stall.
- **B3:** the robots contract does not match WP0's code.
- **B4:** the MuJoCo worker contract works in dev and breaks in production.

**After the four blockers are fixed it is buildable.** That takes an owner map with three seams, the manifest/code split, the WP0 contract frozen as built, and the worker factory contract: about two lead-days. Fix the majors in the plan text during the first two days of wave 1 and verify them at p7-w1: M1 (sky after opaques, GPU A/B gate), M3 (fetch queue), M6/M7 (ground rules), M8–M10 (save and progress scope), M12 (spine in wave 1).

Plan the calendar on ≈ 185–200 builder-days, not 150.
