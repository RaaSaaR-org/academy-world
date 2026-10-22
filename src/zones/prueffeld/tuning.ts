/**
 * Prüffeld tunables (plan §4 conventions: WP20 edits only this file): the thresholds and pace of WP8's
 * „Drei Auditoren, kurz“ (06 C, rev 2). The clips and the κ maths stay in model.ts; the report's
 * print threshold (κ ≥ 0,8) is the station's rule (model.ts KAPPA_MIN), not a tunable.
 */
export const AUDIT = {
  /** ★★★: the printed report reaches κ ≥ this (with the first rule, no refusal in round 2) */
  star3Kappa: 0.9,
  /** clip playback: 2× by default, the toggle goes to 1× for a closer look */
  fastDefault: true,
  fastSpeed: 2,
  /** the report prints: teal burst size */
  printBurst: 30,
} as const;
