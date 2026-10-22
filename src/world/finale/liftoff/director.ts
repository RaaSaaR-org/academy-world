import * as THREE from 'three';
import type { LoopHandle, Text, ZoneContext } from '@/core/zones';
import { island, type RotorIndex } from '../../start/contract';
import { KANZEL_PADS, TRIMS, ZONE_PLOTS, polar } from '../../layout';
import type { GroundHandle } from '../../ground';
import type { Sky } from '../../sky';
import { runCloudGust, type CloudRun } from '../sim';
import type { FinaleEnv, Recommendation } from '../types';
import { AUSGUCK, BEATS, CLIMB, CLOUD_GUST, JUICE, RATE, SKIP, SLAB, SOUND, SPINUP, STILLS } from '../tuning';
import { climbState, levelled, stepClimb, type ClimbState } from './climb';
import type { LaunchConsole } from './console';
import type { GhostHorizon } from './ghost';
import type { LiftoffHud, HudRow } from './hud';
import type { Checklist } from './checklist';
import { buildLiftoffSound, PRE } from './sound';
import { liftoffLock } from '../dock';
import { L } from './strings';

/**
 * The lift-off director (Phase 7 plan §4.15, R5 §5; D23, D24). ≈ 100 s from the launch console on the
 * Ausguck: the spin-up M1 → M6 round you (whump, spray, a Recamán note each, the Startakku stepping down),
 * the trims' chord, T = W, the release (six arms, the bridge), then the climb you hold with E — releasing
 * E holds the altitude, and after 6 s EMI-01 gives thrust. From the lift-off on, every beat is keyed to
 * the altitude h, not the clock: the downwash front and the tracker wave, C1 (drone R-3 beside the dock),
 * the cloud shadow, the lid, the nav lamp at h 280, the whiteout with the Flugmodell's ghost horizon and
 * your F3 controller flying the gust, the break-out into the sun with the sky dressing and the melody, C2
 * from the south, and the level-off 570 m above the dock. The world moves, the island doesn't (§5.3):
 * one ctx.island.setAltitude(h) per frame.
 *
 * Events: 'flight:phase' { name, t, h, r? } with the names of the plan's §6.6 „Provides“ line:
 *   spinup · release · liftoff · downwash (repeated with the front radius r) · shade · lid · cloud ·
 *   breakout · level · dusk (a skip and the stills emit the rest of them, always ending with 'dusk');
 * plus 'liftoff:nav' { state, t, h } (the nav lamp turns active), 'liftoff:cut' { shot, at } (the two
 * outside shots' cuts), 'life:react' { kind: 'liftoff' }.
 * Reduced motion: stills with cross-fades (≈ 45 s), no outside shots, no tilt, rows shown stowed.
 * Skip: hold Space or the left mouse button 1 s (a ring fills), a fade to black, the final state.
 */
export type LiftoffPhase = 'spinup' | 'release' | 'liftoff' | 'downwash' | 'shade' | 'lid' | 'cloud' | 'breakout' | 'level' | 'dusk';

export interface LiftoffDeps {
  env: FinaleEnv;
  ground: () => GroundHandle | null;
  sky: () => Sky | null;
  console: LaunchConsole;
  ghost: GhostHorizon;
  hud: LiftoffHud;
  checklist: Checklist;
  /** the controller the player signed in F3 (null: no F3 data, e.g. ?liftoff=1 → Bestand) */
  rec: () => Recommendation | null;
  /** NN-Lage v2's storm rate in the player's F2 measurement (%), for EMI's line */
  nnStorm: () => number | null;
}

export interface LiftoffRun {
  /** ends at the level-off ('dusk' emitted): skipped or flown */
  done: Promise<{ skipped: boolean }>;
}

export interface LiftoffStats {
  running: boolean;
  mode: 'idle' | 'flight' | 'stills' | 'view';
  phase: LiftoffPhase | null;
  t: number;
  h: number;
  v: number;
  tw: number;
  held: boolean;
  auto: boolean;
  climb: 'ground' | 'climb' | 'brake' | 'hover';
  nav: 'standby' | 'active';
  ghost: number;
  shot: 'C1' | 'C2' | null;
  /** the director's own time per frame (ms; EMA and max) */
  ms: number;
  msMax: number;
  rebuilt: boolean;
  /** the console's lamps, bar and nav lamp as shown */
  console: ReturnType<LaunchConsole['shown']>;
  /** the island's tilt now (deg) */
  tilt: [number, number];
}

export interface LiftoffDirector {
  readonly running: boolean;
  /**
   * start at the console. `auto`: EMI holds the thrust from the start (replays); `view`: the tools' climb view at h;
   * `stills`: the stills version without reduced motion (Discover's film on a slow phone, its bench)
   */
  start(o?: { replay?: boolean; auto?: boolean; view?: number; stills?: boolean }): LiftoffRun;
  skip(): void;
  /** tools: force the throttle (true held, false released, null the key again) */
  throttle(v: boolean | null): void;
  /** stop at once (the tools' view cleanup): no final state */
  abort(): void;
  update(dt: number): void;
  stats(): LiftoffStats;
}

const _v = new THREE.Vector3();

/** where the six rotors' spray rises: the lobe tips at the slot, and their floor rings */
const LOBE_TIP = ZONE_PLOTS.map((z) => polar(z.bearing, 104, -1));
const FLOOR_RING = ZONE_PLOTS.map((z) => polar(z.bearing, 97, -65.5));
const KANZEL = KANZEL_PADS.map((k) => polar(k.bearing, 88, -1));
/** the rotors under the lobes (positional sound), y −12 */
const ROTOR_AT = ZONE_PLOTS.map((z) => polar(z.bearing, 80, -12));

const smooth = (k: number): number => {
  const x = Math.max(0, Math.min(1, k));
  return x * x * (3 - 2 * x);
};

export function buildLiftoffDirector(ctx: ZoneContext, deps: LiftoffDeps): LiftoffDirector {
  const { env, hud, ghost, checklist } = deps;
  const con = deps.console;
  const sound = buildLiftoffSound(ctx);
  const T = (t: Text): string => ctx.i18n.resolve(t);
  const n = (v: number, d = 0): string => ctx.i18n.num(v, d);
  const rm = (): boolean => ctx.settings.reducedMotion;

  type Mode = 'flight' | 'stills' | 'view';
  interface Run {
    mode: Mode;
    replay: boolean;
    first: boolean;
    t: number;
    c: ClimbState;
    lifted: boolean;
    tLift: number;
    held: boolean;
    wasClimbing: boolean;
    auto: boolean;
    autoAt: number;
    releasedAt: number;
    done: Set<string>;
    phase: LiftoffPhase | null;
    ignited: number;
    rampFrom: number[];
    rampT: number[];
    notes: LoopHandle[];
    frontNext: number;
    frontR: number;
    wispNext: number;
    shot: { id: 'C1' | 'C2'; t: number; cine: ReturnType<ZoneContext['player']['cinematic']> } | null;
    navT: number;
    cloudT: number;
    breakT: number;
    gust: { run: CloudRun; t0: number; k: number; fallback: boolean; lastShake: number } | null;
    rebuilt: boolean;
    akku: number;
    skipHold: number;
    skipping: boolean;
    hudAcc: number;
    hint: (() => void) | null;
    unlock: () => void;
    resolve: (r: { skipped: boolean }) => void;
    lastH: number;
    tilt: [number, number];
  }
  let run: Run | null = null;
  let forced: boolean | null = null;
  let msEma = 0,
    msMax = 0;
  let lastPhase: LiftoffPhase | null = null;

  // ── small helpers ─────────────────────────────────────────────────────────────────────────────
  const phase = (r: Run, name: LiftoffPhase, extra: { r?: number } = {}): void => {
    if (name !== 'downwash') {
      r.phase = name;
      // a phase is emitted once (the downwash repeats with its front radius)
      r.done.add(name);
    }
    lastPhase = name;
    ctx.events.emit('flight:phase', { name, t: Math.round(r.t * 100) / 100, h: Math.round(r.c.h * 100) / 100, ...extra });
  };
  const once = (r: Run, key: string): boolean => {
    if (r.done.has(key)) return false;
    r.done.add(key);
    return true;
  };
  // the tools' climb view stays silent
  const say = (line: Text | Text[], seconds = 4.5, interrupt = false): void => {
    if (run?.mode !== 'view') void env.say(line, seconds, { interrupt });
  };
  const ground = (): GroundHandle | null => deps.ground();
  const rotorsAt = (rate: number, air = rate): void => {
    for (let i = 0; i < 6; i++) {
      island.rotors.setRate(i as RotorIndex, rate);
      island.rotors.setAir(i as RotorIndex, air);
    }
  };
  const eye = (): THREE.Vector3 => _v.set(con.stand[0], BEATS.eyeY, con.stand[2]);
  const ctrlOf = (rec: Recommendation | null): 'nn' | 'bestand' | 'cond' => (rec === 'pilot' ? 'nn' : rec === 'pilotCond' ? 'cond' : 'bestand');
  const ctrlName = (): Text => L.ctrl[deps.rec() ?? 'none'];
  const setAlt = (r: Run, h: number): void => {
    if (Math.abs(h - r.lastH) < 1e-4) return;
    r.lastH = h;
    ctx.island.setAltitude(h);
  };
  const tilt = (r: Run, roll: number, pitch: number): void => {
    r.tilt[0] = roll;
    r.tilt[1] = pitch;
    ctx.island.setTilt(roll, pitch);
  };
  const clearHint = (r: Run): void => {
    r.hint?.();
    r.hint = null;
  };
  const showHint = (r: Run, t: Text): void => {
    clearHint(r);
    r.hint = ctx.ui.hint(t, 0);
  };
  const paintConsole = (r: Run | null): void => {
    const snap = ctx.quest.snapshot();
    const segs = r ? Math.round(r.akku * 10) : undefined;
    const navK = r && r.navT >= 0 ? 0.45 + 1.15 * smooth((r.t - r.navT) / BEATS.navRampS) : 0.45;
    const ready = snap.start.nav.state === 'bereit' || snap.start.nav.state === 'geprueft';
    con.paint(snap, { segments: segs, nav: !ready ? 'off' : r && r.navT >= 0 ? 'active' : 'standby', navK });
  };
  const navStatus = (r: Run | null) => (lang: 'de' | 'en'): string => {
    const t = r && r.navT >= 0 ? L.navActive : L.navStandby;
    return lang === 'de' ? t.de : t.en;
  };

  // ── the outside shots (C1 beside the dock, C2 from the south; ≤ 10 s, the island never moves) ──
  const startShot = (r: Run, id: 'C1' | 'C2'): void => {
    if (r.shot || rm() || !ground()) return;
    r.done.add(`shot-${id}`);
    r.shot = { id, t: 0, cine: ctx.player.cinematic() };
    ctx.events.emit('liftoff:cut', { shot: id, at: 'in', t: r.t, h: r.c.h });
    hud.setCamKey(false);
    updateShot(r, 0);
  };
  const updateShot = (r: Run, dt: number): void => {
    const s = r.shot;
    const g = ground();
    if (!s || !g) return;
    s.t += dt;
    const k = s.t / BEATS.shotS;
    const pose = g.outsideCamera(s.id, r.c.h, (s.id === 'C1' ? 24 : 72) + 8 * Math.min(1, k));
    s.cine.set(pose.position, pose.lookAt, 1);
    hud.setShot(`${T(L.altitude).toUpperCase()} ${n(r.c.h, 0)} m · ${T(L.climb).toUpperCase()} ${n(r.c.v, 1)} m/s`);
    if (k >= 1) endShot(r);
  };
  const endShot = (r: Run): void => {
    const s = r.shot;
    if (!s) return;
    s.cine.end();
    r.shot = null;
    hud.setShot(null);
    ctx.events.emit('liftoff:cut', { shot: s.id, at: 'out', t: r.t, h: r.c.h });
  };

  // ── the spin-up (clock-keyed, t 0…22) ───────────────────────────────────────────────────────────
  const ignite = (r: Run, i: number): void => {
    const g = ground();
    r.ignited = i + 1;
    r.rampFrom[i] = island.rotors.rates[i] ?? RATE.hover * 0.6;
    r.rampT[i] = r.t;
    if (g) {
      const [x, y, z] = LOBE_TIP[i];
      g.spray.emit('burst', [x, y, z], rm() ? 0.5 : 1);
      g.spray.emit('ring', FLOOR_RING[i], rm() ? 0.5 : 1);
      g.spray.setPlume(i as 0, true);
    }
    r.notes.push(sound.note(SOUND.recaman[i]));
    // the Startakku: one step down per rotor (100 → 82 %, FIKTION)
    r.akku = SPINUP.akkuFrom - ((SPINUP.akkuFrom - SPINUP.akkuTo) * (i + 1)) / 6;
  };
  const updateSpinup = (r: Run): void => {
    const first = 0.8;
    for (let i = r.ignited; i < 6; i++) {
      const at = first + i * SPINUP.gap;
      if (r.t >= at - PRE && once(r, `whump${i}`)) sound.whump(ROTOR_AT[i]);
      if (r.t >= at) ignite(r, i);
      else break;
    }
    // each ignited rotor ramps from its idle to the take-off rate (after the lift-off the climb drives them)
    if (!r.lifted)
      for (let i = 0; i < 6; i++) {
        if (r.rampT[i] < 0) continue;
        const k = smooth((r.t - r.rampT[i]) / SPINUP.rampS);
        const rate = r.rampFrom[i] + (RATE.takeoff - r.rampFrom[i]) * k;
        island.rotors.setRate(i as RotorIndex, rate);
        island.rotors.setAir(i as RotorIndex, rate);
      }
    if (r.ignited >= 6 && once(r, 'tick-lift')) checklist.tick('lift');
    if (r.t >= 13.9 && once(r, 'tick-energy')) checklist.tick('energy');
    if (r.t >= 14.5 && once(r, 'tick-nav')) checklist.tick('nav');
    if (r.t >= SPINUP.trimsAt && once(r, 'trims')) {
      checklist.tick('trim');
      const snap = ctx.quest.snapshot();
      TRIMS.forEach((t, k) => {
        if (snap.systems[t.id] !== 'an') return;
        r.notes.push(sound.note(SOUND.recaman[6 + k], SOUND.chordVol * 0.8));
        ground()?.spray.emit('plume', KANZEL[k], 0.9);
      });
    }
    if (r.t >= SPINUP.twAt && once(r, 'tw')) {
      checklist.tick('core');
      // every line has ticked: the checklist steps aside for the formula card
      ctx.after(1.6, () => checklist.hide());
      say(L.tw, 4.5);
      // T = W: the arms carry nothing now — a long hydraulic exhale from the dock
      ctx.audio.play('whoosh', { volume: JUICE.twSigh, pitch: 0.34 });
    }
    if (r.t >= SPINUP.releaseAt) {
      if (once(r, 'release')) {
        phase(r, 'release');
        if (r.mode === 'flight' && !r.auto) showHint(r, L.holdHint);
        con.setStatus((lang) => (lang === 'de' ? L.armsFree.de : L.armsFree.en));
        sound.rumble(0.25);
        // the arms let go: a short shudder through the deck (≤ 0.1, none under reduced motion or in the stills)
        if (r.mode !== 'stills') ctx.player.shake(JUICE.releaseShake, 0.6);
        // the six arms lock in the wall one after another (WP3 plays the hydraulics and the thunks)
        for (let i = 0; i < 6; i++) ctx.after(0.2 + i * 0.42, () => sound.thunk(polar(ZONE_PLOTS[i].bearing, 104, 0)));
      }
      // the arms and the bridge swing back over releaseS (written while they move, then left alone)
      if (r.t - SPINUP.releaseAt <= SPINUP.releaseS + 0.2) {
        // reduced motion: the arms are simply back in the wall (the stills show no motion)
        const k = r.mode === 'stills' ? 1 : smooth((r.t - SPINUP.releaseAt) / SPINUP.releaseS);
        const g = ground();
        g?.setArms(k);
        g?.setBridge(k);
      }
    }
  };
  /** the rotors' rate from the thrust (T/W 1.05 → take-off, 1.0 → cruise, braking lower) */
  const rateFor = (r: Run): number => THREE.MathUtils.clamp(RATE.cruise + (r.c.tw - 1) * 1.6, 0.42, RATE.takeoff);

  // ── the climb (keyed to h) ──────────────────────────────────────────────────────────────────────
  const updateClimb = (r: Run, dt: number): void => {
    const keyHeld = forced ?? ctx.input.isDown('KeyE');
    r.held = keyHeld;
    const climbing = r.mode === 'view' ? false : r.lifted ? keyHeld || r.auto : false;
    if (!r.lifted) {
      if (r.t < SPINUP.liftoffAt) return;
      if (keyHeld || r.auto) {
        r.lifted = true;
        r.tLift = r.t;
        r.wasClimbing = true;
        clearHint(r);
        phase(r, 'liftoff');
        ctx.events.emit('life:react', { kind: 'liftoff' });
        // the keel leaves its block: a low thump, a shudder, spray rings on the wet floor under every lobe
        sound.whump([0, -40, 0]);
        ctx.after(PRE, () => ctx.player.shake(JUICE.liftoffShake, 1.0));
        const g = ground();
        if (g) for (let i = 0; i < 6; i++) ctx.after(0.15 * i, () => g.spray.emit('ring', FLOOR_RING[i], 1));
        con.setStatus((lang) => (lang === 'de' ? L.climbing.de : L.climbing.en));
        // the chord of the spin-up gives way to the rumble; the checklist steps aside
        const notes = r.notes.splice(0);
        ctx.after(4, () => notes.forEach((h) => h.setVolume(0, 4)));
      } else if (r.t - Math.max(SPINUP.liftoffAt, r.releasedAt) >= CLIMB.emiAfterS) giveThrust(r);
      return;
    }
    if (climbing !== r.wasClimbing) {
      r.wasClimbing = climbing;
      if (!climbing) {
        r.releasedAt = r.t;
        showHint(r, L.holdAgain);
      } else clearHint(r);
    }
    if (!climbing && !r.auto && r.mode === 'flight' && r.t - r.releasedAt >= CLIMB.emiAfterS) giveThrust(r);
    stepClimb(r.c, dt, climbing);
    setAlt(r, r.c.h);
    const rate = rateFor(r);
    rotorsAt(rate, Math.max(0.35, rate * (1 - smooth(r.c.h / 160) * 0.5)));
    sound.rumble(0.35 + 0.65 * smooth((r.c.tw - 0.9) / 0.15) * (1 - smooth((r.c.h - 300) / 260)));
  };
  /** EMI-01 takes the thrust (6 s without E): „Dann gebe ich Schub.“ */
  const giveThrust = (r: Run): void => {
    if (r.auto) return;
    r.auto = true;
    r.autoAt = r.t;
    clearHint(r);
    say(L.emiThrust, 3.5, true);
  };

  const updateBeats = (r: Run, dt: number): void => {
    const h = r.c.h;
    // the downwash front and the tracker wave: 'downwash' { r } every 0.25 s while it runs out
    if (r.lifted && r.frontR < BEATS.frontTo && r.t >= r.frontNext) {
      r.frontR = BEATS.frontFrom + BEATS.frontSpeed * (r.t - r.tLift);
      r.frontNext = r.t + BEATS.frontEvery;
      phase(r, 'downwash', { r: Math.round(Math.min(BEATS.frontTo, r.frontR)) });
    }
    // C1 and C2: automatic with „Außenkameras“ on, else offered on [C] in their windows (never under RM)
    const camsOn = ctx.settings.exteriorCams;
    const c1Window = r.lifted && !r.done.has('shot-C1') && h >= BEATS.c1FromH && h <= BEATS.c1MaxH;
    const c2Window = !r.done.has('shot-C2') && h >= BEATS.c2FromH && h <= 540;
    if (c1Window && camsOn && !rm()) startShot(r, 'C1');
    hud.setCamKey(!r.shot && !rm() && !camsOn && (c1Window || c2Window));
    if (r.shot) updateShot(r, dt);
    if (h >= BEATS.pitH && !r.shot && once(r, 'pit')) say(L.pit, 5, true);
    if ((env.ctx.env.sunBlocked(eye()) >= 0.5 || h >= SLAB.eyeInH - 200) && h > 1 && once(r, 'shade')) phase(r, 'shade');
    if (h >= BEATS.shadeLineH && once(r, 'shadeLine')) say(L.shade, 4, true);
    if (h >= BEATS.lidH && once(r, 'lid')) {
      phase(r, 'lid');
      // the dock's plumes are 100 m below now: they stop, and the spray's budget goes to the cloud's wisps
      const gp = ground();
      if (gp) for (let i = 0; i < 6; i++) gp.spray.setPlume(i as 0, false);
      say(L.lookUp, 3, true);
      // EMI-01 looks up into the lid with you, then back
      const e = env.emi();
      if (e) {
        e.lookAt(new THREE.Vector3(con.emiSpot[0] - 6, BEATS.eyeY + 60, con.emiSpot[2] - 4));
        ctx.after(3.5, () => env.emi()?.lookAt(null));
      }
      ctx.audio.setAmbienceFilter(2200, 10);
    }
    if (h >= BEATS.navH && once(r, 'nav')) {
      r.navT = r.t;
      sound.chime();
      say(L.navOn, 3.8, true);
      ctx.events.emit('liftoff:nav', { state: 'active', t: r.t, h });
      con.setStatus(navStatus(r));
    }
    if (h >= SLAB.eyeInH && once(r, 'cloud')) {
      r.cloudT = r.t;
      phase(r, 'cloud');
      ctx.audio.setAmbienceFilter(BEATS.muffleHz, 2);
      // queued behind the nav line: the eye is only ≈ 6 s inside, the lines follow each other
      say(L.cloud, 4.6);
      // the gust was computed at the console press (sim.ts, ≈ 1 ms): it starts now
      if (r.gust) r.gust.t0 = r.t + CLOUD_GUST.startS;
    }
    // the one env-map rebuild: inside the cloud, past the slab's middle (WP2's recipe)
    if (h >= SLAB.eyeMidH && !r.rebuilt) {
      r.rebuilt = true;
      ctx.env.rebuildEnvMap();
    }
    updateGhostAndGust(r);
    // wisps stream down past the balustrade (R5 §5.2): spray in the ground frame, emitted at the eye's height,
    // falls away at the climb rate; from just below the base until 2 s after the break-out; none under RM
    if (!rm() && h >= SLAB.eyeInH - 30 && (r.breakT < 0 || r.t - r.breakT < 2) && r.t >= r.wispNext) {
      r.wispNext = r.t + BEATS.wispEvery;
      const g = ground();
      if (g) {
        const b = AUSGUCK.facing + (Math.random() - 0.5) * 220;
        const d = 13 + Math.random() * 16;
        const [x, , z] = polar(b, d);
        g.spray.emit('wisp', [x, BEATS.eyeY + h + 8 + Math.random() * 14, z], 0.8 + Math.random() * 0.5);
      }
    }
    if (h >= SLAB.eyeOutH && once(r, 'breakout')) {
      r.breakT = r.t;
      phase(r, 'breakout');
      ctx.audio.setAmbienceFilter(null, BEATS.openS);
      sound.melody();
      // „Gefangen …“ after the cloud's line, then a word on how your controller flew the gust
      const rec = deps.rec() ?? 'none';
      const x = deps.nnStorm();
      const gustLine = rec === 'pilot' ? (x != null ? L.pilotHeld(x) : null) : rec === 'pilotCond' ? L.fallbackLine : L.baselineLine;
      say(gustLine ? [L.breakout, gustLine] : L.breakout, 4.5);
      hud.setState(null);
      tilt(r, 0, 0);
      r.gust = null;
    }
    if (r.breakT >= 0) deps.sky()?.reveal(smooth((r.t - r.breakT) / BEATS.revealS));
    if (h >= BEATS.c2FromH && once(r, 'c2')) {
      ctx.hud.caption(L.capFalling, { seconds: 4 });
      if (r.first) emitEnded();
      if (camsOn && !rm()) startShot(r, 'C2');
    }
    if (h >= BEATS.levelH && once(r, 'level')) {
      phase(r, 'level');
      ctx.after(2.5, () => ctx.hud.caption(L.capCatching, { seconds: 4 }));
      ctx.after(7.5, () => ctx.hud.banner(L.bannerEyebrow, L.bannerTitle));
    }
    if (h >= 535 && once(r, 'welcome')) say(L.welcome, 5, true);
    if (levelled(r.c) && r.lifted && once(r, 'arrived')) arrive(r, false);
  };

  // the ghost horizon (inside the cloud only) and the gust your F3 controller flies
  const updateGhostAndGust = (r: Run): void => {
    const h = r.c.h;
    const inside = r.cloudT >= 0 && h < SLAB.eyeOutH;
    if (inside) {
      const kIn = smooth((r.t - r.cloudT) / BEATS.ghostInS);
      const kOut = smooth((SLAB.eyeOutH - h) / BEATS.ghostOutM);
      ghost.setOpacity(Math.min(kIn, kOut));
    } else ghost.setOpacity(0);
    const gst = r.gust;
    if (!gst || !inside) return;
    const gt = r.t - gst.t0;
    const run2 = gst.run;
    const at = (s: number): [number, number] => {
      const i = Math.max(0, Math.min(run2.roll.length - 1, Math.floor(s * run2.hz)));
      return [run2.roll[i] * gst.k, run2.pitch[i] * gst.k];
    };
    const [ro, pi] = gt >= 0 ? at(gt) : [0, 0];
    if (!rm()) tilt(r, ro, pi);
    const [pr, pp] = at(Math.max(0, gt) + 2);
    ghost.setPrediction(pr, pp, r.c.v * 2);
    // the NN outside its training envelope: a fine shudder (≤ 0.1 shake, never under reduced motion)
    const si = Math.floor(Math.max(0, gt) * run2.hz);
    if (gt >= 0 && run2.outside[si] && r.t - gst.lastShake > 0.22) {
      gst.lastShake = r.t;
      ctx.player.shake(CLOUD_GUST.shudder, 0.2);
    }
    // Pilot mit Auflage: NN-Lage v2 leaves its envelope, the island falls back to Bestand (EMI-01 names it after the break-out)
    if (run2.fallbackT >= 0 && gt >= run2.fallbackT && !gst.fallback) {
      gst.fallback = true;
      hud.setState(L.fallback, 'warn');
      ctx.audio.play('beep', { volume: 0.4, pitch: 0.8 });
    }
  };

  /** the sweep of the tower's mark plays once, at the first flight (WP12's logo listens) */
  let endedSent = false;
  const emitEnded = (): void => {
    if (endedSent || env.state.ended) return;
    endedSent = true;
    const p = ctx.game.progress();
    ctx.events.emit('finale:ended', { earnedStamps: p.earnedStamps, stars: p.stars });
  };

  // ── the level-off: airborne (the end of the sequence) ─────────────────────────────────────────────
  const arrive = (r: Run, skipped: boolean): void => {
    setAlt(r, CLIMB.levelOff);
    tilt(r, 0, 0);
    endShot(r);
    // the dock's plumes stop (they are 570 m below now); the docked state lights them again with the rotors
    const g = ground();
    if (g) for (let i = 0; i < 6; i++) g.spray.setPlume(i as 0, false);
    ghost.setOpacity(0);
    ctx.audio.setAmbienceFilter(null, 1.5);
    deps.sky()?.reveal(1);
    if (!r.rebuilt) {
      r.rebuilt = true;
      ctx.env.rebuildEnvMap();
    }
    if (r.mode !== 'view') {
      ctx.quest.setFlight('airborne', { liftoffSeen: true });
      if (r.first) emitEnded();
    }
    ctx.env.holdEnvMap(false);
    island.rotors.reset();
    for (const p of ['shade', 'lid', 'cloud', 'breakout', 'level'] as LiftoffPhase[]) if (!r.done.has(p)) phase(r, p);
    phase(r, 'dusk');
    finish(r, skipped);
  };

  const finish = (r: Run, skipped: boolean): void => {
    clearHint(r);
    endShot(r);
    hud.show(false);
    checklist.hide();
    ghost.setOpacity(0);
    for (const h of r.notes) h.setVolume(0, 2.5);
    sound.stopAll(skipped ? 0.6 : 3);
    r.unlock();
    run = null;
    liftoffLock.running = false;
    env.busy = false;
    con.setStatus(null);
    paintConsole(null);
    r.resolve({ skipped });
  };

  // ── skip: hold Space or LMB 1 s, a fade to black, the final state ────────────────────────────────
  const skipNow = (r: Run): void => {
    if (r.skipping) return;
    r.skipping = true;
    hud.setSkip(1);
    ctx.events.emit('ui:fade', { on: true });
    ctx.after(SKIP.fadeS, () => {
      if (run !== r) return;
      const g = ground();
      g?.setArms(1);
      g?.setBridge(1);
      for (let i = 0; i < 6; i++) g?.spray.setPlume(i as 0, false);
      if (!r.lifted) {
        r.lifted = true;
        if (!r.done.has('release')) phase(r, 'release');
        phase(r, 'liftoff');
      }
      r.c.h = CLIMB.levelOff;
      r.c.v = 0;
      arrive(r, true);
      ctx.after(0.15, () => ctx.events.emit('ui:fade', { on: false }));
    });
  };

  // ── reduced motion: stills with cross-fades (≈ 45 s) ──────────────────────────────────────────────
  const wait = (s: number): Promise<void> => new Promise((res) => ctx.after(s, res));
  const fadeTo = async (r: Run, fn: () => void): Promise<void> => {
    ctx.events.emit('ui:fade', { on: true });
    await wait(STILLS.fadeS);
    if (run !== r) return;
    fn();
    await wait(0.12);
    ctx.events.emit('ui:fade', { on: false });
  };
  const runStills = async (r: Run): Promise<void> => {
    // (1) the spin-up on the Ausguck, with sound, checklist and the console (the clock beats run as in flight)
    while (run === r && r.t < STILLS.spinupS && !r.skipping) await wait(0.25);
    if (run !== r || r.skipping) return;
    // (2) a held view 60 m over the dock: the rows shown stowed (one 'downwash' with the front past the farm)
    await fadeTo(r, () => {
      r.lifted = true;
      r.tLift = r.t;
      phase(r, 'liftoff');
      ctx.events.emit('life:react', { kind: 'liftoff' });
      r.c.h = STILLS.overDockH;
      setAlt(r, r.c.h);
      rotorsAt(RATE.cruise);
      ground()?.setArms(1);
      ground()?.setBridge(1);
      clearHint(r);
      phase(r, 'downwash', { r: BEATS.frontTo });
      phase(r, 'shade');
      say(L.pit, 5);
    });
    await wait(STILLS.overDockS);
    if (run !== r || r.skipping) return;
    // (3) the cloud, the static ghost horizon and the Flugmodell line (the env-map rebuild hides here)
    await fadeTo(r, () => {
      phase(r, 'lid');
      r.navT = r.t - BEATS.navRampS;
      ctx.events.emit('liftoff:nav', { state: 'active', t: r.t, h: BEATS.navH });
      con.setStatus(navStatus(r));
      r.c.h = STILLS.cloudH;
      setAlt(r, r.c.h);
      r.cloudT = r.t - BEATS.ghostInS;
      phase(r, 'cloud');
      r.done.add('cloud');
      ghost.setPrediction(0, 0, 0);
      ghost.setOpacity(1);
      r.rebuilt = true;
      ctx.env.rebuildEnvMap();
      ctx.audio.setAmbienceFilter(BEATS.muffleHz, 0.5);
      say(L.cloud, 6);
      sound.chime();
    });
    await wait(STILLS.cloudS);
    if (run !== r || r.skipping) return;
    // (4) above the clouds: the banner and the captions
    await fadeTo(r, () => {
      ghost.setOpacity(0);
      phase(r, 'breakout');
      ctx.audio.setAmbienceFilter(null, 1);
      r.c.h = CLIMB.levelOff;
      setAlt(r, r.c.h);
      deps.sky()?.reveal(1);
      if (r.first) emitEnded();
      sound.melody();
      phase(r, 'level');
      // banner and captions first, then EMI-01 (a caption and a subtitle never share the lower third)
      ctx.hud.banner(L.bannerEyebrow, L.bannerTitle);
      ctx.hud.caption(L.capFalling, { seconds: 3.5 });
      ctx.after(4, () => say(L.breakout, 4));
      ctx.after(8.5, () => ctx.hud.caption(L.capCatching, { seconds: 3.5 }));
      ctx.after(12.2, () => say(L.welcome, 4));
    });
    await wait(STILLS.aboveS);
    if (run !== r || r.skipping) return;
    arrive(r, false);
  };

  // ── HUD (≤ 10 Hz) ────────────────────────────────────────────────────────────────────────────────
  const updateHud = (r: Run, dt: number): void => {
    r.hudAcc += dt;
    if (r.hudAcc < 0.1) return;
    r.hudAcc = 0;
    const c = r.c;
    const pre = !r.lifted;
    const thrustPct = pre ? Math.min(100, (r.t / SPINUP.twAt) * 100) : c.tw * 100;
    // the island's numbers are FIKTION (the card's chip); the gust is SIM · LIVE, the dream TRAUM
    // before the lift-off only the thrust and the Startakku (the checklist needs the room below)
    const rows: HudRow[] = pre
      ? [
          { k: L.thrust, v: `${n(thrustPct, 0)} %` },
          { k: L.akku, v: `${n(r.akku * 100, 0)} %` },
        ]
      : [
          { k: L.altitude, v: `${n(c.h, 0)} m` },
          { k: L.climb, v: `${n(c.v, 1)} m/s` },
          { k: L.thrust, v: `${n(thrustPct, 0)} %`, tone: c.tw > 1.01 ? 'accent' : undefined },
          { k: L.akku, v: `${n(r.akku * 100, 0)} %` },
          { k: { de: 'NAV', en: 'NAV' }, v: T(r.navT >= 0 ? L.navRowActive : L.navRowStandby), tone: r.navT >= 0 ? 'teal' : undefined },
        ];
    if (r.gust && r.cloudT >= 0 && c.h < SLAB.eyeOutH) {
      rows.push({ k: L.attitude, v: `${n(Math.hypot(r.tilt[0], r.tilt[1]) / Math.max(0.01, r.gust.k), 2)}°`, chip: 'sim' });
      rows.push({ k: L.controller, v: T(r.gust.fallback ? L.ctrl.none : ctrlName()) });
      rows.push({ k: L.dream, v: T(L.dreamAhead), chip: 'traum', tone: 'teal' });
      rows.push({ k: L.imu, v: T(r.t - r.cloudT > 2.2 ? L.imuOk : L.imuCheck), tone: 'teal' });
    }
    hud.setRows(rows);
    // the T = W card from 15 s to 6 s after the lift-off: a = (T − W)/m, live from your throttle
    if (r.t >= SPINUP.twAt && (!r.lifted || r.t - r.tLift < 8)) {
      const a = r.lifted ? c.a : 0;
      hud.setFormula({ line: `${T(L.thrust).toUpperCase()} ${n(r.lifted ? c.tw * 100 : 100, 0)} % · a = ${n(a / CLIMB.g, 2)} g = ${n(a, 2)} m/s²` });
    } else hud.setFormula(null);
    if (r.mode === 'flight' && r.lifted && !r.wasClimbing && !(r.gust && r.gust.fallback)) hud.setState(L.holding);
    else if (!(r.gust && r.gust.fallback && r.c.h < SLAB.eyeOutH)) hud.setState(null);
  };

  // ── per frame ─────────────────────────────────────────────────────────────────────────────────────
  const api: LiftoffDirector = {
    get running() {
      return !!run;
    },
    start(o = {}) {
      if (run) return { done: Promise.resolve({ skipped: false }) };
      const snap = ctx.quest.snapshot();
      const first = !o.replay && snap.flight.firstFlightAt == null && !snap.flight.liftoffSeen;
      let resolve!: (r: { skipped: boolean }) => void;
      const done = new Promise<{ skipped: boolean }>((res) => (resolve = res));
      const mode: Mode = o.view != null ? 'view' : o.stills || rm() ? 'stills' : 'flight';
      const r: Run = {
        mode,
        replay: !!o.replay,
        first,
        t: 0,
        c: climbState(),
        lifted: false,
        tLift: -1,
        held: false,
        wasClimbing: false,
        auto: !!o.auto,
        autoAt: -1,
        releasedAt: -1e9,
        done: new Set(),
        phase: null,
        ignited: 0,
        rampFrom: [0, 0, 0, 0, 0, 0],
        rampT: [-1, -1, -1, -1, -1, -1],
        notes: [],
        frontNext: 0,
        frontR: 0,
        wispNext: 0,
        shot: null,
        navT: -1,
        cloudT: -1,
        breakT: -1,
        gust: null,
        rebuilt: false,
        akku: SPINUP.akkuFrom,
        skipHold: 0,
        skipping: false,
        hudAcc: 1,
        hint: null,
        unlock: ctx.player.lockControls({ look: false }),
        resolve,
        lastH: ctx.flight.altitude,
        tilt: [0, 0],
      };
      // your F3 controller and the cloud's seeded gust, computed now (≈ 1 ms), flown in the whiteout
      const gr = runCloudGust(ctrlOf(deps.rec()), CLOUD_GUST.gusts, CLOUD_GUST.seed, CLOUD_GUST.showS + 2.5, 40);
      r.gust = { run: gr, t0: 1e9, k: Math.min(1, CLOUD_GUST.maxVisualDeg / Math.max(0.01, gr.maxTilt)), fallback: false, lastShake: -1 };
      run = r;
      liftoffLock.running = true;
      void env.emi()?.gesture('nod');
      env.busy = true;
      forced = null;
      ctx.env.holdEnvMap(true);
      ctx.audio.play('click');
      hud.setTitle(o.replay ? L.hudReplay : L.hudTitle);
      hud.show(true);
      hud.setSkip(mode === 'view' ? null : 0);
      if (mode !== 'view') checklist.show();
      phase(r, 'spinup');
      con.setStatus(navStatus(r));
      if (mode === 'view') {
        // the tools' climb view (tools/lib/views.mjs 'climb'): the island held at h, the director running
        r.t = SPINUP.liftoffAt + 1;
        r.ignited = 6;
        r.lifted = true;
        r.tLift = r.t;
        r.done.add('release').add('shot-C1').add('shot-C2');
        r.c.h = o.view!;
        r.frontR = BEATS.frontTo;
        rotorsAt(RATE.cruise);
        ground()?.setArms(1);
        ground()?.setBridge(1);
        setAlt(r, r.c.h);
      } else if (mode === 'stills') void runStills(r);
      return { done };
    },
    skip() {
      if (run && run.mode !== 'view') skipNow(run);
    },
    throttle(v) {
      forced = v;
      if (v === false && run) {
        run.auto = false;
        run.releasedAt = run.t;
      }
    },
    abort() {
      const r = run;
      if (!r) return;
      phase(r, 'dusk');
      finish(r, true);
    },
    update(dt) {
      const r = run;
      if (!r) return;
      const t0 = performance.now();
      const d = Math.min(0.1, Math.max(0, dt));
      r.t += d;
      // hold-to-skip (a tap does nothing)
      if (r.mode !== 'view' && !r.skipping) {
        const holding = ctx.input.isDown('Space') || ctx.input.isDown('MouseLeft');
        r.skipHold = holding ? r.skipHold + d : 0;
        hud.setSkip(r.skipHold > SKIP.ringShowAfterS ? r.skipHold / SKIP.holdS : 0);
        if (r.skipHold >= SKIP.holdS) skipNow(r);
      }
      if (r.skipping) return;
      if (r.mode === 'flight' && ctx.input.pressed('KeyC') && !r.shot && !rm()) {
        const h = r.c.h;
        if (r.lifted && !r.done.has('shot-C1') && h >= BEATS.c1FromH && h <= BEATS.c1MaxH) startShot(r, 'C1');
        else if (!r.done.has('shot-C2') && h >= BEATS.c2FromH && h <= 540) startShot(r, 'C2');
      }
      if (r.mode !== 'view') updateSpinup(r);
      if (r.mode === 'flight' || r.mode === 'view') {
        updateClimb(r, d);
        if (r.lifted) updateBeats(r, d);
      }
      updateHud(r, d);
      paintConsole(r);
      const ms = performance.now() - t0;
      msEma = msEma * 0.95 + ms * 0.05;
      msMax = Math.max(msMax * 0.999, ms);
    },
    stats() {
      const r = run;
      const climb: LiftoffStats['climb'] = !r || !r.lifted ? 'ground' : r.wasClimbing ? 'climb' : Math.abs(r.c.v) > 0.02 ? 'brake' : 'hover';
      return {
        running: !!r,
        mode: r ? r.mode : 'idle',
        phase: r ? r.phase : lastPhase,
        t: r ? Math.round(r.t * 100) / 100 : 0,
        h: r ? Math.round(r.c.h * 100) / 100 : ctx.flight.altitude,
        v: r ? Math.round(r.c.v * 100) / 100 : 0,
        tw: r ? Math.round(r.c.tw * 1000) / 1000 : 1,
        held: !!r?.held,
        auto: !!r?.auto,
        climb,
        nav: r && r.navT >= 0 ? 'active' : 'standby',
        ghost: r ? Math.round((r.cloudT >= 0 ? 1 : 0) * 100) / 100 : 0,
        shot: r?.shot?.id ?? null,
        ms: Math.round(msEma * 1000) / 1000,
        msMax: Math.round(msMax * 1000) / 1000,
        rebuilt: !!r?.rebuilt,
        console: con.shown(),
        tilt: r ? [Math.round(r.tilt[0] * 1000) / 1000, Math.round(r.tilt[1] * 1000) / 1000] : [0, 0],
      };
    },
  };
  return api;
}
