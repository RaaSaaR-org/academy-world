/**
 * Sonnenacker — the Hofladen's dashboard wall and the island's Startakku (plan §4.10, §3.3; D23, D27).
 *
 * The wall shows the bar „STARTAKKU · TROCKENDOCK 3“ from the first visit (FIKTION: percent only, a
 * third per earned stamp, from ctx.quest's derived charge), the day's kWh of Sonnendach A (RICHTWERT,
 * ≈ 106 kWh/day, never converted into thrust or flight time) and, during „Erntetag“, the clock and the
 * Messbeet's count (SIM · LIVE). During the automated day the bar fills with the day's kWh as
 * presentation only; the state always comes from the stamps. On the ◆ the bar locks at 100 % with a
 * rising chime (the farm side of the charge beat; the island plays the toast, T3 and the Libelle) and
 * EMI-08 says the AKKU line when the island's beat reaches its 'line' phase.
 *
 * E on the wall: a console with the same numbers and their chips, and the honest card.
 */
import * as THREE from 'three';
import type { EmiHandle, ZoneContext } from '@/core/zones';
import { ENERGY, JUICE } from './tuning';
import { button, chipCard, el, row, segBar } from './ui';

export interface DayView {
  /** clock (h, 6…20), kWh produced so far, the Messbeet's picks so far / 60, trays in the crate */
  clock: number;
  kwh: number;
  k: number;
  done: number;
  n: number;
  trays: number;
  /** the bar's presented fill during the day (0…1), never the state */
  akku: number;
}

export interface Dashboard {
  /** the automated day's numbers (null: idle) */
  setDay(d: DayView | null): void;
  /** the farm side of the charge beat: lock at 100 % with a rising chime (once per earned ◆) */
  lock(): void;
  /** the bar's fill as the wall shows it now (tools) */
  readonly shown: { charge: number; state: string; by: string | null; locked: boolean };
  /** open the dashboard console (E on the wall) */
  operate(): void;
  update(dt: number): void;
}

const W = 768,
  H = 396;

export function buildDashboard(ctx: ZoneContext, wall: { x: number; y: number; z: number; w: number; h: number }, parent: THREE.Object3D, emi: EmiHandle): Dashboard {
  const T = ctx.i18n.text;
  const t = ctx.t;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  mat.name = 'sonnenacker:dashboard';
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(wall.w, wall.h), mat);
  screen.name = 'sonnenacker:dashboard';
  screen.position.set(wall.x + 0.03, wall.y, wall.z);
  screen.rotation.y = Math.PI / 2;
  screen.userData.noMerge = true;
  parent.add(screen);
  ctx.onDispose(() => {
    tex.dispose();
    mat.dispose();
    screen.geometry.dispose();
  });

  let day: DayView | null = null;
  let locked = false;
  let dirty = true;
  let lastDraw = -1;
  /** the bar's shown fill (eases toward its target) */
  let shownCharge = ctx.quest.snapshot().start.energy.charge;
  const policyActive = (): boolean => ctx.zones.stamps('lern-dojo') > 0 && !!ctx.pass.snapshot().stamps.find((s) => s.id === 'lern-dojo.nachmachen' && s.record && !s.record.skipped);

  const colourOf = (state: string, by: string | null): string => (state === 'bereit' || state === 'geprueft' ? (by === 'crew' ? '#2DD4BF' : '#2DD4BF') : state === 'arbeit' ? '#FBBF24' : '#F87171');
  const chipOn = (x: number, y: number, label: string, kind: 'fiktion' | 'richtwert' | 'sim'): number => {
    g.save();
    g.font = '500 15px "Geist Mono", ui-monospace, monospace';
    const w = g.measureText(label).width + 18;
    const h = 24;
    g.beginPath();
    g.roundRect(x, y, w, h, h / 2);
    g.fillStyle = kind === 'sim' ? 'rgba(45,212,191,0.15)' : 'rgba(0,0,0,0)';
    g.fill();
    g.strokeStyle = kind === 'sim' ? 'rgba(45,212,191,0.5)' : kind === 'fiktion' ? 'rgba(251,191,36,0.6)' : '#5c5651';
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = kind === 'sim' ? '#2DD4BF' : kind === 'fiktion' ? '#FBBF24' : '#A8A29E';
    g.fillText(label, x + 9, y + 17);
    g.restore();
    return w;
  };
  const draw = (): void => {
    const q = ctx.quest.snapshot().start.energy;
    const de = ctx.lang === 'de';
    g.fillStyle = '#1b1918';
    g.fillRect(0, 0, W, H);
    // hairline orange → teal at the top (the brand's sign line)
    const grad = g.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#FF6700');
    grad.addColorStop(1, '#2DD4BF');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, 4);
    g.fillStyle = '#FF6700';
    g.font = '500 17px "Geist Mono", ui-monospace, monospace';
    g.fillText(de ? '// HOFLADEN · SONNENACKER' : '// FARM SHOP · SUN FIELD', 28, 40);
    if (day) {
      const hh = Math.floor(day.clock),
        mm = Math.floor((day.clock - hh) * 60);
      g.textAlign = 'right';
      g.fillStyle = '#F5F5F4';
      g.font = '600 26px "Geist Mono", ui-monospace, monospace';
      g.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, W - 28, 44);
      g.textAlign = 'left';
    }
    // the Startakku bar
    g.fillStyle = '#F5F5F4';
    g.font = '700 30px "Space Grotesk", sans-serif';
    g.fillText(de ? 'STARTAKKU · TROCKENDOCK 3' : 'START BATTERY · DRY DOCK 3', 28, 92);
    chipOn(W - 150, 70, de ? 'FIKTION' : 'FICTION', 'fiktion');
    const charge = shownCharge;
    const lit = Math.round(charge * 10);
    const col = day && !locked ? '#FBBF24' : colourOf(q.state, q.by);
    for (let i = 0; i < 10; i++) {
      const x = 28 + i * 71,
        y = 112;
      g.fillStyle = i < lit ? col : 'rgba(255,255,255,0.06)';
      g.fillRect(x, y, 63, 46);
      if (i >= lit) {
        g.strokeStyle = q.state === 'kalt' && ctx.quest.snapshot().probestart ? 'rgba(248,113,113,0.7)' : 'rgba(255,255,255,0.12)';
        g.lineWidth = 2;
        g.strokeRect(x + 1, y + 1, 61, 44);
      }
    }
    g.fillStyle = '#F5F5F4';
    g.font = '600 40px "Geist Mono", ui-monospace, monospace';
    g.fillText(`${Math.round(charge * 100)} %`, 28, 212);
    g.font = '500 16px "Geist Mono", ui-monospace, monospace';
    g.fillStyle = '#A8A29E';
    const by = q.by === 'crew' ? (de ? 'von der Bodencrew bereitgestellt' : 'supplied by the ground crew') : q.state === 'bereit' || q.state === 'geprueft' ? (de ? 'geladen · Erntetag' : 'charged · harvest day') : de ? 'ein Drittel je Stempel' : 'a third per stamp';
    g.fillText(by, 170, 206);
    // the day's energy (RICHTWERT) and the Messbeet (SIM · LIVE)
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(28, 236, W - 56, 1);
    const kwh = day ? day.kwh : ENERGY.kwhDay;
    g.fillStyle = '#A8A29E';
    g.font = '500 16px "Geist Mono", ui-monospace, monospace';
    g.fillText(day ? (de ? 'STROM HEUTE' : 'POWER TODAY') : de ? 'STROM PRO TAG (MITTEL)' : 'POWER PER DAY (MEAN)', 28, 268);
    g.fillStyle = '#F5F5F4';
    g.font = '600 34px "Geist Mono", ui-monospace, monospace';
    g.fillText(`${Math.round(kwh)} kWh`, 28, 308);
    chipOn(28, 322, de ? 'RICHTWERT' : 'GUIDE VALUE', 'richtwert');
    g.fillStyle = '#A8A29E';
    g.font = '500 16px "Geist Mono", ui-monospace, monospace';
    g.fillText(de ? `ARME ≤ ${ENERGY.kwhUsedMax} kWh` : `ARMS ≤ ${ENERGY.kwhUsedMax} kWh`, 280, 268);
    if (day) {
      g.fillText(de ? 'MESSBEET' : 'TEST BED', 520, 268);
      g.fillStyle = '#F5F5F4';
      g.font = '600 34px "Geist Mono", ui-monospace, monospace';
      g.fillText(`${day.k}/${day.done}`, 520, 308);
      chipOn(520, 322, 'SIM · LIVE', 'sim');
      g.fillStyle = '#A8A29E';
      g.font = '500 15px "Geist Mono", ui-monospace, monospace';
      g.fillText(de ? `Kisten ${day.trays}` : `Crates ${day.trays}`, 280, 308);
    } else if (policyActive()) {
      g.fillStyle = '#2DD4BF';
      g.font = '500 15px "Geist Mono", ui-monospace, monospace';
      g.fillText(de ? 'Policy aus dem Lern-Dojo: aktiv' : 'Policy from the Learning Dojo: active', 280, 308);
      chipOn(280, 322, 'SIM · LIVE', 'sim');
    }
    g.fillStyle = '#78716C';
    g.font = '400 13px "Geist", sans-serif';
    g.fillText(de ? 'Der Akku gehört zur erfundenen Insel. kWh: nie in Schub umgerechnet.' : 'The battery belongs to the invented island. kWh: never converted into thrust.', 28, 382);
    tex.needsUpdate = true;
    dirty = false;
  };
  draw();
  ctx.i18n.onChange(() => (dirty = true));
  ctx.quest.onChange(() => (dirty = true));

  // ── the farm side of the charge beat, and EMI-08's AKKU line (D23: the island plays only the toasts) ──
  const chime = (): void => {
    JUICE.chime.forEach((f, i) => ctx.after(i * 0.14, () => ctx.audio.tone({ freq: f, dur: 0.5, type: 'sine', volume: 0.32, at: [wall.x, wall.y, wall.z] })));
  };
  ctx.events.on('island:ignition', (e: { id?: string; phase?: string } | undefined) => {
    if (e?.id !== 'AKKU' || e.phase !== 'line') return;
    if (ctx.quest.snapshot().start.energy.by !== 'player') return;
    if (ctx.playerDistance > 140) return;
    void emi.say(T('emi.akku'), { interrupt: true });
    void emi.gesture('wave');
  });

  // ── the console (E on the wall) ────────────────────────────────────────────────────────────
  const operate = (): void => {
    const s = ctx.quest.snapshot().start.energy;
    ctx.player.enterOperate({
      title: T('dash.title'),
      cameraPose: { position: [wall.x + 3.4, wall.y - 0.2, wall.z], lookAt: [wall.x, wall.y, wall.z] },
      panelPosition: 'right',
      panel: (root) => {
        root.append(el('div', 'eyebrow', t('dash.eyebrow')));
        const bar = segBar(ctx, t('dash.akku'), 'fiktion');
        bar.set(shownCharge, colourOf(s.state, s.by), s.by === 'crew' ? t('dash.crew') : undefined);
        root.append(bar.el);
        const kwh = row(ctx, t('dash.kwh'), 'richtwert', T('src.energy'));
        kwh.set(`≈ ${ENERGY.kwhDay} kWh`);
        const used = row(ctx, t('dash.used'), 'richtwert', T('src.energy'));
        used.set(`≤ ${ENERGY.kwhUsedMax} kWh`);
        root.append(kwh.el, used.el);
        const r = el('div', 'op-row', undefined, 'margin-top:10px');
        r.append(button(t('dash.card'), 'btn', () => void akkuCard(), 'dash-card'));
        root.append(r);
      },
    });
  };
  const akkuCard = (): Promise<void> =>
    chipCard(ctx, {
      eyebrow: T('card.akku.eyebrow'),
      title: T('card.akku.title'),
      paras: [
        { text: T('card.akku.p1'), chip: 'fiktion' },
        { text: T('card.akku.p2'), chip: 'richtwert', source: T('src.energy') },
      ],
    });

  const bump = (): void => void (dirty = true);
  return {
    get shown() {
      const q = ctx.quest.snapshot().start.energy;
      return { charge: Math.round(shownCharge * 1000) / 1000, state: q.state, by: q.by, locked };
    },
    setDay(d) {
      day = d;
      bump();
    },
    lock() {
      if (locked) return;
      locked = true;
      shownCharge = 1;
      chime();
      ctx.game.juice.burst([wall.x + 0.2, wall.y, wall.z], { tone: 'teal', count: 40, spread: 1.2 });
      bump();
    },
    operate,
    update(dt) {
      const q = ctx.quest.snapshot().start.energy;
      // the state from the stamps; during the day the bar fills with the kWh (presentation only)
      const target = day && !locked ? Math.max(q.charge, day.akku) : q.charge;
      if (Math.abs(target - shownCharge) > 0.001) {
        shownCharge += (target - shownCharge) * Math.min(1, dt * 3);
        if (Math.abs(target - shownCharge) < 0.004) shownCharge = target;
        dirty = true;
      }
      if (!q.charge || q.charge < 1) locked = false;
      // redraw at ≤ 4 Hz, only when something changed and only near the wall
      const now = ctx.time.elapsed;
      if (dirty && now - lastDraw > 0.25 && ctx.playerDistance < 160) {
        lastDraw = now;
        draw();
      }
    },
  };
}
