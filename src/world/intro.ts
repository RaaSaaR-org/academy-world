import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { DEG, bearingOf, type Vec3Tuple } from './layout';
import { GLIDE } from './start/tuning';

/**
 * Glide (Phase 7 plan §1.2, §4.1; it retires the rc4 25 s ascent): a 6 s camera glide from the title
 * orbit down to the bridge head, swinging round the docked island on the shorter side and settling
 * into the player's first view (bearing 0, pitch +6°: the island ahead, the mark centred). First visit
 * only. Skippable with Space, Enter, E or a click: a skip fades to black, cuts to the end and fades
 * back (QA-15: no camera whip). Reduced motion: a 0.4 s fade instead of the flight. The title banner
 * shows as the island fills the view. The rc4 captions („Diese Insel fällt ständig.“ …) move to the
 * lift-off (WP13).
 */
export interface Intro {
  /**
   * Glide from the title camera to the player's view at `to` (feet, yaw/pitch in degrees). Resolves
   * true after the whole glide, false when skipped (or under reduced motion: the fade).
   */
  play(to: { position: Vec3Tuple; yawDeg: number; pitchDeg: number }): Promise<boolean>;
  /** per frame; before the start it remembers the title camera (where the glide begins) */
  update(dt: number): void;
  readonly playing: boolean;
}

const EYE = 1.7;

export function buildIntro(ctx: ZoneContext): Intro {
  // the title camera of the last frame (Game drives it after the island's update, so this lags a frame)
  const titlePos = new THREE.Vector3(-65, 18, -178);
  const titleLook = new THREE.Vector3(0, -8, 0);
  let titleSeen = false;
  const fwd = new THREE.Vector3();

  let playing = false;
  let state: null | {
    t: number;
    finishing: number;
    titled: boolean;
    unlock: () => void;
    cam: ReturnType<ZoneContext['player']['cinematic']>;
    offKeys: () => void;
    clearHint: () => void;
    resolve: (completed: boolean) => void;
    skipping: boolean;
    path: (u: number, pos: THREE.Vector3, look: THREE.Vector3) => void;
  } = null;
  const finish = (s: NonNullable<typeof state>): void => {
    state = null;
    s.offKeys();
    s.clearHint();
    s.cam.end();
    s.unlock();
    playing = false;
    s.resolve(!s.skipping);
  };
  /** skip: fade to black, cut to the end under cover, fade back in */
  const skip = (s: NonNullable<typeof state>): void => {
    if (s.skipping || s.finishing >= 0) return;
    s.skipping = true;
    s.clearHint();
    ctx.events.emit('ui:fade', { on: true });
    window.setTimeout(() => {
      if (state !== s) return;
      finish(s);
      window.setTimeout(() => ctx.events.emit('ui:fade', { on: false }), 120);
    }, 380);
  };
  const pos = new THREE.Vector3(),
    look = new THREE.Vector3();

  /**
   * The glide in polar coordinates round the island: bearing and radius from the title camera to the
   * bridge head, the height falling to the eye with a small rise in between (the dock opens below),
   * the look turning from the island's centre to the end view.
   */
  const makePath = (end: THREE.Vector3, endLook: THREE.Vector3): ((u: number, p: THREE.Vector3, l: THREE.Vector3) => void) => {
    const b0 = bearingOf(titlePos.x, titlePos.z),
      b1 = bearingOf(end.x, end.z);
    let db = b1 - b0;
    if (db > 180) db -= 360;
    if (db < -180) db += 360;
    const r0 = Math.hypot(titlePos.x, titlePos.z),
      r1 = Math.hypot(end.x, end.z);
    const y0 = titlePos.y,
      y1 = end.y;
    const centre = new THREE.Vector3(0, 6, 0);
    const look0 = titleLook.clone();
    const tmp = new THREE.Vector3();
    return (u, p, l) => {
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; // ease in-out cubic
      const b = (b0 + db * e) * DEG;
      // the radius closes in late (the swing first), the height falls early (down into the dock's air)
      const er = THREE.MathUtils.smoothstep(u, 0.15, 1);
      const r = THREE.MathUtils.lerp(r0, r1, er);
      const ey = 1 - Math.pow(1 - THREE.MathUtils.smoothstep(u, 0, 0.92), 2);
      const y = THREE.MathUtils.lerp(y0, y1, ey) + Math.sin(Math.PI * Math.min(1, u * 1.1)) * 6 * (1 - u);
      p.set(Math.sin(b) * r, y, -Math.cos(b) * r);
      // never through the land: keep 2.5 m over the terrain (the last metres settle onto the eye)
      const ground = ctx.frames.heightAt(p.x, p.z) + 2.5 * (1 - THREE.MathUtils.smoothstep(u, 0.85, 1));
      if (p.y < ground) p.y = ground;
      // look: the title's view → the island's centre → the player's first view
      const k1 = THREE.MathUtils.smoothstep(u, 0, 0.3),
        k2 = THREE.MathUtils.smoothstep(u, 0.55, 1);
      tmp.lerpVectors(look0, centre, k1);
      l.lerpVectors(tmp, endLook, k2);
    };
  };

  return {
    get playing() {
      return playing;
    },
    play(to) {
      if (playing) return Promise.resolve(false);
      const end = new THREE.Vector3(to.position[0], to.position[1] + EYE, to.position[2]);
      const yaw = to.yawDeg * DEG,
        pitch = to.pitchDeg * DEG;
      // yaw 0 faces −z (north); the end view looks along it, pitched up
      const endLook = end.clone().add(new THREE.Vector3(-Math.sin(yaw) * 60, Math.tan(pitch) * 60, -Math.cos(yaw) * 60));
      // the player stands at the end already; the cinematic camera blends onto them at the end
      ctx.player.teleport(to.position, { yawDeg: to.yawDeg, pitchDeg: to.pitchDeg });
      if (ctx.settings.reducedMotion) {
        // reduced motion: a short fade instead of the flight
        ctx.events.emit('ui:fade', { on: true });
        return new Promise<boolean>((resolve) =>
          window.setTimeout(() => {
            ctx.events.emit('ui:fade', { on: false });
            resolve(false);
          }, GLIDE.fadeS * 1000),
        );
      }
      playing = true;
      return new Promise<boolean>((resolve) => {
        const s: NonNullable<typeof state> = {
          t: 0,
          finishing: -1,
          titled: false,
          unlock: ctx.player.lockControls({ look: true }),
          cam: ctx.player.cinematic(),
          offKeys: () => {},
          clearHint: ctx.ui.hint({ de: 'Leertaste · Klick: Anflug überspringen', en: 'Space · click: skip the approach' }, 0),
          resolve,
          skipping: false,
          path: makePath(end, endLook),
        };
        s.offKeys = ctx.input.onKey(['Space', 'Enter', 'KeyE'], () => skip(s), { anywhere: true });
        state = s;
        s.path(0, pos, look);
        s.cam.set(pos, look, 1);
      });
    },
    update(dt) {
      const s = state;
      if (!s) {
        // before the start: remember where the title camera is (the glide's first frame)
        if (!playing && !titleSeen) {
          titlePos.copy(ctx.camera.position);
          ctx.camera.getWorldDirection(fwd);
          titleLook.copy(titlePos).addScaledVector(fwd, 120);
        }
        return;
      }
      titleSeen = true;
      if (s.finishing < 0 && ctx.input.pressed('MouseLeft')) skip(s);
      if (s.skipping) return;
      s.t += Math.min(dt, 0.05);
      const u = Math.min(1, s.t / GLIDE.duration);
      s.path(u, pos, look);
      if (u >= 1 && s.finishing < 0) {
        s.finishing = s.t;
        // the skip hint goes now: the HUD leaves its cinematic layout at blend 0.5
        s.clearHint();
      }
      const blend = s.finishing >= 0 ? Math.max(0, 1 - (s.t - s.finishing) / GLIDE.blendS) : 1;
      s.cam.set(pos, look, blend * blend * (3 - 2 * blend));
      if (!s.titled && u > GLIDE.bannerAt) {
        s.titled = true;
        ctx.hud.banner({ de: 'SCHWEBEWERK · INSEL 17', en: 'THE FLOATING WORKS · ISLAND 17' }, { de: 'Messung statt Marketing.', en: 'Measurement, not marketing.' });
      }
      if (s.finishing >= 0 && blend <= 0) finish(s);
    },
  };
}
