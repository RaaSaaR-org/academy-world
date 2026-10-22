/**
 * The region chunk (WP14; plan §2.2–§2.8, §4.11, §5.5, §5.6): everything of the Revier that is not a site's
 * own code. Loaded by load.ts (before the title for a start on the ground, else in idle time after it).
 *
 *  - sites.ts      the four sites' far impostors, stepping aside while a site's area draws itself
 *  - grubenrand.ts the retired bucket-wheel excavator and the Revier-Chronik board (§2.8, D42, D43)
 *  - paths.ts      signposts at the ground pads, managed green along WP3's tracks
 *  - sheep.ts      the flock under the Unkrautacker's PV fences
 *  - sound.ts      the region's sound beds (the old steel, the pasture)
 *  - src/ui/map/region.ts  the „Revier“ tab of the map
 *
 * Everything hangs under one root, `region:root`, a child of the ground root (it rides the ground frame in
 * the lift-off) and tagged `userData.ledger = 'region'` for the per-owner draw ledger (§5.5). Above the
 * cloud bank's base the region is hidden (R8 §4.4); the near parts show only on the ground nearby.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { addMapLayer } from '@/ui/MapPanel';
import { regionMapLayer, type SiteMapState } from '@/ui/map/region';
import { GROUND_PADS, SITE_PLOTS } from '../layout';
import type { RegionChunk, RegionDeps } from './load';
import { createLook } from './look';
import { buildSiteImpostors } from './sites';
import { buildGrubenrand } from './grubenrand';
import { buildWays } from './paths';
import { buildFlock } from './sheep';
import { buildSound } from './sound';
import { STRINGS } from './strings';
import { R } from './tuning';

export async function build(ctx: ZoneContext, deps: RegionDeps): Promise<RegionChunk> {
  const t0 = performance.now();
  const step = deps.step;
  const groundRoot = deps.ground.root;
  ctx.i18n.register(STRINGS);

  const root = new THREE.Group();
  root.name = 'region:root';
  root.userData.ledger = 'region';
  // the island's surface pass and static merge never touch the region (it has the ground's program)
  root.userData.noEnrich = true;
  // hidden until its programs are compiled (world:late-build below)
  root.visible = false;
  groundRoot.add(root);
  ctx.onDispose(() => root.removeFromParent());

  // the land beyond the yard needs the 2 m heights (WP3's ring; already in for a start on the ground)
  await deps.ground.ringReady;
  const look = createLook(ctx, (x, z) => deps.ground.heightAt(x, z));
  const sites = buildSiteImpostors(ctx, root, look, groundRoot);
  await step();
  const grube = buildGrubenrand(ctx, root, look);
  await step();
  const ways = buildWays(ctx, root, look);
  await step();
  const flock = buildFlock(ctx, root, look);

  // ── sound beds ──
  const steelAnchor = new THREE.Object3D();
  steelAnchor.name = 'region:sound:steel';
  steelAnchor.position.copy(grube.excavator).add(new THREE.Vector3(0, 8, 0));
  const meadowAnchor = new THREE.Object3D();
  meadowAnchor.name = 'region:sound:meadow';
  root.add(steelAnchor, meadowAnchor);
  let creakIn = 6;
  let bleatIn = 5;
  const sound = buildSound(ctx, [
    {
      kind: 'revier-steel',
      at: steelAnchor,
      on: 90,
      off: 110,
      // now and then the old wheel creaks in the wind
      extra: (near) => {
        if (!near || (creakIn -= 0.25) > 0) return;
        creakIn = 8 + Math.random() * 9;
        const p = steelAnchor.position;
        ctx.audio.tone({ freq: 96, to: 71, dur: 0.9, type: 'sawtooth', volume: 0.05, at: [p.x, p.y, p.z] });
      },
    },
    {
      kind: 'revier-meadow',
      at: meadowAnchor,
      on: 120,
      off: 140,
      extra: (near) => {
        if (!near || (bleatIn -= 0.25) > 0) return;
        bleatIn = 7 + Math.random() * 12;
        const p = flock.centre(new THREE.Vector3());
        // a sheep: two quick wavering tones
        ctx.audio.tone({ freq: 320, to: 290, dur: 0.28, type: 'sawtooth', volume: 0.035, at: [p.x, p.y + 0.6, p.z] });
        ctx.after(0.3, () => ctx.audio.tone({ freq: 300, to: 260, dur: 0.42, type: 'sawtooth', volume: 0.03, at: [p.x, p.y + 0.6, p.z] }));
      },
    },
  ]);

  // ── the map's „Revier“ tab ──
  let objective: string | null = null;
  ctx.events.on('objective:changed', (p?: { areaId?: string | null; zone?: string | null }) => (objective = p?.areaId ?? p?.zone ?? null));
  const names = new Map(ctx.zones.list({ kind: 'all' }).map((m) => [m.id, m.name]));
  const stations = new Map(ctx.zones.list({ kind: 'all' }).map((m) => [m.id, m.stations.length]));
  // the map redraws every frame while open: the states are cached for half a second
  let cacheT = -1;
  const cache = new Map<string, SiteMapState>();
  const siteState = (id: string): SiteMapState => {
    if (ctx.time.elapsed - cacheT > 0.5) {
      cacheT = ctx.time.elapsed;
      cache.clear();
    }
    let st = cache.get(id);
    if (st) return st;
    const n = ctx.zones.stamps(id);
    st = !ctx.quest.snapshot().regionOpen ? 'closed' : n > 0 && n >= (stations.get(id) ?? 1) ? 'stamped' : n > 0 || ctx.zones.visited(id) ? 'visited' : 'open';
    cache.set(id, st);
    return st;
  };
  ctx.onDispose(
    addMapLayer(
      regionMapLayer({
        name: (id) => ctx.i18n.resolve(names.get(id) ?? { de: id, en: id }),
        state: siteState,
        objective: () => objective,
        padsArmed: () => ctx.quest.snapshot().regionOpen && ctx.flight.state === 'ground',
        t: (k) => ctx.t(`region.${k}`),
        grubenrand: { body: [grube.excavator.x, grube.excavator.z], board: [grube.board.x, grube.board.z] },
      }),
    ),
  );

  // ── the lift-off's downwash: the tracker rows stow, the sheep trot away from the dock ──
  ctx.events.on('flight:phase', (p?: { name?: string }) => {
    if (p?.name !== 'downwash') return;
    sites.downwash();
    flock.scatter();
  });

  // ── per frame: the region's visibility above the cloud base, the impostors, the near parts, the flock ──
  /** true once the region's programs had their background compile (world:late-build below) */
  let compiled = false;
  // the region's far parts that the plaza sees only as a sliver over the rim (WP17: the plaza's GPU frame);
  // the site impostors stay (the plaza sees the Traumhangar roof, plan §2.5)
  const plazaOff = ['region:landmark:unkrautacker', 'region:grubenrand', 'region:ways', 'region:sheep'].map((n) => root.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o);
  const eye = new THREE.Vector3();
  const nearOn = new Map<THREE.Object3D, boolean>();
  const tick = (dt: number): void => {
    eye.copy(ctx.camera.position);
    // the eye's height over the ground frame: the cloud bank covers the Revier from its base upward
    const eyeH = eye.y - groundRoot.position.y;
    const shown = eyeH < R.hideAboveEye;
    if (root.visible !== shown && compiled) root.visible = shown;
    if (!shown) return;
    const plaza = deps.ground.atPlaza;
    for (const o of plazaOff) if (o.visible === plaza) o.visible = !plaza;
    sites.update(dt);
    const docked = ctx.flight.docked;
    const p = ctx.player.position;
    const near = (x: number, z: number, cur: boolean, d = R.near): boolean => docked && Math.hypot(p.x - x, p.z - z) < (cur ? d.hide : d.show);
    const gNear = near(grube.board.x, grube.board.z, grube.face.visible);
    grube.setNear(gNear);
    // the signposts are one mesh pair: shown when any pad is near
    let anyPad = false;
    for (const c of ways.clusters) anyPad ||= near(c.at[0], c.at[1], nearOn.get(c.group) ?? false, R.signs);
    for (const c of ways.clusters) {
      if (c.group.visible !== anyPad) c.group.visible = anyPad;
      nearOn.set(c.group, anyPad);
    }
    const flockNear = docked && Math.hypot(p.x + 300, p.z + 260) < 250;
    flock.update(dt, flockNear);
    sound.update(dt, p, docked);
  };
  // the meadow bed follows the flock (refreshed slowly)
  ctx.every(2, () => flock.centre(meadowAnchor.position));
  let last = ctx.time.elapsed;
  ctx.every(1 / 60, () => {
    const now = ctx.time.elapsed;
    const dt = Math.min(0.1, Math.max(0, now - last));
    last = now;
    tick(dt);
  });

  // compile the region's programs (the canvas faces are new) in the background, then show it
  ctx.events.emit('world:late-build', { what: 'region' });
  ctx.after(0.35, () => {
    compiled = true;
    tick(0);
  });

  // ── tool hooks ──
  const buildMs = Math.round(performance.now() - t0);
  const stats = (): Record<string, unknown> => {
    let draws = 0,
      tris = 0;
    root.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      draws++;
      const g = m.geometry;
      const n = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      tris += n * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
    });
    return {
      buildMs,
      visible: root.visible,
      draws,
      triangles: Math.round(tris),
      sites: sites.stats(),
      ways: ways.stats(),
      grubenrand: { board: grube.board.toArray().map((v) => Math.round(v * 100) / 100), readAt: grube.readAt.toArray().map((v) => Math.round(v * 100) / 100), excavator: grube.excavator.toArray().map((v) => Math.round(v * 100) / 100), faceVisible: grube.face.visible },
      pads: GROUND_PADS.map((g) => g.id),
      sitesIds: SITE_PLOTS.map((s) => s.id),
    };
  };
  ctx.debug.register('region-card', () => ctx.ui.card(grube.card()));
  return { stats };
}
