/**
 * Where Start puts the player, and what the title offers (plan §3.6, D26; replaces rc4's D13). The
 * rules are pure (planFor, titleFor); Game calls resumePlan/titleState with its ResumeInput, and the
 * quest spine fills the Phase 7 fields Game does not pass (the glide seen, the flight state, an area's
 * frame, the rotors) through setResumeSource(). The glide itself and the bridge-head spawn are WP12's
 * (src/world/intro.ts): it reads `glide` (or the rc4 `skipAscent`) from 'game:start'.
 */
import type { LaunchParams } from '../params';
import type { PlotFrame } from '../zones/manifest';
import type { FlightStateName } from './types';

/** What the resume rule reads. Game builds it from the launch params, the save and the zone records. */
export interface ResumeInput {
  readonly params: Pick<LaunchParams, 'skipIntro' | 'zone' | 'pos' | 'world'>;
  /** the rc4 island flag 'ascentSeen' (a complete ascent counts as the glide seen until WP12 retires it) */
  readonly ascentSeen: boolean;
  readonly reducedMotion: boolean;
  /** a dev reload puts the player back where they were: no resume then */
  readonly devReload: boolean;
  /** the area entered last (Progress.lastZone) */
  readonly lastZone: string | null;
  /** the area can take the player: it has code that did not fail and a spawn */
  canResumeAt(id: string): boolean;
  /** anything earned so far (Progress.hasAnyProgress) */
  readonly hasProgress: boolean;
  /** island stamps so far („n von 18“) */
  readonly stamps: number;
  // ── Phase 7 (filled by the quest spine when the caller leaves them out) ──
  /** p7.quest start.glideSeen (or the rc4 ascent) */
  readonly glideSeen?: boolean;
  /** p7.quest flight */
  readonly flight?: FlightStateName;
  /** the frame of an area (null: unknown, treated as the island) */
  frameOf?(id: string): PlotFrame | null;
  /** rotors bereit 0…6 („m/6 Rotoren“) */
  readonly rotors?: number;
}

export interface ResumePlan {
  /** rc4 compatibility ('game:start' { skipAscent }): true whenever there is no glide */
  skipAscent: boolean;
  /** first visit: the 6 s glide (WP12; a fade under reduced motion) */
  glide: boolean;
  /** resume at this area's gate (island zones, halls, ground areas), or null: the default spawn */
  zone: string | null;
  /** an airborne save whose last area is on the ground resumes on the plaza */
  pos: [number, number, number] | null;
  yawDeg: number | null;
  /** the flight state this Start plays in („Im Dock weiterspielen“ makes it ground) */
  flight: FlightStateName;
}

export type TitleKind = 'first' | 'grounded' | 'airborne';

export interface TitleState {
  /** first visit · grounded with progress · airborne (R5 §3.3) */
  state: TitleKind;
  /** „Weiterspielen“ instead of „Starten“ */
  hasProgress: boolean;
  /** island stamps („n von 18“) */
  stamps: number;
  /** rotors bereit („m/6 Rotoren“) */
  rotors: number;
  /** D26: „Anflug ansehen“ is retired (always false; kept for the rc4 title callback) */
  offersApproach: boolean;
  /** airborne: „Im Dock weiterspielen“ (D25) */
  offersDock: boolean;
  /** airborne: „Abheben ansehen“ (stills under reduced motion) */
  offersReplay: boolean;
}

/** The plaza (0, 0, 26), facing the tower: where an airborne save resumes when its last area is on the ground. */
export const PLAZA: readonly [number, number, number] = [0, 0, 26];

export interface ResumeSource {
  glideSeen(): boolean;
  flight(): FlightStateName;
  frameOf(id: string): PlotFrame | null;
  rotors(): number;
}
let source: ResumeSource | null = null;

/** The quest spine registers where the Phase 7 fields come from (installQuest). */
export function setResumeSource(s: ResumeSource | null): void {
  source = s;
}

/** The input with the Phase 7 fields filled from the spine where the caller left them out. */
export function withQuest(i: ResumeInput): ResumeInput {
  if (!source) return i;
  const s = source;
  return {
    params: i.params,
    ascentSeen: i.ascentSeen,
    reducedMotion: i.reducedMotion,
    devReload: i.devReload,
    lastZone: i.lastZone,
    canResumeAt: (id) => i.canResumeAt(id),
    hasProgress: i.hasProgress,
    stamps: i.stamps,
    glideSeen: i.glideSeen ?? s.glideSeen(),
    flight: i.flight ?? s.flight(),
    frameOf: i.frameOf ?? ((id) => s.frameOf(id)),
    rotors: i.rotors ?? s.rotors(),
  };
}

/** A deep link, ?skipIntro, ?world=0 or a dev reload: the first-visit flow, without the glide and without a resume. */
function deepLink(i: ResumeInput): boolean {
  const p = i.params;
  return !!(p.skipIntro || p.zone || p.pos || !p.world || i.devReload);
}

/** First visit = nothing earned and no glide (or rc4 ascent) watched yet. */
function firstVisit(i: ResumeInput): boolean {
  return !i.hasProgress && !(i.glideSeen ?? i.ascentSeen);
}

/**
 * §3.6 (pure): first visit → the glide to the bridge head; returning grounded → the gate of the area
 * entered last (any frame), else the default spawn; returning airborne → the last area if it is aboard,
 * else the plaza. `dock` („Im Dock weiterspielen“) plays grounded at the last area.
 */
export function planFor(i: ResumeInput, o: { dock?: boolean } = {}): ResumePlan {
  const flight: FlightStateName = o.dock ? 'ground' : (i.flight ?? 'ground');
  const none: ResumePlan = { skipAscent: true, glide: false, zone: null, pos: null, yawDeg: null, flight };
  if (deepLink(i)) return none;
  if (firstVisit(i)) return { ...none, skipAscent: false, glide: true };
  const id = i.lastZone;
  const can = !!id && i.canResumeAt(id);
  if (flight === 'airborne') {
    const aboard = can && (i.frameOf?.(id!) ?? 'island') === 'island';
    return aboard ? { ...none, zone: id } : { ...none, pos: [...PLAZA], yawDeg: 0 };
  }
  return { ...none, zone: can ? id : null };
}

/** §3.6 / R5 §3.3 (pure): the three title states. */
export function titleFor(i: ResumeInput): TitleState {
  const airborne = (i.flight ?? 'ground') === 'airborne';
  const hasProgress = i.hasProgress || i.stamps > 0 || airborne;
  return {
    state: airborne ? 'airborne' : hasProgress ? 'grounded' : 'first',
    hasProgress,
    stamps: i.stamps,
    rotors: i.rotors ?? 0,
    offersApproach: false,
    offersDock: airborne,
    offersReplay: airborne,
  };
}

/** Kept for rc4 callers: true when Start plays without the glide (formerly: skips the ascent). */
export function skipsAscent(i: ResumeInput): boolean {
  return !planFor(withQuest(i)).glide;
}

/** Game: where this Start puts the player (`dock`: „Im Dock weiterspielen“; the rc4 `approach` flag is ignored, D26). */
export function resumePlan(i: ResumeInput, o: boolean | { dock?: boolean } = {}): ResumePlan {
  return planFor(withQuest(i), typeof o === 'boolean' ? {} : o);
}

/** Game: what the title shows. */
export function titleState(i: ResumeInput): TitleState {
  return titleFor(withQuest(i));
}
