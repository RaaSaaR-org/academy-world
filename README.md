# EmAI Academy: Schwebewerk

*The Floating Works.* A first-person 3D browser game about robots, physics and Physical AI, set on a mechanical flying island. The island is a hexacopter that balances itself a thousand times a second: **the island is a robot, and you are standing on it.**

**Play online:** https://raasaar-org.github.io/academy-world/ (a desktop browser with mouse and keyboard; built from `main` by `.github/workflows/pages.yml`).

Two audiences, one world:

- **Entdecker** (explorers) learn how robots and physics work by *discovering and playing*: lift crates, switch sensors, balance a pole, crack an egg, teach a robot, carry a shift's worth of boxes.
- **Entscheider** (decision makers) see what Physical AI can do today and how to judge a robot honestly: every number comes with a condition, an n and an interval. *Messung statt Marketing.*

Both modes address the player with "du" and play the same world; Entscheider mode changes depth, pacing and outputs (Befundkarten, the nine-questions checklist), never the form of address.

Built with vanilla **three.js** (TypeScript strict), **Rapier** physics and **Vite**. No framework. Until rc4 there were no third-party models: geometry is built in code, sound is procedural WebAudio, and the only robots were EMI (the EmAI Rover, 1.55 m) and unbranded procedural machines ("Hersteller X"). Phase 7 adds real robots with their published 3D models (below).

## Phase 7 (rc5): as built

**What is new.** The island is now a flying machine that cannot fly yet: it sits in Trockendock 3 in the Revier, reclaimed open-cast mining land, and the whole world gets it airborne (D23). Three systems gate the lift-off: **Auftrieb** (the six main rotors, one per island zone's ◆ station), **Energie** (the Startakku, charged by the Sonnenacker's agrivoltaic farm) and **Navigation** (the Flugmodell, a world model trained in the Traumhangar). In Entscheider mode the Bodencrew supplies the last two, and a 2.5-minute „Schaufenster“ stop shows the real robots (D41).

- **Real robots** (D15): 25 published models (the SO-101 follower and leader, Open Duck Mini v2, LeKiwi, seven Unitree models, the rest of the Schauhalle's line-up; 20 in the public build, which leaves out the amber exhibits until the legal review clears them) through `ctx.robots`, with their licences on the credits page and in `dist/licenses/` and `THIRD-PARTY-NOTICES.txt`. Vendor values carry HERSTELLERANGABE with a date, values computed on the 3D model MODELL, world-model predictions TRAUM.
- **Changed stations:** Regelgarten C „Lauf, Ente!“ (64 Open Ducks learn to walk from your reward, real MuJoCo physics in a worker); Lern-Dojo A/B on the SO-101 leader and follower arms with language commands; Greifwerkstatt C „Lastdiagramm“ (the real SO-101's payload over reach; „200 Griffe“ is retired); a shorter Prüffeld C.
- **New areas:** Schauhalle Nord (an island hall with the real robots, datasheets, price bands, the Lastenheft and the Fundvitrine), the Revier with the Sonnenacker, the Traumhangar (R1, G1, H1-2 and the H2), the Kreislaufhof and the Unkrautacker scenes, ambient life and easter eggs for the Fundvitrine.
- **The finale** is the „Startprüfung“ (F1 Schwebetest, F2 audit, F3 recommendation), then a ≈ 100 s lift-off you fly with E, the dusk and the certificate (D24).
- **Saves:** format v2 under a new key; an rc4 save migrates and stays untouched as a backup (D38).

**Run.** As above: `npm install`, `npm run dev`, `npm run build`, `npm run preview`. The first load is 1.48 MB (cap 1.75 MB): area code loads after the title, ground areas once the Revier is open, a full playthrough ≈ 5.1 MB (`node tools/load-size.mjs --chunks`, wave 2). Decisions D15–D44 are in `docs/DECISIONS.md`, the plan in `docs/PHASE7-PLAN.md`, the facts register in `docs/RELEASE.md` §5 and the legal checklist in `docs/LEGAL-REVIEW.md`.

**Gate tiers** (`tools/gates.mjs`, plan §6.3; logs in `artifacts/phase7/gates/`):

| Tier | Command | Time | What runs |
|---|---|---|---|
| merge | `node tools/gates.mjs --tier merge` | ≈ 25–30 min | typecheck, `typecheck:zone` per touched area, build, load size, i18n, save migration, robots check (if `src/robots/**` changed), third-party requests, the DE Entdecker text audit, the draw ledger at the bridge head and the plaza, the quick playtest, and Discover's two text drift checks plus its phone smoke test (`discover-check --quick`) |
| wave (and nightly) | `node tools/gates.mjs --tier wave` | ≈ 2–3 h | the merge tier plus the full playtests (incl. an rc4 save), perf high and low, perf-cpu at 4×, the GPU A/B against rc4, hitches (Chromium and WebKit), warm-up, memory lap, the lift-off checks, flash-check, onboarding, ending, the four `text-audit --chips` runs, glyphs, watch and secret audits, a11y, contrast, audio, idle render, robustness, MuJoCo, chunks, the load matrix and deploy-check; every Discover scenario on both phone profiles, without and with the amber exhibits |
| selftest | `node tools/gates.mjs --tier selftest` | ≈ 5 min | each gate tool must catch its seeded miss |

`--only id,id`, `--skip id,id` and `--dry` narrow a run. Known misses for rc5 are listed in `docs/RELEASE.md` §3.

## Auf dem Handy („Entdecken“)

On a phone you can look around the island and learn about it: a guided tour of 12 stops with info cards, the Schauhalle's robots in a 3D size viewer (next to you and EMI), the lift-off as a film, and a button to share the link. Playing (walking, stations, stars) stays on a desktop with mouse and keyboard. Weaker phones get the same tour with pictures instead of the 3D world.

For now it opens only with `?discover=1`; phones without it still see the „needs mouse and keyboard“ notice. Once the real-phone test passes, touch-only phones land in it by default (D45; one line, `DISCOVER_DEFAULT_ON_TOUCH` in `src/discover/flags.ts`).

**Phone test link:** https://raasaar-org.github.io/academy-world/?discover=1&perf=1&bench=1 (tap „Messen“, wait about 3 minutes, tap „Kopieren“; the steps are in `docs/RELEASE.md` §7c). Without `&perf=1&bench=1` it is the plain tour; `&stills=1` forces the picture tour. Nothing outlives the browser session (no save, no localStorage) and nothing is sent anywhere. How it is built: `docs/ARCHITECTURE.md` §18.

## What you play

| | Zone | You do | You measure (◆ = core station for decision makers) |
|---|---|---|---|
| 01 | **Sensordom** · SEHEN | Wear EMI's sensor visor (RGB, depth, LiDAR, segmentation), find a LiDAR-only way through a dark room with glass and a mirror | ◆ Depth noise over distance: σ grows with z² |
| 02 | **Regelgarten** · REGELN | Balance a pole by hand on Earth, Mars and the Moon | ◆ Controller and loop rate: when does 10 Hz fall? Then train a policy in 256 wrong worlds and transfer it |
| 03 | **Greifwerkstatt** · GREIFEN | Thread rings with a 3-joint arm (joints, then inverse kinematics), grip an egg without a force sensor | ◆ 200 grasps: camera-only vs. tactile, with a Wilson band |
| 04 | **Lern-Dojo** · LERNEN | Demonstrate a push task five times | ◆ The imitation policy copies you, fails under distribution shift, recovers with two new demos; then audit a dataset |
| 05 | **Dunkelfabrik** · ARBEITEN | Carry 18 kg crates at 41 °C for a minute; see who retires from the shift roster | ◆ Lights out: how much of a night shift runs without a person, and what limits it |
| 06 | **Prüffeld** · MESSEN | Ask a vendor's "100 %" demo the nine questions | ◆ Push the mobile measuring cell under real load: 69 % ± 6 %, not 100 %; then agree on a rule with two auditors (κ) |
| — | **Kielraum** (finale) | Hold the island by hand (F1), audit the vendor's "99 % stabil" controller over 400 gust trials (F2), sign a recommendation with your own numbers (F3) | Then ride to the lookout at dusk and take your certificate |

Each zone follows the three-stamp arc *Probieren → Verstehen → Messen*: 18 stamps in the Academy Pass, each holding *your* measured value and a mini curve. The keel lift opens once four zones have a stamp.

**The game layer.** Every station is a challenge with up to three stars (★ = the stamp, ★★ and ★★★ = harder goals such as a time, a streak or a correct prediction), a personal best and an instant retry (R). A result banner shows your value, the goals, a one-line lesson and „Linie n/18 für den Turm“: each earned stamp makes a robot arm on the Akademie-Turm draw one line of the EmAI mark with a laser, so the tower shows your progress from anywhere on the island. Twelve Sensorkapseln are hidden on the island and in the zones; each lights a position light on the rim, and all twelve open the Turmsprung to the lookout. EMI-01 comments over the radio and learns one skill per zone. Stars rate your play and method, never a robot; there are no leaderboards. The **Prognose-Güte** still measures how well your predictions matched your own measurements.

**The look.** The island is a flying machine: a white ceramic deck with low PV tracker rows that follow the sun, cooling intakes, measuring masts, service rovers in painted lanes, maintenance drones on their docks and data packets that run along the light channels into the tower; a white lattice tower that holds a planar Recamán relief on a gimbal-mounted dial (collar, yoke and pivots), the exact EmAI mark from every front view, drawn line by line as you earn stamps. Below the deck, the Kielraum is a dark control room around the white gimbal.

## Controls

| | |
|---|---|
| Move / look | W A S D / mouse (pointer lock); ← → turn and ↑ ↓ walk without a mouse |
| Sprint / jump | Shift / Space |
| Use, talk, launch a jump pad | E or left click (only E launches a pad) |
| Grab (hold) / throw / hold distance | F or right mouse / left click while holding / mouse wheel (shown only while something on the island is grabbable) |
| After a result | R retry · H why (the station's card) · Enter close (the banner stays until you act) |
| Station keys | 1–6 and the letters shown on screen (e.g. visor modes, distances); R always means retry or reset (a run with progress asks once), Space starts a station's own action (measure, stand the pendulum up, take over, new demo) |
| Academy Pass / map | Tab / M (Esc or E closes the Pass; its „Funk-Log“ tab lists EMI's last 20 lines) |
| Ask EMI / overlays | H / O |
| Next subtitle line | Enter (with no line on screen: EMI's last line again) |
| Leave operate mode, menu | Esc (settings, sound and text size, controls, language, mode, reduced motion, quality) |
| Debug overlay | F3 or the key left of 1 (with `?debug=1`) |

The menus work with the keyboard alone (Tab, arrows, Enter). The first visit starts in English when the browser is not set to German („Deutsch · English“ switches; DECISIONS D12). A returning visitor who has seen the ascent once starts at the gate of the zone entered last („Weiter im …“); „Anflug ansehen“ on the title plays the ascent again (D13). The pause menu's „Ton & Text“ tab has three volumes (atmosphere and music, effects, EMI) and a text size of 100 / 125 / 150 % for the subtitles and the HUD (D14).

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # typecheck + production build → dist/ (with .br / .gz next to every text file)
npm run preview      # serve dist/ like the production host (precompressed files, cache headers)
```

Requirements: Node ≥ 20 and a WebGL2 desktop browser: Chrome or Edge 94+, Firefox 108+, Safari 16.4+ (three.js uses class static blocks; the build loads its chunks through an import map). A check in `index.html` tells older browsers, browsers without WebGL2 and touch-only devices so before the game downloads. The production build is static (`dist/`) and can be hosted anywhere. It ships **no sourcemaps** (`SOURCEMAP=1 npm run build` writes hidden maps for symbolicating error reports; keep them out of the deployed folder).

First load (measured with `node tools/load-size.mjs` on rc4, brotli as a CDN serves it): **1.68 MB transferred** (5.65 MB uncompressed) in 31 requests: Rapier WebAssembly 0.81 MB, JavaScript 0.65 MB (all six zones included), fonts 0.20 MB (subset to the characters the game uses), CSS 9 KB. No request goes to another server. The start screen is ready after ≈ 2.2 s at 16 Mbit/s / 40 ms RTT (rc3: 1.90 MB, 2.7 s); `npm run preview` sends the same 1.68 MB (rc3: 4.15 MB).

`node tools/load-matrix.mjs` (CDN-like HTTP/2 server, median of 3, rc4): the loading screen shows after 0.05 s on cable, 0.12 s on 4G and 0.2 s on slow 4G; the title after 1.0 s on cable (2.3 s with a 4× slower processor), 2.5 s on 4G and 9.7 s on slow 4G. A phone gets its "needs mouse and keyboard" notice after 0.2 s and 4 KB, a browser without WebGL2 its message after 6 KB, before the game downloads (`node tools/robust-check.mjs`).

Hosting:
- `npm run build` writes a brotli (`.br`, quality 11) and a gzip (`.gz`) copy next to every `.js`, `.css`, `.wasm`, `.svg`, `.html` and `.json` file. Let the host serve those by `Accept-Encoding` with `Content-Encoding: br` / `gzip` (nginx: `brotli_static on; gzip_static on;`, Caddy: `file_server { precompressed br gzip }`), or let it compress on the fly. The fonts are WOFF/WOFF2 and are already compressed.
- `dist/assets/*` have content hashes: serve them with `Cache-Control: public, max-age=31536000, immutable`; serve `index.html` (it carries the chunk import map) and the other unhashed files with `no-cache`.
- Serve `.wasm` as `application/wasm` (streaming compilation; otherwise the browser falls back to a slower path with a console warning).
- Check a deployment with `node tools/deploy-check.mjs https://<host>/`: encodings, content types and cache headers of `index.html` and every asset the title needs. `npm run preview` passes it (`node tools/deploy-check.mjs --preview`).
- three.js, postprocessing and troika live in their own chunk (`vendor-three-<hash>.js`), and chunks import each other through the import map, so a deploy that changes one zone changes only that zone's chunk and `index.html`: a returning visitor downloads ≈ 0.04 MB.
- A sub-path: `BASE_PATH=/academy-world/ npm run build` builds for `https://<host>/academy-world/` (the GitHub Pages workflow does this; default `/`). Every runtime URL goes through `import.meta.env.BASE_URL`.
- The amber exhibits (`docs/LEGAL-REVIEW.md` item 2: Spot, MiR250, KUKA LBR iiwa 14, Robotiq 2F-85) are left out of the build unless `VITE_AMBER=1` is set (`src/core/release.ts`): no plinth, card or line-up entry, no GLB in `dist/`, no entry in the credits or the notices.
- GitHub Pages sets its own headers (`Cache-Control: max-age=600`, compression on the fly), so the immutable caching and the precompressed files above do not apply there.

## Test

```bash
npm run typecheck                         # whole project
npm run typecheck:zone -- <zone-id>       # engine + one zone
npm run shot -- --url "/?zone=sensordom&skipIntro=1" --out artifacts/shots/sensordom.png   # screenshot + health JSON
npm run shots:all                         # hub + every zone → artifacts/shots/
npm run playtest -- --lang de --mode entdecker   # full route on the production build (≈ 4 min)
npm run perf -- --quality high            # fps, CPU ms, draw calls, triangles at 70+ views
node tools/audio-levels.mjs               # peak / RMS / HF of every global sound (headless, muted)
node tools/load-size.mjs                  # first-load bytes and time to the start screen
node tools/onboarding-run.mjs             # real keyboard input: Start → first zone, timed
node tools/ending-check.mjs               # the world after the finale, across reloads
node tools/text-audit.mjs --lang de --mode entscheider   # card lengths, cards that scroll at 1280×720, long EMI lines
node tools/gallery.mjs                    # release screenshots → artifacts/release/
node tools/brand-check.mjs                # the tower mark's brand colours from the Messpunkt (pixel test)
```

Measurements (each tool starts its own server: a private production build for the timings, a dev server for the UI checks; `--dist <dir>`, `--dev` or `--base <url>` choose another. Timings are the median of 3 runs; exit code 1 when a target of the phase 6 plan is missed; `--dist a=<dir> --dist b=<dir>` compares two builds in one run):

```bash
node tools/load-matrix.mjs     # first paint, title, can-move, long tasks, bytes, third-party requests: cable / 4G / slow 4G × CPU 1× / 4×
node tools/warmup.mjs          # shader programs at the title, frames drawn behind the loading screen, first visible frame
node tools/perf-cpu.mjs        # JS ms per frame and fps at 4× / 6× CPU (spawn, plaza, zones)
node tools/drawcalls.mjs       # main-pass draws by world module and zone tier (also part of npm run perf)
node tools/progdiag.mjs        # shader re-validations (getParameters) per frame by material
node tools/auto-quality.mjs    # quality "auto" at 10× CPU, cost of a manual switch
node tools/gpu-ab.mjs          # GPU frame ms with vsync off at 3840×2160
node tools/hitches.mjs         # long frames, late shader compiles and texture spikes on a first lap (≈ 4 min per run)
node tools/idle-render.mjs     # work while paused, behind the Pass and on the start screen
node tools/dialogue-modal.mjs  # EMI lines and game time behind full-screen panels
node tools/a11y-keyboard.mjs   # keyboard path through title, pause, Pass and map; focus ring (--browsers chromium,firefox,webkit)
node tools/contrast.mjs        # WCAG contrast of every HUD text over the live scene
node tools/third-party.mjs     # requests to other origins; 3D text with other origins blocked
node tools/robust-check.mjs    # phone notice, no WebGL2, context loss, wasm or zone chunk failing
node tools/glyph-check.mjs     # every displayed character in its font; 3D-text glyphs that need the self-hosted fallback
node tools/deploy-check.mjs <url>   # encodings, content types and cache headers of a deployment
```

`node tools/subset-fonts.mjs --python <venv>/bin/python` rebuilds the font subsets in `src/ui/fonts/` from the full originals in `src/ui/fonts/full/` after a new character appears in the strings (`glyph-check` says when). It needs fontTools with brotli and zopfli in a Python venv outside the project.

Release status, what still needs a human, and the facts register: [`docs/RELEASE.md`](docs/RELEASE.md). Founder decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md). The Phase 6 fix plan with its status column: [`docs/PHASE6-PLAN.md`](docs/PHASE6-PLAN.md). Terms and house style: [`docs/GLOSSARY.md`](docs/GLOSSARY.md).

- The shot tools start their own Vite server on a free port and use Playwright Chromium (`npx playwright install chromium` if missing). Exit code 1 on console errors, page errors or zone errors. Read the PNGs.
- `playtest` builds a private copy of the bundle, plays onboarding → all six zones (debug solve hooks) → KIEL lift → F1–F3 → dusk ending → certificate, and fails on errors, missing stamps, HUD cards leaking out of a zone or an unfinished finale.
- `perf` fails when a view breaks the GDD budget (500 draw calls / 1.5 M triangles) or drops below 55 fps.

### URL parameters

| Parameter | Effect |
|---|---|
| `?skipIntro=1` | No start screen, no ascent |
| `?zone=<id>` | Spawn at a zone's gate |
| `?only=<id>[,<id>]` | Load only these zones |
| `?lang=en` / `?mode=entscheider` / `?quality=low\|medium\|high` | Language / audience / quality preset |
| `?debug=1` | Stats (fps, CPU ms, draw calls), colliders, triggers |
| `?pos=x,y,z&look=yaw,pitch` | Exact position and view |
| `?dev=1` | Also load dev zones (`_example`) |
| `?mute=1` / `?reset=1` / `?world=0` | Start muted / wipe progress / skip the island module |
| `?mergeab=1` | Keep the island's unmerged meshes for a same-frame A/B: `__academy.solve('world', 'static-ab')` swaps them in and switches the culls off (docs/ARCHITECTURE.md §6) |

In the browser console, `window.__academy` drives the game: `state()`, `teleport()`, `look()`, `interact()`, `solve(zone, hook)`, `pass()`, `renderInfo()`, `audioMeter()` and more (docs/ARCHITECTURE.md §13).

## Project structure

```
src/core      engine: loop, renderer + grade, environment (sky, cloud sea, fog), physics, zone API, brand, EMI kit
src/systems   player, interaction, grab, audio, progress (Academy Pass), lights, game layer (ctx.game: challenges,
              stars, banner, juice, Sensorkapseln, EMI skills)
src/ui        HUD (brand DOM overlay), modals, Pass, map, measurement kit (chips, Kennlinie, predict)
src/world     the island: deck, hub tower (src/world/tower: lattice tower, Recamán sculpture, drawing arm),
              deck features (src/world/landscape), underside machinery, onboarding, EMI-01 radio, jump pads,
              lift, dusk, and src/world/finale (the Kielraum: F1–F3, „Ein Jahr später“, ending, certificate)
src/zones     one folder per zone (src/zones/<id>/index.ts); _example is the dev-only reference zone
public/       favicon, brand SVGs (fonts live in src/ui/fonts: WOFF for the six faces the 3D text needs, WOFF2 for the rest)
docs/         DECISIONS.md (founder decisions, override everything), GDD.md (design), ARCHITECTURE.md (engine API),
              GLOSSARY.md (terms DE/EN, house style), RELEASE.md (release checklist, facts register)
tools/        shot.mjs, shots-all.mjs, playtest.mjs, perf.mjs, text-audit.mjs, typecheck-zone.mjs, audio-levels.mjs, …
```

**Building or changing a zone?** Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and copy patterns from `src/zones/_example/` (open `/?zone=_example&dev=1&skipIntro=1`).

## Honesty rules (in code and copy)

- Every number on screen carries one source chip: `SIM · LIVE`, `STUDIE`, `QUELLE`, `RICHTWERT`, `ILLUSTRATIV` or `FIKTION`. The island, Station 7, Hersteller X and NN-Lage v2 are fiction; the control loops behind them are real.
- No customer names, no prices, no pass/fail stamps: curves and intervals instead.
- No third-party robots or look-alikes (DECISIONS D2) and no robot-vendor brand names in player-facing text (D6); historical facts are anonymised and sourced. Say "kognitiver Roboter", never "humanoid".

## Licences

- Fonts: Space Grotesk and Geist / Geist Mono, SIL Open Font License 1.1 (`LICENSES/OFL-1.1.txt`); the game ships subsets of them (no Reserved Font Names apply).
- Robot models (`src/robots/glb/`): third-party 3D models, each under its own licence; the texts are in `LICENSES/robots/` and the build's `THIRD-PARTY-NOTICES.txt` lists every shipped model.
- EmAI brand assets © EmAI. Everything else in this repository is EmAI's own work.
