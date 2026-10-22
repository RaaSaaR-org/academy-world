/**
 * Grip physics and the 200-grasp batch model for stations B „Das Ei" and C „200 Griffe" (GDD §7.3).
 * Pure maths, no three.js. Units: N, kg, m, s; jaw positions in mm.
 *
 *  Contact:   F_N = k · δ, k = 8 N/mm (compliant pads), δ = object width − jaw opening
 *  Holding:   2 · μ · F_N ≥ m · (g + a)        (two contacts, Coulomb friction)
 *  Cone:      half-angle atan μ; the contact force leaves the cone when F_t / F_N > μ
 */

export const G = 9.81;
export const K_PAD = 8; // N/mm
export const JAW_MAX = 120; // mm
export const GRIPPER_MAX_N = 100;
export const CLOSE_SPEED = 10; // mm/s (B1/B2)
/** pad height (mm): an object that slides further than this relative to the jaws falls out */
export const PAD_HEIGHT = 26;

export type ObjectId = 'ei' | 'stahl' | 'glas' | 'mehl';
export type PadId = 'stahl' | 'gummi' | 'silikon';

export interface GripObject {
  id: ObjectId;
  /** kg */
  m: number;
  /** N; null = does not break under the gripper */
  fBreak: number | null;
  /** width between the jaws (mm) */
  width: number;
  /** height of the object (mm) — for visuals */
  height: number;
}

export const OBJECTS: Record<ObjectId, GripObject> = {
  ei: { id: 'ei', m: 0.06, fBreak: 30, width: 44, height: 57 },
  // 55 × 55 × 84 mm of steel (7.85 g/cm³) = 2.0 kg
  stahl: { id: 'stahl', m: 2, fBreak: null, width: 55, height: 84 },
  glas: { id: 'glas', m: 0.4, fBreak: 80, width: 70, height: 105 },
  mehl: { id: 'mehl', m: 5, fBreak: null, width: 100, height: 260 },
};

/** μ by pad and object — RICHTWERT, rounded (GDD §7.3 table). */
export const MU: Record<PadId, Record<ObjectId, number>> = {
  stahl: { ei: 0.3, stahl: 0.5, glas: 0.1, mehl: 0.4 },
  gummi: { ei: 0.7, stahl: 0.8, glas: 0.25, mehl: 0.7 },
  silikon: { ei: 0.9, stahl: 1.0, glas: 0.35, mehl: 0.8 },
};

/** Minimum normal force (per jaw pair) to hold mass m at upward acceleration a: m(g+a)/(2μ). */
export function requiredForce(m: number, a: number, mu: number): number {
  return (m * (G + a)) / (2 * mu);
}

export function holds(fN: number, m: number, a: number, mu: number): boolean {
  return 2 * mu * fN >= m * (G + a);
}

/** Angle (rad) of the needed contact force from the contact normal: atan(F_t / F_N). Compare with atan μ. */
export function loadAngle(fN: number, m: number, a: number): number {
  return Math.atan2((m * (G + a)) / 2, Math.max(1e-6, fN));
}

/**
 * Force PI loop (1 kHz) for B3 „Kraftregelung": guarded approach at 10 mm/s until contact, then
 * jaw speed v = Kp·e + Ki·∫e (e = F_ref − F), |v| ≤ 20 mm/s. With F = k·δ the closed loop is
 * s² + k·Kp·s + k·Ki = 0 → ω_n = 15 rad/s, ζ = 1 (critically damped, no ringing). The PI zero makes
 * the force overshoot once from contact: e(t) = 5·e^(−15t)·(1 − 15t) → peak ≈ 5,7 N at 0,13 s,
 * within 5 % after ≈ 0,3 s (node check).
 */
export class ForcePI {
  static readonly KP = 30 / K_PAD; // (mm/s)/N   → k·Kp = 30 1/s = 2ζω_n
  static readonly KI = 225 / K_PAD; // (mm/s²)/N → k·Ki = 225 1/s² = ω_n²
  static readonly V_MAX = 20; // mm/s
  integral = 0;
  contact = false;
  ref: number;
  constructor(ref: number) {
    this.ref = ref;
  }
  reset(ref = this.ref): void {
    this.ref = ref;
    this.integral = 0;
    this.contact = false;
  }
  /** closing speed (mm/s) for the measured force F at step dt (s) */
  step(force: number, dt: number): number {
    if (!this.contact) {
      if (force > 0.05) this.contact = true;
      else return CLOSE_SPEED;
    }
    const e = this.ref - force;
    this.integral += e * dt;
    let v = ForcePI.KP * e + ForcePI.KI * this.integral;
    if (v > ForcePI.V_MAX || v < -ForcePI.V_MAX) {
      v = Math.max(-ForcePI.V_MAX, Math.min(ForcePI.V_MAX, v));
      this.integral -= e * dt; // anti-windup: freeze the integrator while saturated
    }
    return v;
  }
}

/**
 * 1-D lift with slip. The jaws accelerate upward at `a` (≥ 0) to v_max, cruise, then brake.
 * The object sticks while the needed friction m(g + a_jaw) ≤ 2μF_N; otherwise it slides
 * (kinetic ≈ static μ): a_obj = 2μF_N/m − g. If it slides more than the pad height it falls out.
 */
export class LiftSim {
  static readonly V_MAX = 0.6; // m/s
  static readonly HEIGHT = 0.14; // m lift height
  static readonly CREEP = 0.06; // m/s for a = 0 (quasi-static)
  jawY = 0;
  jawV = 0;
  objY = 0;
  objV = 0;
  /** relative slide object ↓ vs jaws (m) */
  slide = 0;
  slipping = false;
  /** ever slipped during this lift */
  slipped = false;
  dropped = false;
  done = false;
  /** peak friction demand ratio F_t/(μ F_N) seen (≥ 1 = left the cone) */
  peakDemand = 0;
  private phase: 'accel' | 'cruise' | 'brake' | 'hold' = 'accel';
  readonly a: number;
  readonly m: number;
  readonly mu: number;
  readonly fN: number;
  constructor(a: number, m: number, mu: number, fN: number) {
    this.a = a;
    this.m = m;
    this.mu = mu;
    this.fN = fN;
    if (a <= 0) this.jawV = LiftSim.CREEP;
  }

  /** current jaw acceleration (m/s²) */
  get jawA(): number {
    if (this.a <= 0) return 0;
    if (this.phase === 'accel') return this.a;
    if (this.phase === 'brake') return -this.a;
    return 0;
  }

  step(dt: number): void {
    if (this.done) return;
    // jaw motion profile
    let aj = this.jawA;
    if (this.a > 0) {
      if (this.phase === 'accel' && this.jawV >= LiftSim.V_MAX) this.phase = 'cruise';
      const brakeDist = (this.jawV * this.jawV) / (2 * this.a);
      if ((this.phase === 'accel' || this.phase === 'cruise') && this.jawY + brakeDist >= LiftSim.HEIGHT) this.phase = 'brake';
      aj = this.jawA;
      this.jawV = Math.max(0, this.jawV + aj * dt);
      if (this.phase === 'brake' && this.jawV <= 0) {
        this.jawV = 0;
        this.phase = 'hold';
      }
    } else if (this.jawY >= LiftSim.HEIGHT) {
      this.jawV = 0;
      this.phase = 'hold';
    }
    this.jawY = Math.min(LiftSim.HEIGHT + 0.02, this.jawY + this.jawV * dt);

    if (this.dropped) {
      this.done = this.phase === 'hold';
      return;
    }
    const fMax = 2 * this.mu * this.fN;
    const demand = this.m * (G + aj);
    this.peakDemand = Math.max(this.peakDemand, fMax > 0 ? demand / fMax : Infinity);
    if (!this.slipping) {
      if (demand <= fMax + 1e-9) {
        this.objV = this.jawV;
      } else {
        this.slipping = true;
        this.slipped = true;
      }
    }
    if (this.slipping) {
      const aObj = fMax / this.m - G;
      this.objV += aObj * dt;
      if (this.objV >= this.jawV) {
        // re-stick when the speeds match and static friction suffices again
        if (this.m * (G + aj) <= fMax) {
          this.objV = this.jawV;
          this.slipping = false;
        } else this.objV = this.jawV;
      }
    }
    this.objY += this.objV * dt;
    if (this.objY < 0) {
      // still standing on the bench: the table carries the rest
      this.objY = 0;
      this.objV = Math.max(0, this.objV);
    }
    this.slide = this.jawY - this.objY;
    if (this.slide * 1000 > PAD_HEIGHT) this.dropped = true;
    if (this.phase === 'hold' && !this.slipping) this.done = true;
  }
}

// ── station C: batch model ───────────────────────────────────────────────────

export type Sensing = 'kamera' | 'taktil';
export const WEAR_LEVELS = [0, 250_000, 500_000, 1_000_000] as const;

/**
 * Success probability per trial. Base rates 0.50 (camera only) / 0.85 (camera + tactile) are one
 * study's whole-task rates for an egg task (Huang et al., 3D-ViTac, CoRL 2024, Table 1 „Egg Steaming":
 * open tray, grasp, place, cover; RGB only 0.50 vs. point cloud + tactile 0.85; 20 episodes each —
 * STUDIE chip). Wear ×(1 − 0.3·cycles/1 M), vibration −0.05 and the break/slip split are toy-model
 * parameters (ILLUSTRATIV).
 */
export function successProbability(s: Sensing, cycles: number, vibration: boolean): number {
  const base = s === 'kamera' ? 0.5 : 0.85;
  const p = base * (1 - (0.3 * cycles) / 1_000_000) - (vibration ? 0.05 : 0);
  return Math.max(0, Math.min(1, p));
}

/** share of failures that are breaks (rest: slips) — camera: 60 % Bruch, tactile: 30 % */
export function breakShare(s: Sensing): number {
  return s === 'kamera' ? 0.6 : 0.3;
}

export type TrialOutcome = 'ok' | 'bruch' | 'rutscht';

/** mulberry32 — small seeded PRNG so debug runs are reproducible */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function drawTrial(r: () => number, s: Sensing, cycles: number, vibration: boolean): TrialOutcome {
  if (r() < successProbability(s, cycles, vibration)) return 'ok';
  return r() < breakShare(s) ? 'bruch' : 'rutscht';
}

/** Wilson 95 % score interval → [p, lo, hi] (same formula as the engine kit, Appendix B). */
export function wilson(k: number, n: number, z = 1.96): [number, number, number] {
  if (n <= 0) return [0, 0, 1];
  const p = k / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return [p, Math.max(0, centre - half), Math.min(1, centre + half)];
}
