/**
 * ════════════════════════════════════════════════════════════════════════════
 *  EmAI Academy Island — PUBLIC ZONE API
 *  Zone code imports ONLY from '@/core/zones' (plus 'three' itself).
 *  Full guide with examples: docs/ARCHITECTURE.md
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Coordinates: metres, +Y up. A zone builds in LOCAL coordinates of `ctx.root`:
 *   origin = the plot anchor ON the walkable ground (y = 0 is the floor),
 *   local +Z points toward the hub (the player usually arrives from +Z, looking −Z),
 *   the zone may use the disc of radius `ctx.layout.radius` around the origin.
 * Every position/rotation argument below is zone-LOCAL unless it says "world".
 */
import type * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { Lang, Mode, Text, Vec3Input, Vec3Like } from '../types';
import type { LocalizedTables } from '@/i18n/I18n';
import type { MaterialLibrary } from '../brand/materials';
import type { Palette } from '../brand/palette';
import type { Surface, DynamicBody } from '../Physics';
import type { ShapeKind } from '../colliders';
import type { InteractableHandle, InteractableOptions } from '@/systems/Interaction';
import type { LoopHandle, LoopKind, LoopOptions, SfxName } from '@/systems/Audio';
import type { InfoCardSpec } from '@/ui/Modals';
import type { DialogueLine, SayOptions } from '@/ui/Dialogue';
import type { PanelHandle, PanelOptions, ToastOptions } from '@/ui/Hud';
import type { WorldLabelHandle, WorldLabelOptions } from '@/ui/WorldLabels';
import type { CompassMarkerHandle } from '@/ui/Compass';
import type { VirtualLightOptions } from '@/systems/LightPool';
import type { Text as TroikaText } from 'troika-three-text';
import type { ChipType, KennlinieHandle, KennlinieSpec, PredictOptions } from '@/ui/Kit';
import type { EmiGesture, EmiHandle } from '../emi/Emi';
import type { PredictionRecord, StampRecord } from '@/systems/Progress';
import type { EnvParams } from '../Environment';
import type { AreaManifest, PlotFrame, PlotKind, StationManifest, SystemId, TrimId } from './manifest';
import type { ZoneContextExtensions } from './ext';
import type { StampScope } from '../quest/types';

export type { Text, Lang, Mode, Vec3Input, Vec3Like, InfoCardSpec, DialogueLine, Surface, ShapeKind, SfxName, LoopKind };
export type { ChipType, KennlinieHandle, KennlinieSpec, PredictOptions, EmiGesture, EmiHandle, PredictionRecord, StampRecord, EnvParams };

// ── definition ────────────────────────────────────────────────────────────────

/** A station of the GDD three-stamp arc (A Probieren, B Verstehen, C Messen); its manifest fields are StationManifest's. */
export interface StationDef extends Omit<StationManifest, 'title'> {
  /** ◆ station (Entscheider core station). The field keeps its old name; ★ now means rating stars only. */
  star?: boolean;
  /** Pass title; default: string key 'zone.<zoneId>.<stationId>.title' if registered, else the id */
  title?: Text;
}

/**
 * Object returned by `create(ctx)` (GDD §5.1 style). Same semantics as the hooks on
 * ZoneDefinition: update/fixedUpdate only while the zone is ACTIVE (player within
 * `activeDistance` of the anchor), updateFar while it is not.
 */
export interface ZoneInstance {
  update?(dt: number, elapsed: number): void;
  fixedUpdate?(dt: number): void;
  /** ≤ 0.1 ms: animate exterior/far things (LiDAR fan, pendulum sway) while inactive */
  updateFar?(dt: number): void;
  onEnter?(): void;
  onExit?(): void;
  dispose?(): void;
}

export interface ZoneDefinition extends Partial<Omit<AreaManifest, 'id' | 'title' | 'stations' | 'spawn'>> {
  /** Must equal the folder name: src/zones/<id>/index.ts (kebab-case) */
  id: string;
  /** Display name. `name` (GDD) is accepted as an alias. */
  title?: { de: string; en: string };
  name?: { de: string; en: string };

  // ── manifest (GDD §5.1 — all optional; Phase 7: `...manifest` from the zone's eager manifest.ts) ──
  number?: number;
  verb?: { de: string; en: string };
  eyebrow?: { de: string; en: string };
  /** HUD/map glyph id: sensor | pendel | greifer | band | kiste | kurve */
  glyph?: string;
  /** exactly three in the GDD (A, B, C) — registered as pass stamps '<zoneId>.<stationId>' */
  stations?: readonly StationDef[];
  /** vendor-question cards this zone awards */
  questions?: readonly number[];
  /** hidden Failure-Mode-Album entry id */
  album?: string;
  /** railing gaps in local degrees (0 = local −z, clockwise from above) */
  railingGaps?: readonly { fromDeg: number; toDeg: number }[];
  /** player-to-anchor distance (m) within which the zone is ACTIVE (update runs). Default 60. */
  activeDistance?: number;
  /** Spawn point used by ?zone=<id> (local coords, yaw in degrees, 0 = facing local −Z). */
  spawn?: { position: Vec3Input; yawDeg?: number; /** look up (+) or down (−), degrees */ pitchDeg?: number };
  /** Call update()/fixedUpdate() even when inactive (default false). */
  alwaysUpdate?: boolean;

  // ── style A: hooks ──
  /**
   * Build everything here. May be async (await asset loads). Throwing is safe:
   * everything created through ctx is cleaned up and the zone is marked "error".
   */
  init?(ctx: ZoneContext): void | Promise<void>;
  /** Per render frame (variable dt, seconds) while active. */
  update?(dt: number, ctx: ZoneContext): void;
  /** Per physics step (fixed 1/60 s) while active — for controllers that push bodies. */
  fixedUpdate?(dt: number, ctx: ZoneContext): void;
  /** Per render frame while NOT active (keep ≤ 0.1 ms). */
  updateFar?(dt: number, ctx: ZoneContext): void;
  /** Player entered / left the plot radius. */
  onEnter?(ctx: ZoneContext): void;
  onExit?(ctx: ZoneContext): void;
  /** Extra cleanup. Everything made through ctx is removed automatically anyway. */
  dispose?(): void;

  // ── style B (GDD): factory ──
  /** Alternative to init(): build and return an instance object. May be async. */
  create?(ctx: ZoneContext): ZoneInstance | void | Promise<ZoneInstance | void>;
}

/** Public, serialisable view of a zone (for the island module, map, tests). */
export interface ZoneManifest {
  id: string;
  status: string;
  /** Phase 7 (§5.2): 'lobe' for the six island zones and code-only dev zones */
  kind: PlotKind;
  frame: PlotFrame;
  number: number | null;
  name: { de: string; en: string };
  verb: { de: string; en: string } | null;
  eyebrow: { de: string; en: string } | null;
  glyph: string | null;
  stations: StationDef[];
  questions: number[];
  album: string | null;
  railingGaps: { fromDeg: number; toDeg: number }[];
  /** what the area's ◆ starts (D23), and a trim started by the same ◆ */
  system: SystemId | null;
  trim: TrimId | null;
  /** false for a manifest-only area (no index.ts yet) */
  hasCode: boolean;
  /** world */
  anchor: [number, number, number];
  facingRad: number;
  radius: number;
  isFallback: boolean;
}

// ── layout ────────────────────────────────────────────────────────────────────

export interface ZoneLayout {
  /** World position of the local origin (on the ground). */
  readonly anchor: THREE.Vector3;
  /** Yaw (radians) of the local frame in the world. */
  readonly facing: number;
  /** Usable radius (m) of the plot. Build inside it. */
  readonly radius: number;
  /** World Y of the ground at the anchor (= anchor.y). */
  readonly groundY: number;
  /** true when the zone id is not in src/world/layout.ts and got a temporary fallback plot. */
  readonly isFallback: boolean;
}

// ── physics ───────────────────────────────────────────────────────────────────

export interface StaticBoxOptions {
  /** full size in metres [x, y, z] */
  size: Vec3Input;
  /** centre (local) */
  position?: Vec3Input;
  /** Euler XYZ radians (local) */
  rotation?: Vec3Input;
  friction?: number;
  restitution?: number;
  surface?: Surface;
  /** Also create a visible mesh with this material (convenience). */
  material?: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export interface StaticHandle {
  readonly colliders: RAPIER_NS.Collider[];
  /** the mesh created via `material` (if any) */
  readonly mesh: THREE.Mesh | null;
  remove(): void;
}

export interface DynamicOptions {
  /** kg — shown on hover; drives how heavy it feels when grabbed */
  mass: number;
  /** collider shape (default 'auto': exact for Box/Sphere/Cylinder/Capsule geometry, else bounding box) */
  shape?: ShapeKind;
  friction?: number; // default 0.6
  restitution?: number; // default 0.1
  /** default true */
  grabbable?: boolean;
  /** name in the grab prompt, e.g. { de: 'Kiste', en: 'Crate' } */
  label?: Text;
  linearDamping?: number;
  angularDamping?: number;
  /** continuous collision detection for small fast objects */
  ccd?: boolean;
  /** below the kill plane: 'reset' (default) to spawn, 'remove', or custom */
  onFall?: 'reset' | 'remove' | ((h: DynamicHandle) => void);
  surface?: Surface;
}

export interface DynamicHandle {
  readonly id: number;
  readonly body: RAPIER_NS.RigidBody;
  readonly collider: RAPIER_NS.Collider;
  readonly object: THREE.Object3D;
  readonly mass: number;
  readonly held: boolean;
  /** current local position / velocity (m, m/s) */
  position(out?: THREE.Vector3): THREE.Vector3;
  velocity(out?: THREE.Vector3): THREE.Vector3;
  /** teleport (local coords); resets velocity */
  setPosition(p: Vec3Input, rotation?: Vec3Input): void;
  /** back to the spawn transform */
  reset(): void;
  /** N·s, world-oriented local axes (= zone axes) */
  applyImpulse(impulse: Vec3Input): void;
  setGrabbable(v: boolean): void;
  remove(): void;
  /** @internal */
  readonly raw: DynamicBody;
}

export interface KinematicHandle {
  readonly body: RAPIER_NS.RigidBody;
  readonly object: THREE.Object3D;
  /** Move to a local pose at the next physics step (interpolated). rotation = Euler XYZ radians or quaternion. */
  setPose(position: Vec3Input, rotation?: Vec3Input | THREE.Quaternion): void;
  remove(): void;
}

export type TriggerShape =
  | { shape: 'box'; size: Vec3Input }
  | { shape: 'sphere'; radius: number }
  | { shape: 'cylinder'; radius: number; height: number };

export type TriggerOptions = TriggerShape & {
  /** centre (local) */
  position: Vec3Input;
  rotation?: Vec3Input;
  /** who fires it: 'player' (default), 'dynamic' (bodies only), 'any' */
  filter?: 'player' | 'dynamic' | 'any';
  onEnter?(e: { isPlayer: boolean; body: DynamicHandle | null }): void;
  onExit?(e: { isPlayer: boolean; body: DynamicHandle | null }): void;
};

export interface TriggerHandle {
  readonly playerInside: boolean;
  /** number of colliders currently inside */
  readonly count: number;
  remove(): void;
}

export interface RaycastHit {
  distance: number;
  /** local */
  point: THREE.Vector3;
  /** local */
  normal: THREE.Vector3;
  dynamic: DynamicHandle | null;
  isPlayer: boolean;
}

export interface ZonePhysics {
  /** the Rapier module (for advanced use: joints, custom shapes) */
  readonly rapier: typeof RAPIER_NS;
  readonly world: RAPIER_NS.World;
  /** world gravity (m/s²), read-only */
  readonly gravity: Readonly<Vec3Like>;
  /** A fixed body whose frame == the zone's local frame. Use it as the "world" side of joints. */
  readonly zoneBody: RAPIER_NS.RigidBody;
  addStaticBox(o: StaticBoxOptions): StaticHandle;
  addStaticCylinder(o: { radius: number; height: number; position?: Vec3Input; rotation?: Vec3Input; friction?: number; surface?: Surface }): StaticHandle;
  /** Collider(s) from an existing object (in the scene, in place): 'trimesh' (default, exact), 'box' (OBB), 'hull'. */
  addStaticFromMesh(object: THREE.Object3D, o?: { shape?: 'trimesh' | 'box' | 'hull'; friction?: number; surface?: Surface; fixInternalEdges?: boolean }): StaticHandle;
  /**
   * Alias for addStaticFromMesh(object, { shape: 'trimesh' }). `fixInternalEdges: true` (Rapier
   * FIX_INTERNAL_EDGES) stops the character controller catching on the seams of large walkable
   * meshes; the mesh must be clean and manifold (shared vertices, no T-junctions).
   */
  addStaticTrimesh(object: THREE.Object3D, o?: { friction?: number; surface?: Surface; fixInternalEdges?: boolean }): StaticHandle;
  /** Make an object a dynamic rigid body at its current transform (add it to ctx.root first). */
  addDynamic(object: THREE.Object3D, o: DynamicOptions): DynamicHandle;
  /** Kinematic (scripted) body — moving platforms, robot links that push things. */
  addKinematic(object: THREE.Object3D, o?: { shape?: ShapeKind; friction?: number }): KinematicHandle;
  addTrigger(o: TriggerOptions): TriggerHandle;
  /** Impulse joint between two bodies; anchors are in each body's local frame. Removed on dispose. */
  addJoint(data: RAPIER_NS.JointData, a: RAPIER_NS.RigidBody, b: RAPIER_NS.RigidBody): RAPIER_NS.ImpulseJoint;
  /** Ray in local coords (ignores sensors and the player unless includePlayer; sensorRays also skips SENSOR_IGNORE colliders). */
  raycast(origin: Vec3Input, direction: Vec3Input, maxDistance: number, o?: { includePlayer?: boolean; sensorRays?: boolean }): RaycastHit | null;
  /** Add a static collider that the player hits but sensor rays ignore (glass panes). */
  addStaticBoxSensorIgnore(o: StaticBoxOptions): StaticHandle;
  /** Register raw Rapier objects you created yourself so they are removed on dispose. */
  track(thing: RAPIER_NS.RigidBody | RAPIER_NS.Collider | RAPIER_NS.ImpulseJoint): void;
  /**
   * A private Rapier world for zone-only simulations (LiDAR ray worlds, tilted crates…).
   * Stepped at 60 Hz by the engine ONLY while the zone is active (autoStep), freed on dispose.
   * Coordinates inside it are yours (use zone-local).
   */
  createPrivateWorld(o?: { gravity?: Vec3Like; autoStep?: boolean }): RAPIER_NS.World;
  /**
   * Collision-group values for collider descs: `desc.setCollisionGroups(ctx.physics.groups.STATIC)`.
   * SENSOR_IGNORE = solid for the player and bodies, but skipped by ctx.physics.raycast(…, { sensorRays: true })
   * (glass invisible to LiDAR).
   */
  readonly groups: { readonly PLAYER: number; readonly STATIC: number; readonly DYNAMIC: number; readonly SENSOR: number; readonly SENSOR_IGNORE: number };
}

// ── hud ───────────────────────────────────────────────────────────────────────

export interface ZoneHud {
  toast(text: Text, o?: ToastOptions): void;
  /** Modal info card (releases the mouse). Resolves when closed. Mode-aware via spec.entdecker / spec.entscheider. */
  openInfoCard(spec: InfoCardSpec): Promise<void>;
  /** EMI (or another speaker) talks. Lines queue; resolves after the last line. */
  say(lines: DialogueLine | DialogueLine[], o?: SayOptions): Promise<void>;
  /** Top-left objective line (null clears it if this zone owns it). Optional compass target (local). */
  setObjective(text: Text | null, o?: { target?: Vec3Input }): void;
  /** DOM label following an object or a local point. */
  worldLabel(target: THREE.Object3D | Vec3Input, text: Text, o?: WorldLabelOptions): WorldLabelHandle;
  /** Compass marker (local point or object). */
  addMarker(target: THREE.Object3D | Vec3Input, label: Text, o?: { kind?: 'poi' | 'objective' }): CompassMarkerHandle;
  /** Right-side telemetry panel (rows of label/value in mono). */
  panel(o: PanelOptions): PanelHandle;
  /**
   * Custom modal for minigame UIs (sliders, buttons). The mouse is released while open.
   * `build` gets an empty container and a close function. Resolves on close.
   */
  openModal(build: (el: HTMLElement, close: () => void) => void | (() => void), o?: { width?: number }): Promise<void>;
  /**
   * Large title banner: mono eyebrow + display title, fades out by itself. Centred (cinematic titles);
   * `place: true` = the zone-entry location card on the left under the objective (arriving somewhere).
   */
  banner(eyebrow: Text, title: Text, o?: { place?: boolean }): void;
  /**
   * Cinematic caption (lower third, display type, no box): one short line for scripted cameras
   * (ascent, fly-throughs). Fades in, holds `seconds` (default 3.5), fades out; a new caption replaces it.
   */
  caption(text: Text | null, o?: { seconds?: number }): void;
  /** true while any modal (info card, pass, pause, custom) is open */
  readonly modalOpen: boolean;
  /**
   * true while a subtitle line is on screen or queued (any speaker, any owner). The event
   * 'dialogue:idle' fires once the queue has run empty and the last line has finished.
   */
  readonly dialogueBusy: boolean;
}

// ── misc services ─────────────────────────────────────────────────────────────

export interface ZoneI18n {
  /** Register this zone's strings (namespace = zone id). Keys: ctx.t('key') or { key: '<zoneId>.key' }. */
  register(tables: LocalizedTables): void;
  /** Translate (zone namespace first, then global keys like 'core.hud.mass'). */
  t(key: string, params?: Record<string, string | number>): string;
  /** Lazy Text bound to a zone key — re-resolves on language/mode change. */
  text(key: string, params?: Record<string, string | number>): Text;
  /** Resolve any Text now. */
  resolve(text: Text): string;
  /** Locale number formatting: num(12.5, 1) → "12,5" (de) */
  num(value: number, digits?: number): string;
  readonly lang: Lang;
  /** Called on language AND mode change. Auto-unsubscribed on dispose. */
  onChange(fn: () => void): void;
}

export interface ZoneAudio {
  play(name: SfxName, o?: { volume?: number; pitch?: number; at?: Vec3Input }): void;
  beep(freq?: number, dur?: number, o?: { volume?: number; at?: Vec3Input }): void;
  tone(o: { freq: number; to?: number; dur?: number; type?: OscillatorType; volume?: number; at?: Vec3Input }): void;
  /** Continuous sound (positional when `at` is an object or local point). Stopped on dispose. */
  loop(kind: LoopKind, o?: Omit<LoopOptions, 'at'> & { at?: THREE.Object3D | Vec3Input }): LoopHandle;
  /** The AudioContext (null until the first user gesture) — for custom procedural sounds. */
  readonly context: AudioContext | null;
  /** This zone's bus: full volume ≤ 20 m from the anchor, silent ≥ 60 m. Connect custom nodes here. */
  readonly zoneBus: GainNode | null;
  /** ISLAND MODULE ONLY: intensity 0…1 of the engine's ambient wind bed (edge proximity, gusts). */
  setWind(intensity: number): void;
}

export interface ZoneProgress {
  /** Declare a NON-station stamp so the Academy Pass can list it (call in init). id is zone-local ("ramp" → "<zoneId>.ramp"). Not counted by ctx.zones.stamps(). */
  registerStamp(id: string, title: Text, o?: { description?: Text; order?: number }): void;
  /** Award once (true if new). Shows the stamp animation. */
  awardStamp(id: string): boolean;
  hasStamp(id: string): boolean;
  readonly mode: Mode;
  /** Small persistent per-zone key/value storage (JSON-serialisable values). */
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}

export interface Text3DOptions {
  text: Text;
  /** 'display' Space Grotesk Bold (signage) · 'display-medium' · 'sans' Geist · 'sans-semibold' · 'mono' Geist Mono · 'mono-medium' */
  font?: 'display' | 'display-medium' | 'sans' | 'sans-semibold' | 'mono' | 'mono-medium';
  /** cap height-ish font size in metres (default 0.25) */
  size?: number;
  color?: THREE.ColorRepresentation;
  anchorX?: 'left' | 'center' | 'right';
  anchorY?: 'top' | 'middle' | 'bottom' | 'top-baseline' | 'bottom-baseline';
  maxWidth?: number;
  textAlign?: 'left' | 'right' | 'center' | 'justify';
  /** em units, e.g. 0.12 for eyebrows, -0.02 for display */
  letterSpacing?: number;
  lineHeight?: number;
  /** uppercase the resolved text (eyebrow style) */
  uppercase?: boolean;
  /** multiply colour brightness (>1.2 starts to bloom) */
  glow?: number;
  /** turn every frame to face the camera (yaw only) */
  billboard?: boolean;
  position?: Vec3Input;
  rotationY?: number;
}

export interface SignOptions {
  eyebrow?: Text;
  title: Text;
  body?: Text;
  /** panel width in metres (default 2.4) */
  width?: number;
  position?: Vec3Input;
  /** yaw (radians) */
  rotationY?: number;
  /** add a post/stand under the panel down to y=0 (default false) */
  stand?: boolean;
  /** title size (m), default width/12 */
  titleSize?: number;
}

export interface ZoneText3D {
  /** troika SDF text, added to ctx.root (or `parent`). Auto-updates on language change. */
  create(o: Text3DOptions, parent?: THREE.Object3D): TroikaText;
  /** Branded sign: dark panel, orange→teal hairline, eyebrow + title (+ body). Returns the group. */
  sign(o: SignOptions, parent?: THREE.Object3D): THREE.Group;
}

export interface ZoneAssets {
  /** URL of a file in public/zones/<zoneId>/ */
  zoneUrl(file: string): string;
  /** Cached glTF load → returns a deep CLONE of the scene each call. */
  loadModel(url: string, o?: { castShadow?: boolean; receiveShadow?: boolean }): Promise<THREE.Group>;
  /** Cached texture load (sRGB). */
  loadTexture(url: string): Promise<THREE.Texture>;
}

export interface ZonePlayer {
  /** world feet position (copy) */
  readonly position: THREE.Vector3;
  /** feet position in zone-local coords (copy) */
  positionLocal(out?: THREE.Vector3): THREE.Vector3;
  /** world eye position (copy) */
  readonly eye: THREE.Vector3;
  /** yaw (radians, world) / pitch */
  readonly yaw: number;
  readonly pitch: number;
  readonly grounded: boolean;
  /** m/s world */
  readonly velocity: THREE.Vector3;
  /** body currently held (if it belongs to this zone) */
  readonly holding: DynamicHandle | null;
  /** Teleport to local coords (feet). yawDeg local (0 = facing local −Z). fade = short black fade. */
  teleport(position: Vec3Input, o?: { yawDeg?: number; pitchDeg?: number; fade?: boolean }): void;
  /** Freeze movement (and optionally mouse look). Returns unlock; auto-unlocked on dispose. */
  lockControls(o?: { look?: boolean }): () => void;
  /** Player gravity multiplier (e.g. 0.165 for the Moon). Returns restore; auto-restored on dispose. */
  setGravityScale(scale: number): () => void;
  /** Drop whatever is held. */
  release(): void;
  /** world view direction (copy) */
  readonly direction: THREE.Vector3;
  /** GDD alias: lockMovement(true) freezes WASD until lockMovement(false). */
  lockMovement(locked: boolean): void;
  /** Teleport to local coords looking at a compass bearing (degrees, 0 = north/−Z world). */
  teleportLocal(position: Vec3Input, lookBearingDeg?: number): void;
  /** Walk/sprint speed multiplier. Returns restore. */
  setSpeedFactor(f: number): () => void;
  /** Head-bob multiplier (0 = off). Returns restore. */
  setHeadBob(scale: number): () => void;
  /** Extra screen vignette 0…1 (e.g. tunnels). Returns restore. */
  setVignette(a: number): () => void;
  /** Attach an object to the camera (a tool in hand); null detaches it. Default offset (0.28, −0.25, −0.55). */
  carry(object: THREE.Object3D | null): void;
  /** Camera micro-shake (ignored with reduced motion). */
  shake(amplitude?: number, duration?: number): void;
  /** Ballistic flight (jump pads): velocity in LOCAL axes (m/s), gravity default 9.81. Resolves on landing. */
  launch(velocity: Vec3Input, o?: { gravity?: number }): Promise<void>;
  /**
   * Bedienmodus (operate mode): eases the camera to `cameraPose` (local) in 0.4 s, frees the
   * cursor, disables WASD and look. Optional DOM `panel` (brand card, bottom-right) and
   * 3D pointer callback. Esc (or the returned exit()) leaves.
   */
  enterOperate(o: OperateOptions): () => void;
  readonly operating: boolean;
  /**
   * Scripted camera (intro flights, island module). While active, `set()` places the camera
   * (local coords) blended over the player's view by `blend` (0…1). `end()` hands the camera
   * back. Auto-ended on dispose. Lock the controls yourself if the player must not move.
   */
  cinematic(): { set(position: Vec3Input, lookAt: Vec3Input, blend?: number): void; end(): void };
}

export interface OperateOptions {
  cameraPose: { position: Vec3Input; lookAt?: Vec3Input; yawDeg?: number; pitchDeg?: number };
  /** eyebrow shown in the top bar, e.g. '// 01 · MESSSTRECKE' */
  title?: Text;
  panel?: (el: HTMLElement, exit: () => void) => void | (() => void);
  panelPosition?: 'right' | 'left' | 'bottom';
  /**
   * Pointer events on the 3D view; ray in zone-LOCAL coords. 'wheel' (mouse wheel over the view)
   * carries `deltaY` in pixels (one notch ≈ 100, positive = towards the user).
   */
  onPointer?(e: { type: 'down' | 'move' | 'up' | 'wheel'; ndc: { x: number; y: number }; origin: THREE.Vector3; direction: THREE.Vector3; button: number; deltaY?: number }): void;
  onExit?(): void;
}

export interface ZoneEvents {
  on(type: string, fn: (payload: any) => void): () => void;
  once(type: string, fn: (payload: any) => void): () => void;
  /** Prefix custom events with your zone id: 'robot-lab:door-open' */
  emit(type: string, payload?: unknown): void;
}

export interface ZoneTime {
  /** seconds since game start (paused time excluded) */
  readonly elapsed: number;
  /** last frame delta (s) */
  readonly dt: number;
  readonly frame: number;
}

export interface ZoneDebug {
  readonly enabled: boolean;
  log(...args: unknown[]): void;
  /** small coloured marker sphere at a local point (only visible with ?debug=1) */
  marker(position: Vec3Input, color?: THREE.ColorRepresentation): void;
  /**
   * Deterministic test hook: `window.__academy.solve('<zoneId>', 'solve-a')`.
   * Conventional names: 'solve-a' | 'solve-b' | 'solve-c' | 'album'.
   */
  register(name: string, fn: () => unknown): void;
}

export interface ZoneInput {
  /** physical key (KeyboardEvent.code, e.g. 'Digit1', 'KeyV') currently held */
  isDown(code: string): boolean;
  /** pressed this frame (edge) */
  pressed(code: string): boolean;
  /**
   * keydown handler (no repeats). By default only while the player is inside the plot and no
   * modal is open (operate mode counts as open → set whileOperating). Engine-reserved keys:
   * WASD, arrows, Space, Shift, E, F, Tab, Esc, Enter, H, M, O, ` and F3 — use digits, V, R, …
   */
  onKey(codes: string | string[], fn: (code: string) => void, o?: { anywhere?: boolean; whileOperating?: boolean }): () => void;
}

export interface ZoneUi {
  /** = hud.openInfoCard */
  card(spec: InfoCardSpec): Promise<void>;
  /** subtitle line with a speaker tag (e.g. 'EMI-03 ›') */
  subtitle(speaker: Text, text: Text | Text[], o?: { manual?: boolean }): Promise<void>;
  /** small centred hint (seconds ≤ 0 = until cleared). Returns clear(). */
  hint(text: Text | null, seconds?: number): () => void;
  /** persistent mono eyebrow under the compass, e.g. '// SENSOR · TIEFE'; null clears */
  status(text: Text | null): void;
  /** source chip element (SIM · LIVE, STUDIE, QUELLE, RICHTWERT, ILLUSTRATIV, FIKTION) */
  chip(type: ChipType, source?: Text): HTMLElement;
  /** = hud.panel */
  panel(o: PanelOptions): PanelHandle;
  /** one-line telemetry readout in the right column */
  readout(label: Text, value?: string): { set(v: string): void; remove(): void; readonly el: HTMLElement };
  /** „Erst tippen, dann messen" slider; resolves with the prediction */
  predict(o: PredictOptions): Promise<number>;
  /** Kennlinie with optional Wilson 95 % band — HUD card or CanvasTexture for in-world screens */
  kennlinie(spec: KennlinieSpec, o?: { target?: 'panel' | 'texture'; width?: number; height?: number; parent?: HTMLElement }): KennlinieHandle;
  /** generic line plot (= kennlinie without band) */
  plot(spec: KennlinieSpec, o?: { target?: 'panel' | 'texture'; width?: number; height?: number; parent?: HTMLElement }): KennlinieHandle;
  /** „73 % [66–79] · n = 200" */
  formatRate(k: number, n: number): string;
  /** Wilson 95 % interval → [p, lo, hi] */
  wilson(k: number, n: number): [number, number, number];
}

export interface ZonePass {
  /** Stamp a station ('messstrecke' → '<zoneId>.messstrecke') with the player's measured value. */
  award(stationId: string, o?: { value?: Text; skipped?: boolean; curve?: number[] }): boolean;
  has(stationId: string): boolean;
  /** Prognose-Güte input: deviation = |p − m| / (max − min) × 100 (log10 for scale 'log'). */
  recordPrediction(stationId: string, predicted: number, measured: number, o: { min: number; max: number; scale?: 'linear' | 'log' }): PredictionRecord;
  awardQuestion(n: number): boolean;
  /** Register a question-card text (the island module registers all nine from GDD Appendix C). */
  registerQuestion(n: number, text: Text, why?: Text): void;
  /** Register this zone's album entry text (call in init/create). */
  registerAlbum(o: { id: string; title: Text; text: Text; hint?: Text }): void;
  unlockAlbum(id: string): boolean;
  setBest(key: string, value: number, better?: 'higher' | 'lower'): boolean;
  getBest(key: string): number | null;
  /** Question cards the player holds (from any zone), e.g. the Prüffeld's vendor terminal. */
  hasQuestion(n: number): boolean;
  questions(): number[];
  /**
   * Read-only view of the whole Pass across all zones (the finale's lesson posts and certificate):
   * every registered stamp with its record, the question cards, album, predictions, best values
   * and the Prognose-Güte. Returns copies; never mutate the engine's data through it.
   */
  snapshot(): PassSnapshot;
  /**
   * additive (WP11, Request(WP4)): every registered album entry with its text and whether the player has
   * it — the Schauhalle's Pannen-Wand shows them as exhibits (plan §3.4). Read-only copies.
   */
  album?(): { id: string; zoneId: string; title: Text; text: Text; found: boolean }[];
}

export interface PassSnapshotStamp {
  /** '<zoneId>.<stationId>' */
  id: string;
  zoneId: string;
  stationId: string;
  title: Text;
  /** ◆ station (Entscheider core station; the field keeps its old name) */
  star: boolean;
  /** non-station stamp (progress.registerStamp) */
  extra: boolean;
  record: StampRecord | null;
  /** best rating stars of the station's challenge (0 without one) */
  stars: Stars;
  /** best metric value of the station's challenge */
  best: number | null;
}

export interface PassSnapshot {
  stamps: PassSnapshotStamp[];
  questions: number[];
  album: string[];
  predictions: Record<string, PredictionRecord>;
  best: Record<string, number>;
  prognoseGuete: number | null;
  /** ★ over all stations (max 54) */
  starsTotal: number;
  starsMax: number;
  /** Sensorkapseln found / placed */
  capsules: number;
  capsulesTotal: number;
}

export interface ZoneEmi {
  /** Spawn an EMI unit (e.g. 'EMI-02') at a local pose; removed on dispose. */
  spawn(o: { unit: string; position?: Vec3Input; yawDeg?: number; parent?: THREE.Object3D }): EmiHandle;
}

export interface ZoneEnv {
  /** ISLAND MODULE ONLY: tune sky, sun, fog, cloud sea, exposure, tone mapping (see EnvParams). */
  set(p: Partial<EnvParams>): void;
  readonly params: Readonly<EnvParams>;
  /** Closed volumes: scale ambient light, optionally override background + fog. Returns exit(). */
  enterInterior(o: { ambient: number; background?: THREE.ColorRepresentation; fog?: { color: THREE.ColorRepresentation; density: number } }): () => void;
  exitInterior(): void;
}

export interface ZoneIsland {
  /** gust events emitted by the island module: strength 0…1, bearing degrees */
  onGust(fn: (g: { strength: number; bearing: number }) => void): () => void;
  /** current visual tilt (degrees) */
  readonly tiltDeg: { readonly roll: number; readonly pitch: number };
  /** island module / finale only: emit a gust */
  emitGust(g: { strength: number; bearing: number }): void;
  /** island module / finale only: visual tilt, clamped ±3° (no-op with reduced motion) */
  setTilt(rollDeg: number, pitchDeg: number): void;
}

export interface ZoneSettings {
  readonly reducedMotion: boolean;
  readonly quality: 'low' | 'medium' | 'high';
  /** O key toggles in-world explanation overlays */
  readonly overlays: boolean;
  /** Phase 7 (D24, Settings v4; WP1): the lift-off may cut to its outside shots C1/C2 (WP13) */
  readonly exteriorCams: boolean;
  onChange(fn: () => void): () => void;
}

export interface ZoneGroups {
  /** stations, interiors, small props — visible ≤ 45 m from the anchor */
  readonly detail: THREE.Group;
  /** landmark, shell, ground — visible ≤ 130 m */
  readonly exterior: THREE.Group;
  /** silhouette — visible > 130 m */
  readonly far: THREE.Group;
}

export interface ZoneLights {
  /** Virtual point light (engine renders the 4 nearest). Prefer emissive materials; use lights sparingly. */
  point(position: Vec3Input | THREE.Object3D, o?: VirtualLightOptions): { setIntensity(v: number): void; setColor(c: THREE.ColorRepresentation): void; remove(): void };
}

// ── game layer (docs/FUN-PLAN.md §4): stars, results, juice, capsules, skills ──

/** Rating stars 0–3. ★ = the station's stamp condition, ★★ = lesson understood, ★★★ = practice or a discovery. */
export type Stars = 0 | 1 | 2 | 3;
export type SkillId = 'sehen' | 'regeln' | 'greifen' | 'lernen' | 'arbeiten' | 'messen';
/** Calibrated procedural cues on the cues bus (peak −18 … −9 dBFS). */
export type CueName = 'good' | 'great' | 'bad' | 'oops' | 'tick' | 'go' | 'star' | 'pb' | 'collect';
export type JuiceTone = 'good' | 'bad' | 'accent' | 'teal' | 'muted';

export interface StarGoal {
  /** What this star asks for, ≤ 8 words („Halte den 2-m-Stab 8 s"). Shown as a goal chip, in the banner and in the Pass. */
  text: Text;
  /**
   * Optional threshold in metric units: met when value ≥ at (better 'higher') or ≤ at (better 'lower').
   * A goal WITHOUT `at` is met by any submit only for goal 0 (the completed attempt = the stamp condition);
   * goals 1–2 without `at` need `submit(value, { stars })`.
   */
  at?: number;
}

export interface ChallengeDef {
  /** Station id from defineZone({ stations }), one challenge per station. Any other id needs station: false. */
  id: string;
  /** default true: rolls up into the station's stars (Pass, gate, map, total ★ x/54) */
  station?: boolean;
  /** The toy's goal in ≤ 8 words („Fädle drei Ringe ein"). */
  title: Text;
  /** The measured quantity, when there is one (time, count, %). digits default: 1 for 's', else 0. */
  metric?: { label: Text; unit?: string; better: 'higher' | 'lower'; digits?: number };
  /** ★, ★★, ★★★ in ascending difficulty. ★ MUST equal the station's existing stamp condition. */
  goals: [StarGoal, StarGoal, StarGoal];
  /** The one-line "aha" shown with the first ★ result: ≤ 14 words, ModeString allowed. */
  lesson?: Text;
  /** The former auto card. Opened only via [H] while the banner is up, or from the Pass. Never opens by itself. */
  why?: () => InfoCardSpec;
  /** Instant retry (≤ 1 s to playable): the banner button and [R] while the banner or fail flash is up. */
  retry?: () => void;
  /** The zone's EMI that reacts to results (rate-limited, interrupting). */
  emi?: EmiHandle;
  /** EMI reactions; core defaults exist (personal best, three stars, a fail pool). */
  lines?: { pb?: Text; star3?: Text; fail?: Text[] };
}

export interface ChallengeResult {
  value: number | null;
  /** stars of THIS attempt */
  stars: Stars;
  /** stored best stars after this attempt */
  best: Stars;
  prevStars: Stars;
  /** best > prevStars */
  newStars: boolean;
  /** the metric improved on an earlier value */
  personalBest: boolean;
  bestValue: number | null;
  prevBest: number | null;
}

export interface ChallengeHandle {
  /** '<zoneId>.<id>' */
  readonly key: string;
  /** persisted best stars */
  readonly stars: Stars;
  /** persisted best metric value */
  readonly best: number | null;
  readonly attempts: number;
  /** Start an attempt: counts it, closes an open banner. Optional 3-2-1-LOS countdown (any key skips; resolves at LOS) and HUD timer. */
  begin(o?: { countdown?: boolean; timer?: { seconds: number; label?: Text } }): Promise<void>;
  /** Live value chip during an attempt („4,2 s", „3/5"); null hides it. */
  live(text: Text | null): void;
  /**
   * Finish an attempt. Stars come from goals[i].at unless o.stars is given (compound goals).
   * Persists, shows the result banner (merged with a stamp awarded within 1.5 s), lets the EMI react,
   * fires events. quiet: persist + events only (reloads, silent upgrades).
   */
  submit(value: number | null, o?: { stars?: Stars; detail?: Text; quiet?: boolean }): ChallengeResult;
  /** A failed attempt: fail flash ≤ 2.5 s with a funny-informative reason (≤ 10 words) and [R]; EMI fail line (≤ 1 per 8 s). */
  fail(reason: Text): void;
  /** Three goal chips (☆/★ + text), live-updating. Mount in your operate panel's top row, or in your HUD column for first-person stations. */
  chips(): HTMLElement;
}

export interface ZoneJuice {
  /** Particle burst (one engine-wide pooled InstancedMesh, ≤ 256 particles, 1 draw call). Local coords like the rest of ctx. */
  burst(at: Vec3Input | THREE.Object3D, o?: { tone?: 'orange' | 'teal' | 'stone'; count?: number; spread?: number }): void;
  /** Floating world label that rises and fades („+18 kg", „Glas? Für LiDAR: Luft."). Local coords. */
  popup(at: Vec3Input | THREE.Object3D, text: Text, o?: { tone?: JuiceTone; seconds?: number }): void;
  /** Screen-edge flash, 250 ms (DOM). Off with reduced motion. */
  pulse(tone?: JuiceTone, strength?: number): void;
  /** Calibrated procedural cue on the cues bus (peak −18 … −9 dBFS). `at` = local point (spatialised). */
  cue(name: CueName, o?: { at?: Vec3Input; pitch?: number; volume?: number }): void;
  /** 3-2-1-LOS overlay and cues; any key skips. Resolves at LOS. */
  countdown(o?: { from?: number }): Promise<void>;
}

export interface ZoneCollectibles {
  /**
   * Place one Sensorkapsel (local coords). Already-found ids are not spawned. Pickup: player within `radius`
   * (default 1.2 m), also during jump-pad flights. Core builds the visual (instanced, 1 draw call for all)
   * and the pickup effect. Ids: '<zoneId>.kapsel' for zones, 'world.<name>' for the island.
   */
  place(o: { id: string; position: Vec3Input; radius?: number }): { readonly found: boolean; remove(): void };
  found(): string[];
  has(id: string): boolean;
  /** number of placed ids, found or not (12 when all owners placed theirs) */
  total(): number;
  /** for EMI-01's hint (world coords; bearing in compass degrees, 0 = north/−Z, 90 = east/+X; `world` = the capsule's world centre) */
  nearestUnfound(fromWorld: Vec3Input): { id: string; distance: number; bearing: number; world?: [number, number, number] } | null;
}

export interface ZoneSkills {
  /** EMI-01's six skills; a zone's skill unlocks with its first EARNED (non-skipped) stamp */
  list(): { id: SkillId; zoneId: string; unlocked: boolean }[];
  has(id: SkillId): boolean;
}

export interface ZoneGame {
  /** Register a challenge once in init/create (same id again replaces the def and keeps the record). */
  challenge(def: ChallengeDef): ChallengeHandle;
  readonly juice: ZoneJuice;
  readonly collectibles: ZoneCollectibles;
  readonly skills: ZoneSkills;
  /** stars of one zone (or all): byStation = best stars per station id (keys '<zoneId>.<stationId>' when all) */
  stars(zoneId?: string): { stars: number; max: number; byStation: Record<string, Stars> };
  /**
   * island-wide numbers for the tower, masts, map and certificate. Phase 7 (WP1): `scope` 'island' (the
   * default: areas of kind 'lobe', the rc4 meaning) or 'all'.
   */
  progress(o?: { scope?: StampScope }): { earnedStamps: number; stamps: number; stars: number; maxStars: number; capsules: number; capsulesTotal: number; finaleEnded: boolean };
}

/**
 * Phase 7 packages add fields through `ZoneContextExtensions` (src/core/zones/ext.ts, augmented in
 * their own types.<pkg>.ts) and `registerContextExtension`, so nobody edits this interface for them.
 */
export interface ZoneContext extends ZoneContextExtensions {
  readonly id: string;
  readonly title: { de: string; en: string };
  /**
   * Game layer (docs/FUN-PLAN.md §4): challenges with 1–3 stars, personal bests and an instant retry,
   * the result banner, juice (burst, popup, pulse, cue, countdown), Sensorkapseln and EMI skills.
   * Same object for zones, the island module and the finale.
   */
  readonly game: ZoneGame;
  /** Group at the plot anchor/facing. Build EVERYTHING under it, in local coordinates. */
  readonly root: THREE.Group;
  readonly layout: ZoneLayout;
  /** The scene (read-only use — add to root instead). */
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly physics: ZonePhysics;
  /** Aim-and-press interaction with hover highlight and "[E] label" prompt. */
  addInteractable(o: InteractableOptions): InteractableHandle;
  readonly hud: ZoneHud;
  readonly i18n: ZoneI18n;
  /** shortcut for i18n.t */
  t(key: string, params?: Record<string, string | number>): string;
  readonly audio: ZoneAudio;
  readonly progress: ZoneProgress;
  readonly materials: MaterialLibrary;
  readonly palette: Palette;
  readonly text3d: ZoneText3D;
  readonly assets: ZoneAssets;
  readonly player: ZonePlayer;
  readonly events: ZoneEvents;
  readonly time: ZoneTime;
  readonly debug: ZoneDebug;
  readonly lights: ZoneLights;
  /** keyboard for minigames (digits, V, …) */
  readonly input: ZoneInput;
  /** detail tiers (children of root, visibility switched by distance) */
  readonly groups: ZoneGroups;
  /** GDD kit: measurement UI */
  readonly ui: ZoneUi;
  /** GDD pass API (stations, predictions, question cards, album, best values) */
  readonly pass: ZonePass;
  readonly emi: ZoneEmi;
  readonly env: ZoneEnv;
  readonly island: ZoneIsland;
  readonly settings: ZoneSettings;
  /** GDD alias: register(object, { label, radius, onUse, enabled }) */
  readonly interact: { register(object: THREE.Object3D, o: { label: Text; radius?: number; onUse: () => void; enabled?: () => boolean; hint?: Text }): InteractableHandle };
  /** GDD alias of text3d: sign() + label() (Geist Mono eyebrow) */
  readonly text: { sign(o: SignOptions, parent?: THREE.Object3D): THREE.Group; label(o: Omit<Text3DOptions, 'font'>, parent?: THREE.Object3D): TroikaText };
  /**
   * Zone manifests (names, glyphs, stations, anchors) — e.g. for gate masts and the map. Default kind
   * 'lobe' (the six island zones: rc4 consumers stay unchanged); { kind: 'all' } for halls and sites too.
   */
  readonly zones: { list(o?: { kind?: PlotKind | 'all' }): ZoneManifest[]; stamps(zoneId: string): number; visited(zoneId: string): boolean };
  /** Current audience mode / language (live). */
  readonly mode: Mode;
  readonly lang: Lang;
  /** Player within layout.radius of the anchor (horizontal). */
  readonly playerInside: boolean;
  /** Horizontal distance player ↔ anchor (m). */
  readonly playerDistance: number;
  /** local → world (new Vector3 unless `out`) */
  toWorld(local: Vec3Input, out?: THREE.Vector3): THREE.Vector3;
  /** world → local */
  toLocal(world: Vec3Input, out?: THREE.Vector3): THREE.Vector3;
  /** Run once after `seconds` (game time; paused while the game is paused). Returns cancel. */
  after(seconds: number, fn: () => void): () => void;
  /** Run every `seconds`. Returns cancel. */
  every(seconds: number, fn: () => void): () => void;
  /** Extra cleanup callback run on dispose. */
  onDispose(fn: () => void): void;
  /**
   * Static subtree (C11b): sets matrixAutoUpdate = false on `obj` and all descendants and bakes
   * their matrices once. Call it after the subtree is built and placed; anything moved later
   * needs its own updateMatrix(). Never call it on parts that animate, sway or follow physics.
   */
  freezeStatic(obj: THREE.Object3D): void;
  /**
   * Hand the main thread back for one task (scheduler.yield() or a macrotask) between long
   * build steps in init; also advances the loading bar's sub-step. `await ctx.yield()`.
   */
  yield(): Promise<void>;
  /**
   * Z1: bake the static meshes under `obj` into one draw per material (and opaque untextured
   * MeshStandardMaterials into one shared vertex-attribute material), detach the originals and
   * freeze what is left. Call it once at the end of init, e.g. on `ctx.groups.exterior`. Put
   * everything that moves, changes material or visibility, or is looked up later in `keep`
   * (interactables and physics bodies are kept automatically). Dev builds warn when a merged
   * or frozen object changes afterwards. See src/core/zones/mergeStatic.ts.
   */
  mergeStatic(obj: THREE.Object3D, o?: import('./mergeStatic').MergeStaticOptions): import('./mergeStatic').MergeStaticReport;
}
