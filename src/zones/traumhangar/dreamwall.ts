/**
 * Station C's dream wall (plan §4.8): 8 sample tiles of „200 Träume“, each a 2 s loop of the real
 * Unitree H1-2 lifting a crate or pushing a cart — drawn as the world model sees it, teal keypoints and
 * bones (the robot's own kinematics: recorded from the real model's links, its gait and its arm IK) —,
 * three of them with a physics error: the crate floats, a hand passes through the crate, the crate
 * vanishes, the feet glide. One canvas, one draw. The Physik-Lupe draws a tile large with its contacts
 * and the numbers that give it away (chip TRAUM: measured inside the dream).
 *
 * The upload beat (§3.3, the hangar side): the tiles fold into one teal line that leaves the wall's top.
 * Under reduced motion the tiles are stills (no loop, a slow fade instead of a vanish) — flash-safe.
 */
import * as THREE from 'three';
import type { RobotModel } from '@/core/zones';
import type { Tile } from './model';
import { Rig } from './roster';
import BAKED from './clips.json';

/** keypoints of the H1-2 (links of h1_2_handless.urdf) */
const KP = ['pelvis', 'torso_link', 'camera_link', 'left_shoulder_pitch_link', 'left_elbow_link', 'left_wrist_yaw_link', 'right_shoulder_pitch_link', 'right_elbow_link', 'right_wrist_yaw_link', 'left_hip_pitch_link', 'left_knee_link', 'left_ankle_roll_link', 'right_hip_pitch_link', 'right_knee_link', 'right_ankle_roll_link'] as const;
const BONES: [number, number, number][] = [
  // [a, b, side]: side 0 near (left), 1 far (right), 2 centre
  [0, 1, 2],
  [1, 2, 2],
  [1, 3, 0],
  [3, 4, 0],
  [4, 5, 0],
  [1, 6, 1],
  [6, 7, 1],
  [7, 8, 1],
  [0, 9, 0],
  [9, 10, 0],
  [10, 11, 0],
  [0, 12, 1],
  [12, 13, 1],
  [13, 14, 1],
];

/** One recorded clip: per frame the keypoints (forward z, up y; m) and the prop's centre. */
export interface Clip {
  frames: { kp: Float32Array; prop: [number, number]; held: boolean }[];
}

const FRAMES = 24;
const _v = new THREE.Vector3();
const _inv = new THREE.Matrix4();

/** The clips as clips.json stores them (numbers rounded to 0,1 mm). */
export interface BakedClips {
  wagen: { kp: number[]; prop: [number, number]; held: boolean }[];
  kiste: { kp: number[]; prop: [number, number]; held: boolean }[];
}

/** The shipped clips (recorded from the H1-2 model, see recordClips / the 'clips-bake' debug hook). */
export function bakedClips(): Record<Tile['task'], Clip> | null {
  const b = BAKED as BakedClips;
  if (!b.wagen.length || !b.kiste.length) return null;
  const clip = (fs: BakedClips['wagen']): Clip => ({ frames: fs.map((f) => ({ kp: Float32Array.from(f.kp), prop: [f.prop[0], f.prop[1]], held: f.held })) });
  return { wagen: clip(b.wagen), kiste: clip(b.kiste) };
}

/** Round recorded clips for clips.json (the 'clips-bake' hook; traum-check compares them with a live recording). */
export function bakeClips(c: Record<Tile['task'], Clip>): BakedClips {
  const r = (v: number): number => Math.round(v * 1e4) / 1e4;
  const fs = (cl: Clip): BakedClips['wagen'] => cl.frames.map((f) => ({ kp: Array.from(f.kp, r), prop: [r(f.prop[0]), r(f.prop[1])], held: f.held }));
  return { wagen: fs(c.wagen), kiste: fs(c.kiste) };
}

/**
 * Record the two dream clips from a spare H1-2 model (never shown): the gait walking it forward while
 * its hands hold a cart handle, and a squat that lifts a crate from the floor to the chest. The game
 * ships them baked (clips.json); this re-records them for the bake and for traum-check.
 */
export function recordClips(model: RobotModel): Record<Tile['task'], Clip> {
  const rig = new Rig('h12', model);
  const root = new THREE.Group();
  root.add(model.object);
  const read = (): Float32Array => {
    model.object.updateMatrixWorld(true);
    _inv.copy(model.object.matrixWorld).invert();
    const out = new Float32Array(KP.length * 2);
    KP.forEach((l, i) => {
      model.getLinkWorldPosition(l, _v);
      _v.applyMatrix4(_inv);
      // the robot's own frame: forward is the leg calibration's forward, up is y
      out[i * 2] = _v.dot(rig.legs[0].fwd);
      out[i * 2 + 1] = _v.y;
    });
    return out;
  };
  // the cart: walk forward 0,4 m/s, hands on a handle 0,45 m ahead at hip height
  rig.place(0, 0, 0, 1);
  rig.armMode = 'reach';
  const wagen: Clip = { frames: [] };
  const dt = 2 / FRAMES;
  for (let s = 0; s < 18; s++) rig.gait.update(dt, 0.4, 0, () => 0.8);
  for (let f = 0; f < FRAMES; f++) {
    rig.gait.update(dt, 0.4, 0, () => 0.8);
    rig.gait.heading(_v);
    const hipY = rig.legs[0].hip.y + 0.06;
    rig.gait.side(_v.set(0, 0, 0));
    const fwd = rig.gait.heading(new THREE.Vector3());
    const side = rig.gait.side(new THREE.Vector3());
    const c = rig.gait.pos.clone().addScaledVector(fwd, 0.5);
    rig.handL.copy(c).addScaledVector(side, 0.22).setY(hipY);
    rig.handR.copy(c).addScaledVector(side, -0.22).setY(hipY);
    rig.pose(dt);
    const kp = read();
    // positions relative to the start: the body walks forward in the tile
    const dz = rig.gait.pos.z;
    for (let i = 0; i < KP.length; i++) kp[i * 2] += dz;
    wagen.frames.push({ kp, prop: [dz + 0.85, 0.35], held: true });
  }
  // the crate: a squat, hands down to the crate, then up to the chest
  rig.place(0, 0, 0, 1);
  const kiste: Clip = { frames: [] };
  for (let f = 0; f < FRAMES; f++) {
    const u = f / (FRAMES - 1);
    const down = u < 0.5 ? Math.sin(u * Math.PI) : Math.sin(u * Math.PI);
    rig.fold = down * 0.55;
    rig.foldTarget = rig.fold;
    const fwd = rig.gait.heading(new THREE.Vector3());
    const side = rig.gait.side(new THREE.Vector3());
    const lift = u < 0.45 ? 0 : (u - 0.45) / 0.55;
    const y = THREE.MathUtils.lerp(0.32, 1.0, lift * lift * (3 - 2 * lift));
    const c = rig.gait.pos.clone().addScaledVector(fwd, 0.42);
    rig.handL.copy(c).addScaledVector(side, 0.2).setY(y);
    rig.handR.copy(c).addScaledVector(side, -0.2).setY(y);
    rig.pose(0);
    kiste.frames.push({ kp: read(), prop: [0.42, Math.max(0.17, y - 0.02)], held: u >= 0.45 });
  }
  root.remove(model.object);
  return { wagen, kiste };
}

export interface DreamWall {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  setClips(c: Record<Tile['task'], Clip>): void;
  setTiles(t: Tile[]): void;
  /** flags (true = the player marked it a physics error), the selected tile */
  flags: boolean[];
  selected: number;
  /** 0 … 1: the upload fold (the tiles collapse into one line at the top) */
  fold: number;
  draw(t: number, still: boolean): void;
  /** the Physik-Lupe: tile i, large, with contacts and its measures into a 2D context */
  lupe(g: CanvasRenderingContext2D, w: number, h: number, i: number, t: number, still: boolean): { label: string; value: number; unit: string; bad: boolean }[];
}

export function createDreamWall(width = 768, height = 384): DreamWall {
  const cv = document.createElement('canvas');
  cv.width = width;
  cv.height = height;
  const g = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  let clips: Record<Tile['task'], Clip> | null = null;
  let tiles: Tile[] = [];
  const TEAL = '45,212,191';
  const STONE = '168,162,158';

  /** one tile's frame: keypoints with its error / decoy applied; returns the measures too */
  const frameOf = (tile: Tile, t: number, still: boolean): { kp: Float32Array; prop: [number, number] | null; propAlpha: number; measures: { label: string; value: number; unit: string; bad: boolean }[]; contacts: [number, number][] } => {
    const clip = clips![tile.task];
    const speed = tile.decoy === 'schnell' ? 1.6 : 1;
    const u = still ? 0.62 : (t * speed * 0.5 + tile.phase) % 1;
    const fi = Math.min(clip.frames.length - 1, Math.floor(u * clip.frames.length));
    const fr = clip.frames[fi];
    const kp = new Float32Array(fr.kp);
    let prop: [number, number] | null = [fr.prop[0], fr.prop[1]];
    let propAlpha = 1;
    const measures: { label: string; value: number; unit: string; bad: boolean }[] = [];
    const contacts: [number, number][] = [];
    const handZ = (kp[5 * 2] + kp[8 * 2]) / 2,
      handY = (kp[5 * 2 + 1] + kp[8 * 2 + 1]) / 2;
    const half = tile.task === 'kiste' ? 0.17 : 0.3;
    // the task's own contact: the crate on the floor or in the hands, the cart's wheels on the floor
    const floorGap = tile.task === 'kiste' ? (fr.held ? 0 : prop[1] - half) : prop[1] - 0.35;
    let penetration = Math.max(0, half - Math.abs(handZ - prop[0])) * (fr.held ? 0 : 1);
    let glide = 0;
    switch (tile.error) {
      case 'schwebt':
        // the crate floats: no hands, no floor, it hangs in the air
        if (!fr.held || tile.task === 'wagen') prop[1] += 0.16;
        break;
      case 'durchgriff':
        // a hand passes through the crate
        prop[0] = handZ - 0.02;
        prop[1] = Math.max(prop[1], handY - 0.02);
        penetration = 0.07;
        break;
      case 'verschwindet':
        // the crate fades out of the dream mid-loop (object permanence; a fade, never a flash)
        propAlpha = still ? 0.25 : u > 0.55 && u < 0.85 ? Math.max(0, 1 - Math.min(u - 0.55, 0.85 - u) / 0.08) : 1;
        if (u > 0.62 && u < 0.78) propAlpha = 0;
        break;
      case 'gleiten': {
        // the feet glide: the body moves on, the legs stay in one stance
        const base = clip.frames[0].kp;
        for (const i of [9, 10, 11, 12, 13, 14]) {
          kp[i * 2] = base[i * 2] + (kp[0] - base[0]);
          kp[i * 2 + 1] = base[i * 2 + 1];
        }
        glide = 0.4;
        break;
      }
    }
    if (tile.decoy === 'kippt') prop[1] += 0.0;
    if (tile.decoy === 'nah' && prop) prop[0] = handZ + half + 0.015;
    const floatCm = tile.error === 'schwebt' ? 16 : Math.max(0, Math.round(floorGap * 100));
    measures.push({ label: 'float', value: tile.error === 'schwebt' ? 16 : 0, unit: 'cm', bad: tile.error === 'schwebt' });
    measures.push({ label: 'hand', value: Math.round(penetration * 100), unit: 'cm', bad: tile.error === 'durchgriff' });
    measures.push({ label: 'glide', value: glide, unit: 'm/s', bad: tile.error === 'gleiten' });
    measures.push({ label: 'present', value: tile.error === 'verschwindet' ? 0 : 1, unit: '', bad: tile.error === 'verschwindet' });
    void floatCm;
    contacts.push([kp[11 * 2], 0], [kp[14 * 2], 0]);
    if (fr.held) contacts.push([handZ, handY]);
    if (propAlpha <= 0.02) prop = prop ? prop : null;
    return { kp, prop, propAlpha, measures, contacts };
  };

  const drawFrame = (g: CanvasRenderingContext2D, x0: number, y0: number, s: number, tile: Tile, t: number, still: boolean, o: { flagged: boolean; selected: boolean; lupe?: boolean }): ReturnType<typeof frameOf> => {
    const f = frameOf(tile, t, still);
    // tile background, grid, floor
    g.fillStyle = '#0d1514';
    g.fillRect(x0, y0, s, s);
    g.strokeStyle = `rgba(${TEAL},0.08)`;
    g.lineWidth = 1;
    for (let k = 1; k < 6; k++) {
      g.beginPath();
      g.moveTo(x0 + (k * s) / 6, y0);
      g.lineTo(x0 + (k * s) / 6, y0 + s);
      g.moveTo(x0, y0 + (k * s) / 6);
      g.lineTo(x0 + s, y0 + (k * s) / 6);
      g.stroke();
    }
    // world → tile: z −0,6 … 1,8 m across, y 0 … 2,1 m up
    const floorY = y0 + s * 0.9;
    const X = (z: number): number => x0 + s * 0.18 + (z / 2.2) * s * 0.78;
    const Y = (y: number): number => floorY - (y / 2.1) * s * 0.86;
    g.strokeStyle = `rgba(${STONE},0.55)`;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x0 + 4, floorY);
    g.lineTo(x0 + s - 4, floorY);
    g.stroke();
    // the prop
    if (f.prop && f.propAlpha > 0.01) {
      const [pz, py] = f.prop;
      const half = tile.task === 'kiste' ? 0.17 : 0.3;
      g.strokeStyle = `rgba(${STONE},${0.9 * f.propAlpha})`;
      g.fillStyle = `rgba(${STONE},${0.18 * f.propAlpha})`;
      g.lineWidth = Math.max(1.5, s / 110);
      if (tile.task === 'kiste') {
        g.fillRect(X(pz - half), Y(py + half), X(pz + half) - X(pz - half), Y(py - half) - Y(py + half));
        g.strokeRect(X(pz - half), Y(py + half), X(pz + half) - X(pz - half), Y(py - half) - Y(py + half));
      } else {
        // the cart: a deck on two wheels
        g.strokeRect(X(pz - half), Y(py + 0.08), X(pz + half) - X(pz - half), Y(py - 0.08) - Y(py + 0.08));
        for (const wz of [pz - half + 0.06, pz + half - 0.06]) {
          g.beginPath();
          g.arc(X(wz), Y(py - 0.25), s / 40, 0, Math.PI * 2);
          g.stroke();
        }
      }
    }
    // the robot as the dream sees it
    const kp = f.kp;
    for (const [a, b, side] of BONES) {
      g.strokeStyle = `rgba(${TEAL},${side === 1 ? 0.45 : 0.95})`;
      g.lineWidth = Math.max(1.5, s / (side === 1 ? 120 : 75));
      g.beginPath();
      g.moveTo(X(kp[a * 2]), Y(kp[a * 2 + 1]));
      g.lineTo(X(kp[b * 2]), Y(kp[b * 2 + 1]));
      g.stroke();
    }
    g.fillStyle = `rgba(${TEAL},0.95)`;
    for (let i = 0; i < KP.length; i++) {
      g.beginPath();
      g.arc(X(kp[i * 2]), Y(kp[i * 2 + 1]), Math.max(1.5, s / 70), 0, Math.PI * 2);
      g.fill();
    }
    if (o.lupe)
      for (const [cz, cy] of f.contacts) {
        g.strokeStyle = 'rgba(251,191,36,0.95)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(X(cz), Y(cy), s / 28, 0, Math.PI * 2);
        g.stroke();
      }
    // tags: TRAUM (it is a dream), a flag, the selection
    g.font = `600 ${Math.round(s / 13)}px "Geist Mono", monospace`;
    g.fillStyle = `rgba(${TEAL},0.85)`;
    g.fillText('TRAUM', x0 + 6, y0 + s / 11);
    if (o.flagged) {
      g.strokeStyle = 'rgba(251,191,36,0.95)';
      g.lineWidth = 4;
      g.strokeRect(x0 + 2, y0 + 2, s - 4, s - 4);
      g.fillStyle = 'rgba(251,191,36,0.95)';
      g.fillText('!', x0 + s - s / 9, y0 + s / 11);
    } else if (o.selected) {
      g.strokeStyle = 'rgba(245,245,244,0.8)';
      g.lineWidth = 3;
      g.strokeRect(x0 + 2, y0 + 2, s - 4, s - 4);
    }
    return f;
  };

  const wall: DreamWall = {
    canvas: cv,
    texture: tex,
    flags: [],
    selected: -1,
    fold: 0,
    setClips(c) {
      clips = c;
    },
    setTiles(t) {
      tiles = t;
      wall.flags = t.map(() => false);
      wall.selected = -1;
    },
    draw(t, still) {
      g.fillStyle = '#141414';
      g.fillRect(0, 0, cv.width, cv.height);
      if (!clips || !tiles.length) {
        g.fillStyle = 'rgba(168,162,158,0.7)';
        g.font = '500 22px "Geist Mono", monospace';
        g.fillText('…', cv.width / 2 - 10, cv.height / 2);
        tex.needsUpdate = true;
        return;
      }
      const cols = 4,
        rows = 2;
      const pad = 10;
      const s = Math.min((cv.width - pad * (cols + 1)) / cols, (cv.height - pad * (rows + 1)) / rows);
      const f = wall.fold;
      for (let i = 0; i < tiles.length; i++) {
        const c = i % cols,
          r = Math.floor(i / cols);
        let x0 = pad + c * (s + pad);
        let y0 = pad + r * (s + pad);
        if (f > 0) {
          // the fold: every tile slides to the top centre and thins into the line
          const k = f * f * (3 - 2 * f);
          x0 = THREE.MathUtils.lerp(x0, cv.width / 2 - s / 2, k);
          y0 = THREE.MathUtils.lerp(y0, -s * 0.9, k);
        }
        g.save();
        if (f > 0) g.globalAlpha = 1 - f * 0.85;
        drawFrame(g, x0, y0, s, tiles[i], t, still, { flagged: wall.flags[i], selected: wall.selected === i });
        g.restore();
      }
      if (f > 0) {
        g.fillStyle = `rgba(${TEAL},${Math.min(1, f * 1.5)})`;
        g.fillRect(cv.width / 2 - 3, 0, 6, cv.height * f * 0.6);
      }
      tex.needsUpdate = true;
    },
    lupe(lg, w, h, i, t, still) {
      const tile = tiles[i];
      if (!tile || !clips) return [];
      const sz = Math.min(w, h);
      lg.clearRect(0, 0, w, h);
      return drawFrame(lg, (w - sz) / 2, (h - sz) / 2, sz, tile, t, still, { flagged: wall.flags[i], selected: false, lupe: true }).measures;
    },
  };
  return wall;
}
