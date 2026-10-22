/**
 * WP3 (ground and dock) — Trockendock 3 and the land around it (Phase 7 plan §2.1–§2.3, §2.7, §5.3, §5.5,
 * §5.6; D19, D22). The contract (GroundHandle, DockSpray, buildGround) was committed by WPS in wave 0;
 * WP3 owns src/world/ground/** from wave 1. Altitude is NOT on GroundHandle: only ctx.island.setAltitude
 * moves the ground root (WP4, §5.3 rule 2).
 *
 * Built before the title, in yielding sections: the heights core (≈ 16 KB), the terrain (one draw: the
 * yard plus the clipmap rings), the dock (rim and pit), the arms, the bridge, the bridge head pen, the
 * gate and the sign, the Werft and the yard fence, the lake, the far ring, the spray, the yard's
 * colliders and the rescue volumes. After the title: heights-ring.bin (the real 2 m land), then the
 * heightfield tiles and the outer fences in idle slices. A deep link or a resume onto the ground loads the
 * ring before the title. Ledger owner: everything is under `ground:root` (drawcalls: world/ground).
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { registerDebugExt } from '@/core/DebugApi';
import { DEG, ISLAND, REVIER, TROCKENDOCK, ZONE_PLOTS, bearingOf, outlineRadius, polar, type Vec3Tuple } from '../layout';
import { PLATEAU } from './plan';
import { Heights, fetchHeights } from './heights';
import { buildTerrain } from './terrain';
import { GroundBatch, GroundMaterial } from './material';
import { buildDock } from './dock';
import { buildArms } from './arms';
import { buildBridge } from './bridge';
import { addFences, buildWerft, fenceLines } from './werft';
import { buildWater } from './water';
import { buildFarRing } from './far';
import { buildSpray } from './spray';
import { buildColliders } from './colliders';
import { outsideCamera } from './camera';

export interface DockSpray {
  /** one instanced draw, ≤ 192 particles (96 on low) */
  emit(kind: 'plume' | 'burst' | 'ring' | 'wisp', at: Vec3Tuple, strength: number): void;
  setPlume(lobe: 0 | 1 | 2 | 3 | 4 | 5, on: boolean): void;
}

export interface GroundHandle {
  /** dock, Werft, terrain, shore, lake, far ring; ground-frame areas parent here (WP4) */
  readonly root: THREE.Group;
  heightAt(x: number, z: number): number;
  /** 0 extended … 1 retracted */
  setBridge(t: number): void;
  /** 0 holding … 1 stowed */
  setArms(t: number): void;
  /** the Revier gate at the bridge head */
  setGate(open: boolean): void;
  /** „TROCKENDOCK 3 · ROTOREN m/6“ */
  setSign(rotorsReady: number): void;
  /** arms twitch, hydraulic sigh (docked gusts, §5.3 rule 4); WP3 addition: the gust's bearing (default 290°) */
  catchGust(strength: number, bearing?: number): void;
  readonly spray: DockSpray;
  /** the outside shots of the lift-off, in the island frame */
  outsideCamera(shot: 'C1' | 'C2', h: number, t: number): { position: Vec3Tuple; lookAt: Vec3Tuple };
  /** WP3 addition: resolves once the real 2 m land (heights-ring.bin) and its colliders are in (never rejects) */
  readonly ringReady: Promise<void>;
  /**
   * WP17 addition: the eye on the plaza (the terrain's island set and within 40 m of the island's centre, out
   * at 43). From there the land shows only as a sliver over the rim, so the far ring's crowns and the fences
   * are not drawn, and the region and life leave out their far parts (the plaza's GPU frame, plan §5.5).
   */
  readonly atPlaza: boolean;
}

/** areas whose plot is on the ground (a deep link or a resume there needs the ring before the title) */
function groundStart(ctx: ZoneContext): boolean {
  const p = new URLSearchParams(location.search);
  const ids = [p.get('zone'), p.get('area'), ...(p.get('only') ?? '').split(','), ctx.quest?.resumeArea?.() ?? null].filter((s): s is string => !!s);
  const ground = new Set(ctx.zones.list({ kind: 'all' }).filter((m) => m.frame === 'ground').map((m) => m.id));
  if (ids.some((id) => ground.has(id))) return true;
  const pos = (p.get('pos') ?? '').split(',').map(Number);
  return pos.length >= 3 && pos.every(Number.isFinite) && Math.hypot(pos[0], pos[2]) > PLATEAU.flat - 10;
}

/** Build the ground (island module only; `step` hands the main thread back between builders). */
export async function buildGround(ctx: ZoneContext, step: () => Promise<void>): Promise<GroundHandle> {
  const t0 = performance.now();
  // each section's main-thread time (a section is the work between two yields; plan §5.5: no task > 250 ms
  // before the title at 4× CPU)
  const sections: Record<string, number> = {};
  let ts = performance.now();
  const section = async (name: string): Promise<void> => {
    sections[name] = Math.round((performance.now() - ts) * 10) / 10;
    await step();
    ts = performance.now();
  };
  const root = new THREE.Group();
  root.name = 'ground:root';
  // the island's surface pass and static merge never touch the ground (it has its own materials and merges)
  root.userData.noEnrich = true;
  ctx.root.add(root);

  // ── heights: the core before the title (a failure leaves the yard flat and the land unknown) ──
  const heights = new Heights();
  ctx.onDispose(() => heights.dispose());
  try {
    const buf = await fetchHeights('heights-core.bin');
    ts = performance.now();
    heights.applyCore(buf);
  } catch (err) {
    console.warn('[ground] heights-core.bin failed: the land stays flat', err);
  }
  const heightAt = (x: number, z: number): number => heights.heightAt(x, z);
  await section('heights-core');

  const terrain = buildTerrain(ctx, root, heights);
  ctx.onDispose(() => terrain.dispose());
  await section('terrain');

  const mat = new GroundMaterial();
  ctx.onDispose(() => mat.dispose());
  const light = ctx.materials.light(0xffe2bf, 'line');
  const dock = await buildDock(ctx, root, mat, light, step);
  await section('dock');

  // the yard: arm housings, bridge head, Werft, pads, the yard fence → one draw
  const yardB = new GroundBatch();
  const arms = buildArms(ctx, root, mat, yardB);
  const bridge = buildBridge(ctx, root, mat, yardB);
  await section('arms-bridge');
  // the cranes' bogies and the containers are solid (ground frame)
  for (const b of buildWerft(yardB)) ctx.frames.adopt(ctx.physics.addStaticBox({ size: b.size, position: b.at, surface: 'metal' }));
  const fences = fenceLines();
  const yardMesh = yardB.build(mat, 'ground:yard:static');
  if (yardMesh) {
    root.add(yardMesh);
    ctx.onDispose(() => yardMesh.geometry.dispose());
  }
  await section('werft');

  const water = buildWater(root);
  ctx.onDispose(() => {
    water.mesh.geometry.dispose();
    (water.mesh.material as THREE.Material).dispose();
  });
  const far = buildFarRing(root, mat, heightAt, () => ctx.settings.reducedMotion);
  const spray = buildSpray(ctx, root);
  await section('water-far-spray');

  // ── colliders (the yard now, the land after the ring) and the rescue volumes (WP4: dock floor + keel block, the lake) ──
  const colliders = buildColliders(ctx, terrain.yard, dock.railLines, fences.yard);
  // plan §5.3 rule 8, C1 M7: over the dock floor and the keel block, and at the lake's surface (WP4's layout data)
  const D = TROCKENDOCK.rescue,
    L = REVIER.lake.rescue;
  ctx.frames.adopt(
    ctx.physics.addRescueVolume({ center: D.center, size: D.size, player: 'rescue', dynamics: 'reset', frame: 'ground' }),
    ctx.physics.addRescueVolume({ center: L.center, size: L.size, yawDeg: L.yawDeg, player: 'rescue', dynamics: 'reset', frame: 'ground' }),
  );
  // the slot (r 89–113, y −40 … −14) as a ring of sixteen boxes: a fall into the dock is caught 14 m down,
  // in ≈ 1.7 s, not after the 66 m to the floor; nothing of the island reaches there (the pods end at r 87.5
  // and y −13.5, the Kielraum is inside r 29)
  for (let k = 0; k < 16; k++) {
    const b = (k / 16) * 360;
    const [x, , z] = polar(b, 100);
    ctx.frames.adopt(ctx.physics.addRescueVolume({ center: [x, -27, z], size: [44, 26, 22], yawDeg: 180 - b, player: 'rescue', dynamics: 'reset', frame: 'ground' }));
  }
  ctx.frames.register('ground', root, { heightAt });
  sections['colliders'] = Math.round((performance.now() - ts) * 10) / 10;

  // the fences' mesh and its posts' vertex count (the island set shows the posts only, below)
  let fenceMesh: { mesh: THREE.Mesh; posts: number } | null = null;
  // the eye on the plaza (GroundHandle.atPlaza; set per frame below)
  let atPlaza = false;
  // ── after the title (or now, for a start on the ground): the ring and the land's colliders ──
  let resolveRing!: () => void;
  const ringReady = new Promise<void>((r) => (resolveRing = r));
  const loadRing = async (): Promise<void> => {
    try {
      // after the title the retries may wait longer (1, 3, 9 s: plan §5.8)
      heights.applyRing(await fetchHeights('heights-ring.bin', 4, 1000));
    } catch (err) {
      // plan §5.8: a failed download never makes the goal unreachable: the land keeps its 16 m preview
      // and the tracks, the sites and their colliders are built on it (heights a few cm to dm off)
      console.warn('[ground] heights-ring.bin failed: the land beyond the yard stands on its 16 m preview', err);
    }
    try {
      await step();
      // every field fence (the yard fence and the corridors and sites) in one draw, out of the shadow pass
      const outer = new GroundBatch();
      const posts = addFences(outer, [...fences.yard, ...fences.outer], heightAt);
      const outerMesh = outer.build(mat, 'ground:fences', { cast: false });
      if (outerMesh) {
        root.add(outerMesh);
        outerMesh.visible = !atPlaza;
        fenceMesh = { mesh: outerMesh, posts };
        ctx.onDispose(() => outerMesh.geometry.dispose());
      }
      await colliders.addOuter(heights, fences.outer, step);
    } catch (err) {
      console.error('[ground] building the land beyond the yard failed', err);
    } finally {
      resolveRing();
    }
  };
  if (groundStart(ctx)) await loadRing();
  else ctx.after(0.2, () => void loadRing());

  // ── per frame: the pit's visibility, the moving parts, the spray (WP4 switches the ground's colliders) ──
  const cam = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  let last = ctx.time.elapsed;
  let lastIsland: boolean | null = null;
  const tick = (): void => {
    const now = ctx.time.elapsed;
    const dt = Math.min(0.1, Math.max(0, now - last));
    last = now;
    // the pit is seen from the rim, the slot, the glass floors, below the deck and from outside
    root.updateWorldMatrix(true, false);
    inv.copy(root.matrixWorld).invert();
    cam.copy(ctx.camera.position).applyMatrix4(inv);
    const r = Math.hypot(cam.x, cam.z);
    const rim = outlineRadius(bearingOf(cam.x, cam.z));
    const pitVisible = r > rim - 16 || cam.y < -0.5 || cam.y > 60;
    dock.setPitVisible(pitVisible);
    // the eye low over the island (the terrain's island set, WPF item 4): the rim's rail throws its shadow into the
    // slot or onto the apron, and the Werft's cranes and the arm housings onto the yard, all beyond the 90 m shadow
    // box or out of sight, so they stay out of the shadow pass; the fence wires (under a pixel from the deck) are
    // not drawn
    const island = terrain.islandMode;
    if (island !== lastIsland) {
      lastIsland = island;
      // (the sun's shadow map redraws at least every second frame: RenderSystem C11c)
      for (const m of dock.rim.children) m.castShadow = !island;
      if (yardMesh) yardMesh.castShadow = !island;
    }
    if (fenceMesh) fenceMesh.mesh.geometry.drawRange.count = island ? fenceMesh.posts : Infinity;
    // on the plaza (WP17): no fence posts and no far crowns either (under a pixel, or hidden by the rim)
    const plaza = island && r < (atPlaza ? 43 : 40);
    if (plaza !== atPlaza) {
      atPlaza = plaza;
      if (fenceMesh) fenceMesh.mesh.visible = !plaza;
      far.setCrowns(!plaza);
    }
    // and of the rim only its top while the slot is out of sight
    dock.setRimTopOnly(island && !pitVisible);
    arms.update(dt);
    bridge.update(dt);
    spray.update(dt, now);
    water.update(now);
    far.update(dt);
  };
  ctx.every(1 / 60, tick);
  tick();

  // ── tool hooks ──
  const stats = (): Record<string, unknown> => ({
    stage: heights.stage,
    terrainTriangles: terrain.triangles,
    terrainIsland: terrain.islandMode,
    atPlaza,
    dockTriangles: dock.triangles,
    colliders: colliders.count(),
    tiles: colliders.tiles.length,
    pitVisible: dock.pit.visible,
    spray: spray.alive,
    bridge: bridge.state.bridge,
    gateOpen: bridge.state.gateOpen,
    sign: bridge.state.rotors,
    /** wall time of buildGround (with the yields and the core download) */
    buildMs: Math.round(buildMs),
    sections,
    // triangles per drawn mesh (k), for the ledger's triangle budget
    meshes: (() => {
      const out: Record<string, number> = {};
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.geometry) return;
        const g = m.geometry;
        const n = Math.min(g.index ? g.index.count : g.getAttribute('position').count, g.drawRange.count) / 3;
        const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : (g as THREE.InstancedBufferGeometry).isInstancedBufferGeometry ? (g as THREE.InstancedBufferGeometry).instanceCount : 1;
        out[m.name || m.type] = Math.round((n * inst) / 100) / 10;
      });
      return out;
    })(),
  });
  ctx.onDispose(registerDebugExt('ground', stats));
  // the outside shots for the tools (WP13's lift-off checks, the stills): (shot, h, t) → island-frame pose
  ctx.onDispose(registerDebugExt('ground:camera', ((shot: 'C1' | 'C2', h: number, t: number) => outsideCamera(shot, h, t)) as never));
  ctx.debug.register('ground-stats', stats);
  ctx.debug.register('ground-gate-open', () => handle.setGate(true));
  ctx.debug.register('ground-gate-close', () => handle.setGate(false));
  ctx.debug.register('ground-gust', () => handle.catchGust(1, 290));
  // the release beat at a glance (WP13 drives these over time): arms stowed and the bridge retracted, and back
  ctx.debug.register('ground-release', () => {
    handle.setArms(1);
    handle.setBridge(1);
  });
  ctx.debug.register('ground-redock', () => {
    handle.setArms(0);
    handle.setBridge(0);
  });
  // tools/ground-walk.mjs: a test crate on the bridge head (ground frame), and dropping it into the slot
  let crate: import('@/core/zones').DynamicHandle | null = null;
  const testCrate = (): import('@/core/zones').DynamicHandle => {
    if (crate) return crate;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), ctx.materials.crate);
    m.name = 'ground:test-crate';
    m.position.set(-6, 0.32, 118);
    m.castShadow = true;
    root.add(m);
    crate = ctx.physics.addDynamic(m, { mass: 12, label: { de: 'Kiste', en: 'Crate' } });
    return crate;
  };
  ctx.debug.register('ground-crate', () => ({ id: testCrate().id }));
  ctx.debug.register('ground-crate-drop', () => {
    const c = testCrate();
    const [x, , z] = polar(150, 104);
    c.setPosition([x, 2, z]);
    return { id: c.id };
  });
  // flash-check (plan §5.10): the spray sequence — the six plumes start clockwise every 2.5 s with a burst and a
  // floor ring each (the R5 spin-up), framed from the bridge head; resolves when the last particle has faded
  ctx.onDispose(
    registerDebugExt('sequence:spray', async (o: { seconds?: number; frame?: boolean } = {}) => {
      const seconds = o.seconds ?? 18;
      // framed from the yard south-south-east: the slots at M5 (150°) and M6 (210°) in view
      const cine = o.frame === false ? null : ctx.player.cinematic();
      const [cx, , cz] = polar(165, 152);
      const [lx, , lz] = polar(172, 96);
      cine?.set([cx, 9, cz], [lx, 6, lz], 1);
      const order = [0, 1, 2, 3, 4, 5] as const;
      order.forEach((lobe, k) =>
        ctx.after(k * 2.5, () => {
          const b = ZONE_PLOTS[lobe].bearing;
          const [x, , z] = [Math.sin(b * DEG) * (ISLAND.outerRadius + 2), 0, -Math.cos(b * DEG) * (ISLAND.outerRadius + 2)];
          handle.spray.emit('burst', [x, -1, z], 1);
          handle.spray.emit('ring', [x * 0.95, -65.5, z * 0.95], 1);
          handle.spray.setPlume(lobe, true);
        }),
      );
      await new Promise<void>((res) => ctx.after(seconds - 5, res));
      for (const lobe of order) handle.spray.setPlume(lobe, false);
      await new Promise<void>((res) => ctx.after(5, res));
      cine?.end();
      return { seconds };
    }),
  );

  // dev only: the GPU-proof stand-ins and the G-LOOK block-outs (WP2 + WP3, plan §5.5), loaded on request
  // (`?groundproof=1`, `?lookdev=1`, or a build made with VITE_GROUNDPROOF=1 for the GPU A/B tools)
  if (/[?&](groundproof|lookdev)\b/.test(location.search) || import.meta.env.VITE_GROUNDPROOF === '1') void import('./lookdev/standins').then((m) => m.buildStandins(ctx, root, mat, heightAt));

  const handle: GroundHandle = {
    root,
    heightAt,
    setBridge: (t) => bridge.setBridge(t),
    setArms: (t) => arms.set(t),
    setGate: (open) => bridge.setGate(open),
    setSign: (m) => bridge.setSign(m),
    catchGust: (s, b) => arms.catchGust(s, b),
    spray: { emit: (k, at, s) => spray.emit(k, at, s), setPlume: (l, on) => spray.setPlume(l, on) },
    outsideCamera,
    ringReady,
    get atPlaza() {
      return atPlaza;
    },
  };
  const buildMs = performance.now() - t0;
  return handle;
}

