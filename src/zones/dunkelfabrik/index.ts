/**
 * Zone 05 · Dunkelfabrik (ARBEITEN · STATION 7) — GDD §7.5, adapted by DECISIONS.md.
 *
 *  A „Schicht"      carry 18-kg crates at 41 °C at the fictional Station 7 (felt strain): the cargo
 *                   for the first flight; when M5 turns bereit the pallet rolls onto the deck lift
 *  B „Schichtplan"  one wall, three decisions: the year, a robot on an empty post, „Rechnet sich
 *                   das?“ on the payback beam (optional for ★). A side station in Entdecker mode (D40)
 *  C „Licht aus" ◆  six dials (autonomy level per gesture), the lights-out lever, a measured night shift
 *  Plan §4.6. Entscheider: A is off the route, the objective starts at C.
 *
 * Debug hooks (__academy.solve('dunkelfabrik', …)): solve-a, solve-b, solve-c, album,
 *   carry, lever, lights-on, roster-2030, op-roster, op-waage, op-leitstand, take-rti, state.
 */
import * as THREE from 'three';
import { defineZone, type EmiHandle, type Stars, type Text, type ZoneContext } from '@/core/zones';
import manifest from './manifest';
import { STRINGS } from './strings';
import { buildHall, FURNACE, GALLERY, LEITSTAND, LIFT as LIFT_AT, STAIR } from './hall';
import { buildLine } from './line';
import { createSound } from './sound';
import { buildSchicht } from './schicht';
import { buildRoster } from './roster';
import { buildWaage } from './waage';
import { buildNacht } from './nacht';
import { buildBoards } from './boards';
import { GESTURES, TRUE_LEVEL, clockOf, noPersonCount, rosterAt, type NightResult } from './sim';
import { CARGO, ROSTER } from './tuning';

/** interior ambient with the lights out (was 0.02: a black screen, QA-01) */
const NIGHT_AMBIENT = 0.07;

export default defineZone({
  ...manifest,

  async create(ctx: ZoneContext) {
    ctx.i18n.register(STRINGS);
    await loadFonts();
    const albumText = ctx.progress.get<{ de: string; en: string } | null>('albumText', null);
    ctx.pass.registerAlbum({ id: 'ueberschaetzte-geste', title: ctx.i18n.text('album.title'), text: albumText ?? ctx.i18n.text('album.text'), hint: ctx.i18n.text('album.hint') });

    const gName = (k: number): string => ctx.t(`gesture.${GESTURES[k]}`);
    const hall = buildHall(ctx);
    const sound = createSound(ctx, new THREE.Vector3(FURNACE.x1 + 0.5, 1.4, FURNACE.mouthZ));
    ctx.onDispose(() => sound.dispose());
    const line = buildLine(ctx, hall, gName);
    const boards = buildBoards(ctx);
    const emi: EmiHandle = ctx.emi.spawn({ unit: 'EMI-06', position: [4, 0, 12], yawDeg: 0 });
    const schicht = buildSchicht(ctx, line, sound, emi);
    const say = (key: string, params?: Record<string, string | number>): void => void emi.say(ctx.i18n.text(key, params));
    const waage = buildWaage(ctx, sound);
    const roster = buildRoster(ctx, sound, (k) => say(k), waage);
    const nacht = buildNacht(ctx, hall, line, sound, emi);
    line.onScan = () => sound.clack();
    line.onClack = () => sound.clack();
    // conveyor rumble (engine loop, positional at the middle of the belt)
    ctx.audio.loop('conveyor', { at: [-3.5, 0.9, -8], volume: 0.45 });

    // ── interior lighting: ambient 0.25 by day, 0.02 with the lights out ──
    let dark = false;
    let darkLevel = 0;
    let exitInterior: (() => void) | null = null;
    const applyInterior = (): void => {
      exitInterior?.();
      exitInterior = null;
      if (!hall.playerInside) return;
      // ambient 0.25 by day → 0.07 with the lights out, stepping down relay by relay; the machines'
      // own light (LED edges, guide dots, fill, task lights) carries the image (QA-01)
      const amb = 0.25 - (0.25 - NIGHT_AMBIENT) * darkLevel;
      exitInterior = ctx.env.enterInterior(darkLevel > 0.99 ? { ambient: amb, background: '#07090a', fog: { color: '#07090a', density: 0.004 } } : { ambient: amb });
    };
    let emiInside = false;
    hall.onInside(() => {
      applyInterior();
      if (hall.playerInside && !emiInside) {
        emiInside = true;
        void (async () => {
          await emi.driveTo([1.5, 0, 9]);
          await emi.driveTo([0.6, 0, 3]);
          await emi.driveTo([6.8, 0, -1.0]);
          emi.lookAt(null);
        })();
      }
    });
    const setNightKit = (f: number): void => {
      hall.setNight(f);
      line.setNight(f);
    };
    nacht.onDark = (d) => {
      dark = d;
      darkLevel = d ? 1 : 0;
      setNightKit(darkLevel);
      applyInterior();
      roster.setDim(d);
      waage.setDim(d);
    };
    nacht.onDarkLevel = (f) => {
      darkLevel = f;
      setNightKit(f);
      applyInterior();
    };
    nacht.onLightsOutLine = () => say('emi.lightsOut');

    // ── station B as a challenge (FUN-PLAN D2 „Lückenplan 2030“): ★ the stamp; ★★ two robots that
    //    fit and no misfit; ★★★ the edge of the case: one run that pays off (≤ 4 y), one that doesn't ──
    const flagsB = (): { fit2: boolean; pilot: boolean; noPilot: boolean } => ctx.progress.get('starsB', { fit2: false, pilot: false, noPilot: false });
    const chB = ctx.game.challenge({
      id: 'schichtplan',
      title: ctx.i18n.text('game.b.title'),
      goals: [{ text: ctx.i18n.text('game.b.g1') }, { text: ctx.i18n.text('game.b.g2') }, { text: ctx.i18n.text('game.b.g3') }],
      lesson: ctx.i18n.text('game.b.lesson'),
      retry: () => {
        roster.clearRobots();
        roster.operate();
      },
      emi,
    });
    roster.chips = () => chB.chips();
    const starsB = (): Stars => {
      const f = flagsB();
      return (1 + (f.fit2 ? 1 : 0) + (f.fit2 && f.pilot && f.noPilot ? 1 : 0)) as Stars;
    };
    const detailB = (): Text => {
      const f = flagsB();
      return ctx.i18n.text('game.b.detail', { p: roster.passt(), x: roster.misfits, a: ctx.t(f.pilot ? 'game.b.yes' : 'game.b.no'), b: ctx.t(f.noPilot ? 'game.b.yes' : 'game.b.no') });
    };
    const submitB = (force = false): void => {
      if (!ctx.pass.has('schichtplan')) return;
      const s = starsB();
      if (force || s > chB.stars) chB.submit(null, { stars: s, detail: detailB() });
    };
    roster.onVerdict = (fit, at) => {
      if (fit === 'passt') {
        ctx.game.juice.popup(at, ctx.i18n.text('roster.fit.passt'), { tone: 'teal', seconds: ROSTER.verdictS });
        ctx.game.juice.cue('good', { at: [at.x, at.y, at.z] });
      } else if (fit === 'pilot') {
        ctx.game.juice.popup(at, ctx.i18n.text('roster.fit.pilot'), { tone: 'muted', seconds: ROSTER.verdictS });
        ctx.game.juice.cue('tick', { at: [at.x, at.y, at.z] });
      } else {
        ctx.game.juice.popup(at, ctx.i18n.text('roster.fit.nein'), { tone: 'bad', seconds: ROSTER.verdictS });
        ctx.game.juice.cue('oops', { at: [at.x, at.y, at.z] });
      }
    };
    /** ★★: two robots that fit, without a misfit on the way (checked after every roster change) */
    const checkFit2 = (): void => {
      if (roster.passt() >= 2 && roster.misfits === 0 && !flagsB().fit2) {
        ctx.progress.set('starsB', { ...flagsB(), fit2: true });
        submitB();
      }
    };
    waage.onTip = (pb, at) => {
      ctx.game.juice.burst(at, { tone: 'teal', count: ROSTER.tipBurst });
      ctx.game.juice.popup(at, ctx.i18n.text('game.b.year', { y: ctx.i18n.num(pb, 1) }), { tone: 'teal', seconds: ROSTER.tipS });
    };

    // ── station B completion (plan §4.6): year ≥ 2030 and a robot with feedback; the Waage is optional for
    //    ★ (a run updates the stamp's value with its payback) ──
    const postName = (): string => `${ctx.t(`roster.post.${roster.automatedPost}`)} · ${ctx.t(`roster.type.${roster.automatedType}`)}`;
    const checkB = (fromWaage = false): void => {
      checkFit2();
      waage.setPost(postName());
      if (ctx.pass.has('schichtplan') && !fromWaage) return;
      if (roster.year < 2030 || roster.robots.length < 1 || !roster.feedbackShown) {
        refreshObjective();
        return;
      }
      const y = roster.year;
      const n = noPersonCount(rosterAt(y, roster.robots));
      const pb = waage.lastPayback;
      const s = waage.lastShifts;
      const num = (v: number, lang: 'de' | 'en'): string => (lang === 'de' ? v.toFixed(1).replace('.', ',') : v.toFixed(1));
      const sh = (t: Record<string, unknown>): string => (s === 1 ? interp(t, 'waage.sh1') : interp(t, 'waage.shN', { n: s }));
      const de = STRINGS.de,
        en = STRINGS.en!;
      const value = !waage.ranToYear6
        ? { de: interp(de, 'roster.value', { y, n }), en: interp(en, 'roster.value', { y, n }) }
        : pb <= 6
          ? { de: interp(de, 'waage.value', { y, n, p: num(pb, 'de'), sh: sh(de) }), en: interp(en, 'waage.value', { y, n, p: num(pb, 'en'), sh: sh(en) }) }
          : { de: interp(de, 'waage.valueNo', { y, n, sh: sh(de) }), en: interp(en, 'waage.valueNo', { y, n, sh: sh(en) }) };
      const fresh = ctx.pass.award('schichtplan', { value, curve: waage.ranToYear6 ? [1, 2, 3, 4, 5, 6].map((k) => Math.max(0, k / pb)) : undefined });
      if (fresh) {
        say('emi.bDone');
        submitB(true);
        ctx.game.juice.cue('great');
      }
      refreshObjective();
    };
    roster.onChange = () => checkB();
    waage.onDone = (r) => {
      // the edge of the case (★★★): remember one run that pays off within 4 years and one that doesn't
      const f = flagsB();
      const pilot = r.payback <= 4;
      if (!pilot) {
        ctx.game.juice.cue('good');
        ctx.game.juice.popup([-8, 3.4, -0.6], ctx.i18n.text('game.b.noPilot'), { tone: 'muted', seconds: ROSTER.noPilotS });
      }
      if (pilot ? !f.pilot : !f.noPilot) ctx.progress.set('starsB', { ...f, [pilot ? 'pilot' : 'noPilot']: true });
      const had = ctx.pass.has('schichtplan');
      checkB(true);
      if (had) submitB();
    };

    // ── station A end ──────────────────────────────────────────────────────
    schicht.onFinish = (r) => {
      // the first shift gets EMI's own line; later ones get the banner's reactions (best, three stars)
      if (!r.skipped && r.placed >= 3 && schicht.challenge.attempts <= 1) {
        const n = Math.max(r.lifts, r.placed);
        const what = (lang: 'de' | 'en'): string => (lang === 'de' ? (n === 1 ? 'Eine Kiste' : `${n} Kisten`) : n === 1 ? 'One crate' : `${n} crates`);
        const when = (lang: 'de' | 'en'): string => (r.seconds >= 55 ? (lang === 'de' ? 'in einer Minute' : 'in a minute') : lang === 'de' ? `in ${r.seconds} Sekunden` : `in ${r.seconds} seconds`);
        void emi.say((lang, mode) => interp(lang === 'de' ? STRINGS.de : STRINGS.en!, 'emi.aEnd', { what: what(lang), when: when(lang) }, mode));
      }
      refreshObjective();
    };

    // ── station C result ───────────────────────────────────────────────────
    nacht.onResult = (r: NightResult, predicted) => {
      const s = Math.round(r.share * 100);
      const h = Math.round(r.interventionsPerHour);
      const lim = r.limiting;
      const gDe = lim >= 0 ? interp(STRINGS.de, `gesture.${GESTURES[lim]}`) : '';
      const gEn = lim >= 0 ? interp(STRINGS.en!, `gesture.${GESTURES[lim]}`).toLowerCase() : '';
      const m = Math.round(r.mrcMinutes);
      const down = (t: Record<string, unknown>): string => (m > 0 ? interp(t, 'nacht.valueDown', { m }) : '');
      const value =
        lim >= 0
          ? { de: interp(STRINGS.de, 'nacht.value', { s, h, g: gDe }) + down(STRINGS.de), en: interp(STRINGS.en!, 'nacht.value', { s, h, g: gEn }) + down(STRINGS.en!) }
          : { de: interp(STRINGS.de, 'nacht.valueNone', { s, h }) + down(STRINGS.de), en: interp(STRINGS.en!, 'nacht.valueNone', { s, h }) + down(STRINGS.en!) };
      const curve = r.hourly.map((x) => (x.n ? x.k / x.n : 0));
      // the stamp keeps the player's latest honest night: a deliberately overrated run (album hunt)
      // does not overwrite an earlier run at realistic levels
      const honest = r.overrated.length === 0;
      const keepHonest = !honest && ctx.pass.has('lichtaus') && ctx.progress.get('honestNight', false);
      const fresh = keepHonest ? false : ctx.pass.award('lichtaus', { value, curve });
      if (honest) ctx.progress.set('honestNight', true);
      ctx.pass.awardQuestion(7);
      // the night as a result: ★ the night, ★★ honest levels (none above what it can do, ≥ 1 at L3+),
      // ★★★ honest and 0 MRC (FUN-PLAN D3)
      {
        const anyAuto = r.levels.some((l) => l >= 3);
        const starsC = (1 + (honest && anyAuto ? 1 : 0) + (honest && anyAuto && r.mrcs === 0 ? 1 : 0)) as Stars;
        const limG = lim >= 0 ? (ctx.lang === 'de' ? gDe : gEn) : '—';
        nacht.challenge.submit(r.share * 100, { stars: starsC, detail: ctx.i18n.text('game.c.detail', { m: r.mrcs, g: limG }) });
        if (starsC >= 2) {
          ctx.game.juice.cue('great');
          ctx.game.juice.burst([LEITSTAND.x - 1.2, LEITSTAND.y + 1.4, LEITSTAND.z], { tone: 'teal', count: 36 });
        }
      }
      if (predicted != null) ctx.pass.recordPrediction('lichtaus', predicted, r.share * 100, { min: 0, max: 100, scale: 'linear' });
      ctx.pass.setBest('autonomousShare', r.share * 100, 'higher');
      ctx.progress.set('share', r.share);
      waage.setCoverage(Math.max(0.01, r.share), true);
      // hidden album: a gesture set above what it can do
      if (r.overrated.length) {
        const g = r.firstOverratedMrc?.gesture ?? r.overrated[0];
        const t = r.firstOverratedMrc ? clockOf(r.firstOverratedMrc.cycle) : '22:00';
        const gid = GESTURES[g];
        const text = {
          de: interp(STRINGS.de, 'album.textDyn', { g: interp(STRINGS.de, `gesture.${gid}`), l: r.levels[g], what: interp(STRINGS.de, `album.what.${gid}`), t }),
          en: interp(STRINGS.en!, 'album.textDyn', { g: interp(STRINGS.en!, `gesture.${gid}`), l: r.levels[g], what: interp(STRINGS.en!, `album.what.${gid}`), t }),
        };
        ctx.progress.set('albumText', text);
        ctx.pass.registerAlbum({ id: 'ueberschaetzte-geste', title: ctx.i18n.text('album.title'), text, hint: ctx.i18n.text('album.hint') });
        if (ctx.pass.unlockAlbum('ueberschaetzte-geste')) {
          if (gid === 'umreifen') say('emi.album');
          else void emi.say(text);
        }
      } else if (fresh) say('emi.cDone');
      refreshObjective();
    };
    const savedShare = ctx.progress.get<number | null>('share', null);
    if (savedShare != null) waage.setCoverage(savedShare, true);

    // ── objectives (own, while inside the plot) ────────────────────────────
    let inside = false;
    // Station C's desk is up on the gallery: from the hall floor the marker leads to the stair foot
    // first, from the stair on to the desk (the marker alone pointed under the gallery, playtest PT-06)
    let cLeg: 'stair' | 'desk' | null = null;
    const _pl = new THREE.Vector3();
    const legOf = (): 'stair' | 'desk' => (ctx.player.positionLocal(_pl).y > 2.2 ? 'desk' : 'stair');
    const refreshObjective = (): void => {
      // outside the plot the zone shows no objective (a night or a run that ends there must not leave
      // its „läuft“ line behind; onEnter sets it again)
      if (!inside) {
        if (!schicht.running) ctx.hud.setObjective(null);
        return;
      }
      cLeg = null;
      const a = ctx.pass.has('schicht');
      const b = ctx.pass.has('schichtplan');
      const c = ctx.pass.has('lichtaus');
      const goB = (): void => {
        if (roster.year >= 2030 && roster.robots.length > 0) ctx.hud.setObjective(ctx.i18n.text('objective.waage'), { target: [-8, 0, 1.8] });
        else ctx.hud.setObjective(ctx.i18n.text('objective.b'), { target: [-8.5, 0, 2.5] });
      };
      const goC = (): void => {
        cLeg = legOf();
        ctx.hud.setObjective(ctx.i18n.text('objective.c'), { target: cLeg === 'desk' ? [LEITSTAND.x, LEITSTAND.y, LEITSTAND.z] : [STAIR.x0 + 0.4, 0, (STAIR.z0 + STAIR.z1) / 2] });
      };
      if (schicht.running) return;
      void goB;
      // the mode's route (manifest `route`, D40, plan §4.6): Entdecker A → C ◆ with B as a side station that
      // is named („optional“) but never the target; Entscheider C ◆ only (A and B stay playable)
      if (ctx.mode === 'entscheider') {
        if (!c) goC();
        else ctx.hud.setObjective(ctx.i18n.text('objective.doneRoute'));
      } else if (!a) ctx.hud.setObjective(ctx.i18n.text('objective.a'), { target: [4, 0, -7] });
      else if (!c) goC();
      else ctx.hud.setObjective(ctx.i18n.text(b ? 'objective.done' : 'objective.doneSide'));
    };

    // ── help key (H): EMI explains the current station at the mode's depth ──
    emi.onAsk(() => {
      const a = ctx.pass.has('schicht'),
        b = ctx.pass.has('schichtplan'),
        c = ctx.pass.has('lichtaus');
      if (ctx.mode === 'entscheider' && !c) say('emi.ask.c');
      else if (!a) say('emi.ask.a');
      else if (!c) say('emi.ask.c');
      else if (!b) say('emi.ask.b');
      else say('emi.ask.done');
      void emi.gesture('point');
    });

    // ── B in Entdecker mode is a side station (D40): a grey label at its console says so ──
    ctx.hud.worldLabel([-8.5, 1.75, 2.5], ctx.i18n.text('schichtplan.title'), { eyebrow: () => ctx.t(ctx.mode === 'entdecker' ? 'roster.sideEyebrow' : 'roster.eyebrowB'), maxDistance: 12, kind: ctx.mode === 'entdecker' ? 'muted' : 'default' });

    // ── M5 bereit: the shift's crates are the cargo for the first flight — the pallet rolls onto the deck lift
    //    of the Verladebucht and sinks into the hold (WP12's ignition beat, 1,5 s after the banner) ──
    ctx.events.on('island:ignition', (e: { id?: string; phase?: string }) => {
      if (e?.id !== 'M5' || e.phase !== 'start') return;
      line.shipCargo(() => {
        ctx.game.juice.popup([LIFT_AT.x, 2.2, LIFT_AT.z], ctx.i18n.text('cargo.aboard'), { tone: 'teal', seconds: CARGO.aboardS });
        ctx.game.juice.cue('good', { at: [LIFT_AT.x, 1, LIFT_AT.z] });
      });
      if (hall.playerInside) ctx.after(CARGO.lineAfterS, () => say('emi.cargo'));
    });

    // ── Sensorkapsel (FUN-PLAN D4): on the gallery behind the Leitstand, next to the lights-out plaque ──
    ctx.game.collectibles.place({ id: 'dunkelfabrik.kapsel', position: [10.3, GALLERY.y + 0.8, -1.25] });

    // ── language / mode changes ────────────────────────────────────────────
    ctx.i18n.onChange(() => {
      boards.redraw();
      roster.relabel();
      nacht.relabel();
      line.relabel();
      refreshObjective();
    });

    // ── debug hooks ────────────────────────────────────────────────────────
    ctx.debug.register('solve-a', () => {
      schicht.solve(3);
      return ctx.pass.has('schicht');
    });
    ctx.debug.register('stars3-a', () => {
      schicht.solve(10);
      return schicht.challenge.stars;
    });
    ctx.debug.register('solve-b', () => {
      roster.setYear(2030);
      if (!roster.robots.length) roster.place(1 /* Palettieren · Spät */, 'cobot');
      waage.runInstant(2);
      return ctx.pass.has('schichtplan');
    });
    ctx.debug.register('stars3-b', () => {
      roster.clearRobots();
      roster.setYear(2030);
      roster.place(1 /* Palettieren · Spät */, 'cobot');
      roster.place(2 /* Palettieren · Nacht */, 'fest');
      waage.setCoverage(0.44, false);
      waage.runInstant(1); // 24.6 years: kein Pilot
      waage.setCoverage(0.8, false);
      waage.runInstant(1); // 3.8 years: pays off
      return chB.stars;
    });
    ctx.debug.register('solve-c', () => {
      const r = nacht.solve(GESTURES.map((g) => TRUE_LEVEL[g]));
      return report({ share: r.share, perHour: r.interventionsPerHour, mrcMin: r.mrcMinutes, limiting: r.limiting >= 0 ? GESTURES[r.limiting] : null, without: r.without, stamp: ctx.pass.has('lichtaus') });
    });
    ctx.debug.register('stars3-c', () => {
      // honest levels and every RtI taken: the instant solve answers pending RtIs with "taken"
      const r = nacht.solve(GESTURES.map((g) => TRUE_LEVEL[g]));
      return { share: r.share, mrcs: r.mrcs, stars: nacht.challenge.stars };
    });
    ctx.debug.register('album', () => {
      const lv = GESTURES.map((g) => TRUE_LEVEL[g]);
      lv[4] = 4;
      const r = nacht.solve(lv);
      return report({ share: r.share, mrcs: r.mrcs, first: r.firstOverratedMrc ? clockOf(r.firstOverratedMrc.cycle) : null });
    });
    ctx.debug.register('budget', () => {
      const count = (o: THREE.Object3D): { calls: number; tris: number; shadow: number } => {
        const r = { calls: 0, tris: 0, shadow: 0 };
        o.traverseVisible((m) => {
          const mesh = m as THREE.Mesh;
          if (!mesh.isMesh) return;
          const g = mesh.geometry;
          const per = (g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)) / 3;
          const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
          r.calls += Array.isArray(mesh.material) ? mesh.material.length : 1;
          r.tris += Math.round(per * inst);
          if (mesh.castShadow) r.shadow++;
        });
        return r;
      };
      const rootOnly = { calls: 0, tris: 0, shadow: 0 };
      for (const c of ctx.root.children) {
        if (c === ctx.groups.detail || c === ctx.groups.exterior || c === ctx.groups.far) continue;
        const k = count(c);
        rootOnly.calls += k.calls;
        rootOnly.tris += k.tris;
        rootOnly.shadow += k.shadow;
      }
      return report({ detail: count(ctx.groups.detail), exterior: count(ctx.groups.exterior), far: count(ctx.groups.far), root: rootOnly });
    });
    ctx.debug.register('carry', () => schicht.debugCarry());
    ctx.debug.register('lever', () => {
      nacht.setLevels(GESTURES.map((g) => TRUE_LEVEL[g]));
      nacht.pullLever(45);
    });
    ctx.debug.register('lights-on', () => nacht.lightsOn());
    ctx.debug.register('dark', () => {
      nacht.setLevels(GESTURES.map((g) => TRUE_LEVEL[g]));
      nacht.debugDark();
    });
    ctx.debug.register('take-rti', () => nacht.take());
    ctx.debug.register('roster-2030', () => roster.setYear(2030));
    ctx.debug.register('op-roster', () => roster.operate());
    ctx.debug.register('op-waage', () => {
      roster.operate();
      roster.setYear(Math.max(2030, roster.year));
    });
    ctx.debug.register('op-leitstand', () => nacht.operate());
    // report hooks return their data: __academy.solve('dunkelfabrik', 'state') resolves with it
    const report = <T,>(o: T): T => o;
    ctx.debug.register('state', () =>
      report({ phase: nacht.phase, levels: [...nacht.levels], year: roster.year, robots: roster.robots.length, waage6: waage.ranToYear6, carrying: schicht.carrying, running: schicht.running, hand: line.hand.count, queued: line.queued(), dark, inside: hall.playerInside, result: nacht.lastResult ? { share: nacht.lastResult.share, perH: nacht.lastResult.interventionsPerHour, mrcMin: nacht.lastResult.mrcMinutes, lim: nacht.lastResult.limiting } : null }),
    );

    // Z1: monolith, lining, fins, roof fans' housings, truss, Verladebucht and the Quelle board in few
    // draws; the fan blades, the slit scanner, the deck lift and the roller shutter stay live
    // (shadows stay exact: the fins must not start receiving the monolith's shadow)
    ctx.mergeStatic(ctx.groups.exterior);

    return {
      onEnter() {
        inside = true;
        refreshObjective();
        if (!ctx.progress.get('greeted', false)) {
          ctx.progress.set('greeted', true);
          void emi.gesture('wave');
          // the zone's request (plan §3.2): the island's need in ≤ 12 words; the crates are the cargo
          say('request');
        }
      },
      onExit() {
        inside = false;
        cLeg = null;
        schicht.abort();
        nacht.abort();
        ctx.hud.setObjective(null);
        ctx.ui.status(null);
      },
      update(dt: number, elapsed: number) {
        if (inside && cLeg && legOf() !== cLeg) refreshObjective();
        hall.update(dt, elapsed);
        line.update(dt, elapsed);
        schicht.update(dt, elapsed);
        roster.update(dt);
        waage.update(dt);
        nacht.update(dt, elapsed);
        sound.update(dt);
      },
      updateFar() {
        hall.updateFar(ctx.time.elapsed);
      },
      dispose() {
        exitInterior?.();
        exitInterior = null;
      },
    };
  },
});

/** resolve a string from a raw table (for pass values stored in both languages) */
function interp(table: Record<string, unknown>, key: string, params: Record<string, string | number> = {}, mode: 'entdecker' | 'entscheider' = 'entdecker'): string {
  let v: unknown = table;
  for (const k of key.split('.')) v = (v as Record<string, unknown> | undefined)?.[k];
  if (v && typeof v === 'object' && 'entdecker' in (v as object)) v = (v as Record<string, string>)[mode];
  const s = typeof v === 'string' ? v : key;
  return s.replace(/\{(\w+)\}/g, (m, n: string) => (n in params ? String(params[n]) : m));
}

/** make sure the brand fonts are ready before the canvas boards are drawn */
async function loadFonts(): Promise<void> {
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts) return;
    await Promise.race([
      Promise.all(['700 40px "Space Grotesk"', '500 20px "Geist Mono"', '600 20px "Geist"', '400 20px "Geist"', '600 20px "Geist Mono"'].map((f) => fonts.load(f))),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* fonts load later; boards redraw on language change */
  }
}
