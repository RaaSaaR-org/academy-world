# Release checklist: EmAI Academy · Schwebewerk

**Release candidate 5 (Phase 7 „Startklar“: the island as the goal), 2026-10-21.** Phase 7 (`docs/PHASE7-PLAN.md`) adds the ground below the island and a reason to fly: the quest spine „Startklar“ with its three systems (lift, energy, navigation; D23), real robots (SO-101, Open Duck Mini, the Unitree ladder up to the H2, the Schauhalle line-up), the Revier with the Sonnenacker, the Traumhangar, the Kreislaufhof and the Unkrautacker, the Schauhalle Nord, people, easter eggs and the lift-off with its new ending. It was built in three waves on branch `phase7` (tags `p7-w0`, `p7-w1`, `p7-w2`). On 2026-10-18 the founder cut wave 3 to a slim release: WP17-lite (fixes), WP18-lite (docs, facts and the legal package) and this release pass; WP16 (SHOULD content) and WP20 (fun tuning) moved to the backlog (plan status table). Build: `phase7` at the commit tagged `rc5`. Branch `main` stays at rc4 (`cba388c`), the founder's baseline, until the founder has played rc5. Earlier candidates: tags `rc1`–`rc4`; rc4's version of §1–§3 is in git at tag `rc4`. §4 below is Phase 6's history (rc4); §5 holds the facts register, Phase 7's new claims first; §6 is rc4's gallery.

## Verdict

**Ready for the founder to play locally as release candidate 5. Not ready for a public link** until the legal review (`docs/LEGAL-REVIEW.md`) is signed and the human checks in §2 are done. The wave gate on the merged tree passes 49 of 51 steps (one more is skipped: `src/robots/**` did not change). The two misses are measured, listed in §3 with their next steps, and neither breaks play. Bots play both routes in both languages through all 28 stamps, the lift-off and the certificate, and also from an rc4 save.

- **What the player gets (against rc4).** The island now starts grounded at a dock and has to earn its lift-off. The six rotors come from the island's stations (lift), the Startakku from the Sonnenacker (energy) and the Flugmodell from the Traumhangar (navigation); in Entscheider mode the Bodencrew brings the last two. Below the island are the Revier with four sites, real robots (an SO-101 that learns from your demos, 64 Open Duck Minis learning to walk, the Unitree ladder up to the H2), the Schauhalle Nord with its datasheets and price bands, people at work, ten easter eggs and a new ending. The first load is still smaller than rc4's (1.48 MB against 1.68 MB), a full playthrough downloads 5.09 MB, and nothing is fetched from another server.
- **What the slim wave 3 fixed since `p7-w2`.** The plaza's GPU frame went from rc4 + 0.22 ms to rc4 + 0.18 ms. The title now compiles 150 shader programs instead of 155, which meets the cap. Ground areas give their robots' GPU memory back while the island flies (memory-lap passes). The Prüffeld vendor terminal fits its 35-word budget in English, so text-audit passes in all four runs. Inside the Schauhalle, 17 draws of the other areas show instead of 20. The tree crown in the lift-off's first drone shot and the see-through dialogue panel are fixed. The facts register, the legal package and the as-built docs are written.
- **The two misses.** (1) **Plaza GPU frame: 4.52 ms against rc4's 4.34 ms** (rc4 + 0.18; a confirmation run measured 4.50 against 4.33). That is 0.02–0.03 ms over the A/B margin of rc4 + 0.15 ms. 60 fps holds everywhere. It ships as a known limitation under D44 (1), and **the founder is told here**. (2) **WebKit (Safari's engine): frames over 33 ms while walking up to an area**, 8 in the gate's lap and 2 in a rerun. They come from texture uploads when an area's exterior first shows, not from shader links. Chromium has none.

| Founder question (wave 2) → decision | As built in rc5 |
|---|---|
| (1) Plaza GPU frame → **D44 (1)**: try the levers; if still over rc4 + 0.15 ms, ship it as a known limitation and tell the founder | Levers built (WP17). The plaza is **rc4 + 0.18 ms** (4.52 ms against rc4's 4.34 ms; p7-w2 was rc4 + 0.22). 60 fps holds everywhere. **Known limitation, founder told** (§3) |
| (2) Schauhalle side walls → **D44 (2)**: keep the frosted glass; lobes 02 and 03 at mid tier while inside | The Regelgarten shows its mid set while you are inside the hall (8 → 5 draws). The Greifwerkstatt has no mid tier yet, so the other-areas count is 17, not 10 (§3) |
| (3) Traumhangar dream view → **D44 (3)**: keep the steep top-down view | Unchanged, as built |
| (4) Greifwerkstatt gear task → **D44 (4)**: „hintere Kiste (0,35 m)“ is pedestal to box | Unchanged, as built (solvable) |
| (5) Dunkelfabrik C → **D44 (5)**: teal arc plus tooltip marks the real L3–4 values | Unchanged, as built |
| (6) Sonnenacker → **D44 (6)**: 80 s automated day, one „Pflanze zuerst“ tick | Unchanged, as built |

All six are the founder's lead's defaults, recorded in `docs/DECISIONS.md` D44 and awaiting the founder's confirmation (§2).

## 1. Verified in this pass (automated)

All runs on production builds, Apple M5 Pro, ANGLE Metal, headless Chromium unless a row says otherwise. The wave gate (`node tools/gates.mjs --tier wave`) ran once on `phase7` at `6475ce7` (both merges; rc5 adds only documentation after it) on a quiet machine (load ≈ 1.9 on 18 cores): summary `artifacts/phase7/gates/wave-6475ce7.json`, logs `artifacts/phase7/gates/wave-6475ce7/` (git-ignored). **rc4** is the tag's build (`artifacts/dist/rc4`); its GPU numbers are measured interleaved in the same run, the others are rc4's release record (rc4's §1, at tag `rc4`). **p7-w2** is the wave-2 gate (`wave-03f8049.json`, `wave-7d03123.json`). The extra runs outside the gate (the Schauhalle GPU run, the WebKit rerun, two playtests, the gallery) logged to the release pass's scratch folder, not to the repo.

### 1a. What the slim wave 3 merged

| Branch | Merge | Head | Review |
|---|---|---|---|
| `p7/wp17` (WP17-lite, fixes) | `bcd637d` | `ec86a5f` | Code only for the fix list: the plaza levers (`src/world/ground/{index,far,terrain}.ts`, `src/world/region/index.ts`, `src/world/life/{director,index}.ts`), the warm-up folds (`src/world/finale/liftoff/ghost.ts`, `src/zones/schauhalle/showroom.ts`, plus one disclosed extra fold, `src/zones/sensordom/curtains.ts`), suspend eviction (`src/core/robots/RobotLibrary.ts`, `src/core/zones/ext/robots.ts`), the hall mid set (`src/zones/regelgarten/index.ts`, `tools/lib/views.mjs`), the look fixes (`src/world/region/paths.ts`, `src/ui/hud.css`). Its Prüffeld hint change was reverted (WP18's copy covers it); item 6 skipped. No conflicts |
| `p7/wp18` (WP18-lite, docs) | `6475ce7` | `5374fe4` | `docs/**` (facts register §5, D44, `LEGAL-REVIEW.md`, GLOSSARY, GDD, ARCHITECTURE), README (named in WP18's goal), two copy-only EN card topics in `src/zones/prueffeld/strings.ts` (no keys changed) and comments in `src/zones/schauhalle/data/prices.ts`. No conflicts |

After each merge: `npm run typecheck`, `npm run build` and `npm run playtest -- --lang de --mode entdecker --quick` passed (0 errors, 0 warnings, 222 s each). No integration fix was needed.

### 1b. Wave gate

| Step | rc5 | Cap | rc4 | p7-w2 |
|---|---|---|---|---|
| Typecheck, zone typechecks (prueffeld, regelgarten, schauhalle, sensordom), head and dist builds | pass | | | pass |
| First load (`load-size`) | 1.48 MB in 28 requests, no area chunk, no robot model; title after 2.4 s at 16 Mbit/s | ≤ 1.75 MB | 1.68 MB | 1.48 MB |
| i18n-audit · save-migrate · third-party | DE and EN agree · 9/9 fixtures · 0 requests to other origins (9/9) | 0 | 0 requests | pass |
| Draw ledger (`drawcalls --ledger`) | plaza 131 main-pass draws (world 92, areas 25, ground 9, region 0, life 1, robots 0), 803 k triangles; bridge head 163, 835 k; 18/18 targets | plaza ≤ 200 (world ≤ 95, ground ≤ 10), bridge head ≤ 240, ≤ 1.0 M | plaza 148 | plaza 135, bridge head 163 |
| Playtests | quick DE (3:52); full EN Entscheider (537 s), full DE Entdecker (418 s), DE from the rc4-mid save (418 s): 28 stamps, 54/54 ★, 9/9 question cards, album 13/13, the three systems, the lift-off and the certificate, 0 errors, 0 warnings. Outside the gate, the two other combinations also ran in full: DE Entscheider (537 s) and EN Entdecker (418 s), same assertions, 0 errors, 0 warnings. So both routes in both languages reach the lift-off and the certificate. | pass | pass | pass |
| perf high / low | 60 fps at every survey view (min 59.51 / 59.51); worst 274 / 259 draws (Greifwerkstatt), 1.01 M / 0.99 M triangles (Kanzel 60), CPU ≤ 3.85 ms | ≤ 500, ≤ 1.5 M, 60 fps | 238 / 0.90 M | min 59.5 / 57.6, 1.01 M |
| perf-cpu at 4× (js50) | bridge head 7.3, plaza 6.6, duck field 6.7, Sonnenacker C 5.5, Traumhangar ghost 5.6, climb 6.1 ms; lift-off director 0.06 ms; 8/8 | 8.4 / 7.8 / 8.4 / 9.5 / 9.0 / 8.4; 0.3 | plaza 5.8 | 7.5 / 6.5 / 6.8 / 5.6 / 5.2 / 6.3; 0.05 |
| **GPU A/B** (`gpu-ab`, 3840×2160, vsync off, 5 runs interleaved with rc4) | **plaza 4.52 ms: miss** (rc4 + 0.18) · cloud 6.80 · bridge head 4.41 · Ausguck 4.44 | 4.5 or rc4 + 0.15 · 7.0 · 4.5 · 6.0 | 4.34 · 6.70 · 6.40 · 5.64 | 4.64 (rc4 + 0.22) · 6.93 · 4.49 · 4.51 |
| GPU, Schauhalle interior (separate run, same conditions) | 4.50 ms (5 runs; the same run measured the plaza again: 4.50 ms against rc4 4.33, rc4 + 0.17) | 5.0 | (no hall in rc4) | not measured on a quiet machine |
| hitches, Chromium (1 lap) | 0 program links on rendered frames, 0 frames over 33 ms from a link, 0 walking frames over 33 ms, robots' first-shown frames 0 links; F2 16.8 ms; F3 3.52 MB; 8/8 | 0 · 0 · 0 · 33 ms · 4 MB | 6 links | pass |
| **hitches, WebKit** (1 lap) | 0 links. **Miss:** walking frames over 33 ms from texture uploads: 8 in the gate's lap (one of 689 ms at the Dunkelfabrik approach, 9.3 MB), 2 in a rerun right after (53 ms at the Schauhalle approach with 48 MB of textures, 34 ms at the Traumhangar; 23 frames over 33 ms in all, 1 over 100 ms, the same profile as p7-w2's rerun) | 0 | – | 5, rerun 1 |
| Warm-up (`warmup --table`) | **150 programs** at the title (itemised table); 1 frame behind the loading screen; first visible frame 4 ms (16.6 ms at 4×); title 0.81 s (2.5 s at 4×); 6/6 | ≤ 150; ≤ 1; ≤ 150 / 400 ms | 132 | 155 |
| memory-lap | 9/9: lap 2 vs lap 1 geometries 1104, textures 178, heap 47.8 MB; **suspended ground areas give memory back** (1354 < 1358) and release their robots (12 → 4); paused: 11.1 ms script in 3 s, 0 draws | | | suspended areas failed (1355 vs < 1353) |
| liftoff-check / `--rm` | 39/39 · 39/39: at most 265 main-pass draws per beat (worst frame 278), 0 frames over 33 ms, 0 program links, 1 env-map rebuild, master peak −14.1 dBFS, ghost horizon 2 draws and never outside the cloud | ≤ 320 · 0 · 0 · ≤ 1 · ≤ −10 dBFS · ≤ 2 | | 39/39 · 39/39 |
| flash-check, 5 sequences | worst 1 flash per second (hail); lift-off, dream glitch, duck slow motion, spray 0 | ≤ 3/s | | pass |
| Onboarding | DE Entdecker: first mechanic 28.8 s, first zone 56.1 s; EN Entscheider with 10 s idle: 38.8 s (incl. the idle) and 61.8 s; returning visitor OK | 30 s / 65 s | 42.2 / 60.9 s | 28.8 / 55 s; 38.9 / 61.8 s |
| ending-check (DE) | pass (the ending holds across reloads; ground areas suspended while airborne) | | pass | pass |
| text-audit with chips, four runs | all four runs (DE and EN, Entdecker and Entscheider): 0 failed budgets, 0 unchipped numbers, 0 cards that scroll; zone entries ≤ 25 words (Traumhangar 15 DE / 18 EN). The Prüffeld vendor terminal is at its cap in English (35 words) | 35-word panels, 25-word zone entries | pass (no chips then) | EN × 2 failed (vendor terminal 37) |
| glyph-check · watch-audit | 6/6 (✓ is a fallback glyph whose resolver block is not self-hosted; no 3D text uses it) · 6 runs within the watching rule (judged trivially, §3) | | | 6/6 · pass |
| secret-audit, 30 runs | pass: median 7 finds per run; a find in the first 10 minutes in 30/30 runs (Winke-Arm 27/30, Wackelig 30/30); three eggs are found by playing a station and are not counted (Herztomate, Traumraum, Hack-Sammler); the quick playtest with no secrets passes | ≥ 1 find in 10 min in ≥ 4 of 5; median ≥ 5 | | median 7; 30/30 |
| a11y-keyboard (Chromium, Firefox, WebKit) · contrast · audio-levels · idle-render · dialogue-modal · brand-check | 123/123 · 4/4 · 60 measurements, no clipping · 8/8 · 9/9 · pass | all | 14 of 14 · 0 · OK · 0 renders · 9/9 · OK | 123/123 · 4/4 · OK · 8/8 · 9/9 · OK |
| robust-check | 21/21 | | pass | 20/20 |
| mujoco-check (`--prod`, three engines, 1× and 4× CPU) | pass: Chromium 8.96 µs per step, a generation ≤ 1245 ms at 1× and ≤ 2787 ms at 4×; WebKit 8.95 µs, ≤ 1226 ms; Firefox 11.75 µs, ≤ 1512 ms (Firefox and WebKit are informational); the recordings fallback without a module worker works | 15 µs/step; 1.5 s / 3.5 s per generation | – | 8.98 µs; ≤ 1248 / 2809 ms |
| Chunk caps · full playthrough on the wire (`load-matrix --lap`) | every chunk within its cap · 5.09 MB | every chunk within its cap · ≤ 8 MB | – | pass · 5.09 MB |
| deploy-check `--preview` | 16/16 | all | 10/10 | 16/16 |

### 1c. Also run in this pass

| Check | Result | How |
|---|---|---|
| Release gallery | 17 views at 1280×720 (DE Entdecker), 0 console errors, read by eye: `artifacts/phase7/release/` (git-ignored). The tool still shoots Phase 6's set (title, arrival, ascent, hub, the six zones, the Kielraum, dusk, certificate); the Phase 7 views (Sonnenacker, Lern-Dojo teleop, duck field, Traumhangar, H2, Schauhalle, Ausguck, the lift-off frames) are the wave-2 founder stills in `artifacts/phase7/lookdev/w2/`, whose code rc5 changed only at the C1 tree, the ghost horizon's material and the dialogue panel | `node tools/gallery.mjs --out artifacts/phase7/release` |
| Hosting headers | 16/16 again on the final build (brotli, `no-cache` index.html, immutable `/assets/*`, `application/wasm` for Rapier and MuJoCo, a robot GLB as `model/gltf-binary`); the build emits `dist/THIRD-PARTY-NOTICES.txt` and `dist/licenses/` | `node tools/deploy-check.mjs --preview` |
| Merge review | Each branch's diff read file by file against its list (§1a); nothing outside it | `git diff p7-w2...p7/wp17`, `...p7/wp18` |

## 2. Needs a human before release

Nothing in this section can be measured by a script. The slim release ran no people sessions (the founder's scope cut of 2026-10-18 moved WP20 and the §8.2 rounds to the backlog), so every row is open. Order: what blocks a public link first.

**Blocks a public link (plan §8.3, §8.4):**

| What | Why a person | How (who) |
|---|---|---|
| **Legal review package** (`docs/LEGAL-REVIEW.md`, items 0–9) | Licences, trade dress, trademarks and price bands are a lawyer's call | Book a lawyer for items 1–7; the founder signs items 0–9 in its sign-off table. Every amber or flagged model can be removed without breaking a mechanic (LEGAL-REVIEW item 2) (founder + lawyer) |
| **Open Duck Mini v2 trade dress** (LEGAL-REVIEW 1) | The design derives from a film-character robot | Keep, or swap to ToddlerBot / ROBOTIS OP3 before the link (a new WP0 pipeline run plus WP5 tuning) (lawyer advises, founder decides) |
| **Amber exhibits** Spot, MiR250, KUKA LBR iiwa 14, Robotiq 2F-85 (LEGAL-REVIEW 2) | The licensor is not the vendor; mesh origin undocumented | Not in the public build (`VITE_AMBER` unset, §3). Keep or remove each; decide whether to send the courtesy notes (none sent yet); drop the unused `spot-arm` GLB? (lawyer advises, founder decides) |
| **Unitree clause 3** (LEGAL-REVIEW 0 and 3) | The specific no-endorsement line „Keine Verbindung zu Unitree Robotics und keine Empfehlung durch Unitree Robotics.“ ships since 2026-10-22 (credits page and notices, §3); is it enough? | Read it on the credits page and in the notices. Also (b) datasheet values and list prices as nominative use, (c) the UnifoLM licence line, (d) the H2 status „angekündigt“ (lawyer) |
| **LeKiwi** (LEGAL-REVIEW 4) | Vendor CAD inside a repository-level Apache-2.0 URDF; the price band „unter 1.000“ has no source („Quelle fehlt“, RELEASE §5) | Source the band from the BOM at `efa608d` or show „auf Anfrage“; decide the CAD question (also for the SO-101 and duck servos) (lawyer advises, founder decides) |
| **Price bands** (LEGAL-REVIEW 7) | Comparative advertising (UWG) and stale prices | Check every band, basis and date against `src/zones/schauhalle/data/sources.ts` (AS_OF 2026-10-17), including the H2 reseller figure „Händler bis ≈ 90.000“ (R4 S63, secondary, unverified) and Spot's 2020 launch price (R4 S37); decide whether bands carry an expiry (lawyer advises, founder signs) |
| **Trademarks and disclaimers** (LEGAL-REVIEW 5) | Are the Schauhalle and credits disclaimers enough; Apollo's PSYONIC hand meshes | Read both disclaimers in the game (lawyer) |
| **Notices** (LEGAL-REVIEW 6) | Is `THIRD-PARTY-NOTICES.txt` plus same-origin `licenses/` enough for BSD clause 2 and Apache §4a | Open the credits page and both files in the release build (lawyer) |
| **History cards** (LEGAL-REVIEW 8) | „Belohnung wörtlich genommen“ names DeepMind in its body (D34 keeps companies anonymous in history) | Keep, or „Ein Beispiel aus der Forschung“ (founder) |
| **Facts register re-check** (RELEASE §5 „Phase 7“) | WP18 traced every number to its research row but did not reopen the primary pages | One pass against the primary pages, especially the Unitree plaques (dated 17.10.2026), the three secondary-source figures (H2 status R4 S62, H2 reseller price R4 S63, Spot 2020 price R4 S37) and Apollo's and the iiwa's secondary rows (content owner) |
| **Founder sign-off** | D15–D43 carry Claude's defaults; **D44** records the six wave-2 questions decided by default by the founder's lead (plaza GPU as a known limitation, frosted Schauhalle walls with the mid tiers, top-down dream view, „hintere Kiste“ as built, teal arc for real L3–4, 80 s Erntetag and one „Pflanze zuerst“ tick); the slim-release scope; G-LOOK v2 (`artifacts/phase7/lookdev/g-look-v2/`) and G-FARM (`g-farm-v1/`) | Confirm or override in `docs/DECISIONS.md`; look at the two still sets and `artifacts/phase7/lookdev/w2/` (founder) |
| **Photosensitivity review** (§8.2) | `flash-check --sequence all` passes (§1); a reviewer must still watch the whiteout, the break-out, the dream glitches, slow-motion falls, hail, spray and the 6/6 pulses | One reviewer, real screen, full brightness |
| **rc4 save on the founder's own browser** (§8.4) | Save v2 migration is tested on fixtures (`save-migrate`, the rc4-mid playtest), not on the founder's real save | Open rc5 in the browser that played rc4; the v1 backup must stay untouched |
| **Hosting** (§8.4) | `deploy-check --preview` passes; the real host does not exist | After deploying: `node tools/deploy-check.mjs https://<host>/` plus one GLB and the MuJoCo wasm on the real host |

**People sessions (plan §8.2; none run for rc5):**

| Session | Who | Pass rule |
|---|---|---|
| Fun and time, rounds 1 and 2 (the ten key moments of WP20) | 5–6 first-time players each, mixed ages incl. teenagers | Entdecker median 80–100 min; ≥ 1 secret in 10 min for 4 of 5; median ≥ 5 secrets; note ★★/★★★ that feel unfair or trivial |
| Entscheider | 2–3 managers | median ≤ 30 min (else the Bodencrew timing fallback for two rotors); Befundkarten understood; the Lern-Dojo path ≈ 3.5 min with ≤ 20 % unattended; the Schaufenster ≈ 90 s by hand; the Sonnenacker B „€“ button found |
| Controls | 3 players | no control blocks a ★: Lern-Dojo A mouse teleop and the grasp assist (★★★ threshold); humanoid piloting and the head camera (R1 → H2 size feel); the H2 Generalprobe; Greifwerkstatt C Lastdiagramm, gear carry with mouse plus F; duck sliders; Kanzel hops; Sonnenacker lamp drag, „Pflanze zuerst“ tick, hail stow; lift-off hold-E and the skip ring; Winke-Arm view wiggle |
| Motion | 5 players incl. one known to be motion-sensitive | no discomfort with the defaults: the lift-off with outside shots on and off (C1/C2 framing), the reduced-motion stills, the 65 m hops, the humanoid head camera |
| Screen reader | 1 pass | title states, credits page, Pass sections, the loading card read with labels and a sane focus order |
| Browsers | M1 Air (Safari 16.4 or oldest, Chrome), Windows (Edge), Firefox (current and 108–113) | the MuJoCo station, the robots and the lift-off run; WebKit upload frames (§3) on real Safari; auto quality on an integrated GPU |
| H-TIME (timing on rc4) | 2 first-time players | open since wave 0; fold it into round 1 |

**Look and sound by eye and ear** (the wave-2 builders' checks; stills in `artifacts/phase7/lookdev/w2/` and the release gallery):
- **Changed in rc5, look first:** the Sensordom PVC curtains now draw front faces only at opacity 0.88 (the Schleuse and the darkroom); the lift-off ghost horizon is now lit (the whiteout); the Schauhalle light cones now take fog (a hall still); C1 no longer has a Streuobst crown in its corner; the EMI dialogue panel is near-opaque (break-out frame 13); from the plaza the fence posts, the far ring's crowns and the region's far parts are hidden, from 43 m out they come back (walk the plaza edge for a pop); the Regelgarten shows its mid set while you are inside the Schauhalle (frosted wall).
- Greifwerkstatt skinned arm (idle, egg salute) and its far silhouette from the plaza; Dunkelfabrik hatch seam on „M5 bereit“ and the teal „real“ arcs; Prüffeld κ needle and the round-1 refusal at 2×; Sensordom C EMI-02's ten reaches.
- Regelgarten 90 m swap; the terrain switch at the dock wall; the rim when the slot comes into view; the jetty and terraced banks from the Seeblick.
- The excavator from the Ausguck and the lay-by (a retired machine, no hologram feel); the Revier-Chronik board; the map's Revier tab.
- Schauhalle floor sheen near the Pannen-Wand and its 21 Vorführung clips (R1, ANYmal D, Shadow Hand, Stretch 3); the faceless people at C1 distance; the apron crowd and the crew at the Ausguck rail; guests on the Ausguck ring.
- Traumhangar top-down dream view in A, B, C (D44 (3)); the upload beat from outside; props under the roof (no floating); the Traumraum door (egg 12).
- Sound: the Sonnenacker servo chorus, bees, hail, call ping; the region beds (excavator creaks, sheep); the lift-off mix (whumps, Recamán notes, the trims' chord, nav chime, cloud muffle, break-out melody).
- The certificate front and back, the Erstflug-Protokoll and the Entscheider Befundkarte in DE and EN; the Fotopunkt PNG in Chromium, Firefox and WebKit.

**Still open from rc4** (unchanged, see the rc4 version of this file at tag `rc4`): mouse capture on the first click in real Safari and Firefox; modal → modal with a real mouse; the brand review of the mount and the plaza beacon; the two behaviour changes (Tab in the Pass, the Start focus ring).

## 3. Known limitations (rc5)

**Measured misses of rc5 (§1b), each with its next step.** None of them breaks play.
- **Plaza GPU frame: rc4 + 0.18 ms** (4.52 ms against rc4's 4.34 ms; budget 4.5 ms, or rc4 + 0.15 ms with the founder told). WP17's levers took it from rc4 + 0.22 (p7-w2) to rc4 + 0.18: at the plaza the fence posts, the far ring's tree crowns, the region's far parts and life's ground far tier are not drawn, and the terrain shader computes the spoil heap's canopy first. The plaza still runs at 60 fps; the margin matters on weaker GPUs. Shipped as a known limitation under D44 (1); **the founder is told here.** Next step: the terrain fragment's farmland block beyond 400 m (parcel hash and `fwidth`) on the plaza's horizon band, then re-run `node tools/gpu-ab.mjs --views plaza --runs 5 --dist rc4=artifacts/dist/rc4 --dist head=artifacts/dist/head` on a quiet machine.
- **Schauhalle, other areas seen through the frosted side walls: 17 draws** (cap 10; p7-w2: 20). The Regelgarten shows its mid set while you are inside the hall (8 → 5, D44 (2)); the Greifwerkstatt has no mid tier, so its 8 exterior draws still show. Next step: a Greifwerkstatt `buildExteriorMid` (≤ 1 draw, as in the Regelgarten) shown on `zone:enter` schauhalle, which gives 5 + 1 + 4 = 10; then lower the known entry in `tools/lib/views.mjs` to the cap.
- **WebKit walking frames from texture uploads** (8 walking frames over 33 ms in the gate's lap, 2 in the rerun; cap 0; Chromium 0). When an area's exterior first shows, its textures upload in one frame: 48 MB at the Schauhalle approach, 9–23 MB at others. No program links. Not attempted in the slim release (WP17 item 6). Next step: in the zone loader, after the chunk loads, call `renderer.initTexture()` for the exterior's textures, one per idle slot, before the exterior tier first shows (the pattern of `RobotLibrary.prewarm`'s `idle()` and `uploadOnce()`); then `node tools/hitches.mjs --runs 3 --browser webkit`.

**Close to a cap (pass now, will fail with the next addition):**
- The Prüffeld vendor terminal reads exactly 35 words at open in English (WP18 shortened two card topics: „Object poses“ → „Poses“, „End of run“ → „Stop rule“). Greifwerkstatt B and Dunkelfabrik C are also at 35 in English (WP8). Any longer EN text there fails `text-audit`.
- Programs at the title: exactly 150 (cap 150). WP17 folded the ghost horizon onto the dream ghosts' material, the Schauhalle cones onto the fogged instanced program, an empty exterior geometry with attributes, and the Sensordom curtains to front faces only. A new material at the title needs a fold first.
- Suspended ground areas give back 1354 against < 1358 (geometries + textures): a small margin.
- The plaza's Greifwerkstatt exterior is 10 draws (cap 10); the duck field 885 k triangles (cap 0.9 M); the plaza's world bucket 92 draws (cap 95).
- An EMI egg line queued in one area can play just after entering the next: one text-audit run of WP17 counted the Herztomate line in the Traumhangar's entry (31 > 25 words), the gate's four runs did not (15–18 words). The DE Unkrautacker entry reads 25 words (cap 25) when the Traumraum line carries over. Next step: drop queued egg lines on `zone:enter`, or count only the area's own lines.

**Not built or not checked (the slim release):**
- **WP16 SHOULD content** is not in rc5: the Feldbahn, Bahnhof and Dorf scene, the SHOULD life (L6, L9–L14, L16, the copter crate aboard), the SHOULD eggs (egg 22; the Asimov, Turing, Weizenbaum and Moravec history cards), the region extras, the Seeblick extras and the compare-stage extras, the Profi-Ente spike.
- **WP20 fun tuning** did not happen: star thresholds, the ten key moments and both route times are calibrated with bots only (§2).
- **No people sessions** (plan §8.2): route times (Entdecker design ≈ 94 min, Entscheider ≈ 29 min), secret discoverability and the controls are bot-measured only.
- **Legal:** LeKiwi's price band „unter 1.000“ has no source; three figures rest on unverified secondary sources (H2 status, H2 reseller price, Spot's 2020 price, which the public build does not show); no courtesy notes sent (`docs/LEGAL-REVIEW.md`, §2).
- **Public build without the amber exhibits** (2026-10-22, `p7/pages`): Spot (and Spot with Arm), MiR250, LBR iiwa 14 and 2F-85 are left out unless the build sets `VITE_AMBER=1` (`src/core/release.ts`): the Schauhalle stands 17 robots, their three Lastenheft jobs leave the pool, no GLB of theirs is in `dist/` (`docs/LEGAL-REVIEW.md` item 2).
- **Unitree no-endorsement line ships** (2026-10-22): on the credits page (DE/EN) and under each Unitree entry of `THIRD-PARTY-NOTICES.txt` (`docs/LEGAL-REVIEW.md` items 0 and 3); the Traumhangar plaques do not carry it.
- **watch-audit passes only trivially in the gate:** the playtests solve by hooks, so no unattended stretch is judged (the real stretches were measured on scripted runs by WP6 and WP8). Next step: feed the bot runs into `watch-audit` (WP7 tools).
- **The Lern-Dojo Entscheider path** spends 30 % unattended at a bot's 2.5 s per decision (limit 20 %; ≈ 12 % at the planned 3.5 min reading pace): a human check (§2).
- **`_site-example`** loads no robot of its own, so robots-adapter-check cannot see a site's queue. Next step: give it a robot only the site uses.
- **The operate-mode camera** drifts about 0.1 m between pointer events (WP6's report). Next step: hold the camera pose between events (WP4 engine).
- **Onboarding** keys on the visit, not on the flight state, and the objective does not yet point to the Ausguck console once armed (WP13's suggestion for WP12's files).
- **Traumhangar:** the C self trial (driving the H1-2 to push the cart) and the H2 Generalprobe task have no automated played check (solve hooks only); the album entries kiste-weg, stillstand-gewinnt and traumraum unlock in real play (and through the `album` hook in the playtest).
- **robots-adapter-check step 5** (animate heap growth) is flaky (once 5752 B against 4096 B; WPF).
- **Regelgarten zone init** grew ≈ 15–20 ms to build its mid set (61–66 ms; WPF).
- **Glyphs:** ✓ and ✗ are in none of the brand font subsets and their resolver block is not self-hosted; harmless unless a 3D text uses ✓ (glyph-check). The Unkrautacker keeps ✔ ✖ (system-font fallbacks).

**Look items still open (human, §2):** the Schauhalle floor keeps a low-sun sheen near the Pannen-Wand at some angles (roughness 0.42); the Greifwerkstatt's far tier is one vertex-coloured mesh; the people are deliberately blocky and faceless; the far pit bank is about 1.2 km from the Ausguck, so the haze makes it read as a shore with a tree line; the G-LOOK v2 stills predate the jetty and dinghies.

**Carried over from rc4** (rc4's §3, at tag `rc4`, still applies where Phase 7 did not change it; not re-checked in this pass): desktop only (mouse and keyboard; Chrome or Edge 94+, Firefox 108+, Safari 16.4+ with WebGL2); progress lives in this browser (localStorage, no accounts); auto quality tuned on an Apple M5 Pro only; text size scales the subtitles and the in-play HUD, not the Pass, cards, pause menu or compass; the Start button's focus ring and Tab inside the Pass (§2); PT-02, PT-11, PT-19 and the later items UX-17, UX-18 / UXA-13, UX-19 / UXA-09 rest and PL-08 step 2; the critic's „still reads as odd“ list; the cloud sea's faint light dashes at dusk.

## 4. Phase 6: status of every plan item

Lanes: core-engine 31d5e28 … 1293e68, core-ux 003ab95 … 049d0b2, world-perf 83c83cb … e597ef3, world-ux d12a45c … 49183a9, zones f6eb487 … 4923f4d, build 2b2f706 … 33ba88a, integration 1e09cfd … 3b73a49, verify a9a64bf, e9b1657, b65f2f5 (`git log a0ed8fc..`). The plan's own status column is in `docs/PHASE6-PLAN.md`. rc3 → rc4 numbers are the verify stage's (§1) unless marked "lane".

| Item | What | Status | Evidence |
|---|---|---|---|
| C1 | No third-party requests | Done | 5 → 0; σ renders with other origins blocked |
| C2 | Compile the right shaders once | Partial | programs 219 → 132 (target ≤ 130); hidden frames 8 → 1; programs linked during a first lap 7 → 6 (target 0) |
| C3 | Mouse capture works, hint stays | Done, human check open | hint checked headless; real Safari / Firefox first click in §2 |
| C4 | Time stands still behind panels | Done | dialogue-modal 0 → 9 of 9; game time +4–5 s → 0 |
| C5 | Keyboard reaches every menu | Done, screen reader open | 4 → 14 of 14 in Chromium, Firefox, WebKit |
| C6 | Result banner stays | Done | lane: 7.2 s → ≥ 24 s, Enter / R / H / 4 m walk |
| C7 | Readable HUD | Done | 84 → 0 contrast failures; compass 1.02 → 5.27:1 |
| C8 | Shell and pre-boot gate | Done | first paint slow 4G 0.74 → 0.20 s; phone notice 1900 → 3.8 KB |
| C9 | Render only on change | Done | paused / Pass 900 → 0 renders/s |
| C10 | Cheaper post chain, adaptive auto | Partial | GPU 6.28 → 4.43 ms; 10× CPU no preset change; MSAA 2× at DPR 1.5 (plan 0×, decided); iGPU check open |
| C11 | Less CPU per frame | Partial | 4× CPU 9.8 → 6.4 / 8.1 → 5.8 ms (met); getParameters 28 → 8 at the plaza (target 2 missed) |
| C12 | Context loss, stale chip, reset, failed start | Done | 0 frames while lost, restore 58.1 → 1.7/255, reload offer 5.1 s, wasm retry |
| C13 | Faster boot on slow processors | Done | title cable 4× 4.53 → 2.30 s; long tasks > 250 ms before the title 4 → 0 |
| W1 | Fewer world draws | Done | spawn 194 → 86, plaza 189 → 91 |
| W2 | Movement card | Done | onboarding-run (walk + turn; idle return) |
| W3 | Gust result in view | Done | lane: readout 19.6°, ball 15–26° (was 88° / 49°) |
| W4 | Pass toast after EMI | Done | `dialogue:idle`; onboarding order |
| W5 | Right jump pad easy to find | Done, brand look open | beacon + raised ring; simulated colour blindness ΔE ≥ 30 |
| W6 | Lighter world boot | Done | lane: textures.ts 595 → 199 ms; world chunk −32.8 KB; no task > 250 ms before the title |
| W7 | Certificate | Done | no „…“, no „Ohne Namen“ (gallery); aria (lane) |
| W8 | No finale spikes | Done | F3 most texture bytes in one frame 10.36 → 3.52 MB (verify, 1×); F2 longest frame at 6× CPU ≈ 970 → 33 ms (lane) |
| Z1 | Zone exteriors ≤ 10 draws | Partial | Regelgarten 39 → 29, Greifwerkstatt 35 → 17; spawn zones 88 → 52 |
| Z2 | Sensordom A: no star lost to E | Done, star rule awaits the founder | no miss, no clock, no [E] key cap in a view that cannot see |
| Z3 | One meaning per key | Done, human check open | R = retry / reset; Space for station actions; „Nochmal R zum Neustart“ |
| B1 | Precompressed build, header check | Done | preview 4.15 → 1.68 MB; deploy-check 10/10 |
| B2 | Font subsets | Done | lane: fonts at the title 456 → 199 KB; glyph-check 5/5 |
| B3 | Measurement tools | Done | 15 tools + deploy-check, subset-fonts (README, ARCHITECTURE §13) |
| B4 | Stable vendor chunk | Done | lane: zone-only deploy 0.64 → 0.04 MB (import map → Firefox 108+, gate checks it) |
| B5 | README facts | Done | numbers re-measured on rc4 (verify) |

**Later items and phase 5 findings touched in this round:**

| Item | Status in rc4 |
|---|---|
| Funk-Log (UX-03 history) | **Done**: Pass tab „Funk-Log“ (last 20 lines), Enter repeats EMI's last line |
| UX-16 / PT-14 rest | **Done**: dimmed prompt with „näher ran“ up to 4 m beyond reach |
| UX-23 | **Done**: „Zur Akademie (Plaza)“ teleports to the plaza; „Spielmodus“ |
| UXA-12 | **Done**: title note and toast when the browser saves nothing |
| UXA-15 | **Fixed by the verify stage**: not a shadow but a z-fight on the Libelle plinth top (§1c) |
| PERF-09 rest | **Done**: the AudioContext is built on the first pointerdown on the title |
| PERF-12 | **Done**: the dusk env map rebuilds at most every 0.66 s |
| PT-08 | **Done**: KIEL lift on the compass and on the map |
| PT-13 | **Done**: sonar ping near an unfound Sensorkapsel |
| PT-16 | **Done**: a measurement asked for while the carriage drives starts on arrival |
| PT-18 | **Done**: round 2 also hides B and C until you have rated |
| PT-21 | **Done**: „Frei erkunden. Die Insel gehört dir.“ after the certificate |
| PT-23, PT-24 | **Done**: „Neue Schicht starten · 60 s“; the real levels after the first night |
| PT-27 | **Done**: no far-zone compass names inside a zone |
| PT-02, PT-11, PT-19 | Open (§3) |
| UX-17, UX-18 / UXA-13, UX-19 / UXA-09 rest, EMI-01 merge, PL-08 step 2 | Open (plan "Later") |

## 5. Facts register

Every real-world claim a player can read, where it appears, its chip, its source and how it was checked. "Team" = checked by the builder; "QA" = re-checked in a release pass against the primary source or a public copy; "math" = recomputed. Fictional and toy-model values are listed at the end.

### Phase 7 (rc5, 2026-10)

Phase 7 brings real robots, the Revier, the Sonnenacker, the Traumhangar and the Schauhalle, so it adds many real-world claims. They are listed by subject; one row may hold several numbers from the same source. Sources: the research reports `docs/research/R1`–`R9` (every source accessed 2026-10-17; ids like „R8 S17“ are the report's source table) and, for the Schauhalle, `src/zones/schauhalle/data/sources.ts` (ids R4 S21 … S63, R3 U-H1, R8 S28; cards print „Stand 17.10.2026“). New chips (D32): **HERSTELLERANGABE** (a vendor's spec, with its date), **MODELL** (computed on the shipped 3D model), **TRAUM** (a world-model prediction). Status: **„WP18“** = traced on 2026-10-19 from the in-game text and its source line to the report's source row (the primary pages were not reopened in this pass; a QA re-check against them is open for RELEASE §2); „Team“ = checked by the builder; „math“ = recomputed by WP18; **„Quelle fehlt“** = no source in the code or in R1–R9 (summary at the end of this section).

#### SO-101 (Lern-Dojo, Greifwerkstatt C, Sonnenacker, Kreislaufhof, Schauhalle)

| Claim (as shown, DE) | Where | Source | Status |
|---|---|---|---|
| „Teile ca. 122 US$ pro Folgearm; 229,88 US$ mit Leitarm“; „Ein Lernarm für 122 Dollar Teile“; „Teile für ≈ 122 Dollar“ | Schauhalle card and price band, SELBST-BAUEN panel, Sonnenacker A and C cards, SO-101 plaque | TheRobotStudio SO-ARM100 README and parts list @ a758567 (R4 S22, R8 S25: US$ 121.94 and US$ 229.88, parts only) | WP18 (121.94 rounded to 122) |
| „Servo STS3215 bei 6 V: Nenn 6,5 kg·cm, Spitze 16,5 (SO-ARM100) bis 19,5 kg·cm (Feetech). HERSTELLERANGABE, Stand 10/2026.“ | Greifwerkstatt C card and servo board | Feetech STS3215 C001 page (R1 S36: stall 19.5, rated 6.5 kg·cm at 6 V); SO-ARM100 README (R1 S1: 16.5 kg·cm at 6 V). The two disagree, so both are shown (R1 §1.1) | Team + WP18 |
| „Gestreckt braucht der Arm schon für sich selbst mehr als die 6,5 kg·cm Nennmoment“; the Lastdiagramm over 0,10–0,41 m (stretched: 0 g at the rated torque, 188–261 g in the stall band) | Greifwerkstatt C (MODELL) | R1 §1.1 eigene Rechnung (`urdf_payload.py` on `so101_new_calib.urdf`); the game recomputes it from WP0's manifest inertials | Team (`tools/lastdiagramm-check.mjs`) |
| „Eine offizielle Traglast gibt es nicht“ · „Nutzlast und Reichweite nicht angegeben“ · „6 Servos (STS3215)“ | Greifwerkstatt C card, Schauhalle card | R1 §1.1; R4 S22 | WP18 |
| „Reicht ≈ 0,41 m weit“ | Sonnenacker SO-101 plaque (MODELL) | R1 `urdf_reach.py` (R8 S26: 0.411 m) | WP18 |
| „Echter SO-101, je 100 Demos, je 20 Versuche: Farbsortieren 0–10 %.“ | Lern-Dojo, „Echt gemessen“ panel | Yu & Qiu 2026, arXiv 2606.08881v2 (R1 S29) | Team + WP18 |
| „SmolVLA, SO-101: bekannte Lagen 90 %, neue Lagen 50 % (n nicht angegeben).“ | same | Shukor et al. 2025, arXiv 2506.01844, Table 4 (R1 S19) | Team + WP18 |
| „Echt trainiert: SmolVLA 20.000 Schritte ≈ 4 h auf einer A100“; „ACT einige Stunden auf einer GPU“ | Lern-Dojo panel | LeRobot docs (R1 S9–S11) | WP18 |
| „Daten: 15–60 min je Aufgabe und Aufbau“ (RICHTWERT) | Lern-Dojo panel | eigene Rechnung, R1 §7: LeRobot's default of 50 episodes with resets (R1 S9); the real 50-episode SO-101 set holds 6.6 min of motion (R1 S40) | WP18 |
| „Messen: n ≥ 50 je Bedingung“ | Lern-Dojo panel | LeRobot docs on GR00T (R1 S14) | WP18 |

#### Open Duck Mini v2 and the Microduck (Regelgarten C „Lauf, Ente!“, Schauhalle)

| Claim (as shown, DE) | Where | Source | Status |
|---|---|---|---|
| „ca. 42 cm (Beine gestreckt)“; „Selbstbau unter 400 US$ Teilekosten“; „Stückliste ‚unter 400 US$‘, nur Teile“ | Schauhalle card, price band, SELBST-BAUEN panel | Open Duck Mini README @ b23317a (R4 S21; R2 S1, S5: the BOM sheet sums to €398) | WP18 |
| „Die Ente hat 14 Motoren“ | Regelgarten C (EMI line) | R2 §2: 14 servo joints (5 per leg, 4 neck and head) plus 2 antenna servos (R2 S3, S5). The Schauhalle's „16 Gelenke“ (MODELL) counts the antennas | WP18 |
| „150–300 Mio. Schritte, rund 35–69 simulierte Tage“ | Regelgarten C, Für Neugierige | Open Duck Playground: 150 M default, 300 M „current win“ (R2 S6, S10); days at 50 Hz are arithmetic | math (150 M ÷ 50 ÷ 86.400 = 34,7 d; 300 M → 69,4 d) |
| „Die Microduck lernt einen brauchbaren Gang in 1–2 Stunden mit 4.096 parallelen Welten“; „Beide Enten denken 50-mal pro Sekunde“ | Regelgarten C card | Pollen Robotics microduck_rl README (R2 S19); policy rate 50 Hz (R2 S7, S17, S19) | WP18 |
| „pro neuer Fähigkeit mit 2–5 Runden Belohnungs-Hacks“ | Regelgarten C, Entscheider card | Microduck training notes (R2 S21) | WP18 |
| Boat race („drehte ein Agent Kreise“); survival reward of a bipedal character | Regelgarten C hack cards (no number) | Krakovna et al. 2020, DeepMind blog (R2 S39); Grandia et al., RSS 2024, arXiv 2501.05204 (R2 S29) | WP18 |
| „2,06 kg“, „16 Gelenke“ | Schauhalle card (MODELL) | the shipped 3D model (WP0 manifest) | MODELL |

#### Unitree (Traumhangar plaques, H2 Generalprobe, Schauhalle)

| Claim (as shown, DE) | Where | Source | Status |
|---|---|---|---|
| R1: 1,23 m · ≈ 29 kg · 26 Freiheitsgrade · Armlast etwa 2 kg („stark haltungsabhängig“) · Akku ≈ 1 h; „Tempo: nicht angegeben“ | Traumhangar plaque, Schauhalle card | unitree.com/R1 (R4 S32; R3 §1.1, footnote 1: the page lists the 2 kg under a torque label) | WP18 (R3 and R4 agree) |
| G1: 1,32 m · ≈ 35 kg · 23 Freiheitsgrade (EDU bis 43) · ≈ 2 kg pro Arm („variiert stark mit der Armhaltung“) · ≈ 2 h (9000 mAh) | Traumhangar plaque, Schauhalle card, Schaufenster stop | unitree.com/g1 (R4 S29; R3 §1.1) | WP18 |
| H1-2: ca. 1,78 m · ≈ 70 kg · 27 Gelenke, 7 pro Arm · Nennlast ≈ 7 kg, Spitze ≈ 21 kg · unter 2 m/s · Akku 0,864 kWh; „keine Laufzeit angegeben“ | Traumhangar plaque, Schauhalle card | unitree.com/h1, H1-2 figures (R3 U-H1, R3 §1.1: 15 Ah = 0.864 kWh) | WP18 |
| H2: 1,82 m · ≈ 70 kg · 31 Gelenke, 7 pro Arm · Nennlast ≈ 7 kg, Spitze ≈ 15 kg · Akku ≈ 3 h; „H2-Nennlast: rund 7 kg pro Arm, nicht 18“; „manche Funktionen … ‚noch in Entwicklung‘“ | Traumhangar plaque, H2 datasheet in the Generalprobe (HERSTELLERANGABE · Stand 17.10.2026), Schauhalle Tresor and Kistenwaage | unitree.com/H2 (R4 S31; R3 §1.1) | WP18 |
| H2 status „angekündigt“ | Schauhalle card | RedHotCyber, 20.10.2025 (R4 S62: secondary, seen via a search result, unverified) | WP18; the status rests on an unverified secondary source while the vendor page lists a price: content check before release (LEGAL-REVIEW.md) |
| Go2: 0,70 × 0,31 × 0,40 m · ≈ 15 kg · 12 Gelenkmotoren · ≈ 8 kg (PRO; AIR ≈ 7 kg; höchstens 10–12 kg) · bis 3,5 m/s (PRO) · 1–2 h (8000 mAh) · Stufen 15–16 cm, Hänge 30–40° | Schauhalle card | unitree.com/go2 (R4 S33) | WP18 |
| Heights on the Messlatte and „Gemessen am 3D-Modell im Spiel (Standpose)“ | Traumhangar, Schauhalle (MODELL) | computed from the manifest at run time | MODELL |

#### Schauhalle Nord: the other datasheets (`data/robots.ts`)

Every row holds the card's values with its chip; „k. A.“ where the vendor states nothing. The Lastenheft jobs and the Kistenwaage judge only these values.

| Robot | Values (DE) | Source | Status |
|---|---|---|---|
| Apptronik Apollo | 1,73 m · 72,6 kg · 25 kg („Bedingung nicht angegeben“) · ca. 4 h pro Akku (QUELLE); Pilotbetrieb | Engadget 2023 (R4 S53, secondary, seen via a search result); apptronik.com (R4 S55) | WP18 |
| PAL TALOS | 1,75 m · 95 kg · 6 kg pro Arm (gestreckt) · 1,5 h Laufen, 3 h Standby · Regeltakt 2 kHz (EtherCAT) | pal-robotics.com/robot/talos (R4 S49) | WP18 |
| ANYmal D | 0,93 × 0,53 × 0,89 m · 50,0 kg, 55,7 kg mit Inspektions-Nutzlast · bis 10 kg (nur Zusatzsensoren) · 0,75 m/s empfohlen, 1,3 m/s max. · 90–120 min · IP67 · Treppen bis 45° · typisch −10 bis 50 °C | ANYmal D US datasheet (R4 S38, converted from inches, pounds and °F, R4 §2.1 note 2); anybotics.com (R4 S39) | WP18 |
| Boston Dynamics Spot (amber) | 1,10 × 0,50 m, Laufhöhe 0,61 m · 33,8 kg · 14 kg (mit Arm: hebt 11 kg, zieht 25 kg) · 1,6 m/s · 90 min · IP54 · −20 bis 55 °C · Hänge ±30° | bostondynamics.com/products/spot and /spot/arm (R4 S35, S36) | WP18 |
| Universal Robots UR5e | Fuß ø 151 mm · 20,7 kg · 6 Gelenke · 5 kg · 850 mm · TCP bis 4 m/s · ±0,03 mm · IP54; Greifwerkstatt C plaque „5 kg, 850 mm“ | UR5e datasheet (R4 S40; plaque: „Stand September 2026, abgerufen am 17.10.2026“) | WP18 |
| Franka Research 3 | ≈ 18,3 kg · 7 Gelenke mit Drehmomentsensor · 3 kg · 855 mm · TCP bis 2 m/s · < ±0,1 mm · IP40 · 1 kHz | franka.de, datasheet 2.6 (R4 S41) | WP18 |
| KUKA LBR iiwa 14 (amber) | 29,9 kg (QUELLE) · 7 Achsen mit Drehmomentsensoren · 14 kg · 820 mm · IP54 · ±2 % des Maximalmoments | kuka.com (R4 S42); the weight from RoboDK (R4 S43, secondary, unverified) | WP18 |
| Shadow Dexterous Hand | 4,3 kg · 24 Gelenke, 20 angetrieben · über 100 Sensoren bis 1 kHz · 2 taktile Fingerspitzen (bis 5) | shadowrobot.com (R4 S56) | WP18 |
| Robotiq 2F-85 (amber) | Hub 85 mm · 0,9 kg · 5 kg (Höchstwert) · Griffkraft 20–235 N | Robotiq product sheet (R4 S57, S58) | WP18 |
| Hello Robot Stretch 3 | 24,5 kg (QUELLE); 33 × 34 × 141 cm, 2 kg, 2–5 h (each labelled „unbestätigt“) | IEEE Spectrum, 15.02.2024 (R4 S51); docs.hello-robot.com search snippet (R4 S52, unverified) | WP18 |
| FANUC R-2000iC/165F | 1090 kg · 6 Achsen · 165 kg · 2655 mm · ±0,05 mm; „Zu schwer für den Drehteller: 1090 kg.“; Kistenwaage: „Laut einer einzigen Herstellerangabe nur der FANUC“; Nullstellung 2,48 × 0,75 × 2,11 m (MODELL) | fanucamerica.com (R4 S44) | WP18 |
| PAL TIAGo | 1,10–1,45 m hoch, Basis ø 54 cm · Arm mit 7 Gelenken · 3 kg ohne Greifer · 4–5 h (1 Akku), 8–10 h (2) | pal-robotics.com/robot/tiago (R4 S50) | WP18 |
| MiR250 (amber) | 80 × 58 cm, 30 cm hoch · 94–97 kg (QUELLE, „je nach Blatt“) · 250 kg auf Aufsatzmodulen · 2 m/s · „bis zu 20 Stunden am Tag“ · Durchfahrten ab 80 cm; „Die 250 kg des MiR250 stehen nur im Blatt.“ | mobile-industrial-robots.com/mir250 (R4 S47); distributor sheets (R4 S48, unverified) | WP18 |
| LeKiwi (base) | Basis 0,12 m hoch, 3 Allseitenräder (MODELL); „Nutzlast und Laufzeit sind nicht angegeben.“ | github.com/SIGRobotics-UIUC/LeKiwi (R8 S28) | WP18 |

#### Price bands (D17; `src/zones/schauhalle/data/prices.ts`)

Row label „Preisklasse (Listenpreis, US-$ oder €, ohne Steuern und Versand)“, with basis and date on every plate, plus „Ein Listenpreis ist nicht die Rechnung“. Showing prices is the founder's D17; no price of EmAI's own services anywhere (D5, checked).

| Robot | Band | Figure on „Mehr“ | Basis · source · date | Status |
|---|---|---|---|---|
| SO-101 (follower; leader without a figure) | unter 1.000 | Teile ca. 122 US$ pro Folgearm; 229,88 US$ mit Leitarm | Quelle · R4 S22 · 17.10.2026 | WP18 |
| Open Duck Mini v2 | unter 1.000 | Stückliste „unter 400 US$“, nur Teile | Quelle · R4 S21 · 17.10.2026 | WP18 |
| LeKiwi (base) | unter 1.000 | none | Quelle · R8 S28 · 17.10.2026 (flag `unsourcedFigure`) | **Quelle fehlt**: R8 S28 says only „low-cost“; R1–R9 hold no figure |
| Unitree R1 | 1.000–10.000 | US$ 5.900 (AIR US$ 4.900) | Liste · R4 S32 · 17.10.2026 | WP18 |
| Unitree Go2 | 1.000–10.000 | AIR US$ 1.600 · PRO US$ 2.800 | Liste · R4 S33 · 17.10.2026 | WP18 |
| Unitree G1 | 10.000–50.000 | ab US$ 13.500 | Liste · R4 S29 · 17.10.2026 | WP18 (R4: secondary sources from 2024 still quote US$ 16,000, the same band) |
| Unitree H2 | 10.000–50.000 | US$ 29.900 (Hersteller), and „Händler bis ≈ 90.000“ | Liste · R4 S31 · 17.10.2026; second figure humanoid.guide (R4 S63, secondary, seen via a search result, unverified) | WP18; the conflict is shown on purpose [C2 m4]; the second figure alone would be 50.000–150.000 |
| Hello Robot Stretch 3 | 10.000–50.000 | US$ 24.950 Einführungspreis 2024 | Quelle · R4 S51 · 15.02.2024 | WP18 |
| Boston Dynamics Spot | 50.000–150.000 | US$ 74.500 Basis-Kit (2020), „historisch“ | Quelle · R4 S37 · 16.06.2020 | WP18 (R4 read it via a search result; today's price is not published) |
| G1 with Dex3-1, H1, H1-2, Spot with Arm, Apollo, TALOS, ANYmal D, TIAGo, MiR250, UR5e, FR3, LBR iiwa 14, R-2000iC/165F, Shadow Hand, 2F-85 | auf Anfrage | „Kein öffentlicher Listenpreis. Frag nach Zubehör, Integration und Betrieb.“ | vendor pages, 17.10.2026 (R4 §3) | WP18: R1–R9 hold no dated secondary price for any of them, so the form „auf Anfrage · {Band} laut {Quelle}“ stays unused. The H1's US$ 90,000 shop snippet (R4 S34) is unverified, and the H1 has no plinth |

#### Agrivoltaics and the Sonnenacker (QUELLE and RICHTWERT)

| Claim (as shown, DE) | Where | Source | Status |
|---|---|---|---|
| „Almería, Folientunnel: 30 % Schatten kosteten 15 % der Tomaten.“ | Sonnenacker B card | Kujawa et al. 2025, AgriEngineering 7(6), 178 (R8 S15) | WP18 |
| „Arizona: Kirschtomaten unter PV doppelt so ertragreich – wegen Hitze und Trockenheit.“ | B card | Barron-Gafford et al. 2019, Nature Sustainability 2, 848–855 (R8 S13) | WP18 |
| „Hier gilt: 1 % weniger Licht, 0,7–1 % weniger Ertrag.“ (RICHTWERT) and the B season result | B card, B result | Marcelis et al. 2006, Acta Horticulturae 711 (R8 S14); power after Heggelbach 2018 (R8 S1) | WP18 |
| „Agri-PV kostet 7–12 ct/kWh. Eigenstrom spart 7–9 ct/kWh gegenüber dem Einkauf.“ | B economics card | Fraunhofer ISE guideline, 3rd ed. 2024 (R8 S3: 7–12 ct/kWh; R8 §1.1 from S2: buying at 14–16 ct against generating at 7 ct); Kalmbach 2023 (R8 S5) | WP18 |
| „Bis 2,5 ha neben dem Hof ist sie im Außenbereich privilegiert; die Norm verlangt 66 % Ernte.“ | B economics card | § 35 Abs. 1 Nr. 9 BauGB (≤ 25.000 m², one installation per farm, R8 S7); DIN SPEC 91434:2021-05 (≥ 66 %, R8 S6, via Fraunhofer ISE) | WP18; legal wording check (LEGAL-REVIEW.md) |
| „LER … Über 1 lohnt das Teilen.“; „Das dichteste Dach hat das höchste LER – und fällt durch die Norm.“ | B card | definition (R8 §1.2, S1, S5); the second sentence is the toy's own result against DIN SPEC 91434 (MODELL) | Team |
| Strom pro Tag ≈ 106 kWh; Verbrauch der Arme ≤ 10 kWh (RICHTWERT); „Die Kilowattstunden sind ein Richtwert für dieses Dach“ | Hofladen dashboard, Startakku card | eigene Rechnung, R8 §2.3: ≈ 504 m² × ≈ 600 kWp/ha ≈ 30 kWp × 1.285,3 kWh/kWp (Heggelbach, R8 S1); 12 Arme × ≤ 60 W × 14 h (SO-ARM100 supply 12 V 5 A, R8 S25) | math: 30,24 kWp × 1.285,3 ÷ 365 = 106,5 kWh/d; 12 × 60 W × 14 h = 10,08 kWh, shown as „≤ 10“ (the 60 W is itself the supply's ceiling) |
| „Echte Versuche lassen immer ein Beet ohne Dach zum Vergleich, wie hier.“ | Sonnenacker plaque „Referenzbeete“ | University of Freiburg pilot with an unshaded reference, opened 20.05.2026 (R8 S11); Heggelbach reference field (R8 S1) | WP18; „immer“ generalises from these plants: content check welcome |
| „Bestäuben machen hier Hummeln. Gärtnereien setzen sie seit den 1980ern ein.“ | Sonnenacker EMI-08 line, C end list | HortiDaily, 24.02.2022 (R8 S30: bumblebees from the mid-1980s) | WP18 |
| „Hummeln … meist mit etwa 100 bis 400 Hertz. Bienen, die so vibrieren, steigerten in einer Studie das Fruchtgewicht von Tomaten, Honigbienen nicht deutlich.“ | Hummelkasten card (ambient life) | Cooley & Vallejo-Marín 2021, J. Econ. Entomol. (R9 S29); De Luca et al. 2019 (R9 S30, from a search result; some sources say up to 500 Hz) | WP18 |
| „Die Klassen stammen aus der US-Norm für Tomaten.“ | Sonnenacker A card | 7 CFR §51.1860 (R8 S24) | WP18 |
| „28 % der Arbeitskräfte auf deutschen Höfen waren 2023 Saisonkräfte.“ | Sonnenacker C end list | Destatis, Agrarstrukturerhebung 2023, via topagrar 03.04.2025 (R8 S43: 242.800 of 875.900) | math (27,7 %) |

#### Harvest robots

| Claim (as shown, DE) | Where | Source | Status |
|---|---|---|---|
| „Mittelwert von 50 Forschungsrobotern: 66 % Erfolg, 33 s pro Frucht, keiner im Handel.“; „Forschungsmittel 66 % · 33 s (Bac et al. 2014)“; „alle 33 Sekunden ein Griff, zwei von drei gelingen … Mittelwert aus 50 Forschungsprojekten“ | Sonnenacker C card and result line, Tomatenkapsel (ambient life), certificate's Befundkarte | Bac, van Henten, Hemming, Edan 2014, J. Field Robotics 31(6), 888–911 (R8 S17) | WP18 |
| „Im Mittel beschädigen Ernteroboter 5 % der Früchte.“ | Sonnenacker album entry „Zu fest gegriffen“ (Pass, Pannen-Wand) | same (fruit damage 5 %) | WP18 |
| „Derselbe Paprika-Roboter: 61 % im Beet für Roboter, 18 % im normalen.“ | C card, cost card | Arad et al. 2020, J. Field Robotics 37 (SWEEPER; R8 S19) | WP18 |
| „Bei 6 s pro Frucht, 95 % Erfolg und 20 h am Tag dürfte er 196.000 € kosten.“; Befundkarte „ca. 6 s Takt, mindestens 95 % Erfolg, rund 20 h am Tag“ | C cost card, certificate's Befundkarte | Hemming et al. 2011 as cited in Bac 2015, Wageningen thesis (R8 S18) | WP18; R8 notes that the € sign was reconstructed from the PDF text: check against the thesis |
| „Mit Forschungswerten (33 s, 66 %) nur ≈ 25.000 €.“ (RICHTWERT) | C cost card | eigene Rechnung (R8 §2.6): scales with 1 / cycle time and with the success rate (`robotWorth` in `sonnenacker/model.ts`) | math: 196.000 × 6/33 × 0,66/0,95 = 24.757 € |
| The simulated day's cycle time, median ≈ 25 s | C day (ILLUSTRATIV) | a toy value inside the cited range: 24 s (R8 S19), 32,46 s (R8 S20), 33 s (R8 S17) | Team |

#### Revier scenes (Kreislaufhof, Unkrautacker, Grubenrand)

| Claim (as shown, DE) | Where | Source | Status |
|---|---|---|---|
| „2022 fielen weltweit 62 Millionen Tonnen Elektroschrott an. Nur 22,3 % davon wurden nachweislich gesammelt und recycelt.“ | Kreislaufhof card | UNITAR/ITU, Global E-waste Monitor 2024, 20.03.2024 (R8 S33) | WP18 |
| „Ein Sortierroboter schafft bis zu 140 Griffe pro Minute, 120 im Dauerbetrieb: Angabe des Herstellers.“ | Kreislaufhof card; Befundkarte „AMP Robotics 2021 (Herstellerangabe)“ | AMP Robotics press release, 29.06.2021 (R8 S32, vendor) | WP18 |
| „In der EU gilt ab dem 31. Juli 2026 ein Recht auf Reparatur.“ | Kreislaufhof card | Directive (EU) 2024/1799 (R8 S34) | WP18 |
| „In der Forschung lernen Roboter schon, Elektromotoren für die Wiederverwendung zu zerlegen.“ | Kreislaufhof repair card | KIT, AgiProbot 2019–2024 (R8 S35) | WP18 |
| „Ein kartierender Hackroboter schafft etwa 6,5 ha am Tag, bis zu 24 h mit Sonne und Akku.“ | Unkrautacker card | FAO Agritech Observatory, FarmDroid FD20 (R8 S36) | WP18 |
| „Kamera-Spritzen treffen 6 × 6 cm und sparen laut Hersteller bis zu 95 % Herbizid.“ | Unkrautacker card | Ecorobotix press release, 17.03.2026 (R8 S37, vendor) | WP18 |
| „Laser: Kamera und Strahl, kein Gift, aber viel Strom“ (no number) | Unkrautacker card; Befundkarte „Carbon Robotics 2022“ | LaserWeeder launch, Feb 2022 (R8 S38, search result only, HTTP 403) | WP18; qualitative |
| Senkrechte Solarzäune, Agri-PV der Kategorie II als Weide | Unkrautacker sheep card | Fraunhofer ISE guideline, 3rd ed., Feb 2024 (R8 S2) | WP18 |
| Grubenrand: „Früher Tagebau: Der Schaufelradbagger grub hier nach Kohle.“, pit → lake → field; lift-off line „Da unten war eine Grube.“ | Grubenrand, bridge-head plaque, lift-off | FIKTION (D43), no number | — |

#### History and egg cards (Fundvitrine; R9 §5)

| Claim (as shown, DE) | Where | Source | Status |
|---|---|---|---|
| „Roboter“ from R.U.R. by Karel Čapek (1920, uraufgeführt 1921); proposed by his brother Josef; „robota“: Frondienst | Egg „Robota“ | R9 S1, S2 (Czech Foreign Ministry 2021; MIT Press Reader) | WP18 |
| Shakey (Stanford Research Institute, 1966–1972), the first mobile robot that planned; A* published 1968 | Egg „Der Wackelige“ | IEEE Milestone „Shakey“ (R9 S5); Hart, Nilsson, Raphael 1968, IEEE Trans. SSC 4(2) (R9 S6) | WP18 |
| Rubber-duck debugging, „meist auf … ‚The Pragmatic Programmer‘ (1999) zurückgeführt“ | Egg „Erklär’s der Ente“ | R9 S16 (the book's wording is unverified; the chip says „Wortlaut nicht geprüft“) | WP18 |
| Specification gaming, the DeepMind example of a robot hooking its legs and sliding | Egg „Belohnung wörtlich genommen“ | DeepMind, Specification gaming (R9 S17) | WP18 |
| Ha & Schmidhuber 2018 trained an agent in its world model's dream; DreamerV3 (Nature, 2025) | Egg „Im Traum geschummelt“ | arXiv 1803.10122 (R9 S18); Hafner et al., Nature 640 (2025) (R9 S19) | WP18 |
| Kleinbild 36 × 24 mm: 24 mm sees ≈ 53° vertically, 85 mm ≈ 16° | Egg „Fotopunkt“ (MODELL) | pinhole model, 2 · atan(12 mm / f) | math (53,1° and 16,1°) |
| Glied 18 = 43, then 62, 42, 63; „852 655 fehlt auch nach 10^612 Gliedern noch“ | Egg „Die nächste Zahl“ | OEIS A005132 (B. Chaffin, 08.02.2026; R9 S43) | math (terms) + WP18 |
| Robot models and licences („Apache-2.0 oder BSD-3-Clause“) | Egg „Werkbank der Offenen“ | the credits page and `THIRD-PARTY-NOTICES.txt` | WP18 |

Not built in rc5 (WP16 SHOULD, now backlog): the cards on Asimov's laws (1942), Turing, Weizenbaum, Moravec, the 1961 arm and the Urkilogramm (R9 §5.4). Their facts enter this register when they ship.

#### Phase 7 numbers that are not real-world claims

| What | Where | Label / derivation |
|---|---|---|
| Probestart, Startklar „AUFTRIEB n/6 · ENERGIE p % · NAVIGATION“, Startakku 100 %, „Schub über 100 %“ | cover, HUD, Startpult, lift-off | ILLUSTRATIV / FIKTION (D23) |
| Schwebetest: 10 m over the keel block, 15 s; Insel 17; NN-Lage v2; „2 s voraus“ | Startprüfung, lift-off HUD | FIKTION (rc4 chips); the dream line is the toy world model (TRAUM) |
| Duck worlds: hidden friction 0,3–1,0, load 0–150 g, stiffness ±20 %, delay 0–60 ms; training 0,4–1,0, 0–100 g, ±15 %, 0–40 ms; 64 ducks, 12 gait parameters, 20 test runs, success = no fall and ≥ 0,25 m, feet raised up to 2 cm | Regelgarten C | game values (SIM · LIVE); the delay range mirrors R2 §5 (0–3 steps at 50 Hz) |
| Lern-Dojo: top camera 64 × 48, patches 8 × 8, k = 3, 15 steps × 33 ms = 0,5 s, Δ joints ±20°, Rapier 100 Hz, 50 example demos, 40 two-colour demos, 50 evaluations per condition | Lern-Dojo | SIM · LIVE, toy policy |
| Greifwerkstatt C: test weights 20 · 50 · 100 · 200 g, the 100 g gear, „Kiste hinten · 0,35 m“ (the distance from pedestal to box, D44) | Greifwerkstatt C | game values |
| Traumhangar: dream reliable to ≈ 2 s, horizons 0,5 · 2 · 8 s, 200 dreams, mix A „10.000 Träume, offline +40 %“ against B „1.000 geprüfte Träume“, 20 closed-loop runs, crates 2 · 5 · 18 kg, „Deine Augenhöhe 1,70 m“ | Traumhangar | ILLUSTRATIV / TRAUM (toy world model) |
| Schauhalle: Größenwand „Du: 1,75 m · EMI: 1,55 m“ (EMI per D3), loads 1 · 2 · 5 · 18 kg, Lastenheft jobs (200 kg, IP6x and 45°, −20 °C, 12 kg at 0,8 m, 150 kg, 6 kg per arm, 10 kg per arm, 18 kg) | Schauhalle | job requirements, judged against the sourced card values above |
| Sonnenacker: 40 simulated fruits, 12 arms, an 80 s day from 06 to 20 h (D44), calls answered within 10 s, damage 3 %, Wilson ≥ 70 %, LER ≥ 1,5 with crop ≥ 70 %, „Tipp ±5 Punkte“, fruits 25 cm from the bed edge | Sonnenacker | Spielmodell / MODELL / SIM · LIVE |
| Kreislaufhof: 100 parts, purity ≥ 90 %, yield ≥ 70 %, 4 screws; Unkrautacker: 50 plants per field, crop damage ≤ 5 % | Revier scenes | SIM toys |
| Dunkelfabrik: „{n} von 18 Posten ohne Mensch“, „Erst 2030“; the teal arc over the real L3–4 values (D44) | Dunkelfabrik B and C | FIKTION roster (rc4); the L3–4 values are the EmAI autonomy scale (rc1 register, RICHTWERT) |
| Prüffeld C: 6 clips, 3 auditors, 2× | Prüffeld | game values |

#### Quelle fehlt (WP18, 2026-10-19)

1. **LeKiwi's price band „unter 1.000“** (`prices.ts`, flag `unsourcedFigure`): the research has only „low-cost“ (R8 S28). Next step: read the BOM in `SIGRobotics-UIUC/LeKiwi` at the pinned commit `efa608d`, add it to `sources.ts` as a dated QUELLE with its figure, or show the band „auf Anfrage“ until then.

No other new number lacks a source. Three rest on secondary sources that R4 read only as search results; they carry QUELLE and are on the legal list (`docs/LEGAL-REVIEW.md`): the H2 status (R4 S62, unverified), the H2's second price figure (R4 S63, unverified) and Spot's 2020 launch price (R4 S37).

### Phase 6 (2026-10)

Phase 6 adds **no real-world claims**. Its new copy is interface and control text in both languages (loading steps, the boot and graphics messages, the capture hint, „Ton & Text“, the Funk-Log, „näher ran“, the movement card, the jump-pad hint, „Weiter im …“, the R/Space key hints). Changed game values: the Sensordom A star goals now count view switches (★★ ≤ 6, ★★★ ≤ 6 in ≤ 90 s; DECISIONS, awaiting the founder). The certificate no longer prints „Ohne Namen“. Checked: no vendor names, no „Sie“, no prices or contact data in the new strings (lane reviews and the four text audits).

### Added in Phase 5 (2026-10)

| Claim (as shown, DE) | Where | Source | Status |
|---|---|---|---|
| „Die Logo-Scheibe am Turm ist 21 m breit. Von hier aus füllt sie einen Winkel von 13,5°. Mehr zeigt ein Kamerabild nicht: Richtungen und Winkel. Eine 2,1 m breite Scheibe in 8,9 m Abstand sähe genauso aus. Erst die bekannte Breite macht aus dem Winkel einen Abstand: 21 m ÷ (2 · tan 6,74°) ≈ 89 m.“ | Messpunkt card (replaces the anamorphosis text) | Hartley & Zisserman (2004), *Multiple View Geometry in Computer Vision*, 2nd ed., Cambridge University Press, §6.1 (pinhole model x = f·X/Z: one image recovers only the ratio X/Z); the card names the source. Numbers: the game's own geometry (eye (0, 1.65, 94.5) to the dial centre (0, 24, 8.5)), computed in code | math (QA: distance 88.86 m, 2·atan(10.5 / 88.86) = 13.48°, 21 / (2·tan 6.74°) = 88.9 m; 2.1 m at 8.89 m subtends the same angle) |
| „Ein Kamerabild allein misst keine Abstände, es kann sie höchstens schätzen. Frag bei jedem Robotik-Angebot: Womit misst das System Tiefe?“ | Messpunkt card, decision box (unchanged) | Same source, §6.1 | QA (rc2) |
| „Schwarzer Samt: Die Kamera sieht kaum etwas, mein Laser bekommt aus der Nähe noch Punkte.“ / „Mit LiDAR hättest du sie schon aus ein paar Metern gesehen.“ / „Die Segmentierung findet den Samt. Im Kamerabild war er fast unsichtbar.“ | Sensordom capsule (EMI-02) | The zone's Station A sensor matrix (GDD §7.1: velvet = RGB ✗, depth ✗, LiDAR ✓, SEG ✓), already in the game since rc1; wording made more cautious ("aus der Nähe"); no number | Team; qualitative (black velvet reflects very little light, so camera and active depth get weak returns). A content check is welcome (§2) |
| „Auf der Erde kippt der Stab schneller, als du per Taste nachregelst. Ich korrigiere tausendmal pro Sekunde.“ | Regelgarten A (EMI-03, after an Earth fall) | Restates registered facts: τ Earth 0.18–0.37 s (math, rc1 register) against a human reaction ≈ 0.2 s (Woods et al. 2015, rc1 register); 1000/s is the toy controller's own rate (SIM · LIVE), as in the existing B line „misst tausendmal pro Sekunde“ | Team |

**Removed in Phase 5:** „Nur von hier ergibt die Skulptur exakt das Logo.“ and „Ein einzelnes Kamerabild verliert die Tiefe: Alles auf einem Strahl landet im selben Pixel.“ (the mark is exact from everywhere now; the card was rewritten), „Nach 20 bis 30 m öffnen sich die Bögen sichtbar zur 3D-Skulptur. Sie stehen bis zu 4,4 m vor der Scheibe.“ (the fan is gone), the caption „Drei Punkte, ein Strahl, ein Pixel.“ (now „Gleicher Winkel, anderer Abstand: gleiches Bild.“).

**New numbers that are not real-world claims:** the Regelgarten A controller F = 2x + 5ẋ + 300θ + 50θ̇ (±20 N, 1 kHz), the 3.6 s demo with 3,600 corrections and two 30 N pushes (SIM · LIVE); the Regelgarten C random-world ranges (pole 0.5–1.5 m, mass 0.5–1.5 kg, cart 3–7 kg, damping 0–2, noise 0–1°, latency 0–40 ms, gusts 10–45 N), shown in the C card's „ranges“ line; „Solarreihe verstellen“ / „Knock the solar row off aim“ with the toy's own measured settle time („Nachgeregelt in x s“); star thresholds (L1 7 / 5 s, L2 5 / 4 s + 2 demos, R3 ≥ 90 %). The PV rows carry no label and the game makes no claim that they power the island or its flight. No new claims in the HUD, map or integrator changes („Eingang Süd“ is a direction).

### Added in Phase 4 (2026-10), still valid

| Claim (as shown, DE) | Where | Source | Status |
|---|---|---|---|
| a(n) = a(n−1) − n, wenn das positiv und neu ist, sonst a(n−1) + n | Allee plaque, tower drawing labels („7 − 6 = 1: schon da ✕ → a(6) = 13“) | OEIS A005132 (Recamán's sequence, N. J. A. Sloane, ed.) | QA (equivalent to OEIS's "nonnegative and not already in the sequence", because 0 = a(0)); `recamanSteps()` checks itself against the mark at import |
| „17 Bögen – das EmAI-Zeichen“: the first 17 steps 0, 1, 3, 6, 2, 7, 13, 20, 12, 21, 11, 22, 10, 23, 9, 24, 8, 25 are the mark's arcs | Allee number line popup | Brand construction (GDD Appendix A) | Own brand spec; `logo-check` verifies the built tubes against it |

**New numbers that are not real-world claims** (labelled in the game or plain arithmetic):

| What | Where | Label / derivation |
|---|---|---|
| „LAGE max° → 0,04° in t s · n Korrekturen“, n = t × 1000 | Libelle gust readout | FIKTION (the island's 1000 Hz loop) |
| „Nachgeregelt in x s“ | PV row toy (Phase 5; was the solar-tree service panel) | the toy's own simulated settling (second-order step, 8 % overshoot, 1.2 s), no claim |
| Year „Ein Jahr später“: 250 ruhige, 85 böige, 30 Sturmtage | Finale F3 (on the Messwand since Phase 5) | „Wetterjahr erfunden · ein Versuch = ein Tag“, applied to the player's own F2 rates (SIM · LIVE) |
| „Die Nacht hat 480 davon“ | Dunkelfabrik D1 banner | 8 h × 60 min (arithmetic); Station 7 is FIKTION |
| Robot 3 crates per minute | Dunkelfabrik D1 race | Station 7's fictional 20 s Takt (FIKTION chip) |
| „Bei 1.000 Griffen pro Schicht ≈ n Nacharbeiten“ | Prüffeld P2 (Entscheider) | 1000 × (1 − measured rate) of the player's SIM run; Beispielschicht ILLUSTRATIV |
| „Deine Demos: Ø x s → Policy: y s“ | Lern-Dojo L2 | the player's live demos and the k-NN rollout (SIM · LIVE) |
| Coverage 40/60/80/100 % | Dunkelfabrik Waage | „Deine Annahme, kein Messwert“ (ILLUSTRATIV); 80 % keeps RICHTWERT |
| Greiftoleranz ±5 cm; safe distances Labor 3 m, Gegenlicht 1 m | Sensordom C | „Spielwert“ (ILLUSTRATIV); distances from the existing toy model σ(z) = 2 mm · z² |
| Wilson bands of the player's own runs, „Bänder getrennt“ | Greifwerkstatt G3, Prüffeld P2 | SIM · LIVE (existing maths) |
| Star thresholds (e.g. ★★★ ≤ 60 s, 9 crates, κ ≥ 0.9) | all challenges | game values, not claims |

### rc1 register (still valid)

#### Statistics and history (QUELLE)

| Claim (as shown, DE) | Where | Source | Status |
|---|---|---|---|
| 768.000 fehlende Fachkräfte in Deutschland 2028 (Prognose) | 05 Dunkelfabrik, Quellen-Tafel | IW Köln, IW-Report 34/2025 (press release 14 Jul 2025, Burstedde/Tiedemann) | Team + QA (IW press release) |
| 34,5 Menschen ab 65 je 100 im Alter 15–64, EU 2025 | 05, Quellen-Tafel | Eurostat, old-age dependency ratio, 1 Jan 2025 (Statistics Explained "Population structure and ageing") | Team + QA |
| 449 Industrieroboter je 10.000 Beschäftigte in der Industrie, DE | 05, Quellen-Tafel | IFR World Robotics 2025 (data 2024), manufacturing | Team + QA (IFR press release; DE ranks 3rd–4th depending on edition, the game shows no rank) |
| Seit 2001 bauen bei einem japanischen Roboterhersteller Roboter im Dunkeln Roboter, bis zu 30 Tage ohne Aufsicht | 05, plaque on the gallery | Business 2.0 / CNN Money, "Fade to Black", June 2003 (anonymised per D6) | Team + QA (secondary sources citing the article agree on 2001 and "up to 30 days"; the original article page was not opened) |

#### Studies (STUDIE)

| Claim (as shown) | Where | Source | Status |
|---|---|---|---|
| Ei-Aufgabe: nur Kamera 50 %, mit Tastsinn 85 %, je 20 Versuche | 03 Greifwerkstatt C (prediction, rig, card) | Huang et al., 3D-ViTac, CoRL 2024, arXiv 2410.24091, Table 1 "Egg Steaming", whole task: RGB only 0.50, point cloud + tactile points 0.85, 20 episodes | Team + QA (Table 1 read). Note: "mit Tastsinn" is the paper's point-cloud + tactile policy |
| Eine Roboterhand übte rund 13.000 simulierte Jahre in Zufallswelten, um einen Zauberwürfel zu drehen | 02 Regelgarten C, Für Neugierige | Akkaya et al. 2019, arXiv 1910.07113 (no company name per D6; the hand turns the cube, a solver plans the moves) | Team + QA |
| Ein Mensch reagiert im Mittel in rund 0,2 Sekunden | 02 Regelgarten A card (Entscheider), diagram caption | Woods et al. 2015, Front. Hum. Neurosci. 9:131 (mean simple RT 213 ms after hardware correction, n = 1,469) | Team + QA |
| Cohen's κ ab 0,8 gilt als starke Übereinstimmung | 06 Prüffeld C card, EMI line, panel | McHugh 2012, Biochemia Medica 22(3):276–282, Table 3 (.80–.90 strong, > .90 almost perfect) | Team + QA (table read) |
| Ein offener Forschungsdatensatz brauchte 50 Personen und 12 Monate für 76.000 Demos | 04 Lern-Dojo A card (Entscheider) | Khazatsky et al. 2024 (DROID), arXiv 2403.12945 | Team + QA (dataset cards repeat 76k / 50 collectors / 12 months) |
| Action Chunking: mehrere Schritte auf einmal, so summieren sich weniger Fehler | 04 Lern-Dojo B card | Zhao et al. 2023 (ACT), arXiv 2304.13705 | Team |
| In einem offenen Datensatz begann jede Demo mit einer Null-Aktion; trainierte Policies froren oft ein | 04 Lern-Dojo C card | Kim et al. 2024, arXiv 2406.09246, Appendix C („an all-zero action was recorded … in the first timestep“; policies „froze during evaluations“) | Team + QA (appendix read) |
| VLA (Vision-Language-Action-Modell): Sehen → Verstehen → Handeln | 04 Gehirn-Fenster, card B diagram | Brohan et al. 2023 (RT-2), arXiv 2307.15818 | Team (term) |
| Klares Glas lässt den Laser fast ganz durch; für LiDAR meist Luft; Spiegel erzeugen Geisterpunkte bei d₁ + d₂ | 01 Sensordom B card, album | Fresnel reflection ≈ 4 % per surface (≈ 92 % transmitted at normal incidence); Foster et al., VisAGGE, ICRA 2013 (glass invisible to LiDAR at most angles); arXiv 2406.10494 (mirror reflections in LiDAR scans) | Team + QA (paper pages; the 92 % is optics, not shown as a number) |
| Bei Stereo-Kameras wächst die Unsicherheit mit dem Quadrat des Abstands; σ_z ≈ z² · σ_d ÷ (f · B) | 01 Sensordom C card | Stereo error propagation (textbook); RealSense depth-tuning guide; arXiv 1705.05548 | Team |
| Datenblattwerte gelten unter Testbedingungen, oft für eine helle, flache Wand in 2 m Abstand | 01 Sensordom C card (Entscheider) | Depth-camera datasheets, test-condition sections (vendor-neutral wording) | Team |
| Segmentierung ist kein Sensor: ein KI-Modell beschriftet die Daten (Glas und Spiegel sind schwer) | 01 Sensordom A card | Yang et al. ICCV 2019; Xie et al. ECCV 2020 | Team |

#### Physics and mathematics (recomputed)

| Claim (as shown) | Where | Check | Status |
|---|---|---|---|
| τ = √(2L ÷ 3g): Erde 0,5 m 0,18 s · Erde 2 m 0,37 s · Mond 2 m 0,91 s; τ = Zeit, in der die Neigung um das 2,7-Fache wächst | 02 Regelgarten A | Linearised uniform rod on a fixed pivot, λ = √(3g/2L): 0.184 / 0.369 / 0.907 s | QA math |
| 16 von 20 → 58–92 %; 80/100 → 71–87 %; 146/200 → 66–79 % | 03 C card, 06 B card | Wilson 95 %: 0.584–0.919, 0.711–0.867, 0.665–0.789 | QA math |
| 5 von 5 → 57–100 % | 06 A card, EMI | Wilson 95 %: 0.566–1.000 | QA math |
| 58 % bei n = 100 → 48–67 % | 04 C card (Entscheider) | Wilson 95 %: 0.482–0.672 | QA math |
| Bei n = 20 bis zu ±20 Prozentpunkte; viermal so viele Versuche, etwa halbe Breite | 03 C | Wilson half-width at p = 0.5, n = 20: 0.201; width ∝ 1/√n | QA math |
| Es hält, wenn 2 · μ · F_N ≥ m · (g + a); Reibungskegel mit halbem Öffnungswinkel atan μ | 03 B | Coulomb friction, two-jaw grip | QA |
| Drehmoment = Gewichtskraft × Hebelarm; 18 kg → 177 N | 05 A report, Waage | 18 × 9.81 = 176.6 N | QA math |
| 28.800 s ÷ 20 s = 1.440 Hübe × 18 kg = 25,9 t | 05 A report | 1,440 × 18 kg = 25,920 kg | QA math |
| Gebückt hängt die Kiste oft doppelt so weit vor der Wirbelsäule | 05 A report, Für Neugierige | Qualitative ergonomics (moment arm ≈ 0.3 m upright vs ≈ 0.6 m bent); no single source | Kept as a qualitative "oft"; human check by an ergonomist welcome |
| LiDAR: Abstand = Lichtgeschwindigkeit × Laufzeit ÷ 2 | 01 A card, overlay | Time of flight | QA |
| κ = (p_o − p_e) ÷ (1 − p_e) | 06 C | Cohen 1960 | QA |
| 1000 Korrekturen pro Sekunde = 86,4 Millionen am Tag | Kielraum M5 post, ending line ("86 Millionen seit gestern Abend") | 1,000 × 86,400 s | QA math |
| Mein Arm hat sieben Achsen, so viele wie deiner | 03 EMI | The human arm is usually modelled with 7 DoF; EMI's arm has 7 revolute joints (EMI Rover params) | Team |
| EMI: 17 Drehgelenke plus 2 Räder, 1,55 m | 03 A card, everywhere | EmAI EMI Rover params (DECISIONS D3) | Own product spec |

#### Guide values and EmAI assessments (RICHTWERT)

| Claim | Where | Source | Status |
|---|---|---|---|
| Gehirn-Stapel: Reflex ≤ 1 kHz, Skill 30–200 Hz, Planer wenige Hz; Faustregel RL / VLA / WAM | 02 B card, tower card, Kielraum | EmAI assessment 2026 | Labelled „Richtwert, EmAI 2026“ |
| Autonomiestufen L0–L5, Aufsicht, Haftung, „realistisch“ per gesture (z. B. Inspektion L3) | 05 C Leitstand | EmAI autonomy scale, workshop handout w01, based on SAE J3016 | Labelled with source line |
| „Pilot, nicht Serie (2026)“; Cobot passt / kognitiver Roboter plausibel als Pilot | 05 B roster feedback | EmAI assessment 2026, workshop handout | Labelled |
| Cobot-Zelle: Anschaffung (Cobot, Greifer + Sensorik, Integration, Rechner), Vollkosten 85 k€/Jahr | 05 B Waage | EmAI workshop handout w02 | RICHTWERT chip; OPEX line „Beispielrechnung“ |
| μ-Werte (Stahl, Gummi, Silikon auf Ei, Glas, Mehlsack) | 03 B Reibungstisch | Rounded textbook ranges; no primary source per pair | Labelled „Richtwerte, keine Messung“ (kept) |
| Eischale bricht bei ≈ 30–40 N → Spielzeugmodell 30 N | 03 B | Quasi-static egg compression studies (agricultural engineering) | Labelled toy value |
| Ultraschall: 3 Kegel · 3 m · ±15° | 01 B overlay | Typical ultrasonic range-finder beam (game parameter) | Overlay label of EMI's sensor model |

#### Illustrative, toy-model and fictional values (labelled in the game)

| What | Where | Label |
|---|---|---|
| Depth-noise model σ(z) = 2 mm · (z / 1 m)², Gegenlicht ×2,5, 5 % dropouts/m | 01 C | „Spielzeugmodell“ chip, card note |
| Cart-pole parameters, Takt/Latenz table, CEM worlds | 02 | „echte Optimierung, Spielzeugmodell“ |
| Grip stiffness 8 N/mm, wear ×(1 − 0,3 · Zyklen/1 Mio.), vibration −5 points | 03 | „Spielzeugmodell“ source lines, wear wall ILLUSTRATIV |
| 250-demo dataset, 35-episode dead block (14 %), success model 58 → 72 → 78 → 80 % | 04 C | ILLUSTRATIV · „anonymisiertes Muster, keine Kundendaten“ |
| Station 7 (18 kg, 41 °C, 20-s-Takt), roster ages, retirement at 65, one hire every 2 years | 05 | FIKTION / ILLUSTRATIV chips |
| Intervention rates per autonomy level, MRC 30 min | 05 C | „Werte aus dem Spielzeugmodell“, card note |
| Messzelle model p(t) = 0,96 · f_T · f_V · f_L · f_D(t) (≈ 69 % at 44 °C, n = 200), torque drift | 06 B | „Spielzeugmodell“, card note |
| Hersteller X, its demo (5/5, best of 40, 500 lux) and answers | 06 A | FIKTION („Hersteller X ist erfunden. Die Fragen sind echt.“) |
| NN-Lage v2, „99 % stabil“, θ″ = λ²θ + …, λ = 0,8 s⁻¹, 150 ms delay | Kielraum F1–F2 | FIKTION + toy-model line |
| Schwebewerk, Insel 17, 1000 Hz island loop, 0,04° tilt, 180 m to the cloud deck, rotors M1–M6/T1–T4 | island | FIKTION plaques („Der Regelkreis dahinter ist echt.“) |
| „92 % bei n = 200, falsifiziert, falls < 80 % bei 45 °C“ | 06 B card (Entscheider) | Brand example of a falsifiable claim |

#### Removed or anonymised in the polish pass

| Former claim | Why | Now |
|---|---|---|
| „Roboterhände verschleißen oft in unter einem Jahr“ | No primary source | Removed; „Frag nach dem Tauschintervall in Zyklen“ |
| „Reichweite und Traglast gelten nie gleichzeitig maximal“ | Over-generalised | „Frag nach dem Lastdiagramm“ |
| „Der kurze Stab kippt in 0,18 s“ | τ is an e-folding time, the untouched pole falls in ≈ 0,64 s | τ defined correctly |
| „Für LiDAR ist Glas Luft“ | Glass reflects near normal incidence | „meist Luft“ |
| „Kein Prospekt sagt das“ | Vendor docs do state the z² law | Removed |
| IW Köln 728.000 (2027) | Superseded | 768.000 (2028), IW-Report 34/2025 |
| Vendor names (lights-out plaque, Rubik's-cube study) | DECISIONS D6 | Anonymised, sourced |

## 6. Gallery

Release set, rc3 → rc4 (1280×720, production builds, not committed). Generated by the verify stage with the same tools on both trees (rc3 in a temporary worktree of `a0ed8fc`): the release gallery `node tools/gallery.mjs --out <dir>` (DE Entdecker), `node tools/shots-all.mjs`, and fixed cinematic cameras with the HUD hidden and the environment frozen (verify `critic.mjs`). Side-by-side and difference images are in the verify scratch folder (`gsbs/`, `critic-diff/`, `gallery-diff/`). Older sets: rc3 `artifacts/phase5/verify/`, rc2 `artifacts/phase4/verify/`.

| View | rc3 → rc4 |
|---|---|
| `title.png`, critic `title-de/en.png` | „Deutsch · English“ on a dark backplate (was a grey DE/EN at 1.2:1), Start with a visible focus ring, „H Hilfe“ in the key row, the dark gradient reaches further right (text on the island stays readable). EN title for a non-German browser (D12) |
| loading shell on slow 4G (`shell-de-1_5s.png`) | A blank page for 2.7 s → the brand mark, „EmAI Academy“, a moving bar and „Insel wird geladen“ after 0.2 s |
| `arrival.png`, `hub.png`, `dusk-aerial.png`, critic spawn, Allee, plaza, hub aerial, 90 m aerial, wide, underside | Unchanged look (mean difference 0.1–0.6/255; moving rovers, drones and EMI-01 aside); the gust column is turned (W3). Renderer calls per view about halved (e.g. 90 m aerial 502 → 236, underside 505 → 241) |
| critic `logo-front/offaxis/side.png`, `dusk-logo.png` | The mark is unchanged (0.02–0.24/255); brand-check passes |
| critic `kanzel*.png` | Unchanged; the trim rotor's spin phase differs |
| critic `libelle.png` | Unchanged at a distance; from the plinth edge the top is now one clean ceramic surface (the z-fight is gone, §1c) |
| `kielraum.png`, critic `kiel.png` | Unchanged room; the HUD shows the new compass strip and „[H] Hilfe“ |
| zone views (`sensordom-*`, `regelgarten`, `greifwerkstatt`, `lern-dojo`, `dunkelfabrik*`, `prueffeld`) | Unchanged scenes (0.1–1.1/255; the LiDAR and mirror views are randomly sampled point clouds); HUD copy as intended: Z2 goal chips („Höchstens 6 Sensorwechsel“), Z3 key hints („Leertaste: übernehmen“), the zone title below the taller compass |
| `certificate.png` | „Ohne Namen“ → the audit title on the big line; values wrap instead of „…“ (W7) |
| critic `hud-plaza-1280-150.png`, `hud-banner-1280-150.png`, `hud-banner-2560-150.png` | New: the HUD at 150 % text size (objective, banner, key caps scale; the compass stays); the movement card „// Steuerung“ and the plaza beacon (W5) |
| shots-all (`hub`, zones) | Same world; rc4's run is in English (D12 with Playwright's en-US), so floor lettering and HUD differ |
