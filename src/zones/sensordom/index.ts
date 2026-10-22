/**
 * Zone 01 · SEHEN · Sensordom (GDD §7.1, adapted by DECISIONS.md).
 *
 * You step inside a robot's eyes: a dark geodesic dome (EMI's head, LiDAR spinning on top).
 *   A  Messbrille     four real render modes (RGB / TIEFE / LIDAR / SEG) — tag 5 things for EMI-02
 *   B  Dunkelkammer   LiDAR-only maze with an invisible glass wall, light reveal, sonar fusion, mirror ghosts
 *   C  Messstrecke ◆ → M1  depth noise σ ∝ z², backlight ×2.5 → Kennlinie, question card #9; EMI-02
 *                     reaches ten times after each run and grips or misses (plan §4.2)
 * Phase 7: the zone's request is EMI-02's first line on entry (§3.2); A's wrong-view press is a gag again.
 *
 * Debug hooks: __academy.solve('sensordom', 'solve-a' | 'solve-b' | 'solve-c' | 'album' |
 *   'mode-rgb' | 'mode-tiefe' | 'mode-lidar' | 'mode-seg' | 'tp-<spot>' | 'stats' | 'operate')
 */
import * as THREE from 'three';
import { defineZone, type EmiHandle, type ZoneContext } from '@/core/zones';
import manifest from './manifest';
import { STRINGS } from './strings';
import { Visor, MODES, type VisorMode } from './visor';
import { Lidar, MASK_ALL, G_SOLID, G_GLASS, G_MIRROR, G_THIN, type ProbeHit } from './lidar';
import { Builder } from './kit';
import { SensorSound } from './sound';
import { buildDome, DOME, PORTAL, TUNNEL, type DomeParts } from './dome';
import { buildLabor, type Labor } from './labor';
import { buildKapsel, type Kapsel } from './kapsel';
import { buildDarkroom, ROOM, type Darkroom } from './darkroom';
import { buildMessstrecke, RAIL, sigmaMm, type Messstrecke } from './messstrecke';
import { Curtains } from './curtains';
import { disposeZoneMaterials } from './materials';
import { createLook, stationRings } from './look';
import type { Region, Sd } from './types';

// module state (one zone instance); reset in dispose()
let S: State | null = null;

interface State {
  sd: Sd;
  dome: DomeParts;
  labor: Labor;
  kapsel: Kapsel;
  dark: Darkroom;
  rail: Messstrecke;
  curtains: Curtains;
  region: Region;
  interiorExit: (() => void) | null;
  fanAngle: number;
  probeAcc: number;
  probe: { set(v: string): void; remove(): void; readonly el: HTMLElement };
  rings: { update(): void; readonly meshes: THREE.Mesh[] };
  overlays: THREE.Object3D[];
  greeted: boolean;
  /** EMA / max of update() cost in ms (perf check) */
  updMs: number;
  updMax: number;
}

const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _loc = new THREE.Vector3();
const _feet = new THREE.Vector3();
const _head = new THREE.Vector3();
const _hit: ProbeHit = { distance: 0, info: null, reported: 0 };
const groups = (filter: number): number => (0xffff << 16) | filter;
const PROBE_MASK: Record<VisorMode, number> = {
  rgb: groups(G_SOLID | G_GLASS | G_MIRROR | G_THIN),
  tiefe: groups(G_SOLID | G_GLASS | G_MIRROR),
  lidar: groups(G_SOLID | G_MIRROR),
  seg: groups(G_SOLID | G_MIRROR | G_THIN),
};

function regionOf(p: THREE.Vector3): Region {
  if (p.y > 4) return 'outside';
  if (p.x > ROOM.x0 + 0.1 && p.x < ROOM.x1 - 0.1 && p.z > ROOM.z0 + 0.1 && p.z < ROOM.z1 - 0.1) return 'darkroom';
  if (Math.abs(p.x) < TUNNEL.w / 2 + 0.3 && p.z > PORTAL.z0 + 0.1 && p.z < TUNNEL.z1 + 0.4) return 'tunnel';
  const dz = p.z - DOME.cz;
  if (p.x * p.x + dz * dz < (DOME.R - 0.1) ** 2) return 'dome';
  return 'outside';
}

export default defineZone({
  ...manifest,

  init(ctx) {
    ctx.i18n.register(STRINGS);
    ctx.pass.registerAlbum({ id: 'spiegel-geisterpunkte', title: ctx.i18n.text('album.title'), text: ctx.i18n.text('album.text'), hint: ctx.i18n.text('album.hint') });

    const visor = new Visor();
    const lidar = new Lidar(ctx);
    lidar.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    ctx.groups.detail.add(lidar.points);
    const sound = new SensorSound(ctx);
    const B = new Builder(ctx, visor, lidar);
    const look = createLook(ctx, 'sensordom');

    // light #2: over the Messstrecke; the darkroom reveal borrows it
    const anchor = new THREE.Object3D();
    anchor.position.set(RAIL.x, 3.2, 4.4);
    ctx.groups.detail.add(anchor);
    const l2 = ctx.lights.point(anchor, { color: 0xffd2a8, intensity: 24, distance: 11 });

    const emi: EmiHandle = ctx.emi.spawn({ unit: 'EMI-02', position: [-3, 0.05, 6.9], yawDeg: 15, parent: ctx.groups.detail });
    visor.registerEmi(emi.object);
    lidar.addFollower(emi.object, 0.3, 1.55, { seg: 'roboter', depth: 'normal' });

    const st = {} as State;
    const modesSeen = new Set<VisorMode>(ctx.progress.get<VisorMode[]>('modesSeen', []));
    const sd: Sd = {
      ctx,
      visor,
      lidar,
      sound,
      B,
      look,
      emi,
      modesSeen,
      region: () => st.region ?? 'outside',
      refreshObjective: () => refreshObjective(ctx),
      say: (key, params) => void emi.say(ctx.i18n.text(key, params)),
      setMode: (m, force) => setMode(ctx, m, !!force),
      registerSign: (g) => {
        g.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const t = o as unknown as { sync?: unknown; text?: unknown };
          if (typeof t.sync === 'function' && 'text' in t) visor.registerRgbOnly(o);
          else visor.register(m, { seg: 'struktur' });
        });
      },
      rgbOnly: (o) => visor.registerRgbOnly(o),
      cardWhenFree: (open, delay = 2) => {
        const attempt = (): void => {
          if (ctx.hud.modalOpen && !ctx.player.operating) ctx.after(1, attempt);
          else void open();
        };
        ctx.after(delay, attempt);
      },
      text: (key, params) => ctx.i18n.text(key, params),
      light2: { setIntensity: (v) => l2.setIntensity(v), setColor: (c) => l2.setColor(c), anchor },
    };
    st.sd = sd;
    st.region = 'outside';
    st.interiorExit = null;
    st.fanAngle = 0;
    st.probeAcc = 0;
    st.greeted = false;
    st.updMs = 0;
    st.updMax = 0;

    // ── build ────────────────────────────────────────────────────────────
    st.dome = buildDome(ctx, B, look);
    st.labor = buildLabor(sd);
    st.kapsel = buildKapsel(sd);
    st.dark = buildDarkroom(sd);
    st.rail = buildMessstrecke(sd);
    // Messstrecke pendant (the fixture of light #2): alu rod, ceramic shade, warm T1 disc
    B.geo(new THREE.CylinderGeometry(0.012, 0.012, 2.4, 6).translate(RAIL.x, 4.4, 4.4), { mat: look.alu, seg: 'struktur' });
    B.geo(new THREE.CylinderGeometry(0.2, 0.42, 0.3, 24, 1, true).translate(RAIL.x, 3.35, 4.4), { mat: look.hull, seg: 'struktur' });
    B.geo(new THREE.CircleGeometry(0.4, 24).rotateX(Math.PI / 2).translate(RAIL.x, 3.21, 4.4), { mat: look.light('warm', 1, { dusk: false }), seg: 'struktur' });

    st.curtains = new Curtains(ctx);
    st.curtains.add(0, TUNNEL.z1 - 0.6, 1, 0, TUNNEL.w, TUNNEL.h);
    st.curtains.add(0, 13.4, 1, 0, TUNNEL.w, TUNNEL.h);
    st.curtains.add(0, ROOM.z1 + 0.12, 1, 0, 1.2, 2.3);
    st.curtains.add(ROOM.x1 + 0.12, -16, 0, 1, 1.2, 2.3);
    st.curtains.build(ctx.groups.detail, visor);

    B.finalize();
    // Z1: the exterior's per-material buckets (dome cap, drum, lock, gate arch, LiDAR head) fold into
    // a few packed draws; the per-vertex visor tags travel along and the merged meshes take over the
    // originals' visor entries. Only 'attr' buckets that block the LiDAR merge; the spinning head stays live.
    {
      const tagged = (o: THREE.Object3D): boolean => {
        const t = visor.tagsOf(o);
        return !!t && (t.seg !== 'attr' || t.depth !== 'attr' || t.lidar !== 'occlude');
      };
      const r = ctx.mergeStatic(ctx.groups.exterior, { attributes: ['aSeg', 'aDepth'], keep: (o) => st.dome.fanPivots.includes(o) || tagged(o) });
      for (const o of r.originals) visor.unregister(o as THREE.Mesh);
      for (const m of r.meshes) visor.register(m as THREE.Mesh, { seg: 'attr', depth: 'attr' });
    }

    // station footprints: a teal ring each (T1 while the player is at the station); sensors don't see paint
    const near = (x: number, z: number, d: number): (() => boolean) => () => {
      ctx.player.positionLocal(_feet);
      return Math.hypot(_feet.x - x, _feet.z - z) < d;
    };
    st.rings = stationRings(ctx, look, [
      { at: [-7, 0.064, 3], r: 2.1, active: near(-7, 3, 2.8) },
      { at: [0, 0.064, -4.9], r: 1.0, active: near(0, -4.9, 1.8) },
      { at: [RAIL.x + 1.4, 0.064, RAIL.sensorZ - 0.6], r: 0.85, active: () => st.rail.operating || near(RAIL.x + 1.4, RAIL.sensorZ - 0.6, 1.6)() },
    ]);
    for (const m of st.rings.meshes) visor.register(m, { seg: 'unsichtbar', lidar: 'hide' });

    // overlays (O key): formulas in the room
    const ov = (text: string, pos: [number, number, number], ry: number): THREE.Object3D => {
      const t = ctx.text3d.create({ text: ctx.i18n.text(text), font: 'mono-medium', size: 0.2, color: 0x2dd4bf, glow: 1.2, anchorX: 'center', position: pos, rotationY: ry }, ctx.groups.detail);
      return t;
    };
    st.overlays = [ov('overlay.lidar', [-7.2, 2.75, 3], Math.PI / 2), ov('overlay.stereo', [RAIL.x, 2.6, 5.2], 0.1), ov('overlay.sonar', [0, 2.65, ROOM.z1 + 0.15], 0)];
    const applyOverlays = (): void => {
      for (const o of st.overlays) o.visible = ctx.settings.overlays && visor.mode === 'rgb' && ctx.playerDistance < 30;
    };
    ctx.settings.onChange(applyOverlays);
    visor.onChange(applyOverlays);
    applyOverlays();

    // crosshair probe (right column)
    st.probe = ctx.ui.readout(ctx.i18n.text('probe.label'), '—');
    st.probe.el.style.display = 'none';

    // ── input: 1–4 / V ───────────────────────────────────────────────────
    ctx.input.onKey(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyV'], (code) => {
      if (st.rail.operating) return;
      const next: VisorMode = code === 'KeyV' ? MODES[(MODES.indexOf(visor.mode) + 1) % MODES.length] : MODES[Number(code.slice(5)) - 1];
      const before = visor.mode;
      setMode(ctx, next, false);
      st.labor.visorKey(visor.mode !== before);
    });

    // ── EMI help ─────────────────────────────────────────────────────────
    emi.onAsk(() => {
      const key = !ctx.pass.has('messbrille') ? 'a' : !ctx.pass.has('dunkelkammer') ? 'b' : !ctx.pass.has('messstrecke') ? 'c' : 'done';
      void emi.say(ctx.i18n.text(key === 'done' ? 'emi.ask.done' : `emi.ask.${key}`));
      void emi.gesture('point');
    });

    // ── debug / test hooks ───────────────────────────────────────────────
    ctx.debug.register('solve-a', () => st.labor.solve());
    ctx.debug.register('solve-b', () => st.dark.solve());
    ctx.debug.register('solve-c', () => st.rail.solve());
    ctx.debug.register('album', () => st.dark.album());
    // ★★★ results for screenshots and the playtest (FUN-PLAN §4.7)
    ctx.debug.register('stars3-a', () => st.labor.stars3());
    ctx.debug.register('stars3-b', () => st.dark.stars3());
    ctx.debug.register('stars3-c', () => st.rail.stars3());
    // Sensorkapsel (FUN-PLAN S4, kapsel.ts): under a velvet cloth beside the Samtkiste, found with LIDAR / SEG
    ctx.debug.register('tp-kapsel', () => ctx.player.teleport(st.kapsel.viewpoint.pos, { yawDeg: st.kapsel.viewpoint.yawDeg, pitchDeg: -22 }));
    ctx.debug.register('kapsel-reveal', () => st.kapsel.reveal());
    for (const m of MODES) ctx.debug.register(`mode-${m}`, () => setMode(ctx, m, false));
    const tp: Record<string, [[number, number, number], number, number]> = {
      gate: [[0, 0, 30], 0, 4],
      labor: [[0, 0, 7.6], 25, -4],
      table: [[-4.9, 0, 3.2], 88, -18],
      shelf: [[-8.0, 0, 0.6], 62, -12],
      darkroom: [[1.0, 0, -7.0], 0, -2],
      corridor: [[-3.0, 0, -7.4], 0, -2],
      mirror: [[-3.0, 0, -11.6], 0, -3],
      exit: [[7.2, 0, -16], 90, 0],
      rail: [[RAIL.x - 2.6, 0, RAIL.sensorZ + 1.0], 20, -8],
      overview: [[-8.6, 0, 8.4], -38, -9],
    };
    for (const [k, [p, yaw, pitch]] of Object.entries(tp)) ctx.debug.register(`tp-${k}`, () => ctx.player.teleport(p, { yawDeg: yaw, pitchDeg: pitch }));
    ctx.debug.register('bump', () => ctx.player.teleport([1.0, 0, -11.55], { yawDeg: 0, pitchDeg: 0 }));
    ctx.debug.register('operate', () => ctx.player.teleport([RAIL.x + 0.75, 0, RAIL.sensorZ - 0.6], { yawDeg: -90, pitchDeg: -30 }));
    ctx.debug.register('stats', () => ({ region: st.region, mode: visor.mode, rays: lidar.raysLastFrame, pings: lidar.sonarPings, fusion: st.dark.fusion, locked: st.dark.locked, revealing: st.dark.revealing, modesSeen: [...modesSeen], rail: st.rail.state(), updateMs: +st.updMs.toFixed(3), updateMaxMs: +st.updMax.toFixed(3) }));

    // the island re-asserts its route objective on stamp / mode events: take ours back while inside
    const reassert = (): void => void ctx.after(0.3, () => refreshObjective(ctx));
    ctx.events.on('stamp:awarded', reassert);
    ctx.events.on('mode:changed', reassert);
    ctx.events.on('lang:changed', reassert);
    // after the Messstrecke's operate mode the visor status line comes back
    ctx.events.on('sensordom:status-refresh', () => {
      if (st.region === 'dome') ctx.ui.status(modeStatus(ctx));
    });

    S = st;
    ctx.onDispose(() => {
      st.probe.remove();
      sound.dispose();
      lidar.dispose();
      visor.dispose();
      disposeZoneMaterials();
    });
  },

  onEnter(ctx) {
    refreshObjective(ctx);
    // the zone's request (plan §3.2): the island's need in ≤ 12 words, EMI-02's first line on entry
    if (S && !ctx.progress.get('requested', false)) {
      ctx.progress.set('requested', true);
      void S.sd.emi.say(ctx.i18n.text('request'));
    }
  },

  onExit(ctx) {
    if (!S) return;
    ctx.hud.setObjective(null);
    setRegion(ctx, 'outside');
  },

  fixedUpdate(dt) {
    S?.rail.fixedUpdate(dt);
  },

  update(dt, ctx) {
    const st = S;
    if (!st) return;
    const t0 = performance.now();
    const { sd, lidar, visor } = { sd: st.sd, lidar: st.sd.lidar, visor: st.sd.visor };
    const now = ctx.time.elapsed;
    ctx.player.positionLocal(_feet);
    const region = regionOf(_feet);
    if (region !== st.region) setRegion(ctx, region);

    // landmark fan (0.5 rev/s)
    spinFan(st, dt);

    visor.update(now);
    st.curtains.update(dt, _feet);
    st.rings.update();
    st.labor.update(dt);
    st.kapsel.update(dt, _feet);
    st.dark.update(dt);
    st.rail.update(dt);
    if (region === 'dome') st.labor.tickDome(dt);

    // sensors
    const inside = region === 'dome' || region === 'darkroom';
    const scanning = inside && visor.mode === 'lidar';
    if (inside) {
      ctx.camera.getWorldPosition(_eye);
      ctx.toLocal(_eye, _loc);
      if (scanning) {
        lidar.syncMovers();
        lidar.scan(dt, _loc, now);
        if (region === 'darkroom' && st.dark.fusion && !st.dark.revealing) {
          ctx.camera.getWorldDirection(_dir).add(_eye);
          ctx.toLocal(_dir, _dir).sub(_loc);
          if (lidar.sonar(dt, _loc, Math.atan2(-_dir.x, -_dir.z), now)) sd.sound.sonarPip();
        }
      }
      // crosshair probe at 10 Hz
      st.probeAcc += dt;
      st.probe.el.style.display = ctx.player.operating ? 'none' : '';
      if (st.probeAcc > 0.1 && !ctx.player.operating) {
        st.probeAcc = 0;
        updateProbe(ctx, st);
      }
    }
    lidar.update(now);
    _head.copy(st.dome.headLocal);
    sd.sound.update({ inDome: inside, scanning, headWorld: ctx.toWorld(_head, _eye), fanAngle: st.fanAngle, playerLocal: _feet, headLocal: st.dome.headLocal });
    const ms = performance.now() - t0;
    st.updMs += (ms - st.updMs) * 0.05;
    if (ctx.time.frame % 300 === 0) st.updMax = 0;
    st.updMax = Math.max(st.updMax, ms);
  },

  updateFar(dt) {
    if (S) spinFan(S, dt);
  },

  dispose() {
    S = null;
  },
});

function spinFan(st: State, dt: number): void {
  st.fanAngle = (st.fanAngle + dt * Math.PI) % (Math.PI * 2);
  for (const p of st.dome.fanPivots) p.rotation.y = st.fanAngle;
}

function setRegion(ctx: ZoneContext, region: Region): void {
  const st = S!;
  const prev = st.region;
  st.region = region;
  const { visor } = st.sd;
  if (prev === 'darkroom') st.dark.leave();
  st.interiorExit?.();
  st.interiorExit = null;
  if (region === 'tunnel') st.interiorExit = ctx.env.enterInterior({ ambient: 0.5 });
  else if (region === 'dome') st.interiorExit = ctx.env.enterInterior({ ambient: 0.55, background: '#0c0a09' });
  else if (region === 'darkroom') st.interiorExit = ctx.env.enterInterior({ ambient: 0, background: '#000000' });

  const inside = region === 'dome' || region === 'darkroom';
  st.probe.el.style.display = inside ? '' : 'none';
  if (!inside) {
    if (visor.mode !== 'rgb') setMode(ctx, 'rgb', true);
    ctx.ui.status(null);
  }
  if (region === 'darkroom') st.dark.enter();
  else if (region === 'dome') {
    if (prev === 'darkroom' && !st.dark.revealing) setMode(ctx, st.sd.modesSeen.has('lidar') ? 'lidar' : 'rgb', true);
    ctx.ui.status(modeStatus(ctx));
    if (!st.greeted) {
      st.greeted = true;
      if (!ctx.progress.get('greeted', false) || !ctx.pass.has('messbrille')) {
        ctx.progress.set('greeted', true);
        // the request was the line on entry (≤ 25 words before the first input): a wave and the keys
        void st.sd.emi.gesture('wave');
      }
      ctx.ui.hint(ctx.i18n.text('hint.keys'), 7);
    }
  }
  refreshObjective(ctx);
}

function setMode(ctx: ZoneContext, m: VisorMode, force: boolean): void {
  const st = S;
  if (!st) return;
  const { visor, lidar, sound } = st.sd;
  if (!force) {
    if (st.region !== 'dome' && st.region !== 'darkroom') {
      ctx.ui.hint(ctx.i18n.text('hint.outside'), 2.5);
      return;
    }
    if (st.dark.locked && m !== 'lidar') {
      ctx.ui.hint(ctx.i18n.text('hint.locked'), 2.5);
      ctx.audio.play('error');
      return;
    }
  }
  if (m === visor.mode) return;
  const up = MODES.indexOf(m) > MODES.indexOf(visor.mode);
  visor.setMode(m, ctx.camera.getWorldPosition(_eye), ctx.time.elapsed);
  lidar.points.visible = m === 'lidar';
  if (m === 'lidar') lidar.clear();
  sound.modeClick(up);
  if (st.region === 'dome') {
    if (!st.sd.modesSeen.has(m)) {
      st.sd.modesSeen.add(m);
      ctx.progress.set('modesSeen', [...st.sd.modesSeen]);
    }
    ctx.ui.status(modeStatus(ctx));
  } else if (st.region === 'darkroom' && m === 'lidar') ctx.ui.status(ctx.i18n.text(st.dark.fusion ? 'status.fusion' : 'status.darkroom'));
  if (st.region === 'dome' || st.region === 'darkroom') updateProbe(ctx, st);
}

/** lazy status line: follows language changes */
function modeStatus(ctx: ZoneContext): (lang: string, mode: string) => string {
  return () => ctx.t('status.mode', { m: ctx.t(`mode.${S?.sd.visor.mode ?? 'rgb'}`) });
}

function refreshObjective(ctx: ZoneContext): void {
  const st = S;
  if (!st || !ctx.playerInside) return;
  const P = ctx.pass;
  const r = st.region;
  // Entscheider (D40 route): the ◆ Messstrecke only; A and B stay playable but are never the target
  if (ctx.mode === 'entscheider' && !(P.has('messstrecke') && P.has('messbrille') && P.has('dunkelkammer'))) {
    if (r === 'darkroom') ctx.hud.setObjective(ctx.i18n.text('objective.bExit'), { target: [ROOM.x1, 0, -16] });
    else if (P.has('messstrecke')) ctx.hud.setObjective(null);
    else if (r === 'outside' || r === 'tunnel') ctx.hud.setObjective(ctx.i18n.text('objective.enter'), { target: [0, 0, PORTAL.z0] });
    else ctx.hud.setObjective(ctx.i18n.text('objective.c'), { target: [RAIL.x + 1.4, 0, RAIL.sensorZ - 0.6] });
    return;
  }
  if (r === 'darkroom' && !P.has('dunkelkammer')) ctx.hud.setObjective(ctx.i18n.text('objective.bExit'), { target: [ROOM.x1, 0, -16] });
  else if (!P.has('messbrille')) {
    if (r === 'outside' || r === 'tunnel') ctx.hud.setObjective(ctx.i18n.text('objective.enter'), { target: [0, 0, PORTAL.z0] });
    else ctx.hud.setObjective(ctx.i18n.text('objective.a'), { target: [-5.4, 0, 3] });
  } else if (!P.has('dunkelkammer')) {
    if (r === 'darkroom') ctx.hud.setObjective(ctx.i18n.text('objective.bExit'), { target: [ROOM.x1, 0, -16] });
    else ctx.hud.setObjective(ctx.i18n.text('objective.b'), { target: [0, 0, ROOM.z1] });
  } else if (!P.has('messstrecke')) ctx.hud.setObjective(ctx.i18n.text('objective.c'), { target: [RAIL.x + 1.4, 0, RAIL.sensorZ - 0.6] });
  else {
    // all three stamps: hand the objective back to the island's route (next zone)
    ctx.hud.setObjective(null);
    if (!ctx.progress.get('doneToast', false)) {
      ctx.progress.set('doneToast', true);
      ctx.hud.toast(ctx.i18n.text('objective.done'), { kind: 'success', duration: 5 });
    }
  }
}

function updateProbe(ctx: ZoneContext, st: State): void {
  const { lidar, visor } = st.sd;
  const mode = visor.mode;
  ctx.camera.getWorldPosition(_eye);
  ctx.toLocal(_eye, _loc);
  ctx.camera.getWorldDirection(_dir).add(_eye);
  ctx.toLocal(_dir, _dir).sub(_loc).normalize();
  const hit = lidar.probe(_loc, _dir, PROBE_MASK[mode] ?? MASK_ALL, _hit);
  if (hit) st.kapsel.probed(hit.info?.target, mode, hit.distance);
  const t = (k: string, p?: Record<string, string | number>): string => ctx.t(k, p);
  let v = t('probe.empty');
  if (hit) {
    const info = hit.info;
    switch (mode) {
      case 'rgb':
        if (info?.depth === 'mirror') v = t('probe.mirror');
        else if (info?.contrast != null) v = info.contrast <= 2 ? t('probe.rgbDark', { c: info.contrast }) : info.contrast <= 6 ? t('probe.rgbLow', { c: info.contrast }) : t('probe.rgb', { c: info.contrast });
        break;
      case 'tiefe': {
        if (info?.depth === 'none' || hit.reported < 0) v = t('probe.none');
        else if (hit.reported > 12) v = t('probe.range');
        else {
          const z = hit.reported;
          const s = sigmaMm(z, false); // mm, the Messstrecke's toy model σ(z) = 2 mm · z²
          const g = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
          const sTxt = s >= 10 ? `${ctx.i18n.num(s / 10, 1)} cm` : `${ctx.i18n.num(s, 1)} mm`;
          v = t('probe.depth', { d: ctx.i18n.num(z + (g * s) / 1000, 3), s: sTxt });
        }
        break;
      }
      case 'lidar':
        v = hit.reported > 0 ? t('probe.lidar', { d: ctx.i18n.num(hit.reported, 2) }) : t('probe.none');
        break;
      case 'seg':
        v = t('probe.seg', { c: t(`seg.${info?.seg === 'unsichtbar' ? 'unbekannt' : (info?.seg ?? 'unbekannt')}`) });
        break;
    }
  }
  st.probe.set(v);
}
