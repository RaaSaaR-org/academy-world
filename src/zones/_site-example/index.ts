/**
 * _site-example — the dev site: one area in the GROUND frame that exercises the Phase 7 engine once
 * (plan §5.2, §5.3, §5.6; WP4). Dev-only (ids starting with "_" never ship):
 *   /?zone=_site-example&skipIntro=1   (or ?dev=1 and __academy.loadAll())
 * It sits on a fallback platform on the ring beyond 900 m (layout.ts FALLBACK_RING), parented to
 * the ground root. tools/frames-check.mjs and tools/robots-adapter-check.mjs drive it through
 * __academy.solve('_site-example', '<hook>').
 *
 * What it uses: ground parenting (its root rides the ground root), statics (switched off while the
 * ground moves), dynamic crates (frozen, pose kept), a kinematic rover (its sync pauses), an
 * interactable and a light (off while suspended), onSuspend / onResume, a rescue volume under the
 * platform (player rescue, crate reset), ctx.frames.heightAt, ctx.flight, and ctx.robots (an SO-101
 * prefetched, loaded and animated; gated until the Revier is open).
 */
import * as THREE from 'three';
import { defineZone, type DynamicHandle, type KinematicHandle, type RobotClip, type RobotModel, type ZoneContext } from '@/core/zones';
import { STRINGS } from './strings';

/** A wave of the SO-101 (rad): lift the arm, flex the wrist three times, lower it (≈ 3 s). */
const WAVE: RobotClip = {
  duration: 3.2,
  tracks: {
    shoulder_lift: [
      [0, 0],
      [0.6, -1.1],
      [2.6, -1.1],
      [3.2, 0],
    ],
    elbow_flex: [
      [0, 0],
      [0.6, 0.9],
      [2.6, 0.9],
      [3.2, 0],
    ],
    wrist_flex: [
      [0.6, 0],
      [0.93, 0.7],
      [1.27, -0.7],
      [1.6, 0.7],
      [1.93, -0.7],
      [2.27, 0.7],
      [2.6, 0],
    ],
  },
};

const CRATES: [number, number, number][] = [
  [-4, 0.25, 3],
  [-3.2, 0.25, 3.6],
  [-3.6, 0.75, 3.3],
];

// module state is fine: a zone module is instantiated once; reset in dispose()
let crates: DynamicHandle[] = [];
let rover: KinematicHandle | null = null;
let roverT = 0;
let robot: RobotModel | null = null;
let counts = { suspend: 0, resume: 0, enter: 0, exit: 0, rescued: 0 };
/** piloting test (enterOperate({ capture })): what the station saw */
let pilot = { operating: false, exited: false, wFrames: 0, onKey: { KeyW: 0, KeyM: 0 }, look: [0, 0], camFrames: 0 };
let pilotT = 0;

export default defineZone({
  id: '_site-example',
  kind: 'site',
  frame: 'ground',
  title: { de: 'Dev-Gelände', en: 'Dev site' },
  eyebrow: { de: '// DEV · BODENRAHMEN', en: '// DEV · GROUND FRAME' },
  stations: [],
  spawn: { position: [0, 0, 10], yawDeg: 0 },

  async init(ctx) {
    const M = ctx.materials;
    ctx.i18n.register(STRINGS);
    counts = { suspend: 0, resume: 0, enter: 0, exit: 0, rescued: 0 };

    // ── exterior: sign, a shed (static), the far silhouette ───────────────────
    ctx.text3d.sign({ eyebrow: ctx.i18n.text('sign.eyebrow'), title: ctx.i18n.text('sign.title'), body: ctx.i18n.text('sign.body'), width: 3.2, stand: true, position: [3, 0, 8], rotationY: -0.4 }, ctx.groups.exterior);
    ctx.physics.addStaticBox({ size: [4, 2.6, 3], position: [6, 1.3, -4], material: M.metalDark, surface: 'metal' });
    const far = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 3), M.metalDark);
    far.position.set(6, 1.3, -4);
    ctx.groups.far.add(far);

    // ── crates: ground dynamics (frozen while the ground moves) ────────────────
    crates = CRATES.map((p, i) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), M.crate);
      mesh.position.set(p[0], p[1] + ctx.frames.heightAt(0, 0), p[2]);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.name = `_site-example:crate-${i}`;
      ctx.groups.detail.add(mesh);
      return ctx.physics.addDynamic(mesh, { mass: 4, label: ctx.i18n.text('crate'), friction: 0.8 });
    });

    // ── a kinematic rover on a circle (its sync pauses with the ground) ─────────
    const roverMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 1.2), M.standard({ color: 0x3d3a37, roughness: 0.55, metalness: 0.3 }));
    roverMesh.position.set(0, 0.2, -8);
    roverMesh.castShadow = true;
    ctx.groups.detail.add(roverMesh);
    rover = ctx.physics.addKinematic(roverMesh, { shape: 'box' });

    // ── a lamp with an interactable (both off while suspended) ─────────────────
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 10), M.metal);
    post.position.set(-6, 1.2, -2);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10), M.accentTeal);
    head.position.set(-6, 2.5, -2);
    ctx.groups.detail.add(post, head);
    const light = ctx.lights.point([-6, 2.6, -2], { color: 0x99f6e4, intensity: 8, distance: 10 });
    let lampOn = true;
    ctx.addInteractable({
      object: post,
      label: ctx.i18n.text('lamp'),
      hint: ctx.i18n.text('lampHint'),
      onInteract: () => {
        lampOn = !lampOn;
        light.setIntensity(lampOn ? 8 : 0);
        ctx.audio.beep(lampOn ? 880 : 440, 0.06, { at: [-6, 1.5, -2] });
      },
    });

    // ── the safety net under the platform: rescue + reset (plan §5.3 rule 8) ───
    ctx.physics.addRescueVolume({ center: [0, -12, 0], size: [80, 16, 80], player: 'rescue', dynamics: 'reset' });
    ctx.events.on('player:rescue', () => counts.rescued++);

    // ── an SO-101 on a plinth: prefetched, loaded and waving through ctx.robots ─
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.6), M.panel);
    plinth.position.set(2, 0.45, -1);
    plinth.castShadow = true;
    ctx.groups.detail.add(plinth);
    ctx.physics.addStaticFromMesh(plinth, { shape: 'box', surface: 'metal' });
    ctx.robots.prefetch(['so101']);
    void ctx.robots
      .load('so101', { priority: 'route' })
      .then((m) => {
        robot = m;
        m.object.position.set(2, 0.9, -1);
        m.object.rotation.y = Math.PI;
        ctx.groups.detail.add(m.object);
      })
      .catch((err) => console.warn('[_site-example] SO-101 not loaded', err));
    ctx.addInteractable({
      object: plinth,
      label: ctx.i18n.text('robot'),
      onInteract: () => {
        if (robot) ctx.robots.animate(robot, WAVE);
        else ctx.hud.toast(ctx.i18n.text('robotWait'), { kind: 'info' });
      },
    });

    // ── test hooks (tools/frames-check.mjs, tools/robots-adapter-check.mjs) ────
    ctx.debug.register('state', () => ({
      counts: { ...counts },
      crates: crates.map((c) => c.position().toArray()),
      rover: rover ? ctx.toLocal(rover.body.translation()).toArray() : null,
      robot: robot ? { lod: String(robot.shownLod), joints: robot.joints.length } : null,
      robotState: ctx.robots.state('so101'),
      flight: { state: ctx.flight.state, altitude: ctx.flight.altitude, docked: ctx.flight.docked },
      lampOn,
    }));
    // a crate dropped into the net (the rescue volume resets it)
    ctx.debug.register('drop-crate', () => {
      crates[0].setPosition([0, -8, 0]);
      return true;
    });
    ctx.debug.register('wave', () => {
      if (!robot) return false;
      ctx.robots.animate(robot, WAVE);
      return true;
    });
    ctx.debug.register('robot', () => robot);
    // piloting (WP2's spike, WP10): W/A/S/D/M/Space captured, mouse look to the station, a moving head camera
    ctx.debug.register('pilot', () => {
      pilot = { operating: true, exited: false, wFrames: 0, onKey: { KeyW: 0, KeyM: 0 }, look: [0, 0], camFrames: 0 };
      pilotT = 0;
      ctx.player.enterOperate({
        cameraPose: { position: [0, 1.6, 6], lookAt: [0, 1, 0] },
        title: { de: '// DEV · STEUERN', en: '// DEV · PILOT' },
        capture: {
          keys: ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyM', 'Space'],
          onLook: (dx, dy) => {
            pilot.look[0] += dx;
            pilot.look[1] += dy;
          },
          camera: (out) => {
            pilot.camFrames++;
            out.position.set(Math.sin(pilotT) * 2, 1.6, 6);
          },
        },
        onExit: () => {
          pilot.operating = false;
          pilot.exited = true;
        },
      });
      return true;
    });
    ctx.debug.register('pilot-state', () => ({ ...pilot, look: [...pilot.look], onKey: { ...pilot.onKey } }));
    ctx.input.onKey(['KeyW', 'KeyM'], (code) => {
      if (pilot.operating) pilot.onKey[code as 'KeyW' | 'KeyM']++;
    });
    ctx.debug.register('wave-clip', () => WAVE);
  },

  update(dt, ctx) {
    // the rover drives a 6 m circle (kinematic: ctx.physics moves it, the mesh follows)
    roverT += dt * 0.25;
    rover?.setPose([Math.sin(roverT) * 6, 0.2, -8 + Math.cos(roverT) * 2], [0, roverT, 0]);
    if (pilot.operating) {
      pilotT += dt;
      if (ctx.input.isDown('KeyW')) pilot.wFrames++;
    }
  },

  onEnter() {
    counts.enter++;
  },
  onExit() {
    counts.exit++;
  },
  onSuspend(ctx: ZoneContext) {
    counts.suspend++;
    ctx.debug.log('suspended at', ctx.flight.altitude);
  },
  onResume(ctx: ZoneContext) {
    counts.resume++;
    ctx.debug.log('resumed');
  },

  dispose() {
    crates = [];
    rover = null;
    robot = null;
  },
});
