# Legal review package (Phase 7, rc5)

The checklist of plan §8.3 for the founder and a lawyer, **before any public link**. Each item says what ships, under which licence, in which files, which notice the player sees, what is still open and who decides. Prepared by WP18 on 2026-10-19 from the build of tag `p7-w2` plus the wave-3 docs pass; the facts behind every number are in `docs/RELEASE.md` §5 („Phase 7“).

Roles: **L** = the lawyer advises · **F** = the founder decides and signs off. Tick a box when the item is cleared. An item that is not cleared before the public link is shipped without that content (each amber or flagged model can be removed without breaking a game mechanic, see item 2).

**The public build (2026-10-22, branch `p7/pages`; the founder's call before the review is done):** the site at https://raasaar-org.github.io/academy-world/ (`.github/workflows/pages.yml`, unlisted: `noindex, nofollow`) ships the safe subset: without the four amber exhibits of item 2 (one build switch, `VITE_AMBER`, off by default: `src/core/release.ts`) and with the specific Unitree line of items 0 and 3. Everything else in items 1 and 3–9 ships as described below and is still open.

## 0. What the build produces (checked 2026-10-19, `npm run build`)

**Public build (2026-10-22, `VITE_AMBER` unset, the default):** `THIRD-PARTY-NOTICES.txt` has 1,493 lines with 20 robot-model entries (the five amber entries, Spot with Arm included, and their five licence texts are left out by `tools/notices-plugin.mjs`); `dist/licenses/robots/` holds 8 files (`Apache-2.0.txt`, `BSD-3-Clause-ANYbotics.txt`, `BSD-3-Clause-Unitree.txt`, `BSD-3-Clause-Unitree-Go2-Menagerie.txt`, `BSD-3-Clause-UR5e-ROS-Industrial.txt`, `LICENSE-franka_fr3-Menagerie.txt`, `NOTICE-franka_description.txt`, `NOTICES.txt`); `dist/` holds 41 GLBs (20 models with their silhouettes and `lineup-noamber.l2.glb`). The table below is the full build of 2026-10-19, which `VITE_AMBER=1 npm run build` still produces (now 1,722 lines: the Unitree line adds 7).

| Output | Status | Notes |
|---|---|---|
| `dist/THIRD-PARTY-NOTICES.txt` (1,715 lines) | **produced** by `tools/notices-plugin.mjs` and `vite.config.ts` (`emai:mujoco-notice`) | SOFTWARE: `@dimforge/rapier3d-compat` 0.21.0 (Apache-2.0), `bidi-js` 1.1.0 (MIT), `postprocessing` 6.39.5 (Zlib), `three` 0.186.1 (MIT, with the bundled meshoptimizer decoder's own MIT notice), `troika-three-text`, `troika-three-utils`, `troika-worker-utils` (MIT), `webgl-sdf-generator` 1.1.1 (MIT), `@mujoco/mujoco` 3.16.0 (Apache-2.0, the duck worker). FONTS: Space Grotesk, Geist, Geist Mono (OFL 1.1, the full licence text); the 3D text's fallback glyphs (troika's unicode-font-resolver, MIT; Noto Sans Greek, OFL 1.1). ROBOT MODELS: 25 entries, each with the model URL at its commit, the licence, the copyright line and the attribution line, followed by verbatim licence copies and the Franka NOTICE |
| `dist/licenses/` | **produced** (a copy of `LICENSES/`) | `OFL-1.1.txt`; `npm/` (11 licence files); `robots/` (13 files: `Apache-2.0.txt`, the BSD-2/BSD-3 and MIT copies per source, `LICENSE-franka_fr3-Menagerie.txt`, `NOTICE-franka_description.txt`, `NOTICES.txt`); `dist/fonts/unicode-resolver/font-files/LICENSE` |
| Credits page „Credits & Lizenzen“ | ships (`src/ui/Credits.ts`, `src/core/credits.ts`, generated `src/robots/credits.ts`) | linked from the title, the pause menu and the Schauhalle; it links the same-origin files in `licenses/` |
| UR path check | ships (`tools/robots/check.mjs`, `tools/robots/sources.mjs`) | the robot build stops on any UR8 Long / UR15 / UR18 / UR20 / UR30 mesh path |

**Missing in the build:**
1. ~~The Unitree clause-3 line of plan §8.3 item 3 appears nowhere.~~ **Ships since 2026-10-22 (`p7/pages`):** the credits page reads „Keine Verbindung zu Unitree Robotics und keine Empfehlung durch Unitree Robotics.“ / "No affiliation with or endorsement by Unitree Robotics." after the general disclaimer (`CREDITS.unitree` in `src/core/credits.ts`), and the notices carry the English line under each of the seven Unitree entries (R1, G1, G1 with Dex3-1, H1, H1-2, H2, Go2; `UNITREE_NO_ENDORSEMENT` in `tools/robots/sources.mjs`, written by `tools/robots/build.mjs` into `LICENSES/robots/NOTICES.txt`). The general lines stay. The Traumhangar plaques do not carry it.
2. No courtesy note to the vendors of the amber models has been sent (plan §8.3 item 2): that is F's call.

Nothing else from plan §8.3 item 6 is missing.

## 1. Open Duck Mini v2 (trade dress) · [ ] L · [ ] F

| | |
|---|---|
| What ships | The Open Duck Mini v2 model: 64 instanced ducks in Regelgarten C „Lauf, Ente!“ and one plinth in the Schauhalle (SELBST BAUEN). Neutral white and greys (every saturated source colour became the grey of its luminance, D29); 9 hidden internal meshes removed (charger, BMS, IMU, boards, cells, holder, Raspberry Pi), visible servo cases kept |
| Licence | Apache-2.0, `apirrone/Open_Duck_Mini` @ `b23317a` |
| Files | `src/robots/glb/open-duck-mini-v2.glb`, `open-duck-mini-v2.l2.glb`; `src/robots/manifest.ts` (entry and `legalNote`); `LICENSES/robots/Apache-2.0.txt`, `LICENSES/robots/NOTICES.txt` |
| Notice text | „Open Duck Mini v2: 3D-Modell von Antoine Pirrone und den Mitwirkenden des Open-Duck-Projekts, Apache-2.0; von EmAI nach glTF konvertiert und vereinfacht, innenliegende Elektronik entfernt.“ Player text: „Open Duck Mini, ein offenes Projekt“ |
| Checked | No player text names Disney, BDX, Star Wars or „droid“ (grep of `src/`: only code comments and the manifest's internal `legalNote`) |
| Open question | The design derives from a film-character robot of an entertainment company (upstream README: „a miniature version of the BDX Droid by Disney“). Is a company-published game showing it a trade-dress or design-right risk? The upstream path `mini_bdx/robots/open_duck_mini_v2/robot.urdf` appears verbatim in the notice's model URL: may it stay (it identifies the source)? |
| Fallbacks | ToddlerBot (MIT), ROBOTIS OP3 (Apache-2.0); not built (a swap is a new WP0 pipeline run plus WP5's duck tuning) |
| Who decides | L advises, F decides: keep, or swap to a fallback before the public link |

## 2. Amber models, exhibits only · [ ] L · [ ] F

No delivery or load point depends on them, and no other area (Prüffeld, Dunkelfabrik, the Revier, life, the lift-off guests) uses these models (checked 2026-10-22). Correction to the earlier header note: three Lastenheft jobs had an amber robot as their only answer (Paletten: MiR250, Kälte: Spot, Cobot: LBR iiwa 14) and the trick job showed Spot. Without the amber set those jobs leave the pool, the trick job shows the Go2 and the ANYmal D (the Go2's speed as the distractor), and an early round, when only the „Bestand“ robots stand, is topped up with the second „Keiner passt“ job so it still has three jobs (★★ needs 3 of 3; `src/zones/schauhalle/{data/jobs.ts,lastenheft.ts}`). So a „no“ removes four plinths without breaking the station.

**Public build (2026-10-22): not shipped.** With `VITE_AMBER` unset (the default, `src/core/release.ts`) the Schauhalle stands 17 robots (21 with the switch on): no plinth, stand plate, Datenblatt card, price band, Vorführung or Größenwand entry of Spot, MiR250, LBR iiwa 14 or 2F-85; the radio line after the Kistenwaage drops its MiR250 sentence; the credits page and `THIRD-PARTY-NOTICES.txt` do not list them; `dist/` holds none of their GLBs (Spot with Arm included) and uses `lineup-noamber.l2.glb` instead of `lineup.l2.glb`, which contains their geometry (`vite.config.ts` „amber gate“ fails the build if one slips in). The source GLBs and their `LICENSES/robots/` texts stay in the repository. Their card data (names, attribution lines, rows) is still in the JavaScript bundle but never shown. After clearance, `VITE_AMBER=1` in the build (`.github/workflows/pages.yml`) brings all of it back.

| Model | Licence and licensor | Notice text (DE, as shipped) | Open question |
|---|---|---|---|
| Boston Dynamics Spot (and „Spot mit Arm“, whose GLB also ships in `dist/` though only Spot has a plinth) | BSD-3-Clause (Clearpath Robotics 2021) and MIT (RAI Institute 2023–2024) via MuJoCo Menagerie; licensor is not Boston Dynamics, origin of the geometry undocumented | „Spot: 3D-Modell © 2021 Clearpath Robotics (BSD-3-Clause) und © 2023–2024 RAI Institute (MIT) über MuJoCo Menagerie; von EmAI nach glTF konvertiert und vereinfacht. Spot ist eine Marke von Boston Dynamics.“ | Does a licence from a third party cover a vendor's product geometry? Courtesy note to Boston Dynamics? Drop the unused `spot-arm` GLB from the build? |
| MiR250 | BSD-3-Clause, DFKI GmbH (`mir_robot`); licensor is not MiR, mesh origin undocumented | „MiR250: 3D-Modell © 2018–2022 Martin Günther (DFKI GmbH) und Mitwirkende (mir_robot), BSD-3-Clause; …“ | same |
| KUKA LBR iiwa 14 R820 | BSD-3-Clause, Drake (Robot Locomotion Group @ CSAIL) via Menagerie; licensor is not KUKA | „LBR iiwa 14: 3D-Modell aus Drake (© 2012–2022 Robot Locomotion Group @ CSAIL) über MuJoCo Menagerie, BSD-3-Clause; …“ | same; its weight row (29,9 kg) comes from RoboDK (R4 S43, secondary, unverified) |
| Robotiq 2F-85 | BSD-2-Clause, ROS-Industrial via Menagerie; licensor is not Robotiq | „Robotiq 2F-85: 3D-Modell © 2013 ROS-Industrial über MuJoCo Menagerie, BSD-2-Clause; …“ | same |

Files: `src/robots/glb/{spot,spot-arm,mir250,kuka-iiwa-14,robotiq-2f85}{,.l2}.glb`; `LICENSES/robots/{BSD-3-Clause-Spot-Clearpath,MIT-BSD-3-Clause-spot_description-RAI,BSD-3-Clause-mir_robot-DFKI,BSD-3-Clause-Drake-iiwa14,BSD-2-Clause-Robotiq-2F-85-ROS-Industrial}.txt`; the `amber: true` flag in `src/zones/schauhalle/data/robots.ts`. Reserves: Kinova Gen3, FANUC CRX-10iA (not built). **Who decides:** L advises per model; F decides keep or remove and whether to send the courtesy notes.

## 3. Unitree (R1, G1, G1 with Dex3-1, H1, H1-2, H2; Go2 via Menagerie) · [ ] L · [ ] F

| | |
|---|---|
| What ships | The Traumhangar's R1, G1, H1-2 and H2 (playable, kinematic animation, never Unitree's walking controller), the Go2 and the line-up in the Schauhalle, the H2 behind its cover („Tresor“) |
| Licence | BSD-3-Clause, `unitreerobotics/unitree_ros` @ `5994d4f` („Copyright (c) 2016-2022 HangZhou YuShu TECHNOLOGY CO.,LTD. ("Unitree Robotics")“); Go2: BSD-3-Clause via MuJoCo Menagerie @ `62ab00f` |
| Files | `src/robots/glb/unitree-*.glb`; `LICENSES/robots/BSD-3-Clause-Unitree.txt`, `BSD-3-Clause-Unitree-Go2-Menagerie.txt`; `src/zones/traumhangar/strings.ts` (plaques), `src/zones/schauhalle/data/{robots,sources,prices}.ts` |
| Notice text | „Unitree G1: 3D-Modell von Unitree Robotics (unitree_ros), BSD-3-Clause; von EmAI nach glTF konvertiert und vereinfacht.“ (each model likewise); the BSD-3 text in `licenses/` and in `THIRD-PARTY-NOTICES.txt` (clause 2, binary form) |
| Datasheet plaques | Traumhangar: „Datenblatt: {robot}“ with weight, joints, arm load, speed, battery; source line „Unitree-Produktseiten, abgerufen am 17.10.2026 (R3 §1.1)“, date „Stand 17.10.2026“, credit „3D-Modell: {vendor} · {spdx}“; the H2 sheet „Nennlast ≈ 7 kg, Spitze ≈ 15 kg“ (HERSTELLERANGABE). Every value is in RELEASE §5 („Unitree“) |
| Trademark | „UNITREE“ is a registered US word mark; no public brand policy was found (R3 §2.2). The G1's moulded lettering stays as part of the real object (in the torso mesh); no Unitree logo anywhere else |
| Checked | No third-party hand meshes on Unitree models (Inspire, BrainCo, Sharpa are rejected by path; the Dex3-1 hands are Unitree's own) |
| Open questions | (a) Clause 3 (no endorsement): is the general disclaimer enough, or must the specific line „Keine Verbindung zu Unitree Robotics und keine Empfehlung durch Unitree Robotics.“ ship (missing, item 0)? (b) May the game quote the vendor's datasheet values and the list price (item 7) with the name, as nominative use? (c) The Traumhangar line „Unitrees eigenes Weltmodell ist nicht kommerziell lizenziert.“ states a third party's licence (R3: UnifoLM-WMA-0 is CC BY-NC-SA 4.0): fine as worded? (d) The H2's status „angekündigt“ rests on an unverified secondary source (R4 S62) |
| Who decides | L advises (a)–(d); F signs off |

## 4. LeKiwi (flagged in WP0's manifest) · [ ] L · [ ] F

| | |
|---|---|
| What ships | The mobile base only (`lekiwi-base`): the Sonnenacker's crate rovers carry an SO-101 on it; one plinth in the Schauhalle (SELBST BAUEN) |
| Licence | Apache-2.0 at repository level, `SIGRobotics-UIUC/LeKiwi` @ `efa608d` (`LICENSE.txt`, `CITATION.cff`); no other terms in the README, the BOM or the mesh folders. WP0's licence gate (R5) rated it **green** |
| Files | `src/robots/glb/lekiwi-base{,.l2}.glb`; `src/robots/manifest.ts` (`legalNote`); `tools/robots/REPORT.md` („LeKiwi licence gate“); `LICENSES/robots/Apache-2.0.txt` |
| Notice text | „LeKiwi: 3D-Modell von SIGRobotics-UIUC (Pepijn Kooijmans, Manav Chandaka, Bhargav Chandaka, Gloria Wang, Advait Patel), Apache-2.0; von EmAI nach glTF konvertiert und vereinfacht, nur die Fahrbasis.“ |
| WP0's flag | The URDF bundles vendor part models (Feetech ST3215 servos, omni wheels, a battery, a USB camera) whose provenance is undocumented, as with the SO-101's servos and the duck's; the McMaster-Carr standoffs (catalogue CAD) are left out by path |
| Price band | „unter 1.000“ with **no sourced figure** (`prices.ts`, `unsourcedFigure`; RELEASE §5 „Quelle fehlt“) |
| Open questions | (a) Does a repository-level Apache-2.0 cover vendor CAD inside the URDF (same question for the SO-101 and the Open Duck servos)? (b) Keep the band, source it from the BOM, or show „auf Anfrage“? |
| Who decides | L advises (a); F decides (a) and (b) |

## 5. Trademarks everywhere · [ ] L · [ ] F

| | |
|---|---|
| What ships | Real robots named only to identify the product (D15, D32); no vendor logos beyond the model geometry; „Hersteller X“ stays fictional and no real robot appears in its critique; vendor names of the generic use-case machines only in source lines and Entscheider cards (Kreislaufhof: AMP Robotics; Unkrautacker: FarmDroid, Ecorobotix, Carbon Robotics; the certificate's Befundkarte) |
| Disclaimer, Schauhalle | `src/zones/schauhalle/strings.ts` `disclaimer`, on the entrance sign's card: „Alle Namen und Marken gehören ihren Inhabern. Kein Hersteller hat diese Halle geprüft oder unterstützt.“ / „All names and trademarks belong to their owners. No manufacturer has reviewed or endorsed this hall.“ |
| Disclaimer, credits | `src/core/credits.ts` `CREDITS.disclaimer`: „Die Hersteller haben dieses Spiel weder geprüft noch unterstützt. Alle Namen und Marken gehören ihren Inhabern.“; the notices file: „The makers have neither reviewed nor endorsed this game. All names and trademarks belong to their owners.“ |
| Open questions | (a) Are the two disclaimers enough for every named product? (b) Apollo's hands are PSYONIC Ability Hand meshes inside Apptronik's Apache-2.0 release (manifest `legalNote`): is their provenance acceptable, as with the amber set? |
| Who decides | L advises; F signs off |

## 6. Notices · [ ] L

| Family | What | Where it ships | Status |
|---|---|---|---|
| Apache-2.0 | SO-ARM100 (SO-101 follower and leader), Open Duck Mini v2, the Menagerie-derived Apache models (TALOS, TIAGo, Stretch 3, Apollo, Shadow Hand, FR3), LeKiwi, FANUC R-2000iC/165F (`fanuc_description`) | `licenses/robots/Apache-2.0.txt`, per-model entries in `THIRD-PARTY-NOTICES.txt`; each attribution ends „von EmAI nach glTF konvertiert und vereinfacht“ (Apache §4b) | produced |
| Apache NOTICE (§4d) | Franka „franka_description · Copyright 2023 Franka Robotics GmbH“ | `licenses/robots/NOTICE-franka_description.txt`, verbatim in the notices; the attribution says „(NOTICE beigefügt)“ | produced |
| BSD-2 / BSD-3 | Unitree (`unitree_ros`), ANYbotics ANYmal D, UR5e (ROS-Industrial via Menagerie), Go2, Spot (Clearpath), MiR250 (DFKI), LBR iiwa 14 (Drake), Robotiq 2F-85 | per-source copies in `licenses/robots/` and verbatim in the notices | produced |
| MIT | three.js (incl. the meshoptimizer decoder), troika (3 packages), bidi-js, webgl-sdf-generator; Spot's RAI part; the unicode-font-resolver | `licenses/npm/`, the notices' SOFTWARE section, `fonts/unicode-resolver/` | produced |
| Apache-2.0 (software) | Rapier 0.21.0, MuJoCo 3.16.0 (the npm package ships no licence file; the notices reproduce google-deepmind/mujoco @ 3.16.0's LICENSE) | `licenses/npm/`, notices | produced |
| Zlib | postprocessing 6.39.5 | `licenses/npm/postprocessing.txt`, notices | produced |
| OFL 1.1 | Space Grotesk, Geist, Geist Mono (subset, names kept: no Reserved Font Name), Noto Sans (Greek fallback glyphs) | `licenses/OFL-1.1.txt`, `fonts/unicode-resolver/font-files/LICENSE`, notices | produced |
| UR terms | UR8 Long / UR15 / UR18 / UR20 / UR30 meshes are forbidden | path check in `tools/robots/check.mjs` | in place |

Open question for L: is the notices file plus `licenses/` (same origin, linked from the credits page) a sufficient „binary form“ reproduction for BSD clause 2 and Apache §4a? **Who decides:** L.

## 7. Price bands · [ ] L · [ ] F

Shown as a band with basis and date, never an exact quote (D17, confirmed by F 2026-10-17); D5 (no prices of EmAI's own services) is unaffected: checked, none anywhere. Row label: „Preisklasse (Listenpreis, US-$ oder €, ohne Steuern und Versand)“, plus „Ein Listenpreis ist nicht die Rechnung: Zubehör, Integration und Betrieb kommen dazu.“ Data: `src/zones/schauhalle/data/prices.ts` against `sources.ts`.

| Robot | Band | Basis · source · date | Check |
|---|---|---|---|
| SO-101 | unter 1.000 | parts cost (QUELLE) · TheRobotStudio SO-ARM100 README (R4 S22) · 17.10.2026 | matches `sources.ts`; a parts list, labelled „Teile“ |
| Open Duck Mini v2 | unter 1.000 | BOM target (QUELLE) · Open Duck README (R4 S21) · 17.10.2026 | matches; labelled „nur Teile“ |
| LeKiwi (base) | unter 1.000 | QUELLE · LeKiwi repo (R8 S28) · 17.10.2026 | **no figure in any source** (item 4) |
| Unitree R1 | 1.000–10.000 | list price · unitree.com/R1 (R4 S32) · 17.10.2026 | matches |
| Unitree Go2 | 1.000–10.000 | list price · unitree.com/go2 (R4 S33) · 17.10.2026 | matches |
| Unitree G1 | 10.000–50.000 | list price · unitree.com/g1 (R4 S29) · 17.10.2026 | matches; the price changed between sources (2024: US$ 16,000), same band |
| Unitree H2 | 10.000–50.000 | list price · unitree.com/H2 (R4 S31) · 17.10.2026; **second source** humanoid.guide „≈ US$ 90,000“ (R4 S63, secondary, seen via a search result, unverified), shown as „Händler bis ≈ 90.000“ | matches; the card shows the conflict on purpose [C2 m4]. Open: may an unverified reseller-guide figure be shown, and is „Händler“ the right word for a guide site? |
| Hello Robot Stretch 3 | 10.000–50.000 | launch price (QUELLE) · IEEE Spectrum (R4 S51) · 15.02.2024 | matches; dated 2024 on the plate |
| Boston Dynamics Spot (amber) | 50.000–150.000 | launch price 2020, „historisch“ (QUELLE) · TechCrunch (R4 S37) · 16.06.2020 | matches; R4 read it via a search result; today's price is not published |
| 15 others (G1 Dex3-1, H1, H1-2, Spot with Arm, Apollo, TALOS, ANYmal D, TIAGo, MiR250, UR5e, FR3, LBR iiwa 14, R-2000iC/165F, Shadow Hand, 2F-85) | auf Anfrage | no public list price (vendor pages, R4 §3) · 17.10.2026 | no secondary source exists in R1–R9, so none is shown |

Open questions for L: (a) Is a dated third-party price band in a company-published game commercial communication that German competition law (UWG) treats as comparative advertising or as misleading once it is stale? (b) Is the yearly refresh (R4 §14) enough, or must the bands carry an expiry? **Who decides:** L advises; F signs off.

## 8. History cards · [ ] L · [ ] F

| | |
|---|---|
| What ships | The Fundvitrine's egg cards (`src/world/eggs/defs.ts`): Robota (Čapek, R.U.R.), Der Wackelige (Shakey, SRI, A*), Erklär’s der Ente (The Pragmatic Programmer), Belohnung wörtlich genommen (specification gaming), Im Traum geschummelt (Ha & Schmidhuber, DreamerV3), Fotopunkt, Herztomate, Die nächste Zahl (OEIS), Werkbank der Offenen. Asimov, Turing, Weizenbaum and Moravec cards are **not built** (WP16 SHOULD, backlog) |
| Rule | Paraphrase only, no quotes, no copyrighted characters or logos; people, research robots and institutes may be named, companies stay anonymous in history (D34) |
| Checked | All bodies are paraphrases with a QUELLE line (RELEASE §5 „History and egg cards“). The duck egg's chip says „Wortlaut nicht geprüft“ for the book |
| Open question | The card „Belohnung wörtlich genommen“ names a company in its body: „Ein Beispiel von DeepMind: Ein simulierter Roboter hakte seine Beine ineinander …“. D34 keeps companies anonymous in history; is a research lab of a company acceptable here, or should it read „Ein Beispiel aus der Forschung“? (The duck station's hack cards name DeepMind and Pollen Robotics only inside „(Quelle: …)“.) |
| Who decides | F (D34), L only if F wants advice |

## 9. Privacy · [ ] F

| | |
|---|---|
| What ships | 0 third-party requests at runtime, workers included (the `third-party` gate step passed at `p7-w2`); fonts and fallback glyphs are self-hosted; the photo spot, the certificate and the Befundkarten save PNGs locally (a browser download); the only inputs are sliders and buttons, no free text field (grep of `src/`, 2026-10-19) |
| Open question | none known; re-run `node tools/third-party.mjs` on the release build and `node tools/deploy-check.mjs` on the real host |
| Who decides | F |

## Sign-off

| Item | L | F | Date |
|---|---|---|---|
| 0 Build outputs | | | |
| 1 Open Duck Mini v2 | | | |
| 2 Amber models | | | |
| 3 Unitree | | | |
| 4 LeKiwi | | | |
| 5 Trademarks | | | |
| 6 Notices | | | |
| 7 Price bands | | | |
| 8 History cards | — | | |
| 9 Privacy | — | | |
