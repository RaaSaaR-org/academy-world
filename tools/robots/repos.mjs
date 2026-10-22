// Pinned source repositories. Every robot in sources.mjs names one of these keys. `paths` are the
// files and folders the build reads (a sparse checkout); fetch.mjs verifies every file against the
// pinned commit's git tree. Changing a commit here is a reviewed change: rebuild, re-check, re-read
// the licence.

export const REPOS = {
  'so-arm100': {
    url: 'https://github.com/TheRobotStudio/SO-ARM100',
    commit: 'a758567c3978dfeefe282ede0500085a48fe8f78',
    date: '2026-10-06',
    paths: ['LICENSE', 'README.md', 'Simulation/SO101'],
  },
  'open-duck-mini': {
    url: 'https://github.com/apirrone/Open_Duck_Mini',
    commit: 'b23317a485b3cec7d8417f352478778b3475173c',
    date: '2026-01-31',
    branch: 'v2',
    paths: ['LICENSE', 'README.md', 'thanks.md', 'mini_bdx/robots/open_duck_mini_v2'],
  },
  'unitree-ros': {
    url: 'https://github.com/unitreerobotics/unitree_ros',
    commit: '5994d4faef0a9cadd3287f8de0199a67eeb2a259',
    date: '2026-09-30',
    paths: [
      'LICENSE',
      'robots/r1_description',
      'robots/g1_description/g1_29dof_rev_1_0.urdf',
      'robots/g1_description/g1_29dof_with_hand_rev_1_0.urdf',
      'robots/g1_description/README.md',
      'robots/g1_description/meshes',
      'robots/h1_description/urdf',
      'robots/h1_description/meshes',
      'robots/h1_description/README.md',
      'robots/h1_2_description/h1_2_handless.urdf',
      'robots/h1_2_description/meshes',
      'robots/h2_description',
    ],
  },
  menagerie: {
    url: 'https://github.com/google-deepmind/mujoco_menagerie',
    commit: '62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35',
    date: '2026-10-14',
    paths: [
      'LICENSE',
      'unitree_go2',
      'universal_robots_ur5e',
      'franka_fr3',
      'pal_talos',
      'pal_tiago',
      'hello_robot_stretch_3',
      'apptronik_apollo',
      'shadow_hand',
      'boston_dynamics_spot',
      'kuka_iiwa_14',
      'robotiq_2f85',
    ],
  },
  'anymal-d': {
    url: 'https://github.com/ANYbotics/anymal_d_simple_description',
    commit: 'd5bf4dc3a81af81a16b9598fc15c98e339f45a33',
    paths: ['LICENSE', 'README.md', 'package.xml', 'urdf', 'meshes'],
  },
  fanuc: {
    url: 'https://github.com/FANUC-CORPORATION/fanuc_description',
    commit: 'fb40c9803a826ba68c7c8e28ba904a25efa7fcd2',
    date: '2026-08-05',
    paths: [
      'LICENSES',
      'README.md',
      'fanuc_r2000_description/package.xml',
      'fanuc_r2000_description/robot/r2000ic_165f.urdf.xacro',
      'fanuc_r2000_description/urdf/r2000ic_165f_urdf_macro.xacro',
      'fanuc_r2000_description/meshes/r2000ic_165f',
    ],
  },
  mir: {
    url: 'https://github.com/DFKI-NI/mir_robot',
    commit: 'c08dfad93be53ac12969f0f37a01a2b74b5c1997',
    date: '2026-04-27',
    branch: 'noetic',
    paths: ['LICENSE', 'mir_description'],
  },
  // LeKiwi (R5): the mobile base; the arm on top is the SO-101 (own GLB)
  lekiwi: {
    url: 'https://github.com/SIGRobotics-UIUC/LeKiwi',
    commit: 'efa608d7ee5a495a4803b1d28cd0c955b4f1e033',
    date: '2026-08-05',
    paths: ['LICENSE.txt', 'README.md', 'CITATION.cff', 'BOM.md', 'URDF'],
  },
  // only for its LICENSE: Menagerie's Spot is derived from it (MIT © RAI Institute + BSD-3 © Clearpath)
  'spot-description': {
    url: 'https://github.com/rai-opensource/spot_description',
    commit: '156d1802bfb117f219dbfce7597d283d5fabc968',
    paths: ['LICENSE'],
  },
  // only for the NOTICE file the FR3 model's Apache-2.0 licence requires (Menagerie derived its FR3 from it)
  'franka-description': {
    url: 'https://github.com/frankarobotics/franka_description',
    commit: '7aeeddc449edf8d62b594f9e36a81da53e7796f9',
    date: '2026-08-17',
    paths: ['LICENSE', 'NOTICE'],
  },
};
