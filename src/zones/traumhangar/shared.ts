import type { Text, ZoneContext } from '@/core/zones';
import type { Roster } from './roster';
import type { Pilot } from './pilot';
import type { Ghosts } from './ghosts';
import type { HangarSound } from './sound';
import type { RosterKey } from './tuning';

export type StationKey = 'a' | 'b' | 'c' | 'h2' | 'probe';

/** What every station of the hangar shares (the zone's index builds it once). */
export interface Hangar {
  ctx: ZoneContext;
  roster: Roster;
  pilot: Pilot;
  ghosts: Ghosts;
  sound: HangarSound;
  /** a lazy zone string */
  T(key: string, params?: Record<string, string | number>): Text;
  /** EMI-01 on the radio, in the zone (queued; `now` interrupts) */
  say(line: Text, now?: boolean): void;
  /** the objective line and the compass target */
  refreshObjective(): void;
  /** the station flying now (null: walking) */
  active: StationKey | null;
  /** a robot reached its first ★ here: send it to the Schauhalle (once) */
  deliver(k: RosterKey): void;
  /** the zone's attempt counter (seeds of the shuffles and draws) */
  seed(): number;
  /** the loading card for a robot that is not in yet (null when it is) */
  waitFor(k: RosterKey): boolean;
}
