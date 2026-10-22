/**
 * The tour (WP-D1, plan §3.2, §3.3, §4): the 12 stops in the 3D world. Lazy (tour/install.ts imports it
 * when the mode is first entered). Per stop:
 *   leave     from an interior stop (the hall, the hangar) the camera first backs out through its door
 *   pre-roll  the stop's areas (zones.initOne, their programs), the ground under the pose, the observer
 *             pinned at the target until its robots are in (≤ 3 s), every program compiled — behind „lädt …“
 *   flight    camera.flyTo: the lifted Bézier, `via` the door for interiors (a 0.4 s cross-fade under
 *             reduced motion)
 *   arrival   the observer follows the camera again, the stop card (peek), the top bar „i / 12“, the
 *             live line, the markers and the „Hier zu sehen“ chips (the stop's spots, the robots in view)
 * Prev / next: ←/→, the sheet's ‹ ›, a sideways swipe on the collapsed sheet (Gestures.onNav). A tap on
 * the view picks a robot (D2's card) or a spot (pick.ts).
 */
import * as THREE from 'three';
import type { CameraRig, CardAction, CardSpec, DiscoverHandle, SheetSnap, TapPoint, TourEnterArg, Vec3 } from '../types';
import { robotInfo, type RobotId } from '@/robots/manifest';
import { feetOf, robotsSettled } from '../spike';
import { showLaptopCard } from '../ui/laptop';
import { S } from '../strings';
import { LABELS } from '../data/content.gen';
import { STOPS, stopIndex, type StopData } from './stops';
import { SPOTS, type SpotData } from './spots';
import { contentCard, showStopList, spotLabel, withBack, type ChipItem } from './cards';
import { T } from './strings';
import { Markers, type ActiveSpot } from './markers';
import { pickAt, robotsInView } from './pick';

export type TourArg = TourEnterArg & { instant?: boolean };

export interface Tour {
  enter(arg?: TourArg): Promise<void>;
  exit(): void;
  goto(id: string, o?: { instant?: boolean }): Promise<void>;
  showList(): void;
  /** tools: the stop index, arrival, the markers on screen, the chips' ids */
  state(): { at: number; arrived: boolean; markers: string[]; chips: string[] };
}

const R2D = 180 / Math.PI;

export function createTour(h: DiscoverHandle): Tour {
  const n = STOPS.length;
  let at = -1;
  let seq = 0;
  let arrived = false;
  let active: ActiveSpot[] = [];
  let robots: RobotId[] = [];
  let chipIds: string[] = [];
  let offs: (() => void)[] = [];
  let entered = false;
  /** the interior (hall, hangar) the camera is in now: left through its door before any other flight */
  let inside: StopData | null = null;

  const markers = new Markers(h, (s) => showSpot(s));
  const prevHook = h.game.frameHook;
  h.game.frameHook = (dt) => {
    prevHook?.(dt);
    markers.update();
  };

  // ── the ground under a pose ──
  const _probe = new THREE.Vector3();
  /** the floor at (x, z): a site's or building's own floor (physics), else the terrain; null when unknown */
  const groundY = (x: number, z: number): number | null => {
    let g: number | null = null;
    try {
      g = h.ctx.frames.ground ? h.ctx.frames.heightAt(x, z) : null;
    } catch {
      g = null;
    }
    _probe.set(x, (g ?? 0) + 2.5, z);
    const hit = h.game.groundAt(_probe);
    return Math.abs(hit.y - _probe.y) > 1e-4 ? hit.y : g;
  };
  const terrainY = (x: number, z: number): number | null => {
    try {
      return h.ctx.frames.ground ? h.ctx.frames.heightAt(x, z) : null;
    } catch {
      return null;
    }
  };
  const lift = (p: Vec3, dy: number, terrain = false): Vec3 => {
    const g = terrain ? terrainY(p[0], p[2]) : groundY(p[0], p[2]);
    return g == null ? p : [p[0], g + dy, p[2]];
  };
  /** the stop's rig (and door path) on the ground as it is now */
  const fitted = (s: StopData): { rig: CameraRig; via?: readonly Vec3[] } => {
    if (!s.fit) return { rig: s.rig, via: s.via };
    const r = s.rig;
    const t = !!s.fit.terrain;
    const rig: CameraRig = r.kind === 'look' ? { ...r, eye: lift(r.eye, s.fit.dy, t) } : { ...r, target: lift(r.target, s.fit.dy, t) };
    return { rig, via: s.via?.map((v) => lift(v, v[1], true)) };
  };
  const activeSpots = (s: StopData): ActiveSpot[] =>
    SPOTS.filter((p) => s.spots.includes(p.id)).map((spot) => ({ spot, pts: spot.at.map((p) => (spot.ground ? lift([p[0], 0, p[2]], p[1]) : p)) }));

  // ── cards ──
  const spotChips = (s: StopData): ChipItem[] =>
    SPOTS.filter((p) => s.spots.includes(p.id)).map((p) => ({ label: spotLabel(p.card), onSelect: () => showSpot(p) }));
  const robotChips = (): ChipItem[] => robots.map((id) => ({ label: robotInfo(id).name, onSelect: () => showRobot(id) }));
  const stopActions = (s: StopData): CardAction[] => {
    const a: CardAction[] = [];
    if (s.id === 'schauhalle' && h.robots && h.modes.has('viewer')) a.push({ id: 'viewer', primary: true, label: T.viewRobots, onSelect: () => void h.modes.enter('viewer', {}) });
    if (s.id === 'abheben') {
      if (h.modes.has('film')) a.push({ id: 'film', primary: true, label: LABELS.replay, onSelect: () => void h.modes.enter('film', {}) });
      a.push({ id: 'laptop', label: S.playOnLaptop, onSelect: () => void (h.share ? h.share({ kind: 'game' }) : showLaptopCard(h.sheet, h.ui)) });
    }
    return a;
  };
  const stopCard = (s: StopData): CardSpec => {
    const chips = [...spotChips(s), ...robotChips()];
    chipIds = [...s.spots.map((id) => `spot:${id}`), ...robots.map((id) => `robot:${id}`)];
    return contentCard(s.card, { chips, actions: stopActions(s) }) ?? { id: s.card, title: s.title, blocks: [] };
  };
  const showStop = (snap: SheetSnap = 'peek'): void => {
    const s = STOPS[at];
    if (s) h.sheet.show(stopCard(s), snap);
  };
  function showSpot(p: SpotData): void {
    const c = contentCard(p.card);
    if (!c) return;
    h.sheet.show(withBack({ ...c, id: p.card }, () => showStop('half')), 'half');
    h.ui.announce(c.title);
  }
  function showRobot(id: RobotId): void {
    const c = h.robots?.card(id);
    if (!c) return;
    h.sheet.show(withBack(c, () => showStop('half')), 'half');
    h.ui.announce(c.title);
  }

  /** Let `n` frames draw (≤ 0.7 s). */
  const drawn = (n: number): Promise<void> =>
    new Promise((resolve) => {
      const f0 = h.game.time.frame;
      const t0 = performance.now();
      const tick = (): void => void (h.game.time.frame - f0 >= n || performance.now() - t0 > 700 ? resolve() : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    });
  /**
   * The shadow casters' depth programs before the flight. The pre-roll's compile covers the main pass
   * only; the sun's shadow frustum sits around the (pinned) observer but 42 % of its extent ahead along
   * the camera's view (Environment.followShadow), so it swings around the target while the camera turns
   * in flight and new casters (alpha-tested foliage, custom depth materials) would link mid-flight. Two
   * frames with the frustum widened to cover every centre it can swing to (×1.9) compile them now.
   */
  const warmShadows = async (): Promise<void> => {
    const sun = h.game.env?.sun;
    if (!sun?.castShadow) return drawn(2);
    const cam = sun.shadow.camera;
    const box = [cam.left, cam.right, cam.top, cam.bottom];
    const set = (k: number): void => {
      [cam.left, cam.right, cam.top, cam.bottom] = box.map((v) => v * k);
      cam.updateProjectionMatrix();
      h.game.rs.markShadowsDirty();
    };
    set(1.9);
    try {
      await drawn(2);
    } finally {
      set(1);
    }
    await drawn(1);
  };

  // ── leaving an interior: back out the way in (its `via` reversed), the observer at the door ──
  const leave = async (from: StopData, my: number): Promise<void> => {
    if (!from.via?.length || h.settings.reducedMotion || !h.camera.attached) return;
    const via = fitted(from).via!;
    const pose = h.camera.pose();
    const yaw = Math.atan2(-(pose.target[0] - pose.eye[0]), -(pose.target[2] - pose.eye[2])) * R2D;
    h.observer.pin(from.door ?? h.observer.feet);
    await h.warm();
    if (my !== seq) return;
    await h.camera.flyTo({ kind: 'look', eye: via[0], yawDeg: yaw, pitchDeg: 0 }, { via: via.slice(1).reverse(), seconds: 1.8 });
    if (my === seq) inside = null;
  };

  const goto = async (id: string, o: { instant?: boolean } = {}): Promise<void> => {
    const k = stopIndex(id);
    if (k < 0) return;
    const my = ++seq;
    const s = STOPS[k];
    const from = inside && inside !== s ? inside : null;
    at = k;
    arrived = false;
    active = [];
    markers.clear();
    h.topbar.setStep(k + 1, n, s.title);
    h.sheet.setNav({ prev: k > 0, next: k < n - 1 });
    if (from && !o.instant) await leave(from, my);
    if (my !== seq) return;
    // pre-roll
    h.ui.busy(true);
    let pose = fitted(s);
    try {
      h.observer.pin(feetOf({ ...s, rig: pose.rig }));
      await h.ensureAreas(s.areas);
      if (my !== seq) return;
      pose = fitted(s);
      h.observer.pin(feetOf({ ...s, rig: pose.rig }));
      await robotsSettled(h, 3000);
      if (my !== seq) return;
      await h.warm();
      if (my !== seq) return;
      await warmShadows();
    } finally {
      h.ui.busy(false);
    }
    if (my !== seq) return;
    if (o.instant) {
      inside = null;
      h.camera.setRig(pose.rig);
    } else {
      // an interior: the observer at its door, so the door opens for the camera
      if (s.door) h.observer.pin(s.door);
      await h.camera.flyTo(pose.rig, { via: pose.via });
    }
    if (my !== seq) return;
    // arrival
    inside = s.via?.length ? s : null;
    h.observer.follow();
    h.setStop(s.id);
    arrived = true;
    robots = robotsInView(h);
    showStop('peek');
    h.ui.announce(s.title);
    active = activeSpots(s);
    markers.show(active);
  };

  const onTap = (ndc: TapPoint): void => {
    if (!arrived || h.camera.flying || h.modes.current !== 'tour') return;
    const p = pickAt(h, ndc, active);
    if (p?.kind === 'robot') showRobot(p.id);
    else if (p?.kind === 'spot') showSpot(p.spot);
  };

  /** opening the card: the robots that came in since arrival join the chips */
  const onSnap = (snap: SheetSnap | 'hidden'): void => {
    if (!arrived || snap !== 'half' || h.sheet.card?.id !== STOPS[at]?.card) return;
    const now = robotsInView(h);
    if (now.join() === robots.join()) return;
    robots = now;
    showStop('half');
  };

  return {
    async enter(arg?: TourArg) {
      if (!entered) {
        entered = true;
        offs = [
          h.gestures.onNav((dir) => {
            const next = STOPS[at + dir];
            if (next && !h.camera.flying) void goto(next.id);
          }),
          h.gestures.onTap(onTap),
          h.sheet.onSnap(onSnap),
        ];
      }
      const id = arg?.stop && stopIndex(arg.stop) >= 0 ? arg.stop : STOPS[Math.max(0, at)].id;
      // back from the viewer or the film: the same stop again (flown to from where the camera is)
      if (id === STOPS[at]?.id) at = -1;
      await goto(id, { instant: arg?.instant });
    },
    exit() {
      seq++;
      entered = false;
      for (const off of offs) off();
      offs = [];
      arrived = false;
      active = [];
      markers.clear();
      h.sheet.hide();
    },
    goto,
    showList() {
      showStopList(h.sheet, h.text, at, (id) => void (h.goto ? h.goto(id) : goto(id)));
    },
    state: () => ({ at, arrived, markers: markers.visible(), chips: chipIds }),
  };
}
