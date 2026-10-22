#!/usr/bin/env node
// Writes the duck station's light physics model, src/zones/regelgarten/duck/model.xml (plan §4.3,
// R2 §4.2), from the Open Duck Mini v2 MJCF (Apache-2.0, apirrone/Open_Duck_Mini @ b23317a,
// mini_bdx/robots/open_duck_mini_v2/robot.xml) and the Rhoban BAM actuator identification of the
// Feetech STS3215 at 7.4 V (Apache-2.0, Rhoban/bam @ e9a619d, bam/params/feetech_sts3215_7_4V/m1.json):
//
//   - the body tree, joint axes and limits and every inertial are copied as they are;
//   - all visual meshes are dropped (the game draws the robot from its GLB, src/robots/glb/);
//   - collision on the two TPU foot soles, as boxes fitted to foot_bottom_tpu.stl in the foot frame
//     (the authors' own light export also keeps only the feet, R2 §4.2 [S11]), plus one box each for
//     the trunk and the head shell, so a fallen duck lies on the floor instead of sinking through it;
//   - the root gets a free joint; the antenna joints are fused (no motor drives them in the lesson);
//   - one `sts3215` default class from BAM's `to_mujoco` export of m1 (firmware P gain 32, 7.4 V);
//   - 14 position actuators in the order the gait uses (L leg 5, neck/head 4, R leg 5, R2 §4.3);
//   - a `home` keyframe: knees bent by HOME_KNEE, hip and ankle solved so the soles lie flat under
//     the trunk's centre of mass, the trunk lowered until the soles touch the floor.
//
//   node tools/duck/model.mjs --src <dir with robot.xml and foot_bottom_tpu.stl> [--out <file>] [--check]
//
// --check: exit 1 when the committed model.xml differs from what this run would write. The source
// folder is a download (untrusted): it is only read as text and bytes, nothing in it is executed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []),
);
const SRC = args.src ? path.resolve(String(args.src)) : null;
const OUT = path.resolve(String(args.out ?? path.join(ROOT, 'src/zones/regelgarten/duck/model.xml')));
if (!SRC) {
  console.error('usage: node tools/duck/model.mjs --src <Open_Duck_Mini v2 robot folder> [--out file] [--check]');
  process.exit(2);
}

// ── BAM m1 (STS3215, 7.4 V) → MuJoCo position actuator (bam/to_mujoco.py, voltage-controlled) ──
const BAM = { kt: 1.1776311631627974, R: 2.478681934101461, armature: 0.02608291141307205, frictionBase: 0.05152047758105413, frictionViscous: 0.05989161871380604 };
const FIRMWARE = { vin: 7.4, kp: 32, errorGain: 0.166, maxPwm: 0.97 }; // STS3215Actuator defaults (bam/feetech/actuator.py)
const STS = {
  kp: FIRMWARE.errorGain * FIRMWARE.kp * FIRMWARE.vin * FIRMWARE.maxPwm * BAM.kt / BAM.R,
  damping: BAM.frictionViscous + (BAM.kt * BAM.kt) / BAM.R,
  frictionloss: BAM.frictionBase,
  armature: BAM.armature,
  forcerange: (FIRMWARE.vin * BAM.kt) / BAM.R,
};
/** knee bend of the home pose (rad); hip pitch and ankle follow from it */
const HOME_KNEE = 1.35;
/** actuator order (R2 §4.3; the gait's parameter layout depends on it) */
const ACTUATORS = ['left_hip_yaw', 'left_hip_roll', 'left_hip_pitch', 'left_knee', 'left_ankle', 'neck_pitch', 'head_pitch', 'head_yaw', 'head_roll', 'right_hip_yaw', 'right_hip_roll', 'right_hip_pitch', 'right_knee', 'right_ankle'];
const FUSED = new Set(['left_antenna', 'right_antenna']);
const SOLE_MESH = 'foot_bottom_tpu';
const FOOT_BODIES = ['foot_assembly', 'foot_assembly_2'];
/** after a fall the trunk and the head rest ON the floor instead of sinking through it: one box each,
 * fitted to the outer shell meshes (they never touch the floor while the duck walks) */
const SHELLS = {
  trunk_assembly: { name: 'trunk_shell', meshes: ['body_front', 'body_back', 'body_middle_bottom', 'body_middle_top', 'trunk_bottom', 'trunk_top'] },
  head_assembly: { name: 'head_shell', meshes: ['head', 'head_bot_sheet'] },
};

// ── a small XML reader (the source is machine-written by onshape-to-robot) ─────
function parseXml(text) {
  const src = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<(\/?)([A-Za-z_][\w.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  for (let m; (m = re.exec(src)); ) {
    const [, close, tag, rawAttrs, selfClose] = m;
    if (close) {
      if (stack.at(-1).tag !== tag) throw new Error(`unbalanced </${tag}>`);
      stack.pop();
      continue;
    }
    const attrs = {};
    for (const a of rawAttrs.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = a[2];
    const node = { tag, attrs, children: [] };
    stack.at(-1).children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root.children[0];
}
const kids = (n, tag) => n.children.filter((c) => c.tag === tag);
const num = (s, d = [0, 0, 0]) => (s ? s.trim().split(/\s+/).map(Number) : d);

// ── quaternions (w, x, y, z), MuJoCo convention ───────────────────────────
const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
function qrot(q, v) {
  const [w, x, y, z] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}

/** Axis-aligned box of an STL (binary or ASCII) placed by a geom's pos/quat. */
function stlBox(file, pos, quat) {
  const b = fs.readFileSync(file);
  const pts = [];
  if (b.subarray(0, 5).toString() === 'solid' && b.subarray(0, 400).toString().includes('facet')) {
    for (const m of b.toString().matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) pts.push([+m[1], +m[2], +m[3]]);
  } else {
    const n = b.readUInt32LE(80);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
      const o = 84 + i * 50 + 12 + k * 12;
      pts.push([b.readFloatLE(o), b.readFloatLE(o + 4), b.readFloatLE(o + 8)]);
    }
  }
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    const r = qrot(quat, p);
    for (let i = 0; i < 3; i++) {
      const v = r[i] + pos[i];
      lo[i] = Math.min(lo[i], v);
      hi[i] = Math.max(hi[i], v);
    }
  }
  return { center: lo.map((l, i) => (l + hi[i]) / 2), half: lo.map((l, i) => (hi[i] - l) / 2), triangles: pts.length / 3 };
}

const f = (v, d = 6) => (Math.abs(v) < 1e-12 ? '0' : String(+v.toFixed(d)));
const fv = (a, d = 6) => a.map((v) => f(v, d)).join(' ');

// ── build ─────────────────────────────────────────────────────────────────
const robotXml = fs.readFileSync(path.join(SRC, 'robot.xml'), 'utf8');
const mj = parseXml(robotXml);
const base = kids(kids(mj, 'worldbody')[0], 'body')[0];
const trunk = kids(base, 'body')[0];
if (trunk.attrs.name !== 'trunk_assembly') throw new Error(`unexpected root body ${trunk.attrs.name}`);

let sole = null;
const bodyLines = [];
const joints = [];
function shellBox(b) {
  const spec = SHELLS[b.attrs.name];
  if (!spec) return null;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const g of kids(b, 'geom')) {
    if (!spec.meshes.includes(g.attrs.mesh)) continue;
    const box = stlBox(path.join(SRC, `${g.attrs.mesh}.stl`), num(g.attrs.pos), num(g.attrs.quat, [1, 0, 0, 0]));
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], box.center[i] - box.half[i]);
      hi[i] = Math.max(hi[i], box.center[i] + box.half[i]);
    }
  }
  return { name: spec.name, center: lo.map((l, i) => (l + hi[i]) / 2), half: lo.map((l, i) => (hi[i] - l) / 2) };
}
function emitBody(b, depth, isRoot) {
  const pad = '  '.repeat(depth);
  const a = b.attrs;
  const pos = isRoot ? '' : ` pos="${fv(num(a.pos))}"`;
  const quat = !isRoot && a.quat && a.quat.trim() !== '1 0 0 0' ? ` quat="${fv(num(a.quat))}"` : '';
  bodyLines.push(`${pad}<body name="${a.name}"${isRoot ? ' pos="0 0 HOME_Z"' : pos}${quat}>`);
  if (isRoot) bodyLines.push(`${pad}  <freejoint name="root"/>`);
  for (const c of b.children) {
    if (c.tag === 'inertial') {
      const ia = c.attrs;
      const m = Math.max(Number(ia.mass), 1e-6);
      const di = num(ia.diaginertia).map((v) => Math.max(v, 1e-9));
      bodyLines.push(`${pad}  <inertial pos="${fv(num(ia.pos))}"${ia.quat ? ` quat="${fv(num(ia.quat))}"` : ''} mass="${f(m)}" diaginertia="${fv(di, 9)}"/>`);
    } else if (c.tag === 'joint') {
      if (FUSED.has(c.attrs.name)) continue;
      if (num(c.attrs.pos).some((v) => Math.abs(v) > 1e-9)) throw new Error(`joint ${c.attrs.name} is not at its body origin`);
      joints.push({ name: c.attrs.name, range: num(c.attrs.range) });
      bodyLines.push(`${pad}  <joint name="${c.attrs.name}" class="sts3215" axis="${fv(num(c.attrs.axis))}" range="${fv(num(c.attrs.range))}"/>`);
    } else if (c.tag === 'geom' && c.attrs.mesh === SOLE_MESH && FOOT_BODIES.includes(a.name)) {
      const box = stlBox(path.join(SRC, `${SOLE_MESH}.stl`), num(c.attrs.pos), num(c.attrs.quat, [1, 0, 0, 0]));
      sole ??= box;
      bodyLines.push(`${pad}  <geom name="${a.name === 'foot_assembly' ? 'left' : 'right'}_sole" class="sole" pos="${fv(box.center)}" size="${fv(box.half)}"/>`);
    }
  }
  const sh = shellBox(b);
  if (sh) bodyLines.push(`${pad}  <geom name="${sh.name}" class="shell" pos="${fv(sh.center)}" size="${fv(sh.half)}"/>`);
  for (const c of kids(b, 'body')) emitBody(c, depth + 1, false);
  bodyLines.push(`${pad}</body>`);
}
emitBody(trunk, 2, true);
for (const name of ACTUATORS) if (!joints.find((j) => j.name === name)) throw new Error(`no joint ${name}`);
if (!sole) throw new Error('no foot sole geom found');

const header = `<!--
  Open Duck Mini v2: light physics model for the Regelgarten duck station (Lauf, Ente!).
  Generated by tools/duck/model.mjs (do not edit by hand) from
    robot.xml of apirrone/Open_Duck_Mini @ b23317a485b3cec7d8417f352478778b3475173c
    (mini_bdx/robots/open_duck_mini_v2), Copyright Antoine Pirrone and the Open Duck Mini
    contributors, Apache License 2.0;
    actuator class from Rhoban BAM @ e9a619d (params/feetech_sts3215_7_4V/m1.json, to_mujoco),
    Copyright Marc Duclusaud and Gregoire Passault, Apache License 2.0.
  Modified by EmAI (Apache-2.0 section 4b): visual meshes removed, collision reduced to boxes fitted to
  the TPU foot soles and the trunk and head shells, a free joint at the root, the antenna joints fused, one STS3215
  actuator class, 14 position actuators, a home keyframe. The robot itself is drawn from its GLB.
-->`;

const model = (homeZ, key) => `${header}
<mujoco model="open_duck_mini_v2_light">
  <compiler angle="radian" autolimits="true"/>
  <option timestep="0.002" iterations="3" ls_iterations="6">
    <flag eulerdamp="disable"/>
  </option>
  <default>
    <geom contype="0" conaffinity="0" group="3"/>
    <default class="sts3215">
      <joint damping="${f(STS.damping, 4)}" frictionloss="${f(STS.frictionloss, 4)}" armature="${f(STS.armature, 4)}"/>
      <position kp="${f(STS.kp, 3)}" kv="0" forcerange="${f(-STS.forcerange, 3)} ${f(STS.forcerange, 3)}" inheritrange="1"/>
    </default>
    <default class="sole">
      <geom type="box" contype="0" conaffinity="1" condim="3" friction="0.6" group="0"/>
    </default>
    <default class="shell">
      <geom type="box" contype="0" conaffinity="1" condim="3" friction="0.6" group="1"/>
    </default>
  </default>
  <worldbody>
    <geom name="floor" type="plane" size="0 0 0.05" contype="1" conaffinity="0" condim="3" friction="0.6" group="0"/>
${bodyLines.join('\n').replace('HOME_Z', f(homeZ, 5))}
  </worldbody>
  <actuator>
${ACTUATORS.map((n) => `    <position name="${n}" joint="${n}" class="sts3215"/>`).join('\n')}
  </actuator>
${key}</mujoco>
`;

// ── home pose with MuJoCo itself (feet flat under the CoM, soles on the floor) ─────────
const pkg = path.join(ROOT, 'node_modules', '@mujoco', 'mujoco');
const { default: loadMujoco } = await import(pathToFileURL(path.join(pkg, 'mujoco.js')).href);
const M = await loadMujoco({ locateFile: (p) => path.join(pkg, p) });
const draft = M.MjModel.from_xml_string(model(0.3, ''));
const d = new M.MjData(draft);
const qadr = (name) => draft.jnt_qposadr[M.mj_name2id(draft, M.mjtObj.mjOBJ_JOINT.value, name)];
const bid = (name) => M.mj_name2id(draft, M.mjtObj.mjOBJ_BODY.value, name);
const gid = (name) => M.mj_name2id(draft, M.mjtObj.mjOBJ_GEOM.value, name);
function pose(hipL, ankL, hipR, ankR) {
  M.mj_resetData(draft, d);
  const q = d.qpos;
  q[2] = 0.3;
  q[3] = 1;
  q[qadr('left_knee')] = HOME_KNEE;
  q[qadr('right_knee')] = HOME_KNEE;
  q[qadr('left_hip_pitch')] = hipL;
  q[qadr('right_hip_pitch')] = hipR;
  q[qadr('left_ankle')] = ankL;
  q[qadr('right_ankle')] = ankR;
  M.mj_kinematics(draft, d);
  M.mj_comPos(draft, d);
}
/** sole tilt (world z of the sole's local "down" axis, −y in the foot frame) and sole x minus the trunk-subtree CoM x */
function errors(side, hip, ank) {
  if (side === 'L') pose(hip, ank, -hip, ank);
  else pose(-hip, ank, hip, ank);
  const g = gid(side === 'L' ? 'left_sole' : 'right_sole');
  const xm = d.geom_xmat;
  // the sole's thin axis is the geom's local y: flat when it is world z (±)
  const tilt = Math.abs(xm[g * 9 + 7]);
  const com = d.subtree_com[bid('trunk_assembly') * 3];
  return [1 - tilt, d.geom_xpos[g * 3] - com, xm[g * 9 + 1]];
}
// left hip pitch is negative forward-flexed in this model (range −1.22…0.52); solve hip, ankle by search
function solve(side) {
  let best = null;
  for (let hip = -1.2; hip <= 0.5; hip += 0.005) {
    for (let ank = -1.5; ank <= 1.5; ank += 0.005) {
      const [tilt, dx, xy] = errors(side, hip, ank);
      const cost = tilt * 50 + Math.abs(dx) + (xy < 0 ? 0 : 0);
      if (!best || cost < best.cost) best = { hip, ank, cost, tilt, dx };
    }
  }
  return best;
}
const L = solve('L');
const hipL = L.hip,
  ankL = L.ank;
pose(hipL, ankL, -hipL, ankL);
// soles to the floor: lowest box corner over both feet
let zmin = Infinity;
for (const name of ['left_sole', 'right_sole']) {
  const g = gid(name);
  const c = [d.geom_xpos[g * 3], d.geom_xpos[g * 3 + 1], d.geom_xpos[g * 3 + 2]];
  const R = Array.from(d.geom_xmat.slice(g * 9, g * 9 + 9));
  const h = Array.from(draft.geom_size.slice(g * 3, g * 3 + 3));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const z = c[2] + R[6] * sx * h[0] + R[7] * sy * h[1] + R[8] * sz * h[2];
    zmin = Math.min(zmin, z);
  }
}
const homeZ = 0.3 - zmin + 0.0005;
const qpos = Array.from(d.qpos);
qpos[2] = homeZ;
const ctrlOf = (name) => qpos[qadr(name)];
const key = `  <keyframe>
    <!-- knees ${HOME_KNEE} rad; hip and ankle solved for flat soles under the trunk's centre of mass (tools/duck/model.mjs) -->
    <key name="home" qpos="${fv(qpos, 5)}" ctrl="${fv(ACTUATORS.map(ctrlOf), 5)}"/>
  </keyframe>
`;
const xml = model(homeZ, key);
d.delete();
draft.delete();

// sanity: the final model compiles and keeps the home pose for 3 s
const fin = M.MjModel.from_xml_string(xml);
const fd = new M.MjData(fin);
M.mj_resetDataKeyframe(fin, fd, 0);
const z0 = fd.qpos[2];
for (let i = 0; i < 1500; i++) M.mj_step(fin, fd);
const drift = Math.hypot(fd.qpos[0] - qpos[0], fd.qpos[1] - qpos[1], fd.qpos[2] - z0);
const upz = 1 - 2 * (fd.qpos[4] ** 2 + fd.qpos[5] ** 2);
console.log(JSON.stringify({ sts3215: Object.fromEntries(Object.entries(STS).map(([k, v]) => [k, +v.toFixed(4)])), sole: { center: sole.center.map((v) => +v.toFixed(5)), half: sole.half.map((v) => +v.toFixed(5)) }, home: { hipL: +hipL.toFixed(3), ankL: +ankL.toFixed(3), z: +homeZ.toFixed(4), solveTilt: +L.tilt.toFixed(5), solveDx: +L.dx.toFixed(4) }, after3s: { drift: +drift.toFixed(4), upright: +upz.toFixed(4), z: +fd.qpos[2].toFixed(4) }, nq: fin.nq, nu: fin.nu, nbody: fin.nbody }));
fd.delete();
fin.delete();

if (args.check) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== xml) {
    console.error(`${path.relative(ROOT, OUT)} differs from the generator output`);
    process.exit(1);
  }
  console.log(`${path.relative(ROOT, OUT)} is up to date`);
} else {
  fs.writeFileSync(OUT, xml);
  console.log(`wrote ${path.relative(ROOT, OUT)} (${xml.length} bytes)`);
}
