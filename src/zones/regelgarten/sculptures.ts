/**
 * Garden sculptures — more "things that only stay upright because they are corrected":
 *  • Würfel auf der Spitze: a cube balancing on one corner with three reaction wheels (orange = it rotates).
 *    Two decoupled inverted-pendulum axes, PD on tilt, wheel speed integrates the control torque.
 *  • Kugel auf Platte: a ball on a tilting plate following a figure-8 (rolling sphere a = 5/7·g·sin α, PD on the plate).
 * Both can be nudged (E). Cheap: a few µs per frame, ~7 draw calls total.
 * Plus the floor medallion of the control loop on the entry path.
 */
import * as THREE from 'three';
import { css, type ZoneContext } from '@/core/zones';
import { Merger } from './world';
import type { Shared } from './shared';

export const SCULPT = {
  cube: [14.2, 0, 9.6] as [number, number, number],
  plate: [-10.6, 0, -5.4] as [number, number, number],
  mural: [0, 8.6] as [number, number],
};

export interface Sculptures {
  update(dt: number, t: number): void;
}

export function buildSculptures(S: Shared): Sculptures {
  const ctx: ZoneContext = S.ctx;
  const M = ctx.materials;
  const det = ctx.groups.detail;
  const geos: THREE.BufferGeometry[] = [];
  const texs: THREE.Texture[] = [];
  const mats: THREE.Material[] = [];
  ctx.onDispose(() => {
    geos.forEach((g) => g.dispose());
    texs.forEach((t) => t.dispose());
    mats.forEach((m) => m.dispose());
  });
  const G = <T extends THREE.BufferGeometry>(g: T): T => (geos.push(g), g);
  const T = ctx.i18n.text;

  // ── static bases (merged) ─────────────────────────────────────────────────
  const mg = new Merger();
  const [cx, , cz] = SCULPT.cube;
  const LK = S.look;
  mg.add(LK.carbon, new THREE.CylinderGeometry(0.62, 0.64, 0.1, 24), [cx, 0.05, cz]);
  mg.add(LK.hull, new THREE.CylinderGeometry(0.52, 0.68, 0.6, 24), [cx, 0.4, cz]);
  mg.add(LK.alu, new THREE.CylinderGeometry(0.2, 0.32, 0.12, 20), [cx, 0.76, cz]);
  ctx.physics.addStaticCylinder({ radius: 0.7, height: 0.8, position: [cx, 0.4, cz] });
  const [px, , pz] = SCULPT.plate;
  mg.add(LK.carbon, new THREE.CylinderGeometry(0.5, 0.52, 0.1, 24), [px, 0.05, pz]);
  mg.add(LK.hull, new THREE.CylinderGeometry(0.4, 0.55, 0.7, 24), [px, 0.45, pz]);
  mg.add(LK.alu, new THREE.CylinderGeometry(0.06, 0.08, 0.5, 12), [px, 1.05, pz]);
  ctx.physics.addStaticCylinder({ radius: 0.85, height: 1.3, position: [px, 0.65, pz] });
  mg.build(det, { name: 'regelgarten:sculpt', shadow: () => true });

  // ── cube on its corner ────────────────────────────────────────────────────
  const CUBE = 0.72;
  const cubeRoot = new THREE.Group(); // pivot at the balancing corner
  cubeRoot.position.set(cx, 0.82, cz);
  det.add(cubeRoot);
  const tiltG = new THREE.Group();
  cubeRoot.add(tiltG);
  // orient so the body diagonal is vertical: corner (−,−,−) at the pivot
  const diag = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(0, 1, 0));
  const cubeG = new THREE.Group();
  cubeG.quaternion.copy(diag);
  tiltG.add(cubeG);
  const cubeMesh = new THREE.Mesh(G(new THREE.BoxGeometry(CUBE, CUBE, CUBE).translate(CUBE / 2, CUBE / 2, CUBE / 2)), M.shell);
  cubeMesh.castShadow = true;
  cubeG.add(cubeMesh);
  // three reaction wheels on the three faces that meet at the top corner (x = CUBE, y = CUBE, z = CUBE faces)
  const wheelGeo = G(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 24));
  const rimGeo = G(new THREE.TorusGeometry(0.22, 0.022, 8, 32));
  const wheels = new THREE.InstancedMesh(wheelGeo, LK.carbon, 3);
  const rims = new THREE.InstancedMesh(rimGeo, M.orangePaint, 3);
  for (const m of [wheels, rims]) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cubeG.add(wheels, rims);
  const faceAxes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const faceBase = faceAxes.map((a) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), a));
  const faceRimBase = faceAxes.map((a) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), a));
  const facePos = faceAxes.map((a) => new THREE.Vector3(CUBE / 2, CUBE / 2, CUBE / 2).addScaledVector(a, CUBE / 2 + 0.025));
  const wheelAng = [0, 0, 0];
  // two tilt axes (local x and z), each an inverted pendulum: φ̈ = ω0² φ − u + d
  const cube = { ax: 0.01, vx: 0, az: -0.008, vz: 0, nudgeX: 0, nudgeZ: 0, acc: 0 };
  const W0 = 3.2; // √(g/l_eff) of a 0.72 m cube on its corner (toy value)
  const KP = 3.6 * W0 * W0,
    KD = 2.2 * W0;
  const noise = (): number => (Math.random() - 0.5) * 0.6;

  // ── ball on a plate ───────────────────────────────────────────────────────
  const PL = 1.3;
  const plateG = new THREE.Group();
  plateG.position.set(px, 1.32, pz);
  det.add(plateG);
  const plate = new THREE.Mesh(G(new THREE.BoxGeometry(PL, 0.05, PL)), LK.carbon);
  plate.castShadow = true;
  plate.receiveShadow = true;
  plateG.add(plate);
  const rimMesh = new THREE.Mesh(G(new THREE.TorusGeometry(PL * 0.38, 0.008, 4, 64).rotateX(Math.PI / 2)), LK.light('teal', 1));
  rimMesh.position.y = 0.03;
  plateG.add(rimMesh);
  const ball = new THREE.Mesh(G(new THREE.SphereGeometry(0.075, 20, 14)), M.steel);
  ball.castShadow = true;
  plateG.add(ball);
  const ghost = new THREE.Mesh(G(new THREE.CircleGeometry(0.05, 20).rotateX(-Math.PI / 2)), LK.light('teal', 1));
  ghost.position.y = 0.027;
  plateG.add(ghost);
  const pistonGeo = G(new THREE.CylinderGeometry(0.03, 0.03, 1, 8));
  const pistons = new THREE.InstancedMesh(pistonGeo, M.steel, 2);
  pistons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  det.add(pistons);
  const pb = { x: 0.2, z: 0, vx: 0, vz: 0, ax: 0, az: 0, acc: 0 };

  // ── floor medallion: the control loop ─────────────────────────────────────
  const MC = document.createElement('canvas');
  MC.width = MC.height = 512;
  const mg2 = MC.getContext('2d')!;
  const drawMural = (): void => {
    const g = mg2;
    g.clearRect(0, 0, 512, 512);
    g.fillStyle = '#2a2622';
    g.beginPath();
    g.arc(256, 256, 250, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#4a4540';
    g.lineWidth = 4;
    g.stroke();
    // three arrow arcs (clockwise as seen from above)
    g.strokeStyle = css.teal;
    g.lineWidth = 9;
    g.lineCap = 'round';
    const R = 168;
    for (let k = 0; k < 3; k++) {
      const a0 = -Math.PI / 2 + (k * 2 * Math.PI) / 3 + 0.42,
        a1 = a0 + (2 * Math.PI) / 3 - 0.84;
      g.beginPath();
      g.arc(256, 256, R, a0, a1);
      g.stroke();
      const ax = 256 + Math.cos(a1) * R,
        ay = 256 + Math.sin(a1) * R;
      const tx = -Math.sin(a1),
        ty = Math.cos(a1);
      g.fillStyle = css.teal;
      g.beginPath();
      g.moveTo(ax + tx * 22, ay + ty * 22);
      g.lineTo(ax + Math.cos(a1) * 16 - tx * 4, ay + Math.sin(a1) * 16 - ty * 4);
      g.lineTo(ax - Math.cos(a1) * 16 - tx * 4, ay - Math.sin(a1) * 16 - ty * 4);
      g.closePath();
      g.fill();
    }
    const words = ctx.i18n.lang === 'de' ? ['MESSEN', 'VERGLEICHEN', 'KORRIGIEREN'] : ['MEASURE', 'COMPARE', 'CORRECT'];
    g.font = '700 30px "Space Grotesk", sans-serif';
    g.fillStyle = '#F5F5F4';
    g.textAlign = 'center';
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
      g.fillText(words[k], 256 + Math.cos(a) * 168, 256 + Math.sin(a) * 168 + 11);
    }
    g.font = '500 44px "Geist Mono", monospace';
    g.fillStyle = css.orange;
    g.fillText('1000×/s', 256, 262);
    g.font = '500 18px "Geist Mono", monospace';
    g.fillStyle = '#A8A29E';
    g.fillText(ctx.i18n.lang === 'de' ? '// REGELKREIS' : '// FEEDBACK LOOP', 256, 296);
    g.textAlign = 'left';
    mtex.needsUpdate = true;
  };
  const mtex = new THREE.CanvasTexture(MC);
  mtex.colorSpace = THREE.SRGBColorSpace;
  mtex.anisotropy = 8;
  texs.push(mtex);
  const mmat = new THREE.MeshStandardMaterial({ map: mtex, transparent: true, roughness: 0.8, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -14 });
  mats.push(mmat);
  const mural = new THREE.Mesh(G(new THREE.PlaneGeometry(4.6, 4.6).rotateX(-Math.PI / 2)), mmat);
  mural.position.set(SCULPT.mural[0], 0.045, SCULPT.mural[1]);
  mural.receiveShadow = true;
  ctx.groups.exterior.add(mural);
  drawMural();
  ctx.i18n.onChange(drawMural);

  // ── interactions + labels ─────────────────────────────────────────────────
  const nudgeCube = (): void => {
    cube.vx += (Math.random() < 0.5 ? -1 : 1) * 0.9;
    cube.vz += (Math.random() - 0.5) * 0.8;
    ctx.audio.play('thud', { at: [cx, 1.2, cz], pitch: 1.8, volume: 0.6 });
  };
  const nudgeBall = (): void => {
    pb.vx += (Math.random() - 0.5) * 1.4;
    pb.vz += (Math.random() - 0.5) * 1.4;
    ctx.audio.play('click', { at: [px, 1.4, pz], pitch: 0.7 });
  };
  ctx.addInteractable({ object: cubeMesh, label: T('sculpt.cubeAct'), hint: T('sculpt.cubeHint'), onInteract: nudgeCube, range: 2.6 });
  ctx.addInteractable({ object: plate, label: T('sculpt.plateAct'), hint: T('sculpt.plateHint'), onInteract: nudgeBall, range: 2.4 });
  ctx.hud.worldLabel([cx, 2.3, cz], T('sculpt.cube'), { eyebrow: T('sculpt.cubeEyebrow'), maxDistance: 9, kind: 'muted' });
  ctx.hud.worldLabel([px, 2.0, pz], T('sculpt.plate'), { eyebrow: T('sculpt.plateEyebrow'), maxDistance: 9, kind: 'muted' });
  let whir: { setVolume(v: number, r?: number): void; setPitch(p: number): void } | null = null;

  // scratch
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const mtx = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  const pPos = new THREE.Vector3();
  const pScale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const eul = new THREE.Euler();

  const update = (dt: number, t: number): void => {
    const h = Math.min(dt, 0.05);
    // cube: fixed 2 ms steps
    cube.acc += h;
    let uAbs = 0;
    while (cube.acc >= 0.002) {
      cube.acc -= 0.002;
      const ux = KP * cube.ax + KD * cube.vx;
      const uz = KP * cube.az + KD * cube.vz;
      cube.vx += (W0 * W0 * cube.ax - ux + noise()) * 0.002;
      cube.vz += (W0 * W0 * cube.az - uz + noise()) * 0.002;
      cube.ax += cube.vx * 0.002;
      cube.az += cube.vz * 0.002;
      wheelAng[0] += ux * 0.002 * 0.4;
      wheelAng[2] += uz * 0.002 * 0.4;
      wheelAng[1] += (ux - uz) * 0.002 * 0.2;
      uAbs = Math.abs(ux) + Math.abs(uz);
    }
    tiltG.rotation.set(cube.az, 0, -cube.ax);
    for (let k = 0; k < 3; k++) {
      q.copy(faceBase[k]).multiply(q2.setFromAxisAngle(up, wheelAng[k] * 6 + t * 0.6));
      mtx.compose(facePos[k], q, one);
      wheels.setMatrixAt(k, mtx);
      q.copy(faceRimBase[k]);
      mtx.compose(facePos[k], q, one);
      rims.setMatrixAt(k, mtx);
    }
    wheels.instanceMatrix.needsUpdate = true;
    rims.instanceMatrix.needsUpdate = true;
    if (S.playerNear(40)) {
      if (!whir && ctx.audio.context) whir = ctx.audio.loop('servo', { at: cubeRoot, volume: 0 });
      whir?.setVolume(Math.min(0.35, uAbs * 0.03), 0.1);
      whir?.setPitch(0.9 + Math.min(1, uAbs * 0.05));
    }

    // ball on plate: target traces a slow figure-8; PD sets the plate tilt
    pb.acc += h;
    const tx = 0.34 * Math.sin(t * 0.55),
      tz = 0.22 * Math.sin(t * 1.1);
    while (pb.acc >= 0.004) {
      pb.acc -= 0.004;
      const kp = 2.4,
        kd = 2.0;
      const tAx = Math.max(-0.22, Math.min(0.22, kp * (tx - pb.x) - kd * pb.vx)) / 9.81;
      const tAz = Math.max(-0.22, Math.min(0.22, kp * (tz - pb.z) - kd * pb.vz)) / 9.81;
      pb.ax += (tAx - pb.ax) * 0.08; // actuator lag
      pb.az += (tAz - pb.az) * 0.08;
      pb.vx += (5 / 7) * 9.81 * Math.sin(pb.ax) * 0.004;
      pb.vz += (5 / 7) * 9.81 * Math.sin(pb.az) * 0.004;
      pb.x += pb.vx * 0.004;
      pb.z += pb.vz * 0.004;
      const lim = PL / 2 - 0.08;
      if (Math.abs(pb.x) > lim) {
        pb.x = Math.sign(pb.x) * lim;
        pb.vx *= -0.3;
      }
      if (Math.abs(pb.z) > lim) {
        pb.z = Math.sign(pb.z) * lim;
        pb.vz *= -0.3;
      }
    }
    plateG.rotation.set(pb.az, 0, -pb.ax, 'XYZ');
    ball.position.set(pb.x, 0.025 + 0.075, pb.z);
    ball.rotation.set(pb.z / 0.075, 0, -pb.x / 0.075);
    ghost.position.set(tx, 0.027, tz);
    // pistons from the base to two plate corners
    for (let k = 0; k < 2; k++) {
      const lx = k === 0 ? PL * 0.38 : 0,
        lz = k === 0 ? 0 : PL * 0.38;
      eul.set(pb.az, 0, -pb.ax, 'XYZ');
      pPos.set(lx, -0.03, lz).applyEuler(eul);
      const topY = 1.32 + pPos.y;
      const len = topY - 0.8;
      pScale.set(1, len, 1);
      mtx.compose(pPos.set(px + pPos.x, 0.8 + len / 2, pz + pPos.z), q.identity(), pScale);
      pistons.setMatrixAt(k, mtx);
    }
    pistons.instanceMatrix.needsUpdate = true;
  };
  update(0, 0);
  return { update };
}
