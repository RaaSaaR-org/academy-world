/**
 * A Kurzlauf stand (plan §1.4, §4.9 „Schaufenster“, D41): a console in the shop window that plays a
 * recorded run of a real station in short steps, then hands over its Befundkarte. The watching rule
 * [C2 M6] holds: every playback stretch is ≤ 10 s and marked with ctx.game.unattended, a tap starts
 * the next one, Space jumps to the end of a stretch, and a second viewing runs at 2×.
 *
 * The screen is one canvas (one draw) on the console; E opens the operate view in front of it with
 * the step panel (≤ 35 words).
 */
import * as THREE from 'three';
import type { ChipType, Text, ZoneContext } from '@/core/zones';
import { canvasTex, FONT, type CanvasTex } from '../geo';
import { fitText, INK, para, plate } from '../look';
import { el, ensureCss } from '../ui';
import type { Befund, Befunde } from '../befund';
import { zs } from '../sheet';

export interface StandStep {
  /** panel line for the step (≤ 25 words) */
  text: Text;
  /** playback seconds (≤ 10, watching rule); 0 = a still that waits for the button */
  seconds: number;
  /** the button that starts this step (absent: the step starts by itself after the previous) */
  button?: Text;
  draw(g: CanvasRenderingContext2D, w: number, h: number, k: number): void;
  /** per-frame work while the step plays (k 0…1) and once at its end (k = 1) */
  tick?(k: number, dt: number): void;
  /** a step that asks: buttons with their answers; the step continues on any */
  ask?: { label: Text; right?: boolean }[];
  /** input is offered while it plays (e.g. click a duck to follow it): not an unattended stretch */
  attended?: boolean;
  /** the playback halts at these points (k) until you tap — a call for help, a choice */
  pauses?: { at: number; text: Text; button: Text }[];
}

export interface StandDef {
  key: 'belohnung' | 'erntetag' | 'traumdaten';
  eyebrow: Text;
  title: Text;
  /** the chip of the data (SIM · AUFZEICHNUNG, ILLUSTRATIV while a provisional file stands in) */
  chip(): ChipType;
  load(): Promise<void>;
  steps(): StandStep[];
  befund(): Befund;
  /** the idle screen (before E) */
  idle(g: CanvasRenderingContext2D, w: number, h: number): void;
  enter?(): void;
  exit?(): void;
  /** a click on the 3D view while the stand is open (zone-local ray) */
  pointer?(origin: THREE.Vector3, direction: THREE.Vector3): void;
}

export interface Stand {
  readonly key: StandDef['key'];
  open(): void;
  /**
   * the Schaufenster bot (tools): play every step at `speed`, read each still for `readS` seconds, answer
   * every question right, read the Befundkarte and close it
   */
  runAll(o?: { speed?: number; readS?: number }): Promise<void>;
  close(): void;
  readonly done: boolean;
  readonly playing: boolean;
  update(dt: number): void;
}

export function buildStand(ctx: ZoneContext, def: StandDef, screen: { at: THREE.Vector3; w: number; h: number }, befunde: Befunde): Stand {
  const tex: CanvasTex = canvasTex(640, 292, { mips: false });
  const geo = new THREE.PlaneGeometry(screen.w, screen.h);
  // the screens face north (−z), into the hall
  geo.rotateY(Math.PI).translate(screen.at.x, screen.at.y, screen.at.z - 0.03);
  const mat = new THREE.MeshBasicMaterial({ map: tex.tex, name: `schauhalle:kurzlauf-${def.key}` });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `schauhalle:kurzlauf-${def.key}`;
  mesh.matrixAutoUpdate = false;
  ctx.groups.detail.add(mesh);
  ctx.onDispose(() => {
    geo.dispose();
    mat.dispose();
    tex.tex.dispose();
  });

  let done = ctx.progress.get<boolean>(`kurzlauf.${def.key}`, false);
  let views = done ? 1 : 0;
  let loaded: Promise<void> | null = null;
  let steps: StandStep[] = [];
  let i = -1;
  let k = 0;
  let playing = false;
  let host: HTMLElement | null = null;
  let redrawT = 0;
  /** the bot: its speed and reading time (null: a person plays) */
  let bot: { speed: number; readS: number } | null = null;
  let resolveRun: (() => void) | null = null;
  let exitFn: (() => void) | null = null;
  /** halted at a pause of the playing step (its index), null while running */
  let halted: number | null = null;
  let pauseIx = 0;

  const drawIdle = (): void => {
    const { g, w, h } = tex;
    g.save();
    def.idle(g, w, h);
    g.restore();
    tex.tex.needsUpdate = true;
  };
  const drawStep = (): void => {
    const s = steps[i];
    if (!s) return;
    const { g, w, h } = tex;
    g.save();
    s.draw(g, w, h, k);
    g.restore();
    tex.tex.needsUpdate = true;
  };
  drawIdle();
  ctx.i18n.onChange(() => (i >= 0 ? drawStep() : drawIdle()));
  void (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(() => (i >= 0 ? drawStep() : drawIdle()));

  // the stands replay recordings: 2× from the first viewing (plan §4 watching rule), Space jumps
  const speed = (): number => (bot ? bot.speed : 2);

  const render = (): void => {
    if (!host) return;
    ensureCss();
    const L = ctx.i18n.lang;
    const R = (t: Text): string => ctx.i18n.resolve(t);
    const root = el('div', { class: 'sh' });
    root.appendChild(el('div', { class: 'eyebrow' }, R(def.eyebrow)));
    root.appendChild(el('h3', null, R(def.title)));
    const dots = el('div', { class: 'steps' });
    steps.forEach((_, j) => dots.appendChild(el('i', { class: j <= i ? 'on' : '' })));
    root.appendChild(dots);
    const s = steps[i];
    // the step's numbers come from the stand's recording: its chip (in the button row) covers them
    const chipped = { class: 'line', 'data-chip': def.chip() };
    if (!loaded || !steps.length) {
      root.appendChild(el('div', { class: 'line' }, '…'));
    } else if (i < 0) {
      root.appendChild(el('div', chipped, R(steps[0].text)));
    } else if (s) root.appendChild(el('div', chipped, R(s.text)));
    const btns = el('div', { class: 'btns' });
    const pz = s && halted !== null ? s.pauses?.[halted] : null;
    if (pz) root.appendChild(el('div', { class: 'say', 'data-chip': def.chip() }, R(pz.text)));
    if (steps.length) {
      if (pz) btns.appendChild(el('button', { class: 'btn small primary', onclick: () => resume() }, R(pz.button)));
      else if (playing) btns.appendChild(el('button', { class: 'btn small ghost', onclick: () => skip() }, L === 'en' ? 'Skip [Space]' : 'Vorspulen [Leertaste]'));
      else if (s?.ask && k >= 1 && !(s as StandStep & { answered?: boolean }).answered)
        for (const a of s.ask)
          btns.appendChild(
            el(
              'button',
              {
                class: 'btn small',
                onclick: () => {
                  (s as StandStep & { answered?: boolean }).answered = true;
                  ctx.game.juice.cue(a.right ? 'good' : 'oops');
                  advance();
                },
              },
              R(a.label),
            ),
          );
      else if (i + 1 < steps.length) btns.appendChild(el('button', { class: 'btn small primary', onclick: () => advance() }, R(steps[i + 1].button ?? (L === 'en' ? 'Next' : 'Weiter'))));
      else btns.appendChild(el('button', { class: 'btn small primary', onclick: () => void openBefund() }, zs(L, 'lh.befund')));
    }
    btns.appendChild(ctx.ui.chip(def.chip()));
    root.appendChild(btns);
    host.replaceChildren(root);
  };

  const begin = (j: number): void => {
    i = j;
    k = 0;
    const s = steps[i];
    playing = !!s && s.seconds > 0;
    halted = null;
    pauseIx = 0;
    if (playing && !s.attended) ctx.game.unattended(true, `schauhalle:${def.key}:${i}`);
    drawStep();
    render();
    // the bot reads a still, then goes on
    if (bot && !playing) ctx.after(bot.readS, () => advance());
  };
  const resume = (): void => {
    if (halted === null) return;
    ctx.audio.play('click');
    ctx.game.juice.cue('tick');
    halted = null;
    pauseIx++;
    if (!steps[i]?.attended) ctx.game.unattended(true, `schauhalle:${def.key}:${i}`);
    render();
  };
  const endPlayback = (): void => {
    if (!playing) return;
    playing = false;
    halted = null;
    k = 1;
    steps[i]?.tick?.(1, 0);
    if (!steps[i]?.attended) ctx.game.unattended(false);
    drawStep();
    render();
    if (bot) ctx.after(bot.readS * 0.5, () => advance());
  };
  const skip = (): void => {
    if (playing) {
      ctx.audio.play('click');
      endPlayback();
    }
  };
  const advance = (): void => {
    if (playing) return;
    const s = steps[i];
    if (s?.ask && !(s as StandStep & { answered?: boolean }).answered) {
      if (!bot) return;
      (s as StandStep & { answered?: boolean }).answered = true;
      ctx.game.juice.cue('good');
    }
    if (i + 1 < steps.length) {
      ctx.audio.play('click');
      begin(i + 1);
    } else void openBefund();
  };
  const openBefund = async (): Promise<void> => {
    if (!done) {
      done = true;
      ctx.progress.set(`kurzlauf.${def.key}`, true);
    }
    views++;
    ctx.events.emit('schauhalle:kurzlauf', { key: def.key, done: true });
    const r = resolveRun;
    resolveRun = null;
    if (bot) {
      // the bot reads the card (about 50 words), closes it and leaves the stand
      const readS = bot.readS * 2;
      ctx.after(readS, () => document.querySelector<HTMLButtonElement>('.befund .btn.primary')?.click());
      await befunde.open(def.befund());
      ctx.player.operating && host && document.querySelector<HTMLElement>('.operate-bar') && api.close();
      r?.();
      return;
    }
    await befunde.open(def.befund());
    r?.();
  };

  ctx.input.onKey(
    'Space',
    () => {
      if (host && playing) skip();
    },
    { whileOperating: true },
  );

  const ensure = (): Promise<void> =>
    (loaded ??= def
      .load()
      .then(() => {
        steps = def.steps();
      })
      .catch((err) => {
        console.warn(`[schauhalle] Kurzlauf ${def.key} failed to load`, err);
      }));

  const api: Stand = {
    key: def.key,
    open() {
      void ensure().then(() => {
        if (i < 0) begin(0);
        else render();
      });
      def.enter?.();
      const at = screen.at;
      exitFn = ctx.player.enterOperate({
        cameraPose: { position: [at.x, 1.62, at.z - 2.2], lookAt: [at.x, 1.2, at.z] },
        title: def.eyebrow,
        panel: (h) => {
          host = h;
          render();
          return () => {
            host = null;
          };
        },
        panelPosition: 'right',
        onPointer(e) {
          if (e.type === 'down' && e.button === 0) def.pointer?.(e.origin, e.direction);
        },
        onExit() {
          if (playing) endPlayback();
          bot = null;
          exitFn = null;
          i = -1;
          drawIdle();
          def.exit?.();
        },
      });
      ctx.events.emit('schauhalle:kurzlauf', { key: def.key, open: true });
    },
    async runAll(o = {}) {
      await ensure();
      bot = { speed: o.speed ?? 2, readS: o.readS ?? 4 };
      for (const st of steps) delete (st as StandStep & { answered?: boolean }).answered;
      await new Promise<void>((res) => {
        resolveRun = res;
        if (!host) api.open();
        else begin(0);
      });
      bot = null;
    },
    close() {
      exitFn?.();
    },
    get done() {
      return done;
    },
    get playing() {
      return playing;
    },
    update(dt) {
      if (!playing || halted !== null) return;
      const s = steps[i];
      if (!s) return;
      k = Math.min(1, k + (dt * speed()) / s.seconds);
      const pz = s.pauses?.[pauseIx];
      if (pz && k >= pz.at) {
        // a call: the day stops until you answer it (the bot answers after a moment)
        k = pz.at;
        halted = pauseIx;
        if (!s.attended) ctx.game.unattended(false);
        ctx.game.juice.cue('go');
        drawStep();
        render();
        if (bot) ctx.after(0.8, () => resume());
        return;
      }
      s.tick?.(k, dt);
      redrawT += dt;
      if (redrawT > 1 / 15) {
        redrawT = 0;
        drawStep();
      }
      if (k >= 1) endPlayback();
    },
  };
  return api;
}

// ── drawing helpers for the stand screens ─────────────────────────────────────

export function screenHead(g: CanvasRenderingContext2D, w: number, h: number, eyebrow: string, title: string, chip: string): void {
  plate(g, w, h);
  g.textBaseline = 'alphabetic';
  fitText(g, eyebrow, 22, 34, w - 230, 15, (px) => FONT.mono(px, 500), INK.text2);
  fitText(g, chip, w - 22, 34, 200, 13, (px) => FONT.mono(px, 500), INK.teal, 'right');
  fitText(g, title, 22, 72, w - 44, 30, (px) => FONT.display(px), INK.text);
}

/** a horizontal bar with a label, its value text and an optional Wilson band [lo, hi] (0…1) */
export function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, label: string, v: number, text: string, color: string, band?: [number, number]): void {
  g.fillStyle = INK.text2;
  g.font = FONT.mono(14, 500);
  g.textBaseline = 'alphabetic';
  g.fillText(label, x, y - 6);
  g.fillStyle = INK.line;
  g.fillRect(x, y, w, 14);
  g.fillStyle = color;
  g.fillRect(x, y, Math.max(0, Math.min(1, v)) * w, 14);
  if (band) {
    g.fillStyle = 'rgba(245,245,244,0.55)';
    g.fillRect(x + band[0] * w, y + 5, Math.max(2, (band[1] - band[0]) * w), 4);
  }
  g.fillStyle = INK.text;
  g.font = FONT.mono(14, 500);
  g.textAlign = 'right';
  g.fillText(text, x + w, y - 6);
  g.textAlign = 'left';
}

export { para, fitText, INK, FONT };
