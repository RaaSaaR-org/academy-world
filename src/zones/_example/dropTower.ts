/**
 * Station C ◆ "Fallturm" — a complete measuring station in the GDD pattern:
 * Bedienmodus (operate mode) → prediction („Erst tippen, dann messen") → repeated real
 * physics runs → Kennlinie (HUD + in-world screen) → pass stamp with the measured value.
 */
import * as THREE from 'three';
import type { DynamicHandle, KennlinieHandle, KennlinieSpec, ZoneContext } from '@/core/zones';

const HEIGHTS = [1, 2, 3];
const G = 9.81;

export interface DropTower {
  fixedUpdate(dt: number): void;
  /** debug: fill in synthetic runs and award (deterministic test hook) */
  solve(): void;
}

export function buildDropTower(ctx: ZoneContext, at: THREE.Vector3): DropTower {
  const M = ctx.materials;
  const g = ctx.groups.detail; // detail tier: visible ≤ 45 m
  const x = at.x,
    z = at.z;

  // ── structure ────────────────────────────────────────────────────────────
  for (const dx of [-0.45, 0.45]) ctx.physics.addStaticBox({ size: [0.12, 4, 0.12], position: [x + dx, 2, z - 0.45], material: M.metalDark });
  ctx.physics.addStaticBox({ size: [1.1, 0.12, 0.12], position: [x, 4, z - 0.45], material: M.metalDark });
  const plate = ctx.physics.addStaticBox({ size: [1.2, 0.1, 1.2], position: [x, 0.05, z], material: M.panelElevated, surface: 'metal' });
  g.add(plate.mesh!);
  // height marks (1/2/3 m) — hazard tape on the mast
  for (const hgt of HEIGHTS) {
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), M.hazard(1));
    tape.position.set(x - 0.45, hgt + 0.2, z - 0.45);
    g.add(tape);
    ctx.text3d.create({ text: `${hgt} m`, font: 'mono-medium', size: 0.11, color: 0xa8a29e, anchorX: 'right', position: [x - 0.56, hgt + 0.2, z - 0.38] }, g);
  }
  // in-world screen showing the same Kennlinie as a CanvasTexture
  const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.88, 0.05), M.metalDark);
  screenFrame.position.set(x + 1.3, 1.9, z - 0.45);
  g.add(screenFrame);

  // ── state ────────────────────────────────────────────────────────────────
  let height = 3;
  let simTime = 0;
  const runs: { h: number; t: number }[] = [];
  let predicted: number | null = null;
  let queue = 0;
  let current: { ball: DynamicHandle; t0: number; h: number } | null = null;
  let panel: KennlinieHandle | null = null;
  const rand = (): number => {
    // Box–Muller: Lichtschranken-Jitter σ = 4 ms (toy sensor model, labelled SIM · LIVE)
    const u = 1 - Math.random(),
      v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * 0.004;
  };

  const spec = (): KennlinieSpec => {
    const means = HEIGHTS.map((hh) => {
      const r = runs.filter((q) => q.h === hh);
      return r.length ? ([hh, r.reduce((s, q) => s + q.t, 0) / r.length] as [number, number]) : null;
    }).filter((p): p is [number, number] => !!p);
    const at3 = runs.filter((r) => r.h === 3);
    const mean3 = at3.length ? at3.reduce((s, r) => s + r.t, 0) / at3.length : null;
    return {
      title: ctx.i18n.text('tower.title'),
      xLabel: ctx.i18n.text('tower.xLabel'),
      yLabel: ctx.i18n.text('tower.yLabel'),
      chip: 'sim',
      xMin: 0,
      xMax: 3.5,
      yMin: 0,
      yMax: 1,
      keyValue: mean3 != null ? ctx.t('tower.value', { t: ctx.i18n.num(mean3, 2), n: at3.length }) : undefined,
      series: [
        { id: 'runs', label: 'Messung', points: runs.map((r) => [r.h, r.t] as [number, number]) },
        { id: 'model', label: ctx.i18n.text('tower.model'), line: Array.from({ length: 15 }, (_, i) => [i * 0.25, Math.sqrt((2 * i * 0.25) / G)] as [number, number]), dashed: true, color: ctx.materials.css.teal },
        ...(means.length > 1 ? [{ id: 'means', line: means, color: ctx.materials.css.orangeLight }] : []),
      ],
    };
  };
  const screen = ctx.ui.kennlinie(spec(), { target: 'texture', width: 512, height: 320 });
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 0.8), new THREE.MeshBasicMaterial({ map: screen.texture!, toneMapped: false }));
  screenMesh.position.set(x + 1.3, 1.9, z - 0.42);
  g.add(screenMesh);
  const refresh = (): void => {
    const s = spec();
    screen.update(s);
    panel?.update(s);
  };

  // floor light barrier: the ball's arrival ends the run
  ctx.physics.addTrigger({
    shape: 'box',
    size: [1.1, 0.2, 1.1],
    position: [x, 0.2, z],
    filter: 'dynamic',
    onEnter: ({ body }) => {
      if (!current || body !== current.ball) return;
      const t = simTime - current.t0 + rand();
      runs.push({ h: current.h, t: Math.max(0, t) });
      const ball = current.ball;
      current = null;
      ctx.audio.tone({ freq: 660 + current_h_pitch(t), dur: 0.08, at: [x, 0.3, z] });
      ctx.after(0.4, () => ball.remove());
      afterRun();
    },
  });
  const current_h_pitch = (t: number): number => Math.round(t * 400);

  const dropOne = (): void => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), M.orangePaint);
    ball.position.set(x, height + 0.2 + 0.1, z);
    ball.castShadow = true;
    g.add(ball);
    const h = ctx.physics.addDynamic(ball, { mass: 1, grabbable: false, restitution: 0.05, onFall: 'remove' });
    current = { ball: h, t0: simTime, h: height };
    ctx.audio.play('click', { at: [x, height, z] });
  };

  const afterRun = (): void => {
    refresh();
    if (queue > 0) {
      queue--;
      ctx.after(0.5, dropOne);
    }
    const at3 = runs.filter((r) => r.h === 3);
    if (predicted != null && at3.length && !ctx.progress.get('predictionRecorded', false)) {
      const m = at3.reduce((s, r) => s + r.t, 0) / at3.length;
      ctx.pass.recordPrediction('fallturm', predicted, m, { min: 0.1, max: 2, scale: 'linear' });
      ctx.progress.set('predictionRecorded', true);
    }
    const heights = new Set(runs.map((r) => r.h));
    if (heights.size >= 2 && heights.has(3) && queue === 0 && !current) award();
  };

  const award = (): void => {
    const at3 = runs.filter((r) => r.h === 3);
    const m = at3.reduce((s, r) => s + r.t, 0) / at3.length;
    const means = HEIGHTS.filter((hh) => runs.some((r) => r.h === hh)).map((hh) => {
      const r = runs.filter((q) => q.h === hh);
      return r.reduce((s, q) => s + q.t, 0) / r.length;
    });
    ctx.pass.award('fallturm', { value: { de: `t(3 m) = ${ctx.i18n.num(m, 2)} s · n = ${runs.length}`, en: `t(3 m) = ${m.toFixed(2)} s · n = ${runs.length}` }, curve: means });
  };

  const measure = async (): Promise<void> => {
    if (current || queue > 0) return;
    if (predicted == null) predicted = await ctx.ui.predict({ question: ctx.i18n.text('tower.predict'), unit: 's', min: 0.1, max: 2, step: 0.01, initial: 1.2, digits: 2 });
    queue = 4;
    dropOne();
  };

  // ── console → Bedienmodus ──────────────────────────────────────────────────
  const consoleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.5), M.panel);
  consoleMesh.position.set(x, 0.5, z + 2.2);
  consoleMesh.castShadow = true;
  g.add(consoleMesh);
  ctx.physics.addStaticFromMesh(consoleMesh, { shape: 'box', surface: 'metal' });
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.05, 20), M.accentOrange);
  knob.position.set(x, 1.03, z + 2.1);
  g.add(knob);

  const statusText = (): string => ctx.t('tower.status', { h: height });
  const operate = (): void => {
    ctx.ui.status(statusText());
    ctx.player.enterOperate({
      title: { de: '// Fallturm · Bedienmodus', en: '// Drop tower · operate mode' },
      cameraPose: { position: [x + 0.2, 1.75, z + 3.2], lookAt: [x + 0.4, 1.7, z - 0.4] },
      panelPosition: 'right',
      panel: (el, exit) => {
        const seg = document.createElement('div');
        seg.className = 'seg';
        const render = (): void => {
          seg.replaceChildren(
            ...HEIGHTS.map((hh) => {
              const b = document.createElement('button');
              b.textContent = `${hh} m`;
              b.className = hh === height ? 'on' : '';
              b.onclick = () => setHeight(hh);
              return b;
            }),
          );
        };
        setHeightUi = render;
        render();
        const go = document.createElement('button');
        go.className = 'btn primary';
        go.textContent = ctx.t('tower.measure');
        go.onclick = () => void measure();
        const leave = document.createElement('button');
        leave.className = 'btn ghost';
        leave.textContent = 'Esc';
        leave.onclick = exit;
        el.innerHTML = `<div class="eyebrow">// ${ctx.t('fallturm.title')}</div><div style="margin:8px 0 2px;color:var(--text-2);font-size:13px">${ctx.t('tower.height')} · ${ctx.t('tower.hint')}</div>`;
        const row = document.createElement('div');
        row.className = 'op-row';
        row.append(seg, go, leave);
        el.append(row);
        panel = ctx.ui.kennlinie(spec(), { parent: el, width: 360, height: 210 });
        return () => {
          panel?.remove();
          panel = null;
          setHeightUi = null;
        };
      },
      onExit: () => ctx.ui.status(null),
    });
  };
  let setHeightUi: (() => void) | null = null;
  const setHeight = (hh: number): void => {
    height = hh;
    setHeightUi?.();
    ctx.ui.status(statusText());
    ctx.audio.play('click');
  };
  ctx.input.onKey(['Digit1', 'Digit2', 'Digit3'], (code) => setHeight(Number(code.slice(5))), { whileOperating: true });
  ctx.addInteractable({ object: knob, label: ctx.i18n.text('console'), onInteract: operate, range: 2.4 });

  return {
    fixedUpdate(dt) {
      simTime += dt;
    },
    solve() {
      for (const hh of HEIGHTS) for (let i = 0; i < 5; i++) runs.push({ h: hh, t: Math.sqrt((2 * hh) / G) + rand() });
      predicted = predicted ?? 0.8;
      ctx.pass.recordPrediction('fallturm', predicted, Math.sqrt(6 / G), { min: 0.1, max: 2, scale: 'linear' });
      refresh();
      award();
    },
  };
}
