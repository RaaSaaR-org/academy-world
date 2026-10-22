import * as THREE from 'three';
import type { Game } from './Game';
import type { Lang, Mode, QualitySetting } from './types';
import type { AudioBusName, MeterReading, MeterTarget } from '@/systems/Audio';
import type { QuestSnapshot } from './quest/types';

const r2 = (v: number): number => Math.round(v * 100) / 100;

// ── Phase 7 seams (plan §5.2): feature hooks and the unattended trace ────────────

/** A test hook a package exposes to the tools: `__academy.ext('sequence:liftoff')`, `__academy.ext('life')`. */
export type DebugExt = (...args: never[]) => unknown;
const exts = new Map<string, DebugExt>();

/**
 * Register a tool hook under a name (eager or island code; zones use ctx.debug.register). Returns
 * unregister. Names: 'sequence:<name>' (flash-check), '<pkg>' or '<pkg>:<what>' for stats.
 */
export function registerDebugExt(name: string, fn: DebugExt): () => void {
  exts.set(name, fn);
  return () => {
    if (exts.get(name) === fn) exts.delete(name);
  };
}

/** One input-free stretch a station marked with ctx.game.unattended(true/false) (watch-audit, plan §4 watching rule). */
export interface UnattendedMark {
  owner: string;
  label: string | null;
  /** game time (s) at start / end; end null while open */
  t0: number;
  t1: number | null;
}
const unattendedTrace: UnattendedMark[] = [];

/** Open (on) or close (off) the owner's unattended stretch. No behaviour: a trace for watch-audit only. */
export function markUnattended(owner: string, on: boolean, t: number, label?: string): void {
  const open = unattendedTrace.findLast((m) => m.owner === owner && m.t1 == null);
  if (on && !open) unattendedTrace.push({ owner, label: label ?? null, t0: t, t1: null });
  else if (!on && open) open.t1 = t;
}

/**
 * window.__academy — test & automation hooks (agents verify their work through these).
 * Angles are in degrees. yaw: 0 = facing −Z (north), +90 = facing −X (west, turning left).
 */
export function installDebugApi(game: Game): void {
  const label = (t: unknown): string => game.i18n.resolve(t as never);

  const aimAt = (p: THREE.Vector3): void => {
    const eye = game.camera.getWorldPosition(new THREE.Vector3());
    const d = p.clone().sub(eye);
    game.player.yaw = Math.atan2(-d.x, -d.z);
    game.player.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    game.player.updateCamera(1, 0, true);
    game.requestRender(2);
  };

  const api = {
    version: 1,
    /** Title up and the eager set settled (the resume / deep-link area, the reachable lobes and halls). */
    get ready(): boolean {
      return game.ready;
    },
    /** Every area with code has settled (ready or error); after loadAll() also the sites. */
    get settledAll(): boolean {
      return game.ready && game.zones.settledAll;
    },
    /** Force every area with code (sites too) through the load queue; resolves when all have settled. */
    async loadAll(): Promise<void> {
      await game.zones.loadAll();
    },
    /**
     * Package hooks for the tools (plan §5.10): ext(name, fn) registers (returns unregister),
     * ext(name) returns the hook (undefined when none), ext() lists the names.
     */
    ext(name?: string, fn?: DebugExt): unknown {
      if (name == null) return [...exts.keys()].sort();
      if (fn) return registerDebugExt(name, fn);
      return exts.get(name);
    },
    /** The unattended stretches marked so far (copies; watch-audit). */
    unattended(): UnattendedMark[] {
      return unattendedTrace.map((m) => ({ ...m }));
    },
    /** The quest snapshot (ctx.quest, plan §3.1, D23): the three systems, flight, mastery (playtest, ending-check). */
    quest(): QuestSnapshot | null {
      return game.quest ? game.quest.snapshot() : null;
    },
    /** GPU memory three keeps and the JS heap (Chromium only), for tools/memory-lap.mjs (§5.9). */
    memory(): { geometries: number; textures: number; programs: number; heapMB: number | null } {
      const r = game.rs.renderer.info;
      const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      return { geometries: r.memory.geometries, textures: r.memory.textures, programs: r.programs?.length ?? 0, heapMB: heap ? r2(heap.usedJSHeapSize / 1048576) : null };
    },
    /**
     * The itemised program table (tools/warmup.mjs --table, §5.5): every linked program with the
     * materials that use it now and the owners (top-level groups) of their meshes.
     */
    programs(): { id: number; name: string; usedTimes: number; key: string; materials: { name: string; type: string; owners: string[] }[] }[] {
      const R = game.rs.renderer;
      const byProgram = new Map<unknown, Map<THREE.Material, Set<string>>>();
      const ownerOf = (o: THREE.Object3D): string => {
        let top = o;
        let zone: string | null = null;
        for (let q: THREE.Object3D | null = o; q; q = q.parent) {
          if (!zone && q.name.startsWith('zone:')) zone = q.name.slice(5);
          if (q.parent) top = q;
        }
        return zone ?? (top.name || top.type);
      };
      game.rs.scene.traverse((o) => {
        const mats = (o as THREE.Mesh).material;
        if (!mats) return;
        for (const m of Array.isArray(mats) ? mats : [mats]) {
          const prog = (R.properties.get(m) as { currentProgram?: unknown }).currentProgram;
          if (!prog) continue;
          if (!byProgram.has(prog)) byProgram.set(prog, new Map());
          const users = byProgram.get(prog)!;
          if (!users.has(m)) users.set(m, new Set());
          users.get(m)!.add(ownerOf(o));
        }
      });
      const hash = (s: string): string => {
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
        return (h >>> 0).toString(16).padStart(8, '0');
      };
      return (R.info.programs ?? []).map((p) => {
        const prog = p as unknown as { id: number; name: string; usedTimes: number; cacheKey: string };
        const users = byProgram.get(p) ?? new Map<THREE.Material, Set<string>>();
        return {
          id: prog.id,
          name: prog.name,
          usedTimes: prog.usedTimes,
          key: hash(prog.cacheKey),
          materials: [...users.entries()].map(([m, owners]) => ({ name: m.name, type: m.type, owners: [...owners].sort() })),
        };
      });
    },
    /** 'hub' | zone id | {x,y,z} | [x,y,z] (world feet position). */
    teleport(target: string | { x: number; y: number; z: number } | [number, number, number], o: { yaw?: number; pitch?: number } = {}): boolean {
      let ok: boolean;
      if (Array.isArray(target)) ok = game.teleportTo({ x: target[0], y: target[1], z: target[2] });
      else ok = game.teleportTo(target);
      if (ok && (o.yaw != null || o.pitch != null)) api.look(o.yaw ?? THREE.MathUtils.radToDeg(game.player.yaw), o.pitch ?? 0);
      return ok;
    },
    look(yawDeg: number, pitchDeg = 0): void {
      game.player.yaw = THREE.MathUtils.degToRad(yawDeg);
      game.player.pitch = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(pitchDeg, -88, 88));
      game.player.updateCamera(1, 0, true);
      game.requestRender(2);
    },
    /** Aim the camera at a world point. */
    lookAt(x: number | { x: number; y: number; z: number }, y?: number, z?: number): void {
      const p = typeof x === 'number' ? new THREE.Vector3(x, y ?? 0, z ?? 0) : new THREE.Vector3(x.x, x.y, x.z);
      aimAt(p);
    },
    /** Aim at the nearest interactable (any distance up to maxDistance) and trigger it. */
    interactNearest(maxDistance = 40): { label: string; owner: string; distance: number } | null {
      const from = game.player.feet.clone().setY(game.player.feet.y + 1.7);
      const it = game.interaction.nearest(from, maxDistance);
      if (!it) return null;
      const p = it.object.getWorldPosition(new THREE.Vector3());
      aimAt(p);
      game.interaction.fire(it);
      return { label: label(it.label), owner: it.owner, distance: r2(p.distanceTo(from)) };
    },
    /** Trigger the nearest interactable whose label contains `match` (case-insensitive). */
    interact(match: string): { label: string; owner: string; distance: number } | null {
      const from = game.player.feet;
      const m = match.toLowerCase();
      let best = null as null | (typeof game.interaction.items extends Set<infer T> ? T : never);
      let bd = Infinity;
      for (const it of game.interaction.items) {
        if (!it.enabled || !label(it.label).toLowerCase().includes(m)) continue;
        const d = it.object.getWorldPosition(new THREE.Vector3()).distanceTo(from);
        if (d < bd) {
          bd = d;
          best = it;
        }
      }
      if (!best) return null;
      aimAt(best.object.getWorldPosition(new THREE.Vector3()));
      game.interaction.fire(best);
      return { label: label(best.label), owner: best.owner, distance: r2(bd) };
    },
    /** Nearest interactables (for discovery). */
    interactables(maxDistance = 60): { label: string; owner: string; distance: number; pos: number[] }[] {
      const from = game.player.feet;
      return [...game.interaction.items]
        .map((it) => {
          const p = it.object.getWorldPosition(new THREE.Vector3());
          return { label: label(it.label), owner: it.owner, distance: r2(p.distanceTo(from)), pos: p.toArray().map(r2), enabled: it.enabled };
        })
        .filter((x) => x.distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance);
    },
    /** Aim at and grab the nearest grabbable body (within maxDistance of the player). It stays held (no F needed) until release() / throw(). */
    grabNearest(maxDistance = 8): { id: number; mass: number; label: string | null; owner: string } | null {
      if (game.grab.held) game.grab.release(true);
      const from = game.player.feet;
      let best = null as null | (typeof game.physics.dynamics extends Set<infer T> ? T : never);
      let bd = maxDistance * maxDistance;
      for (const d of game.physics.dynamics) {
        if (!d.grabbable || d.removed) continue;
        const t = d.body.translation();
        const dd = (t.x - from.x) ** 2 + (t.y - from.y) ** 2 + (t.z - from.z) ** 2;
        if (dd < bd) {
          bd = dd;
          best = d;
        }
      }
      if (!best) return null;
      const t = best.body.translation();
      aimAt(new THREE.Vector3(t.x, t.y, t.z));
      if (!game.grab.start(best)) return null;
      game.scriptedGrab = true;
      return { id: best.id, mass: best.mass, label: best.label ? label(best.label) : null, owner: best.owner };
    },
    release(): void {
      game.scriptedGrab = false;
      game.grab.release();
    },
    throw(): void {
      game.grab.throw();
      game.scriptedGrab = false;
    },
    /**
     * Mouse-look without pointer lock: dx/dy pixels of mouse movement for the next frame, through
     * the real look code (sensitivity, invert-Y, pitch clamp). Call once per frame for a sweep.
     */
    lookDelta(dx: number, dy = 0): void {
      game.input.injectMouse(dx, dy);
    },
    /** Hold a key for ms (e.g. press('KeyW', 1000) walks forward for 1 s). */
    press(code: string, ms = 120): void {
      game.input.inject(code, ms);
    },
    state(): Record<string, unknown> {
      const p = game.player;
      const f = game.interaction.focus;
      const held = game.grab.held;
      const top = game.hud.modals.top;
      return {
        ready: game.ready,
        phase: game.phase,
        mode: game.progress.mode,
        lang: game.i18n.lang,
        quality: { level: game.rs.level, setting: game.rs.setting },
        fps: r2(game.rs.fps),
        pointerLocked: game.input.locked,
        player: {
          pos: p.feet.toArray().map(r2),
          eye: game.camera.position.toArray().map(r2),
          yawDeg: r2(THREE.MathUtils.radToDeg(p.yaw)),
          pitchDeg: r2(THREE.MathUtils.radToDeg(p.pitch)),
          grounded: p.grounded,
          speed: r2(p.speed),
          zone: game.zones.current(),
          surface: p.surface,
        },
        focus: f ? (f.kind === 'interactable' ? { kind: f.kind, label: label(f.item.label), owner: f.item.owner, distance: r2(f.distance) } : { kind: f.kind, mass: f.body.mass, owner: f.body.owner, distance: r2(f.distance) }) : null,
        holding: held ? { id: held.id, mass: held.mass, owner: held.owner, readout: game.grab.readout } : null,
        objective: game.hud.objectiveText,
        objectiveTarget: game.hud.objectiveTarget,
        status: game.hud.statusLine,
        operating: game.operate.active?.owner ?? null,
        modal: top?.kind ?? null,
        infoCard: game.infoCards.currentTitle,
        dialogue: game.hud.dialogue.currentText,
        stamps: game.progress.stamps(),
        toasts: game.hud.toastLog.slice(-8),
        world: game.worldStatus,
        zoneErrors: game.zones.status().filter((z) => z.status === 'error'),
      };
    },
    fps(): number {
      return r2(game.rs.fps);
    },
    zones(): unknown[] {
      return [{ id: 'world', status: game.worldStatus.status, error: game.worldStatus.error, plot: null }, ...game.zones.status()];
    },
    events(n = 30): unknown[] {
      return game.events.log.slice(-n).map((e) => ({ ...e, t: Math.round(e.t) }));
    },
    toasts(): string[] {
      return game.hud.toastLog.slice();
    },
    stamps(): { id: string; earned: boolean; title: string }[] {
      return [...game.progress.stampDefs.values()].map((d) => ({ id: d.id, earned: game.progress.hasStamp(d.id), title: label(d.title) }));
    },
    setMode(m: Mode): void {
      game.progress.setMode(m);
    },
    setLang(l: Lang): void {
      game.setLang(l);
    },
    setQuality(q: QualitySetting): void {
      game.setQuality(q);
    },
    openPass(): void {
      game.pass.open();
    },
    closeModals(): void {
      game.hud.modals.closeAll();
    },
    /** Close only the topmost modal (e.g. a prediction dialog over an operate panel). Returns its kind. */
    closeTopModal(): string | null {
      const top = game.hud.modals.top;
      if (!top) return null;
      top.close();
      return top.kind;
    },
    /** Renderer stats of the last frame (all passes: shadow, main, post). */
    renderInfo(): { calls: number; triangles: number; geometries: number; textures: number; programs: number; cpuMs: number } {
      return { ...game.rs.info(), cpuMs: Math.round(game.cpuMs * 100) / 100 };
    },
    advanceDialogue(): void {
      game.hud.dialogue.advance();
    },
    /**
     * Audio level meter (docs/ARCHITECTURE.md §5.12): sample peak, RMS and RMS above 4 kHz in dBFS
     * over the last `ms` milliseconds, measured on the master output (post limiter, before the
     * volume slider) or on one bus. The first call per target arms the tap and returns
     * `armed: false`; call it again after the sound. Headless runs need
     * `--autoplay-policy=no-user-gesture-required` (tools/lib/shotlib.mjs sets it) and `audioUnlock()`.
     */
    audioMeter(ms = 1000, target: MeterTarget = 'master'): MeterReading {
      return game.audio.meter(ms, target);
    },
    /** Arm meter taps ahead of a measurement (default: master + every bus). */
    audioArm(...targets: MeterTarget[]): void {
      game.audio.unlock();
      for (const t of targets.length ? targets : (['master', 'ambience', 'zones', 'ui', 'foley', 'cues', 'voice'] as MeterTarget[])) game.audio.armMeter(t);
    },
    /** Create/resume the AudioContext without a click (works with the autoplay flag). Resolves with its state. */
    async audioUnlock(): Promise<string> {
      game.audio.unlock();
      const c = game.audio.context;
      if (c && c.state !== 'running') await Promise.race([c.resume(), new Promise((r) => window.setTimeout(r, 500))]);
      return game.audio.context?.state ?? 'none';
    },
    /** Arm, wait `ms` (optionally running `fn` first, e.g. a solve hook that plays a sound), then read the meter. */
    async audioMeasure(ms = 1000, target: MeterTarget = 'master', fn?: () => unknown): Promise<MeterReading> {
      game.audio.unlock();
      game.audio.armMeter(target);
      for (let i = 0; i < 40 && !game.audio.meter(10, target).armed; i++) await new Promise((r) => window.setTimeout(r, 25));
      if (fn) await fn();
      await new Promise((r) => window.setTimeout(r, ms));
      return game.audio.meter(ms, target);
    },
    /** Hear (and meter on master) only one bus: 'ambience' | 'zones' | 'ui' | 'foley' | 'cues' | 'voice'; null = full mix. */
    audioSolo(bus: AudioBusName | null = null): void {
      game.audio.solo(bus);
    },
    /** Play an engine one-shot by name (tests): 'click', 'stamp', 'whoosh', … or 'chirp' / 'step:metal'. */
    audioPlay(name: string, o: { volume?: number; pitch?: number; at?: [number, number, number] } = {}): void {
      const at = o.at ? new THREE.Vector3(...o.at) : undefined;
      if (name === 'chirp') game.audio.chirp(1, at);
      else if (name.startsWith('step')) game.audio.step((name.split(':')[1] as never) ?? 'concrete', o.volume ?? 0.85);
      else if (name.startsWith('stamp:')) game.audio.stamp(Number(name.split(':')[1]) || 440);
      else game.audio.play(name as never, { volume: o.volume, pitch: o.pitch, at });
    },
    debug(on = true): void {
      game.debugOverlay?.setEnabled(on);
    },
    /** Start playing (like clicking the start button, but without pointer lock). */
    start(mode?: Mode): void {
      if (game.phase === 'start') game.beginPlay(mode ?? game.progress.mode, false);
    },
    pause(): void {
      game.pause();
    },
    resume(): void {
      game.resume();
    },
    waitFrames(n = 1): Promise<void> {
      return new Promise((res) => {
        let left = Math.max(1, n);
        const tick = (): void => {
          if (--left <= 0) res();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    },
    /**
     * Run a zone's deterministic test hook (ctx.debug.register): solve('sensordom', 'solve-a').
     * Resolves with the hook's return value (awaited), or `true` when it returns nothing;
     * `false` when the hook does not exist.
     */
    async solve(zoneId: string, name: string): Promise<unknown> {
      const fn = game.debugActions.get(`${zoneId}:${name}`);
      if (!fn) {
        console.warn(`[__academy.solve] no debug action "${name}" in zone "${zoneId}". Known: ${[...game.debugActions.keys()].join(', ') || '—'}`);
        return false;
      }
      const r = await fn();
      return r === undefined ? true : r;
    },
    debugActions(): string[] {
      return [...game.debugActions.keys()];
    },
    /** Zone manifests (names, stations, anchors). Default the six lobes (rc4); 'all' adds halls and sites. */
    manifests(kind: 'lobe' | 'hall' | 'site' | 'all' = 'lobe'): unknown[] {
      return game.zones.manifests({ kind });
    },
    /** Full pass state: stamps with values, predictions, questions, album, Prognose-Güte. */
    pass(): Record<string, unknown> {
      const P = game.progress;
      return {
        stamps: [...P.stampDefs.values()].map((d) => ({ id: d.id, title: label(d.title), record: P.stampRecord(d.id) })),
        prognoseGuete: P.prognoseGuete(),
        questions: P.questions(),
        album: P.album(),
      };
    },
    /** Leave operate mode if active. */
    exitOperate(): void {
      game.operate.exit();
    },
    /** H key equivalent. */
    ask(): boolean {
      return game.emis.ask();
    },
    toggleMap(): void {
      game.map.toggle();
    },
    // ── game layer (docs/FUN-PLAN.md §4.7) ────────────────────────────────
    /** ★ totals: { total, max, byZone: { zoneId: { stars, max, byStation } } } */
    stars(): { total: number; max: number; byZone: Record<string, { stars: number; max: number; byStation: Record<string, number> }> } {
      const L = game.gameLayer;
      const all = L.stars();
      const byZone: Record<string, { stars: number; max: number; byStation: Record<string, number> }> = {};
      // every area with stations (halls and sites too: the playtest checks their ★ by zone)
      for (const z of game.zones.manifests({ kind: 'all' })) if (!z.id.startsWith('_')) byZone[z.id] = L.stars(z.id);
      return { total: all.stars, max: all.max, byZone };
    },
    /** Every registered challenge: key, station flag, stars, best value, attempts (+ records without a def). */
    challenges(): { key: string; station: boolean; registered: boolean; stars: number; best: number | null; attempts: number; last: number | null }[] {
      const L = game.gameLayer;
      const recs = game.progress.challenges();
      const keys = new Set([...L.entries.keys(), ...Object.keys(recs)]);
      return [...keys].sort().map((key) => {
        const e = L.entries.get(key);
        const r = recs[key];
        return { key, station: !!e && e.def.station !== false && game.progress.stampDefs.has(key), registered: !!e, stars: r?.stars ?? 0, best: r?.best ?? null, attempts: r?.attempts ?? 0, last: r?.last ?? null };
      });
    },
    /** Submit a result to a registered challenge (not quiet: banner, cues, events). */
    challenge(zoneId: string, id: string, value: number | null, stars?: 0 | 1 | 2 | 3): unknown {
      const e = game.gameLayer.entries.get(`${zoneId}.${id}`);
      if (!e) {
        console.warn(`[__academy.challenge] no challenge "${zoneId}.${id}". Known: ${[...game.gameLayer.entries.keys()].join(', ') || '—'}`);
        return null;
      }
      return e.handle.submit(value, stars != null ? { stars } : {});
    },
    /** Pick up a Sensorkapsel by id (runs the real pickup: effect, toast, event), or 'all'. Returns the ids collected. */
    collect(id: string): string[] {
      const C = game.gameLayer.capsules;
      const ids = id === 'all' ? C.ids() : [id];
      return ids.filter((x) => C.collect(x));
    },
    /** Capsules: placed ids with world position and found flag, plus the totals. */
    capsules(): { found: number; total: number; list: { id: string; found: boolean; pos: number[] | null }[] } {
      const C = game.gameLayer.capsules;
      const found = game.progress.collectibles();
      const list = C.ids().map((id) => ({ id, found: found.includes(id), pos: C.position(id)?.toArray().map(r2) ?? null }));
      return { found: list.filter((c) => c.found).length, total: list.length, list };
    },
    /** EMI-01's skills (derived from earned stamps). */
    skills(): { id: string; zoneId: string; unlocked: boolean }[] {
      return game.gameLayer.skills();
    },
    /** Game-layer UI state: open banner (key, stars, merged stamp), fail flash, countdown, banner log. */
    gameUi(): Record<string, unknown> {
      const ui = game.gameLayer.ui;
      const m = ui.bannerModel;
      return {
        banner: m ? { key: m.key, stars: m.result.stars, best: m.result.best, value: m.result.value, personalBest: m.result.personalBest, stamp: m.stamp ? { earned: m.stamp.earned, lookHint: m.stamp.lookHint } : null } : null,
        fail: ui.failOpen,
        countdown: ui.countdownActive,
        log: ui.log.slice(-20),
        progress: game.gameLayer.summary(),
      };
    },
    /**
     * Perf / screenshot demo: three particle bursts in front of the camera, a popup and a sample result
     * banner (not persisted, no registry entry). Returns the number of live particles.
     */
    juiceDemo(o: { stamp?: boolean } = {}): number {
      const L = game.gameLayer;
      const cam = game.camera;
      const d = cam.getWorldDirection(new THREE.Vector3());
      for (let i = 0; i < 3; i++) {
        const p = cam.position.clone().addScaledVector(d, 3 + i).add(new THREE.Vector3((i - 1) * 0.8, -0.3, 0));
        L.particles.burst(p, { tone: i === 1 ? 'orange' : 'teal', count: 60 });
      }
      game.hud.labels.popup(cam.position.clone().addScaledVector(d, 3.5), '+18 kg', { tone: 'teal' });
      const def = {
        id: 'demo',
        station: false,
        title: { de: 'Demo', en: 'Demo' },
        metric: { label: { de: 'Haltezeit', en: 'Hold time' }, unit: 's', better: 'higher' as const },
        goals: [{ text: { de: 'Stempel', en: 'Stamp' } }, { text: { de: '2-m-Stab ≥ 8 s', en: '2 m pole ≥ 8 s' }, at: 8 }, { text: { de: '1-m-Stab ≥ 8 s', en: '1 m pole ≥ 8 s' }, at: 12 }] as [{ text: { de: string; en: string } }, { text: { de: string; en: string }; at: number }, { text: { de: string; en: string }; at: number }],
        lesson: { de: 'Langer Stab = mehr Zeit: Die Kippzeit wächst mit √L.', en: 'Longer pole = more time: tipping time grows with √L.' },
      };
      L.ui.showBanner({
        key: 'demo.demo',
        eyebrow: '// 02 · A · BALANCIEREN',
        def,
        result: { value: 8.4, stars: 2, best: 2, prevStars: 0, newStars: true, personalBest: true, bestValue: 8.4, prevBest: 6.1 },
        detail: null,
        attempts: 6,
        stamp: o.stamp === false ? null : { title: 'Balancieren', earned: 7, lookHint: true },
        befund: false,
        onRetry: () => undefined,
        onWhy: () => undefined,
        onBefund: null,
      });
      return L.particles.activeCount;
    },
    /** Info cards opened so far: title, requested (by a key/click or [H]/Pass) or by themselves. */
    cards(): { title: string; requested: boolean; t: number }[] {
      return game.infoCards.log.slice();
    },
    /** Play one game-layer cue ('good' | 'great' | 'bad' | 'oops' | 'tick' | 'go' | 'star' | 'pb' | 'collect'). */
    audioCue(name: string, o: { volume?: number; pitch?: number } = {}): void {
      game.audio.cue(name as never, o);
    },
    /** Engine internals for deep debugging (do not use from zones). */
    get game(): Game {
      return game;
    },
  };
  (window as unknown as { __academy: typeof api }).__academy = api;
}
