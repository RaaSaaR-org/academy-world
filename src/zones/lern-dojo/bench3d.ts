/**
 * Lern-Dojo · the workbench as the player sees it (§4.5): a 1.6 × 0.8 m alu bench with a printed mat
 * (five 6 × 6 cm start fields, a 30 cm ruler, the demos' coverage), the Kiste, three 3 cm cubes (one
 * instanced draw), soft contact shadows under the cubes and the jaws (the depth cue a mouse teleop
 * needs), the cursor ring, the overhead camera on its mast (teal ring = data, §2.7 rule 6; it can be
 * knocked) and a bench lamp (it can be dimmed to evening light). Everything in zone-local coordinates;
 * the simulation's bench frame maps to (BENCH.x + x, top + y, BENCH.z + z).
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { css } from '@/core/zones';
import { BENCH, COLOURS, CUBE, LAYOUT, type CubeColour } from './tuning';
import { Batch } from './batch';
import { look } from './look';

export interface CubePose {
  present: boolean;
  p: THREE.Vector3;
  q: THREE.Quaternion;
}

export interface MatState {
  /** demos per start field (coverage glow) */
  fieldDemos: number[];
  /** the start field the next demo uses (−1: none) */
  nextField: number;
  /** spots marked for B's setups */
  marks: { x: number; z: number; label: string }[];
  /** the last policy path (bench x, z) and the last demo path */
  policyPath: Float32Array | null;
  demoPath: Float32Array | null;
}

export interface Bench3D {
  /** bench frame → zone-local */
  toLocal(x: number, y: number, z: number, out?: THREE.Vector3): THREE.Vector3;
  /** zone-local ray → the bench plane at height y (bench frame), or null */
  rayToBench(origin: THREE.Vector3, dir: THREE.Vector3, y: number): { x: number; z: number } | null;
  setCubes(poses: readonly CubePose[]): void;
  /** the jaw centre (bench frame) for its contact shadow; null hides it */
  setJaws(p: THREE.Vector3 | null): void;
  setCursor(p: { x: number; z: number } | null, tone: 'aim' | 'low' | 'blocked'): void;
  drawMat(s: MatState): void;
  /** the overhead camera knocked (offset in m) — the mount shows it */
  setCameraBump(dx: number, dz: number): void;
  /** evening light on the bench (lamp warm and low, the mat darker) */
  setDusk(on: boolean): void;
  /** world objects for the interactables */
  readonly cameraMount: THREE.Object3D;
  readonly lamp: THREE.Object3D;
  readonly console: THREE.Object3D;
  /** the valve part of the lift-off beat (hidden until then) */
  readonly valve: THREE.Object3D;
  readonly top: number;
  update(dt: number, t: number): void;
}

const HALF = CUBE.size / 2;
/** the tray beside the follower where cubes wait while they are not on the bench */
export const TRAY = { x: -0.24, z: 0.28 } as const;

export function createBench3D(ctx: ZoneContext, floorY: number): Bench3D {
  const LK = look(ctx);
  const det = ctx.groups.detail;
  const top = floorY + BENCH.height;
  const bx = BENCH.x,
    bz = BENCH.z;
  const L = (x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 => out.set(bx + x, top + y, bz + z);

  // ── the bench: alu frame, a hull worktop, a lower shelf (one batch, few draws) ──────────────
  const b = new Batch();
  const W = BENCH.w,
    D = BENCH.d;
  const legH = BENCH.height - 0.045;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) b.box(LK.alu, 0.045, legH, 0.045, bx + sx * (W / 2 - 0.06), floorY + legH / 2, bz + sz * (D / 2 - 0.06));
  b.box(LK.alu, W - 0.08, 0.04, 0.04, bx, floorY + 0.16, bz + D / 2 - 0.06);
  b.box(LK.alu, W - 0.08, 0.04, 0.04, bx, floorY + 0.16, bz - D / 2 + 0.06);
  b.box(LK.hull, W - 0.16, 0.02, D - 0.16, bx, floorY + 0.19, bz);
  b.box(LK.alu, W, 0.03, D, bx, top - 0.03, bz);
  // the Kiste: floor and four walls (dark printed PLA)
  const B = LAYOUT.box;
  const kh = B.h,
    kw = B.wall;
  b.box(LK.carbon, B.w, kw, B.d, bx + B.x, top + kw / 2, bz + B.z);
  b.box(LK.carbon, B.w, kh, kw, bx + B.x, top + kh / 2, bz + B.z - B.d / 2 + kw / 2);
  b.box(LK.carbon, B.w, kh, kw, bx + B.x, top + kh / 2, bz + B.z + B.d / 2 - kw / 2);
  b.box(LK.carbon, kw, kh, B.d - 2 * kw, bx + B.x - B.w / 2 + kw / 2, top + kh / 2, bz + B.z);
  b.box(LK.carbon, kw, kh, B.d - 2 * kw, bx + B.x + B.w / 2 - kw / 2, top + kh / 2, bz + B.z);
  // the cube tray (front left)
  b.box(LK.alu, 0.14, 0.012, 0.05, bx + TRAY.x, top + 0.006, bz + TRAY.z);
  // the overhead camera's mast at the back edge (the camera body is its own group: it can be knocked)
  const mastX = bx + 0.42,
    mastZ = bz - 0.33;
  b.cyl(LK.alu, 0.012, 0.014, 0.64, 12, mastX, top + 0.32, mastZ);
  b.box(LK.alu, 0.4, 0.02, 0.02, mastX - 0.19, top + 0.63, mastZ + 0.04, -0.6);
  b.box(LK.carbon, 0.06, 0.02, 0.06, mastX, top + 0.01, mastZ);
  // the bench lamp (back left): foot, two arms, the shade is its own mesh (it changes colour)
  const lampX = bx - 0.68,
    lampZ = bz - 0.3;
  b.cyl(LK.carbon, 0.045, 0.05, 0.02, 16, lampX, top + 0.01, lampZ);
  b.box(LK.alu, 0.012, 0.32, 0.012, lampX, top + 0.17, lampZ, 0, 0.25);
  b.box(LK.alu, 0.012, 0.012, 0.26, lampX + 0.04, top + 0.33, lampZ + 0.11, 0, 0.35);
  // the console strip at the front edge (the interactable): a carbon plate with a teal key
  b.box(LK.carbon, 0.36, 0.012, 0.09, bx + 0.42, top + 0.006, bz + 0.33);
  b.build(det, { castShadow: (m) => m === LK.alu || m === LK.carbon, name: 'bench' });
  ctx.physics.addStaticBox({ size: [W, BENCH.height, D], position: [bx, floorY + BENCH.height / 2, bz] });

  // the lamp shade and its light
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0xe7e5e4, emissive: 0xfff3e0, emissiveIntensity: 0.6, roughness: 0.5 });
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.07, 20, 1, true), shadeMat);
  shade.position.set(lampX + 0.08, top + 0.4, lampZ + 0.21);
  shade.rotation.set(0.9, 0, 0);
  det.add(shade);
  const lampLight = ctx.lights.point([lampX + 0.12, top + 0.32, lampZ + 0.3], { color: 0xfff1df, intensity: 0, distance: 1.6 });
  const lamp = new THREE.Group();
  lamp.position.set(lampX + 0.04, top + 0.25, lampZ + 0.1);
  det.add(lamp);

  // the overhead camera body (black, teal lens ring) over the work field
  const camGroup = new THREE.Group();
  camGroup.position.set(mastX - 0.36, top + 0.6, mastZ + 0.16);
  det.add(camGroup);
  {
    const cb = new Batch();
    cb.box(LK.carbon, 0.045, 0.03, 0.045, 0, 0, 0);
    cb.add(LK.light(0x2dd4bf, 1), new THREE.TorusGeometry(0.011, 0.002, 6, 20).rotateX(Math.PI / 2), 0, -0.016, 0);
    cb.build(camGroup, { castShadow: false, name: 'camera' });
  }
  const camRest = camGroup.position.clone();
  let camBump = new THREE.Vector2(),
    camWobble = 0;

  // the console key (interactable target)
  const consoleKey = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.014, 20), ctx.materials.accentTeal);
  consoleKey.position.set(bx + 0.52, top + 0.019, bz + 0.33);
  det.add(consoleKey);
  const consoleGroup = new THREE.Group();
  consoleGroup.position.set(bx + 0.42, top + 0.05, bz + 0.33);
  det.add(consoleGroup);

  // ── the mat (canvas): fields, ruler, labels, coverage, paths ───────────────────────────────
  const CW = 1024,
    CH = 512,
    PPM = CW / W;
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const g = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const matMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.86, metalness: 0 });
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.01, D - 0.01), matMat);
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(bx, top + 0.0005, bz);
  mat.receiveShadow = true;
  det.add(mat);
  const cu = (x: number): number => (x + W / 2) * PPM;
  const cv = (z: number): number => (z + D / 2) * PPM;
  const drawMat = (s: MatState): void => {
    g.fillStyle = '#d3cdc2';
    g.fillRect(0, 0, CW, CH);
    // a faint 5 cm grid
    g.fillStyle = 'rgba(80,72,64,0.08)';
    for (let x = 0; x <= W + 1e-6; x += 0.05) g.fillRect(Math.round(cu(x - W / 2)), 0, 1, CH);
    for (let z = 0; z <= D + 1e-6; z += 0.05) g.fillRect(0, Math.round(cv(z - D / 2)), CW, 1);
    // start fields with their numbers and coverage
    LAYOUT.fields.forEach((f, i) => {
      const h = (LAYOUT.fieldSize / 2) * PPM;
      const n = s.fieldDemos[i] ?? 0;
      if (n > 0) {
        g.fillStyle = `rgba(45,212,191,${Math.min(0.42, 0.14 + 0.07 * n).toFixed(2)})`;
        g.fillRect(cu(f.x) - h, cv(f.z) - h, 2 * h, 2 * h);
      }
      g.strokeStyle = i === s.nextField ? css.orange : '#7a7065';
      g.lineWidth = i === s.nextField ? 3 : 2;
      g.strokeRect(cu(f.x) - h, cv(f.z) - h, 2 * h, 2 * h);
      g.font = '600 18px "Geist Mono", monospace';
      g.fillStyle = '#5c544b';
      g.fillText(String(i + 1), cu(f.x) - h + 3, cv(f.z) + h + 18);
    });
    // B's marks (a spot no demo started from)
    for (const m of s.marks) {
      g.strokeStyle = '#7a7065';
      g.setLineDash([5, 4]);
      g.lineWidth = 2;
      const h = (LAYOUT.fieldSize / 2) * PPM;
      g.strokeRect(cu(m.x) - h, cv(m.z) - h, 2 * h, 2 * h);
      g.setLineDash([]);
      g.font = '600 14px "Geist Mono", monospace';
      g.fillStyle = '#5c544b';
      g.fillText(m.label, cu(m.x) - h, cv(m.z) - h - 6);
    }
    // the Kiste's footprint label, the arms' feet
    g.font = '600 16px "Geist Mono", monospace';
    g.fillStyle = '#5c544b';
    g.fillText('KISTE', cu(LAYOUT.box.x) - 24, cv(LAYOUT.box.z + LAYOUT.box.d / 2) + 20);
    g.fillText('SO-101', cu(LAYOUT.follower.x) - 30, cv(LAYOUT.follower.z) + 58);
    g.fillText('LEADER', cu(LAYOUT.leader.x) - 30, cv(LAYOUT.leader.z) + 58);
    // the 30 cm ruler along the front edge
    {
      const x0 = cu(LAYOUT.ruler.x),
        y0 = cv(LAYOUT.ruler.z);
      g.fillStyle = '#efe9dd';
      g.fillRect(x0 - 6, y0 - 18, 0.3 * PPM + 12, 30);
      g.fillStyle = '#3d3833';
      for (let c = 0; c <= 30; c++) {
        const x = x0 + c * 0.01 * PPM;
        const hgt = c % 10 === 0 ? 16 : c % 5 === 0 ? 11 : 7;
        g.fillRect(Math.round(x), y0 - 18, 1, hgt);
        if (c % 10 === 0) {
          g.font = '500 12px "Geist Mono", monospace';
          g.fillText(String(c), x + 2, y0 + 8);
        }
      }
    }
    // the last demo (teal) and the last policy run (orange) as paths on the mat
    const path = (p: Float32Array | null, colour: string, w: number): void => {
      if (!p || p.length < 4) return;
      g.strokeStyle = colour;
      g.lineWidth = w;
      g.lineJoin = 'round';
      g.beginPath();
      for (let i = 0; i < p.length; i += 2) {
        const x = cu(p[i]),
          y = cv(p[i + 1]);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    };
    path(s.demoPath, 'rgba(45,212,191,0.75)', 3);
    path(s.policyPath, 'rgba(255,103,0,0.8)', 3);
    tex.needsUpdate = true;
  };

  // ── cubes (one instanced draw) ─────────────────────────────────────────────────────────────
  const cubeGeo = new THREE.BoxGeometry(CUBE.size, CUBE.size, CUBE.size);
  const cubeMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 });
  const cubes = new THREE.InstancedMesh(cubeGeo, cubeMat, COLOURS.length);
  cubes.castShadow = true;
  cubes.receiveShadow = true;
  cubes.name = 'cubes';
  // three instances that move: no bounding-sphere bookkeeping, never culled
  cubes.frustumCulled = false;
  const col = new THREE.Color();
  COLOURS.forEach((c: CubeColour, i) => cubes.setColorAt(i, col.set(CUBE.colours[c])));
  det.add(cubes);
  const _m = new THREE.Matrix4();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);

  // ── contact shadows (cubes + jaws, one instanced draw) ─────────────────────────────────────
  const sc = document.createElement('canvas');
  sc.width = sc.height = 64;
  {
    const sg = sc.getContext('2d')!;
    const gr = sg.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = gr;
    sg.fillRect(0, 0, 64, 64);
  }
  const shadowTex = new THREE.CanvasTexture(sc);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, color: 0x000000 });
  shadowMat.color.set(0xffffff);
  const shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shadowMat, COLOURS.length + 1);
  shadows.renderOrder = 2;
  shadows.frustumCulled = false;
  shadows.name = 'contact-shadows';
  det.add(shadows);
  const _ms = new THREE.Matrix4();
  const _q0 = new THREE.Quaternion();
  const _ps = new THREE.Vector3();
  const _ss = new THREE.Vector3();
  const setShadow = (i: number, x: number, z: number, h: number, size: number, show: boolean): void => {
    const k = show ? Math.max(0.25, 1 - h / 0.25) : 0;
    const w = size * (1 + h * 2.5);
    _ms.compose(L(x, 0.0012, z, _ps), _q0, _ss.set(w * k, 1, w * k));
    shadows.setMatrixAt(i, _ms);
  };

  // ── the cursor ring ────────────────────────────────────────────────────────────────────────
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2dd4bf).multiplyScalar(1.3), transparent: true, opacity: 0.9, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.019, 0.024, 32).rotateX(-Math.PI / 2), ringMat);
  ring.visible = false;
  ring.renderOrder = 3;
  det.add(ring);

  // ── the valve (lift-off beat: the SO-101 hands you the M4 part) ───────────────────────────
  const valve = new THREE.Group();
  {
    const vb = new Batch();
    vb.cyl(LK.alu, 0.012, 0.012, 0.03, 16, 0, 0.015, 0);
    vb.cyl(ctx.materials.standard({ color: 0xff6700, roughness: 0.5, metalness: 0 }), 0.016, 0.016, 0.006, 16, 0, 0.03, 0);
    vb.build(valve, { castShadow: true, name: 'valve' });
  }
  valve.visible = false;
  det.add(valve);

  ctx.onDispose(() => {
    tex.dispose();
    matMat.dispose();
    mat.geometry.dispose();
    cubeGeo.dispose();
    cubeMat.dispose();
    shadowTex.dispose();
    shadowMat.dispose();
    shadows.geometry.dispose();
    ringMat.dispose();
    ring.geometry.dispose();
    shadeMat.dispose();
    shade.geometry.dispose();
    consoleKey.geometry.dispose();
  });

  let dusk = false;
  let jaws: THREE.Vector3 | null = null;
  const trayAt = (i: number): [number, number] => [TRAY.x - 0.04 + i * 0.04, TRAY.z];

  return {
    top,
    cameraMount: camGroup,
    lamp,
    console: consoleGroup,
    valve,
    toLocal: (x, y, z, out) => L(x, y, z, out),
    rayToBench(o, d, y) {
      if (Math.abs(d.y) < 1e-5) return null;
      const t = (top + y - o.y) / d.y;
      if (t < 0) return null;
      return { x: o.x + d.x * t - bx, z: o.z + d.z * t - bz };
    },
    setCubes(poses) {
      for (let i = 0; i < COLOURS.length; i++) {
        const c = poses[i];
        if (c.present && c.p.y > -0.2) {
          _m.compose(L(c.p.x, c.p.y, c.p.z, _p), c.q, _s.set(1, 1, 1));
          setShadow(i, c.p.x, c.p.z, Math.max(0, c.p.y - HALF), CUBE.size * 1.7, true);
        } else {
          const [tx, tz] = trayAt(i);
          _m.compose(L(tx, 0.012 + HALF, tz, _p), _q0, _s.set(1, 1, 1));
          setShadow(i, tx, tz, 0, CUBE.size * 1.6, true);
        }
        cubes.setMatrixAt(i, _m);
      }
      cubes.instanceMatrix.needsUpdate = true;
      if (jaws) setShadow(COLOURS.length, jaws.x, jaws.z, Math.max(0, jaws.y - 0.01), 0.05, true);
      else setShadow(COLOURS.length, 0, 0, 0, 0, false);
      shadows.instanceMatrix.needsUpdate = true;
    },
    setJaws(p) {
      jaws = p ? (jaws ?? new THREE.Vector3()).copy(p) : null;
    },
    setCursor(p, tone) {
      ring.visible = !!p;
      if (!p) return;
      L(p.x, 0.002, p.z, ring.position);
      ringMat.color.set(tone === 'low' ? 0xff8534 : tone === 'blocked' ? 0xf87171 : 0x2dd4bf).multiplyScalar(1.3);
    },
    drawMat,
    setCameraBump(dx, dz) {
      camBump.set(dx, dz);
      camWobble = ctx.settings.reducedMotion ? 0 : 1;
    },
    setDusk(on) {
      dusk = on;
      lampLight.setIntensity(on ? 1.4 : 0);
      lampLight.setColor(on ? 0xffa45c : 0xfff1df);
      shadeMat.emissive.set(on ? 0xff9d4d : 0xfff3e0);
      shadeMat.emissiveIntensity = on ? 1.1 : 0.6;
      matMat.color.set(on ? 0xc9a98a : 0xffffff);
    },
    update(dt) {
      // the knocked camera settles where it was knocked to (a short wobble unless reduced motion)
      if (camWobble > 0) camWobble = Math.max(0, camWobble - dt * 1.6);
      const w = camWobble * Math.sin(camWobble * 40) * 0.006;
      camGroup.position.set(camRest.x + camBump.x + w, camRest.y, camRest.z + camBump.y);
      camGroup.rotation.z = camBump.x * 2 + w * 3;
      void dusk;
    },
  };
}
