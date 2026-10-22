/**
 * WP15 — egg 13 „Winke-Arm“ (plan §1.2 at 6–12 s, §4.13 H0; R9 §5 #13): designed as most players' first
 * find. A real SO-101 (WP0's model through ctx.robots, Apache-2.0) on a post at the bridge head, mirrored
 * to the sign. It looks around like a curious desk lamp; when you come by it turns to you and waves
 * first. The reply is a wiggle of your view — left, right, left within 1.6 s while it is in view — or
 * E „Zurückwinken“ (keyboard and touchpad players). Then it waves back with a little dance, and the
 * find goes into the Fundvitrine. At a rotor beat and at the lift-off it waves too (it is in C1).
 */
import * as THREE from 'three';
import type { RobotModel, Text, ZoneContext } from '@/core/zones';
import type { Director } from '../life/director';
import type { LifeSounds } from '../life/sound';
import type { ReactKind } from '../life/types';
import { SPOTS, WINKE } from '../life/tuning';
import { PAL, at, box, col, mergeParts } from '../life/geo';

const J = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'] as const;
type Mode = 'idle' | 'notice' | 'wave' | 'dance' | 'react';

export interface Winke {
  stats(): Record<string, unknown>;
  /** tools: the reply as if you had wiggled */
  reply(): void;
}

export function buildWinke(ctx: ZoneContext, h: { director: Director; paint: THREE.Material; sounds: LifeSounds }): Winke {
  const D = h.director;
  const T = (de: string, en: string): Text => ({ de, en });
  const [px, , pz] = SPOTS.winkePost;
  const gy = ctx.frames.heightAt(px, pz);
  const root = new THREE.Group();
  root.name = 'life:winke';
  root.position.set(px, gy, pz);
  D.roots.ground.add(root);
  D.area('winke', { center: [px, gy + 1, pz], radius: 2, frame: 'ground' });

  // the post: a slim ceramic column, a carbon top plate, a teal camera ring at its foot (data), a step
  const post = new THREE.Mesh(
    mergeParts([
      at(col(new THREE.CylinderGeometry(0.11, 0.14, WINKE.postH, 14), PAL.white), 0, WINKE.postH / 2, 0),
      at(col(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 18), PAL.carbon), 0, WINKE.postH + 0.015, 0),
      at(col(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 18), PAL.carbon), 0, 0.025, 0),
      at(col(new THREE.TorusGeometry(0.155, 0.006, 4, 24).rotateX(Math.PI / 2), PAL.teal), 0, WINKE.postH - 0.06, 0),
      box(0.012, 0.18, 0.1, PAL.stoneDark, 0.135, WINKE.postH * 0.6, 0),
    ]),
    h.paint,
  );
  post.name = 'life:winke-post';
  post.castShadow = true;
  post.receiveShadow = true;
  root.add(post);
  D.track(post);
  ctx.frames.adopt(ctx.physics.addStaticCylinder({ radius: 0.17, height: WINKE.postH + 0.04, position: [px, gy + (WINKE.postH + 0.04) / 2, pz], surface: 'metal' }));

  // it faces the walkway to the bridge (between the spawn and the notch)
  const faceYaw = Math.atan2(0 - px, 110.5 - pz);
  let model: RobotModel | null = null;
  const nodes: { n: THREE.Object3D; axis: THREE.Vector3; rest: THREE.Quaternion; ref: number; lo: number; hi: number }[] = [];
  const pose = new Float64Array(J.length);
  const want = new Float64Array(J.length);
  const _q = new THREE.Quaternion();
  void ctx.robots
    ?.load('so101', { priority: 'now' })
    .then((m) => {
      model = m;
      m.object.position.set(0, WINKE.postH + 0.03, 0);
      m.object.rotation.y = faceYaw;
      m.object.name = 'life:winke-arm';
      root.add(m.object);
      for (const name of J) {
        const n = m.jointNode(name)!;
        const j = m.joints.find((x) => x.name === name)!;
        nodes.push({ n, axis: m.jointAxis(name)!.clone(), rest: n.quaternion.clone(), ref: m.getJoint(name), lo: j.lower, hi: j.upper });
      }
    })
    .catch((err: unknown) => console.warn('[life] the Winke-Arm did not load', err));
  const write = (): void => {
    for (let i = 0; i < nodes.length; i++) {
      const s = nodes[i];
      const v = Math.min(s.hi, Math.max(s.lo, pose[i]));
      s.n.quaternion.copy(s.rest).multiply(_q.setFromAxisAngle(s.axis, v - s.ref));
    }
  };

  // ── behaviour ───────────────────────────────────────────────────────────────
  let mode: Mode = 'idle';
  let t = 0;
  let wavedThisApproach = false;
  let lastWave = -1e9;
  let waves = 0;
  let replies = 0;
  /** the wiggle detector: yaw reversals within the window while the arm is in view */
  let lastYaw = ctx.player.yaw;
  let lastDir = 0;
  let swing = 0;
  const reversals: number[] = [];
  const _v = new THREE.Vector3();
  const _f = new THREE.Vector3();
  const arm = new THREE.Vector3(px, gy + WINKE.postH + 0.2, pz);
  const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
  /** your bearing from the arm, relative to its facing (rad) */
  const relYou = (): number => {
    const p = D.feetGround;
    return wrap(Math.atan2(p.x - px, p.z - pz) - faceYaw);
  };
  /** the shoulder_pan that points the arm at you */
  const aimAt = (): number => WINKE.panSign * relYou();
  const startWave = (m: Mode): void => {
    mode = m;
    t = 0;
    lastWave = ctx.time.elapsed;
    if (m === 'wave') waves++;
    // a small servo chirp, like the rovers' greeting
    ctx.audio.tone({ freq: 880, to: 1320, dur: 0.09, type: 'triangle', volume: 0.22, at: [px, gy + 1.2 - D.altitude, pz] });
  };
  const reply = (): void => {
    if (mode === 'dance') return;
    replies++;
    mode = 'dance';
    t = 0;
    ctx.game.juice.burst([px, gy + WINKE.postH + 0.35 - D.altitude, pz], { tone: 'teal', count: 26, spread: 0.45 });
    ctx.game.juice.popup([px, gy + WINKE.postH + 0.75 - D.altitude, pz], T('Hallo zurück!', 'Hello back!'), { tone: 'teal', seconds: 2.4 });
    ctx.game.juice.cue('great', { at: [px, gy + 1.2 - D.altitude, pz] });
    ctx.game.secrets.find('winke-arm', [px, gy + 1.2 - D.altitude, pz]);
  };
  // E „Zurückwinken“: shown once it has waved at you (the wiggle is the other way, in the hint)
  const handle = ctx.addInteractable({
    object: post,
    label: T('Zurückwinken', 'Wave back'),
    hint: T('Oder: Blick hin und her wackeln.', 'Or: wiggle your view left and right.'),
    // from the walk onto the bridge (the post stands ≈ 5 m beside it)
    range: 5.6,
    isEnabled: () => waves > 0 && mode !== 'dance',
    onInteract: reply,
  });
  void handle;

  const tick = (dt: number): void => {
    t += dt;
    const p = D.feetGround;
    const d = Math.hypot(p.x - px, p.z - pz);
    const ahead = Math.abs(relYou()) < 1.45;
    if (d > WINKE.resetM) wavedThisApproach = false;
    // the wiggle: yaw reversals of at least minDeg each, while you look at it from close by
    const yaw = ctx.player.yaw;
    const dy = wrap(yaw - lastYaw);
    lastYaw = yaw;
    const cam = ctx.camera;
    cam.getWorldDirection(_f);
    _v.set(arm.x - cam.position.x, arm.y - D.altitude - cam.position.y, arm.z - cam.position.z);
    const dist = _v.length();
    const inView = dist < WINKE.replyM && _f.dot(_v.normalize()) > Math.cos(THREE.MathUtils.degToRad(WINKE.aimDeg));
    if (Math.abs(dy) > 1e-4) {
      const dir = Math.sign(dy);
      if (dir === lastDir || lastDir === 0) swing += Math.abs(dy);
      else {
        if (swing >= THREE.MathUtils.degToRad(WINKE.minDeg) && inView) reversals.push(ctx.time.elapsed);
        swing = Math.abs(dy);
      }
      lastDir = dir;
    }
    while (reversals.length && ctx.time.elapsed - reversals[0] > WINKE.windowS) reversals.shift();
    if (reversals.length >= WINKE.wiggles && inView) {
      reversals.length = 0;
      reply();
    }
    // the moves
    if (mode === 'idle') {
      // a curious desk lamp: slow look-around
      want[0] = Math.sin(t * 0.31) * 0.6;
      want[1] = -0.35 + Math.sin(t * 0.21) * 0.12;
      want[2] = 1.1 + Math.sin(t * 0.17) * 0.15;
      want[3] = 0.55 + Math.sin(t * 0.43) * 0.2;
      want[4] = Math.sin(t * 0.13) * 0.3;
      want[5] = 0.25;
      if (!wavedThisApproach && d < WINKE.noticeM && ahead) {
        wavedThisApproach = true;
        startWave('wave');
      }
    } else if (mode === 'wave' || mode === 'react') {
      // turn to you (or the island), raise the arm, wave the wrist, open and close the jaw
      want[0] = mode === 'react' ? 0.0 : THREE.MathUtils.clamp(aimAt(), -1.6, 1.6);
      want[1] = -1.15;
      want[2] = 0.35;
      want[3] = -0.25 + Math.sin(t * 9.5) * 0.55;
      want[4] = Math.sin(t * 4.75) * 0.35;
      want[5] = 0.6 + Math.sin(t * 9.5) * 0.5;
      if (t > (mode === 'react' ? 2.2 : WINKE.waveS)) mode = 'idle';
    } else if (mode === 'dance') {
      // the reply: a full turn of the base, bobbing, clapping jaws
      const k = t / WINKE.danceS;
      want[0] = THREE.MathUtils.clamp(aimAt(), -1.6, 1.6) + Math.sin(k * Math.PI * 2) * 1.5;
      want[1] = -0.9 + Math.sin(t * 6) * 0.35;
      want[2] = 0.6 + Math.sin(t * 6 + 1.2) * 0.45;
      want[3] = Math.sin(t * 12) * 0.6;
      want[4] = Math.sin(t * 3) * 1.4;
      want[5] = 0.7 + Math.sin(t * 14) * 0.6;
      if (t > WINKE.danceS) mode = 'idle';
    }
    // reduced motion: the same moves, calmer (R9 §3 rule 5)
    if (ctx.settings.reducedMotion) for (let i = 0; i < J.length - 1; i++) want[i] = pose[i] + (want[i] - pose[i]) * 0.6;
    const kk = 1 - Math.exp(-dt * (mode === 'idle' ? 2.2 : ctx.settings.reducedMotion ? 4 : 9));
    for (let i = 0; i < J.length; i++) pose[i] += (want[i] - pose[i]) * kk;
    if (model) write();
  };
  D.register({
    id: 'egg:winke-arm',
    area: 'winke',
    job: T('Grüßen', 'Greet'),
    kind: 'arm',
    near: tick,
    mid: tick,
    react: (kind: ReactKind) => {
      if ((kind === 'rotor' || kind === 'liftoff' || kind === 'wave') && mode !== 'dance') startWave('react');
    },
  });
  ctx.debug.register('egg-winke', () => {
    reply();
    return ctx.game.secrets.has('winke-arm');
  });
  /** the angle (deg) between the arm's reach and the way to you, seen from above (tools: it turns to you) */
  const facing = (): number | null => {
    if (!model) return null;
    const tipW = model.getLinkWorldPosition('gripper_frame_link', new THREE.Vector3());
    if (!tipW) return null;
    const base = root.getWorldPosition(new THREE.Vector3());
    const p = ctx.player.position;
    const a = Math.atan2(tipW.x - base.x, tipW.z - base.z) - Math.atan2(p.x - base.x, p.z - base.z);
    return Math.round((Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) * 180) / Math.PI);
  };
  return {
    stats: () => ({ mode, waves, replies, loaded: !!model, lastWave: Math.round(lastWave * 10) / 10, facingDeg: facing() }),
    reply,
  };
}
