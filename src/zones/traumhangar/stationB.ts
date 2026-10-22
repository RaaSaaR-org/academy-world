/**
 * Station B „Wie weit vorausträumen?“ (Verstehen; plan §4.8, R3 §5.5): carry a 2 kg box around a pillar
 * to a shelf 6 m away while the service rover crosses. Hold Space and the Unitree G1 dreams three plans
 * in parallel, one per horizon — 0,5 / 2 / 8 s —, each with K = 5 heads: short horizons walk into the
 * dead-end nook, long ones blur, forget the rover and lose the box behind the pillar („Hinter der Säule
 * hat er die Kiste vergessen.“). 1/2/3 picks a plan, release acts: the planner dreams again every second
 * (model-predictive control) at that horizon. Or drive by hand (W/A/D) and dream only when you need to.
 *
 * At the Messstand: first your prediction („Bei welchem Horizont klappt es am häufigsten?“), then the
 * Messlauf: 20 autonomous runs per horizon in parallel lanes at 8× (the lite planner of model.ts, the
 * same rules as the live dreams) and the Kennlinie with Wilson bands — a hump at 2 s (ILLUSTRATIV).
 * Entscheider: the Kennlinie comes preloaded; set the horizon a vendor should guarantee (1 min).
 *
 * „Bester Horizont 2 s · 85 % [64–95] · n = 20“ · ★ a delivery with a dream + the Messlauf · ★★ the
 * prediction right · ★★★ three deliveries in a row by hand with ≤ 9 dreams.
 */
import * as THREE from 'three';
import { css, type ChallengeHandle, type KennlinieSpec, type Stars, type WorldLabelHandle } from '@/core/zones';
import { B, DOCKS, DREAM } from './tuning';
import { blockedB, bestHorizon, hiddenB, messlaufB, messlaufJobs, planB, rng, roverV, roverX, runB, seesB, waypoints, wilson, type BRun, type Cand, type Walker } from './model';
import { DreamEnsemble, type DreamStatic } from './dream';
import type { Hangar } from './shared';
import type { GhostObject, GhostPose } from './ghosts';
import { button, chipRow, el, legend } from './ui';
import { bakeParts } from './kit';

type Phase = 'off' | 'walkout' | 'drive' | 'auto' | 'delivered' | 'dropped';
type Route = Exclude<Cand, 'wait'>;

export interface StationB {
  start(): void;
  solve(stars?: Stars): void;
  readonly status: Record<string, unknown>;
  update(dt: number): void;
  readonly challenge: ChallengeHandle;
  view(): Promise<() => void>;
  /** the Messstand console (walk-up, E) */
  console(): void;
}

const H_LIST = DREAM.horizons;

export function buildStationB(H: Hangar): StationB {
  const { ctx, roster, pilot, ghosts, sound } = H;
  const T = H.T;
  const M = ctx.materials;
  const det = ctx.groups.detail;
  const G = <G2 extends THREE.BufferGeometry>(g: G2): G2 => (ctx.onDispose(() => g.dispose()), g);

  // ── props: the nook (dead end), the pillar, the shelf, the rover lane, the Messstand ─────────────
  const wallMat = M.standard({ color: 0xc9c5bf, roughness: 0.85 });
  const n = B.nook;
  const nookWalls: [number, number, number, number][] = [
    [n.x0, (n.z0 + n.z1) / 2, n.t, n.z1 - n.z0],
    [n.x1, (n.z0 + n.z1) / 2, n.t, n.z1 - n.z0],
    [(n.x0 + n.x1) / 2, n.z1, n.x1 - n.x0 + n.t, n.t],
    [n.x0 + n.lip / 2, n.z0, n.lip, n.t],
    [n.x1 - n.lip / 2, n.z0, n.lip, n.t],
  ];
  const statics: DreamStatic[] = [];
  for (const [x, z, w, d] of nookWalls) {
    const m = new THREE.Mesh(G(new THREE.BoxGeometry(w, n.h, d)), wallMat);
    m.position.set(x, n.h / 2, z);
    m.castShadow = m.receiveShadow = true;
    det.add(m);
    ctx.physics.addStaticBox({ size: [w, n.h, d], position: [x, n.h / 2, z] });
    statics.push({ kind: 'box', x, y: n.h / 2, z, hx: w / 2, hy: n.h / 2, hz: d / 2 });
  }
  // a hazard stripe on the nook's lips (orange = the signal: a dead end)
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(G(new THREE.BoxGeometry(n.lip, 0.08, n.t + 0.01)), M.hazard(2));
    h.position.set(s < 0 ? n.x0 + n.lip / 2 : n.x1 - n.lip / 2, n.h - 0.05, n.z0);
    det.add(h);
  }
  const P = B.pillar;
  const pillar = new THREE.Mesh(G(new THREE.CylinderGeometry(P.r, P.r, P.h, 28)), M.standard({ color: 0xb9a68a, roughness: 0.78 }));
  pillar.position.set(P.x, P.h / 2, P.z);
  pillar.castShadow = pillar.receiveShadow = true;
  det.add(pillar);
  ctx.physics.addStaticCylinder({ radius: P.r, height: P.h, position: [P.x, P.h / 2, P.z] });
  statics.push({ kind: 'cyl', x: P.x, z: P.z, r: P.r, h: P.h });
  const S = B.shelf;
  const shelfG = new THREE.Group();
  shelfG.position.set(S.x, 0, S.z);
  for (const y of [0.32, 0.72, S.h]) {
    const b = new THREE.Mesh(G(new THREE.BoxGeometry(S.w, 0.04, S.d)), M.standard({ color: 0xb9a68a, roughness: 0.8 }));
    b.position.y = y;
    b.castShadow = b.receiveShadow = true;
    shelfG.add(b);
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(G(new THREE.BoxGeometry(0.05, S.h, 0.05)), M.standard({ color: 0x5b5b5e, roughness: 0.5, metalness: 0.6 }));
      post.position.set((sx * (S.w - 0.06)) / 2, S.h / 2, (sz * (S.d - 0.06)) / 2);
      shelfG.add(post);
    }
  det.add(shelfG);
  ctx.physics.addStaticBox({ size: [S.w, S.h, S.d], position: [S.x, S.h / 2, S.z] });
  statics.push({ kind: 'box', x: S.x, y: S.h / 2, z: S.z, hx: S.w / 2, hy: S.h / 2, hz: S.d / 2 });
  // the rover lane: two thin stripes and a sign
  const R = B.rover;
  for (const s of [-1, 1]) {
    const stripe = new THREE.Mesh(G(new THREE.BoxGeometry(R.x1 - R.x0 + R.w, 0.012, 0.06)), M.standard({ color: 0xfbbf24, roughness: 0.7 }));
    stripe.position.set((R.x0 + R.x1) / 2, 0.012, R.z + s * (R.d / 2 + 0.22));
    det.add(stripe);
  }
  // the service rover (reality): a low cart with a sensor ring (teal = data) and four wheels
  const rover = new THREE.Group();
  rover.name = 'traum:b-rover';
  rover.userData.noMerge = true;
  {
    // body, top and wheels baked into one vertex-coloured mesh (one draw; its shadow falls in the roof's)
    const body = new THREE.Mesh(new THREE.BoxGeometry(R.w, R.h * 0.62, R.d), M.standard({ color: 0xd6d3d1, roughness: 0.5 }));
    body.position.y = R.h * 0.5;
    const top = new THREE.Mesh(new THREE.BoxGeometry(R.w * 0.9, 0.04, R.d * 0.9), M.standard({ color: 0x3d3d3d, roughness: 0.6 }));
    top.position.y = R.h * 0.82;
    const parts: THREE.Mesh[] = [body, top];
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 14).rotateZ(Math.PI / 2), M.standard({ color: 0x1c1917, roughness: 0.9 }));
        w.position.set(sx * (R.w / 2 - 0.08), 0.08, sz * (R.d / 2 - 0.06));
        parts.push(w);
      }
    const ring = new THREE.Mesh(G(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 16)), M.basic(0x2dd4bf));
    ring.position.set(0, R.h * 0.9, 0);
    rover.add(bakeParts(ctx, parts, 'traum:b-rover-body'), ring);
  }
  rover.position.set(R.x0, 0, R.z);
  det.add(rover);
  // the box (2 kg) and its little table at the start
  const box = new THREE.Mesh(G(new THREE.BoxGeometry(B.box, B.box, B.box)), M.crate);
  box.castShadow = false; // under the roof: its shadow falls in the roof's (JS budget, §5.5)
  box.userData.noMerge = true;
  box.name = 'traum:b-box';
  det.add(box);
  const boxLabel = ctx.text.label({ text: T('b.boxLabel'), size: 0.045, position: [0, B.box / 2 + 0.05, 0], billboard: true }, box);
  void boxLabel;
  const table = new THREE.Mesh(G(new THREE.BoxGeometry(0.7, 0.75, 0.5)), M.standard({ color: 0xb9a68a, roughness: 0.8 }));
  table.position.set(B.start[0] - 1.2, 0.375, B.start[1] + 0.2);
  table.receiveShadow = true;
  det.add(table);

  // the Messstand: a desk at the lane's front with the Messlauf screen and the Kennlinie screen behind it
  const desk = new THREE.Mesh(G(new THREE.BoxGeometry(1.4, 0.95, 0.55)), M.standard({ color: 0x3d3d3d, roughness: 0.55, metalness: 0.3 }));
  desk.position.set(B.laneX, 0.475, 5.6);
  desk.castShadow = false; // under the roof: its shadow falls in the roof's (JS budget, §5.5)
  desk.name = 'traum:b-desk';
  det.add(desk);
  ctx.physics.addStaticBox({ size: [1.4, 0.95, 0.55], position: [B.laneX, 0.475, 5.6] });
  const scrCv = document.createElement('canvas');
  scrCv.width = 1024;
  scrCv.height = 512;
  const scrG = scrCv.getContext('2d')!;
  const scrTex = new THREE.CanvasTexture(scrCv);
  scrTex.colorSpace = THREE.SRGBColorSpace;
  const scrMat = new THREE.MeshBasicMaterial({ map: scrTex, toneMapped: false });
  ctx.onDispose(() => (scrTex.dispose(), scrMat.dispose()));
  const screen = new THREE.Mesh(G(new THREE.PlaneGeometry(4.2, 2.1)), scrMat);
  screen.position.set(B.laneX - 0.9, 2.35, 3.2);
  screen.userData.noMerge = true;
  det.add(screen);
  const frame = new THREE.Mesh(G(new THREE.BoxGeometry(4.36, 2.26, 0.08)), M.standard({ color: 0x1f1f1f, roughness: 0.5 }));
  frame.position.set(B.laneX - 0.9, 2.35, 3.15);
  det.add(frame);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(G(new THREE.BoxGeometry(0.08, 1.3, 0.08)), M.standard({ color: 0x5b5b5e, roughness: 0.5, metalness: 0.6 }));
    leg.position.set(B.laneX - 0.9 + sx * 1.9, 0.65, 3.12);
    det.add(leg);
  }
  const kl = ctx.ui.kennlinie(klSpec(null), { target: 'texture', width: 512, height: 300 });
  const klMat = new THREE.MeshBasicMaterial({ map: kl.texture!, toneMapped: false });
  ctx.onDispose(() => klMat.dispose());
  const klMesh = new THREE.Mesh(G(new THREE.PlaneGeometry(1.75, 1.03)), klMat);
  klMesh.position.set(B.laneX + 2.15, 2.0, 3.2);
  klMesh.userData.noMerge = true;
  det.add(klMesh);

  // ── state ────────────────────────────────────────────────────────────────────────────────────
  const st = {
    phase: 'off' as Phase,
    t: 0,
    simT: 0,
    roverPhase: 0.15,
    lastSeen: -1e9,
    seenX: 0,
    seenV: 0,
    usedDream: false,
    dreams: 0,
    auto: null as null | { h: number; route: Route; walker: Walker; plan: Cand; next: number; stall: number; r: () => number; startT: number },
    plans: [] as { h: number; route: Route; wi: number }[],
    pick: -1,
    streak: { n: 0, dreams: 0 },
    deliveredWithDream: ctx.progress.get('b.deliveredWithDream', false),
    measured: ctx.progress.get<{ rows: { horizon: number; k: number; n: number }[]; best: number } | null>('b.measured', null),
    pred: ctx.progress.get<number | null>('b.pred', null),
    phaseT: 0,
    lostSeen: false,
    greeted: ctx.progress.get('b.greeted', false),
  };
  let ml: null | { rows: { horizon: number; k: number; n: number; runs: BRun[] }[]; i: number; replay: number; done: boolean; seed: number } = null;

  const challenge = ctx.game.challenge({
    id: 'voraustraeumen',
    title: T('b.title'),
    metric: { label: T('b.metric'), unit: '%', better: 'higher', digits: 0 },
    goals: [{ text: T('b.g1') }, { text: T('b.g2') }, { text: T('b.g3') }],
    lesson: T('b.lesson'),
    why: () => ({
      eyebrow: T('b.card.eyebrow'),
      title: T('b.card.title'),
      body: [T('b.card.entdecker'), T('b.card.curious')],
      entscheider: { body: [T('b.card.entscheider'), T('b.card.curious')] },
    }),
    retry: () => restart(),
  });

  // ── the dream of three plans (Rapier: K heads per plan, one after the other) ────────────────────
  let dream: DreamEnsemble | null = null;
  const ensureDream = (): DreamEnsemble => (dream ??= new DreamEnsemble(ctx.physics.rapier, statics, [{ id: 'rover', hx: R.w / 2, hy: R.h / 2, hz: R.d / 2, mass: 40, kinematic: true }], { radius: 0.2, seed: 23 }));
  ctx.onDispose(() => dream?.dispose());
  let queue: { h: number; route: Route; wi: number }[] = [];
  const done: { h: number; route: Route; res: DreamEnsemble['results']; spread: number }[] = [];
  const labels: WorldLabelHandle[] = [];
  const labelAt: THREE.Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const o = new THREE.Object3D();
    o.position.set(0, -50, 0);
    o.userData.noMerge = true;
    det.add(o);
    labelAt.push(o);
    const lb = ctx.hud.worldLabel(o, T(`b.plan${i}`), { eyebrow: T('b.dreamEyebrow'), maxDistance: 30, kind: 'accent' });
    lb.setVisible(false);
    labels.push(lb);
  }

  const walker = (): Walker | null => {
    const rig = roster.rig('g1');
    if (!rig) return null;
    return { x: rig.gait.pos.x, z: rig.gait.pos.z, psi: rig.head, i: 0 };
  };
  const memory = (): { x: number; v: number } | null => (st.simT - st.lastSeen <= DREAM.forgetS ? { x: st.seenX + st.seenV * (st.simT - st.lastSeen), v: st.seenV } : null);

  const dreamPlans = (): void => {
    const w = walker();
    const rig = roster.rig('g1');
    if (!w || !rig || st.phase !== 'drive') return;
    const r = rng(H.seed());
    // the lite planner picks each horizon's best plan from here (the routes a planner would commit to)
    st.plans = H_LIST.map((h) => {
      const pl = planB(B, w, h, memory(), r, DREAM.noise, 'straight', DREAM.agentNoise, DREAM.forgetS);
      return { h, route: pl.route, wi: 0 };
    });
    queue = [...st.plans];
    done.length = 0;
    st.pick = -1;
    st.dreams++;
    st.streak.dreams++;
    st.usedDream = true;
    sound.swell();
    sound.hum(true);
    startNext();
  };
  const startNext = (): void => {
    const d = ensureDream();
    const rig = roster.rig('g1');
    const job = queue.shift();
    if (!job || !rig) return;
    const g = rig.gait;
    const mem = memory();
    d.start(
      {
        x: g.pos.x,
        z: g.pos.z,
        vx: g.vel.x,
        vz: g.vel.z,
        head: rig.head,
        drive: { kind: 'route', wps: waypoints(B, job.route), v: B.speed, turn: B.turn },
        carrying: true,
        objects: mem ? [{ id: 'rover', x: mem.x, y: R.h / 2, z: R.z, vx: mem.v, vz: 0, hx: R.w / 2, hy: R.h / 2, hz: R.d / 2, mass: 40, kinematic: true }] : [],
      },
      job.h,
      { occluded: (ex, ez, x, z) => hiddenB(B, ex, ez, x, z) },
    );
    (d as unknown as { job: typeof job }).job = job;
  };
  const showPlans = (): void => {
    const rig = roster.rig('g1');
    if (!rig || !done.length) return;
    const poses: GhostPose[] = [];
    const trails: { pts: ArrayLike<number>; n: number }[] = [];
    const objs: GhostObject[] = [];
    let lost = false;
    done.forEach((p, i) => {
      let x = 0,
        z = 0,
        sx = 0,
        cz = 0,
        nLost = 0;
      for (const e of p.res) {
        x += e.x / p.res.length;
        z += e.z / p.res.length;
        sx += Math.sin(e.head);
        cz += Math.cos(e.head);
        if (e.boxLost) nLost++;
        trails.push({ pts: e.trail, n: e.n });
      }
      const head = Math.atan2(sx, cz);
      // a long dream blurs: its ghost fades with the spread of its heads
      const alpha = THREE.MathUtils.clamp(0.35 / Math.max(0.35, p.spread), 0.35, 1) * (st.pick < 0 || st.pick === i ? 1 : 0.5);
      poses.push({ x, z, head, alpha });
      if (nLost <= p.res.length / 2) objs.push({ x: x + Math.sin(head) * 0.3, y: 0.95, z: z + Math.cos(head) * 0.3, hx: B.box / 2, hy: B.box / 2, hz: B.box / 2 });
      else lost = true;
      const rv = p.res[0].objects.get('rover');
      if (rv) objs.push({ x: rv.x, y: R.h / 2, z: rv.z, hx: R.w / 2, hy: R.h / 2, hz: R.d / 2 });
      // beside its ghost, on the ghost's right (the dream view looks down: a label above would cover it)
      labelAt[i].position.set(x - Math.cos(head) * 0.85, 1.3, z + Math.sin(head) * 0.85);
      labels[i].setVisible(true);
    });
    ghosts.show('g1', poses, rig.model.getPose(), trails, objs, { holdS: pilot.imagining ? 0 : 2.5 });
    if (lost) {
      if (!st.lostSeen) {
        st.lostSeen = true;
        H.say(T('emi.b.lost'), true);
      }
      // album: the box vanished from the dream behind the pillar
      ctx.pass.unlockAlbum('kiste-weg');
    }
  };
  const hideLabels = (): void => labels.forEach((l) => l.setVisible(false));

  // ── the run: drive, auto (MPC), deliver, drop ────────────────────────────────────────────────
  const restart = (keepStreak = false): void => {
    const rig = roster.rig('g1');
    if (!rig) return;
    rig.place(B.start[0], B.start[1], 0, 1);
    lastFree.set(B.start[0], 0, B.start[1]);
    rig.armMode = 'carry';
    st.phase = 'drive';
    st.auto = null;
    st.usedDream = false;
    st.t = 0;
    if (!keepStreak) st.streak = { n: 0, dreams: 0 };
    ghosts.hide(true);
    hideLabels();
    setStatus('b.s.drive');
  };
  const deliver = (): void => {
    const rig = roster.rig('g1')!;
    st.phase = 'delivered';
    st.phaseT = 0;
    rig.armMode = 'rest';
    box.position.set(S.x, 0.72 + B.box / 2 + 0.02, S.z);
    sound.ok();
    ctx.game.juice.burst([S.x, 1.0, S.z], { tone: 'teal', count: 30, spread: 0.6 });
    ctx.game.juice.popup([S.x, 1.5, S.z], T('b.pop.delivered'), { tone: 'good', seconds: 1.8 });
    const manual = !st.auto;
    if (manual) {
      st.streak.n++;
    } else st.streak = { n: 0, dreams: 0 };
    if (st.usedDream && !st.deliveredWithDream) {
      st.deliveredWithDream = true;
      ctx.progress.set('b.deliveredWithDream', true);
    }
    st.auto = null;
    ghosts.hide();
    hideLabels();
    award();
    if (manual && st.streak.n >= B.manualDeliveries) setStatus('b.s.streak', { n: st.streak.n, d: st.streak.dreams });
    else setStatus('b.s.delivered', { n: st.streak.n, d: st.streak.dreams });
  };
  const drop = (why: 'rover' | 'nook' | 'time'): void => {
    const rig = roster.rig('g1')!;
    st.phase = 'dropped';
    st.phaseT = 0;
    rig.armMode = 'rest';
    box.position.set(rig.gait.pos.x + 0.3, B.box / 2, rig.gait.pos.z + 0.2);
    sound.thud([rig.gait.pos.x, 0.2, rig.gait.pos.z]);
    ctx.game.juice.popup([rig.gait.pos.x, 1.6, rig.gait.pos.z], T(`b.fail.${why}`), { tone: 'bad', seconds: 2.2 });
    st.auto = null;
    st.streak = { n: 0, dreams: 0 };
    setStatus(`b.s.${why}`);
    if (why === 'nook' && !ctx.progress.get('b.nookLine', false)) {
      ctx.progress.set('b.nookLine', true);
      H.say(T('emi.b.nook'));
    }
  };

  const act = (): void => {
    sound.hum(false);
    if (st.phase !== 'drive' || !st.plans.length) return;
    // a pick (1/2/3) or Auto: the planner's own favourite (the plan whose dream ends nearest the goal)
    let idx = st.pick;
    if (idx < 0) {
      let best = Infinity;
      done.forEach((p, i) => {
        const m = p.res.reduce((a, e) => a + Math.hypot(e.x - B.goal[0], e.z - B.goal[1]) + (e.hit ? B.hitCost : 0) + (e.boxLost ? B.boxCost : 0), 0) / Math.max(1, p.res.length);
        if (m < best) {
          best = m;
          idx = i;
        }
      });
      if (idx < 0) return;
      ctx.ui.hint(T('b.auto', { h: ctx.i18n.num(st.plans[idx].h, st.plans[idx].h < 1 ? 1 : 0) }), 1.8);
    }
    const plan = st.plans[idx];
    const w = walker();
    if (!w) return;
    st.auto = { h: plan.h, route: plan.route, walker: { ...w, i: 0 }, plan: plan.route, next: 0, stall: 0, r: rng(H.seed()), startT: st.simT };
    st.phase = 'auto';
    sound.snap();
    setStatus('b.s.auto', { h: ctx.i18n.num(plan.h, plan.h < 1 ? 1 : 0) });
  };

  const hooks = {
    title: T('b.bar'),
    keys: ['KeyR'],
    command: (simDt: number): { v: number; w: number } | null => {
      const rig = roster.rig('g1');
      if (!rig) return null;
      const g = rig.gait;
      if (st.phase === 'walkout') {
        const dz = B.start[1] - g.pos.z;
        if (dz < 0.05) {
          restart(true);
          return { v: 0, w: 0 };
        }
        return { v: Math.min(g.p.vMax, dz * 1.5 + 0.15), w: 0 };
      }
      if (st.phase === 'auto' && st.auto) {
        const a = st.auto;
        // the player takes over with a walking key
        const k = pilot.keys();
        if (k.v !== 0 || k.w !== 0) {
          st.auto = null;
          st.phase = 'drive';
          setStatus('b.s.drive');
          return k;
        }
        a.walker = { x: g.pos.x, z: g.pos.z, psi: rig.head, i: a.walker.i };
        if (st.simT >= a.next) {
          const pl = planB(B, a.walker, a.h, memory(), a.r, DREAM.noise, a.route, DREAM.agentNoise, DREAM.forgetS);
          if (pl.route !== a.route) a.walker.i = 0;
          a.route = pl.route;
          a.plan = pl.cand;
          a.next = st.simT + B.act;
          st.dreams++;
          // dream, act, dream again: the chosen dream shows for a moment
          const d = pl.dreams[pl.cand] ?? pl.dreams[a.route];
          if (d) ghosts.show('g1', [{ x: d.x, z: d.z, head: rig.head, alpha: 0.8 }], rig.model.getPose(), [{ pts: d.trail, n: d.trail.length / 2 }], [], { holdS: 0.8 });
        }
        if (a.plan === 'wait') return { v: 0, w: 0 };
        // steer the gait like the lite walker: turn toward the waypoint, walk when facing it
        const wps = waypoints(B, a.route);
        while (a.walker.i < wps.length - 1 && Math.hypot(wps[a.walker.i][0] - g.pos.x, wps[a.walker.i][1] - g.pos.z) < 0.45) a.walker.i++;
        const tgt = wps[Math.min(a.walker.i, wps.length - 1)];
        let e = Math.atan2(tgt[0] - g.pos.x, tgt[1] - g.pos.z) - rig.head;
        e = Math.atan2(Math.sin(e), Math.cos(e));
        const v = B.speed * THREE.MathUtils.clamp((Math.cos(e) - 0.5) / 0.5, 0, 1);
        // stuck: no progress for 6 s (the dead end, or a planner that does not dare)
        if (Math.hypot(g.vel.x, g.vel.z) < 0.03 && v > 0.05) a.stall += simDt;
        else if (v > 0.05) a.stall = 0;
        if (a.stall > 6) {
          const inNook = g.pos.x > n.x0 - 0.3 && g.pos.x < n.x1 + 0.3 && g.pos.z > n.z0 - 0.8;
          drop(inNook ? 'nook' : 'time');
          return { v: 0, w: 0 };
        }
        // a stuck heading counts too: the nook's walls stop it, the pursuit keeps pushing
        return { v, w: THREE.MathUtils.clamp(e * 2.5, -B.turn, B.turn) };
      }
      if (st.phase === 'drive') return pilot.imagining ? { v: 0, w: 0 } : pilot.keys();
      return { v: 0, w: 0 };
    },
    clamp: (p: THREE.Vector3) => {
      const rig = roster.rig('g1');
      if (!rig) return;
      // the walls, the pillar and the shelf stop the robot (it does not walk through them)
      const shelfHit = Math.abs(p.x - S.x) < S.w / 2 + B.radius && Math.abs(p.z - S.z) < S.d / 2 + B.radius;
      if (st.phase !== 'walkout' && (blockedB(B, p.x, p.z) || shelfHit)) {
        p.copy(lastFree);
        rig.gait.vel.set(0, 0, 0);
      } else lastFree.copy(p);
      p.x = THREE.MathUtils.clamp(p.x, B.laneX - 3.3, B.laneX + 3.3);
      p.z = THREE.MathUtils.clamp(p.z, -15, 1.5);
    },
    onKey: (code: string) => {
      if (code === 'KeyR') restart();
      else if (code.startsWith('Digit') && pilot.imagining && st.plans.length) {
        const i = Number(code.slice(5)) - 1;
        if (i >= 0 && i < 3) {
          st.pick = i;
          ctx.audio.play('click', { pitch: 1 + i * 0.2 });
          showPlans();
        }
      }
    },
    onWheel: (dir: number) => {
      if (!pilot.imagining || !st.plans.length) return;
      st.pick = THREE.MathUtils.clamp((st.pick < 0 ? 1 : st.pick) + dir, 0, 2);
      showPlans();
    },
    onImagine: () => {
      if (st.phase === 'drive') dreamPlans();
    },
    onAct: act,
    update: (dt: number, simDt: number) => {
      const rig = roster.rig('g1');
      if (!rig) return;
      const g = rig.gait;
      st.simT += simDt;
      // the robot's memory of the rover (line of sight past the pillar)
      const rx = roverX(B, st.simT, st.roverPhase);
      if (seesB(B, g.pos.x, g.pos.z, rx, R.z)) {
        st.lastSeen = st.simT;
        st.seenX = rx;
        st.seenV = roverV(B, st.simT, st.roverPhase);
      }
      if (dream?.running && dream.tick()) {
        const job = (dream as unknown as { job: { h: number; route: Route; wi: number } }).job;
        done.push({ h: job.h, route: job.route, res: dream.results.slice(), spread: dream.spread() });
        showPlans();
        if (queue.length) startNext();
      }
      if (g.touchdown) sound.step([g.pos.x, 0.05, g.pos.z], 0.3);
      if (rig.armMode === 'carry') box.position.copy(rig.carryAt);
      if (st.phase === 'drive' || st.phase === 'auto') {
        st.t += simDt;
        // reality: the rover
        if (Math.abs(rx - g.pos.x) < R.w / 2 + B.radius * 0.8 && Math.abs(R.z - g.pos.z) < R.d / 2 + B.radius * 0.8) drop('rover');
        else if (Math.hypot(g.pos.x - B.goal[0], g.pos.z - B.goal[1]) < 0.4) deliver();
      } else if (st.phase === 'delivered' || st.phase === 'dropped') {
        st.phaseT += dt;
        if (st.phaseT > 2.2) restart(st.phase === 'delivered');
      }
      void dt;
    },
    onExit: () => {
      sound.hum(false);
      ghosts.hide();
      hideLabels();
      H.active = null;
      if (st.phase !== 'off') st.phase = 'off';
      H.refreshObjective();
    },
    panel: (root: HTMLElement) => {
      root.dataset.th = 'panel-b';
      root.append(el('div', 'eyebrow', ctx.t('b.title')));
      const goal = challenge.chips();
      goal.style.margin = '6px 0 2px';
      root.append(goal);
      const s = chipRow(ctx, 'traum', T('b.chipNote'));
      status = s;
      root.append(s.el);
      root.append(legend([[['W', 'A', 'D'], ctx.t('k.walk')], [['␣'], ctx.t('k.dream')], [['1', '2', '3'], ctx.t('k.pick')], [['V'], ctx.t('k.chase')]]));
      setStatus(st.phase === 'walkout' ? 'b.s.walkout' : 'b.s.drive');
      return () => {
        status = null;
      };
    },
  };
  const lastFree = new THREE.Vector3(B.start[0], 0, B.start[1]);
  let status: { set(s: string): void } | null = null;
  const setStatus = (key: string, p?: Record<string, string | number>): void => status?.set(ctx.t(key, p));

  // the rover runs whenever the station is near (reality does not wait for the pilot)
  const updateRover = (dt: number): void => {
    if (H.active !== 'b') st.simT += dt;
    const x = roverX(B, st.simT, st.roverPhase);
    rover.position.x = x;
    rover.rotation.y = roverV(B, st.simT, st.roverPhase) > 0 ? 0 : Math.PI;
  };

  // ── the Messlauf (the lite planner, time-sliced) and its screen ────────────────────────────────
  function klSpec(rows: { horizon: number; k: number; n: number }[] | null): KennlinieSpec {
    const best = rows ? bestHorizon(rows) : null;
    const bestRow = rows?.find((r) => r.horizon === best);
    return {
      title: T('b.kTitle'),
      xLabel: T('b.kx'),
      yLabel: T('b.ky'),
      chip: 'illustrativ',
      band: 'wilson95',
      percent: true,
      xLog: true,
      xMin: 0.4,
      xMax: 10,
      yMin: 0,
      yMax: 1,
      keyValue: bestRow ? `${ctx.i18n.num(best!, best! < 1 ? 1 : 0)} s · ${ctx.ui.formatRate(bestRow.k, bestRow.n)}` : undefined,
      series: rows ? [{ id: 'mess', label: T('b.kSeries'), trials: rows.map((r) => ({ x: r.horizon, k: r.k, n: r.n })), color: css.teal }] : [],
    };
  }
  const drawScreen = (): void => {
    const g = scrG;
    const W = scrCv.width,
      Hh = scrCv.height;
    g.fillStyle = '#141414';
    g.fillRect(0, 0, W, Hh);
    g.font = '600 22px "Geist Mono", monospace';
    g.fillStyle = 'rgba(245,245,244,0.92)';
    g.fillText(ctx.i18n.resolve(T('b.screenTitle')), 24, 36);
    g.font = '500 15px "Geist Mono", monospace';
    g.fillStyle = 'rgba(45,212,191,0.9)';
    g.fillText(ctx.i18n.resolve(T('b.screenChip')), W - 260, 36);
    const cols = 3;
    const cw = (W - 48) / cols;
    const rows = ml?.rows ?? null;
    for (let c = 0; c < cols; c++) {
      const x0 = 24 + c * cw;
      const h = H_LIST[c];
      g.fillStyle = 'rgba(245,245,244,0.85)';
      g.font = '700 20px "Space Grotesk", sans-serif';
      g.fillText(`${ctx.i18n.num(h, h < 1 ? 1 : 0)} s`, x0, 76);
      const row = rows?.[c];
      if (row && ml) {
        const shown = row.runs.filter((_, i) => i < ml!.i - c * B.runs || ml!.i >= (c + 1) * B.runs);
        const kk = ml.done ? row.k : shown.filter((r) => r.ok && r.t * 1 <= ml!.replay * B.replaySpeed).length;
        g.font = '500 16px "Geist Mono", monospace';
        g.fillStyle = 'rgba(45,212,191,0.95)';
        g.fillText(`${kk}/${B.runs}`, x0 + cw - 90, 76);
      }
      // 20 mini maps (4 × 5)
      for (let i = 0; i < B.runs; i++) {
        const mx = x0 + (i % 5) * ((cw - 16) / 5);
        const my = 92 + Math.floor(i / 5) * 102;
        const mw = (cw - 16) / 5 - 6,
          mh = 94;
        g.fillStyle = '#1f1f1f';
        g.fillRect(mx, my, mw, mh);
        // map: lane x −7…0 → mw, z −13…−5.4 → mh (top = the shelf)
        const X = (x: number): number => mx + ((x - (B.laneX - 3.5)) / 7) * mw;
        const Z = (z: number): number => my + mh - ((z + 13) / 7.6) * mh;
        g.strokeStyle = 'rgba(168,162,158,0.6)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(X(n.x0 + n.lip), Z(n.z0));
        g.lineTo(X(n.x0), Z(n.z0));
        g.lineTo(X(n.x0), Z(n.z1));
        g.lineTo(X(n.x1), Z(n.z1));
        g.lineTo(X(n.x1), Z(n.z0));
        g.lineTo(X(n.x1 - n.lip), Z(n.z0));
        g.stroke();
        g.fillStyle = 'rgba(185,166,138,0.8)';
        g.beginPath();
        g.arc(X(P.x), Z(P.z), (P.r / 7) * mw, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(168,162,158,0.5)';
        g.fillRect(X(S.x - S.w / 2), Z(S.z + S.d / 2), (S.w / 7) * mw, 5);
        const run = row?.runs[i];
        if (!run || !ml || c * B.runs + i >= ml.i) continue;
        // replay at 8×
        const tShow = ml.done ? Infinity : ml.replay * B.replaySpeed;
        const nPts = Math.min(run.path.length / 2, Math.floor(tShow / 0.2) + 1);
        g.strokeStyle = 'rgba(255,103,0,0.95)';
        g.lineWidth = 2;
        g.beginPath();
        for (let k = 0; k < nPts; k++) {
          const px = X(run.path[k * 2]),
            pz = Z(run.path[k * 2 + 1]);
          if (k === 0) g.moveTo(px, pz);
          else g.lineTo(px, pz);
        }
        g.stroke();
        const rk = Math.min(run.rover.length - 1, nPts - 1);
        g.fillStyle = 'rgba(214,211,209,0.9)';
        g.fillRect(X(run.rover[rk]) - 4, Z(R.z) - 3, 8, 6);
        if (nPts >= run.path.length / 2) {
          g.font = '700 18px "Geist", sans-serif';
          g.fillStyle = run.ok ? 'rgba(45,212,191,1)' : 'rgba(168,162,158,0.95)';
          g.fillText(run.ok ? '✓' : '✕', mx + mw - 18, my + 20);
          if (!run.ok) {
            g.font = '500 11px "Geist Mono", monospace';
            g.fillText(ctx.i18n.resolve(T(`b.why.${run.outcome}`)), mx + 4, my + mh - 6);
          }
        }
      }
    }
    scrTex.needsUpdate = true;
  };
  drawScreen();
  ctx.i18n.onChange(drawScreen);

  const startMesslauf = (onDone?: () => void): void => {
    if (ml && !ml.done) return;
    const seed = H.seed();
    // computed here in time slices (each run ≈ 0,4 ms, a frame takes what fits in 2 ms)
    const rows = H_LIST.map((h) => ({ horizon: h, k: 0, n: B.runs, runs: [] as BRun[] }));
    ml = { rows, i: 0, replay: 0, done: false, seed };
    ctx.game.unattended(true, 'voraustraeumen');
    // the same stratified situations as model.messlaufB (the hangar and the tools agree)
    const all = messlaufJobs(B, seed, H_LIST);
    let j = 0;
    const tick = (): void => {
      if (!ml) return;
      const t0 = performance.now();
      while (j < all.length && performance.now() - t0 < 2) {
        const job = all[j++];
        const r = runB(B, job.h, { dx: job.dx, phase: job.phase, seed: job.seed, noise: DREAM.noise, agentNoise: DREAM.agentNoise, forgetS: DREAM.forgetS });
        const row = rows[H_LIST.indexOf(job.h as (typeof H_LIST)[number])];
        row.runs.push(r);
        if (r.ok) row.k++;
        ml.i = j;
      }
      if (j < all.length) ctx.after(0, tick);
      else finishLater(onDone);
    };
    tick();
  };
  const finishLater = (onDone?: () => void): void => {
    // the replay at 8×: at most ≈ 3,3 s (26 s of sim time), then the Kennlinie
    const longest = Math.max(...ml!.rows.flatMap((r) => r.runs.map((x) => x.t)));
    const wall = Math.min(8, longest / B.replaySpeed + 0.4);
    const t0 = ctx.time.elapsed;
    const step = ctx.every(1 / 20, () => {
      if (!ml) return;
      ml.replay = ctx.time.elapsed - t0;
      drawScreen();
      if (ml.replay >= wall) {
        step();
        ml.done = true;
        drawScreen();
        ctx.game.unattended(false, 'voraustraeumen');
        const rows = ml.rows.map((r) => ({ horizon: r.horizon, k: r.k, n: r.n }));
        st.measured = { rows, best: bestHorizon(rows) };
        ctx.progress.set('b.measured', st.measured);
        kl.update(klSpec(rows));
        if (st.pred != null) ctx.pass.recordPrediction('voraustraeumen', st.pred, st.measured.best, { min: 0.5, max: 8, scale: 'log' });
        sound.ok();
        award();
        onDone?.();
      }
    });
  };

  // ── stars and stamp ──────────────────────────────────────────────────────────────────────────
  const award = (): void => {
    const m = st.measured;
    if (!m || !st.deliveredWithDream) return;
    const best = m.rows.find((r) => r.horizon === m.best)!;
    const [p, lo, hi] = wilson(best.k, best.n);
    const pc = (x: number): number => Math.round(x * 100);
    const val = (lang: 'de' | 'en'): string => `${lang === 'de' ? 'Bester Horizont' : 'Best horizon'} ${m.best} s · ${pc(p)} % [${pc(lo)}–${pc(hi)}] · n = ${best.n}`.replace('0.5', lang === 'de' ? '0,5' : '0.5');
    const isNew = ctx.pass.award('voraustraeumen', { value: { de: val('de'), en: val('en') } });
    const stars = (1 + (st.pred != null && st.pred === m.best ? 1 : 0) + (st.streak.n >= B.manualDeliveries && st.streak.dreams <= B.manualDreams ? 1 : 0)) as Stars;
    challenge.submit(pc(p), { stars, detail: T('b.detail', { h: m.best }) });
    if (isNew) {
      H.deliver('g1');
      H.refreshObjective();
    }
  };

  // ── the Messstand console (walk-up, mouse free) ──────────────────────────────────────────────
  const consoleOpen = (): void => {
    ctx.player.enterOperate({
      title: T('b.deskBar'),
      cameraPose: { position: [B.laneX, 1.75, 7.6], lookAt: [B.laneX, 2.0, 3.2] },
      panelPosition: 'right',
      panel: (root) => {
        root.dataset.th = 'panel-b-desk';
        const head = el('div', 'eyebrow', ctx.t('b.deskTitle'));
        root.append(head);
        const goal = challenge.chips();
        goal.style.margin = '6px 0 4px';
        root.append(goal);
        const body = el('div');
        root.append(body);
        const render = (): void => {
          body.replaceChildren();
          if (ctx.mode === 'entscheider') {
            // the preloaded Kennlinie: which horizon should a vendor guarantee?
            if (!st.measured) {
              const r = messlaufB(B, { seed: 1, noise: DREAM.noise, agentNoise: DREAM.agentNoise, forgetS: DREAM.forgetS, horizons: H_LIST });
              const rows = r.map((x) => ({ horizon: x.horizon, k: x.k, n: x.n }));
              st.measured = { rows, best: bestHorizon(rows) };
              kl.update(klSpec(rows));
              ml = { rows: r, i: B.runs * 3, replay: 99, done: true, seed: 1 };
              drawScreen();
            }
            {
              // the question carries the Messlauf's chip (SIM · LIVE: the runs are the toy model's)
              const q = chipRow(ctx, 'sim', T('b.chipNote'));
              q.set(ctx.t('b.deal'));
              body.append(q.el);
            }
            const row = el('div', 'op-row');
            for (const h of H_LIST)
              row.append(
                button(`${ctx.i18n.num(h, h < 1 ? 1 : 0)} s`, 'btn', () => {
                  st.pred = h;
                  ctx.progress.set('b.pred', h);
                  st.deliveredWithDream = true;
                  ctx.pass.recordPrediction('voraustraeumen', h, st.measured!.best, { min: 0.5, max: 8, scale: 'log' });
                  H.say(T(h === st.measured!.best ? 'emi.b.dealRight' : 'emi.b.dealWrong'), true);
                  award();
                  render();
                }, `b-deal-${h}`),
              );
            body.append(row);
            return;
          }
          if (st.pred == null) {
            {
              // the question carries the Messlauf's chip (SIM · LIVE: the runs are the toy model's)
              const q = chipRow(ctx, 'sim', T('b.chipNote'));
              q.set(ctx.t('b.predictQ'));
              body.append(q.el);
            }
            const row = el('div', 'op-row');
            for (const h of H_LIST)
              row.append(
                button(`${ctx.i18n.num(h, h < 1 ? 1 : 0)} s`, 'btn', () => {
                  st.pred = h;
                  ctx.progress.set('b.pred', h);
                  ctx.audio.play('click');
                  render();
                }, `b-pred-${h}`),
              );
            body.append(row);
            return;
          }
          const c = chipRow(ctx, 'sim', T('b.chipNote'));
          c.set(st.measured ? ctx.t('b.measured', { h: ctx.i18n.num(st.measured.best, st.measured.best < 1 ? 1 : 0) }) : ctx.t('b.predicted', { h: ctx.i18n.num(st.pred, st.pred < 1 ? 1 : 0) }));
          body.append(c.el);
          const row = el('div', 'op-row');
          row.append(button(ctx.t('b.run'), 'btn primary', () => startMesslauf(render), 'b-messlauf'));
          body.append(row);
        };
        render();
        ctx.i18n.onChange(render);
      },
    });
  };
  ctx.addInteractable({ object: desk, label: T('b.desk'), hint: T('b.deskHint'), range: 2.6, onInteract: consoleOpen });

  const start = (): void => {
    if (H.waitFor('g1')) return;
    if (roster.state('g1') === 'crouched') {
      ctx.hud.toast(T('b.locked'), { kind: 'info' });
      return;
    }
    const rig = roster.rig('g1')!;
    H.active = 'b';
    roster.setActive('g1');
    void ghosts.prepare('g1');
    rig.place(DOCKS.x.g1, DOCKS.robotZ, 0, 1);
    rig.armMode = 'carry';
    st.phase = 'walkout';
    st.streak = { n: 0, dreams: 0 };
    pilot.enter(rig, hooks);
    if (!st.greeted) {
      st.greeted = true;
      ctx.progress.set('b.greeted', true);
      H.say(T('emi.b.start'));
    }
  };

  return {
    start,
    console: consoleOpen,
    challenge,
    solve(stars = 1) {
      // the Messlauf with the stratified seed 1 (its hump peaks at 2 s), one delivery with a dream
      const r = messlaufB(B, { seed: 1, noise: DREAM.noise, agentNoise: DREAM.agentNoise, forgetS: DREAM.forgetS, horizons: H_LIST });
      const rows = r.map((x) => ({ horizon: x.horizon, k: x.k, n: x.n }));
      st.measured = { rows, best: bestHorizon(rows) };
      ctx.progress.set('b.measured', st.measured);
      kl.update(klSpec(rows));
      ml = { rows: r, i: B.runs * 3, replay: 99, done: true, seed: 1 };
      drawScreen();
      st.deliveredWithDream = true;
      if (stars >= 2) st.pred = st.measured.best;
      if (stars >= 3) st.streak = { n: 3, dreams: 6 };
      award();
    },
    get status() {
      return { phase: st.phase, dreams: st.dreams, pick: st.pick, plans: st.plans, streak: st.streak, measured: st.measured, pred: st.pred, deliveredWithDream: st.deliveredWithDream, messlauf: ml ? { i: ml.i, done: ml.done, k: ml.rows.map((r) => r.k) } : null, auto: st.auto ? { h: st.auto.h, route: st.auto.route, plan: st.auto.plan } : null, dreamt: done.map((p) => ({ h: p.h, route: p.route, spread: +p.spread.toFixed(2), ends: p.res.map((e) => [+e.x.toFixed(2), +e.z.toFixed(2), e.n, e.hit ? 1 : 0]) })), at: roster.rig('g1') ? [+roster.rig('g1')!.gait.pos.x.toFixed(2), +roster.rig('g1')!.gait.pos.z.toFixed(2), +roster.rig('g1')!.head.toFixed(2)] : null };
    },
    update(dt) {
      updateRover(dt);
      if (H.active !== 'b') {
        // the box waits on its table when nobody flies the G1
        if (st.phase === 'off') box.position.set(table.position.x, 0.75 + B.box / 2, table.position.z);
      }
    },
    async view() {
      // the measured ghost moment (§5.5 „Space held, 5 ghosts“): the G1 at the start, Space held, the
      // three plans dreamt again and again (K = 5 heads each, Rapier, ≤ 2 ms per frame)
      start();
      const rig = roster.rig('g1');
      if (!rig) return () => {};
      restart();
      pilot.bot(['Space']);
      const timer = ctx.every(0.25, () => {
        if (!dream?.running && !queue.length && st.phase === 'drive') dreamPlans();
      });
      await new Promise((r) => setTimeout(r, 1200));
      return () => {
        timer();
        pilot.bot(null);
        pilot.exit();
      };
    },
  };
}
