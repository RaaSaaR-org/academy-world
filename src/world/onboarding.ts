import * as THREE from 'three';
import type { EmiHandle, Text, ZoneContext, ZoneManifest } from '@/core/zones';
import { routeRole } from '@/core/zones/manifest';
import { HUB, KANZEL_PADS, LIBELLE, PADS, REVIER, ROUTES, ROUTE_STEPS, TOWER, ZONE_PLOTS, bearingOf, polar, type Vec3Tuple, type ZonePlotInfo } from './layout';
import type { Probestart } from './start/probestart';
import { LEVER_STAND } from './start/probestart';
import { isReady, type StartDisplay } from './start/state';
import { RADIO_SPEAKER, START } from './start/strings';
import { GUST } from './start/tuning';

/**
 * Arrival and onboarding beats (plan §1.2, §4.1; rc4 §6.3, docs/FUN-PLAN.md §5 C4 „play first") with
 * EMI-01, plus the objective system (§1.3, §1.4):
 *   bridge head (the glide ends here) → movement card at once → dock gust: the Haltearme catch it,
 *   radio „Spürst du das? …“ → over the bridge, up the Allee → EMI-01 greets at the Libelle → the
 *   player pulls the Probestart lever (the first mechanic, start/probestart.ts): the three systems turn
 *   red → EMI-01 explains (Entscheider: the Bodencrew supplies AKKU and NAV) → the Pass („Startliste“)
 *   → (Entscheider: Werkleiter-Route) → orange pad → first zone. The foyer Pass-Terminal stays optional.
 * Progress is stored per island (ctx.progress) so returning players skip what they saw.
 * The objective follows the mode's route (layout ROUTES) and each station's route role in its manifest:
 * an area is done when its 'main' stations are stamped; side stations never hold the route. Areas on
 * the ground join once the Revier is open. After the route, every system that still gates the lift-off
 * (D23) is the objective, then KIEL. The current objective lights its gate beacon, spoke inlay, hub pad
 * ring (or Kanzel pad) and the map.
 */
export interface Onboarding {
  /** the player is in control (after the glide): run the arrival beats */
  begin(): void;
  /** call when the Pass-Terminal is used */
  terminalUsed(): void;
  /** the objective may have moved (a beat, F3) */
  refresh(): void;
  update(dt: number): void;
}

export interface ObjectiveSinks {
  set(zoneId: string | null): void;
  visited(zoneId: string, v: 'unvisited' | 'visited' | 'objective'): void;
}

const S = {
  // W2: the movement card (key caps); the keys themselves are not translated
  moveEyebrow: { de: '// Steuerung', en: '// Controls' },
  moveWalk: { de: 'Gehen', en: 'Walk' },
  moveMouse: { de: 'Maus', en: 'Mouse' },
  moveOr: { de: 'oder', en: 'or' },
  moveLook: { de: 'Umsehen', en: 'Look around' },
  moveSprint: { de: 'Sprinten', en: 'Sprint' },
  moveHelp: { de: 'Hilfe', en: 'Help' },
  liftPoi: { de: 'Lift · KIEL −36', en: 'Lift · KEEL −36' },
  passToast: { de: 'Academy Pass erhalten · [Tab] öffnet ihn', en: 'Academy Pass received · [Tab] opens it' },
  passEyebrow: { de: '// Pass', en: '// Pass' },
  medallion: { de: 'Turm-Logo', en: 'Tower logo' },
  padHint: {
    de: 'Die orange Sprungplatte bringt dich zum nächsten Ziel. Draufstellen, dann [E].',
    en: 'The orange jump pad takes you to the next objective. Step on it, then [E].',
  },
  askHub: {
    de: {
      entdecker: 'Sechs Zonen, je drei Stationen: Probieren, Verstehen, Messen. Jede ◆-Station startet einen Rotor.',
      entscheider: 'Sechs Zonen, je drei Stationen. Für dich zählen die ◆-Stationen: dort steht die Kennlinie, nicht das Versprechen.',
    },
    en: {
      entdecker: 'Six zones, three stations each: try, understand, measure. Every ◆ station starts a rotor.',
      entscheider: 'Six zones, three stations each. The ◆ stations are yours: they show the curve, not the promise.',
    },
  },
  rescue: {
    de: 'Rettungsdrohne R-3 hat dich gefangen. Die Kante ist echt – das Geländer auch.',
    en: 'Rescue drone R-3 caught you. The edge is real, and so is the railing.',
  },
  done: { de: 'Startprüfung: Fahr mit dem Lift auf KIEL −36.', en: 'Launch check: take the lift to KEEL −36.' },
  finaleOpen: { de: 'Startprüfung läuft: Lift im Turm (Eingang Süd), KIEL −36.', en: 'Launch check in progress: lift inside the tower (enter from the south), KEEL −36.' },
  // PT-21: shown after the certificate (the player stands on the Ausguck then); [H] still says where it can be fetched again
  free: { de: 'Frei erkunden. Die Insel gehört dir.', en: 'Free roam. The island is yours.' },
  askZone: {
    de: 'Jede Zone hat ihre eigene EMI bei den Stationen. Geh zu ihr und drück [H] – sie erklärt dir die Station.',
    en: 'Every zone has its own EMI at the stations. Walk up to it and press [H]: it explains the station.',
  },
  askRoute: {
    de: 'Folg dem orangen Ziel im Kompass – die orange Sprungplatte auf der Plaza bringt dich hin. [M] zeigt die Karte.',
    en: 'Follow the orange objective in the compass: the orange jump pad on the plaza takes you there. [M] shows the map.',
  },
  askFree: {
    de: 'Alles gemessen. Schau dich um – oder hol dir am Ausguck noch einmal dein Zertifikat. [Tab] zeigt deinen Pass.',
    en: 'Everything measured. Look around, or collect your certificate again on the lookout. [Tab] shows your pass.',
  },
  targetSet: { de: 'Ziel gesetzt', en: 'Objective set' },
  targetCleared: { de: 'Ziel aufgehoben: zurück zur Route', en: 'Objective cleared: back to the route' },
  sideHere: { de: 'Nebenstation hier', en: 'side station here' },
  optional: { de: 'optional', en: 'optional' },
  viaPad: { de: 'über Kanzel', en: 'via pulpit' },
};

/** EMI-01 at the Libelle: outside the plinth (r 3.5) by its own radius + margin (QA-05), facing the Allee. */
const EMI_LIBELLE: [number, number, number] = [3.4, 0, 22.6];
/** where a first-visit player arrives (the glide ends here, plan §1.2) */
const ARRIVALS: Vec3Tuple[] = [REVIER.spawn.position, HUB.spawn!.position];

export function buildOnboarding(
  ctx: ZoneContext,
  sinks: ObjectiveSinks,
  hooks: {
    display: StartDisplay;
    makeProbestart(o: { say(line: Text, o?: { interrupt?: boolean }): Promise<void>; onFirstDone(): void }): Probestart;
    dockGust(): void;
    dispatchDrone(at: THREE.Vector3): void;
    capsuleHint?(): Text | null;
  },
): Onboarding {
  const { display } = hooks;
  // 0 not arrived · 1 on the way to the Libelle · 2 at the Libelle (greeted) · 3 Pass received
  type Stage = 0 | 1 | 2 | 3;
  let stage = ctx.progress.get<Stage>('onboarding', 0);
  // a visitor who already reached the finale is past the onboarding (e.g. progress from an older build)
  if (stage < 3) {
    const fin = ctx.progress.get<{ visited?: boolean; ended?: boolean } | null>('finale', null);
    if (fin && (fin.visited || fin.ended)) {
      stage = 3;
      ctx.progress.set('onboarding', 3);
    }
  }
  /** past the onboarding without a Probestart (a skipped arrival, an older save): the lamps count from now on */
  const silentProbestart = (): void => {
    if (display.snap.probestart) return;
    ctx.quest.markProbestart();
    display.refresh();
  };
  const setStage = (s: Stage): void => {
    stage = s;
    ctx.progress.set('onboarding', s);
    if (s >= 3) silentProbestart();
  };
  if (stage >= 3) silentProbestart();
  const emiAtLibelle = stage < 3;
  const emi: EmiHandle = ctx.emi.spawn({ unit: 'EMI-01', position: emiAtLibelle ? EMI_LIBELLE : [2, 0, 11], yawDeg: emiAtLibelle ? -12 : 0 });
  const radio = RADIO_SPEAKER;
  const _e = new THREE.Vector3();
  /** EMI-01 speaks by the Libelle when the player is near it, else over the radio */
  const say = (line: Text, o: { interrupt?: boolean } = {}): Promise<void> => {
    const near = emi.object.getWorldPosition(_e).distanceTo(ctx.player.position) < 14;
    return near ? emi.say([line], { durationS: 4, interrupt: o.interrupt }) : ctx.hud.say([{ speaker: radio, text: line }], { interrupt: o.interrupt });
  };

  // ── objective system ─────────────────────────────────────────────────────
  let current: string | null = null;
  // a zone chosen on the map (M → "Als Ziel setzen") overrides the route until the player arrives
  let manual: string | null = null;
  const plotOf = (id: string): ZonePlotInfo | undefined => ZONE_PLOTS.find((z) => z.id === id);
  let areaCache: Map<string, ZoneManifest> | null = null;
  const areas = (): Map<string, ZoneManifest> => (areaCache ??= new Map(ctx.zones.list({ kind: 'all' }).map((m) => [m.id, m])));
  ctx.events.on('zone:ready', () => (areaCache = null));
  /** stations of an area with this route role and no stamp yet */
  const open = (m: ZoneManifest, role: 'main' | 'side'): ZoneManifest['stations'] =>
    m.stations.filter((s) => routeRole({ id: s.id, star: s.star, route: s.route }, ctx.mode) === role && !ctx.progress.hasStamp(`${m.id}.${s.id}`));
  /** an area can be the objective: it has code, and a ground area waits for the Revier (§2.6) */
  const reachable = (m: ZoneManifest): boolean => m.hasCode && m.status !== 'error' && (m.frame !== 'ground' || display.snap.regionOpen);
  /** KIEL −36 is open (the quest's rule, D23: 4 rotors bereit, or the finale was reached) */
  const kielOpen = (): boolean => display.snap.kielOpen;
  /** the areas whose systems still gate the lift-off (D23), in route order */
  const gateAreas = (): string[] => {
    const s = display.snap;
    const out: string[] = [];
    for (const m of areas().values()) {
      if (!m.system) continue;
      const st = s.systems[m.system];
      const gates = m.system.startsWith('M') || m.system === 'AKKU' || m.system === 'NAV';
      if (gates && !isReady(st)) out.push(m.id);
    }
    return out;
  };
  // Request(WP12) by WP11: a route `stop` (the Entscheider „Schaufenster“ in the Schauhalle, D41) is
  // visited, not stamped. Its area reports when the stop is done ('route:stop' { area, done }); until
  // then the stop holds the route at its place, like an area with an open main station.
  const stopsDone = new Set<string>();
  ctx.events.on('route:stop', (p: { area?: string; done?: boolean } | undefined) => {
    if (!p?.area) return;
    if (p.done) stopsDone.add(p.area);
    else stopsDone.delete(p.area);
    refreshObjective();
  });
  const stopOpen = (id: string): boolean => (ROUTE_STEPS[ctx.mode] as readonly { area: string; stop?: boolean }[]).some((s) => s.area === id && s.stop) && !stopsDone.has(id);
  const nextZone = (): string | null => {
    if (manual) return manual;
    const A = areas();
    const route = ROUTES[ctx.mode] as readonly string[];
    for (const id of route) {
      const m = A.get(id);
      if (m && reachable(m) && (open(m, 'main').length || stopOpen(id))) return id;
    }
    // after the route: whatever still gates the lift-off (D23), then KIEL (null)
    for (const id of gateAreas()) {
      const m = A.get(id);
      if (m && reachable(m) && open(m, 'main').length) return id;
    }
    return null;
  };
  // W5: on the plaza the compass points at the objective's hub pad (the way there), elsewhere at the zone
  const onPlaza = (): boolean => {
    const p = ctx.player.position;
    return Math.hypot(p.x, p.z) < PADS.hubRadius + 9 && p.y > -2 && p.y < 6;
  };
  let plazaTarget = false;
  // PT-08: once KIEL is open, a compass marker leads to the lift until the player has been down there
  let liftPoi: ReturnType<ZoneContext['hud']['addMarker']> | null = null;
  const LIFT_DOOR: [number, number, number] = [TOWER.lift.x, 0, TOWER.lift.z + 1.5]; // inside the foyer (N)
  const syncLiftPoi = (show: boolean): void => {
    if (show && !liftPoi) liftPoi = ctx.hud.addMarker(LIFT_DOOR, S.liftPoi, { kind: 'poi' });
    else if (!show && liftPoi) {
      liftPoi.remove();
      liftPoi = null;
    }
  };
  /** the Kanzel pad that leads to a ground area (the pad on its bearing, §2.3) */
  const kanzelFor = (m: ZoneManifest): (typeof KANZEL_PADS)[number] => {
    const own = KANZEL_PADS.find((k) => k.site === m.id);
    if (own) return own;
    const b = bearingOf(m.anchor[0], m.anchor[2]);
    let best = KANZEL_PADS[0];
    for (const k of KANZEL_PADS) if (Math.abs(((k.bearing - b + 540) % 360) - 180) < Math.abs(((best.bearing - b + 540) % 360) - 180)) best = k;
    return best;
  };
  /** the player is down in the Revier (beyond the dock) */
  const onGround = (): boolean => Math.hypot(ctx.player.position.x, ctx.player.position.z) > 108;
  const sideHere = (): Text | null => {
    const z = ctx.player.position;
    for (const m of areas().values()) {
      if (Math.hypot(z.x - m.anchor[0], z.z - m.anchor[2]) > m.radius + 6) continue;
      const side = open(m, 'side');
      if (!side.length || open(m, 'main').length) continue;
      // D40: a side station in Entdecker mode — its stars count, the route skips it
      return (lang) => {
        const t = side.map((s) => (s.title ? ctx.i18n.resolve(s.title) : s.id)).join(', ');
        return ` · ${lang === 'de' ? S.sideHere.de : S.sideHere.en}: ${t} (${lang === 'de' ? S.optional.de : S.optional.en})`;
      };
    }
    return null;
  };
  const objectiveText = (id: string): Text => {
    const m = areas().get(id);
    const z = plotOf(id);
    const side = sideHere();
    return (lang) => {
      const head = manual === id ? (lang === 'de' ? 'Gewähltes Ziel' : 'Chosen objective') : lang === 'de' ? 'Nächstes Ziel' : 'Next objective';
      let what: string;
      if (z) what = `${String(z.number).padStart(2, '0')} ${lang === 'de' ? z.name.de : z.name.en} · ${lang === 'de' ? z.verb.de : z.verb.en}`;
      else what = m ? (lang === 'de' ? m.name.de : m.name.en) : id;
      if (m && m.frame === 'ground' && !onGround()) what += ` · ${lang === 'de' ? S.viaPad.de : S.viaPad.en} ${kanzelFor(m).bearing}`;
      return `${head}: ${what}${side ? ctx.i18n.resolve(side) : ''}`;
    };
  };
  /** where the compass points for an area */
  const targetFor = (id: string): Vec3Tuple => {
    const z = plotOf(id);
    if (z) {
      plazaTarget = onPlaza();
      return plazaTarget ? polar(z.bearing, PADS.hubRadius) : polar(z.bearing, 58);
    }
    const m = areas().get(id);
    if (!m) return [0, 0, 0];
    if (m.frame === 'ground') return onGround() ? [m.anchor[0], 0, m.anchor[2]] : kanzelFor(m).position;
    // a hall: its front toward the hub (the Schauhalle's south front)
    const d = Math.hypot(m.anchor[0], m.anchor[2]) || 1;
    const k = Math.max(0, (d - m.radius * 0.72) / d);
    return [m.anchor[0] * k, 0, m.anchor[2] * k];
  };
  /** tell the map (engine UI) what the island currently points at */
  // `lift`: where the KIEL lift is while KIEL is open and the finale not ended (PT-08: the map can draw it)
  const announce = (target: [number, number, number] | null): void =>
    ctx.events.emit('objective:changed', { areaId: current, zone: current, manual: !!manual && manual === current, target, lift: kielOpen() && !finaleState().ended ? LIFT_DOOR : null });
  const finaleState = (): { ended?: boolean; visited?: boolean; f1?: unknown; f2?: unknown; f3?: unknown } => ctx.progress.get<{ ended?: boolean; f1?: unknown; f2?: unknown; f3?: unknown } | null>('finale', null) ?? {};
  const refreshObjective = (): void => {
    // after the ending the island is free roam: no route objective (a zone chosen on the map still works)
    const ended = !!finaleState().ended;
    current = ended && !manual ? null : nextZone();
    sinks.set(current);
    for (const z of ZONE_PLOTS) sinks.visited(z.id, z.id === current ? 'objective' : ended || ctx.zones.visited(z.id) ? 'visited' : 'unvisited');
    const fin = finaleState();
    // the lift marker is for finding the lift the first time; the objective takes over once the route points there
    syncLiftPoi(stage >= 3 && kielOpen() && !fin.visited && !fin.ended && !!current);
    if (stage < 3 && !manual) {
      announce(LEVER_STAND);
      return;
    }
    if (current) {
      const target = targetFor(current);
      ctx.hud.setObjective(objectiveText(current), { target });
      announce(target);
      return;
    }
    // route complete: the Startprüfung (its state lives in the island's progress, see finale/index.ts)
    const lift = LIFT_DOOR;
    if (fin.ended) {
      ctx.hud.setObjective(S.free);
      announce(null);
    } else if (fin.f1 || fin.f2 || fin.f3) {
      ctx.hud.setObjective(S.finaleOpen, { target: lift });
      announce(lift);
    } else {
      ctx.hud.setObjective(S.done, { target: lift });
      announce(lift);
    }
  };
  const hudForStage = (): void => {
    if (manual) refreshObjective();
    // the compass leads straight to the lever's stand point (the Libelle is right behind it)
    else if (stage <= 1) ctx.hud.setObjective(START.toLibelle, { target: LEVER_STAND });
    else if (stage === 2) ctx.hud.setObjective(START.toLever, { target: LEVER_STAND });
    else refreshObjective();
  };
  ctx.events.on('map:set-target', (p: { zone?: string | null } | undefined) => {
    const id = p?.zone ?? null;
    if (id !== null && !areas().has(id)) return;
    manual = id;
    refreshObjective();
    hudForStage();
    if (id) {
      const z = plotOf(id);
      const m = areas().get(id)!;
      ctx.hud.toast((lang) => `${lang === 'de' ? S.targetSet.de : S.targetSet.en}: ${z ? `${String(z.number).padStart(2, '0')} ` : ''}${lang === 'de' ? m.name.de : m.name.en}`, { kind: 'info', duration: 3 });
    } else ctx.hud.toast(S.targetCleared, { kind: 'info', duration: 3 });
  });
  ctx.events.on('objective:request', () => refreshObjective());
  ctx.events.on('zone:enter', (p: { id?: string } | undefined) => {
    // arrived at the chosen zone: the route takes over again
    if (manual && p?.id === manual) {
      manual = null;
      refreshObjective();
    }
  });
  for (const ev of ['stamp:awarded', 'stamp:updated', 'zone:exit', 'mode:changed', 'progress:reset', 'zone:ready', 'quest:region-open', 'quest:kiel-open', 'flight:state']) ctx.events.on(ev, () => {
    // a reset keeps the onboarding done; a first stamp means the player has started anyway
    if (ev === 'progress:reset' || (ev === 'stamp:awarded' && stage < 3)) {
      setStage(3);
      if (!probestartBusy()) emiHome();
    }
    if (ev === 'zone:ready') areaCache = null;
    refreshObjective();
    if (stage < 3) hudForStage();
  });
  const emiHome = (): void => {
    if (emi.object.position.distanceTo(new THREE.Vector3(2, 0, 11)) > 1) void emi.driveTo({ x: 2, y: 0, z: 11 }).then(() => (emi.object.rotation.y = 0));
  };
  ctx.events.on('zone:enter', () => {
    // A player who walks (or jumps) straight into a zone has started: the onboarding beats
    // must not keep pointing back at the plaza from inside a zone.
    if (stage < 3) {
      setStage(3);
      if (!probestartBusy()) emiHome();
    }
    refreshObjective();
  });
  // a jump-pad flight that already happened makes the pad hint pointless (QA-24)
  let launched = false;
  ctx.events.on('player:launch', () => (launched = true));
  // W5: re-aim the compass when the player steps onto or off the plaza (pad ↔ zone), or down into the Revier
  let wasGround = false;
  ctx.every(0.25, () => {
    const g = onGround();
    if ((stage >= 3 || manual) && current && (onPlaza() !== plazaTarget || g !== wasGround)) refreshObjective();
    wasGround = g;
  });

  // ── beats ────────────────────────────────────────────────────────────────
  const begin = (): void => {
    refreshObjective();
    hudForStage();
    ctx.events.emit('world:arrived');
    // Only at the arrival point: a player who starts inside a zone (?zone=, ?pos=, dev reload)
    // gets no dock radio line or movement hint; the beats stay pending for a real arrival.
    const atArrival = ARRIVALS.some((a) => ctx.player.position.distanceTo(new THREE.Vector3(a[0], a[1], a[2])) < 20);
    if (stage === 0 && atArrival) {
      // §1.2: the movement card shows at once; the dock gust follows, the arms catch it
      moveCoach.arm();
      ctx.after(GUST.dockAt, () => hooks.dockGust());
      ctx.after(GUST.dockAt + 0.9, () => {
        void ctx.hud.say([{ speaker: radio, text: START.dock }]);
        ctx.audio.tone({ freq: 880, to: 1320, dur: 0.12, type: 'sine', volume: 0.6 });
      });
      setStage(1);
    } else if (stage === 0) setStage(1);
    moveCoach.track();
  };

  // ── W2: the movement card ─────────────────────────────────────────────────
  // Shown at the arrival; stays until the player has walked ≥ 3 m AND turned (≥ 30°);
  // comes back after 8 s without moving while the Libelle is still ahead (stage ≤ 1).
  const moveCoach = buildMoveCoach(ctx, () => stage);
  ctx.debug.register('onboarding-move', () => moveCoach.state());

  // the tutorial capsule on the Landedeck (placed by the landscape module): EMI-01's radio (radio.ts)
  // explains the twelve on the first find

  // EMI-01 greets at the Libelle (≤ 12 words) and points at the lever
  ctx.physics.addTrigger({
    shape: 'sphere',
    radius: 8,
    position: [LIBELLE.center[0], 1, LIBELLE.center[2] + 2],
    onEnter: () => {
      if (stage !== 1) return;
      setStage(2);
      hudForStage();
      emi.lookAt(null);
      void emi.gesture('point');
      void emi.say([START.greet], { durationS: 3.6 });
    },
  });

  // ── the Pass hand-over after the first Probestart (rc4 W4: „Startliste“) ──
  const handOverPass = (): void => {
    if (stage >= 3) return;
    setStage(3);
    ctx.events.emit('ui:pass-flash');
    const mk = ctx.hud.addMarker(TOWER.medallion.center, S.medallion, { kind: 'poi' });
    ctx.after(6, () => mk.remove());
    const lines: Text[] = [START.passGiven];
    if (ctx.mode === 'entscheider') lines.push(START.route);
    if (!launched) lines.push(S.padHint);
    void emi.gesture('nod');
    void emi.say(lines, { durationS: 4 }).then(() => {
      if (!probestartBusy()) emiHome();
      // W4 (UX-03): the „[Tab] öffnet ihn" toast comes when EMI has finished, not on top of the route line
      whenDialogueIdle(() => ctx.hud.toast(S.passToast, { kind: 'success', eyebrow: S.passEyebrow, duration: 6 }));
    });
    refreshObjective();
  };
  /**
   * Run `fn` once EMI's queue is empty and the last line has finished (core-ux contract:
   * `ctx.hud.dialogueBusy` + the 'dialogue:idle' event; while a full-screen panel freezes time the
   * dialogue waits, so this does too). Without the contract it runs at once; never later than 40 s.
   */
  const whenDialogueIdle = (fn: () => void): void => {
    const busy = (ctx.hud as { dialogueBusy?: boolean }).dialogueBusy;
    if (!busy) return fn();
    let done = false;
    const run = (): void => {
      if (done) return;
      done = true;
      off();
      cancel();
      fn();
    };
    const off = ctx.events.on('dialogue:idle', run);
    const cancel = ctx.after(40, run);
  };

  // ── the Probestart (the first mechanic, start/probestart.ts) ─────────────
  const probestart = hooks.makeProbestart({ say, onFirstDone: handOverPass });
  const probestartBusy = (): boolean => probestart.busy;
  ctx.debug.register('libelle-gust', () => probestart.press());
  ctx.debug.register('probestart', () => probestart.press());

  // H with no EMI within 15 m: EMI-01 answers over the radio with the next step
  ctx.events.on('emi:ask', (p: { zone?: string | null } | undefined) => {
    if (p?.zone) {
      void ctx.hud.say([{ speaker: radio, text: S.askZone }], { interrupt: true });
      return;
    }
    const ended = !!finaleState().ended;
    const nearLibelle = ctx.player.position.distanceTo(new THREE.Vector3(LIBELLE.center[0], 0, LIBELLE.center[2])) < 9;
    const line: Text =
      stage <= 1 ? START.toLibelle : stage === 2 ? START.toLever : nearLibelle && !display.snap.flight.liftoffSeen && display.snap.flight.state === 'ground' ? START.libelleAsk : current ? S.askRoute : ended ? S.askFree : S.done;
    // on the plaza / hub: a hint to the nearest unfound Sensorkapsel (C5)
    const hint = stage >= 3 ? (hooks.capsuleHint?.() ?? null) : null;
    void ctx.hud.say(hint ? [{ speaker: radio, text: line }, { speaker: radio, text: hint }] : [{ speaker: radio, text: line }], { interrupt: true });
  });

  emi.onAsk(() => {
    if (stage <= 2) void emi.say([START.greet], { durationS: 3.6 });
    else void emi.say([S.askHub], { durationS: 5 });
  });

  // ── EMI-01 shows its newest skill at the foyer door (FUN-PLAN C6, P2) ────
  const demo = buildSkillDemo(ctx, emi, () => stage >= 3 && !probestartBusy());
  ctx.debug.register('emi01-demo', () => demo.state());
  for (const id of ['sehen', 'regeln', 'greifen', 'lernen', 'arbeiten', 'messen'] as const) ctx.debug.register(`emi01-demo-${id}`, () => demo.force(id));

  ctx.events.on('player:respawn', ({ reason }: { reason: string }) => {
    if (reason !== 'fell') return;
    hooks.dispatchDrone(ctx.player.position);
    ctx.after(0.6, () => void ctx.hud.say([{ speaker: radio, text: S.rescue }]));
  });

  return {
    begin,
    terminalUsed() {
      // the foyer terminal is optional now: it hands the Pass over only if the Libelle did not
      if (stage >= 3) return;
      handOverPass();
    },
    refresh: refreshObjective,
    update() {
      /* behaviour is event-driven */
    },
  };
}

// ── W2: the movement card ─────────────────────────────────────────────────────

const MOVE_CSS = `
#onb-move { position: absolute; left: 50%; bottom: 176px; transform: translate(-50%, 8px); padding: 12px 20px 14px; display: flex; flex-direction: column; align-items: center; gap: 10px; opacity: 0; pointer-events: none; transition: opacity 0.3s ease, transform 0.3s ease; max-width: calc(100vw - 32px); box-sizing: border-box; }
#hud.talking #onb-move { bottom: max(176px, calc(56px + var(--dlg-h, 100px))); }
#onb-move.show { opacity: 1; transform: translate(-50%, 0); }
#onb-move .eyebrow { color: var(--orange-light, #ff8533); font-size: calc(11.5px * var(--ts, 1)); }
#onb-move .row { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 12px 26px; }
#onb-move .grp { display: flex; align-items: center; gap: 8px; color: var(--text); font-size: calc(15px * var(--ts, 1)); white-space: nowrap; }
#onb-move .kbd { min-width: calc(32px * var(--ts, 1)); height: calc(32px * var(--ts, 1)); padding: 0 calc(9px * var(--ts, 1)); font-size: calc(13px * var(--ts, 1)); box-sizing: border-box; }
#onb-move .wasd { display: grid; grid-template-columns: repeat(3, calc(32px * var(--ts, 1))); gap: 3px; }
#onb-move .wasd .kbd { min-width: 0; padding: 0; }
#onb-move .wasd .w { grid-column: 2; grid-row: 1; }
#onb-move .wasd .kbd:not(.w) { grid-row: 2; }
#onb-move .or { color: var(--text-2); font-size: calc(13px * var(--ts, 1)); }
#hud.cinematic #onb-move { opacity: 0; }
#hud:has(#modals > .modal-backdrop.show:not(.passthrough)) #onb-move { opacity: 0; transition: none; }
@media (prefers-reduced-motion: reduce) { #onb-move, #onb-move.show { transform: translate(-50%, 0); transition: opacity 0.2s linear; } }
`;

/**
 * W2 (UX-01, UX-15): the "how to walk" card. Key caps in a glass card above the subtitles, with
 * [H] Hilfe. `arm()` shows it (2 s after EMI's first line); it stays until the player has walked
 * ≥ 3 m AND turned ≥ 30°, and comes back after 8 s without moving while the Libelle is still ahead
 * (stage ≤ 1). Hidden behind panels, in operate mode, in the cinematic layout and while another
 * centred hint (e.g. a jump pad's) is showing. Ends for good once the Pass is handed over.
 */
function buildMoveCoach(ctx: ZoneContext, stageOf: () => number): { arm(): void; track(): void; state(): unknown } {
  const WALK_M = 3;
  const TURN_RAD = (30 * Math.PI) / 180;
  const IDLE_S = 8;
  let el: HTMLElement | null = null;
  let armed = false;
  let tracking = false;
  let walked = 0;
  let turned = 0;
  let learned = false;
  let idle = 0;
  let againWalk = 0; // movement since the card came back
  let againTurn = 0;
  let shown = false;
  let shownCount = 0;
  let last: THREE.Vector3 | null = null;
  let lastYaw = 0;
  const T = (t: Text): string => ctx.i18n.resolve(t);
  const kbd = (k: string, cls = ''): HTMLElement => {
    const s = document.createElement('span');
    s.className = cls ? `kbd ${cls}` : 'kbd';
    s.textContent = k;
    return s;
  };
  const span = (text: string, cls = ''): HTMLElement => {
    const s = document.createElement('span');
    if (cls) s.className = cls;
    s.textContent = text;
    return s;
  };
  const grp = (...kids: HTMLElement[]): HTMLElement => {
    const g = document.createElement('div');
    g.className = 'grp';
    g.append(...kids);
    return g;
  };
  const render = (): void => {
    if (!el) return;
    const wasd = document.createElement('span');
    wasd.className = 'wasd';
    wasd.setAttribute('aria-hidden', 'true');
    wasd.append(kbd('W', 'w'), kbd('A'), kbd('S'), kbd('D'));
    const eyebrow = span(T(S.moveEyebrow), 'eyebrow');
    const row = document.createElement('div');
    row.className = 'row';
    row.append(
      grp(wasd, span(T(S.moveWalk))),
      grp(kbd(T(S.moveMouse)), span(T(S.moveOr), 'or'), kbd('←'), kbd('→'), span(T(S.moveLook))),
      grp(kbd('Shift'), span(T(S.moveSprint))),
      grp(kbd('H', 'accent'), span(T(S.moveHelp))),
    );
    el.replaceChildren(eyebrow, row);
    el.setAttribute('aria-label', `${T(S.moveWalk)}: W A S D · ${T(S.moveLook)}: ${T(S.moveMouse)} ${T(S.moveOr)} ← → · ${T(S.moveSprint)}: Shift · ${T(S.moveHelp)}: H`);
  };
  const ensure = (): HTMLElement | null => {
    if (el) return el;
    const host = document.getElementById('hud');
    if (!host) return null;
    if (!document.getElementById('onb-move-css')) {
      const st = document.createElement('style');
      st.id = 'onb-move-css';
      st.textContent = MOVE_CSS;
      document.head.append(st);
    }
    el = document.createElement('div');
    el.id = 'onb-move';
    el.className = 'glass';
    el.setAttribute('role', 'note');
    // under the modals layer (#modals paints over the HUD by DOM order), and hidden by CSS while a
    // pause menu or panel is open: the card's own tick does not run while game time is frozen
    host.insertBefore(el, document.getElementById('modals'));
    render();
    return el;
  };
  ctx.i18n.onChange(render);
  ctx.onDispose(() => {
    el?.remove();
    el = null;
  });
  const setShown = (v: boolean): void => {
    if (v === shown) return;
    shown = v;
    if (v) shownCount++;
    const e = ensure();
    e?.classList.toggle('show', v);
    e?.setAttribute('aria-hidden', v ? 'false' : 'true');
  };
  const tick = (): void => {
    const stage = stageOf();
    if (stage >= 3) {
      armed = false;
      tracking = false;
      setShown(false);
      return;
    }
    const p = ctx.player.position;
    const yaw = ctx.player.yaw;
    const busy = ctx.hud.modalOpen || ctx.player.operating;
    let moved = 0,
      dYaw = 0;
    if (last && !busy) {
      moved = Math.hypot(p.x - last.x, p.z - last.z);
      if (moved > 3) moved = 0; // a teleport or a jump-pad flight, not a walk
      dYaw = Math.abs(THREE.MathUtils.euclideanModulo(yaw - lastYaw + Math.PI, Math.PI * 2) - Math.PI);
    }
    last = (last ?? new THREE.Vector3()).copy(p);
    lastYaw = yaw;
    walked += moved;
    turned += dYaw;
    if (!learned && walked >= WALK_M && turned >= TURN_RAD) {
      learned = true;
      armed = false;
    }
    if (moved > 0.05 || dYaw > 0.02) {
      idle = 0;
      againWalk += moved;
      againTurn += dYaw;
    } else if (!busy) idle += 0.1;
    // back after 8 s standing still while the Libelle is still ahead; once learned, gone again after 1.5 m or a turn
    if (!armed && stage <= 1 && idle >= IDLE_S) {
      armed = true;
      againWalk = againTurn = 0;
    }
    if (learned && armed && (againWalk >= 1.5 || againTurn >= TURN_RAD)) armed = false;
    const other = !!document.querySelector('#hint.show');
    const cinematic = !!document.querySelector('#hud.cinematic');
    setShown(armed && !busy && !other && !cinematic);
  };
  ctx.every(0.1, () => {
    if (tracking) tick();
  });
  return {
    /** show the card (unless the player already walked and turned) */
    arm() {
      tracking = true;
      if (!learned && stageOf() < 3) armed = true;
    },
    /** start counting walk and turn (at the arrival) */
    track() {
      if (stageOf() < 3) tracking = true;
    },
    state: () => ({ stage: stageOf(), armed, shown, shownCount, learned, walked: Math.round(walked * 10) / 10, turnedDeg: Math.round((turned * 180) / Math.PI), idle: Math.round(idle * 10) / 10 }),
  };
}

// ── EMI-01's skill demos ──────────────────────────────────────────────────────

type SkillDemoId = 'sehen' | 'regeln' | 'greifen' | 'lernen' | 'arbeiten' | 'messen';
const DEMO_HOME = new THREE.Vector3(2, 0, 11);

/**
 * EMI-01 at its home spot by the foyer door shows the NEWEST skill it learned (the zone of the
 * last earned first stamp) while the player is within 10 m: SEHEN visor sweep, REGELN a stick
 * balanced on one hand (a PD loop on the wrist with a visible wobble), GREIFEN an egg held gently,
 * LERNEN copies the player's turn, ARBEITEN carries a crate, MESSEN reads a tablet. Props are small
 * meshes; nothing is shown before the first skill.
 */
function buildSkillDemo(ctx: ZoneContext, emi: EmiHandle, allowed: () => boolean): { state(): unknown; force(id: SkillDemoId): unknown } {
  const ORDER: SkillDemoId[] = ['sehen', 'regeln', 'greifen', 'lernen', 'arbeiten', 'messen'];
  let newest: SkillDemoId | null = null;
  for (const sk of ctx.game.skills.list()) if (sk.unlocked) newest = sk.id;
  ctx.events.on('emi:skill', (p: { id?: SkillDemoId }) => {
    if (p?.id && ORDER.includes(p.id)) newest = p.id;
  });
  ctx.events.on('progress:reset', () => (newest = null));
  let forced: SkillDemoId | null = null;
  let active: SkillDemoId | null = null;
  const M = ctx.materials;
  const props = new THREE.Group();
  props.name = 'emi01:skill-props';
  emi.object.add(props);
  const stick = new THREE.Group();
  stick.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 8).translate(0, 0.45, 0), M.standard({ color: 0xc9c4be, roughness: 0.3, metalness: 0.9 })));
  stick.add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8).translate(0, 0.9, 0), M.standard({ color: 0xff6700, roughness: 0.4 })));
  const egg = new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12).scale(1, 1.3, 1), M.standard({ color: 0xf2ece4, roughness: 0.55 }));
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.26), M.crate);
  const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.14), M.standard({ color: 0x1f1d1c, roughness: 0.3, emissive: 0x2dd4bf, emissiveIntensity: 0.15 }));
  for (const o of [stick, egg, crate, tablet]) {
    o.visible = false;
    props.add(o);
  }
  const JOINTS = ['neck_yaw', 'neck_pitch', 'waist_yaw', 'shoulder_pitch_r', 'shoulder_roll_r', 'elbow_r', 'wrist_pitch_r', 'shoulder_pitch_l', 'shoulder_roll_l', 'elbow_l'];
  const release = (): void => {
    for (const j of JOINTS) emi.releaseJoint(j);
    for (const o of props.children) o.visible = false;
    active = null;
  };
  // stick: a little inverted pendulum (θ'' = (g/L)·sin θ − kp·θ − kd·θ' + noise), the wrist corrects
  let th = 0.05,
    om = 0,
    t = 0;
  const hand = new THREE.Vector3();
  const tick = (dt: number): void => {
    t += dt;
    const near = ctx.player.position.distanceTo(emi.object.getWorldPosition(hand)) < 10;
    const home = emi.object.position.distanceTo(DEMO_HOME) < 0.6;
    const want = forced ?? (allowed() && near && home ? newest : null);
    if (want !== active) {
      release();
      active = want;
    }
    if (!active) return;
    const reduced = ctx.settings.reducedMotion;
    switch (active) {
      case 'sehen':
        emi.setJoint('neck_yaw', reduced ? 0.3 : Math.sin(t * 1.4) * 0.65);
        emi.setJoint('neck_pitch', -0.05);
        break;
      case 'regeln': {
        // right forearm forward at chest height, the stick on the back of the hand
        emi.setJoint('shoulder_pitch_r', -0.75);
        emi.setJoint('elbow_r', -0.95);
        const g = 9.81 / 0.9;
        const noise = (Math.sin(t * 7.3) + Math.sin(t * 3.1 + 1)) * 0.35;
        const kp = 22,
          kd = 4.5;
        const steps = 4;
        for (let i = 0; i < steps; i++) {
          const h = Math.min(dt, 0.05) / steps;
          const a = g * Math.sin(th) - kp * th - kd * om + noise;
          om += a * h;
          th = THREE.MathUtils.clamp(th + om * h, -0.5, 0.5);
        }
        emi.setJoint('shoulder_roll_r', -0.08 - th * 0.35);
        emi.setJoint('neck_pitch', -0.15);
        emi.joints['wrist_yaw_r'].getWorldPosition(hand);
        props.worldToLocal(hand);
        stick.position.copy(hand).add(new THREE.Vector3(0, 0.02, 0.02));
        stick.rotation.set(0, 0, reduced ? 0 : th);
        stick.visible = true;
        break;
      }
      case 'greifen':
        emi.setJoint('shoulder_pitch_r', -0.8);
        emi.setJoint('elbow_r', -1.05);
        emi.setJoint('neck_pitch', -0.3);
        emi.joints['wrist_yaw_r'].getWorldPosition(hand);
        props.worldToLocal(hand);
        egg.position.copy(hand).add(new THREE.Vector3(0, -0.06 + Math.sin(t * 2) * 0.004, 0.03));
        egg.visible = true;
        break;
      case 'lernen': {
        // copies you: turns its waist the way you turn your head
        const rel = THREE.MathUtils.euclideanModulo(ctx.player.yaw - emi.object.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
        emi.setJoint('waist_yaw', THREE.MathUtils.clamp(-rel * 0.5, -0.8, 0.8));
        emi.setJoint('neck_yaw', THREE.MathUtils.clamp(-rel * 0.3, -0.5, 0.5));
        break;
      }
      case 'arbeiten':
        for (const [side, sgn] of [['r', -1], ['l', 1]] as const) {
          emi.setJoint(`shoulder_pitch_${side}`, -0.95);
          emi.setJoint(`shoulder_roll_${side}`, sgn * 0.12);
          emi.setJoint(`elbow_${side}`, -0.75);
        }
        emi.joints['wrist_yaw_r'].getWorldPosition(hand);
        props.worldToLocal(hand);
        crate.position.set(0, hand.y - 0.02 + (reduced ? 0 : Math.sin(t * 3.2) * 0.008), hand.z + 0.02);
        crate.visible = true;
        break;
      case 'messen':
        emi.setJoint('shoulder_pitch_r', -0.7);
        emi.setJoint('elbow_r', -1.15);
        emi.setJoint('neck_pitch', 0.32 + (reduced ? 0 : Math.max(0, Math.sin(t * 0.9)) * 0.1));
        emi.joints['wrist_yaw_r'].getWorldPosition(hand);
        props.worldToLocal(hand);
        tablet.position.copy(hand).add(new THREE.Vector3(0.02, -0.04, 0.05));
        tablet.rotation.set(-0.5, 0, 0);
        tablet.visible = true;
        break;
    }
  };
  ctx.every(1 / 30, () => tick(1 / 30));
  return {
    state: () => ({ newest, active, forced }),
    force(id) {
      forced = id;
      return { newest, active: id };
    },
  };
}
