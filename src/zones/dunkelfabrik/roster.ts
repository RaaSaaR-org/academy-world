/**
 * Station B „Schichtplan & Waage“ (GDD §7.5 B; plan §4.6: one wall, three decisions; a side station in
 * Entdecker mode, D40) — Schichtplan-Wand: 6 posts × 3 shifts = 18 split-flap panels on the interior
 * front wall (z 5.7, x −13…−4, 9 × 4.5 m, facing −z). One panel, three numbered decisions:
 *   1 the year slider 2026 → 2035 (ages advance, at 65 a token flips to RUHESTAND; one hire every 2 years
 *     goes to the lightest post),
 *   2 a robot token on an empty post with the type choice (honest feedback; three tokens),
 *   3 „Rechnet sich das?“: the Amortisationswaage (waage.ts) runs six years while the camera turns to the
 *     beam (optional for ★, needed for ★★★).
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { canvasTex, mesh, merge, boxMM } from './geo';
import type { Waage } from './waage';
import {
  FIT,
  HEAVY_POSTS,
  OWN_SLOT,
  POSTS,
  SHIFTS,
  YEAR_MAX,
  YEAR_MIN,
  emptyCount,
  rosterAt,
  slotPost,
  slotShift,
  type RobotPlacement,
  type RobotType,
  type SlotState,
} from './sim';
import { ROSTER } from './tuning';

const WALL = { x0: -13, x1: -4, y0: 0.55, y1: 5.05, z: 5.52 } as const;
const W = 1280;
const H = 640;
const COL_X = [700, 860, 1020];
const CELL_W = 140;
const CELL_H = 64;
const ROW_Y0 = 156;
const ROW_H = 74;
const FLIP_S = 0.34;

export interface Roster {
  readonly year: number;
  readonly robots: readonly RobotPlacement[];
  readonly feedbackShown: boolean;
  /** the post the player automated (for the Waage), default Palettieren am Ofen */
  readonly automatedPost: (typeof POSTS)[number];
  readonly automatedType: RobotType;
  setYear(y: number): void;
  place(slot: number, type: RobotType): boolean;
  update(dt: number): void;
  operate(): void;
  onChange: (() => void) | null;
  /** a verdict was shown for a token (FUN-PLAN D2): where on the wall (local) */
  onVerdict: ((fit: 'passt' | 'pilot' | 'nein', at: THREE.Vector3) => void) | null;
  /** placed robots whose verdict is „passt“ */
  passt(): number;
  /** „passt nicht“ verdicts since the tokens were last all free */
  readonly misfits: number;
  /** take all tokens back (a new plan) */
  clearRobots(): void;
  /** the station's goal chips (set by the zone: ctx.game challenge) */
  chips: (() => HTMLElement) | null;
  relabel(): void;
  /** lights out: the wall display dims to a glow */
  setDim(dark: boolean): void;
}

export function buildRoster(ctx: ZoneContext, sound: { flip(n?: number): void }, say: (key: string) => void, waage: Waage): Roster {
  const M = ctx.materials;
  const det = ctx.groups.detail;
  const tr = (k: string, p?: Record<string, string | number>): string => ctx.t(`roster.${k}`, p);

  // ── wall: frame + split-flap canvas ──────────────────────────────────────
  const cv = canvasTex(W, H, { mipmaps: false });
  ctx.onDispose(() => cv.tex.dispose());
  const screenMat = new THREE.MeshBasicMaterial({ map: cv.tex, toneMapped: false, name: 'dunkelfabrik:roster' });
  ctx.onDispose(() => screenMat.dispose());
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(WALL.x1 - WALL.x0, WALL.y1 - WALL.y0), screenMat);
  plane.rotation.y = Math.PI;
  plane.position.set((WALL.x0 + WALL.x1) / 2, (WALL.y0 + WALL.y1) / 2, WALL.z);
  plane.name = 'df:roster-screen';
  det.add(plane);
  ctx.onDispose(() => plane.geometry.dispose());
  det.add(
    mesh(
      merge([
        boxMM(WALL.x0 - 0.12, WALL.y0 - 0.14, WALL.z, WALL.x1 + 0.12, WALL.y0, WALL.z + 0.1),
        boxMM(WALL.x0 - 0.12, WALL.y1, WALL.z, WALL.x1 + 0.12, WALL.y1 + 0.14, WALL.z + 0.1),
        boxMM(WALL.x0 - 0.12, WALL.y0, WALL.z, WALL.x0, WALL.y1, WALL.z + 0.1),
        boxMM(WALL.x1, WALL.y0, WALL.z, WALL.x1 + 0.12, WALL.y1, WALL.z + 0.1),
        // console lectern in front of the wall
        boxMM(-9.1, 0, 2.3, -7.9, 1.0, 2.75),
        boxMM(-9.2, 1.0, 2.2, -7.8, 1.08, 2.85),
      ]),
      M.metalDark,
      { name: 'df:roster-frame' },
    ),
  );
  ctx.physics.addStaticBox({ size: [1.2, 1.1, 0.5], position: [-8.5, 0.55, 2.52], surface: 'metal' });
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.3), M.panelElevated);
  knob.position.set(-8.5, 1.1, 2.52);
  det.add(knob);
  ctx.onDispose(() => knob.geometry.dispose());

  // ── state ────────────────────────────────────────────────────────────────
  let year = YEAR_MIN;
  const robots: RobotPlacement[] = [];
  let state: SlotState[] = rosterAt(year, robots);
  let shown: SlotState[] = state.slice();
  const flips: { from: SlotState; to: SlotState; t: number; delay: number }[] = state.map((s) => ({ from: s, to: s, t: 1, delay: 0 }));
  const shake = new Float32Array(18);
  let feedbackShown = false;
  let pending: number | null = null;
  let feedback: { slot: number; type: RobotType; text: string; fit: string } | null = null;
  let automatedPost: (typeof POSTS)[number] = 'palettieren';
  let automatedType: RobotType = 'cobot';
  let ownSaid = false;
  let dirty = true;
  // supervision tokens flying up to Anlagenführung
  const flyers: { slot: number; t: number }[] = [];
  let supervisors = 0;
  let ui: { refresh(): void } | null = null;

  const cellRect = (i: number): [number, number] => [COL_X[i % 3], ROW_Y0 + Math.floor(i / 3) * ROW_H];

  // ── drawing ──────────────────────────────────────────────────────────────
  const g = cv.g;
  const face = (s: SlotState, x: number, y: number, own: boolean): void => {
    // panel body
    const base = s.kind === 'robot' ? '#10302c' : s.kind === 'empty' ? '#161514' : s.kind === 'retired' ? '#2a2725' : '#232120';
    g.fillStyle = base;
    g.fillRect(x, y, CELL_W, CELL_H);
    g.fillStyle = 'rgba(255,255,255,0.04)';
    g.fillRect(x, y, CELL_W, CELL_H / 2);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (s.kind === 'person') {
      g.fillStyle = '#f5f5f4';
      g.font = '700 38px "Space Grotesk", sans-serif';
      g.fillText(String(s.age), x + CELL_W / 2 - (s.hired ? 14 : 0), y + CELL_H / 2 + 2);
      if (s.hired) {
        g.fillStyle = '#a8a29e';
        g.font = '500 13px "Geist Mono", monospace';
        g.fillText(tr('new'), x + CELL_W - 24, y + CELL_H / 2 + 2);
      }
    } else if (s.kind === 'retired') {
      g.fillStyle = '#d6d3d1';
      g.font = '600 17px "Geist Mono", monospace';
      g.fillText(tr('retired'), x + CELL_W / 2, y + CELL_H / 2 + 1);
    } else if (s.kind === 'empty') {
      g.strokeStyle = '#57534e';
      g.setLineDash([6, 5]);
      g.lineWidth = 2;
      g.strokeRect(x + 5, y + 5, CELL_W - 10, CELL_H - 10);
      g.setLineDash([]);
      g.fillStyle = '#78716c';
      g.font = '600 20px "Geist Mono", monospace';
      g.fillText(tr('empty'), x + CELL_W / 2, y + CELL_H / 2 + 1);
    } else {
      g.fillStyle = '#2dd4bf';
      g.font = '600 15px "Geist Mono", monospace';
      g.fillText(tr('robot'), x + CELL_W / 2, y + 22);
      g.font = '500 14px "Geist Mono", monospace';
      g.fillStyle = '#99f6e4';
      g.fillText(tr(`type.${s.type}Short`), x + CELL_W / 2, y + 44);
    }
    // split line
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(x, y + CELL_H / 2 - 1, CELL_W, 2);
    if (own) {
      g.strokeStyle = '#ff6700';
      g.lineWidth = 3;
      g.strokeRect(x + 1.5, y + 1.5, CELL_W - 3, CELL_H - 3);
    }
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
  };
  const cell = (i: number): void => {
    const [x0, y] = cellRect(i);
    const x = x0 + Math.sin(shake[i] * 40) * shake[i] * 10;
    const f = flips[i];
    const own = i === OWN_SLOT;
    const tt = Math.max(0, Math.min(1, (f.t - f.delay) / FLIP_S));
    if (tt >= 1 || f.from === f.to) {
      face(f.to, x, y, own);
      return;
    }
    const mid = y + CELL_H / 2;
    // static halves: new top, old bottom
    g.save();
    g.beginPath();
    g.rect(x, y, CELL_W, CELL_H / 2);
    g.clip();
    face(f.to, x, y, own);
    g.restore();
    g.save();
    g.beginPath();
    g.rect(x, mid, CELL_W, CELL_H / 2);
    g.clip();
    face(f.from, x, y, own);
    g.restore();
    // the falling flap
    const c = Math.cos(Math.PI * tt);
    g.save();
    if (tt < 0.5) {
      g.beginPath();
      g.rect(x, y - 2, CELL_W, CELL_H / 2 + 2);
      g.clip();
      g.translate(0, mid);
      g.scale(1, Math.max(0.02, c));
      g.translate(0, -mid);
      face(f.from, x, y, own);
      g.fillStyle = `rgba(0,0,0,${(0.5 * (1 - c)).toFixed(3)})`;
      g.fillRect(x, y, CELL_W, CELL_H / 2);
    } else {
      g.beginPath();
      g.rect(x, mid, CELL_W, CELL_H / 2 + 2);
      g.clip();
      g.translate(0, mid);
      g.scale(1, Math.max(0.02, -c));
      g.translate(0, -mid);
      face(f.to, x, y, own);
      g.fillStyle = `rgba(0,0,0,${(0.5 * (1 + c)).toFixed(3)})`;
      g.fillRect(x, mid, CELL_W, CELL_H / 2);
    }
    g.restore();
  };

  const draw = (): void => {
    g.fillStyle = '#121110';
    g.fillRect(0, 0, W, H);
    // header
    g.fillStyle = '#a8a29e';
    g.font = '500 20px "Geist Mono", monospace';
    g.fillText(tr('eyebrow'), 36, 46);
    g.fillStyle = '#f5f5f4';
    g.font = '700 34px "Space Grotesk", sans-serif';
    g.fillText(tr('wallTitle'), 36, 92);
    // year (key metric → orange)
    g.textAlign = 'right';
    g.fillStyle = '#ff8534';
    g.font = '700 84px "Space Grotesk", sans-serif';
    g.fillText(String(year), W - 36, 104);
    g.textAlign = 'left';
    // ILLUSTRATIV chip
    pill(g, 36 + g.measureText('').width, 106, tr('chip'), '#fbbf24', 'rgba(251,191,36,0.15)');
    // column heads
    g.font = '500 16px "Geist Mono", monospace';
    g.fillStyle = '#a8a29e';
    g.textAlign = 'center';
    SHIFTS.forEach((s, i) => g.fillText(tr(`shift.${s}`), COL_X[i] + CELL_W / 2, ROW_Y0 - 14));
    g.textAlign = 'left';
    // rows
    POSTS.forEach((p, r) => {
      const y = ROW_Y0 + r * ROW_H;
      g.fillStyle = r % 2 ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.035)';
      g.fillRect(24, y - 5, COL_X[2] + CELL_W + 14 - 24, CELL_H + 10);
      g.fillStyle = '#f5f5f4';
      g.font = '600 25px "Geist", sans-serif';
      g.fillText(tr(`post.${p}`), 40, y + 30);
      g.fillStyle = '#78716c';
      g.font = '500 14px "Geist Mono", monospace';
      g.fillText(tr(`tags.${p}`), 40, y + 53);
      if (p === 'anlagenfuehrung' && supervisors > 0) {
        g.fillStyle = '#2dd4bf';
        g.font = '600 14px "Geist Mono", monospace';
        g.fillText(tr('supervision', { n: ctx.i18n.num(supervisors * 0.2, 1) }), 380, y + 53);
      }
    });
    for (let i = 0; i < 18; i++) cell(i);
    // own-post tag
    {
      const [x, y] = cellRect(OWN_SLOT);
      g.fillStyle = '#ff6700';
      g.font = '600 12px "Geist Mono", monospace';
      g.textAlign = 'center';
      g.fillText(tr('own'), x + CELL_W / 2, y + CELL_H + 13);
      g.textAlign = 'left';
    }
    // right column: empty count
    const ec = emptyCount(state);
    g.textAlign = 'center';
    g.fillStyle = '#a8a29e';
    g.font = '500 16px "Geist Mono", monospace';
    g.fillText(tr('emptyHead'), 1215, 220);
    g.fillStyle = '#f5f5f4';
    g.font = '700 76px "Space Grotesk", sans-serif';
    g.fillText(String(ec), 1215, 300);
    g.fillStyle = '#78716c';
    g.font = '500 18px "Geist Mono", monospace';
    g.fillText(tr('of18'), 1215, 330);
    const rob = robots.filter((r) => r.year <= year).length;
    if (rob) {
      g.fillStyle = '#2dd4bf';
      g.font = '600 16px "Geist Mono", monospace';
      g.fillText(tr('robotsN', { n: rob }), 1215, 372);
    }
    g.textAlign = 'left';
    // supervision flyers (a person token rising to Anlagenführung)
    for (const f of flyers) {
      const [sx, sy] = cellRect(f.slot);
      const tx = 380,
        ty = ROW_Y0 + 5 * ROW_H + 20;
      const k = Math.min(1, f.t / 1.4);
      const e = k * k * (3 - 2 * k);
      const x = sx + (tx - sx) * e,
        y = sy + (ty - sy) * e - Math.sin(Math.PI * e) * 60;
      g.fillStyle = '#2dd4bf';
      g.beginPath();
      g.arc(x + 14, y + 10, 9, 0, Math.PI * 2);
      g.fill();
      g.fillRect(x + 4, y + 22, 20, 18);
    }
    // footer
    g.fillStyle = '#78716c';
    g.font = '500 15px "Geist Mono", monospace';
    g.fillText(tr('footer'), 36, H - 22);
    cv.tex.needsUpdate = true;
  };

  const refreshState = (animate: boolean): void => {
    const next = rosterAt(year, robots);
    let changed = 0;
    let retiredNow = 0;
    next.forEach((s, i) => {
      if (!same(s, shown[i])) {
        flips[i] = { from: shown[i], to: s, t: 0, delay: animate ? changed * 0.045 : 0 };
        if (!animate) flips[i].t = 99;
        changed++;
        if (s.kind === 'retired') retiredNow++;
      }
    });
    state = next;
    shown = next.slice();
    if (animate && changed) sound.flip(Math.min(14, 4 + changed * 2 + retiredNow * 3));
    if (!ownSaid && state[OWN_SLOT].kind !== 'person' && state[OWN_SLOT].kind !== 'robot') {
      ownSaid = true;
      say('emi.ownPost');
    }
    dirty = true;
  };

  const setYear = (y: number): void => {
    const ny = Math.max(YEAR_MIN, Math.min(YEAR_MAX, Math.round(y)));
    if (ny === year) return;
    // step year by year so each retirement flips in sequence
    year = ny;
    refreshState(true);
    pending = null;
    api.onChange?.();
    ui?.refresh();
  };

  /** local centre of a wall cell (the wall faces −z, the canvas is mirrored) */
  const cellCentre = (i: number): THREE.Vector3 => {
    const [cx, cy] = cellRect(i);
    const x = WALL.x1 - ((cx + CELL_W / 2) / W) * (WALL.x1 - WALL.x0);
    const y = WALL.y1 - ((cy + CELL_H / 2) / H) * (WALL.y1 - WALL.y0);
    return new THREE.Vector3(x, y, WALL.z - 0.25);
  };
  let misfits = 0;
  const place = (slot: number, type: RobotType): boolean => {
    const post = slotPost(slot);
    const fit = FIT[post][type];
    const text = ctx.t(`roster.fb.${post}.${type}`);
    feedback = { slot, type, text, fit };
    feedbackShown = true;
    pending = null;
    api.onVerdict?.(fit, cellCentre(slot));
    if (fit === 'nein') {
      misfits++;
      shake[slot] = 1;
      ctx.audio.play('error');
      ui?.refresh();
      api.onChange?.();
      return false;
    }
    if (robots.length >= 3) return false;
    robots.push({ slot, type, year });
    automatedPost = post;
    automatedType = type;
    ctx.audio.play('success');
    if (HEAVY_POSTS.includes(post)) {
      flyers.push({ slot, t: 0 });
      ctx.after(1.4, () => {
        supervisors++;
        dirty = true;
      });
    }
    refreshState(true);
    api.onChange?.();
    ui?.refresh();
    return true;
  };

  const clickCell = (i: number): void => {
    const s = state[i];
    const r = robots.findIndex((rb) => rb.slot === i && rb.year <= year);
    if (r >= 0) {
      robots.splice(r, 1);
      if (HEAVY_POSTS.includes(slotPost(i)) && supervisors > 0) supervisors--;
      if (robots.length === 0) misfits = 0;
      feedback = null;
      refreshState(true);
      ui?.refresh();
      api.onChange?.();
      return;
    }
    if (s.kind === 'person') {
      shake[i] = 1;
      ctx.audio.play('error', { volume: 0.5 });
      ctx.hud.toast(ctx.i18n.text('claim'), { kind: 'info', duration: 3.5 });
      return;
    }
    if (slotPost(i) === 'anlagenfuehrung') {
      feedback = { slot: i, type: 'kognitiv', text: ctx.t('roster.fb.anlagenfuehrung.kognitiv'), fit: 'nein' };
      feedbackShown = true;
      misfits++;
      shake[i] = 1;
      api.onVerdict?.('nein', cellCentre(i));
      ui?.refresh();
      return;
    }
    if (robots.length >= 3) {
      ctx.hud.toast(ctx.i18n.text('roster.noTokens'), { kind: 'info' });
      return;
    }
    pending = i;
    ctx.audio.play('click');
    ui?.refresh();
  };

  // ── Bedienmodus: one panel, three decisions; the camera turns to the Waage while it runs ──
  const WALL_CAM = { pos: new THREE.Vector3(-10.85, 2.7, 0.0), look: new THREE.Vector3(-10.85, 2.65, 5.6) };
  const BEAM_CAM = { pos: new THREE.Vector3(-5.4, 2.3, 5.1), look: new THREE.Vector3(-6.4, 1.75, -1) };
  const qWall = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(WALL_CAM.pos, WALL_CAM.look, new THREE.Vector3(0, 1, 0)));
  const qBeam = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(BEAM_CAM.pos, BEAM_CAM.look, new THREE.Vector3(0, 1, 0)));
  let camT = 0;
  let camHold = 0;
  // the Waage's run is the input-free stretch (watching rule): marked from the click to the settled beam
  let marked = false;
  const operate = (): void => {
    // a fresh visit starts without the last verdict text (≤ 35 words at open; the wall keeps the tokens)
    feedback = null;
    pending = null;
    camT = 0;
    camHold = 0;
    waage.freshVisit();
    ctx.player.enterOperate({
      title: ctx.i18n.text('roster.opTitle'),
      // camera 2.35 m to the right of the wall centre: the whole wall sits left of the right-docked
      // panel (projected x 38–823 px at 1280 × 720) and below the objective card
      cameraPose: { position: [WALL_CAM.pos.x, WALL_CAM.pos.y, WALL_CAM.pos.z], lookAt: [WALL_CAM.look.x, WALL_CAM.look.y, WALL_CAM.look.z] },
      panelPosition: 'right',
      capture: {
        keys: [],
        camera(out) {
          const k = camT * camT * (3 - 2 * camT);
          out.position.lerpVectors(WALL_CAM.pos, BEAM_CAM.pos, k);
          out.quaternion.slerpQuaternions(qWall, qBeam, k);
        },
      },
      onPointer: (e) => {
        if (e.type !== 'down' || camT > 0.05) return;
        const d = e.direction;
        if (Math.abs(d.z) < 1e-4) return;
        const k = (WALL.z - e.origin.z) / d.z;
        if (k <= 0) return;
        const x = e.origin.x + d.x * k,
          y = e.origin.y + d.y * k;
        const px = ((WALL.x1 - x) / (WALL.x1 - WALL.x0)) * W;
        const py = ((WALL.y1 - y) / (WALL.y1 - WALL.y0)) * H;
        for (let i = 0; i < 18; i++) {
          const [cx, cy] = cellRect(i);
          if (px >= cx && px <= cx + CELL_W && py >= cy && py <= cy + CELL_H) {
            clickCell(i);
            return;
          }
        }
      },
      panel: (el) => {
        el.classList.add('df-roster');
        const style = document.createElement('style');
        style.textContent = ROSTER_CSS;
        const head = document.createElement('div');
        head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px';
        const eb = api.chips ? api.chips() : document.createElement('div');
        const chips = document.createElement('div');
        chips.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end';
        chips.append(ctx.ui.chip('illustrativ', tr('chipSource')), ctx.ui.chip('fiktion', ctx.t('schicht.fiktionSource')));
        head.append(eb, chips);
        // 1 · the year
        const s1 = document.createElement('div');
        s1.className = 'df-step';
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = String(YEAR_MIN);
        slider.max = String(YEAR_MAX);
        slider.step = '1';
        slider.value = String(year);
        slider.style.cssText = 'flex:1;accent-color:var(--orange)';
        slider.setAttribute('aria-label', tr('year'));
        slider.addEventListener('input', () => setYear(Number(slider.value)));
        const yv = document.createElement('div');
        yv.className = 'df-year';
        const status = document.createElement('div');
        status.className = 'df-sub';
        status.dataset.chip = 'ui';
        const s1row = document.createElement('div');
        s1row.style.cssText = 'display:flex;gap:10px;align-items:center';
        s1row.append(stepNo(1, tr('year')), slider, yv);
        s1.append(s1row, status);
        // 2 · a robot on an empty post (click the wall), the type, the verdict
        const s2 = document.createElement('div');
        s2.className = 'df-step';
        // 3 · „Rechnet sich das?“: the Waage
        const s3 = document.createElement('div');
        s3.className = 'df-step';
        el.append(style, head, s1, s2, s3);
        const refresh = (): void => {
          yv.textContent = String(year);
          slider.value = String(year);
          status.textContent = tr('statusShort', { y: year, n: emptyCount(state) });
          // 2
          s2.replaceChildren();
          const s2row = document.createElement('div');
          s2row.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap';
          const dots = document.createElement('span');
          dots.className = 'df-tokens';
          dots.title = tr('tokens');
          dots.textContent = [0, 1, 2].map((k) => (k < robots.length ? '●' : '○')).join('');
          s2row.append(stepNo(2, tr('robotStep')), dots);
          if (misfits > 0 && robots.length > 0) {
            const np = document.createElement('button');
            np.className = 'btn ghost';
            np.style.cssText = 'padding:3px 9px;font-size:12px;margin-left:auto';
            np.textContent = tr('newPlan');
            np.title = tr('newPlanHint');
            np.onclick = () => api.clearRobots();
            s2row.append(np);
          }
          s2.append(s2row);
          if (pending != null) {
            const how = document.createElement('div');
            how.className = 'df-sub';
            how.style.color = 'var(--text)';
            how.textContent = tr('choose', { post: tr(`post.${slotPost(pending)}`), shift: tr(`shift.${slotShift(pending)}`) });
            const seg = document.createElement('div');
            seg.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:4px';
            for (const ty of ['kognitiv', 'cobot', 'fest'] as RobotType[]) {
              const b = document.createElement('button');
              b.className = 'btn';
              b.style.cssText = 'padding:5px 9px;font-size:12.5px';
              b.textContent = tr(`type.${ty}`);
              b.onclick = () => {
                if (pending != null) place(pending, ty);
              };
              seg.append(b);
            }
            s2.append(how, seg);
          }
          if (feedback) {
            const fb = document.createElement('div');
            fb.style.cssText = `margin-top:6px;padding:8px 10px;border-radius:8px;border:1px solid ${feedback.fit === 'nein' ? 'rgba(248,113,113,.35)' : feedback.fit === 'pilot' ? 'rgba(251,191,36,.35)' : 'rgba(45,212,191,.35)'};font-size:12.5px;line-height:1.45;color:var(--text)`;
            const h = document.createElement('div');
            h.style.cssText = 'display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:3px';
            const ht = document.createElement('span');
            ht.className = 'mono';
            ht.style.cssText = 'font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:.08em';
            ht.textContent = `${tr(`post.${slotPost(feedback.slot)}`)} · ${tr(`type.${feedback.type}`)} → ${tr(`fit.${feedback.fit}`)}`;
            h.append(ht, ctx.ui.chip('richtwert', tr('fbSource')));
            const tx = document.createElement('div');
            tx.textContent = feedback.text;
            fb.append(h, tx);
            s2.append(fb);
          }
          // 3
          s3.replaceChildren();
          const ready = year >= 2030 && robots.length > 0;
          const s3row = document.createElement('div');
          s3row.style.cssText = 'display:flex;gap:10px;align-items:center';
          const go = document.createElement('button');
          go.className = ready ? 'btn primary' : 'btn';
          go.style.cssText = 'padding:6px 12px;font-size:13px;margin-left:auto';
          go.textContent = waage.running ? tr('waageRunning') : tr('waageGo');
          go.disabled = !ready || waage.running;
          go.title = ready ? '' : tr('waageWhen');
          go.onclick = () => {
            if (!ready || waage.running) return;
            camHold = 0;
            waage.run();
            ctx.game.unattended(true, 'schichtplan');
            marked = true;
            refresh();
          };
          s3row.append(stepNo(3, tr('waageStep')), go);
          s3.append(s3row);
          const r = waage.result();
          if (r) {
            const res = document.createElement('div');
            res.className = 'df-sub';
            res.style.color = r.ok ? 'var(--teal)' : 'var(--orange-light)';
            res.textContent = r.text;
            s3.append(res);
          }
          if (ready) {
            const more = document.createElement('details');
            more.className = 'df-more';
            const sm = document.createElement('summary');
            sm.textContent = `ⓘ ${tr('assumptions')}`;
            more.append(sm);
            const box = document.createElement('div');
            waage.controls(box, () => refresh());
            more.append(box);
            more.open = moreOpen;
            more.ontoggle = () => (moreOpen = more.open);
            s3.append(more);
          }
        };
        ui = { refresh };
        refresh();
        ctx.ui.hint(tr('howTo'), 4);
        return () => {
          ui = null;
        };
      },
      onExit: () => {
        if (marked) ctx.game.unattended(false, 'schichtplan');
        marked = false;
        camT = 0;
        api.onChange?.();
      },
    });
  };
  let moreOpen = false;
  const stepNo = (n: number, label: string): HTMLElement => {
    const d = document.createElement('span');
    d.className = 'df-stepno';
    d.innerHTML = `<b>${n}</b> ${label.replace(/[&<>"]/g, '')}`;
    return d;
  };
  ctx.addInteractable({ object: knob, label: ctx.i18n.text('roster.use'), range: 2.6, onInteract: operate });

  const api: Roster = {
    get year() {
      return year;
    },
    get robots() {
      return robots;
    },
    get feedbackShown() {
      return feedbackShown;
    },
    get automatedPost() {
      return automatedPost;
    },
    get automatedType() {
      return automatedType;
    },
    setYear,
    place,
    onChange: null,
    onVerdict: null,
    chips: null,
    passt: () => robots.filter((r) => FIT[slotPost(r.slot)][r.type] === 'passt').length,
    get misfits() {
      return misfits;
    },
    clearRobots() {
      robots.length = 0;
      supervisors = 0;
      misfits = 0;
      feedback = null;
      pending = null;
      refreshState(true);
      ui?.refresh();
      api.onChange?.();
    },
    operate,
    relabel() {
      dirty = true;
      ui?.refresh();
    },
    setDim(dark) {
      screenMat.color.setScalar(dark ? 0.08 : 1);
    },
    update(dt) {
      // the camera turns to the Waage while it runs and stays 2,5 s on the tipped beam
      if (waage.running) camHold = ROSTER.holdS;
      else {
        // the result is on the panel (input offered again) while the camera still rests on the beam
        if (marked) {
          marked = false;
          ctx.game.unattended(false, 'schichtplan');
        }
        if (camHold > 0) {
          camHold -= dt;
          if (camHold <= 0) ui?.refresh();
        }
      }
      const want = waage.running || camHold > 0 ? 1 : 0;
      camT = want ? Math.min(1, camT + dt / ROSTER.swingS) : Math.max(0, camT - dt / ROSTER.swingS);
      let anim = false;
      for (let i = 0; i < 18; i++) {
        const f = flips[i];
        if (f.t < f.delay + FLIP_S) {
          f.t += dt;
          anim = true;
        }
        if (shake[i] > 0) {
          shake[i] = Math.max(0, shake[i] - dt * 2.2);
          anim = true;
        }
      }
      for (let k = flyers.length - 1; k >= 0; k--) {
        flyers[k].t += dt;
        anim = true;
        if (flyers[k].t > 1.4) flyers.splice(k, 1);
      }
      if (anim || dirty) {
        draw();
        dirty = false;
      }
    },
  };
  draw();
  return api;
}

function same(a: SlotState, b: SlotState): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'person' && b.kind === 'person') return a.age === b.age && a.hired === b.hired;
  if (a.kind === 'robot' && b.kind === 'robot') return a.type === b.type;
  return true;
}

function pill(g: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, fill: string): void {
  g.font = '500 14px "Geist Mono", monospace';
  const w = g.measureText(text).width + 22;
  g.fillStyle = fill;
  g.strokeStyle = color;
  g.lineWidth = 1;
  const r = 11;
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + 2 * r, r);
  g.arcTo(x + w, y + 2 * r, x, y + 2 * r, r);
  g.arcTo(x, y + 2 * r, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
  g.globalAlpha = 0.45;
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = color;
  g.fillText(text, x + 11, y + 16);
}

const ROSTER_CSS = `
.df-roster .df-step { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-subtle); }
.df-roster .df-stepno { font-size: 13px; color: var(--text); white-space: nowrap; display: inline-flex; gap: 6px; align-items: center; }
.df-roster .df-stepno b { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--elevated); font-family: var(--font-mono); font-size: 11px; color: var(--orange-light); font-weight: 500; }
.df-roster .df-year { font-family: var(--font-display); font-weight: 700; font-size: 24px; color: var(--orange-light); min-width: 60px; text-align: right; }
.df-roster .df-sub { font-family: var(--font-mono); font-size: 12px; color: var(--text-2); margin-top: 4px; line-height: 1.4; }
.df-roster .df-tokens { font-size: 14px; letter-spacing: 3px; color: var(--teal); }
.df-roster .df-more { margin-top: 6px; font-size: 12px; color: var(--text-2); }
.df-roster .df-more summary { cursor: pointer; color: var(--text-2); }
`;
