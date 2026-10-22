/**
 * Island module — OWNED BY THE ISLAND TEAM (everything in src/world/; Phase 7: WP12, the island owner).
 * "Schwebewerk · Insel 17" (GDD §4, §6, §9): the six-lobed mechanical island, the hub
 * (Akademie-Turm, Recamán medallion, plaza, Libelle, Sprungplatten, gate masts), the
 * underside machinery (thruster pods, keel truss, Regelkern), sky, cloud sea, onboarding.
 * Phase 7 (plan §1.2, §3, D23): the island waits in Trockendock 3; the grounded start flow lives in
 * src/world/start/ (the three systems, the Probestart, the beats, island.rotors).
 *
 * Loaded by the engine like a zone anchored at the world origin (facing 0), so the
 * full ZoneContext API is available (see docs/ARCHITECTURE.md §6).
 */
import * as THREE from 'three';
import { defineZone, type ZoneContext } from '@/core/zones';
import type { SystemId } from '@/core/zones/manifest';
import { DEG, HUB, KANZEL_PADS, REVIER, bearingOf, dockWallRadius, outlineRadius, type Vec3Tuple } from './layout';
import { buildDeck, type DeckHandles } from './deck';
import { buildRailings } from './railing';
import { createTextures } from './textures';
import { buildUnderside, type Underside } from './underside';
import { buildTower, type Tower } from './hub';
import { buildLibelle, PANEL_MOUNT, type Libelle } from './libelle';
import { buildTransit, type Transit } from './transit';
import { buildMasts, type Masts } from './masts';
import { buildPlaceholders, type Placeholders } from './placeholders';
import { buildTerrain } from './terrain';
import { buildSky, type Sky } from './sky';
import { buildFoyer } from './foyer';
import { buildLanding, type Landing } from './landing';
import { buildOnboarding } from './onboarding';
import { buildRadio } from './radio';
import { registerQuestions } from './questions';
import { buildLift } from './lift';
import { lazyFinale, type LazyFinale } from './finale/lazy';
import { buildIntro, type Intro } from './intro';
import { buildDusk } from './dusk';
import { enrichSurfaces } from './surface';
import type { GroundHandle } from './ground';
import { buildStartDisplay, isReady, type StartDisplay } from './start/state';
import { buildSystemPanel } from './start/panel';
import { buildRotors, type IslandRotors } from './start/rotors';
import { buildGusts, type Gusts } from './start/gusts';
import { buildProbestart, type Probestart } from './start/probestart';
import { buildBeats, type Beats } from './start/beats';
import { buildBridgePlaque } from './start/plaques';
import { registerStartDebug } from './start/debug';
import { createRotorRates, island } from './start/contract';
// ── Phase 7 packages: imports (one line each; plan §6.2) ──
import { buildGround } from './ground';
import { buildRegion } from './region/load';
import { buildLife } from './life/boot';

interface IslandState {
  deck: DeckHandles;
  under: Underside;
  tower: Tower;
  libelle: Libelle;
  transit: Transit;
  masts: Masts;
  placeholders: Placeholders;
  sky: Sky;
  landing: Landing;
  intro: Intro;
  ground: GroundHandle;
  display: StartDisplay;
  rotors: IslandRotors;
  gusts: Gusts;
  beats: Beats;
  wind: number;
}

let S: IslandState | null = null;
let FIN: LazyFinale | null = null;
const _tiltQ = new THREE.Quaternion();
const _tiltE = new THREE.Euler();

export default defineZone({
  id: 'world',
  title: { de: 'Schwebewerk · Insel 17', en: 'The Floating Works · Island 17' },
  async init(ctx) {
    // Golden hour above the clouds: the engine defaults (src/core/Environment.ts DEFAULT_ENV)
    // are the art-directed day look; the finale's dusk blends away from it (see dusk.ts).
    // W6 (PL-09): the builders hand the main thread back in between (`ctx.yield()`: the browser
    // paints the loading bar and handles input), so the island is no single 2 s task at 4× CPU.
    const step = (): Promise<void> => (typeof ctx.yield === 'function' ? ctx.yield() : Promise.resolve());
    registerQuestions(ctx);
    const manifests = ctx.zones.list();
    const tex = createTextures(ctx);
    await step();
    // W6: the deck and the landscape hand the main thread back between their sections too
    const deck = await buildDeck(ctx, tex, step);
    await step();
    buildRailings(ctx, manifests);
    await step();
    await buildTerrain(ctx, step);
    await step();
    // ── Phase 7 packages (one line each; plan §6.2) ─────────────────────────────────────────────────────
    // `P7` carries what the world packages share: the yielding step, the manifests and the handles built so
    // far. Every world package adds exactly one `await build<Pkg>(ctx, P7)` line below; the integrator orders them.
    const P7 = { step, manifests, ground: await buildGround(ctx, step) };
    await buildRegion(ctx, P7);
    await buildLife(ctx, P7);
    // ── end of the Phase 7 packages ──
    const ground = P7.ground;
    const under = buildUnderside(ctx, tex);
    await step();
    const tower = buildTower(ctx);
    await step();
    const foyer = buildFoyer(ctx, tower.foyer, manifests);
    const libelle = buildLibelle(ctx);
    const areas = ctx.zones.list({ kind: 'all' });
    const transit = buildTransit(ctx, {
      siteAt: (b) => siteAt(areas, b),
      // the ground root once the engine has attached it to the scene (WP4); the WPS stub keeps it detached
      groundRoot: () => (ctx.frames.ground?.parent ? ctx.frames.ground : null),
      heightAt: (x, z) => ctx.frames.heightAt(x, z),
    });
    await step();
    const masts = buildMasts(ctx, manifests);
    const placeholders = buildPlaceholders(ctx, manifests);
    await step();
    const sky = buildSky(ctx);
    await step();
    const landing = buildLanding(ctx, manifests);
    buildBridgePlaque(ctx);
    await step();
    // art pass: 'finale:dusk' { t } blends the day look to dusk; path lamps switch on
    // (built before the finale's stand-in, which restores the evening after a reload)
    buildDusk(ctx, { lampHeads: deck.lampHeads, windows: tower.windows, needle: tower.needle });
    const lift = buildLift(ctx, tower.liftCar);
    // W6 (PL-16): the finale is its own chunk, loaded after the title (finale/lazy.ts)
    FIN = lazyFinale(ctx, { lift, masts, sky, ground });
    const intro = buildIntro(ctx);

    // ── the start flow (WP12, plan §1.2, §3.2, §3.3): the three systems, everywhere on the island ──
    const display = buildStartDisplay(ctx);
    const airborne = (): boolean => display.snap.flight.state === 'airborne';
    const rotors = buildRotors(ctx, under, display, () => display.snap.flight.state);
    const gusts = buildGusts(ctx, { under, libelle, ground: () => ground, airborne });
    const panel = buildSystemPanel(ctx, libelle.panelMount, { width: PANEL_MOUNT.width, name: 'start:libelle-panel' });
    const paintSystems = (): void => {
      const p = display.panel();
      panel.set(p, { lamps: display.pulseK('lamps'), bar: display.pulseK('bar'), nav: display.pulseK('nav'), crew: { akku: display.crewShown('AKKU'), nav: display.crewShown('NAV') } });
      tower.setSystems(p.lamps, p.nav, { crown: display.pulseK('crown'), needle: display.pulseK('needle') });
      // §4.1: the Libelle reads BODEN while docked until M2 is bereit, then the live LAGE
      libelle.setMode(airborne() || isReady(display.shown('M2')) ? 'lage' : 'boden');
      ground.setSign(display.liftShown());
    };
    paintSystems();
    display.onChange(paintSystems);
    ctx.onDispose(ctx.materials.onDusk(paintSystems));
    foyer.setSystems(display);

    // EMI-01 on the radio: album, ◆ three stars, capsules, skills, question cards (FUN-PLAN C5/C6)
    const radio = buildRadio(ctx);
    let probestart: Probestart | null = null;
    const onboarding = buildOnboarding(
      ctx,
      {
        set(id) {
          transit.setObjective(id);
          foyer.setObjective(id);
          landing.setObjective(id);
          for (const [zid, mesh] of deck.spokeInlays) mesh.material = zid === id ? deck.inlayOrange : deck.inlayTeal;
        },
        visited(id, v) {
          masts.setState(id, v);
        },
      },
      {
        display,
        makeProbestart: (o) => (probestart = buildProbestart(ctx, { display, rotors, gusts, ground: () => ground, airborne, say: o.say, onFirstDone: o.onFirstDone })),
        dockGust: () => gusts.dockGust(),
        dispatchDrone: (p) => sky.dispatchDrone(p),
        capsuleHint: () => radio.capsuleHint(),
      },
    );
    foyer.onTerminal(() => onboarding.terminalUsed());
    const beats = buildBeats(ctx, {
      display,
      rotors,
      ground: () => ground,
      onRegion: (open) => syncRegion(open),
      onKiel: () => lift.refreshSigns(),
      onObjective: () => onboarding.refresh(),
      probestartBusy: () => probestart?.busy ?? false,
      areaOf: (id) => areaOf(areas, id),
    });
    // the Revier gate and the Kanzel pads (§2.6): open with the first rotor while docked; dark airborne
    const syncRegion = (open: boolean): void => {
      ground.setGate(open);
      transit.setRegion(open, { airborne: airborne() });
      landing.setFlight(airborne() ? 'airborne' : 'ground');
    };
    syncRegion(display.snap.regionOpen);
    ctx.events.on('flight:state', () => syncRegion(display.snap.regionOpen));
    S = { deck, under, tower, libelle, transit, masts, placeholders, sky, landing, intro, ground, display, rotors, gusts, beats, wind: 0.4 };
    // the island's live handles for the other island packages (start/contract.ts `island`)
    island.rotors = rotors;
    island.radio = radio;
    registerStartDebug(ctx, { display, rotors, beats, probestart: () => probestart, panel, libelle, ground: () => ground, padsArmed: () => transit.regionArmed });

    // Start → (first visit) the 6 s glide to the bridge head → arrival beats (§1.2, §3.6; ?skipIntro=1:
    // the Messpunkt, as the tools expect). A returning visitor resumes at the gate Game chose (D26), or at
    // the bridge head without the glide; airborne at the plaza (the bridge head is not reachable then).
    const skipIntro = /[?&]skip[iI]ntro(=1|=true|&|$)/.test(location.search);
    ctx.events.on('game:start', (p?: { skipAscent?: boolean; glide?: boolean }) => {
      const sp = HUB.spawn!.position;
      const atDefault = ctx.player.position.distanceTo(new THREE.Vector3(sp[0], sp[1], sp[2])) < 1.5;
      if (skipIntro || !atDefault) {
        onboarding.begin();
        return;
      }
      if (airborne()) {
        ctx.player.teleport([0, 0, 26], { yawDeg: 0, pitchDeg: 4 });
        onboarding.begin();
        return;
      }
      const to = arrival(ctx);
      // WP1's resume plan says whether this Start glides (§3.6); without it: not seen yet and not skipped
      const firstVisit = p?.glide ?? (!display.snap.glideSeen && !p?.skipAscent);
      if (!firstVisit) {
        ctx.player.teleport(to.position, { yawDeg: to.yawDeg, pitchDeg: to.pitchDeg });
        onboarding.begin();
        return;
      }
      void intro.play(to).then(() => {
        // p7.quest start.glideSeen: the glide plays on the first visit only (WP1's resume rule reads it)
        ctx.quest.markGlideSeen();
        display.refresh();
        onboarding.begin();
      });
    });
    // the bridge to the Revier: until the ground's bridge exists, an invisible guard closes the railing gap
    ctx.after(1, () => guardBridge(ctx));

    // art pass: world-space mottling / roughness / micro-relief on the island's plain materials
    await step();
    // W6: the static merge runs in slices (one merged group per task) when it gets the yield
    if (typeof ctx.yield === 'function') await enrichSurfaces(ctx.root, ctx.onDispose, () => ctx.yield());
    else enrichSurfaces(ctx.root, ctx.onDispose);

    ctx.debug.register('gust', () => ctx.island.emitGust({ strength: 1, bearing: 290 }));
    ctx.debug.register('placeholders', () => {
      const list = S?.placeholders.showing() ?? [];
      console.info('[world] placeholders showing:', list.join(', ') || '—');
      return list;
    });
    // end on a fresh task: the engine's next boot step must not run on the tail of the merge pass
    await step();
  },

  update(dt, ctx) {
    if (!S) return;
    const t = ctx.time.elapsed;
    const cam = ctx.camera.position;
    S.intro.update(dt);
    S.gusts.update(dt);
    FIN?.current?.update(dt, t); // after the gusts: the finale's island tilt wins while it runs
    S.rotors.update(dt);
    S.under.update(dt, t);
    S.tower.update(dt, cam);
    S.libelle.update(dt, ctx.island.tiltDeg);
    S.transit.update(dt, t);
    S.masts.update(dt, t);
    S.placeholders.update(dt, t, cam);
    const tl = ctx.island.tiltDeg;
    _tiltQ.setFromEuler(_tiltE.set(-tl.pitch * DEG, 0, -tl.roll * DEG));
    S.sky.update(dt, t, ctx.camera, _tiltQ);

    // the underside is only visible from the rim, the Glasbalkon, the oculus or from outside
    const r = Math.hypot(cam.x, cam.z);
    const camB = bearingOf(cam.x, cam.z);
    const rim = outlineRadius(camB);
    const onDeck = cam.y > 0.3 && cam.y < 60 && r < rim - 14;
    const overOculus = r < 3.5 && cam.y < 3;
    // Phase 7 (§2.3): docked, everything below the deck sits in the 66 m pit; from beyond the dock wall
    // (the bridge head, the Revier) the island's hull and the wall hide it (only the slot, seen from the
    // bridge or the rim, shows the cold ducts)
    const inDockPit = S.display.snap.flight.state === 'ground' && ctx.flight.altitude < 2 && cam.y > -3 && r > dockWallRadius(camB) + 0.5;
    S.under.setVisible((!onDeck || overOculus) && !inDockPit);

    // wind bed: stronger near the rim, high up and below the deck; docked the dock's walls shelter the deck
    const edge = THREE.MathUtils.smoothstep(r / Math.max(1, rim), 0.6, 1.05);
    const high = THREE.MathUtils.smoothstep(cam.y, 10, 44);
    const docked = S.gusts.docked;
    const target = (docked ? 0.2 : 0.28) + edge * (docked ? 0.2 : 0.35) + high * 0.3 + (cam.y < -2 ? 0.25 : 0);
    S.wind += (target - S.wind) * (1 - Math.exp(-dt * 1.5));
    ctx.audio.setWind(Math.min(1, S.wind));
  },

  dispose() {
    S = null;
    FIN = null;
    island.rotors = createRotorRates();
    island.radio = { say() {} };
  },
});

/** The first view (§1.2): the bridge head, bearing 0, pitch +6° — once the ground has its bridge head; else the Landedeck's south end. */
function arrival(ctx: ZoneContext): { position: Vec3Tuple; yawDeg: number; pitchDeg: number } {
  const s = REVIER.spawn;
  const hit = ctx.physics.raycast([s.position[0], s.position[1] + 3, s.position[2]], [0, -1, 0], 6);
  if (hit) return { position: s.position, yawDeg: s.yawDeg, pitchDeg: s.pitchDeg };
  return { position: [0, 0, 99.4], yawDeg: s.yawDeg, pitchDeg: s.pitchDeg };
}

/** The Landedeck's railing opens onto the bridge (§2.3); while the ground has no bridge yet, an invisible bar closes the gap. */
function guardBridge(ctx: ZoneContext): void {
  const b = REVIER.bridge;
  const hit = ctx.physics.raycast([b.x, 2, (b.fromZ + b.toZ) / 2], [0, -1, 0], 6);
  if (hit) return;
  ctx.physics.addStaticBox({ size: [b.width + 0.6, 1.3, 0.3], position: [b.x, 0.65, b.fromZ - 0.2], surface: 'metal' });
}

/** The ground area a Kanzel pad leads to (layout KANZEL_PADS, §2.3: T1 60 Kreislaufhof · T2 120 Traumhangar · T3 240 Sonnenacker · T4 300 Unkrautacker). */
function siteAt(areas: ReturnType<ZoneContext['zones']['list']>, bearing: number): { id: string; name: { de: string; en: string } } | null {
  const id = KANZEL_PADS.find((k) => k.bearing === bearing)?.site;
  if (!id) return null;
  const m = areas.find((a) => a.id === id);
  return { id, name: m?.name ?? { de: id, en: id } };
}

/** The area whose ◆ starts a system (its `system` or `trim`), from the manifests. */
function areaOf(areas: ReturnType<ZoneContext['zones']['list']>, id: SystemId): { id: string; name: { de: string; en: string } } | null {
  const m = areas.find((a) => a.system === id) ?? areas.find((a) => a.trim === id);
  return m ? { id: m.id, name: m.name } : null;
}
