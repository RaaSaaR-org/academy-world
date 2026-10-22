/**
 * „Entdecken“ (Discover) — the 3D path's core (WP-D0, plan §1.2–§1.5). Game imports this chunk next to
 * Rapier and the world when ?discover=1 and calls the DiscoverBoot hooks below:
 *   beforeCore  the in-memory save, in-memory settings, the render options (half-float fallback)
 *   afterCore   the tier (before the warm-up), the reachable areas (locked), the player as an observer,
 *               Discover's own zone context, the layer (top bar, sheet, menu), camera and gestures
 *   place       the start card's camera (the slow orbit of ATTRACT_CAMERA) instead of the player's spawn
 *   start       the packages' install.ts, the start card, the probe, the crash marker, the test hooks
 * Packages plug in through src/discover/<pkg>/install.ts (types.ts explains the contract).
 */
import './discover.css';
import * as THREE from 'three';
import type { Game } from '@/core/Game';
import type { Lang } from '@/core/types';
import { registerDebugExt } from '@/core/DebugApi';
import { AREA_MANIFESTS } from '@/core/zones/ZoneManager';
import { createZoneContext } from '@/core/zones/createZoneContext';
import type { ZoneManifest } from '@/core/zones/types';
import { openCredits } from '@/ui/Credits';
import { ATTRACT_CAMERA } from '@/world/layout';
import type { DiscoverHandle, DiscoverInstall, DiscoverParams, DiscoverTier, StillsReason, TourStop } from './types';
import { Modes } from './modes';
import { CameraImpl, orbitFrom } from './camera';
import { ObserverImpl } from './observer';
import { GesturesImpl } from './touch';
import { PerfMonitorImpl, mountReadout } from './perf';
import { runBench } from './bench';
import { discoverSave } from './save';
import { discoverTier, halfFloatTargets, renderTier } from './tier';
import { spikeStops, spikeTour } from './spike';
import { MemorySettings } from './settings';
import { S } from './strings';
import { PROBE, judgeProbe, markAlive, switchToStills, watchAlive, type ProbeResult } from './detect';
import { createShell, settingsItems, wireKeys, type Shell } from './ui/shell';
import { offerBar, startCard, type StartCard } from './ui/start';
import { showLaptopCard } from './ui/laptop';

/** src/discover/<pkg>/install.ts of D1–D3, in path order (film, tour, viewer) */
const INSTALLS = import.meta.glob<{ default: DiscoverInstall }>('./*/install.ts', { eager: true });

/** the areas Discover loads (plan §1.3): the six lobes, the hall, the two sites with stops */
const DISCOVER_AREAS = new Set(['schauhalle', 'sonnenacker', 'traumhangar']);
/** just beyond the Regelgarten duck station's prewarm radius (55 m; tools/discover/boot.mjs checks 0 MuJoCo requests) */
const REGELGARTEN_NO_PREWARM = 56;
export const discoverReachable = (a: Pick<ZoneManifest, 'id' | 'kind'>): boolean => a.kind === 'lobe' || DISCOVER_AREAS.has(a.id);

interface Core {
  h: DiscoverHandle;
  shell: Shell;
  camera: CameraImpl;
  observer: ObserverImpl;
  perf: PerfMonitorImpl;
  settings: MemorySettings;
  modes: Modes;
  tier: DiscoverTier;
  start: StartCard | null;
  probe: ProbeResult | null;
  started: boolean;
}
let core: Core | null = null;
let tier: DiscoverTier | null = null;

interface GateInfo {
  stills?: StillsReason | null;
  crash?: { stop: string | null; t: number } | null;
}
const gate = (): GateInfo => (window as unknown as { __emaiGate?: GateInfo }).__emaiGate ?? {};
const urlFlag = (name: string): string | null => new URLSearchParams(location.search).get(name);

// ── DiscoverBoot ───────────────────────────────────────────────────────────────────────────────

export function beforeCore(game: Game): void {
  game.progress.adoptMemory(discoverSave(AREA_MANIFESTS.values()));
  // settings for this session only (persist = false): never written
  const portrait = window.innerHeight > window.innerWidth;
  game.settings.set('headBob', false, false);
  game.settings.set('fov', portrait ? 68 : 55, false);
  game.settings.set('volEmi', 0, false);
  tier = discoverTier(game.params);
  if (!halfFloatTargets()) game.renderOptions = { frameBufferType: THREE.UnsignedByteType };
  document.documentElement.classList.add('dsc-on');
}

export function afterCore(game: Game): void {
  const t = tier!;
  game.rs.setTier(renderTier(t, game.rs.rendererName));
  game.frameCapMs = t.fpsCap ? 1000 / t.fpsCap : 0;
  game.zones.tierScale = t.lodScale;
  game.zones.setReachable(discoverReachable, { lock: true });
  // plan §1.3 „MuJoCo and duck worker: never“: the duck station prewarms within 55 m of the Regelgarten's
  // anchor (src/zones/regelgarten/tuning.ts WORKER.prewarmDistance) and the hall stop is 42 m from it
  game.zones.distanceFloor.set('regelgarten', REGELGARTEN_NO_PREWARM);
  game.player.collider.setEnabled(false);
  game.player.gravityScale = 0;
  game.hud.root.classList.add('discover');

  const settings = new MemorySettings();
  game.settings.set('reducedMotion', settings.reducedMotion, false);
  settings.onChange(() => {
    game.settings.set('reducedMotion', settings.reducedMotion, false);
    game.audio.setMuted(!settings.sound || game.params.mute);
  });
  const setLang = (l: Lang): void => game.setLang(l, false);
  const shell = createShell(game.hud.root.parentElement ?? document.body, game.hud.root, game.i18n, { setLang, settings });
  const layout = { anchor: new THREE.Vector3(0, 0, 0), facing: 0, radius: 1, groundY: 0, isFallback: false };
  const { ctx } = createZoneContext(game, 'discover', { de: 'Entdecken', en: 'Discover' }, layout, game.rs.scene);
  const observer = new ObserverImpl(game);
  const camera = new CameraImpl(game, observer, shell.ui, () => settings.reducedMotion, (x, z) => {
    try {
      return ctx.frames.ground ? ctx.frames.heightAt(x, z) : null;
    } catch {
      return null;
    }
  });
  const gestures = new GesturesImpl(game.rs.canvas, camera, shell.nav);
  const perf = new PerfMonitorImpl(game, t, gate().crash ?? null);
  const modes = new Modes();
  const params: DiscoverParams = { perf: game.params.perf, bench: game.params.bench, stop: game.params.stop, robot: urlFlag('robot'), lang: game.params.lang };
  const h: DiscoverHandle = {
    game,
    ctx,
    tier: t,
    params,
    text: game.i18n,
    camera,
    observer,
    gestures,
    sheet: shell.sheet,
    topbar: shell.topbar,
    menu: shell.menu,
    ui: shell.ui,
    perf,
    modes,
    settings,
    setLang,
    setStop(id) {
      perf.stop = id;
      markAlive(id);
    },
    async ensureAreas(ids) {
      for (const id of ids) {
        const rec = await game.zones.initOne(id);
        if (rec?.status === 'ready' && rec.ctx) await game.rs.warmUp({ root: rec.ctx.root });
      }
    },
    warm(root) {
      return game.rs.warmUp({ root: root ?? game.rs.scene });
    },
    voice(on) {
      game.settings.set('volEmi', on ? 1 : 0, false);
    },
  };
  core = { h, shell, camera, observer, perf, settings, modes, tier: t, start: null, probe: null, started: false };
  wireKeys(shell, () => game.hud.modals.isOpen);
  gestures.onDoubleTap(() => camera.reset());
  // the first tap starts the sound (browsers need a gesture)
  window.addEventListener('pointerdown', () => game.audio.unlock(), { once: true, capture: true });
  camera.attach();
}

/** The start card's camera: the title's slow orbit (ATTRACT_CAMERA), off under reduced motion. */
export function place(game: Game): void {
  const c = core!;
  const a = ATTRACT_CAMERA;
  const ang = a.startDeg * (Math.PI / 180);
  const eye = [a.target[0] + Math.sin(ang) * a.radius, a.target[1] + a.height, a.target[2] + Math.cos(ang) * a.radius] as const;
  c.camera.setRig(orbitFrom(eye, a.target, { limits: { pitchDeg: [-30, 5], distance: [a.radius * 0.6, a.radius * 1.4] } }));
  c.camera.drift = (a.speed * 180) / Math.PI;
  game.requestRender(2);
}

export async function start(game: Game): Promise<void> {
  const c = core!;
  const { h, shell, perf, modes } = c;
  // D1–D3
  for (const [path, mod] of Object.entries(INSTALLS).sort(([a], [b]) => a.localeCompare(b))) {
    try {
      await mod.default(h);
    } catch (err) {
      console.error(`[discover] ${path} failed to install`, err);
    }
  }
  // the spike tour until D1's lands
  const spike = spikeTour(h);
  if (!modes.has('tour')) modes.register('tour', spike);
  const stops = (): readonly TourStop[] => h.stops?.() ?? spikeStops(h);
  const goto = (id: string): Promise<void> => (h.goto ? h.goto(id) : modes.current === 'tour' ? spike.goto(id) : modes.enter('tour', { stop: id }));

  // menu
  for (const it of settingsItems(c.settings)) h.menu.add(it);
  h.menu.add({ id: 'laptop', order: 30, label: S.playOnLaptop, onSelect: () => void (h.share ? h.share({ kind: 'game' }) : showLaptopCard(h.sheet, h.ui)) });
  h.menu.add({ id: 'credits', order: 80, label: S.credits, onSelect: () => void openCredits() });
  const bench = (): Promise<unknown> => {
    hideStart();
    return runBench(h, perf, stops, goto);
  };
  if (h.params.perf) h.menu.add({ id: 'measure', order: 90, label: S.measure, onSelect: () => void bench() });
  if (h.params.perf) mountReadout(shell.root, perf, h.text);

  // the crash marker: this 3D session is alive until pagehide
  watchAlive(() => perf.stop);

  const go = async (stop?: string): Promise<void> => {
    hideStart();
    c.camera.drift = 0;
    c.started = true;
    await modes.enter('tour', stop ? { stop } : {});
  };
  function hideStart(): void {
    c.start?.hide();
    c.camera.drift = 0;
  }

  // test hooks (tools/discover-check.mjs) and the page-level API both paths share
  const api = {
    path: '3d' as const,
    handle: h,
    state: () => ({
      path: '3d',
      started: c.started,
      startCard: !!c.start?.shown,
      mode: modes.current,
      stop: perf.stop,
      snap: h.sheet.snap,
      card: h.sheet.card?.id ?? null,
      flying: h.camera.flying,
      observer: h.observer.mode,
      feet: h.observer.feet,
      tier: c.tier.name,
      lang: h.text.lang,
      ready: game.ready,
      probe: c.probe,
      stills: null,
    }),
    stops: () => stops().map((s) => ({ id: s.id, title: h.text.resolve(s.title), areas: [...s.areas] })),
    goto: async (id: string) => {
      if (!c.started) await go(id);
      else await goto(id);
    },
    start: () => go(),
    perf: () => perf.stats(),
    bench,
    probe: () => c.probe,
  };
  (window as unknown as { __discover?: unknown }).__discover = api;
  registerDebugExt('discover:state', api.state);
  registerDebugExt('discover:goto', ((id: string) => api.goto(id)) as never);
  registerDebugExt('discover:stops', api.stops);
  registerDebugExt('discover:perf', api.perf);
  registerDebugExt('discover:bench', api.bench);
  registerDebugExt('discover:probe', api.probe);

  if (h.params.stop) {
    await go(h.params.stop);
    return;
  }
  c.start = startCard(shell.root, h.text, {
    eyebrow: { key: 'core.start.kicker' },
    title: S.discover,
    body: { key: 'core.start.subtitle' },
    note: S.laptopNote,
    onGo: () => void go(),
    onBench: h.params.bench ? () => void bench() : undefined,
  });
  h.topbar.setStep(0, 0, S.discover);
  runProbe(c);
}

/** Founder decision 3: 3 s of frames after the start card; p90 > 50 ms offers the picture tour, > 80 ms switches. */
function runProbe(c: Core): void {
  const forced3d = urlFlag('stills') === '0';
  window.setTimeout(() => {
    if (document.visibilityState !== 'visible') return;
    c.probe = judgeProbe(c.perf.intervals(PROBE.ms));
    c.perf.probe = c.probe;
    if (forced3d || c.probe.verdict === 'ok') return;
    if (c.probe.verdict === 'switch') switchToStills();
    else offerBar(c.shell.root, c.h.text, switchToStills);
  }, PROBE.ms);
}
