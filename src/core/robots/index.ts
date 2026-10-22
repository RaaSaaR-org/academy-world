/**
 * Real robot models (Phase 7): the converted, articulated GLBs of tools/robots and their runtime.
 *
 *   const robots = new RobotLibrary({ materials: ctx.materials, renderer, compile: (root) => rs.warmUp({ root }) });
 *   await robots.prewarm('unitree-g1');                 // idle-time fetch, parse, compile, upload
 *   const g1 = await robots.load('unitree-g1');         // RobotModel, default pose
 *   ctx.groups.detail.add(g1.object);
 *   g1.setJoint('left_elbow_joint', 0.8);               // rad, clamped to the source's limits
 *   g1.getLinkWorldMatrix('left_rubber_hand');          // FK
 *   g1.updateLod(camera, viewportHeightPx);             // per frame, one distance check
 *
 * Licence, attribution and measured stats per robot: `robotInfo(id)` (src/robots/manifest.ts).
 */
export { RobotLibrary, ROBOT_PAINT, type RobotLibraryDeps } from './RobotLibrary';
export { RobotModel } from './RobotModel';
export { solveCcd } from './ik';
export type * from './types';
export { ROBOTS, ROBOT_IDS, ROBOT_LINEUP, robotInfo, isRobotId, type RobotManifestEntry, type RobotJointInfo, type RobotCategory, type RobotInertial, type RobotLineup } from '@/robots/manifest';
