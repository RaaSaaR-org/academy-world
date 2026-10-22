/**
 * Station A „Erster Schritt im Kopf“ (Probieren; plan §4.8, R3 §5.5): walk the Unitree R1 25 m over six
 * Weichen — three of training floor, an ice sheen, glass that looks like floor, a loose grating. At each
 * the R1 stops; hold Space and its dream shows the next second, then E „Vertrauen“ or Q „Prüfen“ (a safe
 * probe step, 3 s). The dream assumes the training floor everywhere (μ̂ = 0,8): on ice it looks just as
 * sure. A wrong trust slips, the R1 falls and gets up again („Er hat Boden geträumt. Es war Eis.“).
 *
 * Measured value „Vertrauen richtig 5/6 · 68 s“ · ★ reach the end · ★★ ≥ 5/6 correct calls · ★★★ 6/6 in
 * ≤ 75 s. Under reduced motion no slip animation: a still with the floor's label.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ChallengeHandle, Stars } from '@/core/zones';
import { A, DOCKS, FLOOR, JUICE } from './tuning';
import { correctCall, weichen, type PatchKind } from './model';
import { DreamEnsemble } from './dream';
import type { Hangar } from './shared';
import { chipRow, el, legend } from './ui';

type Phase = 'off' | 'walkout' | 'walk' | 'stop' | 'cross' | 'probe' | 'slip' | 'fall' | 'getup' | 'still' | 'done';

export interface StationA {
  start(): void;
  /** the playtest's solve: a clean run, 6/6 in 64 s (★ or ★★★) */
  solve(stars?: Stars): void;
  readonly status: Record<string, unknown>;
  update(dt: number): void;
  readonly challenge: ChallengeHandle;
  /** the view hook: piloting, stopped before a Weiche, Space held */
  view(): Promise<() => void>;
}

const _v = new THREE.Vector3();
const slideFrom = new THREE.Vector3();

export function buildStationA(H: Hangar): StationA {
  const { ctx, roster, pilot, ghosts, sound } = H;
  const T = H.T;
  const M = ctx.materials;
  const det = ctx.groups.detail;
  const patchStart = (i: number): number => A.patches[i] - A.patchD / 2;
  const patchEnd = (i: number): number => A.patches[i] + A.patchD / 2;

  // ── the six Weichen: four looks each (the kinds shuffle per attempt), the stop lines ─────────────
  const looks: Record<PatchKind, THREE.Material> = {
    train: M.standard({ color: 0xa9a399, roughness: 0.9, metalness: 0 }),
    ice: M.standard({ color: 0xdfe9ee, roughness: 0.05, metalness: 0.05, emissive: 0x9fb7c2, emissiveIntensity: 0.08 }),
    glass: M.standard({ color: 0xa8aca6, roughness: 0.06, metalness: 0.25 }),
    grating: M.standard({ color: 0x55585a, roughness: 0.45, metalness: 0.75 }),
  };
  const slab = new THREE.BoxGeometry(A.patchW, 0.016, A.patchD);
  const bars: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 11; k++) bars.push(new THREE.BoxGeometry(A.patchW - 0.1, 0.03, 0.035).translate(0, 0.02, -A.patchD / 2 + 0.1 + k * ((A.patchD - 0.2) / 10)));
  for (let k = 0; k < 2; k++) bars.push(new THREE.BoxGeometry(0.05, 0.035, A.patchD - 0.1).translate((k ? 1 : -1) * (A.patchW / 2 - 0.05), 0.02, 0));
  const grate = mergeGeometries([slab.clone().scale(1, 0.5, 1), ...bars])!;
  ctx.onDispose(() => (slab.dispose(), grate.dispose(), bars.forEach((b) => b.dispose())));
  const patches = A.patches.map((z, i) => {
    const g = new THREE.Group();
    g.position.set(A.x, 0.012, z);
    g.name = `traum:weiche-${i}`;
    g.userData.noMerge = true;
    const meshes = {} as Record<PatchKind, THREE.Mesh>;
    for (const k of ['train', 'ice', 'glass', 'grating'] as PatchKind[]) {
      const m = new THREE.Mesh(k === 'grating' ? grate : slab, looks[k]);
      m.receiveShadow = true;
      m.visible = false;
      g.add(m);
      meshes[k] = m;
    }
    det.add(g);
    // the Weiche's stop line (static, merged): a dashed white line where the R1 stops
    for (let d = 0; d < 6; d++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.07), M.standard({ color: 0xf5f5f4, roughness: 0.7 }));
      s.position.set(A.x - 1.3 + d * 0.52, 0.012, patchStart(i) - A.stopGap + 0.05);
      ctx.onDispose(() => s.geometry.dispose());
      det.add(s);
    }
    return { group: g, meshes };
  });

  // ── state ────────────────────────────────────────────────────────────────────────────────────
  const st = {
    phase: 'off' as Phase,
    kinds: weichen(A, 1),
    idx: 0,
    calls: [] as { kind: PatchKind; call: 'trust' | 'probe'; ok: boolean }[],
    t: 0,
    started: false,
    phaseT: 0,
    dreamed: 0,
    greeted: ctx.progress.get('a.greeted', false),
    best: null as null | { correct: number; time: number },
  };
  const showKinds = (): void => patches.forEach((p, i) => (Object.keys(p.meshes) as PatchKind[]).forEach((k) => (p.meshes[k].visible = st.kinds[i] === k)));
  showKinds();
  const kindAt = (x: number, z: number): PatchKind => {
    if (Math.abs(x - A.x) > A.patchW / 2) return 'train';
    for (let i = 0; i < A.patches.length; i++) if (z >= patchStart(i) && z <= patchEnd(i)) return st.kinds[i];
    return 'train';
  };
  const mu = (x: number, z: number): number => FLOOR[kindAt(x, z)];

  // the dream: K heads on the training floor only (it knows no other)
  let dream: DreamEnsemble | null = null;
  const ensureDream = (): DreamEnsemble => (dream ??= new DreamEnsemble(ctx.physics.rapier, [], [], { radius: 0.19, seed: 11 }));
  ctx.onDispose(() => dream?.dispose());

  // ── the challenge ────────────────────────────────────────────────────────────────────────────
  const challenge = ctx.game.challenge({
    id: 'erster-schritt',
    title: T('a.title'),
    metric: { label: T('a.metric'), unit: 's', better: 'lower', digits: 0 },
    goals: [{ text: T('a.g1') }, { text: T('a.g2') }, { text: T('a.g3'), at: A.starTime }],
    lesson: T('a.lesson'),
    why: () => ({
      eyebrow: T('a.card.eyebrow'),
      title: T('a.card.title'),
      body: [T('a.card.entdecker'), T('a.card.honest')],
      entscheider: { body: [T('a.card.entscheider'), T('a.card.honest')] },
    }),
    retry: () => restart(),
  });

  let status: { set(s: string): void } | null = null;
  let calls: { set(s: string): void } | null = null;
  const setStatus = (key: string, p?: Record<string, string | number>): void => status?.set(ctx.t(key, p));
  const correct = (): number => st.calls.filter((c) => c.ok).length;
  // the tally row shows from the first call on (the console stays short at open)
  let callsEl: HTMLElement | null = null;
  const refreshCalls = (): void => {
    calls?.set(ctx.t('a.calls', { n: correct(), of: st.calls.length }));
    if (callsEl) callsEl.style.display = st.calls.length ? 'flex' : 'none';
  };

  // ── the run ──────────────────────────────────────────────────────────────────────────────────
  const restart = (): void => {
    const rig = roster.rig('r1');
    if (!rig) return;
    st.kinds = weichen(A, H.seed());
    showKinds();
    st.idx = 0;
    st.calls = [];
    st.t = 0;
    st.started = false;
    st.dreamed = 0;
    rig.place(A.x, A.startZ, 0, 1);
    st.phase = 'walk';
    setStatus('a.s.walk');
    refreshCalls();
    ghosts.hide(true);
  };

  const stopZ = (): number => (st.idx < A.patches.length ? patchStart(st.idx) - A.stopGap - 0.12 : Infinity);

  const decide = (call: 'trust' | 'probe'): void => {
    if (st.phase !== 'stop') return;
    const kind = st.kinds[st.idx];
    const ok = correctCall(kind, call);
    st.calls.push({ kind, call, ok });
    refreshCalls();
    ghosts.hide();
    const rig = roster.rig('r1')!;
    if (call === 'probe') {
      st.phase = 'probe';
      st.phaseT = 0;
      setStatus('a.s.probe');
      ctx.audio.play('beep', { volume: 0.4, pitch: 1.4 });
    } else {
      st.phase = 'cross';
      setStatus('a.s.trust');
      sound.snap();
    }
    if (call === 'trust' && kind === 'train') {
      ctx.game.juice.popup([A.x, 1.4, A.patches[st.idx]], T('a.pop.train'), { tone: 'teal', seconds: 1.6 });
      sound.ok();
    }
    void rig;
  };

  const passPatch = (): void => {
    st.idx++;
    st.phase = st.idx >= A.patches.length ? 'walk' : 'walk';
    setStatus(st.idx >= A.patches.length ? 'a.s.finish' : 'a.s.walk');
  };

  const finish = (): void => {
    st.phase = 'done';
    const rig = roster.rig('r1');
    ghosts.hide();
    const n = correct();
    const time = Math.round(st.t);
    const stars: Stars = (1 + (n >= A.starCalls ? 1 : 0) + (n === 6 && time <= A.starTime ? 1 : 0)) as Stars;
    award(n, time, stars);
    setStatus('a.s.done', { n, t: time });
    if (rig) ctx.game.juice.burst([rig.gait.pos.x, 1.2, rig.gait.pos.z], { tone: 'teal', count: 50, spread: 1.2 });
  };

  const award = (n: number, time: number, stars: Stars): void => {
    const val = (lang: 'de' | 'en'): string => (lang === 'de' ? `Vertrauen richtig ${n}/6 · ${time} s` : `Right calls ${n}/6 · ${time} s`);
    const isNew = ctx.pass.award('erster-schritt', { value: { de: val('de'), en: val('en') } });
    challenge.submit(time, { stars, detail: T('a.detail', { n }) });
    if (isNew) {
      H.deliver('r1');
      H.refreshObjective();
    }
    if (!st.best || n > st.best.correct || (n === st.best.correct && time < st.best.time)) st.best = { correct: n, time };
  };

  const imagine = (): void => {
    const rig = roster.rig('r1');
    if (!rig || (st.phase !== 'stop' && st.phase !== 'walk')) return;
    const d = ensureDream();
    if (d.running) return;
    const g = rig.gait;
    // the dream holds „walk on“ (what Vertrauen would do) for one second
    d.start({ x: g.pos.x, z: g.pos.z, vx: g.vel.x, vz: g.vel.z, head: rig.head, drive: { kind: 'cmd', v: g.p.vMax, w: 0 }, carrying: false, objects: [] }, A.horizon);
    sound.swell();
    sound.hum(true);
    st.dreamed++;
    if (st.dreamed === 1 && !ctx.progress.get('a.firstGhost', false)) {
      ctx.progress.set('a.firstGhost', true);
      H.say(T('emi.a.firstGhost'));
    }
  };

  const hooks = {
    title: T('a.bar'),
    keys: ['KeyE', 'KeyQ', 'KeyR'],
    mu,
    command: (simDt: number): { v: number; w: number } | null => {
      const rig = roster.rig('r1');
      if (!rig) return null;
      const g = rig.gait;
      switch (st.phase) {
        case 'walkout': {
          const dz = A.startZ - g.pos.z;
          if (dz < 0.05) {
            st.phase = 'walk';
            setStatus('a.s.walk');
            return { v: 0, w: 0 };
          }
          return { v: Math.min(g.p.vMax, dz * 1.5 + 0.15), w: 0 };
        }
        case 'walk': {
          const k = pilot.keys();
          if (k.v > 0 && !st.started) st.started = true;
          // the R1 stops before an undecided Weiche (it brakes in time on the training floor)
          const brake = g.v * g.v / (2 * 0.9) + 0.02;
          if (g.pos.z + brake >= stopZ()) {
            if (Math.abs(g.v) < 0.03) {
              st.phase = 'stop';
              setStatus('a.s.stop');
            }
            return { v: 0, w: k.w };
          }
          return k;
        }
        case 'stop':
          return { v: 0, w: 0 };
        case 'cross':
          return { v: rig.params.vMax, w: steer(g) };
        case 'probe': {
          st.phaseT += simDt;
          if (st.phaseT < A.probeS) {
            // one careful step onto the patch: the foot feels the floor
            if (st.phaseT > 0.6 && st.phaseT - simDt <= 0.6) {
              const kind = st.kinds[st.idx];
              ctx.game.juice.popup([A.x, 1.3, patchStart(st.idx) + 0.2], T(`a.probe.${kind}`, { mu: ctx.i18n.num(FLOOR[kind], 2) }), { tone: kind === 'train' ? 'teal' : 'accent', seconds: 2.4 });
              sound.step([A.x, 0.1, patchStart(st.idx)], 0.3);
            }
            return { v: st.phaseT < 0.8 ? 0.12 : 0, w: 0 };
          }
          return { v: A.probeSpeed, w: steer(g) };
        }
        case 'slip':
          // reality: the robot wanted to walk on, the floor did not hold (the traction model slides it)
          return { v: rig.params.vMax, w: 0 };
        default:
          return { v: 0, w: 0 };
      }
    },
    clamp: (p: THREE.Vector3) => {
      p.x = THREE.MathUtils.clamp(p.x, A.x - A.halfW, A.x + A.halfW);
      if (st.phase !== 'walkout') p.z = Math.max(p.z, A.startZ - 0.4);
    },
    onKey: (code: string) => {
      if (code === 'KeyE') decide('trust');
      else if (code === 'KeyQ') decide('probe');
      else if (code === 'KeyR') restart();
    },
    onImagine: imagine,
    onAct: () => {
      sound.hum(false);
      if (ghosts.shown) ghosts.show('r1', [], null, [], [], { holdS: 1.2 });
    },
    update: (dt: number, simDt: number) => {
      const rig = roster.rig('r1');
      if (!rig) return;
      const g = rig.gait;
      if (st.started && st.phase !== 'done') st.t += simDt;
      // the dream: step it, show it
      if (dream?.running && dream.tick()) {
        const pose = rig.model.getPose();
        ghosts.show(
          'r1',
          dream.results.map((r) => ({ x: r.x, z: r.z, head: r.head })),
          pose,
          dream.results.map((r) => ({ pts: r.trail, n: r.n })),
          [],
          { holdS: pilot.imagining ? 0 : 2 },
        );
      }
      if (g.touchdown) sound.step([g.pos.x, 0.05, g.pos.z], 0.2);
      // crossing: a wrong trust slips on the first step onto the patch
      if (st.phase === 'cross' && st.idx < A.patches.length) {
        const kind = st.kinds[st.idx];
        if (kind !== 'train' && g.pos.z >= patchStart(st.idx) + 0.15) {
          st.phase = 'slip';
          st.phaseT = 0;
          sound.slip([g.pos.x, 0.1, g.pos.z]);
          ctx.game.unattended(true, 'erster-schritt');
          if (ctx.settings.reducedMotion) {
            // reduced motion: no slip animation, a still with the floor's label
            st.phase = 'still';
            ctx.ui.hint(T(`a.still.${kind}`), 2.2);
          } else pilot.chaseFor(A.slipS + A.fallS + A.getUpS + 0.4);
        } else if (g.pos.z >= patchEnd(st.idx) + 0.25) passPatch();
      } else if (st.phase === 'probe' && st.phaseT >= A.probeS && g.pos.z >= patchEnd(st.idx) + 0.25) passPatch();
      else if (st.phase === 'slip') {
        st.phaseT += simDt;
        if (st.phaseT >= A.slipS) {
          st.phase = 'fall';
          st.phaseT = 0;
          rig.fallT = 0;
          slideFrom.copy(g.pos);
        }
      } else if (st.phase === 'fall') {
        st.phaseT += simDt;
        rig.fallT = Math.min(1, st.phaseT / A.fallS);
        // it slides on across the patch while it goes down (it gets up on the far side)
        const u = THREE.MathUtils.smoothstep(st.phaseT / A.fallS, 0, 1);
        g.pos.lerpVectors(slideFrom, _v.set(A.x, 0, patchEnd(st.idx) + 0.45), u);
        g.vel.set(0, 0, 0);
        if (st.phaseT >= A.fallS) {
          sound.thud([g.pos.x, 0.2, g.pos.z]);
          if (st.kinds[st.idx] === 'ice' && !ctx.progress.get('a.iceLine', false)) {
            ctx.progress.set('a.iceLine', true);
            H.say(T('emi.a.ice'), true);
          } else ctx.game.juice.popup([g.pos.x, 1.2, g.pos.z], T(`a.fail.${st.kinds[st.idx]}`), { tone: 'bad', seconds: 2.2 });
          st.phase = 'getup';
          st.phaseT = 0;
          // it gets up past the patch: the feet come home under it
          g.place(_v.set(A.x, 0, patchEnd(st.idx) + 0.45), g.psi);
        }
      } else if (st.phase === 'getup') {
        st.phaseT += simDt;
        rig.fallT = Math.max(0, 1 - st.phaseT / A.getUpS);
        if (st.phaseT >= A.getUpS) {
          rig.fallT = null;
          ctx.game.unattended(false, 'erster-schritt');
          passPatch();
        }
      } else if (st.phase === 'still') {
        st.phaseT += simDt;
        if (st.phaseT >= 2.2) {
          g.place(_v.set(A.x, 0, patchEnd(st.idx) + 0.45), g.psi);
          st.t += A.fallS + A.getUpS;
          ctx.game.unattended(false, 'erster-schritt');
          passPatch();
        }
      }
      if (st.phase === 'walk' && st.idx >= A.patches.length && g.pos.z >= A.endZ) finish();
      void dt;
    },
    onExit: () => {
      sound.hum(false);
      ghosts.hide();
      H.active = null;
      ctx.game.unattended(false, 'erster-schritt');
      const rig = roster.rig('r1');
      if (rig) rig.fallT = null;
      if (st.phase !== 'done') st.phase = 'off';
      H.refreshObjective();
    },
    panel: (root: HTMLElement) => {
      root.dataset.th = 'panel-a';
      root.append(el('div', 'eyebrow', ctx.t('a.title')));
      const goal = challenge.chips();
      goal.style.margin = '6px 0 2px';
      root.append(goal);
      const s = chipRow(ctx, 'sim', T('a.chipNote'));
      status = { set: (x) => s.set(x) };
      root.append(s.el);
      const c = chipRow(ctx, 'sim');
      calls = c;
      callsEl = c.el;
      root.append(c.el);
      root.append(legend([[['W', 'A', 'D'], ctx.t('k.walk')], [['␣'], ctx.t('k.dream')], [['E'], ctx.t('k.trust')], [['Q'], ctx.t('k.probe')], [['V'], ctx.t('k.chase')]]));
      setStatus(st.phase === 'walkout' ? 'a.s.walkout' : st.phase === 'stop' ? 'a.s.stop' : 'a.s.walk');
      refreshCalls();
      return () => {
        status = null;
        calls = null;
        callsEl = null;
      };
    },
  };

  /** keep the robot straight on the lane while it crosses */
  const steer = (g: { pos: THREE.Vector3; psi: number }): number => {
    const rig = roster.rig('r1')!;
    const want = rig.gait.psiFacing(0, 1);
    let e = want - g.psi;
    e = Math.atan2(Math.sin(e), Math.cos(e));
    return THREE.MathUtils.clamp(e * 2 + (A.x - g.pos.x) * 0.8, -0.6, 0.6);
  };

  const start = (): void => {
    if (H.waitFor('r1')) return;
    const rig = roster.rig('r1')!;
    H.active = 'a';
    roster.setActive('r1');
    void ghosts.prepare('r1');
    if (st.phase === 'off' || st.phase === 'done') {
      st.kinds = weichen(A, H.seed());
      showKinds();
      st.idx = 0;
      st.calls = [];
      st.t = 0;
      st.started = false;
      st.dreamed = 0;
      rig.place(DOCKS.x.r1, DOCKS.robotZ, 0, 1);
      st.phase = 'walkout';
    }
    rig.armMode = 'rest';
    pilot.enter(rig, hooks);
    if (!st.greeted) {
      st.greeted = true;
      ctx.progress.set('a.greeted', true);
      H.say(T('emi.a.start'));
    }
  };

  return {
    start,
    challenge,
    solve(stars = 1) {
      // a clean run: 6/6 at 64 s (★★★) or the stamp condition only (★: reach the end with 4/6 at 80 s)
      if (stars >= 3) award(6, 64, 3);
      else award(4, 80, 1);
    },
    get status() {
      return { phase: st.phase, idx: st.idx, kinds: st.kinds, calls: st.calls, t: Math.round(st.t * 10) / 10, dreamed: st.dreamed, best: st.best };
    },
    update(dt) {
      void dt;
      void JUICE;
    },
    async view() {
      // the measured ghost moment: piloting the R1, stopped before the ice, Space held, dreaming again
      start();
      const rig = roster.rig('r1');
      if (!rig) return () => {};
      st.kinds = ['train', 'ice', 'train', 'glass', 'train', 'grating'];
      showKinds();
      st.idx = 1;
      rig.place(A.x, patchStart(1) - A.stopGap - 0.15, 0, 1);
      st.phase = 'stop';
      pilot.bot(['Space']);
      const timer = ctx.every(0.5, () => {
        if (dream && !dream.running) {
          imagine();
        }
      });
      await new Promise((r) => setTimeout(r, 900));
      return () => {
        timer();
        pilot.bot(null);
        pilot.exit();
      };
    },
  };
}
