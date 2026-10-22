/**
 * Sonnenacker B „Licht teilen“ (Verstehen; plan §4.10, R8 §2.2–§2.3). At the 1:20 Tagesmodell of
 * Sonnendach A (its own sun lamp, so the world's sun never moves):
 *   1. drag the lamp across the day by hand: the crop-light and kW gauges pull against each other
 *      (the toy of model.ts `gauges`, chip MODELL);
 *   2. choose the module density (3 steps), the tracking policy („Sonne zuerst“ / „Pflanze zuerst“) and
 *      the „Schutzstellung bei Hagel“;
 *   3. predict the tomato yield (the zone's one prediction), run the season in 10 s (Space = the result)
 *      with a hail front (FIKTION); the real modules of Sonnendach A swing into the Schutzstellung with a
 *      chorus of motors, or you hear the hail on the leaves;
 *   4. read crop light, tomato yield (the light rule's band, RICHTWERT), electricity, LER and the DIN check.
 * ★ a DIN-conform roof (crop band ≥ 66 %) · ★★ LER band ≥ 1,5 with the crop band ≥ 70 % · ★★★ the
 * prediction within ±5 points of the measured centre. Reduced motion: the season is a fade between two
 * stills; no lightning ever (flash-checked: __academy.ext('sequence:hail')).
 */
import * as THREE from 'three';
import type { InfoCardSpec } from '@/core/zones';
import { AGRIPV, BEDS, ROOFS, SITE, STARS } from './tuning';
import { TOK, box, merge, paint } from './look';
import { agriPv, gauges, type AgriResult, type Density, type Policy } from './model';
import type { Shared } from './shared';
import { button, chipCard, el, note, row, seg } from './ui';

export interface StationB {
  solve(): boolean;
  stars3(): boolean;
  readonly done: boolean;
  state(): unknown;
  update(dt: number): void;
  next(): 'sweep' | 'season' | 'done';
  readonly target: [number, number, number];
  /** the hail front for flash-check: run one season, resolve when it ends */
  hailSequence(): Promise<{ seconds: number; reducedMotion: boolean }>;
}

interface Saved {
  density: Density;
  policy: Policy;
  hailStow: boolean;
  /** how much of the day the lamp has seen (east, noon, west) */
  swept: [boolean, boolean, boolean];
  last: { pred: number; res: AgriResult } | null;
}

export function buildStationB(S: Shared): StationB {
  const { ctx, look, roof } = S;
  const T = ctx.i18n.text;
  const t = ctx.t;
  const st: Saved = { density: 1, policy: 'sonne', hailStow: false, swept: [false, false, false], last: null, ...ctx.progress.get<Partial<Saved>>('b', {}) };
  const persist = (): void => ctx.progress.set('b', st);
  const M = SITE.tagesmodell;
  const top = S.site.table.y;
  const k = M.scale;
  const cx = M.x,
    cz = M.z;

  // ── the model: six mini beds, their plant strips (grow and redden in the season), the lamp ─────
  {
    const parts: THREE.BufferGeometry[] = [paint(box(0.86, 0.012, 2.0, cx, top + 0.006, cz), TOK.grassGreen)];
    for (const bx of BEDS.xs) parts.push(paint(box(BEDS.width * k, BEDS.height * k, BEDS.length * k, cx + bx * k, top + (BEDS.height * k) / 2, cz), TOK.timberSilver));
    // the mini posts of the roof
    for (const off of ROOFS.rowOffsets) for (const x of [ROOFS.x0, 0, ROOFS.x1]) parts.push(paint(box(0.006, ROOFS.pivotY * k, 0.006, cx + x * k, top + (ROOFS.pivotY * k) / 2, cz + (off - 18) * k), TOK.ceramic));
    S.ext.add(Object.assign(new THREE.Mesh(merge(parts), look.paint), { name: 'sonnenacker:tagesmodell', castShadow: true, receiveShadow: true }));
  }
  const stripGeo = paint(box(0.012, 0.05, BEDS.length * k * 0.94, 0, 0.025, 0), 0xffffff);
  const strips = new THREE.InstancedMesh(stripGeo, look.paint, 12);
  strips.name = 'sonnenacker:tagesmodell-plants';
  strips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  S.det.add(strips);
  const green = new THREE.Color(0x5d7242),
    red = new THREE.Color(0x9a4a32),
    col = new THREE.Color();
  const m4 = new THREE.Matrix4();
  const setGrowth = (grow: number, ripe: number): void => {
    let i = 0;
    for (const bx of BEDS.xs)
      for (const sd of [-1, 1]) {
        m4.makeScale(1, 0.4 + grow * 1.2, 1).setPosition(cx + (bx + sd * (BEDS.width / 2 - BEDS.rowInset)) * k, top + BEDS.height * k, cz);
        strips.setMatrixAt(i, m4);
        strips.setColorAt(i++, col.copy(green).lerp(red, ripe));
      }
    strips.instanceMatrix.needsUpdate = true;
    if (strips.instanceColor) strips.instanceColor.needsUpdate = true;
  };
  setGrowth(1, 0.35);
  // the analytic shadows of the six mini tables on the beds (the toy's geometry, 1 draw)
  const shadowGeo = paint(new THREE.PlaneGeometry(0.7, 1).rotateX(-Math.PI / 2), 0x2d332a);
  const shadows = new THREE.InstancedMesh(shadowGeo, look.paint, 6);
  shadows.name = 'sonnenacker:tagesmodell-shadows';
  shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shadows.receiveShadow = false;
  S.det.add(shadows);
  // the lamp on its arc (warm, unlit) and its light
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 10), ctx.materials.light(0xffe0a3, 'T1'));
  lamp.name = 'sonnenacker:sun-lamp';
  S.det.add(lamp);
  const light = ctx.lights.point(lamp, { color: 0xffd9a0, intensity: 2.2, distance: 3.2 });
  // the hail front: a soft grey band that crosses the model (never a flash: no lightning, a single ramp)
  const hailMat = new THREE.MeshBasicMaterial({ color: 0x8d9296, transparent: true, opacity: 0, depthWrite: false });
  hailMat.name = 'sonnenacker:hail';
  const hail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.35), hailMat);
  hail.name = 'sonnenacker:hail-front';
  hail.visible = false;
  S.det.add(hail);
  ctx.onDispose(() => {
    for (const g of [stripGeo, shadowGeo, lamp.geometry, hail.geometry]) g.dispose();
    hailMat.dispose();
    strips.dispose();
    shadows.dispose();
  });

  let dayF = 0.5;
  let shown = gauges(dayF, st);
  let stow = false;
  const placeLamp = (f: number): void => {
    const a = Math.PI * f;
    lamp.position.set(cx, top + 0.05 + Math.sin(a) * 1.05, cz + Math.cos(a) * 1.05);
    const g = gauges(f, st, stow);
    shown = g;
    roof.setMini(g.tilt);
    // each mini table's shadow on the beds: the 2-D toy's projection (width W·|cos(θ − ψ)| / cos ψ)
    const rad = Math.PI / 180;
    const psi = g.zenith * rad,
      th = -g.tilt * rad;
    const w = Math.min(0.55, ((ROOFS.tableW * Math.abs(Math.cos(th - psi))) / Math.max(0.15, Math.cos(psi))) * k);
    const off = Math.tan(psi) * ROOFS.pivotY * k;
    ROOFS.rowOffsets.forEach((o, i) => {
      const z = cz + (o - 18) * k - off;
      const inside = g.sun > 0.02 && Math.abs(z - cz) < 0.9;
      m4.makeScale(1, 1, inside ? w : 0.0001).setPosition(cx, top + BEDS.height * k + 0.004, THREE.MathUtils.clamp(z, cz - 0.9, cz + 0.9));
      shadows.setMatrixAt(i, m4);
    });
    shadows.instanceMatrix.needsUpdate = true;
    light.setIntensity(0.4 + 2 * g.sun);
    if (f < 0.25) st.swept[0] = true;
    else if (f > 0.75) st.swept[2] = true;
    else if (Math.abs(f - 0.5) < 0.12) st.swept[1] = true;
  };
  placeLamp(dayF);

  // ── the season ──────────────────────────────────────────────────────────────────────────
  let season: { t: number; dur: number; pred: number; res: AgriResult; hailOn: boolean; instant: boolean; done: () => void } | null = null;
  const swept = (): boolean => st.swept.every(Boolean);
  const why = (): InfoCardSpec => ({
    eyebrow: T('b.why.eyebrow'),
    title: T('b.why.title'),
    body: [T('b.why.p1'), T('b.why.p2')],
    metrics: st.last
      ? [
          { label: T('b.rCrop'), value: `${pct(st.last.res.harvest.lo)}–${pct(st.last.res.harvest.hi)} %`, note: T('b.note.rule') },
          { label: T('b.rLer'), value: `${num(st.last.res.lerSeason.lo)}–${num(st.last.res.lerSeason.hi)}`, note: T('b.note.rule') },
        ]
      : [],
  });
  const chal = ctx.game.challenge({
    id: 'licht-teilen',
    title: T('b.game.title'),
    metric: { label: T('b.game.metric'), unit: '', better: 'higher', digits: 2 },
    goals: [{ text: T('b.game.g1') }, { text: T('b.game.g2') }, { text: T('b.game.g3') }],
    lesson: T('b.game.lesson'),
    why,
    retry: () => operate(),
    emi: S.emi,
  });
  const pct = (v: number): string => ctx.i18n.num(v * 100);
  const num = (v: number): string => ctx.i18n.num(v, 2);
  const starsOf = (pred: number, r: AgriResult): 0 | 1 | 2 | 3 => {
    if (!r.din) return 0;
    const s2 = r.lerSeason.lo >= STARS.b.lerLo - 1e-9 && r.harvest.lo >= STARS.b.cropLo - 1e-9;
    const s3 = Math.abs(pred - r.centrePct) <= STARS.b.predictPts;
    return (1 + (s2 ? 1 : 0) + (s2 && s3 ? 1 : 0)) as 1 | 2 | 3;
  };
  const value = (lang: 'de' | 'en', r: AgriResult): string => {
    const n = (v: number, d = 0): string => (lang === 'de' ? v.toFixed(d).replace('.', ',') : v.toFixed(d));
    return lang === 'de'
      ? `Ernte ${n(r.harvest.lo * 100)}–${n(r.harvest.hi * 100)} % · LER ${n(r.lerSeason.lo, 2)}–${n(r.lerSeason.hi, 2)} · DIN ${r.din ? '✓' : '✗'}`
      : `Harvest ${n(r.harvest.lo * 100)}–${n(r.harvest.hi * 100)} % · LER ${n(r.lerSeason.lo, 2)}–${n(r.lerSeason.hi, 2)} · DIN ${r.din ? '✓' : '✗'}`;
  };
  const finish = (pred: number, r: AgriResult, quiet = false): void => {
    st.last = { pred, res: r };
    persist();
    ctx.pass.recordPrediction('licht-teilen', pred, r.centrePct, { min: AGRIPV.predict.min, max: AGRIPV.predict.max });
    if (!r.din) {
      chal.fail(T('b.failDin'));
      S.say(T('emi.b.din'), true);
      refreshPanel?.();
      return;
    }
    const isNew = ctx.pass.award('licht-teilen', { value: { de: value('de', r), en: value('en', r) } });
    chal.submit(r.lerSeason.lo, { stars: starsOf(pred, r), quiet });
    if (isNew) S.refresh();
    if (!quiet) S.say(T(r.hailLoss > 0 ? 'emi.b.hailHit' : starsOf(pred, r) >= 2 ? 'emi.b.good' : 'emi.b.loose'));
    refreshPanel?.();
  };
  const start = async (instant = false, forcePred?: number): Promise<void> => {
    if (season) return;
    const pred = forcePred ?? (await ctx.ui.predict({ question: T('b.predictQ'), unit: '%', min: AGRIPV.predict.min, max: AGRIPV.predict.max, step: AGRIPV.predict.step, initial: st.last?.pred ?? AGRIPV.predict.initial, digits: 0 }));
    const res = agriPv(st);
    if (instant) return finish(pred, res, false);
    const rm = ctx.settings.reducedMotion;
    await new Promise<void>((done) => {
      season = { t: 0, dur: rm ? 1.4 : AGRIPV.seasonS, pred, res, hailOn: false, instant, done };
      ctx.game.unattended(true, 'licht-teilen');
      refreshPanel?.();
    });
  };
  const endSeason = (): void => {
    if (!season) return;
    const s = season;
    season = null;
    ctx.game.unattended(false, 'licht-teilen');
    hail.visible = false;
    hailMat.opacity = 0;
    stow = false;
    roof.setMode('track', 'a');
    S.sound.chorus(false);
    S.sound.hail(false);
    setGrowth(1, 0.85 * (1 - s.res.hailLoss * 2));
    placeLamp((dayF = 0.5));
    finish(s.pred, s.res);
    s.done();
  };

  // ── the console ─────────────────────────────────────────────────────────────────────────
  let refreshPanel: (() => void) | null = null;
  let dragging = false;
  const operate = (): void => {
    if (S.active) return;
    S.active = 'b';
    ctx.player.enterOperate({
      title: T('b.title'),
      cameraPose: { position: [cx - 1.55, top + 1.05, cz + 0.05], lookAt: [cx, top + 0.15, cz] },
      panelPosition: 'right',
      onPointer: (e) => {
        // drag the lamp: the pointer's height over the table picks the day (east → west)
        if (season) return;
        if (e.type === 'down') dragging = true;
        if (e.type === 'up') dragging = false;
        if (e.type === 'wheel') setDay(dayF - (e.deltaY ?? 0) / 2000);
        if (!dragging || (e.type !== 'move' && e.type !== 'down')) return;
        const tHit = (cx - e.origin.x) / (e.direction.x || 1e-6);
        const p = e.origin.clone().addScaledVector(e.direction, tHit);
        setDay(THREE.MathUtils.clamp(Math.acos(THREE.MathUtils.clamp((p.z - cz) / 1.05, -1, 1)) / Math.PI, 0, 1));
      },
      panel: (root) => {
        root.dataset.sa = 'panel-b';
        const head = el('div', '', undefined, 'display:flex;justify-content:space-between;align-items:center;gap:8px');
        const info = button('ⓘ', 'btn ghost', () => void cardB(), 'b-info');
        info.style.cssText += ';padding:2px 8px';
        // Entscheider: the economics overlay behind „€“ beside the ⓘ (its name on hover and for screen readers)
        const tools = el('div', '', undefined, 'display:flex;gap:6px');
        if (ctx.mode === 'entscheider') {
          const econ = button('€', 'btn ghost', () => void econCard(), 'b-econ');
          econ.style.cssText += ';padding:2px 9px';
          econ.title = t('b.econ');
          econ.setAttribute('aria-label', t('b.econ'));
          tools.append(econ);
        }
        tools.append(info);
        head.append(el('div', 'eyebrow', t('b.eyebrow')), tools);
        root.append(head);
        const goals = chal.chips();
        goals.style.margin = '6px 0 4px';
        root.append(goals);
        // the two gauges that pull against each other, in one block at the lamp's hour
        const gauge = row(ctx, t('b.gCrop'), 'modell');
        root.append(gauge.el);
        const slider = el('input') as HTMLInputElement;
        slider.type = 'range';
        slider.min = '0';
        slider.max = '1000';
        slider.value = String(Math.round(dayF * 1000));
        slider.style.cssText = 'width:100%;accent-color:var(--orange);margin-top:6px';
        slider.dataset.sa = 'b-day';
        slider.setAttribute('aria-label', t('b.dayAria'));
        slider.addEventListener('input', () => setDay(Number(slider.value) / 1000));
        slider.addEventListener('keydown', (ev) => ev.stopPropagation());
        root.append(slider);
        const hint = note('');
        root.append(hint);
        // the roof (shown once the lamp has seen the day)
        const roofBox = el('div', '', undefined, 'margin-top:4px');
        const sD = seg([0, 1, 2].map((d) => ({ value: d as Density, label: t(`b.density.${d}`) })), st.density, (d) => setChoice({ density: d }), 'b-density');
        // the tracking policy (unticked: the modules follow the sun, „Sonne zuerst“) and the hail stow
        const tick = (label: string, on: boolean, onChange: (v: boolean) => void, id: string): { el: HTMLElement; box: HTMLInputElement } => {
          const l = el('label', 'mono', undefined, 'display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-2);cursor:pointer');
          const box = el('input') as HTMLInputElement;
          box.type = 'checkbox';
          box.checked = on;
          box.dataset.sa = id;
          box.onchange = () => onChange(box.checked);
          l.append(box, el('span', '', label));
          return { el: l, box };
        };
        const tP = tick(t('b.policy.pflanze'), st.policy === 'pflanze', (v) => setChoice({ policy: v ? 'pflanze' : 'sonne' }), 'b-policy');
        const tH = tick(t('b.hailStow'), st.hailStow, (v) => setChoice({ hailStow: v }), 'b-hail');
        const ticks = el('div', '', undefined, 'display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:7px');
        ticks.append(tP.el, tH.el);
        const go = button(t('b.go'), 'btn primary', () => void start(), 'b-go');
        go.style.marginTop = '8px';
        roofBox.append(sD.el, ticks, go);
        root.append(roofBox);
        // the season: harvest band, LER and DIN (RICHTWERT), then the hail front (FIKTION) in the same block
        const result = row(ctx, t('b.result'), 'richtwert', T('b.note.rule'));
        result.stack();
        // the hail front shows here only when it cost tomatoes (no stow); stowed, the season shows it happen
        const hailV = el('span', '', '', 'color:var(--text);font-weight:500');
        const hailBox = el('span', '', undefined, 'display:inline-flex;align-items:center;gap:8px');
        hailBox.append(hailV, ctx.ui.chip('fiktion'));
        result.el.append(hailBox);
        root.append(result.el);
        refreshPanel = () => {
          gauge.set(`${pct(shown.crop)} % · ${ctx.i18n.num(shown.kw, 1)} kW`);
          slider.value = String(Math.round(dayF * 1000));
          slider.disabled = !!season;
          roofBox.style.display = swept() || st.last ? '' : 'none';
          hint.textContent = season ? t('b.running') : !swept() ? t('b.dragHint') : st.last ? '' : t('b.chooseHint');
          hint.style.display = hint.textContent ? '' : 'none';
          sD.set(st.density);
          tP.box.checked = st.policy === 'pflanze';
          sD.disable(!!season);
          tP.box.disabled = !!season;
          tH.box.checked = st.hailStow;
          tH.box.disabled = !!season;
          go.disabled = !!season;
          const r = st.last?.res;
          result.el.style.display = r ? 'flex' : 'none';
          if (r) {
            result.set(`${pct(r.harvest.lo)}–${pct(r.harvest.hi)} % · LER ${num(r.lerSeason.lo)}–${num(r.lerSeason.hi)} · DIN ${r.din ? '✓' : '✗'}`);
            hailBox.style.display = r.hailLoss > 0 ? 'inline-flex' : 'none';
            hailV.textContent = `${t('b.hail')} −${pct(r.hailLoss)} %`;
          }
        };
        refreshPanel();
        return () => {
          refreshPanel = null;
        };
      },
      onExit: () => {
        S.active = null;
        refreshPanel = null;
        dragging = false;
        S.refresh();
      },
    });
  };
  const setDay = (f: number): void => {
    dayF = THREE.MathUtils.clamp(f, 0, 1);
    placeLamp(dayF);
    const before = swept();
    if (!before && swept()) {
      persist();
      S.say(T('emi.b.swept'));
    }
    refreshPanel?.();
  };
  const setChoice = (c: Partial<Pick<Saved, 'density' | 'policy' | 'hailStow'>>): void => {
    Object.assign(st, c);
    persist();
    placeLamp(dayF);
    ctx.game.juice.cue('tick');
    refreshPanel?.();
  };
  ctx.input.onKey('Space', () => {
    if (S.active === 'b' && season && season.t > 0.3) season.t = season.dur;
  }, { whileOperating: true });
  const hit = new THREE.Mesh(new THREE.BoxGeometry(M.w, 0.5, M.d), look.mat(TOK.white));
  hit.visible = false;
  hit.position.set(cx, top + 0.2, cz);
  hit.userData.noMerge = true;
  S.det.add(hit);
  ctx.addInteractable({ object: hit, label: T('b.act'), hint: T('b.actHint'), range: 2.8, highlight: false, onInteract: () => operate() });

  const cardB = (): Promise<void> =>
    chipCard(ctx, {
      eyebrow: T('b.card.eyebrow'),
      title: T('b.card.title'),
      paras: [
        { text: T('b.card.p1'), chip: 'quelle', source: T('src.almeria') },
        { text: T('b.card.p2'), chip: 'quelle', source: T('src.arizona') },
        { text: T('b.card.p3'), chip: 'richtwert', source: T('b.note.rule') },
      ],
    });
  const econCard = (): Promise<void> =>
    chipCard(ctx, {
      eyebrow: T('b.econCard.eyebrow'),
      title: T('b.econCard.title'),
      paras: [
        { text: T('b.econCard.p1'), chip: 'quelle', source: T('src.lcoe') },
        { text: T('b.econCard.p2'), chip: 'quelle', source: T('src.baugb') },
      ],
    });

  return {
    get done() {
      return ctx.pass.has('licht-teilen');
    },
    target: [cx, S.y(cx, cz), cz],
    next: () => (!swept() && !st.last ? 'sweep' : !ctx.pass.has('licht-teilen') ? 'season' : 'done'),
    state: () => ({ density: st.density, policy: st.policy, hailStow: st.hailStow, swept: st.swept, last: st.last, season: season ? { t: season.t, dur: season.dur } : null, gauges: shown, roofMode: roof.mode }),
    solve() {
      // the lamp across the day, a DIN-conform roof with the Schutzstellung, a good prediction
      st.swept = [true, true, true];
      Object.assign(st, { density: 1, policy: 'sonne', hailStow: true });
      const r = agriPv(st);
      void start(true, Math.round(r.centrePct));
      return ctx.pass.has('licht-teilen');
    },
    stars3() {
      return this.solve();
    },
    hailSequence: async () => {
      const t0 = ctx.time.elapsed;
      st.swept = [true, true, true];
      Object.assign(st, { hailStow: true });
      await start(false, 70);
      return { seconds: ctx.time.elapsed - t0, reducedMotion: ctx.settings.reducedMotion };
    },
    update(dt) {
      if (!season) return;
      season.t += dt;
      const s = season;
      const f = Math.min(1, s.t / s.dur);
      if (ctx.settings.reducedMotion) {
        // two stills: the start, then the end (a fade in the panel); no lamp sweep, no hail animation
        if (f >= 1) endSeason();
        return;
      }
      // four model days: the lamp sweeps, the plants grow and redden
      placeLamp((f * 4) % 1);
      setGrowth(0.2 + 0.8 * f, Math.max(0, (f - 0.45) / 0.55) * 0.85);
      // the hail front crosses mid-season: a soft grey band, west → east (a single ramp in and out)
      const h0 = AGRIPV.hailAt,
        h1 = AGRIPV.hailAt + AGRIPV.hailS / s.dur;
      const inHail = f >= h0 && f <= h1;
      if (inHail !== s.hailOn) {
        s.hailOn = inHail;
        hail.visible = inHail;
        if (inHail) {
          if (s.res.hailLoss === 0) {
            stow = true;
            roof.setMode('shelter', 'a');
            S.sound.chorus(true, [0, S.y(0, 28) + ROOFS.pivotY, 28]);
          } else S.sound.hail(true, [cx, top + 0.3, cz]);
        } else {
          stow = false;
          roof.setMode('track', 'a');
          S.sound.hail(false);
          ctx.after(2.4, () => S.sound.chorus(false));
        }
      }
      if (inHail) {
        const u = (f - h0) / (h1 - h0);
        hail.position.set(cx, top + 0.3, cz - 1.1 + u * 2.2);
        hailMat.opacity = 0.42 * Math.sin(u * Math.PI);
      }
      refreshPanel?.();
      if (f >= 1) endSeason();
    },
  };
}
