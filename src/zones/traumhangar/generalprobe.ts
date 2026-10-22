/**
 * The H2 Meisterprüfung „Generalprobe“ (plan §4.8, D21; station `generalprobe`, `mastery: false`): the
 * optional mastery trophy. Gate: ★★★ on A, B and C and ⌈0.75 × pool⌉ stars (63 of 84; WP1's
 * derivation). Before the gate the H2 waits in its dock as a teal dream ghost: the „Traum-Probefahrt“
 * (from the first hangar stamp) lets you drive it only as a ghost on the dream floor — no stars, no
 * measurement („Den H2 kannst du erst nur träumen.“).
 *
 * The task (≈ 90 s): walk 18 m over mixed floor (gravel, an ice sheen, a loose grating), open the
 * locker's hatch by teleop (hold the right button: the hand target; left: grip, then pull), lift the
 * crate labelled 5 kg, carry it past the rover lane in a gust, set it on the lift pad. Then a second
 * crate appears: 18 kg (the Dunkelfabrik's). The dream, optimistic, shows the lift succeeding; the H2's
 * datasheet says ≈ 7 kg rated, ≈ 15 kg peak per arm (HERSTELLERANGABE). The right move is „Ablehnen“:
 * refuse and call the cart. Traumbudget 12 dreams; the ghosts are reliable to ≈ 2 s.
 * ★ the 5 kg crate on the pad = the H2 earned · ★★ no fall and ≤ 12 dreams · ★★★ ≤ 100 s and the 18 kg
 * crate refused (without trying it). These stars never count for the pool.
 */
import * as THREE from 'three';
import type { ChallengeHandle, Stars } from '@/core/zones';
import { DOCKS, FLOOR, H2, type FloorKind } from './tuning';
import { DreamEnsemble, type DreamStatic } from './dream';
import type { Hangar } from './shared';
import { chipRow, el, legend } from './ui';

type Phase = 'off' | 'walkout' | 'walk' | 'fall' | 'getup' | 'heavy' | 'refused' | 'done';

export interface Generalprobe {
  /** debug (traum-check): the whole task by script — hatch, crate, pad, the 18 kg refused */
  script(): Promise<Record<string, unknown>>;
  start(): void;
  /** the Traum-Probefahrt: the H2 as a ghost on the dream floor (no stars) */
  probe(): void;
  solve(stars?: Stars): void;
  readonly status: Record<string, unknown>;
  update(dt: number): void;
  readonly challenge: ChallengeHandle;
}

const _v = new THREE.Vector3();
const _l = new THREE.Vector3();
const _f = new THREE.Vector3();

export function buildGeneralprobe(H: Hangar): Generalprobe {
  const { ctx, roster, pilot, ghosts, sound } = H;
  const T = H.T;
  const M = ctx.materials;
  const det = ctx.groups.detail;
  const G = <G2 extends THREE.BufferGeometry>(g: G2): G2 => (ctx.onDispose(() => g.dispose()), g);
  const X = H2.laneX;

  // ── the course: mixed floor, the locker with its hatch, the crates, the rover, the fan, the pad ───
  const floorLook: Record<string, THREE.Material> = {
    gravel: M.standard({ color: 0x8c8478, roughness: 1, metalness: 0 }),
    ice: M.standard({ color: 0xdfe9ee, roughness: 0.05, metalness: 0.05, emissive: 0x9fb7c2, emissiveIntensity: 0.08 }),
    grating: M.standard({ color: 0x55585a, roughness: 0.45, metalness: 0.75 }),
  };
  for (const p of H2.floor) {
    const m = new THREE.Mesh(G(new THREE.BoxGeometry(3.0, 0.016, 2.6)), floorLook[p.kind]);
    m.position.set(X, 0.012, p.z);
    m.receiveShadow = true;
    det.add(m);
  }
  const kindAt = (x: number, z: number): FloorKind => {
    if (Math.abs(x - X) <= 1.5) for (const p of H2.floor) if (Math.abs(z - p.z) <= 1.3) return p.kind;
    return 'train';
  };
  // the locker: a steel cabinet against the lane's right edge, its hatch facing −x (hinge at the back)
  const [lx, lz] = H2.locker;
  const cab = new THREE.Mesh(G(new THREE.BoxGeometry(0.8, 1.5, 1.1)), M.standard({ color: 0x5b5b5e, roughness: 0.5, metalness: 0.6 }));
  cab.position.set(lx + 0.15, 0.75, lz);
  cab.castShadow = false; // under the roof: its shadow falls in the roof's (JS budget, §5.5)
  det.add(cab);
  ctx.physics.addStaticBox({ size: [0.8, 1.5, 1.1], position: [lx + 0.15, 0.75, lz] });
  const hinge = new THREE.Group();
  hinge.position.set(lx - 0.26, 0, lz - 0.55);
  hinge.userData.noMerge = true;
  hinge.name = 'traum:h2-hatch';
  const hatch = new THREE.Mesh(G(new THREE.BoxGeometry(0.04, 1.3, 1.08).translate(0, 0.75, 0.54)), M.standard({ color: 0x6f6a64, roughness: 0.5, metalness: 0.5 }));
  hatch.castShadow = false; // under the roof: its shadow falls in the roof's (JS budget, §5.5)
  const handleMesh = new THREE.Mesh(G(new THREE.BoxGeometry(0.06, 0.24, 0.04)), M.standard({ color: 0xff6700, roughness: 0.5 }));
  handleMesh.position.set(-0.05, 1.0, 0.95);
  hinge.add(hatch, handleMesh);
  det.add(hinge);
  const crate = (kg: number, w: number): THREE.Mesh => {
    const c = new THREE.Mesh(G(new THREE.BoxGeometry(w, w * 0.8, w)), M.crate);
    c.castShadow = false; // under the roof: its shadow falls in the roof's (JS budget, §5.5)
    c.userData.noMerge = true;
    ctx.text.label({ text: T(kg === H2.light ? 'h2.crate5' : 'h2.crate18'), size: 0.05, position: [0, w * 0.4 + 0.06, 0], billboard: true }, c);
    det.add(c);
    return c;
  };
  const light = crate(H2.light, 0.36);
  const heavy = crate(H2.heavy, 0.55);
  const resetCrates = (): void => {
    light.position.set(lx - 0.05, 0.18 + 0.02, lz);
    heavy.position.set(9.0, 0.24, 10.6);
    heavy.visible = false;
  };
  resetCrates();
  // the datasheet plate next to the pallet (HERSTELLERANGABE, read it before you dream)
  {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 256;
    const g = cv.getContext('2d')!;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    ctx.onDispose(() => (tex.dispose(), mat.dispose()));
    const draw = (): void => {
      g.fillStyle = '#1f1f1f';
      g.fillRect(0, 0, 512, 256);
      g.fillStyle = 'rgba(245,245,244,0.95)';
      g.font = '700 30px "Space Grotesk", sans-serif';
      g.fillText(ctx.t('h2.sheet.title'), 24, 50);
      g.font = '500 24px "Geist Mono", monospace';
      g.fillText(ctx.t('h2.sheet.rated'), 24, 110);
      g.fillText(ctx.t('h2.sheet.peak'), 24, 150);
      g.font = '500 18px "Geist Mono", monospace';
      g.fillStyle = 'rgba(168,162,158,0.95)';
      g.fillText(ctx.t('h2.sheet.chip'), 24, 210);
      tex.needsUpdate = true;
    };
    draw();
    ctx.i18n.onChange(draw);
    const plate = new THREE.Mesh(G(new THREE.PlaneGeometry(1.2, 0.6)), mat);
    plate.position.set(7.2, 1.5, 10.6);
    plate.rotation.y = Math.PI / 2;
    plate.userData.noMerge = true;
    det.add(plate);
    const post = new THREE.Mesh(G(new THREE.BoxGeometry(0.06, 1.5, 0.06)), M.standard({ color: 0x5b5b5e, roughness: 0.5, metalness: 0.6 }));
    post.position.set(7.15, 0.75, 10.6);
    det.add(post);
  }
  // the lift pad, the rover lane with its rover, the fan
  const [px, pz] = H2.pad;
  const pad = new THREE.Mesh(G(new THREE.BoxGeometry(1.2, 0.06, 1.2)), M.standard({ color: 0x3d3d3d, roughness: 0.6, metalness: 0.3 }));
  pad.position.set(px, 0.03, pz);
  det.add(pad);
  const padRing = new THREE.Mesh(G(new THREE.RingGeometry(0.5, 0.56, 40).rotateX(-Math.PI / 2)), M.basic(0x2dd4bf));
  padRing.position.set(px, 0.07, pz);
  det.add(padRing);
  const R = H2.rover;
  for (const s of [-1, 1]) {
    const stripe = new THREE.Mesh(G(new THREE.BoxGeometry(R.x1 - R.x0 + 0.8, 0.012, 0.06)), M.standard({ color: 0xfbbf24, roughness: 0.7 }));
    stripe.position.set((R.x0 + R.x1) / 2, 0.012, R.z + s * 0.55);
    det.add(stripe);
  }
  const rover = new THREE.Mesh(G(new THREE.BoxGeometry(0.8, 0.45, 0.62)), M.standard({ color: 0xd6d3d1, roughness: 0.5 }));
  rover.castShadow = false; // under the roof: its shadow falls in the roof's (JS budget, §5.5)
  rover.userData.noMerge = true;
  rover.name = 'traum:h2-rover';
  det.add(rover);
  const [fx, fz] = H2.fan;
  const fanBox = new THREE.Mesh(G(new THREE.BoxGeometry(0.4, 1.6, 1.6)), M.standard({ color: 0x5b5b5e, roughness: 0.5, metalness: 0.6 }));
  fanBox.position.set(fx - 0.25, 1.0, fz);
  det.add(fanBox);
  const blades = new THREE.Mesh(G(new THREE.BoxGeometry(0.04, 1.3, 0.16)), M.standard({ color: 0x2a2a2c, roughness: 0.6 }));
  blades.position.set(fx - 0.02, 1.0, fz);
  blades.userData.noMerge = true;
  det.add(blades);
  // the refusal cart (orange = it moves): it rolls in and takes the 18 kg crate
  const cartR = new THREE.Mesh(G(new THREE.BoxGeometry(0.9, 0.35, 1.1)), M.standard({ color: 0x6f6a64, roughness: 0.6, metalness: 0.3 }));
  cartR.userData.noMerge = true;
  cartR.visible = false;
  det.add(cartR);
  // the dream floor for the Traum-Probefahrt: the lane drawn as a teal grid (shown only then)
  const dreamFloor = new THREE.Mesh(G(new THREE.PlaneGeometry(6.4, 26, 16, 64).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color: 0x2dd4bf, wireframe: true, transparent: true, opacity: 0.22, depthWrite: false }));
  dreamFloor.position.set(X, 0.03, -1.6);
  dreamFloor.visible = false;
  dreamFloor.userData.noMerge = true;
  dreamFloor.name = 'traum:dream-floor';
  det.add(dreamFloor);
  ctx.onDispose(() => (dreamFloor.material as THREE.Material).dispose());

  // ── state ────────────────────────────────────────────────────────────────────────────────────
  const st = {
    phase: 'off' as Phase,
    probe: false,
    t: 0,
    started: false,
    dreams: 0,
    fell: false,
    hatch: 0,
    gripHatch: false,
    gripFrom: new THREE.Vector3(),
    carrying: false,
    placed: false,
    tried: false,
    refused: false,
    horizon: 2,
    gust: 0,
    simT: 0,
    phaseT: 0,
    probeGreeted: ctx.progress.get('h2.probeGreeted', false),
  };
  let dream: DreamEnsemble | null = null;
  const statics: DreamStatic[] = [{ kind: 'box', x: lx + 0.15, y: 0.75, z: lz, hx: 0.4, hy: 0.75, hz: 0.55 }];
  const ensureDream = (): DreamEnsemble => (dream ??= new DreamEnsemble(ctx.physics.rapier, statics, [], { radius: 0.24, seed: 41 }));
  ctx.onDispose(() => dream?.dispose());

  const challenge = ctx.game.challenge({
    id: 'generalprobe',
    title: T('h2.title'),
    metric: { label: T('h2.metric'), unit: 's', better: 'lower', digits: 0 },
    goals: [{ text: T('h2.g1') }, { text: T('h2.g2') }, { text: T('h2.g3') }],
    lesson: T('h2.lesson'),
    why: () => ({ eyebrow: T('h2.card.eyebrow'), title: T('h2.card.title'), body: [T('h2.card.body'), T('h2.card.sheet')] }),
    retry: () => restart(),
  });

  let status: { set(s: string): void } | null = null;
  let budget: { set(s: string): void } | null = null;
  // the budget row shows from the first dream on (the goal chip names the 12 already; the console stays short)
  let budgetEl: HTMLElement | null = null;
  const setStatus = (key: string, p?: Record<string, string | number>): void => status?.set(ctx.t(key, p));
  const showBudget = (): void => {
    budget?.set(ctx.t('h2.budget', { n: Math.max(0, H2.budget - st.dreams), of: H2.budget }));
    if (budgetEl) budgetEl.style.display = st.dreams > 0 ? 'flex' : 'none';
  };

  const restart = (): void => {
    const rig = roster.rig('h2');
    if (!rig) return;
    rig.place(H2.start[0], H2.start[1], 0, 1);
    rig.armMode = 'rest';
    rig.fallT = null;
    resetCrates();
    hinge.rotation.y = 0;
    cartR.visible = false;
    Object.assign(st, { phase: 'walk', t: 0, started: false, dreams: 0, fell: false, hatch: 0, gripHatch: false, carrying: false, placed: false, tried: false, refused: false });
    setStatus(st.probe ? 'h2.s.probe' : 'h2.s.walk');
    showBudget();
  };

  const award = (): void => {
    const time = Math.round(st.t);
    const stars = (1 + (!st.fell && st.dreams <= H2.budget ? 1 : 0) + (st.refused && !st.tried && time <= H2.starTime ? 1 : 0)) as Stars;
    const val = (lang: 'de' | 'en'): string => (lang === 'de' ? `H2-Meisterprüfung bestanden · ${time} s · ${st.dreams} Träume` : `H2 master test passed · ${time} s · ${st.dreams} dreams`);
    const first = ctx.pass.award('generalprobe', { value: { de: val('de'), en: val('en') } });
    challenge.submit(time, { stars, detail: T('h2.detail', { d: st.dreams }) });
    if (first) {
      H.say(T('emi.h2.earned'), true);
      ctx.game.juice.burst([px, 1.2, pz], { tone: 'orange', count: 60, spread: 1.6 });
      ctx.events.emit('traumhangar:h2', { earned: true });
    }
  };

  // ── the dream (Traumbudget 12; reliable to ≈ 2 s) ─────────────────────────────────────────────
  const imagine = (): void => {
    const rig = roster.rig('h2');
    if (!rig) return;
    if (!st.probe && st.dreams >= H2.budget) {
      ctx.ui.hint(T('h2.empty'), 1.6);
      ctx.audio.play('error', { volume: 0.4 });
      return;
    }
    st.dreams++;
    showBudget();
    sound.swell();
    sound.hum(true);
    if (st.phase === 'heavy') {
      // the dream knows no datasheet: it shows the H2 carrying the 18 kg crate to the pad
      ghosts.show('h2', [{ x: px - 0.6, z: pz - 0.6, head: rig.head, alpha: 1 }], rig.model.getPose(), [], [{ x: px - 0.3, y: 1.0, z: pz - 0.3, hx: 0.27, hy: 0.22, hz: 0.27 }], { holdS: 0 });
      if (!ctx.progress.get('h2.heavyLine', false)) {
        ctx.progress.set('h2.heavyLine', true);
        H.say(T('emi.h2.heavy'), true);
      }
      return;
    }
    const d = ensureDream();
    if (d.running) return;
    const g = rig.gait;
    d.start({ x: g.pos.x, z: g.pos.z, vx: g.vel.x, vz: g.vel.z, head: rig.head, drive: { kind: 'cmd', v: Math.max(0.3, g.v), w: g.w }, carrying: st.carrying, objects: [] }, st.horizon);
  };

  // ── teleop: the hatch, the crate, the pad ────────────────────────────────────────────────────
  const handlePos = (): THREE.Vector3 => handleMesh.getWorldPosition(_v).applyMatrix4(_inv.copy(ctx.root.matrixWorld).invert());
  const _inv = new THREE.Matrix4();
  const grip = (hand: THREE.Vector3): void => {
    const rig = roster.rig('h2');
    if (!rig || st.probe) return;
    if (st.gripHatch) {
      st.gripHatch = false;
      return;
    }
    if (st.hatch < 0.95 && hand.distanceTo(handlePos()) < 0.35) {
      st.gripHatch = true;
      st.gripFrom.copy(hand);
      sound.snap();
      return;
    }
    if (!st.carrying && st.hatch >= 0.95 && hand.distanceTo(light.position) < 0.45) {
      st.carrying = true;
      rig.armMode = 'carry';
      sound.snap();
      setStatus('h2.s.carry');
      return;
    }
    if (st.carrying) place();
    else if (st.phase === 'heavy' && hand.distanceTo(heavy.position) < 0.6) tryHeavy();
  };
  const place = (): void => {
    const rig = roster.rig('h2')!;
    if (Math.hypot(rig.gait.pos.x - px, rig.gait.pos.z - pz) > 1.1) {
      ctx.ui.hint(T('h2.notPad'), 1.4);
      return;
    }
    st.carrying = false;
    st.placed = true;
    rig.armMode = 'rest';
    light.position.set(px, 0.24, pz);
    sound.ok();
    ctx.game.juice.popup([px, 1.4, pz], T('h2.pop.placed'), { tone: 'good', seconds: 2 });
    // the second crate: the Dunkelfabrik's 18 kg
    st.phase = 'heavy';
    heavy.visible = true;
    ctx.game.juice.burst([heavy.position.x, 0.6, heavy.position.z], { tone: 'stone', count: 20, spread: 0.6 });
    setStatus('h2.s.heavy');
    award();
  };
  const tryHeavy = (): void => {
    const rig = roster.rig('h2')!;
    st.tried = true;
    rig.armMode = 'reach';
    rig.handL.copy(heavy.position).add(_v.set(0, 0.15, -0.3));
    rig.handR.copy(heavy.position).add(_v.set(0, 0.15, 0.3));
    sound.thud([heavy.position.x, 0.4, heavy.position.z]);
    ctx.game.juice.popup([heavy.position.x, 1.5, heavy.position.z], T('h2.pop.tooHeavy'), { tone: 'bad', seconds: 2.6 });
    ctx.after(1.4, () => {
      if (roster.rig('h2')) roster.rig('h2')!.armMode = 'rest';
    });
  };
  const refuse = (): void => {
    if (st.phase !== 'heavy') return;
    st.refused = true;
    st.phase = 'refused';
    sound.ok();
    cartR.visible = true;
    cartR.position.set(16, 0.2, heavy.position.z);
    setStatus('h2.s.refused');
    H.say(T('emi.h2.refused'), true);
    award();
  };

  const hooks = {
    title: T('h2.bar'),
    keys: ['KeyR', 'KeyB', 'KeyE'],
    mu: (x: number, z: number): number => (st.probe ? FLOOR.train : FLOOR[kindAt(x, z)]),
    push: (): THREE.Vector3 | null => {
      if (st.probe || st.gust <= 0) return null;
      return _f.set(H2.gust, 0, 0);
    },
    command: (simDt: number): { v: number; w: number } | null => {
      const rig = roster.rig('h2');
      if (!rig) return null;
      const g = rig.gait;
      if (st.phase === 'walkout') {
        const dz = H2.start[1] - g.pos.z;
        if (dz < 0.05) {
          st.phase = 'walk';
          setStatus(st.probe ? 'h2.s.probe' : 'h2.s.walk');
          return { v: 0, w: 0 };
        }
        return { v: Math.min(g.p.vMax, dz * 1.5 + 0.15), w: 0 };
      }
      if (st.phase === 'fall' || st.phase === 'getup') return { v: 0, w: 0 };
      const k = pilot.keys();
      if (k.v !== 0 && !st.started && !st.probe) st.started = true;
      // carrying slows it down (the 5 kg crate in both hands)
      if (st.carrying) k.v *= 0.7;
      void simDt;
      return pilot.imagining ? { v: 0, w: 0 } : k;
    },
    clamp: (p: THREE.Vector3) => {
      p.x = THREE.MathUtils.clamp(p.x, X - 3.3, X + 3.3);
      p.z = THREE.MathUtils.clamp(p.z, -15, 13.4);
      // the locker
      if (p.x > lx - 0.55 && Math.abs(p.z - lz) < 0.85) p.x = lx - 0.55;
    },
    onKey: (code: string) => {
      if (code === 'KeyR') restart();
      else if (code === 'KeyB') refuse();
      else if (code === 'KeyE' && st.carrying) place();
      else if (code === 'KeyE' && st.phase === 'heavy') tryHeavy();
    },
    onWheel: (dir: number) => {
      st.horizon = dir > 0 ? Math.min(8, st.horizon * 2) : Math.max(0.5, st.horizon / 2);
      ctx.ui.hint(T('h2.horizon', { h: ctx.i18n.num(st.horizon, st.horizon < 1 ? 1 : 0) }), 1.2);
    },
    onImagine: imagine,
    onAct: () => {
      sound.hum(false);
      if (st.phase === 'heavy') ghosts.hide();
    },
    onGrip: grip,
    update: (dt: number, simDt: number) => {
      const rig = roster.rig('h2');
      if (!rig) return;
      const g = rig.gait;
      st.simT += simDt;
      if (st.started && st.phase !== 'done' && st.phase !== 'refused') st.t += simDt;
      if (g.touchdown) sound.step([g.pos.x, 0.05, g.pos.z], 0.7);
      // the dream: beyond ≈ 2 s the ghosts drift (the toy model's spread grows ∝ √t)
      if (dream?.running && dream.tick()) {
        ghosts.show('h2', dream.results.map((r) => ({ x: r.x, z: r.z, head: r.head, alpha: st.horizon > H2.reliableS ? 0.5 : 1 })), rig.model.getPose(), dream.results.map((r) => ({ pts: r.trail, n: r.n })), [], { holdS: pilot.imagining ? 0 : 2 });
      }
      // the hatch follows the gripped hand (pull it away from the locker)
      if (st.gripHatch) {
        const pulled = Math.min(1, pilot.hand.distanceTo(st.gripFrom) / 0.35);
        st.hatch = Math.max(st.hatch, pulled);
        if (st.hatch >= 0.95) {
          st.gripHatch = false;
          sound.ok();
          setStatus('h2.s.crate');
        }
      }
      hinge.rotation.y = -st.hatch * THREE.MathUtils.degToRad(100);
      if (st.carrying) light.position.copy(rig.carryAt);
      // the rover crosses; the fan gusts (1.2 s every 3 s) across its lane
      const L = R.x1 - R.x0;
      const s = (st.simT * R.speed) % (2 * L);
      const rx = s < L ? R.x0 + s : R.x1 - (s - L);
      rover.position.set(rx, 0.225, R.z);
      st.gust = !st.probe && Math.abs(g.pos.z - fz) < 1.6 && st.simT % 3 < 1.2 ? 1 : 0;
      blades.rotation.x += dt * (st.gust ? 22 : 6);
      if (st.gust && Math.random() < dt * 4) ctx.game.juice.burst([g.pos.x - 0.6, 0.4, g.pos.z], { tone: 'stone', count: 3, spread: 0.3 });
      if (!st.probe && st.phase === 'walk') {
        // reality: the rover, the ice (too fast or turning on it: a fall)
        if (Math.abs(rx - g.pos.x) < 0.65 && Math.abs(R.z - g.pos.z) < 0.6) fall('rover');
        else if (kindAt(g.pos.x, g.pos.z) === 'ice' && (Math.abs(g.v) > 0.45 || Math.abs(g.omega) > 0.35)) fall('ice');
      }
      if (st.phase === 'fall') {
        st.phaseT += simDt;
        rig.fallT = Math.min(1, st.phaseT / 1.1);
        if (st.phaseT >= 1.1) {
          sound.thud([g.pos.x, 0.3, g.pos.z]);
          st.phase = 'getup';
          st.phaseT = 0;
        }
      } else if (st.phase === 'getup') {
        st.phaseT += simDt;
        rig.fallT = Math.max(0, 1 - st.phaseT / 1.9);
        if (st.phaseT >= 1.9) {
          rig.fallT = null;
          st.phase = 'walk';
          setStatus('h2.s.walk');
        }
      }
      if (st.refused) {
        // the cart rolls in, takes the crate and leaves
        cartR.position.x += (heavy.position.x - cartR.position.x) * Math.min(1, dt * 1.5);
        if (Math.abs(cartR.position.x - heavy.position.x) < 0.1) heavy.visible = false;
      }
    },
    onExit: () => {
      sound.hum(false);
      ghosts.hide();
      dreamFloor.visible = false;
      H.active = null;
      const rig = roster.rig('h2');
      if (st.probe && rig) {
        roster.dock('h2');
        roster.setState('h2', 'ghost', { instant: true });
      } else if (rig) rig.armMode = 'rest';
      st.phase = 'off';
      st.probe = false;
      H.refreshObjective();
    },
    panel: (root: HTMLElement) => {
      root.dataset.th = 'panel-h2';
      root.append(el('div', 'eyebrow', ctx.t(st.probe ? 'h2.probeTitle' : 'h2.title')));
      if (!st.probe) {
        const goal = challenge.chips();
        goal.style.margin = '6px 0 2px';
        root.append(goal);
      }
      const s = chipRow(ctx, st.probe ? 'traum' : 'sim', T('h2.chipNote'));
      status = s;
      root.append(s.el);
      if (!st.probe) {
        const b = chipRow(ctx, 'traum');
        budget = b;
        budgetEl = b.el;
        root.append(b.el);
        showBudget();
        root.append(legend([[['W', 'A', 'D'], ctx.t('k.walk')], [['␣'], ctx.t('k.dream')], [['RMB'], ctx.t('k.arm')], [['B'], ctx.t('h2.k.refuse')]]));
      } else root.append(legend([[['W', 'A', 'D'], ctx.t('k.walk')], [['␣'], ctx.t('k.dream')], [['V'], ctx.t('k.chase')]]));
      setStatus(st.probe ? 'h2.s.probe' : 'h2.s.walk');
      return () => {
        status = null;
        budget = null;
        budgetEl = null;
      };
    },
  };

  const fall = (why: 'rover' | 'ice'): void => {
    const rig = roster.rig('h2')!;
    st.fell = true;
    st.phase = 'fall';
    st.phaseT = 0;
    rig.fallT = 0;
    sound.slip([rig.gait.pos.x, 0.2, rig.gait.pos.z]);
    ctx.game.juice.popup([rig.gait.pos.x, 2.0, rig.gait.pos.z], T(`h2.fall.${why}`), { tone: 'bad', seconds: 2.2 });
    if (st.carrying) {
      st.carrying = false;
      rig.armMode = 'rest';
      light.position.set(rig.gait.pos.x + 0.4, 0.2, rig.gait.pos.z);
    }
    if (ctx.settings.reducedMotion) {
      // reduced motion: no fall animation — a still with the reason, then it stands again
      st.phase = 'walk';
      rig.fallT = null;
      ctx.ui.hint(T(`h2.fall.${why}`), 2);
    } else pilot.chaseFor(3.2);
  };

  const begin = (probe: boolean): void => {
    if (H.waitFor('h2')) return;
    const rig = roster.rig('h2')!;
    H.active = probe ? 'probe' : 'h2';
    st.probe = probe;
    roster.setActive('h2');
    void ghosts.prepare('h2');
    rig.place(DOCKS.x.h2, DOCKS.robotZ, 0, 1);
    rig.armMode = 'rest';
    resetCrates();
    hinge.rotation.y = 0;
    cartR.visible = false;
    Object.assign(st, { phase: 'walkout', t: 0, started: false, dreams: 0, fell: false, hatch: 0, gripHatch: false, carrying: false, placed: false, tried: false, refused: false, phaseT: 0 });
    dreamFloor.visible = probe;
    pilot.enter(rig, hooks);
    if (probe && !st.probeGreeted) {
      st.probeGreeted = true;
      ctx.progress.set('h2.probeGreeted', true);
      H.say(T('emi.h2.probe'));
    }
  };

  return {
    async script() {
      begin(false);
      const rig = roster.rig('h2');
      if (!rig) return { ok: false, why: 'no H2' };
      const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
      await wait(1800);
      st.started = true;
      // at the locker: grip the hatch's handle, pull it open
      rig.place(lx - 1.0, lz, 1, 0);
      await wait(300);
      grip(handlePos());
      const gripped = st.gripHatch;
      st.hatch = 1;
      st.gripHatch = false;
      await wait(300);
      grip(light.position.clone());
      const carrying = st.carrying;
      // to the lift pad (past the rover lane), set it down
      rig.place(px, pz - 0.6, 0, 1);
      await wait(400);
      place();
      const placed = st.placed;
      await wait(600);
      // the 18 kg crate: dream (optimistic), then refuse
      imagine();
      await wait(400);
      refuse();
      await wait(800);
      return { ok: gripped && carrying && placed && st.refused, gripped, carrying, placed, refused: st.refused, dreams: st.dreams, stamp: ctx.pass.has('generalprobe') };
    },
    start: () => begin(false),
    probe: () => begin(true),
    challenge,
    solve(stars = 1) {
      st.t = stars >= 3 ? 88 : 140;
      st.dreams = stars >= 2 ? 8 : 14;
      st.fell = stars < 2;
      st.refused = stars >= 3;
      st.tried = false;
      award();
    },
    get status() {
      return { phase: st.phase, probe: st.probe, t: Math.round(st.t), dreams: st.dreams, fell: st.fell, hatch: Math.round(st.hatch * 100) / 100, carrying: st.carrying, placed: st.placed, tried: st.tried, refused: st.refused, horizon: st.horizon };
    },
    update(dt) {
      if (H.active === 'h2' || H.active === 'probe') return;
      // the rover keeps crossing (reality does not wait)
      st.simT += dt;
      const L = R.x1 - R.x0;
      const s = (st.simT * R.speed) % (2 * L);
      rover.position.set(s < L ? R.x0 + s : R.x1 - (s - L), 0.225, R.z);
      blades.rotation.x += dt * 6;
    },
  };
  void _l;
}
