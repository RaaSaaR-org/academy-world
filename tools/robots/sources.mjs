// The robot line-up: one entry per shipped GLB. Sources are pinned in repos.mjs; licence texts are
// copied verbatim from the checkouts (LICENSE_TEXTS). Research: docs/research/R1 (SO-101), R2 (Open
// Duck), R3 (Unitree), R4 (showroom line-up, licences, LOD plan), R7 (pipeline).
//
// Per robot:
//   repo / entry / format     description file inside the pinned checkout (urdf: also .xacro; mjcf)
//   lod                       triangle targets (LOD0, LOD1, silhouette) and the smallest error (m)
//   yawDeg                    extra turn about +Y so the robot's front faces +Z
//   defaultPose               MJCF keyframe name or { joint: value }: the pose it stands in (floor, silhouette)
//   exclude                   regexes on mesh path / link: hidden internals that are never seen
//   visual                    MJCF: which geoms are drawn (default: Menagerie's group 2 / non-colliding)
//   ik                        arm chains for RobotModel.solveIK (base → tip joints, tip link)
//   flags.amber               licence is permissive but the licensor is not the vendor (R4 §4)
//   flags.legalReviewBeforeRelease, flags.noLogoElsewhere   see R3 §2.2, R4 §6, R2 §9
//   disclaimer                a line the notices print under the model's attribution (BSD-3 clause 3:
//                             Unitree, docs/LEGAL-REVIEW.md items 0 and 3)

const HUMANOID = { lod0: 40000, lod1: 18000, l2: 3000, minErr: 0.0002 };
const QUADRUPED = { lod0: 36000, lod1: 15000, l2: 3000, minErr: 0.0002 };
const ARM = { lod0: 30000, lod1: 12000, l2: 2000, minErr: 0.0002 };
const DESK = { lod0: 25000, lod1: 10000, l2: 2000, minErr: 0.0001 };
const HAND = { lod0: 25000, lod1: 10000, l2: 1500, minErr: 0.0001 };
const GRIPPER = { lod0: 15000, lod1: 6000, l2: 1000, minErr: 0.0001 };
const MOBILE = { lod0: 40000, lod1: 16000, l2: 3000, minErr: 0.0002 };
const AMR = { lod0: 25000, lod1: 10000, l2: 2000, minErr: 0.0002 };

// D32 (DECISIONS): SO-101 printed parts white, servos black, the moving part (follower jaw, leader
// trigger) orange. D29: the duck in neutral white and greys, no amber accent.
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, 1];
const PRINT_WHITE = hexRgb('#f5f5f4');
const SERVO_BLACK = hexRgb('#1a1a1a');
const SIGNAL_ORANGE = hexRgb('#ff6700');
const so101Colours = (moving) => (c, { link }) => {
  const printed = c[0] > 0.9 && c[1] > 0.7 && c[2] < 0.3; // the URDF's yellow #FFD11F
  if (!printed) return SERVO_BLACK;
  return link === moving ? SIGNAL_ORANGE : PRINT_WHITE;
};
/** Saturated colours → the grey of the same luminance (sRGB in, sRGB out). */
const neutral = (c) => {
  const max = Math.max(c[0], c[1], c[2]);
  const min = Math.min(c[0], c[1], c[2]);
  if (max - min < 0.12) return c;
  const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const g = Math.min(0.92, Math.max(0.25, y));
  return [g, g, g, c[3] ?? 1];
};

/**
 * Download caps (plan §5.6, D31): `set` decides which apply.
 *  playable: ≤ 350 KB; exhibit: LOD0 ≤ 25 k (humanoid exhibits ≤ 30 k), ≤ 150 KB (humanoid exhibits
 *  ≤ 250 KB); extra (not in the MUST build): ≤ 350 KB. The MUST set (playable + exhibit + the line-up)
 *  stays ≤ 4.0 MB. build.mjs lowers a robot's triangle targets until its file fits its cap.
 */
export const CAPS = { fileKB: 350, mustTotalMB: 4.0, silhouetteKB: 30, lineupKB: 200, exhibitKB: 150, humanoidExhibitKB: 250, exhibitLod0: 25000, humanoidExhibitLod0: 30000, areaMB: 1.2 };
/** The one documented exception (plan §5.6): the Apollo, only if a visual check shows holes at 350 KB. */
export const EXCEPTIONS = {
  'apptronik-apollo': {
    fileKB: 350,
    lod0: 45000,
    reason: 'Apollo’s own cap is 350 KB (plan §5.6); its 1.55 M source triangles are cracked, pre-decimated meshes (≈ 50 k open edges in the torso). With crack repair (1 mm weld, no component pruning) it fits 350 KB at 45 k triangles; at the 30 k humanoid-exhibit target the shells break into shards (gallery check), so LOD0 keeps 45 k',
  },
};
/** Robots loaded together on approach to one area (≤ 1.2 MB). */
export const AREAS = { traumhangar: ['unitree-r1', 'unitree-g1', 'unitree-h1-2', 'unitree-h2'] };

/** Licence texts shipped in LICENSES/robots/ (verbatim copies). */
export const LICENSE_TEXTS = {
  'Apache-2.0.txt': 'so-arm100:LICENSE',
  'BSD-3-Clause-Unitree.txt': 'unitree-ros:LICENSE',
  'BSD-3-Clause-Unitree-Go2-Menagerie.txt': 'menagerie:unitree_go2/LICENSE',
  'BSD-3-Clause-ANYbotics.txt': 'anymal-d:LICENSE',
  'BSD-3-Clause-UR5e-ROS-Industrial.txt': 'menagerie:universal_robots_ur5e/LICENSE',
  'LICENSE-franka_fr3-Menagerie.txt': 'menagerie:franka_fr3/LICENSE',
  'NOTICE-franka_description.txt': 'franka-description:NOTICE',
  'BSD-3-Clause-Spot-Clearpath.txt': 'menagerie:boston_dynamics_spot/LICENSE',
  'MIT-BSD-3-Clause-spot_description-RAI.txt': 'spot-description:LICENSE',
  'BSD-3-Clause-Drake-iiwa14.txt': 'menagerie:kuka_iiwa_14/LICENSE',
  'BSD-2-Clause-Robotiq-2F-85-ROS-Industrial.txt': 'menagerie:robotiq_2f85/LICENSE',
  'BSD-3-Clause-mir_robot-DFKI.txt': 'mir:LICENSE',
};

const UNITREE = {
  spdx: 'BSD-3-Clause',
  texts: ['BSD-3-Clause-Unitree.txt'],
  copyright: ['Copyright (c) 2016-2022 HangZhou YuShu TECHNOLOGY CO.,LTD. ("Unitree Robotics")'],
};
/** BSD-3 clause 3 (no endorsement), stated for every Unitree model (docs/LEGAL-REVIEW.md items 0 and 3). */
export const UNITREE_NO_ENDORSEMENT = {
  de: 'Keine Verbindung zu Unitree Robotics und keine Empfehlung durch Unitree Robotics.',
  en: 'No affiliation with or endorsement by Unitree Robotics.',
};
const unitreeAttr = (name) => ({
  de: `${name}: 3D-Modell von Unitree Robotics (unitree_ros), BSD-3-Clause; von EmAI nach glTF konvertiert und vereinfacht.`,
  en: `${name}: 3D model by Unitree Robotics (unitree_ros), BSD-3-Clause; converted to glTF and simplified by EmAI.`,
});
const menagerie = (folder) => `https://github.com/google-deepmind/mujoco_menagerie/tree/62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35/${folder}`;

export const ROBOTS = [
  // ── game robots ──
  {
    id: 'so101',
    name: { de: 'SO-101 (Folgearm)', en: 'SO-101 (follower arm)' },
    vendor: 'TheRobotStudio · Hugging Face',
    category: 'arm',
    use: ['game', 'showroom'],
    repo: 'so-arm100',
    entry: 'Simulation/SO101/so101_new_calib.urdf',
    format: 'urdf',
    lineup: true,
    license: { spdx: 'Apache-2.0', texts: ['Apache-2.0.txt'], copyright: ['TheRobotStudio and the SO-ARM100 contributors (in collaboration with Hugging Face)'] },
    attribution: {
      de: 'SO-101: 3D-Modell von TheRobotStudio und den Mitwirkenden von SO-ARM100 (mit Hugging Face), Apache-2.0; von EmAI nach glTF konvertiert und vereinfacht.',
      en: 'SO-101: 3D model by TheRobotStudio and the SO-ARM100 contributors (with Hugging Face), Apache-2.0; converted to glTF and simplified by EmAI.',
    },
    set: 'playable',
    lod: { ...DESK, lod2: 2000 },
    recolor: so101Colours('moving_jaw_so101_v1_link'),
    yawDeg: 0,
    demoJoint: 'elbow_flex',
    ik: [{ name: 'arm', joints: ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll'], tip: 'gripper_frame_link' }],
    colours: 'URDF colours: printed parts yellow #FFD11F, STS3215 servos #1A1A1A. The real print colour is the builder’s choice (R1 Q3).',
    flags: {},
  },
  {
    id: 'so101-leader',
    name: { de: 'SO-101 (Leitarm)', en: 'SO-101 (leader arm)' },
    vendor: 'TheRobotStudio · Hugging Face',
    category: 'arm',
    use: ['game'],
    repo: 'so-arm100',
    entry: 'Simulation/SO101/so101_leader_new_calib.urdf',
    format: 'urdf',
    license: { spdx: 'Apache-2.0', texts: ['Apache-2.0.txt'], copyright: ['TheRobotStudio and the SO-ARM100 contributors (in collaboration with Hugging Face)'] },
    attribution: {
      de: 'SO-101-Leitarm: 3D-Modell von TheRobotStudio und den Mitwirkenden von SO-ARM100 (mit Hugging Face), Apache-2.0; von EmAI nach glTF konvertiert und vereinfacht.',
      en: 'SO-101 leader arm: 3D model by TheRobotStudio and the SO-ARM100 contributors (with Hugging Face), Apache-2.0; converted to glTF and simplified by EmAI.',
    },
    set: 'playable',
    lod: DESK,
    recolor: so101Colours('trigger_link'),
    yawDeg: 0,
    demoJoint: 'elbow_flex',
    ik: [{ name: 'arm', joints: ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll'], tip: 'gripper_link' }],
    colours: 'URDF colours as the follower. The trigger limits are provisional in the source ("derived from CAD geometry", R1 §2.2).',
    flags: {},
  },
  {
    id: 'open-duck-mini-v2',
    name: { de: 'Open Duck Mini v2', en: 'Open Duck Mini v2' },
    vendor: 'Antoine Pirrone · Open Duck community',
    category: 'biped',
    use: ['game', 'showroom'],
    repo: 'open-duck-mini',
    entry: 'mini_bdx/robots/open_duck_mini_v2/robot.urdf',
    format: 'urdf',
    lineup: true,
    license: { spdx: 'Apache-2.0', texts: ['Apache-2.0.txt'], copyright: ['Antoine Pirrone and the Open Duck Mini contributors'] },
    attribution: {
      de: 'Open Duck Mini v2: 3D-Modell von Antoine Pirrone und den Mitwirkenden des Open-Duck-Projekts, Apache-2.0; von EmAI nach glTF konvertiert und vereinfacht, innenliegende Elektronik entfernt.',
      en: 'Open Duck Mini v2: 3D model by Antoine Pirrone and the Open Duck contributors, Apache-2.0; converted to glTF and simplified by EmAI, internal electronics removed.',
    },
    // LOD1 also clusters topology-free: it merges the many small separate parts (R7 §3 step 4)
    set: 'playable',
    lod: { lod0: 40000, lod1: 15000, lod2: 1500, l2: 3000, minErr: 0.0001, sloppyLod1: true },
    recolor: neutral,
    yawDeg: 0,
    // electronics inside the closed trunk (R7 §5, R2 §4.2); the shells stay
    exclude: [/raspberrypizerow/, /bms\.stl/, /cell\.stl/, /bno055/, /board\.stl/, /usb_c_charger/, /(^|\/)holder\.stl/],
    // the 14 servo housings were 49 % of LOD0 at one error: allow twice the error there (R7)
    partErrScale: [{ match: /wj-wk00-012[24]/, scale: 2 }],
    demoJoint: 'left_knee',
    colours: 'CAD colours from the URDF: white shells, greys, dark parts, orange accent.',
    flags: { legalReviewBeforeRelease: true },
    legalNote: 'The README calls it "a miniature version of the BDX Droid by Disney": never name Disney, BDX or Star Wars; legal check of the design before public release (R2 §9, R7 §12).',
  },
  {
    id: 'unitree-r1',
    name: { de: 'Unitree R1', en: 'Unitree R1' },
    vendor: 'Unitree Robotics',
    disclaimer: UNITREE_NO_ENDORSEMENT,
    category: 'humanoid',
    use: ['game', 'showroom'],
    repo: 'unitree-ros',
    entry: 'robots/r1_description/R1.urdf',
    format: 'urdf',
    lineup: true,
    license: UNITREE,
    attribution: unitreeAttr('Unitree R1'),
    set: 'playable',
    lod: { ...HUMANOID, lod2: 3000 },
    demoJoint: 'left_elbow_joint',
    colours: 'URDF colours (display colours, not verified paint).',
    flags: { noLogoElsewhere: true },
    legalNote: 'Parallel ankle linkage: the push rods follow only approximately when the ankles move (closed loop).',
  },
  {
    id: 'unitree-g1',
    name: { de: 'Unitree G1', en: 'Unitree G1' },
    vendor: 'Unitree Robotics',
    disclaimer: UNITREE_NO_ENDORSEMENT,
    category: 'humanoid',
    use: ['game', 'showroom'],
    repo: 'unitree-ros',
    entry: 'robots/g1_description/g1_29dof_rev_1_0.urdf',
    format: 'urdf',
    lineup: true,
    license: UNITREE,
    attribution: unitreeAttr('Unitree G1'),
    set: 'playable',
    lod: { ...HUMANOID, lod2: 3000 },
    demoJoint: 'left_elbow_joint',
    ik: [
      { name: 'left_arm', joints: ['left_shoulder_pitch_joint', 'left_shoulder_roll_joint', 'left_shoulder_yaw_joint', 'left_elbow_joint', 'left_wrist_roll_joint', 'left_wrist_pitch_joint', 'left_wrist_yaw_joint'], tip: 'left_rubber_hand' },
      { name: 'right_arm', joints: ['right_shoulder_pitch_joint', 'right_shoulder_roll_joint', 'right_shoulder_yaw_joint', 'right_elbow_joint', 'right_wrist_roll_joint', 'right_wrist_pitch_joint', 'right_wrist_yaw_joint'], tip: 'right_rubber_hand' },
    ],
    colours: 'URDF colours: two greys (0.2 and 0.7). The torso mesh carries raised “UNITREE” lettering (part of the real object).',
    flags: { noLogoElsewhere: true },
  },
  {
    id: 'unitree-g1-dex3',
    name: { de: 'Unitree G1 mit Dex3-1-Händen', en: 'Unitree G1 with Dex3-1 hands' },
    vendor: 'Unitree Robotics',
    disclaimer: UNITREE_NO_ENDORSEMENT,
    category: 'humanoid',
    use: ['game', 'showroom'],
    repo: 'unitree-ros',
    entry: 'robots/g1_description/g1_29dof_with_hand_rev_1_0.urdf',
    format: 'urdf',
    license: UNITREE,
    attribution: unitreeAttr('Unitree G1 (Dex3-1)'),
    set: 'extra',
    lod: HUMANOID,
    demoJoint: 'left_hand_index_0_joint',
    colours: 'URDF colours as the G1; Dex3-1 three-finger hands are Unitree’s own (R3 §2.2).',
    flags: { noLogoElsewhere: true },
  },
  {
    id: 'unitree-h1',
    name: { de: 'Unitree H1', en: 'Unitree H1' },
    vendor: 'Unitree Robotics',
    disclaimer: UNITREE_NO_ENDORSEMENT,
    category: 'humanoid',
    use: ['game', 'showroom'],
    repo: 'unitree-ros',
    entry: 'robots/h1_description/urdf/h1.urdf',
    format: 'urdf',
    license: UNITREE,
    attribution: unitreeAttr('Unitree H1'),
    set: 'extra',
    lod: HUMANOID,
    demoJoint: 'left_elbow_joint',
    colours: 'URDF colours (display colours).',
    flags: { noLogoElsewhere: true },
  },
  {
    id: 'unitree-h1-2',
    name: { de: 'Unitree H1-2', en: 'Unitree H1-2' },
    vendor: 'Unitree Robotics',
    disclaimer: UNITREE_NO_ENDORSEMENT,
    category: 'humanoid',
    use: ['game', 'showroom'],
    repo: 'unitree-ros',
    entry: 'robots/h1_2_description/h1_2_handless.urdf',
    format: 'urdf',
    lineup: true,
    license: UNITREE,
    attribution: unitreeAttr('Unitree H1-2'),
    set: 'playable',
    lod: { ...HUMANOID, lod2: 3000 },
    demoJoint: 'left_elbow_joint',
    colours: 'URDF colours; the handless variant (no third-party hands).',
    flags: { noLogoElsewhere: true },
  },
  {
    id: 'unitree-h2',
    name: { de: 'Unitree H2', en: 'Unitree H2' },
    vendor: 'Unitree Robotics',
    disclaimer: UNITREE_NO_ENDORSEMENT,
    category: 'humanoid',
    use: ['game', 'showroom'],
    repo: 'unitree-ros',
    entry: 'robots/h2_description/H2_dae.urdf',
    format: 'urdf',
    lineup: true,
    license: UNITREE,
    attribution: unitreeAttr('Unitree H2'),
    set: 'playable',
    lod: { ...HUMANOID, lod2: 3000 },
    demoJoint: 'left_elbow_joint',
    colours: 'Per-material colours from the COLLADA files of H2_dae.urdf (black face plate, white shell).',
    flags: { noLogoElsewhere: true },
  },
  {
    id: 'unitree-go2',
    name: { de: 'Unitree Go2', en: 'Unitree Go2' },
    vendor: 'Unitree Robotics',
    disclaimer: UNITREE_NO_ENDORSEMENT,
    category: 'quadruped',
    use: ['game', 'showroom'],
    repo: 'menagerie',
    entry: 'unitree_go2/go2.xml',
    format: 'mjcf',
    lineup: true,
    sourceUrl: menagerie('unitree_go2'),
    license: { spdx: 'BSD-3-Clause', texts: ['BSD-3-Clause-Unitree-Go2-Menagerie.txt'], copyright: ['Copyright (c) 2016-2022 HangZhou YuShu TECHNOLOGY CO.,LTD. ("Unitree Robotics")'] },
    attribution: {
      de: 'Unitree Go2: 3D-Modell von Unitree Robotics über MuJoCo Menagerie, BSD-3-Clause; von EmAI nach glTF konvertiert und vereinfacht.',
      en: 'Unitree Go2: 3D model by Unitree Robotics via MuJoCo Menagerie, BSD-3-Clause; converted to glTF and simplified by EmAI.',
    },
    set: 'exhibit',
    lod: { ...QUADRUPED, lod0: Math.min(QUADRUPED.lod0, CAPS.exhibitLod0) },
    defaultPose: 'home',
    demoJoint: 'FL_calf_joint',
    colours: 'MJCF materials of the Menagerie model.',
    flags: { noLogoElsewhere: true },
  },

  {
    id: 'lekiwi-base',
    name: { de: 'LeKiwi (Fahrbasis)', en: 'LeKiwi (mobile base)' },
    vendor: 'SIGRobotics-UIUC · LeRobot community',
    category: 'amr',
    use: ['game', 'showroom'],
    set: 'playable',
    repo: 'lekiwi',
    entry: 'URDF/LeKiwi.urdf',
    format: 'urdf',
    lineup: true,
    // R5: the base only; the arm on top is the SO-101 (its own GLB), mounted at the SO-100 base frame
    pruneBelow: ['Base_08q-v1'],
    mounts: { arm: 'Base_08q-v1' },
    license: {
      spdx: 'Apache-2.0',
      texts: ['Apache-2.0.txt'],
      copyright: ['LeKiwi authors: Pepijn Kooijmans, Manav Chandaka, Bhargav Chandaka, Gloria Wang, Advait Patel (SIGRobotics-UIUC; CITATION.cff)'],
    },
    attribution: {
      de: 'LeKiwi: 3D-Modell von SIGRobotics-UIUC (Pepijn Kooijmans, Manav Chandaka, Bhargav Chandaka, Gloria Wang, Advait Patel), Apache-2.0; von EmAI nach glTF konvertiert und vereinfacht, nur die Fahrbasis.',
      en: 'LeKiwi: 3D model by SIGRobotics-UIUC (Pepijn Kooijmans, Manav Chandaka, Bhargav Chandaka, Gloria Wang, Advait Patel), Apache-2.0; converted to glTF and simplified by EmAI, mobile base only.',
    },
    // ≤ 120 KB (plan R5); the 94868A713 standoffs are McMaster-Carr catalogue CAD: left out
    lod: { lod0: 18000, lod1: 7000, l2: 1500, minErr: 0.0001 },
    maxKB: 120,
    exclude: [/94868A713/],
    // the URDF has no colours: printed parts as D32's white, servos / battery / camera black, wheels dark grey
    recolor: (_c, { file }) => (/Servo|Battery|Camera-Model/i.test(file) ? SERVO_BLACK : /Omni-Directional-Wheel/i.test(file) ? hexRgb('#3a3a3a') : PRINT_WHITE),
    demoJoint: 'base_left_wheel',
    colours: 'No colours in the source URDF: printed parts white (as D32), ST3215 servos, battery and camera black, omni wheels dark grey.',
    flags: { legalReviewBeforeRelease: true },
    legalNote: 'Licence gate (R5): Apache-2.0 at repo level (LICENSE.txt, CITATION.cff), no other terms in the README, BOM or mesh folders: green. Vendor part models inside the URDF (Feetech ST3215 servos, omni wheels, battery, USB camera) have undocumented provenance, as the SO-101 servos (check with the duck). McMaster-Carr standoffs (94868A713) are left out.',
  },

  // ── showroom, green ──
  {
    id: 'anymal-d',
    name: { de: 'ANYmal D', en: 'ANYmal D' },
    vendor: 'ANYbotics',
    category: 'quadruped',
    use: ['showroom'],
    repo: 'anymal-d',
    entry: 'urdf/anymal.urdf',
    format: 'urdf',
    lineup: true,
    license: { spdx: 'BSD-3-Clause', texts: ['BSD-3-Clause-ANYbotics.txt'], copyright: ['Copyright 2023, ANYbotics AG.'] },
    attribution: {
      de: 'ANYmal D: 3D-Modell von ANYbotics (anymal_d_simple_description), BSD-3-Clause; von EmAI nach glTF konvertiert, Texturen in Vertexfarben gebacken.',
      en: 'ANYmal D: 3D model by ANYbotics (anymal_d_simple_description), BSD-3-Clause; converted to glTF by EmAI, textures baked into vertex colours.',
    },
    set: 'exhibit',
    lod: { ...QUADRUPED, lod0: Math.min(QUADRUPED.lod0, CAPS.exhibitLod0) },
    demoJoint: 'LF_KFE',
    colours: 'JPEG textures of the COLLADA files baked into vertex colours (per corner, inside each triangle).',
    flags: {},
  },
  {
    id: 'fanuc-r2000ic-165f',
    name: { de: 'FANUC R-2000iC/165F', en: 'FANUC R-2000iC/165F' },
    vendor: 'FANUC',
    category: 'arm',
    use: ['showroom'],
    repo: 'fanuc',
    entry: 'fanuc_r2000_description/robot/r2000ic_165f.urdf.xacro',
    format: 'urdf',
    lineup: true,
    license: { spdx: 'Apache-2.0', texts: ['Apache-2.0.txt'], copyright: ['SPDX-FileCopyrightText: 2026, FANUC America Corporation', 'SPDX-FileCopyrightText: 2026, FANUC CORPORATION'] },
    attribution: {
      de: 'FANUC R-2000iC/165F: 3D-Modell von FANUC America Corporation und FANUC CORPORATION (fanuc_description), Apache-2.0; von EmAI nach glTF konvertiert und vereinfacht.',
      en: 'FANUC R-2000iC/165F: 3D model by FANUC America Corporation and FANUC CORPORATION (fanuc_description), Apache-2.0; converted to glTF and simplified by EmAI.',
    },
    set: 'exhibit',
    lod: { ...ARM, lod0: Math.min(ARM.lod0, CAPS.exhibitLod0) },
    demoJoint: 'J2',
    ik: [{ name: 'arm', joints: ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'], tip: 'flange' }],
    colours: 'Per-material colours from FANUC’s COLLADA files (FANUC yellow).',
    flags: {},
  },
  {
    id: 'ur5e',
    name: { de: 'Universal Robots UR5e', en: 'Universal Robots UR5e' },
    vendor: 'Universal Robots',
    category: 'arm',
    use: ['showroom'],
    repo: 'menagerie',
    entry: 'universal_robots_ur5e/ur5e.xml',
    format: 'mjcf',
    lineup: true,
    sourceUrl: menagerie('universal_robots_ur5e'),
    license: { spdx: 'BSD-3-Clause', texts: ['BSD-3-Clause-UR5e-ROS-Industrial.txt'], copyright: ['Copyright 2018 ROS Industrial Consortium'] },
    attribution: {
      de: 'UR5e: 3D-Modell © 2018 ROS Industrial Consortium über MuJoCo Menagerie, BSD-3-Clause; von EmAI nach glTF konvertiert und vereinfacht.',
      en: 'UR5e: 3D model © 2018 ROS Industrial Consortium via MuJoCo Menagerie, BSD-3-Clause; converted to glTF and simplified by EmAI.',
    },
    set: 'exhibit',
    lod: { ...ARM, lod0: Math.min(ARM.lod0, CAPS.exhibitLod0) },
    defaultPose: 'home',
    demoJoint: 'elbow_joint',
    ik: [{ name: 'arm', joints: ['shoulder_pan_joint', 'shoulder_lift_joint', 'elbow_joint', 'wrist_1_joint', 'wrist_2_joint', 'wrist_3_joint'], tip: 'attachment_site' }],
    colours: 'MJCF materials of the Menagerie model.',
    flags: {},
    legalNote: 'Only UR5e meshes from the BSD-3 source; UR8 Long / UR15 / UR18 / UR20 / UR30 meshes fall under UR’s own terms and are blocked by a path check (R4 §5.2).',
  },
  {
    id: 'franka-fr3',
    name: { de: 'Franka Research 3', en: 'Franka Research 3' },
    vendor: 'Franka Robotics',
    category: 'arm',
    use: ['showroom'],
    repo: 'menagerie',
    entry: 'franka_fr3/fr3.xml',
    format: 'mjcf',
    lineup: true,
    sourceUrl: menagerie('franka_fr3'),
    license: { spdx: 'Apache-2.0', texts: ['LICENSE-franka_fr3-Menagerie.txt'], notice: 'NOTICE-franka_description.txt', copyright: ['Copyright 2023 Franka Robotics GmbH'] },
    attribution: {
      de: 'Franka Research 3: 3D-Modell © 2023 Franka Robotics GmbH (franka_description) über MuJoCo Menagerie, Apache-2.0 (NOTICE beigefügt); von EmAI nach glTF konvertiert und vereinfacht.',
      en: 'Franka Research 3: 3D model © 2023 Franka Robotics GmbH (franka_description) via MuJoCo Menagerie, Apache-2.0 (NOTICE included); converted to glTF and simplified by EmAI.',
    },
    set: 'exhibit',
    lod: { ...ARM, lod0: Math.min(ARM.lod0, CAPS.exhibitLod0) },
    defaultPose: 'home',
    demoJoint: 'fr3_joint4',
    ik: [{ name: 'arm', joints: ['fr3_joint1', 'fr3_joint2', 'fr3_joint3', 'fr3_joint4', 'fr3_joint5', 'fr3_joint6', 'fr3_joint7'], tip: 'attachment_site' }],
    colours: 'MJCF materials of the Menagerie model (Menagerie lightened the black, R4).',
    flags: {},
  },
  {
    id: 'pal-talos',
    name: { de: 'PAL Robotics TALOS', en: 'PAL Robotics TALOS' },
    vendor: 'PAL Robotics',
    category: 'humanoid',
    use: ['showroom'],
    repo: 'menagerie',
    entry: 'pal_talos/talos.xml',
    format: 'mjcf',
    lineup: true,
    sourceUrl: menagerie('pal_talos'),
    license: { spdx: 'Apache-2.0', texts: ['Apache-2.0.txt'], copyright: ['PAL Robotics (talos_robot), via MuJoCo Menagerie'] },
    attribution: {
      de: 'TALOS: 3D-Modell von PAL Robotics über MuJoCo Menagerie, Apache-2.0; von EmAI nach glTF konvertiert und vereinfacht.',
      en: 'TALOS: 3D model by PAL Robotics via MuJoCo Menagerie, Apache-2.0; converted to glTF and simplified by EmAI.',
    },
    set: 'exhibit',
    lod: { ...HUMANOID, lod0: CAPS.humanoidExhibitLod0 },
    demoJoint: 'arm_left_4_joint',
    colours: 'MJCF materials of the Menagerie model.',
    flags: {},
  },
  {
    id: 'pal-tiago',
    name: { de: 'PAL Robotics TIAGo', en: 'PAL Robotics TIAGo' },
    vendor: 'PAL Robotics',
    category: 'mobile-manipulator',
    use: ['showroom'],
    repo: 'menagerie',
    entry: 'pal_tiago/tiago.xml',
    format: 'mjcf',
    lineup: true,
    sourceUrl: menagerie('pal_tiago'),
    // TIAGo's Menagerie model draws its collision meshes (group 1); the box is the mast cover
    visual: (g) => g.group === 1,
    license: { spdx: 'Apache-2.0', texts: ['Apache-2.0.txt'], copyright: ['PAL Robotics (tiago_robot), via MuJoCo Menagerie'] },
    attribution: {
      de: 'TIAGo: 3D-Modell von PAL Robotics über MuJoCo Menagerie, Apache-2.0; von EmAI nach glTF konvertiert und vereinfacht.',
      en: 'TIAGo: 3D model by PAL Robotics via MuJoCo Menagerie, Apache-2.0; converted to glTF and simplified by EmAI.',
    },
    set: 'exhibit',
    lod: { ...MOBILE, lod0: Math.min(MOBILE.lod0, CAPS.exhibitLod0) },
    demoJoint: 'arm_4_joint',
    colours: 'MJCF materials of the Menagerie model. Default pose has the torso down (1.11 m); the lift raises it.',
    flags: {},
  },
  {
    id: 'stretch-3',
    name: { de: 'Hello Robot Stretch 3', en: 'Hello Robot Stretch 3' },
    vendor: 'Hello Robot',
    category: 'mobile-manipulator',
    use: ['showroom'],
    repo: 'menagerie',
    entry: 'hello_robot_stretch_3/stretch.xml',
    format: 'mjcf',
    lineup: true,
    sourceUrl: menagerie('hello_robot_stretch_3'),
    license: { spdx: 'Apache-2.0', texts: ['Apache-2.0.txt'], copyright: ['Copyright (c) 2020-2024, Hello Robot Inc.'] },
    attribution: {
      de: 'Stretch 3: 3D-Modell von Hello Robot über MuJoCo Menagerie, Apache-2.0; von EmAI nach glTF konvertiert und vereinfacht, Aufkleber-Texturen in Vertexfarben gebacken.',
      en: 'Stretch 3: 3D model by Hello Robot via MuJoCo Menagerie, Apache-2.0; converted to glTF and simplified by EmAI, sticker textures baked into vertex colours.',
    },
    set: 'exhibit',
    lod: { ...MOBILE, lod0: Math.min(MOBILE.lod0, CAPS.exhibitLod0) },
    demoJoint: 'joint_lift',
    colours: '30 MJCF materials; 11 sticker textures (ArUco markers, warnings) baked into vertex colours.',
    flags: {},
  },
  {
    id: 'apptronik-apollo',
    name: { de: 'Apptronik Apollo', en: 'Apptronik Apollo' },
    vendor: 'Apptronik',
    category: 'humanoid',
    use: ['showroom'],
    repo: 'menagerie',
    entry: 'apptronik_apollo/apptronik_apollo.xml',
    format: 'mjcf',
    lineup: true,
    sourceUrl: menagerie('apptronik_apollo'),
    visual: (g) => g.cls.startsWith('visual'),
    license: { spdx: 'Apache-2.0', texts: ['Apache-2.0.txt'], copyright: ['Copyright [2024] [Apptronik]'] },
    attribution: {
      de: 'Apollo: 3D-Modell von Apptronik („Apptronik Apollo open source software“) über MuJoCo Menagerie, Apache-2.0; von EmAI nach glTF konvertiert und vereinfacht.',
      en: 'Apollo: 3D model by Apptronik ("Apptronik Apollo open source software") via MuJoCo Menagerie, Apache-2.0; converted to glTF and simplified by EmAI.',
    },
    // 1.55 M source triangles in pre-decimated, cracked meshes (50 k open edges in the torso alone);
    // a 60° crease keeps fewer split vertices
    set: 'exhibit',
    // crack repair: a 1 mm weld and no component pruning keep the cracked shells closed; at 30 k
    // triangles they still break into shards (gallery check), so LOD0 keeps 45 k (EXCEPTIONS)
    lod: { ...HUMANOID, lod0: 45000, lod1: 20000, prune: false },
    weldMm: 1,
    creaseDeg: 60,
    defaultPose: 'stand',
    demoJoint: 'l_elbow_fe',
    colours: 'MJCF classes visual_light / visual_dark.',
    flags: {},
    legalNote: 'The hands are PSYONIC Ability Hand meshes inside Apptronik’s Apache-2.0 release; check their provenance with the amber set.',
  },
  {
    id: 'shadow-hand',
    name: { de: 'Shadow Dexterous Hand', en: 'Shadow Dexterous Hand' },
    vendor: 'Shadow Robot',
    category: 'hand',
    use: ['showroom'],
    repo: 'menagerie',
    entry: 'shadow_hand/right_hand.xml',
    format: 'mjcf',
    lineup: true,
    sourceUrl: menagerie('shadow_hand'),
    license: { spdx: 'Apache-2.0', texts: ['Apache-2.0.txt'], copyright: ['Copyright 2022 Shadow Robot Company Ltd'] },
    attribution: {
      de: 'Shadow Dexterous Hand: 3D-Modell von Shadow Robot Company über MuJoCo Menagerie, Apache-2.0; von EmAI nach glTF konvertiert und vereinfacht.',
      en: 'Shadow Dexterous Hand: 3D model by Shadow Robot Company via MuJoCo Menagerie, Apache-2.0; converted to glTF and simplified by EmAI.',
    },
    set: 'exhibit',
    lod: { ...HAND, lod0: Math.min(HAND.lod0, CAPS.exhibitLod0) },
    // Menagerie lays the forearm horizontal (root body quat); on a column it stands upright, palm to the front
    keepRootRotation: false,
    demoJoint: 'rh_FFJ3',
    colours: 'MJCF materials of the Menagerie model (E3M5, right hand).',
    flags: {},
  },

  // ── showroom, amber (legal review before public release, R4 Q3) ──
  {
    id: 'spot',
    name: { de: 'Boston Dynamics Spot', en: 'Boston Dynamics Spot' },
    vendor: 'Boston Dynamics',
    category: 'quadruped',
    use: ['showroom'],
    repo: 'menagerie',
    entry: 'boston_dynamics_spot/spot.xml',
    format: 'mjcf',
    lineup: true,
    sourceUrl: menagerie('boston_dynamics_spot'),
    license: { spdx: 'BSD-3-Clause AND MIT', texts: ['BSD-3-Clause-Spot-Clearpath.txt', 'MIT-BSD-3-Clause-spot_description-RAI.txt'], copyright: ['Copyright (c) 2021, Clearpath Robotics Inc.', 'Copyright (c) 2023-2024 Robotics and AI Institute LLC dba RAI Institute.'] },
    attribution: {
      de: 'Spot: 3D-Modell © 2021 Clearpath Robotics (BSD-3-Clause) und © 2023–2024 RAI Institute (MIT) über MuJoCo Menagerie; von EmAI nach glTF konvertiert und vereinfacht. Spot ist eine Marke von Boston Dynamics.',
      en: 'Spot: 3D model © 2021 Clearpath Robotics (BSD-3-Clause) and © 2023–2024 RAI Institute (MIT) via MuJoCo Menagerie; converted to glTF and simplified by EmAI. Spot is a trademark of Boston Dynamics.',
    },
    set: 'exhibit',
    lod: { ...QUADRUPED, lod0: Math.min(QUADRUPED.lod0, CAPS.exhibitLod0) },
    defaultPose: 'home',
    demoJoint: 'fl_kn',
    colours: 'MJCF materials of the Menagerie model.',
    flags: { amber: true, legalReviewBeforeRelease: true },
    legalNote: 'Licensor is not Boston Dynamics; origin of the geometry undocumented; trademark (R4 §4).',
  },
  {
    id: 'spot-arm',
    name: { de: 'Boston Dynamics Spot mit Arm', en: 'Boston Dynamics Spot with Arm' },
    vendor: 'Boston Dynamics',
    category: 'quadruped',
    use: ['showroom'],
    repo: 'menagerie',
    entry: 'boston_dynamics_spot/spot_arm.xml',
    format: 'mjcf',
    sourceUrl: menagerie('boston_dynamics_spot'),
    license: { spdx: 'BSD-3-Clause AND MIT', texts: ['BSD-3-Clause-Spot-Clearpath.txt', 'MIT-BSD-3-Clause-spot_description-RAI.txt'], copyright: ['Copyright (c) 2021, Clearpath Robotics Inc.', 'Copyright (c) 2023-2024 Robotics and AI Institute LLC dba RAI Institute.'] },
    attribution: {
      de: 'Spot mit Arm: 3D-Modell © 2021 Clearpath Robotics (BSD-3-Clause) und © 2023–2024 RAI Institute (MIT) über MuJoCo Menagerie; von EmAI nach glTF konvertiert und vereinfacht. Spot ist eine Marke von Boston Dynamics.',
      en: 'Spot with Arm: 3D model © 2021 Clearpath Robotics (BSD-3-Clause) and © 2023–2024 RAI Institute (MIT) via MuJoCo Menagerie; converted to glTF and simplified by EmAI. Spot is a trademark of Boston Dynamics.',
    },
    set: 'extra',
    lod: QUADRUPED,
    defaultPose: 'home',
    demoJoint: 'arm_el0',
    colours: 'MJCF materials of the Menagerie model.',
    flags: { amber: true, legalReviewBeforeRelease: true },
    legalNote: 'As Spot.',
  },
  {
    id: 'mir250',
    name: { de: 'MiR250', en: 'MiR250' },
    vendor: 'Mobile Industrial Robots',
    category: 'amr',
    use: ['showroom'],
    repo: 'mir',
    entry: 'mir_description/urdf/mir.urdf.xacro',
    format: 'urdf',
    lineup: true,
    xacroArgs: { mir_type: 'mir_250' },
    license: { spdx: 'BSD-3-Clause', texts: ['BSD-3-Clause-mir_robot-DFKI.txt'], copyright: ['Copyright (c) 2018-2022, Martin Günther (DFKI GmbH) and contributors'] },
    attribution: {
      de: 'MiR250: 3D-Modell © 2018–2022 Martin Günther (DFKI GmbH) und Mitwirkende (mir_robot), BSD-3-Clause; von EmAI nach glTF konvertiert und vereinfacht.',
      en: 'MiR250: 3D model © 2018–2022 Martin Günther (DFKI GmbH) and contributors (mir_robot), BSD-3-Clause; converted to glTF and simplified by EmAI.',
    },
    set: 'exhibit',
    lod: { ...AMR, lod0: Math.min(AMR.lod0, CAPS.exhibitLod0) },
    demoJoint: 'left_wheel_joint',
    colours: 'URDF colours: dark grey body, black wheels and casters.',
    flags: { amber: true, legalReviewBeforeRelease: true },
    legalNote: 'Licensor is DFKI, not MiR; the mesh’s origin is undocumented (R4 §4).',
  },
  {
    id: 'kuka-iiwa-14',
    name: { de: 'KUKA LBR iiwa 14 R820', en: 'KUKA LBR iiwa 14 R820' },
    vendor: 'KUKA',
    category: 'arm',
    use: ['showroom'],
    repo: 'menagerie',
    entry: 'kuka_iiwa_14/iiwa14.xml',
    format: 'mjcf',
    lineup: true,
    sourceUrl: menagerie('kuka_iiwa_14'),
    license: { spdx: 'BSD-3-Clause', texts: ['BSD-3-Clause-Drake-iiwa14.txt'], copyright: ['Copyright 2012-2022 Robot Locomotion Group @ CSAIL'] },
    attribution: {
      de: 'LBR iiwa 14: 3D-Modell aus Drake (© 2012–2022 Robot Locomotion Group @ CSAIL) über MuJoCo Menagerie, BSD-3-Clause; von EmAI nach glTF konvertiert und vereinfacht.',
      en: 'LBR iiwa 14: 3D model from Drake (© 2012–2022 Robot Locomotion Group @ CSAIL) via MuJoCo Menagerie, BSD-3-Clause; converted to glTF and simplified by EmAI.',
    },
    set: 'exhibit',
    lod: { ...ARM, lod0: Math.min(ARM.lod0, CAPS.exhibitLod0) },
    defaultPose: 'home',
    demoJoint: 'joint4',
    colours: 'MJCF materials of the Menagerie model.',
    flags: { amber: true, legalReviewBeforeRelease: true },
    legalNote: 'Licensor is the Drake project, not KUKA (R4 §4).',
  },
  {
    id: 'robotiq-2f85',
    name: { de: 'Robotiq 2F-85', en: 'Robotiq 2F-85' },
    vendor: 'Robotiq',
    category: 'gripper',
    use: ['showroom'],
    repo: 'menagerie',
    entry: 'robotiq_2f85/2f85.xml',
    format: 'mjcf',
    lineup: true,
    sourceUrl: menagerie('robotiq_2f85'),
    license: { spdx: 'BSD-2-Clause', texts: ['BSD-2-Clause-Robotiq-2F-85-ROS-Industrial.txt'], copyright: ['Copyright (c) 2013, ROS-Industrial'] },
    attribution: {
      de: 'Robotiq 2F-85: 3D-Modell © 2013 ROS-Industrial über MuJoCo Menagerie, BSD-2-Clause; von EmAI nach glTF konvertiert und vereinfacht.',
      en: 'Robotiq 2F-85: 3D model © 2013 ROS-Industrial via MuJoCo Menagerie, BSD-2-Clause; converted to glTF and simplified by EmAI.',
    },
    set: 'exhibit',
    lod: { ...GRIPPER, lod0: Math.min(GRIPPER.lod0, CAPS.exhibitLod0) },
    // MuJoCo closes the four-bar with connect constraints; kinematically the parallel-pinch
    // approximation of the ROS-Industrial URDF: inner knuckle +θ, inner finger −θ, outer finger fixed
    mimic: {
      right_spring_link_joint: ['right_driver_joint', 1, 0],
      right_follower_joint: ['right_driver_joint', -1, 0],
      left_spring_link_joint: ['left_driver_joint', 1, 0],
      left_follower_joint: ['left_driver_joint', -1, 0],
    },
    demoJoint: 'left_driver_joint',
    colours: 'MJCF materials of the Menagerie model.',
    flags: { amber: true, legalReviewBeforeRelease: true },
    legalNote: 'Licensor is ROS-Industrial, not Robotiq; the four-bar linkage is closed by MuJoCo constraints; here the fingers follow the driver by the parallel-pinch approximation (R4 §4).',
  },
];
