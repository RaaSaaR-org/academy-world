/**
 * Station „Lastenheft“ (plan §4.9, R4 §8; ★ id `lastenheft`, ≈ 2 min a round). The terminal at the
 * reception deals three jobs from the pool — two that one robot fits and one where none does (the trick
 * when it can) — drawn only from robots already standing. Walk to a robot and press „Passt“ on its card,
 * or „Keiner passt“ at the terminal; then tap the row that decided. Only stated values count („k. A.“
 * never fits). ★ 2 of 3 right · ★★ 3 of 3, each justified · ★★★ also the trick job right.
 * Lesson: „Die Zahl allein reicht nicht. Die Bedingung entscheidet.“
 */
import type { ChallengeHandle, RobotId, RobotManifestEntry, Stars, ZoneContext } from '@/core/zones';
import { decidingRow, fits, JOBS, type Job } from './data/jobs';
import { HALL_ROBOTS, ROBOT_BY_ID, type RowKey } from './data/robots';
import type { CardHandle } from './datenblatt';
import { sheet, zs } from './sheet';
import { el, ensureCss } from './ui';

export interface Answer {
  job: string;
  pick: RobotId | 'keiner';
  right: boolean;
  justified: boolean;
  trick: boolean;
}

export interface Lastenheft {
  /** the open job (null: no round) */
  readonly job: Job | null;
  readonly round: { jobs: Job[]; i: number; answers: Answer[] } | null;
  /** the card's job block for a robot (Inspektion) */
  jobFor(id: RobotId): { label: string; onFits(): void } | null;
  /** Inspektion opened a card: wire „Passt“ to it */
  attachCard(id: RobotId, card: CardHandle): void;
  openTerminal(): void;
  startRound(): void;
  /** answer the current job (tools: the solve hook) and justify with `row` */
  answer(pick: RobotId | 'keiner', row?: RowKey | null): Answer | null;
  readonly challenge: ChallengeHandle;
  readonly stamped: boolean;
  /** a round ended (first visit: deliveries may start) */
  onRoundEnd(fn: (k: number, stars: Stars) => void): void;
  /** the Entscheider Befundkarte „Datenblatt“ is offered after a round */
  setBefund(fn: (() => void) | null): void;
}

export function buildLastenheft(
  ctx: ZoneContext,
  d: {
    infos: ReadonlyMap<RobotId, RobotManifestEntry>;
    standing(id: RobotId): boolean;
    say(line: string): void;
    /** close the Inspektion card after an answer is justified */
    closeCard(): void;
  },
): Lastenheft {
  const T = ctx.i18n.text;
  const z = (k: string, p?: Record<string, string | number>): string => zs(ctx.i18n.lang, k, p);
  let round: Lastenheft['round'] = null;
  /** an answer waiting for its justification tap */
  let pending: { answer: Answer; job: Job; robot: RobotId | null } | null = null;
  let panel: ReturnType<ZoneContext['hud']['panel']> | null = null;
  let terminalEl: HTMLElement | null = null;
  let attempt = ctx.progress.get<number>('lhRounds', 0);
  const endFns: ((k: number, s: Stars) => void)[] = [];
  let befund: (() => void) | null = null;

  const ch = ctx.game.challenge({
    id: 'lastenheft',
    title: T('lh.challenge'),
    metric: { label: T('lh.metric'), unit: '/3', better: 'higher', digits: 0 },
    goals: [{ text: T('lh.g1'), at: 2 }, { text: T('lh.g2') }, { text: T('lh.g3') }],
    lesson: T('lh.lesson'),
    why: () => ({
      eyebrow: T('lh.eyebrow'),
      title: T('lh.title'),
      body: [T('lh.lesson'), (lang) => (lang === 'en' ? 'Payload depends on pose, rated is not peak, recommended is not maximum, and the environment is a spec too.' : 'Traglast hängt an der Haltung, Nennlast ist nicht Spitze, empfohlen ist nicht maximal – und die Umgebung ist auch eine Angabe.')],
      forDecisionMakers: {
        title: (lang) => (lang === 'en' ? 'Before you sign' : 'Bevor du unterschreibst'),
        bullets: [
          (lang) => (lang === 'en' ? 'Every spec has a condition: ask for it.' : 'Jede Angabe hat eine Bedingung: Frag danach.'),
          (lang) => (lang === 'en' ? 'Check the status before the spec.' : 'Prüf den Status vor der Angabe.'),
          (lang) => (lang === 'en' ? 'A list price is not the cost.' : 'Ein Listenpreis ist nicht die Rechnung.'),
        ],
      },
    }),
    retry: () => startRound(),
  });

  // ── the deal: two jobs one standing robot fits, one where none does ─────────
  const rng = (seed: number): (() => number) => {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  };
  const deal = (): Job[] => {
    const r = rng(1 + attempt * 7919);
    const fitJobs = JOBS.filter((j) => j.answer !== 'keiner' && (j.answer as RobotId[]).every((id) => d.standing(id)));
    const none = JOBS.filter((j) => j.answer === 'keiner' && (j.near ?? []).some((n) => d.standing(n.id) || n.id === 'unitree-h2'));
    const pick = <T>(list: T[], n: number): T[] => {
      const a = [...list];
      const out: T[] = [];
      while (a.length && out.length < n) out.push(a.splice(Math.floor(r() * a.length), 1)[0]);
      return out;
    };
    const keiner = none.find((j) => j.trick) ?? none[0] ?? null;
    const two = pick(fitJobs, keiner ? 2 : 3);
    // too few standing robots fit a job (an early visit in a build without the amber exhibits,
    // src/core/release.ts): the other „Keiner passt“ jobs fill the round up to three
    two.push(...pick(none.filter((j) => j !== keiner), (keiner ? 2 : 3) - two.length));
    const jobs = keiner ? [...two] : two;
    if (keiner) jobs.splice(Math.floor(r() * (jobs.length + 1)), 0, keiner);
    return jobs.slice(0, 3);
  };

  const job = (): Job | null => (round && round.i < round.jobs.length ? round.jobs[round.i] : null);
  const jobLine = (): string => {
    const j = job();
    return j ? z('lh.jobLine', { i: round!.i + 1, job: ctx.i18n.resolve(j.text) }) : '';
  };

  // ── HUD: the open job while you walk ─────────────────────────────────────
  const syncHud = (): void => {
    const j = job();
    if (!j || !ctx.playerInside) {
      panel?.remove();
      panel = null;
      ctx.events.emit('schauhalle:objective', {});
      return;
    }
    if (!panel) panel = ctx.hud.panel({ eyebrow: T('lh.eyebrow') });
    panel.setEyebrow((lang) => `${zs(lang, 'lh.eyebrow')} · ${zs(lang, 'lh.job', { i: round!.i + 1 })}`);
    panel.setContent((lang) => `${lang === 'en' ? j.text.en : j.text.de}\n${zs(lang, 'lh.how')}`);
    panel.el.setAttribute('data-chip', 'job');
    ctx.events.emit('schauhalle:objective', {});
  };

  const startRound = (): void => {
    attempt++;
    ctx.progress.set('lhRounds', attempt);
    round = { jobs: deal(), i: 0, answers: [] };
    pending = null;
    void ch.begin();
    ch.live(z('lh.job', { i: 1 }));
    d.say(z('lh.emiStart'));
    if (round.jobs.some((j) => j.trick) && attempt <= 1) ctx.after(5, () => d.say(z('lh.emiTrick')));
    renderTerminal();
    syncHud();
    ctx.events.emit('schauhalle:lastenheft', { kind: 'start', jobs: round.jobs.map((j) => j.id) });
  };

  const next = (): void => {
    if (!round) return;
    pending = null;
    round.i++;
    if (round.i >= round.jobs.length) {
      finish();
      return;
    }
    ch.live(z('lh.job', { i: round.i + 1 }));
    renderTerminal();
    syncHud();
  };

  const finish = (): void => {
    if (!round) return;
    const k = round.answers.filter((a) => a.right).length;
    const j = round.answers.filter((a) => a.right && a.justified).length;
    const trick = round.answers.some((a) => a.trick && a.right);
    const stars: Stars = k < 2 ? 0 : k === 3 && j === 3 ? (trick ? 3 : 2) : 1;
    if (stars >= 1) ctx.pass.award('lastenheft', { value: z('lh.result', { k, j }) });
    const res = stars >= 1 ? ch.submit(k, { stars, detail: z('lh.result', { k, j }) }) : null;
    if (!res) ch.fail(z('lh.fail', { k }));
    else if (stars >= 2) d.say(z('emi.lhDone'));
    ctx.events.emit('schauhalle:lastenheft', { kind: 'end', k, j, stars });
    const done = round;
    round = null;
    syncHud();
    renderTerminal(done);
    for (const f of endFns) f(k, stars);
  };

  // ── answering ────────────────────────────────────────────────────────────
  const answer = (pick: RobotId | 'keiner', row: RowKey | null = null): Answer | null => {
    const j = job();
    if (!j || pending) return null;
    let right: boolean;
    if (pick === 'keiner') right = j.answer === 'keiner';
    else {
      const r = ROBOT_BY_ID.get(pick);
      right = !!r && j.answer !== 'keiner' && j.answer.includes(pick) && fits(j, r);
    }
    const a: Answer = { job: j.id, pick, right, justified: false, trick: !!j.trick };
    round!.answers.push(a);
    pending = { answer: a, job: j, robot: pick === 'keiner' ? null : pick };
    ctx.game.juice.cue(right ? 'good' : 'bad');
    if (row) justify(row);
    return a;
  };

  /** the rows that decide this pending answer */
  const decides = (p: NonNullable<typeof pending>): Set<RowKey> => {
    const out = new Set<RowKey>();
    if (p.robot) out.add(decidingRow(p.job, ROBOT_BY_ID.get(p.robot)!));
    else if (p.job.answer === 'keiner') for (const n of p.job.near ?? []) out.add(n.row);
    else out.add(p.job.key);
    return out;
  };

  const justify = (row: RowKey | string): boolean => {
    if (!pending) return false;
    const ok = decides(pending).has(row as RowKey);
    pending.answer.justified = ok;
    ctx.game.juice.cue(ok ? 'tick' : 'oops');
    const done = pending;
    pending = null;
    ctx.events.emit('schauhalle:lastenheft', { kind: 'answer', job: done.job.id, pick: done.answer.pick, right: done.answer.right, justified: ok });
    return ok;
  };

  // ── the card of a robot (Inspektion) ──────────────────────────────────────
  const attachCard = (id: RobotId, card: CardHandle): void => {
    if (!job()) return;
    card.setJob({
      label: jobLine(),
      onFits: () => {
        const a = answer(id);
        if (!a) return;
        const j = pending!.job;
        card.setJob(null);
        card.expand(true);
        card.say(`${a.right ? z('lh.right') : z('lh.wrong')} ${z('lh.tap')}`, a.right ? 'good' : 'bad');
        const want = decidingRow(j, ROBOT_BY_ID.get(id)!);
        card.tappable((key) => {
          const ok = justify(key);
          card.tappable(null);
          card.mark(want, ok ? 'ok' : 'hint');
          if (!ok) card.mark(key, 'bad');
          const rowLabel = card.row(want)?.querySelector('.k')?.textContent ?? want;
          card.say(ok ? z('lh.justified', { row: rowLabel }) : `${z('lh.notThis')} ${rowLabel}.`, ok ? 'good' : 'bad');
          const btn = el('button', { class: 'btn small primary' }, round && round.i + 1 >= round.jobs.length ? z('lh.title') + ' ✓' : z('lh.next'));
          btn.addEventListener('click', () => {
            ctx.audio.play('click');
            d.closeCard();
            next();
          });
          card.root.querySelector('.say')?.appendChild(el('div', { class: 'btns' }, btn));
        });
      },
    });
  };

  // ── the terminal (operate panel) ─────────────────────────────────────────
  const renderTerminal = (ended?: NonNullable<Lastenheft['round']>): void => {
    if (!terminalEl) return;
    ensureCss();
    const root = el('div', { class: 'sh' });
    root.appendChild(el('div', { class: 'eyebrow' }, z('lh.eyebrow')));
    root.appendChild(el('h3', null, z('lh.title')));
    const j = job();
    if (!round && !ended) {
      root.appendChild(el('div', { class: 'line' }, z('lh.intro')));
      root.appendChild(el('div', { class: 'btns' }, el('button', { class: 'btn small primary', onclick: () => (ctx.audio.play('click'), startRound()) }, z('lh.start'))));
    } else if (ended) {
      const k = ended.answers.filter((a) => a.right).length;
      const jj = ended.answers.filter((a) => a.right && a.justified).length;
      root.appendChild(el('div', { class: 'line', 'data-chip': 'ui' }, z('lh.result', { k, j: jj })));
      root.appendChild(el('div', { class: 'say good' }, z('lh.lesson')));
      const btns = el('div', { class: 'btns' }, el('button', { class: 'btn small primary', onclick: () => (ctx.audio.play('click'), startRound()) }, z('lh.again')));
      if (befund) btns.appendChild(el('button', { class: 'btn small ghost', onclick: () => befund?.() }, z('lh.befund')));
      root.appendChild(btns);
    } else if (j) {
      const box = el('div', { class: 'job', 'data-chip': 'job' }, el('div', { class: 't' }, jobLine()), el('div', { class: 'line' }, z('lh.how')));
      root.appendChild(box);
      const sayEl = el('div', { class: 'say' });
      const btns = el('div', { class: 'btns' });
      const noneBtn = el('button', { class: 'btn small' }, z('lh.none'));
      noneBtn.addEventListener('click', () => {
        ctx.audio.play('click');
        const a = answer('keiner');
        if (!a) return;
        const p = pending!;
        noneBtn.disabled = true;
        // the rows that decide: the near misses (or the robot that does fit), and one distractor
        const L = ctx.i18n.lang;
        const rows: { id: RobotId; row: RowKey }[] = [];
        if (p.job.answer === 'keiner') {
          rows.push(...(p.job.near ?? []).slice(0, 2));
          if (p.job.distractor) rows.push(p.job.distractor);
        } else rows.push({ id: p.job.answer[0], row: p.job.key });
        sayEl.className = `say ${a.right ? 'good' : 'bad'}`;
        sayEl.textContent = a.right ? `${z('lh.noneRight')} ${z('lh.tapNone')}` : `${z('lh.noneWrong', { name: ROBOT_BY_ID.get(p.job.answer[0] as RobotId)!.short })} ${z('lh.tap')}`;
        const list = el('div', { class: 'more' });
        for (const rr of rows) {
          const r = ROBOT_BY_ID.get(rr.id)!;
          const sh = sheet(r, L, d.infos.get(rr.id) ?? null);
          const row = [...sh.head, ...sh.more].find((x) => x.key === rr.row);
          const e = el('div', { class: 'row tap', 'data-row': rr.row }, el('span', { class: 'k' }, r.short), el('span', { class: 'v' }, row?.value ?? z('ka')), row?.chip ? ctx.ui.chip(row.chip) : el('span', null), row?.cond ? el('span', { class: 'c' }, row.cond) : null);
          e.addEventListener('click', () => {
            if (!pending) return;
            const ok = justify(rr.row) && !(p.job.distractor && rr.id === p.job.distractor.id && rr.row === p.job.distractor.row);
            p.answer.justified = ok;
            e.classList.add(ok ? 'ok' : 'bad');
            sayEl.textContent = ok ? z('lh.justified', { row: `${r.short} · ${row?.value ?? ''}` }) : z('lh.notThis').replace(/[:.]$/, '.');
            list.querySelectorAll('.row').forEach((x) => x.classList.remove('tap'));
            btns.replaceChildren(el('button', { class: 'btn small primary', onclick: () => (ctx.audio.play('click'), next()) }, round && round.i + 1 >= round.jobs.length ? z('lh.title') + ' ✓' : z('lh.next')));
          });
          list.appendChild(e);
        }
        root.appendChild(list);
      });
      btns.appendChild(noneBtn);
      root.appendChild(btns);
      root.appendChild(sayEl);
    }
    terminalEl.replaceChildren(root);
  };

  return {
    get job() {
      return job();
    },
    get round() {
      return round;
    },
    jobFor(id) {
      const j = job();
      if (!j || pending) return null;
      return { label: jobLine(), onFits: () => void answer(id) };
    },
    attachCard,
    openTerminal() {
      ctx.player.enterOperate({
        cameraPose: { position: [-2.2, 1.65, 10.7], lookAt: [-4.3, 1.4, 10.7] },
        title: T('lh.eyebrow'),
        panel: (host) => {
          terminalEl = host;
          renderTerminal();
          return () => {
            terminalEl = null;
          };
        },
        panelPosition: 'right',
      });
      ctx.events.emit('schauhalle:lastenheft', { kind: 'terminal' });
    },
    startRound,
    answer(pick, row = null) {
      const a = answer(pick, row ?? null);
      if (a && !pending) next();
      return a;
    },
    challenge: ch,
    get stamped() {
      return ctx.pass.has('lastenheft');
    },
    onRoundEnd(fn) {
      endFns.push(fn);
    },
    setBefund(fn) {
      befund = fn;
    },
  };
}

/** the right answer of a job and its deciding row (the solve hooks) */
export function solution(j: Job): { pick: RobotId | 'keiner'; row: RowKey } {
  if (j.answer === 'keiner') return { pick: 'keiner', row: j.near?.[0]?.row ?? j.key };
  return { pick: j.answer[0], row: j.key };
}
export { HALL_ROBOTS };
