/**
 * Station C „Drei Auditoren, kurz“ (Messen; plan §4.7, rev 2; a side station in Entdecker mode, D40): the
 * Auswertetisch. Six authored replays (the second arm re-performs each recorded trial in place, 2× by
 * default, looping). The player tags each clip (keys 1–6); two faceless auditor figures have fixed
 * round-1 tags and disagree on the three ambiguous clips. A κ needle (0–1, the 0,8 mark; the number small
 * beside it) shows the mean pairwise Cohen's κ. Round 1 always refuses (κ ≤ 0,52 < 0,8 for any tagging):
 * „erst Erfolg als Regel definieren“. Round 2: define success as a rule (tolerance, time limit, regrasp) —
 * the auditors now tag by the rule, the player re-tags the three marked clips; κ ≥ 0,8 → the
 * Failure-Mode-Report prints. ★ report printed · ★★ no refusal in round 2 · ★★★ κ ≥ 0,9.
 */
import * as THREE from 'three';
import { FONT_DISPLAY, FONT_MONO, makeCanvas, Painter } from './geom';
import type { LineCell } from './line';
import type { Messzelle } from './messzelle';
import { CLIPS, classify, KAPPA_MIN, LIMIT_CHOICES, meanKappa, TAG_INDEX, TAGS, TOL_CHOICES, type Rule, type Tag } from './model';
import { AUDIT } from './tuning';
import type { Shared } from './state';
import type { ChallengeHandle, InfoCardSpec, Stars } from '@/core/zones';

const TABLE = { x: 6, z: 6, y: 0.76, w: 2.7, d: 0.95 };
const SEATS = { b: 5.05, you: 6.0, c: 6.95, z: 6.82 };

export interface Audit {
  readonly challenge: ChallengeHandle;
  /** debug: a ★★★ agreement */
  stars3(): void;
  solve(): void;
}

export function buildAudit(S: Shared, line: LineCell, cell: Messzelle): Audit {
  const ctx = S.ctx;
  const M = ctx.materials;
  const det = ctx.groups.detail;

  // ── table, chairs, auditors (detail) ─────────────────────────────────────
  const furn = new Painter()
    .box(TABLE.w, 0.05, TABLE.d, [TABLE.x, TABLE.y, TABLE.z], 0x292524)
    .box(TABLE.w - 0.1, 0.02, TABLE.d - 0.1, [TABLE.x, TABLE.y + 0.03, TABLE.z], 0x1f1d1b)
    .box(TABLE.w + 0.01, 0.012, TABLE.d + 0.01, [TABLE.x, TABLE.y - 0.02, TABLE.z], 0xa8a29e);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) furn.box(0.06, TABLE.y, 0.06, [TABLE.x + sx * (TABLE.w / 2 - 0.08), TABLE.y / 2, TABLE.z + sz * (TABLE.d / 2 - 0.08)], 0x1c1917);
  // Phase 5: task chairs (carbon shell, alu post, five-star base) instead of plain boxes
  for (const x of [SEATS.b, SEATS.you, SEATS.c]) {
    furn.rbox(0.48, 0.06, 0.46, 0.025, [x, 0.47, SEATS.z], 0x1c1917);
    furn.rbox(0.46, 0.46, 0.045, 0.02, [x, 0.79, SEATS.z + 0.24], 0x1c1917, [-0.12, 0, 0]);
    furn.box(0.04, 0.3, 0.03, [x, 0.6, SEATS.z + 0.22], 0xa8a29e, [-0.12, 0, 0]);
    furn.cyl(0.022, 0.026, 0.38, [x, 0.25, SEATS.z], 0xa8a29e);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.3;
      furn.box(0.025, 0.025, 0.26, [x + Math.sin(a) * 0.13, 0.04, SEATS.z + Math.cos(a) * 0.13], 0x292524, [0, a, 0]);
      furn.cyl(0.022, 0.022, 0.03, [x + Math.sin(a) * 0.26, 0.016, SEATS.z + Math.cos(a) * 0.26], 0x0c0a09);
    }
  }
  // faceless auditor figures (design mannequins: stone suit, ceramic head with a carbon visor), seated
  // facing the table; limbs are capsules between joints, the torso a flattened lathe
  const limb = (a: THREE.Vector3, b: THREE.Vector3, r: number, color: number): void => {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = Math.max(0.01, d.length() - 2 * r * 0.6);
    const g = new THREE.CapsuleGeometry(r, len, 4, 12);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
    const m = a.clone().add(b).multiplyScalar(0.5);
    furn.add(g, color, [m.x, m.y, m.z]);
  };
  const torsoProfile = [
    [0, 0],
    [0.12, 0.0],
    [0.135, 0.06],
    [0.125, 0.2],
    [0.15, 0.36],
    [0.175, 0.5],
    [0.16, 0.56],
    [0.08, 0.6],
    [0, 0.61],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const SUIT = 0xa8a29e,
    JOINT = 0x78716c;
  for (const x of [SEATS.b, SEATS.c]) {
    const z = SEATS.z + 0.02;
    const V = (dx: number, y: number, dz: number): THREE.Vector3 => new THREE.Vector3(x + dx, y, z + dz);
    const torso = new THREE.LatheGeometry(torsoProfile, 28).scale(1, 1, 0.68).rotateX(-0.1);
    furn.add(torso, SUIT, [x, 0.5, z + 0.03]);
    furn.cyl(0.042, 0.048, 0.1, [x, 1.13, z - 0.02], JOINT);
    for (const sx of [-1, 1]) {
      // arm: shoulder → elbow (beside the ribs) → hand on the table edge
      const sh = V(sx * 0.17, 1.03, -0.02),
        el = V(sx * 0.2, 0.84, -0.16),
        ha = V(sx * 0.13, 0.81, -0.42);
      furn.add(new THREE.SphereGeometry(0.055, 14, 10), JOINT, [sh.x, sh.y, sh.z]);
      limb(sh, el, 0.045, SUIT);
      limb(el, ha, 0.04, SUIT);
      furn.add(new THREE.SphereGeometry(0.038, 12, 8).scale(1, 0.7, 1.3), 0xe7e5e4, [ha.x, ha.y + 0.005, ha.z - 0.02]);
      // leg: hip → knee (on the seat, forward) → ankle
      const hip = V(sx * 0.085, 0.53, 0.0),
        kn = V(sx * 0.1, 0.55, -0.4),
        an = V(sx * 0.1, 0.1, -0.44);
      limb(hip, kn, 0.065, SUIT);
      limb(kn, an, 0.052, SUIT);
      furn.rbox(0.09, 0.06, 0.2, 0.025, [an.x, 0.035, an.z - 0.05], 0x292524);
    }
  }
  det.add(furn.mesh(M.standard({ vertexColors: true, roughness: 0.55, metalness: 0.08 }), { cast: true }));
  ctx.physics.addStaticBox({ size: [TABLE.w, TABLE.y + 0.03, TABLE.d], position: [TABLE.x, (TABLE.y + 0.03) / 2, TABLE.z] });
  for (const x of [SEATS.b, SEATS.c]) ctx.physics.addStaticBox({ size: [0.5, 1.3, 0.55], position: [x, 0.65, SEATS.z] });
  // heads (turn to each other when they disagree): ceramic, a dark visor band where a face would be
  const headMat = M.standard({ color: 0xe7e5e4, roughness: 0.35, metalness: 0.05 });
  const visorMat = M.standard({ color: 0x1c1917, roughness: 0.15, metalness: 0.3 });
  const headGeo = new THREE.SphereGeometry(0.115, 24, 16).scale(0.9, 1.08, 1);
  const visorGeo = new THREE.SphereGeometry(0.118, 24, 8, Math.PI * 0.5 - 0.95, 1.9, Math.PI * 0.36, Math.PI * 0.2).scale(0.9, 1.08, 1);
  ctx.onDispose(() => {
    headGeo.dispose();
    visorGeo.dispose();
  });
  const heads = [SEATS.b, SEATS.c].map((x) => {
    const h = new THREE.Group();
    const hm = new THREE.Mesh(headGeo, headMat);
    hm.castShadow = true;
    const vm = new THREE.Mesh(visorGeo, visorMat);
    // the visor band faces −z (the table)
    vm.rotation.y = Math.PI;
    h.add(hm, vm);
    h.position.set(x, 1.31, SEATS.z - 0.01);
    det.add(h);
    return h;
  });
  ctx.hud.worldLabel([SEATS.b, 1.65, SEATS.z], ctx.i18n.text('audit.b'), { maxDistance: 9, kind: 'muted' });
  ctx.hud.worldLabel([SEATS.c, 1.65, SEATS.z], ctx.i18n.text('audit.c'), { maxDistance: 9, kind: 'muted' });

  // tablets: one canvas, three regions (B · you · C) + κ dial
  const tab = makeCanvas(1024, 256);
  ctx.onDispose(() => tab.tex.dispose());
  const tabMat = new THREE.MeshBasicMaterial({ map: tab.tex });
  ctx.onDispose(() => tabMat.dispose());
  const tabGeo = new Painter();
  const tabQuad = (u0: number, u1: number, x: number, z: number, w: number, h: number, tilt: number): void => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
    g.rotateX(-Math.PI / 2 + tilt);
    g.translate(x, TABLE.y + 0.06 + Math.sin(tilt) * h * 0.5, z);
    tabGeo.parts.push(g);
  };
  tabQuad(0, 0.25, SEATS.b, TABLE.z + 0.18, 0.34, 0.24, 0.35);
  tabQuad(0.25, 0.5, SEATS.c, TABLE.z + 0.18, 0.34, 0.24, 0.35);
  tabQuad(0.5, 1.0, TABLE.x, TABLE.z + 0.08, 0.62, 0.3, 0.75);
  const tablets = new THREE.Mesh(tabGeo.merge(), tabMat);
  det.add(tablets);
  // κ needle: child of a frame aligned with the dial quad (pivot = canvas (768, 214))
  const DIAL_TILT = 0.75;
  const dial = new THREE.Group();
  dial.position.set(TABLE.x, TABLE.y + 0.06 + Math.sin(DIAL_TILT) * 0.15, TABLE.z + 0.08);
  dial.rotation.x = -Math.PI / 2 + DIAL_TILT;
  det.add(dial);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.008, 0.004).translate(0.085, 0, 0), M.orangePaint);
  needle.position.set(0, (1 - 214 / 256 - 0.5) * 0.3, 0.004);
  dial.add(needle);

  // ── state ────────────────────────────────────────────────────────────────
  const N = CLIPS.length;
  // rev 2 (six clips): its own key, the rc4 record of twelve clips stays untouched
  const saved = ctx.progress.get<{ r: number; you: number[]; rule: Rule; k1: number | null; r2: number[] } | null>('audit2', null);
  let round = saved?.r ?? 1;
  const you: number[] = saved?.you?.length === N ? saved.you.slice() : new Array<number>(N).fill(-1);
  let rule: Rule = saved?.rule ?? { tolMm: 10, limitS: 10, regraspAllowed: false };
  let kappa1: number | null = saved?.k1 ?? null;
  const retagged = new Set<number>(saved?.r2 ?? []);
  let current = 0;
  let kappaShown = 0;
  let kappaTarget = 0;
  let flash = 0;
  S.auditRound = round;
  const save = (): void => ctx.progress.set('audit2', { r: round, you, rule, k1: kappa1, r2: [...retagged] });

  const tagsB = (): number[] => CLIPS.map((c) => TAG_INDEX[round >= 2 ? classify(c.facts, rule) : c.r1B]);
  const tagsC = (): number[] => CLIPS.map((c) => TAG_INDEX[round >= 2 ? classify(c.facts, rule) : c.r1C]);
  const complete = (): boolean => (round >= 2 ? CLIPS.every((c, i) => !c.ambiguous || retagged.has(i)) && you.every((t) => t >= 0) : you.every((t) => t >= 0));
  // PT-18: B's and C's tags show only once you have rated the clip — in round 2 an ambiguous clip
  // counts as rated once you re-rated it under your rule (otherwise their rule tags give it away)
  const ratedNow = (i: number): boolean => (round >= 2 ? !CLIPS[i].ambiguous || retagged.has(i) : you[i] >= 0);
  const kappaNow = (): [number, number, number, number] | null => (complete() ? meanKappa(you, tagsB(), tagsC()) : null);
  const ruleText = (): string =>
    ctx.t('audit.ruleText', { tol: rule.tolMm, lim: rule.limitS, rg: rule.regraspAllowed ? ctx.t('audit.withRegrasp') : ctx.t('audit.withoutRegrasp') });

  const drawTablets = (): void => {
    const g = tab.g;
    g.fillStyle = '#0c0a09';
    g.fillRect(0, 0, 1024, 256);
    const b = tagsB(),
      c = tagsC();
    const shown = ratedNow(current);
    for (const [i, arr, name] of [
      [0, b, ctx.t('audit.b')],
      [1, c, ctx.t('audit.c')],
    ] as const) {
      const x0 = i * 256;
      const disagree = b[current] !== c[current];
      g.fillStyle = '#1c1917';
      g.fillRect(x0 + 6, 6, 244, 244);
      g.fillStyle = '#A8A29E';
      g.font = `500 22px ${FONT_MONO}`;
      g.fillText(name.toUpperCase(), x0 + 22, 46);
      g.fillStyle = '#78716C';
      g.fillText(ctx.t('audit.clip', { i: current + 1 }), x0 + 22, 78);
      g.fillStyle = shown ? (disagree ? '#FF8534' : '#2DD4BF') : '#3D3D3D';
      g.font = `700 40px ${FONT_DISPLAY}`;
      g.fillText(shown ? ctx.t(`tag.${TAGS[arr[current]]}`) : '· · ·', x0 + 22, 160, 212);
    }
    // κ dial
    const cx = 512 + 256,
      cy = 214;
    g.fillStyle = '#141414';
    g.fillRect(518, 6, 500, 244);
    g.strokeStyle = '#3D3D3D';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(cx, cy, 170, Math.PI, Math.PI * 2);
    g.stroke();
    g.strokeStyle = '#2DD4BF';
    g.beginPath();
    g.arc(cx, cy, 170, Math.PI + Math.PI * 0.8, Math.PI * 2);
    g.stroke();
    g.lineWidth = 2;
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI + (k / 10) * Math.PI;
      g.strokeStyle = k === 8 ? '#FF6700' : '#78716C';
      g.lineWidth = k === 8 ? 5 : 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 150, cy + Math.sin(a) * 150);
      g.lineTo(cx + Math.cos(a) * 182, cy + Math.sin(a) * 182);
      g.stroke();
    }
    g.fillStyle = '#A8A29E';
    g.font = `500 20px ${FONT_MONO}`;
    g.fillText('κ', cx - 7, cy - 104);
    g.fillText('0', cx - 200, cy - 4);
    g.fillText('1', cx + 186, cy - 4);
    g.fillStyle = '#FF8534';
    g.fillText(ctx.i18n.num(0.8, 1), cx + Math.cos(Math.PI * 1.8) * 196 - 6, cy + Math.sin(Math.PI * 1.8) * 196 - 6);
    tab.tex.needsUpdate = true;
  };

  const placeNeedle = (): void => {
    needle.rotation.z = Math.PI * (1 - kappaShown);
  };

  // ── replay schematic (DOM canvas) ────────────────────────────────────────
  const drawSchematic = (cv: HTMLCanvasElement): void => {
    const g = cv.getContext('2d')!;
    const w = cv.width,
      h = cv.height;
    g.clearRect(0, 0, w, h);
    const c = CLIPS[current];
    // bin top-down, ±25 mm field
    const bx = 8,
      by = 8,
      bs = h - 16;
    const mid = bx + bs / 2,
      midY = by + bs / 2;
    const px = bs / 2 / 25; // px per mm
    g.fillStyle = '#161514';
    g.fillRect(bx, by, bs, bs);
    g.strokeStyle = '#3D3D3D';
    g.strokeRect(bx, by, bs, bs);
    for (const tol of TOL_CHOICES) {
      g.strokeStyle = round >= 2 && tol === rule.tolMm ? '#2DD4BF' : 'rgba(168,162,158,0.35)';
      g.lineWidth = round >= 2 && tol === rule.tolMm ? 2 : 1;
      g.beginPath();
      g.arc(mid, midY, tol * px, 0, Math.PI * 2);
      g.stroke();
    }
    g.strokeStyle = '#78716C';
    g.beginPath();
    g.moveTo(mid - 6, midY);
    g.lineTo(mid + 6, midY);
    g.moveTo(mid, midY - 6);
    g.lineTo(mid, midY + 6);
    g.stroke();
    if (c.facts.offsetMm != null) {
      const len = Math.hypot(c.place[0], c.place[1]) || 1;
      const ox = (c.place[0] / len) * c.facts.offsetMm,
        oy = (c.place[1] / len) * c.facts.offsetMm;
      g.fillStyle = '#F5F5F4';
      g.beginPath();
      g.arc(mid + ox * px, midY + oy * px, 4.5, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = '#FF8534';
      g.font = `500 11px ${FONT_MONO}`;
      g.fillText('∅', mid - 3, midY + 4);
    }
    g.fillStyle = '#78716C';
    g.font = `500 10px ${FONT_MONO}`;
    g.fillText('±5/10/20 mm', bx + 4, by + bs - 5);
    // timeline 0–12 s
    const tx = bx + bs + 14,
      tw = w - tx - 8,
      ty = 22;
    const X = (s: number): number => tx + (s / 12) * tw;
    g.fillStyle = '#A8A29E';
    g.font = `500 10px ${FONT_MONO}`;
    g.fillText(ctx.t('audit.replay'), tx, 12);
    g.strokeStyle = '#3D3D3D';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(tx, ty + 14);
    g.lineTo(tx + tw, ty + 14);
    g.stroke();
    for (const lim of LIMIT_CHOICES) {
      const on = round >= 2 && lim === rule.limitS;
      g.strokeStyle = on ? '#2DD4BF' : 'rgba(168,162,158,0.35)';
      g.setLineDash([3, 3]);
      g.beginPath();
      g.moveTo(X(lim), ty);
      g.lineTo(X(lim), ty + 28);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = on ? '#2DD4BF' : '#78716C';
      g.fillText(`${lim} s`, X(lim) - 8, ty + 40);
    }
    // events: grasp(s), release
    g.fillStyle = '#F5F5F4';
    const marks: [number, string][] = [];
    if (c.facts.grasped) marks.push([1.35 * (c.facts.timeS / (c.motion === 'regrasp' ? 4.45 : c.motion === 'slow' ? 6.65 : 3.45)), '▲']);
    if (c.facts.regrasp) marks.push([2.35 * (c.facts.timeS / 4.45), '▲']);
    for (const [s, m] of marks) g.fillText(m, X(s) - 4, ty + 18);
    g.fillStyle = c.facts.lost || !c.facts.grasped ? '#FF8534' : '#F5F5F4';
    g.beginPath();
    g.arc(X(c.facts.timeS), ty + 14, 5, 0, Math.PI * 2);
    g.fill();
    // playhead
    const ph = Math.min(12, line.clipTime);
    g.strokeStyle = '#FF6700';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(X(ph), ty - 2);
    g.lineTo(X(ph), ty + 30);
    g.stroke();
    // facts
    const f = c.facts;
    const facts = [
      f.grasped ? ctx.t('audit.graspYes') + (f.regrasp ? ' · ' + ctx.t('audit.regrasp') : '') : ctx.t('audit.graspNo'),
      f.lost ? ctx.t('audit.lost') : f.offsetMm != null ? `${ctx.t('audit.offset')} ${f.offsetMm} mm` : '',
      `${ctx.t('audit.time')} ${ctx.i18n.num(f.timeS, 1)} s`,
    ].filter(Boolean);
    g.fillStyle = '#D6D3D1';
    g.font = `500 11.5px ${FONT_MONO}`;
    facts.forEach((t, i) => g.fillText(t, tx, ty + 54 + i * 14));
  };

  // ── operate panel ────────────────────────────────────────────────────────
  let refresh: (() => void) | null = null;
  let schematic: HTMLCanvasElement | null = null;
  let lastSchem = 0;
  const select = (i: number): void => {
    current = (i + N) % N;
    line.playClip(CLIPS[current]);
    drawTablets();
    refresh?.();
  };
  const nextOpen = (): void => {
    for (let k = 1; k <= N; k++) {
      const i = (current + k) % N;
      if (round >= 2 ? CLIPS[i].ambiguous && !retagged.has(i) : you[i] < 0) return select(i);
    }
    refresh?.();
  };
  const tag = (ti: number): void => {
    you[current] = ti;
    refusal = null;
    if (round >= 2 && CLIPS[current].ambiguous) retagged.add(current);
    ctx.audio.play('click', { pitch: 1.2 });
    save();
    const k = kappaNow();
    kappaTarget = k ? Math.max(0, k[0]) : 0;
    drawTablets();
    // the auditors look at each other when they disagree
    const b = tagsB(),
      c = tagsC();
    if (b[current] !== c[current]) flash = 1.2;
    nextOpen();
  };
  /** instant: the test hooks record the result now (the paper animation only runs while the zone is active) */
  const print = (instant = false): void => {
    const k = kappaNow();
    if (!k) return;
    if (k[0] < KAPPA_MIN) {
      S.sfx.denied([TABLE.x, 1, TABLE.z]);
      // the printer refuses: a fail flash with the auditors' reason (FUN-PLAN P3)
      if (round >= 2) refusals2++;
      ch.fail(ctx.i18n.text('game.c.refuse'));
      if (round === 1) {
        kappa1 = k[0];
        round = 2;
        S.auditRound = 2;
        save();
        S.react('emi.kfail', undefined, 'shrug');
        ctx.after(0.5, () => S.refreshObjective());
        // jump to the first ambiguous clip
        current = CLIPS.findIndex((c) => c.ambiguous);
        select(current);
      } else {
        S.react('emi.kfail');
      }
      refusal = ctx.t(round === 2 && kappa1 != null && k[0] !== kappa1 ? 'audit.refuse2' : 'audit.refuse', { k: ctx.i18n.num(k[0], 2) });
      refresh?.();
      return;
    }
    // κ ≥ 0.8 → the report prints
    round = 3;
    S.auditRound = 3;
    save();
    refresh?.();
    const first = refusals2 === 0;
    const done = (): void => {
      const value = {
        de: `κ = ${k[0].toFixed(2).replace('.', ',')} · Regel: ±${rule.tolMm} mm, ${rule.limitS} s, ${rule.regraspAllowed ? 'mit' : 'ohne'} Nachgreifen`,
        en: `κ = ${k[0].toFixed(2)} · rule: ±${rule.tolMm} mm, ${rule.limitS} s, ${rule.regraspAllowed ? 'regrasp allowed' : 'no regrasp'}`,
      };
      ctx.pass.award('drei-auditoren', { value, curve: [kappa1 ?? 0.6, k[0]] });
      ctx.pass.setBest('kappa', Math.round(k[0] * 100) / 100, 'higher');
      S.react('emi.kpass', undefined, 'nod');
      // ★ the report, ★★ with the first rule you set (no refusal in round 2), ★★★ κ ≥ 0,9
      const stars = (1 + (first ? 1 : 0) + (first && k[0] >= AUDIT.star3Kappa - 1e-9 ? 1 : 0)) as Stars;
      ch.submit(Math.round(k[0] * 100) / 100, { stars, detail: ctx.i18n.text('game.c.detail', { k: ctx.i18n.num(k[0], 2), tol: rule.tolMm, lim: rule.limitS }) });
      ctx.game.juice.cue('great');
      ctx.game.juice.burst([TABLE.x, 1.4, TABLE.z], { tone: 'teal', count: AUDIT.printBurst });
      S.refreshObjective();
    };
    if (instant) {
      cell.print(() => {});
      done();
    } else cell.print(done);
  };
  let refusal: string | null = null;
  // plan §4.7: playback 2× by default (the toggle goes back to 1× for a closer look)
  let fast: boolean = AUDIT.fastDefault;

  const reportSpec = (): InfoCardSpec => {
    const k = meanKappa(you, tagsB(), tagsC())[0];
    const consensus = CLIPS.map((c) => classify(c.facts, rule));
    const counts = TAGS.map((t) => consensus.filter((x) => x === t).length);
    const body = [ctx.i18n.text('cardC.body'), ctx.i18n.text('cardC.rule', { rule: ruleText() })];
    return {
      eyebrow: ctx.i18n.text('cardC.eyebrow'),
      title: ctx.i18n.text('cardC.title', { k: ctx.i18n.num(k, 2) }),
      body,
      // the point of the station in two numbers; the counts per failure mode are in the diagram
      metrics: [
        { label: ctx.i18n.text('cardC.m1'), value: kappa1 != null ? ctx.i18n.num(kappa1, 2) : '–', note: ctx.i18n.text('cardC.m1n') },
        { label: ctx.i18n.text('cardC.m2'), value: ctx.i18n.num(k, 2), note: ctx.i18n.text('cardC.m2n') },
      ],
      illustrative: true,
      entdecker: { bullets: [ctx.i18n.text('cardC.curious')] },
      entscheider: { forDecisionMakers: { title: ctx.i18n.text('cardC.fdmTitle'), bullets: [ctx.i18n.text('cardC.fdm1'), ctx.i18n.text('cardC.fdm2')] } },
      diagram: {
        aspect: 4 / 3,
        caption: ctx.i18n.text('cardC.diagram'),
        draw(g, w, h) {
          const max = Math.max(1, ...counts);
          const rowH = (h - 16) / TAGS.length;
          g.font = '12px "Geist Mono", monospace';
          TAGS.forEach((t, i) => {
            const y = 8 + i * rowH;
            const bw = ((w - 150) * counts[i]) / max;
            g.fillStyle = '#A8A29E';
            g.fillText(ctx.t(`tag.${t}`), 4, y + rowH / 2 + 4);
            g.fillStyle = 'rgba(214,211,209,0.10)';
            g.fillRect(118, y + rowH * 0.2, w - 150, rowH * 0.6);
            g.fillStyle = t === 'erfolg' ? '#2DD4BF' : '#A8A29E';
            g.fillRect(118, y + rowH * 0.2, bw, rowH * 0.6);
            g.fillStyle = '#F5F5F4';
            g.fillText(String(counts[i]), 124 + bw, y + rowH / 2 + 4);
          });
        },
      },
    };
  };
  // the report is the challenge's why(): [H] in the banner or the Pass, never by itself
  let refusals2 = 0;
  /** another try at agreeing: back to the rule round with your tags kept */
  const retryC = (): void => {
    if (round >= 3) {
      round = 2;
      S.auditRound = 2;
      refusals2 = 0;
      save();
    }
    if (S.operating !== 'audit') operate();
    else refresh?.();
  };
  const ch: ChallengeHandle = ctx.game.challenge({
    id: 'drei-auditoren',
    title: ctx.i18n.text('game.c.title'),
    metric: { label: ctx.i18n.text('game.c.metric'), better: 'higher', digits: 2 },
    goals: [{ text: ctx.i18n.text('game.c.g1') }, { text: ctx.i18n.text('game.c.g2') }, { text: ctx.i18n.text('game.c.g3'), at: AUDIT.star3Kappa }],
    lesson: ctx.i18n.text('game.c.lesson'),
    why: reportSpec,
    retry: () => retryC(),
    emi: S.emi ?? undefined,
  });

  const operate = (): void => {
    if (!S.docked) {
      S.say('emi.measureFirst');
      return;
    }
    if (!S.lastRun) {
      S.say('emi.auditFirst');
      return;
    }
    S.operating = 'audit';
    if (round === 1 && !you.some((t) => t >= 0)) current = 0;
    line.setReplaySpeed(fast ? AUDIT.fastSpeed : 1);
    line.playClip(CLIPS[current]);
    drawTablets();
    void S.emi?.driveTo([3.9, 0, 7.7]);
    S.exitOp = ctx.player.enterOperate({
      title: ctx.i18n.text('audit.eyebrow'),
      cameraPose: { position: [6.0, 2.15, 8.75], lookAt: [5.9, 0.95, -4.8] },
      panelPosition: 'right',
      panel: (el) => {
        el.style.width = '440px';
        el.style.padding = '12px 16px 10px';
        const head = document.createElement('div');
        const clips = document.createElement('div');
        clips.style.cssText = 'display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin-top:6px';
        const cv = document.createElement('canvas');
        cv.width = 404;
        cv.height = 108;
        cv.style.cssText = 'width:404px;height:108px;display:block;margin-top:8px;border-radius:8px;background:#121110;border:1px solid var(--border-subtle)';
        schematic = cv;
        const who = document.createElement('div');
        who.className = 'mono';
        who.style.cssText = 'font-size:12px;margin-top:6px;color:var(--text-2)';
        const tags = document.createElement('div');
        tags.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:6px';
        const ruleBox = document.createElement('div');
        const kBox = document.createElement('div');
        kBox.style.cssText = 'margin-top:6px;display:flex;align-items:center;gap:12px;flex-wrap:wrap';
        el.append(head, clips, cv, who, tags, ruleBox, kBox);
        const render = (): void => {
          head.replaceChildren(ch.chips());
          // the six clips are staged (ILLUSTRATIV); κ is computed live from the three ratings
          const chipRow = document.createElement('div');
          chipRow.style.cssText = 'display:flex;gap:6px;margin-top:5px';
          chipRow.append(ctx.ui.chip('illustrativ', ctx.i18n.text('audit.chipSrc')));
          head.append(chipRow);
          const sub = document.createElement('div');
          sub.style.cssText = 'margin-top:5px;display:flex;justify-content:space-between;align-items:center;gap:8px';
          const st = document.createElement('div');
          st.style.cssText = 'font-size:13px;line-height:1.35;color:var(--text)';
          st.textContent = round >= 2 ? ctx.t('audit.round2') : ctx.t('audit.round1');
          // 2× fast-forward for the clip replays (12 × 4 s → ≈ 24 s)
          const ff = document.createElement('button');
          ff.className = 'btn ghost';
          ff.style.cssText = 'font-size:11.5px;padding:3px 8px;white-space:nowrap';
          ff.textContent = fast ? `${AUDIT.fastSpeed}×` : '1×';
          ff.title = ctx.t('game.c.ff');
          ff.onclick = () => {
            fast = !fast;
            line.setReplaySpeed(fast ? AUDIT.fastSpeed : 1);
            ctx.audio.play('click');
            render();
          };
          sub.append(st, ff);
          head.append(sub);
          const b = tagsB(),
            c = tagsC();
          clips.replaceChildren(
            ...CLIPS.map((cl, i) => {
              const bt = document.createElement('button');
              const done = round >= 2 ? !cl.ambiguous || retagged.has(i) : you[i] >= 0;
              const disagree = you[i] >= 0 && (you[i] !== b[i] || you[i] !== c[i]);
              // round 2: orange = still to do (an ambiguous clip not yet re-rated, or a tag that breaks the rule)
              const todo = round === 2 && ((cl.ambiguous && !retagged.has(i)) || disagree);
              const okAmb = round >= 2 && cl.ambiguous && !todo;
              bt.className = 'mono';
              bt.style.cssText = `all:unset;box-sizing:border-box;text-align:center;min-width:0;font-family:var(--font-mono);font-size:12px;padding:4px 0;border-radius:7px;cursor:pointer;background:${i === current ? 'var(--elevated)' : 'transparent'};color:${done ? 'var(--text)' : 'var(--text-3)'};border:${todo ? '2px solid var(--orange)' : okAmb ? '2px solid rgba(45,212,191,0.6)' : `1px ${done ? 'solid' : 'dashed'} var(--border)`}`;
              bt.textContent = `${cl.id}${you[i] >= 0 ? ' · ' + ctx.t(`tag.${TAGS[you[i]]}`).slice(0, 1) : ''}`;
              bt.onclick = () => select(i);
              return bt;
            }),
          );
          const shown = ratedNow(current);
          // your tag is the highlighted button below; B and C appear once you have rated the clip
          // (no placeholders: ≤ 50 words at open)
          who.innerHTML = `<b style="color:var(--text)">${ctx.t('audit.clip', { i: current + 1 })}</b>${shown ? ` · B: ${ctx.t(`tag.${TAGS[b[current]]}`)} · C: ${ctx.t(`tag.${TAGS[c[current]]}`)}` : ''}`;
          tags.replaceChildren(
            ...TAGS.map((t, i) => {
              const bt = document.createElement('button');
              bt.className = you[current] === i ? 'btn primary' : 'btn';
              bt.style.cssText = 'font-size:12px;padding:4px 6px;justify-content:center';
              bt.innerHTML = `<span class="kbd" style="height:18px;min-width:18px">${i + 1}</span> ${ctx.t(`tag.${t}`)}`;
              bt.onclick = () => tag(i);
              return bt;
            }),
          );
          ruleBox.replaceChildren();
          if (round >= 2) {
            ruleBox.style.cssText = 'margin-top:6px;padding:6px 10px;border:1px solid rgba(45,212,191,0.35);border-radius:10px;display:grid;grid-template-columns:96px minmax(0,1fr);gap:4px 8px;align-items:center;font-size:12px';
            const lab = (t: string): HTMLElement => {
              const s = document.createElement('span');
              s.style.color = 'var(--text-2)';
              s.textContent = t;
              return s;
            };
            const seg = (opts: string[], cur: number, on: (i: number) => void): HTMLElement => {
              const sg = document.createElement('div');
              sg.className = 'seg';
              sg.style.cssText = 'justify-self:start;max-width:100%';
              opts.forEach((o, i) => {
                const bt = document.createElement('button');
                bt.style.cssText = 'padding:3px 8px;font-size:12px';
                bt.textContent = o;
                bt.className = i === cur ? 'on' : '';
                bt.disabled = round >= 3;
                bt.onclick = () => {
                  on(i);
                  refusal = null;
                  save();
                  ctx.audio.play('click');
                  const k = kappaNow();
                  kappaTarget = k ? Math.max(0, k[0]) : 0;
                  drawTablets();
                  render();
                };
                sg.append(bt);
              });
              return sg;
            };
            const title = document.createElement('div');
            title.className = 'eyebrow teal';
            title.style.gridColumn = '1 / -1';
            title.textContent = ctx.t('audit.rule');
            const order = document.createElement('div');
            order.style.cssText = 'grid-column:1/-1;color:var(--text-3);font-size:10.5px;line-height:1.3';
            order.textContent = ctx.t('audit.order');
            ruleBox.append(
              title,
              lab(ctx.t('audit.tol')),
              seg(TOL_CHOICES.map((t) => `±${t} mm`), TOL_CHOICES.indexOf(rule.tolMm), (i) => (rule = { ...rule, tolMm: TOL_CHOICES[i] })),
              lab(ctx.t('audit.limit')),
              seg(LIMIT_CHOICES.map((t) => `${t} s`), LIMIT_CHOICES.indexOf(rule.limitS), (i) => (rule = { ...rule, limitS: LIMIT_CHOICES[i] })),
              lab(ctx.t('audit.regraspOpt')),
              seg([ctx.t('audit.allowed'), ctx.t('audit.notAllowed')], rule.regraspAllowed ? 0 : 1, (i) => (rule = { ...rule, regraspAllowed: i === 0 })),
              order,
            );
          } else ruleBox.style.cssText = '';
          kBox.replaceChildren();
          const k = kappaNow();
          const kv = document.createElement('div');
          kv.style.cssText = 'display:flex;align-items:center;gap:8px';
          // the needle: 0 … 1 with the 0,8 mark; the number small beside it (and the pairs as the tooltip)
          const needle = (v: number | null): string => {
            const a = Math.PI * (1 - Math.max(0, Math.min(1, v ?? 0)));
            const x = 30 + Math.cos(a) * 24,
              y = 30 - Math.sin(a) * 24;
            const m8 = Math.PI * 0.2;
            const col = v == null ? 'var(--text-3)' : v >= KAPPA_MIN ? 'var(--teal)' : 'var(--orange)';
            return `<svg width="60" height="34" viewBox="0 0 60 34" aria-hidden="true"><path d="M6 30 A24 24 0 0 1 54 30" fill="none" stroke="var(--elevated)" stroke-width="5"/><path d="M${30 + Math.cos(m8) * 24} ${30 - Math.sin(m8) * 24} A24 24 0 0 1 54 30" fill="none" stroke="rgba(45,212,191,.55)" stroke-width="5"/><line x1="${30 + Math.cos(m8) * 18}" y1="${30 - Math.sin(m8) * 18}" x2="${30 + Math.cos(m8) * 30}" y2="${30 - Math.sin(m8) * 30}" stroke="var(--orange)" stroke-width="2"/>${v == null ? '' : `<line x1="30" y1="30" x2="${x}" y2="${y}" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`}<circle cx="30" cy="30" r="2.5" fill="${col}"/></svg>`;
          };
          if (k) {
            kv.innerHTML = `${needle(Math.max(0, k[0]))}<span class="mono" data-chip="ui" style="font-size:12px;color:${k[0] >= KAPPA_MIN ? 'var(--teal)' : 'var(--orange-light)'}">κ ${ctx.i18n.num(k[0], 2)}</span>`;
            kv.title = ctx.t('audit.pairs', { ab: ctx.i18n.num(k[1], 2), ac: ctx.i18n.num(k[2], 2), bc: ctx.i18n.num(k[3], 2) });
          } else {
            const left = round >= 2 ? CLIPS.filter((c2, i) => c2.ambiguous && !retagged.has(i)).length : you.filter((t) => t < 0).length;
            kv.innerHTML = `${needle(null)}<span class="mono" data-chip="ui" style="font-size:12px;color:var(--text-3)">${round >= 2 ? '…' : `${N - left}/${N}`}</span>`;
            kv.title = round >= 2 ? ctx.t('audit.needAmb') : ctx.t('audit.need', { k: left });
          }
          kv.style.marginRight = 'auto';
          const pr = document.createElement('button');
          pr.className = 'btn primary';
          pr.textContent = round >= 3 ? `✓ ${ctx.t('audit.printed')}` : ctx.t('audit.print');
          pr.disabled = !k || round >= 3;
          pr.onclick = () => print();
          kBox.append(kv, pr);
          if (refusal && round < 3) {
            const rf = document.createElement('div');
            rf.style.cssText = 'flex-basis:100%;font-size:12.5px;color:var(--orange-light)';
            rf.textContent = refusal;
            kBox.append(rf);
          }
          // round 3 (report printed): a compact result view (≤ 50 words); „Nochmal“ reopens the rule round
          const doneView = round >= 3;
          for (const e2 of [clips, cv, who, tags, ruleBox]) e2.style.display = doneView ? 'none' : '';
          if (doneView) {
            const again = document.createElement('button');
            again.className = 'btn';
            again.textContent = ctx.t('game.c.again');
            again.onclick = () => retryC();
            kBox.append(again);
          }
          if (schematic && !doneView) drawSchematic(schematic);
        };
        refresh = render;
        render();
        const off = ctx.input.onKey(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'], (code) => tag(Number(code.slice(5)) - 1), { whileOperating: true });
        return () => {
          off();
          refresh = null;
          schematic = null;
        };
      },
      onExit: () => {
        S.operating = null;
        line.playClip(null);
      },
    });
  };
  // interactables: the empty middle chair and (after printing) the report on the printer
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.05), M.standard({ color: 0x3d3a37, roughness: 0.75 }));
  seat.position.set(SEATS.you, 0.73, SEATS.z + 0.225);
  det.add(seat);
  ctx.addInteractable({ object: seat, label: ctx.i18n.text('ia.seat'), hint: ctx.i18n.text('ia.seatHint'), range: 2.8, onInteract: operate });
  ctx.addInteractable({ object: cell.paperObject, label: ctx.i18n.text('ia.report'), range: 3, isEnabled: () => round >= 3 && ctx.pass.has('drei-auditoren'), onInteract: () => void ctx.ui.card(reportSpec()) });

  // ── per frame ────────────────────────────────────────────────────────────
  drawTablets();
  ctx.i18n.onChange(drawTablets);
  {
    const k = kappaNow();
    kappaTarget = k ? Math.max(0, k[0]) : 0;
  }
  let tickAcc = 0;
  S.onUpdate((dt) => {
    if (kappaShown !== kappaTarget) {
      const d = kappaTarget - kappaShown;
      const step = Math.sign(d) * Math.min(Math.abs(d), dt * 0.6);
      kappaShown += step;
      tickAcc += Math.abs(step);
      if (tickAcc > 0.05) {
        tickAcc = 0;
        S.sfx.tick([TABLE.x, 0.85, TABLE.z], 0.8 + kappaShown * 0.6);
      }
    }
    placeNeedle();
    // auditors' heads: idle sway toward the line, turn to each other on disagreement
    flash = Math.max(0, flash - dt);
    const t = ctx.time.elapsed;
    heads[0].rotation.y = flash > 0 ? -0.9 * Math.min(1, flash) : Math.sin(t * 0.4) * 0.08;
    heads[1].rotation.y = flash > 0 ? 0.9 * Math.min(1, flash) : Math.sin(t * 0.37 + 1) * 0.08;
    if (schematic && S.operating === 'audit' && t - lastSchem > 0.1) {
      lastSchem = t;
      drawSchematic(schematic);
    }
  });

  return {
    challenge: ch,
    stars3() {
      // a fresh agreement with the default rule at the first try, applied consistently: κ = 1
      if (round === 1) {
        CLIPS.forEach((c, i) => (you[i] = TAG_INDEX[c.r1B]));
        print(true);
      }
      refusals2 = 0;
      if (round >= 3) {
        round = 2;
        S.auditRound = 2;
      }
      rule = { tolMm: 10, limitS: 10, regraspAllowed: false };
      CLIPS.forEach((c, i) => {
        you[i] = TAG_INDEX[classify(c.facts, rule) as Tag];
        if (c.ambiguous) retagged.add(i);
      });
      save();
      print(true);
    },
    solve() {
      // round 1: the player rates like auditor B → κ < 0.8, refuse
      if (round === 1) {
        CLIPS.forEach((c, i) => (you[i] = TAG_INDEX[c.r1B]));
        print(true);
      }
      // round 2: rule ±10 mm, 10 s, no regrasp; consistent tags
      rule = { tolMm: 10, limitS: 10, regraspAllowed: false };
      CLIPS.forEach((c, i) => {
        you[i] = TAG_INDEX[classify(c.facts, rule) as Tag];
        if (c.ambiguous) retagged.add(i);
      });
      save();
      print(true);
    },
  };
}
