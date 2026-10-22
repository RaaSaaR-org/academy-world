/**
 * Sonnenacker A „Reif oder nicht?“ (Probieren; plan §4.10, R8 §2.2). You look through the wrist camera of
 * the arm on bed 1 and sort the twelve tomatoes of the Lernkiste into „pflücken / warten“ by the USDA
 * colour classes [S24] (Light red + Red → pick). The arm learns one threshold from your labels and is
 * tested on 40 fruits in the sun, then under the panels, where red looks darker and the accuracy drops.
 * Place the colour reference card in the camera's field (F, the grab verb) and test again.
 *
 * Measured value: „Sonne 38/40 · Schatten 31/40 → mit Karte 37/40“ (k/40, Wilson; SIM · LIVE).
 * ★ 12 taught + a test run · ★★ ≥ 36/40 under the panels · ★★★ the calibration found before the second
 * shaded test. Reduced motion: the camera stays put (it never moves anyway; the test sweep is instant).
 */
import * as THREE from 'three';
import type { DynamicHandle, InfoCardSpec } from '@/core/zones';
import { RIPE, SITE, STARS } from './tuning';
import { TOK, box, part, paint, merge } from './look';
import { learnThreshold, ripeTeach, ripeTest, runRipeTest, shouldPick, RIPE_CLASSES, type Light, type RipeTest } from './model';
import { ripeColour } from './field';
import type { Shared } from './shared';
import { button, chipCard, el, row } from './ui';

export interface StationA {
  solve(): boolean;
  stars3(): boolean;
  /** station C reads it: the midday stripes need the calibration (R8 §2.3) */
  readonly calibrated: boolean;
  readonly done: boolean;
  state(): unknown;
  update(dt: number): void;
  /** the objective's next step */
  next(): 'teach' | 'sun' | 'shade' | 'card' | 'done';
  readonly target: [number, number, number];
}

interface Saved {
  labels: (boolean | null)[];
  sun: number | null;
  shade: number[];
  card: number | null;
  /** the card was in view before the second shaded test (★★★) */
  calFirst: boolean;
}

export function buildStationA(S: Shared): StationA {
  const { ctx, look } = S;
  const T = ctx.i18n.text;
  const t = ctx.t;
  const teach = ripeTeach();
  const test = ripeTest();
  const st: Saved = { labels: Array(12).fill(null), sun: null, shade: [], card: null, calFirst: false, ...ctx.progress.get<Partial<Saved>>('a', {}) };
  if (st.labels.length !== 12) st.labels = Array(12).fill(null);
  const persist = (): void => ctx.progress.set('a', st);
  let cur = Math.max(0, st.labels.indexOf(null));
  let cardInView = false;
  let running: { light: Light; t: number; res: RipeTest } | null = null;

  // ── the bench: a larch table with the Lernkiste, the „Bildfeld“ and the card's shelf ─────────
  const [bx, bz] = [SITE.lernkiste.x, SITE.lernkiste.z];
  const gy = S.y(bx, bz);
  const top = gy + 0.9;
  {
    const parts: THREE.BufferGeometry[] = [
      paint(box(0.62, 0.05, 1.16, bx, top - 0.025, bz), TOK.timberFresh),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => paint(box(0.05, 0.9, 0.05, bx + sx * 0.26, gy + 0.43, bz + sz * 0.52), TOK.timberDark))),
      // the Lernkiste (a shallow tray of larch slats) and the card shelf on a post
      paint(box(0.26, 0.04, 0.62, bx, top + 0.02, bz - 0.18), TOK.timberSilver),
      paint(box(0.06, 1.05, 0.06, bx - 0.36, gy + 0.52, bz + 0.62), TOK.timberDark),
      paint(box(0.2, 0.025, 0.16, bx - 0.36, gy + 1.0, bz + 0.62), TOK.timberFresh),
    ];
    S.ext.add(part(merge(parts), look.paint, 'lernkiste'));
    ctx.physics.addStaticBox({ size: [0.62, 0.95, 1.16], position: [bx, gy + 0.47, bz], surface: 'wood' });
    ctx.physics.addStaticBox({ size: [0.2, 0.05, 0.16], position: [bx - 0.36, gy + 1.0, bz + 0.62], surface: 'wood' });
    // the „Bildfeld“: where the camera sees the card (teal = data, §2.7 rule 6)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.115, 0.13, 4, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 4).scale(1, 1, 0.75), look.teal);
    ring.position.set(bx, top + 0.003, bz + 0.33);
    ring.name = 'sonnenacker:bildfeld';
    S.ext.add(ring);
  }
  // the twelve teaching tomatoes (instanced, rings for your labels under them)
  const fruitGeo = new THREE.IcosahedronGeometry(0.034, 1).scale(1, 0.86, 1);
  fruitGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(fruitGeo.getAttribute('position').count * 3).fill(1), 3));
  const fruits = new THREE.InstancedMesh(fruitGeo, look.paint, 12);
  fruits.name = 'sonnenacker:lernkiste-fruit';
  const ringGeo = paint(new THREE.RingGeometry(0.04, 0.052, 18).rotateX(-Math.PI / 2), 0xffffff);
  const rings = new THREE.InstancedMesh(ringGeo, look.paint, 12);
  rings.name = 'sonnenacker:lernkiste-rings';
  const slot = (i: number): THREE.Vector3 => new THREE.Vector3(bx + (i < 6 ? -0.055 : 0.055), top + 0.065, bz - 0.43 + (i % 6) * 0.1);
  const m4 = new THREE.Matrix4();
  teach.forEach((f, i) => {
    const p = slot(i);
    fruits.setMatrixAt(i, m4.makeRotationY(i).setPosition(p));
    fruits.setColorAt(i, ripeColour(f.cls + (f.r - RIPE.centres[f.cls]) * 4));
    rings.setMatrixAt(i, m4.makeTranslation(p.x, top + 0.043, p.z));
  });
  fruits.castShadow = true;
  rings.castShadow = false;
  S.det.add(fruits, rings);
  const ringCol = { none: new THREE.Color(0x3d3a37), pick: new THREE.Color(TOK.teal), wait: new THREE.Color(0xa8a29e), cur: new THREE.Color(TOK.orange) };
  const paintRings = (): void => {
    for (let i = 0; i < 12; i++) rings.setColorAt(i, i === cur && S.active === 'a' ? ringCol.cur : st.labels[i] == null ? ringCol.none : st.labels[i] ? ringCol.pick : ringCol.wait);
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
  };
  paintRings();
  ctx.onDispose(() => {
    fruitGeo.dispose();
    ringGeo.dispose();
    fruits.dispose();
    rings.dispose();
  });

  // the colour reference card: a grabbable card with six patches and a white field (the grab verb)
  const cardGeo = merge([
    paint(box(0.2, 0.008, 0.14, 0, 0, 0), 0x2a2725),
    paint(box(0.06, 0.01, 0.12, -0.065, 0.002, 0), 0xf2efe9),
    ...RIPE.colours.map((c, i) => paint(box(0.034, 0.01, 0.034, -0.012 + (i % 3) * 0.04, 0.002, -0.027 + Math.floor(i / 3) * 0.054), c)),
  ]);
  const cardMesh = new THREE.Mesh(cardGeo, look.paint);
  cardMesh.name = 'sonnenacker:farbkarte';
  cardMesh.castShadow = true;
  cardMesh.position.set(bx - 0.36, gy + 1.03, bz + 0.62);
  S.det.add(cardMesh);
  const card: DynamicHandle = ctx.physics.addDynamic(cardMesh, { mass: 0.05, label: T('a.cardLabel'), shape: 'box', friction: 0.9 });
  ctx.onDispose(() => cardGeo.dispose());
  ctx.physics.addTrigger({
    shape: 'box',
    size: [0.36, 0.18, 0.3],
    position: [bx, top + 0.06, bz + 0.33],
    filter: 'dynamic',
    onEnter: (e) => {
      if (e.body !== card) return;
      cardInView = true;
      S.sound.answer([bx, top, bz]);
      ctx.game.juice.popup([bx, top + 0.25, bz + 0.33], T('a.cardIn'), { tone: 'teal' });
      if (S.active !== 'a' && st.shade.length && st.card == null) S.say(T('emi.a.cardIn'));
      refreshPanel?.();
    },
    onExit: (e) => {
      if (e.body !== card) return;
      cardInView = false;
      refreshPanel?.();
    },
  });

  // ── the challenge ───────────────────────────────────────────────────────────────────────
  const shadeBest = (): number | null => {
    const xs = [...st.shade, ...(st.card != null ? [st.card] : [])];
    return xs.length ? Math.max(...xs) : null;
  };
  const taught = (): boolean => st.labels.every((l) => l != null);
  const starsNow = (): 0 | 1 | 2 | 3 => {
    if (!taught() || (st.sun == null && !st.shade.length && st.card == null)) return 0;
    const s2 = (st.card ?? 0) >= STARS.a.shade2 || st.shade.some((k) => k >= STARS.a.shade2);
    return (1 + (s2 ? 1 : 0) + (s2 && st.calFirst ? 1 : 0)) as 1 | 2 | 3;
  };
  const why = (): InfoCardSpec => ({
    eyebrow: T('a.why.eyebrow'),
    title: T('a.why.title'),
    body: [T('a.why.p1'), T('a.why.p2')],
    metrics: [
      { label: T('a.why.mSun'), value: st.sun != null ? `${st.sun}/40` : '–', note: T('a.chipNote') },
      { label: T('a.why.mShade'), value: st.shade.length ? `${st.shade[0]}/40` : '–', note: T('a.chipNote') },
      { label: T('a.why.mCard'), value: st.card != null ? `${st.card}/40` : '–', note: T('a.chipNote') },
    ],
  });
  const chal = ctx.game.challenge({
    id: 'reif-oder-nicht',
    title: T('a.game.title'),
    metric: { label: T('a.game.metric'), unit: '/ 40', better: 'higher', digits: 0 },
    goals: [{ text: T('a.game.g1') }, { text: T('a.game.g2'), at: STARS.a.shade2 }, { text: T('a.game.g3') }],
    lesson: T('a.game.lesson'),
    why,
    retry: () => operate(),
    emi: S.emi,
  });
  const valueText = (lang: 'de' | 'en'): string => {
    const de = lang === 'de';
    const parts: string[] = [];
    if (st.sun != null) parts.push(`${de ? 'Sonne' : 'Sun'} ${st.sun}/40`);
    if (st.shade.length) parts.push(`${de ? 'Schatten' : 'Shade'} ${st.shade[0]}/40`);
    let s = parts.join(' · ');
    if (st.card != null) s += ` → ${de ? 'mit Karte' : 'with card'} ${st.card}/40`;
    return s;
  };
  const award = (): void => {
    if (!taught()) return;
    const isNew = ctx.pass.award('reif-oder-nicht', { value: { de: valueText('de'), en: valueText('en') } });
    chal.submit(shadeBest() ?? st.sun ?? 0, { stars: starsNow() });
    if (isNew) {
      S.refresh();
      ctx.game.juice.burst([bx, top + 0.2, bz], { tone: 'teal', count: 50, spread: 0.8 });
    }
  };

  // ── labelling and tests ───────────────────────────────────────────────────────────────────
  let refreshPanel: (() => void) | null = null;
  const label = (pick: boolean): void => {
    if (running) return;
    st.labels[cur] = pick;
    persist();
    const p = slot(cur);
    ctx.game.juice.popup([p.x, p.y + 0.1, p.z], pick ? T('a.pick') : T('a.wait'), { tone: pick ? 'teal' : 'muted', seconds: 1.1 });
    ctx.game.juice.cue('tick', { at: [p.x, p.y, p.z] });
    // the arm nods (the wrist camera bobs) and the next unlabelled tomato comes up
    const nextFree = st.labels.findIndex((l, i) => l == null && i > cur);
    cur = nextFree >= 0 ? nextFree : Math.max(0, st.labels.indexOf(null));
    if (taught() && !st.sun) S.say(T('emi.a.taught'));
    paintRings();
    refreshPanel?.();
  };
  const runTest = (light: Light, instant = false): RipeTest | null => {
    if (!taught() || running) return null;
    if (light === 'shade' && cardInView) light = 'card';
    const th = learnThreshold(teach, st.labels as boolean[]);
    const res = runRipeTest(test, th, light);
    if (light === 'card' && st.shade.length === 1 && st.card == null) st.calFirst = true;
    if (light === 'sun') st.sun = Math.max(st.sun ?? 0, res.k);
    else if (light === 'shade') st.shade.push(res.k);
    else st.card = Math.max(st.card ?? 0, res.k);
    persist();
    if (instant) return res;
    if (ctx.settings.reducedMotion) {
      after(light, res);
      return res;
    }
    running = { light, t: 0, res };
    ctx.game.unattended(true, 'reif-oder-nicht');
    S.sound.chorus(false);
    refreshPanel?.();
    return res;
  };
  const after = (light: Light, res: RipeTest): void => {
    ctx.game.juice.cue(res.k >= STARS.a.shade2 ? 'great' : res.k >= 33 ? 'good' : 'oops');
    if (light === 'shade') S.say(T(res.k < STARS.a.shade2 ? 'emi.a.shade' : 'emi.a.shadeOk'), true);
    else if (light === 'card') S.say(T(res.k >= STARS.a.shade2 ? 'emi.a.card' : 'emi.a.cardBad'), true);
    award();
    refreshPanel?.();
  };

  // ── the camera image (a canvas in the console: the 40 test fruits as the camera sees them) ──
  const CW = 290,
    CH = 150;
  const drawImage = (cv: HTMLCanvasElement, light: Light | null, res: RipeTest | null, upTo: number): void => {
    const g = cv.getContext('2d')!;
    g.fillStyle = light === 'shade' ? '#1c1f22' : '#22201d';
    g.fillRect(0, 0, CW, CH);
    const tint = light === 'shade' ? RIPE.shadeTint : light === 'card' ? [0.98, 0.98, 1] : [1, 1, 1];
    const c = new THREE.Color();
    test.forEach((f, i) => {
      const x = 18 + (i % 10) * 28,
        y = 22 + Math.floor(i / 10) * 34;
      ripeColour(f.cls + (f.r - RIPE.centres[f.cls]) * 4, c);
      // the camera's light: the shade darkens and turns red bluish; the card's white balance undoes it
      g.fillStyle = `rgb(${Math.round(c.r ** (1 / 2.2) * 255 * tint[0])},${Math.round(c.g ** (1 / 2.2) * 255 * tint[1])},${Math.round(c.b ** (1 / 2.2) * 255 * tint[2])})`;
      g.beginPath();
      g.arc(x, y, 10, 0, Math.PI * 2);
      g.fill();
      if (res && i < upTo) {
        g.lineWidth = 2.5;
        g.strokeStyle = res.right[i] ? (res.pick[i] ? '#2DD4BF' : '#A8A29E') : '#FBBF24';
        g.beginPath();
        g.arc(x, y, 13, 0, Math.PI * 2);
        g.stroke();
      }
    });
    if (light === 'card') {
      // the card in the corner of the image
      g.fillStyle = '#2a2725';
      g.fillRect(CW - 46, CH - 30, 38, 24);
      g.fillStyle = '#f2efe9';
      g.fillRect(CW - 42, CH - 26, 10, 16);
      RIPE.colours.forEach((col, k) => {
        g.fillStyle = `#${col.toString(16).padStart(6, '0')}`;
        g.fillRect(CW - 29 + (k % 3) * 7, CH - 26 + Math.floor(k / 3) * 8, 6, 7);
      });
    }
  };

  // ── the console (E on the Lernkiste) ───────────────────────────────────────────────────────
  const camAt = (): { position: [number, number, number]; lookAt: [number, number, number] } => ({ position: [bx + 0.46, top + 0.5, bz - 0.12], lookAt: [bx, top + 0.04, bz - 0.12] });
  const operate = (): void => {
    if (S.active) return;
    S.active = 'a';
    S.arms.park(0, bz - 0.15, new THREE.Vector3(bx, top, bz - 0.18));
    paintRings();
    ctx.player.enterOperate({
      title: T('a.title'),
      cameraPose: camAt(),
      panelPosition: 'right',
      onPointer: (e) => {
        if (e.type !== 'down') return;
        // pick a tomato in the view: the nearest to the ray
        let best = -1,
          bd = 0.06;
        const v = new THREE.Vector3();
        for (let i = 0; i < 12; i++) {
          const p = slot(i);
          v.copy(p).sub(e.origin);
          const along = v.dot(e.direction);
          const d = v.addScaledVector(e.direction, -along).length();
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
        if (best >= 0) {
          cur = best;
          paintRings();
          refreshPanel?.();
        }
      },
      panel: (root) => {
        root.dataset.sa = 'panel-a';
        const head = el('div', '', undefined, 'display:flex;justify-content:space-between;align-items:center;gap:8px');
        const info = button('ⓘ', 'btn ghost', () => void cardA(), 'a-info');
        info.style.cssText += ';padding:2px 8px';
        head.append(el('div', 'eyebrow', t('a.eyebrow')), info);
        root.append(head);
        const goals = chal.chips();
        goals.style.margin = '6px 0 4px';
        root.append(goals);
        const cv = el('canvas', '', undefined, `width:100%;max-width:${CW}px;border-radius:6px;margin-top:6px;display:block`);
        cv.width = CW;
        cv.height = CH;
        root.append(cv);
        const step = el('div', '', '', 'font-size:13px;color:var(--text);margin-top:6px;min-height:18px');
        root.append(step);
        const labelRow = el('div', 'op-row', undefined, 'margin-top:6px');
        const bPick = button(t('a.pickBtn'), 'btn', () => label(true), 'a-pick');
        const bWait = button(t('a.waitBtn'), 'btn', () => label(false), 'a-wait');
        labelRow.append(bPick, bWait);
        const testRow = el('div', 'op-row', undefined, 'margin-top:6px');
        const bSun = button(t('a.testSun'), 'btn primary', () => void runTest('sun'), 'a-test-sun');
        const bShade = button(t('a.testShade'), 'btn primary', () => void runTest('shade'), 'a-test-shade');
        testRow.append(bSun, bShade);
        // the tests in one block, as on the stamp: „Sonne 40/40 · Schatten 31/40 → mit Karte 39/40“
        const rTest = row(ctx, t('a.rTest'), 'sim', T('a.chipNote'));
        rTest.stack();
        root.append(labelRow, testRow, rTest.el);
        refreshPanel = () => {
          const n = st.labels.filter((l) => l != null).length;
          const f = teach[cur];
          step.textContent = !taught() ? t('a.stepTeach', { n: `${n}/12`, c: t(`a.class.${RIPE_CLASSES[f.cls]}`) }) : cardInView ? t('a.stepCard') : st.shade.length ? t('a.stepShade') : t('a.stepTest');
          // the class name shows only after a label: the player judges by colour first
          if (!taught() && st.labels[cur] == null) step.textContent = t('a.stepTeachBlind', { n: `${n}/12` });
          bPick.disabled = bWait.disabled = !!running;
          // once the 12 are sorted the console is about testing (1 / 2 still relabel the tomato in view)
          labelRow.style.display = taught() ? 'none' : '';
          bSun.disabled = bShade.disabled = !taught() || !!running;
          bShade.textContent = cardInView ? t('a.testCard') : t('a.testShade');
          rTest.el.style.display = st.sun != null || st.shade.length || st.card != null ? 'flex' : 'none';
          const parts: string[] = [];
          if (st.sun != null) parts.push(`${t('a.rSun')} ${st.sun}/40`);
          if (st.shade.length) parts.push(`${t('a.rShade')} ${st.shade[st.shade.length - 1]}/40`);
          rTest.set(parts.join(' · ') + (st.card != null ? ` → ${t('a.rCard')} ${st.card}/40` : ''));
          const light: Light | null = running ? running.light : cardInView ? 'card' : st.shade.length ? 'shade' : 'sun';
          drawImage(cv, light, running ? running.res : null, running ? Math.floor((running.t / 2) * 40) : 0);
        };
        refreshPanel();
        return () => {
          refreshPanel = null;
        };
      },
      onExit: () => {
        S.active = null;
        refreshPanel = null;
        S.arms.park(0, null);
        paintRings();
        S.refresh();
      },
    });
  };
  ctx.input.onKey(['Digit1', 'Digit2'], (code) => {
    if (S.active !== 'a') return;
    label(code === 'Digit1');
  }, { whileOperating: true });
  // the console is the Lernkiste itself
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.9), look.mat(TOK.white));
  hit.visible = false;
  hit.position.set(bx, top + 0.1, bz - 0.15);
  hit.userData.noMerge = true;
  S.det.add(hit);
  ctx.addInteractable({ object: hit, label: T('a.act'), hint: T('a.actHint'), range: 2.6, highlight: false, onInteract: () => operate() });

  // the SO-101 plaque (attribution from the manifest) and the honest card
  const cardA = (): Promise<void> =>
    chipCard(ctx, {
      eyebrow: T('a.card.eyebrow'),
      title: T('a.card.title'),
      paras: [
        { text: T('a.card.p1'), chip: 'quelle', source: T('src.so101') },
        { text: T('a.card.p2'), chip: 'modell' },
      ],
    });

  return {
    get calibrated() {
      return st.card != null && st.card >= STARS.a.shade2;
    },
    get done() {
      return ctx.pass.has('reif-oder-nicht');
    },
    target: [bx, gy, bz],
    next: () => (!taught() ? 'teach' : st.sun == null ? 'sun' : !st.shade.length ? 'shade' : st.card == null ? 'card' : 'done'),
    state: () => ({ labels: st.labels, sun: st.sun, shade: st.shade, card: st.card, calFirst: st.calFirst, cardInView, stars: starsNow(), cur }),
    solve() {
      // the right labels, a sun test, a shaded test, the card, the corrected test (solve-a)
      teach.forEach((f, i) => (st.labels[i] = shouldPick(f.cls)));
      st.shade = [];
      st.card = null;
      st.calFirst = false;
      runTest('sun', true);
      cardInView = false;
      runTest('shade', true);
      card.setPosition([bx, top + 0.03, bz + 0.33]);
      cardInView = true;
      runTest('card', true);
      award();
      refreshPanel?.();
      return ctx.pass.has('reif-oder-nicht');
    },
    stars3() {
      return this.solve() && starsNow() === 3;
    },
    update(dt) {
      if (!running) return;
      running.t += dt;
      refreshPanel?.();
      if (running.t >= 2) {
        const r = running;
        running = null;
        ctx.game.unattended(false, 'reif-oder-nicht');
        after(r.light, r.res);
      }
    },
  };
}
