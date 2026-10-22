# Phase 6 fix plan: performance and usability

## Status after the fix round (release candidate 4, verify stage, 2026-10-15)

Measured by the verify stage on a quiet machine, rc3 (`a0ed8fc`, `snapshot-rc3`) and rc4 back to back, medians of 3 (details and the full before → after table: `docs/RELEASE.md` §1 and §4). Done = the acceptance check passes; partial = the change landed but a target or a human check is still open.

| Item | Status | Evidence (rc3 → rc4) |
|---|---|---|
| C1 third-party requests | Done | 5 → 0 requests to other origins (DE and EN, title + hub + 6 zones); σ renders with other origins blocked |
| C2 shader warm-up | Partial | programs at the title 219 → 132 (tool target ≤ 130; the 2 extra are cloud variants compiled on purpose); frames behind the loading screen 8 → 1 (1×), 15 → 1 (4×); first visible frame 5.3 → 2.9 ms (1×), 19.2 → 11.3 ms (4×). programs linked during a first lap 7 → 6 (hitches, target 0) |
| C3 mouse capture + hint | Done (human check open) | hint logic checked headless in three engines; first-click capture in real Safari / Firefox is RELEASE §2 |
| C4 time stands still behind panels | Done | dialogue-modal 0/9 → 9/9: line 1 still on screen after 10 s of Pass / map; game time +5 s / +4.02 s → 0 / 0 |
| C5 keyboard + focus | Done (screen reader open) | a11y-keyboard 4/14 → 14/14 in Chromium, Firefox and WebKit; focus ring 0:1 → 16.9–17:1 |
| C6 result banner stays | Done | lanes: 7.2 s → stays ≥ 24 s, closes on Enter / 4 m walk; both playtests pass |
| C7 readable HUD | Done | contrast: 84 → 0 texts under 18 px below 4.5:1; compass 1.02 → 5.27:1; EN switch 1.17 → 6.64:1 |
| C8 shell + pre-boot gate | Done | first paint slow 4G 0.74 → 0.20 s, 4G 0.36 → 0.12 s; phone notice 14.3 s / 1900 KB → 0.22 s / 3.8 KB; no WebGL2 455 → 5.6 KB |
| C9 render only on change | Done | paused and Pass 900 → 0 render calls/s (JS 1.9–2.2 → 0 ms); title 900 → 420; reduced-motion attract camera 5.7 → 0 m/s |
| C10 post chain + auto | Partial | GPU 3840×2160 plaza 6.28 → 4.43 ms, clouds 8.51 → 6.85 ms; auto at 10× CPU 2 preset changes / 600 ms freeze → 0 / 33 ms; manual switch to low 233 → 17 ms. Open: MSAA 2× at DPR 1.5 (plan 0×, decided), thresholds untuned on an iGPU laptop (human) |
| C11 engine CPU | Partial | 4× CPU js50 spawn 9.8 → 6.4 ms, plaza 8.1 → 5.8 ms (targets ≤ 8.4 / 7.8 met); getParameters plaza 28 → 8, Dunkelfabrik 16 → 2 (target ≤ 2 at the plaza missed: two-pass curved glass kept on purpose, the beacon) |
| C12 robustness | Done | context loss: frames while lost 60 → 0, overlay, „Neu laden“ after 5.1 s; wasm blocked: retry button → title; zone toast names „Sensordom / Sensor Dome“; reset and stale chip (lanes) |
| C13 faster boot | Done | title (CDN) cable 1.86 → 1.00 s, cable 4× 4.53 → 2.30 s, 4G 3.67 → 2.53 s; long tasks > 250 ms before the title 2 → 0 (1×), 4 → 0 (4×) |
| W1 world draws | Done | world draws spawn 194 → 86, plaza 189 → 91; all at the plaza 274 → 148; Firefox plaza cpuMs 3.12 → 2.25 ms |
| W2 movement card | Done | onboarding-run checks it (walk + turn, idle return) |
| W3 gust result in view | Done | lanes: readout 19.6°, ball 15–26° from the view centre (was 88° / 49°) |
| W4 Pass toast after EMI | Done | `dialogue:idle`; onboarding-run order checked |
| W5 jump pad beacon | Done (brand look open) | lanes; beacon ΔE ≥ 30 under simulated deuteranopia / protanopia |
| W6 lighter world boot | Done | longest task before the title at 4× 1540 → 230 ms; world chunk −32.8 KB brotli (lazy finale) |
| W7 certificate | Done | lanes: no „…“, no „Ohne Namen“, labelled field, aria |
| W8 finale spikes | Done | lanes: F2 longest frame at 6× ≈ 970 → 33 ms; F3 upload 10.4 → 3.5 MB per frame (Messwand keeps its mipmaps) |
| Z1 zone draws | Partial | zones at the spawn 88 → 52 (≤ 50 missed, 3 are EMI's); Regelgarten 39 → 29, Greifwerkstatt 35 → 17 (≤ 10 missed; a mid tier needs an art decision) |
| Z2 Sensordom A | Done (star rule awaits the founder) | E in a view that cannot see the object: no miss, no clock, no [E] key cap |
| Z3 one meaning per key | Done (human check open) | R = retry / reset only; Space for station actions |
| B1 precompressed | Done | `npm run preview`: 4.15 → 1.68 MB, slow-4G title 23.95 → 9.73 s; deploy-check 10/10 |
| B2 font subsets | Done | fonts 456 → 199 KB at the title (lanes); glyph-check 5/5 |
| B3 tools | Done | 15 tools + deploy-check, subset-fonts; Firefox / WebKit via FIREFOX_EXE / WEBKIT_EXE |
| B4 vendor chunk | Done | `vendor-three`; zone-only deploy 0.64 → 0.04 MB (lanes; needs Firefox 108+, gate added) |
| B5 README | Done | numbers re-measured on rc4 by the verify stage |
| Later done in this round | Done | Funk-Log, UX-16 („näher ran“), UX-23 (plaza + „Spielmodus“), UXA-12, PERF-09 rest, PERF-12, PT-08 (map icon), PT-13, PT-16, PT-18, PT-21, PT-23, PT-24, PT-27, **UXA-15** (verify stage: not a shadow, a z-fight on the Libelle plinth top; fixed) |
| Later still open | Open | UX-17, UX-18 / UXA-13, UX-19 / UXA-09 rest, EMI-01 merge, PL-08 step 2, PT-11, PT-19 |

---

Lead engineer plan, 2026-10-15. Code state: HEAD `583add1` (rc3 integration). Inputs: the four phase 6 audits (`perf-runtime`, `perf-load`, `ux-heuristic`, `ux-browsers-a11y`). Their evidence is in `artifacts/phase6/*/`. None of them could write a REPORT.md, so their finding IDs (PERF-, PL-, UX-, UXA-) are the reference. `artifacts/phase5/playtest/REPORT.md` does not exist; the open phase 5 playtest items (PT-xx) come from the rc3 release draft and appear only under "Later".

## 1. Summary for the founder

- **On a fast computer (our M5 Pro test machine)** the game is smooth: 60 fps everywhere, about 3 ms of work per frame, and no memory growth over two full laps.
- **On a typical office laptop** (an estimate: a 3–4× slower processor and built-in graphics; no real one has been tested yet), the island hub sits right at the limit. A frame takes 15–16 ms of the 16.7 ms it may use; the zones have room. At 6× slower the hub drops to 33–38 fps, and the quality setting cannot help. The slow part is the processor sending about 340 separate draw calls per frame, not the graphics chip. Firefox needs twice the processor time of Chrome.
- **Loading:** the title screen appears after 2.4 s on cable, 4.1 s on 4G and 12.3 s on slow mobile internet. On cable with a 4× slower processor it takes 6.6 s. On slow mobile the page stays blank for the first 2.7 s.
- **The biggest usability problems:**
  - **The first two minutes.** The "how to walk" hint shows once for 7 s. One key press hides the "click to look around" hint. The first experiment's result appears outside the player's view.
  - **Things keep running behind panels.** EMI keeps talking behind the Pass and the map, so players miss the only route explanation. Challenge clocks keep counting too.
  - **Messages vanish.** The result banner closes after 7 s. A missed EMI line cannot be read again.
  - **Text is hard to read.** The compass, the small grey labels and the EN switch are at 1.0–3.9:1 contrast; the accessibility standard (WCAG AA) asks for 4.5:1.
  - **Keyboard-only and screen-reader visitors cannot use any menu.**
- **One legal item:** every visit sends the visitor's IP address to a third-party font server (jsdelivr) without consent. The fix is cheap and should land before any public link.
- **Expected result of this plan:** on slow mobile the first picture appears in under 0.8 s instead of 2.7 s. On a slow laptop the title screen comes after about 4.5 s instead of 6.6 s, and the hub takes about 11 ms per frame instead of 15–16 ms. Three decisions for you are in section 4.

## 2. What I checked, merged and dropped

**Spot checks on HEAD 583add1** (dev server, Chromium; scripts in `<scratchpad>/phase6-plan/verify.mjs` and `verify2.mjs`):
- **PL-04/UXA-05 confirmed.** A plain load to the title makes 5 requests to `cdn.jsdelivr.net/gh/lojjic/unicode-font-resolver`.
- **PERF-05 confirmed.** The renderer makes 900 render calls per second while paused, exactly as many as while playing.
- **PL-01 confirmed.** There are 219 shader programs at the title on high. 106 of them are built for sRGB canvas output (the `compileAsync` path) and 113 for the composer's linear target. 194 programs come in pairs that differ only in the output colour space. On high the canvas set is never used.
- I re-read every P1 file:line at HEAD. After `0acfc89`, the lines in `Game.ts` moved down by about 7. This plan uses the HEAD numbers.

**Fixed since the audits?** The UX audits ran from 16:10 to 16:46, before the rc3 integration commits (17:32).
- `0acfc89` made the whole gust column the interactable (PT-14) and moved the banner above the subtitle (PT-05).
- Neither change closes a phase 6 finding. The gust readout is still 88° off-axis from the stand point (UX-06; I checked the geometry against `onboarding.ts:100-103` and `:355`). The banner still closes after 7 s (`ResultUi.ts:153`).
- So no finding was dropped as fixed.

**Duplicates merged:**

| Topic | Merged IDs | Plan item |
|---|---|---|
| Third-party font server | PL-04, UXA-05 | C1 |
| Shader compile, hidden loading frames, late compiles | PL-01, PERF-09 (shader part) | C2 |
| Pointer lock and capture hint | UXA-07, UX-02 | C3 |
| EMI and clocks behind panels | UX-03, UXA-06, UX-08 | C4, W4 |
| Keyboard access, focus ring, help key | UX-09, UXA-01, UXA-02, UX-15 | C5, W2 |
| HUD contrast | UX-10, UXA-03, UX-04 (contrast part) | C7 |
| Shell and pre-boot checks | PL-02, PL-06, UXA-08 | C8, B5 |
| Rendering while paused, attract camera | PERF-05, UXA-11 | C9 |
| Post chain, adaptive quality, clouds | PERF-04, PERF-03, PERF-11 | C10 |
| Context loss | PL-07, UXA-04 | C12 |
| Draw calls, Firefox CPU | PERF-01, UXA-14, PERF-06, PERF-08 | W1, Z1, C11 |
| Screen-reader semantics | UX-19, UXA-09 | W7 (certificate), Later (rest) |
| Settings, subtitle size | UX-14, UXA-10 | Founder F3 |
| Short viewports and 200 % zoom | UX-18, UXA-13 | Later |

**Severity and ownership changes:**
- **PL-04/UXA-05 is raised to P0.** An unconsented request to a third-party server on a public German site is a legal risk (in 2022 a German court, LG München I, awarded damages against a site that loaded Google Fonts this way). The fix is size S.
- **UXA-03 needs no founder call.** The auditor flagged it because `#78716C` is the brand's own "Text Muted" token (the EmAI brand kit's `styleguide.md:54`). Readable small text moves to the brand's "Text Secondary" `#A8A29E` (7.3:1 on `#141414`). `#78716C` stays for decoration only. No new colour is introduced.
- **UXA-08 is my call, not the founder's.** three r186 ships class static blocks (6 in `three.core.js`), so the requirement becomes "Safari 16.4+". A pre-boot check catches older browsers with a message. Transpiling three for a browser with under 1 % share is not worth it.
- **PERF-01, part 3 (merging EMI-01's 24 draws) moves to CORE "Later".** The EMI kit is in `src/core/emi`.
- **PL-08 is split.** Step 1 (initialise the zones after the title, CORE only) is in the lane. Step 2 (zone manifests, so zone code downloads later) goes to "Later", because it touches all three code lanes while the zone agents are committing.

## 3. Fix list by lane

Every item has an ID, the merged report IDs, its priority (P0 blocker / P1 for release / P2 nice to have) and effort (S/M/L), the change, and an acceptance check. Medians are of at least 3 runs. Measure the baseline on `583add1` first: the machine is shared, so compare before and after on the same day.

### CORE (src/core, src/ui, src/systems, src/i18n, main.ts, index.html)

**C1. No third-party requests** (PL-04, UXA-05). P0 · S.
- Change: `src/core/Text3D.ts:2`: call troika's `configureTextBuilder({ unicodeFontsURL })` once, before the first text is built, with a self-hosted base URL.
- Copy the 5 resolver files the game needs into `public/fonts/unicode-resolver/` (CORE owns this new folder): codepoint-index `plane0/0-ff.json` and `300-3ff.json`, font-meta `latin.json` and `greek.json`, and `font-files/greek/sans-serif.normal.400.woff`.
- In dev, `Text3DFactory.applyText` warns when a string contains a glyph that its font lacks, so new labels are caught.
- Acceptance: the network log over the title and both playtest routes shows 0 requests to any host other than the page origin (today 5 per load). The Sensordom sign „σ(z) = σ₁ · z²“ renders, also with the network blocked (screenshot).

**C2. Compile the right shaders once; draw nothing behind the loading screen** (PL-01, PERF-09 shader part). P1 · S.
- Change: in `Game.ts:686-757` `frame()`, do only `trackFrame` while `phase === 'loading'` (today it simulates and renders behind the opaque overlay).
- Add a new `RenderSystem.warmUp()`. When `preset.post` is set, wrap `compileAsync` (`Game.ts:172`) in `renderer.setRenderTarget(composer.inputBuffer)` and restore the previous target afterwards. Before compiling, set `visible = true` on the hidden groups (zone far and exterior tiers, the finale room, dusk-only and effect objects), then restore them.
- Render one full frame (composer plus shadow pass) while the bar says „Grafik wird vorbereitet“, then call `loading.done()`. Run `warmUp()` again after `setQuality`.
- Acceptance (`warm-breakdown.mjs`): about 123 programs at the title on high (today 219). The first visible frame takes ≤ 0.15 s at 1× CPU and ≤ 0.4 s at 4× (today 0.51–0.58 s and 1.06–1.10 s).
- Title time on the CDN build: ≤ 1.5 s at 1× (today 2.03 s) and ≤ 5.8 s at 4× (today 6.62 s).
- Route lap 1 (`newprog.mjs`, `route-prof.mjs`): 0 programs compiled during play (today 7), and no frame over 50 ms from shader compiles.

**C3. The mouse capture works everywhere, and its hint stays** (UXA-07, UX-02). P1 · S.
- Change: `Input.ts:135-150`: never send a second `requestPointerLock` after an `await`, because the user gesture can expire in between (WebKit rejected it in the audit). Pass `{ unadjustedMovement: true }` only on Chromium (`navigator.userAgentData?.brands` contains "Chromium"); everywhere else send the plain request.
- `Input.ts:64`: set `keyboardOnly` only while playing with no modal open, and only after a real ← → turn. Reset it when the lock is gained.
- `Game.ts:742`: show the capture hint whenever the mouse moves over the canvas while it is unlocked. Copy: „Klick ins Bild, um dich mit der Maus umzusehen“ / "Click the view to look around with the mouse". Make it a larger, centred pill.
- Acceptance: in Playwright, W on the title, then Start, then a refused lock: the hint is visible (today it is hidden). Human check in real Safari and Firefox: Start captures the mouse on the first click.

**C4. Time stands still behind full-screen panels** (UX-03, UXA-06, UX-08). P1 · M.
- Change: `Game.ts:695`: define `frozen` as `modals.isOpen` with the top modal's kind in {`pass`, `map`, `infocard`, `predict`}. While frozen:
  - there is no simulation step (`time.elapsed`, physics, `zones.update`, world update);
  - the dialogue gets dt 0 (`Game.ts:743` → `Hud.ts:563`);
  - the result-banner timer pauses.
- Operate mode and `custom` modals (`regelgarten/giant.ts`, finale F2/F3, the certificate) keep running as they do today.
- Optional (S): Enter repeats EMI's last line when no line is showing.
- Acceptance (`dlg.mjs`): queue 3 lines, open the Pass for 10 s, close it: line 1 is still on screen. Today all 3 lines and the next radio line play unseen.
- The Sensordom A run clock advances ≤ 0.2 s while the map is open for 5 s or the Pass for 4 s (today +5 s each).
- Both playtest routes pass, which shows the custom modals are unaffected. Test this together with W4.

**C5. The keyboard reaches every menu, and focus is visible** (UX-09, UXA-01, UXA-02, UX-15 title part). P1 · M.
- Change: `Input.ts:11` and `:65`: suppress Tab and the arrow keys only while `phase === 'playing'`, with no non-passthrough modal open and the canvas or body as the target. Move this check into `Game.wireEvents`.
- `StartScreen.ts:120` `show()` focuses `#start-btn`, and Enter starts the game.
- `Modals.ts:81` `open()` focuses the first control, traps Tab inside the dialog, and returns focus to the canvas on close.
- `PassPanel.ts:69`: Tab closes the Pass only when focus is not on a control inside it.
- `hud.css:76`: `:is(.btn, .seg button, .tabs button, #start .mode, .lang-toggle button, .modal .x, input[type=range]):focus-visible { outline: 2px solid var(--text); outline-offset: 2px }`.
- Add „[H] Hilfe“ to the title key row (`StartScreen.ts:67-74`) and as a footer on the objective card (`Hud.ts:102`).
- Acceptance (`a11y.mjs` keyboard run in Chromium, Firefox and WebKit):
  - Tab reaches Start, mode and language, and Enter starts the game.
  - In the pause menu, Tab reaches every setting and → moves a slider.
  - The Pass tabs and the map's „Hinreisen“ are reachable.
  - The focus ring has ≥ 3:1 contrast. Today focus stays on `<body>` and the ring on Start is invisible.
  - While playing on the canvas, Tab still opens the Pass and the arrows still turn.

**C6. The result banner stays until the player acts** (UX-05). P1 · S.
- Change: `ResultUi.ts:153` and `:161-172`: replace the fixed 7 s. Close the banner on Enter, R or H, after a walk of more than 4 m from where it opened, or when a new run starts. Without any of these it stays at least 12 s plus 0.25 s per word.
- Count game time, so the timer pauses with the pause menu and with frozen modals (C4). Show „[Enter] schließen“ on the banner.
- Acceptance: the banner is still visible after standing still for 20 s (today it closes at 7.2 s). It closes on Enter and after a 4 m walk. Both playtest routes pass; check that `playtest.mjs` closes banners explicitly.

**C7. A readable HUD** (UX-10, UXA-03, UX-04 contrast part). P1 · S.
- Change in `hud.css`:
  - Use `--text-2` (`#A8A29E`, the brand's Text Secondary) instead of `--text-3` for every text the player must read. That covers the 19 styles in `contrast.json`: title kicker, choose line, time lines, title hint, pause tabs, Pass labels, banner label, goal chips, card caption and map numbers. Keep `--text-3` for decoration only.
  - Put the compass (`:150`, `:155`, `:164`) on a dark glass strip like `#objective`.
  - Show locked skills by colour instead of opacity 0.55 (`:626`).
  - Raise the FIKTION chip (`:635`) to ≥ 4.5:1. This is a known limit (RELEASE §3) and is fixed here.
  - Set the „// Ziel“ eyebrow in `--orange-light`. Use no text under 11 px.
- Language toggle (`hud.css:379`, `StartScreen.ts:48-66`): a dark backplate, 14 px, labelled „Deutsch · English“.
- Acceptance (`contrast.mjs`: 366 text elements on 11 screens, the worst of 18 background samples):
  - 0 elements under 18 px fail 4.5:1 (today 58).
  - The compass labels reach ≥ 4.5:1 over the bright sky, and the EN toggle ≥ 4.5:1 (today 1.19:1).
  - `brand-check.mjs` passes, and screenshots are reviewed at 1280×720 and 2560×1440.

**C8. Something on screen at once; phones and old browsers are told before the download** (PL-02, PL-06, UXA-08 gate). P1 · S–M.
- Change in `index.html`:
  - Add an inline `<style>` (the `#141414` background and the layout), the brand mark as inline SVG, „Insel wird geladen“ and a CSS-only indeterminate bar.
  - Add a classic inline `<script>` that tests WebGL2, class static blocks (`new Function('class A{static{}}')`) and touch-only (the same rule as `StartScreen.ts:109`). On failure it shows the existing DE/EN message in the shell, with „Trotzdem laden / Load anyway“ for touch laptops.
- Move the three font `<link rel="preload">` tags (`index.html:10-12`) into the gate script, which adds them only when the gate passes. Otherwise a phone still downloads 180 KB of fonts before it sees the notice.
- `main.ts:4-20`: import `Game` dynamically, and only when the gate passes. `main.ts:16` says „Safari 16.4+“. `LoadingScreen.ts:11-24` takes over the shell node instead of building its own.
- Acceptance (load matrix):
  - First paint on slow 4G ≤ 0.8 s (today 2.72 s) and on 4G ≤ 0.4 s (today 0.65 s). Title time is unchanged or better.
  - Phone emulation (412×915, touch, slow 4G): the notice is visible within 1.5 s, after ≤ 50 KB transferred (today 16.4 s and 1.99 MB).
  - Without WebGL2, the message appears after ≤ 30 KB (today 465 KB).
  - The desktop flow is unchanged: `onboarding-run.mjs` passes.

**C9. Render only when something changes** (PERF-05, UXA-11). P1 · S.
- Change: `Game.ts:757`: when `phase === 'paused'` or a frozen modal (C4) is open, render once after the change, then skip `rs.render` and the per-frame world and HUD work. Render again on resize, a language or quality change, and when the modal closes.
- Render the start screen at 30 fps (every second rAF).
- `Game.ts:816` `updateAttractCamera`: hold the camera still when `settings.reducedMotion` is on.
- Acceptance (`verify.mjs`):
  - Render calls per second while paused drop to 0 after the first frame (today 900, the same as playing). With the Pass open, also 0. The start screen does at most half of today's work.
  - JS per paused frame ≤ 0.3 ms (today 2.0 ms).
  - With reduced motion, the attract camera moves < 0.1 m in 1 s (today 5.7 m).
  - Resuming from pause shows the correct frame (screenshot).

**C10. A cheaper post chain and a quality `auto` that adapts** (PERF-04, PERF-03, PERF-11). P1 · M.
- Post chain (`RenderSystem.ts`):
  - Presets (`:150-156`): pick MSAA from the effective pixel ratio: 4× at ≤ 1.0, 2× at ≤ 1.25, 0× at ≥ 1.5.
  - `:213`: drop the separate sanitize ShaderPass and clamp NaN/Inf inside `GradeEffect`.
  - `:259`: fix the `bloomScale` comment; the setting has no effect with `mipmapBlur`.
  - Give low the same shader path as medium (composer, MSAA 0, bloom off) instead of `CustomToneMapping` (`:262`). Then a switch never relinks about 50 programs.
- Adaptive controller in `trackFrame` (`:346-370`): it reads the p90 of 120 frame intervals and `Game.cpuMs`.
  - GPU-bound: lower the render scale from 1.0 to 0.6 in 0.1 steps (`setPixelRatio` in `resize`). Then turn cloud supersampling off and use 12 cloud steps (`Environment.ts:530`, `:702`). Step the preset down only after 4 s at scale 0.6. Step back up when there is headroom.
  - CPU-bound: never touch the resolution or the presets.
  - Start tier from the renderer string: Intel HD/UHD and software renderers → low; Iris, AMD iGPUs and the base Apple M1/M2 → medium; everything else → high.
  - Settle the scale during the start screen, and save `{level, scale, renderer}` in localStorage.
- Acceptance:
  - `uncapped-ab3.mjs` (vsync off, 3840×2160, high): the plaza frame ≤ 4.5 ms (today 7.0–7.5 ms), the cloud view ≤ 7.0 ms (today 9.6–10.0 ms), with the controller held off for the A/B.
  - `auto.mjs` at a 10× CPU throttle: no preset change and no frame over 100 ms. Today it steps high → low in 15 s with a 683 ms freeze and no fps gain.
  - A manual high ↔ low switch has no frame over 50 ms.
  - `brand-check.mjs` passes, the QA-04 railing view shows no moiré at high (screenshot), and `perf.mjs` high and low pass.

**C11. Less CPU per frame in the engine** (PERF-02, PERF-06 helper, PERF-07, PERF-10). P1 · M.
- (a) `brand/materials.ts:31` and `:405`: add `materials.forInstancing(mat)`, a cached clone that follows `setDusk`. After each zone init and after the world init, an automatic pass puts the clone on every InstancedMesh whose material is also used by a plain Mesh. No zone file changes. Set `forceSinglePass = true` on the library's transparent DoubleSide glass, after a visual check.
- (b) `zones/createZoneContext.ts:60-64`: add `ctx.freezeStatic(obj)`, which sets `matrixAutoUpdate = false` and calls `updateMatrix()` and `updateMatrixWorld(true)`. **Land this first**, because WORLD and ZONES call it.
- (c) `RenderSystem.ts:204`: set `shadowMap.autoUpdate = false`. Set `needsUpdate` when the snapped light moves (`Environment.ts:725-744`) or a shadow caster moved (a dirty flag from `Physics.interpolate` and the animated builders); otherwise update every second frame.
- (d) `Compass.ts:153-186`: move markers with `translateX` instead of `style.left`, write opacity only when it changes, and update the label text at 10 Hz.
- Acceptance:
  - `progdiag.mjs`: ≤ 2 `getParameters` calls per frame at the plaza (today 28) and in the Dunkelfabrik (today 18).
  - `cpu-ab.mjs` at 4× CPU, standing still: its JS-per-frame metric ≤ 7.8 ms at the plaza (today 9.3) and ≤ 8.4 ms at the spawn (today 9.6). The reps are noisy (plaza 9.1–12.1), so take the median of 3.
  - Shadows look the same at the Libelle and with moving rovers (before/after screenshots), and `perf.mjs` passes.

**C12. Robustness: context loss, a stale run chip, reset, a failed start** (PL-07, UXA-04, UX-12, UX-13, PL-13). P1 · S.
- (a) Context loss: add `webglcontextlost` and `webglcontextrestored` listeners on the canvas (`Game.ts` createCore, `RenderSystem.ts:190-205`).
  - On loss: pause, release the pointer lock and show „Grafik wird neu gestartet …“.
  - On restore: set `env.envDirty = true` and `shadowMap.needsUpdate = true`, run `warmUp()` (C2), and resume.
  - If nothing is restored within 5 s, show „Neu laden“.
- (b) `GameLayer.update`: when the zone that owns the live or timer display is away (`isAway`), abort the run and call `setLive(null)` and `setTimer(null)`.
- (c) `PauseMenu.ts:167-186`: reset clears storage and reloads the page. The text becomes „Alles löschen und neu starten (Stempel, Sterne, Karten, Kapseln)?“, with the text buttons „Löschen“ and „Abbrechen“.
- (d) Boot error (`Game.ts:176-182`): a friendly bilingual message with „Erneut versuchen“ (reload) and the technical text in a details line. A failed dynamic import is retried once after 1.5 s. The zone toast uses the zone's title instead of its id.
- Acceptance:
  - Context-loss script: after the restore, the mean difference to the frame before the loss is ≤ 8/255 (today 62/255 with black metals). While the context is lost, the frame counter stops and the overlay shows. Without a restore, the button appears within 6 s.
  - Leaving Sensordom A mid-run with „Zurück zum Hub“: no run chip at the Landedeck after 1 s (the a66 repro).
  - Reset reloads into the first-visit title with 0 stamps.
  - With the wasm blocked, the retry button shows; after unblocking, a click reaches the title.

**C13. Faster boot on slow processors** (PL-10, PL-09, PL-08 step 1, PL-12, PL-14). P1 · M.
- Change in `Game.ts:134-175`:
  - Start the Rapier import and init and the world-chunk import at the top of `boot()`, in parallel with the font wait. Import the world chunk in parallel with `zones.importAll()`.
  - Add `ctx.yield()` (`scheduler.yield()` or `setTimeout 0`), which also advances the bar's sub-step. Zone inits use it, and WORLD uses it in W6.
- Zones: keep `importAll` before the title, because the island needs the manifests. Run `initAll` after the title screen in idle slots, nearest to the spawn first, and run `warmUp` (C2) for each zone after its init.
  - `?zone=` and `?skipIntro` wait for their zone.
  - A plot whose zone is not ready keeps its placeholder (`world/placeholders.ts:7-10` already hides it on `zone:ready`).
- Progress bar: a compositor-only shimmer (`hud.css:89`), steps weighted by bytes, and plain copy: „Physik wird geladen“, „Insel wird gebaut“, „Grafik wird vorbereitet“ (`i18n/core.ts:40-49`, `:194-203`).
- `Assets.ts:2-3` and `:14`: import GLTFLoader and SkeletonUtils lazily (−10 KB brotli).
- Acceptance (load matrix, CDN build):
  - Title ≤ 4.5 s at 4× CPU (today 6.62 s; C2 alone gives 5.71 s) and ≤ 1.3 s at 1×.
  - No long task over 250 ms before the title at 1× (today 4 tasks, the longest 546 ms).
  - Title ≤ 3.8 s on 4G (today 4.10 s).
  - All zones are ready ≤ 10 s after Start at 4× CPU, well inside the 25 s ascent.
  - Both playtest routes, `onboarding-run.mjs` and the `?zone=<id>` deep links pass.

### WORLD (src/world: island, landscape, tower, underside, onboarding, finale)

**W1. Fewer world draw calls** (PERF-01, UXA-14, PERF-06 call sites, PERF-02 world glass). P1 · L.
- Change: merge static meshes per material and per region with `BufferGeometryUtils.mergeGeometries`:
  - hub and foyer (`hub.ts`, `foyer.ts`: 59 draws at the plaza);
  - each deck sector (`landscape/*`; the island module alone is 93 draws at the spawn);
  - the underside (`underside.ts`);
  - the static tower parts (`tower/*`).
- Collapse the 30 unnamed MeshBasicMaterial draws and the one-off `brand:std` colour variants into one vertex-coloured material per shading model.
- Keep interactables, label anchors, collider-linked parts and moving parts (rovers, drones, turning PV trackers, the Libelle) separate.
- Call `ctx.freezeStatic` (C11b) on everything that stays static. Set `forceSinglePass` on the world's glass (parapets, Libelle glass) where back faces are not needed.
- Acceptance:
  - `drawcalls.mjs` (main pass, by owner): ≤ 110 world draws at the spawn (today 192) and the plaza (today 189); ≤ 200 draws in total at the plaza, together with Z1.
  - `throttle.mjs` at 6× CPU: spawn and plaza ≥ 45 fps (today 33–38). At 4×: its `js50` ≤ 11 ms (today 14.9–15.7 ms). This needs C11 and Z1 too.
  - Firefox at the plaza: `cpuMs` ≤ 4.5 ms (today 6.84 ms).
  - `brand-check.mjs` passes, the gallery shows no visual change before/after, and `perf.mjs` passes.

**W2. A movement hint that stays until the player moves** (UX-01, UX-15 hint part). P1 · S.
- Change: `onboarding.ts:248`:
  - show the hint 2 s after EMI's first line, not at the same moment;
  - keep it until the player has walked ≥ 3 m and turned;
  - show it again after 8 s without movement;
  - render it as key caps in a larger card, with „[H] Hilfe“ added (strings at `:41`).
- Acceptance (`onboarding-run.mjs` with real input):
  - The hint stays until 3 m walked plus a turn.
  - Standing idle at the arrival for 8 s brings it back (today nothing appears in 60 s).
  - First mechanic still < 45 s, first zone still ≤ 65 s.

**W3. The gust's result is in view** (UX-06). P1 · S.
- Change: `onboarding.ts:355`: also show the readout („LAGE x° → y° in t s“) above the button head, or as a 6 s HUD toast. The alternative is to move or rotate the column so the ball sits in the view cone from `GUST_STAND` (`:100-103`).
- Acceptance: in a screenshot from the stand point, facing the button 1 s after the press, the readout and the ball are both within ±30° of the view centre (today 88° and 49°).

**W4. The Pass toast waits until EMI has finished** (UX-03 part). P1 · S.
- Change: `onboarding.ts:319`: fire „[Tab] öffnet ihn“ when EMI's batch of three lines has finished (dialogue idle), not together with it.
- Acceptance: in EN Entscheider onboarding, the route line ("The plant-manager route: …") has finished typing before the toast appears (dialogue event log). Test together with C4.

**W5. The right jump pad is easy to find** (UX-11). P2 · S.
- Change: `transit.ts:78` and `:123-137`. While the player is on the plaza:
  - put a vertical beacon on the objective's pad, and put the objective target on that pad so the compass points to it;
  - a pad that leads somewhere else says „→ Prüffeld · dein Ziel: Sensordom“;
  - make the objective ring thicker or raise it.
- Acceptance:
  - In the novice path from the Libelle (ux-heuristic a31–a33), the compass marker points at the orange pad, and the teal pad's hint names the objective.
  - Under deuteranopia and protanopia simulation, the beacon stays distinct.

**W6. A lighter world boot** (PL-09 world part, PL-11, PL-16). P2 · M.
- Change:
  - `world/index.ts:62-90`: `await ctx.yield()` between the builders (helper from C13).
  - `textures.ts:122`, `:60-110` and `:278-279`: build the plaza normal map at 1024² (or with a GPU Sobel pass) and drop the JS 3×3 blur.
  - `index.ts:30` and `:84`: load the finale (`world/finale/*`) with a dynamic import when the KIEL lift unlocks (4 stamps) or in idle time after the title. Keep a tiny stub that restores the dusk and ending state after a reload.
- Acceptance:
  - `profile-boot.mjs` at 4× CPU: no world task over 250 ms (today one task of 2.04–2.19 s). `textures.ts` self time ≤ 200 ms (today 670 ms).
  - The world chunk is 30 KB brotli smaller.
  - `ending-check.mjs` and both playtest routes pass, and a plaza close-up shows no visible loss.

**W7. Certificate polish and access** (UX-22, UX-19/UXA-09 certificate part). P2 · S.
- Change in `finale/certificate.ts`:
  - `:344`: wrap values onto two lines before cutting them.
  - `:381-392`: put the name field inside a `<label>`, and make Esc blur it.
  - Drop „Ohne Namen“: leave the line out or print „Besucher:in der EmAI Academy“ (`strings.ts:214`).
  - Give the canvas `role=img` and an aria-label that sums up the stars and values. Give the modal `aria-modal` and `aria-labelledby`.
- Acceptance:
  - The DE and EN certificate screenshots show no „…“ and no „Ohne Namen“.
  - The aria snapshot names the dialog, the image and the field.
  - Esc in the field blurs it, and a second Esc closes the certificate.

**W8. No CPU spikes in the finale** (PERF-09 world part). P2 · S.
- Change:
  - `finale/f2.ts:370-381`: compute `runAudit` in slices during the F2 timelapse, not on the first open of the results.
  - `finale/room.ts:328`: upload the 1280×720 screens without mipmaps.
- Acceptance (`route-prof.mjs`, lap 1):
  - Opening the F2 results: no frame over 33 ms at 1× (today 37 ms; about 220 ms at 6×).
  - F3: no single frame uploads more than 4 MB of textures (today 10.8 MB).

### ZONES (src/zones/*)

The zone agents are committing right now. Rebase on the latest HEAD and keep one commit per zone.

**Z1. Zone exteriors in ≤ 10 draws each** (PERF-08, PERF-06 call sites, PERF-02 zone glass). P1 · M.
- Change: merge each zone's static exterior meshes per material. Today's counts: Regelgarten 38 and Greifwerkstatt 35 at the plaza; Lern-Dojo 21, Sensordom 19 and Dunkelfabrik 14 (plus 12 detail) at the spawn.
- Call `ctx.freezeStatic` (C11b) on static subtrees: 1302 of 1407 scene objects never move.
- Set `forceSinglePass` on the zones' own transparent DoubleSide glass (trough glass, lamp cones) where back faces are not needed.
- Acceptance:
  - `drawcalls.mjs`: ≤ 10 draws each for the Regelgarten and Greifwerkstatt exteriors at the plaza; ≤ 50 zone draws in total at the spawn (today 91).
  - `shots-all.mjs` before/after: the exteriors look unchanged from the plaza, the Kanzeln and the Ausguck.
  - `typecheck:zone` for every zone and both playtest routes pass.
  - If a zone cannot get to 10, CORE adds a mid tier later (`ZoneManager.ts:52`: the far silhouette beyond 90 m).

**Z2. Sensordom A: no star lost to an E press that cannot work** (UX-21). P2 · S.
- Change: `sensordom/labor.ts:434-440`: when the active sensor cannot see the item, show the prompt without the E key cap („1–4: anderes Sensorbild“) and ignore E.
- Acceptance: in the real-key repro (a45/a46), E with RGB on the cup counts no miss and does not start the clock. The ★★ goal is still reachable, and Sensordom stamps in both playtests.

**Z3. One meaning per key** (UX-20, includes PT-16). P2 · M.
- Change: R means retry or reset of the current station everywhere. Move these R actions to E or Space on the station's own button, and update the key hints on screen:
  - measure (`sensordom/messstrecke.ts:643`);
  - record a demo (`lern-dojo/teleop.ts:1342`);
  - take (`dunkelfabrik/nacht.ts:440`);
  - right the giant (`regelgarten/giant.ts:1094`);
  - the R handlers in `dunkelfabrik/schicht.ts:333` and `sensordom/darkroom.ts:293`.
- An R that would wipe a run with progress asks once („Nochmal R zum Neustart“).
- Do not change the banner's key priority in `GameLayer.ts` (CORE).
- Acceptance: the grep of `onKey` handlers finds R only for retry/reset. `text-audit.mjs` and both playtests pass. Human check: three first-time players (RELEASE §2).

### BUILD (vite.config.ts, public/, asset pipeline, package.json; this round also tools/ and README.md)

**B1. Precompressed assets and a header check** (PL-05; a known limit in README "Hosting", made robust). P1 · S.
- Change: in `vite.config.ts`, add a `closeBundle` plugin that writes `.br` (quality 11) and `.gz` files next to every `.js`, `.css`, `.wasm`, `.svg` and `.html`. Add a `configurePreviewServer` middleware that serves them by `Accept-Encoding`, so `npm run preview` behaves like production.
- Add `tools/deploy-check.mjs <url>`. It asserts: `br` or `gzip` encoding and `application/wasm` on the hashed wasm; `immutable` caching on `/assets/*`; `no-cache` on `index.html`.
- Acceptance: under `npm run preview`, `load-size` reports about 2.0 MB transferred (today 4.25 MB), and the slow-4G title time is about 12.3 s (today 24.3 s). `deploy-check` passes against the preview server.

**B2. Subset the fonts** (PL-03). P1 · S.
- Change: subset the fonts at build time with pyftsubset or glyphhanger, scripted in `tools/`. Keep the same file names and formats in `src/ui/fonts/*`, so `hud.css:5-14`, `Text3D.ts:10-26` and the `index.html` preloads need no change.
- Keep: Latin-1, Latin Extended-A, €, the typographic punctuation, and the symbols the game uses (·, –, „“, →, ±, ², subscripts).
- Add `tools/glyph-check.mjs` (from `glyph-cover.py` and `text3d-glyphs.mjs`). It checks that every character in the src strings is in the font that renders it, and it lists the 3D-text glyphs that need the C1 fallback.
- Acceptance:
  - Fonts ≤ 250 KB brotli (today 463 KB).
  - Slow-4G title ≤ 11.4 s (today 12.32 s; the experiment reached 11.34 s).
  - `glyph-check` finds 0 missing glyphs, apart from the listed fallback ones (σ κ ★ …).
  - DE and EN screenshots show no tofu boxes.

**B3. Promote the audit measurements into tools/** (all reports). P1 · M.
- Change: move the scripts listed in §6 into `tools/`, on the shared `tools/lib`. Add npm scripts, and give each tool a pass/fail target. Do this early, so every lane measures with the same scripts; until then, use the paths in §6.
- Acceptance: each tool runs from a clean checkout, prints the median of 3 runs and exits 1 when it misses its target.

**B4. A stable vendor chunk** (PL-15). P2 · S.
- Change: in `vite.config.ts`, use `build.rolldownOptions` output chunking (Vite 8.3) to put `three`, `postprocessing` and `troika-three-text` into one chunk with a clear name (today it is called `logo3d`).
- Acceptance: build, change one zone file, and build again. The vendor chunk hash does not change, and a returning visitor downloads ≤ 0.45 MB brotli after a zone-only deploy (today 0.64 MB).

**B5. Correct facts in the README** (UXA-08 statement, PL-05 docs). P2 · S.
- Change: `README.md:57` says „Safari 15+“; it becomes „Safari 16.4+“. Update the load numbers after the fixes, and document hosting with the precompressed files.
- Acceptance: the README numbers match the final `load-size` and load-matrix run.

## 4. Founder decisions (kept out of the lanes)

| # | Question | Today | Recommended default | Effort, lane if approved |
|---|---|---|---|---|
| F1 | Should visitors whose browser is not set to German start in English? (UX-04) | Everyone starts in German. The EN switch is 12 px grey text at 1.2:1 contrast (C7 fixes the contrast). | **Yes**, on the first visit only: preselect English when `navigator.language` does not start with "de". German stays the house default, and the switch stays. | S, CORE (`Settings.ts:33`, `StartScreen.ts`) |
| F2 | Should returning visitors skip the 25 s flight and resume near where they stopped? (UX-07) | A visitor with 2 stamps sees the ascent again and lands at the Landedeck, about 110 m from where they stopped. A visitor with progress but no stamp sees „Starten“ as if new. | **Yes**: after one complete ascent, skip it and offer „Anflug ansehen“ as a link. Spawn at the last zone gate with „Weiter im <Zone>“. Show „Weiterspielen“ whenever any progress exists. | M, WORLD (`world/index.ts:115-118`) + CORE (`Game.ts:497-502`, `StartScreen.ts:102`) |
| F3 | Should the settings get what GDD §5.10 promises: separate volumes and a subtitle size? (UX-14, UXA-10) | One master slider, although the engine has six buses. Subtitles are fixed at 17 px. | **Yes, after this round**: three sliders (Atmosphäre & Musik, Effekte, EMI) and a text-size setting (100/125/150 %) that also scales the HUD. Otherwise remove them from the GDD. | M, CORE |

**Decided by the lead (no founder call needed):** the third-party font server is P0. Readable grey text uses the brand's Text Secondary. Safari 16.4+ is the stated requirement.

## 5. Cross-lane dependencies and file ownership

**File ownership for this round.** One owner per file. Other lanes ask the owner and do not edit the file.

| File or folder | Owner | Also needed by | Resolution |
|---|---|---|---|
| `src/world/onboarding.ts` | WORLD (W2, W3, W4) | CORE C4 (EMI timing) | CORE changes only `Game.ts` and `Hud.ts`. The toast timing is W4. |
| `src/world/index.ts` | WORLD (W6; F2 if approved) | CORE C13 (yield) | CORE ships `ctx.yield()` first, and WORLD adds the awaits. |
| `src/core/zones/createZoneContext.ts`, `ZoneManager.ts` | CORE (C11b, C13) | WORLD W1, ZONES Z1 | WORLD and ZONES only call `freezeStatic` and `yield`. |
| `src/core/brand/materials.ts` | CORE (C11a) | WORLD and ZONES (InstancedMesh call sites) | The automatic swap after init means no call-site edits. |
| `src/core/emi/*` | CORE ("Later": EMI merge) | WORLD W1 | W1 does not touch EMI-01's parts. |
| `src/ui/fonts/*` | **BUILD** this round (B2) | CORE (by the lane definition) | CORE does not edit fonts. C1 uses `public/fonts/unicode-resolver/` instead. |
| `public/` | BUILD | CORE C1 | The new folder `public/fonts/unicode-resolver/` belongs to CORE. |
| `index.html` | CORE (C8, preloads) | BUILD B2 | B2 keeps the file names, so the preloads do not change. |
| `src/ui/hud.css` | CORE (C3, C5, C7, C8, C13) | none | Only CORE edits it. |
| `src/systems/GameLayer.ts` | CORE (C6, C12b) | ZONES Z3 (banner R) | Z3 does not change the banner's key priority. |
| `src/world/finale/certificate.ts` | WORLD (W7) | CORE (UXA-09 aria) | The certificate's aria work is W7. |
| `src/core/Environment.ts`, `RenderSystem.ts` | CORE (C2, C9, C10, C11c, C12a) | none | Same lane: land them in the order C2 → C9 → C11c → C12a → C10. |
| `vite.config.ts`, `package.json`, `tools/` (new files), `README.md` | BUILD | none | `tools/brand-check.mjs` stays CORE-owned and unchanged. |

**Order and dependencies:**
1. C11b (`freezeStatic`) is CORE's first commit. W1 and Z1 can start merging meshes before it lands and adopt it afterwards.
2. C2 `warmUp()` comes before C10 (quality switch), C12a (context restore) and C13 (each zone warms up after its deferred init).
3. C4 defines "frozen modal". C6 (banner timer) and C9 (render skip) use that definition.
4. Test W4 and C4 together: they share the EMI-behind-the-Pass case.
5. B2's `glyph-check` lists the glyphs that need the fallback, and C1 self-hosts exactly the resolver files for them.
6. Tune C10's thresholds after W1, Z1 and C11 land, because those change the CPU budget.
7. B3 goes early, so all lanes measure with the same scripts.
8. C3 and C5 both edit `Input.ts` (same lane): land C3 first.

## 6. Regression checklist for the verify step

**Baseline first.** Run every check on `583add1` before the fixes and keep the numbers. Run timing checks 3 times and report medians; the machine is shared.

1. `npm run typecheck` and `npm run typecheck:zone -- <id>` for all six zones.
2. A private production build: `npx vite build --outDir <your scratch>/dist --emptyOutDir` (never `dist/`).
3. `npm run perf -- --quality high` and `--quality low`: 60 fps at all views, ≤ 500 draws and ≤ 1.5 M triangles. New targets: ≤ 110 world draws at the spawn and plaza, ≤ 200 draws in total at the plaza, and hub `js50` ≤ 11 ms at 4× CPU (`throttle.mjs`).
4. `node tools/load-size.mjs`: ≤ 1.75 MB brotli, and the title ≤ 2.4 s at 16 Mbit/s and 40 ms RTT (the README says 2.9 s today).
5. `npm run playtest -- --lang de --mode entdecker` and `-- --lang en --mode entscheider`: 18/18 stamps, 54/54 ★, finale, certificate, 0 errors, 0 warnings.
6. `node tools/onboarding-run.mjs`: first mechanic < 45 s and first zone ≤ 65 s with the ascent watched, plus the W2 hint checks.
7. `node tools/brand-check.mjs`, after C7, C10 and W1.
8. `node tools/ending-check.mjs`, after W6 (lazy finale) and C9 (render skip).
9. `node tools/text-audit.mjs` in all four language/mode combinations. New copy comes from C3, C6, C8, C12, C13, W2, W5, Z2 and Z3.
10. `node tools/audio-levels.mjs` (C4 freezes the dialogue; C9 changes the paused loop).
11. `node tools/shots-all.mjs` and `node tools/gallery.mjs`: compare before and after for W1 and Z1 (merged meshes), C7 (HUD) and C10 (MSAA, no sanitize pass).
12. Network: 0 requests to other origins over the title and both routes (C1).

**Scratch scripts worth promoting into tools/** (B3). The `artifacts/phase6/*/scripts` copies are permanent; the `scratchpad` copies are temporary, so copy them soon.

| Source | New tool | Measures | Used by |
|---|---|---|---|
| `artifacts/phase6/perf-load/scripts/load-run.mjs` + `servers.mjs` + `summarize.mjs` + `table.mjs` | `tools/load-matrix.mjs` | First paint, loading screen, title, can-move, long tasks, hidden frames and third-party requests; cable / 4G / slow 4G × CPU 1× / 4×; CDN vs `vite preview` | C8, C13, B1, B2 |
| `artifacts/phase6/perf-load/scripts/warm-breakdown.mjs` | `tools/warmup.mjs` | Programs at the title, first visible frame in ms | C2 |
| `artifacts/phase6/perf-load/scripts/glyph-cover.py` + `text3d-glyphs.mjs` | `tools/glyph-check.mjs` | Every glyph in its font; fallback list | B2, C1 |
| `artifacts/phase6/perf-load/scripts/ux-checks.mjs` + `scratchpad/phase6-ux-browsers-a11y/ctx3.mjs` | `tools/robust-check.mjs` | Phone notice, no WebGL2, context loss with and without restore, wasm blocked, zone chunk failed | C8, C12 |
| `artifacts/phase6/perf-runtime/scripts/drawcalls.mjs` + `worlddraws.mjs` | inside `tools/perf.mjs` | Main-pass draws by owner | W1, Z1 |
| `artifacts/phase6/perf-runtime/scripts/throttle.mjs` + `cpu-ab.mjs` | `tools/perf-cpu.mjs` | JS ms per frame and fps at 4× and 6× CPU | C11, W1 |
| `artifacts/phase6/perf-runtime/scripts/progdiag.mjs` | `tools/progdiag.mjs` | `getParameters` calls per frame | C11a |
| `artifacts/phase6/perf-runtime/scripts/auto.mjs` | `tools/auto-quality.mjs` | Auto quality at 10× CPU: changes and freezes | C10 |
| `artifacts/phase6/perf-runtime/scripts/uncapped-ab3.mjs` | `tools/gpu-ab.mjs` | GPU frame ms with vsync off, A/B | C10 |
| `artifacts/phase6/perf-runtime/scripts/route-prof.mjs` + `newprog.mjs` | `tools/hitches.mjs` | Frames > 33/50/100 ms and late shader compiles on lap 1 | C2, W8 |
| `scratchpad/phase6-plan/verify.mjs` + `artifacts/phase6/perf-runtime/scripts/pause.mjs` | `tools/idle-render.mjs` | Render calls and JS per frame while paused or behind a panel | C9 |
| `scratchpad/phase6-ux-browsers-a11y/a11y.mjs` | `tools/a11y-keyboard.mjs` | Tab and Enter path, aria snapshot, in Chromium, Firefox and WebKit | C5, W7 |
| `scratchpad/phase6-ux-browsers-a11y/contrast.mjs` | `tools/contrast.mjs` | WCAG contrast over the WebGL background | C7 |
| `scratchpad/phase6-ux-browsers-a11y/dlg.mjs` | `tools/dialogue-modal.mjs` | EMI lines behind modals | C4 |
| `scratchpad/phase6-ux-browsers-a11y/net.mjs` + `cdnblock3.mjs` | `tools/third-party.mjs` | Third-party requests; rendering with the CDN blocked | C1 |

(`scratchpad` = the planning session's temporary directory, outside the repo.)

**Still needs a human (RELEASE §2):**
- Mouse capture on the first click in real Safari and Firefox (C3).
- An Intel or AMD integrated-GPU laptop in Chrome, Edge and Firefox, with `?debug=1` at the spawn, the plaza, Kanzel 240 and the Kielraum. Check that `auto` picks a sensible tier and scale (C10).
- One screen-reader pass (VoiceOver or NVDA) over the title, the pause menu and the Pass (C5).

## 7. Later (not this round, in rough order of value)

- **CORE:**
  - UX-16 / PT-14 rest: a dimmed prompt („näher ran“) between range and range + 4 m (`Interaction.ts:101`, `:190`). S.
  - UX-17: default mouse speed 1.0 → 0.6–0.7 with a „langsam … schnell“ label (`Player.ts:192`, `Settings.ts:30`). S. Confirm with the human playtest first.
  - UX-23: „Zur Akademie (Plaza)“, teleporting to the plaza, and „Spielmodus“ in both places (`i18n/core.ts:57`, `:67`, `Game.ts:228-231`). S.
  - UXA-12: a hint when storage is blocked (`storage.ts:18-24`). S.
  - PERF-09 rest: create the AudioContext on the first pointerdown on the title (`Audio.ts:175`). S.
  - PERF-12: dusk PMREM at 1–2 Hz or a crossfade of two prebaked maps (`Environment.ts:663-686`). S.
  - UX-19/UXA-09: aria for menus, tabs, sliders and the live region for EMI. M.
  - UX-18/UXA-13: compact title and HUD below 700 px height, a fullscreen button, 200 % zoom. M.
  - EMI-01 merge and far LOD (PERF-01 part 3, `core/emi/Emi.ts`). M.
  - UXA-15: stair-step shadows at the Libelle (cause not verified). M.
  - Funk-Log (UX-03 history).
  - PT-13 (no proximity cue for the capsules), PT-21 (stale objective after the certificate), PT-27 (far-zone compass label inside a zone).
- **Cross-lane:** PL-08 step 2, zone manifests in `src/zones/<id>/manifest.ts` so zone code downloads after the title (CORE + ZONES + WORLD; −251 KB from the first load). L.
- **ZONES:** PT-11 (Lern-Dojo „Demo ohne Ziel“), PT-18 (Prüffeld ratings visible before you rate), PT-23/24 (Dunkelfabrik silent new shift; REAL column).
- **WORLD:** a KEEL icon on the map (PT-08 rest).
