/**
 * Station C — Prüfen (Messen), plan §4.5. A 12 × 4.5 m wall at x = −10 (z −12 … 0, facing +x) shows
 * 250 SO-101 episodes from „drei Werkbänken“ (25 × 10 tiles: a top-camera thumbnail with the task's
 * word, the jaw-speed trace). Defects: a 35-episode dead block (flat traces, the cube never moves), 12
 * „Kamera verschoben“ (the thumbnail's camera is off), 18 mislabelled (the task says „rot“, the arm
 * moved the blue cube). At the console the player measures the raw set first, marks (click, shift-click
 * = range, ctrl-click = add), filters, retrains and measures again: „Evaluieren“ runs n = 50 on two fixed
 * conditions, „bekannte Lagen“ and „neue Lagen“, in parallel lanes (≤ 8 s). The Kennlinie shows both per
 * version with Wilson 95 % bands (shown, not taught again). Model and data: ILLUSTRATIV. The zone's one
 * prediction lives in B (rc4's C prediction is dropped); the lesson is rc4's again.
 */
import * as THREE from 'three';
import type { ChallengeHandle, EmiHandle, KennlinieHandle, KennlinieSpec, Stars, ZoneContext } from '@/core/zones';
import { css } from '@/core/zones';
import { Batch } from './batch';
import { look } from './look';
import { CAM_N, COLS, CONDITIONS, DEAD_N, LABEL_N, MAX_DUR, N_EP, ROWS, SPARK, makeDataset, removalStats, seededRng, successRate, type Condition, type Dataset } from './dataset';
import { cardC } from './cards';
import { FLOOR_Y } from './pavilion';
import type { DojoSounds } from './sound';
import { STATION_C } from './tuning';

export const WALL = { x: -10, cz: -6, w: 12, h: 4.5, y0: FLOOR_Y + 0.42 } as const;
const CW = 1600,
  CH = 600,
  HEAD = 64;
const CELL_W = CW / COLS,
  CELL_H = (CH - HEAD) / ROWS;
const CONSOLE = { x: -5.4, z: -6 } as const;
const EVAL_N = STATION_C.n;
/** the dead block counts as found at ≥ 90 % of it with ≤ maxFalse good episodes removed */
const GOOD_DEAD = Math.ceil(DEAD_N * 0.9);
const MAX_FALSE = STATION_C.maxFalse;
type Step = 'measure0' | 'mark' | 'filter' | 'retrain' | 'measure1' | 'done';
const STEPS: Exclude<Step, 'done'>[] = ['measure0', 'mark', 'filter', 'retrain', 'measure1'];
/** EMI-05's place at the audit console (EMI drives there by way of the waypoint) */
export const EMI_AUDIT: [number, number, number] = [-3.7, FLOOR_Y, -3.95];

export interface Audit {
  update(dt: number, t: number): void;
  readonly done: boolean;
  readonly consoleTarget: [number, number, number];
  solve(): Promise<void>;
  /** debug: the ★★★ audit (dead block and the 18 mislabelled, no false removal, measured) */
  stars3(): Promise<void>;
  readonly challenge: ChallengeHandle;
  debugState(): Record<string, unknown>;
  hook(name: string, arg?: unknown): unknown;
}

interface Version {
  removed: Uint8Array;
  p: Record<Condition, number>;
  k: Record<Condition, number>;
  n: Record<Condition, number>;
  dead: number;
  falseRemovals: number;
  cam: number;
  label: number;
}

export function createAudit(ctx: ZoneContext, sounds: DojoSounds, emi: () => EmiHandle | null, goToAudit: () => void, ch: ChallengeHandle, changed: () => void): Audit {
  const M = ctx.materials;
  const seed = (Date.now() ^ 0x9e3779b9) >>> 0;
  const ds: Dataset = makeDataset(seed);
  const rnd = seededRng(seed ^ 0xabcdef);
  const removed = new Uint8Array(N_EP);
  const mkVersion = (rem: Uint8Array): Version => {
    const st = removalStats(ds, rem);
    return { removed: rem.slice(), p: { known: successRate(ds, rem, 'known'), novel: successRate(ds, rem, 'novel') }, k: { known: 0, novel: 0 }, n: { known: 0, novel: 0 }, dead: st.dead, falseRemovals: st.ok, cam: st.cam, label: st.label };
  };
  const versions: Version[] = [mkVersion(new Uint8Array(N_EP))];
  let current = 0;
  const sel = new Set<number>();
  let anchor = -1;
  let hover = -1;
  let training = 0;
  type Lane = { version: number; c: Condition; outcomes: Uint8Array; shown: number };
  let evalAnim: { t: number; lanes: Lane[] } | null = null;
  let operating = false;
  let greeted = false;
  const isGood = (v: Version): boolean => v.dead >= GOOD_DEAD && v.falseRemovals <= MAX_FALSE;
  const measured = (v: Version): boolean => v.n.known > 0 && v.n.novel > 0;
  const afterVersion = (): Version | null => {
    const c = versions[current];
    if (current > 0 && isGood(c) && measured(c)) return c;
    return versions.find((v, i) => i > 0 && isGood(v) && measured(v)) ?? null;
  };
  const step = (): Step => {
    if (!measured(versions[0])) return 'measure0';
    if (afterVersion()) return 'done';
    if (current > 0 && isGood(versions[current])) return 'measure1';
    const st = removalStats(ds, removed);
    if (st.dead >= GOOD_DEAD && st.ok <= MAX_FALSE) return 'retrain';
    let dead = 0;
    for (const e of ds.eps) if (e.kind === 'dead' && (removed[e.i] || sel.has(e.i))) dead++;
    if (sel.size && dead >= GOOD_DEAD) return 'filter';
    return 'mark';
  };
  const react = (key: string): void => {
    const e = emi();
    if (e) void e.say(ctx.i18n.text(key), { interrupt: true });
    else void ctx.hud.say(ctx.i18n.text(key), { speaker: 'EMI-05 ›', interrupt: true });
  };

  // ── wall (frame in exterior, canvas in detail) ─────────────────────────────
  const wallCX = WALL.x + 0.1,
    wallCY = WALL.y0 + WALL.h / 2;
  const b = new Batch();
  const LK = look(ctx);
  b.box(LK.carbon, 0.12, WALL.h + 0.16, WALL.w + 0.16, WALL.x - 0.02, wallCY, WALL.cz);
  b.box(LK.hull, 0.04, WALL.h + 0.12, WALL.w + 0.12, WALL.x - 0.1, wallCY, WALL.cz);
  for (const f of [0.25, 0.5, 0.75]) b.box(LK.alu, 0.012, 0.03, WALL.w + 0.12, WALL.x - 0.125, WALL.y0 - 0.06 + (WALL.h + 0.12) * f, WALL.cz);
  b.box(LK.alu, 0.16, 0.06, WALL.w + 0.28, WALL.x, WALL.y0 + WALL.h + 0.11, WALL.cz);
  b.box(LK.alu, 0.16, 0.06, WALL.w + 0.28, WALL.x, WALL.y0 - 0.11, WALL.cz);
  b.box(LK.alu, 0.16, WALL.h + 0.28, 0.06, WALL.x, wallCY, WALL.cz - WALL.w / 2 - 0.11);
  b.box(LK.alu, 0.16, WALL.h + 0.28, 0.06, WALL.x, wallCY, WALL.cz + WALL.w / 2 + 0.11);
  b.box(LK.light(0x2dd4bf, 0), 0.04, 0.02, WALL.w + 0.2, WALL.x + 0.06, WALL.y0 + WALL.h + 0.15, WALL.cz);
  for (const dz of [-WALL.w / 2 + 0.6, 0, WALL.w / 2 - 0.6]) b.box(LK.alu, 0.4, WALL.y0 - FLOOR_Y - 0.14, 0.1, WALL.x - 0.05, FLOOR_Y + (WALL.y0 - FLOOR_Y) / 2, WALL.cz + dz);
  b.build(ctx.groups.exterior, { castShadow: true, name: 'audit-wall' });
  ctx.physics.addStaticBox({ size: [0.6, WALL.h + 0.6, WALL.w + 0.3], position: [WALL.x - 0.1, FLOOR_Y + (WALL.h + 0.6) / 2, WALL.cz] });

  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const g = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  const wallMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(WALL.w, WALL.h), wallMat);
  wallMesh.rotation.y = Math.PI / 2;
  wallMesh.position.set(wallCX, wallCY, WALL.cz);
  ctx.groups.detail.add(wallMesh);
  const wallGlass = new THREE.Mesh(new THREE.PlaneGeometry(WALL.w, WALL.h), M.screen);
  wallGlass.rotation.y = Math.PI / 2;
  wallGlass.position.set(wallCX - 0.005, wallCY, WALL.cz);
  ctx.groups.exterior.add(wallGlass);
  ctx.onDispose(() => {
    tex.dispose();
    wallMat.dispose();
    wallMesh.geometry.dispose();
    wallGlass.geometry.dispose();
  });
  const hoverMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2dd4bf).multiplyScalar(1.8) });
  const cellW = WALL.w / COLS,
    cellH = (WALL.h * (CH - HEAD)) / CH / ROWS;
  const hb = new Batch();
  const th = 0.025;
  hb.box(hoverMat, th, th, cellW, 0, cellH / 2, 0);
  hb.box(hoverMat, th, th, cellW, 0, -cellH / 2, 0);
  hb.box(hoverMat, th, cellH, th, 0, 0, cellW / 2);
  hb.box(hoverMat, th, cellH, th, 0, 0, -cellW / 2);
  const hoverGroup = new THREE.Group();
  hb.build(hoverGroup, { castShadow: false, receiveShadow: false, name: 'hover' });
  hoverGroup.visible = false;
  ctx.groups.detail.add(hoverGroup);
  ctx.onDispose(() => hoverMat.dispose());
  const cellCenter = (i: number, out: THREE.Vector3): THREE.Vector3 => {
    const col = i % COLS,
      row = Math.floor(i / COLS);
    const u = (col + 0.5) / COLS;
    const v = (HEAD + (row + 0.5) * CELL_H) / CH;
    return out.set(wallCX + 0.02, wallCY + WALL.h / 2 - v * WALL.h, WALL.cz + WALL.w / 2 - u * WALL.w);
  };

  // ── console ────────────────────────────────────────────────────────────────
  const cb = new Batch();
  cb.box(LK.hull, 0.7, 0.9, 0.9, CONSOLE.x, FLOOR_Y + 0.45, CONSOLE.z);
  cb.box(LK.carbon, 0.62, 0.06, 1.0, CONSOLE.x - 0.08, FLOOR_Y + 1.0, CONSOLE.z, 0, 0, 0.32);
  cb.build(ctx.groups.detail, { castShadow: true, name: 'audit-console' });
  ctx.physics.addStaticBox({ size: [0.7, 1.0, 0.9], position: [CONSOLE.x, FLOOR_Y + 0.5, CONSOLE.z] });
  const consoleScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.78), M.screen);
  consoleScreen.rotation.order = 'YXZ';
  consoleScreen.rotation.y = Math.PI / 2;
  consoleScreen.rotation.x = -Math.PI / 2 + 0.32;
  consoleScreen.position.set(CONSOLE.x - 0.07, FLOOR_Y + 1.04, CONSOLE.z);
  ctx.groups.detail.add(consoleScreen);
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 24), M.accentTeal);
  button.position.set(CONSOLE.x + 0.24, FLOOR_Y + 0.93, CONSOLE.z + 0.3);
  ctx.groups.detail.add(button);
  ctx.onDispose(() => {
    consoleScreen.geometry.dispose();
    button.geometry.dispose();
  });

  // ── drawing ────────────────────────────────────────────────────────────────
  const FIELD_XY: [number, number][] = [
    [0.18, 0.32],
    [0.34, 0.55],
    [0.5, 0.42],
    [0.6, 0.7],
    [0.78, 0.5],
  ];
  const thumb = (e: (typeof ds.eps)[number], x0: number, y0: number, w: number, h: number): void => {
    g.save();
    g.beginPath();
    g.rect(x0, y0, w, h);
    g.clip();
    g.fillStyle = '#3a3633';
    g.fillRect(x0, y0, w, h);
    g.translate(x0 + w / 2, y0 + h / 2);
    g.rotate(e.camRot);
    g.translate(e.camDx * w, e.camDy * h);
    g.translate(-w / 2, -h / 2);
    // bench mat, the Kiste (right), the two cubes at their fields
    g.fillStyle = '#9b948a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#26231f';
    g.fillRect(w * 0.82, h * 0.12, w * 0.15, h * 0.32);
    const px = (f: number): [number, number] => [FIELD_XY[f][0] * w, FIELD_XY[f][1] * h];
    const [mx, my] = px(e.field),
      [ox, oy] = px(e.other);
    const s = Math.max(3, w * 0.09);
    // the moved cube's path to the Kiste (none in the dead block: the cube stays)
    if (e.kind !== 'dead') {
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(mx, my);
      g.quadraticCurveTo((mx + w * 0.88) / 2, Math.min(my, h * 0.28) - h * 0.12, w * 0.89, h * 0.28);
      g.stroke();
    }
    const red = e.moved === 'rot' ? [mx, my] : [ox, oy];
    const blue = e.moved === 'blau' ? [mx, my] : [ox, oy];
    g.fillStyle = '#d83a2e';
    g.fillRect(red[0] - s / 2, red[1] - s / 2, s, s);
    g.fillStyle = '#2f6fd6';
    g.fillRect(blue[0] - s / 2, blue[1] - s / 2, s, s);
    g.restore();
  };
  const selected = (i: number): boolean => sel.has(i);
  const drawWall = (): void => {
    g.fillStyle = '#121110';
    g.fillRect(0, 0, CW, CH);
    g.font = `500 19px "Geist Mono", monospace`;
    g.fillStyle = css.orange;
    g.fillText(ctx.t('wall.eyebrow').toUpperCase(), 22, 28);
    g.font = `400 16px "Geist", sans-serif`;
    g.fillStyle = css.textSecondary;
    const stats = removalStats(ds, removed);
    const nRem = stats.dead + stats.cam + stats.label + stats.ok;
    g.fillText(ctx.t('wall.sub', { n: N_EP - nRem, r: nRem, v: current }), 22, 52);
    g.font = `500 15px "Geist Mono", monospace`;
    const chip = ctx.t('wall.chip');
    const cw = g.measureText(chip).width + 24;
    g.fillStyle = 'rgba(251,191,36,0.15)';
    g.fillRect(CW - 22 - cw, 18, cw, 30);
    g.strokeStyle = 'rgba(251,191,36,0.55)';
    g.lineWidth = 1.5;
    g.strokeRect(CW - 22 - cw, 18, cw, 30);
    g.fillStyle = css.warning;
    g.fillText(chip, CW - 22 - cw + 12, 39);
    for (const e of ds.eps) {
      const col = e.i % COLS,
        row = Math.floor(e.i / COLS);
      const x0 = col * CELL_W,
        y0 = HEAD + row * CELL_H;
      const isRem = !!removed[e.i];
      const isSel = selected(e.i);
      g.fillStyle = isSel ? 'rgba(45,212,191,0.16)' : '#1a1816';
      g.fillRect(x0 + 2, y0 + 2, CELL_W - 4, CELL_H - 4);
      thumb(e, x0 + 5, y0 + 5, 26, 18);
      // the task's word, the episode number
      g.font = `600 10px "Geist Mono", monospace`;
      g.fillStyle = e.word === 'rot' ? '#f0796f' : '#7fa8ee';
      g.fillText(ctx.t(`wall.word.${e.word}`), x0 + 34, y0 + 14);
      g.font = `400 9px "Geist Mono", monospace`;
      g.fillStyle = '#57534e';
      g.fillText(String(e.i + 1), x0 + CELL_W - 6 - g.measureText(String(e.i + 1)).width, y0 + 23);
      // the jaw-speed trace, width ∝ duration
      const sx = x0 + 5,
        sw = (CELL_W - 10) * Math.min(1, e.dur / MAX_DUR),
        base = y0 + CELL_H - 6,
        hh = CELL_H - 32;
      g.strokeStyle = isRem ? '#3d3d3d' : css.teal;
      g.lineWidth = 1.4;
      g.beginPath();
      for (let k = 0; k < SPARK; k++) {
        const x = sx + (k / (SPARK - 1)) * sw;
        const y = base - Math.min(1, e.v[k] / 0.36) * hh;
        if (k) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
      if (isRem) {
        g.strokeStyle = '#57534e';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x0 + 6, y0 + CELL_H - 6);
        g.lineTo(x0 + CELL_W - 6, y0 + 6);
        g.stroke();
      }
      if (isSel) {
        g.strokeStyle = css.teal;
        g.lineWidth = 2;
        g.strokeRect(x0 + 2, y0 + 2, CELL_W - 4, CELL_H - 4);
      }
    }
    tex.needsUpdate = true;
  };

  // ── Kennlinie: both conditions per version ──────────────────────────────────
  const spec = (): KennlinieSpec => {
    const series = CONDITIONS.map((c) => ({ id: c, label: ctx.i18n.text(`kl.${c}`), trials: versions.map((v, i) => ({ x: i, k: v.k[c], n: v.n[c] })).filter((t) => t.n > 0) }));
    const last = versions[current];
    return {
      title: ctx.i18n.text('kl.title'),
      xLabel: ctx.i18n.text('kl.x'),
      yLabel: ctx.i18n.text('kl.y'),
      chip: 'illustrativ',
      band: 'wilson95',
      percent: true,
      xMin: -0.3,
      xMax: Math.max(2, versions.length - 1) + 0.3,
      yMin: 0,
      yMax: 1,
      keyValue: last.n.known ? ctx.ui.formatRate(last.k.known, last.n.known) : undefined,
      series,
    };
  };
  let kl: KennlinieHandle | null = null;
  const refreshKl = (): void => kl?.update(spec());

  // ── operate panel ──────────────────────────────────────────────────────────
  let panelEl: HTMLElement | null = null;
  let infoEl: HTMLElement | null = null;
  const button_ = (label: string, onClick: () => void, cls = 'btn', disabled = false, key?: string): HTMLButtonElement => {
    const bt = document.createElement('button');
    bt.className = cls;
    bt.style.cssText = 'padding:7px 11px;font-size:13px';
    bt.disabled = disabled;
    if (disabled) bt.style.opacity = '0.4';
    bt.innerHTML = `${esc(label)}${key ? ` <span class="kbd">${key}</span>` : ''}`;
    bt.onclick = (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLButtonElement).blur();
      onClick();
    };
    return bt;
  };
  const infoText = (): string => {
    const st = removalStats(ds, removed);
    const nRem = st.dead + st.cam + st.label + st.ok;
    const parts: string[] = [];
    parts.push(sel.size ? ctx.t('sel.n', { n: sel.size }) : ctx.t('sel.none'));
    if (nRem) parts.push(ctx.t('sel.removed', { n: nRem }));
    if (hover >= 0) {
      const e = ds.eps[hover];
      parts.push(ctx.t('sel.hover', { i: hover + 1, w: ctx.t(`wall.word.${e.word}`), t: ctx.i18n.num(e.dur, 1) }));
    }
    if (training > 0) parts.push(ctx.t('status.trainC'));
    else if (evalAnim) parts.push(ctx.t('status.eval'));
    return parts.join(' · ');
  };
  const renderPanel = (): void => {
    const el = panelEl;
    if (!el) return;
    el.replaceChildren();
    const busy = training > 0 || !!evalAnim;
    const now = step();
    el.appendChild(ch.chips());
    const at = now === 'done' ? STEPS.length : STEPS.indexOf(now);
    const row0 = document.createElement('div');
    row0.className = 'mono';
    row0.style.cssText = 'display:flex;gap:4px;align-items:center;margin:9px 0 2px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-2)';
    STEPS.forEach((k, i) => {
      const d = document.createElement('i');
      d.title = ctx.t(`audit.step.${k}`);
      d.style.cssText = `display:inline-block;width:18px;height:4px;border-radius:2px;background:${i < at ? 'var(--teal)' : i === at ? 'var(--orange)' : 'var(--elevated)'}`;
      row0.appendChild(d);
    });
    const stepLabel = document.createElement('span');
    stepLabel.style.marginLeft = '6px';
    stepLabel.textContent = now === 'done' ? '✓' : ctx.t(`audit.step.${now}`);
    row0.appendChild(stepLabel);
    el.appendChild(row0);
    const tooMany = removalStats(ds, removed).ok > MAX_FALSE;
    const hintEl = document.createElement('div');
    hintEl.style.cssText = `font-size:13px;margin-top:6px;line-height:1.4;color:${tooMany ? 'var(--warning)' : 'var(--text)'}`;
    hintEl.textContent = tooMany && now !== 'done' ? ctx.t('audit.do.tooMany', { n: removalStats(ds, removed).ok }) : now === 'done' ? '' : ctx.t(`audit.do.${now}`, { v: versions.length });
    if (hintEl.textContent) el.appendChild(hintEl);
    infoEl = document.createElement('div');
    infoEl.className = 'mono';
    infoEl.style.cssText = 'font-size:12px;color:var(--teal);margin-top:5px;min-height:17px;line-height:1.4';
    infoEl.textContent = infoText();
    if (now !== 'done' || sel.size || hover >= 0) el.appendChild(infoEl);
    const row = document.createElement('div');
    row.className = 'op-row';
    row.append(
      button_(ctx.t('btn.filter'), () => filterSel(), 'btn', !sel.size || busy, 'X'),
      button_(ctx.t('btn.resetFilter'), () => resetFilter(), 'btn ghost', busy),
      button_(ctx.t('btn.retrain'), () => retrain(), now === 'retrain' ? 'btn primary' : 'btn', busy || sameSet(removed, versions[current].removed) || !measured(versions[0]), 'T'),
      button_(ctx.t('btn.eval'), () => evaluate(), now === 'measure0' || now === 'measure1' || now === 'done' ? 'btn primary' : 'btn', busy),
    );
    el.appendChild(row);
    const cmp = compareLine();
    if (cmp) {
      const ver = document.createElement('div');
      ver.className = 'mono line';
      ver.style.cssText = `font-size:12px;margin-top:8px;line-height:1.4;color:var(--teal)`;
      ver.append(document.createTextNode(cmp + ' '), ctx.ui.chip('illustrativ', ctx.i18n.text('chipIllu')));
      el.appendChild(ver);
    }
    kl = ctx.ui.kennlinie(spec(), { parent: el, width: 360, height: 136 });
    if (!cmp) {
      const chips = document.createElement('div');
      chips.style.cssText = 'display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center';
      chips.append(ctx.ui.chip('illustrativ', ctx.i18n.text('chipIllu')));
      chips.title = ctx.t('chipSimC');
      el.appendChild(chips);
    }
  };
  /** „v0: bekannte Lagen 70 % · neue 40 % → v1: 92 % · 54 % (n = 50 je)“ once both are measured */
  const compareLine = (): string | null => {
    const b0 = versions[0],
      a = afterVersion();
    if (!a || !measured(b0)) return null;
    const pc = (v: Version, c: Condition): string => `${Math.round((v.k[c] / v.n[c]) * 100)} %`;
    return ctx.t('audit.compare', { k0: pc(b0, 'known'), n0: pc(b0, 'novel'), v: versions.indexOf(a), k1: pc(a, 'known'), n1: pc(a, 'novel'), n: EVAL_N });
  };
  const refreshInfo = (): void => {
    if (infoEl) infoEl.textContent = infoText();
  };

  // ── actions ────────────────────────────────────────────────────────────────
  const filterSel = (): void => {
    if (!sel.size || training > 0 || evalAnim) return;
    let n = 0;
    for (const i of sel) {
      if (!removed[i]) n++;
      removed[i] = 1;
    }
    sel.clear();
    anchor = -1;
    sounds.whoosh();
    if (n > 0) {
      ctx.game.juice.popup([WALL.x + 0.4, WALL.y0 + WALL.h + 0.5, WALL.cz], ctx.i18n.text('game.c.filterPop', { n }), { tone: 'teal', seconds: 1.4 });
      ctx.game.juice.cue('tick');
    }
    drawWall();
    renderPanel();
  };
  const resetFilter = (): void => {
    removed.fill(0);
    sel.clear();
    anchor = -1;
    ctx.audio.play('click');
    drawWall();
    renderPanel();
  };
  const retrain = (): void => {
    if (training > 0 || evalAnim || sameSet(removed, versions[current].removed)) return;
    if (!measured(versions[0])) {
      ctx.hud.toast(ctx.i18n.text('audit.do.measure0'), { kind: 'info', duration: 3 });
      return;
    }
    training = 2;
    sounds.trainHum(2);
    ctx.game.unattended(true, 'datensatz-audit');
    renderPanel();
  };
  const trainDone = (): void => {
    ctx.game.unattended(false, 'datensatz-audit');
    versions.push(mkVersion(removed));
    current = versions.length - 1;
    sounds.chime();
    drawWall();
    renderPanel();
    refreshKl();
  };
  const draw = (p: number): Uint8Array => {
    const o = new Uint8Array(EVAL_N);
    for (let i = 0; i < EVAL_N; i++) o[i] = rnd() < p ? 1 : 0;
    return o;
  };
  /** n = 50 per condition, in parallel lanes: the current version, and the raw one if it is not measured yet */
  const evaluate = (): void => {
    if (training > 0 || evalAnim) return;
    const lanes: Lane[] = [];
    const vs = new Set<number>([current]);
    if (!measured(versions[0])) vs.add(0);
    for (const vi of vs) for (const c of CONDITIONS) lanes.push({ version: vi, c, outcomes: draw(versions[vi].p[c]), shown: 0 });
    evalAnim = { t: 0, lanes };
    ctx.game.unattended(true, 'datensatz-audit');
    ctx.audio.play('click');
    renderPanel();
  };
  const evalDone = (): void => {
    const a = evalAnim!;
    for (const l of a.lanes) {
      const v = versions[l.version];
      let k = 0;
      for (const o of l.outcomes) k += o;
      v.k[l.c] += k;
      v.n[l.c] += EVAL_N;
    }
    evalAnim = null;
    ctx.game.unattended(false, 'datensatz-audit');
    ctx.audio.play('success', { volume: 0.5 });
    renderPanel();
    refreshKl();
    checkStamp();
  };
  const checkStamp = (): void => {
    const before = versions[0];
    const after = afterVersion();
    if (!measured(before) || !after) return;
    const first = !ctx.pass.has('datensatz-audit');
    const fmt = (v: Version, c: Condition): string => {
      const [p, lo, hi] = ctx.ui.wilson(v.k[c], v.n[c]);
      return `${Math.round(p * 100)} % [${Math.round(lo * 100)}–${Math.round(hi * 100)}]`;
    };
    ctx.pass.award('datensatz-audit', {
      value: {
        de: `Totblock raus · bekannte Lagen ${fmt(after, 'known')} · neue Lagen ${fmt(after, 'novel')} (n = ${after.n.known} je)`,
        en: `Dead block out · known poses ${fmt(after, 'known')} · new poses ${fmt(after, 'novel')} (n = ${after.n.known} each)`,
      },
      curve: versions.filter(measured).map((v) => v.k.known / v.n.known),
    });
    // ★ dead block out (≤ 5 false removals) + before/after · ★★ no false removal · ★★★ also the mislabelled or the camera-shift episodes
    const starsOf = (v: Version): Stars => (!isGood(v) || !measured(v) ? 0 : v.falseRemovals > 0 ? 1 : v.label >= LABEL_N || v.cam >= CAM_N ? 3 : 2);
    let bestV = after;
    for (const v of versions) if (v !== versions[0] && starsOf(v) > starsOf(bestV)) bestV = v;
    const stars = Math.max(1, starsOf(bestV)) as Stars;
    if (first || stars > ch.stars) {
      const pk = Math.round((bestV.k.known / bestV.n.known) * 100);
      ch.submit(pk, {
        stars,
        detail: stars === 2 ? ctx.i18n.text('game.c.more') : ctx.i18n.text('game.c.detail', { f: bestV.falseRemovals, l: bestV.label, c: bestV.cam }),
      });
    }
    if (first) {
      react('emi.cDone');
      changed();
    }
  };

  const select = (i: number, shift: boolean, add: boolean): void => {
    if (shift && anchor >= 0) {
      const [a, b2] = [Math.min(anchor, i), Math.max(anchor, i)];
      for (let k = a; k <= b2; k++) sel.add(k);
    } else if (add) {
      if (sel.has(i)) sel.delete(i);
      else sel.add(i);
      anchor = i;
    } else {
      sel.clear();
      sel.add(i);
      anchor = i;
    }
    ctx.audio.play('click', { volume: 0.6 });
    drawWall();
    renderPanel();
  };

  // ── operate ────────────────────────────────────────────────────────────────
  const wallHit = (o: THREE.Vector3, d: THREE.Vector3): number => {
    if (Math.abs(d.x) < 1e-5) return -1;
    const t = (wallCX - o.x) / d.x;
    if (t < 0) return -1;
    const y = o.y + d.y * t,
      z = o.z + d.z * t;
    const u = (WALL.cz + WALL.w / 2 - z) / WALL.w;
    const v = (wallCY + WALL.h / 2 - y) / WALL.h;
    const py = v * CH - HEAD;
    if (u < 0 || u >= 1 || py < 0 || py >= CH - HEAD) return -1;
    return Math.floor(py / CELL_H) * COLS + Math.floor(u * COLS);
  };
  const _c = new THREE.Vector3();
  const setHover = (i: number): void => {
    if (i === hover) return;
    hover = i;
    hoverGroup.visible = i >= 0 && operating;
    if (i >= 0) {
      hoverGroup.position.copy(cellCenter(i, _c));
      sounds.tick();
    }
    refreshInfo();
  };
  const enterOperate = (): void => {
    operating = true;
    ctx.player.enterOperate({
      title: ctx.i18n.text('audit.bar'),
      cameraPose: { position: [WALL.x + 7.9, FLOOR_Y + 2.45, WALL.cz - 2.75], lookAt: [WALL.x, FLOOR_Y + 2.6, WALL.cz - 2.75] },
      panelPosition: 'right',
      panel: (el) => {
        panelEl = el;
        renderPanel();
        return () => {
          if (panelEl === el) panelEl = null;
          kl = null;
        };
      },
      onPointer: (e) => {
        const i = wallHit(e.origin, e.direction);
        if (e.type === 'move') setHover(i);
        else if (e.type === 'down' && e.button === 0 && i >= 0) select(i, ctx.input.isDown('ShiftLeft') || ctx.input.isDown('ShiftRight'), ctx.input.isDown('ControlLeft') || ctx.input.isDown('ControlRight') || ctx.input.isDown('MetaLeft') || ctx.input.isDown('MetaRight'));
      },
      onExit: () => {
        operating = false;
        hoverGroup.visible = false;
        hover = -1;
        ctx.ui.status(null);
      },
    });
    ctx.ui.status(ctx.i18n.text('audit.status'));
    goToAudit();
    if (!greeted) {
      greeted = true;
      react('emi.c');
    }
  };
  ctx.addInteractable({ object: button, label: ctx.i18n.text('console.labelC'), hint: ctx.i18n.text('console.hintC'), range: 2.8, isEnabled: () => !operating, onInteract: enterOperate });
  ctx.input.onKey(
    ['KeyX', 'KeyT'],
    (code) => {
      if (!operating) return;
      if (code === 'KeyX') filterSel();
      else retrain();
    },
    { whileOperating: true },
  );
  ctx.i18n.onChange(() => {
    drawWall();
    renderPanel();
  });
  drawWall();
  void cardC;

  const measureNow = (v: Version): void => {
    for (const c of CONDITIONS) {
      let k = 0;
      for (const o of draw(v.p[c])) k += o;
      v.k[c] += k;
      v.n[c] += EVAL_N;
    }
  };

  return {
    get done() {
      return ctx.pass.has('datensatz-audit');
    },
    consoleTarget: [CONSOLE.x + 0.8, 0, CONSOLE.z],
    challenge: ch,
    update(dt) {
      if (training > 0) {
        training -= dt;
        if (training <= 0) {
          training = 0;
          trainDone();
        }
      }
      if (evalAnim) {
        evalAnim.t += dt;
        const shown = Math.min(EVAL_N, Math.floor((evalAnim.t / STATION_C.evalS) * EVAL_N));
        for (const l of evalAnim.lanes)
          if (shown !== l.shown) {
            const o = l.outcomes[shown - 1];
            if (l === evalAnim.lanes[0]) ctx.audio.beep(o ? 1760 : 660, 0.012, { volume: 0.1 });
            l.shown = shown;
          }
        if (evalAnim.t > STATION_C.evalS + 0.3) evalDone();
      }
    },
    async stars3() {
      if (!measured(versions[0])) measureNow(versions[0]);
      removed.fill(0);
      for (const e of ds.eps) if (e.kind === 'dead' || e.kind === 'label') removed[e.i] = 1;
      versions.push(mkVersion(removed));
      current = versions.length - 1;
      measureNow(versions[current]);
      drawWall();
      renderPanel();
      refreshKl();
      checkStamp();
    },
    async solve() {
      measureNow(versions[0]);
      removed.fill(0);
      for (let i = 0; i < DEAD_N; i++) removed[ds.deadStart + i] = 1;
      // one good episode next to the block goes too (a ★ audit; ★★ needs 0 false removals)
      const spare = ds.deadStart + DEAD_N < N_EP && ds.eps[ds.deadStart + DEAD_N].kind === 'ok' ? ds.deadStart + DEAD_N : ds.deadStart - 1;
      if (spare >= 0 && ds.eps[spare].kind === 'ok') removed[spare] = 1;
      versions.push(mkVersion(removed));
      current = versions.length - 1;
      measureNow(versions[current]);
      drawWall();
      renderPanel();
      refreshKl();
      checkStamp();
    },
    debugState() {
      const st = removalStats(ds, removed);
      return { seed, deadStart: ds.deadStart, removed: st, versions: versions.map((v) => ({ p: { known: +v.p.known.toFixed(3), novel: +v.p.novel.toFixed(3) }, k: v.k, n: v.n, dead: v.dead, falseRemovals: v.falseRemovals, label: v.label, cam: v.cam })), current, sel: [...sel], operating, step: step() };
    },
    hook(name, arg) {
      switch (name) {
        case 'selectDead':
          sel.clear();
          for (let i = 0; i < DEAD_N; i++) sel.add(ds.deadStart + i);
          drawWall();
          renderPanel();
          return sel.size;
        case 'selectLabels':
          sel.clear();
          for (const e of ds.eps) if (e.kind === 'label') sel.add(e.i);
          drawWall();
          renderPanel();
          return sel.size;
        case 'filter':
          filterSel();
          return removalStats(ds, removed);
        case 'retrain':
          retrain();
          return true;
        case 'eval':
          evaluate();
          return true;
        case 'hover':
          setHover(Number(arg));
          return hover;
      }
      return null;
    },
  };
}

function sameSet(a: Uint8Array, b: Uint8Array): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
