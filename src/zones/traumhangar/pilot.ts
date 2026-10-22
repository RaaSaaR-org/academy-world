/**
 * Piloting a humanoid (plan §4.8, R3 §5.2), inside WP4's enterOperate({ capture }):
 *   Kommandieren (legs)  W/S speed, A/D turn — velocity commands, like Unitree's walking controller
 *   Steuern (arms)       hold the right mouse button: the hand target follows the mouse on a plane in
 *                        front of the robot (IK); the left button grips or releases
 *   Vorstellen (dream)   hold Space: time × 0.1 and the ghosts show the next seconds (the station decides
 *                        what it dreams); the wheel picks the horizon, 1/2/3 a candidate; release = act
 * First person is the robot's head camera, stabilised by construction: the eye rides the root at the
 * robot's eye height, low-passed, horizon level, yaw follows smoothly, the mouse turns the head ±60°.
 * V toggles a chase camera (the default under reduced motion). While Space is held the view rises above
 * the robot and looks down like a planning table (the ghosts and their trails read from above; a cut under
 * reduced motion), and comes back on release.
 */
import * as THREE from 'three';
import type { Text, ZoneContext } from '@/core/zones';
import { ARMS, DREAM, type FloorKind } from './tuning';
import type { Rig } from './roster';

export interface PilotHooks {
  /** eyebrow of the operate bar */
  title: Text;
  /** the station's operate panel (≤ 35 words at open) */
  panel?(el: HTMLElement, exit: () => void): void | (() => void);
  /** extra captured keys (E, Q, R, X, digits are always captured) */
  keys?: readonly string[];
  /** reality's floor friction under (x, z) */
  mu?(x: number, z: number): number;
  /** a sideways push (a gust), zone-local m/s² — or null */
  push?(): THREE.Vector3 | null;
  /** an autopilot command for this frame (overrides the keys), or null for the player's keys */
  command?(dt: number): { v: number; w: number } | null;
  /** keep the root inside the station (after the gait moved it) */
  clamp?(p: THREE.Vector3): void;
  /** a captured key went down (E, Q, R, X, digits, B …) */
  onKey?(code: string): void;
  /** Space went down (imagination starts) / up (act) */
  onImagine?(): void;
  onAct?(): void;
  /** the wheel: −1 shorter, +1 longer */
  onWheel?(dir: number): void;
  /** the left button while the hand target is shown: grip or release */
  onGrip?(hand: THREE.Vector3): void;
  /** every frame after the gait: `simDt` is the slowed time while imagining */
  update?(dt: number, simDt: number): void;
  /** the pilot left (Esc, the panel's button, a station reset) */
  onExit?(): void;
  /** ground under the robot (for the walking sound): its floor kind */
  floor?(x: number, z: number): FloorKind;
}

const _f = new THREE.Vector3();
const _l = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const UP = THREE.Object3D.DEFAULT_UP;

export interface Pilot {
  readonly rig: Rig | null;
  readonly active: boolean;
  /** Space is held */
  readonly imagining: boolean;
  /** the chase camera is on */
  readonly chase: boolean;
  /** RMB held: the arm target is shown and moves with the mouse */
  readonly teleop: boolean;
  /** the hand target (zone-local), valid while teleop or after it */
  readonly hand: THREE.Vector3;
  /** the camera pose of this frame (zone-local) */
  readonly cam: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  enter(rig: Rig, hooks: PilotHooks): void;
  exit(): void;
  update(dt: number): void;
  /** the chase camera for a moment (a fall), then back */
  chaseFor(seconds: number): void;
  setChase(on: boolean): void;
  /** the player's keys as a command (what update() uses when the hooks give none) */
  keys(): { v: number; w: number };
  /** a scripted key state for the tools: hold these codes (null releases) */
  bot(codes: readonly string[] | null): void;
  /** the tools: override the dream view (null = the tuning) */
  viewTweak(v: { viewUp: number; viewBack: number; viewPitch: number; viewYaw?: number } | null): void;
  /** the hooks of the station flying now */
  readonly hooks: PilotHooks | null;
}

export function createPilot(ctx: ZoneContext, o: { onHandMarker?(at: THREE.Vector3 | null): void; onDream?(): void }): Pilot {
  let rig: Rig | null = null;
  let hooks: PilotHooks | null = null;
  let exitOp: (() => void) | null = null;
  let imagining = false;
  let chase = ctx.settings.reducedMotion;
  let chaseUntil = 0;
  let teleop = false;
  let headYaw = 0;
  let pitch = -0.08;
  let camY = 0;
  let camYaw = 0;
  let dreamView = 0;
  let botKeys: Set<string> | null = null;
  /** a dev override of the dream view (tools: measuring what it frames) */
  let tweak: { viewUp: number; viewBack: number; viewPitch: number; viewYaw?: number } | null = null;
  const hand = new THREE.Vector3();
  /** hand target in the robot's frame: lateral (left +), height above the hip, forward */
  const handLocal = new THREE.Vector3(0, -0.2, ARMS.plane.fwd);
  const cam = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
  const down = (c: string): boolean => (botKeys ? botKeys.has(c) : ctx.input.isDown(c));

  const keys = (): { v: number; w: number } => {
    if (!rig) return { v: 0, w: 0 };
    const p = rig.gait.p;
    const k = (c: string): number => (down(c) ? 1 : 0);
    return { v: k('KeyW') * p.vMax + k('KeyS') * p.vBack, w: (k('KeyA') - k('KeyD')) * p.wMax };
  };

  const placeCamera = (dt: number): void => {
    if (!rig) return;
    const g = rig.gait;
    const P = rig.params;
    const eye = P.eye;
    const k = 1 - Math.exp(-dt / 0.35);
    camY += (g.pos.y + eye - 0.05 - camY) * k;
    let dy = g.psi - camYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    camYaw += dy * (1 - Math.exp(-dt / 0.18));
    g.heading(_f, camYaw);
    const useChase = chase || ctx.time.elapsed < chaseUntil;
    // the dream view: while Space is held the view rises above the robot and tilts down onto the floor
    // like a planning table (the ghosts, their trails and the obstacles read from above). It eases in
    // over DREAM.viewS; under reduced motion it cuts.
    const want = imagining ? 1 : 0;
    if (ctx.settings.reducedMotion) dreamView = want;
    else dreamView += THREE.MathUtils.clamp(want - dreamView, -dt / DREAM.viewS, dt / DREAM.viewS);
    const dv = dreamView * dreamView * (3 - 2 * dreamView);
    if (useChase) {
      cam.position.copy(g.pos).addScaledVector(_f, -P.chaseBack);
      cam.position.y = g.pos.y + P.heightM + P.chaseUp;
      _w.copy(g.pos).addScaledVector(_f, 2.2).setY(g.pos.y + P.heightM * 0.55);
      cam.quaternion.setFromRotationMatrix(_m.lookAt(cam.position, _w, UP));
    } else {
      // the head camera: no gait bob (camY is the root's height, low-passed), horizon level
      cam.position.copy(g.pos).addScaledVector(_f, 0.1).setY(camY);
      cam.quaternion.setFromEuler(_e.set(pitch, Math.atan2(-_f.x, -_f.z) + headYaw, 0, 'YXZ'));
    }
    if (dv > 0) {
      const V = tweak ?? DREAM;
      _w.copy(g.pos).addScaledVector(_f, -V.viewBack).setY(camY + V.viewUp);
      _q.setFromEuler(_e.set(-V.viewPitch, Math.atan2(-_f.x, -_f.z) + (tweak?.viewYaw ?? 0), 0, 'YXZ'));
      cam.position.lerp(_w, dv);
      cam.quaternion.slerp(_q, dv);
    }
  };

  const updateHand = (): void => {
    if (!rig) return;
    const g = rig.gait;
    g.heading(_f);
    g.side(_l);
    hand.copy(rig.model.object.position).addScaledVector(_f, handLocal.z).addScaledVector(_l, handLocal.x);
    hand.y = rig.model.object.position.y + rig.legs[0].hip.y + 0.25 + handLocal.y;
  };

  const api: Pilot = {
    get rig() {
      return rig;
    },
    get active() {
      return !!rig;
    },
    get imagining() {
      return imagining;
    },
    get chase() {
      return chase;
    },
    get teleop() {
      return teleop;
    },
    hand,
    cam,
    get hooks() {
      return hooks;
    },
    enter(r, h) {
      if (rig) api.exit();
      rig = r;
      hooks = h;
      imagining = false;
      teleop = false;
      headYaw = 0;
      pitch = -0.08;
      camY = r.gait.pos.y + r.params.eye - 0.05;
      camYaw = r.gait.psi;
      dreamView = 0;
      chase = ctx.settings.reducedMotion;
      placeCamera(1);
      r.gait.heading(_f);
      const keysAll = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyV', 'KeyE', 'KeyQ', 'KeyR', 'KeyX', 'Digit1', 'Digit2', 'Digit3', 'Digit4', ...(h.keys ?? [])];
      exitOp = ctx.player.enterOperate({
        cameraPose: { position: cam.position.clone(), lookAt: cam.position.clone().addScaledVector(_f, 5) },
        title: h.title,
        panel: h.panel,
        panelPosition: 'right',
        capture: {
          keys: keysAll,
          pointerLock: true,
          onLook: (dx, dy) => {
            if (teleop) {
              // the hand target moves on its plane (arms by teleop)
              handLocal.x = THREE.MathUtils.clamp(handLocal.x - dx * ARMS.plane.perPx, -ARMS.plane.xMax, ARMS.plane.xMax);
              handLocal.y = THREE.MathUtils.clamp(handLocal.y - dy * ARMS.plane.perPx, ARMS.plane.yMin, ARMS.plane.yMax);
              return;
            }
            const lim = THREE.MathUtils.degToRad(60);
            headYaw = THREE.MathUtils.clamp(headYaw - dx * 0.0022, -lim, lim);
            pitch = THREE.MathUtils.clamp(pitch - dy * 0.0022, -0.9, 0.6);
          },
          camera: (out) => {
            out.position.copy(cam.position);
            out.quaternion.copy(cam.quaternion);
          },
        },
        onPointer: (e) => {
          if (e.type === 'wheel' && e.deltaY) hooks?.onWheel?.(e.deltaY > 0 ? -1 : 1);
          else if (e.type === 'down' && e.button === 2) {
            teleop = true;
            updateHand();
          } else if (e.type === 'up' && e.button === 2) {
            teleop = false;
            o.onHandMarker?.(null);
          } else if (e.type === 'down' && e.button === 0 && teleop) hooks?.onGrip?.(hand);
        },
        onExit: () => {
          const hh = hooks;
          rig = null;
          hooks = null;
          exitOp = null;
          imagining = false;
          teleop = false;
          botKeys = null;
          o.onHandMarker?.(null);
          hh?.onExit?.();
        },
      });
    },
    exit() {
      exitOp?.();
    },
    update(dt) {
      if (!rig || !hooks) return;
      const r = rig;
      const h = hooks;
      // Space: imagination (time × 0.1) — the station dreams on the way down and acts on the way up
      const sp = down('Space');
      if (sp && !imagining) {
        imagining = true;
        o.onDream?.();
        h.onImagine?.();
      } else if (!sp && imagining) {
        imagining = false;
        h.onAct?.();
      }
      const simDt = imagining ? dt * DREAM.slowMo : dt;
      const cmd = h.command?.(simDt) ?? (imagining ? { v: 0, w: 0 } : keys());
      r.gait.update(simDt, cmd.v, cmd.w, h.mu ?? (() => 0.8), h.push?.() ?? null);
      h.clamp?.(r.gait.pos);
      if (teleop) {
        updateHand();
        o.onHandMarker?.(hand);
      }
      h.update?.(dt, simDt);
      r.pose(simDt);
      placeCamera(dt);
    },
    chaseFor(seconds) {
      chaseUntil = ctx.time.elapsed + seconds;
    },
    setChase(on) {
      chase = on;
    },
    keys,
    bot(codes) {
      botKeys = codes ? new Set(codes) : null;
    },
    viewTweak(v) {
      tweak = v;
    },
  };
  // V: the chase camera (captured while piloting)
  ctx.input.onKey('KeyV', () => {
    if (rig) chase = !chase;
  }, { anywhere: true, whileOperating: true });
  ctx.input.onKey(['KeyE', 'KeyQ', 'KeyR', 'KeyX', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyB', 'KeyF'], (code) => {
    if (rig) hooks?.onKey?.(code);
  }, { anywhere: true, whileOperating: true });
  return api;
}
