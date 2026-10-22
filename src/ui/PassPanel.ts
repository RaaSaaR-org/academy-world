import type { I18n } from '@/i18n/I18n';
import type { Progress } from '@/systems/Progress';
import type { AudioSystem } from '@/systems/Audio';
import type { Text } from '@/core/types';
import type { AreaManifest } from '@/core/zones/manifest';
import type { QuestSnapshot } from '@/core/quest/types';
import type { LegacyData } from '@/systems/migrate';
import { RETIRED_TITLES } from '@/systems/retired';
import { RECAMAN, recamanArcs } from '@/core/brand/logo3d';
import { drawGlyph } from '@/world/glyphs';
import { h, keepFocus } from './dom';
import type { ModalManager } from './Modals';
import { formatValue, starsSvg } from './ResultUi';
import { ensureStyle } from './Kit';

export interface PassZoneInfo {
  id: string;
  name: Text;
  eyebrow: Text | null;
  number: number | null;
  glyph?: string | null;
}

/** What the Pass reads from the game layer (stars, bests, why cards, skills, capsules). */
export interface PassGame {
  summary(): { earnedStamps: number; stars: number; maxStars: number; capsules: number; capsulesTotal: number };
  challenge(key: string): { goals: Text[]; metric: { unit?: string; digits?: number } | null; hasWhy: boolean } | null;
  openWhy(key: string): boolean;
  skills(): { id: string; zoneId: string; unlocked: boolean }[];
  /** the Funk-Log: the last radio lines, oldest first */
  radioLog?(): { speaker: Text; text: Text }[];
  // ── Phase 7 (WP1, plan §4.1) ──
  /** the quest spine: the three systems of the cover (D23), the star pool line */
  quest?(): QuestSnapshot;
  /** every area manifest (the „Revier & Hangar“ section reads the sites and halls before their code loads) */
  areas?(): readonly AreaManifest[];
  /** what the migration archived (rc4 stamps of retired stations, old records of re-goaled ones) */
  legacy?(): LegacyData | null;
  /** the secrets: found ids, every registered one (title, hint), and the card of a found one */
  finds?(): { found: string[]; list: { id: string; title: Text; hint: Text }[]; openCard(id: string): void };
}

const PASS_CSS = `
.pass .startklar { margin-top: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; }
.pass .startklar .sk-h { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text); }
.pass .startklar .sys { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; color: var(--text-2); }
.pass .startklar .sys i { width: 9px; height: 9px; border-radius: 50%; background: #3f3a36; flex: none; }
.pass .startklar .sys.red i { background: #F87171; }
.pass .startklar .sys.amber i { background: #FBBF24; }
.pass .startklar .sys.teal i, .pass .startklar .sys.crew i { background: #2DD4BF; }
.pass .startklar .sys.halo i { box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.25); }
.pass .startklar .sys.on { color: var(--text); }
.pass .startklar .sys .crew-tag { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; color: var(--text-2); border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; }
.pass h3.sec { margin: 18px 0 2px; font-family: var(--font-display); font-weight: 700; font-size: 17px; letter-spacing: -0.01em; color: var(--text); display: flex; justify-content: space-between; align-items: baseline; }
.pass h3.sec small { font-family: var(--font-mono); font-weight: 500; font-size: 11.5px; letter-spacing: 0.08em; color: var(--text-2); }
.pass .archive { margin-top: 10px; font-size: 12.5px; color: var(--text-2); }
.pass .stamp .rc4 { font-family: var(--font-mono); font-size: 11px; color: var(--text-2); margin-top: 3px; }
.pass .stamp.master { border-style: solid; border-color: rgba(45, 212, 191, 0.35); }
.pass .finds { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.pass .find { padding: 9px 10px; border-radius: var(--r-md); background: var(--surface); border: 1px dashed var(--border); font-size: 13px; color: var(--text-2); text-align: left; }
.pass .find.got { border: 1px solid rgba(45, 212, 191, 0.4); color: var(--text); cursor: pointer; font: inherit; font-size: 13px; }
.pass .find .h { display: block; font-size: 12px; color: var(--text-2); margin-top: 3px; line-height: 1.35; }
`;

/**
 * Academy Pass (Tab) — GDD §8.1: cover with the Recamán mark (ring + 17 arcs fade in with
 * stamps 1…18, opacity only), Prognose-Güte, per-zone pages with the player's own measured
 * values (Kennlinie statt Etikett), question cards and the failure-mode album.
 */
export class PassPanel {
  private close: (() => void) | null = null;
  private tab: 'stamps' | 'questions' | 'album' | 'log' = 'stamps';

  constructor(
    private modals: ModalManager,
    private i18n: I18n,
    private progress: Progress,
    private audio: AudioSystem,
    private zones: () => PassZoneInfo[],
    private game: () => PassGame | null = () => null,
  ) {}

  get isOpen(): boolean {
    return !!this.close;
  }

  toggle(): void {
    if (this.close) this.close();
    else this.open();
  }

  open(): void {
    if (this.close) return;
    const card = h('div', { class: 'modal pass hairline', role: 'dialog', 'aria-label': this.i18n.t('core.pass.title') });
    const render = (): void => keepFocus(card, () => card.replaceChildren(...this.build(render)));
    const unsub = this.i18n.onChange(render);
    render();
    this.audio.play('open');
    const openedAt = performance.now();
    this.close = this.modals.open('pass', card, {
      onClose: () => {
        unsub();
        this.close = null;
        this.audio.play('close');
      },
      onKey: (code) => {
        // C5: Tab moves between the Pass's controls (the trap in ModalManager); it closes the Pass only
        // when the focus is not on one of them (e.g. after a click on its background)
        const a = document.activeElement;
        if (code === 'Tab' && a instanceof HTMLElement && a !== card && card.contains(a) && a.matches('button, input, select, textarea, [href]')) return false;
        if (code === 'Tab' || code === 'KeyE') {
          // QA-19: the E (or Tab) that opened the Pass, double-tapped, must not close it again
          if (performance.now() - openedAt > 450) this.close?.();
          return true;
        }
        return false;
      },
    });
  }

  private build(rerender: () => void): HTMLElement[] {
    ensureStyle('wp1-pass', PASS_CSS);
    const t = (k: string, p?: Record<string, string | number>): string => this.i18n.t(k, p);
    const P = this.progress;
    const G = this.game();
    // plan §3.4: the cover, „n von 18“ and the tower count the island stamps only (scope 'island')
    const island = this.islandFilter(G);
    const defs = [...P.stampDefs.values()].filter((d) => (!d.zoneId.startsWith('_') || P.hasStamp(d.id)) && island(d.zoneId));
    const earned = defs.filter((d) => P.hasStamp(d.id)).length;
    const total = defs.length;
    const guete = P.prognoseGuete();
    const qTotal = P.questionDefs.size;
    const aTotal = P.albumDefs.size;
    const sum = G?.summary() ?? null;
    const q = G?.quest?.() ?? null;

    // the cover mark counts EARNED (non-skipped) stamps — the same rule as the tower sculpture
    const cover = h('div', { class: 'cover', html: passMark(sum ? sum.earnedStamps : P.earnedStamps()) });
    const stats = h(
      'div',
      { class: 'stats' },
      stat(t('core.pass.tabStamps'), `${earned}/${total || 18}`),
      // the star line (§3.1, D21): every star of the game against the pool from the manifests, and the H2 gate
      q ? stat(t('core.game.pass.stars'), t('core.pass.starsPool', { n: q.mastery.stars, pool: q.mastery.pool, need: q.mastery.need })) : sum ? stat(t('core.game.pass.stars'), `★ ${sum.stars}/${sum.maxStars}`) : null,
      sum && sum.capsulesTotal ? stat(t('core.game.pass.capsules'), `${sum.capsules}/${sum.capsulesTotal}`) : null,
      stat(t('core.pass.prognose'), guete == null ? '—' : `${this.i18n.num(guete)} %`),
      qTotal ? stat(t('core.pass.tabQuestions'), `${P.questions().length}/${qTotal}`) : null,
      aTotal ? stat(t('core.pass.tabAlbum'), `${P.album().length}/${aTotal}`) : null,
    );
    const header = h(
      'header',
      null,
      cover,
      h(
        'div',
        { class: 'head' },
        h('div', { class: 'eyebrow' }, t('core.pass.eyebrow')),
        h('h2', null, t('core.pass.title')),
        h('div', { class: 'modeline' }, h('span', { class: 'tag orange' }, t(`core.modes.${P.mode}.name`)), h('span', { class: 'mono' }, t('core.pass.progress', { n: earned, total: total || 18 }))),
        stats,
        q ? this.startklarRow(q) : null,
        G ? this.skillsRow(G) : null,
      ),
    );
    const tabBtn = (id: 'stamps' | 'questions' | 'album' | 'log', label: string): HTMLElement =>
      h(
        'button',
        {
          class: this.tab === id ? 'on' : '',
          onclick: () => {
            this.tab = id;
            this.audio.play('click');
            rerender();
          },
        },
        label,
      );
    const tabs = h(
      'div',
      { class: 'tabs' },
      tabBtn('stamps', t('core.pass.tabStamps')),
      tabBtn('questions', t('core.pass.tabQuestions')),
      tabBtn('album', t('core.pass.tabAlbum')),
      G?.radioLog ? tabBtn('log', t('core.pass.tabLog')) : null,
    );

    const out: HTMLElement[] = [h('button', { class: 'x', onclick: () => this.close?.() }, '✕'), header, tabs];
    if (this.tab === 'stamps') out.push(...this.stampsTab(G));
    else if (this.tab === 'questions') out.push(...this.questionsTab());
    else if (this.tab === 'log') out.push(...this.logTab(G));
    else out.push(...this.albumTab());
    out.push(h('div', { class: 'eyebrow muted', style: 'margin-top:16px' }, t('core.pass.hint')));
    return out;
  }

  /** 'island' scope (§3.4): areas of kind 'lobe' (and code-only dev zones); without the manifests every zone. */
  private islandFilter(G: PassGame | null): (zoneId: string) => boolean {
    const areas = G?.areas?.();
    if (!areas) return () => true;
    const kind = new Map(areas.map((a) => [a.id, a.kind]));
    return (zoneId) => (kind.get(zoneId) ?? 'lobe') === 'lobe';
  }

  /** The cover's „Startklar“ (D23, §4.1): AUFTRIEB n/6 · ENERGIE p % · NAVIGATION aus | an, the lamp colours of §3.3. */
  private startklarRow(q: QuestSnapshot): HTMLElement {
    const t = (k: string, p?: Record<string, string | number>): string => this.i18n.t(`core.pass.${k}`, p);
    // dark before the Probestart, then red → amber → teal (teal with a halo when geprüft); crew-teal never has a halo
    const tone = (state: string, by: string | null): string =>
      by === 'crew' ? 'crew on' : state === 'geprueft' ? 'teal halo on' : state === 'bereit' ? 'teal on' : state === 'arbeit' ? 'amber' : q.probestart ? 'red' : '';
    const lift = q.start.lift;
    const liftTone = lift >= 6 ? 'teal on' : lift > 0 ? 'amber' : Object.values(q.systems).some((s) => s === 'arbeit') ? 'amber' : q.probestart ? 'red' : '';
    const e = q.start.energy;
    const n = q.start.nav;
    const sys = (cls: string, label: string, crew = false): HTMLElement => h('span', { class: `sys ${cls}` }, h('i'), label, crew ? h('span', { class: 'crew-tag' }, t('crewTag')) : null);
    const both = e.by === 'crew' && n.by === 'crew';
    return h(
      'div',
      { class: 'startklar', role: 'group', 'aria-label': t('startklar') },
      h('span', { class: 'sk-h' }, `// ${t('startklar')}`),
      sys(liftTone, t('lift', { n: lift })),
      ...(both
        ? [sys('crew on', t('crewBoth'), true)]
        : [
            sys(tone(e.state, e.by), e.by === 'crew' ? t('energyCrew') : t('energy', { p: Math.round(e.charge * 100) }), e.by === 'crew'),
            sys(tone(n.state, n.by), n.by === 'crew' ? t('navCrew') : n.state === 'bereit' || n.state === 'geprueft' ? t('navOn') : t('navOff'), n.by === 'crew'),
          ]),
    );
  }

  private stampsTab(G: PassGame | null = this.game()): HTMLElement[] {
    const P = this.progress;
    const t = (k: string, p?: Record<string, string | number>): string => this.i18n.t(k, p);
    const island = this.islandFilter(G);
    const all = [...P.stampDefs.values()];
    const defs = all.filter((d) => island(d.zoneId));
    const areas = G?.areas?.() ?? [];
    const sites = areas.filter((a) => a.kind !== 'lobe');
    if (!defs.length && !sites.length) return [h('div', { class: 'empty' }, t('core.pass.empty'))];
    const zoneInfo = new Map(this.zones().map((z) => [z.id, z]));
    const byZone = new Map<string, typeof defs>();
    for (const d of defs) byZone.set(d.zoneId, [...(byZone.get(d.zoneId) ?? []), d]);
    const zoneIds = [...byZone.keys()].sort((a, b) => (zoneInfo.get(a)?.number ?? 99) - (zoneInfo.get(b)?.number ?? 99) || a.localeCompare(b));
    const legacy = G?.legacy?.() ?? null;
    const out: HTMLElement[] = [];
    const islandEarned = defs.filter((d) => P.hasStamp(d.id)).length;
    if (sites.length) out.push(h('h3', { class: 'sec' }, h('span', null, t('core.pass.sectionIsland')), h('small', null, `${islandEarned}/${defs.length || 18}`)));
    for (const zoneId of zoneIds) {
      const list = byZone.get(zoneId)!.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const info = zoneInfo.get(zoneId);
      const n = list.filter((d) => P.hasStamp(d.id)).length;
      const grid = h('div', { class: 'stamps' });
      for (const d of list) grid.appendChild(this.stampTile(d.id, d.title, !!d.star, d.description ?? null, legacy));
      const name = info ? this.i18n.resolve(info.name) : zoneId;
      const eyebrow = info?.eyebrow ? this.i18n.resolve(info.eyebrow).replace(/^\/\/\s*/, '') : '';
      out.push(h('section', null, h('h4', null, h('span', null, eyebrow ? `${eyebrow} · ${name}` : name), h('span', null, `${n}/${list.length}`)), grid));
    }
    // §3.5 rule 3: one line for the archived rc4 stamps of retired stations
    const archived = Object.keys(legacy?.stamps ?? {});
    if (archived.length) out.push(h('p', { class: 'archive' }, t('core.pass.archive', { list: archived.map((id) => this.i18n.resolve(RETIRED_TITLES[id] ?? { de: prettifyId(id), en: prettifyId(id) })).join(', ') })));
    // „Revier & Hangar“: the sites and halls, from their manifests (their code may not have loaded yet)
    if (sites.length) {
      const order = ['sonnenacker', 'traumhangar', 'schauhalle', 'kreislaufhof', 'unkrautacker'];
      const sorted = [...sites].sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99) || a.id.localeCompare(b.id));
      const counted = sorted.flatMap((a) => a.stations.filter((st) => st.mastery !== false).map((st) => `${a.id}.${st.id}`));
      const got = counted.filter((k) => P.stampRecord(k) && !P.stampRecord(k)!.skipped).length;
      out.push(h('h3', { class: 'sec' }, h('span', null, t('core.pass.sectionRevier')), h('small', null, `${got}/${counted.length}`)));
      const q = G?.quest?.() ?? null;
      for (const a of sorted) {
        const grid = h('div', { class: 'stamps' });
        for (const st of a.stations) {
          const key = `${a.id}.${st.id}`;
          const def = P.stampDefs.get(key);
          const tile = this.stampTile(key, def?.title ?? st.title ?? prettifyId(st.id), !!st.star, null, legacy);
          // the H2 Meisterprüfung (D21): optional, never in the pool; its gate is the star line
          if (st.mastery === false) {
            tile.classList.add('master');
            if (q) tile.appendChild(h('div', { class: 'v mono' }, q.mastery.h2Earned ? t('core.pass.h2Earned') : q.mastery.open ? t('core.pass.h2Open') : t('core.pass.h2Gate', { need: q.mastery.need })));
          }
          grid.appendChild(tile);
        }
        const n = a.stations.filter((st) => P.hasStamp(`${a.id}.${st.id}`)).length;
        const name = this.i18n.resolve(a.title);
        out.push(h('section', null, h('h4', null, h('span', null, name), h('span', null, `${n}/${a.stations.length}`)), grid));
      }
    }
    // „Funde“ (R9 §5.1): hidden until the first find; they never count for stars
    const F = G?.finds?.();
    if (F && F.found.length) {
      const grid = h('div', { class: 'finds' });
      const lift = G?.quest?.().flight.liftoffSeen ?? false;
      for (const sdef of F.list) {
        const ok = F.found.includes(sdef.id);
        grid.appendChild(
          ok
            ? h('button', { class: 'find got', onclick: () => (this.audio.play('click'), F.openCard(sdef.id)) }, this.i18n.resolve(sdef.title))
            : h('div', { class: 'find' }, '?', P.mode === 'entdecker' && lift ? h('span', { class: 'h' }, this.i18n.resolve(sdef.hint)) : null),
        );
      }
      out.push(h('h3', { class: 'sec' }, h('span', null, t('core.pass.sectionFinds')), h('small', null, `${F.found.length}/${Math.max(F.list.length, F.found.length)}`)), grid);
    }
    return out;
  }

  /** One stamp tile: title (◆), the measured value, the curve, the challenge (★, best, next goal, Warum?), an archived rc4 rating. */
  private stampTile(id: string, title: Text, star: boolean, description: Text | null, legacy: LegacyData | null): HTMLElement {
    const P = this.progress;
    const t = (k: string, p?: Record<string, string | number>): string => this.i18n.t(k, p);
    const d = { id, title, star, description };
    const rec = P.stampRecord(d.id);
    const got = !!rec && !rec.skipped;
    const valueText = rec ? (rec.skipped ? t('core.pass.skipped') : rec.value ? this.i18n.resolve(rec.value) : '✓') : t('core.pass.open');
    const ch = this.game()?.challenge(d.id) ?? null;
    const cr = P.challengeRecord(d.id);
    const stars = cr?.stars ?? 0;
    // the challenge: ★☆☆, best value + attempts, the next goal, Warum?
    let game: HTMLElement | null = null;
    if (ch) {
      const tg = (k: string, p?: Record<string, string | number>): string => this.i18n.t(`core.game.pass.${k}`, p);
      const meta: string[] = [];
      if (cr?.best != null && ch.metric) meta.push(tg('best', { v: formatValue(this.i18n, cr.best, ch.metric.unit, ch.metric.digits) }));
      if (cr?.attempts) meta.push(cr.attempts === 1 ? tg('attempt1') : tg('attempts', { n: cr.attempts }));
      const next = stars < 3 ? tg('next', { goal: this.i18n.resolve(ch.goals[stars]) }) : tg('all');
      game = h(
        'div',
        { class: 'g' },
        h('div', { class: 'g-row' }, h('span', { html: starsSvg(stars, 13) }), meta.length ? h('span', { class: 'g-meta mono' }, meta.join(' · ')) : null),
        h('div', { class: `g-next${stars >= 3 ? ' done' : ''}` }, next),
        ch.hasWhy
          ? h(
              'button',
              {
                class: 'btn ghost g-why',
                onclick: () => {
                  this.audio.play('click');
                  this.game()?.openWhy(d.id);
                },
              },
              tg('why'),
            )
          : null,
      );
    }
    // §3.5 rule 4: a station with new goals shows its archived rc4 rating once more („rc4: ★★“)
    const old = legacy?.challenges?.[d.id];
    const rc4 = old && (old.stars ?? 0) > stars ? h('div', { class: 'rc4' }, t('core.pass.rc4Stars', { stars: '★'.repeat(old.stars) })) : null;
    return h(
      'div',
      { class: `stamp${got ? ' got' : ''}${rec?.skipped ? ' skipped' : ''}${stars >= 3 ? ' s3' : ''}`, title: d.description ? this.i18n.resolve(d.description) : '' },
      h('div', { class: 't' }, ...titleWithMarker(this.i18n.resolve(d.title), d.star ? h('span', { class: 'star', title: t('core.pass.star') }, '\u00a0◆') : null)),
      h('div', { class: 'v mono' }, valueText),
      rec?.curve && rec.curve.length > 1 ? h('div', { class: 'curve', html: sparkline(rec.curve) }) : null,
      game,
      rc4,
    );
  }

  /** „EMI-01 hat gelernt": six zone glyphs, lit once the zone has an earned stamp. */
  private skillsRow(G: PassGame): HTMLElement {
    const zones = new Map(this.zones().map((z) => [z.id, z]));
    const row = h('div', { class: 'skills' }, h('span', { class: 'k' }, this.i18n.t('core.game.skills.title')));
    for (const s of G.skills()) {
      const c = h('canvas', { width: 44, height: 44, class: s.unlocked ? 'on' : '' });
      const g = c.getContext('2d');
      const glyph = zones.get(s.zoneId)?.glyph;
      if (g && glyph) drawGlyph(g, glyph, 22, 22, 13, s.unlocked ? '#2DD4BF' : '#57534e', 2.4);
      row.appendChild(h('span', { class: `sk${s.unlocked ? ' on' : ''}`, title: this.i18n.t(`core.game.skills.${s.id}`) }, c, h('small', null, this.i18n.t(`core.game.skills.${s.id}`))));
    }
    return row;
  }

  private questionsTab(): HTMLElement[] {
    const P = this.progress;
    const t = (k: string): string => this.i18n.t(k);
    const nums = [...P.questionDefs.keys()].sort((a, b) => a - b);
    const have = new Set(P.questions());
    const ids = nums.length ? nums : [...have].sort((a, b) => a - b);
    if (!ids.length) return [h('div', { class: 'empty' }, t('core.pass.questionsHint'))];
    const list = h('div', { class: 'qlist' });
    for (const n of ids) {
      const def = P.questionDefs.get(n);
      const ok = have.has(n);
      const text = def ? this.i18n.resolve(def.text) : `#${n}`;
      list.appendChild(
        h(
          'div',
          { class: `q${ok ? ' got' : ''}` },
          h('span', { class: 'n mono' }, String(n).padStart(2, '0')),
          h('div', { class: 'qt' }, ok ? text : t('core.pass.unknown'), ok && def?.why ? h('div', { class: 'why' }, this.i18n.resolve(def.why)) : null),
          ok ? h('button', { class: 'btn ghost', style: 'padding:5px 10px;font-size:12px', onclick: (e: Event) => copyText(text, e.currentTarget as HTMLElement, t('core.pass.copied')) }, t('core.pass.copy')) : null,
        ),
      );
    }
    const out = [h('p', { class: 'hintline' }, t('core.pass.questionsHint')), list];
    if (ids.every((n) => have.has(n))) {
      const all = ids.map((n) => `${n}. ${this.i18n.resolve(P.questionDefs.get(n)?.text ?? `#${n}`)}`).join('\n');
      out.push(h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn primary', onclick: (e: Event) => copyText(all, e.currentTarget as HTMLElement, t('core.pass.copied')) }, t('core.pass.copyAll'))));
    }
    return out;
  }

  /** Funk-Log: the last radio lines, newest first, so a line missed behind a panel can be read again. */
  private logTab(G: PassGame | null): HTMLElement[] {
    const t = (k: string): string => this.i18n.t(k);
    const lines = G?.radioLog?.() ?? [];
    if (!lines.length) return [h('div', { class: 'empty' }, t('core.pass.logEmpty'))];
    const list = h('div', { class: 'radiolog' });
    for (const l of [...lines].reverse()) list.appendChild(h('div', { class: 'rl' }, h('div', { class: 'eyebrow teal' }, this.i18n.resolve(l.speaker)), h('div', { class: 'rt' }, this.i18n.resolve(l.text))));
    return [h('p', { class: 'hintline' }, t('core.pass.logHint')), list];
  }

  private albumTab(): HTMLElement[] {
    const P = this.progress;
    const t = (k: string): string => this.i18n.t(k);
    const defs = [...P.albumDefs.values()];
    if (!defs.length) return [h('div', { class: 'empty' }, t('core.pass.albumHint'))];
    const have = new Set(P.album());
    const grid = h('div', { class: 'album' });
    for (const d of defs) {
      const ok = have.has(d.id);
      const zoneDone = [...P.stampDefs.values()].filter((s) => s.zoneId === d.zoneId).every((s) => P.hasStamp(s.id));
      grid.appendChild(
        h(
          'div',
          { class: `entry${ok ? ' got' : ''}` },
          h('div', { class: 'eyebrow muted' }, d.zoneId),
          h('div', { class: 't' }, ok ? this.i18n.resolve(d.title) : '?'),
          h('div', { class: 'd' }, ok ? this.i18n.resolve(d.text) : P.mode === 'entdecker' && zoneDone && d.hint ? this.i18n.resolve(d.hint) : t('core.pass.unknown')),
        ),
      );
    }
    return [h('p', { class: 'hintline' }, t('core.pass.albumHint')), grid];
  }
}

function stat(k: string, v: string): HTMLElement {
  return h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));
}

/** Recamán mark where the ring (stamp 1) and arcs k = 1…17 (stamps 2…18) fade in (opacity only). */
export function passMark(stamps: number, size = 132): string {
  const op = (on: boolean): string => (on ? '1' : '0.2');
  let paths = '';
  for (const a of recamanArcs()) {
    const yStart = -375 + 30 * RECAMAN[a.k - 1];
    const yEnd = -375 + 30 * RECAMAN[a.k];
    const up = yEnd > yStart;
    const sweep = (a.side === 1) === up ? 0 : 1;
    paths += `<path d="M 400 ${400 - yStart} A ${a.r} ${a.r} 0 0 ${sweep} 400 ${400 - yEnd}" opacity="${op(stamps >= a.k + 1)}"/>`;
  }
  const ring = `<circle cx="400" cy="400" r="375" opacity="${op(stamps >= 1)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="${size}" height="${size}" role="img" aria-label="EmAI Academy Pass"><circle cx="400" cy="400" r="400" fill="#141414"/><g fill="none" stroke="#FF6700" stroke-width="12">${ring}${paths}</g></svg>`;
}

function sparkline(values: number[]): string {
  const w = 120,
    hh = 26;
  const min = Math.min(...values),
    max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(hh - 2 - ((v - min) / span) * (hh - 4)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}"><polyline points="${pts}" fill="none" stroke="#F5F5F4" stroke-width="1.4"/></svg>`;
}

/** 'greifwerkstatt.griffe' → 'Griffe' (titles of stations without a manifest entry) */
function prettifyId(id: string): string {
  const last = id.split('.').pop() ?? id;
  return last.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function copyText(text: string, btn: HTMLElement, done: string): void {
  try {
    void navigator.clipboard?.writeText(text);
    btn.textContent = done;
  } catch {
    /* clipboard unavailable */
  }
}

/** QA-23: the ◆ marker stays on the line of the title's last word */
function titleWithMarker(title: string, marker: HTMLElement | null): (string | HTMLElement)[] {
  if (!marker) return [title];
  const i = title.lastIndexOf(' ');
  const head = i >= 0 ? title.slice(0, i + 1) : '';
  const last = i >= 0 ? title.slice(i + 1) : title;
  return [head, h('span', { style: 'white-space:nowrap' }, last, marker)];
}
