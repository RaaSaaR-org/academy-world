/**
 * WP1 — the quest spine's tunable numbers (plan §6.1: WP20 edits only these). Every value has its
 * plan reference; changing one needs no other code change.
 */
import type { RotorId } from '../zones/manifest';

/**
 * §5.8 / R5 §4.2, the Entscheider timing fallback: rotors the Bodencrew starts in Entscheider mode after
 * the Probestart (reason 'timing', „Bodencrew · ohne Kennlinie“), if first-time managers need more than
 * 30 min. Empty = off (the MUST build); the H-TIME / wave-2 sessions decide, e.g. ['M5', 'M6'].
 */
export const ENTSCHEIDER_TIMING_CREW: readonly RotorId[] = [];

/** §5.8: „Erneut laden“ presses that must fail before the loading card offers „Bodencrew übernimmt“. */
export const CREW_AFTER_RETRIES = 2;

/** §5.8: a retry with no answer after this long counts as failed (area code) or as done (a robot). */
export const RETRY_WAIT_MS = 20000;

/** §4.1: an area that is still loading shows its card only after the player has stood in it this long. */
export const LOADING_GRACE_MS = 1500;
