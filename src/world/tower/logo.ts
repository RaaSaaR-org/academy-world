import * as THREE from 'three';
import type { LoopHandle, Text, WorldLabelHandle, ZoneContext } from '@/core/zones';
import { RECAMAN, recamanSteps } from '@/core/brand/logo3d';
import type { Arm } from './arm';
import type { Fx } from './fx';
import type { TowerKit } from './kit';
import { ELEMENTS, type Sculpture } from './sculpture';

/**
 * Logo progress hook (FUN-PLAN §6): the tower draws your progress.
 *
 *  - 18 elements: 0 = ring, 1…17 = arcs k. Earned stamp n lights element n − 1 (Pass cover order);
 *    skipped stamps draw nothing until earned.
 *  - pending = earned − shown. An element is drawn only while the player can see the mark (outdoors,
 *    in front of it, in the frustum, ≤ 160 m, not occluded, no modal); otherwise it stays pending
 *    (ghost + a steady "ready" spark at the arm) and draws the next time the mark is in view.
 *  - drawing (≈ 1.6 s + 0.08 s × index, ring 3 s; ×1.3 per chained element, ≤ ×4):
 *    first 20 % PERCEIVE/DECIDE (teal sensor ray checks a(n−1) − n: ✕ when negative or visited,
 *    then ✓ on the chosen node), 65 % ACT (laser, progressive reveal, hot head, spark, landing ring),
 *    15 % re-park. Reduced motion: a 0.6 s fade, no arm, no beam.
 *  - logoShown (0–18) is island progress; a reload restores lit elements instantly, the rest pend.
 *  - progress:reset → all ghost, arm parked. finale:ended (once) → "Einschalten": one laser sweep
 *    along every lit element in sequence order (≈ 4 s); with 18/18 the arm bows. Never fills unearned arcs.
 *  - events: logo:element { index, phase: 'start' | 'done', pending }, logo:sweep { phase, earned }.
 * The mark itself never moves, rotates, morphs or pulses: reveal and (reduced motion) opacity only.
 */
export interface LogoProgress {
  update(dt: number): void;
  readonly drawing: boolean;
}

interface DrawJob {
  kind: 'draw';
  el: number;
  t: number;
  dur: number;
  speed: number;
  done: boolean;
  reduced: boolean;
  forced: boolean;
}
interface SweepJob {
  kind: 'sweep' | 'bow';
  t: number;
  dur: number;
  forced: boolean;
}
type Job = DrawJob | SweepJob;

const STEPS = recamanSteps();
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
const range = (t: number, a: number, b: number): number => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);

export function buildLogoProgress(ctx: ZoneContext, kit: TowerKit, sc: Sculpture, arm: Arm, fx: Fx, onStamp: () => void): LogoProgress {
  const earnedNow = (): number => THREE.MathUtils.clamp(ctx.game.progress().earnedStamps, 0, ELEMENTS);
  const finaleEnded = (): boolean => ctx.game.progress().finaleEnded;

  let earned = earnedNow();
  let shown = THREE.MathUtils.clamp(Math.round(ctx.progress.get<number>('logoShown', 0)), 0, ELEMENTS);
  if (shown > earned) shown = earned;
  /** debug override of the target count (logo-<n>, logo-pending-<n>, logo-draw) */
  let forcedTarget: number | null = null;
  let job: Job | null = null;
  let chain = 0;
  let idle = 99;
  let swept = finaleEnded(); // after a reload past the ending: rest pose, no sweep
  let sweepPending = false;
  let armRest = 1;
  let visible = false;
  let visAcc = 1;
  let label: WorldLabelHandle | null = null;
  let labelTtl = 0;
  let hiss: LoopHandle | null = null;
  let headEl = -1;
  let headK = 0;
  let ringPulse = -1;
  const ringAt = new THREE.Vector3();

  const applyAll = (): void => {
    for (let i = 0; i < ELEMENTS; i++) {
      sc.setProgress(i, i < shown ? 1 : 0);
      sc.setFade(i, 1);
    }
    sc.setHead(-1, 0);
    sc.setSweep(null);
  };
  applyAll();

  const target = (): number => forcedTarget ?? earned;
  const pending = (): number => Math.max(0, target() - shown - (job && job.kind === 'draw' && !job.done ? 1 : 0));
  const save = (): void => {
    if (forcedTarget === null) ctx.progress.set('logoShown', shown);
  };

  // ── visibility (10 Hz): outdoors, in front, in the frustum, ≤ 160 m, not occluded, no modal ──
  const frustum = new THREE.Frustum();
  const m4 = new THREE.Matrix4();
  const sphere = new THREE.Sphere(sc.center.clone(), 7);
  const probes = [new THREE.Vector3(0, 0, 0.8), new THREE.Vector3(0, 7.5, 0.8), new THREE.Vector3(-6, -4, 0.8), new THREE.Vector3(6, -4, 0.8)];
  const _o = new THREE.Vector3(),
    _p = new THREE.Vector3(),
    _d = new THREE.Vector3();
  const checkVisible = (): boolean => {
    if (ctx.hud.modalOpen) return false;
    const cam = ctx.camera;
    cam.updateMatrixWorld();
    _o.copy(cam.position);
    _d.subVectors(_o, sc.center);
    const dist = _d.length();
    if (dist > 160 || _d.z / dist < 0.3) return false;
    m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(m4);
    if (!frustum.intersectsSphere(sphere)) return false;
    for (const pr of probes) {
      _p.copy(sc.center).add(pr);
      _d.subVectors(_p, _o);
      const len = _d.length();
      const hit = ctx.physics.raycast(_o, _d.divideScalar(len), len - 0.5);
      if (!hit) return true;
    }
    return false;
  };

  // ── job control ────────────────────────────────────────────────────────────
  const emitEl = (index: number, phase: 'start' | 'done'): void => ctx.events.emit('logo:element', { index, phase, pending: pending() });
  const startDraw = (el: number, forced = false): void => {
    const speed = Math.min(4, Math.pow(1.3, chain));
    const base = el === 0 ? 3.0 : 1.6 + 0.08 * el;
    const reduced = ctx.settings.reducedMotion;
    job = { kind: 'draw', el, t: 0, dur: reduced ? 0.6 : base / speed, speed, done: false, reduced, forced };
    chain++;
    sc.setFade(el, reduced ? 0 : 1);
    if (reduced) sc.setProgress(el, 1);
    emitEl(el, 'start');
    showLabel(el);
    if (!reduced && !hiss) hiss = ctx.audio.loop('data', { at: arm.emitter.clone(), volume: 0.5, pitch: 1.4 });
  };
  const finishDraw = (j: DrawJob): void => {
    j.done = true;
    sc.setProgress(j.el, 1);
    sc.setFade(j.el, 1);
    shown = Math.max(shown, j.el + 1);
    save();
    emitEl(j.el, 'done');
    // the element's Recamán note on landing, −12 dB under the stamp's own mallet
    const a = RECAMAN[Math.min(RECAMAN.length - 1, j.el)];
    ctx.audio.tone({ freq: 2 * 220 * Math.pow(2, a / 12), dur: 0.9, type: 'triangle', volume: 0.23 });
    if (!j.reduced) {
      ringPulse = 0;
      sc.pointAt(j.el, 1, ringAt);
      headEl = j.el;
      headK = 1;
    }
    labelTtl = 2.6;
  };
  const startSweep = (forced = false): void => {
    job = { kind: 'sweep', t: 0, dur: ctx.settings.reducedMotion ? 0.01 : 4.6, forced };
    swept = true;
    sweepPending = false;
    ctx.events.emit('logo:sweep', { phase: 'start', earned });
    if (!ctx.settings.reducedMotion && !hiss) hiss = ctx.audio.loop('data', { at: arm.emitter.clone(), volume: 0.5, pitch: 1.4 });
  };

  // learning beat: the rule behind the line, next to the mark (DOM label, DE/EN)
  const showLabel = (el: number): void => {
    label?.remove();
    label = null;
    const at = new THREE.Vector3();
    let text: Text;
    let eyebrow: Text;
    if (el === 0) {
      sc.nodePoint(0, at);
      at.x += 12.8;
      eyebrow = { de: 'RECAMÁN · START', en: 'RECAMÁN · START' };
      text = { de: 'a(0) = 0 · Rahmen 0 … 25', en: 'a(0) = 0 · frame 0 … 25' };
    } else {
      const s = STEPS[el - 1];
      sc.nodePoint(s.next, at);
      at.x += s.side * 12.8;
      eyebrow = { de: `RECAMÁN · SCHRITT ${s.n}`, en: `RECAMÁN · STEP ${s.n}` };
      if (s.reason === 'negative') text = { de: `${s.prev} − ${s.n} < 0 ✕ → a(${s.n}) = ${s.prev} + ${s.n} = ${s.next}`, en: `${s.prev} − ${s.n} < 0 ✕ → a(${s.n}) = ${s.prev} + ${s.n} = ${s.next}` };
      else if (s.reason === 'visited') text = { de: `${s.prev} − ${s.n} = ${s.back}: schon da ✕ → a(${s.n}) = ${s.prev} + ${s.n} = ${s.next}`, en: `${s.prev} − ${s.n} = ${s.back}: already there ✕ → a(${s.n}) = ${s.prev} + ${s.n} = ${s.next}` };
      else text = { de: `a(${s.n}) = ${s.prev} − ${s.n} = ${s.next}: neu ✓`, en: `a(${s.n}) = ${s.prev} − ${s.n} = ${s.next}: new ✓` };
    }
    label = ctx.hud.worldLabel(at, text, { eyebrow, maxDistance: 230, kind: 'accent' });
    labelTtl = 99;
  };

  // ── events ─────────────────────────────────────────────────────────────────
  ctx.events.on('stamp:awarded', (p: { skipped?: boolean; earned?: number }) => {
    if (p?.skipped) return;
    earned = THREE.MathUtils.clamp(p?.earned ?? earnedNow(), 0, ELEMENTS);
    onStamp();
  });
  ctx.events.on('stamp:updated', () => {
    earned = earnedNow();
  });
  ctx.events.on('progress:reset', () => {
    earned = 0;
    shown = 0;
    forcedTarget = null;
    job = null;
    chain = 0;
    swept = false;
    sweepPending = false;
    armRest = 1;
    arm.park();
    applyAll();
    label?.remove();
    label = null;
    hiss?.stop();
    hiss = null;
    headEl = -1;
    ringPulse = -1;
  });
  ctx.events.on('finale:ended', () => {
    if (!swept) sweepPending = true;
  });
  let endedSeen = swept;
  let pollAcc = 0;

  // ── debug hooks (__academy.solve('world', …)) ───────────────────────────────
  const state = (): Record<string, unknown> => ({ shown, earned, target: target(), pending: pending(), job: job ? { kind: job.kind, el: job.kind === 'draw' ? job.el : null, t: +job.t.toFixed(2), dur: +job.dur.toFixed(2) } : null, visible, swept, sweepPending });
  for (let n = 0; n <= ELEMENTS; n++)
    ctx.debug.register(`logo-${n}`, () => {
      forcedTarget = n;
      shown = n;
      job = null;
      armRest = 1;
      arm.park();
      applyAll();
      return state();
    });
  for (let n = 1; n <= ELEMENTS; n++)
    ctx.debug.register(`logo-pending-${n}`, () => {
      forcedTarget = Math.min(ELEMENTS, shown + n);
      return state();
    });
  ctx.debug.register('logo-draw', () => {
    if (shown >= ELEMENTS) return state();
    forcedTarget = Math.min(ELEMENTS, Math.max(shown, forcedTarget ?? earned) + 1);
    if (!job) startDraw(shown, true);
    return state();
  });
  ctx.debug.register('logo-sweep', () => {
    if (!job) startSweep(true);
    else sweepPending = true;
    return state();
  });
  ctx.debug.register('logo-state', () => state());
  // the arm's swept envelope (world AABB of its joints and emitter), for clearance checks (Turmsprung)
  ctx.debug.register('logo-arm', () => {
    const pts: number[][] = [];
    arm.group.traverse((o) => {
      if ((o as THREE.Bone).isBone) pts.push(o.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)));
    });
    pts.push(arm.emitter.toArray().map((v) => +v.toFixed(2)));
    return pts;
  });

  // ── per frame ──────────────────────────────────────────────────────────────
  const aim = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const cand = new THREE.Vector3();
  const chosen = new THREE.Vector3();
  const hover = new THREE.Vector3();
  const colWarm = new THREE.Color(1.0, 0.86, 0.64);
  const colSpark = new THREE.Color(1.0, 0.55, 0.25);
  const colFlare = new THREE.Color(1.0, 0.6, 0.3);
  const colTeal = new THREE.Color(0.18, 0.83, 0.75);
  const colGrey = new THREE.Color(0.55, 0.55, 0.55);
  const colOrange = new THREE.Color(1.0, 0.25, 0.0);
  const E = new THREE.Vector3(0, 1.65, 94.5);

  const api: LogoProgress = {
    get drawing() {
      return !!job;
    },
    update(dt) {
      visAcc += dt;
      if (visAcc >= 0.1) {
        visAcc = 0;
        visible = checkVisible();
      }
      pollAcc += dt;
      if (pollAcc > 1) {
        pollAcc = 0;
        // fallback when finale:ended is not emitted: the finale's own state flips to ended
        const ended = finaleEnded();
        if (ended && !endedSeen && !swept) sweepPending = true;
        endedSeen = ended;
        if (forcedTarget === null && !job) {
          const e = earnedNow();
          if (e !== earned) earned = e;
          if (shown > earned) {
            shown = earned;
            applyAll();
            save();
          }
        }
      }
      fx.hideAll();
      let rest = 1;
      let speed = 1;
      let haveAim = false;

      // start work
      if (!job) {
        idle += dt;
        if (idle > 1.2) chain = 0;
        if (pending() > 0 && visible) startDraw(shown);
        else if (sweepPending && shown > 0 && visible) startSweep();
        else if (sweepPending && shown === 0) {
          swept = true;
          sweepPending = false;
        }
      }

      if (job && job.kind === 'draw') {
        const j = job;
        idle = 0;
        j.t += dt;
        const f = j.t / j.dur;
        speed = j.speed;
        if (j.reduced) {
          sc.setFade(j.el, Math.min(1, f));
          if (f >= 1 && !j.done) finishDraw(j);
          if (j.done) job = null;
        } else {
          const el = j.el;
          rest = 0;
          if (f < 0.2) {
            // PERCEIVE / DECIDE: sensor ray to the candidate, then to the chosen node
            const sub = f / 0.2;
            sc.pointAt(el, 0, aim);
            haveAim = true;
            const step = el > 0 ? STEPS[el - 1] : null;
            if (step) sc.nodePoint(step.back, cand);
            else sc.nodePoint(0, cand);
            if (step) sc.nodePoint(step.next, chosen);
            else sc.nodePoint(0, chosen);
            if (sub < 0.5) fx.beam(arm.eye, cand, 'sensor', range(sub, 0.05, 0.2));
            else fx.beam(arm.eye, step?.reason ? chosen : cand, 'sensor', 1 - range(sub, 0.85, 1));
            const verdict = sub >= 0.3;
            const ok = !step || !step.reason;
            const opA = easeOut(range(sub, 0.05, 0.25)) * (ok ? 1 : 1 - range(sub, 0.75, 1));
            fx.sprite(0, cand.setZ(cand.z + 0.6), verdict ? (ok ? 'accept' : 'reject') : 'ring', 1.4, verdict ? (ok ? colTeal : colGrey) : colTeal, opA);
            if (step?.reason) fx.sprite(1, chosen.setZ(chosen.z + 0.6), 'accept', 1.4, colTeal, easeOut(range(sub, 0.55, 0.75)));
          } else if (f < 0.85) {
            // ACT: laser on, progressive reveal with a hot head
            const p = easeInOut(range(f, 0.2, 0.85));
            sc.setProgress(el, p);
            sc.setHead(el, 1);
            sc.pointAt(el, p, aim);
            haveAim = true;
            fx.beam(arm.emitter, aim, 'laser', Math.min(1, range(f, 0.2, 0.24) * 1.0));
            fx.sprite(2, aim, 'glow', 1.6, colSpark, 2.6);
            fx.sprite(3, arm.emitter, 'glow', 0.9, colFlare, 1.6);
            if (el > 0) {
              const s = STEPS[el - 1];
              sc.nodePoint(s.next, tmp);
              fx.sprite(1, tmp.setZ(tmp.z + 0.6), 'accept', 1.4, colTeal, 1 - range(f, 0.6, 0.85));
            }
          } else {
            if (!j.done) finishDraw(j);
            sc.pointAt(el, 1, aim);
            haveAim = true;
            // next element straight away (chained, faster) or re-park
            if (f >= 1) {
              job = null;
              if (pending() > 0 && (visible || j.forced)) startDraw(shown, j.forced);
            }
            rest = range(f, 0.88, 1) * (pending() > 0 ? 0 : 1);
          }
        }
      } else if (job && (job.kind === 'sweep' || job.kind === 'bow')) {
        const j = job;
        idle = 0;
        j.t += dt;
        const f = j.t / j.dur;
        if (j.kind === 'sweep') {
          rest = 1 - range(f, 0, 0.12) + range(f, 0.9, 1);
          const g1 = sc.range(Math.max(0, shown - 1))[1];
          const g = easeInOut(range(f, 0.12, 0.88)) * g1;
          if (f > 0.1 && f < 0.9) {
            sc.setSweep(g);
            let e = 0;
            while (e < ELEMENTS - 1 && sc.range(e)[1] < g) e++;
            const [r0, r1] = sc.range(e);
            sc.pointAt(e, THREE.MathUtils.clamp((g - r0) / (r1 - r0), 0, 1), aim);
            haveAim = true;
            fx.beam(arm.emitter, aim, 'laser', 1);
            fx.sprite(2, aim, 'glow', 1.4, colWarm, 2.4);
            fx.sprite(3, arm.emitter, 'glow', 0.8, colFlare, 1.4);
          } else sc.setSweep(null);
          if (f >= 1) {
            sc.setSweep(null);
            ctx.events.emit('logo:sweep', { phase: 'done', earned });
            job = null;
            if (shown >= ELEMENTS && (earned >= ELEMENTS || j.forced) && !ctx.settings.reducedMotion) {
              job = { kind: 'bow', t: 0, dur: 2.6, forced: j.forced };
              ctx.events.emit('logo:bow', { earned });
            }
          }
        } else {
          // the arm signs off: it looks at the Messpunkt and bows once
          rest = range(f, 0.85, 1);
          const nod = Math.sin(range(f, 0.25, 0.75) * Math.PI);
          hover.set(0, 39.4 - 0.9 * nod, 16.2 + 0.4 * nod);
          aim.copy(E);
          aim.y -= 30 * nod;
          haveAim = true;
          if (f >= 1) job = null;
        }
      }

      // landing ring and the decaying hot head
      if (ringPulse >= 0) {
        ringPulse += dt;
        const k = ringPulse / 1.1;
        if (k >= 1) ringPulse = -1;
        else fx.sprite(4, tmp.copy(ringAt).setZ(ringAt.z + 0.4), 'ring', 0.6 + 4 * easeOut(k), colOrange, Math.pow(1 - k, 2) * 2.2);
      }
      if (headEl >= 0 && (!job || job.kind !== 'draw' || job.el !== headEl)) {
        headK *= Math.exp(-6 * dt);
        sc.setHead(headEl, headK);
        if (headK < 0.01) {
          headEl = -1;
          sc.setHead(-1, 0);
        }
      } else if (job && job.kind === 'draw' && job.done) {
        headK *= Math.exp(-6 * dt);
        sc.setHead(job.el, headK);
      }

      // the arm: smooth rest blend on top of its own servo dynamics
      armRest += THREE.MathUtils.clamp(rest - armRest, -dt * 2.4, dt * 2.4);
      if (job && job.kind === 'draw' && !job.reduced && job.t / job.dur < 0.2 && chain <= 1) armRest = Math.min(armRest, 1 - range(job.t / job.dur, 0, 0.18));
      arm.update(dt, haveAim ? aim : null, armRest, speed, job && job.kind === 'bow' ? hover : null);

      // idle "ready" spark while elements wait for the player to look; the sensor eye is always awake
      if (!job && pending() > 0) fx.sprite(5, arm.emitter, 'glow', 0.7, colWarm, 1.75);
      fx.sprite(6, arm.eye, 'glow', 0.32, colTeal, job ? 2.2 : 1.0);
      if (!job && hiss) {
        hiss.stop();
        hiss = null;
      }

      if (label && labelTtl < 50) {
        labelTtl -= dt;
        if (labelTtl <= 0) {
          label.remove();
          label = null;
        }
      }
      fx.commit();
    },
  };
  void kit;
  return api;
}
