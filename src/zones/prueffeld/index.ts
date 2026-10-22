/**
 * Zone 06 „Prüffeld“ — MESSEN · Mobile Messzelle (GDD §7.6, DECISIONS D1–D5).
 * Showroom versus measuring cell: Hersteller X's glossy demo („100 % ERFOLG“, FIKTION), the nine
 * vendor-question cards, the Rolltor, EmAI's mobile Messzelle measured under load (sign flips to
 * the measured value with its interval), and three auditors who only agree once success is a rule.
 *
 * Stations: A vorfuehrung (Probieren) · B unter-last ◆ → M6 (Verstehen) · C drei-auditoren (Messen; rev 2,
 * „kurz“: six clips; a side station in Entdecker mode, D40). Phase 7 plan §4.7: cards played on a later
 * visit count (A re-evaluates on return), the first n = 200 run hands out #2, the Entscheider gets B's
 * conditions preset, the zone's first EMI line is its request (§3.2).
 * Debug: __academy.solve('prueffeld', 'solve-a' | 'solve-b' | 'solve-c' | 'album' | 'shutter' |
 *        'dock' | 'goto-handle' | 'state' | 'stats').
 */
import * as THREE from 'three';
import { defineZone, type ZoneContext } from '@/core/zones';
import { createSfx } from './audio';
import { buildAudit, type Audit } from './audit';
import { installCine } from './cine';
import { buildEntrance } from './entrance';
import { Painter } from './geom';
import { buildLine, type LineCell } from './line';
import { buildMesszelle, CELL, type Messzelle } from './messzelle';
import { buildShowroom, type Showroom } from './showroom';
import { Shared } from './state';
import manifest from './manifest';
import { STRINGS } from './strings';

let S: Shared | null = null;
let show: Showroom | null = null;
let line: LineCell | null = null;
let cell: Messzelle | null = null;
let audit: Audit | null = null;
let greeted = false;

export default defineZone({
  ...manifest,

  init(ctx) {
    ctx.i18n.register(STRINGS);
    ctx.pass.registerAlbum({
      id: 'bester-von-40',
      title: ctx.i18n.text('album.title'),
      text: ctx.i18n.text('album.text'),
      hint: ctx.i18n.text('album.hint'),
    });
    const s = new Shared(ctx);
    S = s;
    // EMI-07 first: the station challenges register with their EMI. It lives in the detail tier:
    // invisible (and free) beyond 45 m
    s.emi = ctx.emi.spawn({ unit: 'EMI-07', position: [3, 0, 12], yawDeg: 15, parent: ctx.groups.detail });
    s.sfx = createSfx(ctx);
    s.cine = installCine(s);
    buildEntrance(s);
    show = buildShowroom(s);
    line = buildLine(s);
    cell = buildMesszelle(s, line);
    audit = buildAudit(s, line, cell);
    buildFar(ctx);
    greeted = ctx.progress.get('greeted', false);

    // ── station labels (DOM, fade with distance) ───────────────────────────
    ctx.hud.worldLabel([-7, 2.2, 1.3], ctx.i18n.text('vorfuehrung.title'), { eyebrow: ctx.i18n.text('eyebrowA'), maxDistance: 16 });
    ctx.hud.worldLabel(cell.handleObject, ctx.i18n.text('unter-last.title'), { eyebrow: ctx.i18n.text('eyebrowB'), offsetY: 1.1, maxDistance: 16, kind: 'accent' });
    // D40: in Entdecker mode C is a side station: a grey (muted) label that says so; its stars still count
    ctx.hud.worldLabel([6, 1.95, 6], ctx.i18n.text('drei-auditoren.title'), { eyebrow: () => ctx.t(ctx.mode === 'entdecker' ? 'eyebrowCside' : 'eyebrowC'), maxDistance: 14, kind: ctx.mode === 'entdecker' ? 'muted' : 'default' });

    // ── EMI-07 ──────────────────────────────────────────────────────────────
    const emi = s.emi;
    emi.onAsk(() => {
      const key = !ctx.pass.has('vorfuehrung') && !s.shutterOpen ? 'emi.ask.a' : !ctx.pass.has('unter-last') ? 'emi.ask.b' : !ctx.pass.has('drei-auditoren') ? 'emi.ask.c' : 'emi.ask.done';
      void emi.say(ctx.i18n.text(key));
      void emi.gesture('point');
    });

    // ── the reveal: spots die → Rolltor rises → hall floods → the real line starts ──
    const reveal = (from: 'switch' | 'terminal' | 'instant'): void => {
      if (s.shutterOpen || !line || !show) return;
      if (from === 'instant') {
        line.openShutter(true);
        show.lightsOut(true);
        return;
      }
      const ln = line,
        sh = show;
      if (s.operating === 'terminal') from = 'terminal';
      s.inBeat = true;
      if (s.operating) s.exitOp?.();
      if (ctx.pass.has('vorfuehrung')) s.say('emi.reveal');
      const start: [number, number, number][] =
        from === 'terminal'
          ? [
              [-5.4, 2.55, 2.0],
              [-6.4, 4.4, -8],
            ]
          : [
              [0.6, 1.75, 4.2],
              [0.2, 1.6, -2],
            ];
      s.cine(
        [
          { t: 0, pos: start[0], look: start[1] },
          { t: 1.7, pos: [-4.0, 2.25, -0.8], look: [3.0, 1.8, -4.6] },
          { t: 6.2, pos: [-3.3, 2.15, -2.8], look: [4.5, 1.6, -5.0] },
        ],
        {
          fromPose: from === 'terminal',
          events: [
            { t: 0.35, fn: () => ln.openShutter() },
            { t: 0.6, fn: () => sh.lightsOut() },
            { t: 5.0, fn: () => s.say('emi.shutter', undefined, 'point') },
            {
              t: 6.1,
              fn: () => {
                // hand the camera back facing the next step: the Messzelle's push handle (from the
                // switch the open shutter is edge-on and the partition column filled the view)
                const pl = ctx.player.positionLocal();
                const [hx, , hz] = s.targets.handle;
                const yaw = THREE.MathUtils.radToDeg(Math.atan2(-(hx - pl.x), -(hz - pl.z)));
                ctx.player.teleport([pl.x, 0, pl.z], { yawDeg: yaw, pitchDeg: -2 });
              },
            },
          ],
          onDone: () => {
            s.inBeat = false;
            void emi.driveTo([2.4, 0, 4.4]);
            s.refreshObjective();
          },
        },
      );
    };
    s.reveal = reveal;
    ctx.addInteractable({
      object: line.shutterButton,
      label: ctx.i18n.text('ia.shutter'),
      hint: ctx.i18n.text('ia.shutterHint'),
      range: 2.6,
      isEnabled: () => !s.shutterOpen,
      onInteract: () => reveal('switch'),
    });
    if (ctx.progress.get('shutter', false)) reveal('instant');
    ctx.i18n.onChange(() => s.refreshObjective());
    // after the island's own stamp handler (it re-asserts the route objective)
    ctx.events.on('stamp:awarded', () => ctx.after(0.1, () => s.refreshObjective()));

    // ── debug / test hooks ─────────────────────────────────────────────────
    ctx.debug.register('solve-a', () => {
      show?.solve();
      return ctx.pass.has('vorfuehrung');
    });
    ctx.debug.register('shutter', () => reveal('switch'));
    ctx.debug.register('open', () => reveal('instant'));
    ctx.debug.register('dock', () => {
      if (!s.shutterOpen) reveal('instant');
      cell?.dock();
    });
    ctx.debug.register('goto-handle', () => cell?.goToHandle());
    ctx.debug.register('solve-b', () => {
      if (!s.shutterOpen) reveal('instant');
      const r = cell!.solve();
      return { k: r.k, n: r.n, ci: r.ci.map((v) => Math.round(v * 1000) / 10), pm: Math.round(r.pm * 10) / 10, sign: [s.sign?.rowText(0), s.sign?.rowText(1)] };
    });
    ctx.debug.register('solve-c', () => {
      if (!s.shutterOpen) reveal('instant');
      if (!s.docked) cell?.dock(true);
      if (!s.lastRun) cell?.solve();
      audit?.solve();
      return { round: s.auditRound };
    });
    ctx.debug.register('album', () => show?.solveAlbum());
    ctx.debug.register('stars3-a', () => {
      show?.stars3();
      return show?.challenge.stars;
    });
    ctx.debug.register('stars3-b', () => {
      if (!s.shutterOpen) reveal('instant');
      const r = cell!.solve(true);
      return { stars: cell!.challenge.stars, k: r.k, n: r.n, sign: [s.sign?.rowText(0), s.sign?.rowText(1)] };
    });
    ctx.debug.register('stars3-c', () => {
      if (!s.shutterOpen) reveal('instant');
      if (!s.docked) cell?.dock(true);
      if (!s.lastRun) cell?.solve();
      audit?.stars3();
      return audit?.challenge.stars;
    });

    // ── Sensorkapsel (FUN-PLAN P4): backstage at the Take-Board, the album spot ──
    ctx.game.collectibles.place({ id: 'prueffeld.kapsel', position: [-5.3, 0.85, -10.8] });
    ctx.debug.register('age-terminal', () => show?.ageTerminal());
    ctx.debug.register('state', () => ({
      shutterOpen: s.shutterOpen,
      docked: s.docked,
      auditRound: s.auditRound,
      cards: s.cardsPlayed,
      sign: [s.sign?.rowText(0), s.sign?.rowText(1)],
      lastRun: s.lastRun ? { k: s.lastRun.k, n: s.lastRun.n, t: s.lastRun.settings.tempC, vib: s.lastRun.settings.vib, light: s.lastRun.settings.light, h: s.lastRun.settings.shiftH } : null,
      running: s.running,
      operating: s.operating,
    }));
    ctx.debug.register('stats', () => groupStats(ctx));
    ctx.debug.register('hide', () => (ctx.root.visible = !ctx.root.visible));
    // preset views for screenshots: player teleports (local) or a scripted camera (overview)
    const VIEWS: Record<string, { p: [number, number, number]; yaw: number; pitch: number }> = {
      gate: { p: [0, 0, 24], yaw: 0, pitch: 4 },
      stage: { p: [-6.4, 0, 6.5], yaw: 4, pitch: 12 },
      terminal: { p: [-7, 0, 3.2], yaw: 0, pitch: 8 },
      line: { p: [2.2, 0, 1.5], yaw: -38, pitch: -4 },
      dockside: { p: [5.2, 0, 1.6], yaw: -62, pitch: 2 },
      screen: { p: [3.6, 0, -2.6], yaw: -90, pitch: 4 },
      cell: { p: [6.8, 0, 14.5], yaw: -18, pitch: 2 },
      handle: { p: [10, 0, 10.5], yaw: 0, pitch: -8 },
      table: { p: [3.2, 0, 10.5], yaw: -28, pitch: -10 },
      takes: { p: [-7.6, 0, -9.3], yaw: 0, pitch: -4 },
    };
    for (const [name, v] of Object.entries(VIEWS)) ctx.debug.register(`view-${name}`, () => ctx.player.teleport(v.p, { yawDeg: v.yaw, pitchDeg: v.pitch }));
    let cine: { set(p: [number, number, number], l: [number, number, number], b?: number): void; end(): void } | null = null;
    let camPose: [[number, number, number], [number, number, number]] | null = null;
    s.onUpdate(() => {
      if (cine && camPose) cine.set(camPose[0], camPose[1], 1);
    });
    const CAMS: Record<string, [[number, number, number], [number, number, number]]> = {
      over: [[4, 17, 30], [-1, 2, -4]],
      overL: [[-20, 9, 16], [-5, 3, -5]],
      overR: [[19, 8, 14], [6, 2, -4]],
      far: [[30, 30, 95], [0, 3, 0]],
    };
    for (const [name, [p, l]] of Object.entries(CAMS))
      ctx.debug.register(`cam-${name}`, () => {
        cine?.end();
        cine = ctx.player.cinematic();
        camPose = [p, l];
        cine.set(p, l, 1);
      });
    ctx.debug.register('cam-end', () => {
      cine?.end();
      cine = null;
      camPose = null;
    });
    // Z1: hall frame, shutter housing, rails, stage, truss and the entrance in few draws; the
    // container, the roller curtain and the split-flap sign stay live (flagged noMerge)
    // (shadows stay exact: the floor lanes would self-shadow if they started casting)
    ctx.mergeStatic(ctx.groups.exterior);
  },

  onEnter(ctx) {
    const s = S;
    if (!s) return;
    if (!greeted) {
      greeted = true;
      ctx.progress.set('greeted', true);
      void s.emi?.gesture('wave');
      // the zone's request (plan §3.2): the island's need in ≤ 12 words
      s.say('request');
      // the engine toasts newly awarded question cards (with the questions)
      ctx.after(2.2, () => {
        ctx.pass.awardQuestion(1);
        ctx.pass.awardQuestion(3);
      });
    } else {
      // the cards are always handed out on arrival (also after a progress reset)
      ctx.pass.awardQuestion(1);
      ctx.pass.awardQuestion(3);
    }
    // cards played on any later visit count: A re-evaluates its stars, and cards won elsewhere are announced
    show?.reevaluate();
    s.refreshObjective();
  },

  onExit(ctx) {
    ctx.hud.setObjective(null);
  },

  update(dt, ctx) {
    S?.update(dt, ctx.time.elapsed);
  },

  fixedUpdate(dt) {
    S?.fixedUpdate(dt);
  },

  updateFar() {
    S?.updateFar();
  },

  dispose() {
    S = null;
    show = null;
    line = null;
    cell = null;
    audit = null;
    greeted = false;
  },
});

/** Far tier (> 130 m): one merged silhouette + the sign face. */
function buildFar(ctx: ZoneContext): void {
  const far = ctx.groups.far;
  const p = new Painter()
    .box(10, 0.4, 8, [-7, 0.2, -4], 0xe7e5e4)
    .box(10.8, 4.9, 0.3, [-5.95, 2.85, -8.5], 0x1c1917)
    .box(0.34, 8.6, 0.34, [-12.8, 4.3, -8], 0x8a8580)
    .box(0.34, 8.6, 0.34, [-1.2, 4.3, -8], 0x8a8580)
    .box(11.9, 0.34, 0.34, [-7, 8.7, -8], 0x8a8580)
    .box(8.4, 1.78, 0.34, [-7, 7.09, -8], 0x0c0a09)
    .box(0.3, 6, 14, [0, 3, -5], 0x2b2826)
    .box(0.26, 7.4, 0.26, [0.45, 3.7, -11.3], 0x1c1917)
    .box(0.26, 7.4, 0.26, [13.25, 3.7, -11.3], 0x1c1917)
    .box(0.26, 7.4, 0.26, [0.45, 3.7, 2.8], 0x1c1917)
    .box(0.26, 7.4, 0.26, [13.25, 3.7, 2.8], 0x1c1917)
    .box(13, 0.36, 0.26, [6.85, 7.3, -11.3], 0x1c1917)
    .box(13, 0.36, 0.26, [6.85, 7.3, 2.8], 0x1c1917)
    .box(CELL.w, CELL.h, CELL.len, [CELL.x, CELL.h / 2, ctx.progress.get('docked', false) ? CELL.dockZ : CELL.parkZ], 0x292929);
  far.add(p.mesh(ctx.materials.standard({ vertexColors: true, roughness: 0.6, metalness: 0.3 }), { receive: false }));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 1.3), ctx.materials.basic(0xd6d3d1));
  face.position.set(-7, 7.1, -7.82);
  far.add(face);
}

/** Debug: draw-call / triangle estimate per detail tier (visible meshes, instanced = 1). */
function groupStats(ctx: ZoneContext): Record<string, { meshes: number; tris: number }> {
  const out: Record<string, { meshes: number; tris: number }> = {};
  const count = (o: THREE.Object3D): { meshes: number; tris: number } => {
    let meshes = 0,
      tris = 0;
    o.traverseVisible((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      meshes++;
      const g = m.geometry;
      const n = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
      const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
      tris += n * inst;
    });
    return { meshes, tris: Math.round(tris) };
  };
  out.detail = count(ctx.groups.detail);
  out.exterior = count(ctx.groups.exterior);
  out.far = count(ctx.groups.far);
  const rootOnly = { meshes: 0, tris: 0 };
  for (const c of ctx.root.children) {
    if (c === ctx.groups.detail || c === ctx.groups.exterior || c === ctx.groups.far) continue;
    const r = count(c);
    rootOnly.meshes += r.meshes;
    rootOnly.tris += r.tris;
  }
  out.root = rootOnly;
  return out;
}
