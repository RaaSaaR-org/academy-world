/**
 * Station C dataset (ILLUSTRATIV — an anonymised pattern, no customer data): 250 SO-101 episodes of
 * one task („Leg den roten / blauen Würfel in die Kiste.“) from „drei Werkbänken“, generated from a
 * per-session seed. Each episode: its bench, its task word, the start field of the cube that moved,
 * the cube that really moved, a jaw-speed trace and the camera pose of its thumbnail.
 *   - one contiguous dead block of 35 episodes: the arm never moves (a flat trace, the cube stays)
 *   - 12 „Kamera verschoben“: a normal trace, the thumbnail's camera is off
 *   - 18 mislabelled: the task says „rot“, the arm moved the blue cube (language labels are data too)
 * Success model per condition (ILLUSTRATIV parameters): „bekannte Lagen“ and „neue Lagen“; removing
 * each defect adds its share; removing good episodes costs coverage ((kept good share)^0.4, rc4).
 * Pure module (node-testable).
 */
import { STATION_C } from './tuning';

export const N_EP = STATION_C.episodes;
export const COLS = 25;
export const ROWS = 10;
export const DEAD_N = STATION_C.dead;
export const CAM_N = STATION_C.cam;
export const LABEL_N = STATION_C.label;
export const SPARK = 40;
export const MAX_DUR = 12;
/** per condition: raw rate, and what removing each defect group adds (ILLUSTRATIV) */
export const RATE = {
  known: { raw: 0.7, dead: 0.16, cam: 0.03, label: 0.03 },
  novel: { raw: 0.4, dead: 0.09, cam: 0.02, label: 0.03 },
  coverageExp: 0.4,
} as const;
export type Condition = 'known' | 'novel';
export const CONDITIONS: readonly Condition[] = ['known', 'novel'];

export type EpKind = 'ok' | 'dead' | 'cam' | 'label';

export interface Episode {
  i: number;
  kind: EpKind;
  /** which of the three benches recorded it */
  bench: number;
  /** the task's word */
  word: 'rot' | 'blau';
  /** the cube that moved (a mislabelled episode moved the other one) */
  moved: 'rot' | 'blau';
  /** start field of the moved cube (0…4), and of the other cube */
  field: number;
  other: number;
  /** seconds */
  dur: number;
  /** jaw speed samples, m/s */
  v: Float32Array;
  /** thumbnail camera offset (0 for a fixed camera) */
  camDx: number;
  camDy: number;
  camRot: number;
}

export interface Dataset {
  seed: number;
  eps: Episode[];
  deadStart: number;
  count: Record<EpKind, number>;
}

function rngOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeDataset(seed: number): Dataset {
  const r = rngOf(seed);
  const kinds: EpKind[] = new Array(N_EP).fill('ok');
  const deadStart = 12 + Math.floor(r() * (N_EP - DEAD_N - 24));
  for (let i = 0; i < DEAD_N; i++) kinds[deadStart + i] = 'dead';
  const free = (): number => {
    for (;;) {
      const i = Math.floor(r() * N_EP);
      if (kinds[i] === 'ok') return i;
    }
  };
  for (let i = 0; i < CAM_N; i++) kinds[free()] = 'cam';
  for (let i = 0; i < LABEL_N; i++) kinds[free()] = 'label';
  const eps: Episode[] = kinds.map((kind, i) => {
    const v = new Float32Array(SPARK);
    const word: 'rot' | 'blau' = kind === 'label' ? 'rot' : r() < 0.5 ? 'rot' : 'blau';
    const moved: 'rot' | 'blau' = kind === 'label' ? 'blau' : word;
    const field = Math.floor(r() * 5);
    let other = Math.floor(r() * 4);
    if (other >= field) other++;
    const dur = kind === 'dead' ? 6 + r() * 4 : 4.5 + r() * 5;
    const vmax = 0.22 + r() * 0.12;
    for (let k = 0; k < SPARK; k++) {
      const t = k / (SPARK - 1);
      let s: number;
      if (kind === 'dead') s = 0.002 + Math.abs(gaussLike(r)) * 0.0025;
      else {
        // reach, slow down to grasp, carry, slow down to drop, retreat
        const reach = bump(t, 0.16, 0.08);
        const carry = bump(t, 0.55, 0.12);
        const back = bump(t, 0.88, 0.06) * 0.7;
        s = vmax * Math.max(reach, carry, back) + Math.abs(gaussLike(r)) * 0.012;
      }
      v[k] = s;
    }
    const cam = kind === 'cam';
    return {
      i,
      kind,
      bench: Math.floor(i / 84),
      word,
      moved,
      field,
      other,
      dur,
      v,
      camDx: cam ? (r() < 0.5 ? -1 : 1) * (0.25 + r() * 0.15) : (r() - 0.5) * 0.03,
      camDy: cam ? (r() - 0.5) * 0.3 : (r() - 0.5) * 0.03,
      camRot: cam ? (r() < 0.5 ? -1 : 1) * (0.12 + r() * 0.1) : 0,
    };
  });
  return { seed, eps, deadStart, count: { ok: N_EP - DEAD_N - CAM_N - LABEL_N, dead: DEAD_N, cam: CAM_N, label: LABEL_N } };
}

function bump(t: number, c: number, w: number): number {
  return Math.exp(-(((t - c) / w) ** 2));
}

function gaussLike(r: () => number): number {
  return (r() + r() + r() - 1.5) / 0.5;
}

export interface RemovalStats {
  dead: number;
  cam: number;
  label: number;
  ok: number;
}

export function removalStats(ds: Dataset, removed: Uint8Array): RemovalStats {
  const s: RemovalStats = { dead: 0, cam: 0, label: 0, ok: 0 };
  for (const e of ds.eps) if (removed[e.i]) s[e.kind]++;
  return s;
}

/** Success probability per condition of a policy trained on the dataset minus `removed` (ILLUSTRATIV). */
export function successRate(ds: Dataset, removed: Uint8Array, c: Condition): number {
  const s = removalStats(ds, removed);
  const R = RATE[c];
  const base = R.raw + R.dead * (s.dead / ds.count.dead) + R.cam * (s.cam / ds.count.cam) + R.label * (s.label / ds.count.label);
  const kept = (ds.count.ok - s.ok) / ds.count.ok;
  return base * Math.pow(kept, RATE.coverageExp);
}

export function seededRng(seed: number): () => number {
  return rngOf(seed);
}
