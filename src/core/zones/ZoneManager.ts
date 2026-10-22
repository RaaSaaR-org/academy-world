import * as THREE from 'three';
import type { Game } from '../Game';
import type { Scope } from '../Scheduler';
import { FALLBACK_RING, HUB, PLOTS, ZONE_PLOTS, facingTowardHub, plotEdgeDistance, shapeOf, type PlotDef } from '@/world/layout';
import { createZoneContext, type ZoneRuntimeState } from './createZoneContext';
import { AREA_RETRY_DELAYS, importRetry } from '../retry';
import { starSvg } from '@/ui/ResultUi';
import type { AreaManifest, PlotFrame, PlotKind } from './manifest';
import type { PlotShape, PlotTiers } from './types.frames';
import type { Interactable } from '@/systems/Interaction';
import type { VirtualLight } from '@/systems/LightPool';
import type { ZoneContext, ZoneDefinition, ZoneInstance, ZoneLayout, ZoneManifest } from './types';

/** 'manifest' = an area with a manifest but no code yet: it reserves its plot and registers no stamps. */
export type ZoneStatus = 'pending' | 'loading' | 'loaded' | 'initializing' | 'ready' | 'error' | 'skipped' | 'manifest';

export interface ZoneRecord {
  id: string;
  status: ZoneStatus;
  error: string | null;
  stack: string | null;
  def: ZoneDefinition | null;
  instance: ZoneInstance | null;
  ctx: ZoneContext | null;
  scope: Scope | null;
  state: ZoneRuntimeState | null;
  plot: PlotDef | null;
  layout: ZoneLayout | null;
  isFallback: boolean;
  loadMs: number;
  initMs: number;
  updateErrors: number;
  inside: boolean;
  loader: (() => Promise<unknown>) | null;
  path: string;
  /** the eager manifest (src/zones/<id>/manifest.ts); null for code-only areas (dev zones), whose manifest is their definition */
  manifest: AreaManifest | null;
  /** Phase 7 (plan §5.2): the plot's shape and its tiers, measured from the shape's edge */
  shape: PlotShape;
  tiers: PlotTiers;
  /** while the player is inside, other areas cap at their exterior tier */
  interior: boolean;
  /** Phase 7 (plan §5.3 rule 3): a ground area above 1 m — no update, root detached, far tier only */
  suspended: boolean;
  susp: SuspendState | null;
}

/** What suspend() changed, so resume() can put it back. */
interface SuspendState {
  parent: THREE.Object3D | null;
  /** holds the far tier at the root's pose while the root is detached */
  holder: THREE.Group;
  interact: Map<Interactable, boolean>;
  lights: Map<VirtualLight, boolean>;
}

export interface ZoneStatusInfo {
  id: string;
  status: ZoneStatus;
  error: string | null;
  plot: { id: string; anchor: [number, number, number]; radius: number; fallback: boolean } | null;
  active: boolean;
  loadMs: number;
  initMs: number;
  updateErrors: number;
}

// Plan §5.6: the manifests are EAGER (main chunk, before the title); the code is lazy: every
// src/zones/<id>/index.ts is its own chunk, loaded through the queue below, and a broken file only
// breaks its own dynamic import. Dev-only zones (id starts with "_") are excluded from builds; they
// keep their manifest in their code (an eager glob would ship them).
const MANIFESTS = import.meta.glob<{ default: AreaManifest }>(['/src/zones/*/manifest.ts', '!/src/zones/_*/manifest.ts'], { eager: true });
const PROD_ZONES = import.meta.glob(['/src/zones/*/index.ts', '!/src/zones/_*/index.ts']);
const DEV_ZONES: Record<string, () => Promise<unknown>> = import.meta.env.DEV ? import.meta.glob('/src/zones/_*/index.ts') : {};

const folderOf = (path: string): string => path.split('/')[3] ?? '';

/** The manifest fields the engine reads, from an eager manifest or (code-only dev zones) a definition. */
type AreaSource = Pick<ZoneDefinition, 'number' | 'verb' | 'eyebrow' | 'glyph' | 'stations' | 'questions' | 'album' | 'railingGaps' | 'kind' | 'frame' | 'system' | 'trim'>;

/** Every shipped area manifest by id (before any zone code loads: the quest spine, the star pool, the save migration). */
export const AREA_MANIFESTS: ReadonlyMap<string, AreaManifest> = new Map(
  Object.entries(MANIFESTS)
    .map(([path, mod]) => {
      const m = mod.default;
      if (m && m.id !== folderOf(path)) console.warn(`[zones] ${path} declares id "${m.id}" — using the folder name`);
      return [folderOf(path), m ? { ...m, id: folderOf(path) } : null] as const;
    })
    .filter((e): e is readonly [string, AreaManifest] => !!e[0] && !!e[1])
    .sort((a, b) => a[0].localeCompare(b[0])),
);

/** Stub reachability (WPS): island areas (lobes, halls) load after the title; sites only when forced (?zone=, ?area=, ?only=, loadAll). WP4 wires it to ctx.quest (regionOpen). */
const DEFAULT_REACHABLE = (a: ZoneManifest): boolean => a.kind !== 'site';
/** downloads of area code at once (the rest waits in the queue) */
const MAX_FETCHES = 2;

const INIT_TIMEOUT_MS = 20000;
const MAX_UPDATE_ERRORS = 3;
const DEFAULT_ACTIVE_DISTANCE = 60;
/** rc4 tiers from the anchor; a plot without `tiers` gets these minus its radius, from its edge */
const DETAIL_DISTANCE = 45;
const EXTERIOR_DISTANCE = 130;
/** QA-20: ± hysteresis (m) around the tier distances, so standing on the line does not flicker */
const LOD_HYST = 2.5;
const HUD_MARGIN = 4;

export function titleOf(def: ZoneDefinition | null, id: string): { de: string; en: string } {
  return def?.title ?? def?.name ?? { de: id, en: id };
}

/** An idle slot between frames (requestIdleCallback, at most 250 ms away), else the next task. */
export function idleSlot(): Promise<void> {
  const ric = (globalThis as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  return new Promise((r) => (ric ? ric(() => r(), { timeout: 250 }) : window.setTimeout(r, 16)));
}

export class ZoneManager {
  readonly records = new Map<string, ZoneRecord>();
  readonly group = new THREE.Group();

  constructor(private game: Game) {
    this.group.name = 'zones';
    game.rs.scene.add(this.group);
    // plan §5.6: the objective area loads (and fetches its robots) first
    game.events.on('objective:changed', (p?: { areaId?: string | null; zone?: string | null }) => {
      this.objective = p?.areaId ?? p?.zone ?? null;
    });
    // plan §5.8: „Erneut laden“ on the loading card (WP1)
    game.events.on('zones:retry', (p?: { id?: string }) => {
      if (p?.id) void this.retry(p.id);
    });
  }

  /** An area in error loads again from scratch (its code import with the retries, then its init). */
  async retry(id: string): Promise<void> {
    const rec = this.records.get(id);
    // a load or init failure (no context left); an area that broke at runtime keeps its error
    if (!rec || rec.status !== 'error' || !rec.loader || rec.ctx) return;
    rec.status = 'pending';
    rec.error = null;
    rec.stack = null;
    rec.def = null;
    rec.updateErrors = 0;
    this.imports.delete(id);
    this.forced.add(id);
    await this.load([rec]);
  }

  /** the area the objective points at ('objective:changed', WP12) */
  objective: string | null = null;

  /** Which area folders exist (manifest, code or both) and which of them should load for these launch params. */
  discover(): ZoneRecord[] {
    const p = this.game.params;
    const code: Record<string, () => Promise<unknown>> = { ...PROD_ZONES, ...DEV_ZONES };
    const loaders = new Map(Object.entries(code).map(([path, loader]) => [folderOf(path), { path, loader }]));
    const ids = [...new Set([...AREA_MANIFESTS.keys(), ...loaders.keys()])].filter(Boolean).sort();
    const out: ZoneRecord[] = [];
    for (const id of ids) {
      const c = loaders.get(id) ?? null;
      const manifest = AREA_MANIFESTS.get(id) ?? null;
      const devOnly = id.startsWith('_');
      let skip = false;
      if (devOnly && !(p.dev || p.zone === id || p.only?.includes(id))) skip = true;
      if (p.only && !p.only.includes(id)) skip = true;
      const rec: ZoneRecord = {
        id,
        status: skip ? 'skipped' : c ? 'pending' : 'manifest',
        error: null,
        stack: null,
        def: null,
        instance: null,
        ctx: null,
        scope: null,
        state: null,
        plot: null,
        layout: null,
        isFallback: false,
        loadMs: 0,
        initMs: 0,
        updateErrors: 0,
        inside: false,
        loader: c?.loader ?? null,
        path: c?.path ?? `/src/zones/${id}/manifest.ts`,
        manifest,
        shape: { kind: 'circle', r: 26 },
        tiers: { detail: DETAIL_DISTANCE - 26, exterior: EXTERIOR_DISTANCE - 26 },
        interior: false,
        suspended: false,
        susp: null,
      };
      this.records.set(id, rec);
      out.push(rec);
    }
    if (p.only) for (const id of p.only) if (!this.records.get(id)?.loader) console.warn(`[zones] ?only=${id}: no folder src/zones/${id}/index.ts`);
    // ?zone= / ?area= / ?only= load an area whether or not it is reachable yet
    for (const id of [p.zone, ...(p.only ?? [])]) if (id) this.forced.add(id);
    this.assignPlots([...this.records.values()]);
    // stamps from the manifests, before the title (code-only areas register theirs once their code is in)
    for (const rec of out) if (rec.status === 'pending' && rec.manifest) this.registerStations(rec);
    return out.filter((r) => r.status === 'pending');
  }

  /** The area's manifest data: the eager manifest, or (code-only dev zones) its definition once imported. */
  private source(rec: ZoneRecord): AreaSource | null {
    return rec.manifest ?? rec.def;
  }

  kindOf(rec: ZoneRecord): PlotKind {
    return this.source(rec)?.kind ?? 'lobe';
  }

  frameOf(rec: ZoneRecord): PlotFrame {
    return this.source(rec)?.frame ?? 'island';
  }

  /** Display title from the manifest (or the definition), else the plot's name, else the id. */
  titleFor(rec: ZoneRecord): { de: string; en: string } {
    if (rec.manifest) return rec.manifest.title;
    if (rec.def) return titleOf(rec.def, rec.id);
    return ZONE_PLOTS.find((p) => p.id === rec.id)?.name ?? { de: rec.id, en: rec.id };
  }

  /** The area has code that is not imported, imported or initialising yet (it can still become ready). */
  loadable(id: string): boolean {
    const st = this.records.get(id)?.status;
    return st === 'pending' || st === 'loading' || st === 'loaded' || st === 'initializing';
  }

  private imports = new Map<string, Promise<void>>();

  /** Import one area's code chunk (no init). Never throws; resolves when the import has settled. */
  ensureImported(id: string): Promise<void> {
    const rec = this.records.get(id);
    if (!rec || !rec.loader || rec.status !== 'pending') return this.imports.get(id) ?? Promise.resolve();
    rec.status = 'loading';
    const t0 = performance.now();
    const p = (async () => {
      try {
        // plan §5.8: 3 automatic retries with backoff (1, 3, 9 s), then 'zones:failed' (the loading card)
        const mod = (await importRetry(rec.loader!, AREA_RETRY_DELAYS)) as { default?: ZoneDefinition };
        const def = mod?.default;
        if (!def || typeof def !== 'object' || (typeof def.init !== 'function' && typeof def.create !== 'function'))
          throw new Error('index.ts must `export default defineZone({ ...manifest, init(ctx) })` (or create(ctx))');
        if (def.id !== rec.id) console.warn(`[zones] folder "${rec.id}" exports id "${def.id}" — using the folder name`);
        rec.def = def;
        rec.status = 'loaded';
        // a code-only area (dev zones) carries its manifest in its definition: its stamps register now (rc4)
        if (!rec.manifest) this.registerStations(rec);
      } catch (err) {
        this.fail(rec, import.meta.env.DEV ? await explainLoadError(rec.path, err) : err, 'load');
      }
      rec.loadMs = Math.round(performance.now() - t0);
    })();
    this.imports.set(id, p);
    return p;
  }

  /** Start the downloads of these areas in this order, at most MAX_FETCHES at once (no init). */
  private prefetch(list: readonly ZoneRecord[]): void {
    const todo = list.filter((r) => r.status === 'pending');
    let i = 0;
    const next = (): void => {
      const r = todo[i++];
      if (r) void this.ensureImported(r.id).finally(next);
    };
    for (let k = 0; k < MAX_FETCHES; k++) next();
  }

  // ── the load queue (plan §5.6: reachability first, then distance) ───────────
  private reachablePred: (a: ZoneManifest) => boolean = DEFAULT_REACHABLE;
  private readonly forced = new Set<string>();
  /** the post-title queue has started (before it, only the eager areas of the boot load) */
  private queueStarted = false;
  private chain: Promise<unknown> = Promise.resolve();
  private settledAllEmitted = false;

  /** Whether an area's code may load now: forced ones always, the rest by the reachability predicate. */
  isReachable(rec: ZoneRecord): boolean {
    if (this.forced.has(rec.id)) return true;
    const view = this.view(rec);
    return !!view && this.reachablePred(view);
  }

  /** Discover (WP-D0): a locked predicate ignores later unlocked calls (the quest's regionOpen wiring) */
  private reachableLocked = false;

  /**
   * Which areas may load (WP4 wires it to ctx.quest: sites once the Revier is open). Newly reachable
   * areas join the queue at once when the post-title queue already ran. `lock` (Discover): this
   * predicate stays; later calls without `lock` are ignored.
   */
  setReachable(pred: (a: ZoneManifest) => boolean, o: { lock?: boolean } = {}): void {
    if (this.reachableLocked && !o.lock) return;
    if (o.lock) this.reachableLocked = true;
    this.reachablePred = pred;
    if (this.queueStarted) void this.load(this.waiting());
  }

  /** Reachable areas with code that are not ready yet: the objective area first, then nearest to `from` (default: the player). */
  waiting(from: THREE.Vector3 = this.game.player.feet): ZoneRecord[] {
    const obj = this.objective;
    return [...this.records.values()]
      .filter((r) => this.loadable(r.id) && this.isReachable(r))
      .sort((a, b) => (a.id === obj ? -1 : 0) - (b.id === obj ? -1 : 0) || (a.layout?.anchor.distanceToSquared(from) ?? Infinity) - (b.layout?.anchor.distanceToSquared(from) ?? Infinity));
  }

  /**
   * C13 + plan §5.6: after the title, every reachable area loads, nearest first: downloads run ahead
   * (≤ 2 at once), inits run one per idle slot, each followed by a background compile. Resolves when
   * this set has settled: the „eager set“ that game:ready waits for.
   */
  async loadReachable(from?: THREE.Vector3): Promise<void> {
    this.queueStarted = true;
    await this.load(this.waiting(from));
  }

  /** __academy.loadAll(): force every area with code (sites too) through the queue. Resolves when all have settled. */
  async loadAll(): Promise<void> {
    for (const r of this.records.values()) if (this.loadable(r.id)) this.forced.add(r.id);
    // waiting() also lists areas another run is still importing or initialising: initOne() awaits those
    await this.load(this.waiting());
  }

  private async load(list: readonly ZoneRecord[]): Promise<void> {
    this.prefetch(list);
    const todo = [...list];
    while (todo.length) {
      // the nearest area whose code is in (or has failed) inits first: one whose download is still
      // retrying (plan §5.8: 1, 3, 9 s) does not hold up the areas behind it
      let i = todo.findIndex((r) => r.status !== 'pending' && r.status !== 'loading');
      if (i < 0) {
        const busy = todo.map((r) => this.imports.get(r.id)).filter((p): p is Promise<void> => !!p);
        if (busy.length) {
          await Promise.race(busy);
          continue;
        }
        i = 0;
      }
      const rec = todo.splice(i, 1)[0];
      // one area at a time, whoever asked: inits never overlap (ARCHITECTURE §4)
      const step = this.chain.then(async () => {
        if (!this.loadable(rec.id)) return;
        await idleSlot();
        await this.initOne(rec.id);
        if (rec.status === 'ready' && rec.ctx) await this.game.rs.warmUp({ root: rec.ctx.root });
        this.game.requestRender(2);
      });
      this.chain = step.catch(() => undefined);
      await step.catch((err) => console.error(`[zones] queued load of "${rec.id}" failed`, err));
    }
    this.noteSettled();
  }

  /** Every area with code has settled (ready or error): none is pending, loading or initialising. */
  get settledAll(): boolean {
    for (const r of this.records.values()) if (this.loadable(r.id)) return false;
    return true;
  }

  /** 'game:settled-all' once, after game:ready, when every area with code has settled. */
  noteSettled(): void {
    if (this.settledAllEmitted || !this.game.ready || !this.settledAll) return;
    this.settledAllEmitted = true;
    this.game.events.emit('game:settled-all');
  }

  /** Init all imported zones sequentially (alphabetical). Never throws. */
  async initAll(onProgress: (done: number, total: number, id: string) => void): Promise<void> {
    const list = [...this.records.values()].filter((r) => r.status === 'loaded' || r.status === 'error').sort((a, b) => a.id.localeCompare(b.id));
    const total = list.length;
    let done = 0;
    for (const rec of list) {
      if (rec.status === 'loaded') await this.initOne(rec.id);
      done++;
      onProgress(done, total, rec.id);
    }
  }

  /** C13: imported zones whose init has not run yet. */
  uninitialized(): ZoneRecord[] {
    return [...this.records.values()].filter((r) => r.status === 'loaded');
  }

  /** C13: no reachable area is still importing or waiting for / inside its init (unreachable sites wait for setReachable). */
  get settled(): boolean {
    for (const r of this.records.values()) if (this.loadable(r.id) && this.isReachable(r)) return false;
    return true;
  }

  /** C13: init one area now (deep links, deferred init), importing its code first if needed. Never throws; resolves when done. */
  async initOne(id: string): Promise<ZoneRecord | null> {
    const rec = this.records.get(id);
    if (!rec) return null;
    if (rec.status === 'pending' || rec.status === 'loading') await this.ensureImported(id);
    if (rec.status === 'loaded') {
      const p = this.init(rec);
      this.inits.set(id, p);
      await p;
    } else if (rec.status === 'initializing') await this.inits.get(id);
    return rec;
  }
  private inits = new Map<string, Promise<void>>();

  /** Stations from the manifest become pass stamps '<zoneId>.<stationId>'. */
  private registerStations(rec: ZoneRecord): void {
    (this.source(rec)?.stations ?? []).forEach((s, i) => {
      const key = `zone.${rec.id}.${s.id}.title`;
      this.game.progress.registerStamp({
        id: `${rec.id}.${s.id}`,
        zoneId: rec.id,
        star: s.star,
        order: i,
        title: s.title ?? (() => (this.game.i18n.has(key) ? this.game.i18n.t(key) : s.id)),
      });
    });
  }

  /** Placeholder plots ("plot-N") are claimed by unknown zone ids in alphabetical order. */
  private assignPlots(list: ZoneRecord[]): void {
    const known = new Map(PLOTS.map((p) => [p.id, p]));
    const placeholders = PLOTS.filter((p) => /^plot-\d+$/.test(p.id) && !this.records.has(p.id));
    // Stable: real zones claim in alphabetical order whether or not they load in this run
    // (?only=…); loaded dev zones ("_example") come last.
    // areas with code first (in rc4 order), then the manifest-only ones: a stub never moves a code area's fallback plot
    list = [...list.filter((r) => r.status !== 'manifest'), ...list.filter((r) => r.status === 'manifest')];
    const recs = [...this.records.values()];
    const allIds = [
      ...recs.filter((r) => !r.id.startsWith('_')).map((r) => r.id).sort(),
      ...recs.filter((r) => r.id.startsWith('_') && r.status !== 'skipped').map((r) => r.id).sort(),
    ];
    const claims = new Map<string, PlotDef>();
    let i = 0;
    for (const id of allIds) {
      if (known.has(id)) continue;
      const ph = placeholders[i++];
      if (ph) claims.set(id, { ...ph, id });
    }
    let fb = 0;
    for (const rec of list) {
      let plot = known.get(rec.id) ?? claims.get(rec.id) ?? null;
      rec.isFallback = false;
      if (!plot) {
        // overflow: an outer fallback ring with a temporary platform, beyond 900 m (outside the Revier)
        const bearing = (hash(rec.id) % 360) + fb * 37;
        fb++;
        const a = (bearing * Math.PI) / 180;
        const R = FALLBACK_RING.radius;
        plot = { id: rec.id, anchor: [Math.sin(a) * R, 0, -Math.cos(a) * R], radius: FALLBACK_RING.plotRadius };
        rec.isFallback = true;
      }
      rec.plot = plot;
      const anchor = new THREE.Vector3(...plot.anchor);
      const facing = THREE.MathUtils.degToRad(plot.facingDeg ?? facingTowardHub(plot.anchor));
      rec.layout = { anchor, facing, radius: plot.radius, groundY: anchor.y, isFallback: rec.isFallback };
      // tiers from the shape's edge (plan §5.2); rc4 plots keep their anchor distances (45 / 130 m)
      rec.shape = shapeOf(plot);
      rec.tiers = plot.tiers ?? { detail: DETAIL_DISTANCE - plot.radius, exterior: EXTERIOR_DISTANCE - plot.radius };
      rec.interior = !!plot.interior;
    }
  }

  private async init(rec: ZoneRecord): Promise<void> {
    const def = rec.def!;
    rec.status = 'initializing';
    const t0 = performance.now();
    // plan §5.3: a ground area lives in the ground frame — its root is a child of the ground root, its
    // colliders switch with the ground, its dynamics freeze while the ground moves
    const ground = this.frameOf(rec) === 'ground';
    if (ground) this.game.physics.groundOwners.add(rec.id);
    // ?world=0: no ground frame, so a ground area gets a fallback platform too (C1 m14)
    if (rec.isFallback || (!this.game.params.world && ground)) this.game.buildFallbackPlatform(rec.id, rec.layout!, ground ? 'ground' : 'island');
    const parent = ground ? this.game.frames.ensureGround() : this.group;
    const { ctx, scope, state } = createZoneContext(this.game, rec.id, titleOf(def, rec.id), rec.layout!, parent, rec.manifest, ground ? 'ground' : 'island');
    rec.ctx = ctx;
    rec.scope = scope;
    rec.state = state;
    try {
      let timer = 0;
      const work = (async () => {
        if (def.init) await def.init(ctx);
        if (def.create) rec.instance = (await def.create(ctx)) ?? null;
      })();
      await Promise.race([
        work,
        new Promise((_, reject) => {
          timer = window.setTimeout(() => reject(new Error(`init()/create() did not finish within ${INIT_TIMEOUT_MS / 1000}s`)), INIT_TIMEOUT_MS);
        }),
      ]);
      window.clearTimeout(timer);
      // C11a: instanced copies of materials that plain meshes also draw get their own twin (no program switching)
      this.game.materials.instancingPass(this.game.rs.scene);
      rec.status = 'ready';
      this.game.hud.compass.add('core:zones', rec.layout!.anchor.clone().setY(rec.layout!.anchor.y + 2), titleOf(def, rec.id), { kind: 'zone', hideWithin: rec.layout!.radius * 0.6 });
      this.game.events.emit('zone:ready', { id: rec.id });
      // built while the island is up (a forced area, an airborne save): it starts suspended
      if (ground && this.game.frames.suspended) this.suspend(rec);
    } catch (err) {
      this.fail(rec, err, 'init');
      try {
        rec.instance?.dispose?.();
        def.dispose?.();
      } catch {
        /* ignore */
      }
      scope.dispose();
      rec.ctx = null;
      rec.instance = null;
    }
    rec.initMs = Math.round(performance.now() - t0);
  }

  // ── suspension (plan §5.3 rule 3; Frames calls these) ───────────────────────

  /** Suspend (above 1 m) or resume (at h = 0) every ready ground area. */
  setGroundSuspended(on: boolean): void {
    for (const rec of this.records.values()) {
      if (rec.status !== 'ready' || this.frameOf(rec) !== 'ground') continue;
      if (on) this.suspend(rec);
      else this.resume(rec);
    }
  }

  /** The far tiers of suspended ground areas show up to 1,500 m. */
  setGroundFarShown(on: boolean): void {
    for (const rec of this.records.values()) if (rec.susp) rec.susp.holder.visible = on;
  }

  /**
   * No update, onSuspend, interactables, lights and panels off, the zone bus silent; the root leaves
   * the scene graph (so only the terrain and the far ring move during a climb), its far tier stays in
   * a holder at the root's pose.
   */
  private suspend(rec: ZoneRecord): void {
    if (rec.suspended || !rec.ctx || !rec.state || !rec.def) return;
    const g = this.game;
    const ctx = rec.ctx;
    const st = rec.state;
    if (rec.inside) {
      rec.inside = false;
      this.onInsideChange(rec, false);
    }
    rec.suspended = true;
    const def = rec.def;
    if (def.onSuspend) this.call(rec, 'onSuspend()', () => def.onSuspend!(ctx));
    if (!st.hudAway) st.setHudAway(true);
    if (this.focusZone === rec.id) g.hud.setObjectiveFocus((this.focusZone = null));
    g.hud.dialogue.dropQueued(rec.id);
    if (st.bus && g.audio.context) st.bus.gain.setTargetAtTime(0, g.audio.context.currentTime, 0.05);
    const interact = new Map<Interactable, boolean>();
    for (const it of g.interaction.items)
      if (it.owner === rec.id) {
        interact.set(it, it.enabled);
        it.enabled = false;
      }
    const lights = new Map<VirtualLight, boolean>();
    for (const v of g.lights.lights)
      if (v.owner === rec.id) {
        lights.set(v, v.enabled);
        v.enabled = false;
      }
    const parent = ctx.root.parent;
    const holder = new THREE.Group();
    holder.name = `${rec.id}:suspended-far`;
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(ctx.root.matrix);
    holder.matrixWorldNeedsUpdate = true;
    holder.visible = g.frames.farVisible;
    parent?.add(holder);
    // add(), not attach(): the far group keeps its local pose (frozen-node checks stay quiet)
    holder.add(st.groups.far);
    st.groups.far.visible = true;
    ctx.root.removeFromParent();
    rec.susp = { parent, holder, interact, lights };
    rec.inside = false;
    g.events.emit('zone:suspend', { id: rec.id });
  }

  /** Back at h = 0: the root returns, the far tier goes home, interactables and lights come back, onResume. */
  private resume(rec: ZoneRecord): void {
    const s = rec.susp;
    if (!rec.suspended || !s || !rec.ctx || !rec.state || !rec.def) return;
    const ctx = rec.ctx;
    const st = rec.state;
    (s.parent ?? this.game.frames.ensureGround()).add(ctx.root);
    ctx.root.add(st.groups.far);
    st.groups.far.visible = !st.groups.exterior.visible;
    s.holder.removeFromParent();
    for (const [it, en] of s.interact) it.enabled = en;
    for (const [v, en] of s.lights) v.enabled = en;
    rec.susp = null;
    rec.suspended = false;
    const def = rec.def;
    if (def.onResume) this.call(rec, 'onResume()', () => def.onResume!(ctx));
    this.game.events.emit('zone:resume', { id: rec.id });
  }

  /**
   * A deep link (?zone=, ?area=) to a ground area that has only its manifest yet, while no ground
   * frame is registered (WP3 not built, ?world=0): a fallback platform in the ground frame, so the
   * spawn at its gate has a floor.
   */
  floorForDeepLink(id: string | null): void {
    const rec = id ? this.records.get(id) : null;
    if (!rec || rec.status !== 'manifest' || !rec.layout || this.frameOf(rec) !== 'ground' || this.game.frames.ground) return;
    this.game.buildFallbackPlatform(rec.id, rec.layout, 'ground');
  }

  /** Horizontal distance (m) from a world point to the area's plot edge (0 inside). */
  edgeDistance(rec: ZoneRecord, x: number, z: number): number {
    const L = rec.layout;
    if (!L) return Infinity;
    return plotEdgeDistance(rec.shape, L.anchor.x, L.anchor.z, L.facing, x, z);
  }

  private fail(rec: ZoneRecord, err: unknown, phase: 'load' | 'init'): void {
    rec.status = 'error';
    rec.error = `${phase}: ${err instanceof Error ? err.message : String(err)}`;
    rec.stack = err instanceof Error ? (err.stack ?? null) : null;
    console.error(`[zones] zone "${rec.id}" failed during ${phase}`, err);
    // the zone's title (from its manifest or module, else its plot), not its folder id
    const name = this.game.i18n.resolve(this.titleFor(rec));
    this.game.hud.toast(this.game.i18n.t('core.hud.zoneError', { id: name }), { kind: 'error', eyebrow: 'Zone', duration: 7 });
    this.game.events.emit('zone:error', { id: rec.id, error: rec.error });
    // Phase 7 (WP4 contract, types.frames.ts ZonesFailedEvent): WP1's loading card listens (importRetry has retried already)
    this.game.events.emit('zones:failed', { id: rec.id, phase, error: rec.error });
  }

  private runtimeError(rec: ZoneRecord, err: unknown, where: string): void {
    rec.updateErrors++;
    console.error(`[zones] zone "${rec.id}" ${where} threw (${rec.updateErrors}/${MAX_UPDATE_ERRORS})`, err);
    if (rec.updateErrors >= MAX_UPDATE_ERRORS && rec.status === 'ready') {
      rec.status = 'error';
      rec.error = `${where}: ${err instanceof Error ? err.message : String(err)}`;
      this.game.hud.toast(this.game.i18n.t('core.hud.zoneRuntimeError', { id: this.game.i18n.resolve(titleOf(rec.def, rec.id)) }), { kind: 'error', eyebrow: 'Zone', duration: 7 });
      this.game.events.emit('zone:error', { id: rec.id, error: rec.error });
    }
  }

  private call(rec: ZoneRecord, where: string, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      this.runtimeError(rec, err, where);
    }
  }

  /** the interior plot the player is in (its neighbours cap at their exterior tier), or null */
  interiorId: string | null = null;

  /** Discover (src/discover/tier.ts): multiplies every plot's detail and exterior tier distance (1 = as built) */
  tierScale = 1;

  /**
   * Discover (WP-D0): the least distance (m) an area reads as ctx.playerDistance, by area id. Empty for the
   * game. Discover sets the Regelgarten's above its duck station's prewarm radius, so the observer at the
   * hall never starts the MuJoCo worker; tiers, activity and audio still use the real distance.
   */
  readonly distanceFloor = new Map<string, number>();

  /** Per render frame. */
  update(dt: number): void {
    const feet = this.game.player.feet;
    const elapsed = this.game.time.elapsed;
    // plan §5.2: inside an `interior` plot, every other area caps at its exterior tier (C1 M2); the plot
    // counts whether or not its own code has loaded (a manifest-only hall reserves it already)
    let interior: string | null = null;
    for (const rec of this.records.values()) {
      if (!rec.interior || rec.status === 'skipped' || rec.suspended || !rec.layout) continue;
      if (this.frameOf(rec) === 'ground' && !this.game.frames.physicsDocked) continue;
      if (Math.abs(feet.y - rec.layout.anchor.y) < 40 && this.edgeDistance(rec, feet.x, feet.z) === 0) {
        interior = rec.id;
        break;
      }
    }
    this.interiorId = interior;
    for (const rec of this.records.values()) {
      if (rec.status !== 'ready' || !rec.ctx || !rec.layout || !rec.state || rec.suspended) continue;
      const st = rec.state;
      const a = rec.layout.anchor;
      const dist = Math.hypot(feet.x - a.x, feet.z - a.z);
      const floor = this.distanceFloor.size ? this.distanceFloor.get(rec.id) : undefined;
      st.playerDistance = floor === undefined ? dist : Math.max(dist, floor);
      // tiers, HUD and activity from the plot's edge (a circle: rc4's anchor distance minus r)
      const sh = rec.shape;
      const circle = sh.kind === 'circle';
      const edge = circle ? Math.max(0, dist - sh.r) : this.edgeDistance(rec, feet.x, feet.z);
      st.edgeDistance = edge;
      const nearY = Math.abs(feet.y - a.y) < 40;
      const inside = (circle ? dist < rec.layout.radius : edge === 0) && nearY;
      st.playerInside = inside;
      const def = rec.def!;
      st.active = edge <= (def.activeDistance ?? Math.max(DEFAULT_ACTIVE_DISTANCE, rec.layout.radius + 20)) - rec.layout.radius;
      // detail tiers, with hysteresis: a tier switches on LOD_HYST m inside its distance, off LOD_HYST m outside
      const g = st.groups;
      const T = rec.tiers;
      const ts = this.tierScale;
      let det = g.detail.visible ? edge <= T.detail * ts + LOD_HYST : edge <= T.detail * ts - LOD_HYST;
      if (interior && interior !== rec.id) det = false;
      if (det !== g.detail.visible) g.detail.visible = det;
      const ext = g.exterior.visible ? edge <= T.exterior * ts + LOD_HYST * 2 : edge <= T.exterior * ts - LOD_HYST * 2;
      if (ext !== g.exterior.visible) g.exterior.visible = ext;
      if (g.far.visible !== !ext) g.far.visible = !ext;
      // HUD cards (panels, readouts, Kennlinie cards) only near the plot: its edge + 4 m covers the gate spawn
      const away = !(edge <= HUD_MARGIN && nearY);
      if (away !== st.hudAway) {
        st.setHudAway(away);
        // this zone's own objective (if any) takes over the HUD while the player is at the plot
        if (!away) this.game.hud.setObjectiveFocus((this.focusZone = rec.id));
        else if (this.focusZone === rec.id) this.game.hud.setObjectiveFocus((this.focusZone = null));
        // the zone's queued EMI lines stay in the zone (the line on screen finishes)
        if (away) this.game.hud.dialogue.dropQueued(rec.id);
      }
      // zone audio bus: full ≤ 20 m, silent ≥ 60 m from the anchor (a rect plot: 0 … 40 m from its edge)
      if (st.bus && this.game.audio.context) {
        const gain = 1 - (circle ? THREE.MathUtils.smoothstep(dist, 20, 60) : THREE.MathUtils.smoothstep(edge, 0, 40));
        st.bus.gain.setTargetAtTime(gain, this.game.audio.context.currentTime, 0.1);
      }
      if (inside !== rec.inside) {
        rec.inside = inside;
        this.onInsideChange(rec, inside);
        if (rec.status !== 'ready') continue;
      }
      const inst = rec.instance;
      if (st.active || def.alwaysUpdate) {
        if (def.update) this.call(rec, 'update()', () => def.update!(dt, rec.ctx!));
        if (inst?.update) this.call(rec, 'update()', () => inst.update!(dt, elapsed));
      } else {
        if (def.updateFar) this.call(rec, 'updateFar()', () => def.updateFar!(dt, rec.ctx!));
        if (inst?.updateFar) this.call(rec, 'updateFar()', () => inst.updateFar!(dt));
      }
    }
  }

  /** Per fixed physics step (before the shared world steps). */
  fixedUpdate(dt: number): void {
    for (const rec of this.records.values()) {
      if (rec.status !== 'ready' || !rec.ctx || !rec.state || rec.suspended) continue;
      const def = rec.def!;
      if (!rec.state.active && !def.alwaysUpdate) continue;
      if (def.fixedUpdate) this.call(rec, 'fixedUpdate()', () => def.fixedUpdate!(dt, rec.ctx!));
      if (rec.instance?.fixedUpdate) this.call(rec, 'fixedUpdate()', () => rec.instance!.fixedUpdate!(dt));
      for (const pw of rec.state.privateWorlds) if (pw.autoStep) this.call(rec, 'private world step', () => pw.world.step());
    }
  }

  private onInsideChange(rec: ZoneRecord, inside: boolean): void {
    const def = rec.def!;
    const g = this.game;
    const inst = rec.instance;
    if (inside) {
      g.progress.markVisited(rec.id);
      if (g.phase === 'playing') {
        const eyebrow = def.eyebrow ? g.i18n.resolve(def.eyebrow) : `${g.i18n.t('core.hud.zone')} · ${def.number != null ? String(def.number).padStart(2, '0') : rec.id.toUpperCase()}`;
        // „★ 4/9 · 2/3 Stempel" (FUN-PLAN C9): the zone's stars and stamps on entry
        let sub: Node | undefined;
        if (!rec.id.startsWith('_') && rec.def?.stations?.length) {
          const st = g.gameLayer.stars(rec.id);
          const n = g.progress.stampsInZone(rec.id);
          const tot = rec.def.stations.length;
          sub = document.createElement('span');
          (sub as HTMLElement).innerHTML = `${starSvg(st.stars > 0, 13)} ${st.stars}/${st.max} · ${n}/${tot} ${g.i18n.t('core.game.banner.stamps')}`;
        }
        g.hud.showBanner(eyebrow, g.i18n.resolve(titleOf(def, rec.id)), sub, { place: true });
      }
      g.events.emit('zone:enter', { id: rec.id });
      if (def.onEnter) this.call(rec, 'onEnter()', () => def.onEnter!(rec.ctx!));
      if (inst?.onEnter) this.call(rec, 'onEnter()', () => inst.onEnter!());
    } else {
      g.events.emit('zone:exit', { id: rec.id });
      if (def.onExit) this.call(rec, 'onExit()', () => def.onExit!(rec.ctx!));
      if (inst?.onExit) this.call(rec, 'onExit()', () => inst.onExit!());
    }
  }

  /**
   * True while the player is away from a zone's plot (beyond radius + 4 m, the same rule that
   * hides its HUD cards). Zone EMIs and subtitles stay silent then: a delayed reaction from a
   * zone the player has left must not follow them across the island. Unknown owners
   * ('world', the island) are never away.
   */
  isAway(owner: string): boolean {
    const r = this.records.get(owner);
    return !!r && r.status === 'ready' && !!r.state && r.state.hudAway;
  }

  /** Zone whose HUD is active (player within radius + 4 m), or null. */
  private focusZone: string | null = null;

  /** Zone the player is currently inside (or null). */
  current(): string | null {
    for (const r of this.records.values()) if (r.inside && r.status === 'ready') return r.id;
    return null;
  }

  /** World spawn for a zone (def.spawn → plot.spawn → just outside the plot edge, facing inward). */
  spawnOf(id: string): { pos: THREE.Vector3; yaw: number; pitch?: number } | null {
    if (id === 'hub') {
      const a = new THREE.Vector3(...HUB.anchor);
      const s = HUB.spawn;
      const p = s ? new THREE.Vector3(...s.position) : new THREE.Vector3(0, 0, HUB.radius * 0.8);
      return { pos: p.add(a), yaw: THREE.MathUtils.degToRad(s?.yawDeg ?? 0), pitch: THREE.MathUtils.degToRad(s?.pitchDeg ?? 0) };
    }
    const rec = this.records.get(id);
    let layout = rec?.layout ?? null;
    let plot = rec?.plot ?? null;
    if (!layout) {
      plot = PLOTS.find((p) => p.id === id) ?? null;
      if (!plot) return null;
      const anchor = new THREE.Vector3(...plot.anchor);
      layout = { anchor, facing: THREE.MathUtils.degToRad(plot.facingDeg ?? facingTowardHub(plot.anchor)), radius: plot.radius, groundY: anchor.y, isFallback: false };
    }
    // the area's own spawn (its code, else its eager manifest), else the plot's
    const own = rec?.def?.spawn ?? rec?.manifest?.spawn ?? null;
    const s = own ?? (plot?.spawn ? { position: plot.spawn.position, yawDeg: plot.spawn.yawDeg } : null);
    const local = s ? toV(s.position) : new THREE.Vector3(0, 0, layout.radius + 2);
    const yawLocal = THREE.MathUtils.degToRad(s?.yawDeg ?? 0);
    const m = new THREE.Matrix4().makeRotationY(layout.facing).setPosition(layout.anchor);
    const pitchDeg = plot?.spawn?.pitchDeg ?? 0;
    return { pos: local.applyMatrix4(m), yaw: layout.facing + yawLocal, pitch: THREE.MathUtils.degToRad(own ? (own.pitchDeg ?? 0) : pitchDeg) };
  }

  /** Public view of one area (null while it has no plot or is skipped). */
  private view(r: ZoneRecord): ZoneManifest | null {
    if (r.status === 'skipped' || !r.layout) return null;
    const d = this.source(r);
    return {
      id: r.id,
      status: r.status,
      kind: this.kindOf(r),
      frame: this.frameOf(r),
      number: d?.number ?? null,
      name: this.titleFor(r),
      verb: d?.verb ?? null,
      eyebrow: d?.eyebrow ?? null,
      glyph: d?.glyph ?? null,
      stations: [...(d?.stations ?? [])],
      questions: [...(d?.questions ?? [])],
      album: d?.album ?? null,
      railingGaps: [...(d?.railingGaps ?? [])],
      system: d?.system ?? null,
      trim: d?.trim ?? null,
      hasCode: !!r.loader,
      anchor: r.layout.anchor.toArray() as [number, number, number],
      facingRad: r.layout.facing,
      radius: r.layout.radius,
      isFallback: r.isFallback,
    };
  }

  /** Area views. Default kind 'lobe': the six island zones (and code-only dev zones), so rc4 consumers stay unchanged. */
  manifests(o: { kind?: PlotKind | 'all' } = {}): ZoneManifest[] {
    const want = o.kind ?? 'lobe';
    const out: ZoneManifest[] = [];
    for (const r of this.records.values()) {
      const v = this.view(r);
      if (v && (want === 'all' || v.kind === want)) out.push(v);
    }
    return out;
  }

  status(): ZoneStatusInfo[] {
    return [...this.records.values()].map((r) => ({
      id: r.id,
      status: r.status,
      error: r.error,
      plot: r.plot ? { id: r.plot.id, anchor: r.plot.anchor, radius: r.plot.radius, fallback: r.isFallback } : null,
      active: !!r.state?.active,
      loadMs: r.loadMs,
      initMs: r.initMs,
      updateErrors: r.updateErrors,
    }));
  }
}

/** Dev only: a failed dynamic import says nothing useful — ask Vite for the real compile error. */
async function explainLoadError(path: string, err: unknown): Promise<unknown> {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (res.ok) return err;
    const body = await res.text();
    const m = body.match(/const error = (\{[\s\S]*?\})\s*\n/);
    if (m) {
      const parsed = JSON.parse(m[1]) as { message?: string };
      if (parsed.message) return new Error(parsed.message.replace(/\u001b\[[0-9;]*m/g, '').trim());
    }
    return new Error(`HTTP ${res.status} for ${path}`);
  } catch {
    return err;
  }
}

function toV(v: [number, number, number] | { x: number; y: number; z: number }): THREE.Vector3 {
  return Array.isArray(v) ? new THREE.Vector3(v[0], v[1], v[2]) : new THREE.Vector3(v.x, v.y, v.z);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
