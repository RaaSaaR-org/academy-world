# EmAI Academy · Schwebewerk — „Entdecken“ (Discover): mobile look-only mode — plan

Base: branch `phase7` @ 2afb983 (rc5). This plan follows `docs/PHASE7-PLAN.md` §6.1 (branches `d/<wp>`, contracts first, merge tier per merge) and `docs/DECISIONS.md`. Goal: phones can view, learn and share; playing stays on the desktop.

## 1. Architecture

### 1.1 Findings that shape the design
- **Gate.** `index.html` sets `reason = 'touch'` when `(pointer: coarse)` matches and `(any-pointer: fine)` does not. It then shows the bilingual notice and keeps the font preloads inert. `main.ts` waits for `__emaiGate.go`, then imports `core/Game` and `hud.css`. `tools/robust-check.mjs --only phone` checks the notice (≤ 1.5 s, ≤ 50 KB), and that check must stay green.
- **Boot.** `Game.boot()` starts the Rapier download and the world chunk in parallel, waits for fonts, then runs `createCore(RAPIER)`, `zones.discover()`, `loadWorld()`, the eager zones, `placeInitialPlayer()`, `warmUp()` and then the title. After that, `initZonesDeferred()` runs `zones.loadReachable(feet)` (nearest first, ≤ 2 downloads at once, one init per idle slot).
- **Rapier cannot be skipped cheaply.**
  - `createCore` builds `Physics(R)`.
  - The `Player` uses Rapier's character controller.
  - `Game.groundAt`, `teleport` and `hud.labels.occlusionTest` call `world.castRay`.
  - 87 files in `src/world` and `src/zones` call `ctx.physics`, including joints, private worlds and kinematic animations.
  - Skipping it would mean writing a stand-in for the whole `ctx.physics` API.

  **Decision:** Discover loads Rapier (0.83 MB brotli). It keeps the fixed step for kinematic animations, and its bodies sleep. The player's collider is turned off. Revisit only if the spike's real-phone memory reading demands it.
- **Save and storage.**
  - `Progress` has a read-only mode (`save()` returns early when `readOnly`).
  - `migrateAtBoot()` can *write* a v2 save, and `params.reset` wipes the save.
  - `Settings.set(k, v, persist=false)` exists.
  - The auto quality setting saves `quality-auto`.
  - Discover must write nothing to localStorage.
- **Camera hooks.**
  - `Player.cameraOverride` holds `{ position, quaternion, blend }`.
  - `ctx.player.cinematic()` is the scripted camera.
  - `Game.updateAttractCamera` uses `ATTRACT_CAMERA`.
  - The lift-off's outside shots are pure functions: `outsideCamera('C1'|'C2', h, t)` in `src/world/ground/camera.ts`.
  - The ascent was retired (D26); the glide's path generator is in `src/world/intro.ts`.
  - The views table in `tools/lib/views.mjs` gives measured poses: `bridgehead`, `plaza`, `ausguck`, `schauhalle`, `kanzel240`.
- **Level of detail follows the player's feet,** not the camera: `ZoneManager.update()` computes the tiers and the `inside`/`active` state from the horizontal distance to each plot's edge.
- **Lift-off replay already exists.** `src/world/finale/lazy.ts` listens for `'liftoff:replay'` and runs `f.replay('title')`, which calls `launch({ replay: true, auto: true })`. Under reduced motion the director plays its stills version. Docking again is `quest.setFlight('ground')`, which goes through the `flight:state` handler to `applyDocked`; that handler is blocked while `liftoffLock.running`.
- **Robot data.**
  - `HALL_ROBOTS` (`src/zones/schauhalle/data/robots.ts`) has rows with chip and source plus an `amber` flag.
  - `sheet(r, lang, info)` (`sheet.ts`) is pure and includes the licence and attribution row.
  - Robot models are named `robot:<id>` with `userData.robot`.
  - `ctx.robots.load(id, { priority: 'now' })`, `untrack()` and `release()` exist.
  - In Entscheider mode every hall robot except the H2 stands (`deliveries.ts` `shownNow`).
- **Strings.**
  - Area code and its strings are lazy (`src/zones/<id>/strings.ts`, each with banner `lesson`s).
  - Manifests are eager (title, eyebrow, verb, `takeaway`).
  - The island texts are in `src/world/start/strings.ts`, `src/world/region/strings.ts` and `src/world/finale/liftoff/strings.ts`.
  - The facts register is `docs/RELEASE.md` §5.

### 1.2 Boot path (`?discover=1`)
1. **`index.html` gate** (WP-D0 edits the gate block and the viewport meta):
   - `discover = /[?&]discover=1(&|$)/.test(location.search)`.
   - When discover is set, the `'touch'` reason is cleared. WebGL2, the old-browser check and the import-map check still apply.
   - `__emaiGate.discover = discover`.
   - The viewport meta gains `viewport-fit=cover`.
   - Without the flag nothing changes: phones still see the notice.
2. **`src/main.ts`** passes nothing new. `Game` reads `params.discover`.
3. **`src/core/params.ts`** adds:
   - `discover: boolean`
   - the spike knobs `perf`, `bench`, `tier: 'phone'|'full'|null`, `dpr: number|null`, `fps: 30|60|null`, `shadows: boolean|null`
   - `stop: string|null`
4. **`Game` constructor**, when `params.discover`:
   - skips `migrateAtBoot`
   - builds `new Progress(events, { memory: true })`: empty, read-only, never reads the stored save
   - ignores `params.reset`
5. **`Game.boot()`, when discover:**
   - Starts `discoverP = importRetry(() => import('@/discover/index'))` next to Rapier and the world. The chunk is ≤ 60 KB, so it is never on the critical path.
   - After the fonts it calls `D.beforeCore(game)`:
     - `progress.adoptMemory(discoverSave(AREA_MANIFESTS))`
     - in-memory settings (reduced motion from the media query, FOV)
     - registers the strings
   - After `createCore(RAPIER)` it calls `D.afterCore(game)`:
     - `rs.setTier(tier)` **before** the warm-up, so the right shader variants compile
     - `zones.setReachable(discoverReachable, { lock: true })`
     - `player.collider.setEnabled(false)`, gravity 0
     - creates Discover's own `ZoneContext` with `createZoneContext(game, 'discover', …)`, used for `ctx.robots`, `ctx.emi`, `ctx.i18n`, `ctx.materials`, `ctx.debug`
   - Then `loadWorld` → observer at the start pose → `warmUp()` → `loading.done()` → `phase = 'discover'` → `D.start(game)`, which shows the start card over the `ATTRACT_CAMERA` orbit.
   - `initZonesDeferred()` runs unchanged, so `__academy.ready` and `game:ready` keep their meaning.
6. **The `'discover'` phase in `Game.frame()`:**
   - `sim = true`, `controlling = false`
   - camera = `this.cameraDriver?.(dt)`, which falls back to `player.updateCamera` while the film runs
   - frame cap from the tier, generalising the title's `oddFrame` rule into a time-based limiter
   - no `checkPlayerFall`; `rescuePlayer` does nothing; no pointer lock (`captureMouse` already requires `'playing'`); no `handleActions`
7. **Desktop rule:** with `discover=false` every seam is inert. The checks are the merge tier, `load-size`, `warmup --table` (≤ 150 programs), `robust-check --only phone` and `a11y-keyboard`.

### 1.3 What Discover loads and skips

| Item | Discover |
|---|---|
| Rapier, world chunk, ground, region, life chunk | loaded (life chunk: tier knob `life`, default on) |
| Area code | 6 lobes, `schauhalle`, `sonnenacker`, `traumhangar` (the `discoverReachable` set; ordered by the next stop: D1 calls `zones.initOne()` during the stop's pre-roll) |
| `kreislaufhof`, `unkrautacker` | no code; the region chunk's far impostors; text-only hotspots |
| MuJoCo and duck worker | never: no stop puts the observer inside the Regelgarten plot, and the seeded objective is "route done" |
| Finale chunk | as today (idle after `game:ready`); needed for the film |
| Start screen, pause menu, Pass, map, onboarding beats, `game:start` | never shown or emitted |
| HUD | stays for zones; `#hud.discover` CSS (in `src/discover/discover.css`) hides the compass, crosshair, prompts, objective, toasts, banners, telemetry, panels, subtitles and labels; `#hud.discover.film` shows captions, subtitles and the lift-off HUD again |
| Audio | ambience on after the first tap; the EMI voice group is set to 0 in memory except during the film |

### 1.4 The observer (how areas see a camera)
`src/discover/observer.ts` provides `observerFeet(cam, out)`. Each frame it places the player at the camera eye minus 1.7 m: `player.teleport` without the ground lookup, with matching previous and current feet. Two exceptions:
- **Lobes:** inside any lobe plot (`ZONE_PLOTS`, r 22) at |Δy| < 40, the feet are pushed out to r + 1, so no lobe's `onEnter` fires.
- **Interior plots** (`schauhalle`, `traumhangar`) are allowed, so the interior culling and the hall's level-of-detail limiter work.

Because the feet follow the camera, levels of detail, robot queues (≤ 60 m), the sun-shadow box and the zone audio all follow the camera during flights.

### 1.5 Seams (all new; owner WP-D0 unless noted)
- `Game`:
  - `phase 'discover'`
  - `cameraDriver: ((dt: number) => void) | null`
  - `setLang(l, persist = true)`
  - `discover` hooks `beforeCore/afterCore/start`
- `Progress`: constructor option `{ memory: true }` and `adoptMemory(data)` (throws unless `memory`).
- `RenderSystem`:
  - `setTier(t | null)`: pins the level, overrides preset fields, keeps only the render-scale part of auto with `targetMs = 1000 / fpsCap`, never saves `quality-auto`
  - constructor option `frameBufferType` (fallback if half-float render targets fail on a phone)
- `ZoneManager`: `tierScale` (multiplies the plot tiers; default 1) and `setReachable(pred, { lock })`. A locked predicate ignores the quest's `regionOpen` re-wiring in `createCore`; the alternative is to skip that wiring when discover.
- `src/world/finale/lazy.ts` + `index.ts` + `liftoff/director.ts` (owner **WP-D3**):
  - `'liftoff:replay'` payload `{ from, stills? }`
  - `'liftoff:skip'` → `director.skip()`
  - `director.start({ …, stills })`
- Tool hooks via `registerDebugExt`: `discover:state`, `discover:goto`, `discover:stops`, `discover:perf`, `discover:bench`.

### 1.6 `src/discover/` layout and the shared handle

```ts
// src/discover/types.ts (WP-D0 contract, committed day 2)
export interface DiscoverHandle {
  game: Game; ctx: ZoneContext; tier: DiscoverTier;
  camera: DiscoverCamera;     // setRig(rig), pose(), flyTo(target, { via?, seconds? }): Promise<void>, fitDistance(radius)
  observer: Observer;         // follow(), pin(pos)
  gestures: Gestures;         // onTap(fn(ndc, px)), onDoubleTap, enabled
  sheet: Sheet;               // show(card: CardSpec, snap?: 'peek'|'half'|'full'), hide(), onSnap(fn)
  topbar: TopBar; menu: Menu; // setStep(i, n, title); menu.add({ id, label: Text, onSelect })
  perf: PerfMonitor;          // stats(), window(ms) → { p50, p90, over50 }
  modes: { register(name: 'tour'|'viewer'|'film', m: DiscoverMode): void; enter(name, arg?): Promise<void>; readonly current: string };
  stops?: () => readonly TourStop[];                        // D1 registers (bench uses it; D0's spike.ts is the fallback)
  robots?: { card(id: RobotId): CardSpec | null; open(id: RobotId): void; ids(): RobotId[] };  // D2 registers
  share?: (what: { kind: 'game' | 'stop' | 'robot'; id?: string }) => Promise<void>;          // D3 registers
}
export interface CardSpec { eyebrow?: Text; title: Text; blocks: CardBlock[]; actions?: CardAction[]; srcLine?: Text }
export type CardBlock = { kind: 'p'; text: Text; chip?: ChipType; src?: Text } | { kind: 'rows'; rows: { label: Text; value: Text | null; chip?: ChipType; cond?: Text }[] } | { kind: 'chips'; items: { label: Text; onSelect(): void }[] };
export interface TourStop { id: string; title: Text; areas: string[]; rig: CameraRig; via?: Vec3[]; spots: string[]; card: string /* content id */ }
```

Files: `index.ts` (`beforeCore`, `afterCore`, `start`), `types.ts`, `tier.ts`, `save.ts`, `observer.ts`, `camera.ts`, `touch.ts`, `perf.ts`, `spike.ts`, `strings.ts`, `discover.css`, `ui/{sheet,card,topbar,menu,start}.ts`. Then `tour/**` (D1), `viewer/**` (D2, lazy sub-chunk), `film/**` (D3, lazy sub-chunk) and `data/*.gen.ts`.

### 1.7 Save seed (`save.ts`, D0)
`discoverSave(manifests)` returns an in-memory `ProgressDataV2`:
- mode `entscheider`, so every hall robot except the H2 stands (`deliveries.ts`)
- every station of every manifest stamped
- the flight on the ground
- `probestart` and `glideSeen` true, onboarding 3

The result: the tower mark is complete, M1–M6 are ready, the Revier is open, the beacons are teal. Nothing is ever written: `readOnly` plus no `reset`. `discover-check storage` proves it.

## 2. Phone performance strategy

### 2.1 Tier (`src/discover/tier.ts`)

| Knob | `phone` (default with `?discover=1`, also on desktop) | `full` (`?tier=full`) |
|---|---|---|
| Base preset, pinned | `low` (composer + grade, no bloom, no MSAA) | normal auto |
| Pixel-ratio cap / render scale | 1.25 (spike also tries `?dpr=1` and `?dpr=1.5`) / 0.7–1.0, scale-only auto at the fps target | preset |
| Frame cap | 30 fps (`?fps=60` for the A/B) | display |
| Shadows | on, 1024², extent 35 (`?shadows=0` A/B decided by the spike; chosen at boot, never toggled, so no relinks) | preset |
| Level-of-detail distances | `ZoneManager.tierScale = 0.8` | 1 |
| Robots | viewer at most 2 parsed most-detailed files (`ctx.robots.release`); line-up not loaded in the viewer | — |
| Film | `auto`: stills when `perf.window(3000).p90 > 50 ms` or reduced motion | full |

### 2.2 Memory (iOS Safari)
iOS closes a tab that runs out of memory and reloads it; the WebGL buffers count against the tab. The levers:
- the pixel-ratio cap (the composer's half-float buffers scale with pixels)
- no MuJoCo; Kreislaufhof and Unkrautacker code stays unloaded
- the viewer's 2-file robot cache
- the hall's own level-of-detail limiter (≤ 2 robots at full detail)
- no line-up model in the studio
- suspended ground areas while the film is airborne (already in the engine)

`perf.ts` estimates GPU memory by walking the scene: unique geometry attributes and indices, textures as w×h×4×1.33, composer targets, shadow map and environment map. It reads the JS heap where `performance.memory` exists. **Crash marker:** a sessionStorage entry `discover-alive` `{ stop, t }` is cleared on `pagehide`. Found on the next boot, it means the last session ended abnormally (an iOS reload), and the readout says so.

### 2.3 Budgets (Discover's own; the desktop caps stay as they are)

| Budget | Value | Measured by |
|---|---|---|
| First load to the start card (brotli, as `vite preview` serves) | ≤ 1.85 MB (desktop title cap 1.75 + Discover chunk) | `discover-check --only load` |
| Discover chunks | core + tour + content ≤ 60 KB; viewer + robots.gen ≤ 30 KB; film ≤ 10 KB | same, from the chunk graph |
| Start card on 4G (9 Mbit/s, 85 ms) with 4× CPU | ≤ 6 s; „Los“ (stop-1 areas ready) ≤ 12 s | Pixel profile |
| Full tour without viewer / per viewer robot | ≤ 6.5 MB / ≤ 420 KB (existing robot cap); 0 MuJoCo bytes; 0 third-party requests | same |
| Shader programs | ≤ 150 at the start card; 0 links in a frame during flights (each stop's pre-roll compiles first) | `perf` scenario (INSTRUMENT `link` counter) |
| Frame, Pixel 7 profile, Chromium, 4× CPU (indicative) | JS p90 ≤ 12 ms while dwelling, ≤ 16 ms in flight; 0 frames > 50 ms while dwelling, ≤ 2 on arrival; ≤ 4 MB texture upload per frame | `perf` scenario |
| Draws / triangles per stop | ≤ 220 main-pass / ≤ 0.9 M; viewer ≤ 60 | `renderInfo()` at each stop |
| Memory (desktop, after GC) | JS heap ≤ 90 MB after tour + 5 viewer robots + film; estimated GPU ≤ 300 MB; second lap ≤ +5 % | `memory` scenario |
| **Real phone (founder)** | p90 frame ≤ 40 ms (≥ 25 fps) at every stop; start card ≤ 10 s on mobile data; **no reload** across benchmark + viewer (5 robots) + film | `?discover=1&perf=1&bench=1` |

### 2.4 How to measure
- **On the desktop (indicative only; the desktop GPU predicts nothing):**
  - `node tools/discover-check.mjs --only perf,memory --devices pixel7,iphone15`
  - Pixel 7 profile: Chromium, 412×915 @ 2.625, touch, `cpuThrottle(page, 4)` (`--cpu 6` as a low-end proxy), network 9 Mbit/s and 85 ms.
  - iPhone 15 profile: WebKit (`launchEngine('webkit')`, no CPU throttle), 393×852 @ 3; it catches WebKit-only shader-compile and texture-upload stalls.
  - The build is production with `BASE_PATH=/academy-world/`, served under that prefix.
  - Each stop: `discover:goto`, dwell 4 s, `record()`; flights are recorded on their own.
- **Real phone:** the readout (`&perf=1`) is a small tap-to-collapse panel. It shows:
  - fps, frame p50/p90/p99 and JS ms
  - draws, triangles and programs
  - geometries and textures
  - estimated GPU MB and JS heap (or "n/a")
  - pixel ratio and drawing-buffer size
  - renderer string, tier and stop
  - the crash marker

  `&bench=1` runs the tour on its own (5 s per stop, then viewer × 3 robots, then the stills film) and shows a table with **„Kopieren“**, which copies JSON for the founder to paste into a message. Nothing is sent anywhere.

## 3. Content

### 3.1 Reuse without new claims
Text is copied, never retyped:
- **`tools/discover/content.mjs` (D1):** uses Vite's `ssrLoadModule` (as `tools/quest-derive.mjs` does) to read the sources named in `src/discover/tour/content.spec.ts`, which maps each card id to source module paths and keys. It writes `src/discover/data/content.gen.ts`, where every string carries a `from` provenance field.
- **`tools/discover/robots-data.mjs` (D2):** writes `src/discover/data/robots.gen.ts` from `HALL_ROBOTS` and `sheet()` (kind, can, size, payload with its condition, source with „Stand 17.10.2026“, the model and licence rows, `amber`). Amber entries go into an `AMBER_ROBOTS` export that is only reached under the amber switch, so the bundler drops them when it is off.
- **Drift check:** both tools have `--check`, which regenerates in memory and fails on any difference.
- **Why generated files:** importing zone files from the Discover chunk would split the desktop Schauhalle and zone chunks.
- **New text is only UI chrome:** buttons, step labels, share text. The share text reuses `core.start.subtitle`, `core.start.touch` and the `core.start.*.time` estimates.

### 3.2 Tour (12 stops, D1 `src/discover/tour/stops.ts`)

| # | id | Areas (code) | Pose / path source | Card text source |
|---|---|---|---|---|
| 1 | `dock` | — | `outsideCamera('C1', 0, 24)` (drone R-3 WSW of the dock); start card orbits on `ATTRACT_CAMERA` | `core.start.kicker`, `core.brand.tagline`, `core.start.subtitle`; liftoff `L.capFalling`/`L.capCatching` |
| 2 | `brueckenkopf` | — | `REVIER.spawn` (0, 0, 114), yaw 0, pitch +6 (= view `bridgehead`) | `START.bridgePlaqueTitle`/`bridgePlaque` + FIKTION (`world/start/strings.ts`) |
| 3 | `libelle` | — | view `plaza` (0, 0, 30); orbit target `LIBELLE.center` | `START.libelleAsk`, `libelleGround`, `libelleFiktion` |
| 4 | `zonen-west` (01 + 06) | sensordom, prueffeld | polar(240, 76), y 18, outside both plots | manifests (title, eyebrow, verb) + one banner `lesson` each (`zone.<id>…lesson`) |
| 5 | `zonen-nord` (02 + 03) | regelgarten, greifwerkstatt | above the hall's south end, (0, 25, −40), looking N | lessons + Greifwerkstatt C UR5e plaque (RELEASE §5) |
| 6 | `schauhalle` | schauhalle | view `schauhalle` (0, 0, −56) facing N; `via` the south door | hall eyebrow, entrance disclaimer, lesson „Die Zahl allein reicht nicht. Die Bedingung entscheidet.“, `wall.line`; CTA „Roboter ansehen“ opens the viewer |
| 7 | `zonen-ost` (04 + 05) | lern-dojo, dunkelfabrik | polar(120, 76), y 18 | lessons (e.g. „Erst die Daten prüfen, dann trainieren.“) |
| 8 | `ausguck` | — (region far) | view `ausguck` (polar(258, 11), y 44.05, yaw −258, pitch −8) | liftoff `L.pit` („Da unten war eine Grube …“, D43) |
| 9 | `grubenrand` | — | orbit around `LANDMARKS.grubenrand` (−195, 0, 88) | `region.chronik.*` (FIKTION) |
| 10 | `sonnenacker` | sonnenacker | manifest spawn (east gate, facing W) | manifest `takeaway` + Sonnenacker B facts (Almería, Arizona: QUELLE per the register) |
| 11 | `traumhangar` | traumhangar | interior (manifest spawn) `via` the doors at bearing 312 | `takeaway` „Erst träumen, dann messen, dann handeln.“ |
| 12 | `abheben` | finale chunk | Ausguck console (the finale's `toConsole`) | the film (existing lift-off strings), then the end card |

**Flights** (`camera.flyTo`): a cubic Bézier between the two poses. The mid control point is raised to max(y0, y1) + 0.35 × distance (at least 70 m for island-wide hops), and points stay above `ctx.frames.heightAt + 15`. Interior stops add `via` door points with a straight last segment. Duration is clamp(distance / 60 m/s, 2.5, 6) s with ease-in-out and no roll. **Pre-roll** before each flight: `zones.initOne()` for the stop's areas, the observer pinned at the target until robots are ready or 3 s pass, then `rs.warmUp({ root })`, behind a small „lädt …“ chip.

### 3.3 Hotspots (D1 `tour/spots.ts`; robot cards come from D2)
- **Robots:** a tap ray-casts against meshes under any `robot:<id>` object in view. That covers Lern-Dojo, Greifwerkstatt and Sonnenacker SO-101s, the Traumhangar R1, G1, H1-2 and H2, and the hall plinths. It opens `handle.robots.card(id)` (D2). Amber robots are filtered out.
- **Spots** (world anchors from `layout.ts`):

  | Spot | Anchor | Card source |
  |---|---|---|
  | `turm` | `TOWER.sculpture.center` | Recamán plaque text (`landscape/numberline.ts`) |
  | `libelle` | — | `START.libelle*` |
  | `haltearme` | `TROCKENDOCK.arms` | `START.dock` |
  | `rotoren` | M1–M6 at polar(b, 80, −12) | manifest `systemLabel` + `ROTOR_LINE` |
  | `glasbalkon` | (0, 0, −92) | `START.balconyGround` |
  | `grubenrand` | — | `region.chronik` |
  | `kreislaufhof`, `unkrautacker` | far | manifest `takeaway` + Kreislaufhof card facts (UNITAR, RELEASE §5) |

  Each spot is `{ id, at, r, stops[] }`.

- **Markers:** teal DOM rings projected each frame; at most 6; hit area 44 px. Occlusion is checked at 5 Hz with `hud.labels.occlusionTest`. Every card also lists „Hier zu sehen“ chips, so screen-reader and imprecise taps work too.

### 3.4 Schauhalle viewer (D2, `src/discover/viewer/**`, lazy)
- **Studio:** the world groups are hidden while it is open, and it puts them back on close. It adds a cyclorama dome (r 14 m), a floor disc with existing materials, a turntable and a 0–2.5 m scale with 10 cm ticks (canvas, as in `groessenwand.ts`). The world's sun, hemisphere light, fog and environment map stay, so the robot programs are the warmed ones (0 links on open). The observer is pinned to the studio, so the shadow box follows.
- **Robot:**
  - `ctx.robots.load(id, { lod: 0, priority: 'now' })` then `untrack()`; at most 2 files parsed at a time.
  - Size references: „Du“ capsule 1.75 m and an EMI 1.55 m silhouette (Größenwand style), plus the model-measured height labelled MODELL.
  - Strings `wall.du`, `wall.line` and the hall's „Gemessen am 3D-Modell …“ line, all via `robots.gen.ts`.
- **Controls:**
  - Drag: orbit 360°, pitch −5…60°.
  - Pinch: 0.6–3 × the fit distance.
  - „Neben dir“ / „Nah“ framing toggle.
  - Category tabs GEHEN / GREIFEN & FAHREN / SELBST BAUEN, with a horizontal robot strip.
  - Sheet with kind, „Kann heute“, size, payload (with condition), source and date, model and licence (attribution is legally required).
  - The amber line „Herkunft der Geometrie wird rechtlich geprüft.“ only when the amber switch is on.
  - The turntable is still under reduced motion.
- **Amber:** use the predicate the BASE_PATH/VITE_AMBER agent exports. Only if none exists at integration, fall back to `import.meta.env.VITE_AMBER === '1'`.

## 4. UI

- **Gestures (Pointer Events, `touch-action: none` on `canvas#game` only):**
  - one finger: orbit or look within the rig's limits, with inertia (none under reduced motion)
  - pinch: zoom within limits
  - tap (≤ 250 ms, ≤ 10 px): pick a hotspot
  - double-tap: reset to the stop pose
  - on the sheet: vertical swipe changes its height, horizontal swipe on the collapsed sheet goes to the previous or next stop
  - desktop with `?discover=1`: mouse drag, wheel, click, ←/→ for stops, Esc closes the sheet
- **Portrait 360–430 px:**
  - Top bar, 48 px, inside the safe area: „3 / 12“ + stop title (one line) | DE·EN | ⋯ menu.
  - The menu holds: reduced motion, sound on/off, „Am Laptop spielen“, „Credits & Lizenzen“ (existing `openCredits()`), and „Messen“ when `perf` is on.
  - Bottom sheet, opaque `#1F1F1F` with the brand hairline, above `env(safe-area-inset-bottom)`:
    - **Peek** (~96 px): eyebrow, title, ‹ › buttons at 48 px.
    - **Half** (~45 %): body, chips, „Hier zu sehen“.
    - **Full** (~90 %): rows, sources, actions.
  - The 3D view keeps ≥ 55 % of the screen in peek and half.
- **Landscape (e.g. 844×390) and ≥ 900 px wide:** the sheet becomes a right side panel (max 360 px, full height); the top bar shrinks to 40 px.
- **Text:** body ≥ 16 px; rem-based, so browser zoom works; the DOM can still be pinch-zoomed. Every number sits in a block with a chip (the `.chip` contract from `Kit.chipElement`); card bodies are ≤ 35 words at half height (text-audit's console rule).
- **Share (D3 `film/share.ts`):**
  - The URL is `new URL(import.meta.env.BASE_URL, location.origin)`, without `discover`, so it respects `/academy-world/`.
  - First `navigator.share({ title, text, url })`.
  - On a non-`AbortError` failure, or when share is missing: `navigator.clipboard.writeText(url)` and a toast „Link kopiert“.
  - Otherwise: a read-only selectable URL field with „Kopieren“.
  - The URL is always shown in readable form.
  - Stop and robot links (`?discover=1&stop=` or `&robot=`) only once Discover is public (question 1).
- **Accessibility:**
  - Real buttons, ≥ 44×44 px, the 2 px focus ring.
  - The canvas is `aria-hidden`.
  - An `aria-live="polite"` line announces stop arrival.
  - The stop list is an `<ol>` with `aria-current="step"`.
  - The sheet is `role="region"` with a heading; it is not a modal trap.
  - Keyboard order: top bar → sheet → actions.
  - Only glyphs that are in `src/ui/fonts/subset.json` (`glyph-check --static`).
- **Reduced motion** (media query plus a menu toggle, both in memory):
  - flights become 0.4 s cross-fades (the `GLIDE.fadeS` pattern)
  - no inertia, no idle drift, no turntable spin
  - the film plays the director's stills version
  - all ramps are single and ≥ 0.4 s (photosensitivity)

## 5. Work packages

Protocol as in `PHASE7-PLAN.md` §6.1: branch `d/<wp>` off `phase7` in its own worktree; contract commit by day 2; every merge runs `node tools/gates.mjs --tier merge` plus the package's own commands. The integrator owns `tools/gates.mjs`, the docs and `vite.config.ts`.

### WP-D0 · Spike and foundation (first; ≈ 6 builder-days)
- **Owns:**
  - `index.html` (gate block, viewport meta)
  - `src/main.ts` (if needed)
  - `src/core/params.ts`
  - the discover seams in `src/core/Game.ts`
  - `src/core/RenderSystem.ts` (`setTier`, `frameBufferType`)
  - `src/systems/Progress.ts` (memory mode)
  - `src/core/zones/ZoneManager.ts` (`tierScale`, `setReachable` lock)
  - `src/discover/{index,types,tier,save,observer,camera,touch,perf,spike,strings}.ts`, `discover.css`, `src/discover/ui/**`
  - `tools/discover-check.mjs` (the runner; loads `tools/discover/<scenario>.mjs`)
  - `tools/lib/devices.mjs` (iPhone 15 / Pixel 7 profiles, network and CPU presets, sub-path serving)
  - `tools/discover/{gate,boot,storage,load,perf,memory,i18n}.mjs`
- **Provides:**
  - `DiscoverHandle` (§1.6), `CardSpec`, `TourStop`, the mode registry
  - the sheet, top bar and menu
  - the 3-stop `spike.ts` tour (dock, schauhalle, sonnenacker) with placeholder cards
  - the readout, the benchmark and the crash marker
- **Acceptance:**
  - `node tools/gates.mjs --tier merge`
  - `node tools/robust-check.mjs --only phone` (notice unchanged without the flag)
  - `node tools/warmup.mjs --table` (≤ 150)
  - `node tools/load-size.mjs` (desktop first load within +2 KB of rc5)
  - `node tools/a11y-keyboard.mjs`
  - `node tools/discover-check.mjs --only gate,boot,storage,load,perf,memory,i18n --devices pixel7,iphone15`
- **Exit:** a Pages deploy of the spike for the founder's phone run, which sets the real-phone numbers for §2.3. D1–D3 start at D0's contract commit and do not wait for that measurement.

### WP-D1 · Tour, spots and stop cards (≈ 5 days)
- **Owns:** `src/discover/tour/**` (stops, spots, markers, picking, flight choreography, stop-card renderer, „Hier zu sehen“, a11y list), `src/discover/data/content.gen.ts`, `tools/discover/content.mjs`, `tools/discover/tour.mjs`.
- **Uses:** the handle (camera, observer, sheet, gestures, `modes.register('tour')`); `handle.robots?.card` (D2) and `handle.share?` (D3), optional until they merge.
- **Registers:** `handle.stops`.
- **Acceptance:**
  - `node tools/discover/content.mjs --check`
  - `node tools/discover-check.mjs --only tour,perf --devices pixel7,iphone15`: all 12 stops reached by tap and by ←/→; every card's provenance resolves; chips on every number; ≤ 35 words at half height; 0 lobe `zone:enter`; 0 MuJoCo requests; portrait and landscape screenshots in `artifacts/discover/`
  - `node tools/glyph-check.mjs --static`
  - merge tier

### WP-D2 · Schauhalle viewer and robot cards (≈ 4 days)
- **Owns:** `src/discover/viewer/**`, `src/discover/data/robots.gen.ts`, `tools/discover/robots-data.mjs`, `tools/discover/viewer.mjs`.
- **Uses:** the handle and `modes.register('viewer')`.
- **Registers:** `handle.robots`.
- **Acceptance:**
  - `node tools/discover/robots-data.mjs --check`
  - `node tools/discover-check.mjs --only viewer,memory`: every non-amber robot opens (built without `VITE_AMBER`: the 4 amber ones are absent from the list, the hotspots and the bundle text); built with `VITE_AMBER=1`: present, with the amber line; 0 program links on open; ≤ 2 parsed files; ≤ 60 draws; licence row on every card
  - `node tools/hall-check.mjs --only cards`: the desktop hall is unchanged
  - merge tier

### WP-D3 · Film, share and end card (≈ 3 days)
- **Owns:**
  - `src/discover/film/**` (film mode, end card, `share.ts`)
  - the `'liftoff:replay' { stills }` and `'liftoff:skip'` listeners in `src/world/finale/lazy.ts`
  - the `stills` pass-through in `src/world/finale/index.ts` and `liftoff/director.ts`
  - `tools/discover/{film,share}.mjs`
- **Film flow:** set `cameraDriver = null` and `#hud.discover.film` → `'liftoff:replay'` → on `'flight:phase' { name: 'dusk' }` the end card („Am Laptop spielen“, „Nochmal ansehen“, „Zurück zur Tour“ → `quest.setFlight('ground')` → stop 1). „Überspringen“ sends `'liftoff:skip'`.
- **Registers:** `handle.share`.
- **Acceptance:**
  - `node tools/discover-check.mjs --only film,share`: the film reaches dusk, skip works, the island docks back, the stills version runs under reduced motion, the end card shows; share is called with the sub-path URL without `discover`; the clipboard and field fallbacks work
  - `node tools/liftoff-check.mjs` and `--rm` (desktop unchanged)
  - `node tools/flash-check.mjs --sequence liftoff`
  - `node tools/ending-check.mjs --lang de`
  - merge tier

Interfaces: D1, D2 and D3 talk only through the `DiscoverHandle` and events; no shared files.

## 6. Integration and acceptance

- **Merge order:** D0, then D1 → D2 → D3 (each rebased; D1 first because the tour hosts the entry points).
- **Integrator** adds to `tools/gates.mjs`:
  - **merge tier:** `discover-quick` = `node tools/discover-check.mjs --quick` (Pixel profile, Chromium; gate, boot, storage, 3 stops; ≤ 4 min) and the two `--check` generators
  - **wave tier:** `discover-full` = every scenario on `--devices pixel7,iphone15`, in builds with and without `VITE_AMBER=1`, all on `BASE_PATH=/academy-world/`
- **Discover smoke test** (`discover-check --quick`, also on its own):
  - production build with `BASE_PATH=/academy-world/`, served under that prefix
  - every request under the prefix; 0 third-party requests (as `tools/third-party.mjs`)
  - 0 console or page errors
  - localStorage identical before and after (seeded first with `tools/fixtures/saves/v2-present.json`)
  - start card → tour → 1 hotspot → viewer → film stills → share stub
  - iPhone 15 (WebKit; falls back to Chromium with a warning when WebKit is missing) and Pixel 7
  - touch through `page.touchscreen.tap` plus synthetic pointer drag and pinch in the page
- **Desktop stays green:** the full merge tier on every Discover merge, and the wave tier once on the integration head. Watch in particular: `load-size`, `warmup --table`, `gpu-ab --views plaza` (rc4 + 0.18 ms is known, D44), `hitches --browser webkit`, `memory-lap`, `playtest` (both modes), `robust-check`, `a11y-keyboard`, `deploy-check --preview`.
- **Founder protocol:**
  1. Open `https://<host>/academy-world/?discover=1&perf=1&bench=1` on the reference phones.
  2. Tap „Messen“ and wait about 3 minutes.
  3. Tap „Kopieren“ and paste the JSON to the lead.
  4. Then try the viewer and the film by hand and note any reload notice.
  5. Also run `node tools/deploy-check.mjs https://<host>/academy-world/` to check encodings (wasm and GLB).
- **Docs** (integrator): `ARCHITECTURE.md` §18 „Entdecken“ (seams, tier, budgets); `RELEASE.md` (Discover budgets and real-phone results); `DECISIONS.md` (the answers to §7).

## 7. Risks and open founder questions

**Risks (with the mitigation built into the plan):**
- **iOS memory:** the whole world plus robots may hit the tab limit. Mitigations: the pixel-ratio cap, no MuJoCo, robot caches, Kreislaufhof and Unkrautacker as impostors only. The crash marker detects it, and life or the finale preload can be cut as tier knobs.
- **Shader compiles on WebKit:** ~150 programs without parallel compile could stretch the boot. Measure in the spike; the tier already drops bloom and MSAA variants.
- **Half-float render targets:** some phone GPUs may not support them; the spike checks and falls back via `frameBufferType`.
- **Hosting compression:** GitHub Pages may not compress `.wasm` and `.glb` (Rapier is 3 MB uncompressed), so verify with `deploy-check` on the real URL.
- **Desktop regressions from `Game.ts` seams:** guarded by the discover-off rule and both gate tiers.

**Open founder questions (decisions only):**
1. **Who gets Discover?** After the spike passes, should touch-only devices land in Discover by default, replacing the mouse-and-keyboard notice? Or keep the notice and add an „Entdecken“ button (opt-in)? And should stop and robot links be shareable publicly?
2. **The lift-off film:** keep the real-time engine replay (no extra download, always the current look, automatic stills fallback on slow phones)? Or a pre-rendered video (smooth on every phone, about +4–6 MB, re-rendered whenever the look changes)?
3. **Device floor:** which phones must run Discover fully (for example iPhone 12 or newer on iOS 16.4+, and Pixel 6-class Android)? Below that, should Discover show the stills-only tour, or the notice?

### Critical files for implementation
- index.html
- src/core/Game.ts
- src/core/RenderSystem.ts
- src/core/zones/ZoneManager.ts
- src/world/finale/lazy.ts
- Also: src/systems/Progress.ts, src/zones/schauhalle/sheet.ts, src/zones/schauhalle/data/robots.ts, src/world/ground/camera.ts, tools/lib/views.mjs, tools/lib/measure.mjs