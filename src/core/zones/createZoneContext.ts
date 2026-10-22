import * as THREE from 'three';
import type { CompassMarkerHandle } from '@/ui/Compass';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { Game } from '../Game';
import { Scope } from '../Scheduler';
import { GROUPS, isSensorIgnore, type DynamicBody, type Surface, type TriggerRecord } from '../Physics';
import { bodyFrame, colliderDescFor } from '../colliders';
import { freezeStatic, yieldToMain } from '../freeze';
import { mergeStatic, watchMerged } from './mergeStatic';
import { toVec3, type Text, type Vec3Input } from '../types';
import { chipElement, createKennlinie, formatRate, openPredict, wilson } from '@/ui/Kit';
import { applyContextExtensions, type ZoneContextExtensions } from './ext';
import type { AreaManifest, PlotFrame } from './manifest';
import type {
  DynamicHandle,
  DynamicOptions,
  KinematicHandle,
  RaycastHit,
  StaticBoxOptions,
  StaticHandle,
  TriggerHandle,
  TriggerOptions,
  ZoneContext,
  ZoneLayout,
} from './types';

export interface ZoneRuntimeState {
  playerInside: boolean;
  playerDistance: number;
  active: boolean;
  /** private Rapier worlds stepped while active */
  privateWorlds: { world: RAPIER_NS.World; autoStep: boolean }[];
  /** lazily created audio bus (gain set by distance) */
  bus: GainNode | null;
  /** zone HUD cards (panels, readouts, Kennlinie cards) are hidden while the player is away from the plot */
  setHudAway(away: boolean): void;
  hudAway: boolean;
  groups: { detail: THREE.Group; exterior: THREE.Group; far: THREE.Group };
  /** Phase 7: horizontal distance (m) from the player to the plot's edge (0 inside; tiers, robots queue) */
  edgeDistance: number;
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Builds the sandboxed context for one zone (or the island module, id 'world').
 * Everything created through it is registered in `scope` and removed by `scope.dispose()`.
 * The registered context extensions (ext.ts) are added last.
 *
 * Phase 7 (plan §5.3): a ground-frame area's root is a child of the ground root (`parent`); its
 * local ↔ world conversions and its physics use the DOCKED frame (h = 0, untilted), so nothing
 * depends on where the ground happens to be while the area is built.
 */
export function createZoneContext(
  game: Game,
  id: string,
  title: { de: string; en: string },
  layout: ZoneLayout,
  parent: THREE.Object3D,
  manifest: AreaManifest | null = null,
  frame: PlotFrame = 'island',
): { ctx: ZoneContext; scope: Scope; state: ZoneRuntimeState } {
  const scope = new Scope();
  const R = game.physics.R;
  const world = game.physics.world;

  // ── root, detail groups & frames ───────────────────────────────────────────
  const root = new THREE.Group();
  root.name = `zone:${id}`;
  root.position.copy(layout.anchor);
  root.rotation.y = layout.facing;
  parent.add(root);
  root.updateMatrixWorld(true);
  const mkGroup = (name: string): THREE.Group => {
    const g = new THREE.Group();
    g.name = `${id}:${name}`;
    root.add(g);
    return g;
  };
  const state: ZoneRuntimeState = {
    playerInside: false,
    playerDistance: Infinity,
    active: false,
    privateWorlds: [],
    bus: null,
    groups: { detail: mkGroup('detail'), exterior: mkGroup('exterior'), far: mkGroup('far') },
    edgeDistance: Infinity,
    hudAway: true,
    setHudAway(away) {
      state.hudAway = away;
      for (const el of hudEls) el.classList.toggle('zone-away', away);
    },
  };
  // right-column HUD cards of this zone; ZoneManager toggles them by player distance
  const hudEls = new Set<HTMLElement>();
  const trackHud = <T extends { remove(): void; readonly el: HTMLElement | null }>(h: T): T => {
    const el = h.el;
    if (!el || id === 'world') return h;
    hudEls.add(el);
    el.classList.toggle('zone-away', state.hudAway);
    const remove = h.remove.bind(h);
    h.remove = () => {
      hudEls.delete(el);
      remove();
    };
    return h;
  };
  state.groups.far.visible = false;
  // Z1: the detail tier starts hidden too, so the first LOD update switches it on at the inner
  // hysteresis edge (≤ 42.5 m). Starting visible kept Dunkelfabrik's and Prüffeld's interiors
  // drawn at the Landedeck spawn (47 m), inside the band where a visible tier stays visible.
  state.groups.detail.visible = false;
  const rootQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, layout.facing, 0));
  // a ground area: its root's matrix relative to the ground root IS its docked world matrix
  const ground = frame === 'ground';
  const rootWorld = ground ? root.matrix : root.matrixWorld;
  const rootInv = new THREE.Matrix4().copy(rootWorld).invert();
  const rootQuatInv = rootQuat.clone().invert();

  const toWorld = (p: Vec3Input, out = new THREE.Vector3()): THREE.Vector3 => {
    const v = toVec3(p);
    return out.set(v.x, v.y, v.z).applyMatrix4(rootWorld);
  };
  const toLocal = (p: Vec3Input, out = new THREE.Vector3()): THREE.Vector3 => {
    const v = toVec3(p);
    return out.set(v.x, v.y, v.z).applyMatrix4(rootInv);
  };
  const dirToWorld = (d: Vec3Input, out = new THREE.Vector3()): THREE.Vector3 => {
    const v = toVec3(d);
    return out.set(v.x, v.y, v.z).applyQuaternion(rootQuat);
  };
  const rotToWorld = (rot: Vec3Input | THREE.Quaternion | undefined, out = new THREE.Quaternion()): THREE.Quaternion => {
    if (!rot) return out.copy(rootQuat);
    if ((rot as THREE.Quaternion).isQuaternion) return out.copy(rootQuat).multiply(rot as THREE.Quaternion);
    const r = toVec3(rot as Vec3Input);
    return out.copy(rootQuat).multiply(_q.setFromEuler(_e.set(r.x, r.y, r.z)));
  };
  const safe = (fn: () => void, what: string): void => {
    try {
      fn();
    } catch (err) {
      console.error(`[zone ${id}] ${what} callback threw`, err);
    }
  };

  scope.add(() => {
    root.removeFromParent();
    disposeTree(root);
  });

  // ── physics ────────────────────────────────────────────────────────────────
  const bodies = new Set<RAPIER_NS.RigidBody>();
  const colliders = new Set<RAPIER_NS.Collider>();
  const joints = new Set<RAPIER_NS.ImpulseJoint>();
  const dynHandles = new WeakMap<DynamicBody, DynamicHandle>();
  const triggerRecs = new Set<TriggerRecord>();
  scope.add(() => {
    if (game.grab.held && game.grab.held.owner === id) game.grab.release(true);
    for (const j of joints) if (world.getImpulseJoint(j.handle)) world.removeImpulseJoint(j, true);
    for (const t of triggerRecs) game.physics.removeTrigger(t);
    for (const d of [...game.physics.dynamics]) if (d.owner === id) game.physics.removeDynamic(d);
    for (const b of bodies) game.physics.removeBody(b);
    for (const c of colliders) game.physics.removeCollider(c);
    for (const pw of state.privateWorlds) pw.world.free();
    state.privateWorlds = [];
  });

  let zoneBody: RAPIER_NS.RigidBody | null = null;

  /**
   * bodyFrame() in the DOCKED frame: an object in the ground frame keeps its h = 0 pose for physics
   * while the ground root is lifted or tilted (plan §5.3: no collider ever moves).
   */
  const dockedFrame = (object: THREE.Object3D): ReturnType<typeof bodyFrame> => {
    const f = bodyFrame(object);
    const fr = game.frames;
    if (!fr.atRest && fr.isGround(object)) fr.dockedWorld(object, _m).decompose(f.pos, f.quat, f.scale);
    return f;
  };
  /** the island module's statics and bodies under the ground root belong to the ground frame (C1 M6) */
  const groundTag = (object: THREE.Object3D | null): 'ground' | undefined => (!ground && object && game.frames.isGround(object) ? 'ground' : undefined);

  const placeStatic = (desc: RAPIER_NS.ColliderDesc, pos: THREE.Vector3, quat: THREE.Quaternion, o: { friction?: number; restitution?: number; surface?: Surface }, groups = GROUPS.world, frameTag?: 'ground'): RAPIER_NS.Collider => {
    // the desc may carry a local offset (bounding-box centre) — compose it with the frame
    const off = desc.translation;
    const offV = new THREE.Vector3(off.x, off.y, off.z).applyQuaternion(quat);
    desc.setTranslation(pos.x + offV.x, pos.y + offV.y, pos.z + offV.z);
    desc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    desc.setFriction(o.friction ?? 0.7);
    desc.setRestitution(o.restitution ?? 0);
    desc.setCollisionGroups(groups);
    const c = world.createCollider(desc);
    game.physics.register(c, { kind: 'static', owner: id, surface: o.surface, frame: frameTag });
    colliders.add(c);
    return c;
  };

  const staticHandle = (cs: RAPIER_NS.Collider[], mesh: THREE.Mesh | null): StaticHandle => ({
    colliders: cs,
    mesh,
    remove() {
      for (const c of cs) {
        colliders.delete(c);
        game.physics.removeCollider(c);
      }
      mesh?.removeFromParent();
    },
  });

  const staticBox = (o: StaticBoxOptions, groups: number): StaticHandle => {
    const s = toVec3(o.size);
    const pos = toWorld(o.position ?? [0, 0, 0]);
    const quat = rotToWorld(o.rotation);
    const c = placeStatic(R.ColliderDesc.cuboid(Math.abs(s.x) / 2, Math.abs(s.y) / 2, Math.abs(s.z) / 2), pos, quat, o, groups);
    let mesh: THREE.Mesh | null = null;
    if (o.material) {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), o.material);
      const lp = toVec3(o.position ?? [0, 0, 0]);
      mesh.position.set(lp.x, lp.y, lp.z);
      if (o.rotation) {
        const r = toVec3(o.rotation);
        mesh.rotation.set(r.x, r.y, r.z);
      }
      mesh.castShadow = o.castShadow ?? true;
      mesh.receiveShadow = o.receiveShadow ?? true;
      root.add(mesh);
    }
    return staticHandle([c], mesh);
  };

  const makeDynamicHandle = (d: DynamicBody): DynamicHandle => {
    const h: DynamicHandle = {
      id: d.id,
      body: d.body,
      collider: d.collider,
      object: d.object,
      get mass() {
        return d.mass;
      },
      get held() {
        return d.held;
      },
      position(out = new THREE.Vector3()) {
        return toLocal(d.body.translation(), out);
      },
      velocity(out = new THREE.Vector3()) {
        const v = d.body.linvel();
        return out.set(v.x, v.y, v.z).applyQuaternion(rootQuatInv);
      },
      setPosition(p, rotation) {
        if (d.held) game.grab.release(true);
        const w = toWorld(p, _v);
        d.body.setTranslation(w, true);
        if (rotation) d.body.setRotation(rotToWorld(rotation), true);
        d.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        d.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        game.physics.snap(d.body);
      },
      reset() {
        if (d.held) game.grab.release(true);
        game.physics.resetDynamic(d);
      },
      applyImpulse(i) {
        const w = dirToWorld(i, _v);
        d.body.applyImpulse({ x: w.x, y: w.y, z: w.z }, true);
      },
      setGrabbable(v) {
        d.grabbable = v;
        if (!v && d.held) game.grab.release();
      },
      remove() {
        if (d.held) game.grab.release(true);
        game.physics.removeDynamic(d);
      },
      raw: d,
    };
    dynHandles.set(d, h);
    return h;
  };

  const physics: ZoneContext['physics'] = {
    rapier: R,
    world,
    get gravity() {
      return world.gravity;
    },
    groups: { PLAYER: GROUPS.player, STATIC: GROUPS.world, DYNAMIC: GROUPS.dynamic, SENSOR: GROUPS.sensor, SENSOR_IGNORE: GROUPS.sensorIgnore },
    get zoneBody() {
      if (!zoneBody) {
        zoneBody = world.createRigidBody(
          R.RigidBodyDesc.fixed()
            .setTranslation(layout.anchor.x, layout.anchor.y, layout.anchor.z)
            .setRotation({ x: rootQuat.x, y: rootQuat.y, z: rootQuat.z, w: rootQuat.w }),
        );
        bodies.add(zoneBody);
      }
      return zoneBody;
    },
    addStaticBox: (o) => staticBox(o, GROUPS.world),
    addStaticBoxSensorIgnore: (o) => staticBox(o, GROUPS.sensorIgnore),
    addStaticCylinder(o) {
      const pos = toWorld(o.position ?? [0, 0, 0]);
      const quat = rotToWorld(o.rotation);
      // Rapier's character controller loses precision against very large convex shapes
      // (player slowly sinks into a r=150 cylinder) → big cylinders become a trimesh.
      if (o.radius > 40) {
        const g = new THREE.CylinderGeometry(o.radius, o.radius, o.height, 96, 1);
        const p = g.getAttribute('position');
        const verts = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) verts.set([p.getX(i), p.getY(i), p.getZ(i)], i * 3);
        const idx = g.getIndex()!;
        const indices = new Uint32Array(idx.count);
        for (let i = 0; i < idx.count; i++) indices[i] = idx.getX(i);
        g.dispose();
        return staticHandle([placeStatic(R.ColliderDesc.trimesh(verts, indices), pos, quat, o)], null);
      }
      return staticHandle([placeStatic(R.ColliderDesc.cylinder(o.height / 2, o.radius), pos, quat, o)], null);
    },
    addStaticFromMesh(object, o = {}) {
      if (!object.parent) root.add(object);
      const f = dockedFrame(object);
      return staticHandle([placeStatic(colliderDescFor(R, object, o.shape ?? 'trimesh', { fixInternalEdges: o.fixInternalEdges }), f.pos, f.quat, o, GROUPS.world, groundTag(object))], null);
    },
    addStaticTrimesh(object, o = {}) {
      return physics.addStaticFromMesh(object, { ...o, shape: 'trimesh' });
    },
    addDynamic(object, o: DynamicOptions) {
      if (!object.parent) root.add(object);
      const f = dockedFrame(object);
      const body = world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(f.pos.x, f.pos.y, f.pos.z)
          .setRotation({ x: f.quat.x, y: f.quat.y, z: f.quat.z, w: f.quat.w })
          .setLinearDamping(o.linearDamping ?? 0.05)
          .setAngularDamping(o.angularDamping ?? 0.2)
          .setCcdEnabled(!!o.ccd),
      );
      const collider = world.createCollider(
        colliderDescFor(R, object, o.shape ?? 'auto')
          .setMass(Math.max(0.01, o.mass))
          .setFriction(o.friction ?? 0.6)
          .setRestitution(o.restitution ?? 0.1)
          .setCollisionGroups(GROUPS.dynamic),
        body,
      );
      let handle: DynamicHandle | null = null;
      const d: DynamicBody = {
        id: game.physics.newId(),
        body,
        collider,
        object,
        owner: id,
        mass: o.mass,
        grabbable: o.grabbable ?? true,
        label: o.label ?? null,
        held: false,
        onFall: typeof o.onFall === 'function' ? () => (o.onFall as (h: DynamicHandle) => void)(handle!) : (o.onFall ?? 'reset'),
        spawnPos: f.pos.clone(),
        spawnQuat: f.quat.clone(),
        removed: false,
      };
      game.physics.dynamics.add(d);
      game.physics.register(collider, { kind: 'dynamic', owner: id, dynamic: d, surface: o.surface, frame: groundTag(object) });
      game.physics.sync(body, object, d);
      handle = makeDynamicHandle(d);
      return handle;
    },
    addKinematic(object, o = {}) {
      if (!object.parent) root.add(object);
      const f = dockedFrame(object);
      const body = world.createRigidBody(
        R.RigidBodyDesc.kinematicPositionBased().setTranslation(f.pos.x, f.pos.y, f.pos.z).setRotation({ x: f.quat.x, y: f.quat.y, z: f.quat.z, w: f.quat.w }),
      );
      const c = world.createCollider(colliderDescFor(R, object, o.shape ?? 'auto').setFriction(o.friction ?? 0.8).setCollisionGroups(GROUPS.world), body);
      game.physics.register(c, { kind: 'kinematic', owner: id, frame: groundTag(object) });
      game.physics.sync(body, object);
      bodies.add(body);
      const tq = new THREE.Quaternion();
      const tv = new THREE.Vector3();
      return {
        body,
        object,
        setPose(position, rotation) {
          toWorld(position, tv);
          body.setNextKinematicTranslation({ x: tv.x, y: tv.y, z: tv.z });
          if (rotation) {
            rotToWorld(rotation, tq);
            body.setNextKinematicRotation({ x: tq.x, y: tq.y, z: tq.z, w: tq.w });
          }
        },
        remove() {
          bodies.delete(body);
          game.physics.removeBody(body);
          object.removeFromParent();
        },
      } satisfies KinematicHandle;
    },
    addTrigger(o: TriggerOptions) {
      let desc: RAPIER_NS.ColliderDesc;
      if (o.shape === 'box') {
        const s = toVec3(o.size);
        desc = R.ColliderDesc.cuboid(Math.abs(s.x) / 2, Math.abs(s.y) / 2, Math.abs(s.z) / 2);
      } else if (o.shape === 'sphere') desc = R.ColliderDesc.ball(o.radius);
      else desc = R.ColliderDesc.cylinder(o.height / 2, o.radius);
      const pos = toWorld(o.position);
      const quat = rotToWorld(o.rotation);
      desc
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
        .setSensor(true)
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS)
        .setActiveCollisionTypes(R.ActiveCollisionTypes.ALL)
        .setCollisionGroups(GROUPS.sensor);
      const c = world.createCollider(desc);
      const wrap = (fn?: TriggerOptions['onEnter']) =>
        fn ? (e: { isPlayer: boolean; body: DynamicBody | null }) => fn({ isPlayer: e.isPlayer, body: e.body ? (dynHandles.get(e.body) ?? null) : null }) : undefined;
      const rec: TriggerRecord = {
        id: game.physics.newId(),
        owner: id,
        collider: c,
        filter: o.filter ?? 'player',
        inside: new Set(),
        playerInside: false,
        onEnter: wrap(o.onEnter),
        onExit: wrap(o.onExit),
        removed: false,
      };
      game.physics.register(c, { kind: 'sensor', owner: id, trigger: rec });
      game.physics.triggers.set(c.handle, rec);
      triggerRecs.add(rec);
      if (game.debugEnabled) game.debugOverlay?.addTriggerViz(rec, o, root);
      return {
        get playerInside() {
          return rec.playerInside;
        },
        get count() {
          return rec.inside.size;
        },
        remove() {
          triggerRecs.delete(rec);
          game.physics.removeTrigger(rec);
        },
      } satisfies TriggerHandle;
    },
    addJoint(data, a, b) {
      const j = world.createImpulseJoint(data, a, b, true);
      joints.add(j);
      return j;
    },
    raycast(origin, direction, maxDistance, o = {}) {
      const ow = toWorld(origin);
      const dw = dirToWorld(direction).normalize();
      const ray = new R.Ray({ x: ow.x, y: ow.y, z: ow.z }, { x: dw.x, y: dw.y, z: dw.z });
      const pred = o.sensorRays ? (c: RAPIER_NS.Collider) => !isSensorIgnore(c.collisionGroups()) : undefined;
      const hit = world.castRayAndGetNormal(ray, maxDistance, true, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, o.includePlayer ? undefined : game.player.collider, undefined, pred);
      if (!hit) return null;
      const info = game.physics.infoOf(hit.collider);
      const pw = ow.clone().addScaledVector(dw, hit.timeOfImpact);
      return {
        distance: hit.timeOfImpact,
        point: toLocal(pw),
        normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z).applyQuaternion(rootQuatInv),
        dynamic: info?.dynamic ? (dynHandles.get(info.dynamic) ?? null) : null,
        isPlayer: info?.kind === 'player',
      } satisfies RaycastHit;
    },
    track(thing) {
      const t = thing as object;
      if ('numColliders' in t) bodies.add(thing as RAPIER_NS.RigidBody);
      else if ('collisionGroups' in t) colliders.add(thing as RAPIER_NS.Collider);
      else joints.add(thing as RAPIER_NS.ImpulseJoint);
    },
    createPrivateWorld(o = {}) {
      const g = o.gravity ?? { x: 0, y: -9.81, z: 0 };
      const w = new R.World({ x: g.x, y: g.y, z: g.z });
      w.timestep = game.physics.dt;
      state.privateWorlds.push({ world: w, autoStep: o.autoStep ?? true });
      return w;
    },
    // Phase 7 (plan §5.3 rule 8, C1 M7): a box sensor that rescues the player and/or resets dynamic bodies
    addRescueVolume(o) {
      const sz = toVec3(o.size);
      const pos = toWorld(o.center);
      const quat = rotToWorld(o.yawDeg ? [0, THREE.MathUtils.degToRad(o.yawDeg), 0] : undefined);
      const c = world.createCollider(
        R.ColliderDesc.cuboid(Math.abs(sz.x) / 2, Math.abs(sz.y) / 2, Math.abs(sz.z) / 2)
          .setTranslation(pos.x, pos.y, pos.z)
          .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
          .setSensor(true)
          .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS)
          .setActiveCollisionTypes(R.ActiveCollisionTypes.ALL)
          .setCollisionGroups(GROUPS.sensor),
      );
      const rec: TriggerRecord = {
        id: game.physics.newId(),
        owner: id,
        collider: c,
        filter: 'any',
        inside: new Set(),
        playerInside: false,
        onEnter: (e) => {
          if (e.isPlayer && o.player === 'rescue') game.rescuePlayer('volume');
          else if (e.body && o.dynamics === 'reset' && !e.body.removed) {
            if (e.body.held) game.grab.release(true);
            game.physics.handleFall(e.body);
          }
        },
        removed: false,
      };
      // its frame: the area's, or (island module) the one asked for — the dock floor and the lake are 'ground'
      game.physics.register(c, { kind: 'sensor', owner: id, trigger: rec, frame: !ground && o.frame === 'ground' ? 'ground' : undefined });
      game.physics.triggers.set(c.handle, rec);
      triggerRecs.add(rec);
      return {
        colliders: [c],
        mesh: null,
        remove() {
          triggerRecs.delete(rec);
          game.physics.removeTrigger(rec);
        },
      };
    },
  };

  // ── HUD / UI ───────────────────────────────────────────────────────────────
  let objectiveMarker: CompassMarkerHandle | null = null;
  const removers = new Set<() => void>();
  scope.add(() => {
    game.hud.clearObjectiveOwner(id);
    objectiveMarker?.remove();
    game.hud.labels.removeOwner(id);
    game.hud.compass.removeOwner(id);
    for (const r of removers) safe(r, 'remove');
    removers.clear();
  });
  const track = <T extends { remove(): void }>(h: T): T => {
    removers.add(() => h.remove());
    return h;
  };
  const toTarget = (t: THREE.Object3D | Vec3Input): THREE.Object3D | THREE.Vector3 => ((t as THREE.Object3D).isObject3D ? (t as THREE.Object3D) : toWorld(t as Vec3Input));

  const hud: ZoneContext['hud'] = {
    toast: (text, o) => game.hud.toast(text, o),
    // a card from a zone the player has left (a delayed reaction) is skipped, like its dialogue
    openInfoCard: (spec) => (game.zones.isAway(id) ? Promise.resolve() : game.infoCards.open(spec)),
    say: (lines, o) => (game.zones.isAway(id) ? Promise.resolve() : game.hud.dialogue.say(lines, { owner: id, ...o })),
    setObjective(text, o = {}) {
      objectiveMarker?.remove();
      objectiveMarker = null;
      if (text != null && o.target) {
        const w = toWorld(o.target);
        objectiveMarker = game.hud.compass.add(id, w, text, { kind: 'objective', hideWithin: 3 });
        game.hud.objectiveTargets.set(id, { x: w.x, y: w.y, z: w.z });
      } else game.hud.objectiveTargets.delete(id);
      game.hud.setObjectiveMarker(id, objectiveMarker);
      game.hud.setObjective(id, text);
    },
    worldLabel: (target, text, o) => game.hud.labels.add(id, toTarget(target), text, o),
    addMarker: (target, label, o = {}) => game.hud.compass.add(id, toTarget(target), label, { kind: o.kind ?? 'poi' }),
    panel: (o) => track(trackHud(game.hud.panel(o))),
    openModal: (build, o) => game.openCustomModal(build, o),
    banner: (eyebrow, title, o) => game.hud.showBanner(game.i18n.resolve(eyebrow), game.i18n.resolve(title), undefined, o),
    caption: (text, o = {}) => (text !== null && game.zones.isAway(id) ? undefined : game.hud.caption(text, o.seconds)),
    get modalOpen() {
      return game.hud.modals.isOpen;
    },
    get dialogueBusy() {
      return game.hud.dialogue.busy;
    },
  };

  let hintClear: (() => void) | null = null;
  let statusOwned = false;
  scope.add(() => {
    hintClear?.();
    if (statusOwned) game.hud.status(null);
  });
  const ui: ZoneContext['ui'] = {
    card: (spec) => (game.zones.isAway(id) ? Promise.resolve() : game.infoCards.open(spec)),
    subtitle: (speaker, text, o = {}) => (game.zones.isAway(id) ? Promise.resolve() : game.hud.dialogue.say((Array.isArray(text) ? text : [text]).map((t) => ({ speaker, text: t })), { manual: o.manual, owner: id })),
    hint(text, seconds = 4) {
      hintClear = game.hud.hint(text, seconds);
      return hintClear;
    },
    status(text) {
      statusOwned = text != null;
      game.hud.status(text);
    },
    chip: (type, source) => chipElement(game.i18n, type, source),
    panel: (o) => track(trackHud(game.hud.panel(o))),
    readout: (label, value) => track(trackHud(game.hud.readout(label, value))),
    predict: (o) => openPredict(game.hud.modals, game.i18n, game.audio, o),
    // HUD-column cards follow the zone (hidden while away); `parent` / 'texture' targets are the zone's own business
    kennlinie: (spec, o = {}) => {
      const k = track(createKennlinie(game.i18n, spec, { ...o, panelsRoot: game.hud.panelsRoot }));
      return o.parent || o.target === 'texture' ? k : trackHud(k);
    },
    plot: (spec, o = {}) => {
      const k = track(createKennlinie(game.i18n, { ...spec, band: null }, { ...o, panelsRoot: game.hud.panelsRoot }));
      return o.parent || o.target === 'texture' ? k : trackHud(k);
    },
    formatRate: (k, n) => formatRate(game.i18n, k, n),
    wilson: (k, n) => wilson(k, n),
  };

  // ── i18n (namespace zone.<id>, GDD §5.1) ───────────────────────────────────
  const ns = `zone.${id}`;
  const tz = (key: string, params?: Record<string, string | number>): string => {
    const k1 = `${ns}.${key}`;
    if (game.i18n.has(k1)) return game.i18n.t(k1, params);
    const k2 = `${id}.${key}`;
    return game.i18n.has(k2) ? game.i18n.t(k2, params) : game.i18n.t(key, params);
  };
  const i18n: ZoneContext['i18n'] = {
    register: (tables) => game.i18n.registerStrings(ns, tables),
    t: tz,
    text: (key, params) => () => tz(key, params),
    resolve: (text: Text) => game.i18n.resolve(text),
    num: (v, d) => game.i18n.num(v, d),
    get lang() {
      return game.i18n.lang;
    },
    onChange(fn) {
      scope.add(game.i18n.onChange(() => safe(fn, 'i18n.onChange')));
    },
  };

  // ── audio ──────────────────────────────────────────────────────────────────
  const loops = new Set<{ stop(): void }>();
  scope.add(() => {
    for (const l of loops) l.stop();
    if (state.bus) {
      const b = state.bus;
      state.bus = null;
      window.setTimeout(() => b.disconnect(), 400);
    }
  });
  // Non-positional one-shots from a zone the player has left (a timer firing late) would play at
  // full volume anywhere on the island: they are skipped. Positional sounds fade with distance.
  const silent = (at: unknown): boolean => !at && game.zones.isAway(id);
  const audio: ZoneContext['audio'] = {
    play: (name, o = {}) => (silent(o.at) ? undefined : game.audio.play(name, { volume: o.volume, pitch: o.pitch, at: o.at ? toWorld(o.at) : undefined })),
    beep: (freq, dur, o = {}) => (silent(o.at) ? undefined : game.audio.beep(freq, dur, { volume: o.volume, at: o.at ? toWorld(o.at) : undefined })),
    tone: (o) => (silent(o.at) ? undefined : game.audio.tone({ ...o, at: o.at ? toWorld(o.at) : undefined })),
    loop(kind, o = {}) {
      const at = o.at ? toTarget(o.at) : undefined;
      const l = game.audio.loop(kind, { ...o, at, bus: id === 'world' ? 'ambience' : 'zones' });
      loops.add(l);
      return l;
    },
    get context() {
      return game.audio.context;
    },
    get zoneBus() {
      if (!state.bus && !scope.disposed) state.bus = game.audio.createBus();
      return state.bus;
    },
    setWind(intensity) {
      if (id !== 'world') console.warn(`[zone ${id}] ctx.audio.setWind() is meant for the island module (src/world)`);
      game.audio.setWind(intensity);
    },
    // Phase 7 (WP2, types.env.ts)
    setAmbienceFilter: (hz, rampS) => game.audio.setAmbienceFilter(hz, rampS),
  };

  // ── progress / pass (stamp ids '<zoneId>.<stationId>') ──────────────────────
  const full = (s: string): string => (s.includes('.') || s.includes(':') ? s : `${id}.${s}`);
  const ensureStamp = (f: string, sid: string): void => {
    if (!game.progress.stampDefs.has(f)) {
      console.warn(`[zone ${id}] stamp "${sid}" was not declared (stations / registerStamp) — registering with a placeholder title`);
      game.progress.registerStamp({ id: f, zoneId: id, title: sid });
    }
  };
  const progress: ZoneContext['progress'] = {
    registerStamp(sid, stampTitle, o = {}) {
      game.progress.registerStamp({ id: full(sid), zoneId: id, title: stampTitle, description: o.description, order: o.order ?? 100, extra: true });
    },
    awardStamp(sid) {
      const f = full(sid);
      ensureStamp(f, sid);
      return game.progress.awardStamp(f);
    },
    hasStamp: (sid) => game.progress.hasStamp(full(sid)),
    get mode() {
      return game.progress.mode;
    },
    get: (key, fallback) => game.progress.getZoneValue(id, key, fallback),
    set: (key, value) => game.progress.setZoneValue(id, key, value),
  };
  const pass: ZoneContext['pass'] = {
    award(sid, o = {}) {
      const f = full(sid);
      ensureStamp(f, sid);
      return game.progress.awardStamp(f, o);
    },
    has: (sid) => game.progress.hasStamp(full(sid)),
    recordPrediction: (sid, p, m, o) => game.progress.recordPrediction(full(sid), p, m, o),
    awardQuestion: (n) => game.progress.awardQuestion(n),
    registerQuestion: (n, text, why) => game.progress.registerQuestion(n, text, why),
    registerAlbum: (o) => game.progress.registerAlbum({ ...o, zoneId: id }),
    unlockAlbum: (aid) => game.progress.unlockAlbum(aid),
    setBest: (key, value, better) => game.progress.setBest(key, value, better),
    getBest: (key) => game.progress.getBest(key),
    hasQuestion: (n) => game.progress.hasQuestion(n),
    questions: () => game.progress.questions(),
    // additive (WP11, Request(WP4)): the album for the Schauhalle's Pannen-Wand
    album: () => {
      const have = new Set(game.progress.album());
      return [...game.progress.albumDefs.values()].map((d) => ({ id: d.id, zoneId: d.zoneId, title: d.title, text: d.text, found: have.has(d.id) }));
    },
    snapshot: () => {
      const P = game.progress;
      const stamps = [...P.stampDefs.values()].map((d) => {
        const rec = P.stampRecord(d.id);
        return {
          id: d.id,
          zoneId: d.zoneId,
          stationId: d.id.startsWith(d.zoneId + '.') ? d.id.slice(d.zoneId.length + 1) : d.id,
          title: d.title,
          star: !!d.star,
          extra: !!d.extra,
          record: rec ? (JSON.parse(JSON.stringify(rec)) as typeof rec) : null,
          stars: P.challengeRecord(d.id)?.stars ?? 0,
          best: P.challengeRecord(d.id)?.best ?? null,
        };
      });
      const sum = game.gameLayer.summary();
      return {
        stamps,
        questions: P.questions(),
        album: P.album(),
        predictions: P.predictions(),
        best: P.bests(),
        prognoseGuete: P.prognoseGuete(),
        starsTotal: sum.stars,
        starsMax: sum.maxStars,
        capsules: sum.capsules,
        capsulesTotal: sum.capsulesTotal,
      };
    },
  };

  // ── text3d / assets ────────────────────────────────────────────────────────
  scope.add(() => game.text3d.removeOwner(id));
  const text3d: ZoneContext['text3d'] = {
    create: (o, p) => game.text3d.create(id, o, p ?? root),
    sign: (o, p) => game.text3d.sign(id, o, p ?? root),
  };
  const assets: ZoneContext['assets'] = {
    zoneUrl: (file) => `zones/${id}/${file.replace(/^\//, '')}`,
    loadModel: (url, o) => game.assets.loadModel(url, o),
    loadTexture: (url) => game.assets.loadTexture(url),
  };

  // ── player ─────────────────────────────────────────────────────────────────
  const restorers: (() => void)[] = [];
  scope.add(() => {
    for (const r of restorers.splice(0)) safe(r, 'restore');
  });
  /** stack-like setter: returns an idempotent restore, auto-restored on dispose */
  const setWithRestore = (get: () => number, set: (v: number) => void, v: number): (() => void) => {
    const prev = get();
    set(v);
    let done = false;
    const restore = (): void => {
      if (done) return;
      done = true;
      set(prev);
    };
    restorers.push(restore);
    return restore;
  };
  let moveLock: (() => void) | null = null;
  let carried: THREE.Object3D | null = null;
  scope.add(() => {
    moveLock?.();
    if (carried) carried.removeFromParent();
    game.operate.removeOwner(id);
  });
  const player: ZoneContext['player'] = {
    get position() {
      return game.player.feet.clone();
    },
    positionLocal: (out = new THREE.Vector3()) => toLocal(game.player.feet, out),
    get eye() {
      return game.camera.getWorldPosition(new THREE.Vector3());
    },
    get direction() {
      return game.camera.getWorldDirection(new THREE.Vector3());
    },
    get yaw() {
      return game.player.yaw;
    },
    get pitch() {
      return game.player.pitch;
    },
    get grounded() {
      return game.player.grounded;
    },
    get velocity() {
      return game.player.velocity.clone();
    },
    get holding() {
      const h = game.grab.held;
      return h && h.owner === id ? (dynHandles.get(h) ?? null) : null;
    },
    get operating() {
      return game.operate.active?.owner === id;
    },
    teleport(position, o = {}) {
      const w = toWorld(position);
      const yaw = o.yawDeg != null ? layout.facing + THREE.MathUtils.degToRad(o.yawDeg) : undefined;
      const pitch = o.pitchDeg != null ? THREE.MathUtils.degToRad(o.pitchDeg) : undefined;
      void game.teleportWorld(w, yaw, pitch, !!o.fade);
    },
    teleportLocal(position, bearing) {
      void game.teleportWorld(toWorld(position), bearing != null ? -THREE.MathUtils.degToRad(bearing) : undefined, 0, false);
    },
    lockControls(o = {}) {
      const unlock = game.player.lock(o);
      scope.add(unlock);
      return unlock;
    },
    lockMovement(locked) {
      if (locked && !moveLock) moveLock = game.player.lock();
      else if (!locked && moveLock) {
        moveLock();
        moveLock = null;
      }
    },
    setGravityScale: (s) => setWithRestore(() => game.player.gravityScale, (v) => (game.player.gravityScale = v), s),
    setSpeedFactor: (f) => setWithRestore(() => game.player.speedFactor, (v) => (game.player.speedFactor = v), f),
    setHeadBob: (sc) => setWithRestore(() => game.player.headBobScale, (v) => (game.player.headBobScale = v), sc),
    setVignette: (a) => setWithRestore(() => game.vignetteExtra, (v) => game.setVignetteExtra(v), a),
    release: () => void game.grab.release(),
    carry(object) {
      if (carried && carried !== object) carried.removeFromParent();
      carried = object;
      if (!object) return;
      if (object.position.lengthSq() === 0) object.position.set(0.28, -0.25, -0.55);
      object.traverse((o) => {
        o.userData.noCollide = true;
        (o as THREE.Mesh).castShadow = false;
      });
      game.camera.add(object);
    },
    shake: (a, d) => game.player.shake(a, d),
    launch(velocity, o = {}) {
      const v = dirToWorld(velocity);
      return new Promise<void>((resolve) => game.player.launch(v, o.gravity ?? 9.81, resolve));
    },
    cinematic() {
      const ov = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), blend: 0 };
      const m = new THREE.Matrix4();
      game.player.cameraOverride = ov;
      const end = (): void => {
        if (game.player.cameraOverride === ov) game.player.cameraOverride = null;
      };
      scope.add(end);
      return {
        set(position, lookAt, blend = 1) {
          toWorld(position, ov.position);
          m.lookAt(ov.position, toWorld(lookAt, _v), UP);
          ov.quaternion.setFromRotationMatrix(m);
          ov.blend = THREE.MathUtils.clamp(blend, 0, 1);
        },
        end,
      };
    },
    enterOperate(o) {
      const pos = toWorld(o.cameraPose.position);
      const quat = new THREE.Quaternion();
      if (o.cameraPose.lookAt) {
        _m.lookAt(pos, toWorld(o.cameraPose.lookAt, _v), UP);
        quat.setFromRotationMatrix(_m);
      } else {
        const yaw = layout.facing + THREE.MathUtils.degToRad(o.cameraPose.yawDeg ?? 0);
        quat.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(o.cameraPose.pitchDeg ?? 0), yaw, 0, 'YXZ'));
      }
      // Phase 7 (piloting): captured keys and mouse look go to the station; its camera pose follows the robot
      const cap = o.capture;
      const camLocal = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
      return game.operate.enter({
        owner: id,
        position: pos,
        quaternion: quat,
        title: o.title,
        panel: o.panel,
        panelPosition: o.panelPosition,
        onExit: o.onExit,
        capture: cap
          ? {
              keys: new Set(cap.keys.filter((k) => k !== 'Escape')),
              pointerLock: !!cap.pointerLock,
              onLook: cap.onLook ? (dx, dy) => cap.onLook!(dx, dy) : undefined,
              camera: cap.camera
                ? (out) => {
                    camLocal.position.set(0, 0, 0);
                    camLocal.quaternion.identity();
                    cap.camera!(camLocal);
                    out.position.copy(camLocal.position).applyMatrix4(rootWorld);
                    out.quaternion.copy(rootQuat).multiply(camLocal.quaternion);
                  }
                : undefined,
            }
          : undefined,
        onPointer: o.onPointer
          ? (e) =>
              o.onPointer!({
                type: e.type,
                ndc: e.ndc,
                button: e.button,
                deltaY: e.deltaY,
                origin: toLocal(e.origin),
                direction: e.direction.clone().applyQuaternion(rootQuatInv),
              })
          : undefined,
      });
    },
  };

  // ── input ──────────────────────────────────────────────────────────────────
  const input: ZoneContext['input'] = {
    isDown: (code) => game.input.isDown(code),
    pressed: (code) => game.input.pressed(code),
    onKey(codes, fn, o = {}) {
      const set = new Set(Array.isArray(codes) ? codes : [codes]);
      const off = game.input.onKey((code, e) => {
        if (e.repeat || !set.has(code) || game.phase !== 'playing' || game.input.isConsumed(e)) return;
        const operating = game.operate.active?.owner === id;
        // piloting (enterOperate({ capture })): the captured keys reach the station's handlers
        if (game.hud.modals.isOpen && !(operating && (o.whileOperating || game.operate.captures(code)))) return;
        if (!o.anywhere && !state.playerInside && !operating) return;
        safe(() => fn(code), 'input.onKey');
      });
      scope.add(off);
      return off;
    },
  };

  // ── events / debug / lights / misc ─────────────────────────────────────────
  const events: ZoneContext['events'] = {
    on(type, fn) {
      const off = game.events.on(type, fn);
      scope.add(off);
      return off;
    },
    once(type, fn) {
      const off = game.events.once(type, fn);
      scope.add(off);
      return off;
    },
    emit: (type, payload) => game.events.emit(type, payload),
  };
  const debugMarkers = new THREE.Group();
  debugMarkers.visible = game.debugEnabled;
  root.add(debugMarkers);
  const debugNames = new Set<string>();
  scope.add(() => {
    for (const n of debugNames) game.debugActions.delete(`${id}:${n}`);
  });
  const debug: ZoneContext['debug'] = {
    get enabled() {
      return game.debugEnabled;
    },
    log: (...args) => {
      if (game.debugEnabled) console.log(`[zone ${id}]`, ...args);
    },
    marker(position, color = 0x2dd4bf) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color, depthTest: false }));
      const p = toVec3(position);
      m.position.set(p.x, p.y, p.z);
      m.renderOrder = 999;
      debugMarkers.add(m);
    },
    register(name, fn) {
      debugNames.add(name);
      game.debugActions.set(`${id}:${name}`, fn);
    },
  };
  const lightsApi: ZoneContext['lights'] = {
    point(position, o) {
      const isObj = (position as THREE.Object3D).isObject3D;
      const v = game.lights.add(id, isObj ? new THREE.Vector3() : toWorld(position as Vec3Input), o);
      if (isObj) v.follow = position as THREE.Object3D;
      const remove = (): void => game.lights.remove(v);
      scope.add(remove);
      return { setIntensity: (x: number) => (v.intensity = x), setColor: (c: THREE.ColorRepresentation) => v.color.set(c), remove };
    },
  };
  scope.add(() => game.scheduler.removeOwner(id));
  scope.add(() => game.interaction.removeOwner(id));
  scope.add(() => game.emis.removeOwner(id));

  const interiorExits = new Set<() => void>();
  scope.add(() => {
    for (const x of interiorExits) x();
    interiorExits.clear();
  });
  const env: ZoneContext['env'] = {
    set(p) {
      if (id !== 'world') console.warn(`[zone ${id}] ctx.env.set() is meant for the island module (src/world)`);
      game.env.set(p);
    },
    get params() {
      return game.env.params;
    },
    enterInterior(o) {
      const exit = game.env.enterInterior(o);
      interiorExits.add(exit);
      return () => {
        interiorExits.delete(exit);
        exit();
      };
    },
    exitInterior() {
      const last = [...interiorExits].pop();
      if (last) {
        interiorExits.delete(last);
        last();
      }
    },
    // Phase 7 (WP2, types.env.ts): implemented in Environment.ts
    setFlight: (p) => game.env.setFlight(p),
    sunBlocked: (eye) => game.env.sunBlocked(eye),
    holdEnvMap: (hold) => game.env.holdEnvMap(hold),
    rebuildEnvMap: () => game.env.rebuildEnvMap(),
  };

  // the extension fields (ctx.quest, ctx.robots, …) are added below by applyContextExtensions
  const base: Omit<ZoneContext, keyof ZoneContextExtensions> = {
    id,
    title,
    game: game.gameLayer.forZone(id, { toWorld, scope, isAway: () => game.zones.isAway(id) }),
    root,
    layout,
    scene: game.rs.scene,
    camera: game.camera,
    physics,
    addInteractable: (o) => game.interaction.add(id, o),
    interact: {
      register: (object, o) => game.interaction.add(id, { object, label: o.label, range: o.radius ?? 2.5, onInteract: o.onUse, isEnabled: o.enabled, hint: o.hint }),
    },
    hud,
    ui,
    i18n,
    t: tz,
    audio,
    progress,
    pass,
    materials: game.materials,
    palette: game.materials.palette,
    text3d,
    text: {
      sign: (o, p) => game.text3d.sign(id, o, p ?? root),
      label: (o, p) => game.text3d.create(id, { color: 0xa8a29e, uppercase: true, letterSpacing: 0.12, size: 0.12, ...o, font: 'mono-medium' }, p ?? root),
    },
    assets,
    player,
    input,
    groups: state.groups,
    emi: {
      spawn(o) {
        const u = game.emis.spawn(id, o.unit, o.parent ?? root);
        const p = toVec3(o.position ?? [0, 0, 0]);
        u.object.position.set(p.x, p.y, p.z);
        u.object.rotation.y = THREE.MathUtils.degToRad(o.yawDeg ?? 0);
        return u;
      },
    },
    env,
    island: {
      onGust(fn) {
        const off = game.events.on('island:gust', fn);
        scope.add(off);
        return off;
      },
      get tiltDeg() {
        return { roll: game.env.tilt.rollDeg, pitch: game.env.tilt.pitchDeg };
      },
      emitGust: (g) => game.events.emit('island:gust', g),
      setTilt: (r, p) => game.setIslandTilt(r, p),
      // Phase 7 (plan §5.3 rule 2): the ONE altitude setter, island module only (WP12 Probestart, WP13 F1 and lift-off)
      setAltitude(h) {
        if (id !== 'world') {
          console.warn(`[zone ${id}] ctx.island.setAltitude() is meant for the island module (src/world)`);
          return;
        }
        game.frames.setAltitude(h);
      },
    },
    settings: {
      get reducedMotion() {
        return game.settings.data.reducedMotion;
      },
      get quality() {
        return game.rs.level;
      },
      get overlays() {
        return game.settings.data.overlays;
      },
      get exteriorCams() {
        return game.settings.data.exteriorCams;
      },
      onChange(fn) {
        const a = game.events.on('settings:changed', () => safe(fn, 'settings.onChange'));
        const b = game.events.on('quality:changed', () => safe(fn, 'settings.onChange'));
        const off = (): void => {
          a();
          b();
        };
        scope.add(off);
        return off;
      },
    },
    zones: {
      list: (o) => game.zones.manifests(o),
      stamps: (zoneId) => game.progress.stampsInZone(zoneId),
      visited: (zoneId) => game.progress.visited(zoneId),
    },
    events,
    time: game.time,
    debug,
    lights: lightsApi,
    get mode() {
      return game.progress.mode;
    },
    get lang() {
      return game.i18n.lang;
    },
    get playerInside() {
      return state.playerInside;
    },
    get playerDistance() {
      return state.playerDistance;
    },
    toWorld,
    toLocal,
    after: (s, fn) => game.scheduler.after(id, s, () => safe(fn, 'after')),
    every: (s, fn) => game.scheduler.every(id, s, () => safe(fn, 'every')),
    onDispose: (fn) => scope.add(fn),
    freezeStatic,
    yield: yieldToMain,
    mergeStatic(obj, o) {
      // Z1: interactables (highlight overlays) and physics bodies never merge
      const anchors = new Set<THREE.Object3D>();
      for (const it of game.interaction.items) anchors.add(it.object);
      for (const d of game.physics.dynamics) anchors.add(d.object);
      const r = mergeStatic(obj, o, (q) => anchors.has(q), id);
      if (import.meta.env.DEV) scope.add(watchMerged(id, r, (s, fn) => game.scheduler.every(id, s, fn)));
      if (game.debugEnabled) console.log(`[zone ${id}] mergeStatic ${obj.name || obj.type}: ${r.before} → ${r.after} draws, ${r.merged} meshes merged, ${r.frozen.length} frozen, ${r.ms.toFixed(1)} ms`);
      return { before: r.before, after: r.after, merged: r.merged, meshes: r.meshes, originals: r.originals, ms: r.ms };
    },
  };
  const ctx = base as ZoneContext;
  applyContextExtensions(ctx, { id, manifest, layout, scope, onDispose: (fn) => scope.add(fn) });
  return { ctx, scope, state };
}

/** Dispose zone-owned GPU resources (never the shared brand/core materials). */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.userData.__highlight) return;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) if (mat && !mat.name.startsWith('brand:') && !mat.name.startsWith('core:')) mat.dispose();
  });
}
