/**
 * WP15 — the eight people with jobs (plan §4.12 L7, D18; R9 §4.1–§4.3):
 *  1. the agronomist with a tablet at the beds,      5–6. two visitors at the Hofladen,
 *  2. the technician (gripper finger, the plate),      7. a dock crew member at the bridge head,
 *  3–4. two Nachlese pickers with baskets,             8. a mechanic in the Werft.
 * No names, no dialogue (EMI-01 speaks about them). People yield to you, robots yield to people
 * (`obstacles`), nobody blocks a route for more than 2 s. They look at you, greet you once, wave at a
 * rotor beat and at the lift-off, and walk to the apron edge when the lift-off is armed and you are on
 * the Ausguck (the crowd of C1); the dock crew member rides up and stands at the Ausguck rail.
 */
import * as THREE from 'three';
import type { Text } from '@/core/zones';
import type { Vec3Tuple } from '../layout';
import type { Director } from './director';
import type { LifeClock, LifeTier, ReactKind } from './types';
import { Crowd, restPose, type PersonLook, type PersonPose, type Prop } from './crowd';
import { AREAS, PEOPLE, SPOTS } from './tuning';
import { PAL } from './geo';

type Act = 'stand' | 'tablet' | 'crouch' | 'reach' | 'look' | 'carry';
type Task = { k: 'go'; to: THREE.Vector3; speed?: number; prop?: Prop; act?: Act } | { k: 'do'; s: number; act: Act; prop?: Prop; face?: THREE.Vector3 | null; then?: () => void };

/** what the farm (farm.ts) offers the people: misses to pick, the puddle story, the finger story, the beds */
export interface FarmLink {
  /** the nearest miss: where to stand (the aisle) and the fruit itself */
  nearestMiss(from: THREE.Vector3): { id: number; at: THREE.Vector3; fruit: THREE.Vector3 } | null;
  pickMiss(id: number): void;
  /** the technician lays the plate over the puddle (the third stuck pass) */
  plateWanted(): boolean;
  plateLaid(): void;
  /** the finger drone landed here; the arm that needs it */
  fingerWaiting(): { at: THREE.Vector3; arm: THREE.Vector3 } | null;
  fingerTaken(): void;
  fingerSwapped(): void;
  /** bed ends the agronomist checks, the field lane */
  bedSpots(): readonly THREE.Vector3[];
  lane(): readonly THREE.Vector3[];
  /** the depot where crates are sorted */
  depot: THREE.Vector3;
}

export interface Person {
  readonly id: string;
  readonly job: Text;
  readonly pos: THREE.Vector3;
  readonly look: PersonLook;
  area: string;
  readonly frame: 'ground' | 'island';
  gathered: boolean;
}

export interface People {
  readonly list: readonly Person[];
  /** ground-frame points the farm's robots yield to (people), updated each tick */
  readonly obstacles: readonly THREE.Vector3[];
  gather(on: boolean, o: { siteStamped: boolean }): void;
  readonly gathered: boolean;
  /** tools (life:crowd): the gather state */
  crowdState(): { gathered: boolean; members: { id: string; pos: Vec3Tuple; frame: string; atSpot: boolean }[]; crew: { pos: Vec3Tuple; frame: string; atRail: boolean } };
  /** tools (life:people): each person's place, area, task and whether they wave or show */
  peopleState(): { id: string; area: string; frame: string; pos: Vec3Tuple; task: string | null; waving: boolean; visible: boolean }[];
}

const v3 = (p: Vec3Tuple): THREE.Vector3 => new THREE.Vector3(p[0], p[1], p[2]);
const _d = new THREE.Vector3();
const _f = new THREE.Vector3();

interface Host {
  director: Director;
  heightAt(x: number, z: number): number;
  material: THREE.Material;
  geometry: THREE.BufferGeometry;
  farm: () => FarmLink | null;
  /** the island's centre seen from a ground point (the way people face to wave) */
  islandDir(from: THREE.Vector3, out: THREE.Vector3): THREE.Vector3;
  reducedMotion(): boolean;
  /** the camera's forward (world) and position, to step in where nobody looks */
  camera: THREE.Camera;
  /** a soft voice-free sound when someone greets (the life bed's one-shots) */
  greet?(at: THREE.Vector3): void;
}

class Walker implements Person {
  readonly pos = new THREE.Vector3();
  yaw = 0;
  readonly pose: PersonPose = restPose();
  tasks: Task[] = [];
  task: Task | null = null;
  taskT = 0;
  /** the current plan was made for an urgent job (it is not interrupted again) */
  onUrgent = false;
  waveLeft = 0;
  waveYaw: number | null = null;
  greeted = -1e9;
  blockedT = 0;
  gathered = false;
  gatherSpot: THREE.Vector3 | null = null;
  crowd: Crowd;
  slot = -1;
  area: string;
  frame: 'ground' | 'island' = 'ground';
  lastTier: LifeTier = 'hidden';
  visible = false;
  constructor(
    readonly id: string,
    readonly job: Text,
    readonly look: PersonLook,
    crowd: Crowd,
    area: string,
    start: Vec3Tuple,
    readonly brain: (p: Walker, clock: LifeClock) => Task[],
    readonly speed = PEOPLE.walk,
    /** a job that cannot wait: true drops the current routine (the brain plans the job next) */
    readonly urgent: ((p: Walker) => boolean) | null = null,
  ) {
    this.crowd = crowd;
    this.area = area;
    this.pos.set(start[0], start[1], start[2]);
    this.slot = crowd.take(look);
  }
  moveTo(crowd: Crowd, area: string, frame: 'ground' | 'island', at: THREE.Vector3): void {
    this.crowd.release(this.slot);
    this.crowd = crowd;
    this.slot = crowd.take(this.look);
    this.area = area;
    this.frame = frame;
    this.pos.copy(at);
    this.tasks = [];
    this.task = null;
  }
}

/** Build the eight. Returns the People handle; their agents are registered with the director. */
export function buildPeople(host: Host): People {
  const D = host.director;
  const mk = (name: string, home: Vec3Tuple, frame: 'ground' | 'island' = 'ground', cap = 6): Crowd => {
    const c = new Crowd(frame === 'ground' ? D.roots.ground : D.roots.island, host.material, host.geometry, cap, `life:people:${name}`, new THREE.Vector3(home[0], home[1], home[2]));
    D.track(c.mesh);
    return c;
  };
  const crowds = {
    bridgehead: mk('bridgehead', AREAS.bridgehead.center, 'ground', 1),
    werft: mk('werft', AREAS.werft.center, 'ground', 1),
    farm: mk('farm', AREAS.hof.center, 'ground', 6),
    apron: mk('apron', AREAS.apron.center, 'ground', 5),
    ausguck: mk('ausguck', AREAS.ausguck.center, 'island', 1),
  };
  const H = PEOPLE.heights;
  const look = (height: number, build: number, jacket: number, trousers: number, skin: number, prop: number): PersonLook => ({ height, build, jacket, trousers, skin, prop });
  const T = (de: string, en: string): Text => ({ de, en });
  const farm = (): FarmLink | null => host.farm();
  const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
  const pick = <X>(xs: readonly X[]): X => xs[Math.floor(Math.random() * xs.length)];
  const go = (to: THREE.Vector3 | Vec3Tuple, o: { speed?: number; prop?: Prop; act?: Act } = {}): Task => ({ k: 'go', to: Array.isArray(to) ? v3(to) : to.clone(), ...o });
  const act = (s: number, a: Act, o: { prop?: Prop; face?: THREE.Vector3 | Vec3Tuple | null; then?: () => void } = {}): Task => ({ k: 'do', s, act: a, prop: o.prop, face: o.face ? (Array.isArray(o.face) ? v3(o.face) : o.face.clone()) : null, then: o.then });
  const near = (p: THREE.Vector3, at: THREE.Vector3 | Vec3Tuple, r: number): boolean => (Array.isArray(at) ? Math.hypot(p.x - at[0], p.z - at[2]) : Math.hypot(p.x - at.x, p.z - at.z)) < r;
  const off = (p: Vec3Tuple, dx: number, dz: number): THREE.Vector3 => new THREE.Vector3(p[0] + dx, p[1], p[2] + dz);

  // ── the brains (one routine per job) ────────────────────────────────────────
  const agronomin = (p: Walker, c: LifeClock): Task[] => {
    const f = farm();
    const beds = f?.bedSpots() ?? SPOTS.beds.map(v3);
    const lane = f?.lane() ?? SPOTS.lane.map(v3);
    const bed = pick(beds);
    // irrigation: she checks the drip lines at the bed ends, longer and crouched
    if (c.phase === 'bewaesserung') return [go(lane[0]), go(bed, { prop: 'tablet' }), act(rnd(6, 9), 'crouch', { prop: 'tablet', face: [bed.x - 4, 0, bed.z] })];
    return [go(bed, { prop: 'tablet' }), act(rnd(4, 7), 'tablet', { prop: 'tablet', face: [bed.x - 4, 0, bed.z] }), act(rnd(1.5, 3), 'look', { prop: 'tablet' })];
  };
  const techniker = (p: Walker): Task[] => {
    const f = farm();
    const fw = f?.fingerWaiting() ?? null;
    if (fw && f) {
      // „Ersatzfinger per Drohne“: take the finger from the drone, swap it at the arm, back to the cart
      return [go(fw.at), act(1.6, 'reach', { then: () => f.fingerTaken() }), go(fw.arm, { prop: 'finger' }), act(4.5, 'crouch', { prop: 'finger', face: [fw.arm.x - 2, 0, fw.arm.z], then: () => f.fingerSwapped() }), go(SPOTS.toolCart)];
    }
    if (f?.plateWanted()) {
      // „Rover 5 und die Pfütze“: the third time, the plate goes over the puddle
      return [go(SPOTS.toolCart), act(1.4, 'reach'), go(off(SPOTS.puddle, 1.2, 0.4), { prop: 'plate', act: 'carry' }), act(2.4, 'crouch', { prop: 'plate', face: SPOTS.puddle, then: () => f.plateLaid() }), go(SPOTS.toolCart)];
    }
    return [act(rnd(4, 8), 'reach', { prop: 'tool', face: off(SPOTS.toolCart, 0, -1.2) }), act(rnd(2, 4), 'look'), ...(Math.random() < 0.4 ? [go(f ? f.depot : v3(SPOTS.depot)), act(rnd(3, 5), 'reach'), go(SPOTS.toolCart)] : [])];
  };
  const nachlese = (side: number) => (p: Walker, c: LifeClock): Task[] => {
    const f = farm();
    const miss = f?.nearestMiss(p.pos) ?? null;
    if (miss && f && (c.phase === 'wartung' || c.phase === 'ernte')) {
      const id = miss.id;
      return [go(miss.at, { prop: 'basket', speed: PEOPLE.walkSlow }), act(2.6, 'crouch', { prop: 'basket', face: Math.hypot(miss.fruit.x - miss.at.x, miss.fruit.z - miss.at.z) > 0.1 ? miss.fruit : [miss.at.x - 1, 0, miss.at.z], then: () => f.pickMiss(id) })];
    }
    // between misses: sort crates at the depot, or wait by the gate
    const depot = f ? f.depot : v3(SPOTS.depot);
    return c.phase === 'abtransport'
      ? [go(off([depot.x, 0, depot.z], side * 1.2, 0.8), { prop: 'basket' }), act(rnd(5, 8), 'reach', { prop: 'basket' })]
      : [go(off(SPOTS.sort, side * 0.7, side * 0.9), { prop: 'basket' }), act(rnd(4, 7), Math.random() < 0.5 ? 'reach' : 'look', { prop: 'basket', face: off(SPOTS.depot, 0, 0) })];
  };
  const besucher = (older: boolean) => (): Task[] => {
    const sp = older ? PEOPLE.walkSlow : PEOPLE.walk;
    const r = Math.random();
    if (r < 0.45) return [go(off(SPOTS.shop, rnd(-1.2, 1.2), rnd(-0.4, 0.6)), { speed: sp }), act(rnd(3, 6), 'reach', { face: off(SPOTS.shop, 0, -1) }), act(rnd(2, 4), 'look')];
    if (r < 0.75) return [go(off(SPOTS.bench, rnd(-0.6, 0.6), 0), { speed: sp }), act(rnd(6, 11), 'stand', { face: off(SPOTS.gate, -6, -2) })];
    return [go(off(SPOTS.gate, 2.2, rnd(4.5, 6)), { speed: sp }), act(rnd(4, 7), 'look', { face: off(SPOTS.gate, -8, 0) })];
  };
  const dockcrew = (): Task[] =>
    Math.random() < 0.55
      ? [go(SPOTS.crewWatch, { prop: 'tablet' }), act(rnd(6, 12), 'tablet', { prop: 'tablet', face: [0, 0, 101] })]
      : [go(SPOTS.crewBeat[1], { prop: 'tablet' }), act(rnd(2, 4), 'look', { prop: 'tablet', face: [-12, 0, 118] }), go(SPOTS.crewBeat[0], { prop: 'tablet' })];
  const mechanikerin = (): Task[] => {
    const r = Math.random();
    if (r < 0.4) return [go(SPOTS.werftBench), act(rnd(6, 10), 'reach', { prop: 'tool', face: off(SPOTS.werftBench, 0, -2) })];
    if (r < 0.7) return [go(SPOTS.werftBench), act(1.4, 'reach'), go(SPOTS.werftDoor, { prop: 'crate', act: 'carry' }), act(1.6, 'reach', { prop: 'crate' }), go(SPOTS.werftBench)];
    return [go(SPOTS.werftCoil), act(rnd(4, 7), 'crouch', { prop: 'tool', face: off(SPOTS.werftCoil, -1, 0) })];
  };

  const list: Walker[] = [
    new Walker('agronomin', T('Agronomin', 'Agronomist'), look(H.agronomin, 1.0, PAL.olive, PAL.slate, PAL.stone, PAL.carbon), crowds.farm, 'sonnenacker', SPOTS.beds[1], agronomin, 1.15),
    new Walker('techniker', T('Techniker', 'Technician'), look(H.techniker, 1.18, PAL.slate, PAL.carbon, PAL.stoneDark, PAL.stoneDark), crowds.farm, 'hof', SPOTS.toolCart, techniker, PEOPLE.walk, () => !!(farm()?.fingerWaiting() || farm()?.plateWanted())),
    new Walker('nachlese1', T('Nachlese', 'Second-pass picker'), look(H.nachlese1, 0.95, PAL.sand, PAL.olive, PAL.stone, PAL.timberFresh), crowds.farm, 'hof', [SPOTS.sort[0], 0, SPOTS.sort[2] - 0.9], nachlese(-1), PEOPLE.walkSlow),
    new Walker('nachlese2', T('Nachlese', 'Second-pass picker'), look(H.nachlese2, 1.08, PAL.timberSilver, PAL.slate, PAL.stoneDark, PAL.timberFresh), crowds.farm, 'hof', [SPOTS.sort[0], 0, SPOTS.sort[2] + 0.9], nachlese(1), PEOPLE.walkSlow),
    new Walker('besucher1', T('Besucherin', 'Visitor'), look(H.besucher1, 1.02, PAL.clay, PAL.slate, PAL.stone, PAL.timberFresh), crowds.farm, 'hof', SPOTS.shop, besucher(false)),
    new Walker('besucher2', T('Besucher', 'Visitor'), look(H.besucher2, 1.12, PAL.olive, PAL.sand, PAL.stoneDark, PAL.timberFresh), crowds.farm, 'hof', SPOTS.bench, besucher(true), PEOPLE.walkSlow),
    new Walker('dockcrew', T('Dockcrew', 'Dock crew'), look(H.dockcrew, 1.1, PAL.sand, PAL.slate, PAL.stone, PAL.carbon), crowds.bridgehead, 'bridgehead', SPOTS.crewWatch, dockcrew),
    new Walker('mechanikerin', T('Mechanikerin', 'Mechanic'), look(H.mechanikerin, 1.05, PAL.slate, PAL.olive, PAL.stoneDark, PAL.stoneDark), crowds.werft, 'werft', SPOTS.werftBench, mechanikerin),
  ];

  const obstacles = list.map((p) => p.pos);
  const playerG = D.feetGround;
  const playerI = D.feet;

  // ── one step of a person (near: full pose; mid: the same at 15 Hz with a coarser look) ─────────
  const step = (p: Walker, dt: number, clock: LifeClock, near: boolean): void => {
    if (p.urgent && !p.onUrgent && !p.gathered && p.urgent(p)) {
      p.tasks = [];
      p.task = null;
    }
    if (!p.task && !p.tasks.length) p.onUrgent = false;
    if (!p.task) {
      if (!p.tasks.length) {
        if (p.gathered && p.gatherSpot) p.tasks = gatheredTasks(p);
        else
          try {
            p.onUrgent = !!p.urgent?.(p);
            p.tasks = p.brain(p, clock);
          } catch (err) {
            console.error(`[life] ${p.id}'s routine threw`, err);
            p.tasks = [act(5, 'stand')];
          }
      }
      p.task = p.tasks.shift() ?? null;
      p.taskT = 0;
    }
    const t = p.task;
    const pose = p.pose;
    const player = p.frame === 'ground' ? playerG : playerI;
    const toPlayer = _d.set(player.x - p.pos.x, 0, player.z - p.pos.z);
    const pd = Math.hypot(toPlayer.x, toPlayer.z);
    const playerNear = pd < PEOPLE.lookM && Math.abs(player.y - p.pos.y) < 3;
    let moving = false;
    let wantYaw = p.yaw;
    pose.crouch = damp(pose.crouch, 0, dt, 5);
    pose.reach = damp(pose.reach, 0, dt, 5);
    pose.tablet = damp(pose.tablet, 0, dt, 5);
    if (t && t.k === 'go') {
      const dx = t.to.x - p.pos.x,
        dz = t.to.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      pose.prop = t.prop ?? pose.prop;
      if (t.act === 'carry') pose.reach = damp(pose.reach, 0.8, dt, 6);
      if (dist < 0.15) {
        p.task = null;
      } else {
        // people yield to you: you are ahead and close → stop, look, then step aside
        const ahead = pd < PEOPLE.yieldM && (toPlayer.x * dx + toPlayer.z * dz) / Math.max(1e-3, pd * dist) > 0.2;
        if (ahead) {
          p.blockedT += dt;
          if (p.blockedT > 1.2) {
            // a sidestep to the right of the way, then on
            const sx = -dz / dist,
              sz = dx / dist;
            p.tasks.unshift(t);
            p.task = go([p.pos.x + sx * 1.2 + (dx / dist) * 0.3, p.pos.y, p.pos.z + sz * 1.2 + (dz / dist) * 0.3], { prop: pose.prop });
            p.blockedT = 0;
          }
        } else {
          p.blockedT = 0;
          const sp = (t.speed ?? p.speed) * (p.waveLeft > 0 ? 0 : 1) * (host.reducedMotion() ? 0.85 : 1);
          const s = Math.min(dist, sp * dt);
          p.pos.x += (dx / dist) * s;
          p.pos.z += (dz / dist) * s;
          moving = sp > 0;
          wantYaw = Math.atan2(-dx, -dz);
        }
      }
    } else if (t && t.k === 'do') {
      p.taskT += dt;
      pose.prop = t.prop ?? 'none';
      if (t.face) wantYaw = Math.atan2(-(t.face.x - p.pos.x), -(t.face.z - p.pos.z));
      if (t.act === 'crouch') pose.crouch = damp(pose.crouch, 1, dt, 3);
      else if (t.act === 'reach' || t.act === 'carry') pose.reach = damp(pose.reach, t.act === 'carry' ? 0.8 : 0.55 + 0.15 * Math.sin(p.taskT * 2.1), dt, 4);
      if (t.prop === 'tablet' || t.act === 'tablet') pose.tablet = damp(pose.tablet, 1, dt, 4);
      if (p.taskT >= t.s) {
        if (t.then)
          try {
            t.then();
          } catch (err) {
            console.error(`[life] ${p.id}'s task end threw`, err);
          }
        p.task = null;
      }
    }
    // the wave (a reaction or a greeting): stop, face the island or the player, raise the right arm
    if (p.waveLeft > 0) {
      p.waveLeft -= dt;
      if (p.waveYaw != null) wantYaw = p.waveYaw;
      pose.wave = damp(pose.wave, 1, dt, 6);
      pose.waveT += dt * (host.reducedMotion() ? 0.35 : 1);
      if (p.waveLeft <= 0) p.waveYaw = null;
    } else pose.wave = damp(pose.wave, 0, dt, 5);
    // greet you once in a while when you come close (people look at you; R9 L7)
    if (near && playerNear && pd < 4.2 && p.waveLeft <= 0 && D.clock.t - p.greeted > 75 && !(t && t.k === 'do' && t.act === 'crouch')) {
      p.greeted = D.clock.t;
      p.waveLeft = 1.3;
      p.waveYaw = Math.atan2(-toPlayer.x, -toPlayer.z);
      host.greet?.(p.pos);
    }
    // turn the body smoothly; the head looks at you when you are close
    p.yaw = dampAngle(p.yaw, wantYaw, dt, moving ? 6 : 3.5);
    let hy = 0;
    if (near && playerNear) {
      hy = THREE.MathUtils.clamp(wrap(Math.atan2(-toPlayer.x, -toPlayer.z) - p.yaw), -1.15, 1.15);
    }
    pose.headYaw = damp(pose.headYaw, hy, dt, 4);
    pose.headPitch = damp(pose.headPitch, pose.tablet > 0.5 && !playerNear ? 0.45 : 0, dt, 4);
    // gait
    pose.walk = damp(pose.walk, moving ? 1 : 0, dt, 8);
    if (moving) pose.phase += dt * (t && t.k === 'go' ? ((t.speed ?? p.speed) / 1.25) * 8.2 : 8);
    // feet on the ground (ground frame) or on the Ausguck deck (island frame)
    if (p.frame === 'ground') p.pos.y = host.heightAt(p.pos.x, p.pos.z);
    pose.x = p.pos.x;
    pose.y = p.pos.y;
    pose.z = p.pos.z;
    pose.yaw = p.yaw;
    p.crowd.pose(p.slot, p.look, pose);
  };

  // ── the gather (plan §4.12 apron crowd; R5 C1) ──────────────────────────────
  let gathered = false;
  const gatheredTasks = (p: Walker): Task[] => {
    const spot = p.gatherSpot!;
    // on the apron they face the island; at the Ausguck rail the crew member looks out over the Revier
    host.islandDir(spot, _f);
    const k = p.frame === 'island' ? -10 : 10;
    const face = new THREE.Vector3(spot.x + _f.x * k, spot.y, spot.z + _f.z * k);
    return [go(spot), act(rnd(5, 9), Math.random() < 0.3 ? 'look' : 'stand', { face })];
  };
  const crew = list.find((p) => p.id === 'dockcrew')!;
  const crewHome = v3(SPOTS.crewWatch);
  const atRail = (): boolean => crew.frame === 'island' && near(crew.pos, SPOTS.crewRail, 0.6);
  const camFwd = new THREE.Vector3();
  /** a point out of view (the crew steps out of the lift where you do not look) */
  const unseen = (at: Vec3Tuple): boolean => {
    host.camera.getWorldDirection(camFwd);
    const cp = host.camera.position;
    _d.set(at[0] - cp.x, at[1] + 1.2 - cp.y, at[2] - cp.z).normalize();
    return camFwd.dot(_d) < Math.cos(THREE.MathUtils.degToRad(55));
  };
  let crewPending = 0;
  /** after a move to another area: its tier now (the director only reports changes) */
  const refresh = (p: Walker): void => {
    p.lastTier = D.tierOf(p.area);
    p.visible = p.lastTier === 'near' || p.lastTier === 'mid';
    if (!p.visible) p.crowd.hide(p.slot);
  };
  const gather = (on: boolean, o: { siteStamped: boolean }): void => {
    if (on === gathered) return;
    gathered = on;
    const members = ['mechanikerin', 'besucher1', 'besucher2', ...(o.siteStamped ? ['agronomin', 'nachlese1'] : [])];
    let k = 0;
    for (const p of list) {
      if (p.id === 'dockcrew') continue;
      if (on && members.includes(p.id)) {
        const spot = v3(SPOTS.gather[k % SPOTS.gather.length]);
        k++;
        // step in from the yard ring road behind the spot (out of the camera's way), walk to the rim
        host.islandDir(spot, _f);
        const from = new THREE.Vector3(spot.x - _f.x * 12, 0, spot.z - _f.z * 12);
        p.moveTo(crowds.apron, 'apron', 'ground', from);
        refresh(p);
        p.gathered = true;
        p.gatherSpot = spot;
      } else if (!on && p.gathered) {
        p.gathered = false;
        p.gatherSpot = null;
        const home = p.id === 'mechanikerin' ? crowds.werft : crowds.farm;
        const area = p.id === 'mechanikerin' ? 'werft' : p.id === 'agronomin' ? 'sonnenacker' : 'hof';
        const at = p.id === 'mechanikerin' ? SPOTS.werftBench : p.id === 'agronomin' ? SPOTS.beds[2] : p.id.startsWith('besucher') ? SPOTS.shop : SPOTS.gate;
        p.moveTo(home, area, 'ground', v3(at));
        refresh(p);
      }
    }
    // the dock crew member rides up to the Ausguck (they appear at the rail where you do not look)
    if (on) crewPending = 25;
    else if (crew.frame === 'island') {
      crew.moveTo(crowds.bridgehead, 'bridgehead', 'ground', crewHome);
      refresh(crew);
      crew.gathered = false;
      crew.gatherSpot = null;
    }
  };
  const crewTick = (dt: number): void => {
    if (!gathered || crew.frame === 'island' || crewPending <= 0) return;
    crewPending -= dt;
    // the crew member rode up while you were busy: they stand at the rail when you next look away (or after 25 s)
    if (unseen(SPOTS.crewRail) || crewPending <= 0) {
      crewPending = 0;
      crew.moveTo(crowds.ausguck, 'ausguck', 'island', v3(SPOTS.crewRail));
      refresh(crew);
      crew.gathered = true;
      crew.gatherSpot = v3(SPOTS.crewRail);
    }
  };

  // ── agents ──────────────────────────────────────────────────────────────────
  for (const p of list) {
    D.register({
      id: `person:${p.id}`,
      get area() {
        return p.area;
      },
      job: p.job,
      kind: 'person',
      near: (dt, clock) => {
        if (p.id === 'dockcrew') crewTick(dt);
        step(p, dt, clock, true);
      },
      mid: (dt, clock) => {
        if (p.id === 'dockcrew') crewTick(dt);
        step(p, dt, clock, false);
      },
      far: { proxy: 'figure', at: (out) => out.copy(p.pos) },
      tier: (tier) => {
        p.lastTier = tier;
        p.visible = tier === 'near' || tier === 'mid';
        if (!p.visible) p.crowd.hide(p.slot);
      },
      react: (kind: ReactKind, at: Vec3Tuple | null) => {
        if (!p.visible && kind !== 'gather') return;
        if (kind === 'rotor' || kind === 'liftoff' || kind === 'wave') {
          // turn toward the island (or the point) and wave
          const target = at ? _f.set(at[0], 0, at[2]) : host.islandDir(p.pos, _f).multiplyScalar(30).add(p.pos);
          p.waveYaw = Math.atan2(-(target.x - p.pos.x), -(target.z - p.pos.z));
          p.waveLeft = kind === 'liftoff' ? PEOPLE.waveS + 1.4 : PEOPLE.waveS;
        } else if (kind === 'greet' && at && near(p.pos, at, 12)) {
          p.waveYaw = Math.atan2(-(at[0] - p.pos.x), -(at[2] - p.pos.z));
          p.waveLeft = 1.3;
        }
      },
    } as Parameters<Director['register']>[0]);
  }
  // one upload per tick for every crowd, after the agents wrote their poses
  const crowdList = Object.values(crowds);
  D.afterTick((dt) => {
    for (const c of crowdList) {
      let any = false;
      for (const p of list) if (p.crowd === c && p.visible) any = true;
      c.mesh.visible = any;
      if (any) c.commit(dt);
    }
  });

  return {
    list,
    obstacles,
    gather,
    get gathered() {
      return gathered;
    },
    crowdState() {
      const r = (v: THREE.Vector3): Vec3Tuple => [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100];
      return {
        gathered,
        members: list.filter((p) => p.gathered && p.frame === 'ground').map((p) => ({ id: p.id, pos: r(p.pos), frame: p.frame, atSpot: !!p.gatherSpot && near(p.pos, p.gatherSpot, 0.6) })),
        crew: { pos: r(crew.pos), frame: crew.frame, atRail: atRail() },
      };
    },
    peopleState() {
      const r = (v: THREE.Vector3): Vec3Tuple => [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100];
      return list.map((p) => ({ id: p.id, area: p.area, frame: p.frame, pos: r(p.pos), task: p.task ? (p.task.k === 'go' ? 'go' : p.task.act) : null, waving: p.waveLeft > 0, visible: p.visible }));
    },
  };
}

function damp(a: number, b: number, dt: number, k: number): number {
  return a + (b - a) * (1 - Math.exp(-dt * k));
}
function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
function dampAngle(a: number, b: number, dt: number, k: number): number {
  return a + wrap(b - a) * (1 - Math.exp(-dt * k));
}
