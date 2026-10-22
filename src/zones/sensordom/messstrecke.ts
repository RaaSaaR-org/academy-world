/**
 * Station C ◆ → M1 "Messstrecke" (Messen): a stereo depth sensor on a tripod looks along a 10 m rail at a
 * target plate (stops 1 / 3 / 6 / 9 m, carriage 1.5 m/s). Toy model (SIM · LIVE, parameters
 * illustrative): reading = z + N(0, σ), σ(z) = 2 mm · (z / 1 m)²; Gegenlicht σ × 2.5 and dropout
 * probability min(0.6, 0.05 · z). Physical basis: σ_z ≈ z² · σ_d / (f · B).
 *
 * Phase 7 (plan §4.2, R6 #9): one prediction (σ at 6 m). The second tip became a visible consequence:
 * EMI-02 rides along beside the carriage and, after each run, reaches 10 times for the test body on the
 * plate, aiming where the first ten readings put it (2×, ≤ 10 s, the camera turns to the plate): a reading
 * within ±5 cm grips, anything else grabs air. „8/10“ (SIM · LIVE). ★ the 4 series (stamp, card #9) ·
 * ★★ the grip limit found in the lab light (a safe stop and the next one out both measured) · ★★★ the same
 * under backlight (the limit moves closer).
 */
import * as THREE from 'three';
import type { InfoCardSpec, KennlinieHandle, KennlinieSpec } from '@/core/zones';
import { css } from '@/core/zones';
import { rbox } from './look';
import { placed } from './kit';
import { G_SOLID } from './lidar';
import { own } from './materials';
import type { Sd } from './types';
import { canvasSign } from './signs';
import { REACH } from './tuning';

export const RAIL = { x: 7.2, sensorZ: 9.0, y: 1.2 } as const;
export const STOPS = [1, 3, 6, 9] as const;
export const SIGMA1_MM = 2;
export const BACKLIGHT = 2.5;
export const sigmaMm = (z: number, gegen: boolean): number => SIGMA1_MM * z * z * (gegen ? BACKLIGHT : 1);
export const dropoutP = (z: number, gegen: boolean): number => (gegen ? Math.min(0.6, 0.05 * z) : 0);
/** Greif-Test (FUN-PLAN S3): a reading within ±5 cm of the true distance is a grip (game value, ILLUSTRATIV) */
export const GRIP_TOL_MM = 50;
/** erf, Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7) */
const erf = (x: number): number => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
};
/** expected share of grips per reading in the toy model: P(|e| ≤ 5 cm) · (1 − dropout) */
export const gripRate = (z: number, gegen: boolean): number => erf(GRIP_TOL_MM / (sigmaMm(z, gegen) * Math.SQRT2)) * (1 - dropoutP(z, gegen));
/** the farthest stop the model grips safely (≥ 90 %, i.e. ≥ 27 of 30): Labor 3 m, Gegenlicht 1 m */
export const safeStop = (gegen: boolean): number => [...STOPS].reverse().find((z) => gripRate(z, gegen) >= 0.9) ?? 1;
const SPEED = 1.5;
const N = 30;
const RATE = 12; // readings per second
const BINS = 31;
const BIN_MM = 50;

type Light = 'labor' | 'gegen';
interface Run {
  z: number;
  light: Light;
  errs: number[]; // mm, valid readings only
  drop: number;
  /** the readings in order (mm; NaN = dropout): EMI-02 aims its ten reaches with the first ten */
  seq?: number[];
}

export function sampleStd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
const gauss = (): number => {
  const u = 1 - Math.random(),
    v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export interface Messstrecke {
  /** debug snapshot */
  state(): { carD: number; targetD: number; light: string; running: boolean; runs: string[]; predicted: number | null };
  fixedUpdate(dt: number): void;
  update(dt: number): void;
  solve(): void;
  /** test hook: both tips right → ★★★ */
  stars3(): void;
  readonly operating: boolean;
}

export function buildMessstrecke(sd: Sd): Messstrecke {
  const { ctx, B, lidar, look } = sd;
  const M = ctx.materials;
  const X = RAIL.x,
    S = RAIL.sensorZ;
  const zOf = (d: number): number => S - d;

  // ── rail ────────────────────────────────────────────────────────────────
  const z0 = zOf(9) - 0.7,
    z1 = S + 0.4;
  const railLen = z1 - z0,
    railMid = (z0 + z1) / 2;
  // no player collider on the 12 cm bed: standing on it wedged you against the carriage (playtest PT-02);
  // the laser and the visor still see it
  B.box({ size: [0.9, 0.12, railLen], pos: [X, 0.06, railMid], mat: look.carbon, seg: 'geraet', round: 0.03, collide: false });
  for (const s of [-1, 1]) B.geo(placed(new THREE.BoxGeometry(0.05, 0.05, railLen), [X + s * 0.25, 0.145, railMid]), { mat: look.alu, seg: 'geraet' });
  // scale printed on the bed: ticks every 0.5 m, labels at the four stops (one texture, no text meshes)
  const scaleTex = own(
    M.canvasTexture(128, 1024, (g: CanvasRenderingContext2D, w: number, h: number) => {
      g.fillStyle = '#292929';
      g.fillRect(0, 0, w, h);
      const yOf = (d: number): number => ((zOf(d) - z0) / railLen) * h;
      g.fillStyle = '#a8a29e';
      for (let d = 0; d <= 9.5; d += 0.5) g.fillRect(4, yOf(d) - 1, d % 1 === 0 ? 22 : 12, 2);
      g.font = '600 15px "Geist Mono", monospace';
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      for (const d of STOPS) {
        g.fillStyle = '#ff6700';
        g.fillRect(w - 22, yOf(d) - 2, 18, 4);
        g.fillStyle = '#f5f5f4';
        g.fillText(`${d} m`, w - 28, yOf(d));
      }
    }),
  );
  scaleTex.wrapS = scaleTex.wrapT = THREE.ClampToEdgeWrapping;
  B.geo(placed(new THREE.PlaneGeometry(0.9, railLen).rotateX(-Math.PI / 2), [X, 0.122, railMid]), { mat: own(new THREE.MeshStandardMaterial({ map: scaleTex, roughness: 0.7, metalness: 0.2, name: 'sensordom:railscale' })), seg: 'geraet' });

  // ── carriage with the target plate (kinematic: pushes the player) ────────
  const carriage = new THREE.Group();
  carriage.position.set(X, 0, zOf(3));
  ctx.groups.detail.add(carriage);
  B.mesh(
    mergeBoxes([
      [[0.7, 0.08, 0.5], [0, 0.21, 0]],
      [[0.06, 0.9, 0.06], [0, 0.7, -0.05]],
      [[0.66, 0.04, 0.04], [0, 0.88, -0.03]],
      [[0.66, 0.04, 0.04], [0, 1.52, -0.03]],
      [[0.04, 0.68, 0.04], [-0.33, 1.2, -0.03]],
      [[0.04, 0.68, 0.04], [0.33, 1.2, -0.03]],
    ]),
    { mat: look.alu, seg: 'geraet' },
    carriage,
  );
  const plate = B.mesh(new THREE.BoxGeometry(0.6, 0.6, 0.02), { mat: M.standard({ color: 0xf5f5f4, roughness: 0.92, metalness: 0 }), seg: 'kiste' }, carriage);
  plate.position.set(0, 1.2, 0);
  // the test body EMI-02 reaches for (a 6-cm cube on a ledge at the plate's left edge, at sensor height)
  B.mesh(new THREE.BoxGeometry(0.1, 0.012, 0.1), { mat: look.alu, seg: 'geraet' }, carriage).position.set(-0.36, RAIL.y - 0.036, 0.0);
  const testBody = B.mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), { mat: M.accentOrange, seg: 'kiste' }, carriage);
  testBody.position.set(-0.36, RAIL.y, 0.0);
  const kin = ctx.physics.addKinematic(carriage);
  let carZ = zOf(3);
  let targetD = 3;
  let carD = 3;
  const plateCollider = lidar.addBox([0.6, 0.6, 0.02], [X, 1.2, carZ], null, G_SOLID, { seg: 'kiste', depth: 'normal' });

  // ── tripod + stereo sensor ───────────────────────────────────────────────
  const legs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const foot = new THREE.Vector3(X + Math.sin(a) * 0.42, 0, S + 0.15 + Math.cos(a) * 0.42);
    const top = new THREE.Vector3(X, 1.05, S + 0.15);
    const len = foot.distanceTo(top);
    const g = new THREE.CylinderGeometry(0.014, 0.018, len, 6);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
    g.applyQuaternion(q);
    const mid = foot.clone().add(top).multiplyScalar(0.5);
    g.translate(mid.x, mid.y, mid.z);
    legs.push(g);
  }
  for (const g of legs) B.geo(g, { mat: look.alu, seg: 'geraet' });
  B.geo(placed(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), [X, 1.1, S + 0.15]), { mat: look.carbon, seg: 'geraet' });
  B.geo(placed(rbox(0.34, 0.085, 0.1, 0.02), [X, 1.2, S + 0.12]), { mat: look.shell, seg: 'geraet' });
  for (const s of [-1, 1]) {
    B.geo(placed(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 18).rotateX(Math.PI / 2), [X + s * 0.06, 1.2, S + 0.06]), { mat: look.light('teal', 1), seg: 'geraet' });
  }
  ctx.physics.addStaticCylinder({ radius: 0.3, height: 1.25, position: [X, 0.62, S + 0.15] });
  lidar.addBox([0.34, 0.1, 0.1], [X, 1.2, S + 0.12], null, G_SOLID, { seg: 'geraet', depth: 'normal' });

  // ── backlight floodlamp at the far end, aimed at the sensor ──────────────
  const lampZ = zOf(9) - 2.0;
  B.box({ size: [0.08, 2.0, 0.08], pos: [X, 1.0, lampZ - 0.1], mat: look.alu, seg: 'geraet' });
  B.geo(placed(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 20), [X, 0.03, lampZ - 0.1]), { mat: look.carbon, seg: 'geraet' });
  B.geo(placed(new THREE.CylinderGeometry(0.3, 0.24, 0.42, 24).rotateX(Math.PI / 2), [X, 2.0, lampZ]), { mat: look.hull, seg: 'geraet' });
  const lampFaceMat = own(new THREE.MeshStandardMaterial({ name: 'sensordom:lampface', color: 0x292524, emissive: 0xfff1dc, emissiveIntensity: 0.05, roughness: 0.3 }));
  const lampFace = B.mesh(new THREE.CircleGeometry(0.27, 24), { mat: lampFaceMat, seg: 'geraet' });
  lampFace.position.set(X, 2.0, lampZ + 0.215);
  const coneMat = own(
    new THREE.ShaderMaterial({
      name: 'sensordom:lampcone',
      uniforms: { uA: { value: 0 } },
      vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uA; varying float vY; void main(){ gl_FragColor = vec4(vec3(1.0,0.93,0.82) * uA * 0.16 * pow(vY, 2.2), 1.0); }',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  const coneLen = S - lampZ - 0.3;
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 1.5, coneLen, 24, 1, true), coneMat);
  cone.geometry.rotateX(-Math.PI / 2);
  // tilt from the lamp (y 2.0) down to the sensor (y 1.2)
  cone.position.set(X, 1.6, lampZ + 0.25 + coneLen / 2);
  cone.rotation.x = Math.atan2(0.8, coneLen);
  cone.visible = false;
  ctx.groups.detail.add(cone);

  // ── console + screen + sign ──────────────────────────────────────────────
  const conX = X + 1.4,
    conZ = S - 0.6;
  // console (ART-V2 §6.0): rounded ceramic body, carbon top, alu trim
  B.box({ size: [0.55, 1.0, 0.4], pos: [conX, 0.5, conZ], rot: [0, -Math.PI / 2, 0], mat: look.hull, seg: 'geraet', round: 0.06 });
  B.geo(placed(rbox(0.5, 0.04, 0.36, 0.015), [conX, 1.02, conZ], [0.0, -Math.PI / 2, 0]), { mat: look.carbon, seg: 'geraet' });
  B.geo(placed(new THREE.BoxGeometry(0.57, 0.025, 0.42), [conX, 0.985, conZ], [0.0, -Math.PI / 2, 0]), { mat: look.alu, seg: 'geraet' });
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 20), M.accentOrange);
  knob.position.set(conX, 1.06, conZ);
  ctx.groups.detail.add(knob);
  sd.visor.register(knob, { seg: 'geraet' });

  const spec = (): KennlinieSpec => kennSpec();
  const screen = ctx.ui.kennlinie(
    { title: sd.text('rail.kTitle'), xLabel: sd.text('rail.kX'), yLabel: sd.text('rail.kY'), series: [] },
    { target: 'texture', width: 512, height: 320 },
  );
  const scrX = X + 2.1,
    scrZ = 6.2,
    scrRy = -0.62;
  B.box({ size: [1.46, 0.96, 0.06], pos: [scrX, 1.62, scrZ], rot: [0, scrRy, 0], mat: look.alu, seg: 'geraet', round: 0.025 });
  B.box({ size: [0.08, 1.15, 0.08], pos: [scrX - 0.03 * Math.sin(scrRy), 0.58, scrZ - 0.03 * Math.cos(scrRy)], rot: [0, scrRy, 0], mat: look.alu, seg: 'geraet' });
  const screenMat = own(new THREE.MeshBasicMaterial({ map: screen.texture!, toneMapped: false }));
  const screenMesh = B.mesh(new THREE.PlaneGeometry(1.38, 0.86), { mat: screenMat, seg: 'geraet' });
  screenMesh.position.set(scrX + 0.035 * Math.sin(scrRy), 1.62, scrZ + 0.035 * Math.cos(scrRy));
  screenMesh.rotation.y = scrRy;

  canvasSign(sd, { eyebrow: sd.text('sign.cEyebrow'), title: sd.text('sign.cTitle'), body: sd.text('sign.cBody'), width: 1.8, height: 0.95, stand: true, position: [X - 3.0, 0, S + 0.6], rotationY: -1.25 });

  // measurement dots (one instanced draw call) + the beam flash
  const DOTS = 30;
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.014, 8, 6), M.emissiveTeal, DOTS);
  dots.count = 0;
  dots.frustumCulled = false;
  ctx.groups.detail.add(dots);
  sd.visor.register(dots, { seg: 'geraet' });
  const beamGeo = new THREE.BufferGeometry();
  const beamPos = new Float32Array(6);
  beamGeo.setAttribute('position', new THREE.BufferAttribute(beamPos, 3));
  const beamMat = own(new THREE.LineBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0 }));
  const beam = new THREE.Line(beamGeo, beamMat);
  beam.frustumCulled = false;
  ctx.groups.detail.add(beam);

  // ── state ────────────────────────────────────────────────────────────────
  type Saved = { z: number; light: Light; errs: number[]; drop: number }[];
  const runs = new Map<string, Run>();
  for (const r of ctx.progress.get<Saved>('runs', [])) runs.set(`${r.z}|${r.light}`, r);
  let light: Light = 'labor';
  let predicted: number | null = ctx.progress.get<number | null>('predicted', null);
  let current: { run: Run; i: number; acc: number } | null = null;
  let operating = false;
  let panelK: KennlinieHandle | null = null;
  let histo: HTMLCanvasElement | null = null;
  let ui: { refresh(): void } | null = null;
  let lastText = '';
  let done = ctx.pass.has('messstrecke');
  let saidStart = false;
  // EMI-02's reaches per run (plan §4.2): grips of 10, keyed like the runs
  const reaches = new Map<string, number>(ctx.progress.get<[string, number][]>('reaches', []));
  let lastReach: { z: number; light: Light; grips: number } | null = null;
  let showInfo = false;
  const ch = ctx.game.challenge({
    id: 'messstrecke',
    title: sd.text('game.c.title'),
    goals: [{ text: sd.text('game.c.g1') }, { text: sd.text('game.c.g2') }, { text: sd.text('game.c.g3') }],
    lesson: sd.text('game.c.lesson'),
    why: () => cardC(sd, runs, sigma6() ?? 72, backFactor() ?? BACKLIGHT, gegenRuns()[0]?.errs.length ?? 0, predicted),
    retry: () => {
      if (!operating) operate();
    },
    emi: sd.emi,
  });
  /** the grip limit is found when the model's farthest safe stop and the next one out are both measured */
  const limitFound = (l: Light): boolean => {
    const safe = safeStop(l === 'gegen');
    const next = STOPS.find((d) => d > safe);
    return runs.has(`${safe}|${l}`) && (next == null || runs.has(`${next}|${l}`));
  };
  let shownStars = ch.stars;
  const judge = (): void => {
    if (!done) return;
    const okL = limitFound('labor'),
      okG = limitFound('gegen');
    const stars = (1 + (okL ? 1 : 0) + (okL && okG ? 1 : 0)) as 1 | 2 | 3;
    if (stars <= shownStars) return;
    shownStars = stars;
    const d = (l: Light): string => {
      const safe = safeStop(l === 'gegen');
      return `${ctx.t(l === 'labor' ? 'rail.labor' : 'rail.gegen')} ${safe} m ✓ · ${STOPS.find((x) => x > safe) ?? '–'} m ✗`;
    };
    ch.submit(null, { stars, detail: () => [okL ? d('labor') : '', okG ? d('gegen') : ''].filter(Boolean).join(' · ') || ctx.t('game.c.detailStamp') });
    ui?.refresh();
  };
  const m4 = new THREE.Matrix4();
  const tmpV = new THREE.Vector3();

  const sig = (r: Run): number => sampleStd(r.errs);
  const laborRuns = (): Run[] => STOPS.map((d) => runs.get(`${d}|labor`)).filter((r): r is Run => !!r);
  const gegenRuns = (): Run[] => STOPS.map((d) => runs.get(`${d}|gegen`)).filter((r): r is Run => !!r);
  const fitA = (): number | null => {
    const L = laborRuns();
    if (!L.length) return null;
    let num = 0,
      den = 0;
    for (const r of L) {
      num += sig(r) * r.z * r.z;
      den += r.z ** 4;
    }
    return num / den;
  };
  const fmtSigma = (mm: number): string => (mm >= 10 ? `${ctx.i18n.num(mm / 10, 1)} cm` : `${ctx.i18n.num(mm, 1)} mm`);
  const sigma6 = (): number | null => {
    const r = runs.get('6|labor');
    if (r) return sig(r);
    const a = fitA();
    return a != null ? a * 36 : null;
  };
  const backFactor = (): number | null => {
    const g = gegenRuns()[0];
    if (!g) return null;
    const l = runs.get(`${g.z}|labor`);
    const ref = l ? sig(l) : (fitA() ?? SIGMA1_MM) * g.z * g.z;
    return ref > 0 ? sig(g) / ref : null;
  };

  function kennSpec(): KennlinieSpec {
    const L = laborRuns(),
      G = gegenRuns();
    const a = fitA();
    const s6 = runs.get('6|labor');
    const line = (k: number): [number, number][] => Array.from({ length: 21 }, (_, i) => [i * 0.5, k * (i * 0.5) ** 2] as [number, number]);
    const ys = [...L.map(sig), ...G.map(sig), 170, ...(G.length ? [Math.max(...G.map((r) => SIGMA1_MM * BACKLIGHT * r.z * r.z))] : [])];
    return {
      title: sd.text('rail.kTitle'),
      xLabel: sd.text('rail.kX'),
      yLabel: sd.text('rail.kY'),
      chip: 'sim',
      xMin: 0,
      xMax: 10,
      yMin: 0,
      yMax: Math.ceil(Math.max(...ys) / 50) * 50,
      keyValue: s6 ? ctx.t('rail.key', { s: fmtSigma(sig(s6)) }) : undefined,
      series: [
        { id: 'labor', label: sd.text('rail.sLabor'), points: L.map((r) => [r.z, sig(r)] as [number, number]), color: css.text },
        { id: 'gegen', label: sd.text('rail.sGegen'), points: G.map((r) => [r.z, sig(r)] as [number, number]), color: css.orangeLight },
        { id: 'model', label: sd.text('rail.sModel'), line: line(SIGMA1_MM), dashed: true, color: css.teal },
        ...(G.length ? [{ id: 'gmodel', line: line(SIGMA1_MM * BACKLIGHT), dashed: true, color: css.orangeLight }] : []),
        ...(a != null && L.length >= 2 ? [{ id: 'fit', label: ctx.t('rail.sFit', { a: ctx.i18n.num(a, 2) }), line: line(a), color: css.textSecondary }] : []),
      ],
    };
  }

  const COLORS: Record<number, string> = { 1: css.text, 3: css.teal, 6: css.orangeLight, 9: css.textSecondary };
  const drawHisto = (): void => {
    if (!histo) return;
    const g = histo.getContext('2d')!;
    const dpr = histo.width / histo.clientWidth || 1;
    const w = histo.width / dpr,
      h = histo.height / dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const pad = 4,
      base = h - 14;
    const bw = (w - pad * 2) / BINS;
    g.strokeStyle = css.borderSubtle;
    g.beginPath();
    g.moveTo(pad, base + 0.5);
    g.lineTo(w - pad, base + 0.5);
    g.moveTo(w / 2, 4);
    g.lineTo(w / 2, base);
    g.stroke();
    g.font = '9px "Geist Mono", monospace';
    g.fillStyle = css.textMuted;
    g.textAlign = 'center';
    for (const mm of [-600, -300, 0, 300, 600]) g.fillText(String(mm), w / 2 + (mm / BIN_MM) * bw, h - 3);
    const all = [...runs.values()];
    if (current) all.push(current.run);
    const maxC = 30;
    for (const r of all) {
      const counts = new Array(BINS).fill(0);
      for (const e of r.errs) counts[binOf(e)]++;
      g.strokeStyle = r.light === 'gegen' ? css.warning : COLORS[r.z] ?? css.text;
      g.lineWidth = r === current?.run ? 2 : 1.2;
      g.globalAlpha = r === current?.run ? 1 : 0.75;
      g.beginPath();
      for (let i = 0; i < BINS; i++) {
        const x = pad + i * bw;
        const y = base - (Math.min(counts[i], maxC) / maxC) * (base - 6);
        if (i === 0) g.moveTo(x, base);
        g.lineTo(x, y);
        g.lineTo(x + bw, y);
      }
      g.lineTo(w - pad, base);
      g.stroke();
    }
    g.globalAlpha = 1;
  };
  const binOf = (e: number): number => THREE.MathUtils.clamp(Math.round(e / BIN_MM) + (BINS - 1) / 2, 0, BINS - 1);

  const refreshAll = (): void => {
    const s = spec();
    screen.update(s);
    panelK?.update(s);
    drawHisto();
    ui?.refresh();
  };
  refreshAll();
  ctx.i18n.onChange(refreshAll);

  const statusText = (): string => `// ${ctx.t('messstrecke.title').toUpperCase()} · ${carD} m · ${ctx.t(light === 'labor' ? 'rail.labor' : 'rail.gegen').toUpperCase()}`;
  const setDistance = (d: number): void => {
    if (current || reach) return;
    targetD = d;
    // EMI-02 rides along beside the carriage
    if (operating) void parkEmi(d);
    ctx.audio.play('click');
    dots.count = 0;
    dots.instanceMatrix.needsUpdate = true;
    ui?.refresh();
  };
  const setLight = (l: Light): void => {
    if (current) return;
    light = l;
    ctx.audio.play('click');
    if (l === 'gegen') ctx.audio.tone({ freq: 90, to: 120, dur: 0.3, type: 'sawtooth', volume: 0.25, at: [X, 2, lampZ] });
    lampFaceMat.emissiveIntensity = l === 'gegen' ? 7 : 0.05;
    lampFaceMat.color.set(l === 'gegen' ? 0xfff1dc : 0x292524);
    cone.visible = l === 'gegen';
    coneMat.uniforms.uA.value = l === 'gegen' ? 1 : 0;
    ui?.refresh();
    if (operating) ctx.ui.status(() => statusText());
  };
  const moving = (): boolean => carD !== targetD;
  // PT-16: a measurement asked for while the carriage still drives starts when it stops (not silently dropped)
  let measureQueued = false;

  const measure = async (): Promise<void> => {
    if (current || reach) return;
    if (moving()) {
      if (!measureQueued) {
        measureQueued = true;
        ctx.ui.hint(sd.text('rail.queued'), 2.5);
      }
      return;
    }
    if (!saidStart) {
      saidStart = true;
      sd.say('emi.cStart');
    }
    if (predicted == null) {
      predicted = await ctx.ui.predict({ question: sd.text('rail.predict'), unit: 'mm', min: 2, max: 150, step: 1, scale: 'log', initial: 12, digits: 0 });
      ctx.progress.set('predicted', predicted);
    }
    if (current || moving()) return;
    const run: Run = { z: targetD, light, errs: [], drop: 0, seq: [] };
    current = { run, i: 0, acc: 0 };
    dots.count = 0;
    ui?.refresh();
  };

  const finishRun = (): void => {
    if (!current) return;
    const r = current.run;
    current = null;
    runs.set(`${r.z}|${r.light}`, r);
    ctx.progress.set('runs', [...runs.values()].map(({ seq: _s, ...rest }) => rest));
    refreshAll();
    checkAward();
    judge();
    // the consequence (plan §4.2): EMI-02 reaches ten times where the first ten readings put the test body
    startReach(r);
  };

  const checkAward = (): void => {
    if (done) return;
    if (laborRuns().length < 3 || gegenRuns().length < 1) return;
    award();
  };

  const award = (): void => {
    done = true;
    ui?.refresh();
    const s6 = sigma6() ?? 72;
    const g = backFactor() ?? BACKLIGHT;
    ctx.pass.recordPrediction('messstrecke', predicted ?? 12, s6, { min: 2, max: 150, scale: 'log' });
    const curve = STOPS.map((d) => runs.get(`${d}|labor`)).map((r) => (r ? Math.round(sig(r) * 10) / 10 : 0));
    const de = `σ(6 m) = ${(s6 / 10).toFixed(1).replace('.', ',')} cm · Gegenlicht ×${g.toFixed(1).replace('.', ',')}`;
    const en = `σ(6 m) = ${(s6 / 10).toFixed(1)} cm · backlight ×${g.toFixed(1)}`;
    ctx.pass.award('messstrecke', { value: { de, en }, curve });
    ctx.pass.awardQuestion(9);
    ctx.pass.setBest('sensordom.sigma6', Math.round(s6 * 10) / 10, 'lower');
    sd.say('emi.cDone');
    void sd.emi.gesture('nod');
    sd.refreshObjective();
    ctx.game.juice.burst([X, RAIL.y, carZ], { tone: 'teal', count: 60, spread: 0.8 });
    ctx.game.juice.cue('great');
    ui?.refresh();
  };

  // ── EMI-02 rides along and reaches (plan §4.2): ten reaches per run at 2×, ≤ 10 s ─────────────
  const REACH_S = REACH.seconds;
  const emiSpot = (z: number): THREE.Vector3 => new THREE.Vector3(X - 0.98, 0, z);
  let reach: null | { r: Run; t: number; hits: boolean[]; offs: number[]; shown: number; grips: number } = null;
  let emiParked = false;
  let camT = 0;
  const _hand = new THREE.Vector3();
  const testHome = testBody.position.clone();
  /** EMI-02 drives beside the carriage's stop (it rides along when the distance changes) */
  const parkEmi = async (d: number): Promise<void> => {
    const at = emiSpot(zOf(d));
    await sd.emi.driveTo([at.x, 0, at.z], { speed: REACH.driveSpeed });
    // face the plate (+x) and line the right shoulder up with the test body
    sd.emi.object.rotation.y = Math.PI / 2;
    const sh = sd.emi.joints['shoulder_pitch_r'];
    if (sh) {
      ctx.toLocal(sh.getWorldPosition(_hand), _hand);
      sd.emi.object.position.z += zOf(d) - _hand.z;
    }
    emiParked = true;
  };
  const startReach = (r: Run): void => {
    const seq = r.seq ?? [];
    const hits: boolean[] = [];
    const offs: number[] = [];
    for (let i = 0; i < REACH.count; i++) {
      const e = seq[i];
      const ok = e != null && Number.isFinite(e) && Math.abs(e) <= GRIP_TOL_MM;
      hits.push(ok);
      // a miss aims where the reading said (a dropout: a reach into nowhere)
      offs.push(e == null || !Number.isFinite(e) ? (i % 2 ? 1 : -1) * 160 : e);
    }
    reach = { r, t: -REACH.leadS, hits, offs, shown: -1, grips: 0 };
    ctx.game.unattended(true, 'messstrecke');
    void parkEmi(r.z);
    ui?.refresh();
  };
  const finishReach = (): void => {
    if (!reach) return;
    const { r, grips } = reach;
    reach = null;
    for (const j of ['shoulder_pitch_r', 'elbow_r', 'wrist_pitch_r', 'wrist_roll_r', 'waist_yaw']) sd.emi.releaseJoint(j);
    testBody.position.copy(testHome);
    reaches.set(`${r.z}|${r.light}`, grips);
    ctx.progress.set('reaches', [...reaches.entries()]);
    lastReach = { z: r.z, light: r.light, grips };
    const safe = grips >= REACH.safeGrips;
    ctx.game.juice.popup([X - 0.4, RAIL.y + 0.55, zOf(r.z)], sd.text('game.c.reachPop', { n: grips, k: REACH.count }), { tone: safe ? 'teal' : 'muted', seconds: REACH.popupS });
    ctx.game.juice.cue(safe ? 'good' : 'oops', { at: [X, RAIL.y, zOf(r.z)] });
    if (safe) ctx.game.juice.burst([X - 0.36, RAIL.y, zOf(r.z)], { tone: 'teal', count: 22, spread: 0.3 });
    // one line per light the first time EMI misses: the consequence, said once
    const k = `said-${r.light}`;
    if (!safe && !ctx.progress.get(k, false)) {
      ctx.progress.set(k, true);
      sd.say(r.light === 'gegen' ? 'emi.cMissGegen' : 'emi.cMiss', { d: r.z });
    }
    ctx.game.unattended(false, 'messstrecke');
    refreshAll();
  };
  const stepReach = (dt: number): void => {
    if (!reach) return;
    const fast = operating && ctx.input.isDown('Space') ? REACH.fast : 1;
    reach.t += dt * fast;
    if (reach.t < 0 || !emiParked) return;
    const i = Math.floor(reach.t / REACH_S);
    if (i >= REACH.count) return finishReach();
    const u = (reach.t - i * REACH_S) / REACH_S;
    const hit = reach.hits[i];
    // the arm: out (0–0.45), close (0.45–0.55), lift on a grip, back (0.65–1)
    const out = u < 0.45 ? u / 0.45 : u < 0.65 ? 1 : 1 - (u - 0.65) / 0.35;
    const e = out * out * (3 - 2 * out);
    sd.emi.setJoint('shoulder_pitch_r', -0.12 + (-1.45 + 0.12) * e);
    sd.emi.setJoint('elbow_r', -0.35 + (0.27 * e));
    sd.emi.setJoint('wrist_pitch_r', 0.1 * e);
    // aim along the rail by the reading's error (a miss lands beside the body; ±0,25 m at most)
    const off = THREE.MathUtils.clamp(reach.offs[i] / 1000, -0.25, 0.25);
    sd.emi.setJoint('waist_yaw', -Math.atan2(off, 0.62) * e);
    sd.emi.setJoint('wrist_roll_r', u > 0.45 && u < 0.65 ? 0.5 : 0);
    if (i !== reach.shown && u > 0.5) {
      reach.shown = i;
      const at: [number, number, number] = [X - 0.36, RAIL.y + 0.2, carZ + off];
      if (hit) {
        reach.grips++;
        ctx.game.juice.popup(at, '✓', { tone: 'teal', seconds: REACH.tickS });
        ctx.audio.play('grab', { at, pitch: 1.2, volume: 0.6 });
      } else {
        ctx.game.juice.popup(at, '✗', { tone: 'muted', seconds: REACH.tickS });
        ctx.audio.tone({ freq: 520, to: 260, dur: 0.18, type: 'sine', volume: 0.25, at });
      }
      ui?.refresh();
    }
    // a grip lifts the body a little, then sets it down again
    if (hit && u > 0.5 && u < 0.85) testBody.position.set(testHome.x, testHome.y + REACH.lift * Math.sin(((u - 0.5) / 0.35) * Math.PI), testHome.z);
    else testBody.position.copy(testHome);
  };

  // ── operate mode ────────────────────────────────────────────────────────
  // the console view along the rail; during EMI-02's reaches the camera turns to the plate from the side
  const CON_POS = new THREE.Vector3(X - 0.95, 2.05, S + 1.05);
  const CON_LOOK = new THREE.Vector3(X + 0.25, 0.9, zOf(6.2));
  const qCon = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(CON_POS, CON_LOOK, new THREE.Vector3(0, 1, 0)));
  const _cp = new THREE.Vector3();
  const _cl = new THREE.Vector3();
  const _qr = new THREE.Quaternion();
  const _mr = new THREE.Matrix4();
  const operate = (): void => {
    operating = true;
    camT = 0;
    sd.setMode('rgb', true);
    ctx.ui.status(() => statusText());
    // EMI-02 comes over and waits beside the carriage
    void parkEmi(targetD);
    ctx.player.enterOperate({
      title: sd.text('rail.title'),
      cameraPose: { position: [CON_POS.x, CON_POS.y, CON_POS.z], lookAt: [CON_LOOK.x, CON_LOOK.y, CON_LOOK.z] },
      panelPosition: 'right',
      capture: {
        keys: [],
        camera(out) {
          const k = camT * camT * (3 - 2 * camT);
          // side view of EMI-02's reach at the carriage
          _cp.set(X - 2.35, 1.75, carZ + 1.9);
          _cl.set(X - 0.55, 1.12, carZ - 0.1);
          _qr.setFromRotationMatrix(_mr.lookAt(_cp, _cl, _cl.clone().set(0, 1, 0)));
          out.position.lerpVectors(CON_POS, _cp, k);
          out.quaternion.slerpQuaternions(qCon, _qr, k);
        },
      },
      panel: (el, exit) => {
        el.classList.add('sensordom-rail');
        const h = (tag: string, cls = '', text = ''): HTMLElement => {
          const e = document.createElement(tag);
          if (cls) e.className = cls;
          if (text) e.textContent = text;
          return e;
        };
        const eyebrow = h('div', 'eyebrow');
        const segD = h('div', 'seg');
        const segL = h('div', 'seg');
        const go = h('button', 'btn primary') as HTMLButtonElement;
        go.onclick = () => void measure();
        const leave = h('button', 'btn ghost') as HTMLButtonElement;
        leave.onclick = exit;
        const prog = h('div', 'mono');
        prog.style.cssText = 'font-size:11px;color:var(--text-2);margin:6px 0 2px';
        const last = h('div', 'mono');
        last.style.cssText = 'font-size:12px;margin:2px 0 6px;min-height:16px';
        const hl = h('div', 'mono');
        hl.style.cssText = 'font-size:10px;color:var(--text-3);margin-bottom:2px';
        histo = document.createElement('canvas');
        const HW = 330,
          HH = 78;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        histo.width = HW * dpr;
        histo.height = HH * dpr;
        histo.style.cssText = `width:${HW}px;height:${HH}px;display:block`;
        const chips = h('div');
        chips.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;align-items:center';
        const row = (label: string, ...kids: HTMLElement[]): HTMLElement => {
          const r = h('div', 'op-row');
          r.style.cssText = 'display:flex;gap:8px;align-items:center;margin:6px 0';
          const l = h('div', 'mono', label);
          l.style.cssText = 'font-size:11px;color:var(--text-3);width:72px';
          r.append(l, ...kids);
          return r;
        };
        const rD = row('');
        const rL = row('');
        const rG = h('div');
        rG.style.cssText = 'display:flex;gap:8px;margin:8px 0 2px';
        const info = h('button', 'btn ghost', 'ⓘ') as HTMLButtonElement;
        info.title = ctx.t('card.c.title');
        info.onclick = () => {
          showInfo = !showInfo;
          ui?.refresh();
        };
        rG.append(go, leave, info);
        // EMI-02's ten reaches: „8/10“ with its chip (SIM · LIVE), the tolerance behind its chip
        const grip = h('div', 'mono');
        grip.style.cssText = 'font-size:12.5px;margin:2px 0 4px;min-height:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
        const goalChips = ch.chips();
        goalChips.style.margin = '6px 0 2px';
        const details = h('div');
        details.append(hl, histo);
        const kWrap = h('div');
        // ≤ 35 words at open (plan §4): the operate bar names the station, no eyebrow in the panel
        eyebrow.style.display = 'none';
        el.append(eyebrow, goalChips, rD, rL, rG, prog, last, grip, details, kWrap);
        panelK = ctx.ui.kennlinie(spec(), { parent: kWrap, width: 330, height: 168 });
        el.append(chips);
        ui = {
          refresh() {
            eyebrow.textContent = ctx.t('rail.title');
            (rD.firstChild as HTMLElement).textContent = ctx.t('rail.distance');
            (rL.firstChild as HTMLElement).textContent = ctx.t('rail.light');
            segD.replaceChildren(
              ...STOPS.map((d) => {
                const b = h('button', d === targetD ? 'on' : '', `${d}`);
                b.onclick = () => setDistance(d);
                return b;
              }),
            );
            segL.replaceChildren(
              ...(['labor', 'gegen'] as Light[]).map((l) => {
                const b = h('button', l === light ? 'on' : '', ctx.t(l === 'labor' ? 'rail.labor' : 'rail.gegen'));
                b.onclick = () => setLight(l);
                return b;
              }),
            );
            if (!rD.contains(segD)) rD.append(segD);
            if (!rL.contains(segL)) rL.append(segL);
            go.textContent = current ? ctx.t('rail.running', { i: current.i }) : reach ? ctx.t('rail.reaching', { i: Math.max(0, reach.shown + 1), k: REACH.count }) : moving() ? ctx.t('rail.moving') : ctx.t('rail.measure');
            // PT-16: while the carriage drives the button queues the run (it starts on arrival)
            go.disabled = !!current || !!reach;
            leave.textContent = ctx.t('rail.exit');
            prog.style.display = runs.size ? '' : 'none';
            kWrap.style.display = runs.size || current ? '' : 'none';
            prog.textContent = `${done ? '✓ ' : ''}${ctx.t('rail.progress', { l: Math.min(3, laborRuns().length), g: Math.min(1, gegenRuns().length) })}`;
            last.textContent = lastText;
            const shownReach = reach ? { z: reach.r.z, light: reach.r.light, grips: reach.grips, n: reach.shown + 1 } : lastReach ? { ...lastReach, n: REACH.count } : null;
            grip.replaceChildren();
            grip.style.display = shownReach ? 'flex' : 'none';
            if (shownReach) {
              const t = h('span', '', ctx.t('game.c.reachLine', { n: shownReach.grips, k: shownReach.n, d: shownReach.z }));
              t.style.color = !reach && shownReach.grips >= 9 ? 'var(--teal)' : 'var(--text)';
              grip.append(t, ctx.ui.chip('sim', sd.text('game.c.tol')));
            }
            hl.textContent = ctx.t('rail.histo');
            details.style.display = showInfo ? '' : 'none';
            info.classList.toggle('on', showInfo);
            // the Kennlinie carries its own SIM · LIVE chip: the extra one only while the chart is hidden
            const kShown = runs.size > 0 || !!current;
            chips.replaceChildren(...(kShown ? [] : [ctx.ui.chip('sim', sd.text('rail.chip'))]), ...(showInfo ? [ctx.ui.chip('illustrativ', sd.text('card.c.model')), h('span', 'mono', ctx.t('card.c.model'))] : []));
            if (showInfo) (chips.lastChild as HTMLElement).style.cssText = 'font-size:10.5px;color:var(--text-3);line-height:1.35';
          },
        };
        ui.refresh();
        drawHisto();
        return () => {
          panelK?.remove();
          panelK = null;
          histo = null;
          ui = null;
        };
      },
      onExit: () => {
        operating = false;
        ctx.ui.status(null);
        // back in the dome: the visor's status line returns
        ctx.events.emit('sensordom:status-refresh');
      },
    });
    ctx.ui.hint(sd.text('rail.hint'), 5);
  };
  ctx.addInteractable({ object: knob, label: sd.text('rail.console'), onInteract: operate, range: 2.6, isEnabled: () => !ctx.player.operating });
  // Z3: R only ever means retry; the measurement run is Space (or the panel's button)
  ctx.input.onKey(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyL', 'Space'], (code) => {
    if (!operating) return;
    if (code === 'KeyL') setLight(light === 'labor' ? 'gegen' : 'labor');
    else if (code === 'Space') void measure();
    else setDistance(STOPS[Number(code.slice(5)) - 1]);
  }, { whileOperating: true });

  /** the test hooks: runs drawn from the model at once, EMI-02's reaches counted from their first ten readings */
  const instantRuns = (lab: number[], gegen: number[]): void => {
    for (const [l, list] of [['labor', lab], ['gegen', gegen]] as [Light, number[]][])
      for (const d of list) {
        const g = l === 'gegen';
        const r: Run = { z: d, light: l, errs: [], drop: 0, seq: [] };
        for (let i = 0; i < N; i++) {
          if (Math.random() < dropoutP(d, g)) (r.drop++, r.seq!.push(NaN));
          else {
            const e = gauss() * sigmaMm(d, g);
            r.errs.push(e);
            r.seq!.push(e);
          }
        }
        runs.set(`${d}|${l}`, r);
        reaches.set(`${d}|${l}`, r.seq!.slice(0, REACH.count).filter((e) => Number.isFinite(e) && Math.abs(e) <= GRIP_TOL_MM).length);
      }
    ctx.progress.set('runs', [...runs.values()].map(({ seq: _s, ...rest }) => rest));
    ctx.progress.set('reaches', [...reaches.entries()]);
  };
  return {
    get operating() {
      return operating;
    },
    state: () => ({ carD, targetD, light, running: !!current, runs: [...runs.keys()], predicted }),
    fixedUpdate(dt) {
      if (carD !== targetD) {
        const step = SPEED * dt;
        carD = Math.abs(targetD - carD) <= step + 1e-6 ? targetD : carD + Math.sign(targetD - carD) * step;
        carZ = zOf(carD);
        if (!moving()) {
          ctx.audio.play('thud', { volume: 0.4, at: [X, 0.3, carZ] });
          ui?.refresh();
          if (operating) ctx.ui.status(() => statusText());
          if (measureQueued) {
            measureQueued = false;
            if (operating) void measure();
          }
        }
      }
      kin.setPose([X, 0, carZ]);
    },
    update(dt) {
      plateCollider.setTranslation({ x: X, y: 1.2, z: carZ });
      if (beamMat.opacity > 0) beamMat.opacity = Math.max(0, beamMat.opacity - dt * 5);
      // EMI-02's reaches, and the camera turning to the plate for them (a cut under reduced motion)
      stepReach(dt);
      const wantCam = reach && emiParked && reach.t > -0.3 ? 1 : 0;
      camT = ctx.settings.reducedMotion ? wantCam : wantCam ? Math.min(1, camT + dt / 0.6) : Math.max(0, camT - dt / 0.6);
      if (!current) return;
      current.acc += dt * RATE;
      while (current && current.acc >= 1) {
        current.acc -= 1;
        const r = current.run;
        const gegen = r.light === 'gegen';
        if (Math.random() < dropoutP(r.z, gegen)) {
          r.drop++;
          r.seq?.push(NaN);
          sd.sound.dropout();
          lastText = `#${current.i + 1} · ${ctx.t('rail.dropout')}`;
        } else {
          const e = gauss() * sigmaMm(r.z, gegen);
          r.errs.push(e);
          r.seq?.push(e);
          sd.sound.tick(binOf(e), BINS);
          lastText = `#${current.i + 1} · z = ${ctx.i18n.num(r.z + e / 1000, 3)} m (${e >= 0 ? '+' : '−'}${ctx.i18n.num(Math.abs(e), 1)} mm)`;
          // dot at the measured depth: lateral spread over the plate, depth = reading
          const k = Math.min(dots.count, DOTS - 1);
          tmpV.set(X + (Math.random() - 0.5) * 0.5, RAIL.y + (Math.random() - 0.5) * 0.5, carZ + 0.012 - e / 1000);
          m4.makeTranslation(tmpV.x, tmpV.y, tmpV.z);
          dots.setMatrixAt(k, m4);
          dots.count = Math.min(DOTS, dots.count + 1);
          dots.instanceMatrix.needsUpdate = true;
          beamPos[0] = X;
          beamPos[1] = RAIL.y;
          beamPos[2] = S + 0.04;
          beamPos[3] = tmpV.x;
          beamPos[4] = tmpV.y;
          beamPos[5] = tmpV.z;
          beamGeo.attributes.position.needsUpdate = true;
          beamMat.opacity = 0.9;
        }
        current.i++;
        drawHisto();
        ui?.refresh();
        if (current.i >= N) finishRun();
      }
    },
    solve() {
      // a plain ★ (stamp) result: three lab series that miss the limit's bracket (1, 6, 9 m) and one
      // backlight series (6 m); EMI-02's reaches are recorded instantly
      instantRuns([1, 6, 9], [6]);
      predicted = predicted ?? 12;
      refreshAll();
      checkAward();
      judge();
    },
    stars3() {
      // both limits bracketed: the lab at 3 and 6 m, the backlight at 1 and 3 m
      instantRuns([1, 3, 6, 9], [1, 3, 6]);
      predicted = predicted ?? 12;
      refreshAll();
      checkAward();
      judge();
    },
  };
}

function mergeBoxes(list: [[number, number, number], [number, number, number]][]): THREE.BufferGeometry {
  const pos: number[] = [],
    nor: number[] = [];
  for (const [s, p] of list) {
    const g = new THREE.BoxGeometry(s[0], s[1], s[2]).translate(p[0], p[1], p[2]).toNonIndexed();
    const a = g.getAttribute('position'),
      n = g.getAttribute('normal');
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

function cardC(sd: Sd, runs: Map<string, Run>, s6: number, g: number, nG: number, predicted: number | null): InfoCardSpec {
  const { ctx } = sd;
  const r1 = runs.get('1|labor');
  const s1 = r1 ? sampleStd(r1.errs) : null;
  const fmt = (mm: number): string => (mm >= 10 ? `${ctx.i18n.num(mm / 10, 1)}` : ctx.i18n.num(mm, 1));
  const unit = (mm: number): string => (mm >= 10 ? 'cm' : 'mm');
  const s6t = `${fmt(s6)} ${unit(s6)}`;
  const gt = ctx.i18n.num(g, 1);
  const befund = {
    title: sd.text('card.c.befund'),
    bullets: [sd.text('card.c.b1'), sd.text('card.c.b2', { s6: s6t, g: gt }), sd.text('card.c.b3'), sd.text('card.c.b4')],
  };
  return {
    eyebrow: sd.text('card.c.eyebrow'),
    title: sd.text('card.c.title'),
    body: sd.text('card.c.body'),
    illustrative: true,
    // the numbers are the player's own SIM · LIVE readings from the toy model, not example values
    illustrativeNote: sd.text('card.c.illusNote'),
    metrics: [
      ...(s1 != null ? [{ label: sd.text('card.c.m1'), value: fmt(s1), unit: unit(s1) }] : []),
      { label: sd.text('card.c.m6'), value: fmt(s6), unit: unit(s6), note: predicted != null ? { de: `getippt: ${Math.round(predicted)} mm`, en: `predicted: ${Math.round(predicted)} mm` } : undefined },
      // the measured factor scatters (≈ 21 valid readings: 95 % of runs land between ×1.6 and ×3.7):
      // show the model value and n beside it
      { label: sd.text('card.c.mg'), value: `×${gt}`, note: sd.text('card.c.mgNote', { g: ctx.i18n.num(BACKLIGHT, 1), n: nG }) },
    ],
    // Entdecker: concept + „Für Neugierige“; Entscheider: concept + Befundkarte (GDD §3)
    entdecker: { bullets: [sd.text('card.c.curious'), sd.text('card.c.model')] },
    entscheider: { bullets: [sd.text('card.c.model')], forDecisionMakers: befund },
  };
}
