import * as THREE from 'three';
import { EventBus } from './EventBus';
import { Settings } from './Settings';
import { parseParams, type LaunchParams } from './params';
import { AUTO_QUALITY, RenderSystem } from './RenderSystem';
import { Environment } from './Environment';
import { Physics, GROUPS, GROUP, groups, isSensorIgnore } from './Physics';
import { Input } from './Input';
import { MaterialLibrary } from './brand/materials';
import { Assets } from './Assets';
import { Text3DFactory } from './Text3D';
import { Scheduler } from './Scheduler';
import { sessionLoad, sessionSave } from './storage';
import type { Lang, Mode, QualitySetting } from './types';
import { I18n } from '@/i18n/I18n';
import { coreStrings } from '@/i18n/core';
import { AudioSystem } from '@/systems/Audio';
import { Progress } from '@/systems/Progress';
import { Player } from '@/systems/Player';
import { InteractionSystem } from '@/systems/Interaction';
import { GrabSystem } from '@/systems/Grab';
import { LightPool } from '@/systems/LightPool';
import { Hud } from '@/ui/Hud';
import { InfoCards } from '@/ui/Modals';
import { PassPanel, passMark } from '@/ui/PassPanel';
import { PauseMenu } from '@/ui/PauseMenu';
import { StartScreen } from '@/ui/StartScreen';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { DebugOverlay } from '@/ui/DebugOverlay';
import { h } from '@/ui/dom';
import { AREA_MANIFESTS, ZoneManager, idleSlot, titleOf } from './zones/ZoneManager';
import { createZoneContext } from './zones/createZoneContext';
import type { ZoneDefinition, ZoneLayout } from './zones/types';
import { ATTRACT_CAMERA, FLIGHT, HUB, ISLAND, rescuePoint, zoneInPhrase } from '@/world/layout';
import { installDebugApi } from './DebugApi';
import { setYieldHook } from './freeze';
import { importRetry } from './retry';
import { OperateManager } from './Operate';
import { EmiSystem } from './emi/EmiSystem';
import { MapPanel } from '@/ui/MapPanel';
import { GameLayer } from '@/systems/GameLayer';
import { gameStrings } from '@/i18n/game';
import type { ZoneInstance } from './zones/types';
import { migrateAtBoot } from '@/systems/migrate';
import { RETIRED } from '@/systems/retired';
import { resumePlan, titleState, type ResumeInput, type ResumePlan } from './quest/resume';
import { installQuest, type QuestSpine } from './quest';
import { installFrames } from './zones/ext/frames';
import { installRobots, type RobotsAdapter } from './zones/ext/robots';
import { Frames } from './zones/frames';
import type { PlotFrame } from './zones/manifest';

export type Phase = 'loading' | 'start' | 'playing' | 'paused';
const FIXED = 1 / 60;
/** C4: full-screen panels that stop game time (simulation, EMI's lines, run clocks, banner timers). Operate mode and custom modals keep running. */
const FROZEN_KINDS = new Set(['pass', 'map', 'infocard', 'predict', 'credits']);

/**
 * Engine orchestrator: boot sequence, game loop (fixed-step physics + interpolated
 * render), phases (loading → start → playing ⇄ paused), pointer-lock policy,
 * teleport/respawn, and the services handed to zones.
 */
export class Game {
  readonly params: LaunchParams = parseParams();
  readonly events = new EventBus();
  readonly settings = new Settings(this.events);
  /** created in the constructor, after the boot migration (plan §3.5) */
  readonly progress: Progress;
  readonly i18n: I18n;
  readonly audio = new AudioSystem();
  readonly scheduler = new Scheduler();
  readonly loading = new LoadingScreen();
  readonly time = { elapsed: 0, dt: 0, frame: 0 };
  phase: Phase = 'loading';
  ready = false;
  debugEnabled: boolean;

  // created during boot
  rs!: RenderSystem;
  env!: Environment;
  physics!: Physics;
  input!: Input;
  player!: Player;
  interaction!: InteractionSystem;
  grab!: GrabSystem;
  lights!: LightPool;
  materials!: MaterialLibrary;
  assets!: Assets;
  text3d!: Text3DFactory;
  hud!: Hud;
  infoCards!: InfoCards;
  pass!: PassPanel;
  pauseMenu!: PauseMenu;
  startScreen!: StartScreen;
  zones!: ZoneManager;
  operate!: OperateManager;
  emis!: EmiSystem;
  map!: MapPanel;
  /** ctx.game: challenges, stars, result banner, juice, capsules, skills (docs/FUN-PLAN.md §4) */
  gameLayer!: GameLayer;
  /** ctx.quest (Phase 7 plan §3.1, WP1): the systems derived from stamps and manifests */
  quest!: QuestSpine;
  /** Phase 7 (plan §5.3, WP4): the ground frame and the one altitude setter */
  frames!: Frames;
  /** Phase 7 (plan §5.6, WP4): ctx.robots' queue, LOD tracking and clips (per frame) */
  robots!: RobotsAdapter;
  /** deterministic test hooks registered by zones: '<zoneId>:<name>' → fn */
  readonly debugActions = new Map<string, () => unknown>();
  vignetteExtra = 0;
  /** __academy.grabNearest(): keep holding without F/right mouse until release()/throw() */
  scriptedGrab = false;
  debugOverlay: DebugOverlay | null = null;
  worldStatus: { status: 'ready' | 'error' | 'skipped' | 'pending'; error: string | null } = { status: 'pending', error: null };
  private worldDef: ZoneDefinition | null = null;
  private worldCtx: import('./zones/types').ZoneContext | null = null;
  private worldInstance: ZoneInstance | null = null;
  private worldState: import('./zones/createZoneContext').ZoneRuntimeState | null = null;

  private acc = 0;
  private alpha = 0;
  private last = 0;
  private attractT = 0;
  private grabLatch = false;
  private surfaceTimer = 0;
  private respawning = false;
  private framesSinceReady = 0;
  private fatal = false;
  /** C12a: the WebGL context is lost (the loop does nothing until it is restored) */
  private contextLost = false;
  private lostTimer = 0;
  private resumeAfterRestore = false;
  /** C9: frames still to draw while paused / frozen (then the loop skips its work) */
  private renderFrames = 0;
  private wasIdle = false;
  private oddFrame = false;

  constructor(private app: HTMLElement) {
    // boot hook (plan §3.5): the save migration runs before any reader, with the manifests already known
    migrateAtBoot([...AREA_MANIFESTS.values()], RETIRED);
    this.progress = new Progress(this.events);
    // stamp scopes (plan §3.4): 'island' = the areas of kind 'lobe' (dev zones without a manifest count as lobes)
    this.progress.areaKind = (id) => AREA_MANIFESTS.get(id)?.kind ?? 'lobe';
    this.debugEnabled = this.params.debug;
    if (this.params.reset) this.progress.reset();
    const lang: Lang = this.params.lang ?? this.settings.data.lang;
    this.i18n = new I18n(lang, () => this.progress.mode);
    document.documentElement.lang = lang;
    this.i18n.registerStrings('core', coreStrings);
    this.i18n.registerStrings('core.game', gameStrings);
    if (this.params.mode) this.progress.setMode(this.params.mode);
    if (this.params.mute) this.audio.setMuted(true);
    this.audio.setVolume(this.settings.data.volume);
    // C8: the loading screen adopts the shell index.html already painted (moving it would restart its fade-in)
    if (!this.loading.root.isConnected) app.appendChild(this.loading.root);
    setYieldHook(() => this.loading.tick());
    // mode changes re-render mode-dependent strings
    this.events.on('mode:changed', () => this.i18n.refresh());
  }

  get camera(): THREE.PerspectiveCamera {
    return this.rs.camera;
  }

  /** C4: the Pass, the map, an info card or a prediction is on top — game time stands still. */
  get frozen(): boolean {
    const top = this.hud?.modals.top;
    return !!top && FROZEN_KINDS.has(top.kind);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  BOOT
  // ════════════════════════════════════════════════════════════════════════

  async boot(): Promise<void> {
    // bar steps are weighted by what they download / build (C13): Rapier + its wasm are the bulk
    const L = (p: number, key: string, next?: number): void => this.loading.set(p, this.i18n.t(`core.loading.${key}`), next);
    // C13: the two big downloads (Rapier + wasm, the island chunk) start at once, in parallel with the font wait
    const rapierP = importRetry(() => import('@dimforge/rapier3d-compat')).then(async (m) => {
      await m.default.init();
      return m.default;
    });
    const worldP = this.params.world ? importRetry(() => import('@/world/index')) : null;
    rapierP.catch(() => undefined); // awaited (and reported) below
    worldP?.catch(() => undefined); // loadWorld() falls back to the emergency ground
    try {
      L(0.02, 'fonts', 0.06);
      await Promise.race([
        Promise.all([
          document.fonts.load('700 32px "Space Grotesk"'),
          document.fonts.load('400 16px "Geist"'),
          document.fonts.load('600 16px "Geist"'),
          document.fonts.load('500 12px "Geist Mono"'),
        ]),
        wait(2500),
      ]).catch(() => undefined);

      L(0.06, 'physics', 0.56);
      const RAPIER = await this.creep(rapierP);

      L(0.56, 'renderer', 0.6);
      this.createCore(RAPIER);

      // plan §5.6: the area manifests are eager, so the island module reads them (names, glyphs,
      // railing gaps) via ctx.zones.list() during its init; area code loads later (the queue)
      this.zones.discover();
      const textPreload = this.text3d.preload();
      // C13: zones init after the title (initZonesDeferred); a deep link's or the resume area's code
      // downloads while the island builds, and that zone is built before the title
      const eager = this.eagerZones();
      for (const id of eager) void this.zones.ensureImported(id);

      L(0.6, 'world', 0.9);
      await this.loadWorld(worldP);

      if (eager.length) {
        L(0.9, 'zones', 0.93);
        for (const id of eager) await this.zones.initOne(id);
      }

      L(0.93, 'shaders', 1);
      await textPreload;
      this.placeInitialPlayer();
      await this.warmUp();
      L(1, 'ready');
    } catch (err) {
      this.fatal = true;
      console.error('[boot] fatal', err);
      this.showBootError(err);
      return;
    }

    this.loading.done();
    if (this.params.skipIntro) this.beginPlay(this.progress.mode, false);
    else {
      this.phase = 'start';
      this.startScreen.show();
      this.hud.setPlaying(false);
    }
    void this.initZonesDeferred().then(() => {
      // C10: once the zones are built, the auto controller measures a few seconds of the title at full frame rate
      if (this.phase === 'start' && this.rs.setting === 'auto') this.rs.probeUntil = performance.now() + AUTO_QUALITY.probeMs;
    });
  }

  /** The loading bar creeps toward the next step while a long download runs. */
  private async creep<T>(p: Promise<T>): Promise<T> {
    const iv = window.setInterval(() => this.loading.tick(0.12), 300);
    try {
      return await p;
    } finally {
      window.clearInterval(iv);
    }
  }

  /** Zones whose plot holds the first spawn (?zone=, ?pos=, a dev reload, D13's resume gate): built before the title. */
  private eagerZones(): string[] {
    const p = this.params;
    const ids = new Set<string>();
    if (p.zone && this.zones.loadable(p.zone)) ids.add(p.zone);
    // D13: a returning visitor starts at the gate of the zone entered last
    const back = this.returnPlan().zone;
    if (back && this.zones.loadable(back)) ids.add(back);
    let pos: THREE.Vector3 | null = p.pos ? new THREE.Vector3(...p.pos) : null;
    if (!pos && !p.zone && import.meta.env.DEV && navigationType() === 'reload') {
      const saved = sessionLoad<{ p: [number, number, number] } | null>('devpos', null);
      if (saved && saved.p.every(Number.isFinite)) pos = new THREE.Vector3(...saved.p);
    }
    if (pos)
      for (const rec of this.zones.records.values()) {
        if (!this.zones.loadable(rec.id)) continue;
        const a = rec.layout?.anchor;
        if (a && Math.hypot(pos.x - a.x, pos.z - a.z) <= rec.layout!.radius + 12) ids.add(rec.id);
      }
    return [...ids];
  }

  /**
   * true once the eager set has settled (deferred, C13; plan §5.6): every area the boot loads on its
   * own — the resume / deep-link area before the title, the reachable areas (lobes, halls) after it.
   * __academy.ready and game:ready wait for it; sites wait for setReachable or __academy.loadAll().
   */
  private zonesSettled = false;

  /**
   * C13 (PL-08 step 1) + plan §5.6: area code downloads after the title is up, nearest to the spawn
   * first (≤ 2 at once); inits run one per idle slot; each zone's programs are compiled right after its
   * init. A plot keeps its placeholder until its zone is ready (world/placeholders.ts listens to zone:ready).
   */
  private async initZonesDeferred(): Promise<void> {
    try {
      // the title paints first: area code starts downloading in the first idle slot after it
      await idleSlot();
      await this.zones.loadReachable(this.player.feet.clone());
      // C10: the cloud sea's other quality variants, so auto quality never compiles them mid-play
      if (!this.fatal) await this.rs.warmUp({ root: this.env.cloudVariants() });
    } catch (err) {
      console.error('[zones] deferred init failed', err);
    } finally {
      this.zonesSettled = true;
    }
  }

  private createCore(RAPIER: typeof import('@dimforge/rapier3d-compat').default): void {
    const canvas = h('canvas', { id: 'game', tabindex: '0' });
    this.app.prepend(canvas);
    this.rs = new RenderSystem(canvas, this.events);
    this.rs.applyQualitySetting(this.params.quality ?? this.settings.data.quality);
    this.materials = new MaterialLibrary(this.rs.maxAnisotropy);
    this.env = new Environment(this.rs);
    this.physics = new Physics(RAPIER);
    this.physics.killY = ISLAND.killY - 30;
    // plan §5.3: physics lives in the docked frame; Frames converts objects of the lifted ground
    this.frames = new Frames(this);
    this.physics.dockedWorld = (o, out) => this.frames.dockedWorld(o, out);
    this.input = new Input(canvas);
    this.player = new Player(this.physics, this.input, this.audio, this.settings, this.events, this.rs.camera);
    this.interaction = new InteractionSystem(this.physics);
    this.grab = new GrabSystem(this.physics, this.player, this.audio, this.events, this.rs.camera);
    this.lights = new LightPool(this.rs.scene);
    this.assets = new Assets();
    this.text3d = new Text3DFactory(this.i18n, this.materials);

    this.hud = new Hud(this.i18n, this.audio);
    this.app.appendChild(this.hud.root);
    // the tower on the compass: the mark icon at the hub (ART-V2 §5.2)
    this.hud.compass.setTower(new THREE.Vector3(...(HUB.anchor as [number, number, number])));
    this.hud.setPlaying(false);
    this.infoCards = new InfoCards(this.hud.modals, this.i18n, this.audio, () => this.progress.mode);
    this.infoCards.userActive = () => performance.now() - this.input.lastInputAt < 800;
    this.pass = new PassPanel(
      this.hud.modals,
      this.i18n,
      this.progress,
      this.audio,
      () => (this.zones ? this.zones.manifests().map((z) => ({ id: z.id, name: z.name, eyebrow: z.eyebrow, number: z.number, glyph: z.glyph })) : []),
      () => this.gameLayer?.passView() ?? null,
    );
    this.pauseMenu = new PauseMenu(this.hud.modals, this.i18n, this.settings, this.progress, this.audio, {
      resume: () => this.resume(),
      openPass: () => this.pass.open(),
      // UX-23: the plaza south of the tower, facing it (the Landedeck spawn is 95 m further south)
      toHub: () => {
        this.resume();
        void this.teleportWorld(new THREE.Vector3(0, 0, 26), 0, 0, true);
      },
      setLang: (l) => this.setLang(l),
      setMode: (m) => this.progress.setMode(m),
      setQuality: (q) => this.setQuality(q),
      resetProgress: () => {
        this.progress.reset();
        this.hud.toast({ key: 'core.pause.resetDone' });
      },
      currentQualityLabel: () => `${this.rs.level.toUpperCase()}${this.rs.setting === 'auto' ? ` · AUTO${this.rs.renderScale < 0.999 ? ` · ${Math.round(this.rs.renderScale * 100)} %` : ''}` : ''}`,
      hasGrabbables: () => [...this.physics.dynamics].some((d) => d.grabbable && !d.removed && !d.owner.startsWith('_')),
    });
    this.startScreen = new StartScreen(this.i18n, this.audio, this.progress.mode, {
      start: (mode, o) => this.beginPlay(mode, true, { approach: !!o?.approach }),
      setLang: (l) => this.setLang(l),
      stamps: () => titleState(this.resumeInput()).stamps,
      // D13: „Weiterspielen“ whenever anything was earned; „Anflug ansehen“ once Start skips the ascent
      hasProgress: () => titleState(this.resumeInput()).hasProgress,
      skipsAscent: () => titleState(this.resumeInput()).offersApproach,
    });
    this.startScreen.root.classList.add('hidden');
    this.hud.root.appendChild(this.startScreen.root);
    this.zones = new ZoneManager(this);
    // Phase 7 packages register their context extensions before the first context (the island module's) is made
    this.quest = installQuest({ progress: this.progress, events: this.events, params: this.params, manifests: AREA_MANIFESTS.values() });
    installFrames(this);
    this.robots = installRobots(this);
    // plan §5.6, §2.6: ground areas (sites) load once the Revier is open (≥ 1 rotor, grounded); islands always
    let regionOpen = this.quest.snapshot().regionOpen;
    const reachable = (a: { kind: string }): boolean => a.kind !== 'site' || regionOpen;
    this.zones.setReachable(reachable);
    this.quest.onChange((q) => {
      if (q.regionOpen === regionOpen) return;
      regionOpen = q.regionOpen;
      this.zones.setReachable(reachable);
    });
    // the first fan-out: docked at h = 0, or an airborne save at the level-off (§1.5)
    this.frames.start(this.quest.snapshot().flight.state === 'airborne' ? FLIGHT.levelOff : 0);
    this.operate = new OperateManager(this);
    this.emis = new EmiSystem(this);
    this.gameLayer = new GameLayer(this);
    this.map = new MapPanel(this);
    this.debugOverlay = new DebugOverlay(this);
    this.debugOverlay.setEnabled(this.debugEnabled);

    // world labels behind walls fade out (QA-10): one ray per visible label at ≈ 10 Hz against static
    // and kinematic colliders; glass (SENSOR_IGNORE) does not hide a label, and the last 0.8 m before the label is ignored
    // (labels sit on their own consoles)
    {
      const R = this.physics.R;
      const ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
      // static AND kinematic colliders occlude (moving walls such as the Prüffeld's Messzelle are kinematic)
      const flags = R.QueryFilterFlags.EXCLUDE_SENSORS | R.QueryFilterFlags.EXCLUDE_DYNAMIC;
      const notGlass = (c: import('@dimforge/rapier3d-compat').Collider): boolean => !isSensorIgnore(c.collisionGroups());
      this.hud.labels.occlusionTest = (a, b) => {
        const dx = b.x - a.x,
          dy = b.y - a.y,
          dz = b.z - a.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < 1.2) return false;
        ray.origin = { x: a.x, y: a.y, z: a.z };
        ray.dir = { x: dx / d, y: dy / d, z: dz / d };
        const hit = this.physics.world.castRay(ray, d - 0.8, true, flags, undefined, this.player.collider, undefined, notGlass);
        return !!hit;
      };
    }
    this.wireEvents(canvas);
    installDebugApi(this);
    this.rs.renderer.setAnimationLoop(this.frame);
  }

  private wireEvents(canvas: HTMLCanvasElement): void {
    // modal ⇄ pointer lock policy
    this.hud.modals.onChange = (open) => {
      this.requestRender(2);
      if (open) {
        // piloting (enterOperate({ capture: { pointerLock } })): the mouse stays captured for the station's look
        if (!(this.operate.capturesPointer && this.hud.modals.top?.kind === 'operate')) this.input.releaseLock(true);
        if (this.grab.held) this.grab.release(true);
        this.hud.dialogue.root.style.opacity = '';
      } else if (this.phase === 'playing') this.captureMouse();
    };
    this.input.onLockChanged((locked) => {
      // modal → modal in one tick (Kielraum F2 protocol → predict, F3 sign → „Ein Jahr später"): closing
      // A requests the lock (async), B opens before it is granted (B's releaseLock is a no-op then), and
      // the late grant would hide the cursor over B's buttons. A modal is open: hand the cursor back.
      if (locked) {
        if (this.hud.modals.isOpen && !(this.operate.capturesPointer && this.hud.modals.top?.kind === 'operate')) this.input.releaseLock(true);
        return;
      }
      // piloting: losing the mouse (Esc) leaves operate mode, like Esc does without capture (a card on top releases it on purpose)
      if (this.operate.capturesPointer && !this.input.expectingUnlock) {
        this.operate.exit();
        return;
      }
      if (this.phase !== 'playing') return;
      if (this.input.expectingUnlock || this.hud.modals.isOpen) return;
      this.pause(); // user pressed Esc (or the browser released the lock)
    });
    this.input.onKey((code, e) => {
      // piloting: a captured key belongs to the station (ctx.input / its onKey handlers), not to the engine
      if (this.operate.captures(code)) return;
      // game layer first: R (retry) / H (why) / Enter while the result banner or fail flash is up, any
      // key skips a countdown. Works in operate mode (a passthrough modal), never over real modals.
      if (!e.repeat && this.phase === 'playing' && (!this.hud.modals.isOpen || this.hud.modals.top?.kind === 'operate') && this.gameLayer.handleKey(code)) {
        this.input.consume(code);
        this.input.consumeEvent(e);
        return;
      }
      // modal key routing happens on the raw keydown (needs user activation for re-locking)
      if (this.hud.modals.isOpen) {
        if (this.hud.modals.handleKey(code)) this.input.consume(code);
        return;
      }
      if (this.phase !== 'playing') return;
      if (code === 'Escape' && !this.input.locked) {
        this.input.consume(code);
        this.pause();
      } else if (code === 'Tab') {
        this.input.consume(code);
        this.pass.open();
      } else if (code === 'KeyM') {
        this.events.emit('map:toggle');
        this.map.toggle();
      } else if (code === 'KeyH') {
        // help key: the nearest EMI explains the current station (zones answer via emi.onAsk)
        if (!this.emis.ask()) this.events.emit('emi:ask', { zone: this.zones.current() });
      } else if (code === 'KeyO') {
        this.settings.set('overlays', !this.settings.data.overlays);
        this.hud.hint(this.settings.data.overlays ? { de: 'Overlays an', en: 'Overlays on' } : { de: 'Overlays aus', en: 'Overlays off' }, 1.5);
        this.events.emit('overlays:changed', { on: this.settings.data.overlays });
      }
    });
    // C12a: a lost WebGL context (driver reset, GPU switch, too many contexts) pauses behind a notice
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // allows the browser to restore it
      this.onContextLost();
    });
    canvas.addEventListener('webglcontextrestored', () => void this.onContextRestored());
    canvas.addEventListener('mousedown', () => {
      this.audio.unlock();
      if (this.phase === 'playing' && !this.input.locked && !this.hud.modals.isOpen) {
        this.captureMouse();
        this.input.consume('MouseLeft');
      }
    });
    window.addEventListener('keydown', () => this.audio.unlock(), { once: false, passive: true });

    this.events.on('settings:changed', ({ key }: { key: string }) => {
      if (key === 'volume') this.audio.setVolume(this.settings.data.volume);
      this.requestRender(2);
    });
    // C9: an idle game redraws only when the picture can change
    window.addEventListener('resize', () => this.requestRender(2));
    // troika re-lays 3D text in a worker: give the language switch a few frames
    this.events.on('lang:changed', () => this.requestRender(45));
    this.events.on('quality:changed', () => this.requestRender(3));
    // parts built after the boot's warm-up (the lazy finale, W6): compile their programs in the background
    this.events.on('world:late-build', () => void this.rs.warmUp({ root: this.rs.scene }));
    // stamp FX: the game layer shows them (merged with a challenge result within 1.5 s, else the classic stamp)
    this.events.on('settings:changed', ({ key }: { key: string }) => {
      if (key === 'reducedMotion' && this.settings.data.reducedMotion) this.setIslandTilt(0, 0);
    });
    // question cards: one toast per batch (stations often hand out two at once), with the question
    let cardBatch: number[] = [];
    this.events.on('question:awarded', ({ n }: { n: number }) => {
      cardBatch.push(n);
      if (cardBatch.length > 1) return;
      window.setTimeout(() => {
        const list = cardBatch.sort((a, b) => a - b);
        cardBatch = [];
        const q = (k: number): string => {
          const def = this.progress.questionDefs.get(k);
          return def ? `#${k} ${this.i18n.resolve(def.text)}` : `#${k}`;
        };
        const nums = list.map((k) => `#${k}`).join(' · ');
        this.hud.toast(() => list.map(q).join(' · '), {
          kind: 'success',
          eyebrow: () => `// ${this.i18n.t(list.length > 1 ? 'core.hud.questionCards' : 'core.hud.questionCard')} ${nums} · ${this.i18n.t('core.hud.questionHint')}`,
          duration: 6,
        });
      }, 300);
    });
    this.events.on('throw', ({ impulse, speed }: { impulse: number; speed: number }) => this.hud.showThrow(impulse, speed));
    // D13: remember the zone entered last (a returning visitor resumes at its gate)
    this.events.on('zone:enter', (p?: { id?: string }) => {
      if (p?.id && !p.id.startsWith('_')) this.progress.setLastZone(p.id);
    });
    // world props (Pass-Terminal, map table/board) open the engine panels
    this.events.on('ui:open-pass', () => {
      if (this.phase === 'playing' && !this.hud.modals.isOpen) this.pass.open();
    });
    // the Academy Pass handed over (onboarding): the cover flashes, like a stamp
    this.events.on('ui:pass-flash', () => this.hud.flashPass(passMark(this.progress.earnedStamps(), 120), this.i18n.t('core.pass.title')));
    this.events.on('ui:fade', (p: { on?: boolean } | undefined) => void this.hud.fade(!!p?.on));
    this.events.on('ui:open-map', () => {
      if (this.phase === 'playing' && !this.map.isOpen) this.map.open();
    });
    this.interaction.onInteracted = (item) => {
      this.audio.play('click', { volume: 0.8 });
      this.events.emit('interact', { id: item.id, owner: item.owner, label: this.i18n.resolve(item.label) });
    };
    if (import.meta.env.DEV) {
      window.addEventListener('beforeunload', () => {
        sessionSave('devpos', { p: this.player.feet.toArray(), yaw: this.player.yaw, pitch: this.player.pitch });
      });
    }
  }

  /** The island module (src/world/index.ts) is loaded like a zone anchored at the origin. */
  private async loadWorld(modP: Promise<unknown> | null = null): Promise<void> {
    if (!this.params.world) {
      this.worldStatus = { status: 'skipped', error: null };
      this.buildEmergencyGround();
      return;
    }
    const layout: ZoneLayout = { anchor: new THREE.Vector3(0, ISLAND.groundY, 0), facing: 0, radius: ISLAND.radius, groundY: ISLAND.groundY, isFallback: false };
    let scope: import('./Scheduler').Scope | null = null;
    try {
      const mod = (await (modP ?? importRetry(() => import('@/world/index')))) as { default?: ZoneDefinition };
      const def = mod.default;
      if (!def || (typeof def.init !== 'function' && typeof def.create !== 'function')) throw new Error('src/world/index.ts must `export default defineZone({...})`');
      const made = createZoneContext(this, 'world', def.title ?? def.name ?? { de: 'Insel', en: 'Island' }, layout, this.rs.scene);
      scope = made.scope;
      made.state.active = true;
      if (def.init) await def.init(made.ctx);
      if (def.create) this.worldInstance = (await def.create(made.ctx)) ?? null;
      this.worldDef = def;
      this.worldCtx = made.ctx;
      this.worldState = made.state;
      this.worldStatus = { status: 'ready', error: null };
      this.materials.instancingPass(this.rs.scene);
    } catch (err) {
      console.error('[world] island module failed — using emergency ground', err);
      scope?.dispose();
      this.worldStatus = { status: 'error', error: err instanceof Error ? err.message : String(err) };
      this.buildEmergencyGround();
      this.hud.toast(`World: ${this.worldStatus.error}`, { kind: 'error', duration: 8 });
    }
  }

  private buildEmergencyGround(): void {
    // covers the hub spawn on the Landedeck (z 94.5) and the outer lobes (r 102), not just the main disc
    const R = Math.max(ISLAND.radius, ISLAND.outerRadius) + 4;
    const geo = new THREE.CylinderGeometry(R, R * 0.95, 2, 64);
    const mesh = new THREE.Mesh(geo, this.materials.concreteGridSized(1, 1));
    mesh.position.y = -1;
    mesh.receiveShadow = true;
    mesh.name = 'core:emergency-ground';
    this.rs.scene.add(mesh);
    // flat trimesh disc: large convex shapes are imprecise for the character controller
    const n = 96;
    const verts = [0, 0, 0];
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      verts.push(Math.sin(a) * R, 0, Math.cos(a) * R);
    }
    for (let i = 1; i <= n; i++) idx.push(0, i + 1, i);
    const c = this.physics.world.createCollider(
      this.physics.R.ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(idx)).setCollisionGroups(GROUPS.world),
    );
    this.physics.register(c, { kind: 'static', owner: 'core', surface: 'concrete' });
  }

  /** Temporary floating platform for zones whose id has no plot in layout.ts (or ground areas with ?world=0); in their frame. */
  buildFallbackPlatform(id: string, layout: ZoneLayout, frame: PlotFrame = 'island'): void {
    const r = layout.radius + 4;
    const g = new THREE.Group();
    g.name = `core:fallback-plot:${id}`;
    g.position.copy(layout.anchor);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.97, 1, 48), this.materials.floorPlate(Math.round(r * 2), Math.round(r * 2)));
    top.position.y = -0.5;
    top.receiveShadow = true;
    const under = new THREE.Mesh(new THREE.ConeGeometry(r * 0.97, r * 1.1, 32, 1, true), this.materials.metalDark);
    under.rotation.x = Math.PI;
    under.position.y = -1 - r * 0.55;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r - 0.25, 0.05, 6, 96), this.materials.accentTeal);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    g.add(top, under, ring);
    (frame === 'ground' ? this.frames.ensureGround() : this.zones.group).add(g);
    const c = this.physics.world.createCollider(
      this.physics.R.ColliderDesc.cylinder(0.5, r).setTranslation(layout.anchor.x, layout.anchor.y - 0.5, layout.anchor.z).setCollisionGroups(GROUPS.world),
    );
    this.physics.register(c, { kind: 'static', owner: 'core', surface: 'metal', frame: frame === 'ground' ? 'ground' : undefined });
    this.hud.labels.add('core', layout.anchor.clone().setY(layout.anchor.y + 3.2), `FALLBACK PLOT · ${id}`, { eyebrow: 'layout.ts', maxDistance: 60, kind: 'muted' });
  }

  private placeInitialPlayer(): void {
    const p = this.params;
    this.zones.floorForDeepLink(p.zone);
    let pos: THREE.Vector3 | null = null;
    let yaw = 0,
      pitch = 0;
    if (p.pos) {
      pos = new THREE.Vector3(...p.pos);
      if (p.look) {
        yaw = THREE.MathUtils.degToRad(p.look[0]);
        pitch = THREE.MathUtils.degToRad(p.look[1]);
      }
    } else if (p.zone) {
      const s = this.zones.spawnOf(p.zone);
      if (s) {
        pos = s.pos;
        yaw = s.yaw;
        pitch = s.pitch ?? 0;
      } else console.warn(`[spawn] ?zone=${p.zone}: unknown zone — spawning at the hub`);
    } else if (import.meta.env.DEV && navigationType() === 'reload') {
      const saved = sessionLoad<{ p: [number, number, number]; yaw: number; pitch: number } | null>('devpos', null);
      if (saved && saved.p.every(Number.isFinite)) {
        pos = new THREE.Vector3(...saved.p);
        yaw = saved.yaw;
        pitch = saved.pitch;
      }
    }
    if (!pos) {
      const s = this.zones.spawnOf('hub')!;
      pos = s.pos;
      yaw = s.yaw;
      pitch = s.pitch ?? 0;
    }
    if (p.look && !p.pos) {
      yaw = THREE.MathUtils.degToRad(p.look[0]);
      pitch = THREE.MathUtils.degToRad(p.look[1]);
    }
    this.player.teleport(this.groundAt(pos), yaw, pitch);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  PHASES
  // ════════════════════════════════════════════════════════════════════════

  /** What the resume rule (src/core/quest/resume.ts) reads: launch params, the save, the zone records. */
  private resumeInput(): ResumeInput {
    const game = this;
    return {
      params: this.params,
      get ascentSeen() {
        return game.progress.getZoneValue<boolean>('world', 'ascentSeen', false) === true;
      },
      get reducedMotion() {
        return game.settings.data.reducedMotion;
      },
      get devReload() {
        return game.devReloadSpawn();
      },
      get lastZone() {
        return game.progress.lastZone;
      },
      // the area has code that did not fail (a manifest-only area has no gate to stand at yet) and a spawn
      canResumeAt(id) {
        const st = game.zones?.records.get(id)?.status;
        return !!st && st !== 'error' && st !== 'skipped' && st !== 'manifest' && !!game.zones.spawnOf(id);
      },
      get hasProgress() {
        return game.progress.hasAnyProgress();
      },
      get stamps() {
        return game.progress.stamps().length;
      },
    };
  }

  /** D13 (src/core/quest/resume.ts): where a returning visitor starts. */
  private returnPlan(approach = false): ResumePlan {
    return resumePlan(this.resumeInput(), approach);
  }

  /** A dev reload puts the player back where they were (placeInitialPlayer): no D13 then. */
  private devReloadSpawn(): boolean {
    if (!import.meta.env.DEV || navigationType() !== 'reload') return false;
    const saved = sessionLoad<{ p: [number, number, number] } | null>('devpos', null);
    return !!saved && Array.isArray(saved.p) && saved.p.every(Number.isFinite);
  }

  beginPlay(mode: Mode, fromGesture: boolean, o: { approach?: boolean } = {}): void {
    this.progress.setMode(mode);
    this.startScreen.hide();
    this.phase = 'playing';
    this.hud.setPlaying(true);
    // D13: a returning visitor resumes at the gate of the zone entered last (facing into it);
    // Phase 7 (plan §3.6, WP1): an airborne save whose last area is on the ground resumes at plan.pos (the plaza)
    const plan = this.returnPlan(!!o.approach);
    const gate = plan.zone ? this.zones.spawnOf(plan.zone) : plan.pos ? { pos: new THREE.Vector3(...plan.pos), yaw: THREE.MathUtils.degToRad(plan.yawDeg ?? 0), pitch: 0 } : null;
    if (gate) this.player.teleport(this.groundAt(gate.pos), gate.yaw, gate.pitch ?? 0);
    this.player.updateCamera(1, 0, true);
    this.requestRender(2);
    if (fromGesture) {
      this.audio.unlock();
      this.audio.play('whoosh', { volume: 0.6 });
      this.captureMouse();
    }
    // `glide` (plan §3.6, WP1): the first visit's 6 s glide (WP12); `skipAscent` stays for the rc4 island
    this.events.emit('game:start', plan.skipAscent ? { mode, skipAscent: true, glide: plan.glide } : { mode, glide: plan.glide });
    if (gate && plan.zone) {
      const def = this.zones.records.get(plan.zone)?.def ?? null;
      const where = zoneInPhrase(plan.zone, titleOf(def, plan.zone));
      this.hud.toast(this.i18n.t('core.hud.resume', { where: this.i18n.resolve(where) }), { kind: 'info', eyebrow: def?.eyebrow ?? undefined, duration: 6 });
    }
  }

  pause(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    if (this.grab.held) this.grab.release(true);
    this.pauseMenu.open();
    this.events.emit('game:pause');
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.pauseMenu.hide(); // modal close → captureMouse()
    this.events.emit('game:resume');
  }

  /** Re-capture the mouse. If the browser refuses (no user gesture, e.g. after Esc), the
   *  "click to capture" hint shows instead — no surprise pause menu. */
  private captureMouse(): void {
    if (this.input.locked) return;
    void this.input.requestLock();
  }

  private onContextLost(): void {
    if (this.contextLost) return;
    this.contextLost = true;
    console.warn('[render] WebGL context lost');
    this.resumeAfterRestore = this.phase === 'playing';
    if (this.phase === 'playing') this.pause();
    this.input.releaseLock(true);
    this.loading.notice(this.i18n.t('core.gfx.lost'));
    window.clearTimeout(this.lostTimer);
    // nothing back after 5 s: offer a reload (progress lives in localStorage)
    this.lostTimer = window.setTimeout(() => {
      if (this.contextLost) this.loading.offer(this.i18n.t('core.gfx.stuck'), [{ label: this.i18n.t('core.gfx.reload'), onClick: () => location.reload() }]);
    }, 5000);
    this.events.emit('gfx:lost');
  }

  private async onContextRestored(): Promise<void> {
    if (!this.contextLost) return;
    console.info('[render] WebGL context restored');
    window.clearTimeout(this.lostTimer);
    // every GPU resource is re-created lazily; render targets (env map, shadow map) need a redraw
    this.env.invalidate();
    this.rs.markShadowsDirty();
    this.contextLost = false;
    this.warmUp().catch(() => undefined);
    this.requestRender(3);
    if (this.phase === 'loading') return; // the boot continues behind its own screen
    this.loading.done();
    if (this.resumeAfterRestore && this.phase === 'paused') this.resume();
    this.resumeAfterRestore = false;
    this.events.emit('gfx:restored');
  }

  /** C12d: friendly bilingual boot error with „Erneut versuchen“ and the technical text folded away. */
  private showBootError(err: unknown): void {
    const t = (k: string): string => this.i18n.t(`core.boot.${k}`);
    const other = this.i18n.lang === 'de' ? 'en' : 'de';
    const tOther = (k: string): string => {
      const v = (coreStrings as unknown as Record<string, Record<string, Record<string, string>>>)[other]?.boot?.[k];
      return typeof v === 'string' ? v : '';
    };
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    this.loading.error(t('title'), {
      hint: t('hint'),
      alt: { text: `${tOther('title')} ${tOther('hint')}`.trim(), lang: other },
      detail,
      detailLabel: `${t('details')} · ${tOther('details')}`,
      actions: [{ label: `${t('retry')} · ${tOther('retry')}`, onClick: () => location.reload() }],
    });
  }

  /** Extra vignette 0…1 (player.setVignette). */
  setVignetteExtra(a: number): void {
    this.vignetteExtra = a;
    this.rs.setExtraVignette(a);
  }

  /** Visual island tilt (GDD §5.9). Camera roll ≤ 0.3° per degree of tilt; off with reduced motion. */
  setIslandTilt(rollDeg: number, pitchDeg: number): void {
    if (this.settings.data.reducedMotion) {
      rollDeg = 0;
      pitchDeg = 0;
    }
    this.env.setTilt(rollDeg, pitchDeg);
    // plan §5.3 rule 4: the ground root takes the same inverse tilt as the environment (ground physics pauses while tilted)
    this.frames.setTilt(this.env.tilt.rollDeg, this.env.tilt.pitchDeg);
    // gusts (≤ 0.5° tilt) roll the camera ≤ 0.15°; the finale (±3°) up to 0.9°
    this.player.roll = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(rollDeg * 0.3, -0.9, 0.9));
    this.events.emit('island:tilt', { roll: this.env.tilt.rollDeg, pitch: this.env.tilt.pitchDeg });
  }

  setLang(l: Lang): void {
    this.settings.set('lang', l);
    this.i18n.setLang(l);
    this.events.emit('lang:changed', { lang: l });
  }

  setQuality(q: QualitySetting): void {
    this.settings.set('quality', q);
    this.rs.applyQualitySetting(q);
    void this.warmUp();
  }

  /**
   * C2: compile the programs of the current preset for the target the frame really renders into,
   * with the env map, lights and camera the next visible frame uses. Behind the loading screen it
   * also renders one full frame (shadow pass, composer passes, uploads), so the first visible frame
   * is cheap. Later calls (quality switch, context restore) only compile.
   */
  async warmUp(): Promise<void> {
    const cam = this.rs.camera;
    const booting = this.phase === 'loading';
    if (booting) {
      if (this.params.skipIntro) this.player.updateCamera(1, 0, true);
      else this.updateAttractCamera(0);
    }
    this.env.prepare(cam, this.player.renderFeet);
    this.lights.update(cam.position);
    this.text3d.update(cam);
    await this.rs.warmUp({ frame: booting });
  }

  // ════════════════════════════════════════════════════════════════════════
  //  TELEPORT / RESPAWN
  // ════════════════════════════════════════════════════════════════════════

  /** Teleport to 'hub', a zone id, or a world position. */
  teleportTo(target: string | { x: number; y: number; z: number }, fade = false): boolean {
    if (typeof target === 'string') {
      const s = this.zones.spawnOf(target);
      if (!s) return false;
      void this.teleportWorld(s.pos, s.yaw, s.pitch ?? 0, fade);
      return true;
    }
    void this.teleportWorld(new THREE.Vector3(target.x, target.y, target.z), undefined, undefined, fade);
    return true;
  }

  /**
   * Feet position on the static ground under `pos`: searches from 0.6 m above down to 4 m below
   * (raised floors, platforms). Returns pos unchanged when nothing static is there.
   */
  groundAt(pos: THREE.Vector3): THREE.Vector3 {
    const R = this.physics.R;
    const ray = new R.Ray({ x: pos.x, y: pos.y + 0.6, z: pos.z }, { x: 0, y: -1, z: 0 });
    const hit = this.physics.world.castRay(ray, 4.6, true, R.QueryFilterFlags.EXCLUDE_SENSORS, groups(0xffff, GROUP.WORLD), this.player.collider);
    return hit ? new THREE.Vector3(pos.x, pos.y + 0.6 - hit.timeOfImpact, pos.z) : pos.clone();
  }

  async teleportWorld(pos: THREE.Vector3, yaw?: number, pitch?: number, fade = false): Promise<void> {
    if (this.grab.held) this.grab.release(true);
    if (fade) {
      this.audio.play('whoosh');
      await this.hud.fade(true);
    }
    pos = this.groundAt(pos);
    this.player.teleport(pos, yaw, pitch);
    this.player.updateCamera(1, 0, true);
    this.requestRender(2);
    if (fade) await this.hud.fade(false);
  }

  private checkPlayerFall(): void {
    if (this.respawning || this.player.feet.y > ISLAND.killY) return;
    this.rescuePlayer('fell');
  }

  /**
   * The rescue drone: back to the island's (or, in the ground frame, the ground's) rescue point for
   * the last safe position (layout.ts rescuePoint), else the nearest spawn. The kill plane and the
   * rescue volumes (plan §5.3 rule 8) call it.
   */
  rescuePlayer(reason: 'fell' | 'volume' = 'fell'): void {
    if (this.respawning) return;
    this.respawning = true;
    this.events.emit('player:rescue', { reason });
    // the island's rescue point for the last safe position (layout.ts), else the nearest spawn
    const from = this.player.lastSafePosition;
    let best = this.zones.spawnOf('hub')!;
    let rescued = false;
    try {
      const r = rescuePoint([from.x, from.y, from.z]);
      if (r && r.position.every(Number.isFinite)) {
        best = { pos: new THREE.Vector3(...r.position), yaw: THREE.MathUtils.degToRad(r.yawDeg), pitch: 0 };
        rescued = true;
      }
    } catch (err) {
      console.error('[world] rescuePoint threw', err);
    }
    let bd = rescued ? 0 : best.pos.distanceToSquared(from);
    for (const id of this.zones.records.keys()) {
      if (rescued) break;
      const rec = this.zones.records.get(id)!;
      if (rec.status !== 'ready') continue;
      const s = this.zones.spawnOf(id);
      if (s && s.pos.distanceToSquared(from) < bd) {
        best = s;
        bd = s.pos.distanceToSquared(from);
      }
    }
    void this.teleportWorld(best.pos, best.yaw, 0, true).then(() => {
      this.respawning = false;
      this.hud.toast({ key: 'core.hud.fell' }, { kind: 'warn' });
      this.player.emitRespawn('fell');
    });
  }

  /** Custom modal for zone minigame UIs. */
  openCustomModal(build: (el: HTMLElement, close: () => void) => void | (() => void), o: { width?: number } = {}): Promise<void> {
    return new Promise((resolve) => {
      const el = h('div', { class: 'modal custom-modal hairline' });
      if (o.width) el.style.width = `min(${o.width}px, 100%)`;
      let cleanup: void | (() => void);
      const close = this.hud.modals.open('custom', el, {
        onClose: () => {
          try {
            if (typeof cleanup === 'function') cleanup();
          } catch (err) {
            console.error('[modal] cleanup threw', err);
          }
          resolve();
        },
      });
      try {
        cleanup = build(el, close);
      } catch (err) {
        console.error('[modal] build threw', err);
        close();
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  //  LOOP
  // ════════════════════════════════════════════════════════════════════════

  /** smoothed main-thread CPU time per frame (ms): simulation, zones, HUD and WebGL command submission */
  cpuMs = 0;

  /**
   * C9: draw `frames` more frames while the game is paused or frozen (after a resize, a language,
   * quality or settings change, a modal change). Otherwise an idle game draws nothing.
   */
  requestRender(frames = 2): void {
    this.renderFrames = Math.max(this.renderFrames, frames);
  }

  private frame = (nowMs: number): void => {
    if (this.fatal || this.contextLost) return;
    // C9: the title screen runs at 30 fps (every second display frame; dt spans both) — except while
    // C10's auto quality probes the GPU in its first seconds
    const probing = this.phase === 'start' && performance.now() < this.rs.probeUntil;
    if (this.phase === 'start' && !probing && (this.oddFrame = !this.oddFrame)) return;
    const cpu0 = performance.now();
    const now = nowMs / 1000;
    let dt = this.last ? now - this.last : FIXED;
    this.last = now;
    dt = Math.min(Math.max(dt, 0), 0.1);
    const frozen = this.frozen;
    const idle = this.phase === 'paused' || frozen;
    // C10: measured only on real play frames (and the title probe), never while zones are still being built
    this.rs.trackFrame(dt, this.zonesSettled && ((this.phase === 'playing' && !idle) || probing), this.cpuMs);
    // C2: nothing is simulated or drawn behind the opaque loading screen (warmUp() renders the one frame it needs)
    if (this.phase === 'loading') return;
    // C9: paused or behind a full-screen panel, the picture does not change: draw it once, then skip the frame
    if (idle !== this.wasIdle) {
      this.wasIdle = idle;
      if (idle) this.requestRender(2);
    }
    if (idle) {
      if (this.renderFrames <= 0) {
        this.input.endFrame();
        return;
      }
      if (!this.rs.warming) this.renderFrames--;
    }

    const sim = (this.phase === 'playing' || this.phase === 'start') && !frozen;
    const controlling = this.phase === 'playing' && !this.hud.modals.isOpen;
    if (this.phase === 'playing') this.handleActions(controlling);
    // game-time delta for the HUD, the game layer and the dialogue: 0 while paused or frozen (C4)
    const gdt = this.phase === 'paused' || frozen ? 0 : dt;

    if (sim) {
      this.time.elapsed += dt;
      this.time.dt = dt;
      this.time.frame++;
      this.player.frameInput(controlling, dt);
      this.acc += dt;
      let steps = 0;
      while (this.acc >= FIXED && steps < 5) {
        this.fixedStep(controlling);
        this.acc -= FIXED;
        steps++;
      }
      if (steps >= 5) this.acc = 0;
      this.alpha = this.acc / FIXED;
      this.physics.interpolate(this.alpha);
      if (this.physics.moved) this.rs.markShadowsDirty();
      this.scheduler.tick(this.time.elapsed);
      this.zones.update(dt);
      // ctx.robots: LOD of the active areas' robots, their clips, the fetch queue
      this.robots.update(dt);
      if (this.worldCtx) {
        try {
          this.worldDef?.update?.(dt, this.worldCtx);
          this.worldInstance?.update?.(dt, this.time.elapsed);
        } catch (err) {
          console.error('[world] update threw', err);
        }
      }
      this.emis.update(dt);
    }
    this.gameLayer.update(gdt, this.phase === 'playing');
    this.operate.update(frozen ? 0 : dt);
    this.hud.root.classList.toggle('operating', this.operate.isActive);
    // where the operate panel docks: the subtitles and the zone column move to the free side (hud.css)
    const dock = this.operate.active ? (this.operate.active.panel ? (this.operate.active.panelPosition ?? 'right') : 'none') : '';
    if ((this.hud.root.dataset.dock ?? '') !== dock) this.hud.root.dataset.dock = dock;
    // scripted cameras (ascent, lift rides, cutscenes): compass, objective and crosshair step aside
    const ov = this.player.cameraOverride;
    this.hud.root.classList.toggle('cinematic', !this.operate.isActive && !!ov && ov.blend > 0.5);

    if (this.phase === 'start') this.updateAttractCamera(dt);
    else this.player.updateCamera(this.alpha, this.phase === 'playing' ? gdt : 0, controlling);

    this.interaction.update(this.rs.camera, dt, controlling && !this.grab.held, this.player.collider);
    this.hud.updateFocus(this.interaction.focus, !!this.grab.held, this.grab.readout, this.phase === 'playing' && !this.hud.modals.isOpen);
    // QA-28: a keyboard player (walks / turns with the mouse free) does not need the capture hint
    this.hud.setCaptureHint(this.phase === 'playing' && !this.input.locked && !this.hud.modals.isOpen && !this.input.keyboardOnly && (this.input.everLocked || !this.params.skipIntro));
    this.hud.update(gdt);
    this.env.update(frozen ? 0 : dt, this.rs.camera, this.player.renderFeet);
    this.audio.update(this.rs.camera);
    this.lights.update(this.rs.camera.position);
    this.text3d.update(this.rs.camera);
    this.hud.labels.update(this.rs.camera, this.phase === 'playing');
    this.hud.compass.update(this.player.yaw, this.player.renderFeet);
    this.debugOverlay?.update(dt);
    this.surfaceTimer -= dt;
    if (this.surfaceTimer <= 0 && this.phase === 'playing') {
      this.surfaceTimer = 0.2;
      this.player.probeSurface();
    }

    this.materials.syncInstancing();
    // while a quality switch compiles its programs in parallel, the last frame stays on screen
    if (!this.rs.warming) this.rs.render(dt);
    this.input.endFrame();
    this.cpuMs += (performance.now() - cpu0 - this.cpuMs) * 0.05;
    if (!this.ready && this.zonesSettled && ++this.framesSinceReady > 3) {
      this.ready = true;
      this.events.emit('game:ready');
      // 'game:settled-all' follows at once when nothing is left (rc4 content), else after __academy.loadAll()
      this.zones.noteSettled();
    }
  };

  private fixedStep(controlling: boolean): void {
    this.player.fixedUpdate(FIXED, controlling);
    this.grab.fixedUpdate(FIXED);
    this.zones.fixedUpdate(FIXED);
    if (this.worldCtx) {
      try {
        this.worldDef?.fixedUpdate?.(FIXED, this.worldCtx);
        this.worldInstance?.fixedUpdate?.(FIXED);
        for (const pw of this.worldState?.privateWorlds ?? []) if (pw.autoStep) pw.world.step();
      } catch (err) {
        console.error('[world] fixedUpdate threw', err);
      }
    }
    this.physics.step();
    if (this.phase === 'playing') this.checkPlayerFall();
  }

  /** Edge-triggered actions (render frame). */
  private handleActions(controlling: boolean): void {
    const inp = this.input;
    if (inp.anyPressed('Backquote', 'F3')) this.debugOverlay?.setEnabled(!this.debugOverlay.enabled);
    if (!controlling) {
      if (this.grab.held) this.grab.release(true);
      return;
    }
    if (!this.grab.held) this.scriptedGrab = false;
    const grabDown = inp.anyDown('KeyF', 'MouseRight') || this.scriptedGrab;
    if (!grabDown) this.grabLatch = false;

    if (this.grab.held) {
      if (!grabDown) this.grab.release();
      else if (inp.pressed('MouseLeft')) {
        this.grab.throw();
        this.grabLatch = true;
      }
      if (inp.wheel) this.grab.adjustDistance(inp.wheel);
    } else {
      const f = this.interaction.focus;
      if (grabDown && !this.grabLatch && f) {
        const body = f.kind === 'grabbable' ? f.body : f.grabbable;
        if (body && this.grab.start(body)) this.grabLatch = true;
      }
      if (inp.anyPressed('KeyE', 'MouseLeft')) {
        if (f?.kind === 'interactable') this.interaction.fire(f.item);
        else if (inp.pressed('KeyE') && this.hud.dialogue.active) this.hud.dialogue.advance();
      }
    }
    if (inp.pressed('Enter') && this.hud.dialogue.active) this.hud.dialogue.advance();
  }

  private updateAttractCamera(dt: number): void {
    // reduced motion: the title camera holds still (UXA-11)
    if (!this.settings.data.reducedMotion) this.attractT += dt;
    const a = ATTRACT_CAMERA;
    const ang = this.attractT * a.speed + a.startDeg * (Math.PI / 180);
    const cam = this.rs.camera;
    cam.position.set(a.target[0] + Math.sin(ang) * a.radius, a.target[1] + a.height, a.target[2] + Math.cos(ang) * a.radius);
    // optional sideways offset (m): look left of the target so it sits right of the title card
    const off = (a as { screenOffset?: number }).screenOffset ?? 0;
    cam.lookAt(a.target[0] - Math.cos(ang) * off, a.target[1], a.target[2] + Math.sin(ang) * off);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}


function navigationType(): string {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return nav?.type ?? 'navigate';
  } catch {
    return 'navigate';
  }
}

// re-export for convenience
export { HUB };
