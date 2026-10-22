/**
 * The Datenblatt card (plan §4.9, R4 §7.4): an operate panel beside the inspected robot. At open it
 * shows ≤ 35 words — name, status, Größe, Nutzlast with its condition, Preisklasse; everything else sits
 * on „Mehr“ (Gewicht, the model's measured height, Gelenke with „Gelenke zeigen“, Reichweite, Tempo,
 * Laufzeit, Umgebung, Kann heute / Grenzen, the full price row with its label and basis, Modell & Lizenz
 * from the manifest, Quelle with „Stand 17.10.2026“). Every number sits in a row with its chip.
 *
 * The Lastenheft uses the same card: with a job open it shows the job and „Passt“, then lets the player
 * tap the row that decided (rows are `[data-row=<key>]`).
 */
import type { RobotManifestEntry, ZoneContext } from '@/core/zones';
import type { HallRobot } from './data/robots';
import { chipLabel, sheet, zs, type SheetRow } from './sheet';
import { el, ensureCss } from './ui';

export interface CardOpts {
  robot: HallRobot;
  info: RobotManifestEntry | null;
  state: 'shown' | 'crate' | 'covered';
  job?: { label: string; onFits(): void } | null;
  onCompare?: (() => void) | null;
  onJoints?: ((on: boolean) => void) | null;
  onProbefahrt?: (() => void) | null;
  onVorfuehrung?: (() => void) | null;
}

export interface CardHandle {
  readonly root: HTMLElement;
  /** all rows by key (head and „Mehr“); the first of a key wins */
  row(key: string): HTMLElement | null;
  /** open „Mehr“ */
  expand(on?: boolean): void;
  /** let the player tap rows; the callback gets the row key */
  tappable(fn: ((key: string, rowEl: HTMLElement) => void) | null): void;
  mark(key: string, cls: 'ok' | 'bad' | 'hint'): void;
  say(text: string, tone?: 'good' | 'bad' | null): void;
  /** replace the job block (null removes it) */
  setJob(job: CardOpts['job']): void;
  jointsOn: boolean;
}

export function renderCard(ctx: ZoneContext, host: HTMLElement, o: CardOpts): CardHandle {
  ensureCss();
  const L = ctx.i18n.lang;
  const sh = sheet(o.robot, L, o.info);
  const z = (k: string, p?: Record<string, string | number>): string => zs(L, k, p);
  const chip = (c: SheetRow['chip'], src?: string | null): HTMLElement | null => {
    if (!c) return null;
    const e = ctx.ui.chip(c, src ?? undefined);
    return e;
  };
  const rowEl = (r: SheetRow): HTMLElement => {
    const ka = r.value == null;
    const e = el(
      'div',
      // a licence line names things (Apache-2.0, SO-101): an identifier, not a claim (text-audit --chips)
      { class: `row${ka ? ' ka' : ''}`, 'data-row': r.key, 'data-chip': r.key === 'license' ? 'name' : null },
      el('span', { class: 'k' }, r.label),
      el('span', { class: 'v' }, ka ? z('ka') : r.value!),
      ka ? el('span', null) : (chip(r.chip, r.src) ?? el('span', null)),
      r.cond ? el('span', { class: 'c' }, r.cond) : null,
    );
    return e;
  };

  const root = el('div', { class: 'sh' });
  // the job is a requirement, not a claim: its numbers need no chip
  const jobBox = el('div', { class: 'job', 'data-chip': 'job' });
  const head = el(
    'div',
    { class: 'sh-head' },
    el('div', null, el('div', { class: 'eyebrow' }, `${sh.cat} · ${sh.kind}`), el('h3', null, sh.name)),
    el('span', { class: `chip st-${o.robot.status}` }, sh.status),
  );
  root.appendChild(head);
  root.appendChild(jobBox);
  if (o.state === 'crate') root.appendChild(el('div', { class: 'line' }, z('card.crate').split('.')[0] + '.'));
  if (o.state === 'covered') root.appendChild(el('div', { class: 'line' }, z('card.covered').split('.')[0] + '.'));
  for (const r of sh.head) root.appendChild(rowEl(r));
  const more = el('div', { class: 'more', hidden: true });
  for (const r of sh.more) {
    if (r.key === 'source') more.appendChild(el('div', { class: 'src source' }, `${r.label}: ${r.value} · ${sh.asOf}`));
    else more.appendChild(rowEl(r));
  }
  if (o.robot.amber) more.appendChild(el('div', { class: 'src' }, z('card.amber')));
  const sayEl = el('div', { class: 'say' });
  const btns = el('div', { class: 'btns' });
  const moreBtn = el('button', { class: 'btn small ghost' }, z('card.more'));
  let expanded = false;
  const expand = (on = !expanded): void => {
    expanded = on;
    more.hidden = !on;
    moreBtn.textContent = on ? z('card.less') : z('card.more');
  };
  moreBtn.addEventListener('click', () => {
    ctx.audio.play('click');
    expand();
  });
  btns.appendChild(moreBtn);
  if (o.onCompare && o.state === 'shown')
    btns.appendChild(
      el('button', { class: 'btn small ghost', onclick: () => (ctx.audio.play('click'), o.onCompare?.()) }, z('card.compare')),
    );
  if (o.onProbefahrt && o.robot.probefahrt)
    btns.appendChild(
      el('button', { class: 'btn small ghost', title: ctx.i18n.resolve(o.robot.probefahrt.label), onclick: () => (ctx.audio.play('click'), o.onProbefahrt?.()) }, L === 'en' ? 'Test drive' : 'Probefahrt'),
    );
  let jointsOn = false;
  const jointBtn = el('button', { class: 'btn small ghost' }, z('card.joints'));
  jointBtn.addEventListener('click', () => {
    ctx.audio.play('click');
    handle.jointsOn = jointsOn = !jointsOn;
    jointBtn.textContent = jointsOn ? z('card.jointsOff') : z('card.joints');
    o.onJoints?.(jointsOn);
  });
  const moreBtns = el('div', { class: 'btns' });
  if (o.onJoints && o.state === 'shown') moreBtns.appendChild(jointBtn);
  if (o.onVorfuehrung && o.state === 'shown') moreBtns.appendChild(el('button', { class: 'btn small ghost', onclick: () => (ctx.audio.play('click'), o.onVorfuehrung?.()) }, `${z('vorf')} [V]`));
  more.prepend(moreBtns);
  root.appendChild(btns);
  root.appendChild(sayEl);
  root.appendChild(more);
  host.replaceChildren(root);

  let tapFn: ((key: string, e: HTMLElement) => void) | null = null;
  root.addEventListener('click', (ev) => {
    if (!tapFn) return;
    const r = (ev.target as HTMLElement).closest('.row') as HTMLElement | null;
    if (!r || !root.contains(r)) return;
    tapFn(r.dataset.row ?? '', r);
  });
  const setJob = (job: CardOpts['job']): void => {
    jobBox.replaceChildren();
    jobBox.style.display = job ? '' : 'none';
    if (!job) return;
    jobBox.appendChild(el('div', { class: 't' }, job.label));
    jobBox.appendChild(el('div', { class: 'btns' }, el('button', { class: 'btn small primary', onclick: () => (ctx.audio.play('click'), job.onFits()) }, z('lh.fits'))));
  };
  setJob(o.job ?? null);

  const handle: CardHandle = {
    root,
    row: (key) => root.querySelector(`.row[data-row="${key}"]`),
    expand,
    tappable(fn) {
      tapFn = fn;
      root.querySelectorAll('.row').forEach((r) => r.classList.toggle('tap', !!fn));
    },
    mark(key, cls) {
      const r = root.querySelector(`.row[data-row="${key}"]`);
      r?.classList.add(cls);
      r?.scrollIntoView({ block: 'nearest' });
    },
    say(text, tone = null) {
      sayEl.textContent = text;
      sayEl.className = `say${tone ? ` ${tone}` : ''}`;
    },
    setJob,
    jointsOn,
  };
  void chipLabel;
  return handle;
}
