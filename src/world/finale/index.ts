import * as THREE from 'three';
import type { EmiHandle, LoopHandle, Text, ZoneContext } from '@/core/zones';
import { passSnapshot, zoneValue } from '@/core/quest/values';
import { KEEL, TOWER, polar } from '../layout';
import type { LiftStop } from '../lift';
import { buildRoom, type Room } from './room';
import { LOOKS, rideLift, STOP_Y } from './ride';
import { LESSONS, LESSON_STR, S, SPEAKER } from './strings';
import { drawLeitstandScreen, hoverState, startF1 } from './f1';
import { auditInSlices, drawMesswand, openResults, startF2, tallyOf } from './f2';
import { drawLectern, startF3, reasonTiles, buildSentence } from './f3';
import { playEnding } from './ending';
import { certLines, openCertificate } from './certificate';
import { emptyState, type FinaleEnv, type FinaleState } from './types';
import { SEED_POOL } from './sim';
import { buildEvening } from './evening';
import { applyAirborne, applyDocked, liftoffLock } from './dock';
import type { FinaleDeps } from './lazy';
import { AUSGUCK, BEATS, F1_HOVER, SKIP } from './tuning';
import { buildLaunchConsole } from './liftoff/console';
import { buildGhostHorizon } from './liftoff/ghost';
import { buildLiftoffHud } from './liftoff/hud';
import { buildChecklist } from './liftoff/checklist';
import { buildGuests } from './liftoff/guests';
import { buildLiftoffDirector } from './liftoff/director';
import { L } from './liftoff/strings';

/**
 * FINALE „Startprüfung" in the Kielraum and the lift-off on the Ausguck (GDD §6.6, §8.6; Phase 7 plan
 * §4.14, §4.15, D23–D25) — island module part.
 *
 *   KIEL (4/6 rotors bereit) → lift KIEL −36 → F1 „Schwebetest" (the arms let go, the island hovers
 *   10 m over its keel block, you hold it level 15 s) → F2 „Das Angebot" (Prüfstand: 200 gust trials
 *   per controller vs. the vendor's "99 %") → F3 „Empfehlung" (Pult; signing arms the lift-off once the
 *   island is Startklar: lift, energy, navigation) → the ride KIEL → AUSGUCK with the checklist card →
 *   the launch console: the lift-off (liftoff/director.ts, ≈ 100 s, your F3 controller flies the cloud's
 *   gust) → dusk → certificate (front and back) → free roam in the air. „Start wiederholen“ and
 *   „Zurück ins Dock“ on the console; „Abheben ansehen“ on the title.
 *
 * The six lesson posts on the catwalk tie the zones to the island's own control loop
 * (thrusters M1–M6). Dusk is emitted as `finale:dusk` { t: 0…1 } for the sky to follow.
 *
 * Debug hooks (window.__academy.solve('world', name)): finale-goto, finale-f1, finale-f1-solve,
 * finale-f2, finale-f2-solve, finale-f3-solve, finale-ending (Phase 7: the lift-off), finale-certificate,
 * finale-reset, finale-state; liftoff, liftoff-skip, liftoff-replay, liftoff-dock, liftoff-state,
 * liftoff-goto. Tool hooks (__academy.ext): sequence:liftoff, view:climb, view:kielraum-f1,
 * liftoff:throttle, liftoff (stats), finale:certificate (its lines).
 */

export interface Finale {
  update(dt: number, t: number): void;
  /** the lift's KIEL handler (also reachable through the lazy loader's stand-in, W6) */
  kiel(to: LiftStop): void;
  /** run one of the finale's debug hooks by name (the lazy loader proxies them until this module is loaded) */
  debug(name: string): unknown;
  /** a tool hook by name (the lazy loader registers proxies for them) */
  ext(name: string): ((...a: unknown[]) => unknown) | null;
  /**
   * the title's „Abheben ansehen“ and the console's „Start wiederholen“ in the air: fade to the dock, play, end airborne.
   * 'discover': Discover's film (as the title's, EMI holds the thrust); `stills`: the director's stills version
   */
  replay(from: 'title' | 'console' | 'tool' | 'discover', o?: { stills?: boolean }): Promise<void>;
  /** Discover's „Überspringen“ ('liftoff:skip'): the director's skip (a fade, the final state) */
  skip(): void;
  /** the flight state changed from outside (the stand-in's dock switch): resync the evening and the stand */
  syncFlight(): void;
}

/** sky + env light share inside the Kielraum (the stations' screens and the gimbal carry the room) */
const KEEL_AMBIENT = 0.45;

export function buildFinale(ctx: ZoneContext, deps: FinaleDeps): Finale {
  const { lift } = deps;
  const masts = deps.masts ?? null;
  const stored = ctx.progress.get<Partial<FinaleState>>('finale', {});
  const state: FinaleState = { ...emptyState(), ...(stored && typeof stored === 'object' ? stored : {}) };
  const room: Room = buildRoom(ctx);
  const dockDeps = { ground: () => deps.ground ?? null, sky: () => deps.sky ?? null };
  const flown = (): boolean => {
    const f = ctx.quest.snapshot().flight;
    return f.firstFlightAt != null || f.liftoffSeen;
  };
  const airborne = (): boolean => ctx.flight.state === 'airborne';

  // ── tick runner (per-frame tweens of the stations and rides) ──────────────
  const tickers = new Set<(dt: number) => boolean>();
  const tick = (fn: (dt: number) => boolean): void => void tickers.add(fn);

  // ── EMI-01 in the keel (rides the lift with the player; stands at the launch console) ──
  let emi: EmiHandle | null = null;
  const ensureEmi = (at?: THREE.Vector3): EmiHandle => {
    if (emi) return emi;
    const p = at ?? room.emiSpots.lift;
    emi = ctx.emi.spawn({ unit: 'EMI-01', position: [p.x, p.y, p.z], yawDeg: 180 });
    emi.onAsk(() => void emi?.say([askLine()], { durationS: 5 }));
    return emi;
  };
  // the onboarding's EMI-01 (same module, other file): found by name, never modified otherwise
  let hubEmiObj: THREE.Object3D | null | undefined;
  const hubEmi = (): THREE.Object3D | null => {
    if (hubEmiObj === undefined || (hubEmiObj && !hubEmiObj.parent)) hubEmiObj = ctx.root.children.find((o) => o.name === 'emi:EMI-01' && o !== emi?.object) ?? null;
    return hubEmiObj;
  };
  const armed = (): boolean => ctx.quest.snapshot().armed;
  const askLine = (): Text => (!state.f1 ? S.objF1 : !state.f2 ? S.objF2 : !state.f3 ? S.objF3 : flown() ? S.endLine2 : armed() ? S.objLift : S.objLiftMissing);

  const env: FinaleEnv = {
    ctx,
    room,
    ground: () => deps.ground ?? null,
    flown,
    tick,
    state,
    save: () => ctx.progress.set('finale', state),
    emi: () => emi,
    say: (lines, durationS = 4.5, o = {}) => {
      const list = Array.isArray(lines) ? lines : [lines];
      const e = emi;
      // live commentary must not wait behind older lines: it replaces the queue
      if (o.interrupt || !e || !e.object.parent || !nearPlayer(e)) return ctx.hud.say(list.map((text) => ({ speaker: SPEAKER, text })), { interrupt: !!o.interrupt });
      return e.say(list, { durationS });
    },
    refreshObjective: () => refreshObjective(),
    busy: false,
    audit: null,
  };
  // F1 as a game-layer challenge (docs/FUN-PLAN.md §5 C7): station: false, ★ from the time over 3°,
  // not part of the 54 (Phase 7: its ★ count for the H2 pool, F1_KEY 'world.f1'). Registered once here;
  // startF1 re-registers it with a retry while its panel is open.
  env.f1Def = {
    id: 'f1',
    station: false,
    title: S.f1ChTitle,
    metric: { label: S.f1Over, unit: 's', better: 'lower', digits: 1 },
    goals: [
      { text: S.f1G1, at: 15 },
      { text: S.f1G2, at: 5 },
      { text: S.f1G3, at: 0 },
    ],
    lesson: S.f1Lesson,
  };
  env.f1 = ctx.game.challenge(env.f1Def);
  const nearPlayer = (e: EmiHandle): boolean => e.object.getWorldPosition(_v).distanceTo(ctx.player.position) < 30;
  const _v = new THREE.Vector3();

  // ── objective inside the keel ─────────────────────────────────────────────
  let inKeel = false;
  const refreshObjective = (): void => {
    if (!inKeel || riding) return;
    if (!state.f1) ctx.hud.setObjective(S.objF1, { target: room.spots.f1.toArray() as [number, number, number] });
    else if (!state.f2) ctx.hud.setObjective(S.objF2, { target: room.spots.f2.toArray() as [number, number, number] });
    else if (!state.f3) ctx.hud.setObjective(S.objF3, { target: room.spots.f3.toArray() as [number, number, number] });
    else if (flown()) ctx.hud.setObjective(S.objDone);
    else if (armed()) ctx.hud.setObjective(S.objLift, { target: [TOWER.lift.x, KEEL.catwalkY, TOWER.lift.z] });
    else ctx.hud.setObjective(S.objLiftMissing);
    moveEmiToStep();
  };

  // EMI drives along the ring (never across the core) to the current station
  let emiBusy = false;
  let emiGoal = '';
  const moveEmiToStep = (): void => {
    const e = emi;
    if (!e || emiBusy || e.object.parent !== ctx.root || e.object.position.y > 10) return;
    const goal = !state.f1 ? 'f1' : !state.f2 ? 'f2' : !state.f3 ? 'f3' : 'lift';
    if (goal === emiGoal) return;
    emiGoal = goal;
    const target = room.emiSpots[goal as keyof Room['emiSpots']];
    const from = e.object.position;
    const b0 = bearingOf(from.x, from.z),
      b1 = bearingOf(target.x, target.z);
    let d = b1 - b0;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    const steps = Math.max(1, Math.ceil(Math.abs(d) / 18));
    emiBusy = true;
    void (async () => {
      for (let i = 1; i <= steps; i++) {
        const b = b0 + (d * i) / steps;
        const r = i === steps ? Math.hypot(target.x, target.z) : 11.9;
        const [x, , z] = polar(b, r);
        await e.driveTo([x, 0, z], { speed: 1.9 });
      }
      e.object.rotation.y = Math.atan2(-target.x, -target.z); // face the core
      e.lookAt(null);
      emiBusy = false;
    })();
  };

  for (const ev of ['stamp:awarded', 'stamp:updated']) ctx.events.on(ev, () => {
    if (inKeel) room.refreshPosts(passSnapshot(ctx));
  });
  ctx.events.on('progress:reset', () => {
    Object.assign(state, emptyState());
    env.save();
    drawAll();
    lift.refreshSigns();
  });

  // ── lift rides through the deck ───────────────────────────────────────────
  let riding = false;
  const rideDown = async (): Promise<void> => {
    if (riding) return;
    riding = true;
    room.refreshPosts(passSnapshot(ctx));
    const e = ensureEmi(new THREE.Vector3(TOWER.lift.x + 0.85, lift.at === 'kiel' ? STOP_Y.kiel : STOP_Y[lift.at], TOWER.lift.z - 0.85));
    const ok = await rideLift(ctx, lift, tick, { to: 'kiel', duration: lift.at === 'ausguck' ? 10 : 6, look: LOOKS.down, endYawDeg: 180, endPitchDeg: -20, emi: e });
    riding = false;
    if (!ok) return;
    arrive();
  };
  const arrive = (): void => {
    ctx.hud.banner(S.bannerEyebrow, S.bannerTitle, { place: true });
    emiGoal = '';
    if (!state.visited) {
      state.visited = true;
      env.save();
      lift.refreshSigns();
      void env.say(S.arrive, 5);
    } else void env.say([S.arriveAgain], 4);
    ctx.after(0.8, () => refreshObjective());
  };
  const rideUp = async (to: LiftStop): Promise<void> => {
    if (riding) return;
    riding = true;
    // EMI stays in the keel unless the launch takes it along
    await rideLift(ctx, lift, tick, { to, duration: to === 'ausguck' ? 10 : 6, look: LOOKS.up, endYawDeg: 180, endPitchDeg: 0 });
    riding = false;
  };
  /** §4.14 „After F3“: the rc4 12 s ride KIEL → AUSGUCK (LOOKS.sunset) with the checklist card, EMI-01 along */
  const rideToLaunch = async (): Promise<void> => {
    if (riding) return;
    riding = true;
    ctx.hud.setObjective(null);
    checklist.show();
    const e = ensureEmi();
    const ok = await rideLift(ctx, lift, tick, { to: 'ausguck', duration: 12, look: LOOKS.sunset, endYawDeg: 360 - AUSGUCK.facing, endPitchDeg: -4, emi: e });
    riding = false;
    if (!ok) {
      checklist.hide();
      return;
    }
    // EMI-01 steps out beside the console; the checklist stays up until the spin-up takes it over
    ctx.after(6, () => {
      if (!director.running) checklist.hide();
    });
  };
  // the keel stays open once the finale has been reached (also after the ending)
  lift.setKielOpen(() => !!(state.visited || state.ended || state.f1));
  const onKiel = (to: LiftStop): void => {
    if (env.busy || riding || director.running) return;
    if (to === 'kiel') void rideDown();
    else if (to === 'ausguck' && armed() && !airborne()) void rideToLaunch();
    else void rideUp(to);
  };
  lift.setKielHandler(onKiel);

  // ── interactables (Kielraum) ──────────────────────────────────────────────
  const T = (t: Text): string => ctx.i18n.resolve(t);
  ctx.addInteractable({
    object: room.leitstand,
    label: () => T(state.f1 ? S.leitstandAgain : S.leitstand),
    range: 2.8,
    isEnabled: () => !env.busy && !riding && !airborne(),
    onInteract: () => startF1(env),
  });
  ctx.addInteractable({
    object: room.vendor,
    label: () => T(state.f1 ? S.vendor : S.vendorLocked),
    range: 2.8,
    isEnabled: () => !env.busy && !riding,
    onInteract: () => {
      if (!state.f1) {
        ctx.audio.play('error', { volume: 0.4 });
        ctx.hud.toast(S.objF1, { kind: 'info' });
        return;
      }
      void startF2(env).then(() => drawAll());
    },
  });
  ctx.addInteractable({
    object: room.messwand,
    label: () => T(S.results),
    range: 6,
    isEnabled: () => !env.busy && !!state.f2,
    onInteract: () => void openResults(env),
  });
  ctx.addInteractable({
    object: room.lectern,
    label: () => T(state.f3 ? S.lecternAgain : state.f2 ? S.lectern : S.lecternLocked),
    range: 2.6,
    isEnabled: () => !env.busy && !riding,
    onInteract: () => {
      if (!state.f2) {
        ctx.audio.play('error', { volume: 0.4 });
        ctx.hud.toast(state.f1 ? S.objF2 : S.objF1, { kind: 'info' });
        return;
      }
      startF3(env, () => {
        drawAll();
        refreshObjective();
      });
    },
  });
  ctx.addInteractable({
    object: room.callPanel,
    label: () => T(S.liftCall),
    range: 2.4,
    isEnabled: () => !lift.busy && lift.at !== 'kiel',
    onInteract: () => lift.call('kiel'),
  });
  LESSONS.forEach((l, i) => {
    ctx.addInteractable({
      object: room.posts[i],
      label: () => `${l.m} · ${T(LESSON_STR.ask)}`,
      range: 2.8,
      isEnabled: () => !env.busy,
      onInteract: () => {
        const v = zoneValue(passSnapshot(ctx), l.zone);
        const yours: Text = v ? { de: `**${LESSON_STR.yours.de}:** ${v.title} · ${v.value}`, en: `**${LESSON_STR.yours.en}:** ${v.title} · ${v.value}` } : { de: `**${LESSON_STR.yours.de}:** ${LESSON_STR.none.de}`, en: `**${LESSON_STR.yours.en}:** ${LESSON_STR.none.en}` };
        void ctx.hud.openInfoCard({
          eyebrow: l.eyebrow,
          title: l.title,
          body: [l.body, yours, LESSON_STR.fiction],
          forDecisionMakers: { body: l.decider },
        });
      },
    });
  });

  // ── the certificate stand on the Ausguck (after the first flight) ──────────
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.05, 0.3), ctx.materials.standard({ color: 0x24211f, roughness: 0.5, metalness: 0.6 }));
  stand.position.set(TOWER.lift.x + 2.6, TOWER.ausguck.y + 0.525, TOWER.lift.z + 0.6);
  stand.rotation.y = -Math.PI / 2 + 0.3;
  stand.visible = flown();
  ctx.root.add(stand);
  const standTop = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.04, 0.36), ctx.materials.standard({ color: 0x3a3532, roughness: 0.4, metalness: 0.6 }));
  standTop.position.set(0, 0.54, 0);
  standTop.rotation.x = 0.3;
  stand.add(standTop);
  ctx.text3d.create({ text: { de: 'ZERTIFIKAT', en: 'CERTIFICATE' }, font: 'mono-medium', size: 0.06, color: 0x2dd4bf, glow: 1.15, anchorX: 'center', anchorY: 'middle', letterSpacing: 0.12, position: [0, 0.03, 0.0] }, standTop).rotation.x = -Math.PI / 2;
  ctx.onDispose(() => {
    stand.geometry.dispose();
    standTop.geometry.dispose();
  });
  ctx.addInteractable({
    object: stand,
    label: () => T(S.certificate),
    range: 2.6,
    isEnabled: () => flown() && !env.busy,
    onInteract: () => void openCertificate(env, () => drawLectern(env)),
  });

  // after the first flight: the evening in the air (restored on reload), the day/evening switch on the Ausguck
  const evening = buildEvening(env, stand);
  env.onEnded = () => {
    evening.ended();
    stand.visible = true;
    lift.refreshSigns();
  };

  // ── the launch console and the lift-off (Phase 7 plan §4.15) ──────────────
  const con = buildLaunchConsole(ctx);
  const ghost = buildGhostHorizon(ctx);
  const hud = buildLiftoffHud(ctx);
  const checklist = buildChecklist(ctx, () => state.f3?.rec ?? null);
  const guests = buildGuests(ctx);
  const nnStorm = (): number | null => {
    const k = state.f2?.tally.nn.sturm;
    return k ? Math.round((k.k / Math.max(1, k.n)) * 100) : null;
  };
  const director = buildLiftoffDirector(ctx, { env, ground: () => deps.ground ?? null, sky: () => deps.sky ?? null, console: con, ghost, hud, checklist, rec: () => state.f3?.rec ?? null, nnStorm });
  con.paint(ctx.quest.snapshot(), { nav: 'standby' });

  const wantDusk = (): boolean => ctx.progress.get<'dusk' | 'day'>('sky', 'dusk') !== 'day';
  const fade = (on: boolean): void => ctx.events.emit('ui:fade', { on });
  const wait = (s: number): Promise<void> => new Promise((r) => ctx.after(s, r));
  /** stand at the console, facing the sun over it (a short fade when you are elsewhere) */
  const toConsole = (o: { fade?: boolean } = {}): void => {
    const p = ctx.player.position;
    const [x, y, z] = con.stand;
    if (Math.hypot(p.x - x, p.z - z) < 0.6 && Math.abs(p.y - y) < 1.5) return;
    ctx.player.teleport([x, y, z], { yawDeg: con.standYawDeg, pitchDeg: -4, fade: o.fade });
  };
  const placeEmi = (): void => {
    const [x, y, z] = con.emiSpot;
    const e = ensureEmi(new THREE.Vector3(x, y, z));
    if (e.object.parent === ctx.root) {
      e.object.position.set(x, y, z);
      e.object.rotation.y = Math.atan2(-(con.stand[0] - x), -(con.stand[2] - z));
    }
    e.lookAt(null);
  };
  /** the dock state, under a fade (the same code path for „Zurück ins Dock“, „Start wiederholen“, „Abheben ansehen“) */
  const toDock = async (o: { teleport?: boolean } = {}): Promise<void> => {
    liftoffLock.running = true;
    fade(true);
    await wait(SKIP.fadeS);
    ctx.quest.setFlight('ground');
    applyDocked(ctx, dockDeps);
    evening.sync();
    if (o.teleport) toConsole();
    await wait(0.15);
    fade(false);
    liftoffLock.running = false;
  };

  /** the lift-off from the console; resolves once the ending has opened the certificate (the first flight) or is done */
  let launching: Promise<void> | null = null;
  const launch = (o: { replay?: boolean; auto?: boolean; skip?: boolean; stills?: boolean } = {}): Promise<void> => {
    if (launching) return launching;
    const first = !o.replay && !flown();
    // everyone flies from the same spot, facing the sun (a short fade if you pressed from the side)
    toConsole({ fade: true });
    placeEmi();
    checklist.hide();
    // a guest that is not in yet stays home (its load keeps going for the next lift-off)
    void guests.prepare();
    const run = director.start({ replay: !first, auto: o.auto, stills: o.stills });
    if (o.skip) ctx.after(0.05, () => director.skip());
    launching = run.done
      .then(() => {
        stand.visible = flown();
        evening.sync();
        return playEnding(env, masts, { first, dusk: first || wantDusk() });
      })
      .finally(() => {
        launching = null;
        if (!first) evening.sync();
      });
    return launching;
  };
  /** in the air: fade to the dock, play, end airborne (the saved sky) */
  const replay = async (from: 'title' | 'console' | 'tool' | 'discover', o: { stills?: boolean } = {}): Promise<void> => {
    if (director.running || launching) return;
    await toDock({ teleport: true });
    placeEmi();
    await launch({ replay: true, auto: from === 'title' || from === 'discover', stills: o.stills });
  };
  const sayMissing = (): void => {
    const s = ctx.quest.snapshot();
    if (s.start.startklar && !s.f3Signed) {
      void env.say([L.missingF3], 4, { interrupt: true });
      return;
    }
    const list = (lang: 'de' | 'en'): string[] => {
      const out: string[] = [];
      for (let i = 1; i <= 6; i++) {
        const st = s.systems[`M${i}` as 'M1'];
        if (st !== 'bereit' && st !== 'geprueft') out.push(`M${i}`);
      }
      if (s.start.energy.state !== 'bereit' && s.start.energy.state !== 'geprueft') out.push(lang === 'de' ? L.akkuWord.de : L.akkuWord.en);
      if (s.start.nav.state !== 'bereit' && s.start.nav.state !== 'geprueft') out.push(lang === 'de' ? L.navWord.de : L.navWord.en);
      return out;
    };
    ctx.audio.play('error', { volume: 0.35 });
    void env.say([(lang: 'de' | 'en') => L.missing(list(lang).join(', '), lang)] as Text[], 4.5, { interrupt: true });
  };
  ctx.addInteractable({
    object: con.key,
    label: () => T(airborne() ? L.repeat : armed() || flown() ? L.liftOff : L.notReady),
    hint: () => T(airborne() ? L.repeatHint : armed() || flown() ? L.holdHint : L.notReady),
    range: 2.8,
    isEnabled: () => !env.busy && !riding && !director.running && !launching,
    onInteract: () => {
      if (airborne()) void replay('console');
      else if (armed() || flown()) void launch();
      else sayMissing();
    },
  });
  ctx.addInteractable({
    object: con.dial,
    label: () => T(L.toDock),
    hint: () => T(L.dockHint),
    range: 2.8,
    isEnabled: () => airborne() && !env.busy && !riding && !director.running && !launching,
    onInteract: () => {
      ctx.audio.play('click');
      void toDock();
    },
  });

  // ── screens ───────────────────────────────────────────────────────────────
  const drawAll = (): void => {
    room.refreshPosts(passSnapshot(ctx));
    drawMesswand(env, null);
    drawLectern(env);
    drawLeitstandScreen(env, 0, 0, T({ de: 'Regler: EIN · 1000 Hz', en: 'Controller: ON · 1000 Hz' }), null, null);
    stand.visible = flown();
  };
  drawAll();
  ctx.i18n.onChange(() => drawAll());
  try {
    void (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(() => drawAll());
  } catch {
    /* no font loading API */
  }

  // ── keel ambience ─────────────────────────────────────────────────────────
  let buzz: LoopHandle | null = null;
  let idleAcc = 0;
  let exitKeelLight: (() => void) | null = null;
  ctx.onDispose(() => exitKeelLight?.());

  // ── debug hooks ───────────────────────────────────────────────────────────
  const hooks = new Map<string, () => unknown>();
  const hook = (name: string, fn: () => unknown): void => {
    hooks.set(name, fn);
    ctx.debug.register(name, fn);
  };
  const goto = (): void => {
    const h = lift.at === 'kiel' ? null : lift.takeOver();
    h?.release('kiel');
    ensureEmi();
    ctx.player.teleport([TOWER.lift.x, KEEL.catwalkY + 0.05, TOWER.lift.z + 0.3], { yawDeg: 180, pitchDeg: -15 });
    ctx.after(0.3, () => arrive());
  };
  const solveF1 = (): void => {
    state.f1 = { max: 4.5, over: 6.2, settle: 1.3, held: false };
    env.save();
  };
  hook('finale-goto', goto);
  hook('finale-f1', () => startF1(env));
  hook('finale-f1-bot', () => startF1(env, { react: 0.12, kp: 0.15, kd: 0.13 }));
  hook('finale-f1-bot-slow', () => startF1(env, { react: 0.3, kp: 0.12, kd: 0.03 }));
  hook('finale-f1-solve', () => {
    solveF1();
    refreshObjective();
  });
  hook('finale-f2', () => {
    if (!state.f1) solveF1();
    void startF2(env).then(() => drawAll());
  });
  hook('finale-f2-solve', async () => {
    if (!state.f1) solveF1();
    const seed = SEED_POOL[0];
    // W8: the same 400 trials, a few ms per frame (no 37 ms / 6×: 220 ms block)
    await auditInSlices(env, seed);
    const tally = tallyOf(env.audit!.results);
    state.f2 = { seed, tally, predicted: 70, sturmSeen: false };
    env.save();
    drawAll();
    refreshObjective();
    return { nn: tally.nn, bestand: tally.bestand };
  });
  hook('finale-f3-solve', () => {
    if (!state.f2) return 'run finale-f2-solve first';
    const tiles = reasonTiles(env).filter((t) => t.id === 'nnSturm');
    const alt = { id: 'mrc', num: false, text: S.altMrc };
    state.f3 = { rec: 'pilotCond', reasons: ['nnSturm'], alt: 'mrc', sentence: { de: buildSentence('pilotCond', tiles, alt, 'de'), en: buildSentence('pilotCond', tiles, alt, 'en') } };
    env.save();
    drawAll();
    refreshObjective();
    return state.f3.sentence;
  });
  // the tools' lift-off: from wherever the player is, at the console, past the gate (a debug hook)
  const toolLaunch = async (o: { skip?: boolean } = {}): Promise<unknown> => {
    if (director.running || launching) return 'busy';
    if (airborne()) await toDock({ teleport: true });
    const p = launch({ skip: o.skip });
    if (o.skip) {
      // resolve once airborne (the dusk and the certificate go on)
      for (let k = 0; k < 40 && director.running; k++) await wait(0.25);
    } else await p;
    return { flight: ctx.quest.snapshot().flight.state };
  };
  hook('finale-ending', () => toolLaunch());
  hook('finale-certificate', () => {
    if (!ctx.hud.modalOpen) void openCertificate(env, () => drawLectern(env));
  });
  hook('finale-reset', () => {
    Object.assign(state, emptyState());
    env.audit = null;
    env.save();
    drawAll();
    lift.refreshSigns();
  });
  hook('finale-state', () => JSON.parse(JSON.stringify({ ...state, busy: env.busy, inKeel, lift: lift.at, flown: flown(), hover: hoverState(env), liftoff: director.stats() })));
  hook('liftoff', () => toolLaunch());
  hook('liftoff-skip', () => toolLaunch({ skip: true }));
  hook('liftoff-replay', async () => {
    if (!airborne()) {
      await toolLaunch({ skip: true });
      await wait(1);
    }
    await replay('tool');
    return { flight: ctx.quest.snapshot().flight.state };
  });
  hook('liftoff-dock', async () => {
    if (director.running) director.abort();
    await toDock();
    return { flight: ctx.quest.snapshot().flight.state };
  });
  hook('liftoff-state', () => director.stats());
  hook('liftoff-goto', () => {
    toConsole();
    placeEmi();
  });

  // ── tool hooks (__academy.ext; the stand-in registers proxies) ─────────────
  const exts = new Map<string, (...a: unknown[]) => unknown>();
  exts.set('sequence:liftoff', async () => {
    // flash-check: the whole sequence (stills under reduced motion), resolved at the level-off
    if (director.running || launching) return 'busy';
    if (airborne()) await toDock({ teleport: true });
    void launch();
    for (let k = 0; k < 900 && director.running; k++) await wait(0.25);
    return director.stats();
  });
  exts.set('view:climb', async () => {
    // tools/lib/views.mjs 'climb': the lift-off at h = 300 (the eye in the cloud), the director running
    if (director.running) director.abort();
    toConsole();
    placeEmi();
    await wait(0.4);
    director.start({ view: 300 });
    await wait(1.2);
    return async () => {
      director.abort();
      applyDocked(ctx, dockDeps);
    };
  });
  exts.set('view:kielraum-f1', async () => {
    // the Kielraum while F1 hovers 10 m over the keel block (the operate camera's view of the Leitstand)
    goto();
    await wait(0.6);
    hoverState(env);
    deps.ground?.setArms(1);
    ctx.island.setAltitude(F1_HOVER.height);
    const p = room.poses.f1;
    const cine = ctx.player.cinematic();
    cine.set(p.position, p.lookAt, 1);
    return async () => {
      cine.end();
      ctx.island.setAltitude(0);
      deps.ground?.setArms(0);
    };
  });
  exts.set('liftoff:throttle', (v?: unknown) => {
    director.throttle(v === null || v === undefined ? null : !!v);
    return director.stats();
  });
  exts.set('liftoff', () => director.stats());
  exts.set('finale:certificate', (lang?: unknown) => certLines(env, lang === 'en' ? 'en' : lang === 'de' ? 'de' : undefined));

  // ── the Ausguck while armed: the crowd gathers, EMI-01 at the console, the guests (§4.15 row 0) ──
  let onAusguck = false;
  let paintAcc = 0;
  const ausguckTick = (dt: number): void => {
    const f = ctx.player.position;
    const r = Math.hypot(f.x, f.z);
    const now = f.y > TOWER.ausguck.y - 1 && f.y < TOWER.ausguck.y + 4 && r > TOWER.ausguck.inner - 0.6 && r < TOWER.ausguck.outer + 0.6;
    if (now !== onAusguck) {
      onAusguck = now;
      if (now && !director.running && !launching && !airborne() && armed()) {
        ctx.events.emit('life:react', { kind: 'gather', at: [0, BEATS.eyeY, 0] });
        placeEmi();
        void guests.prepare();
        if (!flown()) ctx.after(1.2, () => void env.say([L.armedLine], 4));
        ctx.hud.setObjective(L.objConsole, { target: con.stand });
      }
    }
    if (onAusguck && !director.running) {
      paintAcc += dt;
      if (paintAcc > 0.5) {
        paintAcc = 0;
        con.paint(ctx.quest.snapshot(), { nav: 'standby' });
      }
    }
  };

  // ── per frame ─────────────────────────────────────────────────────────────
  return {
    kiel: onKiel,
    debug(name) {
      const fn = hooks.get(name);
      return fn ? fn() : false;
    },
    ext: (name) => exts.get(name) ?? null,
    replay,
    skip: () => director.skip(),
    syncFlight() {
      evening.sync();
      stand.visible = flown();
      if (airborne()) applyAirborne(ctx, dockDeps, ctx.flight.altitude || 0);
    },
    update(dt, t) {
      director.update(dt);
      for (const fn of tickers) {
        let keep = false;
        try {
          keep = fn(dt);
        } catch (err) {
          console.error('[finale] tick failed', err);
        }
        if (!keep) tickers.delete(fn);
      }
      ausguckTick(dt);
      const cam = ctx.camera.position;
      const r = Math.hypot(cam.x, cam.z);
      const nowInKeel = cam.y < -18 && cam.y > -60 && r < 30;
      const overOculus = r < 3.5 && cam.y < 3 && cam.y > -1;
      // ART-V2 §5.6: the keel props only draw for a camera inside the keel (y < −20, r < 20), in the lift
      // or looking down the oculus (30 draw calls saved in every outside and underside view)
      room.setVisible((cam.y < -20 && r < 20) || riding || overOculus);
      // the launch console and the guests only matter up there
      const up = cam.y > 30 || director.running;
      con.group.visible = up;
      guests.setVisible(up);
      // only one EMI-01 at a time: the hub unit (onboarding) hides while its keel twin is out
      const twin = hubEmi();
      if (twin) twin.visible = !(emi && (nowInKeel || riding || cam.y > 30));
      if (nowInKeel !== inKeel) {
        inKeel = nowInKeel;
        exitKeelLight?.();
        exitKeelLight = null;
        if (inKeel) {
          // a control room, not a sunlit cage: less sky and env light inside (ART-V2 §4.6, Phase 5)
          exitKeelLight = ctx.env.enterInterior({ ambient: KEEL_AMBIENT });
          room.refreshPosts(passSnapshot(ctx));
          buzz ??= ctx.audio.loop('data', { at: [0, KEEL.coreY, 0], volume: 0.45 });
          refreshObjective();
        } else {
          buzz?.stop();
          buzz = null;
          if (!env.busy) {
            // hand the HUD objective back to the island's route
            ctx.hud.setObjective(null);
            ctx.events.emit('objective:request');
          }
        }
      }
      room.flushUploads();
      if (inKeel) {
        room.update(dt, t, ctx.island.tiltDeg);
        // W8: after a reload the F2 curves are recomputed in the background, before anyone opens them
        if (state.f2 && !env.busy && !(env.audit && env.audit.seed === state.f2.seed)) void auditInSlices(env, state.f2.seed);
        if (!env.busy) {
          idleAcc += dt;
          if (idleAcc > 0.35) {
            idleAcc = 0;
            const tl = ctx.island.tiltDeg;
            drawLeitstandScreen(env, tl.roll, tl.pitch, T({ de: 'Regler: EIN · 1000 Hz', en: 'Controller: ON · 1000 Hz' }), null, null);
          }
        }
      }
    },
  };
}

function bearingOf(x: number, z: number): number {
  const b = (Math.atan2(x, -z) * 180) / Math.PI;
  return b < 0 ? b + 360 : b;
}
