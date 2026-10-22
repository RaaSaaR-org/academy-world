/**
 * WP12: the island side of every beat of the three systems (plan §3.3, D23). The quest spine says
 * WHEN a system changes; this module makes it felt, wherever the player stands (≤ 6 s each):
 *  - ignition (a rotor's ◆): 1.5 s after the result banner a whump and a rising drone under the lobe,
 *    slot spray at its tip (`ground.spray`), duct ring, crown beacon and Libelle lamp teal, one Recamán
 *    note, a toast, the rotor line on the radio, `life:react` { kind: 'rotor' }, a camera shake ≤ 0.1;
 *  - the charge beat (Sonnenacker ◆ → AKKU): the Libelle bar full teal, trim T3 ignites under Kanzel 240;
 *  - the upload beat (Traumhangar ◆ → NAV): the needle light and the nav lamp teal, trim T2 under Kanzel 120;
 *  - the trims T1 and T4; the Revier at the first rotor; KIEL at 4/6; the 6/6 beat; the Startklar beat
 *    (merged with 6/6 when a rotor is last, its own when AKKU or NAV is last); F3 signed with a system missing.
 * Each plays once (`ctx.quest.markBeat`); the zones play their own lines and listen for
 * 'island:ignition' phase 'line' to point back in (§3.3 B-◆ hook). WP9 and WP10 play the farm and
 * hangar sides of the charge and upload beats.
 */
import * as THREE from 'three';
import type { Text, ZoneContext } from '@/core/zones';
import type { QuestSnapshot } from '@/core/quest/types';
import type { CoreId, SystemId, TrimId } from '@/core/zones/manifest';
import { ISLAND, ZONE_PLOTS, outlineRadius, polar, type Vec3Tuple } from '../layout';
import type { GroundHandle } from '../ground';
import { isReady, ROTORS, TRIMS, type PulseTarget, type StartDisplay } from './state';
import type { IslandRotors } from './rotors';
import type { IgnitionEvent, StartBeatEvent } from './contract';
import { RADIO_SPEAKER, ROTOR_LINE, START, listJoin } from './strings';
import { BEATS } from './tuning';

/** Recamán a(1…10): the note of rotor k is a(k + 1) semitones over 220 Hz (the stamps' melody, §3.3 „one Recamán note“) */
const RECAMAN = [0, 1, 3, 6, 2, 7, 13, 20, 12, 21, 11];
const noteOf = (k: number): number => 220 * Math.pow(2, RECAMAN[Math.min(RECAMAN.length - 1, k + 1)] / 12);

export interface Beats {
  /** what played (tools: beats-check) */
  readonly log: readonly { id: string; t: number }[];
  /** the queue is idle */
  readonly idle: boolean;
}

export interface BeatsDeps {
  display: StartDisplay;
  rotors: IslandRotors;
  ground: () => GroundHandle | null;
  /** the Revier opened or closed (Kanzel pads, map) */
  onRegion(open: boolean): void;
  /** KIEL opened (lift signs) */
  onKiel(): void;
  /** the objective may have moved (F3 signed with a system missing) */
  onObjective(): void;
  /** the Probestart is running (beats wait for it) */
  probestartBusy(): boolean;
  /** the area that starts a system (manifests), for the toast and the B-◆ hook */
  areaOf(id: SystemId): { id: string; name: { de: string; en: string } } | null;
}

export function buildBeats(ctx: ZoneContext, deps: BeatsDeps): Beats {
  const { display } = deps;
  const log: { id: string; t: number }[] = [];
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;
  const wait = (s: number): Promise<void> => new Promise((r) => ctx.after(s, r));
  /** queue a beat: beats never overlap, and they wait for a running Probestart */
  const queue = (delay: number, fn: () => Promise<void>): void => {
    pending++;
    tail = tail
      .then(() => wait(delay))
      .then(async () => {
        while (deps.probestartBusy()) await wait(0.5);
      })
      .then(fn)
      .catch((err) => console.error('[start] beat failed', err))
      .then(() => wait(BEATS.gapS))
      .finally(() => void pending--);
  };
  const radio = (line: Text): Promise<void> => {
    ctx.audio.tone({ freq: 880, to: 1320, dur: 0.12, type: 'sine', volume: 0.6 });
    return ctx.hud.say([{ speaker: RADIO_SPEAKER, text: line }]);
  };
  const played = (id: string): void => void log.push({ id, t: Math.round(ctx.time.elapsed * 10) / 10 });

  const lobeTip = (k: number): Vec3Tuple => {
    const b = ZONE_PLOTS[k].bearing;
    return polar(b, outlineRadius(b, true) + 2, -3);
  };
  const kanzelRim = (bearing: number): Vec3Tuple => polar(bearing, ISLAND.kanzeln.ring + ISLAND.kanzeln.radius + 4, -3);
  const whump = (at: THREE.Vector3 | Vec3Tuple, big = 1): void => {
    const p: Vec3Tuple = Array.isArray(at) ? at : [at.x, at.y, at.z];
    ctx.audio.play('thud', { volume: 0.9 * big, pitch: 0.5, at: p });
    ctx.audio.tone({ freq: 44, to: 82, dur: 0.6, type: 'sine', volume: 0.85 * big, at: p });
    ctx.audio.tone({ freq: 88, to: 164, dur: 1.8, type: 'triangle', volume: 0.22 * big, at: p });
  };
  const shake = (): void => {
    if (!ctx.settings.reducedMotion) ctx.player.shake(BEATS.shake, BEATS.shakeS);
  };
  const toast = (t: Text): void => ctx.hud.toast(t, { kind: 'success', eyebrow: START.eyebrowStart, duration: 5 });
  const nameText = (id: SystemId): Text => (lang) => {
    const a = deps.areaOf(id);
    return a ? (lang === 'de' ? a.name.de : a.name.en) : id;
  };

  // ── one rotor's ignition ──────────────────────────────────────────────────
  const ignite = (k: number, crew: boolean): void =>
    queue(BEATS.ignitionDelay, async () => {
      const id = ROTORS[k];
      if (!ctx.quest.markBeat(id)) {
        display.release(id);
        return;
      }
      played(id);
      display.release(id);
      const tip = lobeTip(k);
      whump(deps.rotors.center(k));
      ctx.audio.tone({ freq: noteOf(k), dur: 0.9, type: 'triangle', volume: 0.45 });
      deps.ground()?.spray.emit('plume', tip, 1);
      ctx.events.emit('life:react', { kind: 'rotor', at: tip });
      shake();
      toast((lang) => `${id} ${crew ? (lang === 'de' ? START.toastCrew.de : START.toastCrew.en) : lang === 'de' ? START.toastReady.de : START.toastReady.en} · ${ctx.i18n.resolve(nameText(id))}`);
      const areaId = deps.areaOf(id)?.id ?? '';
      ctx.events.emit('island:ignition', { id, areaId, phase: 'start' } satisfies IgnitionEvent);
      await radio(crew ? (lang) => `${id} ${lang === 'de' ? START.crewRotor.de : START.crewRotor.en}` : ROTOR_LINE[id]);
      ctx.events.emit('island:ignition', { id, areaId, phase: 'line' } satisfies IgnitionEvent);
    });

  /** a trim rotor ignites (whump, plume over the dock rim); T2 and T3 ride in the NAV and AKKU beats */
  const igniteTrim = (t: TrimId): void => {
    const j = TRIMS.indexOf(t);
    if (!ctx.quest.markBeat(t)) {
      display.release(t);
      return;
    }
    played(t);
    display.release(t);
    const bearing = ISLAND.kanzeln.bearings[j];
    whump(deps.rotors.center(6 + j), 0.7);
    // the spin-up chord of a trim: a soft fifth over the Recamán root
    ctx.audio.tone({ freq: 330, dur: 1.1, type: 'triangle', volume: 0.25 });
    ctx.audio.tone({ freq: 495, dur: 1.1, type: 'triangle', volume: 0.18 });
    deps.ground()?.spray.emit('plume', kanzelRim(bearing), 0.8);
  };

  /** the charge beat (island side): the bar locks full, T3 ignites under Kanzel 240 */
  const charge = (): void =>
    queue(BEATS.ignitionDelay, async () => {
      display.holdCharge(null);
      if (!ctx.quest.markBeat('AKKU')) {
        display.release('AKKU');
        igniteTrimQuiet('T3');
        return;
      }
      played('AKKU');
      display.release('AKKU');
      ctx.audio.tone({ freq: 392, to: 784, dur: 0.9, type: 'sine', volume: 0.4 });
      igniteTrim('T3');
      ctx.events.emit('life:react', { kind: 'rotor', at: kanzelRim(240) });
      toast(START.toastAkku);
      ctx.events.emit('island:ignition', { id: 'AKKU', areaId: deps.areaOf('AKKU')?.id ?? 'sonnenacker', phase: 'start' } satisfies IgnitionEvent);
      await wait(2.5);
      ctx.events.emit('island:ignition', { id: 'AKKU', areaId: deps.areaOf('AKKU')?.id ?? 'sonnenacker', phase: 'line' } satisfies IgnitionEvent);
    });
  const igniteTrimQuiet = (t: TrimId): void => {
    ctx.quest.markBeat(t);
    display.release(t);
  };

  /** the upload beat (island side): the needle light turns teal, T2 ignites under Kanzel 120, the NAV line */
  const upload = (): void =>
    queue(BEATS.ignitionDelay, async () => {
      if (!ctx.quest.markBeat('NAV')) {
        display.release('NAV');
        igniteTrimQuiet('T2');
        return;
      }
      played('NAV');
      display.release('NAV');
      ctx.audio.tone({ freq: 523, to: 1047, dur: 1.1, type: 'sine', volume: 0.35 });
      igniteTrim('T2');
      ctx.events.emit('life:react', { kind: 'rotor', at: kanzelRim(120) });
      toast(START.toastNav);
      const areaId = deps.areaOf('NAV')?.id ?? 'traumhangar';
      ctx.events.emit('island:ignition', { id: 'NAV', areaId, phase: 'start' } satisfies IgnitionEvent);
      await radio(START.navLine);
      ctx.events.emit('island:ignition', { id: 'NAV', areaId, phase: 'line' } satisfies IgnitionEvent);
    });

  // ── milestones ───────────────────────────────────────────────────────────
  const revier = (): void =>
    queue(0.4, async () => {
      if (!display.snap.regionOpen) return;
      played('revier');
      deps.ground()?.setGate(true);
      deps.onRegion(true);
      ctx.events.emit('island:beat', { id: 'revier' } satisfies StartBeatEvent);
      await radio(ctx.mode === 'entscheider' ? START.revierDeciders : START.revierDe);
    });
  const kiel = (): void =>
    queue(0.4, async () => {
      played('kiel');
      deps.onKiel();
      ctx.events.emit('island:beat', { id: 'kiel' } satisfies StartBeatEvent);
      await radio(START.kiel);
    });
  /** what is still missing for Startklar after 6/6 (§3.3) */
  const sixLine = (s: QuestSnapshot): Text => {
    const akku = isReady(s.start.energy.state),
      nav = isReady(s.start.nav.state);
    return !akku && !nav ? START.sixBoth : !akku ? START.sixAkku : START.sixNav;
  };
  const allSix = (): void => {
    for (let k = 0; k < 6; k++) deps.ground()?.spray.emit('plume', lobeTip(k), 1);
  };
  const six = (): void =>
    queue(0.3, async () => {
      const s = display.snap;
      const merged = s.start.startklar;
      if (!ctx.quest.markBeat('6of6')) return;
      played('6of6');
      if (merged && ctx.quest.markBeat('startklar')) played('startklar');
      allSix();
      ctx.events.emit('life:react', { kind: 'rotor', at: [0, 0, 0] });
      ctx.events.emit('island:beat', { id: '6of6' } satisfies StartBeatEvent);
      if (merged) ctx.events.emit('island:beat', { id: 'startklar' } satisfies StartBeatEvent);
      chord(merged);
      const targets: PulseTarget[] = merged ? ['lamps', 'bar', 'nav', 'crown', 'needle'] : ['lamps', 'crown'];
      const pulse = display.pulse(targets);
      await radio(START.sixOfSix);
      await radio(merged ? START.startklar : sixLine(s));
      if (merged) await radio(s.f3Signed ? START.readyGo : START.readyKiel);
      await pulse;
    });
  const startklar = (): void =>
    queue(0.3, async () => {
      if (!ctx.quest.markBeat('startklar')) return;
      played('startklar');
      ctx.events.emit('island:beat', { id: 'startklar' } satisfies StartBeatEvent);
      chord(true);
      const pulse = display.pulse(['lamps', 'bar', 'nav', 'crown', 'needle']);
      await radio(START.startklar);
      await radio(display.snap.f3Signed ? START.readyGo : START.readyKiel);
      await pulse;
    });
  const f3Missing = (): void =>
    queue(0.5, async () => {
      const s = display.snap;
      if (s.start.startklar) return;
      played('f3-missing');
      deps.onObjective();
      const parts = (lang: 'de' | 'en'): string[] => {
        const out: string[] = ROTORS.filter((r) => !isReady(s.systems[r]));
        if (!isReady(s.start.energy.state)) out.push(lang === 'de' ? START.akkuWord.de : START.akkuWord.en);
        if (!isReady(s.start.nav.state)) out.push(lang === 'de' ? START.navWord.de : START.navWord.en);
        return out;
      };
      await radio((lang) => `${lang === 'de' ? START.f3Missing.de : START.f3Missing.en} ${listJoin(lang, parts(lang))}.`);
    });
  /** a rising chord under the 6/6 and Startklar pulses (the six notes of the rotors) */
  const chord = (full: boolean): void => {
    for (let k = 0; k < 6; k++) ctx.after(k * 0.12, () => ctx.audio.tone({ freq: noteOf(k), dur: 1.6, type: 'triangle', volume: 0.2 }));
    if (full) ctx.after(0.9, () => ctx.audio.tone({ freq: 880, to: 1320, dur: 0.8, type: 'sine', volume: 0.3 }));
  };

  // ── the diff ───────────────────────────────────────────────────────────────
  display.onQuest((prev, next) => {
    // rotors: an ignition holds the rotor's old look until its beat plays
    ROTORS.forEach((id, k) => {
      const a = prev.systems[id],
        b = next.systems[id];
      if (!isReady(a) && isReady(b)) {
        display.hold(id, a);
        ignite(k, next.groundCrew.some((c) => c.id === id) && !prevHadCrew(prev, id));
      } else if (b === 'geprueft' && a !== 'geprueft' && isReady(a)) {
        // all three stamps: a short chime; the lamp keeps a steady halo from now on
        ctx.after(BEATS.ignitionDelay, () => ctx.audio.tone({ freq: noteOf(k) * 2, dur: 0.5, type: 'sine', volume: 0.3 }));
      }
    });
    // AKKU / NAV: the player's own ◆ (also after a Bodencrew supply on a detour)
    const own = (c: CoreId): boolean => {
      const p = c === 'AKKU' ? prev.start.energy : prev.start.nav;
      const n = c === 'AKKU' ? next.start.energy : next.start.nav;
      return n.by === 'player' && p.by !== 'player' && isReady(n.state);
    };
    if (own('AKKU')) {
      display.hold('AKKU', prev.systems.AKKU);
      display.holdCharge(display.crewShown('AKKU') ? 1 : prev.start.energy.charge);
      display.hold('T3', prev.systems.T3);
      charge();
    } else if (next.start.energy.charge > prev.start.energy.charge && !isReady(next.start.energy.state)) {
      // a Sonnenacker stamp: the bar turns amber and fills a third
      ctx.after(BEATS.ignitionDelay, () => ctx.audio.tone({ freq: 392, to: 523, dur: 0.4, type: 'sine', volume: 0.25 }));
    }
    if (own('NAV')) {
      display.hold('NAV', prev.systems.NAV);
      display.hold('T2', prev.systems.T2);
      upload();
    }
    for (const t of ['T1', 'T4'] as const)
      if (!isReady(prev.systems[t]) && isReady(next.systems[t])) {
        display.hold(t, prev.systems[t]);
        queue(BEATS.ignitionDelay, async () => igniteTrim(t));
      }
    if (!prev.regionOpen && next.regionOpen) revier();
    else if (prev.regionOpen && !next.regionOpen) deps.onRegion(false);
    if (!prev.kielOpen && next.kielOpen) kiel();
    if (prev.start.lift < 6 && next.start.lift === 6) six();
    else if (!prev.start.startklar && next.start.startklar && prev.start.lift === 6) startklar();
    if (!prev.f3Signed && next.f3Signed && !next.start.startklar) f3Missing();
  });

  return {
    log,
    get idle() {
      return pending === 0;
    },
  };
}

function prevHadCrew(prev: QuestSnapshot, id: SystemId): boolean {
  return prev.groundCrew.some((c) => c.id === id);
}
