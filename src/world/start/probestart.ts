/**
 * WP12: the Probestart (plan §1.2 ≈ 27 s, §3.2, §4.1) — the first mechanic, at the rc4 gust column
 * by the Libelle. Hold E on the lever: the cold rotors cough, a puff of slot spray rises at the two
 * southern lobes (M5, M6), the world sinks 0.3 m (the island lifts a hand's breadth), tilts 2.2–2.9°,
 * the Libelle ball rolls out and back and the Haltearme catch the island with a thud. Then the three
 * systems turn red one after the other on the Libelle panel (AUFTRIEB, ENERGIE, NAVIGATION), the crown
 * and the needle light repeat them, and EMI-01 explains. In Entscheider mode the Bodencrew supplies
 * the Startakku and the Flugmodell during EMI-01's second line (§3.3; not a markBeat beat).
 * Repeatable after a 6 s cooldown; it always fails until the island is Startklar, and every later
 * press names the first thing missing. Reduced motion: no tilt, no world sink, no ball roll; the
 * lamps, the bar, the sound and the readout stay. Airborne the lever is rc4's Libelle toy again.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Lang, Text, ZoneContext } from '@/core/zones';
import { LIBELLE, outlineRadius, polar, type Vec3Tuple } from '../layout';
import type { GroundHandle } from '../ground';
import { markStatic, mergeScope } from '../statics';
import { cullTinyText } from '../detail';
import { isReady, ROTORS, type StartDisplay } from './state';
import type { IslandRotors } from './rotors';
import type { Gusts } from './gusts';
import type { StartBeatEvent } from './contract';
import { START, listJoin } from './strings';
import { PROBESTART } from './tuning';

/** the lever column: the rc4 gust column's place, on the far side of the Libelle approach from EMI-01 */
export const LEVER_AT: Vec3Tuple = [-3.3, 0, 22.7];
/** W3 (UX-06): turned a little west of the Allee, so the Libelle's ball and the panel are in view from the stand point */
export const LEVER_YAW = -0.2;
/** where to stand to pull it (the objective target): 1.5 m in front of the column */
export const LEVER_STAND: Vec3Tuple = [LEVER_AT[0] + Math.sin(LEVER_YAW) * 1.5, 0, LEVER_AT[2] + Math.cos(LEVER_YAW) * 1.5];
/** the two southern lobes whose cold rotors cough (M5 Dunkelfabrik 150°, M6 Prüffeld 210°) */
const SOUTH = [4, 5] as const;

export interface Probestart {
  readonly object: THREE.Object3D;
  /** pull the lever (E, or a tool through the debug hook); false while busy or cooling down */
  press(): boolean;
  readonly busy: boolean;
  /** presses so far (this session) */
  readonly count: number;
  /** the readout's current text (tools) */
  readout(): string | null;
}

export interface ProbestartDeps {
  display: StartDisplay;
  rotors: IslandRotors;
  gusts: Gusts;
  ground: () => GroundHandle | null;
  airborne: () => boolean;
  /** EMI-01 speaks one line (by the Libelle when near, else on the radio); resolves when it is done */
  say(line: Text, o?: { interrupt?: boolean }): Promise<void>;
  /** the first Probestart's lines are done (the onboarding hands the Pass over) */
  onFirstDone(): void;
}

export function buildProbestart(ctx: ZoneContext, deps: ProbestartDeps): Probestart {
  const M = ctx.materials;
  const { display } = deps;
  const toy = new THREE.Group();
  toy.name = 'start:probestart';
  toy.position.set(...LEVER_AT);
  toy.rotation.y = LEVER_YAW;
  // the column's static parts merge into the island's shared meshes, kept inside `toy` (the interactable)
  mergeScope(toy);
  // a control column (Flugmaschine kit): warm-grey hull, carbon face, brushed alu head and foot, a teal
  // status line and the start lever with an orange grip (it moves: orange), at eye-friendly 1.45 m
  const hull = M.standard({ color: 0x57524d, roughness: 0.42, metalness: 0.55 });
  const alu = M.standard({ color: 0xc9c4be, roughness: 0.28, metalness: 0.95 });
  const carbon = M.standard({ color: 0x1f1d1c, roughness: 0.55, metalness: 0.3 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.34, 1.4, 0.3, 3, 0.05), hull);
  body.position.y = 0.74;
  body.castShadow = true;
  const face = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.86, 0.03, 2, 0.012), carbon);
  face.position.set(0, 0.8, 0.15);
  const foot = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.06, 0.44, 2, 0.02), alu);
  foot.position.y = 0.03;
  const head = new THREE.Group();
  head.position.set(0, 1.46, 0.02);
  head.rotation.x = 0.32; // tilted toward the player
  const plate = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.08, 0.38, 2, 0.025), alu);
  // the lever: a carbon quadrant with a slot, an alu arm on a pivot, the orange grip
  const quadrant = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.07, 0.3, 2, 0.02), carbon);
  quadrant.position.set(0, 0.07, 0);
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.09, -0.08);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.3, 12).translate(0, 0.15, 0), alu);
  const gripMat = M.standard({ color: 0xff6700, emissive: 0xff6700, emissiveIntensity: 0.55, roughness: 0.38, metalness: 0.1 });
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.08, 4, 12).rotateZ(Math.PI / 2).translate(0, 0.31, 0), gripMat);
  pivot.add(arm, grip);
  const REST = -0.35,
    PULLED = 0.75;
  pivot.rotation.x = REST;
  head.add(plate, quadrant, pivot);
  const ledMat = M.standard({ color: 0x2dd4bf, emissive: 0x2dd4bf, emissiveIntensity: 1.4, roughness: 0.4 });
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.016, 0.01), ledMat);
  led.position.set(0, 1.16, 0.168);
  toy.add(body, face, foot, head, led);
  // the lever moves and the LED's material changes: they stay separate
  for (const m of [body, face, foot, plate, quadrant]) markStatic(m);
  ctx.root.add(toy);
  cullTinyText(ctx, ctx.text3d.create({ text: START.leverPlate, font: 'mono-medium', size: 0.05, color: 0xe7e5e4, anchorX: 'center', anchorY: 'middle', letterSpacing: 0.14, lineHeight: 1.25, textAlign: 'center', position: [0, 1.0, 0.168] }, toy));
  cullTinyText(ctx, ctx.text3d.create({ text: START.leverSub, font: 'mono', size: 0.026, color: 0x8a817a, anchorX: 'center', anchorY: 'middle', letterSpacing: 0.1, position: [0, 0.86, 0.168] }, toy));
  ctx.physics.addStaticFromMesh(body, { shape: 'box', surface: 'metal' });
  // a taller pick volume over the head (invisible, not outlined): the arrival view looks 6° up and
  // keyboard-only players cannot pitch, so the crosshair must find the lever from 1.6–1.8 m
  const pickMat = new THREE.MeshBasicMaterial();
  const pick = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.5), pickMat);
  pick.position.set(0, 1.78, 0.02);
  pick.visible = false;
  pick.userData.noHighlight = true;
  pick.userData.noEnrich = true;
  toy.add(pick);
  ctx.onDispose(() => {
    pick.geometry.dispose();
    pickMat.dispose();
  });
  const readoutAnchor = new THREE.Object3D();
  readoutAnchor.position.set(0, 1.98, 0.08);
  toy.add(readoutAnchor);

  // the lever travel (§1.2 „hold E 1 s“): a heavy 1 s pull down toward the player with a ratchet, held
  // while the island tries, then back. A tap starts the whole pull (keyboard and click players alike).
  const pull = (): void => {
    const t0 = ctx.time.elapsed;
    const P = PROBESTART;
    let ticks = 0;
    const stop = ctx.every(1 / 60, () => {
      const k = ctx.time.elapsed - t0;
      const down = Math.min(1, k / P.pullS);
      const back = k > P.pullS + P.pullHold ? Math.min(1, (k - P.pullS - P.pullHold) / 0.45) : 0;
      const u = down * (1 - back);
      const e = u * u * (3 - 2 * u);
      pivot.rotation.x = REST + (PULLED - REST) * e;
      // the ratchet: five clicks on the way down
      while (ticks < 5 && down >= (ticks + 1) / 5) {
        ticks++;
        ctx.audio.tone({ freq: 1400 + ticks * 90, dur: 0.025, type: 'square', volume: 0.12, at: [LEVER_AT[0], 1.45, LEVER_AT[2]] });
      }
      if (back >= 1) {
        pivot.rotation.x = REST;
        stop();
      }
    });
  };

  let busy = false;
  let ready = 0;
  let count = 0;
  let airCount = 0;
  let readout: ReturnType<ZoneContext['hud']['worldLabel']> | null = null;
  let readoutText: string | null = null;
  let readoutTimer: (() => void) | null = null;
  let readoutLive: (() => void) | null = null;
  const fmt = (lang: Lang, v: number, d: number): string => (lang === 'de' ? v.toFixed(d).replace('.', ',') : v.toFixed(d));
  const setReadout = (t: Text, eyebrow: Text): void => {
    if (!readout) readout = ctx.hud.worldLabel(readoutAnchor, t, { eyebrow, maxDistance: 30, kind: 'accent' });
    else readout.setText(t);
    readoutText = ctx.i18n.resolve(t);
  };
  const clearReadout = (after: number): void => {
    readoutTimer?.();
    readoutTimer = ctx.after(after, () => {
      readoutLive?.();
      readoutLive = null;
      readout?.remove();
      readout = null;
      readoutText = null;
    });
  };
  /** „LAGE {max}° · AUFTRIEB {n}/6 · AKKU {p} % · NAV {AUS | BEREIT | BODENCREW}“ (FIKTION), as the island shows it */
  const stateReadout = (max: number): Text => (lang) => {
    const n = display.liftShown();
    const p = Math.round(display.chargeShown() * 100);
    const nav = isReady(display.shown('NAV')) ? (display.crewShown('NAV') ? (lang === 'de' ? 'BODENCREW' : 'GROUND CREW') : lang === 'de' ? 'BEREIT' : 'READY') : lang === 'de' ? 'AUS' : 'OFF';
    return lang === 'de' ? `LAGE ${fmt(lang, max, 2)}° · AUFTRIEB ${n}/6 · AKKU ${p} % · NAV ${nav}` : `ATTITUDE ${fmt(lang, max, 2)}° · LIFT ${n}/6 · BATTERY ${p} % · NAV ${nav}`;
  };
  const tiltNow = (): number => Math.hypot(ctx.island.tiltDeg.roll, ctx.island.tiltDeg.pitch);

  /** the first thing missing (§3.2), or the clearance lines once Startklar */
  const missingLine = (): Text => {
    const s = display.snap;
    if (s.start.lift < 6) {
      const ids = ROTORS.filter((r) => !isReady(s.systems[r]));
      return (lang) => `${lang === 'de' ? START.missingLift.de : START.missingLift.en} ${listJoin(lang, ids)}.`;
    }
    if (!isReady(s.start.energy.state)) return s.start.energy.charge > 0 ? START.missingAkkuPart : START.missingAkku;
    if (!isReady(s.start.nav.state)) return START.missingNav;
    return s.f3Signed ? START.readyGo : START.readyKiel;
  };

  const lobeTip = (i: number): Vec3Tuple => {
    const b = [270, 330, 30, 90, 150, 210][i];
    return polar(b, outlineRadius(b, true) + 2, -3);
  };

  /** the airborne press: rc4's Libelle toy (the controller catches a player-made gust) */
  const airToy = (): void => {
    airCount++;
    const r = deps.gusts.toy();
    let peak = 0;
    readoutLive?.();
    readoutLive = ctx.every(0.1, () => {
      peak = Math.max(peak, tiltNow());
      const v = Math.max(peak, tiltNow());
      setReadout((lang) => `${lang === 'de' ? 'LAGE' : 'ATTITUDE'} ${fmt(lang, v, 2)}° · ${lang === 'de' ? START.airLive.de : START.airLive.en}`, START.airEyebrow);
    });
    ctx.after(Math.max(0.6, r.seconds) + 0.15, () => {
      readoutLive?.();
      readoutLive = null;
      busy = false;
      setReadout(
        (lang) =>
          lang === 'de'
            ? `LAGE ${fmt(lang, r.max, 2)}° → 0,04° in ${fmt(lang, r.seconds, 1)} s · ${String(Math.round(r.seconds * 1000)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} Korrekturen`
            : `ATTITUDE ${fmt(lang, r.max, 2)}° → 0.04° in ${fmt(lang, r.seconds, 1)} s · ${String(Math.round(r.seconds * 1000)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} corrections`,
        START.airEyebrow,
      );
      clearReadout(8);
      ctx.game.juice.cue('good', { at: [0, 1.5, LIBELLE.center[2]] });
      if (airCount === 3) void deps.say(START.airAgain, { interrupt: true });
    });
  };

  /** the island lifts a hand's breadth (the world sinks), holds and sinks back (§5.3: one setter) */
  const lift = (): void => {
    const P = PROBESTART;
    const t0 = ctx.time.elapsed;
    const total = P.riseS + P.holdS + P.sinkS;
    const stop = ctx.every(1 / 60, () => {
      const k = ctx.time.elapsed - t0;
      let h: number;
      if (k < P.riseS) h = P.lift * smooth(k / P.riseS);
      else if (k < P.riseS + P.holdS) h = P.lift;
      else h = P.lift * (1 - smooth((k - P.riseS - P.holdS) / P.sinkS));
      ctx.island.setAltitude(k >= total ? 0 : h);
      if (k >= total) stop();
    });
  };

  const press = (): boolean => {
    if (busy || ctx.time.elapsed < ready || ctx.player.operating) return false;
    busy = true;
    count++;
    ready = ctx.time.elapsed + PROBESTART.cooldown + PROBESTART.pullS;
    pull();
    ledMat.emissiveIntensity = 0.15;
    gripMat.emissiveIntensity = 0.1;
    ctx.after(PROBESTART.cooldown + PROBESTART.pullS, () => {
      ledMat.emissiveIntensity = 1.4;
      gripMat.emissiveIntensity = 0.55;
    });
    readoutTimer?.();
    // the lever is down after the pull: then the island tries
    ctx.after(PROBESTART.pullS, run);
    return true;
  };

  const run = (): void => {
    ctx.game.juice.cue('go', { at: [LEVER_AT[0], 1.2, LEVER_AT[2]] });
    if (deps.airborne()) {
      airToy();
      return;
    }
    const P = PROBESTART;
    const rm = ctx.settings.reducedMotion;
    const first = !display.snap.probestart;
    const crewSupply = first && ctx.mode === 'entscheider';
    if (first) {
      display.reveal(0);
      if (crewSupply) display.hideCrew(['AKKU', 'NAV']);
    }
    // the cold rotors cough (the southern pair; on the first press always)
    const cough = SOUTH.filter((i) => first || !isReady(display.shown(ROTORS[i])));
    cough.forEach((i, j) => {
      for (let c = 0; c < P.coughs; c++) deps.rotors.cough(i, P.coughAt + c * P.coughGap + j * 0.06);
    });
    ctx.after(P.sprayAt, () => {
      for (const i of SOUTH) deps.ground()?.spray.emit('burst', lobeTip(i), P.sprayStrength);
    });
    // lift, tilt, ball (the tilt and the ball are no-ops under reduced motion; the world does not sink)
    let r: { max: number; seconds: number } = { max: P.tiltMin, seconds: 1.6 };
    let peak = 0;
    ctx.after(P.riseAt, () => {
      r = deps.gusts.toy({ bearing: 180 + (Math.random() - 0.5) * 60 });
      if (!rm) lift();
    });
    ctx.after(P.riseAt + P.riseS + P.holdS + P.sinkS, () => {
      // the Haltearme catch the island
      deps.ground()?.catchGust(0.7);
      ctx.audio.play('thud', { volume: 0.8, pitch: 0.7, at: [0, -2, LIBELLE.center[2]] });
      if (!rm) ctx.player.shake(0.05, 0.25);
    });
    readoutLive?.();
    readoutLive = ctx.every(0.1, () => {
      peak = Math.max(peak, tiltNow());
      const v = Math.max(peak, tiltNow());
      setReadout((lang) => `${lang === 'de' ? 'LAGE' : 'ATTITUDE'} ${fmt(lang, v, 2)}° · ${lang === 'de' ? START.readoutLive.de : START.readoutLive.en}`, START.readoutEyebrow);
    });
    const settleAt = P.riseAt + Math.max(r.seconds, P.riseS + P.holdS + P.sinkS) + 0.2;
    const showState = (): void => {
      readoutLive?.();
      readoutLive = null;
      const max = rm ? r.max : Math.max(peak, r.max * 0.98);
      const paint = (): void => setReadout(stateReadout(Math.round(max * 100) / 100), START.readoutEyebrow);
      paint();
      // the readout follows the panel (the Bodencrew fill) while it shows
      const off = display.onChange(paint);
      readoutTimer?.();
      readoutTimer = ctx.after(P.readoutHold + (crewSupply ? 8 : 0), () => {
        off();
        readout?.remove();
        readout = null;
        readoutText = null;
      });
    };
    ctx.after(Math.max(settleAt, first ? P.redAt + P.redGap * 2 + 0.2 : 0), showState);

    if (first) {
      // the three systems turn red one after the other: six rotor lamps, the Startakku bar, the nav lamp
      ctx.after(P.redAt, () => {
        ctx.quest.markProbestart();
        display.refresh();
        for (let k = 1; k <= 6; k++)
          ctx.after((k - 1) * P.lampGap, () => {
            display.reveal(k);
            ctx.audio.tone({ freq: 392 - k * 12, dur: 0.07, type: 'square', volume: 0.16, at: [0, 1.4, LIBELLE.center[2] + 3] });
          });
        ctx.after(P.redGap, () => {
          display.reveal(7);
          ctx.audio.tone({ freq: 262, to: 247, dur: 0.18, type: 'triangle', volume: 0.3, at: [0, 1.4, LIBELLE.center[2] + 3] });
        });
        ctx.after(P.redGap * 2, () => {
          display.reveal('all');
          ctx.audio.tone({ freq: 220, to: 196, dur: 0.26, type: 'triangle', volume: 0.32, at: [0, 1.4, LIBELLE.center[2] + 3] });
          ctx.events.emit('island:beat', { id: 'probestart' } satisfies StartBeatEvent);
        });
      });
      ctx.after(P.lineAt, () => void firstLines(crewSupply));
    } else {
      ctx.after(Math.max(settleAt, P.lineAt - 0.8), () => {
        busy = false;
        void deps.say(missingLine(), { interrupt: true });
      });
    }
  };

  /** EMI-01 after the first Probestart (§1.2 ≈ 32 s); in Entscheider mode the Bodencrew supply runs during line 2 */
  const firstLines = async (crewSupply: boolean): Promise<void> => {
    await deps.say(START.first1, { interrupt: true });
    if (crewSupply) {
      const supply = runCrewSupply();
      await deps.say(START.first2Crew);
      await supply;
    } else await deps.say(START.first2);
    // the third line plays while the Pass is handed over (its lines queue behind it): the objective moves on now
    void deps.say(START.first3);
    busy = false;
    deps.onFirstDone();
  };

  /** the Bodencrew supplies AKKU and NAV: the bar fills segment by segment (≤ 3 s), then the nav lamp turns teal */
  const runCrewSupply = (): Promise<void> =>
    new Promise((resolve) => {
      const P = PROBESTART;
      const at: Vec3Tuple = [0, 1.4, LIBELLE.center[2] + 3];
      display.hideCrew(['NAV']);
      display.holdCharge(0);
      for (let k = 1; k <= 10; k++)
        ctx.after(k * P.crewSegmentS, () => {
          display.holdCharge(k / 10);
          ctx.audio.tone({ freq: 330 * Math.pow(2, k / 12), dur: 0.06, type: 'sine', volume: 0.22, at });
        });
      ctx.after(10 * P.crewSegmentS + 0.35, () => {
        display.holdCharge(null);
        display.hideCrew([]);
        ctx.audio.tone({ freq: 659, to: 988, dur: 0.32, type: 'sine', volume: 0.35, at });
        ctx.events.emit('island:beat', { id: 'crew' } satisfies StartBeatEvent);
        resolve();
      });
    });

  const label = (lang: Lang): string => {
    if (ctx.time.elapsed < ready || busy) return lang === 'de' ? START.leverWait.de : START.leverWait.en;
    if (deps.airborne()) return lang === 'de' ? START.leverAir.de : START.leverAir.en;
    const s = display.snap;
    if (s.armed) return lang === 'de' ? START.leverAusguck.de : START.leverAusguck.en;
    if (s.start.startklar) return lang === 'de' ? START.leverKiel.de : START.leverKiel.en;
    return lang === 'de' ? START.lever.de : START.lever.en;
  };
  ctx.addInteractable({
    // the whole column, not only the lever: aiming at the body works too (playtest PT-14)
    object: toy,
    label,
    range: 2.6,
    isEnabled: () => !busy,
    onInteract: () => void press(),
  });

  return {
    object: toy,
    press,
    get busy() {
      return busy;
    },
    get count() {
      return count;
    },
    readout: () => readoutText,
  };
}

function smooth(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
}
