/**
 * The Schauhalle viewer (WP-D2, plan §3.4) — a lazy chunk, loaded by viewer/install.ts on the first
 * modes.enter('viewer').
 *
 * The studio: a cyclorama dome (r 14 m), a floor disc, a turntable with the robot, and a measuring wall
 * behind it — 0–2.5 m with 10 cm ticks (canvas, as the hall's Größenwand) — with the „Du“ 1.75 m and EMI
 * 1.55 m figures left and right and a line at the height measured on the model (MODELL). The wall and
 * the figures turn with the camera (yaw only), so they stay beside the robot from every side; the
 * turntable spins (still under reduced motion and while you drag).
 *
 * The world stays where it is, unseen: while the viewer is open the camera draws only the studio's
 * render layer, and every light also lights that layer, so the light set — and with it every program —
 * is the one the world warmed (0 links on open). The studio stands at the observer's feet, which are
 * pinned there: the areas, their level of detail, the robot queue and the sun's shadow box keep their
 * place, and the sun's shadows fall in the studio. Robots load through the robot queue at the most
 * detailed level ('now'); the viewer keeps at most `tier.viewerFiles` parsed files of its own.
 *
 * Controls: one finger orbits 360° (camera pitch −5…60° above), pinch 0.6–3 × the fit distance,
 * double tap resets; „Neben dir“ / „Nah“; the category tabs and the robot strip; ‹ › and ←/→ step
 * through the robots; the back button in the top bar returns to the tour.
 */
import './viewer.css';
import * as THREE from 'three';
import type { RobotModel, ZoneRobots } from '@/core/zones/types.robots';
import type { CameraRig, DiscoverHandle, RobotId, SheetSnap } from '../types';
import { defaultFov } from '../camera';
import { chipEl } from '../ui/card';
import { SIDE_MQ } from '../ui/sheet';
import { el, icon } from '../ui/el';
import { robotCard } from './cards';
import { CATEGORIES, HALL, TEXT } from './data';
import { V } from './strings';
import type { GenRobot, HallCategory } from './types';

/** the studio's render layer: while the viewer is open the camera sees only this layer */
export const STUDIO_LAYER = 9;

const D2R = Math.PI / 180;
const DOME_R = 14;
/** turntable (deg/s), and how long it rests after you let go (ms) */
const SPIN = 12;
const REST_MS = 3000;
/** camera pitch (rig convention: − looks down): 60° above the robot to 5° below */
const PITCH: readonly [number, number] = [-60, 5];
const PITCH0 = -8;
/** pinch: × the fit distance */
const PINCH: readonly [number, number] = [0.6, 3];
const DU_H = 1.75;
const EMI_H = 1.55;
/** the wall: 0–2.5 m scale plus a margin */
const WALL_H = 2.6;
const PX_PER_M = 256;
/** the figures' half widths (m) */
const FIG_R = 0.3;

const INK = { board: '#ece9e4', major: '#57534e', minor: '#a8a29e', num: '#44403c', orange: '#ff6700', teal: '#2dd4bf' };

export interface ViewerState {
  open: boolean;
  robot: RobotId | null;
  /** the robot is loaded and shown */
  shown: boolean;
  /** parsed files this viewer keeps (most recent first) */
  files: RobotId[];
  framing: 'you' | 'near';
  tab: HallCategory;
  layer: number;
  cameraMask: number;
  spinning: boolean;
  /** robots in this build's viewer */
  ids: RobotId[];
}

export interface Viewer {
  enter(id: RobotId | null): Promise<void>;
  exit(): void;
  state(): ViewerState;
}

export function createViewer(h: DiscoverHandle): Viewer {
  return new Studio(h);
}

const _v = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _box = new THREE.Box3();

/** a wall tile: 2 m wide, 0–2.6 m, ticks every 10 cm, numbers every 50 cm, the „Du“ and EMI lines */
function drawTile(g: CanvasRenderingContext2D, w: number, hpx: number, lang: 'de' | 'en'): void {
  g.fillStyle = INK.board;
  g.fillRect(0, 0, w, hpx);
  const yOf = (m: number): number => hpx - m * PX_PER_M;
  for (let k = 0; k <= 25; k++) {
    const y = yOf(k / 10);
    const major = k % 5 === 0;
    g.fillStyle = major ? INK.major : INK.minor;
    g.fillRect(0, Math.round(y) - (major ? 1 : 0), w, major ? 2 : 1);
    if (major && k > 0) {
      g.font = '500 22px "Geist Mono", ui-monospace, monospace';
      g.fillStyle = INK.num;
      g.textBaseline = 'bottom';
      g.fillText(`${(k / 10).toFixed(1).replace('.', lang === 'de' ? ',' : '.')} m`, 10, y - 4);
    }
  }
  for (const [m, c] of [
    [DU_H, INK.orange],
    [EMI_H, INK.teal],
  ] as const) {
    g.fillStyle = c;
    g.globalAlpha = 0.6;
    g.fillRect(0, yOf(m) - 1, w, 3);
    g.globalAlpha = 1;
  }
}

/** a sphere cap seen from inside: winding and normals turned inward (FrontSide, so the world's programs) */
function insideOut(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = geo.getIndex()!;
  for (let i = 0; i < idx.count; i += 3) {
    const b = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, b);
  }
  const n = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return geo;
}

class Studio implements Viewer {
  private readonly api: ZoneRobots;
  private built = false;
  private open = false;
  private readonly root = new THREE.Group();
  private readonly table = new THREE.Group();
  private readonly refs = new THREE.Group();
  private disc!: THREE.Mesh;
  private wall!: THREE.Mesh;
  private wallTex!: THREE.CanvasTexture;
  private wallCanvas!: HTMLCanvasElement;
  private du!: THREE.Mesh;
  private emi!: THREE.Mesh;
  private line!: THREE.Mesh;
  private model: RobotModel | null = null;
  private current: GenRobot | null = null;
  private shown = false;
  private files: RobotId[] = [];
  private seq = 0;
  private framing: 'you' | 'near' = 'you';
  private tab: HallCategory = 'gehen';
  /** footprint radius, figure offset, wall width, wall depth, robot height (m) */
  private geom = { fp: 0.3, a: 0.75, wallW: 2.5, wallZ: -0.65, h: 1 };
  /** the labels' sizes (px), measured when their text changes */
  private labSize = new Map<HTMLElement, [number, number]>();
  private spinDeg = 0;
  private lastT = 0;
  private restUntil = 0;
  private dragging = false;
  private savedRig: CameraRig | null = null;
  private savedMask = 1;
  /** the lens shift (NDC) that centres the robot in the free part of the screen */
  private readonly shift = new THREE.Vector2();
  private ownUpdate: (() => void) | null | undefined = undefined;
  private offs: (() => void)[] = [];
  private relayoutTimer = 0;
  // DOM
  private readonly layer: HTMLElement;
  private readonly backBtn: HTMLButtonElement;
  private readonly frameBox: HTMLElement;
  private readonly frameBtns: Record<'you' | 'near', HTMLButtonElement>;
  private readonly pick: HTMLElement;
  private readonly lineEl: HTMLElement;
  private readonly tabsEl: HTMLElement;
  private readonly tabBtns: Record<HallCategory, HTMLButtonElement>;
  private readonly strip: HTMLElement;
  private readonly labs: { du: HTMLElement; emi: HTMLElement; robot: HTMLElement };
  private readonly byId = new Map(HALL.map((r) => [r.id, r]));

  constructor(private h: DiscoverHandle) {
    // Discover's own context ('discover') is no ZoneManager record, so the queue never lets its first
    // fetch of a robot run (ext/robots.ts reachable()); the island module's 'world' area always may.
    // The models stay the viewer's: untracked at once, disposed on the next robot and on exit.
    this.api = h.game.robots.forArea('world') ?? h.ctx.robots;
    const t = h.text;
    this.backBtn = el('button', { type: 'button', class: 'dsv-back', onclick: () => void h.modes.enter('tour', {}) }, icon('prev'));
    this.frameBtns = {
      you: el('button', { type: 'button', 'data-framing': 'you', onclick: () => this.setFraming('you') }),
      near: el('button', { type: 'button', 'data-framing': 'near', onclick: () => this.setFraming('near') }),
    };
    this.frameBox = el('div', { class: 'dsv-frame', role: 'group' }, this.frameBtns.you, this.frameBtns.near);
    const stripId = 'dsv-strip';
    this.tabBtns = Object.fromEntries(
      CATEGORIES.map((c) => [c, el('button', { type: 'button', role: 'tab', class: 'dsv-tab', 'aria-controls': stripId, 'data-cat': c, onclick: () => this.setTab(c, true) })]),
    ) as Record<HallCategory, HTMLButtonElement>;
    this.tabsEl = el('div', { class: 'dsv-tabs', role: 'tablist' }, CATEGORIES.map((c) => this.tabBtns[c]));
    this.tabsEl.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.stopPropagation();
      const k = (CATEGORIES.indexOf(this.tab) + (e.key === 'ArrowRight' ? 1 : CATEGORIES.length - 1)) % CATEGORIES.length;
      this.setTab(CATEGORIES[k], true);
      this.tabBtns[CATEGORIES[k]].focus();
    });
    this.strip = el('div', { class: 'dsv-strip', id: stripId, role: 'tabpanel' });
    this.lineEl = el('p', { class: 'dsv-line' });
    this.pick = el('div', { class: 'dsv-pick' }, this.lineEl, this.tabsEl, this.strip);
    this.labs = {
      du: el('div', { class: 'dsv-lab du' }),
      emi: el('div', { class: 'dsv-lab emi' }),
      robot: el('div', { class: 'dsv-lab robot' }),
    };
    const labels = el('div', { class: 'dsv-labels', 'aria-hidden': 'true' }, this.labs.du, this.labs.emi, this.labs.robot);
    this.layer = el('div', { class: 'dsv', 'data-snap': 'peek' }, labels, this.frameBox, this.pick);
    t.onChange(() => this.texts());
    this.texts();
  }

  state(): ViewerState {
    return {
      open: this.open,
      robot: this.current?.id ?? null,
      shown: this.shown,
      files: [...this.files],
      framing: this.framing,
      tab: this.tab,
      layer: STUDIO_LAYER,
      cameraMask: this.h.game.camera.layers.mask,
      spinning: this.spinning(),
      ids: HALL.map((r) => r.id),
    };
  }

  // ── enter / exit ──

  async enter(id: RobotId | null): Promise<void> {
    const r = (id && this.byId.get(id)) || this.current || HALL[0];
    if (!this.open) this.openStudio(r);
    await this.show(r);
  }

  exit(): void {
    if (!this.open) return;
    const h = this.h;
    this.open = false;
    this.seq++;
    for (const off of this.offs.splice(0)) off();
    window.clearTimeout(this.relayoutTimer);
    this.layer.remove();
    this.backBtn.remove();
    this.lens(false);
    h.game.camera.layers.mask = this.savedMask;
    this.root.removeFromParent();
    this.model?.dispose();
    this.model = null;
    this.shown = false;
    h.sheet.hide();
    h.sheet.setNav(null);
    if (this.savedRig) h.camera.setRig(this.savedRig);
    this.savedRig = null;
  }

  private openStudio(r: GenRobot): void {
    const h = this.h;
    if (!this.built) this.build();
    this.open = true;
    this.savedRig = h.camera.rig;
    // the studio stands where the observer is; the observer stays there (areas, LOD, shadow box)
    const f = h.observer.feet;
    h.observer.pin(f);
    this.root.position.set(f[0], f[1], f[2]);
    this.root.updateMatrixWorld(true);
    h.ctx.root.add(this.root);
    // every light lights the studio's layer too (the same light set: no new programs); the camera sees only the studio
    h.game.rs.scene.traverse((o) => {
      if ((o as THREE.Light).isLight) o.layers.enable(STUDIO_LAYER);
    });
    const cam = h.game.camera;
    this.savedMask = cam.layers.mask;
    cam.layers.set(STUDIO_LAYER);
    // the layer: under the sheet (an open sheet covers it), the back button first in the top bar
    h.ui.root.insertBefore(this.layer, h.sheet.el);
    h.topbar.el.insertBefore(this.backBtn, h.topbar.el.firstChild);
    h.topbar.setStep(0, 0, TEXT.hall);
    this.tab = r.cat;
    this.renderStrip();
    this.layout(r, null);
    this.lens(true);
    h.camera.setRig(this.rig(PITCH0, 0));
    this.lastT = performance.now();

    const canvas = h.game.rs.canvas;
    const down = (): void => void (this.dragging = true);
    const up = (): void => {
      this.dragging = false;
      this.restUntil = performance.now() + REST_MS;
    };
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    const resize = (): void => {
      window.clearTimeout(this.relayoutTimer);
      this.relayoutTimer = window.setTimeout(() => this.reframe(), 150);
    };
    window.addEventListener('resize', resize);
    this.offs.push(
      () => canvas.removeEventListener('pointerdown', down),
      () => window.removeEventListener('pointerup', up),
      () => window.removeEventListener('pointercancel', up),
      () => window.removeEventListener('resize', resize),
      h.gestures.onNav((dir) => this.step(dir)),
      h.sheet.onSnap((s) => this.onSnap(s)),
    );
  }

  // ── the robot ──

  private async show(r: GenRobot): Promise<void> {
    const h = this.h;
    const my = ++this.seq;
    const first = !this.current || this.current.id !== r.id || !this.shown;
    this.current = r;
    if (this.tab !== r.cat) {
      this.tab = r.cat;
      this.renderStrip();
    } else this.syncStrip();
    const side = this.side();
    const snap: SheetSnap = h.sheet.snap === 'hidden' || !h.sheet.card?.id?.startsWith('robot:') ? (side ? 'half' : 'peek') : (h.sheet.snap as SheetSnap);
    h.sheet.show(robotCard(r, TEXT), snap);
    const i = HALL.indexOf(r);
    h.sheet.setNav({ prev: i > 0, next: i < HALL.length - 1 });
    h.ui.announce(r.name);
    if (!first && this.model?.id === r.id) return;
    this.labs.robot.hidden = true;
    let model: RobotModel | null = null;
    h.ui.busy(true);
    try {
      model = await this.api.load(r.id, { lod: 0, priority: 'now', castShadow: true, receiveShadow: true });
      this.api.untrack(model);
      model.lod = 0;
      model.object.traverse((o) => o.layers.set(STUDIO_LAYER));
      model.object.updateMatrixWorld(true);
      // the programs before the first frame that draws it (the robots' paint is warmed at boot: no links)
      await h.warm(model.object);
    } catch (err) {
      console.warn(`[discover] viewer: ${r.id} failed to load`, err);
    } finally {
      h.ui.busy(false);
    }
    if (!model) return;
    if (my !== this.seq || !this.open || this.current !== r) {
      model.dispose();
      this.remember(r.id);
      return;
    }
    _box.setFromObject(model.object);
    this.model?.dispose();
    this.model = model;
    this.table.add(model.object);
    this.remember(r.id);
    this.shown = true;
    this.layout(r, _box);
    this.reframe();
  }

  /** the viewer's own parsed files: most recent first, at most tier.viewerFiles (the hall's own stay theirs) */
  private remember(id: RobotId): void {
    this.files = [id, ...this.files.filter((x) => x !== id)];
    while (this.files.length > Math.max(1, this.h.tier.viewerFiles)) {
      const old = this.files.pop()!;
      this.api.release?.(old);
    }
  }

  private step(dir: -1 | 1): void {
    if (!this.current) return;
    const next = HALL[HALL.indexOf(this.current) + dir];
    if (next) void this.show(next);
  }

  // ── layout and framing ──

  /** table, figures, wall and the height line around a robot (box: its measured bounds, else the data) */
  private layout(r: GenRobot, box: THREE.Box3 | null): void {
    const g = this.geom;
    if (box && !box.isEmpty()) {
      g.fp = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z));
      g.h = Math.max(box.max.y, 0.05);
    } else {
      g.fp = Math.min(r.bounds.r, Math.max(0.2, r.heightM * 0.3));
      g.h = r.heightM;
    }
    g.fp = THREE.MathUtils.clamp(g.fp, 0.12, 2.4);
    // the figures just beside the turntable; the wall reaches past them by the width of its numbers
    g.a = Math.max(g.fp, 0.18) + FIG_R + 0.12;
    this.setWall(2 * (g.a + FIG_R + 0.4));
    g.wallZ = -(g.fp + 0.3);
    const tr = THREE.MathUtils.clamp(g.fp + 0.12, 0.3, 2.6);
    this.disc.scale.set(tr, 1, tr);
    this.disc.updateMatrix();
    this.wall.position.set(0, 0, g.wallZ);
    this.wall.updateMatrix();
    this.du.position.set(-g.a, 0, 0);
    this.du.updateMatrix();
    this.emi.position.set(g.a, 0, 0);
    this.emi.updateMatrix();
    this.line.position.set(0, g.h, g.wallZ + 0.012);
    this.line.visible = !!box;
    this.line.updateMatrix();
    this.robotLabel(r);
  }

  /** the free part of the canvas (CSS px): under the top bar and the framing toggle, above the picker, left of a side sheet */
  private band(): { x0: number; y0: number; x1: number; y1: number; W: number; H: number } {
    const h = this.h;
    const cv = h.game.rs.canvas.getBoundingClientRect();
    const W = cv.width || window.innerWidth,
      H = cv.height || window.innerHeight;
    const rel = (e: Element): DOMRect => {
      const b = e.getBoundingClientRect();
      return new DOMRect(b.left - cv.left, b.top - cv.top, b.width, b.height);
    };
    const M = 10;
    let y0 = Math.max(rel(h.topbar.el).bottom, rel(this.frameBox).bottom) + M;
    // the figures' name plates hang below their feet
    let y1 = rel(this.pick).top - M - 30;
    let x1 = W - M;
    if (this.side()) x1 = Math.min(x1, rel(h.sheet.el).left - M);
    else y1 = Math.min(y1, H - M);
    if (y1 - y0 < H * 0.25) {
      y0 = Math.min(y0, H * 0.1);
      y1 = Math.max(y1, H * 0.6);
    }
    return { x0: M, y0, x1: Math.max(x1, W * 0.4), y1, W, H };
  }

  /** the orbit around the robot for the framing, at these angles */
  private rig(pitchDeg: number, yawDeg: number): CameraRig {
    const g = this.geom;
    const b = this.band();
    const aspect = b.W / b.H;
    const fov = defaultFov(aspect);
    const t = Math.tan((fov * D2R) / 2);
    const tv = (t * (b.y1 - b.y0)) / b.H;
    const th = (t * (b.x1 - b.x0)) / b.H;
    let d: number, cy: number;
    if (this.framing === 'you') {
      // the figures at the robot's depth, the wall (0–2.6 m) behind it
      const back = -g.wallZ;
      cy = WALL_H / 2;
      const reach = g.a + FIG_R + 0.4;
      d = Math.max(reach / th, (WALL_H / 2 + 0.05) / tv - back, (cy + 0.1) / tv) * 1.04;
      // the wall stands further back: wide enough there to show its numbers beside the figures
      this.setWall((2 * reach * (d + back)) / d);
    } else {
      cy = g.h / 2;
      d = Math.max((Math.max(g.fp, 0.1) + 0.04) / th, (g.h / 2 + 0.04) / tv) * 1.06 + g.fp * 0.5;
    }
    const p = this.root.position;
    const max = Math.max(d * 1.05, Math.min(d * PINCH[1], DOME_R - 1.5));
    return {
      kind: 'orbit',
      target: [p.x, p.y + cy, p.z],
      distance: d,
      yawDeg,
      pitchDeg: THREE.MathUtils.clamp(pitchDeg, PITCH[0], PITCH[1]),
      fovDeg: fov,
      limits: { pitchDeg: PITCH, distance: [d * PINCH[0], max] },
    };
  }

  /** the camera's yaw and pitch now (rig convention) */
  private angles(): { yaw: number; pitch: number } {
    const c = this.h.game.camera;
    _e.setFromQuaternion(c.quaternion, 'YXZ');
    return { yaw: _e.y / D2R, pitch: _e.x / D2R };
  }

  /** frame the robot again (a new robot, a resize), keeping the angles; the lens follows the free band */
  private reframe(): void {
    if (!this.open) return;
    const a = this.angles();
    this.updateShift();
    this.h.camera.setRig(this.rig(a.pitch, a.yaw));
  }

  private setFraming(f: 'you' | 'near'): void {
    if (f === this.framing) return;
    this.framing = f;
    this.texts();
    if (!this.open) return;
    const a = this.angles();
    void this.h.camera.flyTo(this.rig(a.pitch, a.yaw), { seconds: 0.6 });
  }

  private side(): boolean {
    try {
      return window.matchMedia(SIDE_MQ).matches;
    } catch {
      return false;
    }
  }

  private onSnap(s: SheetSnap | 'hidden'): void {
    this.layer.dataset.snap = s;
  }

  /**
   * The lens shift: game.camera's projection is moved in NDC so the orbit target sits in the middle of the
   * free band (no distortion, any orbit angle). Only while the viewer is open; exit() gives the camera
   * its own updateProjectionMatrix back.
   */
  private lens(on: boolean): void {
    const cam = this.h.game.camera;
    if (on && this.ownUpdate === undefined) {
      this.ownUpdate = Object.prototype.hasOwnProperty.call(cam, 'updateProjectionMatrix') ? cam.updateProjectionMatrix : null;
      const base = cam.updateProjectionMatrix;
      const s = this.shift;
      cam.updateProjectionMatrix = function (this: THREE.PerspectiveCamera): void {
        base.call(this);
        const e = this.projectionMatrix.elements;
        // row 0 += sx · row 3, row 1 += sy · row 3 (column-major)
        for (let c = 0; c < 16; c += 4) {
          e[c] += s.x * e[c + 3];
          e[c + 1] += s.y * e[c + 3];
        }
        this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
      };
      this.updateShift();
    } else if (!on && this.ownUpdate !== undefined) {
      if (this.ownUpdate) cam.updateProjectionMatrix = this.ownUpdate;
      else delete (cam as { updateProjectionMatrix?: unknown }).updateProjectionMatrix;
      this.ownUpdate = undefined;
      this.shift.set(0, 0);
      cam.updateProjectionMatrix();
    }
  }

  private updateShift(): void {
    const b = this.band();
    this.shift.set(((b.x0 + b.x1) / 2 / b.W) * 2 - 1, 1 - ((b.y0 + b.y1) / 2 / b.H) * 2);
    this.h.game.camera.updateProjectionMatrix();
  }

  // ── per frame (the floor's onBeforeRender: synced with the frames the game draws) ──

  private spinning(): boolean {
    return this.open && !this.h.settings.reducedMotion && !this.dragging && performance.now() > this.restUntil;
  }

  private readonly tick = (_r: THREE.WebGLRenderer, _s: THREE.Scene, camera: THREE.Camera): void => {
    if (!this.open || camera !== this.h.game.camera) return;
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.lastT) / 1000));
    this.lastT = now;
    this.placeLabels(camera as THREE.PerspectiveCamera);
    // for the next frame: the turntable, and the wall and figures facing the camera
    if (this.spinning()) {
      this.spinDeg = (this.spinDeg + SPIN * dt) % 360;
      this.table.rotation.y = this.spinDeg * D2R;
    }
    _e.setFromQuaternion(camera.quaternion, 'YXZ');
    this.refs.rotation.y = _e.y;
  };

  private setWall(w: number): void {
    const g = this.geom;
    g.wallW = w;
    this.wall.scale.set(w, 1, 1);
    this.wall.updateMatrix();
    this.wallTex.repeat.set(w / 2, 1);
    this.line.scale.set(w, 1, 1);
    this.line.updateMatrix();
  }

  private placeLabels(cam: THREE.PerspectiveCamera): void {
    const g = this.geom;
    const W = window.innerWidth,
      H = window.innerHeight;
    const M = 6;
    /** the label's box: centred on the point (below it for a plate, above for the robot), kept on screen */
    const at = (lab: HTMLElement, x: number, y: number, z: number, below: boolean): { x: number; y: number; w: number; h: number } | null => {
      if (lab.hidden) return null;
      _v.set(x, y, z).applyMatrix4(this.refs.matrixWorld).project(cam);
      if (_v.z > 1 || Math.abs(_v.x) > 1.3 || Math.abs(_v.y) > 1.3) return null;
      let size = this.labSize.get(lab);
      if (!size || !size[0]) this.labSize.set(lab, (size = [lab.offsetWidth, lab.offsetHeight]));
      const [w, h] = size;
      const px = ((_v.x + 1) / 2) * W,
        py = ((1 - _v.y) / 2) * H;
      return { x: THREE.MathUtils.clamp(px - w / 2, M, Math.max(M, W - w - M)), y: below ? py + 0.15 * h : py - h, w, h };
    };
    const put = (lab: HTMLElement, b: { x: number; y: number } | null): void => {
      lab.style.visibility = b ? '' : 'hidden';
      if (b) lab.style.transform = `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px)`;
    };
    // name plates at the figures' feet (EMI's moves aside when they would touch), the robot's height over its head
    const du = at(this.labs.du, -g.a, 0, 0.1, true);
    const emi = at(this.labs.emi, g.a, 0, 0.1, true);
    if (du && emi && du.x + du.w + 4 > emi.x && Math.abs(du.y - emi.y) < du.h) {
      if (du.x + du.w + 4 + emi.w <= W - M) emi.x = du.x + du.w + 4;
      else emi.y = du.y + du.h + 4;
    }
    put(this.labs.du, du);
    put(this.labs.emi, emi);
    put(this.labs.robot, at(this.labs.robot, 0, g.h + 0.06, 0, false));
  }

  // ── DOM ──

  private texts(): void {
    const t = this.h.text;
    this.backBtn.setAttribute('aria-label', t.resolve(V.back));
    this.backBtn.title = t.resolve(V.back);
    this.frameBox.setAttribute('aria-label', t.resolve(V.framing));
    this.frameBtns.you.textContent = t.resolve(V.nextToYou);
    this.frameBtns.near.textContent = t.resolve(V.close);
    for (const f of ['you', 'near'] as const) this.frameBtns[f].setAttribute('aria-pressed', String(this.framing === f));
    this.tabsEl.setAttribute('aria-label', t.resolve(V.categories));
    for (const c of CATEGORIES) this.tabBtns[c].textContent = t.resolve(TEXT.tabs[c]);
    this.lineEl.textContent = t.resolve(TEXT.wallLine);
    this.labs.du.textContent = t.resolve(TEXT.du);
    this.labs.emi.textContent = t.resolve(TEXT.emi);
    this.labSize.clear();
    if (this.current) this.robotLabel(this.current);
    this.syncStrip();
    if (this.built) this.redrawWall();
  }

  /** „G1 · 1,32 m MODELL“: the height measured on the model, as the hall's „Gemessen am Modell“ */
  private robotLabel(r: GenRobot): void {
    const t = this.h.text;
    this.labs.robot.replaceChildren(`${r.short} · ${t.num(r.heightM, 2)} m`, chipEl(t, 'modell'));
    this.labs.robot.title = t.resolve(TEXT.modelRow);
    this.labSize.delete(this.labs.robot);
    this.labs.robot.hidden = !(this.shown && this.model?.id === r.id);
  }

  private setTab(c: HallCategory, user: boolean): void {
    this.tab = c;
    this.renderStrip();
    if (user) this.strip.scrollLeft = 0;
  }

  private renderStrip(): void {
    const list = HALL.filter((r) => r.cat === this.tab);
    this.strip.replaceChildren(...list.map((r) => el('button', { type: 'button', class: 'dsv-rb', 'data-robot': r.id, onclick: () => void this.show(r) }, r.short)));
    this.syncStrip();
  }

  private syncStrip(): void {
    const t = this.h.text;
    this.strip.setAttribute('aria-label', `${t.resolve(V.robots)} · ${t.resolve(TEXT.tabs[this.tab])}`);
    for (const c of CATEGORIES) {
      const on = c === this.tab;
      this.tabBtns[c].setAttribute('aria-selected', String(on));
      this.tabBtns[c].tabIndex = on ? 0 : -1;
    }
    let sel: HTMLElement | null = null;
    for (const b of this.strip.querySelectorAll<HTMLButtonElement>('.dsv-rb')) {
      const on = b.dataset.robot === this.current?.id;
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', this.byId.get(b.dataset.robot as RobotId) ? t.resolve(this.byId.get(b.dataset.robot as RobotId)!.name) : b.textContent ?? '');
      if (on) sel = b;
    }
    if (sel && this.open) {
      const s = this.strip;
      const left = sel.offsetLeft - (s.clientWidth - sel.offsetWidth) / 2;
      s.scrollLeft = Math.max(0, left);
    }
  }

  // ── the studio's meshes (once) ──

  private build(): void {
    const h = this.h;
    const M = h.ctx.materials;
    this.built = true;
    this.root.name = 'discover:studio';
    // the cyclorama: an upper hemisphere seen from inside, closed by the floor
    const dome = new THREE.Mesh(insideOut(new THREE.SphereGeometry(DOME_R, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2)), M.standard({ color: 0x4d4944, roughness: 1, metalness: 0 }));
    dome.name = 'discover:studio-dome';
    dome.castShadow = dome.receiveShadow = false;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(DOME_R, 64).rotateX(-Math.PI / 2), M.standard({ color: 0x2b2926, roughness: 0.92, metalness: 0 }));
    floor.name = 'discover:studio-floor';
    floor.receiveShadow = true;
    floor.frustumCulled = false;
    floor.onBeforeRender = this.tick as unknown as THREE.Object3D['onBeforeRender'];
    // the turntable (top 3 mm above the floor) and its orange rim
    this.disc = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.05, 64).translate(0, -0.022, 0), M.standard({ color: 0x1f1f1f, roughness: 0.55, metalness: 0.2 }));
    this.disc.name = 'discover:studio-turntable';
    this.disc.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.965, 1, 64).rotateX(-Math.PI / 2).translate(0, 0.0045, 0), M.light(0xff6700, 'line'));
    rim.name = 'discover:studio-rim';
    this.disc.add(rim);
    this.table.add(this.disc);
    // the measuring wall: a 2 m tile repeated along it
    this.wallCanvas = document.createElement('canvas');
    this.wallCanvas.width = 2 * PX_PER_M;
    this.wallCanvas.height = Math.round(WALL_H * PX_PER_M);
    this.wallTex = new THREE.CanvasTexture(this.wallCanvas);
    this.wallTex.colorSpace = THREE.SRGBColorSpace;
    this.wallTex.wrapS = THREE.RepeatWrapping;
    this.wallTex.anisotropy = 4;
    this.redrawWall();
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(1, WALL_H).translate(0, WALL_H / 2, 0), M.standard({ map: this.wallTex, roughness: 0.85, metalness: 0 }));
    this.wall.name = 'discover:studio-wall';
    this.wall.receiveShadow = true;
    // the figures, as the Größenwand's: „Du“ 1.75 m (a flat capsule) and EMI 1.55 m (rover base, body, head)
    const figMat = M.standard({ color: 0xc9c4bf, roughness: 0.5, metalness: 0.05 });
    const du = new THREE.CapsuleGeometry(0.22, DU_H - 0.44, 6, 16).scale(1, 1, 0.25).translate(0, DU_H / 2, 0);
    this.du = new THREE.Mesh(du, figMat);
    this.du.name = 'discover:studio-du';
    const parts = [
      new THREE.CylinderGeometry(0.26, 0.3, 0.32, 20).scale(1, 1, 0.3).translate(0, 0.16, 0),
      new THREE.CylinderGeometry(0.14, 0.18, 0.78, 16).scale(1, 1, 0.3).translate(0, 0.71, 0),
      new THREE.SphereGeometry(0.2, 18, 12).scale(1, 1, 0.3).translate(0, 1.35, 0),
    ].map((g) => g.toNonIndexed());
    this.emi = new THREE.Mesh(mergeNonIndexed(parts), figMat);
    this.emi.name = 'discover:studio-emi';
    for (const m of [this.du, this.emi]) m.castShadow = m.receiveShadow = true;
    // the robot's height (MODELL) across the wall
    this.line = new THREE.Mesh(new THREE.BoxGeometry(1, 0.012, 0.012), M.light(0xf5f5f4, 'line'));
    this.line.name = 'discover:studio-height';
    this.refs.add(this.wall, this.du, this.emi, this.line);
    this.root.add(dome, floor, this.table, this.refs);
    for (const o of [dome, floor, this.disc, rim, this.wall, this.du, this.emi, this.line]) {
      o.matrixAutoUpdate = false;
      o.updateMatrix();
    }
    this.root.traverse((o) => o.layers.set(STUDIO_LAYER));
    const own = [dome, floor, this.disc, rim, this.wall, this.du, this.emi, this.line];
    h.ctx.onDispose(() => {
      for (const m of own) m.geometry.dispose();
      this.wallTex.dispose();
    });
    // the canvas font may arrive after the first draw
    void document.fonts?.load?.('500 22px "Geist Mono"').then(() => this.redrawWall(), () => undefined);
  }

  private redrawWall(): void {
    const g = this.wallCanvas.getContext('2d');
    if (!g) return;
    drawTile(g, this.wallCanvas.width, this.wallCanvas.height, this.h.text.lang === 'en' ? 'en' : 'de');
    this.wallTex.needsUpdate = true;
  }
}

/** non-indexed geometries with position + normal + uv into one */
function mergeNonIndexed(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const size = name === 'uv' ? 2 : 3;
    const n = list.reduce((s, g) => s + g.getAttribute('position').count, 0);
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const g of list) {
      const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
      const c = g.getAttribute('position').count;
      if (a) arr.set(a.array as Float32Array, o);
      o += c * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  for (const g of list) g.dispose();
  return out;
}
