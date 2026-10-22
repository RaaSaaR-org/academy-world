/**
 * „Vorführung“ clips (plan §4.9 [C2 M8]): on approach each plinth robot plays 6–10 s of what it is built
 * for, once per approach, played with ctx.robots.animate (chip „Bewegung animiert“). Joint values are the
 * source models' own (rad, m for prismatic joints), inside their limits; every clip starts and ends in
 * the model's default pose, so a clip that is cut off (the governor, reduced motion: the end pose) leaves
 * the robot as it stands on its plinth.
 *
 * A clip is written as a few key poses (`at` seconds, joint → value); the builder carries values forward
 * and eases between keys (smoothstep, 6 samples), because ctx.robots.animate interpolates linearly.
 */
import type { RobotClip, RobotId } from '@/core/zones';

type Pose = Readonly<Record<string, number>>;
type Key = readonly [at: number, pose: Pose];

/** ease between key poses: linear segments sampled from a smoothstep */
function clip(duration: number, rest: Pose, keys: readonly Key[], samples = 6): RobotClip {
  const joints = new Set<string>();
  for (const [, p] of keys) for (const j of Object.keys(p)) joints.add(j);
  const tracks: Record<string, [number, number][]> = {};
  for (const j of joints) {
    // full key list for this joint: rest at 0 and at the end, values carried forward
    const pts: [number, number][] = [[0, rest[j] ?? 0]];
    let last = rest[j] ?? 0;
    for (const [t, p] of keys) {
      if (j in p) last = p[j];
      pts.push([t, last]);
    }
    pts.push([duration, rest[j] ?? 0]);
    const out: [number, number][] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [t0, v0] = pts[i];
      const [t1, v1] = pts[i + 1];
      if (t1 <= t0) continue;
      for (let s = 0; s < samples; s++) {
        const u = s / samples;
        const e = u * u * (3 - 2 * u);
        out.push([+(t0 + (t1 - t0) * u).toFixed(4), +(v0 + (v1 - v0) * e).toFixed(4)]);
      }
    }
    out.push([duration, rest[j] ?? 0]);
    tracks[j] = out;
  }
  return { duration, loop: false, tracks };
}

// ── shared moves ─────────────────────────────────────────────────────────────

/** Unitree humanoids: look at you, raise the right hand, wave twice, look back (names as in unitree_ros) */
function unitreeWave(o: { head?: string; waist?: string; pitch: number; roll: number; elbow: number; wave: number }): RobotClip {
  const head = o.head;
  const R = { sp: 'right_shoulder_pitch_joint', sr: 'right_shoulder_roll_joint', el: 'right_elbow_joint' };
  const look = head ? { [head]: 0.5 } : o.waist ? { [o.waist]: 0.25 } : {};
  const back = head ? { [head]: 0 } : o.waist ? { [o.waist]: 0 } : {};
  return clip(8, {}, [
    [1.0, { ...look }],
    [2.2, { [R.sp]: o.pitch, [R.sr]: o.roll, [R.el]: o.elbow }],
    [3.0, { [R.sr]: o.roll - o.wave }],
    [3.8, { [R.sr]: o.roll + o.wave * 0.4 }],
    [4.6, { [R.sr]: o.roll - o.wave }],
    [5.4, { [R.sr]: o.roll }],
    [6.6, { [R.sp]: 0, [R.sr]: 0, [R.el]: 0, ...back }],
  ]);
}

/** Go2: shift the weight front – back – side (thigh / hip offsets from the stand pose) */
function go2Shift(rest: Pose): RobotClip {
  const k = (dF: number, dB: number, side: number): Pose => ({
    FL_thigh_joint: 0.9 + dF,
    FR_thigh_joint: 0.9 + dF,
    RL_thigh_joint: 0.9 + dB,
    RR_thigh_joint: 0.9 + dB,
    FL_calf_joint: -1.8 - dF * 1.4,
    FR_calf_joint: -1.8 - dF * 1.4,
    RL_calf_joint: -1.8 - dB * 1.4,
    RR_calf_joint: -1.8 - dB * 1.4,
    FL_hip_joint: side,
    FR_hip_joint: side,
    RL_hip_joint: side,
    RR_hip_joint: side,
  });
  return clip(7, rest, [
    [1.4, k(0.25, -0.1, 0)],
    [2.8, k(-0.1, 0.3, 0)],
    [4.2, k(0.05, 0.05, 0.18)],
    [5.4, k(0.05, 0.05, -0.18)],
    [6.4, k(0, 0, 0)],
  ]);
}

const GO2_REST: Pose = { FL_hip_joint: 0, FL_thigh_joint: 0.9, FL_calf_joint: -1.8, FR_hip_joint: 0, FR_thigh_joint: 0.9, FR_calf_joint: -1.8, RL_hip_joint: 0, RL_thigh_joint: 0.9, RL_calf_joint: -1.8, RR_hip_joint: 0, RR_thigh_joint: 0.9, RR_calf_joint: -1.8 };
const SPOT_REST: Pose = { fl_hx: 0, fl_hy: 1.04, fl_kn: -1.8, fr_hx: 0, fr_hy: 1.04, fr_kn: -1.8, hl_hx: 0, hl_hy: 1.04, hl_kn: -1.8, hr_hx: 0, hr_hy: 1.04, hr_kn: -1.8 };
const UR_REST: Pose = { shoulder_pan_joint: -1.5708, shoulder_lift_joint: -1.5708, elbow_joint: 1.5708, wrist_1_joint: -1.5708, wrist_2_joint: -1.5708, wrist_3_joint: 0 };
const FR3_REST: Pose = { fr3_joint1: 0, fr3_joint2: 0, fr3_joint3: 0, fr3_joint4: -1.57079, fr3_joint5: 0, fr3_joint6: 1.57079, fr3_joint7: -0.7853 };
const IIWA_REST: Pose = { joint1: 0, joint2: 0.785398, joint3: 0, joint4: -1.5708, joint5: 0, joint6: 0, joint7: 0 };

/** fingers of the Shadow Hand: J3 (base) J2 J1 (tips), the little finger also J5 */
const finger = (f: 'FF' | 'MF' | 'RF' | 'LF', bend: number): Pose => ({ [`rh_${f}J3`]: bend, [`rh_${f}J2`]: bend, [`rh_${f}J1`]: bend * 0.8 });
const thumb = (bend: number): Pose => ({ rh_THJ4: bend * 1.1, rh_THJ1: bend, rh_THJ2: bend * 0.4 });
const fist = (b: number): Pose => ({ ...finger('FF', b), ...finger('MF', b), ...finger('RF', b), ...finger('LF', b), ...thumb(b * 0.9) });

export const CLIPS: Partial<Record<RobotId, RobotClip>> = {
  // ── GEHEN ──
  'unitree-r1': unitreeWave({ head: 'head_yaw_joint', pitch: -2.4, roll: -0.35, elbow: 0.55, wave: 0.35 }),
  'unitree-g1': unitreeWave({ waist: 'waist_yaw_joint', pitch: -2.4, roll: -0.35, elbow: 0.55, wave: 0.35 }),
  'unitree-h1-2': unitreeWave({ waist: 'torso_joint', pitch: -2.4, roll: -0.35, elbow: 0.55, wave: 0.35 }),
  'unitree-h2': unitreeWave({ head: 'head_yaw_joint', pitch: -2.4, roll: -0.35, elbow: 0.55, wave: 0.35 }),
  'apptronik-apollo': clip(
    8,
    { l_shoulder_aa: 0.2, l_shoulder_fe: 0.1, l_elbow_fe: -0.4, r_shoulder_aa: -0.2, r_shoulder_fe: 0.1, r_elbow_fe: -0.4, neck_yaw: 0 },
    [
      [1.0, { neck_yaw: 0.6 }],
      [2.2, { r_shoulder_fe: -2.0, r_shoulder_aa: -0.5, r_elbow_fe: -0.6 }],
      [3.0, { r_shoulder_aa: -0.9 }],
      [3.8, { r_shoulder_aa: -0.4 }],
      [4.6, { r_shoulder_aa: -0.9 }],
      [5.4, { r_shoulder_aa: -0.5 }],
      [6.6, { r_shoulder_fe: 0.1, r_shoulder_aa: -0.2, r_elbow_fe: -0.4, neck_yaw: 0 }],
    ],
  ),
  'pal-talos': clip(8, {}, [
    [1.0, { head_2_joint: 0.5 }],
    [2.2, { arm_left_1_joint: -1.2, arm_left_2_joint: 1.4, arm_left_4_joint: -1.6 }],
    [3.0, { arm_left_2_joint: 1.9 }],
    [3.8, { arm_left_2_joint: 1.3 }],
    [4.6, { arm_left_2_joint: 1.9 }],
    [5.4, { arm_left_2_joint: 1.4 }],
    [6.6, { arm_left_1_joint: 0, arm_left_2_joint: 0, arm_left_4_joint: 0, head_2_joint: 0 }],
  ]),
  'unitree-go2': go2Shift(GO2_REST),
  // Spot sits and stands (the hind legs fold under), then looks around with its body
  spot: clip(8, SPOT_REST, [
    [1.6, { hl_hy: 1.9, hl_kn: -2.6, hr_hy: 1.9, hr_kn: -2.6, fl_hy: 0.85, fr_hy: 0.85 }],
    [4.2, { hl_hy: 1.9, hl_kn: -2.6, hr_hy: 1.9, hr_kn: -2.6 }],
    [5.6, { ...SPOT_REST }],
    [6.4, { fl_hx: 0.15, fr_hx: 0.15, hl_hx: 0.15, hr_hx: 0.15 }],
    [7.2, { fl_hx: -0.15, fr_hx: -0.15, hl_hx: -0.15, hr_hx: -0.15 }],
  ]),
  // ANYmal D shifts its weight and turns its inspection head (pan – tilt)
  'anymal-d': clip(8, {}, [
    [1.4, { LF_HFE: 0.25, RF_HFE: 0.25, LF_KFE: -0.4, RF_KFE: -0.4 }],
    [2.8, { LF_HFE: 0, RF_HFE: 0, LF_KFE: 0, RF_KFE: 0, LH_HFE: -0.25, RH_HFE: -0.25, LH_KFE: 0.4, RH_KFE: 0.4 }],
    [4.0, { LH_HFE: 0, RH_HFE: 0, LH_KFE: 0, RH_KFE: 0, inspection_payload_mount_to_pan: 1.2 }],
    [5.4, { inspection_payload_mount_to_pan: -1.2, inspection_payload_pan_to_tilt: 0.5 }],
    [6.8, { inspection_payload_mount_to_pan: 0, inspection_payload_pan_to_tilt: 0 }],
  ]),
  // ── GREIFEN & FAHREN ──
  // the cobots pick an invisible part: reach, close, lift, place on the other side
  ur5e: clip(8, UR_REST, [
    [1.6, { shoulder_pan_joint: -1.0, shoulder_lift_joint: -1.1, elbow_joint: 1.9, wrist_1_joint: -2.4 }],
    [2.6, { shoulder_lift_joint: -0.85, elbow_joint: 1.8 }],
    [3.6, { shoulder_lift_joint: -1.3, elbow_joint: 1.6 }],
    [5.0, { shoulder_pan_joint: -2.1, wrist_3_joint: 1.2 }],
    [5.8, { shoulder_lift_joint: -1.0, elbow_joint: 1.85 }],
    [6.8, { shoulder_lift_joint: -1.5708, elbow_joint: 1.5708, wrist_1_joint: -1.5708, wrist_3_joint: 0 }],
  ]),
  'franka-fr3': clip(8, FR3_REST, [
    [1.6, { fr3_joint1: 0.5, fr3_joint2: 0.5, fr3_joint4: -2.1, fr3_joint6: 2.4 }],
    [2.6, { fr3_joint2: 0.7, fr3_joint4: -1.9 }],
    [3.6, { fr3_joint2: 0.3, fr3_joint4: -2.2 }],
    [5.0, { fr3_joint1: -0.5, fr3_joint7: 0.6 }],
    [5.8, { fr3_joint2: 0.6, fr3_joint4: -1.95 }],
    [6.8, { fr3_joint2: 0, fr3_joint4: -1.57079, fr3_joint6: 1.57079, fr3_joint7: -0.7853, fr3_joint1: 0 }],
  ]),
  'kuka-iiwa-14': clip(8, IIWA_REST, [
    [1.6, { joint1: 0.6, joint2: 1.05, joint4: -1.2, joint6: 0.8 }],
    [2.6, { joint2: 1.2 }],
    [3.6, { joint2: 0.9 }],
    [5.0, { joint1: -0.6, joint7: 1.0 }],
    [5.8, { joint2: 1.15 }],
    [6.8, { joint1: 0, joint2: 0.785398, joint4: -1.5708, joint6: 0, joint7: 0 }],
  ]),
  // the FANUC sweeps its workspace (a spot-welding line, slow and wide)
  'fanuc-r2000ic-165f': clip(10, {}, [
    [2.0, { J1: -0.6, J2: 0.25, J3: -0.25, J5: -0.5 }],
    [4.5, { J1: 0.6, J4: 1.2 }],
    [6.5, { J1: 0.2, J2: 0.45, J3: -0.55, J5: -1.0 }],
    [8.2, { J1: 0, J2: 0, J3: 0, J4: 0, J5: 0 }],
  ]),
  // the Shadow Hand counts to five: fist, then thumb, index, middle, ring, little finger one by one
  'shadow-hand': clip(8, {}, [
    [0.9, fist(1.45)],
    [1.6, fist(1.45)],
    [2.4, thumb(0)],
    [3.2, finger('FF', 0)],
    [4.0, finger('MF', 0)],
    [4.8, finger('RF', 0)],
    [5.6, { ...finger('LF', 0), rh_WRJ1: 0.25 }],
    [6.8, { rh_WRJ1: 0 }],
  ]),
  // the 2F-85 opens and closes (the right finger follows the driver as a mimic joint)
  'robotiq-2f85': clip(6, {}, [
    [1.0, { left_driver_joint: 0.8 }],
    [2.0, { left_driver_joint: 0.0 }],
    [3.0, { left_driver_joint: 0.8 }],
    [4.2, { left_driver_joint: 0.35 }],
    [5.2, { left_driver_joint: 0.0 }],
  ]),
  // Stretch 3 lifts its column and stretches the telescopic arm (the arm segments follow l3)
  'stretch-3': clip(9, {}, [
    [2.0, { joint_lift: 0.9, joint_head_pan: -0.6 }],
    [3.6, { joint_arm_l3: 0.12, joint_wrist_yaw: 1.2 }],
    [5.0, { joint_wrist_yaw: 0, joint_head_tilt: -0.5 }],
    [6.4, { joint_arm_l3: 0, joint_head_tilt: 0, joint_head_pan: 0 }],
    [8.0, { joint_lift: 0 }],
  ]),
  'pal-tiago': clip(9, {}, [
    [2.0, { torso_lift_joint: 0.33, head_1_joint: 0.5 }],
    [3.4, { arm_1_joint: 1.6, arm_2_joint: -0.6, arm_4_joint: 1.6 }],
    [4.4, { arm_5_joint: 1.0, gripper_right_finger_joint: 0.04, gripper_left_finger_joint: 0.04 }],
    [5.4, { arm_5_joint: -1.0, gripper_right_finger_joint: 0.0, gripper_left_finger_joint: 0.0 }],
    [6.8, { arm_1_joint: 0, arm_2_joint: 0, arm_4_joint: 0, arm_5_joint: 0, head_1_joint: 0 }],
    [8.2, { torso_lift_joint: 0 }],
  ]),
  // the MiR250 drives: its wheels turn (the hall's turntable carries it)
  mir250: clip(7, {}, [
    [3.0, { left_wheel_joint: 14, right_wheel_joint: 14, fl_caster_wheel_joint: 20, fr_caster_wheel_joint: 20, bl_caster_wheel_joint: 20, br_caster_wheel_joint: 20 }],
    [6.0, { left_wheel_joint: 28, right_wheel_joint: 28, fl_caster_wheel_joint: 40, fr_caster_wheel_joint: 40, bl_caster_wheel_joint: 40, br_caster_wheel_joint: 40 }],
  ]),
  // ── SELBST BAUEN ──
  so101: clip(8, {}, [
    [1.4, { shoulder_pan: 0.5, shoulder_lift: -0.5, elbow_flex: 0.6, wrist_flex: 0.7, gripper: 1.2 }],
    [2.4, { shoulder_lift: -0.2, elbow_flex: 0.3 }],
    [3.0, { gripper: 0.1 }],
    [4.0, { shoulder_lift: -0.8, elbow_flex: 0.9 }],
    [5.4, { shoulder_pan: -0.6 }],
    [6.0, { gripper: 1.1 }],
    [7.0, { shoulder_pan: 0, shoulder_lift: 0, elbow_flex: 0, wrist_flex: 0, gripper: 0 }],
  ]),
  // the Open Duck looks around: neck, head, antennas, a little knee bob
  'open-duck-mini-v2': clip(7, {}, [
    [1.0, { head_yaw: 0.7, left_antenna: 0.6, right_antenna: -0.6 }],
    [2.0, { head_yaw: -0.7, left_antenna: -0.6, right_antenna: 0.6, neck_pitch: 0.3 }],
    [3.0, { head_yaw: 0, head_pitch: 0.4, left_antenna: 0, right_antenna: 0 }],
    [4.0, { left_knee: 0.35, right_knee: -0.35, left_hip_pitch: -0.2, right_hip_pitch: 0.2, head_pitch: -0.2 }],
    [5.0, { left_knee: 0, right_knee: 0, left_hip_pitch: 0, right_hip_pitch: 0, neck_pitch: 0, head_pitch: 0 }],
  ]),
  'lekiwi-base': clip(7, {}, [
    [3.0, { base_left_wheel: 10, base_right_wheel: -10, base_back_wheel: 6 }],
    [6.0, { base_left_wheel: 0, base_right_wheel: 0, base_back_wheel: 0 }],
  ]),
};

/** The SO-101 on top of LeKiwi waves while the base turns its wheels. */
export const LEKIWI_ARM_CLIP: RobotClip = clip(7, {}, [
  [1.2, { shoulder_lift: -0.9, elbow_flex: 0.9, wrist_flex: -0.4 }],
  [2.0, { shoulder_pan: 0.5 }],
  [2.8, { shoulder_pan: -0.5 }],
  [3.6, { shoulder_pan: 0.5, gripper: 1.0 }],
  [4.6, { shoulder_pan: 0, gripper: 0 }],
  [5.8, { shoulder_lift: 0, elbow_flex: 0, wrist_flex: 0 }],
]);
