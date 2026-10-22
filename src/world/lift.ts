import * as THREE from 'three';
import type { StaticHandle, ZoneContext } from '@/core/zones';
import { TOWER } from './layout';
import { towerState } from './tower/state';
import { markStatic } from './statics';
import { cullTinyText } from './detail';

/**
 * Lift (§6.1): glass car in the exterior shaft on the N facet. Stops AUSGUCK +44 and
 * FOYER 0; KIEL −36 stays locked until 4 rotors are bereit (Phase 7, D23: `ctx.quest` kielOpen; rc4:
 * stamps in 4 zones). Rides that involve the KIEL stop
 * (through the deck) are scripted by the finale (src/world/finale) via setKielHandler/takeOver.
 * The ride is scripted: input locks, car and player move together for 6 s (a zero-g
 * ballistic flight of the character controller, so the camera stays perfectly smooth).
 * Reduced motion: a fade teleport.
 *
 * QA-11: the Ausguck lid collider over the shaft is PERMANENT except while the player rides
 * (a hatch shows while the car is away, tower/structure.ts), and the car console works only
 * from inside the car — no more invisible hole at +44.
 */
export type LiftStop = 'foyer' | 'ausguck' | 'kiel';
export interface Lift {
  update(dt: number): void;
  readonly at: LiftStop;
  readonly busy: boolean;
  /** send the empty car to a stop */
  call(to: LiftStop): void;
  /** finale: drive the car yourself (setY), then release at a stop; null while busy */
  takeOver(): { car: THREE.Group; setY(y: number): void; release(at: LiftStop): void } | null;
  /** finale: rides with the player to/from KIEL (KIEL button when open, car console at KIEL) */
  setKielHandler(fn: ((to: LiftStop) => void) | null): void;
  /** finale: extra condition that opens KIEL (e.g. the finale was started); default: stamps in 4 zones */
  setKielOpen(fn: (() => boolean) | null): void;
  /** re-read the KIEL state into the car's button label (after finale state changes) */
  refreshSigns(): void;
}

const RIDE_S = 6;

export function buildLift(ctx: ZoneContext, car: THREE.Group): Lift {
  const M = ctx.materials;
  const { x: lx, z: lz } = TOWER.lift;
  const top = TOWER.lift.stops.ausguck;
  const stopY = (s: LiftStop): number => (s === 'foyer' ? 0 : s === 'ausguck' ? top : TOWER.lift.stops.kiel);
  let at: LiftStop = ctx.progress.get<LiftStop>('liftAt', 'foyer');
  let riding = false;
  let kielHandler: ((to: LiftStop) => void) | null = null;
  let carY = stopY(at);
  /** rotors bereit (the quest spine: ◆ stamps and the ground crew, D23) */
  const rotorsReady = (): number => ctx.quest.snapshot().start.lift;
  let kielOpenExtra: (() => boolean) | null = null;
  /** KIEL −36 is open with 4 rotors bereit (or once the finale was reached: the quest's kielOpen), or the finale says so */
  const kielOpen = (): boolean => ctx.quest.snapshot().kielOpen || !!kielOpenExtra?.();
  car.position.y = carY;
  const sync = (): void => {
    towerState.liftAt = at;
    towerState.liftBusy = riding;
    towerState.carY = carY;
  };
  sync();
  let lid: StaticHandle | null = null;
  const setLid = (on: boolean): void => {
    if (on && !lid) lid = ctx.physics.addStaticBox({ size: [3.1, 0.2, 3.1], position: [lx, top - 0.1, lz], surface: 'metal' });
    if (!on && lid) {
      lid.remove();
      lid = null;
    }
  };
  setLid(true);

  // console inside the car (moves with it)
  const consoleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.08), M.standard({ color: 0x1c1917, roughness: 0.4, metalness: 0.6 }));
  consoleMesh.position.set(0.85, 1.25, -1.38);
  car.add(consoleMesh);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.34), M.standard({ color: 0x0f0e0d, roughness: 0.3, metalness: 0.2 }));
  screen.position.set(0, 0, 0.045);
  consoleMesh.add(screen);
  cullTinyText(ctx, ctx.text3d.create({ text: { de: 'AUSGUCK +44\nFOYER 0', en: 'LOOKOUT +44\nFOYER 0' }, font: 'mono-medium', size: 0.05, color: 0x2dd4bf, glow: 1.1, anchorX: 'center', anchorY: 'middle', textAlign: 'center', lineHeight: 1.5, position: [0, 0.02, 0.05] }, consoleMesh));
  cullTinyText(ctx, ctx.text3d.create({ text: '// LIFT', font: 'mono', size: 0.032, color: 0x78716c, anchorX: 'center', anchorY: 'middle', position: [0, -0.12, 0.05] }, consoleMesh));
  const kielBtn = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.08), M.standard({ color: 0x292524, roughness: 0.5, metalness: 0.6 }));
  kielBtn.position.set(-0.75, 1.25, -1.38);
  car.add(kielBtn);
  // the label is a lazy Text: the text factory re-resolves it on language/mode changes, refreshSigns() on state changes
  const kielText = (lang: string): string => (kielOpen() ? (lang === 'de' ? 'KIEL −36\nFREI' : 'KEEL −36\nOPEN') : lang === 'de' ? 'KIEL −36\nGESPERRT' : 'KEEL −36\nLOCKED');
  const kielLabel = ctx.text3d.create({ text: kielText, font: 'mono-medium', size: 0.045, color: 0xa8a29e, anchorX: 'center', anchorY: 'middle', textAlign: 'center', position: [0, 0, 0.045] }, kielBtn);
  cullTinyText(ctx, kielLabel);
  let shownOpen: boolean | null = null;
  const refreshSigns = (): void => {
    const open = kielOpen();
    kielLabel.text = ctx.i18n.resolve(kielText);
    kielLabel.color = open ? 0x2dd4bf : 0xa8a29e;
    kielLabel.sync();
    shownOpen = open;
  };
  refreshSigns();
  for (const ev of ['stamp:awarded', 'stamp:updated', 'progress:reset', 'game:start', 'quest:kiel-open', 'quest:system']) ctx.events.on(ev, () => refreshSigns());

  const inCar = (): boolean => {
    const p = ctx.player.position;
    return Math.abs(p.x - lx) < 1.45 && Math.abs(p.z - lz) < 1.45 && Math.abs(p.y - carY) < 1.2;
  };

  const ride = (to: LiftStop, withPlayer: boolean): void => {
    if (riding || at === to) return;
    if (withPlayer && (to === 'kiel' || at === 'kiel')) {
      kielHandler?.(to);
      return;
    }
    riding = true;
    const fromY = carY;
    const toY = stopY(to);
    ctx.audio.tone({ freq: 523, to: 659, dur: 0.18, type: 'sine', volume: 0.7 });
    const hum = ctx.audio.loop('hum', { at: car, volume: 0.6 });
    const done = (): void => {
      hum.stop();
      at = to;
      ctx.progress.set('liftAt', to);
      carY = toY;
      car.position.y = toY;
      riding = false;
      setLid(true);
      sync();
      ctx.audio.tone({ freq: 659, to: 523, dur: 0.22, type: 'sine', volume: 0.7 });
      if (shownOpen !== kielOpen()) refreshSigns();
    };
    if (!withPlayer) {
      // empty car travels on its own (the lid stays: nobody can step into the open shaft at +44)
      const t0 = ctx.time.elapsed;
      sync();
      const dur = (RIDE_S * Math.abs(toY - fromY)) / top;
      const stop = ctx.every(1 / 60, () => {
        const k = Math.min(1, (ctx.time.elapsed - t0) / Math.max(1, dur));
        const s = k * k * (3 - 2 * k);
        carY = fromY + (toY - fromY) * s;
        car.position.y = carY;
        towerState.carY = carY;
        if (k >= 1) {
          stop();
          done();
        }
      });
      return;
    }
    const unlock = ctx.player.lockControls();
    sync();
    if (ctx.settings.reducedMotion) {
      ctx.player.teleport([lx, toY, lz + 0.4], { fade: true, yawDeg: 180 });
      ctx.after(0.6, () => {
        unlock();
        done();
      });
      return;
    }
    setLid(false);
    const v = (toY - fromY) / RIDE_S;
    let landed = false;
    void ctx.player.launch([0, v, 0], { gravity: 0 }).then(() => {
      landed = true;
    });
    const t0 = ctx.time.elapsed;
    const stop = ctx.every(1 / 60, () => {
      const k = ctx.time.elapsed - t0;
      car.position.y = Math.min(Math.max(ctx.player.position.y, Math.min(fromY, toY)), Math.max(fromY, toY));
      carY = car.position.y;
      towerState.carY = carY;
      if (to === 'ausguck' && k >= RIDE_S) {
        stop();
        setLid(true);
        ctx.player.teleport([lx, toY + 0.05, lz], {});
        unlock();
        done();
      } else if (to === 'foyer' && (landed || k >= RIDE_S + 1)) {
        stop();
        if (!landed) ctx.player.teleport([lx, 0.05, lz], {});
        unlock();
        done();
      }
    });
  };

  ctx.addInteractable({
    object: consoleMesh,
    label: () => (at === 'foyer' ? (ctx.lang === 'de' ? 'Lift → AUSGUCK +44' : 'Lift → LOOKOUT +44') : 'Lift → FOYER 0'),
    hint: { de: 'Fahrt 6 s', en: '6 s ride' },
    range: 2.4,
    // QA-11: the car console only works from inside the car (call panels send the empty car)
    isEnabled: () => !riding && inCar(),
    onInteract: () => ride(at === 'foyer' ? 'ausguck' : 'foyer', inCar()),
  });
  ctx.addInteractable({
    object: kielBtn,
    label: { de: 'KIEL −36', en: 'KEEL −36' },
    range: 2.4,
    isEnabled: () => !riding && at !== 'kiel',
    onInteract: () => {
      if (kielOpen() && kielHandler) {
        ride('kiel', true);
        return;
      }
      ctx.audio.play('error', { volume: 0.5 });
      if (kielOpen()) ctx.hud.toast({ de: 'Die Kielstufe ist frei, aber gerade nicht erreichbar.', en: 'The keel level is open but not reachable right now.' }, { kind: 'info' });
      else ctx.hud.toast({ de: `Gesperrt. Öffnet bei 4 von 6 Rotoren (jetzt: ${rotorsReady()}).`, en: `Locked. Opens at 4 of 6 rotors (now: ${rotorsReady()}).` }, { kind: 'warn' });
    },
  });

  // call panels: foyer (inside, beside the N door) and Ausguck (on the crown fin next to the shaft)
  const callPanel = (pos: [number, number, number], rotY: number, target: 'foyer' | 'ausguck', post = false): void => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.4, 0.06), M.standard({ color: 0x1c1917, roughness: 0.4, metalness: 0.6 }));
    p.position.set(...pos);
    p.rotation.y = rotY;
    // W1: the foyer panel lives in the foyer group (hidden with the foyer interior from afar)
    ;(target === 'foyer' ? (ctx.root.getObjectByName('hub:foyer') ?? ctx.root) : ctx.root).add(p);
    if (post) {
      // the crown fins are gone: the Ausguck panel stands on its own slim post
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, pos[1] - top - 0.2, 12), M.standard({ color: 0xc9c4bf, roughness: 0.3, metalness: 0.95 }));
      stand.position.set(pos[0], top + (pos[1] - top - 0.2) / 2, pos[2]);
      ctx.root.add(markStatic(stand));
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.05, 20), M.standard({ color: 0x1c1917, roughness: 0.38, metalness: 0.2 }));
      foot.position.set(pos[0], top + 0.025, pos[2]);
      ctx.root.add(markStatic(foot));
      ctx.physics.addStaticCylinder({ radius: 0.12, height: 1.4, position: [pos[0], top + 0.7, pos[2]] });
    }
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), M.standard({ color: 0x2dd4bf, emissive: 0x2dd4bf, emissiveIntensity: 0.9 }));
    b.position.set(0, 0, 0.032);
    p.add(b);
    ctx.addInteractable({
      object: p,
      label: { de: 'Lift rufen', en: 'Call lift' },
      range: 2.4,
      isEnabled: () => !riding && at !== target,
      onInteract: () => ride(target, false),
    });
  };
  callPanel([1.75, 1.25, -TOWER.inradius + 0.53], 0, 'foyer');
  // west of the shaft: the east side belongs to the certificate stand and the sky switch (finale)
  callPanel([lx - 2.05, top + 1.15, lz + 0.2], -Math.PI / 2, 'ausguck', true);

  return {
    update() {
      /* event-driven */
    },
    get at() {
      return at;
    },
    get busy() {
      return riding;
    },
    call: (to) => ride(to, false),
    takeOver() {
      if (riding) return null;
      riding = true;
      setLid(false);
      sync();
      return {
        car,
        setY(y) {
          carY = y;
          car.position.y = y;
          towerState.carY = y;
        },
        release(stop) {
          at = stop;
          ctx.progress.set('liftAt', stop);
          carY = stopY(stop);
          car.position.y = carY;
          setLid(true);
          riding = false;
          sync();
          refreshSigns();
        },
      };
    },
    setKielHandler(fn) {
      kielHandler = fn;
    },
    setKielOpen(fn) {
      kielOpenExtra = fn;
      refreshSigns();
    },
    refreshSigns,
  };
}
