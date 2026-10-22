/**
 * Deliveries (plan §4.9 „Line-up and deliveries“, §3.4 „Sterne → Roboter“): in Entdecker mode the hall
 * fills with your progress — 9 robots + LeKiwi from the start („Bestand“; 5 + LeKiwi without the four amber
 * exhibits, src/core/release.ts), one per rotor (M1 SEHEN →
 * ANYmal D … M6 MESSEN → Franka Research 3), the Unitree ladder from the Traumhangar (R1, G1, H1-2 on
 * ★ in A, B, C, or its 'traumhangar:delivered' event), the Apptronik Apollo at ★ 36. In Entscheider mode
 * everything stands from the start (the H2 cover stays: tresor.ts).
 *
 * A due robot stands as a closed crate on its plinth (its card readable) until you are in the hall: then
 * a drone lowers a crate through the roof hatch onto Bühne A in 6 s, the crate folds open, the robot
 * stands on the stage for a moment and then on its plinth. The crate stays shut while the GLB still
 * streams in — it is the loading placeholder (§5.8). Once per robot (`zoneData.schauhalle.unboxed`);
 * reduced motion: no flight, the crate opens at once. Events: 'schauhalle:delivery' { id } when the
 * drone sets off, 'schauhalle:delivered' { id } when the robot is out (tools/hitches.mjs watches both).
 */
import * as THREE from 'three';
import type { RobotId, ZoneContext } from '@/core/zones';
import { HALL_ROBOTS, PLINTH, type HallRobot } from './data/robots';
import { box, cyl } from './geo';
import { STAGES } from './layout';
import type { Showroom } from './showroom';
import type { HallShell } from './hall';
import { DELIVERY } from './tuning';
import { zs } from './sheet';

export interface Deliveries {
  /** shown on its plinth now */
  shown(id: RobotId): boolean;
  /** due (its condition met) but not unboxed yet */
  pending(): RobotId[];
  readonly busy: RobotId | null;
  readonly unboxed: readonly string[];
  /** hold deliveries back (Entdecker first visit until the Lastenheft round) */
  setHold(fn: () => boolean): void;
  /** run the next pending delivery now (debug / tools) */
  kick(): boolean;
  /** force a robot due (debug: 'deliver:<id>') */
  force(id: RobotId): void;
  update(dt: number): void;
  readonly played: Record<string, number>;
}

const ORDER: RobotId[] = HALL_ROBOTS.filter((r) => r.arrival.kind !== 'bestand' && r.arrival.kind !== 'h2').map((r) => r.id);

export function buildDeliveries(ctx: ZoneContext, show: Showroom, shell: HallShell, o: { say(line: string): void; loading(id: RobotId | null): void }): Deliveries {
  const det = ctx.groups.detail;
  const unboxed: string[] = ctx.progress.get<string[]>('unboxed', []);
  const forced = new Set<RobotId>();
  const played: Record<string, number> = {};
  let hold: () => boolean = () => false;

  // ── rules ───────────────────────────────────────────────────────────────
  const traumStation = (k: number): string | null => ctx.zones.list({ kind: 'all' }).find((m) => m.id === 'traumhangar')?.stations[k]?.id ?? null;
  const stampedTraum = new Set<string>();
  const refreshTraum = (): void => {
    stampedTraum.clear();
    for (const st of ctx.pass.snapshot().stamps) if (st.zoneId === 'traumhangar' && st.record && !st.record.skipped) stampedTraum.add(st.stationId);
  };
  refreshTraum();
  const isDue = (r: HallRobot): boolean => {
    if (forced.has(r.id)) return true;
    const a = r.arrival;
    switch (a.kind) {
      case 'bestand':
        return true;
      case 'rotor': {
        const s = ctx.quest.system(a.id);
        return s === 'bereit' || s === 'geprueft';
      }
      case 'traum': {
        const id = traumStation(a.station);
        return !!id && stampedTraum.has(id);
      }
      case 'stars':
        return ctx.quest.snapshot().mastery.stars >= DELIVERY.apolloStars;
      case 'h2':
        return false;
    }
  };
  const entscheider = (): boolean => ctx.mode === 'entscheider';
  const shownNow = (r: HallRobot): boolean => r.arrival.kind !== 'h2' && (r.arrival.kind === 'bestand' || entscheider() || unboxed.includes(r.id));

  const sync = (): void => {
    for (const r of HALL_ROBOTS) {
      if (r.arrival.kind === 'h2') continue;
      // the robot on its way (busy) stays off its plinth until it has been on the stage
      show.setShown(r.id, shownNow(r) && busy !== r.id);
    }
  };

  // ── the rig: a cargo drone with four cables and a crate of six panels ────
  const rig = new THREE.Group();
  rig.name = 'schauhalle:delivery-rig';
  rig.visible = false;
  det.add(rig);
  const carbon = ctx.materials.carbon;
  const drone = new THREE.Group();
  {
    const parts: THREE.BufferGeometry[] = [box(0.7, 0.16, 0.7, 0, 0, 0), box(1.7, 0.05, 0.08, 0, 0.02, 0, Math.PI / 4), box(1.7, 0.05, 0.08, 0, 0.02, 0, -Math.PI / 4)];
    for (const [dx, dz] of [
      [0.6, 0.6],
      [-0.6, 0.6],
      [0.6, -0.6],
      [-0.6, -0.6],
    ])
      parts.push(cyl(0.05, 0.05, 0.1, 10, dx, 0.06, dz));
    const body = new THREE.Mesh(mergeGeo(parts), carbon);
    body.castShadow = true;
    // rotor blur discs (no blades turning across anything: a flat mid-tone, flash-safe)
    const discs: THREE.BufferGeometry[] = [];
    for (const [dx, dz] of [
      [0.6, 0.6],
      [-0.6, 0.6],
      [0.6, -0.6],
      [-0.6, -0.6],
    ])
      discs.push(cyl(0.34, 0.34, 0.01, 24, dx, 0.12, dz));
    const blur = new THREE.Mesh(mergeGeo(discs), new THREE.MeshBasicMaterial({ color: 0x57534e, transparent: true, opacity: 0.35, depthWrite: false, name: 'schauhalle:rotor-blur' }));
    const lamp = new THREE.Mesh(box(0.1, 0.03, 0.1, 0, -0.09, 0.3), ctx.materials.light(0x2dd4bf, 'line'));
    drone.add(body, blur, lamp);
    ctx.onDispose(() => {
      body.geometry.dispose();
      blur.geometry.dispose();
      (blur.material as THREE.Material).dispose();
      lamp.geometry.dispose();
    });
  }
  rig.add(drone);
  const cableGeo = new THREE.BufferGeometry();
  cableGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(8 * 3), 3));
  const cables = new THREE.LineSegments(cableGeo, new THREE.LineBasicMaterial({ color: 0x292524, name: 'schauhalle:cables' }));
  cables.frustumCulled = false;
  rig.add(cables);
  const panelGeo = box(1, 1, 1);
  const panels = new THREE.InstancedMesh(panelGeo, ctx.materials.crate, 6);
  panels.name = 'schauhalle:delivery-crate';
  panels.frustumCulled = false;
  panels.castShadow = true;
  rig.add(panels);
  ctx.onDispose(() => {
    cableGeo.dispose();
    (cables.material as THREE.Material).dispose();
    panelGeo.dispose();
  });

  const [ax, az] = STAGES.a;
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  /** crate panels: 0 base, 1 lid, 2..5 sides (front +z, back, right +x, left); open 0 → 1 */
  const setCrate = (y: number, w: number, h: number, open: number): void => {
    const t = 0.03;
    const put = (i: number, px: number, py: number, pz: number, sx: number, sy: number, sz: number, rx = 0, rz = 0, pivot?: [number, number, number]): void => {
      _e.set(rx, 0, rz);
      _q.setFromEuler(_e);
      if (pivot) {
        // rotate about a hinge at the panel's bottom edge
        _p.set(px - pivot[0], py - pivot[1], pz - pivot[2]).applyQuaternion(_q).add(_s.set(pivot[0], pivot[1], pivot[2]));
      } else _p.set(px, py, pz);
      _m.compose(_p, _q, _s.set(sx, sy, sz));
      panels.setMatrixAt(i, _m);
    };
    const fold = (Math.PI / 2) * Math.min(1, open * 1.15);
    put(0, ax, y + t / 2, az, w, t, w);
    // the lid lifts first and leans aside
    put(1, ax + open * w * 0.9, y + h - t / 2 + Math.min(1, open * 3) * 0.25 - open * (h - 0.05), az, w, t, w, 0, open * 1.2);
    put(2, ax, y + h / 2, az + w / 2, w, h, t, fold, 0, [ax, y, az + w / 2]);
    put(3, ax, y + h / 2, az - w / 2, w, h, t, -fold, 0, [ax, y, az - w / 2]);
    put(4, ax + w / 2, y + h / 2, az, t, h, w, 0, -fold, [ax + w / 2, y, az]);
    put(5, ax - w / 2, y + h / 2, az, t, h, w, 0, fold, [ax - w / 2, y, az]);
    panels.instanceMatrix.needsUpdate = true;
  };

  // ── the sequence ─────────────────────────────────────────────────────────
  type Phase = 'hatch' | 'descend' | 'wait' | 'open' | 'stage' | 'off';
  let busy: RobotId | null = null;
  let phase: Phase = 'off';
  let t = 0;
  let cw = 1;
  let ch = 1.5;
  let enterT = 0;
  const floorY = STAGES.h;

  const start = (id: RobotId): void => {
    const r = HALL_ROBOTS.find((x) => x.id === id)!;
    busy = id;
    played[id] = (played[id] ?? 0) + 1;
    sync();
    const h = show.slices.get(id)?.heightM ?? 1.2;
    cw = Math.min(1.9, Math.max(0.6, PLINTH[r.plinth].r * 1.3));
    ch = Math.max(0.5, Math.min(2.1, h * 1.06 + 0.12));
    show.setStage('a', null);
    const st = show.setStage('a', id, { focus: true });
    if (st) {
      st.holder.visible = false;
      void show.ensure(st);
    }
    ctx.events.emit('schauhalle:delivery', { id });
    ctx.audio.play('whoosh', { pitch: 0.6, volume: 0.5, at: [ax, 8, az] });
    rig.visible = true;
    if (ctx.settings.reducedMotion) {
      phase = 'wait';
      drone.visible = false;
      cables.visible = false;
      setCrate(floorY, cw, ch, 0);
    } else {
      phase = 'hatch';
      drone.visible = true;
      cables.visible = true;
    }
    t = 0;
  };

  const reveal = (): void => {
    const id = busy!;
    const st = show.stage('a');
    if (st) st.holder.visible = true;
    if (!unboxed.includes(id)) {
      unboxed.push(id);
      ctx.progress.set('unboxed', unboxed.slice());
    }
    const r = HALL_ROBOTS.find((x) => x.id === id)!;
    const name = r.short;
    ctx.game.juice.burst([ax, 1.0, az], { tone: 'teal', count: 36, spread: 1.0 });
    ctx.game.juice.cue('collect', { at: [ax, 1.2, az] });
    ctx.audio.play('success', { volume: 0.6, at: [ax, 1, az] });
    ctx.hud.toast((lang) => zs(lang, 'delivery.toast', { name }), { kind: 'success', duration: 4 });
    o.say(zs(ctx.i18n.lang, 'delivery.emi', { name }));
    ctx.events.emit('schauhalle:delivered', { id });
    o.loading(null);
  };

  const finish = (): void => {
    const id = busy!;
    rig.visible = false;
    show.setStage('a', null);
    busy = null;
    phase = 'off';
    sync();
    const r = HALL_ROBOTS.find((x) => x.id === id)!;
    ctx.game.juice.burst([r.at[0], 1.0, r.at[1]], { tone: 'stone', count: 18, spread: 0.8 });
    shell.setHatch(0);
  };

  // WP10's hangar sends { robot } (R1 on A ★, G1 on B ★, H1-2 on C ★, once each)
  ctx.events.on('traumhangar:delivered', (p: { robot?: string; id?: string } | undefined) => {
    refreshTraum();
    const rid = p?.robot ?? p?.id;
    if (rid && HALL_ROBOTS.some((r) => r.id === rid)) forced.add(rid as RobotId);
    sync();
  });
  for (const ev of ['quest:system', 'stamp:awarded', 'stars:changed', 'mode:changed', 'progress:reset']) ctx.events.on(ev, () => {
    if (ev === 'progress:reset') {
      unboxed.length = 0;
      forced.clear();
    }
    refreshTraum();
    sync();
  });
  sync();

  const pendingList = (): RobotId[] => (entscheider() ? [] : ORDER.filter((id) => !unboxed.includes(id) && isDue(HALL_ROBOTS.find((r) => r.id === id)!)));

  return {
    shown: (id) => {
      const r = HALL_ROBOTS.find((x) => x.id === id);
      return !!r && shownNow(r);
    },
    pending: pendingList,
    get busy() {
      return busy;
    },
    unboxed,
    setHold(fn) {
      hold = fn;
    },
    kick() {
      if (busy) return false;
      const next = pendingList()[0];
      if (!next) return false;
      start(next);
      return true;
    },
    force(id) {
      forced.add(id);
      sync();
    },
    played,
    update(dt) {
      if (!busy) {
        if (!ctx.playerInside) {
          enterT = 0;
          return;
        }
        enterT += dt;
        if (enterT < DELIVERY.enterDelayS || ctx.player.operating || hold()) return;
        const next = pendingList()[0];
        if (next) start(next);
        return;
      }
      t += dt;
      const st = show.stage('a');
      const ready = !!st?.model;
      o.loading(ready ? null : busy);
      switch (phase) {
        case 'hatch':
          shell.setHatch(Math.min(1, t / 1.0));
          drone.position.set(ax, DELIVERY.hoverY, az);
          setCrate(DELIVERY.hoverY - 0.9 - ch, cw, ch, 0);
          if (t >= 1.0) {
            phase = 'descend';
            t = 0;
            ctx.audio.play('whoosh', { pitch: 0.45, volume: 0.35, at: [ax, 6, az] });
          }
          break;
        case 'descend': {
          const k = Math.min(1, t / DELIVERY.descendS);
          const e = 1 - Math.pow(1 - k, 2.2);
          const crateY = DELIVERY.hoverY - 0.9 - ch + (floorY - (DELIVERY.hoverY - 0.9 - ch)) * e;
          setCrate(crateY, cw, ch, 0);
          drone.position.set(ax, crateY + ch + 0.9 + Math.sin(t * 3) * 0.02, az);
          cablesTo(crateY + ch);
          if (k >= 1) {
            phase = 'wait';
            t = 0;
            ctx.audio.play('thud', { volume: 0.6, at: [ax, 0.5, az] });
            ctx.player.shake(0.03, 0.2);
          }
          break;
        }
        case 'wait':
          // the drone lets go and climbs away; the crate waits for its robot (the loading placeholder)
          drone.position.y = Math.min(DELIVERY.hoverY + 1, drone.position.y + dt * 3.5);
          cables.visible = false;
          if (drone.position.y > 10.5) drone.visible = false;
          if (ready && t > 0.6) {
            phase = 'open';
            t = 0;
            ctx.audio.tone({ freq: 220, to: 110, dur: 0.45, type: 'sawtooth', volume: 0.2, at: [ax, 1, az] });
            ctx.audio.play('drop', { volume: 0.5, at: [ax, 1, az] });
          }
          break;
        case 'open': {
          const k = ctx.settings.reducedMotion ? 1 : Math.min(1, t / DELIVERY.openS);
          setCrate(floorY, cw, ch, k);
          if (k > 0.35 && st && !st.holder.visible) reveal();
          if (k >= 1) {
            phase = 'stage';
            t = 0;
          }
          break;
        }
        case 'stage':
          drone.visible = false;
          if (t > (ctx.settings.reducedMotion ? 2 : DELIVERY.showS)) finish();
          else if (t > 0.8) rig.visible = false;
          break;
      }
    },
  };

  function cablesTo(y: number): void {
    const a = cableGeo.getAttribute('position') as THREE.BufferAttribute;
    const top = drone.position.y - 0.06;
    let i = 0;
    for (const [dx, dz] of [
      [0.25, 0.25],
      [-0.25, 0.25],
      [0.25, -0.25],
      [-0.25, -0.25],
    ]) {
      a.setXYZ(i++, ax + dx * 0.5, top, az + dz * 0.5);
      a.setXYZ(i++, ax + dx * cw * 1.6, y, az + dz * cw * 1.6);
    }
    a.needsUpdate = true;
    cableGeo.computeBoundingSphere();
  }
}

function mergeGeo(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  for (const g of list) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
