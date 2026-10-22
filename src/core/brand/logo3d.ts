import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The EmAI mark as real geometry: Recamán-sequence spiral of 17 tangent semicircles
 * on one vertical axis (radii 15·k, k = 1…17, in SVG units of an 800 box), inside a
 * full ring of radius 375 on a disc of radius 400 (#141414).
 *
 * Rules (logo-manual.md): never rotate (it must end exactly at the top point), never
 * recolour, no glow/bloom/outline, no morphing. Fade/scale/opacity only.
 */
export const RECAMAN = [0, 1, 3, 6, 2, 7, 13, 20, 12, 21, 11, 22, 10, 23, 9, 24, 8, 25] as const;

export interface RecamanArc {
  k: number;
  /** centre y in SVG-mark units (disc radius 400, +y up) */
  cy: number;
  r: number;
  /** +1 bulges to +x (odd k), −1 to −x (even k) */
  side: 1 | -1;
}

export function recamanArcs(): RecamanArc[] {
  const arcs: RecamanArc[] = [];
  for (let k = 1; k <= 17; k++) {
    const y0 = -375 + 30 * RECAMAN[k - 1];
    const y1 = -375 + 30 * RECAMAN[k];
    arcs.push({ k, cy: (y0 + y1) / 2, r: 15 * k, side: k % 2 === 1 ? 1 : -1 });
  }
  return arcs;
}

/**
 * One step of the sequence with the decision behind it (OEIS A005132): try a(n−1) − n; it is
 * rejected when negative or already visited, then a(n−1) + n is taken. The founder's logo film
 * shows exactly this as PERCEIVE → DECIDE → ACT; the tower's drawing arm replays it.
 */
export interface RecamanStep {
  n: number;
  prev: number;
  /** the backward candidate a(n−1) − n */
  back: number;
  fwd: number;
  next: number;
  /** why the backward candidate was rejected (null = it was taken) */
  reason: 'negative' | 'visited' | null;
  side: 1 | -1;
}

export function recamanSteps(steps = 17): RecamanStep[] {
  const seen = new Set<number>([0]);
  const out: RecamanStep[] = [];
  let prev = 0;
  for (let n = 1; n <= steps; n++) {
    const back = prev - n,
      fwd = prev + n;
    const reason = back < 0 ? 'negative' : seen.has(back) ? 'visited' : null;
    const next = reason ? fwd : back;
    out.push({ n, prev, back, fwd, next, reason, side: n % 2 === 1 ? 1 : -1 });
    seen.add(next);
    prev = next;
  }
  return out;
}

// self-check: the rule reproduces the mark's sequence (never ship a mark that drifted from the logo)
{
  const s = recamanSteps();
  for (let i = 0; i < s.length; i++) if (s[i].next !== RECAMAN[i + 1]) console.error(`[logo3d] Recamán mismatch at n=${i + 1}: ${s[i].next} ≠ ${RECAMAN[i + 1]}`);
}

export interface LogoMarkOptions {
  /** Outer disc radius in metres (default 1). The ring is 0.9375 of this. */
  radius?: number;
  /** Stroke width in SVG units of the 800 box (8 = canonical mark, lockups use up to 16). */
  stroke?: number;
  /** Add the #141414 backing disc (required unless the surface behind is already dark). */
  disc?: boolean;
  /** Depth of the backing disc in metres (0 = flat circle). */
  discDepth?: number;
  spiralMaterial: THREE.Material;
  discMaterial?: THREE.Material;
  segments?: number;
  /**
   * Readable from both sides (free-standing sculpture): a disc of `discDepth` centred on
   * z = 0 with the spiral on its +Z face and a correctly oriented copy on the −Z face
   * (rotated 180° about Y — never mirrored).
   */
  doubleSided?: boolean;
}

/**
 * Builds the mark in the XY plane facing +Z, centred at the origin, +Y up.
 * Spiral + ring are ONE merged mesh (one draw call).
 */
export function createLogoMark(opts: LogoMarkOptions): THREE.Group {
  const R = opts.radius ?? 1;
  const s = R / 400; // metres per SVG unit
  const tube = ((opts.stroke ?? 8) / 2) * s;
  const seg = opts.segments ?? 48;
  const parts: THREE.BufferGeometry[] = [];

  for (const a of recamanArcs()) {
    // TorusGeometry arc runs from angle 0 (+x) CCW to `arc`. Rotate so the half circle
    // spans from bottom (−π/2) to top (+π/2) on the bulge side.
    const g = new THREE.TorusGeometry(a.r * s, tube, 8, Math.max(8, Math.round(seg * (a.r / 255) + 6)), Math.PI);
    g.rotateZ(a.side === 1 ? -Math.PI / 2 : Math.PI / 2);
    g.translate(0, a.cy * s, 0);
    parts.push(g);
  }
  const ring = new THREE.TorusGeometry(375 * s, tube, 8, 160);
  parts.push(ring);
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();

  const group = new THREE.Group();
  group.name = 'emai-logo-mark';
  const spiral = new THREE.Mesh(merged, opts.spiralMaterial);
  spiral.name = 'emai-logo-spiral';
  group.add(spiral);

  if (opts.doubleSided) {
    const depth = Math.max(opts.discDepth ?? 0, R * 0.02);
    spiral.position.z = depth / 2 + tube;
    const back = new THREE.Mesh(merged, opts.spiralMaterial);
    back.name = 'emai-logo-spiral-back';
    back.rotation.y = Math.PI;
    back.position.z = -(depth / 2 + tube);
    group.add(back);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, depth, 96).rotateX(Math.PI / 2), opts.discMaterial ?? new THREE.MeshBasicMaterial({ color: 0x141414 }));
    disc.name = 'emai-logo-disc';
    group.add(disc);
    return group;
  }

  if (opts.disc !== false) {
    const depth = opts.discDepth ?? 0;
    const discGeo = depth > 0 ? new THREE.CylinderGeometry(R, R, depth, 96).rotateX(Math.PI / 2).translate(0, 0, -depth / 2 - tube) : new THREE.CircleGeometry(R, 96).translate(0, 0, -tube * 1.05);
    const disc = new THREE.Mesh(discGeo, opts.discMaterial ?? new THREE.MeshBasicMaterial({ color: 0x141414 }));
    disc.name = 'emai-logo-disc';
    group.add(disc);
  }
  return group;
}

/** SVG path data of the mark (for DOM/HUD use), in a 800×800 viewBox. */
export const LOGO_SVG_PATH =
  'm 400,775 a 15,15 0 0 0 0,-30 30,30 0 0 1 0,-60 45,45 0 0 0 0,-90 60,60 0 0 0 0,120 75,75 0 0 0 0,-150 90,90 0 0 1 0,-180 105,105 0 0 0 0,-210 120,120 0 0 0 0,240 135,135 0 0 0 0,-270 150,150 0 0 0 0,300 165,165 0 0 0 0,-330 180,180 0 0 0 0,360 195,195 0 0 0 0,-390 210,210 0 0 0 0,420 225,225 0 0 0 0,-450 240,240 0 0 0 0,480 255,255 0 0 0 0,-510 m 0,750 a 375,375 0 0 0 0,-750 375,375 0 0 0 0,750';

export function logoSvg(opts: { disc?: boolean; size?: number; stroke?: number } = {}): string {
  const size = opts.size ?? 64;
  const disc = opts.disc !== false ? '<circle cx="400" cy="400" r="400" fill="#141414"/>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="${size}" height="${size}" role="img" aria-label="EmAI">${disc}<path d="${LOGO_SVG_PATH}" fill="none" stroke="#FF6700" stroke-width="${opts.stroke ?? 8}"/></svg>`;
}
