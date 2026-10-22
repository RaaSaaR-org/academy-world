/**
 * Lastenheft job pool (plan §4.9, R4 §8; the H1-2 joins the humanoid job). Every answer follows from the
 * card rows only: a criterion reads a stated value (facts in robots.ts) and returns false for „k. A.“
 * („k. A.“ never fits). The deciding row of a robot for a job is the first criterion it fails, or the
 * job's key criterion when it fits; it is what the player taps to justify the answer. Jobs ≤ 12 words.
 */
import type { RobotId } from '@/core/zones';
import { ROBOT_BY_ID, type Bi, type Facts, type HallRobot, type RowKey } from './robots';

export interface Criterion {
  row: RowKey;
  /** true = fits · false = does not (a missing value is false) */
  test(f: Facts): boolean;
}

export interface Job {
  id: string;
  text: Bi;
  criteria: readonly Criterion[];
  /** the row that makes the right robot right */
  key: RowKey;
  /** 'keiner': no robot in the hall fits */
  answer: readonly RobotId[] | 'keiner';
  /** ★★★: the trick job, „Keiner passt“ right on the first try */
  trick?: boolean;
  /** for a 'keiner' job: the near misses shown at the terminal (a robot and its deciding row) */
  near?: readonly { id: RobotId; row: RowKey }[];
  /** a distractor fact shown with the near misses (it does not decide) */
  distractor?: { id: RobotId; row: RowKey };
  /** the distractor when its robot is not in this build's hall (an amber exhibit, src/core/release.ts) */
  distractorAlt?: { id: RobotId; row: RowKey };
}

const has = (n: number | undefined, min: number): boolean => n !== undefined && n >= min;

const ALL_JOBS: readonly Job[] = [
  {
    id: 'paletten',
    text: { de: 'Paletten bis 200 kg durch eine ebene Halle fahren.', en: 'Move pallets of up to 200 kg across a flat hall.' },
    criteria: [
      { row: 'kind', test: (f) => f.moves === 'faehrt' },
      { row: 'payload', test: (f) => has(f.payloadKg, 200) },
    ],
    key: 'payload',
    answer: ['mir250'],
  },
  {
    id: 'inspektion',
    text: { de: 'Staubdicht (IP6x) und Treppen bis 45° für eine Inspektionsrunde.', en: 'Dust-tight (IP6x) and stairs up to 45° for an inspection round.' },
    criteria: [
      { row: 'kind', test: (f) => f.moves === 'laeuft' },
      { row: 'env', test: (f) => has(f.ip, 6) },
      { row: 'env', test: (f) => has(f.stairsDeg, 45) },
    ],
    key: 'env',
    answer: ['anymal-d'],
  },
  {
    id: 'kaelte',
    text: { de: 'Draußen bei −20 °C eine Runde laufen.', en: 'Walk a round outdoors at −20 °C.' },
    criteria: [
      { row: 'kind', test: (f) => f.moves === 'laeuft' },
      { row: 'env', test: (f) => f.tempMinC !== undefined && f.tempMinC <= -20 },
    ],
    key: 'env',
    answer: ['spot'],
  },
  {
    id: 'cobot',
    text: { de: '12 kg heben, 0,8 m Reichweite, Drehmomentsensoren in allen Achsen.', en: 'Lift 12 kg, 0.8 m of reach, torque sensors in every axis.' },
    criteria: [
      { row: 'kind', test: (f) => !!f.arm },
      { row: 'payload', test: (f) => has(f.payloadKg, 12) },
      { row: 'reach', test: (f) => has(f.reachMm, 800) },
      { row: 'dof', test: (f) => !!f.torqueAll },
    ],
    key: 'dof',
    answer: ['kuka-iiwa-14'],
  },
  {
    id: 'autobau',
    text: { de: 'Ein Auto-Bauteil von 150 kg heben.', en: 'Lift a 150 kg car part.' },
    criteria: [
      { row: 'kind', test: (f) => f.lifts },
      { row: 'payload', test: (f) => has(f.payloadKg, 150) },
    ],
    key: 'payload',
    answer: ['fanuc-r2000ic-165f'],
  },
  {
    id: 'selbstbau',
    text: { de: 'Einen Arm zum Selberbauen, offen und für LeRobot gemacht.', en: 'An arm you build yourself, open and made for LeRobot.' },
    criteria: [
      { row: 'kind', test: (f) => !!f.arm },
      { row: 'can', test: (f) => !!f.open && !!f.lerobot },
    ],
    key: 'can',
    answer: ['so101'],
  },
  {
    id: 'forschung',
    text: { de: 'Forschungs-Humanoid mit Drehmomentsensoren, 6 kg pro Arm.', en: 'Research humanoid with torque sensors, 6 kg per arm.' },
    criteria: [
      { row: 'kind', test: (f) => !!f.humanoid },
      { row: 'dof', test: (f) => !!f.torqueAll },
      { row: 'payload', test: (f) => has(f.perArmKg, 6) },
    ],
    key: 'dof',
    answer: ['pal-talos'],
  },
  {
    id: 'humanoid-10',
    text: { de: 'Ein Humanoid soll dauerhaft 10 kg pro Arm halten.', en: 'A humanoid must hold 10 kg per arm continuously.' },
    criteria: [
      { row: 'kind', test: (f) => !!f.humanoid },
      { row: 'payload', test: (f) => has(f.perArmKg, 10) },
    ],
    key: 'payload',
    answer: 'keiner',
    near: [
      { id: 'unitree-h2', row: 'payload' },
      { id: 'unitree-h1-2', row: 'payload' },
      { id: 'pal-talos', row: 'payload' },
      { id: 'apptronik-apollo', row: 'payload' },
    ],
    distractor: { id: 'unitree-h2', row: 'runtime' },
  },
  {
    id: 'kiste-18',
    text: { de: 'Ein Vierbeiner soll eine Dunkelfabrik-Kiste (18 kg) tragen.', en: 'A quadruped must carry one Dark Factory crate (18 kg).' },
    criteria: [
      { row: 'kind', test: (f) => !!f.quadruped },
      { row: 'payload', test: (f) => has(f.payloadKg, 18) },
    ],
    key: 'payload',
    answer: 'keiner',
    trick: true,
    near: [
      { id: 'spot', row: 'payload' },
      { id: 'unitree-go2', row: 'payload' },
      { id: 'anymal-d', row: 'payload' },
    ],
    distractor: { id: 'spot', row: 'speed' },
    distractorAlt: { id: 'unitree-go2', row: 'speed' },
  },
];

/**
 * The pool of this build. Without the amber exhibits (src/core/release.ts) a job whose answer is one of
 * them leaves it (Paletten: MiR250, Kälte: Spot, Cobot: LBR iiwa 14), and a near miss or distractor that
 * names one gives way: the trick job then shows the Go2 and the ANYmal D, with the Go2's speed as the
 * distractor. Removing robots never makes a „Keiner passt“ job fit.
 */
const inHall = (id: RobotId): boolean => ROBOT_BY_ID.has(id);
export const JOBS: readonly Job[] = ALL_JOBS.filter((j) => j.answer === 'keiner' || j.answer.every(inHall)).map((j) => ({
  ...j,
  near: j.near?.filter((n) => inHall(n.id)),
  distractor: j.distractor && !inHall(j.distractor.id) ? j.distractorAlt : j.distractor,
}));

/** Does `r` fit `job`? Every criterion must hold on a stated value. */
export function fits(job: Job, r: HallRobot): boolean {
  return job.criteria.every((c) => c.test(r.facts));
}

/** The row that decides for this robot: the first failed criterion, or the job's key row when it fits. */
export function decidingRow(job: Job, r: HallRobot): RowKey {
  for (const c of job.criteria) if (!c.test(r.facts)) return c.row;
  return job.key;
}
