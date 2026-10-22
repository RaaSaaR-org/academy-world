/**
 * Station C „Licht aus" ◆ (Messen, GDD §7.5 C) at the Leitstand on the gallery.
 *  1. Gesture cards: set each of the six gestures of Station 7 to L0–L4 (L5 locked: 2035+).
 *  2. „Licht aus" lever: six relay clunks switch the cells off gesture by gesture over 6 s.
 *     L4 runs dark; L3 keeps a dim standby light + an on-call person; L ≤ 2 keeps a person and
 *     the orange work lamp.
 *  3. Night shift 22:00 → 06:00 in 60 s (1,440 cycles of 20 s, deterministic seed), up to five
 *     interactive RtIs (10 s to take over), MRC safe stops with 30 game-minutes downtime.
 * Output (SIM · LIVE, rates ILLUSTRATIV): autonomous share, interventions per hour, MRC minutes,
 * a per-hour Kennlinie with Wilson bands and an auto-composed sentence.
 */
import * as THREE from 'three';
import type { ChallengeHandle, EmiHandle, InfoCardSpec, KennlinieHandle, KennlinieSpec, ZoneContext } from '@/core/zones';
import type { Hall } from './hall';
import { GALLERY, LEITSTAND } from './hall';
import type { Line, LampState } from './line';
import { CELLS } from './line';
import type { Sound } from './sound';
import { box, boxMM, canvasTex, cyl, merge, mesh, plane } from './geo';
import {
  CYCLES_PER_HOUR,
  DEFAULT_SEED,
  GESTURES,
  NIGHT_CYCLES,
  NIGHT_START_MIN,
  NightSim,
  SUPERVISION,
  TAKT_S,
  TRUE_LEVEL,
  clockOf,
  stationLevel,
  type NightResult,
} from './sim';

const RUN_SECONDS = 60;
const CYCLES_PER_SEC = NIGHT_CYCLES / RUN_SECONDS; // 24
const RTI_SECONDS = 10;
const RELAY_DT = 1.0;

export type NightPhase = 'setup' | 'sequence' | 'run' | 'result';

/** the realistic level range per gesture (the „real“ tags, nacht.hint.*): the dials' teal arc */
const REAL_RANGE: Record<(typeof GESTURES)[number], [number, number]> = { anfahren: [3, 4], greifen: [2, 3], etikett: [3, 3], palettieren: [4, 4], umreifen: [1, 1], stoerung: [1, 2] };

/** the six dials (plan §4.6): large, in a 3 × 2 grid */
const DIAL_CSS = `
.df-dials { display:grid; grid-template-columns: repeat(3, 1fr); gap: 4px 6px; margin-top: 8px; }
.df-dial { display:flex; flex-direction:column; align-items:center; gap: 1px; }
.df-dname { font-size: 12px; color: var(--text); font-weight: 600; text-align:center; line-height:1.15; min-height: 28px; display:flex; align-items:flex-end; }
.df-knob { all: unset; cursor: pointer; border-radius: 50%; line-height: 0; }
.df-knob:focus-visible { outline: 2px solid var(--orange); outline-offset: 2px; }
.df-knob:hover svg { filter: brightness(1.15); }
.df-dreal { font-family: var(--font-mono); font-size: 11px; color: var(--teal); white-space: nowrap; }
`;

export interface Nacht {
  readonly phase: NightPhase;
  /** the Station C challenge „Ehrliche Nacht“ (FUN-PLAN D3) */
  readonly challenge: ChallengeHandle;
  readonly levels: number[];
  readonly lastResult: NightResult | null;
  update(dt: number, t: number): void;
  operate(): void;
  /** debug: pull the lever (prediction defaults to `predicted`) */
  pullLever(predicted?: number): void;
  /** debug: complete a night instantly with these levels */
  solve(levels?: number[], seed?: number): NightResult;
  /** debug: answer the pending RtI */
  take(): void;
  /** debug: the lights-out end state right now (no cinematic, no run) */
  debugDark(): void;
  lightsOn(): void;
  /** leaving the zone: end the cinematic and switch the lights back on */
  abort(): void;
  setLevels(l: number[]): void;
  onResult: ((r: NightResult, predicted: number | null) => void) | null;
  /** lights-out state changed (ambient) */
  onDark: ((dark: boolean) => void) | null;
  /** 0…1 how far the hall has gone dark (relay by relay) */
  onDarkLevel: ((level: number) => void) | null;
  onLightsOutLine: (() => void) | null;
  relabel(): void;
}

export function buildNacht(ctx: ZoneContext, hall: Hall, line: Line, sound: Sound, emi: EmiHandle): Nacht {
  const M = ctx.materials;
  const det = ctx.groups.detail;
  const tr = (k: string, p?: Record<string, string | number>): string => ctx.t(`nacht.${k}`, p);
  const gName = (g: number): string => ctx.t(`gesture.${GESTURES[g]}`);
  /** gesture name inside a sentence (English lower-cases it; German nouns stay capitalised) */
  const gIn = (g: number): string => (ctx.lang === 'en' ? gName(g).toLowerCase() : gName(g));
  const pct = (v: number): string => `${ctx.i18n.num(v * 100, 0)} %`;

  // ── Leitstand: a low sloped console along the gallery railing (x = 9), facing −x, so the
  //    operator looks over it down the line toward the furnace ────────────────
  const L = LEITSTAND;
  const y0 = L.y;
  const DX0 = 9.18,
    DX1 = 9.95,
    DZ0 = -4.92,
    DZ1 = -2.85;
  // console top: a low wedge whose top faces the operator (+x): high edge at the railing side (−x),
  // low edge toward the operator. Kept low so it never blocks the view down the line.
  const SLOPE = 0.36; // rad
  const topY = y0 + 0.88;
  const midY = topY - 0.1;
  const halfRise = ((DX1 - DX0) / 2) * Math.tan(SLOPE);
  const wedge = new THREE.Shape();
  wedge.moveTo(DX0, y0);
  wedge.lineTo(DX1, y0);
  wedge.lineTo(DX1, midY - halfRise);
  wedge.lineTo(DX0, midY + halfRise);
  const wedgeGeo = new THREE.ExtrudeGeometry(wedge, { depth: DZ1 - DZ0, bevelEnabled: false });
  wedgeGeo.translate(0, 0, DZ0);
  det.add(
    mesh(
      merge([
        wedgeGeo,
        // lever pedestal at the left end (+z for an operator facing −x), clear of the view down the line
        boxMM(DX0 + 0.25, midY - halfRise - 0.02, DZ1 - 0.34, DX1 + 0.05, topY + 0.18, DZ1 + 0.02),
      ]),
      M.panelElevated,
      { name: 'df:leitstand' },
    ),
  );
  ctx.physics.addStaticBox({ size: [DX1 - DX0 + 0.1, 0.92, DZ1 - DZ0], position: [(DX0 + DX1) / 2, y0 + 0.46, (DZ0 + DZ1) / 2], surface: 'metal' });
  // screens embedded in the sloped top (face up and toward the operator, +x)
  const kTex = ctx.ui.kennlinie(emptySpec(), { target: 'texture', width: 512, height: 320 });
  const screenMat = new THREE.MeshBasicMaterial({ map: kTex.texture!, toneMapped: false });
  ctx.onDispose(() => {
    screenMat.dispose();
    kTex.remove();
  });
  const scrTilt = (g: THREE.BufferGeometry, zc: number): THREE.BufferGeometry => {
    g.rotateX(-Math.PI / 2); // face up
    g.rotateZ(-SLOPE); // tilt toward +x (the operator)
    g.translate((DX0 + DX1) / 2, midY + 0.012, zc);
    return g;
  };
  // plane u (texture width) runs along −z, v (texture up) up the slope toward the railing; sizes keep
  // the canvas aspect (Kennlinie 512 × 320, status 256 × 320)
  const screen = mesh(scrTilt(new THREE.PlaneGeometry(0.8, 0.5).rotateZ(Math.PI / 2), -4.36), screenMat, { receive: false, name: 'df:leitstand-screen' });
  det.add(screen);
  const stat = canvasTex(256, 320);
  ctx.onDispose(() => stat.tex.dispose());
  const statMat = new THREE.MeshBasicMaterial({ map: stat.tex, toneMapped: false });
  ctx.onDispose(() => statMat.dispose());
  det.add(mesh(scrTilt(new THREE.PlaneGeometry(0.4, 0.5).rotateZ(Math.PI / 2), -3.62), statMat, { receive: false, name: 'df:leitstand-status' }));
  // lever (pivot on the pedestal, swings toward the operator)
  const lever = new THREE.Group();
  lever.position.set(DX0 + 0.62, topY + 0.18, DZ1 - 0.16);
  det.add(lever);
  lever.add(mesh(merge([cyl(0.025, 0.025, 0.5, 10, 0, 0.25, 0)]), M.steel, { name: 'df:lever-rod' }));
  const grip = mesh(cyl(0.05, 0.05, 0.16, 14, 0, 0.53, 0), M.orangePaint, { name: 'df:lever-grip' });
  lever.add(grip);
  det.add(mesh(box(0.42, 0.02, 0.32, DX0 + 0.62, topY + 0.19, DZ1 - 0.16, 0, 0, 0, 0.34), M.hazard(1), { name: 'df:lever-plate' }));
  const LEVER_UP = -0.75; // leaning away (toward −x)
  const LEVER_DOWN = 0.85; // pulled toward the operator (+x)
  lever.rotation.z = LEVER_UP;
  let leverTarget = LEVER_UP;
  // lights-out plaque (QUELLE, vendor anonymised) on a short post beside the console, facing the operator
  const plaque = canvasTex(512, 220);
  ctx.onDispose(() => plaque.tex.dispose());
  const plaqueMat = new THREE.MeshBasicMaterial({ map: plaque.tex, toneMapped: false });
  ctx.onDispose(() => plaqueMat.dispose());
  det.add(mesh(merge([box(0.04, 0.48, 1.06, 9.42, y0 + 1.3, -1.9), box(0.06, 1.1, 0.06, 9.4, y0 + 0.55, -1.9)]), M.metalDark, { name: 'df:plaque-frame' }));
  det.add(mesh(plane(1.0, 0.43, 9.445, y0 + 1.3, -1.9, 0, Math.PI / 2, 0), plaqueMat, { receive: false, name: 'df:plaque' }));
  const drawPlaque = (): void => {
    const g = plaque.g;
    g.fillStyle = '#1a1817';
    g.fillRect(0, 0, 512, 220);
    g.strokeStyle = '#57534e';
    g.lineWidth = 3;
    g.strokeRect(6, 6, 500, 208);
    g.fillStyle = '#a8a29e';
    g.font = '500 17px "Geist Mono", monospace';
    g.fillText(tr('plaqueEyebrow'), 24, 40);
    g.fillStyle = '#f5f5f4';
    // largest size whose wrapped text fits in four lines
    let fs = 25;
    for (; fs > 17; fs--) {
      g.font = `600 ${fs}px "Geist", sans-serif`;
      if (wrap(g, tr('plaque'), 24, 0, 464, 0, true) <= 4) break;
    }
    wrap(g, tr('plaque'), 24, 74, 464, Math.round(fs * 1.22));
    g.fillStyle = '#d6d3d1';
    g.font = '500 14px "Geist Mono", monospace';
    g.fillText(tr('plaqueChip'), 24, 200);
    plaque.tex.needsUpdate = true;
  };
  drawPlaque();

  // ── state ────────────────────────────────────────────────────────────────
  let phase: NightPhase = 'setup';
  const levels = [2, 2, 2, 2, 2, 2];
  const saved = ctx.progress.get<number[] | null>('levels', null);
  if (saved && saved.length === 6) for (let i = 0; i < 6; i++) levels[i] = saved[i];
  let sim: NightSim | null = null;
  let acc = 0;
  let seqT = 0;
  let relayDone = 0;
  let predicted: number | null = null;
  let rti: { gesture: number; t: number } | null = null;
  let clearRtiHint: (() => void) | null = null;
  let lastResult: NightResult | null = null;
  let seed = DEFAULT_SEED;
  let dark = false;
  let ui: { refresh(): void; tick(): void } | null = null;
  let panelK: KennlinieHandle | null = null;
  const mrcUntil = new Float64Array(6);
  const flicker = new Float32Array(6);
  // cinematic: operator's eye → high panorama over the hall → back (GDD: the executive showpiece)
  // operate camera: high in the back corner of the gallery, so furnace … Umreifen (and its work lamp)
  // all sit left of the right-docked panel (projected x 205–815 px at 1280 × 720)
  const OP_CAM = new THREE.Vector3(14.3, 9.2, 0.5);
  const OP_LOOK = new THREE.Vector3(6.5, 0, -14);
  // the player's own eye at the desk: the return flight ends here, then operate mode eases up to OP_CAM
  const OP_EYE = new THREE.Vector3(11.2, GALLERY.y + 0.02 + 1.7, -3.4);
  // crane shot from high at the front of the hall: furnace left, Umreifen with its work lamp right,
  // both clear of the right HUD column during the run (projected: furnace x ≈ 120–180 px, Umreifen
  // lamp and person x ≈ 875 px at 1280 × 720; the run panel starts at x ≈ 960), and to the right of
  // the gallery's corner column so the lamp is not hidden behind it
  const PAN_A = new THREE.Vector3(4.6, 11.0, 5.2);
  const PAN_A_LOOK = new THREE.Vector3(4.4, 1.8, -9.8);
  const PAN_B = new THREE.Vector3(4.4, 10.8, 5.2);
  const PAN_C = new THREE.Vector3(4.2, 9.9, 4.5);
  const PAN_C_LOOK = new THREE.Vector3(4.6, 1.7, -9.9);
  const RISE_S = 2.6;
  const RELAY_T0 = 2.8;
  let cine: { set(p: THREE.Vector3, l: THREE.Vector3, b?: number): void; end(): void } | null = null;
  let unlockCine: (() => void) | null = null;
  let exitOp: (() => void) | null = null;
  let returnT = -1;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const retFromPos = new THREE.Vector3();
  const retFromLook = new THREE.Vector3();
  let runPanel: import('@/core/zones').PanelHandle | null = null;
  let runK: KennlinieHandle | null = null;

  const baseLamp = (g: number): LampState => (levels[g] >= 4 ? 'off' : levels[g] === 3 ? 'standby' : 'work');

  // ── Kennlinie spec (per hour, Wilson 95 %) ───────────────────────────────
  function emptySpec(): KennlinieSpec {
    return { title: ctx.i18n.text('nacht.kTitle'), xLabel: ctx.i18n.text('nacht.kX'), yLabel: ctx.i18n.text('nacht.kY'), series: [], percent: true, band: 'wilson95', chip: 'sim', xMin: 0.5, xMax: 8.5, yMin: 0, yMax: 1 };
  }
  const spec = (): KennlinieSpec => {
    const s = emptySpec();
    const r = sim?.result;
    if (!r) return s;
    const trials = r.hourly.map((h, i) => ({ x: i + 1, k: h.k, n: h.n })).filter((h) => h.n >= CYCLES_PER_HOUR);
    s.series = [{ id: 'share', label: ctx.i18n.text('nacht.kSeries'), trials }];
    const n = r.hourly.reduce((a, h) => a + h.n, 0);
    const k = r.hourly.reduce((a, h) => a + h.k, 0);
    if (n > 0) s.keyValue = ctx.ui.formatRate(k, n);
    return s;
  };
  const refreshCharts = (): void => {
    const s = spec();
    kTex.update(s);
    panelK?.update(s);
    runK?.update(s);
  };
  const drawStatus = (): void => {
    const g = stat.g;
    g.fillStyle = '#121110';
    g.fillRect(0, 0, 256, 320);
    g.fillStyle = '#a8a29e';
    g.font = '500 14px "Geist Mono", monospace';
    g.fillText(tr('statusEyebrow'), 14, 26);
    g.font = '700 46px "Space Grotesk", sans-serif';
    g.fillStyle = '#f5f5f4';
    g.fillText(sim ? clockOf(Math.min(sim.cycle, NIGHT_CYCLES - 1)) : '22:00', 14, 82);
    g.font = '500 14px "Geist Mono", monospace';
    for (let i = 0; i < 6; i++) {
      const y = 116 + i * 30;
      g.fillStyle = '#d6d3d1';
      g.fillText(gName(i).slice(0, 14), 14, y);
      g.fillStyle = levels[i] > TRUE_LEVEL[GESTURES[i]] && phase !== 'setup' ? '#ff8534' : '#2dd4bf';
      g.fillText(`L${levels[i]}`, 200, y);
    }
    stat.tex.needsUpdate = true;
  };
  drawStatus();

  // ── lights out / on ──────────────────────────────────────────────────────
  const setDark = (on: boolean): void => {
    if (dark === on) return;
    dark = on;
    line.setLabelDim(on);
    api.onDark?.(on);
  };
  const workLampCell = (): number => {
    if (levels[4] <= 2) return 4;
    for (let i = 0; i < 6; i++) if (levels[i] <= 2) return i;
    return -1;
  };
  const _v = new THREE.Vector3();
  const endCinematic = (): void => {
    cine?.end();
    cine = null;
    unlockCine?.();
    unlockCine = null;
    returnT = -1;
    runPanel?.remove();
    runPanel = null;
    runK?.remove();
    runK = null;
  };
  const lightsOn = (): void => {
    endCinematic();
    for (let k = 0; k < 6; k++) {
      hall.setStrip(k, 1);
      line.setLamp(k, 'day');
    }
    line.setDayPeople();
    line.setLabels(null);
    line.mode = 'day';
    line.running = true;
    line.speed = 1;
    line.resetForDay();
    line.prefill(2);
    hall.setHallLight('day');
    hall.setShutter(false);
    hall.setFurnaceNight(false);
    sound.setDrone(false);
    sound.setFurnace(0.7);
    line.arm.setRingGlow(false);
    setDark(false);
    hall.setClock(16 * 60 + 40);
    leverTarget = LEVER_UP;
    phase = 'setup';
    clearRtiHint?.();
    clearRtiHint = null;
    rti = null;
    ui?.refresh();
  };

  const startSequence = (instant = false): void => {
    if (!instant) {
      exitOp?.();
      exitOp = null;
      unlockCine = ctx.player.lockControls({ look: true });
      cine = ctx.player.cinematic();
      camPos.copy(OP_CAM);
      camLook.copy(OP_LOOK);
      cine.set(camPos, camLook, 1);
    }
    phase = 'sequence';
    seqT = 0;
    relayDone = 0;
    leverTarget = LEVER_DOWN;
    ctx.progress.set('levels', [...levels]);
    sound.clunk();
    hall.setShutter(true);
    hall.setFurnaceNight(true);
    sound.setFurnace(0.35);
    line.resetForNight();
    line.mode = 'night';
    line.speed = 0.6;
    line.running = true;
    line.setLabels(levels);
    drawStatus();
    ui?.refresh();
  };

  const startRun = (): void => {
    phase = 'run';
    sim = new NightSim(levels, seed);
    acc = 0;
    mrcUntil.fill(0);
    line.speed = 3;
    ctx.hud.setObjective(ctx.i18n.text('nacht.objRun'));
    if (cine) {
      runPanel = ctx.hud.panel({ eyebrow: ctx.i18n.text('nacht.eyebrowRun'), rows: [] });
      runPanel.el.append(ctx.ui.chip('sim', tr('simSource')), ctx.ui.chip('illustrativ', tr('ratesSource')));
    }
    refreshCharts();
    ui?.refresh();
  };

  const finishRun = (): void => {
    if (!sim) return;
    phase = 'result';
    const r = sim.result;
    lastResult = r;
    line.speed = 1.2;
    line.running = true;
    for (let g = 0; g < 6; g++) line.setLamp(g, baseLamp(g));
    hall.setClock(6 * 60);
    refreshCharts();
    drawStatus();
    clearRtiHint?.();
    clearRtiHint = null;
    hall.setShutter(false); // 06:00: the early shift opens the gate
    api.onResult?.(r, predicted);
    if (cine) {
      returnT = 0;
      retFromPos.copy(camPos);
      retFromLook.copy(camLook);
    }
    ui?.refresh();
  };
  const arriveAtLeitstand = (): void => {
    // put the player's own eye where the operator stands, then hand over to the Bedienmodus
    const dx = OP_LOOK.x - OP_EYE.x,
      dz = OP_LOOK.z - OP_EYE.z;
    const yawDeg = THREE.MathUtils.radToDeg(Math.atan2(-dx, -dz));
    const pitchDeg = -THREE.MathUtils.radToDeg(Math.atan2(OP_EYE.y - OP_LOOK.y, Math.hypot(dx, dz)));
    ctx.player.teleport([OP_EYE.x, GALLERY.y, OP_EYE.z], { yawDeg, pitchDeg });
    endCinematic();
    operate();
  };

  const onEvent = (e: { kind: string; cycle?: number; gesture?: number; overrated?: boolean; hour?: number }): void => {
    if (e.kind === 'mrc' && e.gesture != null) {
      sound.mrc();
      line.setLamp(e.gesture, 'alert');
      mrcUntil[e.gesture] = (e.cycle ?? 0) + 91;
      // overclaiming is the funny failure: a world popup at the cell, not a toast
      const c = CELLS[e.gesture].label;
      ctx.game.juice.popup([c[0], c[1] + 0.7, c[2]], ctx.i18n.text(e.overrated ? 'game.c.mrcPop' : 'game.c.mrcPopRti', { t: clockOf(e.cycle ?? 0) }), { tone: 'bad', seconds: 3 });
      ctx.game.juice.cue('bad', { at: [c[0], c[1], c[2]] });
    } else if (e.kind === 'hour') {
      refreshCharts();
      sound.clack();
    } else if (e.kind === 'rti' && e.gesture != null) {
      rti = { gesture: e.gesture, t: RTI_SECONDS };
      sound.rti();
      line.setLamp(e.gesture, 'alert');
      line.speed = 1;
      rtiSec = -1;
      statT = 0;
      ui?.refresh();
    }
  };

  const take = (): void => {
    if (!sim || !rti) return;
    sim.answer(true);
    ctx.audio.play('success', { volume: 0.6 });
    {
      const c = CELLS[rti.gesture].label;
      ctx.game.juice.popup([c[0], c[1] + 0.7, c[2]], ctx.i18n.text('game.c.rtiPop'), { tone: 'teal', seconds: 1.6 });
      ctx.game.juice.cue('good');
    }
    line.setLamp(rti.gesture, baseLamp(rti.gesture));
    rti = null;
    line.speed = 3;
    clearRtiHint?.();
    clearRtiHint = null;
    ui?.refresh();
  };
  // Z3: R only ever means retry; taking over a call for help is Space (or the panel's button)
  ctx.input.onKey('Space', () => take(), { whileOperating: true });

  const pullLever = async (pred?: number): Promise<void> => {
    if (phase !== 'setup') return;
    if (!levels.some((l) => l >= 3)) {
      ctx.hud.toast(ctx.i18n.text('nacht.needAuto'), { kind: 'info', duration: 4 });
      return;
    }
    if (pred != null) predicted = pred;
    else
      predicted = await ctx.ui.predict({
        question: ctx.i18n.text('nacht.predict'),
        unit: '%',
        min: 0,
        max: 100,
        step: 1,
        initial: 50,
        digits: 0,
      });
    startSequence();
  };

  // ── Bedienmodus panel ────────────────────────────────────────────────────
  const operate = (): void => {
    if (cine) return;
    exitOp = ctx.player.enterOperate({
      title: ctx.i18n.text('nacht.opTitle'),
      cameraPose: { position: [OP_CAM.x, OP_CAM.y, OP_CAM.z], lookAt: [OP_LOOK.x, OP_LOOK.y, OP_LOOK.z] },
      onExit: () => {
        exitOp = null;
        if (phase === 'result') lightsOn();
      },
      panelPosition: 'right',
      onPointer: (e) => {
        if (e.type !== 'down' || phase !== 'setup') return;
        // clicking the lever grip pulls it
        const d = e.direction;
        const c = lever.getWorldPosition(_v);
        const local = ctx.toLocal(c);
        const oc = local.sub(e.origin);
        const tca = oc.dot(d);
        const d2 = oc.lengthSq() - tca * tca;
        if (tca > 0 && d2 < 0.3 * 0.3) void pullLever();
      },
      panel: (el) => {
        const build = (): void => {
          el.replaceChildren();
          panelK?.remove();
          panelK = null;
          const head = document.createElement('div');
          head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px';
          const chips = document.createElement('div');
          chips.style.cssText = 'display:flex;gap:6px';
          if (phase === 'setup') {
            chips.append(ctx.ui.chip('richtwert', tr('scaleSource')));
            head.append(challenge.chips(), chips);
          } else {
            // the night's eyebrow while it runs; the result view carries only its chips (≤ 35 words at open)
            const eb = document.createElement('div');
            eb.className = 'eyebrow';
            eb.textContent = phase === 'result' ? '' : tr('eyebrowRun');
            chips.append(ctx.ui.chip('sim', tr('simSource')), ctx.ui.chip('illustrativ', tr('ratesSource')));
            head.append(eb, chips);
          }
          el.append(head);
          const st = document.createElement('style');
          st.textContent = DIAL_CSS;
          el.append(st);
          if (phase === 'setup') buildSetup(el);
          else buildRun(el);
        };
        ui = {
          refresh: build,
          tick: () => tickRun(el),
        };
        build();
        return () => {
          ui = null;
          panelK?.remove();
          panelK = null;
        };
      },
    });
  };

  /** setup panel, ≤ 35 visible words (plan §4.6): goal chips, six large dials (one per gesture, L0–L4;
   *  the „real L3–4“ tag and a teal arc of the realistic range join after the first night, PT-24: feedback,
   *  not a column to copy from), the live limit and the lever. Scale, L5, liability, the lever note and the
   *  realistic ranges sit behind ⓘ. Dials: click = one level up (wrapping), right click or Shift = down,
   *  wheel and arrow keys too. */
  const buildSetup = (el: HTMLElement): void => {
    const live = document.createElement('div');
    const renderLive = (): void => {
      const s = stationLevel(levels);
      live.innerHTML = `<span style="font-family:var(--font-mono);font-size:13px;color:var(--text)">${esc(ctx.t('game.c.liveShort', { l: s.level, g: gName(s.gesture) }))}</span>`;
      line.setLabels(levels);
      drawStatus();
    };
    const showReal = lastResult != null || ctx.pass.has('lichtaus');
    const grid = document.createElement('div');
    grid.className = 'df-dials';
    // the dial: 240° sweep, L0 at −120° … L4 at +120° (12 o'clock = 0°)
    const A = (l: number): number => ((-120 + l * 60) * Math.PI) / 180;
    const P = (r: number, a: number): string => `${(40 + Math.sin(a) * r).toFixed(1)} ${(40 - Math.cos(a) * r).toFixed(1)}`;
    const arc = (r: number, a0: number, a1: number): string => `M${P(r, a0)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${P(r, a1)}`;
    GESTURES.forEach((gid, g) => {
      const cell = document.createElement('div');
      cell.className = 'df-dial';
      const name = document.createElement('div');
      name.className = 'df-dname';
      name.textContent = gName(g);
      const knob = document.createElement('button');
      knob.className = 'df-knob';
      const [lo, hi] = REAL_RANGE[gid];
      const draw = (): void => {
        const l = levels[g];
        const notches = [0, 1, 2, 3, 4].map((k) => `<line x1="${P(30, A(k)).split(' ')[0]}" y1="${P(30, A(k)).split(' ')[1]}" x2="${P(35, A(k)).split(' ')[0]}" y2="${P(35, A(k)).split(' ')[1]}" stroke="${k <= l ? 'var(--orange)' : 'var(--text-3)'}" stroke-width="2"/>`).join('');
        const real = showReal ? `<path d="${arc(37.5, A(lo) - 0.12, A(hi) + 0.12)}" fill="none" stroke="var(--teal)" stroke-width="3" stroke-linecap="round" opacity=".85"/>` : '';
        const over = showReal && l > hi;
        knob.innerHTML = `<svg viewBox="0 0 80 80" width="74" height="74" aria-hidden="true"><path d="${arc(30, A(0), A(4))}" fill="none" stroke="var(--elevated)" stroke-width="6" stroke-linecap="round"/><path d="${arc(30, A(0), A(Math.max(0.02, l)))}" fill="none" stroke="var(--orange)" stroke-width="6" stroke-linecap="round" opacity=".55"/>${notches}${real}<circle cx="40" cy="40" r="20" fill="var(--surface, #1c1917)" stroke="var(--border)"/><line x1="40" y1="40" x2="${P(17, A(l)).split(' ')[0]}" y2="${P(17, A(l)).split(' ')[1]}" stroke="var(--orange)" stroke-width="3" stroke-linecap="round"/><text x="40" y="47" text-anchor="middle" font-family="var(--font-mono)" font-size="15" fill="${over ? 'var(--warning)' : 'var(--text)'}">L${l}</text></svg>`;
        knob.setAttribute('aria-label', `${gName(g)}: L${l}`);
        knob.title = `${gName(g)}: L${l}`;
      };
      const set = (l: number): void => {
        const v = ((l % 5) + 5) % 5;
        if (v === levels[g]) return;
        levels[g] = v;
        ctx.audio.play('click', { pitch: 0.85 + v * 0.08 });
        draw();
        renderLive();
      };
      knob.onclick = (e) => set(levels[g] + (e.shiftKey ? -1 : 1));
      knob.oncontextmenu = (e) => {
        e.preventDefault();
        set(levels[g] - 1);
      };
      knob.onwheel = (e) => {
        e.preventDefault();
        set(levels[g] + (e.deltaY < 0 ? 1 : -1));
      };
      knob.onkeydown = (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') (e.preventDefault(), set(levels[g] + 1));
        else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') (e.preventDefault(), set(levels[g] - 1));
      };
      draw();
      // the „real L3–4“ tag is the dial's teal arc (and its tooltip): no extra words per dial
      if (showReal) knob.title = `${gName(g)}: L${levels[g]} · ${ctx.t('game.c.colReal')} ${tr(`hint.${gid}`)}`;
      cell.append(name, knob);
      grid.append(cell);
    });
    if (showReal) {
      const legend = document.createElement('div');
      legend.className = 'df-dreal';
      legend.style.cssText = 'margin-top:2px;text-align:right';
      // one word in the console; the tooltip carries the legend (≤ 35 words at open, Phase 7)
      legend.textContent = `◠ ${ctx.t('game.c.realShort')}`;
      legend.title = ctx.t('game.c.realLegend');
      el.append(legend);
    }
    el.append(grid);
    live.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px solid var(--border-subtle)';
    el.append(live);
    renderLive();
    const go = document.createElement('button');
    go.className = 'btn primary';
    go.style.cssText = 'margin-top:10px;width:100%;font-size:15px;padding:11px';
    go.textContent = tr('lever');
    go.onclick = () => void pullLever();
    el.append(go);
    // ⓘ: the scale, L5, liability, what the lever does, the long hints
    const info = document.createElement('details');
    info.style.cssText = 'margin-top:6px;font-size:12px;color:var(--text-2)';
    const rows = [0, 1, 2, 3, 4, 5].map((l) => `<tr><td style="padding:1px 8px 1px 0;font-family:var(--font-mono)">L${l}</td><td style="padding:1px 8px 1px 0">${esc(SUPERVISION[l])}</td><td>${esc(tr(`liab.${l}`))}</td></tr>`).join('');
    const longs = GESTURES.map((gid) => `<div>${esc(tr(`hintLong.${gid}`))}</div>`).join('');
    info.innerHTML = `<summary style="cursor:pointer">ⓘ ${esc(ctx.t('game.c.info'))}</summary>`;
    const fill = (): void => {
      if (!info.open || info.childElementCount > 1) return;
      const body = document.createElement('div');
      body.innerHTML = `<div style="margin-top:4px;line-height:1.45">${esc(tr('intro'))}</div><div style="margin-top:4px;line-height:1.45">${esc(tr('leverNote'))}</div><div style="margin-top:4px;line-height:1.45;font-family:var(--font-mono);font-size:11.5px">${longs}</div><table style="margin-top:4px;border-collapse:collapse"><tr style="color:var(--text-3)"><td>${esc(tr('tLevel'))}</td><td>${esc(tr('tSuper'))}</td><td>${esc(tr('tLiab'))}</td></tr>${rows}</table><div style="margin-top:4px">L5 · ${esc(tr('l5'))}</div>`;
      // the supervision shares are the scale's guide values (RICHTWERT)
      body.querySelector('table')?.before(ctx.ui.chip('richtwert', tr('scaleSource')));
      info.append(body);
    };
    info.addEventListener('toggle', fill);
    el.append(info);
  };

  let runEls: { clock: HTMLElement; bar: HTMLElement; share: HTMLElement; iv: HTMLElement; mrc: HTMLElement; rti: HTMLElement } | null = null;
  const buildRun = (el: HTMLElement): void => {
    runEls = null;
    if (phase === 'sequence') {
      const d = document.createElement('div');
      d.style.cssText = 'font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--text);margin:14px 0 6px';
      d.textContent = tr('sequence');
      el.append(d);
      return;
    }
    const top = document.createElement('div');
    top.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;margin-top:8px';
    const clock = document.createElement('div');
    clock.style.cssText = 'font-family:var(--font-display);font-weight:700;font-size:34px;color:var(--text)';
    const share = document.createElement('div');
    share.style.cssText = 'font-family:var(--font-mono);font-size:22px;color:var(--orange-light);text-align:right';
    top.append(clock, share);
    const bar = document.createElement('div');
    bar.className = 'progress';
    bar.style.cssText = 'margin:6px 0 8px';
    const fill = document.createElement('i');
    bar.append(fill);
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;font-size:12.5px;color:var(--text-2)';
    const iv = document.createElement('div');
    const mrc = document.createElement('div');
    grid.append(iv, mrc);
    // the result: the share stays large, the clock (06:00) and the counters move into the sentence and the card
    if (phase === 'result') {
      clock.style.display = 'none';
      grid.style.display = 'none';
      bar.style.display = 'none';
    }
    const rtiBox = document.createElement('div');
    el.append(top, bar, grid, rtiBox);
    runEls = { clock, bar: fill, share, iv, mrc, rti: rtiBox };
    panelK = ctx.ui.kennlinie(spec(), { parent: el, width: 356, height: 168 });
    if (phase === 'result' && lastResult) buildResult(el, lastResult);
    tickRun(el);
  };

  const buildResult = (el: HTMLElement, r: NightResult): void => {
    const box2 = document.createElement('div');
    box2.style.cssText = 'margin-top:8px;padding:10px 12px;border:1px solid var(--border-subtle);border-radius:10px;font-size:13.5px;line-height:1.5;color:var(--text)';
    box2.textContent = sentence(r);
    el.append(box2);
    // your guess against the measurement: the banner's detail and the Pass carry it (≤ 35 words here)
    // the mode line („autonom“ is a share …) lives in the banner lesson and the card now (≤ 70 words)
    const row = document.createElement('div');
    row.className = 'op-row';
    const again = document.createElement('button');
    again.className = 'btn';
    again.textContent = tr('again');
    again.onclick = () => lightsOn();
    const card = document.createElement('button');
    card.className = 'btn ghost';
    card.textContent = ctx.mode === 'entscheider' ? tr('befund') : ctx.t('curious');
    card.onclick = () => void ctx.hud.openInfoCard(cardSpec());
    row.append(again, card);
    el.append(row);
  };

  const tickRun = (_el: HTMLElement): void => {
    if (!runEls || !sim) return;
    const r = sim.result;
    const c = Math.min(sim.cycle, NIGHT_CYCLES);
    runEls.clock.textContent = c >= NIGHT_CYCLES ? '06:00' : clockOf(c);
    runEls.bar.style.width = `${((c / NIGHT_CYCLES) * 100).toFixed(1)}%`;
    const shareSoFar = c > 0 ? r.autonomous / c : 0;
    runEls.share.textContent = phase === 'result' ? pct(r.share) : c > 0 ? `${pct(shareSoFar)}` : '—';
    runEls.iv.textContent = tr('ivLine', { n: r.interventions, h: ctx.i18n.num(r.interventions / Math.max(1 / 60, (c * TAKT_S) / 3600), 0) });
    const mrcMin = Math.round(phase === 'result' ? r.mrcMinutes : sim.lostMinutes);
    runEls.mrc.textContent = tr('mrcLine', { n: r.mrcs, m: mrcMin });
    if (rti) {
      runEls.rti.innerHTML = '';
      const b = document.createElement('div');
      b.style.cssText = 'margin-top:8px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,103,0,.5);background:rgba(255,103,0,.08);display:flex;justify-content:space-between;align-items:center;gap:10px';
      const t = document.createElement('div');
      t.style.cssText = 'font-family:var(--font-mono);font-size:13px;color:var(--text)';
      t.textContent = tr('rti', { g: gName(rti.gesture), s: Math.ceil(rti.t) });
      const btn = document.createElement('button');
      btn.className = 'btn primary';
      btn.textContent = tr('take');
      btn.onclick = take;
      b.append(t, btn);
      runEls.rti.append(b);
    } else if (runEls.rti.childElementCount) runEls.rti.innerHTML = '';
  };

  const sentence = (r: NightResult): string => {
    const lim = r.limiting;
    if (lim < 0) return tr('sentenceNone', { s: pct(r.share) });
    const chosen = r.levels[lim];
    const real = TRUE_LEVEL[GESTURES[lim]];
    const lvl = chosen > real ? tr('overLevel', { c: chosen, r: real }) : `L${chosen}`;
    return tr('sentence', { s: pct(r.share), g: gIn(lim), l: lvl, w: pct(r.without[lim]) });
  };

  const cardSpec = (): InfoCardSpec => {
    // the limit line names the player's own weakest gesture (not always Umreifen)
    const lim = lastResult ? lastResult.limiting : 4;
    const limText = lim >= 0 ? ctx.i18n.text('nacht.befund2', { g: gIn(lim), l: lastResult ? (lastResult.levels[lim] > TRUE_LEVEL[GESTURES[lim]] ? tr('overLevel', { c: lastResult.levels[lim], r: TRUE_LEVEL[GESTURES[lim]] }) : `L${lastResult.levels[lim]}`) : 'L1' }) : ctx.i18n.text('nacht.befund2None');
    return {
      eyebrow: ctx.i18n.text('nacht.cardEyebrow'),
      title: ctx.i18n.text('nacht.cardTitle'),
      body: [ctx.i18n.text('nacht.cardBody1'), ctx.i18n.text('nacht.cardBody2')],
      bullets: [ctx.i18n.text('nacht.ivDef'), ctx.i18n.text('nacht.rtiDef'), ctx.i18n.text('nacht.mrcDef')],
      metrics: lastResult
        ? [
            { label: ctx.i18n.text('nacht.mShare'), value: ctx.i18n.num(lastResult.share * 100, 0), unit: '%' },
            { label: ctx.i18n.text('nacht.mIv'), value: ctx.i18n.num(lastResult.interventionsPerHour, 0), unit: '/h' },
            { label: ctx.i18n.text('nacht.mMrc'), value: Math.round(lastResult.mrcMinutes), unit: 'min' },
          ]
        : undefined,
      illustrative: true,
      illustrativeNote: { de: 'Spielzeugmodell: simulierte Nacht, keine echten Betriebsdaten.', en: 'Toy model: a simulated night, not real plant data.' },
      forDecisionMakers: {
        title: ctx.i18n.text('nacht.befundTitle'),
        bullets: [ctx.i18n.text('nacht.befund1'), limText, ctx.i18n.text('nacht.befund3'), ctx.i18n.text('nacht.befund4')],
      },
      // Entdecker: the card stays short (no Befundkarte); Entscheider: the Befundkarte already says
      // "split the use case into gestures", so the second paragraph is dropped
      entdecker: { forDecisionMakers: undefined },
      entscheider: { body: [ctx.i18n.text('nacht.cardBody1')] },
    };
  };

  // ── the challenge (FUN-PLAN D3 „Ehrliche Nacht“): ★ a night with the lights out; ★★ honest levels
  //    (none above what the gesture can do, ≥ 1 at L3+); ★★★ honest and 0 MRC (every RtI taken) ──
  const challenge = ctx.game.challenge({
    id: 'lichtaus',
    title: ctx.i18n.text('game.c.title'),
    metric: { label: ctx.i18n.text('game.c.metric'), unit: '%', better: 'higher', digits: 0 },
    goals: [{ text: ctx.i18n.text('game.c.g1') }, { text: ctx.i18n.text('game.c.g2') }, { text: ctx.i18n.text('game.c.g3') }],
    lesson: ctx.i18n.text('game.c.lesson'),
    why: cardSpec,
    retry: () => {
      lightsOn();
      if (!exitOp) operate();
    },
    emi,
  });

  ctx.addInteractable({ object: lever, label: ctx.i18n.text('nacht.use'), range: 2.6, onInteract: operate });
  // also the desk itself: an invisible proxy at the desk (the screen meshes sit at the zone origin, and
  // the interaction pre-filter goes by object position), covering the collider top so it is never occluded
  const deskProxy = new THREE.Mesh(new THREE.BoxGeometry(DX1 - DX0 + 0.14, 0.42, DZ1 - DZ0 + 0.04), new THREE.MeshBasicMaterial({ visible: false }));
  deskProxy.position.set((DX0 + DX1) / 2, y0 + 0.74, (DZ0 + DZ1) / 2);
  deskProxy.userData.noCollide = true;
  det.add(deskProxy);
  ctx.onDispose(() => {
    deskProxy.geometry.dispose();
    (deskProxy.material as THREE.Material).dispose();
  });
  ctx.addInteractable({ object: deskProxy, label: ctx.i18n.text('nacht.use'), range: 2.8, highlight: false, onInteract: operate });

  const api: Nacht = {
    get phase() {
      return phase;
    },
    challenge,
    levels,
    get lastResult() {
      return lastResult;
    },
    onResult: null,
    onDark: null,
    onDarkLevel: null,
    onLightsOutLine: null,
    operate,
    take,
    lightsOn,
    abort() {
      if (phase !== 'setup' || cine) lightsOn();
      exitOp?.();
      exitOp = null;
    },
    debugDark() {
      if (phase !== 'setup') lightsOn();
      startSequence(true);
      for (let k = 0; k < 6; k++) {
        hall.setStrip(k, 0);
        line.setLamp(k, baseLamp(k));
        line.setPerson(k, levels[k] <= 2);
      }
      const wl = workLampCell();
      hall.setHallLight(wl >= 0 ? new THREE.Vector3(CELLS[wl].lamp[0], CELLS[wl].lamp[1] - 0.6, CELLS[wl].lamp[2]) : 'off');
      setDark(true);
      sound.setDrone(true);
      line.arm.setRingGlow(true);
      startRun();
    },
    setLevels(l) {
      for (let i = 0; i < 6; i++) levels[i] = l[i];
      line.setLabels(phase === 'setup' ? null : levels);
      drawStatus();
      ui?.refresh();
    },
    pullLever(p = 50) {
      void pullLever(p);
    },
    relabel() {
      drawPlaque();
      drawStatus();
      refreshCharts();
      ui?.refresh();
    },
    solve(l, s) {
      if (l) api.setLevels(l);
      seed = s ?? DEFAULT_SEED;
      if (phase !== 'setup') lightsOn();
      if (predicted == null) predicted = 50;
      startSequence(true);
      // jump to the dark end state
      for (let k = 0; k < 6; k++) {
        hall.setStrip(k, 0);
        line.setLamp(k, baseLamp(k));
        line.setPerson(k, levels[k] <= 2);
      }
      const wl = workLampCell();
      hall.setHallLight(wl >= 0 ? new THREE.Vector3(CELLS[wl].lamp[0], CELLS[wl].lamp[1] - 0.6, CELLS[wl].lamp[2]) : 'off');
      setDark(true);
      sound.setDrone(true);
      startRun();
      sim!.advanceAll();
      finishRun();
      seed = DEFAULT_SEED;
      return sim!.result;
    },
    update(dt) {
      // lever
      lever.rotation.z += (leverTarget - lever.rotation.z) * Math.min(1, dt * 7);
      if (phase === 'sequence') {
        seqT += dt;
        const k = Math.floor((seqT - (cine ? RELAY_T0 : 1.2)) / RELAY_DT);
        while (relayDone <= k && relayDone < 6) {
          const g = relayDone;
          flicker[g] = 0.32; // the tube row stutters before it dies
          line.setLamp(g, baseLamp(g));
          api.onDarkLevel?.((g + 1) / 6);
          hall.setHallLightLevel(1 - (g + 1) / 6);
          line.setPerson(g, levels[g] <= 2);
          sound.relay(g);
          ctx.player.shake(0.004, 0.25);
          relayDone++;
          if (relayDone === 6) {
            const wl = workLampCell();
            hall.setHallLight(wl >= 0 ? new THREE.Vector3(CELLS[wl].lamp[0], CELLS[wl].lamp[1] - 0.6, CELLS[wl].lamp[2]) : 'off');
            setDark(true);
            sound.setDrone(true);
            line.arm.setRingGlow(true);
            api.onLightsOutLine?.();
          }
        }
        for (let g = 0; g < 6; g++) {
          if (flicker[g] <= 0) continue;
          flicker[g] -= dt;
          hall.setStrip(g, flicker[g] <= 0 ? 0 : Math.sin(flicker[g] * 95) > 0.1 ? 0.9 : 0.05);
        }
        if (seqT > (cine ? RELAY_T0 : 1.2) + 6 * RELAY_DT + 1.6) startRun();
      } else if (phase === 'run' && sim) {
        if (rti) {
          rti.t -= dt;
          if (rti.t <= 0) {
            // missed: nobody took over → MRC
            sim.answer(false);
            rti = null;
            line.speed = 3;
            clearRtiHint?.();
            clearRtiHint = null;
            // the sim reports the MRC itself (popup at the cell)
            ctx.game.juice.cue('oops');
            ui?.refresh();
          }
        } else {
          acc += dt * CYCLES_PER_SEC;
          const n = Math.floor(acc);
          if (n > 0) {
            acc -= n;
            sim.advance(n, onEvent);
          }
          if (sim.done) finishRun();
        }
        // line stands still during a safe stop
        const c = sim.cycle;
        line.running = !sim.stopped;
        for (let g = 0; g < 6; g++) if (mrcUntil[g] > 0 && c >= mrcUntil[g]) {
          mrcUntil[g] = 0;
          if (!rti || rti.gesture !== g) line.setLamp(g, baseLamp(g));
        }
        hall.setClock(NIGHT_START_MIN + (Math.min(c, NIGHT_CYCLES) * TAKT_S) / 60);
        drawStatusThrottled(dt);
        ui?.tick();
      }
      // ── camera choreography ──
      if (cine) {
        const still = ctx.settings.reducedMotion;
        if (phase === 'sequence') {
          const a = Math.min(1, seqT / RISE_S);
          const e = a * a * (3 - 2 * a);
          if (still) {
            camPos.copy(PAN_B);
            camLook.copy(PAN_A_LOOK);
          } else if (a < 1) {
            camPos.lerpVectors(OP_CAM, PAN_A, e);
            camPos.y += Math.sin(Math.PI * e) * 0.8;
            camLook.lerpVectors(OP_LOOK, PAN_A_LOOK, e);
          } else {
            const b = Math.min(1, (seqT - RISE_S) / 7.5);
            camPos.lerpVectors(PAN_A, PAN_B, b * (2 - b));
            camLook.copy(PAN_A_LOOK);
          }
        } else if (phase === 'run' && sim) {
          const p = still ? 0 : Math.min(1, sim.cycle / NIGHT_CYCLES);
          const e = p * p * (3 - 2 * p);
          camPos.lerpVectors(PAN_B, PAN_C, e);
          camLook.lerpVectors(PAN_A_LOOK, PAN_C_LOOK, e);
        } else if (phase === 'result' && returnT >= 0) {
          returnT += dt;
          // hold the dawn shot a moment, then fly back (reduced motion: cut)
          const a = still ? (returnT > 1.2 ? 1 : 0) : Math.min(1, Math.max(0, (returnT - 1.2) / 2.4));
          const e = a * a * (3 - 2 * a);
          camPos.lerpVectors(retFromPos, OP_EYE, e);
          camLook.lerpVectors(retFromLook, OP_LOOK, e);
          if (a >= 1) {
            cine.set(camPos, camLook, 1);
            arriveAtLeitstand();
          }
        }
        cine?.set(camPos, camLook, 1);
      }
    },
  };
  const runPanelTick = (): void => {
    if (!runPanel || !sim) return;
    const r = sim.result;
    const c = Math.min(sim.cycle, NIGHT_CYCLES);
    runPanel.setRows([
      { k: tr('rowClock'), v: c >= NIGHT_CYCLES ? '06:00' : clockOf(c), tone: 'teal' },
      { k: tr('rowCycles'), v: `${c.toLocaleString(ctx.lang === 'de' ? 'de-DE' : 'en-US')} / 1${ctx.lang === 'de' ? '.' : ','}440` },
      { k: tr('rowShare'), v: c > 0 ? pct(r.autonomous / c) : '—', tone: 'accent' },
      { k: tr('rowIv'), v: `${r.interventions} · ${ctx.i18n.num(r.interventions / Math.max(1 / 60, (c * TAKT_S) / 3600), 0)}/h` },
      { k: tr('rowMrc'), v: `${r.mrcs} · ${Math.round(sim.lostMinutes)} min` },
    ]);
  };
  let statT = 0;
  let rtiSec = -1;
  const drawStatusThrottled = (dt: number): void => {
    statT -= dt;
    if (statT <= 0) {
      statT = 0.25;
      runPanelTick();
      if (rti && !ctx.player.operating) {
        const sec = Math.ceil(rti.t);
        if (sec !== rtiSec) {
          rtiSec = sec;
          clearRtiHint?.();
          clearRtiHint = ctx.ui.hint(ctx.i18n.text('nacht.rtiHint', { g: gName(rti.gesture), s: sec }), 0);
        }
      }
      drawStatus();
    }
  };
  return api;
}

/** word-wrap `text` at `maxW`; returns the line count (`dry`: count only, draw nothing) */
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, dry = false): number {
  const words = text.split(' ');
  let line = '';
  let n = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) {
      if (!dry) g.fillText(line, x, y);
      n++;
      line = w;
      y += lh;
    } else line = test;
  }
  if (line) {
    if (!dry) g.fillText(line, x, y);
    n++;
  }
  return n;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
