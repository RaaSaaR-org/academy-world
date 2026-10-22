/**
 * Station B, decision 3 „Rechnet sich das?“ — Amortisationswaage (GDD §7.5 B; plan §4.6: one wall,
 * three decisions: its controls sit on the Schichtplan panel, roster.ts, and the camera turns to the beam
 * while it runs; optional for ★, needed for ★★★). A 6-m beam on a pivot at y = 3 at
 * (−8, 0, −1). Left pan: the CAPEX blocks (1 k€ = 1 kg, concrete counterweights, edge length from
 * ρ = 2,400 kg/m³). Right pan: one block per simulated year (net value per year). Both pans hang
 * 3 m from the pivot, so torque = mass × 3 m on each side: the beam tips the moment the summed
 * years outweigh the purchase — exactly at the payback year (± one frame). Stops at ±12°.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { box, boxMM, canvasTex, cyl, merge, mesh, plane } from './geo';
import { BEAM_ARM_M, BEAM_STOP_DEG, CAPEX, CAPEX_TOTAL, DEFAULT_COVERAGE, FTE_K, OPEX_MAINT, OPEX_SUPERVISION, OPEX_TOTAL, OPEX_WEAR, annualNet, paybackYears } from './sim';

const PIVOT = new THREE.Vector3(-8, 3, -1);
const HANG = 1.55; // pan below the beam end
const RUN_YEARS = 6;
const SEC_PER_YEAR = 1.25;
const DENSITY = 2400; // kg/m³, concrete
const STOP = THREE.MathUtils.degToRad(BEAM_STOP_DEG);
const edge = (kg: number): number => Math.cbrt(Math.max(0.05, kg) / DENSITY);

export interface Waage {
  readonly ranToYear6: boolean;
  readonly lastPayback: number;
  readonly lastShifts: number;
  readonly running: boolean;
  update(dt: number): void;
  /** „Rechnet sich das?“: run six years on the beam (from the Schichtplan panel) */
  run(): void;
  /** the assumptions (shifts, coverage) and the numbers with their chips, for the Schichtplan panel; re-rendered by `refresh` */
  controls(host: HTMLElement, refresh: () => void): void;
  /** the run's verdict for the panel (null before a run in this visit) */
  result(): { text: string; ok: boolean } | null;
  /** a fresh visit of the panel: the verdict line waits for the next run (≤ 35 words at open) */
  freshVisit(): void;
  /** debug: run instantly */
  runInstant(shifts: number): void;
  setPost(name: string): void;
  setCoverage(c: number, fromNight: boolean): void;
  onDone: ((r: { payback: number; shifts: number; coverage: number }) => void) | null;
  /** the beam tipped: payback year, where to show it (local) */
  onTip: ((payback: number, at: THREE.Vector3) => void) | null;
  setDim(dark: boolean): void;
}

/** coverage options on the panel (FUN-PLAN D2 ★★★: the business case depends on its assumptions) */
const COVERAGES = [0.4, 0.6, 0.8, 1.0] as const;

export function buildWaage(ctx: ZoneContext, sound: { creak(): void; clunk(): void; thud(a?: THREE.Vector3Like, v?: number): void }): Waage {
  const M = ctx.materials;
  const det = ctx.groups.detail;
  const tr = (k: string, p?: Record<string, string | number>): string => ctx.t(`waage.${k}`, p);
  const n1 = (v: number): string => ctx.i18n.num(v, 1);
  const shWord = (n: number): string => (n === 1 ? tr('sh1') : tr('shN', { n }));

  // ── stand (A-frame) + pivot ──────────────────────────────────────────────
  const brass = M.standard({ color: 0x9a8a6c, roughness: 0.42, metalness: 0.8 });
  det.add(
    mesh(
      merge([
        box(0.16, 3.3, 0.16, PIVOT.x - 0.55, 1.5, PIVOT.z, 0, 0, -0.18),
        box(0.16, 3.3, 0.16, PIVOT.x + 0.55, 1.5, PIVOT.z, 0, 0, 0.18),
        boxMM(PIVOT.x - 1.2, 0, PIVOT.z - 0.5, PIVOT.x + 1.2, 0.12, PIVOT.z + 0.5),
        boxMM(PIVOT.x - 0.32, 2.9, PIVOT.z - 0.24, PIVOT.x + 0.32, 3.12, PIVOT.z + 0.24),
      ]),
      M.metalDark,
      { name: 'df:waage-stand' },
    ),
  );
  ctx.physics.addStaticBox({ size: [2.4, 1.0, 1.0], position: [PIVOT.x, 0.5, PIVOT.z], surface: 'metal' });
  // block shelf beside the stand
  det.add(mesh(merge([boxMM(-12.6, 0, -2.0, -11.8, 1.1, -0.2), boxMM(-12.7, 1.1, -2.1, -11.7, 1.16, -0.1)]), M.metalDark, { name: 'df:waage-shelf' }));
  ctx.physics.addStaticBox({ size: [1.0, 1.2, 2.0], position: [-12.2, 0.6, -1.1], surface: 'metal' });

  // ── beam (rotates about z) ───────────────────────────────────────────────
  const beam = new THREE.Group();
  beam.position.copy(PIVOT);
  det.add(beam);
  beam.add(
    mesh(
      merge([
        box(2 * BEAM_ARM_M + 0.3, 0.16, 0.12, 0, 0, 0),
        box(1.0, 0.5, 0.1, 0, 0.25, 0),
        cyl(0.14, 0.14, 0.34, 18, 0, 0, 0, Math.PI / 2, 0, 0),
        cyl(0.05, 0.05, 0.3, 10, -BEAM_ARM_M, 0, 0, Math.PI / 2, 0, 0),
        cyl(0.05, 0.05, 0.3, 10, BEAM_ARM_M, 0, 0, Math.PI / 2, 0, 0),
      ]),
      brass,
      { name: 'df:waage-beam' },
    ),
  );
  // pointer needle + scale arc on the stand
  const needle = mesh(box(0.03, 0.7, 0.03, 0, 0.35, 0.1), M.metalDark, { name: 'df:waage-needle' });
  beam.add(needle);
  const arc = new THREE.TorusGeometry(0.66, 0.014, 4, 24, THREE.MathUtils.degToRad(30));
  arc.rotateZ(THREE.MathUtils.degToRad(75));
  arc.translate(PIVOT.x, PIVOT.y, PIVOT.z + 0.1);
  det.add(mesh(arc, M.railing, { name: 'df:waage-arc' }));

  // ── pans (hang vertically) ───────────────────────────────────────────────
  const makePan = (): THREE.Group => {
    const g = new THREE.Group();
    g.add(
      mesh(
        merge([
          cyl(0.68, 0.62, 0.08, 32, 0, 0, 0),
          ...[0, 1, 2].map((k) => {
            const a = (k / 3) * Math.PI * 2;
            const bx = Math.cos(a) * 0.6,
              bz = Math.sin(a) * 0.6;
            const len = Math.hypot(bx, HANG, bz);
            const rod = cyl(0.012, 0.012, len, 4, 0, 0, 0);
            // tilt the rod from (bx, 0, bz) up to (0, HANG, 0)
            const dir = new THREE.Vector3(-bx, HANG, -bz).normalize();
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            rod.applyQuaternion(q);
            rod.translate(bx / 2, HANG / 2, bz / 2);
            return rod;
          }),
        ]),
        brass,
        { name: 'df:waage-pan' },
      ),
    );
    det.add(g);
    return g;
  };
  const panL = makePan();
  const panR = makePan();

  // CAPEX blocks (left pan) with labels from a small atlas
  const atlas = canvasTex(512, 256);
  ctx.onDispose(() => atlas.tex.dispose());
  const labelMat = new THREE.MeshBasicMaterial({ map: atlas.tex, transparent: true, toneMapped: false });
  ctx.onDispose(() => labelMat.dispose());
  const blockMat = M.standard({ color: 0x8a837d, roughness: 0.95, metalness: 0 });
  const capexEdges = CAPEX.map((c) => edge(c.k));
  const capexPos: [number, number][] = [
    [-0.22, -0.12],
    [0.24, -0.2],
    [0.18, 0.24],
    [-0.3, 0.3],
  ];
  // block order on the pan: cobot, integration, greifer, rechner
  const order = [0, 2, 1, 3];
  const blocks: THREE.BufferGeometry[] = [];
  const labels: THREE.BufferGeometry[] = [];
  order.forEach((ci, k) => {
    const e = capexEdges[ci];
    const [px, pz] = capexPos[k];
    blocks.push(box(e, e, e, px, 0.04 + e / 2, pz));
    // label on the front (+z) face, atlas quarter per item
    const lp = plane(Math.max(0.16, e * 0.92), Math.max(0.16, e * 0.92) * 0.5, px, 0.04 + e / 2, pz + e / 2 + 0.003);
    const uv = lp.getAttribute('uv') as THREE.BufferAttribute;
    const col = ci % 2,
      row = Math.floor(ci / 2);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) / 2, 1 - (row + 1 - uv.getY(i)) / 2);
    labels.push(lp);
  });
  const capexMesh = mesh(merge(blocks), blockMat, { name: 'df:capex-blocks' });
  const capexLabels = mesh(merge(labels), labelMat, { receive: false, name: 'df:capex-labels' });
  panL.add(capexMesh, capexLabels);
  const drawAtlas = (): void => {
    const g = atlas.g;
    g.clearRect(0, 0, 512, 256);
    CAPEX.forEach((c, i) => {
      const x = (i % 2) * 256,
        y = Math.floor(i / 2) * 128;
      g.fillStyle = '#e7e5e4';
      g.fillRect(x + 4, y + 4, 248, 120);
      g.fillStyle = '#1c1917';
      g.font = '700 46px "Space Grotesk", sans-serif';
      g.fillText(`${c.k} k€`, x + 16, y + 58);
      g.font = '500 20px "Geist Mono", monospace';
      g.fillStyle = '#44403c';
      g.fillText(ctx.t(`waage.capex.${c.id}Short`), x + 16, y + 96);
      g.fillStyle = c.chip === 'illustrativ' ? '#b45309' : '#57534e';
      g.font = '500 15px "Geist Mono", monospace';
      g.fillText(ctx.t(`waage.chip.${c.chip}`), x + 16, y + 116);
    });
    atlas.tex.needsUpdate = true;
  };
  drawAtlas();

  // year blocks (right pan): instanced, the current one grows through its year
  const yearGeo = new THREE.BoxGeometry(1, 1, 1);
  ctx.onDispose(() => yearGeo.dispose());
  const yearMat = M.standard({ color: 0x5eb5a8, roughness: 0.9, metalness: 0 });
  const years = new THREE.InstancedMesh(yearGeo, yearMat, RUN_YEARS + 1);
  years.count = 0;
  years.frustumCulled = false;
  panR.add(years);
  const yearSlots: [number, number][] = [
    [-0.28, -0.2],
    [0.08, -0.26],
    [0.34, 0.04],
    [-0.14, 0.2],
    [0.18, 0.32],
    [-0.38, 0.14],
    [0.0, 0.0],
  ];

  // display on the stand
  const disp = canvasTex(512, 160);
  ctx.onDispose(() => disp.tex.dispose());
  const dispMat = new THREE.MeshBasicMaterial({ map: disp.tex, toneMapped: false });
  ctx.onDispose(() => dispMat.dispose());
  const dispMesh = mesh(plane(1.6, 0.5, PIVOT.x, 1.75, PIVOT.z + 0.13), dispMat, { receive: false, name: 'df:waage-display' });
  det.add(dispMesh);
  det.add(mesh(box(1.7, 0.6, 0.06, PIVOT.x, 1.75, PIVOT.z + 0.09), M.panel, { name: 'df:waage-display-frame' }));

  // ── state ────────────────────────────────────────────────────────────────
  let shifts = 1;
  let coverage = DEFAULT_COVERAGE;
  let coverageFromNight = false;
  let nightShare: number | null = null;
  let postName = ctx.t('roster.post.palettieren');
  let running = false;
  let yearT = 0; // simulated years
  let theta = STOP; // left pan down (CAPEX heavier)
  let tipT = -1; // seconds since the tip started
  let tipped = false;
  let ranTo6 = false;
  let lastPayback = paybackYears(1, DEFAULT_COVERAGE);
  let ui: { refresh(): void } | null = null;
  let creakT = 0;

  const drawDisplay = (): void => {
    const g = disp.g;
    g.fillStyle = '#121110';
    g.fillRect(0, 0, 512, 160);
    g.fillStyle = '#a8a29e';
    g.font = '500 16px "Geist Mono", monospace';
    g.fillText(tr('dispEyebrow'), 18, 28);
    const pb = paybackYears(shifts, coverage);
    g.fillStyle = '#f5f5f4';
    g.font = '700 46px "Space Grotesk", sans-serif';
    g.fillText(`${tr('year')} ${n1(Math.min(yearT, RUN_YEARS))}`, 18, 84);
    g.fillStyle = tipped ? '#ff8534' : '#a8a29e';
    g.font = '500 18px "Geist Mono", monospace';
    g.fillText(tipped ? tr('dispTipped', { y: n1(pb) }) : tr('dispSum', { s: Math.round(Math.max(0, annualNet(shifts, coverage)) * Math.min(yearT, RUN_YEARS)), c: CAPEX_TOTAL }), 18, 118);
    g.fillStyle = '#78716c';
    g.font = '500 14px "Geist Mono", monospace';
    g.fillText(tr('dispFoot', { sh: shWord(shifts), c: Math.round(coverage * 100) }), 18, 146);
    disp.tex.needsUpdate = true;
  };

  const placePans = (): void => {
    beam.rotation.z = theta;
    const c = Math.cos(theta),
      s = Math.sin(theta);
    panL.position.set(PIVOT.x - BEAM_ARM_M * c, PIVOT.y - BEAM_ARM_M * s - HANG, PIVOT.z);
    panR.position.set(PIVOT.x + BEAM_ARM_M * c, PIVOT.y + BEAM_ARM_M * s - HANG, PIVOT.z);
  };
  placePans();

  const _m = new THREE.Matrix4();
  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  const stackH = new Float32Array(yearSlots.length);
  const writeYears = (): void => {
    const net = annualNet(shifts, coverage);
    const full = Math.floor(Math.min(yearT, RUN_YEARS));
    const frac = Math.min(yearT, RUN_YEARS) - full;
    const e = edge(Math.max(1, net));
    let n = 0;
    stackH.fill(0);
    if (net > 0) {
      for (let i = 0; i < full + (frac > 0.001 ? 1 : 0) && n < RUN_YEARS + 1; i++) {
        const k = i < full ? 1 : frac;
        const slot = i % yearSlots.length;
        const h = e * k;
        _m.compose(_p.set(yearSlots[slot][0], 0.04 + stackH[slot] + h / 2, yearSlots[slot][1]), _q, _s.set(e, Math.max(0.002, h), e));
        stackH[slot] += h;
        years.setMatrixAt(n++, _m);
      }
    }
    years.count = n;
    years.instanceMatrix.needsUpdate = true;
  };

  let shownRun = false;
  const start = (): void => {
    shownRun = true;
    running = true;
    yearT = 0;
    tipT = -1;
    tipped = false;
    theta = STOP;
    lastPayback = paybackYears(shifts, coverage);
    sound.thud(undefined, 0.7);
    ui?.refresh();
  };

  const finish = (): void => {
    running = false;
    ranTo6 = true;
    api.onDone?.({ payback: lastPayback, shifts, coverage });
    ui?.refresh();
  };

  /** the assumptions on the Schichtplan panel: shifts and coverage (each with its chip), the numbers behind ⓘ */
  const controls = (el: HTMLElement, refresh: () => void): void => {
    ui = { refresh };
    const line = (host: HTMLElement, k: string, v: string, chip?: Parameters<typeof ctx.ui.chip>[0], src?: string): void => {
      const r = document.createElement('div');
      r.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12.5px;padding:2px 0;color:var(--text-2)';
      const a = document.createElement('span');
      a.textContent = k;
      const b = document.createElement('span');
      b.style.cssText = 'display:flex;gap:6px;align-items:center;font-family:var(--font-mono);color:var(--text);white-space:nowrap';
      b.append(document.createTextNode(v));
      if (chip) b.append(ctx.ui.chip(chip, src));
      r.append(a, b);
      host.append(r);
    };
    const segRow = (host: HTMLElement, label: string, seg: HTMLElement, chip?: HTMLElement): void => {
      const r = document.createElement('div');
      r.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin:2px 0 6px;gap:8px';
      const l = document.createElement('span');
      l.style.cssText = 'font-size:12.5px;color:var(--text-2);display:flex;gap:6px;align-items:center';
      l.append(document.createTextNode(label));
      if (chip) l.append(chip);
      r.append(l, seg);
      host.append(r);
    };
    const reset = (): void => {
      theta = STOP;
      yearT = 0;
      tipped = false;
      shownRun = false;
      placePans();
      writeYears();
      drawDisplay();
      ctx.audio.play('click');
      refresh();
    };
    const seg = document.createElement('div');
    seg.className = 'seg';
    for (const n of [1, 2, 3]) {
      const b = document.createElement('button');
      b.textContent = tr('shiftsN', { n });
      b.className = n === shifts ? 'on' : '';
      b.onclick = () => {
        if (running) return;
        shifts = n;
        reset();
      };
      seg.append(b);
    }
    segRow(el, tr('shifts'), seg);
    // coverage: the assumption behind the case (Richtwert 80 %, your own night share once measured)
    const cseg = document.createElement('div');
    cseg.className = 'seg';
    const opts: { c: number; night: boolean }[] = COVERAGES.map((c) => ({ c, night: false }));
    if (nightShare != null) opts.unshift({ c: nightShare, night: true });
    for (const o of opts) {
      const b = document.createElement('button');
      b.textContent = o.night ? `${ctx.t('game.b.covNight')} ${Math.round(o.c * 100)}` : `${Math.round(o.c * 100)}`;
      b.className = Math.abs(o.c - coverage) < 1e-6 && o.night === coverageFromNight ? 'on' : '';
      b.onclick = () => {
        if (running) return;
        coverage = o.c;
        coverageFromNight = o.night;
        reset();
      };
      cseg.append(b);
    }
    // chip by origin: your measured night share (SIM), the 80 % guide value (RICHTWERT), or a value you
    // chose to test the case (ILLUSTRATIV)
    const covChip = coverageFromNight ? ctx.ui.chip('sim', tr('src.night')) : Math.abs(coverage - DEFAULT_COVERAGE) < 1e-6 ? ctx.ui.chip('richtwert', tr('src.richtwert')) : ctx.ui.chip('illustrativ', ctx.t('game.b.covOwn'));
    segRow(el, `${ctx.t('game.b.cov')} %`, cseg, covChip);
    line(el, tr('capexShort'), `${CAPEX_TOTAL} k€`, 'richtwert', tr('src.richtwert'));
    line(el, tr('opex'), `${n1(OPEX_TOTAL)} k€`, 'illustrativ', `${tr('src.opex')} ${n1(OPEX_WEAR)} + ${n1(OPEX_MAINT)} + ${n1(OPEX_SUPERVISION)} k€.`);
    const body = document.createElement('div');
    body.style.cssText = 'margin-top:4px;line-height:1.5;font-size:12px;color:var(--text-2)';
    const p = (t: string, cls = ''): void => {
      const d = document.createElement('div');
      d.style.cssText = `margin-top:4px;${cls}`;
      d.textContent = t;
      body.append(d);
    };
    p(`${postName} · ${tr('cellNote')}`);
    line(body, tr('fte'), `${FTE_K} k€ (80–95)`, 'richtwert', tr('src.richtwert'));
    for (const c of CAPEX) line(body, tr(`capex.${c.id}`), c.range ? `${c.k} k€ (${c.range})` : `${c.k} k€`, c.chip, tr(`src.${c.chip}`));
    p(tr('formula', { n: shifts, c: Math.round(coverage * 100), o: n1(OPEX_TOTAL), v: n1(annualNet(shifts, coverage)) }), 'font-family:var(--font-mono);color:var(--text)');
    p(tr('note'));
    p(tr('curious'));
    el.append(body);
  };

  const api: Waage = {
    get ranToYear6() {
      return ranTo6;
    },
    get running() {
      return running;
    },
    run: () => {
      if (!running) start();
    },
    controls,
    freshVisit() {
      if (!running) shownRun = false;
    },
    result() {
      if (!shownRun || !(tipped || (!running && ranTo6)) || (running && !tipped)) return null;
      const pb = paybackYears(shifts, coverage);
      return pb <= 4
        ? { text: tr('payback', { y: n1(pb) }), ok: true }
        : { text: tr('noPilotShort', { sh: shWord(shifts), y: Number.isFinite(pb) ? n1(pb) : '∞' }), ok: false };
    },
    get lastPayback() {
      return lastPayback;
    },
    get lastShifts() {
      return shifts;
    },
    onDone: null,
    onTip: null,
    setDim(dark) {
      dispMat.color.setScalar(dark ? 0.12 : 1);
      labelMat.color.setScalar(dark ? 0.15 : 1);
    },
    setPost(name) {
      postName = name;
      ui?.refresh();
    },
    setCoverage(c, fromNight) {
      coverage = c;
      coverageFromNight = fromNight;
      if (fromNight) nightShare = c;
      lastPayback = paybackYears(shifts, coverage);
      drawDisplay();
      ui?.refresh();
    },
    runInstant(n) {
      shifts = n;
      start();
      yearT = RUN_YEARS;
      tipped = paybackYears(shifts, coverage) <= RUN_YEARS;
      theta = tipped ? -STOP : STOP;
      placePans();
      writeYears();
      drawDisplay();
      finish();
    },
    update(dt) {
      if (running) {
        const prev = yearT;
        yearT = Math.min(RUN_YEARS, yearT + dt / SEC_PER_YEAR);
        const pb = paybackYears(shifts, coverage);
        // the tip starts in the frame in which the summed years cross the CAPEX
        if (!tipped && prev < pb && yearT >= pb) {
          tipped = true;
          tipT = 0;
          sound.creak();
          ui?.refresh();
          api.onTip?.(pb, new THREE.Vector3(PIVOT.x, PIVOT.y + 0.6, PIVOT.z + 0.3));
        }
        if (Math.floor(yearT) !== Math.floor(prev)) sound.thud(undefined, 0.4);
        // done at year 6 once the beam has settled (tipT < 0: never tipped or bounce finished)
        if (yearT >= RUN_YEARS && (tipT < 0 || tipT > 1.2)) finish();
        writeYears();
        drawDisplay();
      }
      if (tipT >= 0) {
        // gravity-driven tip (constant angular acceleration) onto the right stop, then a damped bounce
        tipT += dt;
        const alpha = (2 * 2 * STOP) / (0.62 * 0.62); // reaches the opposite stop after 0.62 s
        const t = tipT;
        if (t < 0.62) theta = STOP - 0.5 * alpha * t * t;
        else {
          if (theta > -STOP + 1e-4 && t - dt < 0.62) sound.clunk();
          const tb = t - 0.62;
          theta = -STOP + THREE.MathUtils.degToRad(2.2) * Math.exp(-tb / 0.12) * Math.abs(Math.sin((tb * Math.PI * 2) / 0.24));
          if (tb > 1.4) {
            theta = -STOP;
            tipT = -1;
          }
        }
        placePans();
      } else if (!tipped && running) {
        // creak now and then while the right pan fills
        creakT -= dt;
        if (creakT <= 0) {
          creakT = 2.2;
          sound.creak();
        }
      }
    },
  };
  drawDisplay();
  writeYears();
  return api;
}
