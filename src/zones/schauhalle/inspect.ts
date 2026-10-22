/**
 * Inspektion (plan §4.9, R4 §7.5): E at a stand or a plinth enters operate mode around that robot —
 * drag to orbit, the wheel zooms, ←/→ steps to the next robot, C puts it on the compare stage, G shows
 * its joint axes, V replays its Vorführung, Esc leaves. The Datenblatt card is the operate panel. The
 * inspected robot is the governor's first LOD0 (LOD0 is the inspection model, [C1 M4]) and its turntable
 * stops.
 */
import * as THREE from 'three';
import type { RobotId, RobotManifestEntry, ZoneContext } from '@/core/zones';
import { INSPECT_ORDER, ROBOT_BY_ID, PLINTH } from './data/robots';
import { renderCard, type CardHandle, type CardOpts } from './datenblatt';
import { standPose } from './stands';
import type { Showroom, Spot } from './showroom';
import { INSPEKTION } from './tuning';
import { zs } from './sheet';

export interface InspektionDeps {
  show: Showroom;
  infos: ReadonlyMap<RobotId, RobotManifestEntry>;
  state(id: RobotId): CardOpts['state'];
  compare(id: RobotId): void;
  probefahrt(id: RobotId): void;
  /** the open Lastenheft job for this robot's card (null: none) */
  job(id: RobotId): CardOpts['job'];
  onOpen?(id: RobotId, card: CardHandle): void;
  onClose?(id: RobotId): void;
}

export interface Inspektion {
  open(id: RobotId): void;
  close(): void;
  readonly current: RobotId | null;
  readonly card: CardHandle | null;
  /** re-render the card (a job changed, the language changed) */
  refresh(): void;
}

const KEYS = ['ArrowLeft', 'ArrowRight', 'KeyC', 'KeyG', 'KeyV'];

export function buildInspektion(ctx: ZoneContext, d: InspektionDeps): Inspektion {
  let current: RobotId | null = null;
  let card: CardHandle | null = null;
  let panelEl: HTMLElement | null = null;
  let exitFn: (() => void) | null = null;
  // orbit state (zone-local), eased toward the wanted values
  const target = new THREE.Vector3();
  const want = new THREE.Vector3();
  let radius = 1;
  let dist = 2;
  let distWant = 2;
  let yaw = 0;
  let pitch = 0.2;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const _m = new THREE.Matrix4();
  const _up = new THREE.Vector3(0, 1, 0);
  const _p = new THREE.Vector3();

  const spotOf = (id: RobotId): Spot | null => d.show.plinth(id);
  const frameOf = (id: RobotId): void => {
    const s = spotOf(id);
    if (!s) return;
    const st = d.state(id);
    if (st === 'shown') {
      const f = d.show.frame(s, want);
      radius = f.radius;
    } else {
      const r = ROBOT_BY_ID.get(id)!;
      const h = st === 'covered' ? 1.95 : 1.2;
      want.copy(s.base).add(_p.set(0, h * 0.5, 0));
      radius = Math.max(0.7, PLINTH[r.plinth].r);
    }
    distWant = THREE.MathUtils.clamp(radius * INSPEKTION.dist0, 0.9, 7);
  };

  const render = (): void => {
    if (!panelEl || !current) return;
    const id = current;
    const r = ROBOT_BY_ID.get(id)!;
    card = renderCard(ctx, panelEl, {
      robot: r,
      info: d.infos.get(id) ?? null,
      state: d.state(id),
      job: d.job(id),
      onCompare: () => d.compare(id),
      onJoints: (on) => d.show.showJoints(on ? spotOf(id) : null),
      onProbefahrt: r.probefahrt ? () => d.probefahrt(id) : null,
      onVorfuehrung: () => {
        const s = spotOf(id);
        if (s) d.show.play(s);
      },
    });
    d.onOpen?.(id, card);
  };

  const select = (id: RobotId): void => {
    if (current) d.show.showJoints(null);
    current = id;
    const s = spotOf(id);
    d.show.setFocus(d.state(id) === 'shown' ? s : null);
    if (s && d.state(id) === 'shown') void d.show.ensure(s);
    frameOf(id);
    render();
    ctx.events.emit('schauhalle:inspect', { id });
  };

  const step = (k: number): void => {
    if (!current) return;
    const i = INSPECT_ORDER.indexOf(current);
    const next = INSPECT_ORDER[(i + k + INSPECT_ORDER.length) % INSPECT_ORDER.length];
    ctx.audio.play('click', { pitch: 1.2 });
    select(next);
  };

  ctx.input.onKey(
    KEYS,
    (code) => {
      if (!current || !ctx.player.operating) return;
      if (code === 'ArrowLeft') step(-1);
      else if (code === 'ArrowRight') step(1);
      else if (code === 'KeyC' && d.state(current) === 'shown') d.compare(current);
      else if (code === 'KeyG' && d.state(current) === 'shown') {
        const on = !(card?.jointsOn ?? false);
        if (card) card.jointsOn = on;
        d.show.showJoints(on ? spotOf(current) : null);
      } else if (code === 'KeyV') {
        const s = spotOf(current);
        if (s) d.show.play(s);
      }
    },
    { whileOperating: true },
  );

  const api: Inspektion = {
    open(id) {
      if (current && exitFn) {
        select(id);
        return;
      }
      frameOf(id);
      target.copy(want);
      dist = distWant;
      const p = ctx.player.positionLocal(_p);
      yaw = Math.atan2(p.x - target.x, p.z - target.z);
      // the stand stands between the aisle and the plinth: look past it, from the side nearer to you
      const sp = standPose(ROBOT_BY_ID.get(id)!);
      const ys = Math.atan2(sp.x - target.x, sp.z - target.z);
      const off = Math.atan2(Math.sin(yaw - ys), Math.cos(yaw - ys));
      if (Math.abs(off) < INSPEKTION.standClear) yaw = ys + (off >= 0 ? 1 : -1) * INSPEKTION.standClear;
      pitch = 0.18;
      current = id;
      ctx.audio.play('open', { pitch: 1.1 });
      exitFn = ctx.player.enterOperate({
        cameraPose: { position: [target.x + Math.sin(yaw) * dist, target.y + 0.4, target.z + Math.cos(yaw) * dist], lookAt: [target.x, target.y, target.z] },
        title: (lang) => `// ${lang === 'en' ? 'INSPECTION' : 'INSPEKTION'} · ${zs(lang, 'card.keys')} · C · G · V`,
        panel: (el) => {
          panelEl = el;
          select(id);
          return () => {
            panelEl = null;
          };
        },
        panelPosition: 'right',
        capture: {
          keys: KEYS,
          pointerLock: false,
          camera(out) {
            const k = Math.min(1, ctx.time.dt * 6);
            target.lerp(want, k);
            dist += (distWant - dist) * k;
            const cp = Math.cos(pitch);
            out.position.set(target.x + Math.sin(yaw) * cp * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * cp * dist);
            _m.lookAt(out.position, target, _up);
            out.quaternion.setFromRotationMatrix(_m);
          },
        },
        onPointer(e) {
          if (e.type === 'down' && e.button === 0) {
            dragging = true;
            lastX = e.ndc.x;
            lastY = e.ndc.y;
          } else if (e.type === 'move' && dragging) {
            yaw -= (e.ndc.x - lastX) * 2.6;
            pitch = THREE.MathUtils.clamp(pitch - (e.ndc.y - lastY) * 1.8, INSPEKTION.pitchMin, INSPEKTION.pitchMax);
            lastX = e.ndc.x;
            lastY = e.ndc.y;
          } else if (e.type === 'up') dragging = false;
          else if (e.type === 'wheel' && e.deltaY) distWant = THREE.MathUtils.clamp(distWant * (1 + e.deltaY * INSPEKTION.wheelK), Math.max(0.6, radius * INSPEKTION.distMin), radius * INSPEKTION.distMax + 1);
        },
        onExit() {
          const was = current;
          d.show.setFocus(null);
          d.show.showJoints(null);
          current = null;
          card = null;
          exitFn = null;
          if (was) d.onClose?.(was);
        },
      });
    },
    close() {
      exitFn?.();
    },
    get current() {
      return current;
    },
    get card() {
      return card;
    },
    refresh() {
      if (current) render();
    },
  };
  ctx.i18n.onChange(() => api.refresh());
  return api;
}
