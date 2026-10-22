/**
 * Traumhangar / Dream Hangar (plan §4.8, R3 §5; owner WP10). In the Werft east of the dock (D36): real
 * two-legged Unitree robots in charging docks — R1 → G1 → H1-2 → H2 — dream before they act. Teal ghosts
 * show the next seconds (chip TRAUM), then reality runs in orange. „Erst träumen, dann messen, dann
 * handeln.“
 *
 *   A  Erster Schritt im Kopf (R1)  — trust the dream only on floor it knows (stationA.ts)
 *   B  Wie weit vorausträumen? (G1) — the horizon: dead end at 0,5 s, fantasy at 8 s (stationB.ts)
 *   C ◆ Traumdaten (H1-2)           — dream data: filter, offline vs closed loop, the Stillstand trap; the
 *                                     best closed-loop mix becomes the island's Flugmodell (NAV, D23) + T2
 *   H2 Generalprobe (mastery, D21)  — the datasheet beats the dream (generalprobe.ts); before the gate the
 *                                     Traum-Probefahrt drives it only as a ghost
 *
 * No EMI body (budget): EMI-01 talks on the radio; H answers through 'emi:ask'. Events out:
 * 'traumhangar:delivered' { robot } (WP11: R1, G1, H1-2 to the Schauhalle, once each),
 * 'traumhangar:flugmodell' { mix, pp, lo, hi, n } (the installed Flugmodell, for the checklist and WP13).
 * Debug hooks (window.__academy.solve('traumhangar', …)): solve-a/b/c/4, stars3-a/b/c/4, state, …; tool
 * hooks __academy.ext('view:traumhangar-ghost'), ext('sequence:traum-glitch'), ext('traumhangar').
 */
import * as THREE from 'three';
import { defineZone, type Text, type ZoneContext, type ZoneInstance } from '@/core/zones';
import { registerDebugExt } from '@/core/DebugApi';
import manifest from './manifest';
import { STRINGS } from './strings';
import { buildHall } from './hall';
import { createRoster } from './roster';
import { createPilot } from './pilot';
import { Ghosts } from './ghosts';
import { createHangarSound } from './sound';
import { buildStationA } from './stationA';
import { buildStationB } from './stationB';
import { buildStationC } from './stationC';
import { buildGeneralprobe } from './generalprobe';
import { buildLobby } from './lobby';
import { buildEgg } from './egg';
import { bakeClips, recordClips } from './dreamwall';
import { gainPp } from './model';
import { C as CT, DOCKS, HALL, JUICE, ROBOT_ID, ROSTER, type RosterKey } from './tuning';
import type { Hangar } from './shared';

export default defineZone({
  ...manifest,
  // just inside the open doors (z 16), facing the docks: a site spawns inside its plot (frames-check, as the
  // Sonnenacker and the Revier scenes do; Integrate, wave 2: [0, 0, 20] stood 4 m outside the hall)
  spawn: { position: [1.5, 0, 13.5], yawDeg: 0 },

  create(ctx: ZoneContext): ZoneInstance {
    ctx.i18n.register(STRINGS);
    const T = ctx.i18n.text;
    // the album entries of B and C (plan §4.8; B and C unlock them, egg.ts registers egg 12's own):
    // registered here so the Pass counts them (Integrate, wave 2: they were unlocked but never registered)
    ctx.pass.registerAlbum({
      id: 'kiste-weg',
      title: { de: 'Die Kiste ist weg', en: 'The box is gone' },
      text: { de: 'Hinter der Säule hat er die Kiste vergessen. Ein langer Traum verliert, was er nicht sieht.', en: 'Behind the pillar it forgot the box. A long dream loses what it cannot see.' },
      hint: { de: 'Tipp: Träum weit voraus, wenn die Kiste hinter der Säule ist.', en: 'Hint: dream far ahead while the box is behind the pillar.' },
    });
    ctx.pass.registerAlbum({
      id: 'stillstand-gewinnt',
      title: { de: 'Stillstand gewinnt', en: 'Standing still wins' },
      text: { de: 'Wer nichts tut, macht offline keine Fehler. Erst der geschlossene Lauf zeigt, wer ankommt.', en: 'Do nothing and you make no mistakes offline. Only the closed loop shows who gets there.' },
      hint: { de: 'Tipp: Schau, welcher Balken offline gewinnt.', en: 'Hint: look at which bar wins offline.' },
    });
    const hall = buildHall(ctx, T);
    ctx.i18n.onChange(() => hall.redraw());
    const sound = createHangarSound(ctx);
    ctx.onDispose(() => sound.dispose());

    const stamped = (id: string): boolean => ctx.pass.has(id);
    const mastery = (): ReturnType<ZoneContext['quest']['snapshot']>['mastery'] => ctx.quest.snapshot().mastery;
    const roster = createRoster(ctx, {
      // the G1 rises from its crouch with A's ★, the H1-2 with B's; the H2 is a dream ghost until the gate
      initial: (k) => (k === 'g1' && !stamped('erster-schritt') ? 'crouched' : k === 'h12' && !stamped('voraustraeumen') ? 'crouched' : k === 'h2' && !mastery().open ? 'ghost' : 'docked'),
    });
    let eggRef: { dreamed(): void } | null = null;
    const pilot = createPilot(ctx, { onDream: () => eggRef?.dreamed() });
    const ghosts = new Ghosts(ctx, (k) => {
      const r = roster.rig(k);
      return r ? Math.atan2(r.legs[0].fwd.x, r.legs[0].fwd.z) : 0;
    });
    ctx.onDispose(() => ghosts.dispose());

    let attempt = ctx.progress.get('attempt', 0);
    const radio = { de: 'EMI-01 › Funk', en: 'EMI-01 › radio' };
    const H: Hangar = {
      ctx,
      roster,
      pilot,
      ghosts,
      sound,
      T,
      say: (line, now = false) => void ctx.hud.say([{ speaker: radio, text: line }], { interrupt: now }),
      refreshObjective: () => refreshObjective(),
      active: null,
      deliver: (k) => deliver(k),
      seed: () => {
        attempt++;
        ctx.progress.set('attempt', attempt);
        return attempt;
      },
      waitFor: (k) => waitFor(k),
    };

    // ── deliveries to the Schauhalle (WP11 listens): R1 on A ★, G1 on B ★, H1-2 on C ★ — once each ──
    const delivered = new Set<string>(ctx.progress.get<string[]>('delivered', []));
    const deliver = (k: RosterKey): void => {
      // the next robot of the ladder wakes: it rises from its fold in its dock
      const next: RosterKey | null = k === 'r1' ? 'g1' : k === 'g1' ? 'h12' : null;
      if (next && roster.state(next) === 'crouched') {
        roster.setState(next, 'docked');
        sound.wake([DOCKS.x[next], 1, DOCKS.robotZ]);
        ctx.game.juice.burst([DOCKS.x[next], 0.2, DOCKS.robotZ + 0.4], { tone: 'teal', count: 24, spread: 0.8 });
      }
      lights();
      refreshPlates();
      const id = ROBOT_ID[k];
      if (delivered.has(id)) return;
      delivered.add(id);
      ctx.progress.set('delivered', [...delivered]);
      ctx.events.emit('traumhangar:delivered', { robot: id });
    };
    /** the docks' status rings: teal ready, orange piloted, dim asleep, the H2's dark teal ghost */
    const lights = (): void => {
      for (const k of ROSTER) {
        const s = roster.state(k);
        hall.setDockLight(k, H.active && pilot.rig?.key === k ? 'active' : s === 'ghost' ? 'ghost' : s === 'crouched' || !roster.ready(k) ? 'off' : 'ready');
      }
    };
    roster.onReady(() => lights());

    // ── the loading card for a robot that is not in yet (plan §5.8) ────────────────────────────────
    let card: { remove(): void } | null = null;
    const waitFor = (k: RosterKey): boolean => {
      if (roster.ready(k)) return false;
      void roster.request(k);
      card?.remove();
      const id = ROBOT_ID[k];
      card = ctx.game.loadingCard({
        name: T(`robot.${k}`),
        progress: () => ctx.robots.progress(id),
        state: () => (ctx.robots.state(id) === 'failed' ? 'failed' : 'loading'),
        retry: () => ctx.events.emit('robots:retry', { id, area: ctx.id }),
        // §5.8: the ◆'s robot (the H1-2) may hand its system to the Bodencrew after two failed retries
        crew: k === 'h12' ? ctx.game.crewOffer() : null,
      });
      return true;
    };
    roster.onReady(() => {
      card?.remove();
      card = null;
    });

    // ── the stations ───────────────────────────────────────────────────────────────────────────────
    const A = buildStationA(H);
    const Bs = buildStationB(H);
    const Cs = buildStationC(H, { onInstall: (mix) => install(mix) });
    const GP = buildGeneralprobe(H);
    const lobby = buildLobby(H);
    const egg = buildEgg(H);
    eggRef = egg;

    // ── the Flugmodell (D23) and the hangar side of the upload beat (§3.3) ─────────────────────────
    let beamT = -1;
    const install = (mix: string): void => {
      const rows = (Cs.status.rows as { mix: string; k: number; n: number }[] | null) ?? [];
      const full = rows.map((r) => ({ ...r, lanes: [] as boolean[] })) as Parameters<typeof gainPp>[0];
      const gp = rows.length ? gainPp(full, mix as 'geprueft', 'echt') : { pp: 0, lo: 0, hi: 0, n: CT.n };
      const fm = { mix, pp: gp.pp, lo: gp.lo, hi: gp.hi, n: gp.n, at: Date.now() };
      ctx.progress.set('flugmodell', fm);
      ctx.events.emit('traumhangar:flugmodell', fm);
      // the dream tiles fold into one teal line that climbs the roof mast (visible through the doors)
      beamT = 0;
      sound.swell();
    };
    // the beam: the wall's top → up to the eaves → along the roof → up the mast (one line draw)
    const beam = (() => {
      const pts: THREE.Vector3[] = [];
      const a = new THREE.Vector3(CT.wall.x - 0.15, CT.wall.y + CT.wall.h + 0.05, CT.wall.z);
      const eaveY = HALL.eaves + 0.2;
      const b = new THREE.Vector3(a.x + 0.25, eaveY, a.z);
      const roofAt = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, HALL.eaves + (HALL.ridge - HALL.eaves) * (1 - Math.abs(z) / (HALL.d / 2)) + 0.32, z);
      const c = roofAt(hall.mastTo.x, hall.mastTo.z);
      const legs: [THREE.Vector3, THREE.Vector3][] = [
        [a, b],
        [b, roofAt(HALL.w / 2 - 0.4, a.z)],
        [roofAt(HALL.w / 2 - 0.4, a.z), c],
      ];
      for (const [p, q] of legs) for (let i = 0; i < 24; i++) pts.push(p.clone().lerp(q, i / 24));
      pts.push(c);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      geo.setDrawRange(0, 0);
      const mat = new THREE.LineBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.95 });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      line.userData.noMerge = true;
      line.name = 'traum:upload-beam';
      ctx.groups.exterior.add(line);
      ctx.onDispose(() => (geo.dispose(), mat.dispose()));
      return { line, n: pts.length };
    })();
    const updateBeam = (dt: number): void => {
      if (beamT < 0) return;
      beamT += dt;
      const t0 = JUICE.foldS;
      const k = THREE.MathUtils.clamp((beamT - t0 * 0.6) / (JUICE.climbS * 0.6), 0, 1);
      beam.line.visible = k > 0;
      beam.line.geometry.setDrawRange(0, Math.ceil(k * beam.n));
      const m = THREE.MathUtils.clamp((beamT - t0 * 0.6 - JUICE.climbS * 0.5) / (JUICE.climbS * 0.5), 0, 1);
      hall.setMast(m);
      if (m >= 1 && beamT > t0 + JUICE.climbS + 4) {
        beamT = -1;
        beam.line.visible = false;
      }
    };
    // the mast keeps its teal line once the Flugmodell is aboard
    if (stamped('traumdaten')) hall.setMast(1);

    // ── the H2's mastery ring (★★★ R1 · G1 · H1-2 and ★ n/84 · ab 63) and the gate's snap ──────────
    const drawRing = (): void => {
      const m = mastery();
      const cv = hall.ring.canvas;
      const g = cv.getContext('2d')!;
      const W = cv.width;
      g.clearRect(0, 0, W, W);
      const cx = W / 2,
        cy = W / 2;
      const steps = [m.ladder.r1, m.ladder.g1, m.ladder.h12];
      // three arcs (R1, G1, H1-2): teal at ★★★
      for (let i = 0; i < 3; i++) {
        const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / 3 + 0.08,
          a1 = a0 + (2 * Math.PI) / 3 - 0.16;
        g.lineWidth = 22;
        g.strokeStyle = steps[i] >= 3 ? 'rgba(45,212,191,0.95)' : 'rgba(61,61,61,0.9)';
        g.beginPath();
        g.arc(cx, cy, W * 0.42, a0, a1);
        g.stroke();
        g.lineWidth = 22;
        g.strokeStyle = 'rgba(255,103,0,0.85)';
        g.beginPath();
        g.arc(cx, cy, W * 0.42, a0, a0 + ((a1 - a0) * Math.min(3, steps[i])) / 3);
        g.stroke();
      }
      // the star count: an inner arc from 0 to the gate
      const frac = Math.min(1, m.stars / Math.max(1, m.need));
      g.lineWidth = 10;
      g.strokeStyle = 'rgba(61,61,61,0.9)';
      g.beginPath();
      g.arc(cx, cy, W * 0.33, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = m.open ? 'rgba(45,212,191,1)' : 'rgba(251,191,36,0.95)';
      g.beginPath();
      g.arc(cx, cy, W * 0.33, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(245,245,244,0.95)';
      g.textAlign = 'center';
      g.font = '700 30px "Geist Mono", monospace';
      g.fillText('★★★ R1 · G1 · H1-2', cx, cy - 14);
      g.font = '600 30px "Geist Mono", monospace';
      g.fillText(ctx.t('ring.stars', { n: m.stars, pool: m.pool, need: m.need }), cx, cy + 30);
      g.textAlign = 'left';
      hall.ring.texture.needsUpdate = true;
    };
    drawRing();
    let snapped = roster.state('h2') !== 'ghost';
    const snapH2 = (announce: boolean): void => {
      if (snapped) return;
      snapped = true;
      roster.setState('h2', 'docked', { instant: true });
      sound.wake([DOCKS.x.h2, 1.2, DOCKS.robotZ]);
      ctx.game.juice.burst([DOCKS.x.h2, 1.0, DOCKS.robotZ + 0.3], { tone: 'orange', count: 60, spread: 1.2 });
      if (announce) {
        if (ctx.playerInside) H.say(T('emi.h2.free'), true);
        else ctx.events.emit('radio:say', { owner: ctx.id, line: T('emi.h2.free') });
      }
      lights();
      refreshPlates();
    };
    ctx.quest.onChange((s, e) => {
      drawRing();
      if (e.kind === 'mastery-open') snapH2(true);
      if (s.mastery.open && roster.ready('h2') && !snapped) snapH2(false);
    });
    ctx.events.on('stars:changed', () => drawRing());
    roster.onReady((k) => {
      if (k === 'h2' && mastery().open) snapH2(false);
    });

    // ── pilot plates (aim + E): the label says what happens ────────────────────────────────────────
    const plates = {} as Record<RosterKey, { setLabel(t: Text): void }>;
    const plateLabel = (k: RosterKey): Text => {
      const robot = ctx.i18n.resolve(T(`robot.${k}`));
      if (k === 'h2') return mastery().open ? T('h2.plate') : T('plate.probe');
      if (roster.state(k) === 'crouched') return ctx.i18n.text('plate.locked', { robot });
      return ctx.i18n.text('plate.pilot', { robot });
    };
    const refreshPlates = (): void => {
      for (const k of ROSTER) plates[k]?.setLabel(plateLabel(k));
    };
    for (const k of ROSTER) {
      plates[k] = ctx.addInteractable({
        object: hall.plates[k],
        label: plateLabel(k),
        hint: T('plate.hint'),
        range: 3.2,
        onInteract: () => {
          if (k === 'r1') A.start();
          else if (k === 'g1') Bs.start();
          else if (k === 'h12') Cs.start();
          else if (mastery().open) GP.start();
          else if (ctx.pass.has('erster-schritt') || ctx.pass.has('voraustraeumen') || ctx.pass.has('traumdaten')) GP.probe();
          else ctx.hud.toast(T('plate.probeLater'), { kind: 'info' });
        },
      });
    }
    ctx.i18n.onChange(() => refreshPlates());

    // ── objective: the next station in the ladder ──────────────────────────────────────────────────
    const plateAt = (k: RosterKey): [number, number, number] => [DOCKS.x[k] + DOCKS.plateDx, 0, DOCKS.plateZ];
    const refreshObjective = (): void => {
      if (!ctx.playerInside) return;
      const c = Cs.status;
      if (!stamped('erster-schritt')) ctx.hud.setObjective(T('obj.a'), { target: plateAt('r1') });
      else if (!stamped('voraustraeumen')) ctx.hud.setObjective(T('obj.b'), { target: plateAt('g1') });
      else if (!stamped('traumdaten')) {
        const step = c.step as string;
        const at: [number, number, number] = step === 'trial' ? plateAt('h12') : [CT.console[0] - 1.4, 0, CT.console[1]];
        ctx.hud.setObjective(T(step === 'tiles' ? 'obj.c1' : step === 'mix' ? 'obj.c2' : step === 'trial' ? 'obj.c3' : 'obj.c4'), { target: at });
      } else if (mastery().open && !stamped('generalprobe')) ctx.hud.setObjective(T('obj.h2'), { target: plateAt('h2') });
      else if (!mastery().open) ctx.hud.setObjective(T('obj.gate'));
      else ctx.hud.setObjective(T('obj.done'));
    };
    ctx.i18n.onChange(() => refreshObjective());

    // ── H: EMI-01 answers on the radio for the station you are at ──────────────────────────────────
    ctx.events.on('emi:ask', (p: { zone?: string | null } | undefined) => {
      if (p?.zone !== ctx.id) return;
      const k = H.active === 'probe' ? 'h2' : H.active;
      H.say(T(k ? `emi.ask.${k}` : 'emi.ask.none'), true);
    });

    // ── interior light while inside (warm work light, the open doors) ──────────────────────────────
    let exitInterior: (() => void) | null = null;

    // ── debug hooks (playtest, text-audit, traum-check) ───────────────────────────────────────────
    ctx.debug.register('solve-a', () => A.solve(1));
    ctx.debug.register('stars3-a', () => A.solve(3));
    ctx.debug.register('solve-b', () => Bs.solve(1));
    ctx.debug.register('stars3-b', () => Bs.solve(3));
    ctx.debug.register('solve-c', () => Cs.solve(1));
    ctx.debug.register('stars3-c', () => Cs.solve(3));
    // the H2 Generalprobe (station index 3 → the playtest's hook names solve-4 / stars3-4)
    ctx.debug.register('solve-4', () => GP.solve(1));
    ctx.debug.register('stars3-4', () => GP.solve(3));
    ctx.debug.register('a-start', () => A.start());
    ctx.debug.register('b-start', () => Bs.start());
    ctx.debug.register('b-desk', () => Bs.console());
    ctx.debug.register('c-desk', () => Cs.console());
    ctx.debug.register('c-start', () => Cs.start());
    for (let i = 0; i < CT.tiles; i++) ctx.debug.register(`c-tile-${i}`, () => Cs.pick(i));
    ctx.debug.register('h2-start', () => GP.start());
    ctx.debug.register('h2-probe', () => GP.probe());
    ctx.debug.register('h2-script', () => GP.script());
    ctx.debug.register('c-trial-near', () => Cs.trialNear());
    ctx.debug.register('befund', () => void ctx.ui.card(Cs.befund()));
    ctx.debug.register('egg-12', () => egg.solve());
    // the playtest's album pass (after solve-a/b/c): B's and C's entries, then egg 12's find (as the Sonnenacker's 'album')
    ctx.debug.register('album', () => {
      ctx.pass.unlockAlbum('kiste-weg');
      ctx.pass.unlockAlbum('stillstand-gewinnt');
      egg.solve();
    });
    ctx.debug.register('egg-door', () => egg.open());
    ctx.debug.register('state', () => ({ active: H.active, a: A.status, b: Bs.status, c: Cs.status, h2: GP.status, egg: egg.status, robots: Object.fromEntries(ROSTER.map((k) => [k, { ready: roster.ready(k), state: roster.state(k), fold: roster.rig(k)?.fold ?? null, target: roster.rig(k)?.foldTarget ?? null, y: roster.rig(k)?.model.object.position.y ?? null }])), pilot: { active: pilot.active, imagining: pilot.imagining, chase: pilot.chase, robot: pilot.rig?.key ?? null }, delivered: [...delivered], flugmodell: ctx.progress.get('flugmodell', null), mastery: mastery() }));
    // a scripted pilot for the tools: hold W (walk), Space (dream), or let go
    ctx.debug.register('bot-walk', () => pilot.bot(['KeyW']));
    ctx.debug.register('bot-dream', () => pilot.bot(['Space']));
    ctx.debug.register('bot-off', () => pilot.bot(null));
    // the dream wall's clips, recorded live from the H1-2 model (clips.json is this, rounded; traum-check compares)
    ctx.debug.register('clips-bake', async () => {
      const m = await ctx.robots.load(ROBOT_ID.h12, { lod: 2, castShadow: false, priority: 'now' });
      try {
        return bakeClips(recordClips(m));
      } finally {
        m.dispose();
      }
    });
    ctx.debug.register('view-tweak', (v?: { viewUp: number; viewBack: number; viewPitch: number; viewYaw?: number } | null) => pilot.viewTweak(v ?? null));
    ctx.debug.register('pilot-cam', () => ({ p: pilot.cam.position.toArray(), q: pilot.cam.quaternion.toArray(), y: pilot.rig ? pilot.rig.gait.pos.y : null }));
    // camera spots for screenshots (local, yaw 0 = facing the docks)
    ctx.debug.register('tp-docks', () => ctx.player.teleport([0, 0, 2], { yawDeg: 0, pitchDeg: -4 }));
    ctx.debug.register('tp-door', () => ctx.player.teleport([0, 0, 18], { yawDeg: 0, pitchDeg: 2 }));
    ctx.debug.register('tp-a', () => ctx.player.teleport([-10.5, 0, -10], { yawDeg: 180, pitchDeg: -10 }));
    ctx.debug.register('tp-b', () => ctx.player.teleport([-3.5, 0, 0], { yawDeg: 0, pitchDeg: -12 }));
    ctx.debug.register('tp-c', () => ctx.player.teleport([CT.cam.at[0], 0, CT.cam.at[2]], { yawDeg: -90, pitchDeg: 4 }));
    ctx.debug.register('tp-h2', () => ctx.player.teleport([DOCKS.x.h2 + DOCKS.plateDx, 0, DOCKS.plateZ + 2], { yawDeg: 0, pitchDeg: -6 }));
    ctx.onDispose(
      registerDebugExt('view:traumhangar-ghost', async () => {
        // the steady state: all four robots in their docks (no GLB still parsing during the measurement)
        await Promise.all(ROSTER.map((k) => (roster.ready(k) ? null : roster.request(k))));
        // the G1 is awake for the measured view (it rises from its fold with A's stamp)
        if (roster.state('g1') === 'crouched') roster.setState('g1', 'docked', { instant: true });
        return Bs.view();
      }),
    );
    ctx.onDispose(
      registerDebugExt('sequence:traum-glitch', async (o?: { rm?: boolean }) => {
        // flash-check: the glitch tiles of station C in full view, then the upload fold (stills under reduced motion)
        await Cs.glitchSequence(!!o?.rm || ctx.settings.reducedMotion);
      }),
    );
    ctx.onDispose(registerDebugExt('traumhangar', () => ({ a: A.status, b: Bs.status, c: Cs.status, h2: GP.status, egg: egg.status, mastery: mastery(), flugmodell: ctx.progress.get('flugmodell', null), delivered: [...delivered], pilot: { active: pilot.active, chase: pilot.chase, robot: pilot.rig?.key ?? null } })));

    // Z1: the static shell and interior in few draws; robots, ghosts, screens and moving props stay
    // (a tier group may still be hidden while the area builds far away: mergeStatic skips hidden subtrees)
    const moving = (o: THREE.Object3D): boolean => !!o.userData.noMerge;
    for (const g of [ctx.groups.exterior, ctx.groups.detail]) {
      const vis = g.visible;
      g.visible = true;
      ctx.mergeStatic(g, { keep: moving });
      g.visible = vis;
    }

    suspendHook = () => {
      pilot.exit();
      ghosts.hide(true);
    };
    let greeted = ctx.progress.get('greeted', false);
    const _cam = new THREE.Vector3();
    return {
      update(dt) {
        if (ctx.time.frame % 15 === 0) lights();
        roster.update(dt);
        pilot.update(dt);
        A.update(dt);
        Bs.update(dt);
        Cs.update(dt);
        GP.update(dt);
        egg.update(dt);
        lobby.update(dt);
        updateBeam(dt);
        ghosts.update(dt, pilot.active ? _cam.copy(pilot.cam.position) : ctx.toLocal(ctx.player.eye, _cam));
      },
      updateFar(dt) {
        updateBeam(dt);
      },
      onEnter() {
        exitInterior = ctx.env.enterInterior({ ambient: 0.85 });
        refreshObjective();
        refreshPlates();
        drawRing();
        if (!greeted) {
          greeted = true;
          ctx.progress.set('greeted', true);
          // the zone's request (plan §3.2): the island's need in ≤ 12 words
          H.say(T('request'));
        }
      },
      onExit() {
        exitInterior?.();
        exitInterior = null;
        ctx.hud.setObjective(null);
        pilot.exit();
      },
      dispose() {
        suspendHook = null;
        pilot.exit();
      },
    };
  },

  // the ground leaves the dock (h > 1 m): nobody pilots, the dream fades (§5.3 rule 3)
  onSuspend() {
    suspendHook?.();
  },
});

let suspendHook: (() => void) | null = null;
