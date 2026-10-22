# EmAI Academy Island: Engine and Zone Developer Guide

This guide is for the island team and the six zone teams. It covers how to build inside the engine, what the API offers, and how to verify your work without a human looking. All six zones, the island and the finale are integrated; §15 lists what the integration pass changed in the engine and why.

The binding design and content (layout numbers, stations, copy) live in `docs/GDD.md`. This file is the binding **engine API**. Where the two use different names, §12 maps them. **`docs/DECISIONS.md` (founder decisions) overrides both**: "du" in both modes (D1), no third-party robot models, names or look-alikes (D2: the Unitree models and `assets.robot()` were removed), EMI Rover 1.55 m (D3), public web experience (D4).

---

## 1. Ground rules

1. **Write only inside your folder:**
   - zone team: `src/zones/<id>/` and `public/zones/<id>/`
   - island team: `src/world/` (and `public/world/` if needed)
   - Everything else is engine-owned: `src/core`, `src/systems`, `src/ui` (incl. `src/ui/fonts`), `src/i18n`, `tools`, `public/brand`. Treat it as read-only. Ask the engine owner for changes.
2. **Import only** from `three`, `@/core/zones` (the public API) and files in your own folder.
   - `@dimforge/rapier3d-compat` types are fine. Use `ctx.physics.rapier` at runtime.
   - Do not import other zones, `@/core/Game` or other engine internals.
3. **No global state** outside your module. A zone module is instantiated once. Reset module variables in `dispose()`. Don't touch `window`, `document.body` or the scene root directly. Build everything under `ctx.root` (or `ctx.groups.*`).
4. **Everything created through `ctx` is cleaned up automatically:** meshes under root, colliders, bodies, joints, triggers, interactables, labels, markers, panels, loops, timers, listeners, EMI units, interiors and player modifiers. `dispose()` is only for extra resources you created yourself (custom textures, raw WebAudio nodes not on `ctx.audio.zoneBus`).
5. **A broken zone never breaks the game.**
   - If import, `init`/`create` or `update` throws, the error is caught, shown as a toast, reported in `__academy.zones()` and logged.
   - After 3 runtime errors, `update` stops being called.
   - Fix your errors anyway: the shot tool fails on console errors.
6. **Brand and honesty** (§10):
   - Orange covers at most about 5 % of the screen. The logo is never rotated, recoloured or bloomed.
   - Invented numbers are labelled `illustrative` / chip `illustrativ`.
   - Never say "humanoid" (say "kognitiver Roboter") or "autonom" without a share.
   - No customer names, no prices.
7. **Strings:** German first, English required for every key. **Both modes address the player as "du"** (DECISIONS D1). Use `{ entdecker, entscheider }` variants only where the *content* differs (depth, decision angle), never just for the form of address (§8).
8. **Performance budget** per zone (GDD §11): detail tier ≤ 80 draw calls / 90k tris, exterior ≤ 40 / 60k, far ≤ 3 / 5k; `update` ≤ 1.5 ms. Check with `?only=<id>&debug=1` (§13).

---

## 2. Quick start

```ts
// src/zones/my-zone/index.ts
import * as THREE from 'three';
import { defineZone } from '@/core/zones';

export default defineZone({
  id: 'my-zone',                                     // MUST equal the folder name
  title: { de: 'Meine Zone', en: 'My zone' },
  stations: [{ id: 'probieren' }, { id: 'verstehen' }, { id: 'messen', star: true }],

  init(ctx) {
    ctx.i18n.register({ de: { hello: 'Hallo' }, en: { hello: 'Hello' } });
    const M = ctx.materials;

    const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.1, 20), M.floorPlate(20, 20));
    floor.position.y = 0.05;
    floor.receiveShadow = true;
    ctx.groups.exterior.add(floor);
    ctx.physics.addStaticBox({ size: [20, 0.1, 20], position: [0, 0.05, 0], surface: 'metal' });

    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), M.crate);
    crate.position.set(0, 1, 0);
    ctx.root.add(crate);
    ctx.physics.addDynamic(crate, { mass: 12, label: { de: 'Kiste', en: 'Crate' } });  // grabbable with F

    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 20), M.accentOrange);
    button.position.set(2, 1, 0);
    ctx.root.add(button);
    ctx.addInteractable({ object: button, label: { de: 'Drücken', en: 'Press' }, onInteract: () => ctx.pass.award('probieren', { value: '1 × gedrückt' }) });
  },

  update(dt, ctx) { /* only while the player is within 60 m */ },
});
```

Run it with `npm run dev` and open `http://localhost:5173/?zone=my-zone&skipIntro=1`. You can also take a screenshot without a browser (§13).

**Alternative factory style (GDD §5.1).** `create(ctx)` returns an instance. Both styles can be mixed; the hooks behave identically.

```ts
export default defineZone({
  id: 'sensordom', number: 1, name: { de: 'Sensordom', en: 'Sensor Dome' },
  verb: { de: 'SEHEN', en: 'SEE' }, eyebrow: { de: '// 01 · SEHEN · SENSORIK', en: '// 01 · SEE · SENSING' },
  glyph: 'sensor', stations: [{ id: 'messbrille' }, { id: 'dunkelkammer' }, { id: 'messstrecke', star: true }],
  questions: [9], album: 'spiegel-geisterpunkte',
  async create(ctx) {
    // build …
    return {
      update(dt, elapsed) {},   // while active (≤ 60 m)
      updateFar(dt) {},         // while NOT active, keep ≤ 0.1 ms
      onEnter() {}, onExit() {},
      dispose() {},
    };
  },
});
```

`src/zones/_example/` is the reference zone (dev only: `?zone=_example&dev=1`). It uses every API once: crates of different masses, a ramp, a pendulum (joint), a turntable (kinematic), a scale (trigger), info cards with mode variants, a gravity minigame (`openModal`), a drop tower with operate mode, prediction and Kennlinie, an EMI unit, a procedural unbranded transport robot ("Hersteller X" AMR, labelled as illustrative motion), an interior, detail tiers and debug solve hooks.

---

## 3. Coordinates and layout

- **World:** metres, **+Y up**.
  - Origin = hub centre at deck level (y = 0).
  - North = **−Z**, east = +X. Compass bearing b (clockwise from north) → direction `(sin b, 0, −cos b)`.
- **Zone local frame** (`ctx.root`):
  - The origin is the plot anchor **on the walkable ground**: y = 0 is the floor.
  - Local **+Z points at the hub**. The gate/entrance is at local `(0, 0, +radius)`. A visitor at the gate looks along local **−Z** (like a default three.js camera), so local +X is on their right.
  - Build inside the circle `r ≤ ctx.layout.radius` (GDD: r ≤ 22, 0 ≤ y ≤ 24).
  - Every position argument in the API is **zone-local** unless the docs say "world".
  - Use `ctx.toWorld(p)` / `ctx.toLocal(p)` to convert.
- **`ctx.layout`** = `{ anchor (world Vector3), facing (rad), radius, groundY, isFallback }`.
- **Plots** come from `src/world/layout.ts` (island team) and follow GDD §4.3 exactly:
  - `sensordom` (−80, 0), `regelgarten` (−40, −69.28), `greifwerkstatt` (40, −69.28), `lern-dojo` (80, 0), `dunkelfabrik` (40, 69.28), `prueffeld` (−40, 69.28); radius 22, ground y 0, rotationY = GDD table.
  - A zone id not listed there gets a fallback platform (r 26) on an outer ring at 230 m, labelled "FALLBACK PLOT" (dev zones such as `_example` land there). Nothing crashes either way. Name your folder exactly like the plot id so you build on the real plot (rotated frame, island railing, placeholder hand-off).
- **What the island already puts on (and around) your plot.** Build on top of it; you never need your own base floor:
  - A flat survey-grid pad (r 21.6) at deck level with a 0.3 m kerb ring at r 21.7–22. Inside the four lobes that overhang the main disc there is also a thin dark seam arc (the join, world r = 85). Your own floors may cover all of it: lift them ≥ 2 cm **and** give them their own `polygonOffset` (factor/units −4/−8): the pad itself uses −2/−4 and wins at grazing angles otherwise.
  - **Do not add a floor collider over the deck.** The deck trimesh is the walkable ground; a second floor collider a few cm above it makes the character controller snag on the deck's internal edges (speed drops to ≈ 0.9 m/s). Floors are visual only; raised platforms and stairs get their own colliders (prefer tread boxes over slopes).
  - The walkable collider is the island deck at y = 0 (trimesh). The outer rim arc of your lobe carries the island's 1.1 m railing (collider included) at local r ≈ 21.8, except where your manifest declares `railingGaps`.
  - Outside the plot: the gate mast (r 57), the zone jump pad (world r 52) and the spoke (6 m) up to the gate at local (0, 0, 22). Keep the gate opening ≥ 6 m wide.
  - An **"Im Aufbau" placeholder** (teal hologram, title, hazard-taped barrier at local z ≈ 20.6). It hides itself as soon as your zone reports `zone:ready` and comes back only if your zone fails to initialise. Nothing to do on your side.
- **Spawn** (`?zone=<id>`, map travel):
  - `defineZone({ spawn: { position, yawDeg, pitchDeg } })` (local; yaw 0 = facing local −Z; pitch + looks up, e.g. at a tall landmark),
  - else `plot.spawn`,
  - else local `(0, 0, radius + 2)` facing into the zone.
- **Player:**
  - Capsule r 0.35 m, height 1.75 m, **eye height 1.7 m**.
  - Step-up 0.35 m, max slope 40°, jump 0.6 m.
  - Walk 4.5 m/s, sprint 8 m/s.
  - Player gravity 19.6 m/s² for game feel; physics objects use 9.81.
  - Arm strength 400 N: about 40 kg is the most that can be lifted.
- **Active distance:** a zone is *active* while the player is within `activeDistance` (default 60 m) of its anchor. `update` and `fixedUpdate` run only then, and private worlds step only then. `updateFar` runs while the zone is inactive.
- **Detail tiers** (`ctx.groups`), switched by player-to-anchor distance:

  | Group | Visible when |
  |---|---|
  | `detail` | ≤ 45 m |
  | `exterior` | ≤ 130 m |
  | `far` | > 130 m |

  `ctx.root` itself is always visible.

---

## 4. Lifecycle

```
index.html: shell (brand mark, „Insel wird geladen“, CSS bar) + pre-boot gate (WebGL2, class static blocks, import maps,
      touch-only) → main.ts imports Game + hud.css (dynamic)
boot: Rapier + wasm and the island chunk start downloading at once, in parallel with the font wait
      → renderer → discover zones (import.meta.glob) → import all zone modules (parallel)
      → island module (src/world) init (can read zone manifests; yields between builders)
      → eager zones only (a ?zone= / ?pos= target, a dev reload, the D13 resume zone)
      → shader warm-up (compile + one hidden frame) → start screen (or ?skipIntro=1 → play)
      → the other zones init after the title, one per idle slot, nearest the spawn first, each followed by a background compile
      → __academy.ready / game:ready once every zone has settled
frame: input → fixed steps (player → grab → zone fixedUpdate → private worlds → Rapier step → triggers)
       → interpolation → timers → zone update/updateFar → EMI/operate → camera → HUD → render
       (paused or behind a frozen panel: two frames after a change, then nothing until the next change; §16)
```

- Since Phase 6 a zone's `init` usually runs **after** the title screen is up (C13). A plot whose zone is not ready keeps its „Im Aufbau“ placeholder; `zone:ready` hides it. Never assume another zone is initialised when yours is.
- Zone modules are lazy chunks. A syntax error or a missing import in one zone fails only that zone's import. In dev, the real compiler message appears in `__academy.zones()` and in the shot JSON. **But** `npm run typecheck` and `npm run build` cover all zones: a broken zone fails both for everyone, so run `npm run typecheck:zone -- <id>` before you stop.
- Inits run one after another. An `init`/`create` that never settles delays the start of the whole game by the 20 s timeout. Await only what you need (asset loads), never user input or events.
- Ids starting with `_` are dev-only. They load with `?zone=_id`, `?only=_id` or `?dev=1`, and are never in production builds.
- Hooks:
  - `onEnter` / `onExit` fire when the player crosses `layout.radius`. A zone banner shows `eyebrow` + `title`.
  - `alwaysUpdate: true` keeps `update` running when inactive. Avoid it.

---

## 5. ZoneContext reference

Everything below is on `ctx`. The full TSDoc is in `src/core/zones/types.ts`.

### 5.1 Scene and frames

| | |
|---|---|
| `ctx.root` | Group at anchor/facing. Build under it in local coords |
| `ctx.groups.detail / exterior / far` | Detail tiers (children of root) |
| `ctx.layout` | anchor, facing, radius, groundY, isFallback |
| `ctx.toWorld(p, out?)` / `ctx.toLocal(p, out?)` | Convert between frames. `p` = `{x,y,z}` or `[x,y,z]` |
| `ctx.scene`, `ctx.camera` | Read-only use |
| `ctx.time` | `{ elapsed, dt, frame }`, game time (paused in the menu, and frozen while the Pass, the map, an info card or a prediction is open; operate mode and your own `openModal` keep running, §16) |
| `ctx.after(s, fn)`, `ctx.every(s, fn)` | Game-time timers, return `cancel()` |
| `ctx.onDispose(fn)` | Extra cleanup |
| `ctx.mode`, `ctx.lang` | Live audience mode / language |
| `ctx.playerInside`, `ctx.playerDistance` | Proximity |

### 5.2 Physics (`ctx.physics`), Rapier, fixed 60 Hz, render-interpolated

```ts
// static colliders (local coords; optional material creates the mesh too)
ctx.physics.addStaticBox({ size: [w, h, d], position: [x, y, z], rotation: [rx, ry, rz], material: M.panel, surface: 'metal' });
ctx.physics.addStaticCylinder({ radius, height, position });          // r > 40 m becomes a trimesh automatically
ctx.physics.addStaticFromMesh(mesh, { shape: 'trimesh' | 'box' | 'hull' });  // mesh at its current transform
ctx.physics.addStaticTrimesh(mesh, { fixInternalEdges: true });     // Rapier FIX_INTERNAL_EDGES: clean manifold meshes only
ctx.physics.addStaticBoxSensorIgnore({...});   // solid for the player but invisible to sensor rays (glass for LiDAR)

// dynamic bodies: the mesh follows the body (interpolated). Parent must be static (root or a static group).
const crate = ctx.physics.addDynamic(mesh, { mass: 20, label: { de: 'Kiste', en: 'Crate' }, friction: 0.6, restitution: 0.1,
                                             shape: 'auto', grabbable: true, ccd: false, onFall: 'reset' });
crate.position(); crate.velocity(); crate.setPosition([x, y, z]); crate.reset(); crate.applyImpulse([0, 5, 0]); crate.remove();

// kinematic (scripted) bodies that push things
const k = ctx.physics.addKinematic(mesh); k.setPose([x, y, z], [rx, ry, rz]);   // call in fixedUpdate

// triggers (sensors). filter: 'player' (default) | 'dynamic' | 'any'
const t = ctx.physics.addTrigger({ shape: 'box', size: [2, 2, 2], position: [0, 1, 0], filter: 'dynamic',
  onEnter: ({ isPlayer, body }) => {}, onExit: () => {} });
t.playerInside; t.count;

// joints: the world side is ctx.physics.zoneBody, a fixed body whose frame == the zone frame
const R = ctx.physics.rapier;
ctx.physics.addJoint(R.JointData.revolute({ x: 0, y: 3, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }), ctx.physics.zoneBody, crate.body);

// queries
ctx.physics.raycast([0, 1, 0], [0, 0, -1], 30, { sensorRays: true });   // → { distance, point, normal, dynamic, isPlayer } | null

// private world: zone-only simulation, stepped at 60 Hz only while the zone is active, freed on dispose
const pw = ctx.physics.createPrivateWorld({ gravity: { x: 0, y: -9.81, z: 0 } });
```

- **Shapes:** `'auto'` is exact for a single Box/Sphere/Cylinder/Capsule geometry. Otherwise it uses the bounding box of all child meshes. Children with `userData.noCollide = true` are ignored; 3D text always is.
- **Large ground:** use cuboids or `addStaticTrimesh`. Rapier's character controller loses precision on huge convex shapes: the player slowly sinks into a 150 m cylinder. `addStaticCylinder` converts r > 40 m to a trimesh for you.
- **Seams in walkable trimeshes.** On a flat trimesh, Rapier's controller now and then reports a toi = 0 contact with a ground triangle and returns no horizontal movement for that step (≈ once a second while walking on the deck). The player retries such a step once 1 cm higher when every contact is ground-like (|n.y| > 0.9); snap-to-ground puts the capsule back. Walls and steps are untouched. The deck trimesh also uses `fixInternalEdges` (smoother contacts for crates rolling across it). Oblique step-ups (≥ 60° to the step normal) still slide along low steps: Rapier's autostep needs a forward component; make important steps a shallow ramp collider or approach them straight.
- **Groups:** `ctx.physics.groups.{PLAYER, STATIC, DYNAMIC, SENSOR, SENSOR_IGNORE}` are values for `desc.setCollisionGroups(...)` on raw colliders.
- **Kill plane:** dynamic bodies below the kill plane (`ISLAND.killY − 30`) are reset to their spawn (or removed / custom via `onFall`). A falling player respawns at the nearest spawn with a toast.

### 5.3 Interaction and grabbing

```ts
const h = ctx.addInteractable({ object: mesh, label: { de: 'Knopf drücken', en: 'Press button' }, onInteract: () => {},
                                range: 2.6, hint: {...}, once: false, highlight: true, isEnabled: () => !busy });
h.setLabel(...); h.setEnabled(false); h.trigger(); h.remove();
// GDD alias
ctx.interact.register(mesh, { label, radius: 2.5, onUse, enabled: () => true });
```

- **Focus and prompt:**
  - Focus = screen-centre raycast, occlusion-checked against physics (no interacting through walls).
  - Candidates are pre-filtered by the world-space bounding-sphere centre of the interactable's mesh (so merged meshes with translated geometry are found where they are drawn); groups use the bounds of their children, measured once and kept in the group's frame (Phase 5: a group at the zone origin whose children sit at absolute positions used to drop out of the candidates beyond range + 6 m of the origin). Instanced meshes use their origin.
  - A modal that opens while the pointer-lock request of a just-closed modal is still pending gets the cursor back as soon as the lock arrives (`Game` releases it again).
  - **Aim assist:** when nothing is under the crosshair, the interactable whose bounding box comes closest to the view ray within 9° (and within its `range`, unoccluded) gets the focus. Trackpad players and keyboard-only players (← / → turn, no pitch) can then use a screen below eye height. A direct hit always wins; keep neighbouring interactables ≥ ~0.4 m apart or give them distinct labels.
  - The focused object gets an orange rim highlight, orange corner brackets around the crosshair, and the prompt `[E] label`.
  - **E or left click** interacts.
  - **Keyless prompt (Phase 6).** `keyless: () => boolean` in the options: while it returns true the prompt shows without the `[E]` key cap, and E or a click does nothing (no `onInteract`, no `interact` event). Sensordom A uses it for objects the active sensor view cannot see („Becher: RGB reicht nicht“).
  - **Just out of reach (Phase 6).** Between `range` and `range + 4` m the prompt shows dimmed, with grey key caps and „näher ran“ / „move closer“.
- **Grabbing** (any dynamic body with `grabbable: true`, the default):
  - Hold **F or right mouse**. The prompt shows `[F] Kiste · 20 kg`.
  - The body follows a force-limited spring (400 N): light things snap, heavy things lag, more than about 40 kg can only be dragged.
  - **Left click** throws with a limited impulse (v = J/m). The wheel changes the hold distance.
  - The HUD shows mass, weight force and holding force.
  - Events: `grab:start`, `grab:end`, `throw` `{ owner, mass, impulse, speed }`.

### 5.4 HUD (`ctx.hud`)

```ts
ctx.hud.toast({ de: 'Gespeichert', en: 'Saved' }, { kind: 'success' | 'info' | 'warn' | 'error', duration: 4 });
await ctx.hud.openInfoCard(spec);                                  // modal, mouse released, resolves on close
await ctx.hud.say([{ de: '…', en: '…' }, 'line 2'], { speaker: 'EMI-02 ›', manual: false, interrupt: false });
ctx.hud.setObjective({ de: 'Lege die Kiste auf die Waage.', en: '…' }, { target: [x, 0, z] });   // null clears
const lbl = ctx.hud.worldLabel(objectOrLocalPoint, text, { eyebrow: '// SENSOR', offsetY: 1, maxDistance: 22, kind: 'accent' });
ctx.hud.addMarker([x, 0, z], label, { kind: 'poi' | 'objective' });   // compass marker
const p = ctx.hud.panel({ eyebrow: '// TELEMETRIE', rows: [{ k: 'Kraft', v: '118 N', tone: 'accent' }] }); p.setRows([...]);
await ctx.hud.openModal((el, close) => { /* build DOM; return cleanup */ }, { width: 640 });
ctx.hud.banner('// 03 · GREIFEN', { de: 'Greifwerkstatt', en: 'Grip Workshop' });   // large title card (zone-enter style)
ctx.hud.banner('// 03 · GREIFEN', title, { place: true });   // Phase 5: location card on the left under the objective (zone entry, Kielraum arrival; QA-27)
ctx.hud.caption({ de: 'Die Halle schläft nie.', en: 'The hall never sleeps.' }, { seconds: 3.5 });   // cinematic lower third (cutscenes); null hides
```

- **Right-column cards** (`hud.panel`, `ui.panel`, `ui.readout`, and `ui.kennlinie` / `ui.plot` with `target: 'panel'` and no `parent`) belong to your zone. The engine **hides them while the player is more than `radius + 4` m from your anchor** and shows them again on return, so creating them in `init` is fine. They live in a band between the toasts and the subtitles (centred, right side; left side in operate mode). Content that does not fit is clipped at the bottom: plan for at most about 470 px at 1280×720 (for example one panel, two readouts and one Kennlinie).
- **Objectives are kept per owner.** The HUD shows your zone's objective while the player is at your plot (within `radius + 4` m) and the island's route objective everywhere else, so the island never overwrites your step-by-step objective and yours never leaks out of the zone. Only the shown objective's compass marker is visible (one orange marker). Set it in `onEnter` or on station events; clearing it in `onExit` is still good practice.
- `ui.status` and `ui.hint` are single global lines: set them in `onEnter` or on a station event, clear them in `onExit`.
- **Dialogue stays in the zone.** `hud.say`, `ui.subtitle` and your EMI's `say` are silent while the player is away from your plot (beyond `radius + 4` m), and lines still queued when the player walks away are dropped (the line on screen finishes). Delayed reactions (`ctx.after(…, () => emi.say(…))`) therefore never follow the player across the island.
- **Cinematics.** While a scripted camera (`player.cinematic()`) is active, the compass, objective card and crosshair fade out; subtitles, hints and your panels stay.
- **Stamps.** A skipped station gets a grey "übersprungen" toast (no stamp fanfare). If the player later earns that station for real, `pass.award` returns `true` again and the normal stamp animation and Recamán note play.
- **Dialogue idle (Phase 6).** `ctx.hud.dialogueBusy` is true while a subtitle line is on screen or queued (any speaker). The event `dialogue:idle` fires once the queue has run empty and the last line has finished (deferred by a microtask, so a `say({ interrupt: true })` that refills the queue does not count). Use it to show a toast or hint only after EMI has finished talking (the onboarding's Pass toast does).
- **Text size (Phase 6, DECISIONS D14).** The player's „Textgröße“ (100 / 125 / 150 %) sets `--ts` on `#hud`; subtitles, objective, prompts, hints, toasts, the result banner, panels, world labels and captions scale with it. Your own HUD DOM can use `calc(<px> * var(--ts, 1))`. The Pass, info cards, the pause menu and the compass keep their size.
- **HUD timers count game time (Phase 6).** Toasts, hints, captions, the zone banner and the fail flash wait behind the pause menu and the frozen panels. The result banner stays until the player acts (Enter, R, H, a 4 m walk, a teleport or a new run), at least 24 s otherwise.
- **Uppercase labels keep Greek.** Eyebrows, metric and row labels are CSS-uppercased; the HUD wraps Greek letters so σ, κ, θ stay lowercase (no Σ). Canvas Kennlinie titles do the same.

**Info card spec.** Mode-aware: `entdecker` and `entscheider` overrides are merged on top of the base content. In Entscheider mode the "Für Entscheider" box moves to the top.

```ts
{
  eyebrow: { de: '// SENSOR · LIDAR', en: '…' }, title: {...},
  body: [{...}, {...}],          // paragraphs; **bold** supported (input is HTML-escaped)
  bullets: [{...}],
  metrics: [{ label: {...}, value: '87', unit: '%', note: {...} }],
  illustrative: true,            // REQUIRED when numbers are examples → "ILLUSTRATIV" tag
  illustrativeNote: {...},       // optional: replaces the default note under the tag (toy-model readings)
  forDecisionMakers: { title: {...}, body: {...}, bullets: [...] },
  diagram: { svg: '<svg …>' } | { draw(g, w, h, t) {...}, animate: true, aspect: 4 / 3, caption: {...} },
  entdecker: { body: {...} }, entscheider: { body: {...}, illustrative: true },
}
```

- `illustrativeNote` replaces the default ILLUSTRATIV note („Beispielwerte zur Veranschaulichung, keine Messdaten.“) when the card shows the player's own toy-model readings, e.g. „Spielzeugmodell: simulierte Messwerte, keine echten Sensordaten.“ (Sensordom C, Prüffeld B, Dunkelfabrik C).

Keys while a card is open: E, Enter, Space or Esc closes it.

### 5.5 Measurement UI kit (`ctx.ui`, GDD §5.5–5.7)

```ts
ctx.ui.card(spec);                                   // = openInfoCard
ctx.ui.subtitle('EMI-02 ›', {...});                  // subtitle with speaker tag
const clear = ctx.ui.hint({ de: 'Taste 1–4: Sensor wählen', en: '…' }, 4);   // seconds ≤ 0 = until cleared
ctx.ui.status('// SENSOR · TIEFE');                  // persistent mono eyebrow under the compass; null clears
el.append(ctx.ui.chip('sim' | 'studie' | 'quelle' | 'richtwert' | 'illustrativ' | 'fiktion', sourceLine));
const r = ctx.ui.readout({ de: 'Abstand', en: 'Distance' }); r.set('3,42 m');
const v = await ctx.ui.predict({ question: {...}, unit: 'mm', min: 2, max: 150, step: 1, scale: 'log' });
const k = ctx.ui.kennlinie({ title, xLabel, yLabel, chip: 'sim', band: 'wilson95', keyValue: ctx.ui.formatRate(146, 200),
  series: [{ id: 'grip', trials: [{ x: 1, k: 18, n: 20 }, …] }, { id: 'model', line: [[0, 0], …], dashed: true }] },
  { target: 'panel' | 'texture', parent?: HTMLElement, width, height });
k.update(spec); k.texture;  // CanvasTexture for in-world screens: new MeshBasicMaterial({ map: k.texture, toneMapped: false })
// target 'panel' (HUD column): width is clamped to 276 px. For larger charts pass `parent` (your openModal / operate panel element).
// predict(): closing the dialog without confirming resolves with the slider's current value.
ctx.ui.formatRate(146, 200)  // → "73 % [66–80] · n = 200"
ctx.ui.wilson(k, n)          // → [p, lo, hi]
```

### 5.6 Player (`ctx.player`)

| | |
|---|---|
| `position` / `positionLocal()` / `eye` / `direction` / `yaw` / `pitch` / `grounded` / `velocity` | State (copies) |
| `teleport(local, { yawDeg, pitchDeg, fade })` | Snaps to the static ground under the target |
| `teleportLocal(local, lookBearingDeg)` | GDD form |
| `lockControls({ look })` → unlock / `lockMovement(bool)` | Freeze for minigames |
| `setGravityScale(s)` / `setSpeedFactor(f)` / `setHeadBob(scale)` / `setVignette(a)` | Each returns `restore()`; all are auto-restored on dispose |
| `carry(object \| null)` | Attach a tool to the camera, default offset (0.28, −0.25, −0.55) |
| `shake(amp, dur)` | Micro-shake (off with reduced motion) |
| `await launch([vx, vy, vz], { gravity })` | Ballistic flight in local axes (jump pads); resolves on landing |
| `release()` / `holding` | Grab state |
| `enterOperate({...})` → `exit()` / `operating` | Operate mode, below |
| `cinematic()` → `{ set(position, lookAt, blend), end() }` | Scripted camera (local coords) blended over the player view; used by the island's ascent intro. Lock controls yourself |

**Bedienmodus (operate mode).** The camera eases to a fixed pose in 0.4 s and the cursor is freed. WASD and look are disabled. **Esc** leaves. The panel docks bottom-right as a brand card (`panelPosition: 'right'`, used by every shipped zone); the subtitles and the zone column move to the free side (`#hud[data-dock]`: right dock → subtitles and column left; left dock → subtitles right; bottom dock → subtitles under the operate bar). A very tall right panel can still cover the second toast slot at 1280×720: keep operate panels ≤ ≈ 520 px. The top bar re-renders on language changes. Mouse-wheel turns over the 3D view arrive as `type: 'wheel'` with `deltaY` in pixels (one notch ≈ 100). The island's roll (gusts, the finale's F1 tilt) also rolls the operate and cinematic views (not with reduced motion).

```ts
const exit = ctx.player.enterOperate({
  title: { de: '// 01 · MESSSTRECKE', en: '…' },
  cameraPose: { position: [8, 1.7, 11], lookAt: [8, 1.2, 4] },       // or yawDeg / pitchDeg (local)
  panelPosition: 'right' | 'left' | 'bottom',
  panel: (el, exit) => { /* build DOM controls; return cleanup */ },
  onPointer: ({ type, ndc, origin, direction, button, deltaY }) => {}, // 'down' | 'move' | 'up' | 'wheel'; ray in LOCAL coords
  onExit: () => {},
});
```

### 5.7 Input (`ctx.input`)

```ts
ctx.input.onKey(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyV'], (code) => setMode(code), { whileOperating: true, anywhere: false });
ctx.input.isDown('KeyR'); ctx.input.pressed('Digit1');
```

- By default handlers fire only while the player is inside the plot and no modal is open. Pass `whileOperating` to also fire during your operate mode, and `anywhere` to drop the plot check.
- **Engine-reserved keys:** W A S D, arrows (↑ ↓ walk, ← → turn: the game is playable without a mouse), Space, Shift, E, F, Tab, Esc, Enter, H (ask EMI), M (map), O (overlays), backquote and F3 (debug). In your operate mode the look is locked, so ← → are yours there (the Regelgarten balance uses them).
- Codes are physical keys (`KeyboardEvent.code`), so they work on QWERTZ.

### 5.8 Pass, progress and storage

- Stamp ids are `<zoneId>.<stationId>`.
- `ctx.pass.awardQuestion(n)` shows one engine toast per batch („Fragenkarte #9 · im Pass“ with the question); zones do not toast question cards themselves.
- **Stations declared in `defineZone({ stations })` are registered automatically.** Their Pass title is the string key `zone.<id>.<stationId>.title`, else the station id.

```ts
ctx.pass.award('messstrecke', { value: { de: 'σ(6 m) = 7,2 cm', en: 'σ(6 m) = 7.2 cm' }, curve: [2, 8, 31, 72], skipped: false });
ctx.pass.has('messstrecke');
ctx.pass.recordPrediction('messstrecke', predicted, measured, { min: 2, max: 150, scale: 'log' });   // feeds Prognose-Güte
ctx.pass.awardQuestion(9);
ctx.pass.registerAlbum({ id: 'spiegel-geisterpunkte', title: {...}, text: {...}, hint: {...} }); ctx.pass.unlockAlbum('spiegel-geisterpunkte');
ctx.pass.setBest('balanceTime', 12.4, 'higher'); ctx.pass.getBest('balanceTime');
ctx.pass.hasQuestion(1); ctx.pass.questions();                          // question cards held (any zone)
ctx.pass.snapshot();   // read-only copy of the whole Pass: stamps (title, star, record), questions, album, predictions, best, prognoseGuete
ctx.progress.get('key', fallback); ctx.progress.set('key', value);      // per-zone persistent storage (JSON values)
ctx.progress.registerStamp('extra', { de: 'Extra', en: 'Extra' }, { description, order }); ctx.progress.awardStamp('extra');   // non-station stamps
```

- Non-station stamps (`progress.registerStamp`) are listed after the stations in the Pass but **not counted** by `ctx.zones.stamps(id)` (0–3), which drives the island's objective route and the KIEL lift.
- Awarding plays the stamp thunk plus the Recamán melody note, and shows the stamp animation.
- Re-awarding updates the stored value (`stamp:updated`).
- Saved under `localStorage['emai-academy-island/v1:progress']` (try/catch; the game runs without storage). Never read that key yourself: use `ctx.pass.snapshot()` / `questions()`.
- Best values whose key contains `trials` (e.g. `gripTrials`, `trialsMeasured`) add up to "trials measured" on the certificate.
- Question-card texts are registered once, usually by the island module from GDD Appendix C: `ctx.pass.registerQuestion(n, { de, en }, why)`. Zones only call `awardQuestion(n)`.

### 5.9 EMI units (`ctx.emi`)

```ts
const emi = ctx.emi.spawn({ unit: 'EMI-02', position: [-3, 0, 8], yawDeg: 180 });   // front = local +Z of the unit
emi.say([{ de: '…', en: '…' }]);          // subtitle "EMI-02 ›" + 3-note FM chirp (unit pitch)
emi.say(line, { interrupt: true });       // reactions and H answers: replace the line on screen (keeps the chirp)
await emi.gesture('point' | 'nod' | 'shrug' | 'wave' | 'show-joints');
await emi.driveTo([x, 0, z], { speed: 1.2 });   // local [x, y, z] or {x, y, z}; rotate in place, then straight; wheels spin
emi.lookAt(worldVec3 | null);             // null → tracks the player within 8 m (max 2 rad/s)
emi.setJoint('shoulder_pitch_r', -1.2); emi.releaseJoint('shoulder_pitch_r');
emi.highlightJoints(true);                // orange rings glow
emi.onAsk(() => emi.say(...));            // H key: the nearest EMI (≤ 15 m) explains the current station
```

- The model is EMI Rover v1, built procedurally from EmAI's EMI design parameters (`params.py`):
  - HEIGHT 1.55 m; floor→port 0.83, port→shoulder 0.45, shoulder→top 0.27.
  - CMF per GDD §2. Orange appears only on joint rings.
  - About 21 draw calls.
- Joint names follow the URDF: `waist_yaw`, `neck_yaw`, `neck_pitch`, and for `_l` / `_r`: `shoulder_pitch`, `shoulder_roll`, `shoulder_yaw`, `elbow`, `wrist_roll`, `wrist_pitch`, `wrist_yaw`.

### 5.10 Environment, island and settings

```ts
const exit = ctx.env.enterInterior({ ambient: 0.15, background: '#0C0A09', fog: { color: '#0C0A09', density: 0.02 } });
ctx.env.exitInterior();
ctx.island.onGust(({ strength, bearing }) => {});  ctx.island.tiltDeg;   // the island module emits gusts / sets tilt
ctx.settings.reducedMotion; ctx.settings.quality; ctx.settings.overlays; ctx.settings.onChange(fn);
```

- With **reduced motion**: no camera roll, shake or bob, and no island tilt. Use fades instead of flights.
- The **O key** toggles `overlays` (in-world explanation layers). Show or hide yours on `settings.onChange`.

### 5.11 Strings (`ctx.i18n`)

```ts
ctx.i18n.register({ de: { messbrille: { title: 'Messbrille', hint: { entdecker: 'Drück 1–4 und vergleiche die Sensoren.', entscheider: 'Drück 1–4: Welcher Sensor sieht Glas? Das bestimmt die Zellen-Auslegung.' } } },
                    en: { messbrille: { title: 'Sensor visor', hint: 'Press 1–4.' } } });   // both modes say "du"; variants only where the content differs
ctx.t('messbrille.hint');                       // resolves zone.<id>.messbrille.hint (falls back to global keys)
ctx.i18n.text('messbrille.title')               // lazy Text: re-renders on language/mode change
ctx.i18n.num(12.5, 1)                           // "12,5" (de) / "12.5" (en)
ctx.i18n.onChange(() => relabel())              // language AND mode changes
```

- Strings are registered under the namespace `zone.<id>`, so global keys look like `zone.<id>.<station>.<key>`.
- **`Text`**, accepted by every HUD, label, sign and card API, is one of:
  - a plain string (shown as-is: units, numbers),
  - `{ de, en }`, where each value may be `{ entdecker, entscheider }`,
  - `{ key, params }`,
  - a function `(lang, mode) => string`.
- A table node counts as a mode variant **only if** it has exactly the two string leaves `entdecker` and `entscheider`.

### 5.12 Audio (`ctx.audio`), procedural, no files

```ts
ctx.audio.play('click' | 'hover' | 'beep' | 'success' | 'whoosh' | 'jump' | 'land' | 'grab' | 'drop' | 'throw' | 'stamp' | 'error' | 'open' | 'close' | 'type' | 'thud', { at: [x, y, z], volume, pitch });
ctx.audio.beep(880, 0.08, { at }); ctx.audio.tone({ freq: 440, to: 880, dur: 0.2, type: 'sine', at });
const loop = ctx.audio.loop('hum' | 'servo' | 'beacon' | 'conveyor' | 'drone' | 'generator' | 'data', { at: meshOrPoint, volume: 0.6 });
loop.setVolume(0.2); loop.setPitch(1.2); loop.stop();
// custom WebAudio: ctx.audio.context (null until the first click) + ctx.audio.zoneBus (full ≤ 20 m, silent ≥ 60 m)
ctx.audio.setWind(0.6);   // island module only: intensity 0…1 of the engine's wind bed
```

- One-shots without `at` (`play`, `beep`, `tone`) are skipped while the player is away from your plot (beyond `radius + 4` m), so a late timer never plays a full-volume sound elsewhere on the island. Give world-anchored sounds an `at`: they fade with distance.
- `tone()` with `type: 'square' | 'sawtooth'` is low-passed by the engine (≈ 5 × f, max 4.2 kHz); `beep()` is a filtered triangle. If you build raw oscillators on `zoneBus`, filter square/saw waves yourself (a `BiquadFilterNode` low-pass at 2–4 kHz): unfiltered they buzz on laptop speakers.

**Mix and levels.** Every sound lands on one bus; the buses meet in a limiter and a soft clipper, then the player's volume slider:

```
ambience (wind, rotors, island loops) ─┐
zones    (every ctx.audio.zoneBus + zone loops) ─┤
ui       (click, hover, open, close, type, toast beeps) ─┼─→ mix → limiter → soft clip → volume → out
foley    (footsteps, jump, land) ─┤                          └─→ meter taps
cues     (stamp, success, error, whoosh, beep, tone, thud, grab/drop/throw) ─┤
voice    (EMI chirps; ducks ambience + zones by ≈ 4 dB for 2 s) ─┘
```

Loudness hierarchy: **ambience < UI < cues < EMI**. Targets in dBFS, measured on the master before the volume slider (sample peak; RMS over the window):

| What | Target | Measured (engine sounds, `tools/audio-levels.mjs`) |
|---|---|---|
| Island bed (wind + rotors) while walking | RMS −36 … −28, peak ≤ −20 | RMS −33 (arrival, rim, Kanzel, Ausguck), −39 on the sheltered plaza; peaks −20 … −25 |
| Your zone's loops/beds at their source (≤ 3 m) | RMS −34 … −24, peak ≤ −16 | — (zone teams) |
| UI (click, open, close, toast) | peak −26 … −18 | click −21, interact click −23, open/close −24 … −25, toast −24 (hover −35, typing −32: deliberately soft) |
| Foley (steps, jump, land) | peak −28 … −18 | steps −21 … −23 (grass −31), sprint −21, hard landing −18 |
| Cues (stamp, success, error, events) | peak −18 … −9 | stamp −11, thud −12, success −15, pad launch −16, error −18, lift chime −19, gust −23 |
| EMI chirp at talking distance (2 m) | peak −14 … −8 | −13 (6 m: −24) |
| Master | peak ≤ −1 (limiter ≈ −1.2 dBFS + soft clip) | loudest flow (the ending) −13.5, no clipped samples |

`ctx.audio.play(…, { volume })` scales the engine's calibrated level: `volume: 1` lands a cue at about −12 dBFS. Keep zone loops at `volume` ≤ 1; for raw WebAudio on `zoneBus`, a single voice peaking at gain 0.1–0.25 sits in the cue range.

**Measuring (headless).** Nobody hears a headless run, so measure. `tools/lib/shotlib.mjs` launches Chromium with `--autoplay-policy=no-user-gesture-required`, so audio starts without a click:

```js
await __academy.audioUnlock();                       // → 'running'
__academy.audioArm();                                // arm meter taps (master + every bus); or audioArm('zones')
__academy.audioSolo('zones');                        // hear (and meter on master) only one bus; audioSolo(null) restores
await __academy.solve('my-zone', 'solve-b');         // make your sound
__academy.audioMeter(1500, 'zones');                 // → { peakDb, rmsDb, hfDb, clipped, ms, armed, state } over the last 1.5 s
await __academy.audioMeasure(2000, 'master', () => __academy.solve('my-zone', 'solve-c'));   // arm → run → wait → read
__academy.audioPlay('stamp:440');                    // engine one-shots by name (also 'chirp', 'step:metal')
```

- `audioMeter(ms = 1000, target = 'master')`: `target` is `'master'` (post limiter, before the volume slider) or a bus (post bus gain). The first call per target arms its tap and returns `armed: false`; read again after the sound. History: 60 s.
- `hfDb` is the RMS above 4 kHz. A sound whose `hfDb` sits within ≈ 15 dB of its `rmsDb` is bright to harsh; engine cues sit 20–40 dB below.
- `clipped` counts samples at or above −0.1 dBFS (should be 0). `ms` is the window actually covered: if it is much shorter than asked, the audio thread stalled (another heavy headless run on the same machine).
- `node tools/audio-levels.mjs` surveys every global sound (beds by place, UI, foley, cues, EMI, pads, lift, gusts, the finale) and fails on > −1 dBFS or clipping.

### 5.13 Materials, palette and brand helpers

`ctx.materials` holds **shared cached** materials. **Never mutate them;** `clone()` first or use `standard({...})`.

| | |
|---|---|
| Structure | `metalDark`, `metal`, `steel`, `darkMetal`, `structure`, `railing`, `rubber` |
| Concrete | `concrete`, `concreteGrid`, `concreteGridSized(w, d)`, `deckConcrete`, `plazaStone` |
| Floors | `floorPlate(w, d)` (1 m riveted tiles) |
| Panels | `panel`, `panelElevated`, `screen` |
| Shells | `shell`, `crate` |
| Glass | `glass` (no transmission pass) |
| Accents (≤ 5 % of the screen) | `accentOrange`, `accentTeal` (lit emissive), `emissiveOrange`, `emissiveTeal` (unlit), `orangePaint`, `tealPaint` (no glow) |
| Hazard tape | `hazard(repeat)`, `hazardTape` |
| Logo | `logoOrange` / `logoSpiral`, `logoDisc` (exact, unlit, never bloom) |
| Factories | `standard(params)`, `emissive(color, intensity)`, `basic(color)`, `canvasTexture(w, h, draw)` |

- **v2 material language (Phase 4, `docs/ART-V2.md` §2):** `hull`, `hullWarm`, `hullTone(color, roughness)` (ceramic with world-space panel seams, no UVs needed; exported class `HullMaterial`), `deckComposite`, `deckPath`, `deckTone(color, roughness, { polygonOffset })` (exported `DeckMaterial`), `brushedAlu`, `carbon`, `darkGlass`, `glassClear`, `pvCell`; light lines in fixed brightness tiers `light(color, 'T0' | 'T1' | 'T2' | 'line' | 'beacon')` that switch from day to dusk on their own (`tierScale()`, `setDusk(t)`, `onDusk(fn)`); `brandExact('orange' | 'disc', { facing })` hits #FF6700 / #141414 on both render paths by inverting the tone mapping and the grade for the current exposure (`syncBrandExact`, called by `RenderSystem` on exposure, level and grade changes). Zones wrap these in a zone-owned `look.ts`.
- **Bloom** = brightness > 1 after lighting. Emissive materials with `emissiveIntensity` ≳ 1.2 glow. Logo materials stay below the threshold.
- `ctx.palette` gives hex tokens; `import { css } from '@/core/zones'` gives CSS strings for canvas drawing.
- `createLogoMark({ spiralMaterial: ctx.materials.logoSpiral, discMaterial: ctx.materials.logoDisc, radius, stroke, disc, discDepth, doubleSided })` builds the exact Recamán mark as a `Group` of merged meshes (XY plane, facing +Z). `spiralMaterial` is required.
  - Never rotate it in-plane, recolour it or animate its shape. Fade, scale and opacity are allowed.
  - `logoSvg()` gives the DOM version.

### 5.14 Text and signs (`ctx.text3d` / `ctx.text`)

```ts
ctx.text3d.create({ text: {...}, font: 'display' | 'display-medium' | 'sans' | 'sans-semibold' | 'mono' | 'mono-medium',
                    size: 0.25, color: 0xf5f5f4, anchorX: 'center', maxWidth: 2, uppercase: false, letterSpacing: 0.12, glow: 1.3,
                    billboard: false, position: [x, y, z] }, parentObject);
ctx.text3d.sign({ eyebrow, title, body, width: 2.4, stand: true, position, rotationY });   // dark panel + orange→teal hairline
ctx.text.label({ text: '// 02 · REGELN', size: 0.12 });   // Geist Mono eyebrow
```

Text uses the brand fonts via troika SDF and updates automatically on language change.

### 5.15 Assets

```ts
const model = await ctx.assets.loadModel(ctx.assets.zoneUrl('machine.glb'));   // public/zones/<id>/machine.glb (cached, cloned)
const tex = await ctx.assets.loadTexture(ctx.assets.zoneUrl('decal.png'));
```

- **Founder decision D2: no third-party robot models, names or look-alikes.** Robots other than EMI are procedural and unbranded ("Hersteller X"); see the AMR in `_example`. Label scripted motion with `{ key: 'core.robot.disclaimer' }` ("Illustrative Animation, keine Telemetrie.").
- No shipped zone loads any asset file; everything is built in code.

### 5.16 Lights, events and debug

- `ctx.lights.point(posOrObject, { color, intensity, distance })` adds a **virtual** light. The engine renders only the 4 nearest, as a fixed pool, so shaders never recompile. Prefer emissive materials. GDD budget: ≤ 2 local lights per zone.
- `ctx.events.on/once/emit` auto-unsubscribe on dispose. Prefix custom events with your id (`'sensordom:mode'`).
- **Core events:**

  | Group | Events |
  |---|---|
  | Zones | `zone:enter`, `zone:exit`, `zone:ready`, `zone:error` |
  | Pass | `stamp:awarded`, `stamp:updated`, `prediction:recorded`, `question:awarded`, `album:unlocked`, `best:updated` |
  | Interaction | `interact`, `grab:start`, `grab:end`, `throw` |
  | Mode and settings | `mode:changed`, `lang:changed`, `settings:changed`, `quality:changed` |
  | Game | `game:start` (Phase 6: `{ mode, skipAscent? }`, DECISIONS D13), `game:pause`, `game:resume`, `game:ready` (Phase 6: the title or play is up **and** every zone has settled), `player:respawn` |
  | Phase 6 | `dialogue:idle` (EMI's queue ran empty and the last line finished; §5.4), `world:late-build` `{ what }` (something was built after the warm-up, e.g. the lazily loaded finale: the engine compiles the scene's new programs in the background); `objective:changed` also carries `lift: [x, 0, z] \| null` (the KIEL lift while it is open, for the map) |
  | Operate mode | `operate:enter`, `operate:exit` |
  | Island | `island:gust`, `island:tilt`, `objective:changed` `{ zone, manual, target }` (island → map) |
  | Finale / map | `finale:dusk` `{ t }` (finale → island, §6), `map:set-target` `{ zone \| null }` (map → island: "Als Ziel setzen" / "Ziel aufheben"), `objective:request` (asks the island to re-announce) |
  | Keys and misc | `map:toggle`, `emi:ask`, `overlays:changed`, `progress:reset` |
  | Game layer (Phase 4) | `challenge:begin`, `challenge:result` `{ key, zoneId, id, station, stars, best, newStars, personalBest, value }`, `challenge:fail`, `stars:changed`, `collectible:found` `{ id, n }`, `emi:skill` `{ id }`, `befund`; `stamp:awarded` now carries `earned` (earned, non-skipped stamps) |
  | World and UI (Phase 4) | `finale:ended` `{ earnedStamps, stars }` (once, when the ending starts), `logo:element` `{ index, phase: 'start' \| 'done', pending }`, `logo:sweep` `{ phase, earned }`, `logo:bow` `{ earned }` (tower), `player:launch` (jump pad or Turmsprung), `world:arrived` (dock line spoken), `ui:pass-flash`, `ui:fade`, `ui:open-pass`, `ui:open-map` |

- **Debug:**
  - `ctx.debug.enabled` is true with `?debug=1`.
  - `ctx.debug.log(...)` and `ctx.debug.marker([x, y, z])`.
  - **`ctx.debug.register('solve-a', fn)`** registers a deterministic test hook; run it with `__academy.solve('<id>', 'solve-a')`. The GDD requires `solve-a`, `solve-b`, `solve-c` and `album` per zone. `solve()` resolves with the hook's (awaited) return value, so report hooks can simply `return { … }`.
  - Since Phase 4 every zone also has `stars3-a`, `stars3-b`, `stars3-c` (submit a ★★★ result); `solve-a/b/c` submit a ★ result.

### 5.17 Game layer (`ctx.game`, Phase 4)

Design and contract: `docs/FUN-PLAN.md` §4. Types: `ZoneGame`, `ChallengeDef`, `ChallengeHandle`, `ZoneJuice`, `ZoneCollectibles`, `ZoneSkills` in `src/core/zones/types.ts`. Same object for zones, the island module and the finale. Example: `src/zones/_example/`.

```ts
const ch = ctx.game.challenge({
  id: 'a',                                   // the station id; station: false for anything else (the finale's 'f1')
  title: { de: 'Fädle drei Ringe ein', en: 'Thread three rings' },
  metric: { label: { de: 'Zeit', en: 'Time' }, unit: 's', better: 'lower' },
  goals: [{ text: S.goal1 }, { text: S.goal2, at: 120 }, { text: S.goal3, at: 60 }], // ★ = the stamp condition
  lesson: S.lesson,                          // ≤ 14 words, shown with the first ★ result
  why: () => cardSpec,                       // the former auto card: only via [H] / Warum? / the Pass
  retry: () => resetStation(),               // [R] while the banner or fail flash is up; ≤ 1 s to playable
  emi,
});
await ch.begin({ countdown: true, timer: { seconds: 60 } });
ch.live({ de: '2/3', en: '2/3' });
ch.submit(seconds);                          // or ch.submit(null, { stars: 2 }) for compound goals
ch.fail({ de: 'Glas! LiDAR: nichts.', en: 'Glass! LiDAR: nothing.' });
panel.prepend(ch.chips());                   // three live goal chips
```

- **Stars.** Star i needs goals 0…i. A goal without `at` counts only as goal 0 (the completed attempt). Best stars, best value and attempts persist in the Progress blob (`challenges`, v 1). „Neuer Bestwert“ is never flagged on the first attempt. Stars rate the player's play, never a robot (DECISIONS D8, pending).
- **Banner** (`src/ui/ResultUi.ts`): a stamp and a result within 1.5 s give **one** banner (a station with a challenge waits up to 1.5 s for its result, otherwise the classic stamp shows). It sits in the lower third above the subtitles, joins the subtitle column in operate mode and hides under real modals. Keys while it (or the fail flash) is up: R = retry (consumed, so the zone's own R handler does not also fire: `ctx.input.isConsumed(e)`), H = `why()`, Enter closes. With the tower line still pending it adds „Schau zum Turm.“.
- **Juice** (`ctx.game.juice`): `burst` (one engine-wide pooled InstancedMesh, ≤ 256 particles, 1 draw call, `src/systems/Juice.ts`), `popup` (world-label pool), `pulse` (screen edge, off with reduced motion), `cue` (nine calibrated cues: good, great, bad, oops, tick, go, star, pb, collect; peak −18 … −9 dBFS), `countdown`.
- **Sensorkapseln** (`ctx.game.collectibles`, `src/systems/Capsules.ts`): `place({ id: '<zoneId>.kapsel', position, radius })`; 16 instanced bodies + glow rings = 2 draw calls; pickup by segment test, so jump-pad flights collect too. Calling `place` again with the same id moves the capsule (Greifwerkstatt G4).
- **Skills** (`ctx.game.skills`): six EMI-01 skills (sehen … messen); a zone's skill unlocks with its first earned stamp (`emi:skill`).
- **Progress** for the tower, masts, map and certificate: `ctx.game.progress()` → `{ earnedStamps, stamps, stars, maxStars, capsules, capsulesTotal, finaleEnded }`; `ctx.game.stars(zoneId?)`.
- **Engine additions behind it:** `Progress.recordChallenge / countAttempt / challengeRecord / stationStars / totalStars / earnedStamps / collect`; `Input.consumeEvent / isConsumed / lastInputAt / keyboardOnly`; `InfoCards.log` (requested vs automatic opens); `WorldLabels.popup / occlusionTest`; `Hud.showBanner / flashPass / setTelemetry / suppressHintIfIn`; `AudioSystem.cue / hiss`; `EmiUnit.setFar` (far LOD beyond 30 m, hysteresis 28/32 m); `ZoneManager` LOD hysteresis ±2.5 m (±5 m on the exterior tier).
- **Test hooks:** `__academy.stars()`, `challenges()`, `challenge(zoneId, id, value, stars?)`, `collect(id)`, `capsules()`, `skills()`, `gameUi()`, `cards()`, `juiceDemo()`, `audioCue(name)`.

---

## 6. Island module (`src/world/`, island team)

- **Loading.** `src/world/index.ts` default-exports `defineZone({...})`. It is loaded like a zone anchored at the world origin (facing 0, radius `ISLAND.radius`), so the whole ZoneContext API is available. If it throws, the engine uses a flat emergency ground and shows a toast.
- **Layout** (`src/world/layout.ts`, pure data + pure helpers, never throws): `ZONE_PLOTS` / `PLOTS` (GDD §4.3), `HUB` (spawn (0, 0, 94.5), yaw 0, pitch +6°), `ISLAND` (main disc r 85, lobes r 22 on the r 80 ring, Landedeck, Glasbalkon, Kanzeln, `killY` −66), `PATHS`, `PADS`, `TOWER`, `LIBELLE`, `KEEL`, `ROUTES` (objective order per mode), `ATTRACT_CAMERA`, and helpers `bearingDir`, `polar`, `bearingOf`, `outlineRadius(b)` (solid deck outline), `gateMastPosition(b)`, `hopNumbers(d)` (Appendix B) and `rescuePoint(from)`.
  - The engine calls `rescuePoint()` when the player falls below `killY`: near a plot → that plot's gate spawn; on the Glasbalkon or a Kanzel → back on the deck; elsewhere → the same bearing, 5 m inside the rim. A rescue drone flies to the spot and EMI-01 comments.
- **Module map** (`src/world/`):

  | File | What |
  |---|---|
  | `deck.ts` | Deck slab (polar trimesh, oculus hole), rim band, paths (§4.5) in runway tone with alu kerbs, "turbine disc" plaza with teal rings, plot pads, inlays (teal; the objective spoke orange), Glasbalkon and the four glass-floored Kanzeln, bollards (off by day, on at dusk) |
  | `railing.ts` | 1.1 m perimeter railing (alu posts, two cables, handrail with a teal line; railings cast no shadows) with zone `railingGaps`, glass parapets |
  | `terrain.ts` | Since Phase 4 no pines, mounds or boulders; the free deck is built by `landscape/` |
  | `landscape/` (Phase 4; Phase 5 changes marked ⁵) | `plan.ts` (placement; ⁵ exports `PV`, `PV_FIELDS`, `PV_ROWS`, `DRONE_DOCKS`, `TURMSPRUNG`; `SOLAR_TREES` / `GROVES` removed), `solar.ts` (⁵ `buildSolarRows` / `SolarRows` with `kick`, `drive`, `setShadows`: 16 PV tracker segments, 180 glass–glass modules, 2 draw calls), ⁵ `lanes.ts` (data-packet pulse shader along the light channels, listens to `objective:changed`; edge studs; rover lane paint; ring-frame band, hatches, vent grates, tie-downs), ⁵ `glow.ts` (dusk light spill and bollard pools, 2 draw calls, dusk only), ⁵ `drones.ts` (4 maintenance drones and docks, 3 draw calls), `intakes.ts` (8 cooling intakes with fans, 12 hatches), `fins.ts` (6 fin banks), `pods.ts` (3 hydroponic pods), `sensors.ts` (12 rim masts with gust vanes), `rovers.ts` (8 service rovers since Phase 5, kinematic colliders), `numberline.ts` (Allee number line, OEIS A005132 plaque), `fun.ts` (world capsules, 12 position lights, Turmsprung pad, toys), `batch.ts` (static geometry merged per material, meshes `island:static:*`); one `ctx.every(1/60)` animation loop, static on low |
  | `underside.ts` | Panelled ceramic hull (fairing to r 66 at y −9, belly annulus), keel truss in alu with warm node lights, six thruster pods with ceramic shrouds and teal duct rings plus four 0.4× trim rotors under the Kanzeln, Kielraum shell (alu truss, tinted glass), catwalk, white gimbal rings and the IMU sphere (the Regelkern) |
  | `hub.ts` / `foyer.ts` / `tower/` (Phase 4; Phase 5: ⁵) | Akademie-Turm v2 and the foyer. ⁵ The mark is a planar relief: `sculpture.ts` builds ring + 17 arcs in one plane on a dial, ⁵ `mount.ts` (collar, yoke, pivots, hub, back ribs; `latticeFrontZ` clearance), ⁵ `lathe.ts` (lathe helper with per-band normals), ⁵ `constants.ts` owns the depth stack (`SCULPTURE.center/faceZ/backZ/standoff`), `latticeOuterR()` and `WAIST`; debug `world:logo-check` and `world:logo-geom` replace `world:logo-drift`. `tower/structure.ts` (drum, split doors, lattice, core with level rings, halo Ausguck, balustrade, crown masts with zone beacons, needle, shaft, car, benches), `kit.ts` (ceramic, alu, carbon, glass, light tiers; brand-exact orange and disc), `sculpture.ts` (Recamán tubes, planar since Phase 5; lit shader with `uProgress[18]`, `uFade[18]`, head glow and sweep), `arm.ts` (skinned 6-axis drawing arm, 3 draw calls), `fx.ts` (beam + instanced sprites, 2 draw calls), `logo.ts` (progress hook: stamps → lines, visibility rule, pending chain, sweep, bow, island progress key `logoShown`), `messpunkt.ts` (plate + card), `interior.ts` (foyer), `state.ts` (lift/objective state shared by hub, lift and foyer), `constants.ts`; foyer: Pass-Terminal (optional since Phase 4), Inselmodell, Lernpfad boards with ★, Selbstmessung, oculus |
  | `radio.ts` (Phase 4) | EMI-01 radio companion (≤ 1 line per 20 s, queued, quiet in the Kielraum and through the ending) and the capsule hint |
  | `libelle.ts`, `transit.ts`, `masts.ts`, `lift.ts` | Spirit level (ball reacts to tilt and gusts), 12 Sprungplatten, 6 gate masts with beacons, lift FOYER ↔ AUSGUCK (KIEL locked until stamps in 4 zones) |
  | `placeholders.ts` | "Im Aufbau" holograms per plot (hidden on `zone:ready`) |
  | `sky.ts` | Wisps, distant Prüfinseln as hexacopter platforms, six-rotor cargo multicopters (were airships), two inspection drones around the tower, rescue drones (sky and cloud sea themselves are engine: `src/core/Environment.ts`) |
  | `dusk.ts` | `finale:dusk` handler: blends the environment from the day look to dusk, switches the path lamps on |
  | `surface.ts` | World-space mottling / roughness / micro-relief for the island's own plain materials (cloned once; zones untouched). Phase 6: `enrichSurfaces(root, onDispose, yieldFn?)` is the island's last init step; after the surface pass it runs the static merge (`statics.ts`) and flushes the landscape batch, in slices when `ctx.yield` is passed |
  | `statics.ts` (Phase 6, W1) | The static merger. `markStatic(obj)` marks a subtree whose meshes merge after init; `mergeScope(group)` keeps merged meshes inside a group that is hidden or moved as a whole (foyer, underside, Kielraum, the rotating gimbal rings, the model table). Merging is per shading model: `UberStandard` (colour, roughness, metalness and the surface pass per vertex), `UberBasic` (light tier per vertex with the brand or tower-kit dusk lift), `UberHull`, `UberDeck` (per polygon offset), and per identical material for the rest. Shadow cast/receive are per vertex. Never mark interactables, moving parts, collider proxies or meshes that code reaches through their reference; a material swap within one shading model goes through the recolour proxy (`userData.recolor`, as the objective inlays do). `?mergeab` + `__academy.solve('world', 'static-ab')` swaps the unmerged sources back in and switches every cull off (same-frame A/B); `'static-stats'` reports sources, meshes, ms and slices |
  | `detail.ts` (Phase 6) | `cullTinyText(ctx, text)`: hides a label whose glyphs are under 0.3 device pixels |
  | `finale/lazy.ts` (Phase 6, W6) | The finale (`src/world/finale/**`) is its own chunk. The stand-in loads it in idle time after `game:ready`, at Start at the latest, at once when KIEL opens or the save needs it; until then it restores the dusk on boot, keeps KIEL open, proxies the KIEL button and the 12 `finale-*` debug hooks (they return Promises; `solve()` awaits them) and then emits `world:late-build` `{ what: 'finale' }` |
  | `textures.ts` | Procedural canvas textures + normal maps derived from them (deck, paving, plaza, plot, rim, rock, riveted plates) |
  | `intro.ts`, `onboarding.ts`, `landing.ts`, `questions.ts` | Ascent flight, EMI-01 arrival beats and the objective system, shuttle pod + map board + plaques, the nine vendor questions |

- **Zone manifests.** `ctx.zones.list()` returns name, number, verb, eyebrow, glyph, stations, questions, album, `railingGaps`, anchor, facing, radius and status. It is available during the island's init, because zone modules are imported first; the island uses it for gate-mast signs, railing gaps, the map board and the Lernpfad wall. `ctx.zones.stamps(zoneId)` returns 0–3 and `ctx.zones.visited(zoneId)` whether the player has entered the plot.
- **Objective system (GDD §5.4).** The island computes the current objective from the mode's route (`ROUTES`; Entdecker: first zone with < 3 stamps, Entscheider: first zone without a stamp). It lights that zone's gate beacon, spoke inlay and hub pad ring orange, marks the map board and the Lernpfad wall, and sets the HUD objective with a compass target at the gate. When the route is done it points at the lift door in the foyer ("Jahresprüfung: Fahr mit dem Lift auf KIEL −36"), during an unfinished finale it says so, and after the ending it switches to free roam. A zone's own objective wins while the player is at that plot (§5.4).
- **Onboarding** (Phase 4: play first). Dock gust → radio line → EMI-01 at (3.4, 0, 22.6) → the player presses „Böe auslösen“ at the Libelle's control column (−3.3, 0, 22.7; Phase 6: turned to yaw −0.2 rad, stand point (−3.60, 24.17), with an invisible pick volume over the head so it can be aimed at from the arrival pitch): the island tilts 2.2–2.9° and catches itself, the readout above the button head is live from the press and then shows the settle time and the number of corrections (FIKTION) → the Pass is handed over at the Libelle; the „[Tab] öffnet ihn“ toast waits for `dialogue:idle`. Phase 6 (W2): a key-cap movement card („// Steuerung“: W A S D Gehen · Maus oder ← → Umsehen · Shift Sprinten · H Hilfe) appears 2 s after EMI's first line, stays until the player has walked ≥ 3 m and turned ≥ 30°, and comes back after 8 s standing still while the Libelle is still ahead. Phase 6 (W5): on the plaza (r < 36 m) the objective's hub pad gets a steady 11 m orange beam (hidden within 5 m and in flight) and a raised ring, the compass points at that pad, and other pads add „· dein Ziel: <Zone>“ to their hint. The foyer Pass-Terminal is optional. Onboarding ends early when the player enters a zone or earns a first stamp: from then on the route objective shows, and EMI-01 drives to the foyer door (2, 0, 11), where it shows its newest skill. Debug: `solve('world', 'libelle-gust')`, `'emi01-demo'`, `'emi01-demo-<skill>'`.
- **Placeholder hook.** Plots show an "Im Aufbau" placeholder until the zone emits `zone:ready`; a zone that fails during load/init shows it again (`zone:error`). `__academy.solve('world', 'placeholders')` logs the plots still showing one (console info).
- **Environment.** Tune it with `ctx.env.set({ zenith, mid, horizon, horizonSun, below, sunColor, sunDiscColor, sunIntensity, sunAzimuthDeg, sunElevationDeg, hemiSky, hemiGround, hemiIntensity, fogColor, fogDensity, envIntensity, cloudSea, cloudY, cloudLight, cloudShadow, exposure, toneMapping: 'aces' | 'agx', cirrus, stars })` (island module only). Read the current values from `ctx.env.params`.
  - **Day look (art pass).** `DEFAULT_ENV` in `src/core/Environment.ts` is the art-directed golden hour above the clouds: deep blue zenith, warm sun-side horizon (sun WNW, 16°), cool haze away from the sun, faint cirrus, sun disc that blooms. Materials stay warm stone neutrals; the light carries the colour (warm sun, cool sky fill, warm cloud bounce from below via `hemiGround`). This replaces the GDD §9.5 stone-brown sky, which read as sepia.
  - **Sky and cloud sea** share one `atmos(direction)` function, so the cloud sea fades into exactly the sky's below-horizon colour (no seam). The cloud sea is a lit height field (billows, masses, gaps, sun-shadow march, the island's own shadow), relief-marched with 18 / 12 / 0 steps on high / medium / low. Against jagged heap edges: step growth is capped (150 / 230 m), the hit is refined by secant steps (no terraces), the small billows fade to their mean with distance, mid-distance pixels (380–4200 m) on high march a second ray half a pixel up (2× vertical supersampling), and silhouettes where the hit distance jumps are blended with their 2×2 neighbours via screen derivatives. Cost, cloud sea alone at 1920×1080 from a Kanzel at dusk: ≈ 0.13 ms per frame on an M5 Pro (0.11 ms before the anti-aliasing).
  - **Aerial perspective.** The engine patches three's fog chunks once: fog toward the sun azimuth is warmer and brighter, away from it cooler. Any fog-enabled material gets it for free (no extra uniforms).
  - **Grade.** Tone mapping (`aces` default, `agx` optional) runs inside one grade pass with a gentle S-curve, saturation and split toning (cool shadows, warm highlights). Since Phase 6 every preset, low included, renders through this composer grade (low without MSAA and bloom), and the grade itself clamps NaN/Inf (no separate sanitize pass). Engine API: `rs.setGrade({ contrast, saturation, shadowTint, highlightTint })`.
- **Dusk (`finale:dusk`).** The finale emits `ctx.events.emit('finale:dusk', { t })` with `t` 0 (day) … 1 (full dusk), as often as it likes (every frame during its 20 s sunset is fine; `t` may jump or run backwards). The island (`dusk.ts`) blends sky, sun (16° → 3°), fog, cloud sea, hemisphere, env light, exposure, cirrus and stars to a stone-900/amber dusk, switches the path bollards on (they are off by day, GDD §6.1) and brightens the tower windows. The env map regenerates at most every 0.66 s while the dusk keeps changing (Phase 6, `ENV_REGEN_S`; a single change still rebuilds at once). Preview: `__academy.solve('world', 'dusk')`, `'dusk-half'`, `'day'`.
- **Question cards.** The island registers the nine texts from GDD Appendix C (`questions.ts`). Zones only call `ctx.pass.awardQuestion(n)`.
- **Gusts and tilt.** The island emits a gust every 60–90 s (`island:gust`, strength 0.3–1, bearing) with a ≤ 0.5° visual tilt; pods lean into it, rotors pitch up, the Libelle ball rolls and the wind swells. Listen with `ctx.island.onGust`. `__academy.solve('world', 'gust')` fires one. `ctx.island.setTilt(roll, pitch)` (±3°, ignored with reduced motion) is reserved for the finale.
- **Panels from world props.** Emit `ui:open-pass` or `ui:open-map` (as the Pass-Terminal, the Inselmodell and the map board do) to open the engine's Pass or map.
- **Help key.** H routes to the nearest EMI's `onAsk`. If no EMI is near, `emi:ask` fires with `{ zone }`. EMI-01 waits at the Libelle until the onboarding sends it to the foyer door (2, 0, 11).
- **Jump pads.** Hub pads (r 27) ↔ zone pads (r 52), T = 2.5 s, via `ctx.player.launch(v0, { gravity: 9.81 })`; a fade teleport with reduced motion. Since Phase 4 the landing point is 2.5 m past the target pad (`transit.ts` `PAD_OVERSHOOT`, `padLanding()`), only E launches, and a pad arms only when the player walks onto it. The Turmsprung pad (bearing 315, r 24) appears at 12/12 capsules and flies to the Ausguck in 4 s (`solve('world', 'turmsprung')`).
- **Start flow.** Title screen (premise, mode cards with time estimates, "Weiterspielen · n von 18 Stempeln" for returning visitors) → Start → 25 s ascent (`intro.ts`; two captions carry the premise, „Diese Insel fällt ständig." / „Tausendmal pro Sekunde fängt sie sich wieder."; skippable with Space, Enter, E or a click, hint in the bottom-right corner; not with `?skipIntro=1`) → dock gust → EMI-01 radio line → walk to the Libelle → gust button (first mechanic) and Pass handover → orange jump pad → first zone (Phase 4; the Pass-Terminal beat is optional). Progress of these beats is stored with `ctx.progress` (`onboarding` 0–3); a visitor who already reached the finale counts as onboarded. Measured with real input (`tools/onboarding-run.mjs`, Phase 4 build): first mechanic after 41.7 s and first zone after 60.2 s watching the whole ascent (DE, Entdecker); 19.2 s and 35.2 s skipping it (EN, Entscheider). Skipping fades to black and cuts to the spawn. **Returning visitors (Phase 6, DECISIONS D13):** after one complete ascent (island progress `ascentSeen`; `intro.play()` resolves with `completed`), Start emits `game:start` `{ skipAscent: true }`, the title shows „Anflug ansehen“ (it calls `start(mode, { approach: true })`), and `Game.returnPlan()` teleports the player to the gate of `Progress.lastZone` (saved on every `zone:enter`) with a „Weiter im …“ toast (`layout.zoneInPhrase()` gives „im …“ / „in der …“); `eagerZones()` builds that zone before the title. `begin()` plays the dock beats only within 20 m of the Landedeck spawn. The CTA reads „Weiterspielen“ whenever `Progress.hasAnyProgress()` (stamps, stars, capsules or question cards, read from the save).
- **KIEL lift sign and the finale.** The car's KIEL button reads FREI/OPEN (teal) once 4 zones have a stamp *or* the finale has been reached (`lift.setKielOpen`, set by the finale), else GESPERRT/LOCKED; it re-reads on stamps, rides, finale state and resets.
- **After the ending.** The evening stays: on reload the island starts at full dusk (sky, sun 3°, bollards, tower windows), all six gate beacons stay teal, the route objective switches to free roam. A sky switch (`// HIMMEL`, TAG ↔ ABEND) beside the certificate stand on the Ausguck blends to day and back over 6 s (instant with reduced motion); the choice is stored in island progress (`sky`). `node tools/ending-check.mjs` checks all of this across reloads.
- **Rotor names.** Six main lift rotors **M1–M6** under the lobes (M1 Sensordom … M6 Prüffeld, the order of `ZONE_PLOTS`); four 0.4× **trim rotors T1–T4** under the Kanzeln at 60/120/240/300° (clockwise from north; DECISIONS D7), each named on a floor plaque in its Kanzel.

---

## 7. HUD and brand reference

- **Fonts.** Space Grotesk (titles, signage), Geist (body), Geist Mono (numbers, eyebrows), OFL 1.1 (`LICENSES/`), in `src/ui/fonts` with content-hashed names in the build. The 3D text (troika) needs six faces and cannot parse WOFF2, so those six are lossless **WOFF** files that the DOM uses too (one download each); the four DOM-only faces are **WOFF2**. Since Phase 6 the shipped files are **subsets** made by `tools/subset-fonts.mjs` from the full originals in `src/ui/fonts/full/` (Latin-1, Latin Extended-A, typographic punctuation, super- and subscripts, €, arrows, maths signs and every character in the source strings; `src/ui/fonts/subset.json` records what was kept). A glyph a troika font lacks is resolved from the **self-hosted** unicode-font-resolver data in `public/fonts/unicode-resolver/` (`configureTextBuilder({ unicodeFontsURL })` in `Text3D.ts`; only the Greek block is hosted, for σ). A new symbol in a string: run `node tools/glyph-check.mjs`; if it says so, rerun the subsetter or copy the resolver block — otherwise troika would fetch it from a public CDN (a third-party request). In dev, `src/core/glyphCheck.ts` warns about such a 3D label. For canvas drawing use the CSS family names (`'500 16px "Geist Mono"'`).
- **Colours.**
  - Orange `#FF6700` is the hero colour, used sparingly. Teal `#2DD4BF` is secondary.
  - Stone neutrals: `#141414`, `#1F1F1F`, `#292929`, `#3D3D3D`, `#2A2A2A`; text `#F5F5F4`, `#A8A29E`, `#78716C`.
  - Status: `#4ADE80`, `#F87171`, `#FBBF24` (ILLUSTRATIV).
- **Cards.** `#1F1F1F`-ish glass, 1 px `#2A2A2A` border, 12–16 px radius, orange→teal hairline on top.
- **CSS classes for your own DOM** (`openModal`, operate panels): `.btn`, `.btn.primary`, `.btn.ghost`, `.eyebrow`, `.mono`, `.display`, `.kbd`, `.tag`, `.tag.orange|teal|warn`, `.chip`, `.seg` (segmented buttons with `.on`), `.progress > i`, `.glass`, `.hairline`.

---

## 8. Strings and voice checklist

- German first; English for every key. Keep technical terms as they are: Pick-and-Place, Failure-Mode, Holdout.
- "du" in both modes, never "Sie" (DECISIONS D1). Entscheider mode changes depth and angle, not the form of address.
- Numbers before adjectives. Every claim carries a falsification condition or a measured value. Label invented values `illustrative: true` or `ui.chip('illustrativ')`.
- Forbidden words:
  - "humanoide Roboter" (say "kognitiver Roboter")
  - revolutionär, disruptiv, bahnbrechend, Game-Changer
  - KI-getrieben / KI-gestützt
  - nahtlos, innovativ, smart, zukunftssicher
  - "Roboter ersetzen Menschen" (say "Roboter übernehmen die harte Arbeit, Menschen das Denken")
- Always spell it "EmAI". No customer names, no prices, no pass/fail stamps: show curves and intervals.

---

## 9. Performance rules

- **Budgets.** Per-zone budgets are in §1. The global worst view is ≤ 500 draw calls, 1.5 M tris. The engine overhead is about 60 draw calls at the hub.
- **Merge and instance.** Since Phase 6: call `ctx.mergeStatic(ctx.groups.exterior, { keep })` once at the end of init (§16) instead of merging by hand; it merges per material, packs plain Standard/Physical/Basic materials into shared vertex-attribute materials and freezes the rest. For anything else, `mergeGeometries` from `three/examples/jsm/utils/BufferGeometryUtils.js`. Use `InstancedMesh` for repeats.
- **Freeze what never moves.** `ctx.freezeStatic(obj)` on static subtrees (no per-frame matrix update). Never on parts that animate, sway or follow physics.
- **Long inits yield.** `await ctx.yield()` between build steps that take more than a few ms at 4× CPU, so no task before the title goes over 250 ms.
- **Transparent DoubleSide** materials are drawn twice and re-validate their program every frame: set `forceSinglePass = true` when back faces are not needed (flat and additive parts; check curved lit glass visually first).
- **Shadows.** Only meshes larger than about 1 m should set `castShadow = true`. The sun shadow covers 90 × 90 m around the player.
- **No per-frame allocations** in `update`/`fixedUpdate`. Hoist `new THREE.Vector3()` to module scope.
- **Lights.** Max 2 virtual lights per zone; no shadows from them.
- **Canvas textures.** Redraw only when values change; ≤ 1 render target ≤ 512² per zone.
- **Raycasts.** Batch them, and use a private world holding only the colliders you need (LiDAR).
- **Quality presets** low/medium/high (DPR caps 1.0/1.25/1.5). Post-processing chain for every preset: bloom → grade (tone mapping + S-curve, saturation, split tone; clamps NaN/Inf) → vignette; low skips the bloom passes and MSAA. MSAA follows the effective pixel ratio after the cap (`MSAA_BY_PIXEL_RATIO`: 4× up to 1.0, 2× up to 1.5, none above; never more than the preset's). **`auto`** (Phase 6, C10) adapts: GPU-bound frames lower the render scale 1.0 → 0.6 in 0.1 steps (at least 2 s apart), then light clouds (high only), then the preset after 4 s at the bottom; CPU-bound frames (main-thread ms ≥ 0.6 × the median frame interval) never change anything. Step-ups come after 6 s when the GPU timer says the next step fits, otherwise as a probe after 15 s on time (doubled after each failed probe, up to ×16; reset by a window resize). The GPU timer (`EXT_disjoint_timer_query_webgl2`) is a hint only: on ANGLE over Metal it reads frame latency, so a reading above 1.05 × the median interval is ignored. The start tier comes from the renderer string (`tierForRenderer`: Intel HD/UHD and software → low; Iris, AMD integrated and base Apple M1/M2 → medium; else high), and `{ level, scale, renderer }` is saved under `quality-auto`. A preset that failed is not retried in the session. All thresholds: `AUTO_QUALITY` at the top of `RenderSystem.ts` (live as `__academy.game.rs.auto`); `?debug=1` shows scale, light clouds and GPU ms. Use `?quality=low` to test the low path.

---

## 10. Honesty and brand in 3D (do and don't)

**Do**
- Use warm-dark stone metals and concrete, with orange only as small emissive accents (objective, active station, hazard tape, joint rings, key metrics).
- Use teal for sensor rays, data, waypoints and Wilson bands.
- Show measurement visibly: live readouts and Kennlinien with intervals, and label illustrative data.

**Don't**
- No orange floors, walls or fog.
- No blue-grey sci-fi neutrals or neon.
- No glow, pulse or rotation on the logo.
- No "autonom" without a share.
- No pass/fail stamps.

---

## 11. URL parameters

| Param | Effect |
|---|---|
| `?zone=<id>` | Spawn at that zone (`hub` = hub) |
| `?only=<id>[,<id>]` | Load only these zones (parallel development) |
| `?skipIntro=1` | No start screen; play immediately (no pointer lock needed) |
| `?lang=en` / `?mode=entscheider` / `?quality=low` | Language / audience / quality |
| `?debug=1` | Stats overlay, collider wireframes, trigger volumes (toggle with F3 or backquote) |
| `?pos=x,y,z&look=yaw,pitch` | Exact world feet position and view in degrees (yaw 0 = facing −Z, +90 = facing −X) |
| `?dev=1` | Also load dev zones (`_*`) |
| `?mute=1` / `?reset=1` / `?world=0` | Mute / wipe progress / skip the island module |

---

## 12. GDD §5.1 capability → engine name

| GDD | Engine |
|---|---|
| `create(ctx) → ZoneInstance {update(dt, elapsed), updateFar, onEnter, onExit, dispose}` | Supported as is. `init(ctx)` + hooks is the equivalent alternative |
| manifest `number/name/verb/eyebrow/glyph/stations/questions/album/railingGaps` | Supported as is (`title` = `name`) |
| `ctx.groups.detail/exterior/far` | Supported as is (45 m / 130 m) |
| `ctx.physics` RAPIER, world, static helpers, `createPrivateWorld()`, groups `PLAYER/STATIC/SENSOR_IGNORE` | `ctx.physics.rapier/world/addStatic*/createPrivateWorld/groups`. Glass: `addStaticBoxSensorIgnore` + `raycast(…, {sensorRays: true})` |
| `ctx.player` `setSpeedFactor/setHeadBob/setVignette/lockMovement/teleportLocal/carry` | Supported as is (setters return `restore()`) |
| `ctx.interact.register(object, {label, radius, onUse, enabled})`; `enterOperate({cameraPose, panel, onExit})` | `ctx.interact.register(...)`; operate mode is **`ctx.player.enterOperate(...)`** |
| `ctx.ui.card/subtitle/hint/chip/panel/kennlinie/predict/plot/readout` | Supported as is (+ `status`, `formatRate`, `wilson`) |
| `ctx.i18n.t/lang/mode/onChange` | Supported as is (`ctx.mode`; strings under `zone.<id>`) |
| `ctx.pass.award(stationId, {value, skipped})/recordPrediction/awardQuestion/unlockAlbum/has` | Supported as is (+ `registerAlbum`, `setBest`, `getBest`) |
| `ctx.emi.spawn({unit, pose})` | `ctx.emi.spawn({ unit, position, yawDeg })` |
| `ctx.island.onGust/tiltDeg` | Supported as is (+ `emitGust`, `setTilt` for the island module) |
| `ctx.audio.ctx / zoneBus` | `ctx.audio.context` / `ctx.audio.zoneBus` |
| `ctx.materials` (§9.3 names) | Supported as is (plus the engine's own names, §5.13) |
| `ctx.text.sign/label` | Supported as is (`ctx.text3d` = full API) |
| `ctx.env.enterInterior/exitInterior` | Supported as is |
| `ctx.settings.reducedMotion/quality/overlays` | Supported as is |
| `ctx.debug.register('solve-a', fn)` | Supported as is → `__academy.solve(zoneId, name)` |
| `objective.set(zoneId)` (gate beacons, spoke inlays) | Done by the island module from the stamps and `ROUTES` (§6). Zones use `ctx.hud.setObjective(text, {target})` for their own steps |
| BatchedText | Not wrapped. Use `ctx.text3d.create` sparingly or merge labels into a canvas texture |

**Deviations from the GDD:**
- Eye height is 1.7 m (engine brief), not 1.65.
- Jump-pad readout: v₀ is computed from Appendix B (15,8 m/s for the 25 m hop); §6.4's example text says 16,1.
- The Kanzeln have glass floors (so they really look down at the thrusters); the GDD only specifies glass parapets.
- Tone mapping is ACES (inside the grade pass) by default. AgX was compared in the art pass (`artifacts/art/tonemap/`): it greys the blue sky and turns the medallion's #FF6700 pastel and its #141414 disc grey, so ACES stays. `env.set({ toneMapping: 'agx' })` switches to it.
- Sky and fog colours follow the art pass (§6 Environment), not the GDD's stone-brown sky.
- The four Kanzeln hang a 0.4× trim rotor each (T1–T4, founder decision D7) below their glass floors, so the floor frames a turning rotor (the six main pods M1–M6 sit under the lobes, hidden from the Kanzeln by the deck slab).
- The M map is canvas-drawn (not SVG) from the §4 constants.
- Bloom is threshold-based, not layer-based. Logo materials stay below the threshold, which has the same effect.

---

## 13. Testing without a human (agents)

**Typecheck only your zone** (other zones' half-written code can't block you):

```bash
npm run typecheck:zone -- my-zone        # engine + src/zones/my-zone
npm run typecheck                        # everything (final integration)
```

**Screenshot and health check.** Safe to run in parallel: each run picks a free port, its own Vite cache and its own browser. **Always add `&only=<id>`** while zones are being built in parallel: without it every zone folder is imported, and another team's broken zone produces console errors (HTTP 500 for its module) that fail your run.

```bash
node tools/shot.mjs --url "/?zone=my-zone&only=my-zone&skipIntro=1" --out artifacts/shots/my-zone.png --wait 3000
node tools/shot.mjs --url "/?zone=my-zone&skipIntro=1&debug=1" --out artifacts/shots/my-zone.png --views "0,0;90,-10;180,0"
node tools/shot.mjs --url "/?zone=my-zone&skipIntro=1" --out artifacts/shots/a.png \
     --eval "await __academy.solve('my-zone','solve-a'); await __academy.waitFrames(30)" \
     --dump "__academy.pass()" --dump "__academy.interactables()"
node tools/shots-all.mjs                                     # hub + every zone → artifacts/shots/*.png + summary.json
node tools/playtest.mjs --lang en --mode entscheider         # full route on a private production build (§15)
node tools/perf.mjs --quality high                           # fps / CPU ms / draw calls / triangles at 40+ views
node tools/audio-levels.mjs                                  # peak / RMS / HF of every global sound (§5.12)
node tools/load-size.mjs [--mbit 16 --rtt 40]                # first-load bytes (brotli) + time to the start screen
node tools/onboarding-run.mjs [--skip-after 3]               # real input: Start → first zone, timed beat by beat
node tools/ending-check.mjs                                  # KIEL sign, dusk, beacons, sky switch across reloads
node tools/text-audit.mjs --lang de --mode entscheider [--shots]   # card word counts, cards that scroll at 1280×720, EMI lines > 2 sentences
node tools/gallery.mjs [--lang en --mode entscheider] [--only hub,dusk]   # release gallery → artifacts/release/*.png
```

**Measurement tools (Phase 6, B3).** Shared harness `tools/lib/measure.mjs`: each tool builds a private production build (or takes `--dist <dir>`, `--dev`, `--base <url>`), prints medians of 3 runs for timings, checks the phase 6 targets and exits 1 on a miss (`--no-check` reports only). `--dist rc3=<dir> --dist head=<dir>` interleaves an A/B where the tool supports it (load-matrix, perf-cpu, gpu-ab). Output: `artifacts/<PT_DIR|measure>/`.

```bash
node tools/load-matrix.mjs [--matrix full]   # first paint, title, Start → control, long tasks, bytes, third-party: cable / 4G / slow 4G × CPU 1× / 4× (CDN-like or vite preview)
node tools/warmup.mjs                        # programs at the title, frames behind the loading screen, first visible frame
node tools/perf-cpu.mjs [--browser firefox]  # JS ms per frame / fps at 4× and 6× CPU; Firefox cpuMs
node tools/drawcalls.mjs                     # main-pass draws by owner (also in perf.mjs; --no-owners skips there)
node tools/progdiag.mjs                      # getParameters (program re-validation) per frame by material
node tools/auto-quality.mjs                  # auto quality at 10× CPU, GPU-bound behaviour, cost of manual switches
node tools/gpu-ab.mjs                        # GPU frame ms, vsync off, 2560×1440 @2 (capped 3840×2160)
node tools/hitches.mjs [--runs 1]            # long frames, late compiles, texture spikes on a first lap (≈ 4.5 min per run)
node tools/idle-render.mjs                   # render calls / JS per frame paused, behind the Pass, on the title
node tools/dialogue-modal.mjs                # EMI lines and game time behind the Pass, the map and pause
node tools/a11y-keyboard.mjs [--browsers chromium,firefox,webkit]   # keyboard path, focus ring, ARIA snapshots
node tools/contrast.mjs                      # WCAG contrast of every HUD text over the live scene
node tools/third-party.mjs                   # requests to other origins; 3D text with other origins blocked
node tools/robust-check.mjs                  # phone notice, no WebGL2, context loss, wasm / zone chunk failing
node tools/glyph-check.mjs [--static]        # every character in its font; 3D glyphs that need the self-hosted fallback
node tools/deploy-check.mjs <url> | --preview   # encodings, content types, cache headers of a deployment
node tools/onboarding-run.mjs --idle 10      # W2: stand still first; the movement card must show
```

- Firefox and WebKit: `npx playwright install firefox webkit`, or point `FIREFOX_EXE` / `WEBKIT_EXE` at an installed browser and `PW_CORE_FIREFOX` / `PW_CORE_WEBKIT` at a `playwright-core` folder of the matching release.
- The dev server picks up other people's in-flight edits; pass `--dist` to pin a build.

- **Output:** `<out>.png` (or `-1.png`, `-2.png` … for `--views`) and `<out>.json`. The JSON contains console errors and warnings, page errors, failed requests, `zones()`, `state()`, fps, `render` (draw calls, triangles, main-thread CPU ms) and the GPU name.
- **`--wait`** (default 2500 ms) runs after the evals; use `--wait 0` to capture mid-animation. `--help` prints all options.
- A dev-server run can be cut short by a Vite full reload when files change under it; the shot tools' private dev server runs without file watching, and `playtest.mjs`, `perf.mjs` and `text-audit.mjs` serve a private production build.
- **Real mouse look headless:** the default headless shell refuses pointer lock. Use `__academy.lookDelta(dx, dy)` (routed through `Input` like real mouse deltas), or `SHOT_CHANNEL=chromium` to run full Chromium in the new headless mode, which grants pointer lock.
- **Exit code** is 1 on page errors, zone errors or console errors. Use `--allow-console-errors` to relax that.
- Headless Chromium runs with `--mute-audio` (WebAudio still renders, so `audioMeter` works; nothing reaches the speakers). `SHOT_AUDIO=1` lets you listen along. Do not run two audio surveys at once: a second browser opening audio can stall the first one's audio thread (`audioMeter().ms` then comes back short).
- Use `--base http://localhost:5173` to reuse a running dev server.
- `--views` takes `yaw,pitch` in degrees (yaw = three.js yaw, 0 = facing −Z/north).
- **Read the PNGs.** Look for black blocks, missing geometry, orange overuse and unreadable text.
- **GPU:** `--use-angle=metal` (60 fps on the M-series). `SHOT_GPU=swiftshader` forces the software path for CI.

**`window.__academy`** (also available in the browser console):

| Group | Calls |
|---|---|
| Movement and view | `teleport('hub' \| '<zoneId>' \| {x,y,z} \| [x,y,z])`, `look(yawDeg, pitchDeg)`, `lookAt(x,y,z)`, `lookDelta(dx, dy)` (mouse pixels for the next frame through the real look code, no pointer lock needed), `press('KeyW', 1000)` (virtual key hold) |
| Interaction | `interactNearest(maxDist)`, `interact('label substring')` (nearest enabled match), `interactables()`, `grabNearest()` (aims at the body and keeps holding it without F until `release()` / `throw()`), `release()`, `throw()` |
| State | `state()` (phase, mode, lang, player pos/yaw/zone, focus, holding, objective, status, operating, modal, infoCard, dialogue, stamps, toasts, zoneErrors), `fps()`, `zones()`, `manifests()`, `pass()`, `stamps()`, `events(n)`, `toasts()` |
| Test hooks | `solve(zoneId, name)`, `debugActions()` |
| Settings | `setMode`, `setLang`, `setQuality` |
| UI | `openPass()`, `toggleMap()`, `closeModals()`, `closeTopModal()`, `exitOperate()`, `advanceDialogue()`, `ask()` |
| Performance | `fps()`, `renderInfo()` (calls, triangles, geometries, textures, programs, cpuMs) |
| Audio (§5.12) | `audioUnlock()`, `audioArm(...targets)`, `audioMeter(ms, target)` → `{ peakDb, rmsDb, hfDb, clipped, ms, armed, state }`, `audioMeasure(ms, target, fn)`, `audioSolo(bus \| null)`, `audioPlay(name)` |
| Flow | `start()`, `pause()`, `resume()`, `waitFrames(n)`, `debug(on)` |
| Internals | `game` (read-only debugging only) |

**Acceptance routine per zone:**
1. `typecheck:zone` passes.
2. `shot.mjs ... --only=<id>` exits 0 (zero console errors).
3. Read the screenshot from spawn and from 2–3 views.
4. Each `solve-*` hook awards its stamp (check `--dump "__academy.pass()"`).
5. `?debug=1` shows the zone within budget.
6. Run the checks in both modes and both languages (`&mode=entscheider&lang=en`).

---

## 14. Engine map (for orientation, not for editing)

```
index.html                      loading shell + pre-boot gate (window.__emaiGate), font preloads added only when the gate passes
src/main.ts                     waits for the gate, imports Game + hud.css dynamically; bilingual fallback if the Game chunk fails
src/core/Game.ts                orchestrator: boot, loop, phases, frozen panels, render-on-change, D13 return plan, deferred zone inits,
                                context loss/restore, pointer-lock policy, teleport/respawn
src/core/RenderSystem.ts        renderer, composer (bloom → grade → vignette), quality presets, MSAA by pixel ratio, adaptive auto,
                                warmUp(), shadow map on demand (markShadowsDirty)
src/core/freeze.ts              freezeStatic(), yieldToMain() (ctx.freezeStatic / ctx.yield)
src/core/retry.ts               importRetry(): one retry of a failed dynamic import after 1.5 s
src/core/glyphCheck.ts          dev only: warns when a 3D label needs a glyph nobody hosts
src/core/zones/mergeStatic.ts   ctx.mergeStatic (+ the dev watcher for merged / frozen objects)
src/core/Environment.ts         sky (atmos, cirrus, stars), sun (shadow follows player + view, texel-snapped), hemi, PMREM env, aerial-perspective fog patch, relief cloud sea, interiors, tilt
src/core/Physics.ts             Rapier world, fixed step, interpolation, collider registry, triggers, kill plane
src/core/zones/*                public API (types.ts, index.ts), ZoneManager (discovery/isolation), createZoneContext
src/core/emi/*                  EMI Rover model + behaviour
src/core/Operate.ts             Bedienmodus
src/core/brand/*                palette, materials, procedural textures, Recamán mark
src/core/{Input,Assets,Text3D,Scheduler,Settings,storage,params,DebugApi}.ts
src/systems/*                   Player (KCC), Interaction, Highlight, Grab, Audio, Progress, LightPool,
                                GameLayer (ctx.game: challenges, banner model, keys, skills), Juice (particles), Capsules
src/ui/*                        HUD, modals/info cards, kit (chips/Kennlinie/predict), pass, pause, start, loading, map, labels, compass,
                                ResultUi (banner, fail flash, countdown, goal chips)
src/i18n/*                      I18n + core strings
src/world/*                     island module + layout; tower/ (Akademie-Turm v2, sculpture, arm), landscape/ (deck features),
                                statics.ts (static merger), detail.ts (tiny-text cull), finale/ (own chunk, finale/lazy.ts stand-in)
src/zones/*                     zones (zone teams); _example = reference
public/fonts/unicode-resolver/  self-hosted troika fallback-glyph data (Greek; MIT + OFL, README there)
src/ui/fonts/full/              the full font originals; src/ui/fonts/*.woff(2) are the shipped subsets
tools/shot.mjs, shots-all.mjs, playtest.mjs, perf.mjs, audio-levels.mjs, load-size.mjs, onboarding-run.mjs, ending-check.mjs, text-audit.mjs, gallery.mjs, brand-check.mjs, typecheck-zone.mjs, lib/shotlib.mjs, lib/session.mjs, lib/png.mjs
tools (Phase 6) load-matrix, warmup, perf-cpu, drawcalls, progdiag, auto-quality, gpu-ab, hitches, idle-render, dialogue-modal, a11y-keyboard,
                contrast, third-party, robust-check, glyph-check, deploy-check, subset-fonts; lib/measure.mjs, lib/drawcalls.mjs, lib/fontcmap.mjs, lib/glyphs.mjs
```

---

## 15. Integration pass (all zones in)

What the integration pass changed, so zone code written before it still reads right:

| Area | Change |
|---|---|
| Pass API | `ctx.pass.snapshot()`, `questions()`, `hasQuestion()`; the finale and the Prüffeld no longer read localStorage |
| HUD objectives | Per-owner objectives with zone focus (§5.4): the island's route no longer overwrites a zone's objective on stamp events; one orange compass marker |
| Dialogue, cards, sound | Zone lines, info cards and non-positional one-shots are skipped while the player is away; queued lines are dropped when the player leaves (§5.4, §5.12) |
| Stamps | Grey, localised "Station übersprungen" toast; skipped → earned counts as a new stamp |
| Operate mode | Wheel events, live top-bar language, island roll in operate/cinematic views |
| Cinematic HUD | Compass, objective and crosshair fade during scripted cameras (ascent, lift rides, cutscenes) |
| Compass | Marker labels never overlap (objective first, then the most centred) |
| Debug | `solve()` returns the hook value; `closeTopModal()`, `renderInfo()`; the debug overlay shows main-thread CPU ms |
| Spawn | `spawn.pitchDeg` (the Lern-Dojo looks up at its demo cloud) |
| CSS | Disabled `.btn` / `.seg button` style; `.keep-case` for Greek symbols in uppercase labels |
| Island | Route end → KIEL lift objective; onboarding ends on zone entry or first stamp; the hub map board moved out of the arrival frame (Landedeck, left) |
| D2 cleanup | `public/models` (Unitree G1/H1) and `ctx.assets.robot()` removed; `_example` uses a procedural AMR |

**World polish pass** (after integration):

| Area | Change |
|---|---|
| Audio | Buses (ambience, zones, ui, foley, cues, voice) → limiter (≈ −1.2 dBFS) → soft clip → volume; EMI chirps duck the beds; square/saw tones low-passed; levels calibrated to the §5.12 targets; `__academy.audioMeter()` and friends; `tools/audio-levels.mjs` |
| Build | No production sourcemaps; Rapier's WebAssembly as a hashed `.wasm` file (was 4.3 MB of inlined base64); fonts in `src/ui/fonts` as hashed WOFF/WOFF2; `tools/load-size.mjs` |
| Title + first minute | Title screen with the premise, time estimates per mode and "Weiterspielen" for returning visitors; ascent captions; skip hint in the corner, click to skip; `ctx.hud.caption()` |
| Input | ← → turn (↑ ↓ walk); aim assist for interactables (§5.3) |
| Island | KIEL sign follows one open state; the evening persists after the ending; day/dusk switch on the Ausguck; beacons stay teal; trim rotors named T1–T4 with plaques; cloud-sea anti-aliasing |
| Tests | `tools/onboarding-run.mjs` (real input, time to first zone), `tools/ending-check.mjs` |

**Release QA pass** (after the zone and world polish):

| Area | Change |
|---|---|
| Player | Ground-seam retry in the character controller (no more one-step stops on the deck trimesh); deck trimesh with `fixInternalEdges` |
| EMI | `emi.say(lines, { interrupt: true })`; zone reactions use it and keep their chirp (the Prüffeld's hand-made chirp is gone) |
| Interaction | Candidate pre-filter by bounding-sphere centre (merged meshes with translated geometry are focusable) |
| HUD | Operate subtitles follow the panel dock side; engine toast for question cards; info card `illustrativeNote`; compact info-card rhythm below 800 px viewport height (every card fits 1280×720) |
| Tests | `__academy.lookDelta()`, `SHOT_CHANNEL=chromium`, `tools/text-audit.mjs`, `tools/gallery.mjs` |
| Copy | Glossary (`docs/GLOSSARY.md`): one term per concept (Fragenkarten, Findings card, Spielzeugmodell, test rig, datasheet); „…“ / “…” quotes, spaced en dashes, ’ apostrophes |

**Phase 4: fun + futuristic pass** (after the release candidate; design in `docs/ART-V2.md` and `docs/FUN-PLAN.md`, as-built record in GDD §7):

| Area | Change |
|---|---|
| Game layer | `ctx.game` (§5.17): challenges with 1–3 ★, bests and retry, merged result banner, juice, Sensorkapseln, EMI skills; `src/systems/GameLayer.ts`, `Juice.ts`, `Capsules.ts`, `src/ui/ResultUi.ts`, `src/i18n/game.ts`; Progress `challenges` and `collectibles` |
| Materials and light | v2 material language in `MaterialLibrary` (§5.13), light tiers with a day/dusk switch, `brandExact` colours solved per exposure and grade; tent-filtered shadow map (`RenderSystem`), bloom 0.7 by day / 1.0 at dusk |
| Island | `src/world/tower/` (Akademie-Turm v2, Recamán relief (planar since Phase 5), drawing arm, logo progress, Messpunkt), `src/world/landscape/` (deck features, capsules, position lights, Turmsprung, Allee number line), ceramic underside, multicopter sky, `radio.ts` (EMI-01 radio), `finale/year.ts` („Ein Jahr später“) |
| Zones | Each zone has a `look.ts` (v2 recipes, light tiers), one challenge per station, a capsule, `stars3-a/b/c` hooks; no card opens by itself |
| UI | FOV 60°, compass v2, label occlusion, machined corners, telemetry strip, EMI far LOD, LOD hysteresis, Esc resumes, grab rows only when grabbable |
| Tools | `brand-check.mjs` (+ `lib/png.mjs`); playtest asserts stars, banner merge and 0 automatic cards; perf adds the Kanzeln and a juice view; onboarding-run includes the Libelle beat; audio-levels includes the nine cues and the tower's drawing sound; text-audit measures the game-layer text budgets |
| Dev server | the deep `three/examples` imports are pre-bundled (`optimizeDeps.include`), so a fresh cache no longer reloads the first page |

**Measured after Phase 4** (production build, Apple M5 Pro, ANGLE Metal, 1280×720): 60 fps at all 71 survey views on high and on low; worst draw calls 338 (spawn; low 316), worst triangles 0.75 M (Kanzel 300), worst main-thread CPU 3.3 ms. Tower sculpture + arm + effects 8 draw calls / 33.5k triangles. First load 1.93 MB with brotli (5.9 MB raw), start screen after 2.9 s at 16 Mbit/s / 40 ms RTT.

**Measured with everything loaded** (production build, Apple M5 Pro, ANGLE Metal, 1280×720, quality high, after the world polish pass): 60 fps at every survey view; worst draw calls 390 (Prüffeld), worst triangles 0.56 M (arrival spawn; budget 500 / 1.5 M), worst main-thread CPU 2.3 ms per frame; Kielraum 170–235 calls. First load transfers 1.86 MB with brotli (budget 8 MB; was 2.43 MB with brotli, 3.4 MB as counted before): Rapier WebAssembly 0.83 MB, code 0.57 MB, fonts 0.45 MB; the start screen is ready after 1.8 s locally and 2.7 s at 16 Mbit/s / 40 ms RTT (`tools/load-size.mjs`).

---

## 16. Phase 6: performance and usability (rc4)

What the Phase 6 fix round (`docs/PHASE6-PLAN.md`, items C1–C13, W1–W8, Z1–Z3, B1–B5) added or changed, as contracts. Measured results are in `docs/RELEASE.md` §1.

**Zone API.**

| Call | Contract |
|---|---|
| `ctx.freezeStatic(obj)` | Sets `matrixAutoUpdate = false` on `obj` and every descendant and bakes their matrices once (also exported from `src/core/freeze.ts`). Call it after the subtree is built and placed. Anything moved later needs its own `updateMatrix()`; never call it on parts that animate, sway or follow physics |
| `await ctx.yield()` | Hands the main thread back for one task (`scheduler.yield()`, else a MessageChannel macrotask) and nudges the loading bar's sub-step (`yieldToMain()` in `freeze.ts`). Use it between long build steps in `init` |
| `ctx.mergeStatic(obj, { keep, pack, shadows: 'exact' \| 'union', attributes, freeze, maxInstanceVertices, name })` | Merges the static meshes under `obj` into one draw per material, packs plain Standard / Physical (clearcoat + a shared normal map) / Basic materials into shared materials whose values sit in the vertices, detaches the originals (they keep a correct world matrix) and freezes what is left. Returns `{ before, after, merged, meshes, originals, ms }`. Left out automatically: interactables, physics bodies, `userData.noMerge`, hidden subtrees, troika text, ShaderMaterials and instance-level `onBeforeCompile`, DynamicDraw instances, meshes with children, partial draw ranges, custom attributes (unless listed in `attributes`). Packed materials follow later changes of their source's colour, emissive, roughness, metalness and clearcoat; visibility, opacity and side are not followed, and the dev watcher warns about those and about moved or re-materialed originals. `shadows: 'exact'` is the default; use `'union'` only after a visual check. Implementation: `src/core/zones/mergeStatic.ts` |
| `ctx.hud.dialogueBusy`, event `dialogue:idle` | §5.4 |
| `addInteractable({ keyless })` | §5.3 |

**Boot (C8, C12d, C13).** `index.html` paints the shell at once (inline style, brand mark, „Insel wird geladen“, a CSS-only bar that moves by transform and stands still under reduced motion) and runs the gate: WebGL2, class static blocks (Safari 16.4+), import maps (Firefox 108+) and touch-only. On failure it explains in both languages before anything else downloads (touch laptops get „Trotzdem laden · Load anyway“); the language rule is D12's. The font preloads are inert (`media="not all" data-gate`) until the gate passes. `main.ts` then imports `Game` and `hud.css`. `LoadingScreen` adopts the shell node (`set / tick / notice / offer / error / done`); its look lives in index.html's inline style (`html #loading …`). A failed start shows a friendly bilingual message with „Erneut versuchen“ and folded technical details; Rapier, the island chunk and zone chunks are retried once after 1.5 s (`importRetry`), and a zone error toast names the zone by its title.

**Zone inits after the title (C13).** Only eager zones (a `?zone=` / `?pos=` target, a dev reload, the D13 resume zone) are built before the title; the others init one per idle slot, nearest the spawn first, each followed by a background shader compile. `__academy.ready` and `game:ready` mean "title (or play) up **and** every zone settled", so tools that wait for `ready` see a complete island.

**Shader warm-up (C2).** `RenderSystem.warmUp()` compiles against the composer's linear input buffer with the env map, lights and first-frame camera ready (hidden tiers included), then renders one full frame behind the loading screen. Nothing is simulated or drawn while loading. A quality change re-compiles and keeps the last frame on screen meanwhile. `world:late-build` (e.g. the lazy finale) triggers a background compile; `Environment.cloudVariants()` lets the cloud sea's other relief variants compile in the background, so an auto step-down does not stall.

**Loop (C4, C9).**
- `Game.frozen` is true while the top modal is the Pass, the map, an info card or a prediction (`FROZEN_KINDS`). Then there is no simulation step, and the HUD, the game layer and the dialogue get dt 0: EMI's line is held, run clocks stop, toasts wait. Operate mode and custom modals (`openModal`: the giant, F2/F3, the certificate) keep running.
- Paused or frozen, the loop draws two frames after a change and then skips the render and the per-frame world and HUD work. Call `game.requestRender(n)` after changing something visible while idle (teleport, debug look; settings, language, quality, resize and modal changes already do it). The title renders at 30 fps; the attract camera holds still under reduced motion.

**Render cost (C11, W1, Z1).**
- Shadows: `shadowMap.autoUpdate` is off. `RenderSystem.markShadowsDirty()` redraws the map; the snapped sun frustum, the sun direction and `Physics` (a moved body) mark it; otherwise it updates every second frame.
- `MaterialLibrary.forInstancing(mat)` gives instanced users of a shared material their own cached twin (three would otherwise switch programs between plain and instanced users every frame); `instancingPass()` runs after the island and after each zone init, `syncInstancing()` copies colour, opacity and maps from source to twin each frame (dusk, brand colours).
- The island merges its static parts (`world/statics.ts`, §6) and culls hidden spaces: the underside only when a view ray can pass the deck edge (sampled 35 % wider than the frustum), the Kielraum interior from above the deck except over the oculus and the lift shaft, the foyer unless the camera is inside the drum or a door is open, the lift car behind the closed drum, and label texts under 0.3 device pixels. These culls use the previous frame's camera. The zones merge their exteriors with `ctx.mergeStatic`; a zone's detail tier starts hidden and appears at the inner LOD edge (≤ 42.5 m).
- The compass moves markers by transform (keep the `translateX(-50%)` centring if the `.mk` CSS changes), writes opacity only on change and updates label text at 10 Hz.

**Quality (C10).** §9.

**Robustness (C12).** On WebGL context loss the game pauses behind the loading overlay („Grafik wird neu gestartet …“), the loop stops, and „Neu laden“ appears after 5 s without a restore; on restore the env map and shadow map are rebuilt and `warmUp()` runs. A run chip whose zone is away is cleared (the run ends). Reset clears every game key in local and session storage except the settings (`storage.clearGameStorage()`), then reloads. `storageWorks()` probes localStorage once; the title and a toast say so when nothing can be saved.

**Input and menus (C3, C5).** `Input.uiGate` decides who owns Tab and the arrows: the game only while playing on the 3D view with no blocking modal; everywhere else the browser (menus, links, fields). The mouse capture sends one pointer-lock request per gesture (`unadjustedMovement` only on Chromium); the capture hint („Klick ins Bild, um dich mit der Maus umzusehen“) shows for 3 s after any mouse move over `canvas#game` while unlocked. Dialogs have `role=dialog` and `aria-modal`, focus their first control, manage Tab inside (so Safari's default Tab works) and return focus where it was. Title: Start has focus, Enter starts, Tab cycles Start → Deutsch → English → mode cards. Pass: Esc or E closes it; Tab closes it only when focus is on none of its controls. Focus ring: 2 px Text outline.

**Players' settings (D12, D14).** `Settings.firstVisitLang()`; settings schema v3 (`volAtmo`, `volEffects`, `volEmi`, `textScale`), applied by `GameLayer` at boot and on `settings:changed` (`audio.setGroupVolume('atmo' | 'effects' | 'emi', v)`, `hud.setTextScale`). Pause tab „Ton & Text“.

**Other player-facing additions.** Funk-Log tab in the Pass (the last 20 lines; Enter with no line on screen repeats EMI's last line, except in operate mode, a scripted camera or with a banner open); a sonar ping near an unfound Sensorkapsel (within 14 m while moving, at most 12 per approach); compass names of other zones hidden while a zone's own objective shows; the KIEL lift on the map once it is open; „Zur Akademie (Plaza)“ in the pause menu teleports to (0, 0, 26) facing the tower; R means retry or reset in every zone (Space or the station's own button for the rest; a run with progress asks „Nochmal R zum Neustart“).

**Build (B1, B2, B4).** `npm run build` writes `.br` and `.gz` next to every text asset (`PRECOMPRESS=0` skips it); `npm run preview` serves them with production cache headers. three.js, postprocessing and troika are one chunk (`vendor-three-<hash>.js`), and chunks import each other through Vite's chunk import map (`build.chunkImportMap`), so a zone-only deploy changes only that zone's chunk and `index.html`. Fonts are subsets (§7).

## 17. Phase 7: as built (rc5)

The contracts Phase 7 added (`docs/PHASE7-PLAN.md` §5; owners in §5.1). Measured results are in `docs/RELEASE.md` §1.

**Seams: the manifest split.** Every area is two halves. `src/zones/<id>/manifest.ts` is small and eager: `defineManifest({ id, kind, frame, title, stations, … })`, where each station carries its `star` goals, a `rev` (bumped when its goals change), `mastery` and its route role per mode (`main` · `side` · `skip`). `src/zones/<id>/index.ts` is the lazy code: `defineZone({ ...manifest, init(ctx) { … } })`. `ZoneManager.ts` imports every manifest before the title (one eager glob) and the code later through a priority queue: the resume or deep-link area before the title, island areas nearest first after it, ground areas once they are reachable. Rotor states, the star pool and the save migration therefore work before any zone code has loaded. A manifest is data and imports nothing from its zone (that would pull the code into the first load). A manifest-only area reserves its plot and counts for the pool. Registration and boot hooks live in `src/core/zones/{manifest,ext}.ts` and `src/core/Game.ts`.

**Plots and kinds.** `kind` is `lobe` (the six island zones, rc4's scope), `hall` (an island hall: the Schauhalle) or `site` (a ground area: Sonnenacker, Traumhangar, Kreislaufhof, Unkrautacker). New plot fields (`src/world/layout.ts`, `types.frames.ts`): `frame`, `shape` (`circle` or `rect`), `tiers` (`detail`, `exterior`, measured from the shape's edge) and `interior` (while the player is inside, other areas cap at their exterior tier). `ctx.zones.list()` still returns only the six lobes, so the rc4 code that builds masts, railings and pads from it is unchanged.

**Frames: the world moves, the island doesn't** (plan §5.3).
- The island never moves: no island mesh, collider, island-frame zone root or merged static changes its transform.
- `ctx.island.setAltitude(h)` is the only writer of the altitude. It moves the ground root (y = −h) and the ground-frame area roots (detached while suspended), the slab and `cloudY`; it sets `sunBlocked()`, the fog mode (through `ctx.env.setFlight`), the ground colliders, the dynamics freeze and the suspension; it marks the shadows dirty. `ctx.flight` is read-only (`state`, `altitude`, `docked`, `onChange`).
- Ground colliders are on only at h ≤ 0.05 m with the ground root untilted; otherwise ground-frame dynamic bodies are frozen (kinematic, pose kept) and ride along. Ground areas are suspended above 1 m and come back only at 0. `ctx.frames.adopt(...)` puts a package's statics, bodies or colliders into the ground frame. Rescue volumes cover the dock floor, the keel block and the lake.
- While docked, gusts never tilt anything (the holding arms catch them, `ground.catchGust`); only the Probestart and F1 tilt, by rotating the environment group and the ground root together, with the player aboard.

**`ctx.robots`** (`src/core/zones/types.robots.ts`, runtime `src/core/robots/{RobotLibrary,RobotModel,ik}.ts`). The real models come from the generated `src/robots/manifest.ts`, `credits.ts` and `glb/` (built by `tools/robots/build.mjs` from pinned sources, checked by `tools/robots/check.mjs`; caps in D31).
- `load(id, { priority })` gives a posable `RobotModel`; `loadSilhouette(id)` a far mesh; `bodies(id, lod)` the rigid bodies of an articulated level for crowds (one instanced mesh per body, no BatchedMesh: the duck field, the farm arms).
- `prefetch(ids, { priority: 'route' | 'idle' })`, `info(id)` (the manifest entry), `state(id)` and `progress(id)` drive the loading plan; `animate(model, clip)` plays a kinematic clip; `untrack(model)` releases it. `lineup()` and `lineupInfo()` serve the Schauhalle's merged line-up.
- `paint` and `ghost` are the shared materials (the ghost is the teal dream form).
- After its retries a failed GLB emits `'robots:failed'` `{ id, area, error }`; WP1's loading card offers „Erneut laden“, which emits `'robots:retry'`.

**The lift-off gate (D23).** `src/core/quest/` derives the three systems from stamps and manifests and stores only what an event cannot recompute (plan §3.1). `systemDefs(manifests)` reads each area's `system` and ◆ flag, so a station that replaces a ◆ needs no change in the table: AUFTRIEB = M1–M6, one per lobe's ◆; ENERGIE = `AKKU`, the Sonnenacker ◆ „Erntetag“; NAVIGATION = `NAV`, the Traumhangar ◆ „Traumdaten“; T1–T4 are cosmetic trim rotors. `SYSTEM_GROUPS` marks AKKU and NAV `crewIn: ['entscheider']`: there the Bodencrew supplies them. `deriveQuest()` builds the snapshot that the cover, the HUD line „STARTKLAR“, the lamps and the Startpult read. Entdecker lifts off with the 6 lobe ◆, both ground ◆ and a signed F3; Entscheider with the 6 lobe ◆, F3 and the Schaufenster stop (D41).

**Saves (D38).** Save format v2 under a new storage key (`src/systems/{Progress,migrate,retired}.ts`). An rc4 save migrates to the ground state and stays untouched as a backup; a failed migration runs in memory without writing. A station whose `rev` changed resets its stored record, and retired stations (e.g. Greifwerkstatt C „200 Griffe“) are archived through `retired.ts`.

**Duck physics (D30).** MuJoCo WebAssembly runs in a worker owned by the duck station (`src/zones/regelgarten/duck/**`, Vite `?worker`); the fallback is recorded generations (SIM · AUFZEICHNUNG). The SO-101 stays on Rapier; the Unitree robots are kinematic.

**Licences in the build.** `tools/notices-plugin.mjs` writes `dist/THIRD-PARTY-NOTICES.txt` from the modules the bundle really contains (the build fails on a package without a nameable licence) and copies `LICENSES/` to `dist/licenses/`; `vite.config.ts` adds MuJoCo from the worker. The checklist for the founder and a lawyer is `docs/LEGAL-REVIEW.md`.

---

## 18. „Entdecken“ (Discover): the phone mode

On a phone you can look at the world and learn about it: a guided tour of 12 stops with info cards, the Schauhalle's robots in a 3D size viewer, the lift-off as a film, and a link to share. Playing (walking, stations, stars) stays on the desktop. Plan: `docs/DISCOVER-PLAN.md`. Decisions: D45. Measured results and the real-phone protocol: `docs/RELEASE.md` §7.

**Who gets it.** `?discover=1` on any device (also the desktop, for testing). `src/discover/flags.ts` holds `DISCOVER_DEFAULT_ON_TOUCH` (now `false`). Flipping it to `true` is the one-line change that sends touch-only phones to Discover instead of the „needs mouse and keyboard“ notice: the Vite plugin „discover flag (WP-D0)“ in `vite.config.ts` writes the value into the `/*DISCOVER_DEFAULT_ON_TOUCH*/` marker of the inline gate in `index.html`, and `robust-check --only phone` keeps checking the notice while the flag is `false`.

**Two paths, chosen in the gate** (`index.html`, before any download):
- **3D** (iPhone 12 / iOS 16.4+ and Pixel-6-class Android): the game engine boots with Discover's hooks.
- **Stills tour** (weaker phones): the same 12 stops and cards with pre-rendered pictures (`public/discover/stills/<stop>-720.webp` and `-1280.webp`). `main.ts` imports `src/discover/stills/boot.ts` *instead of* `Game`: no three, no Rapier, no world chunk, no GLB. The gate picks it for `?stills=1`, the crash marker of the last 3D session, no WebGL2 or too few of its limits (`MAX_TEXTURE_SIZE` < 4096 or < 16 texture units), or `navigator.deviceMemory` ≤ 3. In 3D, a frame probe over the first 3 s after the start card offers the stills tour at p90 > 50 ms and switches to it at p90 > 80 ms (`src/discover/detect.ts`). The choice lives in sessionStorage for the session only (`…:discover-mode`); `?stills=0` forces 3D and turns the probe into a report.
- **Nothing is ever written to localStorage.** The 3D path runs on an in-memory save (`Progress({ memory: true })` + `adoptMemory(discoverSave(...))`: Entscheider mode, every station stamped, docked), language and settings stay in memory, and the render tier never saves `quality-auto`. The crash marker `…:discover-alive` is sessionStorage, cleared on `pagehide`.

**Engine seams** (owner WP-D0; every one is inert without `?discover=1`, checked on the desktop by `tools/discover/gate.mjs`, the merge tier, `load-size`, `warmup --table`, `robust-check` and `a11y-keyboard`):
- `Game`: phase `'discover'` (no pointer lock, no actions, no fall rescue); `cameraDriver(dt)` (null while the film lets the player camera and the lift-off director draw); `frameHook(dt)` after each drawn frame (chained, never replaced: perf, then the tour's markers); `frameCapMs`; `renderOptions`; the `DiscoverBoot` hooks `beforeCore` / `afterCore` / `place` / `start`; `setLang(l, persist)`. `src/discover/index.ts` downloads next to Rapier and the world, so it is never on the critical path.
- `Progress`: `{ memory: true }` and `adoptMemory(data)`.
- `RenderSystem`: `setTier(t)` (pins a preset, keeps only the render-scale part of auto at the fps cap, never saves) and the `frameBufferType` option (8-bit composer buffers when half-float targets are missing).
- `ZoneManager`: `tierScale` (multiplies the plot tiers), `setReachable(pred, { lock })` (the quest's re-wiring cannot widen Discover's set: the six lobes, the Schauhalle, the Sonnenacker and the Traumhangar), and `distanceFloor` (the Regelgarten reads at least 56 m, past its duck station's 55 m MuJoCo prewarm radius, so Discover never downloads MuJoCo).
- Finale (owner WP-D3): `'liftoff:replay'` takes `{ from: 'title' | 'discover', stills? }`; `'liftoff:skip'` calls `Finale.skip()`; `director.start({ stills })`.

**The observer.** The player has no collider and no gravity; each frame `src/discover/observer.ts` puts its feet 1.7 m below the camera, so levels of detail, robot queues, the shadow box and zone audio follow the camera. Inside a lobe plot the feet are pushed outside it (no lobe `onEnter`); the hall and the hangar are allowed, so their interiors cull correctly. During a stop's pre-roll the feet are pinned at the target.

**Packages plug in without editing a shared file** (`src/discover/types.ts` is the contract): `src/discover/<pkg>/install.ts` (3D) and `src/discover/<pkg>/stills.ts` (stills path) export `default install(h)` and are picked up by `import.meta.glob`. They register a mode (`h.modes.register('tour' | 'viewer' | 'film', { enter, exit })`; entering one mode exits the current one) and their part of the `DiscoverHandle`: `h.stops` and `h.goto` (tour, WP-D1), `h.robots` (viewer, WP-D2), `h.share` (film, WP-D3). Heavy code sits behind a dynamic import inside `enter()`. Stills code must not import three, `Game`, Rapier, the world, `src/ui/*` or `src/i18n/*` (type imports are fine), or a shared chunk splits into the desktop load; `tools/discover/load.mjs` and `gate.mjs` check it.

**The packages.**
- **Tour** (`src/discover/tour/**`): 12 stops (dock, Brückenkopf, Libelle, Zonen West, Zonen Nord, Schauhalle, Zonen Ost, Ausguck, Grubenrand, Sonnenacker, Traumhangar, Abheben), posed from the game's own layout numbers. Each hop: pre-roll (areas, ground fit, observer pinned until robots load ≤ 3 s, every program and the shadow depth programs compiled, behind „lädt …“), a lifted Bézier flight (a 0.4 s cross-fade under reduced motion; interiors are entered and left through their door), then the card at peek, „i / 12“, an aria-live line and up to 6 teal markers. ←/→, the sheet's ‹ › and a sideways swipe change stops; a tap picks a robot or a spot; every card lists „Hier zu sehen“ chips; „Alle Stopps“ is an `<ol>`.
- **Viewer** (`src/discover/viewer/**`, lazy): a studio with a turntable, a 0–2.5 m measuring wall, „Du“ 1.75 m and EMI 1.55 m, and the robot's model height (MODELL chip). The camera draws only layer 9 while it is open (the world stays, so no program relinks). At most `tier.viewerFiles` (2 on phones) parsed models. 17 robots, 21 with `VITE_AMBER=1` (`SHOW_AMBER` from `src/core/release.ts`).
- **Film** (`src/discover/film/**`, lazy): the live engine replay of the lift-off (not a video). The camera detaches, `#hud.discover.film` shows captions, subtitles and the lift-off HUD, EMI-01's voice is on. `tier.film = 'auto'` plays the director's stills version under reduced motion or when `perf.window(3000).p90 > 50 ms`. The end card offers „Am Laptop spielen“, „Nochmal ansehen“ and „Zurück zur Tour“ (docks the island again). `share.ts` is Game-free and shares the game's URL (`import.meta.env.BASE_URL`, never `?discover`): `navigator.share`, else the clipboard and „Link kopiert“, else a read-only field.

**Content without new claims.** Card text is copied by generators, never retyped: `tools/discover/content.mjs` writes `src/discover/data/content.gen.ts` from the sources in `src/discover/tour/content.spec.ts`; `tools/discover/robots-data.mjs` writes `src/discover/data/robots.gen.ts` from `HALL_ROBOTS` and `sheet()`. Each has `--check` (merge tier). Every number carries a chip; card bodies ≤ 35 words. Only UI chrome is new text (`src/discover/strings.ts` and each package's `strings.ts`, DE and EN).

**Render tier** (`src/discover/tier.ts`; nothing saved):

| Knob | `phone` (default) | `full` (`?tier=full`) |
|---|---|---|
| Preset | `low` pinned (composer + grade, no bloom, no MSAA) | the preset auto would start with, pinned |
| Pixel-ratio cap / render-scale floor | 1.25 / 0.7 | 1.5 / 0.6 |
| Frame cap | 30 fps | display |
| Shadows | 1024², ±35 m | 2048², ±45 m |
| Level-of-detail distances (`tierScale`) | × 0.8 | × 1 |
| Viewer parsed models | 2 | 4 |
| Film | `auto` (stills when slow or reduced motion) | full |

**Budgets** (Discover's own; the desktop caps are unchanged; measured by `node tools/discover-check.mjs` on a `BASE_PATH=/academy-world/` production build, Pixel 7 profile = Chromium 4× CPU, 9 Mbit/s, 85 ms; iPhone 15 profile = WebKit):

| Budget | Cap |
|---|---|
| First load to the start card (brotli) | ≤ 1.85 MB |
| Discover chunks | core + tour + content ≤ 60 KB; viewer ≤ 30 KB; film ≤ 10 KB |
| Stills path before the first picture | ≤ 400 KB; no Rapier, world chunk or GLB |
| Stills pictures | ≤ 120 KB each |
| Start card / first stop after „Los“ (Pixel profile) | ≤ 6 s / ≤ 12 s |
| Shader programs | ≤ 150 at the start card; 0 links during flights and on opening a viewer robot |
| Draws / triangles per stop | ≤ 220 / ≤ 0.9 M; viewer ≤ 60 draws |
| Memory after the tour + 5 viewer robots + the film (desktop, after GC) | JS heap ≤ 90 MB; estimated GPU ≤ 300 MB; second lap ≤ + 5 % |
| Requests | 0 to other origins; 0 MuJoCo bytes; localStorage byte-identical |
| Real phone (founder) | p90 frame ≤ 40 ms at every stop; start card ≤ 10 s on mobile data; no reload across bench + viewer + film |

**URL knobs** (all need `?discover=1`, except `?stills=1`): `?stills=1|0` (force the stills tour / 3D), `?perf=1` (readout and „Messen“ in the menu), `?bench=1` („Messen“ on the start card: the tour at 5 s per stop, 3 viewer robots, the stills film, then a table with „Kopieren“), `?tier=phone|full`, `?dpr=`, `?fps=30|60`, `?shadows=0|1`, `?stop=<id>`, `?lang=de|en`.

**Tests.** `node tools/discover-check.mjs [--only …] [--devices pixel7,iphone15] [--amber] [--quick]` runs the scenarios in `tools/discover/` (gate, boot, storage, load, perf, memory, i18n, tour, viewer, film, share, stills-tour) and writes screenshots to `artifacts/discover/<device>/`. Hooks: `window.__discover` (`state()`, `goto(id)`, `stops()`, `perf()`, `bench()`), `window.__discoverTour()`, `window.__discoverViewer`, and the debug exts `discover:state|goto|stops|perf|bench|probe`. Gates: the merge tier runs `discover-quick` and both `--check` generators; the wave tier runs `discover-full` and `discover-full-amber`.
