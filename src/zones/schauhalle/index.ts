/**
 * Schauhalle Nord · a car dealership that sells nothing (plan §4.9, R4 §7–§8; owner WP11).
 *
 *   shop window → reception (the Lastenheft terminal) → robots on turntables → the „new model“ under a
 *   cover at the back. 21 real robots at true scale (17 without the amber exhibits, src/core/release.ts;
 *   ctx.robots, never a look-alike): Vorführung on
 *   approach, Datenblatt stands with price bands and conditions, Inspektion with the LOD governor, the
 *   Größenwand, the Kistenwaage, the compare stage, deliveries by drone, the Tresor with the H2, the
 *   Pannen-Wand and the Fundvitrine, the „Danke“ room, the SELBST BAUEN pylon, and the Entscheider
 *   „Schaufenster“ with three Kurzlauf stands (D41 as amended by D23). One station: Lastenheft ★.
 *
 * EMI has no body here: EMI-01 talks over the radio (plan §4.9). Debug and tool hooks: solve-a, stars3-a
 * (the Lastenheft), stats, plates, inspect:<id>, deliver:<id>, delivery-kick, unveil-h2, fenster-bot;
 * __academy.ext('view:schauhalle' | 'schaufenster' | 'hall' | 'befunde').
 */
import { defineZone, type RobotId, type RobotManifestEntry, type Text, type ZoneContext, type ZoneInstance } from '@/core/zones';
import manifest from './manifest';
import { STRINGS } from './strings';
import { buildShell } from './hall';
import { buildShowroom } from './showroom';
import { HALL_ROBOTS, ROBOT_BY_ID } from './data/robots';
import { buildStands } from './stands';
import { buildInspektion, type Inspektion } from './inspect';
import { sheet, zs } from './sheet';
import { buildFurniture } from './furniture';
import { buildGroessenwand } from './groessenwand';
import { buildKistenwaage } from './kistenwaage';
import { buildTresor } from './tresor';
import { buildDeliveries } from './deliveries';
import { buildLastenheft, solution } from './lastenheft';
import { buildCompare } from './compare';
import { buildVitrine } from './vitrine';
import { buildWerkbank } from './werkbank';
import { buildBefunde, type Befund } from './befund';
import { buildStand, type Stand } from './kurzlauf/stand';
import { belohnung } from './kurzlauf/belohnung';
import { erntetag } from './kurzlauf/erntetag';
import { traumdaten } from './kurzlauf/traumdaten';
import { createHallSound } from './sound';
import { DELIVERY, SCHAUFENSTER } from './tuning';
import { KISTEN, KURZLAUF, RECEPTION, STAGES, WALL } from './layout';
import { el, ensureCss } from './ui';
import { standPose } from './stands';
import { SHOW_AMBER } from '@/core/release';

type FensterStep = 'wall' | 'g1' | 'k1' | 'k2' | 'k3';
const FENSTER: readonly FensterStep[] = ['wall', 'g1', 'k1', 'k2', 'k3'];

export default defineZone({
  ...manifest,
  activeDistance: 70,

  async create(ctx: ZoneContext): Promise<ZoneInstance> {
    ctx.i18n.register(STRINGS);
    ensureCss();
    const T = ctx.i18n.text;
    const L = (): 'de' | 'en' => ctx.i18n.lang;
    const infos = new Map<RobotId, RobotManifestEntry>((await Promise.all(HALL_ROBOTS.map((r) => ctx.robots.info(r.id)))).map((i) => [i.id, i]));

    // ── the building and what stands in it ──────────────────────────────────
    const shell = buildShell(ctx);
    const show = buildShowroom(ctx, shell.mats);
    const stands = buildStands(ctx, infos);
    const furn = buildFurniture(ctx, shell.mats);
    await ctx.yield();
    const wall = buildGroessenwand(ctx);
    const kiste = buildKistenwaage(ctx);
    const sound = createHallSound(ctx);
    const befunde = buildBefunde(ctx);
    ctx.onDispose(() => sound.stop());

    // EMI-01 on the radio (no body in the hall)
    const radio = (line: Text, o: { interrupt?: boolean } = {}): Promise<void> => ctx.hud.say([{ speaker: T('speaker'), text: line }], o);
    let loadingId: RobotId | null = null;
    const deliveries = buildDeliveries(ctx, show, shell, { say: (l) => void radio(l), loading: (id) => (loadingId = id) });
    const tresor = buildTresor(ctx, show, { say: (l) => void radio(l), delivered: () => undefined });
    const vitr = buildVitrine(ctx);
    const werk = buildWerkbank(ctx);
    const compare = buildCompare(ctx, show, infos, () => !!deliveries.busy);
    await ctx.yield();

    // ── Inspektion and the Lastenheft (they share the Datenblatt card) ───────
    const shown = (id: RobotId): boolean => (id === 'unitree-h2' ? tresor.unveiled : !!show.plinth(id)?.shown);
    let insp: Inspektion | null = null;
    const lh = buildLastenheft(ctx, { infos, standing: shown, say: (l) => void radio(l), closeCard: () => insp?.close() });
    const areaName = (id: string): string => {
      const m = ctx.zones.list({ kind: 'all' }).find((z) => z.id === id);
      return m ? (L() === 'en' ? m.name.en : m.name.de) : id;
    };
    const probefahrt = (id: RobotId): void => {
      const r = ROBOT_BY_ID.get(id);
      if (!r?.probefahrt) return;
      ctx.events.emit('map:set-target', { zone: r.probefahrt.area });
      void radio(zs(L(), 'emi.probe', { area: areaName(r.probefahrt.area) }));
      ctx.game.juice.cue('go');
      insp?.close();
    };
    insp = buildInspektion(ctx, {
      show,
      infos,
      state: (id) => (id === 'unitree-h2' ? (tresor.unveiled ? 'shown' : 'covered') : shown(id) ? 'shown' : 'crate'),
      compare: (id) => {
        compare.add(id);
        if (compare.a && compare.b) {
          insp?.close();
          ctx.after(0.45, () => compare.open());
        }
      },
      probefahrt,
      job: (id) => lh.jobFor(id),
      onOpen: (id, card) => {
        lh.attachCard(id, card);
        // the greeting comes with the first datasheet you open (nothing extra to read at the door)
        if (!greeted) {
          greeted = true;
          ctx.progress.set('greeted', true);
          void radio(T('greet'));
        }
        if (id === 'unitree-g1') g1Opened = ctx.time.elapsed;
      },
      onClose: (id) => {
        if (id === 'unitree-g1' && g1Opened !== null && ctx.time.elapsed - g1Opened >= SCHAUFENSTER.datasheetS * 0.5) markFenster('g1');
        g1Opened = null;
      },
    });

    // ── the Schaufenster (Entscheider) and its three Kurzlauf stands ─────────
    const kurz: Record<'belohnung' | 'erntetag' | 'traumdaten', Stand> = {
      belohnung: buildStand(ctx, belohnung(ctx), furn.screens.belohnung, befunde),
      erntetag: buildStand(ctx, erntetag(ctx), furn.screens.erntetag, befunde),
      traumdaten: buildStand(ctx, traumdaten(ctx), furn.screens.traumdaten, befunde),
    };
    const fenster = ctx.progress.get<Partial<Record<FensterStep, boolean>>>('fenster', {});
    let g1Opened: number | null = null;
    const fensterDone = (): boolean => FENSTER.every((s) => fenster[s]);
    const markFenster = (s: FensterStep): void => {
      if (fenster[s]) return;
      fenster[s] = true;
      ctx.progress.set('fenster', { ...fenster });
      ctx.events.emit('schauhalle:schaufenster', { step: s, done: fensterDone() });
      if (fensterDone()) {
        ctx.progress.set('schaufenster', true);
        ctx.events.emit('route:stop', { area: 'schauhalle', done: true });
        if (ctx.mode === 'entscheider') void radio(T('obj.done'));
      }
      refreshObjective();
    };
    ctx.events.on('schauhalle:kurzlauf', (p: { key?: string; done?: boolean } | undefined) => {
      if (!p?.done) return;
      if (p.key === 'belohnung') markFenster('k1');
      if (p.key === 'erntetag') markFenster('k2');
      if (p.key === 'traumdaten') markFenster('k3');
    });
    // the island's objective learns that the stop is done (WP12's onboarding; plan §1.4)
    if (ctx.progress.get<boolean>('schaufenster', false)) ctx.events.emit('route:stop', { area: 'schauhalle', done: true });

    // the Entscheider Befundkarte „Datenblatt“ after a Lastenheft round (R4 §9)
    const datenblattBefund = (k: number): Befund => ({
      id: 'datenblatt',
      title: { de: 'Datenblatt: Jede Zahl hat eine Bedingung', en: 'Datasheet: every number has a condition' },
      measure: { de: 'Die Angabe mit ihrer Bedingung: Nennlast oder Spitze, Haltung, Umgebung.', en: 'The spec with its condition: rated or peak, posture, environment.' },
      limit: { de: 'Prüf den Status vor der Angabe: lieferbar, Pilot oder angekündigt.', en: 'Check the status before the spec: available, pilot or announced.' },
      question: { de: 'Unter welcher Bedingung gilt diese Zahl – und wie oft wurde sie gemessen?', en: 'Under which condition does this number hold, and how often was it measured?' },
      forYou: { de: 'Ein Listenpreis ist nicht die Rechnung: Zubehör, Integration und Betrieb kommen dazu.', en: 'A list price is not the invoice: accessories, integration and operation come on top.' },
      values: [{ label: { de: 'Dein Lastenheft', en: 'Your requirements sheet' }, value: `${k}/3`, chip: 'sim' }],
    });
    let lastK = 0;
    lh.onRoundEnd((k) => {
      lastK = k;
      roundEnded = true;
      refreshObjective();
    });
    const syncBefund = (): void => lh.setBefund(ctx.mode === 'entscheider' ? () => void befunde.open(datenblattBefund(lastK)) : null);
    syncBefund();
    ctx.events.on('mode:changed', syncBefund);

    // ── first visit (Entdecker): wall → crate → one Lastenheft round → the two deliveries ──
    let roundEnded = false;
    let inHallT = 0;
    const firstVisit = !ctx.progress.get<boolean>('visited', false);
    deliveries.setHold(() => ctx.mode === 'entdecker' && firstVisit && !roundEnded && !lh.stamped && inHallT < DELIVERY.firstVisitDelayS);
    wall.onFirstMark(() => {
      void radio(T('wall.emiLine'));
      markFenster('wall');
      refreshObjective();
    });
    kiste.onWarmDone((onFanuc) => {
      void radio(T('kiste.warmDone'));
      // the MiR250 half of the follow-up names an amber exhibit (src/core/release.ts)
      ctx.after(6, () => void radio(T(SHOW_AMBER ? 'kiste.warmMore' : 'kiste.warmMoreH2')));
      ctx.game.juice.cue(onFanuc ? 'great' : 'tick');
      refreshObjective();
    });

    // ── objective inside the hall ───────────────────────────────────────────
    const at = (x: number, z: number): [number, number, number] => [x, 0, z];
    const g1Stand = standPose(ROBOT_BY_ID.get('unitree-g1')!);
    function refreshObjective(): void {
      if (!ctx.playerInside) return;
      const job = lh.job;
      if (job) {
        ctx.hud.setObjective((lang) => zs(lang, 'obj.round', { job: lang === 'en' ? job.text.en : job.text.de }));
        return;
      }
      if (deliveries.busy) {
        ctx.hud.setObjective(T('obj.delivery'), { target: at(STAGES.a[0], STAGES.a[1] + 2) });
        return;
      }
      if (ctx.mode === 'entscheider') {
        const next = FENSTER.find((s) => !fenster[s]);
        if (!next) ctx.hud.setObjective(T('obj.done'));
        else if (next === 'wall') ctx.hud.setObjective(T('obj.wall'), { target: at(WALL.markAt[0], WALL.markAt[1]) });
        else if (next === 'g1') ctx.hud.setObjective(T('obj.g1'), { target: at(g1Stand.x, g1Stand.z) });
        else {
          const key = next === 'k1' ? 'belohnung' : next === 'k2' ? 'erntetag' : 'traumdaten';
          ctx.hud.setObjective(T(`obj.${next}`), { target: at(KURZLAUF[key][0], KURZLAUF[key][1] - 1.4) });
        }
        return;
      }
      if (firstVisit && !wallMarked()) ctx.hud.setObjective(T('obj.wall'), { target: at(WALL.markAt[0], WALL.markAt[1]) });
      else if (firstVisit && !kiste.warm.done) ctx.hud.setObjective(T('obj.crate'), { target: at(KISTEN.rack[0], KISTEN.rack[1]) });
      else if (!lh.stamped && !roundEnded) ctx.hud.setObjective(T('obj.lastenheft'), { target: at(RECEPTION.terminalAt[0] + 1.2, RECEPTION.terminalAt[1]) });
      else if (deliveries.pending().length) ctx.hud.setObjective(T('obj.delivery'), { target: at(STAGES.a[0], STAGES.a[1] + 2) });
      else ctx.hud.setObjective(T('obj.free'));
    }
    const wallMarked = (): boolean => !!fenster.wall;
    for (const ev of ['schauhalle:objective', 'schauhalle:delivery', 'schauhalle:delivered', 'schauhalle:lastenheft', 'mode:changed', 'stamp:awarded']) ctx.events.on(ev, () => ctx.after(0.05, refreshObjective));
    ctx.i18n.onChange(refreshObjective);

    // ── interactables ───────────────────────────────────────────────────────
    for (const s of stands.list) {
      const id = s.robot.id;
      ctx.addInteractable({ object: s.proxy, label: (lang) => `${lang === 'en' ? 'Datasheet' : 'Datenblatt'} · ${sheet(s.robot, lang, infos.get(id) ?? null).name}`, range: 3.4, onInteract: () => insp!.open(id) });
    }
    ctx.addInteractable({ object: furn.terminal, label: T('act.terminal'), range: 3, onInteract: () => lh.openTerminal() });
    ctx.addInteractable({ object: furn.compareConsole, label: T('act.compare'), range: 3, onInteract: () => compare.open() });
    ctx.addInteractable({ object: furn.pannen, label: T('act.pannen'), range: 3.5, onInteract: () => vitr.openPannen() });
    ctx.addInteractable({ object: furn.vitrine, label: T('act.vitrine'), range: 3.5, onInteract: () => vitr.openVitrine() });
    ctx.addInteractable({ object: furn.dankeWall, label: T('act.credits'), range: 3.5, onInteract: () => werk.openCredits() });
    ctx.addInteractable({
      object: furn.plaque,
      label: T('act.plaque'),
      range: 3,
      onInteract: () =>
        void ctx.ui.card({ eyebrow: '// SCHAUHALLE', title: T('sign.sub'), body: [T('plaque'), T('disclaimer')], closeLabel: { de: 'Schließen', en: 'Close' } }),
    });
    ctx.addInteractable({
      object: furn.bauen,
      label: T('act.bauen'),
      range: 3,
      onInteract: () =>
        ctx.player.enterOperate({
          cameraPose: { position: [9.2, 1.7, -5.6], lookAt: [11.4, 0.9, -8.2] },
          title: T('bauen.title'),
          panel: (host) => {
            const z = (k: string): string => zs(L(), k);
            host.replaceChildren(
              el(
                'div',
                { class: 'sh' },
                el('div', { class: 'eyebrow' }, `// ${z('bauen.title')}`),
                el('div', { class: 'line' }, z('bauen.panel'), ' ', ctx.ui.chip('quelle')),
                el('div', { class: 'line' }, z('bauen.door')),
                el('div', { class: 'btns' }, el('button', { class: 'btn small ghost', onclick: () => werk.openCredits() }, z('danke.credits'))),
              ),
            );
          },
          panelPosition: 'right',
        }),
    });
    for (const key of ['belohnung', 'erntetag', 'traumdaten'] as const) {
      const title = key === 'belohnung' ? { de: 'Belohnung', en: 'Reward' } : key === 'erntetag' ? { de: 'Erntetag', en: 'Harvest day' } : { de: 'Traumdaten', en: 'Dream data' };
      ctx.addInteractable({ object: furn.kurzlauf[key], label: (lang) => zs(lang, 'act.kurzlauf', { title: lang === 'en' ? title.en : title.de }), range: 3.2, onInteract: () => kurz[key].open() });
    }

    // ── EMI-01: the request on the first entry, the greeting a little later, H for help ──
    let greeted = ctx.progress.get<boolean>('greeted', false);
    ctx.events.on('emi:ask', (p: { zone?: string | null } | undefined) => {
      if (p?.zone !== 'schauhalle') return;
      void radio(lh.job ? T('emi.askLh') : T('emi.ask'), { interrupt: true });
    });
    // H at the island's Probefahrt lines etc.: robots retry through the loading card
    ctx.events.on('robots:retry', (p: { area?: string } | undefined) => {
      if (!p?.area || p.area === 'schauhalle') show.retry();
    });

    // ── the loading card while a robot streams in (the crate is the placeholder, §5.8) ──
    let card: ReturnType<ZoneContext['game']['loadingCard']> | null = null;
    let cardT = 0;
    const syncCard = (): void => {
      const l = loadingId ? { id: loadingId, name: ROBOT_BY_ID.get(loadingId)?.short ?? loadingId } : show.loadingNow();
      const failed = show.failed();
      const id = l?.id ?? failed[0] ?? null;
      if (!id || !ctx.playerInside) {
        card?.remove();
        card = null;
        return;
      }
      const name = ROBOT_BY_ID.get(id)?.short ?? id;
      const spec = {
        name: (lang: 'de' | 'en') => `${name} · ${lang === 'en' ? 'delivery' : 'Lieferung'}`,
        progress: () => ctx.robots.progress(id),
        state: () => (failed.includes(id) ? ('failed' as const) : ('loading' as const)),
        retry: () => show.retry(),
      };
      if (!card) card = ctx.game.loadingCard(spec);
      else card.update(spec);
    };

    // ── debug and tool hooks ────────────────────────────────────────────────
    const solveRound = async (stars3: boolean): Promise<unknown> => {
      if (insp?.current) insp.close();
      if (!lh.round) lh.startRound();
      const round = lh.round!;
      for (let guard = 0; lh.round === round && lh.job && guard < 6; guard++) {
        const j = lh.job;
        const sol = solution(j);
        lh.answer(sol.pick, stars3 || guard < 3 ? sol.row : null);
      }
      return { stamped: lh.stamped, stars: lh.challenge.stars };
    };
    ctx.debug.register('solve-a', () => solveRound(false));
    // B: the hall's two hands-on bits — the „Du“ mark at the Größenwand, then the crate on each load point
    ctx.debug.register('solve-b', async () => {
      if (insp?.current) insp.close();
      ctx.player.teleport([WALL.markAt[0] + 0.05, 0, WALL.markAt[1]], { yawDeg: 0, pitchDeg: 4 });
      await new Promise<void>((r) => ctx.after(1.2, r));
      const onMark = wall.onMark;
      for (const [post, kg] of [['fanuc-r2000ic-165f', 18], ['anymal-d', 5], ['ur5e', 2]] as const) {
        kiste.place(post, kg);
        await new Promise<void>((r) => ctx.after(1.6, r));
      }
      return { onMark, loads: { ...kiste.loads }, warm: kiste.warm.done };
    });
    // C: the compare stage with two quadrupeds (the Go2 and the Spot; the ANYmal D without the amber
    // exhibits) and its side-by-side view
    ctx.debug.register('solve-c', async () => {
      if (insp?.current) insp.close();
      compare.clear();
      compare.add('unitree-go2');
      compare.add(SHOW_AMBER ? 'spot' : 'anymal-d');
      ctx.player.teleport([STAGES.console[0], 0, STAGES.console[1] + 1.4], { yawDeg: 0 });
      await new Promise<void>((r) => ctx.after(0.6, r));
      compare.open();
      return { a: compare.a, b: compare.b };
    });
    ctx.debug.register('stars3-a', async () => {
      // ★★★ needs the trick job in the round: deal until it is there
      for (let k = 0; k < 6; k++) {
        if (lh.round) break;
        lh.startRound();
        const dealt = lh.round as { jobs: { trick?: boolean }[] } | null;
        if (dealt?.jobs.some((j) => j.trick)) break;
      }
      return solveRound(true);
    });
    ctx.debug.register('stats', () => show.stats());
    ctx.debug.register('plates', () => stands.plates());
    ctx.debug.register('delivery-kick', () => deliveries.kick());
    ctx.debug.register('unveil-h2', () => tresor.unveil(true));
    ctx.debug.register('lineup', async () => ({ wall: await wall.lineupReady, show: await show.lineupReady, slices: show.slices.size }));
    for (const r of HALL_ROBOTS) {
      ctx.debug.register(`inspect:${r.id}`, () => insp!.open(r.id));
      if (r.arrival.kind !== 'bestand' && r.arrival.kind !== 'h2') ctx.debug.register(`deliver:${r.id}`, () => deliveries.force(r.id));
    }
    const fensterBot = async (): Promise<{ seconds: number; befunde: string[]; steps: Record<string, number> }> => {
      const t0 = performance.now();
      const steps: Record<string, number> = {};
      const mark = (k: string, t: number): void => void (steps[k] = +((performance.now() - t) / 1000).toFixed(1));
      const wait = (s: number): Promise<void> => new Promise((r) => ctx.after(s, r));
      // 1 the Größenwand: walk onto the mark, look along the row
      let t = performance.now();
      ctx.player.teleport([WALL.markAt[0] + 0.05, 0, WALL.markAt[1]], { yawDeg: 0, pitchDeg: 4 });
      await wait(SCHAUFENSTER.wallS);
      markFenster('wall');
      mark('wall', t);
      // 2 the G1 datasheet with its payload condition and price band
      t = performance.now();
      insp!.open('unitree-g1');
      await wait(SCHAUFENSTER.datasheetS);
      insp!.close();
      markFenster('g1');
      mark('g1', t);
      // 3 the three Kurzlauf stands, at a person's pace
      for (const key of ['belohnung', 'erntetag', 'traumdaten'] as const) {
        t = performance.now();
        const [x, z] = KURZLAUF[key];
        ctx.player.teleport([x, 0, z - 1.6], { yawDeg: 180 });
        await wait(0.8);
        await kurz[key].runAll();
        mark(key, t);
      }
      return { seconds: +((performance.now() - t0) / 1000).toFixed(1), befunde: [...befunde.set], steps };
    };
    ctx.debug.register('fenster-bot', () => fensterBot());
    type Ext = (name: string, fn: (...a: never[]) => unknown) => (() => void) | undefined;
    const ext = (window as unknown as { __academy?: { ext?: Ext } }).__academy?.ext;
    const exts: ((() => void) | undefined)[] = [];
    exts.push(
      ext?.('view:schauhalle', async () => {
        // the south door, looking north along the aisle; the governor's set loaded (the measured state, §5.5)
        ctx.player.teleport([0, 0, 10], { yawDeg: 0, pitchDeg: -2 });
        for (let k = 0; k < 40; k++) {
          await new Promise<void>((r) => ctx.after(0.25, r));
          const st = show.stats();
          if (st.models >= Math.min(10, HALL_ROBOTS.length - 1) && !show.loadingNow()) break;
        }
        await new Promise<void>((r) => ctx.after(0.6, r));
        return () => undefined;
      }),
    );
    exts.push(ext?.('schaufenster', () => fensterBot()));
    exts.push(ext?.('befunde', () => ({ set: [...befunde.set] })));
    exts.push(
      ext?.('hall', (cmd?: string, a?: RobotId, b?: RobotId) => {
        if (cmd === 'plates') return stands.plates();
        if (cmd === 'compare' && a && b) {
          // hall-check: the compare stage with any two robots, opened
          if (insp?.current) insp.close();
          compare.clear();
          compare.add(a);
          compare.add(b);
          compare.open();
          return { a: compare.a, b: compare.b };
        }
        if (cmd === 'show') return show.stats();
        if (cmd === 'deliveries') return { played: deliveries.played, unboxed: [...deliveries.unboxed], pending: deliveries.pending(), busy: deliveries.busy };
        if (cmd === 'kiste') return { loads: kiste.loads, warm: kiste.warm };
        if (cmd === 'vitrine') return vitr.stats();
        if (cmd === 'fenster') return { ...fenster, done: fensterDone() };
        if (cmd === 'lastenheft') return { round: lh.round ? { i: lh.round.i, jobs: lh.round.jobs.map((j) => j.id), answers: lh.round.answers } : null, stamped: lh.stamped, stars: lh.challenge.stars };
        return { robots: HALL_ROBOTS.length, amber: SHOW_AMBER, shown: HALL_ROBOTS.filter((r) => shown(r.id)).map((r) => r.id), unveiled: tresor.unveiled, compare: { a: compare.a, b: compare.b } };
      }),
    );
    ctx.onDispose(() => exts.forEach((u) => typeof u === 'function' && u()));

    let objT = 0;
    return {
      update(dt) {
        shell.update(dt);
        show.update(dt);
        wall.update(dt);
        kiste.update(dt);
        tresor.update(dt);
        deliveries.update(dt);
        vitr.update(dt);
        werk.update(dt);
        for (const k of Object.values(kurz)) k.update(dt);
        const inside = ctx.playerInside;
        if (inside) inHallT += dt;
        sound.update(dt, inside);
        const playing = show.stats().playing > 0;
        sound.servo(playing, playing ? (show.spots.find((s) => s.playing)?.holder ?? null) : null);
        objT += dt;
        if (objT > 1) {
          objT = 0;
          refreshObjective();
        }
        cardT += dt;
        if (cardT > 0.5) {
          cardT = 0;
          syncCard();
        }
      },
      updateFar(dt) {
        shell.updateFar();
        show.updateFar(dt);
      },
      onEnter() {
        if (!ctx.progress.get<boolean>('visited', false)) {
          ctx.progress.set('visited', true);
          // the zone's request (plan §3.2): EMI-01 over the radio, the island's need in ≤ 12 words
          void radio(T('request'));
        }
        refreshObjective();
      },
      onExit() {
        ctx.hud.setObjective(null);
        card?.remove();
        card = null;
        inHallT = 0;
      },
      dispose() {
        sound.stop();
      },
    };
  },
});
