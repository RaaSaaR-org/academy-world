/**
 * WP15 — the Hofladen forecourt and the farm's life (plan §4.12 L2–L4, L8, L19; R9 §4.2–§4.3). Outside
 * the Sonnenacker's rect (WP9 owns the beds, the 12 + 6 arms and their shift), life adds:
 *  - three crate rovers (rc4 service-rover geometry, reactive like the deck's): gate → depot → shop;
 *  - the crates: the depot stack fills over the harvest and empties at the transport (Hof-Takt);
 *  - „Rover 5 und die Pfütze“: one rover sticks at the same puddle three passes in a row, then the
 *    technician lays a plate and it never sticks there again. Stand in the puddle and it replans (egg 5);
 *  - the misses on the vine ('sonnenacker:shift': an arm's miss stays for the Nachlese pickers);
 *  - „Ersatzfinger per Drohne“: once per visit a drone brings a gripper finger from the island;
 *  - two bumblebee boxes with their bumblebees and the buzz bed (L8), and a card on the box.
 * Draws: the props (boxes) 1, the small things (misses, bees, flowers, the puddle) 1, the rovers 3, their
 * markings 1 — only while the forecourt is near or mid.
 */
import * as THREE from 'three';
import type { Text, ZoneContext } from '@/core/zones';
import type { Vec3Tuple } from '../layout';
import type { Director } from './director';
import type { FarmLink, People } from './people';
import type { LifeSounds } from './sound';
import type { LifeTier } from './types';
import { BEES, FARM, SPOTS } from './tuning';
// (the farm's arm positions come with its events; life never imports a zone, plan §4.12)
import { PAL, col } from './geo';
import { roverParts } from '../landscape/rovers';
import { Markings, drawMarkings, followDetour, safeRobot, safetyStep, type SafeRobot } from './reactive';
import { droneMissions } from '../landscape/drones';

export interface Farm extends FarmLink {
  stats(): Record<string, unknown>;
}

/** 'sonnenacker:shift' (WP9): an arm's state; the ones that leave a fruit on the vine, and the calls for help */
const MISS = new Set(['miss', 'missed', 'verfehlt', 'fehlgriff', 'skip', 'skipped']);
const WEAR = new Set(['worn', 'wear', 'verschleiss', 'finger']);

const v3 = (p: Vec3Tuple): THREE.Vector3 => new THREE.Vector3(p[0], p[1], p[2]);
const T = (de: string, en: string): Text => ({ de, en });

interface Rover {
  pos: THREE.Vector3;
  heading: number;
  safe: SafeRobot;
  wp: number;
  dwell: number;
  wheel: number;
  carrying: boolean;
  stuck: number;
  jiggle: number;
  on: (e: 'greet' | 'replan' | 'rejoin') => void;
}

export function buildFarm(ctx: ZoneContext, h: { director: Director; people: People; paint: THREE.Material; heightAt(x: number, z: number): number; sounds: LifeSounds }): Farm {
  const D = h.director;
  // WP9's Sonnenacker has code: its Hummelkästen take the bumblebees, its EMI-08 the card on them
  const farmIn = !!ctx.zones.list({ kind: 'all' }).find((m) => m.id === 'sonnenacker')?.hasCode;
  const HIVES: Vec3Tuple[] = farmIn ? SPOTS.farmHives : SPOTS.hives;
  const root = new THREE.Group();
  root.name = 'life:farm';
  D.roots.ground.add(root);
  const y0 = (x: number, z: number): number => h.heightAt(x, z);

  // ── the props: one instanced box mesh (crates, tomato layers, the cart, the shop table, hives, the plate) ──
  const boxGeo = col(new THREE.BoxGeometry(1, 1, 1), 0xffffff);
  ctx.onDispose(() => boxGeo.dispose());
  const props = new THREE.InstancedMesh(boxGeo, h.paint, 96);
  props.name = 'life:farm-props';
  props.castShadow = true;
  props.receiveShadow = true;
  props.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(props);
  D.track(props);
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _c = new THREE.Color();
  const _e = new THREE.Euler();
  const Y = new THREE.Vector3(0, 1, 0);
  let nProps = 0;
  const putBox = (i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number, yaw = 0): void => {
    _m.compose(_p.set(x, y + sy / 2, z), _q.setFromAxisAngle(Y, yaw), _s.set(sx, sy, sz));
    props.setMatrixAt(i, _m);
    props.setColorAt(i, _c.setHex(hex));
  };
  const hideBox = (i: number): void => {
    _m.makeScale(0, 0, 0).setPosition(SPOTS.depot[0], 0, SPOTS.depot[2]);
    props.setMatrixAt(i, _m);
  };
  /** a crate full of cherry tomatoes: a timber crate and the red layer in it (2 boxes) */
  const crate = (i: number, x: number, y: number, z: number, yaw: number, full = true): void => {
    putBox(i, x, y, z, 0.5, 0.26, 0.34, PAL.timberFresh, yaw);
    if (full) putBox(i + 1, x, y + 0.2, z, 0.44, 0.07, 0.28, PAL.tomato, yaw);
    else hideBox(i + 1);
  };
  // the static props (placed once)
  const STATIC0 = nProps;
  {
    const [sx, , sz] = SPOTS.shop;
    const g = y0(sx, sz);
    // the shop table (timber top on two trestles) with six crates
    putBox(nProps++, sx, g + 0.72, sz, 2.6, 0.06, 0.9, PAL.timberSilver, 0.25);
    putBox(nProps++, sx - 1.0, g, sz, 0.12, 0.72, 0.8, PAL.timberSilver, 0.25);
    putBox(nProps++, sx + 1.0, g, sz, 0.12, 0.72, 0.8, PAL.timberSilver, 0.25);
    for (let k = 0; k < 4; k++) {
      const a = 0.25;
      const ox = -0.9 + k * 0.6;
      crate(nProps, sx + Math.cos(a) * ox, g + 0.78, sz - Math.sin(a) * ox, a);
      nProps += 2;
    }
    // the technician's tool cart
    const [tx, , tz] = SPOTS.toolCart;
    const gt = y0(tx, tz);
    putBox(nProps++, tx, gt + 0.12, tz, 0.9, 0.62, 0.55, PAL.slate);
    putBox(nProps++, tx, gt + 0.74, tz, 0.95, 0.05, 0.6, PAL.stoneDark);
    putBox(nProps++, tx + 0.2, gt + 0.79, tz, 0.3, 0.14, 0.2, PAL.carbon);
    // the drone's landing plate beside it: carbon, a thin teal edge (the landing marker is data)
    const [dx, , dz] = SPOTS.dronePad;
    putBox(nProps++, dx, y0(dx, dz), dz, 1.6, 0.04, 1.6, PAL.teal);
    putBox(nProps++, dx, y0(dx, dz) + 0.001, dz, 1.5, 0.042, 1.5, PAL.carbon);
    // the two bumblebee boxes (L8) on short posts: a timber box, a clay roof (WP9's farm brings its own)
    for (const [hx, , hz] of farmIn ? [] : SPOTS.hives) {
      const gh = y0(hx, hz);
      putBox(nProps++, hx, gh, hz, 0.08, 0.6, 0.08, PAL.timberSilver);
      putBox(nProps++, hx, gh + 0.6, hz, 0.46, 0.3, 0.36, PAL.timberFresh, Math.PI / 2);
      putBox(nProps++, hx, gh + 0.9, hz, 0.56, 0.05, 0.46, PAL.clay, Math.PI / 2);
      putBox(nProps++, hx + 0.231, gh + 0.66, hz, 0.01, 0.04, 0.12, PAL.carbon);
    }
  }
  const STATIC1 = nProps;
  // the flower strip's stems by the hives (the bumblebees' flowers sit on them)
  const STEM0 = nProps;
  nProps += 16;
  // the depot stack: FARM.stackMax crates (2 boxes each)
  const STACK0 = nProps;
  nProps += FARM.stackMax * 2;
  // the crates on the rovers' trays
  const TRAY0 = nProps;
  nProps += FARM.rovers * 2;
  // the plate over the puddle (once laid)
  const PLATE = nProps++;
  props.count = nProps;
  void STATIC0;
  void STATIC1;

  // ── the small things: misses on the vine, bumblebees, flowers by the hives, the puddle ──
  const smallGeo = col(new THREE.IcosahedronGeometry(0.5, 1), 0xffffff);
  ctx.onDispose(() => smallGeo.dispose());
  const MISS0 = 0;
  const BEE0 = MISS0 + FARM.maxMisses;
  const FLOWER0 = BEE0 + BEES.count;
  const FLOWERS = 16;
  const PUDDLE = FLOWER0 + FLOWERS;
  const smalls = new THREE.InstancedMesh(smallGeo, h.paint, PUDDLE + 1);
  smalls.name = 'life:farm-smalls';
  smalls.castShadow = false;
  smalls.receiveShadow = true;
  smalls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(smalls);
  D.track(smalls);
  const hideSmall = (i: number): void => {
    _m.makeScale(0, 0, 0).setPosition(SPOTS.gate[0], 0, SPOTS.gate[2]);
    smalls.setMatrixAt(i, _m);
  };
  const putSmall = (i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number): void => {
    _m.compose(_p.set(x, y, z), _q.identity(), _s.set(sx, sy, sz));
    smalls.setMatrixAt(i, _m);
    smalls.setColorAt(i, _c.setHex(hex));
  };
  for (let i = 0; i < smalls.count; i++) hideSmall(i);
  // the puddle: a flat dark-water oval on the rovers' way
  const [px, , pz] = SPOTS.puddle;
  putSmall(PUDDLE, px, y0(px, pz) + 0.008, pz, 2.1, 0.012, 1.5, PAL.water);
  // flowers on the hedge line by the hives (the bumblebees' targets)
  const flowers: THREE.Vector3[] = [];
  HIVES.forEach(([hx, , hz], k) => {
    for (let i = 0; i < FLOWERS / 2; i++) {
      const a = (i / (FLOWERS / 2)) * Math.PI * 2 + k;
      const r = 1.6 + (i % 3) * 1.4;
      const fx = hx - 1.2 + Math.cos(a) * r * 0.5,
        fz = hz + Math.sin(a) * r;
      const g0 = y0(fx, fz);
      const fy = g0 + 0.32 + (i % 4) * 0.09;
      flowers.push(new THREE.Vector3(fx, fy, fz));
      putSmall(FLOWER0 + k * (FLOWERS / 2) + i, fx, fy, fz, 0.07, 0.035, 0.07, i % 3 ? 0xf5e9c8 : 0xe8c547);
      putBox(STEM0 + k * (FLOWERS / 2) + i, fx, g0, fz, 0.012, fy - g0, 0.012, PAL.crop);
    }
  });

  // ── the depot stack and the Hof-Takt ─────────────────────────────────────────
  let stack = 4;
  const drawStack = (): void => {
    const [dx, , dz] = SPOTS.depot;
    const g = y0(dx, dz);
    for (let i = 0; i < FARM.stackMax; i++) {
      const layer = Math.floor(i / 4),
        k = i % 4;
      const b = STACK0 + i * 2;
      if (i < stack) crate(b, dx + (k % 2) * 0.56 - 0.28, g + layer * 0.27, dz + Math.floor(k / 2) * 0.4 - 0.2, 0.1);
      else {
        hideBox(b);
        hideBox(b + 1);
      }
    }
  };
  drawStack();
  // the transport empties the stack (a cargo copter picks it up for the island, SHOULD; here: the trolley)
  D.onPhase((phase) => {
    if (phase === 'abtransport') {
      stack = Math.min(stack, 2);
      drawStack();
    }
  });

  // ── the crate rovers ───────────────────────────────────────────────────────
  const P = roverParts(ctx);
  const bodies = new THREE.InstancedMesh(P.body, P.bodyMat, FARM.rovers);
  const wheels = new THREE.InstancedMesh(P.wheel, P.wheelMat, FARM.rovers * 4);
  const eyes = new THREE.InstancedMesh(P.eye, P.eyeMat, FARM.rovers);
  bodies.name = 'life:farm-rovers';
  bodies.castShadow = true;
  for (const m of [bodies, wheels, eyes]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(m);
    D.track(m);
  }
  const marks = new Markings(root, h.paint, 120, 'life:farm-markings');
  D.track(marks.mesh);
  // the loop: load at the gate, out on the north lane past the puddle, unload at the depot, back on the south lane
  const ROUTE: Vec3Tuple[] = SPOTS.roverLoop;
  const LOAD = 0,
    UNLOAD = 2;
  const route = ROUTE.map(v3);
  for (const p of route) p.y = y0(p.x, p.z);
  const rovers: Rover[] = [];
  for (let i = 0; i < FARM.rovers; i++) {
    const wp = (i * 2) % route.length;
    const pos = route[wp].clone();
    const r: Rover = { pos, heading: 0, safe: safeRobot(pos), wp: (wp + 1) % route.length, dwell: i * 1.5, wheel: 0, carrying: i !== 1, stuck: 0, jiggle: 0, on: () => {} };
    r.on = (e) => onSafety(r, e);
    rovers.push(r);
  }
  /** „Rover 5“ (EMI-01 calls it that): the one that meets the puddle */
  const rover5 = rovers[1];
  let puddle: 'wet' | 'plated' = ctx.progress.get<boolean>('lifePlate', false) ? 'plated' : 'wet';
  let stuckPasses = 0;
  let plateWanted = false;
  let replans = 0;
  let replansByYou = 0;
  const drawPlate = (): void => {
    const [x, , z] = SPOTS.puddle;
    if (puddle === 'plated') putBox(PLATE, x, y0(x, z) + 0.004, z, 1.5, 0.02, 1.05, 0x8a847d, 0.15);
    else hideBox(PLATE);
  };
  drawPlate();
  const onSafety = (r: Rover, e: 'greet' | 'replan' | 'rejoin'): void => {
    if (e === 'greet') ctx.audio.tone({ freq: 1320, to: 1760, dur: 0.07, type: 'sine', volume: 0.3, at: [r.pos.x, r.pos.y + 0.6 - D.altitude, r.pos.z] });
    if (e === 'replan') {
      replans++;
      if (r.safe.byPlayer) {
        replansByYou++;
        // egg 5 counts the farm's rovers too (R9 §4.3: „stand in the puddle, it replans with A*“)
        ctx.events.emit('life:replan', { byPlayer: true, at: [r.pos.x, r.pos.y, r.pos.z] });
      }
    }
  };
  const puddleDisc = new Float32Array([SPOTS.puddle[0], SPOTS.puddle[2], 1.35]);
  let aroundPuddle = 0;
  const INP = {
    dt: 0,
    player: new THREE.Vector3(),
    playerOn: false,
    others: h.people.obstacles,
    rejoin: new THREE.Vector3(),
    walkable: (x: number, z: number): boolean => x > -214.8 || Math.abs(z - SPOTS.gate[2]) < 2.2,
    searchDiscs: puddleDisc,
    searchDiscN: 0,
  };
  let tier: LifeTier = 'hidden';
  const _wq = new THREE.Quaternion();
  const _v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const writeRovers = (): void => {
    for (let i = 0; i < rovers.length; i++) {
      const r = rovers[i];
      const jig = r.jiggle > 0 ? Math.sin(r.jiggle * 40) * 0.03 : 0;
      _wq.setFromEuler(_e.set(0, r.heading + jig, jig * 0.6));
      bodies.setMatrixAt(i, _m.compose(r.pos, _wq, one));
      const blink = r.safe.blinkT > 0 && Math.floor(r.safe.blinkT / 0.13) % 2 === 0;
      eyes.setMatrixAt(i, blink ? _m.compose(r.pos, _wq, _s.set(1, 0.12, 1)) : _m);
      for (let k = 0; k < 4; k++) {
        _v.copy(P.wheelOff[k]).applyQuaternion(_wq).add(r.pos);
        _q.copy(_wq).multiply(_q2.setFromAxisAngle(_X, r.wheel));
        wheels.setMatrixAt(i * 4 + k, _m.compose(_v, _q, one));
      }
      const b = TRAY0 + i * 2;
      if (r.carrying) {
        _v.set(0, P.size.h + 0.1, 0.22).applyQuaternion(_wq).add(r.pos);
        crate(b, _v.x, _v.y, _v.z, r.heading + jig);
      } else {
        hideBox(b);
        hideBox(b + 1);
      }
    }
    for (const m of [bodies, wheels, eyes]) m.instanceMatrix.needsUpdate = true;
  };
  const _q2 = new THREE.Quaternion();
  const _X = new THREE.Vector3(1, 0, 0);
  const stepRover = (r: Rover, dt: number): void => {
    if (r.jiggle > 0) r.jiggle -= dt;
    // loading and unloading
    if (r.dwell > 0) {
      r.dwell -= dt;
      return;
    }
    // stuck in the puddle: wheels spin, the ring turns amber, then it backs out and plans around it
    if (r.stuck > 0) {
      r.stuck -= dt;
      r.wheel -= 28 * dt;
      r.jiggle = 0.2;
      if (r.safe.blinkT > 0) r.safe.blinkT -= dt;
      if (r.stuck <= 0) {
        // back out, then plan around the puddle (its A* frontier shows: a fix becomes data)
        r.pos.x += Math.sin(r.heading) * 0.9;
        r.pos.z += Math.cos(r.heading) * 0.9;
        r.safe.forceReplan = true;
        aroundPuddle = 2;
      }
      return;
    }
    const target = route[r.wp];
    INP.dt = dt;
    INP.player.copy(D.feetGround);
    INP.playerOn = Math.abs(D.feetGround.y - r.pos.y) < 1.6;
    INP.rejoin.copy(route[r.wp]);
    // the puddle is a search obstacle for the rover that has just backed out of it
    INP.searchDiscN = r === rover5 && aroundPuddle > 0 ? 1 : 0;
    const k = safetyStep(r.safe, INP, r.on);
    if (r === rover5 && r.safe.state === 'detour') aroundPuddle = 0;
    if (r.safe.state === 'detour') {
      r.wheel -= (FARM.speed / 0.13) * dt;
      // the detour ends at the waypoint it was heading for
      if (followDetour(r.safe, dt, FARM.speed)) r.pos.y = y0(r.pos.x, r.pos.z);
      r.heading = r.safe.heading;
      return;
    }
    if (k <= 0) return;
    const dx = target.x - r.pos.x,
      dz = target.z - r.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.12) {
      if (r.wp === LOAD) {
        r.carrying = true;
        r.dwell = FARM.dwellS;
      } else if (r.wp === UNLOAD && r.carrying) {
        r.carrying = false;
        r.dwell = FARM.dwellS;
        stack = Math.min(FARM.stackMax, stack + 1);
        drawStack();
      }
      r.wp = (r.wp + 1) % route.length;
      return;
    }
    // Rover 5 meets the wet puddle: stuck, three passes in a row (R9 §4.3)
    if (r === rover5 && puddle === 'wet' && Math.hypot(r.pos.x - SPOTS.puddle[0], r.pos.z - SPOTS.puddle[2]) < 0.75 && tier !== 'far' && tier !== 'hidden') {
      stuckPasses++;
      r.stuck = FARM.stuckS;
      ctx.audio.tone({ freq: 440, to: 330, dur: 0.22, type: 'triangle', volume: 0.32, at: [r.pos.x, r.pos.y + 0.6 - D.altitude, r.pos.z] });
      r.safe.blinkT = 0.9;
      if (stuckPasses >= FARM.stuckPasses) plateWanted = true;
      // jump the waypoint past the puddle, so the backed-out rover plans around it
      r.wp = (r.wp + 1) % route.length;
      return;
    }
    const s = Math.min(d, FARM.speed * k * dt);
    r.pos.x += (dx / d) * s;
    r.pos.z += (dz / d) * s;
    r.pos.y = y0(r.pos.x, r.pos.z);
    r.wheel -= (s / 0.13);
    const want = Math.atan2(-dx, -dz);
    r.heading += Math.atan2(Math.sin(want - r.heading), Math.cos(want - r.heading)) * (1 - Math.exp(-dt * 5));
  };
  const step = (dt: number): void => {
    marks.begin();
    for (const r of rovers) {
      stepRover(r, dt);
      const pd = INP.playerOn ? Math.hypot(D.feetGround.x - r.pos.x, D.feetGround.z - r.pos.z) : Infinity;
      drawMarkings(marks, r.safe, r.pos.y + 0.026, r.stuck > 0 ? 0 : pd);
    }
    marks.end();
    writeRovers();
    props.instanceMatrix.needsUpdate = true;
    if (props.instanceColor) props.instanceColor.needsUpdate = true;
  };
  D.register({
    id: 'farm:rovers',
    area: 'hof',
    job: T('Kisten zum Packplatz fahren', 'Carry crates to the depot'),
    kind: 'rover',
    near: (dt) => step(dt),
    mid: (dt) => step(dt),
    tier: (t) => {
      tier = t;
      const show = t === 'near' || t === 'mid';
      root.visible = show;
      if (show) writeRovers();
    },
  });
  for (const r of rovers) D.register({ id: `farm:rover-proxy`, area: 'hof', job: T('Kistenrover', 'Crate rover'), kind: 'rover', far: { proxy: 'vehicle', at: (out) => out.copy(r.pos) } });

  // ── misses on the vine (WP9's arms; 'sonnenacker:shift') ──────────────────
  interface Miss {
    id: number;
    at: THREE.Vector3;
    arm: string;
    t: number;
  }
  const misses: Miss[] = [];
  let missId = 1;
  let shiftSeen = false;
  const drawMisses = (): void => {
    for (let i = 0; i < FARM.maxMisses; i++) {
      const m = misses[i];
      if (m) putSmall(MISS0 + i, m.at.x, m.at.y, m.at.z, 0.03, 0.028, 0.03, PAL.tomato);
      else hideSmall(MISS0 + i);
    }
    smalls.instanceMatrix.needsUpdate = true;
    if (smalls.instanceColor) smalls.instanceColor.needsUpdate = true;
  };
  /** the arms of the last shift snapshot (the finger story's target) */
  const arms: THREE.Vector3[] = [];
  const addMiss = (at: THREE.Vector3, arm: string): void => {
    if (misses.some((m) => m.arm === arm && D.clock.t - m.t < 15)) return;
    if (misses.length >= FARM.maxMisses) misses.shift();
    misses.push({ id: missId++, at, arm, t: D.clock.t });
    drawMisses();
  };
  const v3w = (a: Vec3Tuple | { x: number; y: number; z: number }): THREE.Vector3 => (Array.isArray(a) ? v3(a) : new THREE.Vector3(a.x, a.y, a.z));
  ctx.events.on('sonnenacker:shift', (e?: { phase?: string; arms?: { id?: string | number; state?: string; at?: Vec3Tuple | { x: number; y: number; z: number } }[] }) => {
    shiftSeen = true;
    const list = e?.arms ?? [];
    arms.length = 0;
    for (const a of list) {
      if (!a?.at) continue;
      const at = v3w(a.at);
      arms.push(at);
      const arm = String(a.id ?? '');
      if (a.state && MISS.has(a.state)) addMiss(at.clone().add(_v.set((Math.random() - 0.5) * 0.3, 0.9, (Math.random() - 0.5) * 0.3)), arm);
      else if (a.state && WEAR.has(a.state)) callFinger(at.clone());
    }
  });
  // WP9: every pick; a miss stays on the vine where the arm tried (the Nachlese takes it)
  ctx.events.on('sonnenacker:pick', (e?: { arm?: string; ok?: boolean; at?: Vec3Tuple }) => {
    if (!e || e.ok || !e.at) return;
    addMiss(v3(e.at), String(e.arm ?? ''));
  });
  // where the Sonnenacker's beds and lanes really are (WP9, optional): the people's fallback spots are replaced
  let beds: THREE.Vector3[] = SPOTS.beds.map(v3);
  let lane: THREE.Vector3[] = SPOTS.lane.map(v3);
  ctx.events.on('sonnenacker:layout', (e?: { beds?: Vec3Tuple[]; lane?: Vec3Tuple[] }) => {
    if (e?.beds?.length) beds = e.beds.map(v3);
    if (e?.lane?.length) lane = e.lane.map(v3);
  });

  // ── „Ersatzfinger per Drohne“ (R9 §4.3) ─────────────────────────────────────
  let finger: { state: 'called' | 'landed' | 'taken' | 'done'; arm: THREE.Vector3 } | null = null;
  let fingerPlayed = false;
  let hofNearT = 0;
  const pad = v3(SPOTS.dronePad);
  pad.y = y0(pad.x, pad.z) + 0.1;
  function callFinger(arm: THREE.Vector3): void {
    if (finger || !droneMissions.dispatch) return;
    const f = { state: 'called' as 'called' | 'landed' | 'taken' | 'done', arm };
    const ok = droneMissions.dispatch({
      to: [pad.x, pad.y, pad.z],
      cruise: 24,
      speed: 9,
      stayS: 40,
      vspeed: 5,
      // it waits on the pad until the technician has taken the finger (or 40 s)
      until: () => f.state === 'taken' || f.state === 'done',
      onArrive: () => {
        f.state = 'landed';
        ctx.events.emit('life:story', { id: 'ersatzfinger', phase: 'landed' });
      },
      onLeave: () => {
        if (f.state === 'landed') f.state = 'taken';
      },
    });
    if (!ok) return;
    finger = f;
    fingerPlayed = true;
    ctx.events.emit('life:story', { id: 'ersatzfinger', phase: 'called', arm: [arm.x, arm.y, arm.z] });
  }
  // once per visit (the player at the forecourt or the field for a minute), unless WP9 calls it first
  D.register({
    id: 'farm:stories',
    area: 'hof',
    job: T('Wartung', 'Maintenance'),
    kind: 'machine',
    mid: (dt) => {
      hofNearT += dt;
      if (!fingerPlayed && !finger && hofNearT > 55) callFinger((arms.length ? arms[(Math.random() * arms.length) | 0] : beds[3]).clone());
    },
    tier: (t) => {
      if (t === 'far' || t === 'hidden') hofNearT = 0;
    },
  });

  // ── the bumblebees (L8): only near; they visit the flowers by the hives and buzz ──
  interface Bee {
    p: THREE.Vector3;
    to: THREE.Vector3;
    from: THREE.Vector3;
    t: number;
    dur: number;
    sit: number;
    hive: number;
  }
  const bees: Bee[] = [];
  for (let i = 0; i < BEES.count; i++) {
    const hive = i % HIVES.length;
    const [hx, , hz] = HIVES[hive];
    const p = new THREE.Vector3(hx, y0(hx, hz) + 0.8, hz);
    bees.push({ p, to: p.clone(), from: p.clone(), t: 1, dur: 1, sit: Math.random() * 2, hive });
  }
  const flowersOf = HIVES.map((_, k) => flowers.slice(k * (FLOWERS / 2), (k + 1) * (FLOWERS / 2)));
  const hiveDoor = HIVES.map(([x, , z]) => new THREE.Vector3(x + 0.25, y0(x, z) + (farmIn ? 0.95 : 0.66), z));
  let beesShown = false;
  let buzzAcc = 0;
  const stepBees = (dt0: number): void => {
    // R9 §4.5: no bees on the low tier; under reduced motion they bumble at half speed
    if (ctx.settings.quality === 'low') {
      if (beesShown) {
        beesShown = false;
        for (let i = 0; i < bees.length; i++) hideSmall(BEE0 + i);
        smalls.instanceMatrix.needsUpdate = true;
      }
      return;
    }
    beesShown = true;
    const dt = ctx.settings.reducedMotion ? dt0 * 0.5 : dt0;
    for (let i = 0; i < bees.length; i++) {
      const b = bees[i];
      if (b.sit > 0) {
        b.sit -= dt;
        if (b.sit <= 0) {
          // next: a flower near its hive, now and then home
          const own = flowersOf[b.hive];
          const nxt = Math.random() < 0.15 ? hiveDoor[b.hive] : own[Math.floor(Math.random() * own.length)];
          b.from.copy(b.p);
          b.to.copy(nxt).add(_s.set((Math.random() - 0.5) * 0.12, 0.03, (Math.random() - 0.5) * 0.12));
          b.t = 0;
          b.dur = Math.max(0.6, b.from.distanceTo(b.to) / BEES.speed);
        }
      } else {
        b.t += dt / b.dur;
        const k = Math.min(1, b.t);
        b.p.lerpVectors(b.from, b.to, k);
        // a wobbly, bumbling flight
        b.p.y += Math.sin(k * Math.PI) * 0.35 + Math.sin(b.t * 31 + i) * 0.02;
        b.p.x += Math.sin(b.t * 23 + i * 2) * 0.03;
        if (k >= 1) b.sit = BEES.buzzS * (0.6 + Math.random() * 0.8);
      }
      const buzz = b.sit > 0 ? Math.sin(D.clock.t * 90 + i) * 0.004 : 0;
      putSmall(BEE0 + i, b.p.x + buzz, b.p.y, b.p.z, 0.026, 0.018, 0.036, i % 4 ? 0x3a2f1e : 0xd9a425);
    }
    // the buzz of one bee on a flower close to you
    buzzAcc -= dt;
    if (buzzAcc <= 0) {
      buzzAcc = 1.6 + Math.random() * 2;
      const fp = D.feetGround;
      for (const b of bees)
        if (b.sit > 0 && Math.hypot(b.p.x - fp.x, b.p.z - fp.z) < 3.5) {
          h.sounds.buzz(b.p);
          break;
        }
    }
    smalls.instanceMatrix.needsUpdate = true;
    if (smalls.instanceColor) smalls.instanceColor.needsUpdate = true;
  };
  // the buzz bed follows the nearer hive
  const hiveAnchors = HIVES.map(([x, , z]) => {
    const o = new THREE.Object3D();
    o.position.set(x, y0(x, z) + 0.7, z);
    root.add(o);
    return o;
  });
  const dripAnchor = new THREE.Object3D();
  dripAnchor.position.set(SPOTS.gate[0] - 3, y0(SPOTS.gate[0], SPOTS.gate[2]) + 0.3, SPOTS.gate[2]);
  root.add(dripAnchor);
  D.register({
    id: 'farm:bees',
    // with the farm in, its boxes stand at the bed ends (the field's area)
    area: farmIn ? 'sonnenacker' : 'hof',
    job: T('Tomaten bestäuben (Hummeln)', 'Pollinate the tomatoes (bumblebees)'),
    kind: 'animal',
    near: (dt) => stepBees(dt),
    tier: (t) => {
      const near = t === 'near';
      if (near !== beesShown) {
        beesShown = near;
        if (!near) {
          for (let i = 0; i < bees.length; i++) hideSmall(BEE0 + i);
          smalls.instanceMatrix.needsUpdate = true;
        }
      }
      const fp = D.feetGround;
      const nearer = Math.hypot(fp.x - HIVES[0][0], fp.z - HIVES[0][2]) < Math.hypot(fp.x - HIVES[1][0], fp.z - HIVES[1][2]) ? 0 : 1;
      h.sounds.beesAt(near ? hiveAnchors[nearer] : null, 0.9);
      h.sounds.dripAt(near || t === 'mid' ? dripAnchor : null, D.clock.phase === 'bewaesserung' ? 1 : 0.35);
    },
  });
  D.onPhase((phase) => {
    if (D.tierOf('hof') === 'near' || D.tierOf('hof') === 'mid') h.sounds.dripAt(dripAnchor, phase === 'bewaesserung' ? 1 : 0.35);
  });
  // the hive's card (the bumblebee hook, R9 §5.4): E on either box
  const hiveCard = (): void => {
    void ctx.hud.openInfoCard({
      eyebrow: T('// HUMMELKASTEN', '// BUMBLEBEE BOX'),
      title: T('Die Arme ernten. Bestäuben müssen die Hummeln.', 'The arms harvest. The bumblebees pollinate.'),
      chips: [{ type: 'quelle', source: T('Cooley, Vallejo-Marín (2021), J. Econ. Entomol.; De Luca et al. (2019) · Stand 2026-10', 'Cooley, Vallejo-Marín (2021), J. Econ. Entomol.; De Luca et al. (2019) · as of 2026-10') }],
      body: T(
        'Tomatenblüten geben ihren Pollen erst frei, wenn etwas sie schüttelt. Hummeln tun das mit ihren Flugmuskeln, meist mit etwa 100 bis 400 Hertz. Bienen, die so vibrieren, steigerten in einer Studie das Fruchtgewicht von Tomaten, Honigbienen nicht deutlich. Darum stehen hier Hummelkästen: Die Roboter ernten, die Hummeln bestäuben.',
        'Tomato flowers only release their pollen when something shakes them. Bumblebees do it with their flight muscles, usually at about 100 to 400 hertz. In one study, bees that buzz like this raised tomato fruit weight, honeybees did not do so significantly. That is why there are bumblebee boxes here: the robots harvest, the bumblebees pollinate.',
      ),
    });
  };
  for (const [hx, , hz] of farmIn ? [] : SPOTS.hives) {
    const probe = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.5), h.paint);
    probe.position.set(hx, y0(hx, hz) + 0.65, hz);
    probe.visible = false;
    root.add(probe);
    ctx.onDispose(() => probe.geometry.dispose());
    ctx.addInteractable({ object: probe, label: T('Hummelkasten ansehen', 'Look at the bumblebee box'), range: 2.6, highlight: false, onInteract: hiveCard });
  }

  // ── what the people use ─────────────────────────────────────────────────────
  const depot = v3(SPOTS.depot);
  depot.y = y0(depot.x, depot.z);
  return {
    depot,
    nearestMiss(from) {
      let best: Miss | null = null;
      let bd = Infinity;
      for (const m of misses) {
        const d = Math.hypot(m.at.x - from.x, m.at.z - from.z);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      if (!best) return null;
      const id = best.id;
      // they stand in the aisle beside the bed (WP9's beds run east–west, 2.4 m apart, aisles between)
      let z = best.at.z;
      if (farmIn) {
        let bz = z;
        let bd2 = Infinity;
        for (let k = -1; k <= 6; k++) {
          const az = 64.8 - k * 2.4;
          if (Math.abs(az - z) < bd2) {
            bd2 = Math.abs(az - z);
            bz = az;
          }
        }
        z = bz;
      }
      return { id, at: new THREE.Vector3(best.at.x, y0(best.at.x, z), z), fruit: best.at.clone() };
    },
    pickMiss(id) {
      const i = misses.findIndex((m) => m.id === id);
      if (i >= 0) {
        misses.splice(i, 1);
        drawMisses();
      }
    },
    plateWanted: () => plateWanted && puddle === 'wet',
    plateLaid() {
      puddle = 'plated';
      plateWanted = false;
      ctx.progress.set('lifePlate', true);
      drawPlate();
      props.instanceMatrix.needsUpdate = true;
      if (D.tierOf('hof') === 'near' || D.tierOf('hof') === 'mid')
        ctx.events.emit('radio:say', { owner: 'life', line: T('Jeder Sonderfall einmal. Danach ist er Daten.', 'Every edge case once. After that, it’s data.'), delay: 2 });
      ctx.events.emit('life:story', { id: 'pfuetze', phase: 'plated' });
    },
    fingerWaiting: () => (finger && finger.state === 'landed' ? { at: pad, arm: finger.arm } : null),
    fingerTaken() {
      if (finger) finger.state = 'taken';
    },
    fingerSwapped() {
      if (!finger) return;
      finger.state = 'done';
      finger = null;
      ctx.events.emit('life:story', { id: 'ersatzfinger', phase: 'swapped' });
      if (D.tierOf('hof') === 'near' || D.tierOf('sonnenacker') === 'near')
        ctx.events.emit('radio:say', { owner: 'life', line: T('Greifer nutzen sich ab. Gute Planung tauscht vorher.', 'Grippers wear out. Good planning swaps them early.'), delay: 1.5 });
    },
    bedSpots: () => beds,
    lane: () => lane,
    stats: () => ({ stack, misses: misses.length, puddle, stuckPasses, replans, replansByYou, finger: finger?.state ?? null, fingerPlayed, shiftSeen, tier }),
  };
}
