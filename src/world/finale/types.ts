import type { ChallengeDef, ChallengeHandle, EmiHandle, Text, ZoneContext } from '@/core/zones';
import type { GroundHandle } from '../ground';
import type { Room } from './room';
import type { Ticker } from './ride';
import type { AuditTally, TrialResult, TrialSpec } from './sim';

export type Recommendation = 'pilot' | 'pilotCond' | 'none';

/** Persistent finale state (ctx.progress 'finale', island storage). */
export interface FinaleState {
  announced: boolean;
  visited: boolean;
  f1: { max: number; over: number; settle: number; held: boolean; skipped?: boolean } | null;
  f2: { seed: number; tally: AuditTally; predicted: number; sturmSeen: boolean } | null;
  f3: { rec: Recommendation; reasons: string[]; alt: string; sentence: { de: string; en: string } } | null;
  ended: boolean;
  name: string;
  /** „Ein Jahr später" was shown (rc4: after signing; Phase 7: the „Erstflug-Protokoll“ on the certificate, FUN-PLAN §5 C8) */
  yearLater?: boolean;
}

export const emptyState = (): FinaleState => ({ announced: false, visited: false, f1: null, f2: null, f3: null, ended: false, name: '' });

export interface FinaleEnv {
  ctx: ZoneContext;
  room: Room;
  /** WP3's dock (the arms of F1 and the lift-off); null without the ground module */
  ground: () => GroundHandle | null;
  /** Phase 7: the first flight is done (the quest's flight: firstFlightAt or liftoffSeen) */
  flown(): boolean;
  tick: Ticker;
  state: FinaleState;
  save(): void;
  /** the keel's EMI-01 (null while not spawned) */
  emi(): EmiHandle | null;
  /** EMI-01 speaks (subtitle + chirp); falls back to the HUD speaker line */
  say(lines: Text | Text[], durationS?: number, o?: { interrupt?: boolean }): Promise<void>;
  /** set the keel objective for the current step */
  refreshObjective(): void;
  /** the station flow is busy (a minigame/modal is running) */
  busy: boolean;
  /** called once when the ending sets `state.ended` (the evening sky and its switch take over) */
  onEnded?: () => void;
  /** F2 trial results with traces (recomputed from the saved seed when needed) */
  audit: { seed: number; results: { spec: TrialSpec; nn: TrialResult; bestand: TrialResult }[] } | null;
  /** W8: the audit being computed in slices (f2.ts auditInSlices) */
  auditJob?: { seed: number; done: Promise<void> } | null;
  /** F1 as a game-layer challenge (station: false): ★ from the time over 3° */
  f1?: ChallengeHandle;
  /** the F1 challenge definition (re-registered with a retry while the Leitstand panel is open) */
  f1Def?: ChallengeDef;
  /** ends „Ein Jahr später" on the Messwand if it is playing (set while it runs) */
  endYear?: () => void;
}
