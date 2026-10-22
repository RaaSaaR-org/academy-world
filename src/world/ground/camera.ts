/**
 * The lift-off's outside shots (plan WP3 build 8, §5.3 rule 5, R5 §5.2), as pure functions of (h, t). The
 * shots are expressed in the ground frame (C1) or the slab-top frame (C2) and returned in the island
 * frame (the island never moves: a ground point at y sits at y − h).
 *
 *  - C1 (t ≈ 24–32 s, h 1 → 25): drone R-3 hovers beside the dock WSW of the island, the sun behind it, so
 *    the island lifts out of its dock lit, against the cloud shade in the ESE; it drifts slowly sideways.
 *  - C2 (t ≈ 72–80 s): ≤ 160 m south, 30 m over the cloud top: the island climbs out of the cloud sea
 *    (keel last), the camera pulls back a little.
 */
import type { Vec3Tuple } from '../layout';
import { REVIER, polar } from '../layout';

export function outsideCamera(shot: 'C1' | 'C2', h: number, t: number): { position: Vec3Tuple; lookAt: Vec3Tuple } {
  if (shot === 'C1') {
    const k = Math.max(0, Math.min(1, (t - 24) / 8));
    const [x, , z] = polar(246 + 5 * k, 186 - 6 * k);
    const yG = 15 + 3 * k;
    return { position: [x, yG - h, z], lookAt: [0, -6 + Math.min(h, 25) * 0.25, 0] };
  }
  const k = Math.max(0, Math.min(1, (t - 72) / 8));
  const top = REVIER.slab.top;
  return { position: [-18 + 10 * k, top + 30 - h + 6 * k, 148 + 10 * k], lookAt: [0, -14, 0] };
}
