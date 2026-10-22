/**
 * „Entdecken“ (Discover, docs plan §1.6) — the WP-D0 contract. D1 (tour), D2 (viewer) and D3 (film,
 * share) code against these types only; they never edit each other's files. Additive changes only.
 *
 * How a package plugs in (no shared file to edit):
 *   - 3D path: `src/discover/<pkg>/install.ts` with `export default function install(h: DiscoverHandle)`.
 *     src/discover/index.ts picks every `./* /install.ts` up with an eager import.meta.glob, calls them in
 *     path order (film, tour, viewer) before the start card, and enters the mode 'tour' on „Los“ (the
 *     spike tour, src/discover/spike.ts, when no tour is registered). Heavy code stays behind a dynamic
 *     import inside the package (a mode's enter()), so the core chunk keeps its budget.
 *   - Stills path (weak phones, ?stills=1): `src/discover/<pkg>/stills.ts` with
 *     `export default function install(h: StillsHandle)`, picked up by src/discover/stills/boot.ts. That
 *     code must not import three, Game, Rapier, the world or any GLB (the stills chunk stays ≤ 400 KB
 *     before the first image): only `@/discover/ui/**`, `@/discover/strings`, `@/discover/stills/paths`,
 *     data modules and type imports.
 *
 * Every type here is plain data or a DOM-level interface: importing this file (type-only) costs nothing.
 */
import type * as THREE from 'three';
import type { Lang, QualityLevel, Text } from '@/core/types';
import type { Game } from '@/core/Game';
import type { ZoneContext } from '@/core/zones/types';
import type { RobotId } from '@/robots/manifest';
import type { ChipType } from '@/ui/Kit';

export type { ChipType, RobotId };

/** World position (m), island frame at h = 0 (docked): x east, y up, z south. */
export type Vec3 = readonly [number, number, number];

// ── text ────────────────────────────────────────────────────────────────────────────────────────

/**
 * What every Discover UI piece resolves its texts with. In 3D it is `game.i18n` (core tables
 * registered, `{ key }` texts work); in the stills path it is a small resolver without tables
 * (src/discover/ui/text.ts): there, use `{ de, en }` texts (generated content), never `{ key }`.
 * Mode variants resolve to the Entscheider leg in both paths (Discover runs the Entscheider save).
 */
export interface TextResolver {
  readonly lang: Lang;
  resolve(text: Text | null | undefined, params?: Record<string, string | number>): string;
  /** locale-aware number („12,5“ / „12.5“) */
  num(value: number, digits?: number): string;
  onChange(fn: (lang: Lang) => void): () => void;
}

// ── cards and the sheet ───────────────────────────────────────────────────────────────────────

/**
 * A block of a card. Every number sits in a block with a chip (the `.chip` contract of Kit.chipElement:
 * class `chip chip-<type>`, the same labels). Card bodies stay ≤ 35 words at half height.
 */
export type CardBlock =
  | { kind: 'p'; text: Text; chip?: ChipType; src?: Text }
  | { kind: 'rows'; rows: { label: Text; value: Text | null; chip?: ChipType; cond?: Text }[] }
  /** tappable chips, e.g. „Hier zu sehen“ (label = the small heading above them) */
  | { kind: 'chips'; label?: Text; items: { label: Text; onSelect(): void }[] };

export interface CardAction {
  id: string;
  label: Text;
  /** the orange button; at most one per card */
  primary?: boolean;
  onSelect(): void;
}

export interface CardSpec {
  /** stable id (tests, provenance): a content id, `robot:<id>`, `spike:<stop>` */
  id?: string;
  eyebrow?: Text;
  title: Text;
  blocks: CardBlock[];
  actions?: CardAction[];
  /** the source line at the foot (full height) */
  srcLine?: Text;
}

/** Bottom sheet heights (portrait): peek ≈ 96 px, half ≈ 45 %, full ≈ 90 %. Landscape / ≥ 900 px: a right panel. */
export type SheetSnap = 'peek' | 'half' | 'full';

export interface Sheet {
  readonly el: HTMLElement;
  /** render a card and show the sheet (default snap: 'peek') */
  show(card: CardSpec, snap?: SheetSnap): void;
  hide(): void;
  setSnap(snap: SheetSnap): void;
  readonly snap: SheetSnap | 'hidden';
  /** the card shown now (null while hidden) */
  readonly card: CardSpec | null;
  onSnap(fn: (snap: SheetSnap | 'hidden') => void): () => void;
  /** the ‹ › buttons in the sheet header (null hides them); a press goes to Gestures.onNav listeners */
  setNav(o: { prev: boolean; next: boolean } | null): void;
}

export interface TopBar {
  readonly el: HTMLElement;
  /** „3 / 12“ (1-based) + the stop title on one line; n = 0 shows the title alone */
  setStep(i: number, n: number, title: Text): void;
}

export interface MenuItem {
  id: string;
  label: Text;
  onSelect(): void;
  /** a toggle (role menuitemcheckbox) when given */
  checked?: () => boolean;
  /** lower first; D0's items use 10 (reduced motion), 20 (sound), 30 („Am Laptop spielen“), 80 (credits), 90 („Messen“) */
  order?: number;
}

export interface Menu {
  /** add (or replace by id) an item; returns remove */
  add(item: MenuItem): () => void;
  open(): void;
  close(): void;
  readonly isOpen: boolean;
}

/** Page-level helpers shared by both paths. */
export interface DiscoverUi {
  /** `.dsc` — the Discover layer (top bar, sheet, menu, chips, fade) */
  readonly root: HTMLElement;
  /** the aria-live="polite" line (stop arrival, „Link kopiert“) */
  announce(text: Text): void;
  /** the small „lädt …“ chip (pre-roll); nested calls count */
  busy(on: boolean): void;
  /** a short toast at the top (≤ 3 s) */
  toast(text: Text): void;
  /** full-screen fade to the base colour and back (reduced motion flights: 0.4 s each way) */
  fade(on: boolean, seconds?: number): Promise<void>;
}

// ── camera, observer, gestures ───────────────────────────────────────────────────────────────

/**
 * Angles as `__academy.look`: yaw 0 = facing −Z (north), +90 = facing −X (west); pitch + = looking up.
 * `limits.yawDeg` absolute [min, max] (omitted = free 360°), `pitchDeg` [min, max],
 * `distance` [min, max] m (orbit: pinch), `fovDeg` [min, max] (look: pinch zooms the field of view).
 */
export interface RigLimits {
  yawDeg?: readonly [number, number];
  pitchDeg?: readonly [number, number];
  distance?: readonly [number, number];
  fovDeg?: readonly [number, number];
}

/**
 * How one finger moves the camera at a stop.
 *   orbit: around `target`; the camera sits at target − dir(yaw, pitch) × distance and faces the target
 *          (so yawDeg is the direction the camera looks, pitch < 0 looks down on it);
 *   look:  from a fixed `eye`, turning the head (a measured view of tools/lib/views.mjs: eye = feet + 1.7 m).
 */
export type CameraRig =
  | { kind: 'orbit'; target: Vec3; distance: number; yawDeg: number; pitchDeg: number; fovDeg?: number; limits?: RigLimits }
  | { kind: 'look'; eye: Vec3; yawDeg: number; pitchDeg: number; fovDeg?: number; limits?: RigLimits };

export interface CameraPose {
  eye: Vec3;
  /** a point the camera looks at (for a look rig: eye + 10 m along the view) */
  target: Vec3;
  fovDeg: number;
}

export interface FlyOptions {
  /** door points etc.: the path goes through them in order, the last segment straight */
  via?: readonly Vec3[];
  /** default clamp(distance / 60 m/s, 2.5, 6) s; reduced motion: always a 0.4 s cross-fade */
  seconds?: number;
}

export interface DiscoverCamera {
  readonly rig: CameraRig | null;
  /** jump to a rig (no flight) */
  setRig(rig: CameraRig): void;
  /** the camera as drawn now */
  pose(): CameraPose;
  /**
   * Fly to a rig: a cubic Bézier, the middle raised to max(y0, y1) + 0.35 × distance (≥ 70 m for
   * island-wide hops), never below ctx.frames.heightAt + 15; ease in-out, no roll. Resolves on arrival
   * (or when a newer flyTo / setRig takes over). Gestures are ignored while flying.
   */
  flyTo(rig: CameraRig, o?: FlyOptions): Promise<void>;
  /** orbit distance at which a sphere of this radius fills the view (portrait and landscape) */
  fitDistance(radius: number, fovDeg?: number): number;
  /** back to the rig's own pose (double tap) */
  reset(): void;
  readonly flying: boolean;
  /**
   * attach(): Discover drives game.camera each frame (game.cameraDriver), and the observer runs.
   * detach(): game.cameraDriver = null, so the engine's player camera (cameraOverride, cinematic,
   * the lift-off director) draws — the film (D3). The observer stops while detached.
   */
  attach(): void;
  detach(): void;
  readonly attached: boolean;
}

/**
 * The observer (plan §1.4): where the areas think the player is. follow(): the feet sit 1.7 m below
 * the camera eye each frame, pushed out of every lobe plot (r 22 + 1 m, |Δy| < 40) so no lobe's onEnter
 * fires; the hall and the Traumhangar may be entered (interior culling, the hall's LOD limiter).
 * pin(pos): the feet stay at pos (a stop's pre-roll: robots and LOD load around the target before the
 * flight). release(): Discover stops moving the player (the film owns it). Level of detail, the robot
 * queue (≤ 60 m), the sun-shadow box and the zone audio all follow the observer.
 */
export interface Observer {
  follow(): void;
  pin(feet: Vec3): void;
  release(): void;
  readonly mode: 'follow' | 'pin' | 'off';
  readonly feet: Vec3;
}

export interface TapPoint {
  x: number;
  y: number;
}

/**
 * Pointer gestures on canvas#game (touch-action: none there only): one finger orbits / looks with
 * inertia (none under reduced motion), pinch zooms, tap ≤ 250 ms and ≤ 10 px, double tap resets the
 * rig. Desktop with ?discover=1: mouse drag, wheel, click, ←/→ (onNav), Esc collapses the sheet.
 */
export interface Gestures {
  /** a tap on the 3D view: ndc in −1…1 (y up), px in CSS pixels */
  onTap(fn: (ndc: TapPoint, px: TapPoint) => void): () => void;
  onDoubleTap(fn: (ndc: TapPoint, px: TapPoint) => void): () => void;
  /** previous / next: ←/→, a horizontal swipe on the collapsed sheet, the sheet's ‹ › buttons */
  onNav(fn: (dir: -1 | 1) => void): () => void;
  /** false: drags, pinches and taps on the canvas do nothing (nav keys still fire) */
  enabled: boolean;
}

// ── performance ────────────────────────────────────────────────────────────────────────────────

export interface PerfWindow {
  /** frames in the window */
  n: number;
  /** frame interval percentiles (ms, between drawn frames) */
  p50: number;
  p90: number;
  p99: number;
  /** frames slower than 50 ms */
  over50: number;
  fps: number;
  /** main-thread ms per frame (Game.cpuMs, smoothed) */
  jsMs: number;
}

/** sessionStorage `emai-academy-island/v1:discover-alive` while a 3D session runs; found at boot = the last one ended abnormally (an iOS reload) */
export interface CrashMarker {
  stop: string | null;
  t: number;
}

export interface PerfStats extends PerfWindow {
  draws: number;
  tris: number;
  programs: number;
  geometries: number;
  textures: number;
  /** estimated GPU memory (MB): geometry, textures (w×h×4×1.33), composer targets, shadow and env maps */
  gpuMB: number;
  /** performance.memory where it exists, else null („n/a“) */
  heapMB: number | null;
  pixelRatio: number;
  buffer: [number, number];
  renderer: string;
  tier: string;
  stop: string | null;
  /** the crash marker found at this boot (null: the last session ended normally or there was none) */
  crash: CrashMarker | null;
}

export interface PerfMonitor {
  /** the last 2 s plus the renderer and memory readings */
  stats(): PerfStats;
  /** frame statistics over the last `ms` */
  window(ms: number): PerfWindow;
  /** a labelled mark in the bench log */
  mark(label: string): void;
}

// ── tier ───────────────────────────────────────────────────────────────────────────────────────

/** src/discover/tier.ts: `phone` by default (?discover=1, also on the desktop), `full` with ?tier=full. */
export interface DiscoverTier {
  name: 'phone' | 'full';
  /** pinned preset (phone: 'low'); null = the normal auto quality (full) */
  level: QualityLevel | null;
  pixelRatioCap: number;
  /** render scale floor of the scale-only auto controller */
  scaleMin: number;
  /** frame cap (null = display rate) */
  fpsCap: 30 | 60 | null;
  shadows: boolean;
  shadowMapSize: number;
  shadowExtent: number;
  /** ZoneManager.tierScale */
  lodScale: number;
  /** the life chunk (birds, people) */
  life: boolean;
  /** 'auto': stills when perf.window(3000).p90 > 50 ms or reduced motion */
  film: 'auto' | 'full' | 'stills';
  /** the viewer keeps at most this many parsed most-detailed robot files */
  viewerFiles: number;
}

// ── tour data ──────────────────────────────────────────────────────────────────────────────────

/** One stop of the tour (D1, src/discover/tour/stops.ts; plain data, no three, usable by the stills path). */
export interface TourStop {
  id: string;
  title: Text;
  /** area ids whose code the stop needs (zones.initOne in the pre-roll) */
  areas: readonly string[];
  rig: CameraRig;
  via?: readonly Vec3[];
  /** hotspot ids shown at this stop */
  spots: readonly string[];
  /** content id of the stop card */
  card: string;
}

// ── modes ──────────────────────────────────────────────────────────────────────────────────────

export type DiscoverModeName = 'tour' | 'viewer' | 'film';

/**
 * A mode owns the screen while it is current. enter() of the next mode runs after exit() of the
 * current one; entering the current mode again calls enter() again with the new argument (e.g. the
 * tour with { stop }). Keep the heavy code behind a dynamic import inside enter().
 */
export interface DiscoverMode {
  enter(arg?: unknown): Promise<void> | void;
  exit?(): Promise<void> | void;
}

export interface ModeRegistry {
  register(name: DiscoverModeName, mode: DiscoverMode): void;
  has(name: DiscoverModeName): boolean;
  enter(name: DiscoverModeName, arg?: unknown): Promise<void>;
  readonly current: DiscoverModeName | null;
}

/** The arguments the core passes to the modes it enters itself. */
export interface TourEnterArg {
  /** ?stop=<id> or discover:goto: start at this stop */
  stop?: string;
}

/** modes.enter('viewer', arg) (the bench, the tour's „Roboter ansehen“, ?robot=) */
export interface ViewerEnterArg {
  robot?: RobotId;
}

/**
 * modes.enter('film', arg). stills: the director's stills version (the tier's 'auto' rule decides when
 * omitted). The bench enters with { stills: true, bench: true } and waits for enter() to resolve: resolve
 * it once the film reached its end card (or was skipped).
 */
export interface FilmEnterArg {
  stills?: boolean;
  bench?: boolean;
}

// ── launch parameters ──────────────────────────────────────────────────────────────────────────

export interface DiscoverParams {
  /** ?perf=1: the readout and „Messen“ */
  perf: boolean;
  /** ?bench=1: „Messen“ also on the start card */
  bench: boolean;
  /** ?stop=<id> */
  stop: string | null;
  /** ?robot=<id> (shared links, once public) */
  robot: string | null;
  lang: Lang | null;
}

// ── the handle (3D path) ───────────────────────────────────────────────────────────────────────

export interface ShareWhat {
  kind: 'game' | 'stop' | 'robot';
  id?: string;
}

export interface DiscoverHandle {
  game: Game;
  /** Discover's own zone context ('discover'): ctx.robots, ctx.emi, ctx.i18n, ctx.materials, ctx.debug */
  ctx: ZoneContext;
  tier: DiscoverTier;
  params: DiscoverParams;
  /** = game.i18n */
  text: TextResolver;
  camera: DiscoverCamera;
  observer: Observer;
  gestures: Gestures;
  sheet: Sheet;
  topbar: TopBar;
  menu: Menu;
  ui: DiscoverUi;
  perf: PerfMonitor;
  modes: ModeRegistry;
  /** in-memory settings (never stored): reduced motion (the media query, then the menu), sound */
  settings: DiscoverSettings;
  /** the language for this session (never stored) */
  setLang(lang: Lang): void;
  /** the tour arrived at a stop (crash marker, readout, discover:state) */
  setStop(id: string | null): void;
  /** areas: init their code now (in order) and compile their programs; then the observer may move there */
  ensureAreas(ids: readonly string[]): Promise<void>;
  /** compile the programs under `root` (default: the whole scene) without drawing: 0 links in the next frames */
  warm(root?: THREE.Object3D): Promise<void>;
  /** EMI's voice in memory: off in the tour, on for the film */
  voice(on: boolean): void;

  // registered by the packages (optional until they merge)
  /** D1: the 12 stops (the bench and discover:stops use it; the spike's 3 stops otherwise) */
  stops?: () => readonly TourStop[];
  /** D1: go to a stop (discover:goto, ?stop=) */
  goto?: (stopId: string, o?: { instant?: boolean }) => Promise<void>;
  /** D2: robot cards and the viewer */
  robots?: { card(id: RobotId): CardSpec | null; open(id: RobotId): void; ids(): RobotId[] };
  /** D3: share the game (or a stop / robot once Discover is public) */
  share?: (what: ShareWhat) => Promise<void>;
}

export interface DiscoverSettings {
  readonly reducedMotion: boolean;
  readonly sound: boolean;
  setReducedMotion(on: boolean): void;
  setSound(on: boolean): void;
  onChange(fn: () => void): () => void;
}

/** src/discover/<pkg>/install.ts */
export type DiscoverInstall = (h: DiscoverHandle) => void | Promise<void>;

// ── the stills path (weak phones) ──────────────────────────────────────────────────────────────

/**
 * Why the stills tour runs: ?stills=1 (forced), the session's earlier choice, the crash marker of the
 * last 3D session, no WebGL2, missing WebGL2 features, navigator.deviceMemory ≤ 3, or the frame probe
 * (p90 > 80 ms over 3 s after the start card switched automatically; > 50 ms offered it).
 * ?stills=0 forces 3D (no detection, the probe only reports).
 */
export type StillsReason = 'forced' | 'session' | 'crash' | 'webgl2' | 'webgl' | 'memory' | 'probe';

/** One pre-rendered still: public/discover/stills/<stop>-720.webp and <stop>-1280.webp (D1's tool renders them). */
export interface StillSource {
  stop: string;
}

export interface StillsStage {
  readonly el: HTMLElement;
  /** show the still of a stop (cross-fade; a missing image shows the placeholder) */
  show(src: StillSource, alt: Text): Promise<void>;
}

export interface StillsHandle {
  reason: StillsReason;
  params: DiscoverParams;
  text: TextResolver;
  sheet: Sheet;
  topbar: TopBar;
  menu: Menu;
  ui: DiscoverUi;
  stage: StillsStage;
  /** onNav only (←/→, the sheet swipe and ‹ ›); there is no 3D view to tap */
  gestures: Pick<Gestures, 'onNav'>;
  modes: ModeRegistry;
  settings: DiscoverSettings;
  setLang(lang: Lang): void;
  /** clear the session's stills choice and reload into 3D (null when this phone cannot: no WebGL2) */
  try3d: (() => void) | null;
  /** D1 registers the same 12 stops */
  stops?: () => readonly TourStop[];
  /** D3 registers share (Game-free, src/discover/film/stills.ts) */
  share?: (what: ShareWhat) => Promise<void>;
}

/** src/discover/<pkg>/stills.ts */
export type StillsInstall = (h: StillsHandle) => void | Promise<void>;
