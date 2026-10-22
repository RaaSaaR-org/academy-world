/**
 * Station B „Regler & Takt" ★ — the 12 m Pendelmast (simulates L = 1 m, drawn 12×), the Leitstand
 * and the Gehirn-Stapel dials. (rc4's transfer test for station C left with „Tausend falsche Welten".)
 * Plant at 1 kHz (RK4), controller sampled at the Takt (ZOH) behind a latency FIFO (sim.ts).
 */
import * as THREE from 'three';
import { css, type InfoCardSpec, type ZoneContext } from '@/core/zones';
import { DEG, GIANT, GiantLoop } from './sim';
import { LAYOUT, type WorldHandles } from './world';
import { button, canvasChip, el, LivePlot, sectionLabel, segmented, signed, slider } from './ui';
import type { Shared } from './shared';
import { rbox } from './look';
import { lineMesh, litMesh, litPart, midMaterial } from './mid';

const L = LAYOUT.mast;
const PIVOT_Y = 2.42;
const RAIL_TOP = 1.335;
const TAKTS = GIANT.takts;

export interface Giant {
  readonly loop: GiantLoop;
  update(dt: number): void;
  updateFar(dt: number): void;
  operate(): void;
  push(): void;
  right(): void;
  restoreDefaults(): void;
  /** debug: run the B success path headlessly in the real loop */
  solve(): void;
  /** debug: solve + the right tip + the latency limit → ★★★ */
  stars3(): void;
  /**
   * The cart from afar (mid.ts; WPF item 7): `set(true)` swaps the cart's fixed parts, its pole and the fan's
   * lines for one draw each; `update()` rebuilds the mid pole when the pole stretches. `cart`: the cart group
   * (it stays outside the exterior's full / mid split).
   */
  readonly mid: { set(on: boolean): void; update(): void; readonly cart: THREE.Group };
  onKey(code: string): void;
  /** the player has seen a fall at a Takt ≤ 10 Hz (first half of the B stamp) */
  readonly sawSlowFall: boolean;
  readonly findings: { fallMax: number | null; stableMin: number | null; latLimit: number | null };
}

export function buildGiant(S: Shared, world: WorldHandles): Giant {
  const ctx: ZoneContext = S.ctx;
  const M = ctx.materials;
  const ext = ctx.groups.exterior;
  const det = ctx.groups.detail;
  const loop = new GiantLoop();
  loop.reset(0.3 * DEG);
  const geos: THREE.BufferGeometry[] = [];
  const texs: THREE.Texture[] = [];
  const mats: THREE.Material[] = [];
  ctx.onDispose(() => {
    geos.forEach((g) => g.dispose());
    texs.forEach((t) => t.dispose());
    mats.forEach((m) => m.dispose());
  });
  const G = <T extends THREE.BufferGeometry>(g: T): T => (geos.push(g), g);

  // ── cart + pole ───────────────────────────────────────────────────────────
  const cart = new THREE.Group();
  cart.position.set(0, RAIL_TOP, L.z);
  cart.userData.noMerge = true; // Z1: the cart and its pole move
  ext.add(cart);
  const body = new THREE.Mesh(G(rbox(L.cartW, 0.62, L.cartD, 0.06)), S.look.carbon);
  body.position.y = 0.12 + 0.31;
  body.castShadow = true;
  const cover = new THREE.Mesh(G(new THREE.BoxGeometry(L.cartW - 0.1, 0.12, L.cartD - 0.1)), M.shell);
  cover.position.y = 0.12 + 0.62 + 0.06;
  cover.castShadow = true;
  const wheelGeo = G(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 14).rotateX(Math.PI / 2));
  const wheels = new THREE.InstancedMesh(wheelGeo, M.rubber, 4);
  const wm = new THREE.Matrix4();
  [-0.55, 0.55].forEach((x, i) => [-0.42, 0.42].forEach((z, j) => wheels.setMatrixAt(i * 2 + j, wm.makeTranslation(x, 0.12, z))));
  const cheekGeo = G(new THREE.BoxGeometry(0.16, 0.5, 0.1));
  const cheeks = new THREE.InstancedMesh(cheekGeo, S.look.alu, 2);
  cheeks.setMatrixAt(0, wm.makeTranslation(0, PIVOT_Y - RAIL_TOP - 0.12, -0.36));
  cheeks.setMatrixAt(1, wm.makeTranslation(0, PIVOT_Y - RAIL_TOP - 0.12, 0.36));
  const axle = new THREE.Mesh(G(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 12).rotateX(Math.PI / 2)), M.steel);
  axle.position.y = PIVOT_Y - RAIL_TOP;
  // the fixed parts in their own group (one merged draw up close; mid.ts swaps it for one draw from afar)
  const cartFull = new THREE.Group();
  cartFull.name = 'regelgarten:cart-full';
  cart.add(cartFull);
  cartFull.add(body, cover, wheels, cheeks, axle);
  const pole = new THREE.Group();
  pole.position.y = PIVOT_Y - RAIL_TOP;
  cart.add(pole);
  const shaft = new THREE.Mesh(G(new THREE.CylinderGeometry(L.poleR, L.poleR, L.pole, 16).translate(0, L.pole / 2, 0)), S.look.alu);
  shaft.castShadow = true;
  const tip = new THREE.Mesh(G(new THREE.SphereGeometry(L.tipR, 20, 14)), M.standard({ color: 0xf5f5f4, roughness: 0.35, metalness: 0.05 }));
  tip.position.y = L.pole;
  tip.castShadow = true;
  const ring = new THREE.Mesh(G(new THREE.TorusGeometry(0.3, 0.055, 10, 32)), M.orangePaint);
  ring.position.z = 0.0;
  const poleFull = new THREE.Group();
  poleFull.name = 'regelgarten:pole-full';
  poleFull.add(shaft, tip, ring);
  pole.add(poleFull);

  // the permitted-tilt fan: ±30° sector above the cart (teal, faint) with orange fail edges.
  // It moves with the cart, so the pole always swings inside "its" limits — the Absturzgrenze in 3D.
  const FAN_R = L.pole + 0.6;
  const fanGeo = G(new THREE.CircleGeometry(FAN_R, 40, Math.PI / 2 - GIANT.failTheta, 2 * GIANT.failTheta));
  const fanMat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  fanMat.forceSinglePass = true; // Z1: a flat sector: one pass draws the same pixels as two
  mats.push(fanMat);
  const fan = new THREE.Mesh(fanGeo, fanMat);
  fan.position.set(0, PIVOT_Y - RAIL_TOP, -0.02);
  fan.renderOrder = 3;
  const edgePts: number[] = [];
  for (const sgn of [-1, 1]) {
    const a = Math.PI / 2 + sgn * GIANT.failTheta;
    edgePts.push(0, 0, 0, Math.cos(a) * FAN_R, Math.sin(a) * FAN_R, 0);
  }
  const arcPts: number[] = [];
  for (let i = 0; i < 40; i++) {
    const a0 = Math.PI / 2 - GIANT.failTheta + (i / 40) * 2 * GIANT.failTheta,
      a1 = Math.PI / 2 - GIANT.failTheta + ((i + 1) / 40) * 2 * GIANT.failTheta;
    arcPts.push(Math.cos(a0) * FAN_R, Math.sin(a0) * FAN_R, 0, Math.cos(a1) * FAN_R, Math.sin(a1) * FAN_R, 0);
  }
  // tick marks every 10° on the arc
  for (let d = -20; d <= 20; d += 10) {
    const a = Math.PI / 2 + d * DEG;
    arcPts.push(Math.cos(a) * (FAN_R - 0.5), Math.sin(a) * (FAN_R - 0.5), 0, Math.cos(a) * FAN_R, Math.sin(a) * FAN_R, 0);
  }
  const edgeGeo = G(new THREE.BufferGeometry());
  edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePts, 3));
  const edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0xff6700).multiplyScalar(1.3), transparent: true, opacity: 0.8, toneMapped: false });
  mats.push(edgeMat);
  const edges = new THREE.LineSegments(edgeGeo, edgeMat);
  const arcGeo = G(new THREE.BufferGeometry());
  arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(arcPts, 3));
  const arcMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0x2dd4bf).multiplyScalar(1.2), transparent: true, opacity: 0.55, toneMapped: false });
  mats.push(arcMat);
  const arc = new THREE.LineSegments(arcGeo, arcMat);
  edges.position.copy(fan.position);
  arc.position.copy(fan.position);
  cart.add(fan);
  cartFull.add(edges, arc);
  ring.scale.set(1, 1, 1);
  ring.position.set(0, 0, 0.33);

  // ── the cart from afar (mid.ts): fixed parts, pole and the fan's lines, one draw each, riding along ──
  const midMat = midMaterial(ctx);
  cart.updateMatrixWorld(true);
  const cartMid = new THREE.Group();
  cartMid.name = 'regelgarten:cart-mid';
  cartMid.visible = false;
  cartMid.userData.noMerge = true;
  cart.add(cartMid);
  const cartMidMesh = litMesh(
    [body, cover, wheels, cheeks, axle].flatMap((m) => litPart(m, cart)),
    midMat,
    'regelgarten:mid:cart',
    true,
  );
  if (cartMidMesh) cartMid.add(cartMidMesh);
  const midLines = lineMesh([edges, arc], cart, 'regelgarten:mid:fan-lines');
  cartMid.add(midLines);
  const poleMid = new THREE.Group();
  poleMid.name = 'regelgarten:pole-mid';
  poleMid.visible = false;
  pole.add(poleMid);
  let polePart: THREE.Mesh | null = null;
  let poleScaleBuilt = NaN;
  // the pole stretches (station B): its mid mesh is rebuilt from the parts as they stand (rare)
  const buildMidPole = (): void => {
    if (poleScaleBuilt === shaft.scale.y) return;
    poleScaleBuilt = shaft.scale.y;
    pole.updateMatrixWorld(true);
    if (polePart) {
      polePart.geometry.dispose();
      polePart.removeFromParent();
    }
    polePart = litMesh([shaft, tip, ring].flatMap((m) => litPart(m, pole)), midMat, 'regelgarten:mid:pole', true);
    if (polePart) poleMid.add(polePart);
  };
  buildMidPole();
  ctx.onDispose(() => {
    cartMidMesh?.geometry.dispose();
    midLines.geometry.dispose();
    (midLines.material as THREE.Material).dispose();
    polePart?.geometry.dispose();
  });
  let midOn = false;

  // Z1: the cart's fixed parts (cover, wheels, cheeks, axle) ride as one draw; the pole stretches and swings
  ctx.mergeStatic(cartFull, { shadows: 'union' });

  // tip trail (teal, shows ringing) — 48 points, positions updated in place
  const TRAIL = 48;
  const trailPos = new Float32Array(TRAIL * 3);
  const trailGeo = G(new THREE.BufferGeometry());
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
  const trailMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0x2dd4bf).multiplyScalar(1.6), transparent: true, opacity: 0.85, toneMapped: false });
  mats.push(trailMat);
  const trail = new THREE.Line(trailGeo, trailMat);
  trail.frustumCulled = false;
  det.add(trail);
  let trailAcc = 0;
  let trailInit = false;
  const tipW = new THREE.Vector3();

  // ── plinth display (front face of the plinth) ─────────────────────────────
  const PD = document.createElement('canvas');
  PD.width = 1024;
  PD.height = 128;
  const pg = PD.getContext('2d')!;
  const ptex = new THREE.CanvasTexture(PD);
  ptex.colorSpace = THREE.SRGBColorSpace;
  ptex.anisotropy = 4;
  texs.push(ptex);
  const pmat = new THREE.MeshBasicMaterial({ map: ptex, color: 0xdcdcdc, toneMapped: false });
  mats.push(pmat);
  const pdisp = new THREE.Mesh(G(new THREE.PlaneGeometry(8, 1)), pmat);
  pdisp.name = 'regelgarten:plinth-display';
  pdisp.position.set(0, 0.62, L.z + L.plinthD / 2 + 0.11);
  ext.add(pdisp);
  let pdKey = '';

  // ── Leitstand screen + Schubs button ──────────────────────────────────────
  const LS = document.createElement('canvas');
  LS.width = 512;
  LS.height = 200;
  const lsg = LS.getContext('2d')!;
  const lstex = new THREE.CanvasTexture(LS);
  lstex.colorSpace = THREE.SRGBColorSpace;
  texs.push(lstex);
  const lsmat = new THREE.MeshBasicMaterial({ map: lstex, color: 0xeeeeee, toneMapped: false });
  mats.push(lsmat);
  const screen = new THREE.Mesh(G(new THREE.PlaneGeometry(1.76, 0.69)), lsmat);
  screen.position.set(0, 1.4, LAYOUT.leitstand.z - 0.45);
  screen.rotation.x = -0.2;
  det.add(screen);
  const pushBtn = new THREE.Group();
  const pushCap = new THREE.Mesh(G(new THREE.CylinderGeometry(0.1, 0.11, 0.07, 20)), M.accentOrange);
  const pushBase = new THREE.Mesh(G(new THREE.CylinderGeometry(0.14, 0.15, 0.06, 20)), S.look.carbon);
  pushCap.position.y = 0.07;
  pushBtn.add(pushBase, pushCap);
  pushBtn.position.set(1.05, 1.05, LAYOUT.leitstand.z + 0.18);
  pushBtn.rotation.x = 0.22;
  det.add(pushBtn);
  const plotScreen = new LivePlot(10, 40);

  // ── state & findings ──────────────────────────────────────────────────────
  const st = {
    acc: 0,
    righting: 0, // > 0 while the winch animation runs (seconds left)
    rightFrom: [0, 0] as [number, number],
    fallenFor: 0,
    stopClunked: false,
    stableT: 0,
    pushT: -1,
    pushTakt: 0,
    gustT: -1,
    gustF: 0,
    poleScale: 1,
    predicted: null as number | null,
    predictAsked: false,
    sawSlowFall: false,
    fallsAt: new Set<number>(),
    fallsTuned: new Set<number>(),
    stableAt: new Set<number>(),
    survivedAt: new Set<number>(),
    latFallMin: null as number | null,
    /** largest latency (ms, ≤ 50) at which the tuned 1 kHz controller held 5 s (★★★ with latFallMin) */
    latHold: null as number | null,
    lastFallLine: 0,
    operating: false,
  };
  const plot = new LivePlot(10, 50);
  /** the Gehirn-Stapel dials: closed until the player opens them (both modes: ≤ 35 words at open) */
  let stackOpen: boolean | null = null;
  let uiRefresh: (() => void) | null = null;
  let panelCanvas: HTMLCanvasElement | null = null;
  let statusEl: HTMLElement | null = null;
  let findingsEl: HTMLElement | null = null;

  const tuned = (): boolean => loop.Kp === GIANT.presets.gut[0] && loop.Kd === GIANT.presets.gut[1] && loop.latencyMs === 0;
  const resetStable = (): void => {
    st.stableT = 0;
  };

  loop.ev.onFall = () => {
    const takt = loop.takt;
    st.fallsAt.add(takt);
    if (tuned()) st.fallsTuned.add(takt);
    if (takt <= 10 && !st.sawSlowFall) {
      st.sawSlowFall = true;
      S.refreshObjective(); // → "aufrichten, 200 Hz, Schubs"
    }
    if (loop.takt >= 1000 && loop.latencyMs > 0 && loop.Kp === GIANT.presets.gut[0] && loop.Kd === GIANT.presets.gut[1]) st.latFallMin = st.latFallMin == null ? loop.latencyMs : Math.min(st.latFallMin, loop.latencyMs);
    saveB();
    if (S.stationActive === 'b') ctx.game.juice.popup([cart.position.x, L.plinthH + 1.6, L.z], ctx.i18n.text('game.b.fell', { hz: takt >= 1000 ? '1 kHz' : `${takt} Hz` }), { tone: 'bad', seconds: 2.4 });
    judgeB();
    const now = ctx.time.elapsed;
    if (S.stationActive === 'b' && now - st.lastFallLine > 6) {
      st.lastFallLine = now;
      if (takt === 10) S.emiSay(ctx.i18n.text('emi.bFall'), true);
      else if (takt < 20) S.emiSay(ctx.i18n.text('emi.bFallOther', { hz: takt }), true);
      else if (loop.latencyMs >= 30) S.emiSay(ctx.i18n.text('emi.bLatency', { ms: loop.latencyMs }), true);
      else if (loop.Kd === 0) S.emiSay(ctx.i18n.text('emi.bNurP'), true);
    }
    resetStable();
    uiRefresh?.();
  };
  loop.ev.onStop = () => {
    if (!st.stopClunked) {
      st.stopClunked = true;
      const at: [number, number, number] = [cart.position.x, 3, L.z];
      ctx.audio.play('thud', { at, pitch: 0.55, volume: 1.6 });
      ctx.audio.tone({ freq: 70, to: 38, dur: 0.5, type: 'sine', volume: 2.2, at });
      // the spectacle (FUN-PLAN R2): dust at the foot, a hard shake, a red edge pulse
      if (S.playerNear(30)) {
        ctx.game.juice.burst([cart.position.x, L.plinthH + 0.3, L.z], { tone: 'stone', count: 90, spread: 1.6 });
        ctx.player.shake(0.15, 0.35);
        ctx.game.juice.pulse('bad', 0.9);
      }
    }
  };

  // restore saved findings
  const saved = ctx.progress.get<null | { fallsAt: number[]; fallsTuned: number[]; stableAt: number[]; latFallMin: number | null; sawSlowFall: boolean; latHold?: number | null }>('b', null);
  if (saved) {
    saved.fallsAt.forEach((v) => st.fallsAt.add(v));
    saved.fallsTuned.forEach((v) => st.fallsTuned.add(v));
    saved.stableAt.forEach((v) => st.stableAt.add(v));
    st.latFallMin = saved.latFallMin;
    st.sawSlowFall = saved.sawSlowFall;
    st.latHold = saved.latHold ?? null;
  }
  const saveB = (): void => ctx.progress.set('b', { fallsAt: [...st.fallsAt], fallsTuned: [...st.fallsTuned], stableAt: [...st.stableAt], latFallMin: st.latFallMin, sawSlowFall: st.sawSlowFall, latHold: st.latHold });

  // ── „Wann fällt der Riese?" (FUN-PLAN R2) ─────────────────────────────────
  // ★ the stamp (fall seen at ≤ 10 Hz, then a Schubs survived at ≥ 200 Hz) · ★★ the tipped Takt equals the
  // measured "fällt bei" Takt · ★★★ the latency limit measured: a latency fall at 1 kHz + a hold at ≤ 50 ms
  const measuredFall = (): number => (st.fallsTuned.size ? Math.max(...[...st.fallsTuned].filter((v) => v < 1000).concat([10])) : 10);
  const starsB = (): 0 | 1 | 2 | 3 => {
    if (!ctx.pass.has('regler-takt')) return 0;
    const pred = st.predicted != null && st.predicted === measuredFall();
    const lat = st.latFallMin != null && st.latHold != null;
    return (1 + (pred ? 1 : 0) + (pred && lat ? 1 : 0)) as 1 | 2 | 3;
  };
  const chB = ctx.game.challenge({
    id: 'regler-takt',
    title: ctx.i18n.text('game.b.title'),
    goals: [{ text: ctx.i18n.text('game.b.g1') }, { text: ctx.i18n.text('game.b.g2') }, { text: ctx.i18n.text('game.b.g3') }],
    lesson: ctx.i18n.text('game.b.lesson'),
    why: () => cardB(),
  });
  let shownB = (ctx.game.stars('regler-takt').byStation['regler-takt'] ?? 0) as number;
  const detailB = (): { de: string; en: string } => {
    const p = st.predicted ?? 20,
      m = measuredFall();
    const lat = st.latFallMin != null ? ` · ${st.latFallMin} ms` : '';
    return { de: `Tipp ${p} Hz · fällt bei ${m} Hz${lat}`, en: `Guess ${p} Hz · falls at ${m} Hz${lat}` };
  };
  /** a result banner whenever the stars rise (the stamp, the right tip, the latency limit) */
  const judgeB = (): void => {
    const s = starsB();
    if (s <= shownB) return;
    shownB = s;
    chB.submit(null, { stars: s, detail: detailB() });
    ctx.game.juice.cue('great');
  };
  st.predicted = ctx.progress.get<number | null>('bPredicted', null);

  const findings = (): { fallMax: number | null; stableMin: number | null; latLimit: number | null } => {
    // "fällt bei": the highest Takt at which the tuned controller (no latency) fell; else slow-rate falls only
    const pool = st.fallsTuned.size ? [...st.fallsTuned] : [...st.fallsAt].filter((v) => v <= 20);
    const fallMax = pool.length ? Math.max(...pool) : null;
    const stableMin = st.stableAt.size ? Math.min(...st.stableAt) : null;
    return { fallMax, stableMin, latLimit: st.latFallMin };
  };

  // ── island gusts push the giant pendulum ──────────────────────────────────
  const railWorld = new THREE.Vector3();
  ctx.island.onGust(({ strength, bearing }) => {
    // rail axis (local +x) in world → projection of the gust direction
    railWorld.set(1, 0, 0).applyQuaternion(ctx.root.quaternion);
    const b = (bearing * Math.PI) / 180;
    const proj = Math.sin(b) * railWorld.x - Math.cos(b) * railWorld.z;
    st.gustT = 0;
    st.gustF = strength * 16 * (Math.abs(proj) < 0.3 ? Math.sign(proj || 1) * 0.3 : proj);
    plot.mark();
  });

  // ── simulation step (shared by update + updateFar) ────────────────────────
  const stepSim = (dt: number): void => {
    const sp = Math.max(1, S.speed);
    const h = Math.min(dt * sp, 0.05 * sp);
    st.acc += h;
    let n = 0;
    while (st.acc >= 0.001 && n < 60 * sp) {
      st.acc -= 0.001;
      n++;
      if (st.righting > 0) continue;
      // external forces: Schubs (30 N, 0.1 s), island gust
      let ext = 0;
      if (st.pushT >= 0 && st.pushT < GIANT.pushT) ext += GIANT.pushF * (st.pushTakt >= 0 ? 1 : -1);
      if (st.gustT >= 0 && st.gustT < 1.5) ext += st.gustF * Math.sin((Math.PI * st.gustT) / 1.5);
      loop.ext = ext;
      loop.step();
      if (st.pushT >= 0) st.pushT += 0.001;
      if (st.gustT >= 0) {
        st.gustT += 0.001;
        if (st.gustT > 1.5) st.gustT = -1;
      }
    }
  };

  let fanFlash = 0;
  const applyVisual = (): void => {
    if (loop.fallen && fanFlash === 0) fanFlash = 1;
    if (!loop.fallen && st.righting <= 0) fanFlash = 0;
    const f = loop.fallen ? 0.55 + 0.45 * Math.max(0, fanFlash) : 0;
    fanMat.color.setRGB(0.176 + (1 - 0.176) * f, 0.831 + (0.404 - 0.831) * f, 0.749 * (1 - f));
    fanMat.opacity = 0.09 + 0.05 * f;
    if (fanFlash > 0) fanFlash = Math.max(0.0001, fanFlash - 0.02);
    const s = loop.s;
    let x = s[0],
      th = s[2];
    if (st.righting > 0) {
      const k = 1 - st.righting / 3;
      const e = k * k * (3 - 2 * k);
      x = st.rightFrom[0] * (1 - e);
      th = st.rightFrom[1] * (1 - e);
    }
    cart.position.x = x * GIANT.scale;
    pole.rotation.z = -th;
    world.farCart.position.x = cart.position.x;
    world.farPole.rotation.z = -th;
    const sc = st.poleScale;
    shaft.scale.y = sc;
    tip.position.y = L.pole * sc;
  };

  const startRighting = (): void => {
    if (st.righting > 0 || !loop.fallen) return;
    st.rightFrom = [loop.s[0], loop.s[2]];
    st.righting = 3;
    S.winch(true, cart);
    uiRefresh?.();
  };

  const finishRighting = (): void => {
    st.righting = 0;
    S.winch(false, cart);
    loop.reset((Math.random() < 0.5 ? -1 : 1) * 0.3 * DEG);
    st.stopClunked = false;
    st.fallenFor = 0;
    st.pushT = -1;
    st.pushTakt = 0;
    resetStable();
    plot.mark();
    ctx.audio.play('click', { at: [cart.position.x, 2.4, L.z], pitch: 0.7 });
    uiRefresh?.();
  };

  // ── displays ──────────────────────────────────────────────────────────────
  const drawPlinth = (): void => {
    const lang = ctx.i18n.lang;
    const thDeg = loop.s[2] / DEG;
    const status = st.righting > 0 ? ctx.t('b.righting') : loop.fallen ? ctx.t('b.fallen') : ctx.t('b.holding');
    const taktTxt = loop.takt >= 1000 ? '1000 Hz' : `${loop.takt} Hz`;
    const key = `${lang}|${taktTxt}|${loop.latencyMs}|${signed(lang, thDeg, 1)}|${status}`;
    if (key === pdKey) return;
    pdKey = key;
    const g = pg;
    g.fillStyle = '#141414';
    g.fillRect(0, 0, 1024, 128);
    g.fillStyle = '#1F1F1F';
    g.fillRect(4, 4, 1016, 120);
    const grad = g.createLinearGradient(0, 0, 1024, 0);
    grad.addColorStop(0, css.orange);
    grad.addColorStop(1, css.teal);
    g.fillStyle = grad;
    g.fillRect(4, 4, 1016, 2);
    g.font = '500 20px "Geist Mono", monospace';
    g.fillStyle = css.textSecondary;
    g.fillText(`// ${ctx.t('plinth')}`, 22, 36);
    g.font = '500 54px "Geist Mono", monospace';
    g.fillStyle = css.text;
    g.fillText(`TAKT ${taktTxt}`, 22, 100);
    g.font = '500 30px "Geist Mono", monospace';
    g.fillStyle = css.textSecondary;
    g.fillText(`LAT ${loop.latencyMs} ms`, 470, 100);
    g.fillStyle = Math.abs(thDeg) > 15 ? css.orange : css.teal;
    g.fillText(`θ ${signed(lang, thDeg, 1)}°`, 660, 100);
    g.font = '600 26px "Space Grotesk", sans-serif';
    g.fillStyle = loop.fallen ? css.orange : css.teal;
    const sw = g.measureText(status.toUpperCase()).width;
    g.fillText(status.toUpperCase(), 1000 - sw, 100);
    canvasChip(g, 1000 - 150, 16, 'SIM · LIVE', 'sim', 16);
    ptex.needsUpdate = true;
  };

  const drawScreen = (): void => {
    const g = lsg;
    plotScreen.draw(g, 512, 200, { bg: '#141414', label: `θ(t) · ${loop.takt >= 1000 ? '1 kHz' : loop.takt + ' Hz'} · ${loop.latencyMs} ms`, font: 16, lineWidth: 3.2, range: 40 });
    canvasChip(g, 512 - 128, 4, 'SIM · LIVE', 'sim', 14);
    lstex.needsUpdate = true;
  };

  // ── B operate panel ───────────────────────────────────────────────────────
  const statusText = (): string => {
    if (st.righting > 0) return ctx.t('b.righting');
    if (loop.fallen) return ctx.t('b.fallenHint');
    return `${ctx.t('b.holding')} · ${ctx.t('b.sampled', { n: loop.takt })}`;
  };
  const findingsText = (): string => {
    const f = findings();
    const hz = (v: number | null): string => (v == null ? ctx.t('b.none') : `${v} Hz`);
    return `${ctx.t('b.seenFall')}: ${hz(f.fallMax)} · ${ctx.t('b.stable')}: ${hz(f.stableMin)} · ${ctx.t('b.latLimit')}: ${f.latLimit == null ? ctx.t('b.none') : f.latLimit + ' ms'}`;
  };

  const askPrediction = (): Promise<void> =>
    new Promise((resolve) => {
      if (st.predictAsked || st.predicted != null) return resolve();
      st.predictAsked = true;
      void ctx.hud.openModal(
        (elm, close) => {
          elm.classList.add('predict');
          elm.append(el('div', 'eyebrow', ctx.t('b.predictEyebrow')));
          elm.append(el('h2', 'display', ctx.t('b.predictQ'), 'font-size:24px;margin:8px 0 6px'));
          elm.append(el('p', '', ctx.t('b.predictSub'), 'margin:0 0 16px;color:var(--text-2)'));
          const opts = [200, 50, 20, 10, 5];
          let pick = 20;
          const val = el('div', 'predict-value', '20 Hz');
          const seg = segmented(
            opts.map((v) => ({ value: v, label: `${v} Hz` })),
            pick,
            (v) => {
              pick = v;
              seg.set(v);
              val.textContent = `${v} Hz`;
              ctx.audio.play('hover', { volume: 0.4 });
            },
            'b-predict',
          );
          const lock = button(ctx.t('b.predictLock'), 'btn primary', () => {
            st.predicted = pick;
            ctx.progress.set('bPredicted', pick);
            ctx.audio.play('click');
            close();
          }, 'b-predict-lock');
          elm.append(val, seg.el, el('div', '', undefined, 'display:flex;justify-content:flex-end;margin-top:18px'));
          (elm.lastChild as HTMLElement).append(lock);
          return () => {
            if (st.predicted == null) {
              st.predicted = pick;
              ctx.progress.set('bPredicted', pick);
            }
            resolve();
          };
        },
        { width: 560 },
      );
    });

  const operate = (): void => {
    S.stationActive = 'b';
    S.emiDrive([2.6, 0, 3.2]);
    if (!ctx.progress.get('bGreeted', false)) {
      ctx.progress.set('bGreeted', true);
      S.emiSay(ctx.i18n.text('emi.bStart'));
    }
    st.operating = true;
    ctx.player.enterOperate({
      title: ctx.i18n.text('b.title'),
      cameraPose: { position: LAYOUT.leitstand.cam, lookAt: LAYOUT.leitstand.look },
      panelPosition: 'right',
      panel: (root) => {
        root.dataset.rg = 'panel-b';
        const head = el('div', '', undefined, 'display:flex;justify-content:space-between;align-items:center;gap:8px');
        head.append(el('div', 'eyebrow', ctx.t('regler-takt.title')), ctx.ui.chip('sim', ctx.i18n.text('b.scale')));
        root.append(head);
        const chips = chB.chips();
        chips.style.margin = '8px 0 8px';
        root.append(chips);
        const cv = el('canvas');
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = 360 * dpr;
        cv.height = 116 * dpr;
        cv.style.cssText = 'width:360px;height:116px;display:block;border-radius:8px;background:#141414';
        panelCanvas = cv;
        root.append(cv);
        statusEl = el('div', 'mono', statusText(), 'font-size:12.5px;margin:6px 0 2px;color:var(--teal)');
        statusEl.dataset.rg = 'b-status';
        root.append(statusEl);

        // the Takt buttons speak for themselves (Hz in the tooltip and the status line; ≤ 35 words at open)
        const takt = segmented(
          TAKTS.map((v) => ({ value: v, label: v >= 1000 ? '1000' : String(v) })),
          loop.takt as (typeof TAKTS)[number],
          (v) => setTakt(v),
          'takt',
        );
        takt.el.title = ctx.t('b.takt');
        root.append(takt.el);
        const lat = slider({ label: ctx.t('b.latency'), min: 0, max: 200, step: 10, value: loop.latencyMs, format: (v) => `${v} ms`, onInput: (v) => setLatency(v), testId: 'latency' });
        root.append(lat.el);

        // the gains (presets, P, D) sit behind „Regler ▸“ like the Gehirn-Stapel dials (plan §4.3; ≤ 35
        // words at open in both modes)
        const gainsBtn = button(`${ctx.t('b.gains')} ▸`, 'btn ghost', () => {
          const open = gainsBox.style.display === 'none';
          gainsBox.style.display = open ? '' : 'none';
          gainsBtn.textContent = `${ctx.t('b.gains')} ${open ? '▾' : '▸'}`;
        }, 'b-gains');
        gainsBtn.style.cssText += ';margin-top:8px;padding:4px 10px;font-size:12px';
        const gainsBox = el('div', '', undefined, 'display:none');
        root.append(gainsBtn, gainsBox);
        const presetSeg = segmented(
          [
            { value: 'nurP', label: ctx.t('b.presets.nurP') },
            { value: 'pd', label: ctx.t('b.presets.pd') },
            { value: 'gut', label: ctx.t('b.presets.gut') },
          ],
          loop.Kd === 0 ? 'nurP' : loop.Kd === GIANT.presets.pd[1] ? 'pd' : 'gut',
          (v) => setPreset(v as 'nurP' | 'pd' | 'gut'),
          'preset',
        );
        gainsBox.append(presetSeg.el);
        const kp = slider({ label: 'P', min: 0, max: GIANT.kpMax, step: 10, value: loop.Kp, format: (v) => `${v}`, onInput: (v) => setGains(v, loop.Kd), testId: 'kp' });
        const kd = slider({ label: 'D', min: 0, max: GIANT.kdMax, step: 1, value: loop.Kd, format: (v) => `${v}`, onInput: (v) => setGains(loop.Kp, v), testId: 'kd' });
        gainsBox.append(kp.el, kd.el);

        // the Gehirn-Stapel dials collapse behind a disclosure (FUN-PLAN R2: panel ≤ 55 words)
        stackOpen ??= false;
        const stackBtn = button(`${ctx.t('label.tower')} ${stackOpen ? '▾' : '▸'}`, 'btn ghost', () => {
          stackOpen = !stackOpen;
          stackBox.style.display = stackOpen ? '' : 'none';
          stackBtn.textContent = `${ctx.t('label.tower')} ${stackOpen ? '▾' : '▸'}`;
        }, 'b-stack');
        stackBtn.style.cssText += ';margin-top:8px;padding:4px 10px;font-size:12px';
        root.append(stackBtn);
        const stackBox = el('div', '', undefined, `display:${stackOpen ? '' : 'none'}`);
        root.append(stackBox);
        stackBox.append(sectionLabel(`${ctx.t('b.skill')} / ${ctx.t('b.planner')}`));
        const skill = segmented(
          GIANT.skillRates.map((v) => ({ value: v, label: `${v}` })),
          loop.skillHz as (typeof GIANT.skillRates)[number],
          (v) => {
            loop.skillHz = v;
            skill.set(v);
            ctx.audio.play('click', { volume: 0.5 });
          },
          'skill',
        );
        const plan = segmented<number>(
          [{ value: 0, label: ctx.t('b.plannerOff') }, ...GIANT.plannerRates.map((v) => ({ value: v as number, label: ctx.i18n.num(v, v < 1 ? 1 : 0) }))],
          loop.plannerOn ? loop.plannerHz : 0,
          (v) => {
            loop.plannerOn = v > 0;
            if (v > 0) loop.plannerHz = v;
            plan.set(v);
            ctx.audio.play('click', { volume: 0.5 });
          },
          'planner',
        );
        const row = el('div', 'op-row');
        row.style.marginTop = '2px';
        row.append(el('span', 'mono', 'Hz', 'font-size:11px;color:var(--text-3)'), skill.el, plan.el);
        stackBox.append(row);

        const actions = el('div', 'op-row');
        const pushB = button(ctx.t('b.push'), 'btn primary', () => push(), 'b-push');
        pushB.title = ctx.t('b.keys');
        const rightB = button(ctx.t('b.right'), 'btn', () => startRighting(), 'b-right');
        actions.append(pushB, rightB);
        root.append(actions);
        findingsEl = el('div', 'mono', findingsText(), 'font-size:11.5px;color:var(--text-2);margin-top:10px;line-height:1.5');
        findingsEl.dataset.rg = 'b-findings';
        root.append(findingsEl);
        // key legend in the buttons' tooltips (panel ≤ 50 words)

        uiRefresh = () => {
          takt.set(loop.takt as (typeof TAKTS)[number]);
          lat.set(loop.latencyMs);
          kp.set(loop.Kp);
          kd.set(loop.Kd);
          presetSeg.set(loop.Kd === 0 && loop.Kp === GIANT.presets.nurP[0] ? 'nurP' : loop.Kd === GIANT.presets.pd[1] && loop.Kp === GIANT.presets.pd[0] ? 'pd' : loop.Kp === GIANT.presets.gut[0] && loop.Kd === GIANT.presets.gut[1] ? 'gut' : ('' as 'gut'));
          rightB.disabled = !loop.fallen || st.righting > 0;
          pushB.disabled = loop.fallen;
          if (statusEl) {
            statusEl.textContent = statusText();
            statusEl.style.color = loop.fallen ? 'var(--orange)' : 'var(--teal)';
          }
          if (findingsEl) findingsEl.textContent = findingsText();
        };
        uiRefresh();
        return () => {
          uiRefresh = null;
          panelCanvas = null;
          statusEl = null;
          findingsEl = null;
        };
      },
      onExit: () => {
        st.operating = false;
        if (S.stationActive === 'b') S.stationActive = null;
        ctx.ui.status(null);
      },
    });
    if (!ctx.pass.has('regler-takt')) ctx.after(0.6, () => void askPrediction().then(() => S.emiSay(ctx.i18n.text('emi.bPredict'))));
  };

  const setTakt = (v: number): void => {
    loop.takt = v;
    resetStable();
    ctx.audio.play('click', { volume: 0.6, pitch: 0.8 + Math.log10(v) * 0.15 });
    uiRefresh?.();
  };
  const setLatency = (v: number): void => {
    loop.latencyMs = v;
    resetStable();
  };
  const setGains = (kp: number, kd: number): void => {
    loop.Kp = kp;
    loop.Kd = kd;
    resetStable();
    uiRefresh?.();
  };
  const setPreset = (p: 'nurP' | 'pd' | 'gut'): void => {
    const [kp, kd] = GIANT.presets[p];
    setGains(kp, kd);
    ctx.audio.play('click', { volume: 0.6 });
  };

  const push = (): void => {
    if (loop.fallen || st.righting > 0) return;
    if (st.pushT >= 0 && st.pushT < 0.4) return;
    st.pushT = 0;
    st.pushTakt = loop.takt * (Math.random() < 0.5 ? 1 : -1);
    plot.mark();
    plotScreen.mark();
    const at: [number, number, number] = [cart.position.x, 2, L.z];
    ctx.audio.play('thud', { at, pitch: 1.3, volume: 1.2 });
    ctx.audio.play('whoosh', { at, pitch: 0.7, volume: 0.6 });
    pushCap.position.y = 0.03;
    ctx.after(0.18, () => (pushCap.position.y = 0.07));
  };

  // ── per-frame logic ───────────────────────────────────────────────────────
  let screenAcc = 0;
  let pdAcc = 0;
  const findingsTick = (dt: number): void => {
    // only what the player measures at the Leitstand counts (not passive watching)
    if (loop.fallen || st.righting > 0 || !st.operating) return;
    st.stableT += dt;
    if (st.stableT >= 5 && tuned() && !st.stableAt.has(loop.takt)) {
      st.stableAt.add(loop.takt);
      saveB();
      uiRefresh?.();
    }
    // a hold with latency (≤ 50 ms) at 1 kHz with the tuned gains: one side of the latency limit
    const gut = loop.Kp === GIANT.presets.gut[0] && loop.Kd === GIANT.presets.gut[1];
    if (st.stableT >= 5 && gut && loop.takt >= 1000 && loop.latencyMs > 0 && loop.latencyMs <= 50 && (st.latHold == null || loop.latencyMs > st.latHold)) {
      st.latHold = loop.latencyMs;
      saveB();
      ctx.game.juice.popup([cart.position.x, L.plinthH + 1.6, L.z], ctx.i18n.text('game.b.held', { ms: loop.latencyMs }), { tone: 'teal' });
      ctx.game.juice.cue('good');
      uiRefresh?.();
      judgeB();
    }
    // a Schubs survived for 3 s
    if (st.pushT >= 3 && st.pushTakt !== 0) {
      const takt = Math.abs(st.pushTakt);
      st.survivedAt.add(takt);
      st.pushTakt = 0;
      st.pushT = -1;
      if (takt >= 200 && st.sawSlowFall) awardB();
      else ctx.game.juice.popup([cart.position.x, L.plinthH + 1.6, L.z], ctx.i18n.text('game.b.survived', { hz: takt >= 1000 ? '1 kHz' : `${takt} Hz` }), { tone: 'teal' });
      uiRefresh?.();
    }
  };

  const awardB = (): void => {
    const f = findings();
    const fall = f.fallMax ?? 10;
    const stable = f.stableMin ?? Math.min(...[...st.survivedAt, 1000]);
    const value = (lang: 'de' | 'en'): string => {
      const lat = f.latLimit == null ? (lang === 'de' ? 'nicht gemessen' : 'not measured') : `${f.latLimit} ms`;
      return lang === 'de' ? `Fällt bei ${fall} Hz · stabil ab ${stable} Hz · Latenzgrenze ${lat}` : `Falls at ${fall} Hz · stable from ${stable} Hz · latency limit ${lat}`;
    };
    const ladder = TAKTS.map((t) => (st.fallsAt.has(t) ? 0 : st.stableAt.has(t) || st.survivedAt.has(t) ? 1 : 0.5));
    const isNew = ctx.pass.award('regler-takt', { value: { de: value('de'), en: value('en') }, curve: ladder });
    if (!isNew) return;
    ctx.pass.awardQuestion(4);
    ctx.pass.setBest('lowestStableTakt', stable, 'lower');
    const measured = st.fallsTuned.size ? Math.max(...[...st.fallsTuned].filter((v) => v < 1000).concat([10])) : 10;
    const predicted = st.predicted ?? 20;
    ctx.pass.recordPrediction('regler-takt', predicted, measured, { min: 5, max: 200, scale: 'log' });
    S.emiSay(ctx.i18n.text('emi.bDone'), true);
    S.refreshObjective();
    ctx.game.juice.burst([cart.position.x, L.plinthH + 2, L.z], { tone: 'teal', count: 70, spread: 1.4 });
    judgeB();
  };

  const cardB = (): InfoCardSpec => {
    const f = findings();
    const T = ctx.i18n.text;
    return {
      eyebrow: T('card.b.eyebrow'),
      title: T('card.b.title'),
      body: [T('card.b.entdecker'), T('card.b.curious')],
      metrics: [
        // a unit only next to a measured value ("–" alone when not measured); latency only once measured
        { label: T('card.b.mFall'), value: f.fallMax ?? '–', unit: f.fallMax == null ? undefined : 'Hz' },
        { label: T('card.b.mStable'), value: f.stableMin ?? '–', unit: f.stableMin == null ? undefined : 'Hz' },
        ...(f.latLimit == null ? [] : [{ label: T('card.b.mLat'), value: f.latLimit, unit: 'ms' }]),
      ],
      // Entscheider: rule of thumb + findings card (the layer rates are on the Gehirn-Stapel card), fits 1280×720
      entscheider: { body: [T('card.b.entscheider')], forDecisionMakers: { title: T('card.b.dmTitle'), bullets: [T('card.b.bf1'), T('card.b.bf2'), T('card.b.bf3'), T('card.b.bf4')] } },
      diagram: {
        aspect: 16 / 6,
        caption: T('card.b.diagram'),
        draw: (g, w, h) => {
          const n = TAKTS.length;
          const bw = (w - 40) / n;
          g.font = '12px "Geist Mono", monospace';
          TAKTS.forEach((t, i) => {
            const x = 20 + i * bw;
            const fell = st.fallsAt.has(t);
            const ok = st.stableAt.has(t) || st.survivedAt.has(t);
            g.fillStyle = fell ? 'rgba(255,103,0,0.18)' : ok ? 'rgba(45,212,191,0.15)' : 'rgba(255,255,255,0.03)';
            g.strokeStyle = fell ? css.orange : ok ? css.teal : css.border;
            g.lineWidth = 1.5;
            g.beginPath();
            g.roundRect(x + 4, 18, bw - 8, h - 54, 8);
            g.fill();
            g.stroke();
            g.fillStyle = fell ? css.orange : ok ? css.teal : css.textMuted;
            const mark = fell ? '✕' : ok ? '✓' : '·';
            g.font = '600 26px "Space Grotesk", sans-serif';
            g.fillText(mark, x + bw / 2 - g.measureText(mark).width / 2, (h - 36) / 2 + 22);
            g.font = '12px "Geist Mono", monospace';
            g.fillStyle = css.textSecondary;
            const lab = t >= 1000 ? '1 kHz' : `${t} Hz`;
            g.fillText(lab, x + bw / 2 - g.measureText(lab).width / 2, h - 14);
          });
        },
      },
    };
  };

  const restoreDefaults = (): void => {
    loop.takt = 1000;
    loop.latencyMs = 0;
    loop.Kp = GIANT.presets.gut[0];
    loop.Kd = GIANT.presets.gut[1];
    loop.skillHz = 100;
    loop.plannerHz = 0.5;
    loop.plannerOn = true;
  };

  // ── update ────────────────────────────────────────────────────────────────
  let uiAcc = 0;
  const update = (dt: number): void => {
    stepSim(dt);
    if (st.righting > 0) {
      st.righting -= dt;
      if (st.righting <= 0) finishRighting();
    }
    applyVisual();
    const thDeg = st.righting > 0 ? 0 : loop.s[2] / DEG;
    plot.push(thDeg, dt);
    plotScreen.push(thDeg, dt);
    findingsTick(dt);
    // auto-righting when nobody watches the Leitstand
    if (loop.fallen && loop.stopped && st.righting <= 0) {
      st.fallenFor += dt;
      if (!st.operating && st.fallenFor > 4) startRighting();
    }
    // tip trail (local coordinates of the zone root)
    trailAcc += dt;
    if (trailAcc > 1 / 40 || !trailInit) {
      trailAcc = 0;
      tip.getWorldPosition(tipW);
      ctx.toLocal(tipW, tipW);
      if (!trailInit) {
        trailInit = true;
        for (let i = 0; i < TRAIL; i++) trailPos.set([tipW.x, tipW.y, tipW.z], i * 3);
      }
      trailPos.copyWithin(3, 0, (TRAIL - 1) * 3);
      trailPos[0] = tipW.x;
      trailPos[1] = tipW.y;
      trailPos[2] = tipW.z;
      trailGeo.attributes.position.needsUpdate = true;
    }
    // Gehirn-Stapel + sound
    world.setRates(loop.plannerHz, loop.skillHz, loop.takt, loop.plannerOn);
    S.sound.update(loop.takt, !loop.fallen && st.righting <= 0, st.righting > 0 ? 0.6 : loop.s[3]);
    // displays
    pdAcc += dt;
    if (pdAcc > 0.2) {
      pdAcc = 0;
      drawPlinth();
    }
    screenAcc += dt;
    if (screenAcc > 0.1 && S.playerNear(14)) {
      screenAcc = 0;
      drawScreen();
    }
    if (panelCanvas) {
      const g = panelCanvas.getContext('2d')!;
      const dpr = panelCanvas.width / 360;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      plot.draw(g, 360, panelCanvas.height / dpr, { label: ctx.t('b.plot'), font: 10 });
    }
    uiAcc += dt;
    if (uiAcc > 0.25) {
      uiAcc = 0;
      uiRefresh?.();
    }
  };

  const updateFar = (dt: number): void => {
    stepSim(dt);
    if (st.righting > 0) {
      st.righting -= dt;
      if (st.righting <= 0) finishRighting();
    } else if (loop.stopped) {
      st.fallenFor += dt;
      if (st.fallenFor > 2) startRighting();
    }
    applyVisual();
  };

  // ── interactables ─────────────────────────────────────────────────────────
  ctx.addInteractable({ object: screen, label: ctx.i18n.text('act.b'), hint: ctx.i18n.text('act.bHint'), onInteract: operate, range: 3.2 });
  ctx.addInteractable({ object: pushCap, label: ctx.i18n.text('act.push'), onInteract: push, range: 2.6, isEnabled: () => !loop.fallen });

  // ── debug: drive the REAL loop through the success path (fast-forwarded) ──
  const solve = (): void => {
    const run = (seconds: number): void => {
      for (let i = 0; i < seconds * 60; i++) update(1 / 60);
    };
    restoreDefaults();
    const wasOperating = st.operating;
    st.operating = true; // the scripted run stands in for a player at the Leitstand
    if (loop.fallen) {
      startRighting();
      run(3.2);
    }
    if (st.predicted == null) {
      st.predicted = 20;
      ctx.progress.set('bPredicted', 20);
    }
    setTakt(1000);
    run(5.2); // stable at 1 kHz (tuned)
    setTakt(10);
    run(0.5);
    // falls at 10 Hz: wait for the fall (pushing again if needed) instead of a fixed 4.5 s window. A slow
    // fall used to leave the pendulum standing when the righting was asked for, so it fell later at 200 Hz
    // and the stamp push was refused (rc4 verify: 6 of 38 fresh pages missed the stamp; rc3 0 of 30)
    for (let tries = 0; tries < 4 && !loop.fallen; tries++) {
      push();
      for (let i = 0; i < 4 * 60 && !loop.fallen; i++) update(1 / 60);
    }
    run(0.5);
    startRighting();
    run(3.3);
    setTakt(200);
    run(5.2);
    push();
    run(3.4); // survives → stamp
    st.operating = wasOperating;
  };

  /** debug: the stamp route, then the right tip and the latency limit (★★★) */
  const stars3 = (): void => {
    solve();
    const run = (seconds: number): void => {
      for (let i = 0; i < seconds * 60; i++) update(1 / 60);
    };
    const wasOperating = st.operating;
    st.operating = true;
    st.predicted = measuredFall();
    ctx.progress.set('bPredicted', st.predicted);
    judgeB();
    setTakt(1000);
    for (const lat of [200, 150, 120, 100, 80]) {
      if (st.latFallMin != null) break;
      if (loop.fallen) {
        startRighting();
        run(3.3);
      }
      setLatency(lat);
      run(1.5);
      push();
      run(4);
    }
    if (loop.fallen) {
      startRighting();
      run(3.3);
    }
    setLatency(20);
    run(5.4);
    st.operating = wasOperating;
    restoreDefaults();
  };

  const onKey = (code: string): void => {
    if (S.stationActive !== 'b') return;
    if (code.startsWith('Digit')) {
      const i = Number(code.slice(5)) - 1;
      if (i >= 0 && i < TAKTS.length) setTakt(TAKTS[i]);
    } else if (code === 'KeyX') push();
    // Z3: R only ever means retry/reset; standing the pendulum up is Space (or „Aufrichten“)
    else if (code === 'Space') startRighting();
  };

  return {
    loop,
    update,
    updateFar,
    mid: {
      set(on: boolean) {
        if (on === midOn) return;
        midOn = on;
        cartFull.visible = poleFull.visible = !on;
        cartMid.visible = poleMid.visible = on;
        if (on) buildMidPole();
      },
      update() {
        if (midOn) buildMidPole();
      },
      cart,
    },
    operate,
    push,
    right: startRighting,
    restoreDefaults,
    solve,
    stars3,
    onKey,
    get sawSlowFall() {
      return st.sawSlowFall;
    },
    get findings() {
      return findings();
    },
  };
}
