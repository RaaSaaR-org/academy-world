/**
 * Lern-Dojo · the follower's wrist camera as a small Canvas2D picture (R1 §10.1: the operate camera
 * plus a wrist-camera inset, so you see where the jaws are; it fixes PT-11). Drawn from the simulation
 * state with a pinhole on the gripper: the bench, the start fields, the Kiste's rim and the cubes, the
 * two fingers at the bottom of the frame (the moving one opens and closes). The same picture is the
 * Gehirn-Fenster's wrist tile.
 */
import * as THREE from 'three';
import { CUBE, LAYOUT } from './tuning';
import { jawGap, type Skeleton } from './kin';
import type { CubeColour } from './tuning';

export interface WristScene {
  cubes: { colour: CubeColour; present: boolean; p: THREE.Vector3; q: THREE.Quaternion }[];
  gripper: number;
}

const CAM_OFFSET = new THREE.Matrix4().makeTranslation(0.0, 0.035, -0.012);
const cam = new THREE.PerspectiveCamera(78, 16 / 10, 0.005, 2);
const _v = new THREE.Vector3();
const _corners = [...Array(8)].map(() => new THREE.Vector3());

export function createWristView(w = 192, h = 120): { canvas: HTMLCanvasElement; draw(arm: Skeleton, s: WristScene, tint?: readonly [number, number, number]): void } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
  const toPx = (p: THREE.Vector3): [number, number, boolean] => {
    _v.copy(p).project(cam);
    return [((_v.x + 1) / 2) * w, ((1 - _v.y) / 2) * h, _v.z > -1 && _v.z < 1];
  };
  const poly = (pts: THREE.Vector3[], fill: string | null, stroke: string | null, lw = 1): void => {
    const px = pts.map(toPx);
    if (px.some((p) => !p[2])) return;
    g.beginPath();
    px.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = lw;
      g.stroke();
    }
  };
  const quad = (x: number, y: number, z: number, hx: number, hz: number): THREE.Vector3[] => [new THREE.Vector3(x - hx, y, z - hz), new THREE.Vector3(x + hx, y, z - hz), new THREE.Vector3(x + hx, y, z + hz), new THREE.Vector3(x - hx, y, z + hz)];
  const tintHex = (hex: number, t: readonly [number, number, number], k = 1): string => {
    const r = ((hex >> 16) & 255) * t[0] * k,
      gg = ((hex >> 8) & 255) * t[1] * k,
      b = (hex & 255) * t[2] * k;
    return `rgb(${r | 0},${gg | 0},${b | 0})`;
  };
  return {
    canvas,
    draw(arm, s, tint = [1, 1, 1]) {
      // the camera on the wrist, looking along the fingers (gripper_link −z)
      cam.matrixWorld.multiplyMatrices(arm.matrix('gripper_link'), CAM_OFFSET);
      // gripper_link −z is the view direction: three's camera looks along its own −z already
      cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      g.fillStyle = tintHex(0xd3cdc2, tint, 0.85);
      g.fillRect(0, 0, w, h);
      for (const f of LAYOUT.fields) poly(quad(f.x, 0, f.z, LAYOUT.fieldSize / 2, LAYOUT.fieldSize / 2), null, 'rgba(90,80,70,0.7)', 1);
      const B = LAYOUT.box;
      poly(quad(B.x, 0.0005, B.z, B.w / 2, B.d / 2), tintHex(0x3a3a38, tint), null);
      poly(quad(B.x, B.h, B.z, B.w / 2, B.d / 2), null, tintHex(0x222222, tint), 2);
      // cubes: the projected hull of the eight corners, darker sides first then the top
      const half = CUBE.size / 2;
      const order = s.cubes.filter((c) => c.present && c.p.y > -0.05).sort((a, b) => cam.matrixWorldInverse.elements[14] - a.p.y - (cam.matrixWorldInverse.elements[14] - b.p.y));
      for (const c of order) {
        let k = 0;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) _corners[k++].set(sx * half, sy * half, sz * half).applyQuaternion(c.q).add(c.p);
        const px = _corners.map(toPx);
        if (px.some((p) => !p[2])) continue;
        const hull = convexHull(px.map(([x, y]) => [x, y] as [number, number]));
        g.beginPath();
        hull.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.fillStyle = tintHex(CUBE.colours[c.colour], tint);
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 1;
        g.stroke();
      }
      // the fingers at the bottom: fixed left, the moving one right, its gap to scale
      const gap = jawGap(s.gripper);
      const open = Math.max(0, Math.min(1, (gap - 0.005) / 0.05));
      g.fillStyle = '#141414';
      g.beginPath();
      g.moveTo(w * 0.2, h);
      g.lineTo(w * 0.33, h * 0.62);
      g.lineTo(w * 0.4, h * 0.62);
      g.lineTo(w * 0.34, h);
      g.fill();
      const mx = w * (0.42 + 0.22 * open);
      g.fillStyle = '#ff6700';
      g.beginPath();
      g.moveTo(mx + w * 0.18, h);
      g.lineTo(mx + w * 0.02, h * 0.62);
      g.lineTo(mx + w * 0.09, h * 0.62);
      g.lineTo(mx + w * 0.3, h);
      g.fill();
      // a centre mark: where the jaws meet
      g.strokeStyle = 'rgba(45,212,191,0.9)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(w / 2 - 6, h * 0.45);
      g.lineTo(w / 2 + 6, h * 0.45);
      g.moveTo(w / 2, h * 0.45 - 6);
      g.lineTo(w / 2, h * 0.45 + 6);
      g.stroke();
    },
  };
}

function convexHull(p: [number, number][]): [number, number][] {
  const pts = p.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const q = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}
